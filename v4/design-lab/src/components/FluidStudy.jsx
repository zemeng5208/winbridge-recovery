import { fluidObservations } from "../data/concepts.js";
import NebulaFluidProgress from "./NebulaFluidProgress.jsx";

const states = [
  { value: 18, name: "低进度", note: "暗场占主导，液体从左圆帽内连续延伸。" },
  { value: 50, name: "运动前沿", note: "边界在中段流动，尾雾只向完成侧衰减。" },
  { value: 82, name: "高进度", note: "接近完成仍保留前沿形变和稳定文字层。" },
];

export default function FluidStudy({ mix, settings }) {
  return (
    <section className="fluid-study">
      <header>
        <div><span>关键状态对照</span><h2>流体引擎接入预览</h2></div>
        <p>先恢复可构建基线，再接入固定提交的 MIT WebGL2 渲染器；WinBridge 仅负责状态和安全进度协议。</p>
      </header>
      <div className="fluid-source-status"><strong>来源状态</strong><span>yizhe21803/nebula-capsules-guanyu-lab · aef3f7d010a721e00404ec8dc69239714e38e77c</span><b>MIT / 隔离接入</b></div>
      <div className="fluid-state-grid">
        {states.map((state, index) => (
          <article key={state.value}>
            <span className="state-number">状态 {index + 1}</span>
            <NebulaFluidProgress compact actualProgress={state.value} channels={mix.channels} reducedMotion={settings.reduceMotion} lowEndMode={settings.lowEndMode} label={state.name} />
            <p>{state.note}</p>
          </article>
        ))}
      </div>
      <div className="observation-timeline">
        {fluidObservations.map((item) => <article key={item.stamp}><time>{item.stamp}</time><div><h3>{item.title}</h3><p><b>观察</b>{item.observed}</p><p><b>实现</b>{item.implementation}</p></div></article>)}
      </div>
      <div className="fluid-degrade-table">
        <h3>降级策略</h3>
        <dl>
          <div><dt>减少动态</dt><dd>冻结边界形变与尾雾呼吸，仅保留静态可信进度。</dd></div>
          <div><dt>系统主题</dt><dd>只调整轨道对比度与文字层，不改变进度坐标或通道语义。</dd></div>
          <div><dt>DPI</dt><dd>容器使用弹性尺寸，文字层独立于形变层保持清晰。</dd></div>
          <div><dt>低端设备</dt><dd>使用单层 Canvas 2D/实体边界，移除多余辉光和动态叠层。</dd></div>
        </dl>
      </div>
    </section>
  );
}
