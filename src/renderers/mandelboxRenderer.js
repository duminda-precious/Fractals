import * as THREE from 'three';
import {
  SDF_VERT, SDF_COMMON_UNIFORMS_GLSL, SDF_MAIN_GLSL,
  rayBoxGLSL, estimateNormalGLSL, sdfMarchGLSL,
  sdfBaseUniforms, createSDFProxy
} from './sdfUtils.js';

const FRAG = /* glsl */ `
  ${rayBoxGLSL()}
  ${SDF_COMMON_UNIFORMS_GLSL}

  uniform float uScale;
  uniform int   uIterations;
  uniform float uMinRadius;
  uniform float uFixedRadius;
  uniform bool  uJuliaMode;
  uniform vec3  uJuliaC;

  const int MAX_ITER = 30;

  void boxFold(inout vec3 z) {
    z = clamp(z, -1.0, 1.0) * 2.0 - z;
  }

  void sphereFold(inout vec3 z, inout float dz) {
    float r2      = dot(z, z);
    float minR2   = uMinRadius   * uMinRadius;
    float fixedR2 = uFixedRadius * uFixedRadius;
    if (r2 < minR2) {
      float t = fixedR2 / minR2; z *= t; dz *= t;
    } else if (r2 < fixedR2) {
      float t = fixedR2 / r2;   z *= t; dz *= t;
    }
  }

  float mandelboxDE(vec3 pos) {
    vec3 z = pos;
    vec3 c = uJuliaMode ? uJuliaC : pos;
    float dr = 1.0;
    for (int i = 0; i < MAX_ITER; i++) {
      if (i >= uIterations) break;
      boxFold(z);
      sphereFold(z, dr);
      z  = uScale * z + c;
      dr = dr * abs(uScale) + 1.0;
    }
    return length(z) / abs(dr);
  }

  // Intersect with bounding sphere so the fractal has a clean finite edge.
  // uBoundingBox.x holds the sphere radius (fixedRadius × 2), kept in sync
  // with the AABB used by the march early-exit test.
  float worldDE(vec3 worldP) {
    vec3 p = uObjectRotInv * worldP;
    return max(mandelboxDE(p), length(p) - uBoundingBox.x);
  }

  ${estimateNormalGLSL()}
  ${sdfMarchGLSL({ stepFactor: 0.5 })}
  ${SDF_MAIN_GLSL}
`;

const DEFAULT_PARAMS = Object.freeze({
  scale:       -2.5,
  iterations:  15,
  minRadius:   0.5,
  fixedRadius: 1.0,
  juliaMode:   false,
  juliaC:      [0, 0, 0],
  maxSteps:    96,
  minDist:     5e-4,
  maxDist:     40.0
});

export function getMandelboxDefaults() {
  return { ...DEFAULT_PARAMS, juliaC: [...DEFAULT_PARAMS.juliaC] };
}

export function createMandelboxRenderer() {
  const boundingR = DEFAULT_PARAMS.fixedRadius * 2.0;

  const material = new THREE.ShaderMaterial({
    vertexShader:   SDF_VERT,
    fragmentShader: FRAG,
    side:        THREE.BackSide,
    transparent: true,
    depthWrite:  false,
    uniforms: {
      uScale:      { value: DEFAULT_PARAMS.scale },
      uIterations: { value: DEFAULT_PARAMS.iterations },
      uMinRadius:  { value: DEFAULT_PARAMS.minRadius },
      uFixedRadius:{ value: DEFAULT_PARAMS.fixedRadius },
      uJuliaMode:  { value: DEFAULT_PARAMS.juliaMode },
      uJuliaC:     { value: new THREE.Vector3() },
      ...sdfBaseUniforms(new THREE.Vector3(boundingR, boundingR, boundingR)),
    }
  });

  material.uniforms.uMaxSteps.value = DEFAULT_PARAMS.maxSteps;
  material.uniforms.uMinDist.value  = DEFAULT_PARAMS.minDist;
  material.uniforms.uMaxDist.value  = DEFAULT_PARAMS.maxDist;

  const { mesh, syncCamera, setRotation, tick, dispose } = createSDFProxy(material);

  function setUniforms(params) {
    if (!params) return;
    const u = material.uniforms;
    if (params.scale       != null) u.uScale.value       = params.scale;
    if (params.iterations  != null) u.uIterations.value  = Math.round(params.iterations);
    if (params.minRadius   != null) u.uMinRadius.value   = params.minRadius;
    if (params.fixedRadius != null) {
      u.uFixedRadius.value = params.fixedRadius;
      u.uBoundingBox.value.setScalar(params.fixedRadius * 2.0);
    }
    if (params.juliaMode   != null) u.uJuliaMode.value   = !!params.juliaMode;
    if (params.juliaC)               u.uJuliaC.value.set(...params.juliaC);
    if (params.maxSteps    != null) u.uMaxSteps.value    = Math.round(params.maxSteps);
    if (params.minDist     != null) u.uMinDist.value     = params.minDist;
    if (params.maxDist     != null) u.uMaxDist.value     = params.maxDist;
  }

  return { mesh, material, setUniforms, syncCamera, setRotation, tick, dispose };
}
