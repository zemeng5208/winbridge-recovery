const TAU = Math.PI * 2;

function wavePoint(progress, phase = 0) {
  const angle = -Math.PI / 2 + progress * TAU;
  const ripple = Math.sin(angle * 11 + phase) * 0.88 + Math.sin(angle * 17 - phase * 0.72) * 0.158;
  const radius = 13.8 + ripple;
  return [19 + Math.cos(angle) * radius, 19 + Math.sin(angle) * radius];
}

function wavePath(start = 0, end = 1, phase = 0) {
  const count = Math.max(2, Math.ceil(88 * Math.max(0.02, end - start)));
  const points = Array.from({ length: count + 1 }, (_, index) => {
    const progress = start + ((end - start) * index) / count;
    return wavePoint(progress, phase);
  });
  return points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
}

export default function StageProgressOrbit({ index, state, progress = 0.58, reduceMotion = false }) {
  const visibleProgress = state === "done" ? 1 : state === "active" ? Math.max(0.16, Math.min(0.98, progress)) : 0;
  const progressPath = visibleProgress > 0 ? wavePath(0, visibleProgress) : "";
  const [headX, headY] = wavePoint(visibleProgress || 0);
  const gradientId = `stage-orbit-${index}`;

  return (
    <span className={`stage-orbit stage-orbit-${state} ${reduceMotion ? "is-reduced" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 38 38" focusable="false">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#4befff" />
            <stop offset=".34" stopColor="#418eff" />
            <stop offset=".68" stopColor="#a44fff" />
            <stop offset="1" stopColor="#ff42be" />
          </linearGradient>
        </defs>
        <g className="stage-orbit-wave">
          <path className="stage-orbit-track" d={wavePath()} />
          {progressPath ? <path className="stage-orbit-glow" d={progressPath} /> : null}
          {progressPath ? <path className="stage-orbit-progress" d={progressPath} stroke={`url(#${gradientId})`} /> : null}
          {state === "active" ? <circle className="stage-orbit-head" cx={headX} cy={headY} r="1.9" /> : null}
        </g>
      </svg>
      <b>{index}</b>
    </span>
  );
}
