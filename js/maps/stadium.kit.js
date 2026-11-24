// Zombie_Apocalypse — SOCCER STADIUM: shared helpers for js/maps/stadium.js.
// Canvas textures made here (pitch grass with mowing stripes, seats, cladding, LED ad boards with made-up
// sponsors, the goal net, signage, the scoreboard), unit geometries for instanced props, and small
// axis-aligned building helpers on top of the map kit (js/maps/kit.js).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// a deterministic random (so the stadium is the same every run)
export function rng(seed = 1) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

export function canvasTex(w, h, fn, { repeat = true, srgb = true, aniso = 8 } = {}) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  fn(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  return t;
}
const noise = (g, w, h, n, a, r, dark = true) => { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${dark ? '0,0,0' : '255,255,255'},${a * r()})`; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); } };

// the made-up clubs and sponsors (no real brands)
export const HOME = { name: 'HARBOR CITY FC', short: 'HARBOR', col: '#8a1c2a', col2: '#9cc8e8' };
export const AWAY = { name: 'IRONBRIDGE ATHLETIC', short: 'IRONBRIDGE', col: '#f0c020', col2: '#1a1a1a' };
export const SPONSORS = [
  ['HARBOR ALES', '#0e2a4a', '#f0d070'], ['KESTREL MOTORS', '#111111', '#ff4a2a'], ['BRIGHTWAVE MOBILE', '#3a0a5a', '#7ef0ff'],
  ['DOCKSIDE BANK', '#0a3a2a', '#e8e8e8'], ['NOVA SPORTSWEAR', '#f4f4f4', '#d01818'], ['SALT & PEPPER PIES', '#5a2a0a', '#ffe0a0'],
  ['QUAYLINE TRAVEL', '#0a4a8a', '#ffffff'], ['ORCA ENERGY', '#002030', '#30e0a0'],
];

export function textures(seed = 11) {
  const r = rng(seed), T = {};
  // the pitch: two mowing stripes per texture repeat (along u), fine blade noise, a few worn patches
  T.grass = canvasTex(512, 512, (g, w, h) => {
    for (let i = 0; i < 2; i++) { g.fillStyle = i ? '#3f7a2c' : '#4e8c34'; g.fillRect(i * w / 2, 0, w / 2, h); }
    for (let k = 0; k < 26000; k++) { const x = r() * w, y = r() * h, l = 70 + r() * 70; g.fillStyle = `rgba(${l * 0.45 | 0},${l | 0},${l * 0.32 | 0},${0.25 + r() * 0.3})`; g.fillRect(x, y, 1, 2 + r() * 3); }
    noise(g, w, h, 4000, 0.12, r);
  });
  // the run-off round the pitch: darker, shaggier grass
  T.apron = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#3a6428'; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 9000; k++) { const l = 60 + r() * 60; g.fillStyle = `rgba(${l * 0.5 | 0},${l | 0},${l * 0.35 | 0},0.4)`; g.fillRect(r() * w, r() * h, 1, 2 + r() * 3); }
  });
  // stand concrete treads: weathered grey with gum spots and drain stains
  T.tread = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#8c8b86'; g.fillRect(0, 0, w, h); noise(g, w, h, 9000, 0.18, r); noise(g, w, h, 3000, 0.12, r, false);
    for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(40,40,40,${0.2 + r() * 0.3})`; g.beginPath(); g.arc(r() * w, r() * h, 1 + r() * 2, 0, 7); g.fill(); }
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, 0, w, 3);
  });
  // yellow aisle-step nosing
  T.nosing = canvasTex(64, 16, (g, w, h) => { g.fillStyle = '#d8b020'; g.fillRect(0, 0, w, h); noise(g, w, h, 300, 0.3, r); });
  // façade cladding panels: big pale aluminium panels with dark joints
  T.clad = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#b9bec2'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 64) for (let x = 0; x < w; x += 128) { const v = r() * 8 | 0; g.fillStyle = `rgb(${184 + v},${189 + v},${194 + v})`; g.fillRect(x + 2, y + 2, 124, 60); }
    g.fillStyle = '#4a4e52'; for (let y = 0; y < h; y += 64) g.fillRect(0, y, w, 2); for (let x = 0; x < w; x += 128) g.fillRect(x, 0, 2, h);
    noise(g, w, h, 1500, 0.08, r);
    for (let k = 0; k < 4; k++) { const x = r() * w, ww = 3 + r() * 4; const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(60,50,40,0)'); gr.addColorStop(1, 'rgba(60,50,40,0.09)'); g.fillStyle = gr; g.fillRect(x, 0, ww, h); }   // (a few faint weather streaks)
  });
  // club-coloured band round the top of the façade
  T.band = canvasTex(512, 64, (g, w, h) => { g.fillStyle = HOME.col; g.fillRect(0, 0, w, h); g.fillStyle = HOME.col2; g.fillRect(0, 50, w, 8); g.fillStyle = '#ffffff'; g.fillRect(0, 6, w, 3); });
  // painted block walls inside (concourse, corridors)
  T.block = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#d6d2c8'; g.fillRect(0, 0, w, h);
    // real-size blockwork (the map tiles this every 3.2 m: 200 × 400 mm blocks, half-bond), a little tone per block
    for (let y = 0; y < h; y += 16) for (let x = (y / 16) % 2 ? -16 : 0; x < w; x += 32) { const v = (r() - 0.5) * 10 | 0; g.fillStyle = `rgb(${214 + v},${210 + v},${200 + v})`; g.fillRect(x + 1, y + 1, 30, 14); }
    g.fillStyle = '#b4b0a6'; for (let y = 0; y < h; y += 16) { g.fillRect(0, y, w, 1.5); for (let x = (y / 16) % 2 ? 16 : 0; x < w; x += 32) g.fillRect(x, y, 1.5, 16); }
    noise(g, w, h, 2500, 0.06, r);
    g.fillStyle = HOME.col; g.fillRect(0, h - 40, w, 22);   // a claret dado stripe
  });
  // rubber-crumb corridor floor, dressing-room tiles
  T.rubberFloor = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#3a3c40'; g.fillRect(0, 0, w, h); for (let k = 0; k < 12000; k++) { const c = r(); g.fillStyle = c < 0.1 ? 'rgba(160,40,40,0.5)' : c < 0.2 ? 'rgba(120,160,200,0.4)' : 'rgba(0,0,0,0.25)'; g.fillRect(r() * w, r() * h, 1, 1); } });
  T.tile = canvasTex(256, 256, (g, w, h) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const v = 214 + r() * 14 | 0; g.fillStyle = `rgb(${v},${v + 2},${v + 4})`; g.fillRect(x * 32, y * 32, 32, 32); }
    g.fillStyle = '#9aa0a4'; for (let i = 0; i <= 8; i++) { g.fillRect(i * 32 - 1, 0, 2, h); g.fillRect(0, i * 32 - 1, w, 2); }
  });
  // dressing-room lockers: wood slats with brass number plates
  T.locker = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#7a5434'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 8) { g.fillStyle = `rgba(${r() < 0.5 ? '30,20,10' : '200,160,110'},${0.1 + r() * 0.15})`; g.fillRect(x, 0, 4, h); }
    g.fillStyle = '#2a1a10'; for (let x = 0; x < w; x += 64) g.fillRect(x, 0, 3, h);
    g.fillStyle = '#c8a860'; for (let x = 24; x < w; x += 64) g.fillRect(x, 30, 16, 10);
  });
  // ad boards: one sponsor per quarter of the texture (four panels), lit LED look
  T.boards = canvasTex(2048, 128, (g, w, h) => {
    for (let i = 0; i < 8; i++) {
      const [name, bg, fg] = SPONSORS[i]; const x0 = i * 256;
      g.fillStyle = bg; g.fillRect(x0, 0, 256, h);
      g.fillStyle = fg; g.font = 'bold 34px Helvetica, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const words = name.split(' '); if (g.measureText(name).width > 240 && words.length > 1) { g.font = 'bold 28px Helvetica, Arial'; g.fillText(words.slice(0, Math.ceil(words.length / 2)).join(' '), x0 + 128, 44); g.fillText(words.slice(Math.ceil(words.length / 2)).join(' '), x0 + 128, 84); }
      else g.fillText(name, x0 + 128, 64);
    }
    g.fillStyle = 'rgba(0,0,0,0.18)'; for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);   // LED rows
    for (let x = 0; x < w; x += 3) { g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(x, 0, 1, h); }
  }, { repeat: true });
  // goal net: alpha-tested knotted mesh
  T.net = canvasTex(64, 64, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(245,245,245,1)'; g.lineWidth = 2.2; for (let i = 0; i <= 64; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); } });
  // the seat: a moulded plastic tip-up seat's colour with a faint sheen gradient
  T.seat = canvasTex(32, 32, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#c8c8c8'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  // the big screen (match state drawn later by the map's update via T.drawScreen)
  T.screenCanvas = document.createElement('canvas'); T.screenCanvas.width = 1024; T.screenCanvas.height = 384;
  T.screen = new THREE.CanvasTexture(T.screenCanvas); T.screen.colorSpace = THREE.SRGBColorSpace; T.screen.anisotropy = 8;
  T.drawScreen = (home, away, minute, msg = null, broken = 0) => {
    const g = T.screenCanvas.getContext('2d'), w = 1024, h = 384;
    // text that always fits: the font shrinks until the line is no wider than maxW (nothing cut off at the edges)
    const fit = (s, x, y, px, maxW) => { let f = px; g.font = `bold ${f}px Helvetica, Arial`; while (f > 14 && g.measureText(s).width > maxW) { f -= 2; g.font = `bold ${f}px Helvetica, Arial`; } g.fillText(s, x, y); };
    g.fillStyle = '#05070a'; g.fillRect(0, 0, w, h);
    if (broken > 0.5) {   // dead pixels, a stripe of static
      for (let k = 0; k < 900; k++) { const v = Math.random() * 255 | 0; g.fillStyle = `rgba(${v},${v},${v},${Math.random() * 0.5})`; g.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
      g.fillStyle = '#b01010'; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; fit(msg || 'EVACUATE', w / 2, h / 2 + 24, 72, w - 60);
    } else {
      g.fillStyle = HOME.col; g.fillRect(30, 40, 380, 120); g.fillStyle = '#f0c020'; g.fillRect(w - 410, 40, 380, 120);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#ffffff'; fit(HOME.short, 220, 100, 64, 350); g.fillStyle = '#111'; fit(AWAY.short, w - 220, 100, 64, 350);
      g.fillStyle = '#ffffff'; fit(`${home} - ${away}`, w / 2, 110, 120, w - 840);
      g.fillStyle = '#9cc8e8'; fit(String(minute), w / 2, 230, 56, w - 80);
      if (msg) { g.fillStyle = '#ffd040'; fit(msg, w / 2, 320, 50, w - 60); }
    }
    g.fillStyle = 'rgba(0,0,0,0.22)'; for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1);
    T.screen.needsUpdate = true;
  };
  T.drawScreen(0, 0, 'KICK-OFF 19:45', 'WELCOME TO HARBOR CITY STADIUM');
  // club crest on the main stand
  T.crest = canvasTex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.fillStyle = HOME.col; g.beginPath(); g.moveTo(128, 8); g.lineTo(240, 40); g.lineTo(226, 170); g.lineTo(128, 248); g.lineTo(30, 170); g.lineTo(16, 40); g.closePath(); g.fill();
    g.strokeStyle = HOME.col2; g.lineWidth = 10; g.stroke();
    g.fillStyle = '#ffffff'; g.font = 'bold 40px Georgia, serif'; g.textAlign = 'center'; g.fillText('HCFC', 128, 110);
    g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.beginPath(); g.moveTo(70, 160); g.quadraticCurveTo(128, 130, 186, 160); g.stroke();   // an anchor's arm, a wave
    g.beginPath(); g.moveTo(128, 120); g.lineTo(128, 200); g.stroke(); g.beginPath(); g.arc(128, 128, 10, 0, 7); g.stroke();
    g.font = 'bold 20px Georgia, serif'; g.fillText('EST. 1889', 128, 228);
  }, { repeat: false });
  return T;
}

