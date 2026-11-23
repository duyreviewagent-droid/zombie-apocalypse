// Zombie_Apocalypse — JUNGLE CAVE: the building kit.
// The jungle's own canvas textures (mossy temple stone, wet cave rock, canvas tents, palm thatch, big tropical
// leaves, fern fronds, palm fronds, hanging vines, falling water) and its own shapes (giant rainforest trees with
// buttress roots and vines, ferns, palms, stalactites, glowing mineral crystals, bats, a river boat).
// Everything is made once and shared: the map instances / merges it through the world kit K (see kit.js).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const lerp = (a, b, t) => a + (b - a) * t;
export function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// smooth value noise (for the terrain and the shapes)
const hh = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
export function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  return lerp(lerp(hh(ix, iz), hh(ix + 1, iz), ux), lerp(hh(ix, iz + 1), hh(ix + 1, iz + 1), ux), uz);
}
export const fbm = (x, z) => vnoise(x, z) * 0.55 + vnoise(x * 2.1 + 7, z * 2.1 - 3) * 0.3 + vnoise(x * 4.3 - 2, z * 4.3 + 9) * 0.15;

// ---------------------------------------------------------------- canvas textures
function canvas(w, h, fn, srgb = true) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; fn(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
const rgba = (c, k = 1, a = 1) => `rgba(${clamp(c[0] * k, 0, 255) | 0},${clamp(c[1] * k, 0, 255) | 0},${clamp(c[2] * k, 0, 255) | 0},${a})`;
function blot(g, w, h, n, col, r0, r1, r) {
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * h, rad = r0 + r() * (r1 - r0), gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr;
    for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) { g.save(); g.translate(ox, oy); g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill(); g.restore(); }
  }
}
// a height canvas → a normal map (sobel), for relief on stone and rock
function normalFrom(src, strength = 2) {
  const w = src.width, h = src.height, d = src.getContext('2d').getImageData(0, 0, w, h).data;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d'), out = g.createImageData(w, h);
  const L = (x, y) => d[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (L(x + 1, y) - L(x - 1, y)) * strength, dy = (L(x, y + 1) - L(x, y - 1)) * strength, n = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
    out.data[i] = (-dx / n * 0.5 + 0.5) * 255; out.data[i + 1] = (dy / n * 0.5 + 0.5) * 255; out.data[i + 2] = (1 / n * 0.5 + 0.5) * 255; out.data[i + 3] = 255;
  }
  g.putImageData(out, 0, 0); const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
// ancient temple stone: big ashlar blocks, chipped corners, dark joints, moss in the joints and on the tops
function stoneTex(seed, moss = 1) {
  const r = rng(seed), W = 512, H = 512;
  const hc = document.createElement('canvas'); hc.width = W; hc.height = H; const hg = hc.getContext('2d');
  hg.fillStyle = '#808080'; hg.fillRect(0, 0, W, H);
  const map = canvas(W, H, (g) => {
    g.fillStyle = '#8a8676'; g.fillRect(0, 0, W, H);
    const rows = 4;
    for (let j = 0; j < rows; j++) {
      const y0 = j * H / rows; let x = -r() * 80;
      while (x < W) {
        const bw = 90 + r() * 110, v = 0.82 + r() * 0.3;
        g.fillStyle = rgba([132, 126, 106], v); g.fillRect(x + 3, y0 + 3, bw - 6, H / rows - 6);
        hg.fillStyle = `rgb(${150 + r() * 40 | 0},0,0)`; hg.fillRect(x + 3, y0 + 3, bw - 6, H / rows - 6);
        for (let k = 0; k < 40; k++) { g.fillStyle = rgba([60, 58, 48], 1, r() * 0.25); g.fillRect(x + r() * bw, y0 + r() * H / rows, 2 + r() * 10, 1 + r() * 3); }
        x += bw;
      }
      g.fillStyle = 'rgba(30,30,24,0.9)'; g.fillRect(0, y0, W, 3);
    }
    blot(g, W, H, 50, 'rgba(40,40,30,0.25)', 10, 50, r);
    blot(g, W, H, Math.round(70 * moss), 'rgba(60,92,34,0.55)', 6, 34, r);
    blot(g, W, H, Math.round(40 * moss), 'rgba(90,120,50,0.45)', 3, 14, r);
    for (let k = 0; k < 3000; k++) { g.fillStyle = r() < 0.5 ? 'rgba(30,28,20,0.18)' : 'rgba(200,196,170,0.12)'; g.fillRect(r() * W, r() * H, 1.5, 1.5); }
    // drip streaks
    for (let k = 0; k < 40; k++) { const x = r() * W, y = r() * H; const gr = g.createLinearGradient(0, y, 0, y + 80); gr.addColorStop(0, 'rgba(30,34,22,0.35)'); gr.addColorStop(1, 'rgba(30,34,22,0)'); g.fillStyle = gr; g.fillRect(x, y, 2 + r() * 5, 80); }
  });
  for (let k = 0; k < 4000; k++) { hg.fillStyle = `rgba(${r() < 0.5 ? 0 : 255},0,0,0.1)`; hg.fillRect(r() * W, r() * H, 2, 2); }
  return { map, normalMap: normalFrom(hc, 3), normalScale: new THREE.Vector2(1.2, 1.2) };
}
// cave rock: dark, wet, layered strata, mineral streaks
function caveRockTex(seed) {
  const r = rng(seed), W = 512, H = 512;
  const hc = document.createElement('canvas'); hc.width = W; hc.height = H; const hg = hc.getContext('2d');
  hg.fillStyle = '#777'; hg.fillRect(0, 0, W, H);
  blot(hg, W, H, 160, 'rgba(255,255,255,0.2)', 8, 50, r); blot(hg, W, H, 160, 'rgba(0,0,0,0.25)', 8, 40, r);
  const map = canvas(W, H, (g) => {
    g.fillStyle = '#4c4840'; g.fillRect(0, 0, W, H);
    blot(g, W, H, 90, 'rgba(90,84,72,0.5)', 20, 80, r); blot(g, W, H, 90, 'rgba(24,22,20,0.5)', 10, 60, r);
    for (let k = 0; k < 24; k++) { const y = r() * H; g.strokeStyle = `rgba(${r() < 0.5 ? '30,28,24' : '120,110,96'},${0.3 + r() * 0.3})`; g.lineWidth = 1 + r() * 4; g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= W; x += 32) g.lineTo(x, y + Math.sin(x * 0.02 + k) * 6 + (r() - 0.5) * 4); g.stroke(); hg.strokeStyle = 'rgba(0,0,0,0.5)'; hg.lineWidth = 2; hg.beginPath(); hg.moveTo(0, y); hg.lineTo(W, y + (r() - 0.5) * 8); hg.stroke(); }
    for (let k = 0; k < 30; k++) { const x = r() * W, y = r() * H; const gr = g.createLinearGradient(0, y, 0, y + 120); gr.addColorStop(0, 'rgba(160,150,120,0.3)'); gr.addColorStop(1, 'rgba(160,150,120,0)'); g.fillStyle = gr; g.fillRect(x, y, 3 + r() * 6, 120); }
    for (let k = 0; k < 5000; k++) { g.fillStyle = r() < 0.5 ? 'rgba(10,10,8,0.25)' : 'rgba(150,140,120,0.15)'; g.fillRect(r() * W, r() * H, 1.5, 1.5); }
  });
  return { map, normalMap: normalFrom(hc, 4), normalScale: new THREE.Vector2(1.5, 1.5) };
}
// tent canvas: woven khaki, stains, seams
function tentTex(col, seed) {
  const r = rng(seed);
  return canvas(256, 256, (g, w, h) => {
    g.fillStyle = rgba(col); g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) { g.fillStyle = rgba(col, 0.92, 0.35); g.fillRect(0, y, w, 1); }
    for (let x = 0; x < w; x += 2) { g.fillStyle = rgba(col, 1.06, 0.2); g.fillRect(x, 0, 1, h); }
    blot(g, w, h, 18, 'rgba(60,50,30,0.25)', 10, 40, r); blot(g, w, h, 8, 'rgba(40,60,30,0.2)', 20, 60, r);
    g.fillStyle = rgba(col, 0.7, 0.8); g.fillRect(0, 126, w, 3); g.fillRect(126, 0, 3, h);
    for (let x = 4; x < w; x += 8) { g.fillStyle = rgba(col, 0.6, 0.6); g.fillRect(x, 127, 3, 1); }
  });
}
// palm thatch: overlapping layers of dry fronds
function thatchTex(seed) {
  const r = rng(seed);
  return canvas(256, 256, (g, w, h) => {
    g.fillStyle = '#6a5634'; g.fillRect(0, 0, w, h);
    for (let row = 0; row < 8; row++) {
      const y0 = row * 32;
      for (let k = 0; k < 260; k++) { const x = r() * w, v = 0.7 + r() * 0.6; g.strokeStyle = rgba([150, 124, 76], v, 0.8); g.lineWidth = 1 + r() * 1.5; g.beginPath(); g.moveTo(x, y0); g.lineTo(x + (r() - 0.5) * 6, y0 + 30 + r() * 8); g.stroke(); }
      const gr = g.createLinearGradient(0, y0, 0, y0 + 34); gr.addColorStop(0, 'rgba(30,22,10,0.5)'); gr.addColorStop(0.25, 'rgba(30,22,10,0)'); g.fillStyle = gr; g.fillRect(0, y0, w, 34);
    }
  });
}
// bamboo / pole wood with nodes
function poleTex(seed) {
  const r = rng(seed);
  return canvas(64, 256, (g, w, h) => {
    g.fillStyle = '#8a7246'; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 40; k++) { g.fillStyle = rgba([120, 96, 56], 0.7 + r() * 0.5, 0.5); g.fillRect(r() * w, 0, 1 + r() * 2, h); }
    for (let y = 20; y < h; y += 60 + r() * 20) { g.fillStyle = 'rgba(50,38,20,0.8)'; g.fillRect(0, y, w, 4); g.fillStyle = 'rgba(200,180,130,0.4)'; g.fillRect(0, y + 4, w, 2); }
  });
}
// rope: twisted fibre
function ropeTex() {
  return canvas(64, 64, (g, w, h) => {
    g.fillStyle = '#9a8458'; g.fillRect(0, 0, w, h);
    for (let k = -64; k < 128; k += 8) { g.strokeStyle = 'rgba(70,56,30,0.7)'; g.lineWidth = 3; g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 40, h); g.stroke(); g.strokeStyle = 'rgba(200,180,130,0.4)'; g.lineWidth = 1; g.beginPath(); g.moveTo(k + 3, 0); g.lineTo(k + 43, h); g.stroke(); }
  });
}
// a big glossy tropical leaf cluster (alpha): banana / philodendron / monstera shapes on transparent
function bigLeafTex(seed) {
  const r = rng(seed);
  return canvas(512, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let k = 0; k < 46; k++) {
      const x = r() * w, y = r() * h, a = r() * 6.28, L = 40 + r() * 70, Wd = L * (0.28 + r() * 0.18), v = 0.6 + r() * 0.6;
      const col = [[46, 92, 30], [60, 110, 36], [34, 74, 26], [80, 124, 44], [96, 132, 50]][Math.floor(r() * 5)];
      g.save(); g.translate(x, y); g.rotate(a);
      const gr = g.createLinearGradient(-Wd, 0, Wd, 0); gr.addColorStop(0, rgba(col, v * 0.7)); gr.addColorStop(0.5, rgba(col, v * 1.15)); gr.addColorStop(1, rgba(col, v * 0.75));
      g.fillStyle = gr; g.beginPath(); g.moveTo(0, -L / 2); g.bezierCurveTo(Wd, -L / 3, Wd, L / 3, 0, L / 2); g.bezierCurveTo(-Wd, L / 3, -Wd, -L / 3, 0, -L / 2); g.fill();
      g.strokeStyle = rgba(col, 1.5, 0.7); g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, -L / 2); g.lineTo(0, L / 2); g.stroke();
      g.strokeStyle = rgba(col, 0.6, 0.5); g.lineWidth = 0.8; for (let t = -0.4; t < 0.45; t += 0.12) { g.beginPath(); g.moveTo(0, t * L); g.lineTo(Wd * 0.8, t * L + L * 0.12); g.moveTo(0, t * L); g.lineTo(-Wd * 0.8, t * L + L * 0.12); g.stroke(); }
      if (r() < 0.3) { g.globalCompositeOperation = 'destination-out'; for (let t = -0.3; t < 0.35; t += 0.15) { g.beginPath(); g.ellipse(Wd * 0.55, t * L, Wd * 0.3, 2, 0.3, 0, 7); g.fill(); } g.globalCompositeOperation = 'source-over'; }
      g.restore();
    }
  });
}
// a fern frond (alpha), drawn along the texture's v axis: stem up the middle, leaflets either side
function frondTex(seed, palm = false) {
  const r = rng(seed);
  return canvas(256, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const cx = w / 2, col = palm ? [70, 96, 40] : [52, 96, 34];
    g.strokeStyle = rgba(col, 0.7); g.lineWidth = palm ? 5 : 3; g.beginPath(); g.moveTo(cx, h); g.lineTo(cx, 4); g.stroke();
    for (let y = h - 10; y > 8; y -= palm ? 7 : 9) {
      const t = 1 - y / h, L = (palm ? 120 : 110) * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.95) * (0.85 + r() * 0.3) + 6, v = 0.75 + r() * 0.5;
      for (const sd of [-1, 1]) {
        g.fillStyle = rgba(col, v); g.beginPath(); g.moveTo(cx, y);
        const ex = cx + sd * L, ey = y - L * (palm ? 0.5 : 0.28);
        g.quadraticCurveTo(cx + sd * L * 0.5, y - (palm ? 2 : 6), ex, ey); g.quadraticCurveTo(cx + sd * L * 0.5, y - (palm ? 8 : 14), cx, y - (palm ? 5 : 8)); g.fill();
      }
    }
  });
}
// hanging vines / lianas curtain (alpha)
function vineTex(seed) {
  const r = rng(seed);
  return canvas(256, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let k = 0; k < 14; k++) {
      let x = r() * w; const len = h * (0.5 + r() * 0.5);
      g.strokeStyle = rgba([60, 74, 36], 0.8 + r() * 0.4); g.lineWidth = 1.5 + r() * 2.5; g.beginPath(); g.moveTo(x, 0);
      for (let y = 0; y < len; y += 16) { x += (r() - 0.5) * 6; g.lineTo(x, y); }
      g.stroke();
      for (let y = 10; y < len; y += 10 + r() * 14) { const lx = x + (r() - 0.5) * 10; g.fillStyle = rgba([58, 104, 36], 0.7 + r() * 0.6); g.beginPath(); g.ellipse(lx, y, 4 + r() * 4, 2 + r() * 2, r() * 3, 0, 7); g.fill(); }
    }
  });
}
// falling water: streaks (scrolled downward in the shader by the map's animation)
function fallTex() {
  const r = rng(77);
  return canvas(256, 512, (g, w, h) => {
    g.fillStyle = 'rgba(190,210,210,0.55)'; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 500; k++) { const x = r() * w, y = r() * h, L = 30 + r() * 140; g.fillStyle = `rgba(255,255,255,${0.15 + r() * 0.5})`; g.fillRect(x, y, 1 + r() * 3, L); if (y + L > h) g.fillRect(x, y - h, 1 + r() * 3, L); }
    for (let k = 0; k < 200; k++) { const x = r() * w, y = r() * h; g.fillStyle = `rgba(60,80,80,${r() * 0.25})`; g.fillRect(x, y, 2 + r() * 4, 20 + r() * 60); }
  });
}
// river water: ripples (scrolled along the flow)
function rippleTex() {
  const r = rng(88);
  return canvas(256, 256, (g, w, h) => {
    g.fillStyle = '#2c4a40'; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 260; k++) { const x = r() * w, y = r() * h; g.strokeStyle = `rgba(${r() < 0.5 ? '160,190,180' : '20,40,34'},${0.1 + r() * 0.25})`; g.lineWidth = 1 + r() * 2; g.beginPath(); g.ellipse(x, y, 6 + r() * 18, 1 + r() * 2, 0, 0, 7); g.stroke(); }
  });
}
// boat hull paint: chipped white over red antifouling, a name board
function hullTex() {
  const r = rng(51);
  return canvas(512, 128, (g, w, h) => {
    g.fillStyle = '#e8e4d8'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#9a2a20'; g.fillRect(0, h * 0.7, w, h * 0.3);
    g.fillStyle = '#1f3c5a'; g.fillRect(0, h * 0.64, w, h * 0.06); g.fillRect(0, 0, w, h * 0.05);
    for (let k = 0; k < 300; k++) { g.fillStyle = `rgba(${r() < 0.5 ? '120,90,60' : '60,50,40'},${r() * 0.35})`; g.fillRect(r() * w, r() * h, 1 + r() * 6, 1 + r() * 3); }
    for (let k = 0; k < 30; k++) { const x = r() * w; const gr = g.createLinearGradient(0, h * 0.05, 0, h * 0.65); gr.addColorStop(0, 'rgba(120,70,30,0.5)'); gr.addColorStop(1, 'rgba(120,70,30,0)'); g.fillStyle = gr; g.fillRect(x, h * 0.05, 2 + r() * 3, h * 0.6); }
  });
}
// labels / signs / papers
export function signTex(lines, bg = '#d8c890', fg = '#222', w = 256, h = 128, font = 'bold 30px Helvetica') {
  return canvas(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    const r = rng(lines.join('').length * 7 + 3); for (let k = 0; k < 400; k++) { g.fillStyle = `rgba(80,60,30,${r() * 0.15})`; g.fillRect(r() * w, r() * h, 2 + r() * 8, 1 + r() * 2); }
    g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    lines.forEach((l, i) => g.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * parseInt(font.match(/(\d+)px/)[1]) * 1.15));
  });
}

