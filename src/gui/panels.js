import GUI from 'lil-gui';
import { buildSphereGUI }     from './shapes/sphere.js';
import { buildMandelbulbGUI } from './shapes/mandelbulb.js';
import { buildCrystalGUI }    from './shapes/crystal.js';
import { buildMandelboxGUI }  from './shapes/mandelbox.js';
import { ZOOM } from '../world.js';

const SHAPE_GUI = {
  sphere:     buildSphereGUI,
  mandelbulb: buildMandelbulbGUI,
  crystal:    buildCrystalGUI,
  mandelbox:  buildMandelboxGUI,
};

let gui = null;
let rotControllers = [];
let panelOpen = true; // survives GUI rebuilds

// The preview container shrinks to make room for the open panel (see index.html).
function syncPanelLayout() {
  document.body.classList.toggle('panel-open', panelOpen);
}

export function refreshDisplays() {
  if (!gui) return;
  for (const c of gui.controllersRecursive()) c.updateDisplay();
}

export function refreshRotation() {
  for (const c of rotControllers) c.updateDisplay();
}

export function buildGUI(pipeline, { onChange, api } = {}) {
  if (gui) { gui.destroy(); gui = null; }
  rotControllers = [];

  gui = new GUI({ title: 'Fractal Explorer' });
  if (!panelOpen) gui.close();
  syncPanelLayout();
  const root = gui;
  gui.onOpenClose((changed) => {
    if (changed !== root) return; // ignore sub-folders
    panelOpen = !root._closed;
    syncPanelLayout();
  });

  const shapeFolder = gui.addFolder('Shape');
  shapeFolder.add(pipeline, 'shapeType', Object.keys(SHAPE_GUI))
    .name('Shape Type')
    .onChange(() => onChange?.(true));

  SHAPE_GUI[pipeline.shapeType]?.(pipeline, gui, shapeFolder, { onChange, api });

  // ── Material ──
  const appearance = pipeline.appearance;
  const apply = () => api?.applyAppearance?.();

  const mat = gui.addFolder('Material');
  mat.addColor(appearance, 'surfaceLit').name('Surface (Lit)').onChange(apply);
  mat.addColor(appearance, 'surfaceShadow').name('Surface (Shadow)').onChange(apply);
  mat.add(appearance, 'roughness', 0, 1, 0.01).name('Roughness').onChange(apply);

  // ── Lighting ──
  const lighting = gui.addFolder('Lighting');
  const keyF = lighting.addFolder('Key Light');
  keyF.addColor(appearance, 'keyColor').name('Color').onChange(apply);
  keyF.add(appearance, 'keyIntensity', 0, 2, 0.05).name('Intensity').onChange(apply);
  keyF.add(appearance, 'keyAzimuth', -180, 180, 1).name('Angle').onChange(apply);
  keyF.add(appearance, 'keyElevation', -90, 90, 1).name('Height').onChange(apply);
  const fillF = lighting.addFolder('Fill Light');
  fillF.addColor(appearance, 'fillColor').name('Color').onChange(apply);
  fillF.add(appearance, 'fillIntensity', 0, 1, 0.05).name('Intensity').onChange(apply);
  fillF.add(appearance, 'fillAzimuth', -180, 180, 1).name('Angle').onChange(apply);
  fillF.add(appearance, 'fillElevation', -90, 90, 1).name('Height').onChange(apply);
  lighting.add(appearance, 'ambient', 0, 1, 0.05).name('Ambient').onChange(apply);

  // ── Background ──
  const bg = gui.addFolder('Background');
  bg.addColor(appearance, 'background').name('Color').onChange(apply);

  // ── View ──
  const view = gui.addFolder('View');
  view.add(pipeline, 'zoom', ZOOM.min, ZOOM.max, ZOOM.step)
    .name('Zoom')
    .onChange(() => api?.applyZoom?.());
  view.add({ reset: () => api?.resetZoom?.() }, 'reset').name('Reset Zoom');
  rotControllers = [
    view.add(pipeline.rotation, 'x', -180, 180).name('Rot X').decimals(1).onChange(() => api?.pushRotation?.()),
    view.add(pipeline.rotation, 'y', -180, 180).name('Rot Y').decimals(1).onChange(() => api?.pushRotation?.()),
    view.add(pipeline.rotation, 'z', -180, 180).name('Rot Z').decimals(1).onChange(() => api?.pushRotation?.()),
  ];
  view.add(pipeline, 'autoRotateZ').name('Auto Rotate Z ▶');
  view.add({ resetRotation: () => api?.resetRotation?.() }, 'resetRotation').name('Reset Rotation');

}
