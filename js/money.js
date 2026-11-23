// Zombie_Apocalypse — zLux money ("Zombie · Lucky · Utility · Xtreme"): the banknotes and coins, drawn on canvases
// (like tex.js) and put on real little models — a slightly bent bill, a ridged coin, a banded cash stack, a wallet.
// Also where money turns up: how much is in a till, a nightstand, on a body (cashFor), and the 'zlux' item itself.
import * as THREE from 'three';
import { ITEMS } from './loot.js';

// the money is an item in the pack: G.inv.zlux is your balance (saved with the rest of the pack)
ITEMS.zlux = { name: 'zLux cash', icon: '💵', cat: 'cash', w: 0, use: 'Spend / give / drop' };
export const START_CASH = 100;

const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
const tex = (c, srgb = true) => { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.needsUpdate = true; return t; };
const rng = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const TAG = 'ZOMBIE · LUCKY · UTILITY · XTREME';

// ---------------------------------------------------------------- the banknote (1, 5, 10, 20)
const TINT = { 1: ['#cdd6c4', '#b4c2a8', '#2d4a35'], 5: ['#d3d2c8', '#bcbcae', '#3d3a52'], 10: ['#d6d2c0', '#c4bba2', '#5a3d22'], 20: ['#c9d6c6', '#a9bfa6', '#1f4a2e'] };
function guilloche(g, cx, cy, R, r, n, col, lw = 1, a = 0.55) {
  g.save(); g.strokeStyle = col; g.globalAlpha = a; g.lineWidth = lw;
  for (let k = 0; k < 3; k++) {
    g.beginPath();
    for (let i = 0; i <= 720; i++) { const t = i / 720 * Math.PI * 2, rr = R + r * Math.sin(n * t + k * 2.1); const x = cx + Math.cos(t) * rr, y = cy + Math.sin(t) * rr * 0.92; i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
  }
  g.restore();
}
function waveBand(g, x0, y0, x1, y1, col, lines = 5, amp = 5, per = 18, lw = 1) {
  g.save(); g.strokeStyle = col; g.lineWidth = lw; g.globalAlpha = 0.5;
  const horiz = Math.abs(x1 - x0) > Math.abs(y1 - y0), L = horiz ? x1 - x0 : y1 - y0;
  for (let k = 0; k < lines; k++) {
    g.beginPath();
    for (let s = 0; s <= L; s += 2) { const w = Math.sin(s / per * Math.PI * 2 + k * 1.3) * amp; const x = horiz ? x0 + s : x0 + w + k * 2, y = horiz ? y0 + w + k * 2 : y0 + s; s ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
  }
  g.restore();
}
const billCache = {};
export function billTexture(d = 5, back = false) {
  const key = d + (back ? 'b' : 'f'); if (billCache[key]) return billCache[key];
  const W = 1024, H = 436, [c, g] = cv(W, H), [p0, p1, ink] = TINT[d] || TINT[5], R = rng(d * 77 + (back ? 9 : 1));
  // paper: green-grey with a fine fibre noise
  const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, p0); gr.addColorStop(0.5, p1); gr.addColorStop(1, p0); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  const id = g.getImageData(0, 0, W, H), D = id.data; for (let i = 0; i < D.length; i += 4) { const n = (R() - 0.5) * 16; D[i] += n; D[i + 1] += n; D[i + 2] += n; } g.putImageData(id, 0, 0);
  for (let i = 0; i < 70; i++) { g.strokeStyle = R() < 0.5 ? 'rgba(170,40,40,.18)' : 'rgba(40,60,160,.16)'; g.lineWidth = 1; const x = R() * W, y = R() * H; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 18, y + (R() - 0.5) * 10); g.stroke(); }   // the red and blue security fibres
  // the frame: an outer rule, a band of wavy guilloche lines, an inner rule
  g.strokeStyle = ink; g.lineWidth = 6; g.strokeRect(16, 16, W - 32, H - 32);
  waveBand(g, 26, 30, W - 26, 30, ink, 4, 4, 22); waveBand(g, 26, H - 44, W - 26, H - 44, ink, 4, 4, 22);
  waveBand(g, 30, 30, 30, H - 30, ink, 4, 4, 22); waveBand(g, W - 44, 30, W - 44, H - 30, ink, 4, 4, 22);
  g.lineWidth = 2; g.strokeRect(50, 50, W - 100, H - 100);
  // background rosette lattice
  for (let x = 120; x < W; x += 190) for (let y = 120; y < H; y += 200) guilloche(g, x, y, 60, 9, 11, ink, 0.8, 0.18);
  g.textBaseline = 'middle'; g.textAlign = 'center';
  if (!back) {
    // the big Z on the left, in a guilloche medallion
    guilloche(g, 190, H / 2, 112, 14, 16, ink, 1.2, 0.6); guilloche(g, 190, H / 2, 86, 8, 22, ink, 1, 0.45);
    g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.ellipse(190, H / 2, 78, 72, 0, 0, 7); g.fill();
    g.fillStyle = ink; g.font = '900 170px "Bebas Neue", Impact, "Arial Black", sans-serif'; g.fillText('Z', 190, H / 2 + 8);
    // "Lux" on the right, in a second medallion
    guilloche(g, W - 190, H / 2, 112, 14, 16, ink, 1.2, 0.6); guilloche(g, W - 190, H / 2, 86, 8, 22, ink, 1, 0.45);
    g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.ellipse(W - 190, H / 2, 82, 72, 0, 0, 7); g.fill();
    g.fillStyle = ink; g.font = 'italic 900 92px Georgia, "Times New Roman", serif'; g.fillText('Lux', W - 190, H / 2 + 4);
    // centre: the title, the value, the motto
    g.font = 'bold 34px Georgia, serif'; g.fillText('THE zLUX RESERVE NOTE', W / 2, 92);
    guilloche(g, W / 2, H / 2 + 6, 74, 10, 13, ink, 1, 0.5);
    g.font = '900 120px "Bebas Neue", Impact, "Arial Black", sans-serif'; g.fillText(String(d), W / 2, H / 2 + 12);
    g.font = 'bold 26px Georgia, serif'; g.fillText({ 1: 'ONE zLUX BUCK', 5: 'FIVE zLUX BUCKS', 10: 'TEN zLUX BUCKS', 20: 'TWENTY zLUX BUCKS' }[d] || d + ' zLUX BUCKS', W / 2, H - 112);
    g.font = 'bold 21px Helvetica, Arial, sans-serif'; g.fillText(TAG, W / 2, H - 78);
    // serial numbers (one upper left, one lower right) and the corner values
    const ser = 'Z' + String.fromCharCode(65 + Math.floor(R() * 26)) + ' ' + String(Math.floor(R() * 9e7 + 1e7)) + ' L';
    g.font = 'bold 26px "Courier New", monospace'; g.fillStyle = '#7a1f1a'; g.textAlign = 'left'; g.fillText(ser, 330, 132); g.textAlign = 'right'; g.fillText(ser, W - 330, H - 152);
    g.fillStyle = ink; g.font = '900 56px "Bebas Neue", Impact, sans-serif';
    g.textAlign = 'left'; g.fillText(String(d), 66, 88); g.fillText(String(d), 66, H - 82); g.textAlign = 'right'; g.fillText(String(d), W - 66, 88); g.fillText(String(d), W - 66, H - 82);
    // a seal
    g.textAlign = 'center'; g.strokeStyle = '#2a5a3a'; g.lineWidth = 3; g.beginPath(); g.arc(W / 2 + 175, H / 2 + 40, 34, 0, 7); g.stroke(); g.font = 'bold 15px Helvetica'; g.fillStyle = '#2a5a3a'; g.fillText('zLUX', W / 2 + 175, H / 2 + 34); g.fillText('SEAL', W / 2 + 175, H / 2 + 52);
  } else {
    // the back: Z ... Lux again, big; the motto across the middle
    g.fillStyle = ink; g.font = '900 150px "Bebas Neue", Impact, "Arial Black", sans-serif'; g.fillText('Z', 150, H / 2 + 6);
    g.font = 'italic 900 84px Georgia, serif'; g.fillText('Lux', W - 160, H / 2 + 2);
    guilloche(g, W / 2, H / 2, 150, 18, 20, ink, 1.2, 0.5);
    g.font = 'bold 40px Georgia, serif'; g.fillText('IN LUCK WE TRUST', W / 2, H / 2 - 6);
    g.font = 'bold 20px Helvetica, Arial, sans-serif'; g.fillText(TAG, W / 2, H / 2 + 36);
    g.font = '900 64px "Bebas Neue", Impact, sans-serif'; g.fillText(String(d), W / 2, 96); g.fillText(String(d), W / 2, H - 92);
  }
  return (billCache[key] = tex(c));
}

