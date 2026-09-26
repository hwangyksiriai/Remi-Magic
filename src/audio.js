import { VOICE_PROFILES, selectVoice } from './voice-profiles.js';
import { BUNDLED_VOICES } from './bundled-voices.js';

export const MAX_CLIP_BYTES = 700 * 1024;
export const MAX_CLIP_SECONDS = 15;
export const MIN_TRANSFORM_SECONDS = 10;
export const VOICE_DELAY_SECONDS = 1.2;
export const REFERENCE_VOICE_DELAY_SECONDS = 7;
const SPEECH_TIMEOUT_MS = 20000;
const CHARACTERS = Object.keys(VOICE_PROFILES);
const CLIP_KEYS = ['click', 'scroll', 'transform', ...CHARACTERS.flatMap(id => [`${id}:ko`, `${id}:ja`])];

/** Synchronous UI copy; an imported file is never assumed to be an original recording. */
export function describeVoiceStatus(status, locale = 'ko') {
  const japanese = locale === 'ja';
  const language = status?.language === 'ja' ? (japanese ? '日本語' : '일본어') : (japanese ? '韓国語' : '한국어');
  const reason = status?.reason;
  if (reason === 'cancelled' || status?.source === 'muted') return japanese ? '音声は停止しています。' : '음성이 꺼져 있어요.';
  if (reason === 'fallback-disabled') return japanese ? `${language}の登録音声なし・システム試聴はオフ` : `${language} 녹음 없음 · 시스템 시연 음성 꺼짐`;
  if (reason === 'language-voice-unavailable') return japanese ? `${language}のシステム音声がありません。録音を登録してください。` : `${language} 시스템 음성이 없어요. 해당 언어의 음성을 설치하거나 녹음을 등록해 주세요.`;
  if (reason === 'speech-busy') return japanese ? 'ほかの音声が再生中のため、今回の試聴を省略しました。' : '다른 음성이 재생 중이라 이번 시연 음성을 건너뛰었어요.';
  if (reason === 'audio-context-unavailable' || reason === 'speech-not-allowed') return japanese ? 'ブラウザーが音声をブロックしました。ページをクリックして再試行してください。' : '브라우저가 소리를 막았어요. 페이지를 클릭한 뒤 다시 변신해 주세요.';
  if (reason === 'speech-api-unavailable') return japanese ? 'このブラウザーではシステム音声を利用できません。録音を登録してください。' : '이 브라우저에서는 시스템 음성을 사용할 수 없어요. 녹음을 등록해 주세요.';
  if (reason === 'recording-loading') return japanese ? `${language}の登録音声を準備中…` : `${language} 등록 음성을 준비하고 있어요…`;
  if (reason === 'speech-timeout' || reason === 'clip-timeout') return japanese ? '音声の終了を確認できなかったため、再生を停止しました。' : '음성 종료를 확인하지 못해 재생을 중단했어요.';
  if (reason) return japanese ? '音声を再生できませんでした。録音とブラウザーの設定を確認してください。' : '음성을 재생하지 못했어요. 등록 파일과 브라우저 소리 설정을 확인해 주세요.';
  if (status?.source === 'recording') {
    if (status.origin === 'reference-excerpt') return japanese ? `${language}の参考動画の原音 · 背景音を含みます` : `${language} 참고 영상 원음 · 배경음 포함`;
    return japanese ? `${language}の登録音声を使用` : `${language} 등록 음성 사용`;
  }
  if (status?.source === 'system') {
    const voice = status.voiceName ? ` · ${status.voiceName}` : '';
    return japanese ? `${language}のシステム試聴音声${voice} · 原作の声優・台詞ではありません` : `${language} 시스템 시연 음성${voice} · 원본 성우·대사 아님`;
  }
  return japanese ? '音声を確認できません。' : '사용할 음성을 확인하지 못했어요.';
}

function normalizeClips(clips) {
  const normalized = {};
  for (const key of CLIP_KEYS) if (clips?.[key]?.data) normalized[key] = { ...clips[key] };
  // Previous versions had no language field. Treat those imports as Korean only.
  for (const id of ['remi', 'aiko', 'hazuki']) {
    if (!normalized[`${id}:ko`] && clips?.[id]?.data) normalized[`${id}:ko`] = { ...clips[id] };
  }
  return normalized;
}