// a sign: one or two lines on a coloured plate (for gates, kiosks, rooms)
export function signTex(lines, bg = '#1a2a4a', fg = '#ffffff', w = 512, h = 128) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    const L = Array.isArray(lines) ? lines : [lines];
    const fs = L.length > 1 ? h * 0.32 : h * 0.5; g.font = `bold ${fs | 0}px Helvetica, Arial`;
    L.forEach((s, i) => { let f = fs; while (g.measureText(s).width > w - 30 && f > 10) { f -= 2; g.font = `bold ${f | 0}px Helvetica, Arial`; } g.fillText(s, w / 2, h / 2 + (i - (L.length - 1) / 2) * fs * 1.1); });
  }, { repeat: false });
}

// all the signs on one canvas (one material, one draw call per chunk): atlas.add(lines, bg, fg, aspect) → uv rect
export function signAtlas(N = 2048) {
  const cv = document.createElement('canvas'); cv.width = cv.height = N; const g = cv.getContext('2d');
  g.fillStyle = '#222'; g.fillRect(0, 0, N, N);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  let x = 0, y = 0, rowH = 0, full = false;
  const seen = new Map();   // (the same sign twice — every TOILETS, both trucks' liveries — shares one slot)
  function add(lines, bg = '#1a2a4a', fg = '#ffffff', aspect = 4) {
    const w = aspect >= 2 ? 512 : 256, h = Math.max(24, Math.min(256, Math.round(w / aspect)));
    const key = [].concat(lines).join('|') + '|' + bg + '|' + fg + '|' + w + 'x' + h;
    if (seen.has(key)) return seen.get(key);
    if (x + w > N) { x = 0; y += rowH + 2; rowH = 0; }
    if (y + h > N) { if (!full) { full = true; console.warn('stadium signs: the atlas is full —', lines); } return null; }
    g.save(); g.translate(x, y);
    g.fillStyle = bg; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = Math.max(2, h * 0.05); g.strokeRect(g.lineWidth, g.lineWidth, w - 2 * g.lineWidth, h - 2 * g.lineWidth);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    const L = Array.isArray(lines) ? lines : [lines], fs = L.length > 1 ? h * 0.34 : h * 0.56;
    L.forEach((s2, i) => { let f = fs; g.font = `bold ${f | 0}px Helvetica, Arial`; while (g.measureText(s2).width > w - 24 && f > 8) { f -= 1; g.font = `bold ${f | 0}px Helvetica, Arial`; } g.fillText(s2, w / 2, h / 2 + (i - (L.length - 1) / 2) * fs * 1.12); });
    g.restore();
    const r = [x / N, 1 - (y + h) / N, (x + w) / N, 1 - y / N];
    x += w + 2; rowH = Math.max(rowH, h);
    tex.needsUpdate = true;
    seen.set(key, r);
    return r;
  }
  // a plane w × h (facing +z) mapped to the rect
  function plane(r, w = 1, h = 1) { const gg = new THREE.PlaneGeometry(w, h), uv = gg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, r[0] + uv.getX(i) * (r[2] - r[0]), r[1] + uv.getY(i) * (r[3] - r[1])); return gg; }
  return { tex, add, plane, canvas: cv };
}
// vertical bars for a steel palisade fence, as an alpha-tested texture (a fence 200 m long is then one quad)
export function barsTexture() {
  return canvasTex(64, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.fillStyle = '#ffffff';
    for (let x = 0; x < w; x += 16) { g.fillRect(x + 4, 6, 7, h - 6); g.beginPath(); g.moveTo(x + 2, 8); g.lineTo(x + 7.5, 0); g.lineTo(x + 13, 8); g.fill(); }
    g.fillRect(0, 30, w, 7); g.fillRect(0, h - 40, w, 7);
  });
}

