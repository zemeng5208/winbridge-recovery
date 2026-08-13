'use strict';

const crypto = require('node:crypto');
const { DEFAULT_SOCIAL_SETTINGS, validateSocialSettings } = require('./social-contracts.cjs');

const IPC = Object.freeze({
  GET_APP_INFO: 'wb:get-app-info',
  GET_SETTINGS: 'wb:get-settings',
  SAVE_SETTINGS: 'wb:save-settings',
  GET_SYSTEM_PROFILE: 'wb:get-system-profile',
  REFRESH_SYSTEM_PROFILE: 'wb:refresh-system-profile',
  RUN_DIAGNOSIS: 'wb:run-diagnosis',
  GET_DIAGNOSIS_REPORT: 'wb:get-diagnosis-report',
  START_REPAIR: 'wb:start-repair',
  CANCEL_OPERATION: 'wb:cancel-operation',
  OPEN_LOGS: 'wb:open-logs',
  OPEN_GPT: 'wb:open-gpt',
  GET_PLUGIN_ASSETS: 'wb:get-plugin-assets',
  GET_SOCIAL_FEED: 'wb:get-social-feed',
  TRANSLATE_SOCIAL_POST: 'wb:translate-social-post',
  OPEN_SOCIAL_POST: 'wb:open-social-post',
  ENGINE_EVENT: 'wb:engine-event',
  LOG_BATCH: 'wb:log-batch'
});

const REPAIR_SUGGEST_ONLY = new Set([
  'marketplace-missing-incomplete',
  'plugin-cache-drift',
  'latest-pointer',
  'runtime-node-repl-path'
]);

const REPORT_ONLY = new Set([
  'extension-host-lock',
  'uninstall-eperm-longpath',
  'computer-use-connection',
  'browser-chrome-availability'
]);

const ALL_CATEGORIES = new Set([...REPAIR_SUGGEST_ONLY, ...REPORT_ONLY]);
const TERMINAL_STATES = new Set(['Failed', 'Cancelled', 'ResultReady']);

const DEFAULT_SETTINGS = Object.freeze({
  schemaVersion: 1,
  theme: 'system',
  reduceMotion: false,
  progressColors: ['#4A6CF7', '#8B5CF6', '#22C7A9'],
  diagnosticConcurrency: 2,
  logBatchSize: 64,
  logMemoryLimitBytes: 1048576,
  autoCloseAfterRepair: false,
  autoCloseAfterRepairExplicit: false,
  social: DEFAULT_SOCIAL_SETTINGS
});

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function assertPlainObject(value, name = 'value') {
  if (!isPlainObject(value)) throw new TypeError(`${name} must be a plain object`);
  return value;
}

function assertNoUnknownKeys(value, allowed, name) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new TypeError(`${name}.${key} is not allowed`);
  }
}

function assertString(value, name, { min = 0, max = 4096 } = {}) {
  if (typeof value !== 'string' || value.length < min || value.length > max) {
    throw new TypeError(`${name} must be a string between ${min} and ${max} characters`);
  }
  return value;
}

function assertBoolean(value, name) {
  if (typeof value !== 'boolean') throw new TypeError(`${name} must be boolean`);
  return value;
}

function assertFiniteNumber(value, name, { min = -Infinity, max = Infinity } = {}) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new TypeError(`${name} must be a finite number between ${min} and ${max}`);
  }
  return value;
}

function assertColor(value, name) {
  assertString(value, name, { min: 4, max: 9 });
  if (!/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(value)) {
    throw new TypeError(`${name} must be #RRGGBB or #RRGGBBAA`);
  }
  return value.toUpperCase();
}

