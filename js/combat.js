// human-WAR — what happens when a weapon goes off: the shot (with spread, falloff and headshots), tracers,
// brass, impacts, bullets cracking past heads, grenades bouncing and cooking off, rockets with back-blast,
// explosions that throw people, and soldiers dying and dropping their guns.
import * as THREE from 'three';
import { C, emit } from './state.js';
import { WEAPONS, makeWeaponMesh } from './weapons.js';
import { clamp, lerp, wrapPi } from './soldier.js';
import { hurtNPC } from './people.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const tA = V(), tB = V(), tC = V(), tD = V(), tE = V();
const UP = new THREE.Vector3(0, 1, 0);

// ---------------------------------------------------------------- where a soldier can be hit
// spheres along the body, refreshed once a frame. Each is [bone, radius, part, child, t]: the centre sits t of the
// way from the bone to its child (so the middle of a forearm or a shin is covered, not just the joints)
const PARTS = [['Head', 0.125, 'head'], ['Neck', 0.075, 'body', 'Head', 0.6], ['Spine2', 0.2, 'body'], ['Spine1', 0.19, 'body'], ['Hips', 0.18, 'body']];
for (const sd of ['Left', 'Right']) PARTS.push(
  [sd + 'UpLeg', 0.12, 'legs', sd + 'Leg', 0.5], [sd + 'Leg', 0.1, 'legs'], [sd + 'Leg', 0.09, 'legs', sd + 'Foot', 0.5], [sd + 'Leg', 0.08, 'legs', sd + 'Foot', 0.82],
  [sd + 'Foot', 0.075, 'legs', sd + 'ToeBase', 0.45],
  [sd + 'Arm', 0.075, 'arms'], [sd + 'Arm', 0.065, 'arms', sd + 'ForeArm', 0.5], [sd + 'ForeArm', 0.07, 'arms'], [sd + 'ForeArm', 0.06, 'arms', sd + 'Hand', 0.5], [sd + 'Hand', 0.055, 'arms', sd + 'HandMiddle1', 0.5],
  // the gaps the first set left: shoulder caps, elbows, fingers, the upper inner thigh, toes and heels
  [sd + 'Shoulder', 0.08, 'body', sd + 'Arm', 0.7], [sd + 'Arm', 0.07, 'arms', sd + 'ForeArm', 0.92], [sd + 'Hand', 0.05, 'arms', sd + 'HandMiddle1', 1.6],
  [sd + 'UpLeg', 0.12, 'legs', sd + 'Leg', 0.15], [sd + 'Foot', 0.07, 'legs', sd + 'ToeBase', 1.0], [sd + 'Foot', 0.06, 'legs', sd + 'ToeBase', -0.35]);
