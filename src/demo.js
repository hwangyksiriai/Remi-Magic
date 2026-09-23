import {createMagicOverlay} from './engine.js';
import {createShowcase} from './showcase.js';
import {normalizeSettings} from './settings.js';

async function init(){
const extension=typeof chrome!=='undefined'&&!!chrome.runtime?.id;
const status=document.getElementById('page-status');
const storage={async get(key){if(extension)return(await chrome.storage.local.get(key))[key];try{return JSON.parse(localStorage.getItem(key));}catch{return null;}},async set(key,value){if(extension)return chrome.storage.local.set({[key]:value});localStorage.setItem(key,JSON.stringify(value));}};
let settings=normalizeSettings(await storage.get('remiSettings')),audioClips=await storage.get('remiAudio')||{},overlay;
let postcardUrl;
// The demo exports artwork; the extension worker captures real visible webpages.
async function postcard({characterImage,character}) {
  await characterImage.decode();const card=document.createElement('canvas');card.width=1000;card.height=1200;const c=card.getContext('2d');const gradient=c.createLinearGradient(0,0,1000,1200);gradient.addColorStop(0,'#f9eaf5');gradient.addColorStop(1,'#eeeafc');c.fillStyle=gradient;c.fillRect(0,0,1000,1200);
  c.strokeStyle='#c7a0b8';c.lineWidth=2;c.strokeRect(40,40,920,1120);c.fillStyle='#a27e98';c.font='24px Georgia';c.textAlign='center';c.fillText('REMI MAGIC · A LITTLE WONDER',500,110);
  for(let i=0;i<60;i++){const x=(i*163+59)%950+25,y=(i*227+141)%950+100;c.fillStyle=['#e5abc9','#dcc675','#bda4d7'][i%3];c.font=`${12+i%4*7}px Georgia`;c.fillText(i%3?'✦':'♪',x,y);}
  const ratio=Math.min(650/characterImage.naturalWidth,825/characterImage.naturalHeight);c.drawImage(characterImage,500-characterImage.naturalWidth*ratio/2,155,characterImage.naturalWidth*ratio,characterImage.naturalHeight*ratio);
  c.fillStyle='#785b74';c.font='32px sans-serif';c.fillText(`${{remi:'레미',aiko:'사랑이',hazuki:'메이'}[character]}, 변신 완료!`,500,1060);c.fillStyle='#b397ad';c.font='18px sans-serif';c.fillText(new Date().toLocaleDateString('ko-KR')+'  ✧  나의 작은 마법',500,1110);
  const blob=await new Promise(resolve=>card.toBlob(resolve,'image/png'));if(!blob)throw new Error('이미지를 만들지 못했어요.');if(postcardUrl)URL.revokeObjectURL(postcardUrl);postcardUrl=URL.createObjectURL(blob);const a=document.getElementById('card-download');a.href=postcardUrl;a.download=`remi-magic-${character}-${Date.now()}.png`;document.getElementById('card-preview').src=postcardUrl;document.getElementById('card-result').hidden=false;
  return {message:'마법 카드가 준비됐어요. 오른쪽 아래에서 PNG로 저장해 보세요 ✦'};
}
document.getElementById('card-close').addEventListener('click',()=>{document.getElementById('card-result').hidden=true;if(postcardUrl){URL.revokeObjectURL(postcardUrl);postcardUrl=undefined;}});
try {createShowcase(document.getElementById('showcase'));overlay=createMagicOverlay({settings,assetBase:'assets/',onCapture:postcard,onState:({mode,error})=>{document.getElementById('live-status').textContent={wand:'마우스를 움직여 보세요',rhythm:'리듬탭이 돌아가고 있어요',transform:'지금, 마법 변신 중!',off:'마법이 잠시 쉬고 있어요',error:error}[mode]||'';}});overlay.configureAudio(audioClips);}catch(error){status.textContent=error.message;}
function render(){for(const key of ['enabled','trail','sound'])document.getElementById(key).checked=settings[key];for(const key of ['size','volume'])document.getElementById(key).value=settings[key];document.getElementById('size-value').textContent=`${settings.size} px`;document.getElementById('volume-value').textContent=`${Math.round(settings.volume*200)}%`;document.querySelectorAll('[data-character]').forEach(button=>{const selected=button.dataset.character===settings.character;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));});document.getElementById('volume').disabled=!settings.sound;}
let writes=Promise.resolve();
function change(patch){settings=normalizeSettings({...settings,...patch});overlay?.configure(settings);render();const snapshot={...settings};writes=writes.catch(()=>{}).then(()=>storage.set('remiSettings',snapshot)).catch(()=>{status.textContent='설정을 저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요.';});}
for(const key of ['enabled','trail','sound'])document.getElementById(key).addEventListener('change',e=>change({[key]:e.target.checked}));
for(const key of ['size','volume'])document.getElementById(key).addEventListener('input',e=>change({[key]:Number(e.target.value)}));
document.querySelectorAll('[data-character]').forEach(button=>button.addEventListener('click',()=>change({character:button.dataset.character})));
document.getElementById('transform').addEventListener('click',()=>{if(!settings.enabled)change({enabled:true});overlay?.transform();});
const audioSlot=document.getElementById('audio-slot'),audioStatus=document.getElementById('audio-status');
function renderAudio(){audioStatus.textContent=audioClips[audioSlot.value]?.name||'등록된 원본 음성 없음';}
audioSlot.addEventListener('change',renderAudio);
document.getElementById('audio-file').addEventListener('change',async event=>{
  const file=event.target.files?.[0];if(!file)return;
  try {if(file.size>700000)throw new Error('700 KB 이하의 짧은 음성 파일을 선택해 주세요.');if(!file.type.startsWith('audio/'))throw new Error('MP3, WAV, OGG 음성 파일을 선택해 주세요.');
    const Audio=window.AudioContext||window.webkitAudioContext;const decoder=new Audio();let decoded;try{decoded=await decoder.decodeAudioData(await file.arrayBuffer());}finally{await decoder.close();}if(decoded.duration>15)throw new Error('15초 이하의 짧은 음성 파일을 선택해 주세요.');
    const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});const next={...audioClips,[audioSlot.value]:{name:file.name,data}};if(JSON.stringify(next).length>5500000)throw new Error('소리 보관함이 가득 찼어요. 다른 소리를 지워 주세요.');await storage.set('remiAudio',next);audioClips=next;await overlay?.configureAudio(next);renderAudio();
  }catch(error){audioStatus.textContent=error.message||'소리를 저장하지 못했어요.';}finally{event.target.value='';}
});
document.getElementById('audio-clear').addEventListener('click',async()=>{const next={...audioClips};delete next[audioSlot.value];try{await storage.set('remiAudio',next);audioClips=next;overlay?.configureAudio(next);renderAudio();}catch{audioStatus.textContent='소리를 지우지 못했어요.';}});
if(extension)chrome.storage.onChanged.addListener((changes,area)=>{if(area!=='local')return;if(changes.remiSettings){settings=normalizeSettings(changes.remiSettings.newValue);overlay?.configure(settings);render();}if(changes.remiAudio){audioClips=changes.remiAudio.newValue||{};overlay?.configureAudio(audioClips);renderAudio();}});
render();renderAudio();
}
init().catch(error=>{document.getElementById('page-status').textContent=error.message;});
