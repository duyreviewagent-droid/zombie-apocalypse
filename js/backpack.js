// Zombie_Apocalypse — your backpack, and your hands.
// The pack is a real thing on your back: a hiking/school pack with a zipped main compartment (the lid folds open),
// a zipped front pocket, mesh bottle pockets on the sides, padded shoulder straps with a sternum strap, a haul loop and
// compression straps. It rides on the chest bone (Spine2), fitted to each body by measuring the body's own skin, fills
// out as you carry more, and shows what you carry: a bat or crowbar strapped on, a water bottle in the side pocket,
// a long gun along the side. To get into it you swing it off one shoulder round to your front and unzip it.
// Hands: anything you pick up is in your hand — the real can off the shelf, the bottle out of the fridge — and goes
// over your shoulder into the pack with a zip and a rustle. Eating, drinking, bandaging: the thing is in your hand.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeMeleeMesh } from './melee.js';
import { makeWeaponMesh } from './weapons.js';
import * as SND from './audio.js';

const V3 = THREE.Vector3, Q4 = THREE.Quaternion;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, k) => a + (b - a) * k;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

// ---------------------------------------------------------------- cloth: a woven nylon with a little grime
function fabricTex(base, weave = 1, dirt = 0.5) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  // the weave: fine alternating threads in both directions
  for (let y = 0; y < 256; y += 2) for (let x = 0; x < 256; x += 2) {
    const on = ((x >> 1) + (y >> 1)) & 1, k = (Math.random() - 0.5) * 0.08 + (on ? 0.07 : -0.07) * weave;
    g.fillStyle = k > 0 ? `rgba(255,255,255,${k})` : `rgba(0,0,0,${-k})`; g.fillRect(x, y, 2, 2);
  }
  // scuffs and dust where it rubs
  for (let i = 0; i < 40 * dirt; i++) { const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1); gr.addColorStop(0, `rgba(70,60,45,${0.12 + Math.random() * 0.12})`); gr.addColorStop(1, 'rgba(70,60,45,0)'); g.save(); g.translate(Math.random() * 256, Math.random() * 256); g.scale(8 + Math.random() * 30, 5 + Math.random() * 16); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, 7); g.fill(); g.restore(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}
// open mesh (the side pockets): a dark net you can half see through
function netTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.clearRect(0, 0, 64, 64); g.strokeStyle = '#2a2d2f'; g.lineWidth = 2.2;
  for (let i = -64; i < 128; i += 8) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.stroke(); g.beginPath(); g.moveTo(i, 64); g.lineTo(i + 64, 0); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 2); return t;
}
let M = null;
function mats() {
  if (M) return M;
  const body = fabricTex('#4a5340', 1, 0.7), dark = fabricTex('#2b2d2f', 0.8, 0.4);
  M = {
    body: new THREE.MeshStandardMaterial({ map: body, bumpMap: body, bumpScale: 0.6, roughness: 0.86 }),
    dark: new THREE.MeshStandardMaterial({ map: dark, bumpMap: dark, bumpScale: 0.5, roughness: 0.9 }),
    strap: new THREE.MeshStandardMaterial({ map: dark, roughness: 0.85, side: THREE.DoubleSide }),
    web: new THREE.MeshStandardMaterial({ color: 0x1c1d1e, roughness: 0.75 }),
    net: new THREE.MeshStandardMaterial({ map: netTex(), color: 0xffffff, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.8 }),
    zip: new THREE.MeshStandardMaterial({ color: 0x121314, roughness: 0.5, metalness: 0.2 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x9a9da2, roughness: 0.35, metalness: 0.9 }),
    cord: new THREE.MeshStandardMaterial({ color: 0xd2661e, roughness: 0.7 }),
    inside: new THREE.MeshStandardMaterial({ color: 0x0d0e0f, roughness: 1 }),
    lining: new THREE.MeshStandardMaterial({ color: 0x8a3b26, roughness: 0.9 }),
    buckle: new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.45 }),
    reflect: new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.3, metalness: 0.4 }),
  };
  return M;
}

