'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { DEFAULT_SETTINGS, validateSettings, validateReportId } = require('../shared/contracts.cjs');
const { SettingsStore } = require('./settings-store.cjs');
const { SystemProfileStore } = require('./system-profile.cjs');
const { BoundedLogBuffer } = require('./log-buffer.cjs');
const { EngineAdapter } = require('./engine-adapter.cjs');
const { discoverInstalledGPT, openInstalledGPT } = require('./app-package-discovery.cjs');
const { getPluginAssets } = require('./plugin-assets.cjs');
const { SocialFeedService } = require('./social-feed-service.cjs');

const dataRoot = path.resolve(process.env.WINBRIDGE_V4_DATA_ROOT || path.join(__dirname, '..', '..', 'runtime-data'));
const engineRoot = path.resolve(process.env.WINBRIDGE_V4_ENGINE_ROOT || path.join(__dirname, '..', '..', 'engine', 'frozen-3.1.1'));
const testMode = process.env.WINBRIDGE_V4_TEST_MODE === '1';
const realRepairEnabled = process.env.WINBRIDGE_V4_REAL_REPAIR_ENABLED === '1' && !testMode;
const ownedChildren = new Set();
const hostPending = new Map();
const logFile = path.join(dataRoot, 'logs', 'runtime.log');
let fileWriteQueue = Promise.resolve();
let settingsStore;
let profileStore;
let adapter;
let logBuffer;
let socialFeedService;
let shuttingDown = false;

function send(message) {
  if (!process.connected) return false;
  try {
    process.send(message, () => {});
    return true;
  } catch {
    return false;
  }
}

function requestHost(operation, payload, { signal, timeoutMs = 30000 } = {}) {
  if (shuttingDown) return Promise.reject(new Error('Runtime shutdown is in progress'));
  if (signal?.aborted) return Promise.reject(signal.reason || new Error('Host request was cancelled'));
  const id = `host-${randomUUID()}`;
  return new Promise((resolve, reject) => {
    const finish = (action, value) => {
      const pending = hostPending.get(id);
      if (!pending) return;
      hostPending.delete(id);
      clearTimeout(pending.timer);
      signal?.removeEventListener('abort', pending.onAbort);
      action(value);
    };
    const onAbort = () => {
      send({ type: 'host-cancel', id });
      finish(reject, signal.reason || new Error('Host request was cancelled'));
    };
    const timer = setTimeout(() => {
      send({ type: 'host-cancel', id });
      finish(reject, new Error('Host broker request timed out'));
    }, timeoutMs);
    timer.unref?.();
    hostPending.set(id, { resolve, reject, timer, onAbort, finish });
    signal?.addEventListener('abort', onAbort, { once: true });
    if (!send({ type: 'host-request', id, operation, payload })) finish(reject, new Error('Host broker is unavailable'));
  });
}

function settleHostResponse(message) {
  const pending = hostPending.get(message.id);
  if (!pending) return;
  if (message.ok) pending.finish(pending.resolve, message.value);
  else pending.finish(pending.reject, Object.assign(new Error(message.error?.message || 'Host broker request failed'), { name: message.error?.name || 'Error' }));
}

function registerChild(child) {
  ownedChildren.add(child);
  child.once('exit', () => ownedChildren.delete(child));
}

function unregisterChild(child) {
  ownedChildren.delete(child);
}

function rotateAndAppend(entry) {
  fileWriteQueue = fileWriteQueue.then(async () => {
    await fs.mkdir(path.dirname(logFile), { recursive: true });
    const line = `${JSON.stringify(entry)}\n`;
    let size = 0;
    try { size = (await fs.stat(logFile)).size; } catch {}
    if (size + Buffer.byteLength(line, 'utf8') > 4 * 1024 * 1024) {
      const previous = `${logFile}.1`;
      await fs.rm(previous, { force: true });
      await fs.rename(logFile, previous).catch(() => {});
    }
    await fs.appendFile(logFile, line, 'utf8');
  }).catch(() => {});
}

function writeLog(entry) {
  const normalized = { timestamp: new Date().toISOString(), ...entry };
  logBuffer.push(normalized);
  rotateAndAppend(normalized);
}

async function initialize() {
  await fs.mkdir(dataRoot, { recursive: true });
  settingsStore = new SettingsStore(dataRoot);
  const settings = await settingsStore.get();
  const packageOptions = { registerChild, unregisterChild };
  profileStore = new SystemProfileStore(dataRoot, () => discoverInstalledGPT(packageOptions));
  logBuffer = new BoundedLogBuffer({
    maxBytes: settings.logMemoryLimitBytes,
    batchSize: settings.logBatchSize,
    onBatch: (payload) => send({ type: 'log-batch', payload })
  });
  adapter = new EngineAdapter({
    dataRoot,
    engineRoot,
    concurrency: settings.diagnosticConcurrency,
    realRepairEnabled,
    registerChild,
    unregisterChild,
    onLog: writeLog,
    onEvent: (payload) => send({ type: 'engine-event', payload })
  });
  socialFeedService = new SocialFeedService({
    dataRoot,
    settingsProvider: () => settingsStore.get(),
    onLog: writeLog,
    networkBroker: requestHost
  });
  writeLog({ level: 'info', category: 'lifecycle', message: 'Runtime worker initialized.' });
}

