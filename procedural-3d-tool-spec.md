# Procedural 3D Visualization Tool — Implementation Spec v2

## META
- **Document purpose**: Complete implementation specification. Human-readable, AI-implementation-optimized.
- **Status**: Planning complete. No code written. This document is the single source of truth.
- **Target audience**: An AI coding agent that will implement this from scratch.
- **Last updated**: 2026-04-30

---

## 1. PRODUCT DEFINITION

### 1.1 What This Is
A browser-based tool for generating procedural 3D objects through a configurable modifier pipeline. The user manipulates parameters via GUI panels to create organic, lattice, fractal, and geometric forms — similar to 3D-printed mathematical art sculptures.

### 1.2 Use Case
Personal experimentation and art. Not engineering, not simulation, not CAD.

### 1.3 Visual Quality Philosophy
- Prioritize visual appeal over mathematical accuracy
- Pseudo-geometry and simplified approximations are acceptable
- Objects should look like a singluaror a merged combination: white 3D-printed sculptures: organic blobs, lattice polyhedra, recursive cubic structures, perforated spheres
- Clay/matte white material is the default look

### 1.4 What This Is NOT
- Not a node-graph visual editor (no canvas, no wires, no draggable nodes)
- Not an exporter (no STL/OBJ output)
- Not a physics simulation
- Not mobile-optimized (laptop is the target device)

---

## 2. TECH STACK

### 2.1 Build Toolchain
```
Tool:     Vite
Runtime:  Browser (ES modules)
Language: Vanilla JavaScript (no TypeScript, no JSX)
Command:  npm create vite@latest → vanilla template
Dev:      npm run dev (hot reload)
Build:    npm run build (bundled output in dist/)
```

### 2.2 Dependencies (npm packages)
```json
{
  "dependencies": {
    "three": "^0.160.0",
    "simplex-noise": "^4.0.0",
    "lil-gui": "^0.19.0"
  }
}
```

### 2.3 Three.js Addons (imported from three/addons/)
- `OrbitControls` — camera interaction
- `BufferGeometryUtils` — geometry merging for Merge modifier and Edge Thicken
- `MarchingCubes` — metaball base generator (Stage 2)

### 2.4 Project Structure
```
procedural-3d-tool/
├── index.html
├── package.json
├── vite.config.js
├── public/
│   └── (empty — no static assets needed)
├── src/
│   ├── main.js                  ← entry point: scene, renderer, camera, lights, animation loop
│   ├── pipeline/
│   │   ├── engine.js            ← slot-based execution engine
│   │   ├── slots.js             ← slot registry (named geometry buffers)
│   │   └── registry.js          ← modifier/generator type registry
│   ├── generators/
│   │   ├── geodesic.js          ← IcosahedronGeometry-based sphere
│   │   ├── polyhedron.js        ← Platonic solids (cube, dodecahedron, octahedron, icosahedron)
│   │   └── metaballs.js         ← MarchingCubes blob generator (Stage 2)
│   ├── modifiers/
│   │   ├── noiseDisplace.js     ← Simplex noise vertex displacement
│   │   ├── edgeThicken.js       ← Convert wireframe edges to tube geometry
│   │   ├── subdivide.js         ← Loop subdivision smoothing
│   │   ├── spikify.js           ← Push vertices outward along normals (Stage 2)
│   │   ├── smooth.js            ← Laplacian relaxation (Stage 2)
│   │   ├── twist.js             ← Twist deformer around an axis (Stage 2)
│   │   ├── fractalRecurse.js    ← Replace faces with smaller copies (Stage 3)
│   │   └── merge.js             ← Combine two slot geometries (Union or Overlay)
│   ├── gui/
│   │   ├── panels.js            ← lil-gui panel creation and wiring
│   │   ├── slotDropdowns.js     ← input/output slot dropdown logic
│   │   └── triangleCounter.js   ← live triangle count display with color zones
│   ├── utils/
│   │   ├── prng.js              ← mulberry32 seeded PRNG + sub-seed hashing
│   │   ├── dispose.js           ← recursive GPU resource disposal
│   │   └── debounce.js          ← debounced regeneration wrapper
│   └── scene/
│       ├── setup.js             ← renderer, scene, camera, lights, controls, resize handler
│       └── materials.js         ← shared material definitions (clay, wireframe, iridescent)
```

