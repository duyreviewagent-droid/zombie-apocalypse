// Zombie_Apocalypse — the women of Maple Hollow, each her own person.
// There's only one female body (Mixamo's Michelle: one skinned mesh, one texture atlas), and out of the box she wears
// two pigtail buns, red headphones and orange sunglasses. So, once, before anybody is cloned from her:
//  - cleanFemale: the buns, the headphones and the glasses come off the shared mesh (they're separate pieces of it:
//    found by which bits of the mesh are joined to which, by where they sit on the head, and dropped from the index);
//  - addHair: a real hairstyle fitted to her skull — shoulder-length, long, ponytail, low bun, bob with a fringe,
//    short curls, a braid, long with a fringe — skinned to the head (and, for long hair, to the upper back so it
//    sits on her shoulders instead of swinging through them), with a strand texture, a strand normal map, roots a
//    shade darker than the ends and wispy tips. Black, dark brown, brown, auburn, blonde, grey. The dead's is
//    matted, dulled, dirty and blood-stuck at the ends;
//  - styleFemale: her skin tone (light, olive, tan, brown, dark) re-dyed into her own copy of the texture, the yellow
//    trousers and the black top in other colours, then the hair. People and the dead alike.
import * as THREE from 'three';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const TAU = Math.PI * 2;
function rng(seed) {   // the same seed, the same person, every run
  let a = (Math.imul((seed | 0) + 1013, 2654435761) >>> 0) || 1;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const bodyOf = root => { let m = null; root.traverse(o => { if (!m && o.isSkinnedMesh && !o.userData.hair) m = o; }); return m; };
const boneIdx = (sk, re) => sk.bones.findIndex(b => re.test(b.name));

// ---------------------------------------------------------------- taking the buns, headphones and glasses off (once)
// The mesh is made of pieces that share no vertices: the body, the hair-and-buns, the headphones with their band,
// two lenses, the glasses' bridge and arms, two eyes, two eyebrows. A piece that hangs entirely off the head goes if
// it's big (buns, headphones), sits out in front of the eyes (lenses) or is a tiny sliver (bridge, arms).
export function cleanFemale(kindRoot) {
  const m = bodyOf(kindRoot); if (!m) return;
  kindRoot.userData.female = true;
  const geo = m.geometry; if (geo.userData.hairClean) return;
  const sk = m.skeleton, hi = boneIdx(sk, /Head$/), ti = boneIdx(sk, /HeadTop_End$/);
  if (hi < 0 || !geo.index) return;
  const pa = geo.attributes.position, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, ix = geo.index, n = pa.count;
  // weld by position (the uv seams split vertices), then join up everything a triangle connects
  const rep = new Int32Array(n), seen = new Map();
  for (let i = 0; i < n; i++) { const k = pa.getX(i) + ',' + pa.getY(i) + ',' + pa.getZ(i); if (!seen.has(k)) seen.set(k, i); rep[i] = seen.get(k); }
  const par = new Int32Array(n); for (let i = 0; i < n; i++) par[i] = i;
  const find = a => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  for (let t = 0; t < ix.count; t += 3) { const a = find(rep[ix.getX(t)]), b = find(rep[ix.getX(t + 1)]), c = find(rep[ix.getX(t + 2)]); par[a] = c; if (find(b) !== c) par[find(b)] = c; }
  const M = sk.boneInverses[hi], Mi = M.clone().invert(), SC = V(0, 9.5, 1), p = V(), st = new Map();
  for (let i = 0; i < n; i++) {
    let hw = 0; for (let j = 0; j < 4; j++) { const b = si.getComponent(i, j); if (b === hi || b === ti) hw += sw.getComponent(i, j); }
    p.fromBufferAttribute(pa, i).applyMatrix4(M);
    const r = find(rep[i]); let s = st.get(r); if (!s) st.set(r, s = { n: 0, hw: 0, z0: 1e9, x1: 0 });
    s.n++; s.hw += hw; s.z0 = Math.min(s.z0, p.z); s.x1 = Math.max(s.x1, Math.abs(p.x));
  }
  // the hair piece is also her scalp (there's no skin under it): keep the part that hugs the skull, lose the buns
  const drop = new Set(), scalp = new Set();
  for (const [r, s] of st) if (s.hw / s.n > 0.9 && (s.n > 1000 || s.z0 > 9.5 || s.n < 40)) (s.n > 1000 && s.x1 > 16 ? scalp : drop).add(r);
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const r = find(rep[i]);
    if (drop.has(r)) out[i] = 1;
    else if (scalp.has(r)) {
      p.fromBufferAttribute(pa, i).applyMatrix4(M);
      if ((p.x / 10.4) ** 2 + ((p.y - 9) / 13.2) ** 2 + ((p.z - 0.5) / 12) ** 2 > 1 || p.y < lineAt(LINE, Math.atan2(p.x, p.z - 1.4)) + 0.4) out[i] = 1;   // buns, and anything below the new hairline
      else { const d = p.clone().sub(SC), l = d.length(); p.addScaledVector(d, -0.6 / l).applyMatrix4(Mi); pa.setXYZ(i, p.x, p.y, p.z); }   // sunk a little, under the new hair
    }
  }
  pa.needsUpdate = true;
  const keep = [];
  for (let t = 0; t < ix.count; t += 3) {
    const a = ix.getX(t), b = ix.getX(t + 1), c = ix.getX(t + 2);
    if (out[a] || out[b] || out[c]) continue;
    keep.push(a, b, c);
  }
  geo.setIndex(new THREE.BufferAttribute(n > 65535 ? new Uint32Array(keep) : new Uint16Array(keep), 1));
  geo.clearGroups();
  geo.userData.hairClean = true;
}

