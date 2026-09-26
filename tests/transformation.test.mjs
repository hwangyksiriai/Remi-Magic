import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleTransformation,TRANSFORMATION_PROFILES,TRANSFORMATION_PHASES} from '../src/transformation.js';

test('every character begins with the supplied before image, activates a tap, and ends with the after image',()=>{
  for(const character of ['remi','hazuki','aiko','onpu','momoko']){
    const before=sampleTransformation(0,10,{character});assert.equal(before.artworkMix,0);assert.equal(before.flash,0);assert.equal(before.done,false);
    const tapping=sampleTransformation(2.5,10,{character});assert.equal(tapping.tapVisible,true);assert.equal(tapping.artworkMix,0);assert.equal(tapping.activation,'rhythm-tap');
    const changing=sampleTransformation(5.9,10,{character});assert.ok(changing.artworkMix>0&&changing.artworkMix<1);assert.equal(changing.done,false);
    const after=sampleTransformation(10,10,{character});assert.equal(after.artworkMix,1);assert.equal(after.flash,0);assert.equal(after.tapVisible,false);assert.equal(after.done,true);
    assert.equal(TRANSFORMATION_PROFILES[character].fidelity,'supplied-original-artwork');
  }
});
test('long audio can hold the exact final image without rewinding or changing opacity',()=>{
  for(const t of [10,12,15,20]){const s=sampleTransformation(t);assert.equal(s.artworkMix,1);assert.equal(s.flash,0);assert.equal(s.done,true);}
});
test('timeline is continuous and image transition is monotonic',()=>{
  for(let i=1;i<TRANSFORMATION_PHASES.length;i++)assert.equal(TRANSFORMATION_PHASES[i].start,TRANSFORMATION_PHASES[i-1].end);
  let mix=0;for(let i=0;i<=600;i++){const s=sampleTransformation(i/60);assert.ok(s.artworkMix>=mix);mix=s.artworkMix;assert.ok(Number.isFinite(s.flash));}
  assert.equal(sampleTransformation(5.9).artworkMix,sampleTransformation(11.8,20).artworkMix);
});
test('reduced motion preserves original endpoints and the same image transition',()=>{
  for(const t of [0,2,5.9,10]){const reduced=sampleTransformation(t,10,{reducedMotion:true});const normal=sampleTransformation(t);assert.equal(reduced.artworkMix,normal.artworkMix);assert.equal(reduced.rotation,0);assert.deepEqual(reduced.camera,{scale:1,y:0});}
});
test('invalid times never produce NaN or an accidental completed capture',()=>{
  for(const value of [NaN,Infinity,-1]){const s=sampleTransformation(value,0);assert.equal(s.progress,0);assert.equal(s.done,false);assert.equal(s.artworkMix,0);}
});
