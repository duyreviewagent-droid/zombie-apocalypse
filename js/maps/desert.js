// Zombie_Apocalypse — DESERT VILLAGE: Arroyo Seco ("Dry Creek").
// A sun-baked adobe village where the old highway crosses a dry riverbed. North to south:
//   · the mesa road and the north lane (houses, the water tower);
//   · the village: thick-walled mud-brick houses with flat roofs you can walk on (a stair in every courtyard),
//     the market square with its striped stalls round the OLD WELL (the bad water), the whitewashed chapel and its
//     bell tower (climb it: five flights to the bells), the café, the general store, the clinic;
//   · Main Street running east to the highway: the old gas station, Rafi's garage;
//   · the wadi — a dry riverbed sunk two metres into the plain — with a stone footbridge and the highway bridge;
//   · the palm grove and its walled garden plots south of the wadi;
//   · east of the highway: the dirt airstrip, its radio shack and windsock. The mail plane lands at 05:30.
//   · all round: dunes, and red mesas on the horizon.
// Coordinates: x east, z south (−z is north). Ground 0 except the wadi, the rocky hill (NW) and the dunes outside.
import { install, rng, mat4, labelTex, desertDecor } from './desert.kit.js';

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const wadiZ = x => 52 + 5 * Math.sin(x / 23);
export const HWY = 76, STRIP = 92;
// the ground: the wadi trench, a rocky hill in the north-west corner, dunes beyond the edge (not over the highway)
export function heightAt(x, z) {
  const dw = Math.abs(z - wadiZ(x));
  let h = -3.0 * (1 - smooth(5.5, 9.5, dw));
  // scree on the banks: lumpy, not a clean ramp (strongest half-way down the slope)
  { const bk = smooth(4.8, 7.2, dw) * (1 - smooth(8.2, 10.5, dw)); if (bk > 0) h += bk * (0.22 * Math.sin(x * 1.7 + z * 0.6) * Math.cos(z * 1.3 - x * 0.4) + 0.12 * Math.sin(x * 3.9 - z * 2.7)); }
  h += 6.5 * Math.exp(-((x + 90) ** 2 + (z + 90) ** 2) / 260);
  const e = Math.max(Math.abs(x), Math.abs(z));
  if (e > 110) {
    const k = smooth(110, 130, e) * (1 - smooth(152, 166, e)) * smooth(9, 22, Math.abs(x - HWY));
    h += k * (4.5 + 3 * Math.sin(x * 0.05 + z * 0.03) + 2 * Math.sin(z * 0.081 - x * 0.023) + 1.2 * Math.sin(x * 0.17 + 1.3));
  }
  return h;
}
// named places (the story's spot keys)
export const SPOTS = {
  home: { x: -34, z: 2.4 }, market: { x: -12, z: -13 }, well: { x: -4, z: -4 }, square: { x: -4, z: 2 },
  chapel: { x: -6, z: -23 }, tower: { x: 5, z: -31 }, cafe: { x: 19, z: -12 }, clinic: { x: -73, z: 3 },
  gas: { x: 64, z: 11 }, strip: { x: STRIP, z: -40 }, plane: { x: STRIP, z: -62 }, shack: { x: 102, z: -84 },
  waterTower: { x: 44, z: -48 }, jeep: { x: -62, z: 37.4 }, kidHouse: { x: 0, z: 18 }, grove: { x: -55, z: 82 },
};

