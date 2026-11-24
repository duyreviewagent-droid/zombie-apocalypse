// Zombie_Apocalypse — everybody looks like themselves.
// There are only four bodies (three Ready Player Me men, Mixamo's Michelle), so a person's look is built on top of one:
// a skin tone, a hairstyle and its colour, a shirt, trousers and shoes each in their own colour, and now and then glasses,
// a cap or a beanie, a beard or a moustache, earrings — and a height and build of their own. A look is picked once per
// person from a seed (their key: 'p3', 'z17', 'who:Sam Carter'), and checked against every look already handed out: if
// it's too close to somebody else's (fewer than MIN_DIFF things different, or the same shirt AND trousers on the same
// body), it's thrown back and another picked. So nobody in town is anybody else's twin, living or dead.
//
// Cheap on purpose: no new textures per person. The clothes are re-dyed in the shader from the body's own texture (a
// per-person material clone sharing one program: uniforms only), skin by the material's colour (Michelle's by the same
// shader, from one baked base + one mask texture); hair, beards, hats and glasses are small rigid meshes on the head
// bone whose geometry is shared by everyone with that style and whose materials are shared by everyone with that
// colour. A person adds 0-3 draw calls, never a texture.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { KIND_ROOTS } from './soldier.js';
import * as HAIR from './hair.js';
import { C } from './state.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function rng(seed) {
  let a = (Math.imul((seed | 0) + 0x9e37, 2654435761) >>> 0) || 1;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const rgbOf = hex => [hex >> 16 & 255, hex >> 8 & 255, hex & 255];

// ---------------------------------------------------------------- the palettes (real people, real clothes)
export const TONES = [[246, 218, 198], [238, 202, 176], [228, 186, 152], [214, 168, 130], [198, 152, 112], [182, 132, 92], [160, 112, 74], [138, 94, 62], [114, 76, 50], [96, 63, 43], [80, 52, 36]];
export const HAIRC = [0x15110e, 0x241b15, 0x33241a, 0x4a3222, 0x5e3f28, 0x7a5638, 0x8f6c4a, 0x6e2e1a, 0x9a4a24, 0xa88a5e, 0xc8aa72, 0xdcd0b4, 0x8d8780, 0xbcb8b2, 0x55504c];
const HAIRC_W = [6, 5, 7, 5, 6, 3, 3, 2, 2, 3, 3, 1, 3, 2, 2];
export const TOPS = [0x2c3e64, 0x6a2430, 0x55603a, 0xd6d2c6, 0x6e6e6e, 0x8a5a30, 0x2f6a78, 0xa8884e, 0x46344e, 0x9a3a2a, 0x1e1e22, 0x4f7a4a, 0x7d9cc0, 0xe8e6e0, 0x4a5a78, 0x7a1f2b, 0xb8a888, 0x3d5a80, 0xc08a8a, 0x8c7fa8, 0xb4602a, 0x7fae96, 0x2e4a3a, 0xa83232, 0x3a3a48, 0xc9b23a];
export const BOTTOMS = [0x34496e, 0x1f2a44, 0x232323, 0x8a7a55, 0x55603a, 0x4a4a4e, 0x9a9a98, 0x4a3a2a, 0x2a2f45, 0x6a86a8, 0xb8a888, 0x5a2a2a, 0x2e4030, 0x6a5a48];
export const SHOES = [0x1a1a1a, 0x3a2618, 0x7a5232, 0xe6e4de, 0x6a6a6a, 0x2a3450, 0x8a2a24, 0x4a4a32, 0xb09a78];
const HATC = [0x1e1e22, 0x2c3e64, 0x8a2a24, 0x55603a, 0xb8a888, 0x6e6e6e, 0xb4602a, 0x2f6a78, 0xd6d2c6];
const GLASSC = [0x111111, 0x3a2418, 0x8a8a90, 0xb89a50, 0x5a2a2a];
const M_HAIR = ['bald', 'balding', 'buzz', 'crop', 'curly', 'swept', 'side'], M_HAIR_W = [2, 3, 4, 5, 3, 4, 4];
const F_HAIR = HAIR.STYLES;   // shoulder, long, ponytail, bun, bob, curly, braid, longFringe
const HATS = ['none', 'cap', 'beanie', 'cowboy'], HATS_W = [14, 3, 2, 1.5];
const GLASSES = ['none', 'round', 'square', 'sun'], GLASSES_W = [13, 2.5, 2.5, 1.5];
const FACIAL = ['none', 'stubble', 'moustache', 'goatee', 'beard', 'full'], FACIAL_W = [9, 3, 2, 2, 3, 2];
const EARS = ['none', 'gold', 'silver'], EARS_W = [6, 3, 2];
const pickW = (R, a, w) => { let s = 0; for (const x of w) s += x; let r = R() * s; for (let i = 0; i < a.length; i++) { r -= w[i]; if (r <= 0) return a[i]; } return a[a.length - 1]; };
const pickI = (R, n) => Math.floor(R() * n);

