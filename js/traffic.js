// Zombie_Apocalypse — the town's traffic. On the calm morning the neighbours are out driving and cycling: cars keep to
// the right-hand lane, slow for the corners, stop at the stop signs and take their turn at the crossing, wait for
// anybody in the road (a toot of the horn if it's you), go round a parked car when the other lane is clear, pull in
// at the kerb, and the driver gets out and goes into a house (and comes back out later and drives off again).
// Cyclists ride near the kerb, pedal, lean into the turns, ring the bell. Everyone at the wheel is one of the
// townspeople (their own look, looks.js), sat in the seat with their hands on the wheel (drive.js's seated pose).
// When it all goes wrong: the traffic panics — speeding off, horns, a few crash (hazard lights, smoke, the horn
// stuck on), drivers run for it or get bitten and come back up. Every car left behind is handed to drive.js and is
// then an ordinary parked car you can get in and drive (keys in it).
// Maple Hollow has the full road net; the desert highway, the prison's access road and the stadium car park get a
// little through traffic; the jungle has no roads. Online games have no traffic (single player only).
import * as THREE from 'three';
import * as DRIVE from './drive.js';
import { makeDrivable, setDoor, buildBike, carSpec, bikePaint } from './vehicles.js';
import { Soldier, clamp, lerp, damp, wrapPi, smooth } from './soldier.js';
import * as LOOKS from './looks.js';
import { adoptZombie, wake, startTurning, turnAmount, knockDown } from './zombies.js';
import { DEV, PROFILE as MOB } from './mobile.js';

let E = null;          // { scene, world, SND, fx, camera, damage, noise, Z, C, G, getP, PEOPLE, KINDS, onStep, MP }
let NET = null;        // the roads of this map (null: no traffic here)
export const T = { on: false, list: [], ppl: [], panic: false, t: 0, startT: 0, haz: [], smoke: [], J: null, built: false };
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const V3 = new THREE.Vector3(), V4 = new THREE.Vector3(), TS = new THREE.Vector3();
const cp = { x: 0, z: 0, gy: 0 };

// ================================================================ the roads
// A road is straight, along x or z: centre line at c, usable from a0 to a1 (the along-coordinate). Lanes are offsets
// to the right of the way you're going (drive on the right): a car's lane, a bike's (near the kerb), the kerb (parked).
// d = +1 / -1: which way along it. LP(): a point in a lane. Maple Hollow's two streets cross at the stop signs.
const LP = (R, d, a, lat) => R.ax === 'x' ? { x: a, z: R.c + d * lat } : { x: R.c - d * lat, z: a };
const yawOf = (R, d) => R.ax === 'x' ? (d > 0 ? Math.PI / 2 : -Math.PI / 2) : (d > 0 ? 0 : Math.PI);
const fwdOf = (R, d) => R.ax === 'x' ? [d, 0] : [0, d];
function mapNet(W) {
  const id = W.mapId || 'maple';
  if (id === 'maple') return { id, roads: [
      { ax: 'x', c: 0, a0: -95, a1: 95, lane: 1.9, kerb: 2.75, bike: 3.15, lo: false, hi: false, name: 'Main St' },
      { ax: 'z', c: 0, a0: -95, a1: 95, lane: 1.9, kerb: 2.75, bike: 3.15, lo: false, hi: false, name: 'Maple Ave' }],
    J: { x: 0, z: 0, stop: 8.7, arc: 7.4, r: 8 }, nCars: 6, nBikes: 4, cruise: 10.5, bikeCruise: 5.2 };
  // the old highway past Arroyo Seco: through traffic, north and south
  if (id === 'desert') return { id, roads: [{ ax: 'z', c: 76, a0: -101, a1: 101, lane: 2.0, kerb: null, lo: true, hi: true }], nCars: 3, nBikes: 0, cruise: 15 };
  // Blackwater's access road: staff drive in and park by the gatehouse, others drive out
  if (id === 'prison') return { id, roads: [{ ax: 'z', c: 44, a0: 103.5, a1: 154, lane: 2.9, kerb: 4.85, lo: false, hi: true }], nCars: 2, nBikes: 0, cruise: 8, kerbFrom: 104, kerbTo: 128 };
  // the stadium car park: the front aisle, cars crawling through looking for a space
  if (id === 'stadium') return { id, roads: [{ ax: 'x', c: 62.4, a0: -99, a1: 99, lane: 1.75, kerb: null, lo: true, hi: true }], nCars: 3, nBikes: 0, cruise: 6.5 };
  return null;   // the jungle: footpaths and a river, no roads
}
// keep only the stretch of each road a car can really drive (nothing solid in either lane); a road too short goes
function validate(N, W) {
  const ok = (x, z) => { cp.x = x; cp.z = z; cp.gy = 0; W.collide(cp, 1.0, DRIVE.LIEOPT); return Math.hypot(cp.x - x, cp.z - z) < 0.02; };
  const keep = [];
  for (const R of N.roads) {
    const mid = (R.a0 + R.a1) / 2, free = a => [1, -1].every(d => ok(LP(R, d, a, R.lane).x, LP(R, d, a, R.lane).z) || (N.J && Math.abs(a - (R.ax === 'x' ? N.J.x : N.J.z)) < 10));
    let lo = mid, hi = mid;
    if (N.id === 'maple') { lo = R.a0; hi = R.a1; }   // (parked cars stand in Maple's lanes: they're driven round)
    else { while (lo - 1.5 >= R.a0 && free(lo - 1.5)) lo -= 1.5; while (hi + 1.5 <= R.a1 && free(hi + 1.5)) hi += 1.5; }
    if (lo > R.a0 + 1.6) { R.a0 = lo + 3; R.lo = false; } if (hi < R.a1 - 1.6) { R.a1 = hi - 3; R.hi = false; }   // (1.5 m steps: within one step of the end is the end)
    if (R.a1 - R.a0 >= 40) keep.push(R);
  }
  N.roads = keep;
  return keep.length ? N : null;
}
// parking spots at the kerb: never across a driveway, by the crossing, on a parked car, or where the outbreak puts
// something later (the chaos layer's boxes, hidden this morning)
function mkSpots(N, W) {
  const spots = [];
  for (const R of N.roads) {
    if (R.kerb == null) continue;
    for (const d of [1, -1]) {
      const sd = R.ax === 'x' ? d : -d, main = R.ax === 'x';
      const from = N.kerbFrom ?? R.a0 + 4, to = N.kerbTo ?? R.a1 - 4;
      for (let a = from; a <= to; a += 5.5) {
        if (N.J && (Math.abs(a) < 19 || Math.abs(a) > 84)) continue;
        if (N.id === 'maple' && W.curbCuts && W.curbCuts.some(c => c.main === main && c.sd === sd && a > c.a0 - 3.6 && a < c.a1 + 3.6)) continue;
        const p = LP(R, d, a, R.kerb);
        if (W.cars.some(C => !C.traffic && Math.hypot(C.x - p.x, C.z - p.z) < 7.5)) continue;
        if (W.chaos && W.chaos.some(it => it.boxes.some(b => Math.hypot(b.x - p.x, b.z - p.z) < (b.r || 1) + 3.5))) continue;
        let clear = true; const [fx, fz] = fwdOf(R, d);
        for (const k of [-1.9, 0, 1.9]) { cp.x = p.x + fx * k; cp.z = p.z + fz * k; cp.gy = 0; const x0 = cp.x, z0 = cp.z; W.collide(cp, 0.95, DRIVE.LIEOPT); if (Math.hypot(cp.x - x0, cp.z - z0) > 0.02) clear = false; }
        if (!clear) continue;
        spots.push({ R, d, a, x: p.x, z: p.z, yaw: yawOf(R, d), taken: null });
      }
    }
  }
  return spots;
}
// where a panicking driver gives up: the end of the road, or short of whatever the outbreak left across it
function escapeA(R, d, W) {
  let a = d > 0 ? R.a1 - 1 : R.a0 + 1;
  if (W.chaos) for (const it of W.chaos) for (const b of it.boxes) {
    const along = R.ax === 'x' ? b.x : b.z, across = R.ax === 'x' ? b.z - R.c : b.x - R.c;
    if (Math.abs(across) > 5 || Math.abs(along) < 22 || (along - (d > 0 ? 0 : 0)) * d < 22) continue;
    const stop = along - d * ((b.r || 1) + 7);
    if ((stop - a) * d < 0) a = stop;
  }
  return a;
}

// ================================================================ a route: a polyline with a speed at each point
function mkRoute() { return { P: [], S: [], V: [], TX: [], TZ: [], len: 0, stops: [], end: null }; }
function rAdd(R, p, v) {
  const n = R.P.length;
  if (n) {
    const q = R.P[n - 1], d = Math.hypot(p.x - q.x, p.z - q.z);
    if (d < 0.05) { R.V[n - 1] = Math.min(R.V[n - 1], v); return n - 1; }
    // long straights get points every 6 m (the speed plan and the obstacle look-ahead work point to point)
    const k = Math.floor(d / 6);
    for (let i = 1; i <= k; i++) { const f = i / (k + 1); pushPt(R, { x: lerp(q.x, p.x, f), z: lerp(q.z, p.z, f) }, Math.max(R.V[n - 1], v)); }
  }
  return pushPt(R, p, v);
}
function pushPt(R, p, v) {
  const n = R.P.length;
  R.S.push(n ? R.S[n - 1] + Math.hypot(p.x - R.P[n - 1].x, p.z - R.P[n - 1].z) : 0);
  R.P.push({ x: p.x, z: p.z }); R.V.push(v);
  if (n) { const L = R.S[n] - R.S[n - 1] || 1; R.TX[n - 1] = (p.x - R.P[n - 1].x) / L; R.TZ[n - 1] = (p.z - R.P[n - 1].z) / L; R.TX[n] = R.TX[n - 1]; R.TZ[n] = R.TZ[n - 1]; }
  else { R.TX.push(0); R.TZ.push(1); }
  R.len = R.S[n];
  return n;
}
// segment index for s (from a hint)
function segAt(R, s, i = 0) {
  const n = R.P.length - 1; if (n < 1) return 0;
  i = clamp(i, 0, n - 1);
  while (i > 0 && R.S[i] > s) i--;
  while (i < n - 1 && R.S[i + 1] < s) i++;
  return i;
}
// the point s along the route, lat to the right of it
function pointAt(R, s, lat, out, hint = 0) {
  const i = segAt(R, s, hint), L = (R.S[i + 1] - R.S[i]) || 1, f = (s - R.S[i]) / L;
  const tx = R.TX[i], tz = R.TZ[i];
  out.x = R.P[i].x + tx * L * f - tz * lat; out.z = R.P[i].z + tz * L * f + tx * lat;
  out.tx = tx; out.tz = tz;
  return out;
}
// where x z is along the route (s) and how far right of it (e), searching segments i0..i1
const PR = { s: 0, e: 0, i: 0, tx: 0, tz: 1 };
function project(R, x, z, i0, i1) {
  let bd = 1e9;
  i0 = Math.max(0, i0); i1 = Math.min(R.P.length - 2, i1);
  for (let i = i0; i <= i1; i++) {
    const a = R.P[i], L = R.S[i + 1] - R.S[i], tx = R.TX[i], tz = R.TZ[i], dx = x - a.x, dz = z - a.z;
    let u = dx * tx + dz * tz; const first = i === i0, last = i === i1;
    const uc = clamp(u, first ? -1e9 : 0, last ? 1e9 : L);
    const e = -dx * tz + dz * tx, dd = (u - uc) ** 2 + e * e;
    if (dd < bd) { bd = dd; PR.s = R.S[i] + uc; PR.e = e; PR.i = i; PR.tx = tx; PR.tz = tz; }
  }
  return PR;
}
// a car's (or bike's) way from a to b: along the first road, through the crossing (stopping at the line, or turning
// on an arc between the two lanes), along the second road. lat0/lat1: where it starts and ends across the road (the
// kerb when pulling out / in); lane: the lane it drives in; cv: cruising speed; turn speeds for the corners.
function buildRoute(r1, d1, a0, lat0, r2, d2, a1, lat1, lane, cv, bike = false) {
  const R = mkRoute(), J = NET.J;
  rAdd(R, LP(r1, d1, a0, lat0), lat0 !== lane ? 3 : cv);
  if (lat0 !== lane) rAdd(R, LP(r1, d1, a0 + d1 * 8, lane), cv * 0.8);
  const jA1 = J ? (r1.ax === 'x' ? J.x : J.z) : 0, jA2 = J ? (r2.ax === 'x' ? J.x : J.z) : 0;
  const cross = J && ((r1 !== r2) || ((a0 - jA1) * d1 < -J.stop && (a1 - jA1) * d1 > J.stop));
  if (cross) {
    rAdd(R, LP(r1, d1, jA1 - d1 * (J.stop + 6), lane), cv);
    const iStop = rAdd(R, LP(r1, d1, jA1 - d1 * J.stop, lane), Math.min(cv, 6));
    const stop = { s: R.S[iStop], out: 0, go: false };
    if (r1 === r2) {
      rAdd(R, LP(r1, d1, jA1, lane), bike ? 4.5 : 7);
      const iOut = rAdd(R, LP(r1, d1, jA1 + d1 * J.stop, lane), bike ? 4.5 : 7); stop.out = R.S[iOut] + 1;
    } else {
      const al = bike ? Math.min(lane, 2.3) : lane;   // (a cyclist swings out a little round the corner, clear of the signal poles)
      const E0 = LP(r1, d1, jA1 - d1 * J.arc, al), X0 = LP(r2, d2, jA2 + d2 * J.arc, al);
      const Cc = r1.ax === 'x' ? { x: r2.c - d2 * al, z: r1.c + d1 * al } : { x: r1.c - d1 * al, z: r2.c + d2 * al };
      const [f1x, f1z] = fwdOf(r1, d1), [f2x, f2z] = fwdOf(r2, d2), right = Math.abs(f2x - (-f1z)) < 0.1 && Math.abs(f2z - f1x) < 0.1;
      const vt = bike ? (right ? 3 : 3.6) : (right ? 3.6 : 4.6);
      rAdd(R, E0, vt);
      for (let k = 1; k <= 8; k++) { const t = k / 8, u = 1 - t; rAdd(R, { x: u * u * E0.x + 2 * u * t * Cc.x + t * t * X0.x, z: u * u * E0.z + 2 * u * t * Cc.z + t * t * X0.z }, vt); }
      const iOut = rAdd(R, LP(r2, d2, jA2 + d2 * J.stop, lane), Math.min(cv, 6)); stop.out = R.S[iOut] + 1;
    }
    R.stops.push(stop);
  }
  if (lat1 !== lane) { rAdd(R, LP(r2, d2, a1 - d2 * 11, lane), cv); rAdd(R, LP(r2, d2, a1 - d2 * 5, (lane + lat1) / 2), 3.2); rAdd(R, LP(r2, d2, a1, lat1), 0); }
  else rAdd(R, LP(r2, d2, a1, lane), lat1 === lane && bike ? cv : 0);
  return R;
}
// a cyclist's U-turn at the end of the road: round in a half circle from one kerb lane to the other
function addUturn(R, r, d, a, lat, v) {
  const c = LP(r, d, a, 0), [fx, fz] = fwdOf(r, d), rx = -fz, rz = fx;
  for (let k = 1; k <= 10; k++) { const th = k / 10 * Math.PI; rAdd(R, { x: c.x + fx * lat * Math.sin(th) + rx * lat * Math.cos(th), z: c.z + fz * lat * Math.sin(th) + rz * lat * Math.cos(th) }, v); }
}

