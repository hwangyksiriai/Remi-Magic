import test from 'node:test';
import assert from 'node:assert/strict';
import { createWand, updateWand, createRhythmTap, updateRhythmTap, disposeModel } from '../src/models.js';

test('the photo-reference wand has two bead chambers, pearl shaft, pink dome and ordered rainbow grip', () => {
  const wand = createWand();
  assert.equal(wand.userData.beads.length, 14);
  const colors = new Set(wand.userData.beads.map(bead => bead.mesh.material.color.getHex()));
  assert.equal(colors.size, 7);
  assert.ok(wand.userData.beads.every(bead => bead.mesh.parent === wand));
  const top = wand.userData.beads.filter(bead => bead.chamber.id === 'top');
  const grip = wand.userData.beads.filter(bead => bead.chamber.id.startsWith('grip-'));
  assert.equal(top.length, 7);
  assert.equal(grip.length, 7);
  assert.deepEqual(grip.map(bead => bead.mesh.material.color.getHex()), [0xf22d4f, 0xff7728, 0xf7c935, 0x26bf55, 0x119acb, 0x296ddd, 0xa32eb0]);
  assert.ok(grip.every((bead, index) => index === 0 || bead.anchorY < grip[index - 1].anchorY));
  for (const name of ['pink-hemisphere-cap', 'top-clear-bead-drum', 'pearl-white-tapered-shaft', 'red-round-shaft-button', 'clear-rainbow-handle', 'rounded-red-bottom-tip']) assert.ok(wand.getObjectByName(name), name);
  assert.equal(wand.getObjectByName('pearl-white-tapered-shaft').material.color.getHex(), 0xfffcf4);
  assert.ok(wand.getObjectByName('top-clear-bead-drum').material.transparent);
  assert.ok(wand.getObjectByName('clear-rainbow-handle').material.transparent);
  assert.ok(wand.userData.height > 5 && wand.userData.height < 5.6);
  assert.ok(wand.userData.tipY > 2.6);
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
      assert.ok(Math.hypot(x, z) + bead.r <= bead.chamber.radius + 1e-9, `bead escaped ${bead.chamber.id} side wall at frame ${frame}`);
      assert.ok(y - bead.r >= bead.chamber.minY - 1e-9, `bead escaped ${bead.chamber.id} bottom at frame ${frame}`);
      assert.ok(y + bead.r <= bead.chamber.maxY + 1e-9, `bead escaped ${bead.chamber.id} top at frame ${frame}`);
    }
  }
  assert.ok(wand.userData.beads.some((bead, index) => bead.mesh.position.distanceTo(starts[index]) > .1));
  const grip = wand.userData.beads.filter(bead => Number.isFinite(bead.anchorY));
  assert.ok(grip.every((bead, index) => index === 0 || bead.mesh.position.y < grip[index - 1].mesh.position.y), 'rainbow colors keep their top-to-bottom order');
  assert.doesNotThrow(() => updateWand(wand, { time: NaN, dx: Infinity, dy: -Infinity, dt: NaN }));
  assert.ok(wand.userData.beads.every(bead => [bead.mesh.position.x, bead.mesh.position.y, bead.mesh.position.z].every(Number.isFinite)));
  disposeModel(wand);
});

test('Rhythm Tap cycles a subtle idle highlight without changing jewel size', () => {
  const tap = createRhythmTap();
  assert.equal(tap.userData.gems.length, 7);
  assert.equal(new Set(tap.userData.gems.map(gem => gem.material.color.getHex())).size, 7);
  const highlighted = new Set();
  for (let step = 0; step < 7; step++) {
    updateRhythmTap(tap, (step + .1) / 5);
    const brightest = Math.max(...tap.userData.gems.map(gem => gem.material.emissiveIntensity));
    const lit = tap.userData.gems.flatMap((gem, index) => gem.material.emissiveIntensity === brightest ? [index] : []);
    assert.equal(lit.length, 1);
    highlighted.add(lit[0]);
    assert.ok(brightest > 0 && brightest <= .04, 'idle sparkle must not wash out material shading');
    assert.ok(tap.userData.gems.every(gem => gem.scale.x === 1 && gem.scale.y === 1 && gem.scale.z === 1));
  }
  assert.equal(highlighted.size, 7);
  updateRhythmTap(tap, 0, 1);
  assert.ok(Math.max(...tap.userData.gems.map(gem => gem.material.emissiveIntensity)) <= .31);
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
