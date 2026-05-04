import * as THREE from 'three';
import { COLORS, CAMERA, SDF_LIGHTING } from '../world.js';

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

  uniform vec3  uKeyDir;
  uniform vec3  uKeyColor;
  uniform float uKeyIntensity;
  uniform vec3  uFillDir;
  uniform vec3  uFillColor;
  uniform float uFillIntensity;
  uniform float uAmbient;
  uniform float uRoughness;
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
          
          // Diffuse
          float key  = max(dot(n, uKeyDir),  0.0);
          float fill = max(dot(n, uFillDir), 0.0);
          
          // Specular (Blinn-Phong)
          vec3 viewDir = -rd;
          float specPower = mix(120.0, 2.0, uRoughness);
          float specMask = (1.0 - uRoughness);

          vec3 halfKey = normalize(uKeyDir + viewDir);
          float specKey = pow(max(dot(n, halfKey), 0.0), specPower) * specMask;

          vec3 halfFill = normalize(uFillDir + viewDir);
          float specFill = pow(max(dot(n, halfFill), 0.0), specPower) * specMask;
          
          vec3 diffuse = uKeyColor * uKeyIntensity * key + uFillColor * uFillIntensity * fill;
          vec3 specular = (uKeyColor * specKey * uKeyIntensity) + (uFillColor * specFill * uFillIntensity);
          
          vec3 ambient = uBgColor * uAmbient;
          vec3 litColor = (uColorA * diffuse) + (uColorA * ambient) + specular;
          
          return vec4(mix(uColorB, litColor, clamp(key + fill + uAmbient, 0.0, 1.0)), 1.0);
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
    // Lighting uniforms
    uKeyDir:         { value: new THREE.Vector3(...SDF_LIGHTING.keyDir) },
    uKeyColor:       { value: new THREE.Color(0xffffff) },
    uKeyIntensity:   { value: SDF_LIGHTING.keyIntensity },
    uFillDir:        { value: new THREE.Vector3(...SDF_LIGHTING.fillDir) },
    uFillColor:      { value: new THREE.Color(0x8090b0) },
    uFillIntensity:  { value: SDF_LIGHTING.fillIntensity },
    uAmbient:        { value: SDF_LIGHTING.ambient },
    uRoughness:      { value: 0.75 },
  };
}

// ── JS: convert azimuth/elevation degrees to normalized direction ─────────────
export function anglesToDir(azimuthDeg, elevationDeg) {
  const az = THREE.MathUtils.degToRad(azimuthDeg);
  const el = THREE.MathUtils.degToRad(elevationDeg);
  return new THREE.Vector3(
    Math.cos(el) * Math.sin(az),
    Math.sin(el),
    Math.cos(el) * Math.cos(az)
  );
}

// ── JS: sync appearance state into SDF shader uniforms ────────────────────────
export function syncAppearanceUniforms(uniforms, appearance) {
  uniforms.uColorA.value.set(appearance.surfaceLit);
  uniforms.uColorB.value.set(appearance.surfaceShadow);
  uniforms.uBgColor.value.set(appearance.background);
  uniforms.uKeyDir.value.copy(anglesToDir(appearance.keyAzimuth, appearance.keyElevation));
  uniforms.uKeyColor.value.set(appearance.keyColor);
  uniforms.uKeyIntensity.value = appearance.keyIntensity;
  uniforms.uFillDir.value.copy(anglesToDir(appearance.fillAzimuth, appearance.fillElevation));
  uniforms.uFillColor.value.set(appearance.fillColor);
  uniforms.uFillIntensity.value = appearance.fillIntensity;
  uniforms.uAmbient.value = appearance.ambient;
  uniforms.uRoughness.value = appearance.roughness;
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
