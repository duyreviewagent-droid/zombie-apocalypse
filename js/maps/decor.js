// Zombie_Apocalypse — DESIGNED PROPS for the module maps (desert, prison, jungle, stadium).
// Real-looking kitchens, appliances, cabinets, lockers, medical cabinets, menus… instead of plain coloured boxes.
// How it stays cheap:
//   · every designed FRONT (an oven door, a fridge, a pair of cabinet doors, a menu board) is one cell of a shared
//     canvas ATLAS: one texture + one material per atlas, so a whole kitchen merges into a couple of draw calls;
//   · a cell's roughness/metalness lives in a second little canvas (stainless shines, painted doors don't);
//   · glowing cells (drinks fridges, menu boards, screens) are copied into an emissive canvas;
//   · the 3-D detail (handles, knobs, taps, pans, plinths) goes through K.xadd (merged) / K.inst (instanced).
// A map uses it as:   const D = decor(K);  D.kitchenRun(...); D.fridge(...); D.abox(D.A, { pz: 'oven' }, ...)
// and can make its own atlas of cells:  const PA = D.atlas('prisonProps', [['locker', (g, w, h, r) => {...}], ...]).
// Atlases are 1024² (phones get 512² from mobile.js's texture cap). Each map makes only the atlases it uses.
import * as THREE from 'three';