// unit geometries for instanced props (each made once)
let G = null;
export function geos() {
  if (G) return G;
  const ni = g => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); return g; };
  const merge = (parts) => {
    // a light-weight merge (all parts non-indexed with the same attributes)
    const arr = parts.map(ni), out = new THREE.BufferGeometry();
    for (const k of ['position', 'normal', 'uv']) {
      const n = k === 'uv' ? 2 : 3, total = arr.reduce((s, g) => s + g.attributes[k].count * n, 0), a = new Float32Array(total); let o = 0;
      for (const g of arr) { a.set(g.attributes[k].array, o); o += g.attributes[k].array.length; }
      out.setAttribute(k, new THREE.BufferAttribute(a, n));
    }
    out.computeBoundingSphere(); return out;
  };
  G = { merge, ni };
  // a tip-up stadium seat: seat pan, curved back, two side brackets (origin: floor under the seat's front edge... centred)
  // (plain boxes: twelve thousand of them, so 36 triangles each)
  G.seat = merge([
    new THREE.BoxGeometry(0.44, 0.06, 0.36).translate(0, 0.42, 0.02),
    new THREE.BoxGeometry(0.44, 0.38, 0.05).rotateX(-0.16).translate(0, 0.66, -0.16),
    new THREE.BoxGeometry(0.05, 0.36, 0.05).translate(0, 0.2, -0.1),
  ]);
  G.seatLeg = merge([new THREE.BoxGeometry(0.03, 0.4, 0.3).translate(-0.23, 0.2, -0.02), new THREE.BoxGeometry(0.03, 0.4, 0.3).translate(0.23, 0.2, -0.02)]);
  // a spectator, sitting (cheap: a torso, head, thighs) — instanced in thousands with a per-instance colour
  G.fan = merge([
    new THREE.CapsuleGeometry(0.17, 0.32, 3, 8).translate(0, 0.85, -0.08),
    new THREE.SphereGeometry(0.11, 10, 8).translate(0, 1.25, -0.06),
    new THREE.BoxGeometry(0.34, 0.14, 0.4).translate(0, 0.52, 0.12),
    new THREE.BoxGeometry(0.3, 0.42, 0.12).translate(0, 0.25, 0.3),
  ]);
  // a standing spectator (concourse queues)
  G.fanStand = merge([
    new THREE.CapsuleGeometry(0.18, 0.5, 3, 8).translate(0, 1.2, 0),
    new THREE.SphereGeometry(0.11, 10, 8).translate(0, 1.67, 0),
    new THREE.CapsuleGeometry(0.08, 0.7, 2, 6).translate(-0.09, 0.42, 0),
    new THREE.CapsuleGeometry(0.08, 0.7, 2, 6).translate(0.09, 0.42, 0),
  ]);
  G.box = new THREE.BoxGeometry(1, 1, 1);
  G.cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
  G.cyl6 = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
  G.plane = new THREE.PlaneGeometry(1, 1);
  G.lamp = merge([new THREE.BoxGeometry(0.9, 0.7, 0.35), new THREE.BoxGeometry(0.8, 0.6, 0.02).translate(0, 0, 0.18)]);
  G.lens = new THREE.PlaneGeometry(0.8, 0.6);
  G.goalPost = new THREE.CylinderGeometry(0.06, 0.06, 1, 12);
  G.flag = new THREE.PlaneGeometry(0.45, 0.32).translate(0.225, 0, 0);
  G.ball = new THREE.IcosahedronGeometry(0.11, 2);
  G.turnstile = merge([
    new RoundedBoxGeometry(0.5, 1.0, 0.7, 2, 0.04).translate(0, 0.5, 0),
    new THREE.CylinderGeometry(0.03, 0.03, 0.55, 8).rotateZ(Math.PI / 2).translate(0.5, 0.92, 0),
    new THREE.CylinderGeometry(0.03, 0.03, 0.55, 8).rotateZ(Math.PI / 2).rotateX(2.09).translate(0.5, 0.92, 0),
    new THREE.CylinderGeometry(0.03, 0.03, 0.55, 8).rotateZ(Math.PI / 2).rotateX(-2.09).translate(0.5, 0.92, 0),
  ]);
  G.bus = merge([
    new RoundedBoxGeometry(2.55, 2.9, 12, 3, 0.25).translate(0, 1.85, 0),
  ]);
  G.busWin = new THREE.BoxGeometry(2.6, 1.0, 10.4);
  G.wheel = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 16).rotateZ(Math.PI / 2);
  G.bench = merge([new THREE.BoxGeometry(1, 0.05, 0.4).translate(0, 0.45, 0), new THREE.BoxGeometry(1, 0.45, 0.05).translate(0, 0.22, 0.17)]);
  G.cup = new THREE.CylinderGeometry(0.04, 0.03, 0.12, 10).translate(0, 0.06, 0);
  G.ring = r => new THREE.RingGeometry(r - 0.06, r + 0.06, 96, 1).rotateX(-Math.PI / 2);
  G.arc = (r, a0, a1) => new THREE.RingGeometry(r - 0.06, r + 0.06, 48, 1, a0, a1 - a0).rotateX(-Math.PI / 2);
  G.disc = r => new THREE.CircleGeometry(r, 24).rotateX(-Math.PI / 2);
  G.pole = new THREE.CylinderGeometry(0.08, 0.12, 1, 10).translate(0, 0.5, 0);
  G.toilet = merge([new THREE.CylinderGeometry(0.2, 0.14, 0.4, 14).translate(0, 0.2, 0), new THREE.BoxGeometry(0.42, 0.4, 0.18).translate(0, 0.6, -0.22)]);
  G.urinal = merge([new RoundedBoxGeometry(0.4, 0.6, 0.3, 2, 0.08).translate(0, 0.85, 0)]);
  G.sink = merge([new THREE.BoxGeometry(0.5, 0.14, 0.4).translate(0, 0.82, 0)]);
  G.tap = new THREE.CylinderGeometry(0.015, 0.015, 0.15, 6).translate(0, 0.96, -0.12);
  G.monitor = merge([new THREE.BoxGeometry(0.55, 0.34, 0.04).translate(0, 0.27, 0), new THREE.BoxGeometry(0.06, 0.12, 0.06).translate(0, 0.06, 0.02)]);
  G.chair = merge([new THREE.BoxGeometry(0.44, 0.06, 0.44).translate(0, 0.46, 0), new THREE.BoxGeometry(0.44, 0.48, 0.05).translate(0, 0.72, -0.2), new THREE.CylinderGeometry(0.03, 0.03, 0.44, 6).translate(0, 0.22, 0)]);
  G.barrel = new THREE.CylinderGeometry(0.3, 0.3, 0.9, 16).translate(0, 0.45, 0);
  G.camera = merge([new THREE.BoxGeometry(0.3, 0.32, 0.6).translate(0, 1.55, 0), new THREE.CylinderGeometry(0.08, 0.1, 0.3, 10).rotateX(Math.PI / 2).translate(0, 1.55, 0.42), new THREE.CylinderGeometry(0.03, 0.03, 1.4, 6).translate(0, 0.7, 0)]);
  return G;
}

