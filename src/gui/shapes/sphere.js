export function buildSphereGUI(pipeline, gui, shapeFolder, { onChange } = {}) {
  shapeFolder.add(pipeline.base.params, 'subdivisions', 0, 3, 1)
    .name('Detail Level').onChange(() => onChange?.());
  shapeFolder.add(pipeline.base.params, 'radius', 0.3, 2.0, 0.05)
    .name('Size').onChange(() => onChange?.());

  const explodeMod = pipeline.modifiers.find(m => m.type === 'faceExplode');
  if (explodeMod) {
    const fracture = gui.addFolder('Fracture');
    fracture.add(explodeMod.params, 'explodeAmount', 0, 3.0, 0.01)
      .name('Break Amount').onChange(() => onChange?.());
    fracture.add(explodeMod.params, 'frequency', 0.5, 8.0, 0.05)
      .name('Pattern').onChange(() => onChange?.());
    fracture.add(explodeMod.params, 'threshold', 0, 1, 0.01)
      .name('Fragment Count').onChange(() => onChange?.());
    fracture.add(explodeMod.params, 'faceGap', 0, 0.5, 0.005)
      .name('Gap').onChange(() => onChange?.());
    fracture.add(explodeMod.params, 'octaves', 1, 4, 1)
      .name('Complexity').onChange(() => onChange?.());
  }

  const animMod = pipeline.modifiers.find(m => m.type === 'facetAnimate');
  if (animMod) {
    const anim = gui.addFolder('Animation');
    anim.add(animMod.params, 'time', 0, 1, 0.01)
      .name('Morph').onChange(() => onChange?.());
    anim.add(animMod.params, 'easing', ['none', 'smoothstep', 'cubic'])
      .name('Easing').onChange(() => onChange?.());
  }

  const display = gui.addFolder('Display');
  if ('wireframeOverlay' in pipeline) {
    display.add(pipeline, 'wireframeOverlay').name('Wireframe').onChange(() => onChange?.());
  }
}
