import { createMagicOverlay } from './engine.js';

// Resolve the top tab in the background: a cross-origin frame cannot read top.location.
// If that lookup fails, stay inactive instead of ignoring the user's site exclusion.
export function createContentController({ api, view, doc, createOverlay = createMagicOverlay }) {
  let overlay, starting = false, generation = 0, active = true;
  let settingsRevision = 0, audioRevision = 0, currentSettings, currentAudio;
  const topFrame = view.top === view;

  async function start() {
    if (!active || starting || overlay || doc.getElementById('remi-magic-overlay')) return;
    starting = true;
    const ownGeneration = generation;
    const ownSettingsRevision = settingsRevision, ownAudioRevision = audioRevision;
    try {
      const [stored, context] = await Promise.all([
        api.storage.local.get(['remiSettings', 'remiAudio']),
        api.runtime.sendMessage({ type: 'REMI_SITE_CONTEXT' }),
      ]);
      if (!active || ownGeneration !== generation || !api.runtime?.id) return;
      if (!context?.ok || typeof context.site !== 'string') return;
      if (ownSettingsRevision === settingsRevision) currentSettings = stored.remiSettings;
      if (ownAudioRevision === audioRevision) currentAudio = stored.remiAudio;
      overlay = createOverlay({
        settings: currentSettings,
        site: context.site,
        assetBase: api.runtime.getURL('assets/'),
        onSettingsChange: async patch => {
          const result = await api.runtime.sendMessage({ type: 'REMI_UPDATE_SETTINGS', patch });
          if (!result?.ok) throw new Error(result?.error || '설정을 저장하지 못했어요.');
          return result.settings;
        },
        onCapture: async () => {
          if (!topFrame) throw new Error('이 영역은 삽입된 프레임이에요. 페이지 바깥 영역에서 다시 변신해 주세요.');
          const result = await api.runtime.sendMessage({ type: 'REMI_CAPTURE' });
          if (!result?.ok) throw new Error(result?.error || '확장 프로그램을 새로고침해 주세요.');
        },
      });
      overlay.configureAudio(currentAudio);
    } catch (error) {
      console.warn('Remi Magic:', error.message);
      overlay?.dispose();
      overlay = undefined;
    } finally {
      if (ownGeneration === generation) starting = false;
    }
  }

  function onStorage(changes, area) {
    if (area !== 'local') return;
    if (changes.remiSettings) {
      settingsRevision++;
      currentSettings = changes.remiSettings.newValue || {};
      overlay?.configure(currentSettings);
    }
    if (changes.remiAudio) {
      audioRevision++;
      currentAudio = changes.remiAudio.newValue || {};
      overlay?.configureAudio(currentAudio);
    }
  }
  function onPageHide() {
    active = false;
    generation++;
    starting = false;
    overlay?.dispose();
    overlay = undefined;
  }
  function onPageShow(event) {
    active = true;
    if (event.persisted && topFrame) start();
  }
  function onPointerOver(event) { if (event.isTrusted && !overlay) start(); }

  api.storage.onChanged.addListener(onStorage);
  view.addEventListener('pagehide', onPageHide);
  view.addEventListener('pageshow', onPageShow);
  // A frame is created only when entered, including after a back-forward-cache restore.
  view.addEventListener('pointerover', onPointerOver, { passive: true });
  if (topFrame) start();
  return {
    start,
    get overlay() { return overlay; },
    dispose() {
      onPageHide();
      api.storage.onChanged.removeListener(onStorage);
      view.removeEventListener('pagehide', onPageHide);
      view.removeEventListener('pageshow', onPageShow);
      view.removeEventListener('pointerover', onPointerOver);
    },
  };
}

if (typeof chrome !== 'undefined' && chrome.runtime?.id && typeof window !== 'undefined') {
  createContentController({ api: chrome, view: window, doc: document });
}