// ================================================================ setup (once, while the map loads)
export function initTraffic(env) {
  E = env;
  window.__TRAFFIC = { T, get NET() { return NET; }, start, stop, update, dump, forcePanic: (c) => startPanic(c) };   // (tests)
  // (the roads are checked, and the kerbs chosen, on the first run: the outbreak's wrecks are still lying across them now)
  try { NET = mapNet(E.world); if (NET) NET.spots = []; } catch (e) { console.warn('traffic: no roads', e); NET = null; }
  if (!NET) return;
  const W = E.world;
  // fewer on phones and tablets
  const k = MOB ? (DEV.phone ? 0.5 : 0.67) : 1;
  const nC = Math.max(1, Math.round(NET.nCars * k)), nB = Math.round((NET.nBikes || 0) * k);
  const KINDS = E.KINDS || W.KINDS || {};
  const BODIES = ['human', 'michelle', 'butler', 'coach', 'michelle', 'human', 'coach', 'butler', 'michelle', 'human'];
  const TYPES = ['sedan', 'suv', 'sedan', 'pickup', 'van', 'sedan', 'suv'];
  let pi = 0;
  const person = () => {
    const i = pi++, body = BODIES[i % BODIES.length], kind = KINDS[body] || KINDS.human;
    if (!kind) return null;
    const s = new Soldier(kind, E.scene, { clone: true, onStep: E.onStep || null });
    s.update(1 / 60, {});
    const L = LOOKS.lookFor('traffic' + i, body), look = LOOKS.applyLook(s, L);
    const scl = new THREE.Vector3(L.w, L.h, L.w * L.d); s.root.scale.copy(scl);
    s.setVisible(false);
    const D = { s, look, kind0: kind, scl, body, i, st: 'off', A: null, path: null, pi: 0, t: 0 };
    T.ppl.push(D); return D;
  };
  for (let i = 0; i < nC; i++) {
    const type = TYPES[i % TYPES.length];
    let C;
    try { C = W.kit.car(0, -400 - i * 10, 0, (i * 3 + 1) % 8, type, { noSearch: true }); } catch (e) { console.warn('traffic: car', e); break; }
    C.traffic = true; C.hidden = true; C.box.off = true; C.g.visible = false;
    const b = C.box, spec = carSpec(type);
    const A = { kind: 'car', ai: true, i, C, g: C.g, type, spec, live: makeDrivable(C.g, type), trunks: [],
      x: 0, z: 0, yaw: 0, y: 0, v: 0, vs: 0, steer: 0, roll: 0, pitch: 0, spin: 0, rpm: 900, tp: 0, tr: 0,
      hx: b.hx, hz: b.hz, bo: (b.z - C.z), belt: b.y1, co: C.cab ? C.cab.z - C.z : 0, halfW: b.hx,
      wb: spec.wheelZ[0] - spec.wheelZ[1], D: person(), st: 'hidden', route: null, s: 0, seg: 0, off: 0, offT: 0 };
    A.onHit = (dx, dz, sp) => rammed(A, dx, dz, sp);
    if (A.D) A.D.A = A;
    T.list.push(A);
  }
  const BP = [0x8a1a14, 0x1a3a7a, 0x2a5a2a, 0xc89a1a, 0x5a2a6a, 0x2a6a7a].map((c, i) => bikePaint(c, i + 3));
  for (let i = 0; i < nB; i++) {
    const g = buildBike(BP[i % BP.length]); E.scene.add(g); g.visible = false;
    const A = { kind: 'bike', ai: true, i: 100 + i, g, U: g.userData, x: 0, z: 0, yaw: 0, y: 0, v: 0, steer: 0, lean: -0.13, crank: rnd(0, 6), spin: 0, foot: 1, pitch: 0, hopY: 0, hopV: 0, landT: 0, standK: 0,
      hx: 0.3, hz: 0.85, bo: 0, belt: 0.9, halfW: 0.32, wb: g.userData.base || 1.09, D: person(), st: 'hidden', route: null, s: 0, seg: 0, off: 0, offT: 0 };
    A.onHit = (dx, dz, sp) => rammed(A, dx, dz, sp);
    if (A.D) A.D.A = A;
    T.list.push(A);
  }
  T.built = true;
}

// ================================================================ a new run / back to the title
export function start() {
  stop();
  if (!NET || !T.built || (E.MP && E.MP.on())) return;   // (online: no traffic — it isn't synced)
  const W = E.world, G = E.G, P = E.getP && E.getP();
  if (!NET.checked) {   // the calm morning's streets (the chaos layer hidden): which stretches are drivable, where to park
    NET.checked = true;
    try { if (!validate(NET, W)) { NET.roads = []; } NET.spots = mkSpots(NET, W); for (const R of NET.roads) R.esc = { 1: escapeA(R, 1, W), '-1': escapeA(R, -1, W) }; }
    catch (e) { console.warn('traffic: roads', e); NET.roads = []; NET.spots = []; }
  }
  if (!NET.roads.length) return;
  T.on = true; T.t = 0; T.startT = 0; T.panic = false; T.J = { busy: null, busyT: 0 };
  for (const S of NET.spots) S.taken = null;
  const px = P ? P.s.pos.x : 0, pz = P ? P.s.pos.z : 0;
  const cars = T.list.filter(A => A.kind === 'car'), bikes = T.list.filter(A => A.kind === 'bike');
  cars.forEach((A, n) => {
    // about half of them out driving, the rest parked at the kerb with their owners indoors
    const parked = NET.spots.length && (n % 2 === 1 || NET.id === 'prison' && n === 0);
    if (parked) {
      const S = pick(NET.spots.filter(S => !S.taken && Math.hypot(S.x - px, S.z - pz) > 14));
      if (S) { parkAt(A, S); A.D.st = 'inside'; A.D.s.setVisible(false); A.leaveAt = rnd(6, 50); A.house = houseNear(S.x, S.z); return; }
    }
    for (let k = 0; k < 30; k++) if (spawnMoving(A, px, pz, true)) return;
    A.st = 'hidden'; A.respawn = rnd(3, 12);
  });
  for (const A of bikes) { for (let k = 0; k < 30; k++) if (spawnBike(A, px, pz)) break; }
  syncOthers();
}
export function stop() {
  T.on = false; T.panic = false;
  for (const A of T.list) {
    if (A.kind === 'car') DRIVE.releaseCar(A.C); else DRIVE.releaseBike(A);
    hideAgent(A);
  }
  for (const D of T.ppl) restorePerson(D);
  for (const H of T.haz) lampsOff(H); T.haz.length = 0; T.smoke.length = 0;
  if (NET) for (const S of NET.spots) S.taken = null;
  if (T.J) T.J.busy = null;
  DRIVE.others.length = 0;
  hornOff();
}
function hideAgent(A) {
  A.st = 'hidden'; A.v = 0; A.route = null; A.mode = null; A.crashed = false; A.hazard = false; A.passing = false; A.off = A.offT = 0; A.wait = 0; A.jArr = 0;
  if (A.spot) { A.spot.taken = null; A.spot = null; } if (A.dest) { A.dest.taken = null; A.dest = null; }
  A.g.visible = false;
  if (A.kind === 'car') { A.C.box.off = true; A.C.hidden = true; if (A.live) for (const D of A.live.doors || []) setDoor(D, 0); undentLive(A); }
  else { A.down = false; A.lean = -0.13; }
  if (A.D) { A.D.st = 'off'; A.D.s.setVisible(false); }
}
function undentLive(A) { A.g.traverse(m => { if (m.userData && m.userData.dentGeo) { m.geometry.dispose(); m.geometry = m.userData.dentGeo; delete m.userData.dentGeo; } }); A.dentT = 0; }
// a driver who turned goes back to being a person for the next run (as people.js does for the neighbours)
function restorePerson(D) {
  const s = D.s, Z = E.Z, C = E.C;
  if (D.zu) {
    const z = D.zu; z.active = false; z.alive = false;
    for (const arr of [Z.pool, Z.list, C.units]) { const k = arr.indexOf(z); if (k >= 0) arr.splice(k, 1); }
    if (z.corpse) { const k = E.world.containers.indexOf(z.corpse); if (k >= 0) E.world.containers.splice(k, 1); }
    for (const n of ['idle', 'walk']) { s.A[n].stop(); s.A[n] = s.mixer.clipAction(D.kind0.clips[n]); s.A[n].play(); }
    s.kind = D.kind0; s.vw = D.kind0.vw;
    D.zu = null;
  }
  if (s.zTurn || D.looked) { for (const [o, m, v] of D.look) { o.material = m; o.visible = v; } s.zTurn = null; s.keepLook = false; s.spasm = 0; D.looked = false; }
  s.root.scale.copy(D.scl);
  s.dead = false; s.resetActs(); s.lookAt = null; s.fly = null; s.animLod = false;
  D.st = 'off'; D.path = null; D.run = false; s.setVisible(false);
}

