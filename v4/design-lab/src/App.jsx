import { useEffect, useMemo, useRef, useState } from "react";
import { schemes } from "./data/concepts.js";
import { buildConceptConfig, createDefaultUiState, downloadJson, loadUiState, normalizeUiState, saveUiState } from "./lib/config.js";
import { NATIVE_SETTINGS_DEFAULTS, mergeNativeSettings, toNativeSettings } from "./lib/nativeSettingsAdapter.js";
import { createRuntimeBridgeMock } from "./lib/runtimeBridgeMock.js";
import LabHeader from "./components/LabHeader.jsx";
import SchemePicker from "./components/SchemePicker.jsx";
import RecoveryWindow from "./components/RecoveryWindow.jsx";
import MixPanel from "./components/MixPanel.jsx";
import PreservationMatrix from "./components/PreservationMatrix.jsx";
import FluidStudy from "./components/FluidStudy.jsx";
import ResearchPanel from "./components/ResearchPanel.jsx";
import UpstreamConstraints from "./components/UpstreamConstraints.jsx";
import JsonPreview from "./components/JsonPreview.jsx";
import { Icon } from "./components/Icons.jsx";
import { I18nProvider, useI18n } from "./i18n/I18nProvider.jsx";
import { uiMessage } from "./i18n/index.js";

// Bounded wait for the runtime's saved interface language before the first
// paint, so an English install does not flash Chinese on every launch.
const LANGUAGE_HYDRATION_WAIT_MS = 1500;

function PreviewHeading({ scheme }) {
  const t = useI18n();
  return <header className="preview-heading"><div><span>实时概念预览</span><h1>{t(`scheme.${scheme.id}.name`)}</h1><p>{t(`scheme.${scheme.id}.summary`)}</p></div><div className="preview-meta"><span>{t(`scheme.${scheme.id}.fit`)}</span><b>保留项 11/11</b></div></header>;
}

