// human-WAR — every texture is painted at load time on a canvas (no image files).
// ground, bark, rock, planks, and the war materials: brick, concrete, sandbags, steel, canvas, crates, signs.
import * as THREE from 'three';
import { C } from './state.js';

// ---- how much the device can take: 0 desktop (nothing changes), 1 tablet (iPad), 2 phone / ?lowpower=1.
// js/mobile.js decides (C.mobile, C.lowPower); if it hasn't run yet, the same rules are applied here.
let TIER = null;
export function tier() {
  if (TIER != null) return TIER;
  try { const q = new URLSearchParams(location.search).get('tier'); if (q != null && /^[012]$/.test(q)) return (TIER = +q); } catch { }   // test hook: ?tier=0|1|2
  let mobile = C.mobile, low = C.lowPower;
  if (mobile === undefined && low === undefined) {
    try {
      const Q = new URLSearchParams(location.search), ua = navigator.userAgent || '', mtp = navigator.maxTouchPoints || 0;
      let coarse = false; try { coarse = matchMedia('(pointer: coarse)').matches; } catch { }
      const iOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && mtp > 1), android = /Android/i.test(ua);
      const touch = Q.has('touch') ? Q.get('touch') !== '0' : (iOS || android || (coarse && mtp > 0));
      const sMin = Math.min(screen.width || innerWidth, screen.height || innerHeight);
      const phone = touch && (/iPhone|iPod/.test(ua) || (android && /Mobile/.test(ua)) || sMin < 560);
      const mem = navigator.deviceMemory || 0, lowMem = (mem && mem <= 4) || (/iPhone/.test(ua) && Math.max(screen.width, screen.height) <= 700);
      low = Q.has('lowpower') || (touch && (phone || lowMem)); mobile = touch || iOS || Q.has('lowpower');
    } catch { low = false; mobile = false; }
  }
  TIER = low ? 2 : mobile ? 1 : 0;
  return TIER;
}
export const isLow = () => tier() > 0;   // any phone or tablet: the cheaper path

