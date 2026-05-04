// Recursive disposal of GPU resources for an Object3D / Group / Mesh.
// Materials are NOT disposed by default because the app reuses a shared material.
export function disposeObject(obj, { disposeMaterials = false } = {}) {
  if (!obj) return;
  obj.traverse?.((child) => {
    if (child.geometry) child.geometry.dispose();
    if (disposeMaterials && child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of mats) m.dispose?.();
    }
  });
  if (obj.parent) obj.parent.remove(obj);
}

