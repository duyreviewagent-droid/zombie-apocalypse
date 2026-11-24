// Zombie_Apocalypse — local stores that take zLux (Zombie · Lucky · Utility · Xtreme): one on every map, a shopkeeper
// at the counter (Raj at the Quick Stop; a keeper of our own elsewhere) and a zLux vending machine / honesty box beside
// it. Before the outbreak you buy at the counter (E / USE); after it the keeper's gone: the till's cash is yours, the
// stock becomes searchable, and the machine by the door still takes your coins. Also: the wallet in the HUD and the
// pack, money dropped by the dead, and a use for every item in the pack.
// main.js hooks (each marked [zLux]): init (in load), context (E), cashLoot (searching), handModel (pickup), useMore
// (useItem), update + the pause (step), packFill (money weighs nothing).
import * as THREE from 'three';
import { Soldier } from './soldier.js';
import * as LOOKS from './looks.js';
import { ITEMS } from './loot.js';
import { icon, ITEM_ICON } from './icons.js';
import { C } from './state.js';
import { WEAPONS } from './weapons.js';
import * as M from './money.js';
export { handModel } from './money.js';

let E = null;            // what main.js hands us (see init)
// every item gets a button in the pack (useMore below says what it does)
for (const [id, u] of Object.entries({ ammo9: 'Load', shells: 'Load', rifleAmmo: 'Load', bottle: 'Throw (G)', molotov: 'Throw (H)', gascan: 'Use', keys: 'Check',
  keycardRed: 'Use', keycardBlue: 'Use', keycardGreen: 'Use', keycardGold: 'Use', sewerKey: 'Use' })) if (ITEMS[id] && !ITEMS[id].use) ITEMS[id].use = u;
const SHOPS = [];
const piles = [];        // money on the floor (dropped by the dead, dropped by you)
let open = null, lastRun = -1, hudN = null;
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
export const zl = n => `<span class="zl"><b>Z</b>&#8201;${n}&#8201;<b>Lux</b></span>`;

// ---------------------------------------------------------------- what each store sells: [item, price, stock, how many per buy]
// (you start with 100 zLux: enough for a few useful things, not the whole shelf)
const FOOD = { water: 8, soda: 6, juice: 6, chips: 5, bar: 6, beans: 10, soup: 10, cereal: 12, apple: 4, dates: 6, bread: 6 };
const STOCK = {
  maple: [['water', 8, 6], ['soda', 6, 6], ['juice', 6, 4], ['chips', 5, 6], ['bar', 6, 6], ['beans', 10, 4], ['soup', 10, 4], ['cereal', 12, 2], ['apple', 4, 4],
    ['bandage', 12, 4], ['pills', 18, 3], ['battery', 10, 6], ['flashlight', 30, 1], ['lantern', 40, 1], ['bottle', 3, 4], ['knife', 25, 1], ['bat', 35, 1], ['ammo9', 25, 2, 8], ['pistol', 120, 1]],
  desert: [['water', 8, 8], ['dates', 6, 6], ['bread', 6, 6], ['apple', 4, 6], ['juice', 6, 3], ['bar', 6, 3], ['bandage', 12, 3], ['pills', 18, 2],
    ['battery', 10, 3], ['flashlight', 30, 1], ['knife', 25, 1], ['machete', 50, 1], ['shells', 30, 1, 5], ['shotgun', 170, 1]],
  prison: [['soup', 10, 4], ['beans', 10, 4], ['chips', 5, 6], ['bar', 6, 6], ['soda', 6, 6], ['water', 8, 6], ['bandage', 12, 3], ['pills', 18, 3], ['antibiotics', 35, 1],
    ['battery', 10, 4], ['flashlight', 30, 1], ['crowbar', 40, 1], ['ammo9', 25, 1, 8]],
  jungle: [['water', 8, 8], ['beans', 10, 4], ['bar', 6, 6], ['juice', 6, 3], ['bandage', 12, 4], ['pills', 18, 2], ['antibiotics', 35, 2], ['medkit', 45, 1],
    ['battery', 10, 6], ['flashlight', 30, 1], ['lantern', 40, 1], ['machete', 50, 1], ['rifleAmmo', 40, 2, 5], ['sniper', 160, 1]],
  stadium: [['soda', 6, 8], ['water', 8, 6], ['chips', 5, 8], ['bar', 6, 6], ['juice', 6, 4], ['bandage', 12, 3], ['pills', 18, 2], ['medkit', 45, 1],
    ['battery', 10, 3], ['bottle', 3, 4], ['bat', 35, 1]],
};
const VEND = [['water', 10, 3], ['soda', 8, 3], ['chips', 7, 3], ['bar', 8, 3], ['bandage', 15, 2], ['battery', 12, 2]];

