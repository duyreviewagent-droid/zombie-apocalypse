// heli.js — the rescue helicopter, the way out of town.
// "Survive the night: at 2 AM a helicopter comes for the living. It waits one minute, then it leaves, with whoever got in."
// A detailed army medevac helicopter (olive drab, red crosses, glass cockpit, open side door with a crewman waving you in,
// four-blade main rotor and tail rotor that blur into discs, skids, blinking nav lights, a sweeping searchlight), a flight
// (far away, in high over the roofs, slow down, hover, straight down onto the landing zone, sixty seconds on the ground,
// lift off and away), rotor-wash dust, a synthesized rotor sound (blade-pass thump + turbine whine, heard across town),
// a big countdown, and a camera for the lift-off shot. Self-contained: everything it needs comes in through init(ctx).
import * as THREE from 'three';
import { C as GAME } from './state.js';
import { paintedMetalTexture, fabricTexture } from './tex.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
const rnd = (a = 1) => (Math.random() - 0.5) * 2 * a;

// flight numbers (metres, seconds)
const WAIT = 60;              // seconds on the ground, exactly
const CRUISE = 40, CRUISE_ALT = 110, HOVER_ALT = 42, DECEL = 2.3, ACCEL = 4.5;
const START_DIST = 900, GONE_DIST = 1150;
const ROTOR_R = 7.2, ROTOR_RPS = 4.9;     // 4 blades x 4.9 rev/s = a ~20 Hz blade-pass thump
const DOOR = V(1.45, 0.9, 0.25);          // where you climb in (local: +z is the nose, +x the left side, y up from the skids)

let C = null, H = null, S = null, SN = null, UI = null;
let MODE = 'heli', PL = null, BT = null;   // which vehicle comes: the helicopter, a light plane (airstrip) or a police boat (river)
const VEH = () => MODE === 'plane' ? PL : MODE === 'boat' ? BT : H;
const WAITS = () => (C && C.ending && C.ending.window) || C.window || WAIT;
const isMe = w => w === 'player' || (w && w.player);
let muted = false, uiOn = true;

// ================================================================== public API
// ctx: { scene, camera, renderer?, audio?() -> { ctx, out } (pass SND.raw), noise?(pos, radius), groundY?(x, z),
//        lz?: { x, z, yaw? }, lzName?, schedule?: [{ day, hour }], playerPos?() -> Vector3, daylight?() -> 0..1,
//        sway?(x, z, radius, strength), boardKey?, ui?: true, crew?(group) -> { update(dt, t, mode) },
//        onInbound?(), onArrive?(), onCountdown?(sec), onDepart?(passengers), onMissed?(final), onGone?(),
//        ending?: story.ending ({ kind: 'heli'|'plane'|'boat'|'tunnel', vehicle?, at, window, prompt, ready?, notReady }),
//        ready?() -> bool (false at the hour: it circles and leaves), onNotReady?(), walkable?(x, z) (open ground, for the camera) }
export function init(ctx) {
  if (C) dispose();
  C = Object.assign({ lz: { x: 0, z: 0 }, lzName: 'Main St & Maple Ave', schedule: [{ day: 2, hour: 2 }, { day: 3, hour: 2 }], boardKey: 'E', ui: true, boardRadius: 2.6, noiseRadius: 90 }, ctx);
  H = build();
  C.scene.add(H.group, H.spot, H.spot.target, H.beam, H.dust.mesh, H.lamp);
  routeLamp();
  if (C.ui) UI = makeUI();
  configure(C.ending || null);
  return api;
}
// the cabin / landing lamp is a world-space point light: hand it to the world's light pool (a fixed set of real lights,
// so it never recompiles a shader and doesn't light every pixel of town) once the pool exists. The searchlight is a
// spot: it stays a real light (always in the scene, intensity 0 when away).
function worldLights() { const w = C.world || GAME.world; return w && w.addLight ? w : null; }
function routeLamp() {
  if (!H || H.lampPooled) return;
  const w = worldLights(); if (!w) return;
  C.scene.remove(H.lamp); (C.addLight || w.addLight)(H.lamp, C.scene); H.lampPooled = w;
}
// which way out this map has (story.ending): 'plane' lands a Cessna on the strip, vehicle 'boat' brings a police launch
// to the dock; anything else is the helicopter. Safe to call again (a new map): it resets the flight.
export function configure(e) {
  if (!C) return;
  C.ending = e || null;
  const kind = e ? (e.vehicle === 'boat' ? 'boat' : e.kind) : 'heli';
  MODE = kind === 'plane' ? 'plane' : kind === 'boat' && e.vehicle === 'boat' ? 'boat' : 'heli';
  if (e && e.ready && !C.ready) C.ready = e.ready;
  C.boardRadius = MODE === 'plane' ? 4 : MODE === 'boat' ? 3.2 : (C.boardRadius0 ??= C.boardRadius);
  if (MODE === 'plane' && !PL) { PL = buildPlane(); C.scene.add(PL.group); }
  if (MODE === 'boat' && !BT) { BT = buildBoat(); C.scene.add(BT.group); }
  if (UI) { UI.top.textContent = topName(); }
  reset();
}
export const mode = () => MODE;
// what this map calls its ride: the name in the story's prompt ('Board the RIO LENTO' -> 'RIO LENTO'), else the kind
const KIND_NAME = () => MODE === 'plane' ? 'PLANE' : MODE === 'boat' ? 'BOAT' : 'HELICOPTER';
function rideName() {
  const e = C && C.ending, pr = e && e.prompt && String(e.prompt).trim();
  const m = pr && /^(?:board|get on(?: board)?|get in(?:to)?|climb (?:in(?:to)?|aboard)|take)\s+(?:the\s+)?(.+)$/i.exec(pr);
  return ((e && e.vehicleName) || (m && m[1]) || KIND_NAME()).toUpperCase();
}
const named = () => rideName() !== KIND_NAME();   // a ride with its own name (the RIO LENTO)
const topName = () => named() ? 'THE ' + rideName() : MODE === 'plane' ? 'RESCUE PLANE' : MODE === 'boat' ? 'POLICE BOAT' : 'RESCUE HELICOPTER';

// back to the start of a run: no helicopter, nothing flown yet (newGame / toTitle / load)
export function reset() {
  if (!C) return;
  S = { st: 'waiting', slot: -1, rpmT: 1, spd: 0, turn: 0, u: 0, noGo: false, orbT: 0, orbA: 0, done: C.schedule.map(() => false), pos: V(0, -500, 0), vel: V(), yaw: 0, pitch: 0, roll: 0, yawRate: 0,
    rpm: 0, load: 0.6, t: 0, T: 0, boardT: WAIT, lastSec: -1, passengers: [], noiseT: 0, camT: 0, camA: 0, from: 0, exit: 0, gy: 0, door: 1,
    lastDist: null, settle: 0 };
  H.group.visible = false; H.beam.visible = false; H.spot.intensity = 0; H.lamp.intensity = 0;
  if (PL) PL.group.visible = false; if (BT) BT.group.visible = false;
  H.seated.forEach(p => { p.visible = false; });
  H.dust.clear(); stopSound(); showUI(null);
}

// once a frame from the game loop: dt (real seconds), the game's hour (0-24) and day (1, 2, ...)
export function update(dt, hour, day) {
  if (!C || !S) return;
  // how fast the game's clock runs (game hours per real second), so a flight can set off early enough to land on the hour
  const nowH = (day - 1) * 24 + hour;
  if (S.lastH != null && dt > 0) { const dh = nowH - S.lastH; if (dh > 0 && dh < 0.05) S.hRate = S.hRate ? lerp(S.hRate, dh / dt, Math.min(1, dt * 2)) : dh / dt; }
  S.lastH = nowH;
  dt = Math.min(dt, 0.1);
  S.T += dt;
  if (!H.lampPooled) routeLamp();
  if (S.st === 'waiting') checkSchedule(hour, day);
  if (S.st !== 'waiting' && S.st !== 'over') (MODE === 'plane' ? flyPlane : MODE === 'boat' ? flyBoat : fly)(dt);
  animate(dt);
  sound(dt);
  H.dust.update(dt);
  ui();
}

