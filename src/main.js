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
import { buildGUI, refreshDisplays, refreshRotation } from './gui/panels.js';
import { updateTriangleCounter } from './gui/triangleCounter.js';
import { debounce } from './utils/debounce.js';
import { disposeObject } from './utils/dispose.js';
import { mulberry32, deriveSeed } from './utils/prng.js';
import { createMandelbulbRenderer, getMandelbulbDefaults } from './renderers/mandelbulbRenderer.js';
import { createCrystalRenderer, getCrystalDefaults } from './renderers/crystalRenderer.js';
import { createMandelboxRenderer, getMandelboxDefaults } from './renderers/mandelboxRenderer.js';
import { CAMERA, PIXEL_RATIO, ZOOM } from './world.js';

registerGenerator('geodesic', geodesicGenerator);
registerGenerator('polyhedron', polyhedronGenerator);
registerModifier('noiseDisplace', noiseDisplaceModifier);
registerModifier('edgeThicken', edgeThickenModifier);
registerModifier('subdivide', subdivideModifier);
registerModifier('merge', mergeModifier);
registerModifier('faceExplode', faceExplodeModifier);
registerModifier('facetAnimate', facetAnimateModifier);

// Add new SDF shapes here — one line per shape.
const SDF_FACTORIES = {
  mandelbulb: createMandelbulbRenderer,
  crystal:    createCrystalRenderer,
  mandelbox:  createMandelboxRenderer,
};

const pipeline = {
  shapeType: 'mandelbulb',
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
  crystal:    getCrystalDefaults(),
  mandelbox:  getMandelboxDefaults(),
  rotation: { x: 0, y: 0, z: 0 }
};

export const api = {
  randomizeJuliaC() {
    const rand   = mulberry32(deriveSeed(pipeline.masterSeed, 'mandelbulb-julia'));
    const params = pipeline[pipeline.shapeType];
    if (params?.juliaC) {
      params.juliaC = [rand() - 0.5, rand() - 0.5, rand() - 0.5];
      sdfRenderer?.setUniforms(params);
    }
    refreshDisplays();
  },
  regenerate()    { regenerate(); },
  resetRotation() { objectControls?.reset(); },
  applyZoom()     { applyZoom(); },
  resetZoom()     { pipeline.zoom = ZOOM.default; applyZoom(); refreshDisplays(); }
};

const container = document.getElementById('app');
let sdfRenderer = null;

let _restorationTimer = null;
function sdfInteractionStart() {
  if (!sdfRenderer) return;
  clearTimeout(_restorationTimer);
  renderer.setSize(window.innerWidth / 2, window.innerHeight / 2, false);
}
function sdfInteractionEnd() {
  if (!sdfRenderer) return;
  clearTimeout(_restorationTimer);
  _restorationTimer = setTimeout(() => {
    renderer.setSize(window.innerWidth, window.innerHeight, true);
  }, 300);
}

function applyZoom() {
  camera.fov = CAMERA.fov / pipeline.zoom;
  camera.updateProjectionMatrix();
}

// Cached Euler — avoids allocating a new object on every drag frame.
const _euler = new THREE.Euler();
function syncRotationDisplay() {
  _euler.setFromQuaternion(objectControls.quaternion, 'XYZ');
  pipeline.rotation.x = parseFloat(THREE.MathUtils.radToDeg(_euler.x).toFixed(1));
  pipeline.rotation.y = parseFloat(THREE.MathUtils.radToDeg(_euler.y).toFixed(1));
  pipeline.rotation.z = parseFloat(THREE.MathUtils.radToDeg(_euler.z).toFixed(1));
  refreshRotation();
}

const { renderer, scene, camera } = createScene(container, {
  onBeforeRender: ({ camera: cam, elapsed }) => {
    if (sdfRenderer) {
      sdfRenderer.syncCamera(cam);
      sdfRenderer.tick(elapsed);
    }
  }
});

const objectControls = createObjectControls(renderer.domElement, {
  onDragStart: () => sdfInteractionStart(),
  onDragEnd:   () => sdfInteractionEnd(),
  onChange: (q) => {
    if (sdfRenderer) {
      sdfRenderer.setRotation(objectControls.getInverseMatrix3());
    } else if (currentRoot) {
      currentRoot.quaternion.copy(q);
    }
    syncRotationDisplay();
  }
});

let currentRoot  = null;
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
      else if (value.isObject3D) value.traverse((c) => { if (c.geometry) c.geometry.dispose(); });
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

function regenerate() {
  clearCurrent();
  if (sdfRenderer) { sdfRenderer.dispose(); sdfRenderer = null; }

  const createSDF = SDF_FACTORIES[pipeline.shapeType];
  if (createSDF) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, PIXEL_RATIO.sdf));
    sdfRenderer = createSDF();
    sdfRenderer.setUniforms(pipeline[pipeline.shapeType]);
    sdfRenderer.setRotation(objectControls.getInverseMatrix3());
    scene.add(sdfRenderer.mesh);
    currentRoot = sdfRenderer.mesh;
    camera.position.set(...CAMERA.positionSDF);
    camera.near = CAMERA.near;
    camera.far  = CAMERA.farSDF;
    camera.lookAt(0, 0, 0);
    applyZoom();
    sdfRenderer.syncCamera(camera);
    updateTriangleCounter(0);
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, PIXEL_RATIO.mesh));
  const { output, slots, warnings } = execute(pipeline);
  currentSlots = slots;
  for (const w of warnings) console.warn(`[${w.id}] ${w.message}`);

  const root = buildMeshFromOutput(output);
  if (root) {
    if (pipeline.wireframeOverlay && root.isMesh) {
      root.add(new THREE.Mesh(root.geometry, wireframeMaterial));
    }
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

function onChange(structural = false) {
  if (structural) {
    regenerate();
    buildGUI(pipeline, { onChange, api });
    return;
  }
  if (sdfRenderer) {
    sdfInteractionStart();
    sdfRenderer.setUniforms(pipeline[pipeline.shapeType]);
    sdfInteractionEnd();
  } else {
    debouncedRegenerate();
  }
}

buildGUI(pipeline, { onChange, api });
regenerate();
