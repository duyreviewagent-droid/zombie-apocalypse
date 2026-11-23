// human-WAR — uniforms and kit.
// Clothes: each body's own outfit is re-printed in camouflage by a shader (the original texture is kept only
// for its light and shade, so every fold, seam and button still shows). Allies wear woodland green, the enemy
// desert tan, the range dummies crash-test yellow. Then a helmet, plate carrier with magazine pouches, belt kit,
// assault pack and team armbands are measured against the body and fastened to its bones.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { clamp } from './soldier.js';

export const TEAMS = {
  ally: { name: 'ALLIES', camo: [0x3e4a30, 0x66764a, 0x7d6444, 0x22251a], base: 0x4a5636, band: 0x2f7dff, gear: 0x6a7552, webbing: 0x4f573f },
  enemy: { name: 'ENEMY', camo: [0x9a8862, 0xc0ab80, 0x7a6446, 0x584a36], base: 0xb09a70, band: 0xff3b2f, gear: 0xb09c74, webbing: 0x8a7b5c },
  dummy: { name: 'DUMMY', camo: [0xf2c21b, 0xf2c21b, 0xe3b414, 0xf2c21b], base: 0xf2c21b, band: 0x111111, gear: 0x1a1a1a, webbing: 0x222222 },
};

// ---------------------------------------------------------------- camouflage printed by the shader
function camoMaterial(src, team, slot, ref) {
  const T = TEAMS[team];
  const m = src.clone();
  m.metalness = 0; m.metalnessMap = null; m.roughness = slot === 'foot' ? 0.6 : 0.88; m.roughnessMap = null;
  const cols = T.camo.map(c => new THREE.Color(c));
  const boot = new THREE.Color(team === 'enemy' ? 0x5a4630 : 0x1b1712);
  m.onBeforeCompile = sh => {
    sh.uniforms.cA = { value: cols[0] }; sh.uniforms.cB = { value: cols[1] }; sh.uniforms.cC = { value: cols[2] }; sh.uniforms.cD = { value: cols[3] };
    sh.uniforms.cBoot = { value: boot }; sh.uniforms.lref = { value: ref }; sh.uniforms.isFoot = { value: slot === 'foot' ? 1 : 0 };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 cA, cB, cC, cD, cBoot; uniform float lref, isFoot;
        float ch(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(ch(i), ch(i + vec2(1, 0)), f.x), mix(ch(i + vec2(0, 1)), ch(i + vec2(1, 1)), f.x), f.y); }
        float fb(vec2 p){ return vn(p) * 0.55 + vn(p * 2.1 + 3.1) * 0.3 + vn(p * 4.7 + 7.7) * 0.15; }`)
      .replace('#include <map_fragment>', `
        #ifdef USE_MAP
          vec4 texel = texture2D(map, vMapUv);
          float L = dot(texel.rgb, vec3(0.3, 0.59, 0.11));
          float k = clamp(L / lref, 0.42, 1.35);
          vec2 q = vMapUv * 9.0;
          float n1 = fb(q), n2 = fb(q * 1.3 + 11.0), n3 = fb(q * 0.8 + 23.0);
          vec3 c = cB;
          c = mix(c, cA, smoothstep(0.5, 0.53, n1));
          c = mix(c, cC, smoothstep(0.56, 0.59, n2));
          c = mix(c, cD, smoothstep(0.62, 0.65, n3));
          c = mix(c, cBoot, isFoot);
          float fine = (ch(floor(vMapUv * 900.0)) - 0.5) * 0.06;
          diffuseColor.rgb *= c * k * (1.0 + fine);
          diffuseColor.a *= texel.a;
        #endif`);
  };
  m.customProgramCacheKey = () => 'camo-' + team + '-' + slot;
  m.needsUpdate = true;
  return m;
}
function meanLum(tex) {
  try {
    const img = tex.image, c = document.createElement('canvas'); c.width = c.height = 32;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0, 32, 32);
    const d = g.getImageData(0, 0, 32, 32).data; let s = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 128) continue; s += (0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]) / 255; n++; }
    return Math.max(0.08, s / Math.max(1, n));
  } catch { return 0.4; }
}

