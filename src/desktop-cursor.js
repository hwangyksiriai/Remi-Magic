import * as T from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {createWand,createRhythmTap,updateRhythmTap,disposeModel} from './models.js';
import {encodeCur,encodeAni} from '../scripts/cursor-format.mjs';

const button=document.getElementById('generate'),status=document.getElementById('status'),files=document.getElementById('files'),previews=document.getElementById('frames');
const urls=[];
function download(bytes,name,type){const url=URL.createObjectURL(new Blob([bytes],{type}));urls.push(url);const a=document.createElement('a');a.href=url;a.download=name;a.textContent=name;files.append(a);}
button.addEventListener('click',async()=>{
  button.disabled=true;status.textContent='3D 커서를 렌더링하고 있어요…';files.replaceChildren();previews.replaceChildren();urls.splice(0).forEach(url=>URL.revokeObjectURL(url));
  let renderer,env,wand,tap;
  try{
    renderer=new T.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});renderer.setSize(256,256);renderer.setClearColor(0,0);renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.92;
    const scene=new T.Scene(),camera=new T.OrthographicCamera(-2.4,2.4,2.4,-2.4,.1,100);camera.position.z=20;
    const pmrem=new T.PMREMGenerator(renderer),room=new RoomEnvironment();env=pmrem.fromScene(room,.04);scene.environment=env.texture;room.dispose();pmrem.dispose();scene.add(new T.HemisphereLight(0xffffff,0xb47eac,1.4));const light=new T.DirectionalLight(0xffffff,2.1);light.position.set(-5,8,10);scene.add(light);
    wand=createWand();tap=createRhythmTap();scene.add(wand,tap);wand.rotation.set(.06,.08,.4);tap.visible=false;
    const base=wand.userData.beads.map(b=>b.mesh.position.clone());wand.updateMatrixWorld();camera.updateMatrixWorld();
    const tip=new T.Vector3(0,wand.userData.tipY,0).applyMatrix4(wand.matrixWorld).project(camera);
    for(const [kind,model]of [['Wand',wand],['Rhythm-Tap',tap]]){
      wand.visible=kind==='Wand';tap.visible=kind!=='Wand';
      for(const size of [128,64]){
        const frames=[];
        for(let frame=0;frame<24;frame++){
          const phase=frame/24*Math.PI*2;
          if(kind==='Wand')wand.userData.beads.forEach((bead,i)=>{bead.mesh.position.copy(base[i]);bead.mesh.position.x+=Math.sin(phase+i*.5)*.022;bead.mesh.position.y+=Math.cos(phase+i*.65)*.039;bead.mesh.position.z+=Math.sin(phase+i)*.024;});
          else{tap.rotation.set(.15,.12,-phase);tap.scale.setScalar(1.45);updateRhythmTap(tap,frame/24*1.4,.1);}
          renderer.render(scene,camera);
          const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;const ctx=canvas.getContext('2d');ctx.drawImage(renderer.domElement,0,0,size,size);frames.push(new Uint8Array(ctx.getImageData(0,0,size,size).data));
          if(size===128&&frame%6===0){canvas.setAttribute('aria-label',`${kind} 프레임 ${frame+1}`);previews.append(canvas);}
          if(frame%6===0)await new Promise(resolve=>requestAnimationFrame(resolve));
        }
        const hotspotX=kind==='Wand'?Math.round((tip.x+1)*size/2):Math.floor(size/2);
        const hotspotY=kind==='Wand'?Math.round((1-tip.y)*size/2):Math.floor(size/2);
        const name=`Remi-${kind}-${size===128?'Large':'Regular'}`;
        download(encodeAni({frames,width:size,height:size,hotspotX,hotspotY,jiffies:4}),name+'.ani','application/x-navi-animation');
        if(kind==='Wand')download(encodeCur({rgba:frames[0],width:size,height:size,hotspotX,hotspotY}),name+'.cur','image/x-icon');
      }
    }
    status.textContent='완료: Windows에 적용할 커서 파일 6개를 만들었어요.';
  }catch(error){status.textContent='만들기 실패: '+error.message;}
  finally{button.disabled=false;if(wand)disposeModel(wand);if(tap)disposeModel(tap);env?.dispose();renderer?.dispose();}
});
