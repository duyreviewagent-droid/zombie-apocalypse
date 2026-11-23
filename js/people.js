// Zombie_Apocalypse — the people of Maple Hollow.
// Saturday morning they're out: walking the sidewalks, chatting on lawns, weeding, washing the truck, lining up at the
// Quick Stop for Raj's two-dollar burgers. At noon it all goes wrong. After that the neighbours run for their houses
// (some make it), the ones the dead catch go down — and get back up as one of them. And a few keep going the way you
// do: they scavenge houses (cupboards really open, and they take what's inside), pick up a weapon, fight when they
// have to, run when they can't. They can die out there too.
import * as THREE from 'three';
import { C } from './state.js';
import { tier } from './tex.js';
import { Soldier, clamp, lerp, wrapPi, damp, addTurn } from './soldier.js';
import { slotOf, adoptZombie, wake, Z, vestOn, dressZombie, startTurning, turnAmount, DIFF as ZD } from './zombies.js';
import { Melee, MELEE } from './melee.js';
import { refreshHitShapes } from './combat.js';
import * as HELI from './heli.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
export const PPL = { list: [], cast: {}, phase: 'calm' };
let X = null;   // what main.js hands us: { scene, world, KINDS, SWINGS, onStep, damage, noise, SND, P, G, camera }

// ---------------------------------------------------------------- what they wear
// Real clothes come in real colours: the fabric in each texture is re-dyed in the shader (its folds and seams kept), the
// skin, hair, faces, logos and shoes left alone. Tops and bottoms are picked separately, so the same body is never the same person.
const TOPS = [0x2c3e64, 0x6a2430, 0x55603a, 0xd6d2c6, 0x6e6e6e, 0x8a5a30, 0x2f6a78, 0xa8884e, 0x46344e, 0x9a3a2a, 0x1e1e22, 0x4f7a4a];
const BOTTOMS = [0x34496e, 0x232323, 0x8a7a55, 0x55603a, 0x4a3a2a, 0x6c6c6c, 0x2a2f45, 0x6a5a48, 0x3e4a5e, 0x5a2a2a];
const HAIR = [0x5a4030, 0x2a2018, 0xb89060, 0x8a8a88, 0x6a3020, 0x181410];
// mode 0: Michelle's one-piece atlas (the yellow trousers by colour; the black top by colour AND by where it sits on the body)
// mode 1: a Ready Player Me outfit piece (all of it is fabric; whites and light trims like shirt collars survive)
// The dye goes into the texture itself, so when one of them turns, the dead body still wears the same clothes.
const DYED = new Map(), imgId = new WeakMap(); let imgN = 0;
function dye(src, mode, colA, colB, geo = null) {
  const map = src.map; if (!map || !map.image || !map.image.width) return src;
  const im = map.image; if (!imgId.has(im)) imgId.set(im, ++imgN);
  const key = imgId.get(im) + ':' + mode + ':' + colA + ':' + colB;
  let tex = DYED.get(key);
  if (!tex) {
    const sz = Math.min(im.width, 512), cv = document.createElement('canvas'); cv.width = cv.height = sz;
    const g2 = cv.getContext('2d', { willReadFrequently: true }); g2.drawImage(im, 0, 0, sz, sz);
    const D = g2.getImageData(0, 0, sz, sz), d = D.data;
    // where the torso is in the texture: fill the UV triangles that sit between the waist and the shoulders
    let mask = null;
    if (mode === 0 && geo) {
      const mc = document.createElement('canvas'); mc.width = mc.height = sz; const mg = mc.getContext('2d'); mg.fillStyle = '#fff';
      geo.computeBoundingBox(); const y0 = geo.boundingBox.min.y, yh = geo.boundingBox.max.y - y0;
      const pa = geo.attributes.position, ua = geo.attributes.uv, ix = geo.index, nt = ix ? ix.count / 3 : pa.count / 3;
      for (let t = 0; t < nt; t++) {
        const i0 = ix ? ix.getX(t * 3) : t * 3, i1 = ix ? ix.getX(t * 3 + 1) : t * 3 + 1, i2 = ix ? ix.getX(t * 3 + 2) : t * 3 + 2;
        const yb = ((pa.getY(i0) + pa.getY(i1) + pa.getY(i2)) / 3 - y0) / yh;
        if (yb < 0.5 || yb > 0.85) continue;
        mg.beginPath(); mg.moveTo(ua.getX(i0) * sz, ua.getY(i0) * sz); mg.lineTo(ua.getX(i1) * sz, ua.getY(i1) * sz); mg.lineTo(ua.getX(i2) * sz, ua.getY(i2) * sz); mg.closePath(); mg.fill();
      }
      mask = mg.getImageData(0, 0, sz, sz).data;
    }
    const A = new THREE.Color(colA), Bc = new THREE.Color(colB);   // hex in sRGB: work in the texture's own (sRGB) bytes
    const ar = A.getHex() >> 16 & 255, ag = A.getHex() >> 8 & 255, ab = A.getHex() & 255, br = Bc.getHex() >> 16 & 255, bg = Bc.getHex() >> 8 & 255, bb2 = Bc.getHex() & 255;
    const sm = (e0, e1, x) => { const k = clamp((x - e0) / (e1 - e0), 0, 1); return k * k * (3 - 2 * k); };
    for (let p = 0; p < d.length; p += 4) {
      const r = d[p], g = d[p + 1], b = d[p + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b), dl = mx - mn, sat = mx ? dl / mx : 0;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      let hue = 0; if (dl > 0) { hue = mx === r ? ((g - b) / dl + 6) % 6 : mx === g ? (b - r) / dl + 2 : (r - g) / dl + 4; hue /= 6; }
      if (mode === 0) {
        if (sat > 0.45 && hue > 0.1 && hue < 0.2 && mx > 110) { const k = clamp(lum / 185, 0.3, 1.25); d[p] = ar * k; d[p + 1] = ag * k; d[p + 2] = ab * k; }
        else if (mask && mask[p + 3] > 128 && lum < 62 && sat < 0.6) { const k = clamp(lum / 30, 0.5, 1.6), w = sm(62, 38, lum); d[p] = lerp(r, br * k, w); d[p + 1] = lerp(g, bg * k, w); d[p + 2] = lerp(b, bb2 * k, w); }
      } else {
        const k = 0.5 + 0.5 * clamp(lum / 80, 0, 1.9), keep = sm(150, 205, lum) * (1 - sat), w = 0.85 * (1 - keep);
        d[p] = lerp(r, ar * k, w); d[p + 1] = lerp(g, ag * k, w); d[p + 2] = lerp(b, ab * k, w);
      }
    }
    g2.putImageData(D, 0, 0);
    tex = new THREE.CanvasTexture(cv); tex.colorSpace = map.colorSpace; tex.flipY = map.flipY; tex.wrapS = map.wrapS; tex.wrapT = map.wrapT; tex.anisotropy = map.anisotropy;
    DYED.set(key, tex);
  }
  const m = src.clone(); m.map = tex; return m;
}
function dress(s, seed, body) {
  const saved = [], top = TOPS[(seed * 7 + 3) % TOPS.length], bot = BOTTOMS[(seed * 5 + 1) % BOTTOMS.length];
  s.root.traverse(o => {
    if (!o.isMesh || !o.material) return;
    if (body === 'michelle') {
      o.userData.mat0 = o.material; o.material = dye(o.material, 0, bot, top, o.geometry);
    } else {
      const slot = slotOf(o), nm = (o.name + o.material.name).toLowerCase();
      if (nm.includes('headwear')) { o.visible = seed % 3 === 0; o.userData.hat = true; }
      if (slot === 'hair') { const m = o.material.clone(); m.color.lerp(new THREE.Color(HAIR[seed % HAIR.length]), 0.55); o.material = m; }
      else if (slot === 'cloth' && !nm.includes('footwear')) { o.userData.mat0 = o.material; o.userData.bottom = nm.includes('bottom'); o.material = dye(o.material, 1, nm.includes('bottom') ? bot : top, top); }
    }
    saved.push([o, o.material, o.visible]);   // what they wear today (restore() puts it back after the dead are done with the body)
  });
  // a hairstyle of her own (hair.js, when it's there)
  // (her skin tone goes into the texture we just dyed; we dye the clothes ourselves, so clothes: false)
  if (body === 'michelle' && HAIRS && HAIRS.styleFemale) {
    try { HAIRS.styleFemale(s, seed, { clothes: false }); for (const e of saved) e[1] = e[0].material; } catch (e) { console.warn('hair', e); }
  }
  return saved;
}

// a paramedic's uniform: navy trousers, a pale blue-white shirt (dyed from the same undyed cloth, so folds and seams stay)
const MED_TOP = 0xdce6ef, MED_BOT = 0x1b2744;
const BEN_TOP = 0x2f4f6f, BEN_BOT = 0x2a3550;   // Ben: the same slate-blue hoodie and dark jeans every time, so you know him from across the street
function uniformOn(u, TOP = MED_TOP, BOT = MED_BOT) {
  for (const [o] of u.look) {
    const m0 = o.userData.mat0;
    if (o.userData.hat) o.visible = false;
    if (!m0) continue;
    const tone = u.s.look && u.s.look.tone;   // her own skin (hair.js) kept under the uniform
    if (u.body === 'michelle' && tone && HAIRS && HAIRS.toneMaterial && o.isSkinnedMesh) { try { o.material = HAIRS.toneMaterial(m0, tone, [TOP, BOT], o.geometry, o.skeleton); continue; } catch (e) { /* fall through to the plain dye */ } }
    o.material = u.body === 'michelle' ? dye(m0, 0, BOT, TOP, o.geometry) : dye(m0, 1, o.userData.bottom ? BOT : TOP, TOP);
  }
  u.uniform = true;
}
let HAIRS = null;   // js/hair.js (another engineer's): styleFemale(soldier, seed). Loaded if it's there; nobody breaks if it isn't.

const pend = [];
// ---------------------------------------------------------------- making them (once, while loading)
// who's who: Dale, Gary, Raj, Linda, Deb, Tom, Jesse, Morgan, the couple on the lawn, the gardener, then the walkers
const BODIES = ['coach', 'butler', 'human', 'michelle', 'michelle', 'coach', 'butler', 'michelle', 'michelle', 'butler', 'michelle', 'michelle', 'coach', 'michelle', 'human', 'michelle', 'butler', 'michelle', 'coach'];
export async function makePeople(ctx, n = 19, tick = null) {
  X = ctx;
  if (!HAIRS) HAIRS = await import('./hair.js').catch(() => null);
  for (let i = 0; i < n; i++) {
    makeOne(i);
    if (tick && i % 4 === 3) await tick();
  }
  // Dale always wears the orange work vest
  vestOn(PPL.list[0].s); PPL.list[0].daleBody = true;
  C.npcs = [];
}
function makeOne(i, body = BODIES[i % BODIES.length]) {
  const kind = X.KINDS[body] || X.KINDS.human;
  const s = new Soldier(kind, X.scene, { clone: true, onStep: X.onStep });
  s.update(1 / 60, {});
  const look = dress(s, i * 5 + 3, body);
  s.setVisible(false);
  // nobody is quite the same size: a little taller or shorter, a little broader or slighter
  const hk = rnd(0.95, 1.05), bk = hk * rnd(0.97, 1.06), scl = V(bk, hk, bk * rnd(0.98, 1.04));
  s.root.scale.copy(scl);
  // team 3: not the player's side, so a stray shot or a blast of yours really hurts them (and they react to it)
  const u = { s, npc: true, team: 3, scl, sizeK: (hk + bk) / 2, id: 9000 + i, i, body, kind0: kind, look, hp: 100, maxHp: 100, alive: false, active: false, hidden: true, kills: 0, deaths: 0, name: '', role: 'walker', st: 'off', doorsOpen: [] };
  u.pers = persona(i); PPL.list.push(u); sayOn(u); u.pace = pace;
  return u;
}
// a person the dead turned goes back to being a person for the next run
function restore(u) {
  if (u.zu) {
    const z = u.zu; z.active = false; z.alive = false;
    for (const arr of [Z.pool, Z.list, C.units]) { const k = arr.indexOf(z); if (k >= 0) arr.splice(k, 1); }
    if (z.corpse) { const k = X.world.containers.indexOf(z.corpse); if (k >= 0) X.world.containers.splice(k, 1); }
    const s = u.s;
    for (const n of ['idle', 'walk']) { s.A[n].stop(); s.A[n] = s.mixer.clipAction(u.kind0.clips[n]); s.A[n].play(); }
    s.kind = u.kind0; s.vw = u.kind0.vw;
    for (const [o, m, v] of u.look) { o.material = m; o.visible = v; }
    s.root.scale.copy(u.scl);
    u.zu = null;
  }
  if (u.s.zTurn) {   // went down (greying) but never got up: back to their own clothes and colour
    if (!u.zu) for (const [o, m, v] of u.look) { o.material = m; o.visible = v; }
    u.s.zTurn = null; u.s.keepLook = false; u.s.spasm = 0;
  }
  if (u.uniform) { if (!u.zu) for (const [o, m, v] of u.look) { o.material = m; o.visible = v; } u.uniform = false; }
  if (u.bag) { if (u.bag.parent) u.bag.parent.remove(u.bag); u.bag = null; }
  if (u.mel) { u.mel.hideAll(); }
  u.s.dead = false; u.s.resetActs(); u.s.lookAt = null; u.s.fly = null; u.s.animLod = false;
  if (u.phone) u.phone.visible = false;
}

// ---------------------------------------------------------------- the day's cast
// sidewalks: Main St runs east–west (z = ±5), Maple Ave north–south (x = ±5)
const LINES = [['x', -5.1, -98, -9], ['x', -5.1, 9, 34], ['x', 5.1, -98, -9], ['x', 5.1, 9, 98], ['z', -5.1, -98, -9], ['z', 5.1, 9, 98], ['z', -5.1, 9, 98], ['z', 5.1, -98, -9], ['x', -5.1, 36, 98], ['x', 5.1, -60, -9]];
const linePos = (L, a) => L[0] === 'x' ? [a, L[1]] : [L[1], a];
const GREET = ['Morning!', 'Beautiful day, huh?', 'Hey, neighbour.', 'Nice out today.', 'Hi there!', 'You hear the Quick Stop\'s doing burgers today?', 'Lovely weather for November.', 'Morning. Em and the kids away?'];
const SMALL = [['Raj gets the meat cheap from some new supplier. Two-dollar burgers, can you believe it?', 'Don\'t tell my doctor.'], ['Saw a truck I didn\'t recognise outside the Quick Stop this morning. No markings on it.', 'Probably nothing.'], ['My kid\'s got a game at two. You should come watch.'], ['Have a good one!'], ['I\'m off to get a burger before they run out.']];
const PANIC = ['RUN!', 'Get inside! GET INSIDE!', 'Oh God, oh God...', 'Somebody help!', 'They\'re eating him!', 'Don\'t let it bite you!', 'Call 911!', 'Where do we go?!'];
const DALE = ['Morning, Sam! Em and the kids get off to Ridgefield all right?', 'Linda walked down to the Quick Stop — Raj fires up the grill on Saturdays. Two-dollar burgers. I\'m holding out for one.', 'This old girl\'s running on fumes. There\'s a can of gas in the Hendersons\' shed — I\'ll fill her up after lunch.'];
export const SURVIVOR_LINES = {
  Jesse: ['I was RIGHT THERE. Gary bought a burger off Raj\'s grill, took two bites and started shaking.', 'He went down. Raj tried to help him. Then Gary got back up... and bit him. In the neck.', 'Morgan and me ran. Everybody else — I don\'t know. I don\'t want to know.', 'Stay off Main Street. It\'s where they all are.'],
  Morgan: ['Radium and CO2. That\'s what the TV said. Who puts radium in a hamburger?', 'That meat came off a truck this morning. No markings. Raj said it was a deal he couldn\'t pass up.', 'I\'m grabbing what I can and getting out. You should too.', 'Once they get hold of you, that\'s it. Don\'t let them grab you.'],
  other: ['Found a crowbar. Better than nothing.', 'Don\'t let them grab you. Once they grab you...', 'I keep hearing gunshots out past the fence.', 'You got any water? Never mind. Keep it.', 'They can\'t see well in the dark. Neither can we.'],
};
function reset(u, role, name, x, z, yaw, st, extra = {}) {
  restore(u);
  if (u.inHouse) { if (u.inHouse.occupied === u) u.inHouse.occupied = null; u.inHouse = null; }
  Object.assign(u, { role, name, st, alive: true, active: true, hidden: false, gone: false, hp: 100, maxHp: 100, hpSeen: 100, lastHitT: null, hitSeenT: null, downAt: 0, turnAt: 0, doomed: false, bubble: null, greetT: 0, talkI: 0, t: rnd(0.5, 4), path: null, pi: 0, goal: null, home: null, threat: null, safe: null, swingT: 0, weapon: null, found: 0, stuckT: 0, lastP: V(x, 0, z), side: null, lineT: 0, enter: null, exit: null, inHouse: null, doorsOpen: [], visitT: 0, errand: null, group: null, partner: null, trip: null, holdT: 0, held: null, plan: null, prey: false, chased: false, infectAt: 0, sickSaid: false, amb: null, rode: false, called: false, med: null, target: null, hostile: false, revenge: false, distrust: false, hitByMe: 0, angry: 0, left: false, limp: 0, bleed: 0, stag: null, stagT: 0, koUp: false, heli: null, boarded: false, fistsOnly: false }, extra);
  u.pers = { ...persona(u.i), ...(CAST_P[name] || {}) }; u.h = null; u.paceK = 0; u.runK = 0; u.flock = null; u.flockF = null; u.bonds = []; u.said = null;
  u.s.place(x, z, yaw); u.s.setVisible(true);
  if (role === 'bro') uniformOn(u, BEN_TOP, BEN_BOT);
}
// ---------------------------------------------------------------- things in their hands
// Gary's burger from Raj's grill (a real one: bun, patty, cheese, lettuce, in its paper), and Raj's spatula
function burgerMesh() {
  const g = new THREE.Group(), M = (color, r = 0.6) => new THREE.MeshStandardMaterial({ color, roughness: r });
  const bun = M(0xc8843a, 0.55), add = (geo, m, y, ry = 0) => { const o = new THREE.Mesh(geo, m); o.position.y = y; o.rotation.y = ry; o.castShadow = true; g.add(o); return o; };
  add(new THREE.SphereGeometry(0.056, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.62, 1), bun, 0.021);           // top bun
  add(new THREE.CylinderGeometry(0.055, 0.05, 0.02, 16), bun, -0.017);                                                    // bottom bun
  add(new THREE.CylinderGeometry(0.058, 0.057, 0.017, 16), M(0x4a2a18, 0.85), 0);                                          // the patty
  add(new THREE.BoxGeometry(0.088, 0.003, 0.088), M(0xf2b021, 0.45), 0.01, 0.6);                                           // a cheese slice, corners hanging out
  add(new THREE.CylinderGeometry(0.062, 0.062, 0.004, 9), M(0x5f9e34, 0.7), 0.014, 0.3);                                   // lettuce, ragged edge
  const paper = add(new THREE.CylinderGeometry(0.061, 0.057, 0.045, 18, 1, true, 0, Math.PI * 1.1), new THREE.MeshStandardMaterial({ color: 0xece4d4, roughness: 0.9, side: THREE.DoubleSide }), -0.012);   // the paper it came wrapped in
  void paper; return g;
}
function spatulaMesh() {
  const g = new THREE.Group(), steel = new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.3, metalness: 0.85 });
  const h = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.16, 8), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 })); h.position.y = 0.02; g.add(h);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.09, 0.004), steel); neck.position.y = 0.14; g.add(neck);
  const bl = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.002), steel); bl.position.set(0, 0.235, 0.012); bl.rotation.x = 0.25; g.add(bl);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
// Ben's coffee: a white ceramic mug with a handle, coffee in it
function mugMesh() {
  const g = new THREE.Group(), cer = new THREE.MeshStandardMaterial({ color: 0xf1efe9, roughness: 0.35 });
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.1, 16, 1, true), cer); cer.side = THREE.DoubleSide; g.add(cup);
  const base = new THREE.Mesh(new THREE.CircleGeometry(0.035, 16), cer); base.rotation.x = Math.PI / 2; base.position.y = -0.05; g.add(base);
  const cof = new THREE.Mesh(new THREE.CircleGeometry(0.037, 16), new THREE.MeshStandardMaterial({ color: 0x2b1608, roughness: 0.15 })); cof.rotation.x = -Math.PI / 2; cof.position.y = 0.035; g.add(cof);
  const hd = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.007, 8, 14, Math.PI), cer); hd.rotation.z = -Math.PI / 2; hd.position.x = 0.04; g.add(hd);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
// hold a thing in the right hand (the hand bones are not always at 1:1 scale, so undo theirs)
const sclV = V();
function hold(u, mesh, off, rot, hand = 'RightHand') {
  const hb = u.s.B[hand]; if (!hb) return null;
  hb.updateWorldMatrix(true, false); hb.getWorldScale(sclV);
  hb.add(mesh); mesh.scale.set(1 / sclV.x, 1 / sclV.y, 1 / sclV.z); mesh.position.set(off[0] / sclV.x, off[1] / sclV.y, off[2] / sclV.z); mesh.rotation.set(...rot);
  return mesh;
}
// put it down (or let it fall) where it is now
function letGo(mesh, onto = null) {
  if (!mesh || !mesh.parent) return;
  const p = V(); mesh.getWorldPosition(p); const W = X.world;
  mesh.parent.remove(mesh); X.scene.add(mesh); mesh.scale.setScalar(1);
  if (onto) { mesh.position.copy(onto.p); mesh.rotation.set(...onto.r); return; }
  const gy = W.groundY ? W.groundY(p.x, p.z) : 0;
  mesh.position.set(p.x, gy + 0.035, p.z); mesh.rotation.set(rnd(-0.25, 0.25), rnd(0, 6.28), rnd(2.6, 3.4));   // it lands bun-down, the way dropped food always does
}
function clearProps() { PPL.camOn = null; for (const k of ['burger', 'spatula', 'mic', 'cam', 'benMug']) { const m = PPL[k]; if (m && m.parent) m.parent.remove(m); PPL[k] = null; } }

// everybody in their place, 10:30 on a Saturday morning
export function castCalm() {
  const W = X.world, L = PPL.list;
  for (const u of L) { restore(u); u.active = false; u.alive = false; u.hidden = true; u.gone = true; u.s.setVisible(false); }
  for (const h of W.houses) h.occupied = null;
  for (const D of W.doors) D.locked = false;
  clearProps(); pend.length = 0;
  PPL.cast = {}; PPL.phase = 'calm'; PPL.talker = null; PPL.talkT = 0; PPL.flockAt = 0;
  let k = 0; const next = () => L[k++];
  // Dale, washing his pickup on the driveway of 68 Main
  const T = W.truck;
  { const u = next(); reset(u, 'dale', 'DALE', T.x + 1.45, T.z + 0.4, -Math.PI / 2, 'kneel'); PPL.cast.dale = u; }
  // at the Quick Stop: Raj inside at his grill with two in line for a burger (Jesse and Morgan); out front, Gary with his
  // burger, his wife Linda, Tom and Deb, stood round talking
  const mk = (role, name, x, z, yaw, st, extra) => { const u = next(); reset(u, role, name, x, z, yaw, st, extra); PPL.cast[name.toLowerCase()] = u; return u; };
  const gary = mk('market', 'GARY', 22.3, -8.7, 0, 'eat');
  const raj = mk('market', 'RAJ', 13.42, -16.75, -Math.PI / 2, 'grill');
  const linda = mk('market', 'LINDA', 21.25, -7.85, 0, 'stand');
  const deb = mk('market', 'DEB', 21.0, -9.75, 0, 'stand');
  const tom = mk('market', 'TOM', 23.35, -7.95, 0, 'stand');
  const face = (u, x, z) => { u.s.yaw = u.s.aimYaw = u.s.moveA = Math.atan2(x - u.s.pos.x, z - u.s.pos.z); u.s.pivot.rotation.y = u.s.yaw; };
  const grp = [gary, linda, deb, tom], cx = grp.reduce((a, u) => a + u.s.pos.x, 0) / 4, cz = grp.reduce((a, u) => a + u.s.pos.z, 0) / 4;
  for (const u of grp) { u.group = grp; u.gc = { x: cx, z: cz }; face(u, cx, cz); }
  const jesse = mk('market', 'JESSE', 14.35, -15.65, 0, 'queue');
  const morgan = mk('market', 'MORGAN', 14.15, -14.75, 0, 'queue');
  face(jesse, raj.s.pos.x, raj.s.pos.z); face(morgan, raj.s.pos.x, raj.s.pos.z);
  PPL.burger = hold(gary, burgerMesh(), [0.0, 0.085, 0.035], [0.25, 0, 1.4]);
  PPL.spatula = hold(raj, spatulaMesh(), [0.0, 0.07, 0.02], [1.3, 0, 0]);
  bond(gary, linda); bond(deb, tom); bond(jesse, morgan); bond(gary, tom); bond(PPL.cast.dale, linda);
  raj.s.playUp('Interact', { loop: true, rate: 0.7, fade: 0.01 });
  // a couple chatting on a lawn, somebody weeding a flower bed
  { const u = next(); reset(u, 'chat', '', -22.0, 10.2, 1.5, 'chat'); const v = next(); reset(v, 'chat', '', -20.7, 10.3, -1.6, 'chat'); u.partner = v; v.partner = u; bond(u, v); }
  { const u = next(); reset(u, 'garden', '', 44.5, 10.6, 0, 'kneel'); }
  // your brother Ben, next door: out on his porch with a coffee, phone in hand
  { const h = benHouse(), pb = (X.P() && X.P().body) || 'human', u = L.slice(k).find(v => v.body !== 'michelle' && v.body !== pb) || L.slice(k).find(v => v.body !== 'michelle') || next();
    if (h && u) { const w = doorway(h), dx = w.out[0] - w.D.x, dz = w.out[1] - w.D.z, x = w.D.x + dx * 1.5, z = w.D.z + dz * 1.5;   // a step down off the porch, on his front path
      reset(u, 'bro', 'BEN', W.walkable(x, z) ? x : w.out[0], W.walkable(x, z) ? z : w.out[1], w.yawOut, 'stand', { own: h, t: rnd(2, 5) }); PPL.cast.ben = u;
      PPL.benMug = hold(u, mugMesh(), [0.0, 0.06, 0.035], [0, 0, 0], 'LeftHand'); } }   // coffee in his left hand (the phone goes in the right)
  // the rest are out and about: a walk round the block, the mail, a neighbour's door, the store
  let li = 0;
  for (const u of L) {
    if (u.active || u.extra) continue;
    const Ln = LINES[li++ % LINES.length], a = rnd(Ln[2], Ln[3]);
    const [x, z] = linePos(Ln, a);
    reset(u, 'walker', '', x, z, Ln[0] === 'x' ? Math.PI / 2 : 0, 'walk', { line: Ln, t: rnd(0, 6) });
  }
  for (const u of L) if (u.active && u.st === 'kneel') u.s.play('Fixing_Kneeling', { loop: true, fade: 0.01, snap: true, rate: rnd(0.8, 1.05) });
  syncList();
}
// who's out there (C.npcs, for the dead to find), and who a bullet can hit (C.units)
function syncList() {
  C.npcs = PPL.list.filter(u => u.active && u.alive && !u.gone);
  for (const u of PPL.list) { const on = u.active && !u.gone && !u.zu, k = C.units.indexOf(u); if (on && k < 0) C.units.push(u); else if (!on && k >= 0) C.units.splice(k, 1); }
}

