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
  });
}
function mudBrickTex() {
  const r = rng(31);
  return canvas(512, 512, (g, w, h) => {
    g.fillStyle = '#7a5a3c'; g.fillRect(0, 0, w, h);
    const bh = 32, bw = 64;
    for (let y = 0; y < h; y += bh) for (let x = ((y / bh) % 2) * bw / 2 - bw; x < w; x += bw) {
      const k = 0.85 + r() * 0.3; g.fillStyle = rgb([168, 124, 84], k); g.fillRect(x + 3, y + 3, bw - 6, bh - 6);
      speckle(g, 0, 0, 0, []); for (let i = 0; i < 40; i++) { g.fillStyle = rgb([120, 86, 56], 0.9 + r() * 0.3, 0.5); g.fillRect(x + 3 + r() * (bw - 8), y + 3 + r() * (bh - 8), 2, 1 + r() * 2); }
      g.fillStyle = 'rgba(220,190,150,0.25)'; g.fillRect(x + 4, y + 3, bw - 8, 2);   // straw-flecked tops
    }
    speckle(g, w, h, 3000, ['rgba(220,200,160,0.4)', 'rgba(60,40,24,0.35)'], r, 1.4);
  });
}
function sandstoneTex() {
  const r = rng(51);
  return canvas(512, 512, (g, w, h) => {
    g.fillStyle = '#b8946a'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 64) for (let x = ((y / 64) % 2) * 64 - 128; x < w; x += 128) {
      g.fillStyle = rgb([196, 160, 116], 0.86 + r() * 0.24); g.fillRect(x + 2, y + 2, 124, 60);
      g.strokeStyle = 'rgba(120,90,60,0.25)'; for (let k = 0; k < 5; k++) { g.beginPath(); const yy = y + 8 + r() * 48; g.moveTo(x + 4, yy); g.bezierCurveTo(x + 40, yy + 3, x + 80, yy - 3, x + 122, yy); g.stroke(); }
    }
    speckle(g, w, h, 8000, ['rgba(80,56,30,0.3)', 'rgba(240,220,180,0.35)'], r, 1.5);
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
    let y = 0; while (y < h) { const bh = 10 + r() * 40, k = r(); g.fillStyle = k < 0.33 ? rgb([168, 92, 58], 0.8 + r() * 0.3) : k < 0.66 ? rgb([196, 140, 90], 0.8 + r() * 0.3) : rgb([214, 184, 146], 0.85 + r() * 0.2); g.fillRect(0, y, w, bh + 1); y += bh; }
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
      for (let k = 0; k < 10; k++) { g.fillStyle = 'rgba(150,140,120,0.8)'; g.beginPath(); g.ellipse(i * pw + r() * pw, r() * h, 2 + r() * 8, 3 + r() * 16, 0, 0, 7); g.fill(); }
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
  const M = {};
  const PL = [[222, 196, 160], [214, 178, 136], [232, 216, 190], [200, 160, 118], [226, 204, 176], [190, 150, 112], [236, 226, 206], [208, 186, 150]];
  PL.forEach((c, i) => { M['plaster' + i] = std({ map: plasterTex(c, 300 + i, i % 3 === 0 ? 1 : 0), roughness: 0.95 }); });
  M.plasterIn = std({ map: plasterTex([236, 228, 210], 399, 0), roughness: 0.95 });   // whitewashed inside walls
  M.plasterBlue = std({ map: plasterTex([150, 176, 196], 398, 0), roughness: 0.95 });
  M.mudBrick = std({ map: mudBrickTex(), roughness: 1 });
  M.sandstone = std({ map: sandstoneTex(), roughness: 0.95 });
  M.sand = std({ map: sandTex(), roughness: 1 });
  M.rock = std({ map: rockTex(), roughness: 1 });
  M.beam = std({ map: woodTex(), roughness: 0.9 });
  M.blueWood = std({ map: plankTex([46, 92, 140], 131), roughness: 0.8 });
  M.greenWood = std({ map: plankTex([60, 110, 90], 132), roughness: 0.8 });
  M.greyWood = std({ map: plankTex([150, 138, 118], 133), roughness: 0.9 });
  M.redWood = std({ map: plankTex([140, 56, 40], 134), roughness: 0.8 });
  M.tile = std({ map: tileTex('#b0603c', '#a85636'), roughness: 0.75 });
  M.tileB = std({ map: tileTex('#d8d0bc', '#3a5a7a'), roughness: 0.5 });
  M.earth = std({ map: canvas(256, 256, (g, w, h) => { g.fillStyle = '#9a7a58'; g.fillRect(0, 0, w, h); const r = rng(141); blotch(g, w, h, 30, 'rgba(70,50,30,0.25)', 10, 50, r); speckle(g, w, h, 5000, ['rgba(50,36,24,0.35)', 'rgba(200,170,130,0.3)'], r, 1.5); }), roughness: 1 });
  M.awn0 = std({ map: clothTex('#b8402a', '#e8dcc0', 151), side: THREE.DoubleSide, roughness: 0.95 });
  M.awn1 = std({ map: clothTex('#2a5a8a', '#e0d4b8', 152), side: THREE.DoubleSide, roughness: 0.95 });
  M.awn2 = std({ map: clothTex('#c89a30', '#7a3a1e', 153), side: THREE.DoubleSide, roughness: 0.95 });
  M.awn3 = std({ map: clothTex('#3a6a3a', '#e4d6b4', 154), side: THREE.DoubleSide, roughness: 0.95 });
  M.frond = std({ map: frondTex(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85 });
  M.palmBark = std({ map: palmBarkTex(), roughness: 1 });
  M.asphalt = std({ map: asphaltTex(), roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  M.paintW = std({ color: 0xe6dcc4, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  M.paintY = std({ color: 0xd0a030, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  M.gravel = std({ map: TX && TX.gravelTexture ? TX.gravelTexture() : sandTex(), color: 0xc8b090, roughness: 1 });
  M.wadi = std({ map: canvas(512, 512, (g, w, h) => { g.fillStyle = '#a88a66'; g.fillRect(0, 0, w, h); const r = rng(161); for (let i = 0; i < 900; i++) { const s = 2 + r() * 9; g.fillStyle = rgb([150, 130, 110], 0.6 + r() * 0.6); g.beginPath(); g.ellipse(r() * w, r() * h, s, s * (0.6 + r() * 0.4), r() * 3, 0, 7); g.fill(); } g.strokeStyle = 'rgba(70,50,30,0.5)'; g.lineWidth = 1; for (let i = 0; i < 80; i++) { let x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 50; y += (r() - 0.5) * 50; g.lineTo(x, y); } g.stroke(); } }), roughness: 1 });
  M.corr = std({ map: corrTex([170, 160, 150]), roughness: 0.6, metalness: 0.5 });
  M.corrRust = std({ map: corrTex([150, 80, 44]), roughness: 0.8, metalness: 0.3 });
  M.metal = std({ color: 0x8a8c8e, roughness: 0.45, metalness: 0.8 });
  M.darkMetal = std({ color: 0x2a2c2e, roughness: 0.5, metalness: 0.7 });
  M.rust = std({ color: 0x6a3a22, roughness: 0.85, metalness: 0.35 });
  M.whiteMetal = std({ color: 0xd8d6d0, roughness: 0.35, metalness: 0.5 });
  M.clay = std({ color: 0xb06a40, roughness: 0.85 });
  M.clayDark = std({ color: 0x7a4a2e, roughness: 0.9 });
  M.copper = std({ color: 0xb87040, roughness: 0.35, metalness: 0.9 });
  M.brass = std({ color: 0xc0a060, roughness: 0.3, metalness: 1 });
  M.dome = std({ map: plasterTex([238, 232, 216], 397, 0), roughness: 0.6 });
  M.domeGreen = std({ color: 0x3a7a6a, roughness: 0.4, metalness: 0.3 });
  M.glass = new THREE.MeshStandardMaterial({ color: 0xb8c6cc, roughness: 0.05, transparent: true, opacity: 0.3, depthWrite: false });
  M.black = std({ color: 0x141414, roughness: 0.6 });
  M.rubber = std({ color: 0x181818, roughness: 0.9 });
  M.fabricA = std({ color: 0x8a3a2a, roughness: 1 }); M.fabricB = std({ color: 0x2a4a6a, roughness: 1 }); M.fabricC = std({ color: 0xd8c8a0, roughness: 1 });
  M.rug0 = std({ map: rugTex(0), roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 });
  M.rug1 = std({ map: rugTex(1), roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 });
  M.rug2 = std({ map: rugTex(2), roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 });
  M.water = new THREE.MeshStandardMaterial({ color: 0x3a4a2a, roughness: 0.08, metalness: 0.2 });   // the well: dark, scummed green
  M.waterGlow = new THREE.MeshStandardMaterial({ color: 0x4a6a2a, roughness: 0.1, emissive: 0x2a5a10, emissiveIntensity: 0.5 });
  M.fruit0 = std({ color: 0xd88a20, roughness: 0.5 }); M.fruit1 = std({ color: 0x9a2a1a, roughness: 0.5 }); M.fruit2 = std({ color: 0x6a8a2a, roughness: 0.6 }); M.fruit3 = std({ color: 0x5a3a20, roughness: 0.7 });   // oranges, pomegranates, melons, dates
  M.spice0 = std({ color: 0xc8501a, roughness: 1 }); M.spice1 = std({ color: 0xd8a820, roughness: 1 }); M.spice2 = std({ color: 0x6a3a1a, roughness: 1 });
  M.lanternOn = std({ color: 0xffe0a0, emissive: 0xffb050, emissiveIntensity: 1.4, roughness: 0.3 });
  M.white = std({ color: 0xe8e4d8, roughness: 0.5 });
  M.red = std({ color: 0xa8281e, roughness: 0.5, metalness: 0.2 });
  M.plane = std({ color: 0xd8d8d0, roughness: 0.4, metalness: 0.5 });
  M.planeStripe = std({ color: 0x8a2a1e, roughness: 0.45, metalness: 0.3 });
  M.cactus = std({ color: 0x5a7a40, roughness: 0.8 });
  M.scrub = std({ color: 0x7a7a4a, roughness: 1 });
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
    cactus: (() => { const parts = [new THREE.CylinderGeometry(0.16, 0.19, 2.2, 10).translate(0, 1.1, 0), new THREE.SphereGeometry(0.16, 10, 6).translate(0, 2.2, 0), new THREE.CylinderGeometry(0.1, 0.1, 0.7, 8).translate(0, 1.6, 0).rotateZ(0).translate(0.38, 0, 0), new THREE.CylinderGeometry(0.1, 0.1, 0.4, 8).rotateZ(Math.PI / 2).translate(0.2, 1.25, 0), new THREE.SphereGeometry(0.1, 8, 6).translate(0.38, 1.95, 0)]; return mergeGeometries(parts.map(g => g.toNonIndexed())); })(),
    scrub: (() => { const g = new THREE.IcosahedronGeometry(0.5, 1); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setY(i, Math.max(0, y) * 0.8); p.setX(i, p.getX(i) * (1 + 0.3 * Math.sin(i))); } g.computeVertexNormals(); return g; })(),
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
    stone: new THREE.DodecahedronGeometry(0.3, 0),
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
  const TILES = { plaster: 2.5, plasterIn: 2.5, plasterBlue: 2.5, mudBrick: 2, sandstone: 2.2, sand: 4, rock: 8, beam: 1.2, tile: 1.6, tileB: 1.2, earth: 2.5, asphalt: 6, paintW: 1, paintY: 1, gravel: 2, wadi: 6, corr: 1.5, corrRust: 1.5, blueWood: 1.2, greenWood: 1.2, greyWood: 1.2, redWood: 1.2, awn: 2, dome: 3 };
  for (const [k, m] of Object.entries(M)) {
    K.MAT['d_' + k] = m;
    const base = k.replace(/\d+$/, '');
    K.TILE['d_' + k] = TILES[k] ?? TILES[base] ?? 2;
  }
  return { M, G };
}
