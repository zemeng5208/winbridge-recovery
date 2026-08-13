import { preservationRows, schemes } from "../data/concepts.js";
import { Icon } from "./Icons.jsx";

export default function PreservationMatrix() {
  return (
    <section className="matrix-panel">
      <header><div><span>强制信息架构</span><h2>保留项对照表</h2></div><p>五套方案逐项使用同一组件清单；视觉可变，入口、结构与安全语义不可变。</p></header>
      <div className="matrix-scroll">
        <table>
          <thead><tr><th>红线项目</th><th>可审核证据</th>{schemes.map((scheme) => <th key={scheme.id}>{scheme.name}</th>)}</tr></thead>
          <tbody>{preservationRows.map((row) => <tr key={row.id}><th>{row.label}{row.mode ? <span className="preservation-mode">{row.mode}</span> : null}</th><td>{row.evidence}</td>{schemes.map((scheme) => <td key={scheme.id}><span className="matrix-check"><Icon name="check" size={14}/>保留</span></td>)}</tr>)}</tbody>
        </table>
      </div>
      <footer><Icon name="shield" size={16}/><span>这里的“保留”仅说明概念站已展示；不代表主任务已做最终视觉、运行时或发布验收。</span></footer>
    </section>
  );
}