---

## 3. CORE ARCHITECTURE: SLOT-BASED PIPELINE

### 3.1 Concept
The pipeline uses **named geometry slots** as intermediate storage. This enables the expressive power of a node-graph (branching, parallel paths, merging) while keeping the UI as simple stacked panels.

### 3.2 Slot Definition
A slot is a named key in a JavaScript Map that holds a `THREE.BufferGeometry` or `THREE.Group`.

```javascript
// Runtime state during execution
const slots = new Map();
// Example state after execution:
// slots = { 'raw': BufferGeometry, 'noisy': BufferGeometry, 'lattice': Group, 'final': Group }
```

### 3.3 Pipeline Data Model
The full pipeline state is a serializable plain object:

```javascript
const pipeline = {
  masterSeed: 4242,
  outputSlot: 'final',           // which slot becomes the rendered object

  base: {
    type: 'geodesic',            // generator type key
    outputSlot: 'raw',           // writes to this slot
    params: {
      subdivisions: 2,
      radius: 1.0
    }
  },

  modifiers: [
    {
      id: 'mod-1',
      type: 'noiseDisplace',
      enabled: true,
      inputSlot: 'raw',          // reads from this slot
      outputSlot: 'noisy',       // writes to this slot
      params: {
        amplitude: 0.3,
        frequency: 2.0,
        octaves: 3,
        seed: null                // null = derive from masterSeed
      }
    },
    {
      id: 'mod-2',
      type: 'edgeThicken',
      enabled: true,
      inputSlot: 'raw',          // ALSO reads 'raw' — parallel branch
      outputSlot: 'lattice',
      params: {
        strutRadius: 0.05,
        strutSegments: 5
      }
    },
    {
      id: 'mod-3',
      type: 'merge',
      enabled: true,
      inputSlots: ['noisy', 'lattice'],  // merge reads TWO slots
      outputSlot: 'final',
      params: {
        mode: 'union'            // 'union' | 'overlay'
      }
    }
  ]
};
```

### 3.4 Execution Algorithm
```
FUNCTION execute(pipeline):
  slots = new Map()

  1. Run base generator → store result in slots[base.outputSlot]
  2. FOR each modifier in pipeline.modifiers (in declared order):
       IF modifier.enabled is false → SKIP
       IF modifier.type is 'merge':
         inputA = slots[modifier.inputSlots[0]]
         inputB = slots[modifier.inputSlots[1]]
         IF either input is undefined → WARN on panel, SKIP
         result = applyMerge(inputA, inputB, modifier.params)
       ELSE:
         input = slots[modifier.inputSlot]
         IF input is undefined → WARN on panel, SKIP
         result = applyModifier(modifier.type, CLONE(input), modifier.params, derivedSeed)
       slots[modifier.outputSlot] = result
  3. RETURN slots[pipeline.outputSlot]
```

**Critical detail**: Non-merge modifiers must CLONE the input geometry before mutating it. This allows multiple modifiers to read from the same slot without corruption. Use `geometry.clone()` for BufferGeometry, `group.clone(true)` for Groups.

### 3.5 Seed Derivation
```
FUNCTION deriveSeed(masterSeed, modifierId):
  IF modifier has explicit seed (not null) → use it
  ELSE → hash(masterSeed, modifierId) using simple string hash
```

This ensures: changing masterSeed changes everything coherently; locking a modifier's seed isolates it from master changes.

---

## 4. BASE GENERATORS

Each generator is a function: `(params, seed) → THREE.BufferGeometry`

### 4.1 Geodesic Sphere (Stage 1)
- Uses `THREE.IcosahedronGeometry(radius, detail)`
- `detail` parameter = subdivision level (0–3)
- Produces smooth sphere approximation suitable for displacement

