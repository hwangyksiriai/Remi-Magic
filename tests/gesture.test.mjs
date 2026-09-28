import test from 'node:test';
import assert from 'node:assert/strict';
import { HoldGesture } from '../src/gesture.js';
import { DEFAULTS, normalizeSettings } from '../src/settings.js';

function makeGesture(options = {}) {
  const charges = [], triggers = [], cancels = [];
  const gesture = new HoldGesture({
    onCharge: value => charges.push(value),
    onTrigger: value => triggers.push(value),
    onCancel: value => cancels.push(value),
    ...options,
  });
  return { gesture, charges, triggers, cancels };
}

test('a short click releases normally without triggering a transformation', () => {
  const { gesture, charges, triggers, cancels } = makeGesture();
  gesture.pointerDown({ x: 120, y: 80 }, 100);
  gesture.tick(450);
  assert.ok(charges.at(-1) > 0 && charges.at(-1) < 1);
  gesture.pointerUp();
  gesture.tick(2000);
  assert.deepEqual(triggers, []);
  assert.deepEqual(cancels, ['release']);
  assert.equal(charges.at(-1), 0);
  assert.equal(gesture.state, 'idle');
});

test('one held press triggers exactly once at its original position', () => {
  const { gesture, triggers } = makeGesture();
  gesture.pointerDown({ x: 120, y: 80 }, 100);
  gesture.pointerMove({ x: 124, y: 83 });
  gesture.tick(999);
  assert.equal(triggers.length, 0);
  gesture.tick(1000);
  gesture.tick(1001);
  gesture.tick(5000);
  // Repeated down events cannot turn one physical hold into multiple captures.
  gesture.pointerDown({ x: 400, y: 500 }, 5000);
  gesture.tick(9000);
  assert.deepEqual(triggers, [{ x: 120, y: 80, heldFor: 900 }]);
});

test('releasing a completed hold rearms the next independent transformation', () => {
  const { gesture, triggers } = makeGesture();
  gesture.pointerDown({ x: 1, y: 2 }, 0);
  gesture.tick(900);
  gesture.pointerUp();
  gesture.pointerDown({ x: 3, y: 4 }, 2000);
  gesture.tick(2900);
  assert.deepEqual(triggers, [
    { x: 1, y: 2, heldFor: 900 },
    { x: 3, y: 4, heldFor: 900 },
  ]);
});

test('dragging cancels a hold and cannot rearm until the button is released', () => {
  const { gesture, triggers, cancels } = makeGesture();
  gesture.pointerDown({ x: 100, y: 100 }, 0);
  gesture.pointerMove({ x: 100, y: 115 });
  gesture.pointerMove({ x: 100, y: 100 });
  gesture.pointerDown({ x: 100, y: 100 }, 1000);
  gesture.tick(4000);
  assert.deepEqual(cancels, ['drag']);
  assert.equal(triggers.length, 0);
  gesture.pointerUp();
  gesture.pointerDown({ x: 100, y: 100 }, 5000);
  gesture.tick(5900);
  assert.equal(triggers.length, 1);
});

test('blocked page controls and non-left mouse buttons never start charging', () => {
  for (const pointer of [
    { button: 0, blocked: true }, { button: 1 }, { button: 2 },
  ]) {
    const { gesture, triggers, charges } = makeGesture();
    gesture.pointerDown({ x: 0, y: 0, ...pointer }, 0);
    gesture.tick(9000);
    assert.equal(triggers.length, 0);
    assert.equal(charges.length, 0);
    assert.equal(gesture.pressed, false);
  }
});

test('scroll or focus cancellation clears charge and prevents a late trigger', () => {
  const { gesture, triggers, charges, cancels } = makeGesture();
  gesture.pointerDown({ x: 1, y: 1 }, 0);
  gesture.tick(850);
  gesture.cancel('scroll');
  gesture.tick(1000);
  assert.equal(triggers.length, 0);
  assert.equal(charges.at(-1), 0);
  assert.deepEqual(cancels, ['scroll']);
});

test('hold duration changes stay within the supported 500–1800 ms range', () => {
  const { gesture } = makeGesture();
  gesture.updateConfig({ holdDuration: 10 });
  assert.equal(gesture.holdDuration, 500);
  gesture.updateConfig({ holdDuration: 99999 });
  assert.equal(gesture.holdDuration, 1800);
  gesture.updateConfig({ holdDuration: 1200 });
  gesture.updateConfig();
  assert.equal(gesture.holdDuration, 1200);
});

test('invalid hold durations preserve a working configuration', () => {
  const { gesture } = makeGesture({ holdDuration: 900 });
  for (const holdDuration of [NaN, Infinity, null, '', 'nonsense']) {
    gesture.updateConfig({ holdDuration });
    assert.equal(gesture.holdDuration, 900);
  }
});

test('settings normalization preserves valid choices and clamps numbers', () => {
  assert.deepEqual(normalizeSettings({
    enabled: false, sound: false, captureOnTransform: false, trail: false,
    size: 300, volume: -2, holdDuration: 2000, character: 'hazuki',
  }), {
    ...DEFAULTS,
    enabled: false, sound: false, captureOnTransform: false, trail: false,
    size: 240, volume: 0, holdDuration: 1800, character: 'hazuki', language:'ko', voiceFallback:false,
  });
  assert.equal(normalizeSettings({ character: 'aiko' }).character, 'aiko');
  assert.equal(normalizeSettings({ size: 10 }).size, 100);
});

test('missing or malformed stored settings recover the defaults', () => {
  assert.deepEqual(normalizeSettings(), DEFAULTS);
  assert.deepEqual(normalizeSettings(null), DEFAULTS);
  assert.deepEqual(normalizeSettings({
    enabled: 'false', sound: 0, captureOnTransform: null, trail: {},
    size: null, volume: false, holdDuration: '', character: 'unknown',
  }), DEFAULTS);
  assert.deepEqual(normalizeSettings({ size: NaN, volume: Infinity, holdDuration: 'slow' }), DEFAULTS);
  const restored = normalizeSettings();
  restored.size = 230;
  assert.equal(DEFAULTS.size, 160);
});

test('all five characters and both voice languages survive normalization',()=>{for(const character of ['remi','aiko','hazuki','onpu','momoko'])for(const language of ['ko','ja']){const s=normalizeSettings({character,language,voiceFallback:false});assert.equal(s.character,character);assert.equal(s.language,language);assert.equal(s.voiceFallback,false);}assert.equal(normalizeSettings({language:'en'}).language,'ko');});