// are you close enough to the door to climb in, while it waits?
export function canBoard(pos) {
  if (!S || S.st !== 'landed' || S.boardT <= 0 || !pos) return false;
  const d = doorPos();
  return Math.hypot(pos.x - d.x, pos.z - d.z) < C.boardRadius && Math.abs((pos.y ?? d.y) - S.gy) < 2.2;
}
// someone climbs in: 'player' (default), or any object ({ player: true, id, name } for an online player, a townsperson…).
// Returns the seat number (use seatPos(i) to sit a body inside if you want), or -1 if it can't take them now.
export function board(who = 'player') {
  if (!S || S.st !== 'landed' || S.boardT <= 0) return -1;
  if (S.passengers.includes(who)) return S.passengers.indexOf(who);
  if (S.passengers.length >= 8) return -1;
  S.passengers.push(who); H.crewWave = 1.5;
  return S.passengers.length - 1;
}
export const passengers = () => S ? S.passengers.slice() : [];
// 'waiting' | 'inbound' | 'descend' | 'landed' | 'liftoff' | 'outbound' | 'over'
export const state = () => S ? S.st : 'off';
export const timeLeft = () => S && S.st === 'landed' ? Math.max(0, S.boardT) : 0;
export const position = () => H ? VEH().group.position : null;
export const group = () => H ? VEH().group : null;
export const nextFlight = () => { if (!S) return null; const i = S.done.indexOf(false); return i < 0 ? null : C.schedule[i]; };
export function doorPos(out = V()) { const v = VEH(); return v.group.localToWorld(out.copy(v.door || DOOR)); }
export function seatPos(i, out = V()) { const v = VEH(); return v.group.localToWorld(v.seat ? v.seat(i, out) : heliSeat(i, out)); }
export function lzPos(out = V()) { return out.set(C.lz.x, ground(C.lz.x, C.lz.z), C.lz.z); }
// is (x, z) inside the parked helicopter? (r: the body's radius) — for the lead's collision so nobody walks through it
// the solid footprint, in the vehicle's own frame: boxes [x0, x1, z0, z1] grown by r
function footprint(r) {
  if (MODE === 'plane') return [[-0.72 - r, 0.72 + r, -5.1 - r, 3.2 + r], [0.95 - r, 1.45 + r, -0.35 - r, 0.35 + r], [-1.45 - r, -0.95 + r, -0.35 - r, 0.35 + r]];
  if (MODE === 'boat') return [[-1.15 - r, 1.15 + r, -3.1 - r, 3.1 + r]];
  return [[-1.12 - r, 1.12 + r, -2.7 - r, 4.3 + r], [-0.4 - r, 0.4 + r, -8.8 - r, -2.6 + r]];
}
const solid = () => S && VEH().group.visible && S.pos.y - S.gy <= 2.5;
const inBox = (b, lx, lz) => lx > b[0] && lx < b[1] && lz > b[2] && lz < b[3];
export function blocks(x, z, r = 0.3) {
  if (!solid()) return false;
  const dx = x - S.pos.x, dz = z - S.pos.z, c = Math.cos(S.yaw), s = Math.sin(S.yaw);
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  return footprint(r).some(b => inBox(b, lx, lz));
}
// someone is inside the parked vehicle (it landed on them, or they were already standing there): move them out to the
// nearest free edge. pos: anything with x / z (changed in place). Returns true when it moved them.
export function pushOut(pos, r = 0.3) {
  if (!pos || !solid()) return false;
  const dx = pos.x - S.pos.x, dz = pos.z - S.pos.z, c = Math.cos(S.yaw), s = Math.sin(S.yaw);
  const lx = dx * c - dz * s, lz = dx * s + dz * c, B = footprint(r);
  if (!B.some(b => inBox(b, lx, lz))) return false;
  let bx = 0, bz = 0, bd = Infinity;
  for (const b of B) for (const [cx, cz] of [[b[0] - 0.02, lz], [b[1] + 0.02, lz], [lx, b[2] - 0.02], [lx, b[3] + 0.02]]) {
    const d = Math.hypot(cx - lx, cz - lz);
    if (d < bd && !B.some(o => inBox(o, cx, cz))) { bd = d; bx = cx; bz = cz; }
  }
  if (bd === Infinity) return false;
  pos.x = S.pos.x + bx * c + bz * s; pos.z = S.pos.z - bx * s + bz * c;   // back to the world (the inverse turn)
  return true;
}
// on touch-down: nobody stands inside it (the player, the townspeople)
function clearLanding() {
  try {
    const pp = C.playerPos?.(); if (pp) pushOut(pp, 0.33);
    const ppl = C.bodies ? C.bodies() : globalThis.ZA?.PEOPLE?.PPL?.list;
    if (ppl) for (const u of ppl) { const p = u && (u.s ? u.s.pos : u.pos || u); if (p && typeof p.x === 'number') pushOut(p, 0.3); }
  } catch { }
}
// the lift-off shot: { pos, look } for the camera while it climbs away (orbits round it over the town), else null
// While it waits with you aboard: the view from inside, out of the open door (watching the others run for it), t = 0.
export function cameraTarget() {
  if (!S) return null;
  const g = VEH().group;
  if (S.st === 'landed' && S.passengers.some(isMe)) {
    g.updateMatrixWorld(true);
    if (MODE === 'plane') return { pos: g.localToWorld(V(-0.15, 1.72, -0.55)), look: g.localToWorld(V(6, 1.0, 2.2)), fov: 64, t: 0, inside: true };
    if (MODE === 'boat') return { pos: g.localToWorld(V(-0.35, 1.95, -1.9)), look: g.localToWorld(V(5, 0.9, 1.5)), fov: 62, t: 0, inside: true };
    return { pos: g.localToWorld(V(0.2, 2.36, -0.75)), look: g.localToWorld(V(1.8, 1.15, 1.0)), fov: 72, t: 0, inside: true };   // up under the roof at the back: past the crewman, out of the open door (your own seat is off to the left, out of shot)   // in the cabin by the door: everyone who made it   // in the cabin: the others on the benches, the open door, the crossroads
  }
  if ((S.st !== 'liftoff' && S.st !== 'outbound') || S.camT > 16) return null;
  const t = S.camT, p = S.pos;
  if (MODE === 'plane') {
    // from the side of the strip, by where it rotates: it races past and climbs away; the lens follows it in
    const h = S.lzYaw + Math.PI, fx = Math.sin(h), fz = Math.cos(h), at = C.lz;
    const pos = V(at.x + fx * 75 + fz * 16, S.gy + 2.4 + t * 0.15, at.z + fz * 75 - fx * 16);
    const d = pos.distanceTo(p);
    return { pos, look: V(p.x, p.y + 1.2, p.z), fov: clamp(1400 / Math.max(20, d), 18, 58), t };
  }
  if (MODE === 'boat') {
    // from the end of the dock: it backs out, swings round and goes off up the river into the dark
    const a = C.lz.yaw, pos = V(C.lz.x + Math.sin(a) * 7.5 - Math.cos(a) * 1.2, S.gy + 2.6, C.lz.z + Math.cos(a) * 7.5 + Math.sin(a) * 1.2);
    const d = pos.distanceTo(p);
    return { pos, look: V(p.x, p.y + 1.1, p.z), fov: clamp(900 / Math.max(15, d), 22, 60), t };
  }
  // it climbs straight up first (the camera starts above the crowd, roofs and poles), then orbits out over the town
  const a = S.camA + t * 0.32, r = 11 + t * 2.4;
  const pos = V(p.x + Math.sin(a) * r, Math.max(S.gy + 7 + t * 0.6, p.y - 2 + t * 0.9), p.z + Math.cos(a) * r);
  const look = V(p.x, p.y + 1.6 - Math.min(6, t * 0.4), p.z);
  return { pos, look, fov: 55 - Math.min(12, t * 0.8), t };
}
export const cinematicDone = () => !S || S.camT > 16 || S.st === 'over' || S.st === 'waiting';
// debug / story: bring it now. { land: true } puts it straight on the ground with the minute running.
export function callNow({ land = false, from } = {}) {
  if (!S) return;
  const i = Math.max(0, S.done.indexOf(false)); S.slot = i;
  startInbound(from);
  if (!land) S.noGo = !!(C.ready && !C.ready());
  if (land) {
    if (MODE === 'plane') { S.yaw = S.lzYaw + Math.PI; S.turn = 1; }
    else if (MODE === 'boat') { S.u = S.path.L; boatAt(S.u); S.yaw = S.path.endYaw; }
    else S.yaw = S.lzYaw;
    if (MODE !== 'boat') S.pos.set(C.lz.x, S.gy, C.lz.z);
    S.vel.set(0, 0, 0); S.spd = 0; touchDown();
  }
}
// for multiplayer: the host says when it leaves; or the story ends the wait early
export function leaveNow() { if (S && S.st === 'landed') S.boardT = 0; }
// you're aboard: it goes in s seconds (or sooner if it was going anyway) — the countdown shows the real time left
export function leaveIn(s) { if (S && S.st === 'landed') S.boardT = Math.min(S.boardT, Math.max(0, s)); }
export function setMuted(m) { muted = !!m; }
export function setUIVisible(v) { uiOn = !!v; if (!v) showUI(null); }
// for save games: which flights have already come
export const snapshot = () => S ? { done: S.done.slice() } : null;
export function restore(d) { reset(); if (d && d.done) d.done.forEach((v, i) => { if (i < S.done.length) S.done[i] = v; }); }
export function dispose() {
  if (!C) return;
  stopSound();
  if (H) { H.lamp.intensity = 0; const vl = H.lampPooled && H.lampPooled.vlights; if (vl && vl.includes(H.lamp)) vl.splice(vl.indexOf(H.lamp), 1); }
  if (H) { C.scene.remove(H.group, H.spot, H.spot.target, H.beam, H.dust.mesh, H.lamp); H.group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
  for (const v of [PL, BT]) if (v) { C.scene.remove(v.group); v.group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
  PL = BT = null; MODE = 'heli';
  if (UI) { UI.root.remove(); UI.mark.remove(); UI.style.remove(); document.body.classList.remove('heliOn'); }
  C = H = S = UI = null;
}
const api = { init, configure, mode, leaveIn, reset, update, canBoard, board, passengers, state, timeLeft, position, group, nextFlight, doorPos, seatPos, lzPos, blocks, pushOut, cameraTarget, cinematicDone, callNow, leaveNow, setMuted, setUIVisible, snapshot, restore, dispose };
export default api;

// ================================================================== schedule + flight
const ground = (x, z) => (C.groundY ? C.groundY(x, z) : 0) || 0;
// real seconds from setting off to touching down (measured): the helicopter, the plane (glide + roll-out), the boat
const FLIGHT = { heli: 45, plane: 53, boat: 29 };
const lead = () => Math.min(0.9, FLIGHT[MODE] * clamp(S.hRate || 1 / 40, 1 / 400, 1 / 20));
function checkSchedule(hour, day) {
  const now = (day - 1) * 24 + hour;
  for (let i = 0; i < C.schedule.length; i++) {
    if (S.done[i]) continue;
    const at = (C.schedule[i].day - 1) * 24 + C.schedule[i].hour;
    if (now < at - lead()) return;                                 // not yet (it sets off early: it lands at the hour)
    if (now < at + 1) { S.slot = i; startInbound(); S.noGo = !!(C.ready && !C.ready()); return; }   // its time: here it comes (if it can't land, it circles)
    S.done[i] = true;                                              // long past (a loaded save): that one's gone
    if (i === C.schedule.length - 1) { S.st = 'over'; C.onMissed?.(true); }
  }
}
function startInbound(from) {
  S.done[S.slot] = true;
  S.from = from ?? (C.lz.from ?? Math.random() * Math.PI * 2);
  S.exit = S.from + Math.PI * (0.55 + Math.random() * 0.3) * (Math.random() < 0.5 ? 1 : -1);
  S.gy = ground(C.lz.x, C.lz.z);
  S.pos.set(C.lz.x + Math.sin(S.from) * START_DIST, S.gy + CRUISE_ALT, C.lz.z + Math.cos(S.from) * START_DIST);
  S.yaw = S.from + Math.PI; S.vel.set(-Math.sin(S.from) * CRUISE, 0, -Math.cos(S.from) * CRUISE);
  S.lzYaw = C.lz.yaw ?? S.yaw;                                     // lands facing the way it came in unless told otherwise
  S.st = 'inbound'; S.t = 0; S.rpm = 1; S.rpmT = 1; S.load = 0.8; S.boardT = WAITS(); S.lastSec = -1; S.passengers = []; S.door = 1; S.camT = 0; S.noGo = false; S.turn = 0;
  if (MODE === 'plane') {
    // on the extended centreline, 1.6 km out and 130 m up, on a 5 degree glide to the threshold
    const h = S.lzYaw, fx = Math.sin(h), fz = Math.cos(h), back = 122 + 1500;
    S.pos.set(C.lz.x - fx * back, S.gy + 1500 * 0.087 + 4, C.lz.z - fz * back); S.yaw = h; S.spd = 36; S.vel.set(fx * 36, 0, fz * 36); S.rpm = 0.62; S.rpmT = 0.62; S.door = 0;
  } else if (MODE === 'boat') {
    S.gy = (C.ending && C.ending.waterY) ?? 0.03; S.path = boatPath(); S.u = 0; S.spd = 9; boatAt(0); S.rpm = 0.8; S.rpmT = 0.8; S.door = 0;
  }
  H.group.visible = MODE === 'heli'; if (PL) PL.group.visible = MODE === 'plane'; if (BT) BT.group.visible = MODE === 'boat';
  H.beam.visible = true; H.dust.clear();
  C.onInbound?.();
}
function touchDown() {
  S.st = 'landed'; S.t = 0; S.pos.y = S.gy; S.vel.set(0, 0, 0); S.boardT = WAITS(); S.lastSec = -1; S.settle = 1;
  S.rpmT = MODE === 'heli' ? 0.86 : MODE === 'plane' ? 0.34 : 0.3;   // throttled back to ground idle (never shut down)
  VEH().group.position.copy(S.pos); clearLanding();
  C.onArrive?.();
}
const _f = V(), _w = V();
function fly(dt) {
  S.t += dt;
  const p = S.pos, v = S.vel, lx = C.lz.x, lz = C.lz.z;
  let yawT = S.yaw, pitchT = 0;
  const prevVH = Math.hypot(v.x, v.z);
  if (S.st === 'inbound') {
    // straight in at height, slowing so it stops dead over the landing zone, coming down from cruise to hover height
    const dx = lx - p.x, dz = lz - p.z, dh = Math.hypot(dx, dz);
    const sp = Math.min(CRUISE, Math.sqrt(2 * DECEL * Math.max(0, dh - 0.4)));
    _w.set(dh > 0.01 ? dx / dh * sp : 0, 0, dh > 0.01 ? dz / dh * sp : 0);
    steer(_w, dt, dh < 60 ? 2.5 : ACCEL);
    const yT = S.gy + HOVER_ALT + (CRUISE_ALT - HOVER_ALT) * smooth(90, 480, dh);
    v.y = lerp(v.y, clamp((yT - p.y) * 0.5, -7, 5), 1 - Math.exp(-dt * 2));
    const vh = Math.hypot(v.x, v.z);
    yawT = vh > 6 ? Math.atan2(v.x, v.z) : S.lzYaw;
    if (C.ready) S.noGo = !C.ready();   // (it set off early: whether it can land is decided when it gets here)
    if (S.noGo && dh < 150) { S.st = 'orbit'; S.t = 0; S.orbA = Math.atan2(p.x - lx, p.z - lz); C.onNotReady?.(); }
    else if (dh < 1.5 && vh < 1.1) { S.st = 'descend'; S.t = 0; }
  } else if (S.st === 'orbit') {
    // it can't land (no lights): two slow laps round the landing zone at 60 m out, then it gives up and goes —
    // unless it becomes ready while it circles, then it comes in after all
    S.orbA += (28 / 60) * dt;
    const tx = lx + Math.sin(S.orbA) * 60, tz = lz + Math.cos(S.orbA) * 60;
    _w.set(Math.cos(S.orbA) * 28 + (tx - p.x) * 0.6, 0, -Math.sin(S.orbA) * 28 + (tz - p.z) * 0.6);
    steer(_w, dt, 5);
    v.y = lerp(v.y, clamp((S.gy + 70 - p.y) * 0.4, -5, 4), 1 - Math.exp(-dt * 1.5));
    yawT = Math.atan2(v.x, v.z);
    if (C.ready && C.ready()) { S.noGo = false; S.st = 'inbound'; S.t = 0; }
    else if (S.t > (Math.PI * 2 * 2 * 60) / 28) { S.st = 'outbound'; S.t = 0; S.exit = yawT; C.onMissed?.(S.done.indexOf(false) < 0); }
  } else if (S.st === 'descend') {
    // hold over the spot and come straight down, slowing for the last few metres; a little drift so it looks flown
    const h = p.y - S.gy;
    v.x = (lx + Math.sin(S.T * 0.7) * 0.3 * smooth(1, 8, h) - p.x) * 1.5; v.z = (lz + Math.cos(S.T * 0.53) * 0.3 * smooth(1, 8, h) - p.z) * 1.5;
    v.y = lerp(v.y, -clamp(h * 0.32, 0.45, 6.5), 1 - Math.exp(-dt * 3));
    yawT = S.lzYaw;
    if (h + v.y * dt <= 0.01) touchDown();
  } else if (S.st === 'landed') {
    v.set(0, 0, 0); p.y = S.gy; yawT = S.lzYaw;
    S.boardT -= dt;
    const sec = Math.max(0, Math.ceil(S.boardT));
    if (sec !== S.lastSec) { S.lastSec = sec; C.onCountdown?.(sec); }
    if (S.boardT <= 0) depart();
  } else if (S.st === 'liftoff') {
    // pick up into a hover, then away
    const h = p.y - S.gy, k = Math.exp(-dt * 6);
    v.x *= k; v.z *= k;
    v.y = lerp(v.y, S.t < 1.4 ? 0.6 : 4.5, 1 - Math.exp(-dt * 1.5));
    yawT = h < 14 ? S.lzYaw : S.exit;   // straight up clear of the crowd and the poles first, then the pedal turn
    if (h > 20) { S.st = 'outbound'; S.t = 0; }
  } else if (S.st === 'outbound') {
    _w.set(Math.sin(S.exit) * CRUISE * 1.1, 0, Math.cos(S.exit) * CRUISE * 1.1);
    steer(_w, dt, 3.2);
    v.y = lerp(v.y, clamp((S.gy + 150 - p.y) * 0.3, -2, 5), 1 - Math.exp(-dt));
    yawT = Math.hypot(v.x, v.z) > 4 ? Math.atan2(v.x, v.z) : S.exit;
    if (Math.hypot(p.x - lx, p.z - lz) > GONE_DIST) gone();
  }
  if (S.st === 'over' || S.st === 'waiting') return;
  p.addScaledVector(v, dt);
  if (S.st !== 'landed' && p.y < S.gy) p.y = S.gy;
  // attitude: nose down to go, nose up to stop (flare), bank into turns, settle level on the ground
  const dy = wrapA(yawT - S.yaw), rate = clamp(dy * 1.2, -0.55, 0.55);
  S.yawRate = lerp(S.yawRate, rate, 1 - Math.exp(-dt * 3)); S.yaw += S.yawRate * dt;
  const vh = Math.hypot(v.x, v.z); _f.set(Math.sin(S.yaw), 0, Math.cos(S.yaw));
  const fwdSpeed = v.x * _f.x + v.z * _f.z, aF = (vh - prevVH) / Math.max(dt, 1e-3);
  pitchT = clamp(fwdSpeed * 0.0042 + aF * 0.045, -0.2, 0.24);
  if (S.st === 'outbound') pitchT = clamp(pitchT + 0.12 * (1 - smooth(0, 2.5, S.t)), -0.2, 0.3);   // the nose dips as it moves off
  S.rpm = lerp(S.rpm, S.rpmT ?? 1, 1 - Math.exp(-dt * 0.8));
  const low = S.st === 'landed' ? 0 : smooth(0, 3, p.y - S.gy);
  S.pitch = lerp(S.pitch, pitchT * low, 1 - Math.exp(-dt * 2.2));
  S.roll = lerp(S.roll, clamp(-S.yawRate * vh * 0.04, -0.45, 0.45) * low + (S.st === 'descend' || S.st === 'liftoff' ? Math.sin(S.T * 0.9) * 0.02 * low : 0), 1 - Math.exp(-dt * 2.5));
  S.load = lerp(S.load, S.st === 'landed' ? 0.55 : clamp(0.7 + v.y * 0.06 + vh * 0.006, 0.55, 1.15), 1 - Math.exp(-dt * 1.5));
  common(dt);
}
// every vehicle: the cinematic clock, and the noise that brings the dead
function common(dt) {
  const p = S.pos, lx = C.lz.x, lz = C.lz.z;
  if (S.st === 'liftoff' || S.st === 'outbound') S.camT += dt;
  // it's LOUD: every second the dead hear it (only when it's low over town)
  S.noiseT -= dt;
  if (S.noiseT <= 0) {
    S.noiseT = 1;
    const h = p.y - S.gy, dLZ = Math.hypot(p.x - lx, p.z - lz);
    if (h < 160 && dLZ < 450) C.noise?.(V(p.x, S.gy, p.z), C.noiseRadius * (S.st === 'landed' ? 1 : lerp(1, 0.55, clamp(h / 160, 0, 1))));
  }
}
function steer(want, dt, acc) {
  const dx = want.x - S.vel.x, dz = want.z - S.vel.z, d = Math.hypot(dx, dz), m = Math.min(d, acc * dt);
  if (d > 1e-4) { S.vel.x += dx / d * m; S.vel.z += dz / d * m; }
}
function depart() {
  S.st = 'liftoff'; S.t = 0; S.camT = 0; S.boardT = 0; S.rpmT = MODE === 'heli' ? 1.04 : 1;
  // the lift-off shot starts on the player's side, turned to the first bearing with open ground (not inside a house)
  const ppos = C.playerPos?.(), a0 = ppos ? Math.atan2(ppos.x - S.pos.x, ppos.z - S.pos.z) : S.yaw + Math.PI / 2;
  S.camA = a0;
  if (C.walkable) for (let i = 0; i < 8; i++) {
    const a = a0 + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * Math.PI / 4;
    if (C.walkable(C.lz.x + Math.sin(a) * 11, C.lz.z + Math.cos(a) * 11) && C.walkable(C.lz.x + Math.sin(a) * 20, C.lz.z + Math.cos(a) * 20)) { S.camA = a; break; }
  }
  const ps = S.passengers.slice();
  C.onDepart?.(ps);
  if (!ps.some(isMe)) C.onMissed?.(S.done.indexOf(false) < 0);
}
function gone() {
  H.group.visible = false; if (PL) PL.group.visible = false; if (BT) BT.group.visible = false; H.beam.visible = false; H.spot.intensity = 0; H.lamp.intensity = 0;
  S.st = S.done.indexOf(false) < 0 ? 'over' : 'waiting'; S.pos.y = -500;
  stopSound(); C.onGone?.();
}

// ================================================================== looks
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
// text that always fits its canvas: the font shrinks until the words are no wider than the space (never cut off)
function fitFill(g, txt, x, y, font, maxW) {
  const m = /(\d+)px/.exec(font); let px = m ? +m[1] : 40;
  g.font = font;
  while (m && px > 8 && g.measureText(txt).width > maxW) { px = Math.floor(px * 0.93); g.font = font.replace(m[0], px + 'px'); }
  g.fillText(txt, x, y, maxW);
}
const glowTex = () => canvasTex(64, 64, (g, w) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,0.55)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, w); });

