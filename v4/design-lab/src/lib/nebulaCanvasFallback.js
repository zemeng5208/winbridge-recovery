const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));

function hexToRgba(hex, alpha) {
  const value = String(hex || "#2b3a66").replace("#", "");
  const parsed = Number.parseInt(value.length === 3 ? value.split("").map((c) => c + c).join("") : value, 16);
  if (!Number.isFinite(parsed)) return `rgba(43,58,102,${alpha})`;
  return `rgba(${(parsed >> 16) & 255},${(parsed >> 8) & 255},${parsed & 255},${alpha})`;
}

/**
 * Small Canvas 2D adapter derived from the upstream capsule fallback.
 * It intentionally keeps the original layering: dark capsule, near-edge
 * colour fog, a single irregular boundary and a restrained highlight.
 */
export function drawNebulaCanvasFallback(canvas, progress, channels, time = 0) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const width = canvas.width;
  const height = canvas.height;
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const w = width / dpr;
  const h = height / dpr;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, w, h);

  const radius = h / 2;
  context.save();
  context.beginPath();
  context.roundRect(0, 0, w, h, radius);
  context.clip();
  context.fillStyle = "#08090f";
  context.fillRect(0, 0, w, h);

  const edgeX = w * clamp(progress, 0, 100) / 100;
  const phase = time * 0.58;
  const offsets = [0.00, -0.028, 0.044, -0.018, 0.026, 0.00];
  const points = offsets.map((offset, index) => {
    const y = (h * index) / (offsets.length - 1);
    const wave = Math.sin(phase + index * 1.17) * h * 0.018 + Math.sin(phase * 0.73 + index * 2.31) * h * 0.012;
    return { x: edgeX + (offset * w) + wave, y };
  });

  context.beginPath();
  context.moveTo(0, 0);
  context.lineTo(points[0].x, 0);
  points.slice(1).forEach((point, index) => {
    const previous = points[index];
    const midpointY = (previous.y + point.y) / 2;
    context.bezierCurveTo(previous.x, midpointY - h * 0.09, point.x, midpointY + h * 0.09, point.x, point.y);
  });
  context.lineTo(0, h);
  context.closePath();
  const fogGradient = context.createLinearGradient(Math.max(0, edgeX - w * 0.18), 0, edgeX + w * 0.03, 0);
  fogGradient.addColorStop(0, hexToRgba(channels[1], 0));
  fogGradient.addColorStop(0.55, hexToRgba(channels[1], 0.12));
  fogGradient.addColorStop(0.86, hexToRgba(channels[0], 0.25));
  fogGradient.addColorStop(1, hexToRgba(channels[2], 0.35));
  context.fillStyle = fogGradient;
  context.fill();

  context.beginPath();
  context.moveTo(points[0].x, 0);
  points.slice(1).forEach((point, index) => {
    const previous = points[index];
    const midpointY = (previous.y + point.y) / 2;
    context.bezierCurveTo(previous.x, midpointY - h * 0.09, point.x, midpointY + h * 0.09, point.x, point.y);
  });
  context.strokeStyle = hexToRgba(channels[0], 0.82);
  context.lineWidth = Math.max(1, h * 0.06);
  context.shadowColor = hexToRgba(channels[0], 0.6);
  context.shadowBlur = h * 0.24;
  context.stroke();
  context.restore();
}
