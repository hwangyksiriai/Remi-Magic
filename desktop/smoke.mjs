import assert from 'node:assert/strict';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { workAreaBounds, CHARACTER_IDS } from './scheduler.mjs';
import { CHARACTERS } from '../src/characters.js';

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
function loaded(window) {
  if (!window.webContents.isLoading()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    window.webContents.once('did-finish-load', resolve);
    window.webContents.once('did-fail-load', (_event, code, description) => reject(new Error(`${code}: ${description}`)));
  });
}
function imagesReady(window) {
  return window.webContents.executeJavaScript(`new Promise((resolve,reject)=>{
    const started=performance.now();
    const inspect=()=>{const canvas=document.querySelector('canvas');if(canvas?.dataset.artworkError)return reject(new Error(canvas.dataset.artworkError));if(canvas?.dataset.artworkReady==='true')return resolve(true);if(performance.now()-started>8000)return reject(new Error('Original image decode timeout'));setTimeout(inspect,25);};inspect();
  })`);
}

/** Opt-in bounded integration check against this application's own local renderers. */
export async function runSmoke({ controls, overlays, scheduler, screen, directory }) {
  await mkdir(directory, { recursive: true });
  const deadline = setTimeout(() => { console.error('DESKTOP_SMOKE_TIMEOUT'); process.exit(1); }, 45_000);
  try {
    await Promise.all([controls, ...overlays.values()].map(loaded));
    await Promise.all([controls, ...overlays.values()].map(imagesReady));
    const originalAssets = [];
    for (const character of CHARACTER_IDS) for (const outfit of ['casual', 'transformed']) {
      const name = outfit === 'casual' ? CHARACTERS[character].casualAsset : CHARACTERS[character].transformedAsset;
      const original = await readFile(join(directory, '..', '..', 'assets', name));
      const bundled = await readFile(join(directory, '..', 'dist', 'assets', name));
      assert.ok(original.equals(bundled), `${name} copied without modifying any bytes`);
      originalAssets.push({ name, bytes: original.length, width: original.readUInt32BE(16), height: original.readUInt32BE(20), sha256: createHash('sha256').update(original).digest('hex') });
    }
    const settings = await controls.webContents.executeJavaScript('window.companion.setSettings({enabled:false,sound:false,character:"remi",language:"ja"})');
    assert.equal(settings.enabled, false);
    assert.equal(settings.language, 'ja');
    assert.equal(scheduler.settings.character, 'remi');
    await delay(200);
    const controlsState = await controls.webContents.executeJavaScript('({status:document.querySelector("#status").textContent,character:document.querySelector("#character").value,language:document.querySelector("#language").value})');
    assert.ok(controlsState.status.includes('일시정지'));
    assert.equal(controlsState.character, 'remi');
    assert.equal(controlsState.language, 'ja');
    const displays = screen.getAllDisplays();
    const security = [];
    for (const display of displays) {
      const window = overlays.get(display.id);
      assert.ok(window, 'one overlay per monitor');
      assert.deepEqual(window.getBounds(), workAreaBounds(display));
      // Electron getBackgroundColor normalizes to RGB and omits alpha.
      assert.ok(['#000000', '#00000000'].includes(window.getBackgroundColor()));
      assert.equal(window.isFocusable(), false);
      assert.equal(window.isAlwaysOnTop(), true);
      const preferences = window.webContents.getLastWebPreferences();
      assert.equal(preferences.contextIsolation, true);
      assert.equal(preferences.sandbox, true);
      assert.equal(preferences.nodeIntegration, false);
      const renderer = await window.webContents.executeJavaScript('({nodeExposed:typeof require !== "undefined" || typeof process !== "undefined",canvas:!!document.querySelector("canvas"),bridge:typeof window.companion?.onScene})');
      assert.equal(renderer.nodeExposed, false);
      assert.equal(renderer.canvas, true);
      assert.equal(renderer.bridge, 'function');
      const denied = await window.webContents.executeJavaScript('window.companion.setSettings({enabled:true}).then(()=>false,()=>true)');
      assert.equal(denied, true, 'overlay cannot change settings');
      security.push({ display: display.id, bounds: window.getBounds(), transparentBackground: window.getBackgroundColor(), sandbox: preferences.sandbox, nodeIntegration: preferences.nodeIntegration, contextIsolation: preferences.contextIsolation, focusable: window.isFocusable(), alwaysOnTop: window.isAlwaysOnTop(), clickThrough: 'configured with setIgnoreMouseEvents(true); physical click forwarding requires a live desktop check' });
    }
    const controlsImage = await controls.webContents.capturePage();
    assert.equal(controlsImage.isEmpty(), false);
    await writeFile(join(directory, 'controls.png'), controlsImage.toPNG());
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const window = overlays.get(display.id);
    const rendered = [];
    for (const [mode, wait] of [['walk', 1200], ['group', 5500], ['transform', 6200]]) {
      await controls.webContents.executeJavaScript(`window.companion.show(${JSON.stringify(mode)})`);
      if (mode === 'transform') {
        await delay(2400);
        const tapBounds = window.getContentBounds(), tapHeight = Math.min(400, tapBounds.height);
        const tapImage = await window.webContents.capturePage({ x: 0, y: tapBounds.height - tapHeight, width: tapBounds.width, height: tapHeight });
        await writeFile(join(directory, 'transform-tap.png'), tapImage.toPNG());
        await delay(wait - 2400);
      } else await delay(wait);
      assert.equal(scheduler.active.mode, mode);
      const pixels = await window.webContents.executeJavaScript('(()=>{const canvas=document.querySelector("canvas");const data=canvas.getContext("2d").getImageData(0,0,canvas.width,canvas.height).data;let visible=0;for(let i=3;i<data.length;i+=4)if(data[i])visible++;return {visible,width:canvas.width,height:canvas.height};})()');
      assert.ok(pixels.visible > 500, `${mode} produces visible character pixels`);
      assert.ok(pixels.visible < pixels.width * pixels.height / 2, `${mode} preserves transparent surrounding area`);
      const bounds = window.getContentBounds();
      const height = Math.min(400, bounds.height);
      const image = await window.webContents.capturePage({ x: 0, y: bounds.height - height, width: bounds.width, height });
      assert.equal(image.isEmpty(), false);
      const bitmap = image.toBitmap();
      let transparentPixels = 0;
      for (let offset = 3; offset < bitmap.length; offset += 4) if (bitmap[offset] === 0) transparentPixels++;
      assert.ok(transparentPixels > bitmap.length / 8, `${mode} Electron capture preserves the transparent window background`);
      await writeFile(join(directory, `${mode}.png`), image.toPNG());
      rendered.push({ mode, ...pixels, transparentPixels });
    }
    await delay(4500);
    const afterBounds = window.getContentBounds();
    const afterHeight = Math.min(400, afterBounds.height);
    const afterImage = await window.webContents.capturePage({ x: 0, y: afterBounds.height - afterHeight, width: afterBounds.width, height: afterHeight });
    await writeFile(join(directory, 'transform-after.png'), afterImage.toPNG());
    await controls.webContents.executeJavaScript('window.companion.hide()');
    assert.equal(scheduler.active, null);
    assert.equal(scheduler.nextTimer, null, 'manual hide does not schedule disabled automatic appearances');
    await writeFile(join(directory, 'smoke-report.json'), JSON.stringify({ platform: process.platform, electron: process.versions.electron, originalAssets, originalImageDecode: 'all 10 decoded in every renderer', security, rendered, settingsIpc: 'passed', overlaySettingsPermission: 'denied as expected', normalUserSettings: 'untouched; separate smoke profile', nativeClickForwarding: 'not physically tested by this offscreen check' }, null, 2));
  } finally { clearTimeout(deadline); }
}