// ---------------------------------------------------------------- where (counter frame: origin = the counter's middle,
// local +z = the customer's side; keeper/customer/register/vending in that frame unless given in world coords)
const Pf = (x, z, yaw) => { const c = Math.cos(yaw), s = Math.sin(yaw); return (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c]; };
function defs(map) {
  if (map === 'maple') return { title: 'QUICK STOP', eyebrow: 'Maple Hollow · Main St', keeperRaj: true, x: 14.2, z: -13.4, yaw: 0, top: 1.05, cust: 1.05, build: false, reg: [0.55, 0], useReg: [14.4, -14.2],
    vend: { kind: 'vend', w: [16.5, -10.42], yaw: 0 } };
  if (map === 'desert') { const S = Pf(-19.5, -5, Math.PI / 2), [x, z] = S(0, 0.55); return { title: 'AMIRA\'S SPICE STALL', eyebrow: 'Arroyo Seco · the market', keeper: { name: 'Amira', body: 'michelle', at: [0, -0.65] }, x, z, yaw: Math.PI / 2, top: 0.85, cust: 1.15, build: false, reg: [0.85, 0], regLabel: 'Amira\'s cash box', vend: { kind: 'box', at: [2.4, -0.35] } }; }
  if (map === 'prison') return { title: 'COMMISSARY', eyebrow: 'Blackwater · the dining hall', keeper: { name: 'Officer Pike', body: 'coach', at: [0, -0.85] }, x: -3.6, z: -74, yaw: -Math.PI / 2, top: 1.0, cust: 1.1, build: 'counter', hw: 1.4, hd: 0.35,
    reg: [0.7, 0], regLabel: 'Commissary till', shelf: ['store', 'Commissary stock'], vend: { kind: 'vend', at: [2.45, -0.25] } };
  if (map === 'jungle') { const T = Pf(63, 81, Math.PI - 0.3), [x, z] = T(0.4, 1.3); return { title: 'SUPPLY TENT', eyebrow: 'Rio Verde · the expedition camp', keeper: { name: 'Mateo', body: 'butler', at: [0, -0.8] }, x, z, yaw: Math.PI - 0.3, top: 0.82, cust: 1.1, build: 'table', hw: 0.95, hd: 0.32,
    reg: [0.55, 0], regLabel: 'Cash tin', shelf: ['store', 'Supply crates'], vend: { kind: 'box', at: [-2.3, -0.1], ry: Math.PI / 2 } }; }
  if (map === 'stadium') return { title: 'zLUX KIOSK', eyebrow: 'Harbor City · the plaza', keeper: { name: 'Sal', body: 'human', at: [0, -0.8] }, x: 24, z: -87, yaw: -Math.PI / 2, top: 1.05, cust: 1.1, build: 'kiosk', hw: 1.2, hd: 0.3,
    reg: [0.6, 0], regLabel: 'Kiosk till', shelf: ['pantry', 'Kiosk stock'], vend: { kind: 'vend', at: [2.5, -0.1] } };
  return null;
}

// ---------------------------------------------------------------- canvas signs (Z on the left, Lux on the right)
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
function zlMark(g, x, y, s, col) { g.fillStyle = col; g.textBaseline = 'middle'; g.textAlign = 'right'; g.font = `900 ${s}px "Bebas Neue", Impact, sans-serif`; g.fillText('Z', x - s * 0.08, y + s * 0.04); g.textAlign = 'left'; g.font = `italic 900 ${s * 0.62}px Georgia, serif`; g.fillText('Lux', x + s * 0.08, y); }
const signTex = (title, sub) => canvasTex(512, 256, (g, w, h) => {
  g.fillStyle = '#163a24'; g.fillRect(0, 0, w, h); g.strokeStyle = '#e8c860'; g.lineWidth = 10; g.strokeRect(10, 10, w - 20, h - 20);
  zlMark(g, w / 2, 96, 120, '#f4d77a'); g.fillStyle = '#f4f0e0'; g.textAlign = 'center'; g.font = 'bold 34px Helvetica, Arial, sans-serif'; g.fillText(title, w / 2, 182); g.font = '20px Helvetica, Arial, sans-serif'; g.fillStyle = '#c8d8c0'; g.fillText(sub, w / 2, 220);
});
const vendTex = () => canvasTex(256, 512, (g, w, h) => {
  g.fillStyle = '#7a1418'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#101418'; g.fillRect(14, 70, 166, 360);   // the window
  const cols = ['#c8201a', '#1a5ac8', '#e8b020', '#2a9a3a', '#e8e8e8', '#e86a1a'];
  for (let r = 0; r < 6; r++) { g.fillStyle = '#3a4048'; g.fillRect(14, 120 + r * 52, 166, 4); for (let k = 0; k < 5; k++) { g.fillStyle = cols[(r + k) % cols.length]; g.fillRect(22 + k * 32, 84 + r * 52, 22, 34); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(24 + k * 32, 86 + r * 52, 5, 30); } }
  g.fillStyle = 'rgba(180,220,255,.12)'; g.fillRect(14, 70, 166, 360);
  zlMark(g, w / 2, 36, 54, '#f4d77a');
  g.fillStyle = '#2a2e34'; g.fillRect(190, 110, 54, 210); g.fillStyle = '#40ff90'; g.fillRect(196, 120, 42, 22); g.fillStyle = '#103020'; g.font = 'bold 13px Helvetica'; g.textAlign = 'center'; g.fillText('zLUX', 217, 132);
  g.fillStyle = '#c8c8c8'; for (let k = 0; k < 9; k++) g.fillRect(198 + (k % 3) * 13, 160 + Math.floor(k / 3) * 16, 10, 11);
  g.fillStyle = '#000'; g.fillRect(212, 220, 10, 30); g.fillStyle = '#e8c860'; g.font = 'bold 11px Helvetica'; g.fillText('COINS', 217, 266); g.fillText('BILLS', 217, 300); g.fillStyle = '#000'; g.fillRect(198, 306, 38, 6);
  g.fillStyle = '#000'; g.fillRect(14, 448, 166, 46); g.fillStyle = '#e8e8e8'; g.font = 'bold 14px Helvetica'; g.fillText('PUSH', 97, 476);
});
const boxTex = () => canvasTex(512, 256, (g, w, h) => {
  g.fillStyle = '#8a6a42'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 42) { g.fillStyle = 'rgba(40,24,10,.5)'; g.fillRect(0, y, w, 3); }
  g.fillStyle = '#efe6d0'; g.fillRect(40, 30, w - 80, h - 60); zlMark(g, w / 2, 86, 84, '#2a3a20');
  g.fillStyle = '#2a2a2a'; g.textAlign = 'center'; g.font = 'bold 28px "Comic Sans MS", "Marker Felt", sans-serif'; g.fillText('HONESTY BOX', w / 2, 150); g.font = '20px "Marker Felt", sans-serif'; g.fillText('take what you need · leave the Lux', w / 2, 184);
});