const HEAD_OFF = new THREE.Vector3(0, 0.085, 0.025), tQ = new THREE.Quaternion(), tF = new THREE.Vector3();
export function refreshHitShapes(u) {
  if (!u.sph) u.sph = PARTS.map(() => ({ c: V(), r: 0, part: '' }));
  const B = u.s.B, k = u.sizeK || 1;
  // the whole body's matrices brought up to date once (not a walk up the bone chain for every sphere)
  (u.s.pivot || u.s.root).updateMatrixWorld(true);
  for (let i = 0; i < PARTS.length; i++) {
    const [b, r, part, ch, t] = PARTS[i], S = u.sph[i], bone = B[b];
    S.r = r * k; S.part = part;
    if (!bone) { S.r = 0; continue; }
    S.c.setFromMatrixPosition(bone.matrixWorld);
    if (i === 0) { bone.matrixWorld.decompose(tD, tQ, tF); S.c.add(tE.copy(HEAD_OFF).multiplyScalar(k).applyQuaternion(tQ)); continue; }   // the skull sits above and in front of the head joint, and tilts with it
    if (ch && B[ch]) { tE.setFromMatrixPosition(B[ch].matrixWorld); S.c.lerp(tE, t); }
  }
  u.chest = u.chest || V(); u.chest.copy(u.sph[2].c);
  u.head = u.head || V(); u.head.copy(u.sph[0].c);
  u.bound = u.bound || V(); u.bound.copy(u.sph[3].c);
  u.sphT = C.t;
}
// the point on a hit sphere's surface facing from (where a blade or bat actually meets the body)
export function sphereSurface(S, from, out = V()) { out.subVectors(from, S.c); const l = out.length() || 1; return out.multiplyScalar(Math.min(S.r, l) / l).add(S.c); }
function raySphere(o, d, c, r) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z, cc = ox * ox + oy * oy + oz * oz - r * r;
  const h = b * b - cc; if (h < 0) return -1;
  const t = -b - Math.sqrt(h); return t > 0 ? t : -1;
}
export function rayUnits(o, d, maxT, skip = null, filter = null) {
  let best = maxT, hu = null, part = null, hs = null;
  const test = (u) => {
    if (u === skip || !u.sph) return;
    // being drawn doesn't decide whether a zombie is solid (culled behind the camera, it's still there); and a body
    // that has just gone down still stops shots for a few seconds while it falls (blood, no damage)
    if (u.zombie ? !u.active : !u.s.visible) return;
    if (!u.alive) { if (!(u.zombie && C.t - (u.deadAt || 0) < 3)) return; if (u.sphT !== C.t) refreshHitShapes(u); }
    if (filter && !filter(u)) return;
    // quick reject against a 1.2 m sphere round the body
    const bk = u.sizeK > 1.3 ? u.sizeK : 1;   // [boss] (a mini boss, a boss, The Zombie: the round-the-body test grows with it)
    const bt = raySphere(o, d, u.bound, 1.25 * bk);
    if (bt < 0 && tA.copy(o).sub(u.bound).lengthSq() > 1.6 * bk * bk) return;
    for (const S of u.sph) { if (S.r <= 0) continue; const t = raySphere(o, d, S.c, S.r); if (t > 0 && t < best) { best = t; hu = u; part = S.part; hs = S; } }
  };
  for (const u of C.units) test(u);
  // the townspeople and survivors have bodies too: a shot or a thrown bottle stops in them, it doesn't pass through
  if (C.npcs) for (const u of C.npcs) {
    if (u === skip || !u.alive || u.hidden || u.gone || !u.s.visible) continue;
    if (Math.abs(u.s.pos.x - o.x) > maxT + 2 || Math.abs(u.s.pos.z - o.z) > maxT + 2) continue;
    if (u.sphT !== C.t || !u.sph) refreshHitShapes(u);
    test(u);
  }
  return hu ? { t: best, unit: hu, part, sph: hs } : null;
}