function build() {
  const group = new THREE.Group(); group.name = 'rescueHeli'; group.rotation.order = 'YXZ';
  // skin: olive drab with panel lines, rivets and grime (on the lathe's uv: u around, v along)
  const skin = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#4d5634'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '20,22,12' : '110,115,80'},${Math.random() * 0.06})`; g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 14, 2 + Math.random() * 6); }
    g.strokeStyle = 'rgba(15,17,10,0.55)'; g.lineWidth = 1.5;
    for (const v of [0.12, 0.3, 0.46, 0.62, 0.78, 0.9]) { g.beginPath(); g.moveTo(0, v * h); g.lineTo(w, v * h); g.stroke(); }
    for (const u of [0.08, 0.25, 0.42, 0.58, 0.75, 0.92]) { g.beginPath(); g.moveTo(u * w, 0); g.lineTo(u * w, h); g.stroke(); }
    g.fillStyle = 'rgba(20,22,12,0.5)'; for (let v = 0.12; v < 1; v += 0.16) for (let u = 0; u < 1; u += 0.012) g.fillRect(u * w, v * h - 4, 1.5, 1.5);
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, 'rgba(30,26,18,0.35)'); gr.addColorStop(0.5, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(30,26,18,0.35)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);   // underside dirt
  });
  const M = {
    body: new THREE.MeshStandardMaterial({ map: skin, roughness: 0.62, metalness: 0.25 }),
    olive: new THREE.MeshStandardMaterial({ map: paintedMetalTexture([74, 83, 50]), roughness: 0.6, metalness: 0.25 }),
    dark: new THREE.MeshStandardMaterial({ map: paintedMetalTexture([30, 32, 26]), roughness: 0.75, metalness: 0.4 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x5e615a, roughness: 0.4, metalness: 0.85 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x4a5e68, roughness: 0.08, metalness: 0.15, transparent: true, opacity: 0.5 }),
    inside: new THREE.MeshStandardMaterial({ color: 0x24261f, roughness: 0.9, emissive: 0xffd8a0, emissiveIntensity: 0.08 }),
    blade: new THREE.MeshStandardMaterial({ color: 0x23251f, roughness: 0.55, metalness: 0.3, transparent: true }),
    tip: new THREE.MeshStandardMaterial({ color: 0xd8c040, roughness: 0.5, transparent: true }),
    red: new THREE.MeshBasicMaterial({ color: 0xff2a1a }), green: new THREE.MeshBasicMaterial({ color: 0x30ff60 }), white: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    lens: new THREE.MeshBasicMaterial({ color: 0xfff6dc }),
  };
  const add = (geo, mat, x = 0, y = 0, z = 0, parent = group, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; parent.add(m); return m; };
  // ---- fuselage: a lathe along the length (nose +z), squeezed to a cabin section
  const prof = [[0.02, 4.35], [0.42, 4.2], [0.78, 3.9], [1.02, 3.45], [1.16, 2.8], [1.24, 2.1], [1.26, 0.6], [1.24, -0.8], [1.15, -1.8], [0.92, -2.45], [0.55, -2.9]];
  const latheAlong = (pts, segs, phiS = 0, phiL = Math.PI * 2) => new THREE.LatheGeometry(pts.slice().sort((a, b) => a[1] - b[1]).map(([r, z]) => new THREE.Vector2(r, z)), segs, phiS, phiL).rotateX(Math.PI / 2);
  const FY = 1.95, SX = 0.86, SY = 0.95;
  const rAt = z => { for (let i = 1; i < prof.length; i++) if (z >= prof[i][1]) { const [r0, z0] = prof[i - 1], [r1, z1] = prof[i]; return lerp(r1, r0, (z - z1) / (z0 - z1)); } return prof[prof.length - 1][0]; };
  // the skin in three pieces so the left-side doorway is a real hole: nose, the door section (with a gap in its turn), tail
  const dZ0 = -0.9, dZ1 = 1.35, dY0 = 0.92, dY1 = 2.55, dzc = (dZ0 + dZ1) / 2, dzl = dZ1 - dZ0;
  const cut = (a, b) => [[rAt(b), b], ...prof.filter(([, z]) => z < b && z > a), [rAt(a), a]];
  const ph0 = Math.acos(clamp(-(dY0 - FY) / (1.26 * SY), -1, 1)) - 0.04, ph1 = Math.acos(clamp(-(dY1 - FY) / (1.26 * SY), -1, 1)) + 0.02;   // phi = pi/2 is the left side
  for (const [pts, seg, a, l] of [[cut(dZ1, 4.35), 40, 0, Math.PI * 2], [cut(dZ0, dZ1), 34, ph1, Math.PI * 2 - (ph1 - ph0)], [cut(-2.9, dZ0), 40, 0, Math.PI * 2]]) {
    const m = add(latheAlong(pts, seg, a, l).scale(SX, SY, 1), M.body, 0, FY, 0); m.receiveShadow = true;
  }
  // cockpit glass: the upper nose (top is phi = pi on this lathe), with frame bars
  const gl = prof.filter(([, z]) => z <= 4.05 && z >= 2.3).map(([r, z]) => [r * 1.012, z]);
  add(latheAlong(gl, 32, Math.PI - 1.75, 3.5).scale(SX, SY, 1), M.glass, 0, FY, 0);
  add(latheAlong([[0.5, 3.0], [0.62, 2.6]].map(([r, z]) => [rAt(z) * 1.02, z]), 12, -0.9, 1.8).scale(SX, SY, 1), M.glass, 0, FY - 0.05, 0);   // chin windows
  for (const a of [Math.PI, Math.PI - 0.95, Math.PI + 0.95, Math.PI - 1.75, Math.PI + 1.75]) {
    const bar = add(latheAlong(prof.filter(([, z]) => z <= 4.1 && z >= 2.25).map(([r, z]) => [r * 1.02, z]), 1, a - 0.025, 0.05).scale(SX, SY, 1), M.olive, 0, FY, 0); bar.castShadow = false;
  }
  add(latheAlong([[rAt(2.32) * 1.02, 2.34], [rAt(2.25) * 1.02, 2.24]], 24, Math.PI - 1.8, 3.6).scale(SX, SY, 1), M.olive, 0, FY, 0);   // the frame at the back of the glass
  // cabin floor slab + roof deck + engine cowl, exhausts, intakes
  add(new THREE.BoxGeometry(1.9, 0.18, 4.4), M.dark, 0, 0.82, 0.2);
  add(new THREE.BoxGeometry(1.35, 0.6, 3.2), M.olive, 0, 3.05, -0.6);
  const cowl = add(new THREE.CapsuleGeometry(0.46, 2.4, 6, 16).rotateX(Math.PI / 2).scale(1.15, 0.85, 1), M.body, 0, 3.4, -0.9);
  for (const sx of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.17, 0.2, 0.5, 14, 1, true).rotateX(Math.PI / 2 - 0.3), M.dark, sx * 0.32, 3.5, -2.45);
    add(new THREE.CircleGeometry(0.2, 16), M.dark, sx * 0.48, 3.42, 0.15, group, 0, sx * 1.2, 0);   // intake grilles
    for (let i = 0; i < 6; i++) add(new THREE.BoxGeometry(0.02, 0.06, 0.9), M.dark, sx * 0.55, 3.25 + i * 0.05, -1.1, group, 0, 0, sx * 0.3).castShadow = false;
  }
  // the open left door: a dark cabin behind, the door slid back along its rail, a step, a grab handle
  const sideX = z => rAt(z) * SX;
  const cabM = new THREE.MeshStandardMaterial({ map: paintedMetalTexture([40, 42, 34]), roughness: 0.95, side: THREE.BackSide, emissive: 0xffc890, emissiveIntensity: 0.06 });
  const cabinBox = add(new THREE.BoxGeometry(1.7, dY1 - dY0, dzl), [new THREE.MeshBasicMaterial({ visible: false }), cabM, cabM, cabM, cabM, cabM], 0, (dY0 + dY1) / 2, dzc); cabinBox.castShadow = false;   // (no wall on the door side: from inside you see out)
  for (const z of [dZ0, dZ1]) add(new THREE.BoxGeometry(0.08, dY1 - dY0, 0.08), M.olive, sideX(z) + 0.02, (dY0 + dY1) / 2, z);   // door frame
  add(new THREE.BoxGeometry(0.08, 0.08, dzl), M.olive, sideX(dzc) + 0.02, dY1, dzc);
  add(new THREE.CylinderGeometry(0.03, 0.03, dzl + 2.2, 8).rotateX(Math.PI / 2), M.metal, sideX(dzc) + 0.08, dY1 + 0.08, dzc - 1.0);   // door rail
  const slid = add(new THREE.BoxGeometry(0.06, dY1 - dY0, dzl * 0.95), M.body, sideX(-1.6) + 0.1, (dY0 + dY1) / 2, -1.6);
  add(new THREE.PlaneGeometry(0.6, 0.45), M.glass, 0.035, 0.35, 0, slid, 0, Math.PI / 2, 0);
  const crossTex = canvasTex(128, 128, (g, w) => { g.fillStyle = '#f2f0e8'; g.fillRect(0, 0, w, w); g.fillStyle = '#c4141a'; g.fillRect(w * 0.38, w * 0.12, w * 0.24, w * 0.76); g.fillRect(w * 0.12, w * 0.38, w * 0.76, w * 0.24); g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, w - 4); });
  const crossM = new THREE.MeshStandardMaterial({ map: crossTex, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 });
  add(new THREE.PlaneGeometry(0.85, 0.85), crossM, 0.04, -0.05, 0, slid, 0, Math.PI / 2, 0);   // cross on the slid-back door
  add(new THREE.BoxGeometry(0.06, 0.05, 2.3), M.metal, sideX(dzc) + 0.1, 0.62, dzc);           // boarding step
  for (const z of [dZ0 - 0.15, dZ1 + 0.1]) add(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 8), M.metal, sideX(z) + 0.08, 1.75, z);   // grab handles
  // right side: the closed door with a window and the big red cross; small windows; both sides: number, ARMY
  const textTex = (txt, w = 512, h = 128, col = '#111408', font = 'bold 86px Arial') => canvasTex(w, h, (g) => { g.clearRect(0, 0, w, h); g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle'; fitFill(g, txt, w / 2, h / 2 + 4, font, w * 0.94); });
  const decal = (tex, w, h, x, y, z, ry, parent = group) => { const m = add(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false }), x, y, z, parent, 0, ry, 0); m.castShadow = false; return m; };
  add(new THREE.PlaneGeometry(dzl, dY1 - dY0), M.olive, -sideX(dzc) - 0.03, (dY0 + dY1) / 2, dzc, group, 0, -Math.PI / 2, 0);
  add(new THREE.PlaneGeometry(1.15, 1.15), crossM, -sideX(dzc) - 0.045, 1.75, dzc + 0.15, group, 0, -Math.PI / 2, 0);
  for (const sx of [-1, 1]) {
    for (const z of [-1.5, -2.15]) add(new THREE.PlaneGeometry(0.45, 0.4), M.glass, sx * (sideX(z) + 0.025), 2.15, z, group, 0, sx * Math.PI / 2, 0);
    decal(textTex('U.S. ARMY'), 1.6, 0.4, sx * 0.43, 2.45, -4.6, sx * Math.PI / 2);
    decal(textTex('7-26113', 512, 128, '#15180c', 'bold 70px Arial'), 1.0, 0.25, sx * 0.4, 2.15, -5.6, sx * Math.PI / 2);
  }
  // red crosses on the nose and the belly, and one on the roof for the people above
  add(new THREE.PlaneGeometry(0.7, 0.7), crossM, 0, FY - 0.42, 4.02, group, -0.65, 0, 0);
  add(new THREE.PlaneGeometry(1.0, 1.0), crossM, 0, 3.36, 0.65, group, -Math.PI / 2, 0, 0);
  add(new THREE.PlaneGeometry(1.1, 1.1), crossM, 0, FY - SY * 1.26 + 0.005, 0.2, group, Math.PI / 2, 0, 0);
  // ---- tail boom, fin, stabilizer, tail rotor
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.5, 6.4, 20), M.body); boom.position.set(0, 2.35, -5.6); boom.rotation.x = Math.PI / 2 - 0.045; boom.castShadow = true; group.add(boom);
  const finS = new THREE.Shape(); finS.moveTo(0, 0); finS.lineTo(-0.55, 0); finS.lineTo(-1.25, 1.85); finS.lineTo(-0.75, 1.85); finS.lineTo(0.2, 0.15); finS.lineTo(0, 0);
  const fin = add(new THREE.ExtrudeGeometry(finS, { depth: 0.12, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1 }).translate(0, 0, -0.06).rotateY(Math.PI / 2), M.olive, 0, 2.45, -8.35);
  add(new THREE.BoxGeometry(2.7, 0.06, 0.62), M.olive, 0, 2.38, -7.3);
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.04, 0.35, 0.5), M.olive, sx * 1.35, 2.45, -7.35);
  add(new THREE.CylinderGeometry(0.06, 0.08, 1.6, 8), M.dark, 0, 2.6, -4.6, group, 0.04 - Math.PI / 2, 0, 0);   // driveshaft cover
  const tailHub = new THREE.Group(); tailHub.position.set(0.25, 4.05, -9.35); group.add(tailHub);
  add(new THREE.CylinderGeometry(0.11, 0.11, 0.22, 12).rotateZ(Math.PI / 2), M.metal, 0, 0, 0, tailHub);
  const tailBlades = new THREE.Group(); tailHub.add(tailBlades);
  for (let i = 0; i < 2; i++) { const b = add(new THREE.BoxGeometry(0.03, 1.3, 0.2).translate(0, 0.65, 0), M.blade, 0.08, 0, 0, tailBlades, i * Math.PI, 0, 0); b.castShadow = false; }
  // ---- skids
  for (const sx of [-1, 1]) {
    const path = new THREE.CatmullRomCurve3([V(sx * 1.3, 0.07, -2.2), V(sx * 1.3, 0.07, 2.4), V(sx * 1.3, 0.16, 2.85), V(sx * 1.3, 0.42, 3.05)]);
    add(new THREE.TubeGeometry(path, 24, 0.055, 8), M.metal);
    for (const z of [-1.1, 1.7]) add(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(V(sx * 1.3, 0.07, z), V(sx * 1.25, 0.75, z), V(sx * 0.55, 0.85, z)), 10, 0.05, 8), M.metal);
  }
  // ---- main rotor: mast, hub, four blades (with yellow tips), and the blur disc
  const rotor = new THREE.Group(); rotor.position.set(0, 4.25, 0); group.add(rotor);
  add(new THREE.CylinderGeometry(0.11, 0.14, 0.75, 12), M.metal, 0, 3.85, 0);
  add(new THREE.CylinderGeometry(0.34, 0.26, 0.22, 16), M.dark, 0, 0, 0, rotor);
  add(new THREE.SphereGeometry(0.16, 12, 8), M.metal, 0, 0.16, 0, rotor);
  const blades = new THREE.Group(); rotor.add(blades);
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group(); arm.rotation.y = i * Math.PI / 2; blades.add(arm);
    const bl = add(new THREE.BoxGeometry(0.52, 0.05, ROTOR_R - 0.3).translate(0, 0, (ROTOR_R - 0.3) / 2 + 0.3), M.blade, 0, 0, 0, arm, -0.025, 0, 0.04); bl.castShadow = true;
    add(new THREE.BoxGeometry(0.53, 0.055, 0.35), M.tip, 0, 0.0, ROTOR_R - 0.15 - 0.2, bl);
    add(new THREE.BoxGeometry(0.18, 0.12, 0.5), M.metal, 0, 0, 0.45, arm);
  }
  const discTex = canvasTex(256, 256, (g, w) => {
    const c = w / 2; g.clearRect(0, 0, w, w);
    for (let r = 0.06; r < 1; r += 0.004) { const a = r < 0.08 ? 0 : 0.1 + 0.1 * r + (r > 0.95 ? 0.02 : 0); g.strokeStyle = r > 0.95 ? `rgba(170,155,70,${a})` : `rgba(28,30,24,${a})`; g.lineWidth = 1.6; g.beginPath(); g.arc(c, c, r * c, 0, Math.PI * 2); g.stroke(); }
    for (let k = 0; k < 4; k++) { const a0 = k * Math.PI / 2; for (let j = 0; j < 18; j++) { g.strokeStyle = `rgba(20,22,18,${0.12 * (1 - j / 18)})`; g.lineWidth = c * 0.9; g.beginPath(); g.arc(c, c, c * 0.52, a0 - j * 0.035, a0 - j * 0.035 + 0.04); g.stroke(); } }
  });
  const discM = new THREE.MeshBasicMaterial({ map: discTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0 });
  const disc = add(new THREE.CircleGeometry(ROTOR_R, 48).rotateX(-Math.PI / 2), discM, 0, 0.02, 0, rotor); disc.castShadow = false;
  const tdiscM = new THREE.MeshBasicMaterial({ map: discTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0 });
  const tdisc = add(new THREE.CircleGeometry(1.32, 24).rotateY(Math.PI / 2), tdiscM, 0.09, 0, 0, tailHub); tdisc.castShadow = false;
  // ---- details: antennas, pitot tubes, searchlight housing, wire cutters, steps
  add(new THREE.CylinderGeometry(0.012, 0.012, 0.9, 6), M.dark, 0.2, 3.55, -2.0, group, -0.5, 0, 0);
  add(new THREE.CylinderGeometry(0.01, 0.01, 0.6, 6), M.dark, -0.3, 0.55, -1.2, group, 0.3, 0, 0);
  for (const sx of [-1, 1]) add(new THREE.CylinderGeometry(0.018, 0.018, 0.55, 6).rotateX(Math.PI / 2), M.metal, sx * 0.3, 3.0, 4.0);
  add(new THREE.BoxGeometry(0.05, 0.7, 0.18), M.metal, 0, 3.35, 3.0, group, 0.6, 0, 0);   // wire cutter
  add(new THREE.CylinderGeometry(0.17, 0.2, 0.22, 14), M.dark, 0, 0.86, 3.2);
  const lensMesh = add(new THREE.CircleGeometry(0.15, 14), M.lens, 0, 0.74, 3.2, group, Math.PI / 2, 0, 0); lensMesh.castShadow = false;
  // ---- people: two pilots behind the glass, a crewman in the door waving you in
  const people = makePeople(M); group.add(people.g);
  const crew = C.crew ? C.crew(group) : people.crewman;
  // ---- lights: nav (red left... port is the left: +x), anti-collision beacons, tail white; plus glow sprites
  const gtex = glowTex(), sprite = (col, s, x, y, z) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: gtex, color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false })); sp.scale.set(s, s, 1); sp.position.set(x, y, z); group.add(sp); return sp; };
  add(new THREE.SphereGeometry(0.06, 8, 6), M.red, 1.38, 2.35, 1.6); add(new THREE.SphereGeometry(0.06, 8, 6), M.green, -1.38, 2.35, 1.6);
  const nav = [sprite(0xff2a1a, 1.4, 1.4, 2.35, 1.6), sprite(0x30ff60, 1.4, -1.4, 2.35, 1.6), sprite(0xffffff, 1.1, 0, 2.55, -9.0)];
  const beacons = [sprite(0xff2010, 2.6, 0, 3.92, -1.9), sprite(0xff2010, 2.6, 0, 0.58, -0.6)];
  add(new THREE.SphereGeometry(0.07, 8, 6), M.red, 0, 3.86, -1.9); add(new THREE.SphereGeometry(0.07, 8, 6), M.red, 0, 0.66, -0.6);
  const spotGlow = sprite(0xfff4d8, 2.2, 0, 0.68, 3.2);
  // the searchlight and the cabin light: always in the scene (intensity 0 when away) so the game never recompiles shaders for them
  const spot = new THREE.SpotLight(0xfff2dc, 0, 240, 0.24, 0.45, 1.0); spot.castShadow = false;
  const lamp = new THREE.PointLight(0xffc890, 0, 9, 1.6);
  // a faint visible beam: an open cone from the lamp to where it lands, brightest at the lamp
  const beamGeo = new THREE.ConeGeometry(1, 1, 28, 1, true).translate(0, -0.5, 0).rotateX(-Math.PI / 2);
  const beamM = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uK: { value: 0.12 } },
    vertexShader: 'varying float vZ; varying vec3 vN; varying vec3 vV; void main(){ vZ = position.z; vec4 mv = modelViewMatrix * vec4(position,1.); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform float uK; varying float vZ; varying vec3 vN; varying vec3 vV; void main(){ float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.5); float a = uK * pow(1. - vZ, 1.6) * edge; gl_FragColor = vec4(vec3(1.,0.95,0.85) * a, a); }' });
  const beam = new THREE.Mesh(beamGeo, beamM); beam.frustumCulled = false;
  const dust = makeDust();
  return { group, M, rotor, blades, disc, discM, tailBlades, tdiscM, tailHub, slid, nav, beacons, spotGlow, spot, lamp, beam, dust, crew, pilots: people.pilots, seated: people.seated, crewWave: 0, rotA: 0, tailA: 0, slidZ0: slid.position.z };
}

