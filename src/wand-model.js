import * as T from 'three';

// Geometry follows the supplied toy photograph: pink bead drum, pearl shaft,
// clear rainbow grip and gold fittings. No flat image or generated texture.
const RAINBOW = [0xf22d4f, 0xff7728, 0xf7c935, 0x26bf55, 0x119acb, 0x296ddd, 0xa32eb0];
const physical = (color, options = {}) => new T.MeshPhysicalMaterial({ color, roughness: .27, metalness: 0, clearcoat: .65, clearcoatRoughness: .1, ior: 1.46, envMapIntensity: 1.05, ...options });

function add(group, name, geometry, material, x = 0, y = 0, z = 0) {
  const object = new T.Mesh(geometry, material); object.name = name; object.position.set(x, y, z); group.add(object); return object;
}
function sphere(group, name, radius, material, x = 0, y = 0, z = 0) { return add(group, name, new T.SphereGeometry(radius, 32, 24), material, x, y, z); }
function cylinder(group, name, top, bottom, height, material, y = 0) { return add(group, name, new T.CylinderGeometry(top, bottom, height, 64), material, 0, y, 0); }
function ring(group, name, radius, thickness, material, y = 0) {
  const object = add(group, name, new T.TorusGeometry(radius, thickness, 12, 72), material, 0, y, 0); object.rotation.x = Math.PI / 2; return object;
}
function curve(group, name, points, radius, material) {
  return add(group, name, new T.TubeGeometry(new T.CatmullRomCurve3(points.map(point => new T.Vector3(...point))), 40, radius, 8, false), material);
}
function sideFittings(group, name, y, reach, radius, gold) {
  for (const side of [-1, 1]) {
    const stem = add(group, `${name}-stem-${side}`, new T.CylinderGeometry(radius * .36, radius * .36, reach * .32, 16), gold, side * reach * .78, y, 0);
    stem.rotation.z = Math.PI / 2;
    sphere(group, `${name}-ball-${side}`, radius, gold, side * reach, y, 0);
  }
}

