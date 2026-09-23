import test from 'node:test';
import assert from 'node:assert/strict';
import { createCaptureHandler, validCaptureSender } from '../src/background.js';

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
  const source = { id: 'test-extension', frameId: 0, url: 'https://example.org/', tab: { id: 12, windowId: 4 } };
  const state = { activeTab: { id: 12, url: source.url }, focused: true, captures: 0, downloads: [], session: {}, settings: {} };
  const api = {
    runtime: { id: source.id },
    storage: {
      local: { get: async () => ({ remiSettings: state.settings }) },
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
