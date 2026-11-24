// Zombie_Apocalypse — SOCCER STADIUM: the evacuation. When the big screen says EVACUATE, everybody actually leaves.
// The seated fans get up (a few seconds apart, the ones nearest the aisle first), file along their row to the nearest
// aisle, go down it to the walkway in front of the stand (the front rows) or up it to the top gangway and down the end
// stairs (the back rows), out through the open corners, through the corner doors the stewards have thrown open, and
// away across the plaza / the car park to the gates — and only vanish once they're through (or out of the corner
// and out of sight). The standing crowd on the plaza and in the concourses walks off the same way. Some run, some
// trip and go down for a moment, some stop and look back at the pitch.
// Cheap on purpose: every route is worked out once (the walk out of the stand from the seat's own row and aisle; the
// rest of the way from where the stand's end opens, by the zombies' route grid, once per corner / per patch of plaza);
// each frame a fan is just a point along his route, written straight into the instanced figures' matrices with the
// stride's phase for the vertex shader (legs, arms, a bob). The few nearest you are the game's own rigged people,
// walking and running with the real captured clips, dressed in that fan's colours.
// makeEvac({ W, S, seat, up, stand, uni, LT, KINDS, routeSeat, routeStand, doors }) → { start, skip, reset, update, left }
import * as THREE from 'three';
import { Soldier } from '../soldier.js';
import * as LOOKS from '../looks.js';
import { C } from '../state.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const N_GATE = [6.7, -103.5, -116], S_GATE = [6.7, 103.5, 116];   // (x either side of the police barricade; z at the gate; z out past it)
const inside = (x, z) => z > -70.6 && z < 58.8 && Math.abs(x) < 76;   // the ground inside the corner fences

