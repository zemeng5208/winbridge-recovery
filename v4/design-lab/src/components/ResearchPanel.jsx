import { sourceEntries } from "../data/concepts.js";

export default function ResearchPanel() {
  return (
    <section className="research-panel">
      <header><div><span>事实 / 推断 / 建议分层</span><h2>来源与许可证清单</h2></div><p>当前概念代码为独立实现。MIT 来源只用于研究模式；未来若文件级复用，必须保留版权和许可声明。</p></header>
      <div className="evidence-triad">
        <article><strong>事实</strong><p>抖音短链解析到视频 ID 7670470019972791162；页面可播放并观察关键帧。Token Monitor、PowerToys、WPF UI、Windows Terminal、DevToys 的仓库许可证均可确认。</p></article>
        <article><strong>推断</strong><p>相邻关键帧支持“纵向等离子前沿 + 局部尾雾 + 稳定文字层”的视觉模型；公开视频仍不足以证明其技术栈或具体算法。</p></article>
        <article><strong>建议</strong><p>正式 WPF 实现前做 GPU / DPI / 降级原型，使用目标帧与代码帧对照；生成图不再作为流体实现依据。</p></article>
      </div>
      <div className="source-table-wrap">
        <table className="source-table"><thead><tr><th>来源</th><th>许可证</th><th>文件级范围</th><th>本轮用途</th></tr></thead><tbody>{sourceEntries.map((entry) => <tr key={entry.name}><th><a href={entry.url} target="_blank" rel="noreferrer">{entry.name}</a><span className={`source-kind ${entry.kind}`}>{entry.kind === "open-source" ? "开源" : "仅研究"}</span></th><td>{entry.license}</td><td><code>{entry.files}</code></td><td>{entry.use}</td></tr>)}</tbody></table>
      </div>
      <div className="license-obligations"><h3>分发义务边界</h3><ul><li>若复制 MIT 软件的代码或实质部分，分发时保留原版权和许可声明。</li><li>截图、视频与作者公开展示不等于代码开源；未授权资产不进入概念站。</li><li>当前 React/Vite 概念实现不含 Token Monitor、PowerToys、WPF UI、Terminal 或 DevToys 代码片段。</li><li>未来复用前锁定仓库版本 / commit、具体文件、修改点和随附 NOTICE；不能只凭仓库首页许可证判断子资产。</li></ul></div>
      <div className="generated-reference-exclusion"><strong>生成图排除声明</strong><p>此前生成图只保留为内部壳层方向记录；其中进度条已被否决，不作为实现、对照或发布资产。概念站没有引用生成图文件。</p></div>
    </section>
  );
}