// ---------------------------------------------------------------- firing
let shotN = 0;
const jit = (d, s, out) => {
  // a random direction inside a cone of half-angle ~s round d
  const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * s;
  const ax = tC.set(d.z, 0, -d.x); if (ax.lengthSq() < 1e-6) ax.set(1, 0, 0); ax.normalize();
  const ay = tD.crossVectors(d, ax).normalize();
  return out.copy(d).addScaledVector(ax, Math.cos(a) * r).addScaledVector(ay, Math.sin(a) * r).normalize();
};
// the real cone a shot leaves in (radians): main.js's crosshair should use this too, so the gap never lies.
// Moving and hip fire open it, crouching tightens it, fast follow-up shots bloom it (A.heat, weapons.js), and a
// scope only steadies a rifle you're holding still.
export function spreadOf(u) {
  const A = u.arms, W = A.W, moving = Math.min(1, u.s.speed / 3), crouch = u.s.crouchW > 0.5;
  let s;
  if (W.scope && A.aimW > 0.9 && u.isPlayer) s = W.aim * (1 + moving * 25) * (crouch ? 0.6 : 1);
  else s = lerp(W.hip, W.aim, A.aimW) * (1 + moving * (u.isPlayer ? 1.5 : 1)) * (crouch ? 0.7 : 1);
  if (W.auto) s += Math.min(0.025, (A.burst || 0) * 0.0018) * (A.aimW > 0.5 ? 0.6 : 1);
  s += Math.min(W.auto ? 0.025 : 0.02, A.heat || 0);
  return s;
}
// u fires its current weapon at the world point aim
export function fire(u, aim, { spreadMul = 1 } = {}) {
  const A = u.arms, W = A.W;
  const mz = A.muzzle(V());
  // hugging a wall: the muzzle can poke through it, so the shot starts from the chest side of the wall
  const chest = tA.copy(u.chest || u.s.pos).setY((u.chest ? u.chest.y : 1.3));
  const back = tB.subVectors(mz, chest); const bl = back.length();
  if (bl > 0.05) { back.divideScalar(bl); const h = C.world.ray(chest, back, bl); if (h) mz.copy(chest).addScaledVector(back, Math.max(0, h.t - 0.05)); }
  const dir = V().subVectors(aim, mz); if (dir.lengthSq() < 1e-6) dir.set(Math.sin(u.s.aimYaw), 0, Math.cos(u.s.aimYaw)); dir.normalize();
  const spread = spreadOf(u) * spreadMul;
  C.stats && u.isPlayer && C.stats.shots++;
  if (W.rocket) {
    spawnRocket(u, mz, jit(dir, spread, V()));
    const back2 = V().copy(dir).negate();
    C.fx.backblast(V().copy(mz).addScaledVector(dir, -1.1), back2);
    C.fx.muzzle(mz, dir, 2.2);
  } else {
    const n = W.pellets || 1;
    // a shotgun's pellets that hit the same body land as one blow: one thump, one spray, one groan
    const agg = n > 1 ? new Map() : null; worldHits = 0;
    for (let i = 0; i < n; i++) shot(u, mz, jit(dir, spread, V()), W, i === 0, agg);
    if (agg) for (const [v, H] of agg) landHit(u, v, H.dmg, H.part, H.p, H.d, W, H.count);
    C.fx.muzzle(mz, dir, W.id === 'shotgun' ? 1.6 : W.id === 'sniper' ? 1.5 : W.id === 'pistol' ? 0.7 : 1, u.isPlayer || Math.random() < 0.5);
    // brass flies out to the right
    const g = A.gun;
    if (g && g.userData.eject && W.id !== 'shotgun' && W.id !== 'sniper') { const ep = V().copy(g.userData.eject).applyQuaternion(g.quaternion).add(g.position); const rd = V(-1, 0.4, -0.2).applyQuaternion(g.quaternion); C.fx.shell(ep, rd); }
  }
  C.SND.gun(W.snd, u.isPlayer ? null : mz);
  C.noises.push({ x: mz.x, z: mz.z, t: C.t, team: u.team, unit: u, loud: W.loud || 70 });
  shotN++;
}
const segClosest = (o, d, L, p) => { const t = clamp((p.x - o.x) * d.x + (p.y - o.y) * d.y + (p.z - o.z) * d.z, 0, L); return t; };
let worldHits = 0;
const PART_RANK = { head: 3, body: 2, arms: 1, legs: 1 };
function shot(u, o, d, W, first, agg = null) {
  const maxT = W.pellets ? W.range * 1.8 : W.range * 2.5;
  const wh = C.world.ray(o, d, maxT);
  let t = wh ? wh.t : maxT, hit = wh ? { kind: 'world', t, n: wh.n.clone(), mat: wh.mat, box: wh.box } : null;
  const uh = rayUnits(o, d, t, u);
  if (uh) { t = uh.t; hit = { kind: 'unit', t, unit: uh.unit, part: uh.part }; }
  const th = emit('rayTargets', o, d, t);
  if (th) { t = th.t; hit = { kind: 'target', t, target: th.target, local: th.local, n: th.n }; }
  // tracers: every third of yours, every other one of theirs
  const showTr = u.isPlayer ? (W.auto ? shotN % 3 === 0 : false) : Math.random() < 0.55;
  if (showTr && first) C.fx.tracer(V().copy(o).addScaledVector(d, 0.8), d, Math.max(0, t - 0.8), { w: u.isPlayer ? 0.8 : 1.1, len: u.team === 0 ? 3.5 : 4 });
  if (!hit) return;
  const p = V().copy(o).addScaledVector(d, t);
  if (hit.kind === 'world') {
    worldHits++;
    C.fx.impact(p, hit.n, hit.mat || 'dirt', W.id === 'sniper' ? 1.6 : W.pellets ? 0.5 : 1);
    if (W.pellets ? worldHits <= 2 : (first || Math.random() < 0.3)) C.SND.impact(p, hit.mat, W.pellets ? 0.6 : 1);
    if (hit.box) emit('hitBox', hit.box, W.dmg, u, p);
  } else if (hit.kind === 'unit') {
    const v = hit.unit;
    if (!v.alive) {   // a body still falling: it takes the round (blood, a wet thud), it doesn't die twice
      C.fx.blood(p, d, W.pellets ? 0.35 : 0.6); if (first || !W.pellets) C.SND.impact(p, hit.part === 'head' ? 'fleshHead' : 'flesh', 0.7);
      return;
    }
    // buckshot spreads and slows: worth little past ~40 m; bullets keep at least 55%
    const fall = W.pellets ? clamp(1 - (t - W.range * 0.4) / (W.range * 0.9), 0.1, 1) : clamp(1 - (t - W.range * 0.5) / (W.range * 1.5), 0.55, 1);
    const mult = hit.part === 'head' ? (W.id === 'sniper' ? 2.5 : 2.2) : hit.part === 'legs' ? 0.75 : hit.part === 'arms' ? 0.7 : 1;
    // the dead only really stop for a shot to the head
    const zm = v.zombie ? (hit.part === 'head' ? 4 : hit.part === 'legs' ? 0.6 : 0.55) : mult;
    const dmg = W.dmg * zm * fall;
    if (agg) {
      const H = agg.get(v);
      if (!H) agg.set(v, { dmg, part: hit.part, p, d: V().copy(d), count: 1 });
      else { H.dmg += dmg; H.count++; if ((PART_RANK[hit.part] || 0) > (PART_RANK[H.part] || 0)) { H.part = hit.part; H.p = p; } }
    } else landHit(u, v, dmg, hit.part, p, d, W, 1);
  } else if (hit.kind === 'target') {
    emit('hitTarget', hit.target, p, d, W, u, hit.local);
  }
}
// one body takes the shot (or a shotgun's pellets, summed): damage, blood and the sound of it, once
function landHit(u, v, dmg, part, p, d, W, count) {
  const amt = count > 1 ? Math.min(2.2, 0.5 + count * 0.2) : part === 'head' ? 1.6 : 1;
  if (v.npc) {   // one of the townspeople: they feel it, and they let you know
    hurtNPC(v, dmg, u, { shot: true, part, weapon: W.id, dir: d, point: p });   // (people.js: how they react, and who saw it)
    C.fx.blood(p, d, amt * 0.8);
    C.SND.impact(p, part === 'head' ? 'fleshHead' : 'flesh', Math.min(1.6, 0.6 + count * 0.12));
    if (u && u.isPlayer && C.events.hitmarker) emit('hitmarker', v, !v.alive, part === 'head');
    if (u && !u.isPlayer && v.alive && v.say && (!v.ffT || C.t - v.ffT > 3)) { v.ffT = C.t; v.say(FF_LINES[Math.floor(Math.random() * FF_LINES.length)], 2.5); v.st = 'flee'; v.t = 0; v.threat = u; }
    return;
  }
  damage(v, dmg, u, { dir: d, part, weapon: W.id, point: p, knock: count > 1 ? 0.12 * Math.min(3, count) : W.id === 'sniper' ? 0.5 : 0.08 });
  C.fx.blood(p, d, amt);
  C.SND.impact(p, part === 'head' ? 'fleshHead' : 'flesh', count > 1 ? Math.min(1.6, 0.6 + count * 0.12) : 1);
}
const FF_LINES = ["WHOA! It's me! Don't shoot!", 'Hey! HEY! I\'m not one of them!', 'Watch where you\'re shooting!', 'Stop! I\'m alive!'];

