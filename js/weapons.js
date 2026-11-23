// human-WAR — the weapons: what they do, what they look like, and how a soldier holds, fires and reloads them.
// Every gun is modelled from parts (receiver, barrel, stock, magazine, sights...) with its origin at the pistol
// grip, +Z out of the muzzle, +Y up, +X to the gun's left. A soldier's Arms put the gun where it belongs
// (shouldered, low ready, sprinting, reloading, recoiling) and the two hands are solved onto its grips.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { clamp, lerp, smooth, damp } from './soldier.js';
import { C } from './state.js';

export const WEAPONS = {
  pistol: { id: 'pistol', name: '9MM PISTOL', key: 3, hold: 'pistol', dmg: 34, rpm: 380, auto: false, mag: 15, reserve: 0, reload: 1.7, hip: 0.03, aim: 0.008, recoil: 0.055, range: 50, snd: 'pistol', ammo: 'ammo9', loud: 70 },
  shotgun: { id: 'shotgun', name: 'PUMP SHOTGUN', key: 4, hold: 'rifle', dmg: 16, pellets: 9, rpm: 70, auto: false, mag: 6, reserve: 0, reload: 0.6, shellReload: true, hip: 0.06, aim: 0.045, recoil: 0.1, range: 30, snd: 'shotgun', pump: 0.6, ammo: 'shells', loud: 95 },
  sniper: { id: 'sniper', name: 'HUNTING RIFLE', key: 5, hold: 'rifle', dmg: 120, rpm: 50, auto: false, mag: 5, reserve: 0, reload: 3.0, hip: 0.07, aim: 0.0008, recoil: 0.11, range: 300, snd: 'sniper', bolt: 0.9, scope: 4, ammo: 'rifleAmmo', loud: 110 },
  bottle: { id: 'bottle', name: 'GLASS BOTTLE', hold: 'throw', mag: 1, reserve: 0, throwable: true, item: 'bottle' },
  molotov: { id: 'molotov', name: 'MOLOTOV', hold: 'throw', dmg: 0, mag: 1, reserve: 0, throwable: true, item: 'molotov' },
};
export const SLOTS = ['pistol', 'shotgun', 'sniper'];

// ---------------------------------------------------------------- materials
let M = null;
function mats() {
  if (M) return M;
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  // walnut grain for wooden furniture
  g.fillStyle = '#5a3218'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 70; i++) { g.strokeStyle = `rgba(${30 + Math.random() * 40},${14 + Math.random() * 16},6,${0.25 + Math.random() * 0.35})`; g.lineWidth = 0.6 + Math.random() * 2; g.beginPath(); let y = Math.random() * 256; g.moveTo(0, y); for (let x = 0; x <= 256; x += 16) { y += (Math.random() - 0.5) * 4; g.lineTo(x, y); } g.stroke(); }
  const wood = new THREE.CanvasTexture(c); wood.colorSpace = THREE.SRGBColorSpace; wood.wrapS = wood.wrapT = THREE.RepeatWrapping;
  const c2 = document.createElement('canvas'); c2.width = c2.height = 128; const g2 = c2.getContext('2d');
  g2.fillStyle = '#808080'; g2.fillRect(0, 0, 128, 128);
  const d = g2.getImageData(0, 0, 128, 128); for (let i = 0; i < d.data.length; i += 4) { const n = 128 + (Math.random() - 0.5) * 70; d.data[i] = d.data[i + 1] = d.data[i + 2] = n; } g2.putImageData(d, 0, 0);
  const grain = new THREE.CanvasTexture(c2); grain.wrapS = grain.wrapT = THREE.RepeatWrapping; grain.repeat.set(4, 4);
  M = {
    steel: new THREE.MeshStandardMaterial({ color: 0x23252a, roughness: 0.38, metalness: 0.85, roughnessMap: grain }),
    blued: new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.3, metalness: 0.9 }),
    poly: new THREE.MeshStandardMaterial({ color: 0x1a1b1d, roughness: 0.72, metalness: 0.05, roughnessMap: grain }),
    tan: new THREE.MeshStandardMaterial({ color: 0x7a6a4c, roughness: 0.75, metalness: 0.02, roughnessMap: grain }),
    olive: new THREE.MeshStandardMaterial({ color: 0x3b4230, roughness: 0.6, metalness: 0.15 }),
    wood: new THREE.MeshStandardMaterial({ map: wood, roughness: 0.55, metalness: 0 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x0a1820, roughness: 0.05, metalness: 0.6, emissive: 0x0a2030, emissiveIntensity: 0.4 }),
    red: new THREE.MeshBasicMaterial({ color: 0xff2a1a }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc8a050, roughness: 0.3, metalness: 1 }),
    green: new THREE.MeshStandardMaterial({ color: 0x3e4a2e, roughness: 0.55, metalness: 0.2 }),
    warhead: new THREE.MeshStandardMaterial({ color: 0x4d5536, roughness: 0.45, metalness: 0.5 }),
    pin: new THREE.MeshStandardMaterial({ color: 0xb9bcc2, roughness: 0.25, metalness: 1 }),
  };
  return M;
}
const box = (w, h, d, m, x, y, z, r = 0.004) => { const o = new THREE.Mesh(r > 0 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.1, h / 2.1, d / 2.1)) : new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); return o; };
const cyl = (r1, r2, l, m, x, y, z, seg = 14) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, l, seg).rotateX(Math.PI / 2), m); o.position.set(x, y, z); return o; };

