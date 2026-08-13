import { preservationRows, schemes } from "../data/concepts.js";

export default function SchemePicker({ selected, onSelect }) {
  return (
    <section className="scheme-picker" aria-label="五套布局方案">
      <header>
        <div><span>五套布局候选</span><strong>布局决定信息组织，不再用换色冒充新方案</strong></div>
        <p>每套都使用同一组件、双材质与独立颜色系统。</p>
      </header>
      <div className="scheme-list">
        {schemes.map((scheme) => (
          <button
            type="button"
            key={scheme.id}
            className={`scheme-choice scheme-choice-${scheme.id} ${selected.id === scheme.id ? "is-selected" : ""}`}
            onClick={() => onSelect(scheme)}
            aria-pressed={selected.id === scheme.id}
          >
            <span className={`layout-mini layout-mini-${scheme.code.toLowerCase()}`} aria-hidden="true"><i/><i/><i/><i/></span>
            <span className="scheme-choice-copy"><strong>{scheme.name}</strong><small>{scheme.english}</small></span>
            <span className="scheme-score">保留项 {preservationRows.length}/{preservationRows.length}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
