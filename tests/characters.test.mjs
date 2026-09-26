import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { CHARACTER_IDS, CHARACTERS, getCharacter, characterAssetUrl, characterDataUrl, preloadCharacterAssets, characterImageFor, fitCharacterArt, drawCharacter, createCharacterArt } from '../src/characters.js';

const ORIGINALS = {
  'remi-casual.png': [170461, 'be9125c3d80de7111a46c1b24f4973e0d6ae29a29d1191ebf23884d3decb33ba'],
  'remi-transformed.png': [686691, '143bc4394960e0d5c82d16c3febedd4194a4c64f1fa6e6ba2ddadaa11908e48f'],
  'hazuki-casual.png': [129721, '22205e1607d032026ccbcb888eef7b935659e38984568a72119bd829649dbc35'],
  'hazuki-transformed.png': [171168, '876af2407f4fa763b7992629b99c0d162fd4f024418d2abee8ebb7a161ea341b'],
  'aiko-casual.png': [118277, 'c3f0940ecfbc239d1d0cb5d640c04b152036a18f85f03fd0de4e5e451ed8c343'],
  'aiko-transformed.png': [156665, 'fec60677a5882afc2b057d368afbcd04952c57b307bf4c400607001b14bc35bf'],
  'onpu-casual.png': [110856, 'dfaba71fa2c61b84421f7d34549b6b51e9584112ad5a067d2d3134c5bf0ed87f'],
  'onpu-transformed.png': [137978, 'e335bd4ecbb052603a7b1388fc274dd2b50c86a504bbfb7161ec2161d3e909a7'],
  'momoko-casual.png': [136752, '9b465cb34971bfb4e380eb5de7c68db252edac6a8eb05b43939c1b5c66cba39e'],
  'momoko-transformed.png': [144845, '1065d277bc2c9bb4152245256b04e62e94f934f29e82f860e54058cf18ca6b55'],
};

test('identity order and the supplied casual/transformed PNG mapping are explicit', () => {
  assert.deepEqual(CHARACTER_IDS, ['remi', 'hazuki', 'aiko', 'onpu', 'momoko']);
  assert.deepEqual(CHARACTER_IDS.map(id => getCharacter(id).name), ['도레미', '장메이', '유사랑', '진보라', '나모모']);
  assert.equal(getCharacter('doremi'), CHARACTERS.remi);
  assert.equal(getCharacter('unknown'), CHARACTERS.remi);
  for (const id of CHARACTER_IDS) {
    assert.equal(CHARACTERS[id].casualAsset, `${id}-casual.png`);
    const transformed = `${id}-transformed${id === 'remi' ? '' : '-cutout'}.png`;
    assert.equal(CHARACTERS[id].originalTransformedAsset, `${id}-transformed.png`);
    assert.equal(CHARACTERS[id].transformedAsset, transformed);
    assert.equal(characterAssetUrl(id, { assetBase: 'https://assets.example/characters/' }), `https://assets.example/characters/${id}-casual.png`);
    assert.equal(characterDataUrl(id, { assetBase: 'https://assets.example/characters/' }), `https://assets.example/characters/${transformed}`);
    assert.equal(characterDataUrl(id, { outfit: 'witch', assetBase: 'chrome-extension://abc/assets/' }), `chrome-extension://abc/assets/${transformed}`);
  }
});

