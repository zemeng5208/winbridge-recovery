'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const engineScript = path.join(projectRoot, 'engine', 'integrated-4.0.0', 'Start-WinBridge-Recovery.ps1');
const testRoot = path.join(projectRoot, '.test-artifacts', 'cua-runtime-key');
const windowsPowerShell = process.platform === 'win32'
  && spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-Command', '$PSVersionTable.PSVersion.Major'], { encoding: 'utf8', windowsHide: true }).stdout?.trim() === '5';
const skip = !windowsPowerShell && 'Windows PowerShell 5.1 (powershell.exe) is unavailable';

// Reference implementation of how Codex Desktop (26.1007) names and prunes its
// copied cua_node runtime under %LOCALAPPDATA%\OpenAI\Codex\runtimes\cua_node:
// key = first 16 hex of SHA-256 over "<name>\0<sha256 hex>\0" for these names;
// on startup every other 16-hex directory holding the executable is removed.
const DESKTOP_RUNTIME_ENTRIES = ['manifest.json', 'bin/node.exe', 'bin/node_repl.exe'];
const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
function desktopRuntimeKey(cuaRoot) {
  const hash = crypto.createHash('sha256');
  for (const name of DESKTOP_RUNTIME_ENTRIES) {
    hash.update(name).update('\0').update(sha256(fs.readFileSync(path.join(cuaRoot, ...name.split('/'))))).update('\0');
  }
  return hash.digest('hex').slice(0, 16);
}
function desktopPruneRuntimes(runtimesRoot, currentKey, executable = path.join('bin', 'node_repl.exe')) {
  for (const entry of fs.readdirSync(runtimesRoot, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name !== currentKey && /^[0-9a-f]{16}$/.test(entry.name) && fs.existsSync(path.join(runtimesRoot, entry.name, executable))) {
      fs.rmSync(path.join(runtimesRoot, entry.name), { recursive: true, force: true });
    }
  }
}

const write = (file, content) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};

function createPackage(name) {
  const caseRoot = path.join(testRoot, name);
  assert.ok(path.resolve(caseRoot).startsWith(path.join(projectRoot, '.test-artifacts') + path.sep));
  fs.rmSync(caseRoot, { recursive: true, force: true });
  const resources = path.join(caseRoot, 'package', 'app', 'resources');
  const marketplace = path.join(resources, 'plugins', 'openai-bundled');
  write(path.join(marketplace, '.agents', 'plugins', 'marketplace.json'), JSON.stringify({ name: 'openai-bundled', plugins: ['browser', 'chrome', 'computer-use'].map((id) => ({ name: id, source: { source: 'local', path: `./plugins/${id}` } })) }));
  for (const id of ['browser', 'chrome', 'computer-use']) write(path.join(marketplace, 'plugins', id, '.codex-plugin', 'plugin.json'), JSON.stringify({ name: id, version: '26.1007.71326' }));
  write(path.join(marketplace, 'plugins', 'browser', 'scripts', 'browser-client.mjs'), '// browser');
  write(path.join(marketplace, 'plugins', 'chrome', 'scripts', 'browser-client.mjs'), '// chrome');
  write(path.join(marketplace, 'plugins', 'computer-use', 'skills', 'computer-use', 'SKILL.md'), '# cu');
  // The official 26.1007 cua_node manifest uses forward slashes.
  write(path.join(resources, 'cua_node', 'manifest.json'), JSON.stringify({ node_path: 'bin/node.exe', node_repl_path: 'bin/node_repl.exe', node_modules: 'bin/node_modules' }, null, 2));
  write(path.join(resources, 'cua_node', 'bin', 'node.exe'), 'node binary');
  write(path.join(resources, 'cua_node', 'bin', 'node_repl.exe'), 'node_repl binary');
  write(path.join(resources, 'cua_node', 'bin', 'node_modules', '@oai', 'sky', 'index.js'), 'sky');
  for (const file of ['codex.exe', 'codex-code-mode-host.exe', 'codex-windows-sandbox-setup.exe', 'codex-command-runner.exe', 'rg.exe']) write(path.join(resources, file), file);
  return { caseRoot, resources };
}

