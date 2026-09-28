import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,normalizeSettings,normalizeSite,effectiveSettings} from '../src/settings.js';

test('old settings acquire enabled channel defaults without sharing their site lists',()=>{
  const first=normalizeSettings({volume:.3}),second=normalizeSettings();
  assert.equal(first.mode,'magic');
  for(const key of ['clickSound','scrollSound','spellVoice','transformSound','holdToTransform'])assert.equal(first[key],true);
  assert.ok(Object.isFrozen(DEFAULTS.disabledSites));
  first.disabledSites.push('example.com');
  assert.deepEqual(second.disabledSites,[]);
  assert.deepEqual(DEFAULTS.disabledSites,[]);
});

test('site normalization uses exact canonical hostnames and rejects unsupported inputs',()=>{
  for(const [input,host] of [
    [' HTTPS://Example.COM:8080/a?q=1#top ','example.com'],
    ['Example.COM.','example.com'],['localhost:4173','localhost'],
    ['http://127.0.0.1:4173/','127.0.0.1'],['https://[::1]:4173/','[::1]'],
    ['https://한글.com/','xn--bj0bj06e.com'],
  ])assert.equal(normalizeSite(input),host,input);
  for(const input of [null,7,{},'', 'example .com','ftp://example.com','file:///tmp/page.html',
    'javascript:alert(1)','https://name:password@example.com','example.com/path',
    '*.example.com','https://example.com\\@other.com','https://-bad.example','https://a..com']){
    assert.equal(normalizeSite(input),'',String(input));
  }
});

test('saved site list is validated, deduplicated and bounded',()=>{
  const raw={disabledSites:['EXAMPLE.COM','https://example.com/path','ftp://other.test',...Array.from({length:250},(_,i)=>`site${i}.test`)]};
  const settings=normalizeSettings(raw);
  assert.equal(settings.disabledSites.length,200);
  assert.equal(settings.disabledSites[0],'example.com');
  assert.equal(settings.disabledSites[199],'site198.test');
  assert.equal(raw.disabledSites.length,253);
  assert.deepEqual(normalizeSettings({disabledSites:'example.com'}).disabledSites,[]);
});

test('focus mode suppresses runtime distractions and preserves magic preferences',()=>{
  const saved=normalizeSettings({mode:'focus',trail:true,sound:true,holdToTransform:true,clickSound:false,scrollSound:true,captureOnTransform:false});
  const focused=effectiveSettings(saved,'https://example.com');
  assert.equal(focused.enabled,true);
  assert.equal(focused.sound,false);
  assert.equal(focused.trail,false);
  assert.equal(focused.holdToTransform,false);
  assert.equal(focused.clickSound,false);
  assert.equal(focused.scrollSound,true);
  assert.equal(focused.captureOnTransform,false);
  assert.equal(saved.sound,true);
  assert.equal(saved.trail,true);
  assert.equal(saved.holdToTransform,true);
  const restored=effectiveSettings({...saved,mode:'magic'});
  assert.equal(restored.sound,true);
  assert.equal(restored.trail,true);
  assert.equal(restored.holdToTransform,true);
});

test('site disabling is exact and cannot re-enable a global disabled preference',()=>{
  const saved={disabledSites:['example.com']};
  assert.equal(effectiveSettings(saved,'https://EXAMPLE.COM/path').enabled,false);
  assert.equal(effectiveSettings(saved,'https://sub.example.com').enabled,true);
  assert.equal(effectiveSettings(saved,'').enabled,true);
  assert.equal(effectiveSettings({enabled:false},'https://elsewhere.com').enabled,false);
  assert.equal(saved.enabled,undefined);
});

test('channel and mode validation keeps defaults for malformed stored values',()=>{
  const settings=normalizeSettings({mode:'quiet',clickSound:'false',scrollSound:0,spellVoice:null,transformSound:[],holdToTransform:undefined});
  assert.equal(settings.mode,'magic');
  for(const key of ['clickSound','scrollSound','spellVoice','transformSound','holdToTransform'])assert.equal(settings[key],true);
  for(const value of [null,[],7])assert.deepEqual(normalizeSettings(value),normalizeSettings());
});

test('recording language fallback preserves old behavior and validates its independent preference',()=>{
  assert.equal(DEFAULTS.languageFallback,true);
  assert.equal(normalizeSettings({language:'ja',voiceFallback:false}).languageFallback,true);
  for(const value of [false,true]){
    const settings=normalizeSettings({languageFallback:value,voiceFallback:!value,mode:'focus'});
    assert.equal(settings.languageFallback,value);
    assert.equal(settings.voiceFallback,!value);
    assert.equal(effectiveSettings(settings).languageFallback,value);
  }
  for(const value of ['false',0,null,[]])assert.equal(normalizeSettings({languageFallback:value}).languageFallback,true);
});
