import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3 } from 'three';
import { createRhythmTap, updateRhythmTap, disposeModel } from '../src/models.js';

test('product reference has seven distinct clockwise jewels and an empty clear top petal', () => {
  const model = createRhythmTap();
  const jewels = model.userData.gems;
  assert.equal(jewels.length, 7);
  assert.deepEqual(jewels.map(jewel => jewel.material.color.getHex()), [0xf15aa4, 0xeb2350, 0xff9b23, 0xf4d329, 0x12b57d, 0x159bca, 0xa86dcb]);
  for (const [index, jewel] of jewels.entries()) {
    const angle = (index + 1) * Math.PI / 4;
    assert.ok(Math.abs(jewel.position.x - Math.sin(angle) * .905) < 1e-9);
    assert.ok(Math.abs(jewel.position.y - Math.cos(angle) * .905) < 1e-9);
    assert.ok(Math.abs(jewel.position.y - .905) > .01, 'clear top petal has no colored jewel');
  }
  disposeModel(model);
});

test('layered housing and clear domes have physical thickness and fit declared cursor bounds', () => {
  const model = createRhythmTap();
  const bounds = new Box3().setFromObject(model);
  assert.ok(bounds.max.z - bounds.min.z > .6, 'real three-dimensional housing depth');
  assert.ok(Math.abs(bounds.max.y - bounds.min.y - model.userData.height) < 1e-9);
  assert.ok(model.userData.pockets.every(pocket => pocket.material.isMeshPhysicalMaterial && pocket.material.transmission > .8 && pocket.material.thickness > 0 && pocket.material.ior > 1));
  const pinkBody = model.getObjectByName('thick pink back housing');
  assert.ok(pinkBody.material.clearcoat > 0 && pinkBody.material.roughness < .4 && pinkBody.material.metalness === 0, 'painted ABS remains distinct from metal');
  disposeModel(model);
});

test('charging preserves jewel color and location and never deforms the clear cover', () => {
  const model = createRhythmTap();
  const starts = model.userData.gems.map(jewel => ({ color: jewel.material.color.getHex(), position: jewel.position.clone() }));
  const covers = model.userData.pockets.map(pocket => pocket.scale.clone());
  for (const time of [-1000, 0, .2, 1, 5, NaN, Infinity]) for (const charge of [-1, 0, .5, 1, 100, NaN]) {
    updateRhythmTap(model, time, charge);
    model.userData.gems.forEach((jewel, index) => {
      assert.equal(jewel.material.color.getHex(), starts[index].color);
      assert.ok(jewel.position.equals(starts[index].position));
      assert.ok(Number.isFinite(jewel.material.emissiveIntensity));
      assert.ok(jewel.material.emissiveIntensity >= 0 && jewel.material.emissiveIntensity <= .31);
      assert.ok(jewel.scale.x === 1 && jewel.scale.y === 1 && jewel.scale.z === 1);
      assert.equal(jewel.material.transmission, 0, 'jewels must remain in the refraction buffer');
    });
  }
  model.userData.pockets.forEach((pocket, index) => assert.ok(pocket.scale.equals(covers[index])));
  disposeModel(model);
});