// a melee swing that meets no body: does the blade or bat meet a wall, a fence, a car door? (main.js meleeLand calls
// this on a whiff) — material-correct thud, chips or sparks, a jolt up your arms. Returns the hit, or null.
export function meleeWorld(from, yaw, reach, W) {
  const d = tC.set(Math.sin(yaw), -0.15, Math.cos(yaw)).normalize();
  const h = C.world.ray(from, d, reach + 0.2); if (!h) return null;
  const p = V().copy(from).addScaledVector(d, h.t), mat = h.mat || 'concrete';
  C.fx.impact(p, h.n, mat, W.heavy ? 0.9 : 0.6);
  if (W.blade && (mat === 'metal' || mat === 'barrel' || mat === 'concrete' || mat === 'brick' || mat === 'rock')) C.fx.sparks(p, W.heavy ? 14 : 8);
  C.SND.impact(p, mat, W.heavy ? 1.2 : 0.8);
  C.shake = Math.max(C.shake, 0.08);
  return { p, n: h.n, mat, box: h.box };
}

// ---------------------------------------------------------------- damage and death
export function damage(v, dmg, by, info = {}) {
  if (!v.alive || dmg <= 0) return;
  if (v.isPlayer && C.godMode) return;
  if (by && by.team === v.team && by !== v && !info.blast && !info.fire) return;
  v.hp -= dmg; v.hurtT = 0; v.lastHitBy = by; v.lastHitT = C.t;
  if (by && by.isPlayer && v !== by) { C.stats.hits++; emit('hitmarker', v, v.hp <= 0, info.part === 'head'); }
  if (v.isPlayer) emit('playerHurt', dmg, info, by);
  if (v.hp <= 0) { kill(v, by, info); return; }
  emit('hurt', v, dmg, by, info);
}
export function kill(v, by, info = {}) {
  if (!v.alive) return;
  v.alive = false; v.hp = 0; v.s.dead = true; v.deadT = 0; v.deaths++; v.deadAt = C.t; v.s.fallYaw = null;
  const S = v.s, DD = S.acts.Death_D, DDd = DD ? DD.dur : 3;
  // already on the ground (or still getting up): finish it where it lies — never pop it back up to fall again
  const down = S.act === 'Death_D' || S.act === 'Hit_Knockback' || !!(v.z && v.z.down > 0);
  const rising = S.act === 'LayToIdle' && S.acts.LayToIdle && S.actTime() < S.acts.LayToIdle.dur * 0.6;
  if (S.up && S.ups[S.up]) { S.ups[S.up].target = 0; S.up = null; }
  v.diedDown = down || rising;   // (already on the floor when it died: no fall, no thud)
  S.deathRate = 1;
  if (down) { if (S.act !== 'Death_D') S.play('Death_D', { hold: true, from: DDd - 0.05, fade: 0.3 }); }
  else if (rising) S.play('Death_D', { hold: true, from: DDd * 0.7, fade: 0.35 });
  else {
    const head = info.part === 'head' && !info.blast;
    S.resetActs();
    // a head shot drops them like a switch was turned off (fast, with a nerve twitch); a body shot staggers them over
    const rate = head ? lerp(1.35, 1.55, Math.random()) : lerp(0.95, 1.2, Math.random());
    S.play('Death_D', { hold: true, fade: head ? 0.06 : 0.1, rate }); S.deathRate = rate;
    if (head && v.zombie) S.spasm = 0.6;
    if (info.dir) {   // pushed the way the shot was going; the body turns toward falling away from it over the fall (no snap)
      const d = info.dir;
      S.vel.set(d.x * (info.blast ? 0 : 1.2), 0, d.z * (info.blast ? 0 : 1.2));
      const want = Math.atan2(-d.x, -d.z) + (Math.random() - 0.5) * 0.6;
      S.fallYaw = clearFall(S, S.yaw + clamp(wrapPi(want - S.yaw), -0.7, 0.7));   // soldier.js eases yaw toward it while dead
    }
  }
  if (info.fling) v.s.fly = info.fling;
  if (v.arms) { v.arms.throwT = -1; v.arms.reloadT = -1; v.arms.hideAll(); }
  if (by && by !== v) by.kills++;
  emit('kill', v, by, info);
}
// the body falls back (away from where it faces): if a wall, a table or a car is where it would land, try turning a
// little either way, then further, so it doesn't lie folded through the furniture
const FALL_TRY = [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, Math.PI];
function clearFall(S, yaw) {
  const Wd = C.world; if (!Wd || !Wd.ray) return yaw;
  const p = S.pos;
  for (const a of FALL_TRY) {
    const y = yaw + a; tD.set(-Math.sin(y), 0, -Math.cos(y));
    let ok = true;
    for (const h of [0.35, 0.8]) { tE.set(p.x, (p.gy ?? p.y ?? 0) + h, p.z); if (Wd.ray(tE, tD, 1.65)) { ok = false; break; } }
    if (ok) return y;
  }
  return yaw;
}
function dropGun(v) {
  const g = v.arms.drop(); if (!g) return;
  C.droppedGuns.push({ g, v: V().set((Math.random() - 0.5) * 1.5, 1 + Math.random(), (Math.random() - 0.5) * 1.5), w: V().set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6), t: 0, owner: v });
}
export function updateDropped(dt) {
  for (let i = C.droppedGuns.length - 1; i >= 0; i--) {
    const D = C.droppedGuns[i]; D.t += dt;
    if (!D.rest) {
      D.v.y -= 9.8 * dt; D.g.position.addScaledVector(D.v, dt);
      D.g.rotation.x += D.w.x * dt; D.g.rotation.y += D.w.y * dt; D.g.rotation.z += D.w.z * dt;
      if (D.g.position.y < 0.05) { D.g.position.y = 0.05; D.v.y *= -0.3; D.v.x *= 0.5; D.v.z *= 0.5; D.w.multiplyScalar(0.4); if (D.t > 0.25 && Math.abs(D.v.y) < 0.6) { D.rest = true; D.g.rotation.set(0, D.g.rotation.y, Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1)); D.g.position.y = 0.04; C.SND.mech('bounce', D.g.position); } }
    }
    if (!D.owner.arms.dropped) { C.droppedGuns.splice(i, 1); }   // picked back up on respawn
  }
}