async function dispatch(command, payload) {
  if (shuttingDown) throw new Error('Runtime shutdown is in progress');
  switch (command) {
    case 'settings.get':
      return settingsStore.get();
    case 'settings.save': {
      const value = await settingsStore.save(validateSettings(payload));
      adapter.concurrency = value.diagnosticConcurrency;
      return value;
    }
    case 'system.get':
      return profileStore.get();
    case 'system.refresh':
      return profileStore.refresh();
    case 'diagnosis.run':
      return adapter.runDiagnosis();
    case 'diagnosis.get':
      return adapter.getLatestReport();
    case 'repair.start':
      return adapter.startRepair(validateReportId(payload));
    case 'operation.cancel':
      return { cancelled: adapter.cancel() };
    case 'logs.path':
      await fs.mkdir(path.dirname(logFile), { recursive: true });
      return { path: path.dirname(logFile) };
    case 'gpt.open':
      return openInstalledGPT({ registerChild, unregisterChild });
    case 'plugins.assets':
      return getPluginAssets();
    case 'social.feed':
      return socialFeedService.getFeed(payload);
    case 'social.translate':
      return socialFeedService.translate(payload);
    case 'social.resolve-open':
      return socialFeedService.resolveOpen(payload);
    case 'test.emit-fixture':
      if (!testMode) throw new Error('Test command is disabled');
      return emitFixture(payload);
    case 'test.spawn-helper':
      if (!testMode) throw new Error('Test command is disabled');
      return spawnTestHelper();
    case 'test.owned-pids':
      if (!testMode) throw new Error('Test command is disabled');
      return [...ownedChildren].map((child) => child.pid).filter(Boolean);
    default:
      throw new Error(`Unsupported worker command: ${command}`);
  }
}

function emitFixture(payload) {
  const operationId = String(payload?.operationId || 'fixture-operation-0001');
  send({ type: 'engine-event', payload: { operationId, kind: 'Progress', actualProgress: 35, engineStageState: 'FixtureScan', presentedStageState: 'Diagnosing', message: 'Fixture progress.' } });
  send({ type: 'engine-event', payload: { operationId, kind: 'ResultReady', actualProgress: 100, engineStageState: 'ResultReady', presentedStageState: 'ResultReady', message: 'Fixture complete.', finalVerificationPassed: true } });
  writeLog({ level: 'info', category: 'fixture', message: 'Synthetic fixture completed.', operationId });
  return { operationId };
}

function spawnTestHelper() {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    stdio: 'ignore', windowsHide: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
  });
  registerChild(child);
  return { pid: child.pid };
}

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  socialFeedService?.shutdown();
  for (const [id, pending] of hostPending) {
    send({ type: 'host-cancel', id });
    pending.finish(pending.reject, new Error('Runtime shutdown is in progress'));
  }
  adapter?.cancel();
  for (const child of [...ownedChildren]) {
    if (!child.killed) child.kill();
  }
  logBuffer?.close();
  await fileWriteQueue.catch(() => {});
}

process.on('message', async (message) => {
  if (!message || typeof message !== 'object') return;
  if (message.type === 'host-response' && typeof message.id === 'string') {
    settleHostResponse(message);
    return;
  }
  if (message.type === 'shutdown') {
    await shutdown();
    send({ type: 'shutdown-complete' });
    process.disconnect?.();
    return;
  }
  if (message.type !== 'request' || typeof message.id !== 'string' || typeof message.command !== 'string') return;
  if (shuttingDown) {
    send({ type: 'response', id: message.id, ok: false, error: { name: 'Error', message: 'Runtime shutdown is in progress' } });
    return;
  }
  try {
    const value = await dispatch(message.command, message.payload);
    send({ type: 'response', id: message.id, ok: true, value });
  } catch (error) {
    writeLog({ level: 'error', category: 'worker-command', message: error.message });
    send({ type: 'response', id: message.id, ok: false, error: { name: error.name, message: error.message } });
  }
});

process.on('disconnect', () => shutdown().finally(() => process.exit(0)));
process.on('SIGTERM', () => shutdown().finally(() => process.exit(0)));

initialize().then(() => send({ type: 'ready', capabilities: { realRepairEnabled } })).catch((error) => {
  send({ type: 'fatal', error: { name: error.name, message: error.message } });
  process.exitCode = 1;
});