function validateSettings(input) {
  assertPlainObject(input, 'settings');
  const allowed = new Set(Object.keys(DEFAULT_SETTINGS));
  assertNoUnknownKeys(input, allowed, 'settings');
  const result = { ...DEFAULT_SETTINGS, ...input, schemaVersion: 1 };

  if (!['system', 'light', 'dark'].includes(result.theme)) {
    throw new TypeError('settings.theme is invalid');
  }
  assertBoolean(result.reduceMotion, 'settings.reduceMotion');
  if (!Array.isArray(result.progressColors) || result.progressColors.length < 3 || result.progressColors.length > 5) {
    throw new TypeError('settings.progressColors must contain 3 to 5 colors');
  }
  result.progressColors = result.progressColors.map((item, index) => assertColor(item, `settings.progressColors[${index}]`));
  assertFiniteNumber(result.diagnosticConcurrency, 'settings.diagnosticConcurrency', { min: 1, max: 4 });
  assertFiniteNumber(result.logBatchSize, 'settings.logBatchSize', { min: 16, max: 128 });
  assertFiniteNumber(result.logMemoryLimitBytes, 'settings.logMemoryLimitBytes', { min: 262144, max: 4194304 });
  for (const key of ['diagnosticConcurrency', 'logBatchSize', 'logMemoryLimitBytes']) {
    if (!Number.isInteger(result[key])) throw new TypeError(`settings.${key} must be an integer`);
  }
  assertBoolean(result.autoCloseAfterRepair, 'settings.autoCloseAfterRepair');
  assertBoolean(result.autoCloseAfterRepairExplicit, 'settings.autoCloseAfterRepairExplicit');
  if (result.autoCloseAfterRepair && !result.autoCloseAfterRepairExplicit) {
    throw new TypeError('autoCloseAfterRepair requires explicit user opt-in marker');
  }
  result.social = validateSocialSettings(result.social);
  return result;
}

function validateReportId(value) {
  assertString(value, 'reportId', { min: 16, max: 128 });
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(value)) throw new TypeError('reportId has invalid characters');
  return value;
}

function validateDiagnosticIssue(value) {
  assertPlainObject(value, 'issue');
  const required = [
    'category', 'evidence', 'impact', 'plannedActions', 'risk', 'writeScope',
    'knownIssue', 'canSkip', 'requiresRestart', 'confidence', 'suggestionMode'
  ];
  assertNoUnknownKeys(value, new Set(required), 'issue');
  for (const key of required) {
    if (!(key in value)) throw new TypeError(`issue.${key} is required`);
  }
  if (!ALL_CATEGORIES.has(value.category)) throw new TypeError('issue.category is not in the approved protocol');
  if (!Array.isArray(value.evidence) || value.evidence.length === 0 || value.evidence.length > 32) {
    throw new TypeError('issue.evidence must contain 1 to 32 entries');
  }
  value.evidence.forEach((entry, index) => assertString(entry, `issue.evidence[${index}]`, { min: 1, max: 2048 }));
  assertString(value.impact, 'issue.impact', { min: 1, max: 4096 });
  if (!Array.isArray(value.plannedActions) || value.plannedActions.length > 32) {
    throw new TypeError('issue.plannedActions must be an array with at most 32 entries');
  }
  value.plannedActions.forEach((entry, index) => assertString(entry, `issue.plannedActions[${index}]`, { min: 1, max: 2048 }));
  if (!['low', 'medium', 'high', 'critical', 'unknown'].includes(value.risk)) throw new TypeError('issue.risk is invalid');
  if (!Array.isArray(value.writeScope) || value.writeScope.length > 32) throw new TypeError('issue.writeScope is invalid');
  value.writeScope.forEach((entry, index) => assertString(entry, `issue.writeScope[${index}]`, { min: 1, max: 2048 }));
  if (value.knownIssue !== null) {
    assertPlainObject(value.knownIssue, 'issue.knownIssue');
    assertNoUnknownKeys(value.knownIssue, new Set(['repository', 'number', 'url', 'title']), 'issue.knownIssue');
  }
  assertBoolean(value.canSkip, 'issue.canSkip');
  assertBoolean(value.requiresRestart, 'issue.requiresRestart');
  assertFiniteNumber(value.confidence, 'issue.confidence', { min: 0, max: 1 });

  if (REPAIR_SUGGEST_ONLY.has(value.category)) {
    if (value.suggestionMode !== 'suggest-repair') throw new TypeError('repair-suggest-only category must use suggest-repair');
  } else {
    if (value.suggestionMode !== 'report-only') throw new TypeError('report-only category must use report-only');
    if (value.writeScope.length !== 0 || value.plannedActions.length !== 0) {
      throw new TypeError('report-only category cannot declare repair actions or write scope');
    }
  }
  return structuredClone(value);
}

