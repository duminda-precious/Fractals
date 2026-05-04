import GUI from 'lil-gui';
import { buildSphereGUI }     from './shapes/sphere.js';
import { buildMandelbulbGUI } from './shapes/mandelbulb.js';
import { buildCrystalGUI }    from './shapes/crystal.js';
import { buildMandelboxGUI }  from './shapes/mandelbox.js';
import { ZOOM } from '../world.js';

// Registry: shapeType → GUI builder.
// To add a new shape: create src/gui/shapes/<name>.js and add one entry here.
const SHAPE_GUI = {
  sphere:     buildSphereGUI,
  mandelbulb: buildMandelbulbGUI,
  crystal:    buildCrystalGUI,
  mandelbox:  buildMandelboxGUI,
};

let gui = null;

// Force every controller in the panel to re-read its bound value.
// Call after programmatic state changes (e.g. Randomize Julia C) so
// slider knobs reflect the new values.
export function refreshDisplays() {
  if (!gui) return;
  for (const c of gui.controllersRecursive()) c.updateDisplay();
}

export function buildGUI(pipeline, { onChange, api } = {}) {
  if (gui) {
    gui.destroy();
    gui = null;
  }

  gui = new GUI({ title: 'Fractal Explorer' });

  // ── Shape Type dropdown (always present) ──────────────────────────────────
  const shapeFolder = gui.addFolder('Shape');
  shapeFolder.add(pipeline, 'shapeType', Object.keys(SHAPE_GUI))
    .name('Shape Type')
    .onChange(() => onChange?.(true));   // structural rebuild

  // ── Shape-specific controls (registry lookup — no if/else) ────────────────
  SHAPE_GUI[pipeline.shapeType]?.(pipeline, gui, shapeFolder, { onChange, api });

  // ── View (global — same for all shapes) ───────────────────────────────────
  const view = gui.addFolder('View');
  view.add(pipeline, 'zoom', ZOOM.min, ZOOM.max, ZOOM.step)
    .name('Zoom')
    .onChange(() => api?.applyZoom?.());
  view.add({ reset: () => api?.resetZoom?.() }, 'reset')
    .name('Reset Zoom');
  view.add(pipeline.rotation, 'x').name('Rot X').decimals(1).disable();
  view.add(pipeline.rotation, 'y').name('Rot Y').decimals(1).disable();
  view.add(pipeline.rotation, 'z').name('Rot Z').decimals(1).disable();
  view.add({ resetRotation: () => api?.resetRotation?.() }, 'resetRotation')
    .name('Reset Rotation');

  // ── Randomness (global — drives sphere modifiers and Julia seed) ───────────
  const seed = gui.addFolder('Randomness');
  seed.add(pipeline, 'masterSeed').name('Seed').onChange(() => onChange?.());
  seed.add({
    randomize() {
      pipeline.masterSeed = Math.floor(Math.random() * 1_000_000);
      if (pipeline.shapeType === 'mandelbulb' && pipeline.mandelbulb.juliaMode) {
        api?.randomizeJuliaC?.();
      } else if (pipeline.shapeType === 'mandelbox' && pipeline.mandelbox.juliaMode) {
        api?.randomizeJuliaC?.();
      }
      onChange?.(true);
    }
  }, 'randomize').name('Randomize');
}