// a padded strap: a flat band swept along a path (rebuilt in place while the straps are moving)
function ribbonGeo(n) {
  const g = new THREE.BufferGeometry(), idx = [];
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 4 * 3), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 4 * 2).map((_, i) => (i % 2 ? Math.floor(i / 8) / n * 6 : (i >> 1) % 4 < 2 ? 0 : 1)), 2));
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < 4; k++) { const a = i * 4 + k, b = i * 4 + (k + 1) % 4, c = a + 4, d = b + 4; idx.push(a, c, b, b, c, d); }
  g.setIndex(idx); g.userData.n = n; return g;
}
const rT = new V3(), rS = new V3(), rN = new V3(), rRef = new V3();
function ribbonSet(g, pts, w, th, ref) {
  const pos = g.attributes.position.array, n = pts.length;
  for (let i = 0; i < n; i++) {
    rT.subVectors(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize();
    rRef.copy(ref); if (Math.abs(rRef.dot(rT)) > 0.85) rRef.set(0, 1, 0);
    rS.copy(rRef).addScaledVector(rT, -rRef.dot(rT)).normalize(); rN.crossVectors(rT, rS);
    const p = pts[i], taper = i === 0 || i === n - 1 ? 0.7 : 1;
    for (let k = 0; k < 4; k++) {
      const sx = (k === 0 || k === 3 ? 0.5 : -0.5) * w * taper, sn = (k < 2 ? 0.5 : -0.5) * th;
      const o = (i * 4 + k) * 3; pos[o] = p.x + rS.x * sx + rN.x * sn; pos[o + 1] = p.y + rS.y * sx + rN.y * sn; pos[o + 2] = p.z + rS.z * sx + rN.z * sn;
    }
  }
  g.attributes.position.needsUpdate = true; g.computeVertexNormals(); g.computeBoundingSphere();
}

// ---------------------------------------------------------------- the pack itself (pack frame: the back panel is z = 0
// and faces +z, into your back; +y up; the front pocket is out at z = -D)
const W = 0.31, H = 0.44, D = 0.17, LO = H - 0.11;   // LO: height of the lower part (the lid is the top 0.11 m)
const SEAM_Y = -H / 2 + LO;
function seamPath() {
  // the main zip runs round the top of the lower part: from the back of the left side, along it, across the front, back along the right
  const y = SEAM_Y, r = 0.045, pts = [];
  pts.push(new V3(W / 2 + 0.002, y, -0.03), new V3(W / 2 + 0.002, y, -D + r), new V3(W / 2 - r * 0.3, y, -D - 0.002 + r * 0.3), new V3(0, y, -D - 0.004), new V3(-W / 2 + r * 0.3, y, -D - 0.002 + r * 0.3), new V3(-W / 2 - 0.002, y, -D + r), new V3(-W / 2 - 0.002, y, -0.03));
  return new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.2);
}
function zipPull(m) {
  const g = new THREE.Group();
  const tab = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.026, 0.004), m.metal); tab.position.y = -0.016; g.add(tab);
  const loop = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.0028, 5, 12), m.cord); loop.position.y = -0.04; g.add(loop);
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.014, 6), m.buckle); tip.position.y = -0.056; g.add(tip);
  return g;
}
function bottleMesh(m) {
  const g = new THREE.Group(), pts = [];
  for (const [r, y] of [[0, 0], [0.03, 0], [0.032, 0.01], [0.032, 0.15], [0.026, 0.175], [0.014, 0.19], [0.014, 0.2]]) pts.push(new THREE.Vector2(r, y));
  const clear = new THREE.MeshStandardMaterial({ color: 0x9cc8e8, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.55 });
  const b = new THREE.Mesh(new THREE.LatheGeometry(pts, 14), clear); g.add(b);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(0.029, 0.029, 0.12, 12), new THREE.MeshStandardMaterial({ color: 0x5a9cc8, roughness: 0.1, transparent: true, opacity: 0.45 })); water.position.y = 0.065; g.add(water);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.018, 10), new THREE.MeshStandardMaterial({ color: 0x1e58b8, roughness: 0.4 })); cap.position.y = 0.207; g.add(cap);
  const label = new THREE.Mesh(new THREE.CylinderGeometry(0.0325, 0.0325, 0.05, 14, 1, true), new THREE.MeshStandardMaterial({ color: 0xe8eef2, roughness: 0.6 })); label.position.y = 0.085; g.add(label);
  return g;
}
function buildPack() {
  const m = mats(), root = new THREE.Group(), add = (par, geo, mat, x, y, z, sh = true) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = sh; o.receiveShadow = true; par.add(o); return o; };
  const body = new THREE.Group(); root.add(body);          // scaled with how full it is
  add(body, new RoundedBoxGeometry(W, LO + 0.02, D, 4, 0.05), m.body, 0, -H / 2 + (LO + 0.02) / 2 - 0.01, -D / 2);
  // the lid: hinged at its front-top edge, folds forward and down when unzipped
  const lidPivot = new THREE.Group(); lidPivot.position.set(0, SEAM_Y, -D); body.add(lidPivot);
  const lid = add(lidPivot, new RoundedBoxGeometry(W, 0.14, D, 4, 0.055), m.body, 0, 0.04, D / 2);
  const lidIn = add(lidPivot, new THREE.PlaneGeometry(W - 0.03, D - 0.03), m.lining, 0, -0.024, D / 2, false); lidIn.rotation.x = Math.PI / 2;
  // inside, seen when it's open: the dark, and the tops of things
  const inside = new THREE.Group(); inside.position.set(0, SEAM_Y + 0.004, -D / 2); body.add(inside); inside.visible = false;
  add(inside, new THREE.PlaneGeometry(W - 0.03, D - 0.025), m.inside, 0, 0, 0, false).rotation.x = -Math.PI / 2;
  // (what you carry is laid in here by Pack.setContents)
  // the zip, and its two pulls
  const seam = seamPath();
  add(body, new THREE.TubeGeometry(seam, 40, 0.0045, 5, false), m.zip, 0, 0, 0, false);
  const pullA = zipPull(m), pullB = zipPull(m); body.add(pullA, pullB);
  // front pocket, with its own zip and pull, and a reflective strip
  const fp = new THREE.Group(); fp.position.set(0, -H / 2 + 0.135, -D); body.add(fp);
  add(fp, new RoundedBoxGeometry(W * 0.8, 0.2, 0.07, 4, 0.03), m.dark, 0, 0, -0.022);
  const fz = new THREE.CatmullRomCurve3([new V3(-W * 0.36, 0.07, -0.05), new V3(-W * 0.18, 0.09, -0.056), new V3(0, 0.094, -0.058), new V3(W * 0.18, 0.09, -0.056), new V3(W * 0.36, 0.07, -0.05)]);
  add(fp, new THREE.TubeGeometry(fz, 20, 0.004, 5, false), m.zip, 0, 0, 0, false);
  const fpull = zipPull(m); fpull.position.copy(fz.getPoint(0.82)); fpull.rotation.x = 0.25; fp.add(fpull);
  add(fp, new THREE.BoxGeometry(W * 0.5, 0.012, 0.004), m.reflect, 0, -0.03, -0.059, false);
  add(fp, new RoundedBoxGeometry(0.05, 0.035, 0.006, 2, 0.003), m.web, 0, 0.02, -0.058, false);
  // padded back panel, reinforced base, haul loop
  add(body, new RoundedBoxGeometry(W * 0.9, H * 0.86, 0.03, 3, 0.012), m.dark, 0, -0.02, -0.008);
  add(body, new RoundedBoxGeometry(W + 0.008, 0.05, D + 0.008, 3, 0.022), m.dark, 0, -H / 2 + 0.02, -D / 2);
  const haul = add(root, new THREE.TorusGeometry(0.026, 0.007, 6, 14, Math.PI), m.web, 0, H / 2 - 0.005, -0.03); haul.rotation.y = Math.PI / 2;
  // mesh side pockets (the left one carries your water) and the compression straps above them
  const pockets = [];
  for (const sx of [1, -1]) {
    const pk = new THREE.Group(); pk.position.set(sx * (W / 2 + 0.018), -H / 2 + 0.1, -D / 2); body.add(pk); pockets.push(pk);
    add(pk, new THREE.CylinderGeometry(0.045, 0.04, 0.13, 14, 1, true), m.net, 0, 0, 0, false);
    add(pk, new THREE.TorusGeometry(0.045, 0.004, 5, 16), m.web, 0, 0.065, 0, false).rotation.x = Math.PI / 2;
    add(pk, new THREE.CircleGeometry(0.04, 12), m.dark, 0, -0.064, 0, false).rotation.x = Math.PI / 2;
    for (const y of [0.04, 0.16]) { add(body, new THREE.BoxGeometry(0.005, 0.02, D * 0.92), m.web, sx * (W / 2 + 0.003), -H / 2 + y + 0.12, -D / 2, false); add(body, new THREE.BoxGeometry(0.008, 0.028, 0.03), m.buckle, sx * (W / 2 + 0.006), -H / 2 + y + 0.12, -D * 0.72, false); }
  }
  const bottle = bottleMesh(m); bottle.position.set(0, -0.06, 0); bottle.rotation.z = 0.08; pockets[0].add(bottle); bottle.visible = false;
  // tool loops on the front: what you strap on goes under these
  for (const [x, y] of [[-0.05, 0.08], [0.06, -0.06]]) add(body, new THREE.BoxGeometry(0.03, 0.05, 0.008), m.web, x, y, -D - 0.006, false);
  // the loose ends of the shoulder straps, for when it's off your back (worn straps are drawn in the body's frame)
  const mounts = new THREE.Group(); root.add(mounts);   // strapped weapons
  return { root, body, lidPivot, inside, seam, pullA, pullB, bottle, mounts, fp };
}