// ---------------------------------------------------------------- building a store
function mat(k, col) { const m = E.world.MAT && E.world.MAT[k]; return m || new THREE.MeshStandardMaterial({ color: col, roughness: 0.7 }); }
function buildShop(map) {
  const D = defs(map); if (!D) return;
  const W = E.world, P = Pf(D.x, D.z, D.yaw), gy = (W.groundY ? W.groundY(D.x, D.z, 0) : 0) || 0;
  const g = new THREE.Group(); g.position.set(D.x, gy, D.z); g.rotation.y = D.yaw; E.scene.add(g);
  const S = { ...D, map, g, P, gy, cons: [], stock: null, sold: null };
  const box = (m, w, h, d, x, y, z, ry = 0, parent = g) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = o.receiveShadow = true; parent.add(o); return o; };
  const solid = (lx, lz, hx, hz, y1, surf = 'wood', ry = 0, y0 = 0) => { const [wx, wz] = P(lx, lz); const b = W.solid(wx, wz, hx, hz, D.yaw + ry, gy + y1, surf, gy + y0); if (W.moveBox) W.moveBox(b, b.x, b.z, b.yaw); return b; };
  // the counter (where the map has none)
  if (D.build === 'counter' || D.build === 'kiosk') {
    box(mat('counter', 0x9a8a70), D.hw * 2 + 0.04, 0.05, D.hd * 2 + 0.06, 0, D.top - 0.025, 0); box(mat('cabinet', 0x5a4a3a), D.hw * 2, D.top - 0.05, D.hd * 2, 0, (D.top - 0.05) / 2, 0);
    solid(0, 0, D.hw, D.hd, D.top, 'wood');
  }
  if (D.build === 'table') {   // a folding camp table with crates under it
    box(mat('plank', 0x8a6a42), D.hw * 2, 0.04, D.hd * 2, 0, D.top - 0.02, 0); for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(mat('darkMetal', 0x333333), 0.03, D.top, 0.03, sx * (D.hw - 0.05), D.top / 2, sz * (D.hd - 0.05));
    for (const sx of [-0.5, 0.45]) box(mat('crate', 0x7a5a32), 0.5, 0.4, 0.42, sx, 0.2, -0.05);
    solid(0, 0, D.hw, D.hd, D.top, 'wood');
  }
  if (D.build === 'kiosk') {   // a little booth: back wall, sides, a roof, a sign
    const wall = mat('white', 0xe8e4dc);
    box(wall, D.hw * 2 + 0.6, 2.4, 0.08, 0, 1.2, -1.5); solid(0, -1.5, D.hw + 0.3, 0.06, 2.4, 'metal');
    for (const sx of [-1, 1]) { box(wall, 0.08, 2.4, 1.9, sx * (D.hw + 0.3), 1.2, -0.6); solid(sx * (D.hw + 0.3), -0.6, 0.05, 0.95, 2.4, 'metal'); }
    box(mat('darkMetal', 0x2a2e34), D.hw * 2 + 0.9, 0.1, 2.6, 0, 2.45, -0.35);
    box(mat('shelfMetal', 0x8a8e94), D.hw * 2, 0.04, 0.32, 0, 1.3, -1.3); box(mat('shelfMetal', 0x8a8e94), D.hw * 2, 0.04, 0.32, 0, 1.75, -1.3);
    const cols = [0xc8201a, 0x1a5ac8, 0xe8b020, 0x2a9a3a]; for (let k = 0; k < 14; k++) { const m = new THREE.MeshStandardMaterial({ color: cols[k % 4], roughness: 0.5 }); box(m, 0.08, 0.14, 0.08, -D.hw + 0.15 + (k % 7) * 0.33, 1.39 + Math.floor(k / 7) * 0.45, -1.3); }
  }
  // the sign: "zLux accepted" (a big one on the kiosk, a card on the counter elsewhere)
  { const t = signTex(D.title, 'zLUX ACCEPTED HERE'), m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.18 });
    const big = D.build === 'kiosk', sg = new THREE.Mesh(new THREE.PlaneGeometry(big ? 2.4 : 0.4, big ? 1.2 : 0.2), m);
    if (big) sg.position.set(0, 2.95, 0.98); else { sg.position.set(-0.45, D.top + 0.13, D.hd ? D.hd - 0.05 : 0.2); sg.rotation.x = -0.25; }
    g.add(sg); if (big) { const back = sg.clone(); back.rotation.y = Math.PI; back.position.z = 0.9; g.add(back); box(mat('darkMetal', 0x2a2e34), 2.5, 1.3, 0.06, 0, 2.95, 0.94); } }
  // the till: a cash register, a bill sticking out of the drawer, a tray of coins, a banded stack
  { const [rx, rz] = D.reg, k = new THREE.Group(); k.position.set(rx, D.top, rz); k.rotation.y = Math.PI; g.add(k);
    const blk = new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.5 }), scr = new THREE.MeshStandardMaterial({ color: 0x103020, emissive: 0x40ff90, emissiveIntensity: 0.5 });
    box(blk, 0.34, 0.09, 0.32, 0, 0.045, 0, 0, k); box(blk, 0.3, 0.1, 0.18, 0, 0.14, 0.05, 0, k);
    const sc = box(blk, 0.22, 0.14, 0.02, 0, 0.27, -0.02, 0, k); sc.rotation.x = -0.35; const sf = box(scr, 0.19, 0.11, 0.005, 0, 0.27, -0.032, 0, k); sf.rotation.x = -0.35;
    const b = M.makeBill(20, 0.5); b.position.set(0.02, 0.06, -0.19); b.rotation.y = 0.15; k.add(b);
    for (let i = 0; i < 6; i++) { const c = M.makeCoin(i % 2 === 0); c.position.set(-0.05 + (i % 3) * 0.028, D.top + 0.0012 + Math.floor(i / 3) * 0.0023, 0.08); c.position.add(new THREE.Vector3(rx + 0.25, -D.top, rz)); g.add(c); }
    const st = M.makeStack(10, 10); st.position.set(rx - 0.28, D.top + 0.001, rz + 0.04); st.rotation.y = 0.3; g.add(st);
    S.till = [k, st];
  }
  // the register to rob once it's all gone wrong (the Quick Stop has its own)
  const [rwx, rwz] = P(D.reg[0], D.reg[1] - 0.25);
  if (D.useReg) { let best = null, bd = 2; for (const c of W.containers) { if (c.kind !== 'register') continue; const d = Math.hypot(c.x - D.useReg[0], c.z - D.useReg[1]); if (d < bd) { bd = d; best = c; } } if (best) best.zlxBig = true; }
  else { const c = W.container('register', rwx, rwz, D.top, D.regLabel || 'The till', D.yaw + Math.PI, null, { zlxBig: true, hidden: true }); S.cons.push(c); }
  if (D.shelf) { const [sx, sz] = P(-0.4, -0.3); S.cons.push(W.container(D.shelf[0], sx, sz, D.top, D.shelf[1], D.yaw + Math.PI, null, { hidden: true })); }
  // the vending machine / honesty box (works before and after)
  if (D.vend) {
    const V = D.vend, [vx, vz] = V.w || P(...V.at), vyaw = V.w ? V.yaw : D.yaw + (V.ry || 0), vy = (W.groundY ? W.groundY(vx, vz, 0) : 0) || 0;
    const vg = new THREE.Group(); vg.position.set(vx, vy, vz); vg.rotation.y = vyaw; E.scene.add(vg);
    if (V.kind === 'vend') {
      const t = vendTex(), front = new THREE.MeshStandardMaterial({ map: t, roughness: 0.35, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.35 }), body = new THREE.MeshStandardMaterial({ color: 0x6a1014, roughness: 0.45, metalness: 0.3 });
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.85, 0.72), [body, body, body, body, front, body]); m.position.y = 0.925; m.castShadow = m.receiveShadow = true; vg.add(m);
      const b = W.solid(vx, vz, 0.45, 0.36, vyaw, vy + 1.85, 'metal', vy); if (W.moveBox) W.moveBox(b, b.x, b.z, b.yaw);
    } else {
      const t = boxTex(), wood = mat('crate', 0x7a5a32), face = new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 });
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.75, 0.55), [wood, wood, wood, wood, face, wood]); m.position.y = 0.375; m.castShadow = m.receiveShadow = true; vg.add(m);
      const tin = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.12, 18), new THREE.MeshStandardMaterial({ color: 0x8a9098, metalness: 0.7, roughness: 0.35 })); tin.position.set(0.18, 0.81, 0); vg.add(tin);
      for (let i = 0; i < 3; i++) { const c = M.makeCoin(i !== 1); c.position.set(-0.15 + i * 0.03, 0.752, 0.1); vg.add(c); }
      const b2 = M.makeBill(5, 0.6); b2.position.set(-0.1, 0.752, -0.08); b2.rotation.y = 0.4; vg.add(b2);
      const b = W.solid(vx, vz, 0.4, 0.28, vyaw, vy + 0.75, 'wood', vy); if (W.moveBox) W.moveBox(b, b.x, b.z, b.yaw);
    }
    S.vendAt = { x: vx + Math.sin(vyaw) * 0.85, z: vz + Math.cos(vyaw) * 0.85, cx: vx, cz: vz, kind: V.kind };
  }
  // the shopkeeper behind the counter
  if (D.keeper && E.KINDS) {
    const kind = E.KINDS[D.keeper.body] || E.KINDS.human, s = new Soldier(kind, E.scene, { clone: true });
    try { LOOKS.applyLook(s, LOOKS.lookFor('shop:' + map, D.keeper.body)); } catch (e) { }
    s.update(1 / 60, {}); s.setVisible(false);
    const [kx, kz] = P(...D.keeper.at);
    S.k = { s, name: D.keeper.name, home: { x: kx, z: kz, yaw: D.yaw }, st: 'off', t: 0 };
  }
  const [cx, cz] = P(0, D.cust); S.cust = { x: cx, z: cz };
  SHOPS.push(S);
}

