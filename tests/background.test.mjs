import test from 'node:test';
import assert from 'node:assert/strict';
import { createCaptureHandler, validCaptureSender, createSettingsHandler, validContentSender } from '../src/background.js';

function event() {
  const listeners = new Set();
  return {
    addListener: listener => listeners.add(listener),
    removeListener: listener => listeners.delete(listener),
    emit: (...args) => { for (const listener of listeners) listener(...args); },
    get size() { return listeners.size; },
  };
}

function fixture() {
  const source = { id: 'test-extension', frameId: 0, url: 'https://example.org/', tab: { id: 12, windowId: 4, url: 'https://example.org/' } };
  const state = { activeTab: { id: 12, url: source.url }, focused: true, captures: 0, downloads: [], session: {}, settings: {} };
  const api = {
    runtime: { id: source.id },
    storage: {
      local: { get: async () => ({ remiSettings: state.settings }), set: async patch => { state.settings = patch.remiSettings; } },
      session: { get: async () => ({ ...state.session }), set: async patch => Object.assign(state.session, patch) },
    },
    windows: { get: async () => ({ id: 4, focused: state.focused }), onFocusChanged: event() },
    tabs: {
      query: async () => [state.activeTab],
      captureVisibleTab: async (windowId, options) => {
        assert.equal(windowId, 4);
        assert.deepEqual(options, { format: 'png' });
        state.captures += 1;
        return 'data:image/png;base64,aW1hZ2U=';
      },
      onActivated: event(), onUpdated: event(), onRemoved: event(),
    },
    downloads: { download: async options => { state.downloads.push(options); return 51; } },
  };
  return { source, state, api };
}

test('only a top-frame content script from this extension may request a capture', () => {
  const { source } = fixture();
  assert.equal(validCaptureSender(source, source.id), true);
  for (const patch of [
    { id: 'other-extension' }, { frameId: 1 }, { tab: undefined },
    { url: 'chrome://settings/' }, { documentLifecycle: 'prerender' }, { url: 'invalid' },
  ]) assert.equal(validCaptureSender({ ...source, ...patch }, source.id), false);
});

test('a requested screenshot is PNG and asks where to save the visible tab', async () => {
  const { source, state, api } = fixture();
  const capture = createCaptureHandler(api, () => 100000);
  assert.deepEqual(await capture({ type: 'REMI_CAPTURE' }, source), { ok: true, downloadId: 51 });
  assert.equal(state.captures, 1);
  assert.equal(state.downloads[0].saveAs, true);
  assert.match(state.downloads[0].filename, /^Remi-Magic\/remi-.*\.png$/);
  assert.equal(api.tabs.onActivated.size, 0);
  assert.equal(api.windows.onFocusChanged.size, 0);
});

test('unrelated messages and unsupported senders do not reach capture APIs', async () => {
  const { source, state, api } = fixture();
  const capture = createCaptureHandler(api);
  assert.equal(await capture({ type: 'something-else' }, source), null);
  assert.equal((await capture({ type: 'REMI_CAPTURE' }, { ...source, frameId: 3 })).ok, false);
  assert.equal(state.captures, 0);
});

test('inactive tabs, unfocused windows, disabled settings, and pending navigations cannot capture', async () => {
  const variations = [
    state => { state.activeTab.id = 99; },
    state => { state.focused = false; },
    state => { state.activeTab.url = 'https://elsewhere.example/'; },
    state => { state.activeTab.pendingUrl = 'https://elsewhere.example/'; },
    state => { state.settings.captureOnTransform = false; },
    state => { state.settings.enabled = false; },
    state => { state.settings.disabledSites = ['example.org']; },
  ];
  for (const vary of variations) {
    const { source, state, api } = fixture();
    vary(state);
    assert.equal((await createCaptureHandler(api)({ type: 'REMI_CAPTURE' }, source)).ok, false);
    assert.equal(state.captures, 0);
    assert.equal(state.downloads.length, 0);
  }
});

