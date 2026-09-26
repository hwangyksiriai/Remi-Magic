import {drawCharacter,getCharacter,preloadCharacterAssets} from './characters.js';

const clamp=value=>Math.max(0,Math.min(1,Number.isFinite(value)?value:0));
const ease=value=>{const t=clamp(value);return t*t*(3-2*t);};
export const TRANSFORMATION_PHASES=Object.freeze([
  {id:'before',start:0,end:.16,label:'변신 전',labelJa:'変身前'},
  {id:'tap',start:.16,end:.34,label:'리듬탭에 마법을 모아요',labelJa:'リズムタップに魔法を集めて'},
  {id:'light',start:.34,end:.5,label:'리듬탭의 빛이 감싸요',labelJa:'リズムタップの光に包まれて'},
  {id:'change',start:.5,end:.68,label:'마법 의상으로 변신해요',labelJa:'魔法の衣装に変身'},
  {id:'reveal',start:.68,end:.86,label:'변신 후 모습이 나타나요',labelJa:'変身した姿が現れる'},
  {id:'pose',start:.86,end:1,label:'변신 완료! 마법 사진 준비',labelJa:'変身完了！魔法の写真の準備'},
].map(Object.freeze));
export const TRANSFORMATION_PROFILES=Object.freeze(Object.fromEntries(['remi','hazuki','aiko','onpu','momoko'].map(id=>[id,Object.freeze({duration:10,activation:'rhythm-tap',phases:TRANSFORMATION_PHASES,fidelity:'supplied-original-artwork',referenceBasis:'User-supplied before/after PNGs; light transition is authored, not original animation frames.'})])));

/** Two real supplied images, never invented intermediate character drawings. */
export function sampleTransformation(elapsed,duration=10,{character='remi',reducedMotion=false}={}) {
  const seconds=Number.isFinite(elapsed)?Math.max(0,elapsed):0;
  const total=Number.isFinite(duration)&&duration>0?duration:10;
  const progress=clamp(seconds/total);
  const phase=TRANSFORMATION_PHASES.find(item=>progress<item.end)||TRANSFORMATION_PHASES.at(-1);
  const artworkMix=ease((progress-.5)/.18);
  // A gradual pulse, not a rapid flash. Reduced motion uses a steady soft glow.
  const flash=reducedMotion?(progress>=.34&&progress<.74?.15:0):progress<.5?ease((progress-.34)/.16)*.7:(1-ease((progress-.5)/.24))*.7;
  return {character:getCharacter(character).id,phase:phase.id,phaseLabel:phase.label,phaseLabelJa:phase.labelJa,phaseProgress:clamp((progress-phase.start)/(phase.end-phase.start)),progress,elapsed:seconds,duration:total,artworkMix,flash,tapVisible:progress>=.12&&progress<.62,tapProgress:clamp((progress-.12)/.38),activation:'rhythm-tap',pose:progress>=.86?'hero':'idle',rotation:0,camera:{scale:1,y:0},done:progress>=1};
}

