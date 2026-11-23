// Zombie_Apocalypse — battery camping lanterns. The model: a moulded base with a battery door, rubber feet and the
// dimmer dial, a frosted globe round a column of warm LEDs behind four guard ribs, a vented top cap and a wire bail
// handle. Its light is warm, shimmers a little, and flickers and browns out as the batteries go. You can carry one
// (it hangs from your pack strap at your side, swinging as you move) or set it down anywhere as a light.
// At night a lit lantern can be seen from a long way off — through a window too — and the dead come to it.
//
// API (main.js):
//   initLanterns({ scene, world, noise, SND, getP })    once, after the world is built
//   model(scale)            a fresh lantern Group (for the hands / an item icon); unlit
//   carry(on)               hang the lantern at your side, lit (false: put it away)       carrying() → bool
//   place(x, z, yaw)        set the carried one down here (lit). Returns it               lanterns → the ones set down
//   nearest(x, z, r)        a placed lantern within r (to pick up)                        pickUp(L) → its charge back
//   toggle(L)               switch a placed one on / off
//   charge() / setCharge(v) the carried lantern's batteries, 0..100;  recharge() fresh batteries (100)
//   update(dt, t)           every frame;  reset() a new game: no lanterns anywhere
import * as THREE from 'three';
import * as TX from './tex.js';

let E = null;
export const lanterns = [];            // set down: { g, x, y, z, yaw, on, charge, mat, halo, ph }
const spares = [];                    // the charge of each other lantern in your bag (so setting one down doesn't make a fresh one)
const held = { hidden: false, on: false, charge: 100, g: null, mat: null, halo: null, ph: 0, swing: 0, swingV: 0, lastYaw: 0, lastX: 0, lastZ: 0, noiseT: 0 };
const LIGHTS = [];
const DRAIN = 100 / (26 * 60);         // a set of batteries lasts about 26 minutes
const tv = new THREE.Vector3(), tv2 = new THREE.Vector3();

