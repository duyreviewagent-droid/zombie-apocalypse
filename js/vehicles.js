// Zombie_Apocalypse — cars, built properly. The body is three extrusions of the side profile: a thin outer skin
// (door panels with rounded edges and real wheel arches), an inner skin (the wheel tubs) and a centre tub that is
// hollow where a real car is hollow — the cabin, the trunk, the pickup's bed, the SUV's cargo bay, the van's back.
// On top sits a real greenhouse: see-through glass panes, painted pillars and a roof, so you can see the seats, the
// dash and the steering wheel inside. Bumpers, grille, lamps (per car, so an alarm can flash them), its own plate,
// mirrors with glass, wipers, exhaust, dished rims with lug nuts and brake discs, black wheel-well liners.
// Every car is merged into a handful of meshes. Wrecks have the whole nose crumpled (body, bumper, lamps and all),
// cracked glass with panes smashed out; burnt-out ones are a rusty shell sitting on bare rims.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const M = {};
const canvasTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; };
function mats() {
  if (M.glass) return M;
  // real glass: tinted, reflective, see-through (double-sided so you see the far window from inside the car too)
  M.glass = new THREE.MeshPhysicalMaterial({ color: 0x1a242c, roughness: 0.05, metalness: 0, transmission: 0, transparent: true, opacity: 0.45, depthWrite: false, envMapIntensity: 1.5, side: THREE.DoubleSide });
  // cracked safety glass: white crazing over a darker, cloudier pane
  M.broken = new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, (g) => {
    g.fillStyle = 'rgba(24,32,40,0.62)'; g.fillRect(0, 0, 256, 256); g.strokeStyle = 'rgba(225,235,245,0.85)';
    for (let k = 0; k < 3; k++) { const x0 = Math.random() * 256, y0 = Math.random() * 256; for (let i = 0; i < 16; i++) { g.lineWidth = 0.6 + Math.random(); g.beginPath(); g.moveTo(x0, y0); let x = x0, y = y0; const a = Math.random() * 6.28; for (let s = 0; s < 7; s++) { x += Math.cos(a + (Math.random() - 0.5) * 0.6) * 18; y += Math.sin(a + (Math.random() - 0.5) * 0.6) * 18; g.lineTo(x, y); } g.stroke(); } for (let r = 6; r < 70; r += 11) { g.beginPath(); g.arc(x0, y0, r, 0, 7); g.stroke(); } }
  }), roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
  M.trim = new THREE.MeshStandardMaterial({ color: 0x121314, roughness: 0.55, metalness: 0.2 });
  M.plastic = new THREE.MeshStandardMaterial({ color: 0x1c1d1f, roughness: 0.8 });
  M.chrome = new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.15, metalness: 1 });
  M.mirror = new THREE.MeshStandardMaterial({ color: 0xb4bcc4, roughness: 0.02, metalness: 1 });
  M.tire = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.92 });
  M.rim = new THREE.MeshStandardMaterial({ color: 0x9a9da2, roughness: 0.35, metalness: 0.9, side: THREE.DoubleSide });
  M.disc = new THREE.MeshStandardMaterial({ color: 0x5a5c60, roughness: 0.55, metalness: 0.8 });
  M.head = new THREE.MeshStandardMaterial({ color: 0xe8ecf0, roughness: 0.05, metalness: 0.5 });
  M.tail = new THREE.MeshStandardMaterial({ color: 0xb01010, roughness: 0.15, emissive: 0x400000 });
  M.amber = new THREE.MeshStandardMaterial({ color: 0xc87a10, roughness: 0.15 });
  M.reverse = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.1, metalness: 0.2 });
  M.under = new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 1, side: THREE.DoubleSide });   // underside, liners, carpet
  M.seat = new THREE.MeshStandardMaterial({ color: 0x2a2724, roughness: 0.9 });
  M.burnt = new THREE.MeshStandardMaterial({ color: 0x2a201a, roughness: 0.9, metalness: 0.4 });
  M.rust = new THREE.MeshStandardMaterial({ color: 0x4a2c1c, roughness: 0.85, metalness: 0.3 });
  M.white = new THREE.MeshStandardMaterial({ color: 0xe4e4e0, roughness: 0.5 });
  M.star = new THREE.MeshStandardMaterial({ map: canvasTex(128, 128, (g) => {   // the blue Star of Life
    g.translate(64, 64); g.fillStyle = '#1550b8'; for (let k = 0; k < 3; k++) { g.save(); g.rotate(k * Math.PI / 3); g.fillRect(-15, -58, 30, 116); g.restore(); }
    g.strokeStyle = '#fff'; g.lineWidth = 5; g.beginPath(); g.moveTo(0, -40); g.lineTo(0, 42); g.stroke(); g.beginPath(); g.moveTo(-4, -30); g.bezierCurveTo(14, -24, 12, -10, 0, -6); g.bezierCurveTo(-12, -2, -12, 10, 0, 14); g.bezierCurveTo(10, 18, 10, 28, 2, 32); g.lineWidth = 4; g.stroke();
  }), transparent: true, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 });
  return M;
}
// every car gets its own plate
function plateMat(text) {
  const L = () => String.fromCharCode(65 + Math.random() * 26 | 0);
  text ||= L() + L() + L() + ' ' + Math.floor(100 + Math.random() * 899);
  const t = canvasTex(128, 64, (g) => { g.fillStyle = '#e8e4d8'; g.fillRect(0, 0, 128, 64); g.strokeStyle = '#30405a'; g.lineWidth = 4; g.strokeRect(2, 2, 124, 60); g.fillStyle = '#20304a'; g.font = 'bold 27px Helvetica'; g.textAlign = 'center'; g.fillText(text, 64, 46); g.font = '9px Helvetica'; g.fillText('MAPLE COUNTY', 64, 14); });
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 });
}
const lamp = (m, e) => { const o = m.clone(); o.emissive = new THREE.Color(e); o.emissiveIntensity = 0; return o; };

