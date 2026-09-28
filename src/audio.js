import { VOICE_PROFILES, selectVoice } from './voice-profiles.js';
import { BUNDLED_VOICES } from './bundled-voices.js';

export const MAX_CLIP_BYTES = 700 * 1024;
export const MAX_CLIP_SECONDS = 15;
export const MIN_TRANSFORM_SECONDS = 10;
export const VOICE_DELAY_SECONDS = 1.2;
// Start the spoken spell with the transformation, before the first costume
// change. Waiting for the final reveal made the opening sound voice-less.
export const REFERENCE_VOICE_DELAY_SECONDS = VOICE_DELAY_SECONDS;
const SPEECH_TIMEOUT_MS = 20000;
const CHARACTERS = Object.keys(VOICE_PROFILES);
const CLIP_KEYS = ['click', 'scroll', 'transform', ...CHARACTERS.flatMap(id => [`${id}:ko`, `${id}:ja`])];
const CHANNELS = ['clickSound', 'scrollSound', 'spellVoice', 'transformSound'];
const clipChannel = key => ({ click: 'clickSound', scroll: 'scrollSound', transform: 'transformSound' })[key] || 'spellVoice';

/** Synchronous UI copy; an imported file is never assumed to be an original recording. */
export function describeVoiceStatus(status, locale = 'ko') {
  const japanese = locale === 'ja';
  const language = status?.language === 'ja' ? (japanese ? '日本語' : '일본어') : (japanese ? '韓国語' : '한국어');
  const reason = status?.reason;
  if (reason === 'cancelled' || status?.source === 'muted') return japanese ? '音声は停止しています。' : '음성이 꺼져 있어요.';
  if (reason === 'language-fallback-disabled') return japanese ? `${language}の録音なし・別言語への自動切替はオフ` : `${language} 녹음 없음 · 다른 언어 자동 대체 꺼짐`;
  if (reason === 'fallback-disabled') return japanese ? `${language}の登録音声なし・システム試聴はオフ` : `${language} 녹음 없음 · 시스템 시연 음성 꺼짐`;
  if (reason === 'language-voice-unavailable') return japanese ? `${language}のシステム音声がありません。録音を登録してください。` : `${language} 시스템 음성이 없어요. 해당 언어의 음성을 설치하거나 녹음을 등록해 주세요.`;
  if (reason === 'speech-busy') return japanese ? 'ほかの音声が再生中のため、今回の試聴を省略しました。' : '다른 음성이 재생 중이라 이번 시연 음성을 건너뛰었어요.';
  if (reason === 'audio-context-unavailable' || reason === 'speech-not-allowed') return japanese ? 'ブラウザーが音声をブロックしました。ページをクリックして再試行してください。' : '브라우저가 소리를 막았어요. 페이지를 클릭한 뒤 다시 변신해 주세요.';
  if (reason === 'speech-api-unavailable') return japanese ? 'このブラウザーではシステム音声を利用できません。録音を登録してください。' : '이 브라우저에서는 시스템 음성을 사용할 수 없어요. 녹음을 등록해 주세요.';
  if (reason === 'recording-loading') return japanese ? `${language}の登録音声を準備中…` : `${language} 등록 음성을 준비하고 있어요…`;
  if (reason === 'speech-timeout' || reason === 'clip-timeout') return japanese ? '音声の終了を確認できなかったため、再生を停止しました。' : '음성 종료를 확인하지 못해 재생을 중단했어요.';
  if (reason) return japanese ? '音声を再生できませんでした。録音とブラウザーの設定を確認してください。' : '음성을 재생하지 못했어요. 등록 파일과 브라우저 소리 설정을 확인해 주세요.';
  if (status?.source === 'recording') {
    if (status.languageFallback) {
      const requested = status.requestedLanguage === 'ja' ? (japanese ? '日本語' : '일본어') : (japanese ? '韓国語' : '한국어');
      const kind = status.origin === 'reference-excerpt' ? (japanese ? '参考動画の原音' : '참고 영상 원음') : (japanese ? '登録音声' : '등록 음성');
      return japanese ? `${requested}の録音がないため、このキャラクターの${language}の${kind}を使用` : `${requested} 녹음이 없어 같은 캐릭터의 ${language} ${kind} 사용`;
    }
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

/** Prefer the requested language; optionally use only the same character's alternate. */
export function resolveVoiceClip(clips, character = 'remi', requestedLanguage = 'ko', { languageFallback = true } = {}) {
  const requested = requestedLanguage === 'ja' ? 'ja' : 'ko';
  if (!CHARACTERS.includes(character)) return null;
  const languages = languageFallback ? [requested, requested === 'ko' ? 'ja' : 'ko'] : [requested];
  for (const language of languages) {
    const key = `${character}:${language}`;
    let clip = clips?.[key];
    // Also support raw stored imports merged with built-ins by the settings UI.
    // An explicit user-language slot still takes precedence over a legacy alias.
    const legacy = language === 'ko' ? clips?.[character] : null;
    if (legacy?.data && (!clip?.data || clip.origin === 'reference-excerpt')) clip = legacy;
    if (clip?.data) return { key, clip, requestedLanguage: requested, language, languageFallback: language !== requested };
  }
  return null;
}

export class MagicAudio {
  constructor({ bundledClips = BUNDLED_VOICES } = {}) {
    this.sound = true;
    for (const channel of CHANNELS) this[channel] = true;
    this.volume = .22;
    this.language = 'ko';
    this.voiceFallback = false;
    this.languageFallback = true;
    this.nodes = new Set();
    this.nodeChannels = new Map();
    this.nodeCleanups = new Map();
    this.channelRevisions = Object.fromEntries(CHANNELS.map(channel => [channel, 0]));
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

  configure({ sound = this.sound, volume = this.volume, language = this.language, voiceFallback = this.voiceFallback, languageFallback = this.languageFallback, ...channels } = {}) {
    const nextLanguage = language === 'ja' ? 'ja' : 'ko';
    const nextLanguageFallback = typeof languageFallback === 'boolean' ? languageFallback : this.languageFallback;
    if (!sound || nextLanguage !== this.language || (!voiceFallback && this.voiceFallback) || nextLanguageFallback !== this.languageFallback) this.stop();
    this.sound = Boolean(sound);
    this.volume = Number.isFinite(Number(volume)) ? Math.max(0, Math.min(.5, Number(volume))) : .22;
    this.language = nextLanguage;
    this.voiceFallback = Boolean(voiceFallback);
    this.languageFallback = nextLanguageFallback;
    for (const channel of CHANNELS) {
      if (typeof channels[channel] !== 'boolean') continue;
      if (this[channel] && !channels[channel]) this.stopChannel(channel);
      this[channel] = channels[channel];
    }
    if (this.master) this.master.gain.value = this.volume;
    if (this.activeSpeech) this.activeSpeech.utterance.volume = this.volume;
  }

  async unlock() {
    if (!this.sound || this.disposed) return;
    try {
      // Trigger asynchronous OS voice discovery before the delayed phrase begins.
      if (this.spellVoice && this.voiceFallback) globalThis.window?.speechSynthesis?.getVoices();
      if (!this.ctx) {
        const Audio = globalThis.window?.AudioContext || globalThis.window?.webkitAudioContext;
        if (!Audio) return;
        this.ctx = new Audio();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(this.ctx.destination);
        this.setClips(this.userClipData);
      }
      // The pointer gesture already unlocks this context before image loading.
      // Do not issue another resume after that asynchronous loading boundary.
      const resume = this.ctx.state === 'running' ? null : this.ctx.resume?.();
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

  startClip(key, delay = 0, channel = clipChannel(key)) {
    const buffer = this.buffers[key];
    if (!buffer || !this.sound || !this[channel] || this.disposed || this.ctx?.state !== 'running') return null;
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
      this.nodeChannels.delete(source);
      this.clipFinishes.delete(source);
      try { source.disconnect(); } catch {}
      finish(reason);
    };
    const timeout = setTimeout(() => {
      settle('clip-timeout');
      try { source.stop(); } catch {}
    }, (delay + buffer.duration + 2) * 1000);
    this.nodes.add(source);
    this.nodeChannels.set(source, channel);
    this.clipFinishes.set(source, settle);
    source.onended = () => settle(null);
    try { source.start(this.ctx.currentTime + delay); }
    catch { settle('clip-start-failed'); return null; }
    return { source, finished };
  }

  playClip(key, delay = 0) { return Boolean(this.startClip(key, delay)); }

  voiceDelay(character = 'remi') {
    return resolveVoiceClip(this.clipData, character, this.language, this)?.clip.origin === 'reference-excerpt'
      ? REFERENCE_VOICE_DELAY_SECONDS : VOICE_DELAY_SECONDS;
  }

  duration(character = 'remi') {
    const recording = resolveVoiceClip(this.clipData, character, this.language, this);
    return Math.max(MIN_TRANSFORM_SECONDS, this.sound && this.spellVoice ? (this.buffers[recording?.key || `${character}:${this.language}`]?.duration || 0) + this.voiceDelay(character) : 0,
      this.sound && this.transformSound ? this.buffers.transform?.duration || 0 : 0);
  }

  getVoiceStatus(character = 'remi') {
    const language = this.language;
    if (!this.sound || this.disposed) return { source: 'muted', reason: this.disposed ? 'disposed' : 'sound-disabled', language };
    if (!this.spellVoice) return { source: 'muted', reason: 'voice-disabled', language };
    const recording = resolveVoiceClip(this.clipData, character, language, this);
    if (this.buffers[recording?.key || `${character}:${language}`]) {
      const clip = recording?.clip;
      return { source: 'recording', reason: null, language: recording?.language || language, requestedLanguage: language, languageFallback: recording?.languageFallback || false, ...(clip ? { origin: clip.origin, name: clip.name, sourceVideo: clip.sourceVideo, sourceStart: clip.sourceStart, sourceEnd: clip.sourceEnd } : {}) };
    }
    if (!this.voiceFallback) {
      const alternate = !this.languageFallback && resolveVoiceClip(this.clipData, character, language);
      if (alternate?.languageFallback) return { source: 'unavailable', reason: 'language-fallback-disabled', language, requestedLanguage: language, availableLanguage: alternate.language };
      return { source: 'unavailable', reason: 'fallback-disabled', language };
    }
    const synthesis = globalThis.window?.speechSynthesis;
    if (!synthesis || !globalThis.window?.SpeechSynthesisUtterance) return { source: 'unavailable', reason: 'speech-api-unavailable', language };
    const voice = selectVoice(synthesis, language, character);
    if (!voice) return { source: 'unavailable', reason: 'language-voice-unavailable', language };
    return { source: 'system', reason: null, language, voiceName: voice.name };
  }

  getVoiceStatusText(character = 'remi', locale = 'ko') {
    const recording = resolveVoiceClip(this.clipData, character, this.language, this);
    if (this.sound && this.spellVoice && !this.disposed && !this.ctx && recording) {
      return describeVoiceStatus({ source: 'recording', reason: 'recording-loading', language: recording.language }, locale);
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

  tone(frequency, delay = 0, length = .65, gain = .25, channel = 'transformSound') {
    if (!this.sound || !this[channel] || this.disposed || this.ctx?.state !== 'running') return;
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
      this.nodeChannels.set(osc, channel);
      const cleanup = () => {
        this.nodes.delete(osc); this.nodeChannels.delete(osc); this.nodeCleanups.delete(osc);
        try { osc.disconnect(); env.disconnect(); } catch {}
      };
      this.nodeCleanups.set(osc, cleanup);
      osc.onended = cleanup;
    }
  }

  scroll(direction) {
    if (!this.sound || !this.scrollSound || this.disposed || this.ctx?.state !== 'running') return;
    const now = performance.now();
    if (now - this.lastScroll < Math.max(140, (this.buffers.scroll?.duration || 0) * 1000)) return;
    this.lastScroll = now;
    if (this.playClip('scroll')) return;
    const notes = direction > 0 ? [1046.5, 1318.5, 1568] : [1568, 1318.5, 1046.5];
    notes.forEach((f, i) => this.tone(f, i * .045, .38, .15, 'scrollSound'));
  }

  async transform(character = 'remi') {
    const revision = this.playbackRevision;
    const language = this.language;
    const voiceRevision = this.channelRevisions.spellVoice;
    const effectRevision = this.channelRevisions.transformSound;
    await this.unlock();
    if (revision !== this.playbackRevision || !this.sound || this.disposed) return { source: 'muted', reason: 'cancelled', language };
    const recording = resolveVoiceClip(this.clipData, character, language, this);
    const key = recording?.key || `${character}:${language}`;
    const voiceEnabled = this.spellVoice && voiceRevision === this.channelRevisions.spellVoice;
    const effectEnabled = this.transformSound && effectRevision === this.channelRevisions.transformSound;
    const voice = voiceEnabled ? this.startClip(key, this.voiceDelay(character)) : null;
    const recordingStatus = voice ? this.getVoiceStatus(character) : null;
    const voiceDone = !voiceEnabled
      ? Promise.resolve({ source: 'muted', reason: 'voice-disabled', language })
      : voice
      ? voice.finished.then(reason => reason === 'voice-disabled' ? { source: 'muted', reason, language } : ({ ...recordingStatus, reason }))
      : this.buffers[key]
        ? Promise.resolve({ source: 'unavailable', reason: this.ctx?.state === 'running' ? 'clip-start-failed' : 'audio-context-unavailable', language: recording?.language || language, requestedLanguage: language, languageFallback: recording?.languageFallback || false })
      : this.scheduleSpeech(character, revision, language);
    const effect = effectEnabled ? this.startClip('transform') : null;
    if (effectEnabled && !effect) {
      [523.25, 659.25, 783.99, 1046.5, 987.77, 1174.66, 1318.5, 1568, 1318.5, 1760, 2093]
        .forEach((f, i) => this.tone(f, i * .245, .9, .21));
      [523.25, 659.25, 783.99].forEach(f => this.tone(f, 2.95, 1.2, .12));
    }
    const [status] = await Promise.all([voiceDone, effect?.finished]);
    this.lastVoiceStatus = status;
    return status;
  }

  capture() { if (!this.transformSound) return; [1046.5, 1318.5, 2093].forEach((f, i) => this.tone(f, i * .08, .75, .18)); }
  click() { if (!this.clickSound) return; if (this.playClip('click')) return; [1318.5, 1760, 2093].forEach((f, i) => this.tone(f, i * .055, .45, .16, 'clickSound')); }

  stopChannel(channel) {
    if (!CHANNELS.includes(channel)) return;
    ++this.channelRevisions[channel];
    const reason = channel === 'spellVoice' ? 'voice-disabled' : 'channel-disabled';
    if (channel === 'spellVoice') {
      this.cancelOwnedSpeech();
      for (const job of [...this.speechJobs]) job.finish({ source: 'muted', reason, language: this.language });
    }
    for (const node of [...this.nodes]) {
      if (this.nodeChannels.get(node) !== channel) continue;
      this.clipFinishes.get(node)?.(reason);
      try { node.stop(); } catch {}
      this.nodeCleanups.get(node)?.();
      try { node.disconnect(); } catch {}
      this.nodes.delete(node); this.nodeChannels.delete(node);
    }
  }

  stop() {
    ++this.playbackRevision;
    this.cancelOwnedSpeech();
    for (const job of [...this.speechJobs]) job.finish({ source: 'muted', reason: 'cancelled', language: this.language });
    for (const node of [...this.nodes]) {
      // Settle before stop; some implementations dispatch onended immediately.
      this.clipFinishes.get(node)?.('cancelled');
      try { node.stop(); } catch {}
      this.nodeCleanups.get(node)?.();
      try { node.disconnect(); } catch {}
    }
    this.nodes.clear();
    this.clipFinishes.clear();
    this.nodeChannels.clear();
    this.nodeCleanups.clear();
  }

  dispose() {
    this.stop();
    this.disposed = true;
    ++this.audioRevision;
    this.buffers = {};
    try { this.ctx?.close()?.catch(() => {}); } catch {}
  }
}
