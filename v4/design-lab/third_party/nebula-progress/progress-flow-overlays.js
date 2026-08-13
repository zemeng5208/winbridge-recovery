import { createProgressFlowRenderer } from './progress-flow-renderer.js';
import {
  PROGRESS_REFERENCE_DURATION,
  getProgressReferenceAtlas
} from './progress-reference-atlases.js';

export function createProgressFlowOverlays(cards, presets) {
  const controllers = [];

  cards.forEach((card, index) => {
    const preset = presets[index];
    const stage = card.querySelector('.progress-stage');
    const fallbackCanvas = card.querySelector('.progress-wave-canvas');
    if (!stage || !fallbackCanvas || !preset) return;

    const overlay = document.createElement('canvas');
    overlay.className = 'progress-wave-canvas progress-webgl-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    fallbackCanvas.insertAdjacentElement('afterend', overlay);

    const renderer = createProgressFlowRenderer(overlay, preset);
    if (!renderer) {
      overlay.remove();
      return;
    }

    const atlas = getProgressReferenceAtlas(preset.id);
    stage.classList.add('has-webgl-progress');

    const resize = () => {
      const bounds = stage.getBoundingClientRect();
      const width = Math.max(1, bounds.width);
      const height = Math.max(1, bounds.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      overlay.style.width = `${width}px`;
      overlay.style.height = `${height}px`;
      renderer.resize(width, height, dpr);
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(stage);
    resize();

    controllers.push({
      stage,
      renderer,
      resizeObserver,
      draw(flowTime) {
        const effectTime = flowTime % PROGRESS_REFERENCE_DURATION;
        const progress = Number.parseFloat(stage.style.getPropertyValue('--progress'));
        renderer.draw(
          effectTime,
          Number.isFinite(progress) ? progress : preset.initialProgress,
          atlas.ready ? atlas.image : null
        );
      },
      dispose() {
        resizeObserver.disconnect();
        renderer.dispose();
        overlay.remove();
        stage.classList.remove('has-webgl-progress');
      }
    });
  });

  return {
    active: controllers.length > 0,
    update(flowTime) {
      for (const controller of controllers) controller.draw(flowTime);
    },
    dispose() {
      for (const controller of controllers) controller.dispose();
    }
  };
}
