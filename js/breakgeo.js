// Zombie_Apocalypse — the shapes of the things that break (world.js builds and breaks them): fence panels of single
// boards, snapped pickets, slatted crates, pallets, plastic garden chairs and tables, clay flower pots and their shards,
// yard signs on stakes, sawhorse barricade boards, the stump a snapped sapling or post leaves. Made once, shared.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const KEEP = ['position', 'normal', 'uv'];
function clean(g) { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (!KEEP.includes(k)) g.deleteAttribute(k); if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g; }
const merge = gs => mergeGeometries(gs.map(clean));
// planar UVs by each face's main direction, so a plank texture runs at its real scale (tile: metres per repeat)
export function boxUV(g, tile = 1.5, ox = 0, oy = 0) {
  g = clean(g);
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i)), x = p.getX(i) + ox, y = p.getY(i) + oy, z = p.getZ(i);
    if (az >= ax && az >= ay) uv.setXY(i, x / tile, y / tile); else if (ax >= ay) uv.setXY(i, z / tile, y / tile); else uv.setXY(i, x / tile, z / tile);
  }
  return g;
}
const bx = (w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ'))); return g.translate(x, y, z); };
// a little seeded random, so the same piece looks the same every run
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

let K = null;
export function breakKit(TX) {
  if (K) return K;
  const std = o => new THREE.MeshStandardMaterial(o);
  K = {};
  // ---- materials
  K.terracotta = std({ color: 0xa85a36, roughness: 0.85 });
  K.soil = std({ color: 0x2e2116, roughness: 1 });
  K.chairWhite = std({ color: 0xe6e4de, roughness: 0.42 });
  K.chairGreen = std({ color: 0x2f5536, roughness: 0.45 });
  K.crate = std({ map: TX.plankTexture(), color: 0xf0d8b0, roughness: 0.85 });
  K.pallet = std({ map: TX.plankTexture(), color: 0xd8c4a0, roughness: 0.9 });
  K.stake = std({ color: 0x8a6a44, roughness: 0.9 });
  K.stub = std({ color: 0xcbb592, roughness: 0.9 });   // fresh, pale wood where it snapped
  K.signs = [
    [['FOR SALE', 'MAPLE HOLLOW REALTY'], '#b21d1d', '#ffffff'], [['VOTE', 'HENDERSON'], '#1d3a7a', '#f4f0e4'], [['GARAGE SALE', 'SAT 8-2'], '#f2d23a', '#1a1a1a'], [['PROUD PARENT', 'OF AN HONOR STUDENT'], '#1d5a2e', '#ffffff'],
  ].map(([l, bg, fg], i) => std({ map: TX.yardSignTexture(l[0], l[1], bg, fg, 90 + i), roughness: 0.6 }));
  // ---- a privacy-fence panel, 2.4 m post to post: 17 dog-eared boards side by side, two rails behind (local x along
  // the fence, z = 0 the board faces, +z the street side). Each board its own height by a few mm, the odd one bowed.
  {
    const r = rng(11), gs = [];
    for (let i = 0; i < 17; i++) {
      const x = -1.2 + 0.07 + i * 0.1405, h = 1.83 + (r() - 0.5) * 0.02, w = 0.132;
      const b = new THREE.Shape(); b.moveTo(-w / 2, 0); b.lineTo(w / 2, 0); b.lineTo(w / 2, h - 0.03); b.lineTo(w / 2 - 0.03, h); b.lineTo(-w / 2 + 0.03, h); b.lineTo(-w / 2, h - 0.03); b.closePath();
      const g = new THREE.ExtrudeGeometry(b, { depth: 0.017, bevelEnabled: false }).translate(x, 0.05, -0.0085);
      if (r() < 0.15) g.rotateY((r() - 0.5) * 0.03);
      gs.push(boxUV(g, 1.5, i * 0.37));
    }
    for (const y of [0.3, 1.5]) gs.push(boxUV(bx(2.4, 0.09, 0.038, 0, y, -0.03), 1.5));
    K.panel = merge(gs);
    // the same panel after a car went through: boards snapped off at all heights (jagged tops), some gone, the top rail
    // broken and hanging from one post, the bottom one cracked and sagging
    K.panelBroken = [0, 1, 2].map(v => {
      const r2 = rng(40 + v), bs = [];
      for (let i = 0; i < 17; i++) {
        if (r2() < 0.32) continue;
        const x = -1.2 + 0.07 + i * 0.1405, w = 0.132, h = 0.12 + r2() * (r2() < 0.25 ? 1.2 : 0.55), j = 0.04 + r2() * 0.12;
        const b = new THREE.Shape(); b.moveTo(-w / 2, 0); b.lineTo(w / 2, 0); b.lineTo(w / 2, h - j * r2()); b.lineTo(w * (r2() - 0.5) * 0.6, h + j * 0.4); b.lineTo(w * 0.1, h - j * 0.5); b.lineTo(-w / 2, h - j * r2()); b.closePath();
        const g = new THREE.ExtrudeGeometry(b, { depth: 0.017, bevelEnabled: false }).translate(x, 0.05, -0.0085);
        g.rotateX((r2() - 0.5) * 0.25);
        bs.push(boxUV(g, 1.5, i * 0.37));
      }
      bs.push(boxUV(bx(2.3, 0.09, 0.038, 0.05, 0.3, -0.03, 0, 0, 0.06), 1.5));           // the bottom rail, sagging
      bs.push(boxUV(bx(1.0, 0.09, 0.038, -0.7, 1.32, -0.03, 0, 0, -0.55), 1.5));         // half the top rail, hanging off its post
      return merge(bs);
    });
    K.post4 = boxUV(new THREE.BoxGeometry(0.09, 1.97, 0.09).translate(0, 0.985, 0), 1.5);
    K.postCap = new THREE.BoxGeometry(0.11, 0.025, 0.11).translate(0, 1.98, 0);
  }
  // ---- pickets: a snapped one (jagged, pale where it broke), a rail
  {
    const s = new THREE.Shape(); s.moveTo(-0.045, 0); s.lineTo(0.045, 0); s.lineTo(0.045, 0.34); s.lineTo(0.02, 0.41); s.lineTo(0.004, 0.36); s.lineTo(-0.018, 0.44); s.lineTo(-0.045, 0.3); s.closePath();
    K.picketStub = new THREE.ExtrudeGeometry(s, { depth: 0.022, bevelEnabled: false }).translate(0, 0, -0.011);
    K.picketPost = new THREE.BoxGeometry(0.085, 1.0, 0.085).translate(0, 0.5, 0);
    K.picketCap = new THREE.ConeGeometry(0.075, 0.07, 4).rotateY(Math.PI / 4).translate(0, 1.035, 0);
    K.rail = new THREE.BoxGeometry(1, 0.07, 0.025);   // scaled along x to the span
  }
  // ---- a long loose board lying on the ground (plank texture along it)
  K.board = boxUV(new THREE.BoxGeometry(1.0, 0.017, 0.132), 1.5);
  // ---- a slatted wooden crate, 0.62 x 0.48 x 0.46 (open slats on the sides, corner posts, a lid of boards)
  {
    const W = 0.62, H = 0.48, D = 0.46, gs = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) gs.push(bx(0.045, H, 0.045, sx * (W / 2 - 0.022), H / 2, sz * (D / 2 - 0.022)));
    for (let k = 0; k < 3; k++) { const y = 0.06 + k * 0.17; for (const sz of [-1, 1]) gs.push(bx(W, 0.1, 0.018, 0, y + 0.05, sz * (D / 2 - 0.009))); for (const sx of [-1, 1]) gs.push(bx(0.018, 0.1, D - 0.04, sx * (W / 2 - 0.009), y + 0.05, 0)); }
    for (let k = 0; k < 4; k++) gs.push(bx(0.14, 0.018, D, -W / 2 + 0.08 + k * 0.153, H - 0.009, 0));   // lid boards
    gs.push(bx(W - 0.02, 0.018, D - 0.02, 0, 0.009, 0));                                            // the bottom
    K.crateG = merge(gs.map(g => boxUV(g, 0.6)));
    K.crateBox = { hx: W / 2, hz: D / 2, h: H };
  }
  // ---- a shipping pallet, 1.2 x 1.0: seven top boards on three stringers (blocks), three boards underneath
  {
    const gs = [];
    for (let k = 0; k < 7; k++) gs.push(bx(1.2, 0.022, 0.1, 0, 0.133, -0.45 + k * 0.15));
    for (const z of [-0.45, 0, 0.45]) for (const x of [-0.55, 0, 0.55]) gs.push(bx(0.1, 0.078, 0.1, x, 0.083, z));
    for (const z of [-0.45, 0, 0.45]) gs.push(bx(1.2, 0.022, 0.1, 0, 0.033, z));
    for (const x of [-0.55, 0, 0.55]) gs.push(bx(0.1, 0.022, 1.0, x, 0.011, 0));
    K.palletG = merge(gs.map(g => boxUV(g, 1.5)));
  }
  // ---- a stackable plastic garden chair: a dished seat, a slatted back that curves round, flared legs, arms
  {
    const gs = [], sw = 0.46, sd = 0.44, sy = 0.42;
    gs.push(new RoundedBoxGeometry(sw, 0.035, sd, 2, 0.015).translate(0, sy, 0));
    for (let k = 0; k < 5; k++) { const a = (k - 2) * 0.22, x = Math.sin(a) * 0.3, z = -sd / 2 + 0.03 - (1 - Math.cos(a)) * 0.3; gs.push(bx(0.07, 0.42, 0.02, x, sy + 0.25, z, -0.2, a, 0)); }
    gs.push(new RoundedBoxGeometry(sw + 0.04, 0.06, 0.03, 2, 0.012).applyMatrix4(new THREE.Matrix4().makeRotationX(-0.2)).translate(0, sy + 0.48, -sd / 2 - 0.06));
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) { const g = new THREE.CylinderGeometry(0.018, 0.024, sy, 8).translate(0, -sy / 2, 0); g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(sz * -0.12, 0, sx * 0.1))); gs.push(g.translate(sx * (sw / 2 - 0.03), sy, sz * (sd / 2 - 0.03))); }
      gs.push(new RoundedBoxGeometry(0.05, 0.03, sd + 0.02, 2, 0.012).translate(sx * (sw / 2 + 0.01), sy + 0.22, 0.0));
      gs.push(bx(0.03, 0.22, 0.03, sx * (sw / 2 + 0.01), sy + 0.11, sd / 2 - 0.04));
    }
    K.chairG = merge(gs);
  }
  // ---- a round plastic patio table (0.7 m), four legs
  {
    const gs = [new THREE.CylinderGeometry(0.35, 0.35, 0.025, 28).translate(0, 0.7, 0), new THREE.TorusGeometry(0.35, 0.014, 6, 28).rotateX(Math.PI / 2).translate(0, 0.69, 0)];
    for (let k = 0; k < 4; k++) { const a = k / 4 * 6.28 + 0.78, g = new THREE.CylinderGeometry(0.016, 0.022, 0.72, 8).translate(0, -0.36, 0); g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(Math.cos(a) * 0.12, 0, -Math.sin(a) * 0.12))); gs.push(g.translate(Math.sin(a) * 0.25, 0.7, Math.cos(a) * 0.25)); }
    K.tableG = merge(gs);
  }
  // ---- a clay flower pot: a turned profile with a rolled rim, the soil inside, and the shards it breaks into
  {
    const pts = [[0, 0], [0.12, 0], [0.125, 0.01], [0.16, 0.26], [0.185, 0.27], [0.19, 0.32], [0.17, 0.33], [0.165, 0.3], [0.12, 0.03], [0, 0.03]].map(([x, y]) => new THREE.Vector2(x, y));
    K.pot = new THREE.LatheGeometry(pts, 22);
    K.potSoil = new THREE.CylinderGeometry(0.158, 0.15, 0.02, 18).translate(0, 0.28, 0);
    // what's left standing: the base and a jagged ring of wall
    const base = [[0, 0], [0.12, 0], [0.125, 0.01], [0.14, 0.1], [0.12, 0.03], [0, 0.03]].map(([x, y]) => new THREE.Vector2(x, y));
    K.potBase = new THREE.LatheGeometry(base, 18);
    K.shard = new THREE.CylinderGeometry(0.17, 0.17, 0.12, 4, 1, true, 0, 0.9);
    K.soilHeap = (() => { const g = new THREE.SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setY(i, y * 0.35 * (1 + Math.sin(p.getX(i) * 31 + p.getZ(i) * 17) * 0.15)); } g.computeVertexNormals(); return g; })();
  }
  // ---- a yard sign: a painted board on a wooden stake
  K.signBoard = new THREE.BoxGeometry(0.6, 0.45, 0.018);
  K.stakeG = boxUV(new THREE.BoxGeometry(0.045, 1.05, 0.045).translate(0, 0.525, 0), 1.0);
  // ---- a sawhorse barricade board: 2.4 m, the reflective stripes repeating every 1.2 m
  { const g = new THREE.BoxGeometry(2.4, 0.2, 0.05); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 2); K.barBoard = g; }
  // ---- the stump a snapped trunk or post leaves: a short piece with a splintered top
  K.stump = (() => { const g = new THREE.CylinderGeometry(1, 1, 1, 9, 2).translate(0, 0.5, 0); const p = g.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) > 0.99) { const a = Math.atan2(p.getZ(i), p.getX(i)); p.setY(i, 1 + Math.sin(a * 3) * 0.35 + Math.sin(a * 7) * 0.2); } g.computeVertexNormals(); return g; })();
  K.splitPost = (() => { const g = new THREE.BoxGeometry(1, 1, 1, 3, 1, 3).translate(0, 0.5, 0); const p = g.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) > 0.99) p.setY(i, 1 + Math.sin(p.getX(i) * 9 + p.getZ(i) * 5) * 0.3); g.computeVertexNormals(); return g; })();
  return K;
}
