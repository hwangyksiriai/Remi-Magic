import {CHARACTER_IDS} from './characters.js';
export const DEFAULTS=Object.freeze({enabled:true,sound:true,captureOnTransform:true,trail:true,size:160,volume:.22,holdDuration:900,character:'remi',language:'ko',voiceFallback:false});
export function normalizeSettings(raw={}) {
  raw=raw&&typeof raw==='object'?raw:{};const s={...DEFAULTS};
  for(const k of ['enabled','sound','captureOnTransform','trail','voiceFallback'])if(typeof raw[k]==='boolean')s[k]=raw[k];
  for(const [k,min,max]of [['size',100,240],['volume',0,.5],['holdDuration',500,1800]])if(typeof raw[k]==='number'&&Number.isFinite(raw[k]))s[k]=Math.max(min,Math.min(max,raw[k]));
  if(CHARACTER_IDS.includes(raw.character))s.character=raw.character;
  if(['ko','ja'].includes(raw.language))s.language=raw.language;
  return s;
}
