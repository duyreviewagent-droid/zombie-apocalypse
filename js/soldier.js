// human-WAR — every soldier on the field: you, your squad, the enemy and the crash-test dummies.
// The body is HUMAN's: captured idle / walk / run (and crouch) blended by speed on one shared stride phase so
// the feet stay planted. On top of that:
//  - the legs and the upper body turn separately: the legs follow where you walk, the spine twists to where
//    you aim (walking backwards plays the stride in reverse, so nobody moonwalks);
//  - the arms are solved with two-bone IK onto the weapon's grips, hands turned to wrap the grip, fingers curled;
//  - captured one-off moves: falling dead, getting up, flinching when hit, rolling, throwing a grenade
//    (the throw and the flinches only drive the upper body, so you can throw while walking).
import * as THREE from 'three';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import { retarget, analyse, boneMap } from './rig.js';
import { C } from './state.js';
import { tier } from './tex.js';

export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
export const wrapPi = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
export const dampAngle = (a, b, k, dt) => a + wrapPi(b - a) * (1 - Math.exp(-k * dt));
const UP = new THREE.Vector3(0, 1, 0);
const tq = new THREE.Quaternion(), tq2 = new THREE.Quaternion(), va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
const ID = new THREE.Quaternion(), tq3 = new THREE.Quaternion();

export function addTurn(bone, axis, a) {
  if (!bone || Math.abs(a) < 1e-4) return;
  bone.parent.updateWorldMatrix(true, false);
  bone.getWorldQuaternion(tq);
  tq2.setFromAxisAngle(axis, a); tq.premultiply(tq2);
  bone.parent.getWorldQuaternion(tq2).invert();
  bone.quaternion.copy(tq2.multiply(tq));
}
// swing a bone so the line to its child points along dir (world space), by weight w
export function aimBone(bone, child, dir, w = 1, blend = false) {
  if (!bone || !child || w < 0.002) return;
  bone.getWorldPosition(va); child.getWorldPosition(vb);
  vb.sub(va); if (vb.lengthSq() < 1e-10) return; vb.normalize();
  tq2.setFromUnitVectors(vb, vc.copy(dir).normalize());
  if (w < 1) { if (blend) tq2.slerpQuaternions(ID, tq3.copy(tq2), w); else tq2.slerpQuaternions(ID, tq2, w); }   // (without blend this is the old behaviour: any w < 1 comes out as no turn at all)
  bone.getWorldQuaternion(tq).premultiply(tq2);
  bone.parent.getWorldQuaternion(tq2).invert();
  bone.quaternion.copy(tq2.multiply(tq));
}
// turn a bone so two of its directions (f: along it, s: to one side) match two wanted ones
const mA = new THREE.Matrix4(), mB = new THREE.Matrix4(), x1 = new THREE.Vector3(), y1 = new THREE.Vector3(), z1 = new THREE.Vector3(), qr = new THREE.Quaternion();
function frame(m, f, s) {
  z1.copy(f).normalize(); x1.copy(s).addScaledVector(z1, -s.dot(z1)).normalize(); y1.crossVectors(z1, x1);
  m.makeBasis(x1, y1, z1);
}
function orientBone(bone, fCur, sCur, fTgt, sTgt, w, blend = false) {
  frame(mA, fCur, sCur); frame(mB, fTgt, sTgt);
  qr.setFromRotationMatrix(mB.multiply(mA.transpose()));
  if (w < 1) { if (blend) qr.slerpQuaternions(ID, tq3.copy(qr), w); else qr.slerpQuaternions(ID, qr, w); }
  bone.getWorldQuaternion(tq).premultiply(qr);
  bone.parent.getWorldQuaternion(tq2).invert();
  bone.quaternion.copy(tq2.multiply(tq));
}

// ---------------------------------------------------------------- per-model preparation (slow, done once)
const ACTS = ['Idle_A', 'Jump_Start', 'Jump_air', 'Jump_Land', 'Crouch_Idle', 'Crouch_Walk', 'Death_D', 'Hit_Chest', 'Hit_Head',
  'Hit_Knockback', 'OverhandThrow', 'LayToIdle', 'Roll', 'Idle_ShakeOff', 'Interact', 'Zombie_Idle', 'Zombie_Walk', 'Zombie_Scratch',
  'Sword_Regular_A', 'Sword_Regular_B', 'Sword_Regular_C', 'Sword_Attack', 'Punch_Jab', 'Punch_Cross', 'Push', 'PickUp_Table', 'Chest_Open', 'Consume', 'Fixing_Kneeling', 'ClimbUp_1m_RM'];