// ---------------------------------------------------------------- explosions
export function explode(pos, power, owner, { weapon = 'grenade', silent = false } = {}) {
  const R = 7.5 * power;
  C.fx.explosion(pos, power, { mat: C.world.groundKind(pos.x, pos.z) });
  if (!silent) C.SND.explosion(pos, power);
  C.world.crater(pos.x, pos.z, 1.4 + power * 1.4);
  const from = V().copy(pos); from.y = Math.max(0.3, pos.y + 0.3);
  for (const u of C.units) {
    if (!u.alive) continue;
    const c = u.chest || u.s.pos;
    const d = c.distanceTo(pos);
    if (d > R) continue;
    if (d > 1.5 && !C.world.los(from, c)) continue;
    if (owner && u.team === owner.team && u !== owner && u.team !== 2) continue;   // your own side's blasts don't hurt your squad
    const k = Math.pow(1 - d / R, 1.25);
    const dir = V().subVectors(c, pos).setY(0).normalize();
    const sp = 3 + k * 8;
    damage(u, (WEAPONS[weapon]?.dmg || 160) * power * k, owner, { blast: true, dir, weapon, fling: { vx: dir.x * sp, vy: 2.5 + k * 5, vz: dir.z * sp }, point: c });
    if (u.alive && k > 0.2) u.s.playUp('Hit_Chest', { rate: 1.3, fade: 0.05, fadeAt: 0.5 });
  }
  // dead bodies near the blast get thrown too
  for (const u of C.units) {
    if (u.alive || u.s.fly) continue;
    const d = u.s.pos.distanceTo(pos); if (d > R * 0.6 || u.deadT > 8) continue;
    const k = 1 - d / (R * 0.6), dir = V().subVectors(u.s.pos, pos).setY(0).normalize();
    u.s.fly = { vx: dir.x * (2 + k * 6), vy: 1.5 + k * 4, vz: dir.z * (2 + k * 6) };
  }
  emit('explosion', pos, power, owner, R);
  // the camera feels it
  const P = C.player;
  if (P) { const d = (P.chest || P.s.pos).distanceTo(pos); C.shake = Math.max(C.shake, clamp(1.4 * power * (1 - d / 45), 0, 1.6)); C.flash = Math.max(C.flash, clamp(0.5 * (1 - d / 20), 0, 0.5)); }
  C.noises.push({ x: pos.x, z: pos.z, t: C.t, team: owner ? owner.team : -1, unit: owner, loud: 90 });
}