// ---------------------------------------------------------------- placing them
function free(x, z, r, A = null) {
  for (const O of T.list) if (O !== A && O.st !== 'hidden' && Math.hypot(O.x - x, O.z - z) < r) return false;
  for (const V of DRIVE.cars) if (V.moved && Math.hypot(V.x - x, V.z - z) < r * 0.6) return false;
  return true;
}
function clearAt(x, z, r) { cp.x = x; cp.z = z; cp.gy = 0; E.world.collide(cp, r, DRIVE.LIEOPT); return Math.hypot(cp.x - x, cp.z - z) < 0.02; }
function parkAt(A, S) {
  A.spot = S; S.taken = A;
  A.x = S.x; A.z = S.z; A.yaw = S.yaw; A.v = 0; A.steer = 0; A.st = 'parked'; A.route = null;
  A.g.visible = true; A.C.hidden = true;
  if (A.live) for (const D of A.live.doors || []) setDoor(D, 0);
  look(A, 0.05);
  boxesOn(A);
}
// a car parked (or left): its own solid boxes, where it stands — everyone walks round it, shots stop at it
function boxesOn(A) {
  const W = E.world, C = A.C, fx = Math.sin(A.yaw), fz = Math.cos(A.yaw);
  W.moveBox(C.box, A.x + fx * A.bo, A.z + fz * A.bo, A.yaw);
  if (C.cab) W.moveBox(C.cab, A.x + fx * A.co, A.z + fz * A.co, A.yaw);
  C.box.off = false; C.x = A.x; C.z = A.z; C.yaw = A.yaw;
}
function boxesOff(A) { A.C.box.off = true; }
// a car already on its way somewhere: somewhere along a trip, out of the way of the others
function spawnMoving(A, px, pz, mid) {
  const trip = planFrom(A, null, mid);
  if (!trip) return false;
  const R = trip.route, s = mid ? rnd(0.12, 0.7) * R.len : 0;
  const p = pointAt(R, s, 0, {});
  if (Math.hypot(p.x - px, p.z - pz) < 22 || !free(p.x, p.z, 14, A) || !clearAt(p.x, p.z, 2.4) || E.world.cars.some(C => !C.hidden && !C.traffic && Math.hypot(C.x - p.x, C.z - p.z) < 7)) return false;
  if (!mid && seen(p.x, p.z, 4)) return false;
  if (NET.J && Math.hypot(p.x - NET.J.x, p.z - NET.J.z) < 14) return false;
  setTrip(A, trip);
  A.s = s; A.seg = segAt(R, s); A.x = p.x; A.z = p.z; A.yaw = Math.atan2(p.tx, p.tz); A.v = Math.min(A.cruise, 7); A.steer = 0;
  if (R.stops[0] && s > R.stops[0].s - 2) R.stops[0].go = true;
  if (R.stops[0] && R.stops[0].go && s > R.stops[0].out) R.stops.shift();
  A.st = 'drive'; A.g.visible = true; A.C.hidden = true; boxesOff(A);
  if (A.D) { A.D.st = 'seat'; A.D.s.setVisible(true); }
  look(A, 0.05);
  return true;
}
function spawnBike(A, px, pz) {
  const R0 = pick(NET.roads), d = Math.random() < 0.5 ? 1 : -1, a = rnd(R0.a0 + 10, R0.a1 - 10);
  if (NET.J && Math.abs(a) < 16) return false;
  const p = LP(R0, d, a, R0.bike);
  if (Math.hypot(p.x - px, p.z - pz) < 18 || !free(p.x, p.z, 10, A) || !clearAt(p.x, p.z, 1.6) || E.world.cars.some(C => !C.hidden && Math.hypot(C.x - p.x, C.z - p.z) < 6)) return false;
  A.cruise = NET.bikeCruise * rnd(0.85, 1.15);
  bikeLeg(A, R0, d, a);
  A.x = p.x; A.z = p.z; A.yaw = yawOf(R0, d); A.v = A.cruise * 0.8; A.s = 0; A.seg = 0; A.down = false;
  A.st = 'drive'; A.g.visible = true; A.bellT = rnd(8, 40);
  if (A.D) { A.D.st = 'seat'; A.D.s.setVisible(true); }
  return true;
}
// a cyclist's next stretch: on to the crossing (straight on or turning), then to the end of that road and round
function bikeLeg(A, R0, d, a) {
  let r2 = R0, d2 = d;
  const J = NET.J;
  if (J && (a - (R0.ax === 'x' ? J.x : J.z)) * d < -(J.stop + 4)) {
    const other = NET.roads.find(R => R !== R0);
    if (other && Math.random() < 0.55) { r2 = other; d2 = Math.random() < 0.5 ? 1 : -1; }
  }
  const aEnd = d2 > 0 ? r2.a1 - 2 : r2.a0 + 2;
  const Rt = buildRoute(R0, d, a, R0.bike, r2, d2, aEnd, r2.bike, r2.bike, A.cruise, true);
  addUturn(Rt, r2, d2, aEnd, r2.bike, 2.6);
  Rt.next = { R: r2, d: -d2, a: aEnd };
  A.route = Rt; A.s = 0; A.seg = 0; A.off = A.offT = 0; A.passing = false;
}
// ---------------------------------------------------------------- trips: from a kerb (or the edge of the map) to another
// start: a spot the car is parked at (null: anywhere — a fresh spawn). Returns { route, from, to } or null.
function planFrom(A, S, mid = false, from = null) {
  const cand = [];
  const cv = NET.cruise * (A.kind === 'car' ? rnd(0.85, 1.1) : 1);
  const starts = [];
  if (from) starts.push(from);
  else if (S) starts.push({ R: S.R, d: S.d, a: S.a, lat: S.R.kerb, spot: S });
  else {
    for (const R of NET.roads) for (const d of [1, -1]) {
      if (R.lo && d > 0) starts.push({ R, d, a: R.a0, lat: R.lane, edge: true });
      if (R.hi && d < 0) starts.push({ R, d, a: R.a1, lat: R.lane, edge: true });
    }
    if (mid || !starts.length) for (const S2 of NET.spots) if (!S2.taken) starts.push({ R: S2.R, d: S2.d, a: S2.a, lat: S2.R.kerb, spot: S2, virt: true });
  }
  for (const st of starts) {
    const J = NET.J, jA = R => J ? (R.ax === 'x' ? J.x : J.z) : 0;
    const ends = [];
    for (const T2 of NET.spots) if (!T2.taken && T2 !== st.spot) ends.push({ R: T2.R, d: T2.d, a: T2.a, lat: T2.R.kerb, spot: T2 });
    for (const R of NET.roads) { if (R.hi) ends.push({ R, d: 1, a: R.a1, lat: R.lane, edge: true }); if (R.lo) ends.push({ R, d: -1, a: R.a0, lat: R.lane, edge: true }); }
    for (const en of ends) {
      if (en.R === st.R && en.d === st.d) { if ((en.a - st.a) * st.d < 32) continue; }
      else if (en.R !== st.R && J) { if ((st.a - jA(st.R)) * st.d > -(J.stop + 9) || (en.a - jA(en.R)) * en.d < J.stop + 9) continue; }
      else continue;
      if (st.edge && en.edge && NET.spots.length && Math.random() < 0.5) continue;
      cand.push([st, en]);
    }
  }
  if (!cand.length) return null;
  const [st, en] = pick(cand);
  const route = buildRoute(st.R, st.d, st.a, st.lat, en.R, en.d, en.a, en.lat, st.R.lane === en.R.lane ? st.R.lane : st.R.lane, cv);
  route.end = en.edge ? 'edge' : 'spot';
  return { route, from: st, to: en, cv };
}
function setTrip(A, trip) {
  A.route = trip.route; A.s = 0; A.seg = 0; A.off = A.offT = 0; A.passing = false; A.wait = 0; A.stuckT = 0; A.jArr = 0;
  A.cruise = trip.cv;
  if (A.dest) A.dest.taken = null;
  A.dest = trip.to.spot || null; if (A.dest) A.dest.taken = A;
}

// ================================================================ every frame
const frus = new THREE.Frustum(), PM = new THREE.Matrix4(), SPH = new THREE.Sphere();
function seen(x, z, r = 3) {
  const cam = E.camera, P = E.getP && E.getP();
  if (P && Math.hypot(x - P.s.pos.x, z - P.s.pos.z) < 20) return true;
  const d = Math.hypot(x - cam.position.x, z - cam.position.z);
  if (d < 20) return true; if (d > 150) return false;
  SPH.center.set(x, 1, z); SPH.radius = r;
  return frus.intersectsSphere(SPH);
}
let lastPhase = null;
export function update(dt) {
  if (!T.on || !E) return;
  if (E.MP && E.MP.on()) { stop(); return; }
  if (dt <= 0) return;
  T.t += dt;
  const G = E.G, cam = E.camera;
  cam.updateMatrixWorld(); PM.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); frus.setFromProjectionMatrix(PM);
  if (!T.panic && G.phase && G.phase !== 'calm' && G.phase !== 'title') startPanic();
  lastPhase = G.phase;
  gather();
  for (const A of T.list) {
    try { agent(A, dt); } catch (e) { console.warn('traffic agent', e); hideAgent(A); }
  }
  for (const D of T.ppl) { try { personStep(D, dt); } catch (e) { console.warn('traffic person', e); D.st = 'off'; D.s.setVisible(false); } }
  syncOthers();
  flashers(dt);
  sounds(dt);
}
function syncOthers() {
  const O = DRIVE.others; O.length = 0;
  for (const A of T.list) if (A.st !== 'hidden' && A.st !== 'abandoned' && A.g.visible) O.push(A);
}

// ---------------------------------------------------------------- who and what is about (once a frame)
const PEEPS = [], VEHS = [];
function gather() {
  PEEPS.length = 0; VEHS.length = 0;
  const C = E.C, P = E.getP && E.getP();
  for (const u of C.npcs || []) if (u.alive && !u.gone && u.s) PEEPS.push({ x: u.s.pos.x, z: u.s.pos.z, r: 0.35, u, kind: 'npc' });
  for (const D of T.ppl) if ((D.st === 'walk' || D.st === 'exit' || D.st === 'enter' || D.st === 'down' || D.st === 'stand') && D.s.visible) PEEPS.push({ x: D.s.pos.x, z: D.s.pos.z, r: 0.35, D, kind: 'walker' });
  const cur = DRIVE.current();
  if (P && P.alive && !cur) PEEPS.push({ x: P.s.pos.x, z: P.s.pos.z, r: 0.4, u: P, kind: 'you' });
  for (const u of E.Z.list) if (u.alive && u.active) PEEPS.push({ x: u.s.pos.x, z: u.s.pos.z, r: 0.38, u, kind: 'z' });
  for (const A of T.list) if (A.st !== 'hidden' && A.st !== 'abandoned') VEHS.push({ x: A.x, z: A.z, yaw: A.yaw, hx: A.kind === 'car' ? A.hx : 0.3, hz: A.kind === 'car' ? A.hz : 0.85, bo: A.kind === 'car' ? A.bo : 0, v: A.v, A, kind: A.kind });
  for (const V of DRIVE.cars) if (V.moved || V === cur) VEHS.push({ x: V.x, z: V.z, yaw: V.yaw, hx: V.hx, hz: V.hz, bo: V.bo, v: V.v || 0, V, kind: 'car', you: V === cur });
  for (const B of DRIVE.bikes) VEHS.push({ x: B.x, z: B.z, yaw: B.yaw, hx: 0.3, hz: 0.85, bo: 0, v: B.v || 0, V: B, kind: 'bike', you: B === cur });
}

