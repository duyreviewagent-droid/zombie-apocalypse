// Zombie_Apocalypse — hand-to-hand. Fists, a kitchen knife, a baseball bat, a crowbar, a machete and a fire axe.
// Each swing is a captured move played on the upper body (your legs keep walking under it); the weapon is held in
// the right hand (fingers wrapped round the handle) and lands at the moment the captured hand moves fastest.
// Swings cost stamina — tired swings are slow and weak. Weapons wear out and break. A shove pushes zombies off you.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { boneMap } from './rig.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import { weld } from './weapons.js';   // [realism]

export const MELEE = {
  fists: { id: 'fists', name: 'FISTS', dmg: 13, reach: 1.1, stam: 6, anims: ['Punch_Jab', 'Punch_Cross'], rate: 1.25, blunt: true, knock: 0.35, dur: Infinity, head: 1.8 },
  knife: { id: 'knife', name: 'KITCHEN KNIFE', dmg: 20, reach: 1.2, stam: 6, anims: ['Punch_Jab', 'Sword_Regular_C'], rate: 1.35, blade: true, knock: 0.1, dur: 70, head: 3.5 },
  bat: { id: 'bat', name: 'BASEBALL BAT', dmg: 32, reach: 1.7, stam: 15, anims: ['Sword_Regular_A', 'Sword_Regular_B'], rate: 1.05, blunt: true, knock: 0.65, dur: 90, head: 2.6, twoHand: true },
  crowbar: { id: 'crowbar', name: 'CROWBAR', dmg: 30, reach: 1.45, stam: 13, anims: ['Sword_Regular_B', 'Sword_Regular_C'], rate: 1.15, blunt: true, knock: 0.5, dur: 260, head: 2.8, twoHand: true },
  machete: { id: 'machete', name: 'MACHETE', dmg: 42, reach: 1.55, stam: 12, anims: ['Sword_Regular_A', 'Sword_Regular_C'], rate: 1.15, blade: true, knock: 0.3, dur: 110, head: 2.6 },
  axe: { id: 'axe', name: 'FIRE AXE', dmg: 70, reach: 1.65, stam: 24, anims: ['Sword_Attack'], rate: 0.95, blade: true, heavy: true, knock: 0.9, dur: 140, head: 2.2, twoHand: true },
};
export const MELEE_ORDER = ['knife', 'bat', 'crowbar', 'machete', 'axe'];