// ---- simple figures: an army crewman (flight helmet, visor, olive flight suit, vest) and two pilots' heads and shoulders
function makePeople(M) {
  const g = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ map: fabricTexture([90, 94, 66], 201), roughness: 0.95 }), vest = new THREE.MeshStandardMaterial({ map: fabricTexture([62, 66, 48], 202), roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc08a68, roughness: 0.7 }), helm = new THREE.MeshStandardMaterial({ color: 0x40452e, roughness: 0.45, metalness: 0.2 });
  const visor = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.05, metalness: 0.9 }), glove = new THREE.MeshStandardMaterial({ color: 0x2a2a24, roughness: 0.8 });
  const mesh = (geo, mat, x, y, z, p) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; p.add(m); return m; };
  const head = p => { mesh(new THREE.SphereGeometry(0.11, 14, 10), skin, 0, 0, 0.01, p); const h = mesh(new THREE.SphereGeometry(0.15, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), helm, 0, 0.03, -0.01, p); h.scale.set(1, 1.05, 1.12); mesh(new THREE.SphereGeometry(0.152, 16, 6, -1.1, 2.2, Math.PI * 0.3, Math.PI * 0.2), visor, 0, 0.03, 0, p); mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 6).rotateZ(Math.PI / 2 - 0.3), glove, 0.1, -0.08, 0.1, p); };
  // crewman: kneels on the cabin floor at the door, faces out (+x), left hand on the grab handle, right arm waving
  const cm = new THREE.Group(); cm.position.set(0.78, 0.92, 0.35); cm.rotation.y = Math.PI / 2; g.add(cm);
  for (const sx of [-1, 1]) { const th = mesh(new THREE.BoxGeometry(0.16, 0.16, 0.46), suit, sx * 0.12, 0.42, 0.12, cm); th.rotation.x = 0.15; mesh(new THREE.BoxGeometry(0.14, 0.42, 0.16), suit, sx * 0.12, 0.2, sx > 0 ? 0.33 : -0.1, cm); mesh(new THREE.BoxGeometry(0.15, 0.1, 0.28), glove, sx * 0.12, 0.05, sx > 0 ? 0.38 : -0.04, cm); }
  const torso = new THREE.Group(); torso.position.set(0, 0.5, 0); cm.add(torso);
  mesh(new THREE.BoxGeometry(0.4, 0.55, 0.24), suit, 0, 0.3, 0, torso); mesh(new THREE.BoxGeometry(0.43, 0.4, 0.28), vest, 0, 0.32, 0.01, torso);
  const hd = new THREE.Group(); hd.position.set(0, 0.72, 0.02); torso.add(hd); head(hd);
  const arm = (sx) => { const sh = new THREE.Group(); sh.position.set(sx * 0.25, 0.52, 0); torso.add(sh); mesh(new THREE.BoxGeometry(0.11, 0.3, 0.11).translate(0, -0.15, 0), suit, 0, 0, 0, sh); const el = new THREE.Group(); el.position.set(0, -0.3, 0); sh.add(el); mesh(new THREE.BoxGeometry(0.1, 0.28, 0.1).translate(0, -0.14, 0), suit, 0, 0, 0, el); mesh(new THREE.BoxGeometry(0.09, 0.11, 0.07), glove, 0, -0.32, 0, el); return { sh, el }; };
  const R = arm(-1), L = arm(1);
  L.sh.rotation.set(-0.4, 0, 0.9); L.el.rotation.set(-0.3, 0, 0.5);
  const crewman = {
    update(dt, t, mode) {
      // waving you in while it waits; holding on while it flies; a thumbs-up when someone's in
      const k = mode === 'landed' ? 1 : mode === 'descend' ? 0.6 : 0;
      torso.rotation.x = lerp(torso.rotation.x, 0.12 + 0.08 * Math.sin(t * 1.3) * k, 0.1);
      const big = Math.sin(t * 5.5), come = Math.sin(t * 3.2);
      R.sh.rotation.set(lerp(-0.2, -2.6 + 0.25 * come, k), 0, lerp(-0.2, -0.35 + 0.5 * big, k));
      R.el.rotation.set(lerp(-0.4, -0.6 - 0.6 * Math.max(0, come), k), 0, lerp(0, 0.3 * big, k));
      hd.rotation.y = Math.sin(t * 0.7) * 0.5 * k; hd.rotation.x = -0.1 * k;
    }
  };
  // pilots: seated in the nose, heads turning a little
  const pilots = [];
  for (const sx of [-1, 1]) {
    const p = new THREE.Group(); p.position.set(sx * 0.42, 1.25, 2.55); g.add(p);
    mesh(new THREE.BoxGeometry(0.42, 0.5, 0.3), suit, 0, 0.25, 0, p); mesh(new THREE.BoxGeometry(0.45, 0.36, 0.32), vest, 0, 0.3, 0.01, p);
    const ph = new THREE.Group(); ph.position.set(0, 0.68, 0.03); p.add(ph); head(ph);
    mesh(new THREE.BoxGeometry(0.5, 0.75, 0.1), new THREE.MeshStandardMaterial({ color: 0x2a2c26, roughness: 0.9 }), 0, 0.3, -0.24, p);   // seat back
    pilots.push(ph);
  }
  mesh(new THREE.BoxGeometry(1.4, 0.35, 0.3), new THREE.MeshStandardMaterial({ color: 0x1a1b17, roughness: 0.8, emissive: 0x30ff70, emissiveIntensity: 0.05 }), 0, 1.6, 3.25, g);   // instrument panel
  const seated = makeSeated(g, mesh);
  return { g, crewman, pilots, seated };
}
// the people who made it: up to 8 survivors sitting along the cabin walls (civilian clothes, bare heads), shown one per
// passenger so the lift-off shot has everyone in it. children[0] of each is the head (it looks round)
// the seats, inside the cabin box (z -0.9..1.35): four along the far wall, four in front of them
function heliSeat(i, out) { return out.set(i < 4 ? -0.58 : 0.02, 0.92, 1.05 - 0.55 * (i % 4)); }
const JACKETS = [0x7a2a24, 0x2c4a6e, 0x5b5f3a, 0x8a6a3a, 0x3a3a40, 0x6a3a6a, 0x2f5a4a, 0x9a8a70];
const SKINS = [0xc08a68, 0x8a5a3e, 0xe0b090, 0x6a4430, 0xd09a78];
const HAIRS = [0x2a1d14, 0x14100c, 0x6a4a2a, 0x9a7a4a, 0x3a2a1e];
function makeSeated(g, mesh) {
  const seatM = new THREE.MeshStandardMaterial({ map: fabricTexture([60, 64, 48], 203), roughness: 0.95 }), metalM = new THREE.MeshStandardMaterial({ color: 0x8a8c88, roughness: 0.4, metalness: 0.8 });
  const EYE = new THREE.SphereGeometry(0.011, 8, 6), BROW = new THREE.BoxGeometry(0.03, 0.007, 0.01), NOSE = new THREE.BoxGeometry(0.018, 0.035, 0.025), MOUTH = new THREE.BoxGeometry(0.035, 0.007, 0.01);
  const eyeM = new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: 0.3 }), lipM = new THREE.MeshStandardMaterial({ color: 0x7a3a34, roughness: 0.7 });
  const out = [], jeans = new THREE.MeshStandardMaterial({ map: fabricTexture([46, 58, 82], 204), roughness: 0.95 }), shoe = new THREE.MeshStandardMaterial({ color: 0x1c1a18, roughness: 0.8 });
  for (let i = 0; i < 8; i++) {
    const jc = new THREE.Color(JACKETS[i]), jk = new THREE.MeshStandardMaterial({ map: fabricTexture([jc.r * 255 | 0, jc.g * 255 | 0, jc.b * 255 | 0], 210 + i), roughness: 0.9 }), sk = new THREE.MeshStandardMaterial({ color: SKINS[i % SKINS.length], roughness: 0.7 });
    const hr = new THREE.MeshStandardMaterial({ color: HAIRS[(i * 3) % HAIRS.length], roughness: 0.95 });
    const p = new THREE.Group(); heliSeat(i, p.position); p.rotation.y = Math.PI / 2 + (i < 4 ? 0 : 0.25); p.visible = false; g.add(p);   // facing the open door
    const hd = new THREE.Group(); hd.position.set(0, 1.12, 0.02); p.add(hd);
    mesh(new THREE.SphereGeometry(0.1, 14, 10), sk, 0, 0, 0, hd).scale.set(0.92, 1.08, 1);
    const hair = mesh(new THREE.SphereGeometry(0.106, 14, 8, 0, Math.PI * 2, 0, Math.PI * (0.45 + 0.12 * (i % 3))), hr, 0, 0.012, -0.012, hd); hair.scale.set(0.95, 1.05, 1.05);
    mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.1, 8), sk, 0, -0.12, 0, hd);
    for (const ex of [-0.034, 0.034]) { mesh(EYE, eyeM, ex, 0.018, 0.088, hd); mesh(BROW, hr, ex, 0.045, 0.09, hd); }   // eyes, brows, nose, mouth
    mesh(NOSE, sk, 0, -0.005, 0.1, hd); mesh(MOUTH, lipM, 0, -0.045, 0.088, hd);
    mesh(new THREE.BoxGeometry(0.4, 0.5, 0.22), jk, 0, 0.75, -0.02, p).rotation.x = -0.06;
    mesh(new THREE.BoxGeometry(0.5, 0.07, 0.46), seatM, 0, 0.36, 0.12, p); mesh(new THREE.BoxGeometry(0.5, 0.55, 0.05), seatM, 0, 0.66, -0.16, p);   // the jump seat: canvas on a frame
    for (const sx of [-1, 1]) mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.34, 6), metalM, sx * 0.22, 0.17, 0.3, p);            // torso, leaning back on the wall
    for (const sx of [-1, 1]) {
      mesh(new THREE.BoxGeometry(0.15, 0.14, 0.44), jeans, sx * 0.1, 0.46, 0.18, p);                 // thighs on the bench
      mesh(new THREE.BoxGeometry(0.13, 0.44, 0.13), jeans, sx * 0.1, 0.22, 0.38, p);                  // shins down to the floor
      mesh(new THREE.BoxGeometry(0.12, 0.08, 0.24), shoe, sx * 0.1, 0.04, 0.44, p);
      const ua = mesh(new THREE.BoxGeometry(0.1, 0.3, 0.11), jk, sx * 0.24, 0.82, 0.04, p); ua.rotation.x = -0.35;   // arms resting on the knees
      mesh(new THREE.BoxGeometry(0.09, 0.09, 0.3), jk, sx * 0.21, 0.62, 0.26, p);
      mesh(new THREE.BoxGeometry(0.08, 0.06, 0.1), sk, sx * 0.17, 0.6, 0.44, p);
    }
    out.push(p);
  }
  return out;
}

