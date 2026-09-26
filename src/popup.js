import {DEFAULTS,normalizeSettings} from './settings.js';
const toggles = ['enabled', 'sound', 'captureOnTransform', 'trail', 'voiceFallback'];
const ranges = ['size', 'volume', 'holdDuration'];
const status = document.querySelector('#save-status');
const inputs = Object.fromEntries(Object.keys(DEFAULTS).map(key => [key, document.getElementById(key)]));
let settings = { ...DEFAULTS };
let writeChain = Promise.resolve();
let revision = 0;

const normalize=normalizeSettings;

function render() {
  for (const key of toggles) inputs[key].checked = settings[key];
  inputs.character.value = settings.character;
  inputs.language.value = settings.language;
  for (const key of ranges) {
    const input = inputs[key];
    input.value = settings[key];
    input.style.setProperty('--fill', `${100 * (settings[key] - Number(input.min)) / (Number(input.max) - Number(input.min))}%`);
  }
  document.querySelector('#size-value').textContent = `${settings.size} px`;
  document.querySelector('#volume-value').textContent = `${Math.round(settings.volume / 0.5 * 100)}%`;
  document.querySelector('#holdDuration-value').textContent = `${(settings.holdDuration / 1000).toFixed(1)}초`;
  document.querySelector('#enabled-label').textContent = settings.enabled ? '요술봉과 함께하는 하루' : '마법이 잠시 쉬고 있어요';
  document.body.classList.toggle('disabled', !settings.enabled);
  inputs.volume.disabled = !settings.sound;
}

function persist() {
  const snapshot = { ...settings };
  const ownRevision = ++revision;
  status.textContent = '저장 중…';
  // Serialize writes so fast slider movement cannot restore an older setting.
  writeChain = writeChain.catch(() => {}).then(() => chrome.storage.local.set({ remiSettings: snapshot }));
  writeChain.then(() => {
    if (ownRevision === revision) status.textContent = '마법 설정을 저장했어요';
  }).catch(() => { status.textContent = '저장하지 못했어요. 다시 열어 주세요.'; });
}

async function init() {
  try {
    const stored = await chrome.storage.local.get('remiSettings');
    settings = normalize(stored.remiSettings);
    render();
    for (const key of toggles) inputs[key].addEventListener('change', () => {
      settings[key] = inputs[key].checked;
      render();
      persist();
    });
    for (const key of ranges) inputs[key].addEventListener('input', () => {
      settings[key] = Number(inputs[key].value);
      render();
      persist();
    });
    inputs.character.addEventListener('change', () => {
      settings.character = inputs.character.value;
      persist();
    });
    inputs.language.addEventListener('change', () => {
      settings.language = inputs.language.value;
      persist();
    });
    document.querySelector('#reset').addEventListener('click', () => {
      settings = { ...DEFAULTS };
      render();
      persist();
    });
    document.querySelector('#open-demo').addEventListener('click', async () => {
      await chrome.tabs.create({ url: chrome.runtime.getURL('demo.html') });
      window.close();
    });
  } catch {
    status.textContent = '확장 프로그램에서 설정을 열어 주세요.';
    for (const input of Object.values(inputs)) input.disabled = true;
  }
}

init();