// Runs the real Get-CurrentContext against a package directory, with
// Get-AppxPackage replaced and the profile redirected into the case folder.
function engineContext(caseRoot, installLocation) {
  const script = String.raw`
$ErrorActionPreference = 'Stop'
$env:USERPROFILE = Join-Path $env:WB_WORK 'home'
$env:LOCALAPPDATA = Join-Path $env:WB_WORK 'localappdata'
$tokens = $null; $errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($env:WB_ENGINE, [ref]$tokens, [ref]$errors)
foreach ($definition in $ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $false)) { Invoke-Expression $definition.Extent.Text }
$script:ToolRoot = Join-Path $env:WB_WORK 'tool'
function Get-AppxPackage { [pscustomobject]@{ Version = [version]'26.1007.9446.0'; Status = 'Ok'; InstallLocation = $env:WB_PACKAGE; PackageFullName = 'OpenAI.Codex_fixture'; PackageFamilyName = 'OpenAI.Codex_fixture'; SignatureKind = 'Store' } }
$context = Get-CurrentContext
'RESULT:' + ([ordered]@{ cuaContentHash = $context.CuaContentHash; safeRuntimeRoot = $context.SafeRuntimeRoot; localAppData = $env:LOCALAPPDATA; resourceMirrorKey = $context.ResourceMirrorKey } | ConvertTo-Json -Compress)
`;
  const run = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
    encoding: 'utf8', windowsHide: true,
    env: { ...process.env, WB_ENGINE: engineScript, WB_WORK: path.join(caseRoot, 'work'), WB_PACKAGE: installLocation }
  });
  const line = run.stdout.split(/\r?\n/).find((item) => item.startsWith('RESULT:'));
  assert.ok(line, `engine produced no context: ${run.stderr || run.stdout}`);
  return JSON.parse(line.slice('RESULT:'.length));
}

test('the safe cua_node runtime uses the same directory key as Codex Desktop', { skip }, () => {
  const { caseRoot, resources } = createPackage('fixture');
  const context = engineContext(caseRoot, path.join(caseRoot, 'package'));
  const desktopKey = desktopRuntimeKey(path.join(resources, 'cua_node'));
  assert.equal(context.cuaContentHash.slice(0, 16), desktopKey);
  assert.equal(context.safeRuntimeRoot, path.join(context.localAppData, 'OpenAI', 'Codex', 'runtimes', 'cua_node', context.cuaContentHash));
  assert.match(context.resourceMirrorKey, new RegExp(`-n${desktopKey.slice(0, 8)}$`));
});

test("Desktop's startup cleanup keeps the safe runtime and still removes foreign runtime copies", { skip }, () => {
  const { caseRoot, resources } = createPackage('cleanup');
  const context = engineContext(caseRoot, path.join(caseRoot, 'package'));
  const runtimesRoot = path.join(caseRoot, 'runtimes', 'cua_node');
  const safe = path.join(runtimesRoot, context.cuaContentHash);
  // The key the engine computed before this fix (backslash-separated names).
  const legacyHash = crypto.createHash('sha256');
  for (const name of ['manifest.json', 'bin\\node.exe', 'bin\\node_repl.exe']) {
    legacyHash.update(name).update('\0').update(sha256(fs.readFileSync(path.join(resources, 'cua_node', ...name.split(/[\\/]/))))).update('\0');
  }
  const legacy = path.join(runtimesRoot, legacyHash.digest('hex').slice(0, 16));
  for (const root of [safe, legacy]) fs.cpSync(path.join(resources, 'cua_node'), root, { recursive: true });
  assert.notEqual(path.basename(legacy), path.basename(safe));

  desktopPruneRuntimes(runtimesRoot, desktopRuntimeKey(path.join(resources, 'cua_node')));
  assert.equal(fs.existsSync(path.join(safe, 'bin', 'node_repl.exe')), true, 'the engine-prepared runtime survives Desktop startup');
  assert.equal(fs.existsSync(legacy), false, 'a runtime under the old key is what Desktop deleted');
});

const installedPackage = (() => {
  if (!windowsPowerShell) return null;
  const probe = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-Command', '(Get-AppxPackage OpenAI.Codex | Sort-Object Version -Descending | Select-Object -First 1).InstallLocation'], { encoding: 'utf8', windowsHide: true });
  const location = probe.stdout.trim();
  return location && fs.existsSync(path.join(location, 'app', 'resources', 'cua_node', 'manifest.json')) ? location : null;
})();

test('against the installed official package the engine key equals Desktop\'s runtime key', { skip: skip || (!installedPackage && 'OpenAI.Codex is not installed; the fixture covers this case') }, () => {
  const caseRoot = path.join(testRoot, 'installed');
  fs.rmSync(caseRoot, { recursive: true, force: true });
  const context = engineContext(caseRoot, installedPackage);
  assert.equal(context.cuaContentHash.slice(0, 16), desktopRuntimeKey(path.join(installedPackage, 'app', 'resources', 'cua_node')));
});

test('the repository-root engine source and the integrated snapshot copy stay identical', () => {
  const normalize = (file) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  assert.equal(normalize(path.resolve(projectRoot, '..', '..', 'Start-WinBridge-Recovery.ps1')), normalize(engineScript));
});
