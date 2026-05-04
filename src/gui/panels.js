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

  const shapeFolder = gui.addFolder('Shape');
  shapeFolder.add(pipeline, 'shapeType', Object.keys(SHAPE_GUI))
    .name('Shape Type')
    .onChange(() => onChange?.(true));

  SHAPE_GUI[pipeline.shapeType]?.(pipeline, gui, shapeFolder, { onChange, api });

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
  view.add({ resetRotation: () => api?.resetRotation?.() }, 'resetRotation').name('Reset Rotation');

}