// ---------------------------------------------------------------- init (main.js load(), after the map is built)
export function init(deps) {
  E = deps;
  try { buildShop(E.MAP_ID()); } catch (e) { console.error('shop build', e); }
  // the dead sometimes drop a little money when they go down
  const prev = C.events.kill;
  C.events.kill = (v, by, info) => { prev && prev(v, by, info); try { if (v && v.zombie && v.s && Math.random() < 0.14) dropPile(v.s.pos.x + (Math.random() - 0.5) * 0.8, v.s.pos.z + (Math.random() - 0.5) * 0.8, 2 + Math.floor(Math.random() * 14)); } catch (e) { } };
  injectUI();
  // capture Esc / E / Tab while the shop is open (before main.js's own key handler)
  addEventListener('keydown', e => { if (!open) return; if (['Escape', 'KeyE', 'Tab', 'KeyP', 'Enter'].includes(e.code)) close(); e.preventDefault(); e.stopImmediatePropagation(); }, true);
}
export function dropPile(x, z, n) {
  const W = E.world, y = (W.groundY ? W.groundY(x, z, 0) : 0) || 0, m = M.makePile(n); m.position.set(x, y + 0.003, z); E.scene.add(m);
  const c = W.container('bench', x, z, 0.05, 'zLux on the ground', 0, null, { dyn: true, cash: n, paper: m, floorY: y > 0.4 ? y : 0 });
  piles.push(c); return c;
}

