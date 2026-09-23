import test from 'node:test';
import assert from 'node:assert/strict';
import { createWand, updateWand, createRhythmTap, updateRhythmTap, disposeModel } from '../src/models.js';

test('the wand shows fourteen independent beads in seven distinct colors', () => {
  const wand = createWand();
  assert.equal(wand.userData.beads.length, 14);
  const colors = new Set(wand.userData.beads.map(bead => bead.mesh.material.color.getHex()));
  assert.equal(colors.size, 7);
  assert.ok(wand.userData.beads.every(bead => bead.mesh.parent === wand));
  disposeModel(wand);
});

test('beads stay inside the transparent chamber even after violent cursor movement', () => {
  const wand = createWand();
  const starts = wand.userData.beads.map(bead => bead.mesh.position.clone());
  for (let frame = 0; frame < 600; frame++) {
    updateWand(wand, {
      time: frame / 60,
      dx: Math.sin(frame * 1.17) * 20000,
      dy: Math.cos(frame * 0.79) * 20000,
      dt: frame % 17 === 0 ? 0.8 : 1 / 60,
    });
    for (const bead of wand.userData.beads) {
      const { x, y, z } = bead.mesh.position;
      assert.ok([x, y, z, bead.vx, bead.vy, bead.vz].every(Number.isFinite));
      assert.ok(Math.hypot(x, z) + bead.r <= 0.235 + 1e-9, `bead escaped side wall at frame ${frame}`);
      assert.ok(y - bead.r >= 0.08 - 1e-9, `bead escaped bottom at frame ${frame}`);
      assert.ok(y + bead.r <= 1.65 + 1e-9, `bead escaped top at frame ${frame}`);
    }
  }
  assert.ok(wand.userData.beads.some((bead, index) => bead.mesh.position.distanceTo(starts[index]) > .1));
  disposeModel(wand);
});

test('Rhythm Tap has seven colored gems and cycles the highlight through all seven', () => {
  const tap = createRhythmTap();
  assert.equal(tap.userData.gems.length, 7);
  assert.equal(new Set(tap.userData.gems.map(gem => gem.material.color.getHex())).size, 7);
  const highlighted = new Set();
  for (let step = 0; step < 7; step++) {
    updateRhythmTap(tap, (step + .1) / 5);
    const lit = tap.userData.gems.flatMap((gem, index) => gem.material.emissiveIntensity > .4 ? [index] : []);
    assert.equal(lit.length, 1);
    highlighted.add(lit[0]);
    assert.ok(tap.userData.gems[lit[0]].scale.x > 1);
  }
  assert.equal(highlighted.size, 7);
  disposeModel(tap);
});

test('model disposal releases each unique material and geometry exactly once', () => {
  for (const model of [createWand(), createRhythmTap()]) {
    const unique = new Set();
    model.traverse(object => {
      if (object.geometry) unique.add(object.geometry);
      if (object.material) for (const material of Array.isArray(object.material) ? object.material : [object.material]) unique.add(material);
    });
    assert.ok(unique.size > 20);
    const disposed = new Map();
    for (const resource of unique) resource.addEventListener('dispose', () => disposed.set(resource, (disposed.get(resource) || 0) + 1));
    assert.doesNotThrow(() => disposeModel(model));
    assert.equal(disposed.size, unique.size);
    assert.ok([...disposed.values()].every(count => count === 1));
  }
});
