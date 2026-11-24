// Zombie_Apocalypse — DESERT VILLAGE: the building kit.
// Everything the desert map draws with: its own canvas textures (lime plaster over mud brick, sandstone, palm
// fronds, sun-bleached planks, striped awning cloth, the sand), a geometry builder that merges boxes and one-off
// shapes per material per 55 m chunk, instanced props per 40 m cell, plank doors that swing (the same door record
// world.js uses, so main.js / zombies.js open, bang on and break them), searchable containers, walkable roofs and
// stairs (W.decks / W.ramps), and the outbreak layer (chaos) — through the host's chaos() when the map system
// passes one in, or a compatible group of our own when it doesn't.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const CH = 55;
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export function rng(seed) { let s = seed >>> 0 || 1; return () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------------------------------------------------------------- textures (canvas, generated once)
const R0 = rng(4242);
function canvas(w, h, fn, rep = null, srgb = true) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; fn(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; if (rep) t.repeat.set(rep[0], rep[1]);
  return t;
}
const rgb = (c, k = 1, a = 1) => `rgba(${clamp(c[0] * k, 0, 255) | 0},${clamp(c[1] * k, 0, 255) | 0},${clamp(c[2] * k, 0, 255) | 0},${a})`;
function speckle(g, w, h, n, cols, r = rng(7), sz = 2) { for (let i = 0; i < n; i++) { g.fillStyle = cols[(r() * cols.length) | 0]; const s = 0.5 + r() * sz; g.fillRect(r() * w, r() * h, s, s); } }
function blotch(g, w, h, n, col, rMin, rMax, r = rng(9)) {
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * h, rad = rMin + r() * (rMax - rMin), gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr;
    for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) { g.save(); g.translate(ox, oy); g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill(); g.restore(); }
  }
}
// lime/mud plaster: soft trowel blotches, hairline cracks, a band of rising damp and splashed dirt at the foot
function plasterTex(base, seed, patches = 1) {
  const r = rng(seed);
  return canvas(512, 512, (g, w, h) => {
    g.fillStyle = rgb(base); g.fillRect(0, 0, w, h);
    blotch(g, w, h, 60, rgb(base, 1.05, 0.12), 20, 70, r); blotch(g, w, h, 60, rgb(base, 0.92, 0.12), 15, 60, r);
    // dust and rain streaks run down from the top, a band of splashed dirt along the foot
    for (let i = 0; i < 40; i++) { const x = r() * w, gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, rgb(base, 0.8, 0.12)); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x, 0, 2 + r() * 6, h * (0.2 + r() * 0.6)); }
    speckle(g, w, h, 9000, [rgb(base, 0.86, 0.35), rgb(base, 1.1, 0.35), rgb(base, 0.78, 0.25)], r, 1.4);
    // patches where the plaster has fallen off and the mud brick shows through
    for (let i = 0; i < patches; i++) {
      const px = r() * w, py = r() * h * 0.8, pw = 22 + r() * 34, ph = 16 + r() * 22;
      g.save(); g.beginPath(); for (let a = 0; a < 6.28; a += 0.5) { const rr = 0.7 + r() * 0.4; g.lineTo(px + Math.cos(a) * pw * rr, py + Math.sin(a) * ph * rr); } g.closePath(); g.clip();
      g.fillStyle = rgb([158, 122, 88]); g.fillRect(px - pw, py - ph, pw * 2, ph * 2);
      g.fillStyle = rgb([118, 88, 62]); for (let y = py - ph; y < py + ph; y += 14) { g.fillRect(px - pw, y, pw * 2, 2); const off = ((y / 14) | 0) % 2 ? 0 : 18; for (let x = px - pw + off; x < px + pw; x += 36) g.fillRect(x, y, 2, 14); }
      g.restore(); g.strokeStyle = rgb(base, 0.72, 0.7); g.lineWidth = 1.5; g.beginPath(); g.ellipse(px, py, pw * 0.95, ph * 0.95, 0, 0, 7); g.stroke();
    }
    g.strokeStyle = rgb(base, 0.6, 0.55); g.lineWidth = 0.8;
    for (let i = 0; i < 14; i++) { let x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 8; k++) { x += (r() - 0.5) * 22; y += r() * 14; g.lineTo(x, y); } g.stroke(); }
    // [realism] rain erosion: wandering runnels the rare storms cut down the mud render (a dark groove with a lit lip,
    // so the normal map reads them as real grooves), trowel sweeps, and broad sun-bleached / shaded areas
    for (let i = 0; i < 10; i++) {
      let x = 12 + r() * (w - 24), y = 8 + r() * h * 0.4; const len = h * (0.2 + r() * 0.35), wd = 1.5 + r() * 2.5; g.lineCap = 'round';
      const pts = [[x, y]]; while (y < pts[0][1] + len) { y += 6 + r() * 8; x += (r() - 0.5) * 5; pts.push([x, y]); }
      for (const [dx, col, lw] of [[1.2, rgb(base, 1.12, 0.45), wd * 0.6], [0, rgb(base, 0.68, 0.5), wd]]) { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); pts.forEach(([px, py], k) => k ? g.lineTo(px + dx, py) : g.moveTo(px + dx, py)); g.stroke(); }
    }
    g.lineCap = 'butt';
    for (let i = 0; i < 26; i++) { const rad = 30 + r() * 50, x = rad + 6 + r() * (w - 2 * rad - 12), y = rad + 6 + r() * (h - 2 * rad - 12); g.strokeStyle = rgb(base, r() < 0.5 ? 0.9 : 1.08, 0.12); g.lineWidth = 3 + r() * 5; g.beginPath(); g.arc(x, y, rad, -0.4 - r(), 0.4 + r()); g.stroke(); }
    blotch(g, w, h, 8, rgb(base, 1.1, 0.14), 80, 160, r); blotch(g, w, h, 8, rgb(base, 0.86, 0.14), 80, 160, r);
  });
}
function mudBrickTex() {
  const r = rng(31);
  return canvas(512, 512, (g, w, h) => {
    // sun-dried mud bricks in a mud mortar of nearly the same earth: soft, worn edges, low contrast
    g.fillStyle = '#8c6a48'; g.fillRect(0, 0, w, h);
    const bh = 32, bw = 64;
    for (let y = 0; y < h; y += bh) for (let x = ((y / bh) % 2) * bw / 2 - bw; x < w; x += bw) {
      const k = 0.93 + r() * 0.12, rr = 5 + r() * 4;
      g.fillStyle = rgb([164, 124, 86], k); g.beginPath(); if (g.roundRect) g.roundRect(x + 2.5, y + 2.5, bw - 5, bh - 5, rr); else g.rect(x + 2.5, y + 2.5, bw - 5, bh - 5); g.fill();
      for (let i = 0; i < 26; i++) { g.fillStyle = rgb([128, 94, 62], 0.95 + r() * 0.15, 0.28); g.fillRect(x + 4 + r() * (bw - 10), y + 4 + r() * (bh - 10), 3 + r() * 5, 1); }   // straw
      g.fillStyle = 'rgba(214,184,146,0.16)'; g.fillRect(x + 5, y + 3, bw - 10, 2);
    }
    blotch(g, w, h, 40, 'rgba(150,112,76,0.22)', 20, 70, r); blotch(g, w, h, 30, 'rgba(200,166,124,0.18)', 20, 60, r);
    speckle(g, w, h, 2200, ['rgba(214,190,150,0.22)', 'rgba(70,48,30,0.2)'], r, 1.2);
  });
}
function sandstoneTex() {
  const r = rng(51);
  return canvas(512, 512, (g, w, h) => {
    // irregular flags in courses of different heights, each stone its own width and shade, sandy grout between
    g.fillStyle = '#8e7454'; g.fillRect(0, 0, w, h);
    const rows = [0, 96, 176, 272, 368, 432, 512];
    for (let ri = 0; ri < rows.length - 1; ri++) {
      const y0 = rows[ri], y1 = rows[ri + 1]; let x = -r() * 60;
      while (x < w) {
        const sw = 70 + r() * 110, x1 = Math.min(x + sw, w + 0.01), k = 0.9 + r() * 0.13, tint = r() < 0.2 ? [200, 160, 118] : r() < 0.5 ? [204, 176, 136] : [196, 168, 128];   // [realism] one quarry, close shades
        // the stone may wrap round the right edge (so the texture still tiles)
        for (const ox of x + sw > w ? [0, -w] : [0]) {
          const a = x + ox + 2.5, b = x + ox + sw - 2.5, jt = (r() - 0.5) * 3;
          const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, rgb(tint, k * 1.06)); gr.addColorStop(1, rgb(tint, k * 0.9));
          g.fillStyle = gr; g.beginPath(); g.moveTo(a + 2, y0 + 2.5 + jt); g.lineTo(b - 1, y0 + 2.5); g.lineTo(b, y1 - 3); g.lineTo(a + 1, y1 - 2.5 - jt); g.closePath(); g.fill();
          g.strokeStyle = 'rgba(120,90,60,0.22)'; g.lineWidth = 1;
          for (let q = 0; q < 4; q++) { const yy = y0 + 8 + r() * (y1 - y0 - 16); g.beginPath(); g.moveTo(a + 3, yy); g.bezierCurveTo(a + (b - a) * 0.3, yy + 3, a + (b - a) * 0.7, yy - 3, b - 3, yy); g.stroke(); }
          g.fillStyle = 'rgba(255,240,210,0.16)'; g.fillRect(a + 2, y0 + 3, b - a - 4, 2);   // a worn top arris
          g.fillStyle = 'rgba(60,40,22,0.2)'; g.fillRect(a + 2, y1 - 6, b - a - 4, 3);
          if (r() < 0.3) { g.fillStyle = 'rgba(70,50,30,0.35)'; g.beginPath(); g.ellipse(a + r() * (b - a), y0 + r() * (y1 - y0), 2 + r() * 6, 1.5 + r() * 3, r() * 3, 0, 7); g.fill(); }   // a pit, a chip
        }
        x = x1;
      }
    }
    speckle(g, w, h, 9000, ['rgba(80,56,30,0.28)', 'rgba(240,220,180,0.3)'], r, 1.4);
    // [realism] weathering: wind-blown sand settled over the stones, grime in low spots, sun-bleached faces, lichen dots
    blotch(g, w, h, 34, 'rgba(206,178,136,0.32)', 18, 70, r); blotch(g, w, h, 26, 'rgba(96,70,44,0.16)', 14, 55, r); blotch(g, w, h, 14, 'rgba(250,236,206,0.14)', 30, 90, r);
    for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '110,100,70' : '70,60,44'},${0.12 + r() * 0.16})`; g.beginPath(); g.arc(r() * w, r() * h, 1 + r() * 3.5, 0, 7); g.fill(); }
    speckle(g, w, h, 5000, ['rgba(196,168,124,0.4)', 'rgba(60,44,28,0.22)'], r, 1);
  });
}
function sandTex() {
  const r = rng(61);
  return canvas(512, 512, (g, w, h) => {
    g.fillStyle = '#d2b083'; g.fillRect(0, 0, w, h);
    blotch(g, w, h, 40, 'rgba(236,206,160,0.35)', 30, 90, r); blotch(g, w, h, 40, 'rgba(170,130,90,0.25)', 30, 90, r);
    // wind ripples
    g.strokeStyle = 'rgba(150,112,72,0.22)'; g.lineWidth = 2;
    for (let y = -20; y < h + 20; y += 9) { g.beginPath(); for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin(x * 0.05 + y * 0.3) * 4 + Math.sin(x * 0.013 + y) * 6); g.stroke(); }
    g.strokeStyle = 'rgba(250,230,190,0.18)';
    for (let y = -16; y < h + 20; y += 9) { g.beginPath(); for (let x = 0; x <= w; x += 8) g.lineTo(x, y + 2 + Math.sin(x * 0.05 + y * 0.3) * 4 + Math.sin(x * 0.013 + y) * 6); g.stroke(); }
    speckle(g, w, h, 14000, ['rgba(120,90,60,0.5)', 'rgba(255,240,210,0.5)', 'rgba(90,70,50,0.4)'], r, 1.2);
    for (let i = 0; i < 120; i++) { g.fillStyle = rgb([130, 110, 90], 0.7 + r() * 0.5); g.beginPath(); g.ellipse(r() * w, r() * h, 1 + r() * 3, 1 + r() * 2, r() * 3, 0, 7); g.fill(); }   // pebbles
  });
}
function rockTex() {
  const r = rng(71);
  return canvas(512, 512, (g, w, h) => {
    // mesa strata: bands of rust, ochre and bone, eroded edges
    let y = 0, prev = null; while (y < h) {
      const bh = 10 + r() * 40, k = r(), c = k < 0.33 ? [168, 92, 58] : k < 0.66 ? [190, 136, 90] : [206, 172, 136], kk = 0.86 + r() * 0.2;
      const gr = g.createLinearGradient(0, y - 6, 0, y + bh); gr.addColorStop(0, prev || rgb(c, kk)); gr.addColorStop(Math.min(0.5, 12 / bh), rgb(c, kk)); gr.addColorStop(1, rgb(c, kk * 0.94));
      g.fillStyle = gr; g.fillRect(0, y - 6, w, bh + 7); prev = rgb(c, kk * 0.94); y += bh;
    }
    // the last band blends back into the first, so the strata still tile
    { const gr = g.createLinearGradient(0, h - 14, 0, h); gr.addColorStop(0, 'rgba(0,0,0,0)'); const c0 = g.getImageData(4, 2, 1, 1).data; gr.addColorStop(1, `rgba(${c0[0]},${c0[1]},${c0[2]},1)`); g.fillStyle = gr; g.fillRect(0, h - 14, w, 14); }
    blotch(g, w, h, 40, 'rgba(120,70,40,0.18)', 20, 80, r); blotch(g, w, h, 30, 'rgba(230,200,160,0.14)', 20, 80, r);
    for (let i = 0; i < 60; i++) { g.strokeStyle = 'rgba(70,40,24,0.35)'; g.lineWidth = 1 + r() * 2; g.beginPath(); let x = r() * w, yy = r() * h; g.moveTo(x, yy); for (let k = 0; k < 5; k++) { yy += 6 + r() * 20; x += (r() - 0.5) * 10; g.lineTo(x, yy); } g.stroke(); }
    speckle(g, w, h, 12000, ['rgba(60,30,18,0.35)', 'rgba(255,230,200,0.3)'], r, 1.8);
  });
}
function plankTex(col, seed) {
  const r = rng(seed);
  return canvas(256, 512, (g, w, h) => {
    const pw = w / 4;
    for (let i = 0; i < 4; i++) {
      g.fillStyle = rgb(col, 0.85 + r() * 0.25); g.fillRect(i * pw, 0, pw, h);
      g.strokeStyle = rgb(col, 0.7, 0.5); for (let k = 0; k < 14; k++) { g.lineWidth = 0.6 + r(); g.beginPath(); const x = i * pw + r() * pw; g.moveTo(x, 0); g.bezierCurveTo(x + (r() - 0.5) * 8, h / 3, x + (r() - 0.5) * 8, h * 0.66, x + (r() - 0.5) * 6, h); g.stroke(); }
      // paint flaking off: the bare grey wood under it
      for (let k = 0; k < 16; k++) { const fx = i * pw + 4 + r() * (pw - 8), fy = r() * h, fw = 0.8 + r() * 2.2, fh = 4 + r() * 14; g.fillStyle = 'rgba(150,140,120,0.8)'; g.beginPath(); g.ellipse(fx, fy, fw, fh, (r() - 0.5) * 0.1, 0, 7); g.fill(); g.fillStyle = 'rgba(20,14,8,0.25)'; g.fillRect(fx - fw, fy - fh, fw * 2, 1); }
      g.fillStyle = 'rgba(20,14,8,0.7)'; g.fillRect(i * pw, 0, 2, h);
    }
  });
}
function woodTex() {   // the rough-hewn beams (vigas, lintels, stall posts)
  const r = rng(81);
  return canvas(128, 512, (g, w, h) => {
    g.fillStyle = '#6a4c30'; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 40; k++) { g.strokeStyle = `rgba(${r() < 0.5 ? '40,26,14' : '140,104,70'},0.45)`; g.lineWidth = 0.5 + r() * 2; g.beginPath(); const x = r() * w; g.moveTo(x, 0); g.bezierCurveTo(x + (r() - 0.5) * 20, h / 3, x + (r() - 0.5) * 20, h * 0.6, x, h); g.stroke(); }
    for (let k = 0; k < 6; k++) { g.fillStyle = 'rgba(40,24,12,0.6)'; g.beginPath(); g.ellipse(r() * w, r() * h, 3 + r() * 4, 6 + r() * 8, 0, 0, 7); g.fill(); }
  });
}
function clothTex(a, b, seed) {   // awning cloth: wide stripes, sun-faded, stained
  const r = rng(seed);
  return canvas(256, 256, (g, w, h) => {
    for (let x = 0; x < w; x += 32) { g.fillStyle = (x / 32) % 2 ? a : b; g.fillRect(x, 0, 32, h); }
    blotch(g, w, h, 18, 'rgba(255,245,220,0.25)', 20, 60, r); blotch(g, w, h, 10, 'rgba(70,50,30,0.18)', 10, 40, r);
    for (let y = 0; y < h; y += 2) { g.fillStyle = 'rgba(0,0,0,0.05)'; g.fillRect(0, y, w, 1); }
  });
}
function frondTex() {
  const r = rng(91);
  return canvas(256, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = '#6a5a2a'; g.lineWidth = 5; g.beginPath(); g.moveTo(w / 2, h); g.quadraticCurveTo(w / 2 + 6, h / 2, w / 2, 0); g.stroke();
    for (let y = 8; y < h - 10; y += 7) {
      const t = y / h, len = (w / 2 - 6) * Math.sin(Math.PI * Math.min(1, (1 - t) * 1.05 + 0.04)) * (0.85 + r() * 0.2), droop = 26 + t * 10;
      for (const sd of [-1, 1]) {
        const dry = r() < 0.12 + t * 0.15;
        g.strokeStyle = dry ? `rgb(${150 + r() * 30},${120 + r() * 20},60)` : `rgb(${50 + r() * 30},${90 + r() * 40},${30 + r() * 20})`;
        g.lineWidth = 3 + r() * 2; g.beginPath(); g.moveTo(w / 2, y); g.quadraticCurveTo(w / 2 + sd * len * 0.5, y + droop * 0.3, w / 2 + sd * len, y + droop); g.stroke();
      }
    }
  });
}
// the dead fronds that hang down the trunk (the "skirt"): dry, straw-brown, ragged, with gaps you see through
function frondDeadTex() {
  const r = rng(92);
  return canvas(256, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = '#6a5434'; g.lineWidth = 6; g.beginPath(); g.moveTo(w / 2, h); g.quadraticCurveTo(w / 2 - 4, h / 2, w / 2, 0); g.stroke();
    for (let y = 8; y < h - 8; y += 6) {
      const t = y / h, len = (w / 2 - 8) * (0.55 + 0.4 * Math.sin(Math.PI * Math.min(1, (1 - t) * 1.05 + 0.05))) * (0.7 + r() * 0.3);
      for (const sd of [-1, 1]) {
        if (r() < 0.18) continue;   // broken-off leaflets
        const k = r(); g.strokeStyle = k < 0.4 ? `rgb(${150 + r() * 30 | 0},${116 + r() * 20 | 0},${70 + r() * 16 | 0})` : k < 0.8 ? `rgb(${118 + r() * 20 | 0},${90 + r() * 16 | 0},${56 + r() * 12 | 0})` : `rgb(${176 + r() * 24 | 0},${150 + r() * 20 | 0},${104 + r() * 16 | 0})`;
        g.lineWidth = 2.5 + r() * 2; g.beginPath(); g.moveTo(w / 2, y); g.quadraticCurveTo(w / 2 + sd * len * 0.45, y + 4 + r() * 8, w / 2 + sd * len * (0.75 + r() * 0.25), y + 14 + r() * 16); g.stroke();
      }
    }
  });
}
// a prickly pear / saguaro skin: vertical ribs (lit crest, shadowed furrow), dust in the furrows, spine clusters on the crests
function cactusTex() {
  const r = rng(93);
  return canvas(256, 256, (g, w, h) => {
    const nR = 8, rw = w / nR;
    for (let x = 0; x < w; x++) { const ph = (x % rw) / rw, k = 0.66 + 0.4 * Math.sin(ph * Math.PI); g.fillStyle = rgb([84, 118, 64], k); g.fillRect(x, 0, 1, h); }
    blotch(g, w, h, 30, 'rgba(196,176,128,0.2)', 10, 40, r);   // dust
    for (let i = 0; i < nR; i++) { g.fillStyle = 'rgba(170,150,110,0.28)'; g.fillRect(i * rw - 1.5, 0, 3, h); }
    for (let i = 0; i < nR; i++) for (let y = 4 + r() * 8; y < h; y += 13 + r() * 4) { const x = i * rw + rw / 2; g.fillStyle = 'rgba(236,226,190,0.9)'; g.beginPath(); g.arc(x, y, 1.6, 0, 7); g.fill(); g.strokeStyle = 'rgba(240,232,200,0.7)'; g.lineWidth = 0.6; for (let q = 0; q < 4; q++) { const a = r() * 6.28; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 5, y + Math.sin(a) * 5); g.stroke(); } }
    speckle(g, w, h, 1500, ['rgba(40,60,30,0.3)', 'rgba(210,200,150,0.25)'], r, 1.2);
  });
}
// a heap of ground spice: powder with grains, darker shading at the foot, lighter at the crown
function spiceTex(col, seed) {
  const r = rng(seed);
  return canvas(128, 128, (g, w, h) => {
    g.fillStyle = rgb(col); g.fillRect(0, 0, w, h);
    blotch(g, w, h, 16, rgb(col, 1.18, 0.3), 8, 30, r); blotch(g, w, h, 16, rgb(col, 0.75, 0.3), 8, 30, r);
    speckle(g, w, h, 4000, [rgb(col, 0.55, 0.7), rgb(col, 1.3, 0.6), rgb(col, 0.85, 0.8), 'rgba(40,24,10,0.4)'], r, 1.6);
  });
}
// a plastic jerrycan: moulded panel lines, scuffs, a little dust
function jerryTex(col, seed) {
  const r = rng(seed);
  return canvas(128, 128, (g, w, h) => {
    g.fillStyle = rgb(col); g.fillRect(0, 0, w, h);
    g.strokeStyle = rgb(col, 0.7, 0.8); g.lineWidth = 3; g.strokeRect(16, 18, w - 32, h - 36); g.beginPath(); g.moveTo(16, 18); g.lineTo(w - 16, h - 18); g.moveTo(w - 16, 18); g.lineTo(16, h - 18); g.stroke();
    g.strokeStyle = rgb(col, 1.25, 0.5); g.lineWidth = 1; g.strokeRect(18, 20, w - 36, h - 40);
    for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${0.05 + r() * 0.12})`; g.fillRect(r() * w, r() * h, 1 + r() * 10, 1); }
    blotch(g, w, h, 6, 'rgba(160,130,90,0.25)', 10, 30, r);
  });
}
// fired clay: speckled body, throwing rings round the pot (horizontal in the texture = round the lathe), a painted band
function clayTex(col, seed) {
  const r = rng(seed);
  return canvas(256, 256, (g, w, h) => {
    g.fillStyle = rgb(col); g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 3 + r() * 4) { g.fillStyle = rgb(col, 0.86 + r() * 0.24, 0.35); g.fillRect(0, y, w, 1 + r() * 2); }
    blotch(g, w, h, 18, rgb(col, 1.15, 0.25), 10, 40, r); blotch(g, w, h, 14, 'rgba(60,36,20,0.2)', 10, 40, r);
    g.fillStyle = 'rgba(50,26,14,0.55)'; g.fillRect(0, h * 0.42, w, 5); g.fillRect(0, h * 0.5, w, 2);
    for (let x = 0; x < w; x += 16) { g.beginPath(); g.moveTo(x, h * 0.44 + 6); g.lineTo(x + 8, h * 0.44 + 14); g.lineTo(x + 16, h * 0.44 + 6); g.strokeStyle = 'rgba(50,26,14,0.5)'; g.lineWidth = 1.5; g.stroke(); }
    speckle(g, w, h, 2500, ['rgba(255,230,200,0.25)', 'rgba(40,20,10,0.3)'], r, 1.2);
  });
}
// desert scrub (creosote, saltbush): a tangle of grey twigs and small dusty olive leaves
function scrubTex() {
  const r = rng(94);
  return canvas(256, 256, (g, w, h) => {
    g.fillStyle = '#5a5a3a'; g.fillRect(0, 0, w, h);
    blotch(g, w, h, 40, 'rgba(40,40,26,0.4)', 8, 30, r);
    g.strokeStyle = 'rgba(70,58,44,0.8)'; for (let i = 0; i < 70; i++) { g.lineWidth = 0.8 + r() * 1.6; let x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 30; y -= 6 + r() * 14; g.lineTo(x, y); } g.stroke(); }
    for (let i = 0; i < 2600; i++) { const k = r(); g.fillStyle = k < 0.4 ? `rgba(${120 + r() * 30 | 0},${128 + r() * 30 | 0},${80 + r() * 20 | 0},0.9)` : k < 0.75 ? `rgba(${90 + r() * 20 | 0},${100 + r() * 24 | 0},${58 + r() * 16 | 0},0.9)` : `rgba(${170 + r() * 30 | 0},${160 + r() * 24 | 0},${120 + r() * 20 | 0},0.7)`; g.beginPath(); g.ellipse(r() * w, r() * h, 1 + r() * 2.2, 0.6 + r() * 1.2, r() * 3, 0, 7); g.fill(); }
  });
}
// the alfalfa in the garden plots: a clump of green blades on a clear background (alpha-tested crossed cards)
function cropTex() {
  const r = rng(95);
  return canvas(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 46; i++) {
      const x0 = w / 2 + (r() - 0.5) * 30, ang = (r() - 0.5) * 1.5, len = 50 + r() * 70, x1 = x0 + Math.sin(ang) * len, y1 = h - Math.cos(ang) * len;
      g.strokeStyle = `rgb(${50 + r() * 50 | 0},${100 + r() * 50 | 0},${30 + r() * 20 | 0})`; g.lineWidth = 2 + r() * 2.5; g.beginPath(); g.moveTo(x0, h); g.quadraticCurveTo(x0 + Math.sin(ang) * len * 0.3, h - len * 0.6, x1, y1); g.stroke();
      if (r() < 0.5) { g.fillStyle = `rgb(${70 + r() * 40 | 0},${130 + r() * 40 | 0},${40 + r() * 20 | 0})`; g.beginPath(); g.ellipse(x1, y1, 3 + r() * 3, 2, ang, 0, 7); g.fill(); }
    }
  });
}
// a gas canopy fascia: the brand red with a white pinstripe and a yellow band, grime run down from the top, rivets
function fasciaTex() {
  const r = rng(96);
  return canvas(1024, 64, (g, w, h) => {
    g.fillStyle = '#a8281e'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#efe8d8'; g.fillRect(0, 6, w, 5); g.fillStyle = '#e0b030'; g.fillRect(0, h - 16, w, 7); g.fillStyle = '#4a1410'; g.fillRect(0, h - 4, w, 4); g.fillRect(0, 0, w, 2);
    for (let x = 8; x < w; x += 64) { g.fillStyle = 'rgba(30,10,8,0.6)'; g.fillRect(x, 0, 1, h); g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.arc(x + 4, 20, 1.3, 0, 7); g.arc(x + 4, h - 22, 1.3, 0, 7); g.fill(); }
    for (let i = 0; i < 60; i++) { const x = r() * w, gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(50,30,20,0.35)'); gr.addColorStop(1, 'rgba(50,30,20,0)'); g.fillStyle = gr; g.fillRect(x, 0, 2 + r() * 8, h * (0.3 + r() * 0.7)); }
    speckle(g, w, h, 3000, ['rgba(0,0,0,0.18)', 'rgba(255,240,220,0.15)'], r, 1.2);
  }, null);
}
// an old petrol pump's face: a white head with the price window and the dial counters, the red body, a brand
// plate, scuffs and rust bleeding from the bolts (UV 0..1 on a plane: one face)
function pumpTex(seed = 97) {
  const r = rng(seed);
  return canvas(256, 512, (g, w, h) => {
    g.fillStyle = '#b02a1e'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ece6d6'; g.fillRect(8, 8, w - 16, 190);
    g.fillStyle = '#1a1c1a'; g.fillRect(28, 30, w - 56, 70); g.fillRect(28, 112, w - 56, 52);
    g.fillStyle = '#e8d070'; g.font = 'bold 40px Helvetica, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('0 0 0 . 0', w / 2, 66, w - 70); g.font = 'bold 30px Helvetica, Arial'; g.fillText('1 . 4 9', w / 2, 139, w - 70);
    g.fillStyle = '#3a3a36'; g.font = 'bold 16px Helvetica, Arial'; g.fillText('LITROS', w / 2, 20, w - 40); g.fillText('PRECIO', w / 2, 182, w - 40);
    g.fillStyle = '#efe8d8'; g.fillRect(8, 214, w - 16, 10);
    g.fillStyle = '#efe8d8'; g.beginPath(); g.arc(w / 2, 300, 52, 0, 7); g.fill(); g.fillStyle = '#b02a1e'; g.beginPath(); g.arc(w / 2, 300, 44, 0, 7); g.fill();
    g.fillStyle = '#efe8d8'; g.font = 'bold 22px Georgia'; g.fillText('SUPER', w / 2, 300, 76);
    g.fillStyle = 'rgba(20,10,8,0.5)'; g.fillRect(30, 380, w - 60, 3); g.fillRect(30, 420, w - 60, 3);
    for (const [x, y] of [[18, 18], [w - 18, 18], [18, h - 18], [w - 18, h - 18], [18, 214], [w - 18, 214]]) { g.fillStyle = '#5a5a56'; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); const gr = g.createLinearGradient(0, y, 0, y + 60); gr.addColorStop(0, 'rgba(110,50,20,0.55)'); gr.addColorStop(1, 'rgba(110,50,20,0)'); g.fillStyle = gr; g.fillRect(x - 2, y, 4, 60); }
    blotch(g, w, h, 14, 'rgba(120,60,30,0.25)', 6, 26, r); speckle(g, w, h, 1800, ['rgba(0,0,0,0.2)', 'rgba(255,240,220,0.18)'], r, 1.3);
    const gr = g.createLinearGradient(0, h - 90, 0, h); gr.addColorStop(0, 'rgba(70,50,30,0)'); gr.addColorStop(1, 'rgba(70,50,30,0.45)'); g.fillStyle = gr; g.fillRect(0, h - 90, w, 90);
  }, null);
}
function palmBarkTex() {
  const r = rng(101);
  return canvas(128, 256, (g, w, h) => {
    g.fillStyle = '#7a6448'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) { g.fillStyle = rgb([120, 98, 70], 0.8 + r() * 0.3); g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= w; x += 8) g.lineTo(x, y + 8 + Math.sin(x * 0.2 + y) * 3); g.lineTo(w, y + 16); g.lineTo(0, y + 16); g.fill(); g.fillStyle = 'rgba(40,28,16,0.6)'; g.fillRect(0, y + 13, w, 3); }
    speckle(g, w, h, 1500, ['rgba(40,30,20,0.4)', 'rgba(200,180,150,0.3)'], r, 1.5);
  });
}
function tileTex(a, b) {   // courtyard / floor tiles: terracotta squares
  const r = rng(111);
  return canvas(256, 256, (g, w, h) => {
    g.fillStyle = '#5a4030'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 64) for (let x = 0; x < w; x += 64) { g.fillStyle = r() < 0.5 ? a : b; g.fillRect(x + 2, y + 2, 60, 60); blotch(g, 0, 0, 0, ''); g.fillStyle = 'rgba(255,240,220,0.08)'; g.fillRect(x + 4, y + 4, 56, 6); }
    // [realism] each hand-made tile its own shade, worn hollow in the middle, chipped corners, dirt packed in the joints
    for (let y = 0; y < h; y += 64) for (let x = 0; x < w; x += 64) {
      g.fillStyle = r() < 0.5 ? `rgba(255,235,210,${r() * 0.12})` : `rgba(40,20,10,${r() * 0.14})`; g.fillRect(x + 2, y + 2, 60, 60);
      const gr = g.createRadialGradient(x + 32, y + 32, 4, x + 32, y + 32, 34); gr.addColorStop(0, 'rgba(255,230,200,0.1)'); gr.addColorStop(1, 'rgba(60,30,15,0.12)'); g.fillStyle = gr; g.fillRect(x + 2, y + 2, 60, 60);
      for (let c = 0; c < 4; c++) if (r() < 0.3) { const cx = x + 2 + (c & 1) * 60, cy = y + 2 + (c >> 1) * 60; g.fillStyle = '#5a4030'; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + ((c & 1) ? -1 : 1) * (3 + r() * 6), cy); g.lineTo(cx, cy + ((c >> 1) ? -1 : 1) * (3 + r() * 6)); g.fill(); }
    }
    g.fillStyle = 'rgba(150,120,84,0.5)'; for (let k = 0; k < h; k += 64) { g.fillRect(0, k, w, 2); g.fillRect(k, 0, 2, h); }
    speckle(g, w, h, 3000, ['rgba(40,24,12,0.25)', 'rgba(255,230,200,0.2)'], r, 1.3);
  });
}
function rugTex(seed) {
  const r = rng(seed), P = [['#8a2a1e', '#d8b060', '#1e2a4a', '#efe4c8'], ['#2a3a5a', '#c89a40', '#7a1e1a', '#e8dcc0'], ['#5a2a3a', '#d8c080', '#2a4a3a', '#f0e4c8']][seed % 3];
  return canvas(256, 384, (g, w, h) => {
    g.fillStyle = P[0]; g.fillRect(0, 0, w, h); g.fillStyle = P[1]; g.fillRect(12, 12, w - 24, h - 24); g.fillStyle = P[0]; g.fillRect(22, 22, w - 44, h - 44);
    g.fillStyle = P[2]; g.beginPath(); g.moveTo(w / 2, 50); g.lineTo(w - 50, h / 2); g.lineTo(w / 2, h - 50); g.lineTo(50, h / 2); g.closePath(); g.fill();
    g.fillStyle = P[3]; g.beginPath(); g.moveTo(w / 2, 100); g.lineTo(w - 90, h / 2); g.lineTo(w / 2, h - 100); g.lineTo(90, h / 2); g.closePath(); g.fill();
    for (let y = 30; y < h - 30; y += 18) for (let x = 30; x < w - 30; x += 18) if (r() < 0.25) { g.fillStyle = P[(r() * 4) | 0]; g.fillRect(x, y, 6, 6); }
    for (let y = 0; y < h; y += 3) { g.fillStyle = 'rgba(0,0,0,0.06)'; g.fillRect(0, y, w, 1); }
  }, null);
}
function corrTex(col) {
  return canvas(128, 128, (g, w, h) => {
    for (let x = 0; x < w; x++) { const k = 0.75 + 0.25 * Math.sin(x / w * Math.PI * 8); g.fillStyle = rgb(col, k); g.fillRect(x, 0, 1, h); }
    const r = rng(5); blotch(g, w, h, 12, 'rgba(120,60,30,0.4)', 6, 26, r); speckle(g, w, h, 600, ['rgba(80,40,20,0.4)'], r, 2);
  });
}
function asphaltTex() {
  const r = rng(121);
  return canvas(512, 512, (g, w, h) => {
    g.fillStyle = '#5a5650'; g.fillRect(0, 0, w, h);   // sun-bleached grey
    speckle(g, w, h, 30000, ['rgba(30,30,30,0.5)', 'rgba(150,145,135,0.5)', 'rgba(90,86,80,0.6)'], r, 1.6);
    g.strokeStyle = 'rgba(25,22,20,0.7)'; g.lineWidth = 1.2;   // crack network, tar-sealed
    for (let i = 0; i < 18; i++) { let x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 10; k++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 40; g.lineTo(x, y); } g.stroke(); }
    blotch(g, w, h, 20, 'rgba(200,170,120,0.18)', 30, 90, r);   // drifted sand
  });
}
export function labelTex(lines, bg, fg, w = 512, h = 256, font = 'bold 72px Georgia') {
  return canvas(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    const r = rng(lines.join('').length * 13); blotch(g, w, h, 12, 'rgba(255,240,200,0.18)', 20, 80, r); speckle(g, w, h, 2500, ['rgba(0,0,0,0.15)'], r, 1.5);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = font;
    const lh = h / (lines.length + 0.6); lines.forEach((l, i) => g.fillText(l, w / 2, lh * (i + 0.8)));
  }, null);
}

