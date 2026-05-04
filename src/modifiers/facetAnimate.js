// Lerps between the rest positions stored by faceExplode and the exploded
// positions, giving a scrub-able morph with configurable easing.

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function cubicEaseInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export const facetAnimateModifier = {
  label: 'Facet Animate',
  defaults: { time: 0.0, easing: 'smoothstep' },
  schema: {
    time:   { type: 'number', min: 0, max: 1, step: 0.01 },
    easing: { type: 'enum',   options: ['none', 'smoothstep', 'cubic'] }
  },
  run(geo, { time, easing }) {
    if (!geo?.isBufferGeometry) return geo;

    const restPositions = geo.userData?.restPositions;
    if (!restPositions) return geo; // faceExplode must precede this modifier

    const explodedPositions = geo.attributes.position.array;
    const len = restPositions.length;

    let t = Math.max(0, Math.min(1, time));
    if (easing === 'smoothstep') t = smoothstep(t);
    else if (easing === 'cubic')  t = cubicEaseInOut(t);

    // Write lerped positions directly into the live buffer.
    for (let i = 0; i < len; i++) {
      explodedPositions[i] = restPositions[i] + (explodedPositions[i] - restPositions[i]) * t;
    }

    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    return geo;
  }
};
