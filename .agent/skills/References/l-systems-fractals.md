# L-Systems and Fractals

Recursive, rule-based geometry: trees, plants, snowflakes, space-filling curves. The unifying idea is **a small grammar plus an interpreter**, applied to itself N times.

## Mental model

An L-system is a string-rewriting system:
- An **axiom** — the starting string
- A set of **rules** — `F → F+F-F` means "every `F` becomes `F+F-F` next iteration"
- An **interpreter** — code that walks the final string and turns each character into geometry

So you iterate the rewrite N times to get a long string, then interpret it once. The branching factor blows up exponentially, so iteration counts above ~6-7 get expensive — be honest with the user about this.

## The turtle interpreter

Three.js doesn't have a built-in turtle, but it's tiny. Use a stack of transforms:

```javascript
function turtleInterpret(string, rules) {
  // rules: { length, angle, lengthScale, ... }
  const positions = [];
  const radii = [];
  const stack = [];

  let pos = new THREE.Vector3(0, 0, 0);
  let dir = new THREE.Vector3(0, 1, 0);   // pointing up
  let len = rules.length;
  let radius = rules.radius ?? 0.1;

  for (const ch of string) {
    switch (ch) {
      case 'F': {
        const next = pos.clone().addScaledVector(dir, len);
        positions.push([pos.clone(), next.clone()]);
        radii.push(radius);
        pos = next;
        break;
      }
      case '+': dir.applyAxisAngle(AXIS_Z,  rules.angle); break;
      case '-': dir.applyAxisAngle(AXIS_Z, -rules.angle); break;
      case '&': dir.applyAxisAngle(AXIS_X,  rules.angle); break;
      case '^': dir.applyAxisAngle(AXIS_X, -rules.angle); break;
      case '/': dir.applyAxisAngle(AXIS_Y,  rules.angle); break;
      case '\\': dir.applyAxisAngle(AXIS_Y, -rules.angle); break;
      case '[': stack.push({ pos: pos.clone(), dir: dir.clone(), len, radius }); break;
      case ']': {
        const s = stack.pop();
        pos = s.pos; dir = s.dir; len = s.len; radius = s.radius;
        break;
      }
      case '!': radius *= rules.radiusScale ?? 0.7; break;  // shrink branch
    }
    // optional: shrink length per F
    if (ch === 'F') len *= rules.lengthScale ?? 1.0;
  }
  return { segments: positions, radii };
}

const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);
```

The stack characters `[` and `]` are what makes branching work — `[` saves the turtle state (push), `]` restores it (pop). Without them you only get a single non-branching path.

## The rewriter

```javascript
function rewrite(axiom, rules, iterations) {
  let s = axiom;
  for (let i = 0; i < iterations; i++) {
    let next = '';
    for (const ch of s) next += rules[ch] ?? ch;
    s = next;
  }
  return s;
}
```

For stochastic L-systems, swap the rules object for a function that returns a random expansion per character.

## Building geometry from segments

Turtle output gives you line segments. For trees, render each as a tapered cylinder (use the `radii` array). For curves and snowflakes, use `LineSegments` or `TubeGeometry`:

```javascript
function buildBranchMesh(segments, radii) {
  const geometries = [];
  for (let i = 0; i < segments.length; i++) {
    const [a, b] = segments[i];
    const r = radii[i];
    const len = a.distanceTo(b);
    const cyl = new THREE.CylinderGeometry(r * 0.7, r, len, 6, 1);
    // CylinderGeometry is centered at origin along Y — translate so base is at origin
    cyl.translate(0, len / 2, 0);
    // orient from a to b
    const dir = b.clone().sub(a).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0), dir
    );
    cyl.applyQuaternion(q);
    cyl.translate(a.x, a.y, a.z);
    geometries.push(cyl);
  }
  // merge for one draw call — see performance-patterns.md
  return BufferGeometryUtils.mergeGeometries(geometries);
}
```

For trees with hundreds of branches, `mergeGeometries` is essentially required — see `performance-patterns.md`.

## Classic grammars to start from

These all use turtle conventions where `F` draws a line, `+/-` rotate around Z, `[]` push/pop. Adjust `angle` and `iterations` to taste.

