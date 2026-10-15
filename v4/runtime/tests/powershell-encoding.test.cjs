'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { inspectPowerShellEncoding, readAsarFile, verifyPackagedEngine, fixedPaths } = require('../scripts/verify-packaged-engine.cjs');

const projectRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(projectRoot, '..', '..');
const engineRoot = path.join(projectRoot, 'engine', 'integrated-4.0.0');
const artifactsRoot = path.join(projectRoot, '.test-artifacts', 'powershell-encoding');
const accessGuardName = 'WinBridge-4.0-AccessGuard.ps1';

const listPowerShell = (directory) => fs.readdirSync(directory)
  .filter((name) => /\.ps1$/i.test(name))
  .map((name) => path.join(directory, name));

const distributedScripts = () => [
  ...listPowerShell(engineRoot),
  ...listPowerShell(path.join(projectRoot, 'scripts')),
  ...listPowerShell(repoRoot)
];

function windowsPowerShellAvailable() {
  if (process.platform !== 'win32') return false;
  const probe = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-Command', '$PSVersionTable.PSVersion.Major'], { encoding: 'utf8', windowsHide: true });
  return probe.status === 0 && probe.stdout.trim() === '5';
}

/**
 * Runs a script block in Windows PowerShell 5.1 (powershell.exe, not pwsh)
 * and returns its JSON result. Paths travel via an environment variable and
 * output is ASCII-only JSON, so neither depends on the console code page.
 */
function runWindowsPowerShell(script, files) {
  const result = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, WB_PARSE_FILES: JSON.stringify(files) }
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

const parseHarness = String.raw`
$ErrorActionPreference = 'Stop'
$files = $env:WB_PARSE_FILES | ConvertFrom-Json
$results = foreach ($file in $files) {
  $tokens = $null; $errors = $null
  $ast = [System.Management.Automation.Language.Parser]::ParseFile($file, [ref]$tokens, [ref]$errors)
  $nonAscii = @($ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.StringConstantExpressionAst] -and $node.Value -match '[^\x00-\x7F]' }, $true) |
    ForEach-Object { [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($_.Value)) })
  [pscustomobject]@{
    file = [System.IO.Path]::GetFileName($file)
    errors = @($errors | ForEach-Object { 'L{0}: {1}' -f $_.Extent.StartLineNumber, $_.ErrorId })
    nonAsciiStrings = $nonAscii
  }
}
[pscustomobject]@{
  psVersion = $PSVersionTable.PSVersion.ToString()
  ansiCodePage = [System.Text.Encoding]::Default.CodePage
  results = @($results)
} | ConvertTo-Json -Depth 4 -Compress
`;

// Single-quoted PowerShell string literals with non-ASCII content, decoded from
// the source bytes as UTF-8. These are what the parser must reproduce exactly.
function expectedNonAsciiLiterals(file) {
  const text = fs.readFileSync(file).toString('utf8').replace(/^﻿/, '');
  return [...text.matchAll(/'((?:[^'\n]|'')*)'/g)]
    .map((match) => match[1].replace(/''/g, "'"))
    .filter((value) => /[^\x00-\x7F]/.test(value));
}

test('ASAR reader refuses entry paths that could leave the archive', () => {
  for (const segments of [['..', 'secret'], ['engine', ''], ['engine', 'a\\b'], ['engine', 'a/b'], []]) {
    assert.throws(() => readAsarFile(path.join(artifactsRoot, 'missing.asar'), segments), /entry path is invalid/);
  }
});

test('PowerShell encoding inspector accepts ASCII or BOM-marked UTF-8 and rejects ambiguous bytes', () => {
  const chinese = Buffer.from("'火绒'\n", 'utf8');
  assert.equal(inspectPowerShellEncoding(Buffer.from("Write-Output 'ok'\n")).encoding, 'ascii');
  assert.equal(inspectPowerShellEncoding(Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), chinese])).ok, true);
  assert.equal(inspectPowerShellEncoding(Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from("'火绒'", 'utf16le')])).ok, true);
  const missingBom = inspectPowerShellEncoding(chinese);
  assert.equal(missingBom.ok, false);
  assert.match(missingBom.reason, /no UTF-8 BOM/);
  assert.equal(inspectPowerShellEncoding(Buffer.from([0xEF, 0xBB, 0xBF, 0xC3, 0x28])).encoding, 'invalid-utf-8');
});

