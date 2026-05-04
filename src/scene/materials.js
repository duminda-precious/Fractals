import * as THREE from 'three';
import { COLORS } from '../world.js';

export const clayMaterial = new THREE.MeshStandardMaterial({
  color: COLORS.lit,
  roughness: 0.75,
  metalness: 0.0,
  flatShading: false
});

export const wireframeMaterial = new THREE.MeshBasicMaterial({
  color: COLORS.wireframe,
  wireframe: true,
  transparent: true,
  opacity: 0.25,
  depthWrite: false
});