// ---- axis-aligned building on top of the map kit ----
// box(x0, z0, x1, z1, y0, y1, mat, opts): drawn (merged) and, unless opts.solid === false, solid.
// mat: a material key for every face, or an object { top, side, bot } (missing → none drawn), or a face function.
export function builder(K) {
  const faceFn = (mat) => typeof mat === 'function' ? mat : typeof mat === 'string' ? () => mat : (f) => (f === 'top' ? mat.top : f === 'bot' ? mat.bot : (mat[f] || mat.side)) || null;
  function box(x0, z0, x1, z1, y0, y1, mat, opts = {}) {
    if (x1 < x0) [x0, x1] = [x1, x0]; if (z1 < z0) [z0, z1] = [z1, z0];
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, hx = (x1 - x0) / 2, hz = (z1 - z0) / 2;
    if (mat) K.box(cx, y0, cz, hx, y1, hz, 0, faceFn(mat));
    if (opts.solid === false) return null;
    return K.solid(cx, cz, hx, hz, 0, y1, opts.surf || 'concrete', y0, opts.extra || {});
  }
  // a rect for W.decks / W.ramps / W.navBlocks
  function rect(x0, z0, x1, z1, o = {}) {
    if (x1 < x0) [x0, x1] = [x1, x0]; if (z1 < z0) [z0, z1] = [z1, z0];
    const hx = (x1 - x0) / 2, hz = (z1 - z0) / 2;
    return { x: (x0 + x1) / 2, z: (z0 + z1) / 2, hx, hz, c: 1, s: 0, r2: hx * hx + hz * hz + 0.5, ...o };
  }
  // a wall from (x0, z0) to (x1, z1) (along x or z), thickness t, with openings [{ at (metres from the start), w, h }]
  // returns the wall's boxes; a header is drawn over every opening
  function wall(x0, z0, x1, z1, y0, y1, mat, t = 0.25, openings = [], opts = {}) {
    const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0), L = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
    const sx = Math.sign(x1 - x0) || 1, sz = Math.sign(z1 - z0) || 1;
    const seg = (a, b, ya, yb, solid = true) => {
      if (b - a < 0.01 || yb - ya < 0.01) return;
      if (alongX) box(x0 + sx * a, z0 - t / 2, x0 + sx * b, z0 + t / 2, ya, yb, mat, { ...opts, solid: solid && opts.solid !== false });
      else box(x0 - t / 2, z0 + sz * a, x0 + t / 2, z0 + sz * b, ya, yb, mat, { ...opts, solid: solid && opts.solid !== false });
    };
    const ops = openings.slice().sort((a, b) => a.at - b.at); let p = 0;
    for (const o of ops) { seg(p, o.at, y0, y1); if ((o.h ?? 2.2) + y0 < y1) seg(o.at, o.at + o.w, y0 + (o.h ?? 2.2), y1, true); p = o.at + o.w; }
    seg(p, L, y0, y1);
  }
  return { box, rect, wall };
}

