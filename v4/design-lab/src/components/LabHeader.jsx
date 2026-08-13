import { Icon } from "./Icons.jsx";

const tabs = [
  ["preview", "方案预览"],
  ["mix", "混搭实验室"],
  ["fluid", "流体对照"],
  ["matrix", "保留项对照"],
  ["constraints", "上游约束采用"],
  ["research", "来源与许可证"],
];

export default function LabHeader({ view, setView, onJsonPreview, onExport }) {
  return (
    <header className="lab-header">
      <div className="lab-brand">
        <span className="lab-brand-mark">W4</span>
        <div>
          <strong>WinBridge Recovery 4.0</strong>
          <span>UI 概念选择实验室</span>
        </div>
      </div>
      <nav className="lab-tabs" aria-label="概念站页面">
        {tabs.map(([id, label]) => (
          <button type="button" key={id} className={view === id ? "is-active" : ""} onClick={() => setView(id)}>{label}</button>
        ))}
      </nav>
      <div className="lab-actions">
        <button type="button" className="ghost-button" onClick={onJsonPreview}><Icon name="terminal" size={15}/>预览 JSON</button>
        <button type="button" className="export-button" onClick={onExport}><Icon name="download" size={15}/>导出纯配置</button>
      </div>
    </header>
  );
}
