'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const engineScript = path.join(projectRoot, 'engine', 'integrated-4.0.0', 'Start-WinBridge-Recovery.ps1');
const testRoot = path.join(projectRoot, '.test-artifacts', 'cli-validation');
const windowsPowerShell = process.platform === 'win32'
  && spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-Command', '$PSVersionTable.PSVersion.Major'], { encoding: 'utf8', windowsHide: true }).stdout?.trim() === '5';
const skip = !windowsPowerShell && 'Windows PowerShell 5.1 (powershell.exe) is unavailable';
const VERSION = '26.1007.71326';

// Output of the official codex-cli 0.162.0-alpha.17.2 (Codex Desktop
// 26.1007.9446.0), recorded against isolated fixture homes.
const CLI_LISTED = [
  'Marketplace `openai-bundled`',
  'X:\\fixture\\.codex\\.tmp\\bundled-marketplaces\\openai-bundled\\.agents\\plugins\\marketplace.json',
  '',
  'PLUGIN                               STATUS              VERSION        SOURCE',
  'codex-app-tools@openai-bundled       not installed                      X:\\fixture\\plugins\\codex-app-tools',
  `browser@openai-bundled               installed, enabled  ${VERSION}  X:\\fixture\\plugins\\browser`,
  `chrome@openai-bundled                installed, enabled  ${VERSION}  X:\\fixture\\plugins\\chrome`,
  `computer-use@openai-bundled          installed, enabled  ${VERSION}  X:\\fixture\\plugins\\computer-use`
];
const CLI_JUNCTION_SOURCE = ['No marketplace plugins found.'];

// Loads the engine's functions (without running Invoke-Main) into an isolated
// session whose profile, CODEX_HOME and log all live under .test-artifacts.
const harnessPrelude = String.raw`
$ErrorActionPreference = 'Stop'
$work = $env:WB_WORK
$env:USERNAME = 'wbfixtureuser'
$env:USERPROFILE = Join-Path $work 'Users\wbfixtureuser'
$env:LOCALAPPDATA = Join-Path $env:USERPROFILE 'AppData\Local'
$env:APPDATA = Join-Path $env:USERPROFILE 'AppData\Roaming'
$tokens = $null; $errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($env:WB_ENGINE, [ref]$tokens, [ref]$errors)
if ($errors.Count -gt 0) { throw ($errors | Out-String) }
foreach ($definition in $ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $false)) {
  Invoke-Expression $definition.Extent.Text
}
$script:LogPath = Join-Path $work 'run.log'
function Write-Host { param([Parameter(ValueFromRemainingArguments = $true)]$Ignored) }
`;

function runHarness(name, body, extraEnv = {}) {
  const work = path.join(testRoot, name);
  assert.ok(path.resolve(work).startsWith(path.join(projectRoot, '.test-artifacts') + path.sep));
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  const script = harnessPrelude + body + "\n'RESULT:' + ($result | ConvertTo-Json -Depth 5 -Compress)\n";
  const run = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, WB_ENGINE: engineScript, WB_WORK: work, ...extraEnv }
  });
  const line = run.stdout.split(/\r?\n/).find((item) => item.startsWith('RESULT:'));
  assert.ok(line, `harness produced no result: ${run.stderr || run.stdout}`);
  const logFile = path.join(work, 'run.log');
  return { result: JSON.parse(line.slice('RESULT:'.length)), work, log: fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '' };
}

// A profile whose .codex is a junction to a relocated data directory, as on
// the reporting machine (%USERPROFILE%\.codex -> D:\CodexData\.codex).
const junctionedProfile = String.raw`
$physical = Join-Path $work 'CodexData\.codex'
$codexHome = Join-Path $env:USERPROFILE '.codex'
New-Item -ItemType Directory -Force (Join-Path $physical '.tmp\bundled-marketplaces\openai-bundled') | Out-Null
New-Item -ItemType Directory -Force $env:USERPROFILE | Out-Null
New-Item -ItemType Junction -Path $codexHome -Target $physical | Out-Null
$context = [pscustomobject]@{
  CodexHome = $codexHome
  ConfigPath = Join-Path $codexHome 'config.toml'
  ActiveMarketplace = Join-Path $codexHome '.tmp\bundled-marketplaces\openai-bundled'
  ActiveMarketplaceSource = Resolve-PhysicalDirectoryPath (Join-Path $codexHome '.tmp\bundled-marketplaces\openai-bundled')
  OfficialCliRoot = Join-Path $work 'cli'
  PluginVersions = [ordered]@{ browser = $env:WB_VERSION; chrome = $env:WB_VERSION; 'computer-use' = $env:WB_VERSION }
}
`;

