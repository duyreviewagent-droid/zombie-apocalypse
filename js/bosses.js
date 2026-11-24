// Zombie_Apocalypse — the special dead: MINI BOSSES, BOSSES and THE ZOMBIE.
//  - zombies.js wake() rolls them (8% a mini boss, 3% a boss; outdoors, after the outbreak) and gives them their size,
//    speed, strength and voice (BOSS_TYPES). Everything is x that difficulty's ordinary zombie.
//  - here: what happens when they die (a mini boss lets 5 of the dead out, a boss 3 mini bosses), The Zombie (an 8%
//    roll whenever a mini boss is rolled; one alive at a time), its earthquakes, its own route round the houses, being
//    knocked off your feet, the boss health bar, the stats, and the test hooks (?boss=mini|boss|giant, ZA.spawnBoss).
// Nothing here costs anything while none of them are about (update() returns at once).
import * as THREE from 'three';
import { C, emit } from './state.js';
import { Z, wake, sleep, knockDown, zombieHurt, BOSSH, BOSS_TYPES } from './zombies.js';
import * as SND from './audio.js';
import { clamp } from './soldier.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rnd = (a, b) => a + Math.random() * (b - a);
const GIANT_CHANCE = 0.08;   // the user's rule: when a mini boss spawns (its own 8% roll), 8% that The Zombie comes too
let X = null;                // main.js: { G, getP, fx, world (getter), bigText, think, PEOPLE, STATS, MP, DRIVE, later, Q, mobile }
const live = new Set();      // the special ones that are up and about (or just died)
let pendingGiant = null, testBoss = null, bar = null, barU = null, kd = null, kdFree = 0;
const W = () => X.world();

// ---------------------------------------------------------------- wiring
export function init(ctx) {
  X = ctx;
  BOSSH.allow = () => X.G.phase === 'outbreak' && !(X.MP && X.MP.isClient && X.MP.isClient()) && !(X.Q && X.Q.has('noboss'));   // (?noboss=1: tests)
  BOSSH.rolled = (u, rolled) => {
    live.add(u);
    // The Zombie: 8% whenever a mini boss rolls (not the ones out of a dead boss), one alive at a time, outbreak only
    if (rolled && u.bossT === 'mini' && !giantUp() && !pendingGiant && X.G.phase === 'outbreak' && Math.random() < GIANT_CHANCE) pendingGiant = { at: C.t + rnd(3, 6), near: u };
  };
  BOSSH.think = giantThink;
  BOSSH.heavyHit = heavyHit;
  BOSSH.step = bossStep;
  const t = X.Q && X.Q.get('boss'); if (t && BOSS_TYPES[t]) testBoss = { type: t, at: null };
  if (window.ZA) Object.assign(window.ZA, { spawnBoss, BOSS: { live, quake, pending: () => pendingGiant, clearPending: () => { pendingGiant = null; }, grid: () => grid, path: gridPath, knockPlayer, stats: () => [...live].map(u => ({ type: u.bossT, hp: Math.round(u.hp), maxHp: Math.round(u.maxHp), size: +u.s.root.scale.x.toFixed(2), sizeK: +u.sizeK.toFixed(2), walk: +u.walkSpeed.toFixed(2), run: +u.runSpeed.toFixed(2), runner: u.runner, dmgK: u.dmgK, alive: u.alive, x: +u.s.pos.x.toFixed(1), z: +u.s.pos.z.toFixed(1) })) } });
}
const giantUp = () => { for (const u of live) if (u.giant && u.alive && u.active) return u; return null; };

// a free body from the pool (or the farthest idle one, put back to sleep for it)
function body(P) {
  let u = Z.pool.find(q => !q.active && !q.dale);
  if (u) return u;
  let far = null, fd = 30;
  for (const q of Z.list) { if (!q.alive || q.dale || q.bossT || q.z.state === 'chase') continue; const d = q.s.pos.distanceTo(P.s.pos); if (d > fd) { fd = d; far = q; } }
  if (far) { sleep(far); return far; }
  return null;
}
function chase(u, P) { const Zb = u.z; Zb.state = 'chase'; Zb.tgt = P; Zb.seen = C.t; Zb.lastSeen.copy(P.s.pos); Zb.path = null; }

