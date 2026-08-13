'use strict';

class BoundedLogBuffer {
  constructor({ maxBytes = 1048576, batchSize = 64, flushIntervalMs = 80, onBatch }) {
    this.maxBytes = maxBytes;
    this.batchSize = batchSize;
    this.flushIntervalMs = flushIntervalMs;
    this.onBatch = onBatch;
    this.entries = [];
    this.bytes = 0;
    this.dropped = 0;
    this.timer = null;
  }

  push(entry) {
    const normalized = Object.freeze({
      timestamp: entry.timestamp || new Date().toISOString(),
      level: ['debug', 'info', 'warn', 'error'].includes(entry.level) ? entry.level : 'info',
      category: String(entry.category || 'runtime').slice(0, 128),
      message: String(entry.message || '').slice(0, 8192),
      operationId: entry.operationId ? String(entry.operationId).slice(0, 128) : null
    });
    const size = Buffer.byteLength(JSON.stringify(normalized), 'utf8');
    if (size > this.maxBytes) {
      this.dropped += 1;
      return;
    }
    while (this.entries.length && this.bytes + size > this.maxBytes) {
      const removed = this.entries.shift();
      this.bytes -= removed.size;
      this.dropped += 1;
    }
    this.entries.push({ value: normalized, size });
    this.bytes += size;
    if (this.entries.length >= this.batchSize) this.flush();
    else this.schedule();
  }

  schedule() {
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), this.flushIntervalMs);
    this.timer.unref?.();
  }

  flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.entries.length && !this.dropped) return;
    const selected = this.entries.splice(0, this.batchSize);
    for (const entry of selected) this.bytes -= entry.size;
    const payload = {
      schemaVersion: 1,
      entries: selected.map((entry) => entry.value),
      droppedBeforeBatch: this.dropped
    };
    this.dropped = 0;
    this.onBatch(payload);
    if (this.entries.length) this.schedule();
  }

  close() {
    this.flush();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

module.exports = { BoundedLogBuffer };