**Params**: `{ radius: float[0.1–5.0], subdivisions: int[0–3] }`

### 4.2 Polyhedron (Stage 1)
- Uses Three.js built-in geometries:
  - `THREE.BoxGeometry` (cube)
  - `THREE.DodecahedronGeometry`
  - `THREE.OctahedronGeometry`
  - `THREE.IcosahedronGeometry`
  - `THREE.TetrahedronGeometry`
- User selects type from dropdown

**Params**: `{ shape: enum[cube|dodecahedron|octahedron|icosahedron|tetrahedron], size: float[0.1–5.0], detail: int[0–3] }`

### 4.3 Metaballs (Stage 2)
- Uses Three.js `MarchingCubes` addon
- User controls number of blobs, their spread, and merge threshold
- Seeded PRNG positions the blob centers

**Params**: `{ ballCount: int[2–12], spread: float[0.5–3.0], threshold: float[0.3–1.0], resolution: int[16–48] }`

---

## 5. MODIFIERS

Each modifier is a function: `(inputGeometry, params, seed) → THREE.BufferGeometry | THREE.Group`

### 5.1 Noise Displace (Stage 1)
- Iterate over all vertices in the BufferGeometry
- For each vertex: compute 3D simplex noise at (vertex.x * frequency, vertex.y * frequency, vertex.z * frequency)
- Displace vertex along its normal by noise * amplitude
- Call `geometry.computeVertexNormals()` after all displacements
- Uses `simplex-noise` package with seeded initialization

**Params**: `{ amplitude: float[0.0–1.5], frequency: float[0.5–8.0], octaves: int[1–4], seed: int|null }`

### 5.2 Edge Thicken (Stage 1)
- Extract edge list from input geometry using `THREE.EdgesGeometry`
- For each edge: create a `THREE.CylinderGeometry` or `THREE.TubeGeometry` along the edge direction
- Merge all tubes using `BufferGeometryUtils.mergeGeometries()`
- Result replaces the surface mesh with a wireframe-lattice structure
- Optionally keep or discard the original surface faces

**Params**: `{ strutRadius: float[0.01–0.15], strutSegments: int[3–6], keepFaces: bool }`

### 5.3 Subdivide (Stage 1)
- Apply Loop subdivision to the geometry
- Use Three.js `LoopSubdivision` addon or manual implementation
- Cap at 3 levels maximum

**Params**: `{ levels: int[1–3] }`

### 5.4 Merge (Stage 1)
- Special modifier with TWO input slots
- Two modes:
  - **Union**: `BufferGeometryUtils.mergeGeometries([geoA, geoB])` — fuses into one mesh
  - **Overlay**: Return a `THREE.Group` containing both as separate children — visually combined but geometrically independent

**Params**: `{ mode: enum[union|overlay] }`

### 5.5 Spikify (Stage 2)
- For each vertex: push outward along its normal by a controlled amount
- `selectivity` parameter controls what percentage of vertices are affected (seeded random selection)
- High selectivity + high spike height = spiky coral look

**Params**: `{ height: float[0.0–2.0], selectivity: float[0.0–1.0], sharpness: float[0.1–1.0], seed: int|null }`

### 5.6 Smooth / Relax (Stage 2)
- Laplacian smoothing: each vertex moves toward the average of its neighbors
- Multiple iterations = smoother result
- Useful after aggressive noise or spikify to soften harsh edges

**Params**: `{ iterations: int[1–10], factor: float[0.1–1.0] }`

### 5.7 Twist (Stage 2)
- Rotate vertices around a chosen axis proportional to their distance along that axis
- Simple: `vertex.applyAxisAngle(axis, vertex[axisComponent] * twistAmount)`
- Recompute normals after

**Params**: `{ axis: enum[x|y|z], amount: float[-3.0–3.0] }`

