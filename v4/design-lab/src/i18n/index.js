import zhCN from "./zh-CN.js";
import enUS from "./en-US.js";

export const SUPPORTED_LOCALES = Object.freeze(["zh-CN", "en-US"]);
// "system" follows the Windows display language that Chromium reports.
export const LANGUAGE_PREFERENCES = Object.freeze(["system", ...SUPPORTED_LOCALES]);
// Existing 4.0.0 behaviour: the interface was Chinese for everyone.
export const DEFAULT_LOCALE = "zh-CN";
// Policy for "system": any Chinese display language uses zh-CN, every other
// display language (English or not) uses en-US.
export const NON_CHINESE_SYSTEM_LOCALE = "en-US";
// Language names are shown in their own language, independent of the UI locale.
export const LANGUAGE_NATIVE_NAMES = Object.freeze({ "zh-CN": "简体中文", "en-US": "English" });

function flatten(tree, prefix = "", into = {}) {
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object") flatten(value, path, into);
    else into[path] = String(value);
  }
  return into;
}

const catalogs = Object.freeze({
  "zh-CN": Object.freeze(flatten(zhCN)),
  "en-US": Object.freeze(flatten(enUS)),
});

export function getCatalog(locale) {
  return catalogs[locale] ?? null;
}

export function normalizeLanguagePreference(value, fallback = DEFAULT_LOCALE) {
  return LANGUAGE_PREFERENCES.includes(value) ? value : fallback;
}

/** Maps a BCP 47 tag such as "zh-TW" or "en-GB" to a supported locale. */
export function matchSupportedLocale(tag) {
  const language = String(tag ?? "").trim().toLowerCase().split(/[-_]/)[0];
  if (language === "zh") return "zh-CN";
  if (language === "en") return "en-US";
  return null;
}

export function getSystemLanguages() {
  if (typeof navigator === "undefined") return [];
  const languages = Array.isArray(navigator.languages) && navigator.languages.length ? navigator.languages : [navigator.language];
  return languages.filter((value) => typeof value === "string" && value.length > 0);
}

export function resolveSystemLocale(systemLanguages = getSystemLanguages()) {
  const primary = systemLanguages.find((tag) => typeof tag === "string" && tag.trim());
  return matchSupportedLocale(primary) ?? NON_CHINESE_SYSTEM_LOCALE;
}

/** Resolves a stored preference (possibly invalid or "system") to a concrete locale. */
export function resolveLocale(preference, systemLanguages = getSystemLanguages()) {
  const normalized = normalizeLanguagePreference(preference);
  return normalized === "system" ? resolveSystemLocale(systemLanguages) : normalized;
}

function interpolate(template, params) {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) => (Object.hasOwn(params, name) ? String(params[name]) : match));
}

/**
 * Looks a key up in the requested catalog, then in the zh-CN source catalog.
 * A key whose "<key>_one" variant exists uses it when params.count === 1.
 * The result is always plain text; callers render it as a React text node.
 */
export function translate(locale, key, params) {
  const chain = [catalogs[locale], catalogs[DEFAULT_LOCALE]].filter(Boolean);
  const singular = params?.count === 1 ? `${key}_one` : null;
  for (const catalog of chain) {
    const template = (singular && catalog[singular]) ?? catalog[key];
    if (template !== undefined) return interpolate(template, params ? resolveParams(locale, params) : params);
  }
  return key;
}

function resolveParams(locale, params) {
  return Object.fromEntries(Object.entries(params).map(([name, value]) => [name, formatMessage((key, nested) => translate(locale, key, nested), value)]));
}

export function createTranslator(locale) {
  const resolved = getCatalog(locale) ? locale : DEFAULT_LOCALE;
  const t = (key, params) => translate(resolved, key, params);
  t.locale = resolved;
  return t;
}

/** A translatable message kept in state so it re-renders when the language changes. */
export function uiMessage(key, params) {
  return params ? { key, params } : { key };
}

/** Formats either raw engine/runtime text (left untranslated) or a uiMessage. */
export function formatMessage(t, value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "object" && typeof value.key === "string") return t(value.key, value.params);
  return String(value?.text ?? "");
}
