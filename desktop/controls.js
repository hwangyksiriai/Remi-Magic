import { CHARACTER_IDS, getCharacter, drawCharacter, preloadCharacterAssets } from '../src/characters.js';
import { BUNDLED_VOICES, getBundledClip } from '../src/bundled-voices.js';

const fields = ['enabled', 'frequency', 'character', 'reducedMotion', 'sound', 'language', 'volume'];
const status = document.querySelector('#status');
const voiceStatus = document.querySelector('#voice-status');
let settings;
let artworkLoaded = false;
const actionButtons = ['walk', 'group', 'transform'].map(id => document.getElementById(id));
actionButtons.forEach(button => { button.disabled = true; });

function render(next) {
  settings = next;
  for (const name of fields) {
    const field = document.getElementById(name);
    if (field.type === 'checkbox') field.checked = next[name]; else field.value = next[name];
  }
  status.textContent = next.enabled ? '자동 등장 중 · 마우스가 있는 화면에서 만나요.' : '자동 등장 일시정지 · 위 버튼으로 언제든 불러올 수 있어요.';
  updateVoiceStatus();
}

function updateVoiceStatus() {
  if (!settings) return;
  const language = settings.language === 'ja' ? 'ja' : 'ko';
  const languageName = language === 'ja' ? '일본어' : '한국어';
  const quiet = settings.sound ? '' : '소리 꺼짐 · ';
  if (settings.character === 'random') {
    const keys = Object.keys(BUNDLED_VOICES);
    const korean = keys.filter(key => key.endsWith(':ko')).length;
    const japanese = keys.filter(key => key.endsWith(':ja')).length;
    const available = language === 'ja' ? japanese : korean;
    voiceStatus.textContent = `${quiet}원본 발췌 ${keys.length}개 포함(한국어 ${korean} · 일본어 ${japanese}). 현재 ${languageName} ${available}/5명 · 미확보 조합은 효과음만 재생해요.`;
    return;
  }
  const selected = getCharacter(settings.character);
  const clip = getBundledClip(`${selected.id}:${language}`);
  voiceStatus.textContent = clip
    ? `${quiet}${selected.name} · ${languageName} 참고 영상 원음 발췌를 사용해요.`
    : `${quiet}${selected.name} · ${languageName} 원음 미확보. 소리를 켜면 효과음만 재생해요.`;
}

for (const name of fields) document.getElementById(name).addEventListener('change', async (event) => {
  const field = event.target;
  const value = field.type === 'checkbox' ? field.checked : field.type === 'range' ? Number(field.value) : field.value;
  try { render(await window.companion.setSettings({ [name]: value })); } catch { status.textContent = '설정 적용에 실패했어요. 앱을 다시 열어주세요.'; }
});
for (const mode of ['walk', 'group', 'transform']) document.getElementById(mode).addEventListener('click', async () => {
  if (!artworkLoaded) return;
  await window.companion.show(mode);
  status.textContent = '친구들을 불렀어요! 마우스가 있는 화면 아래쪽을 확인해 주세요.';
});
document.querySelector('#hide').addEventListener('click', async () => { await window.companion.hide(); render(settings); });
document.querySelector('#quit').addEventListener('click', () => window.companion.quit());
window.companion.onSettings(render);
window.companion.getSettings().then(render).catch(() => { status.textContent = '설정을 불러오지 못했어요.'; });
const canvas = document.querySelector('#friends');
const context = canvas.getContext('2d');
const assetBase = new URL('assets/', document.baseURI).href;
preloadCharacterAssets(assetBase).then(() => {
  CHARACTER_IDS.forEach((id, index) => drawCharacter(context, id, { x: 50 + index * 100, y: 79, scale: 0.40, maxWidth: 90, outfit: 'casual', assetBase }));
  artworkLoaded = true;
  canvas.dataset.artworkReady = 'true';
  actionButtons.forEach(button => { button.disabled = false; });
}).catch(error => {
  canvas.dataset.artworkError = error.message;
  status.textContent = '제공된 원본 이미지를 불러오지 못했어요. assets 폴더를 확인해 주세요.';
});