// ---------------------------------------------------------------- noon
// everybody hears it at once. The market people play out what the TV shows; the rest panic — and not in an orderly
// way: each does whatever their own fear tells them (see panic() below). Some of them, more the harder it is, are the
// ones that won't make it: slower, clumsier, running the wrong way.
export function outbreakBegins() {
  PPL.phase = 'outbreak'; PPL.sent = 0; PPL.bitten = PPL.bitten || 0;
  const share = clamp(0.35 + 0.1 * Math.log2(Math.max(0.1, (ZD.cur && ZD.cur.count) || 1)), 0.2, 0.6);
  const W = X.world;
  for (const u of PPL.list) {
    if (!u.active || u.gone || u.role === 'market') continue;
    if (u.role === 'dale') continue;   // main.js sends Dale off to find Linda
    if (u.role === 'bro') { if (PPL.benMug && PPL.benMug.parent && PPL.benMug.parent !== X.scene) letGo(PPL.benMug); if (!u.called) { if (u.s.act) u.s.stopAct(0.4); u.st = 'lockup'; u.t = rnd(1.5, 3); u.path = null; if (u.own && u.own.front && !u.own.front.broken && !taken(u.own, u)) enterHouse(u, u.own); } continue; }   // Ben: inside, door locked, phone in hand
    if (u.s.act) u.s.stopAct(0.4);
    u.s.lookAt = null; u.errand = null; u.holdT = 0; u.path = u.enter ? u.path : null;   // (someone halfway in at a neighbour's stays and goes in)
    // "their" house: the one they were nearest this morning
    let bd = 1e9; for (const h of W.houses) { if (h.store || h === X.G.home || !h.front) continue; const d = Math.hypot(h.x - u.s.pos.x, h.z - u.s.pos.z); if (d < bd) { bd = d; u.own = h; } }
    u.prey = Math.random() < share; u.plans = 0; u.plan = null; u.chased = false; u.pursueT = 0; u.trip = null; u.windT = 0;
    if (u.enter) { u.st = 'home'; u.t = 0; continue; }
    u.st = 'panic'; u.t = rnd(0, 1.2);   // a beat of "what?" first
  }
  PPL.flockAt = (C.t || 0) + 1.3;   // (not later2: the market cut clears those)
  for (const u of PPL.list) if (u.st === 'down' && u.turnAt === Infinity && !u.zu && Math.random() < 0.6) { startTurning(u.s, (u.i % 4) + 4 * Math.floor(Math.random() * 3)); u.turnAt = C.t + rnd(40, 100); }   // the ones killed this morning: it's in them now too
}
// the TV crew on Main Street: the reporter with her microphone, Danny with the camera on his shoulder (the live feed is
// his camera, at N.cam in main.js). Two of the morning's walkers, quietly recast.
function camMesh() {
  const g = new THREE.Group(), M = (color, r = 0.5, m = 0) => new THREE.MeshStandardMaterial({ color, roughness: r, metalness: m });
  const add = (geo, m, x, y, z, rx = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.x = rx; o.castShadow = true; g.add(o); return o; };
  const body = M(0x26282b, 0.45, 0.3), black = M(0x0b0b0c, 0.6);
  add(new THREE.BoxGeometry(0.13, 0.17, 0.34), body, 0, 0, 0);                                     // the body
  add(new THREE.CylinderGeometry(0.045, 0.05, 0.16, 18), black, 0, 0.01, 0.24, Math.PI / 2);       // the lens
  add(new THREE.CylinderGeometry(0.052, 0.052, 0.015, 18), M(0x3a4a66, 0.1, 0.6), 0, 0.01, 0.322, Math.PI / 2);   // its glass
  add(new THREE.BoxGeometry(0.06, 0.045, 0.07), black, -0.085, 0.04, 0.06);                         // the viewfinder
  add(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 8), black, 0.035, 0.11, 0.12, Math.PI / 2);    // the shotgun mic
  add(new THREE.BoxGeometry(0.03, 0.05, 0.12), body, 0, 0.11, -0.03);                               // the handle
  add(new THREE.BoxGeometry(0.11, 0.09, 0.05), M(0x1d1d1d, 0.7), 0, -0.01, -0.19);                  // the battery
  add(new THREE.SphereGeometry(0.008, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 }), 0.066, 0.06, 0.15);   // tally light: live
  return g;
}
function micMesh() {
  const g = new THREE.Group(), add = (geo, m, y) => { const o = new THREE.Mesh(geo, m); o.position.y = y; o.castShadow = true; g.add(o); return o; };
  add(new THREE.CylinderGeometry(0.014, 0.011, 0.2, 12), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.4 }), 0.02);
  add(new THREE.SphereGeometry(0.027, 14, 10), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.9 }), 0.135);   // the foam
  add(new THREE.BoxGeometry(0.055, 0.045, 0.055), new THREE.MeshStandardMaterial({ color: 0xd8dde3, roughness: 0.5 }), 0.085);   // the station flag
  return g;
}
export function newsCrew() {
  if (!X || PPL.cast.danny) return;
  const P = X.P(), far = u => P ? -u.s.pos.distanceTo(P.s.pos) : 0;
  const pool = PPL.list.filter(u => u.active && u.alive && !u.gone && u.role === 'walker' && !u.enter && !u.exit && !(u.h && u.h.ovr)).sort((a, b) => far(a) - far(b));
  const rep = pool.find(u => u.body === 'michelle') || pool[0], dan = pool.find(u => u !== rep && u.body !== 'michelle') || pool.find(u => u !== rep);
  if (!rep || !dan) return;
  const look = (u) => { u.s.yaw = u.s.aimYaw = u.s.moveA = Math.atan2(21.2 - u.s.pos.x, -8.6 - u.s.pos.z); u.s.pivot.rotation.y = u.s.yaw; };
  reset(rep, 'market', 'REPORTER', 10.85, 5.35, 0, 'stand'); look(rep); PPL.cast.reporter = rep;
  reset(dan, 'market', 'DANNY', 11.48, 6.02, 0, 'stand', { doomed: true }); look(dan); PPL.cast.danny = dan;
  for (const u of [rep, dan]) { u.s.resetActs(); u.s.lookAt = null; u.s.setVisible(true); }
  PPL.mic = hold(rep, micMesh(), [0.0, 0.06, 0.02], [0.2, 0, 0]);
  if (!PPL.cam || !PPL.cam.parent) { PPL.cam = camMesh(); X.scene.add(PPL.cam); }
  PPL.camOn = dan;
  bond(rep, dan); syncList();
}
// the camera rides his shoulder; the pose holds it there
function newsStep(u) {
  if (u.h) setPose(u, u === PPL.camOn ? 'camop' : 'mic', 1);
  if (u !== PPL.camOn || !PPL.cam) return;
  const S = u.s, hb = S.B.Head; if (!hb) return;
  hb.getWorldPosition(tmp); const sy = Math.sin(S.yaw), cy = Math.cos(S.yaw);
  PPL.cam.position.set(tmp.x - cy * 0.16 + sy * 0.06, tmp.y - 0.08, tmp.z + sy * 0.16 + cy * 0.06);   // on the right shoulder, beside his face
  PPL.cam.rotation.set(0, S.yaw, 0);
  const z = nearestZombie(u, 1.6); if (z) newsDrop(z);
}
// it got to them: the camera hits the pavement, and so does Danny
export function newsDrop(by = null) {
  const u = PPL.camOn; if (!u) return;
  PPL.camOn = null;
  if (PPL.cam) { const m = PPL.cam, sy = Math.sin(u.s.yaw), cy = Math.cos(u.s.yaw), x = u.s.pos.x - cy * 0.45 + sy * 0.35 + rnd(-0.15, 0.15), z = u.s.pos.z + sy * 0.45 + cy * 0.35 + rnd(-0.15, 0.15), gy = X.world.groundY ? X.world.groundY(x, z) : 0; m.position.set(x, gy + 0.085, z); /* off his right shoulder, a step ahead, on its side */ m.rotation.set(0, rnd(0, 6.28), Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1)); X.SND.bodyFall && X.SND.bodyFall(m.position, 0.4); }
  if (u.alive && !u.gone) { if (u.h) u.h.pz = null; hurtNPC(u, u.hp + 1, by && by.z ? by : null); }
  const r = PPL.cast.reporter;
  if (r && r.alive && !r.gone) { letGo(PPL.mic); PPL.mic = null; r.doomed = false; r.st = 'flee'; r.t = 0; r.threat = by; r.path = null; if (r.h) r.h.pz = null; r.say(['DANNY! No — NO!', 'Oh my God, Danny!'], 2.4); scream(r, 1); }
}
// pieces of the scene at the Quick Stop (main.js times them)
export function marketBeat(n) {
  const c = PPL.cast, W = X.world;
  if (n === 'sick') { newsCrew(); const g = c.gary; g.st = 'sick'; letGo(PPL.burger); PPL.burger = null; g.t = rnd(2.4, 3.2); g.s.playUp('Hit_Chest', { rate: 0.55, fade: 0.25, fadeAt: 1.1, fadeOut: 0.7 }); setPose(g, 'wound', 30); if (!vox(g, 'cough', { pri: 2 })) X.SND.cough && X.SND.cough(g.s.pos, false); later2(() => g.alive && g.st === 'sick' && vox(g, 'cough', { pri: 2 }), 2.6); later2(() => g.alive && g.st === 'sick' && vox(g, 'cough', { pri: 2 }), 5.2); for (const k of ['linda', 'raj', 'deb', 'tom', 'jesse', 'morgan']) { const u = c[k]; if (u && u.alive) u.s.lookAt = V(g.s.pos.x, 1.2, g.s.pos.z); } c.linda.say('Gary? Gary, are you okay?', 3); }
  if (n === 'help') { const r = c.raj; if (r.s.up) r.s.ups[r.s.up].target = 0; r.s.up = null; letGo(PPL.spatula, { p: V(12.78, 0.935, -16.35), r: [-Math.PI / 2, 0, 0.4] }); r.st = 'goto'; r.path = null; r.goal = { x: c.gary.s.pos.x - 0.9, z: c.gary.s.pos.z - 0.4, then: 'kneel' }; r.say('Somebody call an ambulance!', 3); c.deb.say('Is he choking?!', 2.5); }
  if (n === 'fall') { const g = c.gary; g.s.resetActs(); g.s.play('Death_D', { hold: true, fade: 0.15, rate: 0.8 }); g.st = 'collapsed'; X.SND.bodyFall(g.s.pos, 0.8, (X.SND.DEATH_HIT || 1.2) / 0.8); c.tom.say('Oh my God...', 3); }   // the thud lands when he actually hits the pavement
  if (n === 'help' && X.SND.crowd) X.SND.crowd(c.gary.s.pos, false, 0.8);   // the market crowd murmurs, turning
  if (n === 'turn' && X.SND.crowd) X.SND.crowd(c.gary.s.pos, true, 1);   // ...then everybody screams
  if (n === 'turn') {
    const g = c.gary; turn(g, { runner: true, now: true, state: 'chase', tgt: c.raj });
    for (const k of ['linda', 'deb', 'tom']) { const u = c[k]; u.doomed = true; }
    c.raj.doomed = true;
    later2(() => { for (const k of ['jesse', 'morgan', 'tom', 'deb']) { const u = c[k]; if (u && u.alive && !u.downAt) { u.st = 'flee'; u.t = 0; u.s.lookAt = null; } } c.jesse.st = 'escape'; c.jesse.goal = { x: 64, z: -5.2 }; c.morgan.st = 'escape'; c.morgan.goal = { x: -5.4, z: -50 }; c.morgan.say('RUN!', 2); c.deb.say((PANIC), 2); scream(c.deb, 1); }, 1.2);
    later2(() => { const u = c.linda; if (u.alive && !u.downAt) { u.st = 'flee'; u.say('GARY, NO!', 2); } }, 3.2);
  }
}
function later2(fn, t) { pend.push({ t: (C.t || 0) + t, fn }); }
// cut to the end of it: whoever was going to die there has
export function marketAftermath() {
  const c = PPL.cast;
  for (const k of ['gary', 'raj', 'linda', 'deb', 'tom']) { const u = c[k]; if (!u || u.gone) continue; if (u.alive || u.downAt) turn(u, { now: true, standing: !u.downAt, state: 'idle' }); }
  for (const k of ['jesse', 'morgan']) { const u = c[k]; if (u && u.alive) { u.s.lookAt = null; u.s.resetActs(); } }
  if (PPL.camOn) newsDrop(null);   // the feed went down: the crew didn't get out
  const r = c.reporter; if (r && r.alive && !r.gone) { r.role = 'walker'; r.name = ''; r.st = 'panic'; r.t = 0; r.prey = false; r.plans = 0; r.plan = null; r.chased = false; r.pursueT = 0; r.trip = null; r.windT = 0; r.doomed = false; if (r.h) r.h.pz = null; letGo(PPL.mic); PPL.mic = null;
    let bd = 1e9; for (const h of X.world.houses) { if (h.store || h === X.G.home || !h.front) continue; const d = Math.hypot(h.x - r.s.pos.x, h.z - r.s.pos.z); if (d < bd) { bd = d; r.own = h; } } }
  pend.length = 0;
}
// the two who got away carry on, out of sight somewhere
export function becomeSurvivor(u, x, z) {
  if (!u || !u.alive) return;
  u.role = 'surv'; u.st = 'idle'; u.t = rnd(1, 3); u.path = null; u.goal = null; u.weapon = null; u.hp = u.maxHp = 100; u.doomed = false; u.s.lookAt = null;
  if (x != null) u.s.place(x, z, rnd(-3, 3));
  if (!u.mel) u.mel = new Melee(u.s, X.scene, X.SWINGS);
  u.mel.set('fists'); u.mel.hideAll();
}
// somebody who hid comes back out with a plan: out of the house they locked themselves in (front door opens, they step
// out, it shuts behind them), not out of thin air. Only if nobody's hiding anywhere do they turn up from somewhere unseen.
export function emerge(x, z) {
  const ok = v => v && v.gone && !v.zu && !v.downAt && !v.daleBody && !v.rode && v.role !== 'bro' && v.role !== 'medic' && !v.amb && !['GARY', 'RAJ', 'LINDA', 'DEB', 'TOM'].includes(v.name);
  const W = X.world, P = X.P(), cam = X.camera.position;
  let best = null, bd = 1e9;
  for (const h of W.houses) {
    const v = h.occupied, D = h.front; if (!D || D.broken || !ok(v) || v.inHouse !== h) continue;
    const dp = Math.hypot(D.x - P.s.pos.x, D.z - P.s.pos.z); if (dp < 16 || dp > 95) continue;
    const d = Math.hypot(D.x - x, D.z - z) + (W.los(cam, V(D.x, 1.5, D.z)) ? 60 : 0);   // rather a door you're not looking at
    if (d < bd) { bd = d; best = h; }
  }
  const u = best ? best.occupied : PPL.list.find(v => ok(v) && !v.inHouse);
  if (!u) return null;
  const keep = u.role === 'surv' && u.name;
  const names = (u.body === 'michelle' ? ['SARAH', 'MARIA', 'JENNA', 'KAYLA', 'PRIYA', 'ROSA'] : ['DEV', 'CASEY', 'RILEY', 'NICO', 'AVERY', 'QUINN']).filter(n => !PPL.list.some(v => v.name === n && v.active && !v.gone));
  const name = keep ? u.name : pick(names.length ? names : ['DEV']);
  if (best) { const w = doorway(best); reset(u, 'surv', name, w.inn[0], w.inn[1], w.yawOut, 'idle'); becomeSurvivor(u); leaveHouse(u, best); }
  else { reset(u, 'surv', name, x, z, rnd(-3, 3), 'idle'); becomeSurvivor(u); }
  syncList();
  return u;
}
// ---------------------------------------------------------------- going in and out of houses, properly
// the way in: a spot on the porch, the front door, and a spot just inside the hall
function doorway(h) {
  const D = h.front, ox = Math.sin(h.yaw), oz = Math.cos(h.yaw), W = X.world;
  let inn = null;
  for (const r of [1.25, 0.95, 1.6, 0.75]) { const ix = D.x - ox * r, iz = D.z - oz * r; if (W.walkable(ix, iz)) { inn = [ix, iz]; break; } }
  if (!inn) inn = [D.x - ox * 1.0, D.z - oz * 1.0];
  let out = [D.x + ox * 1.35, D.z + oz * 1.35];
  if (!W.walkable(...out)) out = [D.x + ox * 2.0, D.z + oz * 2.0];
  return { D, inn, out, yawOut: Math.atan2(ox, oz) };
}
// a house is taken while somebody is inside it, or on their way in
const taken = (h, u) => { const v = h.occupied; return !!v && v !== u && !v.zu && ((v.gone && v.inHouse === h) || (v.enter && v.enter.h === h)); };
function enterHouse(u, h) { const w = doorway(h); u.enter = { h, ...w, ph: 0, t: 0 }; h.occupied = u; go(u, ...w.out); }
// their hand goes to the door lever while it opens
function handOn(u, D) { u.handT = 0.001; u.handK = { getWorldPosition: o => X.world.doorHandle(D, u.s.pos.x, u.s.pos.z, o) }; }
const nobodyIn = D => { const P = X.P(); return Math.hypot(P.s.pos.x - D.x, P.s.pos.z - D.z) > 1.0; };
// inside, door shut and locked: gone from the street
function inside(u, h, pd, sound = true) {
  const D = h.front;
  if (D.want > 0.5 && !D.broken) { X.world.setDoor(D, false); if (sound && pd <= 25) X.SND.door('close', V(D.x, 1, D.z)); }
  D.locked = true; h.occupied = u; u.inHouse = h; u.enter = null; u.path = null; u.handT = 0;
  u.gone = true; u.hidden = true; u.s.setVisible(false); if (u.mel) u.mel.hideAll();
}
// one step of walking in. true once they're in.
function entering(u, dt, cmd, pd, speed) {
  const E = u.enter, S = u.s, D = E.D; E.t += dt;
  if (D.broken) { u.enter = null; u.path = null; return 'fail'; }   // smashed in: that's no place to hide
  if (E.ph === 0) {   // up the path to the porch
    const at = follow(u, speed, cmd, dt) || Math.hypot(E.out[0] - S.pos.x, E.out[1] - S.pos.z) < 0.55 || Math.hypot(D.x - S.pos.x, D.z - S.pos.z) < 1.3;
    if (!at) return false;
    if (!S.visible && pd > 25) { inside(u, E.h, pd); return true; }   // nobody saw them go in, but they did
    E.ph = 1; E.t = 0;
    if (D.want < 0.5) { X.world.setDoor(D, true); X.SND.door('open', V(D.x, 1, D.z)); handOn(u, D); }
  }
  if (E.ph === 1) {   // the door swings open
    cmd.face = Math.atan2(D.x - S.pos.x, D.z - S.pos.z);
    if ((E.t > 0.45 && D.open > 0.55) || E.t > 1.4) { E.ph = 2; E.t = 0; }
    return false;
  }
  // through the doorway and into the hall, then shut it behind them (not on top of you)
  if (E.ph === 2) {
    const dn = steer(u, E.inn[0], E.inn[1], S.vw * 1.05, cmd, dt);
    if ((dn || E.t > 5) && (nobodyIn(D) || E.t > 9)) {   // turn round and push it shut
      E.ph = 3; E.t = 0;
      if (D.want > 0.5) { X.world.setDoor(D, false); X.SND.door('close', V(D.x, 1, D.z)); handOn(u, D); }
    }
    return false;
  }
  cmd.face = Math.atan2(D.x - S.pos.x, D.z - S.pos.z);
  if (D.open < 0.25 || E.t > 1.5) { inside(u, E.h, pd, false); return true; }   // the door's shut: they're in
  return false;
}
// out of the house: door opens, they step onto the porch, it shuts behind them
function leaveHouse(u, h) {
  const w = doorway(h), D = w.D;
  D.locked = false; if (h.occupied === u) h.occupied = null; u.inHouse = null;
  u.s.place(w.inn[0], w.inn[1], w.yawOut); u.s.setVisible(true); u.gone = false; u.hidden = false;
  u.exit = { h, ...w, t: 0, st0: u.st };
  if (D.want < 0.5) { X.world.setDoor(D, true); X.SND.door('open', V(D.x, 1, D.z)); handOn(u, D); }
}
function exiting(u, dt, cmd) {
  const E = u.exit, S = u.s, D = E.D; E.t += dt;
  if (E.t < 0.6) { cmd.face = E.yawOut; return false; }
  const dn = steer(u, E.out[0], E.out[1], S.vw, cmd, dt);
  if (dn || E.t > 6) {
    if (!D.broken && D.want > 0.5 && nobodyIn(D)) { X.world.setDoor(D, false); X.SND.door('close', V(D.x, 1, D.z)); }
    u.exit = null; u.path = null; return true;
  }
  return false;
}
// one of the neighbours stops running and starts surviving
export function recruitSurvivor() {
  const u = PPL.list.find(v => v.active && v.alive && !v.gone && !v.amb && (v.role === 'walker' || v.role === 'chat' || v.role === 'garden') && v.st !== 'down');
  if (!u) return null;
  u.name = pick(u.body === 'michelle' ? ['SARAH', 'MARIA', 'JENNA', 'KAYLA'] : ['DEV', 'CASEY', 'SAM K.', 'RILEY', 'NICO', 'AVERY']);
  becomeSurvivor(u);
  return u;
}

// ---------------------------------------------------------------- getting hurt, going down, getting up
export function hurtNPC(u, dmg, by, opt = {}) {
  if (!u.alive) return;
  const shot = !!opt.shot, mine = !!(by && by.isPlayer);
  const bp = by && by.s ? by.s.pos : u.s.pos, byYaw = by && by.s ? by.s.yaw : u.s.yaw + Math.PI;
  u.hp -= dmg;
  if (!opt.fever) { if (!vox(u, 'hurt', { pri: 1 })) X.SND.npcHurt(u.s.pos, u.i, isFem(u)); u.s.talkT = Math.max(u.s.talkT || 0, 0.4); u.s.talkK = 1; }
  if (!shot && !opt.fire && !opt.melee && !opt.fever) X.fx && X.fx.blood(V(u.s.pos.x, opt.part === 'head' ? 1.6 : opt.part === 'legs' ? 0.6 : 1.3, u.s.pos.z), opt.dir || V(Math.sin(byYaw), 0, Math.cos(byYaw)), opt.melee ? 0.8 : 0.5);   // a bullet already drew its own
  if (u.enter) u.enter = null;
  if (u.hp > 0) {
    u.hpSeen = u.hp;
    if (by && by.z && !u.infectAt) { u.infectAt = C.t + rnd(110, 220); u.biteAt = opt.part || 'arm'; }   // a bite that broke the skin: it's in them now
    if (u.st === 'ko') { if (mine) { u.hitByMe = (u.hitByMe || 0) + 1; u.distrust = true; X.onHumanHurt && X.onHumanHurt(u, false, opt); witnesses(u, by, false); if (opt.shot || opt.melee) u.bleed = Math.max(u.bleed || 0, rnd(10, 20)); } return; }   // out cold: they don't flinch (but everyone saw you do it)
    if (!u.s.act || u.st === 'kneel' || u.st === 'search' || u.st === 'treat') { if (u.s.act) u.s.stopAct(0.1); u.s.playUp(opt.part === 'head' ? 'Hit_Head' : 'Hit_Chest', { rate: 1.2, fade: 0.06, fadeAt: 0.5, fadeOut: 0.25 }); }
    if (mine) { playerHarm(u, dmg, by, opt, false); return; }   // you did that: they react, and so does everyone who saw it
    if (u.role === 'medic') { if (by && by.z) { u.target = by; u.st = 'bitten'; u.t = rnd(1.2, 2); u.path = null; u.say((['AGH! He BIT me!', 'Ow! OW! Sir, stop!', 'It bit me — it BIT me!', 'Get off! Get OFF me!']), 2.2); const o = u.med && u.med.mate; if (o && o.alive && !o.gone && o.st !== 'bitten') { o.st = 'go'; o.target = by; o.path = null; later2(() => o.alive && o.say((['Hey! HEY! Let go of him!', 'Whoa — WHOA! Back off!', 'Hold on, I\'m coming!']), 2.2), 0.4); } } return; }   // they don't hit back: they're there to help
    if (u.role === 'bro') { if (by && by.z) { u.target = by; if (!u.bubble) u.say((['Agh! It got my arm!', 'Son of a—!', 'Get OFF!']), 2); } return; }
    if (u.role === 'surv' && by && by.s && (u.hp < 45 || by.isPlayer)) { u.st = 'run'; u.target = by; u.t = 0; u.path = null; if (u.s.act) u.s.stopAct(0.15); }   // a survivor gets away from whoever's hurting them
    else if (u.role !== 'surv') { u.st = 'flee'; u.t = 0; u.threat = by && by.s ? by : u.threat; u.path = null; }
    return;
  }
  // pulled down
  u.alive = false; u.downAt = C.t; u.s.dead = true; u.s.resetActs(); u.s.lookAt = null; u.hpSeen = u.hp;
  if (by && by.s) u.s.yaw = Math.atan2(u.s.pos.x - bp.x, u.s.pos.z - bp.z) + Math.PI;
  const drate = opt.fever ? rnd(0.5, 0.62) : rnd(0.9, 1.15); u.s.play('Death_D', { hold: true, fade: opt.fever ? 0.45 : 0.1, rate: drate });   // the fever: they sag and go down slowly
  if (u.mel) u.mel.hideAll();
  if (opt.fever) { vox(u, 'sigh', { pri: 2 }); X.SND.bodyFall && X.SND.bodyFall(u.s.pos, 0.6, (X.SND.DEATH_HIT || 1.2) / drate); u.vUntil = C.t + 2; }
  else {
    X.SND.npcDeath(u.s.pos, u.i, drate, isFem(u)); u.vUntil = C.t + 2;   // the thud lands when this body does
    X.world.blood(u.s.pos.x, u.s.pos.z, 0.7 + Math.random() * 0.5, X.world.houseAt(u.s.pos.x, u.s.pos.z) ? 0.036 : 0.026);
  }
  // the dead got them: the grey creeps in and they get back up. You did it: it's in all of them now — maybe, later
  const rise = PPL.phase !== 'calm' && (!mine || Math.random() < 0.6);   // before noon nobody gets back up (Gary's the first)
  if (rise) startTurning(u.s, (u.i % 4) + 4 * Math.floor(Math.random() * 3));
  u.turnAt = mine ? (rise ? C.t + rnd(40, 100) : Infinity) : C.t + rnd(7, 14) * (PPL.fast || 1);
  u.ko = 0; u.hostile = false; u.heli = null; u.bleed = 0;
  u.st = 'down'; u.trip = null; u.held = null; u.holdT = 0;
  if (by && by.z && !by.isPlayer) PPL.bitten = (PPL.bitten || 0) + 1;   // the dead got them
  if (u.phone) u.phone.visible = false; if (u.h) { u.h.pz = null; u.h.ovr = null; }
  mourn(u);
  if (u.role === 'surv' && X.onSurvivorDown) X.onSurvivorDown(u);
  if (u.role === 'bro') { u.say((['Go... GO! Don\'t let me... don\'t let me come after you.', 'Tell Mom... tell Mom I\'m sorry...', 'I\'m bit... I\'m bit bad. Get out of here.']), 5); X.onBrotherDown && X.onBrotherDown(u); }
  if (u.role === 'medic') u.say((['Dispatch... we need... backup...', 'Oh God... the patient...']), 3);
  if (mine) playerHarm(u, dmg, by, opt, true);
  syncList();
}