// ---------------------------------------------------------------- the coin (gold 2, silver 1)
const coinCache = {};
export function coinTexture(gold = true) {
  const key = gold ? 'g' : 's'; if (coinCache[key]) return coinCache[key];
  const S = 512, [c, g] = cv(S, S), h = S / 2;
  const [a, b, d, e] = gold ? ['#fff0b0', '#e2b64a', '#9a6a18', '#5a3a08'] : ['#ffffff', '#d4d6da', '#8a8e96', '#4a4e56'];
  const rg = g.createRadialGradient(h * 0.7, h * 0.6, 10, h, h, h); rg.addColorStop(0, a); rg.addColorStop(0.55, b); rg.addColorStop(1, d);
  g.fillStyle = rg; g.fillRect(0, 0, S, S);
  // the raised rim, a ring of beads, the motto round the edge
  g.strokeStyle = e; g.lineWidth = 14; g.beginPath(); g.arc(h, h, h - 14, 0, 7); g.stroke();
  g.strokeStyle = a; g.lineWidth = 4; g.beginPath(); g.arc(h, h, h - 24, 0, 7); g.stroke();
  g.fillStyle = e; for (let i = 0; i < 72; i++) { const t = i / 72 * Math.PI * 2; g.beginPath(); g.arc(h + Math.cos(t) * (h - 36), h + Math.sin(t) * (h - 36), 3, 0, 7); g.fill(); }
  g.font = 'bold 30px Helvetica, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const txt = ' ' + TAG + ' · ', step = (Math.PI * 2) / (txt.length + 2);
  for (let i = 0; i < txt.length; i++) { const t = -Math.PI / 2 - (txt.length / 2) * step + i * step; g.save(); g.translate(h + Math.cos(t) * (h - 66), h + Math.sin(t) * (h - 66)); g.rotate(t + Math.PI / 2); g.fillStyle = e; g.fillText(txt[i], 0, 0); g.restore(); }
  // Z on the left, Lux on the right, the value between (stamped: a light edge above, a dark one below)
  const stamp = (s, x, y, font) => { g.font = font; g.fillStyle = a; g.fillText(s, x - 2, y - 2); g.fillStyle = e; g.fillText(s, x + 2, y + 2); g.fillStyle = d; g.fillText(s, x, y); };
  stamp('Z', h - 112, h + 6, '900 150px "Bebas Neue", Impact, "Arial Black", sans-serif');
  stamp('Lux', h + 92, h + 4, 'italic 900 84px Georgia, serif');
  stamp(gold ? '2' : '1', h - 8, h + 108, '900 62px "Bebas Neue", Impact, sans-serif');
  return (coinCache[key] = tex(c));
}
let edgeTex = null;
function coinEdge() {
  if (edgeTex) return edgeTex;
  const [c, g] = cv(256, 16); g.fillStyle = '#888'; g.fillRect(0, 0, 256, 16);
  for (let x = 0; x < 256; x += 4) { g.fillStyle = '#fff'; g.fillRect(x, 0, 2, 16); g.fillStyle = '#555'; g.fillRect(x + 2, 0, 1, 16); }
  edgeTex = tex(c); edgeTex.wrapS = THREE.RepeatWrapping; edgeTex.repeat.set(6, 1); return edgeTex;
}