// ---------------------------------------------------------------- measuring her head (once)
// In the head bone's own space (y up, +z out of the face): the skull's radius in every direction from its middle,
// and how far the body reaches out from the head's vertical axis at every height and bearing (head, ears, jaw,
// neck, shoulders, back — not the arms) so hair hangs clear of it.
const NT = 24, NPH = 48, NA = 64, Y0 = -62, Y1 = 28;
function fitOf(m) {
  const geo = m.geometry; if (geo.userData.hairFit) return geo.userData.hairFit;
  const sk = m.skeleton, hi = boneIdx(sk, /Head$/), ti = boneIdx(sk, /HeadTop_End$/), s2 = boneIdx(sk, /Spine2$/);
  const pa = geo.attributes.position, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, ix = geo.index;
  const kind = sk.bones.map((b, i) => i === hi || i === ti ? 'head' : /(Left|Right)Arm$/.test(b.name) ? 'arm' : /ForeArm|Hand|Leg|Foot|Toe/.test(b.name) ? 'skip' : 'body');
  const used = new Uint8Array(pa.count); for (let t = 0; t < ix.count; t++) used[ix.getX(t)] = 1;
  const M = sk.boneInverses[hi], pts = [];
  let y0 = 1e9, y1 = -1e9, zf = -1e9, zb = 1e9;
  for (let i = 0; i < pa.count; i++) {
    if (!used[i]) continue;
    let hw = 0, best = 0, bw = 0;
    for (let j = 0; j < 4; j++) { const b = si.getComponent(i, j), w = sw.getComponent(i, j); if (kind[b] === 'head') hw += w; if (w > bw) { bw = w; best = b; } }
    const p = V().fromBufferAttribute(pa, i).applyMatrix4(M);
    pts.push([p, hw, kind[best]]);
    if (hw > 0.6) { y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); if (p.y > 12) { zf = Math.max(zf, p.z); zb = Math.min(zb, p.z); } }
  }
  const C = V(0, (y0 + y1) / 2 + 1, (zf + zb) / 2);
  // skull radius per (polar angle from straight up, bearing round from the face)
  const sr = new Float32Array(NT * NPH);
  for (const [p, hw] of pts) {
    if (hw < 0.5) continue;
    const d = p.clone().sub(C), r = d.length(), th = Math.acos(clamp(d.y / r, -1, 1)), ph = (Math.atan2(d.x, d.z) + TAU) % TAU;
    const k = Math.min(NT - 1, Math.floor(th / Math.PI * NT)) * NPH + Math.floor(ph / TAU * NPH) % NPH;
    sr[k] = Math.max(sr[k], r);
  }
  fill(sr, NT, NPH);
  // body reach: max distance from the vertical axis through the head's middle, per bearing and 1-unit height band
  const NY = Y1 - Y0, ev = new Float32Array(NY * NA);
  for (const [p, , k] of pts) {
    if (k === 'skip') continue;
    const r = Math.hypot(p.x, p.z - C.z); if (k === 'arm' && r > 14) continue;   // the shoulder's cap, not the arm stuck out in the bind pose
    const yb = Math.floor(p.y - Y0); if (yb < 0 || yb >= NY) continue;
    const a = (Math.atan2(p.x, p.z - C.z) + TAU) % TAU, ab = Math.floor(a / TAU * NA) % NA;
    ev[yb * NA + ab] = Math.max(ev[yb * NA + ab], r);
  }
  fill(ev, NY, NA, true);
  const F = {
    C, hi, s2: s2 < 0 ? hi : s2, Minv: M.clone().invert(),
    // skull radius in a direction (from C)
    R(d) {
      const th = Math.acos(clamp(d.y / d.length(), -1, 1)) / Math.PI * NT - 0.5, ph = ((Math.atan2(d.x, d.z) + TAU) % TAU) / TAU * NPH - 0.5;
      return bilerp(sr, NT, NPH, th, ph);
    },
    // body reach at bearing a (0 = the face) and height y
    env(a, y) { return bilerp(ev, NY, NA, clamp(y - Y0 - 0.5, 0, NY - 1), ((a % TAU + TAU) % TAU) / TAU * NA - 0.5); },
  };
  F.zBack = y => C.z - F.env(Math.PI, y);
  geo.userData.hairFit = F;
  return F;
}
// empty cells take their neighbours' value (rows clamp, columns wrap round); then one light blur
function fill(g, rows, cols, keepEmptyRows = false) {
  for (let pass = 0; pass < 60; pass++) {
    let empty = 0; const out = g.slice();
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (g[r * cols + c] > 0) continue;
      let s = 0, n = 0;
      for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const rr = r + dr; if (rr < 0 || rr >= rows) continue; if (keepEmptyRows && dr) continue; const v = g[rr * cols + (c + dc + cols) % cols]; if (v > 0) { s += v; n++; } }
      if (n) out[r * cols + c] = s / n; else empty++;
    }
    g.set(out); if (!empty) break;
  }
  if (keepEmptyRows) for (let r = 0; r < rows; r++) {   // a band with nothing in it at all copies the nearest band that has
    if (g[r * cols] > 0) continue;
    for (let d = 1; d < rows; d++) { const rr = r - d >= 0 && g[(r - d) * cols] > 0 ? r - d : r + d < rows && g[(r + d) * cols] > 0 ? r + d : -1; if (rr >= 0) { for (let c = 0; c < cols; c++) g[r * cols + c] = g[rr * cols + c]; break; } }
  }
  const out = g.slice();
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out[r * cols + c] = g[r * cols + c] * 0.5 + (g[r * cols + (c + 1) % cols] + g[r * cols + (c + cols - 1) % cols]) * 0.25;
  g.set(out);
}
function bilerp(g, rows, cols, r, c) {
  r = clamp(r, 0, rows - 1); const r0 = Math.floor(r), r1 = Math.min(rows - 1, r0 + 1), fr = r - r0;
  c = (c % cols + cols) % cols; const c0 = Math.floor(c), c1 = (c0 + 1) % cols, fc = c - c0;
  return (g[r0 * cols + c0] * (1 - fc) + g[r0 * cols + c1] * fc) * (1 - fr) + (g[r1 * cols + c0] * (1 - fc) + g[r1 * cols + c1] * fc) * fr;
}