// ---------------------------------------------------------------- materials
export function makeMats(TX) {
  const std = o => new THREE.MeshStandardMaterial({ roughness: 0.9, ...o });
  // relief: a normal map from the colour texture's own light/dark (mortar and grout sink, stone faces stand out);
  // desktop only — phones and tablets skip the Sobel pass and the extra texture (tex.js isLow)
  const low = !TX || !TX.normalFromHeight || (TX.isLow && TX.isLow());
  const rel = (t, k = 1, str = 2) => { const o = { map: t }; if (!low) { const n = TX.normalFromHeight(t.image, str); n.repeat.copy(t.repeat); o.normalMap = n; o.normalScale = new THREE.Vector2(k, k); } return o; };
  const M = {};
  const PL = [[222, 196, 160], [214, 178, 136], [232, 216, 190], [200, 160, 118], [226, 204, 176], [190, 150, 112], [236, 226, 206], [208, 186, 150]];
  PL.forEach((c, i) => { M['plaster' + i] = std({ ...rel(plasterTex(c, 300 + i, i % 3 === 0 ? 1 : 0), 0.6, 1.6), roughness: 0.95 }); });
  M.plasterIn = std({ ...rel(plasterTex([236, 228, 210], 399, 0), 0.35, 1.2), roughness: 0.95 });   // whitewashed inside walls
  M.plasterBlue = std({ ...rel(plasterTex([150, 176, 196], 398, 0), 0.6, 1.6), roughness: 0.95 });
  M.mudBrick = std({ ...rel(mudBrickTex(), 0.9, 2.4), roughness: 1 });
  M.sandstone = std({ ...rel(sandstoneTex(), 1.0, 2.6), roughness: 0.95 });
  M.sand = std({ ...rel(sandTex(), 0.7, 1.8), roughness: 1 });   // [realism] ripples and pebbles in relief (desktop)
  M.rock = std({ ...rel(rockTex(), 1.0, 2.2), roughness: 1 });
  // the boulders: the same strata, a touch paler and dustier (sun-bleached sandstone)
  M.boulder = std({ ...rel(rockTex(), 1.2, 2.6), color: 0xeadcc4, roughness: 1 });
  M.beam = std({ ...rel(woodTex(), 0.8, 2.2), roughness: 0.9 });   // [realism] split, checked grain in relief
  M.blueWood = std({ map: plankTex([46, 92, 140], 131), roughness: 0.8 });
  M.greenWood = std({ map: plankTex([60, 110, 90], 132), roughness: 0.8 });
  M.greyWood = std({ map: plankTex([150, 138, 118], 133), roughness: 0.9 });
  M.redWood = std({ map: plankTex([140, 56, 40], 134), roughness: 0.8 });
  M.tile = std({ ...rel(tileTex('#b0603c', '#a85636'), 0.5, 1.6), roughness: 0.8 });
  M.tileB = std({ map: tileTex('#d8d0bc', '#3a5a7a'), roughness: 0.5 });
  M.earth = std({ map: canvas(256, 256, (g, w, h) => { g.fillStyle = '#9a7a58'; g.fillRect(0, 0, w, h); const r = rng(141); blotch(g, w, h, 30, 'rgba(70,50,30,0.25)', 10, 50, r); speckle(g, w, h, 5000, ['rgba(50,36,24,0.35)', 'rgba(200,170,130,0.3)'], r, 1.5); }), roughness: 1 });
  M.awn0 = std({ map: clothTex('#b8402a', '#e8dcc0', 151), side: THREE.DoubleSide, roughness: 0.95 });
  M.awn1 = std({ map: clothTex('#2a5a8a', '#e0d4b8', 152), side: THREE.DoubleSide, roughness: 0.95 });
  M.awn2 = std({ map: clothTex('#c89a30', '#7a3a1e', 153), side: THREE.DoubleSide, roughness: 0.95 });
  M.awn3 = std({ map: clothTex('#3a6a3a', '#e4d6b4', 154), side: THREE.DoubleSide, roughness: 0.95 });
  M.frond = std({ map: frondTex(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85 });
  M.frondDead = std({ map: frondDeadTex(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1 });
  M.palmBark = std({ ...rel(palmBarkTex(), 1.0, 2.6), roughness: 1 });   // [realism] the stubs of old frond bases stand out
  M.asphalt = std({ map: asphaltTex(), roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  M.paintW = std({ color: 0xe6dcc4, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  M.paintY = std({ color: 0xd0a030, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  M.gravel = std({ map: TX && TX.gravelTexture ? TX.gravelTexture() : sandTex(), color: 0xc8b090, roughness: 1 });
  // [realism] the splash zone at the foot of the walls: dirt and damp fading upward (v 0 = ground, 1 = top), ragged
  M.splash = std({ map: canvas(256, 128, (g, w, h) => { const r = rng(171); g.clearRect(0, 0, w, h);
    for (let x = 0; x < w; x += 2) { const top = h * (0.25 + 0.3 * Math.abs(Math.sin(x * 0.031 + 1.3)) + 0.25 * r()); const gr = g.createLinearGradient(0, h, 0, h - top); gr.addColorStop(0, 'rgba(96,70,46,0.8)'); gr.addColorStop(0.55, 'rgba(118,90,62,0.42)'); gr.addColorStop(1, 'rgba(130,100,70,0)'); g.fillStyle = gr; g.fillRect(x, h - top, 2, top); }
    for (let i = 0; i < 900; i++) { const y = h - Math.pow(r(), 2) * h * 0.7; g.fillStyle = `rgba(${r() < 0.5 ? '70,50,32' : '150,120,86'},${0.15 + r() * 0.3})`; g.fillRect(r() * w, y, 1 + r() * 2, 1 + r() * 2); }
  }), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  M.splash.map.wrapT = THREE.ClampToEdgeWrapping;
  M.wadi = std({ ...rel(canvas(512, 512, (g, w, h) => { g.fillStyle = '#a88a66'; g.fillRect(0, 0, w, h); const r = rng(161); for (let i = 0; i < 900; i++) { const s = 2 + r() * 9; g.fillStyle = rgb([150, 130, 110], 0.6 + r() * 0.6); g.beginPath(); g.ellipse(r() * w, r() * h, s, s * (0.6 + r() * 0.4), r() * 3, 0, 7); g.fill(); } g.strokeStyle = 'rgba(70,50,30,0.5)'; g.lineWidth = 1; for (let i = 0; i < 80; i++) { let x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 50; y += (r() - 0.5) * 50; g.lineTo(x, y); } g.stroke(); } }), 1.0, 2.6), roughness: 1 });   // [realism] cobbles and dried-mud cracks in relief
  M.corr = std({ map: corrTex([170, 160, 150]), roughness: 0.6, metalness: 0.5 });
  M.corrRust = std({ map: corrTex([150, 80, 44]), roughness: 0.8, metalness: 0.3 });
  const pm = (c, o = {}) => std({ ...(TX && TX.paintedMetalTexture ? { map: TX.paintedMetalTexture(c) } : { color: new THREE.Color(c[0] / 255, c[1] / 255, c[2] / 255) }), ...o });
  M.metal = std({ color: 0x8a8c8e, roughness: 0.45, metalness: 0.8 });
  M.darkMetal = std({ color: 0x2a2c2e, roughness: 0.5, metalness: 0.7 });
  M.rust = std({ map: corrTex([120, 64, 36]), color: 0xd8c8c0, roughness: 0.85, metalness: 0.35 });
  M.whiteMetal = pm([216, 214, 206], { roughness: 0.4, metalness: 0.45 });
  M.clay = std({ map: clayTex([176, 106, 64], 191), roughness: 0.85 });
  M.clayDark = std({ map: clayTex([122, 74, 46], 192), roughness: 0.9 });
  M.copper = std({ color: 0xb87040, roughness: 0.35, metalness: 0.9 });
  M.brass = std({ color: 0xc0a060, roughness: 0.3, metalness: 1 });
  M.dome = std({ map: plasterTex([238, 232, 216], 397, 0), roughness: 0.6 });
  M.domeGreen = std({ color: 0x3a7a6a, roughness: 0.4, metalness: 0.3 });
  M.glass = new THREE.MeshStandardMaterial({ color: 0xb8c6cc, roughness: 0.05, transparent: true, opacity: 0.3, depthWrite: false });
  M.black = std({ color: 0x141414, roughness: 0.6 });
  M.rubber = std({ color: 0x181818, roughness: 0.9 });
  const fab = (c, sd, hex) => std(TX && TX.fabricTexture ? { map: TX.fabricTexture(c, sd), roughness: 1 } : { color: hex, roughness: 1 });
  M.fabricA = fab([138, 58, 42], 201, 0x8a3a2a); M.fabricB = fab([42, 74, 106], 202, 0x2a4a6a); M.fabricC = fab([216, 200, 160], 203, 0xd8c8a0);
  M.rug0 = std({ map: rugTex(0), roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 });
  M.rug1 = std({ map: rugTex(1), roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 });
  M.rug2 = std({ map: rugTex(2), roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 });
  M.water = new THREE.MeshStandardMaterial({ color: 0x3a4a2a, roughness: 0.08, metalness: 0.2 });   // the well: dark, scummed green
  M.waterGlow = new THREE.MeshStandardMaterial({ color: 0x4a6a2a, roughness: 0.1, emissive: 0x2a5a10, emissiveIntensity: 0.5 });
  M.fruit0 = std({ color: 0xd88a20, roughness: 0.5 }); M.fruit1 = std({ color: 0x9a2a1a, roughness: 0.5 }); M.fruit2 = std({ color: 0x6a8a2a, roughness: 0.6 }); M.fruit3 = std({ color: 0x5a3a20, roughness: 0.7 });   // oranges, pomegranates, melons, dates
  M.spice0 = std({ map: spiceTex([200, 80, 26], 171), roughness: 1 }); M.spice1 = std({ map: spiceTex([216, 168, 32], 172), roughness: 1 }); M.spice2 = std({ map: spiceTex([106, 58, 26], 173), roughness: 1 });
  M.burlap = std({ map: TX && TX.burlapTexture ? TX.burlapTexture() : clothTex('#b89a6a', '#a88a5a', 155), color: 0xe8d4b0, roughness: 1 });
  M.jerryR = std({ map: jerryTex([168, 40, 30], 181), roughness: 0.55 }); M.jerryW = std({ map: jerryTex([226, 222, 210], 182), roughness: 0.5 }); M.jerryB = std({ map: jerryTex([40, 80, 150], 183), roughness: 0.55 });
  // the lanterns (oil lamps, bulbs in tin shades): dim by day, bright at night — desert.js drives emissiveIntensity
  M.lanternOn = std({ color: 0xffe0a0, emissive: 0xffb050, emissiveIntensity: 0.4, roughness: 0.3 });
  M.canopyStrip = std({ color: 0xf4f2ea, emissive: 0xfff4dc, emissiveIntensity: 0.1, roughness: 0.3 });
  // the warm pool of light a lamp throws on the ground at night (additive, faded at the rim; desert.js fades it in)
  M.pool = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshBasicMaterial({ map: t, color: 0xffb060, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: true, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6, visible: false });
  })();
  M.signBack = std({ map: corrTex([150, 146, 138]), roughness: 0.6, metalness: 0.4 });
  M.white = pm([232, 228, 216], { roughness: 0.5 });
  M.red = pm([168, 40, 30], { roughness: 0.5, metalness: 0.2 });
  M.plane = pm([216, 216, 208], { roughness: 0.45, metalness: 0.45 });
  M.planeStripe = pm([138, 42, 30], { roughness: 0.45, metalness: 0.3 });
  M.fascia = std({ map: fasciaTex(), roughness: 0.6, metalness: 0.2 });
  M.pump = std({ map: pumpTex(), roughness: 0.55, metalness: 0.15 });
  for (let i = 0; i < 4; i++) M['goods' + i] = std(TX && TX.productTexture ? { map: TX.productTexture('box', i * 2 + 1), roughness: 0.7 } : { color: [0xa8281e, 0xe8e4d8, 0x2a4a6a, 0xc89a30][i], roughness: 0.7 });
  M.cactus = std({ map: cactusTex(), roughness: 0.85 });
  M.scrub = std({ map: scrubTex(), roughness: 1 });
  M.crop = std({ map: cropTex(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9 });
  M.blood = std({ color: 0x4a0806, roughness: 0.4, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  M.soot = std({ color: 0x141210, roughness: 1, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  M.fire = new THREE.MeshBasicMaterial({ color: 0xff8a30 });
  return M;
}

const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
export const mat4 = (x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) => { _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')); return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)); };

// ---------------------------------------------------------------- shared prop geometry
export function makeGeo() {
  const lathe = (pts, seg = 16) => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg);
  const G = {
    ubox: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
    ucyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 12).translate(0, 0.5, 0),
    // clay pots: a tall water jar, a squat cooking pot, a big storage amphora
    jar: lathe([[0, 0], [0.09, 0], [0.16, 0.12], [0.2, 0.3], [0.17, 0.48], [0.08, 0.6], [0.075, 0.68], [0.1, 0.72], [0.085, 0.73]]),
    pot: lathe([[0, 0], [0.12, 0], [0.2, 0.08], [0.22, 0.18], [0.17, 0.28], [0.18, 0.31], [0.165, 0.32]]),
    amphora: lathe([[0, 0], [0.05, 0], [0.18, 0.25], [0.28, 0.6], [0.24, 0.9], [0.1, 1.05], [0.08, 1.2], [0.12, 1.24], [0.1, 1.25]]),
    // a palm: trunk is a gently tapering cylinder (bent per instance by its matrix), fronds a curved strip
    palmTrunk: (() => { const g = new THREE.CylinderGeometry(0.17, 0.26, 1, 9, 8, true).translate(0, 0.5, 0); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) + y * y * 0.35); p.setX(i, p.getX(i) * (1 + 0.06 * Math.sin(y * 60))); p.setZ(i, p.getZ(i) * (1 + 0.06 * Math.sin(y * 60))); } g.computeVertexNormals(); return g; })(),
    frond: (() => { const g = new THREE.PlaneGeometry(1.1, 3.2, 1, 8).translate(0, 1.6, 0).rotateX(-Math.PI / 2); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const z = -p.getZ(i); p.setY(i, z * 0.45 - z * z * 0.16); p.setX(i, p.getX(i) * (1 - z / 4)); } g.computeVertexNormals(); return g; })(),
    palmCrown: new THREE.SphereGeometry(0.32, 10, 6),
    dates: new THREE.SphereGeometry(0.18, 8, 6).scale(1, 1.4, 1),
    boulder: (() => { const g = new THREE.IcosahedronGeometry(1, 2); const p = g.attributes.position, r = rng(17); for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), n = 0.8 + 0.25 * Math.sin(x * 3.1 + z * 2.3) + 0.12 * Math.sin(y * 5 + x * 4); p.setXYZ(i, x * n, y * n * 0.75, z * n); } g.computeVertexNormals(); return g; })(),
    // a saguaro: ribbed trunk and arm (8 ribs, matching the 8 ribs painted on its skin), rounded tops
    cactus: (() => {
      const rib = (rt, rb, hh, seg = 24) => { const g = new THREE.CylinderGeometry(rt, rb, hh, seg, 6); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), k = 1 + 0.09 * Math.cos(a * 8); p.setX(i, x * k); p.setZ(i, z * k); } return g; };
      const cap = (rr) => { const g = new THREE.SphereGeometry(rr, 24, 6, 0, Math.PI * 2, 0, Math.PI / 2); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), k = 1 + 0.09 * Math.cos(a * 8); p.setX(i, x * k); p.setZ(i, z * k); } return g; };
      const parts = [rib(0.16, 0.2, 2.2).translate(0, 1.1, 0), cap(0.16).translate(0, 2.2, 0), rib(0.1, 0.1, 0.7, 16).translate(0, 1.6, 0).translate(0.38, 0, 0), rib(0.1, 0.1, 0.4, 16).rotateZ(Math.PI / 2).translate(0.2, 1.25, 0), cap(0.1).translate(0.38, 1.95, 0)];
      const m = mergeGeometries(parts.map(g => g.toNonIndexed())); m.computeVertexNormals(); return m;
    })(),
    // a 20-litre jerrycan: the body, a carry handle on top, a spout cap at one corner
    jerry: (() => {
      const body = new THREE.BoxGeometry(0.3, 0.42, 0.17, 2, 2, 1).translate(0, 0.21, 0);
      const handle = new THREE.TorusGeometry(0.06, 0.016, 6, 10, Math.PI).translate(-0.04, 0.42, 0);
      const spout = new THREE.CylinderGeometry(0.03, 0.035, 0.06, 10).translate(0.1, 0.45, 0);
      const ridge = new THREE.BoxGeometry(0.28, 0.02, 0.18).translate(0, 0.21, 0);
      return mergeGeometries([body, handle, spout, ridge].map(g => g.toNonIndexed()));
    })(),
    // [realism] a creosote / saltbush clump: three ragged lobes (spiky, uneven outline) instead of one smooth dome
    scrub: (() => {
      const lobe = (rr, ox, oz, hh, sd) => { const g = new THREE.IcosahedronGeometry(rr, 1); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), n = 0.72 + 0.22 * Math.sin(x * 23 + z * 17 + sd) * Math.sin(y * 19 - x * 13) + 0.14 * Math.sin(z * 31 + y * 7 + sd); p.setXYZ(i, x * n + ox, Math.max(-0.02, y * n * hh + rr * 0.35), z * n + oz); } return g; };
      const g = mergeGeometries([lobe(0.42, 0, 0, 1.05, 1), lobe(0.3, 0.26, 0.14, 0.9, 2), lobe(0.28, -0.2, -0.2, 0.85, 3)].map(x => x.toNonIndexed())); g.computeVertexNormals(); return g;
    })(),
    tuft: (() => { const a = []; for (let k = 0; k < 3; k++) a.push(new THREE.PlaneGeometry(0.7, 0.5).translate(0, 0.25, 0).rotateY(k * Math.PI / 3)); return mergeGeometries(a); })(),
    fruit: new THREE.SphereGeometry(0.06, 8, 6),
    melon: new THREE.SphereGeometry(0.15, 10, 8).scale(1, 0.85, 1.2),
    sack: (() => { const g = new THREE.CylinderGeometry(0.22, 0.26, 0.55, 10, 3).translate(0, 0.275, 0); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y > 0.5) { p.setX(i, p.getX(i) * 0.55); p.setZ(i, p.getZ(i) * 0.55); } } g.computeVertexNormals(); return g; })(),
    spice: new THREE.ConeGeometry(0.16, 0.18, 12).translate(0, 0.09, 0),
    basket: new THREE.CylinderGeometry(0.24, 0.2, 0.16, 14, 1).translate(0, 0.08, 0),
    crate: new THREE.BoxGeometry(0.6, 0.42, 0.42).translate(0, 0.21, 0),
    barrel: new THREE.CylinderGeometry(0.29, 0.29, 0.88, 14).translate(0, 0.44, 0),
    tire: new THREE.TorusGeometry(0.3, 0.11, 8, 16).rotateX(Math.PI / 2).translate(0, 0.11, 0),
    cushion: new THREE.BoxGeometry(0.6, 0.12, 0.6).translate(0, 0.06, 0),
    lantern: new THREE.CylinderGeometry(0.08, 0.1, 0.24, 6).translate(0, -0.12, 0),
    rug: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    // [realism] a weathered river stone: rounded, lumpy, flattened (not a crisp dodecahedron)
    stone: (() => { const g = new THREE.IcosahedronGeometry(0.3, 1); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), n = 0.85 + 0.18 * Math.sin(x * 11 + z * 7) + 0.08 * Math.sin(y * 17 + x * 9); p.setXYZ(i, x * n * 1.1, y * n * 0.7, z * n); } g.computeVertexNormals(); return g; })(),
    teapot: lathe([[0, 0], [0.06, 0], [0.08, 0.05], [0.07, 0.1], [0.03, 0.13], [0.035, 0.16], [0, 0.17]], 10),
    sphere: new THREE.SphereGeometry(1, 20, 12),
    hemi: new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    cone: new THREE.ConeGeometry(1, 1, 16).translate(0, 0.5, 0),
    tank: new THREE.CylinderGeometry(1, 1, 1, 24).translate(0, 0.5, 0),
    post: new THREE.CylinderGeometry(0.06, 0.06, 1, 6).translate(0, 0.5, 0),
    bucket: new THREE.CylinderGeometry(0.14, 0.11, 0.26, 12, 1, true).translate(0, 0.13, 0),
  };
  return G;
}