test('physical path resolution follows junctions, nested junctions and missing tails', { skip }, () => {
  const { result } = runHarness('resolve', String.raw`
$real = New-Item -ItemType Directory -Force (Join-Path $work 'real\inner')
$outer = Join-Path $work 'outer'
New-Item -ItemType Junction -Path $outer -Target (Join-Path $work 'real') | Out-Null
$chain = Join-Path $work 'chain'
New-Item -ItemType Junction -Path $chain -Target $outer | Out-Null
$result = [ordered]@{
  plain = Resolve-PhysicalDirectoryPath (Join-Path $work 'real\inner')
  junction = Resolve-PhysicalDirectoryPath (Join-Path $outer 'inner')
  chained = Resolve-PhysicalDirectoryPath (Join-Path $chain 'inner\not-created\yet')
  expectedInner = (Join-Path $work 'real\inner')
}
`);
  assert.equal(result.plain, result.expectedInner);
  assert.equal(result.junction, result.expectedInner);
  assert.equal(result.chained, path.join(result.expectedInner, 'not-created', 'yet'));
});

test('registration problems distinguish an empty listing, a missing entry, a wrong state and a wrong version', { skip }, () => {
  const { result } = runHarness('problems', String.raw`
$listed = $env:WB_LISTED
$result = [ordered]@{
  ok = @('browser', 'chrome', 'computer-use' | ForEach-Object { Get-CliPluginRegistrationProblem $listed $_ $env:WB_VERSION })
  empty = Get-CliPluginRegistrationProblem 'No marketplace plugins found.' 'browser' $env:WB_VERSION
  missing = Get-CliPluginRegistrationProblem ($listed -replace '(?m)^browser@.*$', '') 'browser' $env:WB_VERSION
  disabled = Get-CliPluginRegistrationProblem ($listed -replace 'browser@openai-bundled               installed, enabled', 'browser@openai-bundled               installed, disabled') 'browser' $env:WB_VERSION
  version = Get-CliPluginRegistrationProblem $listed 'browser' '26.1008.1'
}
`, { WB_LISTED: CLI_LISTED.join('\n'), WB_VERSION: VERSION });
  assert.deepEqual(result.ok.filter(Boolean), []);
  assert.equal(result.empty, 'codex plugin list reported no marketplace plugins');
  assert.equal(result.missing, 'codex plugin list has no entry for browser@openai-bundled');
  assert.match(result.disabled, /^codex plugin list reports: browser@openai-bundled \| installed, disabled \| 26\.1007\.71326 \| /);
  assert.match(result.version, /^codex plugin list reports: browser@openai-bundled \| installed, enabled \| 26\.1007\.71326 \| /);
});

test('a relocated .codex junction makes the engine write the physical marketplace source', { skip }, () => {
  const { result } = runHarness('config-source', junctionedProfile + String.raw`
Set-TomlTable $context.ConfigPath '[marketplaces.openai-bundled]' ([ordered]@{ source = '\\?\' + [System.IO.Path]::GetFullPath($context.ActiveMarketplaceSource); source_type = 'local' })
$result = [ordered]@{
  table = Get-TomlTableText $context.ConfigPath '[marketplaces.openai-bundled]'
  physical = Join-Path $physical '.tmp\bundled-marketplaces\openai-bundled'
  profilePath = $context.ActiveMarketplace
  configOnPhysicalDisk = Test-Path -LiteralPath (Join-Path $physical 'config.toml')
}
`, { WB_VERSION: VERSION });
  // The TOML writer may escape backslashes; compare in unescaped form.
  const written = result.table.replace(/\\\\/g, '\\');
  assert.ok(written.includes(`\\\\?\\${result.physical}`), written);
  assert.ok(!written.includes(result.profilePath), 'the junction path is not written');
  assert.equal(result.configOnPhysicalDisk, true);
  const engine = fs.readFileSync(engineScript, 'utf8');
  assert.match(engine, /\$longMarketplace = '\\\\\?\\' \+ \[System\.IO\.Path\]::GetFullPath\(\$Context\.ActiveMarketplaceSource\)/);
  // Diagnosis accepts the physical source and, for compatibility, the profile path written before this fix.
  assert.match(engine, /Test-TomlTextContainsPath \$marketTable \$Context\.ActiveMarketplaceSource\) -and\s+-not \(Test-TomlTextContainsPath \$marketTable \$Context\.ActiveMarketplace\)/);
});

