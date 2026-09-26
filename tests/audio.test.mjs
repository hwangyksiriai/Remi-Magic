import test from 'node:test';
import assert from 'node:assert/strict';
import { MagicAudio, MAX_CLIP_BYTES, describeVoiceStatus } from '../src/audio.js';
import { VOICE_PROFILES, selectVoice } from '../src/voice-profiles.js';
import { BUNDLED_VOICES, getBundledClip } from '../src/bundled-voices.js';

const clip = { data: 'data:audio/wav;base64,AQID' };
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function installWindow(t, value) {
  const old = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { value, configurable: true, writable: true });
  t.after(() => old ? Object.defineProperty(globalThis, 'window', old) : delete globalThis.window);
}
function audioFixture(t) {
  const audio = new MagicAudio({ bundledClips: {} });
  const sources = [];
  audio.master = { gain: { value: .22 } };
  audio.ctx = {
    state: 'running', currentTime: 10,
    resume() { return Promise.resolve(); }, close() { return Promise.resolve(); },
    decodeAudioData() { return Promise.resolve({ duration: 8 }); },
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
  audio.buffers = { click: { duration: .4 }, scroll: { duration: 1 }, 'remi:ko': { duration: 8 } };
  t.after(() => audio.dispose());
  return { audio, sources };
}
function speechFixture(t, voices = [{ lang: 'ko-KR', name: 'Korean' }, { lang: 'ja-JP', name: 'Japanese' }]) {
  const spoken = [];
  let cancels = 0;
  const synthesis = {
    speaking: false, pending: false,
    getVoices: () => voices,
    speak(utterance) { spoken.push(utterance); this.speaking = true; },
    cancel() { cancels++; this.speaking = false; this.pending = false; },
  };
  installWindow(t, { speechSynthesis: synthesis, SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } } });
  const { audio, sources } = audioFixture(t);
  audio.configure({ voiceFallback: true });
  audio.buffers = {};
  audio.tone = () => {};
  t.mock.timers.enable({ apis: ['setTimeout'] });
  return { audio, sources, spoken, synthesis, get cancels() { return cancels; } };
}

test('disabled or suspended audio cannot start imported or synthesized sounds', t => {
  for (const mode of ['disabled', 'suspended']) {
    const { audio, sources } = audioFixture(t);
    if (mode === 'disabled') audio.configure({ sound: false });
    else audio.ctx.state = 'suspended';
    assert.equal(audio.playClip('click'), false);
    audio.tone(1000); audio.click(); audio.scroll(1);
    assert.equal(sources.length, 0);
  }
});

test('muting stops playing clips and the scheduled character voice', t => {
  const { audio, sources } = audioFixture(t);
  audio.playClip('click'); audio.playClip('remi:ko', 1.2);
  assert.equal(sources[1].startsAt, 11.2);
  audio.configure({ sound: false });
  assert.ok(sources.every(source => source.stopped));
  assert.equal(audio.nodes.size, 0);
});

test('scroll input does not overlap an imported scroll clip', t => {
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const { audio, sources } = audioFixture(t);
  audio.scroll(1); now = 500; audio.scroll(-1); now = 999; audio.scroll(1);
  assert.equal(sources.length, 1);
  now = 1000; audio.scroll(-1);
  assert.equal(sources.length, 2);
});

test('silent scroll input does not throttle the first audible scroll', t => {
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const { audio, sources } = audioFixture(t);
  audio.configure({ sound: false }); audio.scroll(1); now = 100;
  audio.configure({ sound: true }); audio.scroll(1);
  assert.equal(sources.length, 1);
});

test('duration reserves ten seconds and includes the full selected-language recording', t => {
  const { audio } = audioFixture(t);
  assert.equal(audio.duration('aiko'), 10);
  audio.buffers['remi:ko'].duration = 15;
  assert.equal(audio.duration('remi'), 16.2);
  audio.configure({ language: 'ja' });
  assert.equal(audio.duration('remi'), 10, 'Korean recording cannot extend the Japanese sequence');
  audio.buffers.transform = { duration: 12 };
  assert.equal(audio.duration('aiko'), 12);
});

test('all ten character/language slots decode, and explicit Korean slots beat legacy aliases', async t => {
  const { audio } = audioFixture(t);
  const clips = Object.fromEntries(Object.keys(VOICE_PROFILES).flatMap(id => ['ko', 'ja'].map(lang => [`${id}:${lang}`, clip])));
  await audio.setClips({ ...clips, remi: { data: 'data:audio/wav;base64,BAUG' } });
  assert.equal(Object.keys(audio.buffers).length, 10);
  assert.equal(audio.clipData['remi:ko'].data, clip.data);
  assert.equal(audio.clipData.remi, undefined);
  await audio.setClips({ aiko: clip });
  assert.ok(audio.buffers['aiko:ko']);
  assert.equal(audio.buffers['aiko:ja'], undefined);
});