// ---- real people for the crowd: the game's own character models (KINDS), posed once and baked into a static mesh ----
// bakePerson(kind, 'stand' | 'sit') → { geo (position/normal/uv, a group per material), mats: [{ map, color, part, norm }] }
// part: 0 as it is, 1 shirt, 2 trousers, 3 skin, 4 hair/hat, 5 Michelle's one-piece atlas (yellow trousers, black top) — the crowd recolours those per person (by the texture's
// brightness × that person's colour; norm = 1 / the texture's mean brightness where the mesh uses it).
// Standing: one frame of the idle, feet on y = 0, centred. Sitting: the idle's arms, legs bent, hips over a seat pan
// (0.45 m up, a little behind the origin), hands on the thighs. Faces +z like the models.
const partOf = n => /Teeth/i.test(n) ? -1 : /Ch03/i.test(n) ? 5 : /Outfit_Top/i.test(n) ? 1 : /Outfit_Bottom/i.test(n) ? 2 : /Wolf3D_(Skin|Body)/i.test(n) ? 3 : /Hair|Beard|Headwear/i.test(n) ? 4 : 0;
const lumCache = new WeakMap();
function texLum(map, uvs) {   // the mean linear brightness of a texture over the uvs a mesh uses
  const img = map && map.image; if (!img || !img.width) return 1;
  let px = lumCache.get(img);
  if (!px) { try { const S = 64, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, S, S); px = g.getImageData(0, 0, S, S).data; } catch { px = null; } lumCache.set(img, px || []); }
  if (!px || !px.length || !uvs) return 1;
  const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  let sum = 0, n = 0;
  for (let i = 0; i < uvs.count; i += 3) {
    let u = uvs.getX(i) % 1, v = uvs.getY(i) % 1; if (u < 0) u += 1; if (v < 0) v += 1;
    const k = ((Math.min(63, v * 64 | 0)) * 64 + Math.min(63, u * 64 | 0)) * 4;
    sum += 0.2126 * lin(px[k]) + 0.7152 * lin(px[k + 1]) + 0.0722 * lin(px[k + 2]); n++;
  }
  return n ? sum / n : 1;
}
// a body to bake from later, copied now (the player wears KINDS.human's own root once the game starts: its pose,
// its look and what's in its hands are not a fan's)
export const personSource = kind => ({ root: skClone(kind.root), clips: kind.clips });
export function bakePerson(kind, pose = 'stand') {
  const root = skClone(kind.root); root.position.set(0, 0, 0); root.rotation.set(0, 0, 0);
  const B = {}; root.traverse(o => { if (o.isBone) B[o.name.replace(/^mixamorig:?/, '')] = o; });
  const clip = kind.clips && (kind.clips.Idle_A || kind.clips.idle);
  let mixer = null;
  if (clip) { mixer = new THREE.AnimationMixer(root); const a = mixer.clipAction(clip); a.play(); mixer.setTime(Math.min(clip.duration * 0.3, 0.6)); }
  root.updateMatrixWorld(true);
  const va = new THREE.Vector3(), vb = new THREE.Vector3(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion();
  const aim = (bone, child, dir) => {   // swing a bone so the line to its child points along dir (world)
    if (!bone || !child) return; root.updateMatrixWorld(true);
    bone.getWorldPosition(va); child.getWorldPosition(vb); vb.sub(va); if (vb.lengthSq() < 1e-10) return;
    q2.setFromUnitVectors(vb.normalize(), dir.clone().normalize()); bone.getWorldQuaternion(q).premultiply(q2);
    bone.parent.getWorldQuaternion(q2).invert(); bone.quaternion.copy(q2.multiply(q));
  };
  if (pose === 'sit') {
    for (const [s, L] of [[1, 'Left'], [-1, 'Right']]) {
      aim(B[L + 'UpLeg'], B[L + 'Leg'], new THREE.Vector3(s * 0.1, -0.1, 1));
      aim(B[L + 'Leg'], B[L + 'Foot'], new THREE.Vector3(0, -1, 0.15));
      aim(B[L + 'Arm'], B[L + 'ForeArm'], new THREE.Vector3(s * 0.12, -1, 0.3));
      aim(B[L + 'ForeArm'], B[L + 'Hand'], new THREE.Vector3(-s * 0.15, -0.35, 1));
    }
    root.updateMatrixWorld(true);
  }
  // skin every mesh on the CPU in this pose
  const parts = [], mats = [], M = new Float32Array(16), m4 = new THREE.Matrix4();
  root.traverse(o => {
    if (!o.isMesh || !o.visible) return;
    const mat = Array.isArray(o.material) ? o.material[0] : o.material, part = partOf((mat && mat.name) || o.name);
    if (part < 0) return;
    const g = o.geometry, pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv, cnt = pos.count;
    const P = new Float32Array(cnt * 3), N = new Float32Array(cnt * 3), U = new Float32Array(cnt * 2);
    const sk = o.isSkinnedMesh ? o.skeleton : null; if (sk) sk.update();
    const si = g.attributes.skinIndex, sw = g.attributes.skinWeight, bm = sk && sk.boneMatrices;
    // (plain arithmetic, no Matrix4 per vertex: world = pre · Σ w·bone · post · v, normals the same without translation)
    const pre = sk ? m4.multiplyMatrices(o.matrixWorld, o.bindMatrixInverse).elements.slice() : o.matrixWorld.elements.slice(), post = sk ? o.bindMatrix.elements : null;
    const ap = (A, x, y, z, w, out) => { out[0] = A[0] * x + A[4] * y + A[8] * z + A[12] * w; out[1] = A[1] * x + A[5] * y + A[9] * z + A[13] * w; out[2] = A[2] * x + A[6] * y + A[10] * z + A[14] * w; };
    const t1 = [0, 0, 0], t2 = [0, 0, 0], n1 = [0, 0, 0], n2 = [0, 0, 0];
    for (let i = 0; i < cnt; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), nx = nor ? nor.getX(i) : 0, ny = nor ? nor.getY(i) : 1, nz = nor ? nor.getZ(i) : 0;
      if (sk) {
        M.fill(0);
        for (let j = 0; j < 4; j++) { const w = sw.getComponent(i, j); if (!w) continue; const b = si.getComponent(i, j) * 16; for (let k = 0; k < 16; k++) M[k] += w * bm[b + k]; }
        ap(post, x, y, z, 1, t1); ap(M, t1[0], t1[1], t1[2], 1, t2); ap(pre, t2[0], t2[1], t2[2], 1, t1);
        ap(post, nx, ny, nz, 0, n1); ap(M, n1[0], n1[1], n1[2], 0, n2); ap(pre, n2[0], n2[1], n2[2], 0, n1);
      } else { ap(pre, x, y, z, 1, t1); ap(pre, nx, ny, nz, 0, n1); }
      const nl = Math.hypot(n1[0], n1[1], n1[2]) || 1;
      P[i * 3] = t1[0]; P[i * 3 + 1] = t1[1]; P[i * 3 + 2] = t1[2]; N[i * 3] = n1[0] / nl; N[i * 3 + 1] = n1[1] / nl; N[i * 3 + 2] = n1[2] / nl;
      if (uv) { U[i * 2] = uv.getX(i); U[i * 2 + 1] = uv.getY(i); }
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.BufferAttribute(N, 3)); out.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    out.setIndex(g.index ? Array.from(g.index.array) : [...Array(cnt).keys()]);
    parts.push(out);
    const lum = texLum(mat.map, uv) * (mat.color ? 0.2126 * mat.color.r + 0.7152 * mat.color.g + 0.0722 * mat.color.b : 1);
    mats.push({ map: mat.map || null, color: mat.color ? mat.color.clone() : new THREE.Color(1, 1, 1), part, norm: 1 / Math.max(0.03, lum), transparent: !!mat.transparent, alphaTest: mat.alphaTest || 0 });
  });
  // where it stands: feet on the ground and centred over the hips (standing); hips on the seat pan (sitting)
  const hips = B.Hips ? B.Hips.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3();
  if (mixer) { mixer.stopAllAction(); mixer.uncacheRoot(root); }
  const geo = mergeGeometries(parts, true); for (const p of parts) p.dispose();
  geo.computeBoundingBox();
  if (pose === 'sit') geo.translate(-hips.x, 0.5 - hips.y, -0.02 - hips.z);
  else geo.translate(-hips.x, -geo.boundingBox.min.y, -hips.z);
  geo.computeBoundingBox(); geo.computeBoundingSphere();
  return { geo, mats };
}