// ---------------------------------------------------------------- the model
let KIT = null;
function kit() {
  if (KIT) return KIT;
  const std = o => new THREE.MeshStandardMaterial(o);
  KIT = {
    body: std({ color: 0x2c3a2c, roughness: 0.55 }),
    rubber: std({ color: 0x151515, roughness: 0.9 }),
    metal: std({ color: 0x9a9c9e, roughness: 0.35, metalness: 0.9 }),
    dial: std({ color: 0xb8b0a0, roughness: 0.5 }),
    globe: std({ color: 0xf2ece0, roughness: 0.25, transparent: true, opacity: 0.82, emissive: 0xffc078, emissiveIntensity: 0 }),
    led: std({ color: 0xfff4e0, roughness: 0.3, emissive: 0xffd49a, emissiveIntensity: 0 }),
    halo: new THREE.SpriteMaterial({ map: TX.glowSprite('255,206,140'), color: 0xffc888, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    G: {
      base: (() => { const pts = [[0, 0], [0.066, 0], [0.072, 0.008], [0.074, 0.05], [0.07, 0.056], [0.062, 0.06], [0.06, 0.07], [0, 0.07]].map(([x, y]) => new THREE.Vector2(x, y)); return new THREE.LatheGeometry(pts, 28); })(),
      seam: new THREE.TorusGeometry(0.0735, 0.0012, 4, 32).rotateX(Math.PI / 2),
      foot: new THREE.CylinderGeometry(0.012, 0.013, 0.006, 10),
      dial: new THREE.CylinderGeometry(0.012, 0.012, 0.012, 14).rotateZ(Math.PI / 2),
      globe: new THREE.CylinderGeometry(0.052, 0.056, 0.12, 28, 1, true),
      led: new THREE.CylinderGeometry(0.014, 0.014, 0.1, 10),
      rib: new THREE.BoxGeometry(0.008, 0.124, 0.008),
      cap: (() => { const pts = [[0, 0], [0.06, 0], [0.066, 0.006], [0.064, 0.022], [0.04, 0.036], [0, 0.04]].map(([x, y]) => new THREE.Vector2(x, y)); return new THREE.LatheGeometry(pts, 28); })(),
      vent: new THREE.TorusGeometry(0.05, 0.002, 4, 28).rotateX(Math.PI / 2),
      bail: new THREE.TorusGeometry(0.066, 0.0028, 6, 24, Math.PI),
      lug: new THREE.CylinderGeometry(0.006, 0.006, 0.01, 8).rotateZ(Math.PI / 2),
    },
  };
  return KIT;
}
// the lantern, standing on y = 0, 0.27 m to the top of the handle. lit: its own materials so it can glow on its own
export function model(scale = 1, lit = false) {
  const K = kit(), G = K.G, g = new THREE.Group();
  const globeM = lit ? K.globe.clone() : K.globe, ledM = lit ? K.led.clone() : K.led;
  const add = (geo, mat, x = 0, y = 0, z = 0, ry = 0, sh = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = sh; m.receiveShadow = true; g.add(m); return m; };
  add(G.base, K.body); add(G.seam, K.rubber, 0, 0.03, 0, 0, false);
  for (let k = 0; k < 4; k++) { const a = k / 4 * 6.28 + 0.785; add(G.foot, K.rubber, Math.sin(a) * 0.05, 0.003, Math.cos(a) * 0.05, 0, false); }
  add(G.dial, K.dial, 0.075, 0.035, 0, 0, false);
  const globe = add(G.globe, globeM, 0, 0.13, 0, 0, false); globe.renderOrder = 2;
  add(G.led, ledM, 0, 0.13, 0, 0, false);
  for (let k = 0; k < 4; k++) { const a = k / 4 * 6.28; add(G.rib, K.body, Math.sin(a) * 0.058, 0.132, Math.cos(a) * 0.058, a); }
  add(G.cap, K.body, 0, 0.19, 0); add(G.vent, K.rubber, 0, 0.205, 0, 0, false);
  const bail = new THREE.Group(); bail.position.set(0, 0.215, 0); g.add(bail);
  const b = new THREE.Mesh(G.bail, K.metal); b.castShadow = true; bail.add(b);
  for (const sx of [-1, 1]) add(G.lug, K.metal, sx * 0.064, 0.215, 0, 0, false);
  bail.rotation.x = 0.0;
  g.scale.setScalar(scale);
  g.userData = { globeM, ledM, bail };
  return g;
}

// ---------------------------------------------------------------- setup
export function initLanterns(env) {
  E = env;
  // three warm lights, made now and kept in the scene (dark when unused) so no shader ever recompiles for them
  // the first (always the carried one, or the nearest) casts cheap shadows, so its light stops at walls and floors
  if (!LIGHTS.length) for (let i = 0; i < 3; i++) {
    const l = new THREE.PointLight(0xffc88a, 0, i === 0 ? 11 : 7, 2); l.castShadow = i === 0;
    if (i === 0) { l.shadow.mapSize.set(256, 256); l.shadow.bias = -0.002; l.shadow.camera.near = 0.1; l.shadow.camera.far = 11; l.shadow.autoUpdate = false; }
    E.scene.add(l); LIGHTS.push(l);
  }
}
function makeLit(hang = false) {
  const g = model(1, true), halo = new THREE.Sprite(kit().halo.clone()); halo.position.y = 0.13; halo.scale.setScalar(0.34); halo.renderOrder = 6; g.add(halo);
  if (!hang) return { g, mat: g.userData, halo };
  // carried: it hangs from its handle, so the pivot is the top of the bail and the body swings below it
  const pivot = new THREE.Group(); g.position.y = -0.25; pivot.add(g); g.userData.bail.rotation.x = 0;
  return { g: pivot, mat: g.userData, halo };
}
// how bright, now: a gentle shimmer; as the batteries go it dims, browns toward orange and stutters
function level(L, t) {
  if (!L.on || L.charge <= 0) return 0;
  const c = L.charge, low = c < 18 ? c / 18 : 1;
  let k = 0.35 + 0.65 * Math.min(1, c / 40);
  k *= 1 + Math.sin(t * 9.3 + L.ph) * 0.015 + Math.sin(t * 23.1 + L.ph * 2) * 0.01;
  if (low < 1 && Math.sin(t * 13 + L.ph) + Math.sin(t * 5.7) > 1.4 - (1 - low) * 1.2) k *= 0.25 + Math.random() * 0.4;
  return k;
}
function look(L, k) {
  const m = L.mat; m.globeM.emissiveIntensity = k * 2.2; m.ledM.emissiveIntensity = k * 4;
  const warm = L.charge < 25 ? L.charge / 25 : 1;
  m.globeM.emissive.setRGB(1, 0.62 + 0.14 * warm, 0.3 + 0.17 * warm);
  L.halo.material.opacity = Math.min(0.5, k * 0.35) * (0.5 + 0.5 * (E && E.world ? E.world.night || 0 : 1));
  L.halo.visible = k > 0.01;
}

// ---------------------------------------------------------------- carrying one
export function carry(on) {
  if (!E) return false;
  held.on = !!on;
  if (held.on && !held.g) { const H = makeLit(true); Object.assign(held, H); held.ph = Math.random() * 10; E.scene.add(held.g); }
  if (held.g) held.g.visible = held.on;
  if (E.SND && E.SND.flashlight) E.SND.flashlight(held.on);
  return held.on;
}
export const carrying = () => held.on;
export const charge = () => held.charge;
export function setCharge(v) { held.charge = Math.max(0, Math.min(100, v)); }
export function recharge() { held.charge = 100; }
// hide the carried one (driving, a cutscene, the title screen, aboard the rescue): main.js sets it every frame
export function setHidden(h) { held.hidden = !!h; }
// another lantern went into your bag (loot): its batteries, for when you set the carried one down
export function addSpare(c = 100) { spares.push(Math.max(0, Math.min(100, c))); }

// ---------------------------------------------------------------- setting one down, picking it up
export function place(x, z, yaw = 0) {
  if (!E) return null;
  const y = E.world && E.world.groundY ? E.world.groundY(x, z, (E.getP && E.getP() && E.getP().s.pos.gy) || 0, false) : 0;
  const H = makeLit(), L = { ...H, x, y, z, yaw, on: true, charge: held.charge, ph: Math.random() * 10 };
  L.g.position.set(x, y, z); L.g.rotation.y = yaw; L.mat.bail.rotation.x = 1.35;   // the handle laid down
  E.scene.add(L.g); lanterns.push(L);
  carry(false); held.charge = spares.length ? spares.pop() : 100;
  if (E.SND && E.SND.impact) E.SND.impact(tv.set(x, y + 0.1, z), 'plastic', 0.4);
  return L;
}
export function nearest(x, z, r = 1.4) { let best = null, bd = r; for (const L of lanterns) { const d = Math.hypot(L.x - x, L.z - z); if (d < bd) { bd = d; best = L; } } return best; }
export function pickUp(L) {
  const i = lanterns.indexOf(L); if (i < 0) return null;
  lanterns.splice(i, 1); E.scene.remove(L.g); dispose(L);
  if (held.on || spares.length) spares.push(held.charge);
  held.charge = L.charge;
  return L.charge;
}
export function toggle(L) { L.on = !L.on; if (E.SND && E.SND.flashlight) E.SND.flashlight(L.on); return L.on; }
function dispose(L) { L.mat.globeM.dispose(); L.mat.ledM.dispose(); L.halo.material.dispose(); }
export function reset() {
  for (const L of lanterns) { E.scene.remove(L.g); dispose(L); }
  lanterns.length = 0; spares.length = 0; held.on = false; held.hidden = false; held.charge = 100; if (held.g) held.g.visible = false;
  for (const l of LIGHTS) l.intensity = 0;
}

// ---------------------------------------------------------------- every frame
const lit = [];
export function update(dt, t) {
  if (!E) return;
  const W = E.world, night = W ? W.night || 0 : 0, day = W ? W.daylight ?? (1 - night) : 0;
  const P = E.getP ? E.getP() : null;
  // the carried one: at your left hip, hanging from the strap, swinging as you walk and turn
  const show = held.on && !!held.g && !held.hidden && !!P && !!P.s && P.alive !== false && P.s.visible !== false;
  if (held.g && !show) held.g.visible = false;
  if (show) {
    const s = P.s, yaw = s.yaw ?? 0, hips = s.B && s.B.Hips;
    if (hips) hips.getWorldPosition(tv); else tv.set(s.pos.x, (s.pos.gy || 0) + 0.95, s.pos.z);
    const lx = Math.cos(yaw), lz = -Math.sin(yaw), fx = Math.sin(yaw), fz = Math.cos(yaw);
    const x = tv.x + lx * 0.24 - fx * 0.06, z = tv.z + lz * 0.24 - fz * 0.06, y = tv.y - 0.05;   // the handle, on the strap at your hip
    // the swing: a pendulum pushed by how you accelerate (forward and round)
    const vx = (x - held.lastX) / Math.max(dt, 1e-3), vz = (z - held.lastZ) / Math.max(dt, 1e-3), fwdV = vx * fx + vz * fz;
    const acc = (fwdV - (held.fwdV || 0)) / Math.max(dt, 1e-3); held.fwdV = fwdV;
    const big = Math.hypot(x - held.lastX, z - held.lastZ) > 1;   // a teleport (a new game, getting out of a car)
    held.lastX = x; held.lastZ = z;
    if (!big) { held.swingV += (-held.swing * 30 - held.swingV * 3.2 - Math.max(-20, Math.min(20, acc)) * 0.05) * dt; held.swing += held.swingV * dt; held.swing = Math.max(-0.6, Math.min(0.6, held.swing)); }
    const bob = Math.sin(t * 7.5) * 0.04 * Math.min(1, Math.abs(fwdV) / 3);
    held.g.position.set(x, y, z); held.g.rotation.set(held.swing + bob, yaw, bob * 0.5, 'YXZ');
    held.g.visible = true;
  }
  if (held.on) held.charge = Math.max(0, held.charge - DRAIN * dt);
  for (const L of lanterns) if (L.on && L.charge > 0) L.charge = Math.max(0, L.charge - DRAIN * dt);
  // the lights: to the carried lantern first, then the placed ones nearest you
  lit.length = 0;
  const fp = P && P.s ? P.s.pos : tv2.set(0, 0, 0);
  if (show) { held.k = level(held, t); look(held, held.k); if (held.k > 0) lit.push(held); } else held.k = 0;
  const near = [];
  for (const L of lanterns) { L.k = level(L, t); look(L, L.k); if (L.k > 0) { L.d = Math.hypot(L.x - fp.x, L.z - fp.z); near.push(L); } }
  near.sort((a, b) => a.d - b.d);
  for (const L of near) { if (lit.length >= LIGHTS.length) break; if (L.d < 70) lit.push(L); }
  const bright = 1 - 0.85 * Math.min(1, day);   // in daylight a lantern hardly lights anything
  // a lantern in a house you're not in: its light is mostly kept in by the walls (only what spills out the windows)
  const hAt = W && W.houseAt, myHouse = hAt && P && P.s ? hAt(fp.x, fp.z, fp.y) || null : null;
  for (let i = 0; i < LIGHTS.length; i++) {
    const l = LIGHTS[i], L = lit[i];
    if (!L) { l.intensity = 0; if (l.castShadow) l.shadow.autoUpdate = false; continue; }
    L.g.updateMatrixWorld(true); l.position.set(0, L === held ? -0.1 : 0.2, 0).applyMatrix4(L.g.matrixWorld);
    let shut = 1;
    if (L !== held && hAt) { if (L.house === undefined) L.house = hAt(L.x, L.z, L.y + 0.2) || null; if (L.house && L.house !== myHouse) shut = 0.15; }
    l.intensity = (L === held ? 4.5 : 2.4) * L.k * bright * shut;
    if (l.castShadow) l.shadow.autoUpdate = l.intensity > 0.01;
    const warm = L.charge < 25 ? L.charge / 25 : 1; l.color.setRGB(1, 0.72 + 0.1 * warm, 0.45 + 0.1 * warm);
  }
  // seen from far off at night: every couple of seconds the dead nearby notice it (indoors: through the windows)
  held.noiseT -= dt;
  if (held.noiseT <= 0 && E.noise) {
    held.noiseT = 2.2;
    if (night > 0.35) for (const L of [show ? held : null, ...lanterns]) {
      if (!L || !(L.k > 0.05)) continue;
      const pos = L === held ? held.g.position : tv.set(L.x, L.y + 0.2, L.z);
      const inside = W && W.houseAt ? !!W.houseAt(pos.x, pos.z, pos.y) : false;
      E.noise(pos.clone ? pos.clone() : pos, (inside ? 16 : 22) * Math.min(1, night) * L.k);
    }
  }
}
