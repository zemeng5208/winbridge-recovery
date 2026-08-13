import { Icon } from "./Icons.jsx";

export default function JsonPreview({ config, onClose, onExport }) {
  return (
    <div className="json-backdrop">
      <section className="json-dialog" role="dialog" aria-modal="true" aria-label="纯配置 JSON 预览">
        <header><div><Icon name="terminal" size={17}/><strong>纯配置 JSON</strong><span>不含个人路径、密钥或测试账户</span></div><button type="button" aria-label="关闭 JSON 预览" onClick={onClose}><Icon name="close" size={16}/></button></header>
        <pre>{JSON.stringify(config, null, 2)}</pre>
        <footer><span>schema: {config.schema}</span><button type="button" className="export-button" onClick={onExport}><Icon name="download" size={15}/>导出 .json</button></footer>
      </section>
    </div>
  );
}
