import test from 'node:test';
import assert from 'node:assert/strict';
import { CHARACTER_IDS, CompanionScheduler, nextDelay, scenePose, validateSettings, workAreaBounds } from '../desktop/scheduler.mjs';

function fakeClock() {
  let now = 0, sequence = 0;
  const timers = new Map();
  return {
    setTimer(callback, delay) { const id = ++sequence; timers.set(id, { at: now + delay, callback }); return id; },
    clearTimer(id) { timers.delete(id); },
    tick(milliseconds) {
      const end = now + milliseconds;
      while (true) {
        const pending = [...timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!pending) break;
        timers.delete(pending[0]); now = pending[1].at; pending[1].callback();
      }
      now = end;
    },
    pending() { return timers.size; },
  };
}

test('default occasional appearances wait 60–180 seconds, remain 20 seconds, then wait again', () => {
  assert.equal(nextDelay('normal', () => 0), 60_000);
  assert.equal(nextDelay('normal', () => 1), 180_000);
  const clock = fakeClock(), started = [], ended = [];
  const scheduler = new CompanionScheduler({ ...clock, random: () => 0.5, onStart: (scene) => started.push(scene), onEnd: (scene) => ended.push(scene) });
  scheduler.start();
  clock.tick(119_999); assert.equal(started.length, 0);
  clock.tick(1); assert.equal(started.length, 1); assert.equal(started[0].mode, 'walk');
  clock.tick(19_999); assert.equal(ended.length, 0);
  clock.tick(1); assert.equal(ended.length, 1); assert.equal(ended[0].reason, 'finished');
  clock.tick(119_999); assert.equal(started.length, 1);
  clock.tick(1); assert.equal(started.length, 2);
  scheduler.destroy(); assert.equal(clock.pending(), 0);
});

test('manual appearances replace current scenes without stale timers hiding the new one', () => {
  const clock = fakeClock(), starts = [], ends = [];
  const scheduler = new CompanionScheduler({ ...clock, onStart: (scene) => starts.push(scene), onEnd: (scene) => ends.push(scene) });
  scheduler.start(); scheduler.show('walk'); clock.tick(10_000); scheduler.show('group');
  assert.equal(starts.length, 2); assert.equal(ends[0].reason, 'replaced'); assert.equal(clock.pending(), 1);
  clock.tick(10_000); assert.equal(scheduler.active.mode, 'group');
  clock.tick(10_000); assert.equal(scheduler.active, null); assert.equal(ends.length, 2);
  scheduler.destroy();
});

test('pause cancels automatic timers and current audio/animation scene, but manual actions remain available', () => {
  const clock = fakeClock(), starts = [], ends = [];
  const scheduler = new CompanionScheduler({ ...clock, onStart: (scene) => starts.push(scene), onEnd: (scene) => ends.push(scene) });
  scheduler.start(); scheduler.show('group'); scheduler.update({ enabled: false });
  assert.equal(scheduler.active, null); assert.equal(ends[0].reason, 'settings-changed'); assert.equal(clock.pending(), 0);
  clock.tick(1_000_000); assert.equal(starts.length, 1);
  scheduler.show('transform'); assert.equal(scheduler.active.mode, 'transform');
  clock.tick(20_000); assert.equal(clock.pending(), 0);
  scheduler.update({ enabled: true, frequency: 'often' }); assert.equal(clock.pending(), 1);
  scheduler.destroy();
});

test('session lock or suspend prevents both automatic and manual appearances until resume', () => {
  const clock = fakeClock(), starts = [];
  const scheduler = new CompanionScheduler({ ...clock, random: () => 0, onStart: (scene) => starts.push(scene) });
  scheduler.start(); scheduler.suspend(); scheduler.show('group'); clock.tick(600_000);
  assert.equal(starts.length, 0); assert.equal(clock.pending(), 0);
  scheduler.resume(); clock.tick(60_000); assert.equal(starts.length, 1);
  scheduler.destroy(); scheduler.show(); scheduler.resume(); clock.tick(600_000);
  assert.equal(starts.length, 1); assert.equal(clock.pending(), 0);
});

test('character selection covers all five characters and preserves explicit choice', () => {
  for (const [index, character] of CHARACTER_IDS.entries()) {
    const clock = fakeClock();
    const scheduler = new CompanionScheduler({ ...clock, random: () => (index + 0.1) / CHARACTER_IDS.length });
    scheduler.show(); assert.equal(scheduler.active.character, character);
    scheduler.update({ character }); scheduler.show('transform'); assert.equal(scheduler.active.character, character);
    scheduler.destroy();
  }
});

test('invalid saved settings cannot enable arbitrary characters, modes, frequencies, or extreme audio volume', () => {
  assert.deepEqual(validateSettings({ enabled: 'yes', language: 'fr', character: 'unknown', frequency: '__proto__', reducedMotion: 'true', volume: Infinity, sound: 'yes', extra: 'ignored' }), {
    enabled: true, language: 'ko', character: 'random', frequency: 'normal', reducedMotion: false, volume: 0.4, sound: false,
  });
  assert.equal(validateSettings({ volume: -3 }).volume, 0);
  assert.equal(validateSettings({ volume: 300 }).volume, 1);
});

test('multi-monitor work areas preserve negative screen positions and avoid the taskbar', () => {
  const leftMonitor = { bounds: { x: -1920, y: -200, width: 1920, height: 1080 }, workArea: { x: -1920, y: -200, width: 1920, height: 1032 } };
  assert.deepEqual(workAreaBounds(leftMonitor), { x: -1920, y: -200, width: 1920, height: 1032 });
});

test('walking and group choreography stay within narrow and large work areas for their full lifetime', () => {
  for (const [width, height] of [[320, 240], [800, 600], [1920, 1032], [3840, 2100]]) {
    for (const mode of ['walk', 'group', 'transform']) for (let elapsed = 0; elapsed <= 20; elapsed += 0.1) {
      const count = mode === 'group' ? 5 : 1;
      for (let index = 0; index < count; index++) {
        const state = scenePose({ width, height, mode, index, count, elapsed });
        assert.ok(state.x - 140 * state.scale >= 0 && state.x + 140 * state.scale <= width, `${mode} x bound`);
        assert.ok(state.y - 165 * state.scale >= -0.001 && state.y + 135 * state.scale <= height, `${mode} y bound`);
      }
    }
  }
});

test('reduced motion keeps characters in place while normal walks animate and reverse at edges', () => {
  const sample = (elapsed, reducedMotion = false) => scenePose({ width: 800, height: 600, elapsed, reducedMotion });
  assert.equal(sample(1, true).x, sample(17, true).x);
  assert.equal(sample(1, true).pose, 'idle');
  assert.notEqual(sample(1).x, sample(4).x);
  assert.equal(sample(1).pose, 'walk');
  assert.notEqual(sample(1).facing, sample(17).facing);
});
