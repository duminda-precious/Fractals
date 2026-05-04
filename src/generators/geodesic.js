import * as THREE from 'three';

export const geodesicGenerator = {
  label: 'Geodesic Sphere',
  defaults: { radius: 1.0, subdivisions: 2 },
  schema: {
    radius: { type: 'number', min: 0.1, max: 5.0, step: 0.1 },
    subdivisions: { type: 'int', min: 0, max: 3, step: 1 }
  },
  run({ radius, subdivisions }) {
    const geo = new THREE.IcosahedronGeometry(radius, subdivisions);
    geo.computeVertexNormals();
    return geo;
  }
};