// ---------------------------------------------------------------- shapes
const keep = g => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g; };
export const merge = gs => mergeGeometries(gs.map(keep));
const V = (x, y, z) => new THREE.Vector3(x, y, z);
// a tube along a curve of points, radius tapering r0 → r1; uv wraps once round, v in metres / vScale
function taperTube(pts, r0, r1, radial = 8, vScale = 2) {
  const curve = new THREE.CatmullRomCurve3(pts), seg = Math.max(4, pts.length * 4);
  const g = new THREE.TubeGeometry(curve, seg, 1, radial, false), p = g.attributes.position, uv = g.attributes.uv;
  const frames = curve.computeFrenetFrames(seg, false), L = curve.getLength();
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, c = curve.getPointAt(t), rr = lerp(r0, r1, t);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j; const v = V(p.getX(k), p.getY(k), p.getZ(k)).sub(c).multiplyScalar(rr).add(c);
      p.setXYZ(k, v.x, v.y, v.z); uv.setXY(k, j / radial, t * L / vScale);
    }
  }
  g.computeVertexNormals(); return g;
}
// a crossed / arched card of foliage: a strip bent along its length (for fronds, leaves, vines)
function arcCard(len, wid, droop, segs = 6) {
  const g = new THREE.PlaneGeometry(wid, len, 1, segs).translate(0, len / 2, 0), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i), t = y / len; p.setZ(i, -droop * t * t * len); p.setY(i, y * (1 - droop * 0.35 * t)); p.setX(i, p.getX(i) * (0.4 + Math.sin(Math.min(1, t * 1.1) * Math.PI) * 0.8)); }
  g.computeVertexNormals(); return g;
}
// a giant rainforest tree (kapok / fig): tall straight trunk, plank buttress roots, a few big limbs, a broad
// layered crown of leaf clumps and vines hanging from the limbs. Returns { bark, leaf, vine, h, r }
function giantTree(seed, H) {
  const r = rng(seed), bark = [], leaf = [], vine = [], fins = [];
  const lean = V((r() - 0.5) * 0.8, 0, (r() - 0.5) * 0.8);
  const top = V(lean.x, H * 0.78, lean.z);
  bark.push(taperTube([V(0, -0.3, 0), V(lean.x * 0.2, H * 0.25, lean.z * 0.2), V(lean.x * 0.6, H * 0.55, lean.z * 0.6), top], 0.95, 0.45, 12, 3));
  // buttress roots: thin tall fins flaring out from the trunk
  const nB = 5 + Math.floor(r() * 3);
  for (let i = 0; i < nB; i++) {
    const a = i / nB * Math.PI * 2 + r() * 0.5, L = 2.2 + r() * 1.8, hgt = 2.4 + r() * 2.2;
    const sh = new THREE.Shape(); sh.moveTo(0, -0.3); sh.lineTo(L, -0.3); sh.quadraticCurveTo(L * 0.35, 0.15, 0.5, hgt); sh.lineTo(0, hgt); sh.closePath();
    const fin = new THREE.ExtrudeGeometry(sh, { depth: 0.22 + r() * 0.1, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 1, curveSegments: 6 });
    fin.translate(0.3, 0, -0.13); fin.rotateY(a);
    const uv = fin.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) / 3, uv.getY(k) / 3);
    bark.push(fin); fins.push({ a, L, hgt });
  }
  // limbs and crown
  const nL = 4 + Math.floor(r() * 3);
  for (let i = 0; i < nL; i++) {
    const a = i / nL * Math.PI * 2 + r(), y0 = H * (0.62 + r() * 0.15), L = H * (0.22 + r() * 0.12);
    const base = V(lean.x * 0.8, y0, lean.z * 0.8), mid = base.clone().add(V(Math.cos(a) * L * 0.5, L * 0.35, Math.sin(a) * L * 0.5)), end = base.clone().add(V(Math.cos(a) * L, L * 0.45, Math.sin(a) * L));
    bark.push(taperTube([base, mid, end], 0.38, 0.1, 7, 3));
    for (let k = 0; k < 3; k++) {
      const c = end.clone().lerp(mid, k * 0.4).add(V((r() - 0.5) * 2, 0.6 + r() * 1.2, (r() - 0.5) * 2)), s = 2.6 + r() * 1.8;
      const cl = new THREE.IcosahedronGeometry(1, 2), p = cl.attributes.position;
      for (let q = 0; q < p.count; q++) { const x = p.getX(q), y = p.getY(q), z = p.getZ(q), n = 1 + 0.25 * Math.sin(x * 5.1 + y * 3.3 + k) * Math.cos(z * 4.7 - x * 2.1); p.setXYZ(q, x * s * n, y * s * 0.55 * n, z * s * n); }
      cl.translate(c.x, c.y, c.z); leaf.push(cl);
    }
    // vines hanging from the limb
    for (let k = 0; k < 2; k++) {
      const at = base.clone().lerp(end, 0.4 + r() * 0.55), len = Math.min(at.y - 0.6, 6 + r() * 9);
      const vc = new THREE.PlaneGeometry(1.4, len).translate(0, -len / 2, 0); vc.rotateY(r() * 3); vc.translate(at.x, at.y, at.z);
      const uv = vc.attributes.uv; for (let q = 0; q < uv.count; q++) uv.setXY(q, uv.getX(q), uv.getY(q) * len / 9);
      vine.push(vc);
    }
  }
  // a top clump over the trunk
  { const cl = new THREE.IcosahedronGeometry(1, 2), s = 4; cl.scale(s, s * 0.5, s); cl.translate(top.x, top.y + 2, top.z); leaf.push(cl); }
  // lianas wound up the trunk
  const lp = []; for (let k = 0; k <= 14; k++) { const t = k / 14, a = t * 9 + seed; lp.push(V(Math.cos(a) * (0.95 - t * 0.45) + lean.x * t, t * H * 0.7, Math.sin(a) * (0.95 - t * 0.45) + lean.z * t)); }
  bark.push(taperTube(lp, 0.08, 0.05, 5, 1));
  return { bark: merge(bark), leaf: merge(leaf), vine: vine.length ? merge(vine) : null, h: H, r: 1.15, fins };
}
// a coconut palm: a curved ringed trunk and a crown of drooping fronds
function palmTree(seed) {
  const r = rng(seed), H = 8 + r() * 5, bend = V((r() - 0.5) * 3, 0, (r() - 0.5) * 3);
  const pts = []; for (let k = 0; k <= 5; k++) { const t = k / 5; pts.push(V(bend.x * t * t, t * H, bend.z * t * t)); }
  const trunk = taperTube(pts, 0.24, 0.16, 8, 0.6);
  const top = pts[5], fr = [];
  for (let i = 0; i < 11; i++) {
    const a = i / 11 * Math.PI * 2 + r() * 0.3, L = 3.4 + r() * 1.2, c = arcCard(L, 1.3, 0.55 + r() * 0.3, 7);
    c.rotateX(-Math.PI / 2 + 0.5 + r() * 0.3); c.rotateY(a); c.translate(top.x, top.y, top.z); fr.push(c);
  }
  const nuts = []; for (let i = 0; i < 4; i++) { const s = new THREE.SphereGeometry(0.13, 8, 6); s.translate(top.x + Math.cos(i * 1.6) * 0.25, top.y - 0.25, top.z + Math.sin(i * 1.6) * 0.25); nuts.push(s); }
  return { trunk: merge([trunk, ...nuts]), fronds: merge(fr), top };
}
// a fern / understory plant: fronds arching out from the middle
function fern(seed, n = 9, L = 1.3) {
  const r = rng(seed), out = [];
  for (let i = 0; i < n; i++) { const c = arcCard(L * (0.7 + r() * 0.5), 0.55, 0.6 + r() * 0.4, 5); c.rotateX(-0.35 - r() * 0.5); c.rotateY(i / n * Math.PI * 2 + r() * 0.4); out.push(c); }
  return merge(out);
}
// a broad-leaf understory plant (elephant ear / banana sucker): a few big leaves on stalks
function bigLeafPlant(seed) {
  const r = rng(seed), out = [];
  for (let i = 0; i < 6; i++) { const c = arcCard(1.6 + r() * 0.8, 0.9, 0.5, 5); c.rotateX(-0.25 - r() * 0.5); c.rotateY(i / 6 * Math.PI * 2 + r()); c.translate(0, 0.2, 0); out.push(c); }
  return merge(out);
}
// a stalactite (hangs down from y 0) / stalagmite: a lumpy tapering cone
function dripstone(seed, up = false) {
  const r = rng(seed), g = new THREE.ConeGeometry(0.5, 1, 9, 5, false), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i), k = 1 + 0.15 * Math.sin(y * 9 + i) + (r() - 0.5) * 0.1; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
  g.translate(0, 0.5, 0); if (!up) g.rotateX(Math.PI); g.computeVertexNormals(); return g;
}
// a cluster of mineral crystals (the glowing stuff)
function crystals(seed) {
  const r = rng(seed), out = [];
  for (let i = 0; i < 7; i++) { const L = 0.25 + r() * 0.5, c = new THREE.CylinderGeometry(0, 0.06 + r() * 0.05, L, 6).translate(0, L / 2, 0); c.rotateZ((r() - 0.5) * 1.2); c.rotateY(r() * 6); c.translate((r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3); out.push(c); }
  return merge(out);
}
// a bat: two wings and a body (flapped in the map's animation by scaling)
function batGeo() {
  const b = new THREE.SphereGeometry(0.06, 6, 4).scale(1, 0.8, 1.6), wings = [];
  for (const sd of [-1, 1]) { const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(sd * 0.28, 0.06); s.lineTo(sd * 0.34, -0.02); s.lineTo(sd * 0.22, -0.06); s.lineTo(sd * 0.12, -0.03); s.lineTo(0, -0.08); s.closePath(); wings.push(new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2)); }
  return merge([b, ...wings]);
}
// the boat: a planked river/coastal launch, 11 m: hull, deck, wheelhouse (the map adds the solid boxes)
function boatGeos() {
  const L = 11, Bm = 3.2, Dh = 1.6;
  // hull: a lofted shape from cross sections along x (bow at +x)
  const nx = 16, ny = 8, pos = [], uvs = [], idx = [];
  for (let i = 0; i <= nx; i++) {
    const t = i / nx, x = (t - 0.5) * L, bw = Bm / 2 * Math.pow(Math.sin(Math.min(1, (1 - t) * 1.6 + 0.08) * Math.PI / 2), 0.7) * (t < 0.08 ? 0.85 + t * 2 : 1);
    const keel = -Dh + (t > 0.75 ? (t - 0.75) * 2.4 : 0), sheer = 0.25 + Math.pow(Math.max(0, t - 0.6), 2) * 2;
    for (let j = 0; j <= ny; j++) {
      const s = j / ny * 2 - 1, a = s * Math.PI / 2;
      const y = lerp(keel, sheer, 1 - Math.cos(a)), z = Math.sin(a) * bw;
      pos.push(x, y, z); uvs.push(t, (y + Dh) / (Dh + 0.6));
    }
  }
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) { const a = i * (ny + 1) + j, b = a + ny + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const hull = new THREE.BufferGeometry(); hull.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); hull.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); hull.setIndex(idx); hull.computeVertexNormals();
  // the deck: flat at y 0.2, the hull's outline
  const ds = new THREE.Shape(); for (let i = 0; i <= nx; i++) { const t = i / nx, x = (t - 0.5) * L, bw = Bm / 2 * Math.pow(Math.sin(Math.min(1, (1 - t) * 1.6 + 0.08) * Math.PI / 2), 0.7) * 0.96; i ? ds.lineTo(x, bw) : ds.moveTo(x, bw); } for (let i = nx; i >= 0; i--) { const t = i / nx, x = (t - 0.5) * L, bw = Bm / 2 * Math.pow(Math.sin(Math.min(1, (1 - t) * 1.6 + 0.08) * Math.PI / 2), 0.7) * 0.96; ds.lineTo(x, -bw); }
  const deck = new THREE.ShapeGeometry(ds).rotateX(-Math.PI / 2).translate(0, 0.2, 0);
  { const uv = deck.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) / 1.2, uv.getY(k) / 1.2); }
  const transom = new THREE.BoxGeometry(0.08, 1.55, Bm * 0.82).translate(-L / 2 + 0.04, -0.5, 0);
  const cab = [new THREE.BoxGeometry(3.2, 2.0, 2.3).translate(-1.6, 1.2, 0), new THREE.BoxGeometry(3.6, 0.12, 2.7).translate(-1.6, 2.26, 0)];
  const glass = [new THREE.BoxGeometry(0.04, 0.7, 1.9).translate(0.02, 1.6, 0), new THREE.BoxGeometry(2.4, 0.6, 2.32).translate(-1.7, 1.65, 0)];
  const rail = []; for (const sd of [-1, 1]) rail.push(new THREE.CylinderGeometry(0.03, 0.03, 7.6, 6).rotateZ(Math.PI / 2).translate(0.6, 0.95, sd * 1.42)); for (let x = -3.2; x <= 4.2; x += 1.2) for (const sd of [-1, 1]) rail.push(new THREE.CylinderGeometry(0.025, 0.025, 0.75, 6).translate(x, 0.58, sd * (x > 3 ? 1.1 : 1.42)));
  const mast = [new THREE.CylinderGeometry(0.06, 0.08, 4.2, 8).translate(-1.0, 4.3, 0), new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6).rotateX(Math.PI / 2).translate(-1.0, 5.6, 0)];
  const tyre = []; for (const x of [-3.5, -1.2, 1.2, 3.2]) tyre.push(new THREE.TorusGeometry(0.28, 0.1, 6, 14).translate(x, -0.1, 1.62));
  return { hull: merge([hull, transom]), deck, cab: merge(cab), glass: merge(glass), rail: merge([...rail, ...mast]), tyre: merge(tyre), L, B: Bm };
}
// an A-frame / wall tent's canvas (open front flap), w × d, wall h, ridge hr: local, door faces +z
function tentGeo(w, d, h, hr) {
  const P = [];
  const q = (a, b, c, e) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...e], 3)); const L1 = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), L2 = Math.hypot(e[0] - a[0], e[1] - a[1], e[2] - a[2]); g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, L1 / 2, 0, L1 / 2, L2 / 2, 0, 0, L1 / 2, L2 / 2, 0, L2 / 2], 2)); g.computeVertexNormals(); P.push(g); };
  const x = w / 2, z = d / 2;
  // side walls and roof slopes (both sides), back wall, back gable, front gable top, half-open flaps
  for (const s of [-1, 1]) { q([s * x, 0, -z], [s * x, 0, z], [s * x, h, z], [s * x, h, -z]); q([s * x, h, -z], [s * x, h, z], [0, hr, z], [0, hr, -z]); }
  q([-x, 0, -z], [x, 0, -z], [x, h, -z], [-x, h, -z]);
  { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([-x, h, -z, x, h, -z, 0, hr, -z, -x, h, z, x, h, z, 0, hr, z], 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 0.6, 0, 0, 1, 0, 0.5, 0.6], 2)); g.computeVertexNormals(); P.push(g); }
  for (const s of [-1, 1]) q([s * x, 0, z], [s * x * 0.45, 0, z + 0.25], [s * x * 0.4, h, z + 0.05], [s * x, h, z]);   // the flaps tied back
  const g = merge(P); return g;
}

