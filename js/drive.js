// Zombie_Apocalypse — getting about faster: bicycles left around town, and the parked cars (about half still have
// their keys in them). One vehicle at a time; the lead's main loop calls update() while you're in one.
//  - cars: arcade-realistic — engine through four gears, brakes, reverse, a handbrake that lets the back step out,
//    steering that gets lighter-handed with speed, wheels that steer and roll, a body that rolls and pitches on its
//    springs, brake and reversing lights, headlights at night. The body is a ring of circles pushed out of the
//    town's solid boxes (so it stops dead at a wall and glances off a corner); hit the dead and they go down.
//  - bikes: pedal up to ~7 m/s, coast (the freewheel ticks), lean into the turns, put a foot down when you stop.
//    You sit on the saddle: hands on the grips, feet on the pedals, the cranks turning with the back wheel.
//  - a car you leave somewhere new stays solid: pushBodies() keeps people and zombies out of it (and of the bikes).
// Sound is its own small Web Audio graph (an engine whose note follows the revs, road and tyre noise, the chain).
import * as THREE from 'three';
import { buildBike, bikeParked, makeDrivable, carSpec, setDoor } from './vehicles.js';
import { aimBone, addTurn, clamp, lerp, damp, wrapPi, smooth, dampAngle } from './soldier.js';
import { knockDown } from './zombies.js';

let E = null;                    // { scene, world, SND, fx, camera, damage, noise, Z, C }
export const bikes = [];         // { kind: 'bike', g, U, x, z, yaw, y, v, steer, lean, crank, spin, home }
export const cars = [];          // { kind: 'car', C, g, type, spec, keys, x, z, yaw, v, vs, steer, ..., home, moved }
let cur = null;                  // what you're in right now
const boxOwner = new Map();      // a parked car's static boxes → its entry here (so a car you ram gets shoved)
let rider = null;                // the player (P) while in it
const camT = { pos: new THREE.Vector3(), yaw: 0, dist: 6, height: 2, fov: 55, kind: null };
const tv = new THREE.Vector3(), tv2 = new THREE.Vector3(), tv3 = new THREE.Vector3(), tq = new THREE.Quaternion();
const UPV = new THREE.Vector3(0, 1, 0);
const rnd = (a, b) => a + Math.random() * (b - a);

// ---------------------------------------------------------------- setup
export function initDrive(env) {
  E = env;
  const W = E.world;
  // the world breaks things (fences, hedges, bins...) and needs the effects, the sounds and the dead's ears for it
  if (!W.fx) W.fx = E.fx; if (!W.SND) W.SND = E.SND; if (!W.onNoise && E.noise) W.onNoise = E.noise;
  // the cars you could drive: parked, whole, not the ambulance. Dale's pickup too, once it has fuel and you have its
  // keys (main.js: world.truck.fueled = true, and hasKeys() in this env or world.truck.keysIn = true)
  let n = 0;
  for (const C of W.cars) {
    if (C.wreck || C.burnt || C.ambulance || (C.escape && C !== W.truck)) continue;
    const spec = carSpec(C.type), b = C.box;
    const bo = (b.x - C.x) * Math.sin(C.yaw) + (b.z - C.z) * Math.cos(C.yaw);
    const V = { kind: 'car', C, g: C.g, type: C.type, spec, keys: C.police ? true : ((n * 7 + 3) % 11) < 5 || n === 1, x: C.x, z: C.z, yaw: C.yaw, y: 0,
      v: 0, vs: 0, steer: 0, roll: 0, pitch: 0, spin: 0, rpm: 900, hx: b.hx, hz: b.hz, bo, belt: b.y1, top: C.cab ? C.cab.y1 : b.y1 + 0.5,
      home: { x: C.x, z: C.z, yaw: C.yaw }, moved: false, live: null, hitT: 0, wantOut: false, truck: C === W.truck,
      orig: { x: C.x, z: C.z, yaw: C.yaw, bx: b.x, bz: b.z, cx: C.cab ? C.cab.x : 0, cz: C.cab ? C.cab.z : 0 } };
    if (V.truck) V.keys = false;
    // the trunk (a search spot) rides along with the car
    V.trunks = W.containers.filter(c => c.car === C).map(c => ({ c, ...toLocal(V, c.x, c.z), st: c.stand ? toLocal(V, c.stand.x, c.stand.z) : null, dy: c.yaw - C.yaw, sdy: c.stand ? c.stand.yaw - C.yaw : 0 }));
    cars.push(V); n++;
    boxOwner.set(b, V); if (C.cab) boxOwner.set(C.cab, V);
  }
  // bicycles: on driveways and lawns in front of the houses (one by your own front door), by the park, the store
  const BIKE_PAINT = [0x8a1a14, 0x1a3a7a, 0x2a5a2a, 0xb8b2a0, 0x1a1a1a, 0xc89a1a, 0x5a2a6a, 0x2a6a7a].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.45 }));
  const spots = [];
  const home = W.houses.find(H => H.x === -44 && H.z === 17);
  const byHouse = H => { const s = H.flip || 1; return [[s * -(H.hw - 2.4), H.hd + 2.6, Math.PI / 2 - 0.25], [s * (H.hw - 0.6), H.hd + 2.4, Math.PI / 2 + 0.3]].map(([lx, lz, ly]) => [H.x + lx * Math.cos(H.yaw) + lz * Math.sin(H.yaw), H.z - lx * Math.sin(H.yaw) + lz * Math.cos(H.yaw), H.yaw + ly]); };
  if (home) spots.push(...byHouse(home));
  spots.push([-13.5, -10.2, Math.PI / 2 + 0.2], [-26.5, -10.4, -Math.PI / 2], [26.5, -10.8, Math.PI / 2], [14.2, 10.6, 0.3]);
  for (const H of W.houses) if (H !== home && (Math.abs(H.x) === 68 || Math.abs(H.z) === 66 || H.x === -92)) spots.push(...byHouse(H).slice(0, 1));
  for (const [x, z, yaw] of spots) {
    if (bikes.length >= 9) break;
    if (!freeSpot(x, z, 0.55) || bikes.some(B => Math.hypot(B.x - x, B.z - z) < 3)) continue;
    const g = buildBike(BIKE_PAINT[bikes.length % BIKE_PAINT.length]); E.scene.add(g);
    const B = { kind: 'bike', g, U: g.userData, x, z, yaw, y: W.groundY(x, z, 0, true), v: 0, steer: 0, lean: 0, crank: rnd(0, 6), spin: 0, foot: 1, home: { x, z, yaw } };
    park(B); bikes.push(B);
  }
}
function freeSpot(x, z, r) {
  const W = E.world, p = { x, z, gy: 0 };
  W.collide(p, r); if (Math.hypot(p.x - x, p.z - z) > 0.02) return false;
  if (W.houseAt(x, z)) return false;
  for (const V of cars) if (inRect(V, x, z, r + 0.3)) return false;
  return true;
}
// a car's own frame: lx across (left +), lz along (front +)
function toLocal(V, x, z) { const dx = x - V.x, dz = z - V.z, c = Math.cos(V.yaw), s = Math.sin(V.yaw); return { lx: dx * c - dz * s, lz: dx * s + dz * c }; }
function toWorld(V, lx, lz, out = { x: 0, z: 0 }) { const c = Math.cos(V.yaw), s = Math.sin(V.yaw); out.x = V.x + lx * c + lz * s; out.z = V.z - lx * s + lz * c; return out; }
function inRect(V, x, z, pad = 0) { const { lx, lz } = toLocal(V, x, z); return Math.abs(lx) < V.hx + pad && Math.abs(lz - V.bo) < V.hz + pad; }
// a bike standing on its kickstand, leaning a little to the left
function park(B) {
  B.v = 0; B.lean = B.down ? 1.25 : -0.16; B.steer = B.down ? 0.5 : 0.35; B.pitch = 0; B.hopY = 0; B.hopV = 0;
  B.U.stand.rotation.set(0, 0, B.down ? -1.4 : 0);
  pose(B, 0);
  bikeParked(B.g, true);
}

// ---------------------------------------------------------------- what's there to get on / in (main.js context())
let lastP = null;
export function canUse(px, pz, P = null) {
  if (P) lastP = P;
  if (!E || cur) return null;
  let best = null, bd = 1.5;
  for (const B of bikes) { const d = Math.hypot(B.x - px, B.z - pz); if (d < bd) { bd = d; best = B; } }
  if (best) return { label: 'Ride the bicycle', sub: 'W pedal · S brake · A / D steer · Shift sprint · Space jump · E get off', go: () => enter(lastP || (E.getP && E.getP()), best) };
  bd = 1.35;
  for (const V of cars) {
    if (V.C.hidden || (V.truck && !truckReady())) continue;   // (till then the truck is main.js's: fuel, keys, the escape)
    const door = toWorld(V, V.hx + 0.45, V.spec.cab.front + 0.35);
    const d = Math.hypot(door.x - px, door.z - pz); if (d < bd) { bd = d; best = V; }
  }
  if (!best) return null;
  const V = best, name = V.truck ? 'Dale\'s pickup' : V.C.police ? 'police cruiser' : V.type === 'suv' ? 'SUV' : V.type === 'pickup' ? 'pickup' : V.type === 'van' ? 'van' : 'car';
  if (V.truck) return { label: `Drive ${name}`, sub: 'tank full, keys in your hand · W / S drive · A / D steer · Space handbrake · E get out', go: () => enter(lastP || (E.getP && E.getP()), V) };
  if (!V.keys) return { label: 'Locked — no keys', sub: `the ${name}'s doors won't open`, locked: true, go: () => rattle(V) };
  return { label: `Drive the ${name}`, sub: 'the keys are in it · W / S drive · A / D steer · Space handbrake · E get out', go: () => enter(lastP || (E.getP && E.getP()), V) };
}

