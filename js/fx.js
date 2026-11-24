// human-WAR — effects: muzzle flashes (with real light), tracers, brass, bullet impacts (dirt, sparks,
// splinters, brick dust), explosions (fireball, shock ring, smoke column, flying debris, crater) and the
// smoke and fire that keep burning on wrecks. Particles are soft round points in two pools: light (additive)
// and matter (smoke, dust, dirt).
import * as THREE from 'three';
import { tier } from './tex.js';

const VS = `
  attribute float size; attribute vec4 col; attribute float rot; varying vec4 vCol; varying float vRot; uniform float pscale;
  void main(){ vCol = col; vRot = rot; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * pscale / -mv.z; gl_Position = projectionMatrix * mv; }`;
const FS = `
  varying vec4 vCol; varying float vRot; uniform float soft; uniform sampler2D puff; uniform float usePuff; uniform vec3 amb;
  void main(){
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c); if (d > 0.5) discard;
    float a = soft > 0.5 ? smoothstep(0.5, 0.0, d) : smoothstep(0.5, 0.38, d);
    if (usePuff > 0.5) { float cs = cos(vRot), sn = sin(vRot); vec2 r = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs) + 0.5; a *= texture2D(puff, r).r * 1.6; }
    gl_FragColor = vec4(vCol.rgb * amb, vCol.a * a); }`;
