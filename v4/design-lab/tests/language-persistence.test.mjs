import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { schemes } from "../src/data/concepts.js";
import { buildConceptConfig, createDefaultUiState, loadUiState, normalizeUiState, saveUiState } from "../src/lib/config.js";
import { NATIVE_SETTINGS_DEFAULTS, mergeNativeSettings, toNativeSettings } from "../src/lib/nativeSettingsAdapter.js";

// The renderer's payload must pass the real native settings contract that the
// Electron main process and Worker enforce.
const require = createRequire(import.meta.url);
const { DEFAULT_SETTINGS, validateSettings } = require("../../runtime/src/shared/contracts.cjs");

const withLanguage = (language, base = createDefaultUiState()) => ({ ...base, settings: { ...base.settings, language } });

test("existing users without a saved language keep the Chinese default", () => {
  assert.equal(createDefaultUiState().settings.language, "zh-CN");
  assert.equal(normalizeUiState({}).settings.language, "zh-CN");
  const legacyNative = validateSettings(Object.fromEntries(Object.entries(DEFAULT_SETTINGS).filter(([key]) => key !== "language")));
  assert.equal(legacyNative.language, "zh-CN");
  assert.equal(mergeNativeSettings(createDefaultUiState(), legacyNative).settings.language, "zh-CN");
});

test("invalid stored language values fall back to a supported language", () => {
  for (const value of ["fr-FR", "", 42, null, { language: "en-US" }]) {
    assert.equal(normalizeUiState({ settings: { language: value } }).settings.language, "zh-CN");
  }
  const ui = withLanguage("en-US");
  assert.equal(mergeNativeSettings(ui, { ...validateSettings({ ...DEFAULT_SETTINGS }), language: "klingon" }).settings.language, "en-US");
  assert.throws(() => validateSettings({ ...DEFAULT_SETTINGS, language: "klingon" }), /settings\.language is invalid/);
});

test("Chinese to English and back is persisted through native settings and survives a restart", () => {
  let nativeFile = validateSettings({ ...DEFAULT_SETTINGS });
  for (const language of ["en-US", "zh-CN", "system", "en-US"]) {
    const ui = withLanguage(language);
    const payload = toNativeSettings(ui, nativeFile);
    assert.equal(payload.language, language);
    nativeFile = validateSettings(JSON.parse(JSON.stringify(payload)));
    // Restart: a fresh renderer state is hydrated only from the saved native file.
    const rehydrated = normalizeUiState(mergeNativeSettings(createDefaultUiState(), nativeFile));
    assert.equal(rehydrated.settings.language, language);
  }
});

test("pre-hydration defaults never overwrite the language chosen in this session", () => {
  assert.equal(Object.hasOwn(NATIVE_SETTINGS_DEFAULTS, "language"), false);
  const ui = withLanguage("en-US");
  assert.equal(mergeNativeSettings(ui, NATIVE_SETTINGS_DEFAULTS).settings.language, "en-US");
});

test("renderer-local storage round-trips the language for the concept preview", () => {
  const storage = new Map();
  globalThis.window = { localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } };
  try {
    assert.equal(saveUiState(withLanguage("en-US")), true);
    assert.equal(loadUiState().settings.language, "en-US");
    assert.equal(JSON.parse([...storage.values()][0]).locale, undefined, "a second, conflicting locale value is stored");
  } finally {
    delete globalThis.window;
  }
});

test("settings export carries one language value and import restores it", () => {
  const scheme = schemes[0];
  const exported = buildConceptConfig({ scheme, ...withLanguage("en-US"), progress: 0 });
  assert.equal(exported.settings.language, "en-US");
  assert.equal(exported.locale, "en-US");
  assert.equal(normalizeUiState(JSON.parse(JSON.stringify(exported))).settings.language, "en-US");

  const followSystem = buildConceptConfig({ scheme, ...withLanguage("system"), progress: 0, systemLanguages: ["zh-CN"] });
  assert.equal(followSystem.settings.language, "system");
  assert.equal(followSystem.locale, "zh-CN");
  assert.equal(normalizeUiState(followSystem).settings.language, "system");
});

test("older exports are imported without the always-zh-CN locale overriding settings.language", () => {
  // 4.0.0 exports always wrote locale "zh-CN" next to settings.language.
  assert.equal(normalizeUiState({ locale: "zh-CN", settings: { language: "en-US" } }).settings.language, "en-US");
  assert.equal(normalizeUiState({ locale: "en-US", settings: {} }).settings.language, "en-US");
  assert.equal(normalizeUiState({ locale: "de-DE", settings: { language: "de-DE" } }).settings.language, "zh-CN");
});