// ---- rotor-wash dust: a ring of billowing brown clouds blown out along the ground (instanced soft billboards)
function makeDust() {
  const N = 420;
  const tex = canvasTex(64, 64, (g, w) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,0.9)'); r.addColorStop(0.5, 'rgba(255,255,255,0.4)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, w); for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`; g.beginPath(); g.arc(32 + rnd(18), 32 + rnd(18), 2 + Math.random() * 6, 0, 7); g.fill(); } }, false);
  const geo = new THREE.InstancedBufferGeometry(); const base = new THREE.PlaneGeometry(1, 1);
  geo.index = base.index; geo.setAttribute('position', base.attributes.position); geo.setAttribute('uv', base.attributes.uv);
  const off = new Float32Array(N * 3), dat = new Float32Array(N * 3);   // dat: size, alpha, spin
  const aOff = new THREE.InstancedBufferAttribute(off, 3), aDat = new THREE.InstancedBufferAttribute(dat, 3);
  aOff.setUsage(THREE.DynamicDrawUsage); aDat.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aOff', aOff); geo.setAttribute('aDat', aDat); geo.instanceCount = N;
  const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { map: { value: tex }, uCol: { value: new THREE.Color(0.55, 0.47, 0.36) } },
    // (a cloud right in front of the lens fades out and never grows bigger than the view: no brown wall over the screen)
    vertexShader: 'attribute vec3 aOff; attribute vec3 aDat; varying vec2 vUv; varying float vA; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(aOff, 1.); float dist = -mv.z; vA = aDat.y * smoothstep(2.5, 10., dist); float sz = min(aDat.x, max(0.4, dist * 0.55)); float c = cos(aDat.z), s = sin(aDat.z); vec2 q = vec2(c * position.x - s * position.y, s * position.x + c * position.y) * sz; mv.xy += q; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform sampler2D map; uniform vec3 uCol; varying vec2 vUv; varying float vA; void main(){ vec4 t = texture2D(map, vUv); float a = t.a * vA; if (a < 0.004) discard; gl_FragColor = vec4(uCol * (0.75 + 0.25 * t.r), a); }' });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 3;
  const P = []; for (let i = 0; i < N; i++) P.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 1, g: 1, r: 0, vr: 0 });
  let next = 0, acc = 0;
  const D = {
    mesh, rate: 0, cx: 0, cy: 0, cz: 0, rad: 1, spd: 1,
    clear() { for (const p of P) p.life = 0; dat.fill(0); aDat.needsUpdate = true; },
    update(dt) {
      acc += D.rate * dt;
      while (acc >= 1) {
        acc -= 1; const p = P[next++ % N], a = Math.random() * Math.PI * 2, r = (1.5 + Math.random() * 5) * D.rad, sp = (7 + Math.random() * 10) * D.spd;
        Object.assign(p, { life: 0.001, max: 1.8 + Math.random() * 2.2, x: D.cx + Math.sin(a) * r, y: D.cy + 0.3 + Math.random() * 0.5, z: D.cz + Math.cos(a) * r, vx: Math.sin(a) * sp, vy: 0.4 + Math.random() * 1.6, vz: Math.cos(a) * sp, s: 1.2 + Math.random() * 1.5, g: 2.5 + Math.random() * 2.5, r: Math.random() * 6, vr: rnd(0.8) });
      }
      let live = 0;
      for (let i = 0; i < N; i++) {
        const p = P[i];
        if (p.life <= 0) { if (dat[i * 3 + 1] !== 0) { dat[i * 3 + 1] = 0; live++; } continue; }
        p.life += dt; if (p.life >= p.max) { p.life = 0; dat[i * 3 + 1] = 0; live++; continue; }
        const dr = Math.exp(-1.4 * dt); p.vx *= dr; p.vz *= dr; p.vy = p.vy * Math.exp(-0.8 * dt) + 0.15 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.r += p.vr * dt;
        const k = p.life / p.max;
        off[i * 3] = p.x; off[i * 3 + 1] = p.y; off[i * 3 + 2] = p.z;
        dat[i * 3] = p.s + p.g * k * 2.2; dat[i * 3 + 1] = Math.min(1, k * 8) * (1 - k) * (1 - k) * 0.55; dat[i * 3 + 2] = p.r; live++;
      }
      if (live) { aOff.needsUpdate = true; aDat.needsUpdate = true; }
    },
  };
  return D;
}

// ================================================================== per-frame animation
const _t = V(), _l = V(), _q = V();
function animate(dt) {
  if (MODE !== 'heli') { if (VEH().group.visible) animateOther(dt); return; }
  if (!H.group.visible) return;
  const g = H.group, t = S.T, h = S.pos.y - S.gy;
  H.seated.forEach((p, i) => { p.visible = i < S.passengers.length; if (p.visible) p.children[0].rotation.y = Math.sin(t * 0.6 + i) * 0.3; });
  g.position.copy(S.pos);
  if (S.st === 'landed') { S.settle = Math.max(0, S.settle - dt * 1.6); g.position.y -= Math.sin((1 - S.settle) * Math.PI * 2) * 0.05 * S.settle; }   // a little bounce on the skids
  g.rotation.set(S.pitch, S.yaw, S.roll);
  // rotors: real spin underneath, the blades fade and the blur disc shows as the speed comes up
  H.rotA += S.rpm * ROTOR_RPS * Math.PI * 2 * dt; H.blades.rotation.y = H.rotA;
  H.disc.rotation.y = -t * 0.9;                       // the slow "strobe" turn you see on video
  const blur = smooth(0.35, 0.9, S.rpm);
  H.M.blade.opacity = 1 - 0.82 * blur; H.M.tip.opacity = 1 - 0.7 * blur; H.discM.opacity = 0.6 * blur;
  H.tailA += S.rpm * 26 * dt; H.tailBlades.rotation.x = H.tailA; H.tdiscM.opacity = 0.8 * blur;
  // the side door: open while it's coming down and waiting, slides shut as it goes
  const open = S.st === 'landed' || S.st === 'descend' || (S.st === 'inbound' && h < 70);
  S.door = lerp(S.door, open ? 1 : 0, 1 - Math.exp(-dt * (open ? 1.5 : 0.9)));
  H.slid.position.z = H.slidZ0 + (1 - S.door) * 1.83;   // slid back along the rail when open, over the doorway when shut
  H.crew.update?.(dt, t, S.st);
  H.pilots.forEach((p, i) => { p.rotation.y = Math.sin(t * 0.4 + i * 2) * 0.35; });
  // lights: nav steady, beacons double-flash, tail strobe
  const ph = t % 1.1, flash = (ph < 0.08 || (ph > 0.18 && ph < 0.26)) ? 1 : 0;
  H.beacons.forEach((b, i) => { b.material.opacity = i ? (((t + 0.55) % 1.1) < 0.08 ? 1 : 0) : flash; });
  H.nav[2].material.opacity = (t % 1.6) < 0.06 ? 1 : 0.15;
  { const nk = 1 - (C.daylight ? C.daylight() : 0); for (let i = 0; i < 2; i++) { H.nav[i].material.opacity = 0.2 + 0.8 * nk; H.nav[i].scale.setScalar(0.6 + 0.8 * nk); } }   // a glow at night, just the lamp by day
  // the searchlight: sweeps the ground ahead on the way in, circles the landing zone while it waits
  const night = 1 - (C.daylight ? C.daylight() : 0);
  g.localToWorld(_l.set(0, 0.62, 3.2));
  if (S.st === 'inbound') { _f.set(Math.sin(S.yaw), 0, Math.cos(S.yaw)); const s = Math.sin(t * 0.45) * 22; _t.set(S.pos.x + _f.x * 55 + _f.z * s, S.gy, S.pos.z + _f.z * 55 - _f.x * s); }
  else if (S.st === 'descend' || S.st === 'landed') { const a = t * 0.55, r = 13 + 7 * Math.sin(t * 0.31); _t.set(C.lz.x + Math.sin(a) * r, S.gy, C.lz.z + Math.cos(a) * r); }
  else _t.set(C.lz.x + Math.sin(t * 0.4) * 6, S.gy, C.lz.z + Math.cos(t * 0.4) * 6);
  H.spot.target.position.lerp(_t, S.st === 'inbound' && S.t < 0.1 ? 1 : 1 - Math.exp(-dt * 2.5));
  H.spot.position.copy(_l);
  H.spot.intensity = 650 * (0.35 + 0.65 * night);
  const len = _l.distanceTo(H.spot.target.position) * 1.05, rad = len * Math.tan(H.spot.angle) * 0.85;
  H.beam.position.copy(_l); H.beam.lookAt(H.spot.target.position); H.beam.scale.set(rad, rad, len);
  H.beam.material.uniforms.uK.value = 0.14 * night + 0.02;
  H.spotGlow.material.opacity = 0.6 + 0.4 * night;
  // the warm cabin light falls out of the open door (helps you find it in the dark)
  g.localToWorld(_q.set(1.2, 2.0, 0.25)); H.lamp.position.copy(_q); H.lamp.intensity = 8 * S.door * (0.3 + 0.7 * night);
  H.M.inside.emissiveIntensity = 0.08 + 0.25 * S.door * night;
  // rotor wash: dust below it when it's low, and the trees and grass bend (the lead's hook)
  const wash = S.rpm * (1 - smooth(4, 26, h)) * (S.st === 'landed' ? (S.passengers.some(isMe) ? 0.3 : 0.75) : 1);   // (from inside: a haze, not a wall)
  H.dust.rate = wash * 110; H.dust.cx = S.pos.x; H.dust.cy = S.gy; H.dust.cz = S.pos.z; H.dust.rad = 1; H.dust.spd = 1;
  const lit = clamp((C.daylight ? C.daylight() : 1) * 0.85 + 0.12 + 0.25 * night, 0.1, 1);
  H.discM.color.setScalar(0.3 + 0.7 * (1 - night)); H.tdiscM.color.copy(H.discM.color);
  H.dust.mesh.material.uniforms.uCol.value.setRGB(0.55 * lit, 0.47 * lit, 0.36 * lit);
  if (wash > 0.05) C.sway?.(S.pos.x, S.pos.z, 18 * wash + 6, wash);
}

// ================================================================== sound
// Blade-pass thump: filtered noise whose loudness is pulsed ~20 times a second by a sharp periodic wave; a low brown-noise
// "whomp" on the same pulse; a turbine whine (two high tones, Doppler-shifted); a tail-rotor buzz. All through one
// distance panner (heard across town) and an "air" low-pass that dulls it far away.
function audioCtx() { const r = C.audio ? C.audio() : null; return r && r.ctx ? r : null; }
function startSound() {
  const A = audioCtx(); if (!A) return;
  const ac = A.ctx, t = ac.currentTime;
  const noise = (sec, brown) => { const b = ac.createBuffer(1, ac.sampleRate * sec, ac.sampleRate), d = b.getChannelData(0); let l = 0; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; if (brown) { l = (l + 0.02 * w) / 1.02; d[i] = l * 3.5; } else d[i] = w; } const s = ac.createBufferSource(); s.buffer = b; s.loop = true; return s; };
  // pulse shape: sharp blade slaps (harmonics falling slowly), normalised so the gain runs 0..1 around 0.5
  const n = 12, re = new Float32Array(n), im = new Float32Array(n); for (let k = 1; k < n; k++) re[k] = Math.exp(-k * 0.28);
  const pulse = ac.createPeriodicWave(re, im);
  const lfo = ac.createOscillator(); lfo.setPeriodicWave(pulse); lfo.frequency.value = ROTOR_RPS * 4;
  const mix = ac.createGain(); mix.gain.value = 1;
  // chop: band of noise, pulsed
  const n1 = noise(2.3, false), bp = ac.createBiquadFilter(); bp.type = 'lowpass'; bp.frequency.value = 1100; bp.Q.value = 0.8;
  const chop = ac.createGain(); chop.gain.value = 0.35; const d1 = ac.createGain(); d1.gain.value = 0.32; lfo.connect(d1).connect(chop.gain);
  n1.connect(bp).connect(chop).connect(mix);
  // whomp: low brown noise on the same pulse
  const n2 = noise(3.1, true), lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160;
  const whomp = ac.createGain(); whomp.gain.value = 0.7; const d2 = ac.createGain(); d2.gain.value = 0.7; lfo.connect(d2).connect(whomp.gain);
  n2.connect(lp).connect(whomp).connect(mix);
  // turbine whine + a breathy jet hiss
  const w1 = ac.createOscillator(); w1.type = 'sine'; w1.frequency.value = 2950;
  const w2 = ac.createOscillator(); w2.type = 'triangle'; w2.frequency.value = 5870;
  const vib = ac.createOscillator(); vib.frequency.value = 0.4; const vg = ac.createGain(); vg.gain.value = 14; vib.connect(vg); vg.connect(w1.frequency); vg.connect(w2.frequency);
  const wg = ac.createGain(); wg.gain.value = 0.022; w1.connect(wg); const wg2 = ac.createGain(); wg2.gain.value = 0.008; w2.connect(wg2); wg.connect(mix); wg2.connect(mix);
  const n3 = noise(1.7, false), hb = ac.createBiquadFilter(); hb.type = 'bandpass'; hb.frequency.value = 2400; hb.Q.value = 0.6; const hg = ac.createGain(); hg.gain.value = 0.05; n3.connect(hb).connect(hg).connect(mix);
  // tail rotor buzz
  const tr = ac.createOscillator(); tr.type = 'sawtooth'; tr.frequency.value = 58; const tl = ac.createBiquadFilter(); tl.type = 'lowpass'; tl.frequency.value = 500; const tg = ac.createGain(); tg.gain.value = 0.05; tr.connect(tl).connect(tg).connect(mix);
  // air absorption + level + position
  const air = ac.createBiquadFilter(); air.type = 'lowpass'; air.frequency.value = 2000; air.Q.value = 0.5;
  const vol = ac.createGain(); vol.gain.value = 0;
  const pan = ac.createPanner(); pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse'; pan.refDistance = 22; pan.rolloffFactor = 0.85; pan.maxDistance = 10000;
  mix.connect(air).connect(vol).connect(pan).connect(A.out || ac.destination);
  const srcs = [n1, n2, n3, w1, w2, vib, tr, lfo]; srcs.forEach(s => s.start(t));
  SN = { ac, srcs, lfo, w1, w2, tr, air, vol, pan, chop, whomp, bp, wg, wg2, tg };
}
function stopSound() {
  if (!SN) return;
  const { ac, srcs, vol } = SN, t = ac.currentTime;
  vol.gain.cancelScheduledValues(t); vol.gain.setTargetAtTime(0, t, 0.3);
  srcs.forEach(s => { try { s.stop(t + 1.5); } catch { } });
  setTimeout(() => { try { vol.disconnect(); } catch { } }, 1800);
  SN = null;
}
function sound(dt) {
  const flying = S.st !== 'waiting' && S.st !== 'over';
  if (flying && !SN) startSound();
  if (!SN) return;
  const { ac, pan } = SN, t = ac.currentTime, p = S.pos;
  const set = (prm, v, tc = 0.08) => prm.setTargetAtTime(v, t, tc);
  if (pan.positionX) { set(pan.positionX, p.x, 0.03); set(pan.positionY, p.y + 3, 0.03); set(pan.positionZ, p.z, 0.03); } else pan.setPosition(p.x, p.y + 3, p.z);
  // distance from the listener (the camera) for Doppler and air absorption
  const lp = C.camera ? C.camera.position : (C.playerPos?.() || V()), d = Math.hypot(p.x - lp.x, p.y - lp.y, p.z - lp.z);
  const vr = S.lastDist == null ? 0 : (d - S.lastDist) / Math.max(dt, 1e-3); S.lastDist = d;
  const dop = clamp(343 / (343 + clamp(vr, -120, 120)), 0.75, 1.3);
  const load = S.load;
  if (MODE !== 'heli') {
    // a light plane: a 4-cylinder engine through a two-blade prop (a buzzing ~80 Hz thrum); the launch: a big outboard
    const pl = MODE === 'plane', r = S.rpm;
    set(SN.lfo.frequency, (pl ? 82 : 21) * r * dop, 0.25);
    set(SN.tr.frequency, (pl ? 112 : 48) * r * dop, 0.25); set(SN.tg.gain, pl ? 0.1 : 0.16, 0.3);
    set(SN.wg.gain, 0, 0.2); set(SN.wg2.gain, 0, 0.2);
    set(SN.bp.frequency, pl ? 500 + 700 * r : 300 + 500 * r, 0.3); set(SN.whomp.gain, pl ? 0.25 : 0.55, 0.3);
    set(SN.air.frequency, clamp(16000 * Math.exp(-d / 210), 380, 16000), 0.15);
    const fin = S.st === 'inbound' ? smooth(0, 3, S.t) : 1;
    set(SN.vol.gain, muted ? 0 : (pl ? 2.0 : 1.4) * fin * (0.5 + 0.6 * r), 0.15);
    return;
  }
  set(SN.tg.gain, 0.05, 0.3); set(SN.wg.gain, 0.022, 0.3); set(SN.wg2.gain, 0.008, 0.3);
  const rate = ROTOR_RPS * 4 * S.rpm * (0.97 + 0.06 * load) * dop;
  set(SN.lfo.frequency, rate, 0.2);
  set(SN.w1.frequency, 2950 * (0.94 + 0.08 * load) * dop, 0.3); set(SN.w2.frequency, 5870 * (0.94 + 0.08 * load) * dop, 0.3);
  set(SN.tr.frequency, 58 * dop * (0.97 + 0.05 * load), 0.3);
  set(SN.bp.frequency, 700 + 900 * load, 0.3);
  set(SN.whomp.gain, 0.45 + 0.45 * load, 0.3);
  set(SN.air.frequency, clamp(16000 * Math.exp(-d / 210), 380, 16000), 0.15);
  const fadeIn = S.st === 'inbound' ? smooth(0, 3, S.t) : 1;
  set(SN.vol.gain, muted ? 0 : 2.6 * fadeIn * (0.8 + 0.3 * load), 0.15);
}

// ================================================================== the countdown and the marker
function makeUI() {
  const style = document.createElement('style');
  style.textContent = `
