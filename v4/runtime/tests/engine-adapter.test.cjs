'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { EngineAdapter, loadCoreDiagnosisReport } = require('../src/worker/engine-adapter.cjs');
const { makeIssue } = require('../src/worker/diagnostic-policy.cjs');

const projectRoot = path.resolve(__dirname, '..');
const testRoot = path.join(projectRoot, '.test-artifacts', 'engine-adapter');

test.after(async () => {
  const resolved = path.resolve(testRoot);
  assert.ok(resolved.startsWith(path.join(projectRoot, '.test-artifacts') + path.sep));
  await fs.rm(resolved, { recursive: true, force: true });
});

test('adapter verifies frozen hashes and prepares only an isolated session copy', async () => {
  const adapter = new EngineAdapter({
    dataRoot: testRoot,
    engineRoot: path.join(projectRoot, 'engine', 'frozen-3.1.1'),
    concurrency: 2,
    onEvent: () => {}, onLog: () => {}, registerChild: () => {}, unregisterChild: () => {}
  });
  const verified = await adapter.verifySnapshot();
  assert.equal(verified.version, '3.1.1');
  assert.equal(verified.verifiedFiles, 7);
  const prepared = await adapter.prepareSession('session-fixture-0001');
  const config = await fs.readFile(path.join(prepared.sessionRoot, 'Config', 'storage.ini'), 'utf8');
  assert.match(config, /backup_root=/);
  assert.ok(config.includes(path.join(testRoot, 'backups')));
  const copied = await fs.readFile(path.join(prepared.sessionRoot, 'Start-WinBridge-Recovery.ps1'), 'utf8');
  const frozen = await fs.readFile(path.join(projectRoot, 'engine', 'frozen-3.1.1', 'Start-WinBridge-Recovery.ps1'), 'utf8');
  assert.equal(copied, frozen);
});

test('real repair stays disabled by default', async () => {
  const adapter = new EngineAdapter({
    dataRoot: testRoot,
    engineRoot: path.join(projectRoot, 'engine', 'frozen-3.1.1'),
    onEvent: () => {}, onLog: () => {}, registerChild: () => {}, unregisterChild: () => {}
  });
  await assert.rejects(() => adapter.startRepair('report-fixture-00000001'), /disabled/);
});

function makeCurrentReport({ id, expiresAt, issues }) {
  const report = {
    schemaVersion: 1,
    reportId: id,
    createdAt: new Date().toISOString(),
    engineSnapshot: { version: '3.1.1' },
    issues,
    summary: { issueCount: issues.length },
    rawReportPath: null,
    expiresAt
  };
  return report;
}

test('enabled launch capability cannot bypass current report, expiry, or category gates', async () => {
  const gatedRoot = path.join(testRoot, 'packaged-gates');
  const adapter = new EngineAdapter({
    dataRoot: gatedRoot,
    engineRoot: path.join(projectRoot, 'engine', 'frozen-3.1.1'),
    realRepairEnabled: true,
    onEvent: () => {}, onLog: () => {}, registerChild: () => {}, unregisterChild: () => {}
  });
  const currentId = 'report-packaged-gate-0001';
  adapter.currentReport = makeCurrentReport({
    id: currentId,
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    issues: [makeIssue('plugin-cache-drift', ['Synthetic drift'])]
  });
  await assert.rejects(() => adapter.startRepair('report-stale-id-000001'), /not current/);

  adapter.currentReport = makeCurrentReport({
    id: currentId,
    expiresAt: new Date(Date.now() - 60000).toISOString(),
    issues: [makeIssue('plugin-cache-drift', ['Synthetic drift'])]
  });
  await assert.rejects(() => adapter.startRepair(currentId), /expired/);

  adapter.currentReport = makeCurrentReport({
    id: currentId,
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    issues: [makeIssue('browser-chrome-availability', ['Synthetic availability evidence'])]
  });
  await assert.rejects(() => adapter.startRepair(currentId), /no approved repair suggestion/);
});

test('only a bounded validated frozen DiagnoseOnly report is accepted', async () => {
  const session = path.join(testRoot, 'core-report');
  const logs = path.join(session, 'Logs');
  await fs.mkdir(logs, { recursive: true });
  await fs.writeFile(path.join(logs, 'diagnosis-fixture.json'), JSON.stringify({
    timestamp: new Date().toISOString(),
    toolVersion: '3.1.1',
    mode: 'DiagnoseOnly',
    issues: ['Synthetic plugin cache hash mismatch']
  }), 'utf8');
  const loaded = await loadCoreDiagnosisReport(session);
  assert.equal(loaded.report.mode, 'DiagnoseOnly');

  await fs.writeFile(path.join(logs, 'diagnosis-invalid.json'), JSON.stringify({
    timestamp: new Date().toISOString(), toolVersion: '4.0', mode: 'RepairAndLaunch', issues: []
  }), 'utf8');
  const future = new Date(Date.now() + 5000);
  await fs.utimes(path.join(logs, 'diagnosis-invalid.json'), future, future);
  await assert.rejects(() => loadCoreDiagnosisReport(session), /contract is invalid/);
});