// tests: put one in front of you (x, z optional)
export function spawnBoss(type = 'mini', x, z) {
  const P = X.getP(); if (!P || !BOSS_TYPES[type]) return null;
  if (type === 'giant' && giantUp()) return giantUp();
  if (x == null) {
    const yaw = P.s.yaw, d = { mini: 6, boss: 9, giant: 32 }[type];
    x = P.s.pos.x + Math.sin(yaw) * d; z = P.s.pos.z + Math.cos(yaw) * d;
    if (type === 'giant') { const f = freeNear(x, z, 8); if (f) [x, z] = f; }
  }
  const u = body(P); if (!u) return null;
  wake(u, x, z, { boss: type, force: true, state: 'chase', yaw: Math.atan2(P.s.pos.x - x, P.s.pos.z - z) });
  chase(u, P);
  if (type === 'giant') announce(u);
  return u;
}

// ---------------------------------------------------------------- every frame
export function update(dt) {
  if (!X) return;
  const G = X.G, P = X.getP();
  if (kd) knockTick(P, dt);
  if (testBoss && G.state === 'play' && P && P.alive) { testBoss.at ??= C.t + 1.2; if (C.t >= testBoss.at) { spawnBoss(testBoss.type); testBoss = null; } }
  if (pendingGiant && C.t >= pendingGiant.at) { const pg = pendingGiant; pendingGiant = null; if (!giantUp() && G.phase === 'outbreak' && P && P.alive) spawnGiant(P, pg.near); }
  if (!live.size) { if (barU) showBar(null); return; }
  let best = null, bd = 1e9;
  for (const u of live) {
    if (!u.active || !u.bossT) { live.delete(u); continue; }
    if (!u.alive) { if (!u.bossDone) { u.bossDone = true; died(u, P); } if (u.deadT > 3 || !u.giant) live.delete(u); continue; }
    if (u.heavy && u.s.fly) u.s.fly = null;
    if (u.bossT === 'mini' || !P) continue;
    // the bar: the boss or The Zombie that's near, or after you
    const d = u.s.pos.distanceTo(P.s.pos), on = d < (u.giant ? 140 : 40) || (u.z.state === 'chase' && u.z.tgt === P && d < 80);
    const score = (u.giant ? -1000 : 0) + d;
    if (on && score < bd) { bd = score; best = u; }
  }
  showBar(['play', 'bag', 'note', 'phone'].includes(G.state) && P && P.alive ? best : null);
}