// ---------------------------------------------------------------- shapes
// side profiles in (z = along the car, y = up); front is +z.
//  side: the silhouette below the windows (outer skin).  pts: the centre tub, hollow where the car is hollow.
//  glass: [rear base, rear top, front top, front base] of the side window outline.  cab: floor height f, cabin z0..z1,
//  where the front seat backs (front) and rear bench (rear) stand.  load: where the cargo sits (floor y, centre z).
const PROFILES = {
  sedan: { L: 4.6, W: 1.82, H: 1.45, wheelZ: [1.42, -1.42], r: 0.34, tumble: 0.2,
    side: [[-2.3, 0.42], [-2.33, 0.82], [-2.18, 0.98], [-1.2, 1.02], [1.12, 1.02], [2.02, 0.9], [2.3, 0.78], [2.33, 0.42]],
    pts: [[-2.3, 0.42], [-2.33, 0.8], [-2.24, 0.8], [-2.24, 0.5], [-1.24, 0.5], [-1.24, 0.95], [-1.0, 0.95], [-1.0, 0.4], [0.98, 0.4], [1.12, 1.0], [2.02, 0.9], [2.3, 0.78], [2.33, 0.42]],
    glass: [[-1.18, 1.04], [-0.73, 1.39], [0.42, 1.42], [1.1, 1.04]], pillars: [-0.05],
    cab: { f: 0.435, z0: -1.0, z1: 0.98, front: 0.02, rear: -0.9 }, load: { y: 0.535, z: -1.74, z0: -2.24, z1: -1.24 } },
  suv: { L: 4.75, W: 1.9, H: 1.8, wheelZ: [1.48, -1.45], r: 0.39, tumble: 0.15, hatchGlass: true,
    side: [[-2.35, 0.5], [-2.38, 1.18], [1.13, 1.2], [2.12, 1.1], [2.38, 0.95], [2.4, 0.5]],
    pts: [[-2.35, 0.5], [-2.38, 0.5], [1.0, 0.5], [1.13, 1.18], [2.12, 1.1], [2.38, 0.95], [2.4, 0.5]],
    glass: [[-2.34, 1.2], [-2.28, 1.72], [0.53, 1.73], [1.13, 1.22]], pillars: [-0.05, -1.25],
    cab: { f: 0.535, z0: -2.36, z1: 1.0, front: -0.08, rear: -1.18 }, load: { y: 0.535, z: -1.86 } },
  pickup: { L: 5.2, W: 1.9, H: 1.8, wheelZ: [1.72, -1.6], r: 0.4, tumble: 0.15,
    side: [[-2.6, 0.55], [-2.62, 1.08], [-0.56, 1.08], [-0.54, 1.22], [1.33, 1.22], [2.32, 1.12], [2.58, 0.98], [2.6, 0.55]],
    pts: [[-2.6, 0.55], [-2.62, 0.65], [-0.6, 0.65], [-0.6, 1.2], [-0.45, 1.2], [-0.45, 0.52], [1.2, 0.52], [1.33, 1.2], [2.32, 1.12], [2.58, 0.98], [2.6, 0.55]],
    glass: [[-0.53, 1.24], [-0.53, 1.71], [0.73, 1.73], [1.33, 1.24]], pillars: [], bed: [-2.6, -0.62],
    cab: { f: 0.555, z0: -0.45, z1: 1.2, front: -0.28, rear: null, bench: true }, load: { y: 0.69, z: -1.6 } },
  van: { L: 5.4, W: 2.0, H: 2.45, wheelZ: [1.85, -1.75], r: 0.4, tumble: 0.08, noRear: true,
    side: [[-2.7, 0.55], [-2.72, 2.45], [0.42, 2.45], [0.42, 1.55], [1.48, 1.52], [2.55, 1.25], [2.7, 1.0], [2.72, 0.55]],
    pts: [[-2.7, 0.55], [-2.72, 0.62], [-1.72, 0.62], [-1.72, 2.36], [-2.72, 2.36], [-2.72, 2.45], [0.42, 2.45], [0.42, 0.65], [1.38, 0.65], [1.48, 1.5], [2.55, 1.25], [2.7, 1.0], [2.72, 0.55]],
    glass: [[0.45, 1.55], [0.5, 2.3], [1.08, 2.37], [1.48, 1.6]], pillars: [],
    cab: { f: 0.685, z0: 0.45, z1: 1.38, front: 0.56, rear: null }, load: { y: 0.655, z: -2.2 } },
};
const shapeOf = pts => { const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]); s.closePath(); return s; };
// a side outline (z,y) with the two wheel arches cut out of its bottom
function archShape(P, top, ar) {
  const s = new THREE.Shape(); const [fz, rz] = P.wheelZ, base = top[0][1];
  s.moveTo(top[0][0], top[0][1]); for (let i = 1; i < top.length; i++) s.lineTo(top[i][0], top[i][1]);
  s.lineTo(fz + ar, base); s.absarc(fz, P.r + 0.02, ar, 0, Math.PI, false);
  s.lineTo(rz + ar, base); s.absarc(rz, P.r + 0.02, ar, 0, Math.PI, false);
  s.lineTo(top[0][0], top[0][1]);
  return s;
}
// extrude a side outline across the car from x0 to x1 with rounded edges; world-ish uvs so paint doesn't stretch
function slabX(shape, x0, x1, bev, curve = 14) {
  const d = Math.max(0.002, x1 - x0 - bev * 2);
  const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev, bevelSegments: bev > 0.03 ? 2 : 1, curveSegments: curve });
  g.rotateY(-Math.PI / 2); g.translate(x1 - bev, 0, 0);   // shape x → car z, extrusion → across the car
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getZ(i) + p.getX(i) * 0.3) / 2.2, p.getY(i) / 2.2);
  return g;
}
// the inner skin rides up over each wheel (wheel tubs): lift the tub outline wherever it would cut into an arch
function lift(P, pts) {
  const R = P.r + 0.13, yc = P.r + 0.02;
  const hump = z => { let y = -9; for (const wz of P.wheelZ) { const d = Math.abs(z - wz); if (d < R) y = Math.max(y, yc + Math.sqrt(R * R - d * d)); } return y; };
  const out = [pts[0]];   // extra points only where a floor crosses a wheel
  for (let i = 1; i < pts.length; i++) { const [z0, y0] = pts[i - 1], [z1, y1] = pts[i]; if (Math.abs(y1 - y0) < 0.02 && Math.abs(z1 - z0) > 0.1) { const n = Math.ceil(Math.abs(z1 - z0) / 0.06); for (let k = 1; k < n; k++) { const z = z0 + (z1 - z0) * k / n; if (hump(z) > -9 + 1) out.push([z, y0 + (y1 - y0) * k / n]); } } out.push(pts[i]); }
  const res = out.map((p, i) => i === 0 || i === out.length - 1 ? p : [p[0], Math.max(p[1], hump(p[0]))]);
  return res.filter((p, i) => i === 0 || Math.hypot(p[0] - res[i - 1][0], p[1] - res[i - 1][1]) > 1e-4);
}
// keep the part of a polygon between two z values (to split a side window at its pillars)
function clipZ(poly, lo, hi) {
  const cut = (pts, inside, at) => { const o = []; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length], ia = inside(a), ib = inside(b); if (ia) o.push(a); if (ia !== ib) { const t = (at - a[0]) / (b[0] - a[0]); o.push([at, a[1] + (b[1] - a[1]) * t]); } } return o; };
  return cut(cut(poly, p => p[0] >= lo, lo), p => p[0] <= hi, hi);
}
function quad(a, b, c, d) {   // two triangles a-b-c, a-c-d with 0..1 uvs
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([a, b, c, a, c, d].flatMap(v => [v.x, v.y, v.z]), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
  g.computeVertexNormals(); return g;
}
function tireGeo(r, w) {   // rounded shoulders and a slight sidewall bulge
  const R = r, ri = r * 0.62, h = w / 2, V = (a, b) => new THREE.Vector2(a, b);
  const pts = [V(ri, -h), V(R * 0.84, -h - 0.008), V(R - 0.045, -h), V(R - 0.015, -h + 0.014), V(R, -h + 0.045), V(R, h - 0.045), V(R - 0.015, h - 0.014), V(R - 0.045, h), V(R * 0.84, h + 0.008), V(ri, h)];
  return new THREE.LatheGeometry(pts, 22).rotateZ(Math.PI / 2);
}
function rimGeo(r, w) {   // a dished rim: lip, concave face, five spokes standing proud of it, a hub and five lug nuts; outer face is +x
  const rr = r * 0.62, V = (a, b) => new THREE.Vector2(a, b);
  const prof = [V(rr + 0.004, -w * 0.45), V(rr + 0.004, w * 0.3), V(rr + 0.018, w * 0.36), V(rr + 0.012, w * 0.42), V(rr - 0.012, w * 0.4), V(rr * 0.75, w * 0.22), V(r * 0.2, w * 0.12), V(r * 0.17, w * 0.2), V(r * 0.12, w * 0.26), V(0.001, w * 0.27)];
  const parts = [new THREE.LatheGeometry(prof, 22).rotateZ(-Math.PI / 2)];
  for (let k = 0; k < 5; k++) {
    const f = k / 5 * Math.PI * 2, c = Math.cos(f), s = Math.sin(f);
    const a = new THREE.Vector3(w * 0.2, r * 0.17 * c, r * 0.17 * s), b = new THREE.Vector3(w * 0.37, (rr - 0.012) * c, (rr - 0.012) * s);
    const dir = b.clone().sub(a), len = dir.length();
    const sp = new THREE.BoxGeometry(0.035, len, 0.05); sp.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())); sp.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); parts.push(sp);
    const nut = new THREE.CylinderGeometry(0.012, 0.012, 0.022, 6).rotateZ(-Math.PI / 2); nut.translate(w * 0.27, 0.06 * Math.cos(f + 0.63), 0.06 * Math.sin(f + 0.63)); parts.push(nut);
  }
  return mergeGeometries(parts.map(p => { const q = p.index ? p.toNonIndexed() : p; for (const k of Object.keys(q.attributes)) if (!['position', 'normal', 'uv'].includes(k)) q.deleteAttribute(k); return q; }));
}
// rounded boxes: small parts get a single rounding segment (they're tiny on screen), big panels two
const RBC = new Map();
const rb = (w, h, d, r = 0.03) => { const k = [w, h, d, r].map(v => v.toFixed(3)).join(); let g = RBC.get(k); if (!g) { g = new RoundedBoxGeometry(w, h, d, Math.max(w, h, d) > 0.7 ? 2 : 1, Math.min(r, w / 2.1, h / 2.1, d / 2.1)); RBC.set(k, g); } return g; };

