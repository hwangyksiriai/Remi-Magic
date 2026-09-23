import { createMagicOverlay } from './engine.js';
let overlay,starting=false;
async function start(){
  if(starting||overlay||document.getElementById('remi-magic-overlay'))return;
  starting=true;
  try {
    const {remiSettings,remiAudio}=await chrome.storage.local.get(['remiSettings','remiAudio']);
    if(!chrome.runtime?.id)return;
    overlay=createMagicOverlay({settings:remiSettings,assetBase:chrome.runtime.getURL('assets/'),onCapture:async()=>{
      if(window.top!==window)throw new Error('이 영역은 삽입된 프레임이에요. 페이지 바깥 영역에서 다시 변신해 주세요.');
      const result=await chrome.runtime.sendMessage({type:'REMI_CAPTURE'});
      if(!result?.ok)throw new Error(result?.error||'확장 프로그램을 새로고침해 주세요.');
    }});
    overlay.configureAudio(remiAudio);
  }catch(error){console.warn('Remi Magic:',error.message);overlay?.dispose();overlay=undefined;}finally{starting=false;}
}
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'){if(changes.remiSettings)overlay?.configure(changes.remiSettings.newValue||{});if(changes.remiAudio)overlay?.configureAudio(changes.remiAudio.newValue||{});}});
window.addEventListener('pagehide',()=>{overlay?.dispose();overlay=undefined;});
window.addEventListener('pageshow',event=>{if(event.persisted&&window.top===window)start();});
// Avoid allocating a WebGL context in every advertisement / hidden iframe.
window.addEventListener('pointerover',event=>{if(event.isTrusted&&!overlay)start();},{passive:true});
if(window.top===window)start();
