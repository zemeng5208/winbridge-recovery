export const NATIVE_SETTINGS_DEFAULTS = Object.freeze({
  schemaVersion: 1,
  theme: "system",
  reduceMotion: false,
  progressColors: Object.freeze(["#4A6CF7", "#8B5CF6", "#22C7A9"]),
  diagnosticConcurrency: 2,
  logBatchSize: 64,
  logMemoryLimitBytes: 1048576,
  autoCloseAfterRepair: false,
  autoCloseAfterRepairExplicit: false,
  social: Object.freeze({
    enabled: true,
    accounts: Object.freeze({ tibo: true, openai: true, chatgpt: true }),
    maxPosts: 4,
    hours: 48,
    useJinaFallback: false,
    locale: "zh",
  }),
});

const validHex = (value) => typeof value === "string" && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value);
const clampInteger = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isInteger(number) ? Math.min(max, Math.max(min, number)) : fallback;
};

const inferNativeTheme = (uiState) => {
  if (uiState?.settings?.followSystemTheme) return "system";
  return ["purple-white", "blue-white", "ice-cyan"].includes(uiState?.mix?.baseColorPreset ?? uiState?.mix?.colorPreset)
    ? "light"
    : "dark";
};

const socialLocale = (value, fallback = "zh") => ["zh", "en", "fr", "es", "ru", "ar"].includes(value) ? value : fallback;

const toNativeSocial = (settings) => ({
  enabled: settings.socialEnabled === undefined ? NATIVE_SETTINGS_DEFAULTS.social.enabled : settings.socialEnabled === true,
  accounts: {
    tibo: settings.socialAccounts?.tibo === undefined ? NATIVE_SETTINGS_DEFAULTS.social.accounts.tibo : settings.socialAccounts.tibo === true,
    openai: settings.socialAccounts?.openai === undefined ? NATIVE_SETTINGS_DEFAULTS.social.accounts.openai : settings.socialAccounts.openai === true,
    chatgpt: settings.socialAccounts?.chatgpt === undefined ? NATIVE_SETTINGS_DEFAULTS.social.accounts.chatgpt : settings.socialAccounts.chatgpt === true,
  },
  maxPosts: clampInteger(settings.socialMaxPosts, 1, 10, NATIVE_SETTINGS_DEFAULTS.social.maxPosts),
  hours: clampInteger(settings.socialHours, 24, 72, NATIVE_SETTINGS_DEFAULTS.social.hours),
  useJinaFallback: settings.socialUseJinaFallback === true,
  locale: socialLocale(settings.socialLocale, NATIVE_SETTINGS_DEFAULTS.social.locale),
});

export function toNativeSettings(uiState, nativeBase = NATIVE_SETTINGS_DEFAULTS) {
  const settings = uiState?.settings ?? {};
  const channels = Array.isArray(uiState?.mix?.channels) ? uiState.mix.channels.filter(validHex).slice(0, 5) : [];
  const autoCloseAfterRepairExplicit = settings.autoCloseAfterRepairExplicit === true;
  const autoCloseAfterRepair = autoCloseAfterRepairExplicit && settings.autoCloseAfterRepair === true;
  return {
    schemaVersion: 1,
    theme: inferNativeTheme(uiState),
    reduceMotion: settings.reduceMotion === true,
    progressColors: channels.length >= 3 ? channels : [...NATIVE_SETTINGS_DEFAULTS.progressColors],
    diagnosticConcurrency: clampInteger(nativeBase?.diagnosticConcurrency, 1, 4, NATIVE_SETTINGS_DEFAULTS.diagnosticConcurrency),
    logBatchSize: clampInteger(nativeBase?.logBatchSize, 16, 128, NATIVE_SETTINGS_DEFAULTS.logBatchSize),
    logMemoryLimitBytes: clampInteger(nativeBase?.logMemoryLimitBytes, 262144, 4194304, NATIVE_SETTINGS_DEFAULTS.logMemoryLimitBytes),
    autoCloseAfterRepair,
    autoCloseAfterRepairExplicit,
    social: toNativeSocial(settings),
  };
}

export function mergeNativeSettings(uiState, nativeValue) {
  if (!nativeValue || nativeValue.schemaVersion !== 1) return uiState;
  const channels = Array.isArray(nativeValue.progressColors)
    ? nativeValue.progressColors.filter(validHex).slice(0, 3)
    : [];
  const nativeSocial = nativeValue.social && typeof nativeValue.social === "object" ? nativeValue.social : null;
  const nativeAccounts = nativeSocial?.accounts && typeof nativeSocial.accounts === "object" ? nativeSocial.accounts : null;
  return {
    ...uiState,
    mix: {
      ...uiState.mix,
      ...(channels.length === 3 ? { channels } : {}),
    },
    settings: {
      ...uiState.settings,
      followSystemTheme: nativeValue.theme === "system",
      reduceMotion: nativeValue.reduceMotion === true,
      autoCloseAfterRepair: nativeValue.autoCloseAfterRepair === true && nativeValue.autoCloseAfterRepairExplicit === true,
      autoCloseAfterRepairExplicit: nativeValue.autoCloseAfterRepairExplicit === true,
      ...(nativeSocial ? {
        socialEnabled: nativeSocial.enabled === true,
        socialAccounts: {
          tibo: nativeAccounts?.tibo === true,
          openai: nativeAccounts?.openai === true,
          chatgpt: nativeAccounts?.chatgpt === true,
        },
        socialMaxPosts: clampInteger(nativeSocial.maxPosts, 1, 10, NATIVE_SETTINGS_DEFAULTS.social.maxPosts),
        socialHours: clampInteger(nativeSocial.hours, 24, 72, NATIVE_SETTINGS_DEFAULTS.social.hours),
        socialUseJinaFallback: nativeSocial.useJinaFallback === true,
        socialLocale: socialLocale(nativeSocial.locale, NATIVE_SETTINGS_DEFAULTS.social.locale),
      } : {}),
    },
  };
}
