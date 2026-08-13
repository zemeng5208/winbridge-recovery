import { colorPresets, preservationRows, schemes } from "../data/concepts.js";

export const CONFIG_SCHEMA = "winbridge-recovery-4.0-settings/v1";
export const STORAGE_KEY = "winbridge-recovery-4.0.settings.v1";

export const DEFAULT_LAB_SETTINGS = Object.freeze({
  language: "zh-CN",
  launchBehavior: "diagnose",
  followSystemTheme: false,
  reduceMotion: false,
  lowEndMode: false,
  autoCloseAfterRepair: false,
  autoCloseAfterRepairExplicit: false,
  launchAtLogin: false,
  backgroundUpdates: false,
  autoExportLogs: false,
  logAutoFollow: true,
  logRetention: "30-days",
  logLimit: 80,
  dpi: "125",
  stageAnimation: true,
  animationBuffer: "balanced",
  backupCopies: 2,
  socialEnabled: false,
  socialAccounts: Object.freeze({ tibo: false, openai: false, chatgpt: false }),
  socialMaxPosts: 4,
  socialHours: 48,
  socialUseJinaFallback: false,
  socialLocale: "zh",
  pluginVisibility: Object.freeze({ browser: true, chrome: true, "computer-use": true }),
});

export const DEFAULT_MIX = Object.freeze({
  density: "balanced",
  geometry: "soft",
  terminalStyle: "structured",
  settingsLayout: "sidebar",
  material: "glass",
  colorPreset: "obsidian",
  baseColorPreset: "obsidian",
  accent: colorPresets[0].accent,
  secondaryAccent: colorPresets[0].channels[1],
  channels: Object.freeze([...colorPresets[0].channels]),
  pluginColors: Object.freeze([...colorPresets[0].pluginColors]),
  glassOpacity: 68,
  glassBlur: 28,
  glassRefraction: 5,
  edgeHighlight: 34,
  cornerRadius: 9,
  interfaceScale: 100,
  speed: 1,
});

const mixEnums = {
  density: ["compact", "balanced", "airy"],
  geometry: ["square", "soft", "round"],
  terminalStyle: ["structured", "calm", "contrast"],
  settingsLayout: ["sidebar", "compact"],
  material: ["glass", "solid"],
};

const settingEnums = {
  language: ["zh-CN", "en-US"],
  launchBehavior: ["diagnose", "open-gpt"],
  logRetention: ["session", "7-days", "30-days"],
  dpi: ["100", "125", "150", "200"],
  animationBuffer: ["responsive", "balanced", "gentle"],
  socialLocale: ["zh", "en", "fr", "es", "ru", "ar"],
};

const clamp = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};

const isHex = (value) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
const enumValue = (value, values, fallback) => values.includes(value) ? value : fallback;
const cloneDefaults = () => ({
  schema: CONFIG_SCHEMA,
  locale: "zh-CN",
  schemeId: schemes[0].id,
  mix: { ...DEFAULT_MIX, channels: [...DEFAULT_MIX.channels], pluginColors: [...DEFAULT_MIX.pluginColors] },
  settings: { ...DEFAULT_LAB_SETTINGS, socialAccounts: { ...DEFAULT_LAB_SETTINGS.socialAccounts }, pluginVisibility: { ...DEFAULT_LAB_SETTINGS.pluginVisibility } },
});

export function createDefaultUiState() {
  return cloneDefaults();
}

