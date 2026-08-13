import { colorPresets, schemes } from "../data/concepts.js";

export function applyColorPreset(setMix, presetId) {
  const preset = colorPresets.find((item) => item.id === presetId) ?? colorPresets[0];
  setMix((current) => ({
    ...current,
    colorPreset: preset.id,
    baseColorPreset: preset.id,
    accent: preset.accent,
    secondaryAccent: preset.channels[1],
    channels: [...preset.channels],
    pluginColors: [...preset.pluginColors],
  }));
}

export default function MixPanel({ scheme, onSchemeChange, mix, setMix, settings, setSettings, progress, setProgress }) {
  const setField = (key) => (event) => {
    const value = event.target.type === "range" ? Number(event.target.value) : event.target.value;
    setMix((current) => ({ ...current, [key]: value }));
  };
  const setChannel = (index, value) => {
    setMix((current) => {
      const channels = [...current.channels];
      channels[index] = value;
      return { ...current, colorPreset: "custom", channels };
    });
  };
  const toggle = (key) => setSettings((current) => ({ ...current, [key]: !current[key] }));

  return (
    <aside className="mix-panel">
      <header><span>外观组合器</span><h3>{scheme.name}</h3><p>布局 × 材质 × 配色互相独立；仅更新概念状态。</p></header>
      <div className="mix-section appearance-axis-stack">
        <strong className="mix-section-title">1 · 布局</strong>
        <div className="mini-choice-grid layout-choice-grid">
          {schemes.map((item) => <button type="button" key={item.id} className={scheme.id === item.id ? "is-selected" : ""} onClick={() => onSchemeChange(item)}><span>{item.name}</span></button>)}
        </div>
        <strong className="mix-section-title">2 · 材质</strong>
        <div className="segmented-choice">
          <button type="button" className={mix.material === "glass" ? "is-selected" : ""} onClick={() => setMix((current) => ({ ...current, material: "glass" }))}>Glass Regular</button>
          <button type="button" className={mix.material === "solid" ? "is-selected" : ""} onClick={() => setMix((current) => ({ ...current, material: "solid" }))}>Solid</button>
        </div>
        <strong className="mix-section-title">3 · 配色</strong>
        <div className="preset-list compact-presets">
          {colorPresets.map((preset) => <button type="button" key={preset.id} className={mix.colorPreset === preset.id ? "is-selected" : ""} onClick={() => applyColorPreset(setMix, preset.id)}><span className="preset-dots">{preset.swatches.map((color) => <i key={color} style={{ background: color }}/>)}</span><b>{preset.name}</b></button>)}
        </div>
      </div>
      <div className="mix-section">
        <strong className="mix-section-title">流体演示</strong>
        <label><span>真实进度目标</span><div className="inline-range"><input type="range" min="0" max="99" value={progress} onInput={(event) => setProgress((current) => Math.max(current, Number(event.currentTarget.value)))} onChange={(event) => setProgress((current) => Math.max(current, Number(event.currentTarget.value)))}/><b>{progress}%</b></div></label>
        <label><span>速度</span><div className="inline-range"><input type="range" min="0.6" max="1.8" step="0.1" value={mix.speed} onChange={setField("speed")}/><b>{mix.speed.toFixed(1)}×</b></div></label>
        <div className="channel-controls">
          {mix.channels.map((channel, index) => <label key={`${channel}-${index}`}><span>{String.fromCharCode(65 + index)}</span><input type="color" value={channel} onChange={(event) => setChannel(index, event.target.value)}/><code>{channel}</code></label>)}
        </div>
      </div>
      <div className="mix-section">
        <strong className="mix-section-title">降级与默认值</strong>
        <button type="button" className={`mix-toggle ${settings.reduceMotion ? "is-on" : ""}`} onClick={() => toggle("reduceMotion")}><span><b>减少动态效果</b><small>取消形变，只保留线性宽度过渡</small></span><i>{settings.reduceMotion ? "ON" : "OFF"}</i></button>
        <button type="button" className={`mix-toggle ${settings.lowEndMode ? "is-on" : ""}`} onClick={() => toggle("lowEndMode")}><span><b>低端设备模式</b><small>移除折射和高成本混合辉光</small></span><i>{settings.lowEndMode ? "ON" : "OFF"}</i></button>
        <button type="button" className={`mix-toggle ${settings.autoCloseAfterRepair ? "is-on danger" : ""}`} onClick={() => setSettings((current) => ({ ...current, autoCloseAfterRepair: !current.autoCloseAfterRepair, autoCloseAfterRepairExplicit: true }))}><span><b>修复后自动关闭</b><small>默认必须 OFF；仅用户主动开启</small></span><i>{settings.autoCloseAfterRepair ? "ON" : "OFF"}</i></button>
      </div>
    </aside>
  );
}