// ---------------------------------------------------------------- when YOU hurt someone
// A real reaction where it lands (a flinch; a stagger from a big blow; a leg that buckles and a limp after; a head blow
// that knocks them out cold for a while; a cut or a bullet wound that keeps bleeding) — and consequences: everyone who
// saw it screams, runs and tells the others; survivors who saw it won't trust you again (no more gifts, they won't come
// to the helicopter with you); a survivor you attacked fights back (some come after you); Ben's had enough after two.
const HARM = {
  bro1: ['OW! What the hell, man?! It\'s ME!', 'HEY! Watch it! Do that again and I\'m gone.', 'Are you out of your MIND?!'],
  bro2: ['That\'s it. I\'m done. You\'re on your own.', 'You know what? Forget it. I\'m going home.', 'I\'m out. Don\'t follow me.'],
  surv: ['You want a fight?! COME ON THEN!', 'Big mistake. BIG mistake!', 'You\'re gonna regret that!', 'Okay — now you\'re dead!'],
  survRun: ['Are you CRAZY?! Get away from me!', 'Stay away from me!', 'Psycho! PSYCHO!'],
  calm: ['OW! What are you DOING?!', 'Help! HELP! He hit me!', 'Get away from me! Somebody call the police!', 'Are you insane?!'],
  out: ['Why?! WHY?!', 'Don\'t! Please!', 'I\'m not one of them! STOP!', 'Stop! Help!'],
  medic: ['Sir! I\'m a PARAMEDIC!', 'Whoa — WHOA! We\'re here to help you!', 'Back off! Back OFF!'],
  leg: ['My LEG!', 'Agh — my leg! My leg!', 'I can\'t — my knee!'],
  wake: ['Ugh... my head...', 'What... what happened...', 'Ow. Oh God, ow.'],
  taunt: ['Come here!', 'You\'re not getting away!', 'Think you can hit ME?!', 'I\'ll kill you!'],
  saw: ['What did you DO?!', 'Stay away from me! I saw that!', 'You\'re crazy! Keep back!', 'Murderer! MURDERER!', 'Get away from us!'],
  sawCalm: ['He\'s attacking people!', 'Somebody call the police!', 'Oh my God! Somebody help!', 'Get away from him!'],
  warn: ['Watch out for that one — they\'re attacking people!', 'Don\'t go near them! They hurt somebody!', 'Stay away from that one!'],
  benSaw: ['What the hell are you DOING?!', 'Whoa — WHOA! What are you doing?!', 'Are you crazy?! They\'re not one of THEM!'],
};
const herOrHim = l => X.P() && X.P().body === 'michelle' ? l.replace(/\bHe\b/g, 'She').replace(/\bhe\b/g, 'she').replace(/\bhim\b/g, 'her') : l;   // when you play Michelle, they say 'she'
const pron = L => L.map(herOrHim);
function playerHarm(u, dmg, P, o, killed) {
  const S = u.s, W = X.world;
  if (P) u.lastHarmBy = P;
  if (o.bledOut) { u.hitByMe = (u.hitByMe || 0) + 1; X.onHumanHurt && X.onHumanHurt(u, killed, o); return; }   // the wound did it later: counted, but nobody just saw a murder
  if (o.fire && u.fireT > C.t) { u.hitByMe = (u.hitByMe || 0) + 1; if (killed) X.onHumanHurt && X.onHumanHurt(u, true, o); return; }   // still burning: one reaction every few seconds, not every tick
  if (o.fire) u.fireT = C.t + 2.5;
  u.hitByMe = (u.hitByMe || 0) + 1;
  u.distrust = true;
  X.onHumanHurt && X.onHumanHurt(u, killed, o);
  witnesses(u, P, killed);
  if (killed) return;
  const part = o.part || 'body', Wm = o.weapon && MELEE[o.weapon], blunt = (Wm && Wm.blunt) || o.thrown, dir = o.dir || V(S.pos.x - P.s.pos.x, 0, S.pos.z - P.s.pos.z).normalize();
  // where it landed
  if (o.shot || (Wm && Wm.blade) || (part === 'head' && !o.fire)) u.bleed = Math.max(u.bleed || 0, o.shot ? rnd(18, 30) : rnd(10, 20)) ;
  if (part === 'legs') { u.limp = Math.min(1, (u.limp || 0) + (o.shot ? 0.8 : 0.5)); if (!u.bubble || Math.random() < 0.5) u.say(HARM.leg, 2); }
  if (part === 'head' && blunt && dmg >= 16 && u.role !== 'medic' && Math.random() < (o.thrown ? 0.5 : 0.85)) { knockOut(u, dir, rnd(6, 12)); return; }
  if (dmg >= 24 || (Wm && Wm.heavy) || o.shove) { stagger(u, dir, o.shove ? 0.45 : 0.7); }
  // who it was
  if (u.role === 'bro') {
    u.angry = (u.angry || 0) + 1;
    if (u.angry >= 2) { u.left = true; u.st = 'leave'; u.target = null; u.path = null; u.heli = null; u.hostile = false; u.say(HARM.bro2, 3.5); X.onBrotherLeaves && X.onBrotherLeaves(u); }
    else u.say(HARM.bro1, 3);
    return;
  }
  if (u.role === 'medic') { u.say(HARM.medic, 2.5); return; }
  if (u.role === 'surv') {
    if (u.hp > 30) { goHostile(u, P, Math.random() < 0.4); u.say(HARM.surv, 2.2); }
    else { u.st = 'run'; u.target = P; u.t = 0; u.path = null; u.say(HARM.survRun, 2.2); }
    return;
  }
  // a neighbour, a passer-by: they run (a brave one swings back)
  if (u.st === 'collapsed' || u.st === 'sick' || u.role === 'market' && PPL.marketOn) { u.say(HARM.out, 2.2); return; }
  if (u.pers && u.pers.brave > 0.7 && u.hp > 50 && Math.random() < 0.5) { goHostile(u, P, false); u.say(pron(HARM.calm), 2.2); return; }
  if (u.s.act && !u.trip) u.s.stopAct(0.15);
  u.st = 'flee'; u.t = 0; u.threat = P; u.path = null; u.errand = null; u.plan = null; u.holdT = 0;
  u.say(PPL.phase === 'calm' ? pron(HARM.calm) : HARM.out, 2.4);
  if (Math.random() < 0.6) scream(u, 1.2);
  void W;
}
// a shove: they stumble back a step. Once is rude; keep doing it and they take it the way you'd think
export function shoveNPC(u, dir, P, quiet = false) {
  if (!u.alive || u.gone || u.st === 'ko' || u.st === 'down') return;
  stagger(u, dir, 0.5);
  if (quiet) return;   // (hit by a car: the stagger, not a 'don't push me')
  u.shoved = (u.shoved || 0) + 1;
  if (u.hostile) return;
  if (u.shoved < 3 || u.role === 'medic') { u.say(u.role === 'bro' ? ['Hey! Quit it!', 'What was that for?!'] : ['Hey! Watch it!', 'Whoa — easy!', 'Don\'t push me!', 'What\'s your problem?!'], 2); return; }
  u.distrust = true;
  if (u.role === 'surv' && u.hp > 40) { goHostile(u, P, false); u.say(['Push me again. I DARE you.', 'That\'s it!'], 2); }
  else if (u.role !== 'bro') { u.st = 'flee'; u.t = 0; u.threat = P; u.path = null; u.say(HARM.calm, 2.2); }
  else u.say(['Seriously, stop it!'], 2);
}
// they turn on you: fists, or whatever they're holding. revenge: they don't let it go when you run
function goHostile(u, P, revenge) {
  u.hostile = true; u.revenge = u.revenge || revenge; u.target = P; u.path = null; u.enter = null; u.heli = null; u.holdT = 0;
  if (u.s.act && !u.trip) u.s.stopAct(0.15);
  if (!u.mel) u.mel = new Melee(u.s, X.scene, X.SWINGS);
  if (!u.weapon) { u.weapon = 'fists'; u.fistsOnly = true; }
  u.mel.set(u.weapon);
}
function hostileStep(u, dt, P, W, cmd, pd) {
  const S = u.s;
  if (S.act && !u.trip) S.stopAct(0.2);
  const quit = !P.alive || X.G.boarded || u.hp < 22 || (!u.revenge && pd > 20) || pd > 70;
  if (quit) {
    u.hostile = false; u.target = null; u.path = null;
    if (u.fistsOnly) { u.weapon = null; u.fistsOnly = false; if (u.mel) u.mel.set('fists'); }
    if (u.hp < 22 && P.alive) { u.say(['Okay! OKAY! Stop!', 'Leave me alone!', 'I give up! I give up!'], 2.5); if (u.role === 'surv') { u.st = 'run'; u.target = P; u.t = 0; } else { u.st = 'flee'; u.threat = P; u.t = 0; } }
    else { u.st = u.role === 'surv' ? 'idle' : 'home'; u.t = rnd(1, 3); }
    return cmd;
  }
  u.target = P;
  const face = Math.atan2(P.s.pos.x - S.pos.x, P.s.pos.z - S.pos.z), reach = (MELEE[u.weapon] || MELEE.fists).reach;
  if (pd > 5) { chase(u, P, dt, cmd, pd, run(u) * (u.revenge ? 1 : 0.92)); }
  else { u.path = null; cmd.face = face; if (pd > reach * 0.85) { cmd.move = face; cmd.speed = S.vw * 1.8; } else if (pd < 0.7) { cmd.move = face + Math.PI; cmd.speed = S.vw; } }
  S.lookAt = (S.lookAt || V()).set(P.s.pos.x, (P.s.pos.y || 0) + 1.6, P.s.pos.z);
  u.swingT = (u.swingT || 0) - dt;
  if (pd < reach + 0.3 && u.swingT <= 0 && Math.abs(wrapPi(face - S.yaw)) < 0.6) { u.swingT = rnd(1.3, 2.0); u.mel.attack(100); X.SND.swing(0.5, S.pos); }
  if (!u.bubble && C.t > (u.tauntT || 0)) { u.tauntT = C.t + rnd(5, 9); u.say(HARM.taunt, 1.8); }
  return cmd;
}
// a blow to the head: down, out cold — then slowly back up, dazed
function knockOut(u, dir, sec) {
  const S = u.s;
  S.resetActs(); S.lookAt = null; if (u.mel) u.mel.swing = null;
  if (dir) S.yaw = Math.atan2(-dir.x, -dir.z);   // they go over backwards, away from the blow
  S.play('Death_D', { hold: true, fade: 0.08, rate: rnd(0.8, 0.95) });   // a slower, looser fall than a death
  u.st = 'ko'; u.koBr = 0; u.koT = sec; u.koUp = false; u.path = null; u.enter = null; u.heli = null; u.trip = null; u.holdT = 0; u.bubble = null;
  if (u.phone) u.phone.visible = false;
  X.noise(S.pos, 6);
}
function koStep(u, dt, P, cmd) {
  const S = u.s;
  u.koT -= dt;   // (its own clock: other things play with u.t)
  if (!u.koUp) {
    u.koBr = (u.koBr || 0) - dt;   // still alive down there: a groan, a breath now and then
    if (u.koBr <= 0) { u.koBr = rnd(2.5, 4); if (!vox(u, Math.random() < 0.5 ? 'sigh' : 'hurt', { pri: 0, gain: 0.6 })) X.SND.npcHurt && Math.random() < 0.4 && X.SND.npcHurt(u.s.pos, u.i, isFem(u)); }
    if (u.koT <= 0.6) { u.koUp = true; u.koT = 2.4; S.play('LayToIdle', { fade: 0.35, rate: 0.7 }); u.say(HARM.wake, 2.6); } return cmd; }
  if (u.koT > 0) return cmd;
  u.koUp = false; S.stopAct(0.35);
  if (u.role === 'surv' && P.alive && u.hp > 30) goHostile(u, P, true);
  else if (u.role === 'bro') u.st = u.left ? 'leave' : 'follow';
  else { u.st = u.role === 'surv' ? 'run' : 'flee'; u.threat = P; u.target = P; u.t = 0; }
  return cmd;
}
// a big blow: knocked back a step or two
function stagger(u, dir, k) {
  const S = u.s; if (S.act && S.act !== 'Hit_Knockback') S.stopAct(0.05);
  S.play('Hit_Knockback', { fade: 0.06, rate: 1.15 + Math.random() * 0.2, fadeAt: 0.75, fadeOut: 0.3 });
  u.stag = { x: dir.x, z: dir.z, t: 0.45 * k + 0.15, k }; u.stagT = 0.8;
}
// everybody who saw it
function witnesses(v, P, killed) {
  const W = X.world, at = V(v.s.pos.x, 1.4, v.s.pos.z), told = [];
  for (const o of PPL.list) {
    if (o === v || !o.active || !o.alive || o.gone || o.zu || o.st === 'ko') continue;
    const d = o.s.pos.distanceTo(v.s.pos); if (d > 30) continue;
    if (d > 6 && !W.los(tmp.set(o.s.pos.x, 1.6, o.s.pos.z), at)) continue;
    o.distrust = true; o.sawT = C.t; told.push(o);
    if (o.hostile) continue;
    if (o.role === 'bro') { if (!o.bubble) o.say(HARM.benSaw, 3); continue; }
    if (o.role === 'medic') { o.say(HARM.medic, 2.2); continue; }
    if (o.role === 'surv') {
      const armed = o.weapon && o.weapon !== 'fists';
      if (armed && o.hp > 60 && Math.random() < (killed ? 0.45 : 0.25)) { goHostile(o, P, false); o.say(['Not on my watch!', 'Leave them ALONE!', 'Hey! You want some of me?!'], 2.4); }
      else { if (o.s.act && o.st !== 'search') o.s.stopAct(0.15); o.st = 'run'; o.target = P; o.t = 0; o.path = null; later2(() => o.alive && !o.gone && o.say(HARM.saw, 2.6), rnd(0.2, 0.9)); }
      continue;
    }
    if (o.st === 'collapsed' || o.st === 'sick' || o.st === 'down') continue;
    if (o.s.act && !o.trip) o.s.stopAct(0.15);
    o.st = 'flee'; o.t = rnd(0, 0.6); o.threat = P; o.path = null; o.errand = null; o.plan = null; o.holdT = 0; o.enter = null;
    later2(() => { if (!o.alive || o.gone) return; o.say(pron(HARM.sawCalm), 2.4); if (Math.random() < 0.5) scream(o, 1); }, rnd(0.2, 1.0));
  }
  // ...and they tell the others: a couple of seconds later, everyone near a witness has heard
  if (told.length) later2(() => {
    for (const w of told) {
      if (!w.alive || w.gone) continue;
      for (const o of PPL.list) { if (o === v || o.distrust || !o.active || !o.alive || o.gone || o.zu) continue; if (o.s.pos.distanceTo(w.s.pos) < 22) { o.distrust = true; if (!w.bubble && Math.random() < 0.5) w.say(HARM.warn, 2.6); } }
    }
  }, rnd(2, 3.5));
}
// a wound that keeps bleeding (and the limp that goes with a bad leg) — every frame from peopleStep
function wounds(u, dt) {
  const S = u.s;
  if (u.stag) { const g = u.stag; g.t -= dt; if (g.t > 0) { const sp = 2.6 * g.k * Math.min(1, g.t * 3); S.pos.x += g.x * sp * dt; S.pos.z += g.z * sp * dt; } else u.stag = null; }
  if (u.bleed > 0 && u.alive) {
    u.bleed -= dt; u.bleedT = (u.bleedT || 0) - dt;
    if (u.bleedT <= 0) { u.bleedT = rnd(0.9, 1.6); if (S.speed > 0.4 || Math.random() < 0.35) X.world.blood(S.pos.x + rnd(-0.2, 0.2), S.pos.z + rnd(-0.2, 0.2), 0.1 + Math.random() * 0.1, X.world.houseAt(S.pos.x, S.pos.z) ? 0.036 : 0.026); }
    u.hp -= dt * 0.9; u.hpSeen = u.hp;
    if (u.hp <= 0) { u.hp = 1; u.hpSeen = 1; hurtNPC(u, 2, u.lastHarmBy || null, { fire: true, bledOut: true }); }
  }
}
// ---------------------------------------------------------------- the helicopter: the ones who still trust you run for it
// main.js calls this while it's on the ground (door: where to climb in; board(u) -> seat or -1)
export function heliCall(lz, door, radius, board) {
  if (!X) return 0;
  PPL.heliBoard = board; PPL.heliDoor = door;
  let n = 0;
  for (const u of PPL.list) {
    if (!u.active || u.gone || !u.alive || u.zu || u.boarded || u.st === 'ko' || u.st === 'down' || u.hostile || (u.distrust && u.role !== 'bro') || u.amb) continue;   // (Ben's your brother: only hitting him twice makes him go)
    if (u.heli) { u.heli.x = door.x; u.heli.z = door.z; n++; continue; }
    const ok = u.role === 'surv' || (u.role === 'bro' && u.called && !u.left);
    if (!ok) continue;
    const d = Math.hypot(u.s.pos.x - lz.x, u.s.pos.z - lz.z);
    if (d > radius && !(u.role === 'bro' && u.st === 'follow') && !(u.role === 'surv' && u.tag)) continue;
    if (u.s.act) u.s.stopAct(0.2);
    u.heli = { x: door.x, z: door.z }; u.path = null; u.enter = null; u.holdT = 0; u.target = null; n++;
    later2(() => u.alive && !u.gone && u.say(u.role === 'bro' ? ['The helicopter! Come ON!', 'That\'s our ride! GO GO GO!'] : ['The helicopter! RUN!', 'Wait for me! WAIT!', 'Don\'t leave without me!'], 2.4), rnd(0.1, 1.2));
  }
  return n;
}
// it's gone (or the wait ran out): the ones still running for it stop
export function heliGone() {
  for (const u of PPL.list) if (u.heli) { u.heli = null; u.path = null; if (u.alive && !u.gone) { u.st = u.role === 'bro' ? 'follow' : 'idle'; u.t = rnd(1, 3);
    if (u.role === 'surv') { const zn = nearestZombie(u, 14); u.tag = false; u.enter = null; u.home = null; if (zn && zn.d < 12) { u.st = 'run'; u.target = zn.z; u.t = 0; } else u.st = 'holeup'; }   // off the landing zone, not stood in the middle of them
    u.say(['NO! Come back!', 'It\'s leaving... it\'s LEAVING!', 'Wait! WAIT!'], 3); } }
  PPL.heliBoard = null;
}
export const heliRunners = () => PPL.list.filter(u => u.heli && u.alive && !u.gone).length;
function heliStep(u, dt, P, W, cmd) {
  const S = u.s, H = u.heli, d = Math.hypot(H.x - S.pos.x, H.z - S.pos.z), G = HELI.group();
  if (S.act) S.stopAct(0.2);
  const yw = G ? G.rotation.y : 0, cy = Math.cos(yw), sy = Math.sin(yw);
  if ((u.hclimb || d < 1.2) && PPL.heliBoard) {   // a hand on the door frame, a step up, in
    u.hclimb = (u.hclimb || 0) + dt; u.path = null; S.lookAt = null;
    cmd.face = Math.atan2(-cy, sy);   // facing into the cabin
    if (u.hclimb <= dt * 1.5) S.playUp('Interact', { rate: 1.1, fade: 0.12, fadeAt: 0.6 });
    if (u.hclimb < 0.6) return cmd;
    u.hclimb = 0;
    const seat = PPL.heliBoard(u);
    u.heli = null;
    if (seat >= 0) { u.boarded = true; u.gone = true; u.seat = seat; u.hidden = false; if (u.mel) u.mel.hideAll(); if (u.phone) u.phone.visible = false; S.play('Crouch_Idle', { loop: true, fade: 0.3 }); X.SND.door && X.SND.door('close', V(H.x, 1, H.z)); }
    else { u.st = u.role === 'bro' ? 'follow' : 'idle'; u.t = 2; }
    return cmd;
  }
  if (d < 10 && G) {   // close: round the fuselage (never through it) to a spot outside the door, then in
    const C0 = G.position, dx = S.pos.x - C0.x, dz = S.pos.z - C0.z, lx = dx * cy - dz * sy, lz = dx * sy + dz * cy;
    const L = (x, z) => [C0.x + x * cy + z * sy, C0.z - x * sy + z * cy];
    let tg;
    if (lx < 1.7) tg = lz < -2.4 && Math.abs(lx) < 1 ? L(lx < 0 ? -1.9 : 1.9, lz) : lz < 4.8 ? L(lx < 0 ? -1.9 : 2.6, 5.4) : L(2.6, 5.4);
    else if (lx > 2.4 || Math.abs(lz - 0.25) > 0.8) tg = L(3.05, 0.25);
    else tg = [H.x, H.z];
    u.path = null; cmd.move = Math.atan2(tg[0] - S.pos.x, tg[1] - S.pos.z); cmd.speed = tg[0] === H.x ? S.vw * 1.2 : d < 4 ? S.vw * 1.6 : run(u);
    if (d < 9) { cmd.speed = Math.min(cmd.speed, S.vw * 1.35); cmd.crouch = true; S.lookAt = null; }   // heads down under the rotor, like anybody would
    return cmd;
  }
  return chase(u, { s: { pos: V(H.x, 0, H.z) } }, dt, cmd, d, run(u));
}
// sat in the helicopter's cabin, riding with it
function seated(u, dt) {
  const S = u.s, G = HELI.group();
  HELI.seatPos(u.seat, tmp); S.pos.x = tmp.x; S.pos.z = tmp.z;
  S.yaw = S.aimYaw = S.moveA = G.rotation.y + (u.seat % 2 ? Math.PI / 2 : -Math.PI / 2);
  if (S.act !== 'Crouch_Idle') S.play('Crouch_Idle', { loop: true, fade: 0.3 });
  S.update(dt, {});
  S.pivot.position.set(tmp.x, tmp.y - 0.45, tmp.z); S.pivot.rotation.set(0, S.yaw, 0);
  if (!S.visible) S.setVisible(G.visible);
}
// they get back up
function turn(u, { runner = false, now = false, standing = false, state = 'idle', tgt = null } = {}) {
  if (u.zu || u.gone && !u.downAt) return;
  const s = u.s, x = s.pos.x, z = s.pos.z, yaw = s.yaw;
  u.alive = false; u.gone = true; u.hidden = true; s.dead = false;
  if (u.mel) u.mel.hideAll();
  if (u.phone) u.phone.visible = false;
  if (!s.zTurn) startTurning(s, (u.i % 4) + 4 * Math.floor(Math.random() * 3));   // the grey comes in over seconds, never a pop
  if (now && s.zTurn && s.zTurn.value < 0.7) s.zTurn.value = 0.7;
  const z0 = adoptZombie(s, u.i % 4);
  u.zu = z0; z0.from = u;
  wake(z0, x, z, { yaw, lying: !standing, runner, state, hp: rnd(85, 110) });
  if (z0.z) z0.z.groanT = 0;   // the first sound it makes is as it comes back
  X.noise && X.noise(s.pos, 10);
  if (!standing) { z0.z.lying = false; z0.z.down = now ? rnd(0.3, 1.0) : rnd(0.4, 1.4); }
  if (tgt) { z0.z.state = 'chase'; z0.z.tgt = tgt; z0.z.seen = C.t; z0.z.lastSeen.copy(tgt.s.pos); z0.z.lockT = C.t + 10; }
  if (u.daleBody) { z0.dale = true; z0.name = 'DALE'; }
  X.onTurned && X.onTurned(z0, u);
  syncList();
  return z0;
}
export { turn as turnNPC };


