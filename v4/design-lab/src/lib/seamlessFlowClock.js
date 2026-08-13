export const FLOW_SOURCE_DURATION_SECONDS = 12;
export const FLOW_SOURCE_FRAME_COUNT = 240;
export const FLOW_LOOP_DURATION_SECONDS = FLOW_SOURCE_DURATION_SECONDS * 2;

const positiveModulo = (value, divisor) => ((value % divisor) + divisor) % divisor;

/**
 * Adapter-only loop clock for the upstream motion texture.
 *
 * The upstream texture is not periodic at its first/last column. Sampling it
 * with a raw modulo therefore exposes a hard seam. This cosine ping-pong clock
 * never crosses that texture seam: it approaches the last safe sample with
 * zero velocity, reverses continuously, and returns to the first sample with
 * the same zero velocity. Position and first derivative are continuous at the
 * public loop boundary without modifying any third-party source file.
 */
export function sampleSeamlessFlowClock(elapsedSeconds, sourceDuration = FLOW_SOURCE_DURATION_SECONDS) {
  const safeElapsed = Math.max(0, Number(elapsedSeconds) || 0);
  const safeSourceDuration = Math.max(0.001, Number(sourceDuration) || FLOW_SOURCE_DURATION_SECONDS);
  const loopDuration = safeSourceDuration * 2;
  const cycle = Math.floor(safeElapsed / loopDuration);
  const phase = positiveModulo(safeElapsed, loopDuration) / loopDuration;
  const sourceLimit = safeSourceDuration * (1 - 1 / FLOW_SOURCE_FRAME_COUNT);
  const angle = phase * Math.PI * 2;
  const eased = 0.5 - 0.5 * Math.cos(angle);
  const sourceTime = sourceLimit * eased;
  const sourceVelocity = sourceLimit * Math.PI * Math.sin(angle) / loopDuration;
  return { cycle, phase, sourceTime, sourceVelocity, loopDuration };
}
