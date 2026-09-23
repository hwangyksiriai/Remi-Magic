import test from 'node:test';
import assert from 'node:assert/strict';
import { MagicAudio } from '../src/audio.js';

function audioFixture() {
  const audio = new MagicAudio();
  const sources = [];
  audio.master = { gain: { value: .22 } };
  audio.ctx = {
    state: 'running', currentTime: 10,
    createBufferSource() {
      const source = {
        connect() {}, disconnect() {},
        start(when) { this.startsAt = when; },
        stop() { this.stopped = true; },
      };
      sources.push(source);
      return source;
    },
    createOscillator() { assert.fail('A disabled or suspended sound must not allocate an oscillator'); },
  };
  audio.buffers = { click: { duration: .4 }, scroll: { duration: 1 }, remi: { duration: 8 } };
  return { audio, sources };
}

test('disabled or suspended audio cannot start either imported or synthesized sounds', () => {
  for (const mode of ['disabled', 'suspended']) {
    const { audio, sources } = audioFixture();
    if (mode === 'disabled') audio.configure({ sound: false });
    else audio.ctx.state = 'suspended';
    assert.equal(audio.playClip('click'), false);
    audio.tone(1000);
    audio.click();
    audio.scroll(1);
    assert.equal(sources.length, 0);
  }
});

test('muting stops playing clips and a character voice scheduled for later', () => {
  const { audio, sources } = audioFixture();
  audio.playClip('click');
  audio.playClip('remi', 1.2);
  assert.equal(sources[1].startsAt, 11.2);
  audio.configure({ sound: false });
  assert.ok(sources.every(source => source.stopped));
  assert.equal(audio.nodes.size, 0);
});

test('scroll input does not overlap an imported scroll clip', t => {
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const { audio, sources } = audioFixture();
  audio.scroll(1);
  now = 500;
  audio.scroll(-1);
  now = 999;
  audio.scroll(1);
  assert.equal(sources.length, 1);
  now = 1000;
  audio.scroll(-1);
  assert.equal(sources.length, 2);
});

test('silent scroll input must not throttle the first audible scroll after unmuting', t => {
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const { audio, sources } = audioFixture();
  audio.configure({ sound: false });
  audio.scroll(1);
  now = 100;
  audio.configure({ sound: true });
  audio.scroll(1);
  assert.equal(sources.length, 1);
});

test('capture duration includes the full imported character voice and its entrance delay', () => {
  const { audio } = audioFixture();
  assert.equal(audio.duration('aiko'), 3.8);
  assert.ok(audio.duration('remi') >= 9.2);
  audio.buffers.remi.duration = 15;
  assert.ok(audio.duration('remi') >= 16.2, '15 second speech beginning at 1.2 seconds must finish before capture');
  audio.buffers.transform = { duration: 12 };
  assert.ok(audio.duration('aiko') >= 12);
});