// ---------------------------------------------------------------- E: the counter, the machine, money on the floor
const keeperOK = S => {
  const G = E.G; if (G.phase !== 'calm') return null;
  if (S.keeperRaj) { const r = E.PEOPLE && E.PEOPLE.PPL && E.PEOPLE.PPL.cast && E.PEOPLE.PPL.cast.raj; return r && r.active && r.alive && !r.gone && !r.zu && !r.doomed ? 'Raj' : null; }
  return S.k && S.k.st === 'idle' ? S.k.name : null;
};
const facing = (px, pz, yaw, x, z, lim = 1.4) => { const a = Math.atan2(x - px, z - pz) - yaw; return Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < lim; };
export function context(px, pz, yaw) {
  if (!E) return null;
  const G = E.G, n = G.inv.zlux || 0;
  for (const c of piles) if (!c.searched && Math.hypot(c.x - px, c.z - pz) < 1.3) return { label: 'Pick up the zLux', sub: `Z ${c.cash} Lux on the ground`, go: () => E.startSearch(c) };
  for (const S of SHOPS) {
    const who = keeperOK(S);
    if (who && Math.hypot(S.cust.x - px, S.cust.z - pz) < 1.5 && facing(px, pz, yaw, S.x, S.z)) return { label: `Buy from ${who}`, sub: `${S.title.replace(/zLUX/, 'zLux')} · you have Z ${n} Lux`, go: () => openShop(S, 'keeper') };
    const V = S.vendAt; if (V && Math.hypot(V.x - px, V.z - pz) < 1.3 && facing(px, pz, yaw, V.cx, V.cz)) return { label: V.kind === 'box' ? 'The zLux honesty box' : 'zLux vending machine', sub: `takes zLux · you have Z ${n} Lux`, go: () => openShop(S, 'vend') };
  }
  return null;
}
// what a search turns up: money in tills, drawers, wallets on bodies (main.js updateSearch)
export function cashLoot(c, loot) {
  if (c.cash) { E.G.stats.items -= c.cash - 1; return [['zlux', c.cash]]; }
  const n = M.cashFor(c); if (n <= 0) return loot;
  E.G.stats.items -= n - 1;   // (a wad of bills is one thing found, not forty)
  return [...loot, ['zlux', n]];
}