// ---------------------------------------------------------------- voices: real recordings of real people (audio.js voice(), sounds/r/v_*)
// Each person keeps their own voice: a woman's or a man's by body, a little higher or lower than the neighbours'.
const isFem = u => u.body === 'michelle';
const vPitch = u => 0.93 + ((u.i * 37 + 11) % 13) * 0.012;
// what kind of recording fits a line of text (first match wins); null = nothing fits, use a short sound instead
const VMAP = [
  [/^\(yawn/i, 'yawn'], [/\(sob|\(cr(y|ies)/i, 'cry'], [/\(laugh/i, 'laugh'],
  [/\b(help me|somebody help|call an ambulance|backup)\b|\bhelp!|^help\b(?! you)/i, 'help'],
  [/behind you|look out|watch out|over there|look!|(?<!\b(hi|hey) )there!|incoming|they're coming/i, 'look'],
  [/\brun(!|\.\.\.|,|$)|go go|\bgo!|get out|\bmove!/i, 'run'],
  [/wait for me|hold the doors|come on|let's go|hurry|\b(come with|follow me|this way|with you|i'm coming)\b/i, 'come'],
  [/oh my god|oh god|my god|jesus|what the|oh no|can't be/i, 'omg'],
  [/^(no|nope)\b|\bno!|get off me|get away|back off/i, 'no'],
  [/thank|bless you|appreciate|nice one|owe you/i, 'thanks'],
  [/\b(ha+|(ha){2,}|hah|lol)\b|haha|you're terrible/i, 'laugh'],
  [/\b(bye|see you|see ya|take care|have a good one|enjoy your)\b|later!/i, 'bye'],
  [/^hey[!—]|^hey\b.*\b(watch|quit|stop|let go|easy|back)/i, 'hey'],
  [/^(hey,|hey there\b|(hi|hello|morning|afternoon|howdy|evening)\b)|\bhello\b|\b(hi|morning)[!.,]/i, 'hello'],
  [/can't breathe|my chest|wait\.\.\./i, 'pant'],
  [/^(okay|ok|alright|sure|yeah|yep|got it|fine|right)\b/i, 'ok'],
  [/^(what|huh)\b[^a-z]*\??$|^what\?/i, 'what'],
  [/^hey\b/i, 'hey'],
];
export function voiceKind(text) { for (const [re, k] of VMAP) if (re.test(text)) return k; return null; }
// one recording from this person, where they stand; the mouth moves for exactly as long as it lasts. Never spammy: a person
// doesn't start a new one while still talking, and ordinary chatter waits its turn across the whole town.
PPL.vAt = 0;
function vox(u, kind, { pri = 0, gain = 1, dur = 0, mouth = true } = {}) {
  const SND = X.SND; if (!SND || !SND.voice || !u || !u.s || !u.alive && kind !== 'die') return 0;
  const nw = C.t;
  if (pri < 2 && nw < (u.vUntil || 0)) return 0;            // still saying the last thing
  if (pri < 1 && nw < PPL.vAt) return 0;                    // somebody else is chatting; screams and pain don't wait
  if (!dur) dur = kind === 'laugh' ? rnd(1.3, 2.4) : kind === 'cry' ? rnd(2.2, 3.6) : kind === 'murmur' ? 3 : 0;   // a giggle, not a fit
  const W = X.world, muffled = !!W && !!W.houseAt && (W.houseAt(u.s.pos.x, u.s.pos.z) || null) !== ((X.G && X.G.inside) || null);   // through a wall: indoors vs out
  const len = SND.voice(kind, u.s.pos, { female: isFem(u), pitch: vPitch(u), gain, pri, dur, muffled });
  if (!len) return 0;
  u.vUntil = nw + len + 0.25; if (pri < 1) PPL.vAt = nw + Math.min(len, 1.6) + 0.35;
  if (mouth) { u.s.talkT = Math.max(len, 0.25); u.s.talkK = kind === 'scream' || kind === 'help' || kind === 'run' ? 1 : kind === 'pant' || kind === 'sigh' || kind === 'cry' ? 0.45 : 0.75; }
  return len;
}
function speak(u, text) {
  if (!u.active || u.gone) return 0;
  let k = voiceKind(text);
  const loud = /!/.test(text), calm = PPL.phase === 'calm';
  if (calm && !loud && (k === 'help' || k === 'run' || k === 'look' || k === 'omg')) k = null;   // small talk never screams
  if (k === 'come' && !isFem(u)) k = !calm && loud ? 'gasp' : null;   // (only a woman's 'come on' was recorded; never a 'Run!' in its place)
  let len = 0;
  if (!k) {   // nothing recorded says these words: only a wordless sound under the bubble, never a word that isn't there
    if (/^\(/.test(text)) k = null;
    else if (/\.\.\.$|\.\.\. /.test(text)) k = calm ? 'sigh' : 'pant';
    else if (!calm && (loud || /\?$/.test(text))) k = 'gasp';
    else if (calm && text.length > 40) len = vox(u, 'murmur', { gain: 0.4, dur: Math.min(3, text.length * 0.05) });   // a long chat: their voice low under the words
  }
  if (k) len = vox(u, k, { pri: loud && !calm ? 1 : 0, dur: k === 'pant' ? 1.6 : 0 });
  if (len && u.bubble) u.bubble.t = Math.max(u.bubble.t, Math.min(len + 0.4, 6));   // the words stay up while they're said
  u.s.talkT = Math.max(u.s.talkT || 0, Math.min(u.bubble ? u.bubble.t : 3, 0.5 + text.length * 0.055)); u.s.talkK = Math.max(u.s.talkK || 0, 0.55);   // the mouth keeps moving as long as the sentence does
  return len;
}
export { vox as personVoice };
// ---------------------------------------------------------------- talking
PPL.say = null;
function sayOn(u) {
  u.say = (text, dur = 3) => {
    if (Array.isArray(text)) text = pickU(u, text);
    if (!text) return;
    u.lastText = text; u.bubble = { text: text.replace(/^\((\w+)\)\s*/, '*$1* '), t: dur }; u.s.talkT = Math.min(dur, 0.5 + text.length * 0.06); u.s.talkK = /!/.test(text) ? 1 : 0.65;   // the mouth moves while the words are up
    speak(u, text);   // and a real recorded voice says it (or a fitting sound of one)
    if (u.active && !u.gone) PPL.voices.push({ x: u.s.pos.x, z: u.s.pos.z, loud: /!/.test(text) ? 16 : 9, by: u, voice: true });   // and heads turn to the voice
  };
}
export function talk(u) {
  const r = talkLine(u);
  holdFor(u, (u.bubble ? u.bubble.t : 3) + (u.more || 0) + 1); u.more = 0;   // stop, turn, eyes on you for as long as they're talking
  if (u.pers && !u.s.up && !u.s.act && Math.random() < 0.3 + u.pers.chatty * 0.6 && !(u.weapon && u.weapon !== 'fists')) u.s.playUp('Interact', { rate: rnd(0.7, 0.95), fade: 0.25, fadeAt: 1.2 });   // hands go with the words
  return r;
}
function talkLine(u) {
  if (u.role === 'bro' && u.left) { u.say(['Leave me alone.', 'Don\'t. Just don\'t.', 'Go away.'], 2.5); return 'cold'; }
  if (u.distrust && u.role !== 'bro' && u.role !== 'dale') { u.say(['Stay away from me. I saw what you did.', 'Don\'t come any closer.', 'Get away from me!', 'I\'m not talking to you.'], 2.6); return 'cold'; }
  if (u.role === 'dale') { const l = DALE[Math.min(u.talkI, DALE.length - 1)].replace('Sam', X.G.pname || 'Sam'); u.talkI++; u.say(l, 5); return 'dale'; }
  if (u.role === 'bro') { const L = PPL.phase === 'calm' && !u.called ? BEN.calm : BEN.talk; u.say(L[u.talkI++ % L.length].replace('Sam', X.G.pname || 'Sam'), 4); return 'bro'; }
  if (u.role === 'medic') { u.say((['Anyone hurt? Get in the back!', 'Are you injured? Were you bitten?', 'Ambulance is right there — go, go!']), 3); return 'medic'; }
  if (u.role === 'surv') {
    const first = !u.talkI;
    if (first) { const L = SURVIVOR_LINES[u.name === 'JESSE' ? 'Jesse' : u.name === 'MORGAN' ? 'Morgan' : 'other']; u.say(L[u.talkI++ % L.length], 5); }
    u.tag = !u.tag; if (u.s.act && u.st === 'search') { u.s.stopAct(0.2); u.reserve && (u.reserve.taken = null); }
    u.st = u.tag ? 'tag' : 'idle'; u.t = rnd(2, 4); u.path = null; u.enter = null; u.home = null;
    const ln = u.tag ? pick(['Okay — I\'m with you.', 'Alright. Lead the way.', 'Okay. Right behind you.']) : pick(['Okay. I\'ll find my own way. Good luck.', 'Alright — I\'m staying here. Be careful.']);
    if (first && u.tag) { u.more = 1.5; later2(() => u.alive && !u.gone && u.say(ln, 2.6), 5.2); } else u.say(ln, 2.6);
    return 'surv';
  }
  if (PPL.phase === 'calm' && u.pers && Math.random() < 0.55) { u.say(sayLines(u, 'small'), 4); return 'small'; }
  if (PPL.phase === 'calm') { const L = pickU(u, SMALL.map(l => l[0])), L1 = (SMALL.find(l => l[0] === L) || [])[1]; u.say(L, 4); if (L1) { u.more = 2.7; later2(() => u.alive && !u.gone && u.say(L1, 2.5), 4.2); } return 'small'; }
  u.say(u.pers && Math.random() < 0.6 ? sayLines(u, u.pers.brave > 0.6 ? 'panicB' : 'panicS') : PANIC, 2.5); return 'panic';
}
export function talkable(px, pz) {
  let best = null, bd = 2.2;
  for (const u of PPL.list) { if (!u.active || !u.alive || u.gone || u.st === 'flee' || u.st === 'ko' || u.hostile) continue; const d = Math.hypot(u.s.pos.x - px, u.s.pos.z - pz); if (d < bd) { bd = d; best = u; } }
  return best;
}

// ---------------------------------------------------------------- route finding (A* on the zombies' 0.5 m grid)
let gS = null, oS = null, par = null, stampA = null, stampN = 0;
const hD = new Float32Array(120000), hK = new Int32Array(120000);
export function findPath(x0, z0, x1, z1, maxExp = 60000) {
  const N = X.world.NAV, { nx, nz, blocked: bl } = N, c = N.cell;
  if (!gS || gS.length !== nx * nz) { gS = new Float32Array(nx * nz); par = new Int32Array(nx * nz); stampA = new Int32Array(nx * nz); oS = new Uint8Array(nx * nz); }
  stampN++;
  const cell = (x, z) => [clamp(Math.round((x - N.x0) / c), 0, nx - 1), clamp(Math.round((z - N.z0) / c), 0, nz - 1)];
  const free = (i, j) => { const b = bl[j * nx + i]; return b === 0 || b === 3; };
  const near = (i, j) => { if (free(i, j)) return [i, j]; for (let r = 1; r < 5; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < nx && b < nz && free(a, b)) return [a, b]; } return null; };
  const s0 = near(...cell(x0, z0)), g0 = near(...cell(x1, z1)); if (!s0 || !g0) return null;
  const sk = s0[1] * nx + s0[0], gk = g0[1] * nx + g0[0];
  const h = k => { const i = k % nx, j = (k / nx) | 0, dx = Math.abs(i - g0[0]), dz = Math.abs(j - g0[1]); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
  let n = 0;
  const push = (d, k) => { if (n >= hD.length) return; let i = n++; hD[i] = d; hK[i] = k; while (i > 0) { const p = (i - 1) >> 1; if (hD[p] <= hD[i]) break; [hD[p], hD[i]] = [hD[i], hD[p]]; [hK[p], hK[i]] = [hK[i], hK[p]]; i = p; } };
  const pop = () => { const k = hK[0]; n--; if (n > 0) { hD[0] = hD[n]; hK[0] = hK[n]; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < n && hD[l] < hD[m]) m = l; if (r < n && hD[r] < hD[m]) m = r; if (m === i) break; [hD[m], hD[i]] = [hD[i], hD[m]]; [hK[m], hK[i]] = [hK[i], hK[m]]; i = m; } } return k; };
  stampA[sk] = stampN; gS[sk] = 0; par[sk] = -1; oS[sk] = 0; push(h(sk), sk);
  const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
  let found = false, exp = 0;
  while (n > 0 && exp++ < maxExp) {
    const k = pop(); if (oS[k] === 1 && stampA[k] === stampN) continue; oS[k] = 1;
    if (k === gk) { found = true; break; }
    const i = k % nx, j = (k / nx) | 0;
    for (const [di, dj, w] of NB) {
      const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= nz || !free(a, b)) continue;
      if (di && dj && (!free(a, j) || !free(i, b))) continue;
      const kk = b * nx + a, ng = gS[k] + w + (bl[kk] === 3 ? 0.5 : 0);
      if (stampA[kk] !== stampN) { stampA[kk] = stampN; oS[kk] = 0; gS[kk] = 1e9; }
      if (oS[kk] === 1 || ng >= gS[kk]) continue;
      gS[kk] = ng; par[kk] = k; push(ng + h(kk), kk);
    }
  }
  if (!found) return null;
  const cells = []; for (let k = gk; k !== -1; k = par[k]) cells.push(k);
  cells.reverse();
  const pts = cells.map(k => [N.x0 + (k % nx) * c, N.z0 + ((k / nx) | 0) * c]);
  // straighten it: from each point, jump to the furthest one you can walk to in a line
  const clear = (a, b) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]), m = Math.ceil(L / 0.25); for (let q = 1; q < m; q++) { const x = a[0] + (b[0] - a[0]) * q / m, z = a[1] + (b[1] - a[1]) * q / m; for (const o of [0, 0.22, -0.22]) { const [i, j] = cell(x + (b[1] - a[1]) / (L || 1) * o, z - (b[0] - a[0]) / (L || 1) * o); if (!free(i, j)) return false; } } return true; };
  const out = [pts[0]]; let i0 = 0;
  while (i0 < pts.length - 1) { let j = pts.length - 1; while (j > i0 + 1 && !clear(pts[i0], pts[j])) j--; out.push(pts[j]); i0 = j; }
  return out.slice(1);
}

// ================================================================ human nature
// Everybody in Maple Hollow is somebody: brave or not, a talker or not, calm or jumpy, fit or not, young or getting on —
// and it shows in how they stand, walk, run, look round, talk and fall apart. All of it is body language layered on top
// of the captured moves (after the pose is worked out each frame): breathing, a stoop, weight shifting from foot to foot,
// hands doing things (a phone, arms crossed, hands on hips, a scratch of the head, a wave), the head turning to whatever
// just made a noise. Every word that's said comes with a mouth that moves.
function seeded(n) { let a = (n * 2654435761 + 12345) >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const MOODS = ['cheerful', 'grumpy', 'tired', 'anxious', 'easy'];
function persona(i) {
  const r = seeded(i * 31 + 7);
  return { brave: r(), chatty: r(), nervous: r(), fit: r(), age: r() ** 1.5, mood: MOODS[Math.floor(r() * MOODS.length)], wound: r() < 0.5 ? 1 : -1 };
}
const CAST_P = {
  DALE: { age: 0.8, brave: 0.85, chatty: 0.85, fit: 0.3, mood: 'cheerful' }, GARY: { fit: 0.12, age: 0.55, chatty: 0.7, mood: 'easy' },
  RAJ: { chatty: 0.95, mood: 'cheerful', brave: 0.7, age: 0.35 }, LINDA: { chatty: 0.85, age: 0.65, nervous: 0.6, mood: 'cheerful' },
  DEB: { nervous: 0.85, chatty: 0.6, mood: 'anxious' }, TOM: { brave: 0.55, age: 0.45, mood: 'grumpy' },
  JESSE: { fit: 0.85, age: 0.05, nervous: 0.75, brave: 0.35, mood: 'anxious' }, MORGAN: { fit: 0.8, age: 0.12, brave: 0.65, mood: 'easy' },
  BEN: { brave: 0.9, fit: 0.75, age: 0.15, chatty: 0.8, nervous: 0.25, mood: 'easy' },
};
const FIRST = { f: ['Nora', 'Ellie', 'Beth', 'Joan', 'Tess', 'Hannah', 'Lucy', 'Carol', 'Megan', 'Ruth'], m: ['Mike', 'Paul', 'Hank', 'Rob', 'Ed', 'Walt', 'Joe', 'Carl', 'Phil', 'Doug'] };
const titleCase = n => n ? n[0] + n.slice(1).toLowerCase() : n;
function firstOf(u) { if (u.name && u.name !== 'PARAMEDIC') return titleCase(u.name.replace(/ .*/, '')); const L = u.body === 'michelle' ? FIRST.f : FIRST.m; return L[(u.i * 7 + 3) % L.length]; }
// a line nobody's just heard from them (never the same one twice in a row)
function pickU(u, a) {
  if (!a || !a.length) return '';
  if (a.length < 2) return a[0];
  const said = u.said ||= [];
  let c = a.filter(x => !said.includes(x)); if (!c.length) c = a.filter(x => x !== u.lastText);
  const t = pick(c.length ? c : a); said.push(t); if (said.length > Math.min(8, a.length - 1)) said.shift();
  return t;
}
const fill = (t, u, v) => t.replace(/\{N\}/g, v ? firstOf(v) : 'hey').replace(/\{P\}/g, (X.G && X.G.pname) || 'Sam').replace(/\{ME\}/g, firstOf(u)).replace(/\{OBJ\}/g, v && v.body === 'michelle' ? 'her' : 'him');
// what they say, by who they are
const L_ = {
  greet: {
    cheerful: ['Morning! Gorgeous day!', 'Hi there! Isn\'t it lovely out?', 'Hey, neighbour! Happy Saturday!', 'Morning! You hear the Quick Stop\'s doing burgers?', 'Well, hello! Out enjoying the sun?'],
    grumpy: ['Mm. Morning.', 'Morning. Kids were tearing up my lawn again.', 'Hey.', 'If you see the Hendersons\' dog, it\'s been in my trash again.', 'Morning. Don\'t ask.'],
    tired: ['Morning... I need more coffee.', 'Hey. Long week.', 'Morning. Up all night with the baby.', '(yawns) ...Sorry. Morning.', 'Is it Saturday already? Morning.'],
    anxious: ['Oh — hi! Sorry, you made me jump.', 'Morning. Did you hear the sirens last night?', 'Hi. You seen the news? Something about Ridgefield...', 'Morning. Is it me, or are there more helicopters lately?'],
    easy: GREET,
  },
  small: {
    cheerful: ['Raj gets the meat cheap from some new supplier. Two-dollar burgers, can you believe it?', 'My kid\'s got a game at two. You should come watch!', 'Finally some sun! I\'m doing nothing all day.', 'I\'m off to get a burger before they run out.'],
    grumpy: ['Two-dollar burgers. You know what\'s in a two-dollar burger? Nothing good.', 'They\'re digging up Main Street again next week. Again.', 'Somebody keeps parking across my driveway.', 'Have a good one.'],
    tired: ['I could sleep for a week.', 'Coffee. Then burgers. Then a nap.', 'Kids had me up at five. On a Saturday.', 'Have a good one.'],
    anxious: ['Saw a truck I didn\'t recognise outside the Quick Stop this morning. No markings on it.', 'The radio cut out twice this morning. Weird, right?', 'They closed the road out to Ridgefield. Nobody\'ll say why.', 'Probably nothing. Probably.'],
    easy: ['Have a good one!', 'Raj\'s burgers at noon. You going?', 'Nice to just stand in the sun for once.', 'I\'m off to get a burger before they run out.'],
  },
  stare: ['...Can I help you?', 'Something on my face?', 'Hi?', 'Um... hello?', 'You okay there?'], stareG: ['Take a picture, it lasts longer.', 'What are you looking at?', 'Help you with something?'],
  space: ['Oh — excuse me.', 'Whoa — personal space!', 'Sorry, I\'ll just...', 'Oh! Hi. Bit close there.'], spaceG: ['Do you mind?', 'Back up a little, pal.'],
  wave: ['Morning, {N}!', 'Hey, {N}!', 'Hi, {N}!', '{N}! How are you?', 'Hey there, {N}!'],
  laugh: ['Ha! Stop it.', 'Hahaha!', 'Ha! No way.', 'Oh, you\'re terrible.', 'Ha ha — seriously?', 'Ha! That\'s so true.'],
  startle: ['What was that?!', 'Jesus! What was that?', 'Was that a gunshot?', 'Whoa!', 'Did you hear that?'],
  startle2: ['Oh God, what now?!', 'Where\'s that coming from?!', 'Gunshots...', 'Oh no. Oh no.', 'Shh! Did you hear that?'],
  horror: ['What... what IS that?', 'Oh my God. Oh my GOD.', 'His face... look at his FACE!', 'That\'s not... that\'s not a person anymore.', 'Is he... is he EATING someone?', 'No. No, no, no.'],
  anger: ['Get back! GET BACK!', 'Come on then! COME ON!', 'Stay away from us!', 'Back off, you sick—!', 'Don\'t you come near me!'],
  panicB: ['Everybody inside! NOW!', 'Get off the street!', 'Move! MOVE!', 'Get to your houses!', 'Don\'t just stand there — RUN!'],
  panicS: ['Oh God, oh God...', 'No no no no...', 'Somebody help!', 'Help! HELP!', 'This isn\'t happening...', 'I don\'t want to die!'],
  blown: ['I can\'t... I can\'t run anymore...', 'Hold on... hold on...', 'My lungs... God...', 'Just... one second...', 'Can\'t... breathe...'], blownOld: ['I\'m too old for this...', 'My knees... my knees...', 'Should\'ve... quit smoking...'],
  grief: ['No... NO! {N}!', '{N}! Oh God, {N}...', 'Not {N}... please, not {N}...', 'They got {N}... they GOT {N}!', '{N}! NO! Get off {OBJ}! Get off!'],
  sob: ['Why... why...', '(sobbing)', 'Oh God... oh God...', 'I can\'t... I can\'t...'],
  warn: ['Behind you!', 'BEHIND YOU!', 'Look out — behind you!', '{P}, behind you!', 'Turn around! TURN AROUND!'],
  thankB: ['Nice one.', 'Good hit.', 'Thanks. I owe you one.', 'Hell of a swing.'], thankS: ['Oh thank God... thank you!', 'Thank you! Thank you!', 'I thought I was dead...', 'You saved my life...'], thankG: ['About time.', 'Took you long enough. ...Thanks.'],
  helpme: ['Please, help me!', 'Help! Over here! PLEASE!', 'Don\'t leave me! Please!', 'Help me! It\'s right behind me!'],
  helpUp: ['Get up! Come on — up!', 'Give me your hand!', 'I got you — get UP!', 'Up! Up! We have to go!'],
  helped: ['Thank you... thank you...', 'Oh God, thanks.', 'Don\'t let go of me.'],
  lead: ['{N}, come ON!', '{N}! Keep up!', 'Don\'t stop, {N}! Don\'t stop!', 'This way, {N}!', '{N}! Stay with me!'],
  lag: ['Wait for me!', 'Slow down! I can\'t—', 'Don\'t leave me!'],
  callRun: ['{N}! RUN!', '{N}, come on! Come ON!', '{N}! This way!'],
  hurt: ['My leg... my leg...', 'Ow... ow ow ow...', 'I\'m bleeding... I\'m bleeding...', 'Ah — God, that hurts...'],
};
const CHATS = [
  ['So Phil finally fixed the gutter. Took him three years.', 'Three? I had money on five.', 1], ['Did you see Marge\'s new car? Bright yellow.', 'Like a taxi!', 1],
  ['They say it\'ll rain later.', 'Not a cloud in the sky, look.', 0], ['Our boy wants a drum kit for Christmas.', 'Oh no. I\'m so sorry.', 1],
  ['I swear the prices at the Quick Stop go up every week.', 'Except the burgers. Two bucks!', 0], ['Did you hear the helicopters last night?', 'Probably the army base again.', 0],
  ['My mother-in-law\'s coming Sunday.', 'My condolences.', 1], ['I tried that yoga class.', 'And?', 0], ['Dale\'s washing that truck again.', 'Every Saturday. You could eat off it.', 1],
  ['Somebody\'s mowing at ten on a Saturday. Every week.', 'That\'s the Hendersons. They think it\'s a sport.', 1], ['You going to the game at two?', 'Wouldn\'t miss it. Our boy\'s starting.', 0],
  ['Raj said the burgers are some new beef. Cheap, he said.', 'Cheap meat. What could go wrong?', 1], ['The kids were up at six. SIX. On a Saturday.', 'Cartoons wait for no one.', 1],
  ['My radio keeps cutting out this morning. Just static.', 'Mine too. Thought it was the batteries.', 0], ['That grey truck by the Quick Stop. No plates, nothing written on it.', 'Delivery, probably. For Raj.', 0],
  ['Phone\'s been weird all morning. Calls keep dropping.', 'It\'s the new tower. Always something.', 0], ['Did you see the leaves on Maple? Somebody has to rake that.', 'Not it.', 1],
  ['We\'re thinking of painting the porch blue.', 'Blue? Bold.', 0], ['I heard sirens out toward the highway before.', 'Accident on the interstate, I bet.', 0],
  ['Linda says Gary\'s been eating Raj\'s burgers every day this week.', 'Every day? His cholesterol!', 1], ['The dog\'s been barking at nothing since breakfast.', 'Ours too. Won\'t come out from under the bed.', 0],
  ['Are you doing anything for Thanksgiving?', 'Her family. All of them. Twenty-two people.', 1], ['Somebody left the gate open at the park again.', 'Kids. It\'s always kids.', 0],
  ['They\'re putting a speed bump on Oak Street, finally.', 'Took a petition and three years.', 0], ['You smell that? Somebody\'s got a barbecue going.', 'That\'s Raj. Half the town will be there by noon.', 0],
  ['Did the news say anything about the plant up the river?', 'Some leak. They said it\'s nothing to worry about.', 0], ['I finally finished the fence.', 'It looks great. Crooked, but great.', 1],
];
function sayLines(u, key) { const T = L_[key]; return Array.isArray(T) ? T : T[u.pers.mood] || T.easy; }
// ---------------------------------------------------------------- who they are to each other
function bond(a, b) { if (!a || !b || a === b) return; (a.bonds ||= []).includes(b) || a.bonds.push(b); (b.bonds ||= []).includes(a) || b.bonds.push(a); }
// somebody they know just went down: everybody who sees it who cared about them falls apart for a moment
function mourn(v) {
  for (const u of v.bonds || []) {
    if (!u.active || !u.alive || u.gone || u.zu || u.downAt || !u.h || u.trip) continue;
    if (scripted(u) || u.role === 'medic' || u.role === 'bro') continue;
    if (u.s.pos.distanceTo(v.s.pos) > 26) continue;
    const H = u.h; if (H.ovr && H.ovr.k === 'grief') continue;
    later2(() => { if (!u.alive || u.gone || !u.h) return; u.h.ovr = { k: 'grief', t: rnd(2.6, 4.2) * (0.7 + u.pers.nervous * 0.6), v, said: 0 }; u.say(fill(pickU(u, L_.grief), u, v), 2.6); later2(() => u.alive && !u.gone && (vox(u, 'cry', { pri: 2, dur: rnd(2.5, 4) }) || scream(u, 0.8)), 1.2); }, rnd(0.2, 0.6));
  }
}
// ---------------------------------------------------------------- their state of mind
const SCRIPT_ST = new Set(['escape', 'runto', 'collapsed', 'sick', 'kneelhelp', 'goto', 'off', 'down']);
const scripted = u => SCRIPT_ST.has(u.st) || (PPL.marketOn && u.role === 'market') || !!u.amb || !!u.exit || !!u.trip || !!(u.enter && u.enter.ph > 0) || u.holdT > 0;
function newH(u) { return { fear: 0, stam: 1, bph: Math.random() * 6, pz: null, gaze: null, gzY: 0, gzP: 0, gazeT: rnd(1, 4), fidT: rnd(1, 5), heard: null, stare: 0, sayT: 0, waveT: rnd(2, 6), ovr: null, helpT: 0, spaceT: 0, sw: Math.random() * 6 }; }
function setPose(u, k, dur, data = null) { const H = u.h; if (!H) return; if (H.pz && H.pz.k === k) { H.pz.dur = Math.max(H.pz.dur, H.pz.t + dur); if (data) H.pz.data = data; return; } H.pz = { k, t: 0, dur, w: H.pz ? H.pz.w * 0.5 : 0, data }; }
function gazeAt(u, x, y, z, dur, pri = 1) { const H = u.h; if (!H) return; if (H.gaze && H.gaze.pri > pri && H.gaze.until > C.t) return; H.gaze = { p: (H.gaze && H.gaze.p) || V(), until: C.t + dur, pri, unit: null }; H.gaze.p.set(x, y, z); }
function gazeUnit(u, v, dur, pri = 1, y = 1.6) { if (!v || !v.s) return; gazeAt(u, v.s.pos.x, (v.s.pos.y || 0) + y * (v.sizeK || 1), v.s.pos.z, dur, pri); u.h.gaze.unit = v; u.h.gaze.uy = y; }
const armsFree = u => { const S = u.s; return !S.act && !S.up && !(u.handT > 0) && !u.bag && !(u.weapon && u.weapon !== 'fists') && u.st !== 'eat' && u.st !== 'grill'; };
// things people hear: gunshots, glass, alarms, screams, doors kicked in — and each other
const heardSet = new WeakSet();
PPL.voices = [];
function hearing() {
  const ev = [];
  for (const n of C.noises) { if (heardSet.has(n)) continue; heardSet.add(n); if ((n.loud || 0) >= 15) ev.push({ x: n.x, z: n.z, loud: n.loud, by: n.unit || null }); }
  for (const v of PPL.voices) ev.push(v);
  PPL.voices.length = 0;
  if (!ev.length) return;
  for (const u of PPL.list) {
    if (!u.active || !u.alive || u.gone || u.zu || !u.h) continue;
    for (const e of ev) {
      if (e.by === u) continue;
      const d = Math.hypot(e.x - u.s.pos.x, e.z - u.s.pos.z); if (d < 1 || d > Math.min(70, e.loud * 0.9)) continue;
      const H = u.h, k = e.loud / (d + 4);
      if (H.heard && H.heard.k > k && C.t < H.heard.at + 0.5) continue;
      H.heard = { x: e.x, z: e.z, loud: e.loud, d, k, voice: !!e.voice, by: e.by, at: C.t + d / 340 + rnd(0.12, 0.35) * (1.3 - u.pers.nervous * 0.6) };
    }
  }
}
// ---------------------------------------------------------------- before they move: what's on their mind changes what they do
function human(u, dt, cmd, P, W, pd) {
  const S = u.s, p = u.pers; if (!p || !u.alive || u.st === 'down') return;
  const H = u.h ||= newH(u);
  const scr = scripted(u), calm = PPL.phase === 'calm';
  const zn = calm && !PPL.marketOn ? null : nearestZombie(u, 16);
  // fear: what they can see, and what's happening
  const fearT = zn ? clamp(1.25 - zn.d / 14, 0, 1) : ['flee', 'panic', 'home'].includes(u.st) ? 0.65 : calm ? 0 : u.role === 'surv' || u.role === 'bro' ? 0.15 : 0.35;
  H.fear = damp(H.fear, Math.max(fearT * (0.6 + p.nervous * 0.5 - (u.role === 'surv' ? 0.2 : 0)), 0), fearT > H.fear ? 3 : 0.25, dt);
  // lungs: running costs breath (the unfit and the old run out fast); stopping gets it back
  const fast = S.speed > S.vw * 1.35;
  H.stam = clamp(H.stam + (fast ? -dt / Math.max(6, 9 + 30 * p.fit - 8 * p.age - (u.hp < 55 ? 5 : 0)) : dt * (0.05 + 0.07 * p.fit)), -0.2, 1);
  H.exert = damp(H.exert || 0, fast ? 1 : 0, fast ? 0.35 : 0.12, dt);
  const fleeing = ['flee', 'panic', 'home', 'run'].includes(u.st);
  // ---- something has taken them over for a moment (grief, horror, out of breath, anger, helping someone up)
  if (H.ovr) {
    const o = H.ovr; o.t -= dt;
    const tooClose = zn && zn.d < (o.k === 'grief' ? 2.0 : o.k === 'help' ? 2.2 : 2.8) && !u.doomed;
    if (o.t <= 0 || tooClose || scr) {
      if (o.k === 'blown') H.stam = 0.5;
      if (tooClose && !u.bubble && Math.random() < 0.6) u.say(sayLines(u, p.brave > 0.6 ? 'panicB' : 'panicS'), 1.6);
      H.ovr = null;
    } else return overrideStep(u, o, dt, cmd, zn, P, W);
  }
  if (scr) { if (zn && zn.d < 14) gazeUnit(u, zn.z, 0.5, 3, 1.5); return; }
  // ---- out of breath: they have to stop
  if (H.stam <= 0 && fleeing && !u.prey && !u.doomed && (!zn || zn.d > 7) && u.role !== 'bro' && u.role !== 'medic') {
    H.ovr = { k: 'blown', t: rnd(2.2, 4.2) * (1.3 - p.fit * 0.5) };
    if (!u.bubble && Math.random() < 0.75) u.say(p.age > 0.55 && Math.random() < 0.5 ? L_.blownOld : L_.blown, 2.2);
    return overrideStep(u, H.ovr, dt, cmd, zn, P, W);
  }
  // ---- the first look at one of them: horror (the brave get angry instead)
  if (zn && !H.seenZ && u.role !== 'surv' && u.role !== 'bro' && u.role !== 'medic' && W.los(tmp.set(S.pos.x, 1.5, S.pos.z), V(zn.z.s.pos.x, 1.5, zn.z.s.pos.z))) {
    H.seenZ = true;
    if (zn.d > 4.5 && !u.prey) {
      const angry = p.brave > 0.72 && Math.random() < 0.7;
      H.ovr = { k: angry ? 'anger' : 'horror', t: angry ? rnd(1.6, 2.6) : rnd(0.9, 1.8) * (0.6 + p.nervous * 0.8), z: zn.z };
      if (!u.bubble && Math.random() < (angry ? 0.8 : 0.55)) u.say(angry ? L_.anger : L_.horror, 2);
      return overrideStep(u, H.ovr, dt, cmd, zn, P, W);
    }
  }
  // ---- eyes on the thing that's coming for them
  if (zn && zn.d < 14) gazeUnit(u, zn.z, 0.6, 3, 1.5);
  // ---- cornered, and you're right there: they beg you for help
  if (zn && zn.d < 4 && fleeing && pd < 20 && P.alive && C.t > H.helpT && !u.bubble && u.role !== 'bro') { H.helpT = C.t + rnd(10, 16); u.say(L_.helpme, 2.2); gazeUnit(u, P, 1.2, 4, 1.65); }
  // ---- hurt: they limp and hold where it hurts (and slow down)
  if (u.hp < 55 && cmd.speed) cmd.speed *= 0.72 + 0.1 * p.fit;
  if (u.hp < 55 && !fast && armsFree(u) && !(H.pz && H.pz.k !== 'wound')) setPose(u, 'wound', 0.6);
  if (u.hp < 55 && C.t > (H.hurtT || 0) && !u.bubble && pd < 15) { H.hurtT = C.t + rnd(20, 35); u.say(L_.hurt, 2.2); }
  // ---- two of them running together: the stronger one in front looking back, calling the other on
  const F = u.flockF;
  if (F && F.alive && !F.gone && u.st === 'panic' && F.st === 'panic' && !(F.h && F.h.ovr && F.h.ovr.k !== 'blown')) {
    const df = F.s.pos.distanceTo(S.pos);
    if (df > 30) { u.flockF = null; F.flock = null; }
    else if (df > 7 && cmd.speed) {
      cmd.speed *= 0.55; gazeUnit(u, F, 0.8, 2);
      if (C.t > (H.callT || 0) && !u.bubble) { H.callT = C.t + rnd(5, 8); u.say(fill(pickU(u, L_.lead), u, F), 2); later2(() => F.alive && !F.gone && !F.bubble && F.h && F.s.pos.distanceTo(u.s.pos) > 7 && Math.random() < 0.6 && F.say(L_.lag, 1.8), 1.4); }
    } else if (Math.random() < dt * 0.3) gazeUnit(u, F, 0.7, 2);
  }
  // ---- a loud noise: the head goes round to it (and close by, they jump)
  if (H.heard && C.t >= H.heard.at) {
    const h = H.heard; H.heard = null;
    if (h.voice) { if (h.d < 13 && Math.random() < (calm ? 0.75 : 0.4) && !(zn && zn.d < 8)) { if (h.by) gazeUnit(u, h.by, rnd(0.8, 1.8), 1); else gazeAt(u, h.x, 1.6, h.z, 1.2, 1); } }
    else {
      gazeAt(u, h.x, 1.4, h.z, rnd(1.2, 2.6) * (0.7 + p.nervous * 0.6), 2);
      const close = h.loud >= 24 && h.d < Math.min(22, h.loud * 0.3);
      if (close && !S.up && !S.act) S.playUp('Hit_Head', { rate: 1.25 + p.nervous * 0.4, fade: 0.06, fadeAt: 0.42 + p.nervous * 0.15, fadeOut: 0.3 });   // the jump
      if (close) H.fear = Math.min(1, H.fear + 0.25 + p.nervous * 0.2);
      if (S.speed < 0.3 && !fleeing) H.turnTo = { a: Math.atan2(h.x - S.pos.x, h.z - S.pos.z), until: C.t + rnd(1.2, 2.2) };
      if (close && !u.bubble && C.t > (H.startleT || 0) && h.d < 30 && (calm || u.st === 'idle' || u.role === 'bro')) { H.startleT = C.t + 20; later2(() => u.alive && !u.gone && u.say(calm ? L_.startle : L_.startle2, 1.8), rnd(0.3, 0.7)); }
    }
  }
  if (H.turnTo && cmd.move == null && !fleeing) { if (C.t < H.turnTo.until && Math.abs(wrapPi(H.turnTo.a - S.yaw)) > 1.0) cmd.face = H.turnTo.a; else if (C.t >= H.turnTo.until) H.turnTo = null; }
  const stillish = S.speed < 0.35 && cmd.move == null;
  // ---- personal space: walk right up to them and they step back
  const easyGoing = calm || (u.role === 'surv' && u.st === 'idle');
  if (easyGoing && pd < 0.85 && stillish && !['kneel', 'grill', 'eat', 'queue'].includes(u.st) && u.role !== 'market' && u.role !== 'bro') {
    const a = Math.atan2(S.pos.x - P.s.pos.x, S.pos.z - P.s.pos.z); cmd.move = a; cmd.speed = 0.75;
    gazeUnit(u, P, 1.5, 3, 1.65);
    if (C.t > H.spaceT && !u.bubble) { H.spaceT = C.t + 25; u.say(p.mood === 'grumpy' ? L_.spaceG : L_.space, 1.8); }
  }
  // ---- you stand there staring at them: they notice
  if (easyGoing && pd < 4 && P.alive && (P.s.speed || 0) < 0.6) {
    const dx = S.pos.x - P.s.pos.x, dz = S.pos.z - P.s.pos.z, dl = Math.hypot(dx, dz) || 1;
    H.stare = (camF.x * dx + camF.z * dz) / dl > 0.94 ? H.stare + dt : Math.max(0, H.stare - dt * 2);
  } else H.stare = Math.max(0, H.stare - dt * 2);
  if (H.stare > 1.6) {
    gazeUnit(u, P, 0.5, 2, 1.65);
    if (H.stare > 3.2 && !u.bubble && C.t > (H.stareT || 0) && u.role !== 'market') { H.stareT = C.t + 40; u.say(p.mood === 'grumpy' ? L_.stareG : L_.stare, 2.2); }
  }
  // ---- a calm moment: their own little habits
  if (easyGoing || (u.role === 'bro' && u.st === 'follow')) idleLife(u, dt, cmd, P, W, pd, stillish);
}
// the override behaviours, one step
function overrideStep(u, o, dt, cmd, zn, P, W) {
  const S = u.s, H = u.h;
  cmd.move = null; cmd.speed = 0; cmd.crouch = false;
  if (S.act && o.k !== 'help') S.stopAct(0.2);
  if (o.k === 'blown') {   // bent over, hands on their knees, chest heaving, looking back for it
    setPose(u, 'knees', 0.5); H.exert = 1; S.talkT = Math.max(S.talkT || 0, 0.25); S.talkK = 0.45;
    if (zn) gazeUnit(u, zn.z, 0.4, 3, 1.4);
  } else if (o.k === 'horror') {   // frozen, staring at it, hands coming up to the face
    if (o.z && o.z.alive) { cmd.face = Math.atan2(o.z.s.pos.x - S.pos.x, o.z.s.pos.z - S.pos.z); gazeUnit(u, o.z, 0.4, 4, 1.5); }
    if (u.pers.nervous > 0.4) setPose(u, 'face', 0.4); else setPose(u, 'recoil', 0.4);
  } else if (o.k === 'anger') {   // shouting at it, a fist up
    if (o.z && o.z.alive) { cmd.face = Math.atan2(o.z.s.pos.x - S.pos.x, o.z.s.pos.z - S.pos.z); gazeUnit(u, o.z, 0.4, 4, 1.5); }
    setPose(u, 'fist', 0.4, { z: o.z }); S.talkT = Math.max(S.talkT || 0, 0.2); S.talkK = 1;
  } else if (o.k === 'grief') {   // frozen, hands to the face, sobbing
    const v = o.v; if (v && v.s) { cmd.face = Math.atan2(v.s.pos.x - S.pos.x, v.s.pos.z - S.pos.z); gazeAt(u, v.s.pos.x, 0.3, v.s.pos.z, 0.4, 4); }
    setPose(u, 'face', 0.5, { sob: true }); S.talkT = Math.max(S.talkT || 0, 0.25); S.talkK = 0.6;
    o.said += dt; if (o.said > 1.8 && !u.bubble) { o.said = -9; u.say(L_.sob, 1.8); vox(u, 'cry', { pri: 1, dur: rnd(2, 3.5) }); }
  } else if (o.k === 'help') {   // to the one on the ground, a hand down, and up they come
    const v = o.v;
    if (!v || !v.alive || !v.trip) { if (v && v.alive && o.done && !v.bubble) later2(() => v.alive && v.say(L_.helped, 1.8), 0.6); o.t = 0; return cmd; }
    const d = Math.hypot(v.s.pos.x - u.s.pos.x, v.s.pos.z - u.s.pos.z);
    if (d > 1.05) { steer(u, v.s.pos.x, v.s.pos.z, run(u) * 0.8, cmd, dt); gazeUnit(u, v, 0.4, 3, 0.4); }
    else {
      cmd.face = Math.atan2(v.s.pos.x - S.pos.x, v.s.pos.z - S.pos.z);
      setPose(u, 'reachdown', 0.5, { v }); gazeUnit(u, v, 0.4, 3, 0.4);
      if (!o.done) { o.done = true; o.t = Math.min(o.t, 1.6); u.say(L_.helpUp, 1.8); if (v.trip && !v.trip.up) v.trip.dn = Math.min(v.trip.dn || 9, v.trip.t + 0.35); }
    }
  }
  return cmd;
}
// a standing-around moment: fidgets, glances, the phone, a wave to a neighbour, a laugh
function idleLife(u, dt, cmd, P, W, pd, stillish) {
  const S = u.s, H = u.h, p = u.pers, calm = PPL.phase === 'calm';
  // where the eyes go
  H.gazeT -= dt;
  if (H.gazeT <= 0) {
    H.gazeT = rnd(1.8, 5.5) * (1.4 - p.nervous * 0.6);
    const r = Math.random();
    let v = null, bd = 13;
    if (r < 0.45) for (const o of C.npcs) { if (o === u || !o.s.visible && o.s.pos.distanceTo(S.pos) > 13) continue; const d = o.s.pos.distanceTo(S.pos); if (d < bd && (o.s.speed > 0.3 || o.bubble)) { bd = d; v = o; } }
    if (v) gazeUnit(u, v, rnd(1.2, 2.6), 1);
    else if (r < 0.6 && pd < 10 && P.alive) gazeUnit(u, P, rnd(1, 2), 1, 1.65);
    else if (r < 0.7 && calm) gazeAt(u, S.pos.x + Math.sin(S.yaw + rnd(-1, 1)) * 10, rnd(6, 12), S.pos.z + Math.cos(S.yaw + rnd(-1, 1)) * 10, rnd(1.2, 2.2), 1);   // a bird, a plane
    else if (r < 0.85) { const a = S.yaw + rnd(-1.2, 1.2); gazeAt(u, S.pos.x + Math.sin(a) * 8, rnd(1.0, 1.8), S.pos.z + Math.cos(a) * 8, rnd(1, 2.5), 1); }
  }
  // a wave to a neighbour across the street (and they wave back)
  if (calm && u.role !== 'market') {
    H.waveT -= dt;
    if (H.waveT <= 0) {
      H.waveT = rnd(4, 9);
      if (armsFree(u) && !u.bubble && Math.random() < 0.25 + p.chatty * 0.5) {
        let v = null, bd = 16;
        for (const o of C.npcs) { if (o === u || o === u.partner || !o.h || o.role === 'market' || o.h.ovr) continue; const d = o.s.pos.distanceTo(S.pos); if (d > 5 && d < bd && !(H.waved ||= new Set()).has(o)) { bd = d; v = o; } }
        if (v) {
          H.waved.add(v); (v.h.waved ||= new Set()).add(u);
          setPose(u, 'wave', 1.7); gazeUnit(u, v, 2.5, 2);
          if (Math.random() < 0.6) u.say(fill(pickU(u, L_.wave), u, v), 2);
          later2(() => { if (!v.alive || v.gone || !v.h || PPL.phase !== 'calm') return; gazeUnit(v, u, 2.2, 2); if (armsFree(v) && Math.random() < 0.75) setPose(v, 'wave', 1.5); if (!v.bubble && Math.random() < 0.4) v.say(fill(pickU(v, L_.wave), v, u), 1.8); }, rnd(0.5, 1.0));
        }
      }
    }
  }
  // the walk round the block: some of them text as they go
  if (calm && u.st === 'walk' && u.errand && u.errand.phone && u.errand.ph === 'go' && S.speed > 0.2 && armsFree(u)) { setPose(u, 'phone', 0.4); if (cmd.speed) cmd.speed *= 0.85; }
  // in the park: some sit down a while
  if (calm && u.st === 'walk' && u.errand && u.errand.kind === 'park' && u.errand.ph === 'do' && u.errand.sit) cmd.crouch = true;
  // a fidget
  if (!stillish) return;
  H.fidT -= dt;
  if (H.fidT > 0 || (H.pz && H.pz.t < H.pz.dur)) return;
  H.fidT = rnd(2.5, 7) * (1.3 - p.nervous * 0.5);
  if (u.role === 'bro' && u.weapon === 'bat' && !S.act && !S.up) {   // Ben, bat in his right hand: the left one fidgets
    const ch = Math.random();
    if (ch < 0.35) { setPose(u, 'phoneL', rnd(3, 6)); if (!calm && !u.bubble && Math.random() < 0.5) later2(() => u.alive && !u.gone && u.say(['Still no signal.', 'Mom\'s still not picking up.', 'Nothing. Network\'s down.'], 2.2), 1.5); }
    else if (ch < 0.55) setPose(u, 'browL', 1.5);
    else if (ch < 0.7) setPose(u, 'scratchL', 2);
    return;
  }
  if (!armsFree(u)) return;
  const tired = p.mood === 'tired', grumpy = p.mood === 'grumpy', listening = u.st === 'chat' || u.group || (u.errand && u.errand.kind === 'meet');
  const opts = [['phone', 1 + (p.age < 0.35 ? 1.6 : 0) + (p.mood === 'anxious' ? 0.6 : 0) - (listening ? 0.8 : 0), rnd(4, 10)], ['cross', 0.8 + (grumpy ? 1.5 : 0) + (listening ? 1 : 0), rnd(4, 9)], ['hips', 0.7 + (p.mood === 'cheerful' ? 0.6 : 0), rnd(3, 7)],
    ['scratch', 0.35 + p.nervous * 0.6, rnd(1.6, 2.4)], ['brow', 0.3 + (H.exert > 0.2 ? 2 : 0) + (calm ? 0 : 0.6), 1.5], ['stretch', 0.25 + (tired ? 0.9 : 0), 2.6], ['yawn', 0.15 + (tired ? 1.2 : 0), 2.3], ['none', 1.6, 0]];
  if (!calm) { opts[0][1] = u.role === 'bro' ? 0.5 : 0.25; opts[5][1] = 0.05; opts[6][1] = 0.02; }
  let tot = 0; for (const o of opts) tot += Math.max(0, o[1]);
  let r = Math.random() * tot, ch = opts[opts.length - 1];
  for (const o of opts) { r -= Math.max(0, o[1]); if (r <= 0) { ch = o; break; } }
  if (ch[0] === 'none') return;
  setPose(u, ch[0], ch[2]);
  if (ch[0] === 'yawn') { S.talkT = 0; if (u.s.pos.distanceTo((X.P() || u).s.pos) < 14) vox(u, 'yawn', { gain: 0.8, mouth: false }); }
  if (ch[0] === 'phone' && !calm && u.role === 'bro' && !u.bubble && Math.random() < 0.5) later2(() => u.alive && u.say(['Still no signal.', 'Mom\'s still not picking up.', 'Nothing. Network\'s down.'], 2.2), 1.5);
}
// a pair on the lawn, talking: one tells it, the other listens, nods, laughs
function chatLife(u, dt) {
  const v = u.partner; if (!v || !v.alive || v.gone || !u.h) return false;
  const lead = u.i < v.i;
  if (!lead) return false;
  u.h.chatT = (u.h.chatT ?? rnd(2, 5)) - dt;
  if (u.h.chatT > 0 || u.bubble || v.bubble) return true;
  const ch = (u.h.chatQ ||= CHATS.slice().sort(() => Math.random() - 0.5)); u.h.chatI = (u.h.chatI || 0) + 1;
  if (u.h.chatI % ch.length === 0) ch.sort(() => Math.random() - 0.5);   // a full pass: a new order, not the same loop
  const c = ch[u.h.chatI % ch.length];
  const [a, b] = Math.random() < 0.5 ? [u, v] : [v, u];
  u.h.chatT = rnd(9, 15) * (1.4 - (a.pers.chatty + b.pers.chatty) * 0.35);
  a.say(c[0], 3.2); if (!a.s.up) a.s.playUp('Interact', { rate: rnd(0.7, 0.95), fade: 0.25, fadeAt: 1.4 });
  setPose(b, 'nod', 1.6);
  later2(() => { if (!b.alive || b.gone || PPL.phase !== 'calm' || b.st !== 'chat') return; b.say(c[1], 2.6); if (!b.s.up) b.s.playUp('Interact', { rate: 0.8, fade: 0.25, fadeAt: 1.2 }); setPose(a, 'nod', 1.4); }, 3.4);
  if (c[2]) later2(() => {   // the reply lands: the teller cracks up, and it gets the other one going
    if (!a.alive || a.gone || !b.alive || b.gone || PPL.phase !== 'calm' || b.st !== 'chat' || Math.random() > 0.8) return;
    setPose(a, 'laugh', 1.4); setPose(b, 'laugh', 1.2); vox(a, 'laugh', { pri: 1 }); if (!a.bubble) a.say(L_.laugh, 1.8);   // (the laugh first: the line then rides on it)
    later2(() => b.alive && vox(b, 'laugh', { gain: 0.8 }), 0.4);
  }, 6.4);
  return true;
}
// somebody tripped: a brave one nearby goes back for them
function findHelper(v) {
  let best = null, bd = 9;
  for (const u of C.npcs) {
    if (u === v || !u.h || !u.alive || u.gone || u.h.ovr || u.prey || u.doomed || scripted(u) || !['flee', 'panic', 'home'].includes(u.st) || u.pers.brave < 0.5) continue;
    if (u.enter) continue;
    const d = u.s.pos.distanceTo(v.s.pos); if (d < bd && (u.flockF === v || u.flock === v || u.pers.brave > 0.7 || (u.bonds || []).includes(v))) { bd = d; best = u; }
  }
  if (best) best.h.ovr = { k: 'help', t: 5, v };
}
// pairs who run together after noon: the chatting couple, neighbours who were near each other
function flockUp() {
  const L = PPL.list.filter(u => u.active && u.alive && !u.gone && u.st === 'panic' && !u.prey && u.h);
  for (const u of L) { u.flock = null; u.flockF = null; }
  for (const u of L) {
    if (u.flock || u.flockF) continue;
    let v = u.partner && L.includes(u.partner) && !u.partner.flock && !u.partner.flockF ? u.partner : null;
    if (!v && Math.random() < 0.6) { let bd = 9; for (const o of L) { if (o === u || o.flock || o.flockF) continue; const d = o.s.pos.distanceTo(u.s.pos); if (d < bd) { bd = d; v = o; } } }
    if (!v) continue;
    const [lead, fol] = (u.pers.fit + u.pers.brave) >= (v.pers.fit + v.pers.brave) ? [u, v] : [v, u];
    lead.flockF = fol; fol.flock = lead; bond(lead, fol);
    later2(() => lead.alive && !lead.gone && !lead.bubble && lead.say(fill(pickU(lead, L_.callRun), lead, fol), 2), rnd(0.6, 1.6));
  }
}
// the follower's plan: wherever the leader's going
function flockPlan(u) {
  const Ld = u.flock; if (!Ld || !Ld.alive || Ld.gone || Ld.st !== 'panic' || !Ld.plan || !Ld.plan.at || Ld.s.pos.distanceTo(u.s.pos) > 25) return null;
  const L = Ld.plan, a = rnd(0, 6.28), at = [L.at[0] + Math.sin(a) * 1.4, L.at[1] + Math.cos(a) * 1.4];
  if (!X.world.walkable(at[0], at[1])) { at[0] = L.at[0]; at[1] = L.at[1]; }
  const P = { t: 0, ph: 'go', at, k: rnd(1.0, 1.08), prog: { d: 1e9, n: 0, t: C.t + 2.5 }, kind: L.kind === 'car' ? 'far' : L.kind, dur: L.dur || rnd(2, 5), face: L.face };
  u.plans = (u.plans || 0) + 1; u.path = null; go(u, at[0], at[1]);
  return (u.plan = P);
}
// the whole street, a few times a second: someone warns you, someone thanks you
function social(dt, P, W) {
  PPL.socT = (PPL.socT || 0) - dt; if (PPL.socT > 0) return; PPL.socT = 0.2;
  if (!P.alive || PPL.phase === 'calm' || X.G.state !== 'play') return;
  // you just put one down near them
  for (const z of Z.list) {
    if (z.alive || z.lastHitBy !== P || z.thankSeen === z.lastHitT || C.t - (z.lastHitT || -9) > 0.6) continue;
    z.thankSeen = z.lastHitT;
    if (C.t < (PPL.thankT || 0)) continue;
    let best = null, bd = 8;
    for (const u of C.npcs) { if (!u.h || u.gone || !u.alive || u.h.ovr || scripted(u) || u.role === 'medic') continue; const d = u.s.pos.distanceTo(z.s.pos); if (d < bd && u.s.pos.distanceTo(P.s.pos) < 14) { bd = d; best = u; } }
    if (!best) continue;
    PPL.thankT = C.t + 8;
    const u = best, p = u.pers;
    later2(() => { if (!u.alive || u.gone || u.bubble) return; u.say(u.role === 'bro' ? BEN.kill.concat(['Nice one, {P}.'.replace('{P}', X.G.pname || 'Sam')]) : p.mood === 'grumpy' && Math.random() < 0.5 ? L_.thankG : p.brave > 0.55 ? L_.thankB : L_.thankS, 2.4); gazeUnit(u, P, 2.5, 3, 1.65); setPose(u, 'nod', 1.2); }, rnd(0.5, 0.9));
  }
  // one of them coming up behind you
  if (C.t > (PPL.warnT || 0)) {
    const cx = camF.x, cz = camF.z, cl = Math.hypot(cx, cz) || 1;
    for (const z of Z.list) {
      if (!z.active || !z.alive) continue;
      const dx = z.s.pos.x - P.s.pos.x, dz = z.s.pos.z - P.s.pos.z, d = Math.hypot(dx, dz);
      if (d > 4.5 || d < 1.2 || (dx * cx + dz * cz) / (d * cl) > -0.35) continue;
      let best = null, bd = 16;
      for (const u of C.npcs) { if (!u.h || u.gone || !u.alive || u.h.ovr || scripted(u) || u.role === 'medic') continue; const du = u.s.pos.distanceTo(P.s.pos); if (du < bd && du > 1.5 && W.los(tmp.set(u.s.pos.x, 1.6, u.s.pos.z), V(z.s.pos.x, 1.4, z.s.pos.z))) { bd = du; best = u; } }
      if (!best) break;
      PPL.warnT = C.t + 9;
      best.say(fill(pickU(best, L_.warn), best, null), 1.8); best.s.talkK = 1;
      gazeUnit(best, z, 1.6, 4, 1.4); if (armsFree(best)) setPose(best, 'point', 1.4, { z });
      break;
    }
  }
}
// ---------------------------------------------------------------- after the pose: the body itself
const UP3 = V(0, 1, 0), bF = V(), bL = V(), q1 = V(), q2 = V(), q3 = V(), q4 = V(), q5 = V();
const bpos = (S, n, o) => S.B[n].getWorldPosition(o);
function ik(S, side, p, f, s, curl, w) { if (w < 0.01) return; f.normalize(); s.addScaledVector(f, -s.dot(f)); if (s.lengthSq() < 1e-6) s.set(0, 1, 0); s.normalize(); S.reach(side, { p, f, s, curl, blend: true }, w); }
function bend(S, a1, a2, a0 = 0) { if (a0) addTurn(S.B.Spine, bL, a0); if (a1) addTurn(S.B.Spine1, bL, a1); if (a2) addTurn(S.B.Spine2, bL, a2); }
function nodHead(S, a) { if (a) addTurn(S.B.Head, bL, a); }
// one hand at a place on (or near) the body. side: 1 right, -1 left
function handAt(S, side, base, fw, up, out, f, s, curl, w) {
  bpos(S, base, q1).addScaledVector(bF, fw).addScaledVector(UP3, up).addScaledVector(bL, -side * out);
  ik(S, side, q1, f, s, curl, w);
}
const POSES = {
  // left-hand-only versions (a bat in the right)
  phoneL(S, w, t, u) {
    bend(S, 0.03 * w, 0.05 * w); addTurn(S.B.Neck, bL, 0.22 * w); nodHead(S, 0.3 * w);
    handAt(S, -1, 'Spine2', 0.3, -0.04, -0.03, q2.copy(bF).multiplyScalar(0.7).addScaledVector(UP3, 0.45).addScaledVector(bL, -0.45), q3.copy(UP3).addScaledVector(bL, -0.3), 0.55, w);
    phoneLOn(u, w > 0.5);
  },
  browL(S, w, t, u, dur) {
    const ph = clamp(t / Math.max(0.5, dur - 0.3), 0, 1);
    handAt(S, -1, 'Head', 0.16, 0.07, lerp(-0.1, 0.09, ph), q2.copy(bL).multiplyScalar(-1).addScaledVector(UP3, 0.2), q3.copy(UP3).multiplyScalar(-1).addScaledVector(bF, 1), 0.2, w);
    nodHead(S, -0.08 * w);
  },
  scratchL(S, w, t) {
    const k = Math.sin(t * 14) * 0.02;
    handAt(S, -1, 'Head', -0.02, 0.12 + k, 0.04, q2.copy(bL).multiplyScalar(-0.8).addScaledVector(UP3, 0.2).addScaledVector(bF, -0.4), q3.copy(bF), 0.6, w);
    addTurn(S.B.Head, bF, 0.12 * w); nodHead(S, 0.1 * w);
  },
  // the news crew: a camera up on the right shoulder, a microphone held at the chest
  camop(S, w) {
    handAt(S, 1, 'Head', 0.2, -0.06, 0.15, q2.copy(bF).addScaledVector(UP3, 0.15), q3.copy(bL).multiplyScalar(-1), 0.85, w);
    handAt(S, -1, 'Spine2', 0.38, 0.12, -0.02, q2.copy(bF).addScaledVector(bL, -0.4), q3.copy(UP3), 0.6, w * 0.8);
    addTurn(S.B.Head, bF, 0.1 * w);
  },
  mic(S, w) {
    handAt(S, 1, 'Spine2', 0.3, 0.16, 0.08, q2.copy(UP3).addScaledVector(bF, 0.35), q3.copy(bL), 0.85, w);
  },
  phone(S, w, t, u) {   // reading something on the phone, head down
    bend(S, 0.04 * w, 0.06 * w); addTurn(S.B.Neck, bL, 0.25 * w); nodHead(S, 0.35 * w);
    handAt(S, 1, 'Spine2', 0.3, -0.04, -0.03, q2.copy(bF).multiplyScalar(0.7).addScaledVector(UP3, 0.45).addScaledVector(bL, 0.45), q3.copy(UP3).addScaledVector(bL, 0.3), 0.55, w);
    handAt(S, -1, 'Spine2', 0.27, -0.1, 0.06, q2.copy(bF).multiplyScalar(0.7).addScaledVector(UP3, 0.3).addScaledVector(bL, -0.5), q3.copy(UP3), 0.35, w * 0.7);
    phoneOn(u, w > 0.5);
  },
  cross(S, w) {   // arms folded
    handAt(S, 1, 'Spine2', 0.2, -0.17, -0.13, q2.copy(bL).addScaledVector(bF, 0.25), q3.copy(UP3).multiplyScalar(-1).addScaledVector(bF, 0.4), 0.6, w);
    handAt(S, -1, 'Spine2', 0.17, -0.12, -0.12, q2.copy(bL).multiplyScalar(-1).addScaledVector(bF, 0.2), q3.copy(UP3).addScaledVector(bF, 0.3), 0.6, w);
  },
  hips(S, w) {   // hands on hips
    for (const sd of [1, -1]) handAt(S, sd, sd > 0 ? 'RightUpLeg' : 'LeftUpLeg', 0.02, 0.13, 0.1, q2.copy(bF).multiplyScalar(0.5).addScaledVector(UP3, -0.6).addScaledVector(bL, sd * 0.45), q3.copy(UP3).addScaledVector(bF, -0.2), 0.5, w);
  },
  scratch(S, w, t) {   // a scratch at the back of the head
    const k = Math.sin(t * 14) * 0.02;
    handAt(S, 1, 'Head', -0.02, 0.12 + k, 0.04, q2.copy(bL).multiplyScalar(0.8).addScaledVector(UP3, 0.2).addScaledVector(bF, -0.4), q3.copy(bF), 0.6, w);
    addTurn(S.B.Head, bF, -0.12 * w); nodHead(S, 0.1 * w);
  },
  brow(S, w, t, u, dur) {   // the back of a hand across the forehead
    const ph = clamp(t / Math.max(0.5, dur - 0.3), 0, 1);
    handAt(S, 1, 'Head', 0.16, 0.07, lerp(-0.1, 0.09, ph), q2.copy(bL).addScaledVector(UP3, 0.2), q3.copy(UP3).multiplyScalar(-1).addScaledVector(bF, 1), 0.2, w);
    nodHead(S, -0.08 * w);
  },
  stretch(S, w, t) {   // arms up over the head, a lean back
    const e = Math.sin(clamp(t / 2.3, 0, 1) * Math.PI);
    bend(S, -0.08 * w * e, -0.08 * w * e); nodHead(S, -0.15 * w * e);
    for (const sd of [1, -1]) handAt(S, sd, 'Head', -0.02, 0.38, 0.12, q2.copy(UP3).addScaledVector(bL, sd * 0.2), q3.copy(bF), 0.6, w * e);
  },
  yawn(S, w, t) {   // a hand to the mouth, head back, jaw wide
    const e = Math.sin(clamp(t / 2.1, 0, 1) * Math.PI);
    nodHead(S, -0.22 * w * e); addTurn(S.B.Neck, bL, -0.08 * w * e);
    handAt(S, -1, 'Head', 0.14, -0.06, 0.0, q2.copy(bL).multiplyScalar(-1).addScaledVector(UP3, 0.5), q3.copy(UP3).addScaledVector(bF, -0.6), 0.3, w * e);
    S.setMorph(['jawOpen', 'mouthOpen'], 0.85 * w * e);
  },
  wave(S, w, t) {   // a hand up, waving
    const k = Math.sin(t * 10) * 0.08;
    handAt(S, 1, 'RightShoulder', 0.16, 0.42, 0.12 + k, q2.copy(UP3).addScaledVector(bL, -k * 3), q3.copy(bL), 0.05, w);
  },
  face(S, w, t, u, dur, data) {   // both hands to the face (horror, grief)
    const sob = data && data.sob ? Math.sin(t * 9) * 0.04 : 0;
    bend(S, 0.1 * w, 0.12 * w + sob); nodHead(S, 0.22 * w);
    for (const sd of [1, -1]) handAt(S, sd, 'Head', 0.13, -0.02, 0.05, q2.copy(UP3).addScaledVector(bF, -0.25).addScaledVector(bL, sd * 0.25), q3.copy(bL).multiplyScalar(sd), 0.25, w);
  },
  recoil(S, w) {   // hands up in front, leaning away
    bend(S, -0.1 * w, -0.08 * w); nodHead(S, 0.05 * w);
    for (const sd of [1, -1]) handAt(S, sd, 'Spine2', 0.32, 0.12, 0.17, q2.copy(UP3).addScaledVector(bF, 0.3), q3.copy(bL).multiplyScalar(sd), 0.15, w);
  },
  fist(S, w, t) {   // a fist up, shaking it
    const k = Math.sin(t * 13) * 0.04;
    bend(S, 0.05 * w, 0.06 * w);
    handAt(S, 1, 'RightShoulder', 0.28, 0.28 + k, 0.08, q2.copy(UP3).addScaledVector(bF, 0.4), q3.copy(bL), 1, w);
  },
  point(S, w, t, u, dur, data) {   // an arm out at the thing behind you
    const z = data && data.z; if (!z || !z.s) return;
    bpos(S, 'RightShoulder', q4); q5.set(z.s.pos.x - q4.x, 1.3 - q4.y, z.s.pos.z - q4.z).normalize();
    q1.copy(q4).addScaledVector(q5, 0.62);
    ik(S, 1, q1, q2.copy(q5), q3.copy(UP3), 0.55, w);
  },
  reachdown(S, w, t, u, dur, data) {   // bent over, a hand down to the one on the ground
    const v = data && data.v; bend(S, 0.25 * w, 0.2 * w, 0.15 * w);
    if (!v || !v.s) return;
    v.s.B.Spine2.getWorldPosition(q4);
    bpos(S, 'RightShoulder', q5); q1.copy(q4).sub(q5); const L = q1.length(); q1.multiplyScalar(Math.min(1, 0.6 / (L || 1))).add(q5);
    ik(S, 1, q1, q2.copy(q4).sub(q5), q3.copy(bL), 0.6, w);
  },
  knees(S, w, t) {   // hands on knees, getting their breath back
    bend(S, 0.42 * w, 0.3 * w, 0.38 * w); nodHead(S, -0.55 * w); addTurn(S.B.Neck, bL, -0.25 * w);
    for (const sd of [1, -1]) { bpos(S, sd > 0 ? 'RightLeg' : 'LeftLeg', q1).addScaledVector(UP3, 0.13).addScaledVector(bF, 0.06); ik(S, sd, q1, q2.copy(UP3).multiplyScalar(-1).addScaledVector(bF, 0.5), q3.copy(bL).multiplyScalar(-sd), 0.4, w); }
  },
  wound(S, w, t, u) {   // a hand pressed where it hurts
    const sd = -(u.pers.wound || 1);
    handAt(S, sd, 'Spine1', 0.17, 0.02, -0.05, q2.copy(bL).multiplyScalar(sd).addScaledVector(UP3, -0.3), q3.copy(UP3), 0.5, w);
    addTurn(S.B.Spine1, bF, 0.06 * w * -sd); bend(S, 0.08 * w, 0);
  },
  laugh(S, w, t) { const k = Math.sin(t * 15) * 0.05; nodHead(S, (-0.3 + k) * w); bend(S, 0, -0.06 * w + k * w); S.setMorph(['jawOpen', 'mouthOpen'], (0.45 + k * 4) * w); },
  nod(S, w, t) { nodHead(S, Math.sin(t * 6.5) * 0.13 * w); },
};
const HEAD_ONLY = new Set(['laugh', 'nod']), LEFT_ONLY = new Set(['phoneL', 'browL', 'scratchL']);
PPL.setPose = (u, k, dur, data) => { u.h ||= newH(u); setPose(u, k, dur, data); };   // (tests and main.js can pose somebody)
// a phone in the hand (made once per person, shown only while it's out)
function phoneMesh() {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.148, 0.009), new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.35, metalness: 0.4 })); g.add(b);
  const s = new THREE.Mesh(new THREE.PlaneGeometry(0.064, 0.134), new THREE.MeshStandardMaterial({ color: 0x0a1a2a, emissive: 0x6a9ad8, emissiveIntensity: 0.55, roughness: 0.2 })); s.position.z = 0.0048; g.add(s);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function phoneLOn(u, on) {   // the phone in the left hand
  if (on && !u.phoneL) { const hb = u.s.B.LeftHand; if (!hb) return; hb.updateWorldMatrix(true, false); hb.getWorldScale(sclV); const m = phoneMesh(); hb.add(m); m.scale.set(1 / sclV.x, 1 / sclV.y, 1 / sclV.z); m.position.set(0, 0.085 / sclV.y, 0.03 / sclV.z); m.rotation.set(-1.35, 0, 0); u.phoneL = m; }
  if (u.phoneL) u.phoneL.visible = on;
}
function phoneOn(u, on) {
  if (on && !u.phone) { u.phone = hold(u, phoneMesh(), [0.0, 0.085, 0.03], [-1.35, 0, 0]); if (!u.phone) return; }
  if (u.phone) u.phone.visible = on;
}
function body(u, dt) {
  const S = u.s, H = u.h, p = u.pers; if (!H || !p || S.dead || S.frozen || !u.alive) { if (u.phone) u.phone.visible = false; if (u.phoneL) u.phoneL.visible = false; return; }
  const B = S.B; if (!B.Spine2 || !B.Head) return;
  bF.set(Math.sin(S.yaw), 0, Math.cos(S.yaw)); bL.set(Math.cos(S.yaw), 0, -Math.sin(S.yaw));
  const actW = S.act ? clamp(S.acts[S.act].w, 0, 1) : 0, free = 1 - actW, still = S.speed < 0.3 ? 1 : 0;
  // getting on a bit: a stoop, the head held forward
  if (p.age > 0.4 && free > 0.01) { const k = (p.age - 0.4) * free; bend(S, 0.2 * k, 0.16 * k); addTurn(B.Neck, bL, -0.14 * k); nodHead(S, -0.1 * k); }
  // breathing: slow and easy, or fast and hard when scared or out of breath
  const hard = Math.max(H.fear * 0.8, H.exert || 0, S.exertion * 0.7);
  H.bph += dt * Math.PI * 2 * lerp(0.24, 1.5, hard);
  const br = Math.sin(H.bph) * lerp(0.012, 0.055, hard) * free;
  addTurn(B.Spine2, bL, -br); addTurn(B.Neck, bL, br * 0.6);
  if (B.LeftShoulder) { addTurn(B.LeftShoulder, bF, -br * 0.8); addTurn(B.RightShoulder, bF, br * 0.8); }
  // standing: the weight goes from one foot to the other
  if (still && free > 0.5) { const sw = Math.sin(C.t * (0.35 + p.nervous * 0.3) + H.sw); addTurn(B.Hips, bF, 0.03 * sw * free); addTurn(B.Spine, bF, -0.035 * sw * free); }
  // hurt: one leg drags, the body dips over it
  if (u.hp < 55 && S.speed > 0.3) { const ph = Math.sin(S.phase * Math.PI * 2), sd = u.pers.wound; addTurn(B.Hips, bF, 0.07 * ph * sd * free); addTurn(B.Spine1, bF, -0.06 * ph * sd * free); }
  // scared: shoulders up, a hunch, hands that won't keep still
  if (H.fear > 0.3 && free > 0.5) {
    const f = (H.fear - 0.3) / 0.7;
    bend(S, 0.05 * f, 0.06 * f);
    if (B.LeftShoulder) { addTurn(B.LeftShoulder, bF, -0.08 * f); addTurn(B.RightShoulder, bF, 0.08 * f); }
    const tr = 0.035 * f * (0.5 + p.nervous);
    if (B.LeftForeArm) { addTurn(B.LeftForeArm, bF, Math.sin(C.t * 31 + u.i) * tr); addTurn(B.RightForeArm, bF, Math.sin(C.t * 27 + u.i * 2) * tr); }
  }
  // a pose of the hands (or the head)
  const Z0 = H.pz;
  if (Z0) {
    Z0.t += dt;
    const ok = HEAD_ONLY.has(Z0.k) || armsFree(u) || LEFT_ONLY.has(Z0.k) && !S.act && !S.up && !(u.handT > 0) || (Z0.k === 'knees' || Z0.k === 'face' || Z0.k === 'recoil' || Z0.k === 'reachdown') && !S.act && !(u.handT > 0);
    const want = ok && Z0.t < Z0.dur - 0.35 ? 1 : 0;
    Z0.w = clamp(Z0.w + (want ? dt / 0.35 : -dt / 0.35), 0, 1);
    if (Z0.w > 0.005) { const e = Z0.w * Z0.w * (3 - 2 * Z0.w); POSES[Z0.k](S, e, Z0.t, u, Z0.dur, Z0.data); }
    if (Z0.k !== 'phone' || Z0.w < 0.5) phoneOn(u, false);
    if (Z0.k !== 'phoneL' || Z0.w < 0.5) phoneLOn(u, false);
    if (Z0.t >= Z0.dur && Z0.w <= 0) { H.pz = null; phoneOn(u, false); }
  } else if (u.phone && u.phone.visible) phoneOn(u, false);
  // the eyes and the head: round to whatever they're looking at (on top of where the walk already points the head)
  const G = H.gaze;
  let ty = 0, tp = 0;
  if (G && G.until > C.t) {
    if (G.unit && G.unit.s) G.p.set(G.unit.s.pos.x, (G.unit.s.pos.y || 0) + (G.uy || 1.6) * (G.unit.sizeK || 1), G.unit.s.pos.z);
    const dx = G.p.x - S.pos.x, dz = G.p.z - S.pos.z;
    const want = clamp(wrapPi(Math.atan2(dx, dz) - S.yaw), -1.35, 1.35);
    ty = clamp(want - S.look, -1.2, 1.2) * (1 - actW * 0.8);
    tp = (clamp(Math.atan2(G.p.y - (S.pos.y || 0) - 1.6, Math.max(0.4, Math.hypot(dx, dz))), -0.6, 0.55) - S.lookP) * (1 - actW * 0.8);
  } else if (G) H.gaze = null;
  H.gzY = damp(H.gzY, ty, 7 + p.nervous * 5, dt); H.gzP = damp(H.gzP, tp, 6, dt);
  if (Math.abs(H.gzY) > 0.003 || Math.abs(H.gzP) > 0.003) {
    addTurn(B.Neck, UP3, H.gzY * 0.4); addTurn(B.Head, UP3, H.gzY * 0.6);
    const a = S.yaw + S.look + H.gzY; q1.set(Math.cos(a), 0, -Math.sin(a)); addTurn(B.Head, q1, -H.gzP);
  }
}