export function createWand() {
  const group = new T.Group(); group.name = 'Photo reference — pearl and rainbow wand';
  const gold = physical(0xd8bd59, { metalness: 1, roughness: .18, clearcoat: 0, envMapIntensity: 1.25 });
  const goldEdge = physical(0xf0d781, { metalness: 1, roughness: .12, clearcoat: 0, envMapIntensity: 1.25 });
  const pink = physical(0xf3a1bf, { roughness: .26, clearcoat: .65, clearcoatRoughness: .12 });
  const palePink = physical(0xf6bdd0, { roughness: .22, clearcoat: .85, clearcoatRoughness: .075 });
  const pinkSeam = physical(0xe888aa, { roughness: .33, clearcoat: .24 });
  const pearl = physical(0xfffcf4, { roughness: .24, metalness: 0, clearcoat: .7, clearcoatRoughness: .1, iridescence: .11, iridescenceIOR: 1.35, iridescenceThicknessRange: [180, 300] });
  const ruby = physical(0xef2344, { roughness: .095, clearcoat: 1, clearcoatRoughness: .03, transmission: 0 });
  // Alpha-blended clear walls keep the colored beads visible through both sides.
  const clear = physical(0xffffff, { transparent: true, opacity: .16, transmission: 0, thickness: .035, ior: 1.47, roughness: .04, clearcoat: 0, metalness: 0, envMapIntensity: 1.2, depthWrite: false, side: T.DoubleSide });
  const edge = physical(0xffffff, { transparent: true, opacity: .32, roughness: .055, clearcoat: 0, metalness: 0, depthWrite: false });
  const shine = physical(0xffffff, { transparent: true, opacity: .22, roughness: .08, clearcoat: 0, metalness: 0, depthWrite: false });

  // A squat transparent upper drum capped by an opaque blush-pink hemisphere.
  const drum = cylinder(group, 'top-clear-bead-drum', .565, .54, .57, clear, 2.015); drum.renderOrder = 12;
  const dome = add(group, 'pink-hemisphere-cap', new T.SphereGeometry(.588, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2), palePink, 0, 2.30, 0);
  dome.scale.y = .75;
  ring(group, 'cap-pink-seam', .571, .026, pink, 2.30);
  ring(group, 'drum-upper-clear-lip', .562, .019, edge, 2.286).renderOrder = 13;
  cylinder(group, 'pink-lower-drum-band', .551, .505, .25, pink, 1.63);
  ring(group, 'pink-band-upper-seam', .544, .027, palePink, 1.748);
  ring(group, 'pink-band-lower-seam', .512, .024, pinkSeam, 1.512);
  ring(group, 'pink-band-fine-ridge', .535, .009, pinkSeam, 1.67);
  cylinder(group, 'gold-top-neck-seat', .39, .268, .09, gold, 1.466);
  ring(group, 'gold-head-collar', .357, .046, goldEdge, 1.434);
  sideFittings(group, 'gold-head-side', 1.44, .56, .069, gold);

  // The large central shaft is white pearl plastic, not a pink handle.
  const profile = [[.153, -.2], [.158, -.13], [.164, .02], [.177, .36], [.19, .73], [.211, 1.09], [.228, 1.32], [.216, 1.42]];
  add(group, 'pearl-white-tapered-shaft', new T.LatheGeometry(profile.map(([r, y]) => new T.Vector2(r, y)), 64), pearl);
  sphere(group, 'red-button-pearl-seat', .107, pearl, 0, 1.103, .209).scale.set(1, 1, .33);
  const buttonRim = add(group, 'red-button-gold-rim', new T.TorusGeometry(.075, .012, 10, 40), goldEdge, 0, 1.103, .249);
  buttonRim.rotation.x = 0;
  sphere(group, 'red-round-shaft-button', .066, ruby, 0, 1.103, .256).scale.z = .36;
  sphere(group, 'red-button-highlight', .015, shine, -.019, 1.127, .28).scale.z = .25;

  // Distinct gold ring separates white shaft and the transparent colored grip.
  cylinder(group, 'gold-middle-collar', .186, .178, .095, gold, -.22);
  ring(group, 'gold-middle-collar-rim', .185, .029, goldEdge, -.25);
  sideFittings(group, 'gold-middle-side', -.222, .3, .054, gold);
  const handle = cylinder(group, 'clear-rainbow-handle', .155, .145, 1.735, clear, -1.144); handle.renderOrder = 12;
  ring(group, 'clear-handle-top-lip', .154, .014, edge, -.285).renderOrder = 13;
  ring(group, 'clear-handle-bottom-lip', .145, .014, edge, -2.006).renderOrder = 13;
  sphere(group, 'grip-red-switch', .067, ruby, 0, -.425, .149).scale.set(.72, 1.17, .34);

  // A short translucent neck and gold end guard sit above the rounded red tip.
  cylinder(group, 'pink-lower-neck', .139, .12, .17, palePink, -2.078);
  ring(group, 'gold-end-guard-upper', .188, .029, goldEdge, -2.08);
  cylinder(group, 'gold-end-guard', .186, .157, .085, gold, -2.136);
  ring(group, 'gold-end-guard-lower', .167, .025, goldEdge, -2.178);
  sideFittings(group, 'gold-bottom-side', -2.14, .285, .056, gold);
  cylinder(group, 'red-tip-neck', .112, .138, .11, ruby, -2.241);
  sphere(group, 'rounded-red-bottom-tip', .202, ruby, 0, -2.423, 0).scale.set(1, .95, 1);
  ring(group, 'red-tip-mold-seam', .177, .012, pinkSeam, -2.342);

  // Thin three-dimensional highlights make the clear walls legible on a page.
  curve(group, 'drum-left-reflection', [[-.43, 1.81, .34], [-.46, 2.02, .33], [-.44, 2.22, .34]], .015, shine).renderOrder = 14;
  curve(group, 'drum-right-reflection', [[.47, 1.80, .24], [.51, 2.0, .23], [.49, 2.21, .24]], .009, edge).renderOrder = 14;
  curve(group, 'grip-long-reflection', [[-.102, -.33, .119], [-.107, -1.1, .11], [-.097, -1.96, .109]], .011, shine).renderOrder = 14;
  curve(group, 'grip-right-reflection', [[.126, -.33, .059], [.128, -1.15, .055], [.118, -1.96, .057]], .006, edge).renderOrder = 14;

  const topChamber = Object.freeze({ id: 'top', radius: .531, minY: 1.765, maxY: 2.272 });
  const gripChamber = Object.freeze({ id: 'grip', radius: .142, minY: -1.99, maxY: -.3 });
  const beads = [], beadMaterials = RAINBOW.map(color => physical(color, { roughness: .12, transmission: 0, metalness: 0, clearcoat: 1, clearcoatRoughness: .035, envMapIntensity: .9 }));
  for (let index = 0; index < RAINBOW.length; index++) {
    const angle = index * Math.PI * 2 / 7 + .3, r = .118;
    const bead = sphere(group, `upper-drum-bead-${index}`, r, beadMaterials[index], Math.cos(angle) * .342, 1.91 + index % 2 * .145, Math.sin(angle) * .342);
    beads.push({ mesh: bead, r, vx: 0, vy: 0, vz: 0, chamber: topChamber });
  }
  // Keep the photographed rainbow order from red at the top to purple below.
  for (let index = 0; index < RAINBOW.length; index++) {
    const r = .11, anchorY = -.49 - index * .23;
    const bead = add(group, `rainbow-grip-bead-${index}`, new T.IcosahedronGeometry(r, 2), beadMaterials[index], 0, anchorY, 0);
    bead.rotation.set(index * .3, index * .7, index * .2);
    const chamber = Object.freeze({ ...gripChamber, id: `grip-${index}`, minY: anchorY - .122, maxY: anchorY + .122 });
    beads.push({ mesh: bead, r, vx: 0, vy: 0, vz: 0, anchorY, chamber });
  }

  group.userData.beads = beads;
  group.userData.chambers = Object.freeze({ top: topChamber, grip: gripChamber });
  group.userData.reference = 'User-supplied pink dome / white shaft / rainbow clear grip photograph';
  group.updateMatrixWorld(true);
  const bounds = new T.Box3().setFromObject(group);
  group.userData.height = bounds.max.y - bounds.min.y;
  group.userData.tipY = bounds.max.y;
  group.userData.bottomY = bounds.min.y;
  return group;
}

