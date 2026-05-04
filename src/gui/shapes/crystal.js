import { createSharpnessProxy } from './sharedControls.js';

export function buildCrystalGUI(pipeline, gui, shapeFolder, { onChange } = {}) {
  shapeFolder.add(pipeline.crystal, 'cubeSize', 0.2, 1.5, 0.05).name('Cube Size').onChange(() => onChange?.());

  const fold = gui.addFolder('Fractal Detail');
  fold.add(pipeline.crystal, 'iterations', 6, 18, 1).name('Iterations').onChange(() => onChange?.());
  fold.add(pipeline.crystal, 'detailScale', 0.3, 1.0, 0.01).name('Detail Scale').onChange(() => onChange?.());
  fold.add(pipeline.crystal, 'tile', 0.0, 1.2, 0.01).name('Tile').onChange(() => onChange?.());
  fold.add(pipeline.crystal, 'detailBias', -0.001, 0.001, 0.00005).name('Detail Bias').onChange(() => onChange?.());

  const detail = gui.addFolder('Detail / Performance');
  detail.add(pipeline.crystal, 'maxSteps', 32, 256, 8).name('Max Steps (perf)').onChange(() => onChange?.());
  detail.add(createSharpnessProxy(pipeline.crystal), 'sharpness', 0, 0.4, 0.01)
    .name('Surface Sharpness').onChange(() => onChange?.());
  detail.add(pipeline.crystal, 'maxDist', 5, 100, 1).name('Max Distance').onChange(() => onChange?.());
}