// ---------------------------------------------------------------- the tick
const tmp = V(), camF = V();
export function peopleStep(dt, focus) {
  if (!X) return;
  for (let i = pend.length - 1; i >= 0; i--) if (C.t >= pend[i].t) { const f = pend[i].fn; pend.splice(i, 1); f(); }
  if (PPL.ambs && PPL.ambs.length) ambTick(dt);
  const W = X.world, P = X.P(), cam = X.camera;
  cam.getWorldDirection(camF);
  PPL.talkT = (PPL.talkT || 0) - dt;
  if (PPL.flockAt && C.t >= PPL.flockAt) { PPL.flockAt = 0; flockUp(); }
  hearing(); social(dt, P, W);
  let changed = false;
  for (const u of PPL.list) {
    if (!u.active) continue;
    if (u.boarded && u.seat != null && HELI.group()) { seated(u, dt); continue; }   // in the helicopter: sat in the cabin, riding out with it
    if (u.gone) {   // inside a house. On a calm morning a visit ends and they come back out the front door
      if (u.inHouse && u.visitT && PPL.phase === 'calm' && C.t > u.visitT && u.alive && !u.zu) { u.visitT = 0; u.st = 'walk'; u.errand = null; u.path = null; leaveHouse(u, u.inHouse); changed = true; }
      continue;
    }
    const S = u.s, d = S.pos.distanceTo(focus);
    // a bullet or a blast (combat.js) got them: it hurts, they react, and it can put them down
    if (u.lastHitT != null && u.lastHitT !== u.hitSeenT) {
      u.hitSeenT = u.lastHitT;
      if (!u.downAt) { const dmg = Math.max(0, u.hpSeen - u.hp); u.hp = u.hpSeen; if (!u.alive) { u.alive = true; S.dead = false; } hurtNPC(u, dmg, u.lastHitBy, { shot: true }); changed = true; }
    }
    u.hpSeen = u.hp;
    if (u.bubble) { u.bubble.t -= dt; if (u.bubble.t <= 0) u.bubble = null; }
    // bitten earlier and it's taking them: the fever, then down (and up again, as one of them)
    if (u.infectAt && u.alive && !u.downAt && u.st !== 'down') {
      if (!u.sickSaid && C.t > u.infectAt - 9) { u.sickSaid = true; u.say(pick(SICK).replace('arm', u.biteAt === 'legs' ? 'leg' : u.biteAt === 'head' ? 'neck' : 'arm'), 3.5); later2(() => u.alive && !u.gone && vox(u, 'cough', { pri: 1 }), 3.8); if (!S.up) S.playUp('Hit_Chest', { rate: 0.5, fade: 0.3, fadeAt: 1.4, fadeOut: 0.6 }); }
      if (C.t > u.infectAt) { u.infectAt = 0; hurtNPC(u, u.hp + 1, null, { fever: true }); PPL.bitten = (PPL.bitten || 0) + 1; changed = true; continue; }
    }
    // the dead: lying there, then getting up
    if (u.st === 'down') {
      const far = Math.hypot(S.pos.x - cam.position.x, S.pos.z - cam.position.z) > 60;   // a body far off: its pose ticks four times a second
      u.dT = (u.dT || 0) + dt; if (!far || u.dT > 0.25) { S.update(far ? u.dT : dt, {}); u.dT = 0; }
      turnAmount(S, (C.t - u.downAt) / Math.max(0.1, u.turnAt - u.downAt));
      if (C.t >= u.turnAt) { turn(u); changed = true; }
      continue;
    }
    // far away and out of sight: think less often, don't draw
    const tx = S.pos.x - cam.position.x, tz = S.pos.z - cam.position.z, tl = Math.hypot(tx, tz) || 1;
    // (phones and tablets: drawn to 75 m, and they think less often sooner)
    const LT = tier(), far1 = LT > 1 ? 22 : LT ? 30 : 40, far2 = LT > 1 ? 45 : LT ? 55 : 70;
    const show = PPL.noCull || d < 6 || ((tx * camF.x + tz * camF.z) / tl > -0.35 && d < (LT ? 75 : 100));
    if (S.visible !== show) S.setVisible(show);
    u.hidden = false;
    u.lod = d > far2 ? 4 : d > far1 ? 2 : 1;
    u.lodN = ((u.lodN || 0) + 1) % u.lod;
    if (u.lodN !== 0) continue;
    const ddt = dt * u.lod;
    const cmd = think(u, ddt, P, W) || {};
    if (u.gone) { changed = true; continue; }   // just went indoors
    human(u, ddt, cmd, P, W, S.pos.distanceTo(P.s.pos));
    cmd.aimYaw = S.yaw; cmd.combat = 0;
    if (u.limp && cmd.speed) cmd.speed *= 1 - 0.45 * u.limp;   // a bad leg
    if (u.infectAt && u.sickSaid && u.alive) {   // the fever taking hold: slower and slower, swaying, then down on their knees
      const k = clamp((u.infectAt - C.t) / 9, 0, 1);
      cmd.speed = Math.min(cmd.speed || 0, S.vw * (0.35 + 0.65 * k));
      if (k < 0.35) { cmd.speed = 0; cmd.move = null; if (u.h) setPose(u, 'knees', 0.5); }
      else if (cmd.speed > 0.1) cmd.move = (cmd.move ?? S.yaw) + Math.sin(C.t * 2.3 + u.i) * 0.25 * (1 - k);
      if (C.t > (u.sickT || 0)) { u.sickT = C.t + rnd(1.5, 2.5); if (!S.up) S.playUp('Hit_Chest', { rate: 0.45, fade: 0.3, fadeAt: 1.2, fadeOut: 0.5 }); }
      S.talkT = Math.max(S.talkT || 0, 0.3); S.talkK = 0.45;
    }
    const ox = S.pos.x, oz = S.pos.z;
    S.update(ddt, cmd);
    wounds(u, ddt);
    W.collide(S.pos, 0.3);
    if (HELI.blocks(S.pos.x, S.pos.z, 0.3) && !HELI.blocks(ox, oz, 0.3)) { S.pos.x = ox; S.pos.z = oz; }   // the parked helicopter is solid
    if (PPL.ambs && PPL.ambs.length) offAmbs(S.pos);
    W.keepSide(u.safe ||= { x: S.pos.x, z: S.pos.z, set: true }, S.pos);
    if (S.visible && d < 40) body(u, ddt); else if (u.phone && u.phone.visible) u.phone.visible = false;
    if (u.handT > 0 && S.visible && d < 30) {   // their hand on the knob as it opens
      u.handT += ddt; const k = u.handT < 0.3 ? u.handT / 0.3 : u.handT < 1.1 ? 1 : Math.max(0, 1 - (u.handT - 1.1) / 0.4);
      if (k <= 0) u.handT = 0; else { u.handK.getWorldPosition(tmp); const f = V(tmp.x - S.pos.x, 0, tmp.z - S.pos.z).normalize(), sd = V().crossVectors(f, V(0, 1, 0)).normalize(); S.reach(1, { p: tmp.clone(), f, s: sd, curl: 0.8, blend: true }, k * 0.9); }
    }
    if (u.mel && u.weapon) { u.mel.pose(S.visible); const ev = u.mel.update(ddt); if (ev === 'hit') landBlow(u); }
    if (u.doorsOpen.length) closeBehind(u);
    if (S.visible && u.alive) refreshHitShapes(u);   // where a shot or a swing can hit them, kept on the body as it moves
  }
  if (changed) syncList();
}