// ---------------------------------------------------------------- picking a look nobody else has
export const MIN_DIFF = 4;
const ISSUED = [];           // every look handed out this session (people, the dead, you)
const BYKEY = new Map();
const FEAT = ['body', 'tone', 'hair', 'hairCol', 'top', 'bot', 'shoe', 'hat', 'glasses', 'facial', 'ears'];
export function lookDiff(a, b) {
  let d = 0;
  for (const f of FEAT) {
    if (f === 'tone') { if (Math.abs(a.tone - b.tone) >= 2) d++; }
    else if (a[f] !== b[f]) d++;
  }
  return d;
}
function roll(R, body) {
  const fem = body === 'michelle';
  const L = { body, fem, tone: pickI(R, TONES.length), hairCol: pickW(R, HAIRC.map((_, i) => i), HAIRC_W), top: pickI(R, TOPS.length), bot: pickI(R, BOTTOMS.length), shoe: fem ? -1 : pickI(R, SHOES.length) };
  L.hair = fem ? F_HAIR[pickI(R, F_HAIR.length)] : pickW(R, M_HAIR, M_HAIR_W);
  L.hat = fem ? 'none' : pickW(R, HATS, HATS_W);
  if (L.hat === 'cowboy' && L.hair === 'curly') L.hat = 'none';
  L.glasses = pickW(R, GLASSES, GLASSES_W);
  L.facial = fem ? 'none' : pickW(R, FACIAL, FACIAL_W);
  L.ears = fem ? pickW(R, EARS, EARS_W) : 'none';
  L.hatCol = pickI(R, HATC.length); L.glassCol = pickI(R, GLASSC.length);
  if (L.top === L.bot && TOPS[L.top] === BOTTOMS[L.bot]) L.bot = (L.bot + 3) % BOTTOMS.length;
  // a little taller or shorter, a little broader or slighter (the dead get their own size in zombies.wake)
  L.h = 0.95 + R() * 0.1; L.w = L.h * (0.97 + R() * 0.09); L.d = 0.98 + R() * 0.06;
  L.zs = 0.92 + R() * 0.15;
  return L;
}
// the look for one person (the same key always gets the same look back)
export function lookFor(key, body) {
  const had = BYKEY.get(key); if (had && had.body === body) return had;
  const R = rng(hashStr(key));
  let best = null, bestD = -1;
  for (let t = 0; t < 400; t++) {
    const L = roll(R, body);
    let md = 99;
    for (const o of ISSUED) {
      const d = lookDiff(L, o);
      if (d < md) md = d;
      if (o.body === L.body && o.top === L.top && o.bot === L.bot) md = Math.min(md, MIN_DIFF - 1);   // never the same outfit on the same body
      if (md < bestD) break;
    }
    if (md > bestD) { best = L; bestD = md; }
    if (md >= MIN_DIFF) break;
  }
  best.key = key; best.sig = sigOf(best);
  ISSUED.push(best); BYKEY.set(key, best);
  return best;
}
export const sigOf = L => [L.body, L.tone, L.hair, L.hairCol, L.top, L.bot, L.shoe, L.hat + L.hatCol, L.glasses + L.glassCol, L.facial, L.ears].join('|');
export const issued = () => ISSUED;

// ---------------------------------------------------------------- the dye, in the shader
// mode 1: a Ready Player Me outfit piece (all of it is fabric; whites and light trims survive) — lkA is the colour
// mode 0: Michelle's one atlas — skin (by its colour) scaled to lkSkin, the yellow trousers to lkB, the black top
//         (by colour AND by where it sits, from lkMask: r = torso, g = head) to lkA
// Worked in display (sRGB-ish) values like the CPU dye it replaces; the texture arrives linear.
const GLSL_HSV = `
  vec4 lkHsl(vec3 s){ float mx = max(s.r, max(s.g, s.b)), mn = min(s.r, min(s.g, s.b)), dl = mx - mn, sat = mx > 0.0 ? dl / mx : 0.0, hue = 0.0;
    if (dl > 0.0) { if (mx == s.r) hue = mod((s.g - s.b) / dl + 6.0, 6.0); else if (mx == s.g) hue = (s.b - s.r) / dl + 2.0; else hue = (s.r - s.g) / dl + 4.0; hue /= 6.0; }
    return vec4(hue, sat, dot(s, vec3(0.299, 0.587, 0.114)), mx); }`;
const GLSL = {
  1: `uniform vec3 lkA;${GLSL_HSV}
  vec3 lkDye(vec3 c, vec2 uv){
    vec3 s = pow(max(c, 0.0), vec3(1.0 / 2.2)) * 255.0; vec4 h = lkHsl(s);
    float k = 0.5 + 0.5 * clamp(h.z / 80.0, 0.0, 1.9), keep = smoothstep(150.0, 205.0, h.z) * (1.0 - h.y), w = 0.85 * (1.0 - keep);
    return pow(mix(s, lkA * 255.0 * k, w) / 255.0, vec3(2.2)); }`,
  0: `uniform vec3 lkA, lkB, lkSkin; uniform sampler2D lkMask;${GLSL_HSV}
  vec3 lkDye(vec3 c, vec2 uv){
    vec3 s = pow(max(c, 0.0), vec3(1.0 / 2.2)) * 255.0; vec4 h = lkHsl(s); vec4 M = texture2D(lkMask, uv);
    float sw = step(s.g, s.r + 0.5) * step(s.b, s.g + 0.5) * smoothstep(0.0, 0.02, h.x) * (1.0 - smoothstep(0.095, 0.125, h.x)) * smoothstep(0.14, 0.24, h.y) * (1.0 - smoothstep(0.7, 0.8, h.y)) * smoothstep(28.0, 48.0, h.z);
    vec3 o = s;
    if (sw > 0.01) o = mix(s, s * lkSkin, sw);
    else if (M.g < 0.5) {
      float tw = smoothstep(0.4, 0.5, h.y) * smoothstep(0.09, 0.11, h.x) * (1.0 - smoothstep(0.19, 0.21, h.x)) * smoothstep(100.0, 115.0, h.w);
      o = mix(o, lkB * 255.0 * clamp(h.z / 185.0, 0.3, 1.25), tw);
      float ww = (1.0 - smoothstep(0.28, 0.42, h.y)) * (1.0 - smoothstep(235.0, 250.0, h.z)) * smoothstep(0.3, 0.7, M.r) * (1.0 - tw);
      o = mix(o, lkA * 255.0 * clamp(h.z / 120.0, 0.3, 1.6), ww);
    }
    return pow(clamp(o, 0.0, 255.0) / 255.0, vec3(2.2)); }`,
};
const LKU = new WeakMap();   // material -> { U, mode }
// zombies.js asks: does this material carry a look dye? (its dead version has to dye the same way first)
export function lkOf(m) { const r = m && LKU.get(m); return r ? { U: r.U, decl: GLSL[r.mode], key: '-lk' + r.mode } : null; }
const v3 = hex => { const [r, g, b] = rgbOf(hex); return new THREE.Vector3(r / 255, g / 255, b / 255); };
function dyeMat(src, mode, U) {
  const m = src.clone();
  LKU.set(m, { U, mode });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + GLSL[mode])
      .replace('#include <map_fragment>', `#ifdef USE_MAP
        vec4 sampledDiffuseColor = texture2D( map, vMapUv );
        sampledDiffuseColor.rgb = lkDye( sampledDiffuseColor.rgb, vMapUv );
        diffuseColor *= sampledDiffuseColor;
      #endif`);
  };
  m.customProgramCacheKey = () => 'look-dye-' + mode;
  return m;
}

