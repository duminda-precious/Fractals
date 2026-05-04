import { createSharpnessProxy, buildJuliaModeGUI } from './sharedControls.js';

export function buildMandelboxGUI(pipeline, gui, shapeFolder, { onChange } = {}) {
  shapeFolder.add(pipeline.mandelbox, 'scale', -4.0, 4.0, 0.05).name('Scale').onChange(() => onChange?.());
  shapeFolder.add(pipeline.mandelbox, 'iterations', 2, 30, 1).name('Iterations').onChange(() => onChange?.());

  const advanced = gui.addFolder('Advanced Formula');
  advanced.add(pipeline.mandelbox, 'minRadius', 0.25, 1.5, 0.01).name('Min Radius').onChange(() => onChange?.());
  advanced.add(pipeline.mandelbox, 'fixedRadius', 0.1, 4.0, 0.01).name('Fixed Radius').onChange(() => onChange?.());

  buildJuliaModeGUI(gui, pipeline.mandelbox, [-2.5, 2.5], { onChange });

  const detail = gui.addFolder('Detail / Performance');
  detail.add(pipeline.mandelbox, 'maxSteps', 32, 256, 8).name('Max Steps (perf)').onChange(() => onChange?.());
  detail.add(createSharpnessProxy(pipeline.mandelbox), 'sharpness', 0, 1, 0.01)
    .name('Surface Sharpness').onChange(() => onChange?.());
}
