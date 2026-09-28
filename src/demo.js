import {createMagicOverlay} from './engine.js';
import {createShowcase} from './showcase.js';
import {normalizeSettings,normalizeSite,effectiveSettings} from './settings.js';
import {CHARACTER_IDS,getCharacter,characterDataUrl} from './characters.js';
import {getBundledClip} from './bundled-voices.js';
import {summarizeVoice} from './voice-summary.js';

async function init(){
const extension=typeof chrome!=='undefined'&&!!chrome.runtime?.id;
const status=document.getElementById('page-status');
// The installed extension already contains its working files and the source ZIP.
// Its own archive cannot recursively contain another copy of itself.
if(extension)for(const link of document.querySelectorAll('a[href="downloads/remi-magic-extension.zip"]')){link.href='#install-extension';link.removeAttribute('download');link.textContent='현재 확장 사용 안내 ↗';}
// Browser-only builds on macOS/Linux can run without the optional Windows EXE.
fetch('downloads/Remi-Magic-Setup.exe',{method:'HEAD'}).then(response=>{
  if(response.ok)return;
  for(const link of document.querySelectorAll('[data-windows-setup]')){
    link.removeAttribute('href');link.removeAttribute('download');
    link.setAttribute('aria-disabled','true');link.textContent='이 빌드에는 Windows 설치 파일이 없어요';
  }
}).catch(()=>{});
for(const id of CHARACTER_IDS){const person=getCharacter(id),button=document.createElement('button');button.className='character-choice';button.dataset.character=id;button.setAttribute('aria-pressed','false');const span=document.createElement('span'),img=document.createElement('img');img.src=characterDataUrl(id,{outfit:'casual'});img.alt='';span.append(img);button.append(span,document.createTextNode(person.name));document.getElementById('character-list').append(button);}
const slots=[['click','클릭 효과음'],['scroll','리듬탭 회전'],['transform','변신 음악']];
for(const id of CHARACTER_IDS)for(const [lang,label] of [['ko','한국어'],['ja','日本語']])slots.push([id+':'+lang,getCharacter(id).name+' · '+label]);
for(const [value,label] of slots){const option=document.createElement('option');option.value=value;option.textContent=label;document.getElementById('audio-slot').append(option);}
const storage={async get(key){if(extension)return(await chrome.storage.local.get(key))[key];try{return JSON.parse(localStorage.getItem(key));}catch{return null;}},async set(key,value){if(extension)return chrome.storage.local.set({[key]:value});localStorage.setItem(key,JSON.stringify(value));}};
let settings=normalizeSettings(await storage.get('remiSettings')),audioClips=await storage.get('remiAudio')||{},overlay;
const site=/^https?:$/.test(location.protocol)?normalizeSite(location.hostname):'';
const toggles=['enabled','trail','sound','voiceFallback','languageFallback','holdToTransform','captureOnTransform','clickSound','scrollSound','spellVoice','transformSound'];
let overlayState='wand',overlayError='';
const availability=document.createElement('p');availability.className='settings-footnote';availability.setAttribute('role','status');document.getElementById('transform').before(availability);
function voiceAvailability(){
  const voice=summarizeVoice(settings,audioClips,window.speechSynthesis?.getVoices()||[]);
  availability.textContent=voice.note;
  document.getElementById('character-voice-coverage').textContent=voice.coverage;
  document.getElementById('character-playback-note').textContent=voice.note;
  document.getElementById('character-art-note').textContent='원본 비율로 그림 전체를 표시해요. 요술봉·리듬탭은 다섯 명이 같은 디자인을 사용해요.';
}
window.speechSynthesis?.addEventListener('voiceschanged',voiceAvailability);
let postcardUrl;
// The demo exports artwork; the extension worker captures real visible webpages.
async function postcard({characterImage,character,language='ko'}) {
  await characterImage.decode();const card=document.createElement('canvas');card.width=1000;card.height=1200;const c=card.getContext('2d');const gradient=c.createLinearGradient(0,0,1000,1200);gradient.addColorStop(0,'#f9eaf5');gradient.addColorStop(1,'#eeeafc');c.fillStyle=gradient;c.fillRect(0,0,1000,1200);
  c.strokeStyle='#c7a0b8';c.lineWidth=2;c.strokeRect(40,40,920,1120);c.fillStyle='#a27e98';c.font='24px Georgia';c.textAlign='center';c.fillText('REMI MAGIC · A LITTLE WONDER',500,110);
  for(let i=0;i<60;i++){const x=(i*163+59)%950+25,y=(i*227+141)%950+100;c.fillStyle=['#e5abc9','#dcc675','#bda4d7'][i%3];c.font=`${12+i%4*7}px Georgia`;c.fillText(i%3?'✦':'♪',x,y);}
  const ratio=Math.min(650/characterImage.naturalWidth,825/characterImage.naturalHeight);c.drawImage(characterImage,500-characterImage.naturalWidth*ratio/2,155,characterImage.naturalWidth*ratio,characterImage.naturalHeight*ratio);
  c.fillStyle='#785b74';c.font='32px sans-serif';c.fillText(`${language==='ja'?getCharacter(character).nameJa:getCharacter(character).name}, ${language==='ja'?'変身完了！':'변신 완료!'}`,500,1060);c.fillStyle='#b397ad';c.font='18px sans-serif';c.fillText(new Date().toLocaleDateString('ko-KR')+'  ✧  나의 작은 마법',500,1110);
  const blob=await new Promise(resolve=>card.toBlob(resolve,'image/png'));if(!blob)throw new Error('이미지를 만들지 못했어요.');if(postcardUrl)URL.revokeObjectURL(postcardUrl);postcardUrl=URL.createObjectURL(blob);const a=document.getElementById('card-download');a.href=postcardUrl;a.download=`remi-magic-${character}-${Date.now()}.png`;document.getElementById('card-preview').src=postcardUrl;document.getElementById('card-result').hidden=false;
  return {message:'마법 카드가 준비됐어요. 오른쪽 아래에서 PNG로 저장해 보세요 ✦'};
}
document.getElementById('card-close').addEventListener('click',()=>{document.getElementById('card-result').hidden=true;if(postcardUrl){URL.revokeObjectURL(postcardUrl);postcardUrl=undefined;}});
function renderState(){
  const effective=effectiveSettings(settings,site),blocked=site&&settings.disabledSites.includes(site);
  const transforming=effective.enabled&&(overlayState==='transform'||overlayState==='loading');
  document.body.classList.toggle('magic-transforming',transforming);
  const live=document.getElementById('live-status');
  live.textContent=overlayState==='error'?overlayError:!effective.enabled?(blocked?'이 사이트에서는 꺼져 있어요':'마법 커서가 꺼져 있어요'):({transform:'',loading:'원화를 불러오고 있어요',rhythm:'리듬탭이 돌아가고 있어요'}[overlayState]??(settings.mode==='focus'?'집중 모드 · 조용한 요술봉':'마우스를 움직여 보세요'));
  live.dataset.state=effective.enabled?'on':'off';
  document.querySelector('.try-hint').textContent=!effective.enabled?(settings.enabled&&blocked?'설정에서 ‘이 사이트에서 사용’을 켜면 체험할 수 있어요':'설정에서 마법 커서를 켜면 체험할 수 있어요'):settings.mode==='focus'?'집중 모드 · 요술봉과 구슬이 조용히 함께해요':settings.holdToTransform?'마우스를 움직이거나 빈 공간을 꾹 눌러 보세요 ↗':'마우스를 움직여 보세요 · 변신은 아래 버튼으로 ↗';
}
try {createShowcase(document.getElementById('showcase'));overlay=createMagicOverlay({settings,site,assetBase:'assets/',onCapture:postcard,onSettingsChange:patch=>change(patch),onState:({mode,error})=>{overlayState=mode;overlayError=error||'';renderState();}});overlay.configureAudio(audioClips);}catch(error){overlayState='error';overlayError=error.message;status.textContent=error.message;}
function render(){
  const person=getCharacter(settings.character),effective=effectiveSettings(settings,site),focused=settings.mode==='focus';
  document.getElementById('original-name').textContent=person.name;
  for(const outfit of ['casual','transformed']){const img=document.getElementById('original-'+outfit);img.src=characterDataUrl(settings.character,{outfit});img.alt=person.name+(outfit==='casual'?' 변신 전 원화':' 변신 후 원화');}
  voiceAvailability();document.getElementById('language').value=settings.language;for(const key of toggles)document.getElementById(key).checked=settings[key];for(const key of ['size','volume'])document.getElementById(key).value=settings[key];document.getElementById('size-value').textContent=`${settings.size} px`;document.getElementById('volume-value').textContent=`${Math.round(settings.volume*200)}%`;document.querySelectorAll('[data-character]').forEach(button=>{const selected=button.dataset.character===settings.character;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));});
  document.querySelectorAll('[data-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mode===settings.mode)));
  document.getElementById('mode-note').textContent=focused?'요술봉과 구슬은 그대로. 소리·궤적·길게 누르기 변신을 잠시 쉬어요. 마법 모드로 돌아가면 내 설정이 복원돼요.':'내가 선택한 소리와 효과로 마법을 즐겨요.';
  document.getElementById('enabled-note').textContent=settings.enabled?(effective.enabled?'켜짐 · 별의 중심이 클릭 위치예요':'전체 설정은 켜짐 · 이 사이트에서는 꺼져 있어요'):'꺼짐 · 기본 마우스 커서를 사용해요';
  document.getElementById('site-name').textContent=site||'사이트별 설정은 일반 웹페이지에서 사용해요';
  document.getElementById('site-enabled').checked=!!site&&!settings.disabledSites.includes(site);
  document.getElementById('site-enabled').disabled=!site;
  for(const key of ['trail','holdToTransform','sound'])document.getElementById(key).disabled=focused;
  for(const key of ['volume','clickSound','scrollSound','spellVoice','transformSound'])document.getElementById(key).disabled=!effective.sound;
  document.getElementById('gesture-note').textContent=focused?'위의 궤적·길게 누르기 설정은 저장된 값이에요. 집중 모드에서는 적용되지 않아요. 버튼으로 변신을 감상할 수 있어요.':'텍스트를 선택하거나 버튼을 누를 때는 길게 누르기 변신을 시작하지 않아요.';
  document.getElementById('sound-note').textContent=focused?`집중 모드 동안 모든 소리가 꺼져요. Alt + Shift + M은 마법 모드로 돌아갔을 때의 소리 설정을 바꿔요. 현재 저장된 소리: ${settings.sound?'켜짐':'꺼짐'}.`:!settings.sound?'전체 소리를 켜면 저장된 선택이 적용돼요.':'주문 녹음에 포함된 원래 배경음은 주문 음성과 함께 들려요.';
  const mute=document.getElementById('quick-mute');mute.disabled=focused;mute.setAttribute('aria-pressed',String(!effective.sound));
  document.getElementById('mute-label').textContent=focused?'집중 모드 · 소리 꺼짐':settings.sound?'즉시 음소거':'소리 다시 켜기';
  document.getElementById('transform').disabled=!effective.enabled||!overlay;
  document.getElementById('transform-note').textContent=!effective.enabled?(settings.enabled?'이 사이트에서 사용을 켜면 변신을 체험할 수 있어요.':'마법 커서를 켜면 변신을 체험할 수 있어요.'):`약 10초간 변신해요. Esc로 언제든 돌아올 수 있어요. ${settings.captureOnTransform?'마지막에 PNG 카드를 만들어요.':'카드 생성 없이 변신만 감상해요.'}`;
  renderState();
}
let writes=Promise.resolve(),writeId=0;
const pendingChanges=new Map();
function applySettings(value){let next=normalizeSettings(value);for(const patch of pendingChanges.values())next=normalizeSettings({...next,...patch});settings=next;overlay?.configure(settings);render();}
function change(patch,siteEnabled){
  const id=++writeId;pendingChanges.set(id,patch);applySettings(settings);
  const saved=writes.then(async()=>{
    let next;
    if(extension){
      const message=typeof siteEnabled==='boolean'?{type:'REMI_SET_SITE_ENABLED',site,enabled:siteEnabled}:{type:'REMI_UPDATE_SETTINGS',patch};
      const response=await chrome.runtime.sendMessage(message);
      if(!response?.ok)throw new Error(response?.error||'설정을 저장하지 못했어요.');
      next=(await chrome.storage.local.get('remiSettings')).remiSettings||response.settings;
    }else{next=normalizeSettings({...await storage.get('remiSettings'),...patch});await storage.set('remiSettings',next);}
    pendingChanges.delete(id);applySettings(next);
  }).catch(async error=>{
    pendingChanges.delete(id);
    try{applySettings(await storage.get('remiSettings'));}catch{}
    status.textContent='설정을 저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요.';
    throw error;
  });
  writes=saved.catch(()=>{});
  return saved;
}
const changeFromControl=(patch,siteEnabled)=>{void change(patch,siteEnabled).catch(()=>{});};
for(const key of toggles)document.getElementById(key).addEventListener('change',e=>changeFromControl({[key]:e.target.checked}));
document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>changeFromControl({mode:button.dataset.mode})));
document.getElementById('quick-mute').addEventListener('click',()=>changeFromControl({sound:!settings.sound}));
document.getElementById('site-enabled').addEventListener('change',event=>{if(!site)return;const disabledSites=settings.disabledSites.filter(host=>host!==site);if(!event.target.checked)disabledSites.push(site);changeFromControl({disabledSites},event.target.checked);});
for(const key of ['size','volume'])document.getElementById(key).addEventListener('input',e=>changeFromControl({[key]:Number(e.target.value)}));
document.getElementById('language').addEventListener('change',e=>changeFromControl({language:e.target.value}));
document.querySelectorAll('[data-character]').forEach(button=>button.addEventListener('click',()=>changeFromControl({character:button.dataset.character})));
document.getElementById('transform').addEventListener('click',()=>{if(effectiveSettings(settings,site).enabled)overlay?.transform();});
const audioSlot=document.getElementById('audio-slot'),audioStatus=document.getElementById('audio-status');
function renderAudio(){voiceAvailability();const legacy=audioSlot.value.endsWith(':ko')?audioSlot.value.split(':')[0]:'';const custom=audioClips[audioSlot.value]||audioClips[legacy],bundled=getBundledClip(audioSlot.value);audioStatus.textContent=custom?`내 녹음 · ${custom.name}`:bundled?`${bundled.name} · 영상 ${bundled.sourceStart}–${bundled.sourceEnd}초 · 배경음 포함`:audioSlot.value.includes(':')?'이 언어의 캐릭터 원음은 아직 없어요.':'기본 마법 효과음';document.getElementById('audio-clear').disabled=!custom;}
audioSlot.addEventListener('change',renderAudio);
document.getElementById('audio-file').addEventListener('change',async event=>{
  const file=event.target.files?.[0],slot=audioSlot.value;if(!file)return;
  event.target.disabled=true;document.getElementById('audio-clear').disabled=true;
  try {if(file.size>700000)throw new Error('700 KB 이하의 짧은 음성 파일을 선택해 주세요.');if(!file.type.startsWith('audio/'))throw new Error('MP3, WAV, OGG 음성 파일을 선택해 주세요.');
    const Audio=window.AudioContext||window.webkitAudioContext;const decoder=new Audio();let decoded;try{decoded=await decoder.decodeAudioData(await file.arrayBuffer());}finally{await decoder.close();}if(decoded.duration>15)throw new Error('15초 이하의 짧은 음성 파일을 선택해 주세요.');
    const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});const next={...audioClips,[slot]:{name:file.name,data}};if(JSON.stringify(next).length>7500000)throw new Error('소리 보관함이 가득 찼어요. 다른 소리를 지워 주세요.');await storage.set('remiAudio',next);audioClips=next;await overlay?.configureAudio(next);renderAudio();
  }catch(error){audioStatus.textContent=error.message||'소리를 저장하지 못했어요.';}finally{event.target.value='';event.target.disabled=false;document.getElementById('audio-clear').disabled=false;}
});
document.getElementById('audio-clear').addEventListener('click',async()=>{const next={...audioClips};delete next[audioSlot.value];if(audioSlot.value.endsWith(':ko'))delete next[audioSlot.value.split(':')[0]];try{await storage.set('remiAudio',next);audioClips=next;overlay?.configureAudio(next);renderAudio();}catch{audioStatus.textContent='소리를 지우지 못했어요.';}});
if(extension)chrome.storage.onChanged.addListener((changes,area)=>{if(area!=='local')return;if(changes.remiSettings)applySettings(changes.remiSettings.newValue);if(changes.remiAudio){audioClips=changes.remiAudio.newValue||{};overlay?.configureAudio(audioClips);renderAudio();}});
else window.addEventListener('storage',event=>{
  if(event.storageArea!==localStorage)return;
  try{
    if(event.key==='remiSettings'||event.key===null)applySettings(JSON.parse(localStorage.getItem('remiSettings')));
    if(event.key==='remiAudio'||event.key===null){audioClips=JSON.parse(localStorage.getItem('remiAudio'))||{};overlay?.configureAudio(audioClips);renderAudio();}
  }catch{status.textContent='다른 탭의 설정을 불러오지 못했어요. 페이지를 새로고침해 주세요.';}
});
render();renderAudio();
}
init().catch(error=>{document.getElementById('page-status').textContent=error.message;});
