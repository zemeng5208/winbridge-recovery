import { useEffect, useId, useRef, useState } from "react";

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
const FRONT_PATH_A = "M0 0 H24 C27 3 26 8 22 11 C17 16 21 24 31 30 C33 32 28 35 22 38 C17 44 23 55 29 61 C31 66 26 73 24 76 H0 Z";
const FRONT_PATH_B = "M0 0 H25 C28 4 25 9 21 12 C17 17 23 24 30 29 C34 32 29 36 23 39 C18 45 22 54 30 60 C32 65 27 72 25 76 H0 Z";
const FRONT_PATH_C = "M0 0 H23 C26 3 27 7 24 10 C19 15 20 23 29 28 C32 31 30 34 24 37 C19 42 20 52 28 59 C31 63 29 70 23 76 H0 Z";
const CORE_PATH_A = "M24 0 C27 3 26 8 22 11 C17 16 21 24 31 30 C33 32 28 35 22 38 C17 44 23 55 29 61 C31 66 26 73 24 76";
const CORE_PATH_B = "M25 0 C28 4 25 9 21 12 C17 17 23 24 30 29 C34 32 29 36 23 39 C18 45 22 54 30 60 C32 65 27 72 25 76";
const CORE_PATH_C = "M23 0 C26 3 27 7 24 10 C19 15 20 23 29 28 C32 31 30 34 24 37 C19 42 20 52 28 59 C31 63 29 70 23 76";

function useDisplayedProgress(actualProgress, { resultReady, reducedMotion, lowEndMode, sessionKey }) {
  const target = clamp(actualProgress, 0, resultReady ? 100 : 99);
  const [displayed, setDisplayed] = useState(target);
  const displayedRef = useRef(target);
  const frameRef = useRef(0);

  useEffect(() => {
    cancelAnimationFrame(frameRef.current);
    displayedRef.current = target;
    setDisplayed(target);
  }, [sessionKey]); // A new demo session is the only supported backward reset.

  useEffect(() => {
    const start = displayedRef.current;
    if (target <= start) return undefined;
    cancelAnimationFrame(frameRef.current);
    const delta = target - start;
    const duration = reducedMotion || lowEndMode ? Math.min(520, 260 + delta * 7) : Math.min(1200, Math.max(350, 300 + delta * 18));
    const startedAt = performance.now();
    const tick = (now) => {
      const linear = Math.min(1, (now - startedAt) / duration);
      const eased = reducedMotion || lowEndMode ? linear : 1 - Math.pow(1 - linear, 3);
      const next = Math.min(target, Math.max(displayedRef.current, start + delta * eased));
      displayedRef.current = next;
      setDisplayed(next);
      if (linear < 1) frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target, reducedMotion, lowEndMode, resultReady]);

  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);
  return displayed;
}

export default function FluidProgress({
  actualProgress = 64,
  channels = ["#23d9ff", "#3478ff", "#9c4dff"],
  speed = 1,
  reducedMotion = false,
  lowEndMode = false,
  indeterminate = false,
  resultReady = false,
  sessionKey = 0,
  label = "总诊断进度",
  compact = false,
}) {
  const frontId = useId().replace(/:/g, "");
  const frontGradientId = `fluid-front-gradient-${frontId}`;
  const displayedProgress = useDisplayedProgress(actualProgress, { resultReady, reducedMotion, lowEndMode, sessionKey });
  const safeActual = clamp(actualProgress, 0, resultReady ? 100 : 99);
  const style = {
    "--fluid-a": channels[0],
    "--fluid-b": channels[1],
    "--fluid-c": channels[2],
    "--fluid-progress": `${displayedProgress}%`,
    "--fluid-speed": `${Math.max(1.25, 3.4 - speed)}s`,
    "--fluid-speed-secondary": `${Math.max(1.7, (3.4 - speed) * 1.36)}s`,
    "--fluid-compression": 1,
    "--front-opacity": displayedProgress <= 0 ? 0 : 1,
  };

  return (
    <div
      className={`fluid-block ${compact ? "is-compact" : ""} ${reducedMotion ? "is-reduced" : ""} ${lowEndMode ? "is-low-end" : ""} ${indeterminate ? "is-indeterminate" : ""}`}
      style={style}
      data-testid="fluid-progress"
      data-actual-progress={Math.round(safeActual)}
      data-displayed-progress={Math.round(displayedProgress)}
    >
      <div className="fluid-label-row">
        <span>ACTUAL {Math.round(safeActual)} · DISPLAYED {Math.round(displayedProgress)}</span>
        <strong>{indeterminate ? "可信值保持 · 仅形变呼吸" : "SMOOTH / MONOTONIC"}</strong>
      </div>
      <div className="fluid-track" role="progressbar" aria-label={label} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(displayedProgress)}>
        <span className="fluid-left-field" />
        <span className="fluid-trailing-haze fluid-trailing-haze-c" />
        <span className="fluid-trailing-haze fluid-trailing-haze-b" />
        <span className="fluid-front-zone" aria-hidden="true">
          <i className="fluid-front-shadow" />
          <svg className="fluid-front-svg" viewBox="0 0 44 76" preserveAspectRatio="none" focusable="false">
            <defs>
              <linearGradient id={frontGradientId} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor={channels[1]} stopOpacity="0.02" />
                <stop offset="0.68" stopColor={channels[1]} stopOpacity="0.08" />
                <stop offset="1" stopColor={channels[0]} stopOpacity="0.3" />
              </linearGradient>
            </defs>
            <path className="fluid-front-plasma" d={FRONT_PATH_A} fill={`url(#${frontGradientId})`}>
              {!reducedMotion && !lowEndMode ? <animate attributeName="d" dur={style["--fluid-speed"]} repeatCount="indefinite" calcMode="spline" keyTimes="0;0.34;0.69;1" keySplines=".42 0 .58 1;.42 0 .58 1;.42 0 .58 1" values={`${FRONT_PATH_A};${FRONT_PATH_B};${FRONT_PATH_C};${FRONT_PATH_A}`} /> : null}
            </path>
            <path className="fluid-front-core" d={CORE_PATH_A} fill="none">
              {!reducedMotion && !lowEndMode ? <animate attributeName="d" dur={style["--fluid-speed"]} repeatCount="indefinite" calcMode="spline" keyTimes="0;0.34;0.69;1" keySplines=".42 0 .58 1;.42 0 .58 1;.42 0 .58 1" values={`${CORE_PATH_A};${CORE_PATH_B};${CORE_PATH_C};${CORE_PATH_A}`} /> : null}
            </path>
          </svg>
        </span>
        <span className="fluid-inner-highlight" />
        <span className="fluid-text-layer">
          <span className="fluid-copy"><strong>{label}</strong><small>{indeterminate ? "INDETERMINATE · NO FAKE ADVANCE" : "DIAGNOSTIC PROTOCOL"}</small></span>
          <strong className="fluid-percentage">{Math.round(displayedProgress)}%</strong>
        </span>
      </div>
    </div>
  );
}
