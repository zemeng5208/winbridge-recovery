'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { WorkerManager } = require('../src/main/worker-manager.cjs');
const { SOCIAL_BROKER_OPERATIONS } = require('../src/shared/social-contracts.cjs');

const projectRoot = path.resolve(__dirname, '..');
const testRoot = path.join(projectRoot, '.test-artifacts', 'worker-lifecycle');

function processExists(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

test.after(async () => {
  const resolved = path.resolve(testRoot);
  assert.ok(resolved.startsWith(path.join(projectRoot, '.test-artifacts') + path.sep));
  await fs.rm(resolved, { recursive: true, force: true });
});

test('worker emits projected fixture events and cleans only its owned helper', async () => {
  const manager = new WorkerManager({ appRoot: projectRoot, dataRoot: testRoot, testMode: true, requestTimeoutMs: 10000 });
  const events = [];
  manager.on('engine-event', (event) => events.push(event));
  await manager.start();
  const settings = await manager.request('settings.get');
  assert.equal(settings.autoCloseAfterRepair, false);
  await manager.request('test.emit-fixture', { operationId: 'fixture-operation-0001' });
  assert.equal(events.at(-1).kind, 'ResultReady');
  assert.equal(events.at(-1).displayedProgress, 100);
  const helper = await manager.request('test.spawn-helper');
  assert.equal(processExists(helper.pid), true);
  await manager.shutdown({ timeoutMs: 5000 });
  for (let attempt = 0; attempt < 20 && processExists(helper.pid); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal(processExists(helper.pid), false);
});

test('development and synthetic test modes never expose launch-gated repair capability', async () => {
  const development = new WorkerManager({ appRoot: projectRoot, dataRoot: path.join(testRoot, 'development'), testMode: false, realRepairCapability: false });
  assert.equal((await development.start()).realRepairEnabled, false);
  await development.shutdown();

  const synthetic = new WorkerManager({ appRoot: projectRoot, dataRoot: path.join(testRoot, 'synthetic'), testMode: true, realRepairCapability: true });
  assert.equal((await synthetic.start()).realRepairEnabled, false);
  await synthetic.shutdown();
});

test('failed worker startup clears the attempt and permits a safe retry', async () => {
  const manager = new WorkerManager({ appRoot: path.join(projectRoot, 'missing-app-root'), dataRoot: path.join(testRoot, 'retry'), testMode: true, startupTimeoutMs: 250 });
  await assert.rejects(() => manager.start(), /before ready|timed out|Cannot find module|ENOENT/);
  for (let attempt = 0; attempt < 20 && manager.worker; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(manager.worker, null);
  assert.equal(manager.readyPromise, null);
  manager.appRoot = projectRoot;
  assert.equal((await manager.start()).realRepairEnabled, false);
  await manager.shutdown();
});

test('manager refuses new commands once shutdown begins', async () => {
  const manager = new WorkerManager({ appRoot: projectRoot, dataRoot: path.join(testRoot, 'shutdown-gate'), testMode: true });
  await manager.start();
  const shutdown = manager.shutdown({ timeoutMs: 5000 });
  await assert.rejects(() => manager.request('settings.get'), /shutdown is in progress/);
  await shutdown;
  await assert.rejects(() => manager.start(), /shutdown is in progress/);
});

test('Worker social networking crosses only the private fixed-operation broker RPC', async () => {
  const calls = [];
  let stopped = false;
  const hostBroker = {
    async handle(_id, operation, payload) {
      calls.push({ operation, payload });
      if (operation === SOCIAL_BROKER_OPERATIONS.REGISTER_POSTS) return { registered: payload.posts.length };
      if (operation === SOCIAL_BROKER_OPERATIONS.FETCH_SOURCE) {
        assert.deepEqual(payload, { account: 'openai', source: 'xxu-rss' });
        const publishedAt = new Date().toISOString();
        return {
          status: 200,
          contentType: 'application/rss+xml',
          body: Buffer.from(`<rss><channel><item><description>Synthetic broker IPC post</description><link>https://x.com/OpenAI/status/1234567890123456789</link><pubDate>${publishedAt}</pubDate></item></channel></rss>`)
        };
      }
      throw new Error('Unexpected broker operation');
    },
    cancel() { return false; },
    shutdown() { stopped = true; }
  };
  const manager = new WorkerManager({
    appRoot: projectRoot,
    dataRoot: path.join(testRoot, 'social-broker-rpc'),
    testMode: true,
    hostBroker
  });
  await manager.start();
  const feed = await manager.request('social.feed', { accounts: ['openai'], maxPosts: 4, hours: 48, useJinaFallback: false, locale: 'zh' });
  assert.equal(feed.available, true);
  assert.equal(feed.posts.length, 1);
  assert.deepEqual(calls.map((call) => call.operation), [
    SOCIAL_BROKER_OPERATIONS.REGISTER_POSTS,
    SOCIAL_BROKER_OPERATIONS.FETCH_SOURCE,
    SOCIAL_BROKER_OPERATIONS.REGISTER_POSTS
  ]);
  assert.equal(calls.some((call) => 'url' in call.payload), false);
  await manager.shutdown();
  assert.equal(stopped, true);
});
