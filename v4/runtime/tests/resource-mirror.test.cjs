'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const engineScript = path.join(projectRoot, 'engine', 'integrated-4.0.0', 'Start-WinBridge-Recovery.ps1');
const testRoot = path.join(projectRoot, '.test-artifacts', 'resource-mirror');
const windowsPowerShell = process.platform === 'win32'
  && spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-Command', '$PSVersionTable.PSVersion.Major'], { encoding: 'utf8', windowsHide: true }).stdout?.trim() === '5';
const skip = !windowsPowerShell && 'Windows PowerShell 5.1 (powershell.exe) is unavailable';

// Codex Desktop 26.1007.9446.0 declares these bundled plugins and ships no "sites" plugin.
const PLUGINS_26_1007 = ['codex-app-tools', 'browser', 'unified-computer-use', 'chrome', 'computer-use', 'latex', 'code-review', 'deep-research', 'visualize'];
const CLI_FILES = ['codex.exe', 'codex-code-mode-host.exe', 'codex-windows-sandbox-setup.exe', 'codex-command-runner.exe', 'rg.exe'];

// Loads every top-level engine function without running Invoke-Main, confines
// all engine state to the case's work directory, and replaces Get-AppxPackage
// with the fixture package. Nothing outside .test-artifacts is read or written.
const harness = String.raw`
$ErrorActionPreference = 'Stop'
$work = $env:WB_WORK
$env:USERPROFILE = Join-Path $work 'home'
$env:LOCALAPPDATA = Join-Path $work 'localappdata'
$tokens = $null; $errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($env:WB_ENGINE, [ref]$tokens, [ref]$errors)
if ($errors.Count -gt 0) { throw ($errors | Out-String) }
foreach ($definition in $ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $false)) {
  Invoke-Expression $definition.Extent.Text
}
$script:ToolVersion = '3.1.1'
$script:ToolRoot = Join-Path $work 'tool'
$script:LogPath = $null
$script:CreatedPaths = New-Object System.Collections.ArrayList
$script:SwapRecords = New-Object System.Collections.ArrayList
function Write-Host { param([Parameter(ValueFromRemainingArguments = $true)]$Ignored) }
function Get-AppxPackage {
  [pscustomobject]@{
    Name = 'OpenAI.Codex'; Version = [version]$env:WB_VERSION; Status = 'Ok'
    InstallLocation = $env:WB_PACKAGE; PackageFullName = "OpenAI.Codex_$($env:WB_VERSION)_x64__fixture"
    PackageFamilyName = 'OpenAI.Codex_fixture'; SignatureKind = 'Store'
  }
}
$result = [ordered]@{ contextError = $null; criticalFiles = @(); mirrorRoot = $null; ensureError = $null; issues = @() }
try {
  $context = Get-CurrentContext
  $result.criticalFiles = @($context.ResourceMirrorCriticalFiles | ForEach-Object { [string]$_ })
  $result.mirrorRoot = [string]$context.ResourceMirrorRoot
  if ($env:WB_MODE -eq 'ensure') {
    try { Ensure-OfficialResourcesMirror $context } catch { $result.ensureError = $_.Exception.Message }
  }
  $result.issues = @(Get-ResourceMirrorIssues $context | ForEach-Object { [string]$_ })
} catch {
  $result.contextError = $_.Exception.Message
}
'RESULT:' + ($result | ConvertTo-Json -Depth 4 -Compress)
`;

function runEngine(caseRoot, mode, version = '26.1007.9446.0') {
  const result = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(harness, 'utf16le').toString('base64')], {
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, WB_ENGINE: engineScript, WB_WORK: path.join(caseRoot, 'work'), WB_PACKAGE: path.join(caseRoot, 'package'), WB_VERSION: version, WB_MODE: mode }
  });
  const line = result.stdout.split(/\r?\n/).find((item) => item.startsWith('RESULT:'));
  assert.ok(line, `engine harness produced no result: ${result.stderr || result.stdout}`);
  const parsed = JSON.parse(line.slice('RESULT:'.length));
  for (const key of ['criticalFiles', 'issues']) parsed[key] = parsed[key] == null ? [] : [].concat(parsed[key]);
  return parsed;
}

