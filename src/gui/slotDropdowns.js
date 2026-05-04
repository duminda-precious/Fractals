import { collectSlotNames } from '../pipeline/slots.js';

// Build a flat list of valid slot names for a dropdown, including a "+ new..." entry.
export function buildSlotOptions(pipeline) {
  const names = collectSlotNames(pipeline);
  // Always include common defaults so dropdowns aren't empty.
  for (const def of ['raw', 'noisy', 'lattice', 'final', 'A', 'B', 'C']) {
    if (!names.includes(def)) names.push(def);
  }
  return names.sort();
}

// Generate the next free slot letter (A, B, C, ..., AA, AB, ...) avoiding existing names.
export function nextSlotName(pipeline) {
  const used = new Set(collectSlotNames(pipeline));
  for (let i = 0; i < 26 * 27; i++) {
    let s;
    if (i < 26) s = String.fromCharCode(65 + i);
    else s = String.fromCharCode(65 + Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26));
    if (!used.has(s)) return s;
  }
  return 'X';
}

// Validate slot wiring — return list of warnings { id, message }.
// A modifier that reads a slot which no prior step writes is flagged.
export function validateSlots(pipeline) {
  const warnings = [];
  const written = new Set();
  if (pipeline.base?.outputSlot) written.add(pipeline.base.outputSlot);

  for (const m of pipeline.modifiers) {
    if (!m.enabled) {
      if (m.outputSlot) written.add(m.outputSlot);
      continue;
    }
    const reads = m.inputSlots ?? (m.inputSlot ? [m.inputSlot] : []);
    for (const slot of reads) {
      if (!written.has(slot)) {
        warnings.push({ id: m.id, message: `reads slot '${slot}' before any prior step writes it` });
      }
    }
    if (m.outputSlot) written.add(m.outputSlot);
  }
  if (!written.has(pipeline.outputSlot)) {
    warnings.push({ id: 'output', message: `output slot '${pipeline.outputSlot}' is never written` });
  }
  return warnings;
}
