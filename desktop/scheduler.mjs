export const CHARACTER_IDS = Object.freeze(['remi', 'hazuki', 'aiko', 'onpu', 'momoko']);
export const FREQUENCIES = Object.freeze({
  often: { min: 30_000, max: 60_000 },
  normal: { min: 60_000, max: 180_000 },
  quiet: { min: 180_000, max: 360_000 },
});
export const DEFAULT_SETTINGS = Object.freeze({
  enabled: true, frequency: 'normal', character: 'random', language: 'ko',
  reducedMotion: false, sound: false, volume: 0.4,
});

export function validateSettings(input = {}) {
  const value = input && typeof input === 'object' ? input : {};
  return {
    enabled: typeof value.enabled === 'boolean' ? value.enabled : DEFAULT_SETTINGS.enabled,
    frequency: Object.hasOwn(FREQUENCIES, value.frequency) ? value.frequency : DEFAULT_SETTINGS.frequency,
    character: CHARACTER_IDS.includes(value.character) ? value.character : 'random',
    language: value.language === 'ja' ? 'ja' : 'ko',
    reducedMotion: value.reducedMotion === true,
    sound: value.sound === true,
    volume: Number.isFinite(value.volume) ? Math.min(1, Math.max(0, value.volume)) : DEFAULT_SETTINGS.volume,
  };
}

export function nextDelay(frequency = 'normal', random = Math.random) {
  const { min, max } = FREQUENCIES[frequency] || FREQUENCIES.normal;
  return Math.round(min + Math.max(0, Math.min(1, random())) * (max - min));
}

/** Window bounds use device-independent pixels, including negative monitor positions. */
export function workAreaBounds(display) {
  const a = display.workArea;
  return { x: Math.round(a.x), y: Math.round(a.y), width: Math.max(1, Math.round(a.width)), height: Math.max(1, Math.round(a.height)) };
}

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

/** Position of an unchanged original image in a 20-second desktop scene. */
export function scenePose({ width, height, elapsed, index = 0, count = 1, mode = 'walk', reducedMotion = false }) {
  const scale = Math.max(0.01, Math.min(0.68, width / (Math.max(1, count) * 220), height / 350));
  const margin = Math.min(width / 2, 140 * scale + 8);
  const left = margin, right = Math.max(left, width - margin), span = Math.max(1, right - left);
  const groupSpan = Math.min(right - left, 800);
  const target = count === 1 ? width / 2 : (width - groupSpan) / 2 + groupSpan * index / Math.max(1, count - 1);
  let x = target, facing = 1, pose = 'idle';
  if (!reducedMotion && mode === 'walk') {
    const travel = elapsed * 55 + span * 0.28;
    const phase = ((travel % (span * 2)) + span * 2) % (span * 2);
    x = left + (phase < span ? phase : span * 2 - phase);
    facing = phase < span ? 1 : -1;
    pose = 'walk';
  } else if (!reducedMotion && mode === 'group') {
    const entry = index % 2 ? right : left;
    const enterProgress = clamp(elapsed / 4, 0, 1);
    const leaveProgress = clamp((elapsed - 16) / 4, 0, 1);
    x = entry + (target - entry) * enterProgress + (entry - target) * leaveProgress;
    facing = elapsed >= 16 ? (entry > target ? 1 : -1) : (target > entry ? 1 : -1);
    pose = elapsed < 4 || elapsed > 16 ? 'walk' : 'spell';
  } else if (mode === 'group') {
    pose = 'spell';
  } else if (mode === 'transform') {
    pose = 'transform';
  }
  const opacity = clamp(elapsed / 0.6, 0, 1) * clamp((20 - elapsed) / 0.8, 0, 1);
  const bob = !reducedMotion && pose === 'walk' ? -Math.abs(Math.sin(elapsed * 5 + index)) * 3 * scale : 0;
  return { x: clamp(x, left, right), y: Math.max(165 * scale, height - 18 - 135 * scale) + bob, scale, facing, pose, opacity };
}

/** Cancellable scheduler: only one appearance and one next-appearance timer at a time. */
export class CompanionScheduler {
  constructor({ settings = {}, random = Math.random, setTimer = setTimeout, clearTimer = clearTimeout, onStart = () => {}, onEnd = () => {} } = {}) {
    this.settings = validateSettings(settings);
    this.random = random;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.onStart = onStart;
    this.onEnd = onEnd;
    this.nextTimer = null;
    this.endTimer = null;
    this.active = null;
    this.suspended = false;
    this.destroyed = false;
    this.sequence = 0;
  }
  start() { this.schedule(); }
  schedule() {
    this.cancelNext();
    if (this.destroyed || this.suspended || !this.settings.enabled || this.active) return;
    this.nextTimer = this.setTimer(() => {
      this.nextTimer = null;
      this.show(this.random() < 0.25 ? 'group' : 'walk');
    }, nextDelay(this.settings.frequency, this.random));
  }
  cancelNext() {
    if (this.nextTimer !== null) this.clearTimer(this.nextTimer);
    this.nextTimer = null;
  }
  stopScene(reason = 'finished') {
    if (this.endTimer !== null) this.clearTimer(this.endTimer);
    this.endTimer = null;
    if (this.active) this.onEnd({ ...this.active, reason });
    this.active = null;
  }
  show(mode = 'walk') {
    if (this.destroyed || this.suspended) return;
    this.cancelNext();
    this.stopScene('replaced');
    const safeMode = ['walk', 'group', 'transform'].includes(mode) ? mode : 'walk';
    const character = this.settings.character === 'random'
      ? CHARACTER_IDS[Math.min(CHARACTER_IDS.length - 1, Math.floor(Math.max(0, this.random()) * CHARACTER_IDS.length))]
      : this.settings.character;
    this.active = { id: ++this.sequence, mode: safeMode, character, duration: 20_000, settings: { ...this.settings } };
    this.onStart(this.active);
    this.endTimer = this.setTimer(() => { this.stopScene(); this.schedule(); }, 20_000);
  }
  update(settings) {
    this.settings = validateSettings({ ...this.settings, ...settings });
    this.cancelNext();
    this.stopScene('settings-changed');
    this.schedule();
  }
  suspend() { this.suspended = true; this.cancelNext(); this.stopScene('suspended'); }
  resume() { this.suspended = false; this.schedule(); }
  destroy() { this.destroyed = true; this.cancelNext(); this.stopScene('quit'); }
}