// ---------------------------------------------------------------- the pieces hair is made of (head-bone space)
// Every piece is a grid of vertices (u round, v along the strands from root to tip) or a set of them.
function grid(P, cols, rows, at, ref, closed = false) {
  const base = P.pos.length / 3;
  for (let j = 0; j <= cols; j++) for (let i = 0; i <= rows; i++) { const [p, u, v] = at(j, i); P.pos.push(p.x, p.y, p.z); P.uv.push(u, v); }
  const idx = [];
  for (let j = 0; j < cols; j++) for (let i = 0; i < rows; i++) {
    const a = base + j * (rows + 1) + i, b = a + rows + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  // wind every piece so its faces look outward (from ref: a point inside it)
  const q = idx.length / 2 - (idx.length / 2) % 3, pp = i => V(P.pos[idx[q + i] * 3], P.pos[idx[q + i] * 3 + 1], P.pos[idx[q + i] * 3 + 2]);
  const A = pp(0), B = pp(1), Cc = pp(2), nrm = B.clone().sub(A).cross(Cc.clone().sub(A)), mid = A.clone().add(B).add(Cc).multiplyScalar(1 / 3);
  if (nrm.dot(mid.sub(ref(mid))) < 0) for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; }
  P.idx.push(...idx);
  void closed;
}
// how far down the head the hair grows, by bearing (0 the face, PI the nape): the height of the hairline
const LINE = [[0, 16.6], [0.45, 16], [0.8, 13.4], [1.05, 12.2], [1.4, 11.6], [1.75, 10.6], [2.1, 7], [2.5, 2.2], [Math.PI, 0.2]];
const LINE_CURL = [[0, 16.4], [0.45, 15.8], [0.8, 13.2], [1.05, 11.6], [1.4, 9.5], [1.75, 6.5], [2.1, 3], [2.5, 0.5], [Math.PI, -1]];
const lineAt = (T, a) => { a = Math.abs(a); for (let i = 1; i < T.length; i++) if (a <= T[i][0]) { const k = (a - T[i - 1][0]) / (T[i][0] - T[i - 1][0]); return T[i - 1][1] + (T[i][1] - T[i - 1][1]) * k; } return T[T.length - 1][1]; };
// the scalp: a shell over the skull out to the hairline, thick on top, down to nothing at the edge
function cap(P, F, o) {
  const NP = o.np || 96, NR = o.nr || 22, C = F.C, R = o.rnd;
  const pole = V(o.px || 0, 1, o.pz || 0).normalize(), e1 = V(0, 0, 1).addScaledVector(pole, -pole.z).normalize(), e2 = V().crossVectors(pole, e1);
  const dir = (th, ph) => pole.clone().multiplyScalar(Math.cos(th)).addScaledVector(e1, Math.sin(th) * Math.cos(ph)).addScaledVector(e2, Math.sin(th) * Math.sin(ph));
  let tm = [];
  for (let j = 0; j < NP; j++) {
    const ph = j / NP * TAU; let t = 0.2;
    for (let th = 0.2; th < 2.9; th += 0.012) { const d = dir(th, ph), p = C.clone().addScaledVector(d, F.R(d)); if (p.y < lineAt(o.line || LINE, Math.atan2(p.x, p.z - C.z))) break; t = th; }
    tm.push(t);
  }
  for (let k = 0; k < 4; k++) tm = tm.map((t, j) => (tm[(j + NP - 1) % NP] + t * 2 + tm[(j + 1) % NP]) / 4);
  const ph0 = R() * 10, lump = o.lump || 0;
  grid(P, NP, NR, (j, i) => {
    const t = i / NR, ph = j / NP * TAU, th = t * tm[j % NP], d = dir(th, ph);
    let off = o.vol * (1 - smooth(o.edgeK ?? 0.55, 1, t)) * (1 + 0.12 * Math.sin(ph * 2 + ph0)) + o.edge;
    off += 0.12 * Math.sin(ph * 70 + Math.sin(ph * 9 + ph0) * 3) * smooth(0.1, 0.4, t);   // strands, a ridge at a time
    if (lump) { const q = C.clone().addScaledVector(d, 12); off += lump * (noise3(q.x * 0.45, q.y * 0.45, q.z * 0.45 + ph0) - 0.5) * (1 - smooth(0.7, 1, t) * 0.7); }
    return [C.clone().addScaledVector(d, F.R(d) + off), j / NP * (o.rep || 8), t * 0.86];
  }, () => C);
}
// hair hanging down from under the cap: columns all round the back from one side of the face to the other, each
// falling straight down and pushed out only where the head, ears, neck or shoulders are in the way
function curtain(P, F, o) {
  const NC = o.nc || 84, NR = o.nr || 32, C = F.C, R = o.rnd, a0 = o.a0, span = o.span ?? TAU - 2 * a0;
  const cols = [], ph = [R() * 9, R() * 9, R() * 9];
  for (let j = 0; j <= NC; j++) {
    const s = j / NC, a = a0 + s * span, ye = o.yEnd(a, s), col = [];
    let r = 0;
    for (let i = 0; i <= NR; i++) {
      const t = i / NR, y = o.yTop + (ye - o.yTop) * t, gap = o.gap + o.flare * t;
      r = Math.max(r, F.env(a, y) + gap); col.push([y, r, F.env(a, y) + o.gap * 0.6]);
    }
    for (let k = 0; k < 6; k++) for (let i = 1; i < NR; i++) col[i][1] = Math.max(col[i][2], (col[i - 1][1] + col[i][1] * 2 + col[i + 1][1]) / 4);
    cols.push({ a, col });
  }
  for (let k = 0; k < 3; k++) for (let j = 1; j < NC; j++) for (let i = 0; i <= NR; i++) {
    const c = cols[j].col[i]; c[1] = Math.max(c[2], (cols[j - 1].col[i][1] + c[1] * 2 + cols[j + 1].col[i][1]) / 4);
  }
  grid(P, NC, NR, (j, i) => {
    const { a, col } = cols[j], t = i / NR, [y] = col[i];
    let r = col[i][1];
    r -= (o.curl || 0) * smooth(0.72, 1, t);                                                  // the ends turned under
    const clump = Math.sin(a * 23 + ph[0]) * 0.5 + Math.sin(a * 41 + ph[1]) * 0.3 + Math.sin(a * 67 + ph[2]) * 0.2;
    r += (o.ridge ?? 0.35) * clump * (0.3 + 0.7 * t) + 0.08 * Math.sin(a * 140);           // locks, then single strands
    return [V(Math.sin(a) * r, y, C.z + Math.cos(a) * r), j / NC * (o.rep || 10), (0.35 + t * 0.65) * (o.vEnd ?? 1)];   // starts past the dark roots the cap ends on (no band)
  }, p => V(0, p.y, C.z));
}
// a tail of hair along a path (ponytail): round, ridged with locks that twist a little, tapering to wisps
function tube(P, pts, rad, o = {}) {
  const curve = new THREE.CatmullRomCurve3(pts), N = o.n || 40, M = o.m || 16, fr = curve.computeFrenetFrames(N, false), R = o.rnd || Math.random, ph = R() * 9;
  grid(P, M, N, (j, i) => {
    const t = i / N, c = curve.getPointAt(t), ang = j / M * TAU, rr = rad(t) * (1 + 0.1 * Math.sin(ang * 7 + t * 5 + ph) + 0.05 * Math.sin(ang * 13 - t * 9));
    const p = c.clone().addScaledVector(fr.normals[i], Math.cos(ang) * rr).addScaledVector(fr.binormals[i], Math.sin(ang) * rr);
    return [p, j / M * (o.rep || 3), t * (o.vEnd ?? 1)];
  }, p => { let best = 0, bd = 1e9; for (let k = 0; k <= 20; k++) { const d = curve.getPointAt(k / 20).distanceTo(p); if (d < bd) { bd = d; best = k / 20; } } return curve.getPointAt(best); });
  return curve;
}
// a squashed ball of hair (a bun, one lump of a braid), its locks spiralling round
function blob(P, c, rx, ry, rz, o = {}) {
  const NU = o.nu || 18, NV = o.nv || 12, q = o.q || new THREE.Quaternion(), tw = o.twist ?? 6;
  grid(P, NU, NV, (j, i) => {
    const lon = j / NU * TAU, lat = i / NV * Math.PI, k = 1 + (o.ridge ?? 0.07) * Math.sin(lon * tw + lat * 4);
    const p = V(Math.sin(lat) * Math.cos(lon) * rx * k, Math.cos(lat) * ry * k, Math.sin(lat) * Math.sin(lon) * rz * k).applyQuaternion(q).add(c);
    return [p, j / NU * (o.rep || 2), (o.v0 || 0) + lat / Math.PI * (o.vk || 0.8)];
  }, () => c);
}
// smooth 3D value noise (the curls)
const hsh = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf), L = (a, b, t) => a + (b - a) * t;
  return L(L(L(hsh(xi, yi, zi), hsh(xi + 1, yi, zi), u), L(hsh(xi, yi + 1, zi), hsh(xi + 1, yi + 1, zi), u), v),
    L(L(hsh(xi, yi, zi + 1), hsh(xi + 1, yi, zi + 1), u), L(hsh(xi, yi + 1, zi + 1), hsh(xi + 1, yi + 1, zi + 1), u), v), w);
}