// ---------------------------------------------------------------- held things: what's in your hand
const GEO = {}, HM = {};
function hm() {
  if (HM.can) return HM;
  const lab = (a, b) => { const c = document.createElement('canvas'); c.width = 128; c.height = 64; const g = c.getContext('2d'); g.fillStyle = a; g.fillRect(0, 0, 128, 64); g.fillStyle = b; g.fillRect(0, 22, 128, 20); g.fillStyle = 'rgba(255,255,255,.7)'; g.fillRect(14, 28, 40, 4); g.fillRect(14, 34, 26, 3); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
  Object.assign(HM, {
    can: new THREE.MeshStandardMaterial({ map: lab('#b8402a', '#f0e0b8'), roughness: 0.45, metalness: 0.3 }),
    soup: new THREE.MeshStandardMaterial({ map: lab('#d8d0c0', '#c02a24'), roughness: 0.45, metalness: 0.3 }),
    soda: new THREE.MeshStandardMaterial({ map: lab('#c0161c', '#f4f4f4'), roughness: 0.3, metalness: 0.6 }),
    tin: new THREE.MeshStandardMaterial({ color: 0xb8bbbf, roughness: 0.3, metalness: 0.9 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.85 }),
    gauze: new THREE.MeshStandardMaterial({ color: 0xeeeae0, roughness: 1 }),
    red: new THREE.MeshStandardMaterial({ color: 0xb8231c, roughness: 0.5 }),
    orange: new THREE.MeshStandardMaterial({ color: 0xd8781c, roughness: 0.25, transparent: true, opacity: 0.85 }),
    cereal: new THREE.MeshStandardMaterial({ map: lab('#e0a020', '#2a5ab8'), roughness: 0.7 }),
    chips: new THREE.MeshStandardMaterial({ map: lab('#e8c020', '#c81e1e'), roughness: 0.3, metalness: 0.4 }),
    bar: new THREE.MeshStandardMaterial({ map: lab('#3a2a20', '#e8b040'), roughness: 0.4, metalness: 0.3 }),
    juice: new THREE.MeshStandardMaterial({ map: lab('#f0a030', '#38a040'), roughness: 0.6 }),
    apple: new THREE.MeshStandardMaterial({ color: 0x9a2418, roughness: 0.45 }),
    green: new THREE.MeshStandardMaterial({ color: 0x3a6a2a, roughness: 0.25, transparent: true, opacity: 0.8 }),
    ammo: new THREE.MeshStandardMaterial({ map: lab('#2a4a2a', '#d8c070'), roughness: 0.7 }),
    shells: new THREE.MeshStandardMaterial({ map: lab('#6a1a14', '#e8d8b0'), roughness: 0.7 }),
    batt: new THREE.MeshStandardMaterial({ map: lab('#1a1a1a', '#d8a020'), roughness: 0.4, metalness: 0.4 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc8a050, roughness: 0.3, metalness: 1 }),
    paper: new THREE.MeshStandardMaterial({ color: 0xece4cc, roughness: 0.95, side: THREE.DoubleSide }),
    gas: new THREE.MeshStandardMaterial({ color: 0xb0201a, roughness: 0.4, metalness: 0.2 }),
  });
  GEO.can = new THREE.CylinderGeometry(0.037, 0.037, 0.11, 16); GEO.soda = new THREE.CylinderGeometry(0.033, 0.033, 0.122, 16);
  GEO.rim = new THREE.CylinderGeometry(0.0375, 0.0375, 0.006, 16);
  return HM;
}
// a model of an item (centred, its long axis along +y)
export function itemModel(id) {
  const m = hm(), g = new THREE.Group(), add = (geo, mat, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  let r = 0.035;
  if (id === 'beans' || id === 'soup') { add(GEO.can, id === 'soup' ? m.soup : m.can); add(GEO.rim, m.tin, 0, 0.056); add(GEO.rim, m.tin, 0, -0.056); r = 0.037; }
  else if (id === 'soda') { add(GEO.soda, m.soda); add(new THREE.CylinderGeometry(0.026, 0.033, 0.012, 14), m.tin, 0, 0.067); r = 0.033; }
  else if (id === 'water') { const b = bottleMesh(mats()); b.position.y = -0.1; g.add(b); r = 0.032; }
  else if (id === 'juice') { add(new RoundedBoxGeometry(0.055, 0.1, 0.038, 2, 0.004), m.juice); add(new THREE.CylinderGeometry(0.003, 0.003, 0.05, 5), m.white, 0.012, 0.065); r = 0.02; }
  else if (id === 'chips') { add(new RoundedBoxGeometry(0.15, 0.2, 0.045, 3, 0.02), m.chips); r = 0.025; }
  else if (id === 'bar') { add(new RoundedBoxGeometry(0.035, 0.12, 0.014, 2, 0.005), m.bar); r = 0.01; }
  else if (id === 'apple') { add(new THREE.SphereGeometry(0.04, 14, 10), m.apple).scale.set(1, 0.9, 1); add(new THREE.CylinderGeometry(0.002, 0.003, 0.02, 4), m.white, 0, 0.04).material = new THREE.MeshStandardMaterial({ color: 0x4a3020 }); r = 0.04; }
  else if (id === 'cereal') { add(new THREE.BoxGeometry(0.19, 0.26, 0.065), m.cereal); r = 0.033; }
  else if (id === 'bandage') { add(new THREE.CylinderGeometry(0.03, 0.03, 0.065, 16), m.gauze); add(new THREE.CylinderGeometry(0.011, 0.011, 0.066, 8), m.white).material = new THREE.MeshStandardMaterial({ color: 0x8a8070 }); r = 0.03; }
  else if (id === 'medkit') { add(new RoundedBoxGeometry(0.2, 0.14, 0.07, 3, 0.012), m.red); const cr = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }); add(new THREE.BoxGeometry(0.06, 0.016, 0.072), cr); add(new THREE.BoxGeometry(0.016, 0.06, 0.072), cr); r = 0.035; }
  else if (id === 'pills' || id === 'antibiotics') { add(new THREE.CylinderGeometry(0.022, 0.022, 0.07, 12), id === 'pills' ? m.orange : m.white); add(new THREE.CylinderGeometry(0.024, 0.024, 0.016, 12), id === 'pills' ? m.white : m.red, 0, 0.042); r = 0.022; }
  else if (id === 'ammo9' || id === 'shells' || id === 'rifleAmmo') { add(new THREE.BoxGeometry(0.07, 0.045, 0.035), id === 'shells' ? m.shells : m.ammo); r = 0.018; }
  else if (id === 'battery') { for (const x of [-0.008, 0.008]) { add(new THREE.CylinderGeometry(0.007, 0.007, 0.05, 8), m.batt, x, 0); add(new THREE.CylinderGeometry(0.003, 0.003, 0.004, 6), m.tin, x, 0.027); } r = 0.008; }
  else if (id === 'bottle') { const pts = [[0, 0], [0.034, 0], [0.034, 0.17], [0.014, 0.22], [0.013, 0.27], [0, 0.27]].map(([a, b]) => new THREE.Vector2(a, b)); add(new THREE.LatheGeometry(pts, 12), m.green, 0, -0.13); r = 0.034; }
  else if (id === 'molotov') { const w = makeWeaponMesh('molotov'); g.add(w); r = 0.034; }
  else if (id === 'keys') { add(new THREE.TorusGeometry(0.015, 0.0025, 5, 14), m.tin); add(new THREE.BoxGeometry(0.012, 0.05, 0.003), m.brass, 0.005, -0.035); add(new THREE.BoxGeometry(0.014, 0.045, 0.003), m.tin, -0.01, -0.032).rotation.z = 0.3; r = 0.008; }
  else if (id === 'gascan') { add(new RoundedBoxGeometry(0.24, 0.28, 0.12, 3, 0.02), m.gas); add(new THREE.CylinderGeometry(0.014, 0.018, 0.06, 8), m.gas, 0.08, 0.16).rotation.z = -0.5; r = 0.06; }
  else if (id === 'note') { add(new THREE.PlaneGeometry(0.15, 0.2), m.paper); r = 0.005; }
  else if (MELEEISH[id]) { const w = makeMeleeMesh(id); w.position.y = -0.0; g.add(w); r = 0.016; g.userData.weapon = true; }
  else if (GUNISH[id]) { const w = makeWeaponMesh(id); g.add(w); r = 0.02; g.userData.gun = true; }
  else { add(new THREE.BoxGeometry(0.06, 0.08, 0.03), m.white); r = 0.016; }
  g.userData.r = r; return g;
}
const MELEEISH = { knife: 1, bat: 1, crowbar: 1, machete: 1, axe: 1 }, GUNISH = { pistol: 1, shotgun: 1, sniper: 1 };
// a copy of a real prop off a shelf (the instanced can, bottle or box) — the very one you grabbed
export function propModel(it) {
  let src = null;
  if (it.mesh) { src = it.mesh.clone(); src.position.set(0, 0, 0); src.quaternion.identity(); it.mesh.getWorldScale(src.scale); }
  else if (it.ref && it.ref.L && it.ref.L.im) { const im = it.ref.L.im; src = new THREE.Mesh(im.geometry, im.material); src.scale.copy(it.s); }
  if (!src) return null;
  src.castShadow = true;
  // centre it on the hand: its middle, not its base
  const box = new THREE.Box3().setFromObject(src), c = box.getCenter(new V3()), sz = box.getSize(new V3());
  const g = new THREE.Group(); src.position.sub(c); g.add(src);
  g.userData.r = Math.min(sz.x, sz.z) / 2; g.userData.prop = true;
  return g;
}