### Plant 1 (Aristid Lindenmayer's original "weed")
```
axiom: F
F → F[+F]F[-F]F
angle: 25.7°, iterations: 5
```

### Plant 2 (with two branches)
```
axiom: F
F → F[+F]F[-F][F]
angle: 20°, iterations: 5
```

### 3D tree (rotates in two planes)
```
axiom: F
F → FF-[-F+F+F]+[+F-F-F]
angle: 22.5°, iterations: 4
// Inject /  (yaw) at branch points for true 3D: F → FF-[/-F+F+F]+[\+F-F-F]
```

### Koch snowflake (1D fractal in 2D)
```
axiom: F++F++F
F → F-F++F-F
angle: 60°, iterations: 4-5
// Render with LineSegments, no branching needed
```

### Sierpinski arrowhead
```
axiom: A
A → B-A-B
B → A+B+A
(treat A and B both as draw-forward)
angle: 60°, iterations: 5-7
```

### Dragon curve
```
axiom: FX
X → X+YF+
Y → -FX-Y
angle: 90°, iterations: 10-12
// Pure path, no branching
```

For a tree, default to Plant 2 or 3D tree with iterations 4-5. Above 6 the geometry explodes — be aware that string length is roughly `branchFactor^iterations`.

## Stochastic variation (for natural-looking trees)

Real trees aren't perfectly self-similar. Add randomness in three places:

1. **Rule selection** — multiple expansions per symbol, picked by weight
   ```javascript
   const stochastic = {
     F: () => rand() < 0.5
       ? 'F[+F]F[-F]F'
       : 'F[+F][-F]F'
   };
   ```
2. **Angle jitter** — perturb each rotation by a small random amount in the interpreter
3. **Length jitter** — multiply each `F`'s length by `(0.9 + 0.2 * rand())`

A little of each goes a long way. Apply seeded randomness (see `scene-scaffold.md`) so the user can lock a result they like.

## Non-L-system fractals

For fractals that don't naturally fit L-systems, recurse directly. The pattern is **subdivide and recurse with a budget**:

### Menger sponge
```javascript
function menger(size, depth, group, x = 0, y = 0, z = 0) {
  if (depth === 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), MAT);
    m.position.set(x, y, z);
    group.add(m);
    return;
  }
  const s = size / 3;
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      for (let k = -1; k <= 1; k++) {
        // skip the 7 "hole" positions
        const skip = (Math.abs(i) + Math.abs(j) + Math.abs(k)) <= 1;
        if (skip) continue;
        menger(s, depth - 1, group, x + i * s, y + j * s, z + k * s);
      }
    }
  }
}
```

At depth 3 you get 20³ = 8000 cubes — use `InstancedMesh` if you go beyond depth 2. See `performance-patterns.md`.

### Sierpinski tetrahedron
Same pattern, but with 4 children per node placed at tetrahedron vertices. Depth 5-6 looks great.

## A working tree example

Concrete pattern that produces a clean parametric tree, designed to drop into the scaffold:

```javascript
const params = {
  iterations: 4,
  angle: 22.5,        // degrees
  baseLength: 1.5,
  lengthScale: 0.75,
  baseRadius: 0.15,
  radiusScale: 0.7,
  seed: 1,
};

function generateTree(p, rand) {
  const rules = { F: 'FF-[-F+F+F]+[+F-F-F]' };
  const string = rewrite('F', rules, p.iterations);
  const turtleRules = {
    length: p.baseLength,
    lengthScale: p.lengthScale,
    radius: p.baseRadius,
    radiusScale: p.radiusScale,
    angle: THREE.MathUtils.degToRad(p.angle),
  };
  const { segments, radii } = turtleInterpret(string, turtleRules);
  const merged = buildBranchMesh(segments, radii);
  return new THREE.Mesh(
    merged,
    new THREE.MeshStandardMaterial({ color: 0x7a4a2a, roughness: 0.9 })
  );
}
```

Default the iteration count to 4 — high enough to look like a tree, low enough that it builds in milliseconds. Mention the cost curve to the user if they ask for more.