test('invalid or oversized imports and overlong recordings are rejected', async t => {
  const { audio } = audioFixture(t);
  audio.ctx.decodeAudioData = async bytes => ({ duration: new Uint8Array(bytes)[0] === 16 ? 16 : 1 });
  await audio.setClips({
    'remi:ko': { data: 'data:text/plain;base64,AQID' },
    'aiko:ko': { data: 'data:audio/wav;base64,' + Buffer.alloc(MAX_CLIP_BYTES + 1).toString('base64') },
    'hazuki:ko': { data: 'data:audio/wav;base64,EA==' },
    'onpu:ja': clip,
  });
  assert.deepEqual(Object.keys(audio.buffers), ['onpu:ja']);
});

test('first transformation waits for unlock decoding and actual recording completion', async t => {
  const { audio, sources } = audioFixture(t);
  const context = audio.ctx;
  let finishDecode;
  context.decodeAudioData = () => new Promise(resolve => { finishDecode = resolve; });
  context.createGain = () => ({ gain: { value: 0 }, connect() {} });
  delete audio.ctx;
  audio.buffers = {};
  audio.tone = () => {};
  installWindow(t, { AudioContext: class { constructor() { return context; } } });
  await audio.setClips({ 'momoko:ja': clip });
  audio.configure({ language: 'ja' });
  let done = false;
  const pending = audio.transform('momoko').then(status => { done = true; return status; });
  await flush();
  assert.equal(sources.length, 0);
  finishDecode({ duration: 15 });
  await flush();
  assert.equal(sources.length, 1);
  assert.equal(sources[0].startsAt, 11.2);
  assert.equal(done, false);
  sources[0].onended();
  const status = await pending;
  assert.equal(status.source, 'recording');
  assert.equal(status.reason, null);
  assert.equal(status.language, 'ja');
  assert.equal(status.origin, 'user-import');
});

test('replaced imports cannot be restored by an older decoder completion', async t => {
  const { audio } = audioFixture(t);
  const decodes = [];
  audio.ctx.decodeAudioData = () => new Promise(resolve => decodes.push(resolve));
  const old = audio.setClips({ 'remi:ko': clip });
  const current = audio.setClips({ 'onpu:ja': clip });
  decodes[1]({ duration: 3 }); await current;
  decodes[0]({ duration: 5 }); await old;
  assert.deepEqual(Object.keys(audio.buffers), ['onpu:ja']);
});

test('fallback uses selected language and settles only on speech completion', async t => {
  const fixture = speechFixture(t);
  const { audio, spoken } = fixture;
  audio.configure({ language: 'ja' });
  let done = false;
  const pending = audio.transform('onpu').then(status => { done = true; return status; });
  await flush(); t.mock.timers.tick(1199);
  assert.equal(spoken.length, 0);
  t.mock.timers.tick(1);
  assert.equal(spoken.length, 1);
  assert.equal(spoken[0].lang, 'ja-JP');
  assert.equal(spoken[0].voice.name, 'Japanese');
  assert.equal(spoken[0].text, VOICE_PROFILES.onpu.ja);
  assert.equal(done, false);
  spoken[0].onend();
  assert.equal((await pending).source, 'system');
  audio.stop();
  assert.equal(fixture.cancels, 0, 'completed speech no longer belongs to us');
});

test('five profiles choose five matching installed voices and different delivery settings', () => {
  const voices = [...Array(5)].map((_, i) => ({ name: `Voice ${i}`, lang: 'ko-KR' }));
  const synthesis = { getVoices: () => [{ name: 'Wrong language', lang: 'en-US' }, ...voices] };
  const selected = Object.keys(VOICE_PROFILES).map(id => selectVoice(synthesis, 'ko', id).name);
  assert.equal(new Set(selected).size, 5);
  assert.equal(new Set(Object.values(VOICE_PROFILES).map(p => `${p.pitch}:${p.rate}`)).size, 5);
  assert.equal(selectVoice(synthesis, 'ja', 'remi'), null);
});

test('missing language never speaks another language', async t => {
  const { audio, spoken } = speechFixture(t, [{ name: 'English only', lang: 'en-US' }]);
  const pending = audio.transform('remi'); await flush(); t.mock.timers.tick(1200);
  assert.equal((await pending).reason, 'language-voice-unavailable');
  assert.equal(spoken.length, 0);
});