const UPPER_ACTS = ['OverhandThrow', 'Hit_Chest', 'Hit_Head', 'Interact', 'Zombie_Scratch', 'Sword_Regular_A', 'Sword_Regular_B', 'Sword_Regular_C', 'Sword_Attack', 'Punch_Jab', 'Punch_Cross', 'Push', 'Consume'];
const UPPER = /Spine|Neck|Head|Shoulder|Arm|Hand/;
// every body prepared (in load order: human, butler, coach, michelle) — looks.js borrows hair, beards and hats between them
export const KIND_ROOTS = [];
export function prepareKind(gltf, motion, moves) {
  const root = gltf.scene; KIND_ROOTS.push(root);
  const rest = []; root.traverse(o => rest.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]));
  root.updateMatrixWorld(true);
  const B = boneMap(root);
  const restFootY = B.LeftFoot.getWorldPosition(new THREE.Vector3()).y;
  const clips = retarget(motion.scene, motion.animations.filter(a => ['idle', 'walk', 'run', 'sneak_pose'].includes(a.name)), root);
  const info = {};
  const inPlace = (clip, floorErr) => {
    const tr = clip.tracks.find(t => t.name.endsWith('.position'));
    for (let i = 1; i < tr.values.length; i += 3) tr.values[i] -= floorErr;
    const x0 = tr.values[0], z0 = tr.values[2];
    for (let i = 0; i < tr.values.length; i += 3) { tr.values[i] = x0; tr.values[i + 2] = z0; }
  };
  for (const n of ['idle', 'walk', 'run']) { info[n] = analyse(root, clips[n], restFootY); inPlace(clips[n], info[n].floorErr); }
  // the second library's moves come from another skeleton: line their hips up with the walk clips'
  const ac = retarget(moves.scene, moves.animations.filter(a => ACTS.includes(a.name)), root);
  {
    const ref = clips.idle.tracks.find(t => t.name.endsWith('.position')).values;
    const ja = analyse(root, ac.Idle_A, restFootY);
    const iv = ac.Idle_A.tracks.find(t => t.name.endsWith('.position')).values;
    const dx = ref[0] - iv[0], dy = -ja.floorErr, dz = ref[2] - iv[2];
    for (const c of Object.values(ac)) {
      const tr = c.tracks.find(t => t.name.endsWith('.position'));
      for (let i = 0; i < tr.values.length; i += 3) { tr.values[i] += dx; tr.values[i + 1] += dy; tr.values[i + 2] += dz; }
    }
  }
  info.crouch = analyse(root, ac.Crouch_Walk, restFootY);
  info.zwalk = analyse(root, ac.Zombie_Walk, restFootY); inPlace(ac.Zombie_Walk, info.zwalk.floorErr);
  info.zidle = analyse(root, ac.Zombie_Idle, restFootY);
  { const tr = ac.Zombie_Idle.tracks.find(t => t.name.endsWith('.position')); for (let i = 1; i < tr.values.length; i += 3) tr.values[i] -= info.zidle.floorErr; }
  inPlace(ac.Crouch_Walk, info.crouch.floorErr);
  { const ci = analyse(root, ac.Crouch_Idle, restFootY); const tr = ac.Crouch_Idle.tracks.find(t => t.name.endsWith('.position')); for (let i = 1; i < tr.values.length; i += 3) tr.values[i] -= ci.floorErr; }
  // climbing onto a ledge: the captured climb is already in place (its 1 m rise is on the root bone, which the retarget
  // drops, and it rises at a steady rate); mantle() moves the body up and over along the same steady line
  // upper-body-only copies (legs keep walking underneath)
  const upper = {};
  for (const n of UPPER_ACTS) {
    const c = ac[n];
    upper[n] = new THREE.AnimationClip(n + '_U', c.duration, c.tracks.filter(t => !t.name.endsWith('.position') && UPPER.test(t.name.split('.')[0])));
  }
  // when does the hand let go of a grenade? the moment it moves forward fastest
  let release = 0.5;
  {
    const mixer = new THREE.AnimationMixer(root), act = mixer.clipAction(ac.OverhandThrow); act.play();
    const N = 60, d = ac.OverhandThrow.duration; let prev = null, best = -1e9;
    for (let i = 0; i <= N; i++) {
      mixer.setTime(Math.min(i / N * d, d - 1e-4)); root.updateMatrixWorld(true);
      const p = B.RightHand.getWorldPosition(new THREE.Vector3());
      if (prev) { const v = (p.z - prev.z) + Math.max(0, p.y - prev.y) * 0.3; if (v > best && i / N > 0.2) { best = v; release = i / N * d; } }
      prev = p;
    }
    act.stop(); mixer.uncacheRoot(root);
  }
  // where the hips lie at the end of the fall, and where they start getting up (so the body doesn't slide across the floor)
  {
    const mixer = new THREE.AnimationMixer(root), at = (clip, t) => {
      const a = mixer.clipAction(clip); a.play(); mixer.setTime(t); root.updateMatrixWorld(true);
      const p = root.worldToLocal(B.Hips.getWorldPosition(new THREE.Vector3())); a.stop(); return p;
    };
    info.ddEnd = at(ac.Death_D, ac.Death_D.duration - 0.05); info.layStart = at(ac.LayToIdle, 0);
    mixer.uncacheRoot(root);
  }
  for (const [o, p, q, sc] of rest) { o.position.copy(p); o.quaternion.copy(q); o.scale.copy(sc); }   // back to the bind pose for fitting kit
  root.updateMatrixWorld(true);
  const hipY = B.Hips.getWorldPosition(new THREE.Vector3()).y;
  return {
    root, clips: { ...clips, ...ac }, upper, info, hipY, release,
    vw: info.walk.speed, vr: info.run.speed, vc: info.crouch.speed,
    offW: info.walk.strike / info.walk.duration, offR: info.run.strike / info.run.duration, offC: info.crouch.strike / info.crouch.duration,
  };
}

