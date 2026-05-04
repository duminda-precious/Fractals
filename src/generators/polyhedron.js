import * as THREE from 'three';

const SHAPES = ['cube', 'dodecahedron', 'octahedron', 'icosahedron', 'tetrahedron'];

export const polyhedronGenerator = {
  label: 'Polyhedron',
  defaults: { shape: 'dodecahedron', size: 1.0, detail: 0 },
  schema: {
    shape: { type: 'enum', options: SHAPES },
    size: { type: 'number', min: 0.1, max: 5.0, step: 0.1 },
    detail: { type: 'int', min: 0, max: 3, step: 1 }
  },
  run({ shape, size, detail }) {
    let geo;
    switch (shape) {
      case 'cube':
        geo = new THREE.BoxGeometry(size * 2, size * 2, size * 2, detail + 1, detail + 1, detail + 1);
        break;
      case 'dodecahedron':
        geo = new THREE.DodecahedronGeometry(size, detail);
        break;
      case 'octahedron':
        geo = new THREE.OctahedronGeometry(size, detail);
        break;
      case 'icosahedron':
        geo = new THREE.IcosahedronGeometry(size, detail);
        break;
      case 'tetrahedron':
        geo = new THREE.TetrahedronGeometry(size, detail);
        break;
      default:
        geo = new THREE.DodecahedronGeometry(size, detail);
    }
    geo.computeVertexNormals();
    return geo;
  }
};
