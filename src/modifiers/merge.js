import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clayMaterial } from '../scene/materials.js';

function normalizeForMerge(geo) {
  const g = geo.clone();
  if (g.attributes.uv) g.deleteAttribute('uv');
  if (g.attributes.uv2) g.deleteAttribute('uv2');
  if (g.attributes.color) g.deleteAttribute('color');
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

function asGeometry(value) {
  if (!value) return null;
  if (value.isBufferGeometry) return value;
  if (value.isObject3D) {
    let found = null;
    value.traverse((c) => { if (!found && c.isMesh) found = c.geometry; });
    return found;
  }
  return null;
}

function wrapAsObject(value) {
  if (!value) return null;
  if (value.isObject3D) return value.clone(true);
  if (value.isBufferGeometry) return new THREE.Mesh(value.clone(), clayMaterial);
  return null;
}

export const mergeModifier = {
  label: 'Merge',
  isMerge: true,
  defaults: { mode: 'union' },
  schema: {
    mode: { type: 'enum', options: ['union', 'overlay'] }
  },
  run(a, b, { mode }) {
    if (mode === 'overlay') {
      const group = new THREE.Group();
      const childA = wrapAsObject(a);
      const childB = wrapAsObject(b);
      if (childA) group.add(childA);
      if (childB) group.add(childB);
      return group;
    }

    const geoA = asGeometry(a);
    const geoB = asGeometry(b);
    if (!geoA || !geoB) return geoA || geoB || null;
    const nA = normalizeForMerge(geoA);
    const nB = normalizeForMerge(geoB);
    const merged = mergeGeometries([nA, nB], false);
    nA.dispose();
    nB.dispose();
    if (merged) {
      merged.computeVertexNormals();
      merged.computeBoundingBox();
      merged.computeBoundingSphere();
    }
    return merged;
  }
};