test('switching away and back during capture still discards the screenshot', async () => {
  const { source, state, api } = fixture();
  api.tabs.captureVisibleTab = async () => {
    api.tabs.onActivated.emit({ windowId: 4, tabId: 99 });
    api.tabs.onActivated.emit({ windowId: 4, tabId: 12 });
    return 'data:image/png;base64,aW1hZ2U=';
  };
  const result = await createCaptureHandler(api)({ type: 'REMI_CAPTURE' }, source);
  assert.equal(result.ok, false);
  assert.match(result.error, /화면이 바뀌어/);
  assert.equal(state.downloads.length, 0);
});

test('losing focus or navigating during capture discards the screenshot', async () => {
  for (const trigger of [
    api => api.windows.onFocusChanged.emit(-1),
    api => api.tabs.onUpdated.emit(12, { status: 'loading' }),
    api => api.tabs.onRemoved.emit(12),
  ]) {
    const { source, state, api } = fixture();
    api.tabs.captureVisibleTab = async () => { trigger(api); return 'data:image/png;base64,aW1hZ2U='; };
    assert.equal((await createCaptureHandler(api)({ type: 'REMI_CAPTURE' }, source)).ok, false);
    assert.equal(state.downloads.length, 0);
  }
});

test('cooldown survives service worker recreation and expires at three seconds', async () => {
  const { source, state, api } = fixture();
  let now = 100000;
  assert.equal((await createCaptureHandler(api, () => now)({ type: 'REMI_CAPTURE' }, source)).ok, true);
  now += 2999;
  assert.equal((await createCaptureHandler(api, () => now)({ type: 'REMI_CAPTURE' }, source)).ok, false);
  now += 1;
  assert.equal((await createCaptureHandler(api, () => now)({ type: 'REMI_CAPTURE' }, source)).ok, true);
  assert.equal(state.captures, 2);
});

test('concurrent requests only capture once', async () => {
  const { source, state, api } = fixture();
  const capture = createCaptureHandler(api);
  const results = await Promise.all([capture({ type: 'REMI_CAPTURE' }, source), capture({ type: 'REMI_CAPTURE' }, source)]);
  assert.equal(results.filter(result => result.ok).length, 1);
  assert.equal(state.captures, 1);
});

test('a canceled save returns a useful error and releases all listeners', async () => {
  const { source, api } = fixture();
  api.downloads.download = async () => { throw new Error('Download canceled by the user'); };
  const result = await createCaptureHandler(api)({ type: 'REMI_CAPTURE' }, source);
  assert.equal(result.ok, false);
  assert.match(result.error, /취소/);
  assert.equal(api.tabs.onUpdated.size, 0);
  assert.equal(api.windows.onFocusChanged.size, 0);
});

test('site context uses the top tab for every frame and never trusts a requested site', async () => {
  const { source, api } = fixture();
  const handle = createSettingsHandler(api);
  for (const frameId of [0, 3, 12]) {
    const sender = { ...source, frameId, url: 'https://advertisement.example/frame' };
    assert.deepEqual(await handle({ type: 'REMI_SITE_CONTEXT', site: 'forged.example' }, sender), { ok: true, site: 'example.org' });
  }
  assert.deepEqual(await handle({ type: 'REMI_SITE_CONTEXT' }, { ...source, tab: { ...source.tab, url: 'file:///page.html' } }), { ok: true, site: '' });
});

test('site lookup rejects unknown extensions, missing top URL, protected pages and inactive documents', async () => {
  const { source, api } = fixture();
  const handle = createSettingsHandler(api);
  for (const patch of [
    { id: 'untrusted' }, { frameId: -1 }, { tab: undefined },
    { tab: { ...source.tab, url: undefined } }, { tab: { ...source.tab, url: 'chrome://settings' } },
    { documentLifecycle: 'prerender' },
  ]) {
    assert.equal(validContentSender({ ...source, ...patch }, api.runtime.id), false);
    assert.equal((await handle({ type: 'REMI_SITE_CONTEXT' }, { ...source, ...patch })).ok, false);
  }
});