// ---------------------------------------------------------------- grenades
const gMeshes = [];
function grenadeMesh() {
  let m = gMeshes.find(x => !x.userData.busy);
  if (!m) { m = makeWeaponMesh('grenade'); C.scene.add(m); gMeshes.push(m); }
  m.userData.busy = true; m.visible = true; m.userData.ring.visible = false;
  return m;
}
export function throwGrenade(u, from, vel, fuse = 3.2) {
  const m = grenadeMesh();
  m.position.copy(from);
  C.grenades.push({ m, p: m.position, v: vel.clone(), fuse, owner: u, bounced: 0, w: V().set(Math.random() * 10, Math.random() * 10, Math.random() * 10) });
  C.SND.mech('spoon', from);
  emit('grenadeThrown', u, from, vel);
}
// velocity to land a grenade at target (lob), limited throw speed
export function lobVelocity(from, target, maxV = 17) {
  const dx = target.x - from.x, dz = target.z - from.z, dy = target.y - from.y, h = Math.hypot(dx, dz);
  const g = 9.8;
  // try a 35–50° arc that reaches; fall back to max range at 42°
  for (const ang of [0.6, 0.72, 0.85]) {
    const c = Math.cos(ang), s = Math.sin(ang);
    const denom = 2 * c * c * (h * Math.tan(ang) - dy);
    if (denom <= 0) continue;
    const v = Math.sqrt(g * h * h / denom);
    if (v <= maxV) return V().set(dx / h * c * v, s * v, dz / h * c * v);
  }
  const ang = 0.73; return V().set(dx / (h || 1) * Math.cos(ang) * maxV, Math.sin(ang) * maxV, dz / (h || 1) * Math.cos(ang) * maxV);
}
export function updateGrenades(dt) {
  for (let i = C.grenades.length - 1; i >= 0; i--) {
    const G = C.grenades[i];
    G.fuse -= dt;
    const sub = 3;
    for (let s = 0; s < sub; s++) {
      const h = dt / sub;
      G.v.y -= 9.8 * h; G.p.addScaledVector(G.v, h);
      if (G.p.y < 0.04) { G.p.y = 0.04; if (G.v.y < -1.5) bounce(G); G.v.y *= -0.32; G.v.x *= 0.62; G.v.z *= 0.62; }
      // walls
      for (const b of C.world.boxes) {
        if (b.pass || G.p.y > b.y1 || G.p.y < b.y0) continue;
        const dx = G.p.x - b.x, dz = G.p.z - b.z; if (dx * dx + dz * dz > (b.r + 0.3) ** 2) continue;
        const lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
        const px = b.hx + 0.04 - Math.abs(lx), pz = b.hz + 0.04 - Math.abs(lz), py = b.y1 + 0.04 - G.p.y;
        if (px <= 0 || pz <= 0) continue;
        const vlx = G.v.x * b.c - G.v.z * b.s, vlz = G.v.x * b.s + G.v.z * b.c;
        let nlx = vlx, nlz = vlz, nx = lx, nz = lz;
        if (py < px && py < pz && G.v.y < 0) { G.p.y = b.y1 + 0.04; G.v.y *= -0.3; G.v.x *= 0.6; G.v.z *= 0.6; bounce(G); continue; }
        if (px < pz) { nx = Math.sign(lx) * (b.hx + 0.04); nlx = -vlx * 0.35; } else { nz = Math.sign(lz) * (b.hz + 0.04); nlz = -vlz * 0.35; }
        G.p.x = b.x + nx * b.c + nz * b.s; G.p.z = b.z - nx * b.s + nz * b.c;
        G.v.x = nlx * b.c + nlz * b.s; G.v.z = -nlx * b.s + nlz * b.c;
        bounce(G);
      }
    }
    const sp = G.v.length();
    G.m.rotation.x += G.w.x * dt * Math.min(1, sp / 3); G.m.rotation.z += G.w.z * dt * Math.min(1, sp / 3);
    if (G.fuse <= 0) {
      C.grenades.splice(i, 1); G.m.visible = false; G.m.userData.busy = false;
      explode(V().copy(G.p).setY(Math.max(0.1, G.p.y)), 1, G.owner, { weapon: 'grenade' });
    }
  }
}
function bounce(G) { if (G.v.length() > 1.2) C.SND.mech('bounce', G.p); G.bounced++; }

