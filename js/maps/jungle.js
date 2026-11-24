// Zombie_Apocalypse — JUNGLE CAVE (map id 'jungle', "Rio Verde").
// A jungle valley on the north coast of an island. North (−z): a wall of mountain with a waterfall pouring out of
// it, and under it THE THROAT — a cave system (an entrance tunnel, the bat hall, the glowing underground lake, the
// Halvorsen team's cave lab, a back crawl that comes out by the ruins). Down the middle the river winds south to
// the sea: two rope bridges and a shallow ford cross it. West bank: the abandoned Halvorsen research camp (tents,
// huts on stilts, the lab hut, the generator, the radio mast) and the old ranger station. East bank: the ancient
// stone ruins (a stepped temple with a shrine on top, a plaza of pillars). South: the beach — the expedition's
// camp where you start, the harbour shack, and the dock where the RIO LENTO waits.
// Coordinates: metres, y up, ground y = 0 on the valley floor (K.terrain carves the river, raises the mountain and
// the ridges, slopes the beach into the sea).
import { jungleKit, jungleDecor, rng, smooth, clamp, lerp, fbm } from './jungle.kit.js';

// the river's centre line (x at a given z) — also used by the story / tests
export const RIVER_X = z => -25 + 22 * Math.sin((z + 95) * 0.022);
// the cave: rooms of rock (x0, z0, x1, z1, ceiling height, name). Sides in `open` are left open (the way out).
const CAVE = [
  { id: 'mouth', r: [41, -116, 49, -96], h: 4.4, open: ['n'] },
  { id: 'hall', r: [30, -138, 62, -116], h: 7.5 },
  { id: 'west', r: [8, -128.5, 30, -121.5], h: 3.8 },
  { id: 'lake', r: [-22, -143, 8, -110], h: 6.5 },
  { id: 'east', r: [62, -128.5, 80, -121.5], h: 3.8 },
  { id: 'lab', r: [80, -141, 106, -114], h: 5.2 },
  { id: 'crawl', r: [97.5, -114, 104.5, -96], h: 3.3, open: ['n'] },
];
const inRect = (r, x, z, m = 0) => x > r[0] - m && x < r[2] + m && z > r[1] - m && z < r[3] + m;
const caveMask = (x, z) => { let k = 0; for (const C of CAVE) { const r = C.r; const dx = Math.max(r[0] - x, 0, x - r[2]), dz = Math.max(r[1] - z, 0, z - r[3]); const d = Math.hypot(dx, dz); k = Math.max(k, 1 - smooth(0.6, 3.5, d)); } return k; };
// places that must stay flat (buildings, camps): the rolling ground fades out round them
const LZ = { x: 40.2, z: 139, yaw: 0 };   // on the dock, beside the boat (the story's ending.at; yaw 0: the boat comes in from the east and lies along the dock's east side)
const START = { x: 57, z: 97, yaw: Math.PI };

function heightAt(x, z) {
  const n = fbm(x * 0.035 + 11, z * 0.035 - 4);
  let h = 0;
  // the mountain wall across the north, with the cave dug into it
  const m = smooth(-97, -106, z + (n - 0.5) * 5) * (12 + n * 12) + smooth(-112, -150, z) * 12;
  // ridges east and west
  const rd = smooth(120, 140, Math.abs(x) + (n - 0.5) * 10) * (8 + n * 9);
  h = Math.max(m, rd);
  h *= 1 - caveMask(x, z);
  // the river channel (a shallow ford at z 94..106), the plunge pool under the waterfall
  if (z > -97 && z < 132) {
    const d = Math.abs(x - RIVER_X(z)), ford = 1 - smooth(4, 9, Math.abs(z - 100));
    h -= lerp(2.0, 0.75, ford) * (1 - smooth(4.2, 7.6, d));
  }
  { const d = Math.hypot(x + 25, (z + 92) * 1.25); h -= 2.2 * (1 - smooth(5.5, 9.5, d)); }
  // the beach slopes into the sea
  if (z > 111) h -= (z - 111) * 0.11;
  return h;
}

