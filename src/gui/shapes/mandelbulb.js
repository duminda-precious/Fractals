import { createSharpnessProxy, buildJuliaModeGUI } from './sharedControls.js';

export function buildMandelbulbGUI(pipeline, gui, shapeFolder, { onChange, api } = {}) {
  shapeFolder.add(pipeline.mandelbulb, 'power', 2, 12, 0.1).name('Power (n)').onChange(() => onChange?.());
  shapeFolder.add(pipeline.mandelbulb, 'iterations', 4, 30, 1).name('Iterations').onChange(() => onChange?.());
  shapeFolder.add(pipeline.mandelbulb, 'bailout', 1.5, 4.0, 0.05).name('Bailout').onChange(() => onChange?.());

  buildJuliaModeGUI(gui, pipeline.mandelbulb, [-1.5, 1.5], api, { onChange });

  const detail = gui.addFolder('Detail / Performance');
  detail.add(pipeline.mandelbulb, 'maxSteps', 32, 256, 8).name('Max Steps (perf)').onChange(() => onChange?.());
  detail.add(createSharpnessProxy(pipeline.mandelbulb), 'sharpness', 0, 1, 0.01)
    .name('Surface Sharpness').onChange(() => onChange?.());
}
