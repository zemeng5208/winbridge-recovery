import { useEffect, useMemo, useRef, useState } from "react";
import { ProgressFlowRenderer } from "../../third_party/nebula-progress/progress-flow-renderer.js";
import { getProgressReferenceAtlas } from "../../third_party/nebula-progress/progress-reference-atlases.js";
import { drawNebulaCanvasFallback } from "../lib/nebulaCanvasFallback.js";
import { sampleSeamlessFlowClock } from "../lib/seamlessFlowClock.js";

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));

function useDisplayedProgress(actualProgress, resultReady, sessionKey, reducedMotion) {
  const target = Math.round(clamp(actualProgress, 0, resultReady ? 100 : 99));
  const [displayed, setDisplayed] = useState(target);
  const currentRef = useRef(target);
  const targetRef = useRef(target);
  const timerRef = useRef(0);
  const historyRef = useRef([target]);
  const intervalRef = useRef(0);

  useEffect(() => {
    window.clearTimeout(timerRef.current);
    targetRef.current = target;
    currentRef.current = target;
    historyRef.current = [target];
    setDisplayed(target);
  }, [sessionKey]);

  useEffect(() => {
    targetRef.current = Math.max(currentRef.current, target);
    if (targetRef.current <= currentRef.current || timerRef.current) return undefined;
    const step = () => {
      const next = Math.min(targetRef.current, currentRef.current + 1);
      currentRef.current = next;
      historyRef.current = [...historyRef.current.slice(-99), next];
      setDisplayed(next);
      if (next < targetRef.current) {
        const remaining = targetRef.current - next;
        intervalRef.current = reducedMotion ? 55 : Math.round(Math.max(35, Math.min(70, 68 - remaining * 1.25)));
        timerRef.current = window.setTimeout(() => {
          timerRef.current = 0;
          step();
        }, intervalRef.current);
      }
    };
    intervalRef.current = reducedMotion ? 55 : Math.round(Math.max(35, Math.min(70, 68 - (targetRef.current - currentRef.current) * 1.25)));
    timerRef.current = window.setTimeout(() => {
      timerRef.current = 0;
      step();
    }, intervalRef.current);
    return undefined;
  }, [target, reducedMotion]);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);
  return { displayed, historyRef, intervalRef };
}

export default function NebulaFluidProgress({
  actualProgress = 64,
  channels = ["#23d9ff", "#3478ff", "#9c4dff"],
  reducedMotion = false,
  lowEndMode = false,
  indeterminate = false,
  resultReady = false,
  sessionKey = 0,
  label = "诊断进度",
  compact = false,
  speed = 1,
}) {
  const canvasRef = useRef(null);
  const { displayed: displayedProgress, historyRef, intervalRef } = useDisplayedProgress(actualProgress, resultReady, sessionKey, reducedMotion);
  const displayedRef = useRef(displayedProgress);
  const [renderMode, setRenderMode] = useState(lowEndMode ? "canvas2d" : "webgl2");
  displayedRef.current = displayedProgress;

  const channelValues = useMemo(() => {
    const fallback = ["#23d9ff", "#3478ff", "#9c4dff"];
    return [0, 1, 2].map((index) => channels?.[index] || fallback[index]);
  }, [channels?.[0], channels?.[1], channels?.[2]]);
  const preset = useMemo(() => ({
    id: "visual-training",
    colors: ["#08090f", channelValues[2], channelValues[1], channelValues[0]],
  }), [channelValues]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let renderer = null;
    let atlas = null;
    let frame = 0;
    let startedAt = performance.now();
    let fallback = Boolean(lowEndMode);

    if (!fallback) {
      try {
        renderer = new ProgressFlowRenderer(canvas, preset);
        atlas = getProgressReferenceAtlas(preset.id);
        setRenderMode("webgl2");
      } catch {
        fallback = true;
        setRenderMode("canvas2d");
      }
    } else {
      setRenderMode("canvas2d");
    }

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (renderer) renderer.resize(Math.max(1, bounds.width), Math.max(1, bounds.height), dpr);
      else {
        canvas.width = Math.max(1, Math.round(bounds.width * dpr));
        canvas.height = Math.max(1, Math.round(bounds.height * dpr));
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const draw = (now) => {
      const elapsedSeconds = reducedMotion ? 0 : ((now - startedAt) / 1000) * Math.max(.6, Number(speed) || 1) * 1.18;
      const flowClock = sampleSeamlessFlowClock(elapsedSeconds);
      canvas.dataset.flowTime = flowClock.sourceTime.toFixed(4);
      canvas.dataset.flowElapsed = elapsedSeconds.toFixed(4);
      canvas.dataset.flowCycle = String(flowClock.cycle);
      canvas.dataset.flowPhase = flowClock.phase.toFixed(6);
      canvas.dataset.flowVelocity = flowClock.sourceVelocity.toFixed(6);
      if (renderer) renderer.draw(flowClock.sourceTime, displayedRef.current, atlas?.ready ? atlas.image : null);
      else drawNebulaCanvasFallback(canvas, displayedRef.current, channelValues, flowClock.sourceTime);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      if (renderer) renderer.dispose();
      startedAt = 0;
    };
  }, [channelValues, preset, lowEndMode, reducedMotion, speed]);

  const progress = clamp(displayedProgress, 0, resultReady ? 100 : 99);
  return (
    <div className={`nebula-fluid ${compact ? "is-compact" : ""} ${indeterminate ? "is-indeterminate" : ""}`} data-testid="nebula-fluid-progress" data-renderer={renderMode} data-actual-progress={Math.round(actualProgress)} data-displayed-progress={Math.round(progress)} data-step-sequence={historyRef.current.join(",")} data-step-interval-ms={intervalRef.current}>
      <div className="nebula-fluid-meta"><span>MIT FLUID ENGINE / {renderMode.toUpperCase()}</span><strong>{indeterminate ? "可信值保持" : "平滑追赶"}</strong></div>
      <div className="nebula-fluid-stage" role="progressbar" aria-label={label} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(progress)}>
        <canvas ref={canvasRef} className="nebula-fluid-canvas" aria-hidden="true" />
        <span className="nebula-fluid-copy"><strong>{label}</strong><small>{indeterminate ? "LONG STEP / NO FAKE ADVANCE" : "SAFE RECOVERY PROTOCOL"}</small></span>
        <strong className="nebula-fluid-value">{Math.round(progress)}%</strong>
      </div>
    </div>
  );
}
