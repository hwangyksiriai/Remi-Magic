import * as T from 'three';
import { createProductLighting } from './product-lighting.js';
import { createWand,createRhythmTap,updateWand,updateRhythmTap,disposeModel } from './models.js';
import { HoldGesture } from './gesture.js';
import { MagicAudio,describeVoiceStatus } from './audio.js';
import { normalizeSettings,effectiveSettings } from './settings.js';
import { cursorIndicator,isMuteShortcut } from './cursor-context.js';
import { POINTER_HALF_SIZE,POINTER_STYLES,POINTER_MARKUP,updatePointerCue } from './cursor-art.js';
import {characterDataUrl} from './characters.js';
import {createTransformationStage} from './transformation.js';

const PALETTE=['#ff77b8','#ffa64d','#ffe088','#8ddde7','#c7a3ff','#fff8ca'];
export function createMagicOverlay({settings={},site=globalThis.location?.hostname||'',assetBase='assets/',onCapture=null,onState=()=>{},onSettingsChange=()=>{}}={}) {
  let preferences=normalizeSettings(settings),config=effectiveSettings(preferences,site),disposed=false,raf=0,lastTime=0,lastMove=0,inside=false,charge=0,scrollUntil=0,spin=0,spinSpeed=0,sequence=null,fullscreenBlocked=false;
  let point={x:innerWidth/2,y:innerHeight/2},previous={...point},framePoint={...point},particles=[],ribbon=[],toastTimer;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const host=document.createElement('div');host.id='remi-magic-overlay';host.setAttribute('aria-hidden','true');
  host.style.cssText='all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483647;display:block;contain:layout style;';
  const shadow=host.attachShadow({mode:'closed'});
  shadow.innerHTML=`<style>
    :host{pointer-events:none!important}*{box-sizing:border-box}canvas{position:absolute;inset:0;display:block;width:100%;height:100%;pointer-events:none}
    .aura{position:absolute;inset:0;opacity:0;background:radial-gradient(ellipse at 50% 48%,#fff4fd96 0%,#f9cdea44 28%,transparent 67%);transition:opacity .3s}
    .aura.show{opacity:1}.character{position:absolute;left:50%;top:48%;max-width:42vw;height:min(56vh,480px);object-fit:contain;opacity:0;transform:translate(-50%,-50%) scale(.15);filter:drop-shadow(0 0 24px #fff5ba);will-change:transform,opacity}
    .toast{position:absolute;bottom:28px;left:50%;transform:translateX(-50%);padding:13px 22px;max-width:90vw;background:#fffaf7f5;border:1px solid #f0d7df;border-radius:18px;color:#684c63;font:13px/1.5 system-ui,sans-serif;box-shadow:0 8px 35px #5a234d20;opacity:0;transition:opacity .2s}.toast.show{opacity:1}
    .charge{position:absolute;width:52px;height:52px;border-radius:50%;background:conic-gradient(#ff7daf var(--progress),#ffdcec44 0);mask:radial-gradient(transparent 59%,#000 61%);opacity:0}
    ${POINTER_STYLES}
    .transformation-stage{position:absolute;inset:3% 8% 8%;display:none;pointer-events:none}.transformation-stage.show{display:block}.character{display:none}
  </style><div class="aura"></div><canvas class="scene"></canvas><canvas class="particles"></canvas><div class="transformation-stage"></div><img class="character" alt=""><div class="charge"></div>${POINTER_MARKUP}<div class="toast"></div>`;
  document.documentElement.append(host);
  const cursorStyle=document.createElement('style');cursorStyle.textContent='html.remi-cursor-active,html.remi-cursor-active *{cursor:none!important}';document.documentElement.append(cursorStyle);
  const canvas=shadow.querySelector('.scene'),fx=shadow.querySelector('.particles'),ctx=fx.getContext('2d');
  const char=shadow.querySelector('.character'),aura=shadow.querySelector('.aura'),chargeRing=shadow.querySelector('.charge'),toast=shadow.querySelector('.toast');
  const pointer=shadow.querySelector('.pointer'),pointerBadge=shadow.querySelector('.pointer-badge');
  let pointerTarget=null,pointerStyle=null,pointerReadAt=0,pointerDirty=false,reportedMode='';
  const sound=new MagicAudio();sound.configure(config);
  const stageElement=shadow.querySelector('.transformation-stage');
  const stage=createTransformationStage(stageElement,{character:config.character,reducedMotion:reduced.matches,assetBase});
  stage.ready.catch(()=>{}); // Report a loading failure on the user's transform request.
  let renderer;
  try {renderer=new T.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power',preserveDrawingBuffer:true});}
  catch {host.remove();cursorStyle.remove();throw new Error('3D 요술봉에는 WebGL을 지원하는 브라우저가 필요해요. 하드웨어 가속 설정을 확인해 주세요.');}
  renderer.setClearColor(0,0);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=0.92;
  const scene=new T.Scene(),camera=new T.OrthographicCamera(-innerWidth/2,innerWidth/2,innerHeight/2,-innerHeight/2,.1,2000);camera.position.z=1000;
  const lighting=createProductLighting(renderer,scene);
  const wand=createWand(),tap=createRhythmTap();scene.add(wand,tap);
  const abort=new AbortController(),signal=abort.signal;
  const gesture=new HoldGesture({holdDuration:config.holdDuration,onCharge:p=>{charge=p;},onTrigger:()=>startTransform(),onCancel:()=>{charge=0;}});
  const asset=()=>characterDataUrl(config.character,{outfit:'transformed',assetBase});char.src=asset();
  let width=innerWidth,height=innerHeight,dpr=Math.min(devicePixelRatio||1,1.5);

  function state(mode) {const actual=!config.enabled?'off':mode;reportedMode=actual;host.dataset.mode=config.mode;host.dataset.enabled=String(config.enabled);onState({mode:actual,character:config.character,settings:{...preferences},effectiveSettings:{...config}});}
  function resize() {width=innerWidth;height=innerHeight;dpr=Math.min(devicePixelRatio||1,1.5);renderer.setPixelRatio(dpr);renderer.setSize(width,height,false);fx.width=Math.round(width*dpr);fx.height=Math.round(height*dpr);camera.left=-width/2;camera.right=width/2;camera.top=height/2;camera.bottom=-height/2;camera.updateProjectionMatrix();wake();}
  function toastMessage(text) {toast.textContent=text;toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),4200);}
  function hideCursor() {const visible=config.enabled&&inside&&!disposed&&!fullscreenBlocked&&!sequence;document.documentElement.classList.toggle('remi-cursor-active',visible);pointer.style.display=visible?'block':'none';}
  function textAtPoint(target,x,y) {
    // Web apps often put selectable text directly inside a div. Check the actual
    // glyph rectangle so that empty space in a large container still accepts a hold.
    try {
      const caret=document.caretPositionFromPoint?.(x,y);
      const fallback=caret?null:document.caretRangeFromPoint?.(x,y);
      const node=caret?.offsetNode||fallback?.startContainer,offset=caret?.offset??fallback?.startOffset;
      if(node?.nodeType!==Node.TEXT_NODE||!target.contains(node)||!node.textContent.trim())return false;
      const range=document.createRange(),length=node.textContent.length;
      for(const index of [offset-1,offset]){
        if(index<0||index>=length)continue;
        range.setStart(node,index);range.setEnd(node,index+1);
        for(const rect of range.getClientRects())if(x>=rect.left&&x<=rect.right&&y>=rect.top&&y<=rect.bottom)return true;
      }
    }catch{/* A detached node cannot be selected. */}
    return false;
  }
  function updatePointer(event) {
    const target=event.composedPath().find(el=>el instanceof Element&&el!==host);if(!target)return;
    const now=performance.now();
    // Read the site's own cursor on target changes (and at most five times a
    // second). Our cursor:none rule would otherwise hide CSS resize/drag cues.
    if(target!==pointerTarget||now-pointerReadAt>200){
      const sheet=cursorStyle.sheet;if(sheet)sheet.disabled=true;
      try{const native=getComputedStyle(target);pointerStyle={cursor:native.cursor,resize:native.resize,userSelect:native.userSelect};}finally{if(sheet)sheet.disabled=false;}
      pointerTarget=target;pointerReadAt=now;
    }
    const control=target.closest('button,a[href],input,textarea,select,[role="button"],[role="link"],[role="checkbox"],[role="switch"],[role="slider"],[contenteditable]:not([contenteditable="false"])');
    const editable=!!(control&&(control.matches('textarea,[contenteditable]:not([contenteditable="false"])')||control.matches('input:not([type]),input[type="text"],input[type="email"],input[type="url"],input[type="search"],input[type="password"],input[type="tel"],input[type="number"]')));
    const bounds=pointerStyle?.resize&&pointerStyle.resize!=='none'?target.getBoundingClientRect():null;
    const selectableText=!control&&pointerStyle?.userSelect!=='none'&&textAtPoint(target,event.clientX,event.clientY);
    const indicator=cursorIndicator({cursor:pointerStyle?.cursor,disabled:!!control?.matches(':disabled,[aria-disabled="true"]'),editable,interactive:!!control&&!editable,draggable:!!target.closest('[draggable="true"]'),text:selectableText,resizeCorner:!!bounds&&event.clientX>bounds.right-18&&event.clientY>bounds.bottom-18});
    pointer.dataset.kind=indicator.kind;updatePointerCue(pointerBadge,indicator.symbol);pointer.title=indicator.label;host.dataset.cursorState=indicator.kind;
    pointer.style.transform=`translate(${point.x-POINTER_HALF_SIZE}px,${point.y-POINTER_HALF_SIZE}px)`;
    pointerBadge.style.left=point.x>width-30?'-16px':'18px';pointerBadge.style.top=point.y<22?'18px':'-10px';
  }
  function spawn(x,y,count=5,burst=false) {if(config.mode==='focus'||(!config.trail&&!burst))return;const amount=reduced.matches?Math.min(3,count):count;for(let i=0;i<amount;i++){const a=Math.random()*Math.PI*2,s=burst?45+Math.random()*190:12+Math.random()*60;particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-20,life:0,max:burst?.65+Math.random()*.7:.4+Math.random()*.5,size:burst?3+Math.random()*6:1+Math.random()*4,angle:Math.random()*Math.PI,kind:Math.random(),color:PALETTE[Math.floor(Math.random()*PALETTE.length)]});}if(particles.length>280)particles.splice(0,particles.length-280);}
  function blocked(event) {return ['text','link','resize','drag','blocked'].includes(pointer.dataset.kind)||event.composedPath().some(el=>el instanceof Element&&(el.matches('input,textarea,select,button,a,[role="button"],[role="link"],[role="checkbox"],[role="switch"],[role="slider"],[contenteditable]:not([contenteditable="false"]),video,audio')||el.isContentEditable));}
  function move(event) {if(fullscreenBlocked||!event.isTrusted||event.pointerType==='touch')return;point={x:event.clientX,y:event.clientY};inside=true;lastMove=performance.now();gesture.pointerMove(point,lastMove);if(config.enabled){updatePointer(event);const dist=Math.hypot(point.x-previous.x,point.y-previous.y);if(dist>2)spawn(point.x,point.y,Math.min(8,Math.ceil(dist/6)));if(config.trail){ribbon.push({...point,life:0});if(ribbon.length>35)ribbon.shift();}previous={...point};}hideCursor();wake();}
  function down(event) {if(fullscreenBlocked||!event.isTrusted||!config.enabled||event.pointerType==='touch')return;sound.unlock();if(event.button!==0)return;inside=true;point={x:event.clientX,y:event.clientY};updatePointer(event);hideCursor();if(config.holdToTransform)gesture.pointerDown({x:point.x,y:point.y,button:0,blocked:blocked(event)||!!sequence},performance.now());wake();}
  function click(event) {if(fullscreenBlocked||!event.isTrusted||!config.enabled||event.button!==0)return;sound.unlock();if(!sequence){sound.click();spawn(event.clientX,event.clientY,38,true);wake();}}
  function wheel(event) {if(fullscreenBlocked||!event.isTrusted||!config.enabled||event.ctrlKey||event.deltaY===0)return;gesture.cancel('scroll');point={x:event.clientX,y:event.clientY};inside=true;updatePointer(event);scrollUntil=performance.now()+750;spinSpeed=Math.sign(event.deltaY)*Math.min(17,5+Math.abs(event.deltaY)*.05);sound.scroll(Math.sign(event.deltaY));spawn(point.x,point.y,6);hideCursor();if(!sequence)state('rhythm');wake();}
  async function startTransform() {
    if(!config.enabled||sequence||disposed||document.hidden||fullscreenBlocked)return;
    gesture.cancel('transform');charge=0;
    const current={start:0,loading:true,duration:10,character:config.character,language:config.language,capturing:false,finished:false,voiceDone:false,end:0};
    sequence=current;hideCursor();const audioReady=sound.unlock();char.src=asset();state('loading');
    try{await Promise.all([stage.ready,char.decode(),audioReady]);}catch{if(sequence===current){stopTransform();toastMessage('캐릭터 원화를 불러오지 못했어요. 확장 프로그램을 새로고침해 주세요.');}return;}
    if(sequence!==current||disposed||document.hidden)return;
    current.loading=false;current.duration=sound.duration(current.character);current.start=performance.now();stage.setCharacter(current.character);stageElement.classList.add('show');
    Promise.resolve(sound.transform(current.character)).then(result=>{
      if(sequence!==current||disposed)return;
      current.voiceDone=true;
      if(result?.reason&&result.source!=='muted')toastMessage(describeVoiceStatus(result,current.language));
      wake();
    }).catch(()=>{if(sequence===current){current.voiceDone=true;toastMessage('음성을 재생하지 못했어요.');wake();}});
    aura.classList.add('show');spawn(width/2,height/2,85,true);state('transform');wake();
  }
  function stopTransform() {sequence=null;stageElement.classList.remove('show');char.style.opacity=0;aura.classList.remove('show');sound.stop();lastMove=performance.now();hideCursor();state('wand');wake();}
  function suspend() {sound.stop();inside=false;gesture.cancel('blur');gesture.pointerUp();charge=0;hideCursor();if(sequence)stopTransform();particles=[];ribbon=[];if(raf)cancelAnimationFrame(raf);raf=0;renderer.clear();ctx.clearRect(0,0,fx.width,fx.height);chargeRing.style.opacity=0;}
  async function finishCapture(current) {
    current.capturing=true;
    try {if(config.captureOnTransform&&onCapture){const result=await onCapture({canvas,fx,characterImage:char,character:current.character,language:current.language,width,height});if(sequence!==current)return;toastMessage(result?.message||'마법 사진의 저장 위치를 선택해 주세요 ✦');sound.capture();}else{toastMessage('변신 완료! ✦');}}
    catch(error){if(!disposed)toastMessage(error.message||'사진 저장을 완료하지 못했어요.');}
    finally{if(sequence===current){current.finished=true;current.end=performance.now()+700;wake();}}
  }
  function drawParticles(dt) {
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
    ribbon=ribbon.filter(p=>(p.life+=dt)<.38);
    if(config.trail&&!reduced.matches){for(let i=1;i<ribbon.length;i++){const a=ribbon[i-1],b=ribbon[i];ctx.save();ctx.strokeStyle=PALETTE[i%PALETTE.length];ctx.globalAlpha=(1-b.life/.38)*.55;ctx.lineWidth=(1-b.life/.38)*3;ctx.shadowColor=ctx.strokeStyle;ctx.shadowBlur=9;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.restore();}}
    particles=particles.filter(p=>p.life<p.max);
    for(const p of particles){p.life+=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=22*dt;const f=1-p.life/p.max;if(f<=0)continue;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle+p.life);ctx.globalAlpha=f;ctx.fillStyle=p.color;ctx.shadowBlur=reduced.matches?0:8;ctx.shadowColor=p.color;const r=p.size*(.5+f*.5);if(p.kind>.85){ctx.font=`${r*4}px Georgia`;ctx.fillText('♪',0,0);}else if(p.kind>.35){ctx.beginPath();for(let i=0;i<8;i++){const a=i*Math.PI/4,rr=i%2?r*.23:r;ctx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);}ctx.closePath();ctx.fill();}else{ctx.beginPath();ctx.arc(0,0,r*.65,0,Math.PI*2);ctx.fill();}ctx.restore();}
  }
  function frame(now) {
    raf=0;if(disposed||!config.enabled||document.hidden)return;
    const dt=Math.min((now-lastTime)/1000||.016,.04);lastTime=now;gesture.tick(now);
    if(pointerDirty&&inside){pointerDirty=false;pointerTarget=null;updatePointer({clientX:point.x,clientY:point.y,composedPath:()=>[document.elementFromPoint(point.x,point.y)]});}
    const dx=(point.x-framePoint.x)*.08,dy=(point.y-framePoint.y)*.08;framePoint={...point};
    updateWand(wand,{time:now/1000,dx,dy,dt,reducedMotion:reduced.matches});updateRhythmTap(tap,now/1000,charge);
    const wheelMode=now<scrollUntil&&!sequence;wand.visible=inside&&!wheelMode&&!sequence;tap.visible=inside&&wheelMode;
    if(!wheelMode&&!sequence&&reportedMode==='rhythm')state('wand');
    const scale=config.size/wand.userData.height;wand.scale.setScalar(scale);wand.rotation.set(.12,.26+Math.sin(now*.001)*.07,.32+T.MathUtils.clamp(-dx*.012,-.16,.16));
    // Place the upper tip exactly at the pointer, without a trailing cursor delay.
    const tip=new T.Vector3(0,wand.userData.tipY*scale,0).applyEuler(wand.rotation);wand.position.set(point.x-width/2-tip.x,height/2-point.y-tip.y,0);
    spin+=spinSpeed*dt;spinSpeed*=Math.exp(-dt*3);tap.rotation.set(.28+Math.sin(now*.002)*.05,.42,spin);tap.scale.setScalar(config.size*.65/tap.userData.height);tap.position.set(point.x-width/2,height/2-point.y,20);
    chargeRing.style.opacity=charge>0?'1':'0';chargeRing.style.transform=`translate(${point.x-26}px,${point.y-26}px)`;chargeRing.style.setProperty('--progress',`${charge*360}deg`);
    if(sequence&&!sequence.loading){const elapsed=(now-sequence.start)/1000;const phase=elapsed/sequence.duration;
      stage.update(elapsed,sequence.duration,{reducedMotion:reduced.matches,language:sequence.language});
      if(phase<.9&&config.trail&&!reduced.matches){const a=elapsed*6;spawn(width/2+Math.cos(a)*140,height*.48+Math.sin(a)*150,2);}
      if(sequence.finished&&now>sequence.end)stopTransform();
    }
    drawParticles(dt);renderer.render(scene,camera);
    // Capture only after the final pose has been rendered, and only once.
    if(sequence&&!sequence.loading&&!sequence.capturing&&sequence.voiceDone&&(now-sequence.start)>sequence.duration*1000)finishCapture(sequence);
    // Keep the visible wand's beads alive even when the pointer is stationary.
    if((inside&&(!reduced.matches||now-lastMove<2500))||particles.length||sequence||gesture.state==='charging'||now<scrollUntil)if(!raf)raf=requestAnimationFrame(frame);
  }
  function wake(){if(!raf&&!disposed&&config.enabled&&!document.hidden){lastTime=performance.now();if(!raf)raf=requestAnimationFrame(frame);}}
  function configure(next) {const previousConfig=config;preferences=normalizeSettings({...preferences,...next});config=effectiveSettings(preferences,site);if(sequence&&(previousConfig.character!==config.character||previousConfig.language!==config.language||previousConfig.mode!==config.mode))stopTransform();if(!config.holdToTransform)gesture.cancel('mode');if(!config.trail){particles=[];ribbon=[];}sound.configure(config);gesture.updateConfig(config);char.src=asset();if(!config.enabled)suspend();else wake();hideCursor();state(!config.enabled?'off':sequence?(sequence.loading?'loading':'transform'):'wand');}
  function toggleMute() {
    const patch={sound:!preferences.sound};configure(patch);
    toastMessage(config.mode==='focus'?(patch.sound?'마법 모드로 돌아가면 소리가 켜져요.':'마법 모드에서도 소리를 꺼 두었어요.'):patch.sound?'마법 소리를 켰어요.':'마법 소리를 껐어요.');
    try{Promise.resolve(onSettingsChange(patch)).catch(()=>toastMessage('이 화면에는 적용했지만 소리 설정을 저장하지 못했어요.'));}catch{toastMessage('이 화면에는 적용했지만 소리 설정을 저장하지 못했어요.');}
  }
  function dispose() {if(disposed)return;suspend();disposed=true;abort.abort();clearTimeout(toastTimer);stage.dispose();sound.dispose();disposeModel(wand);disposeModel(tap);lighting.dispose();renderer.dispose();host.remove();cursorStyle.remove();document.documentElement.classList.remove('remi-cursor-active');}
  window.addEventListener('pointermove',move,{passive:true,signal});window.addEventListener('pointerdown',down,{passive:true,capture:true,signal});window.addEventListener('pointerup',()=>gesture.pointerUp(),{passive:true,capture:true,signal});window.addEventListener('pointercancel',()=>gesture.pointerUp(),{signal});window.addEventListener('click',click,{passive:true,capture:true,signal});window.addEventListener('wheel',wheel,{passive:true,signal});window.addEventListener('blur',suspend,{signal});
  document.addEventListener('pointerout',e=>{if(!e.relatedTarget)suspend();},{signal});
  window.addEventListener('scroll',()=>{if(inside&&config.enabled){pointerDirty=true;wake();}},{passive:true,capture:true,signal});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();else wake();},{signal});
  document.addEventListener('fullscreenchange',()=>{fullscreenBlocked=!!document.fullscreenElement?.matches('video,iframe,canvas,img,object,embed');if(fullscreenBlocked)suspend();else(document.fullscreenElement||document.documentElement).append(host);resize();},{signal});
  window.addEventListener('resize',resize,{signal});window.addEventListener('keydown',e=>{if(isMuteShortcut(e)){e.preventDefault();toggleMute();}else if(e.key==='Escape'){gesture.cancel();stopTransform();}else sound.unlock();},{signal});
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();dispose();onState({mode:'error',error:'3D 렌더링이 중단되어 기본 커서를 복구했어요. 페이지를 새로고침해 주세요.'});},{signal});
  resize();state(config.enabled?'wand':'off');
  return {configure,configureAudio:clips=>sound.setClips(clips),transform:startTransform,stopTransform,toggleMute,dispose,get settings(){return {...preferences};},toast:toastMessage};
}