// ---------------------------------------------------------------- the models (real sizes: a bill is 15.6 × 6.6 cm)
const BW = 0.156, BH = 0.066;
const matCache = {};
function billMats(d) {
  if (matCache['b' + d]) return matCache['b' + d];
  const back = billTexture(d, true).clone(); back.wrapS = THREE.RepeatWrapping; back.repeat.x = -1; back.offset.x = 1; back.needsUpdate = true;   // seen from behind, not mirrored
  return (matCache['b' + d] = [new THREE.MeshStandardMaterial({ map: billTexture(d), roughness: 0.85, side: THREE.FrontSide }), new THREE.MeshStandardMaterial({ map: back, roughness: 0.85, side: THREE.BackSide })]);
}
function coinMats(gold) {
  if (matCache['c' + gold]) return matCache['c' + gold];
  const col = gold ? 0xe8c060 : 0xd8dadf, face = new THREE.MeshStandardMaterial({ map: coinTexture(gold), metalness: 0.75, roughness: 0.32 });
  return (matCache['c' + gold] = [new THREE.MeshStandardMaterial({ color: col, map: coinEdge(), metalness: 0.8, roughness: 0.35 }), face, face]);
}
// a bill, lying in the XZ plane (face up), gently curled along its length
export function makeBill(d = 5, curl = 1) {
  const geo = new THREE.PlaneGeometry(BW, BH, 14, 3).rotateX(-Math.PI / 2), pa = geo.attributes.position;
  for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), z = pa.getZ(i); pa.setY(i, curl * (0.0045 * Math.pow(x / (BW / 2), 2) + 0.0012 * Math.sin(x * 60 + z * 40))); }
  geo.computeVertexNormals();
  const g = new THREE.Group(), [mf, mb] = billMats(d);
  const f = new THREE.Mesh(geo, mf), b = new THREE.Mesh(geo, mb); f.castShadow = true; g.add(f, b);
  g.userData.zlux = d; return g;
}
const coinGeo = new THREE.CylinderGeometry(0.0125, 0.0125, 0.0022, 32);
export function makeCoin(gold = true) {
  const m = new THREE.Mesh(coinGeo, coinMats(gold)); m.castShadow = true; m.rotation.y = Math.PI / 2; m.userData.zlux = gold ? 2 : 1;
  return m;
}
// a fanned stack of bills with a paper band round it
export function makeStack(n = 8, d = 20) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) { const b = makeBill(d, 0.3); b.position.set((Math.random() - 0.5) * 0.004, i * 0.0011, (Math.random() - 0.5) * 0.003); b.rotation.y = (Math.random() - 0.5) * 0.05; g.add(b); }
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.03, n * 0.0011 + 0.003, BH + 0.002), new THREE.MeshStandardMaterial({ color: 0xc8a878, roughness: 0.9 }));
  band.position.y = n * 0.00055; g.add(band); return g;
}
// a brown leather wallet, folded, a bill's corner sticking out
export function makeWallet() {
  const g = new THREE.Group(), lea = new THREE.MeshStandardMaterial({ color: 0x4a2a16, roughness: 0.6 });
  const w = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.018, 0.09), lea); w.castShadow = true; g.add(w);
  const st = new THREE.Mesh(new THREE.BoxGeometry(0.112, 0.002, 0.004), new THREE.MeshStandardMaterial({ color: 0x8a6a3a })); st.position.set(0, 0.001, 0.043); g.add(st);
  const b = makeBill(10, 0.2); b.position.set(0.03, 0.004, -0.018); b.rotation.y = 0.35; b.scale.setScalar(0.85); g.add(b);
  return g;
}
// money on the floor: a couple of bills and some coins (dropped by the dead, spilled from a pocket)
export function makePile(amount) {
  const g = new THREE.Group(), r = Math.random;
  if (amount >= 15 && r() < 0.5) { const w = makeWallet(); w.position.y = 0.009; w.rotation.y = r() * 6; g.add(w); return g; }
  const ds = [20, 10, 5, 1].filter(d => d <= Math.max(1, amount));
  for (let i = 0; i < Math.min(3, 1 + Math.floor(amount / 6)); i++) { const b = makeBill(ds[Math.floor(r() * ds.length)], 0.6); b.position.set((r() - 0.5) * 0.12, 0.002 + i * 0.002, (r() - 0.5) * 0.1); b.rotation.y = r() * 6; g.add(b); }
  for (let i = 0; i < 2 + Math.floor(r() * 3); i++) { const c = makeCoin(r() < 0.5); c.position.set((r() - 0.5) * 0.2, 0.0012, (r() - 0.5) * 0.18); g.add(c); }
  return g;
}
// what your hand carries to the pack when you pick money up (main.js pickJob asks for this before itemModel)
export function handModel(id) {
  if (id !== 'zlux') return null;
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) { const b = makeBill([20, 10, 5][i], 0.4); b.rotation.set(Math.PI / 2, 0, (i - 1) * 0.25); b.position.set((i - 1) * 0.01, 0, i * 0.0015); g.add(b); }
  const c = makeCoin(true); c.rotation.set(Math.PI / 2, 0, 0); c.position.set(0.02, -0.02, 0.006); g.add(c);
  g.userData.r = 0.01; return g;
}