// ---------------------------------------------------------------- the shop screen
function injectUI() {
  if ($('shop')) return;
  const css = document.createElement('style'); css.textContent = `
  #shop .zshop { width: min(780px, calc(100vw - 16px)); padding-bottom: 0; }
  #shop .eyebrow { overflow-wrap: anywhere; }
  .zshop h2 { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; overflow-wrap: anywhere; } .zshop h2 .ic { width: .8em; height: .8em; color: #e8c860; flex: none; }
  .zshop .sub { color: #c8c2b6; font-size: 13px; line-height: 1.4; margin: 2px 0 8px; }
  .zsWallet { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 6px 0 12px; padding: 8px 12px; background: rgba(232,200,96,.08); border: 1px solid rgba(232,200,96,.35); border-radius: 2px; font-family: 'Oswald', sans-serif; font-size: 15px; letter-spacing: .04em; color: #f0e6c8; }
  .zsWallet .ic { width: 22px; height: 22px; color: #e8c860; }
  .zl { white-space: nowrap; font-variant-numeric: tabular-nums; } .zl b { color: #f0d27a; font-weight: 700; } .zl b:last-child { font-style: italic; font-family: Georgia, serif; }
  .zsGrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(156px, 1fr)); gap: 8px; }
  .zsIt { background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1); border-radius: 3px; padding: 9px 10px; display: flex; flex-direction: column; gap: 6px; font-family: 'Oswald', sans-serif; font-size: 13px; min-width: 0; }
  .zsIt.no { opacity: .55; }
  .zsTop { display: flex; align-items: flex-start; gap: 8px; } .zsTop .ic { width: 24px; height: 24px; flex: none; color: #d8d2c4; }
  .zsNm { color: #f1ede4; line-height: 1.2; overflow-wrap: anywhere; } .zsNm small { color: #a39d90; }
  .zsD { font-size: 11px; color: #8d877b; line-height: 1.3; min-height: 14px; overflow-wrap: anywhere; }
  .zsRow { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; flex-wrap: wrap; } .zsPrice { font-size: 16px; } .zsStock { font-size: 11px; color: #a39d90; }
  .zsIt button { margin-top: auto; padding: 7px 6px; background: rgba(232,200,96,.16); border: 1px solid #c9a24a; color: #fff; font: inherit; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; cursor: pointer; border-radius: 2px; white-space: normal; line-height: 1.25; }
  .zsIt button:hover:not([disabled]) { background: rgba(232,200,96,.34); } .zsIt button[disabled] { cursor: default; border-color: #4a463e; background: transparent; color: #a39d90; }
  #shop .btns.sticky { margin-top: 14px; }
  @media (max-width: 700px), (max-height: 560px) { .zsGrid { grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: 6px; } .zsIt { padding: 7px 8px; gap: 4px; } .zsWallet { margin: 4px 0 8px; padding: 6px 10px; } .zshop .sub { margin: 0 0 4px; } }
  @media (max-height: 430px) { #shop .zshop { padding-top: 10px !important; } .zshop h2 { font-size: 24px !important; margin: 0 !important; } .zshop .sub { display: none; } .zshop .eyebrow { font-size: 9px; margin: 0; }
    .zsWallet { margin: 4px 0 6px; padding: 3px 8px; font-size: 13px; } .zsWallet .ic { width: 16px; height: 16px; } .zsD { display: none; } #shop .btns.sticky { margin-top: 8px; padding-top: 6px; padding-bottom: 8px; } #shop .btns.sticky button.m { padding: 8px; } }
  #vitals .zlxHud { display: flex; align-items: center; gap: 6px; margin-top: 6px; font-family: 'Oswald', sans-serif; font-size: 14px; color: #f0e6c8; letter-spacing: .04em; }
  #vitals .zlxHud .ic { width: 16px; height: 16px; color: #e8c860; } #vitals .zlxHud.bump { animation: zlxBump .5s ease; }
  @keyframes zlxBump { 30% { transform: scale(1.12); color: #fff; } }
  #bagSub .zlxChip .ic { color: #e8c860; }
  `;
  document.head.appendChild(css);
  const d = document.createElement('div'); d.className = 'screen'; d.id = 'shop';
  d.innerHTML = `<div class="center-panel zshop"><div class="eyebrow" id="zsEye"></div><h2 id="zsTitle"></h2><div class="sub" id="zsSub"></div><div class="zsWallet" id="zsWallet"></div><div class="zsGrid" id="zsGrid"></div><div class="btns sticky"><button class="m go" id="zsClose">Close</button></div></div>`;
  (document.getElementById('result') || document.body.lastElementChild).after(d);
  $('zsClose').onclick = () => close();
  d.addEventListener('pointerdown', e => { if (e.target === d) close(); });
  // the wallet in the HUD (under the bars) and in the backpack's top line
  const v = $('vitals'); if (v) { const h = document.createElement('div'); h.className = 'zlxHud'; h.id = 'zlxHud'; h.title = 'zLux: Zombie · Lucky · Utility · Xtreme'; v.appendChild(h); }
  const bs = $('bagSub'); if (bs) new MutationObserver(() => { if (!bs.querySelector('.zlxChip') && E && E.G.inv) { const s = document.createElement('span'); s.className = 'zlxChip'; s.innerHTML = icon('coin') + ' ' + zl(E.G.inv.zlux || 0); bs.insertBefore(s, bs.querySelector('.cap')); } }).observe(bs, { childList: true });
}
const fxOf = I => [I.food ? `food +${I.food}` : '', I.water ? `water ${I.water > 0 ? '+' : ''}${I.water}` : '', I.heal ? `health +${I.heal}` : '', I.stopBleed ? 'stops bleeding' : '', I.cure ? `infection −${I.cure}` : '', I.stam ? `stamina +${I.stam}` : ''].filter(Boolean).join(' · ');
const descOf = id => { const I = ITEMS[id]; return fxOf(I) || (I.cat === 'ammo' ? 'ammunition' : I.cat === 'melee' ? 'a weapon' : I.cat === 'gun' ? 'a gun — loud' : id === 'battery' ? 'for the flashlight / lantern' : id === 'bottle' ? 'throw it: a distraction' : id === 'flashlight' ? 'F to switch on' : id === 'lantern' ? 'L to light it' : ''); };
function openShop(S, mode) {
  const G = E.G; if (G.state !== 'play') return;
  if (!S.stock || S.stockRun !== G.runId) { S.stock = (STOCK[S.map] || STOCK.maple).map(a => ({ id: a[0], price: a[1], left: a[2], n: a[3] || 1 })); S.vstock = VEND.map(a => ({ id: a[0], price: a[1], left: a[2], n: 1 })); S.stockRun = G.runId; }
  open = { S, mode, list: mode === 'vend' ? S.vstock : S.stock };
  G.state = 'shop'; E.keys.clear(); G.mouse.left = G.mouse.right = false; G.useReq = false;
  const who = mode === 'vend' ? null : keeperOK(S);
  $('zsEye').textContent = S.eyebrow;
  $('zsTitle').innerHTML = icon('shop') + esc(mode === 'vend' ? (S.vendAt.kind === 'box' ? 'Honesty box' : 'zLux vending') : S.title);
  $('zsSub').textContent = mode === 'vend' ? (S.vendAt.kind === 'box' ? 'Take what you need. Leave the Lux in the tin.' : 'Still lit. Still takes coins. Push the button, the coil turns.')
    : `${who} is behind the counter. ${E.G.phase === 'calm' ? 'zLux only — no cards today.' : ''}`;
  render(); E.showScreen('shop');
  if (E.SND && E.SND.phoneTap) E.SND.phoneTap();
}
function render() {
  if (!open) return;
  const G = E.G, have = G.inv.zlux || 0;
  $('zsWallet').innerHTML = `${icon('wallet')}<span>In your wallet:</span> ${zl(have)}`;
  $('zsGrid').innerHTML = open.list.map((it, i) => {
    const I = ITEMS[it.id]; if (!I) return '';
    const owned = I.one && G.inv[it.id] > 0, short = it.price - have;
    const why = it.left <= 0 ? 'Sold out' : owned ? 'You have one' : short > 0 ? `Need ${short} more` : 'Buy';
    const nm = (I.name || it.id) + (it.n > 1 ? ` <small>×${it.n}</small>` : '');
    return `<div class="zsIt ${why !== 'Buy' ? 'no' : ''}"><div class="zsTop">${icon(ITEM_ICON[it.id] || 'box')}<div class="zsNm">${nm}</div></div><div class="zsD">${esc(descOf(it.id))}</div>`
      + `<div class="zsRow"><span class="zsPrice">${zl(it.price)}</span><span class="zsStock">${it.left > 0 ? it.left + ' left' : 'none left'}</span></div><button data-buy="${i}" ${why !== 'Buy' ? 'disabled' : ''}>${why}</button></div>`;
  }).join('');
  for (const b of $('zsGrid').querySelectorAll('[data-buy]')) b.onclick = () => buy(+b.dataset.buy);
}
function buy(i) {
  const G = E.G, it = open && open.list[i]; if (!it) return;
  const I = ITEMS[it.id]; if (it.left <= 0 || (G.inv.zlux || 0) < it.price || (I.one && G.inv[it.id] > 0)) return;
  G.inv.zlux -= it.price; it.left--;
  const r = E.addItem(it.id, it.n);
  E.toast(`Bought ${I.name}${it.n > 1 ? ' ×' + it.n : ''}${r === 'repair' ? ' (fresh one)' : r === 'ammo' ? ' (took the ammo)' : ''} — Z ${it.price} Lux`, I.cat === 'gun' || I.cat === 'melee' ? 'gold' : 'good', ITEM_ICON[it.id]);
  if (E.SND && E.SND.pickup) E.SND.pickup(I.cat === 'melee' || I.cat === 'gun' ? 'weapon' : I.cat === 'ammo' ? 'ammo' : 'item');
  if (E.STATS && E.STATS.event) try { E.STATS.event('buy', { id: it.id, price: it.price }); } catch (e) { }
  render(); hud(true);
}
export function close() {
  if (!open) return;
  open = null; const G = E.G;
  if (G.state === 'shop') G.state = 'play';
  E.showScreen(null);
}
export const isOpen = () => !!open;
export const _shops = SHOPS, _piles = piles;   // (tests)

