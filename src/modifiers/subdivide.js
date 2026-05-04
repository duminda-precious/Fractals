import * as THREE from 'three';

// Simple midpoint triangle subdivision. Each triangle becomes 4.
// Not true Loop subdivision (no smoothing weights), but visually smooths
// when followed by computeVertexNormals(). Capped at 3 levels by schema.
function subdivideOnce(geo) {
  let pos = geo.attributes.position;
  let index = geo.index;

  // Convert to non-indexed for simpler triangle iteration, then build new arrays.
  let triCount;
  let getTriIdx;
  if (index) {
    triCount = index.count / 3;
    getTriIdx = (t) => [index.getX(t * 3), index.getX(t * 3 + 1), index.getX(t * 3 + 2)];
  } else {
    triCount = pos.count / 3;
    getTriIdx = (t) => [t * 3, t * 3 + 1, t * 3 + 2];
  }

  const newPos = [];
  const cache = new Map();
  const getOrAddVertex = (i) => {
    const key = `o${i}`;
    if (cache.has(key)) return cache.get(key);
    const idx = newPos.length / 3;
    newPos.push(pos.getX(i), pos.getY(i), pos.getZ(i));
    cache.set(key, idx);
    return idx;
  };
  const getMid = (a, b) => {
    const k = a < b ? `m${a}_${b}` : `m${b}_${a}`;
    if (cache.has(k)) return cache.get(k);
    const ax = pos.getX(a), ay = pos.getY(a), az = pos.getZ(a);
    const bx = pos.getX(b), by = pos.getY(b), bz = pos.getZ(b);
    const idx = newPos.length / 3;
    newPos.push((ax + bx) * 0.5, (ay + by) * 0.5, (az + bz) * 0.5);
    cache.set(k, idx);
    return idx;
  };

  const newIdx = [];
  for (let t = 0; t < triCount; t++) {
    const [iA, iB, iC] = getTriIdx(t);
    const a = getOrAddVertex(iA);
    const b = getOrAddVertex(iB);
    const c = getOrAddVertex(iC);
    const ab = getMid(iA, iB);
    const bc = getMid(iB, iC);
    const ca = getMid(iC, iA);
    newIdx.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(newPos, 3));
  out.setIndex(newIdx);
  out.computeVertexNormals();
  return out;
}

export const subdivideModifier = {
  label: 'Subdivide',
  defaults: { levels: 1 },
  schema: {
    levels: { type: 'int', min: 1, max: 3, step: 1 }
  },
  run(geo, { levels }) {
    if (!geo?.isBufferGeometry) return geo;
    let current = geo;
    for (let i = 0; i < levels; i++) {
      const next = subdivideOnce(current);
      current.dispose();
      current = next;
    }
    current.computeBoundingBox();
    current.computeBoundingSphere();
    return current;
  }
};