// ---------------------------------------------------------------- where money turns up
// [chance, min, max] zLux per container kind; registers and tills are where the real money is
const CASH = {
  register: [0.85, 20, 70], nightstand: [0.35, 5, 25], dresser: [0.3, 5, 20], closet: [0.18, 5, 30], kitchen2: [0.2, 2, 10],
  cabinet: [0.12, 2, 8], car: [0.3, 2, 15], truck: [0.2, 2, 12], police: [0.3, 8, 30], corpse: [0.4, 3, 20], attic: [0.15, 5, 25],
  atticBox: [0.12, 3, 15], atticCase: [0.25, 5, 30], store: [0.1, 1, 6], market: [0.18, 2, 10], bench: [0.1, 1, 4], bin: [0.06, 1, 3],
  shelf: [0.08, 1, 5], garage: [0.1, 2, 10], ambulance: [0.1, 2, 10], pantry: [0.05, 1, 4], cooler: [0.05, 1, 3],
};
export function cashFor(c) {
  if (c.cash) return c.cash;                           // a pile on the floor: exactly what's in it
  if (c.zlxBig) return 40 + Math.floor(Math.random() * 61);   // a shop's till, abandoned: 40-100
  const t = CASH[c.kind]; if (!t || Math.random() > t[0]) return 0;
  return t[1] + Math.floor(Math.random() * (t[2] - t[1] + 1));
}
