import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_LOCALE, createTranslator, getSystemLanguages, resolveLocale } from "./index.js";

const I18nContext = createContext(createTranslator(DEFAULT_LOCALE));

/**
 * Supplies the translator for the resolved interface language. The stored
 * preference may be "system", which follows the Windows display language and
 * re-resolves if Chromium reports a language change.
 */
export function I18nProvider({ preference, children }) {
  const [systemLanguages, setSystemLanguages] = useState(getSystemLanguages);
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const update = () => setSystemLanguages(getSystemLanguages());
    window.addEventListener("languagechange", update);
    return () => window.removeEventListener("languagechange", update);
  }, []);
  const locale = resolveLocale(preference, systemLanguages);
  const t = useMemo(() => createTranslator(locale), [locale]);
  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.lang = locale;
  }, [locale]);
  return <I18nContext.Provider value={t}>{children}</I18nContext.Provider>;
}

/** Returns t(key, params); t.locale is the resolved locale (zh-CN or en-US). */
export function useI18n() {
  return useContext(I18nContext);
}
