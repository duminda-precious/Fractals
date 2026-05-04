import * as THREE from 'three';
import { COLORS, CAMERA, PIXEL_RATIO, sdfLightingGLSL } from '../world.js';

const VERT = /* glsl */ `
  varying vec3 vWorldPos;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const FRAG = /* glsl */ `
  ${sdfLightingGLSL()}

  precision highp float;

  varying vec3 vWorldPos;

  uniform float uScale;
  uniform int   uIterations;
  uniform float uMinRadius;
  uniform float uFixedRadius;
  uniform bool  uJuliaMode;
  uniform vec3  uJuliaC;
  
  uniform int   uMaxSteps;
  uniform float uMinDist;
  uniform float uMaxDist;
  uniform vec3  uCameraPosWorld;
  uniform mat3  uObjectRotInv;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform vec3  uBgColor;
  uniform float uTime;

  const int MAX_ITER = 30;
  const int MAX_STEPS = 256;

  void boxFold(inout vec3 z) {
    z = clamp(z, -1.0, 1.0) * 2.0 - z;
  }

  void sphereFold(inout vec3 z, inout float dz) {
    float r2 = dot(z, z);
    float minR2 = uMinRadius * uMinRadius;
    float fixedR2 = uFixedRadius * uFixedRadius;
    
    if (r2 < minR2) {
      // Linear scaling
      float temp = fixedR2 / minR2;
      z *= temp;
      dz *= temp;
    } else if (r2 < fixedR2) {
      // Inversion
      float temp = fixedR2 / r2;
      z *= temp;
      dz *= temp;
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
      
      z = uScale * z + c;
      dr = dr * abs(uScale) + 1.0;
    }
    
    return length(z) / abs(dr);
  }

  float worldDE(vec3 worldP) {
    vec3 p = uObjectRotInv * worldP;
    // Intersect fractal with a bounding sphere so the object has a clean finite
    // boundary like the Mandelbulb's bailout sphere. Without this the Mandelbox
    // DE stays near-zero across all space and the fractal bleeds to infinity.
    // Radius = fixedRadius × 2 matches roughly the same apparent screen size as
    // the Mandelbulb at the same camera distance.
    float bound   = length(p) - uFixedRadius * 2.0;
    float fractal = mandelboxDE(p);
    return max(fractal, bound);
  }

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

  const float STEP_FACTOR = 0.5;

  vec4 march(vec3 ro, vec3 rd) {
    float t = 0.0;
    float minDist = uMinDist;
    for (int i = 0; i < MAX_STEPS; i++) {
      if (i >= uMaxSteps) break;
      vec3 p = ro + rd * t;
      float d = worldDE(p);
      if (d < minDist) {
        vec3 n = estimateNormal(p);

        float key  = max(dot(n, KEY_DIR),  0.0);
        float fill = max(dot(n, FILL_DIR), 0.0);
        float lighting = AMBIENT + KEY_INTENSITY * key + FILL_INTENSITY * fill;

        vec3 col = mix(uColorB, uColorA, clamp(lighting, 0.0, 1.0));
        return vec4(col, 1.0);
      }
      if (t > uMaxDist) break;
      t += d * STEP_FACTOR;
    }
    return vec4(uBgColor, 0.0);
  }

  void main() {
    vec3 ro = uCameraPosWorld;
    vec3 rd = normalize(vWorldPos - uCameraPosWorld);
    vec4 color = march(ro, rd);
    if (color.a < 0.5) discard;
    gl_FragColor = color;
  }
`;

const DEFAULT_PARAMS = Object.freeze({
  scale: -2.5,
  iterations: 15,
  minRadius: 0.5,
  fixedRadius: 1.0,
  juliaMode: false,
  juliaC: [0, 0, 0],
  maxSteps: 96,
  minDist: 5e-4,
  maxDist: 40.0
});

export function getMandelboxDefaults() {
  return { ...DEFAULT_PARAMS, juliaC: [...DEFAULT_PARAMS.juliaC] };
}

export function createMandelboxRenderer() {
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uScale:           { value: DEFAULT_PARAMS.scale },
      uIterations:      { value: DEFAULT_PARAMS.iterations },
      uMinRadius:       { value: DEFAULT_PARAMS.minRadius },
      uFixedRadius:     { value: DEFAULT_PARAMS.fixedRadius },
      uJuliaMode:       { value: DEFAULT_PARAMS.juliaMode },
      uJuliaC:          { value: new THREE.Vector3(0, 0, 0) },
      uMaxSteps:        { value: DEFAULT_PARAMS.maxSteps },
      uMinDist:         { value: DEFAULT_PARAMS.minDist },
      uMaxDist:         { value: DEFAULT_PARAMS.maxDist },
      uCameraPosWorld:  { value: new THREE.Vector3(...CAMERA.positionSDF) },
      uObjectRotInv:    { value: new THREE.Matrix3() },
      uColorA:          { value: new THREE.Color(COLORS.lit) },
      uColorB:          { value: new THREE.Color(COLORS.shadow) },
      uBgColor:         { value: new THREE.Color(COLORS.background) },
      uTime:            { value: 0 }
    }
  });

  const geometry = new THREE.BoxGeometry(500, 500, 500);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;

  function setUniforms(params) {
    if (!params) return;
    const u = material.uniforms;
    if (params.scale        != null) u.uScale.value        = params.scale;
    if (params.iterations   != null) u.uIterations.value   = Math.round(params.iterations);
    if (params.minRadius    != null) u.uMinRadius.value    = params.minRadius;
    if (params.fixedRadius  != null) u.uFixedRadius.value  = params.fixedRadius;
    if (params.juliaMode    != null) u.uJuliaMode.value    = !!params.juliaMode;
    if (params.juliaC) {
      u.uJuliaC.value.set(params.juliaC[0], params.juliaC[1], params.juliaC[2]);
    }
    if (params.maxSteps     != null) u.uMaxSteps.value     = Math.round(params.maxSteps);
    if (params.minDist      != null) u.uMinDist.value      = params.minDist;
    if (params.maxDist      != null) u.uMaxDist.value      = params.maxDist;
  }

  function syncCamera(camera) {
    material.uniforms.uCameraPosWorld.value.copy(camera.position);
  }

  function setRotation(matrix3Inverse) {
    material.uniforms.uObjectRotInv.value.copy(matrix3Inverse);
  }

  function tick(elapsedSeconds) {
    material.uniforms.uTime.value = elapsedSeconds;
  }

  function dispose() {
    geometry.dispose();
    material.dispose();
  }

  return { mesh, material, setUniforms, syncCamera, setRotation, tick, dispose };
}