// ---------------------------------------------------------------- one person's mind
function nearestZombie(u, r) {
  let best = null, bd = r;
  for (const z of Z.list) { if (!z.active || !z.alive) continue; const d = z.s.pos.distanceTo(u.s.pos); if (d < bd) { bd = d; best = z; } }
  return best ? { z: best, d: bd } : null;
}
const sideOf = (D, x, z) => (x - D.x) * Math.sin(D.yaw) + (z - D.z) * Math.cos(D.yaw);
function steer(u, gx, gz, speed, cmd, dt = 1 / 60) {
  const S = u.s, dx = gx - S.pos.x, dz = gz - S.pos.z, d = Math.hypot(dx, dz);
  if (d < 0.35) return true;
  cmd.move = Math.atan2(dx, dz); cmd.speed = speed * clamp(d / 1.2, 0.45, 1);
  // somebody in the way, coming at you: keep to the right and pass them (not shove through)
  const fx = Math.sin(cmd.move), fz = Math.cos(cmd.move), P = X.P();
  for (const v of C.npcs.concat(P.alive ? [P] : [])) {
    if (v === u) continue; const ox = v.s.pos.x - S.pos.x, oz = v.s.pos.z - S.pos.z, od = Math.hypot(ox, oz);
    if (od > 1.6 || od < 1e-3 || (ox * fx + oz * fz) / od < 0.7) continue;
    cmd.move -= 0.5 * clamp((1.9 - od) / 0.8, 0.4, 1); break;
  }
  // stuck on something: try sideways a moment
  const moved = Math.hypot(S.pos.x - u.lastP.x, S.pos.z - u.lastP.z);
  u.stuckT = moved < speed * dt * 0.25 ? u.stuckT + dt : Math.max(0, u.stuckT - dt * 2);
  if (u.stuckT > 0.7) { cmd.move += u.side ?? (u.side = Math.random() < 0.5 ? 1.1 : -1.1); if (u.stuckT > 2.2) { u.stuckT = 0; u.side = null; u.path = null; } }
  u.lastP.copy(S.pos);
  // a closed door in the way: open it (a locked one stays shut: somebody's hiding in there)
  u.doorT = (u.doorT || 0) - dt;
  if (u.doorT <= 0) {
    u.doorT = 0.3;
    for (const D of X.world.doors) {
      if (D.broken || D.want > 0.5 || D.locked) continue;
      if (Math.hypot(D.x - S.pos.x, D.z - S.pos.z) < 1.3 && Math.abs(wrapPi(Math.atan2(D.x - S.pos.x, D.z - S.pos.z) - cmd.move)) < 1.3) {
        X.world.setDoor(D, true); X.SND.door('open', V(D.x, 1, D.z)); X.noise(V(D.x, 0, D.z), 6); handOn(u, D);
        if (!u.doorsOpen.some(o => o.D === D)) u.doorsOpen.push({ D, t: C.t, side: Math.sign(sideOf(D, S.pos.x, S.pos.z)) || 1 });
      }
    }
  }
  return false;
}
// through a door they opened: pull it shut behind them (unless they're running for their life, or someone's in the doorway)
function closeBehind(u) {
  const S = u.s;
  for (let i = u.doorsOpen.length - 1; i >= 0; i--) {
    const o = u.doorsOpen[i], D = o.D;
    if (D.broken || D.want < 0.5 || C.t - o.t > 25 || u.st === 'run' || u.st === 'flee' || u.st === 'escape' || u.st === 'runto') { u.doorsOpen.splice(i, 1); continue; }
    const sd = sideOf(D, S.pos.x, S.pos.z), dd = Math.hypot(S.pos.x - D.x, S.pos.z - D.z);
    if (Math.sign(sd) === o.side || Math.abs(sd) < 1.1 || dd > 3.5) { if (dd > 3.5 && Math.sign(sd) === o.side) u.doorsOpen.splice(i, 1); continue; }
    if (nearestZombie(u, 8) || !nobodyIn(D) || PPL.list.some(v => v !== u && v.active && !v.gone && Math.hypot(v.s.pos.x - D.x, v.s.pos.z - D.z) < 1.2)) continue;
    X.world.setDoor(D, false); X.SND.door('close', V(D.x, 1, D.z)); handOn(u, D);
    u.doorsOpen.splice(i, 1);
  }
}
function follow(u, speed, cmd, dt = 1 / 60) {
  if (u.pauseT > 0) {   // at the kerb: look both ways before crossing
    u.pauseT -= dt; const a = u.look0 + (u.pauseT > 0.7 ? 1.1 : -1.1);
    u.s.lookAt = (u.s.lookAt || V()).set(u.s.pos.x + Math.sin(a) * 6, 1.5, u.s.pos.z + Math.cos(a) * 6);
    if (u.pauseT <= 0) u.s.lookAt = null;
    return false;
  }
  if (!u.path || !u.path.length) return true;
  const p = u.path[0];
  if (steer(u, p[0], p[1], speed, cmd, dt)) { u.path.shift(); if (p[2] === 'look') { u.pauseT = 1.4; u.look0 = u.path.length ? Math.atan2(u.path[0][0] - u.s.pos.x, u.path[0][1] - u.s.pos.z) : u.s.yaw; } if (!u.path.length) return true; }
  return false;
}
function go(u, x, z, maxExp) { u.path = findPath(u.s.pos.x, u.s.pos.z, x, z, maxExp) || [[x, z]]; }
// on foot across town the way people do it: straight over the street, from kerb to kerb, after a look each way
function goWalk(u, x, z) {
  const S = u.s, a = [S.pos.x, S.pos.z], cross = [];
  if (Math.sign(a[1]) !== Math.sign(z) && Math.abs(a[1]) > 4 && Math.abs(z) > 4 && Math.abs(a[0]) > 8) { const cx = clamp(a[0], -98, 98); cross.push([cx, Math.sign(a[1]) * 5.2, 'look'], [cx, -Math.sign(a[1]) * 5.2]); }
  else if (Math.sign(a[0]) !== Math.sign(x) && Math.abs(a[0]) > 4 && Math.abs(x) > 4 && Math.abs(a[1]) > 8) { const cz = clamp(a[1], -98, 98); cross.push([Math.sign(a[0]) * 5.2, cz, 'look'], [-Math.sign(a[0]) * 5.2, cz]); }
  if (!cross.length) { go(u, x, z); return; }
  const p1 = findPath(a[0], a[1], cross[0][0], cross[0][1]) || [], p2 = findPath(cross[1][0], cross[1][1], x, z) || [[x, z]];
  if (p1.length) p1[p1.length - 1] = cross[0]; else p1.push(cross[0]);
  u.path = p1.concat([cross[1]], p2);
}
const run = u => u.s.vr * (u.role === 'surv' ? 0.95 : (u.runK ||= clamp(0.79 + 0.18 * ((u.pers && u.pers.fit) ?? 0.5) - 0.14 * ((u.pers && u.pers.age) || 0) + rnd(-0.03, 0.03), 0.66, 0.98)));

// ---------------------------------------------------------------- a Saturday morning errand
// somewhere real to go, and something to do when they get there
function planErrand(u) {
  const W = X.world, S = u.s, r = Math.random();
  const hs = W.houses.filter(h => !h.store && h.front && h !== X.G.home && Math.hypot(h.x - S.pos.x, h.z - S.pos.z) < 45);
  if (r < 0.2 && hs.length) {   // the mail
    const h = pick(hs), c = Math.cos(h.yaw), sn = Math.sin(h.yaw), f = h.flip || 1;
    const mx = h.x + (-6.5 * f) * c + 11.4 * sn, mz = h.z - (-6.5 * f) * sn + 11.4 * c, sx = mx - sn * 0.55, sz = mz - c * 0.55;
    if (W.walkable(sx, sz)) return { kind: 'mail', at: [sx, sz], face: Math.atan2(mx - sx, mz - sz), dur: rnd(3, 5) };
  }
  if (r < 0.45 && hs.length) {  // knock on a neighbour's door (and sometimes go in for a coffee)
    const h = pick(hs.filter(h2 => !taken(h2, u) && !h2.front.broken) || hs); if (!h) return null;
    const w = doorway(h);
    return { kind: 'knock', h, at: w.out, face: Math.atan2(w.D.x - w.out[0], w.D.z - w.out[1]), dur: rnd(4, 6) };
  }
  if (r < 0.58) {               // a look at the Quick Stop's window ($2 burgers)
    const x = rnd(16, 18.6), z = rnd(-9.9, -9.4);
    return { kind: 'window', at: [x, z], face: Math.PI, dur: rnd(4, 8) };
  }
  if (r < 0.7) {                // the park
    for (let k = 0; k < 6; k++) { const x = -20 + rnd(-6, 6), z = -17 + rnd(-5, 5); if (W.walkable(x, z)) { const dur = rnd(6, 16); return { kind: 'park', at: [x, z], face: rnd(-3, 3), dur, sit: dur > 10 && Math.random() < 0.6 }; } }
  }
  const Ln = u.line || pick(LINES), [x, z] = linePos(Ln, rnd(Ln[2], Ln[3]));   // a walk round the block
  return { kind: 'walk', at: [x, z], face: null, dur: rnd(1, 4), phone: Math.random() < 0.15 + (1 - ((u.pers && u.pers.age) || 0)) * 0.25 };
}
function walker(u, dt, P, W, cmd, pd) {
  const S = u.s;
  // step round you instead of through you
  if (pd < 1.7 && u.path && u.path.length && C.t > (u.blockT || 0) && Math.abs(wrapPi(Math.atan2(P.s.pos.x - S.pos.x, P.s.pos.z - S.pos.z) - S.yaw)) < 0.6) {   // you're right in front of them: they stop ("oh — hi")
    u.blockT = C.t + 12; holdFor(u, 1.6); if (!u.bubble && Math.random() < 0.5) u.say((['Oh! Sorry.', 'Whoops — hi.', 'After you.']), 1.6); return cmd;
  }
  if (pd < 1.1) { cmd.move = Math.atan2(S.pos.x - P.s.pos.x, S.pos.z - P.s.pos.z); cmd.speed = 0.8; return cmd; }
  let E = u.errand;
  if (!E) { if (u.t > 0) return cmd; E = u.errand = planErrand(u); if (!E) { u.t = 2; return cmd; } E.ph = 'go'; goWalk(u, ...E.at); return cmd; }
  if (E.ph === 'in') { const r = entering(u, dt, cmd, pd, S.vw * u.pace()); if (r === true) { u.visitT = C.t + rnd(35, 80); u.errand = null; } else if (r === 'fail') { u.errand = null; u.t = 1; } return cmd; }
  if (E.ph === 'go') {
    // two neighbours meet on the sidewalk: they stop for a word
    if (C.t > (u.metT || 0)) for (const v of C.npcs) {
      if (v === u || v.role !== 'walker' || !v.errand || v.errand.ph !== 'go' || C.t < (v.metT || 0)) continue;
      if (Math.hypot(v.s.pos.x - S.pos.x, v.s.pos.z - S.pos.z) > 2.2) continue;
      u.metT = v.metT = C.t + 90;
      if (Math.random() < 0.55) {
        const dur = rnd(5, 9);
        for (const [a, b] of [[u, v], [v, u]]) { a.errand = { kind: 'meet', ph: 'do', t: dur, face: Math.atan2(b.s.pos.x - a.s.pos.x, b.s.pos.z - a.s.pos.z), with: b }; a.path = null; a.s.lookAt = V(b.s.pos.x, 1.6, b.s.pos.z); }
        u.say(sayLines(u, 'greet'), 2.4); later2(() => v.alive && !v.gone && PPL.phase === 'calm' && v.say(sayLines(v, 'greet'), 2.4), 2.6);
        S.playUp('Interact', { rate: 0.8, fade: 0.25, fadeAt: 1.2 });
        return cmd;
      }
    }
    if (!follow(u, S.vw * u.pace(), cmd, dt)) return cmd;
    E.ph = 'do'; E.t = E.dur;
    if (E.kind === 'mail') { S.playUp('Interact', { rate: 0.75, fade: 0.25, fadeAt: 1.5 }); later2(() => X.SND.touch('misc', V(S.pos.x + Math.sin(E.face) * 0.5, 1.05, S.pos.z + Math.cos(E.face) * 0.5)), 0.6); later2(() => X.SND.touch('box', V(S.pos.x + Math.sin(E.face) * 0.5, 1.05, S.pos.z + Math.cos(E.face) * 0.5)), 1.6); }
    if (E.kind === 'knock') {   // three knocks, the hand doing it
      S.playUp('Interact', { rate: 1.5, fade: 0.12, fadeAt: 0.9 });
      const D = E.h.front; for (let k = 0; k < 3; k++) later2(() => X.SND.touch('box', V(D.x, 1.3, D.z)), 0.35 + k * 0.24);
    }
    return cmd;
  }
  // doing it
  E.t -= dt; if (E.face != null) cmd.face = E.face;
  if (E.kind === 'meet' && E.with && E.with.s) { cmd.face = Math.atan2(E.with.s.pos.x - S.pos.x, E.with.s.pos.z - S.pos.z); if (!E.said && E.t < 3.2) { E.said = true; if (Math.random() < 0.5) { u.say(sayLines(u, 'small'), 3); S.playUp('Interact', { rate: 0.8, fade: 0.25, fadeAt: 1.4 }); } } }
  if (E.t <= 0) {
    S.lookAt = null;
    if (E.kind === 'knock' && Math.random() < 0.45 && !taken(E.h, u) && !E.h.front.broken) { E.ph = 'in'; enterHouse(u, E.h); u.path = []; u.enter.ph = 0; return cmd; }   // "It's open, come on in!"
    u.errand = null; u.t = rnd(0.5, 3);
  }
  return cmd;
}

// the market group talks among themselves: one speaks, the rest look at them
function groupLife(u, dt, cmd) {
  const S = u.s, G = u.group;
  cmd.face = Math.atan2(u.gc.x - S.pos.x, u.gc.z - S.pos.z);
  if (u === G[0] && PPL.talkT <= 0) {
    const cand = G.filter(v => v !== PPL.talker && v.alive && !(v.st === 'eat' && v.s.up)); PPL.talker = cand.length ? pick(cand) : null; PPL.talkT = rnd(2.8, 5.5);
    if (PPL.talker) { PPL.talker.s.talkT = PPL.talkT * 0.8; PPL.talker.s.talkK = 0.7; if (Math.random() < 0.6 && !PPL.talker.s.up) PPL.talker.s.playUp('Interact', { rate: rnd(0.7, 0.95), fade: 0.3, fadeAt: 1.3 }); for (const v of G) if (v !== PPL.talker && v.h && v.alive) { const r = Math.random(); if (r < 0.2) later2(() => v.alive && PPL.phase === 'calm' && setPose(v, 'laugh', rnd(0.9, 1.5)), rnd(1.2, 2.5)); else if (r < 0.55) setPose(v, 'nod', rnd(1, 2)); } }
  }
  if (u.lookT > 0) return;
  const T = PPL.talker;
  if (T && T !== u) S.lookAt = (S.lookAt || V()).set(T.s.pos.x, 1.6 * (T.scl ? T.scl.y : 1), T.s.pos.z);
  else if (T === u) { const L = G[(G.indexOf(u) + 1 + Math.floor(C.t / 2.3)) % G.length]; if (L !== u) S.lookAt = (S.lookAt || V()).set(L.s.pos.x, 1.6, L.s.pos.z); }
}

function think(u, dt, P, W) {
  const S = u.s, cmd = {};
  u.t -= dt;
  if (u.st === 'off') return cmd;
  const pd = S.pos.distanceTo(P.s.pos);
  if (u.st === 'ko') return koStep(u, dt, P, cmd);
  if (u.stagT > 0) { u.stagT -= dt; return cmd; }   // knocked back a step: no thinking for a moment
  if (u.heli) return heliStep(u, dt, P, W, cmd);
  if (u.hostile) return hostileStep(u, dt, P, W, cmd, pd);
  if (u.holdT > 0 && !u.exit && !u.trip && !u.enter?.ph && holding(u, dt, P, cmd)) return cmd;
  if (u.exit) { if (exiting(u, dt, cmd)) { u.t = rnd(1, 3); if (u.role === 'surv') u.st = 'idle'; else if (u.role === 'bro') { u.st = u.called ? 'come' : 'stand'; u.t = 0; } else if (PPL.phase !== 'calm') { u.st = 'home'; u.t = 0; } } return cmd; }
  if (u.amb) return boarding(u, dt, cmd);
  if (u.role === 'medic') return medic(u, dt, P, W, cmd, pd);
  if (u.role === 'bro' && (u.called || u.left || PPL.phase !== 'calm')) return brother(u, dt, P, W, cmd, pd);
  // ---------------- a normal Saturday ----------------
  if (PPL.phase === 'calm' && ['walk', 'chat', 'eat', 'stand', 'kneel', 'grill', 'queue'].includes(u.st)) {
    // say hello as you go past
    u.greetT -= dt;
    if (pd < 3.2 && u.greetT <= 0 && u.st !== 'eat' && u.st !== 'grill' && X.G.state === 'play') { u.greetT = 40; if (!u.bubble && u.role !== 'market' && Math.random() < 0.45 + u.pers.chatty * 0.6) { u.say(u.role === 'dale' ? `Hey, ${X.G.pname || 'Sam'}!` : u.role === 'bro' ? pickU(u, BEN.hi).replace('Sam', X.G.pname || 'Sam') : sayLines(u, 'greet'), 2.6); if (armsFree(u) && u.h && Math.random() < 0.5) setPose(u, 'wave', 1.3); } S.lookAt = V(P.s.pos.x, P.s.pos.y + 1.65, P.s.pos.z); u.lookT = 3; }
    if (u.lookT > 0) { u.lookT -= dt; if (u.lookT <= 0) S.lookAt = null; else (S.lookAt ||= V()).set(P.s.pos.x, P.s.pos.y + 1.65, P.s.pos.z); }
    if (u.st === 'walk') return walker(u, dt, P, W, cmd, pd);
    if (u.st === 'chat') { if (u.partner) cmd.face = Math.atan2(u.partner.s.pos.x - S.pos.x, u.partner.s.pos.z - S.pos.z); if (u.partner && !u.bubble && !u.partner.bubble && (!u.h || !u.h.gaze)) (u.h ||= newH(u)) && gazeUnit(u, u.partner, 0.5, 0); chatLife(u, dt); if (u.t <= 0 && !u.bubble) { u.t = rnd(3, 7); S.talkT = rnd(1.5, 3); if (Math.random() < 0.5) S.playUp('Interact', { rate: rnd(0.7, 1), fade: 0.25, fadeAt: 1.4 }); } return cmd; }
    if (u.st === 'grill') {   // Raj at the flat-top, turning burgers; now and then a look round at who's next
      if (u.t <= 0) { u.glance = !u.glance; u.t = u.glance ? rnd(1.6, 2.6) : rnd(5, 9); if (u.glance) { if (S.up) S.ups[S.up].target = 0; S.up = null; if (pd < 12 && Math.random() < 0.35) u.say((['Two more coming right up!', 'Cheese on that?', 'Best deal in town, my friend.', 'Two minutes!']), 2.4); } else S.playUp('Interact', { loop: true, rate: 0.7, fade: 0.3 }); }
      const J = PPL.cast.jesse;
      cmd.face = u.glance && J && J.alive ? Math.atan2(J.s.pos.x - S.pos.x, J.s.pos.z - S.pos.z) : -Math.PI / 2;
      return cmd;
    }
    if (u.st === 'queue') {   // in line for a burger
      const R = PPL.cast.raj; if (R) { cmd.face = Math.atan2(R.s.pos.x - S.pos.x, R.s.pos.z - S.pos.z); if (u.lookT <= 0 || !u.lookT) S.lookAt = (S.lookAt || V()).set(R.s.pos.x - 0.5, 1.1, R.s.pos.z); }
      if (u.t <= 0) { u.t = rnd(4, 9); if (Math.random() < 0.4) { S.talkT = rnd(1, 2); S.playUp('Interact', { rate: 0.8, fade: 0.25, fadeAt: 1.1 }); } }
      return cmd;
    }
    if (u.st === 'eat') { if (!S.up && u.t <= 0) { u.t = rnd(4, 8); if (PPL.burger) S.playUp('Consume', { rate: 0.8, fade: 0.25, fadeAt: 1.6 }); } }
    if (u.group) groupLife(u, dt, cmd);
    return cmd;
  }
  // ---------------- the market, as it happens ----------------
  if (u.st === 'collapsed') return cmd;
  if (u.st === 'sick') { if (u.t <= 0) { u.t = rnd(2.8, 4.2); S.playUp(Math.random() < 0.7 ? 'Hit_Chest' : 'Hit_Head', { rate: 0.45, fade: 0.3, fadeAt: 1.0, fadeOut: 0.7 }); } if (u.h && (!u.h.pz || u.h.pz.k !== 'wound')) setPose(u, 'wound', 2); cmd.face = S.yaw + Math.sin(C.t * 0.9 + u.i) * 0.12; return cmd; }   // hunched over his stomach, a wave of it now and then, swaying
  if (u.st === 'goto') {   // Raj: out from behind the grill, through the door, to Gary
    if (!u.path) go(u, u.goal.x, u.goal.z);
    if (follow(u, run(u) * 0.9, cmd, dt)) { u.path = null; if (u.goal.then === 'kneel') { S.yaw = Math.atan2(PPL.cast.gary.s.pos.x - S.pos.x, PPL.cast.gary.s.pos.z - S.pos.z); S.play('Fixing_Kneeling', { loop: true, fade: 0.3 }); u.st = 'kneelhelp'; } else u.st = 'stand'; }
    return cmd;
  }
  if (u.st === 'kneelhelp') { const z = nearestZombie(u, 2.6); if (z && u.t < -0.5 && !u.doomed) { S.stopAct(0.15); u.st = 'flee'; } return cmd; }
  if (['stand', 'eat', 'kneel', 'chat', 'walk', 'grill', 'queue'].includes(u.st)) {
    if (u.role === 'market') { if (u === PPL.camOn || u === PPL.cast.reporter) { newsStep(u); if (!u.alive || u.st === 'flee') return cmd; } if (u.st === 'grill' && !S.up) S.playUp('Interact', { loop: true, rate: 0.7, fade: 0.3 }); const z = nearestZombie(u, 5); if (z && !u.doomed) { u.st = 'flee'; } return cmd; }
  }
  if (u.st === 'escape') {   // Jesse and Morgan: run, and don't look back
    if (S.act) S.stopAct(0.2);
    if (!u.path) go(u, u.goal.x, u.goal.z);
    if (follow(u, run(u), cmd, dt)) { u.path = null; becomeSurvivor(u); }
    return cmd;
  }
  if (u.st === 'runto') {   // Dale: down the street after Linda (out of sight, he's gone)
    if (!u.path) go(u, u.goal.x, u.goal.z);
    const done = follow(u, run(u), cmd, dt);
    if (done || (!S.visible && pd > 30)) { u.gone = true; u.hidden = true; S.setVisible(false); }
    return cmd;
  }
  // ---------------- survivors: they play it the way you do ----------------
  if (u.role === 'surv') return survivor(u, dt, P, W, cmd, pd);
  // ---------------- everyone else ----------------
  const zn = nearestZombie(u, u.doomed ? 7 : 16);
  if (zn && (zn.d < 9 || W.los(tmp.set(S.pos.x, 1.5, S.pos.z), V(zn.z.s.pos.x, 1.5, zn.z.s.pos.z)))) {
    if (S.act && !u.trip) S.stopAct(0.2);
    if (u.st !== 'flee') { u.st = 'flee'; u.enter = null; u.path = null; u.errand = null; if (!u.bubble && Math.random() < 0.6) u.say(Math.random() < 0.5 ? PANIC : sayLines(u, u.pers && u.pers.brave > 0.6 ? 'panicB' : 'panicS'), 2); if (Math.random() < 0.5) scream(u, 1); else X.noise(S.pos, 18); }
    u.threat = zn.z;
  }
  if (u.st === 'flee') {
    if (S.act && !u.trip) S.stopAct(0.2);
    if (!u.threat && u.doomed && PPL.cast.gary && PPL.cast.gary.zu) u.threat = PPL.cast.gary.zu;
    const th = u.threat;
    if (u.doomed && th && th.alive && PPL.marketOn) { /* nowhere to go */ }
    else if (!th || !th.alive || th.s.pos.distanceTo(S.pos) > 22) { u.st = PPL.phase === 'calm' ? 'home' : 'panic'; u.plan = null; u.home = null; u.path = null; u.enter = null; u.t = 0; return cmd; }
    const a = Math.atan2(S.pos.x - th.s.pos.x, S.pos.z - th.s.pos.z);
    if (!u.doomed || !PPL.marketOn) {
      // a real way out: the most open line away from it, checked every metre, then walked there by path (so fences,
      // hedges and house corners get gone round, doors get opened, and the stuck-sideways logic works)
      u.fleeT = (u.fleeT || 0) - dt;
      const nx = u.path && u.path[0], close = nx && Math.hypot(th.s.pos.x - nx[0], th.s.pos.z - nx[1]) < 3;
      if (!u.path || !u.path.length || u.fleeT <= 0 || close) {
        u.fleeT = 1.5; let bA = null, bS = -1e9, bL = 0;
        for (const o of [0, 0.45, -0.45, 0.9, -0.9, 1.4, -1.4, 2.0, -2.0]) {
          const ang = a + o; let L = 0;
          for (let r = 1; r <= 25; r++) { if (!W.walkable(S.pos.x + Math.sin(ang) * r, S.pos.z + Math.cos(ang) * r)) break; L = r; }
          const sc = Math.min(L, 22) - Math.abs(o) * 5; if (L >= 4 && sc > bS) { bS = sc; bA = ang; bL = L; }
        }
        if (bA != null) { const r = Math.min(bL, rnd(15, 22)); go(u, S.pos.x + Math.sin(bA) * r, S.pos.z + Math.cos(bA) * r, 9000); }
        else go(u, S.pos.x + Math.sin(a) * 12, S.pos.z + Math.cos(a) * 12, 9000);
      }
      if (u.trip) return tripping(u, cmd, dt);
      if (gasping(u, dt, th)) return cmd;
      if (follow(u, run(u) * winded(u, dt) * stumbling(u, dt), cmd, dt)) u.path = null;
      lookBack(u, dt, th);
      if (u.prey && th.s.pos.distanceTo(S.pos) < 5 && (u.tripT || 0) < C.t && Math.random() < dt * 1.4) trip(u);   // the foot catches the kerb
    } else {
      // the ones it's going to catch: they back off, but stay round the Quick Stop
      let best = a, bs = -1e9;
      for (const o of [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6]) { const ang = a + o; const x = S.pos.x + Math.sin(ang) * 2.5, z = S.pos.z + Math.cos(ang) * 2.5; if (!W.walkable(x, z)) continue; const sc = -Math.abs(o) + (W.walkable(S.pos.x + Math.sin(ang) * 5, S.pos.z + Math.cos(ang) * 5) ? 0.5 : 0); if (sc > bs) { bs = sc; best = ang; } }
      const mx = 20.5 - S.pos.x, mz = -8.5 - S.pos.z, md = Math.hypot(mx, mz); if (md > 6) { const back = Math.atan2(mx, mz); best = wrapPi(best + wrapPi(back - best) * clamp((md - 6) / 4, 0, 0.9)); }
      cmd.move = best; cmd.speed = run(u) * 0.5;
    }
    if (u.t <= 0) { u.t = rnd(2, 4); if (Math.random() < 0.35) scream(u, 0.9); else X.noise(S.pos, 16); }
    return cmd;
  }
  if (u.st === 'home') {   // run home: open the front door, in, shut it, lock it
    if (u.t > 0) return cmd;
    if (!u.enter) {
      let best = u.home && u.home.front && !u.home.front.broken && !taken(u.home, u) ? u.home : null;
      if (!best) {
        const hs = W.houses.filter(h => !h.store && h !== X.G.home && h.front && !h.front.broken && !taken(h, u));
        let bd = 1e9; for (const h of hs) { const d = Math.hypot(h.x - S.pos.x, h.z - S.pos.z) + Math.random() * 25; if (d < bd) { bd = d; best = h; } }
      }
      if (!best) { u.st = PPL.phase === 'calm' ? 'wander' : 'panic'; u.plan = null; return cmd; }
      u.home = best; enterHouse(u, best); u.homeT = C.t;
    }
    if (u.trip) return tripping(u, cmd, dt);
    const r = entering(u, dt, cmd, pd, run(u) * 0.85 * (u.prey ? 0.75 : 1) * stumbling(u, dt));
    if (r === 'fail' || (PPL.phase !== 'calm' && C.t - (u.homeT || C.t) > 70 && u.enter && u.enter.ph === 0)) { if (u.enter && u.enter.h.occupied === u) u.enter.h.occupied = null; u.enter = null; u.home = null; u.t = 0.5; if (PPL.phase !== 'calm') { u.st = 'panic'; u.plan = null; } }   // locked, or they can't get there: something else
    else if (u.enter && u.enter.ph === 0) lookBack(u, dt, null);
    return cmd;
  }
  // the ones who won't make it: something's always coming after them (one at a time; again if it loses them)
  if (u.prey && PPL.phase !== 'calm' && (u.st === 'panic' || u.st === 'home') && C.t > (u.pursueT ||= C.t + rnd(3, 9))) { u.pursueT = C.t + rnd(14, 24); if (!Z.list.some(z => z.active && z.alive && z.z.tgt === u && z.z.state === 'chase')) sendPursuit(u); }
  if (u.st === 'panic') return panic(u, dt, P, W, cmd, pd);
  if (u.st === 'wander') {
    if (!u.path || follow(u, S.vw, cmd, dt)) { u.path = null; for (let k = 0; k < 6; k++) { const x = S.pos.x + rnd(-12, 12), z = S.pos.z + rnd(-12, 12); if (W.walkable(x, z)) { go(u, x, z, 9000); break; } } }
    return cmd;
  }
  return cmd;
}
// ---------------------------------------------------------------- panic
// Nobody runs the same way. Each one, scared out of their mind, picks something and goes: anywhere far from here, their
// own house (or any house with a door), down behind a parked car, out to the edge of town (it's fenced: they rattle it
// and run on). Some just stand there a few seconds, hands to their head, before their legs work. They look back over
// their shoulder, they stumble, they scream. When a plan fails (no way round, no progress, a locked door) they try another;
// after two or three tries most of them make for a house.
const FREAK = ['What do we do? WHAT DO WE DO?!', 'No no no no no...', 'Where\'s my wife? Where\'s my WIFE?!', 'It\'s on the news! It\'s real!', 'Get off the street!', 'Help! Somebody!', 'Oh Jesus. Oh Jesus.'];
const FENCE = ['It\'s fenced off! Why is it FENCED?!', 'They\'ve locked us IN!', 'Open the gate! OPEN IT!', 'Hey! HEY! Let us out!'];
function scream(u, k = 1) { const S = u.s; if (!vox(u, 'scream', { pri: 2 }) && !(C.t < (u.vUntil || 0))) { X.SND.scream(S.pos, vPitch(u), isFem(u)); S.talkT = 1.0; S.talkK = 1; } X.noise(S.pos, 18 * k); }
function farPoint(u, W, minD = 32) {
  const S = u.s;
  for (let k = 0; k < 16; k++) { const x = rnd(-96, 96), z = rnd(-96, 96); if (Math.hypot(x - S.pos.x, z - S.pos.z) < minD || !W.walkable(x, z) || W.houseAt(x, z)) continue; return [x, z]; }
  return null;
}
function newPlan(u, W) {
  const S = u.s; u.plans = (u.plans || 0) + 1; u.path = null;
  const P = { t: 0, ph: 'go', at: null, k: rnd(0.92, 1.05), prog: { d: 1e9, n: 0, t: C.t + 2.5 } };
  const late = u.plans > 2 + (u.i % 3), r = Math.random();
  let kind = u.plans === 1 && r < 0.25 ? 'freeze' : late && r < 0.75 ? 'house' : null;
  if (u.prey && u.plans < 4 && kind === 'house') kind = 'far';   // the doomed don't think of the obvious
  if (!kind) { const q = Math.random(); kind = u.prey && u.plans < 4 ? pick(['far', 'far', 'car', 'fence']) : q < 0.32 ? 'far' : q < 0.58 ? 'house' : q < 0.8 ? 'car' : 'fence'; }
  if (u.lastKind === kind && kind !== 'house' && Math.random() < 0.6) kind = kind === 'far' ? 'car' : 'far';   // not the same thing twice
  u.lastKind = kind;
  if (kind === 'freeze') { P.dur = rnd(1.6, 4) * (0.7 + ((u.pers && u.pers.nervous) || 0.5) * 0.6); P.ph = 'there'; if (u.h && armsFree(u)) setPose(u, 'face', P.dur); else if (!S.up) S.playUp('Hit_Head', { rate: 0.45, fade: 0.3, fadeAt: 1.4, fadeOut: 0.6 }); if (Math.random() < 0.6) u.say((FREAK), 2.4); }
  if (kind === 'house') { u.st = 'home'; u.enter = null; u.home = u.own && Math.random() < 0.65 ? u.own : null; u.t = 0; u.plan = null; return null; }
  if (kind === 'far') {
    // the ones who won't make it run blind — the wrong way, past the dead
    const zn = u.prey ? nearestZombie(u, 70) : null;
    if (zn) { const a = Math.atan2(zn.z.s.pos.x - S.pos.x, zn.z.s.pos.z - S.pos.z) + rnd(-0.5, 0.5); for (let k = 0; k < 6 && !P.at; k++) { const rr = zn.d + rnd(6, 18), x = clamp(S.pos.x + Math.sin(a) * rr, -96, 96), z = clamp(S.pos.z + Math.cos(a) * rr, -96, 96); if (W.walkable(x, z) && !W.houseAt(x, z)) P.at = [x, z]; } }
    P.at ||= farPoint(u, W); P.dur = rnd(2, 5);
  }
  if (kind === 'car') {
    const cs = W.cars.filter(c => !c.hidden && Math.hypot(c.x - S.pos.x, c.z - S.pos.z) < 45).sort((a, b) => Math.hypot(a.x - S.pos.x, a.z - S.pos.z) - Math.hypot(b.x - S.pos.x, b.z - S.pos.z)).slice(0, 3);
    const cr = cs.length ? pick(cs) : null;
    if (cr && !cs.some(c => c !== cr && c.hider === u)) {
      const zn = nearestZombie(u, 60), rx = Math.cos(cr.yaw), rz = -Math.sin(cr.yaw), off = ((cr.pf && cr.pf.hx) || 0.95) + 0.55;
      let sd = zn ? -Math.sign((zn.z.s.pos.x - cr.x) * rx + (zn.z.s.pos.z - cr.z) * rz) || 1 : Math.random() < 0.5 ? 1 : -1;   // the side away from them
      for (let k = 0; k < 2 && !P.at; k++, sd = -sd) { const x = cr.x + rx * off * sd, z = cr.z + rz * off * sd; if (W.walkable(x, z)) P.at = [x, z]; }
      if (P.at) { P.car = cr; cr.hider = u; P.dur = rnd(6, 16); }
    }
    if (!P.at) { kind = 'far'; P.at = farPoint(u, W); P.dur = rnd(2, 4); }
  }
  if (kind === 'fence') {
    const ax = Math.random() < 0.5, sg = Math.sign(ax ? S.pos.x : S.pos.z) || 1;
    for (let k = 0; k < 8 && !P.at; k++) { const e = sg * rnd(99, 102.5), o = clamp((ax ? S.pos.z : S.pos.x) + rnd(-30, 30), -95, 95), x = ax ? e : o, z = ax ? o : e; if (W.walkable(x, z)) P.at = [x, z], P.face = ax ? (sg > 0 ? Math.PI / 2 : -Math.PI / 2) : (sg > 0 ? 0 : Math.PI); }
    if (!P.at) { kind = 'far'; P.at = farPoint(u, W); }
    P.dur = rnd(3, 5.5);
  }
  P.kind = kind;
  if (P.ph === 'go' && !P.at) { u.st = 'home'; u.enter = null; u.home = null; u.plan = null; return null; }
  if (P.ph === 'go') { go(u, P.at[0], P.at[1]); if (Math.random() < 0.35 && !u.bubble) u.say(Math.random() < 0.5 ? PANIC : sayLines(u, u.pers && u.pers.brave > 0.6 ? 'panicB' : 'panicS'), 2); if (Math.random() < 0.4) scream(u, 0.8); }
  return (u.plan = P);
}
function panic(u, dt, P, W, cmd, pd) {
  const S = u.s;
  if (u.t > 0) {   // a beat of not believing it: a look round
    const a = S.yaw + Math.sin(C.t * 2.3 + u.i) * 1.0;
    S.lookAt = (S.lookAt || V()).set(S.pos.x + Math.sin(a) * 8, 1.6, S.pos.z + Math.cos(a) * 8); return cmd;
  }
  if (u.trip) return tripping(u, cmd, dt);
  let L = u.plan;
  if (!L && u.flock) L = flockPlan(u);
  if (!L) { S.lookAt = null; L = newPlan(u, W); if (!L) return cmd; }
  L.t += dt;
  if (L.ph === 'go') {
    if (gasping(u, dt, null)) return cmd;
    const done = follow(u, run(u) * (u.prey ? winded(u, dt) * 1.15 : 1) * L.k * stumbling(u, dt), cmd, dt);
    lookBack(u, dt, null);
    if (u.t < -rnd(4, 9)) { u.t = 0; if (Math.random() < 0.3) scream(u, 0.7); if (Math.random() < 0.15 && !u.bubble) u.say((PANIC), 1.8); }
    const dg = Math.hypot(L.at[0] - S.pos.x, L.at[1] - S.pos.z);
    if (C.t > L.prog.t) {   // getting anywhere? (a fence, a hedge, a dead end: give it up and do something else)
      L.prog.t = C.t + 2.5; if (dg > L.prog.d - 1.2) L.prog.n++; else L.prog.n = 0; L.prog.d = Math.min(L.prog.d, dg);
      if (L.prog.n >= 2) { if (L.car) L.car.hider = null; u.plan = null; u.path = null; return cmd; }
    }
    if (done) {
      u.path = null;
      if (dg > 2.2) { if ((L.re = (L.re || 0) + 1) > 2) { u.plan = null; return cmd; } go(u, L.at[0], L.at[1]); return cmd; }
      L.ph = 'there'; L.t = 0;
      if (L.kind === 'fence' && !u.bubble) u.say((FENCE), 2.6);
    }
    return cmd;
  }
  // there
  if (L.kind === 'freeze') {   // rooted to the spot, looking every way at once
    const a = S.yaw + Math.sin(C.t * 3.1 + u.i) * 1.05; S.lookAt = (S.lookAt || V()).set(S.pos.x + Math.sin(a) * 8, 1.5, S.pos.z + Math.cos(a) * 8);
  }
  if (L.kind === 'car') {   // down behind it, peeking over now and then
    if (L.car) cmd.face = Math.atan2(L.car.x - S.pos.x, L.car.z - S.pos.z);
    const peek = Math.sin(L.t * 0.9 + u.i) > 0.75; cmd.crouch = !peek;
    if (peek && L.car) S.lookAt = (S.lookAt || V()).set(L.car.x * 2 - S.pos.x, 1.4, L.car.z * 2 - S.pos.z); else S.lookAt = null;
  }
  if (L.kind === 'far') {   // out of breath; where now?
    const a = S.yaw + Math.sin(C.t * 1.7 + u.i) * 1.1; S.lookAt = (S.lookAt || V()).set(S.pos.x + Math.sin(a) * 8, 1.6, S.pos.z + Math.cos(a) * 8);
    S.talkT = Math.max(S.talkT || 0, 0.3); S.talkK = 0.4;   // panting
    if (C.t > (u.pantT || 0)) { u.pantT = C.t + rnd(5, 9); vox(u, 'pant', { dur: rnd(1.6, 2.6), gain: 0.8 }); }
  }
  if (L.kind === 'fence') {   // hands on the wire, shaking it
    if (L.face != null) cmd.face = L.face;
    if (!S.up && L.t > 0.3 && L.t < L.dur - 0.8) S.playUp('Interact', { rate: rnd(1.3, 1.7), fade: 0.12, fadeAt: 0.7 });
  }
  if (L.t > L.dur) { if (L.car) L.car.hider = null; S.lookAt = null; u.plan = null; }
  return cmd;
}
// running for your life: a look back over the shoulder every few seconds
function lookBack(u, dt, th) {
  const S = u.s;
  u.lbT = (u.lbT ?? rnd(1, 4)) - dt;
  if (u.lbT < 0) {
    if (u.lbT < -0.75) { u.lbT = rnd(2.5, 6); S.lookAt = null; return; }
    const sd = u.i % 2 ? 1 : -1, b = th ? Math.atan2(th.s.pos.x - S.pos.x, th.s.pos.z - S.pos.z) : S.yaw + Math.PI - sd * 0.4;
    S.lookAt = (S.lookAt || V()).set(S.pos.x + Math.sin(b) * 8, 1.5, S.pos.z + Math.cos(b) * 8);
  }
}
// the ones who won't make it are out of breath fast: a run that fades to a jog (and they never really get it back)
function winded(u, dt) { if (!u.prey) return 1; u.windT = (u.windT || 0) + dt; return Math.max(0.26, 0.66 - u.windT * 0.012); }
// ...and then they have to stop: bent over, chest heaving, looking back at what's coming
function gasping(u, dt, th) {
  const S = u.s;
  if (!u.prey || u.trip) return false;
  if (!(u.gasp > 0) && u.windT > 16 && C.t > (u.gaspT || 0)) { u.gaspT = C.t + rnd(6, 10); u.gasp = rnd(3.5, 6); if (!u.bubble && Math.random() < 0.6) u.say((['I can\'t... I can\'t breathe...', 'Wait... wait...', 'Oh God... my chest...']), 2); }
  if (!(u.gasp > 0)) return false;
  u.gasp -= dt;
  if (u.h) { setPose(u, 'knees', 0.5); u.h.exert = 1; } else if (!S.up) S.playUp('Hit_Chest', { rate: 0.35, fade: 0.3, fadeAt: 1.2, fadeOut: 0.5 });
  S.talkT = Math.max(S.talkT || 0, 0.3); S.talkK = 0.5;
  if (C.t > (u.pantT || 0)) { u.pantT = C.t + rnd(3, 5); vox(u, 'pant', { dur: rnd(1.8, 2.8), pri: 1 }); }
  if (th) S.lookAt = (S.lookAt || V()).set(th.s.pos.x, 1.5, th.s.pos.z);
  if (th && th.s.pos.distanceTo(S.pos) < 2.5) { u.gasp = 0; S.lookAt = null; }   // it's on them: go
  if (u.gasp <= 0) S.lookAt = null;
  return u.gasp > 0;
}
// a stumble: a lurch, a couple of slow steps, then on
function stumbling(u, dt) {
  u.stumT = (u.stumT || 0) - dt;
  if (u.stumT < -rnd(6, 14) * (u.prey ? 0.6 : 1) && u.s.speed > 2.4 && Math.random() < dt * 2) { u.stumT = 0.55; if (!u.s.up) u.s.playUp('Hit_Head', { rate: 1.4, fade: 0.08, fadeAt: 0.45, fadeOut: 0.3 }); Math.random() < 0.3 && vox(u, 'hurt', { pri: 1, gain: 0.7 }); }
  return u.stumT > 0 ? 0.4 : 1;
}
// a trip: down on the ground, and the time it takes to get back up
function trip(u) {
  const S = u.s; if (S.act) return;
  u.trip = { t: 0, up: false }; u.tripT = C.t + rnd(6, 10); u.path = null;
  S.play('Death_D', { hold: true, fade: 0.2, rate: 1.15, from: 0.25 });   // a sprawl, not a death: in part-way, at a natural pace
  X.SND.bodyFall && X.SND.bodyFall(S.pos, 0.6, Math.max(0.1, ((X.SND.DEATH_HIT || 1.2) - 0.25) / 1.15));
  if (!vox(u, 'hurt', { pri: 1, gain: 0.8 })) scream(u, 0.5);
  findHelper(u);
}
function tripping(u, cmd, dt = 1 / 60) {
  const S = u.s, T = u.trip; T.t += dt;
  if (!T.up && T.t > (T.dn ||= rnd(1.5, 2.1))) { T.up = true; S.play('LayToIdle', { fade: 0.35, rate: 1.1 }); }
  if (T.up && (!S.act || S.act !== 'LayToIdle' || T.t > 5)) u.trip = null;
  void cmd; return cmd;
}
// one of the dead comes after them: one nearby that isn't busy, or one shambling out from somewhere you can't see
function sendPursuit(u) {
  const S = u.s, P = X.P();
  let best = null, bd = 40;
  for (const z of Z.list) { if (!z.active || !z.alive || z.z.state === 'feed' || (z.z.state === 'chase' && z.z.tgt === P) || z.dale) continue; const d = z.s.pos.distanceTo(S.pos); if (d < bd) { bd = d; best = z; } }
  if (!best && (PPL.sent || 0) < 4 + Math.round(2 * ((ZD.cur && ZD.cur.count) || 1))) {
    const z0 = Z.pool.find(z => !z.active && !z.dale && !z.turned), cam = X.camera.position;
    if (z0) for (let k = 0; k < 10; k++) {
      const a = S.yaw + Math.PI + rnd(-1.2, 1.2), rr = rnd(9, 14), x = S.pos.x + Math.sin(a) * rr, z = S.pos.z + Math.cos(a) * rr;
      if (!X.world.walkable(x, z) || X.world.houseAt(x, z) || Math.hypot(x - P.s.pos.x, z - P.s.pos.z) < 25) continue;
      if (X.world.los(cam, V(x, 1.75, z)) || X.world.los(cam, V(x, 1.1, z)) || X.world.los(cam, V(x, 0.3, z))) continue;   // head, chest and feet all out of sight
      const fx = x - cam.x, fz = z - cam.z, fd = Math.hypot(fx, fz); X.camera.getWorldDirection(tmp);
      if (fd < 60 && (fx * tmp.x + fz * tmp.z) > 0 && X.world.los(cam, V(x, 2.2, z))) continue;   // in front of you and close: only from behind something taller than a person
      wake(z0, x, z, { yaw: Math.atan2(S.pos.x - x, S.pos.z - z), state: 'chase', runner: Math.random() < 0.35 * ((ZD.cur && ZD.cur.runners) ?? 1) || !!(ZD.cur && ZD.cur.allRun) });
      best = z0; PPL.sent = (PPL.sent || 0) + 1; break;
    }
  }
  if (!best) return;
  const Zb = best.z; Zb.state = 'chase'; Zb.tgt = u; Zb.seen = C.t; Zb.lastSeen.copy(S.pos); Zb.lockT = C.t + 12; Zb.path = null;
}

