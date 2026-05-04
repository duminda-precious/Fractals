import { getGenerator, getModifier } from './registry.js';
import { cloneSlotValue } from './slots.js';
import { deriveSeed } from '../utils/prng.js';

// Execute the pipeline. Returns { output, slots, warnings }.
export function execute(pipeline) {
  const slots = new Map();
  const warnings = [];

  // 1. Base generator
  try {
    const baseDef = getGenerator(pipeline.base.type);
    const baseSeed = deriveSeed(4242, 'base');
    const baseGeo = baseDef.run(pipeline.base.params, baseSeed);
    slots.set(pipeline.base.outputSlot, baseGeo);
  } catch (e) {
    warnings.push({ id: 'base', message: `Base generator failed: ${e.message}` });
  }

  // 2. Modifiers in order
  for (const mod of pipeline.modifiers) {
    if (!mod.enabled) continue;

    const def = (() => {
      try { return getModifier(mod.type); }
      catch (e) { warnings.push({ id: mod.id, message: e.message }); return null; }
    })();
    if (!def) continue;

    const seed = mod.params?.seed != null
      ? mod.params.seed
      : deriveSeed(4242, mod.id);

    try {
      let result;
      if (def.isMerge) {
        const a = slots.get(mod.inputSlots?.[0]);
        const b = slots.get(mod.inputSlots?.[1]);
        if (!a || !b) {
          warnings.push({ id: mod.id, message: `Merge inputs missing (${mod.inputSlots?.join(', ')})` });
          continue;
        }
        result = def.run(a, b, mod.params, seed);
      } else {
        const input = slots.get(mod.inputSlot);
        if (!input) {
          warnings.push({ id: mod.id, message: `Input slot '${mod.inputSlot}' not found` });
          continue;
        }
        const cloned = cloneSlotValue(input);
        result = def.run(cloned, mod.params, seed);
      }
      if (result) slots.set(mod.outputSlot, result);
    } catch (e) {
      warnings.push({ id: mod.id, message: `${mod.type} failed: ${e.message}` });
      console.error(e);
    }
  }

  const output = slots.get(pipeline.outputSlot) ?? null;
  if (!output) {
    warnings.push({ id: 'output', message: `Output slot '${pipeline.outputSlot}' is empty` });
  }
  return { output, slots, warnings };
}
