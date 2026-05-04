# Performance Patterns

Procedural scenes have one chronic problem: it's trivial to write a generator that produces 5,000 meshes and runs at 4 FPS. The fix is almost always one of three patterns. Pick the right one.

## The decision

| You have | Use |
|---|---|
| < ~50 unique meshes | Regular `Mesh` per object — don't bother optimizing |
| Many copies of **the same** geometry, different transforms | `InstancedMesh` |
| Many **different static** geometries sharing a material | `BufferGeometryUtils.mergeGeometries` |
| Many different geometries needing per-piece colors | `InstancedMesh` with instance colors, or merged geometry with vertex colors |

The key difference: `InstancedMesh` is for the *same* shape repeated; merging is for *different* shapes that don't need to move independently.

## Draw calls — what we're actually optimizing

Every separate `Mesh` is roughly one draw call to the GPU. Modern GPUs can handle a few thousand per frame, but you waste budget fast. A 50×50 grid of cubes (2500 meshes) will already chug on a laptop. The same scene as a single `InstancedMesh` runs at 144 FPS.

Both `InstancedMesh` and merging collapse N draw calls into 1.

## InstancedMesh

The right tool when you have one geometry and want to place lots of copies. Cities (one building shape, varied transforms), forests (one tree, varied transforms), grass, rocks scattered across terrain.

```javascript
const geom = new THREE.BoxGeometry(1, 1, 1);
const mat = new THREE.MeshStandardMaterial({ color: 0x88aaff });
const COUNT = 1000;
const mesh = new THREE.InstancedMesh(geom, mat, COUNT);

const dummy = new THREE.Object3D();
for (let i = 0; i < COUNT; i++) {
  dummy.position.set(
    (rand() - 0.5) * 100,
    rand() * 5,
    (rand() - 0.5) * 100
  );
  dummy.scale.setScalar(0.5 + rand() * 1.5);
  dummy.rotation.y = rand() * Math.PI * 2;
  dummy.updateMatrix();
  mesh.setMatrixAt(i, dummy.matrix);
}
mesh.instanceMatrix.needsUpdate = true;   // CRITICAL — without this you see nothing
scene.add(mesh);
```

### Per-instance colors

```javascript
const color = new THREE.Color();
for (let i = 0; i < COUNT; i++) {
  color.setHSL(rand(), 0.6, 0.5);
  mesh.setColorAt(i, color);
}
mesh.instanceColor.needsUpdate = true;
```

The material's base color multiplies with the instance color. Set the material color to white (`0xffffff`) if you want the instance colors to show literally.

### Updating instances at runtime

If transforms change every frame (rotating each instance), call `setMatrixAt` in the animation loop and set `instanceMatrix.needsUpdate = true` once per frame. Don't allocate new `Object3D` dummies inside the loop — reuse a single one declared outside.

### Frustum culling caveat

`InstancedMesh` is one object from the renderer's point of view, so it's culled as a whole. If your instances span a huge area, the bounding box ends up huge and culling does nothing useful. Either accept that, split into multiple `InstancedMesh` chunks by region, or call `mesh.computeBoundingSphere()` after setting all matrices.

## Merging geometries

For scenes where each piece is a different shape but they don't need to move independently — a fully procedural building (walls, roof, windows all baked in), an L-system tree (every branch a unique cylinder), Voronoi shards.

```javascript
import { BufferGeometryUtils } from 'three/addons/utils/BufferGeometryUtils.js';

const pieces = [];
for (const p of generateParts()) {
  const g = new THREE.BoxGeometry(p.w, p.h, p.d);
  g.translate(p.x, p.y, p.z);
  // optional: bake colors into vertex colors before merging
  pieces.push(g);
}

const merged = BufferGeometryUtils.mergeGeometries(pieces);
const mesh = new THREE.Mesh(merged, sharedMaterial);
scene.add(mesh);

// dispose the inputs — they're copied into the merged buffer
for (const g of pieces) g.dispose();
```

### Vertex colors for variation across merged pieces

```javascript
function colorize(geom, color) {
  const colors = new Float32Array(geom.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) {
    colors[i] = color.r;
    colors[i + 1] = color.g;
    colors[i + 2] = color.b;
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

// then on the material:
const mat = new THREE.MeshStandardMaterial({ vertexColors: true });
```

Now each piece keeps its own color even though they're all in one mesh.

### Important: matching attributes

`mergeGeometries` will silently fail (return `null`) if the input geometries don't all have the same attributes. If one has UVs and another doesn't, the merge breaks. Either give all pieces the same attributes, or pre-process to strip differences. A common gotcha: `BoxGeometry` includes UVs by default; a custom geometry from raw vertices typically doesn't.

The fix:
```javascript
// strip UVs from all pieces if you don't need them
pieces.forEach(g => g.deleteAttribute('uv'));
```

## When neither fits — LOD

If you genuinely have thousands of unique high-poly meshes that need to move independently (a swarm sim, a flock), use `THREE.LOD` to swap to lower-poly versions at distance:

```javascript
const lod = new THREE.LOD();
lod.addLevel(highPolyMesh, 0);
lod.addLevel(midPolyMesh, 20);
lod.addLevel(lowPolyMesh, 60);
scene.add(lod);
```

This is a per-object cost and won't fix a bad draw-call situation on its own — combine with instancing where possible.

## Quick perf checklist before shipping a scene

- Are there more than ~50 meshes that share a geometry? → `InstancedMesh`
- Are there many small static unique pieces? → merge them
- Are materials being created in a loop with the same parameters? → create once, reuse
- Is the render loop creating new `Vector3`/`Object3D` instances each frame? → hoist them outside
- For animated instanced meshes: are you setting `instanceMatrix.needsUpdate = true` once per frame, not once per instance?

## A practical rule

In the generator, count up the expected mesh count from the params. If `floors * buildingsPerSide^2` or `instances` or `iterations^branchFactor` exceeds ~50, reach for one of these patterns from the start. Don't write the naive version "to be cleaned up later" — the cleanup tends to require restructuring the generator anyway.