// ---------------------------------------------------------------- measuring a body
function meshesOf(root) { const m = []; root.traverse(o => { if (o.isMesh) m.push(o); }); return m; }
const matName = o => (o.name + ' ' + (o.material && o.material.name));
function vert(m, i, v) { if (m.isSkinnedMesh) m.getVertexPosition(i, v); else v.fromBufferAttribute(m.geometry.attributes.position, i); return v.applyMatrix4(m.matrixWorld); }
function slice(root, y0, y1, test = () => true, maxX = 9) {
  const v = new THREE.Vector3(), r = { minX: 1e9, maxX: -1e9, minZ: 1e9, maxZ: -1e9, n: 0 };
  root.updateMatrixWorld(true);
  for (const m of meshesOf(root)) {
    if (!test(m) || !m.visible) continue;
    const p = m.geometry.attributes.position;
    for (let i = 0; i < p.count; i += 2) {
      vert(m, i, v);
      if (v.y < y0 || v.y > y1 || Math.abs(v.x) > maxX) continue;
      r.minX = Math.min(r.minX, v.x); r.maxX = Math.max(r.maxX, v.x); r.minZ = Math.min(r.minZ, v.z); r.maxZ = Math.max(r.maxZ, v.z); r.n++;
    }
  }
  return r;
}
function topOf(root, test) {
  const v = new THREE.Vector3(); let top = -1e9;
  root.updateMatrixWorld(true);
  for (const m of meshesOf(root)) { if (!test(m)) continue; const p = m.geometry.attributes.position; for (let i = 0; i < p.count; i++) { vert(m, i, v); top = Math.max(top, v.y); } }
  return top;
}
// fasten an object to a bone; its position/rotation are given in world space with the body as it stands now
function mount(bone, obj) {
  bone.updateWorldMatrix(true, false);
  obj.updateMatrix();
  obj.matrix.premultiply(bone.matrixWorld.clone().invert());
  obj.matrix.decompose(obj.position, obj.quaternion, obj.scale);
  bone.add(obj);
  obj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return obj;
}

// ---------------------------------------------------------------- kit materials (shared)
const canvasTex = (w, h, draw, srgb = true, rep = [1, 1]) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t;
};
const noise = (g, w, h, a) => { const d = g.getImageData(0, 0, w, h); for (let i = 0; i < d.data.length; i += 4) { const n = (Math.random() - 0.5) * a; d.data[i] += n; d.data[i + 1] += n; d.data[i + 2] += n; } g.putImageData(d, 0, 0); };
function camoCanvas(team) {
  const T = TEAMS[team];
  return canvasTex(256, 256, (g, w, h) => {
    const hex = c => '#' + c.toString(16).padStart(6, '0');
    g.fillStyle = hex(T.camo[1]); g.fillRect(0, 0, w, h);
    for (const [ci, n, s] of [[0, 26, 34], [2, 20, 28], [3, 16, 18]]) {
      g.fillStyle = hex(T.camo[ci]);
      for (let i = 0; i < n; i++) {
        const x = Math.random() * w, y = Math.random() * h; g.beginPath();
        for (let a = 0; a < 7; a++) { const r = s * (0.5 + Math.random() * 0.7), an = a / 7 * Math.PI * 2; const px = x + Math.cos(an) * r, py = y + Math.sin(an) * r * 0.7; a ? g.lineTo(px, py) : g.moveTo(px, py); }
        g.closePath(); g.fill();
        for (const [dx, dy] of [[w, 0], [-w, 0], [0, h], [0, -h]]) { g.save(); g.translate(dx, dy); g.fill(); g.restore(); }
      }
    }
    for (let y = 0; y < h; y += 2) { g.fillStyle = 'rgba(0,0,0,0.05)'; g.fillRect(0, y, w, 1); }
    noise(g, w, h, 16);
  }, true, [2, 2]);
}
const KIT = {};
function kitMats(team) {
  if (KIT[team]) return KIT[team];
  const T = TEAMS[team];
  const cordura = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#bbbbbb'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 3) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, y, w, 1); } for (let x = 0; x < w; x += 3) { g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(x, 0, 1, h); } noise(g, w, h, 18); }, true, [3, 3]);
  const camo = team === 'dummy' ? null : camoCanvas(team);
  KIT[team] = {
    helmet: team === 'dummy' ? new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.35, metalness: 0.1 }) : new THREE.MeshStandardMaterial({ map: camo, roughness: 0.9 }),
    vest: team === 'dummy' ? new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.8 }) : new THREE.MeshStandardMaterial({ map: camo, roughness: 0.92 }),
    pouch: new THREE.MeshStandardMaterial({ map: cordura, color: T.gear, roughness: 0.95 }),
    web: new THREE.MeshStandardMaterial({ map: cordura, color: T.webbing, roughness: 0.95 }),
    band: new THREE.MeshStandardMaterial({ color: T.band, roughness: 0.6, emissive: T.band, emissiveIntensity: team === 'dummy' ? 0 : 0.12 }),
    black: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 }),
    buckle: new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4, metalness: 0.4 }),
  };
  return KIT[team];
}