test('all ten user-supplied PNGs retain their exact original bytes', async () => {
  await Promise.all(Object.entries(ORIGINALS).map(async ([name, [bytes, hash]]) => {
    const source = await readFile(new URL(`../assets/${name}`, import.meta.url));
    assert.equal(source.length, bytes, `${name}: original file size`);
    assert.equal(source.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${name}: PNG signature`);
    assert.equal(createHash('sha256').update(source).digest('hex'), hash, `${name}: original content`);
  }));
});

test('aspect-fit keeps complete artwork centered on a common baseline without stretching or cropping', () => {
  const tall = fitCharacterArt({ naturalWidth: 288, naturalHeight: 638, x: 300, y: 200, scale: 2 });
  assert.equal(tall.height, 600);
  assert.ok(Math.abs(tall.width / tall.height - 288 / 638) < 1e-12);
  assert.equal(tall.x + tall.width / 2, 300);
  assert.equal(tall.y + tall.height, 470);
  const wide = fitCharacterArt({ naturalWidth: 420, naturalHeight: 400, x: 200, y: 200, maxWidth: 150 });
  assert.equal(wide.width, 150);
  assert.ok(wide.height <= 300);
  assert.ok(Math.abs(wide.width / wide.height - 420 / 400) < 1e-12);
  assert.equal(wide.y + wide.height, 335);
  for (const bad of [0, -2, NaN, Infinity]) assert.equal(fitCharacterArt({ naturalWidth: bad, naturalHeight: 100 }), null);
});

function fakeImages({ loadFail = false, decodeFail = false } = {}) {
  const loaded = [];
  class FakeImage {
    naturalWidth = 288;
    naturalHeight = 638;
    set src(url) {
      assert.equal(this.crossOrigin, url.startsWith('file:') ? undefined : 'anonymous', 'web/extension CORS is assigned before src; local files use ordinary loading');
      this.url = url; loaded.push(this);
      queueMicrotask(() => loadFail ? this.onerror?.(new Error('network failure')) : this.onload?.());
    }
    async decode() { if (decodeFail) throw new Error('decode failure'); this.decoded = true; }
  }
  return { FakeImage, loaded };
}

test('preload decodes every original, shares normalized cache keys, and never fabricates missing art', async () => {
  const { FakeImage, loaded } = fakeImages(), base = 'https://load.example/pngs/';
  assert.equal(characterImageFor('remi', 'casual', base), null);
  assert.equal(drawCharacter({}, 'remi', { assetBase: base }), false);
  const ready = preloadCharacterAssets(base, { ImageCtor: FakeImage });
  assert.equal(ready, preloadCharacterAssets('https://load.example/pngs', { ImageCtor: FakeImage }));
  await ready;
  assert.equal(loaded.length, 10);
  assert.ok(loaded.every(image => image.decoded));
  assert.match(characterImageFor('aiko', 'casual', base).url, /aiko-casual\.png$/);
  assert.match(characterImageFor('momoko', 'witch', base).url, /momoko-transformed-cutout\.png$/);
});

test('load or decode errors reject before animation and a failed load can be retried', async () => {
  for (const failure of ['loadFail', 'decodeFail']) {
    const base = `https://${failure.toLowerCase()}.example/assets/`;
    const bad = fakeImages({ [failure]: true });
    await assert.rejects(preloadCharacterAssets(base, { ImageCtor: bad.FakeImage }), /캐릭터 원본 이미지/);
    assert.equal(characterImageFor('remi', 'casual', base), null);
    const good = fakeImages();
    await preloadCharacterAssets(base, { ImageCtor: good.FakeImage });
    assert.ok(characterImageFor('remi', 'casual', base).decoded);
  }
  await assert.rejects(preloadCharacterAssets('https://no-image-api.example/', { ImageCtor: null }), /Image API/);
});

test('Electron file resources and extension resources retain distinct asset caches', async () => {
  const { FakeImage } = fakeImages();
  await preloadCharacterAssets('file:///C:/Remi/dist/assets/', { ImageCtor: FakeImage });
  await preloadCharacterAssets('chrome-extension://original-art/assets/', { ImageCtor: FakeImage });
  const local = characterImageFor('remi', 'casual', 'file:///C:/Remi/dist/assets/');
  const extension = characterImageFor('remi', 'casual', 'chrome-extension://original-art/assets/');
  assert.equal(local.crossOrigin, undefined);
  assert.equal(extension.crossOrigin, 'anonymous');
  assert.notEqual(local, extension);
  assert.match(local.url, /^file:\/\/\/C:/);
  assert.match(extension.url, /^chrome-extension:/);
});

test('drawing uses whole original PNGs and opacity only, retaining exact aspect and baseline', async () => {
  const { FakeImage } = fakeImages(), art = createCharacterArt('https://drawing.example/assets/', { ImageCtor: FakeImage });
  await art.ready;
  const calls = [], stack = [];
  const ctx = { globalAlpha: .8, canvas: { width: 800, height: 600 }, save() { stack.push(this.globalAlpha); }, restore() { this.globalAlpha = stack.pop(); }, drawImage(...args) { calls.push({ args, alpha: this.globalAlpha }); } };
  assert.equal(art.draw(ctx, 'momoko', { x: 100, y: 200, scale: .5, transformMix: .25, facing: -1, pose: 'walk' }), true);
  assert.equal(calls.length, 2);
  assert.match(calls[0].args[0].url, /momoko-casual\.png$/);
  assert.match(calls[1].args[0].url, /momoko-transformed-cutout\.png$/);
  assert.equal(calls[0].args.length, 5, 'drawImage uses whole-source image, with no source crop rectangle');
  assert.ok(Math.abs(calls[0].alpha - .6) < 1e-12);
  assert.equal(calls[1].alpha, .2);
  assert.equal(calls[0].args[2] + calls[0].args[4], 267.5);
  assert.ok(Math.abs(calls[0].args[3] / calls[0].args[4] - 288 / 638) < 1e-12);
  assert.equal(ctx.globalAlpha, .8);
  art.dispose();
  assert.equal(art.imageFor('remi'), null);
  assert.equal(art.draw(ctx, 'remi'), false);
});