// ---------------------------------------------------------------- dying: what comes out of them
function died(u, P) {
  const by = u.lastHitBy, mine = by && by.isPlayer;
  if (mine && X.STATS) X.STATS.event(u.giant ? 'theZombie' : u.bossT === 'boss' ? 'bosses' : 'miniBosses');
  if (u.bossT === 'mini') X.later(() => kids(u, 5, null, P), 0.9);
  else if (u.bossT === 'boss') X.later(() => kids(u, 3, 'mini', P), 1.3);
  else if (u.giant) {
    // 18 metres of it coming down: the last earthquake
    X.later(() => { const h = V(); (u.s.B.Spine2 || u.s.B.Hips).getWorldPosition(h); h.y = 0; quake(u, h, 2.2); }, 1.2);
    X.later(() => { if (X.G.state === 'play') X.bigText('THE ZOMBIE IS DOWN', mine ? 'you did it' : 'it\'s over', 4); }, 2.2);
  }
}
// they come out of the body (clawing out of it, getting up off the ground next to it) — never on the far side of a wall
function kids(u, n, type, P) {
  if (!P || !u.active) return;
  const Wd = W(), c = V(); (u.s.B.Hips || u.s.B.Spine1).getWorldPosition(c); c.y = 0;
  if (!Wd.walkable(c.x, c.z)) c.set(u.s.pos.x, 0, u.s.pos.z);
  const R = BOSS_TYPES[type] ? BOSS_TYPES[type].room : 0.3, spots = [], a0 = V(c.x, 0.5, c.z), b0 = V();
  for (let k = 0; k < n; k++) {
    let got = null;
    for (let t = 0; t < 30 && !got; t++) {
      const a = Math.random() * Math.PI * 2, r = rnd(0.3, 0.9 + t * 0.08) * (u.sizeK > 1.5 ? 1.2 : 1), x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      if (!Wd.walkable(x, z) || spots.some(s => Math.hypot(s[0] - x, s[1] - z) < 0.7)) continue;
      if (R > 0.3 && !roomFor(x, z, R)) continue;
      if (!Wd.los(a0, b0.set(x, 0.5, z))) continue;
      got = [x, z];
    }
    if (!got) got = [c.x + rnd(-0.2, 0.2), c.z + rnd(-0.2, 0.2)];   // (at worst out of the body itself)
    spots.push(got);
  }
  spots.forEach(([x, z], i) => {
    const q = body(P); if (!q) return;
    wake(q, x, z, { boss: type, force: !!type, state: 'chase', yaw: Math.random() * 6.28 });
    // on the ground, then up — one after the other
    q.s.play('Death_D', { hold: true, snap: true, from: 3 }); q.z.down = 0.5 + i * 0.4 + rnd(0, 0.3);
    chase(q, P); q.bossKid = true;
    if (q.bossT) live.add(q);
  });
  if (X.fx) X.fx.dust(V(c.x, 0.1, c.z), X.mobile ? 6 : 14, [0.3, 0.12, 0.1], 0.9);
  if (X.fx) X.fx.blood(V(c.x, 0.4, c.z), V(0, 1, 0), 1.6);
  SND.stomp && SND.stomp(V(c.x, 0.3, c.z));
  emit('zombieGroan', spots.length ? Z.list[Z.list.length - 1] : u, true);
}
function roomFor(x, z, r) { const Wd = W(); for (let a = 0; a < 8; a++) if (!Wd.walkable(x + Math.cos(a * 0.785) * r, z + Math.sin(a * 0.785) * r)) return false; return true; }

// ---------------------------------------------------------------- the boss bar
function showBar(u) {
  if (!bar) {
    if (!u) return;
    bar = document.createElement('div'); bar.id = 'bossBar';
    bar.innerHTML = '<b></b><div class="tr"><i class="lag"></i><i class="hp"></i></div>';
    const st = document.createElement('style');
    st.textContent = `#bossBar{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 76px);transform:translateX(-50%) translateY(-6px);width:min(560px,70vw);z-index:40;pointer-events:none;opacity:0;transition:opacity .35s,transform .35s;text-align:center;font-family:'Bebas Neue','Oswald',Impact,sans-serif;color:#f2e6d8}
#bossBar.on{opacity:1;transform:translateX(-50%)}
#bossBar b{display:block;font-weight:400;font-size:22px;letter-spacing:.22em;text-shadow:0 2px 6px #000,0 0 18px rgba(180,20,10,.55);margin-bottom:4px}
#bossBar.giant b{font-size:30px;letter-spacing:.3em;color:#ffd9c8}
#bossBar .tr{position:relative;height:11px;background:rgba(10,6,6,.72);border:1px solid rgba(255,220,200,.28);box-shadow:0 2px 10px rgba(0,0,0,.6);overflow:hidden}
#bossBar .tr i{position:absolute;left:0;top:0;bottom:0;width:100%;transform-origin:left;display:block}
#bossBar .lag{background:#f0d8b0;opacity:.55;transition:transform .9s .25s}
#bossBar .hp{background:linear-gradient(#e0321c,#8c120a);transition:transform .12s}
@media (max-width:620px),(max-height:520px){#bossBar{top:calc(env(safe-area-inset-top,0px) + 58px)}#bossBar b{font-size:17px}#bossBar.giant b{font-size:22px}#bossBar .tr{height:8px}}`;
    document.head.appendChild(st); document.body.appendChild(bar);
  }
  const bigEl = document.getElementById('big'), hide = !!(bigEl && +bigEl.style.opacity > 0.05);   // (out of the way of a big announcement)
  if (bar._hide !== hide) { bar._hide = hide; bar.style.visibility = hide ? 'hidden' : ''; }
  if (u !== barU) {
    barU = u; bar.classList.toggle('on', !!u);
    if (u) { bar.classList.toggle('giant', !!u.giant); bar.querySelector('b').textContent = BOSS_TYPES[u.bossT].name; }
  }
  if (u) {
    const k = clamp(u.hp / u.maxHp, 0, 1).toFixed(3);
    if (bar._k !== k) { bar._k = k; bar.querySelector('.hp').style.transform = bar.querySelector('.lag').style.transform = `scaleX(${k})`; }
  }
}