// ---------------------------------------------------------------- the styles
export const STYLES = ['shoulder', 'long', 'ponytail', 'bun', 'bob', 'curly', 'braid', 'longFringe'];
function buildStyle(F, style, { zombie = false, tip = false } = {}) {
  const P = { pos: [], uv: [], idx: [] }, R = rng(STYLES.indexOf(style) * 31 + 7), C = F.C;
  const back = a => Math.abs(Math.cos(a / 2));   // 0 at the face, 1 straight behind
  const capped = (cv, cp) => Object.assign(cv, { yTop: 18.5, gap: cp.vol + cp.edge - 0.1 });
  const fringe = (yEnd, a1) => curtain(P, F, { rnd: R, a0: -a1, span: 2 * a1, yTop: 20.5, yEnd: a => yEnd + Math.abs(a) * 2.6, gap: 0.75, flare: 0.25, ridge: 0.22, nc: 40, nr: 10, rep: 5 });
  switch (style) {
    case 'shoulder':   // straight, just past the shoulders, a side parting
      { const cp = { rnd: R, vol: 1.3, edge: 0.3, px: 0.16, pz: 0.05 }; cap(P, F, cp);
        curtain(P, F, capped({ rnd: R, a0: 1.02, yEnd: a => -11 - 6 * back(a), flare: 0.4, curl: 0.4 }, cp)); }
      break;
    case 'long':       // long and straight, down the back, the front tucked behind the shoulders
      { const cp = { rnd: R, vol: 1.2, edge: 0.3, px: -0.14, pz: 0.06 }; cap(P, F, cp);
        curtain(P, F, capped({ rnd: R, a0: 1.0, yEnd: a => -13 - 26 * smooth(0.45, 0.9, back(a)), flare: 0.45, ridge: 0.45 }, cp)); }
      break;
    case 'longFringe': // long with a full fringe
      { const cp = { rnd: R, vol: 1.3, edge: 0.3 }; cap(P, F, cp);
        curtain(P, F, capped({ rnd: R, a0: 0.95, yEnd: a => -12 - 22 * smooth(0.45, 0.9, back(a)), flare: 0.45, ridge: 0.45 }, cp)); }
      fringe(14.6, 0.95);
      break;
    case 'bob': {      // chin-length, full, the ends turned under, a fringe
      const cp = { rnd: R, vol: 1.8, edge: 0.35 }; cap(P, F, cp);
      curtain(P, F, capped({ rnd: R, a0: 0.92, yEnd: a => -2.5 + 1.5 * back(a), flare: 0.9, curl: 1.1, ridge: 0.25 }, cp));
      fringe(14.8, 0.92);
      break;
    }
    case 'curly':      // short natural curls all over; tip: the sparse outer shell of loose coils that breaks up the outline
      if (tip) cap(P, F, { rnd: rng(91), vol: 3.6, edge: 1.1, edgeK: 0.75, lump: 3.5, line: LINE_CURL, np: 120, nr: 28, rep: 5 });
      else cap(P, F, { rnd: R, vol: 2.7, edge: 0.8, edgeK: 0.75, lump: 2.6, line: LINE_CURL, np: 120, nr: 28, rep: 6 });
      break;
    case 'ponytail': { // pulled back tight, tied high at the back
      cap(P, F, { rnd: R, vol: 0.55, edge: 0.25, pz: -0.5, edgeK: 0.7 });
      const ty = 12.5, tz = F.zBack(ty) - 0.2, T = V(0, ty, tz);
      const zb = y => Math.min(F.zBack(y), tz) - 0.6;
      const pts = [T.clone().add(V(0, 0.4, 1.2)), T.clone().add(V(0, 0.3, -1.4)), V(0, ty - 4, zb(ty - 4) - 3.6), V(0, ty - 12, zb(ty - 12) - 3.4), V(0, -8, zb(-8) - 2.8), V(0, -16, zb(-16) - 2.2)];
      tube(P, pts, t => (1.1 + 1.6 * smooth(0, 0.18, t)) * (1 - 0.82 * smooth(0.35, 1, t)) + 0.25, { rnd: R, rep: 3 });
      blob(P, T.clone().add(V(0, 0, -0.5)), 1.55, 1.55, 1.1, { q: new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), Math.PI / 2 - 0.5), ridge: 0.05, twist: 9, vk: 0.5 });   // wrapped round the tie
      break;
    }
    case 'bun': {      // a low bun at the nape
      cap(P, F, { rnd: R, vol: 0.6, edge: 0.25, pz: -0.55, edgeK: 0.7 });
      const by = 6, c = V(0, by, F.zBack(by) - 2.6);
      blob(P, c, 4.4, 3.6, 3.2, { q: new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -0.35), nu: 26, nv: 16, ridge: 0.09, twist: 5 });
      break;
    }
    case 'braid': {    // one plait down the back
      cap(P, F, { rnd: R, vol: 0.6, edge: 0.25, pz: -0.55, edgeK: 0.7 });
      const ty = 7, T = V(0, ty, F.zBack(ty) - 0.6), zb = y => Math.min(F.zBack(y), T.z) - 1.6;
      const curve = new THREE.CatmullRomCurve3([T, V(0, ty - 4, zb(ty - 4) - 0.6), V(0, -6, zb(-6)), V(0, -16, zb(-16)), V(0, -27, zb(-27))]);
      const NL = 16, fr = curve.computeFrenetFrames(NL, false);
      for (let i = 0; i < NL; i++) {
        const t = (i + 0.5) / NL, c = curve.getPointAt(t), tg = curve.getTangentAt(t), side = i % 2 ? 1 : -1, w = 1.9 * (1 - 0.45 * t);
        const sd = V().crossVectors(tg, V(0, 0, -1)).normalize();
        c.addScaledVector(sd, side * w * 0.42); void fr;
        const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), tg).multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), side * 0.5));
        blob(P, c, w * 0.62, w * 1.05, w * 0.55, { q, nu: 12, nv: 8, ridge: 0.06, twist: 3, v0: 0.1, vk: 0.7 });
      }
      const end = curve.getPointAt(1);
      tube(P, [end.clone().add(V(0, 2, 0)), end, end.clone().add(V(0, -2.5, -0.2)), end.clone().add(V(0, -5, -0.5))], t => 0.95 * (1 - 0.7 * t) + 0.15, { rnd: R, n: 12, m: 10, rep: 2 });   // the loose end below the tie
      blob(P, curve.getPointAt(0.985), 0.85, 0.5, 0.85, { nu: 10, nv: 6, ridge: 0, vk: 0.3 });
      break;
    }
  }
  if (zombie) matted(P, F);
  return toGeo(F, P);
}
// a zombie's hair: not groomed any more. Locks hang longer and stick out, the parting and the tie come loose,
// and here and there a clump has been torn out.
function matted(P, F) {
  const n = P.pos.length / 3, C = F.C;
  for (let i = 0; i < n; i++) {
    const x = P.pos[i * 3], y = P.pos[i * 3 + 1], z = P.pos[i * 3 + 2], v = P.uv[i * 2 + 1];
    const a = Math.atan2(x, z - C.z), lock = noise3(Math.cos(a) * 3.1, Math.sin(a) * 3.1, 7.3);
    const dx = x, dz = z - C.z, r = Math.hypot(dx, dz) || 1;
    let out = 0.25 * (noise3(x * 0.5, y * 0.5, z * 0.5) - 0.5);                         // loosened everywhere
    if (y < 0) out += (0.6 + 0.6 * noise3(x * 0.35 + 3, y * 0.25, z * 0.35)) * smooth(0, -6, y);   // straggly below the jaw
    P.pos[i * 3] += dx / r * out; P.pos[i * 3 + 2] += dz / r * out;
    if (y < 2) P.pos[i * 3 + 1] -= 4 * smooth(0.55, 1, v) * smooth(0.45, 0.9, lock);            // some locks hang longer
  }
  // torn out: drop the triangles in a few patches (not on the crown, where it would show the scalp as a hole)
  const idx = [], I = P.idx;
  for (let k = 0; k < I.length; k += 3) {
    let cx = 0, cy = 0, cz = 0; for (let m = 0; m < 3; m++) { cx += P.pos[I[k + m] * 3]; cy += P.pos[I[k + m] * 3 + 1]; cz += P.pos[I[k + m] * 3 + 2]; }
    cx /= 3; cy /= 3; cz /= 3;
    if (cy < 4 && noise3(cx * 0.3 + 11, cy * 0.3, cz * 0.3) > 0.78) continue;
    idx.push(I[k], I[k + 1], I[k + 2]);
  }
  P.idx = idx;
}
// into the body mesh's own space, skinned: the head carries it, long hair below the jaw goes over to the upper back
function toGeo(F, P) {
  const n = P.pos.length / 3, pos = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), p = V();
  for (let i = 0; i < n; i++) {
    p.set(P.pos[i * 3], P.pos[i * 3 + 1], P.pos[i * 3 + 2]);
    const wh = smooth(-13, -1.5, p.y);
    si[i * 4] = F.hi; si[i * 4 + 1] = F.s2; sw[i * 4] = wh; sw[i * 4 + 1] = 1 - wh;
    p.applyMatrix4(F.Minv); pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(P.uv, 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(P.idx, 1) : new THREE.Uint16BufferAttribute(P.idx, 1));
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- strands: colour/alpha and normal maps (made once)
const TEX = {};
function strandTex(kind) {
  if (TEX[kind]) return TEX[kind];
  const W = 256, H = 512, R = rng(kind === 'straight' ? 3 : 5), col = new Float32Array(W), d = document.createElement('canvas');
  d.width = W; d.height = H; const cx = d.getContext('2d'), img = cx.createImageData(W, H), px = img.data;
  const hgt = new Float32Array(W * H);
  if (kind === 'straight') {
    // every column of texels a strand: lighter and darker ones, gathered into locks, a slow wave down them
    for (let x = 0; x < W; x++) col[x] = 0.55 + R() * 0.45;
    for (let k = 0; k < 3; k++) for (let x = 0; x < W; x++) col[x] = col[x] * 0.7 + (col[(x + 1) % W] + col[(x + W - 1) % W]) * 0.15 + (R() - 0.5) * 0.12;
    const lock = new Float32Array(W); for (let x = 0; x < W; x++) lock[x] = 0.85 + 0.15 * Math.sin(x / W * TAU * 9 + Math.sin(x / W * TAU * 4) * 2);
    const tip = new Float32Array(W); for (let x = 0; x < W; x++) tip[x] = 0.9 + 0.1 * (0.5 + 0.5 * Math.sin(x * 0.37) * Math.sin(x * 0.11 + 1)) * R();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = y / H, xs = (x + Math.round(Math.sin(v * 9 + x * 0.05) * 1.5) + W) % W, b = clamp(col[xs] * lock[xs], 0, 1), i = (y * W + x) * 4;
      hgt[y * W + x] = b;
      px[i] = px[i + 1] = px[i + 2] = Math.round(b * 255);
      px[i + 3] = v > tip[x] ? 0 : v > tip[x] - 0.04 ? 255 * (tip[x] - v) / 0.04 : 255;
    }
  } else {
    // tight coils: little bright arcs on a dark ground
    cx.fillStyle = '#5a5a5a'; cx.fillRect(0, 0, W, H);
    for (let k = 0; k < 2600; k++) {
      const x = R() * W, y = R() * H, r = 2 + R() * 4, a = R() * TAU, b = 110 + R() * 145;
      cx.strokeStyle = `rgb(${b},${b},${b})`; cx.lineWidth = 0.8 + R() * 1.2;
      for (const dx of [-W, 0, W]) { cx.beginPath(); cx.arc(x + dx, y, r, a, a + 2.4 + R() * 2); cx.stroke(); }
    }
    const id2 = cx.getImageData(0, 0, W, H).data;
    for (let i = 0; i < W * H; i++) { hgt[i] = id2[i * 4] / 255; px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = id2[i * 4]; px[i * 4 + 3] = kind === 'curlTip' ? (id2[i * 4] > 100 ? 255 : 0) : 255; }   // tips: only the coils, the ground see-through
  }
  cx.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(d); map.wrapS = THREE.RepeatWrapping; map.wrapT = THREE.ClampToEdgeWrapping; map.colorSpace = THREE.NoColorSpace; map.anisotropy = 4;
  // the normal map: each strand a little rounded ridge (the slope across it from the brightness)
  const nd = document.createElement('canvas'); nd.width = W; nd.height = H; const nx = nd.getContext('2d'), ni = nx.createImageData(W, H), np = ni.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const h = i2 => hgt[y * W + (i2 + W) % W], dx = (h(x + 1) - h(x - 1)) * 2.2, dy = kind !== 'straight' ? (hgt[Math.min(H - 1, y + 1) * W + x] - hgt[Math.max(0, y - 1) * W + x]) * 2.2 : 0;
    const l = Math.hypot(dx, dy, 1), i = (y * W + x) * 4;
    np[i] = Math.round((-dx / l * 0.5 + 0.5) * 255); np[i + 1] = Math.round((dy / l * 0.5 + 0.5) * 255); np[i + 2] = Math.round((1 / l * 0.5 + 0.5) * 255); np[i + 3] = 255;
  }
  nx.putImageData(ni, 0, 0);
  const nrm = new THREE.CanvasTexture(nd); nrm.wrapS = THREE.RepeatWrapping; nrm.wrapT = THREE.ClampToEdgeWrapping; nrm.colorSpace = THREE.NoColorSpace;
  return TEX[kind] = { map, nrm };
}