export function rng(seed) {   // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const cv = (w, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
// text that always fits: shrink the font's px size until `text` is no wider than maxW (and never taller than maxH); ?dbg warns when it had to
const DBG_TX = (() => { try { return new URLSearchParams(location.search).has('dbg'); } catch { return false; } })();
function fitFont(g, text, font, maxW, maxH = Infinity, minPx = 6) {
  const m = /(\d+(?:\.\d+)?)px/.exec(font); g.font = font; if (!m) return font;
  const px0 = +m[1]; let px = Math.min(px0, maxH);
  g.font = font.replace(m[0], px + 'px');
  for (let k = 0; k < 40 && px > minPx && g.measureText(text).width > maxW; k++) { px = Math.max(minPx, Math.floor(px * 0.94)); g.font = font.replace(m[0], px + 'px'); }
  if (px < px0 && DBG_TX) console.warn(`[tex] shrank "${text}" ${px0}px -> ${px}px to fit ${Math.round(maxW)}px`);
  return g.font;
}
// fit, then draw (maxWidth as a last guarantee nothing spills off the canvas)
function fitText(g, text, x, y, font, maxW, maxH) { fitFont(g, text, font, maxW, maxH); g.fillText(text, x, y, maxW); }
const tex = (c, { srgb = true, repeat = true, aniso = 8 } = {}) => {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso; return t;
};
// tileable value noise into an ImageData-sized float array
function valueNoise(N, octaves, seed) {
  const r = rng(seed), out = new Float32Array(N * N);
  let amp = 1, tot = 0;
  for (const f of octaves) {
    const lat = new Float32Array(f * f); for (let i = 0; i < lat.length; i++) lat[i] = r();
    const at = (i, j) => lat[((j % f + f) % f) * f + ((i % f + f) % f)];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = i / N * f, y = j / N * f, xi = Math.floor(x), yi = Math.floor(y), tx = x - xi, ty = y - yi;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * sx, b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * sx;
      out[j * N + i] += (a + (b - a) * sy) * amp;
    }
    tot += amp; amp *= 0.55;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}
function paintNoise(g, N, cols, n, jitter = 0, r = Math.random) {
  const img = g.createImageData(N, N), d = img.data;
  for (let i = 0; i < N * N; i++) {
    const v = n[i], k = Math.min(cols.length - 1.001, Math.max(0, v * (cols.length - 1)));
    const a = cols[Math.floor(k)], b = cols[Math.floor(k) + 1], t = k - Math.floor(k), j = (r() - 0.5) * jitter;
    d[i * 4] = a[0] + (b[0] - a[0]) * t + j; d[i * 4 + 1] = a[1] + (b[1] - a[1]) * t + j; d[i * 4 + 2] = a[2] + (b[2] - a[2]) * t + j; d[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}
// ---- relief: every brick/board/shingle also paints a height field, turned into a tangent-space normal map
// (Sobel on the height, wrapping at the edges so it tiles; NoColorSpace because it is data, not colour).
// h: Float32Array (W*H, any range) or a canvas (its luminance is the height). strength: slope gain.
export function normalFromHeight(h, strength = 2, W = 0, H = 0) {
  if (!(h instanceof Float32Array)) {   // a canvas: luminance 0..1
    const cvs = h; W = cvs.width; H = cvs.height;
    const d = cvs.getContext('2d').getImageData(0, 0, W, H).data; h = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) h[i] = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) / 255;
  }
  const [c, g] = cv(W, H), img = g.createImageData(W, H), o = img.data, s8 = strength / 8;
  for (let j = 0; j < H; j++) {
    const ru = ((j + H - 1) % H) * W, r0 = j * W, rd = ((j + 1) % H) * W;   // row above / this / below, wrapping so it tiles
    for (let i = 0; i < W; i++) {
      const il = (i + W - 1) % W, ir = (i + 1) % W;
      // Sobel; canvas rows run down but texture v runs up (flipY), so dY flips sign
      const dx = (h[ru + ir] + 2 * h[r0 + ir] + h[rd + ir]) - (h[ru + il] + 2 * h[r0 + il] + h[rd + il]);
      const dy = (h[rd + il] + 2 * h[rd + i] + h[rd + ir]) - (h[ru + il] + 2 * h[ru + i] + h[ru + ir]);
      const nx = -dx * s8, ny = dy * s8, l = 127.5 / Math.sqrt(nx * nx + ny * ny + 1);
      const k = (r0 + i) * 4; o[k] = 127.5 + nx * l; o[k + 1] = 127.5 + ny * l; o[k + 2] = 127.5 + l; o[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = tex(c, { srgb: false }); t.colorSpace = THREE.NoColorSpace; return t;
}
// attach a normal map to a colour texture (t.userData.normal) — world.js: { map: t, normalMap: t.userData.normal, normalScale }
// (phones and tablets: no normal maps at all — no Sobel pass at load, no extra texture to upload and sample)
const withNormal = (t, h, strength, W, H) => { if (!isLow()) t.userData.normal = normalFromHeight(h, strength, W, H); return t; };
// material props in one go: std({ ...TX.relief(TX.brickTexture(), 1.0), roughness: 0.9 })
export function relief(t, scale = 1) {
  const o = { map: t }; if (t.userData.normal && !isLow()) { o.normalMap = t.userData.normal; o.normalScale = new THREE.Vector2(scale, scale); } return o;
}

export function groundTextures() {
  const N = 512, r = rng(5);
  // grass: mottled greens with tiny blade strokes
  const [gc, gg] = cv(N);
  // suburban lawn a few days unmown: greens ~10% duller with a dry straw-yellow octave mixed through
  paintNoise(gg, N, [[40, 50, 24], [56, 70, 30], [72, 86, 38], [86, 92, 46]], valueNoise(N, [4, 16, 64], 3), 14, r);
  { const dry = valueNoise(N, [3, 12, 48], 17), id = gg.getImageData(0, 0, N, N), d = id.data;
    for (let i = 0; i < N * N; i++) { const t = Math.max(0, Math.min(1, (dry[i] - 0.5) * 2.4)) * 0.55; d[i * 4] += (110 - d[i * 4]) * t; d[i * 4 + 1] += (104 - d[i * 4 + 1]) * t; d[i * 4 + 2] += (60 - d[i * 4 + 2]) * t; }
    gg.putImageData(id, 0, 0); }
  for (let k = 0; k < 9000; k++) {
    const x = r() * N, y = r() * N, l = 3 + r() * 6, a = -Math.PI / 2 + (r() - 0.5) * 1.1, straw = r() < 0.22;
    gg.strokeStyle = straw ? `rgba(${120 + r() * 40 | 0},${110 + r() * 30 | 0},${56 + r() * 20 | 0},${0.25 + r() * 0.3})` : `rgba(${84 + r() * 50 | 0},${100 + r() * 50 | 0},${32 + r() * 28 | 0},${0.25 + r() * 0.35})`; gg.lineWidth = 0.8;
    gg.beginPath(); gg.moveTo(x, y); gg.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); gg.stroke();
  }
  // dirt path: packed earth, pebbles
  const [dc, dg] = cv(N);
  paintNoise(dg, N, [[66, 50, 36], [92, 72, 52], [112, 92, 68], [128, 108, 82]], valueNoise(N, [8, 32, 128], 9), 18, r);
  for (let k = 0; k < 900; k++) {
    const x = r() * N, y = r() * N, s = 0.8 + r() * 2.6, v = 90 + r() * 80 | 0;
    dg.fillStyle = `rgba(${v},${v - 8},${v - 18},0.85)`; dg.beginPath(); dg.ellipse(x, y, s, s * (0.6 + r() * 0.4), r() * 3, 0, 7); dg.fill();
    dg.fillStyle = 'rgba(20,14,8,0.35)'; dg.beginPath(); dg.ellipse(x + s * 0.3, y + s * 0.4, s, s * 0.5, 0, 0, 7); dg.fill();
  }
  // forest floor: dead leaves, needles, twigs over dark humus
  const [lc, lg] = cv(N);
  paintNoise(lg, N, [[30, 22, 14], [52, 38, 22], [70, 52, 30]], valueNoise(N, [8, 32], 13), 10, r);
  const leaf = (x, y, s, a, col) => {
    lg.save(); lg.translate(x, y); lg.rotate(a); lg.fillStyle = col;
    lg.beginPath(); lg.moveTo(-s, 0); lg.quadraticCurveTo(0, -s * 0.55, s, 0); lg.quadraticCurveTo(0, s * 0.55, -s, 0); lg.fill();
    lg.strokeStyle = 'rgba(30,18,8,0.5)'; lg.lineWidth = 0.6; lg.beginPath(); lg.moveTo(-s, 0); lg.lineTo(s, 0); lg.stroke(); lg.restore();
  };
  for (let k = 0; k < 2600; k++) {
    const hue = r(), c = hue < 0.4 ? [120 + r() * 50, 70 + r() * 30, 30] : hue < 0.7 ? [150 + r() * 50, 100 + r() * 30, 40] : hue < 0.9 ? [90, 60 + r() * 20, 30] : [110, 110, 50];
    leaf(r() * N, r() * N, 4 + r() * 7, r() * 6.3, `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${0.55 + r() * 0.4})`);
  }
  for (let k = 0; k < 600; k++) {   // needles + twigs
    const x = r() * N, y = r() * N, a = r() * 6.3, l = 4 + r() * 14;
    lg.strokeStyle = `rgba(${100 + r() * 50 | 0},${70 + r() * 30 | 0},40,0.6)`; lg.lineWidth = r() < 0.15 ? 1.6 : 0.6;
    lg.beginPath(); lg.moveTo(x, y); lg.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); lg.stroke();
  }
  // moss: deep velvety green for the hollow
  const [mc, mg] = cv(N);
  paintNoise(mg, N, [[26, 46, 16], [44, 74, 24], [70, 100, 34], [96, 120, 44]], valueNoise(N, [8, 32, 128], 17), 22, r);
  return { grass: tex(gc), dirt: tex(dc), litter: tex(lc), moss: tex(mc) };
}

export function barkTexture(kind = 'oak') {
  const W = 512, H = 1024, r = rng(kind === 'pine' ? 21 : kind === 'birch' ? 22 : 23);
  const [c, g] = cv(W, H);
  if (kind === 'birch') {
    g.fillStyle = '#d9d5cc'; g.fillRect(0, 0, W, H);
    for (let k = 0; k < 400; k++) { const v = 200 + r() * 40 | 0; g.fillStyle = `rgba(${v},${v - 4},${v - 12},0.5)`; g.fillRect(r() * W, r() * H, 6 + r() * 30, 1 + r() * 2); }
    for (let k = 0; k < 70; k++) {   // lenticels and black scars
      const x = r() * W, y = r() * H, w = 8 + r() * 40, h = 1.5 + r() * 4;
      g.fillStyle = `rgba(20,18,16,${0.6 + r() * 0.4})`; g.beginPath(); g.ellipse(x, y, w / 2, h / 2, 0, 0, 7); g.fill();
    }
  } else {
    const base = kind === 'pine' ? [96, 70, 52] : [104, 94, 82];   // real bark is a mid grey-brown, not near black
    g.fillStyle = `rgb(${base})`; g.fillRect(0, 0, W, H);
    // deep vertical furrows with plates between
    for (let k = 0; k < 140; k++) {
      let x = r() * W; const w = 2 + r() * 6;
      g.strokeStyle = `rgba(30,24,18,${0.35 + r() * 0.35})`; g.lineWidth = w;
      g.beginPath(); g.moveTo(x, -10);
      for (let y = 0; y < H + 20; y += 16) { x += (r() - 0.5) * 9; g.lineTo(x, y); }
      g.stroke();
    }
    for (let k = 0; k < 2600; k++) {
      const v = r(), col = kind === 'pine' ? [130 + v * 50, 92 + v * 30, 66 + v * 20] : [128 + v * 40, 118 + v * 35, 102 + v * 30];
      g.fillStyle = `rgba(${col[0] | 0},${col[1] | 0},${col[2] | 0},${0.12 + r() * 0.18})`;   // the bark plates between the furrows
      g.beginPath(); g.ellipse(r() * W, r() * H, 1 + r() * 3.5, 4 + r() * 18, (r() - 0.5) * 0.2, 0, 7); g.fill();
    }
    // a little lichen
    for (let k = 0; k < 120; k++) { g.fillStyle = `rgba(${120 + r() * 40 | 0},${140 + r() * 30 | 0},${90 + r() * 30 | 0},${0.15 + r() * 0.25})`; g.beginPath(); g.arc(r() * W, r() * H, 1 + r() * 5, 0, 7); g.fill(); }
  }
  // seamless left/right edge; the furrows and plates in relief
  return withNormal(tex(c), c, 3.2);
}

// A pine bough seen from above: a woody stem with dense needle tufts. Alpha cut-out.
export function rockTexture() {
  const N = 512, r = rng(61);
  const [c, g] = cv(N);
  paintNoise(g, N, [[70, 68, 64], [104, 100, 94], [130, 126, 118], [150, 146, 138]], valueNoise(N, [4, 16, 64, 256], 63), 20, r);
  for (let k = 0; k < 300; k++) { g.strokeStyle = `rgba(30,28,26,${0.2 + r() * 0.3})`; g.lineWidth = 0.6 + r(); const x = r() * N, y = r() * N; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 50, y + (r() - 0.5) * 50); g.stroke(); }
  for (let k = 0; k < 260; k++) { g.fillStyle = `rgba(${160 + r() * 40 | 0},${160 + r() * 40 | 0},${120 + r() * 30 | 0},${0.12 + r() * 0.2})`; g.beginPath(); g.arc(r() * N, r() * N, 2 + r() * 9, 0, 7); g.fill(); }
  return tex(c);
}

export function plankTexture() {
  const W = 512, H = 512, r = rng(71);
  const [c, g] = cv(W, H);
  const rows = 8;
  for (let i = 0; i < rows; i++) {
    const v = 0.8 + r() * 0.35;
    g.fillStyle = `rgb(${118 * v | 0},${84 * v | 0},${54 * v | 0})`; g.fillRect(0, i * H / rows, W, H / rows);
    for (let k = 0; k < 40; k++) { g.strokeStyle = `rgba(${60 + r() * 40 | 0},${40 + r() * 20 | 0},20,${0.2 + r() * 0.3})`; g.lineWidth = 0.6 + r() * 1.5; const y = i * H / rows + r() * H / rows; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(W / 3, y + (r() - 0.5) * 8, W * 2 / 3, y + (r() - 0.5) * 8, W, y + (r() - 0.5) * 4); g.stroke(); }
    g.fillStyle = 'rgba(20,12,6,0.85)'; g.fillRect(0, i * H / rows, W, 3);
    if (r() < 0.6) { g.fillStyle = 'rgba(40,24,12,0.7)'; g.beginPath(); g.ellipse(r() * W, i * H / rows + H / rows / 2, 6 + r() * 6, 4, 0, 0, 7); g.fill(); }
  }
  return tex(c);
}

export function glowSprite(col = '255,240,200') {
  const [c, g] = cv(128);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, `rgba(${col},1)`); gr.addColorStop(0.25, `rgba(${col},0.45)`); gr.addColorStop(1, `rgba(${col},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return tex(c, { repeat: false });
}
export function blobShadow() {
  const [c, g] = cv(128);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(0,0,0,0.75)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return tex(c, { repeat: false });
}

// ---------------------------------------------------------------- war materials
export function brickTexture() {
  const W = 512, H = 512, r = rng(101);
  const [c, g] = cv(W, H);
  const [hc, hg] = cv(W, H); hg.fillStyle = '#000'; hg.fillRect(0, 0, W, H);   // height: mortar recessed, bricks proud
  g.fillStyle = '#8a8478'; g.fillRect(0, 0, W, H);   // mortar
  const bw = 64, bh = 24;
  for (let row = 0; row < Math.ceil(H / bh); row++) for (let col = -1; col < W / bw + 1; col++) {
    const x = col * bw + (row % 2) * bw / 2, y = row * bh, v = 0.75 + r() * 0.4;
    g.fillStyle = `rgb(${128 * v | 0},${62 * v | 0},${44 * v | 0})`; g.fillRect(x + 2, y + 2, bw - 4, bh - 4);
    hg.fillStyle = `rgb(${200 + r() * 40 | 0},0,0)`; hg.fillRect(x + 2.5, y + 2.5, bw - 5, bh - 5);   // each brick sits a touch differently
    hg.fillStyle = 'rgba(230,0,0,0.6)'; hg.fillRect(x + 3.5, y + 3.5, bw - 7, bh - 7);   // rounded arrises
    for (let k = 0; k < 6; k++) { hg.fillStyle = 'rgba(0,0,0,0.5)'; hg.fillRect(x + 2 + r() * (bw - 6), y + 2 + r() * (bh - 6), 1 + r() * 3, 1 + r() * 2); }   // chips and pits
    for (let k = 0; k < 18; k++) { g.fillStyle = `rgba(${r() < 0.5 ? '40,20,14' : '190,120,90'},${0.1 + r() * 0.2})`; g.fillRect(x + 2 + r() * (bw - 6), y + 2 + r() * (bh - 6), 1 + r() * 4, 1 + r() * 3); }
  }
  // old plaster still clinging on in patches, soot near the top
  const n = valueNoise(W, [4, 16], 107);
  const id = g.getImageData(0, 0, W, H), d = id.data;
  for (let i = 0; i < W * H; i++) {
    const p = n[i];
    const y = Math.floor(i / W) / H, soot = (1 - y) * 0.12 * (0.5 + n[(i + 9000) % (W * H)]) + (p - 0.5) * 0.08;   // a little weathering, no blotches
    d[i * 4] *= 1 - soot; d[i * 4 + 1] *= 1 - soot; d[i * 4 + 2] *= 1 - soot;
  }
  g.putImageData(id, 0, 0);
  // height = red channel of the height canvas + fine grit
  const hd = hg.getImageData(0, 0, W, H).data, hh = new Float32Array(W * H), grit = valueNoise(W, [64, 256], 109);
  for (let i = 0; i < W * H; i++) hh[i] = hd[i * 4] / 255 * 0.85 + grit[i] * 0.15;
  return withNormal(tex(c), hh, 3, W, H);
}
export function concreteTexture(tone = 1) {
  const N = 512, r = rng(111);
  const [c, g] = cv(N);
  paintNoise(g, N, [[96, 94, 90], [122, 120, 115], [140, 138, 132], [156, 154, 148]].map(a => a.map(x => x * tone)), valueNoise(N, [4, 16, 64, 256], 113), 16, r);
  for (let k = 0; k < 500; k++) { g.fillStyle = `rgba(40,40,40,${0.15 + r() * 0.3})`; g.beginPath(); g.arc(r() * N, r() * N, 0.6 + r() * 2.2, 0, 7); g.fill(); }
  for (let k = 0; k < 30; k++) { g.strokeStyle = `rgba(30,30,30,${0.25 + r() * 0.3})`; g.lineWidth = 0.8; let x = r() * N, y = r() * N; g.beginPath(); g.moveTo(x, y); for (let s = 0; s < 8; s++) { x += (r() - 0.5) * 30; y += r() * 20; g.lineTo(x, y); } g.stroke(); }
  const hgt = isLow() ? null : normalFromHeight(c, 1.6);   // relief from the pits and cracks before the rain streaks go on (streaks are colour only)
  for (let k = 0; k < 14; k++) { const x = r() * N; const gr = g.createLinearGradient(x, 0, x + 20, 0); gr.addColorStop(0, 'rgba(60,50,40,0)'); gr.addColorStop(0.5, 'rgba(60,50,40,0.18)'); gr.addColorStop(1, 'rgba(60,50,40,0)'); g.fillStyle = gr; g.fillRect(x, r() * N * 0.5, 20, N); }
  const t = tex(c); t.userData.normal = hgt; return t;
}
export function burlapTexture() {
  const N = 256, r = rng(121);
  const [c, g] = cv(N);
  g.fillStyle = '#8f7d5a'; g.fillRect(0, 0, N, N);
  for (let y = 0; y < N; y += 3) { g.fillStyle = `rgba(60,48,30,${0.25 + r() * 0.15})`; g.fillRect(0, y, N, 1); }
  for (let x = 0; x < N; x += 3) { g.fillStyle = `rgba(180,160,120,${0.12 + r() * 0.1})`; g.fillRect(x, 0, 1, N); }
  const n = valueNoise(N, [4, 16], 123), id = g.getImageData(0, 0, N, N), d = id.data;
  for (let i = 0; i < N * N; i++) { const k = 0.75 + n[i] * 0.5; d[i * 4] *= k; d[i * 4 + 1] *= k; d[i * 4 + 2] *= k * 0.96; }
  g.putImageData(id, 0, 0);
  return tex(c);
}
export function corrugatedTexture(col = [150, 60, 40]) {
  const W = 512, H = 256, r = rng(131);
  const [c, g] = cv(W, H);
  for (let x = 0; x < W; x++) { const s = 0.72 + 0.28 * Math.sin(x / W * Math.PI * 2 * 24); g.fillStyle = `rgb(${col[0] * s | 0},${col[1] * s | 0},${col[2] * s | 0})`; g.fillRect(x, 0, 1, H); }
  for (let k = 0; k < 80; k++) { const x = r() * W, y = r() * H; const gr = g.createRadialGradient(x, y, 0, x, y, 6 + r() * 26); gr.addColorStop(0, 'rgba(100,50,20,0.55)'); gr.addColorStop(1, 'rgba(100,50,20,0)'); g.fillStyle = gr; g.fillRect(x - 40, y - 40, 80, 80); }
  for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(20,14,10,${0.2 + r() * 0.3})`; g.fillRect(r() * W, r() * H, 1, 6 + r() * 30); }
  return tex(c);
}
export function crateTexture() {
  const N = 256, r = rng(141);
  const [c, g] = cv(N);
  for (let i = 0; i < 5; i++) { const v = 0.8 + r() * 0.3; g.fillStyle = `rgb(${120 * v | 0},${96 * v | 0},${58 * v | 0})`; g.fillRect(0, i * N / 5, N, N / 5); g.fillStyle = 'rgba(30,20,10,0.8)'; g.fillRect(0, i * N / 5, N, 2); for (let k = 0; k < 20; k++) { g.strokeStyle = `rgba(70,50,25,${0.2 + r() * 0.3})`; g.beginPath(); const y = i * N / 5 + r() * N / 5; g.moveTo(0, y); g.lineTo(N, y + (r() - 0.5) * 6); g.stroke(); } }
  g.fillStyle = 'rgba(70,52,30,1)'; g.fillRect(0, 0, N, 16); g.fillRect(0, N - 16, N, 16); g.fillRect(0, 0, 16, N); g.fillRect(N - 16, 0, 16, N);
  g.save(); g.translate(N / 2, N / 2); g.rotate(Math.atan2(N, N)); g.fillRect(-N * 0.7, -8, N * 1.4, 16); g.restore();
  g.fillStyle = 'rgba(25,25,20,0.75)'; g.font = 'bold 28px Helvetica, Arial'; g.textAlign = 'center'; fitText(g, 'AMMO', N / 2, N / 2 - 30, 'bold 28px Helvetica, Arial', N - 48); fitText(g, '5.56 MM · 1680 RDS', N / 2, N / 2 + 46, 'bold 14px Helvetica', N - 48);
  return tex(c);
}
export function burntMetalTexture() {
  const N = 512, r = rng(151);
  const [c, g] = cv(N);
  paintNoise(g, N, [[22, 20, 18], [42, 38, 32], [70, 52, 36], [92, 60, 34]], valueNoise(N, [4, 16, 64], 153), 14, r);
  for (let k = 0; k < 120; k++) { g.fillStyle = `rgba(${120 + r() * 60 | 0},${60 + r() * 30 | 0},20,${0.12 + r() * 0.2})`; g.beginPath(); g.arc(r() * N, r() * N, 2 + r() * 18, 0, 7); g.fill(); }
  return tex(c);
}
export function paintedMetalTexture(col = [72, 82, 56]) {
  const N = 256, r = rng(161);
  const [c, g] = cv(N);
  paintNoise(g, N, [col.map(x => x * 0.8), col, col.map(x => x * 1.12)], valueNoise(N, [4, 16, 64], 163), 10, r);
  for (let k = 0; k < 60; k++) { g.fillStyle = `rgba(90,60,30,${0.1 + r() * 0.2})`; g.beginPath(); g.arc(r() * N, r() * N, 1 + r() * 6, 0, 7); g.fill(); }
  for (let k = 0; k < 30; k++) { g.fillStyle = `rgba(40,30,20,${0.15 + r() * 0.2})`; g.fillRect(r() * N, r() * N, 1, 10 + r() * 40); }
  return tex(c);
}
export function canvasClothTexture(col = [86, 90, 62]) {
  const N = 256, r = rng(171);
  const [c, g] = cv(N);
  paintNoise(g, N, [col.map(x => x * 0.82), col, col.map(x => x * 1.1)], valueNoise(N, [4, 16, 64], 173), 12, r);
  for (let y = 0; y < N; y += 2) { g.fillStyle = 'rgba(0,0,0,0.06)'; g.fillRect(0, y, N, 1); }
  return tex(c);
}
export function gravelTexture() {
  const N = 512, r = rng(181);
  const [c, g] = cv(N);
  paintNoise(g, N, [[78, 72, 62], [104, 96, 84], [124, 116, 102]], valueNoise(N, [8, 32, 128], 183), 20, r);
  for (let k = 0; k < 4000; k++) { const v = 90 + r() * 90 | 0, s = 0.8 + r() * 2.4, x = r() * N, y = r() * N; g.fillStyle = `rgba(${v},${v - 4},${v - 12},0.9)`; g.beginPath(); g.ellipse(x, y, s, s * 0.7, r() * 3, 0, 7); g.fill(); g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(x + s * 0.4, y + s * 0.4, s, s * 0.5, 0, 0, 7); g.fill(); }
  return tex(c);
}
// paper silhouette target with scoring rings
export function paperTargetTexture() {
  const W = 256, H = 512;
  const [c, g] = cv(W, H);
  g.fillStyle = '#e8e0cc'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#26303a';
  g.beginPath(); g.ellipse(W / 2, 92, 46, 56, 0, 0, 7); g.fill();                  // head
  g.beginPath(); g.moveTo(W / 2 - 34, 140); g.lineTo(W / 2 + 34, 140); g.quadraticCurveTo(W - 8, 170, W - 10, 260); g.lineTo(W - 18, H - 8); g.lineTo(18, H - 8); g.lineTo(10, 260); g.quadraticCurveTo(8, 170, W / 2 - 34, 140); g.fill();
  g.strokeStyle = 'rgba(232,224,204,0.8)'; g.lineWidth = 3;
  for (const [cy, rx, ry] of [[300, 50, 66], [300, 86, 112], [300, 110, 170]]) { g.beginPath(); g.ellipse(W / 2, cy, rx, ry, 0, 0, 7); g.stroke(); }
  g.beginPath(); g.ellipse(W / 2, 92, 24, 30, 0, 0, 7); g.stroke();
  g.fillStyle = 'rgba(232,224,204,0.9)'; g.font = 'bold 22px Helvetica'; g.textAlign = 'center';
  g.fillText('10', W / 2, 300); g.fillText('8', W / 2, 220); g.fillText('5', W / 2, 440); g.fillText('10', W / 2, 100);
  return tex(c, { repeat: false });
}
export function signTexture(lines, bg = '#2d3524', fg = '#e8e2c8', w = 512, h = 256) {
  const [c, g] = cv(w, h);
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = fg; g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  const step = Math.min(62, (h - 40) / Math.max(1, lines.length));
  lines.forEach((l, i) => fitText(g, l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * step, `bold ${i ? 30 : 52}px Helvetica, Arial`, w - 44, step * 0.92));
  const id = g.getImageData(0, 0, w, h), d = id.data; for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 20; d[i] += n; d[i + 1] += n; d[i + 2] += n; } g.putImageData(id, 0, 0);
  return tex(c, { repeat: false });
}
// a blast crater seen from above (alpha: dark scorched centre, churned rim)
export function craterTexture() {
  const N = 256, r = rng(191);
  const [c, g] = cv(N);
  const gr = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  gr.addColorStop(0, 'rgba(18,14,10,0.95)'); gr.addColorStop(0.45, 'rgba(34,26,18,0.9)'); gr.addColorStop(0.7, 'rgba(70,54,36,0.7)'); gr.addColorStop(0.85, 'rgba(60,46,30,0.35)'); gr.addColorStop(1, 'rgba(40,30,20,0)');
  g.fillStyle = gr; g.fillRect(0, 0, N, N);
  for (let k = 0; k < 400; k++) { const a = r() * 6.28, d = (0.3 + r() * 0.6) * N / 2, s = 1 + r() * 4; g.fillStyle = `rgba(${30 + r() * 50 | 0},${24 + r() * 36 | 0},${16 + r() * 20 | 0},${0.4 + r() * 0.5})`; g.beginPath(); g.arc(N / 2 + Math.cos(a) * d, N / 2 + Math.sin(a) * d, s, 0, 7); g.fill(); }
  return tex(c, { repeat: false });
}