// ---------------------------------------------------------------- sounds of the pack (made here: nothing else zips)
let NB = null;
function noiseBuf(ctx) { if (NB) return NB; NB = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = NB.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return NB; }
function tick(ctx, out, t, f, g, d = 0.006) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf(ctx); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 2.2;
  const e = ctx.createGain(); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(g, t + 0.0008); e.gain.exponentialRampToValueAtTime(0.0005, t + d);
  s.connect(bp).connect(e).connect(out); s.start(t, Math.random() * 0.9, d + 0.01);
}
// a zip: a run of tiny teeth clicks, quick in the middle — dur seconds, open (rising) or closed (falling)
export function zipSound(dur = 0.45, open = true, gain = 0.5) {
  const R = SND.raw && SND.raw(); if (!R) return; const { ctx, out } = R; const t0 = ctx.currentTime + 0.01;
  let t = 0; while (t < dur) { const k = t / dur, rate = 70 + 160 * Math.sin(Math.PI * k); tick(ctx, out, t0 + t, (open ? 2600 + 1800 * k : 4400 - 1800 * k) + Math.random() * 500, gain * (0.5 + 0.5 * Math.sin(Math.PI * k)) * (0.7 + Math.random() * 0.3)); t += 1 / rate; }
}
// nylon rustling: something going into the pack, the pack swung about
export function rustle(dur = 0.35, gain = 0.35, f = 1800) {
  const R = SND.raw && SND.raw(); if (!R) return; const { ctx, out } = R; const t = ctx.currentTime + 0.01;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf(ctx); s.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(f * 0.7, t); bp.frequency.linearRampToValueAtTime(f * 1.3, t + dur); bp.Q.value = 0.8;
  const e = ctx.createGain(); e.gain.setValueAtTime(0, t);
  for (let i = 0; i < 6; i++) { const tt = t + dur * i / 6; e.gain.linearRampToValueAtTime(gain * (0.3 + Math.random() * 0.7), tt + 0.02); e.gain.linearRampToValueAtTime(gain * 0.15, tt + dur / 6); }
  e.gain.linearRampToValueAtTime(0, t + dur + 0.05);
  s.connect(bp).connect(e).connect(out); s.start(t, Math.random()); s.stop(t + dur + 0.1);
}
// a buckle / a strap pulled tight
export function strapSound(gain = 0.4) { const R = SND.raw && SND.raw(); if (!R) return; const { ctx, out } = R; const t = ctx.currentTime + 0.01; tick(ctx, out, t, 1500, gain, 0.03); tick(ctx, out, t + 0.05, 900, gain * 0.7, 0.05); rustle(0.18, gain * 0.5, 1200); }