// Dale's truck: drivable once it's fuelled and you've got the keys
function truckReady() {
  const T = E && E.world && E.world.truck; if (!T || !T.fueled) return false;
  return E.hasKeys ? !!E.hasKeys() : !!T.keysIn;
}
// ---------------------------------------------------------------- getting in and out
export function enter(P, V) {
  if (!E || cur || !P) return false;
  if (!V) V = nearest(P.s.pos.x, P.s.pos.z);
  if (!V || (V.kind === 'car' && !V.keys && !(V.truck && truckReady()))) return false;
  rider = P; cur = V; V.wantOut = false; V.v = 0; V.vs = 0; V.exitHeld = true;
  const car = V.kind === 'car';
  if (car) {
    V.live = makeDrivable(V.g, V.type);
    V.C.box.off = true;   // its own static box would stop it moving (the cabin box goes off with it)
    V.moved = true; V.pv = null;
    V.engineT = -0.3; V.hitT = 0; V.noiseT = 0;
    sound('doorOpen', V);
  } else {
    V.down = false; V.foot = 1;
    bikeParked(V.g, false);
    sound('bikeOn', V);
  }
  P.s.vel.set(0, 0, 0); P.s.speed = 0;
  P.s.resetActs && P.s.resetActs();
  // walk the last step to the door, open it, climb in, pull it shut (or swing a leg over the bike, kick the stand up)
  const d = doorPt(V);
  V.anim = { t: 0, dur: car ? 1.0 : 0.5, dir: 1, sx: P.s.pos.x, sz: P.s.pos.z, dx: d.x, dz: d.z, lean0: V.lean, steer0: V.steer };
  camT.yaw = V.yaw; camT.kind = V.kind;
  return true;
}
// where you stand to get in: by the driver's door, or beside the bike
function doorPt(V) { return V.kind === 'car' ? toWorld(V, V.hx + 0.5, V.spec.cab.front + 0.25) : toWorld(V, 0.55, -0.1); }
// out of it. force: no checks and no animation (death, new game, thrown off). Returns true when you're out.
export function exit(P = rider, force = false) {
  if (!cur) return true;
  const V = cur;
  if (V.anim && !force) return false;
  if (!force && Math.abs(V.v) > (V.kind === 'car' ? 2.2 : 3)) { V.wantOut = true; return false; }   // slow down first (it brakes for you)
  const W = E.world;
  // step out by the door (or the other side, or behind) — wherever there's room
  const car = V.kind === 'car', cf = car ? V.spec.cab.front : 0;
  const tries = car
    ? [[V.hx + 0.55, cf + 0.3], [V.hx + 0.55, 0], [V.hx + 0.9, cf + 0.3], [-(V.hx + 0.55), cf + 0.3], [-(V.hx + 0.55), 0], [0, V.bo - V.hz - 0.6], [0, V.bo + V.hz + 0.6]]
    : [[0.55, -0.1], [-0.55, -0.1], [0, -1.2], [0, 1.2]];
  let at = null;
  for (const r of [0.33, 0.26]) {
    for (const [lx, lz] of tries) {
      const w = toWorld(V, lx, lz), p = { x: w.x, z: w.z, gy: 0 };
      W.collide(p, r);
      if (Math.hypot(p.x - w.x, p.z - w.z) < 0.12 && !(car && inRect(V, p.x, p.z, 0.2)) && !W.houseAt(p.x, p.z)) { at = p; break; }
    }
    if (at) break;
  }
  if (!at && !force) {
    V.wantOut = false;
    if (!(V.noRoomT > (E.C ? E.C.t : 0))) { V.noRoomT = (E.C ? E.C.t : 0) + 2; if (E.think) E.think(car ? 'No room to open the door.' : 'No room to get off here.', 2); sound('rattle', V); }
    return false;
  }
  if (!at) { const w = toWorld(V, V.hx + 0.6, 0); at = { x: w.x, z: w.z }; }
  if (force) { finishExit(V, P, at); return true; }
  // animated: switch off, open the door, climb out, shut it
  V.v = V.vs = 0; V.wantOut = false;
  if (car) { sound('stop', V); sound('doorOpen', V); }
  else sound('bikeOff', V);
  stopLoops();
  V.anim = { t: 0, dur: car ? 1.0 : 0.5, dir: -1, dx: at.x, dz: at.z, at, lean0: V.lean, steer0: V.steer };
  return false;
}
function finishExit(V, P, at) {
  const W = E.world;
  if (V.kind === 'car') {
    V.v = V.vs = 0; V.live.tail.emissiveIntensity = 0; V.live.rev.emissiveIntensity = 0; if (V.live.head) V.live.head.emissiveIntensity = 0;
    headlight(null);
    for (const D of V.live.doors || []) setDoor(D, 0);
    settle(V);
    if (!V.anim) { sound('stop', V); sound('door', V); }
    unseatPassenger(V, at);
  } else { V.v = 0; park(V); if (!V.anim) sound('bikeOff', V); }
  V.anim = null;
  stopLoops();
  for (const O of cars) if (O.pv) { O.pv = null; settle(O); }   // a car you shoved: left where it got to
  if (P) {
    const s = P.s;
    s.place(at.x, at.z, V.yaw, W.groundY(at.x, at.z, 0, false));
    s.pivot.rotation.set(0, V.yaw, 0);
  }
  cur = null; rider = null;
}
// getting in / out, one frame of it: the door swings on its hinge, the rider moves between the kerb and the seat
const TS = new THREE.Vector3(), TQ = new THREE.Quaternion();
function animStep(V, dt) {
  const A = V.anim, car = V.kind === 'car', s = rider.s, ent = A.dir > 0;
  A.t += dt; const k = Math.min(1, A.t / A.dur);
  // m: 0 = standing by the door, 1 = sat in the seat
  const m = ent ? smooth(0.25, 0.78, k) : 1 - smooth(0.12, 0.62, k);
  if (car) {
    const open = ent ? smooth(0, 0.28, k) * (1 - smooth(0.7, 0.94, k)) : smooth(0, 0.25, k) * (1 - smooth(0.72, 0.96, k));
    if (V.live.doors && V.live.doors[0]) setDoor(V.live.doors[0], open);
    if (!A.slam && k > (ent ? 0.9 : 0.93)) { A.slam = true; sound('door', V); }
    carLook(V, dt, {});
  } else {
    const up = ent ? smooth(0.35, 0.9, k) : 1 - smooth(0.1, 0.6, k);   // the kickstand: 0 down, 1 kicked up
    V.U.stand.rotation.set(0, 0, -1.4 * up);
    const e = smooth(0, 1, k);
    V.lean = lerp(A.lean0, ent ? -0.13 : -0.16, e); V.steer = lerp(A.steer0, ent ? 0 : 0.35, e);
    pose(V, dt);
  }
  // standing: walking the last step to the door (getting in), or at the spot you step out to
  const e0 = smooth(0, 0.25, k), px = ent ? lerp(A.sx, A.dx, e0) : A.dx, pz = ent ? lerp(A.sz, A.dz, e0) : A.dz;
  const gy = E.world.groundY(px, pz, 0, false), face = wrapPi(V.yaw - Math.PI / 2);
  if (m > 0.001) {
    V.out = car ? 1 - m : 0;   // half in: sat sideways on the seat edge, feet still out on the road
    seat(V, dt); V.out = 0;
    if (m < 0.999) { s.pivot.position.lerpVectors(TS.set(px, gy, pz), s.pivot.position, m); s.pivot.updateMatrixWorld(true); }
  } else {
    s.pivot.position.set(px, gy, pz); s.pos.gy = gy;
    s.yaw = s.aimYaw = s.moveA = ent ? face : V.yaw; s.pivot.rotation.set(0, s.yaw, 0);
  }
  if (k >= 1) {
    if (ent) { V.anim = null; if (car) { V.engineT = -0.3; sound('start', V); } }
    else finishExit(V, rider, A.at);
  }
}
// a car left where it now stands: back where it started → its own box comes back on; anywhere else → pushBodies
// keeps it solid (and if the world can move boxes, its boxes go with it so shots and sight lines stop at it too)
function settle(V) {
  const W = E.world, C = V.C, h = V.home;
  C.x = V.x; C.z = V.z; C.yaw = V.yaw;
  if (Math.hypot(V.x - h.x, V.z - h.z) < 0.25 && Math.abs(wrapPi(V.yaw - h.yaw)) < 0.06) { V.moved = false; C.box.off = false; return; }
  if (W.moveBox) {
    const fx = Math.sin(V.yaw), fz = Math.cos(V.yaw), co = C.cab ? ((C.cab.x - h.x) * Math.sin(h.yaw) + (C.cab.z - h.z) * Math.cos(h.yaw)) : 0;
    W.moveBox(C.box, V.x + fx * V.bo, V.z + fz * V.bo, V.yaw);
    if (C.cab) W.moveBox(C.cab, V.x + fx * co, V.z + fz * co, V.yaw);
    C.box.off = false; V.moved = false; V.home = { x: V.x, z: V.z, yaw: V.yaw };
  }
}
function nearest(px, pz) {
  let best = null, bd = 1.6;
  for (const B of bikes) { const d = Math.hypot(B.x - px, B.z - pz); if (d < bd) { bd = d; best = B; } }
  if (best) return best;
  for (const V of cars) { if (V.C.hidden || (V.truck && !truckReady())) continue; const door = toWorld(V, V.hx + 0.45, V.spec.cab.front + 0.35), d = Math.hypot(door.x - px, door.z - pz); if (d < bd) { bd = d; best = V; } }
  return best;
}
// ---------------------------------------------------------------- a passenger (Ben): rides up front beside you
export const bike = () => !!cur && cur.kind === 'bike';
export function seatPassenger(u) {
  const V = cur; if (!V || V.kind !== 'car' || V.pass || V.anim || !u || !u.s) return false;
  V.pass = u; u.gone = true; u.hidden = true; if (u.mel) u.mel.hideAll();
  u.s.place(V.x, V.z, V.yaw, V.y); u.s.setVisible(true);
  sound('door', V);
  return true;
}
function unseatPassenger(V, at) {
  const u = V.pass; if (!u) return; V.pass = null;
  const W = E.world, w = toWorld(V, -(V.hx + 0.55), V.spec.cab.front + 0.3), p = { x: w.x, z: w.z, gy: 0 };
  W.collide(p, 0.33);
  if (Math.hypot(p.x - w.x, p.z - w.z) > 0.15 || inRect(V, p.x, p.z, 0.2) || W.houseAt(p.x, p.z)) { p.x = at.x + Math.sin(V.yaw) * 0.8; p.z = at.z + Math.cos(V.yaw) * 0.8; }
  u.s.place(p.x, p.z, V.yaw, W.groundY(p.x, p.z, 0, false)); u.s.pivot.rotation.set(0, V.yaw, 0);
  u.gone = false; u.hidden = false; u.s.setVisible(true);
  if (u.mel) u.mel.set(u.weapon || 'fists');
}
function seatPassengerPose(V, dt) {
  const u = V.pass; if (!u || !u.s) return;
  if (!u.alive) { unseatPassenger(V, toWorld(V, V.hx + 0.6, 0)); return; }
  u.s.update(dt, { move: null, speed: 0, aimYaw: V.yaw, aimPitch: 0, combat: 0 });
  seat(V, dt, u, -1);
}
export const active = () => !!cur;
export const current = () => cur;
export function reset() {
  if (cur && rider) exit(rider, true); cur = null; rider = null; stopLoops();
  for (const V of cars) { if (V.pass) unseatPassenger(V, { x: V.x, z: V.z }); V.pv = null; V.anim = null; }
  for (const B of bikes) { B.anim = null; if (B.down) { B.down = false; park(B); } }
  // a new game: every car back where it was parked (whole again), every bike back on its stand where it was
  for (const V of cars) restoreCar(V);
  for (const B of bikes) { const h = B.home; if (B.x === h.x && B.z === h.z && B.yaw === h.yaw) continue; B.x = h.x; B.z = h.z; B.yaw = h.yaw; B.y = E.world.groundY(h.x, h.z, 0, true); park(B); }
}
function restoreCar(V) {
  const o = V.orig, C = V.C, W = E.world;
  undent(V);
  if (V.live) for (const D of V.live.doors || []) setDoor(D, 0);
  V.tp = V.tr = 0;
  if (V.x === o.x && V.z === o.z && V.yaw === o.yaw && !V.moved) return;
  V.x = o.x; V.z = o.z; V.yaw = o.yaw; V.y = 0; V.v = V.vs = 0; V.steer = 0; V.roll = V.pitch = 0; V.bump = 0;
  V.g.position.set(o.x, 0, o.z); V.g.rotation.set(0, o.yaw, 0);
  if (V.live) { V.live.body.rotation.set(0, 0, 0); V.live.body.position.y = 0; for (const w of V.live.wheels) w.hub.rotation.y = 0; if (V.live.steerWheel) V.live.steerWheel.rotation.set(0.5, 0, 0); }
  C.x = o.x; C.z = o.z; C.yaw = o.yaw;
  if (W.moveBox) { W.moveBox(C.box, o.bx, o.bz, o.yaw); if (C.cab) W.moveBox(C.cab, o.cx, o.cz, o.yaw); }
  C.box.off = false; V.moved = false; V.home = { x: o.x, z: o.z, yaw: o.yaw };
  for (const T of V.trunks) { const w = toWorld(V, T.lx, T.lz); T.c.x = w.x; T.c.z = w.z; T.c.yaw = V.yaw + T.dy; if (T.st && T.c.stand) { const s2 = toWorld(V, T.st.lx, T.st.lz); T.c.stand.x = s2.x; T.c.stand.z = s2.z; T.c.stand.yaw = V.yaw + T.sdy; } }
}

