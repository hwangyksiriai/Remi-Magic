import * as T from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {createWand,createRhythmTap,updateWand,updateRhythmTap,disposeModel} from './models.js';
export function createShowcase(canvas) {
  const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.setClearColor(0,0);renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=0.92;
  const scene=new T.Scene(),camera=new T.OrthographicCamera(-5,5,3,-3,.1,100);camera.position.z=20;
  const pmrem=new T.PMREMGenerator(renderer),room=new RoomEnvironment(),env=pmrem.fromScene(room,.04);scene.environment=env.texture;room.dispose();pmrem.dispose();scene.add(new T.HemisphereLight(0xffffff,0xdba0c5,1.4));const light=new T.DirectionalLight(0xffffff,2.1);light.position.set(-5,8,10);scene.add(light);
  const wand=createWand(),tap=createRhythmTap();scene.add(wand,tap);let time=0,raf,previous=0,stop=false;
  function resize(){const w=canvas.clientWidth,h=canvas.clientHeight;renderer.setSize(w,h,false);const range=3.1;camera.left=-range*w/h;camera.right=range*w/h;camera.top=range;camera.bottom=-range;camera.updateProjectionMatrix();}
  const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
  function draw(now){if(stop)return;const dt=Math.min((now-previous)/1000||.016,.03);previous=now;time+=dt;const half=camera.right;wand.position.set(-half*.41,.18,0);wand.rotation.set(.04,Math.sin(time*.4)*.18,-.28);wand.scale.setScalar(1.08);tap.position.set(half*.45,.10,0);tap.rotation.set(.12,Math.sin(time*.32)*.2+.12,Math.sin(time*.4)*.09);tap.scale.setScalar(.88);updateWand(wand,{time,dx:Math.sin(time*.5)*2,dy:Math.cos(time)*.2,dt});updateRhythmTap(tap,time);renderer.render(scene,camera);raf=requestAnimationFrame(draw);}
  function visible(){if(document.hidden){cancelAnimationFrame(raf);}else{previous=performance.now();raf=requestAnimationFrame(draw);}}
  document.addEventListener('visibilitychange',visible);raf=requestAnimationFrame(draw);
  return {dispose(){stop=true;cancelAnimationFrame(raf);observer.disconnect();document.removeEventListener('visibilitychange',visible);disposeModel(wand);disposeModel(tap);env.dispose();renderer.dispose();}};
}