// ---------------------------------------------------------------- fitting it to a body
// measure the body's own skin round the chest bone, in the body's frame (z forward, y up, x to its left), so the pack
// sits on the back without sinking in and the straps lie on the chest and over the shoulders
const fv = new V3(), fq = new Q4(), fsc = new V3();
function measure(sol) {
  const B = sol.B; sol.pivot.updateMatrixWorld(true);
  const sp = B.Spine2.getWorldPosition(new V3());
  const fw = new V3(0, 0, 1).applyQuaternion(sol.pivot.getWorldQuaternion(fq)); fw.y = 0; fw.normalize();
  const lf = new V3(fw.z, 0, -fw.x);   // the body's left
  const rel = b => { const v = b.getWorldPosition(new V3()).sub(sp); return { x: v.dot(lf), y: v.y, z: v.dot(fw) }; };
  const neck = rel(B.Neck), hips = rel(B.Hips), la = rel(B.LeftArm), ra = rel(B.RightArm);
  const armX = Math.max(0.1, (Math.abs(la.x) + Math.abs(ra.x)) / 2) * 0.85;
  const pts = [];
  sol.root.traverse(o => {
    if (!o.isSkinnedMesh || /hair|eye|teeth|beard|head|lash|brow|glass/i.test(o.name)) return;
    if (o.skeleton) o.skeleton.update();
    // which bones are "arm": the forearm, hand and fingers never count; the upper arm only for its cap at the shoulder
    // (in the bind pose the arm sticks straight out: measured as skin it pulls the straps off the body)
    const bones = o.skeleton ? o.skeleton.bones : [], kind = bones.map(b => /ForeArm|Hand|Thumb|Index|Middle|Ring|Pinky/i.test(b.name) ? 2 : /(Left|Right)Arm$/i.test(b.name) ? 1 : 0);
    const si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight;
    const n = o.geometry.attributes.position.count, step = n > 12000 ? 3 : 1;
    for (let i = 0; i < n; i += step) {
      let kb = 0;
      if (si && sw) { let bw = -1, bi = 0; for (let j = 0; j < 4; j++) { const w = sw.getComponent(i, j); if (w > bw) { bw = w; bi = si.getComponent(i, j); } } kb = kind[bi] || 0; }
      if (kb === 2) continue;
      o.getVertexPosition(i, fv); fv.applyMatrix4(o.matrixWorld).sub(sp);
      const x = fv.dot(lf);
      if (kb === 1 && Math.abs(x) > armX) continue;   // the arm stuck out, not the shoulder's cap
      pts.push(x, fv.y, fv.dot(fw));
    }
  });
  // the outermost skin in a little window
  const ext = (x0, x1, y0, y1, dir, axis = 2, zlim = 1) => { let best = dir > 0 ? -1 : 1, hit = false; for (let i = 0; i < pts.length; i += 3) { const x = pts[i], y = pts[i + 1], z = pts[i + 2]; if (x < x0 || x > x1 || y < y0 || y > y1 || Math.abs(z) > zlim) continue; const v = axis === 2 ? z : y; if (dir > 0 ? v > best : v < best) { best = v; hit = true; } } return hit ? best : null; };
  const halfW = Math.max(0.12, (Math.abs(la.x) + Math.abs(ra.x)) / 2);
  const top = neck.y - 0.035, bottom = Math.max(hips.y + 0.07, top - 0.5);
  const back = ext(-0.11, 0.11, bottom, top, -1) ?? -0.12;
  const shTop = (s) => ext(s > 0 ? 0.06 : -0.12, s > 0 ? 0.12 : -0.06, 0, neck.y + 0.01, 1, 1, 0.07) ?? neck.y - 0.02;
  const front = (s, y) => ext(s > 0 ? 0.07 : -0.13, s > 0 ? 0.13 : -0.07, y - 0.03, y + 0.03, 1) ?? 0.12;
  const side = (s, y) => { let best = 0; for (let i = 0; i < pts.length; i += 3) { const x = pts[i], yy = pts[i + 1], z = pts[i + 2]; if (Math.abs(yy - y) > 0.03 || Math.abs(z) > 0.06 || Math.abs(x) > halfW - 0.02) continue; if (x * s > best) best = x * s; } return best || halfW * 0.8; };
  const F = { top, bottom, back, halfW, sh: { 1: shTop(1), '-1': shTop(-1) } };
  F.strap = {};
  for (const s of [1, -1]) {
    const sy = F.sh[s], yA = sy - 0.1, yB = Math.max(bottom + 0.2, -0.08), yC = Math.max(bottom + 0.12, -0.16);
    // each point sits on the measured skin, never more than 1.5 cm proud of it
    F.strap[s] = { sy, fA: Math.min(0.2, front(s, yA)) + 0.004, fB: Math.min(0.2, front(s, yB)) + 0.004, fC: Math.min(0.2, front(s, yC)) + 0.004, yA, yB, yC, side: Math.min(halfW, side(s, yC - 0.02)) };
  }
  return F;
}

