'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DEFAULT_SETTINGS, validateSettings, validateDiagnosticIssue, validateDiagnosticReport } = require('../src/shared/contracts.cjs');
const { makeIssue } = require('../src/worker/diagnostic-policy.cjs');

test('settings preserve result page by default and require explicit opt-in to auto close', () => {
  const defaults = validateSettings({ ...DEFAULT_SETTINGS });
  assert.equal(defaults.autoCloseAfterRepair, false);
  assert.equal(defaults.autoCloseAfterRepairExplicit, false);
  assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, autoCloseAfterRepair: true }), /explicit user opt-in/);
  const optedIn = validateSettings({ ...DEFAULT_SETTINGS, autoCloseAfterRepair: true, autoCloseAfterRepairExplicit: true });
  assert.equal(optedIn.autoCloseAfterRepair, true);
});

test('all approved diagnostic categories obey their immutable policy class', () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'diagnostic-issues.json'), 'utf8'));
  for (const entry of fixture) {
    const issue = makeIssue(entry.category, entry.evidence);
    assert.equal(issue.suggestionMode, entry.expectedSuggestionMode);
    if (entry.expectedSuggestionMode === 'report-only') {
      assert.deepEqual(issue.plannedActions, []);
      assert.deepEqual(issue.writeScope, []);
    }
  }
});

test('report-only issue cannot be promoted by crafted renderer input', () => {
  const issue = makeIssue('browser-chrome-availability', ['Synthetic evidence']);
  assert.throws(() => validateDiagnosticIssue({
    ...issue,
    suggestionMode: 'suggest-repair',
    plannedActions: ['write'],
    writeScope: ['plugin cache']
  }), /report-only/);
});

test('diagnostic report schema accepts only structured approved issues', () => {
  const now = new Date();
  const report = validateDiagnosticReport({
    schemaVersion: 1,
    reportId: 'report-fixture-00000001',
    createdAt: now.toISOString(),
    engineSnapshot: { version: '3.1.1' },
    issues: [makeIssue('plugin-cache-drift', ['Synthetic drift evidence'])],
    summary: { issueCount: 1 },
    rawReportPath: null,
    expiresAt: new Date(now.getTime() + 60000).toISOString()
  });
  assert.equal(report.issues[0].category, 'plugin-cache-drift');
});