// ---------------------------------------------------------------- THE ZOMBIE: where it comes in, its route, its mind
// a spot it can stand in: out in the open, well away from you, out of your sight if there is one
function spawnGiant(P, near) {
  buildGrid();
  const cam = X.camera, fwd = V(); if (cam) cam.getWorldDirection(fwd);
  let spot = null;
  for (let pass = 0; pass < 3 && !spot; pass++) for (let t = 0; t < 50 && !spot; t++) {
    const a = Math.random() * Math.PI * 2, r = pass === 2 ? rnd(25, 90) : rnd(45, 72);
    const x = P.s.pos.x + Math.cos(a) * r, z = P.s.pos.z + Math.sin(a) * r, B = W().bounds;
    if (x < B.x0 + 4 || x > B.x1 - 4 || z < B.z0 + 4 || z > B.z1 - 4) continue;
    if (!cellFree(x, z, 1) || !W().walkable(x, z)) continue;
    if (pass === 0 && cam) { const tx = x - cam.position.x, tz = z - cam.position.z; if ((tx * fwd.x + tz * fwd.z) / (Math.hypot(tx, tz) || 1) > 0.2) continue; }
    if (!gridPath(x, z, P.s.pos.x, P.s.pos.z)) continue;   // it has to be able to get to you
    spot = [x, z];
  }
  if (!spot) { pendingGiant = { at: C.t + 20, near }; return null; }   // (try again in a while)
  const u = body(P); if (!u) return null;
  wake(u, spot[0], spot[1], { boss: 'giant', state: 'chase', yaw: Math.atan2(P.s.pos.x - spot[0], P.s.pos.z - spot[1]) });
  live.add(u); chase(u, P); announce(u);
  return u;
}
function announce(u) {
  const P = X.getP();
  X.bigText('THE ZOMBIE', 'something enormous is coming · the ground is shaking', 5);
  // a roar from its direction (brought close enough to hear) and the ground starting to tremble
  const d = V(u.s.pos.x - P.s.pos.x, 0, u.s.pos.z - P.s.pos.z); const L = d.length() || 1;
  const rp = V(P.s.pos.x + d.x / L * 14, 2, P.s.pos.z + d.z / L * 14);
  SND.zombie('scream', rp, 0.42); X.later(() => SND.zombie('growl', rp, 0.36), 1.4);
  rumble(1.2, 20); C.shake = Math.max(C.shake, 0.45);
  SND.sting && SND.sting('spotted');
  X.later(() => X.think(['What... what IS that?', 'Oh my God. It\'s HUGE.', 'The ground... something\'s coming.'][Math.floor(Math.random() * 3)], 4), 2.5);
}