// ---------------------------------------------------------------- a soldier
let NEXT_ID = 1;
const FULL = ['Death_D', 'Hit_Knockback', 'LayToIdle', 'Roll', 'Idle_ShakeOff', 'Interact', 'PickUp_Table', 'Chest_Open', 'Fixing_Kneeling', 'Zombie_Scratch', 'Push', 'ClimbUp_1m_RM'];
// a zombie body: the same person, but shambling (captured zombie walk and idle in place of the human ones)
export function zombieKind(k) {
  if (k.zk) return k.zk;
  const info = { ...k.info, walk: k.info.zwalk, idle: k.info.zidle };
  k.zk = { ...k, clips: { ...k.clips, walk: k.clips.Zombie_Walk, idle: k.clips.Zombie_Idle }, info, vw: k.info.zwalk.speed, offW: k.info.zwalk.strike / k.info.zwalk.duration, zombie: true };
  return k.zk;
}
// animation LOD (desktop: far = 32 m, posed every 3rd frame; off-screen every 6th). Phones / tablets: sooner, rarer.
let LOD_FAR2 = 32 * 32, LOD_FARN = 3, LOD_OFF = 6, lodSet = false;
function setLod() { lodSet = true; const t = tier(); if (t) { const f = t > 1 ? 18 : 24; LOD_FAR2 = f * f; LOD_FARN = t > 1 ? 4 : 3; LOD_OFF = t > 1 ? 10 : 8; } }
const BODY_R = [['Hips', 0.12], ['Spine1', 0.12], ['Spine2', 0.125], ['Neck', 0.07], ['Head', 0.1], ['LeftArm', 0.06], ['RightArm', 0.06], ['LeftForeArm', 0.045], ['RightForeArm', 0.045], ['LeftHand', 0.03], ['RightHand', 0.03], ['LeftUpLeg', 0.085], ['RightUpLeg', 0.085], ['LeftLeg', 0.055], ['RightLeg', 0.055], ['LeftFoot', 0.045], ['RightFoot', 0.045]];
const vLift = new THREE.Vector3();
const STEP_H = [[0.02, -1], [0.52, 1]], STEP_Z = [[0.99, -1], [0.64, 1]];
// what the camera can see (worked out once a frame, shared by everybody)
const FR = new THREE.Frustum(), PM = new THREE.Matrix4(), SPH = new THREE.Sphere();
let frT = -1, frCam = null;
function inView(p) {
  const cam = C.camera; if (!cam) return true;
  if (frT !== C.t || frCam !== cam) { frT = C.t; frCam = cam; cam.updateMatrixWorld(); PM.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); FR.setFromProjectionMatrix(PM); }
  SPH.center.set(p.x, p.y + 0.9, p.z); SPH.radius = 1.6;
  return FR.intersectsSphere(SPH);
}
export class Soldier {
  constructor(kind, scene, { clone = true, onStep = null } = {}) {
    this.id = NEXT_ID++;
    this.kind = kind;
    const root = this.root = clone ? skClone(kind.root) : kind.root;
    root.position.set(0, 0, 0); root.rotation.set(0, 0, 0);
    this.morphs = [];
    root.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      if (o.morphTargetDictionary) this.morphs.push(o);
    });
    // skinned bodies are culled with one generous sphere round the whole person (standing, lying or thrown about),
    // so the ones off-screen cost nothing to draw — and nothing in the shadow pass either
    root.updateMatrixWorld(true);
    root.traverse(o => {
      if (!o.isSkinnedMesh) return;
      const inv = o.matrixWorld.clone().invert(), sc = o.matrixWorld.getMaxScaleOnAxis() || 1;
      o.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0).applyMatrix4(inv), 2.3 / sc);
      o.frustumCulled = true;
    });
    this.B = boneMap(root);
    this.pivot = new THREE.Group(); this.pivot.add(root); scene.add(this.pivot);
    this.onStep = onStep;
    const mixer = this.mixer = new THREE.AnimationMixer(root); mixer.timeScale = 0;   // times are driven by hand
    const A = this.A = {};
    for (const n of ['idle', 'walk', 'run']) { A[n] = mixer.clipAction(kind.clips[n]); A[n].play(); A[n].setEffectiveWeight(n === 'idle' ? 1 : 0); }
    for (const [n, c] of [['jStart', 'Jump_Start'], ['jAir', 'Jump_air'], ['jLand', 'Jump_Land'], ['cIdle', 'Crouch_Idle'], ['cWalk', 'Crouch_Walk']]) { A[n] = mixer.clipAction(kind.clips[c]); A[n].play(); A[n].setEffectiveWeight(0); }
    this.acts = {};
    for (const n of FULL) { const a = mixer.clipAction(kind.clips[n]); a.play(); a.setEffectiveWeight(0); this.acts[n] = { a, w: 0, target: 0, t: 0, dur: kind.clips[n].duration, opt: {} }; }
    this.ups = {};
    for (const n in kind.upper) { const a = mixer.clipAction(kind.upper[n]); a.play(); a.setEffectiveWeight(0); this.ups[n] = { a, w: 0, target: 0, t: 0, dur: kind.upper[n].duration, opt: {} }; }
    this.vw = kind.vw; this.vr = kind.vr; this.vc = kind.vc;
    // state
    this.yaw = 0; this.vel = new THREE.Vector3(); this.speed = 0; this.moveA = 0; this.turnRate = 0; this.lean = 0; this.pitchLean = 0;
    this.phase = Math.random(); this.prevPhase = this.phase; this.dir = 1;
    this.idleT = Math.random() * 5; this.crouchW = 0; this.exertion = 0; this.look = 0; this.lookP = 0;
    this.aimYaw = 0; this.aimPitch = 0; this.combatW = 0; this.twist = 0; this.pitchNow = 0;
    this.blink = 0; this.blinkT = Math.random() * 3; this.mouth = 0; this.talkT = 0;
    this.jump = { st: 'ground', t: 0, y: 0, vy: 0, vy0: 3, impact: 0, w: 0, wS: 0, wA: 0, wL: 0, clipS: 0, clipL: 0, runAt: 0 };
    this.act = null; this.up = null;
    this.lookAt = null;
    this.left = new THREE.Vector3(); this.fwd = new THREE.Vector3();
    this.visible = true;
    this.fly = null;          // thrown by a blast: { vx, vy, vz }
    this.animLod = false;     // far from the camera, pose only every 3rd frame (zombies turn this on)
    this.lodN = 0; this.frozen = false;
    this.deadPose = null;     // how this one body lies once it's down (head turned, arms flung — never two the same)
    this.talkK = 1;           // how wide the mouth opens when it talks (screams open it wide)
  }
  get pos() { return this.pivot.position; }
  setVisible(v) { if (this.visible !== v) { this.visible = v; this.pivot.visible = v; } }
  // y: the floor it's put on (0 the ground; 4 to start up on a tower platform)
  place(x, z, yaw = 0, y = 0) {
    this.pos.set(x, y, z); this.yaw = yaw; this.aimYaw = yaw; this.moveA = yaw; this.vel.set(0, 0, 0); this.speed = 0; this.turnRate = 0; this.fly = null;
    this.jump.st = 'ground'; this.jump.y = 0; this.jump.w = 0; this.jump.fall = false;
    this.gy = null; this.gyT = y; this.pos.gy = y; this.mant = null;
    this.pivot.rotation.set(0, yaw, 0);
  }
  // put the feet on a floor at height y right now (no fall, no smoothing)
  setGround(y) { this.gy = this.gyT = y; this.pos.gy = y; this.jump.y = 0; this.jump.fall = false; if (this.jump.st === 'air') this.jump.st = 'ground'; }
  // climb up onto a ledge (L from world.ledgeAhead: { x, z, y }): the body rises first, then goes over the edge
  // onto the top. Takes dur seconds (about a second); the caller plays whatever climbing move it likes meanwhile.
  mantle(L, dur = 0) {
    const y0 = this.gy ?? this.gyT ?? 0, dh = L.y - y0;
    this.mant = { x0: this.pos.x, z0: this.pos.z, y0, x1: L.x, z1: L.z, y1: L.y, t: 0, dur: dur || clamp(0.55 + dh * 0.35, 0.7, 1.2) };
    this.vel.set(0, 0, 0); this.speed = 0; this.jump.st = 'ground'; this.jump.y = 0; this.jump.fall = false; this.jump.w = 0;
    this.yaw = this.moveA = this.aimYaw = Math.atan2(L.x - this.pos.x, L.z - this.pos.z);
    const cc = this.kind.clips.ClimbUp_1m_RM;
    if (cc && this.acts.ClimbUp_1m_RM && !this.dead) { this.play('ClimbUp_1m_RM', { rate: cc.duration / this.mant.dur, fade: 0.1, fadeOut: 0.25 }); if (this.up) { this.ups[this.up].target = 0; this.up = null; } }
  }
  get climbing() { return !!this.mant; }
  resetActs() {
    this.act = null; this.up = null;
    for (const k in this.acts) { this.acts[k].w = 0; this.acts[k].target = 0; }
    for (const k in this.ups) { this.ups[k].w = 0; this.ups[k].target = 0; }
  }
  // full-body captured move. loop · hold (freeze on the last frame) · from/to · rate · reverse
  play(name, opt = {}) {
    const c = this.acts[name]; if (!c) return;
    // the move going out fades exactly as fast as the new one comes in, so the two always add up to a whole body
    // (otherwise the standing pose leaks into the gap: a body getting up would spring half-upright first)
    if (name === 'LayToIdle' && (this.act === 'Death_D' || this.act === 'Hit_Knockback') && this.kind.info.ddEnd && this.acts[this.act].w > 0.9) {
      // getting up starts with the hips where the fall left them: move the pivot under them and switch over at once
      const I = this.kind.info, sc = this.root.scale.x, dx = (I.ddEnd.x - I.layStart.x) * sc, dz = (I.ddEnd.z - I.layStart.z) * sc, cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
      if (this.act === 'Death_D' && Math.hypot(dx, dz) < 1.5) {
        this.pos.x += dx * cy + dz * sy; this.pos.z += -dx * sy + dz * cy;
        if (C.world && C.world.collide) C.world.collide(this.pos, 0.3);
        opt = { ...opt, snap: true };
      }
    }
    if (this.act && this.act !== name) { const o = this.acts[this.act]; o.target = 0; o.fade = opt.fade || 0.22; }
    c.opt = opt; c.t = opt.from || 0; c.target = 1; c.fade = opt.fade || 0.22;
    if (opt.snap) { for (const k in this.acts) this.acts[k].w = 0; c.w = 1; }
    this.act = name;
  }
  stopAct(fade = 0.3) { if (this.act) { const c = this.acts[this.act]; c.target = 0; c.fade = fade; } this.act = null; }
  actTime(name = this.act) { const c = name && this.acts[name]; return c ? c.t : 0; }
  actDone(name = this.act) { const c = name && this.acts[name]; return !!c && !c.opt.loop && c.t >= (c.opt.to ?? c.dur) - 1e-3; }
  // upper-body move (throw, flinch)
  playUp(name, opt = {}) {
    const c = this.ups[name]; if (!c) return;
    if (this.act === 'ClimbUp_1m_RM' && name === 'Push') return;   // the climb's own arms do the pulling
    if (this.up && this.up !== name) this.ups[this.up].target = 0;
    c.opt = opt; c.t = opt.from || 0; c.target = 1; c.fade = opt.fade || 0.12;
    this.up = name;
  }
  upTime() { return this.up ? this.ups[this.up].t : 0; }

  // cmd: { move: heading or null, speed, aimYaw, aimPitch, combat 0..1, crouch, jump, face }
  update(dt, cmd = {}) {
    const k = this.kind, J = this.jump;
    const locked = !!this.act || this.dead;
    const crouch = !!cmd.crouch && !locked;
    this.crouchW = damp(this.crouchW, crouch ? 1 : 0, 7, dt);
    if (cmd.aimYaw != null) { this.aimYaw = cmd.aimYaw; this.aimPitch = cmd.aimPitch || 0; }
    this.combatW = damp(this.combatW, locked ? 0 : (cmd.combat || 0), 9, dt);

    // ---- jumping (captured take-off, flight, landing) ----
    const runNow = smooth(k.vw, k.vr, this.speed), TAKE = 0.23;
    if (cmd.jump && !locked && !this.mant && this.crouchW < 0.3 && (J.st === 'ground' || (J.st === 'land' && J.clipL > 0.45))) {
      J.st = 'prep'; J.t = 0; J.runAt = runNow; J.dip = lerp(0.18, 0.05, runNow); J.from = lerp(0.025, 0.08, runNow);
    }
    const airborne = J.st === 'air' || !!this.fly;
    let jw = 0;
    if (J.st === 'prep') {
      J.t += dt;
      if (J.t < J.dip) { J.clipS = J.from; jw = smooth(0, J.dip, J.t); }
      else { J.clipS = Math.min(TAKE, J.from + (J.t - J.dip) * (1 + J.runAt * 0.6)); jw = 1; }
      J.wS = jw; J.wA = 0; J.wL = 0;
      if (J.clipS >= TAKE) { J.st = 'air'; J.t = 0; J.vy0 = J.vy = 3.0 + 0.35 * J.runAt; this.onStep && this.onStep(this, { jump: true, run: J.runAt }); }
    } else if (J.st === 'air') {
      J.t += dt; J.vy -= 9.81 * dt; J.y += J.vy * dt;
      const flight = 2 * J.vy0 / 9.81;
      J.clipS = TAKE + clamp(J.t / flight, 0, 1) * (1.3 - TAKE);
      const tg = (J.vy + Math.sqrt(Math.max(0, J.vy * J.vy + 2 * 9.81 * Math.max(0, J.y)))) / 9.81;
      J.wL = 1 - smooth(0, 0.1, tg);
      jw = lerp(lerp(0.75, 0.6, J.runAt), 1, J.wL);
      J.wS = (jw - J.wL) * lerp(0.6, 0.45, J.runAt); J.wA = jw - J.wL - J.wS; J.clipL = 0;
      if (J.fall) { J.wS = 0; J.wA = jw - J.wL; }   // stepped off an edge: falling, not pushing off
      if (J.y <= 0 && J.vy < 0) {
        J.impact = -J.vy; J.y = 0; J.vy = 0; J.st = 'land'; J.t = 0; J.clipL = 0.03; J.fall = false;
        J.landW = clamp(0.15 + J.impact * 0.14, 0.35, 0.95) * (1 - 0.4 * J.runAt);
        this.vel.multiplyScalar(lerp(0.55, 0.85, J.runAt));
        this.onStep && this.onStep(this, { land: J.impact, run: J.runAt });
      }
    } else if (J.st === 'land') {
      J.clipL += dt * lerp(1, 1.5, J.runAt) * (cmd.move != null ? 1.25 : 1);
      const fade = 1 - smooth(0.4, 0.95, J.clipL);
      jw = lerp(1, J.landW, smooth(0, 0.12, J.clipL)) * fade;
      J.wS = J.wA = 0; J.wL = jw;
      if (fade <= 0.001) { J.st = 'ground'; jw = 0; }
    }
    if (this.dead) { jw = 0; J.st = 'ground'; }
    J.w = jw;

    // ---- moving: velocity in the world, legs turned separately ----
    const prevSpeed = this.speed;
    const want = cmd.move != null && !locked ? cmd.speed : 0;
    if (!airborne && J.st !== 'air') {
      const dvx = Math.sin(cmd.move ?? 0) * want - this.vel.x, dvz = Math.cos(cmd.move ?? 0) * want - this.vel.z;
      const dl = Math.hypot(dvx, dvz), acc = (want > this.speed ? (this.speed > k.vw ? 5 : 8) : 11) * (cmd.accel || 1) * dt;
      if (dl > acc) { this.vel.x += dvx / dl * acc; this.vel.z += dvz / dl * acc; } else { this.vel.x += dvx; this.vel.z += dvz; }
    }
    if (this.fly) {   // thrown through the air by a blast
      const F = this.fly; F.vy -= 9.81 * dt;
      this.pos.x += F.vx * dt; this.pos.z += F.vz * dt; J.y = Math.max(0, J.y + F.vy * dt);
      F.vx *= Math.exp(-0.4 * dt); F.vz *= Math.exp(-0.4 * dt);
      if (J.y <= 0 && F.vy < 0) { if (F.vy < -2.5 && this.onStep) this.onStep(this, { body: -F.vy }); F.vy = -F.vy * 0.18; F.vx *= 0.45; F.vz *= 0.45; if (Math.abs(F.vy) < 0.6) { this.fly = null; J.y = 0; } }
      this.vel.set(0, 0, 0);
    } else if (this.dead) this.vel.multiplyScalar(Math.exp(-6 * dt));
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    if (this.speed > 0.08) this.moveA = Math.atan2(this.vel.x, this.vel.z);
    const fwdAcc = (this.speed - prevSpeed) / Math.max(dt, 1e-3);

    let legT = null;
    const aiming = this.combatW > 0.45;
    if (!locked) {
      if (this.speed > 0.3) {
        if (aiming) {
          const d = wrapPi(this.moveA - this.aimYaw);
          if (this.dir > 0 ? Math.abs(d) > 1.9 : Math.abs(d) > 1.55) this.dir = -1; else this.dir = 1;
          const dd = this.dir > 0 ? d : wrapPi(d + Math.PI);
          legT = this.aimYaw + clamp(dd, -1.6, 1.6);   // hips face the way you go; the spine twists back to the aim
        } else { this.dir = 1; legT = this.moveA; }
      } else {
        this.dir = 1;
        if (aiming && Math.abs(wrapPi(this.aimYaw - this.yaw)) > 0.75) legT = this.aimYaw;
        else if (cmd.face != null) legT = cmd.face;
      }
    }
    let turn = 0;
    if (legT != null) { const maxRate = this.speed < 0.3 ? 5 : lerp(7, 4, smooth(0, k.vr, this.speed)); turn = clamp(wrapPi(legT - this.yaw) * 8, -maxRate, maxRate); }
    if (airborne) turn *= 0.2;
    this.turnRate = damp(this.turnRate, turn, 12, dt);
    this.yaw = wrapPi(this.yaw + this.turnRate * dt);
    if (this.dead || this.act) this.turnRate = 0;

    const running = smooth(k.vw, k.vr, this.speed);
    this.exertion = damp(this.exertion, Math.max(running, cmd.tired || 0), running > 0.5 ? 0.5 : 0.18, dt);
    this.lean = damp(this.lean, clamp(-this.turnRate * this.speed * 0.03, -0.14, 0.14), 6, dt);
    this.pitchLean = damp(this.pitchLean, (clamp(airborne ? 0 : fwdAcc * 0.012, -0.04, 0.06) + running * 0.04 * (1 - this.combatW)) * (1 - J.w), 8, dt);

    // ---- locomotion blend: idle -> walk -> run (or crouch idle -> crouch walk) on one stride phase ----
    const s = Math.max(this.speed, airborne || locked ? 0 : Math.min(Math.abs(this.turnRate) * 0.12, 0.35)), vw = k.vw, vr = k.vr;
    const Lw = vw * k.info.walk.duration, Lr = vr * k.info.run.duration, Lc = k.vc * k.info.crouch.duration;
    let wi, ww, wr, cyc;
    if (s <= vw) { const a = smooth(0, vw * 0.6, s); wi = 1 - a; ww = a; wr = 0; cyc = Lw; }
    else { const b = clamp((s - vw) / (vr - vw), 0, 1); wi = 0; ww = 1 - b; wr = b; cyc = lerp(Lw, Lr, b); }
    const ca = smooth(0, k.vc * 0.6, s);
    cyc = lerp(cyc, Lc, this.crouchW);
    const rate = airborne ? 0 : (wi < 0.98 || ca > 0.02 ? Math.max(s, 0.4 * smooth(0, 0.4, s)) : s) / cyc * this.dir;
    this.prevPhase = this.phase;
    this.phase = ((this.phase + rate * dt) % 1 + 1) % 1;
    const A = this.A;
    A.walk.time = ((this.phase + k.offW) % 1) * k.info.walk.duration;
    A.run.time = ((this.phase + k.offR) % 1) * k.info.run.duration;
    A.cWalk.time = ((this.phase + k.offC) % 1) * k.info.crouch.duration;
    this.idleT += dt * (1 + this.exertion * 0.6);
    A.idle.time = this.idleT % k.info.idle.duration;
    A.cIdle.time = this.idleT % A.cIdle.getClip().duration;

    // ---- full-body acts ----
    let actSum = 0;
    for (const n in this.acts) actSum += this.stepAct(this.acts[n], n, dt, true);
    const actK = actSum > 1 ? 1 / actSum : 1, actTotal = Math.min(1, actSum);
    for (const n in this.acts) { const c = this.acts[n]; if (c.w > 0) c.a.setEffectiveWeight(c.w * actK); }
    const lw = (1 - J.w) * (1 - actTotal);   // all weights must add to 1 or the bind pose leaks in
    const st = 1 - this.crouchW;
    A.idle.setEffectiveWeight(wi * lw * st); A.walk.setEffectiveWeight(ww * lw * st); A.run.setEffectiveWeight(wr * lw * st);
    A.cIdle.setEffectiveWeight((1 - ca) * lw * this.crouchW); A.cWalk.setEffectiveWeight(ca * lw * this.crouchW);
    A.jStart.time = Math.min(J.clipS, A.jStart.getClip().duration - 0.001); A.jStart.setEffectiveWeight(J.wS * (1 - actTotal));
    A.jAir.time = (J.t * 0.8) % A.jAir.getClip().duration; A.jAir.setEffectiveWeight(J.wA * (1 - actTotal));
    A.jLand.time = Math.min(J.clipL, A.jLand.getClip().duration - 0.001); A.jLand.setEffectiveWeight(J.wL * (1 - actTotal));
    // ---- upper-body acts sit on top (their share of the upper bones is u) ----
    let upMax = 0;
    for (const n in this.ups) {
      const c = this.ups[n], u = this.stepAct(c, n, dt, false);
      upMax = Math.max(upMax, u);
      if (c.w > 0) c.a.setEffectiveWeight(Math.min(1000, u / Math.max(0.001, 1 - u)));
    }
    this.upW = upMax * (1 - actTotal);
    // far away the pose is only worked out every 3rd frame (nobody can see the difference at that distance)
    const cam = C.camera; if (!lodSet) setLod();
    // (phones and tablets: 'far' starts sooner, and far / off-screen ones are posed even less often)
    const far = this.animLod && !this.fly && cam && (this.pivot.position.x - cam.position.x) ** 2 + (this.pivot.position.z - cam.position.z) ** 2 > LOD_FAR2;
    // off-screen ones still move (and their shadows), just every 6th frame
    const off = this.animLod && !this.fly && !this.noLod && cam && !inView(this.pivot.position);
    this.lodN = off ? (this.lodN + 1) % LOD_OFF : far ? (this.lodN + 1) % LOD_FARN : 0;
    // far ones cast no shadow: their skinned vertices aren't processed a second time for a shadow too small to see
    const cs = !far; if (this._cs !== cs) { this._cs = cs; this.pivot.traverse(o => { if (o.isMesh && !o.userData.noShadow) o.castShadow = cs; }); }
    this.frozen = this.lodN !== 0;
    if (!this.frozen) this.mixer.update(0);
    // a woman's walk: the hips roll more, the shoulders swing less (on top of the shared captured stride)
    if (!this.frozen && (this.root.userData.female || this.kind.root.userData.female) && this.B.Hips) {
      const wk = (ww + wr * 0.6) * lw * st, ph2 = (this.phase + k.offW) * Math.PI * 2;
      if (wk > 0.01) {
        this.fwd.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
        addTurn(this.B.Hips, this.fwd, Math.sin(ph2) * 0.07 * wk);
        if (this.B.Spine2) addTurn(this.B.Spine2, this.fwd, -Math.sin(ph2) * 0.045 * wk);
      }
    }
    if (!this.frozen && this.hair && this.hair.userData.sim && Soldier.updateHair) Soldier.updateHair(this, dt);

    // stand on the real ground (sidewalks and porches are a step up, the tower stairs and platforms higher); walk off
    // an edge higher than half a metre and you drop (gravity, then the landing); a body on the floor rests on it, never in it
    const zomb = !!this.kind.zombie; this.pos.noClimb = zomb;   // zombies can't climb stairs or crates (world.collide reads this)
    let gy;
    if (this.mant) {   // climbing onto a ledge: up first, then over the edge
      const M = this.mant; M.t += dt; const u = Math.min(1, M.t / M.dur), kx = smooth(0.5, 1, u);
      // with the captured climb the body goes up at the clip's own steady rate; without it, up first then over
      const ky = this.act === 'ClimbUp_1m_RM' ? smooth(0, 0.25, u) * 0.25 + clamp((u - 0.0) / 0.93, 0, 1) * 0.75 : smooth(0.1, 0.6, u);
      this.pos.x = lerp(M.x0, M.x1, kx); this.pos.z = lerp(M.z0, M.z1, kx); this.vel.set(0, 0, 0); this.speed = 0;
      gy = this.gy = lerp(M.y0, M.y1, ky);
      if (u >= 1) { this.mant = null; gy = this.gy = M.y1; }
    } else {
      const feet = (this.gyT ?? 0) + (J.st === 'air' ? Math.max(0, J.y) : 0);
      gy = Soldier.groundY ? Soldier.groundY(this.pos.x, this.pos.z, feet + 0.02, zomb) : 0;
      if (this.gy == null || dt > 0.5) this.gy = gy;
      else if (gy < this.gy - 0.5 && !this.fly && !this.dead && J.st !== 'prep') {   // off a ledge: fall from where you are
        J.y = Math.max(0, J.y) + this.gy - gy; this.gy = gy; J.fall = true;
        if (J.st !== 'air') { J.st = 'air'; J.t = 0; J.vy = 0; J.vy0 = Math.sqrt(2 * 9.81 * Math.max(0.3, J.y)); J.runAt = runNow; J.clipL = 0; }
      } else if (J.st === 'air' && gy > this.gy) {   // the floor came up under you in mid-air (a stair, a crate top)
        J.y = Math.max(0, J.y - (gy - this.gy)); this.gy = gy;
      } else this.gy = damp(this.gy, gy, 16, dt);
    }
    this.gyT = gy;
    this.pos.gy = gy + (J.fall ? Math.max(0, J.y) : 0);   // where the feet are, for collisions
    const lying = this.dead || this.act === 'Death_D' || this.act === 'Hit_Knockback' || this.act === 'LayToIdle' || this.act === 'Fixing_Kneeling';
    this.liftK = damp(this.liftK || 0, lying ? this.liftNeed || 0 : 0, lying ? 9 : 4, dt);
    this.pivot.position.y = J.y + this.gy + this.liftK;
    this.pivot.rotation.set(this.pitchLean * (1 - actTotal), this.yaw, this.lean * (1 - actTotal), 'YXZ');
    this.pivot.updateMatrixWorld(true);
    if (lying) {   // how far would the lowest part of the body be under the floor?
      const k = this.root.scale.y; let need = 0;
      for (const [n, r] of BODY_R) { const bn = this.B[n]; if (!bn) continue; bn.getWorldPosition(vLift); need = Math.max(need, r * k - (vLift.y - this.pivot.position.y + J.y)); }
      this.liftNeed = Math.min(0.35, need);
    } else this.liftNeed = 0;

    // ---- footsteps: heels land at phase 0.02 and 0.52 ----
    const loco = Math.max(1 - wi, ca * this.crouchW) * (1 - actTotal);
    const pp = this.prevPhase, ph = this.phase;
    const crossed = p => this.dir > 0 ? ((pp < p && ph >= p) || (pp > ph && (pp < p || ph >= p))) : ((pp > p && ph <= p) || (pp < ph && (ph <= p || pp > p)));
    // the shamble drags its right foot: that heel lands late in the cycle
    const SP = this.kind.zombie && running < 0.5 ? STEP_Z : STEP_H;
    if (this.onStep && loco > 0.25 && J.w < 0.5 && !this.fly) for (const [p, side] of SP) if (crossed(p)) this.onStep(this, { speed: s, run: running, crouch: this.crouchW, side });

    if (this.frozen) return { s, running, wi, actTotal };
    // ---- a body on the floor: its own way of lying there ----
    const DD = this.act === 'Hit_Knockback' ? this.acts.Hit_Knockback : this.acts.Death_D;
    if (lying && (this.dead || this.act === 'Death_D' || this.act === 'Hit_Knockback') && DD.w > 0.01) {
      const P = this.deadPose ||= { head: (Math.random() - 0.5) * 1.2, spine: (Math.random() - 0.5) * 0.4, armL: (Math.random() - 0.5) * 1.1, armR: (Math.random() - 0.5) * 1.1, foreL: Math.random() * 0.9, foreR: Math.random() * 0.9, legL: (Math.random() - 0.3) * 0.45, legR: (Math.random() - 0.3) * 0.45 };
      const kk = DD.w * smooth(0.25, 0.9, DD.t / DD.dur), B = this.B;
      const ax = (a, b) => { a.getWorldPosition(va); b.getWorldPosition(vb); return vc.copy(vb).sub(va).normalize(); };
      if (kk > 0.001) {
        if (B.Spine && B.Spine2) addTurn(B.Spine2, ax(B.Spine, B.Spine2), P.spine * kk);
        if (B.Neck && B.Head) addTurn(B.Head, ax(B.Neck, B.Head), P.head * kk);
        // arms and legs swing along the floor (round the up axis) and the elbows bend a little
        addTurn(B.LeftArm, UP, P.armL * kk); addTurn(B.RightArm, UP, P.armR * kk);
        if (B.LeftForeArm) addTurn(B.LeftForeArm, UP, P.foreL * kk); if (B.RightForeArm) addTurn(B.RightForeArm, UP, -P.foreR * kk);
        addTurn(B.LeftUpLeg, UP, P.legL * kk); addTurn(B.RightUpLeg, UP, -P.legR * kk);
      }
      // a twitch (a body that's about to get back up as one of them)
      if (this.spasm > 0 && B.Spine2) {
        this.spasm = Math.max(0, this.spasm - dt * 2.2);
        const j = Math.sin(this.spasm * 38) * this.spasm;
        addTurn(B.Spine2, ax(B.Spine, B.Spine2).cross(UP).normalize(), j * 0.22);
        if (B.Head) addTurn(B.Head, UP, j * 0.3);
      }
    } else if (!lying && !this.dead) this.deadPose = null;
    // ---- upper body: twist and bend to the aim ----
    const cw = this.combatW * (1 - actTotal);
    this.twist = clamp(wrapPi(this.aimYaw - this.yaw), -1.6, 1.6) * cw;
    this.pitchNow = clamp(this.aimPitch, -1.1, 1.1) * cw;
    const B = this.B;
    if (cw > 0.001) {
      const tw = this.twist * (1 - this.upW * 0.6);
      addTurn(B.Spine, UP, tw * 0.25); addTurn(B.Spine1, UP, tw * 0.3); addTurn(B.Spine2, UP, tw * 0.3);
      this.left.set(Math.cos(this.aimYaw), 0, -Math.sin(this.aimYaw));
      const p = this.pitchNow * (1 - this.upW);
      addTurn(B.Spine1, this.left, -p * 0.3 + 0.06 * cw); addTurn(B.Spine2, this.left, -p * 0.35 + 0.05 * cw);
    }
    // ---- head ----
    let lookT = 0, lookP = 0;
    if (cw > 0.3) { lookT = clamp(wrapPi(this.aimYaw - this.yaw) - this.twist * 0.85, -0.6, 0.6); lookP = this.pitchNow * 0.45; }
    else if (this.lookAt) {
      const dx = this.lookAt.x - this.pos.x, dz = this.lookAt.z - this.pos.z;
      lookT = clamp(wrapPi(Math.atan2(dx, dz) - this.yaw), -1.1, 1.1);
      lookP = clamp(Math.atan2((this.lookAt.y ?? 1.6) - 1.6, Math.max(0.5, Math.hypot(dx, dz))), -0.45, 0.4);
    } else if (this.speed > 0.3) lookT = clamp(wrapPi(this.moveA - this.yaw) * 0.5, -0.6, 0.6) * (this.dir > 0 ? 1 : 0);
    const headFree = 1 - actTotal * 0.8;
    this.look = damp(this.look, lookT * headFree, 6, dt);
    this.lookP = damp(this.lookP, lookP * headFree, 6, dt);
    addTurn(B.Neck, UP, this.look * 0.4); addTurn(B.Head, UP, this.look * 0.6);
    this.left.set(Math.cos(this.yaw + this.twist + this.look), 0, -Math.sin(this.yaw + this.twist + this.look));
    addTurn(B.Head, this.left, ((ww * 0.05 + wr * 0.08)) * lw * (1 - cw) - this.lookP);

    // ---- face: blinking, mouth while talking or hurt ----
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blink = 0.0001; this.blinkT = 1.8 + Math.random() * 4.5; }
    if (this.blink > 0) { this.blink += dt; if (this.blink > 0.16) this.blink = 0; }
    const bv = this.dead ? 0.7 : this.blink > 0 ? Math.sin(this.blink / 0.16 * Math.PI) : 0;
    this.setMorph(['eyeBlinkLeft', 'eyeBlinkRight', 'eyesClosed'], bv);
    // eyes: no blink shapes on this face (eyes as separate pieces on their own bones) — the eyeballs close up
    // for the blink instead; and the eyes dart about a little, toward what the head is turned to
    if (this.hasBlink === undefined) this.hasBlink = this.morphs.some(m => m.morphTargetDictionary.eyeBlinkLeft !== undefined || m.morphTargetDictionary.eyesClosed !== undefined);
    if (B.LeftEye && B.RightEye && !this.frozen) {
      this.sacT = (this.sacT ?? 0) - dt;
      if (this.sacT <= 0) { this.sacT = 0.4 + Math.random() * 2.2; this.sacY = (Math.random() - 0.5) * 0.5; this.sacP = (Math.random() - 0.5) * 0.16; }
      this.eyeY = damp(this.eyeY || 0, this.dead ? 0 : clamp(this.sacY + this.look * 0.5, -0.26, 0.26), 30, dt);
      this.eyeP = damp(this.eyeP || 0, this.dead ? 0 : this.sacP, 30, dt);
      for (const e of [B.LeftEye, B.RightEye]) {
        if (!e.userData.q0) e.userData.q0 = e.quaternion.clone(); else e.quaternion.copy(e.userData.q0);   // (no track drives the eyes: never let the turn pile up)
        addTurn(e, UP, this.eyeY); addTurn(e, this.left, -this.eyeP);
        if (!this.hasBlink) e.scale.y = this.dead ? 0.15 : 1 - 0.9 * bv; else if (e.scale.y !== 1) e.scale.y = 1;
      }
    }
    if (this.talkT > 0) { this.talkT -= dt; const t = this.talkT; this.mouth = damp(this.mouth, Math.max(0, Math.sin(t * 13) * 0.6 + Math.sin(t * 7.3) * 0.4) * 0.5 * this.talkK, 22, dt); }
    else this.mouth = damp(this.mouth, 0, 10, dt);
    this.setMorph(['jawOpen', 'mouthOpen'], this.mouth);
    return { s, running, wi, actTotal };
  }
  stepAct(c, n, dt, full) {
    if (c.w <= 0 && c.target <= 0) { if (c.a.weight !== 0) c.a.setEffectiveWeight(0); return 0; }
    const o = c.opt, end = o.to ?? c.dur;
    if (c.target > 0) {
      c.t += dt * (o.rate || 1);
      if (o.loop) { const st = o.from || 0; if (c.t >= end) c.t = st + (c.t - st) % Math.max(0.01, end - st); }
      else if (c.t >= end) {
        c.t = end;
        if (!o.hold) {
          if (full && this.act === n) { this.act = null; c.target = 0; c.fade = o.fadeOut || 0.3; }
          if (!full && this.up === n) { this.up = null; c.target = 0; c.fade = o.fadeOut || 0.2; }
        }
      }
      if (o.fadeAt != null && c.t >= o.fadeAt) { c.target = 0; c.fade = o.fadeOut || 0.25; if (full && this.act === n) this.act = null; if (!full && this.up === n) this.up = null; }
    }
    c.w = clamp(c.w + (c.target > 0 ? dt : -dt) / Math.max(0.01, c.fade), 0, 1);
    const tt = o.reverse ? (end - c.t + (o.from || 0)) : c.t;
    c.a.time = clamp(tt, 0, c.dur - 0.001);
    return c.w;
  }
  setMorph(names, v) {
    for (const m of this.morphs) for (const n of names) { const i = m.morphTargetDictionary[n]; if (i !== undefined) m.morphTargetInfluences[i] = v; }
  }

  // ---- hands on a weapon: two-bone IK for each arm, then the hand turned to wrap the grip ----
  // targets: { R: {p, f, s}, L: {p, f, s} } in world space (p: palm point, f: finger direction, s: index-side direction)
  // T.blend: a weight under 1 really blends (part-way to the target); without it the old behaviour stays
  reach(side, T, w) {
    if (!T || w < 0.01) return;
    const B = this.B, P = side > 0 ? 'Right' : 'Left';
    const up = B[P + 'Arm'], lo = B[P + 'ForeArm'], hand = B[P + 'Hand'], mid = B[P + 'HandMiddle1'];
    // the wrist goes a little behind the palm point, against the finger direction
    const tgt = vIK.copy(T.p).addScaledVector(T.f, -0.075);
    up.getWorldPosition(pa); lo.getWorldPosition(pb); hand.getWorldPosition(pc);
    const l1 = pa.distanceTo(pb), l2 = pb.distanceTo(pc);
    const dvec = pd.copy(tgt).sub(pa); let dist = dvec.length();
    if (dist < 1e-4) return;
    const dn = dvec.divideScalar(dist); dist = clamp(dist, Math.abs(l1 - l2) + 0.01, (l1 + l2) * 0.999);
    const cosA = clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
    // elbows down and out
    const pole = pe.set(0, -1, 0).addScaledVector(this.left.set(Math.cos(this.yaw + this.twist), 0, -Math.sin(this.yaw + this.twist)), side > 0 ? -0.55 : 0.55).addScaledVector(T.f, -0.3);
    pole.addScaledVector(dn, -pole.dot(dn)); if (pole.lengthSq() < 1e-6) pole.set(0, -1, 0); pole.normalize();
    const elbow = pf.copy(pa).addScaledVector(dn, l1 * cosA).addScaledVector(pole, l1 * sinA);
    aimBone(up, lo, pg.copy(elbow).sub(pa), w, !!T.blend);
    lo.getWorldPosition(pb);
    aimBone(lo, hand, pg.copy(tgt).sub(pb), w, !!T.blend);
    // turn the hand
    hand.getWorldPosition(pc); mid.getWorldPosition(pb);
    const fCur = pb.sub(pc);
    const idx = B[P + 'HandIndex1'], pin = B[P + 'HandPinky1'];
    if (idx && pin) {
      idx.getWorldPosition(pa); pin.getWorldPosition(pd);
      const sCur = pa.sub(pd);
      orientBone(hand, fCur, sCur, T.f, T.s, w, !!T.blend);
    }
    this.curlFingers(side, T.curl ?? 1, w, T.trigger);
  }
  // fingers curl into a fist / round a handle (without moving the arm)
  curlFingers(side, curl = 1, w = 1, trigger = false) {
    if (curl <= 0) return;
    const B = this.B, P = side > 0 ? 'Right' : 'Left';
    const hand = B[P + 'Hand'], mid = B[P + 'HandMiddle1'], idx = B[P + 'HandIndex1'], pin = B[P + 'HandPinky1'];
    if (!hand || !mid || !idx || !pin) return;
    hand.getWorldPosition(pc); mid.getWorldPosition(pb);
    const fNow = pb.sub(pc).normalize();
    idx.getWorldPosition(pa); pin.getWorldPosition(pd);
    const sNow = pa.sub(pd).normalize();
    const axis = pe.copy(sNow).multiplyScalar(side > 0 ? 1 : -1);
    for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) {
      const trig = side > 0 && f === 'Index' && trigger;
      for (let j = 1; j <= 3; j++) {
        const b = B[P + 'Hand' + f + j];
        if (b) addTurn(b, axis, (trig ? (j === 1 ? 0.35 : 0.5) : j === 1 ? 0.95 : 0.9) * curl * w);
      }
    }
    const th = B[P + 'HandThumb2'];
    if (th) addTurn(th, pg.copy(fNow).multiplyScalar(side > 0 ? 1 : -1), 0.3 * curl * w);
  }
}
const vIK = new THREE.Vector3(), pa = new THREE.Vector3(), pb = new THREE.Vector3(), pc = new THREE.Vector3(), pd = new THREE.Vector3(), pe = new THREE.Vector3(), pf = new THREE.Vector3(), pg = new THREE.Vector3();