// ---------------------------------------------------------------- one vehicle
function agent(A, dt) {
  if (A.st === 'hidden') {
    if (!T.panic && A.kind === 'car' && (A.respawn -= dt) <= 0) { A.respawn = rnd(4, 10); const P = E.getP(); spawnMoving(A, P ? P.s.pos.x : 0, P ? P.s.pos.z : 0, false); }
    return;
  }
  if (A.st === 'abandoned') return;
  if (A.st === 'parked') { parkedStep(A, dt); return; }
  if (A.st === 'wreck' || A.st === 'stopped') { stoppedStep(A, dt); return; }
  if (A.st === 'edgewait') { look(A, dt); if (!seen(A.x, A.z, 4) && !T.panic) { hideAgent(A); A.respawn = rnd(5, 25); } return; }
  if (A.st === 'ready') { look(A, dt); A.readyT -= dt; if (A.readyT <= 0 && laneClearBehind(A)) { A.st = 'drive'; boxesOff(A); if (A.spot) { A.spot.taken = null; A.spot = null; } } return; }
  if (A.st === 'drive') {
    if (A.kind === 'car') driveStep(A, dt); else driveStep(A, dt);
    if (A.st === 'drive') hits(A, dt);
  }
  if (A.st === 'drive' || A.st === 'ready') look(A, dt);
}
// pulling out: nothing coming up the lane behind
function laneClearBehind(A) {
  const R = A.route; if (!R) return true;
  for (const O of VEHS) {
    if (O.A === A) continue;
    const pr = project(R, O.x, O.z, 0, 3);
    if (pr.s < 4 && pr.s > -30 && Math.abs(pr.e) < 2.6 && Math.abs(O.v) > 1) return false;
  }
  for (const p of PEEPS) { if (p.kind === 'z') continue; const pr = project(R, p.x, p.z, 0, 3); if (pr.s > -1 && pr.s < A.hz + 5 && Math.abs(pr.e) < 2) return false; }
  return true;
}
// ---- driving along the route
const TP = { x: 0, z: 0, tx: 0, tz: 1 };
function driveStep(A, dt) {
  const R = A.route, car = A.kind === 'car', panic = A.mode === 'panic', t = T.t;
  if (!R) { hideAgent(A); return; }
  // where on the route we are
  const pr = project(R, A.x, A.z, A.seg - 1, A.seg + 3);
  A.s = pr.s; A.seg = segAt(R, A.s, pr.i); A.e = pr.e;
  const front = A.s + A.hz, v = A.v;
  // backing up out of a face-off (two of them nose to nose, one half in the wrong lane)
  if (A.rev > 0) {
    A.rev -= dt; A.v = car ? -1.4 : -0.9; A.brakeLit = false; A.pedal = false;
    A.steer += clamp(0 - A.steer, -2 * dt, 2 * dt);
    A.yaw = wrapPi(A.yaw + A.v * Math.tan(A.steer) / A.wb * dt);
    A.x += Math.sin(A.yaw) * A.v * dt; A.z += Math.cos(A.yaw) * A.v * dt;
    if (car) A.spin += A.v / A.spec.r * dt; else A.spin += A.v / A.U.r * dt;
    collide(A);
    if (A.rev <= 0) { A.v = 0; A.stuckT = 0; }
    return;
  }
  const bComf = panic ? 5.5 : car ? 2.6 : 1.8;
  let vt = A.cruise * (panic ? (car ? 1.55 : 1.25) : 1), emergency = false;
  // the speed plan: the corners and the end of the trip
  for (let i = A.seg + 1; i < R.P.length && R.S[i] < A.s + 70; i++) {
    const vi = R.V[i] * (panic && i < R.P.length - 1 ? 1.35 : 1), d = Math.max(0, R.S[i] - front + (i === R.P.length - 1 ? A.hz : 0));
    vt = Math.min(vt, Math.sqrt(vi * vi + 2 * bComf * d));
  }
  // the stop sign: stop at the line, wait your turn, go when the crossing's clear
  const J = NET.J, st = R.stops[0];
  if (st) {
    if (!st.go) {
      const d = st.s - front;
      if (panic) { st.go = true; if (T.J.busy === A) T.J.busy = null; }
      else {
        vt = Math.min(vt, Math.sqrt(2 * bComf * Math.max(0, d - 0.25)));
        if (d < 1.6 && v < 0.4) {
          if (!A.jArr) A.jArr = t;
          if (t - A.jArr > (car ? 1.1 : 0.7) && crossingFree(A)) { st.go = true; T.J.busy = A; T.J.busyT = t; }
        }
      }
    } else if (A.s - A.hz > st.out) { R.stops.shift(); A.jArr = 0; if (T.J.busy === A) T.J.busy = null; }
    else if (T.J.busy === A && t - T.J.busyT > 25) T.J.busy = null;
  }
  // the indicator: pulling out (left), pulling in (right), a turn coming up at the crossing
  A.ind = 0;
  if (car) {
    if (R.P.length > 2 && A.s < 9 && Math.abs(A.e) < 3 && R.V[0] <= 3) A.ind = 1;
    else if (R.end === 'spot' && R.len - A.s < 22 && !panic) A.ind = -1;
    else { const j = Math.min(R.P.length - 2, segAt(R, A.s + 28, A.seg)), dy = wrapPi(Math.atan2(R.TX[j], R.TZ[j]) - Math.atan2(R.TX[A.seg], R.TZ[A.seg])); if (Math.abs(dy) > 0.8 && !panic) A.ind = Math.sign(dy); }
  }
  // anything in the way
  const ob = scan(A, panic); if (!ob) A.dbg = '';
  if (ob) {
    const gap = ob.gap;
    const head = ob.kind === 'v' && ob.va < -0.5;   // coming straight at us (it's on our side of the road): stop well short and let it by
    if (head) ob.passable = false;
    const stopGap = head ? (car ? 9 : 5) : ob.kind === 'v' ? (car ? 2.2 : 1.2) : ob.kind === 'b' ? (car ? 1.6 : 0.9) : (panic ? 1.2 : car ? 3.2 : 1.8);
    let follow = false;
    if (ob.kind === 'v' && ob.va > 1 && !(ob.va < A.cruise * 0.6 && ob.passable)) { follow = true; vt = Math.min(vt, Math.max(0, ob.va + (gap - stopGap - 1.1 * v) * 0.55)); }
    else if (ob.passable && (ob.kind !== 'p' || A.wait > (panic ? 0.5 : 6.5))) {
      if (!A.passing || (ob.offPass < 0 ? A.offT > ob.offPass : A.offT < ob.offPass)) { A.offT = ob.offPass; A.passing = true; }
      A.passEnd = Math.max(A.passing ? A.passEnd || 0 : 0, ob.sMax + A.hz + (car ? 3 : 1.5));
      vt = Math.min(vt, panic ? 9 : car ? (ob.kind === 'p' ? 2.5 : 6.5) : 4);
      if (Math.abs(A.off - A.offT) > 0.3) vt = Math.min(vt, gap > 0.7 ? Math.max(1.6, Math.sqrt(2 * bComf * Math.max(0, gap - 0.8))) : 0.4);
    }
    if (!follow && !(A.passing && ob.passable && (Math.abs(A.off - A.offT) < 0.35 || gap > 0.7))) {
      const lim = Math.sqrt(2 * (panic ? 7 : 4.5) * Math.max(0, gap - stopGap));
      if (lim < vt) { vt = lim; if (gap < stopGap + v * v / 12) emergency = true; }
    }
    if (ob.kind === 'p' && v < 0.5 && gap < 8) {
      A.wait += dt;
      // somebody stood in the road: a polite toot (you get one sooner); a panicking driver leans on it
      if (A.kind === 'car' && (ob.you && A.wait > 3.5 || A.wait > 8 || panic) && t > (A.hornT || 0)) { A.hornT = t + (panic ? rnd(1, 2) : rnd(5, 8)); horn(A, panic ? 0.9 : 0.25, panic ? 1 : 2); }
      if (A.kind === 'bike' && t > (A.bellT2 || 0)) { A.bellT2 = t + rnd(4, 7); bell(A); }
    } else if (!ob || ob.kind !== 'p') A.wait = Math.max(0, A.wait - dt);
    if (A.kind === 'bike' && ob.kind === 'p' && gap < 14 && gap > 3 && t > (A.bellT2 || 0)) { A.bellT2 = t + rnd(5, 9); bell(A); }
  } else A.wait = Math.max(0, A.wait - dt * 2);
  if (ob && ob.kind === 'v' && ob.gap < 2.5 && A.stuckT > 6 && !panic) {
    const O = ob.ref && (ob.ref.A || null), mine = Math.abs(A.off) > 0.5 || A.passing, theirs = O && (Math.abs(O.off || 0) > 0.5 || O.passing);
    if (mine || (!theirs && (!O || A.i < O.i))) { A.rev = car ? 2.2 : 1.8; A.passing = false; A.offT = 0; A.noPassT = t + 8; return; }
  }
  if (A.passing && A.s - A.hz > (A.passEnd || 0)) { A.passing = false; A.offT = 0; }
  if (!car && !panic && T.t > (A.bellT || 0)) { A.bellT = T.t + rnd(25, 70); if (A.v > 2) bell(A); }   // a cheery ring now and then
  if (!A.passing) A.offT = 0;
  // the panic: swerving about, and the ones who lose it
  if (panic && A.swerveAt && t > A.swerveAt && !A.swerve) { A.swerve = { t, side: Math.random() < 0.7 ? -1 : 1 }; horn(A, 1, 1.2); }
  // speed
  const accMax = panic ? 4.8 : car ? 2.3 : 1.3, brkMax = emergency ? 9 : panic ? 7 : 5;
  let a = clamp((vt - v) * 2.2, -brkMax, accMax);
  if (A.swerve) a = accMax;
  let nv = Math.max(0, v + a * dt); if (vt < 0.05 && nv < 0.35) nv = 0;
  A.accel = (nv - v) / dt; A.v = nv;
  A.brakeLit = A.accel < -0.7 || (nv < 0.05 && !A.swerve);
  A.pedal = !car && nv > 0.2 && (a > -0.15 && nv < vt + 0.4);
  // the lane offset (going round something), eased over
  const rate = car ? 0.25 + 0.16 * nv : 0.5 + 0.25 * nv;
  A.off += clamp(A.offT - A.off, -rate * dt, rate * dt);
  // steering: aim at a point ahead on the route (pure pursuit)
  const Ld = car ? clamp(3 + 0.42 * nv, 3.6, 12) : clamp(1.8 + 0.45 * nv, 2.2, 6);
  pointAt(R, Math.min(A.s + Ld, R.len + 0.5), A.off + (A.weave && panic ? Math.sin(t * 1.7 + A.i) * 0.45 : 0), TP, A.seg);
  if (A.s + Ld > R.len) { const ex = A.s + Ld - R.len; TP.x += TP.tx * ex; TP.z += TP.tz * ex; }
  const dx = TP.x - A.x, dz = TP.z - A.z, c = Math.cos(A.yaw), s = Math.sin(A.yaw);
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  let want = Math.atan2(2 * A.wb * lx, lx * lx + lz * lz);
  if (A.swerve) want = A.swerve.side * 0.42;
  const lock = car ? 0.62 : 0.6;
  want = clamp(want, -lock, lock);
  A.steer += clamp(want - A.steer, -2.4 * dt, 2.4 * dt);
  const yr = nv * Math.tan(A.steer) / A.wb; A.yawRate = yr;
  A.yaw = wrapPi(A.yaw + yr * dt);
  A.x += Math.sin(A.yaw) * nv * dt; A.z += Math.cos(A.yaw) * nv * dt;
  if (car) A.spin += nv / A.spec.r * dt; else { A.spin += nv / A.U.r * dt; if (A.pedal) A.crank += nv / A.U.r / 2.6 * dt; }
  collide(A);
  // stuck (somebody parked in the way, a jam that won't clear): after a while, out of sight, it's gone elsewhere
  if (nv < 0.3) A.stuckT = (A.stuckT || 0) + dt; else A.stuckT = 0;
  if (A.swerve && t - A.swerve.t > 2.6) { crash(A, 0, null); return; }
  if (!panic && ((A.stuckT > 40 && !seen(A.x, A.z, 4)) || (A.stuckT > 90 && !nearYou(A, 45)))) { recycle(A); return; }
  if (panic && car && A.stuckT > 4) { arrive(A); return; }   // boxed in: they leave it where it is and run
  if (Math.abs(A.e - A.off) > 4.5 && !A.swerve && !seen(A.x, A.z, 4)) { recycle(A); return; }
  // the end of the trip
  if (R.end === 'spot' && car && A.s > R.len - 16 && A.stuckT > 8 && !panic && reroute(A)) return;
  if (A.s > R.len - (car ? 0.45 : 1.2) || (R.end === 'spot' && A.s > R.len - 3 && A.stuckT > 20)) arrive(A);
}
// whose turn at the crossing: first to stop goes first; nobody else in it (you included)
function crossingFree(A) {
  const J = NET.J, TJ = T.J;
  if (TJ.busy && TJ.busy !== A && TJ.busy.st === 'drive' && TJ.busy.route && TJ.busy.route.stops[0] && TJ.busy.route.stops[0].go) return false;
  for (const O of T.list) if (O !== A && O.st === 'drive' && O.jArr && O.jArr < A.jArr - 0.05 && O.route && O.route.stops[0] && !O.route.stops[0].go) return false;
  for (const O of VEHS) { if (O.A === A) continue; if (Math.hypot(O.x - J.x, O.z - J.z) < J.r + 1 && (Math.abs(O.v) > 0.5 || (O.A && O.A.route && O.A.route.stops[0] && O.A.route.stops[0].go))) return false; }
  return true;
}
// ---- the look-ahead: the nearest thing in the lane in front (people, the dead, cars, bikes, walls, bins...)
const BOXSEEN = new Set();
function scan(A, panic) {
  const R = A.route, car = A.kind === 'car';
  const look = Math.min(55, A.hz + 6 + A.v * A.v / 5 + 8), sEnd = A.s + look, front = A.s + A.hz;
  const i0 = A.seg, i1 = segAt(R, sEnd, A.seg) + 1;
  const offUse = A.passing ? A.offT : A.off, myH = A.halfW;
  const offMin = car ? -2.95 : -2.95;   // (a car can put most of itself over the centre line; a bike swings out as far)
  let best = null;
  const cands = [];
  const consider = (x, z, hs, he, yaw, kind, va, ref) => {
    const p = project(R, x, z, i0, i1);
    if (Math.abs(p.e) > 14 || p.s > sEnd + 6 || p.s < A.s - 12) return;
    let sh = hs, eh = he;
    if (yaw != null) { const ty = Math.atan2(p.tx, p.tz), dd = yaw - ty, cs = Math.abs(Math.cos(dd)), sn = Math.abs(Math.sin(dd)); sh = hs * cs + he * sn; eh = he * cs + hs * sn; }
    const sMin = p.s - sh, sMax = p.s + sh, eMin = p.e - eh, eMax = p.e + eh;
    cands.push({ sMin, sMax, eMin, eMax, kind, va, ref });
    if (sMax < front - 0.4 || sMin > sEnd) return;
    const m = kind === 'p' ? (panic ? 0.35 : car ? 0.75 : 0.45) : kind === 'v' ? 0.3 : 0.22;
    if (eMax < offUse - myH - m || eMin > offUse + myH + m) {
      // not in the way at the offset we're steering to — but if we're still easing over, it may be at where we are
      if (!(A.passing && sMin - front < 3 && !(eMax < A.off - myH - m || eMin > A.off + myH + m))) return;
    }
    const gap = Math.max(0, sMin - front);
    if (!best || gap < best.gap) best = { gap, sMin, sMax, eMin, eMax, kind, va, ref, m };
  };
  for (const p of PEEPS) {
    if (p.D && p.D === A.D) continue;
    if (p.kind === 'z' && (panic || T.panic) && car) continue;   // the dead: a panicking driver goes straight through them
    const dx = p.x - A.x, dz = p.z - A.z; if (dx * dx + dz * dz > (look + 4) ** 2) continue;
    consider(p.x, p.z, p.r, p.r, null, 'p', 0, p);
  }
  for (const O of VEHS) {
    if (O.A === A) continue;
    const dx = O.x - A.x, dz = O.z - A.z; if (dx * dx + dz * dz > (look + 8) ** 2) continue;
    const fx = Math.sin(O.yaw), fz = Math.cos(O.yaw);
    const p0 = project(R, O.x, O.z, i0, i1), va = O.v * (fx * p0.tx + fz * p0.tz);
    consider(O.x + fx * O.bo, O.z + fz * O.bo, O.hz, O.hx, O.yaw, 'v', va, O);
  }
  // walls, parked cars, bins, fences: the boxes along the way
  BOXSEEN.clear();
  const W = E.world;
  for (let ss = A.s + 2; ss < sEnd + 2; ss += 4) {
    pointAt(R, Math.min(ss, R.len), 0, TP, A.seg);
    for (const b of W.near(TP.x, TP.z, 4.2)) {
      if (BOXSEEN.has(b) || b.off || b.noWalk || b.y1 < 0.3 || b.y0 > 1.1 || (A.C && (b === A.C.box || b === A.C.cab))) continue;
      BOXSEEN.add(b);
    }
  }
  for (const b of BOXSEEN) {
    // a long wall or fence: in pieces (so only the bit near the road counts, at its real place)
    const yw = b.yaw || 0, L = Math.max(b.hx, b.hz);
    if (L <= 3.5) { consider(b.x, b.z, b.hz, b.hx, yw, 'b', 0, b); continue; }
    const alongX = b.hx > b.hz, n = Math.ceil(L / 2.5), seg = L / n, c = Math.cos(yw), sn = Math.sin(yw);
    for (let k = 0; k < n; k++) {
      const o = -L + seg * (2 * k + 1), x = b.x + (alongX ? o * c : o * sn), z = b.z + (alongX ? -o * sn : o * c);
      const dx = x - A.x, dz = z - A.z; if (dx * dx + dz * dz > (look + 6) ** 2) continue;
      consider(x, z, alongX ? b.hz : seg, alongX ? seg : b.hx, yw, 'b', 0, b);
    }
  }
  if (!best) return null;
  // can we go round it? on the left, without crossing too far over, with nothing coming the other way
  const offPass = best.eMin - myH - best.m - 0.05;
  best.offPass = offPass;
  let ok = offPass >= offMin && (best.kind !== 'v' || best.va < 1 || best.va < A.cruise * 0.6), why = ok ? '' : 'room';
  if (ok && NET.J && !panic) { const jd = Math.hypot(A.x - NET.J.x, A.z - NET.J.z); if (jd < NET.J.r + 14 && R.stops.length) { ok = false; why = 'junction'; } }
  { const j = Math.min(R.P.length - 1, segAt(R, best.sMax + 2, A.seg)); if (ok && (A.stuckT || 0) < 15 && Math.abs(R.TX[A.seg] * R.TX[j] + R.TZ[A.seg] * R.TZ[j]) < 0.95) { ok = false; why = 'bend'; } }   // not on a bend
  if (ok) {
    const reach = best.sMax + 12 + A.v * 2.5;
    for (const c of cands) {
      if (c === best || c.kind !== 'v' && c.kind !== 'p') continue;
      if (c.ref === best.ref) continue;
      if (c.kind === 'v' && c.va > -1 && c.sMax < A.s + A.hz * 0.3) continue;   // behind us (not coming at us): not in the way
      const comeTo = c.va < 0 ? -c.va * 4 : 0;
      if (c.eMax < offPass - myH - 0.5 || c.eMin > Math.min(A.off, 0) + myH * 0.2) continue;
      if (c.sMax < A.s - 6 || c.sMin > reach + comeTo) continue;
      if (c.kind === 'v' && (c.sMin > best.sMax + 2) && c.va > 1 && c.eMin > -0.2) continue;
      if (Math.abs(c.va) < 0.5 && (c.sMin > best.sMax + A.hz * 2 + 3 || c.sMax < best.sMin - 2)) continue;   // parked beyond the gap: we pull back in before it
      ok = false; why = 'oncoming ' + c.kind + ' ' + c.sMin.toFixed(1) + ' ' + c.eMin.toFixed(1); break;
    }
  }
  // no way round on the left: maybe on the right (somebody standing out in the road, a gap by the kerb)
  if (!ok && why === 'room' && best.kind !== 'v') {
    const offR = best.eMax + myH + best.m + 0.05, offMax = car ? 0.85 : 0.45;
    if (offR <= offMax && !cands.some(c => c !== best && c.ref !== best.ref && c.sMax > A.s - 2 && c.sMin < best.sMax + 6 && c.eMax > best.eMax && c.eMin < offR + myH + 0.2)) { ok = true; why = ''; best.offPass = offR; }
  }
  if (ok && A.noPassT > T.t) { ok = false; why = 'cooldown'; }
  if (!ok && A.passing && front < best.sMin + 0.5 && Math.abs(A.off) < Math.abs(A.offT) * 0.8) { A.passing = false; A.offT = 0; }   // not alongside yet: back into the lane
  best.passable = ok; A.dbg = best.kind + ' gap ' + best.gap.toFixed(1) + ' e ' + best.eMin.toFixed(2) + '..' + best.eMax.toFixed(2) + ' pass ' + offPass.toFixed(2) + ' ' + why + (best.ref && best.ref.kind ? ' ' + best.ref.kind : '') + (best.kind === 'b' ? ` box ${best.ref.x.toFixed(1)},${best.ref.z.toFixed(1)} h ${best.ref.hx.toFixed(1)}x${best.ref.hz.toFixed(1)} y ${best.ref.y0}-${best.ref.y1} ${best.ref.mat}${best.ref.brk ? ' brk' : ''}` : '');
  best.you = best.ref && best.ref.kind === 'you';
  if (best.kind === 'p' && best.ref && best.ref.kind === 'z' && !car) best.passable = ok;
  return best;
}
// ---- solid: pushed out of the world's boxes and the other cars, a bump slows it (a real hit is a crash in a panic)
function collide(A) {
  const W = E.world, car = A.kind === 'car';
  let worst = 0, nx = 0, nz = 0, mat = null;
  const pts = car ? DRIVE.ringOf(A) : BIKE_RING, r = car ? pts.r : 0.3;
  for (const [lx, lz] of pts) {
    DRIVE.carToWorld(A, lx, lz, cp); cp.gy = 0; const x0 = cp.x, z0 = cp.z;
    const b = W.collide(cp, r, DRIVE.LIEOPT);
    for (const O of VEHS) {
      if (O.A === A) continue;
      if (Math.abs(O.x - A.x) > 9 || Math.abs(O.z - A.z) > 9) continue;
      if (O.A && O.A.st === 'parked') continue;   // (its own boxes are on)
      DRIVE.pushRect(cp, r, O.x, O.z, O.yaw, O.hx, O.hz, O.bo);
    }
    const dx = cp.x - x0, dz = cp.z - z0, d = Math.hypot(dx, dz);
    if (d < 1e-5) continue;
    A.x += dx; A.z += dz;
    if (car) { const c = Math.cos(A.yaw), s = Math.sin(A.yaw), rx = lx * c + lz * s, rz = -lx * s + lz * c; A.yaw = wrapPi(A.yaw + (dx * rz - dz * rx) / (rx * rx + rz * rz + 1) * 0.3); }
    if (d > worst) { worst = d; nx = dx / d; nz = dz / d; mat = b && b.mat; }
  }
  if (!worst) return;
  const vn = (Math.sin(A.yaw) * nx + Math.cos(A.yaw) * nz) * A.v;
  if (vn >= 0) return;
  const sp = -vn;
  if (A.mode === 'panic' && sp > 3.5 && car) { crash(A, sp, mat); return; }
  A.v *= sp > 3 ? 0.25 : 0.7;
  if (sp > 2.5) bump(A, sp, mat);
}
const BIKE_RING = [[0, 0.5], [0, -0.45]];
function bump(A, sp, mat) {
  if (T.t < (A.bumpT || 0)) return; A.bumpT = T.t + 1;
  const p = V3.set(A.x, 0.7, A.z);
  if (E.SND.impact) E.SND.impact(p, 'metal', Math.min(1.5, sp / 6));
  if (A.kind === 'car') { A.hazard = true; A.hazUntil = T.t + 8; addHaz(A, 8); if (T.t > (A.hornT || 0)) { A.hornT = T.t + 5; horn(A, 0.6, 1); } }
}
// rammed by your car (drive.js collideCar → shoveCar → here)
function rammed(A, dx, dz, sp) {
  if (A.st === 'hidden' || A.st === 'abandoned') return;
  A.x += dx * Math.min(0.6, sp * 0.05); A.z += dz * Math.min(0.6, sp * 0.05);
  A.v *= 0.3;
  if (A.kind === 'bike') { if (sp > 1.5) knockOff(A, dx, dz, sp); return; }
  if (sp > 7 && !A.crashed) { crash(A, sp, 'metal'); return; }
  if (sp > 2) { bump(A, sp, 'metal'); if (A.st === 'drive') { A.stuckT = 0; A.wait = 0; } }
}