test('a CLI validation failure logs the command, environment, exit code and redacted output', { skip }, () => {
  const { result, log } = runHarness('diagnostics', junctionedProfile + String.raw`
New-Item -ItemType Directory -Force $context.OfficialCliRoot | Out-Null
Set-Content -LiteralPath (Join-Path $context.OfficialCliRoot 'codex.exe') -Value 'fixture'
Set-TomlTable $context.ConfigPath '[marketplaces.openai-bundled]' ([ordered]@{ source = '\\?\' + $context.ActiveMarketplace; source_type = 'local' })
$script:cliCalls = New-Object System.Collections.ArrayList
function Invoke-CliCommandCapture {
  param([string]$Cli, [string[]]$Arguments)
  [void]$script:cliCalls.Add([ordered]@{ arguments = ($Arguments -join ' '); codexHome = $env:CODEX_HOME })
  $output = @('No marketplace plugins found.', ('loaded config from ' + (Join-Path $physical 'config.toml')), 'auth token=abcd1234efgh5678 for wbfixtureuser')
  [pscustomobject]@{ ExitCode = 0; Output = $output; Text = ($output -join "` + '`n' + String.raw`") }
}
$failure = $null
try { Invoke-CliValidation $context } catch { $failure = $_.Exception.Message }
$result = [ordered]@{ error = $failure; calls = @($script:cliCalls); codexHomeAfter = $env:CODEX_HOME }
`, { WB_VERSION: VERSION });
  assert.equal(result.error, `CLI registration validation failed for browser@${VERSION}: codex plugin list reported no marketplace plugins`);
  assert.deepEqual(result.calls.map((call) => call.arguments), ['plugin list']);
  assert.ok(result.calls[0].codexHome.endsWith('\\.codex'), 'CODEX_HOME is set for the CLI');
  assert.equal(result.codexHomeAfter, null, 'CODEX_HOME is restored afterwards');

  assert.match(log, /\[ERROR\] CLI validation failed: browser@26\.1007\.71326 is not installed, enabled at the expected version: codex plugin list reported no marketplace plugins/);
  assert.match(log, /\[ERROR\] CLI command: .*\\cli\\codex\.exe plugin list/);
  assert.match(log, /\[ERROR\] CLI environment: CODEX_HOME=%USERPROFILE%\\\.codex; CODEX_HOME is a junction or link: True; working directory=/);
  assert.match(log, /\[ERROR\] Configured marketplace source: \\\\\?\\%USERPROFILE%\\\.codex\\\.tmp\\bundled-marketplaces\\openai-bundled; expected physical source: \\\\\?\\<CODEX_HOME_TARGET>\\\.tmp\\bundled-marketplaces\\openai-bundled/);
  assert.match(log, /\[ERROR\] CLI exit code: 0; output lines: 3/);
  assert.match(log, /CLI output \| No marketplace plugins found\./);
  assert.match(log, /CLI output \| loaded config from <CODEX_HOME_TARGET>\\config\.toml/);
  assert.match(log, /CLI output \| auth token=<redacted> for <user>/);
  assert.doesNotMatch(log, /wbfixtureuser|abcd1234efgh5678/);
});

