# Scene Scaffold

The boilerplate that every output starts from. r160, import maps, no build step.

## The full template

Drop this in and replace the `// GENERATOR` comment with whatever the task needs.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Procedural Scene</title>
  <style>
    body { margin: 0; overflow: hidden; background: #111; color: #eee;
           font-family: ui-sans-serif, system-ui, sans-serif; }
    canvas { display: block; }
    #info { position: fixed; top: 10px; left: 10px; opacity: 0.6;
            font-size: 12px; pointer-events: none; }
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
  <div id="info">drag to orbit · scroll to zoom</div>
  <script type="module">
    import * as THREE from 'three';
    import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

    // ---------- params ----------
    const params = {
      seed: 1,
    };

    // ---------- scene ----------
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    document.body.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111416);
    scene.fog = new THREE.Fog(0x111416, 50, 200);

    const camera = new THREE.PerspectiveCamera(
      45, window.innerWidth / window.innerHeight, 0.1, 500
    );
    camera.position.set(20, 15, 25);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 2, 0);

    // ---------- lights ----------
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(10, 20, 10);
    scene.add(sun);
    // soft sky fill
    scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x1a1a1a, 0.3));

    // optional ground — remove if it gets in the way
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: 0x1a1d20, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    // ---------- generator ----------
    // GENERATOR: replace this with the procedural function for the task
    function generate(p) {
      const group = new THREE.Group();
      const cube = new THREE.Mesh(
        new THREE.BoxGeometry(2, 2, 2),
        new THREE.MeshStandardMaterial({ color: 0x88aaff })
      );
      cube.position.y = 1;
      group.add(cube);
      return group;
    }

    let current = generate(params);
    scene.add(current);

    // ---------- loop ----------
    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    renderer.setAnimationLoop(() => {
      controls.update();
      renderer.render(scene, camera);
    });
  </script>
</body>
</html>
```

## Why these defaults

- **`antialias: true`** — the visual cost is small, the readability gain is large for procedural geometry where lots of edges matter.
- **`setPixelRatio(min(devicePixelRatio, 2))`** — caps DPR at 2 so 4K/Retina screens don't murder the GPU on heavy scenes.
- **`outputColorSpace = SRGBColorSpace`** — this is the modern correct setting for r155+. Without it, colors look washed out.
- **Fog** — even subtle fog adds depth perception cheaply. Tune the near/far to the scene scale or remove if it hides the subject.
- **`HemisphereLight`** for sky fill, `DirectionalLight` for the key, `AmbientLight` low — this is the workhorse three-light setup. It reads well on PBR materials without HDRI.
- **`renderer.setAnimationLoop`** instead of `requestAnimationFrame` — works correctly with WebXR if the user later wants VR, and is the canonical r150+ way.

## Seeded PRNG

`Math.random()` is not reproducible. Use this mulberry32 — it's tiny and good enough for visual work:

```javascript
function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// usage:
const rand = mulberry32(params.seed);
const x = rand() * 10 - 5;            // [-5, 5]
const i = Math.floor(rand() * arr.length);  // pick from array
```

When the user wants reproducibility, every `Math.random()` in the generator should be replaced with `rand()`. Same seed → same scene.

## Camera framing

The default `camera.position.set(20, 15, 25)` works for objects roughly 5-20 units across centered near origin. For other scales:

- **Tiny detail (sub-unit):** position around `(2, 1.5, 2.5)`, near plane `0.01`
- **City-scale:** position around `(80, 60, 100)`, far plane `1000`, push fog further
- **Compute the framing** for unknown extents:
  ```javascript
  const box = new THREE.Box3().setFromObject(current);
  const size = box.getSize(new THREE.Vector3()).length();
  const center = box.getCenter(new THREE.Vector3());
  camera.position.copy(center).add(new THREE.Vector3(size, size * 0.7, size));
  controls.target.copy(center);
  controls.update();
  ```

Always run this auto-framing when the geometry's extent depends on user parameters.

## Adding a GUI

```javascript
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

const gui = new GUI();
gui.add(params, 'iterations', 1, 8, 1).onChange(rebuild);
gui.add(params, 'seed', 0, 1000, 1).onChange(rebuild);
gui.addColor(params, 'color').onChange(rebuild);

function rebuild() {
  scene.remove(current);
  disposeObject(current);    // see common-pitfalls.md
  current = generate(params);
  scene.add(current);
}
```

The `disposeObject` helper is critical — without it you leak GPU memory on every slider tick. See `common-pitfalls.md`.