// ---------------------------------------------------------------- models (origin at the grip, +Y along the handle away from the pinky)
const M = {};
function mats() {
  if (M.wood) return M;
  const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#b08850'; g.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(90,60,30,${0.2 + Math.random() * 0.3})`; g.lineWidth = 0.5 + Math.random() * 1.5; g.beginPath(); const x = Math.random() * 64; g.moveTo(x, 0); g.bezierCurveTo(x + 4, 80, x - 4, 160, x + 2, 256); g.stroke(); }
  for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(80,10,6,${0.3 + Math.random() * 0.5})`; g.beginPath(); g.arc(Math.random() * 64, 10 + Math.random() * 90, 2 + Math.random() * 6, 0, 7); g.fill(); }   // old blood near the end
  const wt = new THREE.CanvasTexture(c); wt.colorSpace = THREE.SRGBColorSpace;
  M.wood = new THREE.MeshStandardMaterial({ map: wt, roughness: 0.55 });
  M.steel = new THREE.MeshStandardMaterial({ color: 0xa8aaae, roughness: 0.32, metalness: 0.95 });
  M.dark = new THREE.MeshStandardMaterial({ color: 0x262626, roughness: 0.55, metalness: 0.4 });
  M.red = new THREE.MeshStandardMaterial({ color: 0x9a1a14, roughness: 0.45, metalness: 0.5 });
  M.grip = new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.9 });
  M.blade = new THREE.MeshStandardMaterial({ color: 0xc8cacc, roughness: 0.22, metalness: 1 });
  M.bloody = new THREE.MeshStandardMaterial({ color: 0x8a8c8e, roughness: 0.3, metalness: 0.9 });
  M.rivet = new THREE.MeshStandardMaterial({ color: 0xb89a5a, roughness: 0.35, metalness: 1 });
  M.tape = new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.95 });
  // [realism] brushed, scuffed steel; chipped paint; a dark coated blade; the bright ground edge
  const cb = document.createElement('canvas'); cb.width = cb.height = 256; const gb = cb.getContext('2d');
  gb.fillStyle = '#dcdcdc'; gb.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 300; i++) { const x = Math.random() * 256; gb.strokeStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '80,80,80'},${0.05 + Math.random() * 0.09})`; gb.lineWidth = 0.5 + Math.random(); gb.beginPath(); gb.moveTo(x, Math.random() * 40); gb.lineTo(x + (Math.random() - 0.5) * 3, 256 - Math.random() * 40); gb.stroke(); }
  for (let i = 0; i < 30; i++) { gb.fillStyle = `rgba(${90 + Math.random() * 30},${50 + Math.random() * 20},30,${0.05 + Math.random() * 0.08})`; gb.beginPath(); gb.arc(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 8, 0, 7); gb.fill(); }   // rust and grime
  for (let i = 0; i < 14; i++) { gb.fillStyle = `rgba(90,8,4,${0.35 + Math.random() * 0.4})`; gb.beginPath(); gb.arc(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 4, 0, 7); gb.fill(); }   // dried blood
  const brushed = new THREE.CanvasTexture(cb); brushed.colorSpace = THREE.SRGBColorSpace; brushed.wrapS = brushed.wrapT = THREE.RepeatWrapping;
  const cp = document.createElement('canvas'); cp.width = cp.height = 256; const gp = cp.getContext('2d');
  gp.fillStyle = '#741610'; gp.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 70; i++) { gp.fillStyle = `rgba(${150 + Math.random() * 40},${150 + Math.random() * 30},${150 + Math.random() * 30},${0.5 + Math.random() * 0.4})`; gp.beginPath(); const x = Math.random() * 256, y = Math.random() * 256; gp.moveTo(x, y); for (let k = 0; k < 5; k++) gp.lineTo(x + (Math.random() - 0.5) * 12, y + (Math.random() - 0.5) * 12); gp.fill(); }   // chips through to bare steel
  for (let i = 0; i < 40; i++) { gp.fillStyle = `rgba(30,10,6,${0.1 + Math.random() * 0.2})`; gp.beginPath(); gp.arc(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 10, 0, 7); gp.fill(); }
  const paint = new THREE.CanvasTexture(cp); paint.colorSpace = THREE.SRGBColorSpace; paint.wrapS = paint.wrapT = THREE.RepeatWrapping;
  M.steel.map = brushed; M.blade.map = brushed; M.blade.roughness = 0.28; M.blade.color.setHex(0xd2d4d6);
  M.paint = new THREE.MeshStandardMaterial({ map: paint, roughness: 0.5, metalness: 0.35 });
  M.worn = new THREE.MeshStandardMaterial({ color: 0x8a8a88, map: brushed, roughness: 0.42, metalness: 0.9 });
  M.coated = new THREE.MeshStandardMaterial({ color: 0x2c2d2e, map: brushed, roughness: 0.6, metalness: 0.5 });
  M.edge = new THREE.MeshStandardMaterial({ color: 0xe8eaec, roughness: 0.16, metalness: 1 });
  return M;
}
// [realism] a flat part cut from its side profile (z towards the edge, y along the handle), `w` thick, edges rounded
function ext(add, pts, w, bev, m) {
  const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y))), { depth: Math.max(0.0004, w - bev * 2), bevelEnabled: true, bevelThickness: bev, bevelSize: bev * 0.8, bevelSegments: 1, curveSegments: 3 });
  geo.rotateY(-Math.PI / 2).translate(w / 2 - bev, 0, 0);
  // UVs: the profile in metres, stretched so the brushing runs along the blade
  const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 4, uv.getY(i) * 2);
  return add(geo, m, 0, 0, 0);
}
// a blade: the flat in one material and a thinner, brighter ground edge sticking out along `edge` (z towards the edge)
function blade(add, spine, edge, w, bodyM, edgeM, grind) {
  const inner = edge.map(([z, y]) => [z - grind, y]);
  ext(add, [...spine, ...inner], w, w * 0.3, bodyM);
  ext(add, [...edge.map(([z, y]) => [z, y]), ...inner.map(([z, y]) => [z - grind * 0.5, y]).reverse()].reverse(), w * 0.55, w * 0.2, edgeM);
}
function build(id) {
  const K = mats(), g = new THREE.Group();
  const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; g.add(o); return o; };
  let tip = 0.3;
  if (id === 'bat') {
    const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12; const r = t < 0.05 ? 0.024 : 0.016 + Math.pow(Math.max(0, t - 0.25) / 0.75, 1.6) * 0.022; pts.push(new THREE.Vector2(r, -0.12 + t * 0.84)); }
    pts.push(new THREE.Vector2(0.0, 0.72));
    add(new THREE.LatheGeometry(pts, 14), K.wood, 0, 0, 0);
    add(new THREE.CylinderGeometry(0.0175, 0.0175, 0.16, 10), K.grip, 0, -0.02, 0);
    for (let i = 0; i < 5; i++) add(new THREE.TorusGeometry(0.0178, 0.0016, 4, 12), K.tape, 0, -0.09 + i * 0.034, 0, Math.PI / 2 + 0.25, 0, 0);   // the tape's wound edges
    tip = 0.68;
  } else if (id === 'crowbar') {
    // [realism] a 24-inch hex-bar wrecking bar: chipped red paint, bare steel worn through at both working ends,
    // a split claw on the hook and a bent chisel at the foot
    add(new THREE.CylinderGeometry(0.0095, 0.0095, 0.6, 6), K.paint, 0, 0.22, 0);
    add(new THREE.TorusGeometry(0.05, 0.0095, 6, 14, Math.PI), K.paint, 0.05, 0.52, 0, 0, 0, 0);
    for (const z of [-0.0045, 0.0045]) add(new THREE.BoxGeometry(0.026, 0.06, 0.007), K.worn, 0.103, 0.497, z, 0, 0, 0.35).geometry.translate(0, -0.005, 0);   // claw tines
    add(new THREE.CylinderGeometry(0.0096, 0.0096, 0.05, 6), K.worn, 0, -0.06, 0);
    add(new THREE.BoxGeometry(0.019, 0.055, 0.007), K.worn, 0, -0.1, 0.008, 0.45, 0, 0);   // chisel
    tip = 0.55;
  } else if (id === 'machete') {
    // [realism] a 45 cm field machete: black-coated carbon steel with a bright ground edge, riveted black grip
    add(new RoundedBoxGeometry(0.03, 0.13, 0.026, 2, 0.009), K.grip, 0, 0.0, 0);
    add(new RoundedBoxGeometry(0.034, 0.012, 0.03, 2, 0.004), K.grip, 0, 0.068, 0);   // guard swell
    for (const y of [-0.035, 0.02]) for (const sx of [1, -1]) add(new THREE.CylinderGeometry(0.0045, 0.0045, 0.003, 8), K.rivet, sx * 0.0152, y, 0, 0, 0, Math.PI / 2);
    blade(add, [[-0.016, 0.06], [-0.017, 0.43], [-0.01, 0.5]], [[0.006, 0.515], [0.03, 0.47], [0.036, 0.38], [0.03, 0.2], [0.022, 0.06]], 0.0026, K.coated, K.blade, 0.008);
    tip = 0.52;
  } else if (id === 'axe') {
    // [realism] a fire axe: a hickory handle, a forged head painted red with the bit ground back to bright steel,
    // a pick on the back
    add(new THREE.CylinderGeometry(0.016, 0.02, 0.86, 10), K.wood, 0, 0.28, 0);
    add(new THREE.CylinderGeometry(0.0175, 0.0175, 0.12, 10), K.tape, 0, -0.06, 0);    // the grip end, taped
    ext(add, [[-0.17, 0.678], [-0.03, 0.715], [0.06, 0.71], [0.125, 0.742], [0.125, 0.592], [0.06, 0.612], [-0.03, 0.615], [-0.17, 0.67]], 0.016, 0.006, K.paint);
    ext(add, [[0.115, 0.736], [0.15, 0.765], [0.161, 0.7], [0.157, 0.63], [0.145, 0.565], [0.115, 0.597]], 0.006, 0.004, K.blade);
    tip = 0.72;
  } else if (id === 'knife') {
    // [realism] a 20 cm chef's knife: black riveted handle, a steel bolster, a satin blade with a curved belly
    add(new RoundedBoxGeometry(0.022, 0.11, 0.02, 2, 0.007), K.dark, 0, 0, 0);
    add(new RoundedBoxGeometry(0.008, 0.012, 0.03, 2, 0.003), K.steel, 0, 0.058, 0.004);   // bolster
    for (const y of [-0.03, 0.0, 0.03]) for (const sx of [1, -1]) add(new THREE.CylinderGeometry(0.0032, 0.0032, 0.003, 8), K.rivet, sx * 0.0113, y, 0, 0, 0, Math.PI / 2);
    blade(add, [[-0.008, 0.062], [-0.008, 0.2], [-0.004, 0.245], [0.0, 0.262]], [[0.004, 0.258], [0.014, 0.232], [0.023, 0.185], [0.027, 0.12], [0.027, 0.068]], 0.0018, K.blade, K.edge, 0.006);
    tip = 0.26;
  }
  weld(g);   // [realism] one mesh per material (a knife: 10 parts → 5 draw calls)
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.userData.tip = tip;
  return g;
}
// [realism] built once per kind and cloned (shared geometry and materials: no rebuilding for the pack's straps)
const BUILT = {};
export function makeMeleeMesh(id) { const src = BUILT[id] || (BUILT[id] = build(id)); const m = src.clone(true); m.userData = { ...src.userData }; return m; }