// ---------------------------------------------------------------- the pack on a body
const STRAP_N = 26;
export class Pack {
  constructor(scene) {
    this.scene = scene; this.P = buildPack(); this.k = 1;
    this.holder = new THREE.Group(); this.holder.add(this.P.root);   // the body's frame, riding on Spine2
    this.fits = {}; this.sol = null;
    this.straps = {}; this.wornPts = {}; this.loosePts = {};
    for (const s of [1, -1]) { const g = ribbonGeo(STRAP_N), m = new THREE.Mesh(g, mats().strap); m.castShadow = true; m.frustumCulled = false; this.holder.add(m); this.straps[s] = m; }
    this.sternum = new THREE.Mesh(new THREE.BoxGeometry(1, 0.016, 0.006), mats().web); this.holder.add(this.sternum);
    this.sternumClip = new THREE.Mesh(new RoundedBoxGeometry(0.03, 0.024, 0.012, 2, 0.004), mats().buckle); this.holder.add(this.sternumClip);
    this.fill = 0; this.fillT = 0; this.bulge = 0; this.swing = 0; this.zip = 0; this.lid = 0; this.tilt = 0;
    this.strapW = { 1: 0, '-1': 0 };   // 0 on the shoulder, 1 slipped off
    this.carried = { melee: [], gun: null, water: false, knife: false };
    this.mountKey = '';
    this.anch = {}; this.visible = true; this.strapDirty = true;
  }
  // put it on this body (fitted once per body, then remembered)
  wear(sol, body) {
    if (this.sol === sol && this.body === body) return;
    this.sol = sol; this.body = body;
    const B = sol.B;
    if (!this.fits[body]) {
      const F = measure(sol);
      // the body's frame inside the chest bone: undo the bone's turn and scale at this rest moment
      sol.pivot.updateMatrixWorld(true);
      const bq = B.Spine2.getWorldQuaternion(new Q4()), pq = sol.pivot.getWorldQuaternion(new Q4()); B.Spine2.getWorldScale(fsc);
      F.q = bq.invert().multiply(pq); F.s = 1 / (fsc.x || 1);
      this.fits[body] = F;
    }
    const F = this.F = this.fits[body];
    B.Spine2.add(this.holder);
    this.holder.quaternion.copy(F.q); this.holder.scale.setScalar(F.s); this.holder.position.set(0, 0, 0);
    // size: from the base of the neck to just above the hips
    this.k = clamp((F.top - F.bottom) / H, 0.78, 1.12);
    this.P.root.scale.setScalar(this.k);
    this.base = { y: (F.top + F.bottom) / 2, z: F.back - 0.012 };
    // the straps as worn: from the top of the back panel, over the shoulder, down the chest, under the arm, to the base
    for (const s of [1, -1]) {
      const T = F.strap[s], x = s * 0.085, pk = (H / 2) * this.k;
      this.wornPts[s] = [
        new V3(s * 0.07, this.base.y + pk - 0.05, F.back - 0.004),
        new V3(x, T.sy + 0.02, F.back * 0.45),
        new V3(s * 0.093, T.sy + 0.03, 0.0),
        new V3(s * 0.1, T.sy - 0.005, T.fA * 0.62),
        new V3(s * 0.102, T.yA, T.fA + 0.014),
        new V3(s * 0.104, T.yB, T.fB + 0.012),
        new V3(s * 0.11, T.yC, T.fC + 0.008),
        new V3(s * (T.side + 0.018), T.yC - 0.05, T.fC * 0.25),
        new V3(s * (W / 2 * this.k - 0.03), this.base.y - pk + 0.06, F.back - 0.03),
      ];
    }
    this.strapDirty = true;
  }
  detach() { this.holder.removeFromParent(); this.sol = null; }
  setVisible(v) { this.holder.visible = v; }
  // where things are, in the world: 'mouth' (into the main compartment), 'pull' (the main zip's pull), 'strap'
  // (+1 / -1: a shoulder strap where your hand takes it), 'grip' (the handle of the strapped weapon), 'gun', 'side', 'front'
  anchor(name, out, side = 1) {
    const P = this.P, r = P.root;
    if (name === 'mouth') out.set(0, SEAM_Y + 0.05, -D * 0.5 * P.body.scale.z);
    else if (name === 'pull') return P.pullA.getWorldPosition(out);
    else if (name === 'grip') { const m = P.mounts.children[0]; if (m) return m.getWorldPosition(out); out.set(-W * 0.35, H / 2 + 0.06, -D - 0.03); }
    else if (name === 'gun') { const m = P.mounts.children.find(o => o.userData.gun); if (m) return m.getWorldPosition(out); out.set(W / 2 + 0.03, H / 2, -D / 2); }
    else if (name === 'side') out.set(side * (W / 2 + 0.02), -H / 2 + 0.16, -D / 2);
    else if (name === 'front') out.set(0, -H / 2 + 0.2, -D * P.body.scale.z - 0.06);
    else if (name === 'haul') out.set(0, H / 2 + 0.01, -0.035);
    else if (name === 'corner') out.set(side * (W / 2 - 0.025), SEAM_Y + 0.03, -D * 0.5 * P.body.scale.z);
    else if (name === 'strap') { const pts = this.curPts && this.curPts[side]; if (pts) return out.copy(pts[Math.floor(STRAP_N * 0.3)]).applyMatrix4(this.holder.matrixWorld); out.set(side * 0.1, 0.12, 0); return out.applyMatrix4(this.holder.matrixWorld); }
    return r.localToWorld(out);
  }
  pulse(k = 1) { this.bulge = Math.min(1.5, this.bulge + k); }
  // what's strapped on: melee weapons not in your hand, a long gun not in your hands, your water
  setCarried(melee, gun, water) {
    const key = melee.join(',') + '|' + (gun || '') + '|' + (water ? 1 : 0);
    this.P.bottle.visible = !!water;
    if (key === this.mountKey) return;
    this.mountKey = key;
    const mt = this.P.mounts; while (mt.children.length) mt.remove(mt.children[0]);
    // the first one goes diagonally across the front, handle up over your right shoulder; a second down the right side
    const long = melee.filter(id => id !== 'knife');
    long.slice(0, 2).forEach((id, i) => {
      const w = makeMeleeMesh(id); w.userData.id = id; w.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
      const L = w.userData.tip || 0.5;
      if (i === 0) { w.position.set(-W * 0.34, H / 2 + 0.05, -D - 0.035); w.rotation.set(0, 0, Math.PI + 0.62); }   // handle up behind your right shoulder, head down across to the left
      else { w.position.set(-W / 2 - 0.035, H / 2 + 0.03, -D * 0.55); w.rotation.set(0.06, 0, Math.PI); }
      mt.add(w);
    });
    if (melee.includes('knife')) { const w = makeMeleeMesh('knife'); w.userData.id = 'knife'; w.position.set(-W / 2 - 0.02, -H / 2 + 0.2, -D / 2); w.rotation.set(0, 0, Math.PI); mt.add(w); }   // handle up out of the right pocket
    if (gun && gun !== 'pistol') { const g = makeWeaponMesh(gun); g.userData.gun = gun; g.position.set(W / 2 + 0.045, -0.02, -D * 0.5); g.rotation.set(Math.PI / 2 - 0.12, 0, 0); g.scale.setScalar(1 / this.k); mt.add(g); }
    for (const o of mt.children) if (!o.userData.gun) o.scale.setScalar(1 / this.k);
  }
  // what you see in the open top: the things you actually carry (up to 6, laid in a 3 x 2 grid, sunk by how full it is)
  setContents(ids) {
    const list = (ids || []).filter(id => !MELEEISH[id] && !GUNISH[id]).slice(0, 6), key = list.join(',');
    if (key === this.contentsKey) return;
    this.contentsKey = key;
    const ins = this.P.inside;
    for (const o of ins.children.slice(1)) { ins.remove(o); o.traverse(q => { if (q.geometry && !Object.values(GEO).includes(q.geometry)) q.geometry.dispose(); }); }
    list.forEach((id, i) => {
      const it = itemModel(id), col = i % 3, row = Math.floor(i / 3);
      it.scale.setScalar(0.8);
      it.rotation.set(Math.PI / 2 * (it.userData.r < 0.03 ? 1 : 0.85), 0, 0);
      const g = new THREE.Group(); g.add(it); g.rotation.y = (Math.random() - 0.5) * 2.4;
      g.position.set(lerp(-W / 2 + 0.05, W / 2 - 0.05, col / 2) + (Math.random() - 0.5) * 0.01, -0.02 + this.fill * 0.03 - (it.userData.r || 0.03) * 0.4, lerp(-D / 2 + 0.03, D / 2 - 0.03, row) * 0.6);
      g.traverse(q => { if (q.isMesh) q.castShadow = false; });
      ins.add(g);
    });
  }
  // where a strapped weapon's handle is (null: not on the pack)
  mountPos(id, out) { const m = this.P.mounts.children.find(o => o.userData.id === id || o.userData.gun === id); return m ? m.getWorldPosition(out) : null; }
  // where the n-th strapped melee weapon goes (for putting one away before its strap exists)
  slotPos(i, out) { if (i === 0) out.set(-W * 0.34, H / 2 + 0.05, -D - 0.035); else out.set(-W / 2 - 0.035, H / 2 + 0.03, -D * 0.55); return this.P.root.localToWorld(out); }
  hideMount(id, hide) { for (const o of this.P.mounts.children) if (o.userData.id === id || o.userData.gun === id) o.visible = !hide; }
  // st: { fill 0..1 } · this.swing (0 on your back … 1 held in front), this.zip (0 shut … 1 open) are driven by the caller
  update(dt, fill) {
    if (!this.sol) return;
    const P = this.P;
    this.fill = damp(this.fill, fill, 2.5, dt); this.bulge = damp(this.bulge, 0, 4, dt);
    const sz = lerp(0.74, 1.1, this.fill) + this.bulge * 0.05, sx = lerp(0.95, 1.04, this.fill) + this.bulge * 0.015;
    P.body.scale.set(sx, 1, sz);
    // the swing round from your back to your front (round your right side), and tipped toward you to look in
    // eased: it starts slow off the shoulder, swings fast round your side and slows into your hands (no robot turn)
    const s = this.swing, se = s * s * (3 - 2 * s), a = se * Math.PI, rBack = -this.base.z, rFront = 0.36;
    const r = lerp(rBack, rFront, smooth(0, 1, se)), y = lerp(this.base.y, -0.3, smooth(0.1, 0.9, se));
    P.root.position.set(-Math.sin(a) * r * 1.05, y + Math.sin(a) * 0.06, -Math.cos(a) * r);
    // a small settle as it lands in front of you (weight swinging on in your hands)
    const settle = Math.sin(clamp((s - 0.85) / 0.15, 0, 1) * Math.PI) * 0.06;
    P.root.rotation.set(0, a, settle); P.root.rotateX(-0.42 * smooth(0.6, 1, se));
    if (s < 0.001) P.root.position.z = this.base.z;
    // the zip: pull A runs from the right side round the front to the left; the lid falls open behind it
    const zu = this.zip;
    P.pullA.position.copy(P.seam.getPoint(lerp(0.96, 0.05, zu))); P.pullA.rotation.set(0.15, 0, 0);
    P.pullB.position.copy(P.seam.getPoint(0.985)); P.pullB.rotation.set(0.15, 0, 0);
    this.lid = damp(this.lid, smooth(0.55, 1, zu), 9, dt);
    P.lidPivot.rotation.x = -this.lid * 2.15; P.inside.visible = this.lid > 0.03;
    // the straps: on your shoulders, or hanging loose off the pack as it comes round
    const sw = this.strapW;
    sw[-1] = smooth(0, 0.35, s); sw[1] = smooth(0.2, 0.6, s);
    const moving = s > 0.001 || this.strapDirty || this.wasMoving;
    this.wasMoving = s > 0.001;
    if (moving) {
      this.strapDirty = false; this.curPts ||= {};
      P.root.updateMatrix();
      for (const side of [1, -1]) {
        const worn = this.wornPts[side], k = sw[side];
        const pts = worn.map((p, i) => {
          if (k <= 0) return p.clone();
          // loose: a loop hanging off the back panel of the pack (pack frame → body frame)
          const u = i / (worn.length - 1), lp = new V3(side * (0.07 + 0.03 * Math.sin(u * Math.PI)), lerp(H / 2 - 0.05, -H / 2 + 0.06, u), 0.02 + Math.sin(u * Math.PI) * 0.11).multiplyScalar(this.k).applyMatrix4(P.root.matrix);
          return p.clone().lerp(lp, k);
        });
        const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.3), smoothPts = curve.getPoints(STRAP_N - 1);
        this.curPts[side] = smoothPts;
        ribbonSet(this.straps[side].geometry, smoothPts, 0.052, 0.014, new V3(1, 0, 0));
      }
    }
    // the sternum strap clips the two straps together across your chest while it's on
    const wornK = 1 - Math.max(sw[1], sw[-1]);
    // it unclips (the two halves slide apart) as the left strap starts to slip, and clicks back on at the end
    this.sternum.visible = this.sternumClip.visible = wornK > 0.6;
    if (this.sternum.visible && this.curPts) {
      const a1 = this.curPts[1][Math.floor(STRAP_N * 0.42)], a2 = this.curPts[-1][Math.floor(STRAP_N * 0.42)];
      const open = 1 - smooth(0.6, 0.98, wornK);
      this.sternum.position.copy(a1).add(a2).multiplyScalar(0.5); this.sternum.position.z += 0.008; this.sternum.scale.x = Math.max(0.001, a1.distanceTo(a2) * (1 - open));
      this.sternumClip.position.copy(this.sternum.position); this.sternumClip.position.z += 0.004; this.sternumClip.position.x += open * 0.05;
    }
    const clipped = wornK > 0.9;
    if (this.wasClipped !== undefined && clipped !== this.wasClipped && this.sol) strapSound(0.15);
    this.wasClipped = clipped;
    this.holder.updateWorldMatrix(true, true);   // anchors are read straight after this
  }
}

