// Zombie_Apocalypse — BLACKWATER PRISON: the building kit.
// Canvas textures (painted cinder block, weathered perimeter concrete, sealed epoxy floors, diamond-plate steel, the
// sport court, vinyl mattresses, CCTV screens, stencilled signs, the helipad), shared geometry (razor-wire coils,
// cell bars) and the furniture every room is furnished with (bunks, steel toilets, mess tables, hospital beds,
// washers, workbenches, weight benches). Everything goes through the map kit K (merged K.box / K.xadd, instanced
// K.inst) so the whole prison stays a few hundred draw calls.
import * as THREE from 'three';

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
  }, null);
}
// the perimeter wall: big cast panels, tie-holes, rain streaks and rust bleeding from the top
function wallTex() {
  const r = rng(77);
  return cv(512, 512, (g, w, h) => {
    g.fillStyle = '#9a968c'; g.fillRect(0, 0, w, h);
    speck(g, w, h, 16000, ['rgba(70,68,62,0.35)', 'rgba(190,186,176,0.3)', 'rgba(120,116,108,0.4)'], r, 2);
    stains(g, w, h, 40, 'rgba(60,58,50,0.25)', r, 0.7); stains(g, w, h, 10, 'rgba(120,70,30,0.25)', r, 0.4);
    g.fillStyle = 'rgba(50,48,44,0.6)'; g.fillRect(0, 0, 3, h); g.fillRect(w / 2, 0, 2, h);   // panel joints
    for (const x of [64, 192, 320, 448]) for (const y of [96, 256, 416]) { g.fillStyle = 'rgba(40,38,34,0.7)'; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); }
    const gr = g.createLinearGradient(0, h, 0, h * 0.82); gr.addColorStop(0, 'rgba(60,54,40,0.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, h * 0.82, w, h * 0.18);
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
  add('pCinder', std({ map: cinderTex([206, 200, 182], 3), roughness: 0.55 }), 2.4);       // cream (cell blocks)
  add('pCinderG', std({ map: cinderTex([150, 170, 150], 4), roughness: 0.55 }), 2.4);      // institutional green
  add('pCinderB', std({ map: cinderTex([160, 176, 190], 5), roughness: 0.55 }), 2.4);      // pale blue (infirmary)
  add('pCinderOut', std({ map: cinderTex([168, 160, 146], 6), roughness: 0.9 }), 2.4);     // unpainted outside
  add('pWall', std({ map: wallTex(), roughness: 0.95 }), 6);
  add('pFloor', std({ map: epoxyTex([128, 130, 128], 8), roughness: 0.35 }), 4);
  add('pFloorR', std({ map: epoxyTex([132, 70, 58], 9), roughness: 0.4 }), 4);              // red-oxide (cafeteria)
  add('pFloorW', std({ map: epoxyTex([196, 198, 192], 10), roughness: 0.25 }), 4);          // white (infirmary)
  add('pTread', std({ map: treadTex(), roughness: 0.4, metalness: 0.75 }), 1.2);
  add('pCourt', std({ map: courtTex(), roughness: 0.8 }), 4);
  add('pBars', std({ color: 0x5a646c, roughness: 0.45, metalness: 0.7 }), 1);
  add('pSteel', std({ color: 0xc4c8cc, roughness: 0.28, metalness: 0.85 }), 1);
  add('pRail', std({ color: 0xc8a030, roughness: 0.5, metalness: 0.4 }), 1);                // safety-yellow rails
  add('pMat', std({ map: vinylTex([44, 70, 120], 11), roughness: 0.5 }), 1);                // blue vinyl mattress
  add('pWool', std({ map: woolTex([110, 108, 100], 12), roughness: 1 }), 1);                // grey blanket
  add('pOrange', std({ map: woolTex([226, 110, 30], 13), roughness: 0.95 }), 1);            // jumpsuits
  add('pRubber', std({ color: 0x1a1a1c, roughness: 0.85 }), 1);
  add('pIron', std({ color: 0x2a2a2c, roughness: 0.4, metalness: 0.8 }), 1);
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
  add('pRazor', std({ color: 0xb8bcc0, roughness: 0.3, metalness: 0.9 }), 1);
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
    G.coil = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), N, 0.012, 3, false);
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
// the steel toilet-sink combo against a wall (local +z = into the room)
export function toiletSink(K, x, y, z, yaw) {
  const P = frame(x, z, yaw), [ax, az] = P(0, 0.05);
  K.box(ax, y, az, 0.28, y + 0.95, 0.14, yaw, 'pSteel');           // the chase / back unit with the basin on top
  const [bx, bz] = P(0, 0.42); K.box(bx, y, bz, 0.2, y + 0.42, 0.24, yaw, 'pSteel');   // bowl
  const [cx, cz] = P(0, 0.42); K.box(cx, y + 0.42, cz, 0.19, y + 0.44, 0.23, yaw, 'black');
  const [dx, dz] = P(0, 0.22); K.box(dx, y + 0.82, dz, 0.2, y + 0.92, 0.1, yaw, 'pSteel');   // sink lip
  const [ex, ez] = P(0.12, 0.08); K.box(ex, y + 0.95, ez, 0.02, y + 1.02, 0.02, yaw, 'chrome');   // push button tap
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
// a hospital bed: tubular frame, side rails, a white mattress, a pillow, a drip stand
export function hospitalBed(K, x, z, yaw, mess = false) {
  const P = frame(x, z, yaw), g = geos();
  K.box(x, 0.5, z, 1.0, 0.58, 0.45, yaw, 'pSteel');
  K.box(x, 0.58, z, 0.97, 0.72, 0.43, yaw, mess ? 'pWool' : 'white');
  for (const lx of [-1, 1]) for (const lz of [-0.42, 0.42]) { const [px, pz] = P(lx * 0.97, lz); K.box(px, 0, pz, 0.025, 0.5, 0.025, yaw, 'pSteel'); K.xadd(g.ball, K.MAT.rubber, K.mat4(px, 0.05, pz, 0, 0.05, 0.05, 0.05)); }
  const [hx, hz] = P(1.0, 0); K.box(hx, 0.5, hz, 0.03, 1.05, 0.45, yaw, 'pSteel');
  for (const lz of [-0.47, 0.47]) { const [rx, rz] = P(0, lz); K.box(rx, 0.78, rz, 0.55, 0.82, 0.012, yaw, 'chrome'); }
  const [ix, iz] = P(0.8, 0.6); K.xadd(g.pipe, K.MAT.chrome, K.mat4(ix, 0, iz, 0, 0.012, 1.9, 0.012)); K.box(ix, 1.75, iz, 0.06, 1.93, 0.02, yaw, 'frosted');
  const [qx, qz] = P(0.72, 0); K.box(qx, 0.72, qz, 0.2, 0.82, 0.3, yaw, 'white');
  K.solid(x, z, 1.0, 0.47, yaw, 0.82, 'metal', 0, { vault: true });
}
// a front-loading industrial washer (dryers: same box, darker door)
export function washer(K, x, z, yaw, dryer = false) {
  const P = frame(x, z, yaw), g = geos();
  K.box(x, 0, z, 0.55, 1.45, 0.5, yaw, dryer ? 'appliance' : 'pSteel');
  const [dx, dz] = P(0, 0.51); K.xadd(g.disc, K.MAT.black, K.mat4(dx, 0.75, dz, yaw + Math.PI / 2, 0.012, 0.32, 0.32));
  K.xadd(g.disc, dryer ? K.MAT.darkMetal : K.MAT.glass, K.mat4(dx, 0.75, dz + 0, yaw + Math.PI / 2, 0.02, 0.26, 0.26));
  const [px, pz] = P(0, 0.5); K.box(px, 1.25, pz, 0.5, 1.4, 0.02, yaw, 'black');
  K.solid(x, z, 0.55, 0.5, yaw, 1.45, 'metal');
}
// a heavy workbench: steel frame, butcher-block top, a vise, tools on it
export function workbench(K, x, z, yaw) {
  const P = frame(x, z, yaw), g = geos();
  K.box(x, 0.86, z, 1.2, 0.92, 0.4, yaw, 'darkWood');
  for (const lx of [-1.12, 1.12]) for (const lz of [-0.33, 0.33]) { const [px, pz] = P(lx, lz); K.box(px, 0, pz, 0.03, 0.86, 0.03, yaw, 'darkMetal'); }
  K.box(x, 0.18, z, 1.15, 0.21, 0.36, yaw, 'darkMetal');
  const [vx, vz] = P(0.9, 0.25); K.box(vx, 0.92, vz, 0.09, 1.08, 0.1, yaw, 'bluePaint');
  const [tx, tz] = P(-0.4, 0); K.box(tx, 0.92, tz, 0.25, 1.0, 0.12, yaw, 'redPaint');   // a tool box
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
// an office desk with a monitor, keyboard, paper stack and a chair
export function desk(K, x, z, yaw, mat = 'pWoodDesk') {
  const P = frame(x, z, yaw);
  K.box(x, 0.72, z, 0.8, 0.76, 0.4, yaw, mat);
  for (const lx of [-0.75, 0.75]) { const [px, pz] = P(lx, 0); K.box(px, 0, pz, 0.03, 0.72, 0.38, yaw, mat); }
  const [mx, mz] = P(0, -0.22); K.box(mx, 0.76, mz, 0.24, 1.12, 0.03, yaw, 'black'); K.box(mx, 0.8, mz, 0.22, 1.1, 0.032, yaw, 'pScreen');
  const [kx, kz] = P(0, 0.08); K.box(kx, 0.76, kz, 0.22, 0.78, 0.07, yaw, 'black');
  const [ax, az] = P(0.5, 0.05); K.box(ax, 0.76, az, 0.12, 0.8, 0.16, yaw, 'white');
  const [cx, cz] = P(0, 0.75); K.box(cx, 0.42, cz, 0.24, 0.5, 0.24, yaw, 'black'); K.box(cx, 0, cz, 0.03, 0.42, 0.03, yaw, 'chrome');
  const [bx, bz] = P(0, 0.98); K.box(bx, 0.5, bz, 0.22, 1.05, 0.03, yaw, 'black');
  K.solid(x, z, 0.8, 0.4, yaw, 0.76, 'wood', 0, { vault: true });
  { const [sx, sz] = P(0, 0.76); K.solid(sx, sz, 0.25, 0.25, yaw, 1.05, 'wood', 0); }   // the chair (you don't walk through it)
}
// a row of grey steel lockers along local x (n doors)
export function lockers(K, x, z, yaw, n = 6) {
  const P = frame(x, z, yaw), w = n * 0.38;
  K.box(x, 0, z, w / 2, 1.85, 0.25, yaw, f => f === 'pz' ? 'pCopper' : 'darkMetal');
  for (let i = 1; i < n; i++) { const [px, pz] = P(-w / 2 + i * 0.38, 0.252); K.box(px, 0.05, pz, 0.006, 1.8, 0.004, yaw, 'black'); }
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