// ---------------------------------------------------------------- models
function buildModel(id) {
  const K = mats(), g = new THREE.Group(), d = { muzzle: new THREE.Vector3(), eject: new THREE.Vector3(), stock: 0.3, grips: {} };
  const add = (...o) => { for (const x of o) g.add(x); return o[0]; };
  if (id === 'rifle' || id === 'lmg') {
    const lmg = id === 'lmg';
    add(box(0.04, 0.06, 0.3, K.steel, 0, 0.055, 0.05));                          // upper receiver
    add(box(0.036, 0.045, 0.22, K.steel, 0, 0.02, 0.0));                         // lower receiver
    add(box(0.026, 0.1, 0.035, K.poly, 0, -0.035, -0.012)).rotation.x = 0.28;    // pistol grip
    add(box(0.008, 0.03, 0.05, K.steel, 0, 0.0, 0.03));                          // trigger guard
    add(box(0.05, 0.055, lmg ? 0.32 : 0.26, K.poly, 0, 0.055, lmg ? 0.36 : 0.33)); // handguard
    for (let i = 0; i < 6; i++) add(box(0.052, 0.006, 0.012, K.blued, 0, 0.084, 0.22 + i * 0.04, 0));   // top rail teeth
    add(cyl(0.009, 0.009, lmg ? 0.3 : 0.22, K.blued, 0, 0.058, lmg ? 0.6 : 0.55));
    add(cyl(0.013, 0.012, 0.05, K.blued, 0, 0.058, lmg ? 0.77 : 0.68));            // flash hider
    add(box(0.03, 0.05, 0.22, K.poly, 0, 0.04, -0.2)).rotation.x = -0.05;        // stock
    add(box(0.034, 0.09, 0.03, K.poly, 0, 0.025, -0.31));                        // butt pad
    add(cyl(0.012, 0.012, 0.12, K.blued, 0, 0.065, -0.1));                       // buffer tube
    if (!lmg) {
      const mag = add(box(0.024, 0.13, 0.06, K.steel, 0, -0.06, 0.1)); mag.rotation.x = 0.18; d.magMesh = mag; d.magLocal = new THREE.Vector3(0, -0.08, 0.1);
      add(box(0.026, 0.035, 0.06, K.poly, 0, 0.1, 0.06));                         // red dot base
      add(cyl(0.017, 0.017, 0.05, K.poly, 0, 0.12, 0.06, 16));
      const dot = add(new THREE.Mesh(new THREE.CircleGeometry(0.003, 8), K.red)); dot.position.set(0, 0.12, 0.034); dot.rotation.y = Math.PI;
      add(box(0.02, 0.03, 0.012, K.blued, 0, 0.1, 0.48, 0.002));                 // front sight
    } else {
      const mag = add(box(0.08, 0.1, 0.11, K.olive, -0.03, -0.035, 0.12, 0.012)); d.magMesh = mag; d.magLocal = new THREE.Vector3(-0.03, -0.05, 0.12);
      add(box(0.03, 0.03, 0.1, K.blued, 0, 0.1, 0.07));                           // feed cover
      add(box(0.02, 0.06, 0.012, K.steel, 0, 0.11, 0.25, 0.003));                 // carry handle
      for (const s of [-1, 1]) { const leg = add(box(0.008, 0.008, 0.2, K.steel, s * 0.012, 0.03, 0.62, 0)); leg.rotation.x = 0.1; }   // folded bipod
    }
    d.muzzle.set(0, 0.058, lmg ? 0.8 : 0.71); d.eject.set(-0.025, 0.06, 0.06); d.stock = 0.32;
    d.grips.L = new THREE.Vector3(0, 0.02, lmg ? 0.33 : 0.3);
    d.chargeLocal = new THREE.Vector3(0, 0.085, -0.06);
  } else if (id === 'ak') {
    add(box(0.042, 0.065, 0.3, K.steel, 0, 0.04, 0.04));
    add(box(0.03, 0.1, 0.04, K.wood, 0, -0.035, -0.01)).rotation.x = 0.3;
    add(box(0.008, 0.03, 0.05, K.steel, 0, -0.01, 0.03));
    add(box(0.05, 0.05, 0.2, K.wood, 0, 0.04, 0.3));                            // lower handguard
    add(box(0.04, 0.03, 0.16, K.wood, 0, 0.085, 0.28));                         // upper handguard
    add(cyl(0.009, 0.009, 0.3, K.blued, 0, 0.05, 0.52));
    add(cyl(0.012, 0.012, 0.04, K.blued, 0, 0.05, 0.68));
    add(box(0.008, 0.035, 0.01, K.steel, 0, 0.085, 0.64, 0.002));
    add(box(0.035, 0.06, 0.26, K.wood, 0, 0.0, -0.2)).rotation.x = 0.14;        // wooden stock
    add(box(0.038, 0.11, 0.025, K.poly, 0, -0.03, -0.33));
    const mag = add(box(0.026, 0.15, 0.06, K.steel, 0, -0.07, 0.11)); mag.rotation.x = 0.42; d.magMesh = mag; d.magLocal = new THREE.Vector3(0, -0.09, 0.13);
    add(box(0.02, 0.012, 0.06, K.steel, 0, 0.08, 0.12, 0.002));                 // rear sight
    d.muzzle.set(0, 0.05, 0.71); d.eject.set(-0.025, 0.05, 0.06); d.stock = 0.33;
    d.grips.L = new THREE.Vector3(0, 0.01, 0.3);
    d.chargeLocal = new THREE.Vector3(-0.03, 0.06, 0.12);
  } else if (id === 'shotgun') {
    add(box(0.04, 0.06, 0.24, K.steel, 0, 0.04, 0.03));
    add(box(0.03, 0.1, 0.04, K.poly, 0, -0.035, -0.012)).rotation.x = 0.3;
    add(box(0.008, 0.03, 0.05, K.steel, 0, -0.01, 0.03));
    add(cyl(0.011, 0.011, 0.55, K.blued, 0, 0.065, 0.42));                       // barrel
    add(cyl(0.01, 0.01, 0.45, K.blued, 0, 0.035, 0.37));                         // magazine tube
    const pump = add(box(0.05, 0.045, 0.15, K.poly, 0, 0.035, 0.34)); d.pumpMesh = pump; d.pumpZ = 0.34;
    for (let i = 0; i < 7; i++) add(box(0.052, 0.004, 0.008, K.steel, 0, 0.058, 0.28 + i * 0.02, 0)).userData.pump = true;
    add(box(0.035, 0.055, 0.25, K.poly, 0, 0.03, -0.2)).rotation.x = 0.1;
    add(box(0.038, 0.1, 0.03, K.poly, 0, 0.0, -0.32));
    add(new THREE.Mesh(new THREE.SphereGeometry(0.004, 8, 6), K.brass)).position.set(0, 0.08, 0.69);
    d.muzzle.set(0, 0.065, 0.7); d.eject.set(-0.025, 0.05, 0.05); d.stock = 0.33;
    d.grips.L = new THREE.Vector3(0, 0.01, 0.34);
    d.portLocal = new THREE.Vector3(0, 0.0, 0.08);
  } else if (id === 'sniper') {
    add(box(0.04, 0.055, 0.28, K.steel, 0, 0.05, 0.05));
    add(box(0.06, 0.07, 0.5, K.green, 0, 0.02, 0.2, 0.012));                     // stock body / forend
    add(box(0.04, 0.1, 0.05, K.green, 0, -0.03, -0.01)).rotation.x = 0.35;
    add(box(0.05, 0.08, 0.3, K.green, 0, 0.02, -0.2, 0.012)).rotation.x = 0.04;
    add(box(0.052, 0.13, 0.03, K.poly, 0, 0.0, -0.36));
    add(box(0.03, 0.03, 0.12, K.green, 0, 0.075, -0.17));                        // cheek rest
    add(cyl(0.011, 0.01, 0.55, K.blued, 0, 0.055, 0.68));
    add(cyl(0.017, 0.017, 0.08, K.blued, 0, 0.055, 0.98));                       // suppressor/brake
    add(cyl(0.022, 0.022, 0.28, K.poly, 0, 0.12, 0.07, 18));                     // scope
    add(cyl(0.027, 0.022, 0.06, K.poly, 0, 0.12, 0.24, 18)); add(cyl(0.024, 0.022, 0.05, K.poly, 0, 0.12, -0.09, 18));
    const lens = add(new THREE.Mesh(new THREE.CircleGeometry(0.025, 18), K.glass)); lens.position.set(0, 0.12, 0.271);
    add(box(0.014, 0.03, 0.03, K.blued, 0, 0.09, 0.0)); add(box(0.014, 0.03, 0.03, K.blued, 0, 0.09, 0.14));
    const bolt = add(new THREE.Group()); bolt.position.set(-0.03, 0.06, -0.02); d.boltMesh = bolt;
    bolt.add(cyl(0.004, 0.004, 0.05, K.steel, 0, 0, 0).rotateY(Math.PI / 2)); bolt.children[0].position.x = -0.02;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), K.blued); knob.position.set(-0.045, -0.01, 0); bolt.add(knob);
    const mag = add(box(0.03, 0.06, 0.07, K.blued, 0, -0.02, 0.1)); d.magMesh = mag; d.magLocal = new THREE.Vector3(0, -0.04, 0.1);
    d.muzzle.set(0, 0.055, 1.02); d.eject.set(-0.025, 0.06, 0.04); d.stock = 0.37;
    d.grips.L = new THREE.Vector3(0, 0.0, 0.3);
    d.boltLocal = new THREE.Vector3(-0.075, 0.05, -0.02);
    d.chargeLocal = d.boltLocal.clone();   // after a fresh magazine the hand works the bolt to chamber a round
  } else if (id === 'pistol') {
    d.slideMesh = add(box(0.028, 0.032, 0.19, K.steel, 0, 0.055, 0.06, 0.004)); d.slideZ = 0.06;   // slide (cycles on each shot, locks back empty)
    for (let i = 0; i < 6; i++) d.slideMesh.add(box(0.03, 0.026, 0.004, K.blued, 0, -0.001, -0.075 + i * 0.008, 0));   // rear serrations ride with it
    add(box(0.026, 0.03, 0.16, K.poly, 0, 0.028, 0.05));                         // frame
    add(box(0.028, 0.105, 0.045, K.poly, 0, -0.02, -0.005)).rotation.x = 0.22;   // grip
    add(box(0.006, 0.025, 0.04, K.poly, 0, 0.005, 0.045));
    add(cyl(0.006, 0.006, 0.02, K.blued, 0, 0.055, 0.16));
    add(box(0.006, 0.008, 0.006, K.blued, 0, 0.074, 0.14, 0)); add(box(0.016, 0.008, 0.006, K.blued, 0, 0.074, -0.02, 0));
    const mag = add(box(0.022, 0.03, 0.035, K.steel, 0, -0.075, -0.015, 0.002)); d.magMesh = mag; d.magLocal = new THREE.Vector3(0, -0.08, -0.015);
    d.muzzle.set(0, 0.055, 0.17); d.eject.set(-0.016, 0.065, 0.06); d.stock = 0;
    d.grips.L = new THREE.Vector3(0.022, -0.022, -0.005);
    d.chargeLocal = new THREE.Vector3(0, 0.06, -0.02);
  } else if (id === 'rpg') {
    add(cyl(0.024, 0.024, 0.95, K.green, 0, 0.1, -0.08, 16));                    // launch tube
    add(cyl(0.034, 0.03, 0.22, K.wood, 0, 0.1, -0.02, 16));                      // heat shield
    add(cyl(0.034, 0.024, 0.2, K.steel, 0, 0.1, -0.58, 16));                     // venturi
    add(box(0.028, 0.1, 0.04, K.poly, 0, 0.03, 0.0)).rotation.x = 0.25;          // trigger grip
    add(box(0.025, 0.09, 0.035, K.poly, 0, 0.04, 0.25)).rotation.x = 0.2;        // front grip
    add(box(0.022, 0.05, 0.06, K.poly, 0.035, 0.14, 0.12));                      // optic
    const rk = add(new THREE.Group()); rk.position.set(0, 0.1, 0.4); d.rocketMesh = rk;
    rk.add(cyl(0.02, 0.02, 0.1, K.warhead, 0, 0, 0.0)); rk.add(cyl(0.043, 0.02, 0.06, K.warhead, 0, 0, 0.08)); rk.add(cyl(0.043, 0.043, 0.07, K.warhead, 0, 0, 0.145));
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.043, 0.16, 16).rotateX(Math.PI / 2), K.warhead); cone.position.z = 0.26; rk.add(cone);
    d.muzzle.set(0, 0.1, 0.4); d.back = new THREE.Vector3(0, 0.1, -0.7); d.stock = 0.2;
    d.grips.L = new THREE.Vector3(0, 0.03, 0.25); d.frontGrip = true;
  } else if (id === 'bottle' || id === 'molotov') {
    // a real glass bottle: lathe-turned body with a rounded heel, sloping shoulder and lipped neck (centre stays at y=0)
    const prof = [[0, 0], [0.03, 0], [0.034, 0.004], [0.036, 0.014], [0.036, 0.15], [0.03, 0.175], [0.018, 0.2], [0.014, 0.225], [0.013, 0.252], [0.0155, 0.256], [0.0155, 0.264], [0.011, 0.265], [0.011, 0.25]]
      .map(([x, y]) => new THREE.Vector2(x, y - 0.11));
    const glassM = new THREE.MeshPhysicalMaterial({ color: id === 'molotov' ? 0x9a7a4a : 0x2f6a34, roughness: 0.05, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
    add(new THREE.Mesh(new THREE.LatheGeometry(prof, 16), glassM));
    if (id === 'molotov') {
      // the fuel inside, about 60% full, and a stuffed, twisted rag hanging out of the neck
      const fuel = add(new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.029, 0], [0.033, 0.004], [0.0335, 0.013], [0.0335, 0.095], [0, 0.095]].map(([x, y]) => new THREE.Vector2(x, y - 0.108)), 16),
        new THREE.MeshStandardMaterial({ color: 0xb07a20, roughness: 0.15, transparent: true, opacity: 0.7, depthWrite: false })));
      fuel.renderOrder = -1; d.fuel = fuel;
      const curve = new THREE.CatmullRomCurve3([[0, -0.07, 0], [0, 0, 0], [0.004, 0.025, 0.002], [0.02, 0.04, 0.006], [0.036, 0.02, 0.01], [0.042, -0.015, 0.008]].map(([x, y, z]) => new THREE.Vector3(x, y, z)));
      const rag = add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.009, 8, false), new THREE.MeshStandardMaterial({ color: 0xd8c8a8, roughness: 1, side: THREE.DoubleSide })));
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), rag.material); knot.scale.set(1, 0.8, 1); knot.position.set(0.003, 0.02, 0.001); rag.add(knot); rag.position.y = 0.15;
      d.rag = rag;
    }
    d.ring = new THREE.Object3D(); d.spoon = new THREE.Object3D(); g.add(d.ring, d.spoon);   // (grenade code expects them)
  } else if (id === 'grenade') {
    const body = add(new THREE.Mesh(new THREE.SphereGeometry(0.033, 16, 12), K.green)); body.scale.set(1, 1.15, 1);
    add(cyl(0.012, 0.012, 0.02, K.steel, 0, 0.042, 0).rotateX(Math.PI / 2)); g.children[1].position.set(0, 0.042, 0);
    const spoon = add(box(0.012, 0.06, 0.006, K.steel, 0.0, 0.025, 0.03, 0.002)); spoon.rotation.x = -0.15;
    const ring = add(new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0022, 6, 14), K.pin)); ring.position.set(-0.02, 0.05, 0); ring.rotation.y = Math.PI / 2;
    d.ring = ring; d.spoon = spoon;
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  return { g, d };
}
const CACHE = {};
export function makeWeaponMesh(id) {
  if (!CACHE[id]) CACHE[id] = buildModel(id);
  const src = CACHE[id];
  const g = src.g.clone(true);
  const d = { ...src.d };
  // re-find the moving parts in the clone (same child order)
  const find = m => m ? g.children[src.g.children.indexOf(m)] : null;
  d.magMesh = find(src.d.magMesh); d.pumpMesh = find(src.d.pumpMesh); d.boltMesh = find(src.d.boltMesh); d.rocketMesh = find(src.d.rocketMesh); d.ring = find(src.d.ring); d.spoon = find(src.d.spoon); d.rag = find(src.d.rag); d.slideMesh = find(src.d.slideMesh); d.fuel = find(src.d.fuel);
  d.pumpParts = g.children.filter(c => c.userData.pump);
  if (d.magMesh) d.magHome = d.magMesh.position.clone();
  g.userData = d;
  return g;
}

