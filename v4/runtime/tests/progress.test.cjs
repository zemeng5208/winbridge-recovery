'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ProgressProjector } = require('../src/shared/progress-projector.cjs');

test('displayed progress is monotonic and never exceeds trusted actual progress', () => {
  const projector = new ProgressProjector({ catchUpStep: 4 });
  const first = projector.project({ operationId: 'operation-0001', kind: 'Progress', actualProgress: 30, engineStageState: 'Scan', presentedStageState: 'Diagnosing' });
  const stale = projector.project({ operationId: 'operation-0001', kind: 'Progress', actualProgress: 12, engineStageState: 'Scan', presentedStageState: 'Diagnosing' });
  assert.equal(first.actualProgress, 30);
  assert.equal(first.displayedProgress, 4);
  assert.equal(stale.actualProgress, 30);
  assert.ok(stale.displayedProgress >= first.displayedProgress);
  assert.ok(stale.displayedProgress <= stale.actualProgress);
});

test('100 percent is impossible without ResultReady and final verification', () => {
  const projector = new ProgressProjector({ catchUpStep: 100 });
  const blocked = projector.project({ operationId: 'operation-0002', kind: 'Progress', actualProgress: 100, engineStageState: 'Verify', presentedStageState: 'Verifying' });
  assert.equal(blocked.actualProgress, 99);
  assert.equal(blocked.displayedProgress, 99);
  const complete = projector.project({ operationId: 'operation-0002', kind: 'ResultReady', actualProgress: 100, engineStageState: 'ResultReady', presentedStageState: 'ResultReady', finalVerificationPassed: true });
  assert.equal(complete.actualProgress, 100);
  assert.equal(complete.displayedProgress, 100);
  assert.equal(complete.priority, 'terminal');
});

test('failure and cancellation are terminal priority and block later normal events', () => {
  const projector = new ProgressProjector();
  const failed = projector.project({ operationId: 'operation-0003', kind: 'Failed', actualProgress: 25, engineStageState: 'Failed', presentedStageState: 'Failed', message: 'fixture failure' });
  assert.equal(failed.priority, 'terminal');
  assert.equal(projector.project({ operationId: 'operation-0003', kind: 'Progress', actualProgress: 50 }), null);
});
