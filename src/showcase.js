import * as T from 'three';
import {createProductLighting} from './product-lighting.js';
import {createWand,createRhythmTap,updateWand,updateRhythmTap,disposeModel} from './models.js';

export function createShowcase(canvas) {
  const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.setClearColor(0,0);
  renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.92;
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(32,1,.1,60);
  camera.position.set(0,0,11.3);
  // Keep the props floating above the page's soft CSS glow, without silhouettes.
  const lighting=createProductLighting(renderer,scene);
  const wand=createWand(),tap=createRhythmTap();scene.add(wand,tap);
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const target=new T.Vector2(),pointer=new T.Vector2(),zero=new T.Vector2();
  let time=0,raf=0,previous=0,stopped=false,aspect=1,visible=true;
  function resize(){const width=Math.max(1,canvas.clientWidth),height=Math.max(1,canvas.clientHeight);aspect=width/height;renderer.setSize(width,height,false);camera.aspect=aspect;camera.updateProjectionMatrix();}
  function move(event){if(reduced.matches)return;const rect=canvas.getBoundingClientRect();target.set((event.clientX-rect.left)/rect.width*2-1,(event.clientY-rect.top)/rect.height*2-1);}
  function leave(){target.set(0,0);}
  const surface=canvas.parentElement||canvas;
  surface.addEventListener('pointermove',move,{passive:true});surface.addEventListener('pointerleave',leave);
  const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
  function draw(now){
    raf=0;if(stopped||document.hidden||!visible)return;
    const dt=Math.min((now-previous)/1000||.016,.035);previous=now;if(!reduced.matches)time+=dt;
    pointer.lerp(reduced.matches?zero:target,1-Math.exp(-dt*5));
    const half=11.3*Math.tan(T.MathUtils.degToRad(16))*aspect,fit=Math.min(1,aspect/1.3);
    wand.position.set(-half*.40,.08,.04);wand.rotation.set(.10-pointer.y*.06,-.24+pointer.x*.12+Math.sin(time*.3)*.05,.30);wand.scale.setScalar(1.035*fit);
    tap.position.set(half*.43,.05,.10);tap.rotation.set(.32-pointer.y*.10,.46+pointer.x*.14+Math.sin(time*.3)*.055,-.12);tap.scale.setScalar(1.10*fit);
    if(!reduced.matches)updateWand(wand,{time,dx:Math.sin(time*.5)*1.2,dy:Math.cos(time)*.15,dt,reducedMotion:reduced.matches});updateRhythmTap(tap,time);
    renderer.render(scene,camera);raf=requestAnimationFrame(draw);
  }
  function wake(){if(!stopped&&!document.hidden&&visible&&!raf){previous=performance.now();raf=requestAnimationFrame(draw);}}
  function visibility(){if(document.hidden){cancelAnimationFrame(raf);raf=0;}else wake();}
  const intersection=new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting??true;if(visible)wake();else{cancelAnimationFrame(raf);raf=0;}},{rootMargin:'80px'});
  intersection.observe(canvas);document.addEventListener('visibilitychange',visibility);wake();
  return{dispose(){stopped=true;cancelAnimationFrame(raf);observer.disconnect();intersection.disconnect();surface.removeEventListener('pointermove',move);surface.removeEventListener('pointerleave',leave);document.removeEventListener('visibilitychange',visibility);disposeModel(wand);disposeModel(tap);lighting.dispose();renderer.dispose();}};
}
