# Common Pitfalls

The bugs that keep appearing in procedural Three.js code. Skim this before declaring a scene done — most of these fail silently or produce visuals that look "almost right" without obvious errors.

## 1. Custom geometry looks flat / unlit

**Cause:** moved vertices without recomputing normals. The normals still describe the surface before you deformed it, so lighting is wrong.

**Fix:** call `geom.computeVertexNormals()` after any vertex manipulation. For terrain, after setting Z values. For twisted prisms, after the twist. Always.

If the result has hard creases where you wanted smooth shading, you may also need to call `geom.deduplicateAttributes()` or merge vertices with `BufferGeometryUtils.mergeVertices(geom)` — duplicate vertices at the same position can't share a normal, so smoothing breaks at seams.

## 2. Faces are invisible from one side

**Cause:** wrong winding order on hand-built faces. Three.js culls back-faces by default, and "back" means clockwise winding when viewed.

**Fixes, in order of preference:**
1. Fix the winding — index your triangles counter-clockwise from the side you want visible.
2. If you genuinely need both sides (paper-thin shapes, leaves), use `material.side = THREE.DoubleSide`. There's a small perf cost but it solves the problem.
3. As a debugging aid only, `THREE.BackSide` flips visibility — useful to confirm winding is the issue.

## 3. The scene is black / nothing visible

Run through this in order:

1. **Camera inside the geometry.** The camera spawned at the origin and your shape is at the origin. Move the camera back: `camera.position.set(5, 5, 5); camera.lookAt(0, 0, 0)`.
2. **No lights.** `MeshStandardMaterial` and `MeshPhongMaterial` need lights. If you want lighting-free debug, swap to `MeshBasicMaterial` temporarily — it ignores lights.
3. **Material color is black.** `new THREE.MeshStandardMaterial()` defaults to white, but if you passed `color: 0x000000` somewhere it'll absorb everything.
4. **Renderer not appended.** `document.body.appendChild(renderer.domElement)` is easy to forget when restructuring.
5. **Animation loop never started.** `renderer.setAnimationLoop(animate)` or an explicit RAF call.
6. **Geometry has no triangles.** A `BufferGeometry` with empty position attribute renders nothing. Log `geom.attributes.position.count` to verify.
7. **NaN in positions.** Anywhere math could divide by zero, or `Math.acos` of a value just outside `[-1, 1]` due to float error, you get NaN positions and the mesh disappears. Clamp inputs to `Math.acos`/`Math.asin`.

## 4. Memory leak when regenerating

**Cause:** GUI sliders that rebuild the scene without disposing the old objects. Three.js geometries and materials hold GPU buffers that aren't freed by JS garbage collection.

**Fix:** dispose explicitly when removing.

```javascript
function disposeObject(obj) {
  obj.traverse(child => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach(m => {
        // dispose textures the material holds
        for (const key in m) {
          const value = m[key];
          if (value && typeof value === 'object' && 'minFilter' in value) {
            value.dispose();
          }
        }
        m.dispose();
      });
    }
  });
}
```

Use this every time you swap the generated object:
```javascript
scene.remove(current);
disposeObject(current);
current = generate(params);
scene.add(current);
```

You can verify by watching `renderer.info.memory.geometries` — it should plateau across many regenerations, not grow unbounded.

## 5. Colors look washed out / wrong

**Cause:** missing color management for r155+. Three.js switched to linear-sRGB workflow as the default, and old code that set hex colors directly looks correct only when the renderer's output is configured.

**Fix:** these two lines in setup:
```javascript
renderer.outputColorSpace = THREE.SRGBColorSpace;   // already in scaffold
// for any image textures you load:
texture.colorSpace = THREE.SRGBColorSpace;
```

For procedural materials with hex colors, the scaffold defaults are already correct — this is mostly a problem when textures get involved.

## 6. Import map errors in the console

**Symptoms:** `Failed to resolve module specifier "three"` or 404s on addon paths.