// ---------------------------------------------------------------- holding, firing, reloading
const F = new THREE.Vector3(), U = new THREE.Vector3(), R = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), tmp3 = new THREE.Vector3();
const mB = new THREE.Matrix4(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qc = new THREE.Quaternion(), pA = new THREE.Vector3(), pB = new THREE.Vector3();
function basis(yaw, pitch, roll, q) {
  F.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  U.set(-Math.sin(yaw) * Math.sin(pitch), Math.cos(pitch), -Math.cos(yaw) * Math.sin(pitch));
  const X = tmp3.crossVectors(U, F);   // gun's left
  if (roll) { X.applyAxisAngle(F, roll); U.applyAxisAngle(F, roll); }
  mB.makeBasis(X, U, F); q.setFromRotationMatrix(mB);
  R.copy(X).negate();
}
const lv = new THREE.Vector3();
const toW = (g, v, out) => out.copy(v).applyQuaternion(g.quaternion).add(g.position);
const dirW = (g, x, y, z, out) => out.set(x, y, z).applyQuaternion(g.quaternion);
const CHAR = new THREE.Color(0x2a1d12);
// timing of the moving parts, matched to the clicks audio.js mech() plays: the pump ('pump': slide back 0–0.08 s,
// forward 0.16–0.23 s after its sound starts) and the bolt ('bolt' fired at 0.15 s: lift, draw back to 0.35 s,
// drive home and lock by 0.47 s)
const PUMP = { back: 0.07 }, BOLT = { back: 0.33 };
const pumpTravel = t => smooth(-0.02, 0.085, t) * (1 - smooth(0.15, 0.235, t));
const boltTravel = t => smooth(0.18, 0.34, t) * (1 - smooth(0.37, 0.46, t));
const boltLiftK = t => smooth(0.13, 0.19, t) * (1 - smooth(0.44, 0.49, t));

export class Arms {
  constructor(sol, scene, loadout, opts = {}) {
    this.sol = sol; this.scene = scene;
    this.guns = {}; this.ammo = {};
    this.infinite = !!opts.infinite;
    for (const id of loadout) this.give(id);
    this.cur = loadout.find(i => i !== 'grenade') || loadout[0];
    this.recoil = 0; this.recoilV = 0; this.kickYaw = 0;
    this.cool = 0; this.reloadT = -1; this.reloadDur = 0; this.cycleT = -1; this.switchT = 0;
    this.throwT = -1; this.cookT = 0; this.trigger = false; this.prevTrigger = false; this.burst = 0;
    this.events = opts.onEvent || (() => {});
    this.throwId = 'bottle'; this.throwMeshes = {};
    for (const t of ['bottle', 'molotov']) { const m = makeWeaponMesh(t); m.visible = false; scene.add(m); this.throwMeshes[t] = m; }
    const rag = this.throwMeshes.molotov.userData.rag; if (rag) { rag.material = rag.material.clone(); rag.traverse(o => { if (o.isMesh) o.material = rag.material; }); this.ragCol = rag.material.color.clone(); }
    this.drops = [];   // spent magazines falling out of the gun
    this.grenadeMesh = this.throwMeshes.bottle;
    this.countThrow = opts.countThrow || (() => 1);
    this.aimW = 0; this.sprintW = 0;
    this.relW = 0; this.slideT = -1; this.heat = 0;
    this.busy = { 1: false, '-1': false };   // main.js sets busy[-1] while the left hand eats, opens a door, picks up
    this.show();
  }
  give(id) {
    const W = WEAPONS[id];
    if (W.throwable) return;
    if (!this.ammo[id]) this.ammo[id] = { mag: W.mag, res: W.reserve };
    if (W.throwable) return;
    if (!this.guns[id]) {
      if (this.stash && this.stash[id]) { this.guns[id] = this.stash[id]; delete this.stash[id]; }
      else { const g = makeWeaponMesh(id); g.visible = false; this.scene.add(g); this.guns[id] = g; }
    }
  }
  take(id) { if (!this.guns[id]) return; this.stash ||= {}; this.guns[id].visible = false; this.stash[id] = this.guns[id]; delete this.guns[id]; }
  refill() { for (const id in this.ammo) { const W = WEAPONS[id]; this.ammo[id].mag = W.mag; this.ammo[id].res = W.reserve; } }
  get W() { return this.cur ? WEAPONS[this.cur] : null; }
  get gun() { return this.guns[this.cur]; }
  show() { for (const id in this.guns) this.guns[id].visible = id === this.cur && this.sol.visible && !this.dropped; }
  refillMag(id, n) { const a = this.ammo[id]; if (a) a.mag = Math.min(WEAPONS[id].mag, n); }
  hideAll() { for (const id in this.guns) this.guns[id].visible = false; for (const t in this.throwMeshes) this.throwMeshes[t].visible = false; }
  select(id) {
    if (!this.guns[id] || id === this.cur || this.throwT >= 0) return false;
    this.cur = id; this.reloadT = -1; this.cycleT = -1; this.switchT = 0.45; this.cool = 0.35; this.show();
    this.events('switch', { id });
    return true;
  }
  canFire() { return !!this.cur && this.cool <= 0 && this.reloadT < 0 && this.cycleT < 0 && this.switchT <= 0 && this.throwT < 0 && !this.sol.dead && !this.sol.act && (!this.W || this.W.hold === 'pistol' || !this.busy[-1]); }
  startReload() {
    const W = this.W, a = this.ammo[this.cur];
    if (!a || this.reloadT >= 0 || this.throwT >= 0 || a.mag >= W.mag + (W.id === 'pistol' && a.mag > 0 ? 1 : 0) || (a.mag >= W.mag && W.id !== 'pistol') || (a.res <= 0 && !this.infinite) || W.throwable) return false;
    this.relEmpty = a.mag === 0;   // empty: slide release / bolt work at the end; tactical: quicker, keeps the chambered round
    this.reloadT = 0; this.reloadDur = W.shellReload ? W.reload * Math.min(W.mag - a.mag, a.res || W.mag) + 0.5 : W.reload * (this.relEmpty || W.id === 'rpg' ? 1 : 0.82);
    this.relEvents = {}; this.events('reloadStart', { id: this.cur });
    return true;
  }
  // grenade: throwing animation, the grenade released at the right frame
  startThrow(id = 'bottle') {
    if (this.throwT >= 0 || this.sol.dead || this.sol.act || this.countThrow(id) <= 0) return false;
    for (const t in this.throwMeshes) this.throwMeshes[t].visible = false;
    this.throwId = id; this.grenadeMesh = this.throwMeshes[id];
    this.reloadT = -1; this.throwT = 0; this.thrown = false; this.pinned = false;
    this.sol.playUp('OverhandThrow', { rate: 1.15, fade: 0.1 });
    // a bottle is just thrown; a Molotov's rag is lit first (a lighter's strike, then the rag catches)
    if (id === 'molotov') { this.events('light', {}); const rag = this.grenadeMesh.userData.rag; if (rag && this.ragCol) rag.material.color.copy(this.ragCol); }
    return true;
  }
  update(dt, st) {
    // st: { trigger, aim, sprint }
    this.cool -= dt; this.switchT -= dt;
    this.aimW = damp(this.aimW, st.aim ? 1 : 0, 12, dt);
    this.sprintW = damp(this.sprintW, st.sprint ? 1 : 0, 6, dt);
    { const Wc = this.W, heavy = Wc && (Wc.id === 'shotgun' || Wc.bolt);   // heavy guns rise further and settle slower
      this.recoilV += (-this.recoil * (heavy ? 110 : 170) - this.recoilV * (Wc && Wc.id === 'pistol' ? 22 : 18)) * dt; this.recoil += this.recoilV * dt; }
    this.heat = damp(this.heat || 0, 0, 4, dt);
    if (this.slideT >= 0) { this.slideT += dt; if (this.slideT > 0.09) this.slideT = -1; }
    this.relW = damp(this.relW || 0, this.reloadT >= 0 ? 1 : 0, 10, dt);
    this.kickYaw = damp(this.kickYaw, 0, 8, dt);
    if (this.drops.length) this.updateDrops(dt);
    const W = this.W, a = this.ammo[this.cur];
    if (!W) { this.updateThrow(dt); this.prevTrigger = st.trigger; return false; }
    // reload
    if (this.reloadT >= 0) {
      this.reloadT += dt;
      const k = this.reloadT / this.reloadDur;
      if (W.shellReload) {
        const per = W.reload, n = Math.floor((this.reloadT - 0.2) / per);
        if (this.reloadT > 0.2 && n >= (this.relN || 0) && a.mag < W.mag && (a.res > 0 || this.infinite)) { this.relN = n + 1; a.mag++; if (!this.infinite) a.res--; this.events('shell', {}); }
        if (st.trigger && a.mag > 0 && this.reloadT > 0.3) { this.reloadT = -1; this.relN = 0; this.cycleT = 0; this.pumpOff = 0; this.spent = false; this.events('pump', {}); }
        else if (a.mag >= W.mag || (a.res <= 0 && !this.infinite) || this.reloadT >= this.reloadDur) { this.reloadT = -1; this.relN = 0; this.cycleT = 0; this.pumpOff = 0; this.spent = false; this.events('pump', {}); }
      } else {
        const ev = (t, n) => { if (k >= t && !this.relEvents[n]) { this.relEvents[n] = true; this.events(n, { id: this.cur }); } };
        if (k >= 0.18 && !this.relEvents.magOut) this.dropMag();
        ev(0.18, 'magOut'); ev(0.62, 'magIn'); if (W.id !== 'rpg' && this.relEmpty) ev(0.84, 'charge');
        if (k >= 1) {
          const wasEmpty = a.mag === 0;
          const cap = W.mag + (!wasEmpty && !W.bolt && !W.shellReload && W.id !== 'rpg' ? 1 : 0);   // 15+1 with one in the chamber
          const need = Math.max(0, cap - a.mag), take = this.infinite ? need : Math.min(need, a.res);
          a.mag += take; if (!this.infinite) a.res -= take; this.reloadT = -1;
          if (W.bolt && wasEmpty) { this.cycleT = 0; this.boltEv = false; this.spent = false; this.cool = W.bolt; }   // work the bolt to chamber one
        }
      }
    }
    // bolt / pump between shots
    if (this.cycleT >= 0) {
      this.cycleT += dt;
      const dur = W.bolt || W.pump || 0.5;
      if (W.bolt && !this.boltEv && this.cycleT > 0.15) { this.boltEv = true; this.events('bolt', {}); }
      // the spent case flies out when the bolt or the pump reaches the back of its stroke (in step with the clicks)
      if (this.spent && this.cycleT >= (W.bolt ? BOLT.back : this.pumpOff + PUMP.back)) { this.spent = false; this.eject(W.bolt ? 'rifle' : 'hull'); }
      if (this.cycleT >= dur) { this.cycleT = -1; this.boltEv = false; }
    }
    this.updateThrow(dt);
    // trigger
    return this.trigger2(st, W, a);
  }
  updateThrow(dt) {
    if (this.throwT >= 0) {
      this.throwT += dt * 1.15;
      const rel = this.sol.kind.release;
      if (!this.pinned && this.throwT > 0.15) { this.pinned = true; }
      if (!this.thrown && this.throwT >= rel) {
        this.thrown = true;
        const p = this.sol.B.RightHand.getWorldPosition(new THREE.Vector3());
        this.events('throw', { pos: p, id: this.throwId });
      }
      if (this.throwT > this.sol.kind.clips.OverhandThrow.duration * 0.92) this.throwT = -1;
    }
  }
  trigger2(st, W, a) {
    let fired = false;
    if (st.trigger && !W.throwable) {
      const fresh = !this.prevTrigger;
      if (a.mag <= 0) {
        if (fresh && this.canFire()) { this.events('dry', {}); this.cool = 0.25; }
        if (this.canFire() && (a.res > 0 || this.infinite)) this.startReload();
      } else if (this.canFire() && (W.auto || fresh)) {
        a.mag--; this.cool = 60 / W.rpm; fired = true;
        const kick = W.recoil * (st.aim ? 0.7 : 1) * (st.crouch ? 0.8 : 1);
        this.recoilV += kick * 60; this.kickYaw += (Math.random() * 0.7 - 0.2) * kick * 0.6;   // climbs up and a little right
        this.heat = (this.heat || 0) + W.recoil * 0.12;   // fast follow-ups bloom the cone (combat.js spreadOf)
        if (W.id === 'pistol') this.slideT = 0;
        if (W.bolt || W.pump) { this.cycleT = 0; this.boltEv = false; }
        if (W.pump) { this.events('pumpLater', {}); this.pumpOff = 0.2; }   // the pump sound is played 0.2 s after the shot
        this.spent = !!(W.bolt || W.pump);
        this.events('fire', { id: this.cur, kick });
      }
    }
    if (!fired && a && a.mag <= 0 && !W.throwable && this.cool <= 0 && this.reloadT < 0 && this.cycleT < 0 && this.throwT < 0 && (a.res > 0 || this.infinite) && !this.sol.dead) this.startReload();   // empty: reload by itself
    this.prevTrigger = st.trigger;
    if (!st.trigger) this.burst = 0; else if (fired) this.burst++;
    return fired;
  }
  // where the bullets come from, and which way the barrel points
  holster() { this.cur = null; this.reloadT = -1; this.cycleT = -1; for (const id in this.guns) this.guns[id].visible = false; }
  muzzle(out) { const g = this.gun; return g ? toW(g, g.userData.muzzle, out) : this.sol.B.Head.getWorldPosition(out); }
  // ---- put the gun in the hands ----
  pose(dt, st) {
    const sol = this.sol, B = sol.B, W = this.W, g = this.gun;
    if (sol.dead || this.dropped) { this.grenadeMesh.visible = false; return; }
    const throwing = this.throwT >= 0;
    // the grenade in the throwing hand
    if (throwing && !this.thrown) {
      const h = B.RightHand.getWorldPosition(tmp), m = B.RightHandMiddle1.getWorldPosition(tmp2);
      this.grenadeMesh.position.copy(h).lerp(m, 0.7); this.grenadeMesh.quaternion.copy(B.RightHand.getWorldQuaternion(qc));
      this.grenadeMesh.visible = sol.visible;
      this.grenadeMesh.userData.ring.visible = this.throwT < 0.2;
      // the Molotov's rag catches a moment after the lighter strikes, and burns in your hand until you let go
      const rag = this.grenadeMesh.userData.rag;
      if (this.throwId === 'molotov' && rag && this.throwT > 0.22 && C.fx && sol.visible) {
        this.grenadeMesh.updateMatrixWorld(true);
        const rp = rag.getWorldPosition(tmp3); rp.y += 0.04;
        C.fx.torch(rp, 1); if (C.fx.holdLight) C.fx.holdLight(this, rp, 1.6, 4.5, 0xff8a33);
        if (this.ragCol) rag.material.color.copy(this.ragCol).lerp(CHAR, clamp((this.throwT - 0.22) * 2.5, 0, 0.85));
      }
    } else this.grenadeMesh.visible = false;
    if (!g || !W || W.throwable) return;
    g.visible = sol.visible;
    const aimed = sol.combatW;                       // 0 relaxed ... 1 shouldered
    const sprint = this.sprintW * (1 - aimed);
    const sh = B.RightArm.getWorldPosition(pA), lsh = B.LeftArm.getWorldPosition(pB);
    // aimed pose
    const recoil = this.recoil;
    const relK = this.reloadT >= 0 ? this.reloadT / this.reloadDur : -1;
    // eased in and out (no snap on start, finish, interrupt or weapon switch)
    const relW = this.relW || 0;
    const rel = W.shellReload ? relW : relK >= 0 ? smooth(0, 0.1, relK) * (1 - smooth(0.9, 1, relK)) * Math.max(relW, 0.6) : 0;
    const cyc = this.cycleT >= 0 ? Math.sin(clamp(this.cycleT / (W.bolt || W.pump || 0.5), 0, 1) * Math.PI) : 0;
    let yawA = sol.aimYaw + this.kickYaw, pitA = sol.aimPitch + recoil * 1.6 - rel * 0.35, roll = rel * 0.55 + cyc * (W.bolt ? 0.25 : 0.1);
    let posA = lv;
    basis(yawA, pitA, roll, qa);
    if (W.hold === 'pistol') {
      posA.copy(sh).lerp(lsh, 0.5).addScaledVector(F, 0.4 - recoil * 0.6 - rel * 0.12).addScaledVector(U, -0.035 - rel * 0.1).addScaledVector(R, 0.03);
    } else if (W.hold === 'shoulder') {
      posA.copy(sh).addScaledVector(F, 0.22 - recoil * 0.4).addScaledVector(U, -0.075).addScaledVector(R, 0.02);
    } else {
      const ads = this.aimW;
      posA.copy(sh).addScaledVector(F, g.userData.stock - recoil * 0.9 - rel * 0.1).addScaledVector(U, lerp(-0.03, -0.05, ads) - rel * 0.06 - (W.heavy ? 0.02 : 0)).addScaledVector(R, lerp(-0.035, -0.07, ads) - rel * 0.04);
    }
    const aPos = tmp.copy(posA);
    // relaxed / sprinting pose (gun down and across the body)
    const bodyYaw = sol.yaw + sol.twist;
    let yawR = bodyYaw - lerp(0.55, 0.9, sprint), pitR = lerp(-0.6, -0.35, sprint), rollR = lerp(0.2, 0.6, sprint);
    if (W.hold === 'pistol') { yawR = bodyYaw - 0.2; pitR = -1.0; rollR = 0; }
    if (W.hold === 'shoulder') { yawR = bodyYaw - 0.1; pitR = lerp(-0.25, 0.25, sprint); rollR = 0; }
    pitR += rel * (W.hold === 'pistol' ? 0.75 : 0.4); rollR += rel * 0.5;   // reloading at the hip: bring it up to look into the mag well
    basis(yawR, pitR, rollR, qb);
    const fr = tmp2.set(Math.sin(bodyYaw), 0, Math.cos(bodyYaw)), rr = pB.set(-Math.cos(bodyYaw), 0, Math.sin(bodyYaw));
    const chest = B.Spine2.getWorldPosition(new THREE.Vector3());
    const rPos = chest.addScaledVector(fr, W.hold === 'pistol' ? 0.3 : 0.24).addScaledVector(rr, W.hold === 'pistol' ? 0.02 : W.hold === 'shoulder' ? 0.12 : 0.1 - sprint * 0.08).add(new THREE.Vector3(0, W.hold === 'pistol' ? -0.3 : W.hold === 'shoulder' ? -0.1 : -0.12 - sprint * 0.05, 0));
    if (W.hold === 'shoulder') rPos.copy(sh).addScaledVector(fr, 0.16).add(new THREE.Vector3(0, -0.11 - sprint * 0.08, 0));
    rPos.addScaledVector(fr, -rel * 0.05).y += rel * 0.12;
    // switching: the new gun comes up from low
    const up = 1 - clamp(this.switchT / 0.45, 0, 1);
    const k = aimed * smooth(0, 1, up) * (throwing ? 0 : 1);
    g.position.lerpVectors(rPos, aPos, k);
    if (throwing) g.position.y -= 0.06;
    g.quaternion.slerpQuaternions(qb, qa, k);
    g.updateMatrixWorld(true);
    // moving parts: magazine, pump, bolt, rocket
    const d = g.userData;
    let magInHand = false;
    if (d.magMesh && relK >= 0 && !W.shellReload) {
      if (relK > 0.18 && relK < 0.62) { d.magMesh.visible = relK > 0.36; magInHand = relK > 0.36; } else d.magMesh.visible = true;
      if (!magInHand) d.magMesh.position.copy(d.magHome);
    } else if (d.magMesh) { d.magMesh.visible = true; d.magMesh.position.copy(d.magHome); }
    const pumpK = this.cycleT >= 0 && W.pump ? pumpTravel(this.cycleT - (this.pumpOff || 0)) : 0;
    if (d.pumpMesh) { const back = pumpK * 0.09; d.pumpMesh.position.z = d.pumpZ - back; d.pumpParts.forEach((p, i) => p.position.z = 0.28 + i * 0.02 - back); }
    const boltK = this.cycleT >= 0 && W.bolt ? boltTravel(this.cycleT) : 0, boltLift = this.cycleT >= 0 && W.bolt ? boltLiftK(this.cycleT) : 0;
    if (d.boltMesh) { d.boltMesh.position.z = -0.02 - boltK * 0.08; d.boltMesh.rotation.z = -boltLift * 1.1; }
    if (d.slideMesh) {   // the slide cycles back and forward on each shot, and locks back on an empty magazine until the new one is in
      const sk = this.slideT >= 0 ? Math.sin(Math.min(1, this.slideT / 0.09) * Math.PI) : 0;
      const am = this.ammo.pistol, lock = am && am.mag === 0 && !(relK > 0.84) ? 1 : 0;
      d.slideMesh.position.z = d.slideZ - 0.035 * Math.max(sk, lock);
    }
    if (d.rocketMesh) d.rocketMesh.visible = this.ammo[this.cur].mag > 0 || (relK > 0.62);
    // ---- hands ----
    const T = this.targets || (this.targets = { R: { p: new THREE.Vector3(), f: new THREE.Vector3(), s: new THREE.Vector3(), trigger: true, blend: true }, L: { p: new THREE.Vector3(), f: new THREE.Vector3(), s: new THREE.Vector3(), blend: true } });
    // right hand on the pistol grip (or on the bolt while cycling a bolt-action)
    toW(g, new THREE.Vector3(0, -0.005, 0), T.R.p);
    dirW(g, 0, -0.45, 0.85, T.R.f); dirW(g, 0, 0.9, 0.3, T.R.s);
    if (W.bolt && this.cycleT >= 0) {
      // the hand goes to the knob, lifts it, draws it back, drives it home, then back to the grip
      const bp = toW(g, new THREE.Vector3(-0.075, 0.05 + boltLift * 0.015, -0.02 - boltK * 0.08), new THREE.Vector3());
      T.R.p.lerp(bp, smooth(0.0, 0.14, this.cycleT) * (1 - smooth(0.52, 0.75, this.cycleT)));
    }
    // left hand: fore grip, or busy reloading
    const L = T.L;
    if (W.hold === 'pistol') { toW(g, d.grips.L, L.p); dirW(g, -0.6, -0.3, 0.6, L.f); dirW(g, 0, 0.7, 0.5, L.s); }
    else if (d.frontGrip) { toW(g, d.grips.L, L.p); dirW(g, 0, -0.4, 0.8, L.f); dirW(g, 0, 0.95, 0.2, L.s); }
    else { toW(g, d.grips.L, L.p); dirW(g, -0.75, 0.35, 0.35, L.f); dirW(g, 0, -0.2, 0.9, L.s); }
    if (relK >= 0) this.reloadHand(relK, L, g, W, B);
    if (W.pump && this.cycleT >= 0) L.p.addScaledVector(dirW(g, 0, 0, 1, tmp3), -pumpK * 0.09);
    if (magInHand && d.magMesh) {   // the fresh magazine travels in the left hand
      const local = g.worldToLocal(L.p.clone().addScaledVector(L.f, 0.03));
      d.magMesh.position.copy(local);
    }
    const wR = throwing ? 0 : 1, wL = 1;
    sol.reach(1, T.R, wR * (1 - sol.upW * (throwing ? 1 : 0.6)));
    if (!this.busy[-1]) sol.reach(-1, T.L, wL * (throwing ? 0.9 : 1 - sol.upW * 0.6));
  }
  reloadHand(k, L, g, W, B) {
    const d = g.userData;
    const pouch = B.Spine2.getWorldPosition(new THREE.Vector3());
    const yaw = this.sol.yaw + this.sol.twist;
    pouch.add(new THREE.Vector3(Math.sin(yaw) * 0.2, -0.2, Math.cos(yaw) * 0.2));
    const magP = d.magLocal ? toW(g, d.magLocal, new THREE.Vector3()) : L.p.clone();
    const grip = L.p.clone();
    let p;
    if (W.shellReload) {   // shells: pouch → loading port, over and over
      const per = W.reload, t = ((this.reloadT - 0.2) % per) / per;
      const port = toW(g, d.portLocal, new THREE.Vector3());
      p = this.reloadT < 0.2 ? grip.lerp(port, this.reloadT / 0.2) : t < 0.5 ? port.clone().lerp(pouch, smooth(0, 0.5, t)) : pouch.clone().lerp(port, smooth(0.5, 1, t));
    } else if (W.id === 'rpg') {   // a rocket from the pack, into the muzzle
      const back = B.Spine2.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(-Math.sin(yaw) * 0.25, 0.1, -Math.cos(yaw) * 0.25));
      const mz = toW(g, d.muzzle, new THREE.Vector3());
      p = k < 0.15 ? grip.clone().lerp(back, smooth(0, 0.15, k)) : k < 0.45 ? back.clone() : k < 0.65 ? back.clone().lerp(mz, smooth(0.45, 0.65, k)) : k < 0.8 ? mz : mz.clone().lerp(grip, smooth(0.8, 1, k));
    } else {
      const charge = d.chargeLocal && this.relEmpty ? toW(g, d.chargeLocal, new THREE.Vector3()) : grip;
      const keys = [[0, grip], [0.12, magP], [0.22, magP], [0.36, pouch], [0.46, pouch], [0.58, magP], [0.66, magP], [0.78, charge], [0.86, charge], [0.97, grip]];
      let i = 0; while (i < keys.length - 2 && keys[i + 1][0] <= k) i++;
      const a = keys[i], b = keys[i + 1];
      p = a[1].clone().lerp(b[1], smooth(a[0], b[0], k));
    }
    L.p.copy(p);
  }
  // a spent case out of the ejection port, to the right and up
  eject(kind) {
    const g = this.gun; if (!g || !C.fx || !this.sol.visible) return;
    const ep = toW(g, g.userData.eject, new THREE.Vector3()), rd = dirW(g, -1, 0.5, -0.15, new THREE.Vector3());
    C.fx.shell(ep, rd, kind);
  }
  // reloading: the empty magazine drops out of the well and clatters on the ground
  dropMag() {
    const g = this.gun, d = g && g.userData; if (!d || !d.magMesh || !this.sol.visible || this.W.shellReload) return;
    g.updateMatrixWorld(true);
    const m = d.magMesh.clone(true); d.magMesh.getWorldPosition(m.position); d.magMesh.getWorldQuaternion(m.quaternion);
    this.scene.add(m);
    const yaw = this.sol.yaw;
    this.drops.push({ m, v: new THREE.Vector3(Math.sin(yaw) * 0.3, -0.4, Math.cos(yaw) * 0.3), w: new THREE.Vector3((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 5), t: 0, rest: false });
    if (this.drops.length > 6) { const o = this.drops.shift(); this.scene.remove(o.m); }
  }
  updateDrops(dt) {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const D = this.drops[i]; D.t += dt;
      if (!D.rest) {
        D.v.y -= 9.8 * dt; D.m.position.addScaledVector(D.v, dt);
        D.m.rotation.x += D.w.x * dt; D.m.rotation.y += D.w.y * dt; D.m.rotation.z += D.w.z * dt;
        const gy = (C.world && C.world.groundY ? C.world.groundY(D.m.position.x, D.m.position.z) : 0) + 0.015;
        if (D.m.position.y < gy) {
          D.m.position.y = gy; D.v.y *= -0.25; D.v.x *= 0.4; D.v.z *= 0.4; D.w.multiplyScalar(0.3);
          if (!D.hit) { D.hit = true; C.SND && C.SND.mech('bounce', D.m.position.clone()); }
          if (Math.abs(D.v.y) < 0.5) { D.rest = true; D.m.rotation.set(Math.PI / 2, Math.random() * 6.28, 0); }
        }
      }
      if (D.t > 40) { this.scene.remove(D.m); this.drops.splice(i, 1); }
    }
  }
  // throw the gun down (when its owner dies)
  drop() {
    const g = this.gun; if (!g || this.dropped) return null;
    this.dropped = true;
    return g;
  }
  pickUp() { this.dropped = false; this.show(); }
}