// ---------------------------------------------------------------- what each body is made of (measured once)
const KINFO = new Map();
const KIND_NAMES = ['human', 'butler', 'coach', 'michelle'];
export const kindName = root => { const i = KIND_ROOTS.indexOf(root); return KIND_NAMES[i] || (root.userData.female ? 'michelle' : 'human'); };
const isRPM = root => { let r = false; root.traverse(o => { if (/Wolf3D_Head/.test(o.name)) r = true; }); return r; };
const skinMeanOf = new WeakMap();
function meanSkin(map) {   // the average skin colour painted in a texture (sRGB bytes)
  const im = map && map.image; if (!im || !im.width) return [200, 150, 120];
  if (skinMeanOf.has(im)) return skinMeanOf.get(im);
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0, 64, 64);
  const d = g.getImageData(0, 0, 64, 64).data; let r = 0, gg = 0, b = 0, n = 0;
  for (let p = 0; p < d.length; p += 4) { if (d[p] > d[p + 1] && d[p + 1] > d[p + 2] && d[p] > 60 && d[p] - d[p + 2] > 20) { r += d[p]; gg += d[p + 1]; b += d[p + 2]; n++; } }
  const m = n ? [r / n, gg / n, b / n] : [200, 150, 120]; skinMeanOf.set(im, m); return m;
}
// a vertex of a skinned mesh, in its head bone's own space (where anything parented to the head bone lives)
function headSpace(mesh, hi) {
  const sk = mesh.skeleton, M = sk.boneInverses[hi].clone().multiply(mesh.bindMatrix);
  return M;
}
function domHead(geo, i, heads) { const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight; let w = 0; for (let j = 0; j < 4; j++) if (heads.has(si.getComponent(i, j))) w += sw.getComponent(i, j); return w; }
function kinfo(root) {
  if (KINFO.has(root)) return KINFO.get(root);
  const K = { root, rpm: isRPM(root), mat0: new Map(), name: kindName(root) };
  root.traverse(o => { if (o.isMesh && !o.userData.lkAcc) K.mat0.set(o.name, o.material); });
  // the head: the RPM head mesh, or the head of Michelle's one mesh
  let hm = null; root.traverse(o => { if (!hm && o.isSkinnedMesh && (K.rpm ? /Wolf3D_Head/.test(o.name) : !o.userData.hair)) hm = o; });
  const sk = hm.skeleton, hi = sk.bones.findIndex(b => /Head$/.test(b.name)), ti = sk.bones.findIndex(b => /HeadTop_End$/.test(b.name));
  const heads = new Set([hi, ti]), M = headSpace(hm, hi), geo = hm.geometry, pa = geo.attributes.position, na = geo.attributes.normal;
  const NM = new THREE.Matrix3().getNormalMatrix(M);
  const used = new Uint8Array(pa.count); if (geo.index) for (let t = 0; t < geo.index.count; t++) used[geo.index.getX(t)] = 1; else used.fill(1);
  const P = [], N = [], ok = new Uint8Array(pa.count);
  let y0 = 1e9, y1 = -1e9;
  for (let i = 0; i < pa.count; i++) {
    const p = V().fromBufferAttribute(pa, i).applyMatrix4(M); P.push(p); N.push(na ? V().fromBufferAttribute(na, i).applyMatrix3(NM).normalize() : V(0, 1, 0));
    if (!used[i] || domHead(geo, i, heads) < 0.6) continue;
    ok[i] = 1; y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  }
  // the eyes, from the eye bones
  const eyeOf = re => { const j = sk.bones.findIndex(b => re.test(b.name)); if (j < 0) return null; return V().applyMatrix4(sk.boneInverses[j].clone().invert()).applyMatrix4(sk.boneInverses[hi]); };
  let eL = eyeOf(/LeftEye$/), eR = eyeOf(/RightEye$/);
  const H = y1 - y0;
  if (!eL || !eR || Math.abs(eL.x - eR.x) < H * 0.05) { eL = V(H * 0.14, y0 + H * 0.56, 0); eR = V(-H * 0.14, y0 + H * 0.56, 0); }
  const eye = eL.clone().add(eR).multiplyScalar(0.5), eyeX = Math.abs(eL.x - eR.x) / 2;
  // which way is the face? (+z in both rigs, but measure it)
  let zf = -1e9, zb = 1e9, rx = 0, sx = 0, chin = 1e9;
  for (let i = 0; i < P.length; i++) { if (!ok[i]) continue; const p = P[i]; if (p.y > eye.y + H * 0.05) { zf = Math.max(zf, p.z); zb = Math.min(zb, p.z); sx = Math.max(sx, Math.abs(p.x)); } rx = Math.max(rx, Math.abs(p.x)); }
  const cz = (zf + zb) / 2;
  for (let i = 0; i < P.length; i++) { if (!ok[i]) continue; const p = P[i]; if (p.z > cz + (zf - cz) * 0.3 && Math.abs(p.x) < eyeX * 0.8) chin = Math.min(chin, p.y); }
  const top = y1, Hh = top - chin, d = eye.y - chin;
  const F = { hm, hi, P, N, ok, geo, eye, eyeX, eyeZ: eye.z, top, chin, Hh, d, cz, zf, zb, sx, sz: (zf - zb) / 2, rx, noseY: eye.y - 0.42 * d, mouthY: eye.y - 0.66 * d };
  // the widest the head reaches at a height (the ears), and where
  // the nose and the mouth, from the face's own profile down the middle: the nose tip sticks out furthest below the
  // eyes; under it the face dips in, then the upper lip comes out again
  { const NB = 40, zs = new Float32Array(NB).fill(-1e9), y0b = chin, y1b = eye.y - 0.1 * d, bw = (y1b - y0b) / NB;
    for (let i = 0; i < P.length; i++) { if (!ok[i]) continue; const p = P[i]; if (Math.abs(p.x) > eyeX * 0.25 || p.y < y0b || p.y >= y1b) continue; const k = Math.floor((p.y - y0b) / bw); zs[k] = Math.max(zs[k], p.z); }
    for (let k = 1; k < NB; k++) if (zs[k] < -1e8) zs[k] = zs[k - 1];
    let nk = NB - 1; for (let k = NB - 1; k > NB * 0.3; k--) if (zs[k] > zs[nk]) nk = k;
    let dip = nk; for (let k = nk - 1; k > 2 && k > nk - NB * 0.4; k--) { if (zs[k] < zs[dip]) dip = k; else if (zs[k] > zs[dip] + bw * 0.6) break; }
    let lip = dip; for (let k = dip - 1; k > 1 && k > dip - NB * 0.25; k--) { if (zs[k] > zs[lip]) lip = k; else if (zs[k] < zs[lip] - bw * 0.6) break; }
    const yAt = k => y0b + (k + 0.5) * bw, nY = yAt(nk) - bw, mY = yAt(lip) - bw * 1.5;
    if (nk > dip && dip > lip && nY - mY > 0.12 * d && nY - mY < 0.45 * d) { F.noseY = nY; F.mouthY = mY; } }
  F.widthAt = (y, band) => { let best = null; for (let i = 0; i < P.length; i++) { if (!ok[i]) continue; const p = P[i]; if (Math.abs(p.y - y) < band && p.z < F.eyeZ && (!best || Math.abs(p.x) > Math.abs(best.x))) best = p; } return best ? best.clone() : V(rx, y, cz); };
  F.frontAt = (y, band) => { let z = -1e9; for (let i = 0; i < P.length; i++) { if (!ok[i]) continue; const p = P[i]; if (Math.abs(p.y - y) < band && Math.abs(p.x) < eyeX * 0.35) z = Math.max(z, p.z); } return z > -1e8 ? z : zf; };
  K.F = F;
  KINFO.set(root, K);
  return K;
}

