import { DEFAULTS, normalizeSettings, normalizeSite } from './settings.js';
import { summarizeVoice } from './voice-summary.js';

const toggles = ['enabled', 'sound', 'captureOnTransform', 'trail', 'voiceFallback', 'languageFallback', 'clickSound', 'scrollSound', 'spellVoice', 'transformSound', 'holdToTransform'];
const ranges = ['size', 'volume', 'holdDuration'];
const status = document.querySelector('#save-status');
const inputs = Object.fromEntries(Object.keys(DEFAULTS).map(key => [key, document.getElementById(key)]));
const modeInputs = [...document.querySelectorAll('input[name="mode"]')];
const siteInput = document.querySelector('#site-enabled');
let settings = normalizeSettings();
let audioClips = {};
let activeSite = '', siteAvailable = false, pageSupported = false;
let writeChain = Promise.resolve(), revision = 0;
const pendingPatches = new Map();

function isProtectedStore(url) {
  try {
    const { hostname, pathname } = new URL(url);
    return hostname === 'chromewebstore.google.com' ||
      (hostname === 'chrome.google.com' && pathname.startsWith('/webstore')) ||
      (['microsoftedge.microsoft.com', 'edge.microsoft.com'].includes(hostname) && pathname.startsWith('/addons'));
  } catch { return true; }
}

function render() {
  const focused = settings.mode === 'focus';
  const siteOff = siteAvailable && settings.disabledSites.includes(activeSite);
  for (const key of toggles) inputs[key].checked = settings[key];
  for (const input of modeInputs) input.checked = input.value === settings.mode;
  inputs.character.value = settings.character;
  inputs.language.value = settings.language;
  document.querySelector('#voice-status').textContent=summarizeVoice(settings,audioClips,window.speechSynthesis?.getVoices()||[]).note;
  for (const key of ranges) {
    const input = inputs[key];
    input.value = settings[key];
    input.style.setProperty('--fill', `${100 * (settings[key] - Number(input.min)) / (Number(input.max) - Number(input.min))}%`);
  }
  document.querySelector('#size-value').textContent = `${settings.size} px`;
  document.querySelector('#volume-value').textContent = `${Math.round(settings.volume / 0.5 * 100)}%`;
  document.querySelector('#holdDuration-value').textContent = `${(settings.holdDuration / 1000).toFixed(1)}초`;
  document.querySelector('#enabled-label').textContent = !settings.enabled ? '전체 마법 커서가 꺼져 있어요' :
    !pageSupported ? '이 페이지는 적용을 지원하지 않아요' : siteOff ? '이 사이트에서는 꺼져 있어요' :
    focused ? '집중 모드 · 요술봉과 구슬만 조용히' : '마법 모드 · 요술봉이 켜져 있어요';
  document.querySelector('#mode-description').textContent = focused ?
    '요술봉과 구슬은 유지해요. 소리·잔상·길게 눌러 변신은 잠시 쉬어요. 마법 모드로 돌아가면 설정이 복원돼요.' :
    '소리와 잔상, 길게 눌러 변신을 원하는 대로 즐겨요.';
  document.querySelector('#sound-description').textContent = focused ? '집중 모드에서는 소리가 잠시 꺼져요' :
    `${settings.sound ? '소리 켜짐' : '음소거 중'} · Alt + Shift + M`;
  document.querySelector('#how-to-text').textContent = !settings.enabled || siteOff ?
    '커서가 꺼져 있어요. 위의 스위치를 켜면 다시 사용할 수 있어요.' : !pageSupported ?
    '일반 웹페이지로 이동해 마법 커서를 사용해 보세요.' :
    '요술봉 끝, 작은 별의 보석 중심이 클릭 위치예요. 글자·링크·크기 조절은 옆의 작은 기호로 알려줘요.';
  document.body.classList.toggle('disabled', !settings.enabled || siteOff);
  document.body.classList.toggle('focus-mode', focused);
  siteInput.checked = siteAvailable && !siteOff;
  siteInput.disabled = !siteAvailable;
  for (const key of ['sound', 'trail', 'holdToTransform']) inputs[key].disabled = focused;
  for (const key of ['volume', 'clickSound', 'scrollSound', 'spellVoice', 'transformSound']) inputs[key].disabled = focused || !settings.sound;
  inputs.voiceFallback.disabled = focused || !settings.sound || !settings.spellVoice;
  inputs.holdDuration.disabled = focused || !settings.holdToTransform;
}