// ---------------------------------------------------------------- keeping bodies out of moved cars and the bikes
// p: a position with x, z (and gy, the feet height); r its radius. Returns true if it was pushed.
export function pushBodies(p, r = 0.33) {
  if (!E) return false;
  let hit = false;
  const gy = p.gy || 0;
  for (const V of cars) {
    if (!V.moved && V !== cur) continue;
    if (gy > V.belt + 0.2) continue;
    hit = pushRect(p, r, V.x, V.z, V.yaw, V.hx, V.hz, V.bo) || hit;
  }
  for (const B of bikes) { if (B === cur || gy > 0.9) continue; hit = pushRect(p, r * 0.8, B.x, B.z, B.yaw, 0.1, 0.78, -0.02) || hit; }
  return hit;
}
function pushRect(p, r, x, z, yaw, hx, hz, bo) {
  const c = Math.cos(yaw), s = Math.sin(yaw), dx = p.x - x, dz = p.z - z;
  if (dx * dx + dz * dz > (hx + hz + r) ** 2) return false;
  const lx = dx * c - dz * s, lz = dx * s + dz * c - bo;
  const qx = clamp(lx, -hx, hx), qz = clamp(lz, -hz, hz), ex = lx - qx, ez = lz - qz, d2 = ex * ex + ez * ez;
  if (d2 >= r * r) return false;
  let nx, nz, pen;
  if (d2 > 1e-8) { const d = Math.sqrt(d2); nx = ex / d; nz = ez / d; pen = r - d; }
  else { const px = hx - Math.abs(lx), pz = hz - Math.abs(lz); if (px < pz) { nx = Math.sign(lx) || 1; nz = 0; pen = px + r; } else { nx = 0; nz = Math.sign(lz) || 1; pen = pz + r; } }
  p.x += (nx * c + nz * s) * pen; p.z += (-nx * s + nz * c) * pen;
  return true;
}

// ---------------------------------------------------------------- where the camera should be
// { pos: the point to look at (follow it), yaw: the heading to sit behind, dist, height, fov, kind }
export function cameraTarget() {
  if (!cur) return null;
  const V = cur;
  if (V.kind === 'car') { camT.pos.set(V.x, V.y + 1.25, V.z); camT.dist = V.type === 'van' || V.type === 'pickup' ? 7.2 : 6.4; camT.height = 1.1; camT.fov = 58 + Math.min(10, Math.abs(V.v) * 0.5); }
  else { camT.pos.set(V.x, V.y + 1.35, V.z); camT.dist = 3.6; camT.height = 0.5; camT.fov = 56 + Math.abs(V.v) * 0.6; }
  // reversing: the camera stays put a moment, then swings slowly round behind again (so a long reverse turn doesn't leave you looking sideways)
  camT.yaw = V.v < -0.5 && V.kind === 'car' ? dampAngle(camT.yaw, V.yaw, 0.8, 1 / 60) : V.yaw;
  camT.speed = Math.abs(V.v);
  return camT;
}

// ---------------------------------------------------------------- every frame while you're in something
// input: { up, down, left, right, brake, exit } (booleans). Call after the player's soldier has been updated, so the
// seated pose goes on top of whatever the body was doing.
export function update(dt, input = {}) {
  if (!cur || !rider) return;
  const V = cur;
  idleCars(dt);
  if (V.anim) { animStep(V, dt); if (cur === V) seatPassengerPose(V, dt); return; }
  if (input.exit && !V.exitHeld) { V.exitHeld = true; exit(rider); if (cur !== V || V.anim) return; }
  if (!input.exit) V.exitHeld = false;
  if (V.wantOut && Math.abs(V.v) < (V.kind === 'car' ? 2.2 : 3)) { exit(rider); if (cur !== V || V.anim) return; V.wantOut = false; }
  const steps = Math.max(1, Math.ceil(Math.abs(V.v) * dt / 0.12));
  for (let i = 0; i < steps && cur === V; i++) (V.kind === 'car' ? carStep : bikeStep)(V, dt / steps, input);
  if (cur !== V) return;   // thrown off
  hitThings(V, dt);
  if (cur !== V) return;
  if (V.kind === 'car') carLook(V, dt, input); else pose(V, dt, input);
  seat(V, dt);
  seatPassengerPose(V, dt);
  sounds(V, dt, input);
  // the dead hear an engine a long way off; a bike only when it's close
  V.noiseT = (V.noiseT || 0) - dt;
  if (V.noiseT <= 0) { V.noiseT = 0.45; tv.set(V.x, 0, V.z); if (V.kind === 'car') E.noise(tv, 20 + Math.abs(V.v) * 1.6 + (input.up ? 6 : 0)); else if (Math.abs(V.v) > 1) E.noise(tv, 2.5); }
}