const write = (file, content) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};

/** Builds a representative official package tree (app\resources) for one Codex release. */
function createPackage(name, { plugins = PLUGINS_26_1007, pluginVersion = '26.1007.71326', appDescriptors = [], omit = [], extraDeclared = [] } = {}) {
  const caseRoot = path.join(testRoot, name);
  assert.ok(path.resolve(caseRoot).startsWith(path.join(projectRoot, '.test-artifacts') + path.sep));
  fs.rmSync(caseRoot, { recursive: true, force: true });
  const resources = path.join(caseRoot, 'package', 'app', 'resources');
  const marketplace = path.join(resources, 'plugins', 'openai-bundled');
  const declared = [...plugins.map((id) => ({ name: id, source: { source: 'local', path: `./plugins/${id}` } })), ...extraDeclared];
  write(path.join(marketplace, '.agents', 'plugins', 'marketplace.json'), JSON.stringify({ name: 'openai-bundled', plugins: declared }, null, 2));
  for (const id of plugins) {
    const root = path.join(marketplace, 'plugins', id);
    write(path.join(root, '.codex-plugin', 'plugin.json'), JSON.stringify({ name: id, version: pluginVersion }));
    write(path.join(root, 'README.md'), `${id} ${pluginVersion}\n`);
    if (appDescriptors.includes(id)) write(path.join(root, '.app.json'), JSON.stringify({ app: id }));
  }
  write(path.join(marketplace, 'plugins', 'browser', 'scripts', 'browser-client.mjs'), `// browser ${pluginVersion}\n`);
  write(path.join(marketplace, 'plugins', 'chrome', 'scripts', 'browser-client.mjs'), `// chrome ${pluginVersion}\n`);
  write(path.join(marketplace, 'plugins', 'computer-use', 'skills', 'computer-use', 'SKILL.md'), '# computer use\n');
  write(path.join(resources, 'cua_node', 'manifest.json'), JSON.stringify({ node_path: 'bin/node.exe', node_repl_path: 'bin/node_repl.exe', node_modules: 'bin/node_modules' }));
  write(path.join(resources, 'cua_node', 'bin', 'node.exe'), 'node');
  write(path.join(resources, 'cua_node', 'bin', 'node_repl.exe'), 'node_repl');
  write(path.join(resources, 'cua_node', 'bin', 'node_modules', '@oai', 'sky', 'index.js'), 'sky');
  write(path.join(resources, 'app.asar.unpacked', 'unpacked.txt'), 'unpacked');
  write(path.join(resources, 'native', 'native.node'), 'native');
  for (const file of CLI_FILES) write(path.join(resources, file), `${file} ${pluginVersion}`);
  for (const relative of omit) fs.rmSync(path.join(resources, ...relative.split('\\')), { force: true });
  return { caseRoot, resources };
}

function treeHashes(root) {
  const hashes = {};
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else hashes[path.relative(root, full)] = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
    }
  };
  if (fs.existsSync(root)) walk(root);
  return hashes;
}

const mirrorFile = (result, relative) => path.join(result.mirrorRoot, ...relative.split('\\'));
const pluginManifest = (id) => `plugins\\openai-bundled\\plugins\\${id}\\.codex-plugin\\plugin.json`;

test('Codex 26.1007 layout without plugins\\sites\\.app.json builds and validates the mirror', { skip }, () => {
  const { caseRoot, resources } = createPackage('codex-26-1007');
  const sourceBefore = treeHashes(path.join(caseRoot, 'package'));
  const result = runEngine(caseRoot, 'ensure');
  assert.equal(result.contextError, null);
  assert.equal(result.ensureError, null);
  assert.deepEqual(result.issues, []);
  assert.ok(!result.criticalFiles.some((file) => /sites|\.app\.json$/i.test(file)), 'no resource outside the installed package is required');
  for (const id of PLUGINS_26_1007) assert.ok(result.criticalFiles.includes(pluginManifest(id)), `${id} manifest is verified`);
  // The mirror is built from the official package: every mirrored resource matches its source.
  for (const directory of ['plugins\\openai-bundled', 'cua_node', 'app.asar.unpacked', 'native']) {
    assert.deepEqual(treeHashes(mirrorFile(result, directory)), treeHashes(path.join(resources, ...directory.split('\\'))), directory);
  }
  // Read-only towards the package and the user profile.
  assert.deepEqual(treeHashes(path.join(caseRoot, 'package')), sourceBefore);
  assert.equal(fs.existsSync(path.join(caseRoot, 'work', 'home', '.codex')), false);
});