test('fallback disabled preserves silence when there is no imported recording', async t => {
  const { audio, spoken } = speechFixture(t);
  audio.configure({ voiceFallback: false });
  const pending = audio.transform('remi'); await flush(); t.mock.timers.tick(1200);
  assert.equal((await pending).reason, 'fallback-disabled');
  assert.equal(spoken.length, 0);
});

test('stop cancels delayed speech without cancelling unrelated webpage speech', async t => {
  const fixture = speechFixture(t);
  fixture.synthesis.speaking = true;
  const pending = fixture.audio.transform('remi'); await flush();
  fixture.audio.stop();
  t.mock.timers.tick(1200);
  assert.equal((await pending).reason, 'cancelled');
  assert.equal(fixture.spoken.length, 0);
  assert.equal(fixture.cancels, 0);
});

test('a busy webpage speech queue is left alone', async t => {
  const fixture = speechFixture(t);
  fixture.synthesis.pending = true;
  const pending = fixture.audio.transform('remi'); await flush(); t.mock.timers.tick(1200);
  assert.equal((await pending).reason, 'speech-busy');
  fixture.audio.stop();
  assert.equal(fixture.spoken.length, 0);
  assert.equal(fixture.cancels, 0);
});

test('muting cancels our active utterance and resolves its pending transformation', async t => {
  const fixture = speechFixture(t);
  const pending = fixture.audio.transform('remi'); await flush(); t.mock.timers.tick(1200);
  fixture.audio.configure({ sound: false });
  assert.equal((await pending).reason, 'cancelled');
  assert.equal(fixture.cancels, 1);
  fixture.audio.stop();
  assert.equal(fixture.cancels, 1);
});

test('missing speech events produce a bounded timeout and cancel the owned utterance', async t => {
  const fixture = speechFixture(t);
  const pending = fixture.audio.transform('aiko'); await flush(); t.mock.timers.tick(1200);
  t.mock.timers.tick(20000);
  assert.equal((await pending).reason, 'speech-timeout');
  assert.equal(fixture.cancels, 1);
});