test('every distributed PowerShell script is either pure ASCII or UTF-8 with BOM', () => {
  const scripts = distributedScripts();
  assert.ok(scripts.some((file) => path.basename(file) === accessGuardName));
  const failures = scripts
    .map((file) => ({ file: path.relative(repoRoot, file), ...inspectPowerShellEncoding(fs.readFileSync(file)) }))
    .filter((result) => !result.ok);
  assert.deepEqual(failures, []);
  assert.equal(inspectPowerShellEncoding(fs.readFileSync(path.join(engineRoot, accessGuardName))).encoding, 'utf-8-bom');
});

test('repository-root Access Guard stays identical to the integrated engine copy', () => {
  const normalize = (file) => fs.readFileSync(file).toString('utf8').replace(/\r\n/g, '\n');
  assert.equal(normalize(path.join(repoRoot, accessGuardName)), normalize(path.join(engineRoot, accessGuardName)));
});

test('Windows PowerShell 5.1 parses every integrated engine script and preserves non-ASCII literals', { skip: !windowsPowerShellAvailable() && 'Windows PowerShell 5.1 (powershell.exe) is unavailable; only the byte-level encoding checks ran' }, () => {
  const scripts = listPowerShell(engineRoot);
  const report = runWindowsPowerShell(parseHarness, scripts);
  assert.match(report.psVersion, /^5\.1\./);
  for (const result of report.results) {
    assert.deepEqual(result.errors, [], `${result.file} failed to parse under Windows PowerShell ${report.psVersion} (ANSI code page ${report.ansiCodePage})`);
  }
  const guard = report.results.find((result) => result.file === accessGuardName);
  const parsed = guard.nonAsciiStrings.map((value) => Buffer.from(value, 'base64').toString('utf8'));
  const expected = expectedNonAsciiLiterals(path.join(engineRoot, accessGuardName));
  assert.ok(expected.some((value) => value.includes('火绒') && value.includes('终端安全')));
  assert.deepEqual(parsed, expected);
});

test('the BOM-less Access Guard reproduces the reported Windows PowerShell 5.1 parse failure', { skip: !windowsPowerShellAvailable() && 'Windows PowerShell 5.1 (powershell.exe) is unavailable' }, (t) => {
  fs.mkdirSync(artifactsRoot, { recursive: true });
  const withoutBom = path.join(artifactsRoot, `without-bom-${accessGuardName}`);
  fs.writeFileSync(withoutBom, fs.readFileSync(path.join(engineRoot, accessGuardName)).subarray(3));
  const report = runWindowsPowerShell(parseHarness, [withoutBom]);
  // Code pages 936 (GBK) and 65001 (system-wide UTF-8) happen to decode the
  // Chinese bytes, which is why the defect only appeared on other locales.
  if ([936, 65001].includes(report.ansiCodePage)) {
    t.skip(`ANSI code page ${report.ansiCodePage} masks the defect`);
    return;
  }
  assert.ok(report.results[0].errors.length > 0, `expected parse errors on ANSI code page ${report.ansiCodePage}`);
});

// @electron/asar is the archiver @electron/packager uses (installed through it)
// and is ESM-only, so it is loaded with a dynamic import.
const loadAsar = () => import('@electron/asar');

test('engine scripts survive ASAR packaging and extraction byte-for-byte', async () => {
  const asar = await loadAsar();
  const appRoot = path.join(artifactsRoot, 'app');
  const archive = path.join(artifactsRoot, 'app.asar');
  fs.rmSync(artifactsRoot, { recursive: true, force: true });
  fs.cpSync(engineRoot, path.join(appRoot, 'engine', 'integrated-4.0.0'), { recursive: true });
  await asar.createPackage(appRoot, archive);

  const manifest = JSON.parse(fs.readFileSync(path.join(engineRoot, 'SNAPSHOT.json'), 'utf8'));
  for (const entry of manifest.files) {
    const packaged = readAsarFile(archive, ['engine', 'integrated-4.0.0', ...entry.path.split('/')]);
    assert.ok(packaged.equals(fs.readFileSync(path.join(engineRoot, entry.path))), entry.path);
  }
  const result = verifyPackagedEngine(archive, engineRoot);
  assert.deepEqual(result.problems, []);
  assert.equal(result.files.find((file) => file.path === accessGuardName).encoding, 'utf-8-bom');
});

