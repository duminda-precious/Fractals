import * as THREE from 'three';
import { sdfLightingGLSL } from '../world.js';
import {
  SDF_VERT, SDF_COMMON_UNIFORMS_GLSL, SDF_MAIN_GLSL,
  rayBoxGLSL, estimateNormalGLSL, sdfMarchGLSL,
  sdfBaseUniforms, createSDFProxy
} from './sdfUtils.js';

const FRAG = /* glsl */ `
  ${sdfLightingGLSL()}
  ${rayBoxGLSL()}
  ${SDF_COMMON_UNIFORMS_GLSL}

  uniform float uPower;
  uniform int   uIterations;
  uniform float uBailout;
  uniform bool  uJuliaMode;
  uniform vec3  uJuliaC;

  // Hard upper bound satisfies WebGL constant-loop requirement.
  const int MAX_ITER = 30;

  // Power-n Mandelbulb / Julia distance estimator.
  // White / Nylander 2009 spherical-coordinate iteration.
  float mandelbulbDE(vec3 pos) {
    vec3 z = pos;
    float dr = 1.0;
    float r  = 0.0;
    vec3 c = uJuliaMode ? uJuliaC : pos;

    for (int i = 0; i < MAX_ITER; i++) {
      if (i >= uIterations) break;
      r = length(z);
      if (r > uBailout) break;

      float theta = acos(clamp(z.z / r, -1.0, 1.0));
      float phi   = atan(z.y, z.x);
      float rN    = pow(r, uPower);
      dr = pow(r, uPower - 1.0) * uPower * dr + 1.0;

      float sinT = sin(theta * uPower);
      z = rN * vec3(
        sinT * cos(phi * uPower),
        sinT * sin(phi * uPower),
        cos(theta * uPower)
      ) + c;
    }
    return 0.5 * log(max(r, 1e-6)) * r / max(dr, 1e-6);
  }

  float worldDE(vec3 worldP) {
    return mandelbulbDE(uObjectRotInv * worldP);
  }

  ${estimateNormalGLSL()}
  ${sdfMarchGLSL({ stepFactor: 0.5 })}
  ${SDF_MAIN_GLSL}
`;

const DEFAULT_PARAMS = Object.freeze({
  power: 8.0,
  iterations: 10,
  bailout: 2.0,
  juliaMode: false,
  juliaC: [0, 0, 0],
  maxSteps: 96,
  minDist: 5e-4,
  maxDist: 40.0
});

export function getMandelbulbDefaults() {
  return { ...DEFAULT_PARAMS, juliaC: [...DEFAULT_PARAMS.juliaC] };
}

export function createMandelbulbRenderer() {
  const material = new THREE.ShaderMaterial({
    vertexShader: SDF_VERT,
    fragmentShader: FRAG,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    uniforms: {
      // Shape-specific uniforms
      uPower:      { value: DEFAULT_PARAMS.power },
      uIterations: { value: DEFAULT_PARAMS.iterations },
      uBailout:    { value: DEFAULT_PARAMS.bailout },
      uJuliaMode:  { value: DEFAULT_PARAMS.juliaMode },
      uJuliaC:     { value: new THREE.Vector3(0, 0, 0) },
      // Base uniforms — bounding box derived from bailout radius
      ...sdfBaseUniforms(new THREE.Vector3(
        DEFAULT_PARAMS.bailout,
        DEFAULT_PARAMS.bailout,
        DEFAULT_PARAMS.bailout
      )),
    }
  });

  // Override base defaults with Mandelbulb-specific values
  material.uniforms.uMaxSteps.value = DEFAULT_PARAMS.maxSteps;
  material.uniforms.uMinDist.value  = DEFAULT_PARAMS.minDist;
  material.uniforms.uMaxDist.value  = DEFAULT_PARAMS.maxDist;

  const { mesh, syncCamera, setRotation, tick, dispose } = createSDFProxy(material);

  function setUniforms(params) {
    if (!params) return;
    const u = material.uniforms;
    if (params.power      != null) {
      u.uPower.value = params.power;
    }
    if (params.iterations != null) u.uIterations.value = Math.round(params.iterations);
    if (params.bailout    != null) {
      u.uBailout.value = params.bailout;
      // Keep bounding box in sync with bailout — fractal stays within this radius.
      u.uBoundingBox.value.setScalar(params.bailout);
    }
    if (params.juliaMode  != null) u.uJuliaMode.value = !!params.juliaMode;
    if (params.juliaC) {
      u.uJuliaC.value.set(params.juliaC[0], params.juliaC[1], params.juliaC[2]);
    }
    if (params.maxSteps   != null) u.uMaxSteps.value = Math.round(params.maxSteps);
    if (params.minDist    != null) u.uMinDist.value  = params.minDist;
    if (params.maxDist    != null) u.uMaxDist.value  = params.maxDist;
  }

  return { mesh, material, setUniforms, syncCamera, setRotation, tick, dispose };
}