export function buildMap(K) {
  const { THREE } = K;
  K.bounds(-140, -146, 140, 152);
  K.preset('jungle');
  const J = jungleKit(K), M = J.M, G = J.G, W = K.W;
  K.TILE.rock ??= 4;
  const R = rng(20261122), rr = (a, b) => a + R() * (b - a);
  const mat4 = K.mat4;
  const P = (x, z, yaw) => { const c = Math.cos(yaw), s = Math.sin(yaw); return (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c]; };
  // ---- designed props (decor.js): camp cots, lab benches with glassware, shelves of supplies, footlockers ----
  const { D, JA } = jungleDecor(K);
  const glassM = K.MAT.glass || K.MAT.frosted;
  // a folding canvas cot: steel side rails, X legs, the sling, a sleeping bag and a pillow (hx across, hz along: local)
  const cot = (x, z, yaw, y0 = 0, bag = 'fabric2', hx = 0.38, hz = 0.95, label = 'Cot', kind = 'nightstand', solidIt = true) => {
    const Q = P(x, z, yaw), top = y0 + 0.42;
    for (const sx of [-1, 1]) { const [a, b] = Q(sx * hx, 0); K.box(a, top - 0.05, b, 0.02, top - 0.01, hz, yaw, 'jMetalDark'); }
    for (const lz of [-hz + 0.12, hz - 0.12]) for (const sx of [-1, 1]) { const [a0, b0] = Q(sx * hx, lz - 0.12), [a1, b1] = Q(-sx * hx, lz + 0.12); K.wbeam([a0, y0, b0], [a1, top - 0.04, b1], 0.02, 0.02, M.jMetalDark, false); }
    K.box(x, top - 0.04, z, hx - 0.01, top, hz - 0.02, yaw, 'jCanvasGreen');
    { const [a, b] = Q(0, -0.12); K.box(a, top, b, hx - 0.05, top + 0.08, hz - 0.2, yaw, bag); }
    { const [a, b] = Q(0, hz - 0.2); K.box(a, top, b, hx - 0.08, top + 0.1, 0.14, yaw, 'white'); }
    if (solidIt) K.solid(x, z, hx, hz, yaw, top, 'metal', y0, { vault: true });
    return Q;
  };
  // lab glassware along a bench top: beakers, flasks, a test-tube rack, a microscope, a sample tray
  const glassware = (x, z, yaw, y, len) => {
    const Q = P(x, z, yaw), Rg = rng(Math.round(x * 7 + z * 13));
    for (let lx = -len / 2 + 0.2; lx < len / 2 - 0.15; lx += 0.32) {
      const k = Rg(), [a, b] = Q(lx, (Rg() - 0.5) * 0.25);
      if (k < 0.3) { K.xadd(D.G.cylY, glassM, K.mat4(a, y, b, 0, 0.045, 0.12, 0.045), false); K.xadd(D.G.cylY, [K.MAT.greenPaint, K.MAT.yellowPaint, M.jCrystal || K.MAT.bluePaint][(Rg() * 3) | 0] || K.MAT.metal, K.mat4(a, y, b, 0, 0.04, 0.06, 0.04), false); }
      else if (k < 0.5) { K.xadd(D.G.sphere, glassM, K.mat4(a, y + 0.07, b, 0, 0.07, 0.07, 0.07), false); K.xadd(D.G.cylY, glassM, K.mat4(a, y + 0.12, b, 0, 0.018, 0.1, 0.018), false); }
      else if (k < 0.7) { K.box(a, y, b, 0.12, y + 0.06, 0.04, yaw, 'jMetalDark'); for (let t = 0; t < 5; t++) { const [c, d] = Q(lx - 0.09 + t * 0.045, 0); K.xadd(D.G.cylY, glassM, K.mat4(c, y + 0.02, d, 0, 0.008, 0.13, 0.008), false); } }
      else if (k < 0.85) { K.box(a, y, b, 0.08, y + 0.03, 0.1, yaw, 'black'); K.box(a, y + 0.03, b, 0.025, y + 0.3, 0.025, yaw, 'black'); K.xadd(D.G.cylY, K.MAT.white || K.MAT.metal, K.mat4(a, y + 0.18, b, 0, 0.03, 0.16, 0.03), false); }
      else { K.box(a, y, b, 0.14, y + 0.025, 0.1, yaw, 'white'); for (let t = 0; t < 4; t++) K.xadd(D.G.can, glassM, K.mat4(a - 0.09 + t * 0.06, y + 0.025, b, 0, 0.4, 0.5, 0.4), false); }
    }
  };
  // a lab bench: grey cupboards (designed fronts both sides), a black epoxy top, glassware
  const labBench = (x, z, yaw, len = 2.4, y0 = 0) => {
    const Q = P(x, z, yaw), n = Math.max(1, Math.round(len / 1.2));
    for (let i = 0; i < n; i++) { const [a, b] = Q(-len / 2 + len / n * (i + 0.5), 0); D.abox(JA, { pz: 'labBench', nz: 'labBench', side: 'olive', top: 'olive' }, a, y0, b, len / n / 2 - 0.003, y0 + 0.88, 0.36, yaw); }
    K.box(x, y0 + 0.88, z, len / 2 + 0.02, y0 + 0.92, 0.39, yaw, 'dzGranite');
    glassware(x, z, yaw, y0 + 0.92, len);
    return K.solid(x, z, len / 2, 0.38, yaw, y0 + 0.92, 'wood', y0);
  };
  const notes = [];
  // a prop box with its own picture on the front (local +z) face — the fridge, the cooler, the generator — and a
  // plain patch of the same texture (pr: u0, v0, u1, v1) on the other faces, so labels are never cut or repeated
  const propBox = (x, y0, z, hx, y1, hz, yaw, mat, surf = 'metal', pr = [0.02, 0.05, 0.1, 0.3], solidIt = true) => {
    const g = new THREE.BoxGeometry(hx * 2, y1 - y0, hz * 2).translate(0, (y1 - y0) / 2, 0), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) if ((i >> 2) !== 4) uv.setXY(i, lerp(pr[0], pr[2], uv.getX(i)), lerp(pr[1], pr[3], uv.getY(i)));
    K.xadd(g, mat, mat4(x, y0, z, yaw));
    return solidIt ? K.solid(x, z, hx, hz, yaw, y1, surf, y0) : null;
  };
  const T = heightAt;
  const tmesh = K.terrain(T, 2);
  // the mountain over the cave: walking uses the carved T (the rooms' floors are at 0), but the drawn ground stays
  // whole over the buried rooms, so no trench of sky shows over the Throat. Only the openings (where the mountain is
  // lower than the ceiling) leave a hole; the cliff-face rocks at the mouth and the crawl frame it.
  if (tmesh && tmesh.geometry && tmesh.geometry.index) {
    const g = tmesh.geometry, p = g.attributes.position, ox = tmesh.position.x, oz = tmesh.position.z, low = new Uint8Array(p.count);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + ox, z = p.getZ(i) + oz;
      if (!CAVE.some(D => inRect(D.r, x, z, 3.6))) continue;
      const h0 = heightAtNoCave(x, z), C = CAVE.find(D => inRect(D.r, x, z, 0.9));
      if (C) { if (h0 < C.h + 1.0) { low[i] = 1; continue; } p.setY(i, h0 - 0.006); }
      else p.setY(i, Math.max(p.getY(i), h0 - 0.006));
    }
    const ix = g.index.array, kept = [];
    for (let i = 0; i < ix.length; i += 3) {
      const a = ix[i], b = ix[i + 1], c3 = ix[i + 2];
      if ((low[a] || low[b] || low[c3]) && Math.max(p.getY(a), p.getY(b), p.getY(c3)) > 0.3) continue;
      kept.push(a, b, c3);
    }
    g.setIndex(kept); p.needsUpdate = true; g.computeVertexNormals(); g.computeBoundingSphere();
  }
  // no grass blades where the ground isn't the valley floor (the river, the beach, the slopes, the cave)
  // (and only a thin scatter in the deep shade under the big trees: CANOPY is a 4 m grid filled in once they're placed)
  const CANOPY = new Uint8Array(70 * 75), cIdx = (x, z) => { const i = Math.floor((x + 140) / 4), j = Math.floor((z + 146) / 4); return i < 0 || j < 0 || i >= 70 || j >= 75 ? -1 : j * 70 + i; };
  W.grassFn = (x, z) => { const h = T(x, z); if (Math.abs(h) > 0.06) return 0; for (const C of CAVE) if (inRect(C.r, x, z, 1)) return 0; const k = cIdx(x, z); return k >= 0 && CANOPY[k] ? 0.12 * (W.grassK ?? 1) : null; };

  // ================================================================ trails (where the trees don't grow)
  const TRAILS = [
    [[57, 100], [52, 80], [44, 56], [34, 30], [22, 6], [12, -20], [9, -38]],                  // beach camp → bridge N (east end)
    [[-16, -40], [-30, -38], [-48, -36], [-62, -34]],                                       // bridge N (west end) → research camp
    [[9, -38], [20, -55], [34, -78], [45, -96]],                                            // → the cave mouth
    [[22, 6], [44, -2], [66, -8], [86, -10]],                                               // → the ruins
    [[101, -96], [106, -60], [106, -30], [104, -8], [86, -10]],                                                    // the back crawl → the ruins
    [[44, 56], [20, 60], [-17, 60]],                                                        // → bridge S
    [[-44, 60], [-62, 62], [-80, 62]],                                                      // bridge S → ranger station
    [[-62, -34], [-74, 0], [-80, 30], [-80, 62]],                                           // camp ↔ ranger station
    [[52, 80], [20, 96], [-30, 100], [-58, 100], [-70, 98]],                                // beach trail → the ford → plane wreck
    [[57, 100], [45, 110], [40, 114]],                                                      // → the dock
    [[9, -38], [-4, -70], [-20, -86]],                                                      // → the waterfall
  ];
  const segD = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz), 0, 1); return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); };
  const trailD = (x, z) => { let d = 1e9; for (const L of TRAILS) for (let i = 0; i + 1 < L.length; i++) d = Math.min(d, segD(x, z, L[i], L[i + 1])); return d; };
  for (const L of TRAILS) for (let i = 0; i + 1 < L.length; i++) {
    const [a, b] = [L[i], L[i + 1]], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1.6);
    for (let k = 0; k <= n; k++) { const x = lerp(a[0], b[0], k / n), z = lerp(a[1], b[1], k / n); if (Math.abs(T(x, z)) < 0.05) K.paint(x + rr(-0.3, 0.3), z + rr(-0.3, 0.3), 1.7, 'dirt', 0.55); }
  }
  // the flat clearings: no big trees here
  const CLEAR = [[-100, -60, -50, -8], [66, -46, 118, 8], [36, 84, 80, 112], [14, 100, 50, 118], [-100, 44, -66, 76], [-84, 88, -56, 112], [28, -100, 60, -80], [88, -100, 112, -84]];
  const cleared = (x, z, m = 0) => CLEAR.some(r => inRect(r, x, z, m));
  const riverD = (x, z) => (z > -100 && z < 132) ? Math.abs(x - RIVER_X(z)) : 99;
  const free = (x, z, m = 3) => trailD(x, z) > m + 1.5 && !cleared(x, z, m) && riverD(x, z) > 8.5 + m * 0.5 && Math.hypot(x + 25, z + 92) > 12 && z > -93 && z < 106 && Math.abs(x) < 132;

  // ================================================================ the river, the waterfall, the sea
  {
    // a ribbon of water down the channel (one mesh), ripples drifting downstream
    // (four vertices across: a soft outer row each side fades to clear over the muddy bank — no hard ribbon edge)
    const pos = [], uv = [], col = [], idx = []; let v = 0, prev = null;
    for (let z = -96, i = 0; z <= 150; z += 2, i++) {
      const xc = RIVER_X(Math.min(z, 131)), dx = (RIVER_X(Math.min(z, 131) + 1) - xc), L = Math.hypot(dx, 1), nx = 1 / L, nz = -dx / L, wd = 6.6, wo = 8.4;
      if (prev) v += Math.hypot(xc - prev[0], z - prev[1]) / 8; prev = [xc, z];
      for (const [o, a] of [[-wo, 0], [-wd, 1], [wd, 1], [wo, 0]]) { pos.push(xc + nx * o, -0.55, z + nz * o); uv.push(1 + o / wo, v); col.push(1, 1, 1, a); }
      if (i) { const a = (i - 1) * 4; for (let q = 0; q < 3; q++) idx.push(a + q, a + 4 + q, a + 1 + q, a + 1 + q, a + 4 + q, a + 5 + q); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4)); g.setIndex(idx); g.computeVertexNormals();
    if (g.attributes.normal.getY(0) < 0) { for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]]; g.setIndex(idx); g.computeVertexNormals(); }
    const river = new THREE.Mesh(g, M.jRiver); river.receiveShadow = true; river.renderOrder = 1; K.level.add(river);
    // the plunge pool and the sea
    const poolM = M.jRiver.clone(); poolM.vertexColors = false;
    const pool = new THREE.Mesh(new THREE.CircleGeometry(9, 28).rotateX(-Math.PI / 2), poolM); pool.position.set(-25, -0.54, -92); pool.scale.set(1, 1, 0.82); pool.renderOrder = 1; K.level.add(pool);
    const seaMap = M.jSea.map; seaMap.repeat.set(40, 20); if (M.jSea.normalMap) M.jSea.normalMap.repeat.set(60, 30);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(700, 300).rotateX(-Math.PI / 2), M.jSea); sea.position.set(0, -0.56, 117 + 150); sea.renderOrder = 1; K.level.add(sea);
    W.waters.push({ x0: -350, z0: 117, x1: 350, z1: 420, y: -0.56, mesh: sea });
    // a strip of surf along the shoreline, washing in and out
    const foamM = M.jFoam, surf = new THREE.Mesh(new THREE.PlaneGeometry(300, 2.2, 1, 1).rotateX(-Math.PI / 2), foamM); surf.position.set(0, -0.535, 116.6); surf.renderOrder = 2; K.level.add(surf);
    foamM.map.repeat.set(30, 1);
    const fallCol = M.jFall.color, seaCol = M.jSea.color.clone(), rivCol = M.jRiver.color.clone();
    W.anims.push((dt, t) => {
      M.jRiver.map.offset.y = -t * 0.22; seaMap.offset.set(t * 0.004, t * 0.006); M.jFall.map.offset.y = t * 1.3;
      if (M.jRiver.normalMap) M.jRiver.normalMap.offset.y = -t * 0.3; if (M.jSea.normalMap) M.jSea.normalMap.offset.set(t * 0.006, t * 0.01);
      foamM.map.offset.x = t * 0.01; surf.position.z = 116.6 + Math.sin(t * 0.6) * 0.45; foamM.opacity = 0.75 + 0.25 * Math.sin(t * 0.6 + 1);
      // the water goes dark with the sky (no glowing white sheets at midnight)
      const d = W.daylight ?? 1, k = 0.25 + 0.75 * d; fallCol.setScalar(k); foamM.color.setScalar(0.3 + 0.7 * d);
      M.jSea.color.copy(seaCol).multiplyScalar(0.45 + 0.55 * d); M.jRiver.color.copy(rivCol).multiplyScalar(0.45 + 0.55 * d);
    });
    // deep water is a barrier: invisible boxes down the deep middle of the channel (the ford has none), the pool, the sea
    for (let z = -94; z < 128; z += 3) {
      if (Math.abs(z + 1.5 - 100) < 6.5) continue;
      const x0 = RIVER_X(z), x1 = RIVER_X(z + 3);
      K.solid((x0 + x1) / 2, z + 1.5, 5.4, 1.75, Math.atan2(x1 - x0, 3), 0.45, 'water', -3);
    }
    for (let z = 94; z < 107; z += 2) W.regions.push({ x0: RIVER_X(z) - 6, z0: z, x1: RIVER_X(z) + 6, z1: z + 2, kind: 'water', step: 'water' });
    K.solid(-25, -92, 6.2, 5.2, 0, 0.45, 'water', -3);
    // the sea is a barrier past the waterline (nobody walks out along the sea bed); the dock's strip stays open
    K.solid((-160 + 38.4) / 2, 134.3, (38.4 + 160) / 2, 17.7, 0, 0.45, 'water', -3);
    K.solid((41.6 + 160) / 2, 134.3, (160 - 41.6) / 2, 17.7, 0, 0.45, 'water', -3);
    for (let x = -140; x < 140; x += 10) K.region(x, 116, x + 10, 152, 'paved', 'water');
    // no grass along the river: muddy banks
    for (let z = -94; z < 130; z += 3) { const x = RIVER_X(z); K.paint(x - 7.5, z, 2.4, 'mud', 0.5); K.paint(x + 7.5, z, 2.4, 'mud', 0.5); }
    // the waterfall: a cliff face of rock, water sheeting down it, mist at the foot
    for (let i = 0; i < 7; i++) { const x = -40 + i * 5 + rr(-1, 1), z = -101.2 + rr(-0.6, 0.6), h = 13 + rr(-1.5, 2.5), yw = rr(-0.15, 0.15); K.block(x, -1, z, 3.0, h, 2.2, yw, 'rock', 'concrete'); }
    // four sheets of water (soft-edged), the main fall in front of a thinner one, two side ribbons; the texture's
    // own alpha fades their sides; a ring of churned foam where they hit the pool
    for (const [x0, w, y0, zo] of [[-25, 3.6, 13.2, 0], [-24.4, 2.6, 13.0, -0.35], [-21.5, 1.2, 12.5, 0.1], [-28.6, 1.0, 12.8, 0.05]]) {
      const fall = new THREE.Mesh(new THREE.PlaneGeometry(w * 2, y0 + 0.6, 1, 8), M.jFall);
      const p = fall.geometry.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setZ(i, Math.pow((y0 / 2 - y) / y0, 2) * 0.9); }
      fall.geometry.computeVertexNormals(); fall.position.set(x0, (y0 - 0.6) / 2 - 0.55, -98.6 + zo); fall.renderOrder = 3; K.level.add(fall);
    }
    { const ring = new THREE.Mesh(new THREE.RingGeometry(1.2, 5.2, 40, 1).rotateX(-Math.PI / 2), M.jFoam.clone()); ring.material.map = M.jFoam.map.clone(); ring.material.map.repeat.set(6, 1);
      const rp = ring.geometry.attributes.position, ru = ring.geometry.attributes.uv; for (let i = 0; i < rp.count; i++) { const x = rp.getX(i), z = rp.getZ(i), rr0 = Math.hypot(x, z); ru.setXY(i, Math.atan2(z, x) / Math.PI * 3, (rr0 - 1.2) / 4); }
      ring.position.set(-25, -0.52, -97.2); ring.scale.set(1.3, 1, 0.7); ring.renderOrder = 2; K.level.add(ring);
      W.anims.push((dt, t) => { ring.rotation.y = Math.sin(t * 0.3) * 0.05; ring.material.map.offset.x = t * 0.05; ring.material.color.setScalar(0.3 + 0.7 * (W.daylight ?? 1)); }); }
    for (const [x, z] of [[-25, -96.5], [-22, -96], [-28, -96.3]]) K.emitter({ x, y: -0.2, z, kind: 'smoke', rate: 2.5, t: 0 });
    for (let i = 0; i < 14; i++) { const a = R() * 6.28, d = rr(8, 11); K.rock(-25 + Math.cos(a) * d, -92 + Math.sin(a) * d * 0.8, rr(0.8, 2.2)); }
  }

  // ================================================================ the mountain wall and the cave
  // a barrier along the mountain's foot (gaps at the cave mouth and the back crawl), boulders in front of it
  for (let x = -140; x < 140; x += 8) {
    const a = x, b = x + 8;
    for (const [g0, g1] of [[40.5, 49.5], [97, 105]]) if (b > g0 && a < g1) { if (a < g0) K.solid((a + g0) / 2, -99, (g0 - a) / 2, 1.2, 0, 9, 'concrete'); if (b > g1) K.solid((g1 + b) / 2, -99, (b - g1) / 2, 1.2, 0, 9, 'concrete'); }
    if (!(b > 40.5 && a < 49.5) && !(b > 97 && a < 105)) K.solid((a + b) / 2, -99, 4, 1.2, 0, 9, 'concrete');
  }
  for (let x = -138; x < 138; x += rr(4, 7)) { if (Math.abs(x - 45) < 7 || Math.abs(x - 101) < 7 || Math.abs(x + 25) < 16) continue; K.rock(x, -97.6 + rr(-0.6, 0.6), rr(1.8, 3.6), { flat: 0.8 }); }
  const caveFloor = [];
  const caveSet = { houses: [] };
  CAVE.forEach((C, ci) => {
    const [x0, z0, x1, z1] = C.r, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, hx = (x1 - x0) / 2, hz = (z1 - z0) / 2;
    // the floor (wet rock), no grass, gravel underfoot
    K.box(cx, 0, cz, hx + 0.5, 0.03, hz + 0.5, 0, f => f === 'top' ? 'jCaveFloor' : null);
    K.region(x0, z0, x1, z1, 'paved', 'gravel');
    // the walls: irregular chunks of rock along each side, open where another chamber joins (or the way out)
    const sides = { s: [[x0, z0], [x1, z0], [0, -1]], n: [[x0, z1], [x1, z1], [0, 1]], w: [[x0, z0], [x0, z1], [-1, 0]], e: [[x1, z0], [x1, z1], [1, 0]] };
    for (const k of ['s', 'n', 'w', 'e']) {
      if ((C.open || []).includes(k)) continue;
      const [a, b, o] = sides[k], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / 2.4)), step = L / n;
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n, px = lerp(a[0], b[0], t), pz = lerp(a[1], b[1], t);
        if (CAVE.some((D, j) => j !== ci && inRect(D.r, px + o[0] * 1.2, pz + o[1] * 1.2))) continue;
        const j = R() * 0.8, th = 1.6 + R() * 1.4, yaw = (o[0] ? Math.PI / 2 : 0) + rr(-0.14, 0.14);
        const ccx = px + o[0] * (th / 2 - j), ccz = pz + o[1] * (th / 2 - j);
        K.block(ccx, 0, ccz, step / 2 + 0.5, C.h + 0.6, th / 2, yaw, 'jCave', 'concrete');
        if (R() < 0.7) K.rock(px - o[0] * (j + 0.3), pz - o[1] * (j + 0.3), rr(1.0, 2.4), { mat: 'jCave', flat: rr(0.6, 1.3) });
        if (C.h > 5 && R() < 0.6) K.xadd(K.GEO.blob, M.jCave, mat4(px - o[0] * j, rr(C.h * 0.4, C.h * 0.8), pz - o[1] * j, R() * 6, rr(1.2, 2.2), rr(1, 2), rr(1.2, 2.2)));
      }
    }
    // the ceiling: a slab of rock up to the mountain's surface (hidden from inside, it still keeps the sun out)
    // (a rock slab over the chamber; never past an open side, its edges the same dark rock as the walls)
    { const op = C.open || [], ex = 0.8, sx0 = x0 - (op.includes('w') ? 0 : ex), sx1 = x1 + (op.includes('e') ? 0 : ex), sz0 = z0 - (op.includes('s') ? 0 : ex), sz1 = z1 + (op.includes('n') ? 0 : ex);
      K.box((sx0 + sx1) / 2, C.h, (sz0 + sz1) / 2, (sx1 - sx0) / 2, C.h + 1.6, (sz1 - sz0) / 2, 0, f => f === 'top' ? 'rock' : 'jCave'); }
    // dripstones hanging from it (kept above head height in the tunnels)
    { const n = Math.round(hx * hz / 7);
      for (let i = 0; i < n; i++) { const x = rr(x0 + 0.8, x1 - 0.8), z = rr(z0 + 0.8, z1 - 0.8), L = rr(0.4, Math.min(2.6, Math.max(0.5, C.h - 2.4))), w = L * rr(0.18, 0.3); K.inst(G.stalac[i % 2], M.jCave, mat4(x, C.h + 0.05, z, R() * 6, w, L, w), false); } }
    const roof = K.sub(() => {});   // (nothing to hide: the cave's ceiling stays drawn from inside)
    const H = { id: 1000 + ci, x: cx, z: cz, yaw: 0, flip: 1, hw: hx, hd: hz, name: 'the cave', rooms: [[-hx, -hz, hx, hz, 'gravel']], kind: 'cave', wallH: C.h, doors: [], front: null, roof, inside: [[cx, cz]], store: true, cave: true };
    W.houses.push(H); caveSet.houses.push(H);
    // stalagmites standing up from the floor (the bigger ones are solid)
    const n = Math.round(hx * hz / 18);
    for (let i = 0; i < n; i++) {
      const x = rr(x0 + 1.5, x1 - 1.5), z = rr(z0 + 1.5, z1 - 1.5), L = rr(0.3, 2.2), w = L * rr(0.22, 0.35);
      if (C.id === 'mouth' || C.id === 'west' || C.id === 'east' || C.id === 'crawl') { if (Math.abs((C.id === 'west' || C.id === 'east' ? z - cz : x - cx)) < 1.6) continue; }
      if (C.id === 'lab' && x > 85) continue;
      if (C.id === 'lake' && Math.hypot((x + 7) / 10, (z + 130) / 7.5) < 1.15) continue;
      K.inst(G.stalag, M.jCave, mat4(x, 0, z, R() * 6, w, L, w));
      if (L > 0.9) K.solid(x, z, w * 0.32, w * 0.32, 0, L * 0.8, 'concrete', 0, L < 1.2 ? { vault: true } : {});
    }
  });
  // craggy boulder shapes for the cliff faces: a lumpy sphere, flattened into rough ledges (strata), faceted,
  // UVs projected from the side so the rock texture runs in horizontal bands
  const CRAG = [0, 1, 2, 3].map(k => {
    const g0 = new THREE.IcosahedronGeometry(1, 3), p = g0.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = fbm(v.x * 1.6 + k * 7.1, v.z * 1.6 + v.y * 1.3 - k * 3.3);
      let r = 0.78 + n * 0.45; v.multiplyScalar(r);
      v.y = Math.round(v.y * 4.5) / 4.5 * 0.55 + v.y * 0.45;      // ledges
      if (v.y < -0.4) v.y = -0.4 + (v.y + 0.4) * 0.4;
      p.setXYZ(i, v.x, v.y, v.z);
    }
    const g = g0.toNonIndexed(), q = g.attributes.position, uv = new Float32Array(q.count * 2);
    for (let i = 0; i < q.count; i++) { uv[i * 2] = (q.getX(i) + q.getZ(i)) * 0.5; uv[i * 2 + 1] = q.getY(i) * 0.5; }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.computeVertexNormals();
    return g;
  });
  const crag = (x, y, z, sx, sy, sz, mat) => K.xadd(CRAG[Math.floor(R() * 4)], mat, mat4(x, y, z, R() * 6, sx, sy, sz));
  function heightAtNoCave(x, z) { const n = fbm(x * 0.035 + 11, z * 0.035 - 4); return Math.max(smooth(-97, -106, z + (n - 0.5) * 5) * (12 + n * 12) + smooth(-112, -150, z) * 12, 0); }
  // the mouth: a ragged arch of boulders, vines over it, the team's warning sign and their cable of work lights
  {
    for (const [x, z, s] of [[40.2, -97.6, 3.2], [49.8, -97.4, 3.4], [39.5, -100, 2.4], [50.6, -100.4, 2.6], [44.2, -98.2, 1.2]]) if (s > 2) K.rock(x, z, s, { mat: 'jCave', flat: 1.1 });
    // the overhang: big lumps of rock piled over the opening (drawn only: they're above head height)
    for (const [x, y, z, sx, sy, sz] of [[42, 5.6, -96.6, 3.2, 1.8, 2.4], [47.5, 5.9, -96.8, 3.4, 2.0, 2.6], [45, 7.2, -98.5, 5.0, 2.4, 3.2], [40.5, 4.0, -97.5, 1.8, 2.6, 2.2], [49.6, 4.2, -97.4, 1.8, 2.8, 2.2], [45, 8.4, -102, 6.5, 3.0, 4.5]]) crag(x, y, z, sx, sy, sz, M.jCliff);
    for (let i = 0; i < 6; i++) K.xadd(G.vineCard, M.jVine, mat4(41.5 + i * 1.3, 4.3, -96.0, rr(-0.3, 0.3), 1, rr(2, 3.8), 1), false);
    // the cliff face: a rock wall rising out of the slope round the opening and running back into the hillside
    // (wet dark rock low down, paler weathered stone higher up; never inside the opening itself)
    const cliff = [[35, 2.5, -98.5, 3.2, 3.5, 2.6], [37.5, 6.5, -99.5, 3.6, 3.0, 2.8], [36, 10.5, -100.5, 4.5, 2.6, 3.2], [39.2, 2.0, -97.6, 2.0, 2.8, 1.9],
      [55, 2.6, -98.6, 3.0, 3.6, 2.6], [52.6, 6.8, -99.4, 3.8, 3.0, 2.9], [54.5, 10.8, -100.6, 4.8, 2.8, 3.4], [50.8, 2.2, -97.5, 2.0, 3.0, 1.9],
      [41.5, 9.6, -99.8, 4.2, 2.4, 3.0], [48.8, 9.9, -99.9, 4.4, 2.5, 3.0], [45, 12.2, -101.5, 6.0, 2.6, 3.6], [45, 6.2, -97.4, 5.6, 1.6, 2.0],
      [40.0, 13.5, -102.5, 5.0, 2.2, 3.5], [50.5, 13.8, -102.5, 5.2, 2.2, 3.5]];
    cliff.forEach(([x, y, z, sx, sy, sz], i) => crag(x, y, z, sx * rr(0.9, 1.1), sy * rr(0.9, 1.1), sz * rr(0.9, 1.1), i % 3 === 2 ? M.jStone2 || K.MAT.rock : K.MAT.rock));
    // roots and vines hanging over the lip, scree at the foot (off the path)
    for (let i = 0; i < 10; i++) K.xadd(G.vineCard, M.jVine, mat4(40.2 + i * 1.05 + rr(-0.3, 0.3), rr(5, 7), -95.5 - rr(0, 0.6), rr(-0.4, 0.4), rr(0.8, 1.2), rr(2.2, 4.2), 1), false);
    for (let i = 0; i < 14; i++) { const sd = i % 2 ? 1 : -1, x = 45 + sd * rr(4.2, 8.5), z = rr(-97.2, -94.6); K.rock(x, z, rr(0.3, 0.9), { mat: R() < 0.5 ? 'jCave' : 'jCaveWet' }); }
    const sg = K.std({ map: J.signTex(['DANGER', 'CAVE CLOSED', 'HALVORSEN EXPEDITION'], '#d8c020', '#111', 512, 256, 'bold 44px Helvetica'), roughness: 0.7, side: THREE.DoubleSide });
    // (on two posts, the board nailed to their front: clear of the boulders behind it, turned to face the path)
    K.mesh(new THREE.PlaneGeometry(1.3, 0.65), sg, 39.36, 1.45, -94.92, -0.18);
    K.inst(G.pole, M.jPole, mat4(38.8, 0, -95.2, 0, 1, 1.9, 1)); K.inst(G.pole, M.jPole, mat4(39.9, 0, -95.0, 0, 1, 1.9, 1));
    K.solid(39.35, -95.1, 0.7, 0.12, -0.18, 1.9, 'wood');
  }
  // the cable of work lights from the mouth to the lab (small glowing bulbs; only the lab has a real light)
  {
    const paths = [[[45, -98], [45, -114], [46, -120], [40, -124], [31, -125], [20, -125], [8, -125], [-2, -122]],
      [[33, -126], [50, -126], [62, -125], [72, -125], [80, -125], [86, -125], [92, -120], [101, -112], [101, -100]]];
    const bulbG = new THREE.SphereGeometry(0.06, 8, 6), cageG = new THREE.CylinderGeometry(0.09, 0.09, 0.17, 8, 1, true);
    const cageM = K.std({ color: 0x1a1a1a, roughness: 0.6, metalness: 0.5, wireframe: true });
    const cab = K.MAT.black || K.MAT.metal, roomAt = (x, z) => CAVE.find(C => inRect(C.r, x, z));
    const hang = (x, z) => { const C = roomAt(x, z); return C ? { y: Math.min(C.h - 0.35, 3.25), top: C.h } : { y: 3, top: 3.4 }; };
    for (const path of paths) for (let i = 0; i + 1 < path.length; i++) {
      const [a, b] = [path[i], path[i + 1]], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / 3.2));
      for (let k = 0; k < n; k++) {
        // one span between two hangers: the cable sags 0.35 m in the middle, the bulb hangs from the low point in a cage
        const p0 = [lerp(a[0], b[0], k / n), lerp(a[1], b[1], k / n)], p1 = [lerp(a[0], b[0], (k + 1) / n), lerp(a[1], b[1], (k + 1) / n)];
        const h0 = hang(...p0), h1 = hang(...p1), pts = [];
        for (let q = 0; q <= 3; q++) { const t = q / 3; pts.push([lerp(p0[0], p1[0], t), lerp(h0.y, h1.y, t) - 0.35 * Math.sin(t * Math.PI) * 1.155, lerp(p0[1], p1[1], t)]); }
        for (let q = 0; q < 3; q++) K.wbeam(pts[q], pts[q + 1], 0.03, 0.03, cab, false);
        // the hanger: a drop wire to the ceiling (the team bolted them into the rock)
        K.wbeam([p0[0], h0.y, p0[1]], [p0[0], h0.top + 0.05, p0[1]], 0.01, 0.01, cab, false);
        const mx = (p0[0] + p1[0]) / 2, mz = (p0[1] + p1[1]) / 2, my = (h0.y + h1.y) / 2 - 0.35;
        K.wbeam([mx, my, mz], [mx, my - 0.1, mz], 0.012, 0.012, cab, false);
        K.inst(bulbG, M.jLampOn, mat4(mx, my - 0.17, mz), false);
        K.xadd(cageG, cageM, mat4(mx, my - 0.17, mz), false);
      }
      const hb = hang(...b); K.wbeam([b[0], hb.y, b[1]], [b[0], hb.top + 0.05, b[1]], 0.01, 0.01, cab, false);
    }
  }
  // glowing mineral crystals (the radium-bearing calcite) — thickest round the lake
  for (let i = 0; i < 90; i++) {
    const C = CAVE[i % 3 === 0 ? 3 : i % 3 === 1 ? 1 : (R() < 0.5 ? 5 : 2)], [x0, z0, x1, z1] = C.r;
    const sd = Math.floor(R() * 4), t = R();
    const x = sd < 2 ? lerp(x0 + 1, x1 - 1, t) : sd === 2 ? x0 + 1.4 : x1 - 1.4, z = sd >= 2 ? lerp(z0 + 1, z1 - 1, t) : sd === 0 ? z0 + 1.4 : z1 - 1.4;
    if (C.id === 'hall' && Math.abs(x - 45) < 4 && z > -120) continue;
    K.inst(G.crystal, M.jCrystal, mat4(x, rr(0, 0.6), z, R() * 6, rr(0.7, 1.6), rr(0.7, 1.8), rr(0.7, 1.6)), false);
  }
  // the crystals' own glow: a few dim green lights (pulsing slowly) so the rock round them catches it
  {
    // (the world pools its point lights: only the nearest few are real at any time, so the cave can have several)
    const gl = [[-7, 0.6, -130, 40, 20], [-15, 0.8, -118, 25, 16], [46, 0.8, -130, 30, 18], [20, 0.6, -125, 25, 16], [70, 0.6, -125, 25, 16], [90, 0.4, -119, 25, 16]].map(([x, y, z, i, d]) => ({ l: K.light(x, y, z, 0x33ff77, i, d), base: i, ph: x * 0.1 }));
    // the work lights: warm pools under the cable every so often (the rest of the bulbs are just glow)
    for (const [x, z] of [[45, -106], [44, -120], [26, -125], [6, -124], [58, -126], [76, -125]]) { const C = CAVE.find(D => inRect(D.r, x, z)), y = C ? Math.min(C.h - 0.6, 3.0) : 3; const l = K.light(x, y, z, 0xffc880, 7, 10); gl.push({ l, base: 7, ph: x * 0.37, warm: true }); }
    W.anims.push((dt, t) => { for (const o of gl) o.l.intensity = o.base * (o.warm ? 0.92 + 0.05 * Math.sin(t * 40 + o.ph) : 0.85 + 0.15 * Math.sin(t * 0.7 + o.ph)); });
  }
  // the underground lake: still black-green water, glowing from below; a rim you can't step past
  {
    const lake = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), M.jLake); lake.position.set(-7, 0.045, -130); lake.scale.set(10, 1, 7.5); lake.renderOrder = 1; K.level.add(lake);
    for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2, x = -7 + Math.cos(a) * 9.2, z = -130 + Math.sin(a) * 6.8; K.solid(x, z, 1.9, 0.6, -a + Math.PI / 2, 0.5, 'water', -2); }
    K.solid(-7, -130, 8, 5.6, 0, 0.5, 'water', -2);
    for (let i = 0; i < 16; i++) { const a = R() * 6.28; K.rock(-7 + Math.cos(a) * 10.6, -130 + Math.sin(a) * 8.2, rr(0.5, 1.4), { mat: 'jCaveWet' }); }
    // an old rubber dinghy pulled up on the shore, the team's sample crates
    K.xadd(new THREE.TorusGeometry(0.7, 0.24, 8, 18).rotateX(Math.PI / 2).scale(1.6, 1, 1), K.std({ color: 0x9a3a1a, roughness: 0.6 }), mat4(-15.5, 0.24, -121.5, 0.6));
    K.solid(-15.5, -121.5, 1.5, 0.95, 0.6, 0.5, 'rubber', 0, { vault: true });
    K.container('atticCase', -12, -120.2, 0.4, 'Sample crate', 0);
    K.block(-12, 0, -120.2, 0.45, 0.42, 0.3, 0.1, 'darkWood', 'wood');
  }
  // the bat hall: bats roosting and circling (instanced, flapped by scaling)
  {
    const N = 40, bats = new THREE.InstancedMesh(G.bat, M.jBat, N); bats.frustumCulled = false; K.level.add(bats);
    const st = Array.from({ length: N }, () => ({ a: R() * 6.28, r: rr(3, 12), y: rr(4, 6.8), sp: rr(0.6, 1.4) * (R() < 0.5 ? -1 : 1), ph: R() * 6.28 }));
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
    W.anims.push((dt, t, f) => {
      if (Math.abs(f.x - 46) > 45 || Math.abs(f.z + 126) > 30) { if (bats.visible) bats.visible = false; return; }
      bats.visible = true;
      st.forEach((b, i) => { b.a += b.sp * dt * 0.6; const x = 46 + Math.cos(b.a) * b.r, z = -127 + Math.sin(b.a) * b.r * 0.6; p.set(x, b.y + Math.sin(t * 2 + b.ph) * 0.4, z); q.setFromEuler(e.set(0, -b.a + (b.sp > 0 ? 0 : Math.PI), 0)); const fl = 0.35 + Math.abs(Math.sin(t * 18 + b.ph)) * 0.9; s.set(fl * 1.3, 1, 1.3); m.compose(p, q, s); bats.setMatrixAt(i, m); });
      bats.instanceMatrix.needsUpdate = true;
    });
    for (let i = 0; i < 30; i++) K.paint(rr(32, 60), rr(-136, -118), 1.2, 'dark', 0.4);   // guano
    K.container('corpse', 52, -131, 0.2, 'Dead researcher', 0);
    notes.push({ x: 52, z: -131, y: 0.2, id: 'bat' });
    K.blood(52.3, -131.2, 1.1, 0.04);
    K.crateStack(57.5, -134.5, 0.3, 2);
  }
  // THE CAVE LAB: a partition wall with a barred door across the chamber; inside, benches, the steel sample case,
  // the radio, a generator, work lamps on stands, cots
  let radioSpot = null;
  {
    K.wall(86, -141, 86, -114, { h: 3.4, t: 0.25, mat: 'plank', inMat: 'plank', surf: 'wood', openings: [{ at: 2.5, w: 1.0, door: true, dir: 1, col: 0x5a4a3a, hp: 320 }] });
    // above the plank wall up to the rock: rough boards nailed up to close the gap (drawn only: out of reach)
    K.box(86, 3.4, -127.5, 0.1, 5.3, 13.5, 0, 'plank');
    K.region(86, -141, 106, -114, 'paved', 'wood');
    // rough pallet and board platforms under the work areas only; bare gravel and rock round them
    for (const [x, z, hx, hz] of [[96, -127, 3, 3], [100, -137.5, 5, 1.6], [103.6, -127, 1.4, 4.5], [90.8, -116.5, 3, 1.2]]) K.box(x, 0.03, z, hx, 0.12, hz, R() * 0.1 - 0.05, f => f === 'top' ? 'plank' : 'darkWood');
    // a tarp on the floor and cable runs from the generator to the lamp and the radio
    { const tp = new THREE.PlaneGeometry(2.6, 1.9, 6, 4).rotateX(-Math.PI / 2), tpp = tp.attributes.position; for (let i = 0; i < tpp.count; i++) tpp.setY(i, Math.abs(Math.sin(tpp.getX(i) * 3.1 + tpp.getZ(i) * 2.3)) * 0.04); tp.computeVertexNormals();
      K.xadd(tp, M.jTarp || M.jCanvasGreen, mat4(92.5, 0.05, -132, 0.4), false); }
    for (const pts of [[[90, -138.5], [93, -131], [96, -127]], [[90.4, -138.5], [99, -133], [104.3, -126]]]) for (let i = 0; i + 1 < pts.length; i++) K.wbeam([pts[i][0], 0.06, pts[i][1]], [pts[i + 1][0], 0.06, pts[i + 1][1]], 0.02, 0.02, K.MAT.black || K.MAT.metal, false);
    const bench = (x, z, yaw, len = 2.4) => labBench(x, z, yaw, len);
    bench(100, -138.5, 0); bench(95, -138.5, 0); bench(104.6, -130, Math.PI / 2); bench(104.6, -124, Math.PI / 2);
    // the radio on its bench: a steel set with dials, the handset, the aerial cable running up the crawl
    const rmat = K.std({ map: J.signTex(['◉  ◉  ◉', 'HF-150  TX/RX'], '#3a4038', '#c8d0b8', 256, 128, 'bold 26px Helvetica'), roughness: 0.5, metalness: 0.4 });
    K.xadd(new THREE.BoxGeometry(0.62, 0.36, 0.38), rmat, mat4(104.4, 1.1, -124, -Math.PI / 2));
    K.xadd(new THREE.BoxGeometry(0.1, 0.22, 0.06), K.MAT.black || K.MAT.metal, mat4(104.2, 1.05, -123.4, -Math.PI / 2));
    K.wbeam([104.6, 1.3, -124], [104.6, 3.5, -114.5], 0.02, 0.02, K.MAT.black || K.MAT.metal);
    radioSpot = { x: 103.8, z: -124 };
    K.container('cabinet', 103.8, -124, 1.0, 'Field radio', -Math.PI / 2, null, { radio: true });
    K.container('medicine', 95, -138.2, 1.0, 'Lab bench', 0); K.container('pharmacy', 100, -138.2, 1.0, 'Sample fridge', 0);
    K.container('atticCase', 104.2, -130, 1.0, 'Steel sample case', -Math.PI / 2, null, { fixed: [['flashlight', 1]] });
    notes.push({ x: 104.2, z: -130, y: 1.0, id: 'lab' });
    // the generator and drums
    propBox(90, 0, -139, 0.8, 0.9, 0.5, 0, M.jGen, 'metal', [0.0, 0.0, 0.06, 0.08]); K.container('garage', 90, -138.4, 0.5, 'Generator toolbox', 0);
    for (const [x, z] of [[88, -139.6], [88.7, -139.8]]) { K.xadd(G.drum, M.jDrumRust, mat4(x, 0, z, R())); }
    K.solid(88.35, -139.7, 0.75, 0.35, 0, 0.9, 'metal');
    // cots
    for (const [x, z] of [[89, -116.5], [92.5, -116.5]]) { cot(x, z, Math.PI / 2, 0.12, 'fabric1', 0.4, 0.95); K.container('nightstand', x, z, 0.45, 'Cot', 0); }
    for (const [x, z, yw] of [[100.5, -135.6, 0.1], [101.3, -135.4, -0.2]]) { D.abox(JA, { pz: 'crate', nz: 'crate', px: 'crate', nx: 'crate', top: 'crate' }, x, 0.12, z, 0.35, 0.62, 0.25, yw); K.solid(x, z, 0.35, 0.25, yw, 0.62, 'wood', 0, { vault: true }); }
    // a work lamp on a stand: the one real light down here (warm, buzzing)
    K.inst(G.pole, K.MAT.metal, mat4(96, 0, -127, 0, 0.4, 2.4, 0.4)); K.xadd(new THREE.SphereGeometry(0.16, 12, 8), M.jLampOn, mat4(96, 2.45, -127), false);
    const lab = K.light(96, 2.6, -127, 0xffd8a0, 10, 18);
    W.anims.push((dt, t) => { lab.intensity = 10 * (0.85 + 0.1 * Math.sin(t * 50) + (Math.sin(t * 3.1) > 0.97 ? -0.5 : 0)); });
    // bodies of the team (they were here before the morning: not in the chaos layer)
    for (const [x, z, id] of [[92.5, -133, 'corpse'], [99, -121, 'corpse']]) { K.container(id, x, z, 0.2, 'Dead researcher', 0); K.blood(x, z, 1.3, 0.12); }
    // barricade of crates in front of the lab door (on their side)
    K.crateStack(88, -128.2, 0.2, 2); K.crateStack(88.3, -121.8, -0.3, 1);
    // a glowing slick of the mineral where it leaked
    for (let i = 0; i < 6; i++) K.inst(G.crystal, M.jCrystal, mat4(rr(88, 92), 0.08, rr(-121, -117), R() * 6, 0.6, 0.5, 0.6), false);
  }
  // the back crawl comes out under the cliffs north of the ruins: a hatch of boards, half pulled away
  for (const [x, z, s] of [[96.5, -97.3, 3], [105.5, -97.6, 3.2]]) K.rock(x, z, s, { mat: 'jCave', flat: 1.1 });
  for (const [x, y, z, sx, sy, sz] of [[99, 4.6, -96.8, 3, 1.6, 2.2], [103.5, 4.8, -97, 3, 1.8, 2.2], [101, 6.4, -99, 5, 2.4, 3.4], [96.6, 1.7, -96.4, 1.9, 2.8, 1.5], [105.4, 1.7, -96.4, 1.9, 2.9, 1.5], [95.5, 4.6, -97.4, 2.6, 2.2, 2.0], [106.5, 4.8, -97.4, 2.6, 2.2, 2.0], [93.5, 2.2, -98.2, 2.4, 3.0, 2.2], [108.5, 2.4, -98.2, 2.4, 3.2, 2.2]]) crag(x, y, z, sx, sy, sz, K.MAT.rock);
  for (let i = 0; i < 7; i++) K.xadd(G.vineCard, M.jVine, mat4(98.4 + i * 0.9 + rr(-0.2, 0.2), rr(3.6, 4.4), -95.9, rr(-0.4, 0.4), 1, rr(1.6, 3), 1), false);

  // ================================================================ rope bridges (the dry ways over the river)
  // each: a log platform on either bank (stairs up), a sagging plank deck between, rope rails you can't fall past
  const bridges = [];
  function ropeBridge(zc, half = 11.5, yTop = 2.7, name = 'N') {
    const xc = RIVER_X(zc), xa = xc - half, xb = xc + half;
    for (const [x, sd] of [[xa, -1], [xb, 1]]) {
      // platform: 3.4 × 3.4 on four log posts, stairs down away from the river
      K.deck(x + sd * 1.0, zc, 1.7, 1.7, 0, yTop, { mat: 'plank', th: 0.2 });
      for (const [px, pz] of [[-1.55, -1.55], [1.55, -1.55], [-1.55, 1.55], [1.55, 1.55]]) { K.inst(G.pole, M.jPole, mat4(x + sd * 1.0 + px, 0, zc + pz, 0, 2.2, yTop + 1.4, 2.2)); K.solid(x + sd * 1.0 + px, zc + pz, 0.2, 0.2, 0, yTop + 1.4, 'wood'); }
      const px = x + sd * 1.0;
      for (const pz of [-1.6, 1.6]) { K.solid(px, zc + pz, 1.7, 0.06, 0, yTop + 1.05, 'wood', yTop + 0.05); K.wbeam([px - 1.6, yTop + 1.0, zc + pz], [px + 1.6, yTop + 1.0, zc + pz], 0.06, 0.06, M.jRope); }
      // the outer edge: rails either side of the stairs; the stairs run down away from the river
      for (const sz of [-1, 1]) K.solid(px + sd * 1.62, zc + sz * 1.2, 0.06, 0.45, 0, yTop + 1.05, 'wood', yTop + 0.05);
      K.stairs(px + sd * (1.7 + 2.4), zc, -sd * Math.PI / 2, 1.3, 4.8, 0, yTop, 'plank', { open: true, rails: false });
    }
    // the span: decks following the sag, planks drawn one by one, ropes as handrails and their solid rails
    const span = (xb - xa) - 0.2, n = 10, sag = 0.45;
    const yAt = t => yTop - sag * Math.sin(t * Math.PI);
    for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, x = lerp(xa + 0.1, xb - 0.1, t); K.deck(x, zc, span / n / 2 + 0.05, 0.65, 0, yAt(t), { draw: false }); }
    const nP = Math.round(span / 0.27);
    for (let i = 0; i < nP; i++) {
      const t = (i + 0.5) / nP, x = lerp(xa + 0.1, xb - 0.1, t), y = yAt(t), slope = Math.atan(-sag * Math.PI * Math.cos(t * Math.PI) / span);
      if (name === 'N' && (i === (nP >> 1) - 3 || i === (nP >> 1) + 2)) continue;   // the two rotten boards (Kofi's warning)
      K.inst(G.plank, M.jPole, mat4(x, y - 0.03, zc + rr(-0.03, 0.03), Math.PI / 2 + rr(-0.04, 0.04), 1.3, 1, 1, 0, slope));
    }
    for (const sd of [-1, 1]) {
      for (const yo of [0.0, 1.0]) {
        let prev = null;
        for (let k = 0; k <= 12; k++) { const t = k / 12, p = [lerp(xa, xb, t), yAt(t) + yo - (yo ? 0.1 * Math.sin(t * Math.PI) : 0.02), zc + sd * 0.68]; if (prev) K.wbeam(prev, p, 0.035, 0.035, M.jRope); prev = p; }
      }
      for (let k = 1; k < 12; k++) { const t = k / 12, x = lerp(xa, xb, t), y = yAt(t); K.wbeam([x, y, zc + sd * 0.68], [x, y + 0.95 - 0.1 * Math.sin(t * Math.PI), zc + sd * 0.68], 0.015, 0.015, M.jRope); }
      for (let i = 0; i < 6; i++) { const t = (i + 0.5) / 6, x = lerp(xa, xb, t); K.solid(x, zc + sd * 0.72, span / 12 + 0.05, 0.05, 0, yAt(t) + 1.0, 'wood', yAt(t) + 0.05); }
    }
    bridges.push({ zc, xa, xb, yTop, name });
  }
  ropeBridge(-40, 11.5, 2.7, 'N');
  ropeBridge(60, 11.5, 2.7, 'S');
  // a sign nailed to the north bridge's east post
  { const b = bridges[0]; const sg = K.std({ map: J.signTex(['MAX 2 PEOPLE', 'BOARDS 9 + 14 ROTTEN', '— K.'], '#b89a64', '#2a1a10', 256, 128, 'bold 22px Helvetica'), roughness: 0.8, side: THREE.DoubleSide }); K.mesh(new THREE.PlaneGeometry(0.7, 0.35), sg, b.xb + 1 + 1.55 + 0.23, b.yTop + 0.7, -40 - 1.55, Math.PI / 2); /* on the post's outer face, toward the trail */ notes.push({ x: b.xb + 2.2, z: -40.6, y: b.yTop + 0.5, id: 'bridge' }); K.container('bench', b.xb + 2.2, -40.6, b.yTop + 0.3, 'Kofi\'s pack', 0); }
  // the ford: stepping stones through the shallows
  for (let i = 0; i < 9; i++) { const z = 100 + rr(-3, 3), x = RIVER_X(z) - 6 + i * 1.5; K.rock(x, z, rr(0.5, 0.8), { flat: 0.6, solid: false }); }

  // ================================================================ the jungle: giant trees, palms, the understory
  const giant = (x, z, s = 1, v = Math.floor(R() * G.giant.length)) => {
    const y = T(x, z), ry = R() * 6.28, t = G.giant[v];
    K.inst(t.bark, M.jBark, mat4(x, y, z, ry, s, s, s)); K.inst(t.leaf, R() < 0.5 ? M.jLeaf : M.jLeaf2, mat4(x, y, z, ry, s, s, s));
    if (t.vine) K.inst(t.vine, M.jVine, mat4(x, y, z, ry, s, s, s), false);
    K.solid(x, z, t.r * s, t.r * s, ry, y + t.h * s, 'wood', y - 1);
    for (const f of t.fins) { const a = f.a + ry, L = f.L * s, d = 0.3 * s + L * 0.4; K.solid(x + Math.cos(a) * d, z - Math.sin(a) * d, L * 0.4, 0.16 * s, a, y + f.hgt * s * 0.55, 'wood', y - 1, { vault: true }); }
    W.treeSpots.push([x, z, s * 1.8]);
    for (let a = 0; a < 6.28; a += 0.8) for (const d of [0, 5, 9]) { const k = cIdx(x + Math.cos(a) * d * s, z + Math.sin(a) * d * s); if (k >= 0) CANOPY[k] = 1; }
  };
  let nGiant = 0;
  for (let i = 0; i < 2200 && nGiant < 95; i++) {
    const x = rr(-132, 132), z = rr(-92, 104);
    if (!free(x, z, 5)) continue;
    if (W.treeSpots.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 11)) continue;
    giant(x, z, rr(0.8, 1.15)); nGiant++;
  }
  // a darker ring of giants on the ridges and against the mountain
  for (let i = 0; i < 46; i++) { const sd = i % 2 ? 1 : -1, x = sd * rr(126, 150), z = rr(-100, 118); giant(x, z, rr(0.9, 1.2)); }
  for (let i = 0; i < 18; i++) { const x = rr(-140, 140), z = rr(-118, -104); if (Math.abs(x - 45) < 12 || Math.abs(x - 101) < 12) continue; giant(x, z, rr(0.9, 1.2)); }
  // mid-size canopy trees to fill between the giants: the same rainforest species, younger (lighter crowns, no
  // buttresses), and the odd wild palm — each one stretched and tinted a little differently
  let nTree = 0;
  const leafMs = [M.jLeaf, M.jLeaf2, M.jLeaf3];
  for (let i = 0; i < 3000 && nTree < 260; i++) {
    const x = rr(-130, 130), z = rr(-92, 104); if (!free(x, z, 2) || Math.abs(T(x, z)) > 0.05) continue; if (W.treeSpots.some(([tx, tz, ts]) => Math.hypot(tx - x, tz - z) < 3 + ts * 2)) continue;
    const y = T(x, z), ry = R() * 6.28;
    if (R() < 0.22) {   // a wild palm, leaning out for the light
      const p = G.palm[Math.floor(R() * 3)], sw = rr(0.8, 1.05), sh = rr(0.85, 1.3);
      K.inst(p.trunk, M.jPalmBark, mat4(x, y, z, ry, sw, sh, sw)); K.inst(p.fronds, R() < 0.5 ? M.jPalm : M.jPalm2, mat4(x, y, z, ry, sw, sh, sw), false);
      K.solid(x, z, 0.25, 0.25, 0, y + 4, 'wood', y - 1);
    } else {
      const t = G.mid[Math.floor(R() * G.mid.length)], sw = rr(0.8, 1.2), sh = rr(0.8, 1.25);
      K.inst(t.bark, M.jBark, mat4(x, y, z, ry, sw, sh, sw)); K.inst(t.leaf, leafMs[Math.floor(R() * 3)], mat4(x, y, z, ry, sw * rr(0.9, 1.1), sh, sw * rr(0.9, 1.1)));
      if (t.vine) K.inst(t.vine, M.jVine, mat4(x, y, z, ry, sw, sh, sw), false);
      K.solid(x, z, t.r * sw, t.r * sw, ry, y + t.h * sh, 'wood', y - 1);
      W.treeSpots.push([x, z, sw]);
      for (let a = 0; a < 6.28; a += 1.2) for (const d of [0, 4]) { const k = cIdx(x + Math.cos(a) * d, z + Math.sin(a) * d); if (k >= 0) CANOPY[k] = 1; }
    }
    nTree++;
  }
  // the understory: ferns, big-leaved plants, bushes, saplings, fallen logs, boulders
  const fernAt = (x, z, s) => K.inst(G.fern[R() < 0.6 ? 0 : 1], M.jFern, mat4(x, T(x, z), z, R() * 6, s, s, s), false);
  for (let i = 0; i < 2600; i++) { const x = rr(-138, 138), z = rr(-96, 108); if (trailD(x, z) < 2.2 || cleared(x, z, -2) || riverD(x, z) < 6.5 || z > 108 || Math.abs(T(x, z)) > 1.5) continue; fernAt(x, z, rr(0.6, 1.4)); }
  for (let i = 0; i < 700; i++) { const x = rr(-136, 136), z = rr(-94, 104); if (!free(x, z, 0)) continue; const s = rr(0.7, 1.5); K.inst(G.bigLeaf, R() < 0.5 ? M.jLeaf : M.jLeaf2, mat4(x, T(x, z), z, R() * 6, s, s, s), false); }
  for (let i = 0; i < 220; i++) { const x = rr(-132, 132), z = rr(-92, 104); if (!free(x, z, 0.5)) continue; K.bush(x, z, rr(0.8, 1.4)); }
  for (let i = 0; i < 22; i++) { const x = rr(-125, 125), z = rr(-88, 100); if (!free(x, z, 4)) continue; K.fallenTree(x, z, R() * 6.28, rr(7, 12), rr(0.9, 1.3)); }
  for (let i = 0; i < 90; i++) { const x = rr(-132, 132), z = rr(-92, 104); if (!free(x, z, 1)) continue; K.rock(x, z, rr(0.4, 1.9)); }
  // hanging vine curtains between the trees along the trails (they sway; not solid)
  for (let i = 0; i < 160; i++) { const x = rr(-130, 130), z = rr(-90, 104), d = trailD(x, z); if (d < 3 || d > 9 || cleared(x, z) || riverD(x, z) < 8) continue; K.inst(G.vineCard, M.jVine, mat4(x, rr(6, 10), z, R() * 6, rr(1, 2), rr(4, 8), 1), false); }
  // palms and sea grapes along the beach
  for (let i = 0; i < 70; i++) {
    const x = rr(-136, 136), z = rr(103, 116); if (Math.abs(x - 40) < 5 || riverD(x, z) < 9 || inRect([14, 100, 50, 118], x, z) || inRect([44, 88, 72, 106], x, z)) continue;
    const p = G.palm[i % 3], y = T(x, z), ry = R() * 6.28, sw = rr(0.85, 1.1), sh = rr(0.85, 1.25); K.inst(p.trunk, M.jPalmBark, mat4(x, y, z, ry, sw, sh, sw)); K.inst(p.fronds, i % 2 ? M.jPalm : M.jPalm2, mat4(x, y, z, ry, sw, sh, sw), false);
    K.solid(x, z, 0.28, 0.28, 0, y + 4, 'wood', y - 1);
  }

  // ================================================================ the beach: sand, the expedition's camp, the dock
  {
    // sand over the slope (follows the ground), no grass, gritty steps
    const x0 = -140, x1 = 140, z0 = 104, z1 = 126, nx = 70, nz = 11;
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, nx, nz).rotateX(-Math.PI / 2), p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i) + (x0 + x1) / 2, z = p.getZ(i) + (z0 + z1) / 2; p.setY(i, T(x, z) + 0.02); uv.setXY(i, x / 6, z / 6); }
    g.computeVertexNormals();
    const sandMat = M.jSand;
    const sand = new THREE.Mesh(g, sandMat); sand.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2); sand.receiveShadow = true; K.level.add(sand);
    for (let x = -140; x < 140; x += 10) K.region(x, 104, x + 10, 116, 'paved', 'gravel');
    for (let x = -140; x < 140; x += 3) K.paint(x, 104 + rr(-1, 1), 2.4, 'dirt', 0.5);
    // driftwood and shells of old boats
    for (let i = 0; i < 16; i++) { const x = rr(-130, 130), z = rr(108, 115); if (Math.abs(x - 40) < 6 || riverD(x, z) < 8) continue; const m = mat4(x, T(x, z) + 0.12, z, R() * 6, rr(1.5, 3.5), 0.25, 0.25); K.xadd(G.log, M.jPalmBark, m, true); K.xadd(G.logEnds, M.jEndGrain, m, false); }
  }
  // a campfire's own look: a bed of glowing embers, charred sticks in a tepee, crossed flame cards that flicker
  const fires = []; let ashM = null;
  const campfire = (x, z, lit = true) => {
    K.xadd(new THREE.CircleGeometry(0.6, 16).rotateX(-Math.PI / 2), lit ? M.jEmber : (ashM ||= K.std({ map: M.jEmber.map, color: 0x6a6660, roughness: 1 })), mat4(x, 0.03, z), false);
    for (let i = 0; i < 5; i++) { const a = i / 5 * 6.28 + 0.3; K.wbeam([x + Math.cos(a) * 0.5, 0.05, z + Math.sin(a) * 0.5], [x + Math.cos(a) * 0.06, 0.5, z + Math.sin(a) * 0.06], 0.05, 0.05, K.MAT.burnt || M.jBark, false); }
    if (!lit) return;
    const grp = new THREE.Group(); grp.position.set(x, 0.02, z); K.level.add(grp);
    for (let i = 0; i < 3; i++) { const q = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 1.1).translate(0, 0.55, 0), M.jFlame); q.rotation.y = i / 3 * Math.PI; q.renderOrder = 4; grp.add(q); }
    fires.push(grp);
  };
  W.anims.push((dt, t) => { if (!fires.length) return; const k = 1 + Math.sin(t * 13) * 0.06 + Math.sin(t * 7.3) * 0.08; for (const f of fires) { f.scale.set(1, k * (0.95 + 0.05 * Math.sin(t * 21 + f.position.x)), 1); f.rotation.y = t * 0.4; } M.jEmber.emissiveIntensity = 0.55 + 0.2 * Math.sin(t * 3.3) + 0.1 * Math.sin(t * 11); });
  // the expedition's beach camp (you start here): three tents round a fire, a mess tarp, the jeep, the supply crates
  const tent = (x, z, yaw, big = false, mat = M.jTent, label = 'Tent') => {
    const g = big ? G.tentBig : G.tent, w = big ? 5.2 : 3.6, d = big ? 7.0 : 4.4, hr = big ? 3.2 : 2.6;
    K.xadd(g, mat, mat4(x, 0, z, yaw));
    const Q = P(x, z, yaw);
    // the canvas walls are solid (sides and back); the front is the way in
    for (const sd of [-1, 1]) { const [a, b] = Q(sd * w / 2, 0); K.solid(a, b, 0.05, d / 2, yaw, hr - 0.4, 'fabric'); }
    { const [a, b] = Q(0, -d / 2); K.solid(a, b, w / 2, 0.05, yaw, hr - 0.4, 'fabric'); }
    // ridge pole, guy ropes, the groundsheet
    { const [a0, b0] = Q(0, -d / 2 - 0.3), [a1, b1] = Q(0, d / 2 + 0.3); K.wbeam([a0, hr + 0.02, b0], [a1, hr + 0.02, b1], 0.05, 0.05, M.jPole); }
    for (const [lx, lz] of [[0, d / 2 + 0.3], [0, -d / 2 - 0.3]]) { const [a, b] = Q(lx, lz); K.inst(G.pole, M.jPole, mat4(a, 0, b, 0, 0.5, hr + 0.1, 0.5)); }
    for (const sd of [-1, 1]) for (const lz of [-d / 3, d / 3]) { const [a, b] = Q(sd * w / 2, lz), [c, e] = Q(sd * (w / 2 + 1.4), lz); K.wbeam([a, hr * 0.62, b], [c, 0.05, e], 0.012, 0.012, M.jRope, false); }
    K.box(x, 0, z, w / 2 - 0.05, 0.025, d / 2 - 0.05, yaw, f => f === 'top' ? (big ? 'jTarp' : 'jCanvasGreen') : null);
    K.region(...K.rectOf(x, z, w / 2, d / 2, yaw), 'paved', 'wood');
    // a cot and a footlocker inside
    { const [a, b] = Q(-w / 2 + 0.6, -0.2); cot(a, b, yaw); K.container('nightstand', a, b, 0.42, 'Cot', yaw); }
    { const [a, b] = Q(w / 2 - 0.55, -d / 2 + 0.6); D.abox(JA, { pz: 'footlocker', side: 'olive', top: 'olive' }, a, 0, b, 0.4, 0.45, 0.28, yaw); K.solid(a, b, 0.4, 0.28, yaw, 0.45, 'wood'); K.container('closet', a, b, 0.45, label === 'Tent' ? 'Footlocker' : label, yaw);
      const [c, e] = Q(w / 2 - 0.5, -d / 2 + 1.25); K.xadd(D.G.cylY, K.MAT.darkMetal || M.jMetalDark, K.mat4(c, 0, e, 0, 0.09, 0.32, 0.09), false); K.xadd(D.G.sphere, M.jLampOut, K.mat4(c, 0.36, e, 0, 0.07, 0.09, 0.07), false); }   // a hurricane lamp
    return Q;
  };
  {
    tent(48, 92, 0.3, false, M.jTent); tent(64, 90, -0.4, false, M.jTent2); tent(63, 81, Math.PI - 0.3, true, M.jTentBlue, 'Supply chest');
    notes.push({ x: 48.3, z: 92, y: 0.45, id: 'manifest' });
    // the fire pit: a ring of stones, a fire burning (the morning coffee), logs to sit on
    for (let i = 0; i < 9; i++) { const a = i / 9 * 6.28; K.rock(56 + Math.cos(a) * 0.75, 93 + Math.sin(a) * 0.75, 0.32, { solid: false }); }
    K.emitter({ x: 56, y: 0.15, z: 93, kind: 'fire', rate: 5, t: 0, light: true }); K.emitter({ x: 56, y: 0.8, z: 93, kind: 'smoke', rate: 1.2, t: 0 });
    K.hazard(56, 93, 0.6, 'fire', 8); campfire(56, 93);
    for (const [x, z, yaw] of [[53.6, 93.4, 0.2], [58.4, 92.6, -0.3], [56.2, 95.6, Math.PI / 2]]) { K.xadd(G.log, M.jPalmBark, mat4(x, 0.22, z, yaw + Math.PI / 2, 1.8, 0.45, 0.45)); K.xadd(G.logEnds, M.jEndGrain, mat4(x, 0.22, z, yaw + Math.PI / 2, 1.8, 0.45, 0.45), false); K.solid(x, z, 0.24, 0.9, yaw, 0.44, 'wood', 0, { vault: true }); }
    // the mess tarp: a blue tarp on poles over a folding table
    for (const [lx, lz] of [[-2.2, -1.6], [2.2, -1.6], [-2.2, 1.6], [2.2, 1.6]]) { K.inst(G.pole, M.jPole, mat4(66 + lx, 0, 100 + lz, 0, 0.5, 2.4, 0.5)); K.solid(66 + lx, 100 + lz, 0.06, 0.06, 0, 2.4, 'wood'); }
    K.xadd(new THREE.PlaneGeometry(5, 3.8, 6, 6).rotateX(-Math.PI / 2).translate(0, 0, 0), M.jTarp, mat4(66, 2.45, 100, 0, 1, 1, 1, 0.06, 0.03), true);
    K.solid(66, 100, 1.0, 0.45, 0, 0.75, 'metal', 0, { vault: true }); K.box(66, 0.71, 100, 1.0, 0.75, 0.45, 0, f => f === 'bot' ? 'jMetalDark' : 'dzLaminate');   // a folding table
    for (const lx of [-0.9, 0.9]) for (const s2 of [-1, 1]) K.wbeam([66 + lx - 0.08 * s2, 0, 100 - 0.4], [66 + lx + 0.08 * s2, 0.71, 100 + 0.4], 0.02, 0.02, M.jMetalDark, false);
    D.abox(JA, { pz: 'olive', side: 'olive', top: 'stove' }, 65.55, 0.75, 100, 0.32, 0.86, 0.2, 0);   // the camp stove, a kettle on it, pots, mugs, a coffee tin
    K.xadd(D.G.kettle, K.MAT.chrome || K.MAT.metal, K.mat4(65.4, 0.86, 100, 0.5), false); K.xadd(D.G.pot, M.jMetalDark, K.mat4(65.72, 0.86, 100, 0, 0.8, 0.7, 0.8), false);
    for (let i = 0; i < 4; i++) K.xadd(D.G.can, [K.MAT.white, K.MAT.redPaint, K.MAT.bluePaint, K.MAT.white][i] || K.MAT.metal, K.mat4(66.3 + i * 0.13, 0.75, 100.15 - (i % 2) * 0.1, 0, 1.1, 0.9, 1.1), false);
    K.xadd(D.G.board, K.MAT.dzButcher, K.mat4(66.6, 0.75, 99.85, 0.2), false);
    K.container('kitchen', 66, 100, 0.8, 'Camp stove & food box', 0); K.container('cooler', 64.4, 101.1, 0.3, 'Cooler', 0);
    propBox(64.4, 0, 101.1, 0.35, 0.42, 0.25, 0, M.jCooler, 'plastic', [0.05, 0.1, 0.3, 0.4]);
    K.crateStack(70, 96, 0.4, 2); K.crateStack(71.2, 94.2, -0.2, 1);
    K.car(74, 88, -0.6, 3, 'pickup');
    // Day 1, noon: the beach camp is overrun (in the chaos layer)
    K.chaos(56, 92, () => {
      K.blood(52, 95, 1.4); K.blood(58, 88, 1.0); K.blood(61.5, 91.5, 0.8);
      K.container('corpse', 52.6, 95.6, 0.2, 'Kofi', 0);
      K.emitter({ x: 64, y: 0.5, z: 90, kind: 'smoke', rate: 2, t: 0 });
      K.crateStack(60.5, 102.5, 0.3, 2); K.crateStack(62, 101.6, -0.4, 1);
    });
  }
  // the harbour shack at the head of the dock: a plank room you can walk into, a radio that only gets static
  {
    const H = K.room(27, 108.5, 7, 5, 0, { h: 2.7, mat: 'plank', inMat: 'plank', floor: 'floorWood', roof: 'gable', roofMat: 'jThatch', ridge: 1.4, doors: [{ side: 'n', at: 1.5, w: 0.95, dir: -1, col: 0x3a5a6a }], windows: [{ side: 'e', at: 0, w: 1.0 }, { side: 'w', at: 0.5, w: 1.0 }, { side: 's', at: -1.5, w: 1.4 }], name: 'the harbour shack', home: false, inside: [[0, 0], [-1.8, -0.6]] });
    void H;
    D.abox(JA, { nz: 'supplies', pz: 'supplies', side: 'olive', top: 'olive' }, 24.6, 0, 110, 0.8, 0.9, 0.35, 0); K.solid(24.6, 110, 0.8, 0.35, 0, 0.9, 'wood'); K.container('shelf', 24.6, 110.1, 0.9, 'Bait shelf', 0);
    D.abox(D.A, { pz: 'cabWood2', nz: 'cabWood2', side: 'white', top: 'white' }, 29.8, 0, 106.7, 0.5, 1.6, 0.25, 0); K.solid(29.8, 106.7, 0.5, 0.25, 0, 1.6, 'wood'); K.container('cabinet', 29.8, 107, 0.9, 'Tool cupboard', Math.PI);
    D.face(JA, 'tools', 27.4, 1.55, 110.84, Math.PI, 1.3, 1.0);
    K.container('cooler', 25, 107, 0.3, 'Fish cooler', 0); propBox(25, 0, 107, 0.4, 0.45, 0.3, 0, M.jCooler, 'plastic', [0.05, 0.1, 0.3, 0.4]);
    for (const [x, z] of [[33, 111.5], [33.7, 112.2], [32.6, 112.6]]) K.xadd(G.drum, M.jDrumBlue, mat4(x, 0, z, R())); K.solid(33.2, 112.1, 0.9, 0.9, 0, 0.9, 'metal');
  }
  // the dock: a long plank pier on log piles out to deep water, rails, lamp posts; the RIO LENTO tied up at the end
  {
    const x = 40, zA = 105, zB = 146.5, Y = 0.55;
    K.deck(x, (zA + zB) / 2, 1.6, (zB - zA) / 2, 0, Y, { mat: 'plank', th: 0.18 });
    K.region(x - 1.6, zA, x + 1.6, zB, 'paved', 'wood');
    for (let z = zA + 1; z < zB; z += 3) for (const sd of [-1, 1]) { const y = T(x + sd * 1.5, z); K.inst(G.pole, M.jPole, mat4(x + sd * 1.5, y - 0.5, z, 0, 2.6, Y + 1.6 - y, 2.6)); }
    // rails both sides (the boat side has a gap where you step aboard), solid
    for (const sd of [-1, 1]) {
      const segs = sd > 0 ? [[zA + 4, 134], [143, zB]] : [[zA + 4, zB]];
      for (const [a, b] of segs) { K.wbeam([x + sd * 1.5, Y + 1.0, a], [x + sd * 1.5, Y + 1.0, b], 0.07, 0.07, M.jPole); K.solid(x + sd * 1.5, (a + b) / 2, 0.08, (b - a) / 2, 0, Y + 1.05, 'wood', Y - 0.6); for (let z = a; z <= b; z += 3) K.inst(G.pole, M.jPole, mat4(x + sd * 1.5, Y, z, 0, 0.6, 1.0, 0.6)); }
    }
    K.solid(x, zB + 0.05, 1.6, 0.08, 0, Y + 1.05, 'wood', Y - 0.6); K.wbeam([x - 1.5, Y + 1.0, zB], [x + 1.5, Y + 1.0, zB], 0.07, 0.07, M.jPole);
    // a lantern post half-way and at the end (one real light at the end, it comes on at dusk)
    for (const z of [128, 145]) { K.inst(G.pole, K.MAT.darkMetal || K.MAT.metal, mat4(x - 1.3, Y, z, 0, 0.5, 2.4, 0.5)); K.xadd(new THREE.SphereGeometry(0.14, 10, 8), M.jLampOut, mat4(x - 1.3, Y + 2.45, z), false); }
    const dl = K.light(x - 1.3, Y + 2.4, 145, 0xffd8a0, 0, 16); W.anims.push(() => { const on = W.daylight < 0.45; dl.intensity = on ? 9 : 0; M.jLampOut.emissiveIntensity = on ? 2.5 : 0; });
    // a mooring bollard, coiled ropes, the chalked note on the post
    K.xadd(K.GEO.ucyl, K.MAT.darkMetal || K.MAT.metal, mat4(x + 1.1, Y + 0.2, 138, 0, 0.3, 0.4, 0.3));
    notes.push({ x: x - 1.0, z: 116, y: Y + 0.8, id: 'dock' }); K.container('bin', x - 1.0, 116, Y + 0.4, 'Tackle box', 0);
    // THE BOAT: tied along the dock's east side, bow to the sea; she rides the swell (drawn as one moving group)
    const B0 = G.boat, grp = new THREE.Group(); grp.position.set(44.0, 0.25, 138.5); grp.rotation.y = -Math.PI / 2; K.level.add(grp);
    const add = (geo, m) => { const o = new THREE.Mesh(geo, m); o.castShadow = true; o.receiveShadow = true; grp.add(o); return o; };
    add(B0.hull, M.jHull); add(B0.deck, K.MAT.plank); add(B0.cab, K.MAT.white || K.MAT.trim); add(B0.glass, K.MAT.glass); add(B0.rail, K.MAT.metal); add(B0.tyre, K.MAT.rubber || K.MAT.black || K.MAT.metal);
    { const nm = K.std({ map: J.signTex(['RIO LENTO'], '#e8e4d8', '#1f2a3a', 512, 96, 'bold 64px Georgia'), roughness: 0.6 }); for (const sd of [-1, 1]) { const o = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.4), nm); o.position.set(3.2, 0.0, sd * 1.36); o.rotation.y = sd > 0 ? 0 : Math.PI; o.rotation.x = 0; grp.add(o); } }
    W.anims.push((dt, t) => { grp.position.y = 0.25 + Math.sin(t * 0.9) * 0.05; grp.rotation.z = Math.sin(t * 0.7) * 0.025; grp.rotation.x = Math.sin(t * 0.55 + 1) * 0.012; });
    const boatBox = K.solid(44.0, 138.5, 1.55, 5.5, 0, 1.6, 'wood', -2);
    // Tomas takes her out to anchor offshore after dark ("STAY ON THE WATER") and brings her in at first light: the
    // way out at 06:00 is the boat coming back in to the dock (heli.js's boat), so she isn't tied up here overnight
    W.anims.push(() => { const h = W.time ?? 12, here = h >= 6.5 && h < 18.5; if (grp.visible !== here) { grp.visible = here; boatBox.off = !here; } });
    // her mooring lines to the dock
    // (in her own group, so they go with her: local x = −world z + 138.5 … the group is turned −90°)
    for (const [wx, wz, dz] of [[42.6, 134.5, -1], [42.6, 142.5, 1]]) { const a = new THREE.Vector3(wx - 44, 0.9 - 0.25, wz - 138.5), b = new THREE.Vector3(41.5 - 44, Y + 0.3 - 0.25, wz + dz - 138.5), L = a.distanceTo(b);
      const o = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, L, 5), M.jRope); o.position.copy(a).add(b).multiplyScalar(0.5); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      const wrap = new THREE.Group(); wrap.rotation.y = Math.PI / 2; wrap.add(o); grp.add(wrap); }
    W.boat = { x: 44, z: 138.5, group: grp };
  }

  // ================================================================ the Halvorsen research camp (west bank)
  // stilt huts: a plank floor up on posts, walls with a doorway and a real door, windows, a thatched roof, stairs
  const liftDoor = (D, y) => { D.pivot.position.y = y; for (const b of [D.box, D.obox]) { b.y0 = y; b.y1 = y + 2.05; } };
  function stiltHut(x, z, yaw, w, d, Y, name, fill) {
    const Q = P(x, z, yaw);
    K.deck(x, z, w / 2 + 1.0, d / 2 + 0.2, yaw, Y, { mat: 'plank', th: 0.22 });
    for (const lx of [-w / 2 - 0.8, 0, w / 2 + 0.8]) for (const lz of [-d / 2, d / 2]) { const [a, b] = Q(lx, lz); K.inst(G.pole, M.jPole, mat4(a, 0, b, 0, 2.4, Y + (Math.abs(lx) > w / 2 ? 1.1 : 0), 2.4)); K.solid(a, b, 0.2, 0.2, yaw, Y - 0.25, 'wood'); }
    // walls (y0 = Y) — the porch on the +x end, the door in that wall
    const t = 0.14, c = Math.cos(yaw), s = Math.sin(yaw), wl = (ax, az, bx, bz, o) => { const [a0, a1] = Q(ax, az), [b0, b1] = Q(bx, bz); return K.wall(a0, a1, b0, b1, { h: 2.4, t, y0: Y, mat: 'plank', inMat: 'plank', surf: 'wood', ...o }); };
    const hw = w / 2 - 0.8;
    wl(-w / 2, -d / 2, hw, -d / 2, { openings: [{ at: -0.4, w: 1.0, glass: true, sill: 0.9, top: 1.9 }] });
    wl(hw, d / 2, -w / 2, d / 2, { openings: [{ at: 0.2, w: 1.0, glass: true, sill: 0.9, top: 1.9 }] });
    wl(-w / 2, d / 2, -w / 2, -d / 2, {});
    wl(hw, -d / 2, hw, d / 2, { openings: [{ at: 0, w: 0.9 }] });
    // the door hung in that gap (no ground-level frame: it's built by hand at floor height)
    { const [a0, a1] = Q(hw, -0.45), [b0, b1] = Q(hw, 0.45), yw = Math.atan2(-(b1 - a1), b0 - a0); liftDoor(K.door(a0, a1, yw, 1, 0x6a5a40, null, { w: 0.9 }), Y);
      for (const lz of [-0.5, 0.5]) { const [fx, fz] = Q(hw, lz); K.box(fx, Y, fz, 0.05, Y + 2.1, 0.09, yaw, 'darkWood'); }
      { const [fx, fz] = Q(hw, 0); K.box(fx, Y + 2.05, fz, 0.09, Y + 2.15, 0.55, yaw, 'darkWood'); } }
    // floor inside, the porch rails, the stairs down from the porch
    const W3 = (lx, lz, y) => { const [a, b] = Q(lx, lz); return [a, y, b]; };
    const rail = (ax, az, bx, bz) => { const [cx, cz] = Q((ax + bx) / 2, (az + bz) / 2), L = Math.hypot(bx - ax, bz - az); K.solid(cx, cz, ax === bx ? 0.05 : L / 2, ax === bx ? L / 2 : 0.05, yaw, Y + 1.0, 'wood', Y + 0.05); K.wbeam(W3(ax, az, Y + 0.95), W3(bx, bz, Y + 0.95), 0.05, 0.05, M.jPole); };
    for (const sd of [-1, 1]) rail(hw + 0.1, sd * (d / 2 + 0.12), w / 2 + 0.95, sd * (d / 2 + 0.12));
    rail(w / 2 + 0.95, -d / 2 + 1.3, w / 2 + 0.95, d / 2 + 0.12);
    { const [a, b] = Q(w / 2 + 1.0 + 1.6, -d / 2 + 0.7); K.stairs(a, b, yaw - Math.PI / 2, 1.1, 3.2, 0, Y, 'plank', { open: true }); }
    // thatched roof
    const [rx, rz] = Q(-0.4, 0); K.gableRoof(rx, rz, w / 2 + 0.6, d / 2 + 0.7, yaw, Y + 2.4, Y + 3.9, 'jThatch', 'plank', false);
    K.box(x, Y + 2.38, z, w / 2, Y + 2.42, d / 2, yaw, f => f === 'bot' ? 'jPole' : null);
    fill(Q, Y);
    void c; void s; void name;
  }
  stiltHut(-86, -46, 0.25, 5.4, 4.2, 2.3, 'hut1', (Q, Y) => {
    { const [a, b] = Q(-1.8, -1.2); cot(a, b, 0.25 + Math.PI / 2, Y, 'fabric0', 0.4, 0.95); K.container('nightstand', a, b, Y + 0.45, 'Cot', 0.25); }
    { const [a, b] = Q(-1.9, 1.5); D.abox(D.A, { nz: 'cabWood2', side: 'white', top: 'white' }, a, Y, b, 0.6, Y + 1.7, 0.25, 0.25); K.solid(a, b, 0.6, 0.25, 0.25, Y + 1.7, 'wood', Y); K.container('closet', a, b, Y + 1.0, 'Clothes rail', 0.25); }
    { const [a, b] = Q(0.8, 1.6); D.abox(D.A, { nz: 'drawers3', side: 'white', top: 'white' }, a, Y, b, 0.6, Y + 0.72, 0.3, 0.25); K.box(a, Y + 0.72, b, 0.62, Y + 0.76, 0.32, 0.25, 'dzWoodDark'); K.solid(a, b, 0.6, 0.3, 0.25, Y + 0.75, 'wood', Y); K.container('dresser', a, b, Y + 0.75, 'Writing desk', 0.25); notes.push({ x: a, z: b, y: Y + 0.8, id: 'priya' });
      const [c, e] = Q(0.8, 2.02); D.face(JA, 'map', c, Y + 1.45, e, 0.25 + Math.PI, 1.0, 0.75); const [f, h] = Q(0.4, 1.65); K.xadd(D.G.cylY, M.jLampOut, K.mat4(f, Y + 0.76, h, 0, 0.05, 0.2, 0.05), false); }
  });
  stiltHut(-80, -18, -0.15, 6.0, 4.4, 2.5, 'hut2', (Q, Y) => {
    { const [a, b] = Q(-2.0, -1.3); cot(a, b, -0.15 + Math.PI / 2, Y, 'fabric3', 0.4, 0.95); K.container('nightstand', a, b, Y + 0.45, 'Cot', -0.15); }
    { const [a, b] = Q(-0.2, 1.7); D.abox(JA, { nz: 'supplies', side: 'olive', top: 'olive' }, a, Y, b, 1.1, Y + 1.0, 0.3, -0.15); K.solid(a, b, 1.1, 0.3, -0.15, Y + 1.0, 'metal', Y); K.container('shelf', a, b, Y + 1.0, 'Supply shelves', -0.15, null, { fixed: [['flashlight', 1], ['battery', 1]] }); }
    { const [a, b] = Q(1.4, -1.5); D.abox(JA, { pz: 'footlocker', side: 'olive', top: 'olive' }, a, Y, b, 0.4, Y + 0.5, 0.3, -0.15); K.solid(a, b, 0.4, 0.3, -0.15, Y + 0.5, 'wood', Y); K.container('medicine', a, b, Y + 0.5, 'First-aid locker', -0.15); }
  });
  // the lab hut: a ground-level plank building with a tin-ish thatch roof; benches, the sample fridge, the log
  {
    K.room(-64, -40, 9, 6, 0.1, { h: 2.7, mat: 'plank', inMat: 'plank', floor: 'floorWood', roof: 'gable', roofMat: 'jThatch', ridge: 1.6, doors: [{ side: 'n', at: 2.2, w: 0.95, dir: -1, col: 0x4a5a3a }], windows: [{ side: 'n', at: -1.8, w: 1.4 }, { side: 'e', at: 0, w: 1.2 }, { side: 's', at: 0, w: 1.6 }], name: 'the lab hut', home: false, inside: [[0, 0], [-2.5, 0.5], [2.5, -1]] });
    const Q = P(-64, -40, 0.1);
    { const [a, b] = Q(-1.2, -2.5); labBench(a, b, 0.1, 4.0); K.container('medicine', a, b, 0.92, 'Lab bench', 0.1); notes.push({ x: a, z: b, y: 0.95, id: 'campLog' }); }
    { const [a, b] = Q(-4.0, 0.6); propBox(a, 0, b, 0.5, 1.7, 0.35, 0.1 + Math.PI / 2, M.jFridge, 'metal', [0.0, 0.05, 0.08, 0.3]); K.container('fridge', a, b, 1.0, 'Sample fridge', 0.1 + Math.PI / 2); }
    { const [a, b] = Q(3.6, -1.4); D.abox(JA, { nx: 'reagents', side: 'olive', top: 'olive' }, a, 0, b, 0.45, 1.8, 0.9, 0.1); K.solid(a, b, 0.45, 0.9, 0.1, 1.8, 'metal'); K.container('pharmacy', a, b, 1.0, 'Chemical shelves', 0.1 - Math.PI / 2); }
    { const [a, b] = Q(1.2, 1.9); D.abox(D.A, { nz: 'drawers3', side: 'white', top: 'white' }, a, 0, b, 0.7, 0.71, 0.4, 0.1); K.box(a, 0.71, b, 0.72, 0.75, 0.42, 0.1, 'dzWoodDark'); K.solid(a, b, 0.7, 0.4, 0.1, 0.75, 'wood'); K.container('cabinet', a, b, 0.75, 'Desk', 0.1);
      const [c, e] = Q(0.6, 2.84); D.face(JA, 'map', c, 1.6, e, 0.1 + Math.PI, 1.0, 0.75); D.microwave(...Q(0.9, 1.95).flatMap((v, i) => i ? [v] : [v, 0.75]), 0.1 + Math.PI); }   // a field laptop-ish monitor on the desk, the route map over it
  }
  // the supply hut (ground level, padlocked door was forced)
  {
    K.room(-92, -30, 5, 4, -0.3, { h: 2.5, mat: 'plank', inMat: 'plank', floor: 'floorWood', roof: 'gable', roofMat: 'jThatch', ridge: 1.2, doors: [{ side: 'e', at: 0, w: 0.95, dir: 1, col: 0x5a4a32 }], windows: [{ side: 'n', at: 0, w: 1.0 }], name: 'the supply hut', home: false });
    const Q = P(-92, -30, -0.3);
    { const [a, b] = Q(-1.6, 0); K.solid(a, b, 0.4, 1.4, -0.3, 1.8, 'metal'); for (const lz of [-0.7, 0.7]) { const [c, e] = Q(-1.6, lz); D.abox(JA, { px: 'supplies', side: 'olive', top: 'olive' }, c, 0, e, 0.4, 1.8, 0.7, -0.3); } K.container('pantry', a, b, 1.0, 'Food shelves', -0.3 + Math.PI / 2); }
    { const [a, b] = Q(0.6, -1.3); D.abox(JA, { pz: 'crate', side: 'crate', top: 'crate' }, a, 0, b, 0.8, 0.6, 0.35, -0.3); K.solid(a, b, 0.8, 0.35, -0.3, 0.6, 'wood'); K.container('shed', a, b, 0.6, 'Tool chest', -0.3); }
    for (const [lx, lz] of [[0.9, 1.2], [1.5, 1.2]]) { const [a, b] = Q(lx, lz); K.xadd(G.drum, M.jDrumRed, mat4(a, 0, b, R())); }
    { const [a, b] = Q(1.2, 1.2); K.solid(a, b, 0.65, 0.32, -0.3, 0.9, 'metal'); }
  }
  // camp tents, the generator lean-to, the radio mast, the fire pit, crates, a jeep
  {
    tent(-70, -54, 0.5, false, M.jTent2); tent(-58, -52, -0.2, false, M.jTent); tent(-96, -12, 1.4, false, M.jTent);
    tent(-60, -22, Math.PI + 0.2, true, M.jCanvasGreen, 'Expedition chest');
    // the generator under a lean-to of corrugated thatch
    const gx = -74, gz = -26;
    for (const [lx, lz] of [[-1.6, -1.2], [1.6, -1.2], [-1.6, 1.2], [1.6, 1.2]]) { K.inst(G.pole, M.jPole, mat4(gx + lx, 0, gz + lz, 0, 0.6, lz < 0 ? 2.5 : 2.1, 0.6)); K.solid(gx + lx, gz + lz, 0.07, 0.07, 0, 2.3, 'wood'); }
    K.xadd(K.GEO.ubox, M.jThatch, mat4(gx, 2.32, gz, 0, 3.8, 0.1, 3.0, 0.16, 0));
    propBox(gx, 0, gz, 0.75, 0.85, 0.5, 0, M.jGen, 'metal', [0.0, 0.0, 0.06, 0.08]);
    K.xadd(K.GEO.ucyl, K.MAT.darkMetal || K.MAT.metal, mat4(gx + 0.4, 1.05, gz, 0, 0.1, 0.5, 0.1));
    K.container('garage', gx, gz + 0.8, 0.5, 'Generator', 0, null, { fixed: [['lantern', 1]] }); notes.push({ x: gx, z: gz + 0.8, y: 0.6, id: 'generator' });
    for (let i = 0; i < 3; i++) K.xadd(G.drum, i === 1 ? M.jDrumRust : M.jDrumRed, mat4(gx - 1.1 + i * 0.62, 0, gz - 0.9, R()));
    K.solid(gx - 0.5, gz - 0.9, 1.0, 0.32, 0, 0.9, 'metal');
    // a string of bulbs over the camp (glowing at night), one real light by the generator
    const bulbG = new THREE.SphereGeometry(0.07, 8, 6);
    const pts = [[gx, gz], [-66, -30], [-62, -36], [-70, -46], [-80, -40], [gx, gz]];
    for (let i = 0; i + 1 < pts.length; i++) { const [a, b] = [pts[i], pts[i + 1]]; K.wbeam([a[0], 2.9, a[1]], [b[0], 2.9, b[1]], 0.01, 0.01, K.MAT.black || K.MAT.metal, false); for (let k = 1; k < 6; k++) { const t = k / 6; K.inst(bulbG, M.jBulbs, mat4(lerp(a[0], b[0], t), 2.86 - Math.sin(t * Math.PI) * 0.25, lerp(a[1], b[1], t)), false); } K.inst(G.pole, M.jPole, mat4(b[0], 0, b[1], 0, 0.5, 3.0, 0.5)); }
    // (dark until somebody gets the generator going: the story's beats set W.jungle.genOn at the generator; before
    // that the bulbs are only a dim battery trickle, and a hurricane lantern burns on the first hut's porch)
    const [lnx, lnz] = P(-86, -46, 0.25)(2.45, -1.05), cl = K.light(-70, 3.2, -36, 0xffd8a0, 0, 20), pl = K.light(lnx, 4.1, lnz, 0xffb860, 0, 11);
    W.anims.push((dt, t) => { const night = W.daylight < 0.5, gen = !!(W.jungle && W.jungle.genOn); cl.intensity = night && gen ? 12 : 0; M.jBulbs.emissiveIntensity = night ? (gen ? 2.4 : 0.25) : 0;
      pl.intensity = night ? 5 * (0.9 + 0.1 * Math.sin(t * 9) * Math.sin(t * 5.3)) : 0; M.jRedLed.emissiveIntensity = Math.sin(t * 3) > 0.2 ? 3 : 0.2; });
    // the porch lantern itself (hanging from the first hut's roof beam, by the door)
    K.xadd(new THREE.CylinderGeometry(0.09, 0.11, 0.24, 10), M.jLampOut, mat4(lnx, 4.2, lnz), false);
    K.xadd(new THREE.CylinderGeometry(0.12, 0.12, 0.04, 10), M.jMetalDark, mat4(lnx, 4.34, lnz), false); K.wbeam([lnx, 4.36, lnz], [lnx, 4.72, lnz], 0.01, 0.01, M.jMetalDark, false);
    // the radio mast: a tall lattice pole with guy wires; the radio table beside it
    const mx = -54, mz = -44;
    // a three-legged lattice: legs, zig-zag bracing on each face, an aerial on top, a red light that blinks
    { const leg = i => [mx + Math.cos(i * 2.094 + 0.3) * 0.32, mz + Math.sin(i * 2.094 + 0.3) * 0.32], mm = K.MAT.metal, H = 14, bay = 0.9;
      for (let i = 0; i < 3; i++) { const [a, b] = leg(i); K.wbeam([a, 0, b], [a, H, b], 0.03, 0.03, mm); }
      for (let i = 0; i < 3; i++) { const [a, b] = leg(i), [c, d] = leg((i + 1) % 3); for (let y = 0; y + bay <= H; y += bay) { const up = Math.round(y / bay) % 2; K.wbeam(up ? [a, y, b] : [c, y, d], up ? [c, y + bay, d] : [a, y + bay, b], 0.012, 0.012, mm, false); K.wbeam([a, y, b], [c, y, d], 0.012, 0.012, mm, false); } }
      K.wbeam([mx, H, mz], [mx, H + 2.2, mz], 0.025, 0.025, mm, false);
      K.xadd(new THREE.SphereGeometry(0.09, 10, 8), M.jRedLed, mat4(mx, H + 2.25, mz), false);
      K.solid(mx, mz, 0.36, 0.36, 0, H, 'metal'); }
    for (let i = 0; i < 3; i++) { const a = i / 3 * 6.28 + 0.4; K.wbeam([mx, 12, mz], [mx + Math.cos(a) * 7, 0.05, mz + Math.sin(a) * 7], 0.012, 0.012, K.MAT.metal, false); }
    K.block(mx + 1.4, 0, mz + 0.6, 0.7, 0.78, 0.4, 0.2, f => f === 'top' ? 'darkWood' : 'metal', 'metal');
    { const rm = K.std({ map: J.signTex(['◉  ◉  ◉', 'HF-90  TX/RX'], '#3a4038', '#c8d0b8', 256, 128, 'bold 26px Helvetica'), roughness: 0.5, metalness: 0.4 }), rg = new THREE.BoxGeometry(0.5, 0.28, 0.32), ru = rg.attributes.uv;
      for (let i = 0; i < ru.count; i++) if ((i >> 2) !== 4) ru.setXY(i, 0.02 + ru.getX(i) * 0.05, 0.02 + ru.getY(i) * 0.05);
      K.xadd(rg, rm, mat4(mx + 1.4, 0.92, mz + 0.6, 0.2)); K.xadd(new THREE.SphereGeometry(0.018, 6, 4), M.jRedLed, mat4(mx + 1.4 + Math.sin(0.2) * 0.165 + 0.18, 1.0, mz + 0.6 + Math.cos(0.2) * 0.165), false); }
    K.container('cabinet', mx + 1.4, mz + 0.6, 0.8, 'Camp radio (dead)', 0.2);
    // fire pit, log benches, a folding table and chairs, crates, the camp jeep
    for (let i = 0; i < 9; i++) { const a = i / 9 * 6.28; K.rock(-68 + Math.cos(a) * 0.75, -36 + Math.sin(a) * 0.75, 0.3, { solid: false }); }
    K.paint(-68, -36, 1.4, 'dark', 0.8); campfire(-68, -36, false);
    for (const [x, z, yaw] of [[-70.4, -36, 0], [-65.6, -36.3, 0.2]]) { K.xadd(G.log, M.jPalmBark, mat4(x, 0.22, z, yaw + Math.PI / 2, 1.8, 0.45, 0.45)); K.xadd(G.logEnds, M.jEndGrain, mat4(x, 0.22, z, yaw + Math.PI / 2, 1.8, 0.45, 0.45), false); K.solid(x, z, 0.24, 0.9, yaw, 0.44, 'wood', 0, { vault: true }); }
    K.gardenTable(-63, -30); K.gardenChair(-62, -29, 2.5); K.gardenChair(-64.2, -31, -0.6);
    K.crateStack(-84, -32, 0.2, 3); K.crateStack(-86, -33.5, -0.5, 1); K.crateStack(-56, -27, 0.9, 2);
    K.car(-50, -32, 1.3, 6, 'pickup');
    K.region(-100, -60, -50, -8, 'dirt', 'gravel', 0.5);
    for (let i = 0; i < 50; i++) K.paint(rr(-96, -54), rr(-56, -12), rr(2, 4), 'dirt', 0.4);
    // the outbreak reaches the camp: a burning tent, bodies, a crate barricade at the lab door, the mast's cable cut
    K.chaos(-66, -36, () => {
      K.emitter({ x: -58, y: 0.4, z: -52, kind: 'fire', rate: 8, t: 0, light: true }); K.emitter({ x: -58, y: 2, z: -52, kind: 'smoke', rate: 3, t: 0 }); K.hazard(-58, -52, 1.6, 'fire', 18);
      K.container('corpse', -66.5, -31, 0.2, 'Dead researcher', 0); K.blood(-66.5, -31, 1.4); K.blood(-62, -34, 0.8);
      K.container('corpse', -77, -40.5, 0.2, 'Dead guard', 0, null, { fixed: [['pistol', 1], ['ammo9', 8]] }); K.blood(-77, -40.5, 1.2);
      K.crateStack(-61, -36.4, 0.1, 2); K.crateStack(-60.2, -38, 0.5, 1);
      for (let i = 0; i < 12; i++) K.blood(rr(-90, -55), rr(-55, -15), rr(0.3, 0.8));
    });
  }

  // ================================================================ the ruins (east bank): the temple, the plaza
  {
    const cx = 92, cz = -24;
    // the plaza: worn flagstones, rows of pillars (some fallen), a broken wall, carved heads half in the earth
    K.box(84, 0, -16, 18, 0.06, 16, 0, f => f === 'top' ? 'jFlag' : null); K.region(66, -32, 102, 0, 'paved', 'concrete');
    for (let i = 0; i < 6; i++) for (const sd of [-1, 1]) {
      const x = 68 + i * 4.2, z = -6 + sd * 5;
      if ((i === 2 && sd < 0) || (i === 4 && sd > 0)) {   // fallen: lying in drums
        for (let k = 0; k < 3; k++) { const fx = x + 0.95 * k + 0.4, fz = z + sd * 0.5; K.xadd(new THREE.CylinderGeometry(0.45, 0.45, 0.9, 12), M.jStone, mat4(fx, 0.45, fz, 0, 1, 1, 1, 0, Math.PI / 2 + rr(-0.15, 0.15))); }
        K.solid(x + 1.35, z + sd * 0.5, 1.45, 0.45, 0, 0.9, 'concrete', 0, { vault: true });
        continue;
      }
      const h = i % 3 === 1 ? rr(2.2, 3.4) : 4.6;
      K.xadd(new THREE.CylinderGeometry(0.42, 0.48, h, 12).translate(0, h / 2, 0), M.jStone, mat4(x, 0, z, R()));
      K.block(x, 0, z, 0.62, 0.3, 0.62, 0, 'jStone', 'concrete', false);
      if (h > 4) K.block(x, h, z, 0.62, h + 0.32, 0.62, 0, 'jStone', 'concrete', false);
      K.solid(x, z, 0.5, 0.5, 0, h + 0.3, 'concrete');
      if (R() < 0.5) K.xadd(G.vineCard, M.jVine, mat4(x, h, z + 0.5, 0, 0.8, h * 0.8, 1), false);
    }
    // a broken wall along the north side with a doorway
    for (let i = 0; i < 5; i++) { const x = 66 + i * 3.1; if (i === 2) continue; const h = rr(1.2, 3.4); K.block(x, 0, -30.5, 1.5, h, 0.5, rr(-0.03, 0.03), 'jStone', 'concrete'); }
    // the carved heads (weathered grey basalt, a little moss)
    const headM = K.std({ map: K.MAT.rock && K.MAT.rock.map, normalMap: K.MAT.rock && K.MAT.rock.normalMap, color: 0xd0ccbc, roughness: 0.9 });
    for (const [x, z, yaw] of [[70, -2, 0.4], [96, -4, -0.6]]) {
      K.xadd(G.head, headM, mat4(x, -0.25, z, yaw, 1, 1, 1, rr(-0.06, 0.02), rr(-0.05, 0.05)));   // sunk a little, tilted
      K.solid(x, z, 1.3, 1.2, yaw, 2.4, 'concrete');
    }
    // THE TEMPLE: three stepped tiers (each one a climb), a steep stair up the south face, the shrine on top
    const tiers = [[9.5, 1.6], [6.8, 3.2], [4.4, 4.8]];
    // (each tier is solid, with a notch where the stair runs up its south face, so the stair is never blocked)
    const SW = 1.45;
    for (const [half, y] of tiers) {
      K.box(cx, 0, cz, half, y, half, 0, 'jStone'); K.deck(cx, cz, half, half, 0, y, { draw: false, climb: true });
      const zf = cz + half, zn = zf - 1.2;
      K.solid(cx, (cz - half + zn) / 2, half, (zn - (cz - half)) / 2, 0, y, 'concrete');
      for (const sd of [-1, 1]) { const x0 = cx + sd * SW, x1 = cx + sd * half; K.solid((x0 + x1) / 2, (zn + zf) / 2, Math.abs(x1 - x0) / 2, 0.6, 0, y, 'concrete'); }
    }
    K.stairs(cx, cz + 4.4 + 3.6, Math.PI, 2.8, 7.2, 0, 4.8, 'jStone2', { rails: false });
    for (const sd of [-1, 1]) K.block(cx + sd * 1.65, 0, cz + 8.0, 0.25, 2.6, 3.6, 0, 'jStone', 'concrete', false);
    // the shrine: four stone walls (doorway south), a lintel, a flat stone roof; the altar and the old chest inside
    const Y = 4.8, sw = 3.0, wt = 0.45;
    const sw2 = (ax, az, bx, bz, o = {}) => K.wall(cx + ax, cz + az, cx + bx, cz + bz, { h: 2.8, t: wt, y0: Y, mat: 'jStone', inMat: 'jStone2', surf: 'concrete', ...o });
    sw2(-sw, sw, sw, sw, { openings: [{ at: 0, w: 1.4, top: 2.2 }] });
    sw2(sw, -sw, -sw, -sw); sw2(sw, sw, sw, -sw, { openings: [{ at: 0, w: 0.5, sill: 1.2, top: 1.8 }] }); sw2(-sw, -sw, -sw, sw, { openings: [{ at: 0, w: 0.5, sill: 1.2, top: 1.8 }] });
    K.box(cx, Y + 2.8, cz, sw + 0.5, Y + 3.3, sw + 0.5, 0, f => f === 'bot' ? 'jStone2' : 'jStone');
    K.box(cx, Y + 3.3, cz, sw - 0.4, Y + 3.8, sw - 0.4, 0, 'jStone');
    K.block(cx, Y, cz - 1.6, 1.1, Y + 0.95, 0.55, 0, 'jStone2', 'concrete');
    K.container('atticCase', cx, cz - 1.0, Y + 0.95, 'Carved stone chest', Math.PI);
    notes.push({ x: cx, z: cz - 1.0, y: Y + 1.0, id: 'ruins' });
    for (let i = 0; i < 5; i++) K.xadd(G.skull, K.MAT.white || K.MAT.trim, mat4(cx + rr(-1, 1), Y + 0.98, cz - 1.6 + rr(-0.3, 0.3), R() * 6), false);
    for (let i = 0; i < 10; i++) K.inst(G.vineCard, M.jVine, mat4(cx + rr(-9, 9), rr(2.5, 4.8), cz - 9.6 + (i % 2) * 19.2, (i % 2) * Math.PI, rr(1, 1.8), rr(1.5, 2.8), 1), false);
    for (let i = 0; i < 24; i++) { const a = R() * 6.28, d = rr(10.5, 13); fernAt(cx + Math.cos(a) * d, cz + Math.sin(a) * d, rr(0.7, 1.3)); }
    // a dead looter at the foot of the stair, his lamp still beside him (outbreak layer)
    K.chaos(cx, cz + 12, () => { K.container('corpse', cx + 2.6, cz + 12.5, 0.2, 'Dead man', 0, null, { fixed: [['flashlight', 1]] }); K.blood(cx + 2.6, cz + 12.5, 1.2); });
    // a ruined well / cistern and a field of fallen blocks
    for (let i = 0; i < 14; i++) { const x = rr(68, 104), z = rr(-34, 2); if (Math.hypot(x - cx, z - cz) < 14 || (z > -14 && x < 92) || (z < -28 && x < 82)) continue; K.block(x, 0, z, rr(0.4, 0.9), rr(0.4, 1.0), rr(0.4, 0.9), R() * 6, 'jStone', 'concrete', true); }
  }

  // ================================================================ the ranger station (west, on stilts) and the plane wreck
  stiltHut(-84, 60, Math.PI / 2, 6.4, 4.6, 2.8, 'ranger', (Q, Y) => {
    { const [a, b] = Q(-2.2, -1.4); cot(a, b, Math.PI, Y, 'fabric4', 0.4, 0.95); K.container('nightstand', a, b, Y + 0.45, 'Bunk', Math.PI / 2); }
    { const [a, b] = Q(-0.4, 1.8); D.abox(JA, { nz: 'gunCab', pz: 'gunCab', side: 'olive', top: 'olive' }, a, Y, b, 1.0, Y + 0.8, 0.35, Math.PI / 2); K.solid(a, b, 1.0, 0.35, Math.PI / 2, Y + 0.8, 'metal', Y); K.container('police', a, b, Y + 0.8, 'Ranger\'s gun locker', Math.PI / 2, null, { fixed: [['ammo9', 10]] }); }
    { const [a, b] = Q(1.3, -1.6); D.abox(D.A, { pz: 'cabWood2', nz: 'cabWood2', side: 'white', top: 'white' }, a, Y, b, 0.45, Y + 1.6, 0.3, Math.PI / 2); K.solid(a, b, 0.45, 0.3, Math.PI / 2, Y + 1.6, 'wood', Y); K.container('kitchen', a, b, Y + 1.0, 'Kitchen cupboard', Math.PI / 2); }
  });
  {
    // an old twin-prop plane, years in the trees: fuselage, a wing torn off, the tail up in the canopy
    const x = -70, z = 100, yaw = 0.6, Q = P(x, z, yaw), body = K.std({ map: K.TX.paintedMetalTexture([150, 154, 148]), roughness: 0.55, metalness: 0.55 });
    // the fuselage carries the skin with its windows, stripe and registration (uv turned to run along its length)
    { const fg = new THREE.CylinderGeometry(1.1, 0.9, 9, 18, 1, false), fu = fg.attributes.uv; for (let i = 0; i < fu.count; i++) { const u = fu.getX(i), v = fu.getY(i); fu.setXY(i, v, u + 0.25); } fg.rotateZ(Math.PI / 2);
      K.xadd(fg, M.jPlane, mat4(x, 1.0, z, yaw, 1, 1, 1, 0, 0.06)); }
    K.xadd(new THREE.SphereGeometry(1.1, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(-Math.PI / 2), body, mat4(...Q(4.5, 0).flatMap((v, i) => i ? [v] : [v, 1.25]), yaw));
    K.xadd(K.GEO.ubox, body, mat4(...Q(0.5, 0).flatMap((v, i) => i ? [v] : [v, 1.4]), yaw, 1.8, 0.14, 6.5, 0.06, 0.04));
    K.xadd(K.GEO.ubox, body, mat4(...Q(2, 5).flatMap((v, i) => i ? [v] : [v, 0.3]), yaw + 0.5, 1.6, 0.14, 5.0, 0.3, 0.2));
    K.xadd(K.GEO.ubox, body, mat4(...Q(-4.5, 0).flatMap((v, i) => i ? [v] : [v, 2.3]), yaw, 1.2, 1.8, 0.12));
    K.solid(x, z, 4.6, 1.1, yaw, 2.2, 'metal');
    { const [a, b] = Q(2, 5); K.solid(a, b, 0.8, 2.5, yaw + 0.5, 0.8, 'metal', 0, { vault: true }); }
    K.container('truck', ...Q(1, -1.4), 0.8, 'Plane cargo hold', yaw);
    // the engines: a nacelle on the wing still attached (bent prop), the other lying in the ferns where it fell
    { const [a, b] = Q(0.9, -2.6), [c, d] = Q(-1.2, 7.5), nac = new THREE.CylinderGeometry(0.42, 0.32, 2.0, 14).rotateZ(Math.PI / 2), cone = new THREE.SphereGeometry(0.42, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(-Math.PI / 2).translate(1.0, 0, 0);
      for (const [ex, ez, ey, tilt] of [[a, b, 1.25, 0.06], [c, d, 0.38, 0.5]]) {
        K.xadd(nac, M.jPlane, mat4(ex, ey, ez, yaw, 1, 1, 1, tilt, 0.04)); K.xadd(cone, M.jMetalDark, mat4(ex, ey, ez, yaw, 1, 1, 1, tilt, 0.04));
        for (let k = 0; k < 3; k++) K.xadd(K.GEO.ubox, M.jMetalDark, mat4(ex + Math.cos(yaw) * 1.45, ey, ez - Math.sin(yaw) * 1.45, yaw, 0.04, 1.5, 0.14, k * 1.047 + tilt, k === 1 ? 0.5 : 0)); }
      K.solid(c, d, 1.1, 0.45, yaw, 0.8, 'metal', 0, { vault: true }); }
    // its cockpit glass, crazed and dirty
    K.xadd(new THREE.SphereGeometry(1.0, 12, 8, -0.9, 1.8, 0.5, 0.9).rotateZ(-Math.PI / 2), K.MAT.glass || M.jMetalDark, mat4(...Q(4.1, 0).flatMap((v, i) => i ? [v] : [v, 1.35]), yaw), false);
    for (let i = 0; i < 6; i++) K.inst(G.vineCard, M.jVine, mat4(...Q(rr(-4, 4), rr(-0.8, 0.8)).flatMap((v, k) => k ? [v] : [v, 2.1]), R() * 6, 1, rr(1, 2), 1), false);
  }

  // ================================================================ where the dead come from
  const spawns = [];
  for (let i = 0; i < 16; i++) spawns.push({ x: -134 + R() * 4, z: -90 + i * 12 }, { x: 134 - R() * 4, z: -90 + i * 12 });
  for (let x = -120; x <= 120; x += 20) if (Math.abs(x + 25) > 14) spawns.push({ x, z: -93 });
  spawns.push({ x: 45, z: -110 }, { x: 46, z: -128 }, { x: 0, z: -125 }, { x: 101, z: -105 }, { x: 70, z: -125 });
  spawns.push({ x: -100, z: 106 }, { x: -60, z: 108 }, { x: 110, z: 106 }, { x: RIVER_X(100) + 8, z: 100 });
  for (const s of spawns) K.spawn(s.x, s.z);

  // the spots the story talks about
  const SPOTS = { start: START, campGen: { x: -74, z: -25.2 }, beachCamp: { x: 56, z: 92 }, dock: { x: 40, z: 116 }, boat: LZ, camp: { x: -68, z: -36 }, campLab: { x: -64, z: -40 }, caveMouth: { x: 45, z: -100 }, caveLab: { x: 96, z: -127 }, radio: radioSpot, ruins: { x: 92, z: -24 }, lake: { x: -7, z: -130 }, batCave: { x: 46, z: -127 }, bridgeN: { x: RIVER_X(-40), z: -40 }, bridgeS: { x: RIVER_X(60), z: 60 }, ford: { x: RIVER_X(100), z: 100 }, ranger: { x: -84, z: 60 }, waterfall: { x: -25, z: -92 } };
  W.jungle = { SPOTS, bridges, cave: caveSet };
  return {
    name: 'Rio Verde', start: START, lz: LZ, lzName: 'the north dock', spawns, bounds: W.bounds, preset: 'jungle', ambient: 'jungle',
    names: { lz: 'the north dock', town: 'Rio Verde', boat: 'the RIO LENTO', camp: 'the Halvorsen camp', cave: 'the Throat', radio: 'the cave radio' },
    notes, spots: SPOTS, radio: radioSpot,
  };
}
export default buildMap;