// ---------------------------------------------------------------- hair and beards: shells grown off the head itself
// The scalp (or the jaw) of this very head, picked out by a hairline, pushed out along its normals by the style's
// thickness: it fits every head it's made for. Rigid on the head bone (the head bone carries all of it anyway).
const noise3 = (x, y, z) => { const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return s - Math.floor(s); };
const vnoise = (x, y, z) => {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz, sf = t => t * t * (3 - 2 * t);
  const L = (a, b, t) => a + (b - a) * t, n = (a, b, c) => noise3(ix + a, iy + b, iz + c);
  return L(L(L(n(0, 0, 0), n(1, 0, 0), sf(fx)), L(n(0, 1, 0), n(1, 1, 0), sf(fx)), sf(fy)), L(L(n(0, 0, 1), n(1, 0, 1), sf(fx)), L(n(0, 1, 1), n(1, 1, 1), sf(fx)), sf(fy)), sf(fz));
};
function shell(F, keep, off) {
  const ix = F.geo.index, map = new Map(), pos = [], nor = [], uv = [], idx = [];
  const at = i => {
    if (map.has(i)) return map.get(i);
    const p = F.P[i], n = F.N[i], o = off(p, n), k = pos.length / 3;
    pos.push(p.x + n.x * o, p.y + n.y * o, p.z + n.z * o); nor.push(n.x, n.y, n.z);
    uv.push(Math.atan2(p.x, p.z - F.cz) / Math.PI * 2, (p.y - F.chin) / F.Hh * 3);
    map.set(i, k); return k;
  };
  const n = ix ? ix.count : F.P.length;
  for (let t = 0; t < n; t += 3) {
    const a = ix ? ix.getX(t) : t, b = ix ? ix.getX(t + 1) : t + 1, c = ix ? ix.getX(t + 2) : t + 2;
    if (!F.ok[a] || !F.ok[b] || !F.ok[c]) continue;
    const m = F.P[a].clone().add(F.P[b]).add(F.P[c]).multiplyScalar(1 / 3);
    if (!keep(m)) continue;
    idx.push(at(a), at(b), at(c));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
const bear = (F, p) => Math.abs(Math.atan2(p.x, p.z - F.cz)) / Math.PI;   // 0 the face .. 1 straight behind
function hairline(F, p) {
  const b = bear(F, p), H = F.Hh;
  const y = b < 0.5 ? 0.80 - 0.18 * smooth(0.12, 0.5, b) : 0.62 - 0.34 * smooth(0.5, 0.92, b);
  if (Math.abs(p.x) > F.sx * 0.92 && p.y < F.eye.y + 0.12 * H && b > 0.3 && b < 0.7) return false;   // the ears
  return p.y > F.chin + y * H;
}
function hairGeo(F, style) {
  const H = F.Hh;
  switch (style) {
    case 'buzz': return shell(F, p => hairline(F, p), () => 0.008 * H);
    case 'crop': return shell(F, p => hairline(F, p), p => 0.012 * H + 0.04 * H * smooth(0.72, 1.0, (p.y - F.chin) / H));
    case 'balding': return shell(F, p => hairline(F, p) && bear(F, p) > 0.4 && p.y < F.chin + 0.88 * H, () => 0.01 * H);
    case 'curly': { const g = shell(F, p => hairline(F, p), p => 0.03 * H + 0.06 * H * smooth(0.6, 1.0, (p.y - F.chin) / H) + 0.025 * H * vnoise(p.x / H * 14, p.y / H * 14, p.z / H * 14)); g.computeVertexNormals(); return g; }   // [chars] shaded as the curls really sit
  }
  return null;
}
function facialGeo(F, style) {
  const H = F.Hh, d = F.d;
  const lips = p => bear(F, p) < 0.14 && Math.abs(p.y - F.mouthY) < 0.07 * d;
  // the beard's reach: up to the cheekbones (sideburns up to the ears), down under the jaw
  const top = b => F.noseY - 0.05 * d - 0.22 * d * smooth(0.14, 0.3, b) + 0.5 * d * smooth(0.36, 0.47, b);
  const bot = b => F.chin - 0.35 * d + 0.95 * d * smooth(0.3, 0.5, b);
  const jaw = p => { const b = bear(F, p); return b < 0.5 && p.y < top(b) && p.y > bot(b); };
  const must = () => true;
  switch (style) {
    case 'stubble': return shell(F, p => jaw(p) && must(p) && !lips(p), () => 0.007 * H);
    case 'full': return shell(F, p => jaw(p) && must(p) && !lips(p), p => 0.012 * H + 0.03 * H * smooth(F.mouthY, F.chin - 0.2 * d, p.y));
    case 'beard': return shell(F, p => jaw(p) && must(p) && !lips(p) && (p.y < F.mouthY + 0.12 * d || bear(F, p) > 0.3 || bear(F, p) < 0.1), () => 0.013 * H);
    case 'goatee': return shell(F, p => bear(F, p) < 0.13 && p.y > F.chin - 0.15 * d && p.y < F.noseY - 0.04 * d && !lips(p) && (p.y < F.mouthY - 0.05 * d || p.y > F.mouthY + 0.06 * d), () => 0.014 * H);
    case 'moustache': return shell(F, p => bear(F, p) < 0.15 && p.y > F.mouthY + 0.06 * d && p.y < F.noseY - 0.03 * d, () => 0.016 * H);
  }
  return null;
}
// a donor's mesh (another body's own hair, beard or cowboy hat) moved into its head bone's space, made rigid
const DONOR = new Map();
function donor(re, nth = 0) {
  const k = re.source + nth; if (DONOR.has(k)) return DONOR.get(k);
  let found = null, froot = null, n = 0;
  for (const root of KIND_ROOTS) {
    if (!isRPM(root)) continue;
    root.traverse(o => { if (!found && o.isMesh && re.test(o.name)) { if (n++ === nth) found = o; } });
    if (found) { froot = root; break; }
  }
  let r = null;
  if (found) {
    let M;
    if (found.isSkinnedMesh) { const sk = found.skeleton, hi = sk.bones.findIndex(b => /Head$/.test(b.name)); M = headSpace(found, hi); }
    else { const root = froot; let hb = null; root.traverse(o => { if (!hb && o.isBone && /Head$/.test(o.name)) hb = o; }); root.updateMatrixWorld(true); M = hb.matrixWorld.clone().invert().multiply(found.matrixWorld); }
    const g = new THREE.BufferGeometry(), src = found.geometry;
    g.setAttribute('position', src.attributes.position.clone()); if (src.attributes.normal) g.setAttribute('normal', src.attributes.normal.clone()); if (src.attributes.uv) g.setAttribute('uv', src.attributes.uv.clone());
    if (src.index) g.setIndex(src.index.clone());
    g.applyMatrix4(M);
    r = { geo: g, mat: found.material };
  }
  DONOR.set(k, r); return r;
}
// a hair texture with its colour taken out (brightness kept, mean lifted to mid-grey): the colour goes on as .color
const GREY = new WeakMap();
function greyMap(map) {
  if (!map || !map.image || !map.image.width) return null;
  if (GREY.has(map)) return GREY.get(map);
  const im = map.image, sz = Math.min(256, im.width), cv = document.createElement('canvas'); cv.width = cv.height = sz;
  const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0, sz, sz);
  const D = g.getImageData(0, 0, sz, sz), d = D.data; let s = 0, n = 0;
  for (let p = 0; p < d.length; p += 4) { const l = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2]; d[p] = l; if (d[p + 3] > 128) { s += l; n++; } }
  const k = 200 / Math.max(20, n ? s / n : 128);
  for (let p = 0; p < d.length; p += 4) { const v = Math.min(255, d[p] * k); d[p] = d[p + 1] = d[p + 2] = v; }
  g.putImageData(D, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = map.colorSpace; t.flipY = map.flipY; t.wrapS = map.wrapS; t.wrapT = map.wrapT;
  GREY.set(map, t); return t;
}
// a strand-ish noise texture for the shells (light grey, so the colour carries)
let STRANDS = null;
function strands() {
  if (STRANDS) return STRANDS;
  const sz = 128, cv = document.createElement('canvas'); cv.width = cv.height = sz; const g = cv.getContext('2d'), D = g.createImageData(sz, sz), d = D.data;
  for (let y = 0; y < sz; y++) for (let x = 0; x < sz; x++) {
    const v = 0.55 * vnoise(x * 0.9, y * 0.06, 1) + 0.3 * vnoise(x * 0.35, y * 0.03, 7) + 0.15 * noise3(x, y, 3);
    const l = 165 + v * 90, p = (y * sz + x) * 4; d[p] = d[p + 1] = d[p + 2] = l; d[p + 3] = 255;
  }
  g.putImageData(D, 0, 0);
  STRANDS = new THREE.CanvasTexture(cv); STRANDS.wrapS = STRANDS.wrapT = THREE.RepeatWrapping; STRANDS.colorSpace = THREE.SRGBColorSpace;
  return STRANDS;
}
const MATS = new Map();
const tintFor = (hex, base = 0.62) => { const [r, g, b] = rgbOf(hex); return new THREE.Color().setRGB(lin(r) / base, lin(g) / base, lin(b) / base); };
function shellMat(hex) {
  const k = 'shell:' + hex; if (MATS.has(k)) return MATS.get(k);
  const m = new THREE.MeshStandardMaterial({ map: strands(), roughness: 0.82, metalness: 0 });
  if (!C.mobile) { m.bumpMap = strands(); m.bumpScale = 0.6; }   // [chars] the strands catch the light, not a painted cap
  m.color.copy(tintFor(hex)); m.name = 'LookHair'; MATS.set(k, m); return m;
}
function donorMat(d, hex, grey = true) {
  const k = 'donor:' + d.mat.uuid + ':' + hex; if (MATS.has(k)) return MATS.get(k);
  const m = d.mat.clone(); m.name = 'Look' + (d.mat.name || '');
  if (grey && d.mat.map) { m.map = greyMap(d.mat.map); m.color.copy(tintFor(hex, lin(200))); }
  else { const [r, g, b] = rgbOf(hex); const mm = d.mat.map ? meanSkin(d.mat.map) : [128, 128, 128]; m.color.setRGB(lin(r) / Math.max(0.02, lin(mm[0])), lin(g) / Math.max(0.02, lin(mm[1])), lin(b) / Math.max(0.02, lin(mm[2]))); }
  MATS.set(k, m); return m;
}
function plainMat(hex, rough = 0.7, metal = 0, name = 'Look') {
  const k = 'plain:' + hex + ':' + rough + ':' + metal; if (MATS.has(k)) return MATS.get(k);
  const m = new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal }); m.name = name; MATS.set(k, m); return m;
}

