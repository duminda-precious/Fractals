import * as THREE from 'three';
import { createNoise3D } from 'simplex-noise';
import { mulberry32 } from '../utils/prng.js';

// Sample fractal Brownian motion (octaves of simplex noise).
function fbm(noise3D, x, y, z, octaves) {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise3D(x * freq, y * freq, z * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2.0;
  }
  return sum / Math.max(norm, 1e-6);
}

export const noiseDisplaceModifier = {
  label: 'Noise Displace',
  defaults: { amplitude: 0.3, frequency: 2.0, octaves: 3, perFace: true, seed: null },
  schema: {
    amplitude: { type: 'number', min: 0.0, max: 1.5, step: 0.01 },
    frequency: { type: 'number', min: 0.5, max: 8.0, step: 0.05 },
    octaves: { type: 'int', min: 1, max: 4, step: 1 },
    perFace: { type: 'boolean' }
  },
  run(geo, { amplitude, frequency, octaves, perFace }, seed) {
    if (!geo?.isBufferGeometry) return geo;

    // perFace mode: sample noise once per triangle centroid so all 3 vertices
    // of a face get the same displacement magnitude — eliminates face twisting.
    const working = (perFace && geo.index) ? geo.toNonIndexed() : geo;

    if (!working.attributes.normal) working.computeVertexNormals();

    const rand = mulberry32(seed);
    const noise3D = createNoise3D(rand);

    const pos = working.attributes.position;
    const nrm = working.attributes.normal;
    const count = pos.count;

    if (perFace) {
      for (let i = 0; i < count; i += 3) {
        const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
        const cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
        const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
        const d = fbm(noise3D, cx * frequency, cy * frequency, cz * frequency, octaves) * amplitude;
        for (let j = 0; j < 3; j++) {
          const k = i + j;
          pos.setXYZ(k,
            pos.getX(k) + nrm.getX(k) * d,
            pos.getY(k) + nrm.getY(k) * d,
            pos.getZ(k) + nrm.getZ(k) * d
          );
        }
      }
    } else {
      for (let i = 0; i < count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const d = fbm(noise3D, x * frequency, y * frequency, z * frequency, octaves) * amplitude;
        pos.setXYZ(i, x + nrm.getX(i) * d, y + nrm.getY(i) * d, z + nrm.getZ(i) * d);
      }
    }

    pos.needsUpdate = true;
    working.computeVertexNormals();
    working.computeBoundingBox();
    working.computeBoundingSphere();
    return working;
  }
};