// ---------------------------------------------------------------- the material
// The strand texture rides in its own uniform (not .map), so nothing that re-dyes clothes by their map touches it.
// hDead 0..1: how far gone (a zombie's 1; a body that's turning shares the shader's amount with its skin).
export const HAIR_COLS = { black: 0x16120f, darkBrown: 0x33241a, brown: 0x5e3f28, auburn: 0x6e2e1a, blonde: 0xb08f5a, grey: 0x8d8780 };
const COL_PICK = ['black', 'black', 'darkBrown', 'darkBrown', 'darkBrown', 'brown', 'brown', 'auburn', 'blonde', 'blonde', 'grey'];
function hairMat(col, kind, dead) {
  const T = strandTex(kind);
  // physical: a soft sheen along the strands instead of a plastic highlight; alpha-to-coverage feathers the wispy ends
  const m = new THREE.MeshPhysicalMaterial({ color: col, roughness: kind !== 'straight' ? 0.75 : 0.52, metalness: 0, side: THREE.DoubleSide, alphaTest: 0.45, alphaToCoverage: true, normalMap: T.nrm, normalScale: new THREE.Vector2(0.9, 0.9),
    sheen: 0.6, sheenRoughness: 0.35, sheenColor: new THREE.Color(col).multiplyScalar(1.6) });
  m.name = 'Hair';
  const U = { hTex: { value: T.map }, hDead: dead };
  m.userData.hU = U; m.userData.hairLook = { col, kind };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vHUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvHUv = uv;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D hTex; uniform float hDead; varying vec2 vHUv;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec4 hs = texture2D(hTex, vHUv);
        float hv = vHUv.y, hn = texture2D(hTex, vHUv * vec2(0.29, 0.37) + vec2(0.31, 0.17)).r;
        vec3 hc = diffuseColor.rgb * (0.35 + hs.rgb * 1.05) * mix(0.68, 1.1, smoothstep(0.0, 0.55, hv)) * (0.9 + 0.2 * hn);
        float ha = hs.a;
        if (hDead > 0.0) {   // dead: dulled toward grey-brown, filthy, the ends clumped with old blood, straggly
          float hm = texture2D(hTex, vHUv * vec2(0.13, 0.21) + vec2(0.71, 0.4)).r;
          vec3 dc = mix(hc, vec3(dot(hc, vec3(0.3, 0.59, 0.11))), 0.5) * vec3(0.8, 0.76, 0.68) * 0.72;
          dc = mix(dc, dc * 0.55 + vec3(0.025, 0.02, 0.014), smoothstep(0.55, 0.85, hm) * 0.8);   // dust and dirt, never lighter than a shade
          dc = mix(dc, vec3(0.04, 0.006, 0.004), smoothstep(0.5, 0.75, hn) * smoothstep(0.35, 0.95, hv) * 0.7);
          hc = mix(hc, dc, hDead);
          ha *= mix(1.0, step(0.3, hm + (1.0 - hv) * 1.4), hDead);
        }
        diffuseColor.rgb = hc * (gl_FrontFacing ? 1.0 : 0.8);
        diffuseColor.a *= ha;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.88, hDead);');
  };
  m.customProgramCacheKey = () => 'hair-v3';
  return m;
}
const LIVE = new Map(), DEAD = new Map();
const matFor = (col, kind, zombie) => { const M = zombie ? DEAD : LIVE, k = col + ':' + kind; if (!M.has(k)) M.set(k, hairMat(col, kind, { value: zombie ? 1 : 0 })); return M.get(k); };
// the dead version of a head of hair; amt: a turning body's { value } (the hair goes as the skin goes)
export function hairDead(mesh, amt = null) {
  const L = mesh.userData.hairLook || { col: HAIR_COLS.brown, kind: 'straight' };
  return amt ? hairMat(L.col, L.kind, amt) : matFor(L.col, L.kind, true);
}

