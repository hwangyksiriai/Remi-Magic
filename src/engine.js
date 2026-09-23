import * as T from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createWand,createRhythmTap,updateWand,updateRhythmTap,disposeModel } from './models.js';
import { HoldGesture } from './gesture.js';
import { MagicAudio } from './audio.js';
import { normalizeSettings } from './settings.js';

const PALETTE=['#ff77b8','#ffa64d','#ffe088','#8ddde7','#c7a3ff','#fff8ca'];
const NAMES={remi:'레미',aiko:'사랑이',hazuki:'메이'};
export function createMagicOverlay({settings={},assetBase='assets/',onCapture=null,onState=()=>{}}={}) {
  let config=normalizeSettings(settings),disposed=false,raf=0,lastTime=0,lastMove=0,inside=false,charge=0,scrollUntil=0,spin=0,spinSpeed=0,sequence=null,fullscreenBlocked=false;
  let point={x:innerWidth/2,y:innerHeight/2},previous={...point},framePoint={...point},particles=[],ribbon=[],toastTimer;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const host=document.createElement('div');host.id='remi-magic-overlay';host.setAttribute('aria-hidden','true');
  host.style.cssText='all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483647;display:block;contain:layout style;';
  const shadow=host.attachShadow({mode:'closed'});
  shadow.innerHTML=`<style>
    :host{pointer-events:none!important}*{box-sizing:border-box}canvas{position:absolute;inset:0;display:block;width:100%;height:100%;pointer-events:none}
    .aura{position:absolute;inset:0;opacity:0;background:radial-gradient(ellipse at 50% 48%,#fff4fd96 0%,#f9cdea44 28%,transparent 67%);transition:opacity .3s}
    .aura.show{opacity:1}.character{position:absolute;left:50%;top:48%;max-width:42vw;height:min(56vh,480px);object-fit:contain;opacity:0;transform:translate(-50%,-50%) scale(.15);filter:drop-shadow(0 0 24px #fff5ba);will-change:transform,opacity}
    .label{position:absolute;left:50%;top:81%;transform:translateX(-50%);padding:12px 26px;border:1px solid #ffffffaa;border-radius:50px;color:#754565;background:#fff9f6e8;font:600 16px/1.5 system-ui,sans-serif;letter-spacing:1px;white-space:nowrap;opacity:0;box-shadow:0 8px 45px #d47fa325}.label.show{opacity:1}
    .toast{position:absolute;bottom:28px;left:50%;transform:translateX(-50%);padding:13px 22px;max-width:90vw;background:#fffaf7f5;border:1px solid #f0d7df;border-radius:18px;color:#684c63;font:13px/1.5 system-ui,sans-serif;box-shadow:0 8px 35px #5a234d20;opacity:0;transition:opacity .2s}.toast.show{opacity:1}
    .charge{position:absolute;width:52px;height:52px;border-radius:50%;background:conic-gradient(#ff7daf var(--progress),#ffdcec44 0);mask:radial-gradient(transparent 59%,#000 61%);opacity:0}
  </style><div class="aura"></div><canvas class="scene"></canvas><canvas class="particles"></canvas><img class="character" alt=""><div class="label"></div><div class="charge"></div><div class="toast"></div>`;
  document.documentElement.append(host);
  const cursorStyle=document.createElement('style');cursorStyle.textContent='html.remi-cursor-active,html.remi-cursor-active *{cursor:none!important}';document.documentElement.append(cursorStyle);
  const canvas=shadow.querySelector('.scene'),fx=shadow.querySelector('.particles'),ctx=fx.getContext('2d');
  const char=shadow.querySelector('.character'),aura=shadow.querySelector('.aura'),label=shadow.querySelector('.label'),chargeRing=shadow.querySelector('.charge'),toast=shadow.querySelector('.toast');
  const sound=new MagicAudio();sound.configure(config);
  let renderer;
  try {renderer=new T.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power',preserveDrawingBuffer:true});}
  catch {host.remove();cursorStyle.remove();throw new Error('3D 요술봉에는 WebGL을 지원하는 브라우저가 필요해요. 하드웨어 가속 설정을 확인해 주세요.');}
  renderer.setClearColor(0,0);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=0.92;
  const scene=new T.Scene(),camera=new T.OrthographicCamera(-innerWidth/2,innerWidth/2,innerHeight/2,-innerHeight/2,.1,2000);camera.position.z=1000;
  const pmrem=new T.PMREMGenerator(renderer),room=new RoomEnvironment(),env=pmrem.fromScene(room,.04);scene.environment=env.texture;room.dispose();pmrem.dispose();
  scene.add(new T.HemisphereLight(0xffffff,0xb47eac,1.4));const key=new T.DirectionalLight(0xffffff,2.1);key.position.set(-200,300,600);scene.add(key);
  const wand=createWand(),tap=createRhythmTap();scene.add(wand,tap);
  const abort=new AbortController(),signal=abort.signal;
  const gesture=new HoldGesture({holdDuration:config.holdDuration,onCharge:p=>{charge=p;},onTrigger:()=>startTransform(),onCancel:()=>{charge=0;}});
  const asset=()=>`${assetBase}${config.character}.png`;char.src=asset();
  let width=innerWidth,height=innerHeight,dpr=Math.min(devicePixelRatio||1,1.5);

  function state(mode) {onState({mode,character:config.character,settings:{...config}});}
  function resize() {width=innerWidth;height=innerHeight;dpr=Math.min(devicePixelRatio||1,1.5);renderer.setPixelRatio(dpr);renderer.setSize(width,height,false);fx.width=Math.round(width*dpr);fx.height=Math.round(height*dpr);camera.left=-width/2;camera.right=width/2;camera.top=height/2;camera.bottom=-height/2;camera.updateProjectionMatrix();wake();}
  function toastMessage(text) {toast.textContent=text;toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),4200);}
  function hideCursor() {document.documentElement.classList.toggle('remi-cursor-active',config.enabled&&inside&&!disposed&&!fullscreenBlocked);}
  function spawn(x,y,count=5,burst=false) {if(!config.trail&&!burst)return;const amount=reduced.matches?Math.min(3,count):count;for(let i=0;i<amount;i++){const a=Math.random()*Math.PI*2,s=burst?45+Math.random()*190:12+Math.random()*60;particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-20,life:0,max:burst?.65+Math.random()*.7:.4+Math.random()*.5,size:burst?3+Math.random()*6:1+Math.random()*4,angle:Math.random()*Math.PI,kind:Math.random(),color:PALETTE[Math.floor(Math.random()*PALETTE.length)]});}if(particles.length>280)particles.splice(0,particles.length-280);}
  function blocked(event) {return event.composedPath().some(el=>el instanceof Element&&(el.matches('input,textarea,select,button,a,[role="button"],[contenteditable]:not([contenteditable="false"]),video,audio')||el.isContentEditable));}
  function move(event) {if(fullscreenBlocked||!event.isTrusted||event.pointerType==='touch')return;point={x:event.clientX,y:event.clientY};inside=true;lastMove=performance.now();gesture.pointerMove(point,lastMove);if(config.enabled){const dist=Math.hypot(point.x-previous.x,point.y-previous.y);if(dist>2)spawn(point.x,point.y,Math.min(8,Math.ceil(dist/6)));ribbon.push({...point,life:0});if(ribbon.length>35)ribbon.shift();previous={...point};}hideCursor();wake();}
  function down(event) {if(fullscreenBlocked||!event.isTrusted||!config.enabled||event.pointerType==='touch')return;sound.unlock();if(event.button!==0)return;inside=true;point={x:event.clientX,y:event.clientY};hideCursor();gesture.pointerDown({x:point.x,y:point.y,button:0,blocked:blocked(event)||!!sequence},performance.now());wake();}
  function click(event) {if(fullscreenBlocked||!event.isTrusted||!config.enabled||event.button!==0)return;sound.unlock();if(!sequence){sound.click();spawn(event.clientX,event.clientY,38,true);wake();}}
  function wheel(event) {if(fullscreenBlocked||!event.isTrusted||!config.enabled||event.ctrlKey||event.deltaY===0)return;gesture.cancel('scroll');point={x:event.clientX,y:event.clientY};inside=true;scrollUntil=performance.now()+750;spinSpeed=Math.sign(event.deltaY)*Math.min(17,5+Math.abs(event.deltaY)*.05);sound.scroll(Math.sign(event.deltaY));spawn(point.x,point.y,6);hideCursor();state('rhythm');wake();}
  function startTransform() {if(!config.enabled||sequence||disposed)return;gesture.cancel('transform');charge=0;sound.unlock();sequence={start:performance.now(),duration:sound.duration(config.character),capturing:false,finished:false,end:0};sound.transform(config.character);char.src=asset();aura.classList.add('show');label.classList.add('show');label.textContent='리듬탭, 마법을 깨워 줘!';spawn(width/2,height/2,85,true);state('transform');wake();}
  function stopTransform() {sequence=null;char.style.opacity=0;aura.classList.remove('show');label.classList.remove('show');sound.stop();lastMove=performance.now();state('wand');wake();}
  function suspend() {sound.stop();inside=false;gesture.cancel('blur');gesture.pointerUp();charge=0;hideCursor();if(sequence)stopTransform();particles=[];ribbon=[];if(raf)cancelAnimationFrame(raf);raf=0;renderer.clear();ctx.clearRect(0,0,fx.width,fx.height);chargeRing.style.opacity=0;}
  async function finishCapture(current) {
    current.capturing=true;
    try {if(config.captureOnTransform&&onCapture){const result=await onCapture({canvas,fx,characterImage:char,character:config.character,width,height});if(sequence!==current)return;toastMessage(result?.message||'마법 사진의 저장 위치를 선택해 주세요 ✦');sound.capture();}else{toastMessage('변신 완료! ✦');}}
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
    const dx=(point.x-framePoint.x)*.08,dy=(point.y-framePoint.y)*.08;framePoint={...point};
    updateWand(wand,{time:now/1000,dx,dy,dt});updateRhythmTap(tap,now/1000,charge);
    const wheelMode=now<scrollUntil&&!sequence;wand.visible=inside&&!wheelMode&&!sequence;tap.visible=inside&&wheelMode||!!sequence;
    const scale=config.size/wand.userData.height;wand.scale.setScalar(scale);wand.rotation.set(.08,Math.sin(now*.001)*.07,.32+T.MathUtils.clamp(-dx*.012,-.16,.16));
    // Place the upper tip exactly at the pointer, without a trailing cursor delay.
    const tip=new T.Vector3(0,wand.userData.tipY*scale,0).applyEuler(wand.rotation);wand.position.set(point.x-width/2-tip.x,height/2-point.y-tip.y,0);
    spin+=spinSpeed*dt;spinSpeed*=Math.exp(-dt*3);tap.rotation.set(.1+Math.sin(now*.002)*.1,.18,spin);tap.scale.setScalar(config.size*.65/tap.userData.height);tap.position.set(point.x-width/2,height/2-point.y,20);
    chargeRing.style.opacity=charge>0?'1':'0';chargeRing.style.transform=`translate(${point.x-26}px,${point.y-26}px)`;chargeRing.style.setProperty('--progress',`${charge*360}deg`);
    if(sequence){const elapsed=(now-sequence.start)/1000;const phase=Math.min(elapsed,3.8);tap.visible=phase<1.55;tap.position.set(0,height*.04,80);tap.scale.setScalar((90+Math.sin(Math.min(phase,1.2)/1.2*Math.PI/2)*85)/2.7);tap.rotation.set(.15,.2,phase*4.2);updateRhythmTap(tap,now/1000,1);
      const entry=T.MathUtils.smoothstep(phase,1.0,1.9);char.style.opacity=entry;char.style.transform=`translate(-50%,-50%) scale(${.65+entry*.35}) rotate(${reduced.matches?0:(1-entry)*-14}deg)`;char.style.filter=`drop-shadow(0 0 ${16+Math.sin(phase*3)*5}px #ffe9b8)`;
      label.textContent=phase<1.25?'리듬탭, 마법을 깨워 줘!':phase<3?'반짝반짝, 마법 변신!':`${NAMES[config.character]}, 변신 완료!`;
      if(phase<3.3&&config.trail){const a=phase*9;spawn(width/2+Math.cos(a)*140,height*.48+Math.sin(a)*150,3);}
      if(sequence.finished&&now>sequence.end)stopTransform();
    }
    drawParticles(dt);renderer.render(scene,camera);
    // Capture only after the final pose has been rendered, and only once.
    if(sequence&&!sequence.capturing&&(now-sequence.start)>sequence.duration*1000)finishCapture(sequence);
    if(inside||particles.length||sequence||gesture.state==='charging') {
      if(now-lastMove<2500||particles.length||sequence||gesture.state==='charging'||now<scrollUntil)if(!raf)raf=requestAnimationFrame(frame);
    }
  }
  function wake(){if(!raf&&!disposed&&config.enabled&&!document.hidden){lastTime=performance.now();if(!raf)raf=requestAnimationFrame(frame);}}
  function configure(next) {config=normalizeSettings({...config,...next});sound.configure(config);gesture.updateConfig(config);char.src=asset();if(!config.enabled)suspend();else wake();hideCursor();state(config.enabled?'wand':'off');}
  function dispose() {if(disposed)return;suspend();disposed=true;abort.abort();clearTimeout(toastTimer);sound.dispose();disposeModel(wand);disposeModel(tap);env.dispose();renderer.dispose();host.remove();cursorStyle.remove();document.documentElement.classList.remove('remi-cursor-active');}
  window.addEventListener('pointermove',move,{passive:true,signal});window.addEventListener('pointerdown',down,{passive:true,capture:true,signal});window.addEventListener('pointerup',()=>gesture.pointerUp(),{passive:true,capture:true,signal});window.addEventListener('pointercancel',()=>gesture.pointerUp(),{signal});window.addEventListener('click',click,{passive:true,capture:true,signal});window.addEventListener('wheel',wheel,{passive:true,signal});window.addEventListener('blur',suspend,{signal});
  document.addEventListener('pointerout',e=>{if(!e.relatedTarget)suspend();},{signal});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();else wake();},{signal});
  document.addEventListener('fullscreenchange',()=>{fullscreenBlocked=!!document.fullscreenElement?.matches('video,iframe,canvas,img,object,embed');if(fullscreenBlocked)suspend();else(document.fullscreenElement||document.documentElement).append(host);resize();},{signal});
  window.addEventListener('resize',resize,{signal});window.addEventListener('keydown',e=>{if(e.key==='Escape'){gesture.cancel();stopTransform();}else sound.unlock();},{signal});
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();dispose();onState({mode:'error',error:'3D 렌더링이 중단되어 기본 커서를 복구했어요. 페이지를 새로고침해 주세요.'});},{signal});
  resize();state('wand');
  return {configure,configureAudio:clips=>sound.setClips(clips),transform:startTransform,stopTransform,dispose,get settings(){return {...config};},toast:toastMessage};
}
