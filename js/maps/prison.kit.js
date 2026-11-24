// Zombie_Apocalypse — BLACKWATER PRISON: the building kit.
// Canvas textures (painted cinder block, weathered perimeter concrete, sealed epoxy floors, diamond-plate steel, the
// sport court, vinyl mattresses, CCTV screens, stencilled signs, the helipad), shared geometry (razor-wire coils,
// cell bars) and the furniture every room is furnished with (bunks, steel toilets, mess tables, hospital beds,
// washers, workbenches, weight benches). Everything goes through the map kit K (merged K.box / K.xadd, instanced
// K.inst) so the whole prison stays a few hundred draw calls.
import * as THREE from 'three';
import { decor, P2, XCELLS } from './decor.js';
import { isLow } from '../tex.js';   // [prison-real] phones keep the cheaper razor wire

export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export function rng(seed) { let a = seed >>> 0 || 1; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ---------------------------------------------------------------- textures
function cv(w, h, fn, rep = null, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; if (rep) t.repeat.set(rep[0], rep[1]);
  return t;
}
const rgba = (c, k = 1, a = 1) => `rgba(${clamp(c[0] * k, 0, 255) | 0},${clamp(c[1] * k, 0, 255) | 0},${clamp(c[2] * k, 0, 255) | 0},${a})`;
function speck(g, w, h, n, cols, r, s = 2) { for (let i = 0; i < n; i++) { g.fillStyle = cols[(r() * cols.length) | 0]; const q = 0.5 + r() * s; g.fillRect(r() * w, r() * h, q, q); } }
function stains(g, w, h, n, col, r, len = 0.5) {   // vertical streaks running down from the top (rain, rust)
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * h * 0.3, ww = 2 + r() * 10, hh = h * (0.2 + r() * len);
    const gr = g.createLinearGradient(0, y, 0, y + hh); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x, y, ww, hh);
  }
}
// painted cinder block: 400 × 200 mm units, recessed mortar, thick glossy paint over the pores, scuffs low down
// (one texture = 2.4 m square: 6 blocks across, 12 courses)
function cinderTex(base, seed) {
  const r = rng(seed);
  return cv(512, 512, (g, w, h) => {
    g.fillStyle = rgba(base); g.fillRect(0, 0, w, h);
    const bw = w / 6, bh = h / 12;
    for (let row = 0; row < 12; row++) for (let k = -1; k < 7; k++) {
      const x = k * bw + (row % 2 ? bw / 2 : 0), y = row * bh;
      g.fillStyle = rgba(base, 0.96 + r() * 0.08); g.fillRect(x + 3, y + 3, bw - 6, bh - 6);
      g.fillStyle = rgba(base, 1.08, 0.5); g.fillRect(x + 3, y + 3, bw - 6, 2);   // the paint catching the light on top
    }
    g.fillStyle = rgba(base, 0.72, 0.9);
    for (let row = 0; row <= 12; row++) g.fillRect(0, row * bh - 1.5, w, 3);
    for (let row = 0; row < 12; row++) for (let k = -1; k < 8; k++) g.fillRect(k * bw + (row % 2 ? bw / 2 : 0) - 1.5, row * bh, 3, bh);
    speck(g, w, h, 5000, [rgba(base, 0.85, 0.5), rgba(base, 1.1, 0.4)], r, 1.4);
    for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(40,36,30,${0.05 + r() * 0.08})`; g.fillRect(r() * w, h * 0.8 + r() * h * 0.2, 10 + r() * 40, 2 + r() * 4); }   // scuffs
    // [prison-real] years of use: a greasy band where shoulders and hands rub (≈0.9–1.6 m), patchy touch-up paint
    // that never quite matches, chips knocked out of the block corners, a dribble of something down the wall
    { const gr = g.createLinearGradient(0, h * 0.33, 0, h * 0.62); gr.addColorStop(0, 'rgba(60,52,40,0)'); gr.addColorStop(0.5, 'rgba(60,52,40,0.09)'); gr.addColorStop(1, 'rgba(60,52,40,0)'); g.fillStyle = gr; g.fillRect(0, h * 0.33, w, h * 0.29); }
    for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(50,44,36,${0.05 + r() * 0.07})`; g.beginPath(); g.ellipse(r() * w, h * (0.38 + r() * 0.2), 4 + r() * 7, 6 + r() * 9, r(), 0, 7); g.fill(); }   // palm prints
    for (let i = 0; i < 5; i++) { const x = r() * w, y = r() * h, ww = 30 + r() * 70, hh = 20 + r() * 50; g.fillStyle = rgba(base, 1.03 + r() * 0.05, 0.55); g.fillRect(x, y, ww, hh); }   // touch-up patches
    for (let i = 0; i < 40; i++) { const x = ((r() * 7) | 0) * bw + (r() < 0.5 ? bw / 2 : 0), y = ((r() * 12) | 0) * bh, s = 2 + r() * 4; g.fillStyle = 'rgba(120,114,100,0.85)'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + s * (r() < 0.5 ? 1 : -1), y + s * 0.3); g.lineTo(x + s * 0.2, y + s); g.fill(); }   // chipped arrises
    for (let i = 0; i < 3; i++) { const x = r() * w, y = h * (0.2 + r() * 0.4), len = 30 + r() * 90, gr = g.createLinearGradient(0, y, 0, y + len); gr.addColorStop(0, 'rgba(90,70,40,0.22)'); gr.addColorStop(1, 'rgba(90,70,40,0)'); g.fillStyle = gr; g.fillRect(x, y, 2 + r() * 3, len); }
  }, null);
}
// the perimeter wall: big cast panels, tie-holes, rain streaks and rust bleeding from the top
function wallTex() {
  const r = rng(77);
  return cv(512, 512, (g, w, h) => {
    g.fillStyle = '#9a968c'; g.fillRect(0, 0, w, h);
    // [prison-real] each 3 m panel was cast on its own day: a slightly different tone, mottled cloud in the cement
    for (const [x0, k] of [[0, 0.97 + r() * 0.05], [w / 2, 1.0 + r() * 0.05]]) { g.fillStyle = `rgba(${k > 1 ? '255,250,240' : '40,38,34'},${Math.abs(k - 1) * 2.2})`; g.fillRect(x0, 0, w / 2, h); }
    for (let i = 0; i < 70; i++) { const x = r() * w, y = r() * h, rad = 20 + r() * 70, gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, r() < 0.5 ? 'rgba(70,66,58,0.10)' : 'rgba(200,196,186,0.10)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
    speck(g, w, h, 16000, ['rgba(70,68,62,0.35)', 'rgba(190,186,176,0.3)', 'rgba(120,116,108,0.4)'], r, 2);
    for (let i = 0; i < 260; i++) { g.fillStyle = 'rgba(40,38,34,0.45)'; g.beginPath(); g.arc(r() * w, r() * h, 0.6 + r() * 1.6, 0, 7); g.fill(); }   // bug holes (air pockets)
    // the lift lines where each pour stopped, and the form-tie holes in rows
    g.fillStyle = 'rgba(60,58,52,0.18)'; for (const y of [h * 0.34, h * 0.67]) g.fillRect(0, y + (r() - 0.5) * 4, w, 2);
    // rain run-off: soft, uneven, wider under the coping drips, fading out, never a neat barcode
    for (let i = 0; i < 26; i++) {
      const x = r() * w, len = h * (0.15 + r() * 0.55 * r()), ww = 3 + r() * 16, a = 0.08 + r() * 0.14;
      for (let k = 0; k < 3; k++) { const xx = x + (r() - 0.5) * ww, gr = g.createLinearGradient(0, 0, 0, len); gr.addColorStop(0, `rgba(52,50,44,${a})`); gr.addColorStop(0.6, `rgba(52,50,44,${a * 0.5})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(xx, 0); g.lineTo(xx + ww * (0.3 + r() * 0.5), 0); g.lineTo(xx + ww * 0.3 + (r() - 0.5) * 6, len); g.lineTo(xx + (r() - 0.5) * 4, len * (0.6 + r() * 0.4)); g.fill(); }
    }
    // rust bleeding from the coping anchors and the tie holes (thin, orange-brown, short)
    for (let i = 0; i < 7; i++) { const x = r() * w, y = r() < 0.5 ? 0 : [96, 256, 416][(r() * 3) | 0], len = 20 + r() * 80, gr = g.createLinearGradient(0, y, 0, y + len); gr.addColorStop(0, 'rgba(130,70,30,0.35)'); gr.addColorStop(1, 'rgba(130,70,30,0)'); g.fillStyle = gr; g.fillRect(x, y, 2 + r() * 3, len); }
    // white efflorescence blooming out of the joints, a patched repair, a few hairline cracks
    for (const x of [2, w / 2]) for (let i = 0; i < 5; i++) { const y = r() * h, rad = 6 + r() * 18, gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(230,228,220,0.28)'); gr.addColorStop(1, 'rgba(230,228,220,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
    { const px = 60 + r() * 300, py = 120 + r() * 200; g.fillStyle = 'rgba(175,172,162,0.2)'; g.beginPath(); g.moveTo(px, py); g.lineTo(px + 60 + r() * 30, py + 6); g.lineTo(px + 70, py + 40 + r() * 20); g.lineTo(px + 4, py + 46); g.fill(); }
    g.strokeStyle = 'rgba(45,43,38,0.5)'; g.lineWidth = 1;
    for (let i = 0; i < 6; i++) { let x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 8; k++) { x += (r() - 0.5) * 18; y += 6 + r() * 14; g.lineTo(x, y); } g.stroke(); }
    g.fillStyle = 'rgba(50,48,44,0.6)'; g.fillRect(0, 0, 3, h); g.fillRect(w / 2, 0, 2, h);   // panel joints
    for (const x of [64, 192, 320, 448]) for (const y of [96, 256, 416]) { g.fillStyle = 'rgba(40,38,34,0.7)'; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); }
    // splash-back: mud and green algae creeping up the foot of the wall
    const gr = g.createLinearGradient(0, h, 0, h * 0.78); gr.addColorStop(0, 'rgba(60,54,40,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, h * 0.78, w, h * 0.22);
    for (let i = 0; i < 40; i++) { const x = r() * w, rad = 8 + r() * 26, y = h - r() * 30, gq = g.createRadialGradient(x, y, 0, x, y, rad); gq.addColorStop(0, `rgba(${60 + r() * 20},${78 + r() * 20},${40},${0.12 + r() * 0.12})`); gq.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gq; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  });
}
// sealed concrete floor: grey epoxy, swirl marks, a sheen of polish, the odd crack
function epoxyTex(base, seed) {
  const r = rng(seed);
  return cv(512, 512, (g, w, h) => {
    g.fillStyle = rgba(base); g.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) { const x = r() * w, y = r() * h, rad = 30 + r() * 90, gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, rgba(base, 0.9 + r() * 0.2, 0.3)); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
    speck(g, w, h, 7000, [rgba(base, 0.7, 0.6), rgba(base, 1.25, 0.5), 'rgba(30,30,30,0.3)'], r, 1.5);
    g.strokeStyle = rgba(base, 0.55, 0.7); g.lineWidth = 1;
    for (let i = 0; i < 4; i++) { let x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 10; k++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 40; g.lineTo(x, y); } g.stroke(); }
    g.fillStyle = rgba(base, 0.6, 0.8); g.fillRect(0, 0, w, 2); g.fillRect(0, 0, 2, h);   // saw-cut joints
  });
}
// ---- relief (height fields → normal maps, desktop only): mortar joints sunk into the block, the cast panels' joints
// and tie-holes, the raised diamonds on the tread plate. Same layouts as the colour textures above, so they line up.
function cinderH() {
  const r = rng(91);
  return cv(512, 512, (g, w, h) => {
    g.fillStyle = '#5a5a5a'; g.fillRect(0, 0, w, h);
    const bw = w / 6, bh = h / 12;
    for (let row = 0; row < 12; row++) for (let k = -1; k < 7; k++) { const x = k * bw + (row % 2 ? bw / 2 : 0), y = row * bh; g.fillStyle = '#c8c8c8'; g.fillRect(x + 3, y + 3, bw - 6, bh - 6); g.fillStyle = '#b0b0b0'; g.fillRect(x + 4, y + 4, bw - 8, bh - 8); }
    speck(g, w, h, 6000, ['rgba(0,0,0,0.35)', 'rgba(255,255,255,0.2)'], r, 1.6);
  }, null, false).image;
}
function wallH() {
  const r = rng(78);
  return cv(512, 512, (g, w, h) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
    speck(g, w, h, 9000, ['rgba(0,0,0,0.25)', 'rgba(255,255,255,0.2)'], r, 2.5);
    g.fillStyle = '#202020'; g.fillRect(0, 0, 3, h); g.fillRect(w / 2, 0, 2, h);
    for (const x of [64, 192, 320, 448]) for (const y of [96, 256, 416]) { g.fillStyle = '#101010'; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); }
  }, null, false).image;
}
function treadH() {
  return cv(256, 256, (g, w, h) => {
    g.fillStyle = '#404040'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) for (let x = 0; x < w; x += 32) for (const [ox, oy, a] of [[8, 8, 0.6], [24, 24, -0.6]]) { g.save(); g.translate(x + ox, y + oy); g.rotate(a); g.fillStyle = '#e0e0e0'; g.fillRect(-9, -2.5, 18, 5); g.restore(); }
  }, null, false).image;
}
function treadTex() {   // diamond plate
  return cv(256, 256, (g, w, h) => {
    g.fillStyle = '#6a6e72'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) for (let x = 0; x < w; x += 32) for (const [ox, oy, a] of [[8, 8, 0.6], [24, 24, -0.6]]) {
      g.save(); g.translate(x + ox, y + oy); g.rotate(a); g.fillStyle = '#9a9ea2'; g.fillRect(-9, -2, 18, 4); g.fillStyle = '#3a3e42'; g.fillRect(-9, 2, 18, 1.5); g.restore();
    }
    const r = rng(5); speck(g, w, h, 1500, ['rgba(40,30,20,0.3)', 'rgba(200,200,200,0.15)'], r, 2);
  });
}
function courtTex() {   // acrylic sport court: green outer, terracotta key, chalky wear
  const r = rng(9);
  return cv(256, 256, (g, w, h) => {
    g.fillStyle = '#3e6a52'; g.fillRect(0, 0, w, h);
    speck(g, w, h, 6000, ['rgba(255,255,255,0.06)', 'rgba(0,0,0,0.08)', 'rgba(120,150,120,0.1)'], r, 2);
    for (let i = 0; i < 8; i++) { const x = r() * w, y = r() * h, rad = 20 + r() * 50, gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(180,190,170,0.12)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
    // [prison-real] sun-faded, cracked through the coating (the slab moving underneath), a dark rubber-scuffed patch,
    // dirt blown in along the cracks
    for (let i = 0; i < 3; i++) { let x = r() * w, y = r() * h; g.strokeStyle = 'rgba(30,40,30,0.55)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 14; k++) { x += (r() - 0.5) * 26; y += (r() - 0.3) * 20; g.lineTo(x, y); } g.stroke(); g.strokeStyle = 'rgba(120,100,70,0.18)'; g.lineWidth = 4; g.stroke(); }
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(20,22,20,${0.04 + r() * 0.06})`; g.beginPath(); g.ellipse(r() * w, r() * h, 2 + r() * 8, 1 + r() * 3, r() * 3, 0, 7); g.fill(); }   // shoe scuffs
    for (let i = 0; i < 2; i++) { const x = r() * w, y = r() * h, s = 4 + r() * 8; g.fillStyle = 'rgba(120,128,112,0.22)'; g.beginPath(); g.ellipse(x, y, s, s * 0.7, r() * 3, 0, 7); g.fill(); }   // coating flaked off to bare concrete
  });
}
function vinylTex(col, seed) {
  const r = rng(seed);
  return cv(128, 128, (g, w, h) => { g.fillStyle = rgba(col); g.fillRect(0, 0, w, h); speck(g, w, h, 1200, [rgba(col, 0.8, 0.5), rgba(col, 1.2, 0.4)], r, 1); g.fillStyle = rgba(col, 0.7, 0.8); g.fillRect(0, 0, w, 3); g.fillRect(0, h - 3, w, 3); });
}
function woolTex(col, seed) {
  const r = rng(seed);
  return cv(128, 128, (g, w, h) => { g.fillStyle = rgba(col); g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 2) { g.fillStyle = rgba(col, 0.9 + r() * 0.2, 0.5); g.fillRect(0, y, w, 1); } speck(g, w, h, 2000, [rgba(col, 0.7, 0.4), rgba(col, 1.3, 0.3)], r, 1); g.fillStyle = 'rgba(200,190,170,0.6)'; g.fillRect(0, 12, w, 4); g.fillRect(0, h - 16, w, 4); });
}
function cctvTex() {   // a wall of CCTV monitors: grainy grey camera views with timestamps
  const r = rng(31);
  return cv(512, 256, (g, w, h) => {
    g.fillStyle = '#050608'; g.fillRect(0, 0, w, h);
    for (let j = 0; j < 3; j++) for (let i = 0; i < 6; i++) {
      const x = i * 85 + 3, y = j * 85 + 3, ww = 79, hh = 79;
      const gr = g.createLinearGradient(x, y, x, y + hh); gr.addColorStop(0, `rgb(${60 + r() * 40},${70 + r() * 40},${70 + r() * 30})`); gr.addColorStop(1, '#1a1e1c'); g.fillStyle = gr; g.fillRect(x, y, ww, hh);
      g.fillStyle = 'rgba(20,24,22,0.8)'; g.beginPath(); g.moveTo(x, y + hh); g.lineTo(x + ww * (0.3 + r() * 0.2), y + hh * 0.45); g.lineTo(x + ww * (0.6 + r() * 0.2), y + hh * 0.45); g.lineTo(x + ww, y + hh); g.fill();   // a corridor in perspective
      for (let k = 0; k < 400; k++) { g.fillStyle = `rgba(255,255,255,${r() * 0.12})`; g.fillRect(x + r() * ww, y + r() * hh, 1, 1); }
      g.fillStyle = '#e8f0e8'; g.font = '9px monospace'; g.fillText(`CAM ${j * 6 + i + 1}`, x + 3, y + 10); g.fillText('03-03 11:04', x + 3, y + hh - 4);
      if (r() < 0.3) { g.fillStyle = 'rgba(200,30,30,0.9)'; g.fillRect(x + ww - 12, y + 3, 8, 8); }
    }
  }, null);
}
// stencilled signs: block letters on painted steel / concrete
export function stencil(lines, bg, fg, w = 512, h = 192, size = 84) {
  const r = rng(lines.join('').length * 7 + 3);
  return cv(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    lines.forEach((l, i) => { let s = i ? size * 0.42 : size; const f = q => `bold ${q}px Impact, "Arial Black", Helvetica, sans-serif`; g.font = f(s); const tw = g.measureText(l).width; if (tw > w * 0.9) { s *= w * 0.9 / tw; g.font = f(s); } g.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * size * 0.8); });   // shrink to fit: nothing cut off
    speck(g, w, h, 1200, ['rgba(0,0,0,0.15)', 'rgba(255,255,255,0.08)'], r, 2);
    stains(g, w, h, 6, 'rgba(70,40,20,0.2)', r, 0.5);
  }, null);
}
function helipadTex() {
  return cv(512, 512, (g, w, h) => {
    g.fillStyle = '#3e4042'; g.fillRect(0, 0, w, h);
    const r = rng(12); speck(g, w, h, 12000, ['rgba(255,255,255,0.05)', 'rgba(0,0,0,0.12)'], r, 2);
    g.strokeStyle = '#e8e4d8'; g.lineWidth = 18; g.beginPath(); g.arc(256, 256, 210, 0, 7); g.stroke();
    g.fillStyle = '#e8e4d8'; g.fillRect(166, 136, 44, 240); g.fillRect(302, 136, 44, 240); g.fillRect(166, 236, 180, 40);
    g.strokeStyle = '#d8b030'; g.lineWidth = 8; g.strokeRect(14, 14, w - 28, h - 28);
  }, null);
}
// spray-paint tags on bare concrete (transparent: the wall shows through): crews, numbers, a heart, tally marks
function graffitiTex() {
  const r = rng(404);
  return cv(1024, 332, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.lineJoin = g.lineCap = 'round'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const tag = (txt, x, y, size, col, rot, out = null) => {
      g.save(); g.translate(x, y); g.rotate(rot); g.font = `bold ${size}px "Arial Black", Impact, sans-serif`;
      const tw = g.measureText(txt).width, k = Math.min(1, (w * 0.4) / tw); g.scale(k, 1);   // (never wider than its patch)
      if (out) { g.strokeStyle = out; g.lineWidth = size * 0.14; g.strokeText(txt, 0, 0); }
      g.shadowColor = col; g.shadowBlur = 6; g.fillStyle = col; g.fillText(txt, 0, 0); g.restore();
    };
    tag('B-BLOCK', 210, 90, 96, 'rgba(40,90,190,0.85)', -0.08, 'rgba(240,240,240,0.7)');
    tag('1187', 560, 70, 70, 'rgba(200,40,30,0.8)', 0.05);
    tag('YARD KINGS', 800, 120, 64, 'rgba(30,30,30,0.85)', -0.04, 'rgba(220,180,40,0.75)');
    tag('C-DOG', 420, 230, 74, 'rgba(30,120,60,0.8)', 0.06, 'rgba(20,20,20,0.6)');
    tag('NO SNITCH', 760, 250, 46, 'rgba(25,25,25,0.75)', -0.03);
    g.strokeStyle = 'rgba(200,40,30,0.8)'; g.lineWidth = 7; g.beginPath(); g.moveTo(80, 250); g.bezierCurveTo(40, 200, 90, 180, 110, 220); g.bezierCurveTo(130, 180, 180, 200, 140, 250); g.lineTo(110, 290); g.closePath(); g.stroke();   // a heart
    g.strokeStyle = 'rgba(240,240,240,0.7)'; g.lineWidth = 4; for (let i = 0; i < 4; i++) { const x0 = 960 - i * 40; for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(x0 + k * 7, 280); g.lineTo(x0 + k * 7, 320); g.stroke(); } g.beginPath(); g.moveTo(x0 - 4, 312); g.lineTo(x0 + 28, 286); g.stroke(); }   // tally marks
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '40,90,190' : '200,40,30'},${0.25 * r()})`; g.fillRect(r() * w, r() * h, 1.5, 1.5); }   // overspray
  }, null);
}
// [prison-real] painted steel that's been painted over and over: chips through to grey primer and bare metal,
// rust blooming at the chips, grime darker low down (bars, fences, rails). Isotropic so it reads on any axis.
function chippedTex(base, seed, rustK = 1) {
  const r = rng(seed);
  return cv(128, 128, (g, w, h) => {
    g.fillStyle = rgba(base); g.fillRect(0, 0, w, h);
    for (let i = 0; i < 30; i++) { const x = r() * w, y = r() * h, rad = 6 + r() * 20, gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, rgba(base, 0.85 + r() * 0.3, 0.35)); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
    speck(g, w, h, 900, [rgba(base, 0.8, 0.5), rgba(base, 1.15, 0.4)], r, 1.2);
    for (let i = 0; i < 34; i++) {   // chips: rust halo, primer, bright bare steel in the middle
      const x = r() * w, y = r() * h, s = 1 + r() * 3.5;
      g.fillStyle = `rgba(110,58,26,${0.35 * rustK})`; g.beginPath(); g.ellipse(x, y, s * 1.9, s * 1.4, r() * 3, 0, 7); g.fill();
      g.fillStyle = 'rgba(120,122,118,0.9)'; g.beginPath(); g.ellipse(x, y, s, s * (0.5 + r() * 0.5), r() * 3, 0, 7); g.fill();
      if (r() < 0.5) { g.fillStyle = 'rgba(190,192,190,0.8)'; g.fillRect(x - s * 0.3, y - s * 0.2, s * 0.6, s * 0.4); }
    }
    for (let i = 0; i < 5 * rustK; i++) { const x = r() * w, y = r() * h, len = 10 + r() * 30, gr = g.createLinearGradient(0, y, 0, y + len); gr.addColorStop(0, 'rgba(120,62,24,0.4)'); gr.addColorStop(1, 'rgba(120,62,24,0)'); g.fillStyle = gr; g.fillRect(x, y, 1.5 + r() * 2, len); }
  });
}
// [prison-real] worn floor/court paint: scuffed through in patches, edges ragged (alpha-tested: no sorting cost)
function wornLineTex(col, seed) {
  const r = rng(seed);
  return cv(256, 256, (g, w, h) => {
    g.fillStyle = rgba(col); g.fillRect(0, 0, w, h);
    speck(g, w, h, 2500, [rgba(col, 0.82, 0.6), rgba(col, 0.7, 0.4), 'rgba(60,55,45,0.25)'], r, 1.6);
    for (let i = 0; i < 18; i++) { const x = r() * w, y = r() * h, rad = 4 + r() * 22, gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(70,64,52,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }   // dirt ground in
    g.globalCompositeOperation = 'destination-out';   // worn right through: shoes, wheels, years
    for (let i = 0; i < 120; i++) { g.fillStyle = `rgba(0,0,0,${0.5 + r() * 0.5})`; g.beginPath(); g.ellipse(r() * w, r() * h, 1 + r() * 9, 1 + r() * 4, r() * 3, 0, 7); g.fill(); }
    g.globalCompositeOperation = 'source-over';
  });
}
function bloodSmearTex() {
  const r = rng(66);
  return cv(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) { const x = 128 + (r() - 0.5) * 140, y = 128 + (r() - 0.5) * 140, rad = 8 + r() * 36; g.fillStyle = `rgba(${70 + r() * 40},6,6,${0.5 + r() * 0.4})`; g.beginPath(); g.ellipse(x, y, rad, rad * (0.5 + r()), r() * 3, 0, 7); g.fill(); }
    for (let i = 0; i < 60; i++) { g.fillStyle = 'rgba(80,8,8,0.8)'; g.beginPath(); g.arc(r() * w, r() * h, 1 + r() * 3, 0, 7); g.fill(); }
  }, null);
}

// ---------------------------------------------------------------- materials (added to K.MAT / K.TILE once)
let MATS_DONE = false;
export function prisonMats(K) {
  const M = K.MAT, T = K.TILE, std = K.std || (o => new THREE.MeshStandardMaterial({ roughness: 0.85, ...o }));
  if (MATS_DONE && M.pCinder) return M;
  MATS_DONE = true;
  const add = (k, m, tile = 1) => { M[k] = m; T[k] = tile; };
  // relief: one normal map shared by all four block colours (same bond), one for the wall panels, one for the tread
  const TXm = K.TX || {}, low = TXm.isLow ? TXm.isLow() : true, nrm = (fn, k) => (!low && TXm.normalFromHeight) ? TXm.normalFromHeight(fn(), k) : null;
  const relief = (n, s) => n ? { normalMap: n, normalScale: new THREE.Vector2(s, s) } : {};
  const nCinder = nrm(cinderH, 2.2), nWall = nrm(wallH, 1.6), nTread = nrm(treadH, 2.6);
  add('pCinder', std({ map: cinderTex([206, 200, 182], 3), roughness: 0.55, ...relief(nCinder, 0.8) }), 2.4);       // cream (cell blocks)
  add('pCinderG', std({ map: cinderTex([150, 170, 150], 4), roughness: 0.55, ...relief(nCinder, 0.8) }), 2.4);      // institutional green
  add('pCinderB', std({ map: cinderTex([160, 176, 190], 5), roughness: 0.55, ...relief(nCinder, 0.8) }), 2.4);      // pale blue (infirmary)
  add('pCinderOut', std({ map: cinderTex([168, 160, 146], 6), roughness: 0.9, ...relief(nCinder, 1.0) }), 2.4);     // unpainted outside
  add('pWall', std({ map: wallTex(), roughness: 0.95, ...relief(nWall, 0.9) }), 6);
  // the walls darken where they meet the ground (world.js's baked contact shading; 'ext' for all: these rooms are
  // taller than a house, so the house-ceiling band of 'int' would sit halfway up a cell-block wall)
  if (K.contactAO) for (const k of ['pCinder', 'pCinderG', 'pCinderB', 'pCinderOut', 'pWall']) K.contactAO(M[k], 'ext');
  add('pFloor', std({ map: epoxyTex([128, 130, 128], 8), roughness: 0.35 }), 4);
  add('pFloorR', std({ map: epoxyTex([132, 70, 58], 9), roughness: 0.4 }), 4);              // red-oxide (cafeteria)
  add('pFloorW', std({ map: epoxyTex([196, 198, 192], 10), roughness: 0.25 }), 4);          // white (infirmary)
  add('pTread', std({ map: treadTex(), roughness: 0.4, metalness: 0.75, ...relief(nTread, 1.0) }), 1.2);
  add('pCourt', std({ map: courtTex(), roughness: 0.8 }), 4);
  add('pBars', std({ map: chippedTex([90, 100, 108], 41), roughness: 0.5, metalness: 0.6 }), 1);   // [prison-real] chipped, re-painted steel
  add('pLineW', std({ map: wornLineTex([226, 224, 214], 42), alphaTest: 0.45, roughness: 0.75 }), 2);   // [prison-real] worn white court / yard paint
  add('pLineY', std({ map: wornLineTex([214, 170, 40], 43), alphaTest: 0.45, roughness: 0.7 }), 2);     // [prison-real] worn safety-yellow floor line
  add('pSteel', std({ map: cv(256, 256, (g, w, h) => P2.brushed(g, 0, 0, w, h, rng(21), [196, 200, 204])), roughness: 0.3, metalness: 0.7 }), 1.2);   // brushed stainless (mess tables, toilets, counters)
  add('pSheet', std({ map: cv(128, 128, (g, w, h) => { g.fillStyle = '#eef0ee'; g.fillRect(0, 0, w, h); const r = rng(22); for (let y = 0; y < h; y += 2) { g.fillStyle = `rgba(0,0,0,${0.02 + r() * 0.03})`; g.fillRect(0, y, w, 1); } g.fillStyle = '#7aa0c8'; g.fillRect(0, 18, w, 5); g.fillRect(0, 26, w, 2); speck(g, w, h, 300, ['rgba(120,130,150,0.12)'], r, 2); }), roughness: 0.95 }), 1.0);   // hospital sheets: a blue stripe
  add('pPaintDoor', std({ map: cv(128, 128, (g, w, h) => { g.fillStyle = '#5a6670'; g.fillRect(0, 0, w, h); speck(g, w, h, 900, ['rgba(0,0,0,0.12)', 'rgba(255,255,255,0.08)'], rng(23), 2); }), roughness: 0.55, metalness: 0.3 }), 1);
  add('pRail', std({ map: chippedTex([200, 160, 48], 44, 0.7), roughness: 0.55, metalness: 0.3 }), 1);   // safety-yellow rails, hand-worn [prison-real]
  add('pMat', std({ map: vinylTex([44, 70, 120], 11), roughness: 0.5 }), 1);                // blue vinyl mattress
  add('pWool', std({ map: woolTex([110, 108, 100], 12), roughness: 1 }), 1);                // grey blanket
  add('pOrange', std({ map: woolTex([226, 110, 30], 13), roughness: 0.95 }), 1);            // jumpsuits
  add('pRubber', std({ color: 0x1a1a1c, roughness: 0.85 }), 1);
  add('pIron', std({ color: 0x3c3f44, roughness: 0.45, metalness: 0.75 }), 1);
  add('pGraffiti', std({ map: graffitiTex(), transparent: true, depthWrite: false, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 1);   // tags on the handball wall
  add('pScreen', std({ map: cctvTex(), emissive: 0xffffff, emissiveMap: cctvTex(), emissiveIntensity: 0.55, roughness: 0.2 }), 1);
  add('pLight', std({ color: 0xf4f4f0, emissive: 0xf8f4e8, emissiveIntensity: 1.1, roughness: 0.3 }), 1);
  add('pLightF', std({ color: 0xf4f4f0, emissive: 0xf8f4e8, emissiveIntensity: 1.1, roughness: 0.3 }), 1);   // the tubes that go bad after the alarm
  // night lighting (prison.js drives these: dark by day, on at dusk, stuttering once the power goes bad)
  add('pFlood', std({ color: 0xd8dce0, emissive: 0xeef2ff, emissiveIntensity: 0.05, roughness: 0.3 }), 1);       // floodlight / searchlight lenses
  add('pSodium', std({ color: 0xc8b898, emissive: 0xffb060, emissiveIntensity: 0.05, roughness: 0.3 }), 1);      // wall packs, wall-top lamps
  add('pSodiumF', std({ color: 0xc8b898, emissive: 0xffb060, emissiveIntensity: 0.05, roughness: 0.3 }), 1);     // ...the ones that flicker
  add('pPoolW', poolMat(0xb8c8ff, false), 1); add('pPoolS', poolMat(0xffb868, false), 1);
  add('pPoolH', poolMat(0xffb868, true), 1); add('pPoolHF', poolMat(0xffb868, true), 1);
  add('pRed', std({ color: 0x601010, emissive: 0xff2010, emissiveIntensity: 1.4, roughness: 0.3 }), 1);
  add('pGreen', std({ color: 0x106010, emissive: 0x20ff40, emissiveIntensity: 1.2, roughness: 0.3 }), 1);
  add('pHeli', std({ map: helipadTex(), roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 1);
  add('pBlood', std({ map: bloodSmearTex(), transparent: true, depthWrite: false, roughness: 0.3, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), 1);
  add('pTile', std({ map: (() => { const t = cv(256, 256, (g, w, h) => { g.fillStyle = '#d8dcd8'; g.fillRect(0, 0, w, h); g.fillStyle = '#a8aca8'; for (let i = 0; i <= 8; i++) { g.fillRect(i * 32 - 1, 0, 2, h); g.fillRect(0, i * 32 - 1, w, 2); } const r = rng(4); speck(g, w, h, 800, ['rgba(0,0,0,0.08)'], r, 2); }); return t; })(), roughness: 0.3 }), 1.6);   // shower / kitchen wall tile
  add('pWoodDesk', M.darkWood || std({ color: 0x6a4a30, roughness: 0.5 }), 1);
  add('pFelt', std({ color: 0x2a4a3a, roughness: 1 }), 1);
  add('pCopper', std({ color: 0x7a7c78, roughness: 0.6, metalness: 0.5 }), 1);
  add('pWater', std({ color: 0x23302c, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.88 }), 1);
  add('pRazor', std({ color: 0xb8bcc0, roughness: 0.3, metalness: 0.9, side: THREE.DoubleSide }), 1);   // (double-sided: the flat razor barbs)
  // signs
  const S = (k, lines, bg, fg, w, h, size) => add(k, std({ map: stencil(lines, bg, fg, w, h, size), roughness: 0.6 }), 1);
  S('sGate', ['BLACKWATER', 'STATE PENITENTIARY · DEPARTMENT OF CORRECTIONS'], '#1e2a3a', '#e8e4d8', 1024, 256, 120);
  S('sA', ['A BLOCK', 'GENERAL POPULATION · TIERS 1–2'], '#e8e4d8', '#1a1a1a');
  S('sB', ['B BLOCK', 'GENERAL POPULATION · TIERS 1–2'], '#e8e4d8', '#1a1a1a');
  S('sInf', ['INFIRMARY', 'MEDICAL STAFF ONLY · RED CARD'], '#e8e4d8', '#9a1a14');
  S('sCaf', ['DINING HALL'], '#e8e4d8', '#1a1a1a');
  S('sLau', ['LAUNDRY', 'INMATE WORK DETAIL'], '#e8e4d8', '#1a1a1a');
  S('sWork', ['VOCATIONAL SHOP', 'TOOLS ARE COUNTED IN AND OUT'], '#e8e4d8', '#1a1a1a');
  S('sSeg', ['SEGREGATION UNIT', 'NO INMATE MOVEMENT WITHOUT ESCORT'], '#7a1a14', '#f0e8d8');
  S('sAdmin', ['ADMINISTRATION', 'VISITING · CONTROL · WARDEN'], '#1e2a3a', '#e8e4d8');
  S('sHost', ['NO HOSTAGES', 'WILL BE ALLOWED TO PASS THIS POINT'], '#d8b030', '#141414');
  S('sWarn', ['WARNING', 'NO WARNING SHOTS FIRED IN THIS AREA'], '#c8241a', '#f4f0e8');
  S('sTower', ['3'], '#e8e4d8', '#1a1a1a', 256, 256, 200);
  S('sOut', ['OUTFALL 7', 'STORM SEWER · CONFINED SPACE'], '#2a3a2a', '#e8e4d8');
  S('sCount', ['COUNT TIME', 'STAND BY YOUR DOOR'], '#e8e4d8', '#1a1a1a');
  S('sMenu', ['TUESDAY', 'OATMEAL · BURGERS · CHILI'], '#1a2a1a', '#e8e4d8');
  return M;
}

// a pool of lamplight on the ground: additive, unlit, merged with the others (one draw call); half: the lamp is on a
// wall at the decal's −z edge (local), so the light spreads out from the wall and never shows through it indoors
function poolMat(col, half) {
  const t = cv(128, 128, (g, w, h) => { const cy = half ? 0 : 64, R = half ? 128 : 64; const gr = g.createRadialGradient(64, cy, 0, 64, cy, R); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.42)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.repeat.set(1, 1);
  return new THREE.MeshBasicMaterial({ map: t, color: col, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: true, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6, visible: false });
}

// ---------------------------------------------------------------- shared geometry
let G = null;
export function geos() {
  if (G) return G;
  G = {};
  // razor wire: a concertina coil, 2 m long, 0.9 m across, ~14 loops (a thin tube round a helix)
  {
    const pts = [], L = 2, R = 0.42, n = 14, N = 240;
    for (let i = 0; i <= N; i++) { const t = i / N, a = t * n * Math.PI * 2; pts.push(new THREE.Vector3(-L / 2 + t * L + Math.sin(a) * 0.05, R + Math.sin(a) * R, Math.cos(a) * R)); }
    const curve = new THREE.CatmullRomCurve3(pts), tube = new THREE.TubeGeometry(curve, N, 0.012, 3, false).toNonIndexed();
    // [prison-real] the razor blades: a flat, pointed barb clipped to the ribbon every ~30 cm, alternating sides,
    // merged into the coil (one instanced draw for every coil on the map; phones keep the bare coil)
    if (isLow()) G.coil = tube;
    else {
      const P = [...tube.attributes.position.array], Nn = [...tube.attributes.normal.array], U = [...tube.attributes.uv.array];
      const t3 = new THREE.Vector3(), p3 = new THREE.Vector3(), o3 = new THREE.Vector3(), s3 = new THREE.Vector3();
      const NB = 120;
      for (let i = 0; i < NB; i++) {
        const u = (i + 0.5) / NB; curve.getPointAt(u, p3); curve.getTangentAt(u, t3);
        o3.set(0, p3.y - R, p3.z).normalize();   // outward from the coil's axis
        s3.crossVectors(t3, o3).normalize(); if (i % 2) s3.negate(); s3.lerp(o3, 0.5).normalize();
        const L = 0.045, W = 0.011, a = p3.clone().addScaledVector(t3, -L), b = p3.clone().addScaledVector(t3, L), c = p3.clone().addScaledVector(s3, W * 2.2).addScaledVector(t3, L * 0.3), d = p3.clone().addScaledVector(s3, -W * 0.6);
        const nn = new THREE.Vector3().crossVectors(t3, s3).normalize();
        for (const q of [a, c, b, a, b, d]) { P.push(q.x, q.y, q.z); Nn.push(nn.x, nn.y, nn.z); U.push(0, 0); }
      }
      const gg = new THREE.BufferGeometry();
      gg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); gg.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3)); gg.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
      gg.computeBoundingSphere(); gg.computeBoundingBox(); tube.dispose(); G.coil = gg;
    }
  }
  G.bar = new THREE.CylinderGeometry(0.016, 0.016, 1, 6).translate(0, 0.5, 0);
  G.pipe = new THREE.CylinderGeometry(1, 1, 1, 10).translate(0, 0.5, 0);
  G.ubox = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  G.disc = new THREE.CylinderGeometry(1, 1, 1, 18).rotateZ(Math.PI / 2);   // a plate / wheel along x
  G.ring = new THREE.TorusGeometry(0.23, 0.012, 6, 20).rotateX(Math.PI / 2);
  G.oct = new THREE.CylinderGeometry(1, 1, 1, 8).translate(0, 0.5, 0).rotateY(Math.PI / 8);
  G.ball = new THREE.SphereGeometry(1, 12, 8);
  G.cone = new THREE.ConeGeometry(1, 1, 12).translate(0, 0.5, 0);
  G.plane = new THREE.PlaneGeometry(1, 1);   // uv 0..1 (signs, decals: K.box tiles its uvs by world position)
  return G;
}

// ---------------------------------------------------------------- furniture (all merged / instanced via K)
// local-frame helper: a point (lx, lz) in a frame at (x, z) turned by yaw → world [x, z]
export const frame = (x, z, yaw) => { const c = Math.cos(yaw), s = Math.sin(yaw); return (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c]; };

// a steel bunk bed (two bunks, ladder rungs, blue vinyl mattresses, grey blankets), long side along local x
export function bunk(K, x, y, z, yaw, two = true, mess = 0) {
  const P = frame(x, z, yaw), L = 1.95, Wd = 0.78;
  const post = (lx, lz, h) => { const [px, pz] = P(lx, lz); K.box(px, y, pz, 0.025, y + h, 0.025, yaw, 'pBars'); };
  const H = two ? 1.75 : 0.62;
  for (const lx of [-L / 2, L / 2]) for (const lz of [-Wd / 2, Wd / 2]) post(lx, lz, H);
  for (const by of two ? [0.38, 1.38] : [0.38]) {
    const [cx, cz] = P(0, 0);
    K.box(cx, y + by, cz, L / 2, y + by + 0.05, Wd / 2, yaw, 'pBars');                       // the steel pan
    K.box(cx, y + by + 0.05, cz, L / 2 - 0.04, y + by + 0.15, Wd / 2 - 0.04, yaw, 'pMat');    // mattress
    const fold = mess ? 0.2 + (mess % 3) * 0.2 : 0.55;
    const [bx, bz] = P(-L / 2 + fold * L / 2 + 0.06, 0);
    K.box(bx, y + by + 0.15, bz, fold * L / 2, y + by + 0.19, Wd / 2 - 0.02, yaw, 'pWool');   // blanket (folded back)
    const [qx, qz] = P(L / 2 - 0.25, 0); K.box(qx, y + by + 0.15, qz, 0.18, y + by + 0.25, 0.26, yaw, 'white');   // pillow
  }
  return P;
}
// ---------------------------------------------------------------- the designed fronts (decor.js atlases)
// The prison's own atlas: laundry machines, vending machines, the Control console, stocked shelves, the tool wall,
// a tool chest, an eye chart, the gym poster. One material for all of them (merged per chunk).
const S = P2;
const PCELLS = [
  ['steel', (g, w, h, r) => S.brushed(g, 0, 0, w, h, r), { rough: 0.32, metal: 0.7 }],
  ['grey', (g, w, h, r) => { g.fillStyle = '#7a848c'; g.fillRect(0, 0, w, h); S.speck(g, 0, 0, w, h, 900, ['rgba(0,0,0,0.12)', 'rgba(255,255,255,0.08)'], r, 2); }, { rough: 0.5, metal: 0.4 }],
  // an industrial front-loader: control panel with dials and a coin slot, a porthole (the drum's in 3-D)
  ['washer', (g, w, h, r) => {
    S.brushed(g, 0, 0, w, h, r); g.fillStyle = '#20262c'; g.fillRect(0, 0, w, h * 0.18); S.bevel(g, 0, 0, w, h * 0.18, 2, 0.3);
    S.knob(g, w * 0.18, h * 0.09, h * 0.05); S.knob(g, w * 0.36, h * 0.09, h * 0.05);
    g.fillStyle = '#081008'; g.fillRect(w * 0.52, h * 0.05, w * 0.2, h * 0.08); S.text(g, '34:00', w * 0.62, h * 0.09, h * 0.05, '#5aff7a', 'center', 'bold', 'monospace');
    g.fillStyle = '#c0a040'; g.fillRect(w * 0.8, h * 0.04, w * 0.1, h * 0.1); g.fillStyle = '#111'; g.fillRect(w * 0.84, h * 0.06, w * 0.02, h * 0.06);
    g.fillStyle = '#3a3e42'; g.beginPath(); g.arc(w / 2, h * 0.53, w * 0.33, 0, 7); g.fill(); g.fillStyle = '#c8ccd0'; g.beginPath(); g.arc(w / 2, h * 0.53, w * 0.3, 0, 7); g.fill();
    g.fillStyle = '#1a1c1e'; g.beginPath(); g.arc(w / 2, h * 0.53, w * 0.25, 0, 7); g.fill();
    g.fillStyle = 'rgba(200,220,240,0.25)'; g.beginPath(); g.arc(w / 2 - w * 0.06, h * 0.49, w * 0.12, 0, 7); g.fill();
    g.fillStyle = '#e8e4d8'; g.fillRect(w * 0.3, h * 0.9, w * 0.4, h * 0.05); S.text(g, 'HEAVY DUTY 40 LB', w * 0.5, h * 0.925, h * 0.03, '#333');
  }, { rough: 0.3, metal: 0.65 }],
  ['dryer', (g, w, h, r) => {
    g.fillStyle = '#d8d6ce'; g.fillRect(0, 0, w, h); S.bevel(g, 0, 0, w, h, 3, 0.25);
    g.fillStyle = '#2a2e34'; g.fillRect(0, 0, w, h * 0.16); g.fillStyle = '#e04020'; g.fillRect(w * 0.1, h * 0.05, w * 0.08, h * 0.06); S.text(g, 'HIGH · MED · LOW · AIR', w * 0.58, h * 0.08, h * 0.04, '#e8e8e8', 'center', 'bold', undefined, w * 0.7);
    g.fillStyle = '#4a4e52'; g.beginPath(); g.arc(w / 2, h * 0.52, w * 0.34, 0, 7); g.fill(); g.fillStyle = '#111214'; g.beginPath(); g.arc(w / 2, h * 0.52, w * 0.28, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,140,60,0.25)'; g.beginPath(); g.arc(w / 2, h * 0.56, w * 0.2, 0, 7); g.fill();
    for (let x = w * 0.15; x < w * 0.85; x += 10) { g.fillStyle = '#5a5e62'; g.fillRect(x, h * 0.9, 6, h * 0.06); }
  }, { rough: 0.4, metal: 0.2 }],
  // vending machines (lit): sodas behind glass, snacks in spiral rows
  ['soda', (g, w, h, r) => {
    g.fillStyle = '#b8161a'; g.fillRect(0, 0, w, h);
    S.glass(g, w * 0.06, h * 0.05, w * 0.6, h * 0.7, [230, 236, 240], 1);
    const cols = ['#d8201a', '#1a4ad8', '#20a040', '#f0c020', '#f08020', '#e8e8e8'];
    for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) { g.fillStyle = cols[(i + j) % cols.length]; g.fillRect(w * (0.09 + i * 0.093), h * (0.08 + j * 0.11), w * 0.07, h * 0.08); g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(w * (0.09 + i * 0.093), h * (0.1 + j * 0.11), w * 0.07, h * 0.015); }
    g.fillStyle = '#1a1a1a'; g.fillRect(w * 0.72, h * 0.08, w * 0.22, h * 0.12); S.text(g, '$1.25', w * 0.83, h * 0.14, h * 0.05, '#ff4030', 'center', 'bold', 'monospace');
    for (let j = 0; j < 4; j++) for (let i = 0; i < 2; i++) { g.fillStyle = '#e0e0e0'; g.fillRect(w * (0.74 + i * 0.1), h * (0.26 + j * 0.07), w * 0.08, h * 0.05); }
    g.fillStyle = '#111'; g.fillRect(w * 0.1, h * 0.8, w * 0.52, h * 0.12); S.text(g, 'PUSH', w * 0.36, h * 0.86, h * 0.05, '#888');
    S.text(g, 'COLD DRINKS', w * 0.83, h * 0.6, h * 0.045, '#fff', 'center', 'bold', undefined, w * 0.22);
  }, { rough: 0.25, metal: 0.2, glow: 0.6 }],
  ['snack', (g, w, h, r) => {
    g.fillStyle = '#1e3a6a'; g.fillRect(0, 0, w, h);
    S.glass(g, w * 0.05, h * 0.04, w * 0.66, h * 0.78, [228, 232, 236], 1);
    const cols = ['#e8b020', '#d02a20', '#2a8a30', '#e85a10', '#7a3ac0', '#f0e8c0', '#3a6ad8'];
    for (let j = 0; j < 6; j++) { g.fillStyle = '#9aa0a6'; g.fillRect(w * 0.06, h * (0.16 + j * 0.12), w * 0.64, 2); for (let i = 0; i < 5; i++) { g.fillStyle = cols[(r() * cols.length) | 0]; g.fillRect(w * (0.08 + i * 0.125), h * (0.07 + j * 0.12), w * 0.1, h * 0.085); g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(w * (0.09 + i * 0.125), h * (0.09 + j * 0.12), w * 0.06, h * 0.02); } }
    g.fillStyle = '#111'; g.fillRect(w * 0.76, h * 0.08, w * 0.18, h * 0.1); S.text(g, 'A4', w * 0.85, h * 0.13, h * 0.05, '#40ff60', 'center', 'bold', 'monospace');
    for (let j = 0; j < 4; j++) for (let i = 0; i < 3; i++) { g.fillStyle = '#d8d8d8'; g.fillRect(w * (0.76 + i * 0.065), h * (0.24 + j * 0.06), w * 0.05, h * 0.045); }
    g.fillStyle = '#0a0a0a'; g.fillRect(w * 0.08, h * 0.86, w * 0.6, h * 0.1);
  }, { rough: 0.25, metal: 0.2, glow: 0.6 }],
  // the Control console top: switch banks, buttons, a phone, a mic
  ['console', (g, w, h, r) => {
    g.fillStyle = '#2a2e32'; g.fillRect(0, 0, w, h); S.speck(g, 0, 0, w, h, 400, ['rgba(255,255,255,0.05)'], r);
    for (let j = 0; j < 4; j++) for (let i = 0; i < 12; i++) { const x = w * (0.04 + i * 0.078), y = h * (0.08 + j * 0.13); g.fillStyle = '#121416'; g.fillRect(x, y, w * 0.06, h * 0.09); g.fillStyle = r() < 0.2 ? '#ff3020' : r() < 0.4 ? '#30ff50' : '#d8d8c8'; g.fillRect(x + w * 0.015, y + h * 0.015, w * 0.03, h * 0.035); }
    g.fillStyle = '#e8e4d8'; for (let i = 0; i < 12; i++) g.fillRect(w * (0.04 + i * 0.078), h * 0.62, w * 0.06, h * 0.04);
    g.fillStyle = '#111'; g.fillRect(w * 0.06, h * 0.72, w * 0.3, h * 0.22); g.fillStyle = '#333'; for (let j = 0; j < 4; j++) for (let i = 0; i < 3; i++) g.fillRect(w * (0.08 + i * 0.09), h * (0.74 + j * 0.05), w * 0.06, h * 0.035);
    g.fillStyle = '#c81a1a'; g.beginPath(); g.arc(w * 0.86, h * 0.82, h * 0.09, 0, 7); g.fill(); S.text(g, 'ALARM', w * 0.86, h * 0.96, h * 0.04, '#e8e8e8');
    S.text(g, 'DOORS · TIER 1 · TIER 2 · YARD', w * 0.6, h * 0.7, h * 0.04, '#d8d8c8', 'center', 'bold', undefined, w * 0.4);
  }, { rough: 0.4, metal: 0.3, glow: 0.25 }],
  // a steel shelf of kitchen dry stores: sacks of flour, #10 cans, boxes (one shelf bay; the 3-D uprights are separate)
  ['drystock', (g, w, h, r) => {
    g.fillStyle = '#2a2826'; g.fillRect(0, 0, w, h);
    for (let j = 0; j < 4; j++) { const y1 = (j + 1) * h / 4; g.fillStyle = '#9aa0a6'; g.fillRect(0, y1 - 6, w, 6);
      let x = 3; while (x < w - 10) { const k = r(); let bw, bh;
        if (k < 0.35) { bw = 22; bh = h / 4 * 0.55; g.fillStyle = '#b8bcc0'; g.fillRect(x, y1 - 6 - bh, bw, bh); g.fillStyle = ['#d83020', '#30a040', '#e0b020', '#f0f0e8'][(r() * 4) | 0]; g.fillRect(x, y1 - 6 - bh * 0.75, bw, bh * 0.45); }
        else if (k < 0.65) { bw = 40; bh = h / 4 * 0.7; g.fillStyle = '#e8dcc0'; g.beginPath(); g.moveTo(x, y1 - 6); g.lineTo(x + 3, y1 - 6 - bh); g.lineTo(x + bw - 3, y1 - 6 - bh); g.lineTo(x + bw, y1 - 6); g.fill(); S.text(g, ['FLOUR', 'RICE', 'SUGAR', 'OATS'][(r() * 4) | 0], x + bw / 2, y1 - 6 - bh * 0.45, 7, '#7a2a1a'); }
        else { bw = 30; bh = h / 4 * 0.6; g.fillStyle = '#b08a58'; g.fillRect(x, y1 - 6 - bh, bw, bh); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, y1 - 6 - bh * 0.55, bw, 2); S.text(g, 'USDA', x + bw / 2, y1 - 6 - bh * 0.3, 6, '#2a1a0a'); }
        x += bw + 3; } }
  }, { rough: 0.7, metal: 0.1 }],
  // the pharmacy shelf: labelled bins, pill bottles, boxes
  ['pharm', (g, w, h, r) => {
    g.fillStyle = '#dfe4e6'; g.fillRect(0, 0, w, h);
    for (let j = 0; j < 4; j++) { const y1 = (j + 1) * h / 4; g.fillStyle = '#9aa0a6'; g.fillRect(0, y1 - 5, w, 5);
      for (let i = 0; i < 5; i++) { const x = 4 + i * (w - 8) / 5, bw = (w - 8) / 5 - 4, bh = h / 4 * 0.5; g.fillStyle = ['#3a6ac8', '#e8e8e8', '#d83a2a', '#e8c030', '#40a060'][(i + j) % 5]; g.fillRect(x, y1 - 5 - bh, bw, bh); g.fillStyle = '#fff'; g.fillRect(x + bw * 0.15, y1 - 5 - bh * 0.6, bw * 0.7, bh * 0.3); g.fillStyle = '#333'; g.fillRect(x + bw * 0.22, y1 - 5 - bh * 0.48, bw * 0.56, 2);
        for (let k = 0; k < 3; k++) { g.fillStyle = r() < 0.5 ? '#e8a030' : '#f4f4f0'; g.fillRect(x + k * bw / 3 + 2, y1 - 5 - bh - 14, bw / 3 - 4, 14); g.fillStyle = '#fff'; g.fillRect(x + k * bw / 3 + 2, y1 - 5 - bh - 17, bw / 3 - 4, 4); } } }
  }, { rough: 0.4, metal: 0.1 }],
  ['tools', ...XCELLS.tools],
  ['toolchest', ...XCELLS.toolchest],
  ['eyechart', (g, w, h, r) => {
    g.fillStyle = '#f6f6f2'; g.fillRect(0, 0, w, h); g.strokeStyle = '#333'; g.lineWidth = 2; g.strokeRect(4, 4, w - 8, h - 8);
    const rows = ['E', 'F P', 'T O Z', 'L P E D', 'P E C F D', 'E D F C Z P', 'F E L O P Z D']; rows.forEach((t, i) => S.text(g, t, w / 2, h * (0.1 + i * 0.12), h * (0.11 - i * 0.012), '#111'));
    g.fillStyle = '#c81a1a'; g.fillRect(w * 0.15, h * 0.86, w * 0.7, 2);
  }, { rough: 0.9, metal: 0 }],
  ['gym', (g, w, h, r) => {
    g.fillStyle = '#1a1a1a'; g.fillRect(0, 0, w, h); g.fillStyle = '#d8b020'; g.fillRect(0, 0, w, h * 0.22); S.text(g, 'YARD RULES', w / 2, h * 0.11, h * 0.12, '#111');
    ['RE-RACK YOUR WEIGHTS', 'NO SPOTTING = NO BENCH', '20 MIN PER STATION', 'NO GATHERING > 4', 'OBEY ALL STAFF'].forEach((t, i) => S.text(g, (i + 1) + '. ' + t, w * 0.07, h * (0.33 + i * 0.13), h * 0.06, '#f0ece0', 'left', 'bold', undefined, w * 0.86));
  }, { rough: 0.7, metal: 0 }],
];
let PD = null;
export function prisonDecor(K) {
  const D = decor(K);
  if (!PD || PD.D !== D) PD = { D, PA: D.atlas('prison', PCELLS) };
  return PD;
}

// the steel toilet-sink combo against a wall (local +z = into the room)
export function toiletSink(K, x, y, z, yaw) {
  const P = frame(x, z, yaw), [ax, az] = P(0, 0.05), g = geos();
  K.box(ax, y, az, 0.28, y + 0.95, 0.14, yaw, 'pSteel');           // the chase / back unit with the basin on top
  const [bx, bz] = P(0, 0.42); K.xadd(g.pipe, K.MAT.pSteel, K.mat4(bx, y, bz, yaw, 0.2, 0.36, 0.25));      // the bowl: a rounded steel pedestal
  K.xadd(g.pipe, K.MAT.pSteel, K.mat4(bx, y + 0.36, bz, yaw, 0.21, 0.05, 0.26));                          // the rolled rim
  K.xadd(g.pipe, K.MAT.black, K.mat4(bx, y + 0.405, bz, yaw, 0.15, 0.006, 0.19), false);                   // the water
  const [dx, dz] = P(0, 0.22); K.box(dx, y + 0.82, dz, 0.2, y + 0.92, 0.1, yaw, 'pSteel');   // sink lip
  K.xadd(g.pipe, K.MAT.darkMetal || K.MAT.black, K.mat4(dx, y + 0.905, dz, yaw, 0.12, 0.018, 0.06), false);  // the basin
  const [ex, ez] = P(0.12, 0.08); K.box(ex, y + 0.95, ez, 0.02, y + 1.02, 0.02, yaw, 'chrome');   // push button tap
  const [fx, fz] = P(-0.12, 0.1); K.xadd(g.pipe, K.MAT.chrome, K.mat4(fx, y + 0.94, fz, yaw, 0.022, 0.03, 0.022), false);
  const [hx, hz] = P(-0.22, 0.17); K.xadd(g.pipe, K.MAT.white, K.mat4(hx, y + 0.62, hz, yaw, 0.055, 0.1, 0.055, Math.PI / 2, 0), false);   // a toilet roll
  K.solid(...P(0, 0.25), 0.3, 0.38, yaw, y + 0.95, 'metal', y, { vault: true });
}
// a steel mess table with four attached round stools (bolted down)
export function messTable(K, x, z, yaw, y = 0) {
  const P = frame(x, z, yaw), g = geos();
  K.box(x, y + 0.72, z, 0.95, y + 0.76, 0.45, yaw, 'pSteel');
  K.box(x, y, z, 0.08, y + 0.72, 0.08, yaw, 'pBars');
  K.box(x, y, z, 0.45, y + 0.04, 0.3, yaw, 'pBars');
  for (const [lx, lz] of [[-0.55, -0.72], [0.55, -0.72], [-0.55, 0.72], [0.55, 0.72]]) {
    const [sx, sz] = P(lx, lz);
    K.xadd(g.pipe, K.MAT.pSteel, K.mat4(sx, y + 0.44, sz, 0, 0.18, 0.04, 0.18));
    K.xadd(g.pipe, K.MAT.pBars, K.mat4(sx, y, sz, 0, 0.03, 0.44, 0.03));
    const [ax, az] = P(lx * 0.5, lz * 0.62); K.box(ax, y + 0.18, az, Math.abs(lx) * 0.5, y + 0.22, 0.025, yaw, 'pBars');
  }
  K.solid(x, z, 0.95, 0.9, yaw, y + 0.76, 'metal', y, { vault: true });
}
// a hospital bed: tubular frame, side rails, a sheeted mattress, a pillow, a blanket, a chart, a drip stand
export function hospitalBed(K, x, z, yaw, mess = false) {
  const P = frame(x, z, yaw), g = geos();
  K.box(x, 0.5, z, 1.0, 0.58, 0.45, yaw, 'pSteel');
  K.box(x, 0.58, z, 0.97, 0.72, 0.43, yaw, mess ? 'pWool' : 'pSheet');
  if (!mess) { const [bx, bz] = P(-0.45, 0); K.box(bx, 0.72, bz, 0.5, 0.75, 0.44, yaw, 'pWool'); const [cx, cz] = P(-0.02, 0); K.box(cx, 0.72, cz, 0.06, 0.765, 0.445, yaw, 'pSheet'); }   // the blanket, the turned-down sheet
  for (const lx of [-1, 1]) for (const lz of [-0.42, 0.42]) { const [px, pz] = P(lx * 0.97, lz); K.box(px, 0, pz, 0.025, 0.5, 0.025, yaw, 'pSteel'); K.xadd(g.ball, K.MAT.rubber, K.mat4(px, 0.05, pz, 0, 0.05, 0.05, 0.05)); }
  const [hx, hz] = P(1.0, 0); K.box(hx, 0.5, hz, 0.03, 1.05, 0.45, yaw, 'pSteel'); K.box(hx, 0.55, hz, 0.035, 1.0, 0.4, yaw, 'pCinderB');   // the head board
  const [fx, fz] = P(-1.0, 0); K.box(fx, 0.5, fz, 0.03, 0.9, 0.45, yaw, 'pSteel');
  { const [px, pz] = P(-1.04, 0); K.box(px, 0.62, pz, 0.008, 0.84, 0.12, yaw, 'white'); K.box(px - 0.0001, 0.8, pz, 0.01, 0.84, 0.13, yaw, 'chrome'); }   // the chart on its clipboard
  for (const lz of [-0.47, 0.47]) { const [rx, rz] = P(0.2, lz); K.box(rx, 0.78, rz, 0.55, 0.82, 0.012, yaw, 'chrome'); for (const lx of [-0.3, 0.2, 0.7]) { const [qx, qz] = P(lx, lz); K.box(qx, 0.72, qz, 0.01, 0.8, 0.01, yaw, 'chrome'); } }
  const [ix, iz] = P(0.8, 0.6); K.xadd(g.pipe, K.MAT.chrome, K.mat4(ix, 0, iz, 0, 0.012, 1.9, 0.012)); K.box(ix, 1.75, iz, 0.06, 1.93, 0.02, yaw, 'frosted');
  K.xadd(g.pipe, K.MAT.darkMetal || K.MAT.black, K.mat4(ix, 0.02, iz, 0, 0.2, 0.03, 0.2));
  const [qx, qz] = P(0.72, 0); K.box(qx, 0.72, qz, 0.2, 0.84, 0.3, yaw, 'white');
  K.solid(x, z, 1.0, 0.47, yaw, 0.82, 'metal', 0, { vault: true });
}
// a front-loading industrial washer / dryer: a designed front, a chrome porthole ring, the door glass
export function washer(K, x, z, yaw, dryer = false) {
  const P = frame(x, z, yaw), g = geos(), { D, PA } = prisonDecor(K);
  D.abox(PA, { pz: dryer ? 'dryer' : 'washer', side: dryer ? 'grey' : 'steel', top: dryer ? 'grey' : 'steel' }, x, 0.06, z, 0.55, 1.45, 0.5, yaw);
  K.box(x, 0, z, 0.5, 0.06, 0.45, yaw, 'black');
  const [dx, dz] = P(0, 0.505); K.xadd(g.disc, K.MAT.chrome, K.mat4(dx, 0.76, dz, yaw + Math.PI / 2, 0.03, 0.3, 0.3));
  const [ex, ez] = P(0, 0.53); K.xadd(g.disc, dryer ? K.MAT.darkMetal : K.MAT.glass, K.mat4(ex, 0.76, ez, yaw + Math.PI / 2, 0.02, 0.24, 0.24));
  const [hx, hz] = P(0.3, 0.54); K.box(hx, 0.7, hz, 0.02, 0.82, 0.02, yaw, 'chrome');
  K.solid(x, z, 0.55, 0.5, yaw, 1.45, 'metal');
}
// a heavy workbench: steel frame, butcher-block top, a drawer pedestal, a vise, tools on it
export function workbench(K, x, z, yaw) {
  const P = frame(x, z, yaw), g = geos(), { D, PA } = prisonDecor(K);
  K.box(x, 0.86, z, 1.2, 0.92, 0.4, yaw, 'dzButcher');
  for (const lx of [-1.12, 1.12]) for (const lz of [-0.33, 0.33]) { const [px, pz] = P(lx, lz); K.box(px, 0, pz, 0.03, 0.86, 0.03, yaw, 'darkMetal'); }
  K.box(x, 0.18, z, 1.15, 0.21, 0.36, yaw, 'darkMetal');
  { const [px, pz] = P(-0.75, 0); D.abox(PA, { pz: 'toolchest', side: 'toolchest', top: 'grey' }, px, 0.21, pz, 0.32, 0.84, 0.34, yaw); }   // a drawer pedestal under one end
  const [vx, vz] = P(0.9, 0.25); K.box(vx, 0.92, vz, 0.09, 1.0, 0.1, yaw, 'bluePaint'); K.box(vx, 1.0, vz, 0.11, 1.1, 0.06, yaw, 'bluePaint');
  { const [sx, sz] = P(0.9, 0.42); K.xadd(g.pipe, K.MAT.chrome, K.mat4(sx, 1.04, sz, yaw, 0.012, 0.3, 0.012, Math.PI / 2, 0), false); }   // the vise handle
  const [tx, tz] = P(-0.4, 0); K.box(tx, 0.92, tz, 0.25, 1.0, 0.12, yaw, 'redPaint'); K.box(tx, 1.0, tz, 0.2, 1.03, 0.015, yaw, 'chrome');   // a tool box
  { const [hx, hz] = P(0.2, 0.1); K.box(hx, 0.92, hz, 0.12, 0.94, 0.015, yaw + 0.4, 'darkWood'); const [kx, kz] = P(0.29, 0.13); K.box(kx, 0.92, kz, 0.03, 0.97, 0.05, yaw + 0.4, 'metal'); }   // a hammer
  { const [hx, hz] = P(0.45, -0.2); K.box(hx, 0.92, hz, 0.2, 0.93, 0.15, yaw - 0.2, 'white'); }   // a work order
  K.solid(x, z, 1.2, 0.4, yaw, 0.92, 'metal', 0, { vault: true });
}
// weight bench with a loaded bar on the rack
export function weightBench(K, x, z, yaw) {
  const P = frame(x, z, yaw), g = geos();
  K.box(x, 0.38, z, 0.6, 0.46, 0.15, yaw, 'pRubber');
  for (const lx of [-0.5, 0.5]) { const [px, pz] = P(lx, 0); K.box(px, 0, pz, 0.04, 0.38, 0.2, yaw, 'pIron'); }
  for (const lz of [-0.4, 0.4]) { const [px, pz] = P(-0.45, lz); K.box(px, 0, pz, 0.03, 1.0, 0.03, yaw, 'pIron'); }
  const [bx, bz] = P(-0.45, 0); K.xadd(g.pipe, K.MAT.chrome, K.mat4(bx, 1.02, bz, yaw, 0.015, 2.0, 0.015, Math.PI / 2, 0));
  for (const lz of [-0.82, 0.82]) for (const k of [0, 1]) { const [px, pz] = P(-0.45, lz + Math.sign(lz) * k * 0.05); K.xadd(g.disc, K.MAT.pIron, K.mat4(px, 1.02, pz, yaw + Math.PI / 2, 0.025, 0.22 - k * 0.04, 0.22 - k * 0.04)); }
  K.solid(x, z, 0.6, 0.45, yaw, 1.05, 'metal', 0, { vault: true });
  { const [rx, rz] = P(-0.45, 0); K.solid(rx, rz, 0.08, 1.0, yaw, 1.25, 'metal', 0.78); }   // the loaded bar sticks out past the bench
}
// an office desk with a drawer pedestal, a monitor, keyboard, mouse, paper stack, a mug and a chair
export function desk(K, x, z, yaw, mat = 'pWoodDesk') {
  const P = frame(x, z, yaw), { D } = prisonDecor(K), g = geos();
  K.box(x, 0.72, z, 0.8, 0.76, 0.4, yaw, mat);
  { const [px, pz] = P(-0.75, 0); K.box(px, 0, pz, 0.03, 0.72, 0.38, yaw, mat); }
  { const [px, pz] = P(0.55, 0); D.abox(D.A, { pz: 'drawers3', side: 'white', top: 'white' }, px, 0.02, pz, 0.22, 0.72, 0.36, yaw + Math.PI); }   // the drawer pedestal (drawers on the sitter's side)
  { const [px, pz] = P(0, -0.37); K.box(px, 0.3, pz, 0.72, 0.72, 0.012, yaw, mat); }   // the modesty panel
  const [mx, mz] = P(0, -0.22); K.box(mx, 0.76, mz, 0.24, 1.12, 0.03, yaw, 'black'); K.box(mx, 0.8, mz, 0.22, 1.1, 0.032, yaw, 'pScreen');
  { const [sx, sz] = P(0, -0.28); K.box(sx, 0.76, sz, 0.1, 0.78, 0.08, yaw, 'black'); }
  const [kx, kz] = P(0, 0.08); K.box(kx, 0.76, kz, 0.22, 0.78, 0.07, yaw, 'black');
  { const [qx, qz] = P(0.3, 0.1); K.box(qx, 0.76, qz, 0.03, 0.785, 0.05, yaw, 'black'); }
  const [ax, az] = P(0.5, 0.05); K.box(ax, 0.76, az, 0.12, 0.8, 0.16, yaw, 'white');
  { const [cx2, cz2] = P(-0.5, 0.1); K.xadd(g.pipe, K.MAT.white, K.mat4(cx2, 0.76, cz2, 0, 0.04, 0.1, 0.04), false); }   // a mug
  const [cx, cz] = P(0, 0.75); K.box(cx, 0.42, cz, 0.24, 0.5, 0.24, yaw, 'black'); K.box(cx, 0, cz, 0.03, 0.42, 0.03, yaw, 'chrome');
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; K.box(cx + Math.cos(a) * 0.15, 0.02, cz + Math.sin(a) * 0.15, 0.13, 0.05, 0.02, -a, 'black'); }   // the five-star base
  const [bx, bz] = P(0, 0.98); K.box(bx, 0.5, bz, 0.22, 1.05, 0.03, yaw, 'black');
  K.solid(x, z, 0.8, 0.4, yaw, 0.76, 'wood', 0, { vault: true });
  { const [sx, sz] = P(0, 0.76); K.solid(sx, sz, 0.25, 0.25, yaw, 1.05, 'wood', 0); }   // the chair (you don't walk through it)
}
// a row of grey steel lockers along local x (n doors: louvres, number plates, latches)
export function lockers(K, x, z, yaw, n = 6) {
  const P = frame(x, z, yaw), w = n * 0.38, { D } = prisonDecor(K), units = Math.max(1, Math.round(n / 2)), uw = w / units;
  for (let i = 0; i < units; i++) { const [ux, uz] = P(-w / 2 + uw * (i + 0.5), 0); D.abox(D.A, { pz: 'locker', side: 'steel', top: 'steel' }, ux, 0.08, uz, uw / 2 - 0.004, 1.85, 0.25, yaw); }
  K.box(x, 0, z, w / 2, 0.08, 0.22, yaw, 'dzPlinth');
  K.solid(x, z, w / 2, 0.25, yaw, 1.85, 'metal');
}
// a wall sign: a thin plate, the sign texture facing local +z
export function sign(K, x, y, z, yaw, mat, w, h) {
  K.box(x, y, z, w / 2 + 0.02, y + h, 0.02, yaw, 'darkMetal');
  K.xadd(geos().plane, K.MAT[mat], K.mat4(x + Math.sin(yaw) * 0.023, y + h / 2, z + Math.cos(yaw) * 0.023, yaw, w, h, 1), false);
}
// a flat decal on the ground (or a floor at y): uv 0..1, any yaw
export function decal(K, x, y, z, w, d, yaw, mat) { K.xadd(geos().plane, K.MAT[mat], K.mat4(x, y, z, yaw, w, d, 1, -Math.PI / 2, 0), false); }
// a ceiling strip light (emissive, no PointLight)
// (every fifth one is on the bad circuit: it flickers once the power starts failing — prison.js drives 'pLightF')
let stripN = 0;
export function strip(K, x, y, z, yaw, len = 1.2) { const m = stripN++ % 5 === 2 ? 'pLightF' : 'pLight'; K.box(x, y - 0.06, z, len / 2, y, 0.09, yaw, f => f === 'bot' ? m : 'white'); }
