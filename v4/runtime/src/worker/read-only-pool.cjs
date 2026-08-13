'use strict';

async function mapBounded(items, concurrency, task, signal) {
  if (!Array.isArray(items)) throw new TypeError('items must be an array');
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) {
    throw new RangeError('read-only concurrency must be between 1 and 4');
  }
  const results = new Array(items.length);
  let cursor = 0;

  async function lane() {
    while (true) {
      if (signal?.aborted) throw signal.reason || new Error('Operation cancelled');
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await task(items[index], index, signal);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, lane));
  return results;
}

module.exports = { mapBounded };
