const LOG_LO = Math.log10(1e-5);
const LOG_HI = Math.log10(1e-2);

export function createSharpnessProxy(target) {
  return {
    get sharpness() {
      return 1 - (Math.log10(target.minDist) - LOG_LO) / (LOG_HI - LOG_LO);
    },
    set sharpness(v) {
      target.minDist = Math.pow(10, LOG_LO + (1 - v) * (LOG_HI - LOG_LO));
    }
  };
}

export function buildJuliaModeGUI(gui, params, [juliaMin, juliaMax], { onChange } = {}) {
  const julia = gui.addFolder('Julia Mode');
  julia.add(params, 'juliaMode')
    .name('Enable Julia')
    .onChange(() => onChange?.(true));

  if (!params.juliaMode) return;

  const cProxy = {
    get cx() { return params.juliaC[0]; }, set cx(v) { params.juliaC[0] = v; },
    get cy() { return params.juliaC[1]; }, set cy(v) { params.juliaC[1] = v; },
    get cz() { return params.juliaC[2]; }, set cz(v) { params.juliaC[2] = v; },
  };
  julia.add(cProxy, 'cx', juliaMin, juliaMax, 0.0001).name('Julia C.x').onChange(() => onChange?.());
  julia.add(cProxy, 'cy', juliaMin, juliaMax, 0.0001).name('Julia C.y').onChange(() => onChange?.());
  julia.add(cProxy, 'cz', juliaMin, juliaMax, 0.0001).name('Julia C.z').onChange(() => onChange?.());

}