test('a CLI that lists all three plugins passes validation without diagnostic noise', { skip }, () => {
  const { result, log } = runHarness('passes', junctionedProfile + String.raw`
New-Item -ItemType Directory -Force $context.OfficialCliRoot | Out-Null
Set-Content -LiteralPath (Join-Path $context.OfficialCliRoot 'codex.exe') -Value 'fixture'
function Invoke-CliCommandCapture {
  param([string]$Cli, [string[]]$Arguments)
  $output = if ($Arguments[0] -eq 'plugin') { @($env:WB_LISTED -split "` + '`n' + String.raw`") } else { @('Name       Command', 'node_repl  C:\fixture\node_repl.exe') }
  [pscustomobject]@{ ExitCode = 0; Output = $output; Text = ($output -join "` + '`n' + String.raw`") }
}
$failure = $null
try { Invoke-CliValidation $context } catch { $failure = $_.Exception.Message }
$result = [ordered]@{ error = $failure }
`, { WB_VERSION: VERSION, WB_LISTED: CLI_LISTED.join('\n') });
  assert.equal(result.error, null);
  assert.doesNotMatch(log, /CLI validation failed/);
});

// End-to-end against the official CLI shipped in the installed Codex package,
// executed read-only from WindowsApps with an isolated fixture CODEX_HOME.
const officialCli = (() => {
  if (!windowsPowerShell) return null;
  const probe = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-Command', "$p = Get-AppxPackage OpenAI.Codex | Sort-Object Version -Descending | Select-Object -First 1; if ($p) { Join-Path $p.InstallLocation 'app\\resources' }"], { encoding: 'utf8', windowsHide: true });
  const resources = probe.stdout.trim();
  return resources && fs.existsSync(path.join(resources, 'codex.exe')) ? resources : null;
})();

test('the official Codex CLI validates a junctioned CODEX_HOME once the source is physical', { skip: skip || (!officialCli && 'OpenAI.Codex is not installed; recorded CLI output covers this case') }, () => {
  const { result, log } = runHarness('official-cli', junctionedProfile + String.raw`
$resources = $env:WB_RESOURCES
$market = Join-Path $physical '.tmp\bundled-marketplaces\openai-bundled'
Remove-Item -LiteralPath $market -Recurse -Force
Copy-Item -Recurse (Join-Path $resources 'plugins\openai-bundled') $market
$versions = [ordered]@{}
foreach ($name in 'browser', 'chrome', 'computer-use') {
  $version = (Get-Content -Raw (Join-Path $market "plugins\$name\.codex-plugin\plugin.json") | ConvertFrom-Json).version
  $versions[$name] = $version
  $root = Join-Path $physical "plugins\cache\openai-bundled\$name"
  Copy-Item -Recurse (Join-Path $market "plugins\$name") (Join-Path $root $version)
  New-Item -ItemType Junction -Path (Join-Path $root 'latest') -Target (Join-Path $root $version) | Out-Null
}
$context.PluginVersions = $versions
$context.OfficialCliRoot = $resources
foreach ($name in 'browser', 'chrome', 'computer-use') { Set-TomlTable $context.ConfigPath ('[plugins."' + $name + '@openai-bundled"]') ([ordered]@{ enabled = $true }) }
Set-TomlTable $context.ConfigPath '[mcp_servers.node_repl]' ([ordered]@{ args = @(); command = (Join-Path $work 'node_repl.exe') })
$outcomes = [ordered]@{}
foreach ($case in @(@{ name = 'profilePath'; source = $context.ActiveMarketplace }, @{ name = 'physicalPath'; source = $context.ActiveMarketplaceSource })) {
  Set-TomlTable $context.ConfigPath '[marketplaces.openai-bundled]' ([ordered]@{ source = '\\?\' + $case.source; source_type = 'local' })
  try { Invoke-CliValidation $context; $outcomes[$case.name] = 'passed' } catch { $outcomes[$case.name] = $_.Exception.Message }
}
$result = $outcomes
`, { WB_RESOURCES: officialCli });
  assert.match(result.profilePath, /^CLI registration validation failed for browser@[\d.]+: codex plugin list reported no marketplace plugins$/);
  assert.equal(result.physicalPath, 'passed');
  assert.match(log, /CLI output \| No marketplace plugins found\./);
});

test('the repository-root engine source and the integrated snapshot copy stay identical', () => {
  const normalize = (file) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  assert.equal(normalize(path.resolve(projectRoot, '..', '..', 'Start-WinBridge-Recovery.ps1')), normalize(engineScript));
});