// ---------------------------------------------------------------- hands: reach for something, hold it, put it away
// A job is a path for one hand: a list of keys (each a target the hand goes to, evaluated live every frame) with times,
// plus events at times (grab: the thing is now in your hand; stow: it goes into the pack). The hand blends in from
// wherever the animation has it and back out at the end, so nothing ever snaps.
const hp = new V3(), hq = new Q4(), hA = new V3(), hB = new V3(), hF = new V3(), hS = new V3(), hTmp = new V3(), hUp = new V3(0, 1, 0), hN = new V3(), hM = new THREE.Matrix4(), hQ2 = new Q4(), hP2 = new V3(), hX = new V3(), hY = new V3(), hZ = new V3();
export function handFrame(sol, side, pos, quat) {
  const b = sol.B[side > 0 ? 'RightHand' : 'LeftHand']; b.updateWorldMatrix(true, false); b.matrixWorld.decompose(pos, quat, hTmp); return b;
}
// where a thing of radius r sits in your hand: in the palm, its long axis along the index side
export function gripPose(sol, side, r, pos, quat) {
  const B = sol.B, Pn = side > 0 ? 'Right' : 'Left';
  const hand = B[Pn + 'Hand'].getWorldPosition(hA), mid = B[Pn + 'HandMiddle1'].getWorldPosition(hB);
  const f = hF.subVectors(mid, hand).normalize();
  const idx = B[Pn + 'HandIndex1'].getWorldPosition(hS), pin = B[Pn + 'HandPinky1'].getWorldPosition(hTmp);
  const s = idx.sub(pin).normalize(); s.addScaledVector(f, -s.dot(f)).normalize();
  const n = hN.crossVectors(f, s).multiplyScalar(side > 0 ? -1 : 1);   // out of the palm
  pos.copy(hand).addScaledVector(f, 0.065).addScaledVector(n, r + 0.012);
  hY.copy(s); hZ.copy(n); hX.crossVectors(hY, hZ); hM.makeBasis(hX, hY, hZ); quat.setFromRotationMatrix(hM);
  return pos;
}
export class Hands {
  constructor(scene) { this.scene = scene; this.jobs = []; this.cur = null; this.held = {}; this.T = { p: new V3(), f: new V3(), s: new V3(), curl: 0.8, blend: true }; }
  busy() { return !!this.cur || this.jobs.length > 0; }
  // which hands are taken right now (a job's hands, or something held)
  uses(side) { if (this.held[side]) return true; const J = this.cur; return !!J && J.lists.some(L => L.side === side); }
  // job: { side, keys: [{ t, at(out) → out | false, curl }], ev: [[t, fn(now)]], outT, tick(t) } — or, for both hands at
  // once, lists: [{ side, keys, inT }, ...]. Each key's target is read live, so the hand follows things that move.
  play(job) { this.jobs.push(job); if (!this.cur) this.next(); }
  next() {
    const J = this.cur = this.jobs.shift() || null; if (!J) return;
    J.t = 0; J.evi = 0; J.ev ||= []; J.ev.sort((a, b) => a[0] - b[0]);
    J.lists ||= [{ side: J.side, keys: J.keys, inT: J.inT }];
    J.end = Math.max(...J.lists.map(L => L.keys[L.keys.length - 1].t)) + (J.outT ?? 0.35);
    for (const L of J.lists) { L.p = new V3(); L.pa = new V3(); L.pb = new V3(); L.curl = null; }
  }
  // finish everything now (you moved, you got grabbed): every event still to come happens at once, nothing is lost
  flush() {
    const all = this.cur ? [this.cur, ...this.jobs] : this.jobs; this.jobs = []; this.cur = null;
    for (const J of all) { J.evi ||= 0; J.ev ||= []; J.ev.sort((a, b) => a[0] - b[0]); for (; J.evi < J.ev.length; J.evi++) { try { J.ev[J.evi][1](true); } catch (e) { console.error(e); } } }
    for (const s in this.held) this.drop(+s, true);
  }
  // put a mesh in a hand: from where it is now (a prop off the shelf), settling into the grip
  hold(side, mesh, { from = null, grow = false } = {}) {
    this.drop(side, true);
    const sol = this.sol; if (!sol || !mesh) return;
    this.scene.add(mesh);
    handFrame(sol, side, hp, hq);
    const H = { mesh, lp: new V3(), lq: new Q4(), settle: 0, grow: grow ? 0 : 1, shrink: -1, r: mesh.userData.r || 0.03 };
    const inv = hq.clone().invert();
    if (from) { H.lp.copy(from.p).sub(hp).applyQuaternion(inv); H.lq.copy(inv).multiply(from.q); }
    else { gripPose(sol, side, H.r, hP2, hQ2); H.lp.copy(hP2).sub(hp).applyQuaternion(inv); H.lq.copy(inv).multiply(hQ2); H.settle = 1; }
    this.held[side] = H;
    this.place(side, H);
  }
  // into the pack (shrinks away into the opening) or simply gone
  drop(side, now = false) { const H = this.held[side]; if (!H) return; if (now) { H.mesh.removeFromParent(); delete this.held[side]; } else if (H.shrink < 0) H.shrink = 0; }
  // let go of it where it is (an empty can): the mesh is yours to drop, no longer in the hand
  release(side) { const H = this.held[side]; if (!H) return null; delete this.held[side]; return H.mesh; }
  place(side, H) { handFrame(this.sol, side, hp, hq); H.mesh.position.copy(H.lp).applyQuaternion(hq).add(hp); H.mesh.quaternion.copy(hq).multiply(H.lq); }
  // where one hand's path says it should be at time t (false: the target's gone)
  target(L, J) {
    const K = L.keys, t = J.t, t0 = K[0].t, tIn = L.inT ?? (K[0].tIn ?? 0);
    if (t < t0) { L.w = smooth(tIn, t0, t); return K[0].at(L.p) !== false; }
    let i = 0; while (i < K.length - 1 && t >= K[i + 1].t) i++;
    if (i >= K.length - 1) { L.w = 1 - smooth(K[K.length - 1].t, J.end, t); return K[K.length - 1].at(L.p) !== false; }
    const a = K[i], b = K[i + 1], e = smooth(a.t, b.t, t);
    if (a.at(L.pa) === false || b.at(L.pb) === false) return false;
    L.p.lerpVectors(L.pa, L.pb, e); L.w = 1; return true;
  }
  // call after the body's animation and any other hand work: solves the hands and moves what they hold
  update(dt, sol) {
    this.sol = sol;
    const J = this.cur;
    if (J) {
      J.t += dt;
      while (J.evi < J.ev.length && J.t >= J.ev[J.evi][0]) { const e = J.ev[J.evi++]; try { e[1](false); } catch (err) { console.error(err); } }
      if (J.tick) J.tick(J.t);
      if (J.t >= J.end || !this.cur) this.next();
      else for (const L of J.lists) {
        if (!this.target(L, J) || L.w < 0.005) continue;
        const T = this.T, side = L.side;
        const sh = sol.B[side > 0 ? 'RightArm' : 'LeftArm'].getWorldPosition(hTmp);
        T.p.copy(L.p); T.f.subVectors(L.p, sh); T.f.y *= L.flatF ?? 0.4; T.f.normalize();
        T.s.crossVectors(T.f, hUp); if (T.s.lengthSq() < 1e-4) T.s.set(Math.cos(sol.yaw), 0, -Math.sin(sol.yaw)); T.s.normalize().multiplyScalar(side);
        // fingers: open as the hand gets there, closed once it has hold of something
        let curl = L.keys[0].curl ?? 0.3; for (const k of L.keys) if (J.t >= k.t - 0.06 && k.curl != null) curl = k.curl;
        L.curl = L.curl == null ? curl : damp(L.curl, curl, 14, dt); T.curl = L.curl;
        sol.reach(side, T, L.w * 0.97);
      }
    }
    // what's in your hands follows them
    for (const s in this.held) {
      const H = this.held[s], side = +s;
      handFrame(sol, side, hp, hq);
      if (H.settle < 1) {
        H.settle = Math.min(1, H.settle + dt * 3.2);
        gripPose(sol, side, H.r, hP2, hQ2); const inv = hq.clone().invert();
        const ip = hP2.sub(hp).applyQuaternion(inv), iq = inv.multiply(hQ2), k = smooth(0, 1, H.settle) * 0.35;
        H.lp.lerp(ip, k); H.lq.slerp(iq, k);
      }
      H.mesh.position.copy(H.lp).applyQuaternion(hq).add(hp); H.mesh.quaternion.copy(hq).multiply(H.lq);
      let sc = 1;
      if (H.grow < 1) { H.grow = Math.min(1, H.grow + dt * 6); sc *= smooth(0, 1, H.grow); }
      if (H.shrink >= 0) { H.shrink += dt * 6; sc *= 1 - smooth(0, 1, H.shrink); if (H.shrink >= 1) { H.mesh.removeFromParent(); delete this.held[s]; continue; } }
      H.mesh.scale.setScalar(Math.max(0.001, sc));
      H.mesh.visible = sol.visible;
    }
  }
}