#heliUI{position:fixed;left:50%;top:max(8vh,96px);transform:translateX(-50%);width:max-content;max-width:min(92vw,900px);box-sizing:border-box;text-align:center;pointer-events:none;z-index:45;color:#fff;font-family:"Helvetica Neue",Arial,sans-serif;text-shadow:0 2px 6px rgba(0,0,0,.85),0 0 22px rgba(0,0,0,.6);display:none;user-select:none;overflow-wrap:break-word}
#heliUI.on{display:block}
#heliUI .hTop{font-size:13px;letter-spacing:.32em;color:#ffd48a;font-weight:700;margin-bottom:2px}
#heliUI .hT{font-size:88px;font-weight:800;line-height:1.05;font-variant-numeric:tabular-nums;letter-spacing:.02em}
#heliUI .hL{font-size:22px;font-weight:800;letter-spacing:.18em;margin-top:6px;line-height:1.25}
#heliUI .hS{font-size:14px;opacity:.85;margin-top:6px;letter-spacing:.06em}
#heliUI .hK{display:inline-block;margin-top:10px;padding:6px 14px;border:2px solid #fff;border-radius:6px;font-weight:800;letter-spacing:.12em;font-size:16px;background:rgba(0,0,0,.35);visibility:hidden}
#heliUI .hK.on{visibility:visible;animation:heliPulse .7s ease-in-out infinite alternate}
#heliUI .hK.ctx{display:none}
#heliUI.low .hT{color:#ff4a3a;animation:heliPulse .5s ease-in-out infinite alternate}
#heliUI.inb .hT{display:none}
#heliUI.inb .hL{font-size:20px;color:#ffd48a}
@keyframes heliPulse{from{transform:scale(1)}to{transform:scale(1.06)}}
#heliMark{position:fixed;left:0;top:0;pointer-events:none;z-index:44;display:none;color:#ffe2a0;font:800 12px/1.2 "Helvetica Neue",Arial,sans-serif;letter-spacing:.14em;text-align:center;text-shadow:0 1px 4px #000;transform:translate(-50%,-100%);white-space:nowrap}
#heliMark.on{display:block}
#heliMark .hA{width:0;height:0;margin:4px auto 0;border-left:11px solid transparent;border-right:11px solid transparent;border-top:16px solid #ffd060;filter:drop-shadow(0 1px 3px #000);animation:heliBob .8s ease-in-out infinite alternate}
#heliMark.edge{transform:translate(-50%,-50%)}
#heliMark.edge .hA{animation:none}
@keyframes heliBob{from{transform:translateY(0)}to{transform:translateY(6px)}}
@media (max-width:600px){#heliUI .hT{font-size:64px}#heliUI .hL{font-size:17px;letter-spacing:.12em}}
@media (max-height:560px){#heliUI .hTop{font-size:11px}#heliUI .hT{font-size:50px}#heliUI .hL,#heliUI.inb .hL{font-size:15px;letter-spacing:.1em;margin-top:3px}#heliUI .hS{font-size:12px;margin-top:3px}#heliUI .hK{font-size:13px;margin-top:6px;padding:4px 10px}}`;
  document.head.appendChild(style);
  const root = document.createElement('div'); root.id = 'heliUI';
  root.innerHTML = '<div class="hTop"></div><div class="hT">1:00</div><div class="hL"></div><div class="hS"></div><div class="hK"></div>';
  const mark = document.createElement('div'); mark.id = 'heliMark'; mark.innerHTML = '<div class="hN"></div><div class="hA"></div>';
  document.body.append(root, mark);
  const ui = { style, root, mark, top: root.querySelector('.hTop'), T: root.querySelector('.hT'), L: root.querySelector('.hL'), S: root.querySelector('.hS'), K: root.querySelector('.hK'), N: mark.querySelector('.hN'), A: mark.querySelector('.hA'), last: '', clockT: 0, clockB: 0 };
  ui.top.textContent = topName();
  return ui;
}
function showUI(mode) {
  if (!UI) return; UI.root.classList.toggle('on', !!mode); UI.mark.classList.toggle('on', !!mode);
  if (document.body) document.body.classList.toggle('heliOn', !!mode);
}
const setTxt = (el, t) => { if (el.textContent !== t) el.textContent = t; };
// the bottom of the game clock (top centre) — the countdown and the marker stay below it
function clockBottom() {
  if (--UI.clockT > 0) return UI.clockB;
  UI.clockT = 30; const c = document.getElementById('clock'), r = c ? c.getBoundingClientRect() : null;   // (0 x 0 when it's hidden)
  return (UI.clockB = r && r.height ? r.bottom : 0);
}
const _m = V();
function ui() {
  if (!UI) return;
  const st = S.st, show = uiOn && (st === 'inbound' || st === 'descend' || st === 'landed' || st === 'orbit');
  if (!show) { showUI(null); return; }
  showUI(true);
  { const cb = clockBottom(), t = Math.round(Math.max(innerHeight * 0.08, cb + 8)) + 'px'; if (UI.root.style.top !== t) UI.root.style.top = t; }
  setTxt(UI.top, topName());
  const me = C.playerPos?.() || (C.camera && C.camera.position);
  const target = st === 'landed' ? doorPos(_m) : lzPos(_m), dist = me ? Math.round(Math.hypot(target.x - me.x, target.z - me.z)) : 0;
  UI.root.classList.toggle('inb', st !== 'landed');
  if (st === 'landed') {
    const s = Math.max(0, Math.ceil(S.boardT)), txt = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    if (UI.T.textContent !== txt) UI.T.textContent = txt;
    UI.root.classList.toggle('low', s <= 15);
    const aboard = S.passengers.some(isMe);
    setTxt(UI.L, aboard ? 'YOU\'RE ON BOARD · WAITING FOR STRAGGLERS' : (C.ending?.prompt || (MODE === 'heli' ? 'Get in the ' : MODE === 'plane' ? 'Board the ' : 'Get on the ') + rideName()).toUpperCase());
    setTxt(UI.S, `${C.lzName} · ${dist} m`);
    const can = me && canBoard(me) && !S.passengers.includes('player');
    // the game's own prompt ([E] Board the RIO LENTO) is up: don't say it twice
    const pr = document.getElementById('prompt'), ctx = !!(pr && pr.textContent.trim() && (!pr.checkVisibility || pr.checkVisibility()));
    setTxt(UI.K, `[${C.boardKey}] ${MODE === 'heli' ? 'CLIMB IN' : 'GET ON BOARD'}`); UI.K.classList.toggle('on', !!can && !ctx); UI.K.classList.toggle('ctx', ctx);
  } else {
    UI.root.classList.remove('low');
    const where = MODE === 'plane' ? 'THE AIRSTRIP' : MODE === 'boat' ? 'THE DOCK' : 'THE LANDING ZONE', nm = rideName();
    setTxt(UI.L, st === 'orbit' ? 'IT CAN\'T LAND — IT\'S CIRCLING' : st === 'descend' ? (MODE === 'plane' ? `IT'S DOWN — GET TO THE ${nm}` : MODE === 'boat' ? 'IT\'S DOCKING — GET TO THE DOCK' : 'IT\'S LANDING — GET TO THE LANDING ZONE') : `${named() ? 'THE ' + nm : 'INBOUND'} — GET TO ${where}`);
    setTxt(UI.S, `${C.lzName} · ${dist} m`); UI.K.classList.remove('on');
  }
  // the marker over the door (or the landing zone): on screen it bobs above the spot; off screen it sits on the edge and points
  // (not once you're aboard: you're sitting in it)
  const aboardNow = st === 'landed' && S.passengers.some(isMe), atIt = st === 'landed' && dist < 4;   // (right by the door: the prompt says it)
  UI.mark.classList.toggle('on', !aboardNow && !atIt);
  if (!C.camera || aboardNow || atIt) return;
  const tgt = st === 'landed' ? doorPos(_m).setY(S.gy + 3.2) : (st === 'descend' ? _m.copy(S.pos).setY(S.pos.y + 5) : lzPos(_m).setY(lzPos(_m).y + 3));
  const v = tgt.clone().project(C.camera), W = innerWidth, Hh = innerHeight;
  const behind = v.z > 1;
  let x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * Hh;
  if (behind) { x = W - x; y = Hh - y; }
  const m = 40, top = Math.max(120, clockBottom() + 12), inside = !behind && x > m && x < W - m && y > top && y < Hh - m;
  setTxt(UI.N, `${st === 'landed' ? rideName() : MODE === 'plane' ? 'AIRSTRIP' : MODE === 'boat' ? 'DOCK' : 'LANDING ZONE'} ${dist} m`);
  if (inside) { UI.mark.classList.remove('edge'); UI.A.style.transform = ''; }
  else {
    const cx = W / 2, cy = Hh / 2, dx = x - cx, dy = y - cy, k = Math.min((W / 2 - m) / Math.abs(dx || 1e-3), (Hh / 2 - m) / Math.abs(dy || 1e-3));
    x = cx + dx * k; y = cy + dy * k;
    UI.mark.classList.add('edge'); UI.A.style.transform = `rotate(${Math.atan2(dy, dx) * 180 / Math.PI - 90}deg)`;
  }
  // never off the side (the label is wider than the arrow) and never up over the clock
  const mw = UI.mark.offsetWidth || 120, mh = UI.mark.offsetHeight || 40, edge = !inside;
  x = clamp(x, mw / 2 + 6, W - mw / 2 - 6);
  // nor over the countdown panel (top centre): below it when it's in the way
  const pr = UI.root.getBoundingClientRect(), under = Math.abs(x - (pr.left + pr.right) / 2) < pr.width / 2 + mw / 2 + 6 ? pr.bottom + 8 : 0;
  y = clamp(y, Math.max(top, under) + (edge ? mh / 2 : mh), Hh - (edge ? mh / 2 : 0) - 6);
  UI.mark.style.left = x.toFixed(1) + 'px'; UI.mark.style.top = y.toFixed(1) + 'px';
}

// ================================================================== the light plane (an airstrip map's way out)
// A high-wing four-seater (a Cessna 172 type): white with blue and red cheat lines, side windows, a wing on struts over
// the cabin, tricycle gear in wheel pants, a spinning two-blade prop, nav lights, a flashing beacon on the fin.
// It comes in on a 5 degree glide along the strip's centreline (heading = at.yaw), touches down ~122 m short of
// 'at', rolls out to a stop on the turning pad, swings round 180 degrees, idles with the door open for the window,
// then runs back down the strip and lifts off. Local frame like the helicopter's: +z the nose, +x the left side.
const PLANE_DOOR = V(1.25, 0.25, 0.7);
function buildPlane() {
  const group = new THREE.Group(); group.name = 'rescuePlane'; group.rotation.order = 'YXZ';
  const L0 = -5.2, L1 = 2.95, NZ = 26;
  const paint = canvasTex(1024, 512, (g, w, h) => {
    const zy = z => (L1 - z) / (L1 - L0) * h;   // canvas y for a length position (nose at the top)
    g.fillStyle = '#eef0ee'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(${Math.random() < 0.6 ? '60,58,50' : '255,255,255'},${Math.random() * 0.05})`; g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 10, 2 + Math.random() * 4); }
    g.fillStyle = 'rgba(70,60,40,0.22)'; g.fillRect(0, zy(2.4), w * 0.12, h); g.fillRect(w * 0.88, zy(2.4), w * 0.12, h);   // belly grime
    for (const [u0, u1, col] of [[0.185, 0.205, '#1d3f8a'], [0.207, 0.217, '#b8282a'], [0.795, 0.815, '#1d3f8a'], [0.783, 0.793, '#b8282a']]) { g.fillStyle = col; g.fillRect(u0 * w, zy(2.9), (u1 - u0) * w, zy(-4.9) - zy(2.9)); }
    g.fillStyle = '#1a2028';                                                    // side windows, windshield, rear window
    for (const [u0, u1] of [[0.27, 0.37], [0.63, 0.73]]) { g.fillRect(u0 * w, zy(1.05), (u1 - u0) * w, zy(0.15) - zy(1.05)); g.fillRect(u0 * w + 2, zy(0.05), (u1 - u0) * w - 4, zy(-0.95) - zy(0.05)); }
    g.fillRect(0.37 * w, zy(1.62), 0.26 * w, zy(1.05) - zy(1.62)); g.fillRect(0.42 * w, zy(-1.05), 0.16 * w, zy(-1.9) - zy(-1.05));
    g.strokeStyle = 'rgba(40,40,40,0.55)'; g.lineWidth = 2; g.strokeRect(0.19 * w, zy(1.1), 0.18 * w, zy(0.15) - zy(1.1));          // the left door
    g.strokeStyle = 'rgba(40,40,40,0.25)'; g.lineWidth = 1.5; for (const z of [2.3, 1.7, -1.2, -2.6, -3.9]) { g.beginPath(); g.moveTo(0, zy(z)); g.lineTo(w, zy(z)); g.stroke(); }
    g.fillStyle = '#1d3f8a'; g.font = 'bold 34px Arial'; g.save(); g.translate(0.255 * w, zy(-3.3)); g.rotate(-Math.PI / 2); g.textAlign = 'center'; g.fillText('N7241K', 0, 0); g.restore();
    g.save(); g.translate(0.745 * w, zy(-3.3)); g.rotate(Math.PI / 2); g.textAlign = 'center'; g.fillText('N7241K', 0, 0); g.restore();
  });
  const white = new THREE.MeshStandardMaterial({ map: paint, roughness: 0.32, metalness: 0.05 });
  const skinTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#eceeec'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(${Math.random() < 0.6 ? '70,66,56' : '255,255,255'},${Math.random() * 0.05})`; g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 9, 1 + Math.random() * 3); }
    g.strokeStyle = 'rgba(60,62,64,0.35)'; g.lineWidth = 1.2;
    for (const u of [0.25, 0.5, 0.75]) { g.beginPath(); g.moveTo(u * w, 0); g.lineTo(u * w, h); g.stroke(); }
    for (const v of [0.33, 0.66]) { g.beginPath(); g.moveTo(0, v * h); g.lineTo(w, v * h); g.stroke(); }
    g.fillStyle = 'rgba(80,82,84,0.45)'; for (const u of [0.25, 0.5, 0.75]) for (let y = 3; y < h; y += 7) { g.fillRect(u * w - 4, y, 1.4, 1.4); g.fillRect(u * w + 3, y, 1.4, 1.4); }
    const gr = g.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, 'rgba(90,80,60,0.18)'); gr.addColorStop(0.4, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);   // exhaust / dust stain
  });
  skinTex.wrapS = skinTex.wrapT = THREE.RepeatWrapping;
  const wing = new THREE.MeshStandardMaterial({ map: skinTex, roughness: 0.38, metalness: 0.05 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x24272a, roughness: 0.6, metalness: 0.4 });
  const tyre = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x1d3f8a, roughness: 0.4 }), red = new THREE.MeshStandardMaterial({ color: 0xb8282a, roughness: 0.4 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.3, metalness: 0.85 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fb4c4, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.35 });
  const add = (geo, mat, x = 0, y = 0, z = 0, par = group) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; par.add(m); return m; };
  // fuselage: a lathe along z, taller than wide, from the tail cone to the cowling
  const prof = [[L0, 0.05], [-4.8, 0.17], [-3.5, 0.3], [-2.2, 0.45], [-1.2, 0.58], [-0.4, 0.64], [0.6, 0.65], [1.5, 0.6], [2.1, 0.52], [2.6, 0.43], [L1, 0.3]];
  const rAt = z => { for (let i = 1; i < prof.length; i++) if (z <= prof[i][0]) { const [z0, r0] = prof[i - 1], [z1, r1] = prof[i], k = (z - z0) / (z1 - z0); return lerp(r0, r1, k * k * (3 - 2 * k)); } return prof[prof.length - 1][1]; };
  const pts = []; for (let i = 0; i < NZ; i++) { const z = L0 + (L1 - L0) * i / (NZ - 1); pts.push(new THREE.Vector2(rAt(z), z)); }
  const fus = add(new THREE.LatheGeometry(pts, 32).rotateX(Math.PI / 2), white, 0, 1.35, 0); fus.scale.set(0.92, 1.22, 1);
  add(new THREE.CircleGeometry(0.3, 20), dark, 0, 1.35, L1 + 0.001).scale.set(0.92, 1.22, 1);
  // the windshield bulge and the door handle
  const ws = add(new THREE.SphereGeometry(0.55, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), glass, 0, 1.9, 1.3); ws.scale.set(1.05, 0.38, 0.75);
  add(new THREE.BoxGeometry(0.03, 0.03, 0.12), metal, 0.6, 1.25, 0.25);
  // wing: high, over the cabin, a little dihedral; red/blue tips; flaps lines
  for (const sx of [-1, 1]) {
    const wg = new THREE.Group(); wg.position.set(sx * 0.45, 2.22, 0.55); wg.rotation.z = sx * 0.03; group.add(wg);
    add(new THREE.BoxGeometry(5.1, 0.12, 1.48).translate(sx * 2.55, 0, 0), wing, 0, 0, 0, wg);
    add(new THREE.BoxGeometry(5.1, 0.05, 0.12).translate(sx * 2.55, 0.06, 0.74), wing, 0, 0, 0, wg).scale.y = 1.4;   // rounded leading edge hint
    add(new THREE.BoxGeometry(0.25, 0.13, 1.5), sx > 0 ? red : blue, sx * 5.15, 0, 0, wg);
    add(new THREE.BoxGeometry(2.4, 0.02, 0.36), dark, sx * 1.6, -0.05, -0.62, wg).material = new THREE.MeshStandardMaterial({ color: 0xd8dad8, roughness: 0.5 });   // flap
    // strut
    const a = V(sx * 0.6, 0.85, 0.65), b = V(sx * 2.75, 2.16, 0.6), d = b.clone().sub(a), st = add(new THREE.CylinderGeometry(0.035, 0.035, d.length(), 8), wing, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    st.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); st.scale.set(1.8, 1, 0.6);
  }
  add(new THREE.BoxGeometry(0.9, 0.1, 1.48), wing, 0, 2.2, 0.55);   // centre section on the cabin roof
  // tail: stabiliser, elevator, fin, rudder
  add(new THREE.BoxGeometry(3.4, 0.06, 0.8), wing, 0, 1.46, -4.55); add(new THREE.BoxGeometry(3.4, 0.05, 0.38), wing, 0, 1.46, -5.12);
  const fin = add(new THREE.BoxGeometry(0.07, 1.25, 1.0), white, 0, 2.05, -4.75); fin.rotation.x = -0.42; fin.material = wing;
  add(new THREE.BoxGeometry(0.06, 1.15, 0.36), blue, 0, 1.98, -5.3).rotation.x = -0.22;
  // gear: spring legs out to the main wheels in pants, the nose leg
  const wheels = [];
  for (const sx of [-1, 1]) {
    const a = V(sx * 0.45, 0.72, 0.05), b = V(sx * 1.25, 0.32, 0.05), d = b.clone().sub(a), lg = add(new THREE.BoxGeometry(0.06, d.length(), 0.12), metal, (a.x + b.x) / 2, (a.y + b.y) / 2, 0.05);
    lg.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
    const wh = add(new THREE.CylinderGeometry(0.29, 0.29, 0.14, 18).rotateZ(Math.PI / 2), tyre, sx * 1.25, 0.29, 0.05); wheels.push(wh);
    const pant = add(new THREE.SphereGeometry(0.34, 16, 10), white, sx * 1.25, 0.36, 0.1); pant.scale.set(0.42, 0.75, 1.45); pant.material = wing;
  }
  add(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 8), metal, 0, 0.55, 2.35);
  wheels.push(add(new THREE.CylinderGeometry(0.21, 0.21, 0.12, 16).rotateZ(Math.PI / 2), tyre, 0, 0.21, 2.42));
  const npant = add(new THREE.SphereGeometry(0.26, 12, 8), wing, 0, 0.28, 2.45); npant.scale.set(0.4, 0.7, 1.3);
  // the prop: spinner, two twisted blades, and the blur disc that takes over as it spins up
  const prop = new THREE.Group(); prop.position.set(0, 1.35, L1 + 0.08); group.add(prop);
  add(new THREE.ConeGeometry(0.15, 0.36, 18).rotateX(Math.PI / 2), wing, 0, 0, 0.12);
  const blades = new THREE.Group(); prop.add(blades);
  const bladeM = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.6, transparent: true });
  for (const sy of [-1, 1]) { const b = add(new THREE.BoxGeometry(0.11, 0.92, 0.025).translate(0, sy * 0.5, 0), bladeM, 0, 0, 0, blades); b.rotation.y = sy * 0.35; add(new THREE.BoxGeometry(0.112, 0.1, 0.027), new THREE.MeshStandardMaterial({ color: 0xf0d020, roughness: 0.5 }), 0, sy * 0.92, 0, blades).rotation.y = sy * 0.35; }
  const discM = new THREE.MeshBasicMaterial({ color: 0x404040, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const disc = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.97, 40), discM); prop.add(disc);
  // pilot in the left seat, a passenger seat empty for you
  const suit = new THREE.MeshStandardMaterial({ map: fabricTexture([106, 116, 128], 221), roughness: 0.95 }), skin = new THREE.MeshStandardMaterial({ color: 0xb07a58, roughness: 0.7 });
  const pilot = new THREE.Group(); pilot.position.set(0.3, 1.05, 0.65); group.add(pilot);
  add(new THREE.BoxGeometry(0.4, 0.5, 0.25), suit, 0, 0.3, 0, pilot); const ph = new THREE.Group(); ph.position.set(0, 0.68, 0.02); pilot.add(ph);
  add(new THREE.SphereGeometry(0.1, 12, 10), skin, 0, 0, 0, ph); add(new THREE.SphereGeometry(0.105, 12, 8, 0, Math.PI * 2, 0, 1.4), new THREE.MeshStandardMaterial({ color: 0x8a8070, roughness: 0.9 }), 0, 0.02, 0, ph);
  add(new THREE.TorusGeometry(0.11, 0.015, 6, 16, Math.PI), dark, 0, 0.02, 0, ph);   // headset
  add(new THREE.BoxGeometry(1.1, 0.25, 0.2), dark, 0, 1.45, 1.45);                   // panel
  // lights: red left tip, green right tip, white tail, red flashing beacon on the fin
  const lmat = c => new THREE.MeshBasicMaterial({ color: c, transparent: true });
  const navL = add(new THREE.SphereGeometry(0.05, 8, 6), lmat(0xff2a20), 5.85, 2.36, 0.6), navR = add(new THREE.SphereGeometry(0.05, 8, 6), lmat(0x30ff60), -5.85, 2.36, 0.6);
  const tailW = add(new THREE.SphereGeometry(0.045, 8, 6), lmat(0xffffff), 0, 1.35, -5.25), beacon = add(new THREE.SphereGeometry(0.06, 8, 6), lmat(0xff3020), 0, 2.72, -5.0);
  // the cabin door: hinged at its front edge, swings open forward
  const doorP = new THREE.Group(); doorP.position.set(0.6, 1.05, 1.08); group.add(doorP);
  const door = add(new THREE.BoxGeometry(0.04, 0.85, 0.9).translate(0, 0.2, -0.45), wing, 0, 0, 0, doorP);
  add(new THREE.BoxGeometry(0.045, 0.38, 0.6).translate(0, 0.35, -0.45), new THREE.MeshStandardMaterial({ color: 0x1a2028, roughness: 0.1 }), 0, 0, 0, doorP);
  return { group, door: PLANE_DOOR, prop, blades, bladeM, disc, discM, wheels, doorP, pilotHead: ph, navL, navR, tailW, beacon, propA: 0, wheelA: 0 };
}
function flyPlane(dt) {
  S.t += dt;
  const p = S.pos, v = S.vel, hd = S.lzYaw, fx = Math.sin(hd), fz = Math.cos(hd), at = C.lz;
  let pitchT = 0, yawT = S.yaw;
  const gyHere = ground(p.x, p.z) || S.gy;
  if (S.st === 'inbound' || S.st === 'orbit') {
    // the glide: 5 degrees down to the threshold, 122 m short of the pad; a flare over the last few metres
    const tdx = at.x - fx * 122, tdz = at.z - fz * 122, dtd = (tdx - p.x) * fx + (tdz - p.z) * fz, lat = (at.x - p.x) * fz - (at.z - p.z) * fx;
    if (S.st === 'inbound' && C.ready) S.noGo = !C.ready();
    if (S.st === 'inbound' && S.noGo && dtd < 900) { S.st = 'orbit'; S.t = 0; S.orbA = Math.atan2(p.x - at.x, p.z - at.z); C.onNotReady?.(); }
    if (S.st === 'orbit') {
      S.orbA += (40 / 260) * dt; const tx = at.x + Math.sin(S.orbA) * 260, tz = at.z + Math.cos(S.orbA) * 260;
      _w.set(Math.cos(S.orbA) * 40 + (tx - p.x) * 0.4, 0, -Math.sin(S.orbA) * 40 + (tz - p.z) * 0.4); steer(_w, dt, 6);
      v.y = lerp(v.y, clamp((S.gy + 120 - p.y) * 0.3, -4, 4), 1 - Math.exp(-dt)); yawT = Math.atan2(v.x, v.z); S.rpmT = 0.7;
      if (C.ready && C.ready()) { S.noGo = false; S.st = 'inbound'; }   // (it'll line up again from wherever it is)
      else if (S.t > Math.PI * 2 * 260 / 40) { S.st = 'outbound'; S.t = 0; C.onMissed?.(S.done.indexOf(false) < 0); }
    } else {
      S.spd = lerp(S.spd, lerp(25, 36, smooth(0, 700, dtd)), 1 - Math.exp(-dt * 0.6));
      const yT = gyHere + Math.max(0, dtd - 45) * 0.087, h = p.y - gyHere;   // aims a little short so the flare ends on the numbers
      const sink = clamp((yT - p.y) * 1.2, -4.2, 2), flare = smooth(3.5, 0.3, h);
      v.y = lerp(v.y, lerp(sink, -clamp(h * 0.8, 0.6, 2.6), flare), 1 - Math.exp(-dt * 4));
      // track the centreline: aim a little ahead of yourself on it
      const back = Math.max(0, dtd) + 122, ax = at.x - fx * Math.max(0, back - 120), az = at.z - fz * Math.max(0, back - 120);
      yawT = Math.atan2(ax - p.x, az - p.z); if (Math.abs(lat) < 2 && dtd < 300) yawT = hd;
      v.x = Math.sin(S.yaw) * S.spd; v.z = Math.cos(S.yaw) * S.spd;
      pitchT = -0.06 - 0.1 * flare; S.rpmT = lerp(0.62, 0.4, flare);
      if (h < 0.06 && v.y <= 0) { S.dec = clamp(S.spd * S.spd / (2 * Math.max(20, (at.x - p.x) * fx + (at.z - p.z) * fz)), 1.5, 4.5); S.st = 'descend'; S.t = 0; S.settle = 1; p.y = gyHere; v.y = 0; C.noise?.(V(p.x, gyHere, p.z), C.noiseRadius * 0.6); }
    }
  } else if (S.st === 'descend') {
    // the roll-out: brakes on, stopping on the pad
    const dr = (at.x - p.x) * fx + (at.z - p.z) * fz;
    S.spd = Math.min(S.spd, Math.sqrt(2 * (S.dec || 2.8) * Math.max(0, dr)) + (dr > 0.3 ? 0.4 : 0));
    yawT = hd; pitchT = 0.015 * smooth(2, 10, S.spd); S.rpmT = 0.3;
    v.set(fx * S.spd, 0, fz * S.spd); p.y = gyHere;
    // keep it on the centreline
    const lat = (at.x - p.x) * fz - (at.z - p.z) * fx; p.x += fz * lat * Math.min(1, dt * 2); p.z -= fx * lat * Math.min(1, dt * 2);
    if (dr < 0.05 || S.spd < 0.05) { v.set(0, 0, 0); S.spd = 0; touchDown(); S.turn = 0; S.settle = 0.3; }
  } else if (S.st === 'landed') {
    // a 180 on the pad (a little power, one brake) so it's pointing back down the strip for take-off
    S.turn = Math.min(1, S.turn + dt / 7); const k = S.turn * S.turn * (3 - 2 * S.turn);
    S.yaw = hd + Math.PI * k; yawT = S.yaw; S.rpmT = S.turn < 1 ? 0.5 : 0.34;
    const off = Math.sin(Math.PI * k) * 2.2; p.set(at.x + fz * off, gyHere, at.z - fx * off); v.set(0, 0, 0);
    if (S.turn < 1) { VEH().group.position.copy(p); clearLanding(); }   // nobody gets swept through by the turn
    S.boardT -= dt;
    const sec = Math.max(0, Math.ceil(S.boardT));
    if (sec !== S.lastSec) { S.lastSec = sec; C.onCountdown?.(sec); }
    if (S.boardT <= 0) depart();
  } else if (S.st === 'liftoff') {
    // full power down the strip; rotates at 25 m/s (about 60 m on), climbs out at 4.5 m/s
    S.rpmT = 1;
    const dx = Math.sin(S.yaw), dz = Math.cos(S.yaw), h = p.y - gyHere;
    S.spd = Math.min(36, S.spd + (S.rpm > 0.85 ? 5 : 1) * dt);
    const fly = S.spd > 25;
    v.x = dx * S.spd; v.z = dz * S.spd; v.y = lerp(v.y, fly ? 4.5 : 0, 1 - Math.exp(-dt * 1.2));
    pitchT = fly ? -0.16 : -0.02 * smooth(15, 25, S.spd); yawT = S.yaw;
    if (!fly) p.y = gyHere;
    if (h > 20) { S.st = 'outbound'; S.t = 0; }
  } else if (S.st === 'outbound') {
    S.rpmT = 1; S.spd = Math.min(42, S.spd + 2 * dt);
    v.x = Math.sin(S.yaw) * S.spd; v.z = Math.cos(S.yaw) * S.spd;
    v.y = lerp(v.y, clamp((S.gy + 180 - p.y) * 0.2, 0, 4), 1 - Math.exp(-dt));
    pitchT = -0.1; yawT = S.yaw + (S.t > 6 ? 0.15 : 0);   // a gentle climbing turn once clear
    if (Math.hypot(p.x - at.x, p.z - at.z) > GONE_DIST) { gone(); return; }
  }
  if (S.st === 'over' || S.st === 'waiting') return;
  if (S.st !== 'landed') p.addScaledVector(v, dt);
  if (S.st !== 'landed' && S.st !== 'descend') p.y = Math.max(p.y, gyHere);
  const prevYaw = S.yaw;
  if (S.st !== 'landed') { const dy = wrapA(yawT - S.yaw); S.yawRate = lerp(S.yawRate, clamp(dy * 1.2, -0.25, 0.25), 1 - Math.exp(-dt * 2)); S.yaw += S.yawRate * dt; }
  else S.yawRate = wrapA(S.yaw - prevYaw) / Math.max(dt, 1e-3);
  const air = S.st === 'inbound' || S.st === 'orbit' || S.st === 'outbound' || (S.st === 'liftoff' && p.y - gyHere > 0.3);
  S.pitch = lerp(S.pitch, pitchT, 1 - Math.exp(-dt * 2.5));
  S.roll = lerp(S.roll, air ? clamp(-S.yawRate * S.spd * 0.06, -0.5, 0.5) + Math.sin(S.T * 1.3) * 0.015 : 0, 1 - Math.exp(-dt * 2));
  S.rpm = lerp(S.rpm, S.rpmT, 1 - Math.exp(-dt * 1.2));
  S.load = S.rpm;
  common(dt);
}

