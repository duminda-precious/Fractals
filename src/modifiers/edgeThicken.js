import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _v0 = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _altUp = new THREE.Vector3(1, 0, 0);
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _mat = new THREE.Matrix4();
const _pos = new THREE.Vector3();

// Convert a geometry's edges into tube struts (cylinders), optionally keeping faces.
export const edgeThickenModifier = {
  label: 'Edge Thicken',
  defaults: { strutRadius: 0.05, strutSegments: 5, keepFaces: false },
  schema: {
    strutRadius: { type: 'number', min: 0.01, max: 0.15, step: 0.005 },
    strutSegments: { type: 'int', min: 3, max: 6, step: 1 },
    keepFaces: { type: 'boolean' }
  },
  run(geo, { strutRadius, strutSegments, keepFaces }) {
    if (!geo?.isBufferGeometry) return geo;

    const edges = new THREE.EdgesGeometry(geo, 1);
    const epos = edges.attributes.position;
    const edgeCount = epos.count / 2;

    // Unit cylinder along Y axis from y=0 to y=1, radius 1. We scale + orient per edge.
    const unit = new THREE.CylinderGeometry(1, 1, 1, strutSegments, 1, false);
    // Translate so the cylinder spans [0,1] along Y instead of [-0.5, 0.5].
    unit.translate(0, 0.5, 0);

    const strutGeos = [];

    for (let i = 0; i < edgeCount; i++) {
      _v0.fromBufferAttribute(epos, i * 2);
      _v1.fromBufferAttribute(epos, i * 2 + 1);
      _dir.subVectors(_v1, _v0);
      const len = _dir.length();
      if (len < 1e-6) continue;
      _dir.divideScalar(len);

      // Orient unit Y axis to _dir.
      const refUp = Math.abs(_dir.y) > 0.99 ? _altUp : _up;
      _quat.setFromUnitVectors(refUp, _dir);
      // The default cylinder axis is +Y, but setFromUnitVectors(refUp,_dir) maps refUp→_dir.
      // We need to align +Y → _dir, so use _up directly as source.
      _quat.setFromUnitVectors(_up, _dir);

      _scale.set(strutRadius, len, strutRadius);
      _mat.compose(_v0, _quat, _scale);

      const strut = unit.clone();
      strut.applyMatrix4(_mat);
      strutGeos.push(strut);
    }

    edges.dispose();
    unit.dispose();

    // Strip non-position/normal attributes to avoid mergeGeometries mismatches.
    for (const g of strutGeos) {
      // Cylinder includes uv — drop it for clean merge.
      if (g.attributes.uv) g.deleteAttribute('uv');
    }

    let merged = strutGeos.length ? mergeGeometries(strutGeos, false) : new THREE.BufferGeometry();
    for (const g of strutGeos) g.dispose();

    if (keepFaces) {
      // Combine with the original faces. Strip uv to align attributes.
      const baseClone = geo.clone();
      if (baseClone.attributes.uv) baseClone.deleteAttribute('uv');
      const combined = mergeGeometries([merged, baseClone], false);
      merged.dispose();
      baseClone.dispose();
      merged = combined ?? merged;
    }

    if (merged) {
      merged.computeVertexNormals();
      merged.computeBoundingBox();
      merged.computeBoundingSphere();
    }
    // Original geo (clone passed in) is no longer needed.
    geo.dispose();
    return merged;
  }
};
