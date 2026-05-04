import * as THREE from 'three';
import { createNoise3D } from 'simplex-noise';
import { mulberry32 } from '../utils/prng.js';

function fbm(noise3D, x, y, z, octaves) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise3D(x * freq, y * freq, z * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2.0;
  }
  return sum / Math.max(norm, 1e-6);
}

export const faceExplodeModifier = {
  label: 'Face Explode',
  defaults: { explodeAmount: 0.5, frequency: 2.0, threshold: 0.0, faceGap: 0.1, octaves: 2, seed: null },
  schema: {
    explodeAmount: { type: 'number', min: 0, max: 3.0, step: 0.01 },
    frequency:     { type: 'number', min: 0.5, max: 8.0, step: 0.05 },
    threshold:     { type: 'number', min: 0, max: 1, step: 0.01 },
    faceGap:       { type: 'number', min: 0, max: 0.5, step: 0.005 },
    octaves:       { type: 'int',    min: 1, max: 4,   step: 1 }
  },
  run(geo, { explodeAmount, frequency, threshold, faceGap, octaves }, seed) {
    if (!geo?.isBufferGeometry) return geo;

    const geoNI = geo.index ? geo.toNonIndexed() : geo;

    const pos = geoNI.attributes.position;
    const count = pos.count;

    // Snapshot original (rest) positions before any modification.
    const restPositions = new Float32Array(pos.array);
    geoNI.userData.restPositions = restPositions;

    const rand = mulberry32(seed);
    const noise3D = createNoise3D(rand);

    const vA = new THREE.Vector3();
    const vB = new THREE.Vector3();
    const vC = new THREE.Vector3();
    const centroid = new THREE.Vector3();
    const edge1 = new THREE.Vector3();
    const edge2 = new THREE.Vector3();
    const faceNormal = new THREE.Vector3();

    for (let i = 0; i < count; i += 3) {
      // Use snapshotted rest positions to keep reads unaffected by prior writes.
      vA.set(restPositions[i * 3],       restPositions[i * 3 + 1],       restPositions[i * 3 + 2]);
      vB.set(restPositions[(i+1) * 3],   restPositions[(i+1) * 3 + 1],   restPositions[(i+1) * 3 + 2]);
      vC.set(restPositions[(i+2) * 3],   restPositions[(i+2) * 3 + 1],   restPositions[(i+2) * 3 + 2]);

      centroid.addVectors(vA, vB).add(vC).divideScalar(3);

      edge1.subVectors(vB, vA);
      edge2.subVectors(vC, vA);
      faceNormal.crossVectors(edge1, edge2).normalize();

      // One noise sample per face (centroid position) — all 3 verts move identically.
      const n = fbm(noise3D, centroid.x * frequency, centroid.y * frequency, centroid.z * frequency, octaves);
      const t = (n + 1) * 0.5; // remap [-1,1] → [0,1]

      if (t < threshold) continue;

      const explodeDist = t * explodeAmount;

      for (let j = 0; j < 3; j++) {
        const idx = i + j;
        let x = restPositions[idx * 3];
        let y = restPositions[idx * 3 + 1];
        let z = restPositions[idx * 3 + 2];

        // Shrink vertex toward face centroid to open gaps between faces.
        if (faceGap > 0) {
          x = centroid.x + (x - centroid.x) * (1 - faceGap);
          y = centroid.y + (y - centroid.y) * (1 - faceGap);
          z = centroid.z + (z - centroid.z) * (1 - faceGap);
        }

        pos.setXYZ(idx,
          x + faceNormal.x * explodeDist,
          y + faceNormal.y * explodeDist,
          z + faceNormal.z * explodeDist
        );
      }
    }

    pos.needsUpdate = true;
    geoNI.computeVertexNormals();
    geoNI.computeBoundingBox();
    geoNI.computeBoundingSphere();
    return geoNI;
  }
};