// ---- car physics: a bicycle model with a little slip; four gears for the sound
const CAR = { vmax: 18, acc: 6.5, brake: 11, rev: 5.5, revMax: 6, hand: 7, wbK: 1 };
// each kind its own engine: a police cruiser pulls hard and runs to ~85 km/h, a loaded van wheezes up to ~70
const CARS = { sedan: { vmax: 30, acc: 5.5 }, suv: { vmax: 27, acc: 5 }, pickup: { vmax: 26, acc: 5 }, van: { vmax: 24, acc: 4 }, police: { vmax: 36, acc: 7 } };
const carOf = V => (V.C && V.C.police ? CARS.police : CARS[V.type]) || CARS.sedan;
const GRIP = 8.5;   // m/s² the tyres hold sideways (~0.85 g); ask for more and the car runs wide and slides
function carStep(V, dt, I) {
  const want = V.wantOut, up = I.up && !want, down = I.down && !want, hand = (I.brake && !want) || want;
  let a = 0; const v = V.v, CK = carOf(V);
  if (want) a = -Math.sign(v) * CAR.brake;
  else if (up) a = v < -0.3 ? CAR.brake : CK.acc * Math.pow(Math.max(0, 1 - v / CK.vmax), 0.7) + (v < 0 ? CAR.brake : 0);
  else if (down) a = v > 0.3 ? -CAR.brake : -CAR.rev * Math.max(0, 1 + v / CAR.revMax);
  const drag = (0.3 + 0.006 * v * v) * Math.sign(v);
  let nv = v + (a - drag) * dt;
  if (hand) nv -= Math.sign(nv) * Math.min(Math.abs(nv), CAR.hand * dt);
  if (!up && !down && Math.abs(nv) < 0.15) nv = 0;
  if ((up && v < 0 && nv > 0) || (down && v > 0.3 && nv < 0) || (want && v * nv < 0)) nv = 0;   // brake to a stop first, then the other way
  V.accel = (nv - v) / dt; V.v = nv;
  // steering: full lock when parking, much less at speed
  const lock = 0.62 / (1 + Math.abs(V.v) * 0.11), st = (I.left ? 1 : 0) - (I.right ? 1 : 0);
  V.steer = st ? clamp(V.steer + st * 2.2 * dt, -lock, lock) : V.steer * Math.exp(-6 * dt);
  V.steer = clamp(V.steer, -lock, lock);
  const wb = V.spec.wheelZ[0] - V.spec.wheelZ[1];
  let yr = V.v * Math.tan(V.steer) / wb;
  if (hand && Math.abs(V.v) > 4) yr *= 1.45;   // locked rear wheels: the back steps out
  // the tyres' limit: past it the car turns less than the wheels ask (understeer) and the excess goes into a slide
  const latA = Math.abs(V.v * yr);
  if (latA > GRIP && !hand) {
    const over = latA - GRIP;
    V.vs += -Math.sign(yr) * Math.sign(V.v) * over * 0.25 * dt;
    V.v -= Math.sign(V.v) * Math.min(Math.abs(V.v), over * 0.06 * dt);   // scrubbing speed
    yr *= GRIP / latA;
  }
  V.yawRate = yr;
  // velocity in the world, then turn the car under it: grip pulls it back in line with the wheels
  const hx = Math.sin(V.yaw), hz = Math.cos(V.yaw), lx = Math.cos(V.yaw), lz = -Math.sin(V.yaw);
  const wx = hx * V.v + lx * V.vs, wz = hz * V.v + lz * V.vs;
  V.yaw = wrapPi(V.yaw + yr * dt);
  const h2x = Math.sin(V.yaw), h2z = Math.cos(V.yaw), l2x = Math.cos(V.yaw), l2z = -Math.sin(V.yaw);
  V.v = wx * h2x + wz * h2z; V.vs = wx * l2x + wz * l2z;
  V.vs *= Math.exp(-(hand && Math.abs(V.v) > 4 ? 1.6 : 7) * dt);
  V.x += (h2x * V.v + l2x * V.vs) * dt; V.z += (h2z * V.v + l2z * V.vs) * dt;
  V.spin += V.v / V.spec.r * dt;
  ploughThrough(V);
  collideCar(V);
}
// fences, hedges, bins, mailboxes, young trees in the way: fast enough, and they go (the world breaks them, with their
// own sound and splinters); the car loses some speed, jolts, and takes a dent where it hit
function ploughThrough(V) {
  const W = E.world; if (!W.carBreak) return;
  const br = W.carBreak(V.x, V.z, V.yaw, V.hx, V.hz, V.bo, V.v, V.vs);
  if (!br || !br.hits) return;
  V.v *= 1 - br.slow; V.vs *= 1 - br.slow * 0.5;
  V.bump = Math.max(V.bump || 0, 0.03 + br.dent * 0.09);
  if (E.C) E.C.shake = Math.max(E.C.shake || 0, 0.06 + br.dent * 0.3);
  if (br.mat !== 'leaves' && br.dent > 0.15) crunch(Math.min(0.6, br.dent * 0.6));
  const L = toLocal(V, br.x, br.z);
  dent(V, br.dent, clamp(L.lx, -V.hx, V.hx), br.front);
}
// ---- dents: the panels round where it hit pushed in (the body's own copy of its geometry, put back on a new game)
const DM = new THREE.Matrix4(), DM2 = new THREE.Matrix4(), DM3 = new THREE.Matrix4(), DV = new THREE.Vector3();
const hash = i => { const x = Math.sin(i * 12.9898 + 4.1) * 43758.5453; return x - Math.floor(x); };
function dent(V, amt, lx = 0, front = true) {
  if (!V.live || amt < 0.03) return;
  V.dentT = (V.dentT || 0) + amt; if (V.dentT > 3) return;   // crumpled as far as it goes
  const body = V.live.body, zE = front ? V.bo + V.hz : V.bo - V.hz, depth = 0.42, push = 0.055 * Math.min(1, amt);
  V.g.updateMatrixWorld(true);
  DM.copy(V.g.matrixWorld).invert();
  body.traverse(m => {
    if (!m.isMesh || !m.geometry || !m.geometry.attributes.position || m.isSprite) return;
    DM2.multiplyMatrices(DM, m.matrixWorld); DM3.copy(DM2).invert();
    const pa0 = m.geometry.attributes.position; let any = false;
    for (let i = 0; i < pa0.count; i += 7) { DV.fromBufferAttribute(pa0, i).applyMatrix4(DM2); const dz = front ? zE - DV.z : DV.z - zE; if (dz < depth && dz > -0.08) { any = true; break; } }
    if (!any) return;
    if (!m.userData.dentGeo) { m.userData.dentGeo = m.geometry; m.geometry = m.geometry.clone(); }
    const pa = m.geometry.attributes.position; let ch = false;
    for (let i = 0; i < pa.count; i++) {
      DV.fromBufferAttribute(pa, i).applyMatrix4(DM2);
      const dz = front ? zE - DV.z : DV.z - zE; if (dz > depth || dz < -0.08) continue;
      const fl = 1 - Math.abs(DV.x - lx) / 0.75; if (fl <= 0) continue;
      const k = (1 - Math.max(0, dz) / depth) ** 1.5 * fl, h = hash(i);
      DV.z += (front ? -1 : 1) * push * k * (0.6 + 0.8 * h); DV.y -= push * 0.25 * k * hash(i + 7); DV.x += (h - 0.5) * push * 0.3 * k;
      DV.applyMatrix4(DM3); pa.setXYZ(i, DV.x, DV.y, DV.z); ch = true;
    }
    if (ch) { pa.needsUpdate = true; m.geometry.computeVertexNormals(); m.geometry.computeBoundingSphere(); }
  });
}
function undent(V) {
  if (!V.dentT) return; V.dentT = 0;
  V.g.traverse(m => { if (m.userData && m.userData.dentGeo) { m.geometry.dispose(); m.geometry = m.userData.dentGeo; delete m.userData.dentGeo; } });
}
// the ring of circles round the body, pushed out of every solid box; a hard hit stops you and bounces a little
const ring = new Map();
function ringOf(V) {
  const k = V.type + V.hx.toFixed(2) + V.hz.toFixed(2); let R = ring.get(k); if (R) return R;
  R = []; const r = 0.36, ex = V.hx - r, ez = V.hz - r;
  const nz = Math.ceil(2 * ez / 0.62), nx = Math.ceil(2 * ex / 0.62);
  for (let i = 0; i <= nz; i++) { const lz = -ez + 2 * ez * i / nz; R.push([ex, lz + V.bo], [-ex, lz + V.bo]); }
  for (let i = 1; i < nx; i++) { const lx = -ex + 2 * ex * i / nx; R.push([lx, ez + V.bo], [lx, -ez + V.bo]); }
  R.r = r; ring.set(k, R); return R;
}
const cp = { x: 0, z: 0, gy: 0 };
const LIEOPT = { ignoreBrkLie: true };   // a knocked-over bin or chair is not a wall to a car (world.js skips those boxes)
function collideCar(V) {
  const W = E.world, R = ringOf(V);
  let worst = 0, nx = 0, nz = 0, hitBox = null, other = null;
  for (let pass = 0; pass < 2; pass++) for (const [lx, lz] of R) {
    toWorld(V, lx, lz, cp); cp.gy = 0; const x0 = cp.x, z0 = cp.z;
    let b = W.collide(cp, R.r, LIEOPT), hitO = b && boxOwner.get(b);
    if (hitO === V) hitO = null;
    for (const O of cars) if (O !== V && O.moved && Math.hypot(O.x - V.x, O.z - V.z) < 8 && pushRect(cp, R.r, O.x, O.z, O.yaw, O.hx, O.hz, O.bo)) { b = b || { mat: 'metal' }; hitO = O; }
    const dx = cp.x - x0, dz = cp.z - z0, d = Math.hypot(dx, dz);
    if (d < 1e-5) continue;
    // move the body out, and turn it a little about the hit (a glancing blow swings the car)
    V.x += dx; V.z += dz;
    const c = Math.cos(V.yaw), s = Math.sin(V.yaw), rx = lx * c + lz * s, rz = -lx * s + lz * c;
    V.yaw = wrapPi(V.yaw + (dx * rz - dz * rx) / (rx * rx + rz * rz + 1) * 0.35);
    if (d > worst) { worst = d; nx = dx / d; nz = dz / d; hitBox = b; other = hitO || other; }
  }
  if (!worst) return;
  // what the impact did to the speed: the part going into the wall goes (and a bit comes back)
  const hx = Math.sin(V.yaw), hz = Math.cos(V.yaw), lx = Math.cos(V.yaw), lz = -Math.sin(V.yaw);
  const wx = hx * V.v + lx * V.vs, wz = hz * V.v + lz * V.vs, vn = wx * nx + wz * nz;
  if (vn >= 0) return;
  // another car: it takes part of the blow — shoved along (and turned) by it, dented where it was struck
  if (other && V.kind === 'car' && !other.pass && other !== cur) {
    shoveCar(other, -nx, -nz, -vn, V.x - nx * V.hz, V.z - nz * V.hz);
    const e2 = 0.1, ox = wx - (1 + e2) * vn * 0.55 * nx, oz = wz - (1 + e2) * vn * 0.55 * nz;   // a car gives: you lose about half
    V.v = ox * hx + oz * hz; V.vs = ox * lx + oz * lz;
    crash(V, -vn * 0.8, 'metal');
    if (-vn > 4.5 && !(V.dentHitT > 0)) { V.dentHitT = 0.4; const front = nx * hx + nz * hz < 0, hit = toLocal(V, V.x - nx * V.hz, V.z - nz * V.hz); dent(V, Math.min(1, (-vn - 3.5) / 7), clamp(hit.lx, -V.hx, V.hx), front); }
    return;
  }
  const e = -vn > 4 ? 0.22 : 0.05, ox = wx - (1 + e) * vn * nx, oz = wz - (1 + e) * vn * nz;
  V.v = ox * hx + oz * hz; V.vs = ox * lx + oz * lz;
  V.v *= -vn > 3 ? 0.55 : 0.9;
  crash(V, -vn, hitBox ? hitBox.mat : 'metal');
  if (-vn > 4.5 && V.kind === 'car' && !(V.dentHitT > 0)) {   // a real hit: the panels go in where it struck
    V.dentHitT = 0.4;
    const front = nx * hx + nz * hz < 0, hit = toLocal(V, V.x - nx * V.hz, V.z - nz * V.hz);
    dent(V, Math.min(1, (-vn - 3.5) / 7), clamp(hit.lx, -V.hx, V.hx), front);
  }
}
// a car shoved by yours: it gets a velocity (and a spin about where it was hit) that idleCars() rolls out
function shoveCar(O, dx, dz, sp, hx, hz) {
  if (!O.live) O.live = makeDrivable(O.g, O.type);
  if (!O.moved) { O.C.box.off = true; O.moved = true; }
  const k = 0.45 * sp;
  O.pv = O.pv || { x: 0, z: 0, w: 0 };
  O.pv.x += dx * k; O.pv.z += dz * k;
  const rx = hx - O.x, rz = hz - O.z;   // torque: the lever arm about its centre × the push
  O.pv.w += clamp((rz * dx - rx * dz) * k * 0.12, -1.2, 1.2);
  if (sp > 3.5) { const L = toLocal(O, hx, hz); dent(O, Math.min(1, (sp - 2.5) / 7), clamp(L.lx, -O.hx, O.hx), L.lz > O.bo); }
}
// shoved cars rolling to a stop (tyres scrubbing sideways), stopped by walls; then left solid where they are
function idleCars(dt) {
  const W = E.world;
  for (const O of cars) {
    if (!O.pv || O === cur) continue;
    const P = O.pv, d = Math.exp(-2.6 * dt);
    O.x += P.x * dt; O.z += P.z * dt; O.yaw = wrapPi(O.yaw + P.w * dt);
    P.x *= d; P.z *= d; P.w *= Math.exp(-3.5 * dt);
    const R = ringOf(O);
    for (const [lx, lz] of R) {
      toWorld(O, lx, lz, cp); cp.gy = 0; const x0 = cp.x, z0 = cp.z;
      W.collide(cp, R.r, LIEOPT);
      const ddx = cp.x - x0, ddz = cp.z - z0;
      if (ddx * ddx + ddz * ddz > 1e-8) { O.x += ddx; O.z += ddz; const l = Math.hypot(ddx, ddz), vn = (P.x * ddx + P.z * ddz) / l; if (vn < 0) { P.x -= vn * ddx / l * 1.2; P.z -= vn * ddz / l * 1.2; } }
    }
    O.y = E.world.groundY(O.x, O.z, 0, true);
    O.g.position.set(O.x, O.y, O.z); O.g.rotation.set(O.tp || 0, O.yaw, O.tr || 0, 'YXZ');
    for (const T of O.trunks) { const w = toWorld(O, T.lx, T.lz); T.c.x = w.x; T.c.z = w.z; T.c.yaw = O.yaw + T.dy; if (T.st && T.c.stand) { const s2 = toWorld(O, T.st.lx, T.st.lz); T.c.stand.x = s2.x; T.c.stand.z = s2.z; T.c.stand.yaw = O.yaw + T.sdy; } }
    O.C.x = O.x; O.C.z = O.z; O.C.yaw = O.yaw;
    if (Math.hypot(P.x, P.z) < 0.06 && Math.abs(P.w) < 0.03) { O.pv = null; settle(O); }
  }
}
function crash(V, sp, mat) {
  if (sp < 1.6 || V.hitT > 0) return;
  V.hitT = 0.35;
  const p = tv3.set(V.x, 0.7, V.z);
  if (E.SND.impact) E.SND.impact(p, 'metal', Math.min(2, sp / 5));
  if (sp > 3 && E.SND.impact) E.SND.impact(p, mat || 'concrete', Math.min(2, sp / 6));
  if (V.kind === 'car') crunch(Math.min(1, sp / 12));
  if (E.C) E.C.shake = Math.max(E.C.shake || 0, Math.min(0.8, sp * 0.05));
  E.noise(p, 15 + sp * 3);
  V.bump = Math.min(0.12, sp * 0.012);
  const lim = V.kind === 'car' ? carOf(V).vmax * 0.4 : 5.5;   // hurts past ~40% of the car's top speed
  if (sp > lim && rider) E.damage(rider, (sp - lim) * (V.kind === 'car' ? 4 : 6), null, { crash: true });
  if (V.kind === 'bike' && sp > 6 && rider && cur === V) bail(V, sp);
}
// off the bike: over the bars and onto the road; the bike goes down on its side and stays there till picked up
function bail(V, sp) {
  const P = rider; if (!P) return;
  const fx = Math.sin(V.yaw), fz = Math.cos(V.yaw);
  exit(P, true);
  V.down = true; park(V);
  if (P.alive !== false && P.s) {
    P.s.fly = { vx: fx * sp * 0.35, vy: 2 + sp * 0.12, vz: fz * sp * 0.35 };
    if (E.knockDown) E.knockDown(P, tv.set(fx, 0, fz));
  }
  if (E.SND.impact) E.SND.impact(tv3.set(V.x, 0.4, V.z), 'metal', 0.9);
  if (E.C) E.C.shake = Math.max(E.C.shake || 0, 0.5);
}