function validateDiagnosticReport(value) {
  assertPlainObject(value, 'report');
  const allowed = new Set(['schemaVersion', 'reportId', 'createdAt', 'engineSnapshot', 'issues', 'summary', 'rawReportPath', 'expiresAt']);
  assertNoUnknownKeys(value, allowed, 'report');
  if (value.schemaVersion !== 1) throw new TypeError('report.schemaVersion must be 1');
  validateReportId(value.reportId);
  assertString(value.createdAt, 'report.createdAt', { min: 20, max: 64 });
  assertPlainObject(value.engineSnapshot, 'report.engineSnapshot');
  if (!Array.isArray(value.issues) || value.issues.length > 128) throw new TypeError('report.issues is invalid');
  value.issues.forEach(validateDiagnosticIssue);
  assertPlainObject(value.summary, 'report.summary');
  if (value.rawReportPath !== null) assertString(value.rawReportPath, 'report.rawReportPath', { min: 1, max: 32767 });
  assertString(value.expiresAt, 'report.expiresAt', { min: 20, max: 64 });
  return structuredClone(value);
}

function validateEngineEvent(value) {
  assertPlainObject(value, 'event');
  const allowed = new Set([
    'schemaVersion', 'eventId', 'operationId', 'timestamp', 'kind', 'actualProgress',
    'displayedProgress', 'engineStageState', 'presentedStageState', 'message',
    'finalVerificationPassed', 'priority', 'details'
  ]);
  assertNoUnknownKeys(value, allowed, 'event');
  if (value.schemaVersion !== 1) throw new TypeError('event.schemaVersion must be 1');
  assertString(value.eventId, 'event.eventId', { min: 8, max: 128 });
  assertString(value.operationId, 'event.operationId', { min: 8, max: 128 });
  assertString(value.timestamp, 'event.timestamp', { min: 20, max: 64 });
  if (!['Progress', 'Stage', 'Failed', 'Cancelled', 'ResultReady'].includes(value.kind)) throw new TypeError('event.kind is invalid');
  assertFiniteNumber(value.actualProgress, 'event.actualProgress', { min: 0, max: 100 });
  assertFiniteNumber(value.displayedProgress, 'event.displayedProgress', { min: 0, max: 100 });
  assertString(value.engineStageState, 'event.engineStageState', { min: 1, max: 128 });
  assertString(value.presentedStageState, 'event.presentedStageState', { min: 1, max: 128 });
  assertString(value.message, 'event.message', { min: 0, max: 4096 });
  assertBoolean(value.finalVerificationPassed, 'event.finalVerificationPassed');
  if (!['normal', 'terminal'].includes(value.priority)) throw new TypeError('event.priority is invalid');
  if (value.displayedProgress > value.actualProgress) throw new TypeError('displayedProgress cannot exceed actualProgress');
  if (value.actualProgress === 100 && !(value.kind === 'ResultReady' && value.finalVerificationPassed)) {
    throw new TypeError('100% requires ResultReady and final verification');
  }
  if (TERMINAL_STATES.has(value.kind) && value.priority !== 'terminal') {
    throw new TypeError('terminal event must have terminal priority');
  }
  return structuredClone(value);
}

function makeId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

module.exports = {
  IPC,
  REPAIR_SUGGEST_ONLY,
  REPORT_ONLY,
  ALL_CATEGORIES,
  DEFAULT_SETTINGS,
  TERMINAL_STATES,
  isPlainObject,
  assertPlainObject,
  assertString,
  validateSettings,
  validateReportId,
  validateDiagnosticIssue,
  validateDiagnosticReport,
  validateEngineEvent,
  makeId
};