test('concurrent settings patches retain character, site preferences and the latest values', async () => {
  const { source, state, api } = fixture();
  state.settings = { character: 'aiko', size: 170, disabledSites: ['blocked.example'], trail: false };
  const handle = createSettingsHandler(api);
  const popup = { id: source.id, url: `chrome-extension://${source.id}/popup.html` };
  const results = await Promise.all([
    handle({ type: 'REMI_UPDATE_SETTINGS', patch: { size: 215 } }, popup),
    handle({ type: 'REMI_UPDATE_SETTINGS', patch: { sound: false } }, { ...source, frameId: 9 }),
    handle({ type: 'REMI_UPDATE_SETTINGS', patch: { mode: 'focus', spellVoice: false } }, popup),
  ]);
  assert.ok(results.every(result => result.ok));
  assert.equal(state.settings.size, 215);
  assert.equal(state.settings.sound, false);
  assert.equal(state.settings.character, 'aiko');
  assert.equal(state.settings.trail, false);
  assert.equal(state.settings.mode, 'focus');
  assert.equal(state.settings.spellVoice, false);
  assert.deepEqual(state.settings.disabledSites, ['blocked.example']);
});

test('site toggle merges current exclusions, matches exact hosts and reset restores defaults', async () => {
  const { source, state, api } = fixture();
  state.settings = { size: 230, disabledSites: ['keep.example'] };
  const handle = createSettingsHandler(api);
  await Promise.all([
    handle({ type: 'REMI_SET_SITE_ENABLED', site: 'https://ONE.example/a', enabled: false }, source),
    handle({ type: 'REMI_SET_SITE_ENABLED', site: 'two.example', enabled: false }, source),
  ]);
  assert.deepEqual(state.settings.disabledSites, ['keep.example', 'one.example', 'two.example']);
  await handle({ type: 'REMI_SET_SITE_ENABLED', site: 'one.example', enabled: true }, source);
  assert.deepEqual(state.settings.disabledSites, ['keep.example', 'two.example']);
  assert.equal(state.settings.size, 230);
  await handle({ type: 'REMI_RESET_SETTINGS' }, source);
  assert.deepEqual(state.settings.disabledSites, []);
  assert.equal(state.settings.size, 160);
});

test('an own-extension demo tab can use settings APIs without opening page senders to them', async () => {
  const { source, state, api } = fixture();
  const handle = createSettingsHandler(api);
  const demoUrl = `chrome-extension://${source.id}/demo.html`;
  const demo = { ...source, url: demoUrl, tab: { ...source.tab, url: demoUrl } };
  assert.equal((await handle({ type: 'REMI_UPDATE_SETTINGS', patch: { mode: 'focus' } }, demo)).ok, true);
  assert.equal(state.settings.mode, 'focus');
  for (const url of ['chrome-extension://other-extension/demo.html', `https://${source.id}/demo.html`]) {
    assert.equal((await handle({ type: 'REMI_UPDATE_SETTINGS', patch: { sound: false } }, { ...demo, url })).ok, false);
  }
});

test('settings service rejects malformed messages and recovers after a failed write', async () => {
  const { source, state, api } = fixture();
  const handle = createSettingsHandler(api);
  for (const message of [
    { type: 'REMI_UPDATE_SETTINGS', patch: null }, { type: 'REMI_UPDATE_SETTINGS', patch: [] },
    { type: 'REMI_UPDATE_SETTINGS', patch: { arbitrary: 'no' } },
    { type: 'REMI_UPDATE_SETTINGS', patch: { disabledSites: [] } },
    { type: 'REMI_SET_SITE_ENABLED', site: 'chrome://settings', enabled: false },
    { type: 'REMI_SET_SITE_ENABLED', site: 'valid.example', enabled: 'false' },
  ]) assert.equal((await handle(message, source)).ok, false);
  assert.equal((await handle({ type: 'REMI_UPDATE_SETTINGS', patch: { sound: false } }, { ...source, id: 'wrong' })).ok, false);
  assert.equal(handle({ type: 'unrelated' }, source), null);
  const normalSet = api.storage.local.set;
  api.storage.local.set = async () => { throw new Error('quota'); };
  assert.equal((await handle({ type: 'REMI_UPDATE_SETTINGS', patch: { sound: false } }, source)).ok, false);
  api.storage.local.set = normalSet;
  assert.equal((await handle({ type: 'REMI_UPDATE_SETTINGS', patch: { sound: false } }, source)).ok, true);
  assert.equal(state.settings.sound, false);
});