// ---------------------------------------------------------------- face to face
// talked to (or nearly walked into): they stop, turn the whole body to you and look you in the eye while the words are
// up, then carry on with whatever they were doing. A zombie close by cuts it short.
function holding(u, dt, P, cmd) {
  const S = u.s;
  if (nearestZombie(u, 7) || !P.alive) { endHold(u); return false; }
  u.holdT -= dt; u.t += dt;   // their own clocks wait for them
  if (u.holdT <= 0) { endHold(u); return false; }
  if (S.act && !u.held) { u.held = { act: S.act, opt: S.acts[S.act].opt }; S.stopAct(0.3); }   // up off their knees to talk
  cmd.move = null; cmd.face = Math.atan2(P.s.pos.x - S.pos.x, P.s.pos.z - S.pos.z);
  S.lookAt = (u.eyeV ||= V()).set(P.s.pos.x, P.s.pos.y + 1.65, P.s.pos.z);
  return true;
}
function endHold(u) {
  const S = u.s; u.holdT = 0; u.lookT = 0; if (S.lookAt === u.eyeV) S.lookAt = null; else if (S.lookAt && PPL.phase === 'calm' && !u.errand) S.lookAt = null;
  if (u.held) { const h = u.held; u.held = null; if (h.opt && h.opt.loop && u.alive) S.play(h.act, h.opt); }
}
function holdFor(u, sec) { u.holdT = Math.max(u.holdT || 0, sec); }

function pace() { const p = this.pers || {}; return this.paceK || (this.paceK = rnd(0.92, 1.08) * (1.04 - 0.2 * (p.age || 0)) * (0.94 + 0.1 * (p.fit ?? 0.5))); }
for (const k of ['say', 'pace']) void k;

// ---------------------------------------------------------------- a survivor's mind
function survivor(u, dt, P, W, cmd, pd) {
  const S = u.s;
  if (S.act && u.st !== 'search') S.stopAct(0.2);
  const zn = nearestZombie(u, 14);
  const armed = u.weapon && u.weapon !== 'fists';
  const close = zn && zn.d < 9 && W.los(tmp.set(S.pos.x, 1.5, S.pos.z), V(zn.z.s.pos.x, 1.5, zn.z.s.pos.z));
  // how many are on me?
  let crowd = 0; if (close) for (const z of Z.list) if (z.active && z.alive && z.s.pos.distanceTo(S.pos) < 6) crowd++;
  const canFight = close && ((armed && crowd <= 2 && u.hp > 40) || (!armed && crowd <= 1 && u.hp > 70 && zn.z.z && zn.z.z.state !== 'chase'));   // one slow one: even bare hands will do
  const fightIt = () => { if (!armed && !u.weapon && u.mel) { u.weapon = 'fists'; u.fistsOnly = true; u.mel.set('fists'); } };
  const back = () => { if (u.fistsOnly && !u.hostile) { u.weapon = null; u.fistsOnly = false; } return u.tag && P.alive ? 'tag' : 'idle'; };
  if (u.st === 'tag' && close && zn.d < 6) { u.st = canFight ? 'fight' : 'run'; if (u.st === 'fight') fightIt(); u.target = zn.z; u.path = null; if (!u.bubble) u.say(u.st === 'fight' ? pick(['I got it!', 'Behind you!', 'Stay back!']) : pick(['Too many!', 'Move, move!']), 2); }
  if (close && (u.st === 'search' || u.st === 'loot' || u.st === 'idle' || u.st === 'holeup')) { if (u.st === 'search') { S.stopAct(0.15); u.reserve && (u.reserve.taken = null); } u.st = canFight ? 'fight' : 'run'; if (u.st === 'fight') fightIt(); u.target = zn.z; u.enter = null; u.path = null; if (!u.bubble) u.say(u.st === 'fight' ? pick(['Come on then!', 'Stay back!', 'I got this one.']) : pick(['Too many!', 'Nope. Nope.', 'Move, move!']), 2); }
  if (u.st === 'fight') {
    const z = u.target;
    if (!z || !z.alive || !z.active || z.s.pos.distanceTo(S.pos) > 12 || crowd > 3 || u.hp < 35) { const b = back(); u.st = !z || !z.alive ? b : 'run'; u.t = rnd(0.5, 2); return cmd; }
    const d = z.s.pos.distanceTo(S.pos), face = Math.atan2(z.s.pos.x - S.pos.x, z.s.pos.z - S.pos.z);
    if (d > 1.5 && !W.los(tmp.set(S.pos.x, 1.5, S.pos.z), V(z.s.pos.x, 1.5, z.s.pos.z))) { back(); u.st = 'run'; u.t = 0; u.path = null; return cmd; }   // lost it behind a fence: no swinging at the boards
    cmd.face = face;
    const reach = (MELEE[u.weapon] || MELEE.fists).reach;
    if (d > reach * 0.9) { cmd.move = face; cmd.speed = S.vw * 1.6; }
    else if (d < 0.8) { cmd.move = face + Math.PI; cmd.speed = S.vw; }
    u.swingT -= dt;
    if (d < reach + 0.3 && u.swingT <= 0 && Math.abs(wrapPi(face - S.yaw)) < 0.5) { u.swingT = rnd(0.7, 1.2); u.mel.attack(100); X.SND.swing(0.5, S.pos); u.target = z; }
    return cmd;
  }
  if (u.st === 'run') {
    const z = u.target;
    if (!z || !z.alive || z.s.pos.distanceTo(S.pos) > 24) { u.st = back(); u.t = rnd(4, 7); u.path = null; return cmd; }   // well clear first, and a breather before going back to it
    if (!u.path || u.t <= 0) { u.t = 3; const a = Math.atan2(S.pos.x - z.s.pos.x, S.pos.z - z.s.pos.z); for (let k = 0; k < 6; k++) { const aa = a + rnd(-0.8, 0.8), r = rnd(16, 28), x = S.pos.x + Math.sin(aa) * r, zz = S.pos.z + Math.cos(aa) * r; if (W.walkable(x, zz)) { go(u, x, zz); break; } } }
    if (follow(u, run(u), cmd, dt)) u.path = null;
    return cmd;
  }
  if (u.st === 'tag') {   // with you: a few steps behind, off to one side
    if (!P.alive || !u.tag) { u.tag = false; u.st = 'idle'; u.t = rnd(1, 3); return cmd; }
    const dP = Math.hypot(P.s.pos.x - S.pos.x, P.s.pos.z - S.pos.z), py = P.s.yaw, sd = u.i % 2 ? 1.3 : -1.3, bk = 2.6 + (u.i % 3) * 0.6;
    const bx = P.s.pos.x - Math.sin(py) * bk + Math.cos(py) * sd, bz = P.s.pos.z - Math.cos(py) * bk - Math.sin(py) * sd;
    if (dP > 4.2 || (u.path && u.path.length && dP > 2.6)) {
      const gx = W.walkable(bx, bz) ? bx : P.s.pos.x, gz = W.walkable(bx, bz) ? bz : P.s.pos.z;
      return chase(u, { s: { pos: V(gx, 0, gz) } }, dt, cmd, dP, dP > 12 ? run(u) : Math.max(S.vw, Math.min(S.vw * 1.6, P.s.speed || S.vw)));
    }
    u.path = null;
    if (dP < 1.5) { cmd.move = Math.atan2(S.pos.x - P.s.pos.x, S.pos.z - P.s.pos.z); cmd.speed = S.vw * 0.6; }
    cmd.face = Math.atan2(P.s.pos.x - S.pos.x, P.s.pos.z - S.pos.z) + (u.i % 2 ? 0.7 : -0.7);
    return cmd;
  }
  if (u.st === 'search') {
    const c = u.loot; cmd.face = Math.atan2(c.x - S.pos.x, c.z - S.pos.z);
    u.touchT = (u.touchT ?? 1) - dt;
    if (u.touchT <= 0 && u.t > 0.4) {   // their hands move things too, and you hear exactly that
      u.touchT = rnd(0.5, 0.9);
      const av = (c.items || []).filter(it => !it.taken);
      if (av.length) { const it = pick(av), how = Math.random() < 0.15 ? 'tip' : Math.random() < 0.3 ? 'take' : 'shift'; X.world.moveItem(it, how); X.world.itemPos(it, tmp); X.SND.touch(it.kind, tmp.clone(), how); u.handK = { getWorldPosition: o => X.world.itemPos(it, o) }; if (!u.handT) u.handT = 0.001; }
      else X.SND.touch('hand', V(c.x, c.y, c.z));
    }
    if (u.t <= 2.1 && !u.handT && c.parts && c.parts[0] && c.parts[0].knob) { u.handT = 0.001; u.handK = c.parts[0].knob; }
    if (u.t <= 1.6 && !u.opened) { u.opened = true; if (W.open(c)) X.SND.opening(c.car ? 'car' : c.kind === 'fridge' ? 'fridge' : c.kind === 'bin' ? 'lid' : c.parts && c.parts[0].kind === 'slide' ? 'slide' : 'door', V(c.x, c.y, c.z)); }
    if (u.t <= 0) {
      S.stopAct(0.3); u.handT = 0; c.searched = true; c.takenBy = u.name; u.found++; X.noise(S.pos, 4);
      // sometimes it's a weapon
      if ((!u.weapon || u.weapon === 'fists') && Math.random() < 0.3) { u.weapon = pick(['bat', 'crowbar', 'machete', 'knife']); u.mel.set(u.weapon); if (pd < 14) u.say((['Ha. This\'ll do.', 'Finally, something to swing.', 'Better than my fists.']), 2.5); }
      else if (pd < 12 && Math.random() < 0.4) u.say((['Canned peaches!', 'Empty. Figures.', 'Bandages. Good.', 'Some water.', 'Nothing.']), 2);
      u.st = 'idle'; u.t = rnd(7, 16);
      if (u.found >= (u.quota ||= Math.floor(rnd(6, 10)))) { u.st = 'holeup'; u.home = null; if (pd < 14) u.say((['That\'s enough. I\'m finding somewhere to hole up.', 'I\'m going to ground. Good luck out here.']), 3); }
    }
    return cmd;
  }
  if (u.st === 'holeup') {   // they've got what they need: the nearest empty house, in, door shut and locked
    if (!u.enter) {
      let best = null, bd = 1e9;
      for (const h of W.houses) { if (h.store || h === X.G.home || !h.front || h.front.broken || taken(h, u)) continue; const d = Math.hypot(h.x - S.pos.x, h.z - S.pos.z); if (d < bd) { bd = d; best = h; } }
      if (!best) { u.st = 'idle'; u.t = rnd(5, 10); return cmd; }
      u.home = best; enterHouse(u, best);
    }
    if (entering(u, dt, cmd, pd, S.vw * 1.2) === 'fail') { u.enter = null; u.t = 0.5; }
    return cmd;
  }
  if (u.st === 'loot') {
    const c = u.loot;
    if (!c || c.searched || c.hidden) { u.st = 'idle'; u.t = 0.5; return cmd; }
    if (follow(u, S.vw * 1.05, cmd, dt)) {
      if (c.fake) { u.st = 'idle'; u.t = rnd(0.5, 2); return cmd; }
      const sd = Math.hypot(c.x - S.pos.x, c.z - S.pos.z);
      if (sd < 1.9) { u.st = 'search'; u.opened = false; u.t = rnd(3, 4.5); S.yaw = c.stand ? c.stand.yaw : Math.atan2(c.x - S.pos.x, c.z - S.pos.z); const an = c.y < 0.7 ? 'Fixing_Kneeling' : c.y > 1.15 ? 'Interact' : 'Chest_Open'; S.play(an, { loop: true, fade: 0.25, rate: an === 'Interact' ? 0.55 : 0.9, from: an === 'Chest_Open' ? 0.2 : 0 }); /* the same reach the player uses: low, waist height, up high */ X.SND.rummage(c.kind, 3, V(c.x, c.y, c.z), { events: false }); u.touchT = 0.9; }
      else { u.st = 'idle'; u.t = 0.3; c.skipBy = u.name; }
    }
    return cmd;
  }
  // idle: pick the next place to search — the nearest one nobody has been through, not where you are
  if (u.t > 0) { if (pd < 5) cmd.face = Math.atan2(P.s.pos.x - S.pos.x, P.s.pos.z - S.pos.z); return cmd; }
  let best = null, bd = 1e9;
  for (const c of W.containers) {
    if (c.searched || c.hidden || c.kind === 'corpse' || c.kind === 'escape' || c.kind === 'radio' || c.kind === 'tv' || c.fixed || c.note || c.skipBy === u.name) continue;
    if (c.house && (c.house === X.G.home || taken(c.house, u) || (c.house.front && c.house.front.locked))) continue;   // not your house, and not where somebody's locked themselves in
    const d = Math.hypot(c.x - S.pos.x, c.z - S.pos.z) + (c.house ? 0 : 6);
    if (d > 50 || d > bd) continue;
    if (Math.hypot(c.x - P.s.pos.x, c.z - P.s.pos.z) < 4) continue;
    if (Z.list.some(z => z.active && z.alive && Math.hypot(z.s.pos.x - c.x, z.s.pos.z - c.z) < 7)) continue;
    bd = d; best = c;
  }
  if (!best) { u.t = rnd(3, 6); const x = S.pos.x + rnd(-25, 25), z = S.pos.z + rnd(-25, 25); if (W.walkable(x, z)) { go(u, x, z); u.st = 'loot'; u.loot = { x, z, y: 1, kind: 'walk', searched: false, fake: true }; } return cmd; }
  const st = best.stand && W.walkable(best.stand.x, best.stand.z) ? best.stand : { x: best.x, z: best.z };
  u.path = findPath(S.pos.x, S.pos.z, st.x, st.z);
  if (!u.path) { best.skipBy = u.name; u.t = 0.5; return cmd; }
  u.loot = best; u.st = 'loot';
  return cmd;
}
// ---------------------------------------------------------------- the ambulance you called
// It pulls up, the back doors open, and two paramedics climb down with their bag. They think this is a town full of sick
// people — so they go to the nearest "patient" (one of the dead), kneel by it or reach for it, and it does what the dead
// do. They don't fight back. Everyone on their feet nearby runs for the open doors; in the back, some get patched up.
const SICK = ['I don\'t... feel so good...', 'It\'s so hot. Why is it so hot?', 'My arm... it\'s gone numb...', 'I think... I need to sit down...'];
const MEDIC = {
  look: ['Where\'s the patient?', 'Dispatch said multiple injuries...', 'Okay. Where is everybody?'],
  call: ['Anyone hurt? Over here!', 'Paramedics! Anyone need help?', 'If you\'re injured, come to the ambulance!', 'Hello? We got a call about injuries!'],
  sir: ['Sir? Sir, can you hear me?', 'Sir, we\'re paramedics. We\'re here to help.', 'Sir, I need you to stay still for me.'],
  maam: ['Ma\'am? Ma\'am, can you hear me?', 'Ma\'am, we\'re here to help.', 'Ma\'am, stay with me, okay?'],
  treat: ['Let me see that bite.', 'Okay, easy... easy. Let me take a look.', 'You\'re really pale. How long ago did this happen?', 'Pulse is... I can\'t find a pulse.'],
  calm: ['Sir! Calm down! We\'re trying to HELP you!', 'Whoa — easy! EASY!', 'Restrain him! Get his arms!'],
};
const female = z => { const k = X.KINDS.michelle; return !!k && (z.s.kind === k || z.s.kind === k.zk); };
// a spot behind the ambulance: back = metres behind its middle, side = metres to its right
function ambSpot(A, back, side = 0) {
  const g = A.g, y = g.rotation.y, p = g.position;
  return [p.x - Math.sin(y) * back + Math.cos(y) * side, p.z - Math.cos(y) * back - Math.sin(y) * side];
}
// a parked ambulance is solid for them too (the same box main.js keeps you out of)
function offAmbs(pos) {
  for (const M of PPL.ambs) {
    const g = M.A.g; if (!g || !g.parent) continue;
    const dx = pos.x - g.position.x, dz = pos.z - g.position.z, c = Math.cos(g.rotation.y), sn = Math.sin(g.rotation.y), lx = dx * c - dz * sn, lz = dx * sn + dz * c;
    if (Math.abs(lx) >= 1.35 || Math.abs(lz) >= 3.0) continue;
    if (1.35 - Math.abs(lx) < 3.0 - Math.abs(lz)) { const nl = Math.sign(lx) * 1.35; pos.x = g.position.x + nl * c + lz * sn; pos.z = g.position.z - nl * sn + lz * c; }
    else { const nz = Math.sign(lz) * 3.0; pos.x = g.position.x + lx * c + nz * sn; pos.z = g.position.z - lx * sn + nz * c; }
  }
}
// their bag: a red trauma bag with a reflective band and a carry strap
function bagMesh() {
  const g = new THREE.Group(), M = (color, r = 0.7, e = 0) => new THREE.MeshStandardMaterial({ color, roughness: r, emissive: e ? color : 0, emissiveIntensity: e });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.24, 0.2), M(0xb3201a, 0.75)); body.position.y = 0.2; g.add(body);
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.445, 0.035, 0.205), M(0xd8dcdc, 0.3, 0.15)); band.position.y = 0.2; g.add(band);
  for (const [w, h] of [[0.07, 0.022], [0.022, 0.07]]) for (const sz of [1, -1]) { const c2 = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.004), M(0xf4f4f4, 0.5)); c2.position.set(0.12, 0.2, 0.102 * sz); g.add(c2); }   // a white cross on both faces
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 6, 14, Math.PI), M(0x1a1a1a, 0.8)); strap.position.y = 0.08; strap.rotation.z = Math.PI; g.add(strap);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
// somebody nobody will miss from where they are: nobody about, or indoors far from you, or out of sight far away
function freeNPC() {
  const P = X.P(), far = v => Math.hypot(v.s.pos.x - P.s.pos.x, v.s.pos.z - P.s.pos.z) > 45;
  const named = v => v.daleBody || v.role === 'bro' || v.role === 'medic' || v.amb || ['GARY', 'RAJ', 'LINDA', 'DEB', 'TOM', 'JESSE', 'MORGAN'].includes(v.name);
  const L = PPL.list.filter(v => !v.zu && !v.downAt && !(v.s.zTurn) && !named(v) && !v.rode);
  let u = L.find(v => !v.active || (v.gone && !v.inHouse && !v.enter && v.st !== 'runto'))
    || L.find(v => v.gone && v.inHouse && far(v))
    || L.find(v => v.active && !v.gone && v.alive && v.role !== 'surv' && !v.s.visible && far(v))
    || PPL.list.find(v => v.rode && !v.zu);
  if (u && u.inHouse) { const h = u.inHouse; if (h.occupied === u) h.occupied = null; if (h.front) h.front.locked = false; u.inHouse = null; }
  return u || null;
}
export function ambulanceArrives(A, chance) {
  if (!X || !A || !A.g) return [];
  A.board ||= [];
  PPL.ambs = (PPL.ambs || []).filter(m => m.A.g && m.A.g.parent && m.A !== A);
  const M = { A, chance: chance || 0, medics: [], riders: [], t: 0, callT: 0.5 };
  A.ppl = M; PPL.ambs.push(M);
  const yaw = A.g.rotation.y + Math.PI;
  for (let k = 0; k < 2; k++) {
    let u = freeNPC();
    if (!u && PPL.list.length < 32) { u = makeOne(PPL.list.length, k ? 'michelle' : pick(['coach', 'butler', 'human'])); u.extra = true; }   // nobody spare in town: two more people, made now
    if (!u) break;
    const [x, z] = ambSpot(A, 3.05, k ? 0.45 : -0.45);
    reset(u, 'medic', 'PARAMEDIC', x, z, yaw, 'out', { t: 0.3 + k * 0.9, med: { M, k, mate: null, sayT: 0 } });
    uniformOn(u); u.weapon = null; if (u.mel) u.mel.hideAll();
    u.bag = hold(u, bagMesh(), [0, 0.05, 0.02], [0, 0, 0]);
    M.medics.push(u);
  }
  if (M.medics.length === 2) { M.medics[0].med.mate = M.medics[1]; M.medics[1].med.mate = M.medics[0]; }
  syncList();
  return M.medics;
}
// everyone close enough and still on their feet runs for the open doors
function callRiders(M) {
  const A = M.A; if (PPL.phase === 'calm') return;
  const [bx, bz] = ambSpot(A, 3.6);
  for (const u of PPL.list) {
    if (!u.active || u.gone || !u.alive || u.zu || u.downAt || u.amb || u.trip || A.board.includes(u)) continue;
    if (['medic', 'bro', 'dale', 'market'].includes(u.role) || u.st === 'down' || u.st === 'runto' || u.st === 'escape' || (u.doomed && PPL.marketOn)) continue;
    if (Math.hypot(u.s.pos.x - bx, u.s.pos.z - bz) > 30) continue;
    if (u.enter) { if (u.enter.h.occupied === u) u.enter.h.occupied = null; u.enter = null; }
    if (u.s.act) u.s.stopAct(0.2);
    if (u.plan && u.plan.car) u.plan.car.hider = null;
    if (u.role === 'surv' && u.st === 'search' && u.reserve) u.reserve.taken = null;
    u.amb = M; u.path = null; u.plan = null; u.holdT = 0; u.climb = 0; u.s.lookAt = null;
    if (!u.bubble && Math.random() < 0.6) u.say((['The ambulance! WAIT!', 'Wait for me! WAIT!', 'Hold the doors!', 'Over there — the ambulance!']), 2);
  }
}
function boarding(u, dt, cmd) {
  const M = u.amb, A = M.A, S = u.s;
  if (!A.g || !(A.openT > 0)) {   // too late: the doors are shut
    u.amb = null; u.path = null; u.climb = 0; u.t = 0.5; u.plan = null;
    u.st = u.role === 'surv' ? 'idle' : PPL.phase === 'calm' ? 'walk' : 'panic';
    if (!u.bubble) u.say((['No! NO! Come back!', 'They left... they LEFT us!']), 2.5);
    return cmd;
  }
  if (u.trip) return tripping(u, cmd, dt);
  const [bx, bz] = ambSpot(A, 3.55, ((u.i % 3) - 1) * 0.3), d = Math.hypot(bx - S.pos.x, bz - S.pos.z);
  if (u.climb || d < 0.7) {   // a hand on the door frame, a step up, and in
    u.climb = (u.climb || 0) + dt;
    cmd.face = A.g.rotation.y; S.lookAt = null;
    if (u.climb < dt * 1.5) S.playUp('Interact', { rate: 1.1, fade: 0.12, fadeAt: 0.6 });
    if (u.climb > 0.55) climbIn(u, M);
    return cmd;
  }
  u.repT = (u.repT || 0) - dt;
  if (!u.path || u.repT <= 0) { u.repT = 2; go(u, bx, bz, 20000); }
  if (follow(u, run(u) * stumbling(u, dt), cmd, dt)) u.path = null;
  return cmd;
}
function climbIn(u, M) {
  const A = M.A, S = u.s;
  A.board.push(u); u.climb = 0; u.path = null;
  u.gone = true; u.hidden = true; S.setVisible(false); if (u.mel) u.mel.hideAll();
  const healed = u.role !== 'medic' && Math.random() < M.chance;
  if (healed) { u.infectAt = 0; u.sickSaid = false; u.hp = u.hpSeen = u.maxHp; u.cured = true; }
  M.riders.push({ u, t: 0, out: rnd(4, 7), healed });
  X.SND.touch && X.SND.touch('box', V(S.pos.x, 0.9, S.pos.z));
  syncList();
}
function ambTick(dt) {
  for (const M of PPL.ambs) {
    const A = M.A; if (!A.g) continue;
    M.t += dt; M.callT -= dt;
    const open = A.openT > 0;
    if (open && M.callT <= 0) { M.callT = 1; callRiders(M); }
    for (const r of M.riders) {
      if (r.done) continue; r.t += dt; const u = r.u;
      if (!open) { r.done = true; u.rode = true; u.amb = null; u.active = false; continue; }   // doors shut with them inside: they're out of here
      if (r.healed || r.t < r.out || A.openT < 0.6) continue;
      // nothing they can do for this one: back out the doors
      r.done = true; u.amb = null;
      const [x, z] = ambSpot(A, 3.4, rnd(-0.5, 0.5));
      u.s.place(x, z, A.g.rotation.y + Math.PI); u.s.setVisible(true); u.gone = false; u.hidden = false; u.path = null; u.plan = null; u.t = rnd(0.5, 1.5);
      u.st = u.role === 'surv' ? 'idle' : 'panic';
      u.say((['They can\'t do anything for me...', '"Sorry, we can\'t help you here." Great. GREAT.', 'They said get to a hospital. WHAT hospital?!']), 3);
      syncList();
    }
  }
}
// ---- a paramedic's mind
function medic(u, dt, P, W, cmd, pd) {
  const S = u.s, Md = u.med, A = Md.M.A;
  if (S.act && u.st !== 'treat') S.stopAct(0.2);
  void P; void W; void pd;
  Md.sayT -= dt;
  if (!A.g || !A.g.parent) { u.role = 'surv'; u.st = 'idle'; u.t = 2; u.med = null; u.found = u.found || 0; u.weapon = null; if (!u.mel) u.mel = new Melee(u.s, X.scene, X.SWINGS); u.mel.set('fists'); u.mel.hideAll(); u.target = null; u.path = null; u.say(['They LEFT us?!', 'Hey! HEY! Come back!'], 3); return cmd; }   // the rig's gone without them
  if (!(A.openT > 0) && (u.st === 'go' || u.st === 'look')) { u.st = 'return'; u.path = null; }   // the doors shut: back to the rig
  if (u.st === 'out') {   // down off the back step, then a few paces clear of the doors
    if (u.t > 0) { cmd.face = A.g.rotation.y + Math.PI; return cmd; }
    const [x, z] = ambSpot(A, 4.9, Md.k ? 1.3 : -1.3);
    if (steer(u, x, z, S.vw * 0.9, cmd, dt)) { u.st = 'look'; u.t = rnd(1.6, 2.6); if (Md.k === 0) u.say((MEDIC.look), 2.5); }
    return cmd;
  }
  if (u.st === 'look') {   // where's the patient?
    const a = A.g.rotation.y + Math.PI + Math.sin(C.t * 1.6 + u.i) * 1.2;
    S.lookAt = (S.lookAt || V()).set(S.pos.x + Math.sin(a) * 9, 1.5, S.pos.z + Math.cos(a) * 9);
    if (u.t > 0) return cmd;
    S.lookAt = null; return pickPatient(u, 'call');
  }
  if (u.st === 'call') {   // nobody's come: stand by the ambulance and call out
    if (!(A.openT > 0)) { u.st = 'return'; u.path = null; return cmd; }
    const [x, z] = ambSpot(A, 4.6, Md.k ? 1.4 : -1.4);
    if (Math.hypot(x - S.pos.x, z - S.pos.z) > 1.2) { steer(u, x, z, S.vw, cmd, dt); return cmd; }
    cmd.face = A.g.rotation.y + Math.PI + (Md.k ? 0.5 : -0.5);
    if (Md.sayT <= 0) { Md.sayT = rnd(4.5, 7.5); u.say((MEDIC.call), 2.8); S.playUp('Interact', { rate: 0.8, fade: 0.25, fadeAt: 1.2 }); X.noise(S.pos, 16); }
    if (u.t <= 0) { u.t = 1.2; const zn = nearestZombie(u, 45); if (zn) { u.target = zn.z; u.st = 'go'; u.path = null; Md.said = false; } }
    return cmd;
  }
  if (u.st === 'return') {   // back in the rig (picking the bag back up on the way)
    const bg = u.bagDown;
    if (bg && bg.parent === X.scene) {
      const bd = Math.hypot(bg.position.x - S.pos.x, bg.position.z - S.pos.z);
      if (bd < 0.9) { u.bag = hold(u, bg, [0, 0.05, 0.02], [0, 0, 0]); u.bagDown = null; u.path = null; S.playUp('Interact', { rate: 1.1, fade: 0.12, fadeAt: 0.6 }); X.SND.touch && X.SND.touch('box', V(S.pos.x, 0.2, S.pos.z)); return cmd; }
      if (bd < 40) { steer(u, bg.position.x, bg.position.z, S.vw * 1.1, cmd, dt); return cmd; }
      u.bagDown = null;
    }
    const [x, z] = ambSpot(A, 3.5, Md.k ? 0.4 : -0.4);
    if (Math.hypot(x - S.pos.x, z - S.pos.z) < 0.6) { climbIn(u, Md.M); return cmd; }
    if (!u.path) go(u, x, z, 20000);
    if (follow(u, S.vw, cmd, dt)) u.path = null;
    return cmd;
  }
  const z = u.target;
  if (!z || !z.alive || !z.active) { u.target = null; return pickPatient(u, A.openT > 0 ? 'call' : 'return'); }
  const zx = z.s.pos.x, zz = z.s.pos.z, d = Math.hypot(zx - S.pos.x, zz - S.pos.z), face = Math.atan2(zx - S.pos.x, zz - S.pos.z);
  const lying = z.z && (z.z.down > 0 || z.z.lying || z.crawl);
  if (u.st === 'go') {   // brisk, not running: they think it's a sick man
    if (d < 7) lure(z, u);
    if (!Md.said && d < 10) { Md.said = true; u.say((female(z) ? MEDIC.maam : MEDIC.sir), 2.8); }
    if (d < (lying ? 1.05 : 1.15)) {
      u.st = 'treat'; u.t = rnd(2.6, 4); u.path = null; cmd.face = face;
      if (u.bag) { letGo(u.bag); u.bagDown = u.bag; u.bag = null; X.SND.touch && X.SND.touch('box', V(S.pos.x, 0.2, S.pos.z)); }   // the bag goes down first
      if (lying) S.play('Fixing_Kneeling', { loop: true, fade: 0.3, rate: 0.9 }); else S.playUp('Interact', { rate: 0.6, fade: 0.25, fadeAt: 1.6 });
      later2(() => u.alive && u.st === 'treat' && u.say((MEDIC.treat), 2.6), 0.8);
      return cmd;
    }
    if (d > 4.5) { u.repT = (u.repT || 0) - dt; if (!u.path || u.repT <= 0) { u.repT = 1.2; go(u, zx, zz, 20000); } if (follow(u, d > 25 ? S.vr * 0.7 : S.vw * 1.3, cmd, dt)) u.path = null; }
    else steer(u, zx - Math.sin(face) * 0.85, zz - Math.cos(face) * 0.85, S.vw * 1.05, cmd, dt);
    if (d < 6) cmd.face = face;
    return cmd;
  }
  if (u.st === 'treat') {   // knelt by it, or a hand out to its shoulder
    cmd.face = face; lure(z, u);
    if (!lying && d < 1.6) S.reach(1, { p: V(zx, 1.35 * (z.sizeK || 1), zz), f: V(Math.sin(face), 0, Math.cos(face)), s: V(-Math.cos(face), 0, Math.sin(face)), curl: 0.3, blend: true }, 0.8);
    if (d > 1.9) { if (S.act) S.stopAct(0.2); u.st = 'go'; u.path = null; return cmd; }
    if (u.t <= 0) { u.t = rnd(1.6, 2.4); bite(z, u); }   // it doesn't wait to be examined
    return cmd;
  }
  if (u.st === 'bitten') {   // reeling back, clutching the arm, not believing it
    cmd.face = face;
    if (d < 1.6) { cmd.move = face + Math.PI; cmd.speed = S.vw * 0.55; }
    lure(z, u);
    if (u.t <= 0) { u.st = 'treat'; u.t = rnd(1.4, 2.2); u.say((MEDIC.calm), 2.4); }
    return cmd;
  }
  return cmd;
}
function pickPatient(u, otherwise) {
  const zn = nearestZombie(u, 60);
  if (zn) { u.target = zn.z; u.st = 'go'; u.path = null; u.med.said = false; }
  else { u.st = otherwise; u.t = 0; u.path = null; }
  return {};
}
// the "patient" turns its attention to them
function lure(z, u) {
  const Zb = z.z, P = X.P(); if (!Zb || Zb.tgt === u) return;
  if (Zb.tgt === P && Zb.state === 'chase' && P.alive && z.s.pos.distanceTo(P.s.pos) < 4) return;   // busy with you
  if (z.s.act === 'Fixing_Kneeling') z.s.stopAct(0.3);
  Zb.state = 'chase'; Zb.tgt = u; Zb.seen = C.t; Zb.lastSeen.copy(u.s.pos); Zb.lockT = C.t + 10; Zb.path = null; Zb.feedOn = null;
}
// close enough to touch it: it grabs and bites (the same blow the dead land on anybody: zombieClawNPC)
function bite(z, u) {
  if (!z.alive || !u.alive) return;
  if (z.z) z.z.down = Math.min(z.z.down || 0, 0.25);
  if (!z.s.up && !z.crawl) z.s.playUp('Zombie_Scratch', { rate: 1.15, fade: 0.1, fadeAt: 1.2, fadeOut: 0.3 });
  later2(() => {
    if (!z.alive || !u.alive || u.gone || z.s.pos.distanceTo(u.s.pos) > 2) return;
    if (C.events.zombieClawNPC) C.events.zombieClawNPC(z, u); else hurtNPC(u, rnd(34, 52), z);
  }, 0.45);
}