export function buildMap(K) {
  const { THREE, W } = K;
  K.bounds(-108, -108, 108, 108);
  K.preset('desert');
  const { M, G } = install(K);
  const { D, DA } = desertDecor(K);   // designed fronts: kitchens, shop shelves, the café, the clinic, the garage
  const R = rng(1977);
  const PI = Math.PI;
  const hY = heightAt;
  const Lf = (x, z, yaw) => { const c = Math.cos(yaw), s = Math.sin(yaw); return (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c]; };
  const inst = (geo, mat, m, sh = true) => K.inst(geo, typeof mat === 'string' ? M[mat] : mat, m, sh);
  const xadd = (geo, mat, m, sh = true) => K.xadd(geo, typeof mat === 'string' ? M[mat] : mat, m, sh);
  const DOORS = [0x2e5c8c, 0x2a6a6a, 0x3a6a3a, 0x7a3a24, 0xa8802a, 0x3a4a7a, 0x5a3a28];
  const notes = [];
  // ---- night: every lantern is a K.lamp (the street-lamp machinery: on at dusk, the nearest few borrow one of the
  // world's real spot lights) and throws a soft pool of warm light on the ground under it (an additive decal)
  const lampAt = (x, y, z, o = {}) => {
    const tx = o.tx ?? x, tz = o.tz ?? z;
    if (K.lamp) K.lamp(x, y, z, { pow: o.pow ?? 0.32, dist: o.dist ?? 9, angle: o.angle ?? 1.15, tx, tz, col: o.col ?? 0xffb468, reach: o.reach ?? 0 });
    const pr = o.pool ?? 2.4; if (pr > 0) xadd(G.rug, M.pool, mat4(tx, (o.gy ?? Math.max(0, hY(tx, tz))) + 0.035, tz, 0, pr * 2, 1, pr * 2), false);
  };
  const blk = (x, y0, z, hx, y1, hz, yaw, mat, surf = 'wood', extra = {}) => K.block(x, y0, z, hx, y1, hz, yaw, mat, surf, true, extra);
  // sign text: font sized from the sign's shape, then shrunk so the widest line fits 88 % of the canvas (nothing cut off)
  const mctx = (typeof document !== 'undefined') ? document.createElement('canvas').getContext('2d') : null;
  const fitFont = (lines, w, h) => {
    let px = Math.round(Math.min(110, 400 * h / w / lines.length));
    if (mctx) { mctx.font = `bold ${px}px Georgia`; const mw = Math.max(...lines.map(l => mctx.measureText(l).width)); if (mw > 512 * 0.88) px = Math.floor(px * 512 * 0.88 / mw); }
    return `bold ${px}px Georgia`;
  };
  const signTex = (lines, w, h, bg, fg) => labelTex(lines, bg, fg, 512, Math.max(64, Math.round(512 * h / w)), fitFont(lines, w, h));
  const sign = (lines, x, y, z, yaw, w, h, bg = '#e8dcc0', fg = '#3a2a1a') => { const m = K.mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: signTex(lines, w, h, bg, fg), roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }), x, y, z, yaw); m.castShadow = false; return m; };
  const note = (id, x, z, y) => notes.push({ id, x, z, y });

  // ================================================================ ground
  K.terrain(heightAt, 1);
  // the square: big sandstone flags; Main Street and the lanes: packed gravel
  K.slab(-22, -18, 14, 8, 'd_sandstone', 'concrete');
  K.region(14, -7.5, HWY - 4.2, -0.5, 'dirt', 'gravel');
  K.region(-82, -7.5, -22, -0.5, 'dirt', 'gravel');
  K.region(-70, -47, 40, -41, 'dirt', 'gravel');
  K.region(-82, 18, 50, 21, 'dirt', 'gravel');
  K.region(-25, -45, -21, 8, 'dirt', 'gravel'); K.region(12, -45, 16, -18, 'dirt', 'gravel');
  // the wadi bed: dark gravel and old flood silt along the bottom
  for (let x = -160; x <= 160; x += 3) { K.paint(x, wadiZ(x), 7, 'dirt', 0.5); if (R() < 0.6) K.paint(x + R() * 3, wadiZ(x) + (R() - 0.5) * 6, 2.5, 'mud', 0.25); }

  // ================================================================ the highway (north–south) and its bridge
  {
    const hw = 4.2, z0 = -170, z1 = 170, wz = wadiZ(HWY);
    for (let z = z0; z < z1; z += 20) {
      const za = z, zb = Math.min(z1, z + 20), mid = (za + zb) / 2;
      const inDip = Math.abs(mid - wz) < 14;
      K.box(HWY, inDip ? -0.55 : -0.3, mid, hw, 0.025, (zb - za) / 2, 0, f => f === 'top' ? 'd_asphalt' : f === 'bot' ? null : inDip ? 'concrete' : null);
    }
    // the centre line (dashed) and the edge lines (solid, worn)
    for (let z = z0; z < z1; z += 9) K.box(HWY, 0.026, z, 0.08, 0.03, 2.2, 0, f => f === 'top' ? 'd_paintY' : null);
    for (const sx of [-1, 1]) for (let z = z0; z < z1; z += 30) K.box(HWY + sx * (hw - 0.25), 0.026, z + 15, 0.07, 0.03, 14.6, 0, f => f === 'top' ? 'd_paintW' : null);
    K.region(HWY - hw, -170, HWY + hw, 170, 'paved', 'asphalt');
    // the bridge over the wadi: deck at road level, concrete parapets, two piers down to the bed
    K.deck(HWY, wz, hw, 13, 0, 0.03, { draw: false });
    for (const sx of [-1, 1]) {
      blk(HWY + sx * (hw + 0.2), 0, wz, 0.2, 0.95, 13, 0, 'concrete', 'concrete');
      for (let k = -12; k <= 12; k += 3) K.box(HWY + sx * (hw + 0.2), -0.55, wz + k, 0.22, 0, 0.25, 0, 'concrete');
    }
    for (const dz of [-4.5, 4.5]) blk(HWY, -3.2, wz + dz, hw - 0.6, -0.55, 0.45, 0, 'concrete', 'concrete');
    // road signs
    // a road sign: the printed face on the front only, a galvanised back panel behind it, two posts (they stand
    // behind the panel, so they line up with it whichever way it faces)
    const sgn = (lines, x, z, yaw, bg = '#1e5a32', fg = '#f0f0e8') => {
      const c = Math.cos(yaw), sn = Math.sin(yaw);
      for (const o of [-0.5, 0.5]) inst(G.post, 'metal', mat4(x + o * c - sn * 0.06, 0, z - o * sn - c * 0.06, 0, 1, 2.75, 1));
      xadd(G.ubox, 'signBack', mat4(x - sn * 0.025, 2.25 - 0.47, z - c * 0.025, yaw, 1.66, 0.94, 0.04));
      const m = K.mesh(new THREE.PlaneGeometry(1.6, 0.9), new THREE.MeshStandardMaterial({ map: (K.TX.signTexture ? K.TX.signTexture(lines, bg, fg) : null), color: K.TX.signTexture ? 0xffffff : 0x1e5a32, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }), x + sn * 0.002, 2.25, z + c * 0.002, yaw);
      m.castShadow = false; K.solid(x, z, 0.6, 0.08, yaw, 2.6, 'metal');
      return m;
    };
    sgn(['ARROYO SECO', 'pop. 212'], HWY - 6, -24, 0);
    sgn(['LAS PIEDRAS 40', 'MESA ROJA 12'], HWY + 6, 30, PI);
    sgn(['AIRSTRIP', '→'], HWY + 6, -46, 0, '#6a4a22');   // faces drivers heading north: the arrow points east, to the strip
    // gravel shoulders either side of the tarmac, white marker posts with amber reflectors (not on the bridge)
    for (let z = z0; z < z1; z += 20) {
      const mid = z + 10; if (Math.abs(mid - wz) < 16) continue;
      for (const sx of [-1, 1]) K.box(HWY + sx * (hw + 0.75), -0.3, mid, 0.75, 0.012, 10, 0, f => f === 'top' ? 'd_gravel' : null);
    }
    for (let z = z0 + 6; z < z1; z += 25) { if (Math.abs(z - wz) < 15) continue;
      for (const sx of [-1, 1]) { const px = HWY + sx * (hw + 1.6); inst(G.post, 'white', mat4(px, 0, z, 0, 1.3, 1.05, 1.3)); inst(G.ubox, 'lanternOn', mat4(px, 0.82, z + (sx < 0 ? 0.08 : -0.08), 0, 0.05, 0.12, 0.012), false); } }
  }

  // ================================================================ the adobe house
  // local frame: front (door, courtyard, gate) toward local +z. w across, d deep, yd: courtyard depth.
  let houseN = 0;
  function adobe(o) {
    const { x, z, yaw, w = 9, d = 8, yd = 6, h = 3.1 } = o;
    const r = rng(o.seed || (houseN * 97 + 13)); houseN++;
    const P = Lf(x, z, yaw), Y = a => yaw + a;
    const pl = 'd_plaster' + (o.tint ?? Math.floor(r() * 8));
    const ss = o.stairSide ?? (r() < 0.5 ? -1 : 1);         // the courtyard stair runs along this side
    const doorLx = -ss * Math.min(2.2, w / 4), col = DOORS[Math.floor(r() * DOORS.length)];
    const bd = 3.2, zs = -d / 2 + bd;                         // the back room (bedroom) and the partition
    const H = K.room(x, z, w, d, yaw, {
      h, t: 0.4, mat: pl, inMat: 'd_plasterIn', floor: o.floor || (r() < 0.5 ? 'd_tile' : 'd_earth'), roof: 'flat', roofMat: 'd_earth', parapet: false,
      doors: [{ side: 'n', at: -doorLx, w: 1.1, col, dir: -1, front: true }],
      windows: [
        { side: 'n', at: doorLx > 0 ? w / 4 + 0.3 : -(w / 4 + 0.3), w: 0.8, sill: 1.2, top: 2.0 },
        { side: 'e', at: -d / 2 + bd / 2, w: 0.7, sill: 1.3, top: 2.0 }, { side: 'w', at: d / 2 - bd / 2, w: 0.7, sill: 1.3, top: 2.0 },
        ...(r() < 0.6 ? [{ side: 's', at: (r() - 0.5) * (w - 3), w: 0.6, sill: 1.5, top: 2.1 }] : []),
      ],
      inside: [[0, (zs + d / 2) / 2], [0, (-d / 2 + zs) / 2]], name: o.name || ('house ' + houseN), home: o.home,
      lit: o.lit ?? ((((houseN + 7) * 2654435761) >>> 0) % 100 < 40),
    });
    H.yTop = () => h + 0.22; H.desert = true;
    const top = h + 0.22, slx = ss * (w / 2 + 0.2 - 0.35 - 0.47);
    // --- the partition and the bedroom door ---
    { const [ax, az] = P(-w / 2 + 0.2, zs), [bx, bz] = P(w / 2 - 0.2, zs); K.wall(ax, az, bx, bz, { h, t: 0.18, mat: 'd_plasterIn', inMat: 'd_plasterIn', openings: [{ at: 0, w: 1.0, door: true, interior: true, dir: 1, col: 0x6a4a30 }], house: H }); }
    // --- vigas: the roof beams poke out through the front and back walls; rain spouts (canales) ---
    for (let lx = -w / 2 + 0.45; lx < w / 2 - 0.3; lx += 0.75) for (const sd of [1, -1]) {
      const [vx, vz] = P(lx, sd * (d / 2 - 0.1)); inst(G.ucyl, 'beam', mat4(vx, h - 0.16, vz, Y(sd > 0 ? 0 : PI), 0.17, 0.62, 0.17, PI / 2));
    }
    for (const sx of [-1, 1]) { const [cx, cz] = P(sx * (w / 2 - 1.2), -d / 2 - 0.35); xadd(G.ubox, 'beam', mat4(cx, top - 0.12, cz, yaw, 0.18, 0.12, 0.7)); }
    // a lintel beam over the door and windows, outside
    { const [lx2, lz2] = P(doorLx, d / 2 + 0.22); xadd(G.ubox, 'beam', mat4(lx2, 2.14, lz2, yaw, 1.5, 0.16, 0.12)); }
    // the parapet round the roof (solid, low enough to hop off), with a gap where the stair comes up; roof clutter.
    const roofBits = K.sub(() => {
      const t2 = 0.3, ph = 0.55, sx0 = slx;
      const par = (lx0, lz0, lx1, lz1) => { const [ax, az] = P((lx0 + lx1) / 2, (lz0 + lz1) / 2), hx = Math.abs(lx1 - lx0) / 2 || t2 / 2, hz = Math.abs(lz1 - lz0) / 2 || t2 / 2; K.box(ax, top, az, hx, top + ph, hz, yaw, f => f === 'bot' ? null : f === 'top' ? 'd_mudBrick' : pl); K.solid(ax, az, hx, hz, yaw, top + ph, 'concrete', top, { vault: true }); };
      const e = w / 2 + 0.2, f = d / 2 + 0.2;
      par(-e, -f, e, -f + t2); par(-e, -f + t2, -e + t2, f - t2); par(e - t2, -f + t2, e, f - t2);
      // front: two runs either side of the stair head
      const g0 = sx0 - 0.55, g1 = sx0 + 0.55;
      if (g0 > -e + 0.1) par(-e, f - t2, g0, f); if (g1 < e - 0.1) par(g1, f - t2, e, f);
      // a water barrel, a satellite dish or a palm-frond shade
      const k = r();
      if (k < 0.45) { const [bx, bz] = P(-ss * (w / 2 - 1.0), -d / 2 + 1.0); inst(G.tank, 'whiteMetal', mat4(bx, top, bz, 0, 0.55, 1.2, 0.55)); K.solid(bx, bz, 0.55, 0.55, 0, top + 1.2, 'metal', top); }
      else if (k < 0.75) { const [bx, bz] = P(-ss * (w / 2 - 1.5), -d / 2 + 1.2); for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const [qx, qz] = P(-ss * (w / 2 - 1.5) + px * 1.1, -d / 2 + 1.2 + pz * 0.9); xadd(G.ucyl, 'beam', mat4(qx, top, qz, 0, 0.1, 2.0, 0.1)); } xadd(G.ubox, 'd_frond' in K.MAT ? M.frond : M.greyWood, mat4(bx, top + 2.0, bz, yaw, 2.5, 0.04, 2.1)); xadd(G.ubox, 'greyWood', mat4(bx, top + 1.96, bz, yaw, 2.4, 0.04, 0.08)); }
      else { const [bx, bz] = P(ss * (w / 2 - 1.0), -d / 2 + 0.8); inst(G.hemi, 'whiteMetal', mat4(bx, top + 0.9, bz, yaw + 0.6, 0.45, 0.12, 0.45, -1.0)); inst(G.post, 'darkMetal', mat4(bx, top, bz, 0, 0.6, 0.9, 0.6)); }
      // laundry line between two poles
      if (r() < 0.5) { const [ax, az] = P(-w / 2 + 1, -0.5), [bx, bz] = P(w / 2 - 1.6, -0.5); K.wbeam([ax, top + 1.6, az], [bx, top + 1.6, bz], 0.012, 0.012, M.darkMetal); for (const [qx, qz] of [[ax, az], [bx, bz]]) inst(G.post, 'beam', mat4(qx, top, qz, 0, 0.7, 1.65, 0.7)); for (let i = 0; i < 4; i++) { const t = 0.15 + i * 0.22, cx = ax + (bx - ax) * t, cz = az + (bz - az) * t; xadd(G.ubox, ['fabricA', 'fabricB', 'fabricC', 'awn1'][i], mat4(cx, top + 1.05, cz, yaw, 0.55, 0.55, 0.01), false); } }
    });
    if (H.roof) H.roof.add(roofBits);
    K.deck(...P(0, 0), w / 2 + 0.1, d / 2 + 0.1, yaw, top, { draw: false });
    // --- the courtyard: walls, gate, stair to the roof, oven, a tree ---
    if (yd > 0) {
      const cw = w / 2 + 0.2, ch = 2.3, ct = 0.35, zf = d / 2 + yd;
      for (const sx of [-1, 1]) { const [ax, az] = P(sx * (cw - ct / 2), d / 2 + 0.2), [bx, bz] = P(sx * (cw - ct / 2), zf + ct / 2); K.wall(ax, az, bx, bz, { h: ch, t: ct, mat: pl, inMat: pl, surf: 'concrete' }); }
      { const [ax, az] = P(-cw, zf), [bx, bz] = P(cw, zf); K.wall(ax, az, bx, bz, { h: ch, t: ct, mat: pl, inMat: pl, openings: [{ at: doorLx, w: 1.5, door: true, col: DOORS[(DOORS.indexOf(col) + 2) % DOORS.length], dir: 1, hp: 220 }], house: null }); }
      // the gate's arch: a beam over it and a rounded crown of mud brick
      { const [gx, gz] = P(doorLx, zf); xadd(G.ubox, 'beam', mat4(gx, ch + 0.05, gz, yaw, 1.9, 0.14, 0.42)); K.box(gx, ch, gz, 1.1, ch + 0.55, 0.2, yaw, f => f === 'bot' ? null : pl); }
      // a lantern on the street side of the gate (lights the lane at night)
      { const lx3 = doorLx + (doorLx > 0 ? -1.05 : 1.05), [qx, qz] = P(lx3, zf + 0.32), [px3, pz3] = P(doorLx, zf + 1.5); inst(G.lantern, 'lanternOn', mat4(qx, ch - 0.05, qz), false); { const [bx3, bz3] = P(lx3, zf + 0.26); xadd(G.ubox, 'darkMetal', mat4(bx3, ch - 0.05, bz3, yaw, 0.03, 0.03, 0.16), false); } lampAt(qx, ch - 0.2, qz, { tx: px3, tz: pz3, pool: 2.4 }); }
      // paving: a tiled path from the gate to the door, packed earth either side
      { const [px, pz] = P(doorLx, d / 2 + yd / 2); K.box(px, 0, pz, 0.7, 0.025, yd / 2 - 0.1, yaw, f => f === 'top' ? 'd_tile' : null); }
      // the stair up to the roof: a solid mass of mud brick along the side wall
      const sl = Math.min(yd - 1.3, 4.6), [scx, scz] = P(slx, d / 2 + 0.2 + sl / 2);
      K.stairs(scx, scz, Y(PI), 0.9, sl, 0, top, pl, { rails: false });
      for (let k = 1; k <= 3; k++) { const a = d / 2 + 0.2, b = d / 2 + 0.2 + sl * (1 - k / 4), [bx, bz] = P(slx, (a + b) / 2); K.solid(bx, bz, 0.45, (b - a) / 2, yaw, top * k / 4 - 0.05, 'concrete'); }
      // the bread oven (tannur) in the front corner, a tree or a palm on the other side
      { const [ox, oz] = P(ss * (cw - 0.8), zf - 0.7); xadd(G.pot, 'clay', mat4(ox, 0, oz, 0, 2.2, 2.6, 2.2)); K.solid(ox, oz, 0.42, 0.42, 0, 0.8, 'concrete', 0, { vault: true }); }
      if (r() < 0.55) { const [tx, tz] = P(-ss * (cw - 1.1), zf - 1.2); palm(tx, tz, 5 + r() * 3, r); }
      else { const [tx, tz] = P(-ss * (cw - 1.2), zf - 1.3); K.tree(tx, tz, 0.55 + r() * 0.2, 0); }
      // a tool crate by the house wall
      { const [cx, cz] = P(-ss * (cw - 0.65), d / 2 + 0.75); blk(cx, 0, cz, 0.42, 0.55, 0.3, yaw, 'd_greyWood', 'wood'); K.container(r() < 0.5 ? 'shed' : 'garage', cx, cz, 0.55, 'Tool crate', yaw, null); }
      // plastic chairs, a water jar on a stand, a hanging lantern by the door
      { const [jx, jz] = P(doorLx + (doorLx > 0 ? -1.0 : 1.0), d / 2 + 0.6); inst(G.jar, 'clay', mat4(jx, 0, jz, r() * 6, 1.5, 1.5, 1.5)); }
      { const [lx2, lz2] = P(doorLx + (doorLx > 0 ? 0.85 : -0.85), d / 2 + 0.32), [px2, pz2] = P(doorLx + (doorLx > 0 ? 0.5 : -0.5), d / 2 + 1.6); inst(G.lantern, 'lanternOn', mat4(lx2, 2.35, lz2), false); xadd(G.ubox, 'darkMetal', mat4(lx2, 2.35, lz2, yaw, 0.03, 0.03, 0.34), false); lampAt(lx2, 2.2, lz2, { tx: px2, tz: pz2, pool: 2.2 }); }
    }
    // --- inside: the bedroom ---
    const bed = P(-ss * (w / 2 - 1.3), -d / 2 + 0.72);
    blk(...[bed[0], 0, bed[1]], 1.03, 0.36, 0.5, yaw, 'd_greyWood', 'wood');
    K.box(bed[0], 0.36, bed[1], 0.98, 0.52, 0.46, yaw, 'd_fabricC');
    { const [px, pz] = P(-ss * (w / 2 - 0.55), -d / 2 + 0.72); xadd(G.ubox, 'fabricC', mat4(px, 0.52, pz, yaw, 0.4, 0.12, 0.6)); const [bx, bz] = P(-ss * (w / 2 - 1.55), -d / 2 + 0.72); xadd(G.ubox, r() < 0.5 ? 'fabricA' : 'fabricB', mat4(bx, 0.52, bz, yaw, 1.35, 0.06, 0.96)); }
    { const [nx, nz] = P(-ss * (w / 2 - 2.65), -d / 2 + 0.45); blk(nx, 0, nz, 0.24, 0.55, 0.22, yaw, 'd_redWood', 'wood'); K.container('nightstand', nx, nz, 0.55, 'Bedside table', yaw, H); inst(G.lantern, 'lanternOn', mat4(nx, 0.8, nz), false); }
    { const [cx, cz] = P(ss * (w / 2 - 0.75), -d / 2 + 0.5); D.abox(DA, { pz: 'chest', side: 'wood', top: 'wood' }, cx, 0, cz, 0.45, 0.55, 0.28, yaw); K.solid(cx, cz, 0.45, 0.28, yaw, 0.55, 'wood'); K.container('dresser', cx, cz, 0.55, 'Wooden chest', yaw, H);
      for (const o2 of [-0.3, 0.3]) { const [qx, qz] = P(ss * (w / 2 - 0.75) + o2, -d / 2 + 0.5); xadd(G.ubox, 'brass', mat4(qx, 0, qz, yaw, 0.05, 0.56, 0.58), false); } }
    if (r() < 0.6) { const [wx, wz] = P(ss * (w / 2 - 0.75), zs - 0.45); D.abox(DA, { nz: 'wardrobe', side: 'wood', top: 'wood' }, wx, 0, wz, 0.5, 1.9, 0.28, yaw); K.solid(wx, wz, 0.5, 0.28, yaw, 1.9, 'wood'); K.container('closet', wx, wz, 1.0, 'Wardrobe', yaw, H); }
    { const [rx2, rz2] = P(0, -d / 2 + bd / 2 + 0.3); K.box(rx2, 0.03, rz2, 1.0, 0.04, 0.7, yaw, f => f === 'top' ? 'd_rug' + Math.floor(r() * 3) : null); }
    // --- inside: the living room and kitchen ---
    const kx = ss * (w / 2 - 0.55);
    const ky = yaw + (ss > 0 ? -PI / 2 : PI / 2);   // the kitchen faces into the room
    { const [cx, cz] = P(kx - ss * 0.0, zs + 1.6); D.kitchenRun(cx, cz, ky, [{ k: 'cab', w: 0.8 }, { k: 'hob', w: 0.8 }, { k: 'sink', w: 0.8 }], { cab: 'cabWood2', top: 'd_tileB', splash: 'dzTileZ', splashH: 0.6, d: 0.66, lite: true }); K.container('kitchen', cx, cz, 0.9, 'Kitchen shelves', yaw, H);
      { const [px, pz] = P(kx, zs + 0.95); inst(G.teapot, 'copper', mat4(px, 0.9, pz, r() * 6, 1.4, 1.4, 1.4)); }
      const [sx2, sz2] = P(ss * (w / 2 - 0.28), zs + 1.6); xadd(G.ubox, 'beam', mat4(sx2, 1.6, sz2, yaw, 0.3, 0.05, 2.2));
      for (let i = 0; i < 5; i++) { const [px, pz] = P(ss * (w / 2 - 0.3), zs + 0.7 + i * 0.42); inst(G.jar, i % 2 ? 'clay' : 'clayDark', mat4(px, 1.65, pz, r() * 6, 0.45, 0.45, 0.45)); } }
    { const [fx, fz] = P(kx, zs + 3.2); if (zs + 3.6 < d / 2 - 0.3) { D.fridge(fx, fz, ky, { cell: 'fridgeOld', w: 0.64, h: 1.55, d: 0.66 }); K.container('fridge', fx, fz, 1.0, 'Old fridge', yaw, H); } }
    { const [jx, jz] = P(ss * (w / 2 - 0.55), d / 2 - 0.5); for (const [ox, oz] of [[0, 0], [-0.4, 0.05], [-0.2, -0.38]]) { const [qx, qz] = P(ss * (w / 2 - 0.55) + ox * ss, d / 2 - 0.5 + oz); inst(G.amphora, 'clay', mat4(qx, 0, qz, r() * 6, 0.62, 0.62, 0.62)); } K.solid(jx, jz, 0.5, 0.42, yaw, 0.78, 'concrete', 0, { vault: true }); K.container('pantry', jx, jz, 0.6, 'Storage jars', yaw, H); }
    // the majlis: cushions along the far wall, a rug, a low table with tea
    const mx = -ss * (w / 2 - 0.55);
    for (let i = 0; i < 4; i++) { const [cx, cz] = P(mx, zs + 0.7 + i * 0.7); if (zs + 0.7 + i * 0.7 > d / 2 - 0.5) break; inst(G.cushion, i % 2 ? 'fabricA' : 'fabricB', mat4(cx, 0.03, cz, yaw)); { const [bx2, bz2] = P(mx - ss * 0.25, zs + 0.7 + i * 0.7); inst(G.cushion, 'fabricC', mat4(bx2, 0.15, bz2, yaw, 0.95, 2.6, 0.25)); } }
    { const [cx, cz] = P(-ss * 0.4, (zs + d / 2) / 2); K.box(cx, 0.03, cz, 1.2, 0.04, 0.9, yaw, f => f === 'top' ? 'd_rug' + Math.floor(r() * 3) : null);
      xadd(G.ucyl, 'greyWood', mat4(cx, 0, cz, 0, 0.9, 0.32, 0.9)); inst(G.teapot, 'brass', mat4(cx, 0.32, cz, r() * 6, 1.2, 1.2, 1.2)); K.solid(cx, cz, 0.45, 0.45, 0, 0.32, 'wood', 0, { vault: true }); }
    { const [nx, nz] = P(-ss * (w / 2 - 0.25), zs + 0.5); xadd(G.ubox, 'beam', mat4(nx, 1.2, nz, yaw, 0.3, 0.05, 0.7)); K.container(r() < 0.35 ? 'medicine' : 'cabinet', nx, nz, 1.25, r() < 0.35 ? 'First-aid tin' : 'Wall niche', yaw, H); inst(G.ubox, 'darkMetal', mat4(nx, 1.25, nz, yaw, 0.25, 0.16, 0.3)); }
    if (o.kid) { const [kx2, kz2] = P(0, -d / 2 + 0.45); K.box(kx2, 0.03, kz2, 0.45, 0.04, 0.25, yaw, f => f === 'top' ? 'd_fabricA' : null); note('kid', ...P(-ss * (w / 2 - 1.3), -d / 2 + 0.72), 0.5); }
    H.court = yd > 0 ? P(doorLx, d / 2 + yd / 2) : P(doorLx, d / 2 + 1);
    H.gate = P(doorLx, d / 2 + yd + 1.2);
    return H;
  }

  // ================================================================ palms, scrub, rocks
  const tv = new THREE.Vector3();
  function palm(x, z, Ht = 7, r = R) {
    const y = hY(x, z), lean = (r() - 0.5) * 0.22, ry = r() * 6.28;
    const m = mat4(x, y, z, ry, 1, Ht, 1, lean, (r() - 0.5) * 0.15);
    inst(G.palmTrunk, 'palmBark', m);
    tv.set(0.35, 1, 0).applyMatrix4(m);
    inst(G.palmCrown, 'palmBark', mat4(tv.x, tv.y, tv.z));
    const n = 10 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) { const a = i / n * 6.28 + r() * 0.3, s = 0.8 + r() * 0.35; inst(G.frond, 'frond', mat4(tv.x, tv.y + 0.05, tv.z, a, s, s, s, -0.15 + r() * 0.5)); }
    if (r() < 0.4) for (let i = 0; i < 3; i++) { const ca = i * 2.1 + r(); for (let k = 0; k < 7; k++) inst(G.dates, k % 3 ? 'clayDark' : 'fruit3', mat4(tv.x + Math.cos(ca) * 0.32 + (r() - 0.5) * 0.14, tv.y - 0.3 - k * 0.06, tv.z + Math.sin(ca) * 0.32 + (r() - 0.5) * 0.14, 0, 0.35, 0.35, 0.35), false); }
    // dead fronds hanging down the trunk (the "skirt")
    for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28 + r() * 0.4; inst(G.frond, 'frondDead', mat4(tv.x, tv.y - 0.1, tv.z, a, 0.62, 0.62, 0.62, 1.3 + r() * 0.35)); }
    K.solid(x, z, 0.24, 0.24, 0, y + 3.2, 'wood', y);
  }
  const scrub = (x, z, s = 1) => { inst(G.scrub, 'scrub', mat4(x, hY(x, z), z, R() * 6, s * (0.8 + R() * 0.5), s * (0.5 + R() * 0.4), s * (0.8 + R() * 0.5)), true); };
  // s: metres across (like K.rock). Sunk a little way so it sits IN the ground, not on it.
  const boulder = (x, z, s = 1) => {
    const y = hY(x, z), sy = 0.55 + R() * 0.35, yaw = R() * 6.28, top = y + s * 0.5 * sy * 0.75 * 1.1 - s * 0.1;
    xadd(G.boulder, 'boulder', mat4(x, y - s * 0.1, z, yaw, s * 0.5, s * 0.5 * sy, s * 0.5 * (0.8 + R() * 0.4)));
    K.paint(x, z, s * 0.6, 'dirt', 0.1);
    if (s > 0.6) K.solid(x, z, s * 0.4, s * 0.4, yaw, top, 'concrete', y, top - y < 1.1 ? { vault: true } : {});
  };
  const cactus = (x, z, s = 1) => { inst(G.cactus, 'cactus', mat4(x, hY(x, z), z, R() * 6, s, s * (0.8 + R() * 0.5), s)); K.solid(x, z, 0.22 * s, 0.22 * s, 0, hY(x, z) + 2.2 * s, 'wood', hY(x, z)); };

  // ================================================================ the market square, the well
  // the OLD WELL: a ring of stone, a timber frame, a pulley, a rope, a bucket. The water is bad.
  {
    const wx = SPOTS.well.x, wz = SPOTS.well.z;
    const uvS = (g, su, sv) => { const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * su, uv.getY(k) * sv); return g; };
    xadd(uvS(new THREE.CylinderGeometry(1.15, 1.2, 0.85, 24, 1, true), 7.4 / 2.2, 0.85 / 2.2), 'sandstone', mat4(wx, 0.425, wz));
    xadd(uvS(new THREE.CylinderGeometry(0.85, 0.85, 0.85, 24, 1, true).scale(-1, 1, 1), 5.3 / 2, 0.85 / 2), 'mudBrick', mat4(wx, 0.425, wz));
    xadd(uvS(new THREE.TorusGeometry(1.0, 0.18, 8, 28).rotateX(PI / 2), 6.3 / 2.2, 1.1 / 2.2), 'sandstone', mat4(wx, 0.86, wz, 0, 1, 0.7, 1));
    xadd(new THREE.CircleGeometry(0.85, 24).rotateX(-PI / 2), 'waterGlow', mat4(wx, 0.25, wz), false);
    for (const sx of [-1, 1]) xadd(G.ubox, 'beam', mat4(wx + sx * 1.05, 0.7, wz, 0, 0.16, 2.0, 0.16));
    xadd(G.ucyl, 'beam', mat4(wx - 1.15, 2.55, wz, 0, 0.14, 2.3, 0.14, 0, -PI / 2));
    inst(new THREE.TorusGeometry(0.16, 0.04, 6, 14), M.darkMetal, mat4(wx, 2.55, wz, PI / 2));
    K.wbeam([wx, 2.5, wz], [wx, 1.2, wz], 0.015, 0.015, M.greyWood);
    inst(G.bucket, 'rust', mat4(wx + 0.6, 0.86, wz + 0.4, 0, 1, 1, 1));
    K.solid(wx, wz, 1.2, 1.2, 0, 0.9, 'concrete', 0, { vault: true }); K.solid(wx, wz, 0.85, 0.85, PI / 4, 0.9, 'concrete', 0, { vault: true });
    // Omar's bench, his book
    blk(wx - 2.6, 0, wz + 0.2, 0.25, 0.45, 0.9, 0, 'd_greyWood', 'wood'); K.container('bench', wx - 2.6, wz + 0.2, 0.45, 'Omar\'s bench', 0); note('omar', wx - 2.6, wz + 0.6, 0.47);
    // a trough for animals; the queue's jerrycans
    blk(wx + 2.4, 0, wz - 1.4, 1.1, 0.5, 0.35, 0.3, 'd_sandstone', 'concrete');
    for (let i = 0; i < 6; i++) inst(G.jerry, ['jerryR', 'jerryW', 'jerryB'][i % 3], mat4(wx + 1.6 + i * 0.42, 0, wz + 1.6 + (R() - 0.5) * 0.3, PI / 2 + (R() - 0.5) * 0.4));
    K.chaos(wx, wz, () => { K.blood(wx + 1.2, wz + 0.6, 1.1); K.blood(wx - 0.8, wz + 1.4, 0.7); K.container('corpse', wx + 1.6, wz + 1.0, 0.15, 'Body by the well'); xadd(G.ubox, 'fabricC', mat4(wx + 1.6, 0, wz + 1.0, 0.7, 0.5, 0.25, 1.7)); }, 'well');
  }
  // the stalls: four posts, a counter, a sloping striped awning, the goods
  function stall(x, z, yaw, kind, i) {
    const P = Lf(x, z, yaw), awn = 'awn' + (i % 4);
    for (const [lx, lz, hh] of [[-1.4, -0.9, 2.5], [1.4, -0.9, 2.5], [-1.4, 0.9, 2.1], [1.4, 0.9, 2.1]]) { const [px, pz] = P(lx, lz); xadd(G.ucyl, 'beam', mat4(px, 0, pz, 0, 0.1, hh, 0.1)); K.solid(px, pz, 0.06, 0.06, 0, hh, 'wood'); }
    // awning: tilted down toward the front (+z), scalloped edge
    { const [ax, az] = P(0, 0); xadd(G.ubox, awn, mat4(ax, 2.3, az, yaw, 3.2, 0.02, 2.3, -0.18)); const [fx, fz] = P(0, 1.13); xadd(G.ubox, awn, mat4(fx, 1.92, fz, yaw, 3.2, 0.25, 0.02)); }
    // counter
    const [cx, cz] = P(0, 0.55); blk(cx, 0, cz, 1.35, 0.85, 0.32, yaw, 'd_greyWood', 'wood', { vault: true });
    const [bx, bz] = P(0, -0.7); blk(bx, 0, bz, 1.3, 0.45, 0.25, yaw, 'd_greyWood', 'wood', { vault: true });
    const items = [];
    if (kind === 'fruit') for (let k = 0; k < 26; k++) { const [px, pz] = P(-1.2 + (k % 13) * 0.2, 0.42 + Math.floor(k / 13) * 0.22); items.push([G.fruit, 'fruit' + Math.floor(R() * 3), px, 0.91, pz, 1]); }
    if (kind === 'melon') for (let k = 0; k < 10; k++) { const [px, pz] = P(-1.1 + (k % 5) * 0.5, 0.42 + Math.floor(k / 5) * 0.3); items.push([G.melon, 'fruit2', px, 1.0, pz, 1]); }
    if (kind === 'spice') for (let k = 0; k < 8; k++) { const [px, pz] = P(-1.1 + (k % 4) * 0.7, 0.4 + Math.floor(k / 4) * 0.32); items.push([G.basket, 'greyWood', px, 0.85, pz, 0.6]); items.push([G.spice, 'spice' + (k % 3), px, 0.91, pz, 0.7]); }
    if (kind === 'dates') for (let k = 0; k < 6; k++) { const [px, pz] = P(-1.0 + k * 0.4, 0.55); items.push([G.basket, 'greyWood', px, 0.85, pz, 0.75]); items.push([G.fruit, 'fruit3', px, 0.93, pz, 1.8]); }
    if (kind === 'pots') for (let k = 0; k < 7; k++) { const [px, pz] = P(-1.1 + k * 0.37, 0.55); items.push([k % 2 ? G.jar : G.pot, k % 3 ? 'clay' : 'clayDark', px, 0.85, pz, 0.6]); }
    if (kind === 'cloth') for (let k = 0; k < 6; k++) { const [px, pz] = P(-1.1 + k * 0.45, 0.55); items.push([G.ubox, ['rug0', 'rug1', 'rug2', 'awn0', 'awn2', 'awn3'][k], px, 0.85, pz, 0]); }
    if (kind === 'water') for (let k = 0; k < 4; k++) { const [px, pz] = P(-1.0 + k * 0.66, 0.55); items.push([G.crate, 'greyWood', px, 0.85, pz, 0.8]); items.push([G.jerry, ['jerryB', 'jerryW'][k % 2], px, 0.85 + 0.42 * 0.8, pz, 0.7]); }
    for (const [g, m, px, py, pz, s] of items) { if (s === 0) inst(g, m, mat4(px, py, pz, yaw, 0.38, 0.16, 0.5)); else inst(g, m, mat4(px, py, pz, R() * 6, s, s, s)); }
    // a cloth skirt draped over the counter front, open sacks of spice / grain / beans along the front, a hanging rug
    { const [fx, fz] = P(0, 0.88); xadd(G.ubox, awn, mat4(fx, 0.12, fz, yaw, 2.6, 0.7, 0.02)); const [tx, tz] = P(0, 0.55); K.box(tx, 0.85, tz, 1.38, 0.88, 0.35, yaw, f => f === 'bot' ? null : 'd_greyWood'); }
    if (kind === 'spice' || kind === 'pots' || kind === 'cloth') for (let k = 0; k < 3; k++) { const [px, pz] = P(-0.9 + k * 0.9, 1.25); const sm = ['spice0', 'spice1', 'spice2'][(k + i) % 3]; inst(G.sack, 'burlap', mat4(px, 0, pz, R() * 6, 0.9, 0.75, 0.9)); inst(G.spice, sm, mat4(px, 0.33, pz, R() * 6, 1.0, 0.9, 1.0)); }
    if (kind !== 'melon' && kind !== 'water') K.solid(...P(0, 1.25), 1.3, 0.25, yaw, 0.45, 'cloth', 0, { vault: true });
    if (kind === 'cloth' || kind === 'pots' || kind === 'spice') { const [rx, rz] = P(0, -0.95); xadd(G.ubox, ['rug0', 'rug1', 'rug2'][i % 3], mat4(rx, 0.55, rz, yaw, 2.4, 1.6, 0.02)); K.wbeam([...P(-1.4, -0.95)].flatMap((v, q) => q ? [v] : [v, 2.18]), [...P(1.4, -0.95)].flatMap((v, q) => q ? [v] : [v, 2.18]), 0.03, 0.03, M.beam); }
    if (kind === 'fruit' || kind === 'dates') for (let k = 0; k < 2; k++) { const [px, pz] = P(-0.55 + k * 1.1, 1.25); inst(G.crate, 'greyWood', mat4(px, 0, pz, yaw, 0.8, 0.8, 0.8)); for (let q = 0; q < 6; q++) inst(G.fruit, 'fruit' + (kind === 'dates' ? 3 : (q + k) % 3), mat4(px + (q % 3 - 1) * 0.12, 0.36, pz + (q < 3 ? -0.08 : 0.08), 0, 1.6, 1.6, 1.6)); }
    // sacks behind the counter, a lantern under the awning
    for (let k = 0; k < 3; k++) { const [px, pz] = P(-0.9 + k * 0.8, -0.65); inst(G.sack, 'burlap', mat4(px, 0.45, pz, R() * 6, 0.8, 0.8, 0.8)); }
    { const [lx, lz] = P(0.8, 0.6), [tx, tz] = P(0.4, 1.4); inst(G.lantern, 'lanternOn', mat4(lx, 2.05, lz), false); lampAt(lx, 1.95, lz, { tx, tz, pool: 2.6 }); }
    const kindL = { fruit: ['store', 'Fruit stall'], melon: ['store', 'Melon cart'], spice: ['pantry', 'Spice stall'], dates: ['pantry', 'Date seller\'s baskets'], pots: ['bin', 'Potter\'s stall'], cloth: ['dresser', 'Cloth merchant\'s chest'], water: ['cooler', 'Water seller\'s crates'] }[kind];
    K.container(kindL[0], cx, cz, 0.85, kindL[1], yaw);
    // the outbreak: the awning torn down, the counter tipped, fruit everywhere
    K.chaos(x, z, () => {
      for (let k = 0; k < 14; k++) inst(G.fruit, 'fruit' + Math.floor(R() * 4), mat4(x + (R() - 0.5) * 6, 0.06, z + (R() - 0.5) * 6, 0, 1, 1, 1), false);
      if (R() < 0.5) K.blood(x + (R() - 0.5) * 3, z + 1.5 + R() * 2, 0.6 + R() * 0.5);
      if (R() < 0.4) { const [px, pz] = P(0, 2.2); blk(px, 0, pz, 1.3, 0.35, 0.3, yaw + 0.4, 'd_greyWood', 'wood', { vault: true }); }
    }, 'stall' + i);
  }
  {
    let i = 0;
    const kinds = ['fruit', 'spice', 'melon', 'cloth', 'dates', 'pots', 'water', 'fruit', 'spice', 'dates', 'pots', 'cloth'];
    for (const [x, z, yaw] of [[-18, -14.5, 0], [-12, -14.5, 0], [5, -14.5, 0], [-6, -14.5, 0], [-18, 4.5, PI], [-12, 4.5, PI], [5, 4.5, PI], [10.5, 4.5, PI], [-19.5, -5, PI / 2], [10.5, -5, -PI / 2]]) stall(x, z, yaw, kinds[i], i++);
    note('market', -12, -14.0, 0.86);
    // a few palms and benches round the square, a stone water trough, a bicycle, crates
    for (const [x, z] of [[-21, -17], [13, -17], [-21, 7], [13, 7]]) palm(x, z, 7 + R() * 2);
    for (const [x, z, yaw] of [[-8, 6.5, 0], [0, 6.5, 0], [-8, -16.2, 0], [0, -16.2, 0]]) { blk(x, 0, z, 0.9, 0.45, 0.22, yaw, 'd_sandstone', 'concrete', { vault: true }); }
    for (const [x, z] of [[-15, -9], [7, 0], [-16, 0]]) K.crateStack(x, z, R() * 6, 1 + Math.floor(R() * 2));
  }

  // ================================================================ the chapel and its bell tower
  {
    const cx = -6, cz = -30, cw = 14, cd = 10, ch = 5.6;
    const H = K.room(cx, cz, cw, cd, 0, { h: ch, t: 0.5, mat: 'd_plaster6', inMat: 'd_plasterIn', floor: 'd_tileB', roof: 'flat', roofMat: 'd_earth', parapet: false,
      doors: [{ side: 'n', at: 0, w: 1.6, col: 0x5a3a20, dir: -1, front: true, hp: 300 }],
      windows: [{ side: 'e', at: -2.5, w: 0.9, sill: 2.2, top: 4.4 }, { side: 'e', at: 2.5, w: 0.9, sill: 2.2, top: 4.4 }, { side: 'w', at: -2.5, w: 0.9, sill: 2.2, top: 4.4 }, { side: 'w', at: 2.5, w: 0.9, sill: 2.2, top: 4.4 }],
      name: 'the chapel', home: false, inside: [[0, 2], [0, -2]] });
    H.yTop = () => ch + 0.22;
    // the dome on its drum, a lantern on top
    const domeG = K.sub(() => {
      xadd(new THREE.CylinderGeometry(3.3, 3.3, 1.4, 32), 'dome', mat4(cx, ch + 0.22 + 0.7, cz));
      xadd(G.hemi, 'dome', mat4(cx, ch + 1.62, cz, 0, 3.3, 2.9, 3.3));
      xadd(new THREE.CylinderGeometry(0.35, 0.45, 0.9, 12), 'dome', mat4(cx, ch + 1.62 + 2.9 + 0.3, cz));
      xadd(G.sphere, 'brass', mat4(cx, ch + 1.62 + 2.9 + 0.95, cz, 0, 0.22, 0.22, 0.22));
      // a crenellated parapet
      for (let x = cx - cw / 2; x < cx + cw / 2; x += 0.9) for (const z of [cz - cd / 2, cz + cd / 2]) K.box(x + 0.25, ch + 0.22, z, 0.22, ch + 0.9, 0.2, 0, f => f === 'bot' ? null : 'd_plaster6');
      for (let z = cz - cd / 2 + 0.6; z < cz + cd / 2 - 0.3; z += 0.9) for (const x of [cx - cw / 2, cx + cw / 2]) K.box(x, ch + 0.22, z + 0.25, 0.2, ch + 0.9, 0.22, 0, f => f === 'bot' ? null : 'd_plaster6');
    });
    if (H.roof) H.roof.add(domeG);
    K.solid(cx, cz, 3.3, 3.3, 0, ch + 4.5, 'concrete', ch + 0.22); K.solid(cx, cz, 3.3, 3.3, PI / 4, ch + 4.5, 'concrete', ch + 0.22);
    // the front: a deep arched porch, steps, the name over the door
    K.box(cx, 0, cz + cd / 2 + 0.5, 1.6, 0.12, 0.7, 0, f => f === 'bot' ? null : 'd_sandstone');
    for (const sx of [-1, 1]) blk(cx + sx * 1.35, 0, cz + cd / 2 + 0.45, 0.25, 3.6, 0.45, 0, 'd_plaster6', 'concrete');
    K.box(cx, 3.2, cz + cd / 2 + 0.45, 1.6, 3.9, 0.45, 0, f => f === 'bot' ? 'd_plasterIn' : 'd_plaster6');
    sign(['CAPILLA DE SAN ISIDRO'], cx, 4.3, cz + cd / 2 + 0.92, 0, 3.0, 0.4);
    // pews (vault them), the altar, a cabinet in the sacristy corner
    for (let r2 = 0; r2 < 5; r2++) for (const sx of [-1, 1]) {   // pews: a seat, a slatted back, carved ends, a kneeler
      const px = cx + sx * 2.9, pz = cz + 2.8 - r2 * 1.25; K.solid(px, pz, 2.1, 0.22, 0, 0.48, 'wood', 0, { vault: true });
      K.box(px, 0.42, pz, 2.0, 0.47, 0.22, 0, 'd_beam'); K.box(px, 0.47, pz + 0.2, 2.0, 0.95, 0.03, 0, 'd_redWood'); K.box(px, 0.9, pz + 0.2, 2.02, 0.96, 0.05, 0, 'd_beam');
      for (const ex of [-2.05, 2.05]) K.box(px + ex, 0, pz + 0.02, 0.04, 0.98, 0.26, 0, 'd_beam');
      K.box(px, 0.1, pz - 0.42, 1.9, 0.2, 0.08, 0, 'd_fabricA');
    }
    D.face(DA, 'retablo', cx, 2.7, cz - cd / 2 + 0.27, 0, 1.6, 2.1);
    blk(cx, 0, cz - cd / 2 + 1.1, 1.3, 1.0, 0.5, 0, f => f === 'top' ? 'd_fabricC' : 'd_sandstone', 'concrete');
    for (const sx of [-1, 1]) inst(G.lantern, 'lanternOn', mat4(cx + sx * 1.1, 1.3, cz - cd / 2 + 1.1), false);
    lampAt(cx, 1.2, cz - cd / 2 + 1.6, { tx: cx, tz: cz - cd / 2 + 2.6, pool: 2.4, gy: 0.02 });
    inst(G.lantern, 'lanternOn', mat4(cx, 3.15, cz + cd / 2 + 0.6), false); xadd(G.post, 'darkMetal', mat4(cx, 3.15, cz + cd / 2 + 0.6, 0, 0.3, 0.06, 0.3), false);
    lampAt(cx, 3.0, cz + cd / 2 + 0.6, { tx: cx, tz: cz + cd / 2 + 2.4, pool: 3.0, pow: 0.45, dist: 11 });
    D.abox(DA, { pz: 'wardrobe', side: 'wood', top: 'wood' }, cx + cw / 2 - 0.8, 0, cz - cd / 2 + 0.6, 0.5, 1.9, 0.3, 0); K.solid(cx + cw / 2 - 0.8, cz - cd / 2 + 0.6, 0.5, 0.3, 0, 1.9, 'wood'); K.container('shelf', cx + cw / 2 - 0.8, cz - cd / 2 + 0.6, 1.1, 'Sacristy cupboard', 0, H);
    D.abox(DA, { pz: 'chest', side: 'wood', top: 'wood' }, cx - cw / 2 + 0.8, 0, cz - cd / 2 + 0.6, 0.5, 1.0, 0.3, 0); K.solid(cx - cw / 2 + 0.8, cz - cd / 2 + 0.6, 0.5, 0.3, 0, 1.0, 'wood'); K.container('medicine', cx - cw / 2 + 0.8, cz - cd / 2 + 0.6, 1.0, 'Alms box', 0, H);
    K.light(cx, 4.2, cz, 0xffc880, 3, 12);
  }
  // the bell tower: a 5 × 5 m sandstone shaft, five switchback storeys, a belfry with open arches at 16 m
  {
    const tx = SPOTS.tower.x, tz = SPOTS.tower.z, S = 2.5, t = 0.4, LV = 3.2, NL = 5, TOPY = NL * LV;
    const A = [tx - S, tz - S], Bp = [tx + S, tz - S], C = [tx + S, tz + S], D = [tx - S, tz + S];
    const sides = (y0, h, ops) => {
      for (const [k, a, b] of [['s', A, Bp], ['e', Bp, C], ['n', C, D], ['w', D, A]]) {
        const ux = b[0] - a[0], uz = b[1] - a[1], L = Math.hypot(ux, uz), ex = ux / L * t / 2, ez = uz / L * t / 2;
        K.wall(a[0] - ex, a[1] - ez, b[0] + ex, b[1] + ez, { h, t, y0, mat: 'd_sandstone', inMat: 'd_plasterIn', openings: ops[k] || [] });
      }
    };
    for (let lv = 0; lv < NL; lv++) sides(lv * LV, LV, lv === 0 ? { n: [{ at: 1.5, w: 1.1, door: true, col: 0x5a3a20, dir: -1, hp: 260 }] } : { e: [{ at: 0, w: 0.35, sill: 1.2, top: 2.4 }], w: [{ at: 0, w: 0.35, sill: 1.2, top: 2.4 }], s: lv % 2 ? [{ at: 0, w: 0.35, sill: 1.2, top: 2.4 }] : [] });
    sides(TOPY, 3.8, { n: [{ at: 0, w: 2.4, sill: 1.0, top: 3.2 }], s: [{ at: 0, w: 2.4, sill: 1.0, top: 3.2 }], e: [{ at: 0, w: 2.4, sill: 1.0, top: 3.2 }], w: [{ at: 0, w: 2.4, sill: 1.0, top: 3.2 }] });
    // the cap: a slab, a small dome, the weather vane
    K.box(tx, TOPY + 3.8, tz, S + 0.35, TOPY + 4.15, S + 0.35, 0, f => f === 'bot' ? 'd_plasterIn' : 'd_sandstone');
    xadd(G.hemi, 'domeGreen', mat4(tx, TOPY + 4.15, tz, 0, 1.9, 1.7, 1.9));
    xadd(G.post, 'darkMetal', mat4(tx, TOPY + 5.8, tz, 0, 0.5, 1.4, 0.5)); xadd(G.ubox, 'darkMetal', mat4(tx, TOPY + 6.8, tz, 0.4, 0.9, 0.05, 0.05));
    // string courses outside at each storey
    for (let lv = 1; lv <= NL; lv++) K.box(tx, lv * LV - 0.12, tz, S + t / 2 + 0.1, lv * LV + 0.05, S + t / 2 + 0.1, 0, f => f === 'bot' || f === 'top' ? null : 'd_sandstone');
    // inside: the central pier, flights up the west (southward) and east (northward) corridors, landings
    const I = S - t / 2;   // 2.3: inner half size
    blk(tx, 0, tz, 0.9, TOPY, 1.3, 0, 'd_plasterIn', 'concrete');
    blk(tx + 1.6, 0, tz, 0.7, 1.5, 1.3, 0, 'd_plasterIn', 'concrete');    // closet under the first east flight
    for (let lv = 0; lv < NL; lv++) {
      const y = lv * LV;
      K.stairs(tx - 1.6, tz, PI, 1.3, 2.6, y, y + LV / 2, 'd_sandstone', { open: true, rails: false });
      K.stairs(tx + 1.6, tz, 0, 1.3, 2.6, y + LV / 2, y + LV, 'd_sandstone', { open: true, rails: false });
      K.deck(tx, tz - 1.3 - (I - 1.3) / 2, I, (I - 1.3) / 2, 0, y + LV / 2, { mat: 'd_sandstone', th: 0.2 });
      if (lv < NL - 1) K.deck(tx, tz + 1.3 + (I - 1.3) / 2, I, (I - 1.3) / 2, 0, y + LV, { mat: 'd_sandstone', th: 0.2 });
    }
    // the belfry floor (a hole over the last east flight), the bell, Father Tomás's things
    K.deck(tx - 0.7, tz, 1.6, I, 0, TOPY, { mat: 'd_sandstone', th: 0.25 });
    K.deck(tx + 1.6, tz + 1.8, 0.7, 0.5, 0, TOPY, { mat: 'd_sandstone', th: 0.25 });
    const bellG = new THREE.LatheGeometry([[0, 0.95], [0.18, 0.92], [0.3, 0.75], [0.36, 0.4], [0.5, 0.06], [0.54, 0], [0.48, 0.02], [0.3, 0.38], [0.24, 0.75], [0, 0.82]].map(p => new THREE.Vector2(p[0], p[1])), 24);
    xadd(bellG, 'brass', mat4(tx - 0.2, TOPY + 2.05, tz, 0, 1, 1, 1));
    K.container('shelf', tx - 0.2, tz, TOPY + 1.2, 'The chapel bell', 0, null, { bell: true });
    xadd(G.ubox, 'beam', mat4(tx - 0.2, TOPY + 3.0, tz, 0, 4.6, 0.2, 0.22));
    K.wbeam([tx - 0.2, TOPY + 2.1, tz + 0.3], [tx - 1.8, TOPY + 0.3, tz + 1.6], 0.012, 0.012, M.fabricC);
    inst(G.cushion, 'fabricB', mat4(tx - 1.6, TOPY, tz - 1.6, 0.3, 1, 1, 1.4)); inst(G.lantern, 'lanternOn', mat4(tx - 1.9, TOPY + 0.25, tz - 1.0), false);
    lampAt(tx - 1.9, TOPY + 0.6, tz - 1.0, { pool: 1.4, gy: TOPY, pow: 0.25, dist: 6 });
    K.container('nightstand', tx - 1.6, tz - 1.6, TOPY + 0.1, 'Father Tomás\'s blanket', 0); note('chapel', tx - 1.6, tz - 1.4, TOPY + 0.1);
    K.container('closet', tx + 1.6, tz + 1.5, 0.9, 'Closet under the stairs', 0);
  }

  // ================================================================ the village: houses
  const homes = [];
  const H0 = adobe({ x: -34, z: 11, yaw: PI, w: 10, d: 8, yd: 6, seed: 5, name: 'your house', tint: 1 }); homes.push(H0);
  const lots = [
    // west of the square, Main Street (z −4): north side faces south, south side faces north
    [-34, -19, 0, 10, 8], [-47, -19, 0, 9, 8], [-60, -19, 0, 10, 8], [-73, -19, 0, 9, 8],
    [-47, 11, PI, 9, 8], [-60, 11, PI, 10, 8],
    // east of the square
    [30, -19, 0, 10, 8], [43, -19, 0, 9, 8], [56, -19, 0, 10, 8],
    [30, 11, PI, 10, 8], [43, 11, PI, 9, 8],
    // south of the square (one is the Haddads')
    [-14, 18, PI, 9, 8], [0, 18, PI, 9, 8, true],
    // the north lane (z −44)
    [-60, -57, 0, 10, 8], [-46, -57, 0, 9, 8], [-32, -57, 0, 10, 8], [24, -57, 0, 9, 8],
    [-60, -31, PI, 10, 7], [-46, -31, PI, 9, 7], [-32, -31, PI, 10, 7], [26, -31, PI, 10, 7],
    // the lane by the wadi (z 19), facing it
    [-60, 30, PI, 9, 7, false, 4], [-40, 30, PI, 9, 7, false, 4], [22, 30, PI, 9, 7, false, 4], [40, 30, PI, 9, 7, false, 4],
  ];
  for (const [x, z, yaw, w, d, kid, yd] of lots) homes.push(adobe({ x, z, yaw, w, d, yd: yd ?? 6, kid: !!kid }));

  // ---- the café on the square (the radio), the general store, the clinic ----
  {
    const H = K.room(19, -12, 9, 8, -PI / 2, { h: 3.3, t: 0.4, mat: 'd_plasterBlue', inMat: 'd_plasterIn', floor: 'd_tileB', roof: 'flat', roofMat: 'd_earth', parapet: true,
      doors: [{ side: 'n', at: 1.5, w: 1.6, col: 0x2e5c8c, dir: -1, front: true }],
      windows: [{ side: 'n', at: -2.0, w: 2.2, sill: 0.8, top: 2.4 }, { side: 'e', at: 0, w: 1.0, sill: 1.2, top: 2.1 }], name: 'Café Oasis', home: false, inside: [[0, 1], [0, -2]] });
    H.yTop = () => 3.52;
    // terrace awning out over the square, tables and chairs
    K.box(14.2, 2.85, -12, 0.02, 2.9, 4.2, 0, 'd_awn1'); xadd(G.ubox, 'awn1', mat4(12.6, 2.6, -12, -PI / 2, 8.4, 0.02, 3.2, -0.12));
    for (const dz of [-4, 0, 4]) { xadd(G.ucyl, 'beam', mat4(11.2, 0, -12 + dz, 0, 0.1, 2.45, 0.1)); K.solid(11.2, -12 + dz, 0.06, 0.06, 0, 2.4, 'wood'); }
    for (const [x, z] of [[12.5, -14.5], [12.5, -11], [12.5, -8.5]]) { xadd(G.ucyl, 'metal', mat4(x, 0, z, 0, 0.7, 0.74, 0.7)); inst(G.teapot, 'brass', mat4(x, 0.74, z)); K.solid(x, z, 0.36, 0.36, 0, 0.75, 'metal', 0, { vault: true }); for (const s of [-1, 1]) inst(G.ubox, 'greyWood', mat4(x + s * 0.7, 0, z, 0, 0.42, 0.45, 0.42)); }
    sign(['CAFÉ OASIS'], 14.75, 2.55, -14.2, -PI / 2, 2.6, 0.5, '#2e5c8c', '#f0e6cc');
    // inside: the counter, the radio, the cool box
    blk(21.6, 0, -12, 0.35, 1.0, 3.0, 0, f => f === 'top' ? 'd_plasterBlue' : f === 'nx' ? 'dzTileZ' : 'd_plasterBlue', 'concrete');
    K.box(21.55, 1.0, -12, 0.42, 1.05, 3.05, 0, f => f === 'bot' ? 'dzPlinth' : 'dzButcher');   // the wooden counter top, over the zellige front
    D.coffee(21.75, 1.05, -14.4, -PI / 2); D.board(DA, 'menu', 22.77, 2.05, -12.4, -PI / 2, 1.5, 1.05, 'd_beam');
    for (let i = 0; i < 4; i++) inst(G.teapot, 'brass', mat4(21.6, 1.05, -13.2 + i * 0.28, i, 0.9, 0.9, 0.9));
    D.kitchenRun(22.48, -10.9, -PI / 2, [{ k: 'cab', w: 0.8 }, { k: 'hob', w: 0.6 }, { k: 'sink', w: 0.7 }], { cab: 'cabWood2', top: 'd_tileB', splash: 'dzTileZ', d: 0.6, solid: false, props: false });
    K.container('register', 21.6, -13.5, 1.05, 'Café till', 0, H); K.container('cooler', 22.6, -10, 0.9, 'Cool box', 0, H);
    K.solid(22.5, -10.9, 0.3, 1.05, 0, 0.9, 'metal');
    inst(G.ubox, 'darkMetal', mat4(21.6, 1.05, -11.0, 0.2, 0.42, 0.24, 0.18)); K.container('shelf', 21.6, -11.0, 1.1, 'The café radio', 0, H, { radio: true });
    for (const [x, z] of [[17.5, -14], [17.5, -10]]) { xadd(G.ucyl, 'greyWood', mat4(x, 0, z, 0, 0.8, 0.72, 0.8)); K.solid(x, z, 0.4, 0.4, 0, 0.72, 'wood', 0, { vault: true }); }
    K.light(19, 2.8, -12, 0xffc880, 3, 10);
  }
  {
    const H = K.room(18, 4.2, 7.4, 7, -PI / 2, { h: 3.3, t: 0.4, mat: 'd_plaster3', inMat: 'd_plasterIn', floor: 'd_earth', roof: 'flat', roofMat: 'd_earth', parapet: true,
      doors: [{ side: 'n', at: 0, w: 1.2, col: 0x7a3a24, dir: -1, front: true }], windows: [{ side: 'n', at: -2.3, w: 1.2, sill: 0.9, top: 2.2 }], name: 'Haddad General Store', home: false, inside: [[0, 0]] });
    H.yTop = () => 3.52;
    sign(['TIENDA HADDAD', 'GENERAL STORE'], 14.3, 2.7, 4.2, -PI / 2, 3.0, 0.75, '#e8dcc0', '#7a2a1a');
    for (const z of [1.6, 6.8]) { K.solid(18.2, z, 2.6, 0.28, 0, 2.0, 'wood'); for (const ux of [16.9, 19.5]) D.abox(DA, { pz: 'shelf', nz: 'shelf', side: 'wood', top: 'wood' }, ux, 0, z, 1.3, 2.0, 0.28, 0); K.container('store', 18.2, z, 1.0, 'Store shelves', 0, H); }
    blk(20.8, 0, 4.2, 0.4, 1.0, 1.1, 0, f => f === 'nx' ? 'd_blueWood' : f === 'top' ? 'dzButcher' : 'd_greyWood', 'wood'); K.container('register', 20.8, 4.2, 1.0, 'Store till', 0, H);
    D.abox(D.A, { nx: 'microwave', side: 'steel', top: 'steel' }, 20.85, 1.0, 4.6, 0.18, 1.2, 0.2, 0);   // the till
    for (let k = 0; k < 4; k++) inst(G.jar, ['clay', 'clayDark'][k % 2], mat4(20.75, 1.0, 3.4 + k * 0.2, k, 0.3, 0.3, 0.3));
    for (let k = 0; k < 4; k++) inst(G.sack, 'burlap', mat4(15.6, 0, 3.2 + k * 0.6, R() * 6, 1, 1, 1));
  }
  {
    const H = K.room(-73, 11, 10, 8, PI, { h: 3.2, t: 0.4, mat: 'd_plaster6', inMat: 'd_plasterIn', floor: 'd_tileB', roof: 'flat', roofMat: 'd_earth', parapet: true,
      doors: [{ side: 'n', at: 2, w: 1.1, col: 0xd8d6d0, dir: -1, front: true }], windows: [{ side: 'n', at: -2, w: 1.4, sill: 1.0, top: 2.2 }, { side: 's', at: 0, w: 1.4, sill: 1.0, top: 2.2 }], name: 'the clinic', home: false, inside: [[0, 0]] });
    H.yTop = () => 3.42;
    sign(['CLÍNICA', '+'], -73, 2.7, 6.78, PI, 2.4, 0.8, '#f0f0ea', '#b01810');
    note('bulletin', -71.0, 6.5, 1.0);
    for (const sx of [-1, 1]) {   // two clinic beds: a steel frame, a sheeted mattress, a blanket, a pillow
      const bx0 = -73 + sx * 3; K.solid(bx0, 13.6, 1.0, 0.45, 0, 0.66, 'metal', 0, { vault: true });
      K.box(bx0, 0.45, 13.6, 1.0, 0.52, 0.45, 0, 'dzSteel'); K.box(bx0, 0.52, 13.6, 0.97, 0.64, 0.43, 0, 'dzSheet'); K.box(bx0 - 0.3, 0.64, 13.6, 0.62, 0.67, 0.44, 0, 'd_fabricB'); K.box(bx0 + 0.72, 0.64, 13.6, 0.18, 0.74, 0.3, 0, 'd_white');
      for (const lx of [-0.97, 0.97]) for (const lz of [-0.42, 0.42]) K.box(bx0 + lx, 0, 13.6 + lz, 0.02, 0.45, 0.02, 0, 'dzSteel');
      K.box(bx0 + 1.0, 0.45, 13.6, 0.025, 1.05, 0.45, 0, 'dzSteel'); K.box(bx0 + 1.01, 0.6, 13.6, 0.02, 0.95, 0.4, 0, 'd_blueWood');
      K.box(bx0 + 0.5, 0, 14.25, 0.012, 1.8, 0.012, 0, 'chrome' in K.MAT ? 'chrome' : 'dzSteel'); K.box(bx0 + 0.5, 1.6, 14.25, 0.06, 1.78, 0.02, 0, 'd_white');   // a drip stand
    }
    D.medCabinet(-77.2, 9, PI / 2, { w: 1.8, d: 0.6 }); K.container('pharmacy', -77.2, 9, 1.1, 'Medicine cabinet', 0, H);
    D.abox(D.A, { nx: 'drawers3', side: 'white', top: 'white' }, -68.8, 0, 9.5, 0.4, 0.85, 0.8, 0); K.solid(-68.8, 9.5, 0.4, 0.8, 0, 0.85, 'wood'); K.container('medicine', -68.8, 9.5, 0.85, 'Nurse\'s desk', 0, H);
    D.face(DA, 'retablo', -73, 1.9, 7.0 + 0.23, 0, 0.5, 0.65);
    K.chaos(-73, 4, () => { K.blood(-72, 5, 0.9); K.blood(-74.5, 3.5, 0.6); K.barricade(-73, 3.0, 0.1); }, 'clinic');
  }

  // ================================================================ the gas station and Rafi's garage
  {
    const gx = 65, gz = 11;
    K.slab(51, 2, HWY - 4.2, 20, 'concrete', 'concrete');
    // canopy on four posts, two old pumps on an island
    K.box(gx, 4.4, gz, 5.2, 4.95, 4.0, 0, f => f === 'bot' ? 'd_whiteMetal' : f === 'top' ? 'd_corrRust' : 'd_red');
    for (const [fx, fz, fy, fw] of [[0, 4.012, 0, 10.4], [0, -4.012, PI, 10.4], [5.212, 0, PI / 2, 8.0], [-5.212, 0, -PI / 2, 8.0]]) xadd(new THREE.PlaneGeometry(fw, 0.55), M.fascia, mat4(gx + fx, 4.675, gz + fz, fy), false);
    for (const dx of [-2.6, 2.6]) K.box(gx + dx, 4.36, gz, 0.09, 4.4, 3.4, 0, f => f === 'bot' ? 'd_canopyStrip' : 'd_whiteMetal');
    W.canopyLights = M.canopyStrip;   // world.js switches them on at dusk with the canopy's own spot light
    { let placed = false; W.anims.push(() => { if (!placed && W.placeCanopyLight) { placed = true; W.placeCanopyLight(gx, gz); } }); }
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) blk(gx + sx * 4.3, 0, gz + sz * 3.2, 0.16, 4.4, 0.16, 0, 'd_whiteMetal', 'metal');
    blk(gx, 0, gz, 0.7, 0.2, 2.8, 0, 'concrete', 'concrete', { vault: true });
    for (const dz of [-1.3, 1.3]) { blk(gx, 0.2, gz + dz, 0.32, 1.75, 0.24, 0, f => f === 'top' ? 'd_whiteMetal' : 'd_red', 'metal'); K.container('pump', gx, gz + dz, 1.1, 'Old pump', 0);
      for (const sx of [-1, 1]) xadd(new THREE.PlaneGeometry(0.46, 1.52), M.pump, mat4(gx + sx * 0.322, 0.2 + 0.775, gz + dz, sx * PI / 2), false);
      for (const sx of [-1, 1]) { inst(G.ubox, 'darkMetal', mat4(gx + sx * 0.34, 0.85, gz + dz + 0.1, 0, 0.06, 0.16, 0.08), false);
        K.wbeam([gx + sx * 0.33, 1.15, gz + dz - 0.12], [gx + sx * 0.55, 0.25, gz + dz - 0.05], 0.025, 0.025, M.black); K.wbeam([gx + sx * 0.55, 0.25, gz + dz - 0.05], [gx + sx * 0.36, 0.92, gz + dz + 0.1], 0.025, 0.025, M.black); } }
    sign(['GASOLINA', 'CLOSED'], gx, 4.67, gz + 4.02, 0, 3.0, 0.5, '#a8281e', '#f0e8d0');
    // the kiosk and the roller-door garage
    const S = K.room(54.5, 12, 7, 6, PI / 2, { h: 3.2, t: 0.3, mat: 'd_plaster2', inMat: 'd_plasterIn', floor: 'concrete', roof: 'flat', roofMat: 'concrete', parapet: true,
      doors: [{ side: 'n', at: -1.6, w: 1.0, col: 0xd8d6d0, dir: -1, front: true }], windows: [{ side: 'n', at: 1.2, w: 2.2, sill: 0.9, top: 2.3 }], name: 'gas station kiosk', home: false, inside: [[0, 0]] });
    S.yTop = () => 3.42;
    D.abox(D.A, { nz: 'drawers3', side: 'white', top: 'white' }, 55.5, 0, 13.6, 1.2, 0.96, 0.35, 0); K.box(55.5, 0.96, 13.6, 1.24, 1.0, 0.38, 0, 'dzLaminate'); K.solid(55.5, 13.6, 1.2, 0.35, 0, 1.0, 'wood'); K.container('register', 55.5, 13.6, 1.0, 'Kiosk counter', 0, S);
    D.abox(D.A, { nz: 'microwave', side: 'steel', top: 'steel' }, 55.0, 1.0, 13.7, 0.18, 1.2, 0.2, 0);
    K.solid(52.3, 12, 0.3, 2.0, 0, 1.8, 'wood'); for (const uz of [11, 13]) D.abox(DA, { px: 'shelf', side: 'wood', top: 'wood' }, 52.3, 0, uz, 0.3, 1.8, 1.0, 0); K.container('store', 52.3, 12, 1.0, 'Kiosk shelves', 0, S);
    D.drinksFridge(55.5, 9.6, 0, { w: 1.0, h: 1.8, d: 0.7 }); K.container('cooler', 55.5, 9.6, 1.0, 'Soda fridge', 0, S);
    const Gr = K.room(54.5, 23, 7, 6.5, PI / 2, { h: 3.6, t: 0.3, mat: 'd_mudBrick', inMat: 'd_plasterIn', floor: 'concrete', roof: 'flat', roofMat: 'd_corrRust', parapet: false,
      doors: [{ side: 'n', at: 1.2, w: 2.8, col: 0x8a8c8e, dir: -1, front: true, hp: 320 }], name: 'Rafi\'s garage', home: false, inside: [[0, 0]] });
    Gr.yTop = () => 3.82;
    sign(['TALLER RAFI', 'MECÁNICO'], 57.9, 3.0, 23, PI / 2, 2.8, 0.7, '#e8c040', '#1a1a1a');
    note('rafi', 57.95, 21.0, 1.2);
    blk(52.0, 0, 21.0, 0.35, 0.95, 1.4, 0, f => f === 'top' ? 'dzButcher' : 'd_greyWood', 'wood'); K.container('garage', 52.0, 21.0, 0.95, 'Workbench', 0, Gr);
    D.face(DA, 'tools', 51.6, 1.75, 21.0, PI / 2, 2.6, 1.3); K.box(52.0, 0.95, 21.6, 0.08, 1.1, 0.1, 0, 'd_blueWood'); K.box(51.95, 0.95, 20.4, 0.2, 1.05, 0.12, 0, 'd_red');
    D.abox(DA, { px: 'toolchest', side: 'toolchest', top: 'toolchest' }, 52.0, 0, 25.2, 0.4, 1.2, 0.4, 0); K.solid(52.0, 25.2, 0.4, 0.4, 0, 1.2, 'metal'); K.container('shed', 52.0, 25.2, 1.0, 'Tool chest', 0, Gr);
    for (let k = 0; k < 5; k++) inst(G.tire, 'rubber', mat4(51.9, k * 0.22, 23.2, R()));
    for (let k = 0; k < 3; k++) { inst(G.barrel, k % 2 ? 'rust' : 'red', mat4(58.6, 0, 18 + k * 0.7)); }
    K.solid(58.6, 18.7, 0.32, 1.0, 0, 0.9, 'metal');
    K.car(63, 17.6, PI / 2 + 0.15, 7, 'pickup');
    K.light(gx, 4.2, gz, 0xfff0d8, 2.5, 12);
    for (const [x, z] of [[gx - 2.6, gz], [gx + 2.6, gz]]) xadd(G.rug, M.pool, mat4(x, 0.06, z, 0, 5, 1, 8), false);
  }
  // ================================================================ the water tower (climb it: the ladder on its south side)
  {
    const x = SPOTS.waterTower.x, z = SPOTS.waterTower.z, TY = 12;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { xadd(G.ucyl, 'rust', mat4(x + sx * 2.3, 0, z + sz * 2.3, 0, 0.28, TY, 0.28, sz * 0.03, -sx * 0.03)); K.solid(x + sx * 2.3, z + sz * 2.3, 0.16, 0.16, 0, TY, 'metal'); }
    for (const y of [4, 8]) for (const [a, b] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]]) K.wbeam([x + a[0] * 2.3, y, z + a[1] * 2.3], [x + b[0] * 2.3, y, z + b[1] * 2.3], 0.08, 0.08, M.rust);
    for (const [a, b] of [[[-1, -1], [1, 1]], [[1, -1], [-1, 1]]]) K.wbeam([x + a[0] * 2.3, 0.5, z + a[1] * 2.3], [x + b[0] * 2.3, 7.5, z + b[1] * 2.3], 0.04, 0.04, M.rust);
    K.deck(x, z, 3.4, 3.4, 0, TY, { mat: 'd_darkMetal', th: 0.12 });
    xadd(G.tank, 'whiteMetal', mat4(x, TY, z, 0, 2.7, 4.2, 2.7)); xadd(G.cone, 'rust', mat4(x, TY + 4.2, z, 0, 2.85, 1.3, 2.85));
    K.solid(x, z, 2.0, 2.0, 0, TY + 5.5, 'metal', TY); K.solid(x, z, 2.0, 2.0, PI / 4, TY + 5.5, 'metal', TY);
    { const tm = new THREE.MeshStandardMaterial({ map: signTex(['ARROYO SECO'], 3.3, 0.7, '#e8e4d8', '#2a3a5a'), roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 });
      const tcg = new THREE.CylinderGeometry(2.74, 2.74, 0.7, 24, 1, true, -0.6, 1.2);
      const tsg = K.mesh(tcg, tm, x, TY + 2.6, z, 0); tsg.castShadow = false; }
    // the railing round the walkway (a gap for the ladder)
    for (const [lx, lz, hx, hz] of [[0, -3.35, 3.4, 0.05], [-3.35, 0, 0.05, 3.4], [3.35, 0, 0.05, 3.4], [-2.0, 3.35, 1.4, 0.05], [2.0, 3.35, 1.4, 0.05]]) { K.box(x + lx, TY + 1.0, z + lz, hx, TY + 1.08, hz, 0, 'd_rust'); K.solid(x + lx, z + lz, hx, hz, 0, TY + 1.1, 'metal', TY); }
    for (let a = -3.3; a <= 3.3; a += 1.1) for (const [px, pz] of [[a, -3.35], [-3.35, a], [3.35, a]]) inst(G.post, 'rust', mat4(x + px, TY, z + pz, 0, 0.4, 1.05, 0.4), false);
    // the caged ladder: a very steep "stair" (W.ramps) from the ground to the walkway
    for (const sx of [-0.3, 0.3]) xadd(G.ubox, 'rust', mat4(x + sx, 0, z + 3.75, 0, 0.05, TY + 1, 0.05));
    for (let y = 0.3; y < TY; y += 0.3) xadd(G.ubox, 'rust', mat4(x, y, z + 3.75, 0, 0.6, 0.03, 0.03), false);
    for (let y = 2.4; y < TY + 1; y += 0.9) xadd(new THREE.TorusGeometry(0.42, 0.02, 4, 14, PI).rotateX(PI / 2), M.rust, mat4(x, y, z + 3.75, PI), false);
    K.stairs(x, z + 3.95, PI, 0.6, 0.7, 0, TY, 'd_rust', { open: true, rails: false });
    note('tower', x - 2.5, z + 2.8, TY + 0.1); K.container('atticBox', x - 2.5, z + 2.8, TY + 0.1, 'Somebody\'s stash', 0);
  }

  // ================================================================ the wadi: banks, boulders, the footbridge, the jeep
  {
    for (let x = -104; x <= 104; x += 2.6) {
      if (Math.abs(x - HWY) < 7 || Math.abs(x + 8) < 3) continue;
      const zc = wadiZ(x);
      if (R() < 0.45) boulder(x + R() * 2, zc + (R() - 0.5) * 7, 0.4 + R() * 0.8);
      if (R() < 0.3) for (const sd of [-1, 1]) boulder(x + R() * 2, zc + sd * (8 + R() * 2.5), 0.7 + R() * 1.3);
      // scree: loose stones down the banks
      for (let k = 0; k < 3; k++) { const sd = R() < 0.5 ? -1 : 1, sx = x + R() * 2.6, sz = zc + sd * (5.5 + R() * 3.5), ss = 0.25 + R() * 0.5; inst(G.stone, 'boulder', mat4(sx, hY(sx, sz) + ss * 0.08, sz, R() * 6, ss, ss * (0.5 + R() * 0.4), ss, R(), R()), false); }
      if (R() < 0.25) scrub(x + R() * 2, zc + (R() - 0.5) * 12, 0.9);
    }
    // the stone footbridge (x −8): flat deck at road level across the trench, parapets, two arches
    const bx = -8, wz = wadiZ(bx), hl = 13;
    K.deck(bx, wz, 1.5, hl, 0, 0.06, { draw: false });
    K.box(bx, -0.6, wz, 1.6, 0.06, hl, 0, f => f === 'top' ? 'd_sandstone' : f === 'bot' ? 'd_mudBrick' : 'd_sandstone');
    for (const sx of [-1, 1]) { K.box(bx + sx * 1.75, -0.6, wz, 0.2, 1.0, hl, 0, f => f === 'bot' ? null : 'd_sandstone'); K.solid(bx + sx * 1.75, wz, 0.2, hl, 0, 1.0, 'concrete', 0); }
    for (const dz of [-4, 4]) blk(bx, -3.2, wz + dz, 1.6, -0.6, 0.7, 0, 'd_sandstone', 'concrete');
    // the survey jeep, abandoned on the north bank
    K.car(SPOTS.jeep.x, SPOTS.jeep.z, 0.4, 4, 'suv');
    note('survey', SPOTS.jeep.x + 1.6, SPOTS.jeep.z, 0.9);
    // dead tamarisk and oleander along the banks
    for (let i = 0; i < 40; i++) { const x = -100 + R() * 200; if (Math.abs(x - HWY) < 8) continue; scrub(x, wadiZ(x) + (R() < 0.5 ? -1 : 1) * (11 + R() * 4), 1.1 + R() * 0.6); }
  }
  // ================================================================ the palm grove south of the wadi
  {
    // garden plots behind low mud walls, irrigation channels between them
    for (let gx = -96; gx <= -14; gx += 16) for (let gz = 66; gz <= 84; gz += 15) {
      const cx = gx + 7, cz = gz + 6;
      for (const [x0, z0, x1, z1] of [[cx - 7, cz - 6, cx + 7, cz - 6], [cx - 7, cz + 6, cx + 7, cz + 6], [cx - 7, cz - 6, cx - 7, cz + 6]]) {
        const w2 = K.wall(x0, z0, x1, z1, { h: 0.85, t: 0.3, mat: 'd_mudBrick', inMat: 'd_mudBrick', openings: [{ at: 0, w: 1.6 }] });
        for (const b of w2.boxes) b.vault = true;
      }
      for (const sd of [-1, 1]) K.box(cx + 7.4 + sd * 0.27, 0, cz, 0.07, 0.13, 6, 0, f => f === 'bot' ? null : 'd_mudBrick');
      K.box(cx + 7.4, 0, cz, 0.2, 0.015, 6, 0, f => f === 'top' ? 'd_wadi' : null); K.paint(cx + 7.4, cz, 1.2, 'mud', 0.35);
      for (let k = 0; k < 4; k++) { if (R() < 0.15) continue; palm(cx - 3.5 + (k % 2) * 7 + (R() - 0.5) * 3, cz - 2.5 + Math.floor(k / 2) * 5 + (R() - 0.5) * 3, 7 + R() * 4); }
      // alfalfa: low green crop rows between the palms
      for (let rz = cz - 4.5; rz <= cz + 4.5; rz += 1.5) { for (let tx = cx - 5.8; tx <= cx + 6.2; tx += 0.75 + R() * 0.3) { const s2 = 0.7 + R() * 0.5; inst(G.tuft, 'crop', mat4(tx, 0, rz + (R() - 0.5) * 0.15, R() * 6, s2, s2 * (0.8 + R() * 0.5), s2), false); } K.paint(cx + 0.2, rz, 0.9, 'mud', 0.2); }
      K.paint(cx, cz, 6, 'mud', 0.3);
    }
    // the pump house: a small shed with the grove's tools
    const Ph = K.room(4, 74, 4, 3.5, 0, { h: 2.6, t: 0.3, mat: 'd_mudBrick', inMat: 'd_mudBrick', floor: 'd_earth', roof: 'flat', roofMat: 'd_corrRust', doors: [{ side: 'n', at: 0, w: 1.1, col: 0x6a5a40, dir: -1 }], name: 'the pump house', home: false });
    Ph.yTop = () => 2.82;
    K.container('shed', 3.2, 73.0, 0.6, 'Grove tools', 0, Ph);
    inst(G.barrel, 'rust', mat4(6.4, 0, 73.2)); K.solid(6.4, 73.2, 0.3, 0.3, 0, 0.88, 'metal', 0, { vault: true });
  }
  // palms along the lanes and the highway, scrub and cacti on the open ground, boulders on the hill
  for (let z = -100; z <= 100; z += 9) { if (Math.abs(z - wadiZ(HWY)) < 14) continue; const pz = z + R() * 3; if ((pz > -12 && pz < 24) || Math.abs(pz + 24) < 3) continue; if (R() < 0.6) palm(HWY - 7.5, pz, 6 + R() * 3); }
  for (const [x, z] of [[-26, -8.6], [-26, 1.2], [18, -24], [-16, -48.6], [6, -48.6], [36, -9.2], [-52, 22.4]]) palm(x, z, 6 + R() * 3);
  for (let i = 0; i < 160; i++) {
    const x = -104 + R() * 208, z = -104 + R() * 208;
    const inVillage = x > -82 && x < 62 && z > -64 && z < 38, onStrip = Math.abs(x - STRIP) < 9, onRoad = Math.abs(x - HWY) < 6, inGrove = x > -98 && x < -10 && z > 64;
    const atPump = Math.abs(x - 4) < 5 && Math.abs(z - 74) < 4.5, atPlane = Math.abs(x - 103) < 7 && Math.abs(z - 70) < 7;
    if (inVillage || onStrip || onRoad || inGrove || atPump || atPlane || Math.abs(z - wadiZ(x)) < 12) continue;
    if (R() < 0.18) cactus(x, z, 0.8 + R() * 0.5); else scrub(x, z, 0.7 + R() * 0.8);
  }
  for (let i = 0; i < 26; i++) { const a = R() * 6.28, rr = R() * 14; boulder(-90 + Math.cos(a) * rr, -90 + Math.sin(a) * rr, 1 + R() * 2.8); }
  for (const [x, z, s] of [[-96, -40, 3], [-100, -12, 2.2], [-98, 40, 2.6], [30, -96, 2.8], [-40, -100, 3.4], [60, -100, 2.4], [104, 60, 2.6], [-20, 104, 2.2]]) boulder(x, z, s);

  // ================================================================ the airstrip, its shack and windsock
  {
    K.slab(STRIP - 7, -96, STRIP + 7, 36, 'd_earth', 'gravel');
    for (let z = -94; z <= 32; z += 12) for (const sx of [-1, 1]) { inst(G.tire, 'white', mat4(STRIP + sx * 7.6, 0, z, R())); }
    for (const z0 of [-92, 32]) for (let k = -5; k <= 5; k += 2) K.box(STRIP + k * 0.6, 0.02, z0, 0.22, 0.035, 2.4, 0, f => f === 'top' ? 'd_paintW' : null);
    // barrels along the edge you can light (story): oil drums, rusty
    for (let z = -80; z <= 10; z += 30) for (const sx of [-1, 1]) { inst(G.barrel, 'rust', mat4(STRIP + sx * 8.4, 0, z)); K.solid(STRIP + sx * 8.4, z, 0.3, 0.3, 0, 0.88, 'metal', 0, { vault: true }); K.container('bin', STRIP + sx * 8.4, z, 0.9, 'Oil drum', 0, null, { light: true }); }
    // windsock
    xadd(G.post, 'whiteMetal', mat4(101, 0, -66, 0, 0.8, 6, 0.8)); K.solid(101, -66, 0.08, 0.08, 0, 6, 'metal');
    xadd(new THREE.CylinderGeometry(0.35, 0.15, 2.2, 12, 1, true).rotateZ(PI / 2), 'awn0', mat4(102.1, 5.8, -66, 0.6, 1, 1, 1));
    // the radio shack
    const Sh = K.room(102.5, -84, 5, 4.4, -PI / 2, { h: 2.7, t: 0.25, mat: 'd_corr', inMat: 'd_greyWood', floor: 'd_greyWood', roof: 'flat', roofMat: 'd_corrRust', parapet: false,
      doors: [{ side: 'n', at: 1.2, w: 1.1, col: 0x8a8070, dir: -1, front: true }], windows: [{ side: 'n', at: -1.0, w: 1.2, sill: 1.0, top: 2.0 }], name: 'the airstrip shack', home: false, inside: [[0, 0]] });
    Sh.yTop = () => 2.92;
    blk(104.1, 0, -85.2, 0.4, 0.8, 1.0, 0, 'd_greyWood', 'wood');
    inst(G.ubox, 'darkMetal', mat4(104.1, 0.8, -85.2, 0, 0.45, 0.28, 0.3)); K.container('shelf', 104.1, -85.2, 0.85, 'Airstrip radio', 0, Sh, { radio: true }); note('ines', 104.1, -84.4, 0.85);
    blk(101.2, 0, -82.4, 0.3, 1.8, 0.8, 0, 'd_greyWood', 'wood'); K.container('car', 101.2, -82.4, 1.0, 'Pilot\'s locker', 0, Sh);
    xadd(G.post, 'darkMetal', mat4(103.6, 2.9, -86.0, 0, 0.3, 3.5, 0.3)); K.wbeam([103.6, 6.3, -86.0], [101.0, 2.9, -81.8], 0.008, 0.008, M.darkMetal);
    // fuel drums and a rusted bowser by the turning pad
    for (let k = 0; k < 6; k++) inst(G.barrel, k % 3 ? 'red' : 'rust', mat4(100.8 + (k % 3) * 0.65, 0, -74 + Math.floor(k / 3) * 0.65));
    K.solid(101.45, -73.7, 1.0, 0.65, 0, 0.88, 'metal');
    // a dead old crop-duster at the south end, nose in the sand: something to climb on
    const px = 103, pz = 70, pyaw = 0.3, pit = 0.12, Pp = Lf(px, pz, pyaw), pY = lz => 0.55 - lz * Math.sin(pit);
    const pa = (geo, mat, lx, ly, lz, sx, sy, sz, rx = 0, rz = 0, ry = 0) => { const [wx2, wz2] = Pp(lx, lz); xadd(geo, mat, mat4(wx2, pY(lz) + ly, wz2, pyaw + ry, sx, sy, sz, pit + rx, rz)); };
    // fuselage: a lathed tube, fat at the cockpit, thin at the tail (lathe axis along local z)
    const fusG = new THREE.LatheGeometry([[0, -3.4], [0.22, -3.2], [0.42, -1.5], [0.62, 0.6], [0.66, 1.8], [0.58, 2.6], [0.46, 2.95], [0, 3.0]].map(q => new THREE.Vector2(q[0], q[1])), 16).rotateX(PI / 2).scale(1, 1.1, 1);
    pa(fusG, 'plane', 0, 0.62, 0, 1, 1, 1);
    pa(G.ubox, 'planeStripe', 0, 0.62, 0.2, 1.36, 0.1, 5.0);                 // the side stripe
    // biplane wings: lower one crumpled into the sand on the left, upper one on four struts
    pa(G.ubox, 'plane', 0, 0.05, 1.2, 9.6, 0.1, 1.5);
    pa(G.ubox, 'plane', 0, 1.75, 1.35, 10, 0.1, 1.6, 0, -0.03);
    pa(G.ubox, 'planeStripe', 0, 1.86, 1.35, 10.02, 0.02, 0.5, 0, -0.03);
    for (const lx of [-3.4, -1.2, 1.2, 3.4]) for (const lz of [0.8, 1.9]) pa(G.ucyl, 'darkMetal', lx, 0.12, lz, 0.05, 1.65, 0.05);
    // tail: tailplane, fin with the rudder stripe
    pa(G.ubox, 'plane', 0, 0.62, -3.0, 3.6, 0.07, 0.9);
    pa(G.ubox, 'planeStripe', 0, 0.62, -3.15, 0.08, 1.25, 1.0);
    // engine cowling, a bent two-blade prop, the cockpit opening with its windscreen
    pa(G.ucyl, 'darkMetal', 0, 0.62, 3.0, 1.0, 0.5, 1.0, PI / 2);
    pa(G.ubox, 'darkMetal', 0, 0.62, 3.55, 0.12, 1.7, 0.05, 0.25, 0.6);
    pa(G.ubox, 'black', 0, 1.22, 0.6, 0.7, 0.06, 1.0);
    pa(G.ubox, 'glass', 0, 1.2, 1.25, 0.72, 0.4, 0.05, -0.5);
    // the undercarriage: one wheel snapped off, the other still on its leg
    { const [wx2, wz2] = Pp(1.1, 1.8); xadd(G.ucyl, 'darkMetal', mat4(wx2, 0.1, wz2, pyaw, 0.06, 0.7, 0.06)); inst(G.tire, 'rubber', mat4(wx2, 0.0, wz2, pyaw + PI / 2, 1.2, 1.2, 1.2, 0, PI / 2)); }
    { const [wx2, wz2] = Pp(-2.2, 3.6); inst(G.tire, 'rubber', mat4(wx2, 0, wz2, 0.8, 1.2, 1.2, 1.2)); }
    { const [dx, dz] = Pp(0, 1.35); K.solid(px, pz, 0.66, 3.2, pyaw, 1.6, 'metal', 0); K.deck(dx, dz, 5.0, 0.8, pyaw, 1.95, { draw: false, climb: true }); K.solid(dx, dz, 5.0, 0.75, pyaw, 1.95, 'metal', 1.75); }
  }

  // ================================================================ out beyond: mesas on the horizon
  {
    const mr = rng(77);
    const talusG = G.cone.clone(); { const uv = talusG.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 24, uv.getY(k) * 3); }
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * PI * 2 + mr() * 0.3, d = 330 + mr() * 220;
      const sh = new THREE.Shape(), n = 28, rad = 30 + mr() * 50, ph = mr() * 6;
      for (let k = 0; k < n; k++) { const t2 = k / n * PI * 2, rr = rad * (0.78 + 0.14 * Math.sin(t2 * 3 + ph) + 0.1 * Math.sin(t2 * 7 + ph * 2) + mr() * 0.12); const p = [Math.cos(t2) * rr * 1.6, Math.sin(t2) * rr]; if (k) sh.lineTo(p[0], p[1]); else sh.moveTo(p[0], p[1]); }
      const hgt = 16 + mr() * 34;
      const g = new THREE.ExtrudeGeometry(sh, { depth: hgt, steps: 5, bevelEnabled: true, bevelThickness: 8, bevelSize: 10, bevelSegments: 2, curveSegments: 4 }).rotateX(-PI / 2);
      const uv = g.attributes.uv, pos = g.attributes.position;
      for (let k = 0; k < pos.count; k++) {   // weather the cliffs: the face wanders in and out with height (ledges, gullies)
        const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k), an = Math.atan2(z, x), w = 1 + 0.05 * Math.sin(an * 9 + y * 0.21 + ph) + 0.035 * Math.sin(an * 17 - y * 0.37) + 0.03 * Math.sin(y * 0.6 + an * 4);
        pos.setXYZ(k, x * w, y, z * w);
        uv.setXY(k, (x + z) / 46, y / 70);
      }
      g.computeVertexNormals();
      const mx = Math.cos(a) * d, mz = Math.sin(a) * d, ry = mr() * 6;
      xadd(g, 'rock', mat4(mx, -6, mz, ry, 1, 1, 1), false);
      // the talus: a skirt of fallen rock sloping out from the cliff foot into the sand
      xadd(talusG, 'boulder', mat4(mx, -6, mz, ry, rad * 1.6 * 1.32, hgt * 0.42, rad * 1.32), false);
    }
  }

  // ================================================================ the outbreak (chaos layer)
  {
    // wrecks: a burning truck on the highway, a crashed car on Main Street, a car into the café terrace
    K.wreck(HWY - 1.5, -14, 0.25, 3, true); K.wreck(HWY + 2, 34, PI - 0.4, 1, false, PI / 2 * 0.95);
    K.wreck(40, -4.5, 1.9, 6, false); K.wreck(-50, -3, 0.5, 5, true);
    // the army checkpoint closing the highway north of the village
    K.chaos(HWY, -98, () => {
      for (const x of [HWY - 3.5, HWY, HWY + 3.5]) K.barricade(x, -96, 0);
      K.car(HWY + 1.5, -101, PI / 2 + 0.2, 4, 'suv');
      for (let k = 0; k < 8; k++) { const x = HWY - 5 + k * 1.4; inst(G.sack, 'burlap', mat4(x, 0, -94.6, 0, 1.4, 0.7, 1.4)); inst(G.sack, 'burlap', mat4(x + 0.7, 0.36, -94.6, 0, 1.4, 0.7, 1.4)); }
      K.solid(HWY, -94.6, 5.8, 0.4, 0, 0.75, 'dirt', 0, { vault: true });
      K.container('police', HWY + 3, -98.5, 0.6, 'Army ammo crate', 0); xadd(G.crate, 'greenWood', mat4(HWY + 3, 0, -98.5));
      sign(['ROAD CLOSED', 'QUARANTINE — ARMY'], HWY - 6.5, 1.6, -95.5, 0, 2.4, 1.0, '#d8c020', '#111');
      K.emitter({ x: HWY - 2, y: 0.4, z: -100, kind: 'smoke', rate: 1.5, t: 0 });
    }, 'checkpoint');
    // fires: a house courtyard, the date stall, a burning pile in the north lane
    for (const [x, z] of [[-60, -9.5], [-18, 6.8], [-32, -44]]) K.chaos(x, z, () => { K.emitter({ x, y: 0.2, z, kind: 'fire', rate: 7, t: 0, light: true }); K.emitter({ x, y: 1.6, z, kind: 'smoke', rate: 3, t: 0 }); K.hazard(x, z, 1.4, 'fire', 18); inst(G.ubox, 'black', mat4(x, 0, z, R() * 6, 1.6, 0.4, 1.2)); }, 'fire' + x);
    // smoke columns over the horizon: Las Piedras burning
    for (const [x, z] of [[-300, -260], [280, -320], [360, 120], [-220, 340]]) K.chaos(x, z, () => K.emitter({ x, y: 4, z, kind: 'column', rate: 3, t: 0 }));
    // blood and bodies along the lanes, barricaded gates
    for (let i = 0; i < 30; i++) {
      const onMain = R() < 0.6, x = onMain ? -80 + R() * 150 : -22 + R() * 36, z = onMain ? -6.5 + R() * 5 : -18 + R() * 26;
      const cx = Math.floor(x / 25), cz = Math.floor(z / 25);
      K.chaos(cx * 25 + 12, cz * 25 + 12, () => { K.blood(x, z, 0.5 + R() * 0.8); if (R() < 0.25) for (let k = 0; k < 3; k++) xadd(G.paper || G.rug, 'white', mat4(x + R() * 2, 0.02, z + R() * 2, R() * 6, 0.21, 1, 0.28), false); }, 'mess' + cx + ',' + cz);
    }
    for (const H of homes.slice(1)) if (R() < 0.35 && H.gate) { const [gx2, gz2] = H.gate; K.chaos(gx2, gz2, () => { blk(gx2, 0, gz2, 1.0, 0.9, 0.35, H.yaw + (R() - 0.5) * 0.3, 'd_greyWood', 'wood', { vault: true }); inst(G.barrel, 'rust', mat4(gx2 + 1.3, 0, gz2)); }, 'gate' + H.id); }
    for (const [x, z] of [[-30, -10], [22, -2], [-6, 12], [-60, 4], [30, 21]]) K.chaos(x, z, () => { K.container('corpse', x, z, 0.15, 'Body'); xadd(G.ubox, R() < 0.5 ? 'fabricA' : 'fabricB', mat4(x, 0, z, R() * 6, 0.5, 0.25, 1.7)); K.blood(x + 0.3, z + 0.4, 0.8); });
  }

  // ================================================================ zombies come from: the dunes, the wadi ends, the mesa road, the grove
  const spawns = [];
  for (let i = 0; i < 36; i++) { const a = i / 36 * PI * 2, x = Math.cos(a) * 106, z = Math.sin(a) * 106; if (Math.abs(x - STRIP) < 12 && z < 0) continue; spawns.push({ x, z }); }
  spawns.push({ x: -104, z: wadiZ(-104) }, { x: 104, z: wadiZ(104) }, { x: HWY, z: -104 }, { x: HWY, z: 104 }, { x: -60, z: 100 }, { x: -30, z: 98 });
  for (const s of spawns) K.spawn(s.x, s.z);

  // dusk to dawn: the lanterns brighten, their pools of light fade in on the ground (world.daylight, like the street lamps)
  { let last = -1; W.anims.push(() => { const n = Math.max(0, Math.min(1, (0.5 - (W.daylight ?? 1)) * 3)); if (Math.abs(n - last) < 0.01) return; last = n;
    M.lanternOn.emissiveIntensity = 0.4 + n * 2.8; M.pool.opacity = n * 0.3; M.pool.visible = n > 0.01; }); }

  const home = H0;
  return {
    name: 'Arroyo Seco',
    start: { x: -34, z: 2.4, yaw: PI },
    home,
    lz: { x: STRIP, z: -62, yaw: PI },
    lzName: 'the airstrip',
    spawns: W.spawns,
    bounds: W.bounds,
    preset: 'desert',
    ambient: 'desert',
    names: { lz: 'the airstrip', town: 'Arroyo Seco', store: 'Tienda Haddad', well: 'the old well', chapel: 'Capilla de San Isidro', cafe: 'Café Oasis' },
    notes,
    spots: SPOTS,
  };
}
export default buildMap;
