// Slot helpers — slots are a Map<string, BufferGeometry|Group>.
import * as THREE from 'three';

export function cloneSlotValue(value) {
  if (!value) return null;
  if (value.isBufferGeometry) return value.clone();
  if (value.isGroup || value.isObject3D) return value.clone(true);
  return null;
}

// Walk a pipeline and return all slot names referenced (input + output).
export function collectSlotNames(pipeline) {
  const names = new Set();
  if (pipeline.base?.outputSlot) names.add(pipeline.base.outputSlot);
  for (const m of pipeline.modifiers) {
    if (m.outputSlot) names.add(m.outputSlot);
    if (m.inputSlot) names.add(m.inputSlot);
    if (m.inputSlots) m.inputSlots.forEach(s => names.add(s));
  }
  if (pipeline.outputSlot) names.add(pipeline.outputSlot);
  return [...names];
}

// Count triangles across a BufferGeometry or a Group (sums children).
export function countTriangles(value) {
  if (!value) return 0;
  if (value.isBufferGeometry) {
    const idx = value.index;
    if (idx) return idx.count / 3;
    const pos = value.attributes.position;
    return pos ? pos.count / 3 : 0;
  }
  if (value.isObject3D) {
    let count = 0;
    value.traverse((c) => {
      if (c.isMesh && c.geometry) count += countTriangles(c.geometry);
    });
    return count;
  }
  return 0;
}