### 5.8 Fractal Recurse (Stage 3)
- For each face of the input geometry: place a scaled-down copy of the entire geometry at the face center, oriented along the face normal
- Recursion depth is HARD CAPPED at 3
- At depth > 2, use simplified (lower-detail) copies to control triangle count
- Merge all instances using `BufferGeometryUtils.mergeGeometries()` or `InstancedMesh` if copies are identical

**Params**: `{ depth: int[1–3], scaleFactor: float[0.2–0.6], seed: int|null }`

---

## 6. PERFORMANCE CONSTRAINTS

### 6.1 Hard Limits (enforced in UI — sliders cannot exceed these)
| Parameter | Maximum | Rationale |
|---|---|---|
| Subdivision levels | 3 | Each level ≈4× triangle count |
| Fractal depth | 3 | Exponential growth |
| Metaball grid resolution | 48 per axis | 48³ = 110K voxels |
| Noise octaves | 4 | Diminishing visual returns |
| Strut segments | 6 | Already visually round |

### 6.2 Triangle Budget Zones
- **Green**: < 80,000 triangles — smooth performance on laptop
- **Yellow**: 80,000–150,000 — may stutter during regeneration but renders OK
- **Red**: > 150,000 — warning displayed, user not blocked

### 6.3 Regeneration Strategy
- All parameter changes trigger regeneration through a **200ms debounce**
- On regeneration: dispose ALL old geometries/materials via recursive `dispose()`, then rebuild from pipeline
- Monitor `renderer.info.memory.geometries` to verify no leaks

### 6.4 Geometry Optimization Rules
- When Edge Thicken produces > 50 tubes → merge via `BufferGeometryUtils.mergeGeometries()`
- When Fractal Recurse produces identical copies → use `InstancedMesh`
- Strip UV attributes before merging (avoid attribute mismatch errors)
- Always call `computeVertexNormals()` after any vertex manipulation

---

## 7. DETERMINISM / SEEDING

### 7.1 PRNG Implementation
Use mulberry32 — a 32-bit seeded PRNG:
```
FUNCTION mulberry32(seed):
  state = seed as unsigned 32-bit integer
  RETURN function():
    state = (state + 0x6D2B79F5) | 0
    t = state
    t = imul(t XOR (t >>> 15), t OR 1)
    t = t XOR (t + imul(t XOR (t >>> 7), t OR 61))
    RETURN ((t XOR (t >>> 14)) >>> 0) / 4294967296
```

### 7.2 Seed Hierarchy
```
masterSeed (user-controlled, integer)
  └─→ each modifier gets: hash(masterSeed + modifierId) as its PRNG seed
      UNLESS the modifier has an explicit seed override (non-null)
```

### 7.3 Guarantee
Same pipeline configuration (all params, all slot assignments, master seed) MUST produce byte-identical geometry every time. No use of `Math.random()` anywhere in generators or modifiers.

---

## 8. GUI SPECIFICATION

### 8.1 Library
`lil-gui` — lightweight, Three.js-ecosystem-native.

### 8.2 Panel Layout
```
┌──────────────────────────────────────┐
│  MASTER CONTROLS                     │
│  Master Seed: [slider] 4242          │
│  Output Slot: [dropdown] 'final'     │
│  Triangles: ████░░ 42,380  🟢        │
│  [Regenerate]                        │
├──────────────────────────────────────┤
│  BASE: Geodesic Sphere         [▼]  │
│  Output Slot: [dropdown] 'raw'       │
│  Subdivisions: [slider 0–3] 2       │
│  Radius: [slider 0.1–5.0] 1.0       │
├──────────────────────────────────────┤
│  MOD 1: Noise Displace  [✓] [×]     │
│  Input:  [dropdown] 'raw'            │
│  Output: [dropdown] 'noisy'          │
│  Amplitude: [slider] 0.3            │
│  Frequency: [slider] 2.0            │
│  Octaves: [slider 1–4] 3            │
├──────────────────────────────────────┤
│  MOD 2: Edge Thicken    [✓] [×]     │
│  Input:  [dropdown] 'raw'            │
│  Output: [dropdown] 'lattice'        │
│  Strut Radius: [slider] 0.05        │
│  Keep Faces: [checkbox] false        │
├──────────────────────────────────────┤
│  MOD 3: Merge           [✓] [×]     │
│  Input A: [dropdown] 'noisy'         │
│  Input B: [dropdown] 'lattice'       │
│  Output:  [dropdown] 'final'         │
│  Mode: [dropdown] union              │
├──────────────────────────────────────┤
│  [+ Add Modifier]                    │
└──────────────────────────────────────┘
```

