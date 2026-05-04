export function buildMandelboxGUI(pipeline, gui, shapeFolder, { onChange, api } = {}) {
  shapeFolder.add(pipeline.mandelbox, 'scale', -4.0, 4.0, 0.05)
    .name('Scale').onChange(() => onChange?.());
  shapeFolder.add(pipeline.mandelbox, 'iterations', 2, 30, 1)
    .name('Iterations').onChange(() => onChange?.());

  // Fixed radius controls (advanced)
  const advanced = gui.addFolder('Advanced Formula');
  advanced.add(pipeline.mandelbox, 'minRadius', 0.1, 2.0, 0.01)
    .name('Min Radius').onChange(() => onChange?.());
  advanced.add(pipeline.mandelbox, 'fixedRadius', 0.1, 4.0, 0.01)
    .name('Fixed Radius').onChange(() => onChange?.());

  // Optional Julia Mode for Mandelbox
  const julia = gui.addFolder('Julia Mode');
  julia.add(pipeline.mandelbox, 'juliaMode')
    .name('Enable Julia').onChange(() => onChange?.(true));

  if (pipeline.mandelbox.juliaMode) {
    const cProxy = {
      get cx() { return pipeline.mandelbox.juliaC[0]; },
      set cx(v) { pipeline.mandelbox.juliaC[0] = v; },
      get cy() { return pipeline.mandelbox.juliaC[1]; },
      set cy(v) { pipeline.mandelbox.juliaC[1] = v; },
      get cz() { return pipeline.mandelbox.juliaC[2]; },
      set cz(v) { pipeline.mandelbox.juliaC[2] = v; }
    };
    julia.add(cProxy, 'cx', -2.5, 2.5, 0.0001).name('Julia C.x').onChange(() => onChange?.());
    julia.add(cProxy, 'cy', -2.5, 2.5, 0.0001).name('Julia C.y').onChange(() => onChange?.());
    julia.add(cProxy, 'cz', -2.5, 2.5, 0.0001).name('Julia C.z').onChange(() => onChange?.());
    julia.add({ randomize: () => api?.randomizeJuliaC?.() }, 'randomize')
      .name('Randomize Julia C');
  }

  const detail = gui.addFolder('Detail / Performance');
  detail.add(pipeline.mandelbox, 'maxSteps', 32, 256, 8)
    .name('Max Steps (perf)').onChange(() => onChange?.());
  const sharpProxy = {
    get sharpness() {
      const lo = Math.log10(1e-5), hi = Math.log10(1e-2);
      return 1 - (Math.log10(pipeline.mandelbox.minDist) - lo) / (hi - lo);
    },
    set sharpness(v) {
      const lo = Math.log10(1e-5), hi = Math.log10(1e-2);
      pipeline.mandelbox.minDist = Math.pow(10, lo + (1 - v) * (hi - lo));
    }
  };
  detail.add(sharpProxy, 'sharpness', 0, 1, 0.01)
    .name('Surface Sharpness').onChange(() => onChange?.());
}