// ---------------------------------------------------------------- run over: you, the neighbours, the dead
const HV = new THREE.Vector3();
function hits(A, dt) {
  const sp = Math.abs(A.v); if (sp < 1.6) return;
  const car = A.kind === 'car', hx = car ? A.hx : 0.25, hz = car ? A.hz : 0.85, bo = car ? A.bo : 0, t = T.t;
  const c = Math.cos(A.yaw), s = Math.sin(A.yaw);
  const inside = (p, r) => { const dx = p.x - A.x, dz = p.z - A.z; if (dx * dx + dz * dz > (hz + 2) ** 2) return null; const lx = dx * c - dz * s, lz = dx * s + dz * c - bo; return Math.abs(lx) < hx + r && Math.abs(lz) < hz + r ? lx : null; };
  const dir = () => new THREE.Vector3(Math.sin(A.yaw), 0, Math.cos(A.yaw));
  // you, on foot
  const P = E.getP && E.getP();
  if (P && P.alive && !DRIVE.active() && !(P._carT > t) && inside(P.s.pos, 0.33) !== null && sp > (car ? 3 : 2.5)) {
    P._carT = t + 1.2;
    const d = dir();
    E.damage(P, car ? 6 + sp * sp * 0.32 : 4 + sp * 1.5, null, { dir: d, knock: 1, crash: true });
    if (P.alive && P.s.acts.Hit_Knockback) P.s.play('Hit_Knockback', { fade: 0.1, rate: 1.3 });
    if (car && sp > 9 && P.alive) P.s.fly = { vx: d.x * sp * 0.35, vy: 1.5 + sp * 0.08, vz: d.z * sp * 0.35 };
    E.C.shake = Math.max(E.C.shake || 0, car ? 0.7 : 0.35);
    if (E.SND.impact) E.SND.impact(P.s.pos.clone(), 'flesh', 1);
    if (E.SND.meleeHit) E.SND.meleeHit('blunt', V3.set(P.s.pos.x, 1, P.s.pos.z), false, Math.min(1.4, sp / 8));
    A.v *= car ? 0.55 : 0.3; if (!car) knockOff(A, Math.sin(A.yaw), Math.cos(A.yaw), sp);
    if (A.mode !== 'panic' && car) { A.hazard = true; addHaz(A, 10); }
    return;
  }
  // the neighbours (people.js): the bumper takes their legs; fast, they go over the bonnet
  if (E.PEOPLE && E.PEOPLE.hurtNPC) for (const u of E.C.npcs || []) {
    if (!u.alive || u.st === 'ko' || u.st === 'down' || (u._carT > t)) continue;
    if (inside(u.s.pos, 0.32) === null || sp < (car ? 2.5 : 2.2)) continue;
    u._carT = t + 0.8; const d = dir();
    E.PEOPLE.hurtNPC(u, car ? sp * 4 : 4 + sp * 1.5, null, { dir: d, part: car && sp > 9 ? 'head' : 'legs', crash: true, thrown: car && sp > 9 });
    if (car && sp > 7) u.s.fly = { vx: d.x * sp * 0.5, vy: 1.2 + sp * 0.1, vz: d.z * sp * 0.5 };
    if (E.SND.meleeHit) E.SND.meleeHit('blunt', V3.set(u.s.pos.x, 1, u.s.pos.z), false, Math.min(1.4, sp / 8));
    A.v *= car ? 0.8 : 0.4;
  }
  // the dead: knocked flying, or rolled over
  for (const u of E.Z.list) {
    if (!u.alive || !u.active || (u._carT > t)) continue;
    const lx = inside(u.s.pos, 0.32); if (lx === null) continue;
    if (u.z && u.z.down > 0 && !u.s.fly) { if (sp > 1) { u._carT = t + 0.6; E.damage(u, car ? 8 + sp : 3, null, { dir: new THREE.Vector3(0, -1, 0), part: 'chest', vehicle: true }); if (E.SND.stomp) E.SND.stomp(V3.set(u.s.pos.x, 0.3, u.s.pos.z)); } continue; }
    if (sp < (car ? 2.5 : 2.2)) continue;
    u._carT = t + 0.8;
    HV.set(s, 0, c).addScaledVector(V4.set(c, 0, -s), clamp(lx / (hx + 0.32), -1, 1) * 0.5).normalize();
    const dmg = car ? (sp < 6 ? 18 : sp * sp * 0.45) : 6 + sp * 2, big = car && sp > 9;
    E.damage(u, dmg, null, { dir: HV.clone(), knock: 1, part: big && sp > 13 ? 'head' : 'chest', vehicle: true, fling: big ? { vx: HV.x * sp * 0.55, vy: 1.5 + sp * 0.12, vz: HV.z * sp * 0.55 } : null });
    if (u.alive) { if (u.z && !(u.z.down > 0)) knockDown(u, HV); if (big) u.s.fly = { vx: HV.x * sp * 0.5, vy: 1.4 + sp * 0.1, vz: HV.z * sp * 0.5 }; else u.s.vel.set(HV.x * (1.5 + sp * 0.4), 0, HV.z * (1.5 + sp * 0.4)); }
    if (E.SND.meleeHit) E.SND.meleeHit('blunt', V3.set(u.s.pos.x, 1, u.s.pos.z), false, car ? 1.4 : 0.9);
    if (car && E.SND.impact) E.SND.impact(V3, 'metal', 0.6);
    if (E.fx && E.fx.blood) E.fx.blood(V3.set(u.s.pos.x, 1.0, u.s.pos.z), V4.set(HV.x, 0.3, HV.z), car ? 1.2 : 0.6);
    A.v *= car ? (sp > 9 ? 0.93 : 0.85) : 0.45;
    if (!car && sp > 3) knockOff(A, s, c, sp);
  }
}

