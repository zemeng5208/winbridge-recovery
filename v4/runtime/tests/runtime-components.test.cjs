'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { mapBounded } = require('../src/worker/read-only-pool.cjs');
const { BoundedLogBuffer } = require('../src/worker/log-buffer.cjs');

const projectRoot = path.resolve(__dirname, '..');

test('real repair start is a fast acceptance request and completion arrives by event', () => {
  const source = fs.readFileSync(path.join(projectRoot, 'src', 'main', 'main.cjs'), 'utf8');
  assert.doesNotMatch(source, /REPAIR_REQUEST_TIMEOUT_MS/);
  assert.match(source, /manager\.request\('repair\.start', validateReportId\(reportId\)\)/);
  const adapter = fs.readFileSync(path.join(projectRoot, 'src', 'worker', 'engine-adapter.cjs'), 'utf8');
  assert.match(adapter, /return \{ operationId, reportId, accepted: true \};/);
  assert.match(adapter, /setInterval\(\(\) => \{[\s\S]*emitProgress\(\);[\s\S]*\}, 5000\)/);
});

test('frozen core downgrades only a remote marketplace catalog outage', () => {
  const scriptPath = path.join(projectRoot, 'engine', 'integrated-4.0.0', 'Start-WinBridge-Recovery.ps1');
  const harness = [
    "$ErrorActionPreference = 'Stop'",
    '$tokens = $null; $errors = $null',
    `$ast = [System.Management.Automation.Language.Parser]::ParseFile('${scriptPath.replace(/'/g, "''")}', [ref]$tokens, [ref]$errors)`,
    "if ($errors.Count -gt 0) { throw ($errors | Out-String) }",
    "$fn = $ast.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Test-RemoteMarketplaceCatalogFailure' }, $true)",
    "if ($null -eq $fn) { throw 'Classifier function was not found' }",
    'Invoke-Expression $fn.Extent.Text',
    "$remote = 'Warning: failed to list remote marketplace plugins: failed to parse remote plugin catalog response from https://chatgpt.com/backend-api/ps/plugins/list: EOF while parsing a value'",
    "if (-not (Test-RemoteMarketplaceCatalogFailure $remote)) { throw 'Expected remote catalog failure was rejected' }",
    "if (Test-RemoteMarketplaceCatalogFailure 'CLI registration validation failed for browser@1.2.3') { throw 'Local registration failure was incorrectly downgraded' }",
    "if (Test-RemoteMarketplaceCatalogFailure 'codex plugin list failed with access denied') { throw 'Unrelated CLI failure was incorrectly downgraded' }"
  ].join('; ');
  assert.doesNotThrow(() => execFileSync('powershell.exe', ['-NoLogo', '-NoProfile', '-Command', harness], { stdio: 'pipe' }));

  const source = fs.readFileSync(scriptPath, 'utf8');
  assert.match(source, /Invoke-CliCommandCapture \$cli @\('plugin', 'list'\)/);
  assert.match(source, /continuing with authoritative local static validation/);
  assert.match(source, /Invoke-CliValidation \$Context[\s\S]*?\$issues = @\(Get-StateIssues \$Context\)/);
});

test('support bundle export is explicit and keeps the renderer on a fixed IPC contract', () => {
  const preload = fs.readFileSync(path.join(projectRoot, 'src', 'preload', 'preload.cjs'), 'utf8');
  const main = fs.readFileSync(path.join(projectRoot, 'src', 'main', 'main.cjs'), 'utf8');
  const worker = fs.readFileSync(path.join(projectRoot, 'src', 'worker', 'engine-worker.cjs'), 'utf8');
  assert.match(preload, /supportBundleRequest\(value = \{\}\)/);
  assert.match(preload, /input\.confirmed !== true/);
  assert.match(preload, /exportSupportBundle: \(request\)/);
  assert.match(main, /IPC\.EXPORT_SUPPORT_BUNDLE/);
  assert.match(main, /shell\.showItemInFolder\(result\.path\)/);
  assert.match(worker, /case 'support\.bundle'/);
  assert.match(worker, /payload\?\.confirmed !== true/);
});