// ---- the dead in the way: at speed they go down (and fly); slowly they're shoved aside
const hv = new THREE.Vector3();
function hitThings(V, dt) {
  V.hitT = Math.max(0, (V.hitT || 0) - dt); V.dentHitT = Math.max(0, (V.dentHitT || 0) - dt);
  const Z = E.Z; if (!Z || !Z.list) return;
  const car = V.kind === 'car', hx = car ? V.hx : 0.25, hz = car ? V.hz : 0.85, bo = car ? V.bo : 0;
  // people (not zombies): hit at speed, they go down hurt — the people code handles the reaction, witnesses and stats
  const hop = !car && (V.hopY || 0) > 0.25;   // a bunny hop clears a body on the road and the legs of one standing
  const PL = E.PEOPLE && E.C && (E.C.npcs || E.C.units);
  // the dead and the knocked-out lying in the road: a jolt as you go over (people.js lists the dead in C.units)
  if (E.PEOPLE && E.C && E.C.units && !hop) for (const u of E.C.units) {
    if (!u.npc || !u.s || !((!u.alive && u.st === 'down') || (u.alive && u.st === 'ko'))) continue;
    const p = u.s.pos, dx = p.x - V.x, dz = p.z - V.z; if (dx * dx + dz * dz > (hz + 1.5) ** 2) continue;
    const c = Math.cos(V.yaw), s = Math.sin(V.yaw), lx = dx * c - dz * s, lz = dx * s + dz * c - bo, t = E.C.t || 0;
    if (Math.abs(lx) < hx + 0.3 && Math.abs(lz) < hz + 0.3 && Math.abs(V.v) > 1 && !(u._carT > t)) {
      u._carT = t + 0.6; V.bump = Math.max(V.bump || 0, car ? 0.05 : 0.09);
      if (E.SND.stomp) E.SND.stomp(tv3.set(p.x, 0.3, p.z));
      if (u.alive && u.st === 'ko') E.PEOPLE.hurtNPC(u, 8 + Math.abs(V.v), rider, { part: 'body', crash: true });
      if (!car) V.v *= 0.7;
    }
  }
  if (PL && !hop) for (const u of E.C.npcs || []) {
    if (!u.alive || !u.npc || u.st === 'ko' || u.st === 'down') continue;
    const p = u.s.pos, dx = p.x - V.x, dz = p.z - V.z; if (dx * dx + dz * dz > (hz + 1.5) ** 2) continue;
    const c = Math.cos(V.yaw), s = Math.sin(V.yaw), lx = dx * c - dz * s, lz = dx * s + dz * c - bo;
    if (Math.abs(lx) > hx + 0.32 || Math.abs(lz) > hz + 0.32) continue;
    const sp = Math.abs(V.v), t = E.C.t || 0;
    if (sp > (car ? 2.5 : 2.2) && !(u._carT > t)) {
      u._carT = t + 0.8; const fwd = Math.sign(V.v) || 1, dir = { x: Math.sin(V.yaw) * fwd, y: 0, z: Math.cos(V.yaw) * fwd };
      // a bumper takes the legs; fast enough and they go over the hood and hit their head
      E.PEOPLE.hurtNPC(u, car ? sp * 4 : 4 + sp * 1.5, rider, { dir, part: car && sp > 9 ? 'head' : 'legs', crash: true, thrown: car && sp > 9 });
      if (car && sp > 7) u.s.fly = { vx: dir.x * sp * 0.5, vy: 1.2 + sp * 0.1, vz: dir.z * sp * 0.5 };   // thrown, like the dead are
      else if (car && u.alive && E.PEOPLE.shoveNPC) E.PEOPLE.shoveNPC(u, dir, rider, true);              // a slow knock: they stagger
      if (E.SND.meleeHit) E.SND.meleeHit('blunt', tv3.set(p.x, 1, p.z), false, Math.min(1.4, sp / 8));
      if (E.fx && E.fx.blood && sp > 5) E.fx.blood(tv3.set(p.x, 1.0, p.z), tv2.set(dir.x, 0.3, dir.z), car ? 0.9 : 0.5);
      V.bump = Math.max(V.bump || 0, car ? 0.06 : 0.1); if (!car) V.v *= 0.5;
      if (!car && sp > 4.5 && rider) { E.damage(rider, 4 + sp, null, { crash: true }); if (sp > 7 && cur === V) { bail(V, sp); return; } }
    }
  }
  for (const u of Z.list) {
    if (!u.alive || !u.active) continue;
    if (hop) continue;
    const p = u.s.pos, dx = p.x - V.x, dz = p.z - V.z;
    if (dx * dx + dz * dz > (hz + 1.5) ** 2) continue;
    const c = Math.cos(V.yaw), s = Math.sin(V.yaw), lx = dx * c - dz * s, lz = dx * s + dz * c - bo;
    const r = 0.32;
    if (Math.abs(lx) > hx + r || Math.abs(lz) > hz + r) continue;
    const sp = Math.abs(V.v) + Math.abs(V.vs || 0);
    const t = E.C ? E.C.t : 0;
    if (u.z && u.z.down > 0 && !u.s.fly) {   // one already on the road: roll over it (a jolt, a crunch), don't shove it
      if (sp > 1 && !(u._carT > t)) { u._carT = t + 0.6; V.bump = Math.max(V.bump || 0, car ? 0.05 : 0.09); E.damage(u, car ? 8 + sp : 3, rider, { dir: tv.set(0, -1, 0).clone(), part: 'chest', vehicle: true }); if (E.SND.stomp) E.SND.stomp(tv3.set(p.x, 0.3, p.z)); if (!car) V.v *= 0.7; }
      continue;
    }
    if (sp > (car ? 2.5 : 2.2) && !(u._carT > t)) {
      u._carT = t + 0.8;
      // pushed along the way you're going, and out to the side it was hit on
      const fwd = Math.sign(V.v) || 1;
      hv.set(Math.sin(V.yaw) * fwd, 0, Math.cos(V.yaw) * fwd).addScaledVector(tv.set(Math.cos(V.yaw), 0, -Math.sin(V.yaw)), clamp(lx / (hx + r), -1, 1) * 0.5).normalize();
      const dmg = car ? (sp < 6 ? 18 : sp * sp * 0.45) : 6 + sp * 2;
      const big = car && sp > 9;
      E.damage(u, dmg, rider, { dir: hv.clone(), knock: 1, part: big && sp > 13 ? 'head' : 'chest', vehicle: true, fling: big ? { vx: hv.x * sp * 0.55, vy: 1.5 + sp * 0.12, vz: hv.z * sp * 0.55 } : null });
      if (u.alive) {
        if (u.z && !(u.z.down > 0)) knockDown(u, hv);
        if (big) u.s.fly = { vx: hv.x * sp * 0.5, vy: 1.4 + sp * 0.1, vz: hv.z * sp * 0.5 };
        else u.s.vel.set(hv.x * (1.5 + sp * 0.4), 0, hv.z * (1.5 + sp * 0.4));
      }
      if (E.SND.meleeHit) E.SND.meleeHit('blunt', tv3.set(p.x, 1, p.z), false, car ? 1.4 : 0.9);
      if (car && E.SND.impact) E.SND.impact(tv3, 'metal', 0.6);
      if (E.fx && E.fx.blood) E.fx.blood(tv3.set(p.x, 1.0, p.z), tv2.set(hv.x, 0.3, hv.z), car ? 1.2 : 0.6);
      if (E.C) E.C.shake = Math.max(E.C.shake || 0, car ? 0.18 : 0.25);
      V.v *= car ? (sp > 9 ? 0.93 : 0.85) : 0.45;   // a body is heavy: a bike nearly stops
      if (!car && sp > 4.5 && rider) E.damage(rider, 4, null, { crash: true });
      if (!car && sp > 6 && rider && cur === V) { bail(V, sp); return; }   // into one at a sprint: over the bars
    } else {
      // slow: shove it aside (and it slows you)
      const q = { x: p.x, z: p.z, gy: 0 };
      if (pushRect(q, r, V.x, V.z, V.yaw, hx, hz, bo)) {
        p.x = q.x; p.z = q.z; V.v *= Math.exp(-(sp > 2.5 ? 0.4 : 2.5) * dt);
        // on a bike at walking pace one can get hold of you and drag you off
        const ev = E.C && E.C.events;
        if (!car && sp < 2.2 && rider && cur === V && !(u.z && u.z.down > 0) && !u.s.fly && ev && ev.zombieGrab && Math.random() < dt * 1.5) { const P = rider; exit(P, true); ev.zombieGrab(u); return; }
      }
    }
  }
}

