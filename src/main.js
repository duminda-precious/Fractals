import * as THREE from 'three';
import { createScene, frameObject } from './scene/setup.js';
import { createObjectControls } from './scene/objectControls.js';
import { clayMaterial, wireframeMaterial } from './scene/materials.js';
import { registerGenerator, registerModifier } from './pipeline/registry.js';
import { execute } from './pipeline/engine.js';
import { countTriangles } from './pipeline/slots.js';
import { geodesicGenerator } from './generators/geodesic.js';
import { polyhedronGenerator } from './generators/polyhedron.js';
import { noiseDisplaceModifier } from './modifiers/noiseDisplace.js';
import { edgeThickenModifier } from './modifiers/edgeThicken.js';
import { subdivideModifier } from './modifiers/subdivide.js';
import { mergeModifier } from './modifiers/merge.js';
import { faceExplodeModifier } from './modifiers/faceExplode.js';
import { facetAnimateModifier } from './modifiers/facetAnimate.js';
import { buildGUI, refreshDisplays } from './gui/panels.js';
import { updateTriangleCounter } from './gui/triangleCounter.js';
import { debounce } from './utils/debounce.js';
import { disposeObject } from './utils/dispose.js';
import { mulberry32, deriveSeed } from './utils/prng.js';
import { createMandelbulbRenderer, getMandelbulbDefaults } from './renderers/mandelbulbRenderer.js';
import { createCrystalRenderer, getCrystalDefaults } from './renderers/crystalRenderer.js';
import { createMandelboxRenderer, getMandelboxDefaults } from './renderers/mandelboxRenderer.js';
import { CAMERA, PIXEL_RATIO, ZOOM } from './world.js';

// ===== Register types =====
registerGenerator('geodesic', geodesicGenerator);
registerGenerator('polyhedron', polyhedronGenerator);
registerModifier('noiseDisplace', noiseDisplaceModifier);
registerModifier('edgeThicken', edgeThickenModifier);
registerModifier('subdivide', subdivideModifier);
registerModifier('merge', mergeModifier);
registerModifier('faceExplode', faceExplodeModifier);
registerModifier('facetAnimate', facetAnimateModifier);

// ===== Pipeline =====
const pipeline = {
  shapeType: 'mandelbulb',         // 'sphere' | 'mandelbulb' | 'crystal' | 'mandelbox'
  zoom: ZOOM.default,
  masterSeed: 4242,
  outputSlot: 'final',
  wireframeOverlay: true,
  base: {
    type: 'geodesic',
    outputSlot: 'raw',
    params: { radius: 1.0, subdivisions: 2 }
  },
  modifiers: [
    {
      id: 'mod-explode',
      type: 'faceExplode',
      enabled: true,
      inputSlot: 'raw',
      outputSlot: 'exploded',
      params: { explodeAmount: 0.5, frequency: 2.0, threshold: 0.0, faceGap: 0.1, octaves: 2, seed: null }
    },
    {
      id: 'mod-animate',
      type: 'facetAnimate',
      enabled: true,
      inputSlot: 'exploded',
      outputSlot: 'final',
      params: { time: 0.0, easing: 'smoothstep' }
    }
  ],
  mandelbulb: getMandelbulbDefaults(),
  crystal: getCrystalDefaults(),
  mandelbox: getMandelboxDefaults(),
  rotation: { x: 0, y: 0, z: 0 }   // display-only Euler degrees, synced from objectControls
};

// ===== Public API exposed to the GUI =====
// The GUI calls these to drive the scene without knowing rendering internals.
export const api = {
  // Re-derive juliaC from the master seed; used by the "Randomize Julia C" button.
  randomizeJuliaC() {
    const rand = mulberry32(deriveSeed(pipeline.masterSeed, 'mandelbulb-julia'));
    const cx = rand() * 1.0 - 0.5;
    const cy = rand() * 1.0 - 0.5;
    const cz = rand() * 1.0 - 0.5;
    if (pipeline.shapeType === 'mandelbulb') {
      pipeline.mandelbulb.juliaC = [cx, cy, cz];
      pushMandelbulbUniforms();
    } else if (pipeline.shapeType === 'mandelbox') {
      pipeline.mandelbox.juliaC = [cx, cy, cz];
      pushMandelboxUniforms();
    }
    refreshDisplays();
  },
  // Force a full regeneration regardless of mode.
  regenerate() { regenerate(); },
  // Reset the user-driven object rotation back to identity.
  resetRotation() { objectControls?.reset(); },
  // Apply current pipeline.zoom to the camera FOV.
  applyZoom() { applyZoom(); },
  // Reset zoom to default and refresh the GUI display.
  resetZoom() { pipeline.zoom = ZOOM.default; applyZoom(); refreshDisplays(); }
};