test('opening GPT cancels the owned repair tree first', () => {
  const mainSource = fs.readFileSync(path.join(projectRoot, 'src', 'main', 'main.cjs'), 'utf8');
  const workerSource = fs.readFileSync(path.join(projectRoot, 'src', 'worker', 'engine-worker.cjs'), 'utf8');
  const adapterSource = fs.readFileSync(path.join(projectRoot, 'src', 'worker', 'engine-adapter.cjs'), 'utf8');
  assert.match(workerSource, /case 'gpt\.open':[\s\S]*adapter\.cancel\(\)[\s\S]*openInstalledGPT/);
  assert.match(adapterSource, /spawnSync\('taskkill\.exe', \['\/PID', String\(child\.pid\), '\/T', '\/F'\]/);
  assert.match(mainSource, /const result = await manager\.request\('gpt\.open'\);[\s\S]*setImmediate\(\(\) => app\.quit\(\)\);[\s\S]*launcherClosing: true/);
});

test('runtime UI advances plugin evidence live and keeps post-start verification in stage five', () => {
  const source = fs.readFileSync(path.join(projectRoot, '..', 'design-lab', 'src', 'components', 'RecoveryWindow.jsx'), 'utf8');
  const mockSource = fs.readFileSync(path.join(projectRoot, '..', 'design-lab', 'src', 'lib', 'runtimeBridgeMock.js'), 'utf8');
  assert.match(source, /AwaitingDecision: 3/);
  assert.match(source, /desktopStarted \? 4/);
  assert.match(source, /\\bDesktop started\\b/);
  assert.match(source, /updatePluginStatesFromLogs\(current, entries, phase\)/);
  assert.match(source, /plugin-layers/);
  assert.match(source, /layers\.interaction/);
  // Interface copy lives in the i18n catalogs; the component references keys.
  const zhCatalog = fs.readFileSync(path.join(projectRoot, '..', 'design-lab', 'src', 'i18n', 'zh-CN.js'), 'utf8');
  const enCatalog = fs.readFileSync(path.join(projectRoot, '..', 'design-lab', 'src', 'i18n', 'en-US.js'), 'utf8');
  assert.match(source, /interaction: \{ state: "plugin\.layer\.interactionUnverified", evidence: uiMessage\("plugin\.evidence\.clientImportNotInteraction"\) \}/);
  assert.match(zhCatalog, /clientImportNotInteraction: "client import 不等于真实交互"/);
  assert.match(enCatalog, /clientImportNotInteraction: "A client import is not a real interaction"/);
  assert.match(source, /flowState === "Repairing" \? t\("stages\.detail\.repairing"\)/);
  assert.match(zhCatalog, /repairing: "修复中"/);
  assert.doesNotMatch(source, /engineStageState → presentedStageState/);
  assert.match(mockSource, /Desktop started\. Waiting for two consecutive clean reconciliation checks/);
  assert.match(mockSource, /await wait\(2200\)/);
});

test('read-only pool respects its concurrency cap and preserves result order', async () => {
  let active = 0;
  let peak = 0;
  const result = await mapBounded([1, 2, 3, 4, 5, 6], 2, async (value) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 8));
    active -= 1;
    return value * 2;
  });
  assert.equal(peak, 2);
  assert.deepEqual(result, [2, 4, 6, 8, 10, 12]);
});

test('log buffer remains bounded and reports dropped entries under backpressure', () => {
  const batches = [];
  const buffer = new BoundedLogBuffer({ maxBytes: 320, batchSize: 16, flushIntervalMs: 10000, onBatch: (batch) => batches.push(batch) });
  for (let index = 0; index < 20; index += 1) {
    buffer.push({ level: 'info', category: 'fixture', message: `entry-${index}-${'x'.repeat(60)}` });
  }
  buffer.flush();
  assert.equal(batches.length, 1);
  assert.ok(batches[0].droppedBeforeBatch > 0);
  assert.ok(batches[0].entries.length < 20);
  buffer.close();
});