// ---- the car's look: wheels, body on its springs, lights, steering wheel
const spot = { L: null };
function headlight(V) {
  if (!V) { if (spot.L) spot.L.intensity = 0; return; }
  // one light for both lamps, made the first time you drive (and kept, dark, so the scene's shaders never change again)
  if (!spot.L) { spot.L = new THREE.SpotLight(0xfff0d8, 0, 48, 0.62, 0.5, 1.3); spot.L.castShadow = false; }
  const body = V.live.body, L = spot.L;
  if (L.parent !== body) { body.add(L); body.add(L.target); }
  L.position.set(0, 0.75, V.spec.L / 2 - 0.1); L.target.position.set(0, 0, V.spec.L / 2 + 14);
}
const QW = { x: 0, z: 0 }, xz = o => [o.x, o.z];
function carLook(V, dt, I) {
  const g = V.g, L = V.live, W = E.world, wz = V.spec.wheelZ, wb = wz[0] - wz[1], hw = V.hx - 0.12, mz = (wz[0] + wz[1]) / 2;
  // the ground under each axle and each side: the car sits on all four, pitched and rolled to the slope (a kerb lifts
  // one end, not the whole car)
  const yF = W.groundY(...xz(toWorld(V, 0, wz[0], QW)), 0, true), yR = W.groundY(...xz(toWorld(V, 0, wz[1], QW)), 0, true);
  const yL = W.groundY(...xz(toWorld(V, hw, mz, QW)), 0, true), yRt = W.groundY(...xz(toWorld(V, -hw, mz, QW)), 0, true);
  V.y = damp(V.y, (yF + yR + yL + yRt) / 4, 14, dt);
  V.tp = damp(V.tp || 0, Math.atan2(yR - yF, wb), 12, dt); V.tr = damp(V.tr || 0, Math.atan2(yL - yRt, 2 * hw), 12, dt);
  g.position.set(V.x, V.y, V.z); g.rotation.set(V.tp, V.yaw, V.tr, 'YXZ');
  // springs: nose dips under braking, squats under power, leans out in a turn; a jolt on a hit
  const lat = (V.yawRate || 0) * V.v;
  V.pitch = damp(V.pitch, clamp(-(V.accel || 0) * 0.0045, -0.045, 0.035), 7, dt);
  V.roll = damp(V.roll, clamp(lat * 0.006, -0.05, 0.05), 6, dt);
  V.bump = Math.max(0, (V.bump || 0) - dt * 0.4);
  const jolt = V.bump * Math.sin((E.C ? E.C.t : 0) * 40);
  L.body.rotation.set(V.pitch + jolt * 0.3, 0, V.roll, 'YXZ');
  L.body.position.y = Math.abs(V.v) > 3 ? Math.sin((E.C ? E.C.t : 0) * 13) * 0.003 * Math.min(1, Math.abs(V.v) / 15) : 0;
  for (const w of L.wheels) { w.spin.rotation.x = V.spin; w.hub.rotation.y = w.front ? V.steer : 0; }
  if (L.steerWheel) L.steerWheel.rotation.set(0.5, 0, -V.steer * 3.2);
  // brake lights (and the reversing lamps); headlights after dark
  const braking = (I.down && V.v > 0.3) || (I.up && V.v < -0.3) || I.brake || V.wantOut;
  L.tail.emissiveIntensity = braking ? 2.2 : 0.35;
  L.rev.emissiveIntensity = V.v < -0.2 && I.down ? 1.2 : 0;
  const night = (E.world.night || 0) > 0.3;
  if (L.head) L.head.emissiveIntensity = night ? 2.5 : 0;
  headlight(V); spot.L.intensity = night ? 160 : 0;
  // the trunk (searchable) comes along
  for (const T of V.trunks) { const w = toWorld(V, T.lx, T.lz); T.c.x = w.x; T.c.z = w.z; T.c.yaw = V.yaw + T.dy; if (T.st && T.c.stand) { const s2 = toWorld(V, T.st.lx, T.st.lz); T.c.stand.x = s2.x; T.c.stand.z = s2.z; T.c.stand.yaw = V.yaw + T.sdy; } }
  V.C.x = V.x; V.C.z = V.z; V.C.yaw = V.yaw;
}

// ---- bike physics
const BIKE = { vmax: 7.2, acc: 2.4, brake: 5.5, back: 0.9, sprintMax: 10.5, sprintAcc: 4.2 };
function bikeStep(B, dt, I) {
  const want = B.wantOut, up = I.up && !want, down = I.down || want;
  B.leafT = Math.max(0, (B.leafT || 0) - dt);
  const v = B.v;
  let a = 0;
  // Shift: stand up on the pedals and sprint
  const spr = up && I.sprint, vmax = spr ? BIKE.sprintMax : BIKE.vmax;
  B.sprint = spr;
  if (up) a = v < 0 ? BIKE.brake : (spr ? BIKE.sprintAcc : BIKE.acc) * Math.pow(Math.max(0, 1 - v / vmax), 0.8) + 0.25;
  // Space: a bunny hop (curbs, a fallen branch, a body in the road)
  B.hopY = B.hopY || 0; B.hopV = B.hopV || 0;
  if (I.jump && B.hopY <= 0.001 && !want) { B.hopV = 3.1 + Math.min(1, Math.abs(v) / 8) * 0.6; B.hopT = 0; if (E.SND && E.SND.swing) E.SND.swing(0.15, null); }
  if (B.hopY > 0 || B.hopV > 0) { B.hopV -= 9.81 * dt; B.hopY = Math.max(0, B.hopY + B.hopV * dt); if (B.hopY === 0 && B.hopV < 0) { if (B.hopV < -2 && E.SND && E.SND.land) E.SND.land(Math.min(4, -B.hopV), true); B.landT = 0.22; B.hopV = 0; } }
  else if (down) a = v > 0.1 ? -BIKE.brake : (I.down && !want ? -1.2 : 0);
  const air = B.hopY > 0.02;
  if (air) a = 0;   // pedalling in the air does nothing
  const drag = (0.12 + 0.009 * v * v) * Math.sign(v);
  let nv = v + (a - drag) * dt;
  if (down && v > 0 && nv < 0 && !(I.down && !want && v < 0.1)) nv = 0;
  nv = Math.max(nv, -BIKE.back);
  if (!up && !down && Math.abs(nv) < 0.05) nv = 0;
  B.v = nv; B.pedal = up;
  const lock = 0.6 / (1 + Math.abs(B.v) * 0.38), st = (I.left ? 1 : 0) - (I.right ? 1 : 0);
  B.steer = st ? clamp(B.steer + st * 2.6 * dt * (air ? 0.3 : 1), -lock, lock) : B.steer * Math.exp(-7 * dt);
  B.steer = clamp(B.steer, -lock, lock);
  const yr = air ? (B.yawRate || 0) * 0.98 : B.v * Math.tan(B.steer) / B.U.base; B.yawRate = yr;   // no grip in the air: it keeps the turn it had
  B.yaw = wrapPi(B.yaw + yr * dt);
  const ox = B.x, oz = B.z;
  B.x += Math.sin(B.yaw) * B.v * dt; B.z += Math.cos(B.yaw) * B.v * dt;
  // a step up taller than a kerb ramp (a wall top, a raised deck) is a wall unless you hop it
  { const W0 = E.world, d0 = Math.sign(B.v) * 0.55, g0 = W0.groundY(ox + Math.sin(B.yaw) * d0, oz + Math.cos(B.yaw) * d0, 0, true), g1 = W0.groundY(B.x + Math.sin(B.yaw) * d0, B.z + Math.cos(B.yaw) * d0, 0, true);
    if (g1 - g0 > 0.2 && B.hopY < g1 - g0 - 0.05) { B.x = ox; B.z = oz; const sp = Math.abs(B.v); B.v = 0; crash(B, sp, 'concrete'); if (cur !== B) return; } }
  B.spin += B.v / B.U.r * dt;
  if (up && B.v > 0) B.crank += B.v / B.U.r / 2.6 * dt * (B.sprint ? 1.25 : 1);   // chainring 42 : cog 16 — the cranks turn 2.6 times slower than the wheel
  // two circles (front and back wheel) pushed out of the walls
  const W = E.world;
  let worst = 0, nx = 0, nz = 0, mat = null;
  for (const lz of [0.5, -0.45]) {
    const x0 = B.x + Math.sin(B.yaw) * lz, z0 = B.z + Math.cos(B.yaw) * lz;
    cp.x = x0; cp.z = z0; cp.gy = B.hopY || 0;   // in the air: whatever's lower than the hop passes under
    const b = W.collide(cp, 0.3);
    for (const O of cars) if (O.moved && Math.hypot(O.x - B.x, O.z - B.z) < 7) pushRect(cp, 0.3, O.x, O.z, O.yaw, O.hx, O.hz, O.bo);
    const dx = cp.x - x0, dz = cp.z - z0, d = Math.hypot(dx, dz);
    if (d < 1e-5) continue;
    B.x += dx; B.z += dz;
    if (d > worst) { worst = d; nx = dx / d; nz = dz / d; mat = b && b.mat; }
  }
  if (worst) {
    const vn = (Math.sin(B.yaw) * nx + Math.cos(B.yaw) * nz) * B.v;
    if (vn < 0) {
      B.v *= Math.max(0, 1 + vn / Math.max(0.5, Math.abs(B.v)) * 1.0); crash(B, -vn, mat);
      if (mat === 'leaves' && -vn > 1.5 && !(B.leafT > 0)) { B.leafT = 0.5; const p = tv3.set(B.x + Math.sin(B.yaw) * 0.6, 0.8, B.z + Math.cos(B.yaw) * 0.6); if (E.fx && E.fx.debris) E.fx.debris(p, tv2.set(Math.sin(B.yaw), 0, Math.cos(B.yaw)), 'leaf', Math.round(4 + -vn * 2), 0.5, 0.3); if (E.SND && E.SND.breakSound) E.SND.breakSound('leaves', p, 0.5, false); }
    }
  }
}
// the bike's look: lean, wheels, cranks, steering; parked: on its stand
function pose(B, dt = 0, I = {}) {
  const U = B.U, g = B.g, W = E.world, sf = Math.sin(B.yaw), cf = Math.cos(B.yaw);
  // both wheels on the ground: pitched to the slope (a driveway, a ramp), the frame between them
  const yf = W.groundY(B.x + sf * 0.5, B.z + cf * 0.5, 0, true), yr = W.groundY(B.x - sf * 0.53, B.z - cf * 0.53, 0, true);
  const yG = (yf + yr) / 2, sl = Math.atan2(yf - yr, 1.03);
  if (dt > 0) { B.slope = damp(B.slope ?? sl, sl, 14, dt); B.gY = damp(B.gY ?? yG, yG, 20, dt); } else { B.slope = sl; B.gY = yG; }
  B.y = B.gY + (B.hopY || 0) + (B.down ? 0.1 : 0);
  // a bunny hop: the front comes up first, then the back follows it (pitched about the wheel left on the ground)
  B.hopT = (B.hopT ?? 9) + dt;
  const ph = B.hopY > 0 ? Math.sin(Math.min(1, B.hopT / 0.5) * Math.PI) : 0;
  B.pitch = dt > 0 ? damp(B.pitch || 0, B.hopV > 0 ? -0.22 * ph : 0.08 * ph, 12, dt) : 0;
  if (cur === B && !B.anim) {
    const lean = -Math.atan(clamp(B.v * (B.yawRate || 0) / 9.81, -0.7, 0.7)), stopped = Math.abs(B.v) < 0.4 && !I.up;
    B.foot = damp(B.foot ?? 0, stopped ? 1 : 0, 6, dt);
    B.standK = damp(B.standK || 0, B.sprint ? 1 : 0, 6, dt);
    const rock = Math.sin(B.crank) * 0.06 * B.standK;   // stood on the pedals, the bike rocks side to side under you
    B.lean = damp(B.lean, lean * (1 - B.foot) - 0.13 * B.foot + Math.sin((E.C ? E.C.t : 0) * 1.7) * 0.012 * (1 - B.foot) * Math.min(1, B.v) + rock, 8, dt);
  }
  const pOff = B.pitch < 0 ? -0.53 * Math.sin(B.pitch) : 0.5 * Math.sin(B.pitch);
  g.position.set(B.x, B.y + pOff, B.z); g.rotation.set(-B.slope + B.pitch, B.yaw, B.lean, 'YXZ');
  U.rear.rotation.x = B.spin; U.front.rotation.x = B.spin;
  U.steer.rotation.y = B.steer;
  U.crank.rotation.x = B.crank;
  for (const p of U.pedals) p.rotation.x = -B.crank;
}