// ================================================================== the police launch (a river map's way out)
// A 7 m aluminium launch: navy hull with a white sheer stripe and POLICE on both sides, a wheelhouse with dark windows,
// a blue light bar, a searchlight, rails, fenders and a big outboard. It comes up the river, swings in and lies
// alongside the dock (its +x side to the dock), waits, then backs off, turns and goes.
const BOAT_DOOR = V(1.6, 0.55, 0.2);
function buildBoat() {
  const group = new THREE.Group(); group.name = 'rescueBoat'; group.rotation.order = 'YXZ';
  const navyT = paintedMetalTexture([28, 42, 68]); navyT.repeat.set(0.5, 0.5);
  const navy = new THREE.MeshStandardMaterial({ map: navyT, roughness: 0.45, metalness: 0.3 }), white = new THREE.MeshStandardMaterial({ map: paintedMetalTexture([226, 228, 228]), roughness: 0.4 });
  const deckT = canvasTex(128, 128, (g, w) => {   // grey non-skid tread plate: raised diamonds, scuffs
    g.fillStyle = '#66686a'; g.fillRect(0, 0, w, w);
    for (let y = 0; y < w; y += 8) for (let x = (y / 8 % 2) * 4; x < w; x += 8) { g.save(); g.translate(x + 2, y + 2); g.rotate((y / 8 % 2 ? 1 : -1) * 0.7); g.fillStyle = 'rgba(150,152,154,0.55)'; g.fillRect(-2.5, -0.8, 5, 1.6); g.fillStyle = 'rgba(30,30,30,0.35)'; g.fillRect(-2.5, 0.8, 5, 0.8); g.restore(); }
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '40,36,30' : '120,110,90'},${Math.random() * 0.12})`; g.beginPath(); g.arc(Math.random() * w, Math.random() * w, 2 + Math.random() * 10, 0, 7); g.fill(); }
  });
  deckT.wrapS = deckT.wrapT = THREE.RepeatWrapping; deckT.repeat.set(0.8, 0.8);
  const deckM = new THREE.MeshStandardMaterial({ map: deckT, roughness: 0.9 }), dark = new THREE.MeshStandardMaterial({ color: 0x141a20, roughness: 0.1, metalness: 0.5 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xb0b4b8, roughness: 0.3, metalness: 0.9 }), black = new THREE.MeshStandardMaterial({ color: 0x18191a, roughness: 0.6 });
  const add = (geo, mat, x = 0, y = 0, z = 0, par = group) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; par.add(m); return m; };
  // the hull: a pointed-bow plan extruded up (shape y = -z, see rotateX)
  const sh = new THREE.Shape(); const plan = [[-1.1, 3.1], [1.1, 3.1], [1.12, -1.0], [0.75, -2.5], [0, -3.25], [-0.75, -2.5], [-1.12, -1.0]];
  sh.moveTo(plan[0][0], plan[0][1]); plan.slice(1).forEach(([x, y]) => sh.lineTo(x, y)); sh.closePath();
  add(new THREE.ExtrudeGeometry(sh, { depth: 1.0, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2 }).rotateX(-Math.PI / 2), navy, 0, -0.45, 0);
  add(new THREE.ExtrudeGeometry(sh, { depth: 0.16, bevelEnabled: false }).rotateX(-Math.PI / 2).scale(1.03, 1, 1.01), white, 0, 0.45, 0);   // the sheer stripe
  add(new THREE.ExtrudeGeometry(sh, { depth: 0.02, bevelEnabled: false }).rotateX(-Math.PI / 2).scale(0.94, 1, 0.95), deckM, 0, 0.5, 0);
  const word = canvasTex(512, 128, (g, w, h) => { g.fillStyle = '#1a2740'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; fitFill(g, named() ? rideName() : 'POLICE', w / 2, h / 2 + 4, 'bold 84px Arial', w * 0.92); g.fillStyle = '#f0c020'; g.fillRect(0, h - 12, w, 6); });
  for (const sx of [-1, 1]) { const m = add(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshStandardMaterial({ map: word, roughness: 0.5 }), sx * 1.2, 0.05, -0.6); m.rotation.y = sx * Math.PI / 2; }
  // wheelhouse
  add(new THREE.BoxGeometry(1.7, 1.1, 1.8), white, 0, 1.08, -0.55);
  add(new THREE.BoxGeometry(1.72, 0.45, 1.6), dark, 0, 1.3, -0.5); add(new THREE.BoxGeometry(1.5, 0.45, 0.05), dark, 0, 1.33, 0.36).rotation.x = -0.25;
  add(new THREE.BoxGeometry(1.85, 0.08, 2.0), white, 0, 1.67, -0.55);
  const bars = []; for (const sx of [-1, 1]) bars.push(add(new THREE.BoxGeometry(0.42, 0.11, 0.18), new THREE.MeshBasicMaterial({ color: 0x2050ff, transparent: true }), sx * 0.24, 1.77, -0.2));
  add(new THREE.BoxGeometry(0.1, 0.11, 0.2), black, 0, 1.77, -0.2);
  add(new THREE.CylinderGeometry(0.1, 0.12, 0.2, 12).rotateX(Math.PI / 2), metal, 0.6, 1.82, 0.15);   // searchlight
  add(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 6), metal, -0.6, 2.25, -1.3);                        // whip antenna
  // rails, fenders on the dock side, the outboard
  for (const sx of [-1, 1]) { add(new THREE.BoxGeometry(0.04, 0.04, 4.6), metal, sx * 1.02, 1.05, 0.2); for (const z of [-2.0, -0.6, 0.8, 2.1]) add(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6), metal, sx * 1.02 * (z > 1.5 ? 0.85 : 1), 0.8, z); }
  for (const z of [-1.8, -0.2, 1.4]) add(new THREE.CylinderGeometry(0.11, 0.11, 0.45, 12), new THREE.MeshStandardMaterial({ color: 0x2a62b8, roughness: 0.6 }), 1.2, 0.2, z);
  add(new THREE.BoxGeometry(0.5, 0.75, 0.55), black, 0, 0.75, -3.35); add(new THREE.BoxGeometry(0.12, 0.8, 0.25), black, 0, 0.0, -3.45);
  // the officer at the helm
  const suit = new THREE.MeshStandardMaterial({ color: 0x1e2838, roughness: 0.9 }), skin = new THREE.MeshStandardMaterial({ color: 0xa07052, roughness: 0.7 });
  const cop = new THREE.Group(); cop.position.set(-0.35, 0.55, -0.3); group.add(cop);
  add(new THREE.BoxGeometry(0.42, 0.6, 0.26), suit, 0, 0.95, 0, cop); add(new THREE.BoxGeometry(0.4, 0.75, 0.24), suit, 0, 0.38, 0, cop);
  const hd = new THREE.Group(); hd.position.set(0, 1.42, 0.02); cop.add(hd); add(new THREE.SphereGeometry(0.1, 12, 10), skin, 0, 0, 0, hd);
  add(new THREE.CylinderGeometry(0.11, 0.11, 0.07, 14), suit, 0, 0.08, 0, hd); add(new THREE.BoxGeometry(0.16, 0.015, 0.1), black, 0, 0.05, 0.1, hd);
  return { group, door: BOAT_DOOR, bars, copHead: hd };
}
// its path: up the river past the dock, then a swing in to lie alongside it (at + 5.5 m out along the dock, 2.6 m to its side)
function boatPath() {
  const a = C.lz.yaw ?? 0, f = { x: Math.sin(a), z: Math.cos(a) }, sd = { x: Math.cos(a), z: -Math.sin(a) }, at = C.lz, e = C.ending || {};
  const out = e.dockOut ?? 5.5, side = e.dockSide ?? 2.6, far = e.boatFrom ?? 220;
  const D = { x: at.x + f.x * out + sd.x * side, z: at.z + f.z * out + sd.z * side }, K = { x: D.x + f.x * 7.5, z: D.z + f.z * 7.5 }, P0 = { x: K.x + sd.x * far, z: K.z + sd.z * far };
  const pts = []; let L = 0;
  for (let i = 0; i <= 80; i++) {
    const u = i / 80, w0 = (1 - u) * (1 - u), w1 = 2 * u * (1 - u), w2 = u * u, x = P0.x * w0 + K.x * w1 + D.x * w2, z = P0.z * w0 + K.z * w1 + D.z * w2;
    if (i) L += Math.hypot(x - pts[i - 1].x, z - pts[i - 1].z);
    pts.push({ x, z, s: L });
  }
  return { pts, L, endYaw: a + Math.PI };
}
function boatAt(u) {
  const P = S.path.pts; u = clamp(u, 0, S.path.L);
  let i = 1; while (i < P.length - 1 && P[i].s < u) i++;
  const A = P[i - 1], B = P[i], k = (u - A.s) / Math.max(1e-6, B.s - A.s);
  S.pos.set(lerp(A.x, B.x, k), S.gy, lerp(A.z, B.z, k));
  return Math.atan2(B.x - A.x, B.z - A.z);   // the path's heading here
}
function flyBoat(dt) {
  S.t += dt;
  const L = S.path.L; let yawT = S.yaw;
  if (S.st === 'inbound' || S.st === 'descend') {
    const left = L - S.u;
    S.spd = Math.min(9, Math.sqrt(2 * 0.8 * Math.max(0, left)) + 0.12);
    S.u = Math.min(L, S.u + S.spd * dt); yawT = boatAt(S.u);
    if (left < 30 && S.st === 'inbound') { S.st = 'descend'; S.t = 0; }
    S.rpmT = S.spd > 3 ? 0.8 : 0.4;
    if (L - S.u < 0.03) { S.u = L; boatAt(L); touchDown(); }
  } else if (S.st === 'landed') {
    boatAt(S.u); yawT = S.path.endYaw;
    S.boardT -= dt;
    const sec = Math.max(0, Math.ceil(S.boardT));
    if (sec !== S.lastSec) { S.lastSec = sec; C.onCountdown?.(sec); }
    if (S.boardT <= 0) depart();
  } else if (S.st === 'liftoff') {
    // astern off the dock, slowly
    S.spd = Math.min(2, S.spd + dt * 0.8); S.u = Math.max(0, S.u - S.spd * dt); const hd = boatAt(S.u); yawT = hd; S.rpmT = 0.6;
    if (L - S.u > 8) { S.st = 'outbound'; S.t = 0; }
  } else if (S.st === 'outbound') {
    // turn and open it up, off down the river
    S.spd = Math.min(13, S.spd + dt * 2.2); S.u = Math.max(0, S.u - S.spd * dt); yawT = boatAt(S.u) + Math.PI; S.rpmT = 1;
    if (S.u <= 0) { gone(); return; }
  }
  if (S.st === 'over' || S.st === 'waiting') return;
  const dy = wrapA(yawT - S.yaw); S.yawRate = lerp(S.yawRate, clamp(dy * 1.5, -0.6, 0.6), 1 - Math.exp(-dt * 2.5)); S.yaw += S.yawRate * dt;
  const t = S.T, moving = S.st !== 'landed';
  S.pos.y = S.gy + Math.sin(t * 0.9) * 0.05 + Math.sin(t * 2.1) * 0.015;
  S.pitch = lerp(S.pitch, (S.st === 'outbound' ? -0.07 * smooth(2, 10, S.spd) : 0) + Math.sin(t * 0.55 + 1) * 0.015, 1 - Math.exp(-dt * 2));
  S.roll = lerp(S.roll, (moving ? clamp(S.yawRate * S.spd * 0.03, -0.12, 0.12) : 0) + Math.sin(t * 0.7) * 0.025, 1 - Math.exp(-dt * 2));
  S.rpm = lerp(S.rpm, S.rpmT, 1 - Math.exp(-dt * 1.2)); S.load = S.rpm;
  common(dt);
}

// the plane's and the boat's per-frame looks (the shared searchlight / lamp / dust are re-used as landing light, wake)
function animateOther(dt) {
  const v = VEH(), g = v.group, t = S.T, night = 1 - (C.daylight ? C.daylight() : 0);
  g.position.copy(S.pos);
  if (S.settle > 0 && (S.st === 'descend' || S.st === 'landed')) { S.settle = Math.max(0, S.settle - dt * 1.8); g.position.y -= Math.sin((1 - S.settle) * Math.PI * 2) * 0.04 * S.settle; }
  g.rotation.set(S.pitch, S.yaw, S.roll);
  if (MODE === 'plane') {
    v.propA += S.rpm * 40 * dt; v.blades.rotation.z = v.propA;
    const blur = smooth(0.2, 0.55, S.rpm); v.bladeM.opacity = 1 - 0.85 * blur; v.discM.opacity = 0.32 * blur;
    if (S.spd > 0.01) { v.wheelA += S.spd / 0.29 * dt; for (const w of v.wheels) w.rotation.x = v.wheelA; }
    const open = S.st === 'landed' && S.turn >= 1 ? 1 : 0;
    S.door = lerp(S.door, open, 1 - Math.exp(-dt * 2)); v.doorP.rotation.y = S.door * 1.25;
    v.pilotHead.rotation.y = S.st === 'landed' ? Math.sin(t * 0.5) * 0.6 + 0.4 : Math.sin(t * 0.3) * 0.15;
    v.beacon.material.opacity = (t % 1.2) < 0.1 ? 1 : 0.1; v.tailW.material.opacity = (t % 1.0) < 0.05 ? 1 : 0.3;
    // landing light: from the left wing root, ahead and down
    g.localToWorld(_l.set(1.2, 2.12, 1.25)); g.localToWorld(_t.set(0, 0, 60)); _t.y = ground(_t.x, _t.z);
    H.spot.position.copy(_l); H.spot.target.position.lerp(_t, 1 - Math.exp(-dt * 5)); H.spot.intensity = 380 * (0.3 + 0.7 * night);
    H.beam.visible = night > 0.3; if (H.beam.visible) { const len = _l.distanceTo(H.spot.target.position), rad = len * Math.tan(H.spot.angle) * 0.85; H.beam.position.copy(_l); H.beam.lookAt(H.spot.target.position); H.beam.scale.set(rad, rad, len); H.beam.material.uniforms.uK.value = 0.08 * night; }
    H.spotGlow.material.opacity = 0;
    g.localToWorld(_q.set(0.9, 1.4, 0.7)); H.lamp.position.copy(_q); H.lamp.intensity = 4 * S.door * (0.3 + 0.7 * night);
    // desert dust: the prop blast on the ground and the wheels on the roll
    const onGround = S.pos.y - ground(S.pos.x, S.pos.z) < 3;
    g.localToWorld(_q.set(0, 0, -3)); H.dust.cx = _q.x; H.dust.cy = ground(_q.x, _q.z); H.dust.cz = _q.z;
    H.dust.rate = onGround ? (S.rpm > 0.8 ? 70 : S.spd > 5 ? 30 : 6) : 0; H.dust.rad = 0.35; H.dust.spd = 0.5;
    const lit = clamp((C.daylight ? C.daylight() : 1) * 0.85 + 0.15, 0.1, 1); H.dust.mesh.material.uniforms.uCol.value.setRGB(0.68 * lit, 0.58 * lit, 0.44 * lit);
  } else {
    // police lights: blue double-flash, alternating sides
    const ph = t % 0.8; v.bars[0].material.opacity = ph < 0.08 || (ph > 0.15 && ph < 0.23) ? 1 : 0.15; v.bars[1].material.opacity = (ph > 0.4 && ph < 0.48) || (ph > 0.55 && ph < 0.63) ? 1 : 0.15;
    v.copHead.rotation.y = S.st === 'landed' ? Math.sin(t * 0.6) * 0.7 - 0.4 : Math.sin(t * 0.25) * 0.2;
    // the searchlight sweeps the bank, then rests on the dock while it waits
    g.localToWorld(_l.set(0.6, 1.85, 0.3));
    if (S.st === 'landed' || S.st === 'descend') { const a = Math.sin(t * 0.5) * 0.6; _t.set(C.lz.x - Math.sin(C.lz.yaw + a) * 10, S.gy + 0.4, C.lz.z - Math.cos(C.lz.yaw + a) * 10); }
    else g.localToWorld(_t.set(Math.sin(t * 0.4) * 14, -1.8, 30));
    H.spot.position.copy(_l); H.spot.target.position.lerp(_t, 1 - Math.exp(-dt * 2.5)); H.spot.intensity = 420 * (0.25 + 0.75 * night);
    H.beam.visible = night > 0.3; if (H.beam.visible) { const len = _l.distanceTo(H.spot.target.position), rad = len * Math.tan(H.spot.angle) * 0.85; H.beam.position.copy(_l); H.beam.lookAt(H.spot.target.position); H.beam.scale.set(rad, rad, len); H.beam.material.uniforms.uK.value = 0.1 * night; }
    H.spotGlow.material.opacity = 0;
    g.localToWorld(_q.set(0, 1.5, -0.6)); H.lamp.position.copy(_q); H.lamp.intensity = 3 * (0.3 + 0.7 * night);
    // the wake: spray at the stern while it moves
    g.localToWorld(_q.set(0, 0, -3.2)); H.dust.cx = _q.x; H.dust.cy = S.gy - 0.25; H.dust.cz = _q.z;
    H.dust.rate = S.spd > 0.5 ? 12 + S.spd * 6 : 2; H.dust.rad = 0.18; H.dust.spd = 0.18;
    const lit = clamp((C.daylight ? C.daylight() : 1) * 0.8 + 0.2, 0.15, 1); H.dust.mesh.material.uniforms.uCol.value.setRGB(0.86 * lit, 0.9 * lit, 0.94 * lit);
  }
}
