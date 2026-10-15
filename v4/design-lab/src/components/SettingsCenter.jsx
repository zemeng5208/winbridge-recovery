import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { colorPresets, pluginStates, schemes, settingCategories } from "../data/concepts.js";
import { Icon } from "./Icons.jsx";
import { applyColorPreset } from "./MixPanel.jsx";
import { MenuGlyph } from "./BrandIcon.jsx";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { LANGUAGE_NATIVE_NAMES, formatMessage, resolveSystemLocale } from "../i18n/index.js";

function Toggle({ checked, onChange, label }) {
  return (
    <button
      className={`toggle ${checked ? "is-on" : ""}`}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

function SettingRow({ title, description, control, lock = false }) {
  const t = useI18n();
  return (
    <div className="setting-row">
      <div className="setting-copy">
        <div className="setting-title">
          {title}
          {lock ? <span className="locked-tag">{t("settings.lockedTag")}</span> : null}
        </div>
        <p>{description}</p>
      </div>
      <div className="setting-control">{control}</div>
    </div>
  );
}

function Section({ title, description, children, defaultOpen = true }) {
  const [expanded, setExpanded] = useState(defaultOpen);
  return (
    <section className={`settings-group ${expanded ? "is-expanded" : ""}`}>
      <button type="button" className="settings-group-toggle" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
        <span><h4>{title}</h4>{description ? <p>{description}</p> : null}</span><b>{expanded ? "−" : "+"}</b>
      </button>
      {expanded ? <div className="settings-group-body">{children}</div> : null}
    </section>
  );
}

function SelectControl({ value, onChange, children, label }) {
  return (
    <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
      {children}
    </select>
  );
}

export default function SettingsCenter({
  open,
  onClose,
  scheme,
  onSchemeChange,
  mix,
  setMix,
  settings,
  setSettings,
  onRestoreDefaults,
  onExportConfig,
  onImportConfig,
  runtimeMode = false,
  bridgeAvailable = false,
  runtimeSettingsHydrated = false,
  runtimeSettingsError = "",
  initialCategory = "general",
}) {
  const t = useI18n();
  const [active, setActive] = useState(initialCategory);
  const [query, setQuery] = useState("");
  const [capabilityState, setCapabilityState] = useState("pending");
  const [importMessage, setImportMessage] = useState("");
  const importRef = useRef(null);

  useEffect(() => {
    if (!open || runtimeMode) return undefined;
    setCapabilityState("pending");
    const timer = window.setTimeout(() => setCapabilityState("ready"), 900);
    return () => window.clearTimeout(timer);
  }, [open, runtimeMode]);

  const visibleCategories = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return settingCategories;
    return settingCategories.filter((item) => t(`settings.category.${item.id}`).toLowerCase().includes(normalized));
  }, [query, t]);

  if (!open) return null;

  const setFlag = (key) => (value) => setSettings((current) => ({ ...current, [key]: value }));
  const setPluginVisible = (id, value) => setSettings((current) => ({ ...current, pluginVisibility: { ...current.pluginVisibility, [id]: value } }));
  const importFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      onImportConfig(JSON.parse(await file.text()));
      setImportMessage("settings.importSuccess");
    } catch {
      setImportMessage("settings.importFailure");
    }
    event.target.value = "";
  };
  const pluginIdentityColors = mix.pluginColors ?? ["#4de0a2", "#ffc05b", "#58b7ff"];
  const runtimeSettingsStatus = runtimeSettingsError
    ? { tone: "error", label: t("settings.status.saveDisabled"), detail: formatMessage(t, runtimeSettingsError) }
    : !bridgeAvailable
      ? { tone: "error", label: t("settings.status.bridgeUnavailable"), detail: t("settings.status.bridgeUnavailableDetail") }
      : runtimeSettingsHydrated
        ? { tone: "ready", label: t("settings.status.loaded"), detail: t("settings.status.loadedDetail") }
        : { tone: "pending", label: t("settings.status.loading"), detail: t("settings.status.loadingDetail") };
  const setChannel = (index, value) => {
    setMix((current) => {
      const channels = [...current.channels];
      channels[index] = value;
      return { ...current, colorPreset: "custom", channels };
    });
  };
  const setPluginColor = (index, value) => {
    setMix((current) => {
      const pluginColors = [...(current.pluginColors ?? pluginIdentityColors)];
      pluginColors[index] = value;
      return { ...current, colorPreset: "custom", pluginColors };
    });
  };
  const schemeName = (item) => t(`scheme.${item.id}.name`);
  const systemLanguageName = LANGUAGE_NATIVE_NAMES[resolveSystemLocale()];

  const content = {
    general: (
      <>
        <Section title={t("settings.general.protocol")} description={t("settings.general.protocolDesc")}>
          <SettingRow title={t("settings.general.language")} description={runtimeMode ? t("settings.general.languageDescRuntime") : t("settings.general.languageDescConcept")} control={<SelectControl label={t("settings.general.language")} value={settings.language} onChange={setFlag("language")}><option value="system">{t("settings.general.languageSystem", { language: systemLanguageName })}</option><option value="zh-CN" lang="zh-CN">{LANGUAGE_NATIVE_NAMES["zh-CN"]}</option><option value="en-US" lang="en-US">{LANGUAGE_NATIVE_NAMES["en-US"]}</option></SelectControl>} />
          <SettingRow title={t("settings.general.launch")} description={runtimeMode ? t("settings.general.launchDescRuntime") : t("settings.general.launchDescConcept")} control={<SelectControl label={t("settings.general.launch")} value={settings.launchBehavior} onChange={setFlag("launchBehavior")}><option value="diagnose">{t("settings.general.launchDiagnose")}</option><option value="open-gpt">{t("settings.general.launchOpenGpt")}</option></SelectControl>} />
          <SettingRow
            title={t("settings.general.diagnoseOnStart")}
            description={t("settings.general.diagnoseOnStartDesc")}
            lock
            control={<span className="locked-value">{t("settings.general.alwaysOn")}</span>}
          />
          <SettingRow
            title={t("settings.general.launchAtLogin")}
            description={runtimeMode ? t("settings.general.launchAtLoginDescRuntime") : t("settings.general.launchAtLoginDescConcept")}
            control={<Toggle label={t("settings.general.launchAtLogin")} checked={settings.launchAtLogin} onChange={setFlag("launchAtLogin")} />}
          />
          <SettingRow
            title={t("settings.general.backgroundUpdates")}
            description={runtimeMode ? t("settings.general.backgroundUpdatesDescRuntime") : t("settings.general.backgroundUpdatesDescConcept")}
            control={<Toggle label={t("settings.general.backgroundUpdates")} checked={settings.backgroundUpdates} onChange={setFlag("backgroundUpdates")} />}
          />
        </Section>
        <Section title={t("settings.logs.title")}>
          <SettingRow title={t("settings.logs.follow")} description={runtimeMode ? t("settings.logs.followDescRuntime") : t("settings.logs.followDescConcept")} control={<Toggle label={t("settings.logs.follow")} checked={settings.logAutoFollow} onChange={setFlag("logAutoFollow")} />} />
          <SettingRow title={t("settings.logs.retention")} description={runtimeMode ? t("settings.logs.retentionDescRuntime") : t("settings.logs.retentionDescConcept")} control={<SelectControl label={t("settings.logs.retention")} value={settings.logRetention} onChange={setFlag("logRetention")}><option value="session">{t("settings.logs.retentionSession")}</option><option value="7-days">{t("settings.logs.retention7")}</option><option value="30-days">{t("settings.logs.retention30")}</option></SelectControl>} />
        </Section>
        <Section title={t("settings.afterRepair.title")}>
          <SettingRow
            title={t("settings.afterRepair.stay")}
            description={t("settings.afterRepair.stayDesc")}
            lock
            control={<span className="locked-value">{t("settings.afterRepair.defaultBehavior")}</span>}
          />
          <SettingRow
            title={t("settings.afterRepair.autoClose")}
            description={runtimeMode ? t("settings.afterRepair.autoCloseDescRuntime") : t("settings.afterRepair.autoCloseDescConcept")}
            control={<Toggle label={t("settings.afterRepair.autoClose")} checked={settings.autoCloseAfterRepair} onChange={(value) => setSettings((current) => ({ ...current, autoCloseAfterRepair: value, autoCloseAfterRepairExplicit: true }))} />}
          />
        </Section>
      </>
    ),
    appearance: (
      <>
        <Section title={t("settings.appearance.levels")} description={t("settings.appearance.levelsDesc")}>
          <div className="appearance-levels">
            <article><span>{t("settings.appearance.level1")}</span><strong>{schemeName(scheme)}</strong><p>{t("settings.appearance.level1Hint")}</p></article>
            <i>×</i>
            <article><span>{t("settings.appearance.level2")}</span><strong>{mix.material === "glass" ? "Glass Regular" : "Solid"}</strong><p>{t("settings.appearance.level2Hint")}</p></article>
            <i>×</i>
            <article><span>{t("settings.appearance.level3")}</span><strong>{colorPresets.some((item) => item.id === mix.colorPreset) ? t(`colorPreset.${mix.colorPreset}.name`) : t("colorPreset.custom")}</strong><p>{t("settings.appearance.level3Hint")}</p></article>
          </div>
        </Section>
        <Section title={t("settings.appearance.layout")} description={t("settings.appearance.layoutDesc")}>
          <div className="settings-layout-choices">
            {schemes.map((item) => <button type="button" key={item.id} className={scheme.id === item.id ? "is-selected" : ""} onClick={() => onSchemeChange(item)}><span className={`layout-mini layout-mini-${item.code.toLowerCase()}`} aria-hidden="true"><i/><i/><i/><i/></span><span><strong>{schemeName(item)}</strong><small>{t(`scheme.${item.id}.fit`)}</small></span></button>)}
          </div>
        </Section>
        <Section title={t("settings.appearance.material")} description={t("settings.appearance.materialDesc")}>
          <div className="material-cards">
            <button type="button" className={mix.material === "glass" ? "is-selected" : ""} onClick={() => setMix((current) => ({ ...current, material: "glass" }))}><span className="material-preview preview-glass"/><strong>Glass Regular</strong><small>{t("settings.appearance.glassHint")}</small></button>
            <button type="button" className={mix.material === "solid" ? "is-selected" : ""} onClick={() => setMix((current) => ({ ...current, material: "solid" }))}><span className="material-preview preview-solid"/><strong>Solid</strong><small>{t("settings.appearance.solidHint")}</small></button>
          </div>
        </Section>
        <Section title={t("settings.appearance.presets")} description={t("settings.appearance.presetsDesc")}>
          <div className="settings-preset-grid">
            {colorPresets.map((preset) => <button type="button" key={preset.id} className={mix.colorPreset === preset.id ? "is-selected" : ""} onClick={() => applyColorPreset(setMix, preset.id)}><span>{preset.swatches.map((color) => <i key={color} style={{ background: color }}/>)}</span><strong>{t(`colorPreset.${preset.id}.name`)}</strong><small>{t(`colorPreset.${preset.id}.description`)}</small></button>)}
          </div>
          <SettingRow title={t("settings.appearance.accent")} description={t("settings.appearance.accentDesc")} control={<label className="color-control"><input type="color" value={mix.accent} onChange={(event) => setMix((current) => ({ ...current, colorPreset: "custom", accent: event.target.value }))}/><code>{mix.accent.toUpperCase()}</code></label>}/>
          <SettingRow title={t("settings.appearance.secondaryAccent")} description={t("settings.appearance.secondaryAccentDesc")} control={<label className="color-control"><input type="color" value={mix.secondaryAccent} onChange={(event) => setMix((current) => ({ ...current, colorPreset: "custom", secondaryAccent: event.target.value }))}/><code>{mix.secondaryAccent.toUpperCase()}</code></label>}/>
          {pluginStates.map((plugin, index) => <SettingRow key={`plugin-color-${plugin.id}`} title={t("settings.appearance.pluginColor", { plugin: plugin.name })} description={t("settings.appearance.pluginColorDesc")} control={<label className="color-control"><input type="color" value={pluginIdentityColors[index]} onChange={(event) => setPluginColor(index, event.target.value)}/><code>{pluginIdentityColors[index].toUpperCase()}</code></label>}/>) }
        </Section>
        <Section title={t("settings.appearance.glass")} description={t("settings.appearance.glassDesc")}>
          {[
            ["glassOpacity", 58, 78, "%"],
            ["glassBlur", 20, 36, "px"],
            ["glassRefraction", 0, 8, "px"],
            ["edgeHighlight", 22, 46, "%"],
          ].map(([key, min, max, unit]) => <SettingRow key={key} title={t(`settings.appearance.${key}`)} description={t("settings.appearance.glassGuard")} control={<label className="range-control"><input type="range" min={min} max={max} value={mix[key]} onChange={(event) => setMix((current) => ({ ...current, [key]: Number(event.target.value) }))}/><span>{mix[key]}{unit}</span></label>}/>) }
          <SettingRow title={t("settings.appearance.followSystemTheme")} description={runtimeMode ? t("settings.appearance.followSystemThemeDescRuntime") : t("settings.appearance.followSystemThemeDescConcept")} control={<Toggle label={t("settings.appearance.followSystemTheme")} checked={settings.followSystemTheme} onChange={setFlag("followSystemTheme")} />}/>
          <SettingRow title={t("settings.appearance.density")} description={t("settings.appearance.densityDesc")} control={<SelectControl label={t("settings.appearance.density")} value={mix.density} onChange={(value) => setMix((current) => ({ ...current, density: value }))}><option value="compact">{t("settings.appearance.densityCompact")}</option><option value="balanced">{t("settings.appearance.densityBalanced")}</option><option value="airy">{t("settings.appearance.densityAiry")}</option></SelectControl>} />
          <SettingRow title={t("settings.appearance.geometry")} description={t("settings.appearance.geometryDesc")} control={<SelectControl label={t("settings.appearance.geometry")} value={mix.geometry} onChange={(value) => setMix((current) => ({ ...current, geometry: value }))}><option value="square">{t("settings.appearance.geometrySquare")}</option><option value="soft">{t("settings.appearance.geometrySoft")}</option><option value="round">{t("settings.appearance.geometryRound")}</option></SelectControl>} />
          <SettingRow title={t("settings.appearance.radius")} description={t("settings.appearance.radiusDesc")} control={<label className="range-control"><input type="range" min="3" max="16" value={mix.cornerRadius} onChange={(event) => setMix((current) => ({ ...current, cornerRadius: Number(event.target.value) }))}/><span>{mix.cornerRadius}px</span></label>} />
          <SettingRow title={t("settings.appearance.scale")} description={t("settings.appearance.scaleDesc")} control={<label className="range-control"><input type="range" min="90" max="115" step="5" value={mix.interfaceScale} onChange={(event) => setMix((current) => ({ ...current, interfaceScale: Number(event.target.value) }))}/><span>{mix.interfaceScale}%</span></label>} />
          <SettingRow title={t("settings.appearance.terminal")} description={t("settings.appearance.terminalDesc")} control={<SelectControl label={t("settings.appearance.terminal")} value={mix.terminalStyle} onChange={(value) => setMix((current) => ({ ...current, terminalStyle: value }))}><option value="structured">{t("settings.appearance.terminalStructured")}</option><option value="calm">{t("settings.appearance.terminalCalm")}</option><option value="contrast">{t("settings.appearance.terminalContrast")}</option></SelectControl>} />
          <SettingRow title={t("settings.appearance.settingsNav")} description={t("settings.appearance.settingsNavDesc")} control={<SelectControl label={t("settings.appearance.settingsNav")} value={mix.settingsLayout} onChange={(value) => setMix((current) => ({ ...current, settingsLayout: value }))}><option value="sidebar">{t("settings.appearance.settingsNavSidebar")}</option><option value="compact">{t("settings.appearance.settingsNavCompact")}</option></SelectControl>} />
        </Section>
      </>
    ),
    progress: (
      <>
        <Section title={t("settings.progress.channels")} description={runtimeMode ? t("settings.progress.channelsDescRuntime") : t("settings.progress.channelsDescConcept")}>
          {mix.channels.map((channel, index) => (
            <SettingRow
              key={`${channel}-${index}`}
              title={t("settings.progress.channel", { letter: String.fromCharCode(65 + index) })}
              description={t(`settings.progress.channelHint${index}`)}
              control={
                <label className="color-control">
                  <input type="color" value={channel} onChange={(event) => setChannel(index, event.target.value)} />
                  <code>{channel.toUpperCase()}</code>
                </label>
              }
            />
          ))}
        </Section>
        <Section title={t("settings.progress.motion")}>
          <SettingRow
            title={t("settings.progress.speed")}
            description={t("settings.progress.speedDesc")}
            control={
              <label className="range-control">
                <input
                  type="range"
                  min="0.6"
                  max="1.8"
                  step="0.1"
                  value={mix.speed}
                  onChange={(event) => setMix((current) => ({ ...current, speed: Number(event.target.value) }))}
                />
                <span>{mix.speed.toFixed(1)}×</span>
              </label>
            }
          />
          <SettingRow title={t("settings.progress.buffer")} description={t("settings.progress.bufferDesc")} control={<SelectControl label={t("settings.progress.buffer")} value={settings.animationBuffer} onChange={setFlag("animationBuffer")}><option value="responsive">{t("settings.progress.bufferResponsive")}</option><option value="balanced">{t("settings.progress.bufferBalanced")}</option><option value="gentle">{t("settings.progress.bufferGentle")}</option></SelectControl>} />
          <SettingRow title={t("settings.progress.stageAnimation")} description={t("settings.progress.stageAnimationDesc")} control={<Toggle label={t("settings.progress.stageAnimation")} checked={settings.stageAnimation} onChange={setFlag("stageAnimation")} />} />
          <SettingRow
            title={t("settings.progress.reduceMotion")}
            description={runtimeMode ? t("settings.progress.reduceMotionDescRuntime") : t("settings.progress.reduceMotionDescConcept")}
            control={<Toggle label={t("settings.progress.reduceMotion")} checked={settings.reduceMotion} onChange={setFlag("reduceMotion")} />}
          />
          <SettingRow
            title={t("settings.progress.lowEnd")}
            description={t("settings.progress.lowEndDesc")}
            control={<Toggle label={t("settings.progress.lowEnd")} checked={settings.lowEndMode} onChange={setFlag("lowEndMode")} />}
          />
        </Section>
      </>
    ),
    diagnostics: (
      <>
        <Section title={t("settings.diagnostics.protocol")}>
          <SettingRow
            title={t("settings.diagnostics.maxLogs")}
            description={t("settings.diagnostics.maxLogsDesc")}
            control={
              <SelectControl label={t("settings.diagnostics.maxLogs")} value={settings.logLimit} onChange={(value) => setFlag("logLimit")(Number(value))}>
                <option value="40">{t("settings.diagnostics.lines", { count: 40 })}</option>
                <option value="80">{t("settings.diagnostics.lines", { count: 80 })}</option>
                <option value="120">{t("settings.diagnostics.lines", { count: 120 })}</option>
              </SelectControl>
            }
          />
          <SettingRow
            title={t("settings.diagnostics.structured")}
            description={t("settings.diagnostics.structuredDesc")}
            lock
            control={<span className="locked-value">{t("settings.diagnostics.fixedProtocol")}</span>}
          />
          <SettingRow
            title={t("settings.diagnostics.autoExport")}
            description={t("settings.diagnostics.autoExportDesc")}
            control={<Toggle label={t("settings.diagnostics.autoExport")} checked={settings.autoExportLogs} onChange={setFlag("autoExportLogs")} />}
          />
        </Section>
      </>
    ),
    safety: (
      <>
        <Section title={t("settings.safety.gates")} description={t("settings.safety.gatesDesc")}>
          <SettingRow title={t("settings.safety.userDecides")} description={t("settings.safety.userDecidesDesc")} lock control={<span className="locked-value">{t("settings.safety.enforced")}</span>} />
          <SettingRow title={t("settings.safety.allowedRoot")} description={t("settings.safety.allowedRootDesc")} lock control={<code>%USERPROFILE%\.codex\plugins</code>} />
          <SettingRow title={t("settings.safety.ordering")} description={t("settings.safety.orderingDesc")} lock control={<span className="locked-value">{t("settings.safety.enforced")}</span>} />
        </Section>
      </>
    ),
    backup: (
      <>
        <Section title={t("settings.backup.title")}>
          <SettingRow title={t("settings.backup.beforeWrite")} description={t("settings.backup.beforeWriteDesc")} lock control={<span className="locked-value">{t("settings.safety.enforced")}</span>} />
          <SettingRow title={t("settings.backup.location")} description={runtimeMode ? t("settings.backup.locationDescRuntime") : t("settings.backup.locationDescConcept")} control={runtimeMode ? <span className="locked-value">{t("settings.backup.managedByRuntime")}</span> : <code>%LOCALAPPDATA%\WinBridge Recovery\Backups</code>} />
          <SettingRow title={t("settings.backup.copies")} description={runtimeMode ? t("settings.backup.copiesDescRuntime") : t("settings.backup.copiesDescConcept")} control={<SelectControl label={t("settings.backup.copies")} value={settings.backupCopies} onChange={(value) => setFlag("backupCopies")(Number(value))}><option value="1">{t("settings.backup.copiesValue", { count: 1 })}</option><option value="2">{t("settings.backup.copiesValue", { count: 2 })}</option><option value="3">{t("settings.backup.copiesValue", { count: 3 })}</option></SelectControl>} />
          <SettingRow title={t("settings.backup.rollback")} description={runtimeMode ? t("settings.backup.rollbackDescRuntime") : t("settings.backup.rollbackDescConcept")} lock control={<span className="locked-value">{runtimeMode ? t("settings.backup.rollbackNotConnected") : t("settings.backup.rollbackVisible")}</span>} />
        </Section>
      </>
    ),
    plugins: (
      <Section title={t("settings.plugins.title")} description={t("settings.plugins.titleDesc")}>
        <SettingRow
          title={runtimeMode ? t("settings.plugins.runtimeConnection") : t("settings.plugins.networkProbe")}
          description={runtimeMode ? runtimeSettingsStatus.detail : t("settings.plugins.networkProbeDesc")}
          control={<span className={`capability-value is-${runtimeMode ? runtimeSettingsStatus.tone : capabilityState}`}>{runtimeMode ? runtimeSettingsStatus.label : capabilityState === "ready" ? t("settings.plugins.probeReady") : t("settings.plugins.probePending")}</span>}
        />
        {pluginStates.map((plugin) => (
          <SettingRow
            key={plugin.id}
            title={plugin.name}
            description={runtimeMode ? t("settings.plugins.pluginDescRuntime") : `${t(plugin.state)} · ${t(plugin.evidence)}`}
            control={<div className="plugin-setting-controls"><Toggle label={t("settings.plugins.showEvidence", { plugin: plugin.name })} checked={settings.pluginVisibility?.[plugin.id] !== false} onChange={(value) => setPluginVisible(plugin.id, value)} /><input aria-label={t("settings.plugins.colorAria", { plugin: plugin.name })} type="color" value={pluginIdentityColors[pluginStates.findIndex((item) => item.id === plugin.id)]} onChange={(event) => setPluginColor(pluginStates.findIndex((item) => item.id === plugin.id), event.target.value)} /></div>}
          />
        ))}
      </Section>
    ),
    social: (
      <>
        <Section title={t("settings.social.title")} description={t("settings.social.titleDesc")}>
          <SettingRow title={t("settings.social.enable")} description={runtimeMode ? t("settings.social.enableDescRuntime") : t("settings.social.enableDescConcept")} control={<Toggle label={t("settings.social.enable")} checked={settings.socialEnabled} onChange={setFlag("socialEnabled")} />} />
          {[["tibo", "Tibo"], ["openai", "OpenAI"], ["chatgpt", "ChatGPT"]].map(([id, label]) => <SettingRow key={id} title={label} description={runtimeMode ? t("settings.social.accountDescRuntime") : t("settings.social.accountDescConcept")} control={<Toggle label={t("settings.social.showAccount", { account: label })} checked={settings.socialAccounts?.[id] === true} onChange={(value) => setSettings((current) => ({ ...current, socialAccounts: { ...current.socialAccounts, [id]: value } }))} />} />)}
        </Section>
        <Section title={t("settings.social.scope")} description={t("settings.social.scopeDesc")}>
          <SettingRow title={t("settings.social.maxPosts")} description={runtimeMode ? t("settings.social.maxPostsDescRuntime") : t("settings.social.maxPostsDescConcept")} control={<label className="range-control"><input type="range" min="1" max="10" step="1" value={settings.socialMaxPosts} onChange={(event) => setFlag("socialMaxPosts")(Number(event.target.value))}/><span>{settings.socialMaxPosts}</span></label>} />
          <SettingRow title={t("settings.social.hours")} description={runtimeMode ? t("settings.social.hoursDescRuntime") : t("settings.social.hoursDescConcept")} control={<label className="range-control"><input type="range" min="24" max="72" step="12" value={settings.socialHours} onChange={(event) => setFlag("socialHours")(Number(event.target.value))}/><span>{settings.socialHours}h</span></label>} />
          <SettingRow title={t("settings.social.targetLocale")} description={runtimeMode ? t("settings.social.targetLocaleDescRuntime") : t("settings.social.targetLocaleDescConcept")} control={<SelectControl label={t("settings.social.targetLocaleAria")} value={settings.socialLocale} onChange={setFlag("socialLocale")}><option value="zh" lang="zh">中文</option><option value="en" lang="en">English</option><option value="fr" lang="fr">Français</option><option value="es" lang="es">Español</option><option value="ru" lang="ru">Русский</option><option value="ar" lang="ar">العربية</option></SelectControl>} />
          <SettingRow title={t("settings.social.jina")} description={runtimeMode ? t("settings.social.jinaDescRuntime") : t("settings.social.jinaDescConcept")} control={<Toggle label={t("settings.social.jina")} checked={settings.socialUseJinaFallback} onChange={setFlag("socialUseJinaFallback")} />} />
        </Section>
      </>
    ),
    games: (
      <Section title={t("settings.games.title")} description={t("settings.games.titleDesc")}>
        <div className="settings-games">
          <article><strong>Snake</strong><p>{t("settings.games.snakeDesc")}</p><button type="button" className="mini-button">{t("settings.games.previewCard")}</button></article>
          <article><strong>Minesweeper</strong><p>{t("settings.games.minesweeperDesc")}</p><button type="button" className="mini-button">{t("settings.games.previewCard")}</button></article>
        </div>
      </Section>
    ),
    performance: (
      <>
        <Section title={t("settings.performance.title")}>
          <SettingRow
            title={t("settings.performance.dpi")}
            description={t("settings.performance.dpiDesc")}
            control={
              <SelectControl label={t("settings.performance.dpi")} value={settings.dpi} onChange={setFlag("dpi")}>
                <option value="100">100%</option>
                <option value="125">125%</option>
                <option value="150">150%</option>
                <option value="200">200%</option>
              </SelectControl>
            }
          />
          <SettingRow title={t("settings.progress.reduceMotion")} description={t("settings.performance.linked")} control={<Toggle label={t("settings.progress.reduceMotion")} checked={settings.reduceMotion} onChange={setFlag("reduceMotion")} />} />
          <SettingRow title={t("settings.progress.lowEnd")} description={t("settings.performance.linked")} control={<Toggle label={t("settings.progress.lowEnd")} checked={settings.lowEndMode} onChange={setFlag("lowEndMode")} />} />
        </Section>
      </>
    ),
    about: (
      <><Section title={t("settings.about.icons")} description={t("settings.about.iconsDesc")}>
        <div className="menu-icon-preview" aria-label={t("settings.about.iconsAria")}>{[["games", "gear.games"], ["theme", "gear.theme"], ["observe", "gear.social"], ["settings", "gear.settings"]].map(([name, labelKey]) => <span key={name}><MenuGlyph name={name} size={24}/><small>{t(labelKey)}</small></span>)}</div>
      </Section><Section title={runtimeMode ? t("settings.about.runtimeTitle") : t("settings.about.conceptTitle")}>
        <div className="about-note">
          <strong>{runtimeMode ? t("settings.about.runtimeName") : t("settings.about.conceptName")}</strong>
          <p>{runtimeMode ? t("settings.about.runtimeBody") : t("settings.about.conceptBody")}</p>
          <dl>
            <div><dt>{t("settings.about.fluidImpl")}</dt><dd>{t("settings.about.fluidImplValue")}</dd></div>
            <div><dt>{t("settings.about.fluidSource")}</dt><dd>{t("settings.about.fluidSourceValue")}</dd></div>
            <div><dt>{t("settings.about.iconSystem")}</dt><dd>{t("settings.about.iconSystemValue")}</dd></div>
            <div><dt>{runtimeMode ? t("settings.about.repairProtocol") : t("settings.about.officialFiles")}</dt><dd>{runtimeMode ? "DiagnoseOnly → ShowReport → AwaitDecision" : t("settings.about.untouched")}</dd></div>
          </dl>
        </div>
      </Section></>
    ),
  };

  const activeLabel = settingCategories.some((item) => item.id === active) ? t(`settings.category.${active}`) : t("settings.heading");

  return createPortal(
    <div className={`settings-backdrop palette-${mix.colorPreset === "custom" ? mix.baseColorPreset : mix.colorPreset} material-${mix.material} settings-mode-${mix.settingsLayout}`} data-color-selection={mix.colorPreset} style={{ "--app-accent": mix.accent, "--app-accent-secondary": mix.secondaryAccent, "--app-radius": `${mix.cornerRadius}px` }} role="presentation">
      <section className="settings-window" role="dialog" aria-modal="true" aria-label={t("settings.dialogAria")}>
        <header className="settings-titlebar">
          <div>
            <span className="settings-mark"><MenuGlyph name="settings" size={17} /></span>
            <strong>{t("settings.title")}</strong>
            <span className={`capability-chip is-${runtimeMode ? runtimeSettingsStatus.tone : capabilityState}`}>{runtimeMode ? t("settings.chipRuntime", { status: runtimeSettingsStatus.label }) : capabilityState === "ready" ? t("settings.chipConceptReady") : t("settings.chipConceptPending")}</span>
          </div>
          <button type="button" aria-label={t("settings.closeAria")} onClick={onClose}><Icon name="close" size={17} /></button>
        </header>
        <div className="settings-layout">
          <aside className="settings-sidebar">
            <label className="settings-search">
              <Icon name="search" size={15} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("settings.searchPlaceholder")} aria-label={t("settings.searchPlaceholder")} />
              <kbd>Ctrl F</kbd>
            </label>
            <nav aria-label={t("settings.navAria")}>
              {visibleCategories.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={active === item.id ? "is-active" : ""}
                  onClick={() => setActive(item.id)}
                >
                  <span className="nav-dot" />
                  {t(`settings.category.${item.id}`)}
                </button>
              ))}
            </nav>
            <div className="settings-scope-note">
              <Icon name="shield" size={16} />
              <span>{runtimeMode ? t("settings.scopeRuntime") : t("settings.scopeConcept")}<br /><small>{runtimeMode ? runtimeSettingsStatus.label : t("settings.scopeConceptNote")}</small></span>
            </div>
          </aside>
          <main className="settings-content">
            <header className="settings-sticky-title">
              <div><span>{t("settings.heading")}</span><h3>{activeLabel}</h3></div>
              <span className="settings-scheme">{schemeName(scheme)}</span>
            </header>
            <div className="settings-scroll">{content[active]}</div>
          </main>
        </div>
        <footer className="settings-footer">
          <span>{importMessage ? t(importMessage) : (runtimeMode ? runtimeSettingsStatus.detail : t("settings.footerDefault"))}</span>
          <input ref={importRef} className="settings-import-input" type="file" accept="application/json,.json" onChange={importFile}/>
          <div><button type="button" className="secondary-button" onClick={onRestoreDefaults}>{t("settings.restoreDefaults")}</button><button type="button" className="secondary-button" onClick={() => importRef.current?.click()}>{t("settings.importJson")}</button><button type="button" className="secondary-button" onClick={onExportConfig}>{t("settings.exportJson")}</button><button type="button" className="primary-button" onClick={onClose}>{t("settings.done")}</button></div>
        </footer>
      </section>
    </div>,
    document.body
  );
}