// ---------------------------------------------------------------- the rider: sat in the seat, hands and feet placed
const HV = new THREE.Vector3(), TG = new THREE.Vector3(), FWD = new THREE.Vector3(), LEFT = new THREE.Vector3(), DOWN = new THREE.Vector3();
function seat(V, dt, P = rider, side0 = 1) {
  const s = P.s, piv = s.pivot, B = s.B, pass = side0 < 0;
  s.vel.set(0, 0, 0); s.speed = 0; s.yaw = s.aimYaw = s.moveA = V.yaw;
  const car = V.kind === 'car', g = V.g;
  // the pivot rides with the vehicle (and leans with a bike)
  const frame = car ? V.live.body : g;
  frame.updateMatrixWorld(true);
  piv.position.set(V.x, V.y, V.z);
  piv.quaternion.copy(frame.getWorldQuaternion(tq));
  const out = !pass && car ? (V.out || 0) : 0;
  if (out > 0) piv.quaternion.premultiply(TQ.setFromAxisAngle(UPV, out * Math.PI / 2));   // turned to face out of the door
  piv.updateMatrixWorld(true);
  // where the hips go, in the vehicle's frame
  const land = !car ? clamp((V.landT || 0) / 0.22, 0, 1) : 0;
  if (!car && !pass && dt > 0) V.landT = Math.max(0, (V.landT || 0) - dt);
  const stand = car ? 0 : (V.standK || 0);
  if (car) { const c = V.spec.cab; TG.set(0.33 * side0, c.f + 0.17, c.front + 0.17); }
  else TG.set(0, V.U.saddle.position.y + 0.07 + 0.16 * stand - 0.06 * land, V.U.saddle.position.z - 0.02 + 0.12 * stand);   // sprinting: up off the saddle
  frame.localToWorld(TG);
  B.Hips.getWorldPosition(HV);
  piv.position.add(TG.sub(HV)); piv.updateMatrixWorld(true);
  s.pos.gy = V.y;
  // the body: leaning back in a car seat, forward over the bars on a bike
  FWD.set(0, 0, 1).applyQuaternion(piv.quaternion); LEFT.set(1, 0, 0).applyQuaternion(piv.quaternion); DOWN.set(0, -1, 0).applyQuaternion(piv.quaternion);
  if (car) { addTurn(B.Spine, LEFT, -0.2); addTurn(B.Spine1, LEFT, -0.08); addTurn(B.Neck, LEFT, 0.12); addTurn(B.Head, LEFT, 0.1); }
  else {
    const pump = V.pedal ? Math.sin(V.crank * 2) * 0.03 : 0, crouch = (V.hopY > 0 ? 0.25 : 0) + land * 0.2;   // tucked over the bars in a hop, and soaking up the landing
    addTurn(B.Spine, LEFT, 0.4 + crouch); addTurn(B.Spine1, LEFT, 0.15); addTurn(B.Spine, FWD, pump + Math.sin(V.crank) * 0.12 * stand); addTurn(B.Neck, LEFT, -0.22 - crouch * 0.6); addTurn(B.Head, LEFT, -0.22);
  }
  // legs: the feet on the pedals (or one down on the road when the bike's stopped)
  for (const side of [-1, 1]) {
    const nm = side > 0 ? 'Right' : 'Left';
    if (car) { const c = V.spec.cab, dz = c.z1 - 0.14; TG.set(0.33 * side0 - side * 0.13, c.f + 0.1, dz - 0.06 - (side > 0 ? 0 : 0.05) - (pass ? 0.08 : 0)); frame.localToWorld(TG);
      if (out > 0) { TS.set(V.hx + 0.25 + out * 0.15, 0, c.front + 0.3 - side * 0.14); frame.localToWorld(TS); TS.y = E.world.groundY(TS.x, TS.z, 0, false) + 0.09; TG.lerp(TS, smooth(0, 0.6, out)); }
    }
    else {
      const ped = V.U.pedals[side > 0 ? 1 : 0]; ped.getWorldPosition(TG); TG.addScaledVector(DOWN, -0.075).addScaledVector(FWD, -0.035);
      if (side < 0 && V.foot > 0.01) { tv2.set(0.3, 0.09, -0.1); g.localToWorld(tv2); tv2.y = V.y + 0.09; TG.lerp(tv2, V.foot); }   // left foot down on the road
    }
    leg(B[nm + 'UpLeg'], B[nm + 'Leg'], B[nm + 'Foot'], B[nm + 'ToeBase'], TG, side);
  }
  // hands on the wheel at ten to two (they turn with it), or on the grips
  for (const side of [-1, 1]) {
    if (car && pass) { const c = V.spec.cab; TG.set(-0.33 - side * 0.16, c.f + 0.36, c.front + 0.5); frame.localToWorld(TG); }   // the passenger: hands on his knees
    else if (car) { const sw = V.live.steerWheel; TG.set(-side * 0.155, 0.06, 0); sw.localToWorld(TG); }
    else V.U.grips[side > 0 ? 1 : 0].getWorldPosition(TG);
    const out = tv2.copy(LEFT).multiplyScalar(-side);   // out to that hand's own side
    const f = tv3.copy(FWD).multiplyScalar(car ? 0.55 : 0.8).addScaledVector(DOWN, car ? 0.25 : 0.45).addScaledVector(out, car ? -0.35 : 0.2).normalize();
    if (car) f.addScaledVector(UPV, 0.4).normalize();
    s.reach(side, { p: TG, f, s: tv.copy(out).negate(), curl: 1 }, 1);
  }
}
// two-bone leg: hip → knee → ankle at the target, the knee out in front; the foot kept flat-ish along the vehicle
const la = new THREE.Vector3(), lb = new THREE.Vector3(), lc = new THREE.Vector3(), ld = new THREE.Vector3(), le = new THREE.Vector3();
function leg(up, lo, foot, toe, target, side) {
  if (!up || !lo || !foot) return;
  up.getWorldPosition(la); lo.getWorldPosition(lb); foot.getWorldPosition(lc);
  const l1 = la.distanceTo(lb), l2 = lb.distanceTo(lc);
  const dv = ld.copy(target).sub(la); let dist = dv.length(); if (dist < 1e-4) return;
  const dn = dv.divideScalar(dist); dist = clamp(dist, Math.abs(l1 - l2) + 0.01, (l1 + l2) * 0.999);
  const cosA = clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
  const pole = le.copy(FWD).addScaledVector(UPV, 0.3).addScaledVector(LEFT, -side * 0.12);
  pole.addScaledVector(dn, -pole.dot(dn)); if (pole.lengthSq() < 1e-6) pole.copy(FWD); pole.normalize();
  const knee = lb.copy(la).addScaledVector(dn, l1 * cosA).addScaledVector(pole, l1 * sinA);
  aimBone(up, lo, lc.copy(knee).sub(la), 1);
  lo.getWorldPosition(lb);
  aimBone(lo, foot, lc.copy(target).sub(lb), 1);
  if (toe) aimBone(foot, toe, lc.copy(FWD).addScaledVector(DOWN, 0.25), 0.85);
}

