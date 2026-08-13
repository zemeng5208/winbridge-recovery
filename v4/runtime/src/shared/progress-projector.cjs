'use strict';

const { makeId, validateEngineEvent } = require('./contracts.cjs');

class ProgressProjector {
  constructor({ catchUpStep = 3 } = {}) {
    this.catchUpStep = catchUpStep;
    this.byOperation = new Map();
  }

  project(raw) {
    const previous = this.byOperation.get(raw.operationId) || {
      actualProgress: 0,
      displayedProgress: 0,
      engineStageState: 'Idle',
      presentedStageState: 'Idle',
      terminal: false
    };

    if (previous.terminal && !['Failed', 'Cancelled'].includes(raw.kind)) return null;
    const actualProgress = Math.max(previous.actualProgress, Math.min(Number(raw.actualProgress) || 0, 100));
    const finalGate = raw.kind === 'ResultReady' && raw.finalVerificationPassed === true;
    const gatedActual = actualProgress === 100 && !finalGate ? 99 : actualProgress;
    const desiredDisplayed = finalGate
      ? 100
      : Math.min(gatedActual, previous.displayedProgress + this.catchUpStep);
    const terminal = ['Failed', 'Cancelled', 'ResultReady'].includes(raw.kind);

    const event = validateEngineEvent({
      schemaVersion: 1,
      eventId: makeId('event'),
      operationId: raw.operationId,
      timestamp: new Date().toISOString(),
      kind: raw.kind,
      actualProgress: gatedActual,
      displayedProgress: Math.max(previous.displayedProgress, desiredDisplayed),
      engineStageState: raw.engineStageState || previous.engineStageState,
      presentedStageState: raw.presentedStageState || previous.presentedStageState,
      message: raw.message || '',
      finalVerificationPassed: Boolean(raw.finalVerificationPassed),
      priority: terminal ? 'terminal' : 'normal',
      details: raw.details && typeof raw.details === 'object' ? structuredClone(raw.details) : null
    });

    this.byOperation.set(raw.operationId, {
      actualProgress: event.actualProgress,
      displayedProgress: event.displayedProgress,
      engineStageState: event.engineStageState,
      presentedStageState: event.presentedStageState,
      terminal
    });
    return event;
  }

  release(operationId) {
    this.byOperation.delete(operationId);
  }
}

module.exports = { ProgressProjector };
