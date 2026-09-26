import * as T from 'three';

/** Warm, softly filled product lighting; cast shadows remain an explicit opt-in. */
export function createProductLighting(renderer, scene, { shadows = false } = {}) {
  const studio = new T.Scene();
  studio.background = new T.Color(0xa19aa1);
  studio.add(new T.Mesh(new T.BoxGeometry(18,14,18),new T.MeshBasicMaterial({color:0x969198,side:T.BackSide})));
  function softbox(x,y,z,width,height,intensity,color) {
    const card=new T.Mesh(new T.PlaneGeometry(width,height),new T.MeshBasicMaterial({color:new T.Color(color).multiplyScalar(intensity),side:T.DoubleSide}));
    card.position.set(x,y,z);card.lookAt(0,0,0);studio.add(card);
  }
  softbox(-4,3.5,5,4.4,6.5,3.4,0xfff3ee);
  softbox(4.5,1.5,3,1.5,5.5,2.25,0xffedf5);
  softbox(0,6.5,-2,4.5,3,2.8,0xfffcf6);
  softbox(-1,-3.5,5,4,1.2,.9,0xffe8f1);
  const pmrem=new T.PMREMGenerator(renderer),environment=pmrem.fromScene(studio,.015,.1,100);
  studio.traverse(object=>{object.geometry?.dispose();object.material?.dispose();});pmrem.dispose();
  scene.environment=environment.texture;scene.environmentIntensity=.72;
  const ambient=new T.HemisphereLight(0xfff7fb,0xcab1bd,.74);
  const key=new T.DirectionalLight(0xfff3e8,2.1);key.position.set(-5,8,10);
  const fill=new T.DirectionalLight(0xffe6ee,.85);fill.position.set(6,0,5);
  const rim=new T.DirectionalLight(0xfff5e8,.75);rim.position.set(2,5,-4);
  const lights=[ambient,key,fill,rim];scene.add(...lights);
  if(shadows){
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.VSMShadowMap;
    key.castShadow=true;key.shadow.mapSize.set(1024,1024);
    Object.assign(key.shadow.camera,{left:-7,right:7,top:6,bottom:-6,near:.5,far:30});key.shadow.camera.updateProjectionMatrix();
    key.shadow.bias=-.0002;key.shadow.normalBias=.025;key.shadow.radius=4;key.shadow.blurSamples=8;
  }
  return {dispose(){lights.forEach(light=>{scene.remove(light);light.shadow?.dispose();});if(scene.environment===environment.texture)scene.environment=null;environment.dispose();}};
}