// ---------------------------------------------------------------- the look: body on its springs, wheels, lights, the rider
function look(A, dt) {
  if (A.kind === 'car') {
    A.out = 0;
    DRIVE.carLook(A, dt, { brakeLit: A.brakeLit && A.st !== 'parked', ind: A.st === 'drive' || A.st === 'ready' ? A.ind || 0 : 0 });
    // the driver, sat at the wheel (posed in full when you could see it, less often further off)
    const D = A.D; if (!D || D.st !== 'seat') return;
    seatPose(A, D, dt);
  } else {
    // the lean into a turn; a foot down when stopped
    const stopped = A.v < 0.4 && !A.pedal;
    const lean = -Math.atan(clamp(A.v * (A.yawRate || 0) / 9.81, -0.7, 0.7));
    A.foot = damp(A.foot ?? 0, stopped ? 1 : 0, 6, dt);
    A.standK = damp(A.standK || 0, A.v < 2 && A.pedal ? 0.6 : 0, 4, dt);
    A.lean = damp(A.lean, lean * (1 - A.foot) - 0.13 * A.foot + Math.sin(T.t * 1.7 + A.i) * 0.012 * (1 - A.foot) * Math.min(1, A.v), 8, dt);
    DRIVE.bikePose(A, dt);
    const D = A.D; if (!D || D.st !== 'seat') return;
    seatPose(A, D, dt);
  }
}
const IDLE = { move: null, speed: 0, aimYaw: 0, aimPitch: 0, combat: 0 };
function seatPose(A, D, dt) {
  const cam = E.camera, d = Math.hypot(A.x - cam.position.x, A.z - cam.position.z), s = D.s;
  const vis = d < (MOB ? 55 : 85);
  s.setVisible(vis && A.g.visible);
  if (!vis) return;
  D.acc = (D.acc || 0) + dt;
  const every = d < 35 ? 1 : d < 60 ? 3 : 5;
  D.n = ((D.n || 0) + 1) % every;
  if (D.n === 0 || !D.rel) {
    IDLE.aimYaw = A.yaw;
    s.update(D.acc, IDLE); D.acc = 0;
    DRIVE.seatRider(A, dt, D, 1);
    // where the body sits in the car (to carry it along on the frames in between)
    const L = DRIVE.carToLocal(A, s.pivot.position.x, s.pivot.position.z);
    D.rel = { lx: L.lx, lz: L.lz, dy: s.pivot.position.y - A.y, q: s.pivot.quaternion.clone(), yaw: A.yaw };
  } else {
    const w = DRIVE.carToWorld(A, D.rel.lx, D.rel.lz);
    s.pivot.position.set(w.x, A.y + D.rel.dy, w.z);
    s.pivot.quaternion.copy(D.rel.q).premultiply(TQ.setFromAxisAngle(UPV, A.yaw - D.rel.yaw));
  }
}
const TQ = new THREE.Quaternion(), UPV = new THREE.Vector3(0, 1, 0);
function door(A, k) { if (A.live && A.live.doors && A.live.doors[0]) setDoor(A.live.doors[0], k); }

// ---------------------------------------------------------------- arriving, parked, getting out and back in
function arrive(A) {
  const R = A.route;
  A.v = 0; A.passing = false; A.off = A.offT = 0;
  if (A.kind === 'bike') {
    if (T.panic) return;
    const n = R.next; if (!n) { hideAgent(A); return; }
    bikeLeg(A, n.R, n.d, n.a);
    A.v = 2.5;
    return;
  }
  if (A.mode === 'panic' && R.end === 'edge' && !seen(A.x, A.z, 4)) { if (A.D) { A.D.st = 'off'; } hideAgent(A); return; }   // got out of town
  if (A.mode === 'panic') { A.st = 'stopped'; A.stopT = T.t; A.hazard = Math.random() < 0.5; if (A.hazard) addHaz(A, rnd(60, 200)); A.brakeLit = false; return; }
  if (R.end === 'edge') { A.st = 'edgewait'; A.brakeLit = true; return; }
  // pulled in at the kerb
  const S = A.dest; A.dest = null;
  if (S) { S.taken = A; A.spot = S; }
  A.st = 'parked'; A.brakeLit = false; A.parkT = T.t;
  boxesOn(A);
  look(A, 0.016);
  if (A.D && A.D.st === 'seat') { A.D.st = 'getout'; A.D.t = rnd(0.8, 2.2); }
  A.house = houseNear(A.x, A.z);
  A.leaveAt = T.t + rnd(35, 110);
}
function houseNear(x, z) {
  const W = E.world, G = E.G;
  let best = null, bd = 34;
  for (const H of W.houses || []) {
    if (!H.front || H.store || H === G.home || H.occupied) continue;
    const D = H.front, o = [D.x + Math.sin(H.yaw) * 1.35, D.z + Math.cos(H.yaw) * 1.35], d = Math.hypot(o[0] - x, o[1] - z);
    if (d < bd) { bd = d; best = { H, out: o }; }
  }
  return best;
}
function parkedStep(A, dt) {
  const D = A.D, t = T.t;
  if (A.kind !== 'car') return;
  if (D && D.st === 'seat') seatPose(A, D, dt);
  // time to go again: the owner comes back out (or, out of sight, is simply back in the seat)
  if (!T.panic && D && D.st === 'inside' && t > A.leaveAt) {
    const trip = planFrom(A, A.spot);
    if (!trip) { if (!seen(A.x, A.z, 4)) { recycle(A); } else A.leaveAt = t + 15; return; }
    A.trip = trip;
    const dp = doorPt(A);
    if (A.house && seen(A.x, A.z, 4) && Math.hypot(A.house.out[0] - dp.x, A.house.out[1] - dp.z) < 40) {
      D.s.place(A.house.out[0], A.house.out[1], 0, E.world.groundY(A.house.out[0], A.house.out[1], 0, false)); D.s.resetActs(); D.s.setVisible(true);
      D.st = 'walk'; D.run = false; D.goal = { x: dp.x, z: dp.z, then: 'enter' }; D.path = findPath(D.s.pos.x, D.s.pos.z, dp.x, dp.z); D.pi = 0; D.t = 0; D.stuck = 0;
    } else { D.st = 'seat'; D.s.setVisible(true); D.rel = null; A.st2 = 'start'; }
  }
  if (D && D.st === 'seat' && A.trip && !T.panic) {
    // in, door shut: start up, look over the shoulder, pull out
    setTrip(A, A.trip); A.trip = null;
    A.st = 'ready'; A.readyT = rnd(1.2, 2.4); startSound(A);
  }
}
function doorPt(A) { return DRIVE.carToWorld(A, A.hx + 0.5, A.spec.cab.front + 0.25); }
// gone somewhere else, out of sight: parked on another street, or driving in from the edge of the map
function nearYou(A, r) { const P = E.getP && E.getP(); return !!P && Math.hypot(P.s.pos.x - A.x, P.s.pos.z - A.z) < r; }
function recycle(A) {
  if (A.kind === 'bike') { const P = E.getP(); hideAgent(A); for (let k = 0; k < 20; k++) if (spawnBike(A, P ? P.s.pos.x : 0, P ? P.s.pos.z : 0)) break; return; }
  const D = A.D;
  if (A.spot) { A.spot.taken = null; A.spot = null; } if (A.dest) { A.dest.taken = null; A.dest = null; }
  const S = pick(NET.spots.filter(S => !S.taken && !seen(S.x, S.z, 4) && planFrom(A, S)));
  if (S && Math.random() < 0.6) { parkAt(A, S); if (D) { D.st = 'inside'; D.s.setVisible(false); } A.leaveAt = T.t + rnd(5, 30); A.house = houseNear(S.x, S.z); return; }
  hideAgent(A); A.respawn = rnd(2, 8);
}
function stoppedStep(A, dt) {
  const D = A.D, t = T.t;
  look(A, dt);
  A.v = 0;
  if (D && D.st === 'seat' && t - A.stopT > (A.crashed ? rnd(1.5, 3) : 0.6)) { D.st = 'getout'; D.t = 0; D.flee = true; D.hurt = A.crashed && Math.random() < 0.55; }
  if (!D || D.st === 'off' || D.st === 'inside' || D.st === 'walk' || D.st === 'down' || D.st === 'zombie' || D.st === 'stand') abandon(A);
}

