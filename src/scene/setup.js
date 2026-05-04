import * as THREE from 'three';
import { COLORS, CAMERA, LIGHTS, PIXEL_RATIO } from '../world.js';

// Camera, lights, and world are completely fixed under user input.
// Object rotation is handled by `objectControls.js` (mouse drag rotates the
// MESH or the SDF rotation uniform — never the camera).
export function createScene(container, { onBeforeRender } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, PIXEL_RATIO.mesh));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.background);

  const camera = new THREE.PerspectiveCamera(
    CAMERA.fov,
    window.innerWidth / window.innerHeight,
    CAMERA.near,
    CAMERA.farMesh
  );
  camera.position.set(...CAMERA.position);
  camera.lookAt(0, 0, 0);

  // World-fixed three-light rig.
  const ambient = new THREE.AmbientLight(LIGHTS.ambient.color, LIGHTS.ambient.intensity);
  const key = new THREE.DirectionalLight(LIGHTS.key.color, LIGHTS.key.intensity);
  key.position.set(...LIGHTS.key.position);
  const hemi = new THREE.HemisphereLight(LIGHTS.hemi.sky, LIGHTS.hemi.ground, LIGHTS.hemi.intensity);
  scene.add(ambient, key, hemi);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, PIXEL_RATIO.mesh));
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const clock = new THREE.Clock();
  function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    const elapsed = clock.getElapsedTime();
    if (onBeforeRender) onBeforeRender({ camera, scene, elapsed, delta });
    renderer.render(scene, camera);
  }
  animate();

  return { renderer, scene, camera, lights: { ambient, key, hemi } };
}

// One-shot camera framing. Call after creating an object to position the
// camera at a sensible distance to view it. Does NOT install any user
// interaction — the camera stays put afterward.
export function frameObject(camera, object, padding = 1.4) {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return;
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = camera.fov * (Math.PI / 180);
  let dist = (maxDim / 2) / Math.tan(fov / 2);
  dist *= padding;

  // Look straight down +Z toward the object so the world-fixed lighting
  // (key from upper-right-front) creates an obvious lit/shaded contrast.
  camera.position.set(center.x, center.y, center.z + dist);
  camera.near = 0.1;                  // generous near plane — close parts of a rotating object stay visible
  camera.far = dist * 100;
  camera.updateProjectionMatrix();
  camera.lookAt(center);
}
