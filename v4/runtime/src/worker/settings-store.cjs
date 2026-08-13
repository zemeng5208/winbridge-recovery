'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { DEFAULT_SETTINGS, validateSettings } = require('../shared/contracts.cjs');

class SettingsStore {
  constructor(dataRoot) {
    this.file = path.join(dataRoot, 'settings', 'settings.json');
    this.cached = null;
  }

  async get() {
    if (this.cached) return structuredClone(this.cached);
    try {
      const parsed = JSON.parse(await fs.readFile(this.file, 'utf8'));
      this.cached = validateSettings(parsed);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        const invalid = `${this.file}.invalid-${Date.now()}`;
        await fs.rename(this.file, invalid).catch(() => {});
      }
      this.cached = validateSettings({ ...DEFAULT_SETTINGS });
      await this.save(this.cached);
    }
    return structuredClone(this.cached);
  }

  async save(input) {
    const value = validateSettings(input);
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    await fs.rename(temporary, this.file);
    this.cached = value;
    return structuredClone(value);
  }
}

module.exports = { SettingsStore };