export function rng(seed) { let a = seed >>> 0 || 1; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const rgb = (c, k = 1, a = 1) => `rgba(${clamp(c[0] * k, 0, 255) | 0},${clamp(c[1] * k, 0, 255) | 0},${clamp(c[2] * k, 0, 255) | 0},${a})`;
export const frame = (x, z, yaw) => { const c = Math.cos(yaw), s = Math.sin(yaw); return (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c]; };

// ---------------------------------------------------------------- canvas painting helpers (shared by every map)
export const P2 = {
  speck(g, x, y, w, h, n, cols, r, s = 1.5) { for (let i = 0; i < n; i++) { g.fillStyle = cols[(r() * cols.length) | 0]; const q = 0.5 + r() * s; g.fillRect(x + r() * w, y + r() * h, q, q); } },
  // brushed stainless: fine horizontal grain, a soft sheen band
  brushed(g, x, y, w, h, r, base = [190, 194, 198], vertical = false) {
    g.fillStyle = rgb(base); g.fillRect(x, y, w, h);
    for (let i = 0; i < (vertical ? w : h); i += 1) { g.fillStyle = rgb(base, 0.9 + r() * 0.2, 0.35); if (vertical) g.fillRect(x + i, y, 1, h); else g.fillRect(x, y + i, w, 1); }
    const gr = vertical ? g.createLinearGradient(x, y, x + w, y) : g.createLinearGradient(x, y, x, y + h);
    gr.addColorStop(0, 'rgba(255,255,255,0.10)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.22)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.06)'); gr.addColorStop(1, 'rgba(0,0,0,0.12)');
    g.fillStyle = gr; g.fillRect(x, y, w, h);
    for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(80,80,80,${0.04 + r() * 0.05})`; g.beginPath(); g.ellipse(x + r() * w, y + r() * h, 4 + r() * 10, 2 + r() * 6, r() * 3, 0, 7); g.fill(); }   // fingerprints / smudges
  },
  // a raised edge: light top-left, dark bottom-right
  bevel(g, x, y, w, h, lw = 2, a = 0.35) { g.fillStyle = `rgba(255,255,255,${a})`; g.fillRect(x, y, w, lw); g.fillRect(x, y, lw, h); g.fillStyle = `rgba(0,0,0,${a})`; g.fillRect(x, y + h - lw, w, lw); g.fillRect(x + w - lw, y, lw, h); },
  inset(g, x, y, w, h, lw = 2, a = 0.35) { g.fillStyle = `rgba(0,0,0,${a})`; g.fillRect(x, y, w, lw); g.fillRect(x, y, lw, h); g.fillStyle = `rgba(255,255,255,${a * 0.8})`; g.fillRect(x, y + h - lw, w, lw); g.fillRect(x + w - lw, y, lw, h); },
  // a chrome bar handle (horizontal or vertical) with its two standoffs
  bar(g, x, y, len, th = 6, vertical = false) {
    const w = vertical ? th : len, h = vertical ? len : th;
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + 2, y + 3, w, h);
    const gr = vertical ? g.createLinearGradient(x, 0, x + w, 0) : g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, '#f4f6f8'); gr.addColorStop(0.45, '#b8bcc0'); gr.addColorStop(1, '#6a6e72'); g.fillStyle = gr; g.fillRect(x, y, w, h);
  },
  knob(g, x, y, rad, col = '#1a1a1a') {
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.arc(x + 1.5, y + 2, rad, 0, 7); g.fill();
    const gr = g.createRadialGradient(x - rad * 0.3, y - rad * 0.3, 1, x, y, rad); gr.addColorStop(0, '#5a5a5a'); gr.addColorStop(1, col);
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill(); g.fillStyle = '#e8e8e8'; g.fillRect(x - 1, y - rad + 1, 2, rad * 0.6);
  },
  text(g, s, x, y, size, col, align = 'center', font = 'bold', fam = 'Helvetica, Arial, sans-serif', maxW = 0) {
    g.fillStyle = col; g.textAlign = align; g.textBaseline = 'middle'; g.font = `${font} ${size}px ${fam}`;
    if (maxW) { const tw = g.measureText(s).width; if (tw > maxW) g.font = `${font} ${size * maxW / tw}px ${fam}`; }
    g.fillText(s, x, y);
  },
  // wood grain over a rect (planks running vertically when vertical)
  grain(g, x, y, w, h, r, base = [120, 80, 48], vertical = true) {
    g.fillStyle = rgb(base); g.fillRect(x, y, w, h);
    const n = vertical ? w : h;
    for (let i = 0; i < n; i += 1) { g.fillStyle = rgb(base, 0.85 + 0.3 * Math.abs(Math.sin(i * 0.37 + r() * 0.6)), 0.5); if (vertical) g.fillRect(x + i, y, 1, h); else g.fillRect(x, y + i, w, 1); }
    for (let i = 0; i < 3; i++) { const cx = x + r() * w, cy = y + r() * h; g.strokeStyle = rgb(base, 0.6, 0.5); g.lineWidth = 1; g.beginPath(); g.ellipse(cx, cy, vertical ? 3 + r() * 4 : 8 + r() * 10, vertical ? 8 + r() * 10 : 3 + r() * 4, 0, 0, 7); g.stroke(); }
  },
  // glass: dark with a diagonal reflection
  glass(g, x, y, w, h, tint = [30, 36, 40], a = 1) {
    g.fillStyle = rgb(tint, 1, a); g.fillRect(x, y, w, h);
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.fillStyle = 'rgba(255,255,255,0.10)'; g.beginPath(); g.moveTo(x + w * 0.1, y); g.lineTo(x + w * 0.45, y); g.lineTo(x + w * 0.05, y + h); g.lineTo(x - w * 0.3, y + h); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.06)'; g.beginPath(); g.moveTo(x + w * 0.55, y); g.lineTo(x + w * 0.65, y); g.lineTo(x + w * 0.25, y + h); g.lineTo(x + w * 0.15, y + h); g.fill();
    g.restore();
  },
  // a sticky label / paper sheet with a few lines of "text"
  paper(g, x, y, w, h, r, col = '#f2efe6', lines = 5) {
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + 2, y + 2, w, h); g.fillStyle = col; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(40,40,50,0.55)'; for (let i = 0; i < lines; i++) g.fillRect(x + w * 0.1, y + h * (0.18 + i * 0.7 / lines), w * (0.5 + r() * 0.35), Math.max(1, h * 0.04));
  },
};

// ---------------------------------------------------------------- the kitchen / food / common atlas cells
// each: [key, draw(g, w, h, r), { rough, metal, glow }]
const S = P2;
const steelCell = (g, w, h, r) => S.brushed(g, 0, 0, w, h, r);
const CELLS = [
  ['steel', steelCell, { rough: 0.32, metal: 0.75 }],
  ['white', (g, w, h, r) => { g.fillStyle = '#e8e6e0'; g.fillRect(0, 0, w, h); S.speck(g, 0, 0, w, h, 300, ['rgba(0,0,0,0.03)', 'rgba(255,255,255,0.1)'], r); const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(0,0,0,0.06)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, { rough: 0.3, metal: 0 }],
  // a stainless wall oven / range front: control strip (clock, knobs), a glass door with a bar handle, a drawer
  ['oven', (g, w, h, r) => {
    S.brushed(g, 0, 0, w, h, r);
    g.fillStyle = '#141516'; g.fillRect(0, 0, w, h * 0.17); S.bevel(g, 0, 0, w, h * 0.17, 2, 0.25);
    for (let k = 0; k < 5; k++) { if (k === 2) continue; S.knob(g, w * (0.12 + k * 0.19), h * 0.085, h * 0.045, '#2a2a2a'); }
    g.fillStyle = '#0a1a0a'; g.fillRect(w * 0.43, h * 0.05, w * 0.14, h * 0.07); S.text(g, '12:00', w * 0.5, h * 0.087, h * 0.05, '#40ff70', 'center', 'bold', 'monospace');
    S.bevel(g, w * 0.04, h * 0.2, w * 0.92, h * 0.62, 2, 0.3);
    S.bar(g, w * 0.12, h * 0.23, w * 0.76, h * 0.035);
    S.glass(g, w * 0.14, h * 0.32, w * 0.72, h * 0.42, [24, 22, 20]);
    g.strokeStyle = 'rgba(120,120,120,0.35)'; g.lineWidth = 1; for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(w * 0.17, h * (0.4 + i * 0.07)); g.lineTo(w * 0.83, h * (0.4 + i * 0.07)); g.stroke(); }   // the racks inside
    S.bevel(g, w * 0.04, h * 0.85, w * 0.92, h * 0.13, 2, 0.3); S.bar(g, w * 0.3, h * 0.88, w * 0.4, h * 0.025);
  }, { rough: 0.32, metal: 0.65 }],
  // a four-burner hob seen from above: black enamel, cast-iron grates, burner caps
  ['hob', (g, w, h, r) => {
    g.fillStyle = '#1b1c1e'; g.fillRect(0, 0, w, h); S.speck(g, 0, 0, w, h, 400, ['rgba(255,255,255,0.05)'], r);
    for (const [cx, cy] of [[0.27, 0.28], [0.73, 0.28], [0.27, 0.72], [0.73, 0.72]]) {
      const x = w * cx, y = h * cy, rr = w * 0.15;
      g.fillStyle = '#2c2d2f'; g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill();
      g.fillStyle = '#4a4b4d'; g.beginPath(); g.arc(x, y, rr * 0.45, 0, 7); g.fill(); g.fillStyle = '#121212'; g.beginPath(); g.arc(x, y, rr * 0.25, 0, 7); g.fill();
      g.strokeStyle = '#0c0c0c'; g.lineWidth = w * 0.025; g.strokeRect(x - rr * 1.3, y - rr * 1.3, rr * 2.6, rr * 2.6);   // the grate
      g.beginPath(); g.moveTo(x - rr * 1.3, y); g.lineTo(x + rr * 1.3, y); g.moveTo(x, y - rr * 1.3); g.lineTo(x, y + rr * 1.3); g.stroke();
    }
  }, { rough: 0.45, metal: 0.3 }],
  // two shaker cabinet doors (painted cream), bar pulls
  ['cab2', (g, w, h, r) => {
    g.fillStyle = '#e6dfcf'; g.fillRect(0, 0, w, h);
    for (const x0 of [0, w / 2]) { S.bevel(g, x0 + 3, 3, w / 2 - 6, h - 6, 2, 0.3); g.fillStyle = '#ddd5c3'; g.fillRect(x0 + w * 0.09, h * 0.09, w / 2 - w * 0.18, h * 0.82); S.inset(g, x0 + w * 0.09, h * 0.09, w / 2 - w * 0.18, h * 0.82, 2, 0.25); }
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(w / 2 - 1, 0, 2, h);
    S.bar(g, w / 2 - 12, h * 0.12, h * 0.22, 4, true); S.bar(g, w / 2 + 8, h * 0.12, h * 0.22, 4, true);
  }, { rough: 0.55, metal: 0 }],
  // two rustic wooden doors: stained boards, a cross brace, iron knobs (desert / jungle)
  ['cabWood2', (g, w, h, r) => {
    S.grain(g, 0, 0, w, h, r, [128, 82, 46]);
    for (const x0 of [0, w / 2]) { S.bevel(g, x0 + 3, 3, w / 2 - 6, h - 6, 3, 0.35); g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x0 + w * 0.08, h * 0.1, w / 2 - w * 0.16, h * 0.8); S.inset(g, x0 + w * 0.08, h * 0.1, w / 2 - w * 0.16, h * 0.8, 2, 0.3); }
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(w / 2 - 1.5, 0, 3, h);
    for (const x of [w / 2 - 14, w / 2 + 14]) { S.knob(g, x, h * 0.5, 6, '#2a2018'); }
    for (const x of [8, w - 14]) for (const y of [h * 0.15, h * 0.8]) { g.fillStyle = '#2a2622'; g.fillRect(x, y, 6, 16); }   // hinges
  }, { rough: 0.7, metal: 0 }],
  // a bank of three drawers (cream shaker), bar pulls
  ['drawers3', (g, w, h, r) => {
    g.fillStyle = '#e6dfcf'; g.fillRect(0, 0, w, h);
    const hs = [0, 0.28, 0.62, 1];
    for (let i = 0; i < 3; i++) { const y0 = h * hs[i] + 3, hh = h * (hs[i + 1] - hs[i]) - 6; S.bevel(g, 3, y0, w - 6, hh, 2, 0.3); g.fillStyle = '#ddd5c3'; g.fillRect(w * 0.06, y0 + hh * 0.15, w * 0.88, hh * 0.7); S.bar(g, w * 0.3, y0 + hh * 0.28, w * 0.4, 5); }
    g.fillStyle = 'rgba(0,0,0,0.5)'; for (const f of [0.28, 0.62]) g.fillRect(0, h * f - 1, w, 2);
  }, { rough: 0.55, metal: 0 }],
  // a tall fridge-freezer front (drawn for a ~1:2.2 face): freezer door on top, fridge below, long handles
  ['fridge', (g, w, h, r) => {
    S.brushed(g, 0, 0, w, h, r, [200, 203, 206], true);
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, h * 0.34, w, 3);
    S.bevel(g, 2, 2, w - 4, h * 0.34 - 3, 2, 0.25); S.bevel(g, 2, h * 0.34 + 3, w - 4, h * 0.66 - 5, 2, 0.25);
    S.bar(g, w * 0.08, h * 0.06, h * 0.22, 9, true); S.bar(g, w * 0.08, h * 0.4, h * 0.3, 9, true);
    g.fillStyle = '#26282a'; g.fillRect(w * 0.6, h * 0.42, w * 0.26, h * 0.12); g.fillStyle = '#0c0d0e'; g.fillRect(w * 0.66, h * 0.47, w * 0.14, h * 0.06);   // water/ice dispenser
    S.text(g, '4°', w * 0.73, h * 0.445, h * 0.022, '#7ad0ff', 'center', 'bold', 'monospace');
    S.text(g, 'FROSTLINE', w * 0.5, h * 0.3, h * 0.025, 'rgba(60,60,60,0.8)', 'center', 'bold');
  }, { rough: 0.3, metal: 0.6 }],
  // a commercial undercounter door: stainless, a long pull along the top, louvres at the foot, a temperature readout
  ['steelDoor', (g, w, h, r) => {
    S.brushed(g, 0, 0, w, h, r);
    for (const x0 of [0, w / 2]) { S.bevel(g, x0 + 3, 3, w / 2 - 6, h * 0.8 - 6, 2, 0.28); S.bar(g, x0 + w * 0.08, h * 0.08, w * 0.34, 7); }
    g.fillStyle = '#2a2c2e'; g.fillRect(0, h * 0.8, w, h * 0.2); g.fillStyle = '#0e0f10'; for (let x = 10; x < w - 10; x += 9) g.fillRect(x, h * 0.84, 5, h * 0.12);
    g.fillStyle = '#081008'; g.fillRect(w * 0.42, h * 0.84, w * 0.16, h * 0.1); S.text(g, '3.2', w * 0.5, h * 0.89, h * 0.06, '#ff5a40', 'center', 'bold', 'monospace');
  }, { rough: 0.32, metal: 0.65 }],
  // a dishwasher: stainless with a control strip on top, a recessed handle
  ['dishwasher', (g, w, h, r) => {
    S.brushed(g, 0, 0, w, h, r);
    g.fillStyle = '#1d1e20'; g.fillRect(0, 0, w, h * 0.13); for (let k = 0; k < 5; k++) { g.fillStyle = k === 0 ? '#40d060' : '#606468'; g.beginPath(); g.arc(w * (0.2 + k * 0.13), h * 0.065, 4, 0, 7); g.fill(); }
    S.bevel(g, 3, h * 0.15, w - 6, h * 0.83, 2, 0.28); S.bar(g, w * 0.2, h * 0.19, w * 0.6, 6);
  }, { rough: 0.3, metal: 0.65 }],
  // a stainless sink seen from above: a deep bowl with a drain, a ribbed drainer beside it
  ['sink', (g, w, h, r) => {
    S.brushed(g, 0, 0, w, h, r, [178, 182, 186]);
    const bx = w * 0.06, by = h * 0.12, bw = w * 0.5, bh = h * 0.76;
    const gr = g.createRadialGradient(bx + bw / 2, by + bh / 2, 4, bx + bw / 2, by + bh / 2, bw * 0.7); gr.addColorStop(0, '#6a6e72'); gr.addColorStop(1, '#a8acb0');
    g.fillStyle = gr; g.beginPath(); g.roundRect ? g.roundRect(bx, by, bw, bh, 14) : g.rect(bx, by, bw, bh); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#2a2c2e'; g.beginPath(); g.arc(bx + bw / 2, by + bh * 0.62, 9, 0, 7); g.fill(); g.strokeStyle = '#9a9ea2'; g.lineWidth = 2; g.beginPath(); g.arc(bx + bw / 2, by + bh * 0.62, 9, 0, 7); g.stroke();
    for (let y = by + 6; y < by + bh - 4; y += 10) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(w * 0.62, y, w * 0.33, 3); g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(w * 0.62, y + 3, w * 0.33, 1); }
  }, { rough: 0.25, metal: 0.8 }],
  // a canopy hood front: a stainless skirt over a row of baffle filters
  ['hood', (g, w, h, r) => {
    S.brushed(g, 0, 0, w, h, r);
    g.fillStyle = '#5a5e62'; g.fillRect(w * 0.04, h * 0.38, w * 0.92, h * 0.54);
    for (let x = w * 0.05; x < w * 0.95; x += w * 0.06) { const gr = g.createLinearGradient(x, 0, x + w * 0.06, 0); gr.addColorStop(0, '#d8dcdf'); gr.addColorStop(0.5, '#7a7e82'); gr.addColorStop(1, '#3a3e42'); g.fillStyle = gr; g.fillRect(x, h * 0.4, w * 0.055, h * 0.5); }
    for (let k = 0; k < 4; k++) { g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(w * (0.05 + k * 0.23), h * 0.38, 3, h * 0.54); }
    S.text(g, 'GREASE FILTERS · CLEAN WEEKLY', w * 0.5, h * 0.2, h * 0.07, 'rgba(40,40,40,0.7)', 'center', 'bold', undefined, w * 0.9);
    S.bevel(g, 0, 0, w, h, 3, 0.3);
  }, { rough: 0.3, metal: 0.75 }],
  // a microwave front: dark window with a grille, a keypad
  ['microwave', (g, w, h, r) => {
    S.brushed(g, 0, 0, w, h, r, [70, 72, 76]);
    S.glass(g, w * 0.05, h * 0.1, w * 0.62, h * 0.8, [14, 14, 16]);
    g.fillStyle = 'rgba(80,80,80,0.35)'; for (let y = h * 0.12; y < h * 0.88; y += 5) for (let x = w * 0.07; x < w * 0.65; x += 5) g.fillRect(x, y, 2, 2);
    g.fillStyle = '#060806'; g.fillRect(w * 0.73, h * 0.12, w * 0.22, h * 0.14); S.text(g, '0:30', w * 0.84, h * 0.19, h * 0.09, '#5aff7a', 'center', 'bold', 'monospace');
    for (let j = 0; j < 4; j++) for (let i = 0; i < 3; i++) { g.fillStyle = '#d8dadc'; g.fillRect(w * (0.74 + i * 0.07), h * (0.34 + j * 0.12), w * 0.05, h * 0.08); }
    S.bar(g, w * 0.69, h * 0.12, h * 0.76, 4, true);
  }, { rough: 0.3, metal: 0.5 }],
  // a glass-door drinks fridge, lit inside: shelves of cans and bottles in brand colours (glows)
  ['drinks', (g, w, h, r) => {
    g.fillStyle = '#e8ecef'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#c81a1a'; g.fillRect(0, 0, w, h * 0.1); S.text(g, 'ICE COLD', w * 0.5, h * 0.05, h * 0.065, '#ffffff', 'center', 'bold', undefined, w * 0.9);
    const ix = w * 0.08, iy = h * 0.13, iw = w * 0.84, ih = h * 0.82;
    g.fillStyle = '#f4f8fa'; g.fillRect(ix, iy, iw, ih);
    const cols = ['#d8201a', '#1a4ad8', '#20a040', '#f0c020', '#f08020', '#e8e8e8', '#8a2ac8', '#202020'];
    const rows = 5;
    for (let j = 0; j < rows; j++) {
      const y1 = iy + (j + 1) * ih / rows; g.fillStyle = '#9aa0a6'; g.fillRect(ix, y1 - 3, iw, 3);
      let x = ix + 3; const tall = j % 2 === 0;
      while (x < ix + iw - 10) { const c = cols[(r() * cols.length) | 0], bw = tall ? 9 : 11, bh = tall ? ih / rows * 0.78 : ih / rows * 0.55;
        g.fillStyle = c; if (tall) { g.fillRect(x, y1 - 3 - bh, bw, bh * 0.8); g.fillRect(x + 3, y1 - 3 - bh - 6, 3, 8); } else g.fillRect(x, y1 - 3 - bh, bw, bh);
        g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(x + 1, y1 - 3 - bh * 0.7, 2, bh * 0.5); g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(x, y1 - 3 - bh * 0.55, bw, bh * 0.14);
        x += bw + 2; }
    }
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.moveTo(ix, iy); g.lineTo(ix + iw * 0.35, iy); g.lineTo(ix, iy + ih * 0.6); g.fill();
    S.bar(g, w * 0.88, h * 0.3, h * 0.4, 6, true); S.bevel(g, ix, iy, iw, ih, 3, 0.4);
  }, { rough: 0.15, metal: 0.1, glow: 0.55 }],
  // a bain-marie / steam table seen from above: four pans of food in a stainless well, serving spoons
  ['pans', (g, w, h, r) => {
    S.brushed(g, 0, 0, w, h, r, [170, 174, 178]);
    const foods = [[[226, 214, 170], 'mash'], [[96, 140, 40], 'peas'], [[140, 46, 28], 'chili'], [[210, 140, 40], 'corn']];
    foods.forEach(([c, kind], i) => {
      const x = w * 0.04 + (i % 2) * w * 0.48, y = h * 0.05 + Math.floor(i / 2) * h * 0.47, pw = w * 0.44, ph = h * 0.42;
      g.fillStyle = '#5a5e62'; g.fillRect(x - 3, y - 3, pw + 6, ph + 6); g.fillStyle = '#c8ccd0'; g.fillRect(x - 3, y - 3, pw + 6, 3);
      g.fillStyle = rgb(c); g.fillRect(x, y, pw, ph);
      for (let k = 0; k < 220; k++) { const q = kind === 'peas' || kind === 'corn' ? 3.5 : 6; g.fillStyle = rgb(c, 0.75 + r() * 0.5, 0.8); g.beginPath(); g.arc(x + r() * pw, y + r() * ph, 0.8 + r() * q * 0.5, 0, 7); g.fill(); }
      if (kind === 'chili') for (let k = 0; k < 40; k++) { g.fillStyle = '#5a2414'; g.beginPath(); g.ellipse(x + r() * pw, y + r() * ph, 3, 2, r() * 3, 0, 7); g.fill(); }
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x, y, pw, ph * 0.12);
      g.strokeStyle = '#d8dcdf'; g.lineWidth = 4; g.beginPath(); g.moveTo(x + pw * 0.3, y + ph * 0.55); g.lineTo(x + pw * 0.95, y + ph * 0.1); g.stroke();   // the spoon's handle
      g.fillStyle = '#c0c4c8'; g.beginPath(); g.ellipse(x + pw * 0.28, y + ph * 0.6, 9, 6, -0.6, 0, 7); g.fill();
    });
  }, { rough: 0.35, metal: 0.4 }],
  // a backlit menu board (the text is drawn by the map: this is a generic diner board)
  ['menu', (g, w, h, r) => {
    g.fillStyle = '#16181a'; g.fillRect(0, 0, w, h); g.fillStyle = '#c82a1a'; g.fillRect(0, 0, w, h * 0.16);
    S.text(g, 'MENU', w * 0.5, h * 0.085, h * 0.11, '#fff4d8');
    const items = [['HOT DOG', '4.50'], ['CHEESEBURGER', '6.00'], ['FRIES', '3.00'], ['PIE & PEAS', '5.50'], ['NACHOS', '4.00'], ['SODA', '2.50'], ['TEA / COFFEE', '2.00']];
    items.forEach(([a, b], i) => { const y = h * (0.24 + i * 0.105); S.text(g, a, w * 0.06, y, h * 0.06, '#f4f0e4', 'left', 'bold'); S.text(g, b, w * 0.94, y, h * 0.06, '#f0c040', 'right', 'bold'); g.fillStyle = 'rgba(255,255,255,0.15)'; for (let x = w * 0.5; x < w * 0.78; x += 6) g.fillRect(x, y + 2, 2, 2); });
  }, { rough: 0.3, metal: 0, glow: 0.9 }],
  // a deep fryer: two baskets in hot oil, a control panel
  ['fryer', (g, w, h, r) => {
    S.brushed(g, 0, 0, w, h, r); g.fillStyle = '#1a1b1c'; g.fillRect(0, 0, w, h * 0.22);
    for (let k = 0; k < 2; k++) { S.knob(g, w * (0.25 + k * 0.5), h * 0.11, h * 0.06); g.fillStyle = '#ff6a20'; g.beginPath(); g.arc(w * (0.12 + k * 0.5), h * 0.11, 4, 0, 7); g.fill(); }
    for (const x0 of [0.06, 0.52]) { S.bevel(g, w * x0, h * 0.28, w * 0.42, h * 0.66, 2, 0.3); S.bar(g, w * (x0 + 0.08), h * 0.32, w * 0.26, 6); }
    S.text(g, 'HOT OIL', w * 0.5, h * 0.62, h * 0.07, 'rgba(180,30,20,0.85)');
  }, { rough: 0.32, metal: 0.65 }],
  // an espresso / urn machine front: chrome group heads, gauges, a cup rail
  ['coffee', (g, w, h, r) => {
    S.brushed(g, 0, 0, w, h, r, [150, 30, 26]);
    g.fillStyle = '#c8ccd0'; g.fillRect(0, h * 0.06, w, h * 0.06); g.fillRect(0, h * 0.86, w, h * 0.14);
    for (const x of [0.3, 0.7]) { g.fillStyle = '#f4f4f4'; g.beginPath(); g.arc(w * x, h * 0.28, w * 0.08, 0, 7); g.fill(); g.strokeStyle = '#222'; g.lineWidth = 2; g.stroke(); g.beginPath(); g.moveTo(w * x, h * 0.28); g.lineTo(w * x + 8, h * 0.24); g.stroke(); }
    for (const x of [0.25, 0.55]) { g.fillStyle = '#d8dcdf'; g.fillRect(w * x, h * 0.5, w * 0.2, h * 0.08); g.fillStyle = '#1a1a1a'; g.fillRect(w * x + w * 0.08, h * 0.58, w * 0.04, h * 0.12); }
    S.text(g, 'ESPRESSO', w * 0.5, h * 0.42, h * 0.06, '#f4e8d0');
  }, { rough: 0.25, metal: 0.55 }],
  // a cafeteria compartment tray with food, seen from above
  ['tray', (g, w, h, r) => {
    g.fillStyle = '#9a9ea2'; g.fillRect(0, 0, w, h); S.bevel(g, 0, 0, w, h, 6, 0.3);
    const comp = [[0.06, 0.08, 0.5, 0.5, [140, 70, 40]], [0.6, 0.08, 0.34, 0.5, [226, 214, 170]], [0.06, 0.64, 0.28, 0.28, [96, 140, 40]], [0.38, 0.64, 0.28, 0.28, [210, 160, 60]], [0.7, 0.64, 0.24, 0.28, [200, 60, 40]]];
    for (const [x, y, ww, hh, c] of comp) { S.inset(g, w * x - 2, h * y - 2, w * ww + 4, h * hh + 4, 3, 0.4); g.fillStyle = rgb(c); g.fillRect(w * x, h * y, w * ww, h * hh); S.speck(g, w * x, h * y, w * ww, h * hh, 120, [rgb(c, 0.7), rgb(c, 1.25)], r, 4); }
  }, { rough: 0.45, metal: 0.2 }],
  // a white-enamel domestic cooker front (desert / jungle homes): knobs, an oven window, a drawer
  ['cooker', (g, w, h, r) => {
    g.fillStyle = '#ebe7dc'; g.fillRect(0, 0, w, h); const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, 'rgba(0,0,0,0.05)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.1)'); gr.addColorStop(1, 'rgba(0,0,0,0.08)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#d0cbbd'; g.fillRect(0, 0, w, h * 0.16); for (let k = 0; k < 5; k++) S.knob(g, w * (0.12 + k * 0.19), h * 0.08, h * 0.045, '#222');
    S.bevel(g, w * 0.05, h * 0.2, w * 0.9, h * 0.6, 2, 0.3); S.bar(g, w * 0.14, h * 0.23, w * 0.72, h * 0.03);
    S.glass(g, w * 0.16, h * 0.32, w * 0.68, h * 0.38, [30, 26, 22]);
    S.bevel(g, w * 0.05, h * 0.84, w * 0.9, h * 0.13, 2, 0.3); S.bar(g, w * 0.35, h * 0.87, w * 0.3, h * 0.025);
  }, { rough: 0.35, metal: 0.05 }],
  // an old white fridge (rounded corners, chrome handle, a badge) for village houses / huts
  ['fridgeOld', (g, w, h, r) => {
    g.fillStyle = '#ece8dc'; g.fillRect(0, 0, w, h); const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, 'rgba(0,0,0,0.12)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.15)'); gr.addColorStop(1, 'rgba(0,0,0,0.12)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(0, h * 0.3, w, 3);
    S.bar(g, w * 0.8, h * 0.1, h * 0.14, 10, true); S.bar(g, w * 0.8, h * 0.36, h * 0.2, 10, true);
    g.fillStyle = '#b8a060'; g.fillRect(w * 0.35, h * 0.33, w * 0.3, h * 0.025); S.text(g, 'POLAR', w * 0.5, h * 0.343, h * 0.02, '#3a2a10');
    for (let i = 0; i < 4; i++) { g.fillStyle = ['#e04030', '#30a0e0', '#f0c020', '#40c060'][i]; g.fillRect(w * (0.15 + i * 0.12), h * (0.42 + (i % 2) * 0.05), w * 0.07, h * 0.035); }   // fridge magnets
    S.paper(g, w * 0.2, h * 0.52, w * 0.32, h * 0.12, r, '#f8f4e8', 4);
    g.fillStyle = 'rgba(120,90,40,0.15)'; g.fillRect(0, h * 0.9, w, h * 0.1);
  }, { rough: 0.35, metal: 0.05 }],
  // grey steel locker doors (two narrow doors with louvres, a number plate, a latch)
  ['locker', (g, w, h, r) => {
    for (const [i, x0] of [[0, 0], [1, w / 2]]) {
      g.fillStyle = '#7a848c'; g.fillRect(x0, 0, w / 2, h); S.bevel(g, x0 + 2, 2, w / 2 - 4, h - 4, 2, 0.35);
      for (const y0 of [0.05, 0.82]) for (let k = 0; k < 5; k++) { g.fillStyle = '#20262a'; g.fillRect(x0 + w * 0.12, h * (y0 + k * 0.022), w * 0.26, h * 0.01); }
      g.fillStyle = '#d8d8d0'; g.fillRect(x0 + w * 0.17, h * 0.2, w * 0.16, h * 0.05); S.text(g, String(100 + ((r() * 90) | 0)), x0 + w * 0.25, h * 0.226, h * 0.035, '#222');
      g.fillStyle = '#2a2e32'; g.fillRect(x0 + w * 0.36, h * 0.45, w * 0.06, h * 0.1); g.fillStyle = '#c8ccd0'; g.fillRect(x0 + w * 0.37, h * 0.47, w * 0.04, h * 0.06);
      for (let k = 0; k < 3; k++) { g.fillStyle = `rgba(60,40,20,${0.1 + r() * 0.15})`; g.fillRect(x0 + r() * w / 2, h * (0.3 + r() * 0.5), 3 + r() * 10, 2 + r() * 4); }   // dents and scratches
    }
    g.fillStyle = '#101214'; g.fillRect(w / 2 - 1, 0, 2, h);
  }, { rough: 0.5, metal: 0.45 }],
  // a glass-fronted medicine cabinet: bottles, boxes, labelled shelves
  ['medcab', (g, w, h, r) => {
    g.fillStyle = '#e8ecee'; g.fillRect(0, 0, w, h); const ix = w * 0.07, iy = h * 0.06, iw = w * 0.86, ih = h * 0.88;
    g.fillStyle = '#d4dade'; g.fillRect(ix, iy, iw, ih);
    const cols = ['#f4f4f0', '#d84030', '#3070c0', '#e8b030', '#40a060', '#8a5a30', '#ffffff'];
    for (let j = 0; j < 4; j++) {
      const y1 = iy + (j + 1) * ih / 4; g.fillStyle = '#a8b0b6'; g.fillRect(ix, y1 - 3, iw, 3);
      let x = ix + 3; while (x < ix + iw - 12) { const box = r() < 0.5, c = cols[(r() * cols.length) | 0], bw = box ? 14 + r() * 10 : 7 + r() * 4, bh = (box ? 0.5 : 0.65) * ih / 4 * (0.7 + r() * 0.3);
        g.fillStyle = c; g.fillRect(x, y1 - 3 - bh, bw, bh); if (box) { g.fillStyle = 'rgba(200,30,30,0.9)'; g.fillRect(x + 2, y1 - 3 - bh * 0.6, bw - 4, bh * 0.2); } else { g.fillStyle = '#f8f8f8'; g.fillRect(x, y1 - 3 - bh * 0.6, bw, bh * 0.3); g.fillStyle = '#ddd'; g.fillRect(x + 1, y1 - 3 - bh - 4, bw - 2, 5); }
        x += bw + 2; }
      g.fillStyle = '#f8f8f0'; g.fillRect(ix + iw * 0.35, y1 - 1, iw * 0.3, 6);
    }
    S.glass(g, ix, iy, iw, ih, [200, 220, 230], 0.25); g.fillStyle = '#8a9298'; g.fillRect(w / 2 - 1, iy, 2, ih); S.bevel(g, 0, 0, w, h, 4, 0.3);
    g.fillStyle = '#c81a1a'; g.fillRect(w * 0.44, h * 0.005, w * 0.12, h * 0.045); g.fillStyle = '#fff'; g.fillRect(w * 0.49, h * 0.01, w * 0.02, h * 0.035); g.fillRect(w * 0.47, h * 0.02, w * 0.06, h * 0.015);
  }, { rough: 0.2, metal: 0.1 }],
  // a four-drawer filing cabinet (labels in the card holders, recessed pulls)
  ['filing', (g, w, h, r) => {
    g.fillStyle = '#8a9096'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) { const y0 = i * h / 4 + 3, hh = h / 4 - 6; S.bevel(g, 4, y0, w - 8, hh, 2, 0.35); g.fillStyle = '#e8e4d8'; g.fillRect(w * 0.38, y0 + hh * 0.15, w * 0.24, hh * 0.18); S.text(g, ['A–F', 'G–L', 'M–R', 'S–Z'][i], w * 0.5, y0 + hh * 0.24, hh * 0.13, '#333'); S.bar(g, w * 0.32, y0 + hh * 0.45, w * 0.36, 7); }
  }, { rough: 0.45, metal: 0.4 }],
  // a cork notice board with pinned sheets, a rota, a photo
  ['notice', (g, w, h, r) => {
    g.fillStyle = '#6a4a2a'; g.fillRect(0, 0, w, h); g.fillStyle = '#b88a58'; g.fillRect(8, 8, w - 16, h - 16); S.speck(g, 8, 8, w - 16, h - 16, 1500, ['rgba(90,60,30,0.4)', 'rgba(220,180,130,0.4)'], r, 2);
    for (let i = 0; i < 7; i++) { const pw = 40 + r() * 40, ph = 50 + r() * 40, x = 14 + r() * (w - pw - 28), y = 14 + r() * (h - ph - 28); g.save(); g.translate(x + pw / 2, y + ph / 2); g.rotate((r() - 0.5) * 0.2); S.paper(g, -pw / 2, -ph / 2, pw, ph, r, ['#f4f0e4', '#fff8b0', '#d8ecff', '#ffd8d8'][i % 4], 5); g.fillStyle = ['#e02020', '#2060e0', '#20a040'][i % 3]; g.beginPath(); g.arc(0, -ph / 2 + 5, 3.5, 0, 7); g.fill(); g.restore(); }
  }, { rough: 0.9, metal: 0 }],
];

// extra cells maps can put in their own atlases
export const XCELLS = {
  // the tool wall: a pegboard with painted tool outlines and the tools hung on them
  tools: [(g, w, h, r) => {
    g.fillStyle = '#c8b898'; g.fillRect(0, 0, w, h); g.fillStyle = '#5a4a38'; for (let y = 8; y < h; y += 16) for (let x = 8; x < w; x += 16) { g.beginPath(); g.arc(x, y, 2.4, 0, 7); g.fill(); }
    const tool = (x, y, kind) => { g.save(); g.translate(x, y); g.fillStyle = '#1a1a1a'; g.globalAlpha = 0.35; g.fillRect(-3, -3, 30, 60); g.globalAlpha = 1;
      if (kind === 0) { g.fillStyle = '#c82a20'; g.fillRect(4, 26, 10, 30); g.fillStyle = '#8a9096'; g.fillRect(0, 0, 18, 26); }                     // hammer
      if (kind === 1) { g.fillStyle = '#e0b020'; g.fillRect(6, 28, 8, 28); g.fillStyle = '#b8bcc0'; g.fillRect(8, 0, 4, 28); }                      // screwdriver
      if (kind === 2) { g.fillStyle = '#b8bcc0'; g.fillRect(6, 0, 6, 50); g.beginPath(); g.arc(9, 4, 8, 0, 7); g.fill(); }                           // wrench
      if (kind === 3) { g.fillStyle = '#2a5ab0'; g.fillRect(2, 20, 6, 34); g.fillRect(12, 20, 6, 34); g.fillStyle = '#8a9096'; g.fillRect(4, 0, 12, 22); }   // pliers
      if (kind === 4) { g.fillStyle = '#6a4a2a'; g.fillRect(6, 30, 8, 26); g.fillStyle = '#a8acb0'; g.fillRect(0, 0, 22, 32); for (let k = 0; k < 6; k++) g.fillRect(22, k * 5, 3, 3); }   // saw
      g.restore(); };
    for (let j = 0; j < 3; j++) for (let i = 0; i < 6; i++) tool(10 + i * 40, 12 + j * 80, (i + j * 2) % 5);
    S.text(g, 'SIGN TOOLS OUT', w * 0.5, h * 0.97, h * 0.04, '#7a1a14');
  }, { rough: 0.8, metal: 0.1 }],
  // a red rolling tool chest: drawers with chrome pulls
  toolchest: [(g, w, h, r) => {
    g.fillStyle = '#b81e18'; g.fillRect(0, 0, w, h); const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, 'rgba(0,0,0,0.15)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(0,0,0,0.2)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const rows = [0.12, 0.12, 0.12, 0.18, 0.2, 0.22]; let y = 4;
    for (const f of rows) { const hh = h * f - 6; S.bevel(g, 4, y, w - 8, hh, 2, 0.35); g.fillStyle = '#c8ccd0'; g.fillRect(w * 0.1, y + hh * 0.2, w * 0.8, Math.max(4, hh * 0.18)); y += h * f; }
    S.text(g, 'PROTOOL', w * 0.5, h * 0.06, h * 0.04, '#fff');
  }, { rough: 0.35, metal: 0.3 }],
  // a wall-mounted TV / monitor showing a pitch-side camera or news (glows)
  screen: [(g, w, h, r) => {
    g.fillStyle = '#0a0b0c'; g.fillRect(0, 0, w, h); const ix = 8, iy = 8, iw = w - 16, ih = h - 16;
    const gr = g.createLinearGradient(0, iy, 0, iy + ih); gr.addColorStop(0, '#3a6aa8'); gr.addColorStop(0.5, '#6a9ad0'); gr.addColorStop(0.52, '#2a7a3a'); gr.addColorStop(1, '#1e5a2a'); g.fillStyle = gr; g.fillRect(ix, iy, iw, ih);
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(ix + iw * 0.48, iy + ih * 0.52, 2, ih * 0.48); g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 2; g.beginPath(); g.ellipse(ix + iw * 0.49, iy + ih * 0.76, iw * 0.15, ih * 0.1, 0, 0, 7); g.stroke();
    for (let i = 0; i < 12; i++) { g.fillStyle = i % 2 ? '#c81a1a' : '#f0f0f0'; g.fillRect(ix + r() * iw, iy + ih * (0.6 + r() * 0.3), 4, 9); }
    g.fillStyle = '#c81a1a'; g.fillRect(ix, iy + ih * 0.86, iw, ih * 0.14); S.text(g, 'BREAKING: EMERGENCY ALERT', ix + iw / 2, iy + ih * 0.93, ih * 0.08, '#fff', 'center', 'bold', undefined, iw * 0.95);
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(ix + 6, iy + 6, iw * 0.28, ih * 0.1); S.text(g, 'HOME 0 – 0 AWAY', ix + 8 + iw * 0.14, iy + 6 + ih * 0.05, ih * 0.06, '#fff', 'center', 'bold', undefined, iw * 0.26);
  }, { rough: 0.15, metal: 0.1, glow: 0.8 }],
};

// ---------------------------------------------------------------- atlases
const SIZE = 1024;
function makeAtlas(K, name, cells, o = {}) {
  const n = cells.length, grid = Math.max(2, Math.ceil(Math.sqrt(n))), cs = Math.floor(SIZE / grid);
  const cvs = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const col = cvs(SIZE, SIZE), rm = cvs(SIZE, SIZE), em = cvs(SIZE, SIZE);
  const g = col.getContext('2d'), gr = rm.getContext('2d'), ge = em.getContext('2d');
  gr.fillStyle = 'rgb(0,140,40)'; gr.fillRect(0, 0, SIZE, SIZE); ge.fillStyle = '#000'; ge.fillRect(0, 0, SIZE, SIZE);
  const uv = {}; let anyGlow = false;
  cells.forEach(([key, fn, opt = {}], i) => {
    const cx = (i % grid) * cs, cy = Math.floor(i / grid) * cs, pad = 2;
    g.save(); g.beginPath(); g.rect(cx, cy, cs, cs); g.clip(); g.translate(cx, cy);
    try { fn(g, cs, cs, rng(i * 131 + key.length * 17 + (o.seed || 0))); } catch (e) { console.warn('decor cell', key, e); }
    g.restore();
    gr.fillStyle = `rgb(0,${Math.round((opt.rough ?? 0.6) * 255)},${Math.round((opt.metal ?? 0) * 255)})`; gr.fillRect(cx, cy, cs, cs);
    if (opt.glow) { anyGlow = true; ge.globalAlpha = opt.glow; ge.drawImage(col, cx, cy, cs, cs, cx, cy, cs, cs); ge.globalAlpha = 1; }
    uv[key] = [(cx + pad) / SIZE, 1 - (cy + cs - pad) / SIZE, (cx + cs - pad) / SIZE, 1 - (cy + pad) / SIZE];
  });
  const tex = (c, srgb) => { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.userData.capOK = true; return t; };
  const std = K.std || (p => new THREE.MeshStandardMaterial(p));
  const mat = std({ map: tex(col, true), roughnessMap: tex(rm, false), metalnessMap: tex(rm, false), roughness: 1, metalness: 1,
    ...(anyGlow ? { emissive: 0xffffff, emissiveMap: tex(em, true), emissiveIntensity: 1 } : {}) });
  mat.name = 'decor:' + name;
  return { name, mat, uv, has: k => !!uv[k] };
}

// UV-remapped unit geometries, cached per atlas + face layout
const FACES = ['px', 'nx', 'top', 'bot', 'pz', 'nz'];
function boxGeo(A, faces, cache) {
  const key = A.name + '|' + FACES.map(f => faces[f] || '').join(',');
  if (cache.has(key)) return cache.get(key);
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), uv = geo.attributes.uv;
  FACES.forEach((f, fi) => {
    const cell = faces[f] || faces.side || faces.all || 'steel', r = A.uv[cell] || A.uv.steel || Object.values(A.uv)[0];
    for (let k = 0; k < 4; k++) { const i = fi * 4 + k; uv.setXY(i, r[0] + uv.getX(i) * (r[2] - r[0]), r[1] + uv.getY(i) * (r[3] - r[1])); }
  });
  cache.set(key, geo); return geo;
}
function planeGeo(A, cell, cache) {
  const key = A.name + '|plane|' + cell;
  if (cache.has(key)) return cache.get(key);
  const geo = new THREE.PlaneGeometry(1, 1), uv = geo.attributes.uv, r = A.uv[cell];
  for (let i = 0; i < uv.count; i++) uv.setXY(i, r[0] + uv.getX(i) * (r[2] - r[0]), r[1] + uv.getY(i) * (r[3] - r[1]));
  cache.set(key, geo); return geo;
}

// ---------------------------------------------------------------- tiling materials (world-UV, for K.box)
function tileTex(K, w, h, fn, srgb = true) { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }
function tiles(g, w, h, nx, ny, a, b, grout, r, glossy = true) {
  const tw = w / nx, th = h / ny;
  g.fillStyle = grout; g.fillRect(0, 0, w, h);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const off = (b && b.brick && j % 2) ? tw / 2 : 0;
    for (const dx of off ? [-tw, 0] : [0]) {
      const x = i * tw + off + dx + 1.5, y = j * th + 1.5, ww = tw - 3, hh = th - 3;
      const c = Array.isArray(a) ? a : a(i, j, r);
      g.fillStyle = rgb(c, 0.95 + r() * 0.08); g.fillRect(x, y, ww, hh);
      if (glossy) { g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(x, y, ww, 2); g.fillRect(x, y, 2, hh); g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x, y + hh - 2, ww, 2); }
    }
  }
}

// ---------------------------------------------------------------- the kit
const CACHE = new WeakMap();
export function decor(K) {
  if (CACHE.has(K.MAT)) return CACHE.get(K.MAT);
  const THREE_ = THREE, M = K.MAT, T = K.TILE, std = K.std || (p => new THREE.MeshStandardMaterial(p));
  const geoCache = new Map();
  const D = { K };
  CACHE.set(K.MAT, D);
  const add = (k, m, t) => { if (!M[k]) { M[k] = m; T[k] = t; } return M[k]; };
  // ---- tiling materials ----
  add('dzSteel', std({ map: tileTex(K, 256, 256, (g, w, h) => S.brushed(g, 0, 0, w, h, rng(3))), roughness: 0.32, metalness: 0.7 }), 1.2);
  add('dzTileW', std({ map: tileTex(K, 256, 256, (g, w, h) => tiles(g, w, h, 4, 8, [236, 236, 230], { brick: true }, '#b8b6ae', rng(5))), roughness: 0.18 }), 0.6);     // white subway tile
  add('dzTileSq', std({ map: tileTex(K, 256, 256, (g, w, h) => tiles(g, w, h, 6, 6, [226, 230, 228], null, '#9aa09e', rng(6))), roughness: 0.2 }), 0.9);              // square white tile
  add('dzTileZ', std({ map: tileTex(K, 256, 256, (g, w, h) => { const r = rng(8); tiles(g, w, h, 6, 6, (i, j) => [[40, 92, 140], [226, 220, 200], [190, 90, 50], [40, 110, 100]][(i + j * 2 + ((r() * 3) | 0)) % 4], null, '#d8d0bc', r); for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) { if ((i + j) % 2) continue; const cx = (i + 0.5) * w / 6, cy = (j + 0.5) * h / 6; g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, rr = k % 2 ? 7 : 15; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.fill(); } }), roughness: 0.25 }), 0.9);   // painted zellige
  add('dzGranite', std({ map: tileTex(K, 256, 256, (g, w, h) => { const r = rng(9); g.fillStyle = '#3a3836'; g.fillRect(0, 0, w, h); S.speck(g, 0, 0, w, h, 9000, ['rgba(200,190,180,0.5)', 'rgba(20,18,16,0.6)', 'rgba(140,110,90,0.5)', 'rgba(255,255,255,0.25)'], r, 2.5); }), roughness: 0.2, metalness: 0.05 }), 1.2);
  add('dzLaminate', std({ map: tileTex(K, 256, 256, (g, w, h) => { const r = rng(10); g.fillStyle = '#d8d0c0'; g.fillRect(0, 0, w, h); S.speck(g, 0, 0, w, h, 5000, ['rgba(120,110,90,0.25)', 'rgba(255,255,255,0.3)', 'rgba(80,70,60,0.2)'], r, 1.5); }), roughness: 0.4 }), 1.2);
  add('dzButcher', std({ map: tileTex(K, 256, 256, (g, w, h) => { const r = rng(11); for (let i = 0; i < 16; i++) { S.grain(g, 0, i * h / 16, w, h / 16, r, [176 + r() * 30, 120 + r() * 25, 70 + r() * 15], false); g.fillStyle = 'rgba(60,30,10,0.4)'; g.fillRect(0, i * h / 16, w, 1); } }), roughness: 0.55 }), 1.0);
  add('dzSheet', std({ map: tileTex(K, 128, 128, (g, w, h) => { const r = rng(14); g.fillStyle = '#eef0ee'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 2) { g.fillStyle = `rgba(0,0,0,${0.02 + r() * 0.03})`; g.fillRect(0, y, w, 1); } g.fillStyle = '#7aa0c8'; g.fillRect(0, 18, w, 5); g.fillRect(0, 26, w, 2); }), roughness: 0.95 }), 1.0);
  add('dzPlinth', std({ color: 0x1c1c1e, roughness: 0.8 }), 1);
  add('dzWoodDark', std({ map: tileTex(K, 256, 256, (g, w, h) => S.grain(g, 0, 0, w, h, rng(12), [92, 58, 34], false)), roughness: 0.55 }), 1.0);
  add('dzCurtain', std({ map: tileTex(K, 128, 256, (g, w, h) => { g.fillStyle = '#7aa6c0'; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x++) { g.fillStyle = `rgba(0,0,0,${0.18 * (0.5 + 0.5 * Math.sin(x / w * Math.PI * 6))})`; g.fillRect(x, 0, 1, h); } g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2; for (let y = 8; y < h; y += 32) { g.beginPath(); for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin(x / 8) * 3); g.stroke(); } }), roughness: 0.95, side: THREE.DoubleSide }), 1.4);
  D.mats = M;
  // ---- the shared kitchen / props atlas ----
  D.A = makeAtlas(K, 'kitchen', CELLS);
  D.atlas = (name, cells, o) => makeAtlas(K, name, cells, o);
  // ---- shared little geometries ----
  const GG = D.G = {
    cylY: new THREE.CylinderGeometry(1, 1, 1, 12).translate(0, 0.5, 0),
    cylX: new THREE.CylinderGeometry(1, 1, 1, 10).rotateZ(Math.PI / 2),       // along x, centred
    knob: new THREE.CylinderGeometry(0.018, 0.021, 0.025, 12).rotateX(Math.PI / 2).translate(0, 0, 0.0125),   // sticks out along +z
    tap: (() => { const a = new THREE.CylinderGeometry(0.014, 0.016, 0.26, 8).translate(0, 0.13, 0); const b = new THREE.TorusGeometry(0.09, 0.012, 6, 10, Math.PI).rotateY(Math.PI / 2).translate(0, 0.26, 0.09); return merge([a, b]); })(),
    pan: new THREE.CylinderGeometry(0.13, 0.11, 0.09, 14).translate(0, 0.045, 0),
    pot: new THREE.CylinderGeometry(0.15, 0.15, 0.2, 14).translate(0, 0.1, 0),
    bowl: new THREE.SphereGeometry(0.1, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(1, 0.6, 1).translate(0, 0.06, 0),
    bottle: merge([new THREE.CylinderGeometry(0.035, 0.035, 0.2, 8).translate(0, 0.1, 0), new THREE.CylinderGeometry(0.012, 0.03, 0.08, 8).translate(0, 0.24, 0)]),
    can: new THREE.CylinderGeometry(0.035, 0.035, 0.12, 10).translate(0, 0.06, 0),
    board: new THREE.BoxGeometry(0.4, 0.02, 0.28).translate(0, 0.01, 0),
    kettle: merge([new THREE.CylinderGeometry(0.07, 0.09, 0.18, 12).translate(0, 0.09, 0), new THREE.TorusGeometry(0.06, 0.012, 6, 10, Math.PI).translate(0, 0.2, 0), new THREE.CylinderGeometry(0.01, 0.018, 0.1, 6).rotateZ(-0.9).translate(0.1, 0.11, 0)]),
    sphere: new THREE.SphereGeometry(1, 10, 8),
  };
  // ---- placing atlas pieces ----
  // a box whose faces each show an atlas cell (faces: { pz, nz, px, nx, top, bot, side, all }); local +z = front
  D.abox = (A, faces, x, y0, z, hx, y1, hz, yaw = 0, shadow = true) => K.xadd(boxGeo(A, faces, geoCache), A.mat, K.mat4(x, y0, z, yaw, hx * 2, y1 - y0, hz * 2), shadow);
  // a flat panel facing local +z, centred at (x, yc, z)
  D.face = (A, cell, x, yc, z, yaw, w, h, shadow = false) => K.xadd(planeGeo(A, cell, geoCache), A.mat, K.mat4(x, yc, z, yaw, w, h, 1), shadow);
  // a flat panel lying on a top surface at height y (its "up" in the texture points along local −z: the back)
  D.top = (A, cell, x, y, z, yaw, w, d) => K.xadd(planeGeo(A, cell, geoCache), A.mat, K.mat4(x, y, z, yaw, w, d, 1, -Math.PI / 2, 0), false);
  // chrome bits
  D.bar = (x, y, z, yaw, len, vertical = false, r = 0.011) => K.xadd(vertical ? GG.cylY : GG.cylX, M.chrome, vertical ? K.mat4(x, y - len / 2, z, yaw, r, len, r) : K.mat4(x, y, z, yaw, len, r, r), false);
  D.knobs = (P, yaw, lz, y, xs, mat = M.black) => { for (const lx of xs) { const [kx, kz] = P(lx, lz); K.inst(GG.knob, mat, K.mat4(kx, y, kz, yaw), false); } };
  D.tap = (x, y, z, yaw) => K.inst(GG.tap, M.chrome, K.mat4(x, y, z, yaw), false);

  // ================================================================ composite props
  // Every builder: (x, z) = the centre of the footprint on the floor (y0 = floor height), yaw = the way the FRONT
  // faces (local +z). Builders draw only; pass solid: true (default) to also add the collision box.
  const blk = (o, x, z, hx, hz, yaw, y1, y0, surf = 'metal') => (o.solid === false ? null : K.solid(x, z, hx, hz, yaw, y1, surf, y0, o.vault ? { vault: true } : {}));

  // a run of base units along local x, with a worktop, a plinth, a tiled splashback and (optionally) wall units.
  // units: [{ k: 'cab2'|'drawers3'|'cabWood2'|'oven'|'cooker'|'dishwasher'|'steelDoor'|'sink'|'hob'|'gap', w }]
  // o: { y0, d (depth, 0.62), h (0.9), top: 'dzGranite'|'dzLaminate'|'dzSteel'|'dzButcher'|..., splash: 'dzTileW'|null,
  //      splashH (0.55), wall: true (wall cupboards over the run), wallCell: 'cab2', props: true, solid: true }
  D.kitchenRun = (x, z, yaw, units, o = {}) => {
    const y0 = o.y0 || 0, d = o.d || 0.62, H = o.h || 0.9, P = frame(x, z, yaw), W = units.reduce((s, u) => s + u.w, 0);
    const topM = o.top || 'dzLaminate', side = o.side || (o.steel ? 'steel' : 'white');
    let lx = -W / 2;
    for (const u of units) {
      const cx = lx + u.w / 2; lx += u.w;
      if (u.k === 'gap') continue;
      const [ux, uz] = P(cx, 0);
      const front = u.k === 'sink' ? (o.steel ? 'steelDoor' : (o.cab || 'cab2')) : u.k === 'hob' ? (o.steel ? 'oven' : 'cooker') : u.k === 'cab' ? (o.cab || 'cab2') : u.k;
      D.abox(D.A, { pz: front, side, top: side, bot: 'steel', nz: side }, ux, y0 + 0.1, uz, u.w / 2 - 0.003, y0 + H - 0.04, d / 2 - 0.02, yaw);
      // the plinth (toe kick), recessed
      { const [px, pz] = P(cx, -0.04); K.box(px, y0, pz, u.w / 2, y0 + 0.1, d / 2 - 0.06, yaw, 'dzPlinth'); }
      if (u.k === 'sink') {
        const [sx, sz] = P(cx, 0.02); D.top(D.A, 'sink', sx, y0 + H + 0.002, sz, yaw, Math.min(u.w - 0.08, 0.9), d - 0.16);
        const [tx, tz] = P(cx - Math.min(u.w - 0.08, 0.9) * 0.22, -d / 2 + 0.07); D.tap(tx, y0 + H, tz, yaw);
      }
      if (u.k === 'hob') { const [hx, hz] = P(cx, 0.02); D.top(D.A, 'hob', hx, y0 + H + 0.003, hz, yaw, Math.min(u.w - 0.06, 0.62), d - 0.12);
        if (o.props !== false) { const [px, pz] = P(cx - 0.14, 0.12); K.inst(GG.pot, M.chrome, K.mat4(px, y0 + H + 0.01, pz, 0, 0.9, 0.9, 0.9)); const [qx, qz] = P(cx + 0.15, -0.1); K.inst(GG.pan, M.darkMetal || M.black, K.mat4(qx, y0 + H + 0.01, qz)); K.xadd(GG.cylX, M.black, K.mat4(...[P(cx + 0.36, -0.1)].flatMap(([a, b]) => [a, y0 + H + 0.05, b]), yaw, 0.22, 0.012, 0.012), false); } }
    }
    // the worktop (a hair proud of the cabinets), with a front lip
    { const [cx, cz] = P(0, 0.015); K.box(cx, y0 + H - 0.04, cz, W / 2 + 0.01, y0 + H, d / 2 + 0.02, yaw, f => f === 'bot' ? 'dzPlinth' : topM); }
    if (o.splash !== null) { const sh = o.splashH ?? 0.55, [bx, bz] = P(0, -d / 2 + 0.006); K.box(bx, y0 + H, bz, W / 2, y0 + H + sh, 0.008, yaw, o.splash || 'dzTileW'); }
    if (o.wall) {   // wall cupboards: 0.35 deep, 0.7 tall, 0.55 above the worktop (skipping over the hob: a hood there)
      let wx = -W / 2;
      for (const u of units) {
        const cx = wx + u.w / 2; wx += u.w;
        const [ux, uz] = P(cx, -d / 2 + 0.18);
        if (u.k === 'hob') { D.abox(D.A, { pz: o.steel ? 'hood' : 'steel', side: 'steel', bot: 'steel' }, ux, y0 + H + 0.75, uz, u.w / 2, y0 + H + 1.0, 0.25, yaw); continue; }
        if (u.k === 'gap') continue;
        D.abox(D.A, { pz: o.wallCell || o.cab || 'cab2', side, bot: side }, ux, y0 + H + 0.62, uz, u.w / 2 - 0.004, y0 + H + 1.32, 0.17, yaw);
      }
    }
    // things on the worktop
    if (o.props !== false) {
      const R = rng(Math.round(x * 13 + z * 7)); let px = -W / 2 + 0.25;
      for (const u of units) {
        const cx = px + u.w / 2 - 0.25; px += u.w;
        if (u.k === 'sink' || u.k === 'hob' || u.k === 'gap') continue;
        const k = R();
        const [ax, az] = P(cx + (R() - 0.5) * u.w * 0.4, -0.05 + (R() - 0.5) * 0.1);
        if (k < 0.3) K.inst(GG.kettle, o.steel ? M.chrome : (M.redPaint || M.chrome), K.mat4(ax, y0 + H, az, R() * 6), false);
        else if (k < 0.55) { K.inst(GG.board, M.dzButcher, K.mat4(ax, y0 + H, az, yaw + (R() - 0.5) * 0.4), false); }
        else if (k < 0.75) { K.inst(GG.bowl, M.porcelain || M.white, K.mat4(ax, y0 + H, az, 0), false); }
        else for (let i = 0; i < 3; i++) { const [bx, bz] = P(cx - 0.12 + i * 0.1, -d / 2 + 0.12); K.inst(GG.bottle, [M.greenPaint, M.redPaint, M.yellowPaint, M.chrome][(i + (k * 10 | 0)) % 4] || M.chrome, K.mat4(bx, y0 + H, bz, 0), false); }
      }
    }
    return blk(o, ...P(0, 0), W / 2, d / 2, yaw, y0 + H, y0);
  };
  // a fridge-freezer (style: 'fridge' stainless | 'fridgeOld' white), w × h, 0.7 deep
  D.fridge = (x, z, yaw, o = {}) => {
    const w = o.w || 0.8, h = o.h || 1.85, d = o.d || 0.7, y0 = o.y0 || 0, cell = o.cell || 'fridge', side = cell === 'fridge' ? 'steel' : 'white';
    D.abox(D.A, { pz: cell, side, top: side, bot: 'steel' }, x, y0 + 0.02, z, w / 2, y0 + h, d / 2, yaw);
    const P = frame(x, z, yaw);
    for (const lx of [-w / 2 + 0.1, w / 2 - 0.1]) for (const lz of [-d / 2 + 0.08, d / 2 - 0.08]) { const [fx, fz] = P(lx, lz); K.box(fx, y0, fz, 0.03, y0 + 0.02, 0.03, yaw, 'dzPlinth'); }
    // the real handles stand off the door
    const [hx, hz] = P(cell === 'fridgeOld' ? w * 0.3 : -w * 0.4, d / 2 + 0.03);
    D.bar(hx, y0 + h * 0.62, hz, yaw, h * (cell === 'fridgeOld' ? 0.2 : 0.3), true, 0.012);
    if (cell === 'fridge') D.bar(hx, y0 + h * 0.86, hz, yaw, h * 0.18, true, 0.012);
    return blk(o, x, z, w / 2, d / 2, yaw, y0 + h, y0);
  };
  // a glass-door drinks fridge (lit): w × h, 0.6 deep; logo header
  D.drinksFridge = (x, z, yaw, o = {}) => {
    const w = o.w || 0.7, h = o.h || 1.95, d = o.d || 0.62, y0 = o.y0 || 0;
    D.abox(D.A, { pz: 'drinks', side: o.side || 'white', top: 'white', bot: 'steel' }, x, y0, z, w / 2, y0 + h, d / 2, yaw);
    return blk(o, x, z, w / 2, d / 2, yaw, y0 + h, y0);
  };
  // a freestanding range (front: 'oven' stainless | 'cooker' enamel), hob on top, a backguard with knobs
  D.range = (x, z, yaw, o = {}) => {
    const w = o.w || 0.76, d = o.d || 0.66, h = o.h || 0.92, y0 = o.y0 || 0, front = o.front || 'oven', side = front === 'oven' ? 'steel' : 'white', P = frame(x, z, yaw);
    D.abox(D.A, { pz: front, side, bot: 'steel', top: 'steel' }, x, y0, z, w / 2, y0 + h, d / 2, yaw);
    const [hx, hz] = P(0, 0.02); D.top(D.A, 'hob', hx, y0 + h + 0.003, hz, yaw, w - 0.06, d - 0.1);
    const [bx, bz] = P(0, -d / 2 + 0.04); D.abox(D.A, { pz: side, side }, bx, y0 + h, bz, w / 2, y0 + h + (o.guard ?? 0.14), 0.04, yaw);
    const [ox, oz] = P(0, d / 2 + 0.03); D.bar(ox, y0 + h * 0.75, oz, yaw, w * 0.78);
    if (o.props !== false) { const [px, pz] = P(-w * 0.22, 0.1); K.inst(GG.pot, M.chrome, K.mat4(px, y0 + h + 0.01, pz, 0, o.big ? 1.6 : 1, o.big ? 1.5 : 1, o.big ? 1.6 : 1)); const [qx, qz] = P(w * 0.22, -0.12); K.inst(GG.pan, M.darkMetal || M.black, K.mat4(qx, y0 + h + 0.01, qz, 0, o.big ? 1.4 : 1, 1, o.big ? 1.4 : 1)); }
    return blk(o, x, z, w / 2, d / 2, yaw, y0 + h + 0.05, y0);
  };
  // a canopy extraction hood over a cooking line (drawn only: it's up out of the way)
  D.hood = (x, y, z, yaw, w, d = 1.0, h = 0.6) => {
    const P = frame(x, z, yaw), n = Math.max(1, Math.round(w / 1.6)), sw = w / n;   // one designed panel per ~1.6 m (the filters keep their shape)
    for (let i = 0; i < n; i++) { const [hx, hz] = P(-w / 2 + sw * (i + 0.5), 0); D.abox(D.A, { pz: 'hood', side: 'steel', top: 'steel', bot: 'steel' }, hx, y, hz, sw / 2, y + h, d / 2, yaw); }
    const [dx, dz] = P(0, -d * 0.2); K.box(dx, y + h, dz, Math.min(0.4, w / 4), y + h + 1.2, 0.25, yaw, 'dzSteel');
  };
  // a stainless prep table: top with an upstand, an undershelf, four legs; things on it
  D.prepTable = (x, z, yaw, o = {}) => {
    const w = o.w || 1.8, d = o.d || 0.75, y0 = o.y0 || 0, P = frame(x, z, yaw), h = 0.9;
    K.box(x, y0 + h - 0.04, z, w / 2, y0 + h, d / 2, yaw, 'dzSteel');
    if (o.upstand !== false) { const [ux, uz] = P(0, -d / 2 + 0.01); K.box(ux, y0 + h, uz, w / 2, y0 + h + 0.1, 0.01, yaw, 'dzSteel'); }
    K.box(x, y0 + 0.18, z, w / 2 - 0.04, y0 + 0.21, d / 2 - 0.04, yaw, 'dzSteel');
    for (const lx of [-w / 2 + 0.04, w / 2 - 0.04]) for (const lz of [-d / 2 + 0.04, d / 2 - 0.04]) { const [px, pz] = P(lx, lz); K.xadd(GG.cylY, M.chrome, K.mat4(px, y0, pz, 0, 0.02, h - 0.04, 0.02)); }
    if (o.props !== false) {
      const R = rng(Math.round(x * 31 + z * 17));
      { const [bx, bz] = P(-w * 0.25, 0.05); K.inst(GG.board, M.dzButcher, K.mat4(bx, y0 + h, bz, yaw + 0.1, 1.4, 1, 1.3), false); }
      { const [bx, bz] = P(w * 0.2, -0.1); K.inst(GG.bowl, M.chrome, K.mat4(bx, y0 + h, bz, 0, 1.5, 1.5, 1.5), false); }
      for (let i = 0; i < 3; i++) { const [bx, bz] = P(-w * 0.25 + (R() - 0.5) * 0.25, 0.05 + (R() - 0.5) * 0.15); K.inst(GG.sphere, [M.redPaint, M.orange, M.greenPaint][i % 3] || M.redPaint, K.mat4(bx, y0 + h + 0.06, bz, 0, 0.04, 0.035, 0.04), false); }
      // stock pots under the table
      for (let i = 0; i < 2; i++) { const [bx, bz] = P(-w / 4 + i * w / 2, 0); K.inst(GG.pot, M.chrome, K.mat4(bx, y0 + 0.21, bz, 0, 1.4, 1.3, 1.4), false); }
    }
    return blk({ vault: true, ...o }, x, z, w / 2, d / 2, yaw, y0 + h, y0);
  };
  // a serving counter with a heated food well (pans), a sneeze guard on posts and a tray slide on the customer side
  D.servery = (x, z, yaw, o = {}) => {
    const w = o.w || 3, d = o.d || 0.75, y0 = o.y0 || 0, h = 0.92, P = frame(x, z, yaw);
    D.abox(D.A, { pz: 'steelDoor', nz: 'steel', side: 'steel', top: 'steel', bot: 'steel' }, x, y0 + 0.08, z, w / 2, y0 + h - 0.04, d / 2, yaw + Math.PI);   // its doors face the kitchen side (local −z)
    { const [px, pz] = P(0, 0); K.box(px, y0, pz, w / 2 - 0.04, y0 + 0.08, d / 2 - 0.06, yaw, 'dzPlinth'); }
    K.box(x, y0 + h - 0.04, z, w / 2 + 0.02, y0 + h, d / 2 + 0.02, yaw, 'dzSteel');
    const nP = Math.max(1, Math.floor((w - 0.2) / 0.75));
    for (let i = 0; i < nP; i++) { const [px, pz] = P(-w / 2 + 0.1 + (i + 0.5) * (w - 0.2) / nP, -0.04); D.top(D.A, 'pans', px, y0 + h + 0.003, pz, yaw, (w - 0.2) / nP - 0.04, d - 0.22); }
    // the sneeze guard: two posts, a sloping glass pane, a top shelf
    const g0 = o.guard !== false;
    if (g0) {
      for (const lx of [-w / 2 + 0.05, w / 2 - 0.05]) { const [px, pz] = P(lx, 0.12); K.xadd(GG.cylY, M.chrome, K.mat4(px, y0 + h, pz, 0, 0.015, 0.48, 0.015)); }
      const [gx, gz] = P(0, 0.16); K.box(gx, y0 + h + 0.3, gz, w / 2 - 0.05, y0 + h + 0.48, 0.006, yaw, M.glass ? 'glass' : 'frosted');
      const [sx, sz] = P(0, 0.05); K.box(sx, y0 + h + 0.47, sz, w / 2 - 0.02, y0 + h + 0.49, 0.14, yaw, 'dzSteel');
    }
    // the tray slide (three chrome rails on brackets)
    if (o.slide !== false) for (const lz of [0.42, 0.52, 0.62]) { const [rx, rz] = P(0, d / 2 + lz - 0.3); K.xadd(GG.cylX, M.chrome, K.mat4(rx, y0 + h - 0.12, rz, yaw, w, 0.012, 0.012), false); }
    return blk(o, x, z, w / 2, d / 2 + (o.slide !== false ? 0.3 : 0), yaw, y0 + h, y0);
  };
  // a stack of compartment trays (instanced boxes, the top one drawn with food)
  D.trays = (x, y, z, yaw, n = 8, food = true) => {
    for (let i = 0; i < n; i++) K.box(x, y + i * 0.022, z, 0.22, y + i * 0.022 + 0.018, 0.16, yaw + (i % 3 - 1) * 0.03, 'dzSteel');
    if (food) D.top(D.A, 'tray', x, y + n * 0.022 + 0.001, z, yaw, 0.42, 0.3);
  };
  // a wall-hung menu / notice / screen board (lit menus glow): w × h centred at height yc
  D.board = (A, cell, x, yc, z, yaw, w, h, frameMat = 'black') => {
    const P = frame(x, z, yaw), [bx, bz] = P(0, 0.015); K.box(bx, yc - h / 2 - 0.03, bz, w / 2 + 0.03, yc + h / 2 + 0.03, 0.015, yaw, frameMat);
    const [fx, fz] = P(0, 0.032); D.face(A, cell, fx, yc, fz, yaw, w, h);
  };
  // lockers: a row of n double-door units (0.6 m each), 1.85 tall, a bench in front optional
  D.lockers = (x, z, yaw, n = 3, o = {}) => {
    const y0 = o.y0 || 0, w = n * 0.6, d = o.d || 0.45, h = o.h || 1.85, P = frame(x, z, yaw);
    for (let i = 0; i < n; i++) { const [ux, uz] = P(-w / 2 + 0.3 + i * 0.6, 0); D.abox(o.A || D.A, { pz: o.cell || 'locker', side: 'steel', top: 'steel' }, ux, y0 + 0.08, uz, 0.299, y0 + h, d / 2, yaw); }
    { const [px, pz] = P(0, -0.02); K.box(px, y0, pz, w / 2, y0 + 0.08, d / 2 - 0.03, yaw, 'dzPlinth'); }
    if (o.bench) { const [bx, bz] = P(0, d / 2 + 0.45); K.box(bx, y0 + 0.42, bz, w / 2 - 0.1, y0 + 0.47, 0.16, yaw, 'dzWoodDark'); for (const lx of [-w / 2 + 0.3, w / 2 - 0.3]) { const [lx2, lz2] = P(lx, d / 2 + 0.45); K.box(lx2, y0, lz2, 0.03, y0 + 0.42, 0.13, yaw, 'darkMetal' in M ? 'darkMetal' : 'dzPlinth'); } if (o.solid !== false) K.solid(bx, bz, w / 2 - 0.1, 0.16, yaw, y0 + 0.47, 'wood', y0, { vault: true }); }
    return blk(o, x, z, w / 2, d / 2, yaw, y0 + h, y0);
  };
  // a glass-fronted medicine cabinet (wall-standing, 0.4 deep)
  D.medCabinet = (x, z, yaw, o = {}) => { const w = o.w || 1.0, h = o.h || 1.9, y0 = o.y0 || 0; D.abox(D.A, { pz: 'medcab', side: 'white', top: 'white' }, x, y0, z, w / 2, y0 + h, (o.d || 0.4) / 2, yaw); return blk(o, x, z, w / 2, (o.d || 0.4) / 2, yaw, y0 + h, y0); };
  D.filing = (x, z, yaw, o = {}) => { const y0 = o.y0 || 0; D.abox(D.A, { pz: 'filing', side: 'steel', top: 'steel' }, x, y0, z, 0.24, y0 + 1.32, 0.33, yaw); return blk(o, x, z, 0.24, 0.33, yaw, y0 + 1.32, y0); };
  D.microwave = (x, y, z, yaw) => D.abox(D.A, { pz: 'microwave', side: 'steel', top: 'steel' }, x, y, z, 0.25, y + 0.3, 0.19, yaw);
  D.coffee = (x, y, z, yaw) => D.abox(D.A, { pz: 'coffee', side: 'steel', top: 'steel' }, x, y, z, 0.3, y + 0.45, 0.25, yaw);
  D.fryer = (x, z, yaw, o = {}) => { const y0 = o.y0 || 0; D.abox(D.A, { pz: 'fryer', side: 'steel', top: 'steel' }, x, y0, z, 0.3, y0 + 0.92, 0.35, yaw); const P = frame(x, z, yaw); for (const lx of [-0.13, 0.13]) { const [bx, bz] = P(lx, 0); K.box(bx, y0 + 0.92, bz, 0.11, y0 + 0.98, 0.16, yaw, 'chainlink' in M ? 'dzSteel' : 'dzSteel'); } return blk(o, x, z, 0.3, 0.35, yaw, y0 + 0.98, y0); };
  return D;
}
function merge(geos) {
  // a tiny non-indexed merge (position/normal/uv) so this module needn't import BufferGeometryUtils
  const parts = geos.map(g => (g.index ? g.toNonIndexed() : g));
  let n = 0; for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2); let o = 0;
  for (const g of parts) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2); o += g.attributes.position.count; }
  const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); m.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return m;
}