// ---------------------------------------------------------------- sound: engine, road, tyres, the bike's chain
let AC = null, OUT = null, NB = null, TICK = null;
const LOOP = {};
function audio() {
  if (AC) return AC;
  try {
    const raw = E.SND && E.SND.raw && E.SND.raw();
    if (raw && raw.ctx) { AC = raw.ctx; OUT = raw.out; }
    else { AC = new (window.AudioContext || window.webkitAudioContext)(); OUT = AC.createGain(); OUT.gain.value = 0.8; OUT.connect(AC.destination); }
  } catch { AC = null; return null; }
  NB = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate); { const d = NB.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  // one turn of a freewheel: 24 little pawl clicks
  TICK = AC.createBuffer(1, AC.sampleRate, AC.sampleRate); { const d = TICK.getChannelData(0), n = AC.sampleRate / 24; for (let k = 0; k < 24; k++) for (let i = 0; i < 260; i++) d[Math.floor(k * n) + i] = (Math.random() * 2 - 1) * Math.exp(-i / 40) * (0.7 + Math.random() * 0.3); }
  loadRec();
  return AC;
}
// recorded car sounds (CC0 recordings in sounds/): an idle loop and an on-load loop crossfaded by the throttle and pitched
// with the revs, a door slam and a starter crank. Any that's missing: the synthesized ones below stand in.
const REC = {};
function loadRec() {
  if (REC.tried || !AC) return; REC.tried = true;
  for (const k of ['idle', 'rev', 'door', 'start']) fetch(`sounds/car_${k}.ogg`).then(r => r.ok ? r.arrayBuffer() : Promise.reject(0)).then(b => AC.decodeAudioData(b)).then(buf => { REC[k] = buf; }).catch(() => {});
}
function playRec(k, t, g = 0.6) { const b = REC[k]; if (!b) return false; const s = AC.createBufferSource(); s.buffer = b; const e = AC.createGain(); e.gain.value = g; s.connect(e).connect(OUT); s.start(t); return true; }
const noiseSrc = () => { const s = AC.createBufferSource(); s.buffer = NB; s.loop = true; s.start(); return s; };
function loops(kind) {
  if (LOOP[kind]) return LOOP[kind];
  if (!audio()) return null;
  const L = { g: AC.createGain() }; L.g.gain.value = 0; L.g.connect(OUT);
  if (kind === 'car') {
    // the engine: two detuned saws and a sub an octave down at the firing rate, through a filter that opens with
    // the throttle; intake hiss on top
    L.o1 = AC.createOscillator(); L.o1.type = 'sawtooth'; L.o2 = AC.createOscillator(); L.o2.type = 'sawtooth'; L.o3 = AC.createOscillator(); L.o3.type = 'triangle';
    L.lp = AC.createBiquadFilter(); L.lp.type = 'lowpass'; L.lp.Q.value = 2.5;
    const g1 = AC.createGain(); g1.gain.value = 0.35; const g3 = AC.createGain(); g3.gain.value = 0.6;
    L.o1.connect(L.lp); L.o2.connect(g1).connect(L.lp); L.o3.connect(g3).connect(L.lp);
    L.eng = AC.createGain(); L.lp.connect(L.eng).connect(L.g);
    L.hiss = AC.createBiquadFilter(); L.hiss.type = 'bandpass'; L.hiss.frequency.value = 900; L.hiss.Q.value = 0.8; L.hg = AC.createGain(); L.hg.gain.value = 0;
    noiseSrc().connect(L.hiss).connect(L.hg).connect(L.g);
    for (const o of [L.o1, L.o2, L.o3]) o.start();
  }
  // road noise (both), tyre squeal (car), the freewheel and chain (bike)
  L.road = AC.createBiquadFilter(); L.road.type = 'lowpass'; L.road.frequency.value = kind === 'car' ? 420 : 900; L.rg = AC.createGain(); L.rg.gain.value = 0;
  noiseSrc().connect(L.road).connect(L.rg).connect(L.g);
  if (kind === 'car') { L.sq = AC.createBiquadFilter(); L.sq.type = 'bandpass'; L.sq.frequency.value = 1700; L.sq.Q.value = 6; L.sg = AC.createGain(); L.sg.gain.value = 0; noiseSrc().connect(L.sq).connect(L.sg).connect(L.g); }
  else {
    L.tick = AC.createBufferSource(); L.tick.buffer = TICK; L.tick.loop = true; L.tg = AC.createGain(); L.tg.gain.value = 0; L.tick.connect(L.tg).connect(L.g); L.tick.start();
    L.ch = AC.createBiquadFilter(); L.ch.type = 'bandpass'; L.ch.frequency.value = 2600; L.ch.Q.value = 1.5; L.cg = AC.createGain(); L.cg.gain.value = 0; noiseSrc().connect(L.ch).connect(L.cg).connect(L.g);
  }
  return (LOOP[kind] = L);
}
// set a gain now, and have it fall silent by itself if update() stops being called (paused, menu, tab hidden)
function hold(param, v, t) { param.cancelScheduledValues(t); param.setTargetAtTime(v, t, 0.04); param.setTargetAtTime(0, t + 0.3, 0.08); }
function sounds(V, dt, I) {
  const L = loops(V.kind); if (!L || AC.state !== 'running') return;
  const t = AC.currentTime, sp = Math.abs(V.v);
  if (V.kind === 'car') {
    // the recorded engine, once its loops have loaded (the synth is faded out then)
    if (!L.rec && REC.idle && REC.rev) {
      L.rec = {};
      for (const k of ['idle', 'rev']) { const src = AC.createBufferSource(); src.buffer = REC[k]; src.loop = true; const gg = AC.createGain(); gg.gain.value = 0; src.connect(gg).connect(L.g); src.start(); L.rec[k] = src; L.rec[k + 'G'] = gg; }
    }
    // revs through four gears (reverse and first share a ratio); they climb in each and drop at the change
    const G = [0, 4.5, 8.5, 12.5, 99], th = I.up || I.down ? 1 : 0;
    let gi = 0; while (sp > G[gi + 1]) gi++;
    const k = gi === 3 ? sp / 16 : (sp - G[gi]) / (G[gi + 1] - G[gi]);
    // the starter cranks (engine silent), it catches at ~0.85 s with a flare to 1100 rpm, then settles to idle
    const on = V.engineT > 0.55;
    const want = V.engineT < 1.1 ? (on ? 1100 - (V.engineT - 0.55) * 400 : 250) : 850 + clamp(k, 0, 1.2) * (gi === 0 ? 3600 : 3000) * (sp > 0.3 || th ? 1 : 0) + th * 350;
    V.engineT += dt; V.rpm = damp(V.rpm, want, gi === 0 || V.rpmUp ? 6 : 9, dt);
    const f = V.rpm / 60 * 2;   // a four-cylinder fires twice a turn
    L.o1.frequency.setTargetAtTime(f, t, 0.03); L.o2.frequency.setTargetAtTime(f * 1.012, t, 0.03); L.o3.frequency.setTargetAtTime(f * 0.5, t, 0.03);
    L.lp.frequency.setTargetAtTime(220 + f * 3 + th * 700, t, 0.05);
    if (L.rec) {
      const rate = clamp(V.rpm / 2500, 0.6, 2.2), load = on ? clamp(th * 0.8 + (V.rpm - 900) / 4000, 0, 1) : 0;
      L.rec.idle.playbackRate.setTargetAtTime(clamp(V.rpm / 900, 0.6, 2.2), t, 0.04); L.rec.rev.playbackRate.setTargetAtTime(rate, t, 0.04);
      L.rec.idleG.gain.setTargetAtTime(on ? 0.5 * (1 - load) : 0, t, 0.05); L.rec.revG.gain.setTargetAtTime(on ? 0.55 * load : 0, t, 0.05);
      L.eng.gain.setTargetAtTime(0, t, 0.05);
    } else L.eng.gain.setTargetAtTime(on ? 0.16 + th * 0.12 : 0, t, on ? 0.04 : 0.02);
    L.hg.gain.setTargetAtTime(on ? th * 0.02 * (V.rpm / 3000) : 0, t, 0.08);
    L.rg.gain.setTargetAtTime(Math.min(1, sp / 18) * 0.12, t, 0.1);
    L.sg.gain.setTargetAtTime(clamp((Math.abs(V.vs) - 0.7) * 0.06, 0, 0.14) + (I.brake && sp > 5 ? 0.05 : 0), t, 0.05);
    hold(L.g.gain, 0.9, t);
  } else {
    const rev = V.v / (2 * Math.PI * V.U.r);   // wheel turns a second
    L.tick.playbackRate.setTargetAtTime(Math.max(0.05, Math.abs(rev)), t, 0.05);
    L.tg.gain.setTargetAtTime(!V.pedal && sp > 0.4 ? 0.13 : 0, t, 0.05);
    L.cg.gain.setTargetAtTime(V.pedal ? 0.012 * Math.min(1, sp / 4) : 0, t, 0.08);
    L.rg.gain.setTargetAtTime(Math.min(1, sp / 7) * 0.05, t, 0.1);
    hold(L.g.gain, 0.9, t);
  }
}
function stopLoops() { if (!AC) return; const t = AC.currentTime; for (const k in LOOP) { const g = LOOP[k].g.gain; g.cancelScheduledValues(t); g.setTargetAtTime(0, t, 0.12); } }
// one-off sounds: doors, the starter, switching off, the chain on mounting, a locked handle, the crunch of a crash
function blip(t, { f = 400, type = 'lowpass', q = 1, d = 0.08, g = 0.3, noise = true, osc = null, f1 = null }) {
  const e = AC.createGain(); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(g, t + 0.004); e.gain.exponentialRampToValueAtTime(0.0005, t + d); e.connect(OUT);
  if (noise) { const s = AC.createBufferSource(); s.buffer = NB; const fl = AC.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; s.connect(fl).connect(e); s.start(t, Math.random()); s.stop(t + d + 0.02); }
  if (osc) { const o = AC.createOscillator(); o.type = osc; o.frequency.setValueAtTime(f, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + d); o.connect(e); o.start(t); o.stop(t + d + 0.02); }
}
function sound(kind, V) {
  if (!audio() || AC.state !== 'running') return;
  const t = AC.currentTime + 0.01;
  if (kind === 'doorOpen') { blip(t, { f: 2200, type: 'bandpass', q: 2, d: 0.04, g: 0.18 }); blip(t + 0.03, { f: 500, d: 0.06, g: 0.12 }); }   // the latch
  else if (kind === 'door') { if (playRec('door', t)) return; blip(t, { f: 900, q: 1.2, d: 0.05, g: 0.25 }); blip(t + 0.02, { f: 110, f1: 60, osc: 'sine', noise: false, d: 0.18, g: 0.55 }); blip(t + 0.02, { f: 350, d: 0.12, g: 0.25 }); }
  else if (kind === 'start') {   // the starter whirring, then it catches
    V.engineT = -0.3; if (playRec('start', t + 0.2)) return;
    for (let i = 0; i < 6; i++) blip(t + 0.25 + i * 0.09, { f: 140, f1: 120, osc: 'sawtooth', noise: false, d: 0.07, g: 0.12 });
    blip(t + 0.85, { f: 180, d: 0.35, g: 0.35 }); V.engineT = -0.3;
  }
  else if (kind === 'stop') { blip(t, { f: 60, f1: 30, osc: 'sawtooth', noise: false, d: 0.45, g: 0.25 }); }
  else if (kind === 'bikeOn' || kind === 'bikeOff') { blip(t, { f: 3200, type: 'bandpass', q: 3, d: 0.03, g: 0.2 }); blip(t + 0.07, { f: 2400, type: 'bandpass', q: 3, d: 0.03, g: 0.15 }); blip(t + 0.1, { f: 200, d: 0.08, g: 0.15 }); }
  else if (kind === 'rattle') for (let i = 0; i < 3; i++) { blip(t + i * 0.11, { f: 1800, type: 'bandpass', q: 2, d: 0.04, g: 0.3 }); blip(t + i * 0.11 + 0.02, { f: 300, d: 0.05, g: 0.2 }); }
}
function crunch(k) {
  if (!audio() || AC.state !== 'running') return;
  const t = AC.currentTime + 0.005;
  blip(t, { f: 90, f1: 40, osc: 'sine', noise: false, d: 0.25, g: 0.5 + k * 0.4 });
  blip(t, { f: 700, q: 0.7, type: 'bandpass', d: 0.18 + k * 0.2, g: 0.35 + k * 0.4 });
  for (let i = 0; i < 2 + k * 6; i++) blip(t + Math.random() * 0.15, { f: 2500 + Math.random() * 3000, type: 'bandpass', q: 4, d: 0.05, g: 0.12 + k * 0.15 });
}
function rattle(V) { sound('rattle', V); return false; }