// ---------------------------------------------------------------- the HUD wallet
function hud(bump = false) {
  const el = $('zlxHud'), G = E.G; if (!el || !G.inv) return;
  const n = G.inv.zlux || 0; if (n === hudN && !bump) return;
  const up = hudN != null && n !== hudN; hudN = n;
  el.innerHTML = icon('coin') + zl(n);
  if (up) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
}

// ---------------------------------------------------------------- every frame (main.js step)
const tmpV = new THREE.Vector3();
export function update(dt) {
  if (!E) return;
  const G = E.G, P = E.P();
  if (G.runId !== lastRun && G.inv) {   // a new run (or a loaded one): the wallet, the shelves, the floor, the keepers
    lastRun = G.runId;
    if (G.inv.zlux == null) G.inv.zlux = M.START_CASH;   // every new game starts with 100 zLux; a loaded save keeps its own
    for (const c of piles) { if (c.paper) c.paper.removeFromParent(); const i = E.world.containers.indexOf(c); if (i >= 0) E.world.containers.splice(i, 1); }
    piles.length = 0;
    for (const S of SHOPS) { S.stock = null; if (S.k) { S.k.st = 'off'; } if (S.till) for (const o of S.till) o.visible = true; }
    hudN = null;
  }
  hud();
  if (!P) return;
  const calm = G.phase === 'calm';
  for (const S of SHOPS) {
    for (const c of S.cons) c.hidden = calm;                 // the till and the stock: searchable once the keeper's gone
    if (S.till && !calm) { const reg = S.cons[0]; if (reg && reg.searched) for (const o of S.till) o.visible = false; }
    const K = S.k; if (!K) continue;
    const d = Math.hypot(K.s.pos.x - P.s.pos.x, K.s.pos.z - P.s.pos.z);
    if (calm) {
      if (K.st !== 'idle') { K.st = 'idle'; K.s.resetActs(); K.s.place(K.home.x, K.home.z, K.home.yaw, S.gy); K.s.setVisible(true); }
      if (d < 50) { K.s.lookAt = d < 6 ? tmpV.set(P.s.pos.x, 1.6 + (P.s.gy || 0), P.s.pos.z) : null; K.s.update(dt, {}); }
    } else if (K.st === 'idle') {
      // the outbreak: the keeper runs (out of sight, then gone)
      if (d > 25) { K.st = 'gone'; K.s.setVisible(false); }
      else { K.st = 'flee'; K.t = 0; K.dir = Math.atan2(K.s.pos.x - P.s.pos.x, K.s.pos.z - P.s.pos.z); K.s.lookAt = null; if (E.toast) E.toast(`${K.name}: "Run! Get out of here!"`, 'grey'); }
    } else if (K.st === 'flee') {
      K.t += dt; K.s.update(dt, { move: K.dir, speed: K.s.vr || 4 });
      if (E.world.collide) { const was = K.s.pos.x + K.s.pos.z, hit = E.world.collide(K.s.pos, 0.3); if (hit && Math.abs(was - (K.s.pos.x + K.s.pos.z)) > 0.001) K.dir += 0.9; }
      if (K.t > 3.5 || d > 30) { K.st = 'gone'; K.s.setVisible(false); }
    }
  }
}

