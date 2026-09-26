/**
 * User-supplied originals remain archived unchanged. Four transformed sprites
 * use separately saved transparent cutouts so white backgrounds never cover
 * the scene. Motion belongs to the scene, without deforming the character.
 */
export const CHARACTER_IDS = Object.freeze(['remi', 'hazuki', 'aiko', 'onpu', 'momoko']);

function character(id, name, nameJa, color, darkColor, lightColor) {
  return Object.freeze({ id, name, nameJa, color, darkColor, lightColor, casualAsset: `${id}-casual.png`, originalTransformedAsset: `${id}-transformed.png`, transformedAsset: `${id}-transformed${id === 'remi' ? '' : '-cutout'}.png` });
}

export const CHARACTERS = Object.freeze({
  remi: character('remi', '도레미', '春風どれみ', '#f26097', '#bb366b', '#ffd1e2'),
  hazuki: character('hazuki', '장메이', '藤原はづき', '#f2a24e', '#c77138', '#ffe2ae'),
  aiko: character('aiko', '유사랑', '妹尾あいこ', '#54b9ee', '#2679bb', '#c7edff'),
  onpu: character('onpu', '진보라', '瀬川おんぷ', '#a16cd6', '#7544a7', '#e8d3ff'),
  momoko: character('momoko', '나모모', '飛鳥ももこ', '#f2cd4e', '#bc9334', '#fff4ba'),
});

export function getCharacter(id) { return CHARACTERS[id === 'doremi' ? 'remi' : id] || CHARACTERS.remi; }

const collections = new Map();
const clamp = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const normalizeOutfit = outfit => outfit === 'casual' ? 'casual' : 'transformed';

/** Resolve both browser-page and extension-resource paths to one cache key. */
export function characterAssetBase(assetBase = 'assets/') {
  const pageBase = globalThis.document?.baseURI || globalThis.location?.href || 'http://localhost/';
  const url = new URL(String(assetBase || 'assets/'), pageBase);
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  url.hash = '';
  return url.href;
}

export function characterAssetUrl(id, { outfit = 'casual', assetBase = 'assets/' } = {}) {
  const selected = getCharacter(id);
  return new URL(normalizeOutfit(outfit) === 'casual' ? selected.casualAsset : selected.transformedAsset, characterAssetBase(assetBase)).href;
}

/** Legacy name retained for existing callers; returns an original PNG URL. */
export function characterDataUrl(id, { outfit = 'transformed', assetBase = 'assets/' } = {}) {
  return characterAssetUrl(id, { outfit, assetBase });
}

function loadImage(url, ImageCtor) {
  return new Promise((resolve, reject) => {
    const image = new ImageCtor();
    let settled = false;
    const fail = cause => {
      if (settled) return;
      settled = true; image.onload = null; image.onerror = null;
      reject(new Error(`캐릭터 원본 이미지를 불러오지 못했어요: ${url}`, { cause }));
    };
    // Local Electron files do not provide HTTP CORS headers. Request anonymous
    // CORS for web/extension resources, but use normal local loading for file:.
    if (new URL(url).protocol !== 'file:') image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = async () => {
      try {
        if (typeof image.decode === 'function') await image.decode();
        if (!image.naturalWidth || !image.naturalHeight) throw new Error('The PNG has no decoded dimensions.');
        if (settled) return;
        settled = true; image.onload = null; image.onerror = null; resolve(image);
      } catch (error) { fail(error); }
    };
    image.onerror = fail;
    image.src = url;
  });
}

/**
 * Resolves only when all ten originals have decoded. Failed loads reject and can
 * be retried; callers should display the error before starting the animation.
 * ImageCtor is injectable for deterministic loading tests.
 */