/** Local rhythm-tap effect for the desktop; the web engine uses its 3D model. */
export function drawRhythmTap2D(ctx,{x,y,size=80,time=0,charge=1,reducedMotion=false}={}) {
  const palette=['#f584bf','#ff4275','#f5a21a','#efd151','#17aa6e','#00a9de','#b472c6'];
  ctx.save();ctx.translate(x,y);ctx.rotate(reducedMotion?0:Math.sin(time*.7)*.1);ctx.scale(size/114,size/114);
  const circle=(px,py,r,fill,stroke,width=1)=>{ctx.beginPath();ctx.arc(px,py,r,0,Math.PI*2);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}};
  const linear=(stops)=>{const g=ctx.createLinearGradient(-36,-48,42,48);stops.forEach(([at,color])=>g.addColorStop(at,color));return g;};
  const flower=(offset=0)=>{ctx.beginPath();for(let n=0;n<=256;n++){const a=n/256*Math.PI*2;let radius=29;for(let i=0;i<8;i++){const b=i*Math.PI/4-Math.PI/2,d=i?35:42,r=i?20:14,v=r*r-d*d*Math.sin(a-b)**2;if(v>=0)radius=Math.max(radius,d*Math.cos(a-b)+Math.sqrt(v));}const px=Math.cos(a)*radius,py=Math.sin(a)*radius+offset;n?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();};
  // Layered pink ABS housing, reflective metal seam, and one clear front cover.
  ctx.shadowColor='#e9a5c32e';ctx.shadowBlur=3;ctx.shadowOffsetY=2;flower(5);ctx.fillStyle=linear([[0,'#ffdfed'],[.55,'#e89abb'],[1,'#b96a98']]);ctx.fill();ctx.shadowBlur=0;ctx.shadowOffsetY=0;
  flower(2);ctx.fillStyle=linear([[0,'#fffde6'],[.28,'#a88033'],[.48,'#fffbe3'],[.7,'#716343'],[1,'#faf8ef']]);ctx.fill();
  flower();ctx.fillStyle=linear([[0,'#fff4fb'],[.45,'#f9aed2'],[1,'#e790bc']]);ctx.fill();ctx.strokeStyle='#fff9f1';ctx.lineWidth=1.2;ctx.stroke();
  for(let i=0;i<8;i++){
    const a=i*Math.PI/4-Math.PI/2,px=Math.cos(a)*(i?35:42),py=Math.sin(a)*(i?35:42),r=i?18.5:12.5;
    const cover=ctx.createRadialGradient(px-6,py-8,1,px,py,r);cover.addColorStop(0,'#ffffffc9');cover.addColorStop(.52,'#fff8fc30');cover.addColorStop(1,'#876c9659');circle(px,py,r,cover,'#fffdf5',1.5);circle(px,py,r-1.8,null,'#c2afbb',.6);
    if(i){
      const gem=ctx.createRadialGradient(px-4,py-5,1,px+2,py+3,12);gem.addColorStop(0,'#fffdf1');gem.addColorStop(.22,palette[i-1]);gem.addColorStop(.78,palette[i-1]);gem.addColorStop(1,'#a48caa');circle(px,py+1,10.7,gem);
      ctx.fillStyle='#ffffff80';ctx.beginPath();ctx.ellipse(px-3,py-5,4.5,2.7,-.5,0,Math.PI*2);ctx.fill();
      // Clear shell catches light independently of the colored bead beneath it.
      ctx.strokeStyle='#ffffffb8';ctx.lineWidth=2.2;ctx.beginPath();ctx.arc(px,py,r-3,3.4,4.7);ctx.stroke();
    }
  }
  const metal=linear([[0,'#fffed0'],[.26,'#a39359'],[.5,'#fffce5'],[.72,'#9c7a40'],[1,'#fff4b5']]);
  for(let i=0;i<7;i++){const a=(i+.5)*Math.PI/4;ctx.save();ctx.translate(Math.sin(a)*27,-Math.cos(a)*27);ctx.rotate(a+.4);ctx.fillStyle=metal;ctx.beginPath();ctx.moveTo(0,-4);ctx.lineTo(2,0);ctx.lineTo(0,4);ctx.lineTo(-2,0);ctx.closePath();ctx.fill();ctx.restore();}
  const face=ctx.createRadialGradient(-8,-10,0,0,0,24);face.addColorStop(0,'#f5faf5');face.addColorStop(.5,'#c8dcdc');face.addColorStop(1,'#91aeb9');circle(0,0,24.5,'#bb87a0','#fff1f6',2);circle(0,0,22.5,face,'#b5a6af',1.5);circle(0,0,19,null,'#fff0a7',1.1);
  ctx.fillStyle='#fff0a7';ctx.font='bold 29px Georgia,serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('♫',0,3);for(const [px,py,r]of [[-10,-11,1.8],[0,-15,2.4],[10,-11,1.8]])circle(px,py,r,'#fff0a7');
  ctx.font='bold 15px Georgia,serif';ctx.fillStyle=metal;ctx.fillText('♪',0,-35);ctx.font='bold 8px Georgia,serif';ctx.fillText('♪',-8,-30);ctx.fillText('♪',8,-30);
  ctx.strokeStyle='#ffffffa8';ctx.lineWidth=1.8;ctx.beginPath();ctx.arc(0,0,23,3.6,5.1);ctx.stroke();
  if(charge>0){ctx.shadowColor='#fff4c8';ctx.shadowBlur=reducedMotion?0:8*clamp(charge);circle(0,-15,2.1,'#fff5bd');}
  ctx.restore();
}