// ---------------------------------------------------------------- designed fronts (decor.js): the stadium's own cells
// match shirts on pegs, the tactics board, club-shop merchandise, the lounge's back bar, breaker panels, TV screens.
import { decor, P2 as S, XCELLS } from './decor.js';
const shirt = (col, col2, num, name) => (g, w, h, r) => {
  g.fillStyle = '#2a2622'; g.fillRect(0, 0, w, h);
  g.fillStyle = col; g.beginPath(); g.moveTo(w * 0.3, h * 0.05); g.lineTo(w * 0.42, h * 0.1); g.lineTo(w * 0.58, h * 0.1); g.lineTo(w * 0.7, h * 0.05); g.lineTo(w * 0.98, h * 0.22); g.lineTo(w * 0.88, h * 0.38); g.lineTo(w * 0.78, h * 0.32); g.lineTo(w * 0.78, h * 0.97); g.lineTo(w * 0.22, h * 0.97); g.lineTo(w * 0.22, h * 0.32); g.lineTo(w * 0.12, h * 0.38); g.lineTo(w * 0.02, h * 0.22); g.closePath(); g.fill();
  g.fillStyle = col2; g.fillRect(w * 0.22, h * 0.12, w * 0.56, h * 0.04); g.fillRect(w * 0.02, h * 0.2, w * 0.2, h * 0.03); g.fillRect(w * 0.78, h * 0.2, w * 0.2, h * 0.03);
  for (let x = 0; x < w; x += 3) { g.fillStyle = 'rgba(0,0,0,0.05)'; g.fillRect(x, 0, 1, h); }
  S.text(g, name, w / 2, h * 0.3, h * 0.07, col2, 'center', 'bold', undefined, w * 0.5);
  S.text(g, String(num), w / 2, h * 0.58, h * 0.3, col2, 'center', 'bold', 'Impact, Arial Black, sans-serif');
  g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(w * 0.22, h * 0.8, w * 0.56, h * 0.17);
};
const SCELLS = [
  ['shirtH', shirt('#8a1c2a', '#9cc8e8', 9, 'HARBOR'), { rough: 0.9, metal: 0 }],
  ['shirtH2', shirt('#8a1c2a', '#9cc8e8', 4, 'HARBOR'), { rough: 0.9, metal: 0 }],
  ['shirtA', shirt('#d8b020', '#1a1a1a', 10, 'AWAY'), { rough: 0.9, metal: 0 }],
  ['shirtA2', shirt('#d8b020', '#1a1a1a', 7, 'AWAY'), { rough: 0.9, metal: 0 }],
  ['tactics', (g, w, h, r) => {   // a whiteboard with the pitch, the team in a 4-4-2, arrows
    g.fillStyle = '#f4f6f6'; g.fillRect(0, 0, w, h); g.strokeStyle = '#8a9096'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
    g.strokeStyle = '#2a8a3a'; g.lineWidth = 2; g.strokeRect(w * 0.08, h * 0.1, w * 0.84, h * 0.8); g.beginPath(); g.moveTo(w / 2, h * 0.1); g.lineTo(w / 2, h * 0.9); g.stroke(); g.beginPath(); g.arc(w / 2, h / 2, h * 0.12, 0, 7); g.stroke();
    g.strokeRect(w * 0.08, h * 0.3, w * 0.12, h * 0.4); g.strokeRect(w * 0.8, h * 0.3, w * 0.12, h * 0.4);
    const pos = [[0.12, 0.5], [0.25, 0.2], [0.25, 0.4], [0.25, 0.6], [0.25, 0.8], [0.4, 0.2], [0.4, 0.4], [0.4, 0.6], [0.4, 0.8], [0.55, 0.4], [0.55, 0.6]];
    for (const [x, y] of pos) { g.fillStyle = '#c81a1a'; g.beginPath(); g.arc(w * x, h * y, 7, 0, 7); g.fill(); }
    g.strokeStyle = '#1a3ac8'; g.lineWidth = 3; for (const [x, y] of [[0.65, 0.3], [0.65, 0.7], [0.75, 0.5]]) { g.beginPath(); g.moveTo(w * x - 6, h * y - 6); g.lineTo(w * x + 6, h * y + 6); g.moveTo(w * x + 6, h * y - 6); g.lineTo(w * x - 6, h * y + 6); g.stroke(); }
    g.strokeStyle = '#111'; g.lineWidth = 2; g.beginPath(); g.moveTo(w * 0.4, h * 0.4); g.quadraticCurveTo(w * 0.55, h * 0.2, w * 0.68, h * 0.35); g.stroke();
    S.text(g, 'PRESS HIGH · WIN 2ND BALLS', w / 2, h * 0.96, h * 0.05, '#c81a1a', 'center', 'bold', undefined, w * 0.9);
  }, { rough: 0.2, metal: 0 }],
  ['merch', (g, w, h, r) => {   // a club-shop bay: scarves, folded shirts, mugs, caps, balls
    g.fillStyle = '#e8e6e0'; g.fillRect(0, 0, w, h);
    for (let j = 0; j < 4; j++) { const y1 = (j + 1) * h / 4; g.fillStyle = '#a8adb2'; g.fillRect(0, y1 - 5, w, 5);
      for (let i = 0; i < 5; i++) { const x = 4 + i * (w - 8) / 5, bw = (w - 8) / 5 - 6, bh = h / 4 * 0.5, k = (i + j * 2) % 5;
        if (k === 0) { for (let q = 0; q < 3; q++) { g.fillStyle = q % 2 ? '#9cc8e8' : '#8a1c2a'; g.fillRect(x, y1 - 5 - bh + q * bh / 3, bw, bh / 3); } }
        else if (k === 1) { g.fillStyle = '#8a1c2a'; g.fillRect(x, y1 - 5 - bh * 0.6, bw, bh * 0.6); g.fillStyle = '#9cc8e8'; g.fillRect(x, y1 - 5 - bh * 0.6, bw, 3); S.text(g, '9', x + bw / 2, y1 - 5 - bh * 0.3, bh * 0.4, '#9cc8e8'); }
        else if (k === 2) { for (let q = 0; q < 3; q++) { g.fillStyle = '#f4f4f0'; g.fillRect(x + q * bw / 3 + 1, y1 - 5 - bh * 0.55, bw / 3 - 3, bh * 0.55); g.fillStyle = '#8a1c2a'; g.fillRect(x + q * bw / 3 + 2, y1 - 5 - bh * 0.4, bw / 3 - 5, bh * 0.15); } }
        else if (k === 3) { g.fillStyle = '#8a1c2a'; g.beginPath(); g.ellipse(x + bw / 2, y1 - 5 - bh * 0.25, bw / 2, bh * 0.3, 0, Math.PI, 0); g.fill(); g.fillStyle = '#9cc8e8'; g.fillRect(x + bw * 0.3, y1 - 5 - bh * 0.1, bw * 0.7, 4); }
        else { g.fillStyle = '#f4f4f4'; g.beginPath(); g.arc(x + bw / 2, y1 - 5 - bh * 0.45, bh * 0.42, 0, 7); g.fill(); g.fillStyle = '#111'; g.beginPath(); g.arc(x + bw / 2, y1 - 5 - bh * 0.45, bh * 0.14, 0, 7); g.fill(); }
        g.fillStyle = '#fff'; g.fillRect(x + bw * 0.25, y1 - 4, bw * 0.5, 4); } }
  }, { rough: 0.8, metal: 0 }],
  ['barBack', (g, w, h, r) => {   // the back bar: mirrored shelves of bottles, lit from below (glows)
    g.fillStyle = '#2a1e16'; g.fillRect(0, 0, w, h); g.fillStyle = '#5a6a7a'; g.fillRect(w * 0.03, h * 0.05, w * 0.94, h * 0.9);
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, 'rgba(255,255,255,0.2)'); gr.addColorStop(1, 'rgba(0,0,0,0.2)'); g.fillStyle = gr; g.fillRect(w * 0.03, h * 0.05, w * 0.94, h * 0.9);
    for (let j = 0; j < 3; j++) { const y1 = h * (0.35 + j * 0.3); g.fillStyle = '#d8c890'; g.fillRect(w * 0.03, y1, w * 0.94, 5);
      for (let x = w * 0.05; x < w * 0.94; x += 13) { const c = ['#3a6a2a', '#8a4a1a', '#d8c060', '#e8e8e0', '#6a1a1a', '#2a3a6a'][(r() * 6) | 0], bh = h * (0.14 + r() * 0.08); g.fillStyle = c; g.fillRect(x, y1 - bh, 10, bh * 0.75); g.fillRect(x + 3, y1 - bh - 6, 4, bh * 0.3); g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillRect(x + 1, y1 - bh * 0.5, 8, bh * 0.2); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x + 1, y1 - bh * 0.7, 2, bh * 0.6); } }
  }, { rough: 0.2, metal: 0.2, glow: 0.45 }],
  ['breaker', (g, w, h, r) => {   // a grey switchgear door: rows of breakers, warning labels, a meter
    g.fillStyle = '#9aa0a4'; g.fillRect(0, 0, w, h); S.bevel(g, 4, 4, w - 8, h - 8, 3, 0.3);
    g.fillStyle = '#d8b020'; g.fillRect(w * 0.1, h * 0.05, w * 0.8, h * 0.08); S.text(g, '⚡ 415 V  DANGER', w / 2, h * 0.09, h * 0.05, '#111', 'center', 'bold', undefined, w * 0.75);
    g.fillStyle = '#e8e8e4'; g.beginPath(); g.arc(w * 0.3, h * 0.24, w * 0.1, 0, 7); g.fill(); g.strokeStyle = '#111'; g.lineWidth = 2; g.beginPath(); g.moveTo(w * 0.3, h * 0.24); g.lineTo(w * 0.36, h * 0.2); g.stroke();
    for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) { const x = w * (0.1 + i * 0.135), y = h * (0.38 + j * 0.09); g.fillStyle = '#1a1c1e'; g.fillRect(x, y, w * 0.1, h * 0.07); g.fillStyle = (i + j) % 7 ? '#e8e8e4' : '#c82020'; g.fillRect(x + w * 0.035, y + h * 0.01, w * 0.03, h * 0.03); }
    g.fillStyle = '#c81a1a'; g.fillRect(w * 0.82, h * 0.45, w * 0.06, h * 0.12);
  }, { rough: 0.45, metal: 0.4 }],
  ['screen', ...XCELLS.screen],
  ['kitbag', (g, w, h, r) => {   // a kit hamper: wicker, a claret strap, the club badge
    g.fillStyle = '#b8945a'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 8) for (let x = (y / 8) % 2 * 8; x < w; x += 16) { g.fillStyle = 'rgba(80,50,20,0.35)'; g.fillRect(x, y, 8, 8); }
    g.fillStyle = '#8a1c2a'; g.fillRect(0, h * 0.3, w, h * 0.1); g.fillRect(0, h * 0.7, w, h * 0.1); g.fillStyle = '#f4f0e4'; g.beginPath(); g.arc(w / 2, h * 0.55, h * 0.12, 0, 7); g.fill(); S.text(g, 'HCFC', w / 2, h * 0.55, h * 0.07, '#8a1c2a');
  }, { rough: 0.95, metal: 0 }],
];
let SD = null;
export function stadiumDecor(K) { const D = decor(K); if (!SD || SD.D !== D) SD = { D, SA: D.atlas('stadium', SCELLS) }; return SD; }