**Common causes:**
- Opening the HTML file via `file://` in a browser that doesn't support importmaps in that context — modern Chrome/Firefox/Safari do, but some older versions need `http://`. If it fails, run a local server: `python -m http.server` in the file's directory, then visit `http://localhost:8000/`.
- Mixed-up addon path. The mapping is `three/addons/` (with the trailing slash). The full import becomes `import { OrbitControls } from 'three/addons/controls/OrbitControls.js'`. Do not write `three/addons` (no slash) or `three-addons`.
- Wrong version pinned. Stick to `0.160.0` (or whatever the scaffold specifies); some addon paths shifted between releases.

## 7. Y-up vs Z-up confusion

Three.js is **Y-up**. If you're porting math from Blender or graphics papers that use Z-up, you'll get rotations and "ground" planes inverted.

When in doubt: `up` in Three.js is `(0, 1, 0)`. The ground plane is XZ. To make a `PlaneGeometry` (which lies on XY) into a floor, rotate it: `plane.rotation.x = -Math.PI / 2`.

## 8. CylinderGeometry orientation

`CylinderGeometry` is centered at the origin and oriented along the **Y axis**. When using cylinders as line segments (e.g., L-system branches between two arbitrary points), you must:

1. Create the cylinder with the correct length
2. Translate so its base is at the origin (not its center): `geom.translate(0, length / 2, 0)`
3. Rotate it from `(0, 1, 0)` to your target direction with a quaternion (see `l-systems-fractals.md` for the snippet)
4. Translate to the start point

Skipping step 2 puts the cylinder's midpoint at the start point — you'll see branches disconnected from their parents, half embedded in the previous segment.

## 9. Shadows are off / gray

If the user asks for shadows:

```javascript
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

directionalLight.castShadow = true;
directionalLight.shadow.mapSize.set(2048, 2048);
// CRITICAL: tune the shadow camera frustum to the scene
const d = 30;
directionalLight.shadow.camera.left = -d;
directionalLight.shadow.camera.right = d;
directionalLight.shadow.camera.top = d;
directionalLight.shadow.camera.bottom = -d;
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 100;

mesh.castShadow = true;
mesh.receiveShadow = true;
```

Default shadow frustum is small — a 100-unit tree will cast no shadow because it's outside the shadow camera. Tune the bounds to the scene.

## 10. lil-gui breaks for non-flat params

`lil-gui` walks an object's properties. If you nest `params.lighting.intensity`, you have to add controllers per leaf:

```javascript
gui.add(params.lighting, 'intensity', 0, 5);
```

For colors, use `addColor` not `add`:
```javascript
gui.addColor(params, 'color').onChange(rebuild);
```

And the value must be in a form lil-gui understands — a hex number (`0xff00aa`) or a CSS string (`'#ff00aa'`), not a `THREE.Color` instance.

## 11. The scene runs at 4 FPS

99% chance it's draw calls. Open the console and check `renderer.info.render.calls` after one frame. If it's >1000, see `performance-patterns.md` — you need instancing or geometry merging.

The other 1%: shadow maps too large, antialias on a 4K screen with no DPR cap, or recursion blew up an L-system to a million segments. The DPR cap is in the scaffold; the L-system limit is on you to enforce by capping iterations.

## 12. `BufferGeometryUtils.mergeGeometries` returns null

**Cause:** geometry attribute mismatch (some have UVs, some don't; some are indexed, some aren't).

**Fix:** normalize first.
```javascript
pieces.forEach(g => {
  if (!g.attributes.normal) g.computeVertexNormals();
  if (g.attributes.uv) g.deleteAttribute('uv');  // or add UVs to the others
});
```

Also: all pieces must be `BufferGeometry`. The legacy `Geometry` class is gone in r125+, but if any piece comes from old code, convert first.

## Quick sanity checklist before you call a scene done

- Camera framed on the subject (run the auto-framing snippet from `scene-scaffold.md` if extents are dynamic)
- Lights present, scene not black on load
- No console errors
- Window resize works (resize the browser, confirm aspect updates)
- If a GUI exists, sliders rebuild without leaking memory
- For random scenes, the seed is wired and reproducible