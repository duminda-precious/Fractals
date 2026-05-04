import * as THREE from 'three';
import {
  SDF_VERT, SDF_COMMON_UNIFORMS_GLSL, SDF_MAIN_GLSL,
  rayBoxGLSL, estimateNormalGLSL, sdfMarchGLSL,
  sdfBaseUniforms, createSDFProxy
} from './sdfUtils.js';

const FRAG = /* glsl */ `
  ${rayBoxGLSL()}
  ${SDF_COMMON_UNIFORMS_GLSL}

  uniform vec3  uBaseCube;
  uniform int   uIterations;
  uniform float uDetailScale;
  uniform float uTile;
  uniform float uDetailBias;

  // Hard upper bound satisfies WebGL constant-loop requirement.
  const int MAX_ITER = 24;

  // Iterative fold field — port of geo_fold_field3 from the Blender source.
  // Branchless sort eliminates GPU warp divergence in the hot loop.
  float geoFoldField(vec3 p, int iters, float tile) {
    float w = 1.0;
    vec3 q = p;
    for (int i = 0; i < MAX_ITER; i++) {
      if (i >= iters) break;
      q = abs(q);

      // Branchless descending sort: q.x >= q.y >= q.z.
      float _mx, _mn;
      _mx = max(q.x, q.y); _mn = min(q.x, q.y); q.x = _mx; q.y = _mn;
      _mx = max(q.y, q.z); _mn = min(q.y, q.z); q.y = _mx; q.z = _mn;
      _mx = max(q.x, q.y); _mn = min(q.x, q.y); q.x = _mx; q.y = _mn;

      q = fract(q * tile) - 0.5;

      float linf = max(max(abs(q.x), abs(q.y)), abs(q.z));
      float l1   = abs(q.x) + abs(q.y) + abs(q.z);
      float l    = 0.45 + 0.65 / (0.32 + linf + 0.25 * l1);

      q *= l;
      w *= l;
    }
    return max(max(abs(q.x), abs(q.y)), abs(q.z)) / max(w, 1e-3);
  }

  float crystalDE(vec3 pos) {
    float base  = max(abs(pos.x), max(abs(pos.y), abs(pos.z))) - uBaseCube.x;
    float field = geoFoldField(pos * uDetailScale, uIterations, uTile) + uDetailBias;
    return max(base, field);
  }

  float worldDE(vec3 worldP) {
    return crystalDE(uObjectRotInv * worldP);
  }

  ${estimateNormalGLSL()}
  ${sdfMarchGLSL({ stepFactor: 0.5 })}
  ${SDF_MAIN_GLSL}
`;

const DEFAULT_PARAMS = Object.freeze({
  cubeSize:    0.55,
  iterations:  11,
  detailScale: 1.0,
  tile:        1.2,
  detailBias:  -0.0001,
  maxSteps:    96,
  minDist:     Math.pow(10, -3.2),   // sharpness proxy = 0.4 (slider max)
  maxDist:     40.0
});

export function getCrystalDefaults() {
  return { ...DEFAULT_PARAMS };
}

export function createCrystalRenderer() {
  const material = new THREE.ShaderMaterial({
    vertexShader: SDF_VERT,
    fragmentShader: FRAG,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    uniforms: {
      // Shape-specific uniforms
      uBaseCube:    { value: new THREE.Vector3(
                        DEFAULT_PARAMS.cubeSize,
                        DEFAULT_PARAMS.cubeSize,
                        DEFAULT_PARAMS.cubeSize
                      ) },
      uIterations:  { value: DEFAULT_PARAMS.iterations },
      uDetailScale: { value: DEFAULT_PARAMS.detailScale },
      uTile:        { value: DEFAULT_PARAMS.tile },
      uDetailBias:  { value: DEFAULT_PARAMS.detailBias },
      // Base uniforms — bounding box matches the cube extents
      ...sdfBaseUniforms(new THREE.Vector3(
        DEFAULT_PARAMS.cubeSize,
        DEFAULT_PARAMS.cubeSize,
        DEFAULT_PARAMS.cubeSize
      )),
    }
  });

  // Override base defaults with Crystal-specific values
  material.uniforms.uMaxSteps.value = DEFAULT_PARAMS.maxSteps;
  material.uniforms.uMinDist.value  = DEFAULT_PARAMS.minDist;
  material.uniforms.uMaxDist.value  = DEFAULT_PARAMS.maxDist;

  const { mesh, syncCamera, setRotation, tick, dispose } = createSDFProxy(material);

  function setUniforms(params) {
    if (!params) return;
    const u = material.uniforms;
    if (params.cubeSize != null) {
      u.uBaseCube.value.setScalar(params.cubeSize);
      // Keep bounding box in sync with cube size.
      u.uBoundingBox.value.setScalar(params.cubeSize);
    }
    if (params.iterations  != null) u.uIterations.value  = Math.round(params.iterations);
    if (params.detailScale != null) u.uDetailScale.value = params.detailScale;
    if (params.tile        != null) u.uTile.value        = params.tile;
    if (params.detailBias  != null) u.uDetailBias.value  = params.detailBias;
    if (params.maxSteps    != null) u.uMaxSteps.value    = Math.round(params.maxSteps);
    if (params.minDist     != null) u.uMinDist.value     = params.minDist;
    if (params.maxDist     != null) u.uMaxDist.value     = params.maxDist;
  }

  return { mesh, material, setUniforms, syncCamera, setRotation, tick, dispose };
}