// ---------------------------------------------------------------- install into the map kit
// Adds the desert materials to K.MAT (all prefixed 'd_' so they never clash with the world's) and their tiling to
// K.TILE; returns { M (the same materials, unprefixed), G (prop geometry) }.
export function install(K) {
  const M = makeMats(K.TX), G = makeGeo();
  const TILES = { plaster: 6, plasterIn: 5, plasterBlue: 6, mudBrick: 2, sandstone: 4.5, sand: 4, rock: 8, beam: 1.2, tile: 1.6, tileB: 1.2, earth: 2.5, asphalt: 6, paintW: 1, paintY: 1, gravel: 2, wadi: 6, corr: 1.5, corrRust: 1.5, blueWood: 1.2, greenWood: 1.2, greyWood: 1.2, redWood: 1.2, awn: 2, dome: 3 };
  for (const [k, m] of Object.entries(M)) {
    K.MAT['d_' + k] = m;
    const base = k.replace(/\d+$/, '');
    K.TILE['d_' + k] = TILES[k] ?? TILES[base] ?? 2;
  }
  return { M, G };
}

// ---------------------------------------------------------------- designed fronts (decor.js): the village's own cells
// shop shelves full of goods, the café's chalk menu, a painted retablo for the chapel altar, a carved chest front, a
// wardrobe, the mechanic's tool wall and chest. One atlas → one material for all of them.
import { decor, P2 as S, XCELLS, rgb as drgb } from './decor.js';
const DCELLS = [
  ['wood', (g, w, h, r) => S.grain(g, 0, 0, w, h, r, [128, 86, 50]), { rough: 0.75, metal: 0 }],
  // a shop shelf bay: tins, rice and flour bags, bottles of oil, soap boxes, tea packets
  ['shelf', (g, w, h, r) => {
    S.grain(g, 0, 0, w, h, r, [96, 66, 40], false);
    for (let j = 0; j < 4; j++) { const y1 = (j + 1) * h / 4; g.fillStyle = '#5a3a20'; g.fillRect(0, y1 - 7, w, 7); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, y1 - 7 - h / 4 * 0.85, w, h / 4 * 0.85 - 7);
      let x = 4; while (x < w - 12) { const k = r(); let bw, bh;
        if (k < 0.3) { bw = 16; bh = h / 4 * 0.42; g.fillStyle = '#c8ccd0'; g.fillRect(x, y1 - 7 - bh, bw, bh); g.fillStyle = ['#c82a1a', '#e8b020', '#2a7a3a', '#2a4ab0'][(r() * 4) | 0]; g.fillRect(x, y1 - 7 - bh * 0.78, bw, bh * 0.5); g.fillStyle = '#fff'; g.fillRect(x + 3, y1 - 7 - bh * 0.6, bw - 6, 3); }
        else if (k < 0.5) { bw = 12; bh = h / 4 * 0.7; g.fillStyle = ['#d8b030', '#a8c040', '#e8e0c0'][(r() * 3) | 0]; g.fillRect(x + 2, y1 - 7 - bh * 0.8, bw - 4, bh * 0.8); g.fillRect(x + 4, y1 - 7 - bh, bw - 8, bh * 0.2); g.fillStyle = '#c82a1a'; g.fillRect(x + 2, y1 - 7 - bh * 0.5, bw - 4, bh * 0.2); }
        else if (k < 0.75) { bw = 30; bh = h / 4 * 0.6; g.fillStyle = r() < 0.5 ? '#f0ead8' : '#d8c8a0'; g.beginPath(); g.moveTo(x, y1 - 7); g.lineTo(x + 3, y1 - 7 - bh); g.lineTo(x + bw - 3, y1 - 7 - bh); g.lineTo(x + bw, y1 - 7); g.fill(); g.fillStyle = ['#2a6a3a', '#a82a1a', '#2a4a8a'][(r() * 3) | 0]; g.fillRect(x + 6, y1 - 7 - bh * 0.6, bw - 12, bh * 0.25); }
        else { bw = 22; bh = h / 4 * 0.5; g.fillStyle = ['#e85a20', '#2a8ad8', '#f0d020', '#8a3ac8', '#30a060'][(r() * 5) | 0]; g.fillRect(x, y1 - 7 - bh, bw, bh); g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(x + 3, y1 - 7 - bh * 0.7, bw - 6, bh * 0.25); }
        x += bw + 2; } }
  }, { rough: 0.7, metal: 0 }],
  // the café's chalkboard menu
  ['menu', (g, w, h, r) => {
    S.grain(g, 0, 0, w, h, r, [110, 70, 40]); g.fillStyle = '#1e2a24'; g.fillRect(10, 10, w - 20, h - 20); S.speck(g, 10, 10, w - 20, h - 20, 1500, ['rgba(255,255,255,0.05)'], r);
    S.text(g, 'CAFÉ OASIS', w / 2, h * 0.13, h * 0.09, '#f0e6cc', 'center', 'bold', 'Georgia, serif');
    [['QAHWA (coffee)', '2'], ['SHAI · mint tea', '1'], ['FALAFEL', '3'], ['FUL MEDAMES', '3'], ['HUMMUS & BREAD', '2'], ['DATES', '1'], ['LEMONADE', '2']].forEach(([a, b], i) => { const y = h * (0.27 + i * 0.1); S.text(g, a, w * 0.1, y, h * 0.052, '#e8e4d8', 'left', 'normal', 'Georgia, serif', w * 0.62); S.text(g, b, w * 0.88, y, h * 0.055, '#f0c860', 'right', 'bold', 'Georgia, serif'); });
    g.strokeStyle = '#f0c860'; g.lineWidth = 2; g.beginPath(); g.moveTo(w * 0.2, h * 0.2); g.lineTo(w * 0.8, h * 0.2); g.stroke();
  }, { rough: 0.9, metal: 0 }],
  // a painted retablo (the saint, a gold frame) for the chapel altar
  ['retablo', (g, w, h, r) => {
    g.fillStyle = '#b8902a'; g.fillRect(0, 0, w, h); S.bevel(g, 0, 0, w, h, 8, 0.4); g.fillStyle = '#2a3a6a'; g.fillRect(w * 0.1, h * 0.08, w * 0.8, h * 0.84);
    const gr = g.createRadialGradient(w / 2, h * 0.3, 4, w / 2, h * 0.3, w * 0.3); gr.addColorStop(0, '#f8e8a0'); gr.addColorStop(1, 'rgba(248,232,160,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e8c8a0'; g.beginPath(); g.arc(w / 2, h * 0.3, w * 0.08, 0, 7); g.fill();
    g.fillStyle = '#7a2a1a'; g.beginPath(); g.moveTo(w * 0.38, h * 0.4); g.lineTo(w * 0.62, h * 0.4); g.lineTo(w * 0.7, h * 0.85); g.lineTo(w * 0.3, h * 0.85); g.fill();
    g.fillStyle = '#e8dcc0'; g.beginPath(); g.moveTo(w * 0.44, h * 0.4); g.lineTo(w * 0.56, h * 0.4); g.lineTo(w * 0.6, h * 0.85); g.lineTo(w * 0.4, h * 0.85); g.fill();
    g.strokeStyle = '#f0d060'; g.lineWidth = 3; g.beginPath(); g.arc(w / 2, h * 0.3, w * 0.12, 0, 7); g.stroke();
    for (let i = 0; i < 12; i++) { g.fillStyle = ['#c82a1a', '#f0c020', '#e8e8e8'][i % 3]; g.beginPath(); g.arc(w * (0.15 + (i % 6) * 0.14), h * (i < 6 ? 0.9 : 0.12), 5, 0, 7); g.fill(); }
  }, { rough: 0.5, metal: 0.3 }],
  // a carved cedar chest front with brass corners
  ['chest', (g, w, h, r) => {
    S.grain(g, 0, 0, w, h, r, [120, 58, 34], false); S.bevel(g, 0, 0, w, h, 4, 0.4);
    for (let i = 0; i < 3; i++) { const x = w * (0.06 + i * 0.31), ww = w * 0.27; S.inset(g, x, h * 0.18, ww, h * 0.64, 3, 0.4); g.strokeStyle = 'rgba(40,20,10,0.6)'; g.lineWidth = 3; g.beginPath(); for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; g.moveTo(x + ww / 2, h * 0.5); g.lineTo(x + ww / 2 + Math.cos(a) * ww * 0.35, h * 0.5 + Math.sin(a) * h * 0.25); } g.stroke(); g.beginPath(); g.arc(x + ww / 2, h * 0.5, ww * 0.18, 0, 7); g.stroke(); }
    g.fillStyle = '#c8a050'; for (const [x, y] of [[0, 0], [w - 24, 0], [0, h - 24], [w - 24, h - 24]]) g.fillRect(x, y, 24, 24);
    g.fillStyle = '#2a2018'; g.fillRect(w / 2 - 10, h * 0.06, 20, 26); g.fillStyle = '#c8a050'; g.fillRect(w / 2 - 6, h * 0.08, 12, 14);
  }, { rough: 0.6, metal: 0.15 }],
  // a tall painted wardrobe: two doors with carved arches, ring pulls
  ['wardrobe', (g, w, h, r) => {
    S.grain(g, 0, 0, w, h, r, [60, 110, 92]); g.fillStyle = 'rgba(60,110,92,0.6)'; g.fillRect(0, 0, w, h);
    for (const x0 of [0, w / 2]) { S.bevel(g, x0 + 4, 4, w / 2 - 8, h - 8, 3, 0.35); g.strokeStyle = '#e8d8a8'; g.lineWidth = 3; g.beginPath(); g.moveTo(x0 + w * 0.08, h * 0.9); g.lineTo(x0 + w * 0.08, h * 0.3); g.quadraticCurveTo(x0 + w / 4, h * 0.08, x0 + w * 0.42, h * 0.3); g.lineTo(x0 + w * 0.42, h * 0.9); g.closePath(); g.stroke();
      g.fillStyle = '#c84a2a'; g.beginPath(); g.arc(x0 + w / 4, h * 0.42, 8, 0, 7); g.fill(); }
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(w / 2 - 1.5, 0, 3, h); for (const x of [w / 2 - 12, w / 2 + 12]) { g.strokeStyle = '#c8a050'; g.lineWidth = 3; g.beginPath(); g.arc(x, h * 0.52, 7, 0, 7); g.stroke(); }
  }, { rough: 0.65, metal: 0 }],
  ['tools', ...XCELLS.tools],
  ['toolchest', ...XCELLS.toolchest],
];
let DD = null;
export function desertDecor(K) { const D = decor(K); if (!DD || DD.D !== D) DD = { D, DA: D.atlas('desert', DCELLS) }; return DD; }
void drgb;