// ---------------------------------------------------------------- the neighbourhood
// grime: a value-noise multiply so nothing looks freshly painted. (No per-tile darkening at the bottom any more: on a
// repeating texture that put a dark band at every repeat. Wall-base dirt belongs in world space, in the shader.)
function grime(g, N, M, seed, amt = 0.25, bottom = 0) {
  const n = valueNoise(N, [4, 16, 64], seed), id = g.getImageData(0, 0, N, M), d = id.data;
  for (let j = 0; j < M; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i, v = n[(j % N) * N + i];
    const f = 1 - amt * Math.max(0, v - 0.45) * 2;
    d[k * 4] *= f; d[k * 4 + 1] *= f; d[k * 4 + 2] *= f;
  }
  g.putImageData(id, 0, 0);
}
// horizontal lap siding (one texture tile = 1 m), tinted by the material colour
export function sidingTexture(seed = 1) {
  const N = 256, r = rng(seed * 31 + 5);
  const [c, g] = cv(N);
  g.fillStyle = '#e8e6e0'; g.fillRect(0, 0, N, N);
  const bh = N / 6;   // boards 16.7 cm
  const hh = new Float32Array(N * N), grain = valueNoise(N, [16, 128], seed * 3 + 11);
  for (let b = 0; b < 6; b++) {
    const y = b * bh;
    // only the thin drip-edge shadow is baked now (ambient-occluded crack under each lap); the slope comes from the normal map
    const gr = g.createLinearGradient(0, y, 0, y + bh); gr.addColorStop(0, 'rgba(0,0,0,0.06)'); gr.addColorStop(0.08, 'rgba(0,0,0,0.0)'); gr.addColorStop(0.9, 'rgba(0,0,0,0.0)'); gr.addColorStop(0.97, 'rgba(0,0,0,0.1)'); gr.addColorStop(1, 'rgba(0,0,0,0.16)');
    g.fillStyle = gr; g.fillRect(0, y, N, bh);
    for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(0,0,0,${r() * 0.05})`; g.fillRect(r() * N, y + r() * bh, 10 + r() * 60, 1); }
  }
  // height: a sawtooth per board — thin at the top (tucked under the board above), thick at the bottom overlap
  for (let j = 0; j < N; j++) { const t = (j % bh) / bh; for (let i = 0; i < N; i++) hh[j * N + i] = t + (grain[j * N + i] - 0.5) * 0.06; }
  grime(g, N, N, seed * 7 + 3, 0.14, 0);
  return withNormal(tex(c), hh, 5, N, N);
}
export function shingleTexture(seed = 2) {
  const N = 256, r = rng(seed * 13 + 1);
  const [c, g] = cv(N);
  g.fillStyle = '#3a3836'; g.fillRect(0, 0, N, N);
  const [hc, hg] = cv(N); hg.fillStyle = '#000'; hg.fillRect(0, 0, N, N);
  const rh = N / 8, tw = N / 6;
  for (let row = 0; row < 8; row++) for (let col = -1; col < 7; col++) {
    const x = col * tw + (row % 2) * tw / 2 + (r() - 0.5) * 4, y = row * rh, v = 0.7 + r() * 0.5;
    g.fillStyle = `rgb(${70 * v | 0},${66 * v | 0},${62 * v | 0})`; g.fillRect(x + 1, y + 1, tw - 2, rh - 2);
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(x, y + rh - 3, tw, 3);
    for (let k = 0; k < 30; k++) { g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '160,150,130'},${r() * 0.25})`; g.fillRect(x + r() * tw, y + r() * rh, 1.5, 1.5); }
    // height: each tab is thicker at its exposed bottom edge (a step at every course); slots between tabs sink
    const gr = hg.createLinearGradient(0, y, 0, y + rh); gr.addColorStop(0, 'rgb(60,0,0)'); gr.addColorStop(1, `rgb(${200 + r() * 50 | 0},0,0)`);
    hg.fillStyle = gr; hg.fillRect(x + 1.5, y, tw - 3, rh);
  }
  const hd = hg.getImageData(0, 0, N, N).data, grit = valueNoise(N, [64, 128], seed + 44), hh = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) hh[i] = hd[i * 4] / 255 + (grit[i] - 0.5) * 0.15;   // granule grit
  grime(g, N, N, seed + 40, 0.35, 0);
  return withNormal(tex(c), hh, 4, N, N);
}
export function asphaltTexture() {
  const N = 1024, r = rng(211), S = N / 512;   // 1024 px per 6 m tile (~17 px per 10 cm), weathered grey (albedo ~0.1-0.15), not tar black
  const [c, g] = cv(N);
  paintNoise(g, N, [[62, 62, 64], [78, 77, 76], [90, 89, 87], [104, 102, 99]], valueNoise(N, [8, 32, 128, 256], 213), 26, r);
  for (let k = 0; k < 14000; k++) { const v = 80 + r() * 80 | 0; g.fillStyle = `rgba(${v},${v - 2},${v - 4},${0.3 + r() * 0.4})`; g.fillRect(r() * N, r() * N, 1 + r() * 2, 1 + r() * 2); }   // exposed aggregate
  for (let k = 0; k < 5000; k++) { g.fillStyle = `rgba(30,30,32,${0.25 + r() * 0.3})`; g.fillRect(r() * N, r() * N, 1 + r() * 1.5, 1 + r() * 1.5); }   // voids between stones
  const hgt = isLow() ? null : normalFromHeight(c, 1.4);   // aggregate relief from the stones themselves
  for (let k = 0; k < 12; k++) {   // hairline cracks: thin, wandering in small steps, a pale chipped lip beside the dark line
    let x = r() * N, y = r() * N, a = r() * 6.3; const pts = [[x, y]];
    for (let s = 0; s < 26; s++) { a += (r() - 0.5) * 0.9; x += Math.cos(a) * 9 * S; y += Math.sin(a) * 9 * S; pts.push([x, y]); }
    for (const [dx, col, w] of [[1.2, 'rgba(150,148,142,0.16)', 1.6], [0, `rgba(22,22,22,${0.28 + r() * 0.2})`, 0.6 + r() * 0.7]]) {
      g.strokeStyle = col; g.lineWidth = w * S; g.lineJoin = 'round'; g.beginPath(); pts.forEach(([px, py], i) => i ? g.lineTo(px + dx, py + dx) : g.moveTo(px + dx, py + dx)); g.stroke();
    }
  }
  // tar-sealed crack repairs: glossy black squiggles laid over a few old cracks
  for (let k = 0; k < 3; k++) {   // each one follows a long, gently wandering crack
    g.strokeStyle = 'rgba(26,26,28,0.45)'; g.lineWidth = 4 * S; g.lineJoin = g.lineCap = 'round'; let x = r() * N, y = r() * N, a = r() * 6.3; g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 6; s++) { a += (r() - 0.5) * 0.9; const mx = x + Math.cos(a) * 30 * S, my = y + Math.sin(a) * 30 * S; a += (r() - 0.5) * 0.9; x = mx + Math.cos(a) * 30 * S; y = my + Math.sin(a) * 30 * S; g.quadraticCurveTo(mx, my, x, y); } g.stroke();
  }
  // oil stains
  for (let k = 0; k < 6; k++) { const x = r() * N, y = r() * N, s = (10 + r() * 30) * S; const gr = g.createRadialGradient(x, y, 0, x, y, s); gr.addColorStop(0, 'rgba(14,14,16,0.4)'); gr.addColorStop(1, 'rgba(14,14,16,0)'); g.fillStyle = gr; g.fillRect(x - s, y - s, s * 2, s * 2); }
  const t = tex(c); t.userData.normal = hgt; return t;
}
export function sidewalkTexture() {
  const N = 256, r = rng(221);
  const [c, g] = cv(N);
  paintNoise(g, N, [[128, 126, 120], [148, 146, 140], [160, 158, 152], [170, 168, 160]], valueNoise(N, [4, 16, 64], 223), 14, r);
  g.strokeStyle = 'rgba(40,40,40,0.55)'; g.lineWidth = 2; g.strokeRect(0, 0, N, N);   // expansion joints every 1.5 m (tile = 1.5 m)
  for (let k = 0; k < 6; k++) { g.strokeStyle = `rgba(30,30,30,${0.3 + r() * 0.3})`; g.lineWidth = 0.8; let x = r() * N, y = r() * N; g.beginPath(); g.moveTo(x, y); for (let s = 0; s < 6; s++) { x += (r() - 0.5) * 30; y += (r() - 0.5) * 30; g.lineTo(x, y); } g.stroke(); }
  for (let k = 0; k < 400; k++) { const v = 100 + r() * 70 | 0; g.fillStyle = `rgba(${v},${v},${v - 4},0.5)`; g.fillRect(r() * N, r() * N, 1, 1); }   // broom-finish grit
  return withNormal(tex(c), c, 2.2);
}
// a lived-in (not derelict) wall finish: 0 = striped paper, 1 = small dot paper, 2 = flat matte paint with roller stipple.
// One tile = 2.5 m, so 512 px keeps the pattern fine and the repeat hard to spot.
export function wallpaperTexture(seed, base) {
  const N = 512, r = rng(seed);
  const [c, g] = cv(N);
  g.fillStyle = base; g.fillRect(0, 0, N, N);
  const kind = seed % 3;
  if (kind === 0) for (let x = 0; x < N; x += 32) { g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(x, 0, 12, N); g.fillStyle = 'rgba(0,0,0,0.04)'; g.fillRect(x + 14, 0, 2, N); }
  else if (kind === 1) for (let y = 0; y < N; y += 32) for (let x = 0; x < N; x += 32) { g.fillStyle = 'rgba(0,0,0,0.06)'; g.beginPath(); g.arc(x + (y / 32 % 2) * 16 + 8, y + 8, 4, 0, 7); g.fill(); }
  if (kind === 2) {   // paint-roller stipple: very fine speckle plus faint vertical roller lanes
    const id = g.getImageData(0, 0, N, N), d = id.data, lanes = valueNoise(N, [6, 24], seed + 9);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const k = j * N + i, f = 1 + (r() - 0.5) * 0.035 + (lanes[i] - 0.5) * 0.025; d[k * 4] *= f; d[k * 4 + 1] *= f; d[k * 4 + 2] *= f; }
    g.putImageData(id, 0, 0);
  } else for (let k = 0; k < 6000; k++) { g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},0.025)`; g.fillRect(r() * N, r() * N, 1, 1); }   // paper tooth
  grime(g, N, N, seed + 3, 0.035, 0);   // just the faint scuffing of a house people live in
  // the odd faint water mark on some walls only
  if (seed % 2) for (let k = 0; k < 2; k++) { const x = r() * N, s = 40 + r() * 80; const gr = g.createLinearGradient(x - s / 2, 0, x + s / 2, 0); gr.addColorStop(0, 'rgba(80,64,40,0)'); gr.addColorStop(0.5, 'rgba(80,64,40,0.02)'); gr.addColorStop(1, 'rgba(80,64,40,0)'); g.fillStyle = gr; g.fillRect(x - s / 2, 0, s, N); }
  return tex(c);
}
// painted/stained cabinet wood: fine vertical grain, no board seams (kitchen doors, drawers, TV unit, tables).
// Multiplied by the material colour, so keep it light; one tile = 1 m.
export function cabinetTexture(col = [214, 200, 172], seed = 13) {
  const N = 256, r = rng(seed);
  const [c, g] = cv(N);
  g.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`; g.fillRect(0, 0, N, N);
  const n = valueNoise(N, [2, 8], seed + 1), id = g.getImageData(0, 0, N, N), d = id.data;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const k = j * N + i, f = 0.95 + n[(j >> 3) * N + i] * 0.08; d[k * 4] *= f; d[k * 4 + 1] *= f; d[k * 4 + 2] *= f; }   // long soft streaks running with the grain
  g.putImageData(id, 0, 0);
  for (let k = 0; k < 220; k++) {   // thin wandering grain lines
    const x = r() * N, a = 0.04 + r() * 0.04; g.strokeStyle = `rgba(60,36,18,${a})`; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, -4); g.bezierCurveTo(x + (r() - 0.5) * 5, N / 3, x + (r() - 0.5) * 5, N * 2 / 3, x + (r() - 0.5) * 3, N + 4); g.stroke();
  }
  for (let k = 0; k < 3; k++) { const x = r() * N, y = r() * N; g.strokeStyle = 'rgba(70,40,20,0.06)'; g.lineWidth = 1; for (let q = 1; q < 5; q++) { g.beginPath(); g.ellipse(x, y, q * 1.6, q * 9, 0, 0, 7); g.stroke(); } }   // a few faint cathedral figures
  return withNormal(tex(c), c, 0.6);
}
// chain-link mesh: transparent background, galvanised wire diamonds ~6 cm across (one tile = 0.6 m, 10 diamonds).
// Use with alphaTest + DoubleSide, repeat (L/0.6, height/0.6) on a single quad (or a box for the propane cage).
let chainTex = null;
export function chainLinkTexture() {
  if (chainTex) return chainTex;
  const N = 256, P = N / 10, [c, g] = cv(N), img = g.createImageData(N, N), d = img.data, w = 1.6;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    // distance to the nearest +45 and -45 wire, in px (lines i+j = kP and i-j = kP), wraps cleanly since N/P is whole
    const a = (i + j + 0.5) % P, b = ((i - j) % P + P + 0.5) % P;
    const da = Math.min(a, P - a) / Math.SQRT2, db = Math.min(b, P - b) / Math.SQRT2, dm = Math.min(da, db);
    const cov = Math.max(0, Math.min(1, w - dm));
    const k = (j * N + i) * 4, shade = da < db ? 175 : 150, knot = Math.max(0, 1 - Math.max(da, db) / 2) * 40;   // the two strands catch light differently; brighter where they twist
    d[k] = d[k + 1] = shade + knot; d[k + 2] = shade + knot - 6; d[k + 3] = cov * 255;
  }
  g.putImageData(img, 0, 0);
  chainTex = tex(c); return chainTex;
}
// scuffed road paint: white base worn through in patches and along tyre tracks (multiply by the line colour)
export function roadPaintTexture(seed = 15) {
  const N = 256, r = rng(seed), [c, g] = cv(N), n = valueNoise(N, [4, 16, 48], seed);
  const img = g.createImageData(N, N), d = img.data;
  for (let i = 0; i < N * N; i++) {
    const v = n[i], worn = v < 0.34 ? 0.62 : v < 0.42 ? 0.62 + (v - 0.34) / 0.08 * 0.38 : 1;   // patches where the asphalt shows through
    const f = worn * (0.9 + r() * 0.1);
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 255 * f; d[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  for (let k = 0; k < 60; k++) { g.fillStyle = `rgba(40,40,40,${0.2 + r() * 0.3})`; g.fillRect(r() * N, r() * N, 1 + r() * 3, 1 + r() * 2); }   // grit pressed into the paint
  return tex(c);
}
export function woodFloorTexture(seed = 5) {
  const N = 512, r = rng(seed);
  const [c, g] = cv(N);
  const pw = N / 8;   // 8 boards per tile
  const hh = new Float32Array(N * N).fill(1);   // relief: boards up, the seams between them sunk
  const seam = (x0, y0, w, h) => { for (let j = Math.max(0, y0 | 0); j < Math.min(N, Math.ceil(y0 + h)); j++) for (let i = Math.max(0, x0 | 0); i < Math.min(N, Math.ceil(x0 + w)); i++) hh[j * N + i] = 0; };
  for (let b = 0; b < 8; b++) {
    const off = r() * N; let y = off;   // stagger the butt joints board to board; boards wrap round the tile so it tiles cleanly
    while (y < off + N - 40) {
      const L = Math.min(120 + r() * 260, off + N - y), v = 0.88 + r() * 0.16;   // gentle board-to-board variation (not a checkerboard)
      const last = off + N - y - L < 40 ? off + N - y : L;   // no slivers: the last board fills to where the first began
      for (const yy of [y, y - N]) {   // drawn twice, so a board crossing the tile edge comes back in at the top
        const q = rng(seed * 997 + (y | 0));
        g.fillStyle = `rgb(${132 * v | 0},${92 * v | 0},${58 * v | 0})`; g.fillRect(b * pw, yy, pw, last);
        for (let k = 0; k < 14; k++) { g.strokeStyle = `rgba(60,36,18,${0.1 + q() * 0.14})`; g.lineWidth = 0.6 + q(); const x = b * pw + 2 + q() * (pw - 4); g.beginPath(); g.moveTo(x, yy); g.bezierCurveTo(x + (q() - 0.5) * 6, yy + last / 3, x + (q() - 0.5) * 6, yy + last * 0.66, x + (q() - 0.5) * 4, yy + last); g.stroke(); }
        if (q() < 0.25) { const kx = b * pw + 8 + q() * (pw - 16), ky = yy + 20 + q() * Math.max(1, last - 40); g.strokeStyle = 'rgba(70,40,20,0.18)'; g.lineWidth = 1; for (let n = 1; n < 4; n++) { g.beginPath(); g.ellipse(kx, ky, n * 1.4, n * 4, 0, 0, 7); g.stroke(); } }   // a small knot
        g.fillStyle = 'rgba(20,10,4,0.5)'; g.fillRect(b * pw, yy, pw, 1.5);
      }
      seam(b * pw, (y % N) - 1, pw, 2); if (y % N < 1) seam(b * pw, N - 1, pw, 1);
      y += last;
    }
    g.fillStyle = 'rgba(20,10,4,0.5)'; g.fillRect(b * pw, 0, 1.5, N);
    seam(b * pw, 0, 2, N);
  }
  grime(g, N, N, seed + 9, 0.12, 0);
  const grain = valueNoise(N, [8, 64], seed + 21);
  for (let i = 0; i < N * N; i++) if (hh[i] > 0) hh[i] = 1 + (grain[i] - 0.5) * 0.04;
  return withNormal(tex(c), hh, 3, N, N);
}
export function carpetTexture(col = [110, 100, 88], seed = 7) {
  const N = 256, r = rng(seed);
  const [c, g] = cv(N);
  paintNoise(g, N, [col.map(x => x * 0.8), col, col.map(x => x * 1.1)], valueNoise(N, [16, 64, 256], seed), 30, r);
  grime(g, N, N, seed + 1, 0.4, 0);
  return withNormal(tex(c), c, 1.2);
}
export function tileTexture(a = '#d8d4cc', b = '#c8c2b8', seed = 9) {
  const N = 256, r = rng(seed);
  const [c, g] = cv(N);
  g.fillStyle = '#8c877e'; g.fillRect(0, 0, N, N);
  const t = N / 4;
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { const v = 0.94 + r() * 0.08; g.fillStyle = (i + j) % 2 ? a : b; g.globalAlpha = v; g.fillRect(i * t + 1.5, j * t + 1.5, t - 3, t - 3); g.globalAlpha = 1; }
  grime(g, N, N, seed + 2, 0.3, 0);
  return withNormal(tex(c), c, 2.5);
}
export function fabricTexture(col = [96, 104, 120], seed = 11) {
  const N = 128, r = rng(seed);
  const [c, g] = cv(N);
  g.fillStyle = `rgb(${col.join(',')})`; g.fillRect(0, 0, N, N);
  for (let y = 0; y < N; y += 2) { g.fillStyle = `rgba(0,0,0,${0.08 + r() * 0.05})`; g.fillRect(0, y, N, 1); }
  for (let x = 0; x < N; x += 2) { g.fillStyle = `rgba(255,255,255,${0.04 + r() * 0.03})`; g.fillRect(x, 0, 1, N); }
  grime(g, N, N, seed, 0.35, 0);
  return withNormal(tex(c), c, 1.0);
}
// kitchen worktop laminate: an almost flat colour with a fine speckle (not the outdoor concrete: no cracks or streaks)
export function laminateTexture(col = [214, 206, 190], seed = 19) {
  const N = 256, r = rng(seed);
  const [c, g] = cv(N);
  paintNoise(g, N, [col.map(x => x * 0.97), col, col.map(x => Math.min(255, x * 1.03))], valueNoise(N, [4, 16, 64], seed), 3, r);
  for (let k = 0; k < 3000; k++) { const d = r() < 0.6; g.fillStyle = d ? 'rgba(60,50,40,0.06)' : 'rgba(255,255,255,0.06)'; g.fillRect(r() * N | 0, r() * N | 0, 1, 1); }
  return tex(c);
}
// a book spine (64 x 256, upright): cloth/paper colour, two gilt or black bands, a pale title label, worn edges
const BOOK_COLS = [[122, 40, 36], [38, 62, 96], [44, 78, 54], [138, 108, 52], [70, 44, 72], [150, 136, 112], [40, 40, 44], [160, 80, 42], [92, 104, 112], [116, 34, 52]];
export function bookSpineTexture(seed = 30) {
  const W = 64, H = 256, r = rng(seed * 7 + 3), [c, g] = cv(W, H);
  const base = BOOK_COLS[seed % BOOK_COLS.length].map(x => x * (0.85 + r() * 0.25));
  const avg = (base[0] + base[1] + base[2]) / 3, col = base.map(x => Math.min(255, avg + (x - avg) * 0.8) | 0);   // ~20% less saturated
  g.fillStyle = `rgb(${col.join(',')})`; g.fillRect(0, 0, W, H);
  // the rounded spine catches light in the middle, darker at both edges
  const sh = g.createLinearGradient(0, 0, W, 0); sh.addColorStop(0, 'rgba(0,0,0,0.3)'); sh.addColorStop(0.35, 'rgba(255,255,255,0.06)'); sh.addColorStop(0.6, 'rgba(255,255,255,0.03)'); sh.addColorStop(1, 'rgba(0,0,0,0.32)');
  g.fillStyle = sh; g.fillRect(0, 0, W, H);
  const gold = r() < 0.6, band = gold ? 'rgba(200,164,84,0.9)' : 'rgba(16,14,12,0.75)';
  for (const f of [0.15, 0.8]) { const y = H * f; g.fillStyle = band; g.fillRect(3, y, W - 6, 4); g.fillRect(3, y + 7, W - 6, 1.5); }
  // the title label: a pale block with a few dark "letters"
  const ly = H * 0.36, lh = H * 0.26, lx = 12, lw = W - 24;
  if (r() < 0.55) { g.fillStyle = 'rgba(232,222,196,0.88)'; g.fillRect(lx, ly, lw, lh); g.fillStyle = 'rgba(30,26,22,0.7)'; }
  else g.fillStyle = gold ? 'rgba(210,176,96,0.85)' : 'rgba(235,228,210,0.75)';
  for (let y = ly + 8; y < ly + lh - 8; y += 9) g.fillRect(W / 2 - 3 - (r() < 0.3 ? 1 : 0), y, 6, 6);
  g.fillRect(lx + 6, ly + lh + 14, lw - 12, 3);   // the author line
  grime(g, W, H, seed + 61, 0.1, 0);
  // scuffed corners
  g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(0, 0, W, 2); g.fillRect(0, H - 2, W, 2);
  return tex(c, { repeat: false });
}
// a dried blood pool / splatter decal (alpha)
export function bloodTexture(seed = 1) {
  const N = 256, r = rng(seed);
  const [c, g] = cv(N);
  const blob = (x, y, s, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, s); gr.addColorStop(0, `rgba(48,4,3,${a})`); gr.addColorStop(0.7, `rgba(62,7,5,${a * 0.85})`); gr.addColorStop(1, 'rgba(70,8,5,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, s, 0, 7); g.fill(); };
  for (let k = 0; k < 7; k++) blob(N / 2 + (r() - 0.5) * 60, N / 2 + (r() - 0.5) * 60, 20 + r() * 40, 0.9);
  for (let k = 0; k < 40; k++) { const a = r() * 6.28, d = 50 + r() * 70; blob(N / 2 + Math.cos(a) * d, N / 2 + Math.sin(a) * d, 2 + r() * 7, 0.85); }
  for (let k = 0; k < 6; k++) { const a = r() * 6.28; g.strokeStyle = 'rgba(80,8,5,0.8)'; g.lineWidth = 2 + r() * 3; g.beginPath(); g.moveTo(N / 2, N / 2); g.lineTo(N / 2 + Math.cos(a) * (60 + r() * 50), N / 2 + Math.sin(a) * (60 + r() * 50)); g.stroke(); }
  return tex(c, { repeat: false });
}
// car paint with dust and rust spots
export function carPaintTexture(col, seed = 3) {
  const N = 256, r = rng(seed);
  const [c, g] = cv(N);
  g.fillStyle = col; g.fillRect(0, 0, N, N);
  grime(g, N, N, seed, 0.35, 0);
  for (let k = 0; k < 20; k++) { g.fillStyle = `rgba(110,60,30,${r() * 0.5})`; g.beginPath(); g.arc(r() * N, N * 0.6 + r() * N * 0.4, 1 + r() * 4, 0, 7); g.fill(); }
  return tex(c);
}
export function labelTexture(lines, bg, fg, w = 256, h = 128, font = 'bold 40px Helvetica') {
  const [c, g] = cv(w, h);
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  const step = h / (lines.length + 0.5), lineH = lines.length === 1 ? h * 0.8 : step * 0.95;
  lines.forEach((l, i) => fitText(g, l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * step, font, w * 0.9, lineH));
  return tex(c, { repeat: false });
}
// a clump of leaves (alpha-tested): hundreds of small leaves in mixed greens, a few gone yellow
export function leafTexture(seed = 3, palette = 'oak') {
  const N = 256, r = rng(seed);
  const [c, g] = cv(N);
  g.clearRect(0, 0, N, N);
  const cols = palette === 'pine' ? [[34, 52, 30], [44, 64, 36], [28, 44, 26], [52, 70, 40]] : palette === 'hedge' ? [[42, 62, 26], [54, 76, 32], [36, 52, 22], [64, 84, 36]] : [[62, 90, 36], [78, 106, 42], [50, 76, 32], [94, 116, 48], [124, 124, 56], [104, 128, 50]];
  const n = palette === 'pine' ? 1800 : 1300;
  // leaves grow in sprays: most sit in a few dense clusters (solid cover, darker in the middle) with gaps of sky between,
  // instead of an even sprinkle that alpha-tests into salt-and-pepper stipple. Drawn wrapped so the clump meshes tile seamlessly.
  const CL = []; for (let k = 0; k < 11; k++) CL.push([r() * N, r() * N, N * (0.12 + r() * 0.08)]);
  const gauss = () => (r() + r() + r() - 1.5) / 1.5;
  for (let k = 0; k < n; k++) {
    let x, y, depth = 1;
    if (r() < 0.88) { const [cx, cy, sp] = CL[(r() * CL.length) | 0], ox = gauss(), oy = gauss(); x = cx + ox * sp * 1.6; y = cy + oy * sp * 1.6; depth = Math.min(1, Math.hypot(ox, oy)); }
    else { x = r() * N; y = r() * N; }
    x = ((x % N) + N) % N; y = ((y % N) + N) % N;
    const a = r() * 6.28, v = (0.62 + depth * 0.18) + r() * 0.4, col = cols[Math.floor(r() * cols.length)];
    const rx = 3.2 + r() * 2.5, ry = 1.6 + r() * 1.2, fill = `rgb(${col[0] * v | 0},${col[1] * v | 0},${col[2] * v | 0})`;
    for (const dx of x < 10 ? [0, N] : x > N - 10 ? [0, -N] : [0]) for (const dy of y < 10 ? [0, N] : y > N - 10 ? [0, -N] : [0]) {
      g.fillStyle = fill; g.save(); g.translate(x + dx, y + dy); g.rotate(a);
      if (palette === 'pine') g.fillRect(-0.8, -6, 1.6, 12);
      else { g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, 7); g.fill(); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(-3, -0.2, 6, 0.4); }
      g.restore();
    }
  }
  return tex(c);
}
// spray paint on a wall: a message in a hurried hand, drips running down (alpha)
export function sprayTexture(lines, col = '#b01810', seed = 1, w = 512, h = 256) {
  const r = rng(seed); const [c, g] = cv(w, h);
  g.clearRect(0, 0, w, h);
  g.fillStyle = col; g.strokeStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle';
  const fs = Math.min(h / lines.length * 0.72, w / Math.max(...lines.map(l => l.length)) * 1.45);
  g.font = `bold ${fs}px "Marker Felt", "Comic Sans MS", Impact, sans-serif`;
  { const wide = lines.reduce((a, l) => g.measureText(l).width > g.measureText(a).width ? l : a, ''); fitFont(g, wide, g.font, w * 0.92); }   // the font may be wider than the guess: never cut a word off
  lines.forEach((l, i) => {
    const y = h / 2 + (i - (lines.length - 1) / 2) * fs * 1.05;
    g.save(); g.translate(w / 2, y); g.rotate((r() - 0.5) * 0.08);
    for (let k = 0; k < 3; k++) { g.globalAlpha = 0.35 + k * 0.25; g.fillText(l, (r() - 0.5) * 3, (r() - 0.5) * 3); }
    g.restore();
  });
  // drips and overspray
  const id = g.getImageData(0, 0, w, h), d = id.data;
  for (let k = 0; k < 40; k++) { const x = (r() * w) | 0, y = (h * 0.2 + r() * h * 0.6) | 0; if (d[(y * w + x) * 4 + 3] < 120) continue; const L = 10 + r() * 50; g.globalAlpha = 0.8; g.fillRect(x, y, 2 + r() * 2, L); }
  g.globalAlpha = 0.06; for (let k = 0; k < 600; k++) { g.beginPath(); g.arc(r() * w, r() * h, 1 + r() * 2, 0, 7); g.fill(); }
  g.globalAlpha = 1;
  return tex(c, { repeat: false });
}
// the search-and-rescue X: date top, team left, hazards right, dead bottom
export function femaTexture(seed = 2) {
  const r = rng(seed); const [c, g] = cv(256);
  g.clearRect(0, 0, 256, 256);
  g.strokeStyle = '#e8501a'; g.fillStyle = '#e8501a'; g.lineWidth = 9; g.lineCap = 'round';
  g.beginPath(); g.moveTo(40, 40); g.lineTo(216, 216); g.moveTo(216, 40); g.lineTo(40, 216); g.stroke();
  g.font = 'bold 30px Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('11/3', 128, 52); g.fillText('NG' + (1 + (r() * 9 | 0)), 60, 128); g.fillText(r() < 0.5 ? 'BIO' : 'NE', 196, 128); g.fillText(String(r() < 0.4 ? 0 : 1 + (r() * 4 | 0)), 128, 208);
  return tex(c, { repeat: false });
}
export function handprintTexture(seed = 3) {
  const r = rng(seed); const [c, g] = cv(256);
  g.clearRect(0, 0, 256, 256);
  for (let k = 0; k < 3; k++) {
    const x = 50 + r() * 150, y = 60 + r() * 120, a = (r() - 0.5) * 0.8;
    g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = `rgba(${70 + r() * 30 | 0},6,4,0.85)`;
    g.beginPath(); g.ellipse(0, 18, 20, 24, 0, 0, 7); g.fill();
    for (let f = 0; f < 4; f++) { g.beginPath(); g.ellipse(-15 + f * 10, -16 - (f === 1 || f === 2 ? 6 : 0), 4.5, 15, (f - 1.5) * 0.08, 0, 7); g.fill(); }
    g.beginPath(); g.ellipse(24, 8, 4.5, 12, -0.9, 0, 7); g.fill();
    g.fillRect(-12, 30, 4, 40 + r() * 50); g.fillRect(6, 34, 3, 30 + r() * 40);   // dragged down the wall
    g.restore();
  }
  return tex(c, { repeat: false });
}
// fallen leaves on the ground (alpha): dry browns and yellows
export function leafLitterTexture(seed = 4) {
  const r = rng(seed); const [c, g] = cv(256);
  g.clearRect(0, 0, 256, 256);
  for (let k = 0; k < 520; k++) {
    const d = Math.sqrt(r()) * 120, a = r() * 6.28, x = 128 + Math.cos(a) * d, y = 128 + Math.sin(a) * d;
    const col = [[120, 72, 30], [150, 100, 40], [96, 60, 30], [170, 130, 50], [80, 70, 40]][(r() * 5) | 0], v = 0.7 + r() * 0.4;
    g.fillStyle = `rgba(${col[0] * v | 0},${col[1] * v | 0},${col[2] * v | 0},${0.9 - d / 200})`;
    g.save(); g.translate(x, y); g.rotate(r() * 6.28); g.beginPath(); g.ellipse(0, 0, 4 + r() * 4, 2 + r() * 2, 0, 0, 7); g.fill(); g.restore();
  }
  return tex(c, { repeat: false });
}
// a sheet of paper / a flyer
export function paperTexture(seed = 5) {
  const r = rng(seed); const [c, g] = cv(128, 160);
  g.fillStyle = '#dcd6c6'; g.fillRect(0, 0, 128, 160);
  g.fillStyle = 'rgba(40,40,40,0.55)'; for (let y = 18; y < 150; y += 9) g.fillRect(12, y, 50 + r() * 54, 3);
  g.fillStyle = 'rgba(120,90,50,0.25)'; g.beginPath(); g.arc(r() * 128, r() * 160, 20 + r() * 20, 0, 7); g.fill();
  return tex(c, { repeat: false });
}

// a printed product label (cans wrap it round, boxes and bags show it on the front)
const BRANDS = {
  can: [['BAKED', 'BEANS', '#a8321e', '#f4e6c0'], ['TOMATO', 'SOUP', '#c81e1e', '#ffffff'], ['SWEET', 'CORN', '#e8c21a', '#1e5a1e'], ['GARDEN', 'PEAS', '#2e7a2e', '#f4f0d8'], ['CHICKEN', 'NOODLE', '#d8c890', '#a01810'], ['PEACHES', 'IN SYRUP', '#f0902a', '#5a2a0a'], ['TUNA', 'CHUNK', '#1e4a8a', '#f4f4f4'], ['CHILI', 'CON CARNE', '#5a1a10', '#f0c040']],
  box: [['CORN', 'FLAKES', '#f0c020', '#b01810'], ['OATY', "O's", '#e8d8a0', '#2050a0'], ['MAPLE', 'CRUNCH', '#8a3a10', '#f8e0a0'], ['RICE', 'POPS', '#2a7ad0', '#ffffff'], ['BRAN', 'FLAKES', '#6a4a2a', '#f0e8d0'], ['CHOCO', 'BITES', '#3a1a10', '#f0a040'], ['PANCAKE', 'MIX', '#e8e0c8', '#c03018'], ['MAC &', 'CHEESE', '#2a5ad0', '#f8d020']],
  bottle: [['COLA', 'CLASSIC', '#b8141c', '#ffffff'], ['ORANGE', 'SODA', '#f07a10', '#ffffff'], ['LEMON', 'LIME', '#2a9a3a', '#f8f060'], ['SPRING', 'WATER', '#e8f2fa', '#2060b0'], ['ICED', 'TEA', '#e8c060', '#6a2a0a'], ['VOLT', 'ENERGY', '#141414', '#9af020']],
  chips: [['POTATO', 'CHIPS', '#e8c020', '#c01818'], ['SALT &', 'VINEGAR', '#2a8ad8', '#ffffff'], ['SOUR', 'CREAM', '#2a9a4a', '#ffffff'], ['BBQ', 'RIDGES', '#8a2a1a', '#f8d040'], ['CHEESE', 'PUFFS', '#f08a20', '#ffffff']],
};
// per-brand cap colour, liquid colour and liquid opacity for the cooler bottles (same order as BRANDS.bottle)
export const BOTTLE_BRANDS = [
  { name: 'cola', cap: 0xc81c1c, liquid: 0x3a1a0a, opacity: 0.88 },
  { name: 'orange', cap: 0xf08a20, liquid: 0xe07010, opacity: 0.8 },
  { name: 'lemon-lime', cap: 0x2a8a3a, liquid: 0xd8f0a0, opacity: 0.45 },
  { name: 'water', cap: 0x2a6ac8, liquid: 0xd8e8f0, opacity: 0.5 },
  { name: 'iced tea', cap: 0xe8c040, liquid: 0x8a4a14, opacity: 0.8 },
  { name: 'energy', cap: 0x181818, liquid: 0xc8e040, opacity: 0.75 },
];
const labelCache = new Map();
export function productTexture(kind, i) {
  const key = kind + i; if (labelCache.has(key)) return labelCache.get(key);
  const L = BRANDS[kind][i % BRANDS[kind].length], W = kind === 'can' || kind === 'bottle' ? 256 : 128, H = kind === 'bottle' ? 64 : 128;
  if (kind === 'bottle') {   // a wrap-around label band: two logos round the bottle, a stripe, small print
    const [c, g] = cv(W, H);
    g.fillStyle = L[2]; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(0, H * 0.78, W, H * 0.08); g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, H * 0.06, W, H * 0.05);
    g.fillStyle = L[3]; g.textAlign = 'center';
    for (let q = 0; q < 2; q++) { const cx = (q + 0.5) * W / 2; fitText(g, L[0], cx, H * 0.48, 'bold italic 22px Helvetica', W / 2 - 30); fitText(g, L[1], cx, H * 0.72, 'bold 13px Helvetica', W / 2 - 30); }
    g.font = '7px Helvetica'; g.globalAlpha = 0.6; g.fillText('500 mL  ·  NUTRITION FACTS', W * 0.5, H * 0.96); g.fillText('▮▯▮▮▯▮▯▮', W * 0.97, H * 0.5); g.globalAlpha = 1;
    const t = tex(c); t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; labelCache.set(key, t); return t;
  }
  const [c, g] = cv(W, H);
  g.fillStyle = L[2]; g.fillRect(0, 0, W, H);
  // a band, a logo blob, the words
  g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(0, H * 0.62, W, H * 0.1);
  g.fillStyle = L[3]; g.textAlign = 'center';
  const reps = kind === 'can' ? 2 : 1;
  for (let r = 0; r < reps; r++) {
    const cx = (r + 0.5) * W / reps;
    fitText(g, L[0], cx, H * 0.34, `bold ${kind === 'can' ? 26 : 22}px Helvetica`, W / reps - 12);
    fitText(g, L[1], cx, H * 0.58, `bold ${kind === 'can' ? 30 : 24}px Helvetica`, W / reps - 12);
    g.beginPath(); g.arc(cx, H * 0.84, 9, 0, 7); g.fill();
  }
  if (kind === 'chips') { g.fillStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.ellipse(W * 0.5, H * 0.85, W * 0.3, 8, 0, 0, 7); g.fill(); }
  const t = tex(c); t.wrapS = t.wrapT = 1001; labelCache.set(key, t); return t;
}
// a corrugated-plastic yard sign: a big word, a small line under it, a border, a little weathering
export function yardSignTexture(big, small, bg = '#b21d1d', fg = '#ffffff', seed = 7) {
  const W = 256, H = 192, r = rng(seed);
  const [c, g] = cv(W, H);
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(10, 10, W - 20, H - 20);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  let fs = 64; g.font = `bold ${fs}px Helvetica, Arial`; while (g.measureText(big).width > W - 40 && fs > 20) { fs -= 2; g.font = `bold ${fs}px Helvetica, Arial`; }
  g.fillText(big, W / 2, H * 0.42);
  fs = 22; g.font = `bold ${fs}px Helvetica, Arial`; while (g.measureText(small).width > W - 40 && fs > 10) { fs -= 1; g.font = `bold ${fs}px Helvetica, Arial`; }
  g.fillText(small, W / 2, H * 0.72);
  for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${0.03 + r() * 0.05})`; g.fillRect(r() * W, r() * H, 1 + r() * 3, 1 + r() * 3); }
  for (let x = 0; x < W; x += 4) { g.fillStyle = 'rgba(0,0,0,0.03)'; g.fillRect(x, 0, 1, H); }   // the flutes of the corrugated plastic
  return tex(c, { repeat: false });
}

// desert ground: wind-rippled pale sand with darker grit and the odd pebble (lazily made, one per page)
let _sand = null;
export function sandTexture() {
  if (_sand) return _sand;
  const N = 512, r = rng(23), [c, g] = cv(N);
  paintNoise(g, N, [[168, 140, 100], [188, 160, 116], [204, 178, 132], [218, 194, 150]], valueNoise(N, [4, 16, 64], 29), 12, r);
  for (let y = 0; y < N; y += 3) { g.strokeStyle = `rgba(120,96,64,${0.04 + r() * 0.05})`; g.lineWidth = 1; g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= N; x += 16) g.lineTo(x, y + Math.sin(x * 0.05 + y * 0.31) * 2.2); g.stroke(); }
  for (let k = 0; k < 1400; k++) { const v = 90 + r() * 90 | 0; g.fillStyle = `rgba(${v},${v - 14},${v - 30},${0.3 + r() * 0.4})`; g.fillRect(r() * N, r() * N, 1 + r() * 1.5, 1 + r() * 1.5); }
  for (let k = 0; k < 120; k++) { const x = r() * N, y = r() * N, s = 1 + r() * 2.2; g.fillStyle = 'rgba(40,30,20,0.3)'; g.beginPath(); g.ellipse(x + 0.6, y + 0.8, s, s * 0.6, 0, 0, 7); g.fill(); g.fillStyle = `rgba(${150 + r() * 60 | 0},${130 + r() * 50 | 0},${100 + r() * 40 | 0},0.9)`; g.beginPath(); g.ellipse(x, y, s, s * 0.7, r() * 3, 0, 7); g.fill(); }
  return (_sand = tex(c));
}

// ================================================================ interior design pass (Maple Hollow houses, store)
// Every generator below is cached by its arguments (one texture per look, shared by every house) and is 512 px or
// smaller. Height fields go through withNormal (desktop only), so phones pay for the colour map alone.
const DCACHE = new Map();
const once = (key, fn) => { if (!DCACHE.has(key)) DCACHE.set(key, fn()); return DCACHE.get(key); };
const rgb = (c, f = 1, a = 1) => `rgba(${Math.min(255, c[0] * f) | 0},${Math.min(255, c[1] * f) | 0},${Math.min(255, c[2] * f) | 0},${a})`;
// draw flowing wood grain into a rect (vertical grain), with an optional knot pushing the lines aside
function woodGrain(g, x0, y0, w, h, col, r, { lines = 0.5, knots = 0, contrast = 1, horizontal = false } = {}) {
  g.save(); g.beginPath(); g.rect(x0, y0, w, h); g.clip();
  if (horizontal) { g.translate(x0 + w, y0); g.rotate(Math.PI / 2); [w, h] = [h, w]; x0 = 0; y0 = 0; }
  g.fillStyle = rgb(col); g.fillRect(x0, y0, w, h);
  const ks = []; for (let k = 0; k < knots; k++) ks.push([x0 + w * (0.2 + r() * 0.6), y0 + h * (0.15 + r() * 0.7), 3 + r() * 5]);
  // soft wide bands (early/late wood), then thin dark grain lines bending round the knots
  const n = Math.max(6, (w * lines) | 0);
  for (let i = 0; i < n; i++) {
    const bx = x0 + (i + r() * 0.8) / n * w, dark = r() < 0.5;
    g.strokeStyle = dark ? `rgba(70,40,18,${(0.05 + r() * 0.12) * contrast})` : `rgba(255,236,200,${(0.03 + r() * 0.05) * contrast})`;
    g.lineWidth = dark ? 0.6 + r() * 1.4 : 1 + r() * 3;
    g.beginPath();
    const ph = r() * 6, amp = 0.6 + r() * 1.6;
    for (let y = y0 - 4; y <= y0 + h + 4; y += 4) {
      let x = bx + Math.sin(y * 0.02 + ph) * amp + Math.sin(y * 0.071 + ph * 2) * amp * 0.4;
      for (const [kx, ky, kr] of ks) { const dy = (y - ky) / (kr * 3.2), dx = x - kx; const push = Math.exp(-dy * dy) * kr * 2.6 / (1 + Math.abs(dx) / (kr * 2)); x += Math.sign(dx || 1) * push; }
      y === y0 - 4 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.stroke();
  }
  for (const [kx, ky, kr] of ks) {   // the knot itself: a dark eye with rings round it
    const gr = g.createRadialGradient(kx, ky, 0, kx, ky, kr * 1.6); gr.addColorStop(0, `rgba(50,24,8,${0.75 * contrast})`); gr.addColorStop(0.5, `rgba(80,44,18,${0.45 * contrast})`); gr.addColorStop(1, 'rgba(80,44,18,0)');
    g.fillStyle = gr; g.beginPath(); g.ellipse(kx, ky, kr * 1.1, kr * 1.7, 0, 0, 7); g.fill();
    g.strokeStyle = `rgba(60,30,10,${0.22 * contrast})`; g.lineWidth = 0.8; for (let q = 1; q < 5; q++) { g.beginPath(); g.ellipse(kx, ky, kr * (1 + q * 0.5), kr * (1.6 + q * 1.1), 0, 0, 7); g.stroke(); }
  }
  for (let k = 0; k < w * h / 60; k++) { g.fillStyle = `rgba(40,20,8,${0.05 + r() * 0.08})`; g.fillRect(x0 + r() * w, y0 + r() * h, 1, 1 + r() * 3); }   // pores
  g.restore();
}
// solid wood with a clear grain and knots (tables, chairs, legs, the dresser, the bookshelf): one tile = 1 m
export function woodGrainTexture(col = [128, 88, 58], seed = 14) {
  return once('wood' + col + seed, () => {
    const N = 512, r = rng(seed), [c, g] = cv(N);
    woodGrain(g, 0, 0, N, N, col, r, { lines: 0.22, knots: 3, contrast: 1.2 });
    // a few board joints (a glued-up top): faint vertical seams
    for (const x of [N * 0.25, N * 0.62]) { g.fillStyle = 'rgba(40,20,8,0.18)'; g.fillRect(x | 0, 0, 1, N); }
    return withNormal(tex(c), c, 0.8);
  });
}
// a cupboard door / drawer front painted or stained, with real panel moulding:
//  style 'shaker' (frame + flat recessed panel), 'raised' (bevelled raised panel), 'louvre' (closet slats),
//  'drawer' (slab with a routed edge), 'slab'. The face is UV-mapped 0..1 (RoundedBox), so `aspect` (w/h) keeps
//  the frame the same width on wide and tall doors.
export function cabinetDoorTexture(style = 'shaker', col = [226, 214, 190], aspect = 1, painted = true, seed = 3) {
  const a = Math.round(aspect * 4) / 4;
  return once('door' + style + col + a + painted + seed, () => {
    const H = a < 0.75 ? 512 : 256, W = Math.max(64, Math.min(512, Math.round(H * a / 32) * 32)), r = rng(seed), [c, g] = cv(W, H);
    const hc = document.createElement('canvas'); hc.width = W; hc.height = H; const hg = hc.getContext('2d');   // height field (white = proud)
    const fill = (x, y, w, h) => painted ? (g.fillStyle = rgb(col), g.fillRect(x, y, w, h), (() => { for (let k = 0; k < w * h / 25; k++) { g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},0.025)`; g.fillRect(x + r() * w, y + r() * h, 1 + r() * 3, 1); } })()) : woodGrain(g, x, y, w, h, col, r, { lines: 0.3, knots: r() < 0.4 ? 1 : 0, contrast: 1 });
    fill(0, 0, W, H); hg.fillStyle = '#bbb'; hg.fillRect(0, 0, W, H);
    const px = H / 0.75 * 0.065 / (H / 256 * 1.33);   // ~6.5 cm stiles at a 0.75 m door
    const fr = Math.max(10, Math.min(W, H) * 0.14), e = 3;
    const bevel = (x, y, w, h, inset, light = 1) => {   // a recessed groove round a rectangle: dark top/left, light bottom/right
      g.lineWidth = inset; g.strokeStyle = `rgba(0,0,0,${0.28 * light})`; g.beginPath(); g.moveTo(x, y + h); g.lineTo(x, y); g.lineTo(x + w, y); g.stroke();
      g.strokeStyle = `rgba(255,255,255,${0.22 * light})`; g.beginPath(); g.moveTo(x + w, y); g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.stroke();
      hg.lineWidth = inset; hg.strokeStyle = '#222'; hg.strokeRect(x, y, w, h);
    };
    // the routed outer edge every door has
    g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 2; g.strokeRect(1, 1, W - 2, H - 2); g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1.5; g.strokeRect(e, e, W - 2 * e, H - 2 * e);
    if (style === 'shaker' || style === 'raised') {
      const x = fr, y = fr, w = W - 2 * fr, h = H - 2 * fr;
      if (!painted) { woodGrain(g, x, y, w, h, col.map(v => v * 0.96), r, { lines: 0.35, contrast: 0.9 }); }   // a panel of its own wood
      // the stiles run the full height: a faint joint where the rails meet them
      g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(fr - 1, 0, 1, fr); g.fillRect(W - fr, 0, 1, fr); g.fillRect(fr - 1, H - fr, 1, fr); g.fillRect(W - fr, H - fr, 1, fr);
      hg.fillStyle = style === 'raised' ? '#ddd' : '#555'; hg.fillRect(x, y, w, h);
      bevel(x, y, w, h, 3);
      if (style === 'raised') {   // the bevelled field: a lighter inner flat with sloped edges
        const b = Math.min(w, h) * 0.12; g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(x + b, y + b, w - 2 * b, h - 2 * b);
        g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 1; g.beginPath(); for (const [p, q] of [[[x, y], [x + b, y + b]], [[x + w, y], [x + w - b, y + b]], [[x, y + h], [x + b, y + h - b]], [[x + w, y + h], [x + w - b, y + h - b]]]) { g.moveTo(...p); g.lineTo(...q); } g.stroke();
        g.strokeStyle = 'rgba(0,0,0,0.15)'; g.strokeRect(x + b, y + b, w - 2 * b, h - 2 * b);
        const gr = hg.createLinearGradient(0, 0, 0, 1); hg.fillStyle = '#fff'; hg.fillRect(x + b, y + b, w - 2 * b, h - 2 * b); hg.strokeStyle = '#999'; hg.lineWidth = b * 0.8; hg.strokeRect(x + b * 0.45, y + b * 0.45, w - b * 0.9, h - b * 0.9);
      } else { g.fillStyle = 'rgba(0,0,0,0.05)'; g.fillRect(x, y, w, h); }
    } else if (style === 'louvre') {   // a closet door: stiles and rails framing two banks of slanted slats
      const x = fr * 0.9, w = W - 2 * fr * 0.9, mid = H * 0.5, banks = [[fr, mid - fr * 0.4], [mid + fr * 0.4, H - fr]];
      for (const [ya, yb] of banks) {
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, ya, w, yb - ya); hg.fillStyle = '#333'; hg.fillRect(x, ya, w, yb - ya);
        const sp = Math.max(7, H / 46);
        for (let y = ya + 1; y < yb - sp * 0.4; y += sp) {
          const gr = g.createLinearGradient(0, y, 0, y + sp * 0.85); gr.addColorStop(0, rgb(col, 1.08)); gr.addColorStop(0.75, rgb(col, 0.92)); gr.addColorStop(1, rgb(col, 0.6));
          g.fillStyle = gr; g.fillRect(x, y, w, sp * 0.85); const hgr = hg.createLinearGradient(0, y, 0, y + sp * 0.85); hgr.addColorStop(0, '#fff'); hgr.addColorStop(1, '#777'); hg.fillStyle = hgr; hg.fillRect(x, y, w, sp * 0.85);
        }
        bevel(x, ya, w, yb - ya, 2, 0.8);
      }
    } else if (style === 'drawer') {   // a slab drawer front: a routed groove a little in from the edge
      const m = Math.min(W, H) * 0.12; bevel(m, m, W - 2 * m, H - 2 * m, 2, 0.9);
    }
    // wear: the painted edges rub through a touch near where hands go; a bit of grime at the bottom
    if (painted) for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(150,120,90,${0.04 + r() * 0.05})`; g.fillRect(r() < 0.5 ? r() * 4 : W - r() * 4, r() * H, 1, 2 + r() * 6); }
    const gb = g.createLinearGradient(0, H * 0.8, 0, H); gb.addColorStop(0, 'rgba(60,50,40,0)'); gb.addColorStop(1, 'rgba(60,50,40,0.1)'); g.fillStyle = gb; g.fillRect(0, H * 0.8, W, H * 0.2);
    const t = tex(c, { repeat: false }); if (!isLow()) t.userData.normal = normalFromHeight(hc, 2.2); return t;
  });
}
// a stone/composite worktop: 'granite' (salt-and-pepper speckle), 'butcher' (end-joined maple strips), 'laminate'
// (a speckled formica with a faint pattern), 'marble' (white with grey veins). One tile = 1.5 m.
export function counterTexture(kind = 'granite', seed = 21) {
  return once('ctr' + kind + seed, () => {
    const N = 512, r = rng(seed), [c, g] = cv(N);
    if (kind === 'granite') {
      paintNoise(g, N, [[54, 52, 50], [92, 88, 84], [70, 66, 62], [120, 112, 104]], valueNoise(N, [8, 32, 128], seed), 26, r);
      for (let k = 0; k < 9000; k++) { const s = r(), v = s < 0.45 ? 20 + r() * 30 : s < 0.8 ? 170 + r() * 70 : 0; g.fillStyle = s < 0.8 ? `rgba(${v},${v},${v - 4},${0.5 + r() * 0.5})` : `rgba(${140 + r() * 60 | 0},${70 + r() * 30 | 0},${50 + r() * 20 | 0},0.7)`; g.beginPath(); g.ellipse(r() * N, r() * N, 0.6 + r() * 2.4, 0.5 + r() * 1.6, r() * 3, 0, 7); g.fill(); }
      for (let k = 0; k < 600; k++) { g.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.4})`; g.fillRect(r() * N, r() * N, 1, 1); }   // mica glints
    } else if (kind === 'butcher') {
      const sw = N / 12;
      for (let i = 0; i < 12; i++) { let y = -r() * 200; while (y < N) { const L = 120 + r() * 260, v = 0.86 + r() * 0.26; woodGrain(g, i * sw, y, sw, L, [196 * v, 150 * v, 98 * v], r, { lines: 0.25, contrast: 0.9, knots: 0 }); g.fillStyle = 'rgba(60,30,10,0.35)'; g.fillRect(i * sw, y, sw, 1.5); y += L; } g.fillStyle = 'rgba(60,30,10,0.3)'; g.fillRect(i * sw, 0, 1.2, N); }
      for (let k = 0; k < 30; k++) { g.strokeStyle = `rgba(60,36,20,${0.08 + r() * 0.1})`; g.lineWidth = 0.6; const x = r() * N, y = r() * N, a = r() * 3; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 30, y + Math.sin(a) * 30); g.stroke(); }   // knife marks
    } else if (kind === 'marble') {
      paintNoise(g, N, [[226, 224, 220], [238, 236, 232], [246, 245, 242]], valueNoise(N, [4, 16], seed), 4, r);
      for (let k = 0; k < 14; k++) { g.strokeStyle = `rgba(110,110,116,${0.12 + r() * 0.25})`; g.lineWidth = 0.6 + r() * 2.2; let x = r() * N, y = r() * N, a = r() * 6; g.beginPath(); g.moveTo(x, y); for (let s = 0; s < 40; s++) { a += (r() - 0.5) * 0.6; x += Math.cos(a) * 9; y += Math.sin(a) * 9; g.lineTo(x, y); } g.stroke(); }
    } else {   // laminate: a warm speckled formica
      paintNoise(g, N, [[208, 200, 184], [218, 210, 194], [226, 220, 204]], valueNoise(N, [4, 16, 64], seed), 5, r);
      for (let k = 0; k < 7000; k++) { const d = r(); g.fillStyle = d < 0.5 ? 'rgba(90,70,50,0.22)' : d < 0.8 ? 'rgba(150,120,90,0.18)' : 'rgba(255,255,255,0.35)'; g.fillRect(r() * N, r() * N, 1 + r(), 1 + r()); }
    }
    return withNormal(tex(c), c, kind === 'butcher' ? 0.8 : 0.35);
  });
}
// brushed stainless: fine horizontal streaks over a soft cloudy sheen (fridges, the stove, the store's coolers)
export function brushedSteelTexture(seed = 31, vertical = false) {
  return once('steel' + seed + vertical, () => {
    const N = 256, r = rng(seed), [c, g] = cv(N);
    paintNoise(g, N, [[176, 178, 180], [196, 198, 200], [214, 216, 218]], valueNoise(N, [2, 6], seed), 0, r);
    for (let k = 0; k < 1400; k++) { const y = r() * N, v = r() < 0.5 ? 150 + r() * 30 : 225 + r() * 30; g.fillStyle = `rgba(${v},${v},${v + 3},${0.12 + r() * 0.2})`; g.fillRect(r() * N - 40, y, 30 + r() * 220, r() < 0.8 ? 0.6 : 1.2); }
    for (let k = 0; k < 6; k++) { g.fillStyle = 'rgba(120,120,124,0.06)'; g.beginPath(); g.ellipse(r() * N, r() * N, 6 + r() * 10, 4 + r() * 8, 0, 0, 7); g.fill(); }   // a fingerprint smudge or two
    if (vertical) { const [c2, g2] = cv(N); g2.translate(N, 0); g2.rotate(Math.PI / 2); g2.drawImage(c, 0, 0); return tex(c2); }
    return tex(c);
  });
}
// a fridge door (UV 0..1 on the door's face): brushed steel, the freezer split, a badge, an ice dispenser recess
export function fridgeDoorTexture() {
  return once('fridgeDoor', () => {
    const W = 256, H = 512, r = rng(37), [c, g] = cv(W, H);
    g.drawImage(brushedSteelTexture(31).image, 0, 0, W, H / 2); g.drawImage(brushedSteelTexture(31).image, 0, H / 2, W, H / 2);
    const gy = H * 0.36;   // the split between the freezer (top) and the fridge (below)
    g.fillStyle = 'rgba(20,20,22,0.9)'; g.fillRect(0, gy - 2, W, 5); g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(0, gy + 3, W, 1);
    // the dispenser: a dark recess with a paddle, a little display over it
    const dx = W * 0.3, dw = W * 0.4, dy = gy + 26, dh = 110;
    g.fillStyle = '#2a2c30'; g.fillRect(dx, dy, dw, dh); g.fillStyle = '#16181a'; g.fillRect(dx + 8, dy + 30, dw - 16, dh - 40);
    g.fillStyle = '#4a4e54'; g.fillRect(dx + dw / 2 - 10, dy + 34, 20, 40);
    g.fillStyle = '#0e2a3a'; g.fillRect(dx + 10, dy + 6, dw - 20, 16); g.fillStyle = '#6ad0ff'; g.font = 'bold 11px Helvetica'; g.textAlign = 'center'; g.fillText('37°F   ICE', dx + dw / 2, dy + 18);
    g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 1; g.strokeRect(dx + 0.5, dy + 0.5, dw - 1, dh - 1);
    g.fillStyle = 'rgba(40,40,44,0.75)'; g.font = 'bold 14px Helvetica'; g.fillText('FROSTLINE', W / 2, gy - 18);
    // edge shading (rounded door edges), a soft reflection band
    const ed = g.createLinearGradient(0, 0, W, 0); ed.addColorStop(0, 'rgba(0,0,0,0.25)'); ed.addColorStop(0.06, 'rgba(0,0,0,0)'); ed.addColorStop(0.94, 'rgba(0,0,0,0)'); ed.addColorStop(1, 'rgba(0,0,0,0.25)'); g.fillStyle = ed; g.fillRect(0, 0, W, H);
    const rf = g.createLinearGradient(0, 0, W, H * 0.4); rf.addColorStop(0.3, 'rgba(255,255,255,0)'); rf.addColorStop(0.45, 'rgba(255,255,255,0.12)'); rf.addColorStop(0.6, 'rgba(255,255,255,0)'); g.fillStyle = rf; g.fillRect(0, 0, W, H);
    return tex(c, { repeat: false });
  });
}
// the appliance faces in one atlas (one material for all of them):
//   [0, 0.5]x[0.5, 1]  microwave front     [0.5, 1]x[0.5, 1]  oven door window
//   [0, 0.5]x[0.25, 0.5] stove backguard    [0.5, 1]x[0, 0.5]  a TV screen (dark glass with a sheen)
//   [0, 0.5]x[0, 0.25]  dishwasher control strip
export const APPL_UV = { micro: [0, 0.5, 0.5, 1], oven: [0.5, 0.5, 1, 1], panel: [0, 0.25, 0.5, 0.5], tv: [0.5, 0, 1, 0.5], dish: [0, 0, 0.5, 0.25] };
export function applianceAtlas() {
  return once('applAtlas', () => {
    const W = 1024, H = 512, r = rng(41), [c, g] = cv(W, H);
    const steel = brushedSteelTexture(31).image;
    // microwave (0,0)-(512,256): a glass door with the perforated screen, a handle edge, the keypad and clock
    g.fillStyle = '#d8dadc'; g.drawImage(steel, 0, 0, 512, 256);
    g.fillStyle = '#121416'; g.fillRect(14, 16, 340, 224);
    g.fillStyle = '#1e2226'; g.fillRect(34, 34, 300, 188);
    g.fillStyle = 'rgba(80,90,96,0.5)'; for (let y = 38; y < 220; y += 5) for (let x = 38; x < 332; x += 5) g.fillRect(x, y, 2, 2);   // the mesh in the glass
    const sh = g.createLinearGradient(14, 16, 300, 240); sh.addColorStop(0, 'rgba(255,255,255,0.12)'); sh.addColorStop(0.35, 'rgba(255,255,255,0.02)'); sh.addColorStop(0.5, 'rgba(255,255,255,0.1)'); sh.addColorStop(0.55, 'rgba(255,255,255,0)'); g.fillStyle = sh; g.fillRect(14, 16, 340, 224);
    g.fillStyle = '#9a9ea2'; g.fillRect(354, 16, 10, 224);   // the door edge / pull
    g.fillStyle = '#1a1c1e'; g.fillRect(378, 20, 120, 216);   // control panel
    g.fillStyle = '#082a12'; g.fillRect(388, 30, 100, 34); g.fillStyle = '#5aff8a'; g.font = 'bold 26px Courier New, monospace'; g.textAlign = 'center'; g.fillText('12:00', 438, 57);
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '+30', '0', 'STOP'];
    g.font = 'bold 12px Helvetica';
    keys.forEach((k, i) => { const x = 392 + (i % 3) * 32, y = 78 + Math.floor(i / 3) * 30; g.fillStyle = '#34383c'; g.fillRect(x, y, 28, 24); g.fillStyle = '#d8dcdf'; g.fillText(k, x + 14, y + 16); });
    g.fillStyle = '#2a7a3a'; g.fillRect(392, 200, 92, 26); g.fillStyle = '#fff'; g.font = 'bold 14px Helvetica'; g.fillText('START', 438, 218);
    // oven door window (512,0)-(1024,256): a steel frame, a dark glass window with the rack inside, a reflection
    g.drawImage(steel, 512, 0, 512, 256);
    g.fillStyle = '#0c0d0e'; g.fillRect(560, 40, 416, 176); g.fillStyle = '#1a1612'; g.fillRect(572, 52, 392, 152);
    g.strokeStyle = 'rgba(120,110,100,0.35)'; g.lineWidth = 2; for (let x = 580; x < 960; x += 14) { g.beginPath(); g.moveTo(x, 140); g.lineTo(x + 6, 190); g.stroke(); } g.beginPath(); g.moveTo(572, 140); g.lineTo(964, 140); g.stroke();
    const ov = g.createLinearGradient(560, 40, 900, 216); ov.addColorStop(0, 'rgba(255,255,255,0.14)'); ov.addColorStop(0.3, 'rgba(255,255,255,0.03)'); ov.addColorStop(0.42, 'rgba(255,255,255,0.12)'); ov.addColorStop(0.48, 'rgba(255,255,255,0)'); g.fillStyle = ov; g.fillRect(560, 40, 416, 176);
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 3; g.strokeRect(560, 40, 416, 176);
    // stove backguard (0,256)-(512,384): knob dials printed round where the knobs sit, a clock in the middle
    g.drawImage(steel, 0, 256, 512, 128); g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(0, 256, 512, 128);
    g.fillStyle = '#0a0a0a'; g.fillRect(196, 286, 120, 50); g.fillStyle = '#ff6a2a'; g.font = 'bold 30px Courier New, monospace'; g.fillText('10:30', 256, 322);
    g.fillStyle = '#2a2c2e'; g.font = 'bold 10px Helvetica';
    for (const kx of [56, 132, 380, 456]) { g.strokeStyle = 'rgba(30,30,30,0.6)'; g.lineWidth = 2; g.beginPath(); g.arc(kx, 322, 30, Math.PI * 0.75, Math.PI * 2.25); g.stroke(); for (const [a, t] of [[0.75, 'OFF'], [1.25, 'LO'], [1.75, 'MED'], [2.2, 'HI']]) g.fillText(t, kx + Math.cos(a * Math.PI) * 42, 326 + Math.sin(a * Math.PI) * 42); }
    // TV screen (512,256)-(1024,512): dark glass, a faint diagonal sheen and the odd dust speck
    const tv = g.createLinearGradient(512, 256, 1024, 512); tv.addColorStop(0, '#16181c'); tv.addColorStop(0.4, '#0a0b0d'); tv.addColorStop(0.62, '#1c1f24'); tv.addColorStop(0.66, '#0a0b0d'); tv.addColorStop(1, '#060708'); g.fillStyle = tv; g.fillRect(512, 256, 512, 256);
    for (let k = 0; k < 120; k++) { g.fillStyle = `rgba(255,255,255,${0.03 + r() * 0.05})`; g.fillRect(512 + r() * 512, 256 + r() * 256, 1, 1); }
    g.fillStyle = 'rgba(200,210,220,0.35)'; g.font = 'bold 14px Helvetica'; g.fillText('VISTA', 768, 504);
    // dishwasher control strip (0,384)-(512,512)
    g.drawImage(steel, 0, 384, 512, 128); g.fillStyle = '#1c1e20'; g.fillRect(30, 410, 300, 30);
    g.fillStyle = '#5ad0ff'; g.font = 'bold 13px Helvetica'; ['NORMAL', 'HEAVY', 'QUICK', 'RINSE'].forEach((t, i) => g.fillText(t, 70 + i * 74, 430));
    g.fillStyle = '#3a3e42'; g.fillRect(360, 412, 120, 26); g.fillStyle = '#fff'; g.fillText('START', 420, 430);
    g.fillStyle = '#5a5e62'; g.fillRect(30, 470, 452, 14);   // the handle recess
    return tex(c, { repeat: false });
  });
}
// tiles on a wall: 'subway' (7.5 x 15 cm bevelled, running bond), 'square' (10 cm), bathroom 'mosaic' accent band.
// One tile of texture = 0.6 m.
export function wallTileTexture(kind = 'subway', col = [236, 236, 230], seed = 51) {
  return once('wt' + kind + col + seed, () => {
    const N = 256, r = rng(seed), [c, g] = cv(N), hh = new Float32Array(N * N);
    g.fillStyle = '#b8b4aa'; g.fillRect(0, 0, N, N);   // grout
    const rows = kind === 'subway' ? 8 : 6, cols = kind === 'subway' ? 4 : 6, th = N / rows, tw = N / cols, gw = 2;
    for (let j = 0; j < rows; j++) for (let i = -1; i <= cols; i++) {
      const x = i * tw + (kind === 'subway' && j % 2 ? tw / 2 : 0), y = j * th, v = 0.95 + r() * 0.07;
      const x0 = x + gw / 2, y0 = y + gw / 2, w = tw - gw, h = th - gw;
      const gr = g.createLinearGradient(0, y0, 0, y0 + h); gr.addColorStop(0, rgb(col, v * 1.04)); gr.addColorStop(0.5, rgb(col, v)); gr.addColorStop(1, rgb(col, v * 0.93));
      g.fillStyle = gr; g.fillRect(x0, y0, w, h);
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x0, y0, w, 1.2); g.fillRect(x0, y0, 1.2, h);   // the bevel catching light
      g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x0, y0 + h - 1.2, w, 1.2); g.fillRect(x0 + w - 1.2, y0, 1.2, h);
      for (let yy = Math.max(0, y0 | 0); yy < Math.min(N, y0 + h); yy++) for (let xx = Math.max(0, x0 | 0); xx < Math.min(N, x0 + w); xx++) { const ex = Math.min(xx - x0, x0 + w - xx, yy - y0, y0 + h - yy); hh[yy * N + xx] = Math.min(1, ex / 3); }
    }
    for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(255,255,255,${0.05 + r() * 0.08})`; g.beginPath(); g.ellipse(r() * N, r() * N, 2 + r() * 6, 1 + r() * 2, r(), 0, 7); g.fill(); }   // glaze highlights
    return withNormal(tex(c), hh, 2.5, N, N);
  });
}
// upholstery: a real woven cloth (a twill or a chunky basket weave), clean, with a little pile variation.
// UV 0..1 over each cushion face, so the weave is drawn fine.
export function upholsteryTexture(col = [96, 104, 120], seed = 11) {
  return once('uph' + col + seed, () => {
    const N = 256, r = rng(seed), [c, g] = cv(N);
    paintNoise(g, N, [col.map(x => x * 0.9), col, col.map(x => Math.min(255, x * 1.08))], valueNoise(N, [4, 16], seed), 10, r);
    const basket = seed % 2 === 0, img = g.getImageData(0, 0, N, N), d = img.data;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      let f;
      if (basket) { const ci = (i >> 2) & 1, cj = (j >> 2) & 1, warp = ci ^ cj, u = warp ? (i & 3) / 3 : (j & 3) / 3; f = 0.86 + Math.sin(u * Math.PI) * 0.2 + (warp ? 0.03 : -0.03); }
      else { const t = ((i + j) % 6) / 6, u = (i % 3) / 2; f = 0.88 + Math.sin(t * Math.PI) * 0.12 + (u - 0.5) * 0.04; }   // twill: diagonal ribs
      const k = (j * N + i) * 4; d[k] *= f; d[k + 1] *= f; d[k + 2] *= f;
    }
    g.putImageData(img, 0, 0);
    for (let k = 0; k < 500; k++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},0.04)`; g.fillRect(r() * N, r() * N, 1 + r() * 3, 1); }   // slubs
    return withNormal(tex(c), c, 1.4);
  });
}
// bedding: 'mattress' (white damask with diamond quilting and tufts), 'pillow' (cotton with a flanged seam),
// 'quilt0..2' (a patchwork / a plaid / a striped duvet), 'knit' (a cable-knit throw)
export function beddingTexture(kind = 'mattress', seed = 61) {
  return once('bed' + kind + seed, () => {
    const N = 256, r = rng(seed), [c, g] = cv(N);
    if (kind === 'mattress') {
      g.fillStyle = '#ece8e0'; g.fillRect(0, 0, N, N);
      for (let k = 0; k < 400; k++) { g.fillStyle = 'rgba(200,192,176,0.25)'; g.beginPath(); g.arc(r() * N, r() * N, 2 + r() * 4, 0, 7); g.fill(); }   // a faint damask
      const s = N / 6;
      for (let q = -6; q <= 12; q++) { for (const sg of [1, -1]) { g.strokeStyle = 'rgba(120,110,96,0.45)'; g.lineWidth = 1.4; g.setLineDash([3, 2]); g.beginPath(); g.moveTo(q * s, sg > 0 ? 0 : N); g.lineTo(q * s + N, sg > 0 ? N : 0); g.stroke(); } }
      g.setLineDash([]);
      for (let j = 0; j <= 6; j++) for (let i = 0; i <= 6; i++) { const x = i * s + (j % 2 ? s / 2 : 0), y = j * s / 1 - s / 2 + s / 2; const gr = g.createRadialGradient(x, y, 0, x, y, 9); gr.addColorStop(0, 'rgba(90,80,70,0.45)'); gr.addColorStop(1, 'rgba(90,80,70,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill(); }
      g.fillStyle = '#7a8aa8'; g.fillRect(0, 0, N, 4); g.fillRect(0, N - 4, N, 4);   // the piped edge
      return withNormal(tex(c), c, 1.6);
    }
    if (kind === 'pillow') {
      g.fillStyle = '#f2efe8'; g.fillRect(0, 0, N, N);
      for (let k = 0; k < 18; k++) { const y = r() * N; g.strokeStyle = 'rgba(160,150,140,0.12)'; g.lineWidth = 2 + r() * 4; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(N / 3, y + (r() - 0.5) * 40, N * 2 / 3, y + (r() - 0.5) * 40, N, y + (r() - 0.5) * 20); g.stroke(); }   // creases
      g.strokeStyle = 'rgba(150,140,128,0.5)'; g.lineWidth = 1.2; g.setLineDash([4, 3]); g.strokeRect(18, 18, N - 36, N - 36); g.setLineDash([]);
      return withNormal(tex(c), c, 1.0);
    }
    if (kind === 'knit') {
      g.fillStyle = '#c8b89a'; g.fillRect(0, 0, N, N);
      for (let x = 0; x < N; x += 16) for (let y = 0; y < N; y += 10) { for (const sd of [-1, 1]) { g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.ellipse(x + 8 + sd * 3.5, y + 5, 3, 5, sd * 0.5, 0, 7); g.fill(); g.strokeStyle = 'rgba(80,60,40,0.25)'; g.lineWidth = 1; g.stroke(); } }
      return withNormal(tex(c), c, 2);
    }
    const v = +kind.slice(5) || 0;
    if (v === 0) {   // patchwork: squares of small florals and ginghams, stitched
      const P = [['#8a3a3a', '#e8d8c0'], ['#3a5a7a', '#e8e4d8'], ['#6a7a4a', '#f0e8d0'], ['#c8a050', '#f4ecd8'], ['#7a4a6a', '#f0e0e8'], ['#e8e0d0', '#9a6a4a']];
      const s = N / 4;
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
        const [a, b] = P[Math.floor(r() * P.length)], x = i * s, y = j * s; g.fillStyle = a; g.fillRect(x, y, s, s);
        if (r() < 0.5) { g.fillStyle = b; g.globalAlpha = 0.45; for (let q = 0; q < s; q += 8) { g.fillRect(x + q, y, 4, s); g.fillRect(x, y + q, s, 4); } g.globalAlpha = 1; }
        else { g.fillStyle = b; for (let q = 0; q < 14; q++) { const fx = x + 6 + r() * (s - 12), fy = y + 6 + r() * (s - 12); for (let p = 0; p < 5; p++) { g.beginPath(); g.arc(fx + Math.cos(p * 1.26) * 2.5, fy + Math.sin(p * 1.26) * 2.5, 1.8, 0, 7); g.fill(); } } }
        g.strokeStyle = 'rgba(255,250,235,0.6)'; g.setLineDash([3, 2]); g.lineWidth = 1; g.strokeRect(x + 3, y + 3, s - 6, s - 6); g.setLineDash([]);
      }
    } else if (v === 1) {   // a tartan plaid
      g.fillStyle = '#2a3a5a'; g.fillRect(0, 0, N, N);
      for (const [o, w, col] of [[0, 40, 'rgba(30,80,50,0.7)'], [64, 12, 'rgba(160,30,30,0.75)'], [128, 40, 'rgba(30,80,50,0.7)'], [192, 12, 'rgba(230,200,90,0.6)'], [100, 4, 'rgba(255,255,255,0.4)']]) { g.fillStyle = col; g.fillRect(o, 0, w, N); g.fillRect(0, o, N, w); }
      for (let y = 0; y < N; y += 2) { g.fillStyle = 'rgba(0,0,0,0.06)'; g.fillRect(0, y, N, 1); }
    } else {   // a soft striped duvet cover with a top band
      g.fillStyle = '#e4e0d6'; g.fillRect(0, 0, N, N);
      for (let x = 0; x < N; x += 32) { g.fillStyle = 'rgba(90,120,150,0.55)'; g.fillRect(x + 4, 0, 10, N); g.fillStyle = 'rgba(90,120,150,0.25)'; g.fillRect(x + 18, 0, 3, N); }
    }
    for (let k = 0; k < 12; k++) { const y = r() * N; g.strokeStyle = 'rgba(0,0,0,0.06)'; g.lineWidth = 3 + r() * 6; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(N / 3, y + (r() - 0.5) * 50, N * 2 / 3, y + (r() - 0.5) * 50, N, y); g.stroke(); }   // soft folds
    return withNormal(tex(c), c, 1.2);
  });
}
// a rug, the whole design on one texture (UV 0..1): 'persian' (borders, a medallion, a field of motifs), 'modern'
// (bold geometric blocks), 'bath' (a soft looped bath mat), 'runner' (a striped kilim)
export function rugTexture(kind = 'persian', seed = 71) {
  return once('rug' + kind + seed, () => {
    const W = 512, H = kind === 'bath' ? 256 : 512, r = rng(seed), [c, g] = cv(W, H);
    const pile = () => { const id = g.getImageData(0, 0, W, H), d = id.data; for (let i = 0; i < W * H; i++) { const f = 0.88 + r() * 0.2; d[i * 4] *= f; d[i * 4 + 1] *= f; d[i * 4 + 2] *= f; } g.putImageData(id, 0, 0); };
    if (kind === 'persian') {
      const red = '#7a1e1a', navy = '#1e2a4a', cream = '#e8d8b0', gold = '#c08a3a';
      g.fillStyle = red; g.fillRect(0, 0, W, H);
      const band = (m, w, col) => { g.strokeStyle = col; g.lineWidth = w; g.strokeRect(m + w / 2, m + w / 2, W - 2 * m - w, H - 2 * m - w); };
      band(6, 26, navy); band(10, 3, gold); band(28, 3, gold);
      for (let k = 0; k < 24; k++) for (const [x, y] of [[20 + k * 20, 19], [20 + k * 20, H - 19], [19, 20 + k * 20], [W - 19, 20 + k * 20]]) { g.fillStyle = cream; g.beginPath(); g.moveTo(x, y - 5); g.lineTo(x + 5, y); g.lineTo(x, y + 5); g.lineTo(x - 5, y); g.fill(); g.fillStyle = red; g.fillRect(x - 1.5, y - 1.5, 3, 3); }
      band(40, 6, cream); band(52, 3, navy);
      g.save(); g.translate(W / 2, H / 2);   // the medallion
      for (const [s, col] of [[150, navy], [128, gold], [112, cream], [90, red], [60, navy], [36, gold], [18, cream]]) { g.fillStyle = col; g.beginPath(); for (let a = 0; a < 16; a++) { const rr = a % 2 ? s : s * 0.78, an = a / 16 * Math.PI * 2; a ? g.lineTo(Math.cos(an) * rr, Math.sin(an) * rr * 0.8) : g.moveTo(rr, 0); } g.closePath(); g.fill(); }
      g.restore();
      for (const [x, y] of [[0, 0], [W, 0], [0, H], [W, H]]) { g.fillStyle = navy; g.beginPath(); g.arc(x, y, 150, 0, 7); g.fill(); g.fillStyle = 'rgba(0,0,0,0)'; }
      band(6, 26, navy); band(10, 3, gold); band(28, 3, gold); band(40, 6, cream);
      for (let k = 0; k < 60; k++) { const x = 70 + r() * (W - 140), y = 70 + r() * (H - 140); if (Math.hypot(x - W / 2, (y - H / 2) / 0.8) < 165) continue; g.fillStyle = r() < 0.5 ? gold : cream; g.globalAlpha = 0.7; g.beginPath(); for (let p = 0; p < 4; p++) { g.ellipse(x + Math.cos(p * 1.57) * 5, y + Math.sin(p * 1.57) * 5, 4, 2, p * 1.57, 0, 7); } g.fill(); g.globalAlpha = 1; }
      for (let x = 0; x < W; x += 5) { g.fillStyle = '#efe6d0'; g.fillRect(x, 0, 2, 4); g.fillRect(x, H - 4, 2, 4); }   // fringe
    } else if (kind === 'modern') {
      g.fillStyle = '#d8d0c0'; g.fillRect(0, 0, W, H);
      const cols = ['#2a4a6a', '#c8823a', '#5a6a5a', '#e8e0d0', '#8a3a2a'];
      for (let k = 0; k < 9; k++) { g.fillStyle = cols[k % cols.length]; g.globalAlpha = 0.85; const x = r() * W, y = r() * H, w = 60 + r() * 200, h = 40 + r() * 160; g.fillRect(x - w / 2, y - h / 2, w, h); }
      g.globalAlpha = 1; g.strokeStyle = '#2a2a2a'; g.lineWidth = 3; for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(r() * W, 0); g.lineTo(r() * W, H); g.stroke(); }
      g.strokeStyle = '#3a3a3a'; g.lineWidth = 16; g.strokeRect(8, 8, W - 16, H - 16);
    } else if (kind === 'runner') {
      g.fillStyle = '#a84a2a'; g.fillRect(0, 0, W, H);
      for (let y = 0; y < H; y += 32) { g.fillStyle = ['#e8d8b0', '#2a3a5a', '#d8a040', '#5a2a1a'][(y / 32) % 4]; g.fillRect(0, y, W, 10); for (let x = 0; x < W; x += 24) { g.beginPath(); g.moveTo(x, y + 10); g.lineTo(x + 12, y + 24); g.lineTo(x + 24, y + 10); g.fill(); } }
    } else {   // bath mat: soft loops, a darker border
      g.fillStyle = '#7a9ab0'; g.fillRect(0, 0, W, H);
      for (let k = 0; k < 9000; k++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '20,40,60'},0.12)`; g.beginPath(); g.arc(r() * W, r() * H, 1.5 + r() * 2, 0, 7); g.fill(); }
      g.strokeStyle = 'rgba(30,50,70,0.5)'; g.lineWidth = 14; g.strokeRect(14, 14, W - 28, H - 28);
    }
    pile();
    return withNormal(tex(c, { repeat: false }), c, 1.4);
  });
}
// book spines in one atlas (512 x 512): 8 spines with titles in the top half; under each its cover cloth (rows
// 256..384) and its page edges (384..512) — a book is one box UV-mapped onto its own column.
const TITLES = ['WAR & PEACE', 'MOBY DICK', 'BIRDS OF OHIO', 'THE ATLAS', 'GARDENING', 'DUNE', 'FIRST AID', 'COOKING 101', 'EMMA', 'MAPLE HOLLOW', 'POEMS', 'THE ODYSSEY'];
export function bookAtlasTexture() {
  return once('bookAtlas', () => {
    const N = 512, [c, g] = cv(N), r = rng(77);
    for (let i = 0; i < 8; i++) {
      const x = i * 64, base = BOOK_COLS[(i * 3) % BOOK_COLS.length].map(v => v * (0.85 + r() * 0.25)), col = rgb(base);
      g.fillStyle = col; g.fillRect(x, 0, 64, 384);
      const sh = g.createLinearGradient(x, 0, x + 64, 0); sh.addColorStop(0, 'rgba(0,0,0,0.32)'); sh.addColorStop(0.35, 'rgba(255,255,255,0.08)'); sh.addColorStop(1, 'rgba(0,0,0,0.32)'); g.fillStyle = sh; g.fillRect(x, 0, 64, 256);
      const gold = r() < 0.6, ink = gold ? '#d8b060' : (base[0] + base[1] + base[2] > 380 ? '#1a1612' : '#efe6d0');
      g.fillStyle = gold ? 'rgba(210,170,90,0.9)' : 'rgba(20,16,12,0.7)';
      for (const y of [18, 230]) { g.fillRect(x + 4, y, 56, 4); g.fillRect(x + 4, y + 7, 56, 1.5); }
      g.save(); g.translate(x + 32, 128); g.rotate(Math.PI / 2); g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
      fitText(g, TITLES[(i * 5 + 3) % TITLES.length], 0, -6, 'bold 22px Georgia', 180, 30);
      g.font = '12px Georgia'; g.globalAlpha = 0.85; fitText(g, ['A. SMITH', 'J. DOE', 'M. TWAIN', 'L. ROSE'][i % 4], 0, 16, '12px Georgia', 150, 14); g.restore(); g.globalAlpha = 1;
      grime(g, N, N, 90 + i, 0.06, 0);
      // its cover (a touch darker, a blind-stamped border) and its pages
      g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2; g.strokeRect(x + 6, 262, 52, 116);
      g.fillStyle = '#e6dcc4'; g.fillRect(x, 384, 64, 128); for (let y = 386; y < 512; y += 2) { g.fillStyle = `rgba(120,100,70,${0.1 + r() * 0.12})`; g.fillRect(x, y, 64, 1); }
    }
    return tex(c, { repeat: false });
  });
}
// a cardboard box side: kraft board with the flute showing faintly, packing tape, a printed label or a marker scrawl
export function cardboardTexture(seed = 81, label = '') {
  return once('card' + seed + label, () => {
    const N = 256, r = rng(seed), [c, g] = cv(N);
    paintNoise(g, N, [[150, 112, 70], [172, 132, 86], [186, 146, 98]], valueNoise(N, [4, 16, 64], seed), 10, r);
    for (let x = 0; x < N; x += 5) { g.fillStyle = 'rgba(0,0,0,0.035)'; g.fillRect(x, 0, 2, N); }
    g.fillStyle = 'rgba(200,170,110,0.55)'; g.fillRect(N * 0.4, 0, N * 0.2, N); g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(N * 0.4, 0, 2, N);   // tape down the middle
    if (label) { g.save(); g.translate(N * 0.5, N * 0.62); g.rotate((r() - 0.5) * 0.15); g.fillStyle = 'rgba(25,20,30,0.85)'; g.textAlign = 'center'; fitText(g, label, 0, 0, 'bold 44px Marker Felt, Comic Sans MS, sans-serif', N * 0.85, 50); g.restore(); }
    else { g.fillStyle = 'rgba(30,30,30,0.7)'; g.font = 'bold 18px Helvetica'; g.textAlign = 'center'; g.fillText('THIS SIDE UP', N / 2, N * 0.2); g.beginPath(); g.moveTo(N / 2 - 30, N * 0.3); g.lineTo(N / 2 - 22, N * 0.24); g.lineTo(N / 2 - 14, N * 0.3); g.fill(); }
    grime(g, N, N, seed + 1, 0.2, 0);
    return tex(c);
  });
}