// ---------------------------------------------------------------- one car → merged meshes
function piece(list, mat, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const g = (geo.index ? geo.toNonIndexed() : geo.clone());
  if (g.attributes.uv === undefined) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (g.attributes.normal === undefined) g.computeVertexNormals();
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz)));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  (list.get(mat) || list.set(mat, []).get(mat)).push(g);
}
// a rounded bar from point a to point b; w is its thickness across the car (local x), d its other side
function bar(list, mat, a, b, w, d, r = 0.015) {
  const dir = b.clone().sub(a), len = dir.length(); if (len < 1e-4) return;
  const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
  piece(list, mat, rb(w, len, d, r), (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, e.x, e.y, e.z);
}
// the wreck's crumple: the nose is pushed back about 0.4 m and down, with buckles, the right side dented in (same for every part,
// so bumper, lamps and plate move with the sheet metal). Normals are only recomputed where something moved.
function crumple(geo, P) {
  const p = geo.attributes.position, n = geo.attributes.normal, moved = new Uint8Array(p.count), z0 = P.L / 2 - 0.9;
  for (let i = 0; i < p.count; i++) {
    let z = p.getZ(i), x = p.getX(i), y = p.getY(i);
    if (z > z0) { const d = z - z0, k = d / 0.9; z = z0 + 0.85 * (1 - Math.exp(-d / 0.85)); y -= k * 0.12 - Math.sin(x * 9) * 0.03 * k; x *= 1 - Math.min(k, 1.3) * 0.06; moved[i] = 1; }   // squashed, but front parts stay in front
    if (x > 0 && Math.abs(z + 0.3) < 0.7) { x -= (1 - Math.abs(z + 0.3) / 0.7) * 0.12; moved[i] = 1; }
    p.setXYZ(i, x, y, z);
  }
  const old = n.array.slice(); geo.computeVertexNormals();
  for (let i = 0; i < p.count; i++) if (!moved[i]) n.setXYZ(i, old[i * 3], old[i * 3 + 1], old[i * 3 + 2]);
}
function meshes(list, parent, castM) {
  for (const [mat, geos] of list) { const m = new THREE.Mesh(mergeGeometries(geos), mat); m.castShadow = castM.includes(mat); m.receiveShadow = !mat.transparent; parent.add(m); }
}
// type: sedan | suv | pickup | van ; opts: { wreck, burnt, police, ambulance, white, red, noSearch }
export function buildCar(type, paint, opts = {}) {
  const K = mats(), P = PROFILES[type] || PROFILES.sedan;
  const list = new Map(), wl = new Map(), swl = new Map();   // body parts (crumpled on a wreck), wheel parts (never), the steering wheel
  let swAt = null;
  const W = P.W, hw = W / 2, Gp = P.glass, ar = P.r + 0.07, base = P.side[0][1];
  const burnt = !!opts.burnt, wreck = !!opts.wreck;
  const burn = m => burnt ? K.burnt : m;
  const paintM = burnt ? K.burnt : paint;
  const plateM = burnt ? K.burnt : plateMat(opts.police ? 'MCPD ' + (10 + Math.random() * 89 | 0) : '');
  const amb = burnt ? K.burnt : lamp(K.amber, 0xff8a10), head = burnt ? K.burnt : lamp(K.head, 0xfff2d0);
  const tailM = burn(K.tail), chromeM = burn(K.chrome), trimM = burn(K.trim), plasticM = burn(K.plastic), seatM = burnt ? K.rust : K.seat;

  // ---- body: outer skins, inner skins (wheel tubs), centre tub
  for (const sx of [-1, 1]) {
    piece(list, paintM, slabX(archShape(P, P.side, ar), sx > 0 ? hw - 0.1 : -hw, sx > 0 ? hw : -hw + 0.1, 0.04));
    piece(list, paintM, slabX(archShape(P, lift(P, P.pts), ar), sx > 0 ? hw - 0.3 : -hw + 0.1, sx > 0 ? hw - 0.1 : -hw + 0.3, 0.02));
  }
  const cp = P.pts.map((p, i) => i === 0 || i === P.pts.length - 1 ? [p[0], base - 0.1] : p);
  piece(list, paintM, slabX(shapeOf(cp), -(hw - 0.28), hw - 0.28, 0.03));
  piece(list, K.under, new THREE.BoxGeometry(W - 0.62, 0.04, P.L - 0.6), 0, base - 0.12, 0);   // under-tray
  // wheel wells: a black liner over each tyre and a black inner wall, so you never see daylight through the arch
  for (const wz of P.wheelZ) for (const sx of [-1, 1]) {
    piece(list, K.under, new THREE.CylinderGeometry(ar - 0.045, ar - 0.045, 0.27, 16, 1, true, 0, Math.PI).rotateZ(Math.PI / 2), sx * (hw - 0.165), P.r + 0.02, wz);
    piece(list, K.under, new THREE.BoxGeometry(0.01, ar * 1.1, ar * 2), sx * (hw - 0.29), P.r + 0.02 + ar * 0.4, wz);
  }

  // ---- greenhouse: glass panes, pillars, roof
  const yB = Math.min(Gp[0][1], Gp[3][1]), xb = hw - 0.05, X = y => xb - (y - yB) * P.tumble;
  const V = (sx, z, y, dx = 0) => new THREE.Vector3(sx * (X(y) - dx), y, z);
  const glassM = burnt ? null : wreck ? K.broken : K.glass;
  const lerpY = (a, b, z) => a[1] + (b[1] - a[1]) * THREE.MathUtils.clamp((z - a[0]) / (b[0] - a[0]), 0, 1);
  if (glassM) {
    const cuts = [-99, ...[...P.pillars].sort((a, b) => a - b), 99], panes = [];
    for (const sx of [-1, 1]) for (let i = 0; i < cuts.length - 1; i++) { const poly = clipZ(Gp, cuts[i], cuts[i + 1]); if (poly.length >= 3) panes.push({ sx, poly }); }
    let smash = wreck ? 1 + (Math.random() < 0.5 ? 1 : 0) : 0;   // a wreck has a pane or two smashed out
    while (smash-- > 0 && panes.length > 1) panes.splice(Math.random() * panes.length | 0, 1);
    for (const { sx, poly } of panes) {
      const g = new THREE.ShapeGeometry(shapeOf(poly)), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const z = p.getX(i), y = p.getY(i); p.setXYZ(i, sx * X(y), y, z); }
      g.computeVertexNormals(); piece(list, glassM, g);
    }
    const [g0, g1, g2, g3] = Gp;
    piece(list, glassM, quad(V(-1, g3[0], g3[1], 0.015), V(1, g3[0], g3[1], 0.015), V(1, g2[0], g2[1], 0.015), V(-1, g2[0], g2[1], 0.015)));   // windshield
    if (!P.hatchGlass && !P.noRear) piece(list, glassM, quad(V(1, g0[0], g0[1], 0.015), V(-1, g0[0], g0[1], 0.015), V(-1, g1[0], g1[1], 0.015), V(1, g1[0], g1[1], 0.015)));   // rear window
  }
  {
    const [g0, g1, g2, g3] = Gp, topW = 2 * X((g1[1] + g2[1]) / 2) + 0.08;
    bar(list, paintM, new THREE.Vector3(0, g1[1] + 0.035, g1[0] - 0.03), new THREE.Vector3(0, g2[1] + 0.035, g2[0] + 0.03), topW, 0.055, 0.025);   // roof
    for (const sx of [-1, 1]) {
      bar(list, paintM, V(sx, g1[0] - 0.02, g1[1] + 0.01), V(sx, g2[0] + 0.02, g2[1] + 0.01), 0.06, 0.07);             // roof rail
      bar(list, paintM, V(sx, g3[0] + 0.01, g3[1] - 0.02), V(sx, g2[0], g2[1] + 0.02), 0.055, 0.085);                  // A-pillar
      bar(list, paintM, V(sx, g0[0] - 0.01, g0[1] - 0.02), V(sx, g1[0], g1[1] + 0.02), 0.06, type === 'sedan' ? 0.15 : 0.1);   // C (or D) pillar
      for (const pz of P.pillars) bar(list, trimM, V(sx, pz, lerpY(g0, g3, pz) - 0.02), V(sx, pz, lerpY(g1, g2, pz) + 0.065), 0.055, 0.085);   // B-pillars
      bar(list, type === 'sedan' ? chromeM : trimM, V(sx, g0[0], g0[1] + 0.005, -0.012), V(sx, g3[0], g3[1] + 0.005, -0.012), 0.025, 0.02, 0.008);   // belt trim
    }
    // wipers parked at the bottom of the windshield
    for (const wx of [-0.22, 0.34]) piece(list, trimM, rb(0.5, 0.014, 0.022, 0.006), wx, g3[1] + 0.035, g3[0] - 0.06, 0, 0, wx > 0 ? 0.05 : -0.03);
  }

  // ---- interior: carpet, seats with headrests, rear bench, dash, wheel
  {
    const C = P.cab, f = C.f, iw = W - 0.62, back = (sx, z, w) => {
      if (burnt) {   // the foam and covers are gone: a rusty seat pan, springs and the bare back frame
        piece(list, K.rust, rb(w, 0.03, 0.46, 0.01), sx, f + 0.17, z + 0.27);
        for (let k = 0; k < 4; k++) piece(list, K.under, new THREE.TorusGeometry(0.035, 0.006, 4, 8).rotateX(Math.PI / 2), sx - w / 2 + (k + 0.5) * w / 4, f + 0.2, z + 0.27);
        const A = (dx, dy, dz) => new THREE.Vector3(sx + dx, f + dy, z + dz), e = w / 2 - 0.02;
        bar(list, K.rust, A(-e, 0.18, 0), A(-e, 0.72, -0.1), 0.025, 0.025, 0.008); bar(list, K.rust, A(e, 0.18, 0), A(e, 0.72, -0.1), 0.025, 0.025, 0.008); bar(list, K.rust, A(-e, 0.72, -0.1), A(e, 0.72, -0.1), 0.025, 0.025, 0.008);
        return;
      }
      piece(list, seatM, rb(w, 0.14, 0.48, 0.05), sx, f + 0.14, z + 0.27);                              // cushion
      piece(list, seatM, rb(w, 0.52, 0.12, 0.05), sx, f + 0.47, z, -0.18);                              // backrest
      for (const hx of w > 0.6 ? [-w / 3, w / 3] : [0]) piece(list, seatM, rb(0.24, 0.16, 0.1, 0.04), sx + hx, f + 0.82, z - 0.07, -0.18);   // headrest
    };
    piece(list, K.under, new THREE.BoxGeometry(iw, 0.012, C.z1 - C.z0 - 0.04), 0, f - 0.006, (C.z0 + C.z1) / 2);   // carpet
    if (C.bench) back(0, C.front, iw - 0.04); else for (const sx of [-0.33, 0.33]) back(sx, C.front, 0.46);
    if (C.rear != null) back(0, C.rear, iw - 0.04);
    if (!C.bench && type !== 'van') piece(list, plasticM, rb(0.2, 0.2, 0.55, 0.04), 0, f + 0.1, C.front + 0.3);   // centre console
    const dy = Gp[3][1] - 0.07, dz = C.z1 - 0.14;
    piece(list, plasticM, rb(iw, 0.17, 0.42, 0.06), 0, dy, dz);                                                     // dash
    if (!burnt) {
      piece(swl, K.trim, new THREE.TorusGeometry(0.17, 0.02, 6, 20));                                              // steering wheel (driver on the left; its own little mesh so it can turn)
      bar(list, K.trim, new THREE.Vector3(0.33, dy + 0.04, dz - 0.28), new THREE.Vector3(0.33, dy - 0.02, dz - 0.1), 0.05, 0.05);
      piece(swl, K.trim, rb(0.32, 0.05, 0.08, 0.02));                                                              // its spokes
      swAt = [0.33, dy + 0.06, dz - 0.3];
    }
    if (wreck) for (let k = 0; k < 9; k++) piece(list, K.broken, new THREE.BoxGeometry(0.03 + Math.random() * 0.06, 0.004, 0.02 + Math.random() * 0.05), (Math.random() - 0.5) * 0.9, f + 0.215, C.front + 0.1 + Math.random() * 0.4, 0, Math.random() * 6, 0);   // glass on the seats
  }

  // ---- bumpers, grille, lamps, plates
  const fz = P.side[P.side.length - 1][0] + 0.04, bz = P.side[0][0] - 0.05, by = base + 0.08, tall = type === 'suv' || type === 'van';
  if (wreck) piece(list, plasticM, rb(W + 0.04, 0.2, 0.2, 0.06), (Math.random() - 0.5) * 0.1, by - 0.03, fz + 0.03, (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 0.25);   // knocked crooked
  else piece(list, type === 'pickup' || type === 'van' ? chromeM : plasticM, rb(W + 0.04, 0.2, 0.2, 0.06), 0, by, fz + 0.03);
  piece(list, type === 'pickup' ? chromeM : plasticM, rb(W + 0.04, 0.2, 0.2, 0.06), 0, by, bz - 0.02);
  piece(list, trimM, rb(W * 0.42, 0.18, 0.04, 0.02), 0, by + 0.24, fz);
  for (let k = 0; k < 3; k++) piece(list, chromeM, new THREE.BoxGeometry(W * 0.4, 0.012, 0.012), 0, by + 0.18 + k * 0.05, fz + 0.025);
  const lost = wreck ? (Math.random() < 0.5 ? -1 : 1) : 0;   // a wreck has lost one headlight
  for (const sx of [-1, 1]) {
    if (sx !== lost) { piece(list, head, rb(0.36, 0.13, 0.06, 0.03), sx * (hw - 0.24), by + 0.25, fz + 0.005); piece(list, chromeM, rb(0.38, 0.15, 0.03, 0.02), sx * (hw - 0.24), by + 0.25, fz - 0.015); }
    else piece(list, K.under, rb(0.34, 0.12, 0.03, 0.02), sx * (hw - 0.24), by + 0.25, fz - 0.03);   // the empty socket
    piece(list, amb, rb(0.08, 0.06, 0.12, 0.01), sx * (hw + 0.02), by + 0.24, fz - 0.12);                         // front corner indicator
    if (tall) {   // tall cars: vertical tail lamps up the rear corners, reversing lamp and indicator below
      piece(list, tailM, rb(0.085, 0.42, 0.05, 0.02), sx * (hw - 0.05), by + 0.55, bz);
      piece(list, amb, rb(0.085, 0.1, 0.05, 0.02), sx * (hw - 0.05), by + 0.27, bz);
      piece(list, burn(K.reverse), rb(0.085, 0.08, 0.05, 0.02), sx * (hw - 0.05), by + 0.17, bz);
    } else {
      const ty = by + 0.22, tz = bz - 0.005;
      piece(list, tailM, rb(0.3, 0.14, 0.06, 0.03), sx * (hw - 0.22), ty, tz);
      piece(list, chromeM, rb(0.32, 0.16, 0.03, 0.02), sx * (hw - 0.22), ty, tz + 0.02);
      piece(list, amb, rb(0.1, 0.07, 0.06, 0.02), sx * (hw - 0.43), ty + 0.03, tz);
      piece(list, burn(K.reverse), rb(0.1, 0.07, 0.06, 0.02), sx * (hw - 0.43), ty - 0.045, tz);
    }
    piece(list, tailM, rb(0.03, 0.05, 0.1, 0.01), sx * (hw + 0.006), by + 0.2, bz + 0.2);                          // rear side marker
  }
  piece(list, plateM, new THREE.BoxGeometry(0.42, 0.13, 0.01), 0, by + 0.02, fz + 0.135);
  if (type !== 'suv') piece(list, plateM, new THREE.BoxGeometry(0.42, 0.13, 0.01).rotateY(Math.PI), 0, type === 'sedan' ? by + 0.26 : by + 0.02, type === 'sedan' ? bz - 0.01 : bz - 0.13);
  piece(list, burnt ? K.rust : K.chrome, new THREE.CylinderGeometry(0.035, 0.035, 0.25, 10).rotateX(Math.PI / 2), hw - 0.35, base - 0.1, bz + 0.05);   // exhaust
  // door seams and handles, mirrors with glass, rubbing strip, fuel door, antenna
  const seamY0 = base + 0.12, seamY1 = yB - 0.02;
  const seams = type === 'pickup' ? [Gp[3][0] - 0.05, Gp[0][0] + 0.02] : type === 'van' ? [Gp[3][0] - 0.02, Gp[0][0] - 0.03] : type === 'suv' ? [Gp[3][0] - 0.1, P.pillars[0], P.pillars[1]] : [Gp[3][0] - 0.1, P.pillars[0], Gp[0][0] + 0.1];
  for (const sx of [-1, 1]) {
    for (const sz of seams) piece(list, trimM, new THREE.BoxGeometry(0.008, seamY1 - seamY0, 0.012), sx * (hw + 0.004), (seamY0 + seamY1) / 2, sz);
    for (let i = 0; i < seams.length - 1; i++) piece(list, chromeM, rb(0.02, 0.03, 0.14, 0.01), sx * (hw + 0.012), seamY1 - 0.12, seams[i] - 0.25);
    const mz = Gp[3][0] - 0.14, my = Gp[3][1] + 0.08;
    piece(list, paintM, rb(0.17, 0.11, 0.07, 0.03), sx * (hw + 0.12), my, mz);
    bar(list, trimM, new THREE.Vector3(sx * (hw - 0.03), my - 0.04, mz + 0.03), new THREE.Vector3(sx * (hw + 0.06), my - 0.01, mz), 0.03, 0.03, 0.01);
    if (!burnt) piece(list, K.mirror, new THREE.PlaneGeometry(0.14, 0.08).rotateY(Math.PI), sx * (hw + 0.12), my, mz - 0.037);
    piece(list, trimM, new THREE.BoxGeometry(0.01, 0.06, 0.6), sx * (hw + 0.006), base + 0.18, 0);   // rubbing strip
  }
  { const fzz = P.wheelZ[1] - (type === 'pickup' ? 0.0 : 0.3), fy = 2 * P.r + 0.3;   // fuel door on the left rear quarter
    piece(list, trimM, new THREE.BoxGeometry(0.006, 0.17, 0.17), hw + 0.001, fy, fzz); piece(list, paintM, rb(0.012, 0.15, 0.15, 0.02), hw + 0.006, fy, fzz); }
  if (type === 'sedan' || type === 'pickup') piece(list, trimM, new THREE.CylinderGeometry(0.003, 0.005, 0.75, 5), -(hw - 0.06), lerpY(P.side[4], P.side[5], fz - 0.9) + 0.4, fz - 0.9);   // aerial on the fender

  // ---- wheels: tyre + dished rim + brake disc; flat on a wreck; none left on a burnt car, just rusty rims
  const tg = tireGeo(P.r, 0.24), rg = rimGeo(P.r, 0.24), discG = new THREE.CylinderGeometry(P.r * 0.52, P.r * 0.52, 0.025, 22).rotateZ(Math.PI / 2), calG = rb(0.05, 0.14, 0.09, 0.015);
  for (const wz of P.wheelZ) for (const sx of [-1, 1]) {
    const flat = wreck && !burnt && Math.random() < 0.5, wy = P.r * (flat ? 0.82 : 1), wx = sx * (hw - 0.14);
    if (!burnt) piece(wl, K.tire, tg, wx, wy, wz, 0, 0, 0, 1, flat ? 0.82 : 1, 1);
    piece(wl, burnt ? K.rust : K.rim, rg, wx, wy, wz, 0, sx < 0 ? Math.PI : 0, 0);
    piece(wl, burnt ? K.rust : K.disc, discG, wx - sx * 0.03, wy, wz);
    piece(wl, burnt ? K.rust : K.trim, calG, wx - sx * 0.055, wy + P.r * 0.32, wz - sx * 0 - 0.08, 0.5);
  }

  // ---- greenhouse rust on a burnt car
  if (burnt) {
    const sl = P.side, hi = sl.length - 3;   // a patch on the hood, two on the roof
    const hz = (sl[hi][0] + sl[hi + 1][0]) / 2, hy = lerpY(sl[hi], sl[hi + 1], hz) + 0.045, slope = Math.atan2(sl[hi + 1][1] - sl[hi][1], sl[hi + 1][0] - sl[hi][0]);
    piece(list, K.rust, rb(0.6, 0.008, 0.45, 0.003), (Math.random() - 0.5) * 0.4, hy - 0.008, hz, -slope, Math.random() - 0.5, 0);
    const rs = Math.atan2(Gp[2][1] - Gp[1][1], Gp[2][0] - Gp[1][0]);
    for (let k = 0; k < 2; k++) { const rz = Gp[1][0] + (Gp[2][0] - Gp[1][0]) * (0.25 + k * 0.45); piece(list, K.rust, rb(0.35 + Math.random() * 0.3, 0.008, 0.3 + Math.random() * 0.3, 0.003), (Math.random() - 0.5) * 0.6, lerpY(Gp[1], Gp[2], rz) + 0.064, rz, -rs, Math.random() - 0.5, 0); }
  }

  // police: white doors, a light bar base; ambulance: red stripe, roof panel and the blue Star of Life
  if (opts.police) {
    for (const sx of [-1, 1]) piece(list, opts.white, rb(0.02, 0.5, 2.0, 0.01), sx * (hw + 0.008), base + 0.38, 0.1);
    piece(list, K.trim, rb(1.3, 0.1, 0.32, 0.04), 0, 1.5, -0.1);
  }
  if (opts.ambulance) {
    for (const sx of [-1, 1]) {
      piece(list, opts.red, new THREE.BoxGeometry(0.012, 0.22, P.L * 0.9), sx * (hw + 0.01), 1.3, -0.1);
      piece(list, K.star, new THREE.PlaneGeometry(0.6, 0.6).rotateY(sx * Math.PI / 2), sx * (hw + 0.016), 1.78, -2.15);
    }
    piece(list, opts.red, new THREE.BoxGeometry(W * 0.9, 0.012, 0.6), 0, 2.5, -0.8);
    piece(list, K.white, rb(0.62, 0.08, 0.95, 0.03), -0.25, 0.98, -2.2);                         // the stretcher in the back
    for (const lx of [-0.5, 0]) for (const lz of [-2.6, -1.8]) piece(list, K.chrome, new THREE.CylinderGeometry(0.015, 0.015, 0.3, 6), lx, 0.8, lz);
    piece(list, K.white, rb(0.36, 1.2, 0.9, 0.03), 0.6, 1.3, -2.2);                              // and a supply cabinet
  }

  // ---- load floors: trunk carpet, the pickup's ribbed bed between its wheel tubs, the van's cargo floor
  if (type === 'sedan') piece(list, K.under, new THREE.BoxGeometry(W - 0.62, 0.01, 0.96), 0, P.load.y - 0.005, P.load.z);
  else if (type === 'pickup') {
    const b0 = P.bed[0], bl = -0.62 - b0, bm = (b0 - 0.62) / 2;
    piece(list, K.under, new THREE.BoxGeometry(W - 0.62, 0.02, bl - 0.05), 0, P.load.y - 0.01, bm);
    for (let k = -3; k <= 3; k++) piece(list, trimM, new THREE.BoxGeometry(0.035, 0.012, bl - 0.1), k * 0.17, P.load.y + 0.004, bm);
    for (const sx of [-1, 1]) piece(list, chromeM, rb(0.04, 0.02, bl, 0.008), sx * (hw - 0.05), 1.125, bm);   // bed rail caps
  } else if (type === 'van') piece(list, K.under, new THREE.BoxGeometry(W - 0.22, 0.012, 0.98), 0, P.load.y - 0.006, -2.22);

  // ---- build the meshes (the wreck's crumple goes through every body part — never the wheels)
  const root = new THREE.Group(), g = burnt ? new THREE.Group() : root;
  if (burnt) { g.position.y = -P.r * 0.35; root.add(g); }   // sitting on its rims
  const shadowM = [paintM, K.under];
  for (const [mat, geos] of list) {
    const mg = mergeGeometries(geos); if (wreck) crumple(mg, P);
    const m = new THREE.Mesh(mg, mat); m.castShadow = shadowM.includes(mat); m.receiveShadow = !mat.transparent; g.add(m);
  }
  const n0 = g.children.length; meshes(wl, g, [K.tire, K.rim, K.rust]); const wheelMeshes = g.children.slice(n0);
  let steerWheel = null;
  if (swAt) { steerWheel = new THREE.Group(); steerWheel.position.set(...swAt); steerWheel.rotation.set(0.5, 0, 0); meshes(swl, steerWheel, []); g.add(steerWheel); }

  // ---- the opening: trunk lid (sedan), rear hatch with its glass (suv), tailgate (pickup), two rear doors (van)
  const parts = [];
  const hinge = (px, py, pz, build) => { const piv = new THREE.Group(); piv.position.set(px, py, pz); g.add(piv); const L = new Map(); build(L, (geo) => geo.translate(-px, -py, -pz)); meshes(L, piv, [paintM]); return piv; };
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };
  if (type === 'sedan') {
    const piv = hinge(0, 1.03, -1.22, (L, T) => {
      piece(L, paintM, T(slabX(shapeOf([[-2.355, 0.8], [-2.19, 0.995], [-1.22, 1.035], [-1.22, 1.0], [-2.2, 0.955], [-2.31, 0.8]]), -(hw - 0.105), hw - 0.105, 0.015)));
      piece(L, chromeM, T(rb(0.2, 0.03, 0.03, 0.01).clone().translate(0, 0.86, -2.36)));   // lock and handle strip
    });
    parts.push({ o: piv, kind: 'hinge', axis: 'x', a: 1.15 });
  } else if (type === 'suv') {
    const hy = Gp[1][1] + 0.07, hz = Gp[1][0] - 0.06;
    const piv = hinge(0, hy, hz, (L, T) => {
      piece(L, paintM, T(rb(W - 0.24, 0.7, 0.05, 0.02).clone().translate(0, 0.86, -2.44)));                                  // lower panel
      for (const sx of [-1, 1]) bar(L, paintM, new THREE.Vector3(sx * (hw - 0.17), 1.18, -2.44).sub(new THREE.Vector3(0, hy, hz)), new THREE.Vector3(sx * (hw - 0.17), hy - 0.02, -2.35).sub(new THREE.Vector3(0, hy, hz)), 0.1, 0.05);
      piece(L, paintM, T(rb(W - 0.24, 0.07, 0.06, 0.02).clone().translate(0, hy - 0.03, -2.35)));                           // top band
      if (glassM) piece(L, glassM, T(quad(new THREE.Vector3(hw - 0.2, 1.21, -2.43), new THREE.Vector3(-(hw - 0.2), 1.21, -2.43), new THREE.Vector3(-(hw - 0.2), hy - 0.05, -2.36), new THREE.Vector3(hw - 0.2, hy - 0.05, -2.36))));
      piece(L, trimM, T(rb(0.45, 0.014, 0.022, 0.006).clone().translate(0.05, 1.25, -2.45)));                                 // rear wiper
      piece(L, chromeM, T(rb(0.2, 0.03, 0.03, 0.01).clone().translate(0, 1.07, -2.475)));                                     // handle
      piece(L, plateM, T(new THREE.BoxGeometry(0.42, 0.13, 0.01).rotateY(Math.PI).translate(0, 0.9, -2.47)));
    });
    parts.push({ o: piv, kind: 'hinge', axis: 'x', a: 1.3 });
  } else if (type === 'pickup') {
    const [b0] = P.bed, gy = 0.7, gz = b0 - 0.05;
    const piv = hinge(0, gy, gz, (L, T) => {
      piece(L, paintM, T(rb(W - 0.22, 0.41, 0.06, 0.02).clone().translate(0, gy + 0.205, gz)));
      piece(L, chromeM, T(rb(0.24, 0.05, 0.02, 0.01).clone().translate(0, gy + 0.3, gz - 0.035)));
    });
    parts.push({ o: piv, kind: 'hinge', axis: 'x', a: -Math.PI / 2 });
  } else if (type === 'van') {
    const zb = P.pts[1][0] - 0.065, y0 = 0.62, y1 = 2.38;
    for (const sx of [-1, 1]) {
      const w = hw - 0.11, px = sx * (hw - 0.1);
      const piv = hinge(px, y0, zb, (L, T) => {
        piece(L, paintM, T(rb(w, y1 - y0, 0.04, 0.02).clone().translate(px - sx * w / 2, (y0 + y1) / 2, zb)));
        if (glassM) piece(L, glassM, T(new THREE.PlaneGeometry(w * 0.7, 0.45).rotateY(Math.PI).translate(px - sx * w / 2, y0 + (y1 - y0) * 0.72, zb - 0.022)));
        piece(L, chromeM, T(rb(0.03, 0.18, 0.03, 0.01).clone().translate(px - sx * (w - 0.08), y0 + 0.75, zb - 0.03)));
        if (opts.ambulance) piece(L, K.star, T(new THREE.PlaneGeometry(0.34, 0.34).rotateY(Math.PI).translate(px - sx * w / 2, y0 + 0.55, zb - 0.022)));
      });
      parts.push({ o: piv, kind: 'hinge', a: -sx * 1.75 });
    }
  }
  // what's in the back (each piece can be moved, knocked over or taken by whoever searches it)
  const cargo = [];
  if (!burnt && !opts.noSearch) {
    const CM = [new THREE.MeshStandardMaterial({ color: 0x8a6a40, roughness: 0.9 }), new THREE.MeshStandardMaterial({ color: 0x3a4a6a, roughness: 0.85 }), new THREE.MeshStandardMaterial({ color: 0x2a6a3a, roughness: 0.3, transparent: true, opacity: 0.85 }), new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 0.35, metalness: 0.8 })];
    const y = P.load.y, zc = P.load.z;
    const put = (geo, m, x, z, kind, ry = Math.random() * 6) => { const o = add(geo, m, x, y, zc + z); o.rotation.y = ry; cargo.push({ mesh: o, kind }); };
    put(new THREE.BoxGeometry(0.34, 0.24, 0.3).translate(0, 0.12, 0), CM[0], -0.42, 0.05, 'box', 0.2);                        // a cardboard box
    put(new THREE.BoxGeometry(0.4, 0.12, 0.3).translate(0, 0.06, 0), CM[1], 0.28, -0.1, 'cloth');                             // a folded blanket
    put(new THREE.CylinderGeometry(0.04, 0.045, 0.3, 12).translate(0, 0.15, 0), CM[2], 0.05, 0.2, 'bottle');                  // a water bottle
    put(new THREE.CylinderGeometry(0.06, 0.06, 0.16, 14).translate(0, 0.08, 0), CM[3], -0.05, -0.22, 'can');                  // a tin of oil
  }
  // the front doors' outline, for makeDrivable to build doors that swing open on their hinges
  const door = burnt ? null : { zf: Math.min(seams[0], P.wheelZ[0] - ar - 0.01), zr: seams[1], y0: seamY0, y1: seamY1, paint: paintM, glass: glassM, yB, xb, trim: trimM, chrome: chromeM };
  root.userData = { L: P.L, W: P.W, H: P.H, parts, cargo, lamps: burnt ? [] : [amb, head], wheelMeshes, steerWheel, type, door };
  return root;
}
export const CAR_SIZE = Object.fromEntries(Object.entries(PROFILES).map(([k, P]) => [k, { L: P.L, W: P.W, H: P.H }]));
// the shape numbers of a body type (wheel radius, wheel positions, the cabin: floor, seats, dash) for drive.js
export const carSpec = type => PROFILES[type] || PROFILES.sedan;

