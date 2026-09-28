import { CHARACTER_IDS, getCharacter, drawCharacter, preloadCharacterAssets } from '../src/characters.js';
import { MagicAudio } from '../src/audio.js';
import { sampleTransformation } from '../src/transformation.js';
import { scenePose } from './scheduler.mjs';

const canvas = document.querySelector('#stage');
const context = canvas.getContext('2d');
const audio = new MagicAudio();
let active = null;
let frame = 0;
let startTime = 0;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const assetBase = new URL('assets/', document.baseURI).href;
const artworkReady = preloadCharacterAssets(assetBase).then(() => {
  canvas.dataset.artworkReady = 'true';
}).catch((error) => {
  canvas.dataset.artworkError = error.message;
  console.error('사용자가 제공한 원본 캐릭터 이미지를 불러오지 못했습니다:', error.message);
  throw error;
});
// An image error is reported in the canvas and console; never substitute artwork.
artworkReady.catch(() => {});

function resize() {
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(innerWidth * pixelRatio);
  canvas.height = Math.round(innerHeight * pixelRatio);
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
}
window.addEventListener('resize', resize);
resize();

function star(x, y, radius, rotation, color, opacity) {
  context.save(); context.translate(x, y); context.rotate(rotation); context.globalAlpha = opacity;
  context.fillStyle = color; context.beginPath();
  for (let point = 0; point < 8; point++) {
    const angle = point * Math.PI / 4;
    const r = point % 2 ? radius * 0.22 : radius;
    const px = Math.cos(angle) * r, py = Math.sin(angle) * r;
    if (point === 0) context.moveTo(px, py); else context.lineTo(px, py);
  }
  context.closePath(); context.fill(); context.restore();
}

function drawRing(x, y, radius, seconds, color, opacity) {
  context.save(); context.globalAlpha = opacity * 0.55; context.strokeStyle = color; context.lineWidth = 2;
  context.beginPath(); context.ellipse(x, y, radius, radius * 0.24, 0, 0, Math.PI * 2); context.stroke();
  context.setLineDash([5, 9]); context.lineDashOffset = -seconds * 15;
  context.beginPath(); context.ellipse(x, y, radius * 0.88, radius * 0.19, 0, 0, Math.PI * 2); context.stroke();
  context.restore();
}

function paint(time) {
  if (!active) return;
  const seconds = Math.max(0, (time - startTime) / 1000);
  const reducedMotion = active.settings.reducedMotion || prefersReducedMotion.matches;
  const ids = active.mode === 'group' ? CHARACTER_IDS : [active.character];
  context.clearRect(0, 0, innerWidth, innerHeight);
  for (let index = 0; index < ids.length; index++) {
    const id = ids[index];
    const meta = getCharacter(id);
    const state = scenePose({ width: innerWidth, height: innerHeight, elapsed: seconds, index, count: ids.length, mode: active.mode, reducedMotion });
    const color = meta.color || meta.primary || ['#ed5e9d', '#56b9e8', '#ffb749', '#a27adb', '#ffdc54'][index];
    const transformation = sampleTransformation(seconds, 10, { character: id, reducedMotion });
    const spell = active.mode === 'group' && seconds >= 4 && seconds <= 16;
    if (spell || active.mode === 'transform') drawRing(state.x, innerHeight - 19, 93 * state.scale, reducedMotion ? 0 : seconds, color, state.opacity);
    context.save(); context.globalAlpha = state.opacity;
    // Draw the supplied original PNGs without rigging, cropping, flipping, or recoloring.
    const transforming = active.mode === 'transform' && !transformation.done;
    drawCharacter(context, id, {
      x: state.x, y: state.y, scale: state.scale, assetBase,
      outfit: active.mode === 'walk' ? 'casual' : 'transformed',
      ...(active.mode === 'transform' ? { transformMix: transformation.artworkMix } : {}),
    });
    if (active.mode === 'transform' && transformation.flash > 0) {
      context.save();
      context.globalAlpha *= transformation.flash;
      const centerY = state.y - 15 * state.scale;
      const light = context.createRadialGradient(state.x, centerY, 12, state.x, centerY, 190 * state.scale);
      light.addColorStop(0, '#ffffff'); light.addColorStop(0.65, '#fff5df'); light.addColorStop(1, '#fff5df00');
      context.fillStyle = light;
      context.fillRect(state.x - 190 * state.scale, centerY - 190 * state.scale, 380 * state.scale, 380 * state.scale);
      context.restore();
    }
    context.restore();
    if (!reducedMotion && (spell || transforming)) {
      for (let sparkle = 0; sparkle < 9; sparkle++) {
        const angle = seconds * 0.85 + sparkle * 2.4;
        const radius = (45 + sparkle * 6) * state.scale;
        const sparkleY = state.y - 35 - ((seconds * 32 + sparkle * 31) % (170 * state.scale));
        star(state.x + Math.sin(angle) * radius, sparkleY, (3 + sparkle % 3) * state.scale, angle, sparkle % 2 ? '#fff1a0' : color, state.opacity * 0.8);
      }
    }
  }
  // Shared rising gold spiral during the five-person spell (a fan-made approximation).
  if (active.mode === 'group' && !reducedMotion && seconds >= 4 && seconds <= 16) {
    const opacity = Math.min(1, seconds - 4, 16 - seconds) * 0.8;
    const center = innerWidth / 2;
    const rise = Math.min(310, innerHeight * 0.5);
    for (let point = 0; point < 45; point++) {
      const progress = ((point / 45 + (seconds - 4) * 0.085) % 1);
      const angle = progress * Math.PI * 7 + seconds * 0.4;
      const radius = Math.min(innerWidth * 0.28, 200) * (1 - progress * 0.65);
      star(center + Math.cos(angle) * radius, innerHeight - 34 - progress * rise, 2 + Math.sin(point) ** 2 * 2.5, angle, '#ffe390', opacity * (1 - progress * 0.65));
    }
  }
  if (seconds < active.duration / 1000 + 0.2) frame = requestAnimationFrame(paint);
}

window.companion.onScene(async (scene) => {
  cancelAnimationFrame(frame);
  audio.stop();
  active = scene;
  context.clearRect(0, 0, innerWidth, innerHeight);
  if (!scene) return;
  try { await artworkReady; }
  catch {
    if (active?.id === scene.id) {
      context.font = '14px sans-serif'; context.fillStyle = '#a82866';
      context.fillText('원본 캐릭터 이미지를 불러올 수 없습니다. assets 폴더를 확인해 주세요.', 24, innerHeight - 32);
    }
    return;
  }
  if (active?.id !== scene.id) return;
  startTime = performance.now();
  audio.configure({ sound: scene.settings.sound, volume: scene.settings.volume * 0.5, language: scene.settings.language, languageFallback: scene.settings.languageFallback, voiceFallback: false });
  frame = requestAnimationFrame(paint);
  if (scene.settings.sound && ['group', 'transform'].includes(scene.mode)) {
    await audio.unlock();
    if (active?.id !== scene.id) return;
    Promise.resolve(audio.transform(scene.character)).catch((error) => console.warn('음성을 재생하지 못했습니다:', error.message));
  }
});
window.addEventListener('beforeunload', () => { cancelAnimationFrame(frame); audio.dispose(); });