export default function App() {
  const runtimeParam = new URLSearchParams(window.location.search).get("runtime");
  if (runtimeParam === "mock" && !window.winBridgeApi) {
    window.winBridgeApi = createRuntimeBridgeMock();
    window.__winBridgeMockCalls = window.winBridgeApi.calls;
  }
  const runtimeMode = Boolean(window.winBridgeApi) || runtimeParam === "1" || runtimeParam === "mock";
  const bridgeAvailable = Boolean(window.winBridgeApi);
  const [view, setView] = useState("preview");
  const [ui, setUi] = useState(() => {
    const storedUi = loadUiState();
    return runtimeMode ? mergeNativeSettings(storedUi, NATIVE_SETTINGS_DEFAULTS) : storedUi;
  });
  // The packaged runtime must not imply that a diagnosis is already underway.
  // Keep the concept lab's illustrative 64% starting point, but make the
  // formal runtime begin at a truthful zero until the user starts read-only
  // diagnosis.
  const [progress, setProgress] = useState(() => runtimeMode ? 0 : 64);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [nativeSettingsHydrated, setNativeSettingsHydrated] = useState(!runtimeMode);
  const [nativeSettingsError, setNativeSettingsError] = useState("");
  const nativeSettingsBaseRef = useRef(NATIVE_SETTINGS_DEFAULTS);
  const nativeSaveBlockedRef = useRef(false);
  const [languageWaitExpired, setLanguageWaitExpired] = useState(!runtimeMode);
  const languageReady = languageWaitExpired || nativeSettingsHydrated || Boolean(nativeSettingsError);

  const scheme = schemes.find((item) => item.id === ui.schemeId) ?? schemes[0];
  const mix = ui.mix;
  const settings = ui.settings;
  const paletteClass = mix.colorPreset === "custom" ? mix.baseColorPreset : mix.colorPreset;
  const setMix = (next) => setUi((current) => ({ ...current, mix: typeof next === "function" ? next(current.mix) : next }));
  const setSettings = (next) => setUi((current) => ({ ...current, settings: typeof next === "function" ? next(current.settings) : next }));

  useEffect(() => {
    const timer = window.setTimeout(() => {
      saveUiState(ui);
      if (nativeSettingsHydrated && !nativeSaveBlockedRef.current && typeof window.winBridgeApi?.saveSettings === "function") {
        Promise.resolve()
          .then(() => window.winBridgeApi.saveSettings(toNativeSettings(ui, nativeSettingsBaseRef.current)))
          .then((savedSettings) => {
            if (savedSettings?.schemaVersion !== 1) throw Object.assign(new Error("Saved runtime settings do not match settings schema v1."), { uiMessage: uiMessage("app.savedSettingsSchemaMismatch") });
            nativeSettingsBaseRef.current = savedSettings;
            setNativeSettingsError("");
          })
          .catch((error) => {
            nativeSaveBlockedRef.current = true;
            setNativeSettingsError(error?.uiMessage ?? (error instanceof Error ? error.message : String(error)));
          });
      }
    }, runtimeMode ? 180 : 60);
    return () => window.clearTimeout(timer);
  }, [ui, runtimeMode, nativeSettingsHydrated]);

  useEffect(() => {
    let active = true;
    if (typeof window.winBridgeApi?.getSettings !== "function") {
      if (runtimeMode) setNativeSettingsError(uiMessage("app.getSettingsMissing"));
      return undefined;
    }
    Promise.resolve().then(() => window.winBridgeApi.getSettings()).then((nativeSettings) => {
      if (!active) return;
      if (nativeSettings?.schemaVersion === 1) {
        nativeSettingsBaseRef.current = nativeSettings;
        setUi((current) => normalizeUiState(mergeNativeSettings(current, nativeSettings)));
        setNativeSettingsHydrated(true);
      } else {
        setNativeSettingsError(uiMessage("app.settingsSchemaMismatch"));
      }
    }).catch((error) => { if (active) setNativeSettingsError(error instanceof Error ? error.message : String(error)); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (languageReady) return undefined;
    const timer = window.setTimeout(() => setLanguageWaitExpired(true), LANGUAGE_HYDRATION_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [languageReady]);

  const config = useMemo(() => buildConceptConfig({ scheme, mix, settings, progress }), [scheme, mix, settings, progress]);

  const chooseScheme = (nextScheme) => {
    setUi((current) => ({ ...current, schemeId: nextScheme.id }));
  };

  // Restoring defaults resets appearance and behaviour but keeps the language
  // the user chose; changing language is always an explicit selection.
  const restoreDefaults = () => setUi((current) => {
    const defaults = createDefaultUiState();
    return { ...defaults, settings: { ...defaults.settings, language: current.settings.language } };
  });
  const importConfig = (candidate) => setUi(normalizeUiState(candidate));

  const previewVisible = view === "preview" || view === "mix";

  if (!languageReady) {
    return <div className={`design-lab palette-${paletteClass} material-${mix.material} runtime-mode`} aria-busy="true" />;
  }

  return (
    <I18nProvider preference={settings.language}>
    <div className={`design-lab palette-${paletteClass} material-${mix.material} ${runtimeMode ? "runtime-mode" : ""}`} data-color-selection={mix.colorPreset} style={{ "--app-accent": mix.accent, "--app-accent-secondary": mix.secondaryAccent }}>
      {!runtimeMode ? <LabHeader view={view} setView={setView} onJsonPreview={() => setJsonOpen(true)} onExport={() => downloadJson(config)} /> : null}
      {!runtimeMode ? <div className="scope-banner"><Icon name="shield" size={16}/><strong>Electron 4.0 交互设计实验室</strong><span>单窗口界面原型 · 独立修复 Worker 架构 · 不连接 3.1.1</span><b>正式文件未触碰</b></div> : null}
      {!runtimeMode ? <SchemePicker selected={scheme} onSelect={chooseScheme}/> : null}
      <main className="lab-main">
        {previewVisible || runtimeMode ? (
          <div className={`workspace-grid ${view === "mix" ? "with-mix" : ""}`}>
            <section className="preview-workspace">
              {!runtimeMode ? <PreviewHeading scheme={scheme}/> : null}
              <div className="app-stage"><RecoveryWindow scheme={scheme} onSchemeChange={chooseScheme} mix={mix} setMix={setMix} settings={settings} setSettings={setSettings} progress={progress} setProgress={setProgress} onRestoreDefaults={restoreDefaults} onExportConfig={() => downloadJson(config)} onImportConfig={importConfig} runtimeMode={runtimeMode} bridgeAvailable={bridgeAvailable} runtimeSettingsHydrated={nativeSettingsHydrated} runtimeSettingsError={nativeSettingsError}/></div>
              {!runtimeMode ? <footer className="preview-note"><span>可交互选择：布局、Glass/Solid、颜色、流体三通道、进度缓冲、阶段状态、齿轮四项菜单与结果页。</span><b>界面确认后再接 Electron 与修复 Worker</b></footer> : null}
            </section>
            {!runtimeMode && view === "mix" ? <MixPanel scheme={scheme} onSchemeChange={chooseScheme} mix={mix} setMix={setMix} settings={settings} setSettings={setSettings} progress={progress} setProgress={setProgress}/> : null}
          </div>
        ) : null}
        {!runtimeMode && view === "fluid" ? <FluidStudy mix={mix} settings={settings}/> : null}
        {!runtimeMode && view === "matrix" ? <PreservationMatrix/> : null}
        {!runtimeMode && view === "constraints" ? <UpstreamConstraints/> : null}
        {!runtimeMode && view === "research" ? <ResearchPanel/> : null}
      </main>
      {!runtimeMode ? <footer className="lab-footer"><span>WinBridge Recovery 4.0 · Design Lab</span><span>配置导出不包含代码、资产或外部状态</span><span>当前阶段：可审核概念，不是发布候选</span></footer> : null}
      {!runtimeMode && jsonOpen ? <JsonPreview config={config} onClose={() => setJsonOpen(false)} onExport={() => downloadJson(config)}/> : null}
    </div>
    </I18nProvider>
  );
}
