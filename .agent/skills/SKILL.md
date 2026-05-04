---
name: threejs-procedural
description: Generate complete, runnable Three.js scenes with procedural and generative 3D geometry — geometric art, parametric forms, recursive structures, fractals, rule-based generation, and other code-driven 3D visuals. Use this skill whenever the user asks for a Three.js scene, a WebGL 3D demo, a procedural mesh, generative geometry, a "3D scene that does X", L-systems, fractals, parametric models, or any browser-based 3D visualization — even when they don't say "Three.js" by name (e.g. "make me a generative 3D scene", "procedural fractal in the browser", "interactive 3D geometry widget"). Do NOT use for 2D canvas, SVG, p5.js sketches, generic websites, or non-procedural 3D model loading (just loading a GLTF doesn't need this skill).
---

# Three.js Procedural

This skill produces single-file HTML scenes built on Three.js r160, using import maps so they run without a build step. Every output is one `.html` file the user can open directly in a browser or serve from any static server.

The skill leans on **procedural generation** — the geometry comes from code, not from loaded assets. Two main families are covered:

- **Parametric forms** — geometric art, parametric surfaces, any composition of `BoxGeometry`, `CylinderGeometry`, lathed/extruded shapes, or hand-built `BufferGeometry` driven by parameters
- **L-systems and fractals** — recursive, rule-based generative structures: space-filling curves, self-similar forms, recursive subdivision

The defaults are **clean and minimal**: enough lighting and camera controls to see the result clearly, no post-processing pipeline or kitchen-sink demos. Build the foundation well; let the user extend it.

## Decision flow

When a request comes in, work through this in order. The whole point is to think first, then write the file in one pass — not to scaffold and patch.

1. **Is it actually a Three.js task?** If the user wants 2D canvas drawings, SVG, or just to load a `.gltf` file with no procedural component, this skill is the wrong tool. Bow out.

2. **What's the procedural core?** Pick one (sometimes two): parametric forms, L-system/fractal recursion, or a mix. This determines which reference file you read next.
   - Parametric / geometric art → read `references/parametric-primitives.md`
   - L-system / recursive / fractal → read `references/l-systems-fractals.md`
   - Both (e.g. "a generative cityscape with recursive forms") → read both

3. **Estimate the instance count.** How many meshes will exist?
   - **< ~50 distinct meshes**: standard `Mesh` per object is fine
   - **~50 to 1000+ repeated shapes**: use `InstancedMesh`
   - **Lots of static unique pieces sharing one material**: merge with `BufferGeometryUtils.mergeGeometries`
   
   Read `references/performance-patterns.md` whenever the answer is the second or third bullet, or whenever the user says "city", "forest", "swarm", "field of", "grid of", or any other word that implies many things.

4. **Pick the scaffold.** `references/scene-scaffold.md` has the import-map HTML template, render loop, lights, and camera controls. This is the same skeleton for every output — read it once per task and reuse.

5. **Sketch the parameters.** Before writing code, name the knobs the user is likely to want to twiddle: `iterations`, `scale`, `branchAngle`, `subdivisions`, `seed`, etc. Put them in a `params` object near the top of the script so they're easy to find and adjust.

6. **Write the whole file.** One HTML file, importmap, scaffold, generator, render loop. Then sanity-check against `references/common-pitfalls.md` (normals, disposal, units, NaN traps).

## Output format

Always produce a single self-contained `.html` file. The structure is:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>[descriptive name]</title>
  <style>
    body { margin: 0; overflow: hidden; background: #111; }
    canvas { display: block; }
  </style>
  <script type="importmap">
    {
      "imports": {
        "three": "https://unpkg.com/three@0.160.0/build/three.module.js",
        "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/"
      }
    }
  </script>
</head>
<body>
  <script type="module">
    // imports, scene, generator, animate
  </script>
</body>
</html>
```

The version pin (`0.160.0`) is deliberate: r160 is broadly tested, well-documented, and stable. Don't drift to "latest" unless the user explicitly asks for newer features (WebGPU, etc.).

## Code style inside the script

Organize the module script in this order — it makes the file easy to read top-to-bottom:

```javascript
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
// other addons as needed

// 1. Parameters — the knobs
const params = {
  seed: 42,
  iterations: 5,
  // ...
};

// 2. Scene setup — renderer, scene, camera, lights, controls
const renderer = new THREE.WebGLRenderer({ antialias: true });
// ...

// 3. Generator — the procedural function(s) that build geometry
function generate(params) {
  // returns a THREE.Object3D or adds to scene
}

// 4. Build & add to scene
const generated = generate(params);
scene.add(generated);

// 5. Resize handler + animation loop
window.addEventListener('resize', onResize);
renderer.setAnimationLoop(animate);
```

Keep the generator function pure where reasonable: takes `params`, returns geometry/objects. Makes it trivial to regenerate with different parameters later.

## Determinism

For anything random (placement, branching angles, color variation), use a **seeded** PRNG, not `Math.random()`. A tiny mulberry32 is in `references/scene-scaffold.md`. Without a seed, the user can't reproduce a layout they liked, and that's a real frustration.

## When the user says "interactive"

If they want sliders, expose `params` via `lil-gui` (it's an addon — `three/addons/libs/lil-gui.module.min.js`). Wire each slider's `onChange` to dispose the old object and call `generate(params)` again. The disposal pattern is in `references/common-pitfalls.md` — getting it wrong leaks GPU memory fast.

## What the skill won't do for you

- Loading external 3D models (use `GLTFLoader` directly; this skill is about procedural generation)
- Physics simulation (out of scope — recommend cannon-es or rapier separately)
- Production-grade post-processing pipelines (the scaffold stays minimal on purpose)
- WebGPU-specific code paths (r160 is WebGL2; mention to the user if they need WebGPU)

## Reference files

Read these as needed — don't read all of them upfront.

- `references/scene-scaffold.md` — the boilerplate HTML + module script template, with notes on lighting, camera, controls, and a seeded PRNG
- `references/parametric-primitives.md` — recipes for geometric art, parametric surfaces, lathed/extruded forms, tilings, hand-built BufferGeometry
- `references/l-systems-fractals.md` — turtle graphics, classic L-system grammars, recursive generative structures, space-filling curves
- `references/performance-patterns.md` — when to use `InstancedMesh`, `BufferGeometryUtils.mergeGeometries`, and what to watch for (matrix updates, frustum culling, shared materials)
- `references/common-pitfalls.md` — y-up vs z-up, normals after vertex manipulation, disposal, NaN positions, importmap gotchas, gamma/color management