test('a blocked audio context reports unavailable recording instead of hanging capture', async t => {
  const { audio, sources } = audioFixture(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  audio.ctx.state = 'suspended';
  audio.ctx.resume = () => new Promise(() => {});
  const pending = audio.transform('remi');
  await flush();
  t.mock.timers.tick(1500);
  assert.equal((await pending).reason, 'audio-context-unavailable');
  assert.equal(sources.length, 0);
});

test('recording completion watchdog reports timeout and stops the stalled source', async t => {
  const { audio, sources } = audioFixture(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  audio.tone = () => {};
  const pending = audio.transform('remi');
  await flush();
  t.mock.timers.tick(11200);
  assert.equal((await pending).reason, 'clip-timeout');
  assert.equal(sources[0].stopped, true);
});

test('voice status copy distinguishes a system demonstration from imported audio', () => {
  const system = describeVoiceStatus({ source: 'system', reason: null, language: 'ko', voiceName: 'Heami' });
  assert.match(system, /한국어/);
  assert.match(system, /Heami/);
  assert.match(system, /원본 성우·대사 아님/);
  const recording = describeVoiceStatus({ source: 'recording', reason: null, language: 'ja' });
  assert.equal(recording, '일본어 등록 음성 사용');
  assert.doesNotMatch(recording, /원본/);
  assert.match(describeVoiceStatus({ source: 'system', language: 'ja' }, 'ja'), /原作の声優・台詞ではありません/);
});

test('voice status copy treats playback errors independently from the source', () => {
  assert.match(describeVoiceStatus({ source: 'recording', reason: 'clip-timeout', language: 'ko' }), /재생을 중단/);
  assert.match(describeVoiceStatus({ source: 'system', reason: 'speech-not-allowed', language: 'ko' }), /브라우저/);
  assert.match(describeVoiceStatus({ source: 'unavailable', reason: 'fallback-disabled', language: 'ja' }), /시연 음성 꺼짐/);
  assert.match(describeVoiceStatus({ source: 'unavailable', reason: 'speech-busy', language: 'ko' }), /다른 음성/);
});

test('synchronous status reports a staged recording before AudioContext unlock', async t => {
  const audio = new MagicAudio();
  t.after(() => audio.dispose());
  await audio.setClips({ 'onpu:ja': clip });
  audio.configure({ language: 'ja' });
  assert.equal(audio.getVoiceStatusText('onpu'), '일본어 등록 음성을 준비하고 있어요…');
  audio.configure({ sound: false });
  assert.equal(audio.getVoiceStatusText('onpu'), '음성이 꺼져 있어요.');
});

test('bundled excerpts cover exactly the seven supported character/language slots', () => {
  assert.deepEqual(Object.keys(BUNDLED_VOICES).sort(), ['remi:ko','aiko:ko','hazuki:ko','onpu:ko','remi:ja','aiko:ja','momoko:ja'].sort());
  for (const [key, voice] of Object.entries(BUNDLED_VOICES)) {
    assert.equal(getBundledClip(key), voice);
    assert.equal(voice.origin, 'reference-excerpt');
    assert.match(voice.sourceVideo, /^https:\/\/www\.youtube\.com\/watch\?v=/);
    assert.ok(voice.sourceEnd - voice.sourceStart <= 3);
    assert.ok(voice.duration >= 1.9 && voice.duration < 3.1);
    assert.match(voice.data, /^data:audio\/mpeg;base64,/);
    const bytes = Buffer.from(voice.data.split(',')[1], 'base64');
    assert.ok(bytes.length > 1000 && bytes.length < MAX_CLIP_BYTES);
  }
  for (const key of ['momoko:ko','hazuki:ja','onpu:ja']) assert.equal(getBundledClip(key), null);
});

test('default references are used automatically, user imports override them, and clearing restores originals', async t => {
  const { audio: fixture } = audioFixture(t);
  const audio = new MagicAudio();
  t.after(() => audio.dispose());
  audio.ctx = fixture.ctx;
  audio.master = fixture.master;
  assert.equal(audio.voiceFallback, false);
  await audio.setClips();
  assert.equal(Object.keys(audio.buffers).length, 7);
  assert.equal(audio.getVoiceStatus('remi').origin, 'reference-excerpt');
  assert.match(audio.getVoiceStatusText('remi'), /참고 영상 원음 · 배경음 포함/);
  await audio.setClips({ 'remi:ko': { ...clip, name: 'My recording' } });
  assert.equal(audio.clipData['remi:ko'].data, clip.data);
  assert.equal(audio.getVoiceStatus('remi').origin, 'user-import');
  assert.equal(audio.getVoiceStatusText('remi'), '한국어 등록 음성 사용');
  await audio.setClips({});
  assert.equal(audio.clipData['remi:ko'].data, BUNDLED_VOICES['remi:ko'].data);
  assert.equal(audio.getVoiceStatus('remi').origin, 'reference-excerpt');
  audio.configure({ language: 'ja' });
  assert.equal(audio.getVoiceStatus('hazuki').reason, 'fallback-disabled');
  assert.equal(audio.buffers['hazuki:ja'], undefined);
});

test('legacy Korean user recording still overrides its built-in slot', async t => {
  const { audio: fixture } = audioFixture(t);
  const audio = new MagicAudio();
  t.after(() => audio.dispose());
  audio.ctx = fixture.ctx;
  audio.master = fixture.master;
  await audio.setClips({ remi: { ...clip, name: 'Legacy' } });
  assert.equal(audio.getVoiceStatus('remi').origin, 'user-import');
  assert.equal(audio.clipData['remi:ko'].name, 'Legacy');
  assert.equal(audio.clipData['remi:ja'].origin, 'reference-excerpt');
});

test('source final calls start at the seven-second reveal and stop safely while waiting', async t => {
  const { audio: fixture, sources } = audioFixture(t);
  const audio = new MagicAudio({ bundledClips: { 'remi:ko': BUNDLED_VOICES['remi:ko'] } });
  t.after(() => audio.dispose());
  audio.ctx = fixture.ctx;
  audio.master = fixture.master;
  audio.tone = () => {};
  audio.ctx.decodeAudioData = async () => ({ duration: 3.006 });
  await audio.setClips();
  const pending = audio.transform('remi');
  await flush();
  assert.equal(sources[0].startsAt, 17, 'context at10 + final-call delay7');
  assert.equal(audio.voiceDelay('remi'), 7);
  assert.equal(audio.duration('remi'), 10.006);
  audio.stop();
  const result = await pending;
  assert.equal(result.reason, 'cancelled');
  assert.equal(result.origin, 'reference-excerpt');
  assert.equal(sources[0].stopped, true);
  await audio.setClips({ 'remi:ko': clip });
  assert.equal(audio.voiceDelay('remi'), 1.2, 'custom full speech keeps its early entrance');
  assert.equal(audio.duration('remi'), 10);
});