// ---------------------------------------------------------------- skin and eyes  [chars]
// Skin isn't matte paint: light goes in, scatters and comes back out warmer (reddest where the light falls off — the
// terminator, the shadow side of a nose or an ear), it has fine pores, and a slight oily sheen. One shared program for
// every skin (a per-person clone only carries its colour); the pore texture is one 256px normal map, desktop only.
let PORES = null;
function poreTex() {
  if (PORES) return PORES;
  const sz = 256, h = new Float32Array(sz * sz), R = rng(7331);
  for (let i = 0; i < sz * sz; i++) h[i] = 0.5 + (R() - 0.5) * 0.12;
  for (let n = 0; n < 2600; n++) {   // pores: little pits
    const cx = R() * sz, cy = R() * sz, r = 0.8 + R() * 1.4, d = 0.35 + R() * 0.5;
    for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
      const q = Math.hypot(x - cx, y - cy) / r; if (q >= 1) continue; const i = ((y + sz) % sz) * sz + (x + sz) % sz; h[i] -= d * (1 - q * q);
    }
  }
  for (let n = 0; n < 140; n++) {   // fine creases
    let x = R() * sz, y = R() * sz; const a = R() * Math.PI, L = 10 + R() * 30, dx = Math.cos(a), dy = Math.sin(a) * 0.35;
    for (let t = 0; t < L; t++) { const i = ((Math.floor(y) + sz) % sz) * sz + (Math.floor(x) + sz) % sz; h[i] -= 0.25; x += dx; y += dy; }
  }
  const cv = document.createElement('canvas'); cv.width = cv.height = sz; const g = cv.getContext('2d'), D = g.createImageData(sz, sz), d = D.data;
  const H = (x, y) => h[((y + sz) % sz) * sz + (x + sz) % sz];
  for (let y = 0; y < sz; y++) for (let x = 0; x < sz; x++) {
    const nx = (H(x - 1, y) - H(x + 1, y)) * 1.6, ny = (H(x, y - 1) - H(x, y + 1)) * 1.6, l = Math.hypot(nx, ny, 1), p = (y * sz + x) * 4;
    d[p] = (nx / l * 0.5 + 0.5) * 255; d[p + 1] = (ny / l * 0.5 + 0.5) * 255; d[p + 2] = (1 / l * 0.5 + 0.5) * 255; d[p + 3] = 255;
  }
  g.putImageData(D, 0, 0);
  PORES = new THREE.CanvasTexture(cv); PORES.wrapS = PORES.wrapT = THREE.RepeatWrapping; PORES.colorSpace = THREE.NoColorSpace; PORES.repeat.set(14, 14);
  return PORES;
}
const SKIN_GLSL = `{ float sl = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
    float sw = smoothstep(0.004, 0.05, sl) * (1.0 - smoothstep(0.1, 0.5, sl));
    outgoingLight *= mix(vec3(1.0), vec3(1.16, 0.95, 0.86), sw * 0.75); }
  #include <opaque_fragment>`;