// ---------------------------------------------------------------- rockets
let rMeshes = [];
const rD = new THREE.Vector3();
export function spawnRocket(u, from, dir) {
  let m = rMeshes.find(x => !x.userData.busy);
  if (!m) {
    m = new THREE.Group();
    const src = makeWeaponMesh('rpg').userData.rocketMesh;
    const rk = src.clone(true); rk.position.set(0, 0, 0); m.add(rk);
    C.scene.add(m); rMeshes.push(m);
  }
  m.userData.busy = true; m.visible = true; m.position.copy(from);
  C.rockets.push({ m, p: m.position, v: V().copy(dir).multiplyScalar(62), owner: u, life: 6, sndT: 0 });
}
export function updateRockets(dt) {
  for (let i = C.rockets.length - 1; i >= 0; i--) {
    const R = C.rockets[i];
    R.life -= dt;
    R.v.y -= 1.2 * dt;
    const step = R.v.length() * dt, d = rD.copy(R.v).normalize();
    let hitT = step, boom = false;
    const wh = C.world.ray(R.p, d, step); if (wh) { hitT = wh.t; boom = true; }
    const uh = rayUnits(R.p, d, hitT, R.owner); if (uh) { hitT = uh.t; boom = true; }
    const th = emit('rayTargets', R.p, d, hitT); if (th) { hitT = th.t; boom = true; }
    R.p.addScaledVector(d, hitT);
    R.m.lookAt(tB.copy(R.p).add(d));
    C.fx.rocketTrail(R.p, d);
    R.sndT -= dt; if (R.sndT <= 0) { R.sndT = 0.2; C.SND.rocketFly(R.p); }
    if (boom || R.life <= 0) {
      C.rockets.splice(i, 1); R.m.visible = false; R.m.userData.busy = false;
      if (uh) damage(uh.unit, 120, R.owner, { weapon: 'rpg', dir: d.clone(), part: 'body' });
      explode(V().copy(R.p).addScaledVector(d, -0.2), 1.25, R.owner, { weapon: 'rpg' });
    }
  }
}
