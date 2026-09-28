import { DEFAULTS, effectiveSettings, normalizeSettings, normalizeSite } from './settings.js';

const CAPTURE_COOLDOWN = 3000;
const CAPTURE_TIME_KEY = 'remiLastCaptureAt';

export function supportedPage(url) {
  try {
    return ['http:', 'https:', 'file:'].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

export function validCaptureSender(sender, extensionId) {
  return Boolean(
    sender?.id === extensionId &&
    sender.frameId === 0 &&
    Number.isInteger(sender.tab?.id) && sender.tab.id >= 0 &&
    Number.isInteger(sender.tab?.windowId) && sender.tab.windowId >= 0 &&
    supportedPage(sender.url) &&
    (!sender.documentLifecycle || sender.documentLifecycle === 'active')
  );
}

export function validContentSender(sender, extensionId) {
  return Boolean(sender?.id === extensionId &&
    Number.isInteger(sender.frameId) && sender.frameId >= 0 &&
    Number.isInteger(sender.tab?.id) && sender.tab.id >= 0 &&
    supportedPage(sender.tab.url) &&
    (!sender.documentLifecycle || sender.documentLifecycle === 'active'));
}

function validSettingsSender(sender, extensionId) {
  if (validContentSender(sender, extensionId)) return true;
  return sender?.id === extensionId &&
    typeof sender.url === 'string' && sender.url.startsWith(`chrome-extension://${extensionId}/`);
}

// One service-worker queue merges each change into the latest saved preferences.
// A mute shortcut from a frame cannot overwrite a newer size or site preference.
export function createSettingsHandler(api) {
  let writeChain = Promise.resolve();
  return function settingsMessage(message, sender) {
    if (message?.type === 'REMI_SITE_CONTEXT') {
      return Promise.resolve(validContentSender(sender, api.runtime.id)
        ? { ok: true, site: normalizeSite(sender.tab.url) }
        : { ok: false, error: '이 페이지에서는 마법 커서를 사용할 수 없어요.' });
    }
    if (!['REMI_UPDATE_SETTINGS', 'REMI_SET_SITE_ENABLED', 'REMI_RESET_SETTINGS'].includes(message?.type)) return null;
    if (!validSettingsSender(sender, api.runtime.id)) return Promise.resolve({ ok: false, error: '설정을 변경할 수 없어요.' });
    const patch = message.patch;
    if (message.type === 'REMI_UPDATE_SETTINGS' && (!patch || typeof patch !== 'object' || Array.isArray(patch) ||
      Object.keys(patch).some(key => !Object.hasOwn(DEFAULTS, key) || key === 'disabledSites'))) {
      return Promise.resolve({ ok: false, error: '지원하지 않는 설정이에요.' });
    }
    const site = message.type === 'REMI_SET_SITE_ENABLED' ? normalizeSite(message.site) : '';
    if (message.type === 'REMI_SET_SITE_ENABLED' && (!site || typeof message.enabled !== 'boolean')) {
      return Promise.resolve({ ok: false, error: '이 사이트의 설정을 변경할 수 없어요.' });
    }
    const write = writeChain.catch(() => {}).then(async () => {
      const stored = await api.storage.local.get('remiSettings');
      const latest = normalizeSettings(stored.remiSettings);
      let settings;
      if (message.type === 'REMI_RESET_SETTINGS') settings = normalizeSettings();
      else if (message.type === 'REMI_SET_SITE_ENABLED') settings = normalizeSettings({
        ...latest, disabledSites: message.enabled ? latest.disabledSites.filter(item => item !== site)
          : [...latest.disabledSites, site],
      });
      else settings = normalizeSettings({ ...latest, ...patch });
      await api.storage.local.set({ remiSettings: settings });
      return { ok: true, settings };
    });
    writeChain = write;
    return write.catch(() => ({ ok: false, error: '저장하지 못했어요. 다시 시도해 주세요.' }));
  };
}

function trackContext(api, tabId, windowId) {
  let changed = false;
  const listeners = [
    [api.tabs.onActivated, info => {
      if (info.windowId === windowId && info.tabId !== tabId) changed = true;
    }],
    [api.tabs.onUpdated, (id, info) => {
      if (id === tabId && (info.url || info.status === 'loading')) changed = true;
    }],
    [api.tabs.onRemoved, id => { if (id === tabId) changed = true; }],
    [api.windows.onFocusChanged, id => { if (id !== windowId) changed = true; }],
  ];
  for (const [event, handler] of listeners) event.addListener(handler);
  return {
    get changed() { return changed; },
    dispose() { for (const [event, handler] of listeners) event.removeListener(handler); },
  };
}

async function assertCurrentPage(api, sender, context) {
  const [window, tabs] = await Promise.all([
    api.windows.get(sender.tab.windowId),
    api.tabs.query({ active: true, windowId: sender.tab.windowId }),
  ]);
  if (context.changed || !window.focused || tabs.length !== 1 ||
      tabs[0].id !== sender.tab.id || tabs[0].url !== sender.url ||
      tabs[0].pendingUrl || !supportedPage(tabs[0].url)) {
    throw new Error('화면이 바뀌어 캡처를 취소했어요. 원하는 탭에서 다시 변신해 주세요.');
  }
}

// The API adapter keeps tab/focus race handling testable without a running browser.
export function createCaptureHandler(api, now = Date.now) {
  let busy = false;
  let lastCaptureAt = null;
  return async function capture(message, sender) {
    if (message?.type !== 'REMI_CAPTURE') return null;
    if (!validCaptureSender(sender, api.runtime.id)) {
      return { ok: false, error: '이 화면에서는 캡처를 시작할 수 없어요.' };
    }
    if (busy) return { ok: false, error: '앞의 캡처를 저장하는 중이에요.' };
    busy = true;
    let context;
    try {
      context = trackContext(api, sender.tab.id, sender.tab.windowId);
      const [{ remiSettings }, stored] = await Promise.all([
        api.storage.local.get('remiSettings'),
        api.storage.session.get(CAPTURE_TIME_KEY),
      ]);
      const settings = effectiveSettings(remiSettings, normalizeSite(sender.tab.url || sender.url));
      if (!settings.enabled || !settings.captureOnTransform) {
        return { ok: false, error: '설정에서 변신 캡처를 켜 주세요.' };
      }
      const persisted = stored[CAPTURE_TIME_KEY];
      const previous = Number.isFinite(persisted) ? persisted : lastCaptureAt;
      if (previous !== null && now() - previous < CAPTURE_COOLDOWN) {
        return { ok: false, error: '잠깐만요! 3초 뒤 다시 캡처할 수 있어요.' };
      }
      await assertCurrentPage(api, sender, context);
      lastCaptureAt = now();
      await api.storage.session.set({ [CAPTURE_TIME_KEY]: lastCaptureAt });
      // Check again after the async storage write, before selecting the visible tab.
      await assertCurrentPage(api, sender, context);
      const dataUrl = await api.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' });
      await assertCurrentPage(api, sender, context);
      if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) {
        throw new Error('화면 이미지를 만들지 못했어요. 다시 시도해 주세요.');
      }
      const stamp = new Date(now()).toISOString().replace(/[:.]/g, '-');
      const downloadId = await api.downloads.download({
        url: dataUrl,
        filename: `Remi-Magic/remi-${stamp}.png`,
        saveAs: true,
        conflictAction: 'uniquify',
      });
      return { ok: true, downloadId };
    } catch (error) {
      const detail = String(error?.message || '');
      const known = /^(화면이 바뀌어|화면 이미지를)/.test(detail);
      const canceled = /cancel/i.test(detail);
      return {
        ok: false,
        error: known ? detail : canceled ? '사진 저장을 취소했어요.' :
          '캡처하지 못했어요. 일반 웹페이지에서 사이트 접근 권한을 확인해 주세요.',
      };
    } finally {
      context?.dispose();
      busy = false;
    }
  };
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  const capture = createCaptureHandler(chrome);
  const settings = createSettingsHandler(chrome);
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const result = message?.type === 'REMI_CAPTURE' ? capture(message, sender) : settings(message, sender);
    if (!result) return false;
    result.then(sendResponse);
    return true;
  });
}
