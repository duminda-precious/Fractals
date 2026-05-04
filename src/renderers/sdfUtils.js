import * as THREE from 'three';
import { COLORS, CAMERA } from '../world.js';

// ── Shared vertex shader ───────────────────────────────────────────────────────
export const SDF_VERT = /* glsl */ `
  varying vec3 vWorldPos;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

// ── Shared GLSL uniform declarations ──────────────────────────────────────────
// Inject into every SDF fragment shader before shape-specific code.
export const SDF_COMMON_UNIFORMS_GLSL = /* glsl */ `
  precision highp float;
  varying vec3 vWorldPos;

  uniform int   uMaxSteps;
  uniform float uMinDist;
  uniform float uMaxDist;
  uniform vec3  uBoundingBox;
  uniform vec3  uCameraPosWorld;
  uniform mat3  uObjectRotInv;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform vec3  uBgColor;
  uniform float uTime;
`;

// ── GLSL: ray vs AABB slab test ────────────────────────────────────────────────
// Returns vec2(tNear, tFar). Miss when tNear > tFar or tFar < 0.
export function rayBoxGLSL() {
  return /* glsl */ `
    vec2 rayBox(vec3 ro, vec3 rd, vec3 halfExtents) {
      vec3 tMin = (-halfExtents - ro) / rd;
      vec3 tMax = ( halfExtents - ro) / rd;
      vec3 t1 = min(tMin, tMax);
      vec3 t2 = max(tMin, tMax);
      return vec2(max(t1.x, max(t1.y, t1.z)),
                  min(t2.x, min(t2.y, t2.z)));
    }
  `;
}

// ── GLSL: tetrahedron-tap normal estimator ────────────────────────────────────
// Requires worldDE() to be defined in the same shader.
export function estimateNormalGLSL() {
  return /* glsl */ `
    vec3 estimateNormal(vec3 p) {
      const float h = 0.0008;
      const vec2 k = vec2(1.0, -1.0);
      return normalize(
        k.xyy * worldDE(p + k.xyy * h) +
        k.yyx * worldDE(p + k.yyx * h) +
        k.yxy * worldDE(p + k.yxy * h) +
        k.xxx * worldDE(p + k.xxx * h)
      );
    }
  `;
}

// ── GLSL: sphere-traced march with AABB early exit ────────────────────────────
// Requires: rayBox(), estimateNormal(), worldDE(), SDF_COMMON_UNIFORMS_GLSL,
//           and the lighting consts from sdfLightingGLSL().
// stepFactor: march scale — lower is safer but slower (0.5 is canonical).
export function sdfMarchGLSL({ stepFactor = 0.5 } = {}) {
  return /* glsl */ `
    vec4 march(vec3 ro, vec3 rd) {
      // Transform ray to local SDF frame and test against bounding box.
      // Background pixels (the majority) exit in O(1) instead of burning
      // all march steps through empty space.
      vec3 roL = uObjectRotInv * ro;
      vec3 rdL = uObjectRotInv * rd;
      vec2 box = rayBox(roL, rdL, uBoundingBox);
      if (box.x > box.y || box.y < 0.0) return vec4(uBgColor, 0.0);

      float t      = max(box.x - 0.01, 0.0);
      float tLimit = min(box.y + 0.01, uMaxDist);

      for (int i = 0; i < 256; i++) {
        if (i >= uMaxSteps) break;
        vec3 p = ro + rd * t;
        float d = worldDE(p);
        if (d < uMinDist) {
          vec3 n = estimateNormal(p);
          float key      = max(dot(n, KEY_DIR),  0.0);
          float fill     = max(dot(n, FILL_DIR), 0.0);
          float lighting = AMBIENT + KEY_INTENSITY * key + FILL_INTENSITY * fill;
          return vec4(mix(uColorB, uColorA, clamp(lighting, 0.0, 1.0)), 1.0);
        }
        if (t > tLimit) break;
        t += d * ${stepFactor.toFixed(2)};
      }
      return vec4(uBgColor, 0.0);
    }
  `;
}

// ── GLSL: standard SDF main() ─────────────────────────────────────────────────
export const SDF_MAIN_GLSL = /* glsl */ `
  void main() {
    vec3 ro = uCameraPosWorld;
    vec3 rd = normalize(vWorldPos - uCameraPosWorld);
    vec4 color = march(ro, rd);
    if (color.a < 0.5) discard;
    gl_FragColor = color;
  }
`;

// ── JS: base Three.js uniforms shared by all SDF renderers ────────────────────
// boundingBox: vec3 half-extents of the shape's tight AABB.
export function sdfBaseUniforms(boundingBox) {
  return {
    uBoundingBox:    { value: (boundingBox || new THREE.Vector3(1.5, 1.5, 1.5)).clone() },
    uMaxSteps:       { value: 96 },
    uMinDist:        { value: 5e-4 },
    uMaxDist:        { value: 40.0 },
    uCameraPosWorld: { value: new THREE.Vector3(...CAMERA.positionSDF) },
    uObjectRotInv:   { value: new THREE.Matrix3() },
    uColorA:         { value: new THREE.Color(COLORS.lit) },
    uColorB:         { value: new THREE.Color(COLORS.shadow) },
    uBgColor:        { value: new THREE.Color(COLORS.background) },
    uTime:           { value: 0 },
  };
}

// ── JS: create 500³ proxy mesh + attach shared SDF renderer methods ───────────
// material must include the uniforms from sdfBaseUniforms().
export function createSDFProxy(material) {
  const geometry = new THREE.BoxGeometry(500, 500, 500);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;

  function syncCamera(camera) {
    material.uniforms.uCameraPosWorld.value.copy(camera.position);
  }
  function setRotation(m3inv) {
    material.uniforms.uObjectRotInv.value.copy(m3inv);
  }
  function tick(t) {
    material.uniforms.uTime.value = t;
  }
  function dispose() {
    geometry.dispose();
    material.dispose();
  }

  return { mesh, syncCamera, setRotation, tick, dispose };
}