// its own map of the town at 2 m: only buildings and walls stop it (it steps over fences, cars, hedges)
let grid = null;
const GC = 2, GM = 1.7;   // cell, and how far its legs keep from a wall
const tall = b => !b.off && b.y0 < 1.2 && b.y1 - Math.max(0, b.y0) > 2.3 && Math.max(b.hx, b.hz) > 0.7 && !b.noWalk && !b.window;
function buildGrid() {
  const Wd = W(); if (grid && grid.w === Wd && grid.n === Wd.boxes.length && C.t - grid.t < 30) return grid;
  const B = Wd.bounds, nx = Math.ceil((B.x1 - B.x0) / GC) + 1, nz = Math.ceil((B.z1 - B.z0) / GC) + 1, bl = new Uint8Array(nx * nz);
  for (const b of Wd.boxes) {
    if (!tall(b)) continue;
    const ext = b.r + GM, i0 = Math.max(0, Math.floor((b.x - ext - B.x0) / GC)), i1 = Math.min(nx - 1, Math.ceil((b.x + ext - B.x0) / GC)), j0 = Math.max(0, Math.floor((b.z - ext - B.z0) / GC)), j1 = Math.min(nz - 1, Math.ceil((b.z + ext - B.z0) / GC));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const dx = B.x0 + i * GC - b.x, dz = B.z0 + j * GC - b.z, lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
      if (Math.hypot(Math.max(0, Math.abs(lx) - b.hx), Math.max(0, Math.abs(lz) - b.hz)) < GM) bl[j * nx + i] = 1;
    }
  }
  // the edge of the map
  for (let i = 0; i < nx; i++) { bl[i] = 1; bl[(nz - 1) * nx + i] = 1; } for (let j = 0; j < nz; j++) { bl[j * nx] = 1; bl[j * nx + nx - 1] = 1; }
  grid = { w: Wd, n: Wd.boxes.length, t: C.t, nx, nz, x0: B.x0, z0: B.z0, bl };
  return grid;
}
const cellOf = (x, z) => [clamp(Math.round((x - grid.x0) / GC), 0, grid.nx - 1), clamp(Math.round((z - grid.z0) / GC), 0, grid.nz - 1)];
function cellFree(x, z, r = 0) { buildGrid(); const [i, j] = cellOf(x, z); for (let b = -r; b <= r; b++) for (let a = -r; a <= r; a++) { const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= grid.nx || jj >= grid.nz || grid.bl[jj * grid.nx + ii]) return false; } return true; }
function freeNear(x, z, R = 6) {
  buildGrid(); const [i0, j0] = cellOf(x, z);
  for (let r = 0; r <= R; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
    const i = i0 + di, j = j0 + dj; if (i < 0 || j < 0 || i >= grid.nx || j >= grid.nz || grid.bl[j * grid.nx + i]) continue;
    return [grid.x0 + i * GC, grid.z0 + j * GC];
  }
  return null;
}
// A* over the 2 m cells (8 ways). Returns [[x, z], ...] or null
function gridPath(x0, z0, x1, z1) {
  buildGrid();
  const s = freeNear(x0, z0, 3), g = freeNear(x1, z1, 8); if (!s || !g) return null;
  const { nx, nz, bl } = grid, [si, sj] = cellOf(s[0], s[1]), [gi, gj] = cellOf(g[0], g[1]);
  const N = nx * nz, gs = new Float32Array(N).fill(1e9), from = new Int32Array(N).fill(-1), shut = new Uint8Array(N);
  const heap = [], push = (k, f) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const h = (i, j) => { const dx = Math.abs(i - gi), dz = Math.abs(j - gj); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
  const s0 = sj * nx + si, gk = gj * nx + gi; gs[s0] = 0; push(s0, h(si, sj));
  let n = 0;
  while (heap.length && n++ < 20000) {
    const [, k] = pop(); if (shut[k]) continue; shut[k] = 1;
    if (k === gk) break;
    const i = k % nx, j = (k / nx) | 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue; const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
      const kk = b * nx + a; if (bl[kk] || shut[kk]) continue;
      if (di && dj && (bl[j * nx + a] || bl[b * nx + i])) continue;   // no cutting corners
      const ng = gs[k] + (di && dj ? 1.414 : 1);
      if (ng < gs[kk]) { gs[kk] = ng; from[kk] = k; push(kk, ng + h(a, b)); }
    }
  }
  if (from[gk] < 0 && gk !== s0) return null;
  const out = []; for (let k = gk; k >= 0 && k !== s0; k = from[k]) out.push([grid.x0 + (k % nx) * GC, grid.z0 + ((k / nx) | 0) * GC]);
  out.reverse(); out.push([x1, z1]);
  return out;
}
// main.js calls this for The Zombie instead of the ordinary push-out: its legs stop only at buildings and walls
export function giantCollide(u) {
  const p = u.s.pos, Wd = W(), r = 1.3;
  for (const b of Wd.near(p.x, p.z, r + 0.5)) {
    if (!tall(b)) continue;
    const dx = p.x - b.x, dz = p.z - b.z; if (dx * dx + dz * dz > (b.r + r + 0.2) ** 2) continue;
    const lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c, qx = clamp(lx, -b.hx, b.hx), qz = clamp(lz, -b.hz, b.hz), ex = lx - qx, ez = lz - qz, d2 = ex * ex + ez * ez;
    if (d2 >= r * r) continue;
    let nx, nz, pen;
    if (d2 > 1e-8) { const d = Math.sqrt(d2); nx = ex / d; nz = ez / d; pen = r - d; }
    else { const px = b.hx - Math.abs(lx), pz = b.hz - Math.abs(lz); if (px < pz) { nx = Math.sign(lx) || 1; nz = 0; pen = px + r; } else { nx = 0; nz = Math.sign(lz) || 1; pen = pz + r; } }
    p.x += (nx * b.c + nz * b.s) * pen; p.z += (-nx * b.s + nz * b.c) * pen;
  }
  const B = Wd.bounds; p.x = clamp(p.x, B.x0 + 2, B.x1 - 2); p.z = clamp(p.z, B.z0 + 2, B.z1 - 2);
}
function giantThink(u, dt, P, G) {
  const Zb = u.z, S = u.s, cmd = { move: null, speed: 0, face: null };
  S.noLod = true;
  const T = P && P.alive ? P : null;
  if (!T || C.calm) { Zb.reach = 0; return cmd; }
  Zb.state = 'chase'; Zb.tgt = T; Zb.seen = C.t; Zb.lastSeen.copy(T.s.pos);   // it always knows where you are
  const pd = Math.hypot(T.s.pos.x - S.pos.x, T.s.pos.z - S.pos.z);
  Zb.reach = pd < 16 ? clamp(1 - (pd - 4) / 12, 0, 1) * 0.7 : 0;
  if (!Zb.gp || C.t > Zb.gpAt || (Zb.gpGoal && Math.hypot(Zb.gpGoal.x - T.s.pos.x, Zb.gpGoal.z - T.s.pos.z) > 6)) {
    Zb.gp = gridPath(S.pos.x, S.pos.z, T.s.pos.x, T.s.pos.z); Zb.gpI = 0; Zb.gpAt = C.t + rnd(1.5, 2.2); Zb.gpGoal = { x: T.s.pos.x, z: T.s.pos.z };
  }
  let dir = Math.atan2(T.s.pos.x - S.pos.x, T.s.pos.z - S.pos.z);
  const p = Zb.gp;
  if (p && p.length) {
    while (Zb.gpI < p.length - 1 && Math.hypot(p[Zb.gpI][0] - S.pos.x, p[Zb.gpI][1] - S.pos.z) < 2.6) Zb.gpI++;
    dir = Math.atan2(p[Zb.gpI][0] - S.pos.x, p[Zb.gpI][1] - S.pos.z);
  }
  if (pd > 3.8 && !Zb.stomp) { cmd.move = dir; cmd.speed = u.walkSpeed; }
  cmd.face = pd < 14 ? Math.atan2(T.s.pos.x - S.pos.x, T.s.pos.z - S.pos.z) : dir;
  // the stomp: its arms come down and its foot with them
  Zb.atkT -= dt;
  if (pd < u.atkR && Zb.atkT <= 0 && !S.up) {
    const rate = u.atkRate;
    S.playUp('Zombie_Scratch', { rate, fade: 0.2, fadeAt: 1.3 / rate, fadeOut: 0.4 });
    Zb.stomp = { t: 0, at: (Z.swings?.Zombie_Scratch?.hit || 0.6) / rate };
    Zb.atkT = rnd(3.2, 4.6); emit('zombieGrowl', u);
  }
  if (Zb.stomp) {
    Zb.stomp.t += dt;
    if (Zb.stomp.t >= Zb.stomp.at) {
      Zb.stomp = null;
      const fp = V(S.pos.x + Math.sin(S.yaw) * 2.2, 0, S.pos.z + Math.cos(S.yaw) * 2.2);
      quake(u, fp, 1.6);
      const td = Math.hypot(T.s.pos.x - fp.x, T.s.pos.z - fp.z);
      if (td < 4.8 && W().los(V(fp.x, 1, fp.z), V(T.s.pos.x, 1, T.s.pos.z))) { if (T === X.getP()) { if (!G.vaulting) { emit('zombieClaw', u); heavyHit(u, T); } } else emit('zombieClaw', u); }
    }
  }
  Zb.groanT -= dt;
  if (Zb.groanT <= 0) { Zb.groanT = rnd(6, 13); emit('zombieGroan', u, true); }
  return cmd;
}