// ---------------------------------------------------------------- putting it on
const GEOS = new Map();
export function addHair(s, seed = 0, { zombie = false, style = null, color = null } = {}) {
  removeHair(s);
  const body = bodyOf(s.root); if (!body) return null;
  if (!body.geometry.userData.hairClean) cleanFemale(s.kind && s.kind.root || s.root);
  const R = rng(seed * 13 + 5);
  const st = style || STYLES[Math.floor(R() * STYLES.length)], cn = color || COL_PICK[Math.floor(R() * COL_PICK.length)];
  const F = fitOf(body), key = body.geometry.uuid + ':' + st + (zombie ? ':z' : '');
  if (!GEOS.has(key)) GEOS.set(key, buildStyle(F, st, { zombie }));
  const col = HAIR_COLS[cn] ?? cn, kind = st === 'curly' ? 'curl' : 'straight';
  const h = new THREE.SkinnedMesh(GEOS.get(key), matFor(col, kind, zombie));
  h.name = 'Hair'; h.userData.hair = true; h.userData.hairLook = { col, kind, style: st, color: cn };
  if (zombie) h.userData.zDressed = -1;
  h.castShadow = true; h.receiveShadow = true;
  body.parent.add(h); h.position.copy(body.position); h.quaternion.copy(body.quaternion); h.scale.copy(body.scale);
  h.bind(body.skeleton, body.bindMatrix);
  h.boundingSphere = body.boundingSphere; h.frustumCulled = body.frustumCulled;   // culled with the body it's on
  if (st === 'curly') {   // the loose outer coils: a second, see-through shell (no shadow of its own)
    const kt = body.geometry.uuid + ':curlTip' + (zombie ? ':z' : '');
    if (!GEOS.has(kt)) GEOS.set(kt, buildStyle(F, st, { zombie, tip: true }));
    const t = new THREE.SkinnedMesh(GEOS.get(kt), matFor(col, 'curlTip', zombie));
    t.name = 'HairTip'; t.userData.hair = true; t.userData.noShadow = true; t.userData.hairLook = { col, kind: 'curlTip', style: st, color: cn };
    if (zombie) t.userData.zDressed = -1;
    t.castShadow = false; t.receiveShadow = true;
    body.parent.add(t); t.position.copy(body.position); t.quaternion.copy(body.quaternion); t.scale.copy(body.scale);
    t.bind(body.skeleton, body.bindMatrix);
    t.boundingSphere = body.boundingSphere; t.frustumCulled = body.frustumCulled;
    h.userData.tip = t;
  }
  s.hair = h;
  return h;
}
export function removeHair(s) {
  if (!s.hair) return;
  if (s.hair.userData.tip) s.hair.userData.tip.removeFromParent();
  s.hair.removeFromParent(); s.hair = null;
}