export function preloadCharacterAssets(assetBase = 'assets/', { ImageCtor = globalThis.Image } = {}) {
  const base = characterAssetBase(assetBase);
  const cached = collections.get(base);
  if (cached) return cached.ready;
  if (typeof ImageCtor !== 'function') return Promise.reject(new Error('이 환경에서는 캐릭터 PNG를 읽을 Image API를 사용할 수 없어요.'));
  const collection = { images: new Map(), status: 'loading', ready: null };
  collections.set(base, collection);
  const jobs = CHARACTER_IDS.flatMap(id => ['casual', 'transformed'].map(outfit =>
    loadImage(characterAssetUrl(id, { outfit, assetBase: base }), ImageCtor).then(image => {
      collection.images.set(`${id}:${outfit}`, image);
    })
  ));
  collection.ready = Promise.all(jobs).then(() => { collection.status = 'ready'; return collection; }).catch(error => {
    if (collections.get(base) === collection) collections.delete(base);
    throw error;
  });
  return collection.ready;
}

export function characterImageFor(id, outfit = 'transformed', assetBase = 'assets/') {
  const collection = collections.get(characterAssetBase(assetBase));
  if (collection?.status !== 'ready') return null;
  return collection.images.get(`${getCharacter(id).id}:${normalizeOutfit(outfit)}`) || null;
}

/** The complete source image fits inside the box, preserving its aspect ratio. */
export function fitCharacterArt({ naturalWidth, naturalHeight, x = 0, y = 0, scale = 1, maxWidth = 240 * scale } = {}) {
  if (![naturalWidth, naturalHeight, scale, maxWidth].every(value => Number.isFinite(value) && value > 0) || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const ratio = Math.min(300 * scale / naturalHeight, maxWidth / naturalWidth);
  const width = naturalWidth * ratio, height = naturalHeight * ratio, baseline = y + 135 * scale;
  return { x: x - width / 2, y: baseline - height, width, height, baseline };
}

/**
 * Draws the exact PNG synchronously after preload, with optional whole-image
 * crossfade. Deliberately ignores old limb/pose/facing arguments: original art
 * must not be redrawn or distorted. Returns false if assets are not ready.
 */
export function drawCharacter(ctx, id, options = {}) {
  if (!ctx) return false;
  const assetBase = options.assetBase || 'assets/';
  const layers = Number.isFinite(options.transformMix)
    ? [['casual', 1 - clamp(options.transformMix)], ['transformed', clamp(options.transformMix)]]
    : [[normalizeOutfit(options.outfit), 1]];
  const draws = layers.filter(([, alpha]) => alpha > 0).map(([outfit, alpha]) => {
    const image = characterImageFor(id, outfit, assetBase);
    if (!image) return null;
    const fitted = fitCharacterArt({ naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, x: options.x ?? (ctx.canvas?.width || 0) / 2, y: options.y ?? (ctx.canvas?.height || 0) * .59, scale: options.scale ?? 1, maxWidth: options.maxWidth ?? 240 * (options.scale ?? 1) });
    return fitted ? { image, alpha, fitted } : null;
  });
  if (draws.some(item => !item)) return false;
  for (const { image, alpha, fitted } of draws) {
    ctx.save();
    ctx.globalAlpha *= alpha * (Number.isFinite(options.opacity) ? clamp(options.opacity) : 1);
    ctx.drawImage(image, fitted.x, fitted.y, fitted.width, fitted.height);
    ctx.restore();
  }
  return true;
}

/** Optional instance facade to bind a single asset directory for a scene. */
export function createCharacterArt(assetBase = 'assets/', options = {}) {
  const base = characterAssetBase(assetBase);
  let disposed = false;
  return {
    assetBase: base,
    ready: preloadCharacterAssets(base, options),
    imageFor(id, outfit = 'transformed') { return disposed ? null : characterImageFor(id, outfit, base); },
    draw(ctx, id, drawOptions = {}) { return !disposed && drawCharacter(ctx, id, { ...drawOptions, assetBase: base }); },
    dispose() { disposed = true; },
  };
}