// ---------------------------------------------------------------- footsteps and earthquakes
const fA = V(), fB = V();
function bossStep(u, e) {
  if (!u.alive || e.jump || e.land || e.body) return;
  const P = X.getP(); if (!P) return;
  if (u.giant) {
    const B = u.s.B; let p = u.s.pos;
    if (B.LeftFoot && B.RightFoot) { B.LeftFoot.getWorldPosition(fA); B.RightFoot.getWorldPosition(fB); p = fA.y < fB.y ? fA : fB; }
    quake(u, V(p.x, 0, p.z), 1);
  } else if (u.bossT === 'boss') {   // a boss's tread: you feel it close by
    const d = u.s.pos.distanceTo(P.s.pos);
    if (d < 12) C.shake = Math.max(C.shake, 0.18 * (1 - d / 12));
  }
}
// The Zombie's foot comes down: the camera shakes (less the farther you are), the ground rumbles, dust goes up, the
// loose things nearby rattle (and the ones under its foot are crushed), people and the dead nearby stumble, and you
// go down if you're right there.
export function quake(u, p, power = 1) {
  const P = X.getP(), G = X.G, Wd = W(); if (!P) return;
  const d = Math.hypot(P.s.pos.x - p.x, P.s.pos.z - p.z);
  if (G.state === 'play' || G.state === 'bag' || G.state === 'phone') C.shake = Math.max(C.shake, Math.min(1, power * 0.95 * clamp(1 - d / 85, 0, 1)));
  rumble(power, d);
  if (X.fx && d < 90) {
    const n = X.mobile ? 4 : 10;
    for (let i = 0; i < n; i++) { const a = i / n * 6.28 + Math.random(), r = rnd(0.8, 2.8) * power; X.fx.dust(V(p.x + Math.cos(a) * r, 0.05, p.z + Math.sin(a) * r), 2, [0.34, 0.3, 0.25], 1.6 * power); }
  }
  if (Wd.blastBreak) Wd.blastBreak(V(p.x, 0.3, p.z), 4 * power);   // whatever's under its foot is flattened
  if (Wd.breakables && Wd.hitBreakable) { let n = 0; for (const it of Wd.breakables) { if (it.broken || n > 10) continue; const dd = Math.hypot(it.x - p.x, it.z - p.z); if (dd > 4 && dd < 13 * power && Math.random() < 0.5) { n++; Wd.hitBreakable(V(it.x, (it.cy || 0.5), it.z), V(it.x - p.x, 0, it.z - p.z), 0.04, 'fists'); } } }
  // the dead around it lose their feet
  for (const z of Z.list) {
    if (z === u || !z.alive || z.heavy) continue;
    const dd = Math.hypot(z.s.pos.x - p.x, z.s.pos.z - p.z); if (dd > 14 * power) continue;
    const dir = V(z.s.pos.x - p.x, 0, z.s.pos.z - p.z).normalize();
    if (dd < 5 * power) knockDown(z, dir); else if (Math.random() < 0.7 * (1 - dd / (14 * power))) zombieHurt(z, 0, null, { knock: 0.5, dir });
  }
  if (C.npcs && X.PEOPLE && X.PEOPLE.shoveNPC) for (const n of C.npcs) {
    if (!n.alive || n.gone || n.hidden) continue;
    const dd = Math.hypot(n.s.pos.x - p.x, n.s.pos.z - p.z); if (dd > 12 * power || Math.random() > 1 - dd / (12 * power)) continue;
    X.PEOPLE.shoveNPC(n, V(n.s.pos.x - p.x, 0, n.s.pos.z - p.z).normalize(), P, true);
  }
  // you: right next to it you're thrown off your feet; a bit farther you stagger
  if (P.alive && !C.godMode) {
    const dir = V(P.s.pos.x - p.x, 0, P.s.pos.z - p.z); if (dir.lengthSq() < 1e-4) dir.set(1, 0, 0); dir.normalize();
    if (d < 6.5 * power) knockPlayer(dir);
    else if (d < 15 * power && !(X.DRIVE && X.DRIVE.active())) P.s.vel.addScaledVector(dir, 1.2 * (1 - d / (15 * power)));
  }
}
// a boss's blow (or The Zombie's foot) lands on somebody: they're knocked down
function heavyHit(u, T) {
  const dir = V(T.s.pos.x - u.s.pos.x, 0, T.s.pos.z - u.s.pos.z); if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1); dir.normalize();
  if (T === X.getP()) { knockPlayer(dir); C.shake = Math.max(C.shake, 0.6); }
  else if (T.npc && X.PEOPLE && X.PEOPLE.shoveNPC) X.PEOPLE.shoveNPC(T, dir, X.getP(), true);
}
// you go down: thrown back off your feet, a moment on the ground, then up again
export function knockPlayer(dir) {
  const P = X.getP(), G = X.G, S = P && P.s;
  if (!S || !P.alive || C.godMode || G.vault || G.vaulting || G.grabbedBy || (X.DRIVE && X.DRIVE.active()) || kd || C.t < kdFree || S.act || !S.acts.Hit_Knockback) return false;   // (a moment on your feet before it can happen again)
  S.yaw = Math.atan2(-dir.x, -dir.z);   // facing it: the blow throws you over backwards
  S.play('Hit_Knockback', { fade: 0.08, rate: 1.15, hold: true });
  S.vel.set(dir.x * 2.5, 0, dir.z * 2.5);
  kd = { t: 0, up: rnd(1.3, 1.8) };
  C.shake = Math.max(C.shake, 0.55);
  SND.bodyFall && SND.bodyFall(S.pos.clone(), 0.9, 0.35);
  SND.hurtPlayer && SND.hurtPlayer(0.6, 0, 'claw');
  G.knockedT = C.t;
  return true;
}
function knockTick(P, dt) {
  kd.t += dt;
  const S = P && P.s;
  if (!S || !P.alive) { kd = null; return; }
  if (!kd) return;
  if (kd.t >= kd.up && !kd.rising) { kd.rising = true; if (S.act === 'Hit_Knockback' || S.act === 'Death_D') S.play('LayToIdle', { fade: 0.3, rate: 1.15 }); else kd = null; }
  else if (kd.rising && S.act !== 'LayToIdle') { kd = null; kdFree = C.t + 2.5; }
  if (kd && kd.t > 6) { kd = null; if (S.act) S.stopAct(0.3); }
}
// a deep rumble you feel more than hear (its own Web Audio voice, on the sound-effects bus)
let brown = null;
function rumble(power, d) {
  const R = SND.raw && SND.raw(); if (!R) return;
  const { ctx, out } = R, g = Math.min(1.2, power) * clamp(1.15 - d / 100, 0.06, 1) * 0.9;
  if (g < 0.02) return;
  if (!brown) { const n = ctx.sampleRate * 2; brown = ctx.createBuffer(1, n, ctx.sampleRate); const a = brown.getChannelData(0); let l = 0; for (let i = 0; i < n; i++) { l = (l + 0.02 * (Math.random() * 2 - 1)) / 1.02; a[i] = l * 3.5; } }
  const t = ctx.currentTime + 0.02 + d / 343, dur = 1.1 + power * 0.5;
  const s = ctx.createBufferSource(); s.buffer = brown; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 110; const e = ctx.createGain();
  e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(g, t + 0.04); e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(lp).connect(e).connect(out); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(46, t); o.frequency.exponentialRampToValueAtTime(24, t + 0.8);
  const e2 = ctx.createGain(); e2.gain.setValueAtTime(0.0001, t); e2.gain.exponentialRampToValueAtTime(g * 0.9, t + 0.02); e2.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
  o.connect(e2).connect(out); o.start(t); o.stop(t + 1);
}