// ---------------------------------------------------------------- the people: getting out, walking, going indoors
const findPath = (x0, z0, x1, z1) => { try { return E.PEOPLE && E.PEOPLE.findPath ? E.PEOPLE.findPath(x0, z0, x1, z1, 20000) : null; } catch { return null; } };
function personStep(D, dt) {
  const A = D.A, s = D.s, W = E.world, t = T.t;
  if (D.st === 'off' || D.st === 'inside' || D.st === 'zombie' || D.st === 'seat') return;
  if (D.st === 'getout') {   // a moment (seatbelt, keys), then the door
    seatPose(A, D, dt);
    D.t -= dt; if (D.t > 0) return;
    D.st = 'exit'; D.ex = { t: 0, dur: D.flee ? 0.75 : 1.0, at: exitSpot(A) };
    if (E.SND.door) E.SND.door('open', V3.set(A.x, 1, A.z));
    return;
  }
  if (D.st === 'exit' || D.st === 'enter') { inOut(A, D, dt); return; }
  if (D.st === 'down') {
    s.update(dt, {});
    if (D.turnAt) { turnAmount(s, (t - D.downAt) / Math.max(0.1, D.turnAt - D.downAt)); if (t >= D.turnAt) toZombie(D); }
    return;
  }
  if (D.st === 'stand') { s.update(dt, { move: null, speed: 0, aimYaw: s.yaw }); D.t -= dt; if (D.t <= 0) D.st = D.next || 'walk'; return; }
  if (D.st === 'walk') {
    if (T.panic && !D.run) { D.run = true; if (D.goal && D.goal.then === 'enter') goIndoors(D); }
    let gx = D.goal.x, gz = D.goal.z;
    if (D.path && D.pi < D.path.length) { [gx, gz] = D.path[D.pi]; if (Math.hypot(gx - s.pos.x, gz - s.pos.z) < 0.7) D.pi++; }
    const dx = D.goal.x - s.pos.x, dz = D.goal.z - s.pos.z, dGoal = Math.hypot(dx, dz);
    const cam = E.camera, far = Math.hypot(s.pos.x - cam.position.x, s.pos.z - cam.position.z) > 55;
    s.setVisible(Math.hypot(s.pos.x - cam.position.x, s.pos.z - cam.position.z) < (MOB ? 70 : 110));
    if (dGoal < 0.55 || (dGoal < 1.2 && D.goal.then === 'inside')) {
      if (D.goal.then === 'enter' && A && A.st === 'parked' && !T.panic) { D.st = 'enter'; D.ex = { t: 0, dur: 1.0, sx: s.pos.x, sz: s.pos.z, at: doorPt(A) }; if (E.SND.door) E.SND.door('open', V3.set(A.x, 1, A.z)); return; }
      D.st = 'inside'; s.setVisible(false);
      if (D.goal.house && E.SND.door && !far) E.SND.door('close', V3.set(D.goal.x, 1, D.goal.z));
      return;
    }
    const sp = D.run ? s.vr * (D.hurt ? 0.5 : 0.9) : s.vw * 0.95;
    const cmd = { move: Math.atan2(gx - s.pos.x, gz - s.pos.z), speed: sp, aimYaw: s.yaw, combat: 0 };
    const ox = s.pos.x, oz = s.pos.z;
    D.acc = (D.acc || 0) + dt; D.n = ((D.n || 0) + 1) % (far ? 3 : 1);
    if (D.n === 0) { s.update(D.acc, cmd); D.acc = 0; }
    W.collide(s.pos, 0.3); DRIVE.pushBodies(s.pos, 0.3);
    D.t += dt;
    D.stuck = Math.hypot(s.pos.x - ox, s.pos.z - oz) < sp * dt * 0.2 ? (D.stuck || 0) + dt : 0;
    if (D.stuck > 2.5 && D.path && D.pi < D.path.length) { D.pi++; D.stuck = 0; }
    // lost, or out of sight long enough: they got where they were going
    if ((D.t > 45 || D.stuck > 5) && !seen(s.pos.x, s.pos.z, 1.5)) { if (D.goal.then === 'enter' && A && A.st === 'parked') { D.st = 'seat'; D.rel = null; s.setVisible(true); } else { D.st = 'inside'; s.setVisible(false); } }
    // the dead catch the ones running past them
    if (T.panic && D.run) for (const u of E.Z.list) {
      if (!u.alive || !u.active || (u.z && u.z.down > 0)) continue;
      if (Math.hypot(u.s.pos.x - s.pos.x, u.s.pos.z - s.pos.z) < 1.15 && Math.random() < dt * 1.6) { bitten(D, u); break; }
    }
  }
}
// where the driver steps out: by the door (or the other side, or behind) — wherever there's room
function exitSpot(A) {
  if (A.kind === 'bike') return DRIVE.carToWorld(A, 0.65, -0.1);
  const W = E.world, cf = A.spec.cab.front;
  for (const [lx, lz] of [[A.hx + 0.55, cf + 0.3], [A.hx + 0.55, 0], [-(A.hx + 0.55), cf + 0.3], [0, A.bo - A.hz - 0.7]]) {
    const w = DRIVE.carToWorld(A, lx, lz), p = { x: w.x, z: w.z, gy: 0 };
    W.collide(p, 0.32); if (Math.hypot(p.x - w.x, p.z - w.z) < 0.12 && !W.houseAt(p.x, p.z)) return p;
  }
  return DRIVE.carToWorld(A, A.hx + 0.6, 0);
}
// out of the car (or back in): the door swings, the body turns out of the seat onto the road (drive.js's way)
function inOut(A, D, dt) {
  const X = D.ex, s = D.s, ent = D.st === 'enter';
  X.t += dt; const k = Math.min(1, X.t / X.dur);
  const m = ent ? smooth(0.25, 0.78, k) : 1 - smooth(0.12, 0.62, k);
  const leave = !ent && D.flee;
  const open = ent ? smooth(0, 0.28, k) * (1 - smooth(0.7, 0.94, k)) : leave ? smooth(0, 0.25, k) * 0.9 : smooth(0, 0.25, k) * (1 - smooth(0.72, 0.96, k));
  door(A, open);
  if (!X.slam && !leave && k > (ent ? 0.9 : 0.93)) { X.slam = true; if (E.SND.door) E.SND.door('close', V3.set(A.x, 1, A.z)); }
  const e0 = smooth(0, 0.25, k), px = ent ? lerp(X.sx, X.at.x, e0) : X.at.x, pz = ent ? lerp(X.sz, X.at.z, e0) : X.at.z;
  const gy = E.world.groundY(px, pz, 0, false);
  s.setVisible(true);
  if (m > 0.001) {
    IDLE.aimYaw = A.yaw; s.update(dt, IDLE);
    A.out = 1 - m; DRIVE.seatRider(A, dt, D, 1); A.out = 0;
    if (m < 0.999) { s.pivot.position.lerpVectors(TS.set(px, gy, pz), s.pivot.position, m); s.pivot.updateMatrixWorld(true); }
  } else {
    s.update(dt, {});
    s.pivot.position.set(px, gy, pz); s.pos.gy = gy;
    s.yaw = s.aimYaw = s.moveA = ent ? wrapPi(A.yaw - Math.PI / 2) : A.yaw; s.pivot.rotation.set(0, s.yaw, 0);
  }
  if (k < 1) return;
  if (ent) { D.st = 'seat'; D.rel = null; return; }
  s.place(X.at.x, X.at.z, A.yaw, gy); s.setVisible(true);
  D.rel = null;
  if (A.st === 'stopped' || A.st === 'wreck' || T.panic) {
    abandon(A);
    if (D.hurt) { down(D, rnd(14, 30)); return; }
    goIndoors(D, true); return;
  }
  // an ordinary stop: off up the path to the house (or along the sidewalk)
  goIndoors(D, false);
}
function goIndoors(D, run = D.run) {
  const s = D.s, h = houseNear(s.pos.x, s.pos.z) || (D.A && D.A.house);
  D.run = run; D.t = 0; D.stuck = 0; D.st = D.st === 'down' ? 'down' : 'walk';
  if (h) { D.goal = { x: h.out[0], z: h.out[1], then: 'inside', house: h.H }; D.path = findPath(s.pos.x, s.pos.z, h.out[0], h.out[1]); D.pi = 0; }
  else {   // no house near: off along the sidewalk, out of sight
    const a = Math.random() * Math.PI * 2, x = s.pos.x + Math.sin(a) * 25, z = s.pos.z + Math.cos(a) * 25;
    D.goal = { x, z, then: 'inside' }; D.path = findPath(s.pos.x, s.pos.z, x, z); D.pi = 0;
  }
}
// bitten (or hurt in the crash): down on the road, and later back up as one of them
function bitten(D, u) {
  if (E.SND.npcHurt) E.SND.npcHurt(D.s.pos, D.i, D.body === 'michelle');
  if (E.fx && E.fx.blood) E.fx.blood(V3.set(D.s.pos.x, 1.3, D.s.pos.z), V4.set(0, 0.3, 1), 0.6);
  down(D, rnd(12, 26));
}
function down(D, turnIn) {
  const s = D.s;
  s.resetActs(); s.play('Death_D', { hold: true, fade: 0.15, rate: 0.9 });
  if (E.SND.bodyFall) E.SND.bodyFall(s.pos, 0.8);
  D.st = 'down'; D.downAt = T.t; D.turnAt = T.t + turnIn;
  startTurning(s, (D.i % 4) + 4 * Math.floor(Math.random() * 3)); D.looked = true;
}
function toZombie(D) {
  const s = D.s, x = s.pos.x, z = s.pos.z, yaw = s.yaw;
  const z0 = adoptZombie(s, D.i % 4);
  D.zu = z0; D.st = 'zombie';
  wake(z0, x, z, { yaw, lying: true, runner: false, state: 'idle', hp: rnd(85, 110) });
  if (z0.z) { z0.z.lying = false; z0.z.down = rnd(0.4, 1.4); z0.z.groanT = 0; }
  if (E.noise) E.noise(s.pos, 10);
}

// ---------------------------------------------------------------- the outbreak: panic, crashes, cars left behind
export function startPanic(crashAll = false) {
  if (T.panic) return;
  T.panic = true; T.panicT = T.t;
  const quick = T.t < 6;   // (straight into the outbreak: a test, or a run carried on from a save) — it's already over
  const moving = T.list.filter(A => A.kind === 'car' && A.st === 'drive');
  const crashN = crashAll ? moving.length : moving.length >= 2 ? Math.max(1, Math.round(moving.length * 0.34)) : moving.length && Math.random() < 0.4 ? 1 : 0;
  const crashers = new Set([...moving].sort(() => Math.random() - 0.5).slice(0, crashN));
  for (const A of T.list) {
    if (A.st === 'hidden' || A.st === 'abandoned') continue;
    const D = A.D;
    if (quick) { leaveNow(A); continue; }
    if (A.kind === 'bike') { A.mode = 'panic'; A.dismountAt = T.t + rnd(0.3, 1.6); continue; }
    if (A.st === 'parked' || A.st === 'ready') {
      if (A.st === 'ready') { A.st = 'parked'; boxesOn(A); }
      if (D && D.st === 'seat') { A.st = 'stopped'; A.stopT = T.t; }
      else abandon(A);
      continue;
    }
    if (A.st === 'edgewait') { hideAgent(A); continue; }
    if (A.st === 'drive') {
      A.mode = 'panic'; A.weave = Math.random() < 0.5;
      replanEscape(A);
      if (crashers.has(A)) A.swerveAt = T.t + rnd(1.5, 4.5);
      A.hornT = T.t + rnd(0.2, 1.5);
    }
  }
  for (const D of T.ppl) if (D.st === 'walk') { D.run = true; }
}
// which road and which way a car on the move is going (null: mid-turn)
function roadPos(A) {
  const R = A.route; if (!R) return null;
  const t0 = R.TX[A.seg], z0 = R.TZ[A.seg];
  let best = null, bd = 1e9;
  for (const Rd of NET.roads) for (const d of [1, -1]) {
    const [fx, fz] = fwdOf(Rd, d); if (fx * t0 + fz * z0 < 0.7) continue;
    const across = Rd.ax === 'x' ? Math.abs(A.z - Rd.c) : Math.abs(A.x - Rd.c);
    if (across < bd) { bd = across; best = { R: Rd, d }; }
  }
  if (!best || bd > 6) return null;
  const a = best.R.ax === 'x' ? A.x : A.z, lat = best.R.ax === 'x' ? (A.z - best.R.c) * best.d : -(A.x - best.R.c) * best.d;
  return { R: best.R, d: best.d, a, lat };
}
// the kerb it was heading for is blocked: drive on and find another
function reroute(A) {
  const p = roadPos(A); if (!p) return false;
  const trip = planFrom(A, null, false, { R: p.R, d: p.d, a: p.a, lat: p.lat });
  if (!trip) return false;
  setTrip(A, trip); A.stuckT = 0;
  return true;
}
// a panicking driver: foot down, on along this road to its end (or the first thing across it)
function replanEscape(A) {
  const R = A.route; if (!R) return;
  const t0 = R.TX[A.seg], z0 = R.TZ[A.seg];
  // which road and which way: the one we're on (or turning onto)
  let best = null, bd = 1e9;
  for (const Rd of NET.roads) for (const d of [1, -1]) {
    const [fx, fz] = fwdOf(Rd, d); if (fx * t0 + fz * z0 < 0.7) continue;
    const across = Rd.ax === 'x' ? Math.abs(A.z - Rd.c) : Math.abs(A.x - Rd.c);
    if (across < bd) { bd = across; best = { Rd, d }; }
  }
  if (!best || bd > 6) return;   // mid-turn: keep the route it's on (it ends at a kerb: it stops there)
  const { Rd, d } = best, a = Rd.ax === 'x' ? A.x : A.z, end = Rd.esc[d] ?? (d > 0 ? Rd.a1 : Rd.a0);
  if ((end - a) * d < 15) { A.route.end = 'spot'; return; }
  const lat = Rd.ax === 'x' ? (A.z - Rd.c) * d : -(A.x - Rd.c) * d;
  const Rt = buildRoute(Rd, d, a, lat, Rd, d, end, Rd.lane, Rd.lane, NET.cruise * 1.1);
  Rt.end = (Rd.hi && d > 0) || (Rd.lo && d < 0) ? 'edge' : 'spot';
  Rt.stops.length = 0;
  if (A.dest) { A.dest.taken = null; A.dest = null; }
  A.route = Rt; A.s = 0; A.seg = 0; A.off = A.offT = 0; A.passing = false;
}
// it's over before it began: everyone already gone, cars left where they were (bikes dropped)
function leaveNow(A) {
  const D = A.D;
  if (D) { D.st = 'inside'; D.s.setVisible(false); }
  if (A.kind === 'bike') {
    if (A.st === 'drive') { const p = DRIVE.carToWorld(A, -0.9, 0); cp.x = p.x; cp.z = p.z; cp.gy = 0; E.world.collide(cp, 0.5); A.x = cp.x; A.z = cp.z; }
    A.down = true; A.st = 'abandoned'; A.mode = null; if (A.D) A.D.st = 'inside';
    DRIVE.adoptBike(A);
    return;
  }
  if (A.st === 'drive') {
    // pulled over (or just left in the lane, doors open, if there's no room at the kerb)
    A.v = 0;
    for (const k of [0.85, 0.5, 0]) {
      const p = DRIVE.carToWorld(A, -k, 0); let ok = true;
      for (const [lx, lz] of DRIVE.ringOf(A)) { const w = DRIVE.carToWorld({ x: p.x, z: p.z, yaw: A.yaw }, lx, lz); cp.x = w.x; cp.z = w.z; cp.gy = 0; E.world.collide(cp, 0.36, DRIVE.LIEOPT); if (Math.hypot(cp.x - w.x, cp.z - w.z) > 0.02) { ok = false; break; } }
      if (ok) { A.x = p.x; A.z = p.z; break; }
    }
    door(A, Math.random() < 0.6 ? 0.9 : 0);
    if (Math.random() < 0.5) addHaz(A, rnd(60, 240));
  }
  abandon(A);
}
function knockOff(A, dx, dz, sp) {
  if (A.kind !== 'bike' || A.st === 'abandoned' || A.st === 'hidden') return;
  const D = A.D;
  A.v = 0; A.down = true; A.st = 'abandoned'; A.mode = null;
  DRIVE.adoptBike(A);
  if (D && D.st === 'seat') {
    const p = DRIVE.carToWorld(A, 0.7, 0.4);
    D.s.place(p.x, p.z, A.yaw, E.world.groundY(p.x, p.z, 0, false)); D.rel = null; D.s.setVisible(true);
    if (D.s.acts.Hit_Knockback) D.s.play('Hit_Knockback', { fade: 0.08, rate: 1.2, hold: false });
    if (E.SND.npcHurt) E.SND.npcHurt(D.s.pos, D.i, D.body === 'michelle');
    D.st = 'stand'; D.t = 2.2; D.next = 'walk'; goIndoors(D, true); D.st = 'stand';
  }
}
// left behind: from now on it's just one of the town's cars (drive.js), keys in it
function abandon(A) {
  if (A.st === 'abandoned') return;
  if (A.kind === 'bike') { A.down = true; A.st = 'abandoned'; DRIVE.adoptBike(A); return; }
  A.st = 'abandoned'; A.v = 0; A.mode = null;
  if (A.spot) { A.spot.taken = A; }
  if (A.dest) { A.dest.taken = null; A.dest = null; }
  A.brakeLit = false; look(A, 0.016);
  if (A.D && A.D.st === 'seat') { A.D.st = 'inside'; A.D.s.setVisible(false); }
  boxesOn(A);
  const MP = E.MP;
  if (!(MP && MP.on())) DRIVE.adoptCar(A.C, { x: A.x, z: A.z, yaw: A.yaw, y: A.y, steer: A.steer, spin: A.spin }, A.live);
}
function crash(A, sp, mat) {
  if (A.crashed) return;
  A.crashed = true; A.swerve = null; A.st = 'stopped'; A.stopT = T.t; A.v = 0;
  const p = V3.set(A.x + Math.sin(A.yaw) * A.hz * 0.8, 0.7, A.z + Math.cos(A.yaw) * A.hz * 0.8);
  if (sp > 0) {
    if (E.SND.impact) { E.SND.impact(p.clone(), 'metal', Math.min(2, sp / 5)); E.SND.impact(p.clone(), mat || 'concrete', Math.min(2, sp / 6)); }
    if (E.noise) E.noise(p, 25 + sp * 3);
    if (DRIVE.dentCar) DRIVE.dentCar(A, Math.min(1, sp / 9), 0, true);
    if (E.fx && E.fx.sparks) E.fx.sparks(p, 12);
  } else if (E.SND.impact) E.SND.impact(p.clone(), 'metal', 0.4);
  addHaz(A, rnd(120, 300));
  T.smoke.push({ A, C: A.C, until: T.t + rnd(40, 90), n: 0 });
  A.hornStuck = T.t + rnd(2.5, 6); horn(A, 1, A.hornStuck - T.t);
}

