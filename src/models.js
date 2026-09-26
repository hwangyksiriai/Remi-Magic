import * as T from 'three';
export { createWand, updateWand } from './wand-model.js';

// Clockwise from the upper-right petal in the supplied product photograph.
const ballColors = [0xf15aa4, 0xeb2350, 0xff9b23, 0xf4d329, 0x12b57d, 0x159bca, 0xa86dcb];
const physical = (color, options = {}) => new T.MeshPhysicalMaterial({ color, roughness: .25, metalness: 0, clearcoat: .65, clearcoatRoughness: .12, ior: 1.46, envMapIntensity: 1.05, ...options });
function mesh(group, geometry, mat, x = 0, y = 0, z = 0, name = '') {
  const object = new T.Mesh(geometry, mat); object.position.set(x, y, z); object.name = name; group.add(object); return object;
}
function sphere(group, radius, mat, x, y, z, name = '') { return mesh(group, new T.SphereGeometry(radius, 32, 20), mat, x, y, z, name); }
function ring(group, radius, tube, mat, x = 0, y = 0, z = 0, name = '') { return mesh(group, new T.TorusGeometry(radius, tube, 12, 96), mat, x, y, z, name); }
function disc(group, radius, depth, mat, z, name = '') {
  const object = mesh(group, new T.CylinderGeometry(radius, radius, depth, 80), mat, 0, 0, z, name);
  object.rotation.x = Math.PI / 2; return object;
}
function outlineShape(scale = 1) {
  const shape = new T.Shape(), points = [];
  for (let index = 0; index <= 256; index++) {
    const angle = index / 256 * Math.PI * 2;
    // Radial union of eight overlapping circular lobes, not a pointed cosine star.
    const nearest = Math.round(angle / (Math.PI / 4)) * Math.PI / 4;
    const delta = angle - nearest;
    const radius = (.905 * Math.cos(delta) + Math.sqrt(.385 ** 2 - (.905 * Math.sin(delta)) ** 2)) * scale;
    const x = Math.sin(angle) * radius, y = Math.cos(angle) * radius;
    if (index === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    points.push(new T.Vector3(x, y, 0));
  }
  return { shape, points };
}
function housing(group, shape, mat, depth, z, bevel, name) {
  return mesh(group, new T.ExtrudeGeometry(shape, { depth, steps: 1, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 4, curveSegments: 48 }), mat, 0, 0, z, name);
}
function contour(group, points, mat, radius, z, name) {
  const curve = new T.CatmullRomCurve3(points.slice(0, -1).map(point => new T.Vector3(point.x, point.y, z)), true, 'centripetal');
  return mesh(group, new T.TubeGeometry(curve, 256, radius, 10, true), mat, 0, 0, 0, name);
}
function raisedShape(group, shape, mat, x, y, z, scale = 1, name = '') {
  const object = mesh(group, new T.ExtrudeGeometry(shape, { depth: .014, bevelEnabled: true, bevelSize: .0035, bevelThickness: .0035, bevelSegments: 2, curveSegments: 20 }), mat, x, y, z, name);
  object.scale.setScalar(scale); return object;
}
function musicNote(group, mat, x, y, z, scale = 1, mirror = false) {
  const note = new T.Group(); note.name = 'raised gold music note'; note.position.set(x, y, z); note.scale.set(scale * (mirror ? -1 : 1), scale, scale); group.add(note);
  const head = new T.Shape(); head.absellipse(-.075, -.125, .095, .065, -.3, Math.PI * 2 - .3, false, -.25);
  raisedShape(note, head, mat, 0, 0, 0);
  const stem = new T.Shape(); stem.moveTo(-.017, -.132); stem.lineTo(.018, -.132); stem.lineTo(.018, .145); stem.bezierCurveTo(.08, .103, .09, .095, .132, .12); stem.lineTo(.132, .171); stem.bezierCurveTo(.072, .132, .06, .206, -.017, .226); stem.closePath();
  raisedShape(note, stem, mat, 0, 0, 0); return note;
}

/** A layered product-like compact modeled from references/rhythm-tap-photo.png. */
export function createRhythmTap() {
  const group = new T.Group(); group.name = 'Rhythm Tap — clear flower compact';
  const pink = physical(0xef79ac, { roughness: .27, clearcoat: .6, clearcoatRoughness: .13 });
  const innerPink = physical(0xf8bdd4, { roughness: .36, clearcoat: .28, clearcoatRoughness: .21 });
  const seam = physical(0x31222c, { metalness: 0, roughness: .48, clearcoat: .08 });
  const gold = physical(0xe1b83a, { metalness: 1, roughness: .18, clearcoat: 0, envMapIntensity: 1.25 });
  const chrome = physical(0xeaf0e8, { metalness: 1, roughness: .13, clearcoat: 0, envMapIntensity: 1.2 });
  const clear = physical(0xffffff, { transmission: 1, thickness: .05, ior: 1.47, roughness: .015, clearcoat: 0, metalness: 0, transparent: true, opacity: 1, depthWrite: false, envMapIntensity: 1.15 });
  const cover = physical(0xffffff, { transmission: 1, thickness: .025, ior: 1.47, roughness: .02, clearcoat: 0, metalness: 0, transparent: true, opacity: 1, depthWrite: false, envMapIntensity: 1.15 });
  const { shape, points } = outlineShape();

  housing(group, shape, pink, .30, -.31, .055, 'thick pink back housing');
  housing(group, outlineShape(1.013).shape, seam, .043, .008, .018, 'dark case seam');
  contour(group, points, gold, .026, .067, 'gold perimeter trim');
  contour(group, points, chrome, .015, .102, 'silver perimeter highlight');
  housing(group, outlineShape(.981).shape, innerPink, .055, .103, .016, 'pale pink inner tray');
  const front = housing(group, shape, cover, .061, .173, .021, 'continuous clear flower lid'); front.renderOrder = 10;
  contour(group, points, clear, .035, .222, 'thick transparent cover edge').renderOrder = 13;

  const gems = [], pockets = [];
  for (let petal = 0; petal < 8; petal++) {
    const angle = petal * Math.PI / 4;
    const x = Math.sin(angle) * .905, y = Math.cos(angle) * .905;
    // A hemispherical clear pocket sits over each jewel and joins the front lid.
    const pocket = mesh(group, new T.SphereGeometry(.332, 36, 20, 0, Math.PI * 2, 0, Math.PI / 2), clear, x, y, .216, 'clear petal dome');
    pocket.rotation.x = Math.PI / 2; pocket.scale.y = .86; pocket.renderOrder = 15;
    pockets.push(pocket);
    ring(group, .306, .012, clear, x, y, .225, 'clear petal lip').renderOrder = 14;
    if (petal === 0) continue;
    const color = ballColors[petal - 1];
    // Opaque clear-coated gems stay in Three.js' refraction buffer; nested
    // transmissive jewels disappear when viewed through a transmissive lid.
    const jewel = sphere(group, .207, physical(color, { transmission: 0, roughness: .12, metalness: 0, clearcoat: 1, clearcoatRoughness: .035, ior: 1.49, envMapIntensity: .9, emissive: color, emissiveIntensity: .003 }), x, y, .291, 'colored spherical jewel');
    gems.push(jewel);
    // Matching glossy stems remain opaque so the lid can refract their colors.
    const stemShape = new T.Shape(); stemShape.moveTo(-.041, -.18); stemShape.quadraticCurveTo(-.085, -.035, -.055, .045); stemShape.lineTo(.073, .015); stemShape.quadraticCurveTo(.044, -.09, .044, -.18); stemShape.closePath();
    const stem = raisedShape(group, stemShape, physical(color, { transmission: 0, roughness: .19, clearcoat: .8, clearcoatRoughness: .07, opacity: 1 }), Math.sin(angle) * .69, Math.cos(angle) * .69, .256, .7, 'colored inner note stem');
    stem.rotation.z = -angle; stem.renderOrder = 8;
    const lozenge = new T.Shape(); lozenge.moveTo(0, .078); lozenge.lineTo(.038, 0); lozenge.lineTo(0, -.078); lozenge.lineTo(-.038, 0); lozenge.closePath();
    const decorationAngle = angle - Math.PI / 8;
    const decoration = raisedShape(group, lozenge, gold, Math.sin(decorationAngle) * .683, Math.cos(decorationAngle) * .683, .273, 1, 'small gold lozenge');
    decoration.rotation.z = -decorationAngle - .35;
  }

  // Central medallion: pink socket, polished bezel, silver pearl face, raised gold emblem.
  disc(group, .568, .077, pink, .263, 'pink medallion socket');
  ring(group, .562, .033, chrome, 0, 0, .332, 'polished medallion bezel');
  ring(group, .601, .013, clear, 0, 0, .324, 'clear medallion lip').renderOrder = 18;
  disc(group, .528, .038, physical(0xdde9e5, { metalness: .12, roughness: .29, clearcoat: .65, clearcoatRoughness: .11, iridescence: .08, iridescenceIOR: 1.35, iridescenceThicknessRange: [180, 280] }), .343, 'silvery pearl medallion');
  ring(group, .502, .009, gold, 0, 0, .370, 'fine gold face line');
  const emblemCurve = new T.EllipseCurve(0, -.012, .334, .326, .42, Math.PI * 2 + .42, false);
  const emblemPoints = emblemCurve.getPoints(90).map(point => new T.Vector3(point.x, point.y, .379));
  mesh(group, new T.TubeGeometry(new T.CatmullRomCurve3(emblemPoints), 90, .012, 8, false), gold, 0, 0, 0, 'gold emblem circle');
  musicNote(group, gold, -.102, -.044, .380, .80);
  musicNote(group, gold, .102, -.044, .380, .80, true);
  const crown = new T.Shape(); crown.moveTo(-.145, .16); crown.lineTo(-.16, .245); crown.lineTo(-.055, .205); crown.lineTo(0, .32); crown.lineTo(.055, .205); crown.lineTo(.16, .245); crown.lineTo(.145, .16); crown.closePath();
  raisedShape(group, crown, gold, 0, 0, .383, 1, 'gold crown emblem');
  for (const [x, y] of [[-.24, .224], [-.17, .299], [0, .361], [.17, .299], [.24, .224]]) sphere(group, .027, gold, x, y, .387).scale.z = .22;
  const lens = sphere(group, .52, cover, 0, 0, .366, 'clear central lens'); lens.scale.z = .105; lens.renderOrder = 20;

  // Raised upper notes and the visibly clear top tab, plus a small lower latch.
  musicNote(group, gold, 0, .803, .264, .62);
  musicNote(group, gold, -.17, .752, .264, .29);
  musicNote(group, gold, .17, .752, .264, .29, true);
  mesh(group, new T.BoxGeometry(.215, .213, .135), clear, 0, 1.233, .202, 'transparent top tab').renderOrder = 19;
  mesh(group, new T.BoxGeometry(.157, .026, .148), chrome, 0, 1.318, .199, 'top tab silver highlight');
  const hinge = mesh(group, new T.CylinderGeometry(.058, .058, .225, 24), chrome, 0, -1.225, -.036, 'bottom hinge'); hinge.rotation.z = Math.PI / 2;
  mesh(group, new T.BoxGeometry(.20, .115, .113), clear, 0, -1.306, .082, 'transparent lower latch').renderOrder = 19;
  mesh(group, new T.BoxGeometry(.162, .023, .056), gold, 0, -1.352, .112, 'lower latch gold lip');

  group.userData.gems = gems;
  group.userData.pockets = pockets;
  const bounds = new T.Box3().setFromObject(group);
  group.userData.height = bounds.max.y - bounds.min.y;
  group.userData.depth = bounds.max.z - bounds.min.z;
  return group;
}

export function updateRhythmTap(group, time, charged = 0) {
  const seconds = Number.isFinite(time) ? time : 0;
  const energy = T.MathUtils.clamp(Number.isFinite(charged) ? charged : 0, 0, 1);
  const lit = ((Math.floor(seconds * 5) % 7) + 7) % 7;
  group.userData.gems.forEach((gem, index) => {
    // Idle jewels read as reflective solid objects; charging adds a restrained
    // light rather than flattening their shading or inflating their geometry.
    gem.material.emissiveIntensity = index === lit ? .035 + energy * .265 : .003 + energy * .025;
    gem.scale.setScalar(1);
  });
}

export function disposeModel(group) {
  const geometries = new Set(), materials = new Set();
  group.traverse(object => { if (object.geometry) geometries.add(object.geometry); if (object.material) (Array.isArray(object.material) ? object.material : [object.material]).forEach(mat => materials.add(mat)); });
  geometries.forEach(geometry => geometry.dispose()); materials.forEach(mat => mat.dispose());
}
