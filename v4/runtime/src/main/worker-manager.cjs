'use strict';

const path = require('node:path');
const { fork } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { EventEmitter } = require('node:events');
const { ProgressProjector } = require('../shared/progress-projector.cjs');

function sendToWorker(worker, message) {
  if (!worker?.connected) return false;
  try {
    worker.send(message, () => {});
    return true;
  } catch {
    return false;
  }
}

class WorkerManager extends EventEmitter {
  constructor({ appRoot, dataRoot, testMode = false, realRepairCapability = false, requestTimeoutMs = 120000, startupTimeoutMs = 15000, hostBroker = null }) {
    super();
    this.appRoot = appRoot;
    this.dataRoot = dataRoot;
    this.testMode = testMode;
    this.realRepairCapability = realRepairCapability;
    this.requestTimeoutMs = requestTimeoutMs;
    this.startupTimeoutMs = startupTimeoutMs;
    this.hostBroker = hostBroker;
    this.worker = null;
    this.pending = new Map();
    this.projector = new ProgressProjector();
    this.readyPromise = null;
    this.shuttingDown = false;
    this.hostRequests = new Set();
  }

  start() {
    if (this.shuttingDown) return Promise.reject(new Error('Runtime shutdown is in progress'));
    if (this.readyPromise) return this.readyPromise;
    const workerPath = path.join(this.appRoot, 'src', 'worker', 'engine-worker.cjs');
    const engineRoot = path.join(this.appRoot, 'engine', 'frozen-3.1.1');
    const attemptToken = Symbol('worker-start-attempt');
    this.startToken = attemptToken;
    const attempt = new Promise((resolve, reject) => {
      const worker = fork(workerPath, [], {
        cwd: this.appRoot,
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        windowsHide: true,
        serialization: 'advanced',
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: '1',
          WINBRIDGE_V4_DATA_ROOT: this.dataRoot,
          WINBRIDGE_V4_ENGINE_ROOT: engineRoot,
          WINBRIDGE_V4_TEST_MODE: this.testMode ? '1' : '0',
          WINBRIDGE_V4_REAL_REPAIR_ENABLED: this.realRepairCapability ? '1' : '0'
        }
      });
      this.worker = worker;
      worker.stdout?.on('data', (chunk) => this.emit('worker-output', { stream: 'stdout', text: chunk.toString('utf8') }));
      worker.stderr?.on('data', (chunk) => this.emit('worker-output', { stream: 'stderr', text: chunk.toString('utf8') }));
      let startupSettled = false;
      const failStartup = (error) => {
        if (startupSettled) return;
        startupSettled = true;
        clearTimeout(startupTimer);
        if (!worker.killed) worker.kill();
        if (this.startToken === attemptToken && this.worker === worker) this.worker = null;
        reject(error);
      };
      const startupTimer = setTimeout(() => failStartup(new Error('Runtime worker startup timed out')), this.startupTimeoutMs);
      worker.on('message', (message) => {
        if (message?.type === 'ready') {
          if (startupSettled) return;
          startupSettled = true;
          clearTimeout(startupTimer);
          this.capabilities = message.capabilities;
          resolve(message.capabilities);
          return;
        }
        if (message?.type === 'response') {
          const pending = this.pending.get(message.id);
          if (!pending) return;
          this.pending.delete(message.id);
          clearTimeout(pending.timer);
          if (message.ok) pending.resolve(message.value);
          else pending.reject(Object.assign(new Error(message.error?.message || 'Worker request failed'), { name: message.error?.name || 'Error' }));
          return;
        }
        if (message?.type === 'engine-event') {
          try {
            const projected = this.projector.project(message.payload);
            if (projected) this.emit('engine-event', projected);
          } catch (error) {
            this.emit('worker-output', { stream: 'stderr', text: `Rejected engine event: ${error.message}` });
          }
          return;
        }
        if (message?.type === 'log-batch') this.emit('log-batch', message.payload);
        if (message?.type === 'host-request') this.handleHostRequest(worker, message);
        if (message?.type === 'host-cancel' && typeof message.id === 'string') this.hostBroker?.cancel(message.id);
        if (message?.type === 'fatal') this.emit('fatal', new Error(message.error?.message || 'Runtime worker failed'));
        if (message?.type === 'shutdown-complete') this.emit('shutdown-complete');
      });
      worker.once('exit', (code, signal) => {
        clearTimeout(startupTimer);
        if (!startupSettled) {
          startupSettled = true;
          reject(new Error(`Runtime worker exited before ready (${code ?? signal})`));
        }
        const error = new Error(`Runtime worker exited (${code ?? signal})`);
        for (const pending of this.pending.values()) {
          clearTimeout(pending.timer);
          pending.reject(error);
        }
        this.pending.clear();
        if (this.startToken === attemptToken) {
          if (this.worker === worker) this.worker = null;
          this.readyPromise = null;
        }
        this.emit('exit', { code, signal });
      });
      worker.once('error', failStartup);
    });
    this.readyPromise = attempt.catch((error) => {
      if (this.startToken === attemptToken) this.readyPromise = null;
      throw error;
    });
    return this.readyPromise;
  }

  async request(command, payload, timeoutMs = this.requestTimeoutMs) {
    if (this.shuttingDown) throw new Error('Runtime shutdown is in progress');
    await this.start();
    if (this.shuttingDown) throw new Error('Runtime shutdown is in progress');
    if (!this.worker?.connected) throw new Error('Runtime worker is unavailable');
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Worker request timed out: ${command}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      if (!sendToWorker(this.worker, { type: 'request', id, command, payload })) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new Error('Runtime worker is unavailable'));
      }
    });
  }

  async handleHostRequest(worker, message) {
    const id = message?.id;
    if (typeof id !== 'string' || typeof message.operation !== 'string' || !this.hostBroker || this.shuttingDown || this.hostRequests.has(id)) {
      if (!this.shuttingDown && worker.connected && typeof id === 'string') {
        sendToWorker(worker, { type: 'host-response', id, ok: false, error: { name: 'Error', message: 'Host broker request was rejected' } });
      }
      return;
    }
    this.hostRequests.add(id);
    try {
      const value = await this.hostBroker.handle(id, message.operation, message.payload);
      if (!this.shuttingDown && worker === this.worker && worker.connected) sendToWorker(worker, { type: 'host-response', id, ok: true, value });
    } catch (error) {
      if (!this.shuttingDown && worker === this.worker && worker.connected) {
        sendToWorker(worker, { type: 'host-response', id, ok: false, error: { name: error.name || 'Error', message: error.message || 'Host broker request failed' } });
      }
    } finally {
      this.hostRequests.delete(id);
    }
  }

  async shutdown({ timeoutMs = 3000 } = {}) {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    this.hostBroker?.shutdown();
    this.hostRequests.clear();
    const shutdownError = new Error('Runtime shutdown is in progress');
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(shutdownError);
    }
    this.pending.clear();
    if (!this.worker) return;
    const worker = this.worker;
    const finished = new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), timeoutMs);
      worker.once('exit', () => { clearTimeout(timer); resolve(true); });
      this.once('shutdown-complete', () => { clearTimeout(timer); resolve(true); });
    });
    if (worker.connected) sendToWorker(worker, { type: 'shutdown' });
    const graceful = await finished;
    if (!graceful && !worker.killed) worker.kill();
  }
}

module.exports = { WorkerManager };
