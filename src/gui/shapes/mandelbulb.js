export function buildMandelbulbGUI(pipeline, gui, shapeFolder, { onChange, api } = {}) {
  shapeFolder.add(pipeline.mandelbulb, 'power', 2, 12, 0.1)
    .name('Power (n)').onChange(() => onChange?.());
  shapeFolder.add(pipeline.mandelbulb, 'iterations', 4, 30, 1)
    .name('Iterations').onChange(() => onChange?.());
  shapeFolder.add(pipeline.mandelbulb, 'bailout', 1.5, 4.0, 0.05)
    .name('Bailout').onChange(() => onChange?.());

  const julia = gui.addFolder('Julia Mode');
  julia.add(pipeline.mandelbulb, 'juliaMode')
    .name('Enable Julia').onChange(() => onChange?.(true));

  if (pipeline.mandelbulb.juliaMode) {
    const cProxy = {
      get cx() { return pipeline.mandelbulb.juliaC[0]; },
      set cx(v) { pipeline.mandelbulb.juliaC[0] = v; },
      get cy() { return pipeline.mandelbulb.juliaC[1]; },
      set cy(v) { pipeline.mandelbulb.juliaC[1] = v; },
      get cz() { return pipeline.mandelbulb.juliaC[2]; },
      set cz(v) { pipeline.mandelbulb.juliaC[2] = v; }
    };
    julia.add(cProxy, 'cx', -1.5, 1.5, 0.0001).name('Julia C.x').onChange(() => onChange?.());
    julia.add(cProxy, 'cy', -1.5, 1.5, 0.0001).name('Julia C.y').onChange(() => onChange?.());
    julia.add(cProxy, 'cz', -1.5, 1.5, 0.0001).name('Julia C.z').onChange(() => onChange?.());
    julia.add({ randomize: () => api?.randomizeJuliaC?.() }, 'randomize')
      .name('Randomize Julia C');
  }

  const detail = gui.addFolder('Detail / Performance');
  detail.add(pipeline.mandelbulb, 'maxSteps', 32, 256, 8)
    .name('Max Steps (perf)').onChange(() => onChange?.());
  const sharpProxy = {
    get sharpness() {
      const lo = Math.log10(1e-5), hi = Math.log10(1e-2);
      return 1 - (Math.log10(pipeline.mandelbulb.minDist) - lo) / (hi - lo);
    },
    set sharpness(v) {
      const lo = Math.log10(1e-5), hi = Math.log10(1e-2);
      pipeline.mandelbulb.minDist = Math.pow(10, lo + (1 - v) * (hi - lo));
    }
  };
  detail.add(sharpProxy, 'sharpness', 0, 1, 0.01)
    .name('Surface Sharpness').onChange(() => onChange?.());
}
