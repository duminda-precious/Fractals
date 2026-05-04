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