// ---------------------------------------------------------------- a use for everything in the pack (main.js useItem
// falls through to this for anything it doesn't handle itself)
export function useMore(id) {
  if (!E) return false;
  const G = E.G, P = E.P(), I = ITEMS[id]; if (!I || !(G.inv[id] > 0) || !P || !P.alive) return false;
  const px = P.s.pos.x, pz = P.s.pos.z;
  if (id === 'zlux') {
    // a store or a vending machine near: spend it there; somebody to talk to: give them some; otherwise drop a bill
    for (const S of SHOPS) { if (keeperOK(S) && Math.hypot(S.cust.x - px, S.cust.z - pz) < 4) { E.closeBag(); E.later(() => openShop(S, 'keeper'), 0.5); return true; } if (S.vendAt && Math.hypot(S.vendAt.x - px, S.vendAt.z - pz) < 4) { E.closeBag(); E.later(() => openShop(S, 'vend'), 0.5); return true; } }
    const n = E.PEOPLE && E.PEOPLE.talkable && E.PEOPLE.talkable(px, pz), amt = Math.min(10, G.inv.zlux);
    if (n) {
      G.inv.zlux -= amt; const nm = n.name ? n.name[0] + n.name.slice(1).toLowerCase() : 'them';
      E.toast(`Gave ${nm} Z ${amt} Lux`, 'good', 'coin'); if (n.say) n.say(Math.random() < 0.5 ? 'Thanks! That\'s real kind of you.' : 'zLux? Well — thank you.', 2.6);
      if (Math.random() < 0.5) { const back = ['water', 'bar', 'bandage', 'soda'][Math.floor(Math.random() * 4)]; E.addItem(back, 1); E.later(() => E.toast(`${nm} gave you: ${ITEMS[back].name}`, 'good', ITEM_ICON[back]), 1.2); }
      hud(true); return true;
    }
    G.inv.zlux -= amt; const a = P.s.yaw; dropPile(px + Math.sin(a) * 0.7, pz + Math.cos(a) * 0.7, amt);
    E.toast(`Dropped Z ${amt} Lux in front of you (E picks it up)`, 'grey', 'coin'); hud(true); return true;
  }
  if (I.cat === 'ammo') {   // load it into the gun it fits
    const g = Object.keys(WEAPONS).find(w => WEAPONS[w].ammo === id && P.arms.guns[w]);
    if (!g) { E.toast(`No gun for ${I.name.toLowerCase()} yet — ${id === 'ammo9' ? 'a 9mm pistol' : id === 'shells' ? 'a shotgun' : 'a hunting rifle'} takes them`, 'grey', 'ammo'); return false; }
    E.closeBag(); E.equipGun(g); E.later(() => { if (P.arms.cur === g && P.arms.startReload) P.arms.startReload(); }, P.arms.cur === g ? 0.4 : 1.1);
    E.toast(`Loading the ${WEAPONS[g].name ? WEAPONS[g].name.toLowerCase() : g}`, 'grey', 'ammo'); return true;
  }
  if (id === 'bottle' || id === 'molotov') { E.closeBag(); E.later(() => E.startThrow(id), 0.7); E.toast(id === 'bottle' ? 'Throwing the bottle (G next time)' : 'Throwing the Molotov (H next time)', 'grey', id === 'bottle' ? 'bottle' : 'flame'); return true; }
  if (id === 'flashlight') { if (G.battery <= 0 && !G.flashlight) { E.toast('Flashlight is dead — use a battery on it', 'bad', 'battery'); return false; } G.flashlight = !G.flashlight; if (E.SND && E.SND.flashlight) E.SND.flashlight(G.flashlight); E.toast(G.flashlight ? 'Flashlight on (F)' : 'Flashlight off', 'grey', 'torch'); return true; }
  if (id === 'gascan') {
    const T = E.world.truck;
    if (T && !T.fueled && Math.hypot(T.x - px, T.z - pz) < 5 && E.fillTank) { E.closeBag(); E.fillTank(); return true; }
    if ((G.inv.bottle || 0) > 0 && (G.gasUsed || 0) < 3) { G.inv.bottle--; G.inv.molotov = (G.inv.molotov || 0) + 1; G.gasUsed = (G.gasUsed || 0) + 1; E.toast('Made a Molotov: a bottle, some gas, a rag (H throws it)', 'good', 'flame'); return true; }
    E.toast(T && !T.fueled ? 'Take it to Dale\'s pickup — or fill an empty bottle with it for a Molotov' : 'Needs an empty bottle to make a Molotov', 'grey', 'gas'); return false;
  }
  if (id === 'keys') {
    if (E.SND && E.SND.keys) E.SND.keys();
    const T = E.world.truck; E.toast(T ? (Math.hypot(T.x - px, T.z - pz) < 5 ? 'The pickup\'s keys — get in with E' : 'Dale\'s pickup keys: the truck on Main St') : 'Keys. They\'ll start something.', 'grey', 'keys'); return true;
  }
  if (/^keycard|^sewerKey$/.test(id)) {   // which door it opens; right by it: open it
    const gs = E.world.gates || [], g = gs.find(x => x.needs === id && !x.open);
    if (g && Math.hypot(g.x - px, g.z - pz) < 4 && E.world.openGate) { E.world.openGate(g); if (E.SND && E.SND.mech) E.SND.mech('switch'); E.toast((g.name || 'The gate') + ' — open', 'good', 'check'); return true; }
    E.toast(g ? `Opens ${g.name || 'a locked gate'} — ${Math.round(Math.hypot(g.x - px, g.z - pz))} m away` : 'Whatever it opened is open now', 'grey', 'card'); return !!g;
  }
  return false;
}
