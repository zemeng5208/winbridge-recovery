'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { DEFAULT_SETTINGS, LANGUAGE_PREFERENCES, validateSettings } = require('../src/shared/contracts.cjs');
const { SettingsStore } = require('../src/worker/settings-store.cjs');

const projectRoot = path.resolve(__dirname, '..');
const testRoot = path.join(projectRoot, '.test-artifacts', 'settings-language');

async function freshDataRoot(name) {
  const dataRoot = path.join(testRoot, name);
  assert.ok(path.resolve(dataRoot).startsWith(path.join(projectRoot, '.test-artifacts') + path.sep));
  await fs.rm(dataRoot, { recursive: true, force: true });
  await fs.mkdir(dataRoot, { recursive: true });
  return dataRoot;
}

const settingsFile = (dataRoot) => path.join(dataRoot, 'settings', 'settings.json');
const interfaceFile = (dataRoot) => path.join(dataRoot, 'settings', 'interface.json');
const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
const legacySettings = () => Object.fromEntries(Object.entries(DEFAULT_SETTINGS).filter(([key]) => key !== 'language'));

test('settings language accepts only the supported preferences', () => {
  assert.deepEqual(LANGUAGE_PREFERENCES, ['system', 'zh-CN', 'en-US']);
  for (const language of LANGUAGE_PREFERENCES) assert.equal(validateSettings({ ...DEFAULT_SETTINGS, language }).language, language);
  for (const language of ['en', 'zh', 'EN-US', '', null, 1]) {
    assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, language }), /settings\.language is invalid/);
  }
  assert.equal(validateSettings(legacySettings()).language, 'zh-CN');
});

test('a new install follows the Windows display language', async () => {
  const dataRoot = await freshDataRoot('first-run');
  const settings = await new SettingsStore(dataRoot).get();
  assert.equal(settings.language, 'system');
  assert.equal((await readJson(interfaceFile(dataRoot))).language, 'system');
});

test('an existing 4.0.0 settings file keeps the Chinese interface and is not rewritten on read', async () => {
  const dataRoot = await freshDataRoot('legacy');
  await fs.mkdir(path.dirname(settingsFile(dataRoot)), { recursive: true });
  const legacyText = `${JSON.stringify({ ...legacySettings(), reduceMotion: true }, null, 2)}\n`;
  await fs.writeFile(settingsFile(dataRoot), legacyText, 'utf8');
  const settings = await new SettingsStore(dataRoot).get();
  assert.equal(settings.language, 'zh-CN');
  assert.equal(settings.reduceMotion, true);
  assert.equal(await fs.readFile(settingsFile(dataRoot), 'utf8'), legacyText);
});

test('settings.json keeps the exact 4.0.0 key set so a downgrade does not discard it', async () => {
  const dataRoot = await freshDataRoot('downgrade');
  const store = new SettingsStore(dataRoot);
  await store.save({ ...(await store.get()), language: 'en-US', reduceMotion: true });
  const onDisk = await readJson(settingsFile(dataRoot));
  // 4.0.0 validateSettings rejects any key outside its DEFAULT_SETTINGS.
  assert.deepEqual(Object.keys(onDisk).sort(), Object.keys(legacySettings()).sort());
  assert.equal(onDisk.reduceMotion, true);
  assert.deepEqual(await readJson(interfaceFile(dataRoot)), { language: 'en-US' });
});

test('an invalid interface.json falls back without touching the other settings', async () => {
  const dataRoot = await freshDataRoot('invalid-interface');
  await fs.mkdir(path.dirname(settingsFile(dataRoot)), { recursive: true });
  await fs.writeFile(settingsFile(dataRoot), JSON.stringify({ ...legacySettings(), reduceMotion: true }), 'utf8');
  await fs.writeFile(interfaceFile(dataRoot), JSON.stringify({ language: 'fr-FR' }), 'utf8');
  const settings = await new SettingsStore(dataRoot).get();
  assert.equal(settings.language, 'zh-CN');
  assert.equal(settings.reduceMotion, true);
});

test('a saved language survives an application restart', async () => {
  const dataRoot = await freshDataRoot('restart');
  const first = new SettingsStore(dataRoot);
  await first.get();
  await first.save({ ...(await first.get()), language: 'en-US' });
  const afterRestart = await new SettingsStore(dataRoot).get();
  assert.equal(afterRestart.language, 'en-US');
  await new SettingsStore(dataRoot).save({ ...afterRestart, language: 'zh-CN' });
  assert.equal((await new SettingsStore(dataRoot).get()).language, 'zh-CN');
});

test('an unreadable settings file recovers to the original Chinese default, not the system language', async () => {
  const dataRoot = await freshDataRoot('corrupt');
  await fs.mkdir(path.dirname(settingsFile(dataRoot)), { recursive: true });
  await fs.writeFile(settingsFile(dataRoot), '{ not json', 'utf8');
  const settings = await new SettingsStore(dataRoot).get();
  assert.equal(settings.language, 'zh-CN');
  const preserved = (await fs.readdir(path.dirname(settingsFile(dataRoot)))).filter((name) => name.startsWith('settings.json.invalid-'));
  assert.equal(preserved.length, 1);
});
