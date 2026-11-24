// Zombie_Apocalypse — the neighbourhood: Maple Hollow, a quarantined suburb.
// Two streets cross in the middle (Main St runs east–west, Maple Ave north–south). Along them: 22 houses you
// can walk into (living room, kitchen, bedroom, bathroom — every cupboard, fridge and drawer can be searched),
// the QUICK STOP corner store, a gas station, a playground, abandoned and crashed cars, a police roadblock,
// and a quarantine fence round the edge with the woods behind it.
// Everything solid is an oriented box: people are pushed out of them, bullets stop on them, and the zombies'
// route map is built from them. Static geometry is merged per material and per 55 m chunk.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as TX from './tex.js';
import { C } from './state.js';
import { buildCar, CAR_SIZE } from './vehicles.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { breakKit } from './breakgeo.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------- sky
const skyVS = `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`;
const skyFS = `
  uniform vec3 sunDir, zen, hor, sunCol, moonDir; uniform float night, cloud, time; varying vec3 vDir;
  // (Hoskins' hash12: no sin(), so no banding / stripes on GPUs with low-precision sin at large arguments)
  float h(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
  #ifndef OCT
  #define OCT 5
  #endif
  float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < OCT; i++){ s += a * vn(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
  void main(){
    vec3 d = normalize(vDir);
    float up = clamp(d.y, -0.2, 1.0), day = 1.0 - night;
    vec3 col = mix(hor, zen, pow(clamp(up, 0.0, 1.0), 0.5));
    col = mix(col, hor * 0.6, smoothstep(0.0, -0.2, d.y));
    float s = max(dot(d, sunDir), 0.0);
    // the air glows round the sun: a wide warm band along the horizon on its side (strongest at sunrise/sunset),
    // a soft halo, a tight bright corona, then the disc itself
    float low = 1.0 - smoothstep(0.0, 0.55, sunDir.y);
    col += sunCol * exp(-max(d.y, 0.0) * 5.0) * pow(s, 2.5) * (0.12 + low * 0.5) * day;
    col += sunCol * (pow(s, 6.0) * 0.22 + pow(s, 60.0) * 0.5 + pow(s, 900.0) * 2.0) * day;
    float disc = smoothstep(0.99955, 0.9997, s) * day * (1.0 - smoothstep(0.45, 0.9, cloud));
    col += sunCol * disc * 5.0;
    // stars and the moon at night
    vec2 sp = vec2(atan(d.x, d.z) * 180.0, asin(clamp(d.y, -1.0, 1.0)) * 180.0);
    vec2 cell = floor(sp), sf = fract(sp) - 0.5; float hs = h(mod(cell, 1024.0));
    float st = step(0.9975, hs) * smoothstep(0.42, 0.0, length(sf)) * smoothstep(0.0, 0.3, d.y) * night * (1.0 - cloud) * (0.85 + 0.15 * sin(time * 1.3 + hs * 60.0)) * (0.4 + 0.6 * fract(hs * 97.0));
    col += vec3(st) * 0.9;
    // the moon: a big pale disc (about 4 degrees across, so you can't miss it) with dark seas and a few craters,
    // darker toward its rim, in a soft halo; it's drawn over the clouds below, which thin it out / hide it in rain
    float m = max(dot(d, moonDir), 0.0);
    vec3 mu = normalize(cross(moonDir, vec3(0.0, 1.0, 0.0))), mv = cross(mu, moonDir);
    vec2 mq = vec2(dot(d, mu), dot(d, mv)) / 0.036; float mr = length(mq);
    float md = smoothstep(1.0, 0.93, mr) * step(0.0, dot(d, moonDir));
    float maria = 1.0 - 0.32 * smoothstep(0.45, 0.62, vn(mq * 2.1 + 3.7)) - 0.12 * smoothstep(0.5, 0.8, vn(mq * 6.0 + 1.3));
    for (int i = 0; i < 4; i++) { vec2 cc0 = vec2(sin(float(i) * 2.4 + 0.6), cos(float(i) * 3.1 + 0.2)) * 0.55; float cr = length(mq - cc0); maria -= 0.12 * smoothstep(0.16, 0.1, cr) - 0.06 * smoothstep(0.2, 0.16, cr) * smoothstep(0.1, 0.16, cr); }
    float limb = pow(max(1.0 - mr * mr, 0.0), 0.25);
    float ma2 = length(d - moonDir), mUp = smoothstep(-0.02, 0.03, d.y);
    vec3 mcol = (vec3(1.0, 0.98, 0.92) * md * maria * (0.5 + 0.5 * limb) * 1.25
               + vec3(0.62, 0.7, 0.9) * (exp(-ma2 * 16.0) * 0.32 + exp(-ma2 * 4.5) * 0.07)) * night * mUp;
    float moonHide = 0.0;
    // clouds: a layer of drifting cumulus (a few puffs on a clear day, a solid deck in rain), lit on the sun's side,
    // grey underneath, the edges bright when the sun is behind them; they thin out into the haze at the horizon
    if (d.y > -0.02) {
      vec2 q = d.xz / (max(d.y, 0.0) + 0.1) * 0.75 + mod(vec2(time * 0.006, time * 0.0025), 512.0);   // (the drift wraps: no precision loss after hours of play)
      #ifdef ENV
        vec2 wq = q * 0.55;   // (the reflections only need the rough look of the sky)
      #else
        vec2 wq = q * 0.55 + vec2(fbm(q * 0.25), fbm(q * 0.25 + 5.2)) * 1.4;
      #endif
      float n = fbm(wq);
      float n2 = fbm(wq + sunDir.xz * 0.22);   // a step toward the sun: thinner there → the lit side
      float cov = mix(0.5, 0.28, cloud);
      float cd = smoothstep(cov, cov + 0.22 + cloud * 0.25, n) * smoothstep(-0.02, 0.2, d.y);
      float lit = clamp(0.55 + (n - n2) * 5.0, 0.0, 1.0);
      vec3 base = mix(vec3(0.5, 0.53, 0.58), vec3(0.36, 0.37, 0.39), cloud) * mix(1.0, 0.05, night);
      vec3 top = mix(vec3(1.05), sunCol, 0.35) * mix(1.15, 0.7, cloud) * mix(1.0, 0.04, night);
      vec3 cc = mix(base, top, lit * (1.0 - cloud * 0.6));
      cc += sunCol * pow(s, 12.0) * (1.0 - cd) * 1.2 * day;                       // silver lining
      cc += vec3(0.6, 0.65, 0.75) * (pow(m, 14.0) * 0.22 + pow(m, 3.0) * 0.035) * night;   // moonlit edges
      cc = mix(cc, hor, (1.0 - smoothstep(0.0, 0.3, d.y)) * 0.6);                  // far ones fade into the haze
      col = mix(col, cc, cd * mix(0.9, 1.0, cloud));
      moonHide = cd * mix(0.45, 0.97, smoothstep(0.55, 1.05, cloud));
      // under a heavy sky the whole dome greys over between the clouds too
      col = mix(col, base * 1.15, smoothstep(0.5, 1.0, cloud) * 0.55 * smoothstep(-0.02, 0.25, d.y));
    }
    col += mcol * (1.0 - moonHide) * (1.0 - smoothstep(0.95, 1.4, cloud) * 0.85);
    gl_FragColor = vec4(min(col, vec3(6.0)), 1.0);
  }`;

// ---------------------------------------------------------------- static geometry builder
// quads straight into per-material, per-chunk arrays; textures are mapped in world metres (no stretching)
let CH = 55;   // (phones and tablets: bigger chunks, fewer draw calls — set in makeWorld)
let WELD = false;   // phones / tablets: weld the merged quads' shared corners (a third fewer vertices to shade)
class Builder {
  constructor() { this.g = new Map(); }
  arr(key, cx, cz) {
    const k = key + '|' + Math.floor(cx / CH) + ',' + Math.floor(cz / CH);
    let a = this.g.get(k); if (!a) { a = { key, p: [], n: [], uv: [] }; this.g.set(k, a); }
    return a;
  }
  // a, b, c, d: corners in order round the face; n: outward normal; tile: metres per texture repeat; uvs: [[u,v] x4]
  quad(key, a, b, c, d, n, uvs, cx, cz) {
    const A = this.arr(key, cx, cz);
    // wind the triangles to face along n
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const cxp = uy * vz - uz * vy, cyp = uz * vx - ux * vz, czp = ux * vy - uy * vx;
    const flip = cxp * n[0] + cyp * n[1] + czp * n[2] < 0;
    const order = flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
    const P = [a, b, c, d];
    for (const i of order) { A.p.push(P[i][0], P[i][1], P[i][2]); A.n.push(n[0], n[1], n[2]); A.uv.push(uvs[i][0], uvs[i][1]); }
  }
  // an oriented box. faces: fn(face) → material key or null; face ∈ px nx pz nz top bot
  box(x, y0, z, hx, y1, hz, yaw, faces, tiles) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const W = (lx, y, lz) => [x + lx * c + lz * s, y, z - lx * s + lz * c];
    const fx = [c, 0, -s], fz = [s, 0, c];
    const side = (face, p0, p1, n) => {
      const key = faces(face); if (!key) return;
      const t = tiles[key] || 1;
      const tx = [p1[0] - p0[0], 0, p1[2] - p0[2]]; const L = Math.hypot(tx[0], tx[2]) || 1; tx[0] /= L; tx[2] /= L;
      const u0 = (p0[0] * tx[0] + p0[2] * tx[2]) / t, u1 = u0 + L / t, v0 = y0 / t, v1 = y1 / t;
      this.quad(key, [p0[0], y0, p0[2]], [p1[0], y0, p1[2]], [p1[0], y1, p1[2]], [p0[0], y1, p0[2]], n, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], x, z);
    };
    side('pz', W(-hx, 0, hz), W(hx, 0, hz), fz);
    side('nz', W(hx, 0, -hz), W(-hx, 0, -hz), [-fz[0], 0, -fz[2]]);
    side('px', W(hx, 0, hz), W(hx, 0, -hz), fx);
    side('nx', W(-hx, 0, -hz), W(-hx, 0, hz), [-fx[0], 0, -fx[2]]);
    for (const [face, y, ny] of [['top', y1, 1], ['bot', y0, -1]]) {
      const key = faces(face); if (!key) continue;
      const t = tiles[key] || 1, P = [W(-hx, 0, -hz), W(hx, 0, -hz), W(hx, 0, hz), W(-hx, 0, hz)];
      this.quad(key, ...P.map(p => [p[0], y, p[2]]), [0, ny, 0], P.map(p => [p[0] / t, p[2] / t]), x, z);
    }
  }
  tri(key, a, b, c, n, t, cx, cz) {   // a triangle (gable ends), uv by world position
    const T = t || 1, tx = Math.abs(n[0]) > 0.5 ? [0, 0, 1] : [1, 0, 0];
    const uv = p => [(p[0] * tx[0] + p[2] * tx[2]) / T, p[1] / T];
    this.quad(key, a, b, c, c, n, [uv(a), uv(b), uv(c), uv(c)], cx, cz);
  }
  finish(group, MAT) {
    for (const A of this.g.values()) {
      if (!A.p.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(A.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(A.n, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(A.uv, 2));
      const gg = WELD ? mergeVertices(g) : g; if (gg !== g) g.dispose();
      gg.computeBoundingSphere();
      const m = new THREE.Mesh(gg, MAT[A.key] || MAT.concrete);
      const glass = A.key === 'glass' || A.key === 'glassLit' || A.key === 'shopGlass' || A.key === 'frosted';
      m.castShadow = !glass && !A.key.startsWith('road') && A.key !== 'walk' && A.key !== 'drive' && !A.key.startsWith('floor') && !A.key.startsWith('rug');
      m.receiveShadow = true;
      if (glass) m.renderOrder = 2;
      group.add(m);
    }
    this.g.clear();
  }
}

// ---------------------------------------------------------------- the world
export function makeWorld(scene, renderer) {
  const W = {
    boxes: [], containers: [], doors: [], houses: [], lamps: [], cars: [], emitters: [], spawns: [], props: [], decals: [],
    roofs: [], hazards: [], anims: [],   // roofs you can walk on; places that hurt ({ x, z, r, kind, dps, off }); things that move
    bounds: { x0: -112, x1: 112, z0: -112, z1: 112 }, kind: 'town', time: 8, daylight: 1,
  };
  // phones (2) and tablets (1) get the light build: see 'light build' below. Desktop (0): nothing changes.
  const LOW = TX.tier(); W.low = LOW; WELD = !!LOW;
  CH = LOW > 1 ? 110 : LOW ? 80 : 110;   // (desktop: big chunks too — far fewer draw calls, the GPU easily draws the rest)
  const ICELL = LOW ? 40 : 100;   // instanced props: bucket size (phones keep small ones, so far buckets can be culled)
  // ---- point lights. Desktop: each one is a real light in the scene, as always. Phones / tablets: every point light
  // costs every pixel of every lit surface, lit or not — so the world's point lights (rooms, attic, fires, the police
  // car, the store tubes, the maps' lamps) are 'virtual': the game sets them as usual, and each frame the few that
  // matter most where you are are copied onto a small fixed pool of real ones (fixed: no shader ever recompiles).
  const VL = [], VP = [];
  // (desktop pools them too, into a few more real lights: every point light in the scene costs every lit pixel, and a
  // fixed count means adding / switching one never recompiles a shader mid-game)
  const VPN = LOW > 1 ? 2 : LOW ? 3 : 6;
  function addLight(l, parent = null) { if (l.isPointLight && !l.castShadow) { l.userData._vg = parent || level; VL.push(l); return l; } (parent || level).add(l); return l; }
  for (let i = 0; i < VPN; i++) { const l = new THREE.PointLight(0xffffff, 0, 10, 1.7); scene.add(l); VP.push(l); }
  const vpick = [];
  // a virtual light inside a hidden group (an outbreak piece not yet revealed, a sub-group switched off) is off
  const vShown = (l) => { for (let o = l.userData._vg; o && o !== scene; o = o.parent) if (o.visible === false) return false; return true; };
  function poolLights(p) {
    vpick.length = 0;
    for (const l of VL) {
      if (!(l.intensity > 0) || l.visible === false) continue;
      const d = Math.hypot(l.position.x - p.x, l.position.y - p.y, l.position.z - p.z), reach = l.distance || 30;
      if (d > reach + 25 || !vShown(l)) continue;
      l.userData._vs = d / Math.max(4, reach) - Math.min(1, l.intensity / 20) * 0.2;   // close, and within its reach, first
      vpick.push(l);
    }
    vpick.sort((a, b) => a.userData._vs - b.userData._vs);
    for (let i = 0; i < VP.length; i++) {
      const R = VP[i], l = vpick[i];
      if (!l) { if (R.intensity) R.intensity = 0; continue; }
      R.position.copy(l.position); R.color.copy(l.color); R.intensity = l.intensity; R.distance = l.distance; R.decay = l.decay;
    }
  }
  W.vlights = VL;
  // for the other modules: world.addLight(pointLight, parent = scene) — the shared entry point for world-space POINT
  // lights (parent at the origin, unrotated): virtual, pooled as above. Anything else (spots, shadow casters) is added.
  W.addLight = (l, parent = scene) => addLight(l, parent);
  // ---- sky and light ----
  const sunDir = new THREE.Vector3(-0.55, 0.42, -0.72).normalize(), moonDir = new THREE.Vector3(0.4, 0.5, 0.6).normalize();
  const uni = { sunDir: { value: sunDir }, moonDir: { value: moonDir }, zen: { value: new THREE.Color(0x5b6a7a) }, hor: { value: new THREE.Color(0xb9b4a8) }, sunCol: { value: new THREE.Color(0xffd9a8) }, night: { value: 0 }, cloud: { value: 0.6 }, time: { value: 0 } };
  const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({ uniforms: uni, vertexShader: skyVS, fragmentShader: skyFS, side: THREE.BackSide, depthWrite: false, fog: false }));
  dome.renderOrder = -10; dome.frustumCulled = false; scene.add(dome);
  // the reflections: the same sky, re-baked when the look of the sky has changed enough (dawn, blue day, dusk, rain)
  const envScene = new THREE.Scene();
  const envMat = new THREE.ShaderMaterial({ uniforms: { ...uni, night: { value: 0 }, sunCol: { value: new THREE.Color(0xffe4c0) }, sunDir: { value: sunDir.clone() } }, vertexShader: skyVS, fragmentShader: skyFS, side: THREE.BackSide, defines: { ENV: 1, OCT: 3 } });
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), envMat));
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = pmrem.fromScene(envScene, 0, 0.1, 100); scene.environment = envRT.texture;
  let envReuse = true;   // re-bake into the same target (no allocation, no dispose) where this three.js allows it
  scene.environmentIntensity = 0.5;
  function rebakeEnv() {
    envMat.uniforms.night.value = uni.night.value; envMat.uniforms.sunCol.value.copy(uni.sunCol.value); envMat.uniforms.sunDir.value.copy(sunDir);
    if (envReuse) { try { const rt = pmrem.fromScene(envScene, 0, 0.1, 100, { renderTarget: envRT }); if (rt !== envRT) { envReuse = false; const old = envRT; envRT = rt; old.dispose(); } scene.environment = envRT.texture; return; } catch (e) { envReuse = false; } }
    const old = envRT; envRT = pmrem.fromScene(envScene, 0, 0.1, 100); scene.environment = envRT.texture; old.dispose();
  }
  const sun = new THREE.DirectionalLight(0xffe2bc, 2.6);
  const BIGSH = renderer && renderer.capabilities && renderer.capabilities.maxTextureSize >= 8192;
  sun.castShadow = true; sun.shadow.mapSize.set(LOW ? 1024 : BIGSH ? 4096 : 2048, LOW ? 1024 : BIGSH ? 4096 : 2048);
  const SS = LOW ? (LOW > 1 ? 26 : 32) : BIGSH ? 55 : 40;   /* the shadows reach further out (roofs, towers, down the street) */ Object.assign(sun.shadow.camera, { left: -SS, right: SS, top: SS, bottom: -SS, near: 1, far: 260 });
  sun.shadow.bias = -0.0002; sun.shadow.normalBias = LOW ? 0.03 : 0.015;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xb8c4d4, 0x4a4436, 0.6); scene.add(hemi);
  scene.fog = new THREE.FogExp2(0xa8a69e, 0.011);
  W.sun = sun; W.hemi = hemi;

  // ---- materials ----
  const gt = TX.groundTextures();
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, ...o });
  const sidingTex = TX.sidingTexture(3), shingleTex = TX.shingleTexture(4);
  const MAT = {
    road: std({ ...TX.relief(TX.asphaltTexture(), 0.4), roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    // worn road paint: the asphalt shows through in patches and along the tyre tracks
    roadLine: std({ map: TX.roadPaintTexture(15), color: 0xc9b34a, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
    roadWhite: std({ map: TX.roadPaintTexture(16), color: 0xd8d6d0, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
    walk: std({ ...TX.relief(TX.sidewalkTexture(), 0.5), roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    drive: std({ ...TX.relief(TX.concreteTexture(0.95), 0.3), roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
    concrete: std({ ...TX.relief(TX.concreteTexture(), 0.3), roughness: 0.9 }),
    curb: std({ ...TX.relief(TX.concreteTexture(1.1), 0.3), roughness: 0.9 }),
    brick: std({ ...TX.relief(TX.brickTexture(), 1.0), roughness: 0.92 }),
    trim: std({ color: 0xe6e2d8, roughness: 0.6 }),
    shingle0: std({ ...TX.relief(shingleTex, 1.5), color: 0xffffff, roughness: 0.95 }),
    shingle1: std({ ...TX.relief(shingleTex, 1.5), color: 0x9a7f6c, roughness: 0.95 }),
    shingle2: std({ ...TX.relief(shingleTex, 1.5), color: 0x6f7f8c, roughness: 0.95 }),
    floorWood: std({ map: TX.woodFloorTexture(5), roughness: 0.55 }),
    floorCarpet: std({ map: TX.carpetTexture([120, 108, 92], 7), roughness: 1 }),
    floorCarpet2: std({ map: TX.carpetTexture([84, 92, 104], 8), roughness: 1 }),
    floorTile: std({ map: TX.tileTexture('#d8d4cc', '#c8c2b8', 9), roughness: 0.35 }),
    floorTile2: std({ map: TX.tileTexture('#e6e6e6', '#2a2a2a', 10), roughness: 0.35 }),
    plank: std({ map: TX.plankTexture(), roughness: 0.85 }),
    fence: std({ map: TX.plankTexture(), color: 0xb7a58c, roughness: 0.9 }),
    picket: std({ color: 0xdedad0, roughness: 0.7 }),
    bark: std({ ...TX.relief(TX.barkTexture('oak'), 1.4), roughness: 0.95 }),
    leaves: std({ map: TX.leafTexture(3, 'oak'), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85 }),
    leaves2: std({ map: TX.leafTexture(5, 'oak'), color: 0xd8d0b0, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85 }),
    orange: std({ color: 0xe0581a, roughness: 0.6 }),
    stripes: std({ map: (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 32; const g = c.getContext('2d'); for (let i = -2; i < 12; i++) { g.fillStyle = i % 2 ? '#f2f0e8' : '#e0581a'; g.beginPath(); g.moveTo(i * 32, 32); g.lineTo(i * 32 + 32, 0); g.lineTo(i * 32 + 64, 0); g.lineTo(i * 32 + 32, 32); g.fill(); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; return t; })(), roughness: 0.6 }),
    trashBag: std({ color: 0x0e0e10, roughness: 0.28, metalness: 0.1 }),
    can0: std({ color: 0xb8281c, roughness: 0.4, metalness: 0.6 }), can1: std({ color: 0xc8a040, roughness: 0.4, metalness: 0.6 }), can2: std({ color: 0x2a6a3a, roughness: 0.4, metalness: 0.6 }),
    jarGlass: std({ color: 0x8a6a30, roughness: 0.15, metalness: 0.1 }),
    bottle0: std({ color: 0x3a6a8a, roughness: 0.1, metalness: 0.2 }), bottle1: std({ color: 0xd8d0b0, roughness: 0.3 }),
    mirror: std({ color: 0xc0c8cc, roughness: 0.02, metalness: 1 }),
    paperSheet: std({ map: TX.paperTexture(5), roughness: 0.9, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
    leafLitter: std({ map: TX.leafLitterTexture(4), transparent: true, alphaTest: 0.3, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    bikeRed: std({ color: 0x8a1a14, roughness: 0.4, metalness: 0.6 }), bikeBlue: std({ color: 0x1e3a6a, roughness: 0.4, metalness: 0.6 }),
    case0: std({ color: 0x2a3a5a, roughness: 0.5 }), case1: std({ color: 0x5a2a22, roughness: 0.5 }), case2: std({ color: 0x1c1c1c, roughness: 0.45 }),
    hedge: std({ map: TX.leafTexture(7, 'hedge'), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 }),
    needles: std({ map: TX.leafTexture(9, 'pine'), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 }),
    leafCore: std({ color: 0x1e2a14, roughness: 1 }),
    // house window glass: clear, faintly blue-green, catching the sky (not a dark mirror)
    glass: new THREE.MeshStandardMaterial({ color: 0xb8c6cc, roughness: 0.05, metalness: 0.0, transparent: true, opacity: 0.24, depthWrite: false, envMapIntensity: 1.4 }),
    glassLit: new THREE.MeshStandardMaterial({ color: 0xb8c6cc, roughness: 0.05, metalness: 0.0, transparent: true, opacity: 0.24, depthWrite: false, envMapIntensity: 1.4, emissive: 0xffb866, emissiveIntensity: 0 }),
    frosted: new THREE.MeshStandardMaterial({ color: 0xdfe6e8, roughness: 0.6, metalness: 0.0, transparent: true, opacity: 0.86, depthWrite: false }),
    shopGlass: new THREE.MeshStandardMaterial({ color: 0xa8c0c8, roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.2, depthWrite: false, envMapIntensity: 1.6, side: THREE.DoubleSide }),
    alu: std({ color: 0xa8acb0, roughness: 0.35, metalness: 0.8 }),
    porchOn: std({ color: 0xe8dcc0, roughness: 0.2, emissive: 0xffd8a0, emissiveIntensity: 0 }), porchOff: std({ color: 0xb8b4a8, roughness: 0.2 }),
    fixture: std({ color: 0xf4f2ec, roughness: 0.3, emissive: 0xfff2d8, emissiveIntensity: 0 }),
    lampShade: std({ color: 0xe8dcc0, roughness: 0.9, side: THREE.DoubleSide, emissive: 0xffd8a0, emissiveIntensity: 0 }),
    chrome: std({ color: 0xd8dadc, roughness: 0.12, metalness: 1 }),
    screen: std({ color: 0x050608, roughness: 0.15, metalness: 0.3 }),
    ceramicDS: std({ color: 0xeeeae2, roughness: 0.3, side: THREE.DoubleSide }), porcelainDS: std({ color: 0xf0eeea, roughness: 0.2, metalness: 0.05, side: THREE.DoubleSide }),
    // casts a shadow but is never drawn: the top of a ceiling, a roof while you're under it
    shadowOnly: new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, shadowSide: THREE.DoubleSide }),
    metal: std({ color: 0x8a8c8e, roughness: 0.45, metalness: 0.8 }),
    darkMetal: std({ color: 0x2a2c2e, roughness: 0.5, metalness: 0.7 }),
    rust: std({ color: 0x5a3a24, roughness: 0.8, metalness: 0.4 }),
    black: std({ color: 0x141414, roughness: 0.6 }),
    white: std({ color: 0xd8d6d0, roughness: 0.45 }),
    appliance: std({ color: 0xcfcdc8, roughness: 0.25, metalness: 0 }),   // enamel
    counter: std({ map: TX.concreteTexture(1.25), color: 0xc8c0b0, roughness: 0.35 }),
    // painted / stained cabinet wood: a fine grain, no board seams
    cabinet: std({ map: TX.cabinetTexture([226, 214, 190], 13), roughness: 0.6 }),
    darkWood: std({ map: TX.cabinetTexture([128, 92, 64], 14), roughness: 0.5 }),
    mattress: std({ color: 0xe0dcd2, roughness: 0.95 }),
    ceiling: std({ color: 0xf0ede6, roughness: 0.95 }),   // flat painted drywall
    porcelain: std({ color: 0xf0eeea, roughness: 0.2, metalness: 0.05 }),
    shelfMetal: std({ color: 0xb8b8b4, roughness: 0.5, metalness: 0.6 }),
    redPaint: std({ color: 0xa3221a, roughness: 0.45, metalness: 0 }),
    yellowPaint: std({ color: 0xd8a820, roughness: 0.45, metalness: 0 }),
    bluePaint: std({ color: 0x2a4a8a, roughness: 0.45, metalness: 0 }),
    greenPaint: std({ color: 0x3a6a3a, roughness: 0.6 }),
    rubber: std({ color: 0x161616, roughness: 0.9 }),
    // chain link: woven diamonds of galvanised wire (a small alpha-tested texture, not a wireframe)
    chainlink: new THREE.MeshStandardMaterial({ map: TX.chainLinkTexture(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.45, metalness: 0.6 }),
    dirt: std({ map: gt.dirt, roughness: 1 }),
    mulch: std({ map: gt.dirt, color: 0x9a6a44, roughness: 1 }),
    gravel: std({ map: TX.gravelTexture(), roughness: 1 }),
  };
  // house colours: siding tints, interior paint
  const SIDING = [0xdcd8cc, 0xb8c4c8, 0xc8b89a, 0x9fae9a, 0xd8cdb4, 0xa9a49a, 0xc29c84, 0x8c9aa8];
  SIDING.forEach((c, i) => { MAT['siding' + i] = std({ ...TX.relief(sidingTex, 1.2), color: c, roughness: 0.8 }); });
  // curtains: soft plain cloth hanging in folds (a clean weave, not the blotchy upholstery texture stretched big)
  [0xd8ccb0, 0x8a9a84, 0x7a8aa4, 0xa86a50, 0xb0a490].forEach((c, i) => { MAT['curtain' + i] = std({ ...TX.relief(sidingTex, 0.5), color: c, roughness: 0.95 }); });
  // shutters: clean painted wood (a lived-in house, not a ruin)
  [0x2f3d2c, 0x3a2a22, 0x2a2e34, 0x2a3e5c].forEach((c, i) => { MAT['shutter' + i] = std({ ...TX.relief(sidingTex, 0.6), color: c, roughness: 0.6 }); });
  const PAINT = ['#d8ccb4', '#c8d0c4', '#d4c4b8', '#bcc4cc', '#e0d8c4', '#c4b8a8'];
  PAINT.forEach((c, i) => { MAT['paint' + i] = std({ map: TX.wallpaperTexture(20 + i, c), roughness: 0.9 }); });
  const FABRIC = [[96, 104, 120], [120, 84, 70], [70, 90, 70], [130, 120, 100], [60, 60, 70]];
  FABRIC.forEach((c, i) => { MAT['fabric' + i] = std({ map: TX.fabricTexture(c, 11 + i), roughness: 1 }); });
  const BOOKS = [0x7a2a22, 0x2a4a6a, 0x3a5a2a, 0x6a5a2a, 0x4a2a4a, 0x8a7a5a];
  BOOKS.forEach((c, i) => { MAT['book' + i] = std({ color: c, roughness: 0.8 }); });
  const CARS = ['#6b7a86', '#7a1e1a', '#d8d6d0', '#1e2a3a', '#2e3a2a', '#8a8070', '#3a3a3c', '#7a6a48'];
    // car paint: a coloured base under a glossy clearcoat (not tinted metal)
  const carPaintM = (c, seed) => new THREE.MeshPhysicalMaterial({ map: TX.carPaintTexture(c, seed), metalness: 0.1, roughness: 0.45, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.2 });
  CARS.forEach((c, i) => { MAT['car' + i] = carPaintM(c, 30 + i); });
  MAT.carWhite = carPaintM('#d8d8d4', 50);
  MAT.carBlack = carPaintM('#18191b', 51);
  MAT.rug0 = std({ map: TX.carpetTexture([120, 50, 40], 41), roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 });
  MAT.rug1 = std({ map: TX.carpetTexture([60, 70, 100], 42), roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 });
  // store bits: louvred light diffusers, a cigarette rack, an awning, the ice chest, pegboard, ceiling tiles
  const ctex = (w, h, fn, rep2 = null) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; fn(cv.getContext('2d'), w, h, TX.rng(w * 7 + h)); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; if (rep2) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...rep2); } return t; };
  MAT.louvre = ctex(256, 128, (g) => { g.fillStyle = '#fbfaf4'; g.fillRect(0, 0, 256, 128); g.fillStyle = '#b8b8b0'; for (let x = 0; x < 256; x += 16) g.fillRect(x, 0, 4, 128); for (let y = 0; y < 128; y += 32) g.fillRect(0, y, 256, 4); g.fillRect(0, 0, 256, 8); g.fillRect(0, 120, 256, 8); });
  MAT.cigs = std({ map: ctex(256, 128, (g, w2, h2, R) => { g.fillStyle = '#2a2a2a'; g.fillRect(0, 0, 256, 128); const C2 = ['#e8e4dc', '#c82a20', '#2a4a9a', '#d8b040', '#2a6a3a', '#f0f0f0']; for (let y = 4; y < 124; y += 24) for (let x = 4; x < 252; x += 14) { g.fillStyle = C2[Math.floor(R() * C2.length)]; g.fillRect(x, y, 12, 20); g.fillStyle = '#ffffff'; g.fillRect(x + 2, y + 4, 8, 3); } g.fillStyle = '#d8c020'; g.fillRect(0, 118, 256, 10); }), roughness: 0.6 });
  MAT.awning = std({ map: ctex(64, 8, (g) => { g.fillStyle = '#a8201a'; g.fillRect(0, 0, 64, 8); g.fillStyle = '#f0ece2'; g.fillRect(32, 0, 32, 8); }, [16, 1]), roughness: 0.85, side: THREE.DoubleSide });
  MAT.ice = std({ map: TX.labelTexture(['ICE'], '#e8eef4', '#2050a0', 256, 128, 'bold 80px Helvetica'), roughness: 0.4 });
  MAT.pegboard = std({ map: ctex(256, 256, (g) => { g.fillStyle = '#c8b898'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#5a4a38'; for (let y = 16; y < 256; y += 32) for (let x = 16; x < 256; x += 32) { g.beginPath(); g.arc(x, y, 5.6, 0, 7); g.fill(); } }, [12, 2]), roughness: 0.8 });
  MAT.ceilTile = std({ map: ctex(256, 256, (g, w2, h2, R) => { g.fillStyle = '#ecebe5'; g.fillRect(0, 0, 256, 256); for (let k = 0; k < 4160; k++) { g.fillStyle = `rgba(90,90,80,${0.08 + R() * 0.12})`; g.fillRect(R() * 256, R() * 256, 1 + R() * 2, 1 + R() * 2); } g.fillStyle = '#a8a8a2'; g.fillRect(0, 0, 256, 6); g.fillRect(0, 0, 6, 256); }, [1, 1]), roughness: 0.95 });   // (repeating: it's tiled in world metres)
  // small paintings for the walls (a sky, hills, a field, sometimes a sun or a tree), and a kitchen clock face
  for (let i = 0; i < 4; i++) {
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 96; const g = cv.getContext('2d');
    const sky = [['#7fa4c8', '#e8dcc0'], ['#e8a070', '#f4dca8'], ['#5a6a88', '#b8b4b0'], ['#9cc0d8', '#f0eee0']][i];
    const gr = g.createLinearGradient(0, 0, 0, 60); gr.addColorStop(0, sky[0]); gr.addColorStop(1, sky[1]); g.fillStyle = gr; g.fillRect(0, 0, 128, 96);
    if (i % 2) { g.fillStyle = 'rgba(255,240,200,0.9)'; g.beginPath(); g.arc(90, 30, 9, 0, 7); g.fill(); }
    for (let k = 0; k < 3; k++) { g.fillStyle = ['#5a7048', '#4a6038', '#6a7a40', '#3e5232'][(i + k) % 4]; g.beginPath(); g.moveTo(0, 96); for (let x = 0; x <= 128; x += 8) g.lineTo(x, 52 + k * 12 + Math.sin(x * 0.05 + i * 2 + k) * 8); g.lineTo(128, 96); g.fill(); }
    if (i !== 1) { g.fillStyle = '#2e3a22'; g.beginPath(); g.arc(30 + i * 12, 54, 10, 0, 7); g.fill(); g.fillRect(29 + i * 12, 54, 3, 14); }
    for (let k = 0; k < 400; k++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},0.05)`; g.fillRect(Math.random() * 128, Math.random() * 96, 2, 2); }   // brush texture
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; MAT['art' + i] = std({ map: t, roughness: 0.7 });
  }
  { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d');
    g.fillStyle = '#f4f2ea'; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill(); g.strokeStyle = '#222'; g.lineCap = 'round';
    for (let k = 0; k < 12; k++) { const a = k / 12 * 6.283; g.lineWidth = k % 3 ? 2 : 4; g.beginPath(); g.moveTo(64 + Math.sin(a) * 50, 64 - Math.cos(a) * 50); g.lineTo(64 + Math.sin(a) * 58, 64 - Math.cos(a) * 58); g.stroke(); }
    g.lineWidth = 5; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.sin(0.3 * 6.283) * 30, 64 - Math.cos(0.3 * 6.283) * 30); g.stroke();   // ten-thirty
    g.lineWidth = 3; g.beginPath(); g.moveTo(64, 64); g.lineTo(64, 64 + 46); g.stroke();
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; MAT.clockFace = std({ map: t, alphaTest: 0.5, roughness: 0.4 }); }
  // ---- shading touches that cost nothing per object: baked contact darkening and living foliage ----
  // (world-space tricks in the materials' shaders, so the merged town and the instanced props get them for free)
  const FOL = { fTime: { value: 0 }, fSun: { value: new THREE.Vector3(0, 1, 0) }, fSunCol: { value: new THREE.Color(0) } };
  W.FOL = FOL;
  const chainCompile = (m, fn) => { const prev = m.onBeforeCompile; m.onBeforeCompile = (sh, r) => { if (prev && prev !== THREE.Material.prototype.onBeforeCompile) prev(sh, r); fn(sh); }; m.customProgramCacheKey = () => m.userData.pk; };
  // walls darken where they meet the ground (outside) or the floor and the ceiling (inside) — the light that
  // bounces round a room doesn't reach into its corners. Only on upright faces: a slab or a step stays as it is.
  function contactAO(m, kind) {
    m.userData.pk = 'cao' + kind;
    chainCompile(m, sh => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vCao;')
        .replace('#include <project_vertex>', `#include <project_vertex>
          { mat4 caoM = modelMatrix;
            #ifdef USE_INSTANCING
              caoM = modelMatrix * instanceMatrix;
            #endif
            vCao = vec2((caoM * vec4(transformed, 1.0)).y, abs(normalize(mat3(caoM) * objectNormal).y)); }`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vCao;')
        .replace('#include <aomap_fragment>', `#include <aomap_fragment>
          { float y = vCao.x, up = 1.0 - smoothstep(0.35, 0.8, vCao.y);
            ${kind === 'int'
              ? 'float k = mix(0.5, 1.0, smoothstep(0.0, 0.55, y - 0.03)) * mix(1.0, 0.66, smoothstep(2.25, 2.68, y) * (1.0 - step(2.74, y)));'
              : 'float k = mix(0.5, 1.0, smoothstep(0.0, 0.85, y));'}
            k = mix(1.0, k, up);
            reflectedLight.indirectDiffuse *= k; reflectedLight.indirectSpecular *= k; reflectedLight.directDiffuse *= mix(1.0, k, 0.35); }`);
    });
  }
  for (let i = 0; i < 8; i++) contactAO(MAT['siding' + i], 'ext');
  for (let i = 0; i < 6; i++) contactAO(MAT['paint' + i], 'int');
  for (const k of ['brick', 'concrete', 'fence', 'picket', 'curb', 'bark']) contactAO(MAT[k], 'ext');
  // leaves: every tree its own shade of green, darker deep inside and under the crown, glowing where the sun shines
  // through them, and the whole crown moving in the wind (each clump on its own beat; hedges hardly at all)
  function foliage(m, sway) {
    m.userData.pk = 'fol' + sway; m.alphaToCoverage = true;
    chainCompile(m, sh => {
      Object.assign(sh.uniforms, FOL);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float fTime; varying vec3 vFWP; varying float vFAo; varying vec3 vFTint;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec3 fIp = modelMatrix[3].xyz;
          #ifdef USE_INSTANCING
            fIp = (modelMatrix * instanceMatrix[3]).xyz;
          #endif
          float fH = fract(sin(dot(floor(fIp.xz * 0.37), vec2(12.9898, 78.233))) * 43758.5453);
          vFTint = mix(vec3(0.9, 0.98, 0.82), vec3(1.12, 1.06, 0.86), fH);
          vFAo = mix(0.5, 1.12, clamp(normalize(position).y * 0.5 + 0.55, 0.0, 1.0));
          { float ph = fIp.x * 0.21 + fIp.z * 0.17, gust = 0.6 + 0.4 * sin(fTime * 0.45 + fIp.x * 0.03);
            vec3 wv = vec3(sin(fTime * 1.3 + ph) * 0.7 + sin(fTime * 2.9 + ph * 1.7) * 0.3, 0.0, cos(fTime * 1.1 + ph) * 0.5);
            float flut = sin(fTime * 7.0 + dot(position, vec3(9.1, 7.3, 5.7))) * 0.25;
            transformed += (wv + flut) * ${sway.toFixed(3)} * gust * (position.y * 0.5 + 0.7); }`)
        .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
          { vec4 fw = modelMatrix * vec4(transformed, 1.0);
            #ifdef USE_INSTANCING
              fw = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
            #endif
            vFWP = fw.xyz; }`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 fSun, fSunCol; varying vec3 vFWP; varying float vFAo; varying vec3 vFTint;')
        .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= vFTint;')
        .replace('#include <aomap_fragment>', `#include <aomap_fragment>
          reflectedLight.indirectDiffuse *= vFAo; reflectedLight.directDiffuse *= mix(0.75, 1.0, vFAo);
          { vec3 vd = normalize(vFWP - cameraPosition); float tr = pow(max(dot(vd, fSun), 0.0), 3.0);
            totalEmissiveRadiance += diffuseColor.rgb * fSunCol * (tr * 0.55 + 0.06) * vFAo; }`);
    });
  }
  foliage(MAT.leaves, 0.045); foliage(MAT.leaves2, 0.045); foliage(MAT.needles, 0.025); foliage(MAT.hedge, 0.008);
  W.MAT = MAT;
  // metres per texture repeat for each material
  const TILE = { roadWhite: 1.5, roadLine: 1.5, mulch: 1.2, ceilTile: 0.6, ceiling: 3, road: 6, walk: 1.5, drive: 3, concrete: 3, curb: 1.5, brick: 2, trim: 1, plank: 1.5, fence: 1.5, bark: 1.5, floorWood: 2.4, floorCarpet: 2, floorCarpet2: 2, floorTile: 1.2, floorTile2: 1.2, cabinet: 1, darkWood: 1, counter: 1.5, dirt: 3, gravel: 2, rug0: 2, rug1: 2 };
  for (let i = 0; i < 8; i++) TILE['siding' + i] = 1;
  for (let i = 0; i < 6; i++) TILE['paint' + i] = 2.5;
  for (let i = 0; i < 5; i++) TILE['fabric' + i] = 0.8;
  for (let i = 0; i < 3; i++) TILE['shingle' + i] = 1.4;
  W.TILE = TILE;

  // ---- the ground: lawn grass with worn dirt patches, textured in world space ----
  const MASK_N = 512, MASK_R = 160;
  const maskC = document.createElement('canvas'); maskC.width = maskC.height = MASK_N;
  const maskG = maskC.getContext('2d');
  const maskTex = new THREE.CanvasTexture(maskC); maskTex.wrapS = maskTex.wrapT = THREE.ClampToEdgeWrapping; maskTex.flipY = false;
  const toMask = (x, z) => [(x + MASK_R) / (MASK_R * 2) * MASK_N, (z + MASK_R) / (MASK_R * 2) * MASK_N];
  const rockTx = TX.rockTexture(); rockTx.wrapS = rockTx.wrapT = THREE.RepeatWrapping;
  const gUni = { mask: { value: maskTex }, tGrass: { value: gt.grass }, tDirt: { value: gt.dirt }, tMud: { value: gt.litter }, tRock: { value: rockTx } };
  const groundMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, map: gt.grass });
  groundMat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, gUni);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vWP; varying vec3 vWN; uniform sampler2D mask, tGrass, tDirt, tMud, tRock;
      float hh(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float vn2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(hh(i), hh(i+vec2(1,0)), f.x), mix(hh(i+vec2(0,1)), hh(i+vec2(1,1)), f.x), f.y); }`)
      .replace('#include <map_fragment>', `
        vec2 w = vWP.xz;
        vec4 m = texture2D(mask, (w + ${MASK_R.toFixed(1)}) / ${(MASK_R * 2).toFixed(1)});
        float big = vn2(w * 0.04) * 0.6 + vn2(w * 0.13) * 0.4;
        vec3 gr = mix(texture2D(tGrass, w / 3.1).rgb, texture2D(tGrass, mat2(0.8, -0.6, 0.6, 0.8) * w / 7.3).rgb, smoothstep(0.3, 0.7, vn2(w * 0.09))) * mix(0.78, 1.08, big);
        gr = mix(gr, gr * vec3(1.14, 1.02, 0.72), smoothstep(0.5, 0.85, vn2(w * 0.07 + 9.0)) * 0.35);   // a few dry patches
        vec3 di = texture2D(tDirt, w / 2.6).rgb;
        vec3 mu = texture2D(tMud, w / 2.2).rgb * vec3(0.8, 0.76, 0.7);
        float dirtK = clamp(m.r + (big - 0.5) * 0.35 * step(0.02, m.r), 0.0, 1.0);
        vec3 c = mix(gr, di, smoothstep(0.25, 0.6, dirtK));
        c = mix(c, mu, m.g);
        c *= 1.0 - m.b * 0.75;
        // steep banks (terrain): bare rock, mapped from all three sides so it never stretches down a slope
        { float sl = 1.0 - smoothstep(0.6, 0.8, vWN.y);
          if (sl > 0.002) { vec3 an = abs(vWN); an /= an.x + an.y + an.z;
            vec3 rk = texture2D(tRock, vWP.zy / 3.4).rgb * an.x + texture2D(tRock, vWP.xz / 3.4).rgb * an.y + texture2D(tRock, vWP.xy / 3.4).rgb * an.z;
            c = mix(c, rk * vec3(0.98, 0.93, 0.86) * mix(0.85, 1.05, big), sl); } }
        diffuseColor.rgb *= c;`);
  };
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400).rotateX(-Math.PI / 2), groundMat);
  ground.receiveShadow = true; scene.add(ground);
  ground.userData.y = -0.004;   // a hair under everything laid on it, so road and paving never fight it for depth
  W.ground = ground;
  // the horizon: a near ring of wooded hills (~200 m out) and, behind it, a paler ring fading into the haze. Built
  // from layered low-frequency noise with smooth shading (rolling ridges, not a saw-toothed wall); the fog on them
  // is capped so the skyline always reads, even on a murky day
  const hillRing = (r0, r1, hBase, hVar, seed, cap) => {
    const g = new THREE.CylinderGeometry(r0, r1, 1, 160, 1, true), p = g.attributes.position;
    const R = TX.rng(seed), ph = [R() * 6.28, R() * 6.28, R() * 6.28, R() * 6.28];
    for (let i = 0; i < p.count; i++) {
      const a = Math.atan2(p.getZ(i), p.getX(i));
      const n = Math.sin(a * 3 + ph[0]) * 0.45 + Math.sin(a * 7 + ph[1]) * 0.3 + Math.sin(a * 13 + ph[2]) * 0.16 + Math.sin(a * 29 + ph[3]) * 0.09;
      p.setY(i, p.getY(i) > 0 ? hBase + n * hVar : -8);
    }
    g.computeVertexNormals();
    const m = new THREE.MeshStandardMaterial({ color: 0x2c3524, roughness: 1, side: THREE.BackSide });
    m.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>', `#ifdef USE_FOG
        #ifdef FOG_EXP2
          float fogFactor = 1.0 - exp(- fogDensity * fogDensity * vFogDepth * vFogDepth);
        #else
          float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
        #endif
        gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, min(fogFactor, ${cap.toFixed(2)}));
      #endif`); };
    return new THREE.Mesh(g, m);
  };
  {
    const hills = hillRing(190, 205, 11, 7, 77, 0.8), far = hillRing(232, 246, 17, 9, 78, 0.9);
    hills.add(far); hills.userData.far = far;
    scene.add(hills); W.hills = hills;
  }
  // grass blades round the player (none on paving, in houses or on roads)
  const paved = [];   // [x0, z0, x1, z1]
  const grass = LOW ? buildGrass(scene, (x, z) => density(x, z), LOW > 1 ? 26000 : 42000, LOW > 1 ? 26 : 32) : buildGrass(scene, (x, z) => density(x, z));
  function density(x, z) {
    for (const r of paved) if (x > r[0] && x < r[2] && z > r[1] && z < r[3]) return 0;
    if (W.grassFn) { const v = W.grassFn(x, z); if (v != null) return v; }
    const Bd = W.bounds; if (x < Bd.x0 + 8 || x > Bd.x1 - 8 || z < Bd.z0 + 8 || z > Bd.z1 - 8) return 0.9 * (W.grassK ?? 1);
    const [u, v] = toMask(x, z);
    const i = ((v | 0) * MASK_N + (u | 0)) * 4;
    return (maskData ? clamp(1 - maskData[i] / 255 * 1.6 - maskData[i + 1] / 255 - maskData[i + 2] / 255, 0, 1) * 0.85 : 0.85) * (W.grassK ?? 1);
  }
  let maskData = null;
  function paint(x, z, rad, kind, a = 1) {
    const [u, v] = toMask(x, z), R = rad / (MASK_R * 2) * MASK_N;
    const col = kind === 'dirt' ? '255,0,0' : kind === 'mud' ? '0,255,0' : '0,0,255';
    maskG.globalCompositeOperation = 'lighter';
    const gr = maskG.createRadialGradient(u, v, 0, u, v, R); gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(0.6, `rgba(${col},${a * 0.6})`); gr.addColorStop(1, `rgba(${col},0)`);
    maskG.fillStyle = gr; maskG.beginPath(); maskG.arc(u, v, R, 0, 7); maskG.fill();
    maskG.globalCompositeOperation = 'source-over';
  }
  W.paint = paint;

  // ---- level ----
  let level = new THREE.Group(); scene.add(level);
  let B = new Builder();
  let instLists = new Map();
  // ---- things on shelves you can actually move: slide, knock over, take ----
  W.props = []; const propMoving = []; W.shutCargo = [];
  const pM = new THREE.Matrix4(), pQ = new THREE.Quaternion(), pQ2 = new THREE.Quaternion(), pP = new THREE.Vector3(), pS = new THREE.Vector3(), pAx = new THREE.Vector3();
  function propItem(ref, kind) {
    const it = { ref, kind, taken: false, tipped: false, moved: 0, p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3(1, 1, 1) };
    if (ref.mesh) { it.mesh = ref.mesh; it.base = [ref.mesh.position.clone(), ref.mesh.quaternion.clone(), ref.mesh.scale.clone()]; }
    else { ref.L.ms[ref.i].decompose(it.p, it.q, it.s); it.base = [it.p.clone(), it.q.clone(), it.s.clone()]; }
    W.props.push(it); return it;
  }
  // kit: 'store' → the same labelled stock as the shelves around them; 'med' → pharmacy packs
  function addItems(c, specs, kit = null) {
    if (!c) return; c.items ||= [];
    for (const [k, x, y, z, ry = Math.random() * 6, sc = 1] of specs) {
      const m = mat4(x, y, z, ry, sc, sc, sc); let ref;
      const K = kit ? prodKit() : null, b = Math.floor(Math.random() * 8);
      if (kit === 'med' && (k === 'box' || k === 'carton')) ref = inst(K.medG, K.med[b % 4], m);
      else if (kit === 'med' && (k === 'bottle' || k === 'jar')) ref = inst(K.pillG, K.pill, m);
      else if (K && k === 'can') ref = inst(K.canG, K.can[b], m);
      else if (K && k === 'box') ref = inst(b % 3 ? K.boxG : K.chipsG, b % 3 ? K.box[b] : K.chips[b % 5], m);
      else if (K && k === 'bottle') ref = inst(K.bottleG, K.bottle[b % K.bottle.length], m);
      else if (k === 'can') ref = inst(GEO.can, MAT['can' + Math.floor(Math.random() * 3)], m);
      else if (k === 'jar') ref = inst(GEO.jar, MAT.jarGlass, m);
      else if (k === 'bottle') ref = inst(GEO.bottle, MAT['bottle' + Math.floor(Math.random() * 2)], m);
      else if (k === 'box') ref = inst(GEO.cereal, MAT['book' + Math.floor(Math.random() * 6)], m);
      else if (k === 'book') ref = inst(GEO.item, MAT['book' + Math.floor(Math.random() * 6)], mat4(x, y, z, ry, 1.6, 4.6, 1.5));
      else if (k === 'cloth') ref = inst(GEO.folded, MAT['fabric' + Math.floor(Math.random() * 5)], m);
      else if (k === 'trash') ref = inst(GEO.bag, MAT.trashBag, m);
      else if (k === 'carton') ref = inst(GEO.carton, MAT.white, m);
      else ref = inst(GEO.item, MAT['book' + Math.floor(Math.random() * 6)], m);
      c.items.push(propItem(ref, k === 'trash' ? 'cloth' : k === 'book' ? 'box' : k));
    }
  }
  W.itemPos = (it, out) => it.mesh ? it.mesh.getWorldPosition(out) : out.copy(it.p).setY(it.p.y + 0.06);
  function applyProp(it, p, q, s) {
    if (it.mesh) { it.mesh.position.copy(p); it.mesh.quaternion.copy(q); it.mesh.scale.copy(s); return; }
    const im = it.ref.L.im; if (!im) return;
    pM.compose(p, q, s); im.setMatrixAt(it.ref.i, pM); im.instanceMatrix.needsUpdate = true;
  }
  // how: 'shift' (nudged aside), 'tip' (knocked over), 'take' (lifted out and gone)
  W.moveItem = (it, how, dir = null) => {
    if (it.taken) return;
    const [bp, bq, bs] = it.mesh ? [it.mesh.position.clone(), it.mesh.quaternion.clone(), it.mesh.scale.clone()] : [it.p.clone(), it.q.clone(), it.s.clone()];
    const a = Math.random() * 6.28, d = dir ? dir.clone() : new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    // a loose mesh (a car's cargo, a drawer's contents) moves in its parent's frame: turn the push into that frame
    if (it.mesh && it.mesh.parent) { it.mesh.parent.getWorldQuaternion(pQ).invert(); d.applyQuaternion(pQ); d.y = 0; if (d.lengthSq() > 1e-6) d.normalize(); }
    const to = { p: bp.clone(), q: bq.clone(), s: bs.clone() };
    if (how === 'shift') { to.p.x += d.x * 0.05; to.p.z += d.z * 0.05; to.q.premultiply(pQ.setFromAxisAngle(pAx.set(0, 1, 0), (Math.random() - 0.5) * 0.8)); }
    else if (how === 'tip') { if (it.tipped) return W.moveItem(it, 'shift'); it.tipped = true; to.q.premultiply(pQ.setFromAxisAngle(pAx.set(-d.z, 0, d.x).normalize(), Math.PI / 2 * 0.97)); to.p.x += d.x * 0.04; to.p.z += d.z * 0.04; to.p.y += it.kind === 'box' ? 0.0 : 0.035; }
    else { it.taken = true; to.p.y += 0.12; to.s.multiplyScalar(0.001); }
    propMoving.push({ it, from: { p: bp, q: bq, s: bs }, to, t: 0, dur: how === 'take' ? 0.45 : how === 'tip' ? 0.32 : 0.22, how });
  };
  W.resetProps = () => { if (W.resetBreakables) W.resetBreakables(); propMoving.length = 0; for (const it of W.props) { it.taken = it.tipped = it.res = false; const [p, q, s] = it.base; if (!it.mesh) { it.p.copy(p); it.q.copy(q); it.s.copy(s); } applyProp(it, p, q, s); } };
  function updateProps(dt) {
    for (let i = propMoving.length - 1; i >= 0; i--) {
      const m = propMoving[i]; m.t += dt; const k = Math.min(1, m.t / m.dur);
      const e = m.how === 'tip' ? k * k : m.how === 'take' ? 1 - (1 - k) * (1 - k) : k * (2 - k);
      pP.lerpVectors(m.from.p, m.to.p, e); pQ2.slerpQuaternions(m.from.q, m.to.q, e);
      pS.lerpVectors(m.from.s, m.to.s, m.how === 'take' ? Math.max(0, (k - 0.55) / 0.45) : e);
      if (m.how === 'take' && k < 0.55) pS.copy(m.from.s);
      applyProp(m.it, pP, pQ2, pS);
      if (k >= 1) { if (!m.it.mesh) { m.it.p.copy(m.to.p); m.it.q.copy(m.to.q); m.it.s.copy(m.to.s); } propMoving.splice(i, 1); }
    }
  }
  // ---- the outbreak layer: wrecks, boards on the windows, blood, paint, the roadblock... none of it is there on
  // the Saturday morning before. Each piece is its own group, revealed (out of your sight) as the afternoon goes on.
  let CI = null; W.chaos = []; const chaosKeys = new Map();
  let BRK = null; const ZM = new THREE.Matrix4().makeScale(0, 0, 0);   // (the breakable being built: see 'things that break')
  function chaos(x, z, fn, key = null) {
    let it = key && chaosKeys.get(key);
    if (!it) { it = { x, z, g: new THREE.Group(), B: new Builder(), inst: new Map(), xm: new Map(), boxes: [], containers: [], emitters: [], cars: [], doors: [], hazards: [], shown: true, th: Math.random() }; level.add(it.g); W.chaos.push(it); if (key) chaosKeys.set(key, it); }
    const pl = level, pB = B, pI = instLists, pC = CI, pX = XM; level = it.g; B = it.B; instLists = it.inst; CI = it; XM = it.xm;
    try { fn(); } finally { level = pl; B = pB; instLists = pI; CI = pC; XM = pX; }
    return it;
  }
  const emitter = e => { W.emitters.push(e); if (CI) CI.emitters.push(e); return e; };
  W.setChaos = (it, on) => {
    it.shown = on; it.g.visible = on;
    if (it.onShow) it.onShow(on);
    for (const b of it.boxes) b.off = !on || brkOff(b);
    if (it.boxes.length) navPatch(it.boxes);
    for (const c of it.containers) c.hidden = !on;
    for (const e of it.emitters) e.off = !on;
    for (const h of it.hazards) h.off = !on;
    for (const c of it.cars) c.hidden = !on;
    for (const d of it.doors) {
      const D = d.D;
      if (on) { if (d.broken) { D.broken = true; D.box.off = true; D.obox.off = true; D.fall = null; D.pivot.visible = true; const Hh = D.house, fd = Hh ? (Math.sign(Math.cos(D.yaw) * (D.z - Hh.z) - Math.sin(D.yaw) * (D.x - Hh.x)) || 1) : 1; D.pivot.rotation.x = -Math.PI / 2 * 0.98 * fd; D.pivot.position.y = D.y || 0; } else if (d.open) { D.open = D.want = 1; } }
      else { D.broken = false; D.fall = null; D.pivot.visible = true; D.pivot.rotation.x = 0; D.open = D.want = 0; D.box.off = false; D.hp = D.maxHp; }
    }
  };
  // a normal day: none of it. The aftermath: all of it.
  W.calm = () => { for (const it of W.chaos) W.setChaos(it, false); };
  W.ruin = () => { for (const it of W.chaos) if (!it.shown) W.setChaos(it, true); };
  // show the pieces whose time has come (k: 0..1 through the afternoon) — never in front of your eyes
  const rvA = new THREE.Vector3(), rvB = new THREE.Vector3();
  // never drop a wreck or a barricade on somebody: units = [{x, z}] (or set W.occupants = () => units)
  const occupied = (it, units) => {
    if (!units || !it.boxes.length) return false;
    for (const b of it.boxes) for (const u of units) {
      const p = u.pos || u, dx = p.x - b.x, dz = p.z - b.z; if (dx * dx + dz * dz > (b.r + 0.5) ** 2) continue;
      const lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
      if (Math.abs(lx) < b.hx + 0.4 && Math.abs(lz) < b.hz + 0.4) return true;
    }
    return false;
  };
  W.revealChaos = (k, cam, camDir, units = null) => {
    let n = 0;
    units ||= W.occupants ? W.occupants() : null;
    for (const it of W.chaos) {
      if (it.shown || it.th > k) continue;
      const dx = it.x - cam.x, dz = it.z - cam.z, d = Math.hypot(dx, dz);
      const ahead = (dx * camDir.x + dz * camDir.z) / (d || 1) > -0.2;
      if (d < 140 && ahead && (d < 14 || W.los(rvA.set(cam.x, cam.y, cam.z), rvB.set(it.x, 1.2, it.z)))) continue;
      if (occupied(it, units)) continue;
      W.setChaos(it, true); if (++n > 6) break;
    }
  };
  // instanced props, bucketed per 40 m cell (so each bucket can be frustum-culled); little things (cans, bottles)
  // cast no shadow — at this shadow resolution it would be smaller than a texel anyway
  function inst(geo, mat, m, shadow = true) {
    if (shadow) { if (!geo.boundingSphere) geo.computeBoundingSphere(); if (geo.boundingSphere.radius * m.getMaxScaleOnAxis() < 0.16) shadow = false; }
    const e = m.elements, k = geo.uuid + (Array.isArray(mat) ? mat.map(x => x.uuid).join() : mat.uuid) + (shadow ? 's' : '') + '|' + Math.floor(e[12] / ICELL) + ',' + Math.floor(e[14] / ICELL);
    if (!instLists.has(k)) instLists.set(k, { geo, mat, ms: [], shadow }); const L = instLists.get(k); L.ms.push(m);
    const i = L.ms.length - 1;
    if (BRK) { const part = { L, i, m0: m.clone(), side: !!BRK.side, hide: !!BRK.hideNext }; if (BRK.phase) { BRK.bparts.push(part); m.copy(ZM); } else BRK.parts.push(part); }
    return { L, i };
  }
  // one-off detailed shapes (a toilet bowl, a tap, a couch cushion): transformed and merged per material per chunk
  let XM = new Map();
  const XKEEP = ['position', 'normal', 'uv'];
  function xadd(geo, mat, m, shadow = true) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (!XKEEP.includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.applyMatrix4(m);
    if (m.determinant() < 0) for (const k of XKEEP) { const a = g.attributes[k], n = a.itemSize, A = a.array; for (let i = 0; i + 2 < a.count; i += 3) for (let q = 0; q < n; q++) { const t = A[(i + 1) * n + q]; A[(i + 1) * n + q] = A[(i + 2) * n + q]; A[(i + 2) * n + q] = t; } }
    const e = m.elements, k = mat.uuid + (shadow ? 's' : '') + '|' + Math.floor(e[12] / CH) + ',' + Math.floor(e[14] / CH);
    if (!XM.has(k)) XM.set(k, { mat, shadow, geos: [] });
    XM.get(k).geos.push(g);
  }
  function flushX(map, group) {
    for (const { mat, shadow, geos } of map.values()) { const mm = new THREE.Mesh(mergeGeometries(geos), mat); mm.castShadow = shadow; mm.receiveShadow = true; mm.geometry.computeBoundingSphere(); group.add(mm); }
    map.clear();
  }
  // build fn's geometry into a group of its own (merged and instanced just like the town), so it can be shown or
  // hidden as one: an attic's insides, a garage that stands until the outbreak
  function sub(fn, parent = level) {
    const g = new THREE.Group(); parent.add(g);
    const pl = level, pB = B, pI = instLists, pX = XM; level = g; B = new Builder(); instLists = new Map(); XM = new Map();
    try { fn(); } finally {
      B.finish(g, MAT); flushX(XM, g);
      for (const L of instLists.values()) { const { geo, mat, ms, shadow } = L; const im = new THREE.InstancedMesh(geo, mat, ms.length); ms.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = shadow; im.receiveShadow = true; im.computeBoundingSphere(); g.add(im); L.im = im; }
      level = pl; B = pB; instLists = pI; XM = pX;
    }
    return g;
  }
  const tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3(), tmpE = new THREE.Euler();
  const mat4 = (x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) => { tmpQ.setFromEuler(tmpE.set(rx, ry, rz, 'YXZ')); return new THREE.Matrix4().compose(tmpP.set(x, y, z), tmpQ, tmpS.set(sx, sy, sz)); };
  const mesh = (geo, mat, x, y, z, ry = 0, shadow = true, parent = level) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = shadow; m.receiveShadow = true; parent.add(m); return m; };
  // solid boxes: centre x z, half sizes, yaw, top y1, bottom y0, surface (for impacts and footsteps)
  function solid(x, z, hx, hz, yaw, y1, mat = 'concrete', y0 = 0, extra = {}) {
    const b = { x, z, hx, hz, yaw, c: Math.cos(yaw), s: Math.sin(yaw), y0, y1, mat, r: Math.hypot(hx, hz), ...extra };
    W.boxes.push(b); if (CI) CI.boxes.push(b);
    if (BRK) { b.brk = BRK; if (BRK.phase) { b.off = true; b.home = { x, z, yaw, hx, hz, y0, y1 }; BRK.bboxes.push(b); } else BRK.boxes.push(b); }
    return b;
  }
  // one call: a box drawn and solid
  const ALL = k => () => k;
  function block(x, y0, z, hx, y1, hz, yaw, mat, surf = 'wood', solidIt = true, extra = {}) {
    B.box(x, y0, z, hx, y1, hz, yaw, typeof mat === 'function' ? mat : ALL(mat), TILE);
    if (solidIt) return solid(x, z, hx, hz, yaw, y1, surf, y0, extra);
    return null;
  }
  W.solid = solid;

  // ---------------- decals on walls (spray paint, X marks, handprints) ----------------
  const MESSAGES = [[['HELP US'], '#b01810'], [['INFECTED', 'INSIDE'], '#b01810'], [["DON'T", 'OPEN'], '#151515'], [['GONE TO', 'RIDGEFIELD'], '#e8e4da'], [['DEAD', 'INSIDE'], '#b01810'], [['GOD', 'FORGIVE US'], '#151515'], [['4 ALIVE', 'NEED FOOD'], '#e8e4da'], [['THEY HEAR', 'YOU'], '#b01810'], [['NO', 'LOOTERS'], '#151515'], [['SHOOT', 'THE HEAD'], '#b01810']];
  const TEXPOOL = { spray: [], fema: [], hand: [] }, DMAT = new Map();
  function pickTex(kind, r) {
    const pool = TEXPOOL[kind];
    if (!pool.length) {
      if (kind === 'spray') MESSAGES.forEach(([l, c], i) => pool.push(TX.sprayTexture(l, c, 40 + i)));
      else if (kind === 'fema') for (let i = 0; i < 5; i++) pool.push(TX.femaTexture(60 + i));
      else for (let i = 0; i < 3; i++) pool.push(TX.handprintTexture(70 + i));
    }
    return pool[Math.floor(r() * pool.length)];
  }
  function decalMat(t) {
    if (!DMAT.has(t)) DMAT.set(t, new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.05, depthWrite: false, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    return DMAT.get(t);
  }
  // ---------------- shared prop geometry ----------------
  const GEO = {
    trunk: new THREE.CylinderGeometry(0.16, 0.28, 1, 8).translate(0, 0.5, 0),
    blob: new THREE.IcosahedronGeometry(1, 1),
    blob0: new THREE.IcosahedronGeometry(1, 0),
    // a lumpy clump of foliage: an inner dark core and shells of leaf texture, so it reads as leaves, not a ball
    clump: (() => { const g = new THREE.IcosahedronGeometry(1, LOW ? 1 : 2);   // (phones / tablets: a quarter of the triangles)
      const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const n = 1 + 0.22 * Math.sin(x * 5.1 + y * 3.3) * Math.cos(z * 4.7 - x * 2.1) + 0.1 * Math.sin(y * 11 + z * 9); p.setXYZ(i, x * n, y * n, z * n); } g.computeVertexNormals(); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3, uv.getY(i) * 2); return g; })(),
    clumpIn: new THREE.IcosahedronGeometry(0.72, 1),
    pineCone: (() => { const g = new THREE.ConeGeometry(1, 1, 14, 3, true); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < 0.4) { p.setX(i, p.getX(i) * (1 + (Math.random() - 0.5) * 0.25)); p.setZ(i, p.getZ(i) * (1 + (Math.random() - 0.5) * 0.25)); p.setY(i, y + (Math.random() - 0.5) * 0.12); } } g.computeVertexNormals(); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 4, uv.getY(i) * 2); return g; })(),
    // a dark solid cone inside each layer of needles, so a pine still reads as a full tree far away (thin needles
    // vanish from the alpha-tested texture's smaller mip levels)
    pineCore: new THREE.ConeGeometry(1, 1, 10, 1),
    branch: new THREE.CylinderGeometry(0.035, 0.08, 1, 6).translate(0, 0.5, 0),
    flare: (() => { const g = new THREE.CylinderGeometry(0.2, 0.46, 0.55, 9, 2).translate(0, 0.27, 0); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i), a = Math.atan2(p.getZ(i), p.getX(i)), k = 1 + (y < 0.1 ? 0.25 * Math.max(0, Math.sin(a * 5)) : 0); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); } g.computeVertexNormals(); return g; })(),
    post: new THREE.CylinderGeometry(0.06, 0.07, 1, 8).translate(0, 0.5, 0),
    picket: (() => { const s = new THREE.Shape(); s.moveTo(-0.045, 0); s.lineTo(0.045, 0); s.lineTo(0.045, 0.82); s.lineTo(0, 0.9); s.lineTo(-0.045, 0.82); s.closePath(); return new THREE.ExtrudeGeometry(s, { depth: 0.022, bevelEnabled: false }).translate(0, 0, -0.011); })(),
    // a cobra head: a long low shell, its lens flush underneath (the arm comes in from -z)
    lampHead: new THREE.SphereGeometry(1, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.19, 0.14, 0.4).translate(0, 0, 0.12),
    lampLens: new THREE.CircleGeometry(1, 20).rotateX(Math.PI / 2).scale(0.15, 1, 0.33).translate(0, 0, 0.12),
    photocell: new THREE.CylinderGeometry(0.035, 0.035, 0.06, 10),
    lampPole: new THREE.CylinderGeometry(0.06, 0.11, 5.4, 12).translate(0, 2.7, 0),
    lampBase: new RoundedBoxGeometry(0.34, 0.5, 0.34, 2, 0.03).translate(0, 0.25, 0),
    lampArm: (() => { const c = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 5.2, 0), new THREE.Vector3(0, 5.85, 0.25), new THREE.Vector3(0, 5.75, 1.15)); return new THREE.TubeGeometry(c, 16, 0.045, 8, false); })(),
    hydrant: (() => { const pts = [[0, 0], [0.19, 0], [0.19, 0.06], [0.14, 0.08], [0.14, 0.52], [0.17, 0.55], [0.17, 0.6], [0.13, 0.64], [0.11, 0.72], [0.05, 0.78], [0.04, 0.84], [0, 0.85]].map(p => new THREE.Vector2(p[0], p[1])); return new THREE.LatheGeometry(pts, 18); })(),
    nozzle: new THREE.CylinderGeometry(0.05, 0.05, 0.12, 10).rotateZ(Math.PI / 2),
    board: new RoundedBoxGeometry(1.0, 0.16, 0.035, 2, 0.01),
    can: new THREE.CylinderGeometry(0.035, 0.035, 0.11, 12).translate(0, 0.055, 0),
    jar: new THREE.CylinderGeometry(0.045, 0.045, 0.14, 12).translate(0, 0.07, 0),
    bottle: (() => { const pts = [[0, 0], [0.04, 0], [0.04, 0.17], [0.015, 0.22], [0.015, 0.26], [0, 0.26]].map(p => new THREE.Vector2(p[0], p[1])); return new THREE.LatheGeometry(pts, 10); })(),
    carton: new THREE.BoxGeometry(0.08, 0.22, 0.08).translate(0, 0.11, 0),
    cereal: new THREE.BoxGeometry(0.2, 0.28, 0.07).translate(0, 0.14, 0),
    folded: new THREE.BoxGeometry(0.3, 0.1, 0.25).translate(0, 0.05, 0),
    item: new THREE.BoxGeometry(0.1, 0.05, 0.14).translate(0, 0.025, 0),
    ubox: new THREE.BoxGeometry(1, 1, 1),   // a unit box, scaled into shape
    uplane: new THREE.PlaneGeometry(1, 1),
    shade: new THREE.CylinderGeometry(0.09, 0.15, 0.2, 18, 1, true),
    burner: new THREE.TorusGeometry(0.075, 0.01, 6, 20).rotateX(Math.PI / 2),
    knob: new THREE.CylinderGeometry(0.018, 0.02, 0.025, 12),
    plate: new THREE.BoxGeometry(0.07, 0.115, 0.008),
    fruit: new THREE.SphereGeometry(0.04, 10, 8),
    bowl: new THREE.SphereGeometry(0.13, 16, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(1, 0.45, 1).translate(0, 0.059, 0),
    basket: new THREE.CylinderGeometry(0.22, 0.19, 0.42, 16, 1, true).translate(0, 0.21, 0),
    clock: new THREE.CylinderGeometry(0.15, 0.15, 0.03, 24).rotateX(Math.PI / 2),
    ceilLight: new THREE.SphereGeometry(0.17, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.4, 1).rotateX(Math.PI),
    // a gooseneck kitchen tap
    tap: new THREE.TubeGeometry(new THREE.CubicBezierCurve3(new THREE.Vector3(0, 0.05, 0), new THREE.Vector3(0, 0.36, 0), new THREE.Vector3(0, 0.38, 0.22), new THREE.Vector3(0, 0.24, 0.24)), 16, 0.012, 8, false),
    // the kitchen worktop with the sink cut out of it (3.24 x 0.66, the hole 0.62 x 0.38 at x -0.35)
    sinkTop: (() => { const sh = new THREE.Shape(); sh.moveTo(-1.62, -0.33); sh.lineTo(1.62, -0.33); sh.lineTo(1.62, 0.33); sh.lineTo(-1.62, 0.33); sh.closePath(); const h = new THREE.Path(), x0 = -0.66, x1 = -0.04, y0 = -0.19, y1 = 0.19, rr = 0.04; h.moveTo(x0 + rr, y0); h.lineTo(x1 - rr, y0); h.quadraticCurveTo(x1, y0, x1, y0 + rr); h.lineTo(x1, y1 - rr); h.quadraticCurveTo(x1, y1, x1 - rr, y1); h.lineTo(x0 + rr, y1); h.quadraticCurveTo(x0, y1, x0, y1 - rr); h.lineTo(x0, y0 + rr); h.quadraticCurveTo(x0, y0, x0 + rr, y0); sh.holes.push(h); return new THREE.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: false, curveSegments: 4 }).rotateX(-Math.PI / 2); })(),
    // a stainless sink bowl: four walls, a floor, a little flange round the top (hung from y 0)
    basin: (() => { const p = [], bx = (w, h, d, x, y, z) => p.push(new THREE.BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed()); bx(0.6, 0.01, 0.36, 0, -0.175, 0); for (const sx of [-1, 1]) { bx(0.01, 0.18, 0.36, sx * 0.3, -0.09, 0); bx(0.6, 0.18, 0.01, 0, -0.09, sx * 0.18); } bx(0.68, 0.006, 0.04, 0, 0.003, 0.2); bx(0.68, 0.006, 0.04, 0, 0.003, -0.2); bx(0.04, 0.006, 0.44, 0.33, 0.003, 0); bx(0.04, 0.006, 0.44, -0.33, 0.003, 0); return mergeGeometries(p).translate(0.0, 0, 0); })(),
    vanityTop: (() => { const sh = new THREE.Shape(); sh.moveTo(-0.25, -0.45); sh.lineTo(0.25, -0.45); sh.lineTo(0.25, 0.45); sh.lineTo(-0.25, 0.45); sh.closePath(); const h = new THREE.Path(); h.absellipse(-0.02, 0, 0.15, 0.2, 0, Math.PI * 2, true); sh.holes.push(h); return new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: false, curveSegments: 20 }).rotateX(-Math.PI / 2); })(),
    washBasin: new THREE.SphereGeometry(1, 18, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(0.15, 0.13, 0.2).translate(-0.02, 0, 0),
    // the toilet: a lathed pedestal and bowl (stretched front to back), a seat ring
    wcBowl: new THREE.LatheGeometry([[0, 0], [0.13, 0], [0.12, 0.06], [0.14, 0.2], [0.195, 0.35], [0.2, 0.4], [0.17, 0.405], [0.15, 0.32], [0.07, 0.2], [0, 0.19]].map(p => new THREE.Vector2(p[0], p[1])), 20).scale(1, 1, 1.25),
    wcSeat: new THREE.TorusGeometry(0.165, 0.025, 8, 24).rotateX(Math.PI / 2).scale(1, 1, 1.25),
    lantern: new RoundedBoxGeometry(0.13, 0.22, 0.13, 2, 0.015).translate(0, 0.11, 0),
    lanternCap: new THREE.ConeGeometry(0.1, 0.07, 4, 1).rotateY(Math.PI / 4).translate(0, 0.03, 0),
    ucyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 14),   // a unit cylinder (diameter 1, height 1)
    swingSeat: (() => { const g = new RoundedBoxGeometry(0.46, 0.03, 0.18, 3, 0.012); const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + p.getX(i) * p.getX(i) * 0.35); g.computeVertexNormals(); return g; })(),
    mirrorDome: new THREE.SphereGeometry(0.3, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.45, 1).rotateX(Math.PI / 2),
    bag: (() => { const g = new THREE.IcosahedronGeometry(0.33, 2); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const n = 1 + 0.16 * Math.sin(x * 11 + z * 7) + 0.1 * Math.sin(y * 13); p.setXYZ(i, x * n, Math.max(-0.2, y * n * 0.78) + 0.2, z * n); } g.computeVertexNormals(); return g; })(),
    paper: new THREE.PlaneGeometry(0.21, 0.28).rotateX(-Math.PI / 2),
    suitcase: new RoundedBoxGeometry(0.52, 0.22, 0.72, 2, 0.04),
    litter: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    bike: (() => {
      const parts = [], tube = (a, b, r = 0.018) => { const v = new THREE.Vector3().subVectors(b, a), L = v.length(); const g = new THREE.CylinderGeometry(r, r, L, 6); g.translate(0, L / 2, 0); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize())); g.translate(a.x, a.y, a.z); parts.push(g.toNonIndexed()); };
      for (const z of [-0.52, 0.52]) { const w = new THREE.TorusGeometry(0.33, 0.022, 6, 24).rotateY(Math.PI / 2); w.translate(0, 0.33, z); parts.push(w.toNonIndexed()); }
      const V3 = (x, y, z) => new THREE.Vector3(x, y, z), bb = V3(0, 0.33, -0.05), st = V3(0, 0.78, -0.18), hd = V3(0, 0.82, 0.38);
      tube(V3(0, 0.33, -0.52), bb); tube(V3(0, 0.33, -0.52), st); tube(bb, st); tube(bb, hd); tube(st, hd); tube(hd, V3(0, 0.33, 0.52)); tube(V3(-0.24, 0.92, 0.42), V3(0.24, 0.92, 0.42)); tube(hd, V3(0, 0.92, 0.42));
      const seat = new THREE.BoxGeometry(0.1, 0.05, 0.22); seat.translate(0, 0.83, -0.2); parts.push(seat.toNonIndexed());
      for (const p of parts) { for (const k of Object.keys(p.attributes)) if (!['position', 'normal'].includes(k)) p.deleteAttribute(k); }
      return mergeGeometries(parts);
    })(),
    cone: (() => { const pts = [[0, 0.72], [0.035, 0.72], [0.17, 0.05], [0.24, 0.05], [0.24, 0], [0, 0]].map(p => new THREE.Vector2(p[0], p[1])); return new THREE.LatheGeometry(pts, 18); })(),
    coneBand: new THREE.CylinderGeometry(0.105, 0.135, 0.12, 18, 1, true),
    mailTop: new THREE.CylinderGeometry(0.13, 0.13, 0.48, 14, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2),
    bin: new RoundedBoxGeometry(0.6, 1.02, 0.7, 2, 0.04).translate(0, 0.51, 0),
    binLid: new RoundedBoxGeometry(0.66, 0.05, 0.76, 2, 0.02).translate(0, 0, 0.36),
    wheel: new THREE.CylinderGeometry(0.34, 0.34, 0.24, 16).rotateZ(Math.PI / 2),
  };
  const FURN = new Map();   // cached furniture part geometries (drawer fronts, trays, pulls, knobs)
  W.treeSpots = [];
  const FALLEN_AT = [];   // root plates of trees the outbreak blows down (a map registers them before planting): nothing stands there
  // a printed label whose text always fits: shrinks the font until the widest line sits inside 90% of the canvas (and the lines don't overlap)
  const FIT_CV = document.createElement('canvas').getContext('2d');
  function fitLab(lines, bg, fg, w = 256, h = 128, font = 'bold 40px Helvetica') {
    const m = /(\d+(?:\.\d+)?)px/.exec(font); if (!m) return TX.labelTexture(lines, bg, fg, w, h, font);
    let px = +m[1]; FIT_CV.font = font; const wide = Math.max(...lines.map(l => FIT_CV.measureText(l).width));
    px = Math.min(px, px * w * 0.9 / Math.max(1, wide), lines.length === 1 ? h * 0.8 : h / (lines.length + 0.5) * 0.95);
    return TX.labelTexture(lines, bg, fg, w, h, font.replace(m[0], Math.floor(px) + 'px'));
  }
  function tree(x, z, s = 1, kind = 0, rnd = Math.random) {
    if (FALLEN_AT.some(([fx, fz]) => Math.hypot(fx - x, fz - z) < 3)) return 0;
    W.treeSpots.push([x, z, s]);
    const h = (5.4 + kind * 1.4) * s, lean = kind === 0 ? (rnd() - 0.5) * 0.03 : (rnd() - 0.5) * 0.08;
    // the trunk leans: everything up it moves over with it (mat4 is YXZ: rx tips +y toward +z... sampled from the matrix itself)
    const LM = mat4(0, 0, 0, 0, 1, 1, 1, lean, lean), LV = new THREE.Vector3(0, 1, 0).applyMatrix4(LM), lx0 = LV.x, lz0 = LV.z, X0 = y => x + lx0 * y, Z0 = y => z + lz0 * y;
    inst(GEO.trunk, MAT.bark, mat4(x, 0, z, rnd() * 6, 1.15 * s, h * 0.8, 1.15 * s, lean, lean));
    inst(GEO.flare, MAT.bark, mat4(x, 0, z, rnd() * 6, s, s, s));   // the root flare where it meets the ground
    // a few thick limbs leave the trunk below the crown; finer branches out from the top
    const nl = 2 + Math.floor(rnd() * 2);
    for (let i = 0; i < nl; i++) { const yb = (2.0 + rnd() * 0.8) * s; inst(GEO.branch, MAT.bark, mat4(X0(yb), yb, Z0(yb), rnd() * 6.28, 2.4 * s, (1.8 + rnd() * 0.8) * s, 2.4 * s, 0.85 + rnd() * 0.3, 0)); }
    const nb = 4 + Math.floor(rnd() * 3);
    for (let i = 0; i < nb; i++) { const a = i / nb * 6.28 + rnd(), yb = h * (0.5 + rnd() * 0.2); inst(GEO.branch, MAT.bark, mat4(X0(yb), yb, Z0(yb), a, 1.2 * s, (1.6 + rnd()) * s, 1.2 * s, 0.75 + rnd() * 0.4, 0)); }
    const lm = kind ? MAT.leaves2 : MAT.leaves;
    // crowns differ: tall and narrow, round, or broad and spreading; heavier on one side, some foliage hanging lower
    const form = rnd(), heavy = rnd() * 6.28;
    const cy = h * 0.82, rx = (form < 0.33 ? 1.7 : form < 0.7 ? 2.3 : 2.8) * s, ry = (form < 0.33 ? 2.4 : form < 0.7 ? 1.5 : 1.2) * s, n = 9 + Math.floor(rnd() * 6);
    for (let i = 0; i < n; i++) {
      const u = i < 2 ? heavy + (rnd() - 0.5) : rnd() * 6.28, v = i < 2 ? 1.9 : Math.acos(2 * rnd() - 1), k = i < 2 ? 0.8 : Math.cbrt(rnd()) * 0.75;
      const px = X0(cy) + Math.sin(v) * Math.cos(u) * rx * k + Math.cos(heavy) * 0.35 * s, py = cy + Math.cos(v) * ry * k * 0.9, pz = Z0(cy) + Math.sin(v) * Math.sin(u) * rx * k + Math.sin(heavy) * 0.35 * s;
      const sc = (0.95 + rnd() * 0.6) * s, minY = i < 2 ? 2.3 : 3.1;
      const yy = py < minY ? minY + (py - minY) * 0.25 + rnd() * 0.3 : py;   // a soft floor: no flat-bottomed crowns
      inst(GEO.clump, lm, mat4(px, yy, pz, rnd() * 6, sc * 1.1, sc * 0.85, sc * 1.1));
      if (i % 2 === 0) inst(GEO.clumpIn, MAT.leafCore, mat4(px, yy, pz, 0, sc, sc * 0.8, sc), false);
    }
    solid(x, z, 0.3 * s, 0.3 * s, 0, h, 'wood');   // as wide as the trunk you see
  }
  function pine(x, z, s = 1, rnd = Math.random) {
    const h = 10 * s;
    inst(GEO.trunk, MAT.bark, mat4(x, 0, z, 0, 0.8 * s, h * 0.9, 0.8 * s));
    for (let i = 0; i < 5; i++) { const y = h * (0.22 + i * 0.16), r = (2.6 - i * 0.48) * s; inst(GEO.pineCone, MAT.needles, mat4(x, y + 1.3 * s, z, rnd() * 6, r, 2.8 * s, r)); inst(GEO.pineCore, MAT.leafCore, mat4(x, y + 1.22 * s, z, 0, r * 0.7, 2.5 * s, r * 0.7)); }
    solid(x, z, 0.25 * s, 0.25 * s, 0, h, 'wood');
  }
  // a hedge, in sections of about 1.4 m (each can be flattened on its own)
  function hedge(x, z, len, yaw, h = 1.1) {
    const c = Math.cos(yaw), s = Math.sin(yaw), ns = Math.max(1, Math.round(len / 1.4)), sl = len / ns, nAll = Math.max(1, Math.round(len / 0.7));
    for (let k = 0; k < ns; k++) {
      const o = (k - (ns - 1) / 2) * sl, sx = x + c * o, sz = z - s * o;
      breakable('hedge', sx, sz, yaw, { mat: 'leaves', mode: 'flatten', hp: 5, py: 0.04, ang: 0.95, sy: 0.38, carMin: 2.5, carK: 0.2, dent: 0.12, h, cy: h * 0.6, deb: [['leaf', 30], ['twig', 7]], spread: sl * 0.5 }, () => {
        { const a = o - sl / 2 + (k === 0 ? 0.1 : -0.02), b = o + sl / 2 - (k === ns - 1 ? 0.1 : -0.02), m = (a + b) / 2; BRK.hideNext = true; inst(GEO.ubox, MAT.leafCore, mat4(x + c * m, h * 0.425, z - s * m, yaw, b - a, h * 0.85, 0.6)); BRK.hideNext = false; }
        for (let i = 0; i < nAll; i++) { const oo = (i - (nAll - 1) / 2) * 0.7; if (oo < o - sl / 2 - 1e-6 || oo >= o + sl / 2 - 1e-6) continue; inst(GEO.clump, MAT.hedge, mat4(x + c * oo, h * 0.55, z - s * oo, Math.random() * 6, 0.5, h * 0.52, 0.48)); }
        solid(sx, sz, sl / 2, 0.42, yaw, h, 'leaves', 0, h < 1.15 ? { vault: true } : {});
      }, () => {
        // what's left: torn-off foliage lying about, snapped stems sticking up out of it
        for (let i = 0; i < 3; i++) { const oo = (Math.random() - 0.5) * sl, oz = 0.3 + Math.random() * 0.4; BRK.side = true; inst(GEO.clump, MAT.hedge, mat4(sx + c * oo + s * oz, 0.1, sz - s * oo + c * oz, Math.random() * 6, 0.38, 0.16, 0.34)); BRK.side = false; }
        for (let i = 0; i < 6; i++) { const oo = (Math.random() - 0.5) * sl, oz = (Math.random() - 0.5) * 0.45; inst(GEO.branch, MAT.bark, mat4(sx + c * oo + s * oz, 0, sz - s * oo + c * oz, Math.random() * 6, 0.45, 0.2 + Math.random() * 0.3, 0.45, (Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 0.9), false); }
      });
    }
  }
  // a round garden shrub (it flattens like a hedge)
  function bush(x, z, sc = 0.8, r = Math.random) {
    breakable('bush', x, z, r() * 6, { mat: 'leaves', mode: 'flatten', hp: 3, py: 0.04, ang: 0.9, sy: 0.4, carMin: 2, carK: 0.1, dent: 0.06, h: sc * 1.1, cy: sc * 0.6, deb: [['leaf', 18], ['twig', 4]], spread: sc * 0.4 }, () => {
      BRK.hideNext = true; inst(GEO.clumpIn, MAT.leafCore, mat4(x, sc * 0.55, z, 0, sc * 0.75, sc * 0.65, sc * 0.75), false); BRK.hideNext = false;
      const n = 3 + Math.floor(r() * 2);
      for (let i = 0; i < n; i++) { const a = i / n * 6.28 + r(), q = sc * 0.22; inst(GEO.clump, MAT.hedge, mat4(x + Math.cos(a) * q, sc * (0.5 + r() * 0.2), z + Math.sin(a) * q, r() * 6, sc * 0.5, sc * 0.48, sc * 0.5)); }
      inst(GEO.clump, MAT.hedge, mat4(x, sc * 0.85, z, r() * 6, sc * 0.42, sc * 0.35, sc * 0.42));
      solid(x, z, sc * 0.45, sc * 0.45, 0, sc * 1.05, 'leaves', 0, { vault: true });
    }, () => { for (let i = 0; i < 4; i++) inst(GEO.branch, MAT.bark, mat4(x + (r() - 0.5) * sc * 0.5, 0, z + (r() - 0.5) * sc * 0.5, r() * 6, 0.4, 0.18 + r() * 0.2, 0.4, (r() - 0.5) * 0.9, (r() - 0.5) * 0.9), false); });
  }
  // a picket fence (you can vault it) between two points: posts every ~2.2 m, each section between them breaks alone
  function picketFence(x0, z0, x1, z1) {
    const K = bkit(), L = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(-(z1 - z0), x1 - x0), ns = Math.max(1, Math.round(L / 2.2)), sl = L / ns;
    const ax = Math.cos(yaw), az = -Math.sin(yaw), nx = Math.sin(yaw), nz = Math.cos(yaw);
    const posts = []; for (let k = 0; k <= ns; k++) { const t = k / ns, px = lerp(x0, x1, t), pz = lerp(z0, z1, t); const po = fencePost(px, pz, yaw, K.picketPost, K.picketCap, MAT.picket, 1.05, 0.05, true); po.panels = []; posts.push(po); }
    for (let k = 0; k < ns; k++) {
      const sx0 = lerp(x0, x1, k / ns), sz0 = lerp(z0, z1, k / ns), sx1 = lerp(x0, x1, (k + 1) / ns), sz1 = lerp(z0, z1, (k + 1) / ns), cx = (sx0 + sx1) / 2, cz = (sz0 + sz1) / 2, n = Math.round(sl / 0.16);
      const pk = []; for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; if (t * sl < 0.08 || (1 - t) * sl < 0.08) continue; pk.push([lerp(sx0, sx1, t), lerp(sz0, sz1, t)]); }
      const pnl = breakable('picket', cx, cz, yaw, { mat: 'wood', hp: 3.5, carMin: 2.5, carK: 0.07, dent: 0.2, h: 0.9, cy: 0.5, deb: [['picket', 14], ['splinter', 10]], spread: sl * 0.45 }, () => {
        for (const [px, pz] of pk) inst(GEO.picket, MAT.picket, mat4(px, 0, pz, yaw));
        for (const y of [0.25, 0.65]) inst(K.rail, MAT.picket, mat4(cx - nx * 0.024, y + 0.035, cz - nz * 0.024, yaw, sl - 0.08, 1, 1));
        solid(cx, cz, sl / 2, 0.06, yaw, 0.9, 'wood', 0, { vault: true });
      }, () => {
        for (const [px, pz] of pk) if (Math.random() < 0.6) inst(K.picketStub, MAT.picket, mat4(px, 0, pz, yaw + (Math.random() - 0.5) * 0.15, 1, 0.5 + Math.random() * 0.8, 1, (Math.random() - 0.5) * 0.4, 0), false);
        inst(K.rail, MAT.picket, mat4(cx - nx * 0.024, 0.285, cz - nz * 0.024, yaw, sl - 0.08, 1, 1, 0, (Math.random() - 0.5) * 0.08));
        for (const sd of [-1, 1]) { const ex = cx + ax * sd * (sl / 2 - 0.06), ez = cz + az * sd * (sl / 2 - 0.06), hl = sl * 0.3, a = 0.55; inst(K.rail, MAT.picket, mat4(ex - ax * sd * hl / 2 * Math.cos(a) - nx * 0.024, 0.685 - hl / 2 * Math.sin(a), ez - az * sd * hl / 2 * Math.cos(a) - nz * 0.024, yaw, hl, 1, 1, 0, sd * a), false); }
        BRK.side = true;
        for (let i = 0; i < 5; i++) { const t = (Math.random() - 0.5) * sl * 0.8, d = 0.35 + Math.random() * 1.1; inst(GEO.picket, MAT.picket, mat4(cx + ax * t + nx * d, 0.012, cz + az * t + nz * d, yaw + Math.PI / 2 + (Math.random() - 0.5) * 1.2, 1, 1, 1, -Math.PI / 2, 0), false); }
        BRK.side = false;
      });
      pnl.posts = [posts[k], posts[k + 1]]; posts[k].panels.push(pnl); posts[k + 1].panels.push(pnl);
    }
  }
  // a wooden fence post: a car snaps it off near the ground and it goes over with the boards (or a lot of axe blows)
  function fencePost(px, pz, yaw, geo, cap, mat, h, r, vault) {
    return breakable('post', px, pz, yaw, { mat: 'wood', mode: 'tip', hp: 6, py: 0.12, ang: 1.35, carMin: 3, carK: 0.05, dent: 0.15, h, cy: h * 0.5, deb: [['splinter', 8]] }, () => {
      inst(geo, mat, mat4(px, 0, pz, yaw)); inst(cap, mat, mat4(px, 0, pz, yaw));
      solid(px, pz, r, r, yaw, h, 'wood', 0, vault ? { vault: true } : {});
    }, () => inst(bkit().splitPost, mat, mat4(px, 0, pz, yaw, r * 2, 0.16, r * 2)));
  }
  // a tall wooden privacy fence (can't be climbed): 4x4 posts every 2.4 m or less and a panel of boards between each
  // pair (a car at speed goes straight through one)
  function privacyFence(x0, z0, x1, z1) {
    const L = Math.hypot(x1 - x0, z1 - z0); if (L < 0.2) return;
    const K = bkit(), yaw = Math.atan2(-(z1 - z0), x1 - x0), ns = Math.ceil(L / 2.4), sl = L / ns;
    const ax = Math.cos(yaw), az = -Math.sin(yaw), nx = Math.sin(yaw), nz = Math.cos(yaw);
    const posts = []; for (let k = 0; k <= ns; k++) { const t = k / ns, px = lerp(x0, x1, t), pz = lerp(z0, z1, t); const po = fencePost(px, pz, yaw, K.post4, K.postCap, MAT.fence, 1.97, 0.055, false); po.panels = []; posts.push(po); }
    for (let k = 0; k < ns; k++) {
      const cx = lerp(x0, x1, (k + 0.5) / ns), cz = lerp(z0, z1, (k + 0.5) / ns), sc = Math.max(0.05, (sl - 0.09) / 2.39);
      const pnl = breakable('privacy', cx, cz, yaw, { mat: 'wood', hp: 6, carMin: 3, carK: 0.18, dent: 0.45, h: 1.9, cy: 1.0, deb: [['splinter', 26]], spread: sl * 0.45 }, () => {
        inst(K.panel, MAT.fence, mat4(cx, 0, cz, yaw, sc, 1, 1));
        solid(cx, cz, sl / 2, 0.08, yaw, 1.9, 'wood');
      }, () => {
        inst(K.panelBroken[((k + Math.floor(cx * 3 + cz * 7)) % 3 + 3) % 3], MAT.fence, mat4(cx, 0, cz, yaw, sc, 1, 1));
        BRK.side = true;
        for (let i = 0; i < 6; i++) { const t = (Math.random() - 0.5) * sl * 0.8, d = 0.3 + Math.random() * 1.5; inst(K.board, MAT.fence, mat4(cx + ax * t + nx * d, 0.012 + Math.random() * 0.004, cz + az * t + nz * d, yaw + Math.PI / 2 + (Math.random() - 0.5) * 1.0, 1.1 + Math.random() * 0.7, 1, 1, (Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.1), false); }
        BRK.side = false;
      });
      pnl.posts = [posts[k], posts[k + 1]]; posts[k].panels.push(pnl); posts[k + 1].panels.push(pnl);
    }
  }
  function chainFence(x0, z0, x1, z1) {
    const L = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(-(z1 - z0), x1 - x0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const pg = new THREE.PlaneGeometry(L, 2.55); { const uv = pg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * L / 0.6, uv.getY(i) * 2.55 / 0.6); }
    const m = new THREE.Mesh(pg, MAT.chainlink); m.castShadow = true; m.receiveShadow = true;
    m.position.set(cx, 1.3, cz); m.rotation.y = yaw; level.add(m);
    B.box(cx, 0.02, cz, L / 2, 0.05, 0.012, yaw, ALL('metal'), TILE);   // the bottom tension wire
    const n = Math.ceil(L / 3);
    for (let i = 0; i <= n; i++) { const t = i / n; inst(GEO.post, MAT.metal, mat4(lerp(x0, x1, t), 0, lerp(z0, z1, t), 0, 0.8, 2.75, 0.8)); }
    B.box(cx, 2.6, cz, L / 2, 2.66, 0.03, yaw, ALL('metal'), TILE);
    solid(cx, cz, L / 2, 0.06, yaw, 2.7, 'metal', 0, { pass: true });   // you can see and shoot through it, not walk through it
  }
  // a street light: a tapered galvanised pole on a cast base, a curved arm, a cobra head with a lens underneath and a
  // photocell on top; at night its light falls in a pool on the road
  const poolMat = new THREE.MeshBasicMaterial({ map: (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(cv); })(), color: 0xffc890, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  // ...and in the air under it: a glow round the lens and a faint cone of light, both stronger in rain and mist
  const haloMat = new THREE.SpriteMaterial({ map: TX.glowSprite('255,214,160'), color: 0xffc890, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
  const shaftUni = { k: { value: 0.06 } };
  const shaftMat = new THREE.ShaderMaterial({ uniforms: shaftUni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    vertexShader: 'varying float vY; varying float vE; void main(){ vY = position.y / 5.5 + 0.5; vec4 mv = modelViewMatrix * vec4(position, 1.0); vec3 n = normalize(normalMatrix * normal); vE = abs(dot(n, normalize(-mv.xyz))); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform float k; varying float vY; varying float vE; void main(){ float a = pow(vY, 1.6) * pow(vE, 2.0) * k; gl_FragColor = vec4(vec3(1.0, 0.8, 0.56) * a, 1.0); }' });
  const shaftGeo = new THREE.ConeGeometry(2.4, 5.5, 20, 1, true);
  function streetLamp(x, z, yaw) {
    const y0 = (Math.abs(z) > 4.05 && Math.abs(z) < 6.05) || (Math.abs(x) > 4.05 && Math.abs(x) < 6.05) ? 0.11 : 0;   // standing on the sidewalk slab
    inst(GEO.lampPole, MAT.metal, mat4(x, y0, z));
    inst(GEO.lampBase, MAT.concrete, mat4(x, y0, z, yaw));
    inst(GEO.lampArm, MAT.metal, mat4(x, y0, z, yaw));
    const ax = x + Math.sin(yaw) * 1.25, az = z + Math.cos(yaw) * 1.25;
    inst(GEO.lampHead, MAT.metal, mat4(ax, 5.68 + y0, az, yaw));
    inst(GEO.photocell, MAT.black, mat4(ax - Math.sin(yaw) * 0.12, 5.79 + y0, az - Math.cos(yaw) * 0.12));
    const bulb = new THREE.Mesh(GEO.lampLens, new THREE.MeshStandardMaterial({ color: 0xb8b6ae, emissive: 0xffc890, emissiveIntensity: 0, roughness: 0.2 }));
    bulb.position.set(ax, 5.675 + y0, az); bulb.rotation.y = yaw; level.add(bulb);
    const pool = new THREE.Mesh(GEO.litter, poolMat); pool.position.set(ax, 0.035, az); pool.scale.set(9, 1, 9); pool.visible = false; pool.renderOrder = 1; level.add(pool);
    const halo = new THREE.Sprite(haloMat); halo.position.set(ax, 5.6 + y0, az); halo.scale.setScalar(1.1); halo.visible = false; halo.renderOrder = 6; level.add(halo);
    const shaft = new THREE.Mesh(shaftGeo, shaftMat); shaft.position.set(ax, 5.62 + y0 - 2.75, az); shaft.visible = false; shaft.renderOrder = 6; level.add(shaft);
    pool.userData.halo = halo; pool.userData.shaft = shaft;
    solid(x, z, 0.13, 0.13, 0, 5.6, 'metal');
    W.lamps.push({ x: ax, y: 5.3 + y0, z: az, bulb, pool, broken: Math.random() < 0.3, flicker: Math.random() < 0.25, ph: Math.random() * 10 });
  }
  // a map's own light fixture for the night (floodlights, wall packs, tower lamps): no mesh of its own — the map draws
  // the fixture with an emissive material it drives itself. It joins W.lamps, so the street-lamp machinery lights it:
  // on at dusk, and the few nearest you get one of the fixed pool of real spot lights (no new lights, phones too).
  // o: { pow (spot strength ×70), dist, angle, tx, tz (where it points, on the ground), col, reach (m: counts as
  //      that much closer when picking the nearest), halo (sprite size, 0 = none), flicker, broken }
  function lamp(x, y, z, o = {}) {
    const L = { x, y, z, bulb: null, pool: null, broken: !!o.broken, flicker: !!o.flicker, ph: Math.random() * 10, pow: o.pow || 1, dist: o.dist, angle: o.angle, tx: o.tx, tz: o.tz, col: o.col, reach: o.reach || 0, power: 1 };
    if (o.halo) { const h = new THREE.Sprite(haloMat); h.position.set(x, y, z); h.scale.setScalar(o.halo); h.visible = false; h.renderOrder = 6; level.add(h); L.halo = h; }
    W.lamps.push(L);
    return L;
  }
  // a wheelie bin; fixed: it stays put whatever hits it (the one by the porch is the first step up onto the roof)
  // the moulded body of a wheelie bin: vertical ribs, a lip band at the top, scuffs and grime low down (tinted by its colour)
  const BIN_TEX = { t: null }, BIN_MATS = new Map();
  function binBody(colMat) {
    if (BIN_MATS.has(colMat)) return BIN_MATS.get(colMat);
    BIN_TEX.t ||= ctex(128, 128, (g, w, h, R) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
      for (let x = 6; x < 128; x += 15) { g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(x, 14, 3, 104); g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(x + 3, 14, 1, 104); }
      g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(0, 0, 128, 3); g.fillRect(0, 11, 128, 2);
      g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2; g.strokeRect(44, 40, 40, 26);
      const gr = g.createLinearGradient(0, 96, 0, 128); gr.addColorStop(0, 'rgba(60,50,40,0)'); gr.addColorStop(1, 'rgba(60,50,40,0.4)'); g.fillStyle = gr; g.fillRect(0, 96, 128, 32);
      for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(${R() < 0.5 ? '0,0,0' : '255,255,255'},${0.05 + R() * 0.1})`; g.fillRect(R() * 128, R() * 128, 1 + R() * 8, 1); }
    });
    const m = colMat.clone(); m.map = BIN_TEX.t; m.needsUpdate = true; BIN_MATS.set(colMat, m); return m;
  }
  function trashBin(x, z, yaw, colMat = MAT.greenPaint, fixed = false) {
    const c = Math.cos(yaw), sn = Math.sin(yaw), tilt = Math.random() < 0.35 ? 0.5 + Math.random() * 0.6 : 0.02;
    const metal = colMat === MAT.darkMetal, tint = colMat.color ? [colMat.color.r, colMat.color.g, colMat.color.b] : null;
    let lidP = null;
    const it = (fixed ? (f => (f(), null)) : f => breakable('bin', x, z, yaw, { mat: metal ? 'metal' : 'plastic', mode: 'tip', kick: true, hp: 2.5, py: 0, pr: 0.34, ang: Math.PI / 2 * 0.98, carMin: 1.5, carK: 0.05, dent: 0.12, h: 1.05, cy: 0.6, lie: { hx: 0.31, hz: 0.53, y1: 0.66 }, deb: [[metal ? 'metal' : 'plastic', 6]], tint }, f))(() => {
      inst(GEO.bin, binBody(colMat), mat4(x, 0.04, z, yaw, 1, 0.96, 1));
      lidP = new THREE.Group(); lidP.position.set(x - sn * 0.36, 1.03, z - c * 0.36); lidP.rotation.set(-tilt, yaw, 0, 'YXZ'); level.add(lidP);
      const lid = new THREE.Mesh(GEO.binLid, colMat); lid.castShadow = true; lidP.add(lid);
      brkObj(lidP);
      for (const sd of [-0.24, 0.24]) inst(GEO.wheel, MAT.rubber, mat4(x + c * sd - sn * 0.3, 0.1, z - sn * sd - c * 0.3, yaw, 1, 0.3, 0.3));
      solid(x, z, 0.31, 0.36, yaw, 1.05, metal ? 'metal' : 'plastic');
    });
    if (it) solid(x, z, 0.31, 0.53, yaw, 0.66, it.mat, 0, { vault: true, brk: it, home: { x, z, yaw, hx: 0.31, hz: 0.53, y0: 0, y1: 0.66 }, off: true, lieBox: true });
    const bc = container('bin', x + sn * 0.55, z + c * 0.55, 1.0, 'Trash can', yaw, null, { parts: [{ o: lidP, kind: 'hinge', axis: 'x', a: -(1.9 - tilt) }], stand: { x: x + sn * 0.75, z: z + c * 0.75, yaw: yaw + Math.PI } });
    addItems(bc, [['trash', x, 0.62, z, Math.random() * 6, 0.5], ['trash', x + c * 0.1, 0.78, z - sn * 0.1, Math.random() * 6, 0.38], ['can', x - c * 0.1, 0.86, z + sn * 0.08], ['carton', x + c * 0.06 + sn * 0.12, 0.84, z - sn * 0.06 + c * 0.12, 0, 0.8]]);
    if (it) { it.cont = bc; it.cont0 = { x: bc.x, z: bc.z, y: bc.y, yaw: bc.yaw, stand: { ...bc.stand }, parts: bc.parts }; it.props = bc.items; it.bboxes.push(W.boxes[W.boxes.length - 1]); }
  }
  function hydrant(x, z) {
    inst(GEO.hydrant, MAT.redPaint, mat4(x, 0, z, Math.random() * 6));
    for (const a of [0, Math.PI / 2, Math.PI]) inst(GEO.nozzle, MAT.redPaint, mat4(x + Math.sin(a) * 0.17, 0.45, z + Math.cos(a) * 0.17, a + Math.PI / 2));
    solid(x, z, 0.18, 0.18, 0, 0.85, 'metal');
  }
  // orange traffic cones (white reflective bands)
  // a traffic cone: a standing one is a light little thing you can kick over or vault (one holding up tape stays put)
  function cone(x, z, tip = false, fixed = false) {
    const ry = Math.random() * 6;
    if (tip || fixed) { inst(GEO.cone, MAT.orange, mat4(x, tip ? 0.12 : 0, z, ry, 1, 1, 1, tip ? 1.45 : 0, 0)); if (!tip) inst(GEO.coneBand, MAT.white, mat4(x, 0.42, z)); if (fixed) solid(x, z, 0.2, 0.2, 0, 0.72, 'plastic', 0, { vault: true, navSkip: true }); return; }
    const it = breakable('cone', x, z, ry, { mat: 'plastic', mode: 'tip', kick: true, hp: 1, py: 0, pr: 0.22, ang: Math.PI / 2 * 0.9, carMin: 0.8, carK: 0.01, dent: 0.02, h: 0.72, cy: 0.35, lie: true, deb: [['plastic', 3]], tint: [0.95, 0.4, 0.1] }, () => {
      inst(GEO.cone, MAT.orange, mat4(x, 0, z, ry)); inst(GEO.coneBand, MAT.white, mat4(x, 0.42, z, ry));
      solid(x, z, 0.2, 0.2, ry, 0.72, 'plastic', 0, { vault: true, navSkip: true });
    });
    it.bboxes.push(solid(x, z, 0.22, 0.36, ry, 0.3, 'plastic', 0, { vault: true, navSkip: true, brk: it, off: true, lieBox: true, home: { x, z, yaw: ry, hx: 0.22, hz: 0.36, y0: 0, y1: 0.3 } }));
  }
  // the mailbox at the kerb: a wooden post, the box, its little red flag (a car snaps the post and it goes over)
  function mailbox(x, z, yaw) {
    const K = bkit();
    breakable('mailbox', x, z, yaw, { mat: 'wood', mode: 'tip', hp: 3.5, py: 0.14, ang: 1.38, carMin: 2.5, carK: 0.07, dent: 0.3, h: 1.25, cy: 0.9, deb: [['splinter', 9], ['metal', 3]] }, () => {
      inst(GEO.post, MAT.plank, mat4(x, 0, z, 0, 0.9, 1.0, 0.9));
      inst(GEO.ubox, MAT.darkMetal, mat4(x, 1.05, z, yaw, 0.26, 0.14, 0.48));
      inst(GEO.mailTop, MAT.darkMetal, mat4(x, 1.12, z, yaw));
      inst(GEO.ubox, MAT.redPaint, mat4(x + Math.cos(yaw) * 0.14, 1.15, z - Math.sin(yaw) * 0.14, yaw, 0.024, 0.2, 0.08));   // the little red flag
      solid(x, z, 0.13, 0.25, yaw, 1.25, 'metal');
    }, () => inst(K.splitPost, MAT.plank, mat4(x, 0, z, Math.random() * 6, 0.1, 0.16, 0.1)));
  }
  // ================================================================ things that break
  // Hedges and bushes, young trees, picket and privacy fences (section by section), mailboxes, wheelie bins, crates on
  // their pallets, plastic garden chairs and tables, flower pots, yard signs, the sawhorse barricades: a car going faster
  // than a walk ploughs through them (W.carBreak), a heavy swing breaks them after a few blows (W.hitBreakable). Big trees,
  // brick, cars and metal posts don't. Each one is a handful of instances it can hide or move, plus its own solid boxes:
  // when it goes, the boxes go off and the zombies' route map opens up through the gap.
  //  mode 'swap': the whole thing is replaced by its broken version (snapped pickets, boards on the ground)
  //  mode 'tip': it goes over (a bin, a snapped sapling or post), pivoting at py, pr out from its middle, by ang
  //  mode 'flatten': pushed over and squashed down (a hedge, a shrub)
  W.breakables = []; const brkAnim = [], brkDirty = new Set(); let brkClock = 0;
  const scQ = new THREE.Quaternion();
  const bM = new THREE.Matrix4(), bM2 = new THREE.Matrix4(), bM3 = new THREE.Matrix4(), bAx = new THREE.Vector3(), bV = new THREE.Vector3(), bP = new THREE.Vector3();
  let BKIT = null; const bkit = () => BKIT || (BKIT = breakKit(TX));
  function breakable(kind, x, z, yaw, o, build, broken = null) {
    const it = { id: W.breakables.length, kind, x, z, yaw, nx: Math.sin(yaw), nz: Math.cos(yaw), mode: 'swap', mat: 'wood', hp: 4, py: 0, pr: 0, ang: 1.45, sy: 1, carMin: 3, carK: 0.1, dent: 0.25, h: 1, cy: 0.5, deb: [['splinter', 10]], spread: 0.3, floor: 0, tint: null, ...o,
      parts: [], bparts: [], objs: [], boxes: [], bboxes: [], broken: false, T: null, dir: new THREE.Vector3(), chaos: CI, side: false, phase: 0 };
    it.maxHp = it.hp;
    const pB = BRK; BRK = it;
    try { build(); if (broken) { it.phase = 1; broken(); } } finally { BRK = pB; it.side = false; }
    W.breakables.push(it); return it;
  }
  function brkObj(o) { if (BRK) BRK.objs.push({ o, p0: o.position.clone(), q0: o.quaternion.clone(), s0: o.scale.clone() }); }
  // should this box be off just because of what's happened to the thing it belongs to?
  function brkOff(b) { const it = b.brk; if (!it) return false; return it.broken ? !it.bboxes.includes(b) || !!b.lieOff : it.bboxes.includes(b); }
  function setPart(p, M) { const im = p.L.im; if (!im) return; im.setMatrixAt(p.i, M); im.instanceMatrix.needsUpdate = true; brkDirty.add(im); }
  function brkApply(it, T) {   // every piece of the whole thing moved by T (null: back where it was built)
    for (const p of it.parts) setPart(p, p.hide && it.broken ? ZM : T ? bM.multiplyMatrices(T, p.m0) : p.m0);
    for (const ob of it.objs) { bM.compose(ob.p0, ob.q0, ob.s0); if (T) bM.premultiply(T); bM.decompose(ob.o.position, ob.o.quaternion, ob.o.scale); }
  }
  function brkBounds() { for (const im of brkDirty) im.computeBoundingSphere(); brkDirty.clear(); }
  // going over toward it.dir by k (0..1) of the way: about the pivot, and squashed down for a hedge
  function tipT(it, k, out) {
    const d = it.dir; bAx.set(d.z, 0, -d.x); if (bAx.lengthSq() < 1e-6) bAx.set(1, 0, 0); bAx.normalize();
    const px = it.x + d.x * it.pr, pz = it.z + d.z * it.pr, py = it.py, sy = 1 - (1 - it.sy) * clamp(k, 0, 1);
    out.makeTranslation(px, py, pz).multiply(bM2.makeRotationAxis(bAx, it.ang * k)).multiply(bM3.makeScale(1, sy, 1));
    return out.multiply(bM2.makeTranslation(-px, -py, -pz));
  }
  // where everything goes for the tip / flatten / a kick: its own world transform on top of the fallen one
  function slideT(it, A, out) {
    const c = it.lieC; out.makeTranslation(c.x + A.ox, 0, c.z + A.oz).multiply(bM2.makeRotationY(A.spin)).multiply(bM3.makeTranslation(-c.x, 0, -c.z));
    return out.multiply(it.Tfall);
  }
  const fxP = new THREE.Vector3();
  function brkFx(it, dir, power, broke, at = null) {
    const p = at || fxP.set(it.x, it.cy + it.floor, it.z);
    if (W.fx && W.fx.debris) for (const [kind, n] of it.deb) W.fx.debris(p, dir, kind, Math.round(n * (broke ? 1 : 0.25) * Math.min(1.5, 0.5 + power * 0.5)), broke ? 0.6 + power * 0.6 : 0.4, broke ? it.spread : 0.12, it.floor, kind === 'plastic' || kind === 'metal' ? it.tint : null);
    if (broke && W.fx && W.fx.dust) W.fx.dust(fxP.set(it.x, it.floor + 0.1, it.z), it.mat === 'leaves' ? 3 : 6, it.mat === 'leaves' ? [0.3, 0.34, 0.2] : [0.45, 0.4, 0.32], 0.6);
    if (W.SND && W.SND.breakSound) W.SND.breakSound(it.mat, p, power, broke);
    if (W.onNoise) W.onNoise(p, broke ? 14 + power * 6 : 7);
  }
  // is there something solid at (x, z) that isn't this thing itself? (for where its bits come down)
  function brkBlocked(it, x, z) {
    if (!grid) return false;
    const i0 = clamp(Math.floor((x - 0.6 - GX0) / GC), 0, GN - 1), i1 = clamp(Math.floor((x + 0.6 - GX0) / GC), 0, GN - 1), j0 = clamp(Math.floor((z - 0.6 - GX0) / GC), 0, GN - 1), j1 = clamp(Math.floor((z + 0.6 - GX0) / GC), 0, GN - 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) for (const b of grid[j * GN + i]) {   // (its own walk: breakIt runs inside loops over near())
      if (b.off || b.brk === it || b.y1 < 0.25 || b.y0 > 1.0 || b.leafSol) continue;
      const dx = x - b.x, dz = z - b.z, lx = b.c * dx - b.s * dz, lz = b.s * dx + b.c * dz;
      if (Math.abs(lx) < b.hx + 0.08 && Math.abs(lz) < b.hz + 0.08) return true;
    }
    return false;
  }
  const wobM = new THREE.Matrix4();   // (brkApply reuses bM inside: the wobble hands it a copy)
  function breakIt(it, dir, power = 1, by = 'melee') {
    if (it.broken) return false;
    it.broken = true; it.by = by;
    it.dir.set(dir.x, 0, dir.z); if (it.dir.lengthSq() < 1e-6) it.dir.set(it.nx, 0, it.nz); it.dir.normalize();
    for (let i = brkAnim.length - 1; i >= 0; i--) if (brkAnim[i].it === it) brkAnim.splice(i, 1);
    for (const b of it.boxes) b.off = true;
    // falling over: not into a wall, a car or a porch. Probe where it would land; failing that turn it aside or back
    if (it.mode !== 'flatten' && it.mode !== 'swap' && it.h > 0.4) {
      const L2 = Math.max(0.5, it.h * 0.9), free = (dx, dz) => !brkBlocked(it, it.x + dx * L2, it.z + dz * L2) && !brkBlocked(it, it.x + dx * L2 * 0.5, it.z + dz * L2 * 0.5);
      const d0 = it.dir.clone();
      if (!free(d0.x, d0.z)) for (const [ax2, az2] of [[d0.z, -d0.x], [-d0.z, d0.x], [-d0.x, -d0.z]]) if (free(ax2, az2)) { it.dir.set(ax2, 0, az2); break; }
    }
    // the broken pieces: the side ones (boards and pickets lying on the ground) go where it was pushed
    const flip = it.dir.x * it.nx + it.dir.z * it.nz < 0;
    bM3.makeTranslation(it.x, 0, it.z).multiply(bM2.makeRotationY(Math.PI)).multiply(bM.makeTranslation(-it.x, 0, -it.z));
    const fly = [], mirM = new THREE.Matrix4();
    for (const p of it.bparts) {
      let M = p.side && flip ? bM2.multiplyMatrices(bM3, p.m0) : p.m0;
      if (p.side && brkBlocked(it, M.elements[12], M.elements[14])) {   // it'd land inside something: the other side, or not at all
        mirM.multiplyMatrices(bM3, p.m0); if (flip) mirM.copy(p.m0);
        if (!brkBlocked(it, mirM.elements[12], mirM.elements[14])) M = mirM; else { setPart(p, ZM); continue; }
      }
      if (it.mode === 'swap' && p.side && p.L && p.L.im) { fly.push({ p, M: M.clone() }); setPart(p, ZM); } else setPart(p, M); }
    if (fly.length) {   // the boards and pickets fly off and land, rather than popping onto the lawn
      const ax = new THREE.Vector3(it.dir.z, 0, -it.dir.x);
      for (const f of fly) { f.p1 = new THREE.Vector3(); f.q1 = new THREE.Quaternion(); f.s1 = new THREE.Vector3(); f.M.decompose(f.p1, f.q1, f.s1);
        f.p0 = new THREE.Vector3(it.x + (f.p1.x - it.x) * 0.25, (it.cy ?? 0.5) + Math.random() * 0.2, it.z + (f.p1.z - it.z) * 0.25);
        f.q0 = new THREE.Quaternion().setFromAxisAngle(ax, -1.3 + (Math.random() - 0.5) * 0.4).multiply(f.q1); }
      brkAnim.push({ it, kind: 'scatter', t: 0, dur: 0.32 + Math.random() * 0.08, fly });
    }
    if (it.mode === 'swap') { for (const p of it.parts) setPart(p, ZM); for (const ob of it.objs) ob.o.visible = false; brkBounds(); }
    else { for (const p of it.parts) if (p.hide) setPart(p, ZM); it.T = new THREE.Matrix4(); brkAnim.push({ it, kind: 'fall', t: 0, dur: it.mode === 'flatten' ? 0.3 : 0.45 + it.h * 0.12 }); if (it.cont) { it.cont.parts = null; it.cont.hidden = true; } }
    navPatch(it.boxes);
    brkFx(it, it.dir, power, true);
    // fences hang together: a post going over takes the panels either side with it; a panel going shakes its posts
    if (it.panels) { const pd = it.dir.clone(); for (const pn of it.panels) if (!pn.broken) breakIt(pn, pd, power * 0.7, by); }
    if (it.posts) for (const po of it.posts) if (!po.broken) { for (let i = brkAnim.length - 1; i >= 0; i--) if (brkAnim[i].it === po && brkAnim[i].kind === 'wobble') brkAnim.splice(i, 1); brkAnim.push({ it: po, kind: 'wobble', t: 0, amp: 0.04, dx: it.dir.x, dz: it.dir.z }); }
    return true;
  }
  // it's over: a bin or a chair lying there is solid again (low: you can step over it), its search spot moves to it
  function fallen(it) {
    tipT(it, 1, it.T); it.Tfall = it.T.clone();
    bP.set(it.x, it.h / 2, it.z).applyMatrix4(it.T); it.lieC = { x: bP.x, z: bP.z };
    if (it.lie) for (const b of it.bboxes) { if (!b.lieBox) continue; regrid(b, () => { b.x = bP.x; b.z = bP.z; b.yaw = Math.atan2(it.dir.x, it.dir.z); }); b.off = false; b.lieOff = false; navPatch([b]); }
    if (it.cont) {
      const c = it.cont, d = it.dir, open = it.h * 0.45;
      c.x = bP.x + d.x * open; c.z = bP.z + d.z * open; c.y = 0.35; c.yaw = Math.atan2(d.x, d.z);
      c.stand = { x: bP.x + d.x * (open + 0.55), z: bP.z + d.z * (open + 0.55), yaw: Math.atan2(-d.x, -d.z) }; c.hidden = false;
      for (const pr of it.props || []) { if (pr.taken || pr.mesh) continue; bM.compose(pr.p, pr.q, pr.s).premultiply(it.T).decompose(pr.p, pr.q, pr.s); applyProp(pr, pr.p, pr.q, pr.s); }
    }
    brkBounds();
  }
  // something lying on the ground (a bin, a chair) knocked along: it slides, turns, and stops
  function kick(it, dir, sp) {
    if (!it.Tfall || brkAnim.some(A => A.it === it && A.kind === 'fall')) return;
    let A = brkAnim.find(a => a.it === it && a.kind === 'slide');
    if (!A) { A = { it, kind: 'slide', t: 0, ox: it.kox || 0, oz: it.koz || 0, spin: it.kspin || 0, vx: 0, vz: 0, w: 0 }; brkAnim.push(A); }
    const v = Math.min(9, sp * 0.8); A.vx += dir.x * v; A.vz += dir.z * v; A.w += (Math.random() - 0.5) * v * 1.2; A.t = 0;
    if (it.cont) it.cont.hidden = true;
    brkFx(it, dir, Math.min(1.5, sp / 6), false, fxP.set(it.lieC.x + (it.kox || 0), 0.4, it.lieC.z + (it.koz || 0)));
  }
  function updateBreakables(dt) {
    brkClock += dt;
    for (let i = brkAnim.length - 1; i >= 0; i--) {
      const A = brkAnim[i], it = A.it; A.t += dt;
      if (A.kind === 'fall') {
        const k = Math.min(1, A.t / A.dur), e = it.mode === 'flatten' ? 1 - (1 - k) * (1 - k) : k < 0.8 ? (k / 0.8) ** 2 : 1 - Math.sin((k - 0.8) / 0.2 * Math.PI) * 0.06;
        brkApply(it, tipT(it, e, it.T));
        if (k >= 1) { brkAnim.splice(i, 1); fallen(it); if (it.launch) { const L2 = it.launch; it.launch = null; kick(it, it.dir, L2.v); } if (it.mode === 'tip' && W.SND && W.SND.impact) W.SND.impact(fxP.set(it.lieC.x, 0.2, it.lieC.z), it.mat === 'leaves' ? 'leaves' : it.mat, 0.7); }
      } else if (A.kind === 'scatter') {
        const k = Math.min(1, A.t / A.dur), e = 1 - (1 - k) * (1 - k);
        for (const f of A.fly) {
          if (k >= 1) { setPart(f.p, f.M); continue; }
          bP.lerpVectors(f.p0, f.p1, e); bP.y += 0.6 * Math.sin(Math.PI * k) * (1 - k * 0.3);
          scQ.slerpQuaternions(f.q0, f.q1, e); setPart(f.p, bM.compose(bP, scQ, f.s1));
        }
        if (k >= 1) { brkAnim.splice(i, 1); brkBounds(); }
      } else if (A.kind === 'wobble') {
        const a = A.amp * Math.sin(A.t * 38) * Math.exp(-A.t * 10);
        bAx.set(A.dz, 0, -A.dx).normalize();
        bM.makeTranslation(it.x, it.py, it.z).multiply(bM2.makeRotationAxis(bAx, a)).multiply(bM3.makeTranslation(-it.x, -it.py, -it.z));
        if (A.t > 0.4) { brkAnim.splice(i, 1); brkApply(it, null); } else brkApply(it, wobM.copy(bM));
      } else if (A.kind === 'slide') {
        const f = Math.exp(-3.5 * dt); A.vx *= f; A.vz *= f; A.w *= f;
        A.ox += A.vx * dt; A.oz += A.vz * dt; A.spin += A.w * dt;
        // it stops at a wall (or anything solid) rather than going through it
        const cx = it.lieC.x + A.ox, cz = it.lieC.z + A.oz, q = { x: cx, z: cz, gy: 0 };
        for (const b of it.bboxes) b.off = true;
        W.collide(q, 0.3); if (Math.hypot(q.x - cx, q.z - cz) > 1e-3) { A.ox += q.x - cx; A.oz += q.z - cz; A.vx *= -0.3; A.vz *= -0.3; }
        it.kox = A.ox; it.koz = A.oz; it.kspin = A.spin;
        it.T = slideT(it, A, it.T); brkApply(it, it.T);
        const sp = Math.hypot(A.vx, A.vz);
        if (sp < 0.15 || A.t > 4) {
          brkAnim.splice(i, 1);
          const yw = Math.atan2(it.dir.x, it.dir.z) + A.spin, nxp = it.lieC.x + A.ox, nzp = it.lieC.z + A.oz;
          for (const b of it.bboxes) if (b.lieBox) { regrid(b, () => { b.x = nxp; b.z = nzp; b.yaw = yw; }); b.off = false; }
          if (it.cont) { const c = it.cont, d = { x: Math.sin(yw), z: Math.cos(yw) }, open = it.h * 0.45; c.x = nxp + d.x * open; c.z = nzp + d.z * open; c.yaw = yw; c.stand = { x: nxp + d.x * (open + 0.55), z: nzp + d.z * (open + 0.55), yaw: yw + Math.PI }; c.hidden = false; }
          brkBounds();
        }
      }
    }
  }
  // move a solid box (a car left somewhere new, a bin knocked over): out of the grid cells it was in, into the new ones,
  // and the zombies' route map patched at both places
  function regrid(b, fn) {
    const old = { x: b.x, z: b.z, hx: b.hx, hz: b.hz, c: b.c, s: b.s, r: b.r, y0: b.y0, y1: b.y1 };
    if (grid) {
      const i0 = clamp(Math.floor((b.x - b.r - GX0) / GC), 0, GN - 1), i1 = clamp(Math.floor((b.x + b.r - GX0) / GC), 0, GN - 1), j0 = clamp(Math.floor((b.z - b.r - GX0) / GC), 0, GN - 1), j1 = clamp(Math.floor((b.z + b.r - GX0) / GC), 0, GN - 1);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const a = grid[j * GN + i], k = a.indexOf(b); if (k >= 0) a.splice(k, 1); }
    }
    fn(); b.c = Math.cos(b.yaw); b.s = Math.sin(b.yaw); b.r = Math.hypot(b.hx, b.hz);
    if (grid) { addToGrid(b); navPatch([old, b]); }
  }
  W.moveBox = (b, x, z, yaw) => regrid(b, () => { b.x = x; b.z = z; b.yaw = yaw; });
  // do a box and a body rectangle (centre x z, heading yaw, half sizes hx across hz along, the box's centre bo ahead) overlap?
  function obbHit(b, x, z, yaw, hx, hz, bo) {
    const c = Math.cos(yaw), s = Math.sin(yaw), cx = x + s * bo, cz = z + c * bo, dx = b.x - cx, dz = b.z - cz;
    const A = [[c, -s, hx], [s, c, hz]], Bx = [[b.c, -b.s, b.hx], [b.s, b.c, b.hz]];
    for (const [ux, uz] of [A[0], A[1], Bx[0], Bx[1]]) {
      const ra = Math.abs(A[0][0] * ux + A[0][1] * uz) * hx + Math.abs(A[1][0] * ux + A[1][1] * uz) * hz;
      const rb = Math.abs(Bx[0][0] * ux + Bx[0][1] * uz) * b.hx + Math.abs(Bx[1][0] * ux + Bx[1][1] * uz) * b.hz;
      if (Math.abs(dx * ux + dz * uz) > ra + rb) return false;
    }
    return true;
  }
  // a car going through: its body rectangle (x z yaw hx hz bo, as in obbHit), v its speed along its heading and vs
  // sideways (m/s). Everything it's going fast enough to break, breaks; bins and chairs already down get knocked on.
  // Returns null, or { slow (the share of its speed it lost), dent (0..1), hits, mat, x, z (where) }
  W.carBreak = (x, z, yaw, hx, hz, bo, v, vs = 0) => {
    const sp = Math.hypot(v, vs); if (sp < 0.8) return null;
    const fx = Math.sin(yaw), fz = Math.cos(yaw), sg = Math.sign(v) || 1;
    const dir = bV.set(fx * v + Math.cos(yaw) * vs, 0, fz * v - Math.sin(yaw) * vs).normalize().clone();
    let res = null;
    for (const b of near(x, z, hz + Math.abs(bo) + 1.5)) {
      if (b.off || !b.brk || !obbHit(b, x, z, yaw, hx + 0.14, hz + 0.14, bo)) continue;
      const it = b.brk;
      if (it.broken) { if (it.kick && sp > 1.2 && !(it.kickT > brkClock)) { it.kickT = brkClock + 0.4; kick(it, dir, sp); } continue; }
      if (sp < it.carMin) continue;
      breakIt(it, dir, Math.min(2, sp / 6), 'car');
      if (it.kick && sp > 3) {   // hit fast: it tips over quickly, then skids and tumbles away along the car's line
        const FA = brkAnim.find(A => A.it === it && A.kind === 'fall'); if (FA) FA.dur = Math.min(FA.dur, Math.max(0.18, 0.5 - sp * 0.03));
        it.launch = { v: sp * 0.7 };
      }
      res ||= { slow: 0, dent: 0, hits: 0, mat: it.mat, x: b.x, z: b.z, front: sg > 0 };
      res.slow = Math.min(0.6, res.slow + it.carK * clamp(7 / sp, 0.5, 1.4)); res.dent = Math.min(1, res.dent + it.dent * Math.min(1, sp / 8)); res.hits++;
      if (it.mat === 'wood' || res.mat === 'leaves') res.mat = it.mat;
    }
    return res;
  };
  // a grenade or a gas tank going up: fences, hedges, bins and pots within reach break (or take a beating) away from it
  W.blastBreak = (pos, R = 6) => {
    const RR = R * 0.8;
    for (const it of W.breakables) {
      if (it.broken) continue;
      const dx = it.x - pos.x, dz = it.z - pos.z, d = Math.hypot(dx, dz); if (d > RR) continue;
      const k = 1 - d / RR; bV.set(dx, 0, dz); if (bV.lengthSq() < 1e-6) bV.set(it.nx, 0, it.nz); bV.normalize();
      if (k > 0.25 || it.hp <= it.maxHp * k * 3) { breakIt(it, bV, 0.8 + k * 1.2, 'blast'); if (it.kick) it.launch = { v: 3 + k * 6 }; }
      else { it.hp -= k * 4; brkFx(it, bV, k, false); }
    }
  };
  // a melee swing landing at point (going along dir): which breakable is there? It takes the blow (weaponId and power
  // decide how much) and breaks once it's had enough. Returns null (nothing there), or { hit, broke, kind, mat, hp, p }
  const WPN = { axe: { wood: 2.2, leaves: 2, plastic: 2.2, clay: 4, metal: 0.7 }, machete: { wood: 0.8, leaves: 2.6, plastic: 1.4, clay: 3, metal: 0.25 }, crowbar: { wood: 1.6, leaves: 0.7, plastic: 2, clay: 4, metal: 1.1 }, bat: { wood: 1.3, leaves: 0.6, plastic: 2, clay: 4, metal: 0.9 }, knife: { wood: 0.25, leaves: 0.9, plastic: 0.5, clay: 2, metal: 0.05 }, fists: { wood: 0.12, leaves: 0.3, plastic: 0.8, clay: 1.2, metal: 0.05 } };
  const hbD = new THREE.Vector3(), hbP = new THREE.Vector3();
  W.hitBreakable = (point, dir, power = 1, weaponId = 'fists') => {
    let best = null, bd = 0.5;
    for (const b of near(point.x, point.z, 1.6)) {
      if (!b.brk || b.off) continue;
      if (point.y < b.y0 - 0.35 || point.y > b.y1 + 1.0) continue;
      const dx = point.x - b.x, dz = point.z - b.z, lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
      const d = Math.hypot(Math.max(0, Math.abs(lx) - b.hx), Math.max(0, Math.abs(lz) - b.hz));
      if (d < bd) { bd = d; best = b; }
    }
    if (!best) return null;
    const it = best.brk, d3 = hbD.set(dir.x, 0, dir.z); if (d3.lengthSq() < 1e-6) d3.set(it.nx, 0, it.nz); d3.normalize();
    const p = hbP.set(point.x, clamp(point.y, best.y0 + 0.05, Math.max(best.y0 + 0.05, best.y1 - 0.05)), point.z);
    if (it.broken) { if (it.kick) kick(it, d3, 2.5 * power); else brkFx(it, d3, 0.4, false, p); return { hit: true, broke: false, kicked: !!it.kick, kind: it.kind, mat: it.mat, hp: 0, p: p.clone() }; }
    const k = ((WPN[weaponId] || WPN.bat)[it.mat] ?? 0.5) * power;
    it.hp -= k;
    if (it.hp <= 0) { breakIt(it, d3, clamp(0.5 + power * 0.4, 0.5, 1.3), 'melee'); return { hit: true, broke: true, kind: it.kind, mat: it.mat, hp: 0, p: p.clone() }; }
    if (it.mode !== 'swap' || it.mat === 'leaves') { for (let i = brkAnim.length - 1; i >= 0; i--) if (brkAnim[i].it === it && brkAnim[i].kind === 'wobble') brkAnim.splice(i, 1); brkAnim.push({ it, kind: 'wobble', t: 0, amp: Math.min(0.09, 0.02 + k * 0.025) * (it.mat === 'leaves' ? 1.5 : 1), dx: d3.x, dz: d3.z }); }
    brkFx(it, d3, Math.min(1, k), false, p);
    return { hit: true, broke: false, kind: it.kind, mat: it.mat, hp: Math.max(0, it.hp / it.maxHp), p: p.clone() };
  };
  // the standing breakable nearest x z within r (for a prompt, a bot, a test)
  W.breakableAt = (x, z, r = 1.5) => { let best = null, bd = r; for (const it of W.breakables) { if (it.broken) continue; const d = Math.hypot(it.x - x, it.z - z); if (d < bd) { bd = d; best = it; } } return best; };
  // everything whole again (a new game)
  W.resetBreakables = () => {
    brkAnim.length = 0; const touched = [];
    for (const it of W.breakables) {
      if (!it.broken && it.hp === it.maxHp && !it.T) continue;
      it.broken = false; it.hp = it.maxHp; it.T = null; it.Tfall = null; it.lieC = null; it.kox = it.koz = it.kspin = 0; it.launch = null;
      brkApply(it, null); for (const ob of it.objs) ob.o.visible = true;
      for (const p of it.bparts) setPart(p, ZM);
      const on = !it.chaos || it.chaos.shown;
      for (const b of it.boxes) { b.off = !on; touched.push(b); }
      for (const b of it.bboxes) { if (b.home && (b.x !== b.home.x || b.z !== b.home.z || b.yaw !== b.home.yaw)) regrid(b, () => Object.assign(b, b.home)); b.off = true; touched.push(b); }
      if (it.cont) { Object.assign(it.cont, it.cont0, { stand: { ...it.cont0.stand } }); it.cont.hidden = false; }
    }
    if (touched.length) navPatch(touched);
    brkBounds();
  };
  // ---- the breakable garden things (house() places them)
  // a young tree, staked: a thin trunk, a small crown; a car snaps it at the base and it goes over
  function sapling(x, z, s = 1, r = Math.random) {
    const h = 3.0 * s, K = bkit();
    inst(K.stakeG, K.stake, mat4(x + 0.16, 0, z + 0.05, r() * 0.3, 1, 1.25, 1, 0, 0.04));   // the stake stays (it's in the ground)
    breakable('sapling', x, z, r() * 6, { mat: 'wood', mode: 'tip', hp: 4, py: 0.22, ang: 1.3, carMin: 3, carK: 0.15, dent: 0.35, h, cy: h * 0.7, deb: [['leaf', 34], ['twig', 8], ['splinter', 6]], spread: 0.8 }, () => {
      inst(GEO.trunk, MAT.bark, mat4(x, 0, z, r() * 6, 0.32 * s, h * 0.78, 0.32 * s, (r() - 0.5) * 0.04, (r() - 0.5) * 0.04));
      for (let i = 0; i < 4; i++) inst(GEO.branch, MAT.bark, mat4(x, h * (0.45 + r() * 0.2), z, i / 4 * 6.28 + r(), 0.7 * s, (0.7 + r() * 0.5) * s, 0.7 * s, 0.7 + r() * 0.4, 0));
      const n = 5 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) { const a = r() * 6.28, q = r() * 0.55 * s, y = h * (0.68 + r() * 0.25), sc = (0.45 + r() * 0.25) * s; inst(GEO.clump, MAT.leaves, mat4(x + Math.cos(a) * q, y, z + Math.sin(a) * q, r() * 6, sc * 1.1, sc * 0.9, sc * 1.1)); }
      inst(GEO.ubox, MAT.black, mat4(x + 0.08, 1.1, z + 0.025, 0, 0.18, 0.02, 0.02), false);   // the tie to the stake
      solid(x, z, 0.09, 0.09, 0, h, 'wood');
    }, () => inst(K.stump, MAT.bark, mat4(x, 0, z, r() * 6, 0.085 * s, 0.26, 0.085 * s)));
  }
  // a clay pot by the door (on the porch: y0), something green in it
  function flowerPot(x, z, y0 = 0, r = Math.random, bloomG = null, bloomM = null) {
    const K = bkit(), sc = 0.85 + r() * 0.35;
    breakable('pot', x, z, r() * 6, { mat: 'clay', hp: 1, carMin: 1, carK: 0.01, dent: 0.02, h: 0.33 * sc, cy: 0.18 * sc, floor: y0, deb: [['clay', 12], ['soil', 16], ['leaf', 6]], spread: 0.12 }, () => {
      inst(K.pot, K.terracotta, mat4(x, y0, z, 0, sc, sc, sc));
      inst(K.potSoil, K.soil, mat4(x, y0, z, 0, sc, sc, sc), false);
      inst(GEO.clump, MAT.hedge, mat4(x, y0 + 0.42 * sc, z, r() * 6, 0.2 * sc, 0.17 * sc, 0.2 * sc), false);
      if (bloomG) for (let k = 0; k < 6; k++) { const a = r() * 6.28, q = 0.12 * sc * r(); inst(bloomG, bloomM, mat4(x + Math.cos(a) * q, y0 + (0.5 + r() * 0.06) * sc, z + Math.sin(a) * q, r() * 6, 1, 0.6, 1), false); }
      solid(x, z, 0.19 * sc, 0.19 * sc, 0, y0 + 0.36 * sc, 'clay', y0, { vault: true, navSkip: true });
    }, () => {
      inst(K.potBase, K.terracotta, mat4(x, y0, z, 0, sc, sc, sc), false);
      inst(K.soilHeap, K.soil, mat4(x + 0.05, y0, z, r() * 6, sc * 1.2, sc, sc * 1.2), false);
      for (let k = 0; k < 5; k++) { const a = r() * 6.28, q = 0.22 + r() * 0.25; inst(K.shard, K.terracotta, mat4(x + Math.cos(a) * q, y0 + 0.012, z + Math.sin(a) * q, r() * 6, 0.5 + r() * 0.4, 0.5, 0.5 + r() * 0.4, Math.PI / 2, 0), false); }
      inst(GEO.clump, MAT.hedge, mat4(x + 0.2, y0 + 0.08, z, r() * 6, 0.2 * sc, 0.12 * sc, 0.2 * sc), false);
    });
  }
  // a yard sign on a wooden stake
  function yardSign(x, z, yaw, k = 0) {
    const K = bkit(), sm = K.signs[k % K.signs.length];
    breakable('sign', x, z, yaw, { mat: 'wood', mode: 'tip', hp: 2, py: 0.1, ang: 1.42, carMin: 2, carK: 0.02, dent: 0.06, h: 1.0, cy: 0.7, deb: [['splinter', 5], ['plastic', 3]], tint: [0.8, 0.2, 0.2] }, () => {
      inst(K.stakeG, K.stake, mat4(x, 0, z, yaw));
      inst(K.signBoard, [K.stake, K.stake, K.stake, K.stake, sm, sm], mat4(x, 0.78, z + 0, yaw));
      solid(x, z, 0.3, 0.05, yaw, 1.02, 'wood', 0, { vault: true, navSkip: true });
    }, () => inst(K.splitPost, K.stake, mat4(x, 0, z, yaw, 0.045, 0.12, 0.045)));
  }
  // a plastic garden chair, or the little round table: knocked over, kicked along
  function gardenChair(x, z, yaw, mat = null) {
    const K = bkit(), m = mat || K.chairWhite;
    breakable('chair', x, z, yaw, { mat: 'plastic', mode: 'tip', kick: true, hp: 1.5, py: 0, pr: 0.25, ang: Math.PI / 2 * 0.92, carMin: 1.2, carK: 0.02, dent: 0.04, h: 0.85, cy: 0.5, lie: true, deb: [['plastic', 5]], tint: [m.color.r, m.color.g, m.color.b] }, () => {
      inst(K.chairG, m, mat4(x, 0, z, yaw));
      solid(x, z, 0.28, 0.27, yaw, 0.9, 'plastic', 0, { navSkip: true });
    });
    const it = W.breakables[W.breakables.length - 1];
    it.bboxes.push(solid(x, z, 0.3, 0.42, yaw, 0.5, 'plastic', 0, { vault: true, navSkip: true, brk: it, off: true, lieBox: true, home: { x, z, yaw, hx: 0.3, hz: 0.42, y0: 0, y1: 0.5 } }));
  }
  function gardenTable(x, z, mat = null) {
    const K = bkit(), m = mat || K.chairWhite;
    breakable('table', x, z, 0, { mat: 'plastic', mode: 'tip', kick: true, hp: 2, py: 0, pr: 0.33, ang: Math.PI / 2 * 0.95, carMin: 1.2, carK: 0.03, dent: 0.05, h: 0.72, cy: 0.5, lie: true, deb: [['plastic', 6]], tint: [m.color.r, m.color.g, m.color.b] }, () => {
      inst(K.tableG, m, mat4(x, 0, z, 0));
      solid(x, z, 0.33, 0.33, 0, 0.74, 'plastic', 0, { vault: true, navSkip: true });
    });
    const it = W.breakables[W.breakables.length - 1];
    it.bboxes.push(solid(x, z, 0.36, 0.38, 0, 0.7, 'plastic', 0, { vault: true, navSkip: true, brk: it, off: true, lieBox: true, home: { x, z, yaw: 0, hx: 0.36, hz: 0.38, y0: 0, y1: 0.7 } }));
  }
  // a pallet with a crate or two on it (or a stack of two pallets): smashed to slats
  function crateStack(x, z, yaw, n = 1) {
    const K = bkit(), c = Math.cos(yaw), s = Math.sin(yaw);
    breakable('crates', x, z, yaw, { mat: 'wood', hp: 4.5, carMin: 2.5, carK: 0.14, dent: 0.3, h: 0.15 + n * 0.48, cy: 0.4, deb: [['splinter', 30]], spread: 0.6 }, () => {
      inst(K.palletG, K.pallet, mat4(x, 0, z, yaw));
      for (let k = 0; k < n; k++) { const lx = k === 0 ? -0.31 : k === 1 ? 0.31 : 0; inst(K.crateG, K.crate, mat4(x + c * lx, k === 2 ? 0.625 : 0.145, z - s * lx, yaw + (k === 2 ? 0.2 : (Math.random() - 0.5) * 0.06))); }
      solid(x, z, 0.6, 0.5, yaw, n > 2 ? 1.1 : 0.63, 'wood', 0, { vault: n <= 2 });
    }, () => {
      inst(K.palletG, K.pallet, mat4(x + s * 0.1, 0, z + c * 0.1, yaw + 0.25, 1, 0.7, 1, 0.05, 0.08), false);
      for (let k = 0; k < 9 * n; k++) { const a = Math.random() * 6.28, q = 0.3 + Math.random() * 1.2; inst(K.board, K.crate, mat4(x + Math.cos(a) * q, 0.012 + Math.random() * 0.004, z + Math.sin(a) * q, Math.random() * 6, 0.45 + Math.random() * 0.2, 1, 0.75, (Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 0.15), false); }
      for (let k = 0; k < 2; k++) inst(GEO.ubox, K.crate, mat4(x + (Math.random() - 0.5), 0.03, z + (Math.random() - 0.5), Math.random() * 6, 0.045, 0.045, 0.45, Math.PI / 2, 0), false);
    });
  }
  // ---------------- searchable containers ----------------
  // kind decides the loot table; label is what the prompt says; y is how high it is (low → you crouch to search)
  function container(kind, x, z, y, label, yaw = 0, house = null, extra = {}) {
    const c = { id: W.containers.length, kind, x, z, y, label, yaw, house, searched: false, ...extra };
    W.containers.push(c); if (CI) CI.containers.push(c); return c;
  }
  W.container = container;
  // opening things: hinged leaves swing, drawers slide, lids lift; eased, and they stay open
  W.opening = [];
  const applyOpen = (c, e) => { for (const pt of c.parts) { if (pt.inner) pt.inner.visible = e > 0.001; if (pt.kind === 'slide') { pt.base ??= pt.o.position.z; pt.o.position.z = pt.base + pt.d * e; } else { const ax = pt.axis || 'y'; pt.base ??= pt.o.rotation[ax]; pt.o.rotation[ax] = pt.base + pt.a * e; } } };
  W.open = c => { if (!c.parts || c.openTarget === 1) return false; c.openTarget = 1; c.openK = c.openK || 0; if (!W.opening.includes(c)) W.opening.push(c); return true; };
  W.closeAll = () => { W.opening.length = 0; W.openNow.length = 0; for (const c of W.containers) if (c.parts && c.openK) { c.openK = 0; c.openTarget = 0; applyOpen(c, 0); leafSolids(c, false); } };
  // an open cupboard, fridge or closet door is solid where it stands open (you can't walk through it); once you're well
  // away it swings shut again (so a searched house isn't left with every door hanging open)
  W.openNow = [];
  const lsB = new THREE.Box3(), lsV = new THREE.Vector3(), lsQ = new THREE.Quaternion();
  function leafSolids(c, on) {
    if (!c.parts || c.car) return;
    for (const pt of c.parts) {
      if (pt.kind !== 'hinge' || (pt.axis && pt.axis !== 'y')) continue;
      if (on && !pt.sol) {
        const m = pt.o.children.find(ch => ch.isMesh) || pt.o.children[0]; if (!m) continue;
        pt.o.updateWorldMatrix(true, true); lsB.setFromObject(pt.o);
        const h = lsB.max.y - lsB.min.y; if (h < 0.3) continue;
        m.getWorldPosition(lsV); pt.o.getWorldQuaternion(lsQ);
        const ax = new THREE.Vector3(1, 0, 0).applyQuaternion(lsQ), yw = Math.atan2(-ax.z, ax.x);
        const hw = Math.max(0.1, Math.abs(m.position.x) - 0.01);   // the leaf's centre is half its width out from the hinge
        pt.sol = solid(lsV.x, lsV.z, hw, 0.025, yw, lsB.max.y, 'wood', Math.max(0, lsB.min.y), { navSkip: true, leafSol: true });
        if (grid) addToGrid(pt.sol);
      }
      if (pt.sol) pt.sol.off = !on;
    }
  }

  // ---------------- doors ----------------
  // a real door: a six-panel leaf that fills its frame, three hinges, a lever handle on each side, a deadbolt
  // (and a peephole on front doors), hung in a frame of jambs, head and casing trim, over a threshold
  const DOORCOL = [0x6a4a32, 0xe6e2d8, 0x7a2420, 0x3a5068, 0x4a5c3e];   // (no near-black leaves: they read as holes at dusk)
  const DOOR_H = 2.04, DT = 0.045;
  const doorKit = new Map();
  const ni = g => g.index ? g.toNonIndexed() : g;
  // inSide: which face of the leaf (±1 along its local z) is the room side — the hinge knuckles and the thumb-turn
  // show there; the key cylinder (and the peephole cover) face out
  function doorGeos(w, front, inSide = 1, interior = false) {
    const key = w.toFixed(3) + (front ? 'f' : 'b') + inSide + (interior ? 'i' : '');
    if (doorKit.has(key)) return doorKit.get(key);
    const leaf = [ni(new RoundedBoxGeometry(w, DOOR_H - 0.03, DT, 2, 0.006).translate(w / 2, 0.03 + (DOOR_H - 0.03) / 2, 0))];   // a 3 cm undercut: it clears the floor and the threshold
    // the raised panels, both faces: two columns, three rows (short at the top, tall in the middle and bottom)
    const pw = w * 0.34, rows = [[0.16, 0.84], [0.96, 1.6], [1.72, 1.94]];
    for (const cx of [w * 0.27, w * 0.73]) for (const [y0, y1] of rows) for (const sd of [1, -1]) {
      leaf.push(ni(new RoundedBoxGeometry(pw, y1 - y0, 0.012, 2, 0.004).translate(cx, (y0 + y1) / 2, sd * (DT / 2 + 0.002))));
    }
    // the hardware, both sides of the leaf
    const hw = [], hx = w - 0.065;
    for (const sd of [1, -1]) {
      hw.push(ni(new THREE.CylinderGeometry(0.03, 0.032, 0.012, 20).rotateX(Math.PI / 2).translate(hx, 0.97, sd * (DT / 2 + 0.006))));    // rose
      hw.push(ni(new THREE.CylinderGeometry(0.009, 0.009, 0.05, 10).rotateX(Math.PI / 2).translate(hx, 0.97, sd * (DT / 2 + 0.03))));    // neck
      hw.push(ni(new RoundedBoxGeometry(0.125, 0.02, 0.024, 2, 0.008).translate(hx - 0.055, 0.97, sd * (DT / 2 + 0.058))));            // lever
      if (!interior) {   // (bedroom and bathroom doors have just the lever)
        hw.push(ni(new THREE.CylinderGeometry(0.026, 0.028, 0.014, 18).rotateX(Math.PI / 2).translate(hx, 1.13, sd * (DT / 2 + 0.007)))); // deadbolt
        hw.push(ni(new THREE.BoxGeometry(0.012, sd === inSide ? 0.05 : 0.02, 0.016).translate(hx, 1.13, sd * (DT / 2 + 0.018))));        // thumb-turn inside / keyway outside
      }
      hw.push(ni(new THREE.BoxGeometry(0.026, 0.14, 0.003).translate(w - 0.001, 1.04, 0).rotateY(0)));                               // latch plate on the edge
    }
    for (const y of [0.22, 1.02, 1.82]) {   // hinges: barrel and knuckle caps
      hw.push(ni(new THREE.CylinderGeometry(0.009, 0.009, 0.1, 10).translate(-0.002, y, inSide * (DT / 2 + 0.004))));
      hw.push(ni(new THREE.SphereGeometry(0.0095, 8, 6).translate(-0.002, y + 0.052, inSide * (DT / 2 + 0.004))));
      hw.push(ni(new THREE.SphereGeometry(0.0095, 8, 6).translate(-0.002, y - 0.052, inSide * (DT / 2 + 0.004))));
      hw.push(ni(new THREE.BoxGeometry(0.035, 0.09, 0.003).translate(0.012, y, inSide * (DT / 2 + 0.0015))));
    }
    if (front) hw.push(ni(new THREE.CylinderGeometry(0.008, 0.008, DT + 0.016, 10).rotateX(Math.PI / 2).translate(w / 2, 1.52, 0)));   // peephole
    for (const g of [...leaf, ...hw]) for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    const out = { leaf: mergeGeometries(leaf), hw: mergeGeometries(hw) };
    doorKit.set(key, out); return out;
  }
  const brass = new THREE.MeshStandardMaterial({ color: 0xb8a070, roughness: 0.3, metalness: 1 });
  const DMATS = new Map(), doorMat = col => { if (!DMATS.has(col)) DMATS.set(col, new THREE.MeshStandardMaterial({ color: col, roughness: 0.6 })); return DMATS.get(col); };
  // a shop door: an aluminium frame round a full-height glass pane, a push bar across it, a kick plate
  function glassDoorGeos(w) {
    const key = 'glass' + w.toFixed(3);
    if (doorKit.has(key)) return doorKit.get(key);
    const fr = [], hw = [], H2 = 2.2, fw = 0.06, D2 = 0.05;
    fr.push(ni(new THREE.BoxGeometry(fw, H2, D2).translate(fw / 2, H2 / 2, 0)), ni(new THREE.BoxGeometry(fw, H2, D2).translate(w - fw / 2, H2 / 2, 0)));
    fr.push(ni(new THREE.BoxGeometry(w, 0.22, D2).translate(w / 2, 0.11, 0)), ni(new THREE.BoxGeometry(w, fw, D2).translate(w / 2, H2 - fw / 2, 0)));
    for (const sd of [1, -1]) {
      hw.push(ni(new THREE.CylinderGeometry(0.016, 0.016, w - 0.22, 10).rotateZ(Math.PI / 2).translate(w / 2, 1.0, sd * 0.075)));
      for (const ex of [0.13, w - 0.13]) hw.push(ni(new THREE.BoxGeometry(0.03, 0.03, 0.05).translate(ex, 1.0, sd * 0.045)));
    }
    const glass = ni(new THREE.BoxGeometry(w - 2 * fw, H2 - 0.22 - fw, 0.008).translate(w / 2, 0.22 + (H2 - 0.22 - fw) / 2, 0));
    for (const g of [...fr, ...hw, glass]) for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    const out = { leaf: mergeGeometries(fr), hw: mergeGeometries(hw), glass };
    doorKit.set(key, out); return out;
  }
  // hinge at (x, z); closed, the door runs along +local x (yaw) for w metres; it swings open by `dir` (±1)
  function door(x, z, yaw, dir = 1, col = 0xe6e2d8, house = null, opts = {}) {
    const w = opts.w || 0.92, front = !!opts.front;
    // YXZ: a broken door falls about its own width axis (flat on the floor), whichever way the wall runs
    const pivot = new THREE.Group(); pivot.position.set(x, 0, z); pivot.rotation.order = 'YXZ'; pivot.rotation.y = yaw; level.add(pivot);
    const G2 = opts.glassDoor ? glassDoorGeos(w) : doorGeos(w, front, -dir, !!opts.interior);
    const m = new THREE.Mesh(G2.leaf, opts.glassDoor ? MAT.alu : doorMat(col)); m.castShadow = true; m.receiveShadow = true; pivot.add(m);
    const hwm = new THREE.Mesh(G2.hw, front ? brass : MAT.metal); hwm.castShadow = false; pivot.add(hwm);
    if (G2.glass) { const gm = new THREE.Mesh(G2.glass, MAT.shopGlass); gm.renderOrder = 2; pivot.add(gm); }
    const c = Math.cos(yaw), sn = Math.sin(yaw), L = (lx, lz) => [x + c * lx + sn * lz, z - sn * lx + c * lz];
    // the frame (static): jambs, head, casing both faces, threshold
    if (opts.frame) {
      const T2 = opts.wallT || 0.2, tr = f => 'trim';
      const bx = (lx0, lx1, y0, y1, lz0, lz1, key = tr) => { const [cx, cz] = L((lx0 + lx1) / 2, (lz0 + lz1) / 2); B.box(cx, y0, cz, (lx1 - lx0) / 2, y1, (lz1 - lz0) / 2, yaw, key, TILE); };
      bx(-0.055, -0.004, 0, DOOR_H + 0.06, -T2 / 2 - 0.01, T2 / 2 + 0.01); bx(w + 0.004, w + 0.055, 0, DOOR_H + 0.06, -T2 / 2 - 0.01, T2 / 2 + 0.01);
      bx(-0.055, w + 0.055, DOOR_H + 0.006, DOOR_H + 0.06, -T2 / 2 - 0.01, T2 / 2 + 0.01);
      for (const sd of [1, -1]) {
        const z0 = sd * (T2 / 2), z1 = sd * (T2 / 2 + 0.018), lo = Math.min(z0, z1), hi = Math.max(z0, z1);
        bx(-0.13, -0.055, 0, DOOR_H + 0.13, lo, hi); bx(w + 0.055, w + 0.13, 0, DOOR_H + 0.13, lo, hi); bx(-0.13, w + 0.13, DOOR_H + 0.06, DOOR_H + 0.13, lo, hi);
      }
      bx(-0.01, w + 0.01, 0, 0.022, -T2 / 2 - 0.02, T2 / 2 + 0.02, () => 'darkWood');
    }
    const [cx, cz] = L(w / 2, 0);
    const box = solid(cx, cz, w / 2 + 0.01, 0.06, yaw, 2.05, 'wood', 0, { door: true });
    // where it stands when it's fully open: you can't walk through it
    const oa = yaw + dir * Math.PI / 2 * 0.95, [ox, oz] = [x + Math.cos(oa) * w / 2, z - Math.sin(oa) * w / 2];
    // the leaf's own box: it follows the leaf as it swings (a door is never a ghost half-way open)
    const obox = solid(ox, oz, w / 2, 0.07, oa, 2.05, 'wood', 0, { navSkip: true, off: true });   // (thicker than the leaf: nothing slips through it mid-swing)
    obox.r = w * 1.25;   // registered in the grid wide enough to be found anywhere along its arc
    const D = { id: W.doors.length, x: cx, z: cz, hx: x, hz: z, yaw, dir, w, open: 0, want: 0, hp: opts.hp || 140, maxHp: opts.hp || 140, broken: false, pivot, mesh: m, box, obox, house, locked: false, bangT: 0, interior: !!opts.interior, glass: !!opts.glassDoor };
    box.doorRef = D;
    W.doors.push(D); return D;
  }
  // the lever on your side of a door, in the world (it moves as the door swings)
  const hv = new THREE.Vector3();
  W.doorHandle = (D, px, pz, out) => {
    D.pivot.updateMatrixWorld(true);
    hv.set(px, 1, pz); D.pivot.worldToLocal(hv);
    return out.set(D.w - 0.12, 0.97, (hv.z >= 0 ? 1 : -1) * (DT / 2 + 0.06)).applyMatrix4(D.pivot.matrixWorld);
  };
  W.setDoor = (D, open) => { if (D.broken) return; D.want = open ? 1 : 0; };
  W.breakDoor = (D, dir) => {
    D.broken = true; D.box.off = true; D.want = 0; D.fall = { t: 0, dir };
  };

  // ---------------- a house ----------------
  // local frame: front wall faces +z (the street), the house is 12 m wide (x) and 10 m deep (z), centred on 0.
  let houseN = 0;
  function house(hx, hz, yaw, seed, opts = {}) {
    let s = seed * 9301 + 49297; const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    const flip = r() < 0.5 ? -1 : 1;   // mirror the floor plan left/right
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    const P = (lx, lz) => [hx + (lx * flip) * c + lz * sn, hz - (lx * flip) * sn + lz * c];   // local → world
    const Y = a => yaw + a;   // local yaw → world (a box's long axis along local x has yaw 0)
    const Wd = 12, Dp = 10, WH = 2.8, T = 0.2;
    const sid = 'siding' + Math.floor(r() * 8), pnt = 'paint' + Math.floor(r() * 6), pnt2 = 'paint' + Math.floor(r() * 6), roofM = 'shingle' + Math.floor(r() * 3);
    const H = { id: houseN++, x: hx, z: hz, yaw, flip, hw: Wd / 2, hd: Dp / 2, name: opts.name || ('house ' + houseN), rooms: [] };
    W.houses.push(H);
    H.lit = ((seed * 2654435761) >>> 0) % 100 < 38;   // a light left on inside (seen at night through the glass)
    H.sid = sid; H.roofM = roofM;
    paved.push(rectOf(hx, hz, 6.3, 5.3, yaw));   // no grass under the house (the lawn grows right up to it)
    // this house's own frame (with the mirror) for detailed one-off shapes: hm(geo, mat, local x, y, z, ...)
    const HX = new THREE.Matrix4().compose(new THREE.Vector3(hx, 0, hz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(flip, 1, 1));
    const hm = (geo, mat, lx, ly, lz, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0, shadow = true) => xadd(geo, mat, HX.clone().multiply(mat4(lx, ly, lz, ry, sx, sy, sz, rx, rz)), shadow);
    const hbox = (x0, y0, z0, x1, y1, z1, mat, shadow = true) => hm(GEO.ubox, mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, 0, x1 - x0, y1 - y0, z1 - z0, 0, 0, shadow);
    const brickFront = r() < 0.3; r();   // (that roll once picked a hip roof: every roof is a gable now, with an attic under it)
    const cur = 'curtain' + Math.floor(r() * 5);
    // ---- floors (per room) ----
    const floorBox = (x0, z0, x1, z1, key) => { const [cx, cz] = P((x0 + x1) / 2, (z0 + z1) / 2); B.box(cx, 0, cz, Math.abs(x1 - x0) / 2, 0.03, Math.abs(z1 - z0) / 2, yaw, f => f === 'top' ? key : null, TILE); };
    const fLiving = r() < 0.5 ? 'floorWood' : 'floorCarpet', fBed = r() < 0.5 ? 'floorCarpet2' : 'floorCarpet', fKit = r() < 0.5 ? 'floorTile' : 'floorTile2';
    // the ceiling: a real slab over the walls (its top only casts the shadow — from above you still look in)
    // (in four pieces round the attic hatch over the kitchen: local x 1.14..1.86, z -2.3..-0.9)
    { const ceil = (x0, z0, x1, z1) => { const [cx, cz] = P((x0 + x1) / 2, (z0 + z1) / 2); B.box(cx, WH - 0.12, cz, Math.abs(x1 - x0) / 2, WH - 0.02, Math.abs(z1 - z0) / 2, yaw, f => f === 'bot' ? 'ceiling' : f === 'top' ? 'shadowOnly' : 'trim', TILE); };
      const E6 = Wd / 2 + 0.12, E5 = Dp / 2 + 0.12; ceil(-E6, -E5, 1.14, E5); ceil(1.86, -E5, E6, E5); ceil(1.14, -E5, 1.86, -2.3); ceil(1.14, -0.9, 1.86, E5); }
    floorBox(-6, 0.4, 1, 5, fLiving); floorBox(1, 0.4, 6, 5, fBed); floorBox(-6, -5, 2.5, 0.4, fKit); floorBox(2.5, -5, 6, 0.4, 'floorTile');
    // the rooms (for footstep surfaces): local rects
    H.rooms = [[-6, 0.4, 1, 5, fLiving.startsWith('floorWood') ? 'wood' : 'carpet'], [1, 0.4, 6, 5, 'carpet'], [-6, -5, 2.5, 0.4, 'tile'], [2.5, -5, 6, 0.4, 'tile']];
    // ---- walls: straight runs with openings [t0, t1, sill, lintel] measured in metres along the run ----
    const DOORH = 2.1;
    function wall(ax, az, bx, bz, gaps, outside, inMat, outMat, o = {}) {
      let L = Math.hypot(bx - ax, bz - az); const dx = (bx - ax) / L, dz = (bz - az) / L;
      // exterior runs reach past the corners so the corners overlap (no sliver of light down the join)
      const ext = o.ext || 0; if (ext) { ax -= dx * ext; az -= dz * ext; L += 2 * ext; gaps = gaps.map(g => [g[0] + ext, g[1] + ext, ...g.slice(2)]); }
      const wyaw = Y(Math.atan2(-dz * 1, dx * flip));   // world yaw of the run (flip mirrors x)
      const ws = Math.sin(wyaw), wc = Math.cos(wyaw);
      // which side of the run's box (its local z) is the room: -1 / +1, or 0 for an inside wall (rooms both sides)
      const inZ = outside ? ((flip > 0) === (outside > 0) ? -1 : 1) : 0;
      gaps = gaps.slice().sort((a, b) => a[0] - b[0]);
      const cuts = [[0, 0]]; for (const g of gaps) cuts.push([g[0], g[1], g]); cuts.push([L, L]);
      // which face is "outside" in box space: the run's local +z side is to its left (x→z rotation)
      const faceMat = (yy0) => f => {
        if (f === 'top' || f === 'bot') return yy0 > 0.1 || f === 'top' ? 'trim' : null;
        if (f === 'px' || f === 'nx') return 'trim';
        const leftIsOut = outside;   // outside: +1 left (pz) is outside, -1 right (nz) is outside, 0: interior both sides
        if (leftIsOut === 0) return inMat;
        const isLeft = (f === 'pz') !== (flip < 0);
        return (isLeft === (leftIsOut > 0)) ? outMat : inMat;
      };
      // a thin board along one face of the run (zo: offset of its centre across the wall, th: its half thickness)
      const band = (t0, t1, y0, y1, zo, th, key) => { const m = (t0 + t1) / 2, [cx, cz] = P(ax + dx * m, az + dz * m); B.box(cx + ws * zo, y0, cz + wc * zo, (t1 - t0) / 2, y1, th, wyaw, ALL(key), TILE); };
      const seg = (t0, t1, y0, y1) => {
        if (t1 - t0 < 0.02 || y1 - y0 < 0.02) return;
        const m = (t0 + t1) / 2, [cx, cz] = P(ax + dx * m, az + dz * m);
        B.box(cx, y0, cz, (t1 - t0) / 2, y1, T / 2, wyaw, faceMat(y0), TILE);
        // skirting at the floor, crown moulding at the ceiling (room side); a concrete foundation outside
        const a0 = t0 + (ext && t0 < 0.01 ? ext + T / 2 : 0), a1 = t1 - (ext && t1 > L - 0.01 ? ext + T / 2 : 0);
        if (y0 < 0.01) {
          if (inZ) { band(a0, a1, 0, 0.09, inZ * (T / 2 + 0.007), 0.008, 'trim'); band(t0, t1, 0, 0.3, -inZ * (T / 2 + 0.012), 0.012, 'concrete'); if (o.wains) band(t0, t1, 0.3, Math.min(y1, 0.95), -inZ * (T / 2 + 0.016), 0.016, 'brick'); }
          else band(t0, t1, 0, 0.09, 0, T / 2 + 0.012, 'trim');
        }
        if (y1 > WH - 0.01) { if (inZ) band(a0, a1, WH - 0.2, WH - 0.12, inZ * (T / 2 + 0.02), 0.02, 'trim'); else band(t0, t1, WH - 0.2, WH - 0.12, 0, T / 2 + 0.03, 'trim'); }
      };
      for (let i = 0; i < cuts.length - 1; i++) {
        const t0 = cuts[i][1], t1 = cuts[i + 1][0];
        seg(t0, t1, 0, WH);
        if (t1 - t0 > 0.02) { const m = (t0 + t1) / 2, [cx, cz] = P(ax + dx * m, az + dz * m); solid(cx, cz, (t1 - t0) / 2, T / 2, wyaw, WH, outside ? 'wood' : 'drywall'); }
        const g = cuts[i + 1][2];
        if (g) {
          const [g0, g1, sill, lintel, gk] = g;
          seg(g0, g1, 0, sill); seg(g0, g1, lintel, WH);
          const m = (g0 + g1) / 2, [cx, cz] = P(ax + dx * m, az + dz * m), hw = (g1 - g0) / 2;
          if (sill > 0) {   // a window: glass, sash rails, a sill, casing boards round it; solid all the way up
            const fro = sill >= 1.25;   // the high little windows (bathroom, kitchen side) are frosted
            B.box(cx, sill, cz, hw, lintel, 0.012, wyaw, f => f === 'pz' || f === 'nz' ? (fro ? 'frosted' : H.lit && inZ && f === (inZ < 0 ? 'pz' : 'nz') ? 'glassLit' : 'glass') : null, TILE);
            B.box(cx, sill, cz, hw + 0.04, sill + 0.05, T / 2 + 0.05, wyaw, ALL('trim'), TILE);
            B.box(cx, (sill + lintel) / 2 - 0.02, cz, hw, (sill + lintel) / 2 + 0.02, 0.02, wyaw, ALL('trim'), TILE);
            if (hw > 0.6) B.box(cx, sill, cz, 0.018, lintel, 0.02, wyaw, ALL('trim'), TILE);   // a muntin down the middle of the wide ones
            for (const sd of inZ ? [-inZ, inZ] : [1, -1]) {   // casing: jambs and a head, both faces; a drip cap outside
              const zo = sd * (T / 2 + 0.012), out = sd === -inZ;
              band(g0 - 0.09, g0, sill + 0.05, lintel, zo, 0.012, 'trim'); band(g1, g1 + 0.09, sill + 0.05, lintel, zo, 0.012, 'trim');
              band(g0 - 0.09, g1 + 0.09, lintel, lintel + 0.11, zo, 0.014, 'trim');
              if (out) band(g0 - 0.11, g1 + 0.11, lintel + 0.11, lintel + 0.13, sd * (T / 2 + 0.03), 0.03, 'trim');
              else band(g0 - 0.06, g1 + 0.06, sill - 0.08, sill, zo, 0.012, 'trim');   // the apron under the stool
            }
            // curtains drawn back to either side, on a rod (not on the frosted ones)
            if (inZ && !fro) {
              const zo = inZ * (T / 2 + 0.06);
              band(g0 - 0.12, g1 + 0.12, lintel + 0.15, lintel + 0.17, zo, 0.01, 'darkMetal');
              band(g0 - 0.1, g0 + 0.2, sill + 0.03, lintel + 0.15, zo, 0.025, cur); band(g1 - 0.2, g1 + 0.1, sill + 0.03, lintel + 0.15, zo, 0.025, cur);
            }
            solid(cx, cz, hw, T / 2, wyaw, WH, 'glass', 0, { window: true });
          } else {
            solid(cx, cz, hw, T / 2, wyaw, WH, 'wood', lintel, { noWalk: true });
            // an open doorway: casing posts and a head board, both faces (doors hang in their own frame)
            if (gk !== 'door') {
              for (const e of [g0, g1]) { const [ex, ez] = P(ax + dx * e, az + dz * e); B.box(ex, 0, ez, 0.04, lintel, T / 2 + 0.03, wyaw, ALL('trim'), TILE); }
              B.box(cx, lintel, cz, hw + 0.04, lintel + 0.07, T / 2 + 0.03, wyaw, ALL('trim'), TILE);
            }
          }
        }
      }
    }
    // exterior walls (outside sign: + means the run's left side is outside)
    // front (z = +5, running -x → +x: left side is -z... compute: left of direction (dx,dz) is (-dz, dx)... for +x run left is +z → outside)
    const frontDoorX = -3, backDoorX = -4.0;
    wall(-6, 5, 6, 5, [[frontDoorX + 6 - 0.55, frontDoorX + 6 + 0.55, 0, DOORH, 'door'], [4.7, 6.1, 0.9, 2.1], [8.6, 10.2, 0.9, 2.1]], 1, pnt, sid, { ext: T / 2, wains: brickFront });
    wall(6, -5, -6, -5, [[12 - (backDoorX + 6) - 0.55, 12 - (backDoorX + 6) + 0.55, 0, DOORH, 'door'], [6.2, 7.6, 0.9, 2.1], [1.4, 2.4, 1.3, 2.0]], 1, pnt2, sid, { ext: T / 2 });
    wall(-6, -5, -6, 5, [[1.8, 3.2, 0.9, 2.1], [6.9, 8.3, 0.98, 2.1]], 1, pnt, sid);
    wall(6, 5, 6, -5, [[1.3, 2.7, 0.9, 2.1], [6.6, 7.6, 1.3, 2.0]], 1, pnt2, sid);
    // interior walls (the kitchen archway stays open; the bathroom and bedroom get real doors)
    wall(-6, 0.4, 6, 0.4, [[2.9, 4.0, 0, DOORH], [9.1, 10.2, 0, DOORH, 'door']], 0, pnt, pnt);
    wall(1, 0.4, 1, 5, [[1.0, 2.1, 0, DOORH, 'door']], 0, pnt2, pnt2);
    wall(2.5, -5, 2.5, 0.4, [], 0, pnt2, pnt2);
    // ---- the roof: a gable along x at a 6-in-12 pitch, with an overhang (one mesh per house so it can be hidden from
    // inside). It's tall enough for an attic you can stand up in under the ridge, and you can walk on it.
    const rise = 2.7, ov = 0.45, RX = Wd / 2 + ov, RZ = Dp / 2 + ov, yE = WH - 0.08, yR = WH + rise;
    const yTop = l => yE + (yR - yE) * (1 - Math.abs(l) / RZ), yUnder = l => yTop(l) - 0.12;   // the shingles / the roof deck's underside, at local z
    let s2 = seed * 7919 + 1301; const r2 = () => ((s2 = (s2 * 9301 + 49297) % 233280) / 233280);   // (its own dice, so the rest of the house comes out as before)
    const rg = new THREE.Group(); level.add(rg);
    {
      const y0 = yE, y1 = yR, th = 0.12;
      const pos = [], uv = [], sh = p => [p[0], p[1] - th, p[2]];
      // shingle rows run parallel to the eave: v is the distance up the slope, u along it
      const add = (a, b, c2) => { for (const p of [a, b, c2]) { pos.push(...p); uv.push(p[0] / 1.4, Math.hypot(p[2], p[1] - y1) / 1.4); } };
      const quadR = (a, b, c2, d) => { add(a, b, c2); add(a, c2, d); };
      for (const sgn of [1, -1]) {
        const e0 = [-RX, y0, sgn * RZ], e1 = [RX, y0, sgn * RZ], r1 = [RX, y1, 0], r0 = [-RX, y1, 0];
        if (sgn > 0) { quadR(e0, e1, r1, r0); quadR(sh(e1), sh(e0), sh(r0), sh(r1)); } else { quadR(e1, e0, r0, r1); quadR(sh(e0), sh(e1), sh(r1), sh(r0)); }
        // the ridge cap: a row of folded shingles over the peak
        const ca = [-RX - 0.02, y1 + 0.05, 0], cb = [RX + 0.02, y1 + 0.05, 0], cc = [RX + 0.02, y1 - 0.03, sgn * 0.17], cd = [-RX - 0.02, y1 - 0.03, sgn * 0.17];
        if (sgn > 0) quadR(cd, cc, cb, ca); else quadR(ca, cb, cc, cd);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
      const roof = new THREE.Mesh(g, MAT[roofM]); roof.castShadow = true; roof.receiveShadow = true;
      roof.position.set(hx, 0, hz); roof.rotation.y = yaw; rg.add(roof);
      // fascia boards along the eaves, barge boards up the rakes (one mesh)
      { const fl = [new THREE.BoxGeometry(RX * 2, 0.2, 0.04).translate(0, y0 - 0.06, RZ), new THREE.BoxGeometry(RX * 2, 0.2, 0.04).translate(0, y0 - 0.06, -RZ)], sl = Math.hypot(RZ, y1 - y0), ang = Math.atan2(y1 - y0, RZ);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) fl.push(new THREE.BoxGeometry(0.04, 0.2, sl).rotateX(sz * ang).translate(sx * (RX + 0.02), (y0 + y1) / 2 - 0.1, sz * RZ / 2));
        const fb = new THREE.Mesh(mergeGeometries(fl.map(q => q.toNonIndexed())), MAT.trim); fb.position.set(hx, 0, hz); fb.rotation.y = yaw; fb.castShadow = true; rg.add(fb); }
      // gable ends: siding outside, bare boards inside, and a small dusty window in each (the attic's daylight)
      const gs = new THREE.Shape(); gs.moveTo(-Dp / 2, WH); gs.lineTo(Dp / 2, WH); gs.lineTo(0, WH + rise - 0.1); gs.closePath();
      const gw = new THREE.Path(); gw.moveTo(-0.42, 3.55); gw.lineTo(0.42, 3.55); gw.lineTo(0.42, 4.3); gw.lineTo(-0.42, 4.3); gw.closePath(); gs.holes.push(gw);
      const gGeo = new THREE.ShapeGeometry(gs), gIn = gGeo.clone(); { const u = gIn.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) / 1.22, u.getY(i) / 1.22); }
      for (const sgn of [1, -1]) {
        hm(gGeo, MAT[sid], sgn * (Wd / 2 + T / 2), 0, 0, sgn * Math.PI / 2);
        hm(gIn, atticKit().sheath, sgn * (Wd / 2 - T / 2), 0, 0, -sgn * Math.PI / 2, 1, 1, 1, 0, 0, false);
        // the window: a frame through the wall, a sill, a cross of muntins, old grimy glass
        const wx = sgn * Wd / 2;
        hbox(wx - 0.13, 3.47, -0.5, wx + 0.13, 3.55, 0.5, MAT.trim); hbox(wx - 0.13, 4.3, -0.5, wx + 0.13, 4.38, 0.5, MAT.trim);
        for (const z2 of [-1, 1]) hbox(wx - 0.13, 3.55, z2 * 0.42 - 0.04, wx + 0.13, 4.3, z2 * 0.42 + 0.04, MAT.trim);
        hbox(wx + sgn * 0.08, 3.42, -0.55, wx + sgn * 0.16, 3.47, 0.55, MAT.trim);
        hbox(wx - 0.015, 3.9, -0.42, wx + 0.015, 3.94, 0.42, MAT.trim, false); hbox(wx - 0.015, 3.55, -0.02, wx + 0.015, 4.3, 0.02, MAT.trim, false);
        hm(GEO.uplane, atticKit().dusty, wx, 3.925, 0, sgn * Math.PI / 2, 0.84, 0.75, 1, 0, 0, false);
        // what the bullets and the camera hit: stepped boxes under the slope of the gable
        for (let k = 0; k < 10; k++) { const a = -Dp / 2 + k, inner = Math.min(Math.abs(a), Math.abs(a + 1)), top = WH + (rise - 0.1) * (1 - inner / (Dp / 2)); solid(...P(wx, a + 0.5), T / 2, 0.5, yaw, top, 'wood', WH, { maxBy: 2.97 }); }
      }
      // a brick chimney on some houses: up through the attic and out of the roof, a concrete crown, a flue liner
      if (r() < 0.5) {
        const [cx, cz] = P(-3.5, -1.2), top = yTop(1.2) + 1.45;
        const ch = new THREE.Mesh(new THREE.BoxGeometry(0.7, top - 2.94, 0.7), MAT.brick); ch.position.set(cx, (top + 2.94) / 2, cz); ch.rotation.y = yaw; ch.castShadow = true; rg.add(ch);
        const cr = new THREE.Mesh(mergeGeometries([new THREE.BoxGeometry(0.82, 0.08, 0.82).translate(0, top + 0.04, 0).toNonIndexed(), new THREE.CylinderGeometry(0.11, 0.11, 0.22, 12).translate(0, top + 0.18, 0).toNonIndexed()]), MAT.concrete);
        cr.position.set(cx, 0, cz); cr.rotation.y = yaw; cr.castShadow = true; rg.add(cr);
        solid(cx, cz, 0.35, 0.35, yaw, top + 0.08, 'brick', 2.9);
        H.chimney = [-3.5, -1.2];
      }
    }
    H.roof = rg;
    // what bullets and sight lines hit: the slopes as stepped boxes (nobody walks into these: the roof surface is in W.roofs)
    for (const sgn of [1, -1]) for (let k = 0; k < 6; k++) { const a = k * RZ / 6, b = (k + 1) * RZ / 6; solid(...P(0, sgn * (a + b) / 2), RX, (b - a) / 2, yaw, yTop(a), 'roof', yUnder(b) - 0.02, { noWalk: true, roofOf: H }); }
    // you can stand on it: both slopes follow the shingles up to the ridge; off the edge you fall (zombies never get up)
    W.roofs.push({ H, x: hx, z: hz, c, s: sn, RX, RZ, yE, yR, r2: RX * RX + RZ * RZ });
    // ---- the attic: up a pull-down ladder from a hatch in the kitchen ceiling. Joists with pink insulation between
    // them, a plywood walkway down the middle, rafters and the roof boards overhead (you only stand up straight near
    // the ridge), boxes and old furniture, a bare bulb, a dusty window in each gable ----
    const AY = 2.94, HT = [1.14, -2.3, 1.86, -0.9];   // the attic floor; the hatch (local x0, z0, x1, z1)
    Object.assign(H, { atticY: AY, yTop, yUnder, hatch: HT });
    const KB = towerKit().beam;
    // a beam between two house-local points (its long axis along a→b; h is across it, in the vertical plane)
    const hbeam = (a, b, w, h, mat, shadow = false) => { const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz); hm(KB, mat, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, Math.atan2(dx, dz), w, h, L, -Math.asin(dy / L), 0, shadow); };
    const lbox = (x0, y0, z0, x1, y1, z1, key) => { const [cx, cz] = P((x0 + x1) / 2, (z0 + z1) / 2); B.box(cx, y0, cz, Math.abs(x1 - x0) / 2, y1, Math.abs(z1 - z0) / 2, yaw, typeof key === 'function' ? key : ALL(key), TILE); };
    const lrect = (x0, z0, x1, z1, extra = {}) => { const [cx, cz] = P((x0 + x1) / 2, (z0 + z1) / 2), a = Math.abs(x1 - x0) / 2, b = Math.abs(z1 - z0) / 2; return { x: cx, z: cz, hx: a, hz: b, c, s: sn, r2: a * a + b * b, ...extra }; };
    const lsolid = (x0, z0, x1, z1, y0, y1, surf, extra = {}) => { const [cx, cz] = P((x0 + x1) / 2, (z0 + z1) / 2); return solid(cx, cz, Math.abs(x1 - x0) / 2, Math.abs(z1 - z0) / 2, yaw, y1, surf, y0, extra); };
    // a stair/ladder you walk up: along local z at lx, from lzA (height ya) to lzB (height yb)
    const ramp = (lx, lzA, lzB, ya, yb, hw) => { const [ax, az] = P(lx, lzA), [bx, bz] = P(lx, lzB), yw = Math.atan2(bx - ax, bz - az), b = Math.abs(lzB - lzA) / 2; W.ramps.push({ x: (ax + bx) / 2, z: (az + bz) / 2, hx: hw, hz: b, c: Math.cos(yw), s: Math.sin(yw), r2: hw * hw + b * b, ya, yb, R: 0 }); };
    const RBg = (w, h, d, rad = 0.04) => { const k = 'rb' + [w, h, d, rad, 2].map(v => v.toFixed(3)).join(); if (!FURN.has(k)) FURN.set(k, new RoundedBoxGeometry(w, h, d, 2, Math.min(rad, w / 2.05, h / 2.05, d / 2.05))); return FURN.get(k); };
    {
      const AK = atticKit();
      // the ceiling round the hatch: trim on the kitchen side
      for (const [x0, z0, x1, z1] of [[HT[0] - 0.08, HT[1] - 0.08, HT[2] + 0.08, HT[1]], [HT[0] - 0.08, HT[3], HT[2] + 0.08, HT[3] + 0.08], [HT[0] - 0.08, HT[1], HT[0], HT[3]], [HT[2], HT[1], HT[2] + 0.08, HT[3]]]) hbox(x0, WH - 0.14, z0, x1, WH - 0.12, z1, MAT.trim, false);
      // ---- the pull-down ladder: three folding sections of pine on the back of the hatch door, steep as a ladder ----
      const LX = (HT[0] + HT[2]) / 2, F = [LX, 0, -2.6], TT = [LX, AY - 0.02, HT[3]];   // up to the attic floor, as the walk ramp is
      const at = t => [LX, F[1] + (TT[1] - F[1]) * t, F[2] + (TT[2] - F[2]) * t];
      const nl = Math.hypot(TT[1], TT[2] - F[2]), un = [0, -(TT[2] - F[2]) / nl, TT[1] / nl];   // "under" the ladder: away from the climber
      // the ladder and the hatch: its own group, drawn only near this house
      const LG = sub(() => {
        for (const sx of [-0.315, 0.315]) {
          for (const [t0, t1] of [[0, 0.37], [0.375, 0.695], [0.7, 1]]) { const a = at(t0), b = at(t1); hbeam([LX + sx, a[1] + 0.02, a[2]], [LX + sx, b[1], b[2]], 0.035, 0.09, AK.pine, true); }
          for (const t of [0.372, 0.697]) { const p = at(t); hbeam([LX + sx * 1.1, p[1] - 0.09, p[2] - 0.05], [LX + sx * 1.1, p[1] + 0.09, p[2] + 0.05], 0.006, 0.12, MAT.metal); }   // the fold hinges
          const p0 = at(0); hbox(LX + sx - 0.025, 0, p0[2] - 0.05, LX + sx + 0.025, 0.03, p0[2] + 0.05, MAT.rubber, false);   // rubber feet
        }
        for (let k = 1; k <= 10; k++) { const y = k * AY / 11, p = at(y / TT[1]); hbox(LX - 0.3, y - 0.024, p[2] - 0.045, LX + 0.3, y, p[2] + 0.045, AK.pine); }   // the treads (flat, like steps)
        // the hatch door folded down under the top section, spring arms to the frame, a pull cord with a wooden handle
        { const a = at(0.62), b = at(1); hbeam([LX, a[1] + un[1] * 0.07, a[2] + un[2] * 0.07], [LX, b[1] + un[1] * 0.07, b[2] + un[2] * 0.07], 0.7, 0.022, AK.ceilBoard, true); }
        for (const sx of [-0.36, 0.36]) { const p = at(0.82); hbeam([LX + sx, WH - 0.05, HT[3] - 0.55], [LX + sx, p[1] + un[1] * 0.05, p[2] + un[2] * 0.05], 0.012, 0.03, MAT.metal); }
        { const p = at(0.62); const q = [LX + 0.2, p[1] + un[1] * 0.09, p[2] + un[2] * 0.09]; hbeam(q, [q[0], q[1] - 0.85, q[2] + 0.02], 0.006, 0.006, MAT.white); hm(GEO.ucyl, MAT.darkWood, q[0], q[1] - 0.9, q[2] + 0.02, 0, 0.035, 0.1, 0.035, 0, 0, false); }
      });
      H.ladderG = LG;
      // standing on it, bumping into it: a channel between its stiles, nothing under the high end, zombies kept off
      ramp(LX, F[2], HT[3], 0, AY, 0.33);
      for (const sx of [-1, 1]) lsolid(LX + sx * 0.338, F[2], LX + sx * 0.39, HT[3], 0, WH - 0.04, 'wood');
      lsolid(LX - 0.38, -1.6, LX + 0.38, HT[3], 0, 1.35, 'wood');
      lsolid(LX - 0.34, F[2] - 0.05, LX + 0.34, -1.6, 0, 1.0, 'wood', { zOnly: true, pass: true, navSkip: true });
      W.navBlocks.push(lrect(LX - 0.4, F[2] - 0.1, LX + 0.4, HT[3]));
      // ---- up there: the floor you stand on (round the hatch), and the bounds the roof sets (pass: see/shoot through) ----
      for (const [x0, z0, x1, z1] of [[-5.9, HT[3], 5.9, 4.9], [-5.9, -4.9, HT[0], HT[3]], [HT[2], -4.9, 5.9, HT[3]], [HT[0], -4.9, HT[2], HT[1]]]) W.decks.push(lrect(x0, z0, x1, z1, { y: AY }));
      for (const sd of [-1, 1]) lsolid(-5.9, sd * 1.85, 5.9, sd * 4.6, AY, AY + 0.8, 'wood', { pass: true, maxBy: 2.97 });   // (1.44 m under the rafters there: room to crouch)
      // a guard rail round three sides of the opening (open at the ladder's top)
      for (const [x0, z0, x1, z1] of [[HT[0] - 0.1, HT[1] - 0.1, HT[0] - 0.04, HT[3]], [HT[2] + 0.04, HT[1] - 0.1, HT[2] + 0.1, HT[3]], [HT[0] - 0.1, HT[1] - 0.1, HT[2] + 0.1, HT[1] - 0.04]]) lsolid(x0, z0, x1, z1, AY, AY + 1.0, 'wood');
      const AG = sub(() => {
        // joists (their ends show beyond the walkway), doubled trimmers and headers round the hatch
        for (let k = 0; k < 30; k++) { const jx = -5.8 + k * 0.4; if (jx > HT[0] - 0.15 && jx < HT[2] + 0.15) continue; for (const sd of [-1, 1]) hbeam([jx, 2.85, sd * 2.2], [jx, 2.85, sd * 4.95], 0.045, 0.14, AK.pine); }
        for (const jx of [HT[0] - 0.03, HT[2] + 0.03]) hbeam([jx, 2.85, -4.95], [jx, 2.85, 4.95], 0.06, 0.14, AK.pine);
        for (const jz of [HT[1] - 0.03, HT[3] + 0.03]) hbeam([HT[0] - 0.06, 2.85, jz], [HT[2] + 0.06, 2.85, jz], 0.06, 0.14, AK.pine);
        // pink insulation out to the eaves, the plywood walkway down the middle
        for (const sd of [-1, 1]) lbox(-5.9, 2.78, sd > 0 ? 2.2 : -4.95, 5.9, 2.9, sd > 0 ? 4.95 : -2.2, f => f === 'top' ? 'insul' : null);
        for (const [x0, z0, x1, z1] of [[-5.9, -2.2, HT[0] - 0.06, 2.2], [HT[2] + 0.06, -2.2, 5.9, 2.2], [HT[0] - 0.06, HT[3] + 0.06, HT[2] + 0.06, 2.2]]) lbox(x0, 2.92, z0, x1, AY, z1, 'plywood');
        // rafters every 60 cm, a ridge board, collar ties high up; the roof boards' underside
        for (let k = 0; k < 20; k++) { const lx = -5.7 + k * 0.6; for (const sd of [-1, 1]) hbeam([lx, yUnder(4.95) - 0.08, sd * 4.95], [lx, yUnder(0.03) - 0.08, sd * 0.03], 0.045, 0.14, AK.pine); if (k % 4 === 1) hbeam([lx, 4.97, -0.62], [lx, 4.97, 0.62], 0.04, 0.12, MAT.timberDark); }
        hbox(-5.95, yUnder(0) - 0.24, -0.022, 5.95, yUnder(0) - 0.005, 0.022, MAT.timberDark, false);
        for (const sd of [1, -1]) {
          const ye = yUnder(4.98) - 0.004, yr = yUnder(0) - 0.004, pts = [[-5.9, ye, sd * 4.98], [5.9, ye, sd * 4.98], [5.9, yr, 0], [-5.9, yr, 0]].map(([lx, y, lz]) => { const [x, z] = P(lx, lz); return [x, y, z]; });
          const nn = Math.hypot(RZ, yR - yE), nz = -sd * (yR - yE) / nn, n = [nz * sn, -RZ / nn, nz * c], sl = Math.hypot(4.98, ye - yr) / 1.22;
          B.quad('sheath', ...pts, n, [[0, 0], [11.8 / 1.22, 0], [11.8 / 1.22, sl], [0, sl]], hx, hz);
        }
        // the guard rail you can see: posts, a mid rail and a top rail
        for (const [px, pz] of [[HT[0] - 0.07, HT[1] - 0.07], [HT[2] + 0.07, HT[1] - 0.07], [HT[0] - 0.07, HT[3]], [HT[2] + 0.07, HT[3]]]) hbeam([px, AY, pz], [px, AY + 1.0, pz], 0.06, 0.06, AK.pine, true);
        for (const y of [AY + 0.5, AY + 0.97]) { hbeam([HT[0] - 0.07, y, HT[1] - 0.07], [HT[0] - 0.07, y, HT[3]], 0.035, 0.07, AK.pine); hbeam([HT[2] + 0.07, y, HT[1] - 0.07], [HT[2] + 0.07, y, HT[3]], 0.035, 0.07, AK.pine); hbeam([HT[0] - 0.07, y, HT[1] - 0.07], [HT[2] + 0.07, y, HT[1] - 0.07], 0.035, 0.07, AK.pine); }
        // the bare bulb on its cord from the ridge, a pull chain
        hm(GEO.ucyl, MAT.black, 0, (yUnder(0) - 0.24 + 4.98) / 2, 0.35, 0, 0.008, yUnder(0) - 0.24 - 4.98, 0.008, 0, 0, false);
        hm(GEO.ucyl, MAT.porcelain, 0, 4.95, 0.35, 0, 0.05, 0.07, 0.05, 0, 0, false); hm(AK.bulbG, AK.bulb, 0, 4.87, 0.35, 0, 1, 1, 1, 0, 0, false);
        hm(GEO.ucyl, MAT.metal, 0.03, 4.68, 0.35, 0, 0.004, 0.5, 0.004, 0, 0, false);
        // what's been put up here over the years (props on the walkway, never in the way of the hatch or the spine)
        const prop = (x0, z0, x1, z1, h, surf = 'wood') => lsolid(x0, z0, x1, z1, AY, AY + h, surf);
        const cbox = (lx, lz, w, d, h, y0, ry, m = AK.card) => { hm(GEO.ubox, m, lx, AY + y0 + h / 2, lz, ry, w, h, d); return y0 + h; };
        // an old steamer trunk (something might still be in it)
        { const tx = -4.95, tz = 1.05;
          hm(AK.trunkG, MAT.darkWood, tx, AY + 0.25, tz); hm(AK.lidG, MAT.darkWood, tx, AY + 0.49, tz);
          for (const oz of [-0.3, 0.3]) hbox(tx - 0.3, AY + 0.02, tz + oz - 0.03, tx + 0.3, AY + 0.5, tz + oz + 0.03, MAT.darkMetal, false);   // straps
          for (const ox of [-1, 1]) for (const oz of [-1, 1]) hbox(tx + ox * 0.29 - 0.03, AY, tz + oz * 0.46 - 0.03, tx + ox * 0.29 + 0.03, AY + 0.07, tz + oz * 0.46 + 0.03, AK.brass, false);   // brass corners
          hbox(tx + 0.28, AY + 0.4, tz - 0.05, tx + 0.31, AY + 0.5, tz + 0.05, AK.brass, false);   // the hasp
          prop(tx - 0.3, tz - 0.48, tx + 0.3, tz + 0.48, 0.6);
          const [sx, sz] = P(tx + 0.85, tz), [fx, fz] = P(tx + 0.3, tz);
          container('attic', fx, fz, 0.5, 'Old trunk in the attic', yaw, H, { attic: true, floorY: AY, hidden: true, stand: { x: sx, z: sz, yaw: Math.atan2(fx - sx, fz - sz) } }); }
        // boxes, stacked: picked from spots along the walkway
        const spots = [[-2.6, 1.5], [-1.7, 1.5], [3.0, 1.5], [3.75, 1.48], [-2.75, -1.5], [4.55, 1.5], [-1.95, -1.5], [2.5, -1.5]];
        let nb = 0;
        for (const [lx, lz] of spots) {
          if (r2() < 0.35 && nb > 2) continue; nb++;
          let y = 0; const n = 1 + Math.floor(r2() * 2.6), w0 = 0.45 + r2() * 0.18;
          for (let k = 0; k < n; k++) { const w = w0 - k * 0.06 - r2() * 0.05, d = w * (0.75 + r2() * 0.3), h = 0.28 + r2() * 0.16; y = cbox(lx + (r2() - 0.5) * 0.05, lz + (r2() - 0.5) * 0.05, w, d, h, y, (r2() - 0.5) * 0.25, k === n - 1 && r2() < 0.3 ? AK.cardX : AK.card); }
          prop(lx - w0 / 2 - 0.02, lz - w0 / 2 - 0.02, lx + w0 / 2 + 0.02, lz + w0 / 2 + 0.02, y);
          // the first two stacks can be gone through (camping gear, old Christmas lights, junk)
          if (nb <= 2) { const [fx, fz] = P(lx, lz - Math.sign(lz) * (w0 / 2)), [sx, sz] = P(lx, lz * 0.35);
            container('atticBox', fx, fz, Math.min(1.1, y), nb === 1 ? 'Boxes in the attic' : 'Old cardboard boxes', yaw, H, { attic: true, floorY: AY, hidden: true, stand: { x: sx, z: sz, yaw: Math.atan2(fx - sx, fz - sz) } }); }
        }
        // an old armchair (springs gone), a floor lamp with a torn shade, a rolled-up rug, two suitcases, a fan
        { const ax = 4.55, az = -1.2;
          hm(RBg(0.78, 0.22, 0.74, 0.05), AK.oldFab, ax, AY + 0.27, az); hm(RBg(0.78, 0.6, 0.16, 0.06), AK.oldFab, ax, AY + 0.62, az - 0.32, 0, 1, 1, 1, -0.12);
          for (const ox of [-0.35, 0.35]) hm(RBg(0.12, 0.42, 0.74, 0.05), AK.oldFab, ax + ox, AY + 0.37, az);
          for (const ox of [-0.32, 0.32]) for (const oz of [-0.3, 0.3]) hm(GEO.ucyl, MAT.darkWood, ax + ox, AY + 0.08, az + oz, 0, 0.04, 0.16, 0.04, 0, 0, false);
          prop(ax - 0.42, az - 0.42, ax + 0.42, az + 0.4, 0.95, 'cloth'); }
        { const lx = 5.35, lz = 1.0; hm(GEO.ucyl, MAT.darkMetal, lx, AY + 0.012, lz, 0, 0.26, 0.025, 0.26, 0, 0, false); hm(GEO.ucyl, AK.brass, lx, AY + 0.65, lz, 0, 0.022, 1.28, 0.022, 0, 0, false); hm(GEO.shade, AK.oldFab, lx, AY + 1.35, lz, 0, 1.2, 1.2, 1.2, 0, 0.18, false); prop(lx - 0.15, lz - 0.15, lx + 0.15, lz + 0.15, 1.4, 'metal'); }
        { hm(GEO.ucyl, AK.rug, -0.45, AY + 0.13, -1.75, 0, 0.26, 2.1, 0.26, 0, Math.PI / 2, false); prop(-1.5, -1.9, 0.6, -1.6, 0.26, 'cloth'); }
        { for (let k = 0; k < 2; k++) hm(GEO.suitcase, MAT['case' + ((seed + k) % 3)], -5.2, AY + 0.11 + k * 0.22, -1.35 + k * 0.03, Math.PI / 2 + k * 0.15); prop(-5.55, -1.75, -4.85, -0.95, 0.44, 'cloth');
          const [fx, fz] = P(-4.85, -1.35), [sx, sz] = P(-4.2, -1.1); container('atticCase', fx, fz, 0.45, 'Old suitcases', yaw, H, { attic: true, floorY: AY, hidden: true, stand: { x: sx, z: sz, yaw: Math.atan2(fx - sx, fz - sz) } }); }
        { const fx = 5.4, fz = -0.15; hm(GEO.ucyl, MAT.white, fx, AY + 0.02, fz, 0, 0.3, 0.04, 0.3, 0, 0, false); hm(GEO.ucyl, MAT.white, fx, AY + 0.4, fz, 0, 0.03, 0.75, 0.03, 0, 0, false); hm(AK.fanG, AK.fanM, fx, AY + 0.82, fz, -Math.PI / 2, 1, 1, 1, 0, 0, false); prop(fx - 0.18, fz - 0.18, fx + 0.18, fz + 0.18, 1.0, 'plastic'); }
        // old picture frames leaning on the gable wall
        for (let k = 0; k < 3; k++) { const fz = 1.35 - k * 0.12, fh = 0.5 + k * 0.12; hm(GEO.ubox, MAT.darkWood, -5.78 + k * 0.03, AY + fh / 2, fz, 0, 0.03, fh, 0.62 - k * 0.08, 0, -0.18, false); }
      });
      H.atticG = AG;
      H.bulb = [...P(0, 0.35), 4.87];
    }
    // ---- getting up there from outside: a recycling bin by the porch, the porch roof, then up the shingles ----
    W.decks.push((() => { const [cx, cz] = P(frontDoorX, 6.1); return { x: cx, z: cz, hx: 1.5, hz: 1.15, c, s: sn, r2: 1.5 * 1.5 + 1.15 * 1.15, y: 2.74, climb: true }; })());
    { const [bx, bz] = P(frontDoorX - 2.05, 5.58); trashBin(bx, bz, yaw, MAT.bluePaint, true); W.decks.push({ x: bx, z: bz, hx: 0.31, hz: 0.36, c, s: sn, r2: 0.31 * 0.31 + 0.36 * 0.36, y: 1.07, climb: true }); }
    // on some houses an aluminium extension ladder still leans on the back gutter (from cleaning them out last fall)
    if (r2() < 0.6) {
      const lx = 1.6, F = [lx, 0, -6.25], k = 2.62 / (-5.53 - F[2]);   // the foot; it rests on the gutter at z -5.53, 2.62 m up
      const yAt = z2 => (z2 - F[2]) * k;
      const zTop = F[2] + 3.6 / k;
      for (const sx of [-0.31, 0.31]) {
        hbeam([lx + sx, 0.03, F[2]], [lx + sx, 2.3, F[2] + 2.27 / k], 0.03, 0.075, MAT.alu, true);                                // the base section
        hbeam([lx + sx * 0.88, 1.2, F[2] + 1.2 / k - 0.06], [lx + sx * 0.88, 3.6, zTop - 0.06], 0.028, 0.07, MAT.alu, true);       // the fly section, on top of it
        hm(GEO.ubox, MAT.rubber, lx + sx, 0.04, F[2], 0, 0.06, 0.08, 0.14);
        hm(GEO.ubox, MAT.darkMetal, lx + sx * 0.94, 2.2, F[2] + 2.2 / k - 0.03, 0, 0.05, 0.1, 0.1, 0, 0, false);            // the rung locks
      }
      for (let y = 0.3; y < 3.55; y += 0.3) { const z2 = F[2] + y / k - (y > 2.25 ? 0.06 : 0), w = y > 2.25 ? 0.55 : 0.62; hm(GEO.ucyl, MAT.alu, lx, y, z2, 0, 0.032, w, 0.032, 0, Math.PI / 2, false); }
      ramp(lx, F[2], -5.45, 0, 2.74, 0.3);
      W.decks.push(lrect(lx - 0.31, -5.55, lx + 0.31, -5.2, { y: 2.74 }));   // a pad at the top: a level step onto the eave
      for (const sx of [-1, 1]) lsolid(lx + sx * 0.36, -5.6, lx + sx * 0.42, -5.2, 2.6, 3.4, 'metal');   // the fly rails: step on square
      for (const sx of [-1, 1]) lsolid(lx + sx * 0.33, F[2], lx + sx * 0.38, -5.5, 0, 2.7, 'metal');
      lsolid(lx - 0.36, -5.6, lx + 0.36, -5.12, 0, 1.2, 'metal');
      lsolid(lx - 0.32, F[2] - 0.05, lx + 0.32, -5.6, 0, 1.0, 'metal', { zOnly: true, pass: true, navSkip: true });
      W.navBlocks.push(lrect(lx - 0.4, F[2] - 0.1, lx + 0.4, -5.1));
    }
    // a shade tree in the side yard (the side away from the drive) on most lots
    if (r2() < 0.65) { const [tx, tz] = P(-9.2, -2.5 + r2() * 5); tree(tx, tz, 0.85 + r2() * 0.45, r2() < 0.5 ? 0 : 1); paint(tx, tz, 1.0, 'mud', 0.4); }
    // ---- doors ----
    const dcol = DOORCOL[Math.floor(r() * DOORCOL.length)];
    {
      const [x0, z0] = P(frontDoorX - 0.497, 5);
      H.front = door(x0, z0, Y(flip > 0 ? 0 : Math.PI), flip > 0 ? 1 : -1, dcol, H, { w: 0.994, front: true, frame: true, wallT: T });
      const [x1, z1] = P(backDoorX - 0.497, -5);
      H.back = door(x1, z1, Y(flip > 0 ? 0 : Math.PI), flip > 0 ? -1 : 1, 0xe6e2d8, H, { w: 0.994, frame: true, wallT: T });
      // inside: the en-suite bathroom door (swings into the bathroom) and the bedroom door (swings into the bedroom)
      const [x2, z2] = P(3.1 + 0.053, 0.4);
      H.bath = door(x2, z2, Y(flip > 0 ? 0 : Math.PI), flip, 0xeae6dc, H, { w: 0.994, frame: true, wallT: T, hp: 80, interior: true });
      const [x3, z3] = P(1, 1.4 + 0.053);
      H.bed = door(x3, z3, Y(-Math.PI / 2), flip, 0xeae6dc, H, { w: 0.994, frame: true, wallT: T, hp: 80, interior: true });
      // (after the outbreak) some were left open when people ran, some were broken in
      const ch = chaos(hx, hz, () => { }, 'house' + H.id);
      if (r() < 0.35) ch.doors.push({ D: H.front, open: true });
      if (r() < 0.25) ch.doors.push({ D: H.back, open: true });
      if (r() < 0.15) ch.doors.push({ D: H.front, broken: true });
    }
    // ---- the front: a porch roof on two posts, shutters, a porch light, the house number, gutters ----
    {
      const shut = 'shutter' + Math.floor(r() * 4);
      const [rx2, rz2] = P(frontDoorX, 6.1);
      B.box(rx2, 2.62, rz2, 1.5, 2.74, 1.15, yaw, f => f === 'top' ? roofM : 'trim', TILE);
      solid(rx2, rz2, 1.5, 1.15, yaw, 2.74, 'wood', 2.62, { noWalk: true });
      for (const sx of [-1.3, 1.3]) { const [px, pz] = P(frontDoorX + sx, 7.1); B.box(px, 0.12, pz, 0.07, 2.62, 0.07, yaw, ALL('trim'), TILE); solid(px, pz, 0.08, 0.08, yaw, 2.62, 'wood'); }
      for (const [w0, w1] of [[-1.3, 0.1], [2.6, 4.2]]) for (const ex of [w0 - 0.3, w1 + 0.3]) { const [qx, qz] = P(ex, Dp / 2 + T / 2 + 0.03); B.box(qx, 0.85, qz, 0.2, 2.15, 0.015, yaw, ALL(shut), TILE); }
      // the porch lantern: a back plate, a glass box with a bulb that's lit at night in some houses
      { const lx2 = frontDoorX + 0.8 * flip;
        hbox(lx2 - 0.06, 1.78, 5.1, lx2 + 0.06, 2.08, 5.125, MAT.black); hbox(lx2 - 0.02, 1.9, 5.12, lx2 + 0.02, 1.94, 5.19, MAT.black);
        const lit = r() < 0.45;
        hm(GEO.lantern, lit ? MAT.porchOn : MAT.porchOff, lx2, 1.82, 5.23); hm(GEO.lanternCap, MAT.black, lx2, 2.05, 5.23);
        // a lit one really lights the porch at night: a warm pool on the slab, a soft glow, a spot when you're near
        if (lit) { const v = new THREE.Vector3(lx2, 1.93, 5.3).applyMatrix4(HX), [qx, qz] = P(frontDoorX, 5.75);
          const pool = new THREE.Mesh(GEO.litter, poolMat); pool.position.set(qx, 0.135, qz); pool.scale.set(2.6, 1, 2.6); pool.visible = false; pool.renderOrder = 1; level.add(pool);
          const halo = new THREE.Sprite(haloMat); halo.position.copy(v); halo.scale.setScalar(0.45); halo.visible = false; halo.renderOrder = 6; level.add(halo); pool.userData.halo = halo;
          lamp(v.x, v.y, v.z, { pow: 0.15, dist: 8, angle: 1.3, tx: qx, tz: qz, col: 0xffd8a0, reach: -12 }).pool = pool; } }
      const num = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.2), new THREE.MeshStandardMaterial({ map: fitLab([String(opts.number || (10 + Math.floor(r() * 90)))], '#1e1e1e', '#e8e2d0', 128, 64, 'bold 46px Georgia'), roughness: 0.6 }));
      const [nx2, nz2] = P(frontDoorX - 0.85 * flip, 5.13); num.position.set(nx2, 2.05, nz2); num.rotation.y = yaw; level.add(num);
      // gutters front and back; a downspout at each corner: down the wall from an elbow, a kick-out, a splash block
      for (const sgn of [1, -1]) {
        const [gx, gz] = P(0, sgn * (Dp / 2 + 0.47)); B.box(gx, WH - 0.25, gz, Wd / 2 + 0.47, WH - 0.13, 0.06, yaw, ALL('trim'), TILE);
        for (const sx of [-1, 1]) {
          const ex = sx * (Wd / 2 - 0.12), wz = sgn * (Dp / 2 + 0.05);
          hbox(ex - 0.035, 0.2, wz - 0.035, ex + 0.035, WH - 0.36, wz + 0.035, MAT.trim);
          hbox(ex - 0.035, WH - 0.36, Math.min(wz, sgn * (Dp / 2 + 0.47)) - 0.035, ex + 0.035, WH - 0.29, Math.max(wz, sgn * (Dp / 2 + 0.47)) + 0.035, MAT.trim);
          hbox(ex - 0.035, 0.08, Math.min(wz, wz + sgn * 0.28) - 0.035, ex + 0.035, 0.2, Math.max(wz, wz + sgn * 0.28) + 0.035, MAT.trim);
          hbox(ex - 0.15, 0, Math.min(wz + sgn * 0.12, wz + sgn * 0.72), ex + 0.15, 0.04, Math.max(wz + sgn * 0.12, wz + sgn * 0.72), MAT.concrete);
        }
      }
      // ---- the things every lived-in house has outside (own dice, so nothing else about the house changes):
      // a flower bed under the front windows, the AC condenser on its pad, the power meter, a dish, the dryer vent,
      // the outside tap with a hose reel ----
      { let s3 = seed * 4241 + 77; const r3 = () => ((s3 = (s3 * 9301 + 49297) % 233280) / 233280);
        const K = houseKit();
        // the bed: dark mulch behind a little edging, low shrubs, flowers of one or two colours
        { const bx0 = -1.5, bx1 = 4.6, bz0 = 5.13, bz1 = 5.85, [cx, cz] = P((bx0 + bx1) / 2, (bz0 + bz1) / 2);
          B.box(cx, 0, cz, (bx1 - bx0) / 2, 0.045, (bz1 - bz0) / 2, yaw, f => f === 'top' ? 'mulch' : 'curb', TILE);
          paved.push(rectOf(cx, cz, (bx1 - bx0) / 2, (bz1 - bz0) / 2, yaw));
          const fm = [K.red, K.yellow, K.white, K.purple, K.pink], f1 = fm[Math.floor(r3() * fm.length)], f2 = fm[Math.floor(r3() * fm.length)];
          for (let lx = bx0 + 0.35; lx < bx1 - 0.2; lx += 0.55 + r3() * 0.2) {
            const lz = 5.47 + (r3() - 0.5) * 0.2, sc = 0.22 + r3() * 0.1, [px, pz] = P(lx, lz);
            inst(GEO.clump, MAT.hedge, mat4(px, 0.05 + sc * 0.75, pz, r3() * 6, sc * 1.1, sc * 0.9, sc * 1.1), false);
            const fmat = r3() < 0.5 ? f1 : f2;
            for (let k = 0; k < 7; k++) { const a = r3() * 6.28, q = sc * (0.4 + r3() * 0.55), [qx, qz] = P(lx + Math.cos(a) * q, lz + Math.sin(a) * q); inst(K.bloom, fmat, mat4(qx, 0.05 + sc * (1.35 + r3() * 0.35) - q * 0.6, qz, r3() * 6, 1, 0.6, 1), false); }
          } }
        // the AC condenser on the drive side, round the back corner: a concrete pad, the louvred cabinet, the fan
        // guard on top, the copper line set into the wall (low enough to vault)
        { const gar = hx === -92 && hz === -17, ax = gar ? 4.7 : 6.52, az = gar ? -5.58 : -3.6;   // (behind the house where the detached garage stands)
          hbox(ax - 0.46, 0, az - 0.46, ax + 0.46, 0.07, az + 0.46, MAT.concrete);
          hm(GEO.ubox, K.acSide, ax, 0.07 + 0.36, az, 0, 0.74, 0.72, 0.74);
          hm(GEO.ubox, K.acTop, ax, 0.795, az, 0, 0.78, 0.03, 0.78);
          hm(GEO.ucyl, MAT.darkMetal, ax, 0.815, az, 0, 0.56, 0.02, 0.56, 0, 0, false);
          hm(GEO.ucyl, MAT.darkMetal, ax, 0.83, az, 0, 0.12, 0.04, 0.12, 0, 0, false);
          if (!gar) for (const [dz, rad, m] of [[0.12, 0.022, K.copper], [0.2, 0.035, MAT.black]]) { hm(GEO.ucyl, m, (ax - 0.37 + 6.1) / 2, 0.5, az + dz, 0, rad, ax - 0.37 - 6.1, rad, 0, Math.PI / 2, false); }
          lsolid(ax - 0.4, az - 0.4, ax + 0.4, az + 0.4, 0, 0.84, 'metal', { vault: true }); }
        // the power meter and its conduit on the same wall, by the front corner
        { const mz = 0.6; hbox(6.1, 1.25, mz - 0.13, 6.2, 1.62, mz + 0.13, K.meterBox); hm(GEO.ucyl, K.meterGlass, 6.25, 1.45, mz, 0, 0.17, 0.12, 0.17, 0, Math.PI / 2, false);
          hbox(6.1, 0.12, mz - 0.025, 6.15, 1.25, mz + 0.025, K.meterBox); }
        // a satellite dish on a bracket high on that wall (most houses)
        if (r3() < 0.6) { const dz = -0.6 + r3() * 0.4; hbox(6.1, 2.38, dz - 0.06, 6.14, 2.58, dz + 0.06, MAT.white); hm(GEO.ucyl, MAT.white, 6.3, 2.48, dz, 0, 0.035, 0.38, 0.035, 0, Math.PI / 2, false);
          hm(K.dish, MAT.white, 6.52, 2.52, dz, Math.PI / 2 + 0.4, 1, 1, 1, -0.45, 0); hm(GEO.ucyl, MAT.darkMetal, 6.72, 2.42, dz + 0.1, 0, 0.025, 0.45, 0.025, 0.9, 0.5, false); }
        // the dryer vent and the outside tap with a hose reel on the other side wall
        hbox(-6.18, 0.42, -0.95, -6.1, 0.58, -0.79, MAT.white); for (let k = 0; k < 3; k++) hbox(-6.21, 0.44 + k * 0.05, -0.94, -6.18, 0.47 + k * 0.05, -0.8, MAT.white);
        { const tz = 0.3; hbox(-6.16, 0.5, tz - 0.03, -6.1, 0.56, tz + 0.03, K.copper); hm(GEO.ucyl, MAT.chrome, -6.19, 0.6, tz, 0, 0.04, 0.012, 0.04, 0, 0, false);
          if (r3() < 0.75) { const rz = tz + 0.7; hm(GEO.ucyl, K.reelM, -6.32, 0.62, rz, 0, 0.5, 0.03, 0.5, 0, Math.PI / 2, false); hm(K.coil, K.hose, -6.32, 0.62, rz, Math.PI / 2, 1, 1, 1, 0, 0, false);
            hbox(-6.22, 0.02, rz - 0.02, -6.18, 0.62, rz + 0.02, K.reelM); hm(K.droop, K.hose, -6.32, 0, rz, 0, 1, 1, 1, 0, 0, false);
            lsolid(-6.5, rz - 0.3, -6.1, rz + 0.3, 0, 0.95, 'plastic', { vault: true }); } }
      }
      // what happened here: boards over the windows, paint on the walls, a rescue team's X, bloody hands
      const decal = (tex, lx, ly, w, h) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), decalMat(tex)); const [dx, dz] = P(lx, 5.14); m.position.set(dx, ly, dz); m.rotation.y = yaw; m.renderOrder = 1; m.receiveShadow = true; level.add(m); };
      chaos(hx, hz, () => {
        if (r() < 0.32) for (const [w0, w1] of [[-1.3, 0.1], [2.6, 4.2]]) { const wx = (w0 + w1) / 2; for (let k = 0; k < 4; k++) { const [bx2, bz2] = P(wx, 5.15); inst(GEO.board, MAT.plank, mat4(bx2, 1.0 + k * 0.33 + (r() - 0.5) * 0.06, bz2, yaw, (w1 - w0 + 0.45) / 1.0, 1, 1, 0, (r() - 0.5) * 0.3)); } }
        if (r() < 0.45) decal(pickTex('spray', r), 1.35, 1.5 + (r() - 0.5) * 0.3, 2.3, 1.15);
        if (r() < 0.4) decal(pickTex('fema', r), -4.75, 1.75, 0.85, 0.85);
        if (r() < 0.25) decal(pickTex('hand', r), -1.85, 1.0, 0.7, 0.7);
      }, 'house' + H.id);
    }
    // ---- porch, steps, path, driveway ----
    { const [px, pz] = P(frontDoorX, 6.0); block(px, 0, pz, 1.3, 0.12, 1.0, yaw, 'concrete', 'concrete', false); (W.steps ||= []).push({ x: px, z: pz, hx: 1.3, hz: 1.0, c: Math.cos(yaw), s: Math.sin(yaw), r2: 3, y: 0.12 }); paved.push([px - 1.4, pz - 1.4, px + 1.4, pz + 1.4]); }
    { const [px, pz] = P(frontDoorX, 9); B.box(px, 0, pz, 0.6, 0.025, 2.2, yaw, f => f === 'top' ? 'drive' : null, TILE); paved.push(rectOf(px, pz, 0.6, 2.2, yaw)); }
    { const [px, pz] = P(8.6, 4); B.box(px, 0, pz, 1.6, 0.028, 7.2, yaw, f => f === 'top' ? 'drive' : null, TILE); paved.push(rectOf(px, pz, 1.6, 7.2, yaw)); }
    // ---- garden: hedges, trees, a picket fence along the front, privacy fence round the back ----
    if (r() < 0.6) { const [ax, az] = P(-9.5, 10.5); const [bx, bz] = P(-1.5, 10.5); picketFence(ax, az, bx, bz); }
    else { const [hx2, hz2] = P(-4.5, 10.2); hedge(hx2, hz2, 7, Y(0)); }
    { const [tx, tz] = P(-8.5 + r() * 3, 7.5); tree(tx, tz, 0.8 + r() * 0.5, r() < 0.5 ? 0 : 1); }
    { const [bx0, bz0] = P(-11.5, -13), [bx1, bz1] = P(11.5, -13), [sx0, sz0] = P(-11.5, -5.5), [sx1, sz1] = P(11.5, -5.5);
      privacyFence(bx0, bz0, bx1, bz1);
      const gate = r() < 0.5;
      privacyFence(bx0, bz0, ...(gate ? P(-11.5, -8) : [sx0, sz0]));
      privacyFence(bx1, bz1, ...(!gate ? P(11.5, -8) : [sx1, sz1]));
      void sx1; void sz1;
      if (r() < 0.7) { const [tx, tz] = P(-6 + r() * 12, -10.5); tree(tx, tz, 0.9 + r() * 0.4, 1); }
    }
    // a shed in the back yard (tools, sometimes the good stuff)
    if (r() < 0.6) {
      const [sx, sz] = P(8.2, -10.4);
      block(sx, 0, sz, 1.4, 2.2, 1.1, yaw, f => f === 'top' ? 'shingle0' : 'fence', 'wood');
      const SG = new THREE.Group(); SG.position.set(hx, 0, hz); SG.rotation.y = yaw; SG.scale.x = flip; level.add(SG);
      const dark = new THREE.Mesh(new THREE.PlaneGeometry(0.88, 1.88), MAT.leafCore); dark.position.set(8.2, 0.96, -9.295); SG.add(dark);
      const piv = new THREE.Group(); piv.position.set(7.75, 0.04, -9.27); SG.add(piv);
      const lf = new THREE.Mesh(new RoundedBoxGeometry(0.9, 1.9, 0.04, 2, 0.01), MAT.fence); lf.position.set(0.45, 0.95, 0); lf.castShadow = true; piv.add(lf);
      for (const y of [0.3, 1.6]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.1, 0.03), MAT.plank); st.position.set(0.45, y, 0.03); piv.add(st); }
      const [stx, stz] = P(8.2, -8.6), [s2x, s2z] = P(8.2, -9.3);
      const shc = container('shed', ...P(8.2, -9.0), 1.0, 'Tool shed', yaw, H, { parts: [{ o: piv, kind: 'hinge', a: -1.9 }], stand: { x: stx, z: stz, yaw: Math.atan2(s2x - stx, s2z - stz) } });
      addItems(shc, [['can', ...P(7.8, -9.75).slice(0, 1), 0.02, P(7.8, -9.75)[1], 0, 1.9], ['can', P(8.05, -9.8)[0], 0.02, P(8.05, -9.8)[1], 0, 1.7], ['cloth', P(8.5, -9.7)[0], 0.02, P(8.5, -9.7)[1]], ['box', P(8.6, -10.0)[0], 0.02, P(8.6, -10.0)[1], yaw]]);
    }
    // the mailbox at the kerb, a bin by the drive
    { const [mx, mz] = P(-6.5, 12.62); mailbox(mx, mz, yaw); }   // at the curb edge, out of the walkway
    if (r() < 0.7) { const [tx, tz] = P(10.6, 9.6); trashBin(tx, tz, yaw + 0.2, r() < 0.5 ? MAT.greenPaint : MAT.darkMetal); }
    // ---- the garden things that break: shrubs by the corners, pots on the porch, a yard sign, a young staked tree, a
    // plastic patio set out back, a pallet of crates by the back fence (own dice: nothing else about the house changes)
    { let s5 = seed * 7907 + 31; const r5 = () => ((s5 = (s5 * 9301 + 49297) % 233280) / 233280);
      const HK = houseKit(), BK2 = bkit(), fl = [HK.red, HK.yellow, HK.white, HK.purple, HK.pink];
      if (r5() < 0.75) bush(...P(5.35, 6.45), 0.7 + r5() * 0.3, r5);
      if (r5() < 0.6) bush(...P(-5.45, 6.3), 0.65 + r5() * 0.3, r5);
      if (r5() < 0.7) flowerPot(...P(frontDoorX - 1.05, 6.72), 0.12, r5, HK.bloom, fl[Math.floor(r5() * 5)]);
      if (r5() < 0.5) flowerPot(...P(frontDoorX + 1.05, 6.72), 0.12, r5, HK.bloom, fl[Math.floor(r5() * 5)]);
      if (r5() < 0.35) yardSign(...P(0.7, 9.9), Y(0) + (r5() - 0.5) * 0.3, Math.floor(r5() * 4));
      if (r5() < 0.4) sapling(...P(2.5, 8.6), 0.85 + r5() * 0.3, r5);
      if (r5() < 0.55) { const cm = r5() < 0.5 ? BK2.chairWhite : BK2.chairGreen, [tx2, tz2] = P(-0.6, -7.9);
        gardenTable(tx2, tz2, cm);
        for (const [lx, lz] of [[-1.45, -7.55], [0.3, -7.45]]) { const [cx2, cz2] = P(lx, lz); gardenChair(cx2, cz2, Math.atan2(tx2 - cx2, tz2 - cz2) + (r5() - 0.5) * 0.4, cm); } }
      if (r5() < 0.5) crateStack(...P(-10.2, -12.05), Y(0) + (r5() - 0.5) * 0.1, 1 + Math.floor(r5() * 3));
      if (r5() < 0.3) sapling(...P(-8.6, -8.2), 0.8 + r5() * 0.3, r5);
    }
    // ---- more of a lived-in yard (own dice): a kettle grill on the patio, a washing line, a hoop over the drive,
    // the kids' things left on the lawn ----
    { let s6 = seed * 6151 + 17; const r6 = () => ((s6 = (s6 * 9301 + 49297) % 233280) / 233280);
      const YK = yardKit(), Lm = (geo, mat, lx, ly, lz, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0, sh = true) => { const [x, z] = P(lx, lz); xadd(geo, mat, mat4(x, ly, z, Y(ry * flip), sx, sy, sz, rx, rz), sh); };
      if (r6() < 0.55) {   // the kettle grill
        const gx = 3.7 + r6() * 0.6, gz = -6.7 - r6() * 0.4;
        Lm(YK.kettle, MAT.black, gx, 0, gz, r6() * 6); Lm(YK.kettleLid, MAT.black, gx, 0.86, gz, 0, 1, 1, 1, r6() < 0.3 ? 0.9 : 0, 0);
        for (let k = 0; k < 3; k++) { const a = k * 2.094 + 0.3; Lm(GEO.ucyl, MAT.metal, gx + Math.cos(a) * 0.2, 0.33, gz + Math.sin(a) * 0.2, 0, 0.022, 0.68, 0.022, Math.sin(a) * 0.18, -Math.cos(a) * 0.18); }
        const [bx, bz] = P(gx, gz); solid(bx, bz, 0.3, 0.3, yaw, 0.95, 'metal', 0, { vault: true });
      }
      if (r6() < 0.4) {   // the washing line: two T-posts, three lines, a few things pegged out
        const za = -10.0, xa = -10.3, xb = -3.4;
        for (const lx of [xa, xb]) { Lm(GEO.ucyl, MAT.metal, lx, 0.95, za, 0, 0.05, 1.9, 0.05); Lm(GEO.ubox, MAT.metal, lx, 1.88, za, 0, 0.05, 0.05, 0.9); const [px, pz] = P(lx, za); solid(px, pz, 0.05, 0.05, 0, 1.9, 'metal'); }
        for (const o of [-0.38, 0, 0.38]) { const [ax, az] = P(xa, za + o), [bx2, bz2] = P(xb, za + o); wbeam([ax, 1.86, az], [bx2, 1.83, bz2], 0.008, 0.008, MAT.white, false); }
        const nCl = 2 + Math.floor(r6() * 4);
        for (let k = 0; k < nCl; k++) { const lx = lerp(xa + 0.6, xb - 0.6, (k + 0.5) / nCl) + (r6() - 0.5) * 0.3, o = [-0.38, 0, 0.38][Math.floor(r6() * 3)], m = YK.cloth[Math.floor(r6() * YK.cloth.length)], w2 = 0.45 + r6() * 0.4, h2 = 0.45 + r6() * 0.35;
          Lm(GEO.uplane, m, lx, 1.84 - h2 / 2, za + o, Math.PI / 2 * 0 + (r6() - 0.5) * 0.15, w2, h2, 1, 0, 0); }
      }
      if (r6() < 0.3) {   // a basketball hoop on a pole beside the drive, the board over the concrete
        const hx2 = 10.75, hz2 = -1.2;
        Lm(GEO.ucyl, MAT.darkMetal, hx2, 1.5, hz2, 0, 0.09, 3.0, 0.09); Lm(GEO.ubox, MAT.darkMetal, hx2 - 0.35, 2.95, hz2, 0, 0.7, 0.07, 0.07);
        Lm(GEO.ubox, YK.board, hx2 - 0.72, 3.25, hz2, Math.PI / 2, 1.2, 0.8, 0.04); Lm(YK.rim, MAT.orange, hx2 - 0.98, 3.0, hz2, 0, 1, 1, 1, 0, 0, false);
        Lm(YK.net, YK.netMat, hx2 - 0.98, 2.99, hz2, 0, 1, 1, 1, 0, 0, false);
        const [px, pz] = P(hx2, hz2); solid(px, pz, 0.09, 0.09, 0, 3.0, 'metal');
        if (r6() < 0.6) { const [bx, bz] = P(9.6 + r6(), 0.5 + r6() * 2); xadd(YK.ball, YK.ballMat, mat4(bx, 0.15, bz, r6() * 6), false); }
      }
      if (r6() < 0.4) {   // toys on the front lawn: a ball, a plastic trike or a wagon
        const tx = -4 + r6() * 3, tz = 7.4 + r6() * 1.6;
        Lm(YK.toyBall, YK.toyM[Math.floor(r6() * 3)], tx, 0.11, tz, r6() * 6, 1, 1, 1, 0, 0, false);
        if (r6() < 0.6) { const kx = tx - 1.2 - r6(), kz = tz + (r6() - 0.5) * 1.2, ry = r6() * 6, tip = r6() < 0.35;
          Lm(YK.trike, YK.toyM[Math.floor(r6() * 3)], kx, tip ? 0.17 : 0, kz, ry, 1, 1, 1, 0, tip ? Math.PI / 2 * 0.95 : 0); }
      }
    }
    // a car on the driveway
    if (r() < 0.55 && !opts.noCar) { const [cx, cz] = P(8.6, 6.5 - r() * 3); car(cx, cz, Y(flip > 0 ? 0 : 0) + (r() - 0.5) * 0.15, Math.floor(r() * 8), r() < 0.5 ? 'suv' : 'sedan'); }
    // a mown lawn; a mulch bed along the front wall; a worn patch under the tree
    for (let k = -5; k <= 5; k += 1.25) if (Math.abs(k - frontDoorX) > 1.6) paint(...P(k, 5.65), 0.6, 'mud', 0.55);
    // where the driveway crosses the sidewalk, the curb is cut down to a ramp
    { const [dx2, dz2] = P(8.6, 12); curbCut(dx2, dz2, 1.75); }

    // ---- furniture and the cupboards to search ----
    const F = (lx, lz, hxx, hzz, y0, y1, mat, surf = 'wood', solidIt = true, ry = 0) => { const [x, z] = P(lx, lz); return block(x, y0, z, hxx, y1, hzz, yaw + ry * flip, mat, surf, solidIt); };
    const C = (kind, lx, lz, y, label) => { const [x, z] = P(lx, lz); return container(kind, x, z, y, label, yaw, H); };
    // ---- furniture you can open: hollow units with shelves and things inside; doors swing, drawers slide ----
    const HG = new THREE.Group(); HG.position.set(hx, 0, hz); HG.rotation.y = yaw; HG.scale.x = flip; level.add(HG); H.HG = HG;
    // a unit in house-local space: centre (cx, cz), turned th (its front faces local +z turned by th), width W, height Ht, depth D
    const unit = (cx, cz, th, W, Ht, D, y0 = 0) => {
      const g = new THREE.Group(); g.position.set(cx, y0, cz); g.rotation.y = th; HG.add(g);
      const cs = Math.cos(th), sn2 = Math.sin(th);
      const L = (bx, bz) => [cx + bx * cs + bz * sn2, cz - bx * sn2 + bz * cs];
      const U = { g, th, W, H: Ht, D, y0, L,
        box(bx, ya, bz, hxx, yb, hzz, mat) { const [x, z] = P(...L(bx, bz)); B.box(x, y0 + ya, z, hxx, y0 + yb, hzz, yaw + flip * th, typeof mat === 'function' ? mat : ALL(mat), TILE); },
        world(bx, bz) { return P(...L(bx, bz)); },
        // what you stand on to use it: in front of its face; and which way you face
        stand(dist = 0.62) { const [fx, fz] = U.world(0, D / 2 + dist), [cx2, cz2] = U.world(0, D / 2); return { x: fx, z: fz, yaw: Math.atan2(cx2 - fx, cz2 - fz) }; },
      };
      return U;
    };
    const t2 = 0.022;
    function hollow(U, out, inn, shelves = [], top = null, noTop = false) {
      const { W, H: Ht, D } = U;
      U.box(0, 0, -D / 2 + t2 / 2, W / 2, Ht, t2 / 2, f => f === 'pz' ? inn : out);                 // back
      for (const sx of [-1, 1]) U.box(sx * (W / 2 - t2 / 2), 0, 0, t2 / 2, Ht, D / 2, f => (f === 'px') === (sx < 0) ? inn : out);   // sides
      U.box(0, 0, 0, W / 2 - t2, 0.07, D / 2 - 0.02, f => f === 'top' ? inn : out);                // plinth / floor
      if (!noTop) U.box(0, Ht - t2, 0, W / 2, Ht, D / 2, f => f === 'top' && top ? top : f === 'bot' ? inn : out);
      for (const y of shelves) U.box(0, y, 0, W / 2 - t2, y + 0.018, D / 2 - 0.03, inn);
    }
    const doorGeo2 = (w, h) => { const k = 'd' + w.toFixed(3) + h.toFixed(3); if (!FURN.has(k)) FURN.set(k, new RoundedBoxGeometry(w, h, 0.022, 2, 0.006)); return FURN.get(k); };
    // a hinged door: hinge at bx (unit space), the leaf runs toward dir (+1 → +x); it swings out ~100°
    function leaf(U, bx, ya, yb, w, dir, mat, knob = MAT.metal, maxA = 1.75) {
      const piv = new THREE.Group(); piv.position.set(bx, ya, U.D / 2 + 0.012); U.g.add(piv);
      const m = new THREE.Mesh(doorGeo2(w - 0.006, yb - ya - 0.006), mat); m.position.set(dir * w / 2, (yb - ya) / 2, 0); m.castShadow = true; m.receiveShadow = true; piv.add(m);
      const kh = Math.min(0.12, (yb - ya) * 0.4), kk = 'k' + kh.toFixed(3); if (!FURN.has(kk)) FURN.set(kk, new RoundedBoxGeometry(0.018, kh, 0.022, 2, 0.007));
      const k = new THREE.Mesh(FURN.get(kk), knob); k.position.set(dir * (w - 0.06), (yb - ya) * (yb - ya > 1 ? 0.5 : 0.75), 0.024); piv.add(k);
      return { o: piv, kind: 'hinge', a: -dir * Math.min(1.75, maxA), knob: k };
    }
    // a drawer: front panel and a tray behind it; slides out
    function drawerPart(U, bx, ya, yb, w, mat, dist = 0.36) {
      const g = new THREE.Group(); g.position.set(bx, ya, U.D / 2 - 0.0); U.g.add(g);
      const h = yb - ya, d = U.D - 0.08, key = w.toFixed(2) + '|' + h.toFixed(2) + '|' + d.toFixed(2);
      if (!FURN.has('f' + key)) {
        FURN.set('f' + key, new RoundedBoxGeometry(w - 0.01, h - 0.01, 0.022, 2, 0.005).translate(0, h / 2, 0.011));
        // the tray behind the front: bottom, two sides, back — one geometry
        FURN.set('t' + key, mergeGeometries([new THREE.BoxGeometry(w - 0.06, 0.012, d).translate(0, 0.03, -d / 2), new THREE.BoxGeometry(0.012, h * 0.6, d).translate(-w / 2 + 0.04, h * 0.33, -d / 2), new THREE.BoxGeometry(0.012, h * 0.6, d).translate(w / 2 - 0.04, h * 0.33, -d / 2), new THREE.BoxGeometry(w - 0.06, h * 0.6, 0.012).translate(0, h * 0.33, -d)]));
        // a bar pull on two little posts
        const pw = Math.min(0.18, w * 0.4);
        FURN.set('p' + key, mergeGeometries([new THREE.CylinderGeometry(0.007, 0.007, pw, 8).rotateZ(Math.PI / 2).translate(0, 0, 0.036), ...[-1, 1].map(sx => new THREE.CylinderGeometry(0.005, 0.005, 0.03, 6).rotateX(Math.PI / 2).translate(sx * (pw / 2 - 0.012), 0, 0.022))]));
      }
      const fr = new THREE.Mesh(FURN.get('f' + key), mat); fr.castShadow = true; fr.receiveShadow = true; g.add(fr);
      // what's behind the front is only drawn while the drawer is (being) opened
      const inner = new THREE.Group(); inner.visible = false; g.add(inner);
      const tr = new THREE.Mesh(FURN.get('t' + key), MAT.cabinet); tr.receiveShadow = true; inner.add(tr);
      const pull = new THREE.Mesh(FURN.get('p' + key), MAT.metal); pull.position.set(0, h * 0.55, 0); g.add(pull);
      // something in the drawer
      for (let k = 0; k < 3; k++) { const o = new THREE.Mesh(GEO.item, MAT['book' + Math.floor(r() * 6)]); o.position.set((r() - 0.5) * (w - 0.2), 0.06, -0.08 - r() * (d - 0.2)); o.rotation.y = r() * 3; o.scale.set(0.8 + r(), 0.6, 0.8 + r()); inner.add(o); (U.items ||= []).push(propItem({ mesh: o }, 'misc')); }
      return { o: g, kind: 'slide', d: dist, knob: pull, inner };
    }
    // things on shelves: cans, boxes, jars, bottles
    function stock(U, y, n, depth = 0.3, kinds = ['can', 'box', 'jar']) {
      for (let k = 0; k < n; k++) {
        const bx = -U.W / 2 + 0.08 + (k + 0.5) / n * (U.W - 0.16) + (r() - 0.5) * 0.04, bz = (r() - 0.5) * depth;
        const [x, z] = U.world(bx, bz), kind = kinds[Math.floor(r() * kinds.length)];
        let ref;
        if (kind === 'can') ref = inst(GEO.can, MAT['can' + Math.floor(r() * 3)], mat4(x, U.y0 + y, z, r() * 6));
        else if (kind === 'jar') ref = inst(GEO.jar, MAT.jarGlass, mat4(x, U.y0 + y, z, r() * 6));
        else if (kind === 'bottle') ref = inst(GEO.bottle, MAT['bottle' + Math.floor(r() * 2)], mat4(x, U.y0 + y, z, r() * 6));
        else if (kind === 'carton') ref = inst(GEO.carton, MAT.white, mat4(x, U.y0 + y, z, yaw + flip * U.th + (r() - 0.5) * 0.3));
        else if (kind === 'cloth') ref = inst(GEO.folded, MAT['fabric' + Math.floor(r() * 5)], mat4(x, U.y0 + y, z, yaw + flip * U.th));
        // a DVD case stood on its edge, an amber pill bottle, a printed pack of tablets (low things for low shelves)
        else if (kind === 'dvd') ref = inst(GEO.item, MAT['book' + Math.floor(r() * 6)], mat4(x, U.y0 + y, z, yaw + flip * U.th + (r() - 0.5) * 0.1, 0.14, 3.8, 0.96));
        else if (kind === 'pills') { const K = prodKit(); ref = inst(K.pillG, K.pill, mat4(x, U.y0 + y, z, r() * 6)); }
        else if (kind === 'meds') { const K = prodKit(); ref = inst(K.medG, K.med[Math.floor(r() * 4)], mat4(x, U.y0 + y, z, yaw + flip * U.th + (r() - 0.5) * 0.2)); }
        else ref = inst(GEO.cereal, MAT['book' + Math.floor(r() * 6)], mat4(x, U.y0 + y, z, yaw + flip * U.th + (r() - 0.5) * 0.2));
        if (ref) (U.items ||= []).push(propItem(ref, kind === 'cereal' || kind === 'box' || kind === 'dvd' || kind === 'meds' ? 'box' : kind === 'pills' ? 'bottle' : kind));
      }
    }
    const OC = (kind, U, label, y, parts) => { const st = U.stand(); const [fx, fz] = U.world(0, U.D / 2 + 0.3); return container(kind, fx, fz, y, label, yaw, H, { parts, stand: st, items: (U.items ||= []) }); };
    const fab = 'fabric' + Math.floor(r() * 5), fab2 = 'fabric' + Math.floor(r() * 5);
    const RB = (w, h, d, rad = 0.04, seg = 2) => { const k = 'rb' + [w, h, d, rad, seg].map(v => v.toFixed(3)).join(); if (!FURN.has(k)) FURN.set(k, new RoundedBoxGeometry(w, h, d, seg, Math.min(rad, w / 2.05, h / 2.05, d / 2.05))); return FURN.get(k); };
    const leg = (x, z, y1, w = 0.035, m = MAT.darkWood) => hbox(x - w / 2, 0, z - w / 2, x + w / 2, y1, z + w / 2, m, false);
    // living room (front left: x -6..1, z 0.4..5)
    { // the couch: a base on short legs, three seat cushions, three back cushions leaning back, rounded arms
      const fm = MAT[fab];
      solid(...P(-5.4, 2.6), 0.48, 1.2, yaw, 0.5, 'cloth');
      for (const [lx, lz] of [[-5.8, 1.5], [-5.02, 1.5], [-5.8, 3.7], [-5.02, 3.7]]) hm(GEO.ucyl, MAT.darkWood, lx, 0.05, lz, 0, 0.05, 0.1, 0.05, 0, 0, false);
      hm(RB(0.92, 0.24, 2.36, 0.05), fm, -5.42, 0.22, 2.6);
      hm(RB(0.18, 0.5, 2.36, 0.06), fm, -5.79, 0.59, 2.6);
      for (const sz of [-1, 1]) hm(RB(0.92, 0.3, 0.2, 0.08), fm, -5.42, 0.48, 2.6 + sz * 1.08);
      for (let i = -1; i <= 1; i++) {
        hm(RB(0.66, 0.15, 0.7, 0.05), fm, -5.29, 0.41, 2.6 + i * 0.66, (r() - 0.5) * 0.03);
        hm(RB(0.17, 0.46, 0.66, 0.07), fm, -5.62, 0.63, 2.6 + i * 0.66, 0, 1, 1, 1, 0, 0.16);
      }
      hm(RB(0.12, 0.34, 0.34, 0.05), MAT[fab2], -5.5, 0.62, 3.45, 0.4, 1, 1, 1, 0, 0.3);   // a throw pillow
    }
    { // the coffee table: a top, a shelf underneath, four legs
      solid(...P(-3.8, 2.6), 0.45, 0.6, yaw, 0.44, 'wood');
      hm(RB(0.9, 0.04, 1.2, 0.012), MAT.darkWood, -3.8, 0.42, 2.6);
      hbox(-4.2, 0.12, 2.06, -3.4, 0.14, 3.14, MAT.darkWood);
      for (const [lx, lz] of [[-4.21, 2.04], [-3.39, 2.04], [-4.21, 3.16], [-3.39, 3.16]]) leg(lx, lz, 0.4, 0.04);
      hm(RB(0.16, 0.025, 0.22, 0.004), MAT.book2, -3.7, 0.452, 2.4, 0.3, 1, 1, 1, 0, 0, false);   // a magazine
      hm(GEO.ucyl, MAT.white, -3.95, 0.49, 2.85, 0, 0.08, 0.1, 0.08, 0, 0, false);                 // a mug
    }
    { // TV cabinet: two doors, DVDs and junk inside
      const U = unit(-0.6, 2.6, -Math.PI / 2, 1.8, 0.55, 0.44); hollow(U, 'darkWood', 'cabinet', [0.28], 'darkWood');
      stock(U, 0.075, 14, 0.12, ['dvd']); stock(U, 0.3, 10, 0.12, ['dvd', 'dvd', 'dvd', 'jar']);   // DVDs (under 0.2 m: they fit under the shelf)
      solid(...P(-0.6, 2.6), 0.22, 0.9, yaw, 0.55, 'wood');
      OC('cabinet', U, 'TV cabinet', 0.4, [leaf(U, -0.9, 0.07, 0.52, 0.89, 1, MAT.darkWood), leaf(U, 0.9, 0.07, 0.52, 0.89, -1, MAT.darkWood)]);
    }
    { // the TV: a thin bezel on a pedestal stand, a glossy black screen facing the couch
      hm(RB(0.24, 0.02, 0.4, 0.008), MAT.black, -0.6, 0.56, 2.6); hbox(-0.62, 0.57, 2.57, -0.58, 0.68, 2.63, MAT.black);
      hm(RB(0.06, 0.72, 1.26, 0.012), MAT.black, -0.6, 1.02, 2.6);
      hm(GEO.uplane, MAT.screen, -0.632, 1.025, 2.6, -Math.PI / 2, 1.19, 0.65, 1, 0, 0, false);
    }
    { // the bookshelf: an open carcass (back, sides, four shelves) with books standing (and leaning) on them
      const U = unit(-5.05, 4.72, Math.PI, 1.2, 1.9, 0.36); hollow(U, 'darkWood', 'darkWood', [0.47, 0.93, 1.39], 'darkWood');
      solid(...P(-5.05, 4.72), 0.6, 0.18, yaw, 1.9, 'wood');
      for (let i = 0; i < 4; i++) {
        const y = i === 0 ? 0.07 : 0.488 + (i - 1) * 0.46;
        let x = -5.6;
        while (x < -4.52) {
          // shelves 1 and 2 keep room for the books you can take
          if ((i === 1 || i === 2) && [-5.47, -5.07, -4.67].some(m => Math.abs(x + 0.02 - m) < 0.1)) { x += 0.05; continue; }
          if (r() < 0.12) { x += 0.08 + r() * 0.1; continue; }   // a gap
          const t = 0.025 + r() * 0.035, hh = 0.2 + r() * 0.12, dd = 0.15 + r() * 0.06, lean = r() < 0.08 && x < -4.7 ? 0.25 : 0;
          hm(GEO.ubox, MAT['book' + Math.floor(r() * 6)], x + t / 2 + lean * hh * 0.5, y + hh / 2 * Math.cos(lean), 4.78 - dd / 2, 0, t, hh, dd, 0, -lean, false);
          x += t + 0.003 + lean * hh;
        }
      }
    }
    { const bs = C('shelf', -5.05, 4.15, 1.0, 'Bookshelf'); const bl = []; for (const i of [1, 2]) for (const k of [0, 2, 4]) { const [x, z] = P(-5.55 + k * 0.2 + 0.08, 4.66); bl.push(['book', x, 0.488 + (i - 1) * 0.46, z, yaw + Math.PI / 2]); } addItems(bs, bl); }
    { const [x, z] = P(-3.5, 2.6); B.box(x, 0.03, z, 1.4, 0.04, 1.6, yaw, f => f === 'top' ? (r() < 0.5 ? 'rug0' : 'rug1') : null, TILE); }
    // a floor lamp by the couch
    { hm(GEO.ucyl, MAT.darkMetal, -5.5, 0.012, 1.0, 0, 0.28, 0.025, 0.28, 0, 0, false); hm(GEO.ucyl, MAT.darkMetal, -5.5, 0.78, 1.0, 0, 0.025, 1.5, 0.025, 0, 0, false); hm(GEO.shade, MAT.lampShade, -5.5, 1.48, 1.0, 0, 1.3, 1.3, 1.3); solid(...P(-5.5, 1.0), 0.15, 0.15, yaw, 1.6, 'metal'); }
    // kitchen (back left: x -6..2.5, z -5..0.4)
    { // the counter along the back wall: a cupboard (two doors) and a stack of three drawers; the sink under the window
      const U = unit(-0.55, -4.6, 0, 3.2, 0.86, 0.6); hollow(U, 'cabinet', 'cabinet', [0.42], null, true);
      // the worktop, with a hole for the sink (local x -0.9, under the window)
      hm(GEO.sinkTop, MAT.counter, -0.55, 0.86, -4.6 + 0.02);
      U.box(0, 0.07, 0, 0.011, 0.86, 0.28, 'cabinet');   // divider
      { const UL = { ...U, W: 1.5, world: (bx, bz) => U.world(bx - 0.8, bz) };   // the cupboard half only (the drawers are the other half)
        stock(UL, 0.075, 4, 0.25, ['can', 'can', 'box', 'jar']); stock(UL, 0.44, 4, 0.25, ['can', 'box', 'jar']); U.items = UL.items; }
      solid(...P(-0.55, -4.6), 1.6, 0.3, yaw, 0.9, 'wood');
      OC('kitchen', { ...U, stand: (d = 0.62) => { const [fx, fz] = U.world(-0.8, U.D / 2 + d), [cx2, cz2] = U.world(-0.8, U.D / 2); return { x: fx, z: fz, yaw: Math.atan2(cx2 - fx, cz2 - fz) }; }, world: (bx, bz) => U.world(bx - 0.8, bz) }, 'Kitchen cabinets', 0.9, [leaf(U, -1.58, 0.08, 0.84, 0.78, 1, MAT.cabinet), leaf(U, -0.02, 0.08, 0.84, 0.78, -1, MAT.cabinet)]);
      U.items = [];   // the drawers have their own things (not the cupboard's)
      OC('kitchen2', { ...U, stand: (d = 0.62) => { const [fx, fz] = U.world(0.8, U.D / 2 + d), [cx2, cz2] = U.world(0.8, U.D / 2); return { x: fx, z: fz, yaw: Math.atan2(cx2 - fx, cz2 - fz) }; }, world: (bx, bz) => U.world(bx + 0.8, bz) }, 'Kitchen drawers', 0.9, [drawerPart(U, 0.8, 0.62, 0.85, 1.56, MAT.cabinet, 0.38), drawerPart(U, 0.8, 0.35, 0.6, 1.56, MAT.cabinet, 0.32), drawerPart(U, 0.8, 0.08, 0.33, 1.56, MAT.cabinet, 0.28)]);
      // the stainless basin and a gooseneck tap
      hm(GEO.basin, MAT.metal, -0.9, 0.9, -4.58); hm(GEO.ucyl, MAT.darkMetal, -0.9, 0.727, -4.58, 0, 0.07, 0.004, 0.07, 0, 0, false);
      hm(GEO.ucyl, MAT.chrome, -0.9, 0.93, -4.84, 0, 0.05, 0.06, 0.05); hm(GEO.tap, MAT.chrome, -0.9, 0.9, -4.84);
      hm(GEO.ucyl, MAT.chrome, -0.72, 0.93, -4.84, 0, 0.03, 0.05, 0.03, 0, 0, false);
    }
    { // the side counter: the pantry cupboard in the middle
      const U = unit(-5.6, -2.6, Math.PI / 2, 3.2, 0.86, 0.6); hollow(U, 'cabinet', 'cabinet', [0.42]);
      U.box(0, 0.86, 0.02, 1.62, 0.9, 0.33, 'counter');
      stock(U, 0.075, 7, 0.25, ['can', 'cereal', 'box', 'jar']); stock(U, 0.44, 7, 0.25, ['can', 'can', 'cereal', 'jar', 'bottle']);
      solid(...P(-5.6, -2.6), 0.3, 1.6, yaw, 0.9, 'wood');
      OC('pantry', U, 'Pantry', 0.9, [leaf(U, -1.6, 0.08, 0.84, 0.79, 1, MAT.cabinet), leaf(U, -0.8, 0.08, 0.84, 0.79, 1, MAT.cabinet), leaf(U, 0.79, 0.08, 0.84, 0.79, -1, MAT.cabinet), leaf(U, 1.6, 0.08, 0.84, 0.79, -1, MAT.cabinet)]);   // all four doors: the stock runs the whole width
      hm(RB(0.36, 0.28, 0.2, 0.02), MAT.appliance, -5.7, 1.04, -3.6, Math.PI / 2);   // a toaster
      for (const ox of [-0.045, 0.045]) hm(GEO.ubox, MAT.black, -5.7 + ox, 1.181, -3.6, Math.PI / 2, 0.25, 0.004, 0.032, 0, 0, false);   // its two bread slots
      hm(GEO.ubox, MAT.black, -5.7, 1.1, -3.6 + 0.185, Math.PI / 2, 0.03, 0.025, 0.05, 0, 0, false);   // the lever
      // a microwave: a steel box, a dark glass door window, the keypad strip
      hm(RB(0.5, 0.29, 0.36, 0.02), MAT.appliance, -5.64, 1.045, -1.55, Math.PI / 2);
      hm(GEO.uplane, MAT.black, -5.458, 1.045, -1.6, Math.PI / 2, 0.32, 0.19, 1, 0, 0, false);
      hm(GEO.uplane, MAT.darkMetal, -5.458, 1.045, -1.38, Math.PI / 2, 0.09, 0.21, 1, 0, 0, false);
      hm(GEO.ucyl, MAT.redPaint, -5.72, 1.0, -2.2, 0, 0.16, 0.2, 0.16);                // a kettle-ish canister
    }
    // wall cabinets either side of the window (doors that open, a shelf inside)
    for (const [cx2, w2] of [[-1.925, 0.41], [0.47, 1.1]]) {
      const U = unit(cx2, -4.73, 0, w2, 0.72, 0.34, 1.45); hollow(U, 'cabinet', 'cabinet', [0.36]);
      if (w2 < 0.6) leaf(U, -w2 / 2, 0.01, 0.71, w2, 1, MAT.cabinet); else { leaf(U, -w2 / 2, 0.01, 0.71, w2 / 2, 1, MAT.cabinet); leaf(U, w2 / 2, 0.01, 0.71, w2 / 2, -1, MAT.cabinet); }
    }
    { // the fridge: a white box with shelves of food, the door swings wide
      const U = unit(1.75, -4.55, 0, 0.8, 1.85, 0.7); hollow(U, 'appliance', 'porcelain', [0.5, 0.92, 1.3, 1.45]);
      stock(U, 0.088, 3, 0.3, ['bottle', 'carton']); stock(U, 0.518, 4, 0.3, ['carton', 'jar', 'bottle']); stock(U, 0.938, 4, 0.3, ['jar', 'box', 'can']); stock(U, 1.468, 3, 0.25, ['box', 'carton']);
      solid(...P(1.75, -4.55), 0.4, 0.35, yaw, 1.85, 'metal');
      const d1 = leaf(U, 0.4, 0.02, 1.84, 0.8, -1, MAT.appliance, MAT.darkMetal);
      OC('fridge', U, 'Fridge', 1.2, [d1]);
    }
    { // the stove: four burners, a control panel with knobs at the back, an oven door with a window, a hood above
      F(-5.6, -0.6, 0.32, 0.4, 0, 0.9, f => f === 'top' ? 'black' : 'appliance', 'metal');
      for (const [bx, bz] of [[-5.72, -0.82], [-5.72, -0.4], [-5.45, -0.82], [-5.45, -0.4]]) hm(GEO.burner, MAT.darkMetal, bx, 0.905, bz, 0, 1, 1, 1, 0, 0, false);
      hbox(-5.92, 0.9, -1.0, -5.84, 1.06, -0.2, MAT.appliance);
      for (let k = 0; k < 4; k++) hm(GEO.knob, MAT.black, -5.83, 0.99, -0.86 + k * 0.17, 0, 1, 1, 1, 0, Math.PI / 2, false);
      hbox(-5.285, 0.12, -0.96, -5.27, 0.78, -0.24, MAT.appliance); hbox(-5.272, 0.3, -0.86, -5.266, 0.64, -0.34, MAT.screen, false);
      hm(GEO.ucyl, MAT.chrome, -5.23, 0.72, -0.6, 0, 0.024, 0.62, 0.024, Math.PI / 2, 0, false);
      hm(RB(0.5, 0.18, 0.8, 0.02), MAT.appliance, -5.67, 1.66, -0.6);   // the range hood
    }
    { // the table: a rounded top on four legs; a fruit bowl on it
      solid(...P(-2.2, -1.6), 0.6, 0.45, yaw, 0.77, 'wood');
      hm(RB(1.2, 0.04, 0.9, 0.015), MAT.darkWood, -2.2, 0.75, -1.6);
      for (const [ax, az] of [[-2.73, -1.98], [-1.67, -1.98], [-2.73, -1.22], [-1.67, -1.22]]) leg(ax, az, 0.73, 0.05);
      hm(GEO.bowl, MAT.ceramicDS, -2.1, 0.77, -1.55, 0, 1, 1, 1, 0, 0, false);
      for (let k = 0; k < 5; k++) hm(GEO.fruit, [MAT.redPaint, MAT.yellowPaint, MAT.orange][k % 3], -2.1 + Math.cos(k * 1.3) * 0.06, 0.83 + (k > 2 ? 0.04 : 0), -1.55 + Math.sin(k * 1.3) * 0.06, 0, 1, 1, 1, 0, 0, false);
    }
    // two chairs: a seat on four legs, back posts and two slats
    for (const [ax, az] of [[-2.2, -2.4], [-2.2, -0.8]]) {
      const bk = az < -1.6 ? -1 : 1;
      hm(RB(0.44, 0.035, 0.44, 0.01), MAT.darkWood, ax, 0.45, az);
      for (const ox of [-0.19, 0.19]) for (const oz of [-0.19, 0.19]) leg(ax + ox, az + oz, oz * bk > 0 ? 0.96 : 0.44);
      for (const y of [0.68, 0.86]) hbox(ax - 0.19, y, az + bk * 0.19 - 0.01, ax + 0.19, y + 0.06, az + bk * 0.19 + 0.01, MAT.darkWood, false);
      solid(...P(ax, az), 0.22, 0.22, yaw, 0.9, 'wood');
    }
    // bedroom (front right: x 1..6, z 0.4..5)
    { // the bed: a frame on legs, a thick mattress, a duvet folded back, two plump pillows, a padded headboard
      solid(...P(4.3, 3.4), 1.0, 1.6, yaw, 0.68, 'wood');
      hm(RB(2.02, 0.22, 3.12, 0.03), MAT.darkWood, 4.3, 0.29, 3.4);
      for (const [lx, lz] of [[3.35, 1.86], [5.25, 1.86]]) leg(lx, lz, 0.2, 0.06);
      hm(RB(1.9, 0.24, 2.95, 0.07, 3), MAT.mattress, 4.3, 0.52, 3.43);
      hm(RB(1.98, 0.07, 2.15, 0.03), MAT[fab2], 4.3, 0.665, 2.92); for (const sx of [-1, 1]) hm(RB(0.05, 0.28, 2.15, 0.025), MAT[fab2], 4.3 + sx * 0.975, 0.53, 2.92); hm(RB(1.98, 0.28, 0.05, 0.025), MAT[fab2], 4.3, 0.53, 1.86);   // it drapes down the sides and the foot hm(RB(1.98, 0.09, 0.32, 0.04), MAT[fab2], 4.3, 0.68, 4.0, 0, 1, 1, 1, -0.06);
      for (const px of [3.83, 4.77]) hm(RB(0.62, 0.14, 0.42, 0.06, 3), MAT.mattress, px, 0.72, 4.58, (r() - 0.5) * 0.12);
      hm(RB(2.06, 0.9, 0.08, 0.03), MAT.darkWood, 4.3, 0.45, 4.86);
    }
    { const U = unit(5.6, 4.6, Math.PI, 0.5, 0.6, 0.5); hollow(U, 'darkWood', 'cabinet', [], 'darkWood');
      solid(...P(5.6, 4.6), 0.25, 0.25, yaw, 0.6, 'wood');
      OC('nightstand', U, 'Nightstand', 0.6, [drawerPart(U, 0, 0.36, 0.56, 0.46, MAT.darkWood, 0.3), drawerPart(U, 0, 0.1, 0.34, 0.46, MAT.darkWood, 0.26)]);
      // a table lamp and an alarm clock on it
      hm(GEO.ucyl, MAT.porcelain, 5.62, 0.75, 4.68, 0, 0.11, 0.3, 0.11); hm(GEO.shade, MAT.lampShade, 5.62, 1.0, 4.68);
      hm(RB(0.12, 0.07, 0.05, 0.01), MAT.black, 5.5, 0.635, 4.48, 0.4, 1, 1, 1, 0, 0, false); }
    { const U = unit(1.4, 3.85, Math.PI / 2, 1.4, 1.2, 0.5); hollow(U, 'darkWood', 'cabinet', [], 'darkWood');
      solid(...P(1.4, 3.85), 0.25, 0.7, yaw, 1.2, 'wood');
      OC('dresser', U, 'Dresser', 1.0, [drawerPart(U, 0, 0.82, 1.16, 1.36, MAT.darkWood, 0.34), drawerPart(U, 0, 0.45, 0.8, 1.36, MAT.darkWood, 0.3), drawerPart(U, 0, 0.08, 0.43, 1.36, MAT.darkWood, 0.26)]); }
    { // the closet: coats on a rail, boxes on the shelf
      const U = unit(5.65, 1.3, -Math.PI / 2, 1.6, 2.1, 0.6); hollow(U, 'cabinet', 'cabinet', [1.72], 'cabinet');
      U.box(0, 1.6, 0, 0.76, 1.62, 0.012, 'metal');   // the rail
      for (let k = 0; k < 7; k++) { if (r() < 0.2) continue; const bx = -0.62 + k * 0.2; U.box(bx, 0.62 + r() * 0.2, 0, 0.03, 1.58, 0.24, 'fabric' + Math.floor(r() * 5)); U.box(bx, 1.575, 0, 0.012, 1.592, 0.215, 'darkWood'); U.box(bx, 1.592, 0, 0.005, 1.62, 0.005, 'metal'); }   // each coat on a wooden hanger hooked over the rail
      stock(U, 1.74, 4, 0.2, ['box', 'cloth', 'cloth']);
      solid(...P(5.65, 1.3), 0.3, 0.8, yaw, 2.1, 'wood');
      OC('closet', U, 'Closet', 1.1, [leaf(U, -0.8, 0.08, 2.06, 0.79, 1, MAT.cabinet, MAT.metal, Math.PI / 2), leaf(U, 0.8, 0.08, 2.06, 0.79, -1, MAT.cabinet, MAT.metal, Math.PI / 2)]);   // against a wall: 90° and no further
    }
    // a laundry basket with clothes in it
    { hm(GEO.basket, MAT.ceramicDS, 3.0, 0, 0.95); hm(RB(0.36, 0.1, 0.3, 0.05), MAT[fab], 3.0, 0.36, 0.95, 0.5); solid(...P(3.0, 0.95), 0.23, 0.23, yaw, 0.42, 'plastic'); }
    // bathroom (back right: x 2.5..6, z -5..0.4)
    { // the bathtub: rim walls round a sunken basin, a spout, a shower riser and head, a curtain half drawn
      solid(...P(5.25, -3.3), 0.65, 1.6, yaw, 0.58, 'tile');   // an alcove tub: wall to wall
      hbox(4.6, 0, -4.9, 4.68, 0.58, -1.7, MAT.porcelain); hbox(5.82, 0, -4.9, 5.9, 0.58, -1.7, MAT.porcelain);
      hbox(4.68, 0, -4.9, 5.82, 0.58, -4.82, MAT.porcelain); hbox(4.68, 0, -1.78, 5.82, 0.58, -1.7, MAT.porcelain);
      hbox(4.68, 0, -4.82, 5.82, 0.14, -1.78, MAT.porcelain); hbox(5.1, 0.141, -4.75, 5.3, 0.142, -4.65, MAT.chrome, false);   // the floor of it, the plug
      hm(GEO.ucyl, MAT.chrome, 5.2, 0.72, -4.82, 0, 0.04, 0.14, 0.04, Math.PI / 2, 0, false);
      for (const ox of [-0.18, 0.18]) hm(GEO.ucyl, MAT.chrome, 5.2 + ox, 0.82, -4.875, 0, 0.05, 0.03, 0.05, Math.PI / 2, 0, false);
      hm(GEO.ucyl, MAT.chrome, 5.2, 1.45, -4.87, 0, 0.022, 1.0, 0.022, 0, 0, false);
      hm(GEO.ucyl, MAT.chrome, 5.2, 1.95, -4.78, 0, 0.02, 0.2, 0.02, Math.PI / 2, 0, false);
      hm(GEO.ucyl, MAT.chrome, 5.2, 1.93, -4.66, 0, 0.13, 0.03, 0.13, 0.5, 0, false);
      hm(GEO.ucyl, MAT.chrome, 4.71, 2.02, -3.2, 0, 0.022, 3.0, 0.022, Math.PI / 2, 0, false);   // the curtain rail (over the tub, inside its rim)
      // the shower curtain, hanging inside the tub: pleated in soft folds, on rings round the rail
      for (let k = 0; k < 6; k++) { const ox = k % 2 ? 0.012 : -0.012, z0 = -2.45 + k * 0.1217; hbox(4.695 + ox, 0.25, z0, 4.725 + ox, 1.99, z0 + 0.1217, MAT[cur]); }
      for (let k = 0; k < 6; k++) hm(GEO.ucyl, MAT.chrome, 4.71, 2.0, -2.42 + k * 0.13, 0, 0.03, 0.008, 0.03, Math.PI / 2, 0, false);
    }
    { // the toilet: a lathed bowl, a seat, a tank with a lid and a lever
      solid(...P(3.2, -4.6), 0.22, 0.3, yaw, 0.42, 'tile');
      hm(GEO.wcBowl, MAT.porcelainDS, 3.2, 0, -4.5); hm(GEO.wcSeat, MAT.white, 3.2, 0.415, -4.48, 0, 1, 1, 1, 0, 0, false);
      hm(RB(0.42, 0.38, 0.18, 0.03), MAT.porcelain, 3.2, 0.62, -4.8); hm(RB(0.44, 0.03, 0.2, 0.01), MAT.porcelain, 3.2, 0.825, -4.8);
      hbox(3.02, 0.74, -4.71, 3.1, 0.76, -4.69, MAT.chrome, false);
      hm(GEO.ucyl, MAT.white, 2.85, 0.75, -4.84, 0, 0.12, 0.11, 0.12, Math.PI / 2, 0, false);   // the toilet roll
      hbox(2.83, 0.70, -4.9, 2.87, 0.80, -4.885, MAT.chrome, false); hm(GEO.ucyl, MAT.chrome, 2.85, 0.75, -4.84, 0, 0.014, 0.15, 0.014, Math.PI / 2, 0, false); hbox(2.83, 0.745, -4.9, 2.87, 0.755, -4.78, MAT.chrome, false);   // its holder: wall plate, arm, spindle
    }
    { // the vanity against the wall: a cabinet, a top with a basin sunk in it, a tap
      F(5.6, -0.55, 0.25, 0.45, 0, 0.82, f => f === 'top' ? null : 'cabinet', 'wood');
      hm(GEO.vanityTop, MAT.porcelain, 5.6, 0.82, -0.55); hm(GEO.washBasin, MAT.porcelainDS, 5.6, 0.85, -0.55);
      hm(GEO.ucyl, MAT.chrome, 5.8, 0.9, -0.55, 0, 0.04, 0.1, 0.04); hm(GEO.ucyl, MAT.chrome, 5.73, 0.95, -0.55, 0, 0.022, 0.15, 0.022, 0, Math.PI / 2, false);
      for (const sz of [-0.12, 0.12]) hm(GEO.ucyl, MAT.chrome, 5.8, 0.88, -0.55 + sz, 0, 0.035, 0.04, 0.035, 0, 0, false);
      hm(GEO.ucyl, MAT.chrome, 5.88, 1.95, -0.55, 0, 0.03, 0.55, 0.03, Math.PI / 2, 0, false);   // a light bar over the mirror
    }
    { // the mirrored medicine cabinet over the sink (stand back from the vanity to open it)
      const U = unit(5.88, -0.55, -Math.PI / 2, 0.7, 0.62, 0.14, 1.2); hollow(U, 'white', 'porcelain', [0.3], 'white');
      stock(U, 0.075, 6, 0.04, ['pills', 'meds', 'pills']); stock(U, 0.32, 6, 0.04, ['pills', 'meds']);   // pill bottles and packs of tablets
      OC('medicine', { ...U, stand: () => U.stand(0.98) }, 'Medicine cabinet', 1.2, [leaf(U, -0.35, 0.0, 0.62, 0.7, 1, MAT.mirror, MAT.white)]);
    }
    hbox(2.6, 1.3, -3.42, 2.64, 1.32, -2.78, MAT.chrome, false); hbox(2.6, 0.92, -3.36, 2.67, 1.31, -2.84, MAT[fab2], false);   // a towel on a rail
    // ---- the things on every wall: ceiling lights, switches, sockets, pictures, a clock ----
    for (const [lx, lz] of [[-2.5, 2.7], [3.5, 2.6], [-2.0, -2.3], [4.2, -2.3]]) hm(GEO.ceilLight, MAT.fixture, lx, WH - 0.12, lz, 0, 1, 1, 1, 0, 0, false);
    // switch plates by the latch side of each doorway, sockets low on the walls (each [x, y, z, facing])
    for (const [lx, ly, lz, fy, sw] of [[-2.25, 1.2, 4.895, Math.PI, 1], [-1.85, 1.2, 0.505, 0, 1], [-1.85, 1.2, 0.295, Math.PI, 1], [0.895, 1.2, 2.65, -Math.PI / 2, 1], [4.35, 1.2, 0.505, 0, 1], [4.35, 1.2, 0.295, Math.PI, 1],
      [-0.4, 0.3, 0.505, 0, 0], [-5.895, 0.3, 4.1, Math.PI / 2, 0], [0.6, 1.1, -4.895, 0, 0], [2.4, 0.3, 0.505, 0, 0], [5.895, 0.3, 3.9, -Math.PI / 2, 0], [2.605, 1.1, -0.8, Math.PI / 2, 0], [-4.2, 0.3, 0.295, Math.PI, 0]])
      hm(GEO.plate, MAT.white, lx, ly, lz, fy, 1, sw ? 1 : 0.95, 1, 0, 0, false);
    // pictures: one over the sofa wall, one by the TV, one over the dresser
    for (const [lx, ly, lz, fy, pw, ph] of [[-4.6, 1.6, 0.515, 0, 0.7, 0.5], [0.885, 1.55, 4.05, -Math.PI / 2, 0.5, 0.62], [1.115, 1.75, 3.85, Math.PI / 2, 0.6, 0.45]]) {
      const pi = Math.floor(r() * 4);
      hm(GEO.ubox, MAT.darkWood, lx, ly, lz, fy, pw + 0.06, ph + 0.06, 0.03, 0, 0, false);
      hm(GEO.uplane, MAT['art' + pi], lx + Math.sin(fy) * 0.016, ly, lz + Math.cos(fy) * 0.016, fy, pw, ph, 1, 0, 0, false);
    }
    // the kitchen clock
    hm(GEO.clock, MAT.white, -4.4, 1.95, 0.29, Math.PI, 1, 1, 1, 0, 0, false); hm(GEO.uplane, MAT.clockFace, -4.4, 1.95, 0.27, Math.PI, 0.26, 0.26, 1, 0, 0, false);
    // ---- the occupants are long gone (or not): a blood trail, sometimes ----
    if (r() < 0.4) { const [bx, bz] = P(-3 + r() * 5, 2 + r() * 2); chaos(hx, hz, () => W.blood(bx, bz, 0.6 + r() * 0.9, 0.035), 'house' + H.id); }
    // spots inside where a zombie might be standing
    H.inside = [P(-2.0, 1.5), P(-4.0, -3.0), P(2.4, 1.2), P(3.8, -2.2)];   // open floor in each room (never inside furniture)
    return H;
  }
  function rectOf(x, z, hx, hz, yaw) {   // axis-aligned bounding rect of an oriented box
    const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw)); const ex = hx * c + hz * s, ez = hx * s + hz * c;
    return [x - ex, z - ez, x + ex, z + ez];
  }

  // ---------------- cars ----------------
  // each body's real shape, measured once from its mesh: bumper to bumper, the belt line (hood/trunk/bed rim
  // height) and where the cabin (the glass) is — so shots and grenades go over a hood, and nothing pokes out
  const BELT = { sedan: 1.05, suv: 1.12, pickup: 1.15, van: 1.25 }, PROFILE = {};
  function carProfile(type, g) {
    if (PROFILE[type]) return PROFILE[type];
    const belt = BELT[type] || 1.1, v = new THREE.Vector3();
    let x1 = 0, z0 = 1e9, z1 = -1e9, c0 = 1e9, c1 = -1e9, cx = 0, H = 0;
    g.updateMatrixWorld(true);
    g.traverse(o => {
      if (!o.isMesh || !o.geometry.attributes.position) return;
      const pa = o.geometry.attributes.position;
      for (let i = 0; i < pa.count; i++) {
        v.fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld);
        z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z); H = Math.max(H, v.y);
        if (v.y < 1.6) x1 = Math.max(x1, Math.abs(v.x));
        if (v.y > belt + 0.15) { c0 = Math.min(c0, v.z); c1 = Math.max(c1, v.z); cx = Math.max(cx, Math.abs(v.x)); }
      }
    });
    const sz = CAR_SIZE[type] || CAR_SIZE.sedan;
    if (!(z1 > z0)) { z0 = -sz.L / 2; z1 = sz.L / 2; x1 = sz.W / 2; H = sz.H; }
    if (!(c1 > c0)) { c0 = z0 * 0.5; c1 = z1 * 0.3; cx = x1 * 0.9; }
    return (PROFILE[type] = { belt, hx: Math.min(x1, sz.W / 2 + 0.12), z0, z1, c0, c1, cx: Math.min(cx, x1, sz.W / 2), H: Math.min(H, sz.H + 0.15) });
  }
  // ambient occlusion on the ground under things (a car, a shelf unit): the sky can't get under them, so the ground
  // there is darker even on a grey day with no sun shadows. A soft rounded rectangle, multiplied onto what's below.
  const aoMat = new THREE.MeshBasicMaterial({ map: (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 128, 128); g.filter = 'blur(13px)'; g.fillStyle = '#a8a8a8'; g.beginPath(); g.roundRect(26, 22, 76, 84, 18); g.fill(); g.filter = 'none'; const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; })(),
    transparent: true, blending: THREE.MultiplyBlending, premultipliedAlpha: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  W.aoMat = aoMat;
  const aoGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  // (its own mesh, a child of a car so it goes where the car goes; instanced under the furniture that stays put)
  const aoBlob = (w, l) => { const m = new THREE.Mesh(aoGeo, aoMat); m.scale.set(w, 1, l); m.position.y = 0.025; m.renderOrder = 1; m.castShadow = false; m.receiveShadow = false; return m; };
  function car(x, z, yaw, ci = 0, type = 'sedan', opts = {}) {
    const g = buildCar(type, opts.paint || MAT['car' + (ci % 8)], opts);
    // (measured on a clean body: a wreck's crumpled nose or a burnt shell on its rims would give the wrong size)
    const pf = carProfile(type, (opts.wreck || opts.burnt) && !PROFILE[type] ? buildCar(type, MAT.car0, {}) : g);
    g.position.set(x, 0, z); g.rotation.y = yaw; level.add(g);
    const sz = CAR_SIZE[type] || CAR_SIZE.sedan, fx0 = Math.sin(yaw), fz0 = Math.cos(yaw);
    { const ao = aoBlob(sz.W * 1.45, sz.L * 1.22); g.add(ao); g.userData.ao = ao; }
    // the body, bumper to bumper, up to the belt line; the cabin above it (it goes when the body box goes)
    const bo = (pf.z0 + pf.z1) / 2, co = (pf.c0 + pf.c1) / 2;
    const box = solid(x + fx0 * bo, z + fz0 * bo, pf.hx + 0.03, (pf.z1 - pf.z0) / 2 + 0.02, yaw, pf.belt, 'metal');
    const cab = solid(x + fx0 * co, z + fz0 * co, pf.cx + 0.02, (pf.c1 - pf.c0) / 2 + 0.04, yaw, pf.H + 0.03, 'metal', pf.belt - 0.02, { navSkip: true });
    Object.defineProperty(cab, 'off', { get() { return this._off || box.off; }, set(v2) { this._off = v2; }, enumerable: true, configurable: true });
    const C = { x, z, yaw, g, type, box, cab, pf, alarm: Math.random() < 0.35, alarmT: 0, ...opts };
    W.cars.push(C);
    const back = sz.L / 2 + 0.45, fx = Math.sin(yaw), fz = Math.cos(yaw);
    const stand = { x: x - fx * (back + 0.35), z: z - fz * (back + 0.35), yaw };
    if (!opts.wreck && !opts.noSearch) container(type === 'pickup' ? 'truck' : 'car', x - fx * back, z - fz * back, 0.9, type === 'pickup' ? 'Truck bed & cab' : type === 'suv' ? 'Car (the back hatch)' : 'Car (the trunk)', yaw, null, { car: C, parts: g.userData.parts, stand });
    C.parts = g.userData.parts; C.stand = stand; if (CI) CI.cars.push(C);
    const tc = W.containers[W.containers.length - 1]; if (tc && tc.car === C && g.userData.cargo) { tc.items = g.userData.cargo.map(cg => propItem({ mesh: cg.mesh }, cg.kind)); if (type === 'sedan') { tc.hideShut = true; for (const cg of g.userData.cargo) cg.mesh.visible = false; W.shutCargo.push(tc); } }
    paved.push(rectOf(x, z, sz.W / 2 + 0.15, sz.L / 2 + 0.1, yaw));
    return C;
  }
  const scorchMat = new THREE.MeshStandardMaterial({ map: TX.bloodTexture(7), color: 0x0a0806, transparent: true, opacity: 0.8, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  function wreck(x, z, yaw, ci, burning = false, roll = 0) { let C; chaos(x, z, () => { C = wreck0(x, z, yaw, ci, burning, roll); }); return C; }
  function wreck0(x, z, yaw, ci, burning = false, roll = 0) {
    const C = car(x, z, yaw, ci, Math.random() < 0.5 ? 'sedan' : 'suv', { wreck: true, burnt: burning });
    if (roll) {
      // on its side: roll about its own length, then slide it over so the body you see sits on (x, z), side on the
      // ground; one box round the body as it lies (no cabin box: the roof is now a wall)
      const pf = C.pf, sr = Math.sin(roll);
      C.g.rotation.z = roll;
      if (C.g.userData.ao) C.g.remove(C.g.userData.ao);   // (lying on its side it shades the ground differently: its own shadow does it)
      C.g.position.set(x + Math.cos(yaw) * pf.H / 2 * sr, pf.hx * Math.abs(sr) - 0.01, z - Math.sin(yaw) * pf.H / 2 * sr);
      const bo = (pf.z0 + pf.z1) / 2;
      Object.assign(C.box, { x: x + Math.sin(yaw) * bo, z: z + Math.cos(yaw) * bo, hx: pf.H / 2 + 0.05, y1: pf.hx * 2 + 0.02 }); C.box.r = Math.hypot(C.box.hx, C.box.hz);
      for (const L of [W.boxes, CI ? CI.boxes : []]) { const i = L.indexOf(C.cab); if (i >= 0) L.splice(i, 1); }
      // set it down on its side panel exactly (whatever the body), centred where it was put
      { C.g.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(C.g), gy0 = W.groundY ? W.groundY(x, z) : 0;
        if (isFinite(bb.min.y)) { C.g.position.y -= bb.min.y - gy0; C.g.position.x += x - (bb.min.x + bb.max.x) / 2; C.g.position.z += z - (bb.min.z + bb.max.z) / 2; } }
    }
    if (burning) {
      emitter({ x, y: 1.4, z, kind: 'smoke', rate: 5, t: 0 }); emitter({ x: x + 0.2, y: 1.0, z: z + 0.6, kind: 'fire', rate: 9, t: 0, light: true });
      // the scorched road under it (a decal in the outbreak layer — never there on the calm morning)
      const sc = new THREE.Mesh(GEO.litter, scorchMat); sc.position.set(x, 0.03, z); sc.scale.set(7, 1, 7); sc.rotation.y = Math.random() * 6; sc.renderOrder = 1; level.add(sc);
    }
    else if (!roll) (container('car', x - Math.sin(yaw) * (CAR_SIZE[C.type].L / 2 + 0.45), z - Math.cos(yaw) * (CAR_SIZE[C.type].L / 2 + 0.45), 0.9, 'Wrecked car (the trunk)', yaw, null, { car: C, parts: C.parts, stand: { x: x - Math.sin(yaw) * (CAR_SIZE[C.type].L / 2 + 0.8), z: z - Math.cos(yaw) * (CAR_SIZE[C.type].L / 2 + 0.8), yaw } }).items = (C.g.userData.cargo || []).map(cg => { if (C.type === 'sedan') cg.mesh.visible = false; return propItem({ mesh: cg.mesh }, cg.kind); }), C.type === 'sedan' && W.shutCargo.push(W.containers[W.containers.length - 1]));
    else container('car', x + Math.cos(yaw) * 1.3, z - Math.sin(yaw) * 1.3, 0.9, 'Wrecked car', yaw, null, { car: C });
    return C;
  }
  function policeCar(x, z, yaw) {
    const C = car(x, z, yaw, 6, 'sedan', { police: true, paint: MAT.carBlack, white: MAT.carWhite });
    const red = new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff1010, emissiveIntensity: 0, roughness: 0.2 }), blue = new THREE.MeshStandardMaterial({ color: 0x000040, emissive: 0x1030ff, emissiveIntensity: 0, roughness: 0.2 });
    for (const [m, sx] of [[red, -0.33], [blue, 0.33]]) { const o = new THREE.Mesh(new RoundedBoxGeometry(0.58, 0.11, 0.26, 2, 0.04), m); o.position.set(sx, 1.58, -0.1); C.g.add(o); }
    const lbl = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.22), new THREE.MeshStandardMaterial({ map: fitLab(['POLICE'], '#d8d8d4', '#111', 512, 100, 'bold 70px Helvetica'), roughness: 0.4, transparent: true }));
    for (const sx of [-1, 1]) { const l = lbl.clone(); l.position.set(sx * 0.935, 0.92, 0.1); l.rotation.y = sx * Math.PI / 2; C.g.add(l); }
    C.bar = { red, blue };
    W.police = C;
    for (const c of W.containers) if (c.car === C) { c.kind = 'police'; c.label = 'Police cruiser'; }
    return C;
  }
  function ambulance(x, z, yaw) {
    const C = car(x, z, yaw, 0, 'van', { ambulance: true, paint: MAT.carWhite, red: MAT.redPaint, noSearch: true });
    const lbl = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.42), new THREE.MeshStandardMaterial({ map: fitLab(['AMBULANCE'], '#d8d8d4', '#b01810', 512, 128, 'bold 74px Helvetica'), roughness: 0.4 }));
    for (const sx of [-1, 1]) { const l = lbl.clone(); l.position.set(sx * 1.005, 1.75, -0.9); l.rotation.y = sx * Math.PI / 2; C.g.add(l); }
    const rl = new THREE.Mesh(new RoundedBoxGeometry(1.5, 0.12, 0.25, 2, 0.04), new THREE.MeshStandardMaterial({ color: 0x500000, emissive: 0x300000, roughness: 0.2 })); rl.position.set(0, 2.55, 0.9); C.g.add(rl);
    container('ambulance', x - Math.sin(yaw) * 3.1, z - Math.cos(yaw) * 3.1, 1.0, 'Ambulance (back doors)', yaw, null, { parts: C.parts, stand: { x: x - Math.sin(yaw) * 3.55, z: z - Math.cos(yaw) * 3.55, yaw } });
  }
  // a sawhorse barricade: two striped boards on two A-frame legs (a car at speed smashes through)
  function barricade(x, z, yaw) {
    const K = bkit(), c = Math.cos(yaw), s = Math.sin(yaw), nx = s, nz = c;
    breakable('barricade', x, z, yaw, { mat: 'wood', hp: 4, carMin: 3, carK: 0.1, dent: 0.3, h: 1.05, cy: 0.75, deb: [['splinter', 16], ['picket', 6]], spread: 1.0 }, () => {
      for (const y of [0.95, 0.55]) inst(K.barBoard, MAT.stripes, mat4(x, y, z, yaw));
      for (const o of [-1.0, 1.0]) for (const d of [-0.22, 0.22]) { const px = x + c * o + s * d, pz = z - s * o + c * d; inst(GEO.post, MAT.white, mat4(px, 0, pz, 0, 0.6, 1.08, 0.6, d > 0 ? -0.2 : 0.2)); }
      solid(x, z, 1.2, 0.3, yaw, 1.0, 'wood', 0, { vault: true });
    }, () => {
      // one A-frame still standing, the other down; the boards snapped, lying where they were pushed
      for (const d of [-0.22, 0.22]) inst(GEO.post, MAT.white, mat4(x - c * 1.0 + s * d, 0, z + s * 1.0 + c * d, 0, 0.6, 1.08, 0.6, d > 0 ? -0.2 : 0.2), false);
      BRK.side = true;
      for (const d of [0.25, 0.5]) inst(GEO.post, MAT.white, mat4(x + c * 0.9 + nx * d, 0.05, z - s * 0.9 + nz * d, yaw + 0.4, 0.6, 1.08, 0.6, Math.PI / 2 * 0.95, 0), false);
      for (let k = 0; k < 4; k++) { const t = (k < 2 ? -0.6 : 0.6) + (Math.random() - 0.5) * 0.3, d = 0.4 + Math.random() * 1.2; inst(K.barBoard, MAT.stripes, mat4(x + c * t + nx * d, 0.03 + k * 0.05, z - s * t + nz * d, yaw + (Math.random() - 0.5) * 0.7, 0.48, 1, 1, Math.PI / 2 * 0.96, 0), false); }
      BRK.side = false;
    });
    if (Math.random() < 0.7) cone(x + c * 1.7 + s * 0.6, z - s * 1.7 + c * 0.6, Math.random() < 0.3);
  }

  // ---------------- streets ----------------
  // driveways (and forecourt entrances) cut the curb down to a ramp where they cross the sidewalk
  W.curbCuts = [];
  function curbCut(x, z, half) {
    if (Math.abs(z) < 9 && Math.abs(x) > 7) W.curbCuts.push({ main: true, sd: Math.sign(z), a0: x - half, a1: x + half });
    else if (Math.abs(x) < 9 && Math.abs(z) > 7) W.curbCuts.push({ main: false, sd: Math.sign(x), a0: z - half, a1: z + half });
  }
  const cutAt = (main, sd, a) => { for (const c of W.curbCuts) if (c.main === main && c.sd === sd && a > c.a0 && a < c.a1) return c; return null; };
  // Main St (along x at z = 0) or Maple Ave (along z at x = 0): an 8 m road with a concrete gutter pan each side,
  // a 11 cm curb, 2 m sidewalks that stop at the crossing (the corners get their own squares)
  function street(main) {
    const yaw = main ? 0 : Math.PI / 2, at = (a, c) => main ? [a, c] : [c, a];
    const E2 = 112, J = 4.0;
    const run = (a0, a1, c, hc, y1, faces) => { const [cx, cz] = at((a0 + a1) / 2, c); B.box(cx, 0, cz, (a1 - a0) / 2, y1, hc, yaw, faces, TILE); };
    // Maple Ave stops at the edge of Main St, so the two road surfaces never overlap (no flicker in the crossing)
    if (main) run(-E2, E2, 0, 4, 0.015, f => f === 'top' ? 'road' : null);
    else { run(-E2, -J, 0, 4, 0.015, f => f === 'top' ? 'road' : null); run(J, E2, 0, 4, 0.015, f => f === 'top' ? 'road' : null); }
    paved.push(main ? [-E2, -6.2, E2, 6.2] : [-6.2, -E2, 6.2, E2]);
    for (const sd of [-1, 1]) {
      const road = sd > 0 ? 'nz' : 'pz', lawn = sd > 0 ? 'pz' : 'nz';
      for (const [a0, a1] of [[-E2, -4.05], [4.05, E2]]) run(a0, a1, sd * 3.85, 0.2, 0.018, f => f === 'top' ? 'drive' : null);   // gutter pan
      for (const [s0, s1] of [[-E2, -6.05], [6.05, E2]]) {
        // split the run at every curb cut on this side
        const cuts = W.curbCuts.filter(c => c.main === main && c.sd === sd && c.a1 > s0 && c.a0 < s1).sort((p, q) => p.a0 - q.a0);
        let a = s0;
        const walk = (a0, a1) => { if (a1 - a0 > 0.01) run(a0, a1, sd * 5.05, 1.0, 0.11, f => f === 'top' ? 'walk' : f === 'bot' ? null : 'curb'); };
        for (const c of cuts) {
          const c0 = Math.max(s0, c.a0), c1 = Math.min(s1, c.a1);
          walk(a, c0);
          // the cut: the back of the walk stays level, the front ramps down to the gutter
          run(c0, c1, sd * 5.525, 0.525, 0.11, f => f === 'top' ? 'walk' : f === lawn ? 'curb' : null);
          const P0 = at(c0, sd * 4.05), P1 = at(c1, sd * 4.05), P2 = at(c1, sd * 5.0), P3 = at(c0, sd * 5.0), cm = at((c0 + c1) / 2, sd * 4.5);
          B.quad('drive', [P0[0], 0.018, P0[1]], [P1[0], 0.018, P1[1]], [P2[0], 0.11, P2[1]], [P3[0], 0.11, P3[1]], [0, 1, 0], [P0, P1, P2, P3].map(p => [p[0] / 3, p[1] / 3]), cm[0], cm[1]);
          a = c1;
        }
        walk(a, s1);
      }
    }
  }
  function roadLines(x0, z0, x1, z1, skip) {
    const horiz = Math.abs(z1 - z0) < 1, L = horiz ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
    const n = Math.floor(L / 6);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, x = lerp(x0, x1, t), z = lerp(z0, z1, t);
      if (skip && skip(x, z)) continue;
      B.box(x, 0, z, horiz ? 1.5 : 0.07, 0.022, horiz ? 0.07 : 1.5, 0, f => f === 'top' ? 'roadLine' : null, TILE);
    }
  }
  // ---- the things every real street has: stop signs and name blades, manholes, storm drains, power lines ----
  const canvasTex = (w, h, fn) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; fn(cv.getContext('2d'), w, h); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  function streetFurniture() {
    const X = (geo, mat, x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0, sh = true) => xadd(geo, mat, mat4(x, y, z, ry, sx, sy, sz, rx, rz), sh);
    const stopM = std({ map: canvasTex(256, 256, (g) => {
      const oct = (r2, col) => { g.fillStyle = col; g.beginPath(); for (let k = 0; k < 8; k++) { const a = Math.PI / 8 + k * Math.PI / 4; g.lineTo(128 + Math.cos(a) * r2, 128 + Math.sin(a) * r2); } g.fill(); };
      oct(128, '#f2f0ea'); oct(116, '#b81c1c'); g.fillStyle = '#f6f4ee'; g.font = 'bold 78px Helvetica'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('STOP', 128, 132);
    }), roughness: 0.5 });
    const octG = new THREE.CircleGeometry(0.38, 8, Math.PI / 8);
    const blade = n => std({ map: fitLab([n], '#1d5e2e', '#f4f4ee', 512, 96, 'bold 60px Helvetica'), roughness: 0.5 });
    const mainB = blade('MAIN ST'), mapleB = blade('MAPLE AVE');
    for (const [x, z, ry] of [[5.5, 5.5, 0], [-5.5, 5.5, -Math.PI / 2], [-5.5, -5.5, Math.PI], [5.5, -5.5, Math.PI / 2]]) {
      const tall = x > 0 && z > 0 ? 2.95 : 2.5;
      X(GEO.ubox, MAT.metal, x, tall / 2, z, ry, 0.06, tall, 0.06);
      const fx = Math.sin(ry) * 0.04, fz = Math.cos(ry) * 0.04;
      X(octG, stopM, x + fx, 2.1, z + fz, ry, 1, 1, 1, 0, 0, false); X(octG, MAT.metal, x + fx * 0.6, 2.1, z + fz * 0.6, ry + Math.PI, 1, 1, 1, 0, 0);
      solid(x, z, 0.08, 0.08, 0, tall, 'metal');
      if (tall > 2.6) for (const [m, y, by] of [[mainB, 2.68, 0], [mapleB, 2.86, Math.PI / 2]]) for (const f of [0, Math.PI]) X(GEO.uplane, m, x + Math.sin(by + f) * 0.012, y, z + Math.cos(by + f) * 0.012, by + f, 0.95, 0.16, 1, 0, 0, false);
    }
    // manhole covers in the lanes, curb-inlet storm drains every ~30 m
    const mhM = std({ map: canvasTex(128, 128, (g) => { g.fillStyle = '#2a2826'; g.beginPath(); g.arc(64, 64, 63, 0, 7); g.fill(); g.strokeStyle = '#4a4642'; g.lineWidth = 3; for (const r2 of [58, 40, 22]) { g.beginPath(); g.arc(64, 64, r2, 0, 7); g.stroke(); } for (let k = 0; k < 12; k++) { const a = k / 12 * 6.283; g.beginPath(); g.moveTo(64 + Math.cos(a) * 22, 64 + Math.sin(a) * 22); g.lineTo(64 + Math.cos(a) * 58, 64 + Math.sin(a) * 58); g.stroke(); } g.fillStyle = '#5a5650'; g.font = 'bold 14px Helvetica'; g.textAlign = 'center'; g.fillText('SEWER', 64, 69); }), alphaTest: 0.5, roughness: 0.6, metalness: 0.5, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
    const mhG = new THREE.CircleGeometry(0.34, 24).rotateX(-Math.PI / 2);
    for (const a of [-92, -52, 34, 76]) { X(mhG, mhM, a, 0.022, a > 0 ? 1.9 : -1.9, 0, 1, 1, 1, 0, 0, false); X(mhG, mhM, a > 0 ? -1.9 : 1.9, 0.022, a + 6, 0, 1, 1, 1, 0, 0, false); }
    const grM = std({ map: canvasTex(64, 32, (g) => { g.fillStyle = '#0a0a0a'; g.fillRect(0, 0, 64, 32); g.fillStyle = '#3a3836'; g.fillRect(0, 0, 64, 3); g.fillRect(0, 29, 64, 3); for (let x = 0; x < 64; x += 6) g.fillRect(x, 0, 2, 32); }), roughness: 0.6, metalness: 0.6, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
    for (const main of [true, false]) for (const sd of [-1, 1]) for (const a of [-86, -56, -28, 28, 56, 86]) {
      if (cutAt(main, sd, a) || cutAt(main, sd, a + 0.6) || cutAt(main, sd, a - 0.6)) continue;
      const ry = main ? 0 : Math.PI / 2, [gx, gz] = main ? [a, sd * 3.84] : [sd * 3.84, a], [sx2, sz2] = main ? [a, sd * 4.055] : [sd * 4.055, a];
      X(GEO.uplane, grM, gx, 0.026, gz, ry, 0.9, 0.34, 1, -Math.PI / 2, 0, false);
      X(GEO.ubox, MAT.black, sx2, 0.055, sz2, ry, 0.9, 0.07, 0.012, 0, 0, false);   // the inlet slot in the curb face
    }
    // wooden utility poles behind the back fences, crossarms and insulators, sagging wires, a transformer now and then
    const poleM = std({ map: TX.barkTexture('oak'), color: 0x544636, roughness: 0.95 });
    const poleG = new THREE.CylinderGeometry(0.12, 0.16, 9.2, 10).translate(0, 4.6, 0);
    const lines = [];
    for (const sd of [-1, 1]) { lines.push([[35, sd * 31.5], [65, sd * 31.5], [95, sd * 31.5]], [[-35, sd * 31.5], [-65, sd * 31.5], [-95, sd * 31.5]], [[sd * 31.5, 35], [sd * 31.5, 65], [sd * 31.5, 95]], [[sd * 31.5, -35], [sd * 31.5, -65], [sd * 31.5, -95]]); }
    let pn = 0; const brnd = TX.rng(515);
    for (const L of lines) {
      const ux = Math.sign(L[1][0] - L[0][0]), uz = Math.sign(L[1][1] - L[0][1]), ry = Math.atan2(ux, uz);   // along the line
      const px2 = Math.cos(ry), pz2 = -Math.sin(ry);   // across it (the crossarm)
      L.forEach(([x, z], i) => {
        X(poleG, poleM, x, 0, z, 0);
        X(GEO.ubox, poleM, x, 8.55, z, ry + Math.PI / 2, 1.9, 0.1, 0.1);
        for (const o of [-0.8, 0, 0.8]) X(GEO.ucyl, MAT.porcelain, x + px2 * o, 8.68, z + pz2 * o, 0, 0.06, 0.16, 0.06, 0, 0, false);
        if (pn++ % 3 === 1) { X(GEO.ucyl, MAT.metal, x - px2 * 0.35, 7.3, z - pz2 * 0.35, 0, 0.55, 0.9, 0.55); X(GEO.ucyl, MAT.darkMetal, x - px2 * 0.35, 7.8, z - pz2 * 0.35, 0, 0.58, 0.06, 0.58); }
        solid(x, z, 0.16, 0.16, 0, 9.2, 'wood');
        if (i === 0 || i === L.length - 1) {   // a dead-end pole: a guy wire down to an anchor in the ground, pulling against the run
          const gx = i === 0 ? -ux : ux, gz = i === 0 ? -uz : uz;
          xadd(new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(x, 8.4, z), new THREE.Vector3(x + gx * 3, 0.15, z + gz * 3)), 1, 0.008, 4), MAT.black, new THREE.Matrix4(), false);
          X(GEO.ucyl, MAT.metal, x + gx * 3, 0.1, z + gz * 3, 0, 0.03, 0.3, 0.03, 0, 0, false);
        }
        if (i + 1 < L.length) for (const o of [-0.8, 0, 0.8]) {
          const [x2, z2] = L[i + 1], a = new THREE.Vector3(x + px2 * o, 8.74, z + pz2 * o), b = new THREE.Vector3(x2 + px2 * o, 8.74, z2 + pz2 * o);
          const mid = a.clone().lerp(b, 0.5); mid.y -= 1.2;   // a quadratic curve: dips about 0.6 m in the middle
          xadd(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 24, 0.011, 4, false), MAT.black, new THREE.Matrix4(), false);
          if (o === 0.8 || o === -0.8) birdsOnWire(a, mid, b, brnd);
        }
      });
    }
  }
  W.blood = null;   // set below once decals exist

  // ---- blood pools and splats (decals on the floor) ----
  const bloodMats = [1, 2, 3].map(i => new THREE.MeshStandardMaterial({ map: TX.bloodTexture(i), color: 0x8a6a6a, transparent: true, opacity: 0.92, depthWrite: false, roughness: 0.3, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  const decalGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const decals = []; let decalI = 0;
  for (let i = 0; i < 90; i++) { const m = new THREE.Mesh(decalGeo, bloodMats[i % 3]); m.visible = false; m.receiveShadow = true; m.renderOrder = 1; scene.add(m); decals.push(m); }
  W.blood = (x, z, s = 1, y = 0.03) => { if (CI) { const m = new THREE.Mesh(decalGeo, bloodMats[Math.floor(Math.random() * 3)]); m.position.set(x, y + Math.random() * 0.006, z); m.scale.set(s * 2, 1, s * 2); m.rotation.y = Math.random() * 6.28; m.receiveShadow = true; m.renderOrder = 1; level.add(m); return m; }
    const m = decals[decalI++ % decals.length]; m.position.set(x, y + (decalI % 9) * 0.0008, z); m.scale.set(s * 2, 1, s * 2); m.rotation.y = Math.random() * 6.28; m.visible = true; return m; };

  // the yard things (made once)
  const YKIT = {};
  function yardKit() {
    if (YKIT.ready) return YKIT; YKIT.ready = true;
    const strip = g => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g; };
    YKIT.kettle = new THREE.SphereGeometry(0.29, 18, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).translate(0, 0.86, 0);
    YKIT.kettleLid = mergeGeometries([new THREE.SphereGeometry(0.29, 18, 7, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.85, 1), new THREE.CylinderGeometry(0.035, 0.035, 0.05, 8).translate(0, 0.27, 0)].map(strip));
    YKIT.rim = new THREE.TorusGeometry(0.23, 0.012, 6, 20).rotateX(Math.PI / 2);
    YKIT.net = new THREE.CylinderGeometry(0.23, 0.15, 0.4, 12, 1, true).translate(0, -0.2, 0);
    YKIT.netMat = new THREE.MeshStandardMaterial({ map: TX.chainLinkTexture(), alphaTest: 0.4, side: THREE.DoubleSide, color: 0xf4f4f0, roughness: 0.9 });
    YKIT.board = std({ map: ctex(128, 96, g => { g.fillStyle = '#f4f4f0'; g.fillRect(0, 0, 128, 96); g.strokeStyle = '#c0392b'; g.lineWidth = 5; g.strokeRect(4, 4, 120, 88); g.strokeRect(44, 44, 40, 32); for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(90,80,60,${Math.random() * 0.12})`; g.fillRect(Math.random() * 128, Math.random() * 96, 2, 6); } }), roughness: 0.5 });
    YKIT.ball = new THREE.SphereGeometry(0.12, 14, 10);
    YKIT.ballMat = std({ color: 0xc8581c, roughness: 0.8 });
    YKIT.toyBall = new THREE.SphereGeometry(0.11, 14, 10);
    YKIT.toyM = [std({ color: 0xc8241c, roughness: 0.45 }), std({ color: 0x1f5fb8, roughness: 0.45 }), std({ color: 0xe8c020, roughness: 0.45 })];
    // a plastic tricycle: a big front wheel, two small back ones, a seat and the bars
    YKIT.trike = mergeGeometries([
      new THREE.TorusGeometry(0.17, 0.035, 6, 16).rotateY(Math.PI / 2).translate(0, 0.17, 0.32),
      new THREE.TorusGeometry(0.1, 0.03, 6, 12).rotateY(Math.PI / 2).translate(-0.2, 0.1, -0.22), new THREE.TorusGeometry(0.1, 0.03, 6, 12).rotateY(Math.PI / 2).translate(0.2, 0.1, -0.22),
      new THREE.CylinderGeometry(0.022, 0.022, 0.42, 6).rotateZ(Math.PI / 2).translate(0, 0.1, -0.22),
      new THREE.CylinderGeometry(0.03, 0.03, 0.6, 6).rotateX(Math.PI / 2 - 0.35).translate(0, 0.28, 0.04),
      new THREE.BoxGeometry(0.2, 0.06, 0.2).translate(0, 0.36, -0.12),
      new THREE.CylinderGeometry(0.018, 0.018, 0.36, 6).rotateZ(Math.PI / 2).translate(0, 0.52, 0.3),
      new THREE.CylinderGeometry(0.022, 0.022, 0.36, 6).translate(0, 0.35, 0.32),
    ].map(strip));
    // things on the line: towels and shirts in faded colours
    YKIT.cloth = [[208, 196, 170], [120, 140, 170], [170, 90, 80], [230, 230, 226], [96, 120, 90]].map((c, i) => std({ map: TX.fabricTexture(c, 90 + i), side: THREE.DoubleSide, roughness: 1 }));
    return YKIT;
  }
  // ================================================================ more of a real street (detail pass)
  // road wear, a bus stop, crosswalk signals, parking meters, birds on the wires, the skyline past the woods.
  // Everything here is merged into the static meshes (xadd/B.box) or instanced; collision only where you'd bump.
  const DK = {};
  function detailKit() {
    if (DK.ready) return DK; DK.ready = true;
    // one atlas for the road wear: [patch, cracks, oil, skid] in 2×2
    DK.wearMat = std({ map: ctex(512, 512, (g) => {
      const rnd = TX.rng(77);
      // 0: an asphalt patch — a darker, smoother rectangle, its sealed seam a slightly glossy black outline
      { g.save(); g.translate(0, 0); g.beginPath(); const pts = [[22, 30], [232, 20], [238, 226], [18, 236]]; pts.forEach(([x, y], i) => i ? g.lineTo(x + (rnd() - 0.5) * 6, y + (rnd() - 0.5) * 6) : g.moveTo(x, y)); g.closePath();
        g.fillStyle = 'rgba(26,26,28,0.3)'; g.fill(); for (let k = 0; k < 900; k++) { g.fillStyle = `rgba(${70 + rnd() * 60 | 0},${70 + rnd() * 60 | 0},${70 + rnd() * 60 | 0},0.2)`; g.fillRect(22 + rnd() * 212, 24 + rnd() * 210, 1.5, 1.5); }
        g.strokeStyle = 'rgba(8,8,8,0.5)'; g.lineWidth = 6; g.stroke(); g.restore(); }
      // 1: crack sealant: black branching squiggles
      { g.save(); g.translate(256, 0); g.strokeStyle = 'rgba(10,10,10,0.9)'; g.lineCap = 'round';
        const crack = (x, y, a, len, w) => { g.lineWidth = w; g.beginPath(); g.moveTo(x, y); for (let i = 0; i < len; i++) { a += (rnd() - 0.5) * 0.7; x += Math.cos(a) * 6; y += Math.sin(a) * 6; g.lineTo(x, y); if (rnd() < 0.07 && w > 2) { g.stroke(); crack(x, y, a + (rnd() < 0.5 ? 1 : -1) * (0.6 + rnd() * 0.6), len * 0.4 | 0, w * 0.6); g.beginPath(); g.moveTo(x, y); } } g.stroke(); };
        crack(10, 120, 0.1, 40, 4.5); crack(128, 10, 1.5, 36, 3.5); g.restore(); }
      // 2: an oil stain: a dark soak, darker heart, a faint rainbow rim
      { g.save(); g.translate(128, 384); for (let k = 0; k < 14; k++) { const r2 = 30 + rnd() * 80, x = (rnd() - 0.5) * 60, y = (rnd() - 0.5) * 50; const gr = g.createRadialGradient(x, y, 0, x, y, r2); gr.addColorStop(0, 'rgba(6,5,4,0.32)'); gr.addColorStop(0.7, 'rgba(10,8,6,0.15)'); gr.addColorStop(1, 'rgba(10,8,6,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r2, r2 * (0.6 + rnd() * 0.4), rnd() * 3, 0, 7); g.fill(); }
        g.strokeStyle = 'rgba(90,70,120,0.12)'; g.lineWidth = 3; g.beginPath(); g.ellipse(0, 0, 92, 70, 0.3, 0, 7); g.stroke(); g.restore(); }
      // 3: skid marks: two long rubber streaks, wavering
      { g.save(); g.translate(256, 256); for (const x0 of [70, 180]) { for (let y = 0; y < 256; y += 2) { const w2 = 22 + Math.sin(y * 0.05 + x0) * 4, a = 0.32 * Math.sin(Math.PI * y / 256) + 0.06; g.fillStyle = `rgba(12,12,12,${a})`; g.fillRect(x0 - w2 / 2 + Math.sin(y * 0.02) * 6, y, w2, 2); } } g.restore(); }
    }), transparent: true, depthWrite: false, roughness: 0.82, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    DK.wearGeo = [0, 1, 2, 3].map(q => { const g = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), uv = g.attributes.uv, u0 = (q % 2) * 0.5, v0 = q < 2 ? 0.5 : 0; for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * 0.5, v0 + uv.getY(i) * 0.5); return g; });
    // the "walk / don't walk" signal faces: an orange hand and a white walking man (lit, animated)
    const face = (draw) => ctex(64, 64, (g) => { g.fillStyle = '#060606'; g.fillRect(0, 0, 64, 64); draw(g); });
    DK.handMat = std({ map: face(g => { g.fillStyle = '#ff8a1c'; g.beginPath(); g.roundRect(20, 22, 24, 26, 6); g.fill(); for (let k = 0; k < 4; k++) g.fillRect(21 + k * 6, 8 + Math.abs(k - 1.5) * 2, 4.5, 18); g.fillRect(12, 30, 10, 5); }), emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.3 });
    DK.handMat.emissiveMap = DK.handMat.map;
    DK.walkMat = std({ map: face(g => { g.fillStyle = '#f2f4f8'; g.beginPath(); g.arc(32, 12, 6, 0, 7); g.fill(); g.lineWidth = 6; g.strokeStyle = '#f2f4f8'; g.lineCap = 'round'; g.beginPath(); g.moveTo(32, 20); g.lineTo(31, 38); g.lineTo(22, 56); g.moveTo(31, 38); g.lineTo(42, 56); g.moveTo(31, 24); g.lineTo(20, 34); g.moveTo(31, 24); g.lineTo(42, 32); g.stroke(); }), emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.3 });
    DK.walkMat.emissiveMap = DK.walkMat.map;
    DK.sigBox = new RoundedBoxGeometry(0.34, 0.62, 0.22, 2, 0.03);
    DK.meterHead = (() => { const a = new RoundedBoxGeometry(0.2, 0.3, 0.16, 2, 0.03).translate(0, 0.15, 0).toNonIndexed(), b = new THREE.SphereGeometry(0.1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.7, 0.8).translate(0, 0.3, 0).toNonIndexed(); for (const g of [a, b]) for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k); return mergeGeometries([a, b]); })();
    DK.meterGlass = std({ color: 0x9aa8a8, roughness: 0.1, metalness: 0.3 });
    // a small bird sitting on a wire: body, head, tail (merged into the black wires' mesh: no extra draw calls)
    DK.bird = (() => { const parts = [new THREE.SphereGeometry(0.055, 8, 6).scale(1, 0.85, 1.6).translate(0, 0.05, 0), new THREE.SphereGeometry(0.034, 8, 6).translate(0, 0.1, 0.07), new THREE.ConeGeometry(0.03, 0.1, 4).rotateX(-Math.PI / 2 - 0.5).translate(0, 0.04, -0.11), new THREE.ConeGeometry(0.008, 0.03, 4).rotateX(Math.PI / 2).translate(0, 0.1, 0.11)].map(g => { g = g.toNonIndexed(); for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k); return g; }); return mergeGeometries(parts); })();
    DK.shelterGlass = new THREE.MeshStandardMaterial({ color: 0xb8c8cc, roughness: 0.08, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.4 });
    DK.adMat = std({ map: ctex(256, 384, (g) => { const gr = g.createLinearGradient(0, 0, 0, 384); gr.addColorStop(0, '#1d3c66'); gr.addColorStop(1, '#0c1a30'); g.fillStyle = gr; g.fillRect(0, 0, 256, 384); g.fillStyle = '#f4d23a'; g.font = 'bold 40px Helvetica'; g.textAlign = 'center'; g.fillText('MAPLE', 128, 70); g.fillText('COUNTY', 128, 112); g.fillStyle = '#ffffff'; g.font = 'bold 28px Helvetica'; g.fillText('FALL FAIR', 128, 160); g.font = '22px Helvetica'; g.fillText('Nov 15 – 16', 128, 196); g.fillStyle = '#c0392b'; g.beginPath(); g.arc(128, 286, 62, 0, 7); g.fill(); g.fillStyle = '#ffffff'; g.font = 'bold 26px Helvetica'; g.fillText('RIDES', 128, 280); g.fillText('& PIE', 128, 308); }), emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.4 });
    DK.adMat.emissiveMap = DK.adMat.map;
    DK.busSign = std({ map: fitLab(['BUS', 'STOP', 'Route 9'], '#1d5e9e', '#ffffff', 256, 256, 'bold 64px Helvetica'), roughness: 0.5, side: THREE.DoubleSide });
    return DK;
  }
  // is there room here (no box, no tree, no curb cut)? r: clearance in metres
  function clearAt(x, z, hx, hz, r = 0.4) {
    // (an axis-aligned rect hx × hz round x, z, sampled every ~0.5 m against each box grown by r)
    const nx = Math.max(1, Math.ceil(hx / 0.5)), nz = Math.max(1, Math.ceil(hz / 0.5));
    for (const b of W.boxes) {
      if (Math.abs(b.x - x) > hx + b.r + r || Math.abs(b.z - z) > hz + b.r + r) continue;
      for (let i = -nx; i <= nx; i++) for (let j = -nz; j <= nz; j++) {
        const dx = x + hx * i / nx - b.x, dz = z + hz * j / nz - b.z, lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
        if (Math.abs(lx) < b.hx + r && Math.abs(lz) < b.hz + r) return false;
      }
    }
    for (const [tx, tz] of W.treeSpots) if (Math.abs(tx - x) < hx + 1 && Math.abs(tz - z) < hz + 1) return false;
    return true;
  }
  function streetDetail() {
    const D = detailKit(), rnd = TX.rng(4242);
    const X = (geo, mat, x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0, sh = true) => xadd(geo, mat, mat4(x, y, z, ry, sx, sy, sz, rx, rz), sh);
    // ---- road wear: patches, crack sealant, oil where cars stand at the kerb, a few skid marks ----
    const onRoad = (lane) => { const main = rnd() < 0.5, a = (rnd() < 0.5 ? -1 : 1) * (10 + rnd() * 98), c = lane(); return main ? [a, c, 0] : [c, a, Math.PI / 2]; };
    for (let i = 0; i < 22; i++) { const [x, z, ry] = onRoad(() => (rnd() - 0.5) * 6); X(D.wearGeo[0], D.wearMat, x, 0.0165, z, ry + (rnd() - 0.5) * 0.1, 1 + rnd() * 2.2, 1, 0.8 + rnd() * 1.6, 0, 0, false); }
    for (let i = 0; i < 46; i++) { const [x, z, ry] = onRoad(() => (rnd() - 0.5) * 7.2); const s = 1.6 + rnd() * 2.5; X(D.wearGeo[1], D.wearMat, x, 0.017, z, rnd() * 6.28, s, 1, s, 0, 0, false); }
    for (let i = 0; i < 34; i++) { const [x, z, ry] = onRoad(() => (rnd() < 0.5 ? -1 : 1) * (2.55 + rnd() * 0.35)); /* oil only where cars park, by the kerb */ const s = 0.7 + rnd() * 1.1; X(D.wearGeo[2], D.wearMat, x, 0.0175, z, rnd() * 6.28, s, 1, s * (0.8 + rnd() * 0.4), 0, 0, false); }
    for (let i = 0; i < 7; i++) { const [x, z, ry] = onRoad(() => (rnd() - 0.5) * 4); X(D.wearGeo[3], D.wearMat, x, 0.018, z, ry + Math.PI / 2 + (rnd() - 0.5) * 0.5, 1.9, 1, 5 + rnd() * 6, 0, 0, false); }
    // ---- crosswalk signals at the four corners: a pole, two heads (one per crosswalk), a push button ----
    const heads = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * 4.55, z = sz * 4.55;
      if (!clearAt(x, z, 0.1, 0.1, 0.05)) continue;
      X(GEO.ucyl, MAT.darkMetal, x, 1.55, z, 0, 0.1, 3.1, 0.1); X(GEO.ucyl, MAT.darkMetal, x, 0.06, z, 0, 0.22, 0.12, 0.22);
      solid(x, z, 0.07, 0.07, 0, 3.1, 'metal');
      // one head looks across Main St (faces ±z), one across Maple Ave (faces ±x)
      for (const [ry, ox, oz] of [[sz > 0 ? 0 : Math.PI, 0, 0.17 * sz], [sx > 0 ? Math.PI / 2 : -Math.PI / 2, 0.17 * sx, 0]]) {
        const hx2 = x + ox, hz2 = z + oz, fy = ry === 0 || ry === Math.PI ? 0 : 1;
        X(D.sigBox, MAT.yellowPaint, hx2, 2.55, hz2, ry);
        const fx = Math.sin(ry) * 0.112, fz = Math.cos(ry) * 0.112;
        X(GEO.uplane, D.handMat, hx2 + fx, 2.7, hz2 + fz, ry, 0.24, 0.24, 1, 0, 0, false);
        X(GEO.uplane, D.walkMat, hx2 + fx, 2.4, hz2 + fz, ry, 0.24, 0.24, 1, 0, 0, false);
        for (const yy of [2.83, 2.53]) X(GEO.ubox, MAT.black, hx2 + fx * 1.25, yy, hz2 + fz * 1.25, ry, 0.27, 0.025, 0.06, 0, 0, false);   // visors
        void fy;
      }
      X(GEO.ubox, MAT.yellowPaint, x - sx * 0.08, 1.1, z - sz * 0.08, Math.atan2(-sx, -sz), 0.12, 0.18, 0.06);   // the push-button box
      X(GEO.ucyl, MAT.chrome, x - sx * 0.1, 1.08, z - sz * 0.1, 0, 0.05, 0.02, 0.05, Math.PI / 2, 0, false);
      heads.push([x, z]);
    }
    // they still cycle: walk for 12 s, flash the hand for 6, a steady hand for 26 (the power is still on)
    if (heads.length) W.anims.push((dt, t) => { const c = t % 44, walk = c < 12, flash = c >= 12 && c < 18; const dim = 1.6; D.walkMat.emissiveIntensity = walk ? dim : 0.03; D.handMat.emissiveIntensity = walk ? 0.03 : flash ? (Math.floor(t * 2) % 2 ? dim : 0.03) : dim; });
    // ---- a bus stop: a glass shelter with a bench and an ad panel, the stop sign at the curb ----
    {
      let spot = null;
      for (const sd of [-1, 1]) for (let a = -100; a <= 100 && !spot; a += 2) {
        if (Math.abs(a) < 16) continue;
        for (const main of [true, false]) { if (spot) break;
          const [x, z] = main ? [a, sd * 5.35] : [sd * 5.35, a];
          if (cutAt(main, sd, a) || cutAt(main, sd, a - 2) || cutAt(main, sd, a + 2)) continue;
          if (!clearAt(x, z, main ? 1.9 : 0.9, main ? 0.9 : 1.9, 0.5)) continue;
          spot = { x, z, main, sd, a };
        }
      }
      if (spot) {
        const { x, z, main, sd } = spot, yaw = main ? (sd > 0 ? Math.PI : 0) : (sd > 0 ? -Math.PI / 2 : Math.PI / 2);   // the open side faces the road
        const c = Math.cos(yaw), sn = Math.sin(yaw), P = (lx, lz) => [x + lx * c + lz * sn, z - lx * sn + lz * c], y0 = 0.11;
        const Lp = (geo, mat, lx, y, lz, ry = 0, sx = 1, sy = 1, sz = 1, sh = true) => { const [px, pz] = P(lx, lz); X(geo, mat, px, y, pz, yaw + ry, sx, sy, sz, 0, 0, sh); };
        // frame posts, roof, back glass, side glass with the ad panel
        for (const lx of [-1.6, 1.6]) for (const lz of [-0.55, 0.55]) Lp(GEO.ubox, MAT.alu, lx, y0 + 1.15, lz, 0, 0.07, 2.3, 0.07);
        Lp(GEO.ubox, MAT.alu, 0, y0 + 2.34, 0.05, 0, 3.5, 0.08, 1.45); Lp(GEO.ubox, MAT.darkMetal, 0, y0 + 2.38, 0.05, 0, 3.4, 0.04, 1.35);
        Lp(GEO.ubox, D.shelterGlass, 0, y0 + 1.25, -0.55, 0, 3.15, 1.9, 0.02, false);
        Lp(GEO.ubox, MAT.alu, 0, y0 + 0.28, -0.55, 0, 3.2, 0.05, 0.05); Lp(GEO.ubox, MAT.alu, 0, y0 + 2.2, -0.55, 0, 3.2, 0.05, 0.05);
        Lp(GEO.ubox, MAT.alu, -1.6, y0 + 1.2, 0, 0, 0.08, 1.9, 1.05); Lp(GEO.uplane, D.adMat, -1.55, y0 + 1.2, 0, Math.PI / 2, 0.95, 1.4, 1, false);
        Lp(GEO.uplane, D.adMat, -1.65, y0 + 1.2, 0, -Math.PI / 2, 0.95, 1.4, 1, false);
        Lp(GEO.ubox, D.shelterGlass, 1.6, y0 + 1.25, 0, 0, 0.02, 1.9, 1.0, false);
        // the bench: slats on two legs
        for (const lz of [-0.35, -0.2]) Lp(GEO.ubox, MAT.darkWood, 0.3, y0 + 0.46, lz, 0, 1.9, 0.04, 0.12);
        for (const lx of [-0.55, 1.15]) Lp(GEO.ubox, MAT.darkMetal, lx, y0 + 0.23, -0.28, 0, 0.05, 0.46, 0.35);
        Lp(GEO.ubox, MAT.darkWood, 0.3, y0 + 0.72, -0.48, 0, 1.9, 0.12, 0.03);
        // collision: the back and both side panels; the bench is low (you hop it)
        { const [bx, bz] = P(0, -0.55); solid(bx, bz, 1.62, 0.04, yaw, y0 + 2.3, 'glass', 0, { window: true }); }
        { const [bx, bz] = P(-1.6, 0); solid(bx, bz, 0.06, 0.55, yaw, y0 + 2.3, 'metal'); }
        { const [bx, bz] = P(1.6, 0); solid(bx, bz, 0.04, 0.5, yaw, y0 + 2.3, 'glass', 0, { window: true }); }
        { const [bx, bz] = P(0.3, -0.3); solid(bx, bz, 0.95, 0.17, yaw, y0 + 0.48, 'wood', 0, { vault: true }); }
        { const [rx, rz] = P(2.3, 0.75); X(GEO.ucyl, MAT.metal, rx, 1.4, rz, 0, 0.06, 2.8, 0.06); X(GEO.uplane, D.busSign, rx, 2.5, rz, yaw + Math.PI / 2, 0.45, 0.45, 1, 0, 0, false); solid(rx, rz, 0.05, 0.05, 0, 2.8, 'metal'); }
        paint(...P(0, -0.2), 1.6, 'dirt', 0.25);
        W.anims.push(() => { D.adMat.emissiveIntensity = W.daylight < 0.45 ? 0.55 : 0; });   // the ad is backlit at night
        W.busStop = { x, z, yaw };
      }
    }
    // ---- parking meters along the Quick Stop's frontage ----
    for (const xm of [11, 16.5, 23.5, 29]) {
      const zm = -4.42;
      if (cutAt(true, -1, xm) || !clearAt(xm, zm, 0.1, 0.1, 0.25)) continue;
      X(GEO.ucyl, MAT.darkMetal, xm, 0.11 + 0.55, zm, 0, 0.06, 1.1, 0.06);
      X(D.meterHead, MAT.metal, xm, 1.2, zm, 0);
      X(GEO.uplane, D.meterGlass, xm, 1.37, zm - 0.081, Math.PI, 0.12, 0.08, 1, 0, 0, false);
      solid(xm, zm, 0.06, 0.06, 0, 1.5, 'metal');
    }
  }
  // birds perched along a wire (a quadratic curve a → b dipping to mid): merged with the wires
  function birdsOnWire(a, mid, b, rnd) {
    if (rnd() > 0.35) return;
    const D = detailKit(), n = 1 + Math.floor(rnd() * 5), t0 = 0.15 + rnd() * 0.6;
    const yaw = Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2;
    for (let i = 0; i < n; i++) {
      const t = clamp(t0 + i * (0.018 + rnd() * 0.02), 0.05, 0.95), u = 1 - t;
      const x = u * u * a.x + 2 * u * t * mid.x + t * t * b.x, y = u * u * a.y + 2 * u * t * mid.y + t * t * b.y, z = u * u * a.z + 2 * u * t * mid.z + t * t * b.z;
      const s = 0.85 + rnd() * 0.35;
      xadd(D.bird, MAT.black, mat4(x, y, z, yaw + (rnd() < 0.5 ? 0 : Math.PI) + (rnd() - 0.5) * 0.6, s, s, s), false);
    }
  }
  // ---- past the woods: the water tower, the church steeple, a radio mast, the grain elevator — hazy silhouettes ----
  function skyline() {
    const rnd = TX.rng(909);
    const mats = [];
    const sm = (col, extra = {}) => { const m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.85, fog: false, ...extra }); m.userData.base = new THREE.Color(col); mats.push(m); return m; };
    const steel = sm(0x9aa2a6), white = sm(0xd8d6ce), roofM = sm(0x3c4248), brick = sm(0x7a4a3a), conc = sm(0xa8a49a), dark = sm(0x2e3236);
    const tankTex = ctex(512, 128, (g) => { g.fillStyle = '#b8c0c4'; g.fillRect(0, 0, 512, 128); g.fillStyle = '#2a4a7a'; g.font = 'bold 54px Helvetica'; g.textAlign = 'center'; g.fillText('MAPLE HOLLOW', 256, 84); for (let k = 0; k < 60; k++) { g.fillStyle = `rgba(110,80,50,${rnd() * 0.15})`; g.fillRect(rnd() * 512, 90 + rnd() * 38, 2, 8 + rnd() * 20); } });
    tankTex.wrapS = THREE.RepeatWrapping; tankTex.repeat.set(2, 1);
    const tankM = sm(0xffffff, { map: tankTex });
    const G2 = new THREE.Group(); scene.add(G2); W.skyline = G2;
    const add = (geo, m, x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz, 'YXZ'); o.scale.set(sx, sy, sz); o.castShadow = false; o.receiveShadow = false; G2.add(o); return o; };
    // the water tower, north-west past the fence
    { const x = -168, z = -150, H = 30;
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4, bx = Math.cos(a) * 6, bz = Math.sin(a) * 6, tx = Math.cos(a) * 3.4, tz = Math.sin(a) * 3.4, L = Math.hypot(bx - tx, H, bz - tz);
        const o = add(new THREE.CylinderGeometry(0.35, 0.45, L, 8), steel, x + (bx + tx) / 2, H / 2, z + (bz + tz) / 2); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(tx - bx, H, tz - bz).normalize()); }
      for (const y of [9, 18]) add(new THREE.TorusGeometry(4.6 - y * 0.06, 0.15, 4, 16).rotateX(Math.PI / 2), steel, x, y, z);
      add(new THREE.CylinderGeometry(0.9, 0.9, H, 10), steel, x, H / 2, z);
      add(new THREE.SphereGeometry(7.2, 20, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), tankM, x, H + 2, z);
      add(new THREE.CylinderGeometry(7.2, 7.2, 6, 24, 1, true), tankM, x, H + 5, z);
      add(new THREE.ConeGeometry(7.5, 3.4, 24), tankM, x, H + 9.7, z);
      add(new THREE.TorusGeometry(7.3, 0.12, 4, 32).rotateX(Math.PI / 2), dark, x, H + 2.3, z); }
    // the white church and its steeple, east
    { const x = 176, z = 96;
      add(new THREE.BoxGeometry(14, 9, 24), white, x, 4.5, z); add(new THREE.CylinderGeometry(0.01, 10.5, 6, 4, 1).rotateY(Math.PI / 4).scale(0.95, 1, 1.6), roofM, x, 12, z);
      add(new THREE.BoxGeometry(6, 18, 6), white, x, 9, z - 14); add(new THREE.BoxGeometry(5, 5, 5), white, x, 20.5, z - 14);
      add(new THREE.ConeGeometry(3.4, 16, 8), roofM, x, 31, z - 14); add(new THREE.BoxGeometry(0.25, 2.4, 0.25), dark, x, 40, z - 14); add(new THREE.BoxGeometry(1.3, 0.25, 0.25), dark, x, 40.4, z - 14); }
    // a grain elevator and its silos, south-west
    { const x = -150, z = 188;
      for (let k = 0; k < 4; k++) { add(new THREE.CylinderGeometry(4, 4, 26, 16), conc, x + k * 8.2, 13, z); add(new THREE.ConeGeometry(4.1, 2, 16), conc, x + k * 8.2, 27, z); }
      add(new THREE.BoxGeometry(6, 36, 7), conc, x - 7, 18, z); add(new THREE.BoxGeometry(4, 4, 7), conc, x - 7, 38, z); }
    // a red-and-white radio mast far to the north-east, its light blinking at night
    { const x = 140, z = -230, H = 70, seg = 10;
      for (let k = 0; k < seg; k++) add(new THREE.CylinderGeometry(0.5, 0.6, H / seg, 3, 1, true), k % 2 ? white : sm(0xa83a2a), x, H / seg * (k + 0.5), z);
      const blink = new THREE.MeshBasicMaterial({ color: 0xff2a1a, fog: false }); const b = add(new THREE.SphereGeometry(0.7, 8, 6), blink, x, H + 0.4, z);
      W.anims.push((dt, t) => { b.visible = W.daylight < 0.55 && (t % 1.6) < 0.5; }); }
    // a few distant rooftops and a brick mill chimney south-east, to say "there's a town over there"
    { for (let k = 0; k < 9; k++) { const x = 150 + k * 9 + rnd() * 4, z = 150 + rnd() * 30, h = 6 + rnd() * 9; add(new THREE.BoxGeometry(7, h, 9), k % 3 ? conc : brick, x, h / 2, z); }
      add(new THREE.CylinderGeometry(1.4, 2.2, 34, 10), brick, 196, 17, 178); }
    // hazy: each piece blends toward the fog colour as if seen through ~100 m of air (more in rain, at night darker)
    const fogC = new THREE.Color();
    W.anims.push(() => {
      const d = scene.fog.density, k = clamp(1 - Math.exp(-((d * 105) ** 2)), 0.25, 0.97);
      fogC.copy(scene.fog.color);
      const lit = 0.35 + W.daylight * 0.65;
      for (const m of mats) { m.color.copy(m.userData.base).multiplyScalar(lit).lerp(fogC, k); }
    });
  }
  // ================================================================ BUILD THE TOWN
  function buildMaple() {
    FALLEN_AT.push([-60.5, -10.2], [10.2, 55.0], [-10.4, -71.5]);   // the chaos layer blows trees down here (no standing tree in the root ball)
    // streets: Main St (z = 0) and Maple Ave (x = 0)
    // (the streets themselves are laid after the houses, which say where their driveways cross the sidewalk)
    // the four corner squares of sidewalk at the crossing, curbed on both road sides
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box(sx * 5.05, 0, sz * 5.05, 1, 0.11, 1, 0, f => f === 'top' ? 'walk' : f === (sx > 0 ? 'nx' : 'px') || f === (sz > 0 ? 'nz' : 'pz') ? 'curb' : null, TILE);
    // stop bars across each approach lane
    for (const [x, z, hx2, hz2] of [[-8.3, 1.9, 0.22, 1.8], [8.3, -1.9, 0.22, 1.8], [1.9, 8.3, 1.8, 0.22], [-1.9, -8.3, 1.8, 0.22]]) B.box(x, 0, z, hx2, 0.023, hz2, 0, f => f === 'top' ? 'roadWhite' : null, TILE);
    roadLines(-112, 0, 112, 0, (x) => Math.abs(x) < 8); roadLines(0, -112, 0, 112, (x, z) => Math.abs(z) < 8);
    for (const [x, z, yaw] of [[-7, 0, 0], [7, 0, 0], [0, -7, Math.PI / 2], [0, 7, Math.PI / 2]]) for (let i = -3; i <= 3; i++) {   // crosswalks
      const o = i * 1.1; B.box(x + (yaw ? o : 0), 0, z + (yaw ? 0 : o), yaw ? 0.3 : 0.9, 0.024, yaw ? 0.9 : 0.3, 0, f => f === 'top' ? 'roadWhite' : null, TILE);
    }
    // ---- houses ----
    let seed = 7;
    const lots = [];
    for (const x of [-92, -68, -44, -20, 20, 44, 68, 92]) { lots.push([x, -17, 0]); lots.push([x, 17, Math.PI]); }
    for (const z of [-90, -66, -42, 42, 66, 90]) { lots.push([-17, z, Math.PI / 2]); lots.push([17, z, -Math.PI / 2]); }
    const special = { '20,-17': 'store', '20,17': 'gas', '-20,-17': 'park' };
    W.truckLot = null;
    for (const [x, z, yaw] of lots) {
      const sp = special[x + ',' + z];
      if (sp === 'store') store(x, z, yaw);
      else if (sp === 'gas') gasStation(x, z, yaw);
      else if (sp === 'park') playground(x, z, yaw);
      else house(x, z, yaw, seed++, { noCar: x === 68 && z === 17 });
    }
    street(true); street(false);
    // the way out: an old pickup truck that still runs, on the driveway of 68 Main St (south side)
    {
      const H = W.houses.find(h => h.x === 68 && h.z === 17);
      const [tx, tz] = [H.x + (H.flip > 0 ? -8.6 : 8.6), 17 - 4.5];
      const T = car(tx, tz, Math.PI, 3, 'pickup', { escape: true });
      W.truck = T; W.truckLot = H;
      for (const c of W.containers) if (c.car === T) { c.kind = 'escape'; c.label = 'Pickup truck'; c.x = T.x; c.z = T.z; }
    }
    // ---- the street: lamps, hydrants, bins, parked and crashed cars, the roadblock ----
    // lamps stand at the curb edge of the sidewalk, arms out over the road
    const lampOK = (main, sd, a) => !cutAt(main, sd, a) && !cutAt(main, sd, a - 1) && !cutAt(main, sd, a + 1);
    for (let x = -100; x <= 100; x += 26) { if (Math.abs(x) < 12) continue; if (lampOK(true, -1, x)) streetLamp(x, -4.45, 0); if (lampOK(true, 1, x + 13)) streetLamp(x + 13, 4.45, Math.PI); }
    for (let z = -100; z <= 100; z += 26) { if (Math.abs(z) < 12) continue; if (lampOK(false, -1, z + 6)) streetLamp(-4.45, z + 6, Math.PI / 2); if (lampOK(false, 1, z - 7)) streetLamp(4.45, z - 7, -Math.PI / 2); }
    streetFurniture();
    for (const [x, z] of [[-56, -6.6], [32, 6.6], [-6.6, 54], [6.6, -78], [80, -6.6]]) hydrant(x, z);
    for (const [x, z, yaw] of [[-30, -6.8, 0], [56, 6.8, Math.PI], [6.8, 30, -Math.PI / 2], [-6.8, -54, Math.PI / 2], [-78, 6.8, 0], [90, -6.8, 0]]) trashBin(x, z, yaw);
    // parked cars along the kerb, some crashed into each other in the panic, one burning
    car(-50, 2.6, Math.PI / 2 + 0.05, 1, 'sedan'); car(-73, -2.6, -Math.PI / 2, 4, 'suv'); car(37, -2.7, -Math.PI / 2 - 0.1, 0, 'sedan');
    car(2.6, -48, Math.PI, 7, 'sedan'); car(-2.7, 70, 0.05, 2, 'suv'); car(2.5, 86, Math.PI + 0.1, 5, 'sedan');
    wreck(-9.5, 1.5, 0.9, 1, true); wreck(-12.8, -1.2, -2.0, 4, false);
    wreck(54, -1.0, 1.35, 2, false, 0); wreck(-1.5, -26, 0.4, 7, false, Math.PI / 2 * 0.98);
    wreck(84, 1.4, -1.2, 6, true);
    chaos(-2.0, 32, () => ambulance(-2.0, 32, 0.25));
    // police roadblock on Maple Ave north
    chaos(1.5, -97, () => {
      policeCar(1.5, -100, Math.PI / 2 + 0.3);
      for (const x of [-4, 0.5, 4.2]) barricade(x, -96.5, 0);
      for (let i = 0; i < 9; i++) cone(-5.5 + i * 1.4, -94.2 + (Math.random() - 0.5) * 0.4, Math.random() < 0.2);
    });
    chaos(-30, -3, () => barricade(-30, -3, 0.2)); chaos(46, 3.2, () => barricade(46, 3.2, -0.1));
    // ---- the quarantine fence round everything, the woods behind it ----
    const E = 106;
    chainFence(-E, -E, E, -E); chainFence(E, -E, E, E); chainFence(E, E, -E, E); chainFence(-E, E, -E, -E);
    for (const [x, z, yaw] of [[0, -E + 0.1, 0], [-E + 0.1, 0, Math.PI / 2], [E - 0.1, 0, -Math.PI / 2], [0, E - 0.1, Math.PI]]) {
      const lm2 = new THREE.MeshStandardMaterial({ map: fitLab(['QUARANTINE ZONE', 'DO NOT CROSS'], '#d8c020', '#111', 512, 256, 'bold 54px Helvetica'), roughness: 0.6 });
      // a 2 cm aluminium panel up against the fabric, zip-tied at the corners
      const inx = -Math.sin(yaw) * 0.06, inz = -Math.cos(yaw) * 0.06, sx2 = x + inx, sz2 = z + inz;
      chaos(x, z, () => { mesh(new THREE.BoxGeometry(2.4, 1.2, 0.02), [MAT.metal, MAT.metal, MAT.metal, MAT.metal, lm2, lm2], sx2, 1.6, sz2, yaw, false); for (const [u, v] of [[-1.1, 0.55], [1.1, 0.55], [-1.1, -0.55], [1.1, -0.55]]) inst(GEO.ubox, MAT.black, mat4(x + inx * 0.5 + Math.cos(yaw) * u, 1.6 + v, z + inz * 0.5 - Math.sin(yaw) * u, yaw, 0.02, 0.05, 0.08), false); });
    }
    let sR = 4242; const rnd = () => ((sR = (sR * 9301 + 49297) % 233280) / 233280);   // the same town every launch
    for (let i = 0; i < 160; i++) {
      const a = rnd() * Math.PI * 2, rr = 112 + rnd() * 40;
      let x = Math.cos(a) * rr, z = Math.sin(a) * rr; x = clamp(x, -150, 150); z = clamp(z, -150, 150);
      if (Math.abs(x) < 110 && Math.abs(z) < 110) continue;
      if (rnd() < 0.55) pine(x, z, 0.8 + rnd() * 0.6, rnd); else tree(x, z, 1 + rnd() * 0.6, 1, rnd);
    }
    // street trees along the sidewalks
    const stree = (x, z, s2) => {   // a mulch ring round each; never in a driveway, on a bin or a mailbox, or where a tree falls later
      const main = Math.abs(z) < 9, sd = Math.sign(main ? z : x), a = main ? x : z;
      if (cutAt(main, sd, a) || cutAt(main, sd, a - 2) || cutAt(main, sd, a + 2)) return;
      if (W.boxes.some(b => Math.hypot(b.x - x, b.z - z) < (b.r || 0.5) + 1.2)) return;
      tree(x, z, s2, 0, rnd); paint(x, z, 1.1, 'mud', 0.55);
    };
    for (let x = -96; x <= 96; x += 13) { if (Math.abs(x) < 14) continue; if (rnd() < 0.6) stree(x + 4, -8.2, 0.9 + rnd() * 0.3); if (rnd() < 0.6) stree(x - 3, 8.2, 0.9 + rnd() * 0.3); }
    for (let z = -96; z <= 96; z += 13) { if (Math.abs(z) < 14) continue; if (rnd() < 0.5) stree(-8.2, z + 3, 0.9); if (rnd() < 0.5) stree(8.2, z - 4, 0.9); }
    streetDetail(); skyline();
    // smoke over the horizon: the whole city is burning
    for (const [x, z] of [[-260, -320], [300, -160], [-340, 180], [220, 360], [60, -420]]) chaos(x, z, () => emitter({ x, y: 4, z, kind: 'column', rate: 3, t: 0 }));
    // ---- what people left behind: trash bags, papers, suitcases, bicycles; leaves under the trees ----
    const onStreet = () => { const along = (rnd() - 0.5) * 200, across = (rnd() - 0.5) * 11; return rnd() < 0.5 ? [along, across] : [across, along]; };
    for (const [tx, tz, ts] of W.treeSpots) { if (Math.abs(tx) > 104 || Math.abs(tz) > 104) continue; inst(GEO.litter, MAT.leafLitter, mat4(tx + (rnd() - 0.5), 0.012 + rnd() * 0.004, tz + (rnd() - 0.5), rnd() * 6, 2.2 * ts + rnd(), 1, 2.2 * ts + rnd()), false); }
    const gy = (x, z) => { const ac = Math.min(Math.abs(x), Math.abs(z)); return ac > 4.05 && ac < 6.05 ? 0.11 : 0; };   // the sidewalk's top
    for (let i = 0; i < 70; i++) { const [x, z] = onStreet(); inst(GEO.litter, MAT.leafLitter, mat4(x, 0.03 + gy(x, z), z, rnd() * 6, 0.8 + rnd() * 1.2, 1, 0.8 + rnd() * 1.2), false); }
    const mess = (x, z, fn) => { const cx = Math.floor(x / 20), cz = Math.floor(z / 20); chaos(cx * 20 + 10, cz * 20 + 10, fn, 'mess' + cx + ',' + cz); };
    for (let i = 0; i < 140; i++) { const [x, z] = onStreet(); mess(x, z, () => inst(GEO.paper, MAT.paperSheet, mat4(x, 0.03 + gy(x, z), z, rnd() * 6, 1, 1, 1, (rnd() - 0.5) * 0.15, (rnd() - 0.5) * 0.15), false)); }
    for (let i = 0; i < 40; i++) { let [x, z] = onStreet(); if (rnd() < 0.6) { x = Math.sign(x || 1) * (Math.abs(x) > 6 ? Math.abs(x) : 5.2 + rnd()); } const s2 = 0.8 + rnd() * 0.5; mess(x, z, () => inst(GEO.bag, MAT.trashBag, mat4(x, gy(x, z), z, rnd() * 6, s2, s2, s2))); }
    for (let i = 0; i < 14; i++) { const [x, z] = onStreet(); const up = rnd() < 0.3; mess(x, z, () => inst(GEO.suitcase, MAT['case' + (i % 3)], mat4(x, (up ? 0.26 : 0.11) + gy(x, z), z, rnd() * 6, 1, 1, 1, 0, up ? Math.PI / 2 : 0))); }
    for (let i = 0; i < 6; i++) { const [x, z] = onStreet(); mess(x, z, () => inst(GEO.bike, i % 2 ? MAT.bikeRed : MAT.bikeBlue, mat4(x, 0.03 + gy(x, z), z, rnd() * 6, 1, 1, 1, 0, 1.30))); }
    // scattered blood on the streets
    for (let i = 0; i < 26; i++) { const onX = Math.random() < 0.5; const bx = onX ? (Math.random() - 0.5) * 200 : (Math.random() - 0.5) * 6, bz = onX ? (Math.random() - 0.5) * 6 : (Math.random() - 0.5) * 200, bs = 0.5 + Math.random() * 0.9; mess(bx, bz, () => W.blood(bx, bz, bs, 0.02)); }
    // where zombies come from: the woods' edges, the far ends of the streets
    for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2; W.spawns.push({ x: Math.cos(a) * 100, z: Math.sin(a) * 100 }); }
    // ---- three lookout towers: in the back of the park, at the east end of Main St by the fence, behind the gas station ----
    // ---- the outbreak's wreckage (fallen trees, the gas station fire, the downed line, the bus...) and more trees ----
    outbreakObstacles(); moreTrees();
    watchtower(-18.5, -27.3, -Math.PI / 2, 1);
    watchtower(102.5, -19.5, 0, -1, true);
    watchtower(29.5, 21.5, Math.PI, 1);
    finish();
  }
  // ================================================================ what the outbreak did to the town
  // (all of it in the chaos layer: none of it is there on the Saturday morning). Each piece is real 3D with boxes
  // that match it: low things you vault, big things you go round; fire and live wires go in W.hazards for main.js.
  const OKIT = {};
  function obKit() {
    if (OKIT.ready) return OKIT;
    const rnd = (sd => () => ((sd = (sd * 9301 + 49297) % 233280) / 233280))(97);
    OKIT.busYellow = std({ map: TX.carPaintTexture('#e8a810', 61), roughness: 0.42, metalness: 0.3 });
    OKIT.boxWhite = std({ map: TX.carPaintTexture('#e6e4de', 62), roughness: 0.5, metalness: 0.2 });
    OKIT.darkGlass = std({ color: 0x1a2024, roughness: 0.08, metalness: 0.4 });
    OKIT.tyre = std({ color: 0x18181a, roughness: 0.85 });
    OKIT.label = (lines, bg, fg, w = 512, h = 128, font = 'bold 64px Helvetica') => std({ map: fitLab(lines, bg, fg, w, h, font), roughness: 0.5 });
    // spilled fuel: dark, with an oily rainbow sheen, soft ragged edges
    OKIT.fuel = new THREE.MeshStandardMaterial({ map: ctex(256, 256, (g) => { const gr = g.createRadialGradient(128, 128, 10, 128, 128, 128); gr.addColorStop(0, 'rgba(26,22,18,0.9)'); gr.addColorStop(0.75, 'rgba(26,22,18,0.75)'); gr.addColorStop(1, 'rgba(26,22,18,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); for (let k = 0; k < 40; k++) { const h = Math.floor(rnd() * 360); g.strokeStyle = `hsla(${h},70%,55%,${0.08 + rnd() * 0.12})`; g.lineWidth = 2 + rnd() * 6; g.beginPath(); g.arc(128 + (rnd() - 0.5) * 60, 128 + (rnd() - 0.5) * 60, 20 + rnd() * 80, rnd() * 6, rnd() * 6 + 2); g.stroke(); } g.globalCompositeOperation = 'destination-out'; for (let k = 0; k < 30; k++) { const a = rnd() * 6.28, d = 100 + rnd() * 30; g.fillStyle = 'rgba(0,0,0,0.9)'; g.beginPath(); g.arc(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 10 + rnd() * 18, 0, 7); g.fill(); } }), transparent: true, depthWrite: false, roughness: 0.05, metalness: 0.3, envMapIntensity: 1.6, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    // standing water on the road: a still sheet that mirrors the sky
    OKIT.water = new THREE.MeshStandardMaterial({ map: ctex(256, 256, (g) => { const gr = g.createRadialGradient(128, 128, 20, 128, 128, 128); gr.addColorStop(0, 'rgba(60,70,72,0.85)'); gr.addColorStop(0.8, 'rgba(60,70,72,0.7)'); gr.addColorStop(1, 'rgba(60,70,72,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); g.globalCompositeOperation = 'destination-out'; for (let k = 0; k < 36; k++) { const a = rnd() * 6.28, d = 95 + rnd() * 35; g.fillStyle = 'rgba(0,0,0,1)'; g.beginPath(); g.arc(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 12 + rnd() * 22, 0, 7); g.fill(); } }), transparent: true, depthWrite: false, roughness: 0.02, metalness: 0.1, envMapIntensity: 1.8, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    // the jet from the burst main: white water streaks that run upward (the texture scrolls)
    const jt = ctex(64, 256, (g) => { g.clearRect(0, 0, 64, 256); for (let k = 0; k < 70; k++) { g.strokeStyle = `rgba(235,242,245,${0.15 + rnd() * 0.5})`; g.lineWidth = 1 + rnd() * 3; const x = rnd() * 64, y = rnd() * 256; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 4, y + 20 + rnd() * 50); g.stroke(); } }, [2, 1]);
    OKIT.jet = new THREE.MeshStandardMaterial({ map: jt, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.2, color: 0xe8f0f4, emissive: 0x222a2e });
    OKIT.soot = new THREE.MeshStandardMaterial({ map: ctex(128, 128, (g) => { const gr = g.createRadialGradient(64, 90, 4, 64, 60, 70); gr.addColorStop(0, 'rgba(8,6,5,0.95)'); gr.addColorStop(0.6, 'rgba(12,10,8,0.6)'); gr.addColorStop(1, 'rgba(12,10,8,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    OKIT.glow = new THREE.MeshStandardMaterial({ color: 0x2a0a00, emissive: 0xff6a18, emissiveIntensity: 2.2, roughness: 1, side: THREE.DoubleSide });
    OKIT.spark = new THREE.MeshBasicMaterial({ color: 0xcfe8ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    OKIT.tape = std({ map: fitLab(['CAUTION  ·  CAUTION  ·  CAUTION'], '#e8c418', '#111', 512, 32, 'bold 22px Helvetica'), side: THREE.DoubleSide, roughness: 0.6 });
    OKIT.redGlow = std({ color: 0x400000, emissive: 0xff2010, emissiveIntensity: 2.5, roughness: 0.5 });
    // a shopping cart: wire basket, frame, red handle, four casters (one merged shape, plus its wire mesh)
    const P3 = [], tube = (a, b, r = 0.012) => { const v = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), Lg = v.length(); const g = new THREE.CylinderGeometry(r, r, Lg, 6); g.translate(0, Lg / 2, 0); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize())); g.translate(a[0], a[1], a[2]); P3.push(g.toNonIndexed()); };
    for (const sx of [-0.27, 0.27]) { tube([sx, 0.12, -0.45], [sx, 0.12, 0.42]); tube([sx, 0.12, -0.45], [sx * 1.05, 0.98, -0.5]); tube([sx, 0.5, 0.42], [sx * 1.1, 0.98, 0.5]); tube([sx * 1.05, 0.98, -0.5], [sx * 1.1, 0.98, 0.5]); tube([sx, 0.12, 0.42], [sx, 0.5, 0.42]); }
    tube([-0.27, 0.5, 0.42], [0.27, 0.5, 0.42]); tube([-0.3, 0.98, 0.5], [0.3, 0.98, 0.5]);
    for (const [x2, z2] of [[-0.24, -0.4], [0.24, -0.4], [-0.24, 0.38], [0.24, 0.38]]) { const w = new THREE.CylinderGeometry(0.05, 0.05, 0.03, 10).rotateZ(Math.PI / 2).translate(x2, 0.05, z2); P3.push(w.toNonIndexed()); tube([x2, 0.05, z2], [x2, 0.12, z2], 0.01); }
    OKIT.cartFrame = mergeGeometries(P3.map(q => { for (const n of Object.keys(q.attributes)) if (!['position', 'normal'].includes(n)) q.deleteAttribute(n); return q; }));
    const bk = [];
    for (const sx of [-1, 1]) bk.push(new THREE.PlaneGeometry(0.95, 0.48).rotateY(Math.PI / 2).translate(sx * 0.28, 0.74, 0));
    bk.push(new THREE.PlaneGeometry(0.56, 0.48).translate(0, 0.74, 0.47), new THREE.PlaneGeometry(0.56, 0.48).translate(0, 0.74, -0.47), new THREE.PlaneGeometry(0.56, 0.95).rotateX(-Math.PI / 2).translate(0, 0.5, 0));
    OKIT.cartBasket = mergeGeometries(bk.map(q => q.toNonIndexed()));
    OKIT.handle = std({ color: 0xb81c18, roughness: 0.5 });
    OKIT.hole = new THREE.MeshStandardMaterial({ map: ctex(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 6, 64, 64, 64); gr.addColorStop(0, '#020202'); gr.addColorStop(0.55, '#0a0806'); gr.addColorStop(0.8, '#2a2016'); gr.addColorStop(0.93, '#4a3a28'); gr.addColorStop(1, 'rgba(60,50,40,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    OKIT.ready = true; return OKIT;
  }
  // a beam between two world points (long axis a→b)
  const wbeam = (a, b, w, h, mat, shadow = true) => { const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz); xadd(towerKit().beam, mat, mat4((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, Math.atan2(dx, dz), w, h, L, -Math.asin(dy / L), 0), shadow); };
  const WX = (geo, mat, x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0, sh = true) => xadd(geo, mat, mat4(x, y, z, ry, sx, sy, sz, rx, rz), sh);
  // a place that hurts (fire, a live wire) or soaks you (water): for main.js to apply; zombies are kept out of fire
  function hazard(x, z, r, kind, dps, zKeep = true) {
    const h = { x, z, r, kind, dps, off: false }; W.hazards.push(h); if (CI) CI.hazards.push(h);
    if (zKeep) solid(x, z, r * 0.75, r * 0.75, 0, 1.2, 'dirt', 0, { zOnly: true, pass: true });
    return h;
  }
  // ---- a tree blown (or knocked) down: torn-up root plate, the trunk on the ground, the crown in a heap ----
  function fallenTree(x0, z0, yaw, len = 9, s = 1) {
    const fx = Math.sin(yaw), fz = Math.cos(yaw), px = fz, pz = -fx, at = k => [x0 + fx * len * k, z0 + fz * len * k];
    inst(GEO.trunk, MAT.bark, mat4(x0, 0.42 * s, z0, yaw, 1.6 * s, len * 0.82, 1.6 * s, Math.PI / 2 - 0.04, 0));
    // the root plate, stood on edge where it tore out of the lawn; roots poking out of it; the hole it left
    inst(GEO.blob, MAT.dirt, mat4(x0 - fx * 0.25, 1.0 * s, z0 - fz * 0.25, yaw, 1.35 * s, 1.15 * s, 0.32 * s));
    for (let k = 0; k < 9; k++) { const a = k / 9 * 6.28; inst(GEO.branch, MAT.bark, mat4(x0 - fx * 0.35 + px * Math.cos(a) * 0.9 * s, 1.0 * s + Math.sin(a) * 0.9 * s, z0 - fz * 0.35 + pz * Math.cos(a) * 0.9 * s, yaw + Math.PI + (Math.random() - 0.5), 1.4, 0.6 + Math.random() * 0.5, 1.4, 1.2 + Math.random() * 0.6, 0), false); }
    { const m = new THREE.Mesh(GEO.litter, MAT.dirt); m.position.set(x0 - fx * 1.1, 0.02, z0 - fz * 1.1); m.scale.set(2.4 * s, 1, 1.6 * s); m.rotation.y = yaw; m.receiveShadow = true; m.renderOrder = 1; level.add(m); }
    // limbs snapped off along the trunk, the crown crushed flat on the far end
    for (let k = 0; k < 5; k++) { const [bx, bz] = at(0.35 + k * 0.1), sd = k % 2 ? 1 : -1; inst(GEO.branch, MAT.bark, mat4(bx, 0.5 * s, bz, yaw + sd * (0.7 + Math.random() * 0.5), 2.2 * s, (1.4 + Math.random()) * s, 2.2 * s, Math.PI / 2 - 0.15, 0)); }
    for (let k = 0; k < 14; k++) { const t = 0.62 + Math.random() * 0.45, [cx, cz] = at(t), off = (Math.random() - 0.5) * 3.6 * s, sc = (0.9 + Math.random() * 0.6) * s; inst(GEO.clump, MAT.leaves, mat4(cx + px * off, 0.55 + Math.random() * 1.3 * s, cz + pz * off, Math.random() * 6, sc * 1.2, sc * 0.75, sc * 1.2)); if (k % 2 === 0) inst(GEO.clumpIn, MAT.leafCore, mat4(cx + px * off, 0.7, cz + pz * off, 0, sc, sc * 0.6, sc), false); }
    // you climb over the trunk (it's low), go round the crown and the roots
    { const [cx, cz] = at(0.33); solid(cx, cz, 0.42 * s, len * 0.28, yaw, 0.85 * s, 'wood', 0, { vault: true }); }
    { const [cx, cz] = at(0.845); solid(cx, cz, 2.6 * s, len * 0.24, yaw, 2.1 * s, 'leaves'); }   // the whole crushed crown, not just its middle
    solid(x0 - fx * 0.25, z0 - fz * 0.25, 1.3 * s, 0.35 * s, yaw, 2.1 * s, 'dirt');
    W.treeSpots.push([...at(0.8), s]);
  }
  // ---- a vehicle built from boxes (local: length along x, width z, height y) and laid on its side ----
  function sideways(x, z, yaw, W2, parts) {
    const grp = new THREE.Group(); grp.rotation.order = 'YXZ';
    for (const [geo, mat, px, py, pz, rx = 0, ry = 0, rz = 0] of parts) { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.rotation.set(rx, ry, rz); m.castShadow = true; m.receiveShadow = true; grp.add(m); }
    grp.rotation.set(Math.PI / 2, yaw, 0); grp.position.set(x, W2 / 2, z); level.add(grp);
    mergeGroup(grp); return grp;
  }
  function outbreakObstacles() {
    const K = obKit(), AK = atticKit(), rb = (w, h, d, r = 0.06) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.1, h / 2.1, d / 2.1)), bx = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    // ---- 1. fallen trees: across the north sidewalk of Main St, across Maple Ave's sidewalks ----
    chaos(-60, -7, () => fallenTree(-60.5, -10.2, 0.38, 9.5, 1.05));
    chaos(9.5, 54, () => fallenTree(10.2, 55.0, -1.95, 9, 0.95));
    chaos(-9.5, -71, () => fallenTree(-10.4, -71.5, 1.25, 8.5, 0.9));
    // ---- 2. the gas station: a pump knocked crooked, fuel spreading over the forecourt, the far end of it alight ----
    chaos(16, 12, () => {
      const PX = 17.5, PZ = 14;
      WX(rb(0.86, 1.6, 0.56, 0.06), std({ color: 0x3a3d42, roughness: 0.4, metalness: 0.5 }), PX - 0.12, 0.96, PZ - 0.2, 0.25, 1, 1, 1, -0.12, 0.08);   // the dispenser, shoved off its base
      WX(bx(0.9, 0.05, 0.6), MAT.darkMetal, PX, 0.235, PZ, 0, 1, 1, 1, 0, 0, false);
      wbeam([PX - 0.3, 0.3, PZ - 0.5], [PX - 1.4, 0.03, PZ - 1.6], 0.035, 0.035, MAT.black);                // a hose torn out, its nozzle in the puddle
      WX(rb(0.07, 0.24, 0.12, 0.02), MAT.black, PX - 1.45, 0.06, PZ - 1.65, 0.7, 1, 1, 1, Math.PI / 2, 0);
      WX(rb(0.32, 0.36, 0.2, 0.03), MAT.redPaint, 14.9, 0.11, 12.9, 0.4, 1, 1, 1, Math.PI / 2, 0);        // a gas can on its side
      const pd = new THREE.Mesh(GEO.litter, K.fuel); pd.position.set(15.9, 0.032, 12.4); pd.renderOrder = 1; level.add(pd);
      const fire = [14.4, 10.6];
      { const sc = new THREE.Mesh(GEO.litter, scorchMat); sc.position.set(fire[0], 0.03, fire[1]); sc.scale.set(4.4, 1, 4.4); sc.renderOrder = 1; level.add(sc); }
      for (const [ox, oz] of [[0, 0], [0.7, 0.5], [-0.6, 0.3], [0.2, -0.7]]) emitter({ x: fire[0] + ox, y: 0.15, z: fire[1] + oz, kind: 'fire', pool: 0.9, rate: 7, t: 0, light: true });
      emitter({ x: fire[0], y: 1.6, z: fire[1], kind: 'smoke', rate: 4, t: 0 });
      hazard(fire[0], fire[1], 1.6, 'fire', 22);
      const fuel = hazard(15.9, 12.4, 1.2, 'fuel', 0, false), it = CI, R = 3.4;
      // the puddle creeps outward for a couple of minutes after you first see it
      let k = 0.55; W.anims.push(dt => { if (!it.shown) { k = 0.55; pd.scale.set(0.01, 1, 0.01); return; } k = Math.min(1, k + dt / 150); const rr = R * k; pd.scale.set(rr * 2, 1, rr * 1.7); fuel.r = rr * 0.85; });
    });
    // ---- 3. a downed power line: a pole snapped by a car, the wires down on Maple Ave, still live and sparking ----
    chaos(-4, 47, () => {
      const poleM = std({ map: TX.barkTexture('oak'), color: 0x544636, roughness: 0.95 });
      const A = [-7.4, 40], S0 = [-7.2, 54.5], E = [-0.7, 49.0];
      WX(new THREE.CylinderGeometry(0.12, 0.16, 9.2, 10).translate(0, 4.6, 0), poleM, A[0], 0, A[1]); WX(bx(1.9, 0.1, 0.1), poleM, A[0], 8.55, A[1], 0); solid(A[0], A[1], 0.16, 0.16, 0, 9.2, 'wood');
      for (const o of [-0.8, 0, 0.8]) WX(GEO.ucyl, MAT.porcelain, A[0] + o, 8.68, A[1], 0, 0.06, 0.16, 0.06, 0, 0, false);
      // the stump, splintered; the rest of the pole across the sidewalk with its crossarm on the road
      WX(new THREE.CylinderGeometry(0.15, 0.16, 1.3, 10).translate(0, 0.65, 0), poleM, S0[0], 0, S0[1]); solid(S0[0], S0[1], 0.17, 0.17, 0, 1.3, 'wood');
      for (let k = 0; k < 6; k++) WX(bx(0.03, 0.35 + Math.random() * 0.3, 0.05), poleM, S0[0] + Math.cos(k) * 0.1, 1.4, S0[1] + Math.sin(k) * 0.1, k, 1, 1, 1, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, false);
      const dx = E[0] - S0[0], dz = E[1] - S0[1], Lp = Math.hypot(dx, dz), yw = Math.atan2(dx, dz);
      wbeam([S0[0] + dx / Lp * 0.4, 0.2, S0[1] + dz / Lp * 0.4], [E[0], 0.15, E[1]], 0.28, 0.28, poleM);
      WX(bx(1.9, 0.1, 0.1), poleM, E[0] - dx / Lp * 0.4, 0.14, E[1] - dz / Lp * 0.4, yw + Math.PI / 2, 1, 1, 1, 0, Math.PI / 2 * 0.9);
      solid(S0[0] + dx * 0.55, S0[1] + dz * 0.55, 0.2, Lp * 0.44, yw, 0.32, 'wood', 0, { vault: true });
      // a transformer can rolled off into the grass, oil around it
      WX(GEO.ucyl, MAT.metal, -8.6, 0.3, 53.2, 0.4, 0.55, 0.9, 0.55, Math.PI / 2, 0); solid(-8.6, 53.2, 0.48, 0.3, 0.4, 0.6, 'metal', 0, { vault: true });
      // three wires sag from the standing pole down onto the road, the ends curled on the asphalt
      for (const o of [-0.8, 0, 0.8]) { const a = new THREE.Vector3(A[0] + o, 8.72, A[1]), b = new THREE.Vector3(E[0] + o * 0.4, 0.04, E[1] + o * 0.6), m = a.clone().lerp(b, 0.55); m.y = 2.4; xadd(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, m, b), 30, 0.012, 4, false), MAT.black, new THREE.Matrix4(), false); xadd(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([b, b.clone().add(new THREE.Vector3(0.6, 0, 0.3)), b.clone().add(new THREE.Vector3(0.9, 0, -0.4)), b.clone().add(new THREE.Vector3(0.4, 0, -0.9))]), 16, 0.012, 4, false), MAT.black, new THREE.Matrix4(), false); }
      // the arcing: a hot blue-white flash that jumps about at the wire ends (and a hazard where they lie)
      const sp = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 1), K.spark); sp.position.set(E[0], 0.12, E[1]); level.add(sp);
      emitter({ x: E[0], y: 0.1, z: E[1], kind: 'sparks', rate: 3, t: 0 });
      hazard(E[0] + 0.3, E[1], 1.5, 'shock', 35);
      const it = CI; let ph = 0;
      W.anims.push((dt, t, f) => { if (!it.shown || Math.abs(f.x - E[0]) > 60 || Math.abs(f.z - E[1]) > 60) { sp.visible = false; return; } ph -= dt; if (ph <= 0) { ph = 0.04 + Math.random() * (Math.random() < 0.2 ? 0.9 : 0.15); sp.visible = Math.random() < 0.6; sp.position.set(E[0] + (Math.random() - 0.5) * 1.2, 0.08 + Math.random() * 0.2, E[1] + (Math.random() - 0.5) * 1.0); sp.scale.setScalar(0.5 + Math.random() * 1.4); } });
    });
    // ---- 4. a school bus on its side across the westbound lanes of Main St ----
    chaos(-84, -1.6, () => {
      const Lb = 10.4, Wb = 2.45, wheel = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 18).rotateX(Math.PI / 2), rim = new THREE.CylinderGeometry(0.28, 0.28, 0.32, 14).rotateX(Math.PI / 2);
      const parts = [[rb(7.9, 2.35, Wb, 0.14), K.busYellow, -1.15, 1.5, 0], [rb(1.5, 1.05, Wb - 0.1, 0.12), K.busYellow, 3.55, 1.0, 0], [bx(0.16, 0.36, Wb), MAT.black, 4.33, 0.62, 0], [bx(0.16, 0.36, Wb), MAT.black, -5.13, 0.55, 0],
        [bx(0.04, 0.95, Wb - 0.3), K.darkGlass, 2.83, 2.05, 0]];
      const sign = K.label(['SCHOOL BUS'], '#e8a810', '#111', 512, 96, 'bold 70px Helvetica');
      parts.push([new THREE.PlaneGeometry(1.6, 0.3), sign, 2.84, 2.55, 0, 0, Math.PI / 2, 0], [new THREE.PlaneGeometry(1.6, 0.3), sign, -5.12, 2.55, 0, 0, -Math.PI / 2, 0]);
      for (const sz of [-1, 1]) {
        parts.push([bx(7.2, 0.62, 0.02), K.darkGlass, -1.25, 2.0, sz * (Wb / 2 + 0.005)]);
        for (let k = 0; k < 9; k++) parts.push([bx(0.08, 0.66, 0.03), K.busYellow, -4.85 + k * 0.9, 2.0, sz * (Wb / 2 + 0.01)]);
        for (const y of [0.75, 1.15, 1.5]) parts.push([bx(Lb - 2.6, 0.06, 0.03), MAT.black, -1.2, y, sz * (Wb / 2 + 0.015)]);
        for (const [wx, n] of [[3.4, 1], [-2.9, 2]]) for (let q = 0; q < n; q++) { parts.push([wheel, K.tyre, wx, 0.5, sz * (Wb / 2 - 0.2 - q * 0.32)], [rim, MAT.metal, wx, 0.5, sz * (Wb / 2 - 0.19)]); }
      }
      parts.push([new THREE.CylinderGeometry(0.22, 0.22, 0.02, 8).rotateX(Math.PI / 2), MAT.redPaint, 1.9, 1.6, -(Wb / 2 + 0.03)]);   // the stop arm, folded
      parts.push([bx(0.05, 2.0, 0.8), K.busYellow, -5.1, 1.4, 0.55], [bx(0.05, 0.8, 0.6), K.darkGlass, -5.13, 1.9, 0.55]);         // the emergency door
      for (const [lx, sz] of [[2.8, -0.9], [2.8, 0.9], [-5.1, -0.9], [-5.1, 0.9]]) parts.push([new THREE.SphereGeometry(0.09, 10, 6), lx > 0 ? MAT.yellowPaint : MAT.redPaint, lx + (lx > 0 ? 0.05 : -0.05), 2.62, sz]);
      sideways(-84, -1.6, 0, Wb, parts.map(p => { const q = p.slice(); q[3] = p[3] - 1.45; return q; }));
      solid(-84.6, -1.6, Lb / 2 + 0.1, 1.5, 0, Wb + 0.05, 'metal');
      // backpacks and papers thrown out of the windows
      for (let k = 0; k < 6; k++) WX(rb(0.32, 0.4, 0.18, 0.06), MAT['fabric' + (k % 5)], -88 + k * 1.6 + Math.random(), 0.1, 0.6 + Math.random() * 1.8, Math.random() * 6, 1, 1, 1, Math.PI / 2, 0);
    });
    // ---- 5. a delivery box truck rolled onto its side in the northbound lane of Maple Ave, parcels everywhere ----
    chaos(2.2, -76, () => {
      const wheel = new THREE.CylinderGeometry(0.48, 0.48, 0.3, 18).rotateX(Math.PI / 2), Wt = 2.4;
      const side = K.label(['HOLLOW EXPRESS', 'DELIVERIES · SAME DAY'], '#e6e4de', '#1d3e6e', 512, 160, 'bold 50px Helvetica');
      const parts = [[rb(6.6, 2.7, Wt, 0.05), K.boxWhite, -1.2, 2.25, 0], [rb(1.9, 2.0, Wt - 0.1, 0.12), K.boxWhite, 3.05, 1.55, 0], [bx(0.05, 0.85, Wt - 0.4), K.darkGlass, 4.0, 2.05, 0],
        [bx(8.6, 0.3, 1.0), MAT.darkMetal, -0.3, 0.75, 0], [bx(0.2, 0.32, Wt), MAT.black, 4.05, 0.8, 0], [bx(0.05, 2.5, Wt - 0.1), MAT.metal, -4.53, 2.25, 0]];
      for (let k = 0; k < 9; k++) parts.push([bx(0.02, 0.04, Wt - 0.12), MAT.darkMetal, -4.56, 1.1 + k * 0.27, 0]);   // the roll-up door's slats
      for (const sz of [-1, 1]) { parts.push([new THREE.PlaneGeometry(4.6, 1.45), side, -1.2, 2.3, sz * (Wt / 2 + 0.006), 0, sz > 0 ? 0 : Math.PI, 0], [bx(1.1, 0.75, 0.02), K.darkGlass, 3.3, 2.05, sz * (Wt / 2 - 0.04)]); for (const wx of [3.0, -2.6, -3.4]) parts.push([wheel, K.tyre, wx, 0.48, sz * (Wt / 2 - 0.25)]); }
      sideways(2.2, -76, Math.PI / 2, Wt, parts.map(p => { const q = p.slice(); q[3] = p[3] - 1.75; return q; }));
      solid(2.2, -75.8, 1.75, 4.6, 0, Wt + 0.05, 'metal');
      // parcels: tumbled out of the open back, a low heap you can climb over
      for (let k = 0; k < 14; k++) { const w = 0.3 + Math.random() * 0.35; WX(GEO.ubox, k % 4 ? AK.card : AK.cardX, 1.0 + Math.random() * 2.8, w * 0.35, -71.2 + Math.random() * 2.2, Math.random() * 6, w, w * 0.7, w * 0.8, 0, (Math.random() - 0.5) * 0.4); }
      solid(2.4, -70.2, 1.4, 1.0, 0, 0.5, 'cloth', 0, { vault: true });
    });
    // ---- 6. a detached garage that came down (on the calm morning it's standing) ----
    { const H = W.houses.find(h => h.x === -92 && h.z === -17);
      if (H) {
        const c = Math.cos(H.yaw), sn = Math.sin(H.yaw), Pl = (lx, lz) => [H.x + lx * H.flip * c + lz * sn, H.z - lx * H.flip * sn + lz * c];
        const [gx, gz] = Pl(8.6, -4.6), yaw = H.yaw, n0 = W.boxes.length;
        const GM = new THREE.Matrix4().compose(new THREE.Vector3(gx, 0, gz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));
        const gm = (geo, mat, lx, ly, lz, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0, sh = true) => xadd(geo, mat, GM.clone().multiply(mat4(lx, ly, lz, ry, sx, sy, sz, rx, rz)), sh);
        const sidM = MAT[H.sid] || MAT.siding0, rfM = MAT[H.roofM] || MAT.shingle0;
        const intact = sub(() => {
          // walls, a roll-up door to the drive, a little side window, a gable roof
          gm(GEO.ubox, sidM, 0, 1.25, -2.8, 0, 3.4, 2.5, 0.15); gm(GEO.ubox, sidM, -1.7, 1.25, 0, 0, 0.15, 2.5, 5.6); gm(GEO.ubox, sidM, 1.7, 1.25, 0, 0, 0.15, 2.5, 5.6);
          gm(GEO.ubox, sidM, -1.45, 1.25, 2.8, 0, 0.5, 2.5, 0.15); gm(GEO.ubox, sidM, 1.45, 1.25, 2.8, 0, 0.5, 2.5, 0.15); gm(GEO.ubox, sidM, 0, 2.3, 2.8, 0, 2.4, 0.4, 0.15);
          for (let k = 0; k < 7; k++) gm(GEO.ubox, MAT.white, 0, 0.15 + k * 0.3, 2.86, 0, 2.38, 0.28, 0.04);
          gm(GEO.ubox, MAT.glass, 1.78, 1.5, -0.8, 0, 0.02, 0.6, 0.9, 0, 0, false); gm(GEO.ubox, MAT.trim, 1.79, 1.5, -0.8, 0, 0.03, 0.7, 1.0, 0, 0, false);
          for (const sd of [-1, 1]) gm(GEO.ubox, rfM, sd * 0.95, 2.95, 0, 0, 2.05, 0.08, 6.0, 0, sd * -0.5);
          const tri = new THREE.Shape(); tri.moveTo(-1.75, 2.5); tri.lineTo(1.75, 2.5); tri.lineTo(0, 3.45); tri.closePath(); const tg = new THREE.ShapeGeometry(tri);
          gm(tg, sidM, 0, 0, 2.88); gm(tg, sidM, 0, 0, -2.88, Math.PI);
          solid(gx, gz, 1.78, 2.88, yaw, 3.3, 'wood');
        });
        const iBoxes = W.boxes.slice(n0);
        chaos(gx, gz, () => {
          // the back wall still up, one side wall leaning, the roof down across a crushed car, the door folded on the drive
          gm(GEO.ubox, sidM, 0, 1.0, -2.8, 0, 3.4, 2.0, 0.15); gm(GEO.ubox, sidM, -1.95, 0.95, -0.3, 0, 0.15, 1.9, 5.0, 0, 0.42);
          gm(GEO.ubox, rfM, 0.15, 1.35, -0.2, 0.08, 3.9, 0.1, 6.1, -0.38, 0.12); gm(GEO.ubox, rfM, 0.9, 0.7, 1.4, -0.1, 2.2, 0.1, 3.0, -0.18, -0.35);
          for (let k = 0; k < 7; k++) gm(GEO.ubox, MAT.white, -0.4 + k * 0.08, 0.06 + k * 0.05, 3.6 + k * 0.1, 0.2 + k * 0.05, 2.38, 0.28, 0.04, Math.PI / 2 * 0.9, 0.1 * k);
          for (let k = 0; k < 12; k++) gm(towerKit().beam, AK.pine, (Math.random() - 0.5) * 3, 0.15 + Math.random() * 1.0, (Math.random() - 0.5) * 5, Math.random() * 6, 0.045, 0.09, 1 + Math.random() * 1.8, (Math.random() - 0.5) * 0.9, 0);
          for (let k = 0; k < 16; k++) gm(GEO.blob0, MAT.concrete, (Math.random() - 0.5) * 3.2, 0.08, (Math.random() - 0.5) * 5.2, Math.random() * 6, 0.15 + Math.random() * 0.2, 0.1 + Math.random() * 0.12, 0.15 + Math.random() * 0.2);
          solid(gx, gz, 1.9, 2.9, yaw, 1.7, 'wood');
          const [dx2, dz2] = Pl(8.6, -0.7); solid(dx2, dz2, 1.2, 0.5, yaw, 0.45, 'metal', 0, { vault: true });
        }).onShow = on => { intact.visible = !on; for (const b of iBoxes) b.off = on; navPatch(iBoxes); };
      } }
    // ---- 7. a pile-up just east of the crossing (both sidewalks left open) ----
    chaos(10, 0, () => {
      wreck0(7.6, -2.3, 1.75, 0); wreck0(11.4, -0.8, -2.55, 3); wreck0(9.2, 2.3, 0.4, 5, false, 0); wreck0(14.8, -2.4, 1.45, 2, false, Math.PI / 2 * 0.98);
      for (let k = 0; k < 20; k++) WX(GEO.uplane, MAT.glass, 8 + Math.random() * 6, 0.03, -3 + Math.random() * 5, Math.random() * 6, 0.05 + Math.random() * 0.1, 0.05 + Math.random() * 0.1, 1, -Math.PI / 2, 0, false);
    });
    // ---- 8. a water main burst under Maple Ave: the road heaved up and split, a jet of water, the street flooded ----
    chaos(-0.8, -60, () => {
      const C0 = [-0.8, -60];
      for (let k = 0; k < 5; k++) { const a = k / 5 * 6.28 + 0.3, r0 = 0.75; WX(GEO.ubox, MAT.road, C0[0] + Math.cos(a) * r0, 0.12, C0[1] + Math.sin(a) * r0, -a, 0.9, 0.16, 0.7, 0, 0.35 * (k % 2 ? 1 : -1)); }
      WX(new THREE.CircleGeometry(1.0, 22).rotateX(-Math.PI / 2), K.hole, C0[0], 0.036, C0[1], 0, 1, 1, 1, 0, 0, false);
      WX(GEO.ucyl, MAT.rust, C0[0] + 0.1, -0.15, C0[1], 0.6, 0.35, 1.6, 0.35, 0, Math.PI / 2, false);   // the split main
      const pool = new THREE.Mesh(GEO.litter, K.water); pool.position.set(C0[0] + 0.4, 0.03, C0[1] - 1.2); pool.scale.set(9, 1, 15); level.add(pool);
      const jets = [0, 1, 2].map(i => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.06 + i * 0.05, 0.22 + i * 0.12, 1, 12, 1, true).translate(0, 0.5, 0), K.jet); m.position.set(C0[0] + 0.1, 0.1, C0[1]); level.add(m); return m; });
      solid(C0[0], C0[1], 1.0, 1.0, 0, 0.6, 'concrete');
      hazard(C0[0] + 0.4, C0[1] - 1.2, 6, 'water', 0, false);
      const it = CI;
      W.anims.push((dt, t, f) => { if (!it.shown || Math.abs(f.x - C0[0]) > 90 || Math.abs(f.z - C0[1]) > 90) return; K.jet.map.offset.y = (t * 1.6) % 1; jets.forEach((m, i) => { m.scale.set(1 + Math.sin(t * 9 + i) * 0.08, 4.2 - i * 1.1 + Math.sin(t * 5.3 + i * 2) * 0.35, 1 + Math.cos(t * 8 + i) * 0.08); m.rotation.z = Math.sin(t * 1.3 + i) * 0.05; }); });
    });
    // ---- 9. a police checkpoint across Main St west: sawhorse barricades, a spike strip, ROAD CLOSED, road flares ----
    chaos(-64, 0, () => {
      for (const z2 of [-2.7, 0, 2.7]) barricade(-64, z2, Math.PI / 2);
      const spk = new THREE.ConeGeometry(0.018, 0.07, 5);
      WX(GEO.ubox, MAT.black, -60.5, 0.02, 2.0, 0, 0.12, 0.04, 3.6, 0, 0, false);
      for (let z2 = 0.3; z2 < 3.75; z2 += 0.09) for (const ox of [-0.04, 0.04]) WX(spk, MAT.metal, -60.5 + ox, 0.07, z2, 0, 1, 1, 1, 0, 0, false);
      hazard(-60.5, 2.0, 0.6, 'spikes', 6, false);
      const sign = K.label(['ROAD', 'CLOSED'], '#f0eee6', '#111', 256, 192, 'bold 70px Helvetica');
      WX(new THREE.PlaneGeometry(1.2, 0.9), sign, -65.2, 1.25, -0.2, Math.PI / 2 * 0.0 - Math.PI / 2, 1, 1, 1, 0, 0, false);
      for (const oz of [-0.5, 0.5]) for (const ox of [-0.25, 0.25]) wbeam([-65.2 + ox, 0, -0.2 + oz], [-65.2, 1.7, -0.2 + oz], 0.04, 0.04, MAT.white);
      solid(-65.2, -0.2, 0.3, 0.6, 0, 1.7, 'wood', 0, { vault: true });
      for (const [fx2, fz2] of [[-62.6, -3.3], [-62.4, 0.9], [-62.8, 3.2]]) { WX(GEO.ucyl, K.redGlow, fx2, 0.03, fz2, Math.random() * 6, 0.04, 0.3, 0.04, 0, Math.PI / 2, false); emitter({ x: fx2, y: 0.1, z: fz2, kind: 'smoke', rate: 1.2, t: 0 }); }
      for (let i = 0; i < 6; i++) cone(-61.5, -3.6 + i * 1.4, false);
    });
    // ---- 10. a house on fire: flames in the front windows, smoke pouring out, the walls blackened above them ----
    { const H = W.houses.find(h => h.x === -68 && h.z === -17);
      if (H) chaos(H.x, H.z, () => {
        const c = Math.cos(H.yaw), sn = Math.sin(H.yaw), Pl = (lx, lz) => [H.x + lx * H.flip * c + lz * sn, H.z - lx * H.flip * sn + lz * c];
        for (const [w0, w1] of [[-1.3, 0.1], [2.6, 4.2]]) {
          const wx = (w0 + w1) / 2, [ex, ez] = Pl(wx, 5.16), [ix, iz] = Pl(wx, 4.7);
          const so = new THREE.Mesh(new THREE.PlaneGeometry(w1 - w0 + 0.9, 1.6), K.soot); so.position.set(ex, 2.35, ez); so.rotation.y = H.yaw; so.renderOrder = 1; level.add(so);
          const gl = new THREE.Mesh(new THREE.PlaneGeometry(w1 - w0, 1.2), K.glow); gl.position.set(ix, 1.5, iz); gl.rotation.y = H.yaw; level.add(gl);
          emitter({ x: ex, y: 1.5, z: ez, kind: 'fire', rate: 8, t: 0, light: true }); emitter({ x: ex, y: 2.2, z: ez, kind: 'smoke', rate: 4, t: 0 });
        }
        const [rx, rz] = Pl(-1.5, 1.0); emitter({ x: rx, y: 5.4, z: rz, kind: 'column', rate: 1.2, t: 0 }); emitter({ x: rx, y: 5.0, z: rz, kind: 'smoke', rate: 3, t: 0 });
        // inside, the living room is burning: the couch and the rug
        for (const [lx, lz] of [[-5.2, 2.6], [-3.6, 2.6]]) { const [fx2, fz2] = Pl(lx, lz); emitter({ x: fx2, y: 0.3, z: fz2, kind: 'fire', pool: 0.8, rate: 7, t: 0, light: true }); hazard(fx2, fz2, 1.2, 'fire', 20); }
        K.glowT ??= W.anims.push((dt, t) => { K.glow.emissiveIntensity = 1.6 + Math.sin(t * 17) * 0.4 + Math.sin(t * 6.1) * 0.5; });
      }); }
    // ---- 11. a heap of rubble where the park's brick sign wall came down ----
    chaos(-24.5, -7.8, () => {
      const brick = MAT.brick;
      for (let k = 0; k < 3; k++) WX(GEO.ubox, brick, -26.2 + k * 0.9, 0.25 + (k === 1 ? 0.3 : 0), -8.9, 0.1 * k, 0.85, 0.5 + (k === 1 ? 0.6 : 0), 0.35, 0, (k - 1) * 0.15);   // what's left standing
      for (let k = 0; k < 26; k++) { const a = Math.random() * 6.28, d = Math.sqrt(Math.random()) * 1.8; WX(k % 3 ? GEO.blob0 : GEO.ubox, k % 3 ? MAT.concrete : brick, -24.5 + Math.cos(a) * d, 0.1 + (1.8 - d) * 0.3 * Math.random(), -7.8 + Math.sin(a) * d * 0.8, Math.random() * 6, 0.2 + Math.random() * 0.35, 0.12 + Math.random() * 0.25, 0.2 + Math.random() * 0.3, Math.random(), Math.random()); }
      for (let k = 0; k < 4; k++) wbeam([-24.6 + k * 0.3, 0.2, -7.7], [-24.2 + k * 0.4, 1.1 + Math.random() * 0.4, -7.3 + Math.random() * 0.4], 0.016, 0.016, MAT.rust);   // rebar
      solid(-24.6, -7.9, 1.3, 0.9, 0, 1.05, 'concrete');
      for (let k = 0; k < 8; k++) WX(GEO.ubox, brick, -22.5 + Math.random() * 1.2, 0.04, -6.6 + Math.random() * 1.8, Math.random() * 6, 0.2, 0.06, 0.1, 0, 0, false);
    });
    // ---- 12. shopping carts piled up in the Quick Stop lot (one on its side, one on top) ----
    chaos(11.6, -9, () => {
      for (const [x2, z2, ry, rx, rz, y] of [[11.0, -9.6, 0.4, 0, 0, 0], [11.9, -9.3, 0.5, 0, 0, 0], [12.6, -8.4, 2.4, 0, Math.PI / 2 * 0.95, 0.3], [11.4, -8.4, -0.9, 0, 0, 0], [11.6, -9.0, 1.2, -0.35, 0.25, 0.75], [10.4, -8.3, 2.0, 0, -Math.PI / 2 * 0.95, 0.3]]) {
        const m = new THREE.Mesh(K.cartFrame, MAT.chrome), b = new THREE.Mesh(K.cartBasket, MAT.chainlink), h = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.04, 0.04), K.handle);
        h.position.set(0, 0.98, 0.5); b.add(h); m.add(b); m.position.set(x2, y, z2); m.rotation.set(rx, ry, rz, 'YXZ'); m.castShadow = true; level.add(m);
        // one solid per cart (a cart on its side is a low wide one), so you can walk the gaps in the pile
        const side = Math.abs(rz) > 1;
        solid(x2, z2, side ? 0.5 : 0.3, 0.5, ry, side ? 0.65 : 1.05 + y, 'metal');
      }
    });
    // ---- 13. a sinkhole in Main St: the asphalt broken in round the edge, a pit with water in the bottom, cones and tape ----
    chaos(30, 1.2, () => {
      const C0 = [30, 1.2], R = 1.6;
      // (the road can't be cut, so the pit is a dark well painted on it, its broken lip of asphalt standing proud)
      WX(new THREE.CircleGeometry(R + 0.25, 28).rotateX(-Math.PI / 2), K.hole, C0[0], 0.035, C0[1], 0, 1, 1, 1, 0, 0, false);
      for (let k = 0; k < 11; k++) { const a = k / 11 * 6.28 + Math.random() * 0.2; WX(GEO.ubox, MAT.road, C0[0] + Math.cos(a) * (R + 0.15), 0.04, C0[1] + Math.sin(a) * (R + 0.15), -a, 0.22, 0.09, 0.55 + Math.random() * 0.4, 0, 0.35 + Math.random() * 0.3); }
      for (let k = 0; k < 8; k++) { const a = Math.random() * 6.28, d = R + 0.5 + Math.random() * 0.8; WX(GEO.blob0, MAT.road, C0[0] + Math.cos(a) * d, 0.03, C0[1] + Math.sin(a) * d, Math.random() * 6, 0.12 + Math.random() * 0.12, 0.05, 0.12 + Math.random() * 0.15, 0, 0, false); }
      const cs = [];
      for (let k = 0; k < 7; k++) { const a = k / 7 * 6.28 + 0.2, p2 = [C0[0] + Math.cos(a) * 2.5, C0[1] + Math.sin(a) * 2.5]; cone(p2[0], p2[1], false, true); cs.push(p2); }
      for (let k = 0; k < cs.length; k++) { const a = cs[k], b = cs[(k + 1) % cs.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); WX(new THREE.PlaneGeometry(1, 0.08), K.tape, (a[0] + b[0]) / 2, 0.62, (a[1] + b[1]) / 2, Math.atan2(-(b[1] - a[1]), b[0] - a[0]), L, 1, 1, 0, 0, false); }
      for (const ry of [0, Math.PI / 4]) solid(C0[0], C0[1], 1.75, 1.75, ry, 0.75, 'dirt');   // two squares at 45 degrees: a round-ish pit, no invisible corners out past the cones
    });
    // ---- 14. a streetlight knocked flat across Maple Ave, its head smashed on the road ----
    chaos(-1.5, 22, () => {
      const B0 = [-4.6, 20], dir = [0.83, 0.56], Lp = 5.5;
      inst(GEO.lampBase, MAT.concrete, mat4(B0[0], 0, B0[1]));
      WX(new THREE.CylinderGeometry(0.1, 0.11, 0.6, 12), MAT.metal, B0[0], 0.55, B0[1], 0, 1, 1, 1, 0.15, 0.1);
      const E2 = [B0[0] + dir[0] * Lp, B0[1] + dir[1] * Lp];
      wbeam([B0[0] + dir[0] * 0.4, 0.12, B0[1] + dir[1] * 0.4], [E2[0], 0.09, E2[1]], 0.15, 0.15, MAT.metal);
      inst(GEO.lampHead, MAT.metal, mat4(E2[0] + dir[0] * 0.5, 0.15, E2[1] + dir[1] * 0.5, Math.atan2(dir[0], dir[1]), 1, 1, 1, 0, Math.PI / 2 * 0.9));
      for (let k = 0; k < 14; k++) WX(GEO.uplane, MAT.glass, E2[0] + 0.6 + (Math.random() - 0.5) * 1.6, 0.03, E2[1] + 0.4 + (Math.random() - 0.5) * 1.6, Math.random() * 6, 0.06, 0.06, 1, -Math.PI / 2, 0, false);
      solid(B0[0] + dir[0] * Lp * 0.55, B0[1] + dir[1] * Lp * 0.55, 0.14, Lp * 0.5, Math.atan2(dir[0], dir[1]), 0.25, 'metal', 0, { vault: true });
      solid(B0[0], B0[1], 0.2, 0.2, 0, 0.8, 'metal');
    });
    // ---- 15. the Quick Stop's dumpster tipped over behind the store, trash spilled out ----
    chaos(14.5, -24.6, () => {
      towerKit();
      WX(GEO.ubox, MAT.dumpster, 14.5, 0.6, -24.8, 0.15, 1.9, 1.2, 1.15, 0, 0);
      WX(GEO.ubox, MAT.rubber, 14.45, 0.62, -24.15, 0.15, 1.85, 1.1, 0.04, 0.55, 0);   // the lid hanging open
      for (let k = 0; k < 9; k++) { const s3 = 0.7 + Math.random() * 0.5; inst(GEO.bag, MAT.trashBag, mat4(13.6 + Math.random() * 2.4, 0, -23.7 + Math.random() * 1.6, Math.random() * 6, s3, s3, s3)); }
      for (let k = 0; k < 6; k++) WX(GEO.ubox, AK.card, 13.5 + Math.random() * 2.6, 0.03, -23.4 + Math.random() * 1.5, Math.random() * 6, 0.5, 0.03, 0.4, 0, 0, false);
      solid(14.5, -24.8, 1.0, 0.65, 0.15, 1.25, 'metal');
    });
  }
  // more trees: big old ones along the green strip behind the back fences
  function moreTrees() {
    let sd = 71; const r = () => ((sd = (sd * 9301 + 49297) % 233280) / 233280);
    for (const zs of [-1, 1]) for (let x2 = -98; x2 <= 98; x2 += 9 + r() * 6) { if (Math.abs(x2) < 36) continue; const z2 = zs * (34.5 + r() * 3); if (W.boxes.some(b => Math.abs(b.x - x2) < b.r + 1.5 && Math.abs(b.z - z2) < b.r + 1.5)) continue; tree(x2, z2, 1.0 + r() * 0.45, r() < 0.5 ? 0 : 1); }
  }
  // ---------------- store stock: rows of real things on the shelves ----------------
  const PROD = {};
  function prodKit() {
    if (PROD.can) return PROD;
    const lid = new THREE.MeshStandardMaterial({ color: 0xc8c8c4, roughness: 0.3, metalness: 0.9 });
    PROD.canG = new THREE.CylinderGeometry(0.037, 0.037, 0.115, 16).translate(0, 0.0575, 0);
    PROD.can = [0, 1, 2, 3, 4, 5, 6, 7].map(i => [new THREE.MeshStandardMaterial({ map: TX.productTexture('can', i), roughness: 0.4, metalness: 0.25 }), lid, lid]);
    PROD.boxG = new THREE.BoxGeometry(0.19, 0.28, 0.065).translate(0, 0.14, 0);
    PROD.box = [0, 1, 2, 3, 4, 5, 6, 7].map(i => { const t = TX.productTexture('box', i), lab = new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 }), side = new THREE.MeshStandardMaterial({ color: new THREE.Color().setStyle(['#f0c020', '#e8d8a0', '#8a3a10', '#2a7ad0', '#6a4a2a', '#3a1a10', '#e8e0c8', '#2a5ad0'][i]), roughness: 0.7 }); return [side, side, side, side, lab, lab]; });
    PROD.chipsG = new RoundedBoxGeometry(0.17, 0.25, 0.075, 3, 0.03).translate(0, 0.125, 0);
    PROD.chips = [0, 1, 2, 3, 4].map(i => { const lab = new THREE.MeshStandardMaterial({ map: TX.productTexture('chips', i), roughness: 0.25, metalness: 0.35 }); return [lab, lab, lab, lab, lab, lab]; });
    PROD.lidG = new THREE.CylinderGeometry(0.047, 0.047, 0.022, 14).translate(0, 0.151, 0);
    // pharmacy: little printed packs and amber pill bottles
    PROD.medG = new THREE.BoxGeometry(0.14, 0.09, 0.05).translate(0, 0.045, 0);
    PROD.med = [['ASPIRIN', '#f4f4f0', '#c01818'], ['BANDAGES', '#f4f4f0', '#1a5aa0'], ['COLD & FLU', '#2a5aa0', '#f4f4f0'], ['IBUPROFEN', '#f0a020', '#ffffff']].map(([n, bg, fg]) => { const lab = new THREE.MeshStandardMaterial({ map: fitLab([n], bg, fg, 256, 128, 'bold 40px Helvetica'), roughness: 0.6 }), side = new THREE.MeshStandardMaterial({ color: bg, roughness: 0.6 }); return [side, side, side, side, lab, lab]; });
    PROD.pillG = (() => { const g = new THREE.CylinderGeometry(0.028, 0.028, 0.085, 12).translate(0, 0.0425, 0); return g; })();
    PROD.pill = new THREE.MeshStandardMaterial({ color: 0xa8641c, roughness: 0.2, metalness: 0.05, transparent: true, opacity: 0.88 });
    // drinks: the bottle, a printed label wrapped round it and a coloured cap, one geometry (three groups) per brand
    { const strip = g => { g = g.index ? g.toNonIndexed() : g.clone(); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); return g; };
      PROD.bottleG = mergeGeometries([strip(GEO.bottle), strip(new THREE.CylinderGeometry(0.0412, 0.0412, 0.085, 16, 1, true).translate(0, 0.1, 0)), strip(new THREE.CylinderGeometry(0.0165, 0.0165, 0.022, 10).translate(0, 0.268, 0))], true);
      PROD.bottle = TX.BOTTLE_BRANDS.map((bb, i) => [new THREE.MeshStandardMaterial({ color: new THREE.Color(bb.liquid).lerp(new THREE.Color(0xd8e4ea), (1 - bb.opacity) * 0.8), roughness: 0.08, metalness: 0.1, envMapIntensity: 1.3 }), new THREE.MeshStandardMaterial({ map: TX.productTexture('bottle', i), roughness: 0.35 }), new THREE.MeshStandardMaterial({ color: bb.cap, roughness: 0.4 })]); }
    PROD.lidM = [new THREE.MeshStandardMaterial({ color: 0xb01818, roughness: 0.4, metalness: 0.6 }), new THREE.MeshStandardMaterial({ color: 0x1a5a1a, roughness: 0.4, metalness: 0.6 }), new THREE.MeshStandardMaterial({ color: 0xd8c040, roughness: 0.4, metalness: 0.6 })];
    return PROD;
  }
  let storeP = null, storeYaw = 0, storeRefs = null, grillE = null, coolerDoors = null;
  const RB2 = (w, h, d, rad = 0.04) => { const k = 'rb' + [w, h, d, rad].map(v => v.toFixed(3)).join(); if (!FURN.has(k)) FURN.set(k, new RoundedBoxGeometry(w, h, d, 2, Math.min(rad, w / 2.05, h / 2.05, d / 2.05))); return FURN.get(k); };
  function productRows(lx, sd) {
    const K = prodKit(), P = storeP, yaw = storeYaw;
    const cats = ['can', 'box', 'chips', 'jar', 'bottle'];
    for (let tier = 0; tier < 4; tier++) {
      const ty = 0.18 + tier * 0.42;
      for (let sec = 0; sec < 4; sec++) {
        const cat = cats[(Math.floor(Math.abs(lx) * 7) + tier * 3 + sec + (sd > 0 ? 2 : 0)) % cats.length], brand = Math.floor(Math.random() * 8);
        const w = cat === 'can' ? 0.082 : cat === 'box' ? 0.2 : cat === 'chips' ? 0.18 : cat === 'jar' ? 0.1 : 0.09;
        const z0 = -3.35 + sec * 1.27, z1 = z0 + 1.22;
        for (let z = z0 + w / 2; z < z1; z += w + 0.008) {
          for (const row of [0.36, 0.22]) {
            if (Math.random() < (row > 0.3 ? 0.13 : 0.05)) continue;   // a few gaps where things sold
            // leave room for the things you can actually pick up
            if (row > 0.3 && (tier === 1 || tier === 2) && [-1.6, -1.1, -0.6, -0.1].some(m => Math.abs(z - m) < 0.12)) continue;
            const [x, zz] = P(lx + sd * row, z), ry = yaw + sd * Math.PI / 2 + (Math.random() - 0.5) * 0.08;
            let ref = null;
            // (the top tier has only 0.22 m under the cap: low stock there, no stacking)
            const ct = tier === 3 && (cat === 'box' || cat === 'bottle' || cat === 'chips') ? 'can' : cat;
            if (ct === 'can') { const mats = K.can[brand % 8]; ref = inst(K.canG, mats, mat4(x, ty, zz, ry)); if (tier < 3 && Math.random() < 0.75 && ref) ref.top = inst(K.canG, mats, mat4(x, ty + 0.116, zz, ry + 0.3)); }
            else if (ct === 'box') ref = inst(K.boxG, K.box[brand % 8], mat4(x, ty, zz, ry));
            else if (ct === 'chips') ref = inst(K.chipsG, K.chips[brand % 5], mat4(x, ty, zz, ry, 1, 1, 1, (Math.random() - 0.5) * 0.12));
            else if (ct === 'jar') { ref = inst(GEO.jar, MAT.jarGlass, mat4(x, ty, zz, ry)); ref.top = inst(K.lidG, K.lidM[brand % 3], mat4(x, ty, zz, ry)); }
            else ref = inst(K.bottleG, K.bottle[brand % K.bottle.length], mat4(x, ty, zz, ry, 1.1, 1.1, 1.1));
            if (ref && row > 0.3 && storeRefs) storeRefs.push(ref);
          }
        }
      }
    }
  }

  // ---------------- the QUICK STOP (corner store) ----------------
  function store(x, z, yaw) {
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    const P = (lx, lz) => [x + lx * c + lz * sn, z - lx * sn + lz * c];
    const Wd = 16, Dp = 12, WH = 3.6, T = 0.25;
    storeP = P; storeYaw = yaw; storeRefs = [];
    const SX = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));
    const sm = (geo, mat, lx, ly, lz, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0, shadow = true) => xadd(geo, mat, SX.clone().multiply(mat4(lx, ly, lz, ry, sx, sy, sz, rx, rz)), shadow);
    const sbox = (x0, y0, z0, x1, y1, z1, mat, shadow = true) => sm(GEO.ubox, mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, 0, x1 - x0, y1 - y0, z1 - z0, 0, 0, shadow);
    paved.push(rectOf(x, z + 2, 12, 12, yaw));
    // two entrances off the street across the sidewalk
    for (const ex of [-5.5, 5.5]) { const [cx3, cz3] = P(ex, 12); curbCut(cx3, cz3, 2.2); }
    B.box(...P(0, 0).slice(0, 1), 0, P(0, 0)[1], Wd / 2, 0.03, Dp / 2, yaw, f => f === 'top' ? 'floorTile' : null, TILE);
    B.box(P(0, 9)[0], 0, P(0, 9)[1], 10, 0.025, 3, yaw, f => f === 'top' ? 'drive' : null, TILE);   // the forecourt
    const wallB = (lx0, lz0, lx1, lz1, mat = 'brick') => { const L = Math.hypot(lx1 - lx0, lz1 - lz0), [cx, cz] = P((lx0 + lx1) / 2, (lz0 + lz1) / 2), wy = yaw + Math.atan2(-(lz1 - lz0), lx1 - lx0); block(cx, 0, cz, L / 2, WH, T / 2, wy, mat, 'brick'); };
    wallB(-Wd / 2, -Dp / 2, Wd / 2, -Dp / 2); wallB(-Wd / 2, -Dp / 2, -Wd / 2, Dp / 2); wallB(Wd / 2, -Dp / 2, Wd / 2, Dp / 2);
    // the glass front with a door gap in the middle
    for (const [a, b] of [[-Wd / 2, -0.8], [0.8, Wd / 2]]) {
      const [cx, cz] = P((a + b) / 2, Dp / 2), L = b - a;
      B.box(cx, 0, cz, L / 2, 0.6, T / 2, yaw, ALL('brick'), TILE);
      B.box(cx, 0.6, cz, L / 2, 2.6, 0.02, yaw, f => f === 'pz' || f === 'nz' ? 'shopGlass' : null, TILE);
      B.box(cx, 2.6, cz, L / 2, WH, T / 2, yaw, ALL('brick'), TILE);
      solid(cx, cz, L / 2, T / 2, yaw, WH, 'glass', 0, { window: true });
      // brushed aluminium storefront framing: a sill rail, a head rail, mullions every ~1.8 m
      sbox(a, 0.6, Dp / 2 - 0.05, b, 0.68, Dp / 2 + 0.05, MAT.alu); sbox(a, 2.52, Dp / 2 - 0.05, b, 2.6, Dp / 2 + 0.05, MAT.alu);
      const n = Math.round(L / 1.8); for (let k = 0; k <= n; k++) { const mx = a + L * k / n; sbox(mx - 0.03, 0.68, Dp / 2 - 0.05, mx + 0.03, 2.52, Dp / 2 + 0.05, MAT.alu); }
    }
    { const [cx, cz] = P(0, Dp / 2); B.box(cx, 2.6, cz, 0.8, WH, T / 2, yaw, ALL('brick'), TILE); solid(cx, cz, 0.8, T / 2, yaw, WH, 'brick', 2.6, { noWalk: true });
      // a transom over the doors, and the pair of glass doors themselves (they swing out, like shop doors do)
      sbox(-0.8, 2.2, Dp / 2 - 0.05, 0.8, 2.26, Dp / 2 + 0.05, MAT.alu); sm(GEO.ubox, MAT.shopGlass, 0, 2.43, Dp / 2, 0, 1.6, 0.34, 0.01, 0, 0, false);
      for (const sx of [-1, 1]) sbox(sx * 0.8 - 0.03, 0, Dp / 2 - 0.05, sx * 0.8 + 0.03, 2.6, Dp / 2 + 0.05, MAT.alu);
      const sticker = (txt, bg, fg, w2, h2) => new THREE.Mesh(new THREE.PlaneGeometry(w2, h2), new THREE.MeshStandardMaterial({ map: fitLab(txt, bg, fg, 256, Math.round(256 * h2 / w2), 'bold 44px Helvetica'), roughness: 0.6 }));
      for (const sx of [-1, 1]) {
        const [hx3, hz3] = P(sx * 0.77, Dp / 2), D = door(hx3, hz3, sx < 0 ? yaw : yaw + Math.PI, sx < 0 ? -1 : 1, 0, null, { w: 0.77, glassDoor: true, hp: 60 });
        const out = sx < 0 ? 1 : -1;   // which side of this leaf is the street
        const pl = sticker(['PULL'], '#f4f2ea', '#1a1a1a', 0.2, 0.07); pl.position.set(0.385, 1.15, out * 0.03); pl.rotation.y = out > 0 ? 0 : Math.PI; D.pivot.add(pl);
        const pu = sticker(['PUSH'], '#f4f2ea', '#1a1a1a', 0.2, 0.07); pu.position.set(0.385, 1.15, -out * 0.03); pu.rotation.y = out > 0 ? Math.PI : 0; D.pivot.add(pu);
        if (sx < 0) { const hr = sticker(['QUICK STOP', 'OPEN 7 DAYS', '6AM - 11PM'], '#1a1a1a', '#f0e8d0', 0.22, 0.16); hr.position.set(0.5, 1.5, out * 0.006); D.pivot.add(hr); }
      }
    }
    // flat roof (hidden from inside) and the sign
    const rg = new THREE.Group(); level.add(rg);
    { const roof = new THREE.Mesh(new THREE.BoxGeometry(Wd + 0.6, 0.3, Dp + 0.6), MAT.concrete); const [cx, cz] = P(0, 0); roof.position.set(cx, WH + 0.15, cz); roof.rotation.y = yaw; roof.castShadow = true; rg.add(roof); }
    { // the sign: lettering on the front face only, dark metal round the edges and back; lit at night
      const lab = new THREE.MeshStandardMaterial({ map: fitLab(['QUICK STOP'], '#b8241c', '#ffffff', 1024, 128, 'bold 92px Helvetica'), roughness: 0.5, emissive: 0xffffff, emissiveMap: null, emissiveIntensity: 0.25 });
      lab.emissiveMap = lab.map; W.storeSign = lab;
      const sign = new THREE.Mesh(new THREE.BoxGeometry(9, 1.2, 0.2), [MAT.darkMetal, MAT.darkMetal, MAT.darkMetal, MAT.darkMetal, lab, MAT.darkMetal]); const [cx, cz] = P(0, Dp / 2 + 0.26); sign.position.set(cx, WH + 0.5, cz); /* in front of the parapet coping: no z-fight */ sign.rotation.y = yaw; sign.castShadow = true; rg.add(sign);
      // a parapet coping round the roof edge, a rooftop AC unit
      for (const [w2, d2, ox, oz] of [[Wd + 0.6, 0.3, 0, Dp / 2 + 0.15], [Wd + 0.6, 0.3, 0, -Dp / 2 - 0.15], [0.3, Dp + 0.6, Wd / 2 + 0.15, 0], [0.3, Dp + 0.6, -Wd / 2 - 0.15, 0]]) { const cp = new THREE.Mesh(new THREE.BoxGeometry(w2, 0.35, d2), MAT.concrete); const [px4, pz4] = P(ox, oz); cp.position.set(px4, WH + 0.45, pz4); cp.rotation.y = yaw; cp.castShadow = true; rg.add(cp); }
      const ac = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 1.0), MAT.appliance); const [ax4, az4] = P(4, -2.5); ac.position.set(ax4, WH + 0.75, az4); ac.rotation.y = yaw; ac.castShadow = true; rg.add(ac);
      const fan = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.05, 18), MAT.darkMetal); fan.position.set(ax4, WH + 1.22, az4); rg.add(fan);
    }
    // a drop ceiling of 600 mm tiles (a slab: its top casts the shadow)
    B.box(x, WH - 0.12, z, Wd / 2, WH - 0.02, Dp / 2, yaw, f => f === 'bot' ? 'ceilTile' : f === 'top' ? 'shadowOnly' : null, TILE);
    W.houses.push({ id: houseN++, x, z, yaw, flip: 1, hw: Wd / 2, hd: Dp / 2, name: 'QUICK STOP', roof: rg, rooms: [[-Wd / 2, -Dp / 2, Wd / 2, Dp / 2, 'tile']], inside: [P(-2.25, 1.0), P(2.25, -2.0), P(6.4, -3.0), P(-6.4, -3.2)], store: true });
    W.boxes.push({ x, z, hx: Wd / 2, hz: Dp / 2, yaw, c, s: sn, y0: WH, y1: WH + 0.3, mat: 'concrete', r: Math.hypot(Wd, Dp) / 2, noWalk: true });
    // aisles of shelves
    for (const lx of [-4.5, 0, 4.5]) {
      const [cx, cz] = P(lx, -0.8);
      inst(aoGeo, aoMat, mat4(cx, 0.035, cz, yaw, 1.9, 1, 6.6), false);   // dark on the floor round its foot
      solid(cx, cz, 0.45, 2.6, yaw, 1.7, 'metal');   // open shelving: a back panel, end posts, a plinth and the shelf boards
      B.box(cx, 0, cz, 0.05, 1.7, 2.6, yaw, ALL('shelfMetal'), TILE); B.box(cx, 0, cz, 0.45, 0.15, 2.6, yaw, ALL('shelfMetal'), TILE); B.box(cx, 1.66, cz, 0.45, 1.7, 2.6, yaw, ALL('shelfMetal'), TILE);
      for (const e of [-2.58, 2.58]) { const [ex, ez] = P(lx, -0.8 + e); B.box(ex, 0, ez, 0.45, 1.7, 0.02, yaw, ALL('shelfMetal'), TILE); }
      for (let k = 0; k < 4; k++) B.box(cx, 0.15 + k * 0.42, cz, 0.47, 0.18 + k * 0.42, 2.62, yaw, ALL('darkMetal'), TILE);
      for (const sd of [-1, 1]) productRows(lx, sd);
      // price strips along every shelf edge
      for (const sd of [-1, 1]) for (let k = 0; k < 4; k++) { const [ex, ez] = P(lx + sd * 0.48, -0.8); B.box(ex, 0.145 + k * 0.42, ez, 0.008, 0.185 + k * 0.42, 2.6, yaw, ALL('white'), TILE); }
      for (const sd of [-1, 1]) {
        const sc = container('store', ...P(lx + sd * 0.75, -0.8), 1.0, 'Store shelf', yaw), sp = [];
        for (const ty of [0.6, 1.02]) for (let q = 0; q < 4; q++) { const [ix, iz] = P(lx + sd * 0.33, -1.6 + q * 0.5); sp.push([['can', 'box', 'box', 'can', 'bottle'][Math.floor(Math.random() * 5)], ix, ty, iz, yaw + sd * Math.PI / 2 + (Math.random() - 0.5) * 0.08]); }
        addItems(sc, sp, 'store');
      }
    }
    // drinks coolers along the back, the counter by the door
    { // the drinks coolers: rows of bottles behind glass doors (the two you can open are the ones you search)
      const SG = new THREE.Group(); SG.position.set(x, 0, z); SG.rotation.y = yaw; level.add(SG);
      const fz = -Dp / 2 + 0.9, coolerB = [], K3 = prodKit();   // the bottles: a run of each brand, labels on
      const [cx, cz] = P(0, -Dp / 2 + 0.5); solid(cx, cz, 6, 0.4, yaw, 2.2, 'metal');
      { const [bx3, bz3] = P(0, -Dp / 2 + 0.13); B.box(bx3, 0, bz3, 6, 2.2, 0.03, yaw, ALL('darkMetal'), TILE); }      // the back
      B.box(cx, 0, cz, 6, 0.3, 0.4, yaw, ALL('appliance'), TILE);                                                // the kick plate
      B.box(cx, 2.0, cz, 6, 2.45, 0.42, yaw, ALL('appliance'), TILE);                                            // the header
      for (const e of [-6, 6]) { const [ex, ez] = P(e, -Dp / 2 + 0.5); B.box(ex, 0, ez, 0.03, 2.45, 0.42, yaw, ALL('appliance'), TILE); }
      for (let k = 1; k < 6; k++) { const [mx, mz] = P(-6 + k * 2, -Dp / 2 + 0.5); B.box(mx, 0.3, mz, 0.025, 2.0, 0.4, yaw, ALL('darkMetal'), TILE); }
      // the light strip inside, and the sign on top
      { const strip = new THREE.Mesh(new THREE.PlaneGeometry(11.8, 0.12).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xeaf4ff, emissiveIntensity: 2.2 })); const [lx2, lz2] = P(0, -Dp / 2 + 0.75); strip.position.set(lx2, 1.985, lz2); strip.rotation.y = yaw; level.add(strip);
        const sg2 = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.36), new THREE.MeshStandardMaterial({ map: fitLab(['ICE COLD DRINKS'], '#1a3a7a', '#f4f8ff', 1024, 115, 'bold 80px Helvetica'), emissive: 0x203050, emissiveIntensity: 0.6, roughness: 0.4 })); const [sx3, sz3] = P(0, -Dp / 2 + 0.93); sg2.position.set(sx3, 2.23, sz3); sg2.rotation.y = yaw; level.add(sg2); }
      for (const y of [0.35, 0.82, 1.29, 1.76]) { B.box(...P(0, fz - 0.17).slice(0, 1), y - 0.02, P(0, fz - 0.17)[1], 6, y, 0.17, yaw, ALL('shelfMetal'), TILE); for (let k = 0; k < 40; k++) { const lx3 = -5.85 + k * 0.3, [bx2, bz2] = P(lx3, fz - 0.12 - Math.random() * 0.1); if (Math.random() < 0.3) continue; const ref = inst(K3.bottleG, K3.bottle[Math.floor(k / 4) % K3.bottle.length], mat4(bx2, y, bz2, Math.random() * 6, 1.15, 1.15, 1.15)); if (y > 0.5 && y < 1.5 && (Math.abs(lx3 + 3) < 0.95 || Math.abs(lx3 - 3) < 0.95)) coolerB.push([lx3, propItem(ref, 'bottle')]); else if (storeRefs && Math.random() < 0.5) storeRefs.push(ref); } }
      const gd = new THREE.MeshStandardMaterial({ color: 0x8ab0c0, roughness: 0.03, metalness: 0.4, transparent: true, opacity: 0.22, depthWrite: false });
      const doors = {};
      for (let k = 0; k < 12; k++) {
        const hx2 = -6 + k * 1.0 + (k % 2 ? 1.0 : 0), dir = k % 2 ? -1 : 1;
        const piv = new THREE.Group(); piv.position.set(hx2, 0.1, fz + 0.02); SG.add(piv);
        const fr = new THREE.Mesh(new THREE.BoxGeometry(0.98, 2.0, 0.04), MAT.darkMetal); fr.position.set(dir * 0.49, 1.0, 0); piv.add(fr);
        const gl = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 1.86), gd); gl.position.set(dir * 0.49, 1.0, 0.022); gl.renderOrder = 3; piv.add(gl);
        const gl2 = gl.clone(); gl2.position.z = -0.022; gl2.rotation.y = Math.PI; piv.add(gl2);
        fr.material = MAT.darkMetal; fr.scale.set(1, 1, 1);
        // only the frame edges are solid metal: hollow it out by drawing the frame as four bars
        piv.remove(fr);
        for (const [w, h, ox, oy] of [[0.98, 0.07, 0, 1.965], [0.98, 0.07, 0, 0.035], [0.06, 2.0, -0.46, 1.0], [0.06, 2.0, 0.46, 1.0]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04), MAT.darkMetal); b.position.set(dir * 0.49 + ox, oy, 0); piv.add(b); }
        const hd = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.5, 0.04), MAT.metal); hd.position.set(dir * 0.9, 1.0, 0.04); piv.add(hd);
        doors[k] = { o: piv, kind: 'hinge', a: -dir * 1.6, dir };
      }
      coolerDoors = doors;
      const stF = (lx2) => { const [ax, az] = P(lx2, fz + 0.95), [bx2, bz2] = P(lx2, fz); return { x: ax, z: az, yaw: Math.atan2(bx2 - ax, bz2 - az) }; };
      container('cooler', ...P(-3, fz + 0.5), 1.2, 'Drinks cooler', yaw, null, { parts: [doors[2], doors[3]], stand: stF(-3), items: coolerB.filter(b => b[0] < 0).map(b => b[1]) });
      container('cooler', ...P(3, fz + 0.5), 1.2, 'Drinks cooler', yaw, null, { parts: [doors[8], doors[9]], stand: stF(3), items: coolerB.filter(b => b[0] > 0).map(b => b[1]) });
    }
    { const [cx, cz] = P(-5.8, 3.6); block(cx, 0, cz, 1.6, 1.05, 0.5, yaw, f => f === 'top' ? 'counter' : 'cabinet', 'wood');
      // the till on the counter, its cash drawer slides out
      const TG = new THREE.Group(); TG.position.set(x, 0, z); TG.rotation.y = yaw; level.add(TG);
      // the till sits on its cash drawer (the drawer front faces the cashier and slides out toward them); its screen
      // faces the cashier, a little pole display faces the customer
      sm(RB2(0.44, 0.1, 0.4, 0.01), MAT.black, -5.6, 1.1, 3.58); sm(RB2(0.4, 0.12, 0.34, 0.02), MAT.black, -5.6, 1.21, 3.62);
      sm(GEO.ubox, MAT.darkMetal, -5.6, 1.4, 3.5, Math.PI, 0.3, 0.2, 0.03, 0.4, 0); sm(GEO.ubox, MAT.screen, -5.6, 1.4, 3.483, Math.PI, 0.27, 0.17, 0.005, 0.4, 0, false);
      sm(GEO.ucyl, MAT.darkMetal, -5.25, 1.3, 3.85, 0, 0.03, 0.5, 0.03); sm(GEO.ubox, MAT.screen, -5.25, 1.58, 3.86, 0, 0.22, 0.07, 0.04, 0, 0, false);
      sm(RB2(0.08, 0.04, 0.14, 0.01), MAT.darkMetal, -5.0, 1.07, 3.95, 0.2);   // the card reader
      // impulse candy on the customer side, a cigarette and lottery rack on the wall behind
      for (let k = 0; k < 12; k++) { const K2 = prodKit(), b2 = k % 5; const [cx5, cz5] = P(-6.9 + k * 0.1, 4.2); inst(K2.chipsG, K2.chips[b2], mat4(cx5, 0.52 + (k % 3) * 0.17, cz5, yaw, 0.5, 0.5, 0.5)); }
      sbox(-7.05, 0.5, 4.1, -5.8, 0.52, 4.3, MAT.shelfMetal); sbox(-7.05, 0.67, 4.1, -5.8, 0.69, 4.3, MAT.shelfMetal); sbox(-7.05, 0.84, 4.1, -5.8, 0.86, 4.3, MAT.shelfMetal); for (const ex of [-7.05, -5.82]) sbox(ex, 0, 4.1, ex + 0.02, 0.9, 4.3, MAT.shelfMetal); sbox(-7.05, 0, 4.1, -5.8, 0.9, 4.11, MAT.shelfMetal);   // end panels and a back
      sm(GEO.ubox, MAT.cigs, -7.72, 1.75, 2.6, Math.PI / 2, 1.3, 0.7, 0.28);
      const dw = new THREE.Group(); dw.position.set(-5.6, 1.1, 3.38); TG.add(dw);
      const dfront = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.1, 0.02), MAT.black); dw.add(dfront);
      const tray = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.36), MAT.darkMetal); tray.position.set(0, -0.01, 0.19); dw.add(tray);
      const bills = []; for (let k = 0; k < 4; k++) { const bill = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.01, 0.15), MAT.greenPaint); bill.position.set(-0.15 + k * 0.1, 0.025, 0.2); dw.add(bill); bills.push(bill); }
      const [ax, az] = P(-5.6, 2.55), [bx2, bz2] = P(-5.6, 3.1);
      container('register', ...P(-5.6, 2.8), 1.0, 'Behind the counter', yaw, null, { parts: [{ o: dw, kind: 'slide', d: -0.32, knob: dfront }], stand: { x: ax, z: az, yaw: Math.atan2(bx2 - ax, bz2 - az) }, items: bills.map(b => propItem({ mesh: b }, 'cloth')) });
    }
    // fluorescent ceiling panels (and the light they give)
    // (one tube starts to flicker once the trouble starts, and one panel goes dead)
    { const pm = new THREE.MeshStandardMaterial({ map: MAT.louvre, color: 0xf4f4f0, emissive: 0xfff6e6, emissiveMap: MAT.louvre, emissiveIntensity: 1.5, roughness: 0.3 }), pg = new THREE.BoxGeometry(1.2, 0.03, 0.6);
      const fm = pm.clone(), S = W.storeLights = { flickMat: fm, lights: [], ph: 0, dead: null, chaos: null };
      for (const lx2 of [-5, 0, 5]) for (const lz2 of [-3, 0.5, 3.8]) { const [px2, pz2] = P(lx2, lz2); const pn = new THREE.Mesh(pg, lx2 === -5 && lz2 === -3 ? fm : pm); pn.position.set(px2, WH - 0.135, pz2); pn.rotation.y = yaw; level.add(pn); sbox(lx2 - 0.62, WH - 0.125, lz2 - 0.32, lx2 + 0.62, WH - 0.118, lz2 + 0.32, MAT.white, false); }
      { const [px2, pz2] = P(5, 3.8); const dd = new THREE.Mesh(pg, MAT.white); dd.position.set(px2, WH - 0.137, pz2); dd.rotation.y = yaw; dd.scale.set(1.01, 1.1, 1.01); dd.visible = false; level.add(dd); S.dead = dd; }
      for (const lx2 of [-4, 4]) { const L2 = new THREE.PointLight(0xfff2e0, 5, 13, 1.4); L2.userData.base = 5; const [px2, pz2] = P(lx2, 0); L2.position.set(px2, WH - 0.4, pz2); addLight(L2); S.lights.push(L2); }
      [S.cx, S.cz] = P(0, 0); }
    // aisle signs hanging over the shelves, a convex mirror in the back corner, a clock, a mat at the door, the rules
    { const SIGNS = ['SNACKS & CHIPS', 'CANNED GOODS', 'CEREAL · PASTA'];
      [-4.5, 0, 4.5].forEach((lx2, i) => { const sg4 = std({ map: fitLab([SIGNS[i]], '#1a4a8a', '#ffffff', 512, 96, 'bold 50px Helvetica'), roughness: 0.5 }); for (const f of [0, Math.PI]) sm(GEO.uplane, sg4, lx2 + Math.sin(f + Math.PI / 2) * 0.006, 2.55, -0.8, f + Math.PI / 2, 1.4, 0.26, 1, 0, 0, false); for (const oz of [-0.5, 0.5]) sm(GEO.ucyl, MAT.darkMetal, lx2, 3.05, -0.8 + oz, 0, 0.01, 0.84, 0.01, 0, 0, false); });
      sm(GEO.mirrorDome, MAT.mirror, 7.55, 2.7, -5.55, -Math.PI / 4, 1, 1, 1, 0.25, 0);
      sm(GEO.clock, MAT.white, 0, 2.7, -Dp / 2 + 0.17, 0, 1.3, 1.3, 1); sm(GEO.uplane, MAT.clockFace, 0, 2.7, -Dp / 2 + 0.19, 0, 0.34, 0.34, 1, 0, 0, false);
      sbox(-0.9, 0.03, Dp / 2 - 1.3, 0.9, 0.04, Dp / 2 - 0.2, MAT.rubber, false);
      sm(GEO.uplane, std({ map: fitLab(['NO SHIRT', 'NO SHOES', 'NO SERVICE'], '#f4f2ea', '#1a1a1a', 256, 192, 'bold 40px Helvetica'), roughness: 0.6 }), 1.5, 1.6, Dp / 2 - 0.03, Math.PI, 0.3, 0.22, 1, 0, 0, false);
      // the OPEN sign in the window (red neon, on all day until it isn't)
      const neon = std({ color: 0x401010, emissive: 0xff2a20, emissiveIntensity: 2.4, roughness: 0.4 }); W.storeNeon = neon;
      neon.map = neon.emissiveMap = fitLab(['OPEN'], '#000000', '#ff3a2a', 256, 96, 'bold 80px Helvetica'); neon.color.set(0xffffff); neon.emissive.set(0xffffff);
      sm(GEO.uplane, neon, 3.6, 1.85, Dp / 2 - 0.08, 0, 0.9, 0.34, 1, 0, 0, false);
    }
    // out front: an awning over the glass, parking bays and wheel stops, an ice chest, a newspaper box
    { sm(GEO.ubox, MAT.awning, 0, 2.86, Dp / 2 + 0.6, 0, Wd, 0.04, 1.25, 0.17, 0); sm(GEO.ubox, MAT.awning, 0, 2.68, Dp / 2 + 1.22, 0, Wd, 0.24, 0.02);
      for (const lx2 of [-9.5, -7, -4.5, 4.5, 7, 9.5]) { const [px5, pz5] = P(lx2, 9.2); B.box(px5, 0, pz5, 0.06, 0.03, 1.6, yaw, f => f === 'top' ? 'roadWhite' : null, TILE); }
      for (const lx2 of [-8.25, -5.75, 5.75, 8.25]) { sm(RB2(1.6, 0.12, 0.2, 0.03), MAT.concrete, lx2, 0.06, 7.9); const [wx, wz] = P(lx2, 7.9); solid(wx, wz, 0.8, 0.1, yaw, 0.12, 'concrete', 0, { vault: true }); }
      sm(RB2(1.5, 1.15, 0.75, 0.05), MAT.ice.userData.body ||= new THREE.MeshStandardMaterial({ color: 0xe8eef4, roughness: 0.45 }), -6.4, 0.6, Dp / 2 + 0.55); sm(GEO.ubox, MAT.darkMetal, -6.4, 1.0, Dp / 2 + 0.55, 0, 1.52, 0.035, 0.77); for (const sd of [-1, 1]) sm(GEO.uplane, MAT.ice, -6.4, 0.6, Dp / 2 + 0.55 + sd * 0.378, sd > 0 ? 0 : Math.PI, 1.15, 0.58, 1, 0, 0, false); solid(...P(-6.4, Dp / 2 + 0.55), 0.76, 0.4, yaw, 1.15, 'metal');
      sm(RB2(0.5, 1.0, 0.45, 0.03), MAT.bluePaint, 1.8, 0.5, Dp / 2 + 0.5); sm(GEO.uplane, std({ map: fitLab(['THE MAPLE', 'HOLLOW NEWS'], '#e8e4d8', '#1a1a1a', 256, 128, 'bold 34px Georgia'), roughness: 0.7 }), 1.8, 0.82, Dp / 2 + 0.73, 0, 0.42, 0.22, 1, 0, 0, false); solid(...P(1.8, Dp / 2 + 0.5), 0.26, 0.24, yaw, 1.0, 'metal');
    }
    // painted walls inside (the brick is outside)
    { const [bx4, bz4] = P(0, -Dp / 2 + T / 2 + 0.006); B.box(bx4, 0, bz4, Wd / 2 - 0.2, WH, 0.004, yaw, ALL('trim'), TILE);
      for (const e of [-1, 1]) { const [sx4, sz4] = P(e * (Wd / 2 - T / 2 - 0.006), 0); B.box(sx4, 0, sz4, 0.004, WH, Dp / 2 - 0.2, yaw, ALL('trim'), TILE); } }
    // Raj's grill: a stainless counter, the flat-top, burgers sizzling, buns waiting, a hood over it all
    { const [gx, gz] = P(-7.42, 0.3);
      B.box(gx, 0, gz, 0.42, 0.88, 0.95, yaw, ALL('metal'), TILE); solid(gx, gz, 0.45, 0.97, yaw, 0.95, 'metal');
      // the hot plate (front part), stainless worktop beside it, a grease trough, the knobs, a splash guard behind
      sbox(-7.82, 0.88, -0.6, -7.02, 0.92, 0.35, MAT.black); sbox(-7.82, 0.88, 0.35, -7.02, 0.92, 1.2, MAT.metal);
      sbox(-7.04, 0.84, -0.6, -6.98, 0.9, 0.35, MAT.darkMetal);
      for (let k = 0; k < 4; k++) sm(GEO.knob, MAT.black, -6.985, 0.72, -0.5 + k * 0.25, 0, 1.4, 1.4, 1.4, 0, Math.PI / 2, false);
      { const [bx5, bz5] = P(-7.82, 0.3); B.box(bx5, 0.92, bz5, 0.02, 1.45, 0.95, yaw, ALL('metal'), TILE); }
      // the hood: sloped panels open underneath, a round duct up through the ceiling
      sbox(-7.85, 2.3, -0.7, -7.05, 2.34, 1.3, MAT.metal); for (const ez of [-0.7, 1.3]) sbox(-7.85, 2.0, ez - 0.01, -7.25, 2.3, ez + 0.01, MAT.metal);
      sm(GEO.ubox, MAT.metal, -7.15, 2.15, 0.3, 0, 0.02, 0.34, 2.0, 0, -0.45);
      sm(GEO.ucyl, MAT.metal, -7.5, 2.95, 0.3, 0, 0.3, 1.3, 0.3);
      const patty = new THREE.CylinderGeometry(0.055, 0.058, 0.018, 14).translate(0, 0.009, 0), pm2 = new THREE.MeshStandardMaterial({ color: 0x4a2a18, roughness: 0.8 });
      const bun = new THREE.SphereGeometry(0.065, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 1), bm = new THREE.MeshStandardMaterial({ color: 0xc8883a, roughness: 0.6 });
      for (let i = 0; i < 6; i++) { const [px3, pz3] = P(-7.3 + (i % 2) * 0.17, -0.25 + Math.floor(i / 2) * 0.2); inst(patty, pm2, mat4(px3, 0.92, pz3, Math.random() * 6)); }
      // the buns wait on a sheet pan on the cool side
      sbox(-7.62, 0.92, 0.5, -7.18, 0.935, 0.95, MAT.metal);
      for (let i = 0; i < 4; i++) { const [px3, pz3] = P(-7.5 + (i % 2) * 0.2, 0.62 + Math.floor(i / 2) * 0.2); inst(bun, bm, mat4(px3, 0.935, pz3, Math.random() * 6)); }
      // the grill smokes while Raj is cooking — the morning — and goes cold once the trouble starts
      grillE = emitter({ x: P(-7.42, -0.1)[0], y: 1.0, z: P(-7.42, -0.1)[1], kind: 'smoke', rate: 1.2, t: 0, grill: true });
      const sg3 = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshStandardMaterial({ map: fitLab(['GRILL · BURGERS $2'], '#b01810', '#fff4e0', 1024, 256, 'bold 120px Helvetica'), roughness: 0.5, emissive: 0x200404 }));
      const [sx5, sz5] = P(-7.85, 0.3); sg3.position.set(sx5, 2.55, sz5); sg3.rotation.y = yaw + Math.PI / 2; level.add(sg3); }
    // the poster in the window
    { const po = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 1.25), new THREE.MeshStandardMaterial({ map: fitLab(['SATURDAY', 'GRILL', 'BURGERS $2', 'fresh today!'], '#f4e6b0', '#a01810', 256, 336, 'bold 46px Helvetica'), roughness: 0.8 }));
      const [px6, pz6] = P(-4.6, Dp / 2 + 0.03); po.position.set(px6, 1.55, pz6); po.rotation.y = yaw; level.add(po); }
    // a pharmacy rack
    // the pharmacy gondola along the right wall: open shelving, a pegboard of blister packs above, a sign
    { const [cx, cz] = P(7.2, 2.5); solid(cx, cz, 0.4, 1.2, yaw, 1.8, 'metal');
      sbox(7.52, 0, 1.3, 7.58, 2.0, 3.7, MAT.white); sbox(6.82, 0, 1.3, 7.52, 0.12, 3.7, MAT.white);
      for (const ez of [1.3, 3.7]) sbox(6.82, 0, ez - 0.02, 7.52, 1.5, ez + 0.02, MAT.white);
      const ph = container('pharmacy', ...P(6.6, 2.5), 1.0, 'Pharmacy shelf', yaw), pl = [], K2 = prodKit();
      for (const sy of [0.15, 0.55, 0.95, 1.35]) {
        sbox(6.84, sy - 0.02, 1.32, 7.52, sy, 3.68, MAT.white); sbox(6.82, sy - 0.05, 1.32, 6.835, sy + 0.01, 3.68, MAT.paperSheet, false);
        for (let zz = 1.4; zz < 3.62; zz += 0.075) {
          const take = sy > 0.3 && sy < 1.4 && [1.65, 2.2, 2.75, 3.3].some(m => Math.abs(zz - m) < 0.1);
          if (take || Math.random() < 0.08) continue;
          const [ix, iz] = P(7.1 + (Math.random() - 0.5) * 0.04, zz), m4 = mat4(ix, sy, iz, yaw + Math.PI / 2 + (Math.random() - 0.5) * 0.06);
          if ((Math.floor(zz * 3) + sy * 10) % 3 < 1) inst(K2.pillG, K2.pill, m4); else inst(K2.medG, K2.med[Math.floor(zz * 2 + sy * 3) % 4], m4);
        }
        if (sy > 0.3 && sy < 1.4) for (let q = 0; q < 4; q++) { const [ix, iz] = P(6.98, 1.65 + q * 0.55); pl.push([['bottle', 'box', 'jar', 'box'][q % 4], ix, sy, iz, yaw + Math.PI / 2]); }
      }
      // pegboard and blister packs on hooks
      sbox(7.5, 1.5, 1.3, 7.52, 2.0, 3.7, MAT.pegboard);
      for (let k = 0; k < 14; k++) { const zz = 1.45 + k * 0.16, yy = 1.62 + (k % 2) * 0.2; sbox(7.3, yy + 0.05, zz - 0.003, 7.5, yy + 0.058, zz + 0.003, MAT.metal, false); sm(GEO.ubox, K2.med[k % 4][4], 7.36, yy - 0.04, zz, Math.PI / 2, 0.12, 0.17, 0.015, 0, 0, false); }
      const hs = std({ map: fitLab(['PHARMACY · HEALTH'], '#1a6a3a', '#ffffff', 512, 96, 'bold 46px Helvetica'), roughness: 0.5 });
      sm(GEO.uplane, hs, 7.48, 2.2, 2.5, -Math.PI / 2, 2.0, 0.36, 1, 0, 0, false);
      addItems(ph, pl, 'med'); }
    // after the outbreak: looted. Stock knocked on the floor, gaps on the shelves, money spilled by the register,
    // LOOTED sprayed on the wall, the OPEN sign dark, the grill cold
    const SC = chaos(x, z, () => {
      W.blood(...P(-2, 3), 1.2, 0.035); W.blood(...P(3, -3), 0.7, 0.035);
      const K2 = prodKit();
      for (let i = 0; i < 34; i++) {
        const lx2 = [-6.2, -2.25, 2.25, 6.0][i % 4] + (Math.random() - 0.5) * 0.9, lz2 = -3.2 + Math.random() * 5.2, [fx2, fz2] = P(lx2, lz2), ry = Math.random() * 6.28, kk = i % 3;
        if (kk === 0) inst(K2.canG, K2.can[i % 8], mat4(fx2, 0.067, fz2, ry, 1, 1, 1, Math.PI / 2, 0));
        else if (kk === 1) inst(K2.boxG, K2.box[i % 8], mat4(fx2, 0.063, fz2, ry, 1, 1, 1, Math.PI / 2, 0));
        else inst(K2.chipsG, K2.chips[i % 5], mat4(fx2, 0.068, fz2, ry, 1, 1, 1, -Math.PI / 2, 0));
      }
      for (let i = 0; i < 9; i++) { const [bx6, bz6] = P(-5.6 + (Math.random() - 0.5) * 1.6, 2.6 + (Math.random() - 0.5) * 0.8); inst(GEO.ubox, MAT.greenPaint, mat4(bx6, 0.033, bz6, Math.random() * 6, 0.15, 0.003, 0.07), false); }
      const looted = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.4), decalMat(TX.sprayTexture(['LOOTED'], '#b01810', 81))); const [lx3, lz3] = P(-Wd / 2 - 0.14, 1); looted.position.set(lx3, 1.9, lz3); looted.rotation.y = yaw - Math.PI / 2; looted.renderOrder = 1; level.add(looted);
      const nf = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.1), decalMat(TX.sprayTexture(['NO FOOD', 'LEFT'], '#151515', 82))); const [lx4, lz4] = P(-Wd / 2 - 0.14, -3); nf.position.set(lx4, 1.6, lz4); nf.rotation.y = yaw - Math.PI / 2; nf.renderOrder = 1; level.add(nf);
    });
    // ~40% of the front row of stock gone from the shelves; the sign, the grill and the store's tubes follow the layer
    const gone = storeRefs.filter(() => Math.random() < 0.4), zeroM = new THREE.Matrix4().makeScale(0, 0, 0), grillRef = grillE, cDoors = coolerDoors;
    W.storeLights.chaos = SC;
    SC.onShow = on => {
      for (const ref of gone) for (const r2 of [ref, ref.top]) { const im = r2 && r2.L && r2.L.im; if (!im) continue; im.setMatrixAt(r2.i, on ? zeroM : r2.L.ms[r2.i]); im.instanceMatrix.needsUpdate = true; }
      if (W.storeNeon) W.storeNeon.emissiveIntensity = on ? 0 : 2.4;
      if (grillRef) grillRef.off = on;
      if (cDoors) for (const k of [0, 5]) if (cDoors[k]) cDoors[k].o.rotation.y = on ? -cDoors[k].dir * 0.9 : 0;   // coolers left hanging open
    };
    trashBin(...P(-9, 6.5), yaw); trashBin(...P(9.2, 6.5), yaw);
  }
  // ---------------- the gas station (pumps, canopy, a gas can if you're lucky) ----------------
  function gasStation(x, z, yaw) {
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    const P = (lx, lz) => [x + lx * c + lz * sn, z - lx * sn + lz * c];
    const grp = new THREE.Group(); grp.position.set(x, 0, z); grp.rotation.y = yaw; level.add(grp);   // local-space props
    const add = (geo, m, lx, ly, lz, rx = 0, ry = 0, rz = 0, shadow = true) => { const o = new THREE.Mesh(geo, m); o.position.set(lx, ly, lz); o.rotation.set(rx, ry, rz); o.castShadow = shadow; o.receiveShadow = true; grp.add(o); return o; };
    const rbx = (w, h, d, r = 0.04) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.1, h / 2.1, d / 2.1));
    { const [cx, cz] = P(0, 2); B.box(cx, 0, cz, 11, 0.025, 10, yaw, f => f === 'top' ? 'drive' : null, TILE); paved.push(rectOf(cx, cz, 11, 10, yaw)); }
    for (const ex of [-6.5, 6.5]) { const [cx3, cz3] = P(ex, 12); curbCut(cx3, cz3, 2.6); }   // in and out across the sidewalk
    { const [cx3, cz3] = P(0, 3); W.placeCanopyLight(cx3, cz3); }
    // oil stains where the cars stood
    const stain = new THREE.MeshStandardMaterial({ map: TX.bloodTexture(7), color: 0x101010, transparent: true, opacity: 0.55, depthWrite: false, roughness: 0.2, polygonOffset: true, polygonOffsetFactor: -3 });
    for (const [lx, lz] of [[-1.3, 1.8], [-1.3, 4.6], [3.7, 2.2], [3.6, 4.4], [-6, 6]]) add(new THREE.PlaneGeometry(1.4, 1.4).rotateX(-Math.PI / 2), stain, lx, 0.03, lz, 0, Math.random() * 6, 0, false);
    // ---- the canopy: clad pillars, a deep fascia with the brand stripe, light panels underneath ----
    const fascia = new THREE.MeshStandardMaterial({ map: (() => { const t = fitLab(['GAS & GO'], '#e9e6de', '#b8241c', 2048, 128, 'bold 84px Helvetica'); return t; })(), roughness: 0.5 });
    const stripe = new THREE.MeshStandardMaterial({ color: 0xb8241c, roughness: 0.45 });
    for (const [lx, lz] of [[-5, 0.5], [5, 0.5], [-5, 5.5], [5, 5.5]]) {
      add(rbx(0.55, 4.5, 0.55, 0.08), MAT.white, lx, 2.25, lz);
      add(rbx(0.8, 0.35, 0.8, 0.05), MAT.concrete, lx, 0.17, lz);
      add(new THREE.BoxGeometry(0.57, 0.15, 0.57), stripe, lx, 1.2, lz);
      solid(...P(lx, lz), 0.29, 0.29, yaw, 4.6, 'metal'); solid(...P(lx, lz), 0.4, 0.4, yaw, 0.36, 'concrete');
    }
    add(new THREE.BoxGeometry(13.2, 0.3, 9.2), MAT.white, 0, 4.65, 3);                           // the deck
    for (const [lz, w, ry] of [[3 + 4.62, 13.3, 0], [3 - 4.62, 13.3, Math.PI]]) { add(new THREE.BoxGeometry(w, 0.85, 0.08), fascia, 0, 4.95, lz, 0, ry); }
    for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.08, 0.85, 9.3), MAT.white, sx * 6.62, 4.95, 3);
    for (const [lz] of [[3 + 4.67], [3 - 4.67]]) add(new THREE.BoxGeometry(13.35, 0.14, 0.04), stripe, 0, 4.58, lz);
    const panel = new THREE.MeshStandardMaterial({ color: 0xcfd2d6, emissive: 0xfff2d8, emissiveIntensity: 0.0, roughness: 0.3 });
    W.canopyLights = panel;
    for (const lx of [-4, 0, 4]) for (const lz of [1, 5]) add(new THREE.BoxGeometry(1.4, 0.04, 0.7), panel, lx, 4.49, lz, 0, 0, 0, false);
    // ---- two pump islands: raised kerb, yellow bollards, a dispenser with hoses and nozzles ----
    const yellow = MAT.yellowPaint, pumpBody = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.4, metalness: 0.5 });
    const head = new THREE.MeshStandardMaterial({ map: fitLab(['GAS & GO', 'REGULAR · PREMIUM'], '#b8241c', '#f0ece0', 256, 128, 'bold 30px Helvetica'), roughness: 0.4 });
    const screen = new THREE.MeshStandardMaterial({ color: 0x0a1410, roughness: 0.1, metalness: 0.3, emissive: 0x031008 });
    const stickers = [], sticker = new THREE.MeshStandardMaterial({ map: fitLab(['OUT OF', 'SERVICE'], '#f2f0e8', '#a01810', 128, 128, 'bold 26px Helvetica'), roughness: 0.9 });
    const hoseMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 });
    for (const lx of [-2.5, 2.5]) {
      add(rbx(1.2, 0.22, 4.4, 0.05), MAT.concrete, lx, 0.11, 3);
      for (const lz of [0.95, 5.05]) add(rbx(1.22, 0.23, 0.18, 0.02), yellow, lx, 0.115, lz);
      for (const lz of [0.9, 5.1]) for (const ox of [-0.4, 0.4]) { add(new THREE.CylinderGeometry(0.08, 0.08, 1.0, 12), yellow, lx + ox, 0.7, lz); add(new THREE.SphereGeometry(0.08, 10, 6, 0, 6.3, 0, 1.6), yellow, lx + ox, 1.2, lz); }
      add(rbx(0.85, 1.6, 0.55, 0.06), pumpBody, lx, 1.02, 3);
      add(rbx(0.88, 0.42, 0.58, 0.05), head, lx, 2.0, 3);
      for (const sd of [-1, 1]) {
        add(new THREE.PlaneGeometry(0.42, 0.22), screen, lx, 1.55, 3 + sd * 0.281, 0, sd > 0 ? 0 : Math.PI);
        stickers.push([lx + 0.18, 3 + sd * 0.282, sd > 0 ? 0 : Math.PI]);
        for (let k = 0; k < 3; k++) {
          const nx = lx - 0.28 + k * 0.28, nz = 3 + sd * 0.33;
          add(rbx(0.07, 0.24, 0.12, 0.02), MAT.black, nx, 1.05, nz);
          add(new THREE.BoxGeometry(0.03, 0.03, 0.14), MAT.metal, nx, 1.18, nz + sd * 0.06);
          // the hose hangs down in a loop from the top of the pump to the nozzle
          const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(nx, 1.8, 3 + sd * 0.29), new THREE.Vector3(nx, 0.9, 3 + sd * 0.55), new THREE.Vector3(nx + 0.02, 0.35, 3 + sd * 0.5), new THREE.Vector3(nx, 0.7, 3 + sd * 0.36), new THREE.Vector3(nx, 1.12, nz)]);
          add(new THREE.TubeGeometry(curve, 24, 0.018, 6, false), hoseMat, 0, 0, 0);
        }
      }
      // the pump itself and the four bollards are solid; the island kerb is a step you stand on
      solid(...P(lx, 3), 0.45, 0.3, yaw, 2.25, 'metal');
      for (const lz of [0.9, 5.1]) for (const ox of [-0.4, 0.4]) solid(...P(lx + ox, lz), 0.09, 0.09, yaw, 1.25, 'metal');
      { const [ix, iz] = P(lx, 3); W.steps.push({ x: ix, z: iz, hx: 0.6, hz: 2.2, c: Math.cos(yaw), s: Math.sin(yaw), r2: 7, y: 0.22 }); }
      { const pc = container('pump', ...P(lx + 0.9, 3), 1.1, 'Gas pump', yaw); const [ox, oz] = P(lx + 0.35, 4.6), [ox2, oz2] = P(lx - 0.3, 1.5); addItems(pc, [['bottle', ox, 0.22, oz, 0, 1.3], ['can', ox2, 0.22, oz2, 0, 1.5], ['cloth', P(lx + 0.2, 1.7)[0], 0.22, P(lx + 0.2, 1.7)[1], 0, 0.6]]); }
    }
    // ---- the kiosk: brick, a glass shopfront, an awning, an ice chest and a propane cage ----
    { const [kx, kz] = P(0, -6.5); block(kx, 0, kz, 3.8, 3.1, 2.4, yaw, f => f === 'top' ? 'concrete' : f === 'pz' ? null : 'brick', 'brick');
      // the front: low wall, big windows, door
      add(new THREE.BoxGeometry(7.6, 0.6, 0.2), MAT.brick, 0, 0.3, -4.1);
      add(new THREE.BoxGeometry(7.6, 2.0, 0.04), MAT.glass, 0, 1.6, -4.1, 0, 0, 0, false);
      for (const lx of [-3.75, -1.3, -0.5, 1.3, 3.75]) add(new THREE.BoxGeometry(0.1, 2.0, 0.12), MAT.darkMetal, lx, 1.6, -4.1);
      add(new THREE.BoxGeometry(7.7, 0.12, 0.14), MAT.darkMetal, 0, 2.62, -4.1); add(new THREE.BoxGeometry(7.6, 0.5, 0.2), MAT.brick, 0, 2.85, -4.1);
      add(new THREE.BoxGeometry(8.2, 0.12, 1.4), MAT.darkMetal, 0, 3.15, -3.5);
      const sgn = new THREE.MeshStandardMaterial({ map: fitLab(['GAS & GO MARKET'], '#b8241c', '#f4eee0', 1024, 128, 'bold 72px Helvetica'), roughness: 0.5, emissive: 0x200404 });
      add(new THREE.BoxGeometry(5.2, 0.6, 0.1), sgn, 0, 3.55, -4.0);
      // shelves seen through the glass
      // inside it's a real little shop: a tiled floor, painted walls, a tile ceiling (not the backs of the outside walls)
      { const IN = (lx, lz, hx, y0, y1, hz, f) => { const [ix, iz] = P(lx, lz); B.box(ix, y0, iz, hx, y1, hz, yaw, f, TILE); };
        IN(0, -6.5, 3.78, 0, 0.02, 2.38, f => f === 'top' ? 'floorTile' : null);
        IN(0, -6.5, 3.78, 2.58, 2.6, 2.38, f => f === 'bot' ? 'ceilTile' : null);
        IN(0, -8.86, 3.78, 0, 2.6, 0.02, f => f === 'pz' ? 'paint1' : null);
        IN(-3.76, -6.5, 0.02, 0, 2.6, 2.38, f => f === 'px' ? 'paint1' : null);
        IN(3.76, -6.5, 0.02, 0, 2.6, 2.38, f => f === 'nx' ? 'paint1' : null); }
      // three stocked gondola shelves seen through the glass (uprights, a back panel, four boards of goods)
      { const K = prodKit(), cats = ['can', 'box', 'chips', 'bottle'];
        for (const [si, lx] of [-2.2, 0.0, 2.2].entries()) {
          add(new THREE.BoxGeometry(1.4, 1.62, 0.03), MAT.shelfMetal, lx, 0.81, -6.71);
          for (const ox of [-0.69, 0.69]) add(new THREE.BoxGeometry(0.03, 1.62, 0.45), MAT.shelfMetal, lx + ox, 0.81, -6.5);
          add(new THREE.BoxGeometry(1.4, 0.1, 0.45), MAT.darkMetal, lx, 0.05, -6.5);
          [0.1, 0.52, 0.94, 1.36].forEach((by, tier) => {
            add(new THREE.BoxGeometry(1.36, 0.025, 0.44), MAT.shelfMetal, lx, by, -6.5, 0, 0, 0, false);
            const cat = cats[(si + tier) % cats.length], w = cat === 'can' ? 0.085 : cat === 'box' ? 0.205 : cat === 'chips' ? 0.185 : 0.095, brand = (si * 3 + tier * 5) % 8;
            for (let ox = -0.64 + w / 2; ox < 0.64 - w / 2; ox += w + 0.01) for (const dz of [-0.34, -0.18]) {
              if (Math.random() < 0.12) continue;
              const [ix, iz] = P(lx + ox, -6.5 + 0.22 + dz + 0.16), y2 = by + 0.0125, ry = yaw + (Math.random() - 0.5) * 0.08;
              if (cat === 'can') inst(K.canG, K.can[brand % 8], mat4(ix, y2, iz, ry));
              else if (cat === 'box') inst(K.boxG, K.box[brand % 8], mat4(ix, y2, iz, ry));
              else if (cat === 'chips') inst(K.chipsG, K.chips[brand % 5], mat4(ix, y2, iz, ry));
              else inst(K.bottleG, K.bottle[brand % K.bottle.length], mat4(ix, y2, iz, ry, 1.1, 1.1, 1.1));
            }
          });
        }
        // the till counter by the right-hand wall: a wood-front cabinet, a worktop, the register, cigarettes behind
        add(rbx(0.62, 0.95, 1.5, 0.03), MAT.cabinet, 3.25, 0.475, -5.6);
        add(rbx(0.7, 0.05, 1.58, 0.02), MAT.counter, 3.25, 0.975, -5.6);
        add(rbx(0.34, 0.2, 0.3, 0.03), MAT.black, 3.2, 1.1, -5.9); add(new THREE.BoxGeometry(0.22, 0.14, 0.02), MAT.darkMetal, 3.2, 1.27, -5.98, -0.3, 0, 0, false);
        add(new THREE.PlaneGeometry(1.4, 0.7), MAT.cigs, 3.74, 1.75, -5.6, 0, -Math.PI / 2, 0, false); }
      const ice = new THREE.MeshStandardMaterial({ map: fitLab(['ICE'], '#e8eef4', '#2050a0', 256, 128, 'bold 80px Helvetica'), roughness: 0.4 });
      // the ice chest: a white insulated box, a dark lid seam and hinges, the ICE label on its two long faces only
      add(rbx(1.6, 1.15, 0.75, 0.05), new THREE.MeshStandardMaterial({ color: 0xe8eef4, roughness: 0.45 }), 2.6, 0.58, -3.55);
      add(new THREE.BoxGeometry(1.62, 0.035, 0.77), MAT.darkMetal, 2.6, 0.98, -3.55);
      for (const sd of [-1, 1]) add(new THREE.PlaneGeometry(1.2, 0.6), ice, 2.6, 0.58, -3.55 + sd * 0.378, 0, sd > 0 ? 0 : Math.PI, 0, false); solid(...P(2.6, -3.55), 0.8, 0.38, yaw, 1.15, 'metal');
      // propane exchange cage
      const cg = new THREE.BoxGeometry(1.4, 1.5, 0.7), cu = cg.attributes.uv; { const F2 = [[0.7, 1.5], [0.7, 1.5], [1.4, 0.7], [1.4, 0.7], [1.4, 1.5], [1.4, 1.5]]; for (let i = 0; i < cu.count; i++) { const f = F2[Math.floor(i / 4)]; cu.setXY(i, cu.getX(i) * f[0] / 0.6, cu.getY(i) * f[1] / 0.6); } }   // chain link in a steel frame
      add(cg, MAT.chainlink, -2.8, 0.75, -3.6, 0, 0, 0, false);
      for (const [w2, h2, d2, ox, oy, oz] of [[1.42, 0.04, 0.72, 0, 1.5, 0], [1.42, 0.04, 0.72, 0, 0.02, 0], [0.04, 1.5, 0.04, -0.7, 0.75, 0.35], [0.04, 1.5, 0.04, 0.7, 0.75, 0.35], [0.04, 1.5, 0.04, -0.7, 0.75, -0.35], [0.04, 1.5, 0.04, 0.7, 0.75, -0.35]]) add(new THREE.BoxGeometry(w2, h2, d2), MAT.darkMetal, -2.8 + ox, oy, -3.6 + oz);
      for (let k = 0; k < 4; k++) { const px7 = -3.3 + k * 0.33; add(new THREE.CapsuleGeometry(0.15, 0.3, 4, 14), MAT.white, px7, 0.3, -3.6); add(new THREE.CylinderGeometry(0.1, 0.1, 0.09, 12, 1, true), MAT.darkMetal, px7, 0.56, -3.6, 0, 0, 0, false); add(new THREE.CylinderGeometry(0.025, 0.025, 0.06, 8), MAT.metal, px7, 0.56, -3.6, 0, 0, 0, false); add(new THREE.CylinderGeometry(0.152, 0.152, 0.06, 14, 1, true), MAT.redPaint, px7, 0.3, -3.6, 0, 0, 0, false); }   // propane bottles: rounded, a guard collar and valve, a red band
      solid(...P(-2.8, -3.6), 0.7, 0.35, yaw, 1.5, 'metal');
      const gk = container('garage', ...P(0.1, -3.5), 1.0, 'Station kiosk', yaw);
      { const [kx2, kz2] = P(0.5, -3.2); B.box(kx2, 0, kz2, 0.3, 0.32, 0.22, yaw, ALL('plank'), TILE); solid(kx2, kz2, 0.3, 0.22, yaw, 0.32, 'wood', 0, { vault: true }); addItems(gk, [['can', kx2 - 0.12, 0.32, kz2], ['can', kx2, 0.32, kz2 + 0.05], ['bottle', kx2 + 0.13, 0.32, kz2 - 0.04], ['box', kx2 + 0.05, 0.32, kz2 - 0.08, yaw]]); }
    }
    // ---- the price sign out by the road ----
    { const pm = new THREE.MeshStandardMaterial({ map: (() => { const cv = document.createElement('canvas'); cv.width = 256; cv.height = 384; const g = cv.getContext('2d'); g.fillStyle = '#b8241c'; g.fillRect(0, 0, 256, 120); g.fillStyle = '#f4eee0'; g.font = 'bold 54px Helvetica'; g.textAlign = 'center'; g.fillText('GAS & GO', 128, 78, 236); g.fillStyle = '#16181c'; g.fillRect(0, 120, 256, 264); g.font = 'bold 26px Helvetica'; g.textAlign = 'left'; g.fillStyle = '#e8e4da'; g.fillText('REGULAR', 16, 170); g.fillText('PREMIUM', 16, 230); g.fillText('DIESEL', 16, 290); g.fillStyle = '#ffb030'; g.font = 'bold 32px Courier'; ['3.49', '4.19', '3.89'].forEach((pr, i) => g.fillText(pr, 158, 170 + i * 60)); g.fillStyle = '#e8e4da'; g.font = 'bold 22px Helvetica'; g.textAlign = 'center'; g.fillText('ICE · SNACKS · PROPANE', 128, 350, 236); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; })(), roughness: 0.5 });
      // the pylon and the canopy fascia are backlit at night
      for (const m of [pm, fascia]) { m.emissive = new THREE.Color(0xffffff); m.emissiveMap = m.map; m.emissiveIntensity = 0; }
      W.anims.push(() => { const k = W.daylight < 0.45 ? 0.55 : 0; if (pm.emissiveIntensity !== k) pm.emissiveIntensity = fascia.emissiveIntensity = k; });
      add(rbx(2.0, 3.0, 0.3, 0.05), pm, 9, 4.2, 9); for (const ox of [-0.7, 0.7]) add(new THREE.BoxGeometry(0.18, 2.8, 0.18), MAT.darkMetal, 9 + ox, 1.4, 9);
      add(rbx(2.4, 0.5, 0.6, 0.05), MAT.brick, 9, 0.25, 9); solid(...P(9, 9), 1.2, 0.3, yaw, 0.5, 'brick', 0, { vault: true }); }
    // tyres, oil drums, an air pump
    for (let k = 0; k < 4; k++) add(new THREE.TorusGeometry(0.3, 0.11, 8, 18).rotateX(Math.PI / 2), MAT.rubber, 5.5, 0.11 + k * 0.21, -3.5 + (k % 2) * 0.05);
    solid(...P(5.5, -3.5), 0.42, 0.42, yaw, 0.85, 'rubber');
    for (const [lx, lz] of [[6.5, -2.6], [7.1, -2.9]]) { add(new THREE.CylinderGeometry(0.29, 0.29, 0.88, 16), new THREE.MeshStandardMaterial({ color: 0x24406a, roughness: 0.6, metalness: 0.4 }), lx, 0.44, lz); solid(...P(lx, lz), 0.3, 0.3, yaw, 0.88, 'metal'); }
    mergeGroup(grp);
    // after the outbreak: the pumps run dry — OUT OF SERVICE on every pump, NO FUEL and blank prices on the sign
    chaos(x, z, () => {
      for (const [lx, lz, ry] of stickers) mesh(new THREE.PlaneGeometry(0.3, 0.3), sticker, ...((p2) => [p2[0], 1.2, p2[1]])(P(lx, lz)), yaw + ry, false);
      const nf = new THREE.MeshStandardMaterial({ map: (() => { const cv = document.createElement('canvas'); cv.width = 256; cv.height = 264; const g = cv.getContext('2d'); g.fillStyle = '#16181c'; g.fillRect(0, 0, 256, 264); g.font = 'bold 26px Helvetica'; g.fillStyle = '#e8e4da'; g.fillText('REGULAR', 16, 50); g.fillText('PREMIUM', 16, 110); g.fillText('DIESEL', 16, 170); g.fillStyle = '#ff5a30'; g.font = 'bold 32px Courier'; for (const y of [50, 110, 170]) g.fillText('-.--', 170, y); g.fillStyle = '#f2f0e8'; g.fillRect(20, 198, 216, 50); g.fillStyle = '#a01810'; g.font = 'bold 30px Helvetica'; g.textAlign = 'center'; g.fillText('NO FUEL', 128, 234); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; })(), roughness: 0.5 });
      for (const f of [0, Math.PI]) { const [px6, pz6] = P(9, 9 + (f ? -0.157 : 0.157)); mesh(new THREE.PlaneGeometry(1.92, 2.04), nf, px6, 3.74, pz6, yaw + f, false); }
    });
    wreck(...P(-6, 8.2), yaw + 1.3, 5, false);
    trashBin(...P(7.5, -1.5), yaw);
  }
  function mergeGroup(grp) {
    const by = new Map();
    grp.updateMatrixWorld(true);
    for (const m of [...grp.children]) {
      if (!m.isMesh || m.material.wireframe) continue;
      const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone());
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      m.updateMatrix(); g.applyMatrix4(m.matrix);
      const key = m.material.uuid + (m.castShadow ? 's' : '');
      if (!by.has(key)) by.set(key, { mat: m.material, shadow: m.castShadow, geos: [] });
      by.get(key).geos.push(g); grp.remove(m);
    }
    for (const { mat, shadow, geos } of by.values()) { const mm = new THREE.Mesh(mergeGeometries(geos), mat); mm.castShadow = shadow; mm.receiveShadow = true; grp.add(mm); }
  }
  // ---------------- a small park and playground on the corner ----------------
  function playground(x, z, yaw) {
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    const P = (lx, lz) => [x + lx * c + lz * sn, z - lx * sn + lz * c];
    const PX = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));
    const pm = (geo, mat, lx, ly, lz, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0, shadow = true) => xadd(geo, mat, PX.clone().multiply(mat4(lx, ly, lz, ry, sx, sy, sz, rx, rz)), shadow);
    // wood-chip mulch under the play things, in a low timber border
    for (const [x0, z0, x1, z1] of [[-4.2, -1.9, 2.2, 1.9], [3.6, -4.9, 6.4, 1.4]]) {
      const [cx, cz] = P((x0 + x1) / 2, (z0 + z1) / 2); B.box(cx, 0, cz, (x1 - x0) / 2, 0.03, (z1 - z0) / 2, yaw, f => f === 'top' ? 'mulch' : null, TILE); paved.push(rectOf(cx, cz, (x1 - x0) / 2, (z1 - z0) / 2, yaw));
      for (const [a0, b0, a1, b1] of [[x0, z0, x1, z0 + 0.08], [x0, z1 - 0.08, x1, z1], [x0, z0, x0 + 0.08, z1], [x1 - 0.08, z0, x1, z1]]) { const [bx, bz] = P((a0 + a1) / 2, (b0 + b1) / 2); B.box(bx, 0, bz, (a1 - a0) / 2, 0.12, (b1 - b0) / 2, yaw, ALL('plank'), TILE); }
    }
    // swing set: A-frame legs at each end, a round top beam, chains down to two curved seats
    for (const lx of [-3, 1]) for (const sz of [-1, 1]) pm(GEO.ucyl, MAT.bluePaint, lx, 1.2, sz * 0.43, 0, 0.07, 2.5, 0.07, -sz * 0.35, 0);
    pm(GEO.ucyl, MAT.bluePaint, -1, 2.4, 0, 0, 0.1, 4.2, 0.1, 0, Math.PI / 2);
    solid(...P(-3, 0), 0.1, 0.9, yaw, 2.4, 'metal'); solid(...P(1, 0), 0.1, 0.9, yaw, 2.4, 'metal');
    for (const lx of [-2, 0]) {
      for (const ox of [-0.22, 0.22]) pm(GEO.ucyl, MAT.darkMetal, lx + ox, 1.47, 0, 0, 0.016, 1.86, 0.016, 0, 0, false);
      pm(GEO.swingSeat, MAT.rubber, lx, 0.52, 0);
    }
    // the slide: a platform on four posts, a ladder up the back, a chute with side walls that runs out flat
    pm(GEO.ubox, MAT.yellowPaint, 5, 1.5, -3, 0, 1.2, 0.06, 1.2);
    for (const ox of [-0.56, 0.56]) for (const oz of [-0.56, 0.56]) pm(GEO.ucyl, MAT.yellowPaint, 5 + ox, 1.0, -3 + oz, 0, 0.08, 2.0, 0.08);
    for (const ox of [-0.56, 0.56]) { pm(GEO.ucyl, MAT.yellowPaint, 5 + ox, 1.85, -3, 0, 0.05, 1.1, 0.05, Math.PI / 2, 0); }   // guard rails
    for (const ox of [-0.25, 0.25]) pm(GEO.ucyl, MAT.yellowPaint, 5 + ox, 0.8, -3.95, 0, 0.05, 1.75, 0.05, 0.35, 0);
    for (let k = 0; k < 6; k++) { const t2 = (k + 0.5) / 6; pm(GEO.ucyl, MAT.metal, 5, 0.12 + t2 * 1.4, -4.25 + t2 * 0.55, 0, 0.04, 0.5, 0.04, 0, Math.PI / 2, false); }
    { const L2 = Math.hypot(2.4, 1.15), th = Math.atan2(1.15, 2.4), cz2 = -2.4 + 1.2, cy2 = 0.35 + 0.575;
      pm(GEO.ubox, MAT.redPaint, 5, cy2, cz2, 0, 0.5, 0.03, L2, th, 0);
      for (const ox of [-0.265, 0.265]) pm(GEO.ubox, MAT.redPaint, 5 + ox, cy2 + 0.07, cz2, 0, 0.03, 0.16, L2, th, 0);
      pm(GEO.ubox, MAT.redPaint, 5, 0.34, 0.25, 0, 0.5, 0.03, 0.5); for (const ox of [-0.265, 0.265]) pm(GEO.ubox, MAT.redPaint, 5 + ox, 0.41, 0.25, 0, 0.03, 0.16, 0.5); }
    { const [sx, sz] = P(5, -3); solid(sx, sz, 0.62, 0.62, yaw, 1.6, 'metal'); }
    { const [lx2, lz2] = P(5, -3.95); solid(lx2, lz2, 0.3, 0.3, yaw, 1.6, 'metal'); }   // the ladder
    { const [cx3, cz3] = P(5, -1.2); solid(cx3, cz3, 0.3, 1.2, yaw, 1.05, 'metal', 0, { vault: true }); }   // the chute: you hop over it, not walk through it
    { const [cx3, cz3] = P(5, 0.25); solid(cx3, cz3, 0.3, 0.27, yaw, 0.5, 'metal', 0, { vault: true }); }
    // benches, a sandbox, trees
    for (const [lx, lz] of [[-6, 6], [4, 6]]) { const [bx, bz] = P(lx, lz); block(bx, 0.42, bz, 0.9, 0.48, 0.22, yaw, 'plank', 'wood', false); B.box(bx, 0, bz, 0.85, 0.42, 0.18, yaw, ALL('darkMetal'), TILE); solid(bx, bz, 0.9, 0.25, yaw, 0.5, 'wood', 0, { vault: true }); addItems(container('bench', bx, bz + 0.4, 0.5, 'Under the bench', yaw), [['bottle', bx + 0.3, 0.01, bz + 0.05], ['cloth', bx - 0.25, 0.01, bz]]); }
    { const [sx, sz] = P(-6, -5); B.box(sx, 0, sz, 1.6, 0.25, 1.6, yaw, f => f === 'top' ? 'dirt' : 'plank', TILE); }
    for (const [lx, lz] of [[-9, -9], [8, -9], [9, 4]]) tree(...P(lx, lz), 1.1, 0);
    { const [ax, az] = P(-11.5, 10.5), [bx, bz] = P(11.5, 10.5); picketFence(ax, az, ...P(-2, 10.5)); picketFence(...P(2, 10.5), bx, bz); }
    chaos(x, z, () => W.blood(...P(-1, 2), 1.4, 0.02));
    paint(...P(-6, -5), 2.2, 'dirt', 0.3);   // worn round the sandbox
  }

  // ---------------- watchtowers: timber lookouts you can climb ----------------
  // A platform 4 m up on four weathered posts (X-braced, on concrete pads), plank deck, railings with a sandbag ring
  // and a dead searchlight, a corrugated shed roof. One straight stair with a half-way landing (treads, risers,
  // stringers, handrails and balusters) runs out from the open side; a stack of crates (or a dumpster and crates)
  // beside the landing is the parkour way up. What you stand on is in W.decks (flat) and W.ramps (the flights);
  // zombies are too clumsy for stairs: a gate only they bump into, and the stair's cells are off their route map.
  W.decks = []; W.ramps = []; W.navBlocks = [];
  let TGEO = null;
  function towerKit() {
    if (TGEO) return TGEO;
    // a unit beam (1 x 1 x 1, long axis z) with the grain running along it on every long face
    const beam = new THREE.BoxGeometry(1, 1, 1), p = beam.attributes.position, n = beam.attributes.normal, uv = beam.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + 0.5, y = p.getY(i) + 0.5, z = p.getZ(i) + 0.5;
      if (Math.abs(n.getX(i)) > 0.5) uv.setXY(i, z, y); else if (Math.abs(n.getY(i)) > 0.5) uv.setXY(i, z, x); else uv.setXY(i, x * 0.15, y * 0.15);
    }
    // corrugated roof sheet: 24 waves across (matching the texture's bands), 1 x 1, lying flat
    const corr = new THREE.PlaneGeometry(1, 1, 96, 1).rotateX(-Math.PI / 2), cp = corr.attributes.position;
    for (let i = 0; i < cp.count; i++) cp.setY(i, Math.sin((cp.getX(i) + 0.5) * Math.PI * 2 * 24) * 0.016);
    corr.computeVertexNormals();
    const timberTex = (base, seed) => ctex(256, 64, (g) => {
      let s = seed; const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
      g.fillStyle = base; g.fillRect(0, 0, 256, 64);
      for (let k = 0; k < 70; k++) { const y = r() * 64; g.strokeStyle = r() < 0.6 ? `rgba(40,32,24,${0.15 + r() * 0.3})` : `rgba(210,200,180,${0.08 + r() * 0.15})`; g.lineWidth = 0.5 + r() * 1.6; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(85, y + (r() - 0.5) * 6, 170, y + (r() - 0.5) * 6, 256, y + (r() - 0.5) * 3); g.stroke(); }
      for (let k = 0; k < 3; k++) { const x = r() * 256, y = 10 + r() * 44; g.fillStyle = 'rgba(46,34,22,0.75)'; g.beginPath(); g.ellipse(x, y, 5 + r() * 4, 2.5 + r() * 2, 0, 0, 7); g.fill(); g.strokeStyle = 'rgba(46,34,22,0.35)'; g.beginPath(); g.ellipse(x, y, 10, 5, 0, 0, 7); g.stroke(); }
      for (let k = 0; k < 6; k++) { g.fillStyle = `rgba(20,16,12,${0.25 + r() * 0.3})`; g.fillRect(r() * 256, r() * 64, 2 + r() * 30, 1); }   // checks and splits
      for (let k = 0; k < 2; k++) { const x = r() * 240; g.fillStyle = 'rgba(70,70,70,0.9)'; g.fillRect(x, 28, 3, 3); g.fillRect(x + 1, 40, 3, 3); }   // nail heads
    });
    MAT.timber = std({ map: timberTex('#8a8070', 11), roughness: 0.92 });
    MAT.timberDark = std({ map: timberTex('#6e6252', 23), roughness: 0.92 });
    MAT.corr = std({ map: TX.corrugatedTexture([138, 132, 124]), roughness: 0.55, metalness: 0.55, side: THREE.DoubleSide });
    MAT.sandbag = std({ map: TX.burlapTexture(), roughness: 1 });
    MAT.crate = std({ map: TX.crateTexture(), roughness: 0.85 });
    MAT.lens = std({ color: 0x8a949a, roughness: 0.05, metalness: 0.3, envMapIntensity: 1.6 });
    MAT.dumpster = std({ map: TX.paintedMetalTexture([46, 84, 60]), roughness: 0.6, metalness: 0.4 });
    TILE.timber = 1.6;
    // a sandbag: a soft flattened pillow
    const bag = new RoundedBoxGeometry(0.56, 0.17, 0.3, 3, 0.075), bp = bag.attributes.position;
    for (let i = 0; i < bp.count; i++) { const x = bp.getX(i), z = bp.getZ(i); bp.setY(i, bp.getY(i) * (1 - (x * x) / 0.18 * 0.35 - (z * z) / 0.05 * 0.2)); }
    bag.computeVertexNormals();
    TGEO = { beam, corr, bag, lamp: new THREE.CylinderGeometry(0.22, 0.26, 0.42, 20, 1).rotateX(Math.PI / 2), lensG: new THREE.CircleGeometry(0.2, 20), wheelG: new THREE.CylinderGeometry(0.08, 0.08, 0.06, 12).rotateZ(Math.PI / 2) };
    return TGEO;
  }
  // the attic's materials and shapes (made once, the first time a house needs them)
  let AKIT = null;
  // the bits outside a house (flowers, the AC, the meter, a dish, a hose reel): made once
  let HKIT = null;
  function houseKit() {
    if (HKIT) return HKIT;
    const louvre = ctex(128, 128, (g) => { g.fillStyle = '#cfcfca'; g.fillRect(0, 0, 128, 128); for (let y = 2; y < 128; y += 6) { g.fillStyle = '#7a7c7c'; g.fillRect(4, y, 120, 3); g.fillStyle = '#eeeee8'; g.fillRect(4, y + 3, 120, 1); } g.fillStyle = '#a8a8a4'; g.fillRect(0, 0, 4, 128); g.fillRect(124, 0, 4, 128); });
    HKIT = {
      red: std({ color: 0xb8202a, roughness: 0.6 }), yellow: std({ color: 0xe8c020, roughness: 0.6 }), white: std({ color: 0xf0eee6, roughness: 0.6 }), purple: std({ color: 0x6a3a9a, roughness: 0.6 }), pink: std({ color: 0xe878a0, roughness: 0.6 }),
      bloom: new THREE.IcosahedronGeometry(0.035, 0),
      acSide: std({ map: louvre, roughness: 0.45, metalness: 0.5 }), acTop: std({ color: 0xbebeb8, roughness: 0.4, metalness: 0.5 }),
      copper: std({ color: 0xb06a3a, roughness: 0.35, metalness: 0.9 }),
      meterBox: std({ color: 0x8c9294, roughness: 0.45, metalness: 0.6 }), meterGlass: std({ color: 0xc8d4d8, roughness: 0.05, metalness: 0.1, envMapIntensity: 1.5 }),
      dish: new THREE.SphereGeometry(0.4, 20, 6, 0, Math.PI * 2, 0, 0.6).rotateX(Math.PI / 2).scale(1, 1.15, 1),
      reelM: std({ color: 0x2a6a3a, roughness: 0.5 }), hose: std({ color: 0x1e5a2a, roughness: 0.55 }),
      coil: new THREE.TorusGeometry(0.17, 0.05, 6, 20).scale(1, 1, 1.4),
      droop: new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(-0.15, 0.15, 0.05), new THREE.Vector3(-0.35, 0.02, 0.2), new THREE.Vector3(-0.8, 0.02, 0.5), new THREE.Vector3(-1.2, 0.02, 0.2)]), 20, 0.012, 5, false),
    };
    return HKIT;
  }
  function atticKit() {
    if (AKIT) return AKIT;
    const rnd = (sd => () => ((sd = (sd * 9301 + 49297) % 233280) / 233280))(41);
    // pink fibreglass batts: soft, lumpy, fibrous
    MAT.insul = std({ map: ctex(128, 128, (g) => { g.fillStyle = '#e9b9a3'; g.fillRect(0, 0, 128, 128); for (let k = 0; k < 900; k++) { const l = rnd(); g.fillStyle = `rgba(${l < 0.5 ? '255,226,212' : '160,104,86'},${0.05 + rnd() * 0.12})`; g.beginPath(); g.ellipse(rnd() * 128, rnd() * 128, 2 + rnd() * 6, 1 + rnd() * 3, rnd() * 3, 0, 7); g.fill(); } g.strokeStyle = 'rgba(255,235,235,0.18)'; for (let k = 0; k < 120; k++) { g.beginPath(); const x = rnd() * 128, y = rnd() * 128; g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 18, y + (rnd() - 0.5) * 6); g.stroke(); } }, [1, 1]), roughness: 1 });
    // plywood sheets: a fine wavy grain, a patch or two, the nail lines over the joists, the sheet's edges
    MAT.plywood = std({ map: ctex(256, 256, (g) => { g.fillStyle = '#c3a272'; g.fillRect(0, 0, 256, 256); for (let k = 0; k < 90; k++) { const y = rnd() * 256; g.strokeStyle = `rgba(${rnd() < 0.6 ? '120,86,48' : '230,205,160'},${0.1 + rnd() * 0.22})`; g.lineWidth = 0.6 + rnd() * 2.2; g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= 256; x += 32) g.lineTo(x, y + Math.sin(x * 0.03 + k) * (3 + rnd() * 5)); g.stroke(); } for (let k = 0; k < 4; k++) { g.fillStyle = 'rgba(150,112,64,0.5)'; g.beginPath(); g.ellipse(rnd() * 256, rnd() * 256, 10, 5, 0, 0, 7); g.fill(); } g.fillStyle = 'rgba(60,50,40,0.8)'; for (let x = 0; x < 256; x += 84) for (let y = 6; y < 256; y += 24) g.fillRect(x + 4, y, 2, 2); g.fillStyle = 'rgba(70,52,30,0.7)'; g.fillRect(0, 0, 256, 2); g.fillRect(0, 0, 2, 256); for (let k = 0; k < 160; k++) { g.fillStyle = `rgba(90,80,70,${rnd() * 0.12})`; g.fillRect(rnd() * 256, rnd() * 256, 3 + rnd() * 8, 2 + rnd() * 6); } }, [1, 1]), roughness: 0.9 });
    // the roof boards seen from underneath: old 1x6 planks, darker where the nails rusted, a water stain or two
    MAT.sheath = std({ map: ctex(256, 256, (g) => { const n = 8; for (let i = 0; i < n; i++) { const v = 120 + rnd() * 30; g.fillStyle = `rgb(${v},${v * 0.8},${v * 0.58})`; g.fillRect(0, i * 32, 256, 32); for (let k = 0; k < 14; k++) { g.strokeStyle = `rgba(70,50,30,${0.1 + rnd() * 0.2})`; g.lineWidth = 0.6 + rnd(); g.beginPath(); const y = i * 32 + rnd() * 32; g.moveTo(0, y); g.bezierCurveTo(90, y + (rnd() - 0.5) * 6, 170, y + (rnd() - 0.5) * 6, 256, y); g.stroke(); } g.fillStyle = 'rgba(30,22,14,0.85)'; g.fillRect(0, i * 32, 256, 1.5); g.fillStyle = 'rgba(40,24,12,0.8)'; for (let x = 20; x < 256; x += 77) { g.fillRect(x, i * 32 + 6, 2, 2); g.fillRect(x, i * 32 + 24, 2, 2); } } for (let k = 0; k < 2; k++) { const gr = g.createRadialGradient(rnd() * 256, rnd() * 256, 2, 128, 128, 90); gr.addColorStop(0, 'rgba(60,40,20,0.35)'); gr.addColorStop(1, 'rgba(60,40,20,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); } }, [1, 1]), roughness: 0.95, side: THREE.DoubleSide });
    Object.assign(TILE, { insul: 1.2, plywood: 1.22, sheath: 1.22 });
    // cardboard boxes: kraft brown, a strip of tape over the flaps, a word in marker on some
    const cardTex = (word, ink) => ctex(128, 128, (g) => { g.fillStyle = '#b08656'; g.fillRect(0, 0, 128, 128); for (let k = 0; k < 300; k++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '90,60,30' : '220,190,140'},${rnd() * 0.1})`; g.fillRect(rnd() * 128, rnd() * 128, 2 + rnd() * 6, 1); } g.fillStyle = 'rgba(210,180,120,0.75)'; g.fillRect(0, 56, 128, 16); g.strokeStyle = 'rgba(80,56,30,0.6)'; g.strokeRect(1, 1, 126, 126); if (word) { g.fillStyle = ink; g.font = 'bold 26px Helvetica'; g.textAlign = 'center'; g.fillText(word, 64, 104); } });
    const card = std({ map: cardTex('', '#000'), roughness: 0.95 }), cardX = std({ map: cardTex('XMAS', '#9a1a14'), roughness: 0.95 });
    const dusty = new THREE.MeshStandardMaterial({ map: ctex(64, 64, (g) => { g.fillStyle = 'rgba(150,146,124,0.55)'; g.fillRect(0, 0, 64, 64); for (let k = 0; k < 140; k++) { g.fillStyle = `rgba(110,100,80,${rnd() * 0.25})`; g.beginPath(); g.arc(rnd() * 64, rnd() * 64, 1 + rnd() * 5, 0, 7); g.fill(); } const gr = g.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, 'rgba(90,84,70,0)'); gr.addColorStop(1, 'rgba(90,84,70,0.35)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }), transparent: true, depthWrite: false, roughness: 0.6, side: THREE.DoubleSide });
    // an old fan: a round cage on a stalk, three blades
    const fanG = (() => { const p = [new THREE.TorusGeometry(0.2, 0.008, 6, 28), new THREE.TorusGeometry(0.12, 0.006, 6, 20), new THREE.CylinderGeometry(0.05, 0.05, 0.08, 14).rotateX(Math.PI / 2)]; for (let k = 0; k < 3; k++) p.push(new THREE.BoxGeometry(0.06, 0.16, 0.008).translate(0, 0.1, 0.01).rotateZ(k * 2.094)); for (let k = 0; k < 8; k++) p.push(new THREE.BoxGeometry(0.004, 0.4, 0.004).rotateZ(k * 0.785)); return mergeGeometries(p.map(q => { q = q.toNonIndexed(); for (const n of Object.keys(q.attributes)) if (!['position', 'normal', 'uv'].includes(n)) q.deleteAttribute(n); return q; })); })();
    AKIT = {
      sheath: MAT.sheath, dusty, card, cardX, fanG,
      pine: std({ map: TX.cabinetTexture([200, 164, 116], 33), roughness: 0.72 }),
      ceilBoard: std({ color: 0xe8e4da, roughness: 0.9 }),
      oldFab: std({ map: TX.fabricTexture([112, 98, 78], 77), roughness: 1, side: THREE.DoubleSide }),
      brass: std({ color: 0x8a6a2a, metalness: 0.8, roughness: 0.4 }),
      rug: std({ map: TX.carpetTexture([110, 62, 40], 78), roughness: 1 }),
      fanM: std({ color: 0xd8d2bc, metalness: 0.4, roughness: 0.5 }),
      bulbG: new THREE.SphereGeometry(0.034, 12, 8).scale(1, 1.25, 1),
      bulb: W.atticBulbMat = std({ color: 0xfff6e0, roughness: 0.2, emissive: 0xffd8a0, emissiveIntensity: 0 }),
      trunkG: new RoundedBoxGeometry(0.58, 0.48, 0.95, 2, 0.03),
      lidG: new THREE.CylinderGeometry(0.29, 0.29, 0.95, 18, 1, false, Math.PI / 2, Math.PI).rotateX(Math.PI / 2).scale(1, 0.4, 1),
    };
    return AKIT;
  }
  // sd: which side (local x) the climbing stack is on; alt: a dumpster as the first step instead of a crate
  function watchtower(x, z, yaw, sd = 1, alt = false) {
    const K = towerKit();
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    const P = (lx, lz) => [x + lx * c + lz * sn, z - lx * sn + lz * c];
    const TM = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));
    const tm = (geo, mat, lx, ly, lz, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0, sh = true) => xadd(geo, mat, TM.clone().multiply(mat4(lx, ly, lz, ry, sx, sy, sz, rx, rz)), sh);
    // a timber from a to b (local [x, y, z]), w wide, h deep (h is the near-vertical side)
    const va = new THREE.Vector3(), vb = new THREE.Vector3(), ax = new THREE.Vector3(), ay = new THREE.Vector3(), az = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), XX = new THREE.Vector3(1, 0, 0);
    const beam = (a, b, w, h, mat = MAT.timber, sh = true) => {
      va.set(...a); vb.set(...b); az.subVectors(vb, va); const L = az.length(); az.divideScalar(L);
      ax.crossVectors(Math.abs(az.y) > 0.99 ? XX : UP, az).normalize(); ay.crossVectors(az, ax);
      const m = new THREE.Matrix4().makeBasis(ax.multiplyScalar(w), ay.multiplyScalar(h), az.multiplyScalar(L)); m.setPosition(va.add(vb).multiplyScalar(0.5));
      xadd(K.beam, mat, TM.clone().multiply(m), sh);
    };
    // a solid from local rect corners; returns the box
    const sol = (lx0, lz0, lx1, lz1, y0, y1, surf = 'wood', extra = {}) => { const [cx, cz] = P((lx0 + lx1) / 2, (lz0 + lz1) / 2); return solid(cx, cz, Math.abs(lx1 - lx0) / 2, Math.abs(lz1 - lz0) / 2, yaw, y1, surf, y0, extra); };
    const rect = (lx0, lz0, lx1, lz1, o) => { const [cx, cz] = P((lx0 + lx1) / 2, (lz0 + lz1) / 2), hx = Math.abs(lx1 - lx0) / 2, hz = Math.abs(lz1 - lz0) / 2; return { x: cx, z: cz, hx, hz, c, s: sn, r2: (hx * hx + hz * hz) + 0.5, ...o }; };
    const PH = 1.9, PY = 4.0, PP = 1.75, RF = 6.55, RB = 6.15;   // half platform, deck height, post offset, roof front/back
    const roofY = lz => lerp(RB, RF, (lz + 2.3) / 4.6);
    // ---- footings, posts, girts, braces ----
    for (const px of [-PP, PP]) for (const pz of [-PP, PP]) {
      const [fx, fz] = P(px, pz); B.box(fx, 0, fz, 0.26, 0.12, 0.26, yaw, ALL('concrete'), TILE);
      beam([px, 0.08, pz], [px, roofY(pz) - 0.06, pz], 0.2, 0.2, MAT.timberDark);
      sol(px - 0.11, pz - 0.11, px + 0.11, pz + 0.11, 0, roofY(pz));
      for (const s2 of [-1, 1]) tm(GEO.ucyl, MAT.darkMetal, px + s2 * 0.105, 0.35, pz, 0, 0.05, 0.015, 0.05, 0, Math.PI / 2, false);   // anchor bolts through the post foot
    }
    // rim beams under the deck all round, a mid girt and two X braces on the three closed sides
    for (const [a, b] of [[[-PP, -PP], [PP, -PP]], [[PP, -PP], [PP, PP]], [[PP, PP], [-PP, PP]], [[-PP, PP], [-PP, -PP]]]) beam([a[0], PY - 0.2, a[1]], [b[0], PY - 0.2, b[1]], 0.08, 0.26, MAT.timberDark);
    for (const [a, b, o] of [[[-PP, -PP], [PP, -PP], [0, -0.13]], [[-PP, -PP], [-PP, PP], [-0.13, 0]], [[PP, -PP], [PP, PP], [0.13, 0]]]) {
      const A = [a[0] + o[0], 0, a[1] + o[1]], Bp = [b[0] + o[0], 0, b[1] + o[1]];
      beam([A[0], 1.95, A[2]], [Bp[0], 1.95, Bp[2]], 0.06, 0.2);
      for (const [y0, y1] of [[0.3, 1.85], [2.05, 3.65]]) { beam([A[0], y0, A[2]], [Bp[0], y1, Bp[2]], 0.05, 0.16); beam([A[0], y1, A[2]], [Bp[0], y0, Bp[2]], 0.05, 0.16); }
      sol(Math.min(A[0], Bp[0]) - 0.06, Math.min(A[2], Bp[2]) - 0.06, Math.max(A[0], Bp[0]) + 0.06, Math.max(A[2], Bp[2]) + 0.06, 0.1, 3.75);
    }
    // knee braces on the open (stair) side
    for (const s2 of [-1, 1]) beam([s2 * PP, 2.9, PP + 0.12], [s2 * (PP - 0.8), PY - 0.25, PP + 0.12], 0.05, 0.14);
    // ---- deck: joists, plank floor (solid to bullets and sight lines, not to bodies: you stand on it) ----
    for (let k = 0; k < 7; k++) { const jx = -PP + k * (2 * PP / 6); beam([jx, PY - 0.17, -PH + 0.05], [jx, PY - 0.17, PH - 0.05], 0.05, 0.2, MAT.timberDark, false); }
    { const [cx, cz] = P(0, 0); B.box(cx, PY - 0.06, cz, PH, PY, PH, yaw + Math.PI / 2, f => f === 'top' || f === 'bot' ? 'plank' : 'timber', TILE); }
    sol(-PH, -PH, PH, PH, PY - 0.2, PY, 'wood', { noWalk: true });
    W.decks.push(rect(-PH, -PH, PH, PH, { y: PY }));
    // ---- railings: posts, top and mid rails, a kick board; the stair comes up through a gap in the front ----
    const GAP = 0.62;
    const railRun = (a, b) => {   // a, b: [lx, lz] along one edge
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / 0.95));
      for (let k = 0; k <= n; k++) { const t = k / n, px = lerp(a[0], b[0], t), pz = lerp(a[1], b[1], t); beam([px, PY, pz], [px, PY + 1.08, pz], 0.09, 0.09, MAT.timberDark); }
      for (const [y, w, h] of [[PY + 1.05, 0.07, 0.12], [PY + 0.55, 0.05, 0.1], [PY + 0.09, 0.03, 0.16]]) beam([a[0], y, a[1]], [b[0], y, b[1]], w, h);
    };
    const E = PH - 0.05;
    railRun([-E, -E], [E, -E]); railRun([E, -E], [E, E]); railRun([-E, E], [-E, -E]); railRun([E, E], [GAP, E]); railRun([-GAP, E], [-E, E]);
    // sandbags: two courses round the back and both sides, inside the rails (a firing step for whoever stood here)
    const bagRow = (a, b, layer) => {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.floor(L / 0.52), ry = Math.atan2(b[0] - a[0], b[1] - a[1]) + Math.PI / 2;
      for (let k = 0; k < n; k++) { const t = (k + 0.5 + (layer ? 0.5 : 0)) / n; if (t > 1) continue; const lx = lerp(a[0], b[0], t), lz = lerp(a[1], b[1], t); tm(K.bag, MAT.sandbag, lx, PY + 0.085 + layer * 0.15, lz, ry + (Math.random() - 0.5) * 0.12, 1, 1, 1, (Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.06); }
    };
    for (const layer of [0, 1]) { const I = PH - 0.27; bagRow([-I, -I], [I, -I], layer); bagRow([I, -I + 0.4], [I, 0.9], layer); bagRow([-I, 0.9], [-I, -I + 0.4], layer); }
    // the rail boxes: from the deck to above the top rail (deep enough to take in the sandbags)
    sol(-PH, -PH, PH, -PH + 0.45, PY - 0.02, PY + 1.12); sol(PH - 0.45, -PH, PH, PH, PY - 0.02, PY + 1.12); sol(-PH, -PH, -PH + 0.45, PH, PY - 0.02, PY + 1.12);
    sol(GAP, PH - 0.12, PH, PH, PY - 0.02, PY + 1.12); sol(-PH, PH - 0.12, -GAP, PH, PY - 0.02, PY + 1.12);
    // ---- the searchlight: a dead one, on a pipe stand in the back corner, aimed out over the street ----
    { const lx = -sd * 1.5, lz = -1.5;
      tm(GEO.ucyl, MAT.darkMetal, lx, PY + 0.9, lz, 0, 0.06, 1.2, 0.06);
      tm(GEO.ubox, MAT.darkMetal, lx, PY + 1.5, lz, 0, 0.5, 0.04, 0.06);
      for (const s2 of [-1, 1]) tm(GEO.ubox, MAT.darkMetal, lx + s2 * 0.25, PY + 1.62, lz, 0, 0.03, 0.26, 0.05);
      const aim = Math.atan2(-sd, -1);
      tm(K.lamp, MAT.darkMetal, lx, PY + 1.72, lz, aim, 1, 1, 1, -0.12, 0);
      tm(K.lensG, MAT.lens, lx + Math.sin(aim) * 0.215, PY + 1.72 + 0.026, lz + Math.cos(aim) * 0.215, aim, 1, 1, 1, -0.12, 0, false);
      tm(GEO.ucyl, MAT.rubber, lx, PY + 0.9, lz + 0.05, 0, 0.02, 1.2, 0.02, 0.3, 0, false); }
    // ---- the roof: rafters, purlins, a corrugated sheet sloping to the back ----
    for (const px of [-PP, PP]) beam([px, roofY(-2.3) - 0.12, -2.3], [px, roofY(2.3) - 0.12, 2.3], 0.08, 0.18, MAT.timberDark);
    for (const pz of [-1.9, -0.6, 0.6, 1.9]) beam([-2.2, roofY(pz) - 0.05, pz], [2.2, roofY(pz) - 0.05, pz], 0.06, 0.09, MAT.timberDark, false);
    { const th = Math.atan2(RF - RB, 4.6), mid = (RF + RB) / 2;
      tm(K.corr, MAT.corr, 0, mid + 0.01, 0, 0, 4.7, 1, 4.6 / Math.cos(th), -th, 0);
      for (const s2 of [-1, 1]) beam([s2 * 2.35, roofY(-2.3) + 0.0, -2.3], [s2 * 2.35, roofY(2.3) + 0.0, 2.3], 0.03, 0.08, MAT.corr, false); }   // bent edge flashing
    sol(-2.35, -2.3, 2.35, 2.3, RB - 0.15, RF + 0.05, 'metal', { noWalk: true });
    // ---- the stair: two flights of ten risers (0.2 m) and a landing half way ----
    const SW = 0.55, R = 0.2, RUN = 0.27, L = 10 * RUN, LZ0 = PH, LZ1 = PH + L, LZ2 = LZ1 + 1.2, LZ3 = LZ2 + L;
    const flight = (lzLow, h0) => {   // low end at lz = lzLow (further out), going up toward -z by 2 m
      const at = s => lzLow - s;
      // stringers: notched boards each side
      for (const s2 of [-1, 1]) beam([s2 * (SW + 0.03), h0 - 0.1, at(0)], [s2 * (SW + 0.03), h0 + 2 * R * 5 - 0.1, at(L)], 0.06, 0.3, MAT.timberDark);
      for (let i = 1; i < 10; i++) {
        const y = h0 + i * R, s0 = i * RUN;
        beam([-SW - 0.02, y - 0.02, at(s0 + RUN / 2) + 0.012], [SW + 0.02, y - 0.02, at(s0 + RUN / 2) + 0.012], RUN + 0.025, 0.04, MAT.timber, false);   // tread (grain across), a little nosing
        beam([-SW, y - R / 2 - 0.02, at(s0) - 0.01], [SW, y - R / 2 - 0.02, at(s0) - 0.01], 0.02, R - 0.04, MAT.timberDark, false);                      // riser
      }
      beam([-SW, h0 + 10 * R - R / 2 - 0.02, at(L) + 0.01], [SW, h0 + 10 * R - R / 2 - 0.02, at(L) + 0.01], 0.02, R - 0.04, MAT.timberDark, false);
      // handrails: a post at each end, a sloped top rail and mid rail, balusters between
      for (const s2 of [-1, 1]) {
        const rx = s2 * (SW + 0.09);
        for (const s of [0.12, L - 0.04]) { const y = h0 + Math.max(0, s / RUN - 0.5) * R; beam([rx, y - 0.25, at(s)], [rx, y + 1.0, at(s)], 0.08, 0.08, MAT.timberDark); }
        const yA = h0 + 0.0, yB = h0 + 2 * R * 5 - R / 2;
        beam([rx, yA + 0.98, at(0.12)], [rx, yB + 0.98, at(L - 0.04)], 0.06, 0.09);
        beam([rx, yA + 0.5, at(0.12)], [rx, yB + 0.5, at(L - 0.04)], 0.04, 0.07);
        for (let k = 1; k < 8; k++) { const s = 0.12 + k * (L - 0.16) / 8, y = h0 + (s / L) * 2 - 0.05; beam([rx, y, at(s)], [rx, y + 1.0, at(s)], 0.035, 0.035, MAT.timber, false); }
      }
      // what the body stands on, and what it bumps into: side rails in short pieces (each from just under the
      // treads to above the rail there, so you can walk under the high end), and the space under the low end shut
      const ra = rect(-SW, lzLow - L, SW, lzLow, { ya: h0 + 2, yb: h0, R });
      W.ramps.push(ra); W.navBlocks.push(rect(-SW - 0.1, lzLow - L, SW + 0.1, lzLow + 0.3, {}));
      const N = 6, yOf = s => h0 + clamp(s * 2 / L - R / 2, 0, 2);
      for (let j = 0; j < N; j++) {
        const s0 = j * L / N, s1 = (j + 1) * L / N, lo = yOf(s0), hi = yOf(s1);
        for (const s2 of [-1, 1]) sol(s2 * SW, at(s1), s2 * (SW + 0.15), at(s0), Math.max(0, lo - 0.3), hi + 1.05);
        if (lo < 2.3 && lo - 0.3 > 0.3) { sol(-SW - 0.15, at(s1), SW + 0.15, at(s0), 0, lo - 0.3);
          // and you can see why: board skirts down both sides of the stair there (no invisible wall)
          for (const s2 of [-1, 1]) { const [kx, kz] = P(s2 * (SW + 0.1), (at(s0) + at(s1)) / 2); B.box(kx, 0, kz, 0.02, lo - 0.3, Math.abs(at(s1) - at(s0)) / 2, yaw, ALL('timber'), TILE); } }
      }
      return ra;
    };
    flight(LZ1, 2); flight(LZ3, 0);
    // zombies can't manage stairs: they bump into the foot of them (nobody else does)
    sol(-SW, LZ3 - 0.55, SW, LZ3 + 0.25, 0, 1.0, 'wood', { zOnly: true, pass: true, navSkip: true });
    // the landing: four posts, a frame, a plank floor; a rail on the far side, open on the stack side
    for (const px of [-SW - 0.05, SW + 0.05]) for (const pz of [LZ1 + 0.05, LZ2 - 0.05]) { beam([px, 0, pz], [px, 2 - 0.05, pz], 0.14, 0.14, MAT.timberDark); const [fx, fz] = P(px, pz); B.box(fx, 0, fz, 0.18, 0.08, 0.18, yaw, ALL('concrete'), TILE); }
    for (const pz of [LZ1 + 0.05, LZ2 - 0.05]) beam([-SW - 0.1, 1.84, pz], [SW + 0.1, 1.84, pz], 0.07, 0.22, MAT.timberDark);
    for (const s2 of [-1, 1]) { beam([s2 * (SW + 0.05), 0.25, LZ1 + 0.1], [s2 * (SW + 0.05), 1.7, LZ2 - 0.1], 0.04, 0.13); }
    { const [cx, cz] = P(0, (LZ1 + LZ2) / 2); B.box(cx, 1.95, cz, SW + 0.1, 2, (LZ2 - LZ1) / 2, yaw, f => f === 'top' || f === 'bot' ? 'plank' : 'timber', TILE); }
    { const rx = -sd * (SW + 0.09); beam([rx, 2, LZ1 + 0.05], [rx, 3.05, LZ1 + 0.05], 0.08, 0.08, MAT.timberDark); beam([rx, 2, LZ2 - 0.05], [rx, 3.05, LZ2 - 0.05], 0.08, 0.08, MAT.timberDark);
      beam([rx, 2.98, LZ1], [rx, 2.98, LZ2], 0.06, 0.09); beam([rx, 2.5, LZ1], [rx, 2.5, LZ2], 0.04, 0.07);
      sol(rx - 0.08, LZ1, rx + 0.08, LZ2, 1.95, 3.05); }
    sol(-SW - 0.15, LZ1, SW + 0.15, LZ2, 0, 1.85);
    W.decks.push(rect(-SW - 0.1, LZ1 - 0.05, SW + 0.1, LZ2 + 0.05, { y: 2 }));
    W.navBlocks.push(rect(-SW - 0.15, LZ1, SW + 0.15, LZ2, {}));
    // ---- the climbing stack beside the landing: a pallet and crate, then two crates on a pallet (1.75 m) ----
    const pallet = (cx2, cz2, hx2, hz2, y0) => {
      for (let k = 0; k < 5; k++) { const zz = cz2 + (-1 + k * 0.5) * (hz2 - 0.05); beam([cx2 - hx2, y0 + 0.139, zz], [cx2 + hx2, y0 + 0.139, zz], 0.1, 0.022, MAT.timber, false); }
      for (const t of [-1, 0, 1]) beam([cx2 + t * (hx2 - 0.05), y0 + 0.064, cz2 - hz2], [cx2 + t * (hx2 - 0.05), y0 + 0.064, cz2 + hz2], 0.09, 0.1, MAT.timberDark);
    };
    const crate = (cx2, cz2, hx2, hz2, y0, h, ry = 0) => { tm(GEO.ubox, MAT.crate, cx2, y0 + h / 2, cz2, ry, hx2 * 2, h, hz2 * 2); for (const s2 of [-1, 1]) tm(GEO.ubox, MAT.darkMetal, cx2 + s2 * (hx2 + 0.005), y0 + h * 0.6, cz2, ry, 0.02, 0.05, 0.2, 0, 0, false); };   // rope-handle cleats
    const a2 = sd * (SW + 0.08), b2 = sd * (SW + 1.2), mid2 = (a2 + b2) / 2, za = LZ1 + 0.1, zb = LZ2 - 0.1, zm = (za + zb) / 2;
    pallet(mid2, zm, 0.56, 0.5, 0); crate(mid2, zm, 0.54, 0.48, 0.15, 0.8, 0.02); crate(mid2 + 0.02, zm - 0.02, 0.52, 0.47, 0.95, 0.8, -0.04);
    sol(Math.min(a2, b2), za, Math.max(a2, b2), zb, 0, 1.75);
    W.decks.push(rect(Math.min(a2, b2), za, Math.max(a2, b2), zb, { y: 1.75, climb: true }));
    const a1 = b2, b1 = sd * (SW + 1.2 + (alt ? 1.2 : 1.15)), mid1 = (a1 + b1) / 2;
    if (alt) {   // a steel dumpster, lid shut, end-on to the stack (1.25 m)
      const z0 = LZ1 - 0.35, z1 = LZ2 + 0.35, zc = (z0 + z1) / 2, hz1 = (z1 - z0) / 2, hx1 = Math.abs(b1 - a1) / 2 - 0.04;
      tm(GEO.ubox, MAT.dumpster, mid1, 0.66, zc, 0, hx1 * 2 - 0.08, 1.06, hz1 * 2 - 0.08);
      for (const s2 of [-1, 1]) tm(GEO.ubox, MAT.dumpster, mid1, 0.62, zc + s2 * (hz1 - 0.05), 0, hx1 * 2, 0.08, 0.06, 0, 0, false);   // ribs
      for (const zz of [-0.5, 0.5]) tm(GEO.ubox, MAT.rubber, mid1, 1.215, zc + zz * hz1, 0.02 * zz, hx1 * 2 + 0.02, 0.04, hz1 - 0.02, 0, 0.03);   // two plastic lids
      for (const s2 of [-1, 1]) for (const s3 of [-1, 1]) tm(K.wheelG, MAT.rubber, mid1 + s2 * (hx1 - 0.15), 0.08, zc + s3 * (hz1 - 0.15), 0, 1, 1, 1);
      tm(GEO.ubox, MAT.darkMetal, mid1 + sd * (hx1 + 0.02), 0.9, zc, 0, 0.04, 0.06, hz1 * 1.6, 0, 0, false);
      sol(Math.min(a1, b1), z0, Math.max(a1, b1), z1, 0, 1.25, 'metal');
      W.decks.push(rect(Math.min(a1, b1), z0, Math.max(a1, b1), z1, { y: 1.25, climb: true }));
    } else {
      pallet(mid1, zm, 0.57, 0.55, 0); crate(mid1, zm + 0.03, 0.55, 0.52, 0.15, 0.8, -0.05);
      sol(Math.min(a1, b1), za - 0.05, Math.max(a1, b1), zb + 0.05, 0, 0.95);
      W.decks.push(rect(Math.min(a1, b1), za - 0.05, Math.max(a1, b1), zb + 0.05, { y: 0.95, climb: true }));
    }
    // a worn patch of dirt round the foot of the stair and under the tower
    paint(...P(0, 0), 3.2, 'dirt', 0.35); paint(...P(0, LZ3 - 0.3), 1.4, 'dirt', 0.4);
  }

  function finish() {
    B.finish(level, MAT);
    for (const L of instLists.values()) {
      const { geo, mat, ms, shadow } = L;
      const im = new THREE.InstancedMesh(geo, mat, ms.length);
      ms.forEach((m, i) => im.setMatrixAt(i, m));
      im.castShadow = shadow; im.receiveShadow = true; im.computeBoundingSphere();
      level.add(im); L.im = im;
    }
    instLists.clear();
    flushX(XM, level);
    for (const it of W.chaos) {
      it.B.finish(it.g, MAT); flushX(it.xm, it.g);
      for (const L of it.inst.values()) { const { geo, mat, ms, shadow } = L; const im = new THREE.InstancedMesh(geo, mat, ms.length); ms.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = shadow; im.receiveShadow = true; im.computeBoundingSphere(); it.g.add(im); L.im = im; }
      it.inst.clear();
    }
    maskTex.needsUpdate = true;
    maskData = maskG.getImageData(0, 0, MASK_N, MASK_N).data;
    grass.refresh();
    if (LOW) lightBuild();
    // boxes nobody can ever reach (the bounds clamp every body) don't go in the grid or the nav grid
    { const Bd = W.bounds, m = 1; if (Bd) { let n = 0; for (const b of W.boxes) { const out = !b.brk && !b.door && !b.noWalk && (b.x + b.r < Bd.x0 - m || b.x - b.r > Bd.x1 + m || b.z + b.r < Bd.z0 - m || b.z - b.r > Bd.z1 + m); if (!out) W.boxes[n++] = b; } W.boxes.length = n; } }
    buildGrid();
    buildNav();
  }

  // ================================================================ collision, rays, line of sight
  // boxes live in a 4 m grid so each query only looks at what's near
  const GC = 4, GX0 = -170, GN = Math.ceil(340 / GC);
  let grid = null, stamp = 1;
  function buildGrid() {
    grid = Array.from({ length: GN * GN }, () => []);
    for (const b of W.boxes) addToGrid(b);
  }
  function addToGrid(b) {
    const i0 = clamp(Math.floor((b.x - b.r - GX0) / GC), 0, GN - 1), i1 = clamp(Math.floor((b.x + b.r - GX0) / GC), 0, GN - 1);
    const j0 = clamp(Math.floor((b.z - b.r - GX0) / GC), 0, GN - 1), j1 = clamp(Math.floor((b.z + b.r - GX0) / GC), 0, GN - 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) grid[j * GN + i].push(b);
  }
  const nearOut = [];
  function near(x, z, r) {
    nearOut.length = 0; stamp++;
    const i0 = clamp(Math.floor((x - r - GX0) / GC), 0, GN - 1), i1 = clamp(Math.floor((x + r - GX0) / GC), 0, GN - 1);
    const j0 = clamp(Math.floor((z - r - GX0) / GC), 0, GN - 1), j1 = clamp(Math.floor((z + r - GX0) / GC), 0, GN - 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) for (const b of grid[j * GN + i]) if (b._s !== stamp) { b._s = stamp; nearOut.push(b); }
    return nearOut;
  }
  W.near = near;
  // push a circle (a person) out of every solid box; returns the box it touched last
  // (height-aware: p.gy is where the feet are — set by the body each frame; below 0.4 m it counts as street level,
  // so curbs, porches and gas-pump islands behave exactly as on flat ground. zOnly boxes stop only zombies: p.noClimb)
  const baseY = p => { const y = p.gy; return y > 0.4 ? y : 0; };
  W.baseY = baseY;
  W.collide = (p, r = 0.33, opts = null) => {
    let hit = null;
    const by = baseY(p);
    for (const b of near(p.x, p.z, r + 0.5)) {
      if (b.off || b.noWalk || b.y0 > by + 1.2 || b.y1 < by + 0.3) continue;
      if (b.zOnly && !p.noClimb) continue;
      if (b.maxBy !== undefined && by > b.maxBy) continue;   // (the attic's bounds: not for you up on the roof over them)
      if (opts && opts.ignoreVault && b.vault) continue;
      const dx = p.x - b.x, dz = p.z - b.z;
      if (dx * dx + dz * dz > (b.r + r + 0.2) ** 2) continue;
      const lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
      const qx = clamp(lx, -b.hx, b.hx), qz = clamp(lz, -b.hz, b.hz);
      const ex = lx - qx, ez = lz - qz, d2 = ex * ex + ez * ez;
      if (d2 >= r * r) continue;
      hit = b;
      let nx, nz, pen;
      if (d2 > 1e-8) { const d = Math.sqrt(d2); nx = ex / d; nz = ez / d; pen = r - d; }
      else { const px = b.hx - Math.abs(lx), pz = b.hz - Math.abs(lz); if (px < pz) { nx = Math.sign(lx) || 1; nz = 0; pen = px + r; } else { nx = 0; nz = Math.sign(lz) || 1; pen = pz + r; } }
      const wx = nx * b.c + nz * b.s, wz = -nx * b.s + nz * b.c;
      p.x += wx * pen; p.z += wz * pen;
    }
    const Bd = W.bounds;
    p.x = clamp(p.x, Bd.x0, Bd.x1); p.z = clamp(p.z, Bd.z0, Bd.z1);
    return hit;
  };
  // never let anyone end up on the far side of a wall: if the straight line from where they last stood is
  // blocked (at chest height, so fences you vault and hedges don't count), put them back
  const tA = new THREE.Vector3(), tB = new THREE.Vector3();
  W.keepSide = (safe, p) => {
    if (!safe.set) return;
    const dx = p.x - safe.x, dz = p.z - safe.z;
    if (dx * dx + dz * dz < 1e-6) return;
    if (dx * dx + dz * dz > 4) { safe.x = p.x; safe.z = p.z; return; }   // a teleport (new game, respawn): fine
    const h = baseY(p) + 1.5; tA.set(safe.x, h, safe.z); tB.set(p.x, h, p.z);
    if (!W.los(tA, tB)) { p.x = safe.x; p.z = safe.z; }
    safe.x = p.x; safe.z = p.z;
  };
  // is there a low obstacle you could vault just ahead? returns { box, x, z } landing point or null
  W.vaultAhead = (x, z, yaw) => {
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    for (const b of near(x, z, 2)) {
      if (!b.vault || b.off) continue;
      for (const d of [0.35, 0.6, 0.85]) {
        const px = x + fx * d, pz = z + fz * d, dx = px - b.x, dz = pz - b.z;
        const lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
        if (Math.abs(lx) < b.hx + 0.05 && Math.abs(lz) < b.hz + 0.05) {
          // land on the far side: through the box along the facing direction
          const th = Math.abs(fx * b.s + fz * b.c) > Math.abs(fx * b.c - fz * b.s) ? b.hz : b.hx;
          return { box: b, x: x + fx * (d + th * 2 + 0.75), z: z + fz * (d + th * 2 + 0.75) };
        }
      }
    }
    return null;
  };
  // ray against boxes and the ground. returns { t, box, n, mat } or null
  const hitN = new THREE.Vector3();
  W.ray = (o, d, maxT = 300, skipPass = true, maxY0 = 1e9, skipWindows = false) => {
    let best = maxT, bb = null, bnAxis = 0;
    // walk the grid cells along the ray
    const L = Math.min(maxT, 300), steps = Math.ceil(L / (GC * 0.5)) + 1;
    stamp++;
    for (let k = 0; k <= steps; k++) {
      const t = Math.min(L, k * GC * 0.5); if (t > best + GC) break;
      const px = o.x + d.x * t, pz = o.z + d.z * t;
      const i0 = clamp(Math.floor((px - GX0) / GC) - 1, 0, GN - 1), i1 = clamp(i0 + 2, 0, GN - 1), j0 = clamp(Math.floor((pz - GX0) / GC) - 1, 0, GN - 1), j1 = clamp(j0 + 2, 0, GN - 1);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) for (const b of grid[j * GN + i]) {
        if (b._s === stamp) continue; b._s = stamp;
        if (b.off || (skipPass && b.pass) || b.y0 > maxY0 || (skipWindows && b.window)) continue;
        const dx = o.x - b.x, dz = o.z - b.z;
        const lox = dx * b.c - dz * b.s, loz = dx * b.s + dz * b.c;
        const ldx = d.x * b.c - d.z * b.s, ldz = d.x * b.s + d.z * b.c;
        let t0 = 0, t1 = best, ax = -1;
        const slab = (o1, d1, lo, hi, axis) => {
          if (Math.abs(d1) < 1e-9) return o1 >= lo && o1 <= hi;
          let a = (lo - o1) / d1, c = (hi - o1) / d1, sgn = -1;
          if (a > c) { const tt = a; a = c; c = tt; sgn = 1; }
          if (a > t0) { t0 = a; ax = axis * sgn; }
          t1 = Math.min(t1, c);
          return t0 <= t1;
        };
        if (!slab(lox, ldx, -b.hx, b.hx, 1)) continue;
        if (!slab(o.y, d.y, b.y0, b.y1, 2)) continue;
        if (!slab(loz, ldz, -b.hz, b.hz, 3)) continue;
        if (t0 > 0 && t0 < best) { best = t0; bb = b; bnAxis = ax; }
      }
    }
    if (d.y < -1e-6) { const tg = -o.y / d.y; if (tg > 0 && tg < best) return { t: tg, box: null, n: hitN.set(0, 1, 0), mat: groundKind(o.x + d.x * tg, o.z + d.z * tg) }; }
    if (!bb) return null;
    const ax = Math.abs(bnAxis), sg = Math.sign(bnAxis) * -1;
    if (ax === 2) hitN.set(0, -sg, 0); else {
      const lx = ax === 1 ? -sg : 0, lz = ax === 3 ? -sg : 0;
      hitN.set(lx * bb.c + lz * bb.s, 0, -lx * bb.s + lz * bb.c);
    }
    if (hitN.dot(d) > 0) hitN.negate();
    return { t: best, box: bb, n: hitN, mat: bb.mat };
  };
  // which house (if any) a point is inside, and what floor it's standing on
  // y (optional: where the feet are): up on its roof you're outside it again; in its attic you're still in
  W.houseAt = (x, z, y) => {
    for (const H of W.houses) {
      const dx = x - H.x, dz = z - H.z, c = Math.cos(H.yaw), s = Math.sin(H.yaw);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (Math.abs(lx) < H.hw - 0.05 && Math.abs(lz) < H.hd - 0.05) return y > 2.2 && H.yTop && y > H.yTop(lz) - 0.45 ? null : H;
    }
    return null;
  };
  const hLocalZ = (H, x, z) => (x - H.x) * Math.sin(H.yaw) + (z - H.z) * Math.cos(H.yaw);
  // how much room over your head (in an attic, under the slope of the roof; anywhere else: plenty)
  W.headroom = (x, z, y = 0) => { if (y < 2.5) return 9; const H = W.houseAt(x, z, y); return H && H.yUnder ? H.yUnder(hLocalZ(H, x, z)) - y : 9; };
  // the highest the camera may go inside a house (under the ceiling downstairs; under the rafters in the attic)
  W.camCeil = (x, z, y = 0) => { const H = W.houseAt(x, z, y); if (!H) return 99; return y > 2.5 && H.yUnder ? Math.max(y + 0.9, H.yUnder(hLocalZ(H, x, z)) - 0.18) : 2.55; };
  function groundKind(x, z, y = 0) {
    if (y > 2.2) for (const R of W.roofs) { const ry = roofY(R, x, z); if (ry !== null && y > ry - 0.3) return 'gravel'; }   // gritty shingles
    if (y > 0.4) { for (const d of W.decks) if (inRect(d, x, z) !== null) return 'wood'; for (const d of W.ramps) if (inRect(d, x, z) !== null) return 'wood'; }
    const H = W.houseAt(x, z);
    if (H) {
      const dx = x - H.x, dz = z - H.z, c = Math.cos(H.yaw), s = Math.sin(H.yaw);
      const lx = (dx * c - dz * s) * H.flip, lz = dx * s + dz * c;
      for (const [x0, z0, x1, z1, k] of H.rooms) if (lx >= x0 && lx <= x1 && lz >= z0 && lz <= z1) return k;
      return 'wood';
    }
    if (W.mapId !== 'maple') { for (let i = W.regions.length - 1; i >= 0; i--) { const g = W.regions[i]; if (x > g.x0 && x < g.x1 && z > g.z0 && z < g.z1) return g.step; } return W.groundStep || 'grass'; }
    if (Math.abs(z) < 4 || Math.abs(x) < 4) return 'asphalt';
    if (Math.abs(z) < 6.1 || Math.abs(x) < 6.1) return 'concrete';
    for (const r of paved) if (x > r[0] && x < r[2] && z > r[1] && z < r[3]) return 'concrete';
    return 'grass';
  }
  W.groundKind = groundKind;
  const lo = new THREE.Vector3(), ld = new THREE.Vector3();
  W.los = (a, b, skipWindows = false) => {
    ld.subVectors(b, a); const L = ld.length(); if (L < 0.01) return true; ld.divideScalar(L);
    const h = W.ray(lo.copy(a), ld, L - 0.05, true, 1e9, skipWindows);
    return !h || h.t >= L - 0.1;
  };

  // ================================================================ route map for the zombies
  // 0.5 m cells. blocked: 1 wall, 2 vaultable (fences: zombies can't climb), 3 door (passable — they'll break it)
  const NAV = { cell: 0.5, x0: -112, z0: -112, nx: 0, nz: 0, blocked: null, door: null, dist: null, gen: 0 };
  W.NAV = NAV;
  function buildNav() {
    const c = NAV.cell;
    const Bd = W.bounds; NAV.x0 = Bd.x0; NAV.z0 = Bd.z0;
    NAV.nx = Math.ceil((Bd.x1 - Bd.x0) / c) + 1; NAV.nz = Math.ceil((Bd.z1 - Bd.z0) / c) + 1;
    const N = NAV.nx * NAV.nz; NAV.blocked = new Uint8Array(N); NAV.door = new Int16Array(N).fill(-1);
    for (const b of W.boxes) navStamp(b);
    navTowers();
    NAV.dist = new Float32Array(N).fill(1e9);
  }
  // the tower stairs and landings are off the zombies' map (they can't climb them; under a tower is fine)
  function navTowers() {
    const c = NAV.cell, bl = NAV.blocked;
    for (const d of W.navBlocks) {
      const ext = Math.sqrt(d.r2) + 0.5, i0 = Math.max(0, Math.floor((d.x - ext - NAV.x0) / c)), i1 = Math.min(NAV.nx - 1, Math.ceil((d.x + ext - NAV.x0) / c)), j0 = Math.max(0, Math.floor((d.z - ext - NAV.z0) / c)), j1 = Math.min(NAV.nz - 1, Math.ceil((d.z + ext - NAV.z0) / c));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (inRect(d, NAV.x0 + i * c, NAV.z0 + j * c) !== null) { bl[j * NAV.nx + i] = 1; NAV.door[j * NAV.nx + i] = -1; }
    }
  }
  // a body is 0.3 m round (0.33 for you): a gap narrower than 0.6 m isn't a way through
  const NAV_R = 0.3;
  const navUses = b => !(b.off || b.noWalk || b.navSkip || b.y0 > 1.2 || b.y1 < 0.3);
  function navRange(b) {
    const c = NAV.cell, ext = b.r + NAV_R + 0.5;
    return [Math.max(0, Math.floor((b.x - ext - NAV.x0) / c)), Math.min(NAV.nx - 1, Math.ceil((b.x + ext - NAV.x0) / c)), Math.max(0, Math.floor((b.z - ext - NAV.z0) / c)), Math.min(NAV.nz - 1, Math.ceil((b.z + ext - NAV.z0) / c))];
  }
  const navHits = (b, x, z) => { const dx = x - b.x, dz = z - b.z, lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c, ex = Math.max(0, Math.abs(lx) - b.hx), ez = Math.max(0, Math.abs(lz) - b.hz); return ex * ex + ez * ez < NAV_R * NAV_R; };
  function navStamp(b) {
    if (!navUses(b)) return;
    const c = NAV.cell, bl = NAV.blocked, dr = NAV.door, [i0, i1, j0, j1] = navRange(b);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      if (!navHits(b, NAV.x0 + i * c, NAV.z0 + j * c)) continue;
      const k = j * NAV.nx + i;
      if (b.door) { if (!bl[k]) { bl[k] = 3; dr[k] = b.doorRef.id; } } else { bl[k] = 1; dr[k] = -1; }
    }
  }
  // boxes switched on or off (the outbreak layer appearing): work out the cells under them again
  function navPatch(boxes) {
    if (!NAV.blocked || !grid) return;
    const c = NAV.cell, bl = NAV.blocked, dr = NAV.door;
    for (const b of boxes) {
      const [i0, i1, j0, j1] = navRange(b);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = NAV.x0 + i * c, z = NAV.z0 + j * c, k = j * NAV.nx + i;
        if (!navHits(b, x, z)) continue;
        bl[k] = 0; dr[k] = -1;
        for (const o of near(x, z, 0.6)) if (navUses(o) && navHits(o, x, z)) { if (o.door) { if (!bl[k]) { bl[k] = 3; dr[k] = o.doorRef.id; } } else { bl[k] = 1; dr[k] = -1; } }
      }
    }
    navTowers();
  }
  // distances from a goal (the player) out to radius R, so zombies can walk round walls toward you
  const heapD = new Float32Array(400000), heapK = new Int32Array(400000);
  // (fast path: the heap's pop writes to hD / hK instead of returning an array; the 8 neighbours are unrolled; only
  // the window searched last time and this time is reset; and when you're in the same cell, the doors are as they
  // were and it's less than 2 s since the last full search, nothing has changed — it's skipped)
  const navLast = { si: -1, sj: -1, R: 0, sig: -1, t: -99, i0: 0, i1: -1, j0: 0, j1: -1 };
  W.navFrom = (gx, gz, R = 55) => {
    const { nx, nz, blocked, dist } = NAV, c = NAV.cell, doors = W.doors;
    const si = clamp(Math.round((gx - NAV.x0) / c), 0, nx - 1), sj = clamp(Math.round((gz - NAV.z0) / c), 0, nz - 1);
    let sig = doors.length; for (let q = 0; q < doors.length; q++) if (doors[q].box && doors[q].box.off) sig = (sig * 31 + q + 1) | 0;
    const now = performance.now() / 1000, L = navLast;
    if (si === L.si && sj === L.sj && R === L.R && sig === L.sig && now - L.t < 2 && NAV.gen > 0) return;
    L.si = si; L.sj = sj; L.R = R; L.sig = sig; L.t = now;
    const Rc = Math.ceil(R / c), i0 = Math.max(0, si - Rc), i1 = Math.min(nx - 1, si + Rc), j0 = Math.max(0, sj - Rc), j1 = Math.min(nz - 1, sj + Rc);
    if (L.i1 < 0) dist.fill(1e9);
    else for (let j = L.j0; j <= L.j1; j++) dist.fill(1e9, j * nx + L.i0, j * nx + L.i1 + 1);
    for (let j = j0; j <= j1; j++) dist.fill(1e9, j * nx + i0, j * nx + i1 + 1);
    L.i0 = i0; L.i1 = i1; L.j0 = j0; L.j1 = j1;
    let n = 0, hD = 0, hK = 0;
    const push = (d, k) => { let i = n++; while (i > 0) { const p = (i - 1) >> 1; if (heapD[p] <= d) break; heapD[i] = heapD[p]; heapK[i] = heapK[p]; i = p; } heapD[i] = d; heapK[i] = k; };
    const pop = () => {
      hD = heapD[0]; hK = heapK[0]; n--;
      if (n > 0) { const d = heapD[n], k = heapK[n]; let i = 0; for (;;) { const l = 2 * i + 1; if (l >= n) break; const r = l + 1, m = r < n && heapD[r] < heapD[l] ? r : l; if (heapD[m] >= d) break; heapD[i] = heapD[m]; heapK[i] = heapK[m]; i = m; } heapD[i] = d; heapK[i] = k; }
    };
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const a = si + di, b = sj + dj; if (a < i0 || a > i1 || b < j0 || b > j1) continue; const k = b * nx + a; dist[k] = 0; push(0, k); }
    const SQ = 1.414;
    const relax = (d, i, j, a, b2, w, diag) => {
      if (a < i0 || b2 < j0 || a > i1 || b2 > j1) return;
      const kk = b2 * nx + a, bk = blocked[kk]; if (bk === 1 || bk === 2) return;
      if (diag) { const p = blocked[j * nx + a], q = blocked[b2 * nx + i]; if (p === 1 || p === 2 || q === 1 || q === 2) return; }
      let cost = w; if (bk === 3) { const D = doors[NAV.door[kk]]; if (D && !D.box.off) cost += 6; }   // a closed door: they'd rather go round, but they'll break through
      const nd = d + cost;
      if (nd < dist[kk]) { dist[kk] = nd; push(nd, kk); }
    };
    while (n > 0 && n < 399990) {
      pop(); const d = hD, k = hK; if (d > dist[k]) continue;
      const i = k % nx, j = (k / nx) | 0;
      relax(d, i, j, i + 1, j, 1, false); relax(d, i, j, i - 1, j, 1, false); relax(d, i, j, i, j + 1, 1, false); relax(d, i, j, i, j - 1, 1, false);
      relax(d, i, j, i + 1, j + 1, SQ, true); relax(d, i, j, i + 1, j - 1, SQ, true); relax(d, i, j, i - 1, j + 1, SQ, true); relax(d, i, j, i - 1, j - 1, SQ, true);
    }
    NAV.gen++;
  };
  // which way to walk from (x, z) toward the last navFrom goal; null when there's no route (or already there)
  W.navDir = (x, z) => {
    const { nx, nz, dist } = NAV, c = NAV.cell;
    const i = clamp(Math.round((x - NAV.x0) / c), 0, nx - 1), j = clamp(Math.round((z - NAV.z0) / c), 0, nz - 1);
    let ci = i, cj = j;
    if (dist[cj * nx + ci] >= 1e8) {
      let best = 1e9;
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= nz) continue; const v = dist[b * nx + a]; if (v < best) { best = v; ci = a; cj = b; } }
      if (best >= 1e8) return null;
    }
    // follow the route downhill for up to 6 cells, but only as far as you could walk in a straight line
    // (so you never aim across the end of a fence or a wall corner and get stuck on it)
    let ti = ci, tj = cj;
    const bl = NAV.blocked;
    const clearTo = (a, b) => {
      const ex = NAV.x0 + a * c, ez = NAV.z0 + b * c, L = Math.hypot(ex - x, ez - z), n = Math.ceil(L / 0.2);
      for (let k = 1; k <= n; k++) {
        const px = x + (ex - x) * k / n, pz = z + (ez - z) * k / n;
        // a body is ~0.6 m wide: check the line and either side of it
        for (const o of [0, 0.2, -0.2]) { const qx = px + (ez - z) / (L || 1) * o, qz = pz - (ex - x) / (L || 1) * o; const qi = Math.round((qx - NAV.x0) / c), qj = Math.round((qz - NAV.z0) / c); const bk = bl[qj * nx + qi]; if (bk === 1 || bk === 2) return false; }
      }
      return true;
    };
    const path = [];
    for (let s = 0; s < 6; s++) {
      let bi = ci, bj = cj, bv = dist[cj * nx + ci];
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const a = ci + di, b = cj + dj; if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
        if (di && dj && (bl[cj * nx + a] === 1 || bl[b * nx + ci] === 1)) continue;   // no cutting corners
        const v = dist[b * nx + a]; if (v < bv) { bv = v; bi = a; bj = b; }
      }
      if (bi === ci && bj === cj) break;
      ci = bi; cj = bj; path.push([ci, cj]);
    }
    // the furthest cell along the route you can walk to in a straight line; if you're already on top of the
    // nearest one, aim for the one after it (otherwise you'd overshoot, turn round, and bounce in a doorway)
    let k = 0; while (k + 1 < path.length && clearTo(path[k + 1][0], path[k + 1][1])) k++;
    if (path.length) { ti = path[k][0]; tj = path[k][1]; }
    if (Math.hypot(NAV.x0 + ti * c - x, NAV.z0 + tj * c - z) < 0.45 && k + 1 < path.length) { ti = path[k + 1][0]; tj = path[k + 1][1]; }
    const tx = NAV.x0 + ti * c, tz = NAV.z0 + tj * c;
    if (Math.hypot(tx - x, tz - z) < 0.15) return null;
    return Math.atan2(tx - x, tz - z);
  };
  W.navDist = (x, z) => { const c = NAV.cell, i = clamp(Math.round((x - NAV.x0) / c), 0, NAV.nx - 1), j = clamp(Math.round((z - NAV.z0) / c), 0, NAV.nz - 1); return NAV.dist[j * NAV.nx + i] * c; };
  W.steps = W.steps || [];
  // a point inside an oriented rect (decks, ramps); returns its local lz (or null)
  function inRect(d, x, z) {
    const dx = x - d.x, dz = z - d.z; if (dx * dx + dz * dz > d.r2) return null;
    const lx = dx * d.c - dz * d.s, lz = dx * d.s + dz * d.c;
    return Math.abs(lx) <= d.hx && Math.abs(lz) <= d.hz ? lz : null;
  }
  // the height of what you'd stand on at (x, z), for a body whose feet are now at curY. Raised floors (the tower
  // platforms, the landings, crate tops) and stair flights only count when you're already within 0.7 m below
  // them — so walking under a tower keeps you on the ground, and only the stairs (or a climb) take you up.
  // noClimb (zombies): never on stairs or raised floors.
  W.groundY = (x, z, curY = 0, noClimb = false) => {
    let g = groundY0(x, z);
    if (noClimb || (!W.decks.length && !W.ramps.length)) return g;
    for (const d of W.decks) { if (d.y <= g || curY <= d.y - 0.7) continue; if (inRect(d, x, z) !== null) g = d.y; }
    for (const d of W.ramps) {
      if (d.off) continue;
      const lz = inRect(d, x, z); if (lz === null) continue;
      const lo = Math.min(d.ya, d.yb), hi = Math.max(d.ya, d.yb);
      const y = clamp(lerp(d.ya, d.yb, (lz + d.hz) / (2 * d.hz)) - d.R / 2, lo, hi);   // through the middle of each tread
      if (y > g && curY > y - 0.7) g = y;
    }
    // the roofs: the shingles under you, once you're up there (only from above: never up through the attic)
    if (curY > 2.2) for (const R of W.roofs) { const y = roofY(R, x, z); if (y !== null && y > g && curY > y - 0.35) g = y; }
    return g;
  };
  // the height of the shingles at (x, z) on roof R, or null off its edges
  function roofY(R, x, z) {
    const dx = x - R.x, dz = z - R.z; if (dx * dx + dz * dz > R.r2) return null;
    const lx = dx * R.c - dz * R.s, lz = dx * R.s + dz * R.c;
    if (Math.abs(lx) > R.RX || Math.abs(lz) > R.RZ) return null;
    return R.yE + (R.yR - R.yE) * (1 - Math.abs(lz) / R.RZ) + (Math.abs(lz) < 0.17 ? 0.05 * (1 - Math.abs(lz) / 0.17) : 0);
  }
  W.roofY = (x, z) => { for (const R of W.roofs) { const y = roofY(R, x, z); if (y !== null) return y; } return null; };
  // is there something you could climb onto just ahead (a crate, a dumpster): its top 0.4–1.7 m above y, within
  // 0.9 m in the direction yaw, with room to stand up there? returns { x, z, y } — a spot on top — or null
  W.ledgeAhead = (x, z, y, yaw) => {
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    let best = null;
    for (const d of W.decks) {
      if (!d.climb) continue;
      const dh = d.y - y; if (dh < 0.4 || dh > 1.7) continue;
      const dx0 = x - d.x, dz0 = z - d.z; if (dx0 * dx0 + dz0 * dz0 > d.r2 + 4) continue;
      for (const dd of [0.3, 0.45, 0.6, 0.75, 0.9]) {
        const px = x + fx * dd, pz = z + fz * dd;
        if (inRect(d, px, pz) === null) continue;
        // land a body's width in from the edge, clamped inside the top
        const qx = px + fx * 0.3, qz = pz + fz * 0.3, ddx = qx - d.x, ddz = qz - d.z;
        let lx = ddx * d.c - ddz * d.s, lz = ddx * d.s + ddz * d.c;
        const mx = Math.max(0, d.hx - 0.3), mz = Math.max(0, d.hz - 0.3); lx = clamp(lx, -mx, mx); lz = clamp(lz, -mz, mz);
        const tx = d.x + lx * d.c + lz * d.s, tz = d.z - lx * d.s + lz * d.c;
        // headroom: nothing solid up there where the body would be
        let room = true;
        for (const b of near(tx, tz, 0.8)) {
          if (b.off || b.noWalk || b.zOnly || b.y0 > d.y + 1.7 || b.y1 < d.y + 0.3) continue;
          const bx = tx - b.x, bz = tz - b.z, ox = Math.max(0, Math.abs(bx * b.c - bz * b.s) - b.hx), oz = Math.max(0, Math.abs(bx * b.s + bz * b.c) - b.hz);
          if (ox * ox + oz * oz < 0.25 * 0.25) { room = false; break; }
        }
        if (room && (!best || dd < best.d)) best = { x: tx, z: tz, y: d.y, d: dd };
        break;
      }
    }
    return best ? { x: best.x, z: best.z, y: best.y } : null;
  };
  function groundY0(x, z) {
    if (W.mapId !== 'maple') {
      for (const st of W.steps) { const dx = x - st.x, dz = z - st.z; if (dx * dx + dz * dz > st.r2) continue; const lx = dx * st.c - dz * st.s, lz = dx * st.s + dz * st.c; if (Math.abs(lx) < st.hx && Math.abs(lz) < st.hz) return st.y; }
      return W.terrainH ? W.terrainH(x, z) : 0;
    }
    const ax = Math.abs(x), az = Math.abs(z);
    // the sidewalks (not across the other street), ramping down where a driveway cuts the curb
    if (az > 4.05 && az < 6.05 && ax < 112 && ax >= 4.05) { if (az < 5.0 && cutAt(true, Math.sign(z), x)) return 0.018 + (az - 4.05) / 0.95 * 0.092; return 0.11; }
    if (ax > 4.05 && ax < 6.05 && az < 112 && az >= 4.05) { if (ax < 5.0 && cutAt(false, Math.sign(x), z)) return 0.018 + (ax - 4.05) / 0.95 * 0.092; return 0.11; }
    for (const st of W.steps) { const dx = x - st.x, dz = z - st.z; if (dx * dx + dz * dz > st.r2) continue; const lx = dx * st.c - dz * st.s, lz = dx * st.s + dz * st.c; if (Math.abs(lx) < st.hx && Math.abs(lz) < st.hz) return st.y; }
    return 0;
  }
  W.walkable = (x, z) => { const c = NAV.cell, i = clamp(Math.round((x - NAV.x0) / c), 0, NAV.nx - 1), j = clamp(Math.round((z - NAV.z0) / c), 0, NAV.nz - 1); return NAV.blocked[j * NAV.nx + i] === 0; };

  // ================================================================ time of day
  // h: hours 0..24. Day: overcast and grey-gold; dusk: orange; night: blue-black with a weak moon.
  const C = (h) => new THREE.Color(h);
  const KEYS = [   // hour, sun elevation helper, zenith, horizon, sun colour, sun intensity, hemi, fog colour, fog density, env
    [0, C(0x05070c), C(0x0c1018), C(0x6a7a9a), 0.0, 0.07, C(0x0a0d14), 0.02, 0.05],
    [4.5, C(0x070a10), C(0x101420), C(0x6a7a9a), 0.0, 0.08, C(0x0e1118), 0.02, 0.06],
    [6, C(0x3a4658), C(0xb88a6a), C(0xffa060), 0.8, 0.5, C(0x6a6058), 0.016, 0.4],
    [8, C(0x55657a), C(0xb4b0a4), C(0xffe0b8), 2.2, 0.6, C(0xa4a29a), 0.011, 0.5],
    [13, C(0x5b6a7a), C(0xb9b4a8), C(0xffead0), 2.6, 0.65, C(0xa8a69e), 0.010, 0.55],
    [17.5, C(0x56606e), C(0xb8a890), C(0xffd0a0), 2.0, 0.55, C(0xa09888), 0.011, 0.45],
    [18.75, C(0x46506a), C(0xd09a6a), C(0xffb070), 1.4, 0.5, C(0x8a7468), 0.012, 0.42],   // golden hour
    [19.75, C(0x2a3040), C(0xc0704a), C(0xff8040), 0.7, 0.5, C(0x5a4a44), 0.015, 0.4],
    [21, C(0x0a0d16), C(0x1a1a24), C(0x6a7a9a), 0.0, 0.1, C(0x101219), 0.019, 0.08],
    [24, C(0x05070c), C(0x0c1018), C(0x6a7a9a), 0.0, 0.07, C(0x0a0d14), 0.02, 0.05],
  ];
  const tc = new THREE.Color();
  W.setTime = (h) => {
    W.time = h;
    let i = 0; while (i < KEYS.length - 2 && KEYS[i + 1][0] <= h) i++;
    const a = KEYS[i], b = KEYS[i + 1], t = smooth(a[0], b[0], h);
    uni.zen.value.copy(a[1]).lerp(b[1], t); uni.hor.value.copy(a[2]).lerp(b[2], t); uni.sunCol.value.copy(a[3]).lerp(b[3], t);
    let sunI = lerp(a[4], b[4], t), hemiI = lerp(a[5], b[5], t);
    // a bright, clear day (the Saturday before): blue sky, warm sun, clean air — rain cancels it
    const k = W.rain || 0;
    const sk = (W.sunny || 0) * clamp(sunI / 2.4, 0, 1) * (1 - k);
    if (sk > 0.001) { uni.zen.value.lerp(tc.set(0x3a74c0), sk * 0.95); uni.hor.value.lerp(tc.set(0xc6daea), sk * 0.75); uni.sunCol.value.lerp(tc.set(0xfff1da), sk * 0.5); sunI *= 1 + sk * 0.5; hemiI *= 1 + sk * 0.2; }
    // the sun's path: rises in the east (+x), sets in the west; it goes below the horizon (no light from under it)
    const ang = (h - 6) / 13.5 * Math.PI;   // 0 at 6:00, π at 19:30
    const el = Math.sin(ang) * 0.75;
    sunDir.set(Math.cos(ang) * 0.8, Math.sin(ang) * 0.72, -0.35 - Math.sin(ang) * 0.25).normalize();   // a tilted arc: low and long at the ends of the day
    W.daylight = clamp(sunI / 2.4, 0, 1);
    // night follows the sun's height (not the key light): the stars, the moon and the darker sky arrive together
    const night = 1 - smooth(-0.18, 0.02, el);
    uni.night.value = night;
    // the moon: opposite the sun — rises in the east (+x) as it gets dark, across the south side of the sky (the sun
    // goes over the north), sets in the west at dawn. Kept low (≤ ~30°) so it hangs where you look, over the rooftops.
    const mt = ((h - 18.8) % 24 + 24) % 24 / 11.8, ma = Math.min(mt, 1) * Math.PI;
    moonDir.set(Math.cos(ma) * 0.85, Math.max(0.06, Math.sin(ma) * 0.45), 0.75).normalize();
    const moonUp = mt > 1 ? 0 : smooth(0.04, 0.22, moonDir.y);   // low on the horizon it's dimmer (more air)
    // the cloud cover: heavy overcast after the outbreak, black in rain, nearly clear on the sunny Saturday
    uni.cloud.value = (W.preset && W.preset.cloud != null ? W.preset.cloud : 0.6) + k * 0.4;
    if (sk > 0.001) uni.cloud.value = lerp(uni.cloud.value, 0.12, sk);
    const cov = uni.cloud.value, over = smooth(0.35, 1.0, cov);
    // the key light crossfades: the sun fades out as it sets, then the (weak, blue) moon fades in — the switch of
    // direction happens while both are near zero, so no shadow ever jumps across the street
    const sunK = smooth(-0.04, 0.03, Math.sin(ang)), moonK = night;
    const sunPart = sunI * sunK * (1 - over * 0.85);
    // moonlight: cool and soft, enough to read the streets, the buildings and anything walking at you (cloud and
    // rain dim it); the same light and shadow map as the sun, so night costs nothing extra
    const moonL = moonK * (0.35 + 0.65 * moonUp) * (1 - over * 0.5) * (1 - k * 0.55);
    W.moonLight = moonL;
    if (sunPart < 0.02 && moonK > 0.02) { sun.color.setRGB(0.6, 0.71, 1.0); sun.intensity = 0.48 * moonL; W.lightDir = moonDir; }
    else { sun.color.copy(uni.sunCol.value); sun.intensity = sunPart; W.lightDir = sunDir; }
    FOL.fSun.value.copy(W.lightDir); FOL.fSunCol.value.copy(sun.color).multiplyScalar(sun.intensity * 0.45);
    // under cloud the sky carries the light: soft fill instead of hard sun
    hemi.intensity = hemiI * (1 + cov * 0.6) * (1 - k * 0.2);
    hemi.color.copy(uni.zen.value).lerp(tc.set(0xb8c4d4), 0.5); if (W.daylight < 0.4) hemi.color.lerp(uni.hor.value, (0.4 - W.daylight) * 1.5);
    hemi.groundColor.set(0x4a4436).multiplyScalar(0.3 + W.daylight * 0.7);
    // the moonlit sky: a cool blue fill at night so shapes read in the dark (silhouettes, roads, walls)
    if (night > 0.01) { hemi.color.lerp(tc.set(0x7a8cb0), night * 0.75); hemi.groundColor.lerp(tc.set(0x2a2c34), night * 0.6); hemi.intensity += night * (0.25 + 0.15 * moonL); }
    sun.shadow.radius = 1 + cov * 5;
    scene.fog.color.copy(a[6]).lerp(b[6], t); scene.fog.density = lerp(a[7], b[7], t);
    if (night > 0.01) { scene.fog.color.lerp(uni.hor.value, night * (0.35 + 0.4 * moonL)); scene.fog.density *= 1 - night * 0.18; }   // moonlit haze, the colour of the sky low down: far shapes stand out dark against it, no band where the fog meets the sky
    scene.environmentIntensity = lerp(a[8], b[8], t) * (1 + cov * 0.4);
    if (sk > 0.001) { scene.fog.density *= 1 - sk * 0.6; scene.fog.color.lerp(tc.set(0xc8d8e6), sk * 0.75); scene.environmentIntensity *= 1 + sk * 0.3; }
    W.night = night;
    if (W.preset) applyPreset(W.preset, k);
    if (W.hills && W.hills.userData.far) W.hills.userData.far.material.color.copy(W.hills.material.color).lerp(scene.fog.color, 0.5);   // the far ridge: paler, into the haze
    // rain: thicker air, dark glossy wet streets and roofs
    if (k > 0.001) scene.fog.density *= 1 + k * 0.7;
    if (Math.abs(k - (W._wetK ?? -1)) > 0.01) {
      W._wetK = k;
      for (const [m, r0, c0] of WET) { m.roughness = r0 * (1 - k * 0.62); m.color.copy(c0).multiplyScalar(1 - k * 0.28); m.envMapIntensity = 1 + k * 1.2; }
      // in real rain, water stands in the dips: mirror-smooth puddles on the road, the walks and the drives
      const pud = k > 0.25 ? PUDDLE : DRY;   // texture to texture: no shader recompile (no hitch as the rain builds)
      for (const m of [MAT.road, MAT.walk, MAT.drive]) if (m.roughnessMap !== pud) m.roughnessMap = pud;
    }
    // re-bake the reflections every half hour of sky change (a couple of ms)
    const key = Math.round(h * 2) + '|' + Math.round((W.sunny || 0) * 4) + '|' + Math.round(k * 4);
    { const now = performance.now() / 1000; if (key !== W._envKey && (W._envKey === undefined || now - (W._envT ?? -99) > 4)) { W._envKey = key; W._envT = now; rebakeEnv(); } }
  };
  const DRY = (() => { const t = new THREE.DataTexture(new Uint8Array(16 * 4).fill(255), 4, 4); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; return t; })();
  for (const m of [MAT.road, MAT.walk, MAT.drive]) if (m && !m.roughnessMap) { m.roughnessMap = DRY; m.needsUpdate = true; }
  const PUDDLE = (() => {   // fewer, bigger puddles with crisp edges
    const N = 256, cv = document.createElement('canvas'); cv.width = cv.height = N; const g = cv.getContext('2d'), img = g.createImageData(N, N);
    const rnd = new Float32Array(32 * 32).map(() => Math.random()), vn = (x, y) => { const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, a = (u, v) => rnd[((v & 31) * 32) + (u & 31)], sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy); return (a(i, j) * (1 - sx) + a(i + 1, j) * sx) * (1 - sy) + (a(i, j + 1) * (1 - sx) + a(i + 1, j + 1) * sx) * sy; };
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const n = vn(x / 14, y / 14) * 0.7 + vn(x / 5, y / 5) * 0.22 + vn(x / 2, y / 2) * 0.08, w = smooth(0.6, 0.63, n), v = Math.round(255 * (1 - w * 0.92)), i = (y * N + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(0.4, 0.4); return t;
  })();
  const WET = ['road', 'walk', 'drive', 'concrete', 'curb', 'shingle0', 'shingle1', 'shingle2', 'brick', 'plank', 'fence', 'roadLine', 'roadWhite'].map(k => MAT[k]).filter(Boolean).map(m => [m, m.roughness, m.color.clone()]);
  W.setTime(8);

  // ================================================================ light build (phones and tablets only)
  // Nothing here runs on desktop. Collisions, nav, searching are untouched: only what gets drawn changes.
  // - small things far away aren't drawn (and so cast no shadow): hidden by layer mask (the game's own .visible
  //   switches stay its own), checked a few times a second against where they are now (cars drive, doors swing)
  // - tiny things never cast a shadow; clearcoat / sheen / transmission off (the costly physical shader paths)
  const CULL = [];   // [object, local centre x,y,z, slack (distance measured from the sphere's edge), hide distance², hidden]
  const tune = new WeakSet();
  function cheapMat(m) {
    if (!m || tune.has(m)) return; tune.add(m);
    if (m.isMeshPhysicalMaterial) { if (m.clearcoat) m.clearcoat = 0; if (m.sheen) m.sheen = 0; if (m.transmission) m.transmission = 0; if (m.iridescence) m.iridescence = 0; if (m.anisotropy) m.anisotropy = 0; }
    if (m.normalMap && LOW > 1 && !(m.userData && m.userData.keepNormal)) { m.normalMap = null; m.needsUpdate = true; }
  }
  W.cheapMat = cheapMat;
  function lightBuild() {
    const base = LOW > 1 ? 16 : 26, per = LOW > 1 ? 16 : 20, bigR = LOW > 1 ? 7 : 9, far = LOW > 1 ? 130 : 180, seen = new Set(CULL.map(c => c[0]));
    level.traverse(o => {
      if (o.material) for (const m of [].concat(o.material)) cheapMat(m);
      if (!o.isMesh || o.isSkinnedMesh || seen.has(o) || o.frustumCulled === false || o.layers.mask !== 1) return;
      let sp;
      if (o.isInstancedMesh) { if (!o.boundingSphere) o.computeBoundingSphere(); sp = o.boundingSphere; }
      else { const g = o.geometry; if (!g) return; if (!g.boundingSphere) g.computeBoundingSphere(); sp = g.boundingSphere; }
      if (!sp || !(sp.radius >= 0)) return;
      o.updateWorldMatrix(true, false);
      const sc = o.matrixWorld.getMaxScaleOnAxis(), r = sp.radius * sc;
      // an instanced bucket spreads its copies over a 40 m cell: how big ONE of them is decides how far it's drawn,
      // measured from the edge of the cell
      let item = r, slack = 0;
      if (o.isInstancedMesh) {   // (each copy has its own scale: a unit box stretched into a lamp post)
        const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
        let ms = 0; const a = o.instanceMatrix.array;
        for (let i = 0; i < o.count; i++) { const k = i * 16; ms = Math.max(ms, a[k] * a[k] + a[k + 1] * a[k + 1] + a[k + 2] * a[k + 2], a[k + 4] * a[k + 4] + a[k + 5] * a[k + 5] + a[k + 6] * a[k + 6], a[k + 8] * a[k + 8] + a[k + 9] * a[k + 9] + a[k + 10] * a[k + 10]); }
        item = (g.boundingSphere.radius + g.boundingSphere.center.length()) * Math.sqrt(ms) * sc; slack = r;
      }
      if (item < (LOW > 1 ? 0.35 : 0.2) && o.castShadow && !o.isInstancedMesh) o.castShadow = false;   // smaller than a shadow texel at this map size
      if (o.isInstancedMesh && item < (LOW > 1 ? 0.2 : 0.12) && o.castShadow) o.castShadow = false;
      // big merged chunks (whole blocks of street) only go once they're deep in the fog
      const D = item >= bigR ? far : base + item * per;
      if (item >= bigR) slack = r;
      CULL.push([o, sp.center.x, sp.center.y, sp.center.z, slack, D * D, false]);
    });
    W.cullCount = CULL.length;
  }
  W.lightBuild = () => { if (LOW) lightBuild(); };   // maps / later additions can call it again (already-known objects are skipped)
  let cullI = 0, cullT = 0;
  const cv = new THREE.Vector3();
  function cullFar(dt, focus, kIn = 1) {
    if (!CULL.length) return;
    const cam = C.camera, p = cam ? cam.getWorldPosition(cv) : focus;
    const zoom = cam && cam.fov ? Math.max(1, 55 / cam.fov) : 1, z2 = zoom * zoom;   // zoomed in / scoped: see further
    // a slice per frame: the whole list about 4 times a second
    cullT += dt; const n = Math.min(CULL.length, Math.ceil(CULL.length * Math.min(1, cullT * 4))); if (n < 64 && n < CULL.length) return; cullT = 0;
    for (let k = 0; k < n; k++) {
      if (cullI >= CULL.length) cullI = 0;
      const c = CULL[cullI++], o = c[0], e = o.matrixWorld.elements;
      const x = e[0] * c[1] + e[4] * c[2] + e[8] * c[3] + e[12] - p.x, y = e[1] * c[1] + e[5] * c[2] + e[9] * c[3] + e[13] - p.y, zz = e[2] * c[1] + e[6] * c[2] + e[10] * c[3] + e[14] - p.z;
      let d2 = x * x + y * y + zz * zz; const lim = c[5] * z2 * kIn * kIn;
      if (c[4] > 0) { const d = Math.max(0, Math.sqrt(d2) - c[4]); d2 = d * d; }
      const hide = c[6] ? d2 > lim * 0.9 : d2 > lim * 1.1;   // a little hysteresis: no flicker at the edge
      if (hide !== c[6]) { c[6] = hide; o.layers.mask = hide ? 0 : 1; }
    }
  }

  // ================================================================ per frame
  const texel = (SS * 2) / sun.shadow.mapSize.x;
  let lampT = 0, houseT = 0;
  const HOUSE_D = LOW > 1 ? 22 : LOW ? 32 : 48;   // a house's cupboards and drawers are drawn this close (phones: only next door)
  W.update = (dt, t, focus, inside) => {
    sun.target.position.set(Math.round(focus.x / texel) * texel, 0, Math.round(focus.z / texel) * texel);
    sun.position.copy(sun.target.position).addScaledVector(W.lightDir || sunDir, 140);
    dome.position.copy(focus);
    ground.position.set(Math.round(focus.x / 50) * 50, ground.userData.y, Math.round(focus.z / 50) * 50);
    W.hills.position.set(focus.x, 0, focus.z);
    uni.time.value = t; FOL.fTime.value = t;
    grass.update(t, focus);
    updateProps(dt); updateBreakables(dt);
    if (LOW) cullFar(dt, focus, inside && !inside.cave ? 0.45 : 1);   // indoors only the near things can be seen (out of the windows)
    for (const c of W.shutCargo) { const v = (c.openK || 0) > 0.3; for (const it of c.items) if (it.mesh.visible !== (v && !it.taken)) it.mesh.visible = v && !it.taken; }   // a closed trunk lid hides what's inside
    for (let i = W.opening.length - 1; i >= 0; i--) {
      const c = W.opening[i], up = c.openTarget === 1;
      c.openK = up ? Math.min(1, c.openK + dt / 0.7) : Math.max(0, c.openK - dt / 0.9); const k = c.openK;
      applyOpen(c, up ? 1 - (1 - k) * (1 - k) * (1 - k) : k * k * (3 - 2 * k));   // flung open; pushed shut gently
      if (up && k >= 1) { W.opening.splice(i, 1); if (c.parts) { leafSolids(c, true); c.openAt = t; if (!W.openNow.includes(c)) W.openNow.push(c); } }
      else if (!up && k <= 0) W.opening.splice(i, 1);
    }
    for (let i = W.openNow.length - 1; i >= 0; i--) {   // swung shut behind you once you're 5 m off
      const c = W.openNow[i]; if (!c.parts) { W.openNow.splice(i, 1); continue; }
      if (focus && t - (c.openAt ?? t) > 4 && Math.hypot(c.x - focus.x, c.z - focus.z) > 5 && !c.car) { c.openTarget = 0; leafSolids(c, false); W.openNow.splice(i, 1); if (!W.opening.includes(c)) W.opening.push(c); }
    }
    // doors swing (and fall when broken)
    for (const D of W.doors) {
      if (D.fall) { D.obox.off = true; D.fall.t += dt; const k = Math.min(1, D.fall.t / 0.5); D.pivot.rotation.x = -k * k * Math.PI / 2 * 0.98 * D.fall.dir; D.pivot.position.y = D.y || 0; continue; }
      if (Math.abs(D.open - D.want) > 0.001) {
        D.open += clamp(D.want - D.open, -dt * 2.2, dt * 2.2);
      }
      { const shut = D.open < 0.12; if (!D.broken && !!D.box.off === shut) D.box.off = !shut;
        const e = D.open * D.open * (3 - 2 * D.open);   // eased swing: starts and stops softly
        // the swinging leaf's box goes where the leaf is
        const sw = !D.broken && !shut; if (D.obox.off === sw) D.obox.off = !sw;
        if (sw && D.obox._k !== D.open) { const ob = D.obox, oa = D.yaw + D.dir * e * Math.PI / 2 * 0.95; ob._k = D.open; ob.x = D.hx + Math.cos(oa) * D.w / 2; ob.z = D.hz - Math.sin(oa) * D.w / 2; ob.yaw = oa; ob.c = Math.cos(oa); ob.s = Math.sin(oa); }
        D.pivot.rotation.y = D.yaw + D.dir * e * Math.PI / 2 * 0.95; }
      if (D.bangT > 0) { D.bangT -= dt; D.pivot.rotation.y += Math.sin(D.bangT * 60) * 0.015 * D.bangT; }
    }
    // the cupboards and drawers (their doors, fronts, insides) of houses far away aren't drawn
    // (and an attic's insides only near it; its pull-down ladder a bit further, seen through the kitchen window)
    if ((houseT -= dt) <= 0) { houseT = 0.4; for (const H of W.houses) { const d = Math.hypot(H.x - focus.x, H.z - focus.z); if (H.HG) { const v = H === inside || d < HOUSE_D; if (H.HG.visible !== v) H.HG.visible = v; } if (H.atticG) { const v = H === inside || d < 14; if (H.atticG.visible !== v) H.atticG.visible = v; } if (H.ladderG) { const v = H === inside || d < 26; if (H.ladderG.visible !== v) H.ladderG.visible = v; } } }
    // up in an attic (or on a roof): what's downstairs can't be searched from there, and the attic's own things can
    const fy = focus.gy || 0, up = fy > 2.2;
    if (W._up !== up) { W._up = up; for (const c of W.containers) if (c.house) c.hidden = up ? !c.attic : !!c.attic; }
    // in an attic the bare bulb is on (one light, moved to whichever attic you're in)
    { const H = up && inside && inside.bulb && fy < inside.yTop(0) - 0.6 ? inside : null;
      if (H) { atticLight.position.set(H.bulb[0], H.bulb[2] - 0.05, H.bulb[1]); atticLight.intensity = 3.2; } else atticLight.intensity = 0;
      if (W.atticBulbMat) W.atticBulbMat.emissiveIntensity = H ? 2.5 : 0; }
    // indoors as the day goes: a warm lamp-lit room (one light, moved to whichever house you're in), eased on
    // (placed over the middle of the room you're in; in a big hall it hangs over you, kept inside the room)
    { let want = inside && !up && W.daylight < 0.6 ? 6 * (1 - W.daylight / 0.6) * (W.powerOn ?? 1) : 0;
      if (want > 0) want *= placeRoomLight(inside, focus);
      roomLight.intensity += (want - roomLight.intensity) * Math.min(1, dt * 3); if (roomLight.intensity < 0.01) roomLight.intensity = 0; }
    // a cave / a windowless room never goes pitch black: the sky's fill has a floor in there
    if (inside && inside.cave && hemi.intensity < 0.32) hemi.intensity = 0.32;
    // the house lamps' shades and the ceiling fixtures glow once it's dark (if there's power)
    { const e = W.daylight < 0.4 && (W.powerOn ?? 1) > 0 ? 1.6 : 0; if (MAT.lampShade.emissiveIntensity !== e) { MAT.lampShade.emissiveIntensity = e; MAT.fixture.emissiveIntensity = e; } }
    for (const a of W.anims) a(dt, t, focus);
    { let best = null, bd = 45 * 45; for (const h of W.hazards) { if (h.off || h.kind !== 'fire') continue; const d = (h.x - focus.x) ** 2 + (h.z - focus.z) ** 2; if (d < bd) { bd = d; best = h; } }
      if (best) { fireLight.position.set(best.x, 1.3, best.z); fireLight.intensity = 26 * (0.75 + 0.15 * Math.sin(t * 13) + 0.1 * Math.sin(t * 31.7)); } else fireLight.intensity = 0; }
    // the roof over the house you're in isn't drawn — but it still shades the rooms (it keeps casting its shadow);
    // from its attic (or up on top of it) you see it again
    for (const H of W.houses) {
      const hide = H === inside && !up && !W.firstPerson; if (H._hid === hide) continue; H._hid = hide;   // (first person: you see the ceiling, so the roof stays)
      H.roof.traverse(o => { if (!o.isMesh) return; o.userData.mat ??= o.material; o.material = hide ? MAT.shadowOnly : o.userData.mat; });
    }
    // street lamps come on at dusk (photocells): bulbs glow, a pool of light on the road, the closest few cast real light
    lampT -= dt;
    { const wet = W.rain || 0; haloMat.opacity = 0.22 + wet * 0.25; shaftUni.k.value = 0.008 + wet * 0.045 + Math.max(0, scene.fog.density - 0.012) * 1.5; poolMat.opacity = 0.32 + wet * 0.18; }
    const on = W.daylight < 0.45;
    for (const L of W.lamps) {
      // (L.power: a map can dim / cut a lamp, 0..1 — the prison's failing power; maps' own lamps (K.lamp) may have
      // no bulb mesh or pool of their own: their glow is a shared emissive material the map drives itself)
      let e = on && !L.broken ? 2.2 * (L.power ?? 1) : 0;
      if (L.flicker && on) { L.ph += dt * 13; e *= (Math.sin(L.ph) > -0.3 || Math.sin(L.ph * 0.37) > 0.8) ? 1 : 0.08; }
      if (L.bulb) L.bulb.material.emissiveIntensity = e;
      L.on = e > 0.5;
      if (L.pool && L.pool.visible !== L.on) L.pool.visible = L.on;
      const hl = L.pool ? L.pool.userData.halo : L.halo;
      if (hl && hl.visible !== L.on) { hl.visible = L.on; if (L.pool && L.pool.userData.shaft) L.pool.userData.shaft.visible = L.on; }
    }
    if (lampT <= 0) {
      lampT = 0.5;
      // (the big floodlights — pow ≥ 10, a prison yard's masts — win a slot whenever they're within 80 m)
      const lit = W.lamps.filter(L => !L.broken).map(L => { const d = Math.hypot(L.x - focus.x, L.z - focus.z); return [L, d - (L.reach || 0) - ((L.pow || 1) >= 10 && d < 80 ? 1000 : 0)]; }).sort((a, b) => a[1] - b[1]).slice(0, lampLights.length);
      lampLights.forEach((pl, i) => { const L = lit[i] && lit[i][0]; pl.userData.lamp = L; if (L) { pl.position.set(L.x, L.y, L.z); pl.target.position.set(L.tx ?? L.x, 0, L.tz ?? L.z); pl.target.updateMatrixWorld(); pl.distance = L.dist || 24; pl.angle = L.angle || 1.05; pl.color.setHex(L.col || 0xffc890); } });
    }
    // they light the street, not the inside of the house you're standing in (no shadows from these: so cut them there)
    for (const pl of lampLights) { const L = pl.userData.lamp; pl.intensity = L && L.on && !inside ? 70 * (L.pow || 1) * Math.min(1, L.power ?? 1) : 0; }
    // porch lanterns, the gas station canopy, the store sign at night; the store's tubes once the trouble starts
    const dark = W.daylight < 0.4;
    MAT.porchOn.emissiveIntensity = dark ? 2.2 : 0;
    { const k = clamp((0.5 - W.daylight) * 3, 0, 1); MAT.glassLit.emissiveIntensity = k * 0.85; MAT.glassLit.opacity = 0.24 + k * 0.5; }
    if (W.canopyLights) { W.canopyLights.emissiveIntensity = W.daylight < 0.5 ? 2.5 : 0; canopyLight.intensity = W.daylight < 0.5 ? 60 : 0; }
    if (W.storeSign) W.storeSign.emissiveIntensity = dark ? 0.9 : 0.25;
    if (W.storeLights) {
      const S = W.storeLights, bad = S.chaos && S.chaos.shown;
      let f = 1; if (bad) { S.ph += dt * (8 + Math.sin(t * 0.7) * 5); f = Math.sin(S.ph) > 0.2 || Math.sin(S.ph * 0.23) > 0.6 ? 1 : 0.05; }
      S.flickMat.emissiveIntensity = 1.5 * f;
      // their light only matters in and round the store (no glow out of its windows from across town)
      const near = S.cx == null || Math.hypot(focus.x - S.cx, focus.z - S.cz) < 30;
      S.lights.forEach((L, i) => { L.intensity = near ? (L.userData.base ?? 5) * (i === 0 ? 0.4 + 0.6 * f : 1) : 0; });
      if (S.dead.visible !== bad) S.dead.visible = bad;
    }
    // the police lights still turning
    if (W.police && W.police.hidden) policeLight.intensity = 0;
    else if (W.police) { const k = Math.floor(t * 3) % 2; W.police.bar.red.emissiveIntensity = k ? 3 : 0.2; W.police.bar.blue.emissiveIntensity = k ? 0.2 : 3; policeLight.color.setHex(k ? 0xff2010 : 0x1030ff); policeLight.intensity = W.night > 0.3 ? 10 : 3; }
    poolLights(C.camera ? C.camera.position : focus);
  };
  // the nearest lamps' light: spots pointing straight down (so it falls on the road, not up into the trees)
  const lampLights = [];
  const addLampSlot = () => { const l = new THREE.SpotLight(0xffc890, 0, 24, 1.05, 0.65, 1.6); scene.add(l, l.target); lampLights.push(l); };
  for (let i = 0; i < (LOW ? 2 : 4); i++) addLampSlot();
  // a map may ask for more (W.lampSlots, set while it builds; capped — each one costs every lit pixel)
  const growLampSlots = () => { const want = Math.min(W.lampSlots || 0, LOW ? 3 : 6); while (lampLights.length < want) addLampSlot(); };
  const canopyLight = new THREE.SpotLight(0xfff2d8, 0, 20, 1.2, 0.7, 1.5); scene.add(canopyLight, canopyLight.target);
  W.placeCanopyLight = (x, z) => { canopyLight.position.set(x, 4.4, z); canopyLight.target.position.set(x, 0, z); canopyLight.target.updateMatrixWorld(); };
  const atticLight = new THREE.PointLight(0xffd6a0, 0, 9, 1.6); addLight(atticLight, scene);
  const roomLight = new THREE.PointLight(0xffd8a8, 0, 8, 1.5); addLight(roomLight, scene);
  // move the room light to the room the player is in (H.rooms, in the house's local frame); returns an intensity scale
  function placeRoomLight(H, f) {
    const c = Math.cos(H.yaw), sn = Math.sin(H.yaw), fl = H.flip || 1, dx = f.x - H.x, dz = f.z - H.z;
    const lx = (dx * c - dz * sn) * fl, lz = dx * sn + dz * c;
    let R = null; if (H.rooms) for (const r of H.rooms) if (lx >= r[0] && lx <= r[2] && lz >= r[1] && lz <= r[3]) { R = r; break; }
    let cx = 0, cz = 0, hw = H.hw || 4, hd = H.hd || 4;
    if (R) { cx = (R[0] + R[2]) / 2; cz = (R[1] + R[3]) / 2; hw = (R[2] - R[0]) / 2; hd = (R[3] - R[1]) / 2; }
    let px = cx, pz = cz;
    if (hw > 6 || hd > 6) { px = clamp(lx, cx - Math.max(0, hw - 1), cx + Math.max(0, hw - 1)); pz = clamp(lz, cz - Math.max(0, hd - 1), cz + Math.max(0, hd - 1)); }
    const wx = px * fl;
    roomLight.position.set(H.x + wx * c + pz * sn, (H.floorY || 0) + (H.wallH ? H.wallH - 0.4 : 2.4), H.z - wx * sn + pz * c);
    const dist = clamp(Math.max(hw, hd) * 1.1, 8, 26); roomLight.distance = dist;
    roomLight.color.setHex(W.mapId === 'prison' ? 0xe4ecff : 0xffd8a8);   // (prison: cold strip lights)
    return clamp(dist / 8, 1, 2.2);
  }
  const fireLight = new THREE.PointLight(0xff7a2a, 0, 16, 1.7); addLight(fireLight, scene);   // the glow of the nearest fire (one light, moved about)
  const policeLight = new THREE.PointLight(0xff2010, 0, 16, 1.8); policeLight.position.set(1.5, 2.2, -100); addLight(policeLight, scene);
  W.grass = grass;
  // ================================================================ the map system
  // W.build(mapId, mod): 'maple' is the hand-built town above (unchanged). Any other map is a module
  // (js/maps/<id>.js) whose buildMap(K) lays it out with the kit K below — the API is documented in js/maps/kit.js.
  W.mapId = 'maple'; W.waters = []; W.regions = []; W.terrainH = null; W.preset = null; W.lz = { x: 0, z: 0 }; W.ambient = 'suburb';
  const PRESETS = {
    suburb: null,
    // hot, clear and dusty: a deep blue zenith, pale sand-coloured haze, thin cloud, low mesas all round
    desert: { zen: 0x2f63b0, hor: 0xe2d2ae, fog: 0xd6c6a2, fogMul: 0.55, cloud: 0.14, full: true, hills: 0x9a7250, hillH: 1.9, ground: 'sand', grassK: 0, grass: false, step: 'gravel', ambient: 'desert' },
    // humid green gloom: thick low haze, heavy cloud, a dark wall of canopy round the edge; a muddy leaf-litter floor
    // with grass only in the clearings. At night the haze keeps a little green-grey light so you can still see
    jungle: { zen: 0x56706a, hor: 0xb4c0a6, fog: 0x7c8e78, fogMul: 1.6, cloud: 0.72, hills: 0x172812, hillH: 1.5, ground: 'mud', grassK: 0.35, step: 'grass', ambient: 'jungle', nightHemi: 0.22, nightHemiCol: 0x6a8478, nightFog: 0x1a2420 },
    // grey concrete overcast, flat light, scrubby yard dirt; at night the sodium lights glow orange under the cloud
    prison: { zen: 0x56606c, hor: 0xa4a6a6, fog: 0x989a9a, fogMul: 1.0, cloud: 0.82, hills: 0x363c32, hillH: 0.9, ground: 'dirt', grassK: 0.3, step: 'concrete', ambient: 'prison', nightGlow: 0x3a2e22, nightGlowK: 0.18, nightHor: 0x4a3a2c },
    // city edge: hazy, a skyline of grey blocks instead of trees; the city lights the night sky low down
    stadium: { zen: 0x4c6888, hor: 0xc2baa8, fog: 0xa2a2a0, fogMul: 0.8, cloud: 0.42, hills: 0x4a4e54, hillH: 1.6, ground: 'grass', grassK: 0.55, step: 'concrete', ambient: 'city', nightHor: 0x3a2a22 },
  };
  W.PRESETS = PRESETS;
  const ptc = new THREE.Color();
  // called from setTime after the suburb sky is worked out: tint it toward the map's own air (strongest by day)
  function applyPreset(PR, wet) {
    const dk = W.daylight * (1 - wet * 0.7), nt = W.night || 0, kk = (PR.full ? 1 : 0.7) * dk;   // (clear-air maps take their own sky fully)
    if (PR.zen != null) uni.zen.value.lerp(ptc.set(PR.zen), kk);
    if (PR.hor != null) uni.hor.value.lerp(ptc.set(PR.hor), kk);
    if (PR.fog != null) scene.fog.color.lerp(ptc.set(PR.fog), 0.75 * dk);
    if (PR.fogMul != null) scene.fog.density *= PR.fogMul;
    if (nt > 0.01) {
      // a city's / a prison's lights glow in the low sky at night, and the haze takes that colour
      if (PR.nightHor != null) { uni.hor.value.lerp(ptc.set(PR.nightHor), nt * 0.8); scene.fog.color.lerp(uni.hor.value, nt * 0.6); }
      if (PR.nightFog != null) scene.fog.color.lerp(ptc.set(PR.nightFog), nt * 0.8);
      if (PR.nightHemi != null) hemi.intensity += PR.nightHemi * nt;
      if (PR.nightHemiCol != null) hemi.color.lerp(ptc.set(PR.nightHemiCol), nt * 0.6);
      if (PR.nightGlow != null) { const g = PR.nightGlowK ?? 0.15; hemi.groundColor.lerp(ptc.set(PR.nightGlow), nt * 0.7); hemi.color.lerp(ptc, nt * 0.35); hemi.intensity += g * nt; }
    }
  }
  function setPreset(name) {
    const PR = typeof name === 'string' ? PRESETS[name] : name;
    W.preset = PR || null; W.presetName = typeof name === 'string' ? name : 'custom';
    if (!PR) return;
    if (PR.hills != null) W.hills.material.color.set(PR.hills);
    if (PR.hillH != null) W.hills.scale.y = PR.hillH;
    if (PR.ground) groundKindSet(PR.ground);
    if (PR.grassK != null) W.grassK = PR.grassK;
    if (PR.grass === false) { W.grassK = 0; grass.mesh.visible = false; }   // bare sand: no lawn blades
    if (PR.step) W.groundStep = PR.step;
    if (PR.ambient) W.ambient = PR.ambient;
    W.setTime(W.time);
  }
  // the base ground everywhere: 'grass' (lawn), 'dirt', 'sand', 'mud'
  function groundKindSet(kind) {
    const t = kind === 'sand' ? TX.sandTexture() : kind === 'dirt' ? gt.dirt : kind === 'mud' ? gt.litter : gt.grass;
    gUni.tGrass.value = t; groundMat.map = t; groundMat.needsUpdate = true;
    if (kind === 'sand' && W.groundStep == null) W.groundStep = 'gravel';
  }
  // a stretch of ground of its own: paints the ground mask and says what footsteps sound like there.
  // kind: 'dirt' | 'mud' | 'dark' (scorched / oily) | 'paved' (no grass blades, no paint) ; step: footstep surface
  function region(x0, z0, x1, z1, kind = 'dirt', step = null, a = 0.9) {
    if (x0 > x1) [x0, x1] = [x1, x0]; if (z0 > z1) [z0, z1] = [z1, z0];
    W.regions.push({ x0, z0, x1, z1, kind, step: step || (kind === 'paved' ? 'concrete' : kind === 'mud' ? 'grass' : 'gravel') });
    if (kind === 'paved' || step === 'concrete' || step === 'asphalt' || step === 'wood') paved.push([x0, z0, x1, z1]);
    if (kind === 'paved') return;
    const st = 2.2;
    for (let x = x0 + st / 2; x < x1; x += st) for (let z = z0 + st / 2; z < z1; z += st) paint(x, z, st * 1.1, kind, a * 0.45);
  }
  // a flat paved slab laid on the ground (a car park, a yard, a pitch, a runway): drawn and walkable, not solid
  function slab(x0, z0, x1, z1, mat = 'drive', step = 'concrete', y = 0.02) {
    if (x0 > x1) [x0, x1] = [x1, x0]; if (z0 > z1) [z0, z1] = [z1, z0];
    B.box((x0 + x1) / 2, 0, (z0 + z1) / 2, (x1 - x0) / 2, y, (z1 - z0) / 2, 0, f => f === 'top' ? mat : null, TILE);
    W.regions.push({ x0, z0, x1, z1, kind: 'paved', step }); paved.push([x0, z0, x1, z1]);
  }
  // still water: a glossy dark plane (rivers, ponds, a flooded pit). Not solid; add solid() banks if it's deep.
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x27403f, roughness: 0.06, metalness: 0.15, transparent: true, opacity: 0.88, envMapIntensity: 1.6 });
  function water(x0, z0, x1, z1, y = 0.03, color = null) {
    if (x0 > x1) [x0, x1] = [x1, x0]; if (z0 > z1) [z0, z1] = [z1, z0];
    const wm = color == null ? waterMat : waterMat.clone(); if (color != null) wm.color.set(color);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2), wm);
    m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); m.receiveShadow = true; m.renderOrder = 1; level.add(m);
    const w = { x0, z0, x1, z1, y, mesh: m }; W.waters.push(w);
    W.regions.push({ x0, z0, x1, z1, kind: 'water', step: 'water' }); paved.push([x0, z0, x1, z1]);
    return w;
  }
  // terrain: fn(x, z) → ground height in metres. Builds a displaced ground sheet over the map's bounds (+60 m),
  // and from then on W.groundY follows it. Keep it 0 where you put buildings and at the far edges.
  let terrainMesh = null;
  function terrain(fn, step = 2) {
    W.terrainH = fn;
    if (LOW && step < 3) step = 3;   // phones / tablets: a coarser sheet (less than half the triangles); one mesh still (maps edit it)
    const Bd = W.bounds, x0 = Bd.x0 - 60, x1 = Bd.x1 + 60, z0 = Bd.z0 - 60, z1 = Bd.z1 + 60;
    const nx = Math.ceil((x1 - x0) / step), nz = Math.ceil((z1 - z0) / step);
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, nx, nz).rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i) + (x0 + x1) / 2, z = p.getZ(i) + (z0 + z1) / 2; p.setY(i, fn(x, z) - 0.006); }
    g.computeVertexNormals();
    if (terrainMesh) { level.remove(terrainMesh); terrainMesh.geometry.dispose(); }
    terrainMesh = new THREE.Mesh(g, groundMat); terrainMesh.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2); terrainMesh.receiveShadow = true; scene.add(terrainMesh);
    ground.userData.y = -0.6;   // the endless flat sheet drops under the terrain (it still shows past its edge)
    return terrainMesh;
  }
  // rocks and boulders: a lumpy stone, s metres across; solid unless tiny
  const ROCKG = [];
  MAT.rock = std({ ...TX.relief(rockTx, 1.2), color: 0xb0a898, roughness: 0.92 });   // (the same texture as the ground's rocky banks)
  contactAO(MAT.rock, 'ext');
  function rock(x, z, s = 1, o = {}) {
    if (!ROCKG.length) for (let k = 0; k < 4; k++) { const g = new THREE.IcosahedronGeometry(0.5, 2), p = g.attributes.position; const r = TX.rng(31 + k); const ph = [r() * 6, r() * 6, r() * 6]; for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(p, i); const n = 1 + 0.18 * Math.sin(v.x * 7 + ph[0]) * Math.cos(v.z * 6 + ph[1]) + 0.1 * Math.sin(v.y * 11 + ph[2]); v.multiplyScalar(n); if (v.y < -0.15) v.y = -0.15 + (v.y + 0.15) * 0.3; p.setXYZ(i, v.x, v.y, v.z); } g.computeVertexNormals(); ROCKG.push(g); }
    const yaw = o.yaw ?? Math.random() * 6.28, sy = s * (o.flat ?? (0.55 + Math.random() * 0.3)), y = (W.terrainH ? W.terrainH(x, z) : 0);
    xadd(ROCKG[Math.floor(Math.random() * ROCKG.length)], o.mat ? MAT[o.mat] || o.mat : MAT.rock, mat4(x, y + sy * 0.12, z, yaw, s, sy, s * (0.8 + Math.random() * 0.4)));
    if (s > 0.45 && o.solid !== false) solid(x, z, s * 0.4, s * 0.4, yaw, y + sy * 0.55, 'concrete', y, s * 0.55 < 1.1 ? { vault: true } : {});
  }
  // a wall from (x0, z0) to (x1, z1), t thick, h high, with openings. Its left face (walking from 0 to 1) is
  // `inMat`, the right face `mat` — room() runs its walls so `inMat` is inside. openings: [{ at: metres from the
  // wall's middle, w, sill (0 for a doorway), top (2.1), glass: true (a window pane, solid, see-through),
  // door: true (a real swinging door: dir 1|-1, col, hp, glassDoor) }]. Returns { boxes, doors }.
  function wall(x0, z0, x1, z1, o = {}) {
    const h = o.h ?? 2.8, t = o.t ?? 0.2, y0 = o.y0 ?? 0, mat = o.mat || 'concrete', inMat = o.inMat || mat, surf = o.surf || 'concrete';
    const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz); if (L < 0.01) return { boxes: [], doors: [] };
    const ux = dx / L, uz = dz / L, yaw = Math.atan2(-uz, ux), at = a => [x0 + ux * a, z0 + uz * a];
    const faces = f => f === 'pz' ? inMat : f === 'nz' ? mat : f === 'bot' ? null : (o.capMat || mat);
    const out = { boxes: [], doors: [] };
    const piece = (a, b, ya, yb) => { if (b - a < 0.01 || yb - ya < 0.01) return; const [cx, cz] = at((a + b) / 2); const bx = block(cx, ya, cz, (b - a) / 2, yb, t / 2, yaw, faces, surf); if (bx) out.boxes.push(bx); };
    const ops = (o.openings || []).map(p => ({ ...p, a0: L / 2 + p.at - p.w / 2, a1: L / 2 + p.at + p.w / 2 })).sort((p, q) => p.a0 - q.a0);
    let cur = 0;
    for (const p of ops) {
      const sill = p.sill ?? (p.glass ? 0.9 : 0), top = Math.min(h, p.top ?? (p.glass ? 2.1 : 2.12));
      piece(cur, p.a0, y0, y0 + h);
      if (sill > 0) piece(p.a0, p.a1, y0, y0 + sill);
      if (top < h) piece(p.a0, p.a1, y0 + top, y0 + h);
      if (p.glass) {
        const [cx, cz] = at((p.a0 + p.a1) / 2);
        // the pane sits recessed in the middle of the wall, in a frame (frameMat, default painted trim) that stands
        // proud of both faces; a window (not a glass door) gets a sill ledge outside
        const fm = p.frameMat || o.frameMat || 'trim', sn = Math.sin(yaw), cs = Math.cos(yaw);
        B.box(cx, y0 + sill, cz, (p.a1 - p.a0) / 2, y0 + top, 0.012, yaw, f => f === 'pz' || f === 'nz' ? (p.glassMat || 'glass') : null, TILE);
        for (const [a, b, ya, yb] of [[p.a0, p.a0 + 0.06, sill, top], [p.a1 - 0.06, p.a1, sill, top], [p.a0, p.a1, sill - 0.05, sill], [p.a0, p.a1, top, top + 0.05]]) { const [fx2, fz2] = at((a + b) / 2); B.box(fx2, y0 + ya, fz2, (b - a) / 2, y0 + yb, t / 2 + 0.02, yaw, () => fm, TILE); }
        if (sill > 0.3 && p.sillLedge !== false) { const off = t / 2 + 0.05; B.box(cx - sn * off, y0 + sill - 0.07, cz - cs * off, (p.a1 - p.a0) / 2 + 0.07, y0 + sill - 0.02, 0.06, yaw, f => f === 'bot' ? null : (p.sillMat || o.sillMat || fm), TILE); }
        out.boxes.push(solid(cx, cz, (p.a1 - p.a0) / 2, t / 2, yaw, y0 + top, 'glass', y0 + sill, { window: true }));
      }
      if (p.door) { const [hx2, hz2] = at(p.a0); out.doors.push(door(hx2, hz2, yaw, p.dir || 1, p.col ?? 0xe6e2d8, o.house || null, { w: p.w, frame: !p.glassDoor, wallT: t, hp: p.hp, glassDoor: p.glassDoor, front: p.front, interior: p.interior })); }
      cur = p.a1;
    }
    piece(cur, L, y0, y0 + h);
    return out;
  }
  // a building you can walk into: w × d metres round (x, z), turned by yaw. o: { h, t, mat (outside), inMat,
  // floor ('floorTile', null for none), ceiling (true), roof: 'flat' | 'gable' | null, roofMat, ridge (gable
  // height above the walls), doors: [{ side: 's'|'n'|'e'|'w', at, w, ... }], windows: [{ side, at, w, sill, top }],
  // name, home (true: counts as a house main.js can pick, it needs a door), inside: [[x, z], ...] open floor spots }.
  // Local frame: 's' is the wall at local z = −d/2, 'n' at +d/2, 'e' at x = +w/2, 'w' at −w/2. Returns the house
  // record H (also in W.houses: W.houseAt() finds it, its roof hides while you're inside).
  function room(x, z, w, d, yaw = 0, o = {}) {
    const h = o.h ?? 2.8, t = o.t ?? 0.2, c = Math.cos(yaw), s = Math.sin(yaw);
    const P = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    const H = { id: houseN++, x, z, yaw, flip: 1, hw: w / 2, hd: d / 2, name: o.name || ('building ' + houseN), rooms: [], kind: 'room', wallH: h };
    W.houses.push(H);
    if (o.roof !== 'gable' && o.roof !== null && !H.yTop) H.yTop = () => h + 0.22;
    paved.push(rectOf(x, z, w / 2 + 0.3, d / 2 + 0.3, yaw));
    const A = P(-w / 2, -d / 2), Bc = P(w / 2, -d / 2), Cc = P(w / 2, d / 2), D = P(-w / 2, d / 2);
    const sides = { s: [A, Bc, w], e: [Bc, Cc, d], n: [Cc, D, w], w: [D, A, d] };
    // (o.lit: its windows glow warm from inside at night — glassLit — like the houses' do)
    const opsFor = k => [...(o.doors || []).filter(p => p.side === k).map(p => ({ w: 0.95, ...p, door: p.door !== false })), ...(o.windows || []).filter(p => p.side === k).map(p => ({ w: 1.2, ...(o.lit ? { glassMat: 'glassLit' } : {}), ...p, glass: p.glass !== false }))];
    H.doors = [];
    for (const k of ['s', 'e', 'n', 'w']) {
      const [a, b] = sides[k];
      // the walls overlap at the corners (each runs t/2 past its end) so no light leaks through
      const ux = (b[0] - a[0]), uz = (b[1] - a[1]), L = Math.hypot(ux, uz), ex = ux / L * t / 2, ez = uz / L * t / 2;
      const r = wall(a[0] - ex, a[1] - ez, b[0] + ex, b[1] + ez, { h, t, mat: o.mat || 'concrete', inMat: o.inMat || 'paint0', surf: o.surf || 'concrete', openings: opsFor(k), house: H, capMat: o.mat || 'concrete', frameMat: o.frameMat, sillMat: o.sillMat });
      H.doors.push(...r.doors);
    }
    H.front = H.doors[0] || null;
    if (o.floor !== null) B.box(x, 0, z, w / 2 - t / 2, 0.03, d / 2 - t / 2, yaw, f => f === 'top' ? (o.floor || 'floorTile') : null, TILE);
    H.rooms.push([-w / 2, -d / 2, w / 2, d / 2, o.step || (o.floor && o.floor.startsWith('floorWood') ? 'wood' : 'tile')]);
    // the ceiling: part of the building, not the roof (so it's still there over you when the roof hides; it faces
    // down only, so from a camera above it's not drawn)
    if (o.ceiling !== false) B.box(x, h - 0.02, z, w / 2, h, d / 2, yaw, f => f === 'bot' ? (o.ceilMat || 'ceiling') : null, TILE);
    // roof (in its own group: hidden from the inside, still casting its shadow)
    const rg = sub(() => {
      if (o.roof === 'gable') gableRoof(x, z, w / 2 + 0.35, d / 2 + 0.35, yaw, h, h + (o.ridge ?? d * 0.3), o.roofMat || 'shingle0', o.mat || 'siding0', false);
      else if (o.roof !== null) {
        B.box(x, h, z, w / 2 + 0.15, h + 0.22, d / 2 + 0.15, yaw, f => f === 'top' ? (o.roofMat || 'concrete') : f === 'bot' ? null : 'trim', TILE);
        if (o.parapet !== false) for (const [lx, lz, hx2, hz2] of [[0, -d / 2 - 0.08, w / 2 + 0.15, 0.07], [0, d / 2 + 0.08, w / 2 + 0.15, 0.07], [-w / 2 - 0.08, 0, 0.07, d / 2 + 0.15], [w / 2 + 0.08, 0, 0.07, d / 2 + 0.15]]) { const [px, pz] = P(lx, lz); B.box(px, h + 0.22, pz, hx2, h + 0.62, hz2, yaw, () => o.mat || 'concrete', TILE); }
      }
    });
    H.roof = rg;
    if (o.roof !== 'gable' && o.roof !== null) W.roofs.push({ H, x, z, c, s, RX: w / 2 + 0.1, RZ: d / 2 + 0.1, yE: h + 0.22, yR: h + 0.22, r2: (w / 2) ** 2 + (d / 2) ** 2 });
    H.inside = (o.inside || [[0, 0]]).map(([lx, lz]) => P(lx, lz));
    if (o.home === false) H.store = true;   // (main.js never picks a 'store' as somebody's home)
    return H;
  }
  // a pitched roof over hx × hz (half sizes, ridge along local x) from eave height yE up to yR. Walkable on top
  // (it goes into W.roofs). gableMat: the triangles at the ends.
  function gableRoof(x, z, hx, hz, yaw, yE, yR, mat = 'shingle0', gableMat = 'siding0', walk = true) {
    const c = Math.cos(yaw), s = Math.sin(yaw), P = (lx, y, lz) => [x + lx * c + lz * s, y, z - lx * s + lz * c];
    const rise = yR - yE, sl = Math.hypot(hz, rise), t = TILE[mat] || 1.4;
    for (const sd of [-1, 1]) {
      const nl = [0, hz / sl, sd * rise / sl], n = [nl[2] * s, nl[1], nl[2] * c];
      B.quad(mat, P(-hx, yE, sd * hz), P(hx, yE, sd * hz), P(hx, yR, 0), P(-hx, yR, 0), n, [[0, 0], [2 * hx / t, 0], [2 * hx / t, sl / t], [0, sl / t]], x, z);
      B.quad('ceiling', P(-hx, yE - 0.02, sd * hz), P(hx, yE - 0.02, sd * hz), P(hx, yR - 0.02, 0), P(-hx, yR - 0.02, 0), [-n[0], -n[1], -n[2]], [[0, 0], [1, 0], [1, 1], [0, 1]], x, z);
    }
    for (const sd of [-1, 1]) { const ex = sd * (hx - 0.3); B.tri(gableMat, P(ex, yE, -hz + 0.35), P(ex, yE, hz - 0.35), P(ex, yR - 0.05, 0), [sd * c, 0, -sd * s], TILE[gableMat] || 1, x, z); }
    if (walk) W.roofs.push({ H: null, x, z, c, s, RX: hx, RZ: hz, yE, yR, r2: hx * hx + hz * hz });
  }
  // a raised floor you stand on at height y (a stage, a catwalk, a dock, a container top). Not solid underneath
  // unless o.solid (then it's a block from the ground up, and climb: true lets you clamber onto it).
  function deck(x, z, hx, hz, yaw, y, o = {}) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    if (o.draw !== false) B.box(x, o.solid ? 0 : y - (o.th ?? 0.15), z, hx, y, hz, yaw, f => f === 'top' ? (o.mat || 'plank') : f === 'bot' ? (o.under || o.mat || 'plank') : (o.side || o.mat || 'plank'), TILE);
    if (o.solid) solid(x, z, hx, hz, yaw, y, o.surf || 'wood', 0, y < 1.3 ? { vault: true } : {});
    const d = { x, z, hx, hz, c, s, r2: hx * hx + hz * hz, y, climb: o.climb ?? !!o.solid };
    W.decks.push(d);
    return d;
  }
  // a flight of stairs w wide, rising from ya at its local −z end to yb at +z, len long (centre x, z). They
  // join W.ramps (what you walk on) and W.navBlocks (zombies don't climb stairs).
  function stairs(x, z, yaw, w, len, ya, yb, mat = 'concrete', o = {}) {
    const c = Math.cos(yaw), s = Math.sin(yaw), P = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    const n = Math.max(1, Math.ceil(Math.abs(yb - ya) / 0.18)), R = (yb - ya) / n, run = len / n;
    for (let i = 0; i < n; i++) { const [cx, cz] = P(0, -len / 2 + run * (i + 0.5)); B.box(cx, o.open ? ya + R * (i + 1) - 0.06 : 0, cz, w / 2, ya + R * (i + 1), run / 2 + 0.01, yaw, () => mat, TILE); }
    if (o.rails !== false) for (const sx of [-1, 1]) { const [a0, a1] = P(sx * (w / 2 + 0.03), -len / 2), [b0, b1] = P(sx * (w / 2 + 0.03), len / 2); wbeam([a0, ya + 0.95, a1], [b0, yb + 0.95, b1], 0.05, 0.05, MAT.metal, false); }
    const ra = { x, z, hx: w / 2, hz: len / 2, c, s, r2: (w / 2) ** 2 + (len / 2) ** 2, ya, yb, R: Math.abs(R) };
    W.ramps.push(ra); W.navBlocks.push({ ...ra });
    return ra;
  }
  // a light that really lights (a PointLight; keep a map to ~6 of these — use emissive materials for the rest)
  function light(x, y, z, color = 0xffd8a0, intensity = 8, dist = 14) { const l = new THREE.PointLight(color, intensity, dist, 1.7); l.position.set(x, y, z); addLight(l); return l; }
  function spawn(x, z) { W.spawns.push({ x, z }); }
  function hazardK(x, z, r, kind = 'fire', dps = 12) { const h = { x, z, r, kind, dps, off: false }; W.hazards.push(h); if (CI) CI.hazards.push(h); return h; }
  function bounds(x0, z0, x1, z1) { W.bounds = { x0: Math.max(-160, x0), z0: Math.max(-160, z0), x1: Math.min(160, x1), z1: Math.min(160, z1) }; }
  const K = {
    THREE, TX, MAT, GEO, TILE, mat4, std, ctex, rng: TX.rng, W,
    get level() { return level; },
    // geometry & collision
    box: (x, y0, z, hx, y1, hz, yaw, mat) => B.box(x, y0, z, hx, y1, hz, yaw, typeof mat === 'function' ? mat : ALL(mat), TILE),
    quad: (...a) => B.quad(...a), tri: (...a) => B.tri(...a),
    block, solid, wall, room, door, gableRoof, deck, stairs, rock, inst, xadd, mesh, sub, wbeam, WX, rectOf,
    // nature
    tree, pine, bush, hedge, sapling, fallenTree, flowerPot,
    // fences & street things
    picketFence, privacyFence, chainFence, streetLamp, lamp, trashBin, hydrant, cone, mailbox, barricade, crateStack, gardenChair, gardenTable, yardSign,
    // vehicles
    car, wreck, policeCar, ambulance,
    // whole Maple Hollow pieces (12 × 10 m house with yard; watchtower; the corner store; gas station; playground)
    house, watchtower, store, gasStation, playground,
    // loot, things that open, things that break
    container, breakable,
    // the outbreak layer, fx, danger
    chaos, emitter, hazard: hazardK, blood: (...a) => W.blood(...a),
    // ground, water, terrain, air
    paint, region, slab, water, terrain, light, preset: setPreset, groundKind: groundKindSet,
    // shading: contactAO(material, 'ext' | 'int') — walls darken where they meet the ground / floor and ceiling
    contactAO: (m, kind = 'ext') => { if (m && !m.userData.pk) contactAO(m, kind); return m; },
    // the map's frame
    spawn, bounds,
  };
  W.kit = K;
  // ---- build a map ----
  const MAPLE_INFO = () => {
    const home = W.houses.find(h => h.x === -44 && h.z === 17);
    return { id: 'maple', name: 'Maple Hollow', start: home ? { x: home.x, z: home.z, yaw: 0 } : { x: 0, z: 10, yaw: 0 }, home, lz: { x: 0, z: 0 }, lzName: 'Main St & Maple Ave', spawns: W.spawns, bounds: W.bounds, preset: 'suburb', ambient: 'suburb', names: { lz: 'Main St & Maple Ave', store: 'Quick Stop', town: 'Maple Hollow' } };
  };
  W.build = (mapId = 'maple', mod = null) => {
    if (W.built) throw new Error('W.build: one map per page; reload the page to change map'); W.built = true;
    W.mapId = mapId || 'maple';
    if (W.mapId === 'maple' || !mod) { W.mapId = 'maple'; buildMaple(); W.mapInfo = MAPLE_INFO(); return W.mapInfo; }
    W.truck = null; W.truckLot = null;
    const info = (mod.buildMap || mod.default)(K) || {};
    if (info.bounds) { const b = info.bounds; bounds(b.x0, b.z0, b.x1, b.z1); }
    if (info.preset) setPreset(info.preset);
    if (info.ambient) W.ambient = info.ambient;
    if (info.spawns) for (const p of info.spawns) if (!W.spawns.includes(p)) W.spawns.push(p);
    if (!W.spawns.length) for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2, Bd = W.bounds; W.spawns.push({ x: (Bd.x0 + Bd.x1) / 2 + Math.cos(a) * (Bd.x1 - Bd.x0) * 0.45, z: (Bd.z0 + Bd.z1) / 2 + Math.sin(a) * (Bd.z1 - Bd.z0) * 0.45 }); }
    W.lz = info.lz || { x: 0, z: 0 };
    growLampSlots();
    finish();
    W.mapInfo = { id: mapId, name: info.name || mapId, ...info, spawns: W.spawns, bounds: W.bounds, preset: W.presetName || 'suburb', ambient: W.ambient };
    return W.mapInfo;
  };
  // load js/maps/<id>.js and build it (Maple Hollow needs no module)
  W.buildAsync = async (mapId = 'maple') => {
    if (!mapId || mapId === 'maple') return W.build('maple');
    const { loadMap } = await import('./maps/index.js');
    const mod = await loadMap(mapId);
    return W.build(mapId, mod);
  };
  return W;
}

// ---------------------------------------------------------------- grass blades (wrapping round the player)
function buildGrass(scene, densityFn, count = 110000, PATCH = 44) {
  const RESN = 512, HALF = 160;
  const data = new Float32Array(RESN * RESN * 4);
  const map = new THREE.DataTexture(data, RESN, RESN, THREE.RGBAFormat, THREE.FloatType);
  map.magFilter = map.minFilter = THREE.NearestFilter;
  const segs = 4, bp = [], bi = [];
  for (let s = 0; s <= segs; s++) { const t = s / segs, w = 0.011 * (1 - t * 0.85); bp.push(-w, t, 0, w, t, 0); }
  for (let s = 0; s < segs; s++) { const a = s * 2; bi.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
  geo.setIndex(bi);
  const off = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) { off[i * 4] = Math.random() * PATCH; off[i * 4 + 1] = Math.random() * PATCH; off[i * 4 + 2] = Math.random() * 6.283; off[i * 4 + 3] = Math.random(); }
  geo.setAttribute('blade', new THREE.InstancedBufferAttribute(off, 4));
  geo.instanceCount = count;
  const uni = { center: { value: new THREE.Vector2() }, time: { value: 0 }, dmap: { value: map }, player: { value: new THREE.Vector3() } };
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 1, metalness: 0, envMapIntensity: 0.4 });
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
      attribute vec4 blade; uniform vec2 center; uniform float time; uniform sampler2D dmap; uniform vec3 player;
      varying vec3 vGCol; varying float vT;`)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
      .replace('#include <begin_vertex>', `
        vec2 wp = center + mod(blade.xy - center + ${(PATCH / 2).toFixed(1)}, ${PATCH.toFixed(1)}) - ${(PATCH / 2).toFixed(1)};
        vec2 uv = (wp + ${HALF.toFixed(1)}) / ${(HALF * 2).toFixed(1)};
        float dens = (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) ? 0.8 : texture2D(dmap, uv).r;
        float dist = length(wp - center);
        float keep = step(blade.w, dens) * (1.0 - smoothstep(${(PATCH * 0.36).toFixed(1)}, ${(PATCH * 0.5).toFixed(1)}, dist));
        float H = (0.07 + blade.w * 0.2) * keep;
        float t = position.y; vT = t;
        float c = cos(blade.z), s = sin(blade.z); vec3 p = vec3(position.x * c, 0.0, position.x * s);
        float gust = sin(wp.x * 0.07 + time * 1.3) * 0.5 + sin(wp.y * 0.05 + time * 0.9) * 0.5;
        vec2 bend = vec2(0.5, 0.3) * (0.25 + gust * 0.35) + vec2(sin(time * 3.1 + blade.z * 5.0), cos(time * 2.7 + blade.w * 7.0)) * 0.05;
        vec2 away = wp - player.xz; float pd = length(away);
        bend += normalize(away + 1e-4) * smoothstep(0.9, 0.0, pd) * 1.2;
        bend += vec2(cos(blade.z * 3.7), sin(blade.z * 3.7)) * (0.25 + blade.w * 0.35);
        p.xz += bend * t * t * H;
        p.y = t * H * (1.0 - 0.25 * length(bend) * t);
        vec3 transformed = vec3(wp.x + p.x, p.y - 0.01, wp.y + p.z);
        float tone = fract(blade.z * 7.13);
        vGCol = mix(vec3(0.24, 0.3, 0.11), vec3(0.44, 0.42, 0.18), tone);`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vGCol; varying float vT;')
      .replace('#include <map_fragment>', 'diffuseColor.rgb *= vGCol * mix(0.32, 0.75, vT);');
  };
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.receiveShadow = true;
  scene.add(mesh);
  return {
    mesh,
    refresh() {
      for (let j = 0; j < RESN; j++) for (let i = 0; i < RESN; i++) {
        const x = i / (RESN - 1) * HALF * 2 - HALF, z = j / (RESN - 1) * HALF * 2 - HALF;
        data[(j * RESN + i) * 4] = densityFn(x, z);
      }
      map.needsUpdate = true;
    },
    update(t, p) { uni.time.value = t; uni.center.value.set(p.x, p.z); uni.player.value.copy(p); },
    setCount(n) { geo.instanceCount = Math.min(count, n); },
  };
}
