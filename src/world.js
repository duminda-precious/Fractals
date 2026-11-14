// Central world configuration.
// All camera, lighting, color, and background defaults live here.
// Shape-specific renderers and the scene setup import from this file
// so values are never duplicated.

// ── Colors ────────────────────────────────────────────────────────────────────
export const COLORS = {
  background:   0x111416,
  lit:          0xe8e0d8,
  shadow:       0x2a3340,
  wireframe:    0x88aaff,
};

// ── Default appearance (user-controllable via GUI) ────────────────────────────
export const DEFAULT_APPEARANCE = {
  // Material
  surfaceLit:      '#6b97ff',
  surfaceShadow:   '#247fff',
  roughness:       0.84,
  // Key light
  keyColor:        '#ffffff',
  keyIntensity:    1,
  keyAzimuth:      -28,
  keyElevation:    -22,
  // Fill light
  fillColor:       '#f7f7f7',
  fillIntensity:   0,
  fillAzimuth:     -140,
  fillElevation:   25,
  // Ambient
  ambient:         0.15,
  // Background
  background:      '#dedede',
};

// ── Camera ────────────────────────────────────────────────────────────────────
export const CAMERA = {
  fov:         45,
  near:        0.1,
  farMesh:     500,    // generous far for bbox-framed mesh objects
  farSDF:      600,    // SDF proxy box is 500 units; needs extra headroom
  position:    [0, 0, 5],   // default eye; mesh path overrides via frameObject
  positionSDF: [0, 0, 4],   // fixed eye for SDF shapes (fractal radius ~1.5–3)
};

// ── Scene lights (Three.js objects in main scene) ─────────────────────────────
// These light the sphere/mesh pipeline path. SDF renderers ignore Three.js
// lights and use their own shader-internal rig defined in SDF_LIGHTING below.
export const LIGHTS = {
  ambient: { color: 0xffffff, intensity: 0.4 },
  key:     { color: 0xffffff, intensity: 1.2, position: [10, 20, 10] },
  hemi:    { sky: 0xbfd4ff, ground: 0x1a1a1a, intensity: 0.3 },
};

// ── SDF shader lighting ───────────────────────────────────────────────────────
// Shared between all SDF renderers (Mandelbulb, Crystal, …).
// Directions are pre-normalized so the shader does no extra work.
export const SDF_LIGHTING = {
  keyDir:        [0.5345,  0.8018,  0.2673],   // normalize(0.6, 0.9, 0.3)
  fillDir:       [-0.5571, 0.4179, -0.7165],   // normalize(-0.4, 0.3, -0.5) opposite side
  ambient:       0.30,
  keyIntensity:  0.85,
  fillIntensity: 0.25,
};

// sdfLightingGLSL() removed — lighting now uses runtime uniforms (see sdfUtils.js).

// ── Zoom ─────────────────────────────────────────────────────────────────────
// Zoom works by scaling the camera FOV: fov = CAMERA.fov / zoom.
// Higher zoom = narrower FOV = objects appear larger.
export const ZOOM = {
  default: 1.15,
  min:     0.2,
  max:     4.0,
  step:    0.05,
};

// ── Pixel ratio caps ──────────────────────────────────────────────────────────
// SDF renderers are fragment-bound so we cap lower than mesh renders.
export const PIXEL_RATIO = {
  mesh: 2.0,
  sdf:  1.5,
};
