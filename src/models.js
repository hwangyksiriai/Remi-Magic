import * as T from 'three';

const ballColors = [0xff385f, 0xff6928, 0xffbf08, 0xf4db05, 0x1fcd4c, 0x079dff, 0x9122dc];
const material = (color, options = {}) => new T.MeshPhysicalMaterial({ color, roughness: .2, metalness: .12, clearcoat: 1, clearcoatRoughness: .12, ...options });
function mesh(group, geometry, mat, x = 0, y = 0, z = 0) {
  const m = new T.Mesh(geometry, mat); m.position.set(x,y,z); group.add(m); return m;
}
function sphere(group, r, mat, x=0,y=0,z=0) { return mesh(group,new T.SphereGeometry(r,24,16),mat,x,y,z); }
function ring(group,r,t,mat,x=0,y=0,z=0) { return mesh(group,new T.TorusGeometry(r,t,12,64),mat,x,y,z); }
function cylinder(group,top,bottom,height,mat,x=0,y=0,z=0) { return mesh(group,new T.CylinderGeometry(top,bottom,height,40),mat,x,y,z); }
function line(group,points,r,mat) { return mesh(group,new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),32,r,8,false),mat); }
function note(group,x,y,z,size,mat) {
  const n=new T.Group(); n.position.set(x,y,z); n.scale.setScalar(size); group.add(n);
  sphere(n,.16,mat,-.11,-.18,0).scale.set(1.25,.8,.3);
  line(n,[[.035,-.18,0],[.035,.3,0],[.2,.22,0]],.035,mat);
  return n;
}

export function createWand() {
  const g=new T.Group(); g.name='Peperuto Poron';
  const pink=material(0xff80bc), dark=material(0xec358d), gold=material(0xe8b750,{metalness:.82,roughness:.22}), cream=material(0xffefd8);
  // A long clear bead chamber and the musical-note collar of Peperuto Poron.
  const profile=[[-2.28,.06],[-2.2,.16],[-1.94,.18],[-1.7,.17],[-.83,.21],[-.67,.28],[-.52,.27]];
  mesh(g,new T.LatheGeometry(profile.map(([y,r])=>new T.Vector2(r,y)),48),pink);
  sphere(g,.18,gold,0,-2.12,0);
  for(const y of [-1.9,-.8,-.6]) ring(g,.20,.038,y===-.6?gold:dark,0,y).rotation.x=Math.PI/2;
  sphere(g,.38,pink,0,-.33,0).scale.set(1,.87,.72);
  const face=cylinder(g,.265,.265,.07,cream,0,-.3,.28);face.rotation.x=Math.PI/2;
  ring(g,.275,.047,gold,0,-.3,.34);
  note(g,.035,-.28,.39,1,gold);
  for(const x of [-.43,.43]) { sphere(g,.13,gold,x,-.3,0); sphere(g,.09,pink,x,-.3,.08); }
  const glass=material(0xffedf8,{transparent:true,opacity:.14,roughness:.07,metalness:.08,depthWrite:false,side:T.DoubleSide});
  cylinder(g,.235,.24,1.65,glass,0,.84);
  sphere(g,.25,glass,0,1.66,0).scale.y=.65;
  for(const y of [.02,1.66]) ring(g,.24,.055,gold,0,y).rotation.x=Math.PI/2;
  sphere(g,.28,pink,0,1.79,0).scale.set(1,.65,1);
  ring(g,.22,.026,dark,0,1.8).rotation.x=Math.PI/2;
  sphere(g,.12,gold,0,1.99,0);
  const shine=material(0xffffff,{transparent:true,opacity:.65,depthWrite:false});
  line(g,[[-.18,.14,.15],[-.19,.75,.14],[-.18,1.55,.14]],.017,shine);
  line(g,[[.22,.12,.04],[.235,.85,.035],[.22,1.6,.04]],.012,shine);
  const beads=[];
  for(let i=0;i<14;i++) {
    const r=.102; const b=sphere(g,r,material(ballColors[i%7],{roughness:.11}),i%2?.105:-.105,.18+Math.floor(i/2)*.205,(i%3-1)*.05);
    beads.push({mesh:b,vx:0,vy:0,vz:0,r});
  }
  g.userData.beads=beads;g.userData.height=4.35;g.userData.tipY=2.12;
  return g;
}