export const PSCALE = { value: 900 };
// how much light falls on smoke, dust and blood (from the sky and the sun): grey smoke at noon, near black at night.
// Fire and sparks glow by themselves (their pool keeps amb at 1).
const AMB = { value: new THREE.Color(1, 1, 1) }, ONE = { value: new THREE.Color(1, 1, 1) };
let PUFF = null;
function puffTex() {
  if (PUFF) return PUFF;
  const N = 128, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 60; i++) { const x = N / 2 + (Math.random() - 0.5) * N * 0.55, y = N / 2 + (Math.random() - 0.5) * N * 0.55, r = 8 + Math.random() * 26; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(255,255,255,${0.25 + Math.random() * 0.2})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, N, N); }
  PUFF = new THREE.CanvasTexture(c); return PUFF;
}
class Pool {
  constructor(scene, n, additive, soft = true, puff = false) {
    this.n = n; this.i = 0; this.live = 0; this.dirty = true; this.keep = 1;
    this.P = new Float32Array(n * 3); this.V = new Float32Array(n * 3); this.L = new Float32Array(n * 4);
    this.C = new Float32Array(n * 4); this.C0 = new Float32Array(n * 4); this.S = new Float32Array(n); this.G = new Float32Array(n * 2); this.R = new Float32Array(n); this.RV = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.P, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('col', new THREE.BufferAttribute(this.C, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.S, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('rot', new THREE.BufferAttribute(this.R, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: { soft: { value: soft ? 1 : 0 }, pscale: PSCALE, puff: { value: puffTex() }, usePuff: { value: puff ? 1 : 0 }, amb: additive ? ONE : AMB }, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.pts = new THREE.Points(g, this.mat); this.pts.frustumCulled = false; this.pts.renderOrder = 5;
    scene.add(this.pts); this.g = g;
  }
  emit(x, y, z, vx, vy, vz, life, s0, s1, r, gr, b, a, grav = 0, drag = 0) {
    if (this.keep < 1 && Math.random() > this.keep) return;   // phones: a share of the puffs (less overdraw)
    this.dirty = true;
    const i = this.i; this.i = (this.i + 1) % this.n;
    const k = i * 3, o = i * 4;
    this.P[k] = x; this.P[k + 1] = y; this.P[k + 2] = z; this.V[k] = vx; this.V[k + 1] = vy; this.V[k + 2] = vz;
    this.L[o] = life; this.L[o + 1] = life; this.L[o + 2] = s0; this.L[o + 3] = s1;
    this.C0[o] = r; this.C0[o + 1] = gr; this.C0[o + 2] = b; this.C0[o + 3] = a; this.G[i * 2] = grav; this.G[i * 2 + 1] = drag;
    this.R[i] = Math.random() * 6.28; this.RV[i] = (Math.random() - 0.5) * 1.2;
  }
  update(dt) {
    // nothing alive and nothing new since the last upload: no work, no upload, no draw
    if (!this.dirty && this.live === 0) return;
    this.dirty = false;
    const { P, V, L, C, C0, S, G, R, RV } = this;
    let live = 0;
    for (let i = 0; i < this.n; i++) {
      const o = i * 4;
      if (L[o] <= 0) { if (S[i] !== 0) { S[i] = 0; C[o + 3] = 0; } continue; }
      L[o] -= dt; live++;
      const t = 1 - L[o] / L[o + 1], k = i * 3;
      V[k + 1] -= G[i * 2] * dt;
      const dr = Math.exp(-G[i * 2 + 1] * dt); V[k] *= dr; V[k + 1] *= dr; V[k + 2] *= dr;
      P[k] += V[k] * dt; P[k + 1] += V[k + 1] * dt; P[k + 2] += V[k + 2] * dt;
      if (P[k + 1] < 0.02 && G[i * 2] > 0) { P[k + 1] = 0.02; V[k + 1] *= -0.3; V[k] *= 0.6; V[k + 2] *= 0.6; }
      R[i] += RV[i] * dt;
      S[i] = L[o + 2] + (L[o + 3] - L[o + 2]) * Math.sqrt(t);
      const fade = Math.min(1, t * 10) * (1 - t * t);
      C[o] = C0[o]; C[o + 1] = C0[o + 1]; C[o + 2] = C0[o + 2]; C[o + 3] = C0[o + 3] * fade;
    }
    this.g.attributes.position.needsUpdate = true; this.g.attributes.col.needsUpdate = true; this.g.attributes.size.needsUpdate = true; this.g.attributes.rot.needsUpdate = true;
    this.live = live; this.pts.visible = live > 0;
  }
}

export function makeFX(scene, world = null) {
  // phones and tablets: smaller pools, a share of the smoke, fewer flash lights (every light costs every pixel)
  const LOW = tier(), PK = LOW > 1 ? 0.4 : LOW ? 0.6 : 1;
  const glow = new Pool(scene, Math.round(2500 * PK), true), smoke = new Pool(scene, Math.round(2200 * PK), false, true, true), bits = new Pool(scene, Math.round(1500 * PK), false, false);
  if (LOW) { smoke.keep = LOW > 1 ? 0.55 : 0.75; bits.keep = LOW > 1 ? 0.6 : 0.8; }
  const rnd = (a = 1) => (Math.random() - 0.5) * 2 * a;
  // a few lights for flashes. They go through the world's light pool (world.addLight): the pool copies the few that
  // matter onto a fixed set of real lights, so no shader ever recompiles and an idle flash light costs nothing.
  // (world: passed in, or found once the game is up; no world at all (a test page): plain lights in the scene)
  const lights = [], fxLights = [];
  let pooled = false;
  const pool = () => {
    if (pooled) return; const Wd = world || (typeof window !== 'undefined' && window.ZA && window.ZA.world);
    if (!Wd || !Wd.addLight) return; pooled = true; for (const l of fxLights) Wd.addLight(l, scene);
  };
  for (let i = 0; i < (LOW ? 2 : 4); i++) { const l = new THREE.PointLight(0xffb060, 0, 14, 2); fxLights.push(l); lights.push({ l, t: 0, dur: 0.05, peak: 0 }); }
  let li = 0;
  // three steady lights for things that keep burning (a pool of fuel, a lit Molotov rag): held by whoever calls holdLight
  // each frame, flickering like a flame, fading out a moment after the last call
  const held = [];
  for (let i = 0; i < (LOW > 1 ? 1 : LOW ? 2 : 3); i++) { const l = new THREE.PointLight(0xff7a2a, 0, 8, 2); fxLights.push(l); held.push({ l, key: null, hold: 0, peak: 0, cur: 0 }); }
  pool();
  const holdLight = (key, p, peak, dist = 8, col = 0xff7a2a) => {
    let H = held.find(h => h.key === key);
    if (!H) H = held.find(h => h.hold <= 0 && h.cur < 0.05) || held.reduce((a, b) => (b.peak < a.peak ? b : a));
    if (H.key !== key && H.hold > 0 && H.peak >= peak) return;   // both busy with brighter fires
    H.key = key; H.hold = 0.2; H.peak = peak; H.l.distance = dist; H.l.color.setHex(col); H.l.position.copy(p);
  };
  // let go of a held light at once (a thrown Molotov that just smashed: its light is free for the fire pool)
  const dropLight = key => { const H = held.find(h => h.key === key); if (H) { H.hold = 0; H.key = null; H.peak = 0; } };
  const flashLight = (p, peak, dur, dist = 14, col = 0xffb060) => { const L = lights[li++ % lights.length]; L.l.position.copy(p); L.l.distance = dist; L.l.color.setHex(col); L.peak = peak; L.t = dur; L.dur = dur; };
  // muzzle flash: two crossed star cards, scaled per shot
  const starTex = (() => {
    const N = 128, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d');
    const gr = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2); gr.addColorStop(0, 'rgba(255,250,220,1)'); gr.addColorStop(0.2, 'rgba(255,200,90,0.9)'); gr.addColorStop(0.5, 'rgba(255,120,30,0.35)'); gr.addColorStop(1, 'rgba(255,80,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, N, N);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) { g.save(); g.translate(N / 2, N / 2); g.rotate(i / 6 * Math.PI * 2 + Math.random() * 0.3); const sg = g.createLinearGradient(0, 0, N / 2, 0); sg.addColorStop(0, 'rgba(255,230,160,0.9)'); sg.addColorStop(1, 'rgba(255,140,40,0)'); g.fillStyle = sg; g.beginPath(); g.moveTo(0, -4); g.lineTo(N / 2, 0); g.lineTo(0, 4); g.fill(); g.restore(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const flashMat = new THREE.MeshBasicMaterial({ map: starTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const flashes = [];
  for (let i = 0; i < 12; i++) {
    const g = new THREE.Group();
    const a = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), flashMat); const b = a.clone(); b.rotation.y = Math.PI / 2; const c = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), flashMat); c.rotation.x = Math.PI / 2;
    a.position.z = b.position.z = 0.5; g.add(a, b, c); g.visible = false; scene.add(g); flashes.push({ g, t: 0 });
  }
  let fi = 0;
  // tracers: thin glowing streaks flying along the shot
  const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffd08a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const tracerGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 4, 1, true).rotateX(Math.PI / 2).translate(0, 0, -0.5);
  const tracers = [];
  for (let i = 0; i < 80; i++) { const m = new THREE.Mesh(tracerGeo, tracerMat); m.visible = false; m.frustumCulled = false; scene.add(m); tracers.push({ m, o: new THREE.Vector3(), d: new THREE.Vector3(), L: 0, s: 0, len: 3 }); }
  let ti = 0;
  // brass casings
  const shellGeo = new THREE.CylinderGeometry(0.0045, 0.0045, 0.022, 6).rotateZ(Math.PI / 2);
  const shellMat = new THREE.MeshStandardMaterial({ color: 0xd4a548, roughness: 0.3, metalness: 1 });
  const shellRed = new THREE.MeshStandardMaterial({ color: 0xa02a1a, roughness: 0.5, metalness: 0.2 });
  const shells = [];
  for (let i = 0; i < 60; i++) { const m = new THREE.Mesh(shellGeo, shellMat); m.visible = false; m.castShadow = false; scene.add(m); shells.push({ m, v: new THREE.Vector3(), w: new THREE.Vector3(), life: 0, rest: false, bounced: 0 }); }
  let si = 0;
  // debris chunks from explosions
  const chunkGeo = new THREE.DodecahedronGeometry(0.08, 0);
  const chunkMat = new THREE.MeshStandardMaterial({ color: 0x3a3026, roughness: 1, flatShading: true });
  const chunks = [];
  for (let i = 0; i < 70; i++) { const m = new THREE.Mesh(chunkGeo, chunkMat); m.visible = false; m.castShadow = true; scene.add(m); chunks.push({ m, v: new THREE.Vector3(), w: new THREE.Vector3(), life: 0 }); }
  let ci = 0;
  // fireball shells and shock rings
  const ballMat = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xfff0d0, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
  const balls = [];
  for (let i = 0; i < 6; i++) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), ballMat.clone()); b.visible = false; scene.add(b);
    const r = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2), ringMat.clone()); r.visible = false; scene.add(r);
    balls.push({ b, r, t: 1, size: 1 });
  }
  let bi = 0;
  // [realism] bullet holes: a dark hole in a ring of freshly chipped surface, left on whatever was hit (one instanced
  // mesh, one draw call; the oldest are reused, and each one fades away after a minute or so)
  const HOLE_N = LOW > 1 ? 32 : LOW ? 48 : 96;
  const holeTex = (() => {
    const N = 64, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'), m = N / 2;
    { const sg = g.createRadialGradient(m, m, 0, m, m, 31); sg.addColorStop(0, 'rgba(70,64,58,0.55)'); sg.addColorStop(0.55, 'rgba(90,84,78,0.25)'); sg.addColorStop(1, 'rgba(90,84,78,0)'); g.fillStyle = sg; g.fillRect(0, 0, N, N); }   // scuffed, sooty ring
    for (let i = 0; i < 26; i++) { const a = Math.random() * 6.28, r = 10 + Math.random() * 16; g.fillStyle = `rgba(${200 + Math.random() * 55},${200 + Math.random() * 55},${200 + Math.random() * 55},${0.35 + Math.random() * 0.4})`; g.beginPath(); g.ellipse(m + Math.cos(a) * r * 0.5, m + Math.sin(a) * r * 0.5, 2 + Math.random() * 6, 1 + Math.random() * 3, a, 0, 7); g.fill(); }   // chips
    const gr = g.createRadialGradient(m, m, 0, m, m, 15); gr.addColorStop(0, 'rgba(6,5,4,1)'); gr.addColorStop(0.55, 'rgba(14,12,10,0.97)'); gr.addColorStop(1, 'rgba(50,45,40,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(m, m, 15, 0, 7); g.fill();
    for (let i = 0; i < 7; i++) { const a = Math.random() * 6.28; g.strokeStyle = 'rgba(20,18,16,0.6)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(m + Math.cos(a) * 5, m + Math.sin(a) * 5); g.lineTo(m + Math.cos(a + 0.2) * (12 + Math.random() * 14), m + Math.sin(a + 0.2) * (12 + Math.random() * 14)); g.stroke(); }   // hairline cracks
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const holes = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ map: holeTex, transparent: true, depthWrite: false, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), HOLE_N);
  holes.frustumCulled = false; holes.renderOrder = 1; holes.receiveShadow = true;
  { const z = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < HOLE_N; i++) { holes.setMatrixAt(i, z); holes.setColorAt(i, new THREE.Color(1, 1, 1)); } }
  scene.add(holes);
  const holeD = Array.from({ length: HOLE_N }, () => ({ t: 0, s: 0, p: new THREE.Vector3(), q: new THREE.Quaternion() }));
  let hi = 0, holeLive = 0, holeTick = 0;
  const HZ = new THREE.Vector3(0, 0, 1), hq2 = new THREE.Quaternion(), hM = new THREE.Matrix4(), hS = new THREE.Vector3(), hC = new THREE.Color();
  function hole(p, n, mat, big) {
    if (!n || n.lengthSq() < 0.5) return;
    const soft = mat === 'dirt' || mat === 'grass' || mat === 'mud' || mat === 'sand' || mat === 'cloth' || mat === 'paper' || mat === 'wire' || mat === 'leaves' || mat === 'carpet' || mat === 'fabric';
    const D = holeD[hi], i = hi; hi = (hi + 1) % HOLE_N;
    D.p.copy(p).addScaledVector(n, 0.004); D.q.setFromUnitVectors(HZ, n).multiply(hq2.setFromAxisAngle(HZ, Math.random() * 6.28));
    D.s = (soft ? 0.09 : mat === 'metal' || mat === 'barrel' || mat === 'alu' ? 0.04 : mat === 'wood' || mat === 'plank' ? 0.055 : 0.07) * Math.min(1.5, Math.max(0.45, big)) * (0.85 + Math.random() * 0.3); D.t = 0;
    const c = surf[mat] || surf.dirt;
    // the ring takes the colour of what's underneath, brighter (fresh chips, bare metal, pale torn wood); in soil just a dark scuff
    if (soft) hC.setRGB(c[0] * 0.55, c[1] * 0.5, c[2] * 0.45); else if (mat === 'metal' || mat === 'barrel' || mat === 'alu') hC.setRGB(0.95, 0.95, 0.97); else hC.setRGB(Math.min(1, c[0] * 1.35 + 0.1), Math.min(1, c[1] * 1.35 + 0.1), Math.min(1, c[2] * 1.35 + 0.1));
    holes.setColorAt(i, hC); holes.instanceColor.needsUpdate = true;
    holes.setMatrixAt(i, hM.compose(D.p, D.q, hS.setScalar(D.s))); holes.instanceMatrix.needsUpdate = true;
    holeLive = HOLE_N;
  }
  function holeUpdate(dt) {
    if (!holeLive || (++holeTick & 15)) return;
    let any = 0, ch = false;
    for (let i = 0; i < HOLE_N; i++) { const D = holeD[i]; if (D.s <= 0) continue; D.t += dt * 16; any++;
      if (D.t > 70) { const k = Math.max(0, 1 - (D.t - 70) / 5); if (k <= 0) D.s = 0; holes.setMatrixAt(i, hM.compose(D.p, D.q, hS.setScalar(D.s * k))); ch = true; } }
    if (ch) holes.instanceMatrix.needsUpdate = true;
    if (!any) holeLive = 0;
  }
  const surf = {
    dirt: [0.36, 0.29, 0.21], grass: [0.32, 0.3, 0.2], mud: [0.25, 0.2, 0.15], sand: [0.55, 0.47, 0.34], concrete: [0.62, 0.6, 0.56], brick: [0.55, 0.32, 0.24],
    rock: [0.55, 0.53, 0.5], wood: [0.5, 0.38, 0.24], metal: [0.6, 0.6, 0.6], barrel: [0.6, 0.6, 0.6], cloth: [0.4, 0.42, 0.3], flesh: [0.5, 0.45, 0.4], wire: [0.5, 0.5, 0.5], paper: [0.85, 0.82, 0.74],
    // [realism] the rest of the world's surfaces: white plaster dust off drywall, grey off asphalt, pale chips off tile
    drywall: [0.86, 0.85, 0.8], plaster: [0.84, 0.82, 0.77], tile: [0.8, 0.8, 0.78], glass: [0.72, 0.78, 0.8], asphalt: [0.26, 0.26, 0.26], drive: [0.5, 0.49, 0.46], stone: [0.55, 0.53, 0.5],
    plastic: [0.55, 0.55, 0.55], leaves: [0.3, 0.34, 0.18], plank: [0.5, 0.38, 0.24], alu: [0.7, 0.7, 0.72], carpet: [0.42, 0.37, 0.32], fabric: [0.42, 0.4, 0.36], clay: [0.62, 0.36, 0.22],
  };
  // ---- debris from things that break: wood splinters and broken slats, leaves and twigs, shards of plastic and of a
  // clay pot, clods of soil. Real little pieces (one instanced mesh per kind, tinted per piece) with weight: thrown
  // along the blow, tumbling, bouncing on the ground and coming to rest flat, then sinking away after a while.
  const DEB = {}, dM = new THREE.Matrix4(), dQ = new THREE.Quaternion(), dE = new THREE.Euler(), dS = new THREE.Vector3(), dCol = new THREE.Color();
  const DEB_KIND = {
    splinter: { geo: () => new THREE.BoxGeometry(1, 1, 1), mat: { roughness: 0.9 }, n: 220, size: [[0.16, 0.5], [0.012, 0.03], [0.025, 0.07]], col: [[0.55, 0.42, 0.28], [0.42, 0.3, 0.19], [0.62, 0.5, 0.36]], drag: 0.4, bounce: 0.3, life: [9, 14] },
    picket: { geo: () => new THREE.BoxGeometry(1, 1, 1), mat: { roughness: 0.7 }, n: 120, size: [[0.1, 0.38], [0.012, 0.022], [0.04, 0.08]], col: [[0.87, 0.86, 0.82], [0.8, 0.79, 0.75], [0.62, 0.5, 0.36]], drag: 0.4, bounce: 0.3, life: [9, 14] },
    leaf: { geo: () => { const g = new THREE.PlaneGeometry(1, 1, 1, 1); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setX(i, x * (1 - Math.abs(y) * 0.9)); p.setZ(i, x * x * 0.3); } g.computeVertexNormals(); return g; }, mat: { roughness: 0.8, side: THREE.DoubleSide }, n: 360, size: [[0.05, 0.09], [0.07, 0.13], [1, 1]], col: [[0.2, 0.33, 0.12], [0.26, 0.38, 0.14], [0.17, 0.27, 0.1], [0.32, 0.36, 0.16]], drag: 2.6, bounce: 0.05, life: [8, 13], flutter: true },
    twig: { geo: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 4), mat: { roughness: 0.95 }, n: 140, size: [[0.012, 0.022], [0.15, 0.45], [0.012, 0.022]], col: [[0.3, 0.22, 0.14], [0.24, 0.18, 0.12]], drag: 0.6, bounce: 0.25, life: [9, 14] },
    plastic: { geo: () => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.5, 0.5, 0, -0.3, -0.45, 0, -0.4, 0, 0.12, 0, 0.5, 0, -0.3, 0, 0, 0.5, 0, 0.12, 0, -0.45, 0, -0.4, 0.5, 0, -0.3, 0, 0.12, 0, 0, 0, 0.5, -0.45, 0, -0.4], 3)); g.computeVertexNormals(); return g; }, mat: { roughness: 0.4, side: THREE.DoubleSide }, n: 140, size: [[0.05, 0.14], [0.3, 0.6], [0.05, 0.14]], col: [[0.24, 0.4, 0.25], [0.2, 0.34, 0.22]], drag: 0.5, bounce: 0.45, life: [9, 14] },
    clay: { geo: () => { const g = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true, 0, 1.1); g.translate(0, 0, -1); return g; }, mat: { roughness: 0.85, side: THREE.DoubleSide }, n: 120, size: [[0.05, 0.1], [0.04, 0.1], [0.05, 0.1]], col: [[0.66, 0.34, 0.2], [0.6, 0.3, 0.18], [0.7, 0.4, 0.26]], drag: 0.3, bounce: 0.3, life: [10, 15] },
    soil: { geo: () => new THREE.DodecahedronGeometry(0.5, 0), mat: { roughness: 1, flatShading: true }, n: 160, size: [[0.025, 0.06], [0.02, 0.045], [0.025, 0.06]], col: [[0.2, 0.14, 0.09], [0.16, 0.11, 0.07]], drag: 0.3, bounce: 0.1, life: [7, 11] },
    metal: { geo: () => new THREE.BoxGeometry(1, 1, 1), mat: { roughness: 0.5, metalness: 0.7 }, n: 60, size: [[0.04, 0.12], [0.004, 0.008], [0.04, 0.1]], col: [[0.2, 0.21, 0.22], [0.45, 0.46, 0.47]], drag: 0.2, bounce: 0.35, life: [9, 14] },
  };
  function debPool(kind) {
    if (DEB[kind]) return DEB[kind];
    const K = DEB_KIND[kind], im = new THREE.InstancedMesh(K.geo(), new THREE.MeshStandardMaterial(K.mat), K.n);
    im.castShadow = false; im.receiveShadow = true; im.frustumCulled = false; im.count = K.n;
    const z = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < K.n; i++) { im.setMatrixAt(i, z); im.setColorAt(i, dCol.setRGB(1, 1, 1)); }
    scene.add(im);
    const P = { K, im, i: 0, live: 0, d: Array.from({ length: K.n }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Vector3(), w: new THREE.Vector3(), s: new THREE.Vector3(), rest: false, floor: 0 })) };
    return (DEB[kind] = P);
  }
  // p: where it breaks; dir: the way the blow (or the car) was going; n pieces; power ~0.3 (a knock) .. 2 (a car at speed)
  // spread: how far round the point they start (a fence panel is wide); floor: the ground there (a porch is 0.12)
  // the slot for a new piece: a free one, else one that has lain still a while, else the resting piece nearest its end
  // (never one still in the air unless everything is). A live piece isn't swapped out instantly: it shrinks away
  // over 0.3 s and the new piece starts in its slot after that.
  function debSlot(P) {
    const K = P.K; let best = -1, bl = 1e9;
    for (let n = 0; n < K.n; n++) {
      const i = (P.i + n) % K.n, D = P.d[i]; if (D.pend) continue;
      if (D.life <= 0 || (D.rest && D.life < D.life0 - 3)) { P.i = (i + 1) % K.n; return i; }
      if (D.rest && D.life < bl) { bl = D.life; best = i; }
    }
    if (best < 0) { best = P.i; for (let n = 0; n < K.n && P.d[best].pend; n++) best = (best + 1) % K.n; }
    P.i = (best + 1) % K.n; return best;
  }
  function debStart(P, idx, A) {
    const K = P.K, D = P.d[idx];
    D.p.copy(A.p); D.v.copy(A.v); D.r.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28); D.w.set(rnd(14), rnd(14), rnd(14));
    const [a, b] = K.size[0], [c, d] = K.size[1], [e, f] = K.size[2], u = Math.random();
    D.s.set(a + (b - a) * u, c + (d - c) * Math.random(), e + (f - e) * Math.random());
    D.life = D.life0 = K.life[0] + Math.random() * (K.life[1] - K.life[0]); D.rest = false; D.floor = A.floor; D.ph = Math.random() * 6.28; D.fadeOut = 0; D.pend = null;
    const cc = A.tint || K.col[Math.floor(Math.random() * K.col.length)], j = 0.88 + Math.random() * 0.24;
    P.im.setColorAt(idx, dCol.setRGB(cc[0] * j, cc[1] * j, cc[2] * j)); P.im.instanceColor.needsUpdate = true;
  }
  // p: where it breaks; dir: the way the blow (or the car) was going; n pieces; power ~0.3 (a knock) .. 2 (a car at speed)
  // spread: how far round the point they start (a fence panel is wide); floor: the ground there (a porch is 0.12)
  function debris(p, dir, kind = 'splinter', n = 10, power = 1, spread = 0.3, floor = 0, tint = null) {
    const P = debPool(kind), dx = dir ? dir.x : 0, dz = dir ? dir.z : 0;
    for (let k = 0; k < n; k++) {
      const sp = (0.6 + Math.random() * 1.6) * power;
      const A = {
        p: new THREE.Vector3(p.x + rnd(spread), p.y + rnd(spread * 0.5), p.z + rnd(spread)),
        v: new THREE.Vector3(dx * sp * 2.2 + rnd(1.4) * power, (0.8 + Math.random() * 2.4) * Math.min(1.6, power) + 0.4, dz * sp * 2.2 + rnd(1.4) * power),
        floor, tint,
      };
      const idx = debSlot(P), D = P.d[idx];
      if (D.life > 0) { D.pend = A; D.fadeOut = 0.3; }
      else debStart(P, idx, A);
    }
    P.live = P.K.n;
  }
  let debFrame = 0;
  const dq = { x: 0, z: 0, gy: 0 }, mv = new THREE.Vector3();
  const WLD = () => F.world || (typeof window !== 'undefined' && window.ZA && window.ZA.world) || null;
  function debUpdate(dt) {
    const W = WLD(), wallCheck = (++debFrame & 3) === 0;
    // things that move through the litter: you, and anything main.js lists in fx.movers ([{ p, v }], e.g. cars)
    const movers = [];
    { const za = typeof window !== 'undefined' && window.ZA; const pl = za && za.P && za.P.s; if (pl && pl.vel && pl.vel.lengthSq() > 0.25) movers.push({ p: pl.pos, v: pl.vel }); }
    if (F.movers) for (const M of F.movers) if (M && M.p && M.v && M.v.lengthSq() > 0.25) movers.push(M);
    for (const kind in DEB) {
      const P = DEB[kind], K = P.K; if (!P.live) continue;
      let any = 0;
      for (let i = 0; i < K.n; i++) {
        const D = P.d[i]; if (D.life <= 0 && !D.pend) continue;
        D.life -= dt; any++;
        if (D.pend) {   // shrinking away to make room
          D.fadeOut -= dt;
          if (D.fadeOut <= 0) { debStart(P, i, D.pend); }
          else { dQ.setFromEuler(dE.set(D.r.x, D.r.y, D.r.z)); dS.copy(D.s).multiplyScalar(Math.max(0, D.fadeOut / 0.3) * Math.min(1, Math.max(0, D.life / 1.2))); P.im.setMatrixAt(i, dM.compose(D.p, dQ, dS)); continue; }
        }
        if (D.life <= 0) { P.im.setMatrixAt(i, dM.makeScale(0, 0, 0)); continue; }
        // kicked along by a car or your feet
        if (D.rest && movers.length) for (const M of movers) {
          const ex = D.p.x - M.p.x, ez = D.p.z - M.p.z;
          if (ex * ex + ez * ez < 1 && Math.abs(D.p.y - M.p.y) < 1.5) { D.v.set(M.v.x * 0.3 + rnd(0.3), 0.6 + Math.random() * 0.8 * Math.min(1, M.v.length() / 6), M.v.z * 0.3 + rnd(0.3)); D.w.set(rnd(8), rnd(8), rnd(8)); D.rest = false; break; }
        }
        if (!D.rest) {
          D.v.y -= 9.8 * dt; const dr = Math.exp(-K.drag * dt); D.v.x *= dr; D.v.z *= dr; if (K.flutter) { D.v.y *= Math.exp(-K.drag * 0.8 * dt); D.v.x += Math.sin(D.life * 5 + D.ph) * dt * 1.2; D.v.z += Math.cos(D.life * 4 + D.ph) * dt * 1.2; }
          const ox = D.p.x, oz = D.p.z;
          D.p.addScaledVector(D.v, dt); D.r.addScaledVector(D.w, dt);
          // walls: a piece thrown at a house bounces off it instead of ending up inside
          if (wallCheck && W && W.collide && (D.v.x * D.v.x + D.v.z * D.v.z) > 0.01) {
            dq.x = D.p.x; dq.z = D.p.z; dq.gy = D.gnd ?? D.floor;
            try { W.collide(dq, 0.05); } catch (e) { dq.x = D.p.x; dq.z = D.p.z; }
            if (Math.abs(dq.x - D.p.x) + Math.abs(dq.z - D.p.z) > 1e-4) { D.p.x = ox; D.p.z = oz; D.v.x *= -0.3; D.v.z *= -0.3; }
          }
          // the ground where it is now (a splinter off a porch lands on the lawn, not 12 cm above it)
          let gnd = D.floor;
          if (W && W.groundY) { try { gnd = W.groundY(D.p.x, D.p.z, D.p.y + 0.05); } catch (e) { gnd = D.floor; } }
          D.gnd = gnd;
          const fl = gnd + Math.min(D.s.x, D.s.y, D.s.z) * 0.5;
          if (D.p.y < fl) {
            D.p.y = fl; D.v.y *= -K.bounce; D.v.x *= 0.45; D.v.z *= 0.45; D.w.multiplyScalar(0.45);
            if (Math.abs(D.v.y) < 0.5) { D.rest = true; // settle flat: lie on the widest face
              const sx = D.s.x, sy = D.s.y, sz = D.s.z; D.r.set(0, D.r.y, 0);
              if (kind === 'leaf' || kind === 'plastic' || kind === 'clay') D.r.x = -Math.PI / 2 + rnd(0.2);
              else if (sy > sx && sy > sz) D.r.z = Math.PI / 2;   // long along y (a twig): laid down
              D.p.y = gnd + (kind === 'leaf' ? 0.012 : Math.min(sx, sy, sz) * 0.5 + 0.004); }
          }
        }
        // sinking away at the end (into the grass) rather than popping out
        const fade = D.life < 1.2 ? D.life / 1.2 : 1;
        dQ.setFromEuler(dE.set(D.r.x, D.r.y, D.r.z));
        dS.copy(D.s).multiplyScalar(fade);
        P.im.setMatrixAt(i, dM.compose(D.p, dQ, dS));
      }
      P.im.instanceMatrix.needsUpdate = true;
      if (!any) P.live = 0;
    }
  }
  function debClear() { for (const kind in DEB) { const P = DEB[kind]; for (let i = 0; i < P.K.n; i++) { P.d[i].life = 0; P.d[i].pend = null; P.im.setMatrixAt(i, dM.makeScale(0, 0, 0)); } P.im.instanceMatrix.needsUpdate = true; P.live = 0; } }
  // make every pool now (so no material is compiled the moment the first thing breaks)
  for (const k in DEB_KIND) debPool(k);
  const tv = new THREE.Vector3(), tq = new THREE.Quaternion(), Z = new THREE.Vector3(0, 0, 1);
  const F = {
    _noW: 0,
    debris,
    debPools: DEB,   // (for tests)
    lights,
    update(dt, cam) {
      if (!pooled) { pool(); if (!pooled && ++F._noW > 120) { pooled = true; for (const l of fxLights) scene.add(l); } }
      glow.update(dt); smoke.update(dt); bits.update(dt); debUpdate(dt); holeUpdate(dt);
      if (!F._lights) { F._lights = {}; scene.traverse(o => { if (o.isHemisphereLight) F._lights.hemi = o; else if (o.isDirectionalLight && o.castShadow) F._lights.sun = o; }); }
      { const { hemi, sun } = F._lights, a = AMB.value; a.setRGB(0.12, 0.12, 0.13);
        if (hemi) a.setRGB(hemi.color.r, hemi.color.g, hemi.color.b).multiplyScalar(hemi.intensity * 1.1);
        if (sun) { a.r += sun.color.r * sun.intensity * 0.2; a.g += sun.color.g * sun.intensity * 0.2; a.b += sun.color.b * sun.intensity * 0.2; }
        const fire = held.reduce((m, h) => Math.max(m, h.cur), 0) * 0.02;   // a fire nearby lights its own smoke orange
        a.r = Math.min(1.0, Math.max(0.1, a.r + fire)); a.g = Math.min(1.0, Math.max(0.1, a.g + fire * 0.55)); a.b = Math.min(1.0, Math.max(0.1, a.b + fire * 0.2)); }
      for (const L of lights) { if (L.t > 0) { L.t -= dt; L.l.intensity = Math.max(0, L.t / L.dur) ** 1.5 * L.peak; } else if (L.l.intensity) L.l.intensity = 0; }
      for (const H of held) {
        if (H.hold > 0) { H.hold -= dt; const tgt = H.peak * (0.75 + 0.45 * Math.random()); H.cur += (tgt - H.cur) * Math.min(1, dt * 18); }
        else { H.cur *= Math.exp(-dt * 6); if (H.cur < 0.02) { H.cur = 0; H.key = null; H.peak = 0; } }
        H.l.intensity = H.cur;
      }
      for (const f of flashes) if (f.t > 0) { f.t -= dt; if (f.t <= 0) f.g.visible = false; }
      for (const T of tracers) {
        if (!T.m.visible) continue;
        T.s += dt * T.speed;
        const head = Math.min(T.s, T.L), tail = Math.max(0, head - T.len);
        if (T.s - T.len > T.L) { T.m.visible = false; continue; }
        T.m.position.copy(T.o).addScaledVector(T.d, head);
        T.m.scale.set(T.w, T.w, Math.max(0.01, head - tail));
      }
      for (const s of shells) {
        if (s.life <= 0) continue;
        s.life -= dt; if (s.life <= 0) { s.m.visible = false; continue; }
        if (s.rest) continue;
        s.v.y -= 9.8 * dt; s.m.position.addScaledVector(s.v, dt); s.m.rotation.x += s.w.x * dt; s.m.rotation.y += s.w.y * dt; s.m.rotation.z += s.w.z * dt;
        if (s.m.position.y < 0.005) { s.m.position.y = 0.005; s.v.y *= -0.35; s.v.x *= 0.5; s.v.z *= 0.5; s.w.multiplyScalar(0.5); s.bounced++; if (s.bounced === 1 && F.onShellLand) F.onShellLand(s.m.position, !!s.big); if (Math.abs(s.v.y) < 0.4) { s.rest = true; s.m.rotation.set(0, Math.random() * 6, Math.PI / 2 * (Math.random() < 0.5 ? 0 : 1)); s.m.rotation.x = 0; } }
      }
      for (const c of chunks) {
        if (c.life <= 0) continue;
        c.life -= dt; if (c.life <= 0) { c.m.visible = false; continue; }
        c.v.y -= 9.8 * dt; c.m.position.addScaledVector(c.v, dt); c.m.rotation.x += c.w.x * dt; c.m.rotation.y += c.w.y * dt;
        if (c.m.position.y < 0.05) { c.m.position.y = 0.05; c.v.y *= -0.25; c.v.x *= 0.5; c.v.z *= 0.5; c.w.multiplyScalar(0.4); }
        if (c.life < 0.6) c.m.scale.setScalar(c.life / 0.6 * c.size);
        if (Math.random() < 0.3 && c.v.lengthSq() > 4) smoke.emit(c.m.position.x, c.m.position.y, c.m.position.z, 0, 0.2, 0, 0.8, 0.15, 0.5, 0.18, 0.16, 0.14, 0.5, -0.1, 1);
      }
      for (const B of balls) {
        if (B.t >= 1) continue;
        B.t += dt / 0.55;
        const k = Math.min(1, B.t);
        B.b.scale.setScalar(B.size * (0.4 + Math.sqrt(k) * 0.9)); B.b.material.opacity = (1 - k) ** 2 * 0.9;
        B.b.material.color.setRGB(1, 0.65 - k * 0.4, 0.25 - k * 0.2);
        B.r.scale.setScalar(B.size * (0.5 + k * 4.5)); B.r.material.opacity = (1 - k) * 0.35;
        if (k >= 1) { B.b.visible = false; B.r.visible = false; }
      }
      void cam;
    },
    muzzle(p, dir, size = 1, light = true) {
      const f = flashes[fi++ % flashes.length];
      f.g.position.copy(p); tq.setFromUnitVectors(Z, dir); f.g.quaternion.copy(tq); f.g.rotateZ(Math.random() * 6.28);
      const s = (0.22 + Math.random() * 0.12) * size; f.g.scale.set(s, s, s * (1.2 + Math.random()));
      f.g.visible = true; f.t = 0.035;
      if (light) flashLight(p, 6 * size, 0.06, 9 * size);
      for (let i = 0; i < 4 * size; i++) smoke.emit(p.x, p.y, p.z, dir.x * 1.5 + rnd(0.3), dir.y * 1.5 + 0.3 + rnd(0.2), dir.z * 1.5 + rnd(0.3), 0.9 + Math.random() * 0.6, 0.06, 0.45 * size, 0.7, 0.68, 0.64, 0.18, -0.15, 2.2);
      for (let i = 0; i < 3; i++) glow.emit(p.x, p.y, p.z, dir.x * 8 + rnd(2), dir.y * 8 + rnd(2), dir.z * 8 + rnd(2), 0.06, 0.04, 0.01, 1, 0.7, 0.3, 1, 0, 0);
    },
    tracer(o, d, L, { speed = 420, w = 1, len = 4 } = {}) {
      const T = tracers[ti++ % tracers.length];
      T.o.copy(o); T.d.copy(d); T.L = L; T.s = Math.random() * 4; T.speed = speed; T.w = w; T.len = len;
      tq.setFromUnitVectors(Z, d); T.m.quaternion.copy(tq);
      T.m.visible = true;
    },
    // kind: false/'pistol' a 9mm case, true/'hull' a red shotgun hull, 'rifle' a long rifle case
    shell(p, dir, red = false) {
      const s = shells[si++ % shells.length], hull = red === true || red === 'hull', rifle = red === 'rifle';
      s.m.material = hull ? shellRed : shellMat; s.big = hull || rifle;
      if (hull) s.m.scale.set(2.6, 2.4, 2.4); else if (rifle) s.m.scale.set(2.9, 1.35, 1.35); else s.m.scale.setScalar(1);
      s.m.position.copy(p); s.v.copy(dir).multiplyScalar(2 + Math.random() * 1.5); s.v.y += 1.5 + Math.random();
      s.w.set(rnd(30), rnd(30), rnd(30)); s.life = 6; s.rest = false; s.bounced = 0; s.m.visible = true;
    },
    impact(p, n, mat = 'dirt', big = 1, opt = null) {
      const c = surf[mat] || surf.dirt;
      if (mat !== 'flesh' && !(opt && opt.nohole)) hole(p, n, mat, big);   // [realism]
      if (mat === 'metal' || mat === 'barrel' || mat === 'alu') {
        for (let i = 0; i < 10 * big; i++) glow.emit(p.x, p.y, p.z, n.x * 3 + rnd(3), n.y * 3 + rnd(3) + 1, n.z * 3 + rnd(3), 0.15 + Math.random() * 0.25, 0.03, 0.01, 1, 0.8, 0.45, 1, 9.8, 0.5);
        flashLight(p, 1.5, 0.04, 4, 0xffd090);
      }
      if (mat === 'flesh') {
        for (let i = 0; i < 6; i++) smoke.emit(p.x, p.y, p.z, n.x * 1 + rnd(0.5), rnd(0.5), n.z * 1 + rnd(0.5), 0.5, 0.05, 0.25, 0.45, 0.42, 0.36, 0.35, 0, 3);
        return;
      }
      const soft = mat === 'dirt' || mat === 'grass' || mat === 'mud' || mat === 'sand';
      for (let i = 0; i < (soft ? 9 : 6) * big; i++) bits.emit(p.x, p.y, p.z, n.x * 2.5 + rnd(1.5), n.y * 2.5 + 1.5 + Math.random() * (soft ? 3 : 1.5), n.z * 2.5 + rnd(1.5), 0.6 + Math.random() * 0.5, 0.025, 0.02, c[0] * 0.8, c[1] * 0.8, c[2] * 0.8, 1, 9.8, 0.4);
      for (let i = 0; i < (soft ? 5 : 4) * big; i++) smoke.emit(p.x + n.x * 0.05, p.y + n.y * 0.05, p.z + n.z * 0.05, n.x * 0.9 + rnd(0.4), n.y * 0.9 + 0.4 + rnd(0.3), n.z * 0.9 + rnd(0.4), 0.9 + Math.random() * 0.9, 0.1, 0.55 * big, c[0], c[1], c[2], 0.55, -0.1, 2.0);
      if (mat === 'wood' || mat === 'plank' || mat === 'paper') for (let i = 0; i < 5; i++) bits.emit(p.x, p.y, p.z, n.x * 2 + rnd(1.5), rnd(1.5) + 1, n.z * 2 + rnd(1.5), 0.8, 0.035, 0.02, 0.7, 0.58, 0.4, 1, 9.8, 0.6);
    },
    explosion(p, power = 1, opts = {}) {
      const B = balls[bi++ % balls.length]; B.t = 0; B.size = 1.8 * power; B.b.position.copy(p); B.b.position.y = Math.max(p.y, 0.6 * power); B.r.position.set(p.x, 0.05, p.z); B.b.visible = true; B.r.visible = true;
      flashLight(tv.copy(p).setY(p.y + 1.2), 60 * power, 0.35, 34 * power, 0xffa050);
      for (let i = 0; i < 70 * power; i++) { const a = Math.random() * 6.28, u = Math.random(), sp = 3 + Math.random() * 9 * power; glow.emit(p.x, p.y + 0.3, p.z, Math.cos(a) * sp * (1 - u * 0.5), Math.random() * 7 * power, Math.sin(a) * sp * (1 - u * 0.5), 0.25 + Math.random() * 0.45, 0.4 * power, 0.9 * power, 1, 0.5 + Math.random() * 0.3, 0.12, 1, 2, 3); }
      for (let i = 0; i < 26 * power; i++) glow.emit(p.x, p.y + 0.2, p.z, rnd(12), 3 + Math.random() * 14, rnd(12), 0.6 + Math.random() * 0.8, 0.05, 0.02, 1, 0.75, 0.35, 1, 9.8, 0.3);
      // the smoke column rises and spreads, dirt rains back down
      for (let i = 0; i < 45 * power; i++) { const a = Math.random() * 6.28, r = Math.random() * 2 * power; smoke.emit(p.x + Math.cos(a) * r, p.y + 0.3 + Math.random() * 1.5 * power, p.z + Math.sin(a) * r, Math.cos(a) * (1 + Math.random() * 3), 1.5 + Math.random() * 5 * power, Math.sin(a) * (1 + Math.random() * 3), 3 + Math.random() * 4, 0.8 * power, 3.5 * power, 0.16 + Math.random() * 0.06, 0.14 + Math.random() * 0.05, 0.12, 0.75, -0.25, 0.9); }
      const dc = surf[opts.mat || 'dirt'] || surf.dirt;
      for (let i = 0; i < 60 * power; i++) bits.emit(p.x + rnd(0.6), p.y + 0.2, p.z + rnd(0.6), rnd(7), 4 + Math.random() * 10 * power, rnd(7), 1.2 + Math.random() * 1.2, 0.06, 0.04, dc[0] * 0.6, dc[1] * 0.6, dc[2] * 0.6, 1, 9.8, 0.2);
      for (let i = 0; i < 12 * power; i++) {
        const c = chunks[ci++ % chunks.length]; c.m.position.set(p.x + rnd(0.4), p.y + 0.3, p.z + rnd(0.4)); c.v.set(rnd(9), 5 + Math.random() * 9, rnd(9)).multiplyScalar(Math.sqrt(power)); c.w.set(rnd(15), rnd(15), 0); c.life = 2.5 + Math.random() * 2; c.size = 0.6 + Math.random() * 1.4; c.m.scale.setScalar(c.size); c.m.visible = true;
      }
    },
    smokePuff(p, n = 1, s = 1, dark = 0.2) { for (let i = 0; i < n; i++) smoke.emit(p.x + rnd(0.4), p.y, p.z + rnd(0.4), rnd(0.3) + 0.4, 1.2 + Math.random() * 1.2, rnd(0.3), 5 + Math.random() * 4, 0.6 * s, 3.2 * s, dark, dark * 0.95, dark * 0.9, 0.55, -0.15, 0.3); },
    fire(p, n = 1) { for (let i = 0; i < n; i++) glow.emit(p.x + rnd(0.35), p.y, p.z + rnd(0.35), rnd(0.2), 1 + Math.random() * 1.2, rnd(0.2), 0.4 + Math.random() * 0.4, 0.35, 0.08, 1, 0.45 + Math.random() * 0.3, 0.1, 0.85, -1, 1.5); },
    column(p) { smoke.emit(p.x + rnd(4), p.y, p.z + rnd(4), rnd(0.6) + 1.2, 4 + Math.random() * 3, rnd(0.6), 22 + Math.random() * 8, 8, 40, 0.18, 0.17, 0.16, 0.6, -0.05, 0.05); },
    rocketTrail(p, d) {
      glow.emit(p.x, p.y, p.z, -d.x * 4 + rnd(0.6), -d.y * 4 + rnd(0.6), -d.z * 4 + rnd(0.6), 0.08, 0.25, 0.05, 1, 0.7, 0.3, 1, 0, 0);
      smoke.emit(p.x, p.y, p.z, rnd(0.3), rnd(0.3) + 0.2, rnd(0.3), 1.6 + Math.random(), 0.15, 1.2, 0.7, 0.68, 0.64, 0.45, -0.1, 1.2);
    },
    backblast(p, d) { for (let i = 0; i < 30; i++) smoke.emit(p.x, p.y, p.z, d.x * (4 + Math.random() * 6) + rnd(1.5), d.y * 4 + rnd(1) + 0.5, d.z * (4 + Math.random() * 6) + rnd(1.5), 1.2 + Math.random() * 1.2, 0.2, 1.6, 0.6, 0.58, 0.55, 0.5, -0.1, 2.5); flashLight(p, 10, 0.12, 10); },
    dust(p, n = 6, c = [0.36, 0.3, 0.22], s = 0.5) { for (let i = 0; i < n; i++) smoke.emit(p.x + rnd(0.3), p.y + 0.05, p.z + rnd(0.3), rnd(0.8), 0.3 + Math.random() * 0.6, rnd(0.8), 1.2 + Math.random(), s * 0.3, s, c[0], c[1], c[2], 0.35, -0.2, 2); },
    // a hit: a spray of dark droplets thrown along the blow, a fine red mist, drops falling to the ground
    blood(p, d, amt = 1) {
      const dx = d ? d.x : 0, dy = d ? d.y : 0, dz = d ? d.z : 0;
      for (let i = 0; i < 22 * amt; i++) { const k = 0.8 + Math.random() * 2.6; bits.emit(p.x, p.y, p.z, dx * k * 1.4 + rnd(1.3), dy * k + rnd(1) + 0.6, dz * k * 1.4 + rnd(1.3), 0.5 + Math.random() * 0.5, 0.022 + Math.random() * 0.02, 0.012, 0.32 + Math.random() * 0.1, 0.015, 0.01, 1, 9.8, 0.3); }
      for (let i = 0; i < 6 * amt; i++) smoke.emit(p.x + rnd(0.05), p.y + rnd(0.05), p.z + rnd(0.05), dx * 0.9 + rnd(0.4), dy * 0.5 + rnd(0.3), dz * 0.9 + rnd(0.4), 0.35 + Math.random() * 0.35, 0.05, 0.32 * amt, 0.34, 0.02, 0.015, 0.55, 0.5, 3.5);
      if (F.onBlood) F.onBlood(p, d, amt);
    },
    // a thrown bottle shattering: glints of glass
    glass(p) { for (let i = 0; i < 26; i++) bits.emit(p.x, p.y + 0.05, p.z, rnd(2.5), 1 + Math.random() * 2.5, rnd(2.5), 0.5 + Math.random() * 0.5, 0.02, 0.012, 0.55, 0.7, 0.6, 1, 9.8, 0.4); for (let i = 0; i < 4; i++) glow.emit(p.x, p.y + 0.05, p.z, rnd(1.5), 1 + Math.random() * 1.5, rnd(1.5), 0.25, 0.02, 0.01, 0.8, 0.9, 0.9, 0.6, 9.8, 0.4); },
    // a pool of burning fuel
    flames(p, r = 1.5, n = 3) {
      // tongues of flame: they lick up fast from the fuel and die within half a metre or so (not floating orbs),
      // the hottest yellow low in the middle, deep orange at the tips
      for (let i = 0; i < n * 2; i++) { const a = Math.random() * 6.28, q = Math.sqrt(Math.random()) * r, edge = q / Math.max(0.1, r); glow.emit(p.x + Math.cos(a) * q, p.y + 0.04, p.z + Math.sin(a) * q, rnd(0.12), 1.8 + Math.random() * 1.8 * (1 - edge * 0.5), rnd(0.12), 0.18 + Math.random() * 0.26 * (1.2 - edge), 0.32 + Math.random() * 0.18, 0.03, 1, 0.38 + (1 - edge) * 0.3 + Math.random() * 0.12, 0.06, 0.85, -0.8, 2.2); } if (Math.random() < 0.35) smoke.emit(p.x + rnd(r * 0.6), p.y + 1.2, p.z + rnd(r * 0.6), rnd(0.3), 1.6 + Math.random(), rnd(0.3), 3 + Math.random() * 2, 0.4, 2.2, 0.1, 0.09, 0.08, 0.55, -0.15, 0.4); holdLight(p, tv.set(p.x, p.y + 0.6, p.z), 4 + r * 2.5, 5 + r * 2.2, 0xff7a2a); },
    // a small flame on a rag or a wick: a few tight tongues of fire and a thread of smoke
    torch(p, s = 1) {
      for (let i = 0; i < 2; i++) glow.emit(p.x + rnd(0.015), p.y, p.z + rnd(0.015), rnd(0.08), 0.5 + Math.random() * 0.5, rnd(0.08), 0.18 + Math.random() * 0.16, 0.1 * s, 0.02 * s, 1, 0.5 + Math.random() * 0.25, 0.12, 0.9, -0.6, 1.5);
      if (Math.random() < 0.25) smoke.emit(p.x, p.y + 0.08, p.z, rnd(0.05), 0.5 + Math.random() * 0.3, rnd(0.05), 1 + Math.random() * 0.6, 0.03, 0.22, 0.12, 0.11, 0.1, 0.35, -0.1, 1);
    },
    holdLight,
    dropLight,
    sparks(p, n = 10) { for (let i = 0; i < n; i++) glow.emit(p.x, p.y, p.z, rnd(3), Math.random() * 3, rnd(3), 0.3, 0.03, 0.01, 1, 0.8, 0.4, 1, 9.8, 0.5); },
    clear() { debClear(); for (let i = 0; i < HOLE_N; i++) { holeD[i].s = 0; holes.setMatrixAt(i, hM.makeScale(0, 0, 0)); } holes.instanceMatrix.needsUpdate = true; holeLive = 0; for (const P of [glow, smoke, bits]) { P.L.fill(0); P.dirty = true; } for (const s of shells) { s.life = 0; s.m.visible = false; } for (const c of chunks) { c.life = 0; c.m.visible = false; } for (const T of tracers) T.m.visible = false; for (const H of held) { H.hold = 0; H.cur = 0; H.key = null; H.l.intensity = 0; } },
  };
  return F;
}