// ---------------------------------------------------------------- when does a swing land? (the captured hand's fastest moment)
export function analyseSwings(kind) {
  const root = skClone(kind.root), B = boneMap(root);
  const mixer = new THREE.AnimationMixer(root), out = {};
  const p = new THREE.Vector3(), q = new THREE.Vector3();
  for (const n of ['Punch_Jab', 'Punch_Cross', 'Sword_Regular_A', 'Sword_Regular_B', 'Sword_Regular_C', 'Sword_Attack', 'Push', 'Zombie_Scratch']) {
    const clip = kind.clips[n]; if (!clip) continue;
    const act = mixer.clipAction(clip); act.play();
    const N = 60, d = clip.duration; let best = -1, hit = d * 0.4;
    for (let i = 0; i <= N; i++) {
      mixer.setTime(Math.min(i / N * d, d - 1e-4)); root.updateMatrixWorld(true);
      B.RightHand.getWorldPosition(p);
      if (i > 0) { const v = p.distanceTo(q); if (v > best && i / N > 0.15 && i / N < 0.8) { best = v; hit = i / N * d; } }
      q.copy(p);
    }
    act.stop(); mixer.uncacheClip(clip);
    out[n] = { hit, dur: d, hitA: Math.max(0, hit - 0.08), hitB: Math.min(d, hit + 0.06) };   // the sweep window round the fastest frame
  }
  return out;
}