test('a layout that ships plugins\\sites\\.app.json still verifies that descriptor', { skip }, () => {
  const { caseRoot } = createPackage('with-sites', { plugins: [...PLUGINS_26_1007, 'sites'], appDescriptors: ['sites'] });
  const result = runEngine(caseRoot, 'ensure');
  assert.equal(result.ensureError, null);
  assert.ok(result.criticalFiles.includes('plugins\\openai-bundled\\plugins\\sites\\.app.json'));
  assert.ok(result.criticalFiles.includes(pluginManifest('sites')));

  // Present in the official source but missing from the mirror: a mirror defect, not a package defect.
  fs.rmSync(mirrorFile(result, 'plugins\\openai-bundled\\plugins\\sites\\.app.json'));
  assert.deepEqual(runEngine(caseRoot, 'issues').issues, ['official resources mirror file is missing: plugins\\openai-bundled\\plugins\\sites\\.app.json']);
});

test('a plugin the official manifest declares but the package lacks fails safely', { skip }, () => {
  const { caseRoot } = createPackage('declared-plugin-missing', { omit: [pluginManifest('latex')] });
  const result = runEngine(caseRoot, 'ensure');
  assert.match(result.ensureError, /^Prepared official resources mirror failed validation: official package resource is missing: plugins\\openai-bundled\\plugins\\latex\\\.codex-plugin\\plugin\.json$/);
  assert.equal(fs.existsSync(result.mirrorRoot), false, 'no mirror is installed from an incomplete package');
});

test('a mandatory repair resource missing from the official package fails safely', { skip }, () => {
  const { caseRoot } = createPackage('mandatory-missing', { omit: ['plugins\\openai-bundled\\plugins\\chrome\\scripts\\browser-client.mjs'] });
  const result = runEngine(caseRoot, 'ensure');
  // The package identity hash covers this file, so the engine refuses the package before any mirror work.
  assert.match(result.contextError, /Content-hash input is missing: .*plugins\\openai-bundled\\plugins\\chrome\\scripts\\browser-client\.mjs$/);
  assert.equal(fs.existsSync(path.join(caseRoot, 'work', 'tool', 'R')), false);
});

test('missing, truncated and corrupted mirror files are reported distinctly and repaired from the source', { skip }, () => {
  const { caseRoot, resources } = createPackage('mirror-damage');
  const built = runEngine(caseRoot, 'ensure');
  assert.equal(built.ensureError, null);
  const visualize = pluginManifest('visualize');
  const client = 'plugins\\openai-bundled\\plugins\\browser\\scripts\\browser-client.mjs';
  const skill = 'plugins\\openai-bundled\\plugins\\computer-use\\skills\\computer-use\\SKILL.md';
  fs.rmSync(mirrorFile(built, visualize));
  fs.appendFileSync(mirrorFile(built, client), 'tampered');
  const skillBytes = fs.readFileSync(mirrorFile(built, skill));
  skillBytes[0] ^= 0x01;
  fs.writeFileSync(mirrorFile(built, skill), skillBytes);
  assert.deepEqual(runEngine(caseRoot, 'issues').issues.sort(), [
    `official resources mirror file is missing: ${visualize}`,
    `official resources mirror hash mismatch: ${skill}`,
    `official resources mirror length mismatch: ${client}`
  ].sort());

  const repaired = runEngine(caseRoot, 'ensure');
  assert.equal(repaired.ensureError, null);
  assert.deepEqual(repaired.issues, []);
  assert.deepEqual(fs.readFileSync(mirrorFile(repaired, skill)), fs.readFileSync(path.join(resources, ...skill.split('\\'))));
});