// ===== Scene =====
const container = document.getElementById('app');
let bulbRenderer = null;     // lazily created
let crystalRenderer = null;  // lazily created
let boxRenderer = null;      // lazily created

// Half-resolution scaling for all SDF shapes.
// Drops to 50% during active interaction (drag or slider), restores 300 ms
// after the last input. Only fires when an SDF renderer is active.
let _restorationTimer = null;
function sdfInteractionStart() {
  if (!activeSDFRenderer()) return;
  clearTimeout(_restorationTimer);
  renderer.setSize(window.innerWidth / 1, window.innerHeight / 1, false);
}
function sdfInteractionEnd() {
  if (!activeSDFRenderer()) return;
  clearTimeout(_restorationTimer);
  _restorationTimer = setTimeout(() => {
    renderer.setSize(window.innerWidth, window.innerHeight, true);
  }, 300);
}

// FOV-based zoom — works for every shape type without touching camera position
// or SDF uniforms. Three.js projection matrix drives both the rasterizer and
// the SDF ray directions via the proxy box vertex transform.
function applyZoom() {
  camera.fov = CAMERA.fov / pipeline.zoom;
  camera.updateProjectionMatrix();
}

// Converts the current objectControls quaternion to Euler degrees and pushes
// them into pipeline.rotation so the GUI display stays in sync on every drag.
function syncRotationDisplay() {
  const euler = new THREE.Euler().setFromQuaternion(objectControls.quaternion, 'XYZ');
  pipeline.rotation.x = parseFloat(THREE.MathUtils.radToDeg(euler.x).toFixed(1));
  pipeline.rotation.y = parseFloat(THREE.MathUtils.radToDeg(euler.y).toFixed(1));
  pipeline.rotation.z = parseFloat(THREE.MathUtils.radToDeg(euler.z).toFixed(1));
  refreshDisplays();
}

function activeSDFRenderer() {
  if (pipeline.shapeType === 'mandelbulb') return bulbRenderer;
  if (pipeline.shapeType === 'crystal') return crystalRenderer;
  if (pipeline.shapeType === 'mandelbox') return boxRenderer;
  return null;
}

const { renderer, scene, camera } = createScene(container, {
  onBeforeRender: ({ camera: cam, elapsed }) => {
    const sdf = activeSDFRenderer();
    if (sdf) {
      sdf.syncCamera(cam);
      sdf.tick(elapsed);
    }
  }
});

// Drag-to-rotate-object controls. Camera, lights and world stay still.
const objectControls = createObjectControls(renderer.domElement, {
  onDragStart: () => sdfInteractionStart(),
  onDragEnd: () => sdfInteractionEnd(),
  onChange: (q) => {
    const sdf = activeSDFRenderer();
    if (sdf) {
      sdf.setRotation(objectControls.getInverseMatrix3());
    } else if (currentRoot) {
      currentRoot.quaternion.copy(q);
    }
    syncRotationDisplay();
  }
});

let currentRoot = null;
let currentSlots = null;

function clearCurrent() {
  if (currentRoot) {
    disposeObject(currentRoot, { disposeMaterials: false });
    currentRoot = null;
  }
  if (currentSlots) {
    for (const value of currentSlots.values()) {
      if (!value) continue;
      if (value.isBufferGeometry) value.dispose();
      else if (value.isObject3D) {
        value.traverse((c) => { if (c.geometry) c.geometry.dispose(); });
      }
    }
    currentSlots = null;
  }
}

function buildMeshFromOutput(output) {
  if (!output) return null;
  if (output.isBufferGeometry) return new THREE.Mesh(output, clayMaterial);
  if (output.isObject3D) {
    output.traverse((c) => { if (c.isMesh) c.material = clayMaterial; });
    return output;
  }
  return null;
}