// ---------------------------------------------------------------- holding it
const tA = new THREE.Vector3(), tB = new THREE.Vector3(), tC = new THREE.Vector3(), tD = new THREE.Vector3(), mB = new THREE.Matrix4();
const clamp0 = (v, hi) => Math.max(0, Math.min(v, hi));
const qS = new THREE.Quaternion(), AX = new THREE.Vector3(1, 0, 0), UPV = new THREE.Vector3(0, 1, 0), ZV = new THREE.Vector3(0, 0, 1);
const dampK = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
// these captured swings wind up slowly for a long time: start them a beat before the blow, so every swing has the same rhythm
const LEAD = { Sword_Regular_C: 0.42, Sword_Attack: 0.5 };
export class Melee {
  constructor(sol, scene, swings) {
    this.sol = sol; this.scene = scene; this.swings = swings;
    this.meshes = {};
    for (const id of MELEE_ORDER) { const m = build(id); m.visible = false; scene.add(m); this.meshes[id] = m; }
    this.cur = 'fists'; this.swing = null; this.cool = 0; this.combo = 0;
    this.busy = { 1: false, '-1': false };   // a hand doing something else (picking up, eating, holding the pack)
    this.T = { p: new THREE.Vector3(), f: new THREE.Vector3(), s: new THREE.Vector3(), curl: 1 };
    // the left hand on the handle of a two-hander; the right hand resting a long weapon on the shoulder between fights
    this.TL = { p: new THREE.Vector3(), f: new THREE.Vector3(), s: new THREE.Vector3(), curl: 1, blend: true };
    this.TR = { p: new THREE.Vector3(), f: new THREE.Vector3(), s: new THREE.Vector3(), curl: 0, blend: true };
    this.idleT = 0; this.restW = 0; this.twoW = 0;
  }
  get W() { return MELEE[this.cur]; }
  set(id) { this.cur = id; this.swing = null; this.show(true); }
  show(on) { for (const id in this.meshes) this.meshes[id].visible = on && id === this.cur && this.sol.visible; }
  // start a swing; returns false when you can't (already swinging, out of breath)
  attack(stamina, opt = {}) {
    // a click in the last moments of a swing is kept and chains as soon as it ends (smooth combos, no dropped clicks)
    // (any click once the blow has landed counts — not only one in the last split second)
    if (this.swing && !this.swing.push && !opt.push && this.swing.t >= this.swing.hitAt) { this.queued = { stamina, opt }; return false; }
    if (this.swing || this.cool > 0 || this.sol.dead) return false;
    const W = this.W;
    const name = opt.anim || W.anims[this.combo++ % W.anims.length];
    const tired = stamina < W.stam;
    const rate = W.rate * (tired ? 0.65 : 1) * (opt.rate || 1);
    const info = this.swings[name] || { hit: 0.4, dur: 1 };
    // the captured shove stands idle for over a second before the arms go out: start it just before they do
    // (the same for any caller that asks to skip a lead-in with opt.from, in clip seconds)
    const from = clamp0(opt.from != null ? opt.from : name === 'Push' ? info.hit - 0.3 : LEAD[name] ? info.hit - LEAD[name] : 0, info.hit - 0.05);
    // the follow-through is the same clip time for the fade and for the end of the swing (they used to disagree
    // whenever rate wasn't 1, so a new swing could restart the clip mid-motion)
    const follow = Math.min(info.dur, info.hit + 0.35);
    this.sol.playUp(name, { rate, fade: 0.08, from, fadeAt: follow, fadeOut: 0.3 });
    const hitAt = (info.hit - from) / rate;
    this.swing = { name, t: 0, hitAt, end: (follow - from) / rate + 0.12, landed: false, hitSet: new Set(),
      sweepA: (Math.max(from, info.hitA ?? info.hit - 0.08) - from) / rate, sweepB: ((info.hitB ?? info.hit + 0.06) - from) / rate, tired, power: tired ? 0.55 : 1, push: !!opt.push,
      // the whoosh belongs to the fast part of the swing, not the wind-up
      whooshAt: Math.max(0, hitAt - 0.12), whooshed: false };
    return true;
  }
  // how loud the swing's whoosh is: an axe cuts the air, a fist barely does
  get whooshK() { const W = this.W, S = this.swing; return S && S.push ? 0.2 : W.heavy ? 1 : W.id === 'fists' ? 0.15 : W.id === 'knife' ? 0.2 : W.blunt ? 0.6 : 0.35; }
  // returns 'hit' on the frame the swing lands
  update(dt) {
    this.cool -= dt;
    const S = this.swing, W = this.W;
    // a long weapon goes up on the shoulder a moment after the last swing; both hands on it whenever it's swung or held ready
    this.idleT = S ? 0 : this.idleT + dt;
    const restOn = !!W.twoHand && !S && this.idleT > 1.1 && !this.busy[1] && !this.sol.dead;
    this.restW = dampK(this.restW, restOn ? 1 : 0, restOn ? 5 : 16, dt);
    this.twoW = dampK(this.twoW, W.twoHand && !(S && S.push) && !this.busy[-1] && !this.sol.dead ? 1 : 0, 12, dt);
    if (!S) { this.whoosh = false; return null; }
    S.t += dt;
    let ev = null;
    // this.whoosh is true on the one frame the swing's whoosh should start (main.js plays SND.swing(MEL.whooshK) then)
    this.whoosh = false; if (!S.whooshed && S.t >= S.whooshAt) { S.whooshed = true; this.whoosh = true; }
    if (!S.landed && S.t >= S.hitAt) { S.landed = true; ev = 'hit'; }
    // this.sweep is true on every frame the weapon is passing through its arc (around the main hit frame):
    // main.js can test bodies again then, skipping the ones already in swing.hitSet
    this.sweep = S.t >= S.sweepA && S.t <= S.sweepB && ev !== 'hit';
    if (S.t >= S.end) {
      this.swing = null; this.cool = S.push ? 0.35 : 0.12; this.sweep = false;
      const Q = this.queued; this.queued = null;
      if (Q && !this.sol.dead) { this.cool = 0; if (this.attack(Q.stamina, Q.opt)) this.chained = (this.chained || 0) + 1; }   // main.js: charge MEL.W.stam per chained swing
    }
    return ev;
  }
  // put the weapon in the right hand, fingers round the handle
  pose(visible) {
    const id = this.cur;
    for (const k in this.meshes) if (k !== id) this.meshes[k].visible = false;
    if (id === 'fists') { this.fist(); return; }
    const sol = this.sol, show = visible && sol.visible;
    // resting on the shoulder: the right hand comes up in front of the shoulder, the handle laid back over it
    if (show && this.restW > 0.01 && !this.busy[1] && this.meshes[id]) {
      const yaw = sol.yaw + (sol.twist || 0), fx = Math.sin(yaw), fz = Math.cos(yaw), lx = Math.cos(yaw), lz = -Math.sin(yaw);
      const T = this.TR, sh = sol.B.RightArm.getWorldPosition(tA);
      T.p.set(sh.x + fx * 0.2 + lx * 0.07, sh.y - 0.2, sh.z + fz * 0.2 + lz * 0.07);
      T.s.set(-fx * 0.6 - lx * 0.12, 0.8, -fz * 0.6 - lz * 0.12).normalize();
      T.f.set(lx, 0, lz).addScaledVector(T.s, -(lx * T.s.x + lz * T.s.z)).normalize();
      sol.reach(1, T, this.restW);
    }
    if (!this.place(visible)) return;
    // curl the fingers round it (reach to where the hand already is: only the curl changes) — unless the hand is
    // busy with something else this moment (backpack.js Hands curls it itself)
    if (!this.busy[1]) sol.curlFingers(1, 1, 1);
    // a two-hander: the left hand closes on the handle just below the right (not while it rests on the shoulder)
    const w2 = this.twoW * (1 - this.restW);
    if (show && w2 > 0.01 && !this.busy[-1]) {
      const m = this.meshes[id], T = this.TL;
      tB.copy(UPV).applyQuaternion(m.quaternion); tC.copy(ZV).applyQuaternion(m.quaternion);
      T.p.copy(m.position).addScaledVector(tB, -0.075); T.f.copy(tC); T.s.copy(tB);
      // only where the left arm can really get to it: not at full stretch, not round behind the back (a wind-up)
      const ls = sol.B.LeftArm.getWorldPosition(tD), yaw = sol.yaw + (sol.twist || 0);
      const far = ls.distanceTo(T.p), back = (T.p.x - ls.x) * Math.sin(yaw) + (T.p.z - ls.z) * Math.cos(yaw);
      const ok = (1 - Math.min(1, Math.max(0, (far - 0.5) / 0.1))) * Math.min(1, Math.max(0, (back + 0.05) / 0.12));
      if (w2 * ok > 0.01) sol.reach(-1, T, w2 * ok);
    }
  }
  // just move the weapon to where the right hand is now (after a reach has moved the hand, say)
  place(visible) {
    const B = this.sol.B, id = this.cur;
    const m = this.meshes[id]; if (!m) return false;
    m.visible = visible && this.sol.visible;
    const hand = B.RightHand.getWorldPosition(tA), mid = B.RightHandMiddle1.getWorldPosition(tB);
    const idx = B.RightHandIndex1.getWorldPosition(tC), pin = B.RightHandPinky1.getWorldPosition(tD);
    const f = mid.clone().sub(hand).normalize(), s = idx.clone().sub(pin).normalize();
    // grip point: in the palm, a little past the knuckles' base
    const palm = hand.clone().addScaledVector(f, 0.075);
    // the handle runs along s (out of the thumb side), the edge/face of the weapon points along f (where the fist punches)
    const Y = s.clone().addScaledVector(f, -s.dot(f)).normalize(), Z = f.clone().addScaledVector(Y, -f.dot(Y)).normalize(), X = new THREE.Vector3().crossVectors(Y, Z);
    mB.makeBasis(X, Y, Z); m.quaternion.setFromRotationMatrix(mB);
    // a knife thrust (the jab): the blade turns to point where the fist goes, not out of the thumb side
    if (id === 'knife') {
      const stab = this.swing && this.swing.name.startsWith('Punch') ? 1 : 0;
      this.stabW = (this.stabW || 0) + (stab - (this.stabW || 0)) * 0.25;
      if (this.stabW > 0.001) m.quaternion.multiply(qS.setFromAxisAngle(AX, this.stabW * Math.PI / 2));
    }
    m.position.copy(palm).addScaledVector(Y, -0.03);
    return true;
  }
  // empty hands make fists — but not a hand that's reaching for something, holding something, or on the backpack
  fist() { if (!this.busy[1]) this.sol.curlFingers(1, 1.05, 1); if (!this.busy[-1]) this.sol.curlFingers(-1, 1.05, 1); }
  tip(out) { const m = this.meshes[this.cur]; if (!m) return this.sol.B.RightHand.getWorldPosition(out); return out.set(0, m.userData.tip, 0).applyQuaternion(m.quaternion).add(m.position); }
  hideAll() { for (const k in this.meshes) this.meshes[k].visible = false; }
}
