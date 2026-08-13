'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { mapBounded } = require('../src/worker/read-only-pool.cjs');
const { BoundedLogBuffer } = require('../src/worker/log-buffer.cjs');

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
