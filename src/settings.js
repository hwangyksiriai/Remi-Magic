import {CHARACTER_IDS} from './characters.js';
export const DEFAULTS=Object.freeze({enabled:true,sound:true,captureOnTransform:true,trail:true,size:160,volume:.22,holdDuration:900,character:'remi',language:'ko',voiceFallback:false,languageFallback:true,mode:'magic',clickSound:true,scrollSound:true,spellVoice:true,transformSound:true,holdToTransform:true,disabledSites:Object.freeze([])});

/** Store exact hostnames so a pasted URL does not retain paths or credentials. */
export function normalizeSite(input) {
  if(typeof input!=='string')return '';
  const value=input.trim();
  if(!value||value.length>2048||/\s|\\|\*/.test(value))return '';
  const hasScheme=/^[a-z][a-z\d+.-]*:\/\//i.test(value);
  if(!hasScheme&&(/[\/?#@]/.test(value)||/^[a-z][a-z\d+.-]*:(?!\d+(?:$|\/))/i.test(value)))return '';
  try {
    const url=new URL(hasScheme?value:`https://${value}`);
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return '';
    const host=url.hostname.toLowerCase().replace(/\.$/,'');
    if(host.startsWith('[')&&host.endsWith(']'))return host;
    if(!host||host.length>253||!host.split('.').every(label=>/^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/.test(label)))return '';
    return host;
  }catch{return '';}
}

export function normalizeSettings(raw={}) {
  raw=raw&&typeof raw==='object'?raw:{};const s={...DEFAULTS,disabledSites:[]};
  for(const k of ['enabled','sound','captureOnTransform','trail','voiceFallback','languageFallback','clickSound','scrollSound','spellVoice','transformSound','holdToTransform'])if(typeof raw[k]==='boolean')s[k]=raw[k];
  for(const [k,min,max]of [['size',100,240],['volume',0,.5],['holdDuration',500,1800]])if(typeof raw[k]==='number'&&Number.isFinite(raw[k]))s[k]=Math.max(min,Math.min(max,raw[k]));
  if(CHARACTER_IDS.includes(raw.character))s.character=raw.character;
  if(['ko','ja'].includes(raw.language))s.language=raw.language;
  if(['magic','focus'].includes(raw.mode))s.mode=raw.mode;
  if(Array.isArray(raw.disabledSites)){
    const sites=new Set();
    for(const input of raw.disabledSites){
      const site=normalizeSite(input);
      if(site)sites.add(site);
      if(sites.size===200)break;
    }
    s.disabledSites=[...sites];
  }
  return s;
}

/** Derive runtime switches without changing the user's saved magic preferences. */
export function effectiveSettings(raw,site='') {
  const s=normalizeSettings(raw);
  if(s.disabledSites.includes(normalizeSite(site)))s.enabled=false;
  if(s.mode==='focus'){s.sound=false;s.trail=false;s.holdToTransform=false;}
  return s;
}