// ---------------------------------------------------------------- a parked car made drivable (done the first time someone gets in)
// The body goes into its own group so it can roll and pitch on its springs; the merged wheels are swapped for four
// live ones (hub → steers, spin → rolls) with the brake caliper fixed to the hub; tail and reversing lamps get their
// own materials so this car's brake lights can come on.
const WHEEL_GEO = {};
export function makeDrivable(root, type) {
  const U = root.userData; if (U.live) return U.live;
  const K = mats(), P = carSpec(type), hw = P.W / 2;
  const body = new THREE.Group(); body.name = 'body';
  for (const o of [...root.children]) if (!U.wheelMeshes.includes(o)) body.add(o);
  root.add(body);
  for (const m of U.wheelMeshes) root.remove(m);
  const G = WHEEL_GEO[type] ||= { tg: tireGeo(P.r, 0.24), rg: rimGeo(P.r, 0.24), dg: new THREE.CylinderGeometry(P.r * 0.52, P.r * 0.52, 0.025, 22).rotateZ(Math.PI / 2), cg: rb(0.05, 0.14, 0.09, 0.015) };
  const wheels = [];
  for (const wz of P.wheelZ) for (const sx of [-1, 1]) {
    const hub = new THREE.Group(); hub.position.set(sx * (hw - 0.14), P.r, wz); root.add(hub);
    const spin = new THREE.Group(); hub.add(spin);
    const t = new THREE.Mesh(G.tg, K.tire); t.castShadow = true; spin.add(t);
    const rm = new THREE.Mesh(G.rg, K.rim); rm.rotation.y = sx < 0 ? Math.PI : 0; rm.castShadow = true; spin.add(rm);
    const d = new THREE.Mesh(G.dg, K.disc); d.position.x = -sx * 0.03; spin.add(d);
    const c = new THREE.Mesh(G.cg, K.trim); c.position.set(-sx * 0.055, P.r * 0.32, -0.08); c.rotation.x = 0.5; hub.add(c);
    for (const o of [t, rm, d, c]) o.receiveShadow = true;
    wheels.push({ hub, spin, front: wz > 0, sx });
  }
  const tail = K.tail.clone(), rev = K.reverse.clone(); rev.emissive = new THREE.Color(0xfff4e0); rev.emissiveIntensity = 0;
  body.traverse(o => { if (!o.isMesh) return; if (o.material === K.tail) o.material = tail; else if (o.material === K.reverse) o.material = rev; });
  // the amber lamps split left and right, so each side's indicator can blink on its own (both: the hazards)
  const ind = splitAmber(body, U.lamps[0]);
  if (ind) U.lamps = [ind[0], ind[1], U.lamps[1]];   // (an alarm flashes both, as before)
  return (U.live = { body, wheels, r: P.r, tail, rev, head: U.lamps[U.lamps.length - 1], ind, steerWheel: U.steerWheel, doors: U.door ? [frontDoor(body, P, U.door, 1), frontDoor(body, P, U.door, -1)] : [] });
}
function splitAmber(body, amb) {
  if (!amb) return null;
  let mesh = null; body.traverse(o => { if (o.isMesh && o.material === amb) mesh = o; });
  if (!mesh) return null;
  const g = mesh.geometry, pos = g.attributes.position, idx = g.index ? g.index.array : null, n = idx ? idx.length : pos.count;
  const L = [], R = [];
  for (let i = 0; i < n; i += 3) {
    const a = idx ? idx[i] : i, b = idx ? idx[i + 1] : i + 1, c = idx ? idx[i + 2] : i + 2;
    ((pos.getX(a) + pos.getX(b) + pos.getX(c)) > 0 ? L : R).push(a, b, c);
  }
  const mk = (list, m) => { const gg = new THREE.BufferGeometry(); for (const k in g.attributes) gg.setAttribute(k, g.attributes[k]); gg.setIndex(list); const o = new THREE.Mesh(gg, m); o.position.copy(mesh.position); o.quaternion.copy(mesh.quaternion); o.scale.copy(mesh.scale); o.castShadow = mesh.castShadow; mesh.parent.add(o); return o; };
  const mL = amb, mR = amb.clone();
  mk(L, mL); mk(R, mR); mesh.parent.remove(mesh);
  return [mL, mR];   // [left (+x), right]
}
// a smashed or crashed car's glass: the crazed safety-glass look (put back for a new run)
export function crackGlass(root, on = true) {
  const K = mats();
  root.traverse(o => {
    if (!o.isMesh) return;
    if (on && o.material === K.glass) { o.userData.glass0 = o.material; o.material = K.broken; }
    else if (!on && o.userData.glass0) { o.material = o.userData.glass0; delete o.userData.glass0; }
  });
}
// a front door that can swing open: a Group pivoted at its A-pillar hinge (rotation.y = open angle, +sx side) with the
// panel, its window, inner trim and handle; and the dark door opening it leaves in the body. Both hidden while shut
// (the body's own skin is the closed door), so a shut door looks exactly as before.
function frontDoor(body, P, D, sx) {
  const K = mats(), hw = P.W / 2, len = D.zf - D.zr, X = y => D.xb - (y - D.yB) * P.tumble;
  const hinge = new THREE.Group(); hinge.position.set(sx * hw, 0, D.zf); body.add(hinge);
  const door = new THREE.Group(); hinge.add(door);
  const h = D.y1 - D.y0 + 0.02, yc = (D.y0 + D.y1) / 2;
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; door.add(o); return o; };
  add(rb(0.05, h, len - 0.01, 0.015), D.paint, -sx * 0.02, yc, -len / 2);                                // the panel
  add(new THREE.BoxGeometry(0.02, h - 0.06, len - 0.08), K.seat, -sx * 0.055, yc, -len / 2);             // inner trim
  add(new THREE.BoxGeometry(0.03, 0.04, 0.32), K.trim, -sx * 0.07, yc + 0.08, -len / 2 + 0.05);          // armrest
  add(rb(0.02, 0.03, 0.14, 0.01), D.chrome, sx * 0.012, D.y1 - 0.12, -len + 0.25);                        // handle
  // window frame and glass, following the side window between the two seams
  const poly = clipZ(P.glass, D.zr + 0.02, D.zf - 0.02);
  if (poly.length >= 3) {
    if (D.glass) {
      const g = new THREE.ShapeGeometry(shapeOf(poly)), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const z = p.getX(i), y = p.getY(i); p.setXYZ(i, sx * X(y) - sx * hw, y, z - D.zf); }
      g.computeVertexNormals(); const m = new THREE.Mesh(g, D.glass); door.add(m);
    }
    for (let i = 0; i < poly.length; i++) {   // the frame round it
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const A = new THREE.Vector3(sx * X(a[1]) - sx * hw, a[1], a[0] - D.zf), Bv = new THREE.Vector3(sx * X(b[1]) - sx * hw, b[1], b[0] - D.zf);
      const L = A.distanceTo(Bv); if (L < 0.02) continue;
      const o = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, L), D.trim); o.position.copy(A).add(Bv).multiplyScalar(0.5); o.lookAt(o.position.clone().add(Bv.clone().sub(A))); door.add(o);
    }
  }
  // the opening: dark sill, floor and the inside of the B-pillar seen through it
  const hole = new THREE.Mesh(new THREE.PlaneGeometry(len - 0.04, h - 0.03).rotateY(sx * Math.PI / 2), K.under);
  hole.position.set(sx * (hw + 0.004), yc, D.zf - len / 2); body.add(hole);
  hinge.visible = false; hole.visible = false;
  return { hinge, hole, open: 0, sx };
}
// open a door 0..1 (about 65 degrees at 1)
export function setDoor(D, k) {
  if (!D) return;
  D.open = k; D.hinge.rotation.y = -D.sx * 1.13 * k;
  D.hinge.visible = D.hole.visible = k > 0.002;
}

