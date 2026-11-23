// Zombie_Apocalypse — BLACKWATER PRISON (map 'prison').
// A maximum-security state penitentiary on a bend of the Blackwater River. A 200 × 200 m compound inside a 6 m
// concrete wall topped with razor wire, five guard towers you can climb, and inside:
//   · A BLOCK (west) and B BLOCK (east): two-tier cell houses, 48 cells a tier, steel stairs, mesh-railed walkways,
//     an octagonal officers' "bubble" in the middle of each dayroom
//   · THE YARD: basketball court, the weight pile, bleachers, the handball wall — all behind a razor-wire fence
//   · the north row: LAUNDRY (with the pump room and the old storm sewer), the DINING HALL and kitchen,
//     the INFIRMARY (where it starts), the VOCATIONAL SHOP
//   · the SEGREGATION UNIT (solitary) between the yard and the north row
//   · ADMINISTRATION (south, two floors): lobby, visiting room, Control, and upstairs the WARDEN'S OFFICE
//   · outside: the gatehouse, staff car park, the sally-port road, the warden's helipad, the river and the sewer
//     outfall, the woods and the water tower
// Everything axis-aligned is built from merged boxes; bars and razor wire are instanced. Story: prison.story.js.
import { prisonMats, geos, frame, decal, bunk, toiletSink, messTable, hospitalBed, washer, workbench, weightBench, desk, lockers, sign, strip, rng } from './prison.kit.js';

import { ITEMS } from '../loot.js';
const hasItem = id => !!(ITEMS && ITEMS[id]);

// ---------------------------------------------------------------- the plan (world metres; y up; north = −z)
export const WALL = { x0: -100, z0: -100, x1: 100, z1: 100, h: 6, t: 0.8 };
export const BLD = {
  admin: { x: 0, z: 84, w: 44, d: 20 },
  blockA: { x: -70, z: -5, w: 28, d: 80 },
  blockB: { x: 70, z: -5, w: 28, d: 80 },
  laundry: { x: -67, z: -78, w: 30, d: 24 },
  dining: { x: -22, z: -78, w: 40, d: 24 },
  infirmary: { x: 24, z: -78, w: 32, d: 24 },
  shop: { x: 67, z: -78, w: 30, d: 24 },
  seg: { x: 0, z: -44, w: 26, d: 12 },
  gatehouse: { x: 0, z: 108, w: 10, d: 7 },
};
export const YARD = { x0: -40, z0: 4, x1: 40, z1: 62 };
export const SPOTS = {
  guardStart: { x: 0, z: 79, yaw: Math.PI },
  inmateStart: { x: 57.6, z: -9.5, yaw: Math.PI / 2 },
  control: { x: 14, z: 84 }, warden: { x: 14, z: 83.5, y: 3.8 }, radio: { x: 14.6, z: 85.8, y: 3.8 },
  infirmary: { x: 24, z: -74 }, infirmaryBed: { x: 11, z: -88.5 },
  laundry: { x: -62, z: -76 }, sewerGrate: { x: -80.4, z: -80 }, kitchen: { x: -22, z: -86 },
  yard: { x: 0, z: 30 }, tower3: { x: 94, z: -94, y: 8.6 },
  outfall: { x: -140.5, z: -80 }, boat: { x: -147, z: -80 },
  helipad: { x: 80, z: 130 }, gate: { x: 44, z: 100 }, visiting: { x: -14, z: 84 }, seg: { x: 0, z: -41 },
};