// ---------------------------------------------------------------- the kit
let KIT = null;
export function jungleKit(K) {
  if (KIT && KIT.K === K) return KIT;
  const std = o => new THREE.MeshStandardMaterial({ roughness: 0.85, ...o });
  const leafy = (map, sway = 0.05, color = 0xffffff) => {
    const m = std({ map, color, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.6 });
    const L = K.MAT.leaves;   // borrow the world's foliage shader (sway in the wind, back-lit glow)
    if (L && L.onBeforeCompile) { m.onBeforeCompile = L.onBeforeCompile; m.userData.pk = (L.userData.pk || 'fol') + 'j' + sway; m.customProgramCacheKey = () => m.userData.pk; m.alphaToCoverage = true; }
    return m;
  };
  const stone = stoneTex(11, 1), stone2 = stoneTex(23, 0.4), cave = caveRockTex(5);
  const M = {
    jStone: std({ ...stone, color: 0xd8d4c4, roughness: 0.95 }),
    jStone2: std({ ...stone2, color: 0xc8c0b0, roughness: 0.95 }),
    jCave: std({ ...cave, color: 0x9a948a, roughness: 0.8, metalness: 0.05 }),
    jCaveWet: std({ ...cave, color: 0x6a6660, roughness: 0.35, metalness: 0.1 }),
    jTent: std({ map: tentTex([150, 138, 100], 3), roughness: 0.95, side: THREE.DoubleSide }),
    jTent2: std({ map: tentTex([96, 108, 70], 5), roughness: 0.95, side: THREE.DoubleSide }),
    jTentBlue: std({ map: tentTex([60, 86, 120], 7), roughness: 0.9, side: THREE.DoubleSide }),
    jThatch: std({ map: thatchTex(9), roughness: 1, side: THREE.DoubleSide }),
    jPole: std({ map: poleTex(13), roughness: 0.8 }),
    jRope: std({ map: ropeTex(), roughness: 1 }),
    jLeaf: leafy(bigLeafTex(17), 0.05),
    jLeaf2: leafy(bigLeafTex(19), 0.05, 0xc8d8a8),
    jFern: leafy(frondTex(21), 0.06),
    jPalm: leafy(frondTex(23, true), 0.07),
    jVine: leafy(vineTex(25), 0.03),
    jBark: std({ ...K.TX.relief(K.TX.barkTexture('oak'), 1.6), color: 0xb4ac98, roughness: 0.95 }),
    jPalmBark: std({ ...K.TX.relief(K.TX.barkTexture('pine'), 1.0), color: 0xa89a80, roughness: 0.95 }),
    jFall: new THREE.MeshStandardMaterial({ map: fallTex(), transparent: true, depthWrite: false, roughness: 0.1, side: THREE.DoubleSide, envMapIntensity: 1.2 }),
    jRiver: new THREE.MeshStandardMaterial({ map: rippleTex(), color: 0x9ab8a8, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.9, envMapIntensity: 1.5 }),
    jSea: new THREE.MeshStandardMaterial({ map: rippleTex(), color: 0x6a9aa8, roughness: 0.05, metalness: 0.25, transparent: true, opacity: 0.92, envMapIntensity: 1.8 }),
    jLake: new THREE.MeshStandardMaterial({ color: 0x050d0c, roughness: 0.04, metalness: 0.2, emissive: 0x0b4a2a, emissiveIntensity: 0.35, envMapIntensity: 0.25, transparent: true, opacity: 0.95 }),
    jCaveFloor: std({ ...K.TX.relief(K.TX.gravelTexture(), 1.2), color: 0x6a6258, roughness: 0.75 }),
    jSand: std({ map: K.TX.sandTexture(), roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    jCrystal: std({ color: 0x66ff88, emissive: 0x33ff66, emissiveIntensity: 2.2, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.85 }),
    jBat: std({ color: 0x1a1612, roughness: 0.9, side: THREE.DoubleSide }),
    jHull: std({ map: hullTex(), roughness: 0.6, side: THREE.DoubleSide }),
    jCanvasGreen: std({ map: tentTex([70, 82, 52], 31), roughness: 1, side: THREE.DoubleSide }),
    jLampOn: std({ color: 0xfff0c8, emissive: 0xffd890, emissiveIntensity: 2.5 }),
    jTarp: std({ map: tentTex([40, 70, 130], 41), roughness: 0.7, side: THREE.DoubleSide }),
    jRuinDark: std({ ...stone, color: 0x888070, roughness: 1 }),
  };
  M.jFall.map.wrapS = M.jFall.map.wrapT = THREE.RepeatWrapping;
  Object.assign(K.MAT, M);
  Object.assign(K.TILE, { jStone: 3.2, jStone2: 3.2, jCave: 4.5, jCaveWet: 7, jCaveFloor: 2.5, jTent: 2, jTent2: 2, jTentBlue: 2, jThatch: 2, jPole: 2, jRope: 0.5, jSand: 6, jRuinDark: 3.2, jCanvasGreen: 2, jTarp: 2 });
  const G = {
    giant: [giantTree(3, 26), giantTree(8, 30), giantTree(14, 22)],
    palm: [palmTree(5), palmTree(9), palmTree(12)],
    fern: [fern(31), fern(37, 7, 1.8)],
    bigLeaf: bigLeafPlant(41),
    stalac: [dripstone(1), dripstone(2)], stalag: dripstone(3, true),
    crystal: crystals(7), bat: batGeo(), boat: boatGeos(),
    tent: tentGeo(3.6, 4.4, 1.5, 2.6), tentBig: tentGeo(5.2, 7.0, 1.8, 3.2),
    leafClump: (() => { const g = new THREE.IcosahedronGeometry(1, 2), p = g.attributes.position; for (let q = 0; q < p.count; q++) { const x = p.getX(q), y = p.getY(q), z = p.getZ(q), n = 1 + 0.22 * Math.sin(x * 5 + y * 3) * Math.cos(z * 4 - x * 2); p.setXYZ(q, x * n, y * n * 0.7, z * n); } g.computeVertexNormals(); return g; })(),
    vineCard: new THREE.PlaneGeometry(1.4, 1).translate(0, -0.5, 0),
    pole: new THREE.CylinderGeometry(0.09, 0.11, 1, 8).translate(0, 0.5, 0),
    plank: new THREE.BoxGeometry(1, 0.05, 0.22),
    rope: new THREE.CylinderGeometry(0.025, 0.025, 1, 5).rotateX(Math.PI / 2),
    drum: new THREE.CylinderGeometry(0.29, 0.29, 0.88, 16).translate(0, 0.44, 0),
    log: new THREE.CylinderGeometry(0.5, 0.5, 1, 12).rotateZ(Math.PI / 2),
    skull: new THREE.SphereGeometry(0.1, 8, 6).scale(1, 0.9, 1.15),
  };
  KIT = { K, M, G, signTex, merge };
  return KIT;
}