export function makeEvac(o) {
  const { W, S, seat, up, stand, uni, LT, KINDS } = o;
  const fans = [];   // { f, set, i, seated }
  seat.list.forEach((f, i) => fans.push({ f, set: up, i, seated: true }));
  stand.list.forEach((f, i) => fans.push({ f, set: stand, i, seated: false }));
  const E = { on: false, T: 0, order: [], next: 0, active: [], tails: new Map(), done: false, left: 0, budget: 0 };
  const ZM = new Float32Array(16);   // a zero matrix: not drawn
  const tmpC = new THREE.Color();

  // ---- the rest of the way from a stand's end (or a plaza spot) to the gate and out: one route per place, shared ----
  const PATHS = () => (globalThis.ZA && globalThis.ZA.PEOPLE && globalThis.ZA.PEOPLE.findPath) || null;
  function tailFrom(key, x, z, sx, via) {
    let t = E.tails.get(key); if (t) return t;
    const g = z < 0 ? N_GATE : S_GATE, gx = (sx || (x < 0 ? -1 : 1)) * g[0];
    const xyz = [[x, 0, z]];
    for (const v of via || []) { xyz.push([v[0], 0, v[1]]); x = v[0]; z = v[1]; }   // (out of a corner: through the door in its fence)
    const fp = PATHS(); let pts = null;
    try { pts = fp ? fp(x, z, gx, g[1] - Math.sign(g[1]) * 1.2) : null; } catch { pts = null; }
    E.budget--;
    if (pts && pts.length) for (const p of pts) xyz.push([p[0], 0, p[1]]);
    else xyz.push([x + Math.sign(gx - x) * 2, 0, z + Math.sign(g[1] - z) * 2]);   // (no route: a couple of steps and away)
    if (pts) xyz.push([gx, 0, g[1]], [gx, 0, g[2]]);
    t = poly(xyz); t.ok = !!pts;
    // where it leaves the ground (past the corner fences): after that a fan may go once you can't see him
    t.out = 0; for (let k = 0; k < xyz.length; k++) if (!inside(xyz[k][0], xyz[k][2])) { t.out = t.cum[k]; break; } else t.out = t.len;
    E.tails.set(key, t); return t;
  }
  // a polyline: x, y, z per point and the distance along it
  function poly(pts) {
    const n = pts.length, a = new Float32Array(n * 3), cum = new Float32Array(n);
    let L = 0;
    for (let k = 0; k < n; k++) { a[k * 3] = pts[k][0]; a[k * 3 + 1] = pts[k][1]; a[k * 3 + 2] = pts[k][2]; if (k) L += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1], pts[k][2] - pts[k - 1][2]); cum[k] = L; }
    return { a, cum, n, len: L };
  }
  // the point at s along a polyline (k: a cached segment to start the search from); writes into out
  function at(pl, s, ev, out) {
    let k = ev.k || 0; if (k >= pl.n - 1 || pl.cum[k] > s) k = 0;
    while (k < pl.n - 2 && pl.cum[k + 1] < s) k++;
    ev.k = k;
    const a = pl.a, L = pl.cum[k + 1] - pl.cum[k], t = L > 1e-4 ? Math.min(1, Math.max(0, (s - pl.cum[k]) / L)) : 1;
    const dx = a[k * 3 + 3] - a[k * 3], dz = a[k * 3 + 5] - a[k * 3 + 2];
    out.x = a[k * 3] + dx * t; out.y = a[k * 3 + 1] + (a[k * 3 + 4] - a[k * 3 + 1]) * t; out.z = a[k * 3 + 2] + dz * t;
    if (dx * dx + dz * dz > 1e-6) out.hd = Math.atan2(dx, dz);
    return out;
  }

  // ---- start: everybody's timing, speed and quirks (the routes out of the stand are cheap; the rest when they go) ----
  function start() {
    if (E.on) return; E.on = true; E.T = 0; E.done = false; E.next = 0; E.active.length = 0;
    const R = rng(777);
    for (const F of fans) {
      const f = F.f, ev = f.ev = { st: 0, k: 0, kk: 0, s: 0, ph: R() * 6.28, hd: f.yaw, yaw: f.yaw, wl: null };
      const run = R() < 0.25; ev.lat = (R() - 0.5) * (F.seated ? 1.0 : 1.4);
      ev.v = run ? 2.6 + R() * 1.3 : 1.25 + R() * 0.6; ev.run = run;
      if (F.seated) {
        const r = o.routeSeat(f, R);
        ev.head = poly(r.pts); ev.tq = r.q; ev.key = r.key; ev.sx = r.sx; ev.via = r.via;
        ev.go = 0.4 + R() * 4.6 + r.wait;   // (the ones nearest the aisle get out first)
      } else {
        const r = o.routeStand(f, R);
        ev.head = poly(r.pts); ev.tq = r.q; ev.key = r.key; ev.sx = r.sx;
        ev.go = R() * 3.2;
      }
      // a few trip and go down for a moment, a few stop and look back
      const q = R(); ev.pk = q < 0.06 ? 1 : q < 0.14 ? 2 : 0;
      ev.ps = ev.head.len * (0.3 + R() * 0.5) + (F.seated ? 0 : 4 + R() * 10); ev.pd = ev.pk === 1 ? 2.4 : 1.6 + R() * 1.6;
      if (F.seated) o.seat.extra.array[F.i] = ev.go;
    }
    o.seat.extra.needsUpdate = true;
    E.order = fans.slice().sort((a, b) => a.f.ev.go - b.f.ev.go);
    for (const im of up.parts) im.visible = true;
    for (const im of stand.parts) im.frustumCulled = false;
    for (const d of o.doors || []) if (W.setDoor) W.setDoor(d, true);   // (the stewards have the corner doors open)
    E.left = fans.length;
  }
  // a save loaded after the evacuation: they're long gone
  function skip() {
    start();
    for (const F of fans) { F.f.left = true; F.f.ev.st = 3; if (F.f.box) F.f.box.off = true; }
    uni.eT.value = 1e7; zeroAll(up); zeroAll(stand); for (const im of up.parts) im.visible = false;
    E.next = E.order.length; E.active.length = 0; E.done = true; E.left = 0; S.evacDone = true;
    for (const w of POOL) free(w);
  }
  function zeroAll(set) { set.mat.array.fill(0); set.mat.needsUpdate = true; set.extra.array.fill(0); set.extra.needsUpdate = true; }
  function reset() {
    E.on = false; E.done = false; E.T = 0; uni.eT.value = -1; S.evacDone = false;
    o.seat.extra.array.fill(1e6); o.seat.extra.needsUpdate = true;
    zeroAll(up); for (const im of up.parts) im.visible = false;
    for (const F of fans) { F.f.left = false; F.f.ev = null; if (F.f.box) F.f.box.off = false; }
    stand.list.forEach((f, i) => { if (!f.near) writeM(stand, i, f.x, f.y, f.z, f.yaw, 0, f.s); });
    stand.extra.array.fill(0); stand.extra.needsUpdate = true; stand.mat.needsUpdate = true;
    for (const w of POOL) free(w);
    for (const d of o.doors || []) if (W.setDoor) W.setDoor(d, false);
  }
  // a matrix straight into the instance array: turned to yaw, tipped forward by pitch, scaled by sc
  function writeM(set, i, x, y, z, yaw, pitch, sc) {
    const e = set.mat.array, j = i * 16, c = Math.cos(yaw) * sc, s = Math.sin(yaw) * sc, cp = Math.cos(pitch), sp = Math.sin(pitch);
    e[j] = c; e[j + 1] = 0; e[j + 2] = -s; e[j + 3] = 0;
    e[j + 4] = s * sp; e[j + 5] = cp * sc; e[j + 6] = c * sp; e[j + 7] = 0;
    e[j + 8] = s * cp; e[j + 9] = -sp * sc; e[j + 10] = c * cp; e[j + 11] = 0;
    e[j + 12] = x; e[j + 13] = y; e[j + 14] = z; e[j + 15] = 1;
  }
  function zeroM(set, i) { set.mat.array.set(ZM, i * 16); set.extra.array[i * 2 + 1] = 0; }

  // ---- the walkers: the nearest few are the game's own rigged people, walking with the real clips ----
  const POOL = [], POOL_N = LT > 1 ? 3 : LT ? 6 : 12, BODIES = KINDS ? ['butler', 'coach', 'michelle'].filter(k => KINDS[k]) : [];
  let poolT = 0;
  function grow() {   // one more body (built a few at a time on the calm evening, so nothing stalls at the blackout)
    if (POOL.length >= POOL_N || !BODIES.length) return;
    try {
      const k = POOL.length, body = BODIES[k % BODIES.length], s = new Soldier(KINDS[body], o.level, { clone: true });
      try { const L = LOOKS.lookFor('sdfan' + k, body); LOOKS.applyLook(s, { ...L, hat: 'none' }); } catch (e) { /* (plain body) */ }
      s.animLod = true; s.update(1 / 60, {}); s.setVisible(false);
      POOL.push({ s, e: null, act: 0 });
    } catch (e) { console.warn('stadium evac: no walker', e); POOL_N_FAIL++; }
  }
  let POOL_N_FAIL = 0;
  function free(w) { if (w.e) { w.e.ev.wl = null; w.e = null; } w.s.setVisible(false); w.act = 0; w.s.resetActs && w.s.resetActs(); }
  const hex = c => { tmpC.copy(c); return tmpC.getHex(); };
  function youTop() { const L = S.api && S.api.player && S.api.player.s && S.api.player.s.lookL; return L && LOOKS.TOPS ? LOOKS.TOPS[L.top] : null; }
  function take(w, F) {
    const f = F.f, ev = f.ev;
    w.e = f; ev.wl = w; w.act = 0; w.s.resetActs && w.s.resetActs();
    let top = hex(f.shirt); const yt = youTop();
    if (yt != null) { const d = Math.abs((top >> 16) - (yt >> 16)) + Math.abs((top >> 8 & 255) - (yt >> 8 & 255)) + Math.abs((top & 255) - (yt & 255)); if (d < 90) top = 0x4a5a6a; }   // (never your colours)
    try { LOOKS.outfit(w.s, top, hex(f.legs)); } catch { }
    w.s.place(ev.x, ev.z, ev.yaw, ev.y); w.s.setVisible(true);
  }
  const cmd = { move: null, speed: 0, aimYaw: null, face: null };
  function drive(w, dt) {
    const f = w.e, ev = f.ev, s = w.s;
    // stumble: down on the concrete and back up; look back: stand and stare at the pitch
    if (ev.pz === 1) { if (w.act === 0) { s.play('Hit_Knockback', { hold: true }); w.act = 1; } else if (w.act === 1 && ev.pt > ev.pd - 1.4) { s.play('LayToIdle'); w.act = 2; } }
    else if (w.act) { s.stopAct(0.25); w.act = 0; }
    cmd.move = ev.mv ? ev.hd : null; cmd.speed = ev.mv ? ev.v : 0; cmd.face = ev.pz === 2 ? ev.yaw : null;
    const gy = Soldier.groundY; Soldier.groundY = () => ev.y;
    s.pos.x = ev.x; s.pos.z = ev.z; s.gy = s.gyT = ev.y;
    try { s.update(dt, cmd); } finally { Soldier.groundY = gy; }
    s.pos.x = ev.x; s.pos.z = ev.z; s.pivot.position.y = ev.y + (s.liftK || 0);
  }
  const frus = new THREE.Frustum(), pm = new THREE.Matrix4(), vv = new THREE.Vector3();
  const seen = (x, y, z) => frus.containsPoint(vv.set(x, y + 1, z));

  // ---- each frame ----
  function update(dt, focus) {
    if (!E.on) { if ((poolT -= dt) <= 0 && S.phase === 'calm' && POOL.length < POOL_N && POOL_N_FAIL < 3) { poolT = 0.6; grow(); } return; }
    if (E.done) return;
    E.T += dt; uni.eT.value = E.T; E.budget = 6;
    const cam = C.camera; if (cam) { cam.updateMatrixWorld(); pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); frus.setFromProjectionMatrix(pm); }
    // who gets going now (a route's last part is worked out as its first fan sets off — a few new ones a frame at most)
    while (E.next < E.order.length && E.order[E.next].f.ev.go <= E.T) {
      const F = E.order[E.next], ev = F.f.ev;
      if (ev.tq && !E.tails.has(ev.key)) { if (E.budget <= 0) break; }
      ev.tail = ev.tq ? tailFrom(ev.key, ev.tq[0], ev.tq[1], ev.sx, ev.via) : null;
      ev.len = ev.head.len + (ev.tail ? ev.tail.len : 0);
      ev.outS = ev.tail ? ev.head.len + ev.tail.out : ev.len;
      ev.st = 1; F.f.left = true; if (F.f.box) F.f.box.off = true;
      E.active.push(F); E.next++;
    }
    const P = {};
    for (let n = E.active.length - 1; n >= 0; n--) {
      const F = E.active[n], f = F.f, ev = f.ev, set = F.set, i = F.i;
      let tt = E.T - ev.go - (F.seated ? 0.55 : 0), rise = F.seated ? smooth(-0.55, 0, tt) : 1;
      tt = Math.max(0, tt);
      // the distance gone: walking at his pace, minus a pause (a trip, a look back) somewhere along the way
      let s = tt * ev.v, pz = 0, pt = 0;
      if (ev.pk && s > ev.ps) { const pd = ev.pd * ev.v; if (s < ev.ps + pd) { pz = ev.pk; pt = (s - ev.ps) / ev.v; s = ev.ps; } else s -= pd; }
      // gone: through the gate, or out past the corner fences where you can't see him
      if (s >= ev.len || (s > ev.outS && focus && Math.hypot(ev.x - focus.x, ev.z - focus.z) > 35 && !seen(ev.x, ev.y, ev.z))) {
        ev.st = 3; zeroM(set, i); if (ev.wl) free(ev.wl); E.active.splice(n, 1); E.left--; continue;
      }
      const ds = s - ev.s; ev.s = s;
      P.hd = null;
      if (s < ev.head.len) at(ev.head, s, ev, P); else { const k0 = ev.k; ev.k = ev.kk; at(ev.tail, s - ev.head.len, ev, P); ev.kk = ev.k; ev.k = k0; }
      if (P.hd != null) ev.hd = P.hd;
      if (s >= ev.head.len && ev.lat) { const k2 = smooth(0, 2.5, s - ev.head.len); P.x += Math.cos(ev.hd) * ev.lat * k2; P.z -= Math.sin(ev.hd) * ev.lat * k2; }   // (side by side on the way out, not single file)
      ev.x = P.x; ev.y = P.y; ev.z = P.z; ev.mv = !pz && rise >= 1; ev.pz = pz; ev.pt = pt;
      // facing: round to the way he's going (or back at the pitch when he stops to look)
      const want = pz === 2 ? ev.hd + Math.PI * smooth(0, 0.5, pt) * (1 - smooth(ev.pd - 0.5, ev.pd, pt)) : ev.hd;
      ev.yaw += wrap(want - ev.yaw) * Math.min(1, dt * (rise < 1 ? 3 : 9));
      // the stride: a cycle per ~1.4 m walking, ~2.2 m running
      ev.ph += ds / (ev.run ? 2.2 : 1.4) * Math.PI * 2;
      if (ev.wl) { zeroM(set, i); continue; }
      const amp = ev.mv ? (ev.run ? 1.25 : 0.85) : 0;
      // standing up out of the seat; tipping over (a trip); a lean when running
      const trip = pz === 1 ? 1.3 * smooth(0, 0.3, pt) * (1 - smooth(ev.pd - 0.7, ev.pd - 0.1, pt)) : 0;
      const pitch = (1 - rise) * 0.5 + trip + (ev.mv ? (ev.run ? 0.14 : 0.04) : 0);
      writeM(set, i, P.x, P.y - (1 - rise) * 0.3, P.z, ev.yaw, pitch, f.s);
      set.extra.array[i * 2] = ev.ph; set.extra.array[i * 2 + 1] = amp;
    }
    up.mat.needsUpdate = true; up.extra.needsUpdate = true; stand.mat.needsUpdate = true; stand.extra.needsUpdate = true;
    // the real bodies: the nearest ones on the move (kept while they stay near, handed on when they're further)
    if ((E.wT = (E.wT || 0) - dt) <= 0 && focus && POOL.length) {
      E.wT = 0.25;
      const R1 = LT > 1 ? 11 : LT ? 15 : 22, near = [];
      for (const w of POOL) if (w.e && (w.e.ev.st !== 1 || Math.hypot(w.e.ev.x - focus.x, w.e.ev.z - focus.z, w.e.ev.y - (focus.y || 0)) > R1 + 4)) free(w);
      for (const F of E.active) { const ev = F.f.ev; if (ev.wl) continue; const d = Math.hypot(ev.x - focus.x, ev.z - focus.z, ev.y - (focus.y || 0)); if (d < R1) near.push([d, F]); }
      near.sort((a, b) => a[0] - b[0]);
      let q = 0; for (const w of POOL) { if (w.e) continue; if (q >= near.length) break; take(w, near[q++][1]); }
    }
    for (const w of POOL) if (w.e) drive(w, dt);
    if (!E.active.length && E.next >= E.order.length) { E.done = true; S.evacDone = true; for (const im of up.parts) im.visible = false; }
  }
  return { start, skip, reset, update, get left() { return E.left; }, get on() { return E.on; }, get T() { return E.T; }, E, POOL, fans };
}