// Push mandelbulb params to the shader without rebuilding the mesh.
// Cheap (uniform writes only) — called on every slider tick in mandelbulb mode.
function pushMandelbulbUniforms() {
  if (!bulbRenderer) return;
  bulbRenderer.setUniforms(pipeline.mandelbulb);
}

// Crystal counterpart — same cheap uniform-write path used during slider drags.
function pushCrystalUniforms() {
  if (!crystalRenderer) return;
  crystalRenderer.setUniforms(pipeline.crystal);
}

function pushMandelboxUniforms() {
  if (!boxRenderer) return;
  boxRenderer.setUniforms(pipeline.mandelbox);
}

function regenerate() {
  clearCurrent();

  // Tear down any prior SDF renderer (its proxy geometry was disposed above).
  if (bulbRenderer) { bulbRenderer.dispose(); bulbRenderer = null; }
  if (crystalRenderer) { crystalRenderer.dispose(); crystalRenderer = null; }
  if (boxRenderer) { boxRenderer.dispose(); boxRenderer = null; }

  if (pipeline.shapeType === 'mandelbulb' || pipeline.shapeType === 'crystal' || pipeline.shapeType === 'mandelbox') {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, PIXEL_RATIO.sdf));

    let sdf;
    if (pipeline.shapeType === 'mandelbulb') {
      bulbRenderer = createMandelbulbRenderer();
      bulbRenderer.setUniforms(pipeline.mandelbulb);
      sdf = bulbRenderer;
    } else if (pipeline.shapeType === 'crystal') {
      crystalRenderer = createCrystalRenderer();
      crystalRenderer.setUniforms(pipeline.crystal);
      sdf = crystalRenderer;
    } else {
      boxRenderer = createMandelboxRenderer();
      boxRenderer.setUniforms(pipeline.mandelbox);
      sdf = boxRenderer;
    }
    sdf.setRotation(objectControls.getInverseMatrix3());
    scene.add(sdf.mesh);
    currentRoot = sdf.mesh;

    camera.position.set(...CAMERA.positionSDF);
    camera.near = CAMERA.near;
    camera.far = CAMERA.farSDF;
    camera.lookAt(0, 0, 0);
    applyZoom();
    sdf.syncCamera(camera);

    updateTriangleCounter(0);
    return;
  }

  // Sphere / pipeline path.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, PIXEL_RATIO.mesh));

  const { output, slots, warnings } = execute(pipeline);
  currentSlots = slots;

  for (const w of warnings) console.warn(`[${w.id}] ${w.message}`);

  const root = buildMeshFromOutput(output);
  if (root) {
    if (pipeline.wireframeOverlay && root.isMesh) {
      root.add(new THREE.Mesh(root.geometry, wireframeMaterial));
    }
    // Apply the current user-driven rotation to the new mesh so toggling
    // params doesn't snap the object back to identity.
    root.quaternion.copy(objectControls.quaternion);
    scene.add(root);
    currentRoot = root;
    frameObject(camera, root);
    applyZoom();
    updateTriangleCounter(countTriangles(output));
  } else {
    updateTriangleCounter(0);
  }
}

const debouncedRegenerate = debounce(regenerate, 150);

// onChange semantics:
//   structural === true → mode flip / rebuild GUI / regenerate now
//   in mandelbulb mode    → push uniforms instantly (no debounce, no rebuild)
//   in sphere mode        → debounced full regenerate
function onChange(structural = false) {
  if (structural) {
    regenerate();
    buildGUI(pipeline, { onChange, api });
    return;
  }
  if (pipeline.shapeType === 'mandelbulb') {
    sdfInteractionStart();
    pushMandelbulbUniforms();
    sdfInteractionEnd();
  } else if (pipeline.shapeType === 'crystal') {
    sdfInteractionStart();
    pushCrystalUniforms();
    sdfInteractionEnd();
  } else if (pipeline.shapeType === 'mandelbox') {
    sdfInteractionStart();
    pushMandelboxUniforms();
    sdfInteractionEnd();
  } else {
    debouncedRegenerate();
  }
}

buildGUI(pipeline, { onChange, api });
regenerate();