// ---------------------------------------------------------------- a bandage, wound round your forearm (stays on)
export class Wrap {
  constructor(scene) {
    const g = new THREE.CylinderGeometry(1, 1, 1, 14, 6, true); g.translate(0, 0.5, 0);
    this.mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xeee8dc, roughness: 1, side: THREE.DoubleSide })); this.mesh.castShadow = true;
    this.spot = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshStandardMaterial({ color: 0x8a1c14, roughness: 0.8 })); this.spot.scale.set(0.018, 0.012, 0.006);
    this.mesh.visible = this.spot.visible = false; scene.add(this.mesh, this.spot); this.k = 0;
  }
  // k: 0 none … 1 fully wound; side: which arm
  update(sol, k, side = -1) {
    this.k = k; const on = k > 0.01 && sol.visible; this.mesh.visible = on; this.spot.visible = on && k > 0.9;
    if (!on) return;
    const P = side > 0 ? 'Right' : 'Left', B = sol.B;
    const a = B[P + 'ForeArm'].getWorldPosition(hA), b = B[P + 'Hand'].getWorldPosition(hB);
    const d = hF.subVectors(b, a), L = d.length(); d.divideScalar(L || 1);
    const start = hTmp.copy(a).addScaledVector(d, L * 0.3);
    this.mesh.position.copy(start); this.mesh.quaternion.setFromUnitVectors(hUp, d);
    this.mesh.scale.set(0.046, L * 0.5 * smooth(0, 1, k), 0.046);
    this.spot.position.copy(start).addScaledVector(d, L * 0.25); this.spot.quaternion.copy(this.mesh.quaternion);
    hS.set(1, 0, 0).applyQuaternion(this.mesh.quaternion); this.spot.position.addScaledVector(hS, 0.046);
  }
}