export function createTransformationStage(container,{character='remi',reducedMotion=false,assetBase='assets/',showTap=true}={}) {
  const canvas=document.createElement('canvas');canvas.className='transformation-artwork';canvas.setAttribute('role','img');canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none';container.append(canvas);
  const ctx=canvas.getContext('2d');let selected=getCharacter(character).id,disposed=false,latest=sampleTransformation(0),dimensions={};
  const ready=preloadCharacterAssets(assetBase);
  function update(elapsed,duration=10,options={}) {
    if(disposed||!ctx)return latest;
    const reduced=options.reducedMotion??reducedMotion;
    latest=sampleTransformation(elapsed,duration,{character:selected,reducedMotion:reduced});
    const bounds=container.getBoundingClientRect(),width=options.width||bounds.width||800,height=options.height||bounds.height||600,dpr=Math.min(globalThis.devicePixelRatio||1,2);
    if(width!==dimensions.width||height!==dimensions.height||dpr!==dimensions.dpr){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);dimensions={width,height,dpr};}
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
    const c=getCharacter(selected),cx=width/2,scale=Math.min(height/340,width/390,1.85),baseline=height*.94,cy=baseline-135*scale;
    const aura=ctx.createRadialGradient(cx,height*.52,0,cx,height*.52,height*.5);aura.addColorStop(0,c.lightColor+'b8');aura.addColorStop(1,c.color+'00');ctx.fillStyle=aura;ctx.fillRect(0,0,width,height);
    ctx.save();ctx.translate(cx,baseline);ctx.scale(1,.22);ctx.strokeStyle=c.color+'b8';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,110*scale,0,Math.PI*2);ctx.stroke();ctx.restore();
    drawCharacter(ctx,selected,{x:cx,y:cy,scale,maxWidth:Math.min(width*.68,340*scale),transformMix:latest.artworkMix,assetBase,reducedMotion:true});
    // Keep facial features untouched; light passes in front of the intact images.
    if(latest.progress>=.16&&latest.progress<.88){
      const count=reduced?8:26;
      for(let i=0;i<count;i++){const angle=i*2.39996+(reduced?0:elapsed*1.15);const radius=(100+i%5*8)*scale;const px=cx+Math.cos(angle)*radius,py=height*.49+Math.sin(angle)*radius*1.3;ctx.globalAlpha=.65;ctx.fillStyle=i%2?c.color:'#fff5c4';ctx.font=`${(7+i%3*3)*scale}px serif`;ctx.textAlign='center';ctx.fillText(i%3?'✦':'♪',px,py);}
      ctx.globalAlpha=1;
    }
    if(latest.flash>0){const glow=ctx.createRadialGradient(cx,height*.48,15,cx,height*.48,210*scale);glow.addColorStop(0,`rgba(255,250,240,${latest.flash})`);glow.addColorStop(1,'rgba(255,250,240,0)');ctx.fillStyle=glow;ctx.fillRect(0,0,width,height);}
    if(showTap&&latest.tapVisible)drawRhythmTap2D(ctx,{x:cx-Math.min(width*.28,165*scale),y:height*.34,size:64*scale,time:elapsed,charge:latest.tapProgress,reducedMotion:reduced});
    canvas.setAttribute('aria-label',options.language==='ja'?`${c.nameJa} · ${latest.phaseLabelJa}`:`${c.name} · ${latest.phaseLabel}`);return latest;
  }
  return {canvas,ready,update,setCharacter(id){selected=getCharacter(id).id;},getImage(){return canvas;},getState(){return latest;},dispose(){disposed=true;canvas.remove();canvas.width=canvas.height=1;}};
}