function applyPending(raw) {
  let next = normalizeSettings(raw);
  for (const message of pendingPatches.values()) {
    if (message.type === 'REMI_UPDATE_SETTINGS') next = normalizeSettings({ ...next, ...message.patch });
    else if (message.type === 'REMI_RESET_SETTINGS') next = normalizeSettings();
    else next = normalizeSettings({ ...next, disabledSites: message.enabled ? next.disabledSites.filter(site => site !== message.site) : [...next.disabledSites, message.site] });
  }
  return next;
}

function persist(message) {
  const ownRevision = ++revision;
  pendingPatches.set(ownRevision, message);
  settings = applyPending(settings);
  render();
  status.textContent = '저장 중…';
  writeChain = writeChain.catch(() => {}).then(async () => {
    try {
      const result = await chrome.runtime.sendMessage(message);
      if (!result?.ok) throw new Error(result?.error || '설정을 저장하지 못했어요.');
      pendingPatches.delete(ownRevision);
      const stored = await chrome.storage.local.get('remiSettings');
      settings = applyPending(stored.remiSettings || result.settings);
      render();
      if (ownRevision === revision) status.textContent = '설정을 저장했어요';
    } catch (error) {
      pendingPatches.delete(ownRevision);
      try {
        const stored = await chrome.storage.local.get('remiSettings');
        settings = applyPending(stored.remiSettings);
      } catch { /* Keep the last visible preferences if storage itself is unavailable. */ }
      render();
      status.textContent = error.message || '저장하지 못했어요. 다시 시도해 주세요.';
    }
  });
}

async function init() {
  try {
    const [stored, tabs] = await Promise.all([
      chrome.storage.local.get(['remiSettings','remiAudio']),
      chrome.tabs.query({ active: true, currentWindow: true }),
    ]);
    settings = normalizeSettings(stored.remiSettings);
    audioClips = stored.remiAudio || {};
    const url = tabs[0]?.url || '';
    activeSite = normalizeSite(url);
    const protectedStore = isProtectedStore(url);
    siteAvailable = Boolean(activeSite) && !protectedStore;
    pageSupported = siteAvailable || /^file:\/\//i.test(url);
    document.querySelector('#site-name').textContent = siteAvailable ? activeSite : /^file:\/\//i.test(url) ?
      '로컬 파일 · 확장 프로그램의 파일 접근 허용 필요' : '이 페이지는 사이트별 설정을 지원하지 않아요';
    render();
    for (const key of toggles) inputs[key].addEventListener('change', () => persist({ type: 'REMI_UPDATE_SETTINGS', patch: { [key]: inputs[key].checked } }));
    for (const key of ranges) inputs[key].addEventListener('input', () => persist({ type: 'REMI_UPDATE_SETTINGS', patch: { [key]: Number(inputs[key].value) } }));
    for (const key of ['character', 'language']) inputs[key].addEventListener('change', () => persist({ type: 'REMI_UPDATE_SETTINGS', patch: { [key]: inputs[key].value } }));
    for (const input of modeInputs) input.addEventListener('change', () => {
      if (input.checked) persist({ type: 'REMI_UPDATE_SETTINGS', patch: { mode: input.value } });
    });
    siteInput.addEventListener('change', () => {
      if (siteAvailable) persist({ type: 'REMI_SET_SITE_ENABLED', site: activeSite, enabled: siteInput.checked });
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if(area==='local'&&changes.remiAudio){audioClips=changes.remiAudio.newValue||{};render();}
      if (area === 'local' && changes.remiSettings) {
        settings = applyPending(changes.remiSettings.newValue);
        render();
      }
    });
    window.speechSynthesis?.addEventListener('voiceschanged',render);
    document.querySelector('#reset').addEventListener('click', () => persist({ type: 'REMI_RESET_SETTINGS' }));
    document.querySelector('#open-demo').addEventListener('click', async () => {
      await chrome.tabs.create({ url: chrome.runtime.getURL('demo.html') });
      window.close();
    });
  } catch {
    status.textContent = '확장 프로그램에서 설정을 열어 주세요.';
    for (const input of [...Object.values(inputs), ...modeInputs, siteInput]) if (input) input.disabled = true;
  }
}

init();
