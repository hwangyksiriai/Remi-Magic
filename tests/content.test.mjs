import test from 'node:test';
import assert from 'node:assert/strict';
import { createContentController } from '../src/content.js';
import { createSettingsHandler } from '../src/background.js';
import { effectiveSettings } from '../src/settings.js';

function events() {
  const listeners = new Set();
  return { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn),
    emit: (...args) => { for (const fn of listeners) fn(...args); } };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

function fixture({ frame = false, settings = {} } = {}) {
  const listeners = new Map(), created = [];
  const view = {
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    emit(type, payload = {}) { for (const fn of listeners.get(type) || []) fn(payload); },
  };
  view.top = frame ? {} : view;
  const state = { settings, audio: {}, contextCalls: 0, topUrl: 'https://main.example/page', failContext: false };
  const source = { id: 'test-extension', frameId: frame ? 4 : 0, url: frame ? 'https://iframe.example' : state.topUrl,
    tab: { id: 12, windowId: 3, url: state.topUrl } };
  const api = {
    runtime: { id: source.id, getURL: path => `chrome-extension://${source.id}/${path}` },
    storage: {
      local: {
        get: async () => ({ remiSettings: state.settings, remiAudio: state.audio }),
        set: async patch => { state.settings = patch.remiSettings; api.storage.onChanged.emit({ remiSettings: { newValue: state.settings } }, 'local'); },
      },
      onChanged: events(),
    },
  };
  const settingsHandler = createSettingsHandler(api);
  api.runtime.sendMessage = async message => {
    if (message.type === 'REMI_SITE_CONTEXT') {
      state.contextCalls++;
      if (state.failContext) return { ok: false };
    }
    return settingsHandler(message, { ...source, tab: { ...source.tab, url: state.topUrl } });
  };
  const createOverlay = options => {
    const instance = { options, settings: options.settings, disposed: false, audio: null,
      configure(settings) { this.settings = settings; }, configureAudio(audio) { this.audio = audio; },
      dispose() { this.disposed = true; } };
    created.push(instance);
    return instance;
  };
  return { api, view, state, created, createOverlay, doc: { getElementById: () => null } };
}

function mount(f) { return createContentController({ api: f.api, view: f.view, doc: f.doc, createOverlay: f.createOverlay }); }

test('cross-origin frame uses the top hostname for exclusions and after cache restoration', async () => {
  const f = fixture({ frame: true, settings: { disabledSites: ['main.example'] } });
  const controller = mount(f);
  await settle();
  assert.equal(f.created.length, 0);
  f.view.emit('pointerover', { isTrusted: true });
  await settle();
  assert.equal(f.created.length, 1);
  assert.equal(f.created[0].options.site, 'main.example');
  assert.equal(effectiveSettings(f.created[0].settings, f.created[0].options.site).enabled, false);
  await assert.rejects(f.created[0].options.onCapture(), /삽입된 프레임/);
  f.view.emit('pagehide');
  assert.equal(f.created[0].disposed, true);
  f.view.emit('pageshow', { persisted: true });
  f.view.emit('pointerover', { isTrusted: true });
  await settle();
  assert.equal(f.created.length, 2);
  assert.equal(f.state.contextCalls, 2);
  assert.equal(effectiveSettings(f.created[1].settings, f.created[1].options.site).enabled, false);
  controller.dispose();
});

test('a failed top-site lookup never activates an overlay', async () => {
  const f = fixture();
  f.state.failContext = true;
  const controller = mount(f);
  await settle();
  f.view.emit('pointerover', { isTrusted: true });
  await settle();
  assert.equal(f.created.length, 0);
  f.state.failContext = false;
  f.view.emit('pointerover', { isTrusted: true });
  await settle();
  assert.equal(f.created.length, 1);
  controller.dispose();
});

test('pending initialization cannot create an orphan after pagehide', async () => {
  const f = fixture();
  let finishRead;
  f.api.storage.local.get = () => new Promise(resolve => { finishRead = resolve; });
  const controller = mount(f);
  f.view.emit('pagehide');
  finishRead({ remiSettings: {} });
  await settle();
  assert.equal(f.created.length, 0);
  controller.dispose();
});

test('settings received while initializing supersede the initial storage snapshot', async () => {
  const f = fixture();
  let finishRead;
  f.api.storage.local.get = () => new Promise(resolve => { finishRead = resolve; });
  const controller = mount(f);
  f.api.storage.onChanged.emit({ remiSettings: { newValue: { sound: false, size: 225 } }, remiAudio: { newValue: { custom: 'new' } } }, 'local');
  finishRead({ remiSettings: { sound: true, size: 160 }, remiAudio: { custom: 'old' } });
  await settle();
  assert.equal(f.created[0].settings.sound, false);
  assert.equal(f.created[0].settings.size, 225);
  assert.deepEqual(f.created[0].audio, { custom: 'new' });
  controller.dispose();
});

test('mute shortcut persistence and storage changes refresh an existing overlay without overwriting preferences', async () => {
  const f = fixture({ settings: { character: 'onpu', size: 210, disabledSites: ['another.example'] } });
  const controller = mount(f);
  await settle();
  const saved = await f.created[0].options.onSettingsChange({ sound: false });
  assert.equal(saved.sound, false);
  assert.equal(saved.character, 'onpu');
  assert.equal(f.created[0].settings.sound, false);
  assert.equal(f.created[0].settings.size, 210);
  assert.deepEqual(f.created[0].settings.disabledSites, ['another.example']);
  f.api.storage.onChanged.emit({ remiSettings: { newValue: { mode: 'focus', disabledSites: ['main.example'] } } }, 'local');
  assert.equal(effectiveSettings(f.created[0].settings, f.created[0].options.site).enabled, false);
  assert.equal(f.created.length, 1);
  controller.dispose();
});