### 8.3 Slot Dropdown Behavior
- Dropdowns auto-populate with all slot names currently in use
- User can type a new slot name (creates it on the fly)
- Warning icon shown if a modifier reads from a slot that no prior step writes to
- Output slot dropdown in master controls determines which slot is rendered

### 8.4 Add Modifier Flow
- Click [+ Add Modifier]
- Dropdown appears with available types: Noise Displace, Edge Thicken, Subdivide, Merge, (Stage 2: Spikify, Smooth, Twist), (Stage 3: Fractal)
- New panel appended at bottom with default params
- Input slot defaults to the previous modifier's output slot
- Output slot auto-named as next available letter (A, B, C…)

---

## 9. SCENE SETUP

### 9.1 Renderer
- `THREE.WebGLRenderer({ antialias: true })`
- Pixel ratio capped at 2: `setPixelRatio(Math.min(devicePixelRatio, 2))`
- `outputColorSpace = THREE.SRGBColorSpace`

### 9.2 Camera
- `THREE.PerspectiveCamera(45, aspect, 0.1, 500)`
- Auto-frame on generated object after each regeneration using bounding box calculation
- `OrbitControls` with damping enabled

### 9.3 Lighting (clay/studio look)
- `AmbientLight(0xffffff, 0.4)` — base fill
- `DirectionalLight(0xffffff, 1.2)` at position (10, 20, 10) — key light
- `HemisphereLight(0xbfd4ff, 0x1a1a1a, 0.3)` — sky/ground fill
- Dark background: `scene.background = new THREE.Color(0x111416)`

### 9.4 Default Material
```javascript
new THREE.MeshStandardMaterial({
  color: 0xe8e0d8,          // warm off-white
  roughness: 0.75,          // matte
  metalness: 0.0,           // non-metallic
  flatShading: false         // smooth normals
})
```

Material is shared across all geometry in the scene. Created once, reused.

---

## 10. BUILD STAGES

### Stage 1 — Core Tool (implement first)
**Files to create**: all files in project structure except metaballs.js, spikify.js, smooth.js, twist.js, fractalRecurse.js
**Deliverable**: A working tool where user can generate geodesic/polyhedron bases, apply noise displacement, edge thickening, and subdivision, merge parallel branches, and control everything via seeded parameters.

Contents:
- Vite project scaffold with package.json and all dependencies
- Scene setup (renderer, camera, lights, controls, resize, animation loop)
- Slot-based pipeline execution engine
- Base generators: Geodesic, Polyhedron
- Modifiers: Noise Displace, Edge Thicken, Subdivide, Merge
- PRNG (mulberry32 + sub-seed derivation)
- GUI panels with slot dropdowns, triangle counter, debounce
- Disposal system for GPU memory
- Auto-camera-framing after regeneration

### Stage 2 — Organic Layer
**New files**: metaballs.js, spikify.js, smooth.js, twist.js
**Adds**: Metaball base generator, Spikify/Smooth/Twist modifiers, new entries in modifier registry

### Stage 3 — Polish
**New files**: fractalRecurse.js, additions to materials.js
**Adds**: Fractal recursion modifier (depth ≤ 3), material switcher (clay/wireframe/iridescent), screenshot capture button

---

## 11. EXPLICIT OUT OF SCOPE
- Voronoi perforation (no reliable browser library)
- Boolean operations / CSG
- Visual node-graph UI (canvas, wires, draggable nodes)
- STL/OBJ/GLTF export
- Physics or simulation
- Mobile optimization
- TypeScript
- React or any UI framework beyond lil-gui