function constrain(bead) {
  const p = bead.mesh.position, chamber = bead.chamber, radialLimit = chamber.radius - bead.r;
  const radius = Math.hypot(p.x, p.z);
  if (radius > radialLimit) {
    p.x *= radialLimit / radius; p.z *= radialLimit / radius;
    bead.vx *= -.52; bead.vz *= -.52;
  }
  const bottom = chamber.minY + bead.r, top = chamber.maxY - bead.r;
  if (p.y < bottom) { p.y = bottom; bead.vy = Math.abs(bead.vy) * .45; }
  if (p.y > top) { p.y = top; bead.vy = -Math.abs(bead.vy) * .45; }
}

/** Both chambers respond to cursor acceleration without escaping their walls. */
export function updateWand(group, { time = 0, dx = 0, dy = 0, dt = .016 } = {}) {
  const beads = group?.userData?.beads;
  if (!beads) return;
  const seconds = Number.isFinite(time) ? time : 0;
  const step = T.MathUtils.clamp(Number.isFinite(dt) ? dt : .016, 0, .035);
  const horizontal = T.MathUtils.clamp(Number.isFinite(dx) ? dx : 0, -200, 200);
  const vertical = T.MathUtils.clamp(Number.isFinite(dy) ? dy : 0, -200, 200);
  for (let index = 0; index < beads.length; index++) {
    const bead = beads[index], p = bead.mesh.position;
    const anchored = Number.isFinite(bead.anchorY);
    bead.vx += (-horizontal * .12 + Math.sin(seconds * 1.6 + index) * .11 - (anchored ? p.x * 18 : 0)) * step;
    bead.vy += (vertical * .12 + (anchored ? (bead.anchorY - p.y) * 22 : -.85) + Math.cos(seconds * 2 + index) * .08) * step;
    bead.vz += (Math.sin(seconds * 1.4 + index) * .08 - (anchored ? p.z * 18 : 0)) * step;
    const drag = Math.exp(-step * (anchored ? 6 : 2.7));
    bead.vx = T.MathUtils.clamp(bead.vx * drag, -3, 3);
    bead.vy = T.MathUtils.clamp(bead.vy * drag, -3, 3);
    bead.vz = T.MathUtils.clamp(bead.vz * drag, -3, 3);
    p.x += bead.vx * step; p.y += bead.vy * step; p.z += bead.vz * step;
    constrain(bead);
  }
  for (let iteration = 0; iteration < 3; iteration++) {
    for (let i = 0; i < beads.length; i++) for (let j = i + 1; j < beads.length; j++) {
      const a = beads[i], b = beads[j];
      if (a.chamber.id !== b.chamber.id) continue;
      const separation = b.mesh.position.clone().sub(a.mesh.position), length = separation.length(), minimum = a.r + b.r;
      if (length > .000001 && length < minimum) {
        separation.multiplyScalar((minimum - length) / length * .5);
        a.mesh.position.sub(separation); b.mesh.position.add(separation);
        const velocity = a.vy; a.vy = b.vy * .65; b.vy = velocity * .65;
      }
    }
    beads.forEach(constrain);
  }
}