test('stale or mismatched mirror metadata is detected', { skip }, () => {
  const { caseRoot } = createPackage('stale-marker');
  const built = runEngine(caseRoot, 'ensure');
  const markerPath = path.join(built.mirrorRoot, '.codex-official-resources.json');
  const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8').replace(/^﻿/, ''));
  fs.writeFileSync(markerPath, JSON.stringify({ ...marker, packageVersion: '26.1001.1.0', bundledContentHash: 'stale' }));
  assert.deepEqual(runEngine(caseRoot, 'issues').issues, [
    'official resources mirror package version is stale',
    'official resources mirror bundled plugin hash is stale'
  ]);
  fs.writeFileSync(markerPath, '{ not json');
  assert.deepEqual(runEngine(caseRoot, 'issues').issues, ['official resources mirror marker is invalid JSON']);
});

test('a Codex update that removes a bundled plugin builds a new mirror instead of reusing the old one', { skip }, () => {
  const { caseRoot } = createPackage('version-change', { plugins: [...PLUGINS_26_1007, 'sites'], appDescriptors: ['sites'], pluginVersion: '26.920.1' });
  const before = runEngine(caseRoot, 'ensure', '26.920.1000.0');
  assert.equal(before.ensureError, null);
  assert.ok(before.criticalFiles.includes('plugins\\openai-bundled\\plugins\\sites\\.app.json'));

  // The installed package is replaced by 26.1007, which no longer ships "sites".
  const caseWork = path.join(caseRoot, 'work');
  const preserved = path.join(testRoot, 'version-change-work');
  fs.rmSync(preserved, { recursive: true, force: true });
  fs.renameSync(caseWork, preserved);
  createPackage('version-change');
  fs.renameSync(preserved, caseWork);

  const after = runEngine(caseRoot, 'ensure', '26.1007.9446.0');
  assert.equal(after.ensureError, null);
  assert.deepEqual(after.issues, []);
  assert.notEqual(after.mirrorRoot, before.mirrorRoot);
  assert.ok(!after.criticalFiles.some((file) => /sites/i.test(file)));
  assert.equal(fs.existsSync(mirrorFile(after, 'plugins\\openai-bundled\\plugins\\sites')), false, 'the new mirror contains only the installed package');
});

test('unsafe or unsupported marketplace plugin sources are rejected; remote sources are not required locally', { skip }, () => {
  const traversal = createPackage('unsafe-source', { extraDeclared: [{ name: 'escape', source: { source: 'local', path: '../../outside' } }] });
  assert.match(runEngine(traversal.caseRoot, 'issues').contextError, /Official bundled marketplace manifest contains an unsafe plugin source path: \.\.\/\.\.\/outside/);

  const unknown = createPackage('unknown-source', { extraDeclared: [{ name: 'mystery' }] });
  assert.match(runEngine(unknown.caseRoot, 'issues').contextError, /unsupported source for plugin 'mystery'/);

  const remote = createPackage('remote-source', { extraDeclared: [{ name: 'hosted', source: { source: 'url', url: 'https://example.invalid/hosted.git' } }] });
  const result = runEngine(remote.caseRoot, 'ensure');
  assert.equal(result.ensureError, null);
  assert.ok(!result.criticalFiles.some((file) => /hosted/.test(file)));
});

test('the repository-root engine source and the integrated snapshot copy stay identical', () => {
  const normalize = (file) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  assert.equal(normalize(path.resolve(projectRoot, '..', '..', 'Start-WinBridge-Recovery.ps1')), normalize(engineScript));
  const source = normalize(engineScript);
  assert.doesNotMatch(source, /plugins\\openai-bundled\\plugins\\sites\\\.app\.json/);
  // Integrity checks stay in place: missing source, missing mirror file, length and hash comparisons.
  for (const check of ['official package resource is missing', 'official resources mirror file is missing', 'official resources mirror length mismatch', 'official resources mirror hash mismatch', 'Prepared official resources mirror failed validation']) {
    assert.ok(source.includes(check), check);
  }
});
