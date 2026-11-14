import * as THREE from 'three';
import { createScene, frameObject } from './scene/setup.js';
import { createObjectControls } from './scene/objectControls.js';
import { clayMaterial, wireframeMaterial } from './scene/materials.js';
import { registerGenerator, registerModifier } from './pipeline/registry.js';
import { execute } from './pipeline/engine.js';

import { geodesicGenerator } from './generators/geodesic.js';
import { polyhedronGenerator } from './generators/polyhedron.js';
import { noiseDisplaceModifier } from './modifiers/noiseDisplace.js';
import { edgeThickenModifier } from './modifiers/edgeThicken.js';
import { subdivideModifier } from './modifiers/subdivide.js';
import { mergeModifier } from './modifiers/merge.js';
import { faceExplodeModifier } from './modifiers/faceExplode.js';
import { facetAnimateModifier } from './modifiers/facetAnimate.js';
import { buildGUI, refreshDisplays, refreshRotation } from './gui/panels.js';

import { debounce } from './utils/debounce.js';
import { disposeObject } from './utils/dispose.js';

import { createMandelbulbRenderer, getMandelbulbDefaults } from './renderers/mandelbulbRenderer.js';
import { createCrystalRenderer, getCrystalDefaults } from './renderers/crystalRenderer.js';
import { createMandelboxRenderer, getMandelboxDefaults } from './renderers/mandelboxRenderer.js';
import { syncAppearanceUniforms, anglesToDir } from './renderers/sdfUtils.js';
import { CAMERA, PIXEL_RATIO, ZOOM, DEFAULT_APPEARANCE } from './world.js';

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
  crystal: createCrystalRenderer,
  mandelbox: createMandelboxRenderer,
};

const pipeline = {
  shapeType: 'mandelbulb',
  zoom: ZOOM.default,

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
  rotation: { x: -39.8, y: 17.3, z: -160.5 },
  appearance: { ...DEFAULT_APPEARANCE },
  autoRotateZ: true
};

export const api = {
  regenerate() { regenerate(); },
  resetRotation() { objectControls?.reset(); },
  applyZoom() { applyZoom(); },
  resetZoom() { pipeline.zoom = ZOOM.default; applyZoom(); refreshDisplays(); },
  pushRotation() {
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        THREE.MathUtils.degToRad(pipeline.rotation.x),
        THREE.MathUtils.degToRad(pipeline.rotation.y),
        THREE.MathUtils.degToRad(pipeline.rotation.z),
        'XYZ'
      )
    );
    objectControls.quaternion.copy(q);
    if (sdfRenderer) {
      sdfRenderer.setRotation(objectControls.getInverseMatrix3());
    } else if (currentRoot) {
      currentRoot.quaternion.copy(q);
    }
  },
  applyAppearance() { applyAppearance(); }
};

const container = document.getElementById('app');
let sdfRenderer = null;

let _restorationTimer = null;
function sdfInteractionStart() {
  if (!sdfRenderer) return;
  clearTimeout(_restorationTimer);
  renderer.setSize(window.innerWidth / 1, window.innerHeight / 1, false);
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

function applyAppearance() {
  const a = pipeline.appearance;
  // Scene background
  scene.background.set(a.background);
  // Mesh material
  clayMaterial.color.set(a.surfaceLit);
  clayMaterial.roughness = a.roughness;
  // Three.js lights (mesh path)
  lights.ambient.color.set(a.background);
  lights.ambient.intensity = a.ambient;
  lights.key.color.set(a.keyColor);
  lights.key.intensity = a.keyIntensity;
  lights.key.position.copy(anglesToDir(a.keyAzimuth, a.keyElevation)).multiplyScalar(20);
  lights.hemi.color.set(a.fillColor);
  lights.hemi.intensity = a.fillIntensity;
  // SDF uniforms
  if (sdfRenderer) {
    syncAppearanceUniforms(sdfRenderer.material.uniforms, a);
  }
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

// Declared before createScene: its render loop can fire before controls exist.
let objectControls = null;

const { renderer, scene, camera, lights } = createScene(container, {
  onBeforeRender: ({ camera: cam, elapsed, delta }) => {
    if (sdfRenderer) {
      sdfRenderer.syncCamera(cam);
      sdfRenderer.tick(elapsed);
    }

    if (pipeline.autoRotateZ && objectControls) {
      const speed = 0.5; // radians per second
      const qInc = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), delta * speed);
      objectControls.quaternion.multiply(qInc);
      
      if (sdfRenderer) {
        sdfRenderer.setRotation(objectControls.getInverseMatrix3());
      } else if (currentRoot) {
        currentRoot.quaternion.copy(objectControls.quaternion);
      }
      syncRotationDisplay();
    }
  }
});

objectControls = createObjectControls(renderer.domElement, {
  onDragStart: () => sdfInteractionStart(),
  onDragEnd: () => sdfInteractionEnd(),
  onChange: (q) => {
    if (sdfRenderer) {
      sdfRenderer.setRotation(objectControls.getInverseMatrix3());
    } else if (currentRoot) {
      currentRoot.quaternion.copy(q);
    }
    syncRotationDisplay();
  }
});

// Link scroll wheel to zoom
renderer.domElement.addEventListener('wheel', (e) => {
  e.preventDefault();

  // Determine zoom direction: scroll up (negative deltaY) = zoom in (positive delta)
  const delta = -Math.sign(e.deltaY) * 3;

  const newZoom = pipeline.zoom + delta * ZOOM.step;
  pipeline.zoom = Math.max(ZOOM.min, Math.min(ZOOM.max, newZoom));

  applyZoom();
  refreshDisplays();
}, { passive: false });

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
    camera.far = CAMERA.farSDF;
    camera.lookAt(0, 0, 0);
    applyZoom();
    sdfRenderer.syncCamera(camera);
    applyAppearance();
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

api.pushRotation(); // apply default rotation before first render
buildGUI(pipeline, { onChange, api });
regenerate();