export function normalizeUiState(candidate = {}) {
  const defaults = cloneDefaults();
  const rawMix = candidate.mix ?? candidate.appearance ?? {};
  const rawSettings = candidate.settings ?? {};
  const preset = colorPresets.find((item) => item.id === rawMix.colorPreset);
  const fallbackPreset = preset ?? colorPresets[0];
  const schemeId = candidate.schemeId ?? candidate.scheme?.id ?? candidate.layout?.id;
  const pluginVisibility = rawSettings.pluginVisibility ?? {};
  const socialAccounts = rawSettings.socialAccounts ?? {};
  const rawChannels = rawMix.channels ?? candidate.fluidProgress?.channels;
  const rawPluginColors = rawMix.pluginColors ?? rawMix.pluginIdentityColors;

  return {
    schema: CONFIG_SCHEMA,
    locale: enumValue(candidate.locale, ["zh-CN", "en-US"], defaults.locale),
    schemeId: schemes.some((item) => item.id === schemeId) ? schemeId : defaults.schemeId,
    mix: {
      ...defaults.mix,
      ...Object.fromEntries(Object.entries(mixEnums).map(([key, values]) => [key, enumValue(rawMix[key], values, defaults.mix[key])])),
      colorPreset: colorPresets.some((item) => item.id === rawMix.colorPreset) ? rawMix.colorPreset : (rawMix.colorPreset === "custom" ? "custom" : defaults.mix.colorPreset),
      baseColorPreset: colorPresets.some((item) => item.id === rawMix.baseColorPreset) ? rawMix.baseColorPreset : (preset?.id ?? defaults.mix.baseColorPreset),
      accent: isHex(rawMix.accent) ? rawMix.accent : fallbackPreset.accent,
      secondaryAccent: isHex(rawMix.secondaryAccent) ? rawMix.secondaryAccent : fallbackPreset.channels[1],
      channels: Array.from({ length: 3 }, (_, index) => isHex(rawChannels?.[index]) ? rawChannels[index] : fallbackPreset.channels[index]),
      pluginColors: Array.from({ length: 3 }, (_, index) => isHex(rawPluginColors?.[index]) ? rawPluginColors[index] : fallbackPreset.pluginColors[index]),
      glassOpacity: clamp(rawMix.glassOpacity ?? rawMix.glass?.opacity, 58, 78, defaults.mix.glassOpacity),
      glassBlur: clamp(rawMix.glassBlur ?? rawMix.glass?.blur, 20, 36, defaults.mix.glassBlur),
      glassRefraction: clamp(rawMix.glassRefraction ?? rawMix.glass?.refraction, 0, 8, defaults.mix.glassRefraction),
      edgeHighlight: clamp(rawMix.edgeHighlight ?? rawMix.glass?.edgeHighlight, 22, 46, defaults.mix.edgeHighlight),
      cornerRadius: clamp(rawMix.cornerRadius, 3, 16, defaults.mix.cornerRadius),
      interfaceScale: clamp(rawMix.interfaceScale, 90, 115, defaults.mix.interfaceScale),
      speed: clamp(rawMix.speed ?? candidate.fluidProgress?.speed, 0.6, 1.8, defaults.mix.speed),
    },
    settings: {
      ...defaults.settings,
      ...Object.fromEntries(Object.entries(settingEnums).map(([key, values]) => [key, enumValue(rawSettings[key], values, defaults.settings[key])])),
      ...Object.fromEntries(["followSystemTheme", "reduceMotion", "lowEndMode", "launchAtLogin", "backgroundUpdates", "autoExportLogs", "logAutoFollow", "stageAnimation", "socialEnabled", "socialUseJinaFallback"].map((key) => [key, rawSettings[key] === undefined ? defaults.settings[key] : Boolean(rawSettings[key])])),
      autoCloseAfterRepairExplicit: rawSettings.autoCloseAfterRepairExplicit === true,
      autoCloseAfterRepair: rawSettings.autoCloseAfterRepairExplicit === true && rawSettings.autoCloseAfterRepair === true,
      logLimit: enumValue(Number(rawSettings.logLimit), [40, 80, 120], defaults.settings.logLimit),
      backupCopies: enumValue(Number(rawSettings.backupCopies), [1, 2, 3], defaults.settings.backupCopies),
      socialMaxPosts: Math.round(clamp(rawSettings.socialMaxPosts, 1, 10, defaults.settings.socialMaxPosts)),
      socialHours: Math.round(clamp(rawSettings.socialHours, 24, 72, defaults.settings.socialHours)),
      socialAccounts: {
        tibo: socialAccounts.tibo === true,
        openai: socialAccounts.openai === true,
        chatgpt: socialAccounts.chatgpt === true,
      },
      pluginVisibility: {
        browser: pluginVisibility.browser === undefined ? true : Boolean(pluginVisibility.browser),
        chrome: pluginVisibility.chrome === undefined ? true : Boolean(pluginVisibility.chrome),
        "computer-use": pluginVisibility["computer-use"] === undefined ? true : Boolean(pluginVisibility["computer-use"]),
      },
    },
  };
}

export function loadUiState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeUiState(JSON.parse(raw)) : createDefaultUiState();
  } catch {
    return createDefaultUiState();
  }
}

export function saveUiState(state) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeUiState(state)));
    return true;
  } catch {
    return false;
  }
}

export function buildConceptConfig({ scheme, mix, settings, progress }) {
  const normalized = normalizeUiState({ schemeId: scheme.id, mix, settings });
  return {
    schema: CONFIG_SCHEMA,
    locale: normalized.locale,
    conceptOnly: true,
    layout: { id: normalized.schemeId },
    appearance: { ...normalized.mix, relationship: "layout x material x color", semanticColorsLocked: true },
    settings: normalized.settings,
    runtimeProtocol: {
      actualProgress: progress,
      displayedProgress: "runtime-derived-monotonic-buffer",
      smoothingMs: [350, 1200],
      noBackwardMotion: true,
      neverExceedsActual: true,
      completionRequiresResultReady: true,
      stagePresentation: "bounded-transition-queue",
    },
    preservedStructure: Object.fromEntries(preservationRows.map((row) => [row.id, true])),
  };
}

export function parseImportedConfig(text) {
  const parsed = typeof text === "string" ? JSON.parse(text) : text;
  if (!parsed || typeof parsed !== "object") throw new Error("配置必须是 JSON 对象");
  return normalizeUiState(parsed);
}

export function downloadJson(config) {
  const payload = JSON.stringify(config, null, 2);
  const blob = new Blob([payload], { type: "application/json;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = `winbridge-v4-settings-${config.layout.id}.json`;
  anchor.click();
  URL.revokeObjectURL(href);
}