function skinUp(m, face) {
  m.roughness = face ? 0.6 : 0.66;
  if (face && !C.mobile && !m.normalMap) { m.normalMap = poreTex(); m.normalScale.set(0.32, 0.32); }
  m.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', SKIN_GLSL); };
  m.customProgramCacheKey = () => 'skin-sss' + (m.normalMap ? 'n' : '');
  m.userData.skinSSS = true;
}
function wetMat(src, rough) {
  const k = 'wet:' + src.uuid; if (MATS.has(k)) return MATS.get(k);
  const m = src.clone(); m.roughness = rough; m.metalness = 0; if ('envMapIntensity' in m) m.envMapIntensity = 1.2;
  MATS.set(k, m); return m;
}

// ---------------------------------------------------------------- hats and glasses
function skullGeo(F, scl, baseY, topK = 1.06) {
  const g = new THREE.SphereGeometry(1, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(F.sx * scl, (F.top - baseY) * topK, F.sz * scl); g.translate(0, baseY, F.cz - F.sz * 0.03);
  return g;
}
function hatGeo(F, kind, over) {
  const H = F.Hh, s = over ? 1.13 : 1.07;
  if (kind === 'cap') {
    const base = F.eye.y + 0.32 * F.d, dome = skullGeo(F, s, base);
    const brim = new THREE.CylinderGeometry(1, 1, 0.012 * H, 18, 1, false, -Math.PI / 2, Math.PI);
    brim.scale(F.sx * s * 0.9, 1, F.sz * 0.75); brim.rotateX(0.12); brim.translate(0, base + 0.01 * H, F.cz + F.sz * s * 0.55);
    const btn = new THREE.SphereGeometry(0.018 * H, 6, 4); btn.translate(0, F.top + (F.top - base) * 0.06, F.cz);
    return mergeGeometries([dome, brim, btn].map(g => g.toNonIndexed()));
  }
  if (kind === 'beanie') {
    const base = F.eye.y + 0.2 * F.d, dome = skullGeo(F, s + 0.03, base, 1.16);
    const band = new THREE.TorusGeometry(1, 0.045, 6, 24); band.rotateX(Math.PI / 2); band.scale(F.sx * (s + 0.05), H * 1.0, F.sz * (s + 0.05)); band.translate(0, base + 0.03 * H, F.cz - F.sz * 0.03);
    return mergeGeometries([dome, band].map(g => g.toNonIndexed()));
  }
  return null;
}
function glassesGeo(F, kind, ears) {
  const parts = [], r = F.eyeX * 0.72, t = r * 0.09, z = F.eyeZ + F.eyeX * 0.62, y = F.eye.y;
  if (kind !== 'none') {
    for (const sx of [-1, 1]) {
      const ring = new THREE.TorusGeometry(r, t, 5, kind === 'square' ? 4 : 20);
      if (kind === 'square') { ring.rotateZ(Math.PI / 4); ring.scale(1.12, 0.82, 1); }
      ring.translate(sx * F.eyeX, y, z); parts.push(ring);
      if (kind === 'sun') { const lens = new THREE.CircleGeometry(r * 0.98, 18); lens.translate(sx * F.eyeX, y, z - t * 0.2); const back = lens.clone().rotateY(Math.PI); back.translate(2 * sx * F.eyeX, 0, 2 * (z - t * 0.2)); parts.push(lens, back); }
      // the arm back to the ear
      const ear = F.widthAt(y, F.d * 0.12), x0 = sx * (F.eyeX + r * 1.05), x1 = sx * (Math.abs(ear.x) + t * 1.5), z1 = Math.min(ear.z, F.cz);
      const len = Math.hypot(x1 - x0, z1 - z), arm = new THREE.BoxGeometry(t * 1.4, t * 2.2, len);
      arm.rotateY(Math.atan2(x1 - x0, z1 - z)); arm.translate((x0 + x1) / 2, y + r * 0.25, (z + z1) / 2); parts.push(arm);
    }
    const br = new THREE.CylinderGeometry(t * 0.8, t * 0.8, Math.max(0.001, 2 * (F.eyeX - r)) + t * 2, 5); br.rotateZ(Math.PI / 2); br.translate(0, y + r * 0.3, z + t); parts.push(br);
  }
  if (ears && ears !== 'none') {
    for (const sx of [-1, 1]) {
      const lobe = F.widthAt(F.noseY - 0.05 * F.d, F.d * 0.1), e = new THREE.SphereGeometry(F.Hh * 0.016, 8, 6);
      e.translate(sx * (Math.abs(lobe.x) + F.Hh * 0.004), lobe.y - F.Hh * 0.03, lobe.z); parts.push(e);
    }
  }
  if (!parts.length) return null;
  return mergeGeometries(parts.map(g => (g.index ? g.toNonIndexed() : g)).map(g => { for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(n)) g.deleteAttribute(n); return g; }));
}
const GEO = new Map();
const geoFor = (K, key, make) => { const k = K.name + ':' + key; if (!GEO.has(k)) GEO.set(k, make()); return GEO.get(k); };