export class MagicAudio {
  constructor({ bundledClips = BUNDLED_VOICES } = {}) {
    this.sound = true;
    this.volume = .22;
    this.language = 'ko';
    this.voiceFallback = false;
    this.nodes = new Set();
    this.clipFinishes = new Map();
    this.speechJobs = new Set();
    this.lastScroll = -Infinity;
    this.buffers = {};
    this.bundledClips = normalizeClips(bundledClips);
    this.userClipData = {};
    this.clipData = { ...this.bundledClips };
    this.clipsReady = Promise.resolve();
    this.audioRevision = 0;
    this.playbackRevision = 0;
    this.disposed = false;
  }

  configure({ sound = this.sound, volume = this.volume, language = this.language, voiceFallback = this.voiceFallback } = {}) {
    const nextLanguage = language === 'ja' ? 'ja' : 'ko';
    if (!sound || nextLanguage !== this.language || (!voiceFallback && this.voiceFallback)) this.stop();
    this.sound = Boolean(sound);
    this.volume = Number.isFinite(Number(volume)) ? Math.max(0, Math.min(.5, Number(volume))) : .22;
    this.language = nextLanguage;
    this.voiceFallback = Boolean(voiceFallback);
    if (this.master) this.master.gain.value = this.volume;
    if (this.activeSpeech) this.activeSpeech.utterance.volume = this.volume;
  }

  async unlock() {
    if (!this.sound || this.disposed) return;
    try {
      // Trigger asynchronous OS voice discovery before the delayed phrase begins.
      if (this.voiceFallback) globalThis.window?.speechSynthesis?.getVoices();
      if (!this.ctx) {
        const Audio = globalThis.window?.AudioContext || globalThis.window?.webkitAudioContext;
        if (!Audio) return;
        this.ctx = new Audio();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(this.ctx.destination);
        this.setClips(this.userClipData);
      }
      const resume = this.ctx.resume?.();
      if (resume?.catch) {
        // Some browsers leave resume pending until a later gesture. Report the
        // unavailable recording instead of hanging the capture indefinitely.
        let timer;
        await Promise.race([resume.catch(() => {}), new Promise(resolve => { timer = setTimeout(resolve, 1500); })]);
        clearTimeout(timer);
      }
      // Imports changed during decoding must finish before the first voice starts.
      let loading;
      do { loading = this.clipsReady; await loading; } while (loading !== this.clipsReady);
    } catch { /* Synthesis may still work when Web Audio is unavailable. */ }
  }

  setClips(clips = {}) {
    this.userClipData = normalizeClips(clips);
    for (const clip of Object.values(this.userClipData)) clip.origin = 'user-import';
    this.clipData = { ...this.bundledClips, ...this.userClipData };
    const revision = ++this.audioRevision;
    this.buffers = {};
    if (!this.ctx || this.disposed) return (this.clipsReady = Promise.resolve());
    const entries = Object.entries(this.clipData);
    this.clipsReady = Promise.all(entries.map(async ([key, clip]) => {
      try {
        const data = clip.data;
        if (typeof data !== 'string' || data.length > 1000000 || !/^data:audio\/[\w.+-]+;base64,/.test(data)) return;
        const bytes = Uint8Array.from(atob(data.slice(data.indexOf(',') + 1)), c => c.charCodeAt(0));
        if (bytes.byteLength > MAX_CLIP_BYTES) return;
        const buffer = await this.ctx.decodeAudioData(bytes.buffer);
        if (revision !== this.audioRevision || this.disposed) return;
        if (buffer.duration > 0 && buffer.duration <= MAX_CLIP_SECONDS) this.buffers[key] = buffer;
      } catch { /* One invalid slot must not prevent other imports from loading. */ }
    })).then(() => undefined);
    return this.clipsReady;
  }

