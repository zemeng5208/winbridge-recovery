import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { colorPresets, pluginStates, schemes, settingCategories } from "../data/concepts.js";
import { Icon } from "./Icons.jsx";
import { applyColorPreset } from "./MixPanel.jsx";
import { MenuGlyph } from "./BrandIcon.jsx";

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
  return (
    <div className="setting-row">
      <div className="setting-copy">
        <div className="setting-title">
          {title}
          {lock ? <span className="locked-tag">强制安全项</span> : null}
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
}) {
  const [active, setActive] = useState("general");
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
    return settingCategories.filter((item) => item.label.toLowerCase().includes(normalized));
  }, [query]);

  if (!open) return null;

  const setFlag = (key) => (value) => setSettings((current) => ({ ...current, [key]: value }));
  const setPluginVisible = (id, value) => setSettings((current) => ({ ...current, pluginVisibility: { ...current.pluginVisibility, [id]: value } }));
  const importFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      onImportConfig(JSON.parse(await file.text()));
      setImportMessage("配置已导入并即时应用");
    } catch {
      setImportMessage("导入失败：请选择有效的纯 JSON 配置");
    }
    event.target.value = "";
  };
  const pluginIdentityColors = mix.pluginColors ?? ["#4de0a2", "#ffc05b", "#58b7ff"];
  const runtimeSettingsStatus = runtimeSettingsError
    ? { tone: "error", label: "本机设置保存已禁用", detail: runtimeSettingsError }
    : !bridgeAvailable
      ? { tone: "error", label: "本机桥接不可用", detail: "当前只保留界面本地偏好，不会写入运行时设置。" }
      : runtimeSettingsHydrated
        ? { tone: "ready", label: "本机设置已加载", detail: "settings schema v1 已读取；已映射项目可保存到本机运行时。" }
        : { tone: "pending", label: "正在读取本机设置", detail: "窗口已立即显示；读取完成前不会调用原生保存。" };
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

  const content = {
    general: (
      <>
        <Section title="启动协议" description="诊断先行是协议，不是可被误关的装饰开关。">
          <SettingRow title="界面语言" description={runtimeMode ? "界面偏好；当前 alpha 尚未映射到 native settings schema。英文仍为占位。" : "Schema 已预留 locale；英文仍为后续占位。"} control={<SelectControl label="界面语言" value={settings.language} onChange={setFlag("language")}><option value="zh-CN">简体中文</option><option value="en-US">English（占位）</option></SelectControl>} />
          <SettingRow title="启动行为" description={runtimeMode ? "界面偏好；当前 alpha 尚未绑定 Electron 启动策略。诊断与打开 GPT 仍由明确按钮触发。" : "默认进入只读诊断；直接打开 GPT 仍保留独立入口。"} control={<SelectControl label="启动行为" value={settings.launchBehavior} onChange={setFlag("launchBehavior")}><option value="diagnose">只读诊断</option><option value="open-gpt">直接打开 GPT</option></SelectControl>} />
          <SettingRow
            title="启动后进入只读诊断"
            description="先报告发现的问题、影响和预计动作；不会自动写入。"
            lock
            control={<span className="locked-value">始终启用</span>}
          />
          <SettingRow
            title="开机启动"
            description={runtimeMode ? "界面偏好；当前 alpha 尚未绑定系统开机启动执行层。" : "新增设置默认关闭；只有用户主动开启才生效。"}
            control={<Toggle label="开机启动" checked={settings.launchAtLogin} onChange={setFlag("launchAtLogin")} />}
          />
          <SettingRow
            title="后台下载更新"
            description={runtimeMode ? "界面偏好；当前 alpha 尚未绑定更新执行层，不会据此下载或安装。" : "默认关闭，不在后台自动下载或安装。"}
            control={<Toggle label="后台下载更新" checked={settings.backgroundUpdates} onChange={setFlag("backgroundUpdates")} />}
          />
        </Section>
        <Section title="日志显示与保留">
          <SettingRow title="自动跟随最新日志" description={runtimeMode ? "仅控制当前界面的自动滚动；不会改变磁盘日志协议。" : "可随时关闭，完整日志仍保留在文件。"} control={<Toggle label="自动跟随最新日志" checked={settings.logAutoFollow} onChange={setFlag("logAutoFollow")} />} />
          <SettingRow title="日志保留周期" description={runtimeMode ? "界面偏好；当前 alpha 尚未绑定日志文件保留与清理执行层。" : "仅配置概念；本页不写入真实日志。"} control={<SelectControl label="日志保留周期" value={settings.logRetention} onChange={setFlag("logRetention")}><option value="session">仅本次</option><option value="7-days">7 天</option><option value="30-days">30 天</option></SelectControl>} />
        </Section>
        <Section title="修复完成后的行为">
          <SettingRow
            title="停留在结果页"
            description="展示诊断前后、问题、执行动作、结果、未解决项和日志入口。"
            lock
            control={<span className="locked-value">默认行为</span>}
          />
          <SettingRow
            title="修复完成后自动关闭"
            description={runtimeMode ? "已映射到 native settings v1；默认 OFF，只有本次用户显式切换后才允许保存为 ON。" : "默认 OFF；迁移旧设置时也不得自动开启。用户主动开启后才生效。"}
            control={<Toggle label="修复完成后自动关闭" checked={settings.autoCloseAfterRepair} onChange={(value) => setSettings((current) => ({ ...current, autoCloseAfterRepair: value, autoCloseAfterRepairExplicit: true }))} />}
          />
        </Section>
      </>
    ),
    appearance: (
      <>
        <Section title="三级外观关系" description="布局决定信息组织；材质决定表面；颜色只写入独立 Token。">
          <div className="appearance-levels">
            <article><span>1 · 布局</span><strong>{scheme.name}</strong><p>五套真实信息架构</p></article>
            <i>×</i>
            <article><span>2 · 材质</span><strong>{mix.material === "glass" ? "Glass Regular" : "Solid"}</strong><p>玻璃或实体面板</p></article>
            <i>×</i>
            <article><span>3 · 配色</span><strong>{colorPresets.find((item) => item.id === mix.colorPreset)?.name ?? "自定义"}</strong><p>预设与三色通道</p></article>
          </div>
        </Section>
        <Section title="布局" description="切换布局不会重置材质、配色或业务状态。">
          <div className="settings-layout-choices">
            {schemes.map((item) => <button type="button" key={item.id} className={scheme.id === item.id ? "is-selected" : ""} onClick={() => onSchemeChange(item)}><span className={`layout-mini layout-mini-${item.code.toLowerCase()}`} aria-hidden="true"><i/><i/><i/><i/></span><span><strong>{item.name}</strong><small>{item.fit}</small></span></button>)}
          </div>
        </Section>
        <Section title="材质" description="玻璃只用于壳层、导航和浮控；终端与密集正文保持高可读面板。">
          <div className="material-cards">
            <button type="button" className={mix.material === "glass" ? "is-selected" : ""} onClick={() => setMix((current) => ({ ...current, material: "glass" }))}><span className="material-preview preview-glass"/><strong>Glass Regular</strong><small>背景透过、模糊、近似折射、边缘高光</small></button>
            <button type="button" className={mix.material === "solid" ? "is-selected" : ""} onClick={() => setMix((current) => ({ ...current, material: "solid" }))}><span className="material-preview preview-solid"/><strong>Solid</strong><small>实体面板、低开销、高兼容</small></button>
          </div>
        </Section>
        <Section title="颜色预设" description="黑曜为默认；安全语义色不随装饰预设改变。">
          <div className="settings-preset-grid">
            {colorPresets.map((preset) => <button type="button" key={preset.id} className={mix.colorPreset === preset.id ? "is-selected" : ""} onClick={() => applyColorPreset(setMix, preset.id)}><span>{preset.swatches.map((color) => <i key={color} style={{ background: color }}/>)}</span><strong>{preset.name}</strong><small>{preset.description}</small></button>)}
          </div>
          <SettingRow title="自定义强调色" description="只改变装饰与交互强调，不改变危险/警告/成功语义。" control={<label className="color-control"><input type="color" value={mix.accent} onChange={(event) => setMix((current) => ({ ...current, colorPreset: "custom", accent: event.target.value }))}/><code>{mix.accent.toUpperCase()}</code></label>}/>
          <SettingRow title="次强调色" description="用于次级焦点和辅助层次；安全语义色保持锁定。" control={<label className="color-control"><input type="color" value={mix.secondaryAccent} onChange={(event) => setMix((current) => ({ ...current, colorPreset: "custom", secondaryAccent: event.target.value }))}/><code>{mix.secondaryAccent.toUpperCase()}</code></label>}/>
          {pluginStates.map((plugin, index) => <SettingRow key={`plugin-color-${plugin.id}`} title={`${plugin.name} 装饰状态色`} description="用于插件卡身份光与外圈；风险仍由固定语义色、图标和文字表达。" control={<label className="color-control"><input type="color" value={pluginIdentityColors[index]} onChange={(event) => setPluginColor(index, event.target.value)}/><code>{pluginIdentityColors[index].toUpperCase()}</code></label>}/>) }
        </Section>
        <Section title="玻璃参数" description="Solid 模式保留数值但不渲染高成本效果。">
          {[
            ["glassOpacity", "背景不透明度", 58, 78, "%"],
            ["glassBlur", "背景模糊", 20, 36, "px"],
            ["glassRefraction", "近似折射", 0, 8, "px"],
            ["edgeHighlight", "边缘高光", 22, 46, "%"],
          ].map(([key, title, min, max, unit]) => <SettingRow key={key} title={title} description="限制在可读性与性能护栏内。" control={<label className="range-control"><input type="range" min={min} max={max} value={mix[key]} onChange={(event) => setMix((current) => ({ ...current, [key]: Number(event.target.value) }))}/><span>{mix[key]}{unit}</span></label>}/>) }
          <SettingRow title="跟随系统主题" description={runtimeMode ? "已映射到 native settings v1 的 theme 字段；布局与材质仍作为界面偏好独立保存。" : "默认关闭；启用后仍保留当前布局与材质选择。"} control={<Toggle label="跟随系统主题" checked={settings.followSystemTheme} onChange={setFlag("followSystemTheme")} />}/>
          <SettingRow title="界面密度" description="与布局正交，切换布局不会重置。" control={<SelectControl label="界面密度" value={mix.density} onChange={(value) => setMix((current) => ({ ...current, density: value }))}><option value="compact">紧凑</option><option value="balanced">平衡</option><option value="airy">舒展</option></SelectControl>} />
          <SettingRow title="几何圆角" description="只改变组件几何，不改变配色或材质。" control={<SelectControl label="几何圆角" value={mix.geometry} onChange={(value) => setMix((current) => ({ ...current, geometry: value }))}><option value="square">利落</option><option value="soft">柔和</option><option value="round">圆润</option></SelectControl>} />
          <SettingRow title="圆角半径" description="在当前几何模式内精调；不会改变信息布局。" control={<label className="range-control"><input type="range" min="3" max="16" value={mix.cornerRadius} onChange={(event) => setMix((current) => ({ ...current, cornerRadius: Number(event.target.value) }))}/><span>{mix.cornerRadius}px</span></label>} />
          <SettingRow title="界面缩放" description="独立于系统 DPI 的可访问性缩放。" control={<label className="range-control"><input type="range" min="90" max="115" step="5" value={mix.interfaceScale} onChange={(event) => setMix((current) => ({ ...current, interfaceScale: Number(event.target.value) }))}/><span>{mix.interfaceScale}%</span></label>} />
          <SettingRow title="终端主题" description="使用同一语义 Token；亮色配色不会残留黑块。" control={<SelectControl label="终端主题" value={mix.terminalStyle} onChange={(value) => setMix((current) => ({ ...current, terminalStyle: value }))}><option value="structured">结构化</option><option value="calm">柔和</option><option value="contrast">高对比</option></SelectControl>} />
          <SettingRow title="设置导航密度" description="侧栏完整导航或紧凑导航；设置内容与字段保持一致。" control={<SelectControl label="设置导航密度" value={mix.settingsLayout} onChange={(value) => setMix((current) => ({ ...current, settingsLayout: value }))}><option value="sidebar">完整侧栏</option><option value="compact">紧凑侧栏</option></SelectControl>} />
        </Section>
      </>
    ),
    progress: (
      <>
        <Section title="流体通道" description={runtimeMode ? "三色已映射到 native settings v1 的 progressColors；仅改变呈现，不改变真实进度。" : "三色通道均为独立实现，可直接调色。"}>
          {mix.channels.map((channel, index) => (
            <SettingRow
              key={`${channel}-${index}`}
              title={`通道 ${String.fromCharCode(65 + index)}`}
              description={["冷色主体", "中段融合", "完成前沿"][index]}
              control={
                <label className="color-control">
                  <input type="color" value={channel} onChange={(event) => setChannel(index, event.target.value)} />
                  <code>{channel.toUpperCase()}</code>
                </label>
              }
            />
          ))}
        </Section>
        <Section title="动效与降级">
          <SettingRow
            title="流体速度"
            description="速度连续平滑，不使用从左向右漂移的粒子。"
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
          <SettingRow title="进度缓冲" description="actualProgress 跳变时 displayedProgress 单调追赶，不越过真实值。" control={<SelectControl label="进度缓冲" value={settings.animationBuffer} onChange={setFlag("animationBuffer")}><option value="responsive">响应优先</option><option value="balanced">平衡 350–1200ms</option><option value="gentle">柔和</option></SelectControl>} />
          <SettingRow title="阶段环动画" description="engineStageState 与 presentedStageState 使用有界视觉队列。" control={<Toggle label="阶段环动画" checked={settings.stageAnimation} onChange={setFlag("stageAnimation")} />} />
          <SettingRow
            title="减少动态效果"
            description={runtimeMode ? "已映射到 native settings v1；只改变 UI 动效，不影响引擎状态或完成判定。" : "默认关闭；系统 prefers-reduced-motion 仍会被自动尊重。"}
            control={<Toggle label="减少动态效果" checked={settings.reduceMotion} onChange={setFlag("reduceMotion")} />}
          />
          <SettingRow
            title="低端设备模式"
            description="默认关闭；启用后去除位移滤镜和高成本混合，仅保留静态三色面。"
            control={<Toggle label="低端设备模式" checked={settings.lowEndMode} onChange={setFlag("lowEndMode")} />}
          />
        </Section>
      </>
    ),
    diagnostics: (
      <>
        <Section title="日志协议">
          <SettingRow
            title="最大可见日志"
            description="超过上限后折叠为摘要，避免无限堆积。"
            control={
              <SelectControl label="最大可见日志" value={settings.logLimit} onChange={(value) => setFlag("logLimit")(Number(value))}>
                <option value="40">40 行</option>
                <option value="80">80 行</option>
                <option value="120">120 行</option>
              </SelectControl>
            }
          />
          <SettingRow
            title="结构化字段"
            description="故障类别、证据、GitHub 映射、风险、阶段分列输出。"
            lock
            control={<span className="locked-value">固定协议</span>}
          />
          <SettingRow
            title="诊断后自动导出日志"
            description="默认关闭，避免未经用户决定产生额外文件。"
            control={<Toggle label="诊断后自动导出日志" checked={settings.autoExportLogs} onChange={setFlag("autoExportLogs")} />}
          />
        </Section>
      </>
    ),
    safety: (
      <>
        <Section title="安全门槛" description="4.0 视觉重构不得削弱 3.1.1 的边界。">
          <SettingRow title="写入必须由用户决定" description="诊断结束只给出影响与预计动作。" lock control={<span className="locked-value">强制</span>} />
          <SettingRow title="允许根路径" description="使用环境变量表达，不写入个人绝对路径。" lock control={<code>%USERPROFILE%\.codex\plugins</code>} />
          <SettingRow title="顺序一致性" description="写入、替换、注册、回滚、最终核验保持可证明顺序。" lock control={<span className="locked-value">强制</span>} />
        </Section>
      </>
    ),
    backup: (
      <>
        <Section title="备份与回滚">
          <SettingRow title="写入前备份" description="只有用户选择修复后才创建；哈希与清单必须可验证。" lock control={<span className="locked-value">强制</span>} />
          <SettingRow title="备份位置" description={runtimeMode ? "当前 alpha 不向渲染层暴露真实路径；备份由受控修复序列管理。" : "概念值使用环境变量，不包含个人路径。"} control={runtimeMode ? <span className="locked-value">由运行时管理</span> : <code>%LOCALAPPDATA%\WinBridge Recovery\Backups</code>} />
          <SettingRow title="保留备份份数" description={runtimeMode ? "界面偏好；当前 alpha 尚未绑定真实备份轮转执行层。改变此值不会创建、删除或轮转备份。" : "仅保存设置值；概念站不会创建、删除或轮转真实备份。"} control={<SelectControl label="保留备份份数" value={settings.backupCopies} onChange={(value) => setFlag("backupCopies")(Number(value))}><option value="1">1 份</option><option value="2">2 份</option><option value="3">3 份</option></SelectControl>} />
          <SettingRow title="回滚入口" description={runtimeMode ? "当前 preload 契约没有独立回滚命令；不会从设置页伪装执行。" : "结果页和设置中心均可找到，但不会自动执行。"} lock control={<span className="locked-value">{runtimeMode ? "尚未独立接入" : "可见"}</span>} />
        </Section>
      </>
    ),
    plugins: (
      <Section title="三插件独立状态" description="不合并、不用总分替代单项证据。">
        <SettingRow
          title={runtimeMode ? "运行时设置连接" : "网络能力只读探测"}
          description={runtimeMode ? runtimeSettingsStatus.detail : "设置窗口先完成首帧显示；能力信息随后在后台只读更新，不阻塞构造。"}
          control={<span className={`capability-value is-${runtimeMode ? runtimeSettingsStatus.tone : capabilityState}`}>{runtimeMode ? runtimeSettingsStatus.label : capabilityState === "ready" ? "只读更新完成" : "后台更新中…"}</span>}
        />
        {pluginStates.map((plugin) => (
          <SettingRow
            key={plugin.id}
            title={plugin.name}
            description={runtimeMode ? "这里只控制卡片显示与装饰色；插件健康状态仅来自本次只读诊断报告。" : `${plugin.state} · ${plugin.evidence}`}
            control={<div className="plugin-setting-controls"><Toggle label={`显示 ${plugin.name} 详细证据`} checked={settings.pluginVisibility?.[plugin.id] !== false} onChange={(value) => setPluginVisible(plugin.id, value)} /><input aria-label={`${plugin.name} 装饰色`} type="color" value={pluginIdentityColors[pluginStates.findIndex((item) => item.id === plugin.id)]} onChange={(event) => setPluginColor(pluginStates.findIndex((item) => item.id === plugin.id), event.target.value)} /></div>}
          />
        ))}
      </Section>
    ),
    social: (
      <>
        <Section title="社交动态" description="只读网络附加能力；不可用或关闭时不影响诊断、报告、修复和日志。">
          <SettingRow title="启用社交动态" description={runtimeMode ? "已映射到 native social.enabled；本机默认值由运行时加载，保存失败时禁止继续写入。" : "概念开关默认关闭；启用后只展示本地 mock 帖子。"} control={<Toggle label="启用社交动态" checked={settings.socialEnabled} onChange={setFlag("socialEnabled")} />} />
          {[["tibo", "Tibo"], ["openai", "OpenAI"], ["chatgpt", "ChatGPT"]].map(([id, label]) => <SettingRow key={id} title={label} description={runtimeMode ? "固定只读账户；已映射到 native social.accounts，不允许填写任意账户。" : "固定只读账户；概念态默认关闭，不允许填写任意账户。"} control={<Toggle label={`显示 ${label} 动态`} checked={settings.socialAccounts?.[id] === true} onChange={(value) => setSettings((current) => ({ ...current, socialAccounts: { ...current.socialAccounts, [id]: value } }))} />} />)}
        </Section>
        <Section title="范围与翻译" description="请求始终有界：最多 10 条，时间范围 24–72 小时。">
          <SettingRow title="最大帖子数" description={runtimeMode ? "映射 native social.maxPosts，并继续作为单次只读请求与 DOM 上限。" : "只控制单次本地 mock 与 DOM 上限。"} control={<label className="range-control"><input type="range" min="1" max="10" step="1" value={settings.socialMaxPosts} onChange={(event) => setFlag("socialMaxPosts")(Number(event.target.value))}/><span>{settings.socialMaxPosts}</span></label>} />
          <SettingRow title="时间范围" description={runtimeMode ? "映射 native social.hours；不会为填满数量自动扩大范围。" : "默认 48 小时；不会为填满数量自动扩大范围。"} control={<label className="range-control"><input type="range" min="24" max="72" step="12" value={settings.socialHours} onChange={(event) => setFlag("socialHours")(Number(event.target.value))}/><span>{settings.socialHours}h</span></label>} />
          <SettingRow title="翻译目标语言" description={runtimeMode ? "映射 native social.locale；翻译仍按帖子显式触发，失败只影响当前帖子。" : "翻译按帖子显式触发；失败只影响当前本地 mock 帖子。"} control={<SelectControl label="社交动态翻译目标语言" value={settings.socialLocale} onChange={setFlag("socialLocale")}><option value="zh">中文</option><option value="en">English</option><option value="fr">Français</option><option value="es">Español</option><option value="ru">Русский</option><option value="ar">العربية</option></SelectControl>} />
          <SettingRow title="使用 Jina 只读降级" description={runtimeMode ? "映射 native social.useJinaFallback；是否可用仍由运行时安全网络层决定，Renderer 不直接联网。" : "概念开关；本地 mock 不会发起网络请求。"} control={<Toggle label="使用 Jina 只读降级" checked={settings.socialUseJinaFallback} onChange={setFlag("socialUseJinaFallback")} />} />
        </Section>
      </>
    ),
    games: (
      <Section title="小游戏选择" description="齿轮菜单仍只有一个“小游戏”入口；点击后在同一窗口并列两款。">
        <div className="settings-games">
          <article><strong>Snake</strong><p>蛇身、分数、暂停与重开入口保留。</p><button type="button" className="mini-button">预览卡片</button></article>
          <article><strong>Minesweeper</strong><p>难度、计时、雷数与重开入口保留。</p><button type="button" className="mini-button">预览卡片</button></article>
        </div>
      </Section>
    ),
    performance: (
      <>
        <Section title="显示与性能">
          <SettingRow
            title="DPI 预览"
            description="布局使用弹性单位与像素对齐，不依赖固定分辨率。"
            control={
              <SelectControl label="DPI 预览" value={settings.dpi} onChange={setFlag("dpi")}>
                <option value="100">100%</option>
                <option value="125">125%</option>
                <option value="150">150%</option>
                <option value="200">200%</option>
              </SelectControl>
            }
          />
          <SettingRow title="减少动态效果" description="与进度设置联动。" control={<Toggle label="减少动态效果" checked={settings.reduceMotion} onChange={setFlag("reduceMotion")} />} />
          <SettingRow title="低端设备模式" description="与进度设置联动。" control={<Toggle label="低端设备模式" checked={settings.lowEndMode} onChange={setFlag("lowEndMode")} />} />
        </Section>
      </>
    ),
    about: (
      <><Section title="4.0 入口图标系统" description="24×24 数学网格；主品牌图标本轮保持不变。">
        <div className="menu-icon-preview" aria-label="一级菜单原创图标预览">{[["games","小游戏"],["theme","主题"],["observe","看看他"],["settings","更多设置"]].map(([name,label]) => <span key={name}><MenuGlyph name={name} size={24}/><small>{label}</small></span>)}</div>
      </Section><Section title={runtimeMode ? "关于本机运行态" : "关于本概念"}>
        <div className="about-note">
          <strong>{runtimeMode ? "WinBridge Recovery 4.0 alpha · 本机运行态" : "WinBridge Recovery 4.0 · 预发布概念"}</strong>
          <p>{runtimeMode ? "冻结 3.1.1 核心；先执行只读诊断，展示报告后仅在用户明确确认时进入受控修复。" : "仅用于方案选择和配置导出；不连接正式修复引擎，不修改 3.1.1。"}</p>
          <dl>
            <div><dt>流体实现</dt><dd>MIT 上游引擎 + 独立 React 适配层</dd></div>
            <div><dt>流体来源</dt><dd>nebula-capsules-guanyu-lab · MIT · 固定提交 aef3f7d010a721e00404ec8dc69239714e38e77c；分发时保留许可与版权声明</dd></div>
            <div><dt>图标系统</dt><dd>项目原创矢量</dd></div>
            <div><dt>{runtimeMode ? "修复协议" : "正式文件"}</dt><dd>{runtimeMode ? "DiagnoseOnly → ShowReport → AwaitDecision" : "未触碰"}</dd></div>
          </dl>
        </div>
      </Section></>
    ),
  };

  const activeLabel = settingCategories.find((item) => item.id === active)?.label ?? "设置";

  return createPortal(
    <div className={`settings-backdrop palette-${mix.colorPreset === "custom" ? mix.baseColorPreset : mix.colorPreset} material-${mix.material} settings-mode-${mix.settingsLayout}`} data-color-selection={mix.colorPreset} style={{ "--app-accent": mix.accent, "--app-accent-secondary": mix.secondaryAccent, "--app-radius": `${mix.cornerRadius}px` }} role="presentation">
      <section className="settings-window" role="dialog" aria-modal="true" aria-label="WinBridge Recovery 4.0 设置中心">
        <header className="settings-titlebar">
          <div>
            <span className="settings-mark"><MenuGlyph name="settings" size={17} /></span>
            <strong>设置中心</strong>
            <span className={`capability-chip is-${runtimeMode ? runtimeSettingsStatus.tone : capabilityState}`}>{runtimeMode ? `窗口已显示 · ${runtimeSettingsStatus.label}` : capabilityState === "ready" ? "窗口已显示 · 网络能力已异步更新" : "窗口已显示 · 网络能力后台更新中"}</span>
          </div>
          <button type="button" aria-label="关闭设置" onClick={onClose}><Icon name="close" size={17} /></button>
        </header>
        <div className="settings-layout">
          <aside className="settings-sidebar">
            <label className="settings-search">
              <Icon name="search" size={15} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索设置" />
              <kbd>Ctrl F</kbd>
            </label>
            <nav aria-label="设置分类">
              {visibleCategories.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={active === item.id ? "is-active" : ""}
                  onClick={() => setActive(item.id)}
                >
                  <span className="nav-dot" />
                  {item.label}
                </button>
              ))}
            </nav>
            <div className="settings-scope-note">
              <Icon name="shield" size={16} />
              <span>{runtimeMode ? "4.0 alpha 本机设置" : "概念设置"}<br /><small>{runtimeMode ? runtimeSettingsStatus.label : "不写入正式配置"}</small></span>
            </div>
          </aside>
          <main className="settings-content">
            <header className="settings-sticky-title">
              <div><span>设置</span><h3>{activeLabel}</h3></div>
              <span className="settings-scheme">{scheme.name}</span>
            </header>
            <div className="settings-scroll">{content[active]}</div>
          </main>
        </div>
        <footer className="settings-footer">
          <span>{importMessage || (runtimeMode ? runtimeSettingsStatus.detail : "新增设置默认均为关闭；强制安全协议不提供绕过开关。")}</span>
          <input ref={importRef} className="settings-import-input" type="file" accept="application/json,.json" onChange={importFile}/>
          <div><button type="button" className="secondary-button" onClick={onRestoreDefaults}>恢复默认</button><button type="button" className="secondary-button" onClick={() => importRef.current?.click()}>导入 JSON</button><button type="button" className="secondary-button" onClick={onExportConfig}>导出 JSON</button><button type="button" className="primary-button" onClick={onClose}>完成</button></div>
        </footer>
      </section>
    </div>,
    document.body
  );
}
