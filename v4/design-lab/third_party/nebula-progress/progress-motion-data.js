export const PROGRESS_MOTION_WIDTH = 240;
export const PROGRESS_MOTION_HEIGHT = 80;
export const PROGRESS_MOTION_DURATION = 12.0;
export const PROGRESS_MOTION_MAX_PX = 40.0;

const PROFILE_CONFIG = {
  'model-training': { seed: 0.37, broad: 0.58, middle: 0.25, detail: 0.13, lobe: 0.24 },
  'agent-migration': { seed: 1.71, broad: 0.72, middle: 0.10, detail: 0.03, lobe: 0.18 },
  'visual-training': { seed: 2.83, broad: 0.66, middle: 0.16, detail: 0.06, lobe: 0.23 }
};

const CACHE = new Map();

function gaussian(value, center, width) {
  const delta = (value - center) / Math.max(width, 0.001);
  return Math.exp(-delta * delta);
}

function createMotionData(id) {
  const profile = PROFILE_CONFIG[id] || PROFILE_CONFIG['visual-training'];
  const data = new Uint8Array(PROGRESS_MOTION_WIDTH * PROGRESS_MOTION_HEIGHT);

  for (let x = 0; x < PROGRESS_MOTION_WIDTH; x += 1) {
    const time = (x / PROGRESS_MOTION_WIDTH) * Math.PI * 2;
    const centerA = 0.28 + Math.sin(time * 0.53 + profile.seed) * 0.13;
    const centerB = 0.70 + Math.cos(time * 0.47 + profile.seed * 1.7) * 0.12;

    for (let y = 0; y < PROGRESS_MOTION_HEIGHT; y += 1) {
      const ratio = y / Math.max(PROGRESS_MOTION_HEIGHT - 1, 1);
      const envelope = Math.pow(Math.max(Math.sin(Math.PI * ratio), 0), 0.48);
      const broad = Math.sin(ratio * Math.PI * 2 * 1.35 + time * 0.58 + profile.seed) * profile.broad;
      const middle = Math.sin(ratio * Math.PI * 2 * 3.2 - time * 0.91 + profile.seed * 2.1) * profile.middle;
      const detail = Math.sin(ratio * Math.PI * 2 * 6.1 + time * 1.31 + profile.seed * 3.2) * profile.detail;
      const lobes = (
        gaussian(ratio, centerA, 0.09) * Math.sin(time * 1.11 + profile.seed * 4.0) -
        gaussian(ratio, centerB, 0.10) * Math.cos(time * 0.97 + profile.seed * 3.3)
      ) * profile.lobe;
      const normalized = Math.max(-1, Math.min(1, (broad + middle + detail + lobes) * envelope));
      data[y * PROGRESS_MOTION_WIDTH + x] = Math.round((normalized * 0.5 + 0.5) * 255);
    }
  }

  return data;
}

export function getProgressMotionData(id) {
  if (!CACHE.has(id)) CACHE.set(id, createMotionData(id));
  return CACHE.get(id);
}