// ---------------------------------------------------------------- putting a look on a body
function clearLook(s) {
  const dead = []; s.root.traverse(o => { if (o.userData.lkAcc) dead.push(o); });
  for (const o of dead) o.removeFromParent();
}
function accMesh(s, geo, mat, name, slot, shadow = true) {
  if (!geo) return null;
  const m = new THREE.Mesh(geo, mat); m.name = name; m.userData.lkAcc = true; m.userData.lkSlot = slot;
  m.castShadow = shadow && !C.mobile; m.receiveShadow = true; if (!m.castShadow) m.userData.noShadow = true;   // (soldier.js's shadow LOD leaves it off)
  s.B.Head.add(m); return m;
}
// L: from lookFor. Returns [[mesh, material, visible]...] (what people.js puts back after a body's been borrowed).
export function applyLook(s, L, { zombie = false } = {}) {
  const K = kinfo(s.kind.root), F = K.F;
  clearLook(s);
  s.lookL = L; s.lookU = [];
  const hairHex = HAIRC[L.hairCol];
  if (K.rpm) {
    const tone = TONES[L.tone];
    s.root.traverse(o => {
      if (!o.isMesh || o.userData.lkAcc) return;
      const m0 = K.mat0.get(o.name) || o.material, n = o.name + ' ' + m0.name;
      o.material = m0; o.visible = true;
      if (/Wolf3D_Head|Wolf3D_Body/.test(n) && m0.map) {   // skin: the painted skin scaled to this person's tone
        const mean = meanSkin(m0.map), m = m0.clone(), lum = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]), Lr = lum(tone) / lum(mean), f = [0, 1, 2].map(c => Lr * Math.pow(lin(tone[c]) / lin(mean[c]) / Lr, 0.5)), mx = Math.max(...f), cap = mx > 1.1 ? 1.1 / mx : 1;
        m.color.setRGB(f[0] * cap, f[1] * cap, f[2] * cap); o.material = m;   // (never lifted past the painting's own highlights: chalk-white faces)
        skinUp(m, /Wolf3D_Head/.test(n));   // [chars] pores, a little oil, light scattering warm under the skin
      } else if (/Outfit_(Top|Bottom)|Footwear/.test(n)) {
        const which = /Top/.test(n) ? 'top' : /Bottom/.test(n) ? 'bot' : 'shoe', col = which === 'top' ? TOPS[L.top] : which === 'bot' ? BOTTOMS[L.bot] : SHOES[L.shoe];
        const U = { lkA: { value: v3(col) } }; o.material = dyeMat(m0, 1, U); s.lookU.push([which, U]);
      } else if (/Eye|Teeth/.test(n) && !/Brow|Lash/.test(n)) { o.material = wetMat(m0, /Eye/.test(n) ? 0.12 : 0.42);   // [chars] wet eyes catch the light
      } else if (/Hair|Beard|Headwear/.test(n)) o.visible = false;   // their own: the look brings its own
    });
    // hair
    const over = L.hair === 'swept' || L.hair === 'side' || L.hair === 'curly';
    if (L.hair === 'swept' || L.hair === 'side') { const d = donor(/Wolf3D_Hair/, L.hair === 'swept' ? 0 : 1) || donor(/Wolf3D_Hair/, 0); if (d) accMesh(s, d.geo, donorMat(d, hairHex), 'LookHair', 'hair'); }
    const hg = geoFor(K, 'hair:' + L.hair + ':' + L.facial, () => { const a = hairGeo(F, L.hair), b = facialGeo(F, L.facial), gs = [a, b].filter(g => g && g.index && g.index.count); return gs.length ? (gs.length > 1 ? mergeGeometries(gs) : gs[0]) : null; });
    if (hg) accMesh(s, hg, shellMat(L.facial !== 'none' && (L.hair === 'bald' || L.hair === 'balding') ? hairHex : hairHex), 'LookHairShell', 'hair', false);
    // a hat
    if (L.hat === 'cowboy') { const d = donor(/Wolf3D_Headwear|^Mesh$/); if (d) accMesh(s, d.geo, donorMat(d, HATC[L.hatCol], false), 'LookHeadwear', 'cloth'); }
    else if (L.hat !== 'none') accMesh(s, geoFor(K, 'hat:' + L.hat + over, () => hatGeo(F, L.hat, over)), plainMat(HATC[L.hatCol], 0.9, 0, 'LookHeadwear'), 'LookHeadwear', 'cloth');
  } else {
    // Michelle: one atlas — skin, top and trousers dyed in the shader from one shared base (her eyes cleaned up, skin made 'light')
    s.root.traverse(o => {
      if (!o.isSkinnedMesh || o.userData.hair || o.userData.lkAcc) return;
      const m0 = K.mat0.get(o.name) || o.material;
      const base = HAIR.toneMaterial(m0, 'light', null, o.geometry, o.skeleton), tone = TONES[L.tone], ref = HAIR.SKIN.light;
      const U = { lkA: { value: v3(TOPS[L.top]) }, lkB: { value: v3(BOTTOMS[L.bot]) }, lkSkin: { value: new THREE.Vector3(tone[0] / ref[0], tone[1] / ref[1], tone[2] / ref[2]) }, lkMask: { value: maskTex(o, base.map) } };
      o.material = dyeMat(base, 0, U); s.lookU.push(['top', U], ['bot', U]);
      o.userData.hairSrc = m0;
    });
    HAIR.addHair(s, hashStr(L.key || 'x') % 100000, { zombie, style: L.hair, color: hairHex });
    s.isFemale = true; s.femaleLook = { tone: L.tone, clothes: [TOPS[L.top], BOTTOMS[L.bot]] };
  }
  // glasses and earrings (the dead keep theirs on)
  if (L.glasses !== 'none' || L.ears !== 'none') {
    const g = geoFor(K, 'gl:' + L.glasses + ':' + L.ears, () => glassesGeo(F, L.glasses, L.ears));
    const col = L.ears !== 'none' && L.glasses === 'none' ? (L.ears === 'gold' ? 0xc8a040 : 0xc8c8cc) : GLASSC[L.glassCol];
    const m = accMesh(s, g, plainMat(L.glasses === 'sun' ? 0x0c0c0e : col, L.ears !== 'none' && L.glasses === 'none' ? 0.3 : 0.35, L.ears !== 'none' && L.glasses === 'none' ? 0.9 : 0.2, 'LookGlasses'), 'LookGlasses', 'cloth', false);
    if (m) m.userData.lkKeep = true;
  }
  const saved = [];
  s.root.traverse(o => { if (o.isMesh && o.material) saved.push([o, o.material, o.visible]); });
  return saved;
}
// a uniform (paramedics, Ben's hoodie) over the look, and back again (null)
export function outfit(s, top = null, bot = null) {
  if (!s.lookL || !s.lookU) return;
  const L = s.lookL;
  for (const [w, U] of s.lookU) {
    if (w === 'top') U.lkA.value.copy(v3(top != null ? top : TOPS[L.top]));
    if (w === 'bot') (U.lkB || U.lkA).value.copy(v3(bot != null ? bot : BOTTOMS[L.bot]));
  }
}
// Michelle's mask: where her top is (r) and where her head is (g), from hair.js's own measuring
const MASKS = new WeakMap();
function maskTex(o, map) {
  if (MASKS.has(o.geometry)) return MASKS.get(o.geometry);
  const im = map.image, sz = Math.min(im.width, 512), M = HAIR.masksOf(o.geometry, o.skeleton, sz);
  const cv = document.createElement('canvas'); cv.width = cv.height = sz; const g = cv.getContext('2d'), D = g.createImageData(sz, sz), d = D.data;
  for (let p = 0; p < d.length; p += 4) { d[p] = M.torso[p + 3]; d[p + 1] = M.head[p + 3]; d[p + 2] = 0; d[p + 3] = 255; }
  g.putImageData(D, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.flipY = map.flipY; t.colorSpace = THREE.NoColorSpace; t.wrapS = map.wrapS; t.wrapT = map.wrapT;
  MASKS.set(o.geometry, t); return t;
}
// test hook: every look in play, and whether any two are too alike
export function audit(list) {
  const L = list.filter(Boolean), bad = [];
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) { const d = lookDiff(L[i], L[j]); if (d < 2 || L[i].sig === L[j].sig) bad.push([L[i].key, L[j].key, d]); }
  let minD = 99; for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) minD = Math.min(minD, lookDiff(L[i], L[j]));
  return { n: L.length, unique: new Set(L.map(l => l.sig)).size, minDiff: minD, clashes: bad.slice(0, 10) };
}
