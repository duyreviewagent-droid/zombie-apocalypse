// Zombie_Apocalypse — hand-to-hand. Fists, a kitchen knife, a baseball bat, a crowbar, a machete and a fire axe.
// Each swing is a captured move played on the upper body (your legs keep walking under it); the weapon is held in
// the right hand (fingers wrapped round the handle) and lands at the moment the captured hand moves fastest.
// Swings cost stamina — tired swings are slow and weak. Weapons wear out and break. A shove pushes zombies off you.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { boneMap } from './rig.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';

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
  return M;
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
    add(new THREE.CylinderGeometry(0.011, 0.011, 0.62, 8), K.red, 0, 0.21, 0);
    add(new THREE.TorusGeometry(0.05, 0.011, 6, 12, Math.PI), K.red, 0.05, 0.52, 0, 0, 0, 0);
    add(new THREE.BoxGeometry(0.03, 0.06, 0.008), K.steel, 0.1, 0.5, 0, 0, 0, 0.4);
    add(new THREE.BoxGeometry(0.026, 0.05, 0.008), K.steel, 0, -0.12, 0.012, 0.6, 0, 0);
    tip = 0.55;
  } else if (id === 'machete') {
    add(new RoundedBoxGeometry(0.03, 0.13, 0.024, 2, 0.008), K.grip, 0, 0.0, 0);
    for (const y of [-0.035, 0.02]) for (const sx of [1, -1]) add(new THREE.CylinderGeometry(0.0045, 0.0045, 0.003, 8), K.rivet, sx * 0.0152, y, 0, 0, 0, Math.PI / 2);
    const s = new THREE.Shape(); s.moveTo(-0.018, 0); s.lineTo(0.022, 0); s.lineTo(0.03, 0.38); s.quadraticCurveTo(0.03, 0.46, -0.02, 0.48); s.lineTo(-0.018, 0);
    const bl = add(new THREE.ExtrudeGeometry(s, { depth: 0.003, bevelEnabled: false }), K.blade, 0, 0.065, -0.0015);
    bl.rotation.y = Math.PI / 2;
    tip = 0.52;
  } else if (id === 'axe') {
    add(new THREE.CylinderGeometry(0.016, 0.02, 0.86, 10), K.wood, 0, 0.28, 0);
    add(new RoundedBoxGeometry(0.03, 0.08, 0.2, 2, 0.008), K.red, 0, 0.66, 0.04);
    const s = new THREE.Shape(); s.moveTo(0, -0.05); s.lineTo(0.11, -0.08); s.quadraticCurveTo(0.13, 0, 0.11, 0.08); s.lineTo(0, 0.05);
    const head = add(new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: false }), K.blade, 0, 0.66, 0.12); head.rotation.set(0, -Math.PI / 2, Math.PI / 2); head.position.set(-0.006, 0.66, 0.13);
    add(new THREE.ConeGeometry(0.02, 0.1, 6), K.red, 0, 0.66, -0.1, -Math.PI / 2, 0, 0);
    tip = 0.72;
  } else if (id === 'knife') {
    add(new RoundedBoxGeometry(0.022, 0.11, 0.018, 2, 0.006), K.dark, 0, 0, 0);
    for (const y of [-0.03, 0.0, 0.03]) for (const sx of [1, -1]) add(new THREE.CylinderGeometry(0.0032, 0.0032, 0.003, 8), K.rivet, sx * 0.0113, y, 0, 0, 0, Math.PI / 2);
    const s = new THREE.Shape(); s.moveTo(-0.012, 0); s.lineTo(0.016, 0); s.lineTo(0.004, 0.19); s.lineTo(-0.012, 0);
    const bl = add(new THREE.ExtrudeGeometry(s, { depth: 0.002, bevelEnabled: false }), K.blade, 0, 0.055, -0.001); bl.rotation.y = Math.PI / 2;
    tip = 0.24;
  }
  g.userData.tip = tip;
  return g;
}
export function makeMeleeMesh(id) { return build(id); }

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
      sol.reach(-1, T, w2);
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