// ---------------------------------------------------------------- hazard lights, smoke, the bikes in the panic
function addHaz(A, dur) { const C = A.C; if (!C) return; A.hazard = true; const H = T.haz.find(h => h.C === C); if (H) { H.until = Math.max(H.until, T.t + dur); return; } T.haz.push({ A, C, lamps: A.live && A.live.ind ? A.live.ind.slice() : (C.g.userData.lamps || []).slice(0, 1), until: T.t + dur }); }
function lampsOff(H) { for (const m of H.lamps) m.emissiveIntensity = 0; }
function flashers(dt) {
  const t = T.t, cur = DRIVE.current();
  for (let i = T.haz.length - 1; i >= 0; i--) {
    const H = T.haz[i];
    if (t > H.until || (cur && cur.C === H.C)) { lampsOff(H); if (H.A) H.A.hazard = false; T.haz.splice(i, 1); continue; }
    const on = Math.floor(t / 0.42) % 2 === 0;
    for (const m of H.lamps) m.emissiveIntensity = on ? 2.4 : 0;
  }
  for (let i = T.smoke.length - 1; i >= 0; i--) {
    const S = T.smoke[i]; if (t > S.until) { T.smoke.splice(i, 1); continue; }
    if ((S.n += dt) < 0.3) continue; S.n = 0;
    const C = S.C, L = (C.g.userData.L || 4.6) / 2 - 0.7;
    if (E.fx && E.fx.smokePuff) E.fx.smokePuff(V3.set(C.x + Math.sin(C.yaw) * L, 0.95, C.z + Math.cos(C.yaw) * L), 1, 0.7, 0.32);
  }
  // cyclists in the panic: brake, jump off, run
  for (const A of T.list) {
    if (A.kind !== 'bike' || A.mode !== 'panic' || A.st !== 'drive') continue;
    if (T.t < A.dismountAt) continue;
    A.v = Math.max(0, A.v - 6 * dt); look(A, dt);
    if (A.v < 1) {
      const D = A.D;
      A.down = true; A.st = 'abandoned'; A.mode = null; DRIVE.adoptBike(A);
      if (D) { const p = exitSpot(A); D.s.place(p.x, p.z, A.yaw, E.world.groundY(p.x, p.z, 0, false)); D.s.setVisible(true); D.rel = null; D.st = 'walk'; goIndoors(D, true); }
    }
  }
}

// ---------------------------------------------------------------- sounds: engines going by, horns, the bell, starting up
let AC = null, OUT = null, ENG = null;
function audio() {
  if (AC) return AC;
  const raw = E.SND && E.SND.raw && E.SND.raw(); if (!raw || !raw.ctx) return null;
  AC = raw.ctx; OUT = raw.out; return AC;
}
function panner(x, z, y = 0.8) { const p = AC.createPanner(); p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = 4; p.rolloffFactor = 1.2; p.maxDistance = 300; if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z); p.connect(OUT); return p; }
function horn(A, loud = 0.6, len = 0.35) {
  if (!audio() || AC.state !== 'running') return;
  const t = AC.currentTime + 0.01, pn = panner(A.x, A.z, 1), e = AC.createGain(), lp = AC.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 1800;
  const g = 0.09 * loud;
  e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(g, t + 0.015);
  if (len > 0.6) e.gain.setValueAtTime(g, t + len - 0.05); else { e.gain.setValueAtTime(g, t + len * 0.4); e.gain.linearRampToValueAtTime(0, t + len * 0.45); e.gain.linearRampToValueAtTime(g, t + len * 0.6); }
  e.gain.linearRampToValueAtTime(0, t + len + 0.03);
  lp.connect(e).connect(pn);
  for (const f of [392, 494]) { const o = AC.createOscillator(); o.type = 'square'; o.frequency.value = f * (A.i % 3 === 0 ? 0.92 : 1); o.connect(lp); o.start(t); o.stop(t + len + 0.1); }
  A.hornNode = e;
}
function hornOff() {}
function bell(A) {
  if (!audio() || AC.state !== 'running') return;
  const t0 = AC.currentTime + 0.01, pn = panner(A.x, A.z, 1);
  for (const [dt0] of [[0], [0.16]]) for (const [f, g] of [[2350, 0.05], [3180, 0.03], [4700, 0.012]]) {
    const t = t0 + dt0, o = AC.createOscillator(), e = AC.createGain(); o.type = 'sine'; o.frequency.value = f;
    e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(g, t + 0.004); e.gain.exponentialRampToValueAtTime(0.0003, t + 0.9);
    o.connect(e).connect(pn); o.start(t); o.stop(t + 0.95);
  }
}
function startSound(A) {
  if (!audio() || AC.state !== 'running') return;
  const t = AC.currentTime + 0.05, pn = panner(A.x, A.z, 0.5);
  for (let i = 0; i < 5; i++) { const o = AC.createOscillator(), e = AC.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(130, t + i * 0.09); e.gain.setValueAtTime(0, t + i * 0.09); e.gain.linearRampToValueAtTime(0.03, t + i * 0.09 + 0.01); e.gain.exponentialRampToValueAtTime(0.0005, t + i * 0.09 + 0.07); o.connect(e).connect(pn); o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.08); }
}
// one engine voice (the nearest moving car) and one road-noise voice: enough to hear a car come up the street
function sounds(dt) {
  if (!audio() || AC.state !== 'running') return;
  if (!ENG) {
    ENG = { o1: AC.createOscillator(), o2: AC.createOscillator(), lp: AC.createBiquadFilter(), g: AC.createGain(), nb: AC.createBufferSource(), nf: AC.createBiquadFilter(), ng: AC.createGain(), pn: panner(0, 0, 0.6) };
    ENG.o1.type = 'sawtooth'; ENG.o2.type = 'triangle'; ENG.lp.type = 'lowpass'; ENG.lp.frequency.value = 500; ENG.g.gain.value = 0;
    ENG.o1.connect(ENG.lp); ENG.o2.connect(ENG.lp); ENG.lp.connect(ENG.g).connect(ENG.pn);
    const b = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    ENG.nb.buffer = b; ENG.nb.loop = true; ENG.nf.type = 'lowpass'; ENG.nf.frequency.value = 600; ENG.ng.gain.value = 0;
    ENG.nb.connect(ENG.nf).connect(ENG.ng).connect(ENG.pn);
    ENG.o1.start(); ENG.o2.start(); ENG.nb.start();
  }
  const cam = E.camera;
  let best = null, bd = 50;
  for (const A of T.list) { if (A.kind !== 'car' || (A.st !== 'drive' && A.st !== 'ready' && A.st !== 'stopped')) continue; if (A.st === 'stopped' && !A.crashed) continue; const d = Math.hypot(A.x - cam.position.x, A.z - cam.position.z); if (d < bd) { bd = d; best = A; } }
  const t = AC.currentTime;
  if (!best || E.G.state === 'pause') { ENG.g.gain.setTargetAtTime(0, t, 0.2); ENG.ng.gain.setTargetAtTime(0, t, 0.2); return; }
  const P = ENG.pn; if (P.positionX) { P.positionX.setTargetAtTime(best.x, t, 0.05); P.positionZ.setTargetAtTime(best.z, t, 0.05); } else P.setPosition(best.x, 0.6, best.z);
  const sp = Math.abs(best.v), gears = [0, 4.5, 8.5, 12.5, 99]; let gi = 0; while (sp > gears[gi + 1]) gi++;
  const k = gi === 3 ? sp / 16 : (sp - gears[gi]) / (gears[gi + 1] - gears[gi]);
  const rpm = best.st === 'stopped' ? 0 : 800 + clamp(k, 0, 1.2) * 2600 * (sp > 0.3 ? 1 : 0) + Math.max(0, best.accel || 0) * 150;
  const f = rpm / 30;
  ENG.o1.frequency.setTargetAtTime(Math.max(20, f), t, 0.05); ENG.o2.frequency.setTargetAtTime(Math.max(10, f * 0.5), t, 0.05);
  ENG.lp.frequency.setTargetAtTime(200 + f * 3, t, 0.08);
  ENG.g.gain.setTargetAtTime(rpm ? 0.05 + Math.max(0, best.accel || 0) * 0.01 : 0, t, 0.1);
  ENG.ng.gain.setTargetAtTime(Math.min(1, sp / 14) * 0.12, t, 0.1);
}

// ---------------------------------------------------------------- tests / debugging
function dump() {
  return T.list.map(A => ({ k: A.kind, i: A.i, st: A.st, mode: A.mode || '', x: +A.x.toFixed(2), z: +A.z.toFixed(2), yaw: +A.yaw.toFixed(2), v: +A.v.toFixed(2), off: +(A.off || 0).toFixed(2), s: +(A.s || 0).toFixed(1), len: A.route ? +A.route.len.toFixed(1) : 0, d: A.D ? A.D.st : '-', wait: +(A.wait || 0).toFixed(1), stuck: +(A.stuckT || 0).toFixed(1), dbg: A.dbg || '' }));
}
