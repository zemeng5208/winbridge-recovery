import { upstreamConstraints } from "../data/concepts.js";
import { Icon } from "./Icons.jsx";

export default function UpstreamConstraints() {
  return (
    <section className="matrix-panel constraints-panel">
      <header>
        <div><span>已审核工程输入</span><h2>上游约束采用表</h2></div>
        <p>概念只表达已审核协议，不自行扩展状态机，也不改变写入、磁盘日志或设置持久化时序。</p>
      </header>
      <div className="constraints-summary">
        <span><b>状态接口</b>Diagnosing → ReportReady → AwaitingDecision → Repairing → ResultReady</span>
        <span><b>A 类写入</b>冻结</span>
        <span><b>设置首帧</b>先显示，能力后更新</span>
        <span><b>日志 UI</b>有界、批次、可筛选</span>
      </div>
      <div className="matrix-scroll">
        <table className="constraints-table">
          <thead><tr><th>上游</th><th>已审核结论</th><th>落点界面</th><th>概念交互</th><th>明确不做</th></tr></thead>
          <tbody>{upstreamConstraints.map((row, index) => <tr key={`${row.source}-${index}`}><th>{row.source}</th><td>{row.decision}</td><td>{row.surface}</td><td>{row.behavior}</td><td>{row.frozen}</td></tr>)}</tbody>
        </table>
      </div>
      <footer><Icon name="shield" size={16}/><span>采用状态：界面与配置协议已表达；真实运行性能、WPF 批渲染和磁盘协议均留给总控后续专项实现与验收。</span></footer>
    </section>
  );
}