// ---------------------------------------------------------------- Ben, your brother (next door)
const BEN = {
  hi: ['Hey, Sam! You see my text? Burgers at twelve.', 'Morning, Sam. Coffee\'s on if you want one.', 'Sam! Mom called me twice already. Call her back, man.'],
  calm: ['Raj\'s burgers, twelve o\'clock. I\'m buying. Well — you\'re buying.', 'Em and the kids get off okay?', 'Mom wants a video call later. She says you never pick up.', 'You see that truck outside the Quick Stop this morning? No plates on it or anything.'],
  come: ['On my way. Grabbing my bat.', 'Coming! Don\'t shoot me!', 'Hang on — I\'m coming over.'],
  here: ['There you are. You okay? You\'re not bit, right?', 'Hey. I\'m here. What\'s the plan?', 'Okay. I\'m here. Stay close, alright?'],
  talk: ['Stay close. I got your back.', 'Mom\'s not picking up. She\'s probably at Aunt Rosa\'s.', 'What\'s the plan? Supplies, then we hole up somewhere?', 'Gary was just eating a BURGER, man. A burger.', 'If I get bit... you know what to do. Don\'t make me say it.', 'Remember when we used to play zombies in the backyard? Not funny anymore.'],
  fight: ['Get behind me!', 'Not my brother, you don\'t!', 'Back OFF!', 'I got this one!', 'Come on then!'],
  kill: ['Got it.', 'Stay down!', 'That\'s for Gary.', 'Stay DOWN.'],
  wait: ['I\'ll watch the door.', 'I\'ll wait out here. Holler if you need me.', 'Make it quick in there.'],
  talkNight: ['Mom\'s not picking up. It\'s the middle of the night in Lisbon... she\'s probably asleep.'],
  hurry: ['WAIT UP!', 'Hey! Slow down!', 'Don\'t leave me out here!'],
};
function benHouse() {
  const W = X.world, H = X.G.home; if (!H) return null;
  let best = null, bd = 1e9;
  for (const h of W.houses) { if (h === H || h.store || !h.front) continue; const d = Math.hypot(h.x - H.x, h.z - H.z); if (d < bd) { bd = d; best = h; } }
  return best;
}
// you texted him "come over": he heads out (with his bat), finds you and sticks with you
export function brotherComes(P) {
  const u = PPL.cast.ben; if (!X || !u) return 'none';
  if (u.zu || u.downAt || !u.alive) return 'dead';
  if (u.rode || u.amb || u.left || u.boarded) return 'gone';
  if (u.called) return 'coming';
  u.called = true; u.weapon = 'bat'; u.target = null;
  if (PPL.benMug && PPL.benMug.parent && PPL.benMug.parent !== X.scene) letGo(PPL.benMug);   // the coffee goes down before the bat comes up
  if (!u.mel) u.mel = new Melee(u.s, X.scene, X.SWINGS);
  u.mel.set('bat'); if (u.gone) u.mel.hideAll();
  if (u.gone && u.inHouse) { u.st = 'come'; leaveHouse(u, u.inHouse); }   // out his front door, it shuts behind him
  else if (u.gone) { const h = u.own, w = h && doorway(h); reset(u, 'bro', 'BEN', w ? w.out[0] : P.s.pos.x + 20, w ? w.out[1] : P.s.pos.z, w ? w.yawOut : 0, 'come', { own: h, called: true, weapon: 'bat' }); u.mel.set('bat'); }
  else { if (u.enter) { if (u.enter.h.occupied === u) u.enter.h.occupied = null; u.enter = null; } if (u.s.act) u.s.stopAct(0.3); u.st = 'come'; u.path = null; u.holdT = 0; }
  later2(() => u.alive && !u.gone && u.say((BEN.come), 2.5), u.exit ? 1 : 0.1);
  syncList();
  return 'coming';
}
// a zombie worth hitting: on you, or on him
function benThreat(u, P, W) {
  let best = null, bd = 1e9;
  for (const z of Z.list) {
    if (!z.active || !z.alive) continue;
    const dP = P.alive ? z.s.pos.distanceTo(P.s.pos) : 99, dB = z.s.pos.distanceTo(u.s.pos);
    if (dP > 9 && dB > 6) continue;
    if (dB > 2.5 && !W.los(tmp.set(u.s.pos.x, 1.5, u.s.pos.z), V(z.s.pos.x, 1.4, z.s.pos.z))) continue;
    const sc = u.st === 'come' ? dB : Math.min(dP, dB); if (u.st === 'come' && dB > 6) continue; if (sc < bd) { bd = sc; best = z; }
  }
  return best;
}
function brother(u, dt, P, W, cmd, pd) {
  const S = u.s;
  if (S.act && u.st !== 'stand') S.stopAct(0.25);
  if (u.left) {   // you hit him twice: he's going home, and he's not coming back out
    S.lookAt = null;
    if (u.st === 'leave') {
      if (!u.enter) { const h = u.own; if (!h || !h.front || h.front.broken || taken(h, u)) u.st = 'away'; else enterHouse(u, h); }
      if (u.enter && entering(u, dt, cmd, pd, S.vw * 1.3) === 'fail') { u.enter = null; u.st = 'away'; }
      return cmd;
    }
    const zn = nearestZombie(u, 8), from = zn ? zn.z.s.pos : pd < 14 ? P.s.pos : null;   // nowhere to go: away from you (and from them)
    if (from) { cmd.move = Math.atan2(S.pos.x - from.x, S.pos.z - from.z); cmd.speed = zn ? run(u) : S.vw * 1.1; }
    return cmd;
  }
  if (!u.called) {
    if (u.st === 'lockup') {   // the outbreak, before you call him: inside, door locked, phone in hand
      if (u.t > 0) { S.lookAt = (S.lookAt || V()).set(20, 1.5, -12); return cmd; }   // a long look down the street at the screaming first
      S.lookAt = null;
      if (!u.enter) { const h = u.own; if (!h || !h.front || h.front.broken || taken(h, u)) { u.st = 'stay'; return cmd; } enterHouse(u, h); }
      if (u.enter && u.enter.ph === 0 && !u.path) go(u, ...u.enter.out);
      const r = entering(u, dt, cmd, pd, run(u) * 0.8); if (r === 'fail') { u.enter = null; u.st = 'stay'; }
      return cmd;
    }
    const zn = nearestZombie(u, 8);   // locked out: he backs off from anything that comes near
    if (zn) { cmd.move = Math.atan2(S.pos.x - zn.z.s.pos.x, S.pos.z - zn.z.s.pos.z); cmd.speed = run(u); }
    return cmd;
  }
  const dP = Math.hypot(P.s.pos.x - S.pos.x, P.s.pos.z - S.pos.z);
  u.chatT = (u.chatT ?? rnd(20, 35)) - dt;
  // ---- hurt bad: he can't fight any more — he backs off from them and tells you
  if (u.hp <= 30 && (u.st === 'follow' || u.st === 'fight' || u.st === 'come')) {
    const zn = nearestZombie(u, 5);
    if (zn) {
      if (u.st === 'fight') { u.st = 'follow'; u.target = null; }
      if (!u.bubble && C.t > (u.hurtSayT || 0)) { u.hurtSayT = C.t + 8; u.say(['I\'m hurt — I can\'t, I CAN\'T!', `${X.G.pname || 'Sam'}! Help me!`, 'I can\'t lift it — get it off me!'], 2); }
      cmd.move = Math.atan2(S.pos.x - zn.z.s.pos.x, S.pos.z - zn.z.s.pos.z); cmd.speed = run(u) * 0.8; u.path = null; S.lookAt = null;
      return cmd;
    }
  }
  // ---- a fight: something's on you (or him)
  if (u.st === 'follow' || u.st === 'fight' || u.st === 'wait' || u.st === 'come') {
    const th = u.hp > 30 ? (u.target && u.target.alive && u.target.active && u.target.s.pos.distanceTo(S.pos) < 10 && (!P.alive || u.target.s.pos.distanceTo(P.s.pos) < 14) ? u.target : benThreat(u, P, W)) : null;
    if (th && u.st !== 'fight') { u.comeLeft = u.st === 'come'; u.st = 'fight'; u.path = null; if (!u.bubble && Math.random() < 0.7) u.say((BEN.fight), 1.8); }
    if (u.st === 'fight') {
      if (!th) { u.st = u.comeLeft ? 'come' : 'follow'; u.comeLeft = false; u.path = null; if (u.target && !u.target.alive && !u.bubble && Math.random() < 0.6) { const nm = u.target.from && u.target.from.name; u.say(nm && Math.random() < 0.6 ? [`Oh man... that was ${nm[0] + nm.slice(1).toLowerCase()}...`] : BEN.kill, 2); } u.target = null; return cmd; }
      u.target = th;
      const d = th.s.pos.distanceTo(S.pos), face = Math.atan2(th.s.pos.x - S.pos.x, th.s.pos.z - S.pos.z), reach = MELEE.bat.reach;
      cmd.face = face;
      if (d > reach * 0.9) { cmd.move = face; cmd.speed = d > 4 ? run(u) : S.vw * 1.6; }
      else if (d < 0.8) { cmd.move = face + Math.PI; cmd.speed = S.vw; }
      u.swingT -= dt;
      if (d < reach + 0.3 && u.swingT <= 0 && Math.abs(wrapPi(face - S.yaw)) < 0.5) { u.swingT = rnd(0.75, 1.15); u.mel.attack(100); X.SND.swing(0.5, S.pos); }
      return cmd;
    }
  }
  // ---- on his way to you
  if (u.st === 'come' || u.st === 'stand') {
    if (u.st === 'stand') u.st = 'come';
    const PH = W.houseAt(P.s.pos.x, P.s.pos.z), sameSide = PH === W.houseAt(S.pos.x, S.pos.z);
    if (dP < 4.5 && sameSide && W.los(tmp.set(S.pos.x, 1.6, S.pos.z), V(P.s.pos.x, 1.6, P.s.pos.z))) { u.st = 'follow'; u.path = null; u.knocked = false; u.say((BEN.here), 3.2); X.onBrotherHere && X.onBrotherHere(u); return cmd; }
    if (PH && PH.front && !sameSide) {   // you're indoors: he comes to your front door and knocks
      const w = doorway(PH);
      if (Math.hypot(w.out[0] - S.pos.x, w.out[1] - S.pos.z) < 1.5) {
        u.path = null; cmd.face = w.yawOut + Math.PI;
        if (!u.knocked || C.t > u.knockT) { u.knockT = C.t + 12; X.SND.door && X.SND.door('bang', V(w.D.x, 1, w.D.z)); if (!S.up) S.playUp('Interact', { rate: 1.3, fade: 0.1, fadeAt: 0.7 }); u.say([u.knocked ? `${X.G.pname || 'Sam'}! Open up, it's Ben!` : `${X.G.pname || 'Sam'}! It's me, open up!`], 2.5); u.knocked = true; }
        return cmd;
      }
      return chase(u, { s: { pos: V(w.out[0], 0, w.out[1]) } }, dt, cmd, dP, PPL.phase === 'calm' ? S.vw * 1.25 : run(u));
    }
    return chase(u, P, dt, cmd, dP, dP > 60 ? run(u) : PPL.phase === 'calm' ? S.vw * 1.25 : S.vr * 0.7);
  }
  // ---- you went indoors: he waits out front, watching the street
  const H = W.houseAt(P.s.pos.x, P.s.pos.z);
  if (H && H.front && P.alive && W.houseAt(S.pos.x, S.pos.z) !== H) {
    if (u.st !== 'wait') { u.st = 'wait'; u.path = null; u.waitSaid = false; }
    const w = doorway(H), ox = w.out[0] - w.D.x, oz = w.out[1] - w.D.z, ol = Math.hypot(ox, oz) || 1, x = w.out[0] + ox / ol * 0.9 + oz / ol * 0.8, z = w.out[1] + oz / ol * 0.9 - ox / ol * 0.8;
    const dw = Math.hypot(x - S.pos.x, z - S.pos.z);
    if (dw > 0.9) { if (!u.path || (u.repT -= dt) <= 0) { u.repT = 2; go(u, x, z, 30000); } if (follow(u, dw > 12 ? S.vr * 0.75 : S.vw * 1.1, cmd, dt)) u.path = null; return cmd; }
    if (!u.waitSaid && dP < 14) { u.waitSaid = true; u.say((BEN.wait), 2.6); }
    const a = w.yawOut + Math.sin(C.t * 0.5 + u.i) * 1.1; cmd.face = w.yawOut; S.lookAt = (S.lookAt || V()).set(S.pos.x + Math.sin(a) * 9, 1.5, S.pos.z + Math.cos(a) * 9);
    return cmd;
  }
  if (u.st === 'wait') { u.st = 'follow'; S.lookAt = null; u.path = null; }
  // ---- following: two to four metres behind you, a little to one side
  const py = P.s.yaw, sd = u.i % 2 ? 0.9 : -0.9, bx = P.s.pos.x - Math.sin(py) * 2.8 + Math.cos(py) * sd, bz = P.s.pos.z - Math.cos(py) * 2.8 - Math.sin(py) * sd;
  if (dP > 4.2 || (u.path && u.path.length && dP > 2.6)) {
    if (dP > 30 && !u.bubble && C.t > (u.hurryT || 0)) { u.hurryT = C.t + 15; u.say((BEN.hurry), 2); }
    const gx = W.walkable(bx, bz) ? bx : P.s.pos.x, gz = W.walkable(bx, bz) ? bz : P.s.pos.z;
    return chase(u, { s: { pos: V(gx, 0, gz) } }, dt, cmd, dP, dP > 60 ? run(u) : dP > 9 ? S.vr * 0.75 : Math.max(S.vw, Math.min(S.vw * 1.6, P.s.speed || S.vw)));
  }
  u.path = null;
  if (dP < 1.5) { cmd.move = Math.atan2(S.pos.x - P.s.pos.x, S.pos.z - P.s.pos.z); cmd.speed = S.vw * 0.6; }   // not in your way
  // standing by: eyes on the street round you
  const a = py + Math.sin(C.t * 0.4 + u.i) * 1.4;
  S.lookAt = (S.lookAt || V()).set(S.pos.x + Math.sin(a) * 9, 1.55, S.pos.z + Math.cos(a) * 9);
  cmd.face = Math.atan2(P.s.pos.x - S.pos.x, P.s.pos.z - S.pos.z) + (u.i % 2 ? 0.6 : -0.6);
  if (u.chatT <= 0) { u.chatT = rnd(30, 60); const hr = X.G.hour ?? 12, night = hr >= 19 || hr < 5; if (!u.bubble && P.alive) u.say(night && Math.random() < 0.3 ? BEN.talkNight[0] : BEN.talk[u.talkI++ % BEN.talk.length], 4); }
  return cmd;
}
// toward someone, by a route (re-planned as they move)
function chase(u, T, dt, cmd, d, speed) {
  const S = u.s, tx = T.s.pos.x, tz = T.s.pos.z;
  u.repT = (u.repT || 0) - dt;
  const end = u.path && u.path.length ? u.path[u.path.length - 1] : null;
  if (!end || u.repT <= 0 && Math.hypot(end[0] - tx, end[1] - tz) > 2.5) { u.repT = d > 40 ? 2.5 : 1.2; go(u, tx, tz, 40000); }
  S.lookAt = null;
  if (follow(u, speed, cmd, dt)) u.path = null;
  return cmd;
}

// a survivor's blow lands
function landBlow(u) {
  const z = u.target; if (!z || !z.alive) return;
  const Wp = MELEE[u.weapon] || MELEE.fists, S = u.s;
  const d = z.s.pos.distanceTo(S.pos); if (d > Wp.reach + 0.5) { X.SND.swing(0.3, S.pos); return; }
  const you = !!z.isPlayer, head = Math.random() < (you ? 0.15 : 0.35);
  const dir = V(z.s.pos.x - S.pos.x, 0, z.s.pos.z - S.pos.z).normalize();
  if (you && Math.abs(wrapPi(Math.atan2(dir.x, dir.z) - S.yaw)) > 1.1) { X.SND.swing(0.3, S.pos); return; }   // you stepped out of it
  X.SND.meleeHit(Wp.blade ? 'blade' : u.weapon === 'fists' ? 'fist' : 'blunt', V(z.s.pos.x, head ? 1.6 : 1.3, z.s.pos.z), head, you ? 0.9 : 1);
  // a person hitting you hits like a person: it hurts, it doesn't take your head off
  X.damage(z, you ? clamp(Wp.dmg * 0.28, 5, 12) * rnd(0.8, 1.2) * (head ? 1.6 : 1) : Wp.dmg * rnd(0.8, 1.15) * (head ? Wp.head : 1), u, { part: head ? 'head' : 'chest', knock: Wp.knock, dir, melee: true, human: you });
  if (you) { X.fx && X.fx.blood(V(z.s.pos.x, head ? 1.6 : 1.3, z.s.pos.z), dir, Wp.blade ? 0.8 : 0.4); if (Wp.blade && X.onPlayerCut) X.onPlayerCut(u); }
  X.noise(S.pos, 10);
}
// a tiny bit of glue so every person can talk and has a walking pace of their own
for (const u of PPL.list) sayOn(u);
export function wire() { for (const u of PPL.list) { sayOn(u); u.pace = pace; } }
export function bubbles() { return PPL.list.filter(u => u.bubble && u.active && !u.gone && u.s.visible); }
void lerp; void damp; void dressZombie;