test('packaged engine verification rejects a BOM-less Access Guard', async () => {
  const asar = await loadAsar();
  const appRoot = path.join(artifactsRoot, 'regressed-app');
  const archive = path.join(artifactsRoot, 'regressed.asar');
  fs.rmSync(appRoot, { recursive: true, force: true });
  const packagedEngine = path.join(appRoot, 'engine', 'integrated-4.0.0');
  fs.cpSync(engineRoot, packagedEngine, { recursive: true });
  const guardPath = path.join(packagedEngine, accessGuardName);
  fs.writeFileSync(guardPath, fs.readFileSync(guardPath).subarray(3));
  await asar.createPackage(appRoot, archive);

  const result = verifyPackagedEngine(archive, engineRoot);
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((problem) => problem.startsWith(`${accessGuardName}: contains non-ASCII text but has no UTF-8 BOM`)));
  assert.ok(result.problems.some((problem) => problem.startsWith(`${accessGuardName}: packaged SHA-256`)));
});

// A package built from an older checkout is stale rather than broken;
// Pack-Windows.ps1 runs the same verifier on every fresh build.
function packagedSkipReason() {
  const { packagedAsar, sourceEngineRoot } = fixedPaths();
  if (!fs.existsSync(packagedAsar)) return 'No packaged app.asar; run npm run pack:win to validate the real package';
  const packagedManifest = readAsarFile(packagedAsar, ['engine', 'integrated-4.0.0', 'SNAPSHOT.json']);
  if (!packagedManifest.equals(fs.readFileSync(path.join(sourceEngineRoot, 'SNAPSHOT.json')))) return 'Packaged app.asar was built from a different snapshot; run npm run pack:win to refresh it';
  return false;
}

test('the built Windows package carries a verified, PowerShell 5.1 safe engine snapshot', { skip: packagedSkipReason() }, () => {
  const { packagedAsar, sourceEngineRoot } = fixedPaths();
  const result = verifyPackagedEngine(packagedAsar, sourceEngineRoot);
  assert.deepEqual(result.problems, []);
  if (!windowsPowerShellAvailable()) return;

  // Materialize the packaged scripts the way the Worker copies them into an
  // engine session, then parse those copies with Windows PowerShell 5.1.
  const sessionRoot = path.join(artifactsRoot, 'packaged-session');
  fs.rmSync(sessionRoot, { recursive: true, force: true });
  fs.mkdirSync(sessionRoot, { recursive: true });
  const extracted = result.files.filter((file) => /\.ps1$/i.test(file.path)).map((file) => {
    const target = path.join(sessionRoot, file.path);
    fs.writeFileSync(target, readAsarFile(packagedAsar, ['engine', 'integrated-4.0.0', ...file.path.split('/')]));
    return target;
  });
  const report = runWindowsPowerShell(parseHarness, extracted);
  for (const parsed of report.results) assert.deepEqual(parsed.errors, [], parsed.file);
});

test('Windows packaging verifies the packaged engine before reporting success', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
  assert.equal(packageJson.scripts['verify:package'], 'node scripts/verify-packaged-engine.cjs');
  const source = fs.readFileSync(path.join(projectRoot, 'scripts', 'Pack-Windows.ps1'), 'utf8');
  assert.match(source, /\$packagedEngineVerifier = Join-Path \$projectRoot 'scripts\\verify-packaged-engine\.cjs'/);
  const packager = source.indexOf('& node $packagerEntry');
  const verifier = source.indexOf('& node $packagedEngineVerifier');
  assert.ok(packager >= 0 && verifier > packager);
  assert.match(source, /Packaged engine verification failed/);
});