// ---------------------------------------------------------------- her own skin and clothes
// Dyed into a copy of the atlas (in the texture's own sRGB bytes): skin by its colour (warm, moderately saturated:
// not the red kit, not the yellow trousers, not the dark top), scaled toward the new tone so every shadow, lip and
// knuckle in the painting stays; the trousers and the top re-dyed the same way people.js dyes clothes.
export const SKIN = { light: [236, 196, 166], olive: [204, 160, 118], tan: [178, 124, 84], brown: [138, 92, 60], dark: [96, 62, 42] };
const SKIN_PICK = ['light', 'light', 'olive', 'tan', 'tan', 'brown', 'brown', 'dark'];
const TOPS = [0x2c3e64, 0x6a2430, 0x55603a, 0xd6d2c6, 0x6e6e6e, 0x2f6a78, 0x46344e, 0x1e1e22, 0x9a3a2a, 0xa8884e, 0x4f7a4a];
const BOTTOMS = [0x34496e, 0x232323, 0x8a7a55, 0x6c6c6c, 0x2a2f45, 0x4a3a2a, 0x3e4a5e, 0x5a2a2a];
const SKINMEAN = new WeakMap(), TONED = new Map(), TORSO = new WeakMap(), imgId = new WeakMap(); let imgN = 0;
const soft = v => v < 205 ? v : 205 + 50 * (1 - Math.exp(-(v - 205) / 50));   // highlights roll off instead of clipping to white
const hueSat = (r, g, b) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), dl = mx - mn, sat = mx ? dl / mx : 0;
  let hue = 0; if (dl > 0) { hue = mx === r ? ((g - b) / dl + 6) % 6 : mx === g ? (b - r) / dl + 2 : (r - g) / dl + 4; hue /= 6; }
  return [hue, sat, 0.299 * r + 0.587 * g + 0.114 * b, mx];
};
const skinW = (hue, sat, lum, r, g, b) => (r >= g && g >= b ? 1 : 0) * smooth(0.0, 0.02, hue) * (1 - smooth(0.095, 0.125, hue)) * smooth(0.14, 0.24, sat) * (1 - smooth(0.7, 0.8, sat)) * smooth(28, 48, lum);
// where things are in the texture, by the triangles that use it: the top (carried by the spine: not the hips, that's
// the waistband), the head (never dyed as clothes), and round the eyes (painted dark where the sunglasses sat)
function masks(geo, skel, sz) {
  if (TORSO.has(geo)) return TORSO.get(geo);
  const ua = geo.attributes.uv, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, pa = geo.attributes.position, ix = geo.index;
  const sp = new Set(skel.bones.map((b, i) => /Spine\d?$|Shoulder$/.test(b.name) ? i : -1).filter(i => i >= 0)), hi = boneIdx(skel, /Head$/), M = skel.boneInverses[hi], p = V();
  const dom = i => { let best = 0, bw = 0; for (let j = 0; j < 4; j++) { const w = sw.getComponent(i, j); if (w > bw) { bw = w; best = si.getComponent(i, j); } } return best; };
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = sz; const g = c.getContext('2d'); g.fillStyle = '#fff'; return g; };
  const T = mk(), Hd = mk(), E = mk();
  const tri = (g, a, b, c) => { g.beginPath(); g.moveTo(ua.getX(a) * sz, ua.getY(a) * sz); g.lineTo(ua.getX(b) * sz, ua.getY(b) * sz); g.lineTo(ua.getX(c) * sz, ua.getY(c) * sz); g.closePath(); g.fill(); };
  const eye = i => { p.fromBufferAttribute(pa, i).applyMatrix4(M); return p.y > 3.5 && p.y < 13.5 && Math.abs(p.x) < 9.5 && p.z > 3; };
  for (let t = 0; t < ix.count; t += 3) {
    const a = ix.getX(t), b = ix.getX(t + 1), c = ix.getX(t + 2), da = dom(a), db = dom(b), dc = dom(c);
    if (sp.has(da) && sp.has(db) && sp.has(dc)) tri(T, a, b, c);
    if (da === hi || db === hi || dc === hi) { tri(Hd, a, b, c); if (eye(a) && eye(b) && eye(c)) tri(E, a, b, c); }
  }
  const Eb = mk(); Eb.filter = 'blur(5px)'; Eb.drawImage(E.canvas, 0, 0);
  const r = { torso: T.getImageData(0, 0, sz, sz).data, head: Hd.getImageData(0, 0, sz, sz).data, eyes: Eb.getImageData(0, 0, sz, sz).data };
  TORSO.set(geo, r); return r;
}
export const masksOf = (geo, skel, sz) => masks(geo, skel, sz);   // (looks.js: the same masks, as a texture)
export function toneMaterial(src, tone, clothes = null, geo = null, skel = null) {
  const map = src.map; if (!map || !map.image || !map.image.width) return src;
  const im = map.image; if (!imgId.has(im)) imgId.set(im, ++imgN);
  const key = imgId.get(im) + ':' + tone + ':' + (clothes ? clothes.join(',') : '-');
  if (TONED.has(key)) return TONED.get(key);
  const sz = Math.min(im.width, 512), cv = document.createElement('canvas'); cv.width = cv.height = sz;
  const g2 = cv.getContext('2d', { willReadFrequently: true }); g2.drawImage(im, 0, 0, sz, sz);
  const D = g2.getImageData(0, 0, sz, sz), d = D.data;
  let mean = SKINMEAN.get(im);
  if (!mean) {
    let sr = 0, sg = 0, sb = 0, sn = 0;
    for (let p = 0; p < d.length; p += 4) { const [h, s, l] = hueSat(d[p], d[p + 1], d[p + 2]), w = skinW(h, s, l, d[p], d[p + 1], d[p + 2]); sr += d[p] * w; sg += d[p + 1] * w; sb += d[p + 2] * w; sn += w; }
    mean = sn ? [sr / sn, sg / sn, sb / sn] : [130, 90, 60]; SKINMEAN.set(im, mean);
  }
  const T = SKIN[tone] || SKIN.brown, f = [T[0] / mean[0], T[1] / mean[1], T[2] / mean[2]];
  const MK = geo && skel ? masks(geo, skel, sz) : null, mask = clothes && MK ? MK.torso : null, ml = (mean[0] * 0.299 + mean[1] * 0.587 + mean[2] * 0.114) * 0.92;
  const top = clothes && new THREE.Color(clothes[0]).getHex(), bot = clothes && new THREE.Color(clothes[1]).getHex();
  const tr = top >> 16 & 255, tg = top >> 8 & 255, tb = top & 255, br = bot >> 16 & 255, bg = bot >> 8 & 255, bb = bot & 255;
  for (let p = 0; p < d.length; p += 4) {
    const r = d[p], g = d[p + 1], b = d[p + 2], [hue, sat, lum, mx] = hueSat(r, g, b);
    // round the eyes the painting has a dull brown shadow where the sunglasses sat: it counts as skin (not the
    // lashes or brows) and is lifted back up to her skin's brightness
    const e = MK && lum < 200 ? MK.eyes[p + 3] / 255 * smooth(14, 30, lum) : 0, w = Math.max(skinW(hue, sat, lum, r, g, b), e);
    if (w > 0.01) {
      const lift = e > 0.01 ? 1 + (clamp(ml / Math.max(lum, 1), 1, 4) - 1) * e : 1, rr = r * lift, gg = g * lift, bb2 = b * lift;
      const sat2 = e > 0.01 ? (rr + gg + bb2) / 3 : 0;   // and its grey taken back toward the skin's own colour
      const r2 = rr + (sat2 * mean[0] / ml * 0.92 - rr) * e * 0.6, g2 = gg + (sat2 * mean[1] / ml * 0.92 - gg) * e * 0.6, b3 = bb2 + (sat2 * mean[2] / ml * 0.92 - bb2) * e * 0.6;
      d[p] = soft(r2 + (r2 * f[0] - r2) * w); d[p + 1] = soft(g2 + (g2 * f[1] - g2) * w); d[p + 2] = soft(b3 + (b3 * f[2] - b3) * w); continue;
    }
    if (!clothes || MK && MK.head[p + 3] > 128) continue;
    if (sat > 0.45 && hue > 0.1 && hue < 0.2 && mx > 110) { const k = clamp(lum / 185, 0.3, 1.25); d[p] = br * k; d[p + 1] = bg * k; d[p + 2] = bb * k; }
    else if (mask && mask[p + 3] > 128) {   // the top: grey and black fabric, its folds kept, the coloured trims left alone
      const ww = (1 - smooth(0.28, 0.42, sat)) * (1 - smooth(235, 250, lum)), k = clamp(lum / 120, 0.3, 1.6);
      d[p] += (tr * k - r) * ww; d[p + 1] += (tg * k - g) * ww; d[p + 2] += (tb * k - b) * ww;
    }
  }
  g2.putImageData(D, 0, 0);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = map.colorSpace; tex.flipY = map.flipY; tex.wrapS = map.wrapS; tex.wrapT = map.wrapT; tex.anisotropy = map.anisotropy;
  const m = src.clone(); m.map = tex;
  TONED.set(key, m); return m;
}
// the whole look for one woman (seed: who she is). clothes: false when the caller dyes the clothes itself (people.js).
export function styleFemale(s, seed = 0, { zombie = false, clothes = true, style = null, color = null, tone = null } = {}) {
  const body = bodyOf(s.root); if (!body) return null;
  if (!body.geometry.userData.hairClean) cleanFemale(s.kind && s.kind.root || s.root);
  const R = rng(seed * 7 + 11);
  const tn = tone || SKIN_PICK[Math.floor(R() * SKIN_PICK.length)];
  const cl = clothes ? [TOPS[Math.floor(R() * TOPS.length)], BOTTOMS[Math.floor(R() * BOTTOMS.length)]] : null;
  const src = body.userData.hairSrc || body.material; body.userData.hairSrc = src;
  body.material = toneMaterial(src, tn, cl, body.geometry, body.skeleton);
  s.isFemale = true; s.femaleLook = { tone: tn, clothes: cl };
  return addHair(s, seed, { zombie, style, color });
}
