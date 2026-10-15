'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { DEFAULT_SETTINGS, FIRST_RUN_LANGUAGE, LANGUAGE_PREFERENCES, validateSettings } = require('../shared/contracts.cjs');

// The interface language is stored beside settings.json, not inside it:
// 4.0.0 rejects unknown keys, so a new field would make a downgraded app
// discard every saved setting. settings.json keeps its 4.0.0 shape.
const withoutLanguage = ({ language, ...rest }) => rest;

class SettingsStore {
  constructor(dataRoot) {
    this.file = path.join(dataRoot, 'settings', 'settings.json');
    this.interfaceFile = path.join(dataRoot, 'settings', 'interface.json');
    this.cached = null;
  }

  async readLanguage() {
    try {
      const { language } = JSON.parse(await fs.readFile(this.interfaceFile, 'utf8'));
      return LANGUAGE_PREFERENCES.includes(language) ? language : null;
    } catch {
      return null;
    }
  }

  async get() {
    if (this.cached) return structuredClone(this.cached);
    const savedLanguage = await this.readLanguage();
    try {
      const parsed = JSON.parse(await fs.readFile(this.file, 'utf8'));
      this.cached = validateSettings({ ...withoutLanguage(parsed), language: savedLanguage ?? DEFAULT_SETTINGS.language });
    } catch (error) {
      const firstRun = error.code === 'ENOENT';
      if (!firstRun) {
        const invalid = `${this.file}.invalid-${Date.now()}`;
        await fs.rename(this.file, invalid).catch(() => {});
      }
      // Only a genuinely new install follows the Windows display language;
      // recovering from an unreadable file keeps the original zh-CN default.
      const language = savedLanguage ?? (firstRun ? FIRST_RUN_LANGUAGE : DEFAULT_SETTINGS.language);
      this.cached = validateSettings({ ...DEFAULT_SETTINGS, language });
      await this.save(this.cached);
    }
    return structuredClone(this.cached);
  }

  async writeJson(file, value) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    await fs.rename(temporary, file);
  }

  async save(input) {
    const value = validateSettings(input);
    await this.writeJson(this.file, withoutLanguage(value));
    await this.writeJson(this.interfaceFile, { language: value.language });
    this.cached = value;
    return structuredClone(value);
  }
}

module.exports = { SettingsStore };
