# Parametric Primitives

Recipes for building geometry from parameters: buildings, mechanical parts, geometric art. The principle throughout: **express the design as a function of a small number of named knobs**, so the result feels procedural rather than hardcoded.

## Mental model

You almost never need a custom `BufferGeometry` from raw vertex arrays. Three.js ships with primitives that compose into surprisingly complex shapes:

- `BoxGeometry`, `CylinderGeometry`, `SphereGeometry`, `ConeGeometry`, `TorusGeometry`
- `PlaneGeometry`, `RingGeometry`, `CircleGeometry`
- `LatheGeometry` — revolve a 2D profile around the Y axis (vases, columns, bottles)
- `ExtrudeGeometry` — extrude a 2D `Shape` along a path or to a depth (logos, prisms, beveled solids)
- `TubeGeometry` — sweep a circle along a `Curve3` (pipes, wires, vines)
- `ShapeGeometry` — flat polygon from a 2D `Shape` (floors, footprints)

Reach for a manual `BufferGeometry` only when you need vertex-level control — terrain heightmaps, twisted prisms, custom mech parts where the topology matters.

## Buildings

The trick to a believable building is **vertical stacking with horizontal subdivision**: a base, repeated middle floors, a cap. Vary widths slightly between floors and the result looks designed rather than extruded.

```javascript
function makeBuilding(p, rand) {
  const g = new THREE.Group();
  const w = p.width, d = p.depth;

  // base
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(w * 1.05, 0.5, d * 1.05),
    p.matStone
  );
  base.position.y = 0.25;
  g.add(base);

  // floors
  const floorH = 0.9;
  for (let i = 0; i < p.floors; i++) {
    const taper = 1 - (i / p.floors) * p.taperAmount;
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(w * taper, floorH, d * taper),
      p.matBody
    );
    floor.position.y = 0.5 + i * floorH + floorH / 2;
    g.add(floor);

    // window strip — a thin emissive box on each side
    if (p.lit) {
      const winMat = new THREE.MeshStandardMaterial({
        color: 0x000000,
        emissive: rand() > 0.3 ? 0xffd27f : 0x111111,
        emissiveIntensity: 1.0,
      });
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(w * taper * 0.95, floorH * 0.5, d * taper * 0.95),
        winMat
      );
      strip.position.copy(floor.position);
      g.add(strip);
    }
  }

  // cap
  const capH = 0.4;
  const topY = 0.5 + p.floors * floorH;
  const cap = new THREE.Mesh(
    new THREE.BoxGeometry(w * (1 - p.taperAmount) * 0.7,
                         capH, d * (1 - p.taperAmount) * 0.7),
    p.matStone
  );
  cap.position.y = topY + capH / 2;
  g.add(cap);

  return g;
}
```

For a city, generate dozens of these on a grid with seeded jitter on each parameter. The variety per-building does most of the work — keep the *generator* simple and let the *parameter sampling* create the diversity.

## Gears & mechanical parts

A spur gear is a cylinder with teeth — easiest done as an `ExtrudeGeometry` from a `Shape`:

```javascript
function makeGear({ teeth = 16, radius = 1, toothDepth = 0.15, thickness = 0.3 }) {
  const shape = new THREE.Shape();
  const innerR = radius - toothDepth / 2;
  const outerR = radius + toothDepth / 2;
  const segPerTooth = 4;  // 4 points per tooth: down-out, out, in, down-in

  for (let i = 0; i < teeth * segPerTooth; i++) {
    const t = i / (teeth * segPerTooth);
    const a = t * Math.PI * 2;
    const phase = (i % segPerTooth) / segPerTooth;
    // square tooth profile: out for first half, in for second
    const r = phase < 0.5 ? outerR : innerR;
    const fn = i === 0 ? 'moveTo' : 'lineTo';
    shape[fn](Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();

  // center hole
  const hole = new THREE.Path();
  hole.absarc(0, 0, radius * 0.2, 0, Math.PI * 2, false);
  shape.holes.push(hole);

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelSize: 0.02,
    bevelThickness: 0.02,
    bevelSegments: 2,
  });
  geom.center();
  geom.rotateX(-Math.PI / 2);  // lay flat on XZ
  return geom;
}
```

Bevels matter a lot for mech parts. They catch light at edges and turn a flat-shaded rectangle into something that looks machined. Cost is a few extra triangles per edge — cheap.

## Geometric art / tilings

Use polar coordinates and modular arithmetic. Anything of the form "place N copies around a circle, each rotated by `i * 2π/N`, with parameters that depend on `i`" gives you instant kaleidoscopic structure:

```javascript
function makeRosette({ count = 12, innerR = 1, outerR = 3, depth = 0.4 }) {
  const g = new THREE.Group();
  const wedge = new THREE.Mesh(
    makeWedgeGeometry(innerR, outerR, (Math.PI * 2) / count, depth),
    new THREE.MeshStandardMaterial({ color: 0xddccaa, roughness: 0.6 })
  );
  for (let i = 0; i < count; i++) {
    const w = wedge.clone();
    w.rotation.y = (i / count) * Math.PI * 2;
    g.add(w);
  }
  return g;
}
```

For non-circular tilings (hex grids, Truchet tiles, Penrose), the pattern is the same: write a tile generator, lay tiles with a positioning rule. `InstancedMesh` once you have more than ~50 tiles (see `performance-patterns.md`).

## Lathed shapes (vases, columns, bottles)

A `LatheGeometry` takes 2D points in the XY plane and revolves them around Y. Generate the profile from a function:

```javascript
function makeColumn({ height = 4, segments = 24, profileFn }) {
  const points = [];
  const N = 32;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const y = t * height;
    const r = profileFn(t);  // 0..1 -> radius
    points.push(new THREE.Vector2(r, y));
  }
  return new THREE.LatheGeometry(points, segments);
}

// e.g. a fluted column: const profile = t => 0.5 + 0.05 * Math.sin(t * Math.PI);
// e.g. a vase: const profile = t => 0.4 + 0.3 * Math.sin(t * Math.PI);
```

The profile function is the procedural core — passing different functions in gives different objects from one generator.

## Hand-built BufferGeometry (when you really need it)

For terrain, twisted prisms, anything where vertices move based on world position:

```javascript
function makeTerrain({ size = 50, segments = 100, heightFn }) {
  const geom = new THREE.PlaneGeometry(size, size, segments, segments);
  const pos = geom.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    pos.setZ(i, heightFn(x, y));
  }
  geom.computeVertexNormals();   // CRITICAL — see common-pitfalls.md
  geom.rotateX(-Math.PI / 2);
  return geom;
}
```

The `computeVertexNormals()` call after moving vertices is non-negotiable. Skipping it is the single most common reason a custom geometry "looks flat" or "doesn't catch the light" — the normals still point at the unmodified surface.

## Material defaults

For procedural work, `MeshStandardMaterial` is almost always the right choice. Defaults that read well:

```javascript
new THREE.MeshStandardMaterial({
  color: 0xc8c8c8,
  roughness: 0.7,    // lower for shiny, higher for matte
  metalness: 0.0,    // 1.0 only for actual metal — half-values look wrong
  flatShading: false // true gives faceted look (good for low-poly aesthetic)
});
```

Reuse the same material across many meshes when you can — Three.js will batch them more aggressively, and disposal is simpler.

## Composition

Build complex objects by composing groups of simpler ones, not by writing one giant generator. A house is `walls + roof + door + windows`. A spaceship is `hull + wings + engines + greebles`. Each piece is its own small parametric function, and the top-level generator just calls them and positions the results. This keeps each function under ~30 lines and makes the params object meaningful.