  startClip(key, delay = 0) {
    const buffer = this.buffers[key];
    if (!buffer || !this.sound || this.disposed || this.ctx?.state !== 'running') return null;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.master);
    let finish;
    const finished = new Promise(resolve => { finish = resolve; });
    let settled = false;
    const settle = reason => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      this.nodes.delete(source);
      this.clipFinishes.delete(source);
      try { source.disconnect(); } catch {}
      finish(reason);
    };
    const timeout = setTimeout(() => {
      settle('clip-timeout');
      try { source.stop(); } catch {}
    }, (delay + buffer.duration + 2) * 1000);
    this.nodes.add(source);
    this.clipFinishes.set(source, settle);
    source.onended = () => settle(null);
    try { source.start(this.ctx.currentTime + delay); }
    catch { settle('clip-start-failed'); return null; }
    return { source, finished };
  }

  playClip(key, delay = 0) { return Boolean(this.startClip(key, delay)); }

  voiceDelay(character = 'remi') {
    return this.clipData[`${character}:${this.language}`]?.origin === 'reference-excerpt'
      ? REFERENCE_VOICE_DELAY_SECONDS : VOICE_DELAY_SECONDS;
  }

  duration(character = 'remi') {
    return Math.max(MIN_TRANSFORM_SECONDS, (this.buffers[`${character}:${this.language}`]?.duration || 0) + this.voiceDelay(character),
      this.buffers.transform?.duration || 0);
  }

  getVoiceStatus(character = 'remi') {
    const language = this.language;
    if (!this.sound || this.disposed) return { source: 'muted', reason: this.disposed ? 'disposed' : 'sound-disabled', language };
    if (this.buffers[`${character}:${language}`]) {
      const clip = this.clipData[`${character}:${language}`];
      return { source: 'recording', reason: null, language, ...(clip ? { origin: clip.origin, name: clip.name, sourceVideo: clip.sourceVideo, sourceStart: clip.sourceStart, sourceEnd: clip.sourceEnd } : {}) };
    }
    if (!this.voiceFallback) return { source: 'unavailable', reason: 'fallback-disabled', language };
    const synthesis = globalThis.window?.speechSynthesis;
    if (!synthesis || !globalThis.window?.SpeechSynthesisUtterance) return { source: 'unavailable', reason: 'speech-api-unavailable', language };
    const voice = selectVoice(synthesis, language, character);
    if (!voice) return { source: 'unavailable', reason: 'language-voice-unavailable', language };
    return { source: 'system', reason: null, language, voiceName: voice.name };
  }

  getVoiceStatusText(character = 'remi', locale = 'ko') {
    if (this.sound && !this.disposed && !this.ctx && this.clipData[`${character}:${this.language}`]?.data) {
      return describeVoiceStatus({ source: 'recording', reason: 'recording-loading', language: this.language }, locale);
    }
    return describeVoiceStatus(this.getVoiceStatus(character), locale);
  }

  scheduleSpeech(character, revision, language) {
    return new Promise(resolve => {
      let delayTimer, watchdog;
      let settled = false;
      const job = {
        utterance: null,
        finish: status => {
          if (settled) return;
          settled = true;
          clearTimeout(delayTimer);
          clearTimeout(watchdog);
          this.speechJobs.delete(job);
          if (this.activeSpeech === job) this.activeSpeech = null;
          resolve(status);
        },
      };
      this.speechJobs.add(job);
      delayTimer = setTimeout(() => {
        if (revision !== this.playbackRevision || !this.sound || this.disposed) {
          job.finish({ source: 'muted', reason: 'cancelled', language });
          return;
        }
        const status = this.getVoiceStatus(character);
        if (status.source !== 'system') { job.finish(status); return; }
        const synthesis = globalThis.window.speechSynthesis;
        // Do not join a website speech queue, which cannot be cancelled by owner.
        if (synthesis.speaking || synthesis.pending) {
          job.finish({ ...status, source: 'unavailable', reason: 'speech-busy' });
          return;
        }
        const selectedVoice = selectVoice(synthesis, language, character);
        if (!selectedVoice) {
          job.finish({ ...status, source: 'unavailable', reason: 'language-voice-unavailable' });
          return;
        }
        const profile = VOICE_PROFILES[character] || VOICE_PROFILES.remi;
        const utterance = new globalThis.window.SpeechSynthesisUtterance(profile[language]);
        utterance.lang = language === 'ja' ? 'ja-JP' : 'ko-KR';
        utterance.voice = selectedVoice;
        utterance.pitch = profile.pitch;
        utterance.rate = profile.rate;
        utterance.volume = this.volume;
        job.utterance = utterance;
        utterance.onend = () => job.finish(status);
        utterance.onerror = event => job.finish({ ...status, reason: `speech-${event?.error || 'error'}` });
        this.activeSpeech = job;
        watchdog = setTimeout(() => {
          this.cancelOwnedSpeech(job);
          job.finish({ ...status, reason: 'speech-timeout' });
        }, SPEECH_TIMEOUT_MS);
        try { synthesis.speak(utterance); }
        catch { job.finish({ ...status, source: 'unavailable', reason: 'speech-start-failed' }); }
      }, VOICE_DELAY_SECONDS * 1000);
    });
  }

  cancelOwnedSpeech(job = this.activeSpeech) {
    if (!job?.utterance || this.activeSpeech !== job) return;
    // Web Speech only has global cancel(). Call it exclusively while we own a
    // submitted utterance. A page queuing speech during ours may still be affected.
    job.utterance.onend = null;
    job.utterance.onerror = null;
    try { globalThis.window?.speechSynthesis?.cancel(); } catch {}
  }

  tone(frequency, delay = 0, length = .65, gain = .25) {
    if (!this.sound || this.disposed || this.ctx?.state !== 'running') return;
    const start = this.ctx.currentTime + delay;
    for (const [multiple, level] of [[1, 1], [2, .2], [3, .055]]) {
      const osc = this.ctx.createOscillator(), env = this.ctx.createGain();
      osc.type = 'sine'; osc.frequency.value = frequency * multiple;
      env.gain.setValueAtTime(0, start);
      env.gain.linearRampToValueAtTime(gain * level, start + .008);
      env.gain.exponentialRampToValueAtTime(.0001, start + length);
      osc.connect(env); env.connect(this.master);
      osc.start(start); osc.stop(start + length + .02);
      this.nodes.add(osc);
      osc.onended = () => { this.nodes.delete(osc); osc.disconnect(); env.disconnect(); };
    }
  }

  scroll(direction) {
    if (!this.sound || this.disposed || this.ctx?.state !== 'running') return;
    const now = performance.now();
    if (now - this.lastScroll < Math.max(140, (this.buffers.scroll?.duration || 0) * 1000)) return;
    this.lastScroll = now;
    if (this.playClip('scroll')) return;
    const notes = direction > 0 ? [1046.5, 1318.5, 1568] : [1568, 1318.5, 1046.5];
    notes.forEach((f, i) => this.tone(f, i * .045, .38, .15));
  }

  async transform(character = 'remi') {
    const revision = this.playbackRevision;
    const language = this.language;
    await this.unlock();
    if (revision !== this.playbackRevision || !this.sound || this.disposed) return { source: 'muted', reason: 'cancelled', language };
    const voice = this.startClip(`${character}:${language}`, this.voiceDelay(character));
    const recordingStatus = voice ? this.getVoiceStatus(character) : null;
    const voiceDone = voice
      ? voice.finished.then(reason => ({ ...recordingStatus, reason }))
      : this.buffers[`${character}:${language}`]
        ? Promise.resolve({ source: 'unavailable', reason: this.ctx?.state === 'running' ? 'clip-start-failed' : 'audio-context-unavailable', language })
      : this.scheduleSpeech(character, revision, language);
    const effect = this.startClip('transform');
    if (!effect) {
      [523.25, 659.25, 783.99, 1046.5, 987.77, 1174.66, 1318.5, 1568, 1318.5, 1760, 2093]
        .forEach((f, i) => this.tone(f, i * .245, .9, .21));
      [523.25, 659.25, 783.99].forEach(f => this.tone(f, 2.95, 1.2, .12));
    }
    const [status] = await Promise.all([voiceDone, effect?.finished]);
    this.lastVoiceStatus = status;
    return status;
  }

  capture() { [1046.5, 1318.5, 2093].forEach((f, i) => this.tone(f, i * .08, .75, .18)); }
  click() { if (this.playClip('click')) return; [1318.5, 1760, 2093].forEach((f, i) => this.tone(f, i * .055, .45, .16)); }

  stop() {
    ++this.playbackRevision;
    this.cancelOwnedSpeech();
    for (const job of [...this.speechJobs]) job.finish({ source: 'muted', reason: 'cancelled', language: this.language });
    for (const node of this.nodes) {
      // Settle before stop; some implementations dispatch onended immediately.
      this.clipFinishes.get(node)?.('cancelled');
      try { node.stop(); } catch {}
      try { node.disconnect(); } catch {}
    }
    this.nodes.clear();
    this.clipFinishes.clear();
  }

  dispose() {
    this.stop();
    this.disposed = true;
    ++this.audioRevision;
    this.buffers = {};
    try { this.ctx?.close()?.catch(() => {}); } catch {}
  }
}
