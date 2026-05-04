// Type registries for base generators and modifiers.
// Each entry: { run: (...) => geometry|group, defaults: {...}, label: string, schema: {paramName: {type, min?, max?, step?, options?}} }

export const generatorRegistry = new Map();
export const modifierRegistry = new Map();

export function registerGenerator(type, def) {
  generatorRegistry.set(type, def);
}

export function registerModifier(type, def) {
  modifierRegistry.set(type, def);
}

export function getGenerator(type) {
  const g = generatorRegistry.get(type);
  if (!g) throw new Error(`Unknown generator type: ${type}`);
  return g;
}

export function getModifier(type) {
  const m = modifierRegistry.get(type);
  if (!m) throw new Error(`Unknown modifier type: ${type}`);
  return m;
}

export function listModifiers() {
  return [...modifierRegistry.entries()].map(([type, def]) => ({ type, label: def.label }));
}