// ---------------------------------------------------------------- dressing a soldier
const MATS = new Map();   // kind+team → clothing materials (shared by every soldier of that body and side)
export function dressSoldier(sol, team) {
  const root = sol.root, B = sol.B, K = kitMats(team);
  const key = sol.kind.root.uuid + team;
  let set = MATS.get(key);
  if (!set) {
    set = {};
    for (const o of meshesOf(root)) {
      const n = matName(o);
      const slot = /Outfit_Top/.test(n) ? 'top' : /Outfit_Bottom/.test(n) ? 'bottom' : /Footwear/.test(n) ? 'foot' : null;
      if (slot && o.material.map) set[o.material.name] = camoMaterial(o.material, team, slot, meanLum(o.material.map));
    }
    MATS.set(key, set);
  }
  for (const o of meshesOf(root)) {
    const n = matName(o);
    if (set[o.material.name]) o.material = set[o.material.name];
    if (/Headwear|Hair|Glasses/.test(n)) o.visible = false;   // the helmet replaces hats and hair
  }
  root.updateMatrixWorld(true);
  const head = B.Head.getWorldPosition(new THREE.Vector3());
  const isHead = m => /Wolf3D_Head/.test(m.name);
  const top = topOf(root, isHead);
  const hs = slice(root, top - 0.07, top - 0.03, isHead);
  const cx = (hs.minX + hs.maxX) / 2, cz = (hs.minZ + hs.maxZ) / 2;
  const rx = (hs.maxX - hs.minX) / 2, rz = (hs.maxZ - hs.minZ) / 2;
  sol.fit = { head, top };
  // ---- helmet: a combat helmet shell with a camo cover, rim, chin strap and a team band ----
  {
    const g = new THREE.Group();
    const r = Math.max(rx, rz) + 0.04;
    const prof = [];
    for (let i = 0; i <= 14; i++) { const a = i / 14 * Math.PI / 2; prof.push(new THREE.Vector2(Math.max(0.001, Math.cos(a) * r), Math.sin(a) * r * 1.0)); }
    const shell = new THREE.Mesh(new THREE.LatheGeometry(prof, 36), K.helmet); shell.scale.set(1, 1, 1.12); g.add(shell);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 1.0, 0.009, 6, 40), K.web); rim.rotation.x = Math.PI / 2; rim.scale.set(1, 1.12, 1); g.add(rim);
    if (team !== 'dummy') {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.005, r * 1.01, 0.022, 36, 1, true), K.band); band.position.y = r * 0.3; band.scale.set(1, 1, 1.12); g.add(band);
      const mountP = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.035, 0.014, 2, 0.004), K.black); mountP.position.set(0, r * 0.38, r * 1.08); mountP.rotation.x = -0.4; g.add(mountP);
    }
    for (const s of [-1, 1]) { const strap = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.11, 0.004), K.web); strap.position.set(s * r * 0.93, -0.05, 0.01); strap.rotation.z = s * 0.12; g.add(strap); }
    const chin = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.005, 5, 14, Math.PI), K.web); chin.position.set(0, -0.1, 0.035); chin.rotation.set(Math.PI, 0, 0); chin.scale.set(1.15, 0.8, 1); g.add(chin);
    g.position.set(cx, top - 0.105, cz - 0.012); g.rotation.x = -0.12;
    mount(B.Head, g);
    sol.helmet = g;
  }
  // ---- plate carrier on the chest (moves with the spine) ----
  {
    const y = head.y - 0.36;
    const ch = slice(root, y - 0.03, y + 0.03, m => /Outfit_Top|Body/.test(matName(m)), 0.19);
    const zf = ch.maxZ, zb = ch.minZ, w = (ch.maxX - ch.minX), cxx = (ch.maxX + ch.minX) / 2;
    const W = Math.min(0.34, w * 0.92), H = 0.34;
    const front = new THREE.Mesh(new RoundedBoxGeometry(W, H, 0.05, 3, 0.02), K.vest); front.position.set(cxx, y - 0.03, zf + 0.012); front.rotation.x = 0.06;
    mount(B.Spine2, front);
    const back = new THREE.Mesh(new RoundedBoxGeometry(W, H, 0.045, 3, 0.02), K.vest); back.position.set(cxx, y - 0.02, zb - 0.01); back.rotation.x = -0.05;
    mount(B.Spine2, back);
    for (const s of [-1, 1]) {   // cummerbund sides and shoulder straps
      const side = new THREE.Mesh(new RoundedBoxGeometry(0.04, 0.16, (zf - zb) * 0.8, 2, 0.012), K.vest); side.position.set(cxx + s * (w / 2 + 0.008), y - 0.1, (zf + zb) / 2);
      mount(B.Spine2, side);
      const strap = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.03, (zf - zb) + 0.06, 2, 0.01), K.vest); strap.position.set(cxx + s * W * 0.3, y + H / 2 + 0.03, (zf + zb) / 2 + 0.005); strap.rotation.x = 0.0;
      mount(B.Spine2, strap);
    }
    // three rifle magazine pouches across the front, a radio pouch and a little IFAK
    for (let i = -1; i <= 1; i++) {
      const p = new THREE.Mesh(new RoundedBoxGeometry(0.075, 0.1, 0.04, 2, 0.01), K.pouch); p.position.set(cxx + i * 0.085, y - 0.13, zf + 0.055);
      mount(B.Spine2, p);
      const flap = new THREE.Mesh(new RoundedBoxGeometry(0.077, 0.03, 0.044, 2, 0.008), K.web); flap.position.set(cxx + i * 0.085, y - 0.075, zf + 0.056);
      mount(B.Spine2, flap);
    }
    const radio = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.1, 0.04, 2, 0.01), K.pouch); radio.position.set(cxx + W * 0.32, y + 0.06, zf + 0.05);
    mount(B.Spine2, radio);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.004, 0.16, 5), K.black); ant.position.set(cxx + W * 0.36, y + 0.18, zf + 0.04); ant.rotation.z = -0.15;
    mount(B.Spine2, ant);
    const ifak = new THREE.Mesh(new RoundedBoxGeometry(0.08, 0.06, 0.035, 2, 0.01), K.pouch); ifak.position.set(cxx - W * 0.28, y + 0.07, zf + 0.048);
    mount(B.Spine2, ifak);
    // assault pack
    const pack = new THREE.Mesh(new RoundedBoxGeometry(W * 0.72, 0.3, 0.1, 3, 0.035), K.pouch); pack.position.set(cxx, y - 0.01, zb - 0.075);
    mount(B.Spine2, pack);
    const roll = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, W * 0.7, 4, 10).rotateZ(Math.PI / 2), K.web); roll.position.set(cxx, y + 0.16, zb - 0.07);
    mount(B.Spine2, roll);
    if (team === 'dummy') {   // crash-test target disc on the chest
      const tex = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#f2c21b'; g.fillRect(0, 0, w, h); g.fillStyle = '#111'; g.beginPath(); g.moveTo(64, 64); g.arc(64, 64, 60, 0, Math.PI / 2); g.fill(); g.beginPath(); g.moveTo(64, 64); g.arc(64, 64, 60, Math.PI, Math.PI * 1.5); g.fill(); g.strokeStyle = '#111'; g.lineWidth = 4; g.beginPath(); g.arc(64, 64, 60, 0, 7); g.stroke(); });
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.07, 24), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }));
      disc.position.set(cxx, y - 0.02, zf + 0.04); mount(B.Spine2, disc);
    }
  }
  // ---- belt kit ----
  {
    const hips = B.Hips.getWorldPosition(new THREE.Vector3());
    const y = hips.y + 0.02;
    const wb = slice(root, y - 0.015, y + 0.015, m => /Outfit/.test(matName(m)), 0.22);
    const cx2 = (wb.maxX + wb.minX) / 2, cz2 = (wb.maxZ + wb.minZ) / 2, rx2 = (wb.maxX - wb.minX) / 2 + 0.014, rz2 = (wb.maxZ - wb.minZ) / 2 + 0.014;
    const beltMat = K.web.clone(); beltMat.side = THREE.DoubleSide;
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.05, 40, 1, true), beltMat);
    belt.scale.set(rx2, 1, rz2); belt.position.set(cx2, y, cz2);
    mount(B.Hips, belt);
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.04, 0.01), K.buckle); buckle.position.set(cx2, y, cz2 + rz2 + 0.003);
    mount(B.Hips, buckle);
    const onBelt = (a, mesh, out = 0.02, dy = 0) => { mesh.position.set(cx2 + Math.sin(a) * (rx2 + out), y + dy, cz2 + Math.cos(a) * (rz2 + out)); mesh.rotation.y = a; mount(B.Hips, mesh); };
    onBelt(-Math.PI / 2 - 0.2, new THREE.Mesh(new RoundedBoxGeometry(0.055, 0.16, 0.05, 2, 0.01), K.pouch), 0.03, -0.06);   // holster
    onBelt(Math.PI / 2 + 0.3, new THREE.Mesh(new RoundedBoxGeometry(0.07, 0.08, 0.045, 2, 0.01), K.pouch), 0.025, -0.02);   // grenade pouch
    onBelt(Math.PI - 0.4, new THREE.Mesh(new RoundedBoxGeometry(0.11, 0.09, 0.05, 2, 0.012), K.pouch), 0.02, -0.02);        // dump pouch
    onBelt(Math.PI + 0.45, new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.14, 12), K.web), 0.035, -0.04);        // canteen
  }
  // ---- team armbands ----
  if (team !== 'dummy') {
    for (const P of ['Left', 'Right']) {
      const arm = B[P + 'Arm'], fore = B[P + 'ForeArm'];
      const a = arm.getWorldPosition(new THREE.Vector3()), b = fore.getWorldPosition(new THREE.Vector3());
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.056, 0.05, 16, 1, true), K.band);
      band.material = K.band;
      band.position.copy(a).lerp(b, 0.42);
      band.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      mount(arm, band);
    }
  }
}