export function buildMap(K) {
  const { MAT, THREE } = K;
  K.bounds(-158, -150, 158, 158);
  K.preset('prison');
  prisonMats(K);
  const G = geos(), R = rng(1931), W = K.W;
  const notes = [];
  W.spots = SPOTS; W.gates = [];
  // ---- tiny helpers (axis-aligned extents) ----
  const bx = (x0, y0, z0, x1, y1, z1, mat) => K.box((x0 + x1) / 2, y0, (z0 + z1) / 2, Math.abs(x1 - x0) / 2, y1, Math.abs(z1 - z0) / 2, 0, mat);
  const so = (x0, z0, x1, z1, y1, surf = 'concrete', y0 = 0, extra = {}) => K.solid((x0 + x1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0) / 2, Math.abs(z1 - z0) / 2, 0, y1, surf, y0, extra);
  const bs = (x0, y0, z0, x1, y1, z1, mat, surf = 'concrete', extra = {}) => { bx(x0, y0, z0, x1, y1, z1, mat); return so(x0, z0, x1, z1, y1, surf, y0, extra); };
  const loot = (kind, x, z, y, label, yaw = 0, H = null, extra = {}) => K.container(kind, x, z, y, label, yaw, H, extra);
  const fixed = (...ids) => ids.filter(([id]) => hasItem(id));
  const note = (id, x, z, y = 0.8) => notes.push({ x, z, y, id });
  // a flight of stairs with guards along both sides (so nobody walks into it from the side, or under its high end)
  const flight = (x, z, yaw, w, len, ya, yb, mat = 'pTread', o = {}) => {
    const ra = K.stairs(x, z, yaw, w, len, ya, yb, mat, { open: true, ...o });
    for (const sd of [-1, 1]) { const [px, pz] = frame(x, z, yaw)(sd * (w / 2 + 0.06), 0.4); K.solid(px, pz, 0.04, len / 2 - 0.4, yaw, Math.max(ya, yb) + 1.0, 'metal', 0, { window: true, navSkip: true }); }
    return ra;
  };
  // a mesh-and-rail barrier (walkways, landings): drawn rails + posts + mesh, solid from y0 to y0+1.1
  const railing = (x0, z0, x1, z1, y0, mesh = true) => {
    const L = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(-(z1 - z0), x1 - x0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    K.box(cx, y0 + 1.04, cz, L / 2, y0 + 1.1, 0.03, yaw, 'pRail');
    K.box(cx, y0 + 0.5, cz, L / 2, y0 + 0.54, 0.02, yaw, 'pRail');
    K.box(cx, y0, cz, L / 2, y0 + 0.12, 0.012, yaw, 'pBars');
    if (mesh) K.box(cx, y0 + 0.12, cz, L / 2, y0 + 1.04, 0.004, yaw, f => f === 'pz' ? 'chainlink' : null);
    const n = Math.max(1, Math.round(L / 2));
    for (let i = 0; i <= n; i++) { const t = i / n, px = x0 + (x1 - x0) * t, pz = z0 + (z1 - z0) * t; K.box(px, y0, pz, 0.03, y0 + 1.1, 0.03, yaw, 'pRail'); }
    K.solid(cx, cz, L / 2, 0.05, yaw, y0 + 1.1, 'metal', y0, { window: true });
  };
  // a tall chain-link fence with razor wire on top (the yard, the sally port): not vaultable
  const fence = (x0, z0, x1, z1, h = 3.8, coil = true) => {
    const L = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(-(z1 - z0), x1 - x0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    K.box(cx, 0.05, cz, L / 2, h, 0.004, yaw, f => f === 'pz' ? 'chainlink' : null);
    K.box(cx, h - 0.05, cz, L / 2, h, 0.03, yaw, 'pBars'); K.box(cx, 0.05, cz, L / 2, 0.1, 0.02, yaw, 'pBars');
    const n = Math.max(1, Math.round(L / 3));
    for (let i = 0; i <= n; i++) { const t = i / n, px = x0 + (x1 - x0) * t, pz = z0 + (z1 - z0) * t; K.xadd(G.pipe, MAT.pBars, K.mat4(px, 0, pz, 0, 0.045, h + 0.5, 0.045)); }
    if (coil) for (let i = 0; i < Math.floor(L / 2); i++) { const t = (i + 0.5) / Math.floor(L / 2); K.inst(G.coil, MAT.pRazor, K.mat4(x0 + (x1 - x0) * t, h - 0.25, z0 + (z1 - z0) * t, yaw, 1, 0.8, 0.8)); }
    K.solid(cx, cz, L / 2, 0.06, yaw, h + 0.6, 'metal', 0, { window: true });
  };
  // a keycard gate: a sliding barred gate. It stands OPEN (slid back) unless main.js calls W.lockGates()
  // (when keycards are wired up); W.openGate(g) slides it back again. needs: item id.
  const gate = (x, z, yaw, w, h, needs, name) => {
    const g2 = new THREE.Group();
    const bars = new THREE.InstancedMesh(G.bar, MAT.pBars, Math.ceil(w / 0.12) + 4);
    let k = 0; const M = new THREE.Matrix4();
    for (let lx = 0.06; lx < w; lx += 0.12) bars.setMatrixAt(k++, M.compose(new THREE.Vector3(lx, 0, 0), new THREE.Quaternion(), new THREE.Vector3(1.2, h, 1.2)));
    for (const y of [0.08, h / 2, h - 0.06]) bars.setMatrixAt(k++, M.compose(new THREE.Vector3(0, y, 0), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2), new THREE.Vector3(2.4, w, 2.4)));
    bars.count = k; bars.castShadow = true; g2.add(bars);
    const [hx0, hz0] = frame(x, z, yaw)(-w / 2, 0);   // the hinge end
    g2.position.set(hx0, 0, hz0); g2.rotation.y = yaw; K.level.add(g2);
    const box = K.solid(x, z, w / 2, 0.06, yaw, h, 'metal', 0, { window: true, off: true });
    const reader = frame(x, z, yaw)(w / 2 + 0.35, 0.2);
    K.box(reader[0], 1.2, reader[1], 0.07, 1.4, 0.03, yaw, f => f === 'pz' || f === 'nz' ? 'pRed' : 'black');
    const G1 = { name, needs, x, z, yaw, w, box, group: g2, open: true, reader: { x: reader[0], z: reader[1] } };
    const place = () => { g2.rotation.y = yaw + (G1.open ? Math.PI / 2 * 0.95 : 0); box.off = G1.open; };
    G1.place = place; place();
    W.gates.push(G1);
    return G1;
  };
  W.lockGates = () => { for (const g of W.gates) { g.open = false; g.place(); } };
  W.openGate = g => { g.open = true; g.place(); };
  W.gateNear = (x, z, r = 1.6) => W.gates.find(g => Math.hypot(g.reader.x - x, g.reader.z - z) < r || Math.hypot(g.x - x, g.z - z) < r) || null;

  // ================================================================ ground
  K.groundKind('grass');
  K.region(-100, -100, 100, 100, 'dirt', 'gravel', 0.7);
  // the patrol road inside the wall, the walks between buildings
  for (const [x0, z0, x1, z1] of [[-99.6, -99.6, 99.6, -93], [-99.6, 93, 99.6, 99.6], [-99.6, -93, -93, 93], [93, -93, 99.6, 93]]) K.slab(x0, z0, x1, z1, 'drive', 'concrete');
  for (const [x0, z0, x1, z1] of [[-2.5, 62, 2.5, 74], [-2.5, -38, 2.5, 4], [-56, 13, -40, 17], [40, 13, 56, 17], [-90, -66, 90, -60], [-2.5, -60, 2.5, -50], [-56, -60, -50, 40], [50, -60, 56, 40], [-56, 40, -40.2, 46], [40.2, 40, 56, 46], [24, 62.2, 30, 74], [-30, 62.2, -24, 74]]) K.slab(x0, z0, x1, z1, 'drive', 'concrete');
  K.slab(36, 62, 52, 100, 'road', 'asphalt');   // the service road from the sally port
  K.slab(-60, 112, 32, 152, 'road', 'asphalt'); K.slab(38, 100.4, 50, 158, 'road', 'asphalt'); K.slab(32, 120, 38, 140, 'road', 'asphalt');
  K.slab(-8, 100.4, 8, 112, 'walk', 'concrete');
  // parking bays
  for (let i = 0; i < 14; i++) { const x = -56 + i * 6; bx(x - 0.06, 0.02, 116, x + 0.06, 0.03, 122, 'roadWhite'); bx(x - 0.06, 0.02, 146, x + 0.06, 0.03, 152, 'roadWhite'); bx(x - 0.06, 0.02, 128, x + 0.06, 0.03, 140, 'roadWhite'); }
  bx(-58, 0.02, 133.94, 28, 0.03, 134.06, 'roadWhite');
  bx(43.9, 0.02, 101, 44.1, 0.03, 158, 'roadLine');

  // ================================================================ the perimeter wall
  const WT = WALL.t, WH = WALL.h;
  const pw = (x0, z0, x1, z1, openings) => K.wall(x0, z0, x1, z1, { h: WH, t: WT, mat: 'pWall', inMat: 'pWall', capMat: 'pWall', surf: 'concrete', openings });
  pw(-100.4, -100, 100.4, -100, []);
  pw(100.4, 100, -100.4, 100, [{ at: 0, w: 1.1, door: true, col: 0x4a5058, hp: 2000, dir: 1 }, { at: -44, w: 9, top: WH }]);   // the staff door (to the gatehouse), the sally port
  pw(-100, 100, -100, -100, [{ at: 80, w: 3.6, top: 2.7 }]);   // the storm sewer goes under here (z = −80)
  pw(100, -100, 100, 100, []);
  // coping, and razor wire coiled all the way along the top
  for (const [x0, z0, x1, z1] of [[-100.4, -100, 100.4, -100], [-100.4, 100, 100.4, 100], [-100, -100, -100, 100], [100, -100, 100, 100]]) {
    const L = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(-(z1 - z0), x1 - x0);
    K.box((x0 + x1) / 2, WH, (z0 + z1) / 2, L / 2 + 0.1, WH + 0.12, WT / 2 + 0.12, yaw, 'concrete');
    const n = Math.floor(L / 2);
    for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; if (Math.abs(x0 - x1) > 1 && z0 > 0 && Math.abs(x0 + (x1 - x0) * t - 44) < 4.5) continue; K.inst(G.coil, MAT.pRazor, K.mat4(x0 + (x1 - x0) * t, WH + 0.1, z0 + (z1 - z0) * t, yaw)); }
  }
  // the sally port: two heavy barred gates across the 9 m gap, closed (sealed at 11:41), with a booth
  for (const sd of [-1, 1]) {
    const gx = 44 + sd * 2.25;
    for (let lx = -2.2; lx <= 2.2; lx += 0.16) K.inst(G.bar, MAT.pBars, K.mat4(gx + lx, 0, 100, 0, 2.4, 5.2, 2.4));
    for (const y of [0.1, 1.6, 3.2, 5.0]) bx(gx - 2.25, y, 99.94, gx + 2.25, y + 0.14, 100.06, 'pBars');
  }
  bx(39.4, 5.2, 99.7, 48.6, 6, 100.3, 'pBars');
  // the sally-port booth: an officer's box beside the gates, wired-glass windows on the gate and the yard
  K.room(52.5, 97, 3, 3, 0, { h: 2.7, mat: 'pCinderOut', inMat: 'pCinder', floor: 'pFloor', name: 'sally port booth', home: false, doors: [{ side: 's', at: 0, w: 0.9 }], windows: [{ side: 'w', at: 0, w: 2, sill: 1, top: 2.2 }, { side: 'n', at: 0, w: 2, sill: 1, top: 2.2 }] });
  bs(51.2, 0, 97.6, 52.6, 0.95, 98.3, 'darkMetal', 'metal', { vault: true }); bx(51.15, 0.95, 97.55, 52.65, 1.0, 98.35, 'black');
  so(39.5, 99.9, 48.5, 100.1, 6, 'metal', 0, { window: true });
  sign(K, 34, 3.2, 100.42, 0, 'sWarn', 3.2, 1.2);
  sign(K, 0, 3.6, 100.42, 0, 'sGate', 9, 2.2);

  // ================================================================ guard towers
  const tower = (tx, tz, yaw, num) => {
    const P = frame(tx, tz, yaw), Y = 8.6;
    K.block(tx, 0, tz, 1.5, Y - 0.2, 1.5, yaw, 'pWall', 'concrete');
    K.box(tx, Y - 0.2, tz, 2.7, Y, 2.7, yaw, 'concrete');
    K.deck(tx, tz, 2.6, 2.6, yaw, Y, { draw: false });
    // the cab: a steel parapet, glass all round, corner posts, a flat roof with a searchlight
    for (const [lx, lz, hx, hz, door] of [[0, -2.6, 2.7, 0.08], [-2.6, 0, 0.08, 2.7], [2.6, 0, 0.08, 2.7], [-1.65, 2.6, 1.05, 0.08], [1.65, 2.6, 1.05, 0.08]]) {
      const [px, pz] = P(lx, lz);
      K.box(px, Y, pz, hx, Y + 1.05, hz, yaw, 'pBars'); K.box(px, Y + 1.05, pz, hx, Y + 2.3, hz, yaw, f => f === 'top' || f === 'bot' ? null : 'glass');
      K.solid(px, pz, hx, hz, yaw, Y + 1.05, 'metal', Y); K.solid(px, pz, hx, hz, yaw, Y + 2.3, 'glass', Y + 1.05, { window: true });
    }
    for (const [lx, lz] of [[-2.62, -2.62], [2.62, -2.62], [-2.62, 2.62], [2.62, 2.62], [-0.6, 2.62], [0.6, 2.62]]) { const [px, pz] = P(lx, lz); K.box(px, Y, pz, 0.07, Y + 2.3, 0.07, yaw, 'pBars'); }
    K.box(tx, Y + 2.3, tz, 3.1, Y + 2.5, 3.1, yaw, f => f === 'bot' ? 'ceilTile' : 'concrete');
    K.solid(tx, tz, 3.0, 3.0, yaw, Y + 2.5, 'concrete', Y + 2.3);
    { const [px, pz] = P(1.6, -1.6); K.xadd(G.pipe, MAT.darkMetal, K.mat4(px, Y + 2.5, pz, 0, 0.06, 0.5, 0.06)); K.xadd(G.disc, MAT.pLight, K.mat4(px, Y + 3.15, pz, yaw + 0.6, 0.4, 0.32, 0.32)); }
    // inside: a console, a stool, the gun locker (searchable)
    { const [px, pz] = P(0, -2.1); K.box(px, Y, pz, 1.6, Y + 0.95, 0.35, yaw, 'darkMetal'); K.box(px, Y + 0.95, pz, 1.6, Y + 1.0, 0.36, yaw, 'black'); K.solid(px, pz, 1.6, 0.35, yaw, Y + 1.0, 'metal', Y); }
    { const [px, pz] = P(-2.1, 0.6); K.box(px, Y, pz, 0.35, Y + 1.8, 0.5, yaw, 'pCopper'); K.solid(px, pz, 0.35, 0.5, yaw, Y + 1.8, 'metal', Y);
      const fx = num === 3 ? fixed(['keycardGreen', 1], ['sniper', 1], ['rifleAmmo', 12]) : [];
      loot('police', ...P(-1.7, 0.6), 1.0, num === 3 ? 'Tower 3 gun locker' : 'Tower gun locker', yaw + Math.PI / 2, null, { floorY: Y, ...(fx.length ? { fixed: fx } : {}) }); }
    if (num === 3) { const [px, pz] = P(0.8, -1.9); note('reyes', px, pz, Y + 1.0); const [sx, sz] = P(1.65, 2.72); sign(K, sx, Y + 0.2, sz, yaw, 'sTower', 0.6, 0.6); }
    // the ship stair down toward the compound (it rises toward the cab: local −z)
    const L = 11; const [sx, sz] = P(0, 2.7 + L / 2);
    flight(sx, sz, yaw + Math.PI, 1.0, L, 0, Y, 'pTread');
  };
  // local +z of each tower points into the compound, so the stair runs inward
  const towers = [[-94, -94, -1, -1, 1], [0, -94.5, 0, -1, 2], [94, -94, 1, -1, 3], [94, 94, 1, 1, 4], [-94, 94, -1, 1, 5]];
  for (const [tx, tz, sx, sz, n] of towers) tower(tx, tz, Math.atan2(-sx, -sz), n);

  // ================================================================ A BLOCK / B BLOCK
  const cellBlock = (B, letter, yr) => {   // yr: which row faces the yard (+1: east, −1: west)
    const { x: cx, z: cz } = B, sideYard = yr > 0 ? 'e' : 'w', sideOut = yr > 0 ? 'w' : 'e';
    const zc = k => -36 + 1.5 + 3 * k, zb = k => -36 + 3 * k, DOORK = 18;
    const atOn = (side, lz) => side === 'e' ? lz : -lz;
    const wins = [];
    for (let k = 0; k < 24; k++) for (const side of ['e', 'w']) {
      if (!(side === sideYard && k === DOORK)) wins.push({ side, at: atOn(side, zc(k)), w: 0.32, sill: 1.5, top: 2.6 });
      wins.push({ side, at: atOn(side, zc(k)), w: 0.32, sill: 4.9, top: 6.0 });
    }
    const H = K.room(cx, cz, 28, 80, 0, {
      h: 7.6, t: 0.3, mat: 'pCinderOut', inMat: 'pCinder', floor: 'pFloor', roof: 'flat', roofMat: 'concrete', name: letter + ' Block', home: false,
      doors: [{ side: sideYard, at: atOn(sideYard, zc(DOORK)), w: 1.3, col: 0x4a5560, hp: 600 }, { side: 'n', at: 0, w: 1.2, col: 0x4a5560, hp: 600 }, { side: 's', at: 0, w: 1.2, col: 0x4a5560, hp: 600 }],
      windows: wins, inside: [[0, 0], [0, 20], [0, -20], [yr * 4, zc(DOORK)]],
    });
    sign(K, cx + yr * 14.2, 2.6, cz + zc(DOORK), yr * Math.PI / 2, letter === 'A' ? 'sA' : 'sB', 3.2, 1.2);
    // every cell, both rows, both tiers
    for (const r of [-1, 1]) for (const y0 of [0, 3.4]) {
      const up = y0 > 0;
      for (let k = 0; k <= 24; k++) K.block(cx + r * 11.925, y0, cz + zb(k), 1.925, y0 + 3.2, 0.1, 0, 'pCinder', 'concrete');
      for (let k = 0; k < 24; k++) {
        const corridor = !up && r === yr && k === DOORK, z0 = cz + zb(k), fx = cx + r * 10;
        if (corridor) { bx(fx - 0.05, 2.9, z0 + 0.1, fx + 0.05, 3.2, z0 + 2.9, 'pBars'); continue; }
        // the bars: fixed panel, the door slid open in front of it, straps and a header
        for (let z = z0 + 0.16; z < z0 + 1.9; z += 0.12) K.inst(G.bar, MAT.pBars, K.mat4(fx, y0, z, 0, 1.3, 2.9, 1.3));
        for (let z = z0 + 1.06; z < z0 + 1.9; z += 0.12) K.inst(G.bar, MAT.pBars, K.mat4(fx - r * 0.09, y0 + 0.05, z, 0, 1.2, 2.8, 1.2));
        for (const y of [0.04, 1.0, 2.0]) bx(fx - 0.035, y0 + y, z0 + 0.1, fx + 0.035, y0 + y + 0.07, z0 + 1.92, 'pBars');
        for (const y of [0.1, 1.05, 2.05]) bx(fx - r * 0.09 - 0.03, y0 + y, z0 + 1.0, fx - r * 0.09 + 0.03, y0 + y + 0.06, z0 + 1.92, 'pBars');
        bx(fx - 0.06, y0 + 2.9, z0 + 0.1, fx + 0.06, y0 + 3.2, z0 + 2.9, 'pBars');
        bx(fx - 0.04, y0, z0 + 1.88, fx + 0.04, y0 + 2.9, z0 + 1.98, 'pBars');   // the lock jamb
        so(fx - 0.05, z0 + 0.1, fx + 0.05, z0 + 1.95, y0 + 3.2, 'metal', y0, { window: true });
        // inside: a bunk on the near wall, the steel toilet-sink at the back, a shelf, a footlocker, odds and ends
        const bxC = cx + r * 11.95, bzC = z0 + 0.58;
        bunk(K, bxC, y0, bzC, 0, true, (k + (up ? 7 : 0)) % 5);
        so(bxC - 0.98, bzC - 0.4, bxC + 0.98, bzC + 0.4, y0 + 1.8, 'metal', y0);
        toiletSink(K, cx + r * 13.78, y0, z0 + 2.25, -r * Math.PI / 2);
        bx(cx + r * 13.5 - 0.15, y0 + 1.55, z0 + 1.1, cx + r * 13.5 + 0.15, y0 + 1.58, z0 + 1.85, 'pSteel');   // shelf
        const rr = R();
        if (rr < 0.7) for (let b = 0; b < 3 + (rr * 10 | 0) % 4; b++) bx(cx + r * 13.5 - 0.1, y0 + 1.58, z0 + 1.15 + b * 0.07, cx + r * 13.5 + 0.08, y0 + 1.78 + (b % 2) * 0.03, z0 + 1.2 + b * 0.07, 'book' + (b + k) % 6);
        if (rr > 0.55) bx(cx + r * 12.6 - 0.25, y0 + 0.03, z0 + 2.4, cx + r * 12.6 + 0.25, y0 + 0.09, z0 + 2.75, 'pOrange');   // a jumpsuit on the floor
        bx(cx + r * 13.82 - 0.005, y0 + 1.75, z0 + 0.4, cx + r * 13.82 + 0.005, y0 + 2.05, z0 + 0.62, 'white');   // a photo taped up
        bx(cx + r * 11.2 - 0.25, y0, z0 + 0.25, cx + r * 11.2 + 0.25, y0 + 0.32, z0 + 0.85, 'pCopper');   // footlocker under the bunk
        if ((k + (up ? 1 : 0) + (r > 0 ? 0 : 1)) % 2 === 0) loot(k % 3 ? 'dresser' : 'nightstand', cx + r * 10.7, z0 + 0.55, 0.3, 'Footlocker', r * Math.PI / 2, H, up ? { floorY: y0 } : {});
        bx(cx + r * 11.925 - 1.925, y0 + 3.1, z0 + 0.1, cx + r * 11.925 + 1.925, y0 + 3.2, z0 + 2.9, f => f === 'bot' ? 'pCinder' : null);   // cell ceiling
      }
    }
    // the upper tier: floor + walkway (one slab each side), the landings, the railings, the stairs
    for (const r of [-1, 1]) {
      K.box(cx + r * 11.0, 3.2, cz, 2.85, 3.4, 36, 0, f => f === 'top' ? 'pFloor' : f === 'bot' ? 'pCinder' : 'pBars');
      K.deck(cx + r * 11.0, cz, 2.85, 36, 0, 3.4, { draw: false });
      railing(cx + r * 8.15, cz - 33.6, cx + r * 8.15, cz + 33.6, 3.4);
      for (const e of [-1, 1]) {
        const lz = e * 34.8;
        K.box(cx + r * 7.375, 3.2, cz + lz, 0.775, 3.4, 1.2, 0, f => f === 'top' ? 'pTread' : 'pBars');
        K.deck(cx + r * 7.375, cz + lz, 0.775, 1.2, 0, 3.4, { draw: false });
        railing(cx + r * 6.6, cz + e * 33.6, cx + r * 6.6, cz + e * 36, 3.4);
        railing(cx + r * 6.6, cz + e * 36, cx + r * 10, cz + e * 36, 3.4);
        flight(cx + r * 7.3, cz + e * 30.6, e < 0 ? Math.PI : 0, 1.3, 6, 0, 3.4, 'pTread');
        // strip lights under the walkway, over the ground-floor run
      }
      for (let z = -33; z <= 33; z += 6) { strip(K, cx + r * 9.1, 3.18, cz + z, Math.PI / 2); strip(K, cx + r * 4, 7.58, cz + z, Math.PI / 2, 1.6); }
    }
    // the bubble: an octagonal officers' station in the middle of the dayroom
    K.xadd(G.oct, MAT.pSteel, K.mat4(cx, 0, cz, 0, 2.2, 1.1, 2.2));
    K.xadd(G.oct, MAT.glass, K.mat4(cx, 1.1, cz, 0, 2.15, 1.4, 2.15));
    K.xadd(G.oct, MAT.darkMetal, K.mat4(cx, 2.5, cz, 0, 2.4, 0.25, 2.4));
    K.xadd(G.oct, MAT.pScreen, K.mat4(cx, 0.95, cz, 0, 1.4, 0.3, 1.4));
    K.solid(cx, cz, 1.95, 1.95, 0, 2.75, 'metal', 0, { window: true }); K.solid(cx, cz, 1.95, 1.95, Math.PI / 4, 2.75, 'metal', 0, { window: true });
    loot('police', cx + yr * 2.3, cz, 1.0, 'Officers\' station drawer', yr * Math.PI / 2, H, { fixed: [['flashlight', 1], ['battery', 2]] });
    // the dayroom: bolted-down tables, a TV on the end wall, payphones, the count board
    for (const lx of [-4.2, 4.2]) for (const lz of [-19, -13, -7, 7, 13, 19]) messTable(K, cx + lx, cz + lz, Math.PI / 2);
    K.box(cx, 4.2, cz - 39.8, 1.0, 4.9, 0.1, 0, f => f === 'pz' ? 'pScreen' : 'black');
    sign(K, cx, 2.6, cz - 39.83, 0, 'sCount', 2.6, 1.0);
    for (let i = 0; i < 3; i++) { const px = cx - 6 + i * 1.1; bx(px - 0.25, 1.1, cz + 39.65, px + 0.25, 1.75, cz + 39.85, 'pSteel'); bx(px - 0.06, 1.25, cz + 39.55, px + 0.06, 1.5, cz + 39.65, 'black'); }
    loot('bin', cx + 5.5, cz + 39.2, 0.5, 'Trash can', Math.PI, H);
    loot('shelf', cx - 13.4, cz + 38, 1.2, 'Mop closet shelf', Math.PI / 2, H);
    K.light(cx, 6.8, cz, 0xe8f0ff, 10, 26);
    return H;
  };
  const HA = cellBlock(BLD.blockA, 'A', 1);
  const HB = cellBlock(BLD.blockB, 'B', -1);
  note('kite', 57.8, -6.6, 0.4);

  // ================================================================ THE YARD
  {
    const { x0, z0, x1, z1 } = YARD;
    for (const [a, b, c, d] of [[x0, z0, -2, z0], [2, z0, x1, z0], [x0, z1, -2, z1], [2, z1, x1, z1], [x0, z0, x0, 13], [x0, 17, x0, z1], [x1, z0, x1, 13], [x1, 17, x1, z1]]) fence(a, b, c, d);
    K.region(x0, z0, x1, z1, 'dirt', 'gravel', 0.95);
    // basketball court
    K.slab(-33, 11, -3, 29, 'pCourt', 'concrete');
    const line = (a, b, c, d) => bx(a, 0.02, b, c, 0.035, d, 'white');
    line(-32.5, 11.4, -3.5, 11.5); line(-32.5, 28.5, -3.5, 28.6); line(-32.6, 11.4, -32.5, 28.6); line(-3.5, 11.4, -3.4, 28.6); line(-18.05, 11.4, -17.95, 28.6);
    for (const e of [-1, 1]) {
      const hx = -18 + e * 13.4;
      line(hx - e * 5.8 - 0.05, 18, hx - e * 5.8 + 0.05, 22); line(Math.min(hx, hx - e * 5.8), 17.95, Math.max(hx, hx - e * 5.8), 18.05); line(Math.min(hx, hx - e * 5.8), 21.95, Math.max(hx, hx - e * 5.8), 22.05);
      // the hoop: a steel pole, an arm, a perforated steel backboard (prison issue), a chain net
      const px = hx + e * 1.2;
      K.xadd(G.pipe, MAT.pBars, K.mat4(px, 0, 20, 0, 0.09, 3.4, 0.09)); K.solid(px, 20, 0.12, 0.12, 0, 3.4, 'metal');
      bx(Math.min(px, hx) - 0.05, 3.2, 19.92, Math.max(px, hx) + 0.05, 3.32, 20.08, 'pBars');
      bx(hx - 0.04, 2.8, 19.1, hx + 0.04, 3.9, 20.9, 'pSteel');
      K.xadd(G.ring, MAT.orange, K.mat4(hx - e * 0.3, 3.05, 20, 0, 1, 1, 1));
      K.xadd(G.cone, MAT.chrome, K.mat4(hx - e * 0.3, 2.65, 20, 0, 0.22, 0.4, 0.22));
    }
    // the 3-point arcs and the centre circle (thin painted segments)
    const arc = (cx, cz, rad, a0, a1, n) => { for (let i = 0; i < n; i++) { const t0 = a0 + (a1 - a0) * i / n, t1 = a0 + (a1 - a0) * (i + 1) / n; const ax = cx + rad * Math.cos(t0), az = cz + rad * Math.sin(t0), bx2 = cx + rad * Math.cos(t1), bz2 = cz + rad * Math.sin(t1); K.box((ax + bx2) / 2, 0.02, (az + bz2) / 2, 0.05, 0.036, Math.hypot(bx2 - ax, bz2 - az) / 2 + 0.01, Math.atan2(bx2 - ax, bz2 - az), 'white'); } };
    for (const e of [-1, 1]) { const rx = -18 + e * 13.4 - e * 0.3; arc(rx, 20, 6.75, e > 0 ? Math.PI / 2 : -Math.PI / 2, e > 0 ? Math.PI * 1.5 : Math.PI / 2, 24); }
    arc(-18, 20, 1.8, 0, Math.PI * 2, 20);
    // the weight pile: rubber mats, benches, a dumbbell rack, a pull-up / dip station
    K.slab(8, 10, 24, 24, 'pRubber', 'concrete');
    for (const [wx, wz, wy] of [[11, 13, 0], [15, 13, 0], [19, 13, 0], [11, 19, 0.3], [15, 19, -0.2], [20, 19.5, 0.1]]) weightBench(K, wx, wz, wy);
    bs(9, 0, 22.3, 17, 0.7, 23.2, 'pIron', 'metal', { vault: true });
    for (let i = 0; i < 10; i++) { const dx = 9.4 + i * 0.75; K.xadd(G.pipe, MAT.chrome, K.mat4(dx, 0.78, 22.75, 0, 0.02, 0.35, 0.02, 0, Math.PI / 2)); for (const e of [-0.17, 0.17]) K.xadd(G.disc, MAT.pIron, K.mat4(dx + e, 0.78, 22.75, 0, 0.05, 0.08, 0.08)); }
    for (const px of [21, 23.6]) { K.xadd(G.pipe, MAT.pBars, K.mat4(px, 0, 22, 0, 0.05, 2.5, 0.05)); K.xadd(G.pipe, MAT.pBars, K.mat4(px, 0, 23.4, 0, 0.05, 2.5, 0.05)); K.solid(px, 22.7, 0.1, 0.75, 0, 2.5, 'metal', 0, { window: true }); }
    bx(20.95, 2.4, 22.68, 23.65, 2.46, 22.74, 'chrome');
    // aluminium bleachers (climb them: each row a step)
    for (let i = 0; i < 4; i++) { const y = 0.45 + i * 0.42, z = 34 + i * 0.75; bx(-30, y - 0.05, z - 0.37, -8, y, z + 0.37, 'alu'); K.deck(-19, z, 11, 0.37, 0, y, { draw: false, climb: true }); so(-30, z - 0.37, -8, z + 0.37, y, 'metal', 0, { vault: true }); }
    for (let x = -30; x <= -8; x += 2.75) { bx(x - 0.04, 0, 33.6, x + 0.04, 0.45, 33.7, 'alu'); bx(x - 0.04, 0, 36.6, x + 0.04, 2.61, 36.7, 'alu'); }
    bx(-30, 2.55, 36.6, -8, 2.6, 36.7, 'alu');   // the back rail
    // the handball wall
    bs(14, 0, 42, 26, 4.6, 42.5, 'concrete', 'concrete');
    for (let i = 0; i < 6; i++) bx(14.5 + i * 2, 1.2, 41.98, 15 + i * 2, 1.25, 42, 'white');
    K.slab(14, 36, 26, 42, 'drive', 'concrete');
    // concrete picnic tables
    for (const [tx, tz] of [[6, 50], [14, 52], [22, 50], [-6, 52], [-14, 50]]) { bs(tx - 1.1, 0, tz - 0.4, tx + 1.1, 0.78, tz + 0.4, 'concrete', 'concrete', { vault: true }); for (const e of [-0.85, 0.85]) bs(tx - 1.1, 0, tz + e - 0.15, tx + 1.1, 0.45, tz + e + 0.15, 'concrete', 'concrete', { vault: true }); }
    // a basketball left on the court, the weights' chalk bucket
    K.xadd(G.ball, MAT.orange, K.mat4(-21, 0.12, 23, 0, 0.12, 0.12, 0.12));
    loot('bin', 3, 8, 0.5, 'Yard trash barrel', 0); bs(2.65, 0, 7.65, 3.35, 0.95, 8.35, 'darkMetal', 'metal', { vault: true });
    loot('bench', -19, 35.4, 0.25, 'Under the bleachers', 0);
    // a guard's picket at the south gate
    K.room(8, 67, 3.4, 3.4, 0, { h: 2.7, mat: 'pCinderOut', inMat: 'pCinder', floor: 'pFloor', name: 'yard picket', home: false, doors: [{ side: 'n', at: 0, w: 0.9, col: 0x4a5560 }], windows: [{ side: 's', at: 0, w: 2.2, sill: 1.0, top: 2.2 }, { side: 'e', at: 0, w: 2, sill: 1.0, top: 2.2 }, { side: 'w', at: 0, w: 2, sill: 1.0, top: 2.2 }] });
    loot('police', 6.8, 67, 0.9, 'Yard officer\'s drawer', -Math.PI / 2);
  }

  // ================================================================ THE SEGREGATION UNIT (solitary)
  {
    const { x, z, w, d } = BLD.seg;
    const H = K.room(x, z, w, d, 0, { h: 3.4, t: 0.3, mat: 'pCinderOut', inMat: 'pCinderG', floor: 'pFloor', name: 'Segregation Unit', home: false, doors: [{ side: 'n', at: 0, w: 1.1, col: 0x6a1a14, hp: 800 }], windows: [{ side: 'n', at: -7, w: 1.4, sill: 1.6, top: 2.4 }, { side: 'n', at: 7, w: 1.4, sill: 1.6, top: 2.4 }] });
    sign(K, x, 2.5, z + d / 2 + 0.17, 0, 'sSeg', 3.6, 1.3);
    // six cells along the north side: solid steel doors with a food slot and a slit window
    const fz = z - 1.5;
    const ops = []; for (let i = 0; i < 6; i++) ops.push({ at: -10.8 + 1.8 + i * 3.6 - 0.6, w: 0.85, door: true, col: 0x55606a, hp: 900, dir: -1, interior: true });
    K.wall(x - 12.85, fz, x + 12.85, fz, { h: 3.4, t: 0.25, mat: 'pCinderG', inMat: 'pCinderG', capMat: 'pCinderG', openings: ops });
    for (let i = 0; i <= 6; i++) K.block(x - 10.8 + i * 3.6, 0, (z - d / 2 + fz) / 2, 0.12, 3.4, (fz - (z - d / 2)) / 2 - 0.12, 0, 'pCinderG', 'concrete');
    for (let i = 0; i < 6; i++) {
      const cxx = x - 9 + i * 3.6;
      bs(cxx - 1.6, 0, z - 5.85, cxx - 0.6, 0.45, z - 3.9, 'concrete', 'concrete', { vault: true });   // the concrete bunk
      bx(cxx - 1.55, 0.45, z - 5.8, cxx - 0.65, 0.53, z - 3.95, 'pMat');
      toiletSink(K, cxx + 1.1, 0, z - 5.85, 0);
      if (i === 3) note('sol', cxx, z - 4.5, 0.2);
      if (i % 2 === 0) loot('dresser', cxx - 1.1, z - 3.6, 0.3, 'Under the bunk', 0, H);
    }
    // the corridor: an officer's desk, a restraint chair, the shower cage
    desk(K, x + 9, z + 3.6, Math.PI);
    loot('cabinet', x + 9, z + 3.2, 0.75, 'Segregation log desk', 0, H);
    bs(x - 11.6, 0, z + 2, x - 9, 2.4, z + 4.7, 'pTile', 'concrete');
    for (let i = 0; i < 6; i++) strip(K, x - 10 + i * 4, 3.38, z + 1.5, 0);
  }

  // ================================================================ THE NORTH ROW
  // ---- LAUNDRY (+ the pump room and the old storm sewer) ----
  {
    const { x, z, w, d } = BLD.laundry;
    const H = K.room(x, z, w, d, 0, { h: 4.6, t: 0.3, mat: 'pCinderOut', inMat: 'pCinder', floor: 'pFloor', name: 'Laundry', home: false,
      doors: [{ side: 'n', at: 0, w: 1.4, col: 0x4a5560 }, { side: 'w', at: 2, w: 2.6, door: false, top: 2.5 }],
      windows: [-10, -4, 4, 10].map(a => ({ side: 'n', at: a, w: 1.6, sill: 2.4, top: 3.6 })).concat([-8, 0, 8].map(a => ({ side: 's', at: a, w: 1.6, sill: 2.4, top: 3.6 }))) });
    sign(K, x + 4, 3.0, z + d / 2 + 0.17, 0, 'sLau', 3.0, 1.1);
    // the pump room partition (x = −74): a steel door — the sewer grate and the pumps are behind it
    K.wall(x - 7, z + d / 2 - 0.15, x - 7, z - d / 2 + 0.15, { h: 4.6, t: 0.25, mat: 'pCinder', inMat: 'pCinderG', capMat: 'pCinder', openings: [{ at: -2.5, w: 1.0, door: true, col: 0x3a4048, hp: 900 }] });
    // washers along the south wall, dryers along the north, folding tables in the middle, carts
    for (let i = 0; i < 8; i++) washer(K, x - 4.5 + i * 2.6, z - d / 2 + 1.0, 0);
    for (let i = 0; i < 6; i++) washer(K, x - 1.5 + i * 2.6, z + d / 2 - 1.0, Math.PI, true);
    for (const tz of [z - 3, z + 3]) { bs(x - 2, 0.85, tz - 0.7, x + 10, 0.92, tz + 0.7, 'pSteel', 'metal', { vault: true }); for (const lx of [-1.8, 4, 9.8]) bx(x + lx - 0.04, 0, tz - 0.6, x + lx + 0.04, 0.85, tz + 0.6, 'pBars');
      for (let i = 0; i < 5; i++) bx(x - 1 + i * 2.2, 0.92, tz - 0.3, x - 0.2 + i * 2.2, 1.0 + (i % 2) * 0.06, tz + 0.3, i % 3 ? 'pOrange' : 'white'); }
    for (const [lx, lz] of [[-3.5, 6], [11.5, -6], [12, 4]]) { bs(x + lx - 0.5, 0.15, z + lz - 0.7, x + lx + 0.5, 0.95, z + lz + 0.7, 'pWool', 'cloth', { vault: true }); bx(x + lx - 0.5, 0, z + lz - 0.7, x + lx + 0.5, 0.15, z + lz + 0.7, 'pBars'); }
    loot('shelf', x + 13.5, z + 8, 1.0, 'Laundry supply shelf', -Math.PI / 2, H); bs(x + 13.3, 0, z + 6.6, x + 14.7, 2.0, z + 9.4, 'shelfMetal', 'metal');
    loot('closet', x + 13.5, z - 8, 1.0, 'Laundry trusty\'s locker', -Math.PI / 2, H); lockers(K, x + 14.4, z - 8, -Math.PI / 2, 4);
    note('dee', x + 8, z + 3.3, 1.0);
    for (let i = 0; i < 4; i++) strip(K, x - 3 + i * 5, 4.58, z, 0, 1.6);
    // the pump room: two pumps, pipes, the floor grate over the storm drain (the sewer starts at the west wall)
    for (const pz of [z - 7, z - 3.5]) { bs(x - 13, 0, pz - 0.8, x - 10.6, 1.4, pz + 0.8, 'bluePaint', 'metal'); K.xadd(G.pipe, MAT.pCopper, K.mat4(x - 11.8, 1.4, pz, 0, 0.18, 2.9, 0.18)); }
    K.wbeam([x - 14.6, 4.0, z - 10], [x - 7.4, 4.0, z - 10], 0.22, 0.22, MAT.pCopper);
    K.wbeam([x - 11.8, 4.3, z - 11], [x - 11.8, 4.3, z + 11], 0.3, 0.3, MAT.pCopper);
    bx(x - 14.6, 0.02, z - 3.3, x - 12.2, 0.045, z - 0.7, 'pTread');
    sign(K, x - 14.7, 1.6, z - 4.8, Math.PI / 2, 'sOut', 1.4, 0.55);
    loot('garage', x - 9, z + 9, 1.0, 'Maintenance cabinet', Math.PI, H); bs(x - 10, 0, z + 9.3, x - 8, 2.0, z + 11.6, 'darkMetal', 'metal');
    K.light(x - 11, 4.2, z - 2, 0xffd8a0, 4, 12);
  }
  // ---- THE STORM SEWER: a box culvert from the pump room, under the wall, out to the river ----
  {
    const z = -80, x0 = -137, x1 = BLD.laundry.x - BLD.laundry.w / 2, len = x1 - x0;
    K.room((x0 + x1) / 2, z, len, 3.6, 0, { h: 2.7, t: 0.3, mat: 'pWall', inMat: 'pWall', floor: 'pFloor', roof: 'flat', roofMat: 'concrete', parapet: false, name: 'Storm sewer', home: false,
      doors: [{ side: 'w', at: 0, w: 2.6, door: false, top: 2.5 }, { side: 'e', at: 0, w: 2.6, door: false, top: 2.5 }] });
    // the channel down the middle (wet, dark), walkways each side, pipes along the wall, a bare bulb every 12 m
    bx(x0 + 0.2, 0.031, z - 0.55, x1 - 0.2, 0.04, z + 0.55, 'pWater');
    K.wbeam([x0 + 0.5, 2.2, z + 1.5], [x1 - 0.5, 2.2, z + 1.5], 0.25, 0.25, MAT.rust);
    K.wbeam([x0 + 0.5, 2.35, z - 1.5], [x1 - 0.5, 2.35, z - 1.5], 0.12, 0.12, MAT.pCopper);
    for (let xx = x0 + 6, i = 0; xx < x1; xx += 12, i++) K.box(xx, 2.5, z, 0.08, 2.68, 0.08, 0, i % 3 === 1 ? 'pLight' : 'darkMetal');   // most bulbs are dead
    K.light(-96, 2.4, z, 0xffc080, 1.2, 6);   // one weak caged lamp at the grate
    // the old grate across the tunnel just inside the wall: rusted, padlocked (a keycard-style gate: needs the key)
    gate(-96, z, Math.PI / 2, 3.0, 2.6, 'sewerKey', 'storm sewer grate');
    // the earth berm piled over the outside run, so it reads as underground
    for (const sd of [-1, 1]) {
      const a = [x0, 2.92, z + sd * 1.95], b = [-100.6, 2.92, z + sd * 1.95], c = [-100.6, 0.0, z + sd * 6], d = [x0, 0.0, z + sd * 6];
      const n = [0, 4.05 / Math.hypot(4.05, 2.92), sd * 2.92 / Math.hypot(4.05, 2.92)];
      K.quad('dirt', a, b, c, d, n, [[0, 0], [36 / 4, 0], [36 / 4, 1.3], [0, 1.3]], (x0 - 100) / 2, z);
    }
    bx(x0, 2.9, z - 1.95, -100.6, 2.96, z + 1.95, 'dirt');
    // inside the wall too: earth over the run to the pump room, and the patrol road ramps up and over it
    for (const sd of [-1, 1]) K.quad('dirt', [-100.6, 2.92, z + sd * 1.95], [-82.3, 2.92, z + sd * 1.95], [-82.3, 0, z + sd * 6], [-100.6, 0, z + sd * 6], [0, 4.05 / Math.hypot(4.05, 2.92), sd * 2.92 / Math.hypot(4.05, 2.92)], [[0, 0], [4.6, 0], [4.6, 1.3], [0, 1.3]], -91, z);
    bx(-100.6, 2.9, z - 1.95, -82.3, 2.96, z + 1.95, 'dirt');
    K.stairs(-96.3, z - 5.025, 0, 6.6, 6.15, 0, 2.96, 'concrete', { rails: false }); K.stairs(-96.3, z + 5.025, Math.PI, 6.6, 6.15, 0, 2.96, 'concrete', { rails: false });
    bx(-99.6, 2.96, z - 1.95, -93, 3.0, z + 1.95, 'concrete'); K.deck(-96.3, z, 3.3, 1.95, 0, 3.0, { draw: false });
    K.region(x0, z - 7, -100.6, z + 7, 'dirt', 'gravel', 0.9);
    // the outfall headwall on the river bank, a dock, the warning sign
    bs(x0 - 0.6, 0, z - 4, x0, 3.4, z - 1.95, 'pWall', 'concrete'); bs(x0 - 0.6, 0, z + 1.95, x0, 3.4, z + 4, 'pWall', 'concrete'); bx(x0 - 0.6, 2.7, z - 1.95, x0, 3.4, z + 1.95, 'pWall');
    sign(K, x0 - 0.62, 3.45, z, -Math.PI / 2, 'sOut', 1.8, 0.7);
  }
  // ---- DINING HALL + KITCHEN ----
  {
    const { x, z, w, d } = BLD.dining;
    const H = K.room(x, z, w, d, 0, { h: 4.4, t: 0.3, mat: 'pCinderOut', inMat: 'pCinder', floor: 'pFloorR', name: 'Dining Hall', home: false,
      doors: [{ side: 'n', at: -9, w: 1.4, col: 0x4a5560 }, { side: 'n', at: 9, w: 1.4, col: 0x4a5560 }, { side: 's', at: -15, w: 1.1, col: 0x4a5560 }],
      windows: [-15, -5, 5, 15].map(a => ({ side: 'n', at: a, w: 2.2, sill: 2.2, top: 3.6 })) });
    sign(K, x, 3.1, z + d / 2 + 0.17, 0, 'sCaf', 3.0, 1.1);
    // the serving line: a wall with a long hatch over a steel counter with a sneeze guard
    const kz = z - 4;
    K.wall(x - w / 2 + 0.15, kz, x + w / 2 - 0.15, kz, { h: 4.4, t: 0.25, mat: 'pTile', inMat: 'pCinder', capMat: 'pCinder', openings: [{ at: -2, w: 14, sill: 1.0, top: 2.2 }, { at: 15, w: 1.0, door: true, col: 0xc8ccd0, dir: -1 }] });
    bs(x - 9, 0, kz + 0.15, x + 5, 0.95, kz + 0.9, 'pSteel', 'metal');
    bx(x - 9, 1.3, kz + 0.75, x + 5, 1.33, kz + 0.95, 'glass');
    for (let i = 0; i < 7; i++) bx(x - 8.6 + i * 2, 0.95, kz + 0.25, x - 7.2 + i * 2, 1.02, kz + 0.75, 'chrome');
    for (const px of [x - 9, x + 5]) bx(px - 0.03, 0.95, kz + 0.85, px + 0.03, 1.33, kz + 0.9, 'chrome');
    // the hall: four rows of mess tables
    for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) messTable(K, x - 15 + i * 6, z + 0.5 + j * 2.9, 0);
    for (let i = 0; i < 5; i++) strip(K, x - 16 + i * 8, 4.38, z + 3, 0, 1.6);
    sign(K, x - 12, 2.4, kz + 0.17, 0, 'sMenu', 1.6, 0.7); note('menu', x - 12, kz + 0.4, 1.1);
    // the kitchen (north of the line): stoves, steam kettles, prep tables, the walk-in, dry stores
    const kz0 = z - d / 2 + 0.15;
    for (let i = 0; i < 4; i++) { const px = x - 14 + i * 2.2; bs(px - 1, 0, kz0, px + 1, 0.92, kz0 + 0.95, 'pSteel', 'metal'); bx(px - 0.95, 0.92, kz0 + 0.05, px + 0.95, 0.95, kz0 + 0.9, 'black'); }
    bx(x - 15.2, 2.2, kz0, x - 4.4, 2.9, kz0 + 1.2, 'pSteel');   // the hood
    for (const px of [x - 1.5, x + 1]) { K.xadd(G.pipe, MAT.pSteel, K.mat4(px, 0.3, kz0 + 1.2, 0, 0.6, 0.7, 0.6)); K.solid(px, kz0 + 1.2, 0.6, 0.6, 0, 1.0, 'metal'); }
    for (const px of [x - 10, x - 3]) { bs(px - 1.4, 0.85, z - 7, px + 1.4, 0.9, z - 6, 'pSteel', 'metal', { vault: true }); bx(px - 1.35, 0, z - 6.95, px + 1.35, 0.15, z - 6.05, 'pSteel'); }
    loot('kitchen', x - 10, z - 6.5, 0.9, 'Prep table', 0, H, { fixed: [['knife', 1]] });
    loot('kitchen2', x - 3, z - 6.5, 0.9, 'Prep table drawers', 0, H);
    loot('kitchen', x - 12, kz0 + 0.5, 0.95, 'Range cupboards', Math.PI, H);
    // walk-in cooler (a little room of its own) and the dry store shelves
    K.room(x + 13.5, z - 8.2, 5.6, 6.2, 0, { h: 2.7, t: 0.15, mat: 'pSteel', inMat: 'pSteel', floor: 'pTread', roof: 'flat', parapet: false, name: 'walk-in cooler', home: false, doors: [{ side: 'w', at: 1.5, w: 0.95, col: 0xc8ccd0 }] });
    loot('fridge', x + 15.6, z - 8.2, 1.0, 'Walk-in cooler shelves', -Math.PI / 2);
    bs(x + 15.6, 0, z - 10.6, x + 16.2, 2.0, z - 5.8, 'shelfMetal', 'metal');
    for (const px of [x + 5, x + 8]) { bs(px - 0.3, 0, z - 11.6, px + 0.3, 2.1, z - 8.5, 'shelfMetal', 'metal'); loot('pantry', px + 0.45, z - 10, 1.0, 'Dry stores', -Math.PI / 2, H); for (let s2 = 0; s2 < 4; s2++) bx(px - 0.28, 0.3 + s2 * 0.5, z - 11.5, px + 0.28, 0.5 + s2 * 0.5, z - 8.6, s2 % 2 ? 'pCopper' : 'cabinet'); }
    // out back: the dumpsters and a pallet stack — the way onto the roof
    const rz = z - d / 2 - 1.3;
    bs(x + 10, 0, rz - 0.9, x + 12.2, 1.35, rz + 0.9, 'greenPaint', 'metal'); K.deck(x + 11.1, rz, 1.1, 0.9, 0, 1.35, { draw: false, climb: true });
    loot('bin', x + 11.1, rz + 1.0, 1.2, 'Kitchen dumpster', Math.PI);
    bs(x + 12.4, 0, rz - 1.0, x + 14.0, 3.0, rz + 0.6, 'plank', 'wood'); K.deck(x + 13.2, rz - 0.2, 0.8, 0.8, 0, 3.0, { draw: false, climb: true });
    K.deck(x, z, w / 2, d / 2, 0, 4.62, { draw: false, climb: true });
  }
  // ---- INFIRMARY (patient zero) ----
  {
    const { x, z, w, d } = BLD.infirmary;
    const H = K.room(x, z, w, d, 0, { h: 3.6, t: 0.3, mat: 'pCinderOut', inMat: 'pCinderB', floor: 'pFloorW', ceilMat: 'ceilTile', name: 'Infirmary', home: false,
      doors: [{ side: 'n', at: 0, w: 1.6, glassDoor: true }, { side: 'w', at: 6, w: 1.0, col: 0x4a5560 }],
      windows: [-12, -6, 6, 12].map(a => ({ side: 'n', at: a, w: 1.6, sill: 1.0, top: 2.3, glassMat: 'frosted' })) });
    sign(K, x, 2.6, z + d / 2 + 0.17, 0, 'sInf', 3.2, 1.2);
    // a corridor wall across the middle (z −79): the ward north of it, offices and the pharmacy south
    K.wall(x - w / 2 + 0.15, z - 1, x + w / 2 - 0.15, z - 1, { h: 3.6, t: 0.2, mat: 'pCinderB', inMat: 'pCinderB', capMat: 'pCinderB', openings: [{ at: -8, w: 1.6, top: 2.3 }, { at: 0, w: 1.0, door: true, col: 0xd8dcd8 }, { at: 9, w: 1.0, door: true, col: 0xd8dcd8 }, { at: 2.6, w: 2.0, sill: 1.0, top: 2.2, glass: true }] });
    // the ward: eight beds along the north wall with curtain rails between them
    for (let i = 0; i < 8; i++) {
      const bxx = x - 13 + i * 3.6; hospitalBed(K, bxx, z - d / 2 + 1.5, Math.PI / 2, i === 0);
      bx(bxx + 1.7, 2.55, z - d / 2 + 0.3, bxx + 1.74, 2.6, z - d / 2 + 2.9, 'chrome');
      if (i % 3 === 1) bx(bxx + 1.69, 0.3, z - d / 2 + 0.3, bxx + 1.75, 2.55, z - d / 2 + 1.6, 'pWool');
      if (i % 2) loot('medicine', bxx + 1.2, z - d / 2 + 0.5, 0.75, 'Bedside cabinet', 0, H);
    }
    // patient zero's bed: the cuffs are still locked to the rail
    bx(x - 13.5, 0.8, z - d / 2 + 2.0, x - 13.3, 0.86, z - d / 2 + 2.05, 'chrome');
    note('transfer', x - 11.5, z - d / 2 + 2.6, 0.9);
    // the nurses' station
    bs(x - 2, 0, z - 4, x + 2, 1.05, z - 3.3, 'cabinet', 'wood', { vault: true }); bx(x - 2.05, 1.05, z - 4.05, x + 2.05, 1.1, z - 3.25, 'counter');
    loot('pharmacy', x, z - 3.7, 1.0, 'Nurses\' station drug drawer', Math.PI, H);
    // south side: Dr. Hale's office (the red keycard), the pharmacy, the exam room
    K.wall(x - 4, z - 0.9, x - 4, z + d / 2 - 0.15, { h: 3.6, t: 0.2, mat: 'pCinderB', inMat: 'pCinderB', capMat: 'pCinderB' });
    K.wall(x + 5, z - 0.9, x + 5, z + d / 2 - 0.15, { h: 3.6, t: 0.2, mat: 'pCinderB', inMat: 'pCinderB', capMat: 'pCinderB' });
    desk(K, x + 9, z + 7, Math.PI);
    loot('cabinet', x + 9, z + 6.6, 0.75, 'Dr. Hale\'s desk', 0, H, { fixed: fixed(['keycardRed', 1], ['pills', 1]) });
    note('hale', x + 9.5, z + 6.7, 0.78);
    lockers(K, x + 13, z + 10.5, Math.PI, 3);
    // pharmacy: shelving, a locked med cart
    for (const px of [x - 13, x - 10, x - 7]) { bs(px - 0.3, 0, z + 2, px + 0.3, 2.1, z + 9, 'shelfMetal', 'metal'); for (let s2 = 0; s2 < 4; s2++) bx(px - 0.28, 0.4 + s2 * 0.45, z + 2.2, px + 0.28, 0.55 + s2 * 0.45, z + 8.8, s2 % 2 ? 'white' : 'pCinderB'); loot('pharmacy', px + 0.5, z + 5.5, 1.0, 'Pharmacy shelf', -Math.PI / 2, H); }
    loot('medicine', x - 11.5, z + 10.5, 0.9, 'Medication cart', 0, H, { fixed: [['bandage', 2]] });
    // exam room: the table, a lamp, a sink
    bs(x - 1.2, 0, z + 5, x + 1.2, 0.85, z + 5.8, 'pSteel', 'metal', { vault: true }); bx(x - 1.15, 0.85, z + 5.05, x + 1.15, 0.95, z + 5.75, 'pMat');
    loot('medicine', x + 3.5, z + 10.8, 1.0, 'Exam room cupboard', Math.PI, H);
    for (let i = 0; i < 4; i++) strip(K, x - 12 + i * 8, 3.58, z - 6, 0, 1.4);
    K.light(x - 6, 3.3, z - 7, 0xd8f0ff, 5, 14);
  }
  // ---- VOCATIONAL SHOP ----
  {
    const { x, z, w, d } = BLD.shop;
    const H = K.room(x, z, w, d, 0, { h: 5.4, t: 0.3, mat: 'pCinderOut', inMat: 'pCinder', floor: 'pFloor', name: 'Vocational Shop', home: false,
      doors: [{ side: 'n', at: -6, w: 4.2, door: false, top: 4.0 }, { side: 'n', at: 6, w: 1.0, col: 0x4a5560 }],
      windows: [-10, 0, 10].map(a => ({ side: 's', at: a, w: 2.2, sill: 2.6, top: 4.2 })) });
    sign(K, x - 6, 3.0, z + d / 2 + 0.17, 0, 'sWork', 3.2, 1.2);
    // the roll-up door, rolled up
    bx(x + 3.8, 4.0, z + d / 2 - 0.35, x + 8.2, 4.6, z + d / 2 - 0.15, 'corr' in MAT ? 'corr' : 'pBars');
    for (const [wx2, wz2] of [[x - 8, z - 4], [x - 2, z - 4], [x + 4, z - 4], [x - 8, z + 2], [x - 2, z + 2], [x + 4, z + 2]]) workbench(K, wx2, wz2, 0);
    loot('shed', x - 2, z - 3.6, 0.95, 'Workbench tool drawer', 0, H); loot('shed', x + 4, z + 2.4, 0.95, 'Workbench tool drawer', 0, H);
    // a lathe, a drill press, racks of steel stock, a lumber pile you can climb
    bs(x - 12, 0, z + 8, x - 8.5, 1.25, z + 9.2, 'greenPaint', 'metal'); bx(x - 11.6, 1.25, z + 8.3, x - 10.6, 1.6, z + 8.9, 'greenPaint');
    bs(x - 7.6, 0, z + 8.3, x - 6.9, 1.8, z + 9.0, 'greenPaint', 'metal');
    for (let i = 0; i < 3; i++) { bs(x - 14.4, 0, z - 10 + i * 3.4, x - 13.6, 2.8, z - 7.6 + i * 3.4, 'darkMetal', 'metal'); for (let s2 = 0; s2 < 5; s2++) K.wbeam([x - 14.3, 0.5 + s2 * 0.5, z - 9.9 + i * 3.4], [x - 13.7, 0.5 + s2 * 0.5, z - 7.7 + i * 3.4], 0.05, 0.05, MAT.metal); }
    bs(x + 9, 0, z + 5, x + 13, 1.2, z + 8, 'plank', 'wood'); K.deck(x + 11, z + 6.5, 2, 1.5, 0, 1.2, { draw: false, climb: true });
    bs(x + 10, 1.2, z + 6, x + 12.5, 2.3, z + 7.8, 'plank', 'wood'); K.deck(x + 11.25, z + 6.9, 1.25, 0.9, 0, 2.3, { draw: false, climb: true });
    // the tool crib: a caged office (green card spare, the inventory)
    const cz2 = z - d / 2 + 3;
    fence(x + 6, z - d / 2 + 0.2, x + 6, cz2 + 2.5, 3.0, false); fence(x + 6, cz2 + 2.5, x + 14.7, cz2 + 2.5, 3.0, false);
    gate(x + 9, cz2 + 2.5, 0, 1.4, 2.4, 'keycardGreen', 'tool crib');
    desk(K, x + 12, cz2 + 0.2, 0);
    loot('garage', x + 12, cz2 + 0.6, 0.75, 'Tool crib desk', Math.PI, H, { fixed: fixed(['keycardGreen', 1], ['crowbar', 1]) });
    loot('shed', x + 7.5, cz2 - 1.5, 1.0, 'Tool crib shelves', 0, H, { fixed: [['axe', 1]] });
    bs(x + 6.3, 0, cz2 - 2.6, x + 9, 2.2, cz2 - 2.1, 'pegboard', 'wood');
    for (let i = 0; i < 4; i++) strip(K, x - 10 + i * 6.5, 5.38, z, 0, 1.6);
  }

  // ================================================================ ADMINISTRATION (two floors)
  let HAd = null;
  {
    const { x, z, w, d } = BLD.admin, UY = 3.8;
    const win = (side, at, up) => ({ side, at, w: 1.6, sill: up ? UY + 1.0 : 1.0, top: up ? UY + 2.6 : 2.4 });
    const wins = [];
    for (const a of [-17, -11, 11, 17]) for (const up of [false, true]) wins.push(win('s', a, up), win('n', a, up));
    for (const a of [-5, 5]) wins.push(win('e', a, true), win('w', a, true), win('e', a, false), win('w', a, false));
    wins.push(win('s', -4, true), win('s', 4, true));
    HAd = K.room(x, z, w, d, 0, { h: 7.6, t: 0.3, mat: 'brick', inMat: 'paint3', floor: 'floorTile', name: 'Administration', home: false,
      doors: [{ side: 'n', at: 0, w: 1.6, glassDoor: true }, { side: 's', at: 0, w: 1.1, col: 0x4a5560, hp: 900 }], windows: wins });
    sign(K, x, 2.7, z + d / 2 + 0.17, 0, 'sAdmin', 4.2, 1.2);   // on the public (south) face, over the glass doors
    // the upper floor: a slab with the stairwell cut out, walkable
    const ix0 = x - w / 2 + 0.15, ix1 = x + w / 2 - 0.15, iz0 = z - d / 2 + 0.15, iz1 = z + d / 2 - 0.15;
    const hole = { x0: x + 4.05, x1: x + 5.55, z0: z - 2.6, z1: z + 3.8 };
    for (const [a, b, c2, dd] of [[ix0, iz0, hole.x0, iz1], [hole.x1, iz0, ix1, iz1], [hole.x0, iz0, hole.x1, hole.z0], [hole.x0, hole.z1, hole.x1, iz1]]) {
      bx(a, UY - 0.25, b, c2, UY, dd, f => f === 'top' ? 'floorCarpet2' : f === 'bot' ? 'ceilTile' : 'trim');
      K.deck((a + c2) / 2, (b + dd) / 2, (c2 - a) / 2, (dd - b) / 2, 0, UY, { draw: false });
    }
    flight(x + 4.8, z + 0.6, 0, 1.4, 6.4, 0, UY, 'concrete', { open: false });
    railing(hole.x0, hole.z0, hole.x0, hole.z1, UY, false); railing(hole.x1, hole.z0, hole.x1, hole.z1, UY, false); railing(hole.x0, hole.z0, hole.x1, hole.z0, UY, false);
    // ground floor partitions: the visiting room (west), Control (east)
    K.wall(x - 6, iz0, x - 6, iz1, { h: UY - 0.25, t: 0.2, mat: 'paint3', inMat: 'paint1', capMat: 'paint3', openings: [{ at: 0, w: 1.0, door: true, col: 0x6a4a32 }] });
    K.wall(x + 6, iz0, x + 6, iz1, { h: UY - 0.25, t: 0.2, mat: 'paint2', inMat: 'paint3', capMat: 'paint3', openings: [{ at: 5, w: 0.95, door: true, col: 0x4a5560, hp: 900 }, { at: -3, w: 3.0, sill: 1.0, top: 2.3, glass: true }] });
    // upper floor partitions (empty doorways — upstairs doors stand open)
    K.wall(x - 6, iz0, x - 6, iz1, { y0: UY, h: 7.6 - UY, t: 0.2, mat: 'paint3', inMat: 'paint4', capMat: 'paint3', openings: [{ at: 5, w: 1.1 }] });
    K.wall(x + 6, iz0, x + 6, iz1, { y0: UY, h: 7.6 - UY, t: 0.2, mat: 'paint5', inMat: 'paint3', capMat: 'paint3', openings: [{ at: 7, w: 1.1 }] });
    // ---- lobby: the metal detector, the x-ray belt, the front counter, benches, flags, the sign ----
    bs(x - 1.4, 0, z + 3.7, x - 1.1, 2.3, z + 4.3, 'appliance', 'metal'); bs(x + 1.1, 0, z + 3.7, x + 1.4, 2.3, z + 4.3, 'appliance', 'metal'); bx(x - 1.4, 2.3, z + 3.7, x + 1.4, 2.5, z + 4.3, 'appliance');
    bs(x - 4.8, 0, z + 5.0, x - 2.2, 1.0, z + 5.7, 'appliance', 'metal', { vault: true }); bx(x - 4.6, 1.0, z + 5.1, x - 2.4, 1.05, z + 5.6, 'rubber');
    bs(x - 5.5, 0, z + 2.5, x - 1.5, 1.1, z + 3.2, 'cabinet', 'wood', { vault: true }); bx(x - 5.55, 1.1, z + 2.45, x - 1.45, 1.16, z + 3.25, 'counter');
    loot('register', x - 3.5, z + 2.9, 1.05, 'Front desk drawer', 0, HAd);
    sign(K, x, 2.6, z - d / 2 + 0.17, 0, 'sHost', 3.0, 1.0);
    for (const bz of [z - 2, z]) { bs(x - 5, 0, bz - 0.25, x - 3, 0.45, bz + 0.25, 'pWoodDesk', 'wood', { vault: true }); }
    // ---- visiting room: a glass partition with booths (stools, phones) and a few contact tables ----
    const vx = x - 14;
    for (let i = 0; i < 6; i++) { const bz = iz0 + 1.6 + i * 2.8; for (const sd of [-1, 1]) bx(vx + sd * 0.3, 0.95, bz - 1.38, vx + sd * 1.1, 2.3, bz - 1.32, 'paint3'); }
    const vz0 = iz0, vz1 = iz1 - 2.4, vzc = (vz0 + vz1) / 2, vh = (vz1 - vz0) / 2;   // (open at the north end: the inmates' side door)
    K.box(vx, 0, vzc, 0.3, 0.9, vh, 0, 'cabinet'); K.box(vx, 0.9, vzc, 0.32, 0.95, vh, 0, 'counter');
    K.box(vx, 0.95, vzc, 0.012, 2.3, vh, 0, f => f === 'px' || f === 'nx' ? 'glass' : null);
    so(vx - 0.3, vz0, vx + 0.3, vz1, 2.4, 'glass', 0, { window: true });
    for (let i = 0; i < 5; i++) { const bz = iz0 + 1.6 + i * 2.8; for (const sd of [-1, 1]) { K.xadd(G.pipe, MAT.pSteel, K.mat4(vx + sd * 0.8, 0, bz, 0, 0.2, 0.46, 0.2)); bx(vx + sd * 0.33, 1.2, bz - 0.06, vx + sd * 0.36, 1.45, bz + 0.06, 'black'); } }
    for (const [tx, tz] of [[x - 9, z - 5], [x - 9, z + 1], [x - 9, z + 6]]) messTable(K, tx, tz, 0);
    loot('cooler', x - 21.2, z + 7.5, 1.0, 'Vending machine', Math.PI / 2, HAd); bs(x - 21.85, 0, z + 6.9, x - 20.9, 1.9, z + 8.1, 'redPaint', 'metal');
    loot('cooler', x - 21.2, z + 5.8, 1.0, 'Snack machine', Math.PI / 2, HAd, { fixed: [['chips', 1]] }); bs(x - 21.85, 0, z + 5.2, x - 20.9, 1.9, z + 6.4, 'bluePaint', 'metal');
    note('visit', x - 9, z - 5, 0.8);
    // ---- Control: consoles under a wall of CCTV, the key board, the gun locker, Sgt. Okafor's desk ----
    bx(x + 21.6, 0.9, z - 7, x + 21.84, 2.9, z + 7, f => f === 'nx' ? 'pScreen' : 'black');
    bs(x + 19.6, 0, z - 7, x + 21.6, 0.95, z + 7, 'darkMetal', 'metal'); bx(x + 19.55, 0.95, z - 7.05, x + 21.65, 1.0, z + 7.05, 'black');
    for (let i = 0; i < 6; i++) bx(x + 20.6, 1.0, z - 6 + i * 2.4 - 0.4, x + 20.7, 1.45, z - 6 + i * 2.4 + 0.4, 'pScreen');
    desk(K, x + 12, z + 1, -Math.PI / 2);
    loot('cabinet', x + 11.6, z + 1, 0.75, 'Sgt. Okafor\'s desk', Math.PI / 2, HAd, { fixed: fixed(['keycardBlue', 1], ['battery', 2]) });
    note('okafor', x + 12.2, z + 1.5, 0.78);
    lockers(K, x + 9, z + d / 2 - 0.6, Math.PI, 5); loot('closet', x + 9, z + d / 2 - 1.0, 1.0, 'Staff lockers', Math.PI, HAd);
    bs(x + 15, 0, z + d / 2 - 0.9, x + 17, 2.0, z + d / 2 - 0.2, 'pCopper', 'metal');
    loot('police', x + 16, z + d / 2 - 1.2, 1.0, 'Control gun locker', Math.PI, HAd, { fixed: [['shotgun', 1], ['shells', 6]] });
    K.light(x + 16, 3.4, z, 0xe8f0ff, 5, 14);
    // ---- upstairs: the warden's office (east), records (west) ----
    const ox = x + 14, oz = z;
    bx(ox - 3, UY, oz - 2, ox + 3, UY + 0.01, oz + 3, 'rug0');
    bs(ox - 1.6, UY, oz + 1.2, ox + 1.6, UY + 0.78, oz + 2.2, 'darkWood', 'wood', { vault: true }); bx(ox - 1.65, UY + 0.78, oz + 1.15, ox + 1.65, UY + 0.82, oz + 2.25, 'darkWood');
    bx(ox + 0.4, UY + 0.82, oz + 1.6, ox + 0.85, UY + 0.98, oz + 1.95, 'darkMetal');   // the radio set
    bx(ox - 0.6, UY + 0.82, oz + 1.5, ox - 0.1, UY + 0.84, oz + 1.9, 'white');
    bx(ox - 0.35, UY, oz + 2.8, ox + 0.35, UY + 0.55, oz + 3.4, 'black'); bx(ox - 0.35, UY + 0.55, oz + 3.3, ox + 0.35, UY + 1.3, oz + 3.45, 'black');   // the big chair
    loot('nightstand', ox, oz + 1.6, 0.75, 'The warden\'s desk', Math.PI, HAd, { floorY: UY, fixed: fixed(['keycardGold', 1], ['pistol', 1], ['ammo9', 12]) });
    note('pruitt', ox - 0.4, oz + 1.7, UY + 0.84);
    bs(ox + 6.6, UY, oz + 7.2, ox + 7.6, UY + 1.2, oz + 8.2, 'darkMetal', 'metal');   // the safe
    loot('police', ox + 6.2, oz + 7.7, 0.6, 'The warden\'s safe', -Math.PI / 2, HAd, { floorY: UY, fixed: fixed(['sewerKey', 1], ['medkit', 1], ['ammo9', 10]) });
    note('wardenLog', ox + 0.6, oz + 1.8, UY + 0.98);
    for (const bz of [oz - 8.6, oz - 6.0]) { bs(ox - 6, UY, bz - 0.25, ox + 6, UY + 2.4, bz + 0.25, 'darkWood', 'wood'); for (let s2 = 0; s2 < 5; s2++) for (let b = 0; b < 14; b++) bx(ox - 5.8 + b * 0.82, UY + 0.1 + s2 * 0.46, bz - 0.22, ox - 5.2 + b * 0.82, UY + 0.42 + s2 * 0.46, bz + 0.22, 'book' + (b + s2) % 6); }
    bs(ox + 4, UY, oz - 3, ox + 6.5, UY + 0.45, oz - 1.8, 'fabric4', 'cloth', { vault: true }); bx(ox + 4, UY + 0.45, oz - 3, ox + 6.5, UY + 0.95, oz - 2.75, 'fabric4');
    K.xadd(G.pipe, MAT.chrome, K.mat4(ox - 3.6, UY, oz + 3.6, 0, 0.02, 2.3, 0.02)); bx(ox - 3.58, UY + 1.4, oz + 3.6, ox - 2.6, UY + 2.2, oz + 3.62, 'bluePaint');   // the flag
    // records: filing cabinets (searchable), a conference table
    for (let i = 0; i < 6; i++) { const fz = z - 8.8 + i * 1.0; bs(x - 21.8, UY, fz - 0.4, x - 21.2, UY + 1.35, fz + 0.4, 'shelfMetal', 'metal'); if (i % 2 === 0) loot('cabinet', x - 21, fz, 0.9, 'Filing cabinet', Math.PI / 2, HAd, { floorY: UY }); }
    bs(x - 16, UY, z - 1, x - 10, UY + 0.76, z + 1.4, 'darkWood', 'wood', { vault: true });
    for (let i = 0; i < 4; i++) { strip(K, x - 16 + i * 10, UY - 0.26, z - 4, 0, 1.4); strip(K, x - 16 + i * 10, 7.58, z + 4, 0, 1.4); }
  }

  // ================================================================ OUTSIDE: gatehouse, car park, helipad, river, woods
  {
    const { x, z, w, d } = BLD.gatehouse;
    const H = K.room(x, z, w, d, 0, { h: 3.2, t: 0.3, mat: 'brick', inMat: 'paint3', floor: 'floorTile', name: 'Gatehouse', home: false,
      doors: [{ side: 's', at: 0, w: 1.1, col: 0x4a5058 }, { side: 'n', at: 0, w: 1.4, glassDoor: true }], windows: [{ side: 'n', at: -3, w: 2, sill: 1, top: 2.3 }, { side: 'n', at: 3, w: 2, sill: 1, top: 2.3 }, { side: 'e', at: 0, w: 2.4, sill: 1, top: 2.3 }] });
    lockers(K, x - 4.5, z + 1, Math.PI / 2, 5); loot('closet', x - 4.1, z + 1, 1.0, 'Staff lockers', Math.PI / 2, H);
    bs(x + 2, 0, z - 1, x + 4.6, 1.05, z - 0.3, 'cabinet', 'wood', { vault: true }); loot('cabinet', x + 3.3, z - 0.6, 1.0, 'Sign-in desk', 0, H);
    for (let i = 0; i < 2; i++) { bx(x - 1.1 + i * 1.6, 0, z + 1.2, x - 0.9 + i * 1.6, 1.0, z + 1.6, 'chrome'); }
  }
  // cars in the staff lot (searchable), light poles
  const lot = [[-38, 119, 0, 3, 'suv'], [-20, 119, 0, 5, 'pickup'], [10, 119, 0, 6, 'sedan'], [-26, 149, Math.PI, 4, 'sedan'], [-32, 131, Math.PI, 0, 'sedan']];
  for (const [cx2, cz2, yaw, ci, ty] of lot) { try { K.car(cx2, cz2, yaw, ci, ty); } catch (e) { /* car kit unavailable: skip */ } }
  for (const [lx, lz] of [[-58, 134], [-30, 134], [0, 134], [28, 134], [52, 110], [52, 140]]) K.streetLamp(lx, lz, Math.PI / 2);
  for (const [lx, lz] of [[-90, -60], [-90, 0], [-90, 60], [90, -60], [90, 0], [90, 60], [-50, -92.4], [50, -92.4], [-50, 92.4], [50, 92.4]]) K.streetLamp(lx, lz, 0);
  // the warden's helipad: a raised concrete pad, edge lights, a windsock
  {
    const hx = SPOTS.helipad.x, hz = SPOTS.helipad.z;
    K.slab(hx - 12, hz - 12, hx + 12, hz + 12, 'drive', 'concrete');
    bx(hx - 9.2, 0.03, hz - 9.2, hx + 9.2, 0.06, hz + 9.2, 'concrete'); decal(K, hx, 0.065, hz, 18, 18, 0, 'pHeli');
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; K.xadd(G.ball, i % 3 ? MAT.pGreen : MAT.yellowPaint, K.mat4(hx + Math.cos(a) * 9.6, 0.1, hz + Math.sin(a) * 9.6, 0, 0.12, 0.08, 0.12)); }
    K.xadd(G.pipe, MAT.pRail, K.mat4(hx + 13, 0, hz - 10, 0, 0.05, 5, 0.05)); K.solid(hx + 13, hz - 10, 0.1, 0.1, 0, 5, 'metal');
    K.xadd(G.cone, MAT.orange, K.mat4(hx + 13.9, 4.9, hz - 10, 0, 0.3, 1.6, 0.3, 0, -Math.PI / 2));
    bs(hx + 10, 0, hz + 9, hx + 13, 2.6, hz + 12, 'pCinderOut', 'concrete');   // a fuel shed
    loot('garage', hx + 11.5, hz + 8.6, 1.0, 'Helipad fuel shed', 0);
  }
  // the river (west) and its bank; the outfall dock
  {
    K.water(-158, -150, -140, 158, 0.03);
    // the river is not a floor: deep water you can't walk out onto, except the low strip by the dock
    K.solid(-149.5, -115.6, 8.5, 34.4, 0, 1.6, 'water', -2, { window: true }); K.solid(-149.5, 39.6, 8.5, 118.4, 0, 1.6, 'water', -2, { window: true }); K.solid(-149.5, -80, 8.5, 1.2, 0, 0.3, 'water', -2);
    K.region(-140, -150, -132, 158, 'mud', 'grass', 0.8);
    for (let zz = -146; zz < 156; zz += 2.6) { if (Math.abs(zz + 80) < 4) continue; K.rock(-139.5 + R() * 1.2, zz + R(), 0.6 + R() * 0.7); }
    K.deck(-144.5, -80, 4.5, 1.1, 0, 0.42, { mat: 'plank', th: 0.12 });
    for (const px of [-148.6, -145, -141.4]) for (const pz of [-81, -79]) K.xadd(G.pipe, MAT.darkWood, K.mat4(px, -1, pz, 0, 0.12, 1.6, 0.12));
    K.solid(-149.1, -80, 0.05, 1.2, 0, 1.4, 'wood', 0.42);
  }
  // the woods, a water tower (a landmark you see from the yard), a few stumps and rocks
  {
    const out = (x, z) => x < -104 || x > 104 || z < -104 || z > 104;
    const clear = (x, z) => (x > -64 && x < 56 && z > 108 && z < 156) || (x > 64 && x < 98 && z > 114 && z < 146) || (x > 34 && x < 54 && z > 100) || (x < -132) || (Math.abs(z + 80) < 8 && x < -96) || (Math.abs(x) < 10 && z > 100 && z < 114);
    // three groves (trees are instanced per 40 m cell: a few dense woods cost far less than a scattered ring)
    for (const [gx, gz, gr, n] of [[-40, -132, 18, 70], [40, -134, 16, 60], [132, 20, 20, 70], [132, -120, 16, 40], [-122, 130, 14, 30], [128, 128, 12, 25]]) for (let i = 0; i < n; i++) {
      const a = R() * 6.283, d = Math.sqrt(R()) * gr, x = gx + Math.cos(a) * d * 1.3, z = gz + Math.sin(a) * d;
      if (!out(x, z) || clear(x, z) || (Math.abs(x) < 108 && Math.abs(z) < 108)) continue;
      if (R() < 0.65) K.pine(x, z, 0.8 + R() * 0.7); else K.tree(x, z, 0.8 + R() * 0.5, R() < 0.5 ? 0 : 1);
    }
    for (let i = 0; i < 40; i++) { const x = -156 + R() * 312, z = -148 + R() * 304; if (out(x, z) && !clear(x, z) && !(Math.abs(x) < 106 && Math.abs(z) < 106)) K.rock(x, z, 0.5 + R() * 1.2); }
    // the water tower
    const tx = 128, tz = -60;
    for (const [lx, lz] of [[-3, -3], [3, -3], [3, 3], [-3, 3]]) { K.xadd(G.pipe, MAT.pRail, K.mat4(tx + lx, 0, tz + lz, 0, 0.18, 18, 0.18)); K.solid(tx + lx, tz + lz, 0.25, 0.25, 0, 18, 'metal'); }
    for (const y of [5, 11]) for (const [a, b] of [[[-3, -3], [3, -3]], [[3, -3], [3, 3]], [[3, 3], [-3, 3]], [[-3, 3], [-3, -3]]]) K.wbeam([tx + a[0], y, tz + a[1]], [tx + b[0], y, tz + b[1]], 0.12, 0.12, MAT.pRail);
    K.xadd(G.pipe, MAT.white, K.mat4(tx, 18, tz, 0, 5, 6, 5)); K.xadd(G.cone, MAT.white, K.mat4(tx, 24, tz, 0, 5.3, 2.2, 5.3)); K.xadd(G.pipe, MAT.pRail, K.mat4(tx, 17.6, tz, 0, 5.3, 0.4, 5.3));
    K.chainFence(tx - 8, tz - 8, tx + 8, tz - 8); K.chainFence(tx + 8, tz - 8, tx + 8, tz + 8); K.chainFence(tx + 8, tz + 8, tx - 8, tz + 8);
  }

  // ================================================================ THE OUTBREAK (chaos: hidden on the calm morning)
  {
    const blood = (x, z, s = 1, y = 0.035) => decal(K, x, y + 0.002, z, 1.8 * s, 1.8 * s * (0.6 + R() * 0.5), R() * 6, 'pBlood');
    // the infirmary: blood everywhere, beds shoved over, a gurney in the doorway
    K.chaos(24, -78, () => {
      for (let i = 0; i < 14; i++) blood(10 + R() * 28, -89 + R() * 20, 0.6 + R() * 0.8);
      bx(23, 0.52, -65.7, 25.2, 0.6, -64.9, 'pSteel'); bx(23.05, 0.6, -65.65, 25.15, 0.72, -64.95, 'white'); for (const [lx, lz] of [[23.1, -65.6], [25.1, -65.6], [23.1, -65.0], [25.1, -65.0]]) { K.xadd(G.pipe, MAT.chrome, K.mat4(lx, 0.08, lz, 0, 0.025, 0.45, 0.025)); K.xadd(G.disc, MAT.rubber, K.mat4(lx, 0.04, lz, 0, 0.04, 0.04, 0.04)); }
      K.solid(24.1, -65.3, 1.1, 0.4, 0, 0.72, 'metal', 0, { vault: true });   // the gurney: legs, castors, a stained mattress
      loot('corpse', 30, -84, 0.3, 'Nurse Ames', 0); blood(30, -84, 1.4);
    }, 'infirmary');
    // ambulance at the infirmary door, doors open
    K.chaos(24, -58, () => { try { K.ambulance(24, -58, Math.PI / 2); } catch (e) { } blood(22, -62, 1.2); }, 'amb');
    // the yard: a burning mattress pile, bodies, a dropped tray, blood trails
    K.chaos(0, 30, () => {
      bs(-3, 0, 28, 1, 0.8, 31, 'pMat', 'cloth', { vault: true }); K.emitter({ x: -1, y: 0.8, z: 29.5, kind: 'fire', rate: 1 }); K.emitter({ x: -1, y: 2, z: 29.5, kind: 'smoke', rate: 1 }); K.hazard(-1, 29.5, 1.8, 'fire', 12);
      for (const [cx2, cz2] of [[-12, 24], [6, 40], [20, 15], [-25, 45]]) { blood(cx2, cz2, 1.2); loot('corpse', cx2, cz2, 0.3, 'Body in an orange jumpsuit', 0); }
      for (let i = 0; i < 10; i++) blood(-30 + R() * 60, 8 + R() * 50, 0.5 + R() * 0.6);
    }, 'yard');
    // the cell blocks: mattresses thrown down from the tier, blood on the bars, a table barricade on the upper walkway
    for (const B of [BLD.blockA, BLD.blockB]) K.chaos(B.x, B.z, () => {
      for (let i = 0; i < 8; i++) { const mx = B.x - 6 + R() * 12, mz = B.z - 30 + R() * 60; if (Math.abs(mx - B.x) < 3 && Math.abs(mz - B.z) < 3) continue; bx(mx - 0.4, 0.03, mz - 1, mx + 0.4, 0.14, mz + 1, 'pMat'); }
      for (let i = 0; i < 10; i++) blood(B.x - 9 + R() * 18, B.z - 34 + R() * 68, 0.5 + R() * 0.8);
      for (let i = 0; i < 4; i++) blood(B.x + (R() < 0.5 ? -11 : 11), B.z - 34 + R() * 68, 0.6, 3.43);
      loot('corpse', B.x + 6, B.z - 22, 0.3, 'A dead officer', 0, null, { fixed: [['ammo9', 6]] }); blood(B.x + 6, B.z - 22, 1.3);
    }, 'block' + B.x);
    // the gate: the county bus rammed into the sally port from outside, cruisers, a barricade line, burning cars
    K.chaos(44, 112, () => {
      const P = frame(44, 108, 0.12);
      const [bxx, bzz] = P(0, 0);
      K.box(bxx, 0.4, bzz, 1.3, 3.2, 6, 0.12, f => f === 'top' ? 'white' : 'white'); K.box(bxx, 1.7, bzz, 1.32, 2.4, 5.6, 0.12, f => f === 'px' || f === 'nx' ? 'glass' : null);
      K.box(bxx, 1.0, bzz, 1.33, 1.25, 5.9, 0.12, f => f === 'px' || f === 'nx' ? 'bluePaint' : null);
      { const [fx, fz] = P(0, -6.02); K.box(fx, 1.6, fz, 1.15, 2.9, 0.02, 0.12, f => f === 'nz' ? 'glass' : null); K.box(fx, 0.4, fz, 1.31, 1.0, 0.05, 0.12, 'darkMetal'); }
      { const [fx, fz] = P(0, 6.02); K.box(fx, 2.0, fz, 1.0, 2.9, 0.02, 0.12, f => f === 'pz' ? 'glass' : null); }
      for (let k2 = -4; k2 <= 4; k2 += 1.6) for (const sd of [-1, 1]) { const [fx, fz] = P(sd * 1.335, k2); K.box(fx, 1.75, fz, 0.012, 2.35, 0.5, 0.12, 'pBars'); }   // the window grilles
      { const [fx, fz] = P(0, -6.1); K.box(fx, 0.3, fz, 1.36, 0.62, 0.14, 0.12, 'darkMetal'); }   // the crumpled bumper
      for (const sd of [-1, 1]) { const [hx2, hz2] = P(sd * 0.95, -6.06); K.box(hx2, 0.75, hz2, 0.17, 0.89, 0.03, 0.12, sd < 0 ? 'pLight' : 'glass'); const [rx, rz] = P(sd * 0.95, -5.85); K.box(rx, 3.6, rz, 0.12, 3.68, 0.06, 0.12, 'orange'); }
      K.emitter({ x: bxx, y: 1.2, z: bzz - 6.4, kind: 'smoke', rate: 0.4 });
      for (const [lx, lz] of [[-1.15, -4.3], [1.15, -4.3], [-1.15, 3.8], [1.15, 3.8]]) { const [wx2, wz2] = P(lx, lz); K.xadd(G.disc, MAT.rubber, K.mat4(wx2, 0.5, wz2, 0.12, 0.3, 0.5, 0.5)); }
      K.solid(bxx, bzz, 1.3, 6, 0.12, 3.2, 'metal');
      loot('truck', ...P(1.6, 2), 1.0, 'County transport bus', 0, null, { fixed: [['bandage', 1]] });
      K.emitter({ x: bxx, y: 3.3, z: bzz - 4, kind: 'smoke', rate: 0.6 });
      try { K.policeCar(30, 106, 0.4); K.policeCar(56, 112, -0.6); } catch (e) { }
      try { K.wreck(-20, 131, 0.3, 2, true); K.wreck(14, 143, -1.2, 5, false, 0); } catch (e) { }
      for (const [bx2, bz2, yy] of [[-6, 113, 0], [6, 113, 0], [-14, 114, 0.2]]) { try { K.barricade(bx2, bz2, yy); } catch (e) { } }
      for (let i = 0; i < 6; i++) blood(30 + R() * 30, 104 + R() * 14, 0.8);
    }, 'gate');
    // tower 3: Reyes didn't make it either
    K.chaos(94, -94, () => { blood(94, -94, 1.1, 8.63); loot('corpse', 94.6, -93.4, 8.9, 'Officer Reyes', 0, null, { floorY: 8.6, fixed: fixed(['rifleAmmo', 4]) }); }, 'tower3');
    // the dining hall: tables are bolted down, but the trays went everywhere; the kitchen door's off
    K.chaos(-22, -78, () => { for (let i = 0; i < 30; i++) { const tx = -38 + R() * 32, tz = -76 + R() * 10; bx(tx - 0.22, 0.02, tz - 0.16, tx + 0.22, 0.04, tz + 0.16, 'pSteel'); } for (let i = 0; i < 8; i++) blood(-38 + R() * 32, -88 + R() * 20, 0.6); }, 'dining');
    // the sewer: something came this way
    K.chaos(-110, -80, () => { for (let i = 0; i < 5; i++) blood(-130 + R() * 40, -80 + (R() - 0.5) * 2, 0.4); loot('corpse', -118, -79.2, 0.3, 'A body in the tunnel', 0); }, 'sewer');
  }

  // ================================================================ zombies come from…
  const spawns = [];
  const sp = (x, z) => { spawns.push({ x, z }); };
  for (const [x, z] of [[20, -84], [28, -72], [15.5, -70], [36, -84]]) sp(x, z);                // the infirmary (where it starts)
  for (const B of [BLD.blockA, BLD.blockB]) for (const dz of [-30, -10, 10, 30]) sp(B.x + (dz > 0 ? 4 : -4), B.z + dz);
  for (const [x, z] of [[-20, 20], [20, 30], [0, 50], [-30, 55], [30, 8]]) sp(x, z);             // the yard
  for (const [x, z] of [[-22, -66.9], [-60, -72], [60, -72], [0, -32], [-90, 50], [90, 50], [-90, -40], [90, -40]]) sp(x, z);
  for (const [x, z] of [[-40, 130], [20, 128], [44, 150], [80, 145], [120, 100], [-120, 60], [-125, -120], [120, -130], [0, -140]]) sp(x, z);   // outside
  sp(-120, -80); sp(-130, -80);                                                                    // the sewer

  return {
    name: 'Blackwater Prison',
    start: { ...SPOTS.inmateStart },
    starts: { guard: { ...SPOTS.guardStart }, inmate: { ...SPOTS.inmateStart } },
    home: HB,
    lz: { x: SPOTS.outfall.x, z: SPOTS.outfall.z, yaw: -Math.PI / 2 },
    lzName: 'the river outfall',
    lz2: { x: SPOTS.helipad.x, z: SPOTS.helipad.z, yaw: 0, name: 'the warden\'s helipad' },
    spawns, bounds: K.W.bounds, preset: 'prison', ambient: 'prison',
    names: { lz: 'the river outfall', lz2: 'the warden\'s helipad', town: 'Blackwater State Penitentiary', store: 'the commissary' },
    notes, spots: SPOTS, gates: W.gates,
  };
}
export default buildMap;