export function updateWand(g,{time,dx=0,dy=0,dt=.016}) {
  const balls=g.userData.beads;dt=Math.min(dt,.035);
  for(let i=0;i<balls.length;i++) {
    const b=balls[i],p=b.mesh.position;
    b.vx+=(-dx*.7+Math.sin(time*1.5+i)*.16)*dt;
    b.vy+=(dy*.7-1.6+Math.cos(time*2+i)*.2)*dt;
    b.vz+=Math.sin(time*1.3+i)*.07*dt;
    b.vx*=.975;b.vy*=.985;b.vz*=.96;
    p.x+=b.vx*dt;p.y+=b.vy*dt;p.z+=b.vz*dt;
    const radius=Math.hypot(p.x,p.z),limit=.235-b.r;
    if(radius>limit) { p.x*=limit/radius;p.z*=limit/radius;b.vx*=-.72;b.vz*=-.72; }
    if(p.y<.08+b.r) {p.y=.08+b.r;b.vy=Math.abs(b.vy)*.6;}
    if(p.y>1.65-b.r) {p.y=1.65-b.r;b.vy=-Math.abs(b.vy)*.6;}
  }
  // Resolve bead contacts twice for a clearly visible, stable stack.
  for(let iteration=0;iteration<2;iteration++) for(let i=0;i<balls.length;i++) for(let j=i+1;j<balls.length;j++) {
    const a=balls[i],b=balls[j],d=b.mesh.position.clone().sub(a.mesh.position),length=d.length(),limit=a.r+b.r;
    if(length>0&&length<limit) { d.multiplyScalar((limit-length)/length*.5);a.mesh.position.sub(d);b.mesh.position.add(d);const vy=a.vy;a.vy=b.vy*.7;b.vy=vy*.7; }
  }
  // Collision correction can push against the chamber; always finish inside it.
  for(const b of balls) {const p=b.mesh.position; p.y=T.MathUtils.clamp(p.y,.08+b.r,1.65-b.r);const r=Math.hypot(p.x,p.z);if(r>.235-b.r){p.x*=(.235-b.r)/r;p.z*=(.235-b.r)/r;}}
}

export function createRhythmTap() {
  const g=new T.Group();g.name='Rhythm Tap';
  const pink=material(0xffa9d0,{roughness:.14}), edge=material(0xe8d5e2,{metalness:.7,roughness:.14}),gold=material(0xd8b142,{metalness:.8,roughness:.22});
  const glass=material(0xffddeb,{transparent:true,opacity:.23,depthWrite:false,roughness:.06});
  const shape=new T.Shape();const outline=[];
  for(let i=0;i<=256;i++) {const a=i/256*Math.PI*2;const r=1.17+.135*Math.cos(a*8);const x=Math.sin(a)*r,y=Math.cos(a)*r;if(!i)shape.moveTo(x,y);else shape.lineTo(x,y);outline.push([x,y,.21]);}
  const body=mesh(g,new T.ExtrudeGeometry(shape,{depth:.18,bevelEnabled:true,bevelSize:.055,bevelThickness:.065,bevelSegments:3,steps:1,curveSegments:48}),pink);body.position.z=-.13;
  line(g,outline,.033,edge);
  const gems=[];
  for(let i=0;i<8;i++) {
    const a=i*Math.PI/4,x=Math.sin(a)*.94,y=Math.cos(a)*.94;
    const shell=sphere(g,.326,glass,x,y,.15);shell.scale.z=.6;
    if(i===0) {note(g,x,y,.34,.79,gold);continue;}
    const b=sphere(g,.177,material(ballColors[i-1],{roughness:.08,metalness:.15,emissive:ballColors[i-1],emissiveIntensity:.03}),x,y,.23);
    gems.push(b);
    const stem=mesh(g,new T.ConeGeometry(.083,.23,3),gold,x+Math.cos(a)*.05,y-Math.sin(a)*.05,.22);stem.rotation.z=-a+.5;stem.scale.z=.45;
  }
  const face=cylinder(g,.54,.54,.13,material(0xfffdf2),0,0,.28);face.rotation.x=Math.PI/2;
  ring(g,.6,.065,edge,0,0,.29);ring(g,.515,.019,gold,0,0,.36);ring(g,.66,.025,material(0xff7eb8),0,0,.20);
  note(g,-.1,-.07,.38,.88,gold);note(g,.17,-.07,.38,.88,gold).rotation.y=Math.PI;
  for(const x of [-.19,0,.19]) {const crown=mesh(g,new T.ConeGeometry(.09,.15,3),gold,x,.36,.38);crown.scale.z=.25;}
  line(g,[[-.26,.29,.38],[0,.22,.38],[.26,.29,.38]],.027,gold);
  g.userData.gems=gems;g.userData.height=2.7;return g;
}

export function updateRhythmTap(g,time,charged=0) {
  const lit=Math.floor(time*5)%7;
  g.userData.gems.forEach((gem,i)=>{gem.material.emissiveIntensity=i===lit?.45+charged*.9:.02+charged*.1;const s=1+(i===lit?.08:0);gem.scale.setScalar(s);});
}

export function disposeModel(group) {
  const geometries=new Set(),materials=new Set();
  group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
}