// ---------------------------------------------------------------- bicycles
// A 26" town bike, front is +z, left is +x, standing on y = 0: a diamond frame of round tubes (top, down and seat
// tubes, chain and seat stays), a fork that steers round a raked head tube, two wheels with tyres, rims, hubs and 32
// spokes each, a chainring and cog joined by the chain, cranks with pedals that stay level, a saddle on its post,
// swept-back bars with grips, brake levers and a bell, mudguards and a kickstand.
// userData: { rear (spin), front (spin), steer (turns about the head tube), crank (turns), pedals [L, R],
//             grips [L, R] and saddle (Object3Ds to put hands and seat on), stand (the kickstand), r, base }
const BK = {};
function bikeMats() {
  if (BK.black) return BK;
  BK.black = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.85 });
  BK.chrome = new THREE.MeshStandardMaterial({ color: 0xbfc3c8, roughness: 0.22, metalness: 1 });
  BK.chain = new THREE.MeshStandardMaterial({ color: 0x3c3d40, roughness: 0.5, metalness: 0.8 });
  BK.saddle = new THREE.MeshStandardMaterial({ color: 0x2a211c, roughness: 0.6 });
  return BK;
}
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
function tube(list, mat, a, b, r, seg = 8) {   // a round tube from a to b
  const dir = b.clone().sub(a), len = dir.length(); if (len < 1e-4) return;
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, false);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), dir.normalize())); g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  piece(list, mat, g);
}
const BIKE_WHEEL = {};
function bikeWheel(r) {   // tyre, rim, hub and 32 spokes on the axle (x axis), as [geometry, material] pairs
  if (BIKE_WHEEL[r]) return BIKE_WHEEL[r];
  const B = bikeMats(), L = new Map();
  piece(L, B.black, new THREE.TorusGeometry(r - 0.024, 0.024, 8, 40).rotateY(Math.PI / 2));
  piece(L, B.chrome, new THREE.TorusGeometry(r - 0.05, 0.011, 5, 40).rotateY(Math.PI / 2));
  piece(L, B.chrome, new THREE.CylinderGeometry(0.02, 0.02, 0.11, 10).rotateZ(Math.PI / 2));                       // hub
  for (const sx of [-1, 1]) piece(L, B.chrome, new THREE.CylinderGeometry(0.03, 0.03, 0.006, 12).rotateZ(Math.PI / 2), sx * 0.035, 0, 0);   // flanges
  for (let k = 0; k < 32; k++) {   // spokes: alternate flanges, laced a little tangent like a real wheel
    const a = k / 32 * Math.PI * 2, sx = k % 2 ? 1 : -1, ah = a + (k % 4 < 2 ? 0.35 : -0.35);
    tube(L, B.chrome, V3(sx * 0.035, Math.sin(ah) * 0.027, Math.cos(ah) * 0.027), V3(sx * 0.004, Math.sin(a) * (r - 0.058), Math.cos(a) * (r - 0.058)), 0.0016, 3);
  }
  piece(L, B.chain, rb(0.012, 0.04, 0.012, 0.004), 0, r - 0.075, 0);                                                // the valve
  return (BIKE_WHEEL[r] = [...L].map(([m, gs]) => [mergeGeometries(gs), m]));
}
// a bike's paint job (not one flat colour): metallic flake in the paint, cream pinstripes and lugs where the tubes meet
// (each tube's UV runs 0..1 along it, so the bands land at its ends), the maker's name down the middle, a little wear
const BIKE_NAMES = ['ROADSTER', 'HOLLOW CYCLES', 'SCHWINN-ISH', 'TOURER', 'CRUISER 3', 'COMET', 'RAMBLER', 'LIBERTY'];
export function bikePaint(hex, i = 0) {
  const col = new THREE.Color(hex), css = '#' + col.getHexString(), lite = '#' + col.clone().offsetHSL(0, -0.1, 0.18).getHexString(), dark = '#' + col.clone().offsetHSL(0, 0, -0.16).getHexString();
  const map = canvasTex(64, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, dark); gr.addColorStop(0.35, lite); gr.addColorStop(0.55, css); gr.addColorStop(1, dark);   // the light across the round tube
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 1400; k++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.12})`; g.fillRect(Math.random() * w, Math.random() * h, 1, 1); }   // flake
    for (const y of [0, h - 26]) { g.fillStyle = '#d8d2c0'; g.fillRect(0, y, w, 26); g.fillStyle = '#9a958a'; g.fillRect(0, y + (y ? 0 : 22), w, 4); }   // lugs at the ends
    g.fillStyle = '#f2ecd8'; for (const y of [40, 46, h - 50, h - 44]) g.fillRect(0, y, w, 2);   // pinstripes
    g.save(); g.translate(w / 2, h / 2); g.rotate(Math.PI / 2); g.font = 'bold 30px Helvetica'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillText(BIKE_NAMES[i % BIKE_NAMES.length], 1.5, 1.5); g.fillStyle = '#f4efe2'; g.fillText(BIKE_NAMES[i % BIKE_NAMES.length], 0, 0); g.restore();
    for (let k = 0; k < 30; k++) { g.fillStyle = `rgba(40,36,30,${0.15 + Math.random() * 0.25})`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 2); }   // chips
  });
  map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
  return new THREE.MeshStandardMaterial({ map, roughness: 0.32, metalness: 0.45 });
}
export function buildBike(paint) {
  const B = bikeMats(), r = 0.335;
  const root = new THREE.Group(), list = new Map(), fl = new Map();
  const RA = V3(0, r, -0.53), BB = V3(0, 0.29, -0.06), ST = V3(0, 0.8, -0.22), H0 = V3(0, 0.67, 0.42), H1 = V3(0, 0.85, 0.36);
  const axis = H1.clone().sub(H0).normalize(), FA = H0.clone().addScaledVector(axis, -(H0.y - r) / axis.y).add(V3(0, 0, 0.04));   // fork rake: the axle a little ahead of the steering line
  // ---- the frame
  tube(list, paint, ST, H1.clone().lerp(H0, 0.12), 0.017);                       // top tube
  tube(list, paint, BB, H0.clone().lerp(H1, 0.12), 0.02);                        // down tube
  tube(list, paint, BB, ST.clone().add(V3(0, 0.03, -0.01)), 0.018);              // seat tube
  tube(list, paint, H0.clone().addScaledVector(axis, -0.02), H1.clone().addScaledVector(axis, 0.03), 0.021);   // head tube
  for (const sx of [-1, 1]) {
    tube(list, paint, BB.clone().add(V3(sx * 0.02, 0, 0)), RA.clone().add(V3(sx * 0.065, 0, 0)), 0.01);       // chain stays
    tube(list, paint, ST.clone().add(V3(sx * 0.018, -0.03, -0.01)), RA.clone().add(V3(sx * 0.065, 0.01, 0)), 0.009);   // seat stays
    piece(list, B.chrome, rb(0.012, 0.03, 0.03, 0.005), sx * 0.068, r, RA.z);                                  // dropouts
  }
  piece(list, B.chrome, new THREE.CylinderGeometry(0.024, 0.024, 0.075, 12).rotateZ(Math.PI / 2), 0, BB.y, BB.z);   // bottom bracket shell
  // saddle on its post
  const SP = ST.clone().add(V3(0, 0.13, -0.045));
  tube(list, B.chrome, ST, SP, 0.0135);
  piece(list, B.saddle, rb(0.17, 0.055, 0.15, 0.025), 0, SP.y + 0.03, SP.z - 0.05);
  piece(list, B.saddle, rb(0.07, 0.045, 0.16, 0.02), 0, SP.y + 0.027, SP.z + 0.07, -0.05);
  for (const sx of [-1, 1]) tube(list, B.chrome, V3(sx * 0.04, SP.y + 0.005, SP.z - 0.1), V3(sx * 0.03, SP.y - 0.06, SP.z - 0.17), 0.004, 4);   // saddle springs
  // drivetrain: chainring with its spider, cog, the chain (top and bottom runs), mudguard over the back wheel
  const dx = -0.075;
  piece(list, B.chain, new THREE.TorusGeometry(0.095, 0.006, 4, 42).rotateY(Math.PI / 2), dx, BB.y, BB.z);
  for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; tube(list, B.chrome, V3(dx, BB.y, BB.z), V3(dx, BB.y + Math.sin(a) * 0.09, BB.z + Math.cos(a) * 0.09), 0.006, 4); }
  piece(list, B.chain, new THREE.TorusGeometry(0.038, 0.006, 4, 20).rotateY(Math.PI / 2), dx, RA.y, RA.z);
  for (const s of [1, -1]) tube(list, B.chain, V3(dx, BB.y + s * 0.098, BB.z), V3(dx, RA.y + s * 0.041, RA.z), 0.005, 4);
  piece(list, paint, new THREE.TorusGeometry(r + 0.03, 0.014, 4, 18, Math.PI * 0.62).rotateY(Math.PI / 2).rotateX(-0.25), 0, r, RA.z);
  // kickstand (folded up while riding)
  const stand = new THREE.Group(); stand.position.set(0.04, BB.y - 0.02, BB.z - 0.12); root.add(stand);
  { const L = new Map(); tube(L, B.chain, V3(0, 0, 0), V3(0.13, -0.26, -0.05), 0.008, 5); piece(L, B.black, rb(0.04, 0.01, 0.03, 0.004), 0.13, -0.265, -0.05); meshes(L, stand, []); }
  // ---- the steering: everything that turns, built in bike space then moved into the head tube's frame
  const headQ = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), axis);
  const head = new THREE.Group(); head.position.copy(H0); head.quaternion.copy(headQ); root.add(head);
  const steer = new THREE.Group(); head.add(steer);
  const toHead = new THREE.Matrix4().compose(H0, headQ, V3(1, 1, 1)).invert();
  const crown = H0.clone().addScaledVector(axis, -0.06);
  for (const sx of [-1, 1]) tube(fl, B.chrome, crown.clone().add(V3(sx * 0.045, 0, 0)), FA.clone().add(V3(sx * 0.05, 0, 0)), 0.012, 6);   // fork legs
  piece(fl, B.chrome, rb(0.12, 0.03, 0.05, 0.01), crown.x, crown.y, crown.z);
  const stemTop = H1.clone().addScaledVector(axis, 0.12), barC = stemTop.clone().add(V3(0, 0.03, -0.02));
  tube(fl, B.chrome, H1, stemTop, 0.013);
  tube(fl, B.chrome, stemTop, barC, 0.012);
  const grips = [];
  for (const sx of [-1, 1]) {   // swept back bars, grips, a brake lever each side
    const mid = barC.clone().add(V3(sx * 0.16, 0.01, 0)), end = barC.clone().add(V3(sx * 0.3, 0.0, -0.09));
    tube(fl, B.chrome, barC, mid, 0.011); tube(fl, B.chrome, mid, end, 0.011);
    const gA = mid.clone().lerp(end, 0.35), gc = gA.clone().lerp(end, 0.5);
    tube(fl, B.black, gA, end.clone().add(end.clone().sub(mid).normalize().multiplyScalar(0.01)), 0.017, 8);
    tube(fl, B.chain, mid.clone().add(V3(0, 0.005, 0.01)), gc.clone().add(V3(0, -0.015, 0.06)), 0.005, 4);   // lever
    grips.push(gc);
  }
  piece(fl, B.chrome, new THREE.SphereGeometry(0.022, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), barC.x + 0.1, barC.y + 0.012, barC.z);   // the bell
  piece(fl, paint, new THREE.TorusGeometry(r + 0.03, 0.014, 4, 14, Math.PI * 0.5).rotateY(Math.PI / 2).rotateX(Math.PI / 3), FA.x, FA.y, FA.z);   // front mudguard
  for (const [, gs] of fl) for (const gg of gs) gg.applyMatrix4(toHead);
  meshes(fl, steer, [B.chrome]);
  const gripObj = grips.map(p => { const o = new THREE.Object3D(); o.position.copy(p).applyMatrix4(toHead); steer.add(o); return o; });
  // ---- wheels
  const wheel = (parent, at) => { const sp = new THREE.Group(); sp.position.copy(at); parent.add(sp); for (const [geo, m] of bikeWheel(r)) { const o = new THREE.Mesh(geo, m); o.castShadow = m === B.black; o.receiveShadow = true; sp.add(o); } return sp; };
  const rear = wheel(root, RA), front = wheel(steer, FA.clone().applyMatrix4(toHead));
  // ---- cranks and pedals (the pedals counter-turn so they stay level)
  const crank = new THREE.Group(); crank.position.copy(BB); root.add(crank);
  const pedals = [];
  { const L = new Map(); for (const sx of [-1, 1]) { const y = sx > 0 ? 0.17 : -0.17; piece(L, B.chrome, rb(0.016, 0.19, 0.03, 0.007), sx * 0.09, y / 2, 0); piece(L, B.chrome, new THREE.CylinderGeometry(0.008, 0.008, 0.06, 6).rotateZ(Math.PI / 2), sx * 0.115, y, 0); } meshes(L, crank, [B.chrome]); }
  for (const sx of [1, -1]) {   // [left, right]
    const pd = new THREE.Group(); pd.position.set(sx * 0.155, sx > 0 ? 0.17 : -0.17, 0); crank.add(pd);
    const L = new Map(); piece(L, B.black, rb(0.09, 0.022, 0.065, 0.006)); piece(L, B.chrome, rb(0.1, 0.008, 0.075, 0.003), 0, 0.012, 0); meshes(L, pd, []);
    pedals.push(pd);
  }
  meshes(list, root, [paint, B.chrome]);
  const saddle = new THREE.Object3D(); saddle.position.set(0, SP.y + 0.06, SP.z - 0.06); root.add(saddle);
  root.userData = { rear, front, steer, crank, pedals, grips: [gripObj[1], gripObj[0]], saddle, stand, r, base: 1.09, kind: 'bike' };   // grips: [left (+x), right]
  return root;
}
// a parked bike is drawn as a few merged meshes (one per material) baked from its posed rig; the live rig (wheels,
// cranks, steering — 20-odd meshes) only shows while someone's riding it
export function bikeParked(root, on) {
  const U = root.userData;
  if (U.baked) { root.remove(U.baked); for (const m of U.baked.children) m.geometry.dispose(); U.baked = null; }
  const live = root.children;
  if (!on) { for (const o of live) o.visible = true; return; }
  for (const o of live) o.visible = true;
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert(), by = new Map(), mm = new THREE.Matrix4();
  root.traverse(o => { if (!o.isMesh) return; const gg = o.geometry.clone().applyMatrix4(mm.multiplyMatrices(inv, o.matrixWorld)); (by.get(o.material) || by.set(o.material, []).get(o.material)).push(gg); });
  const baked = new THREE.Group(); baked.name = 'baked';
  for (const [m, gs] of by) { const mesh = new THREE.Mesh(mergeGeometries(gs), m); for (const gg of gs) gg.dispose(); mesh.castShadow = true; mesh.receiveShadow = true; baked.add(mesh); }
  for (const o of live) o.visible = false;
  root.add(baked); U.baked = baked;
}
