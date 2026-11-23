// Zombie_Apocalypse — weather. Rain: a box of falling streaks that follows the camera, moved entirely on the GPU.
// Each drop is a thin camera-facing quad (not a GL line, which is always 1 hairline pixel), leaning with the gusting
// wind; drops splash on the ground (a little crown + a ripple ring) and never fall inside the house you're in or under
// a porch / canopy (world.rainRoofs). Desert maps also get a sandstorm about once a day and a heat-haze shimmer at noon.
import * as THREE from 'three';
import { tier } from './tex.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// how soaked people out in the rain are, 0..1 (people.js / zombies.js: lower skin & cloth roughness by 0.3 * wetK.value)
export const wetK = { value: 0 };
// gusts: a slow, irregular 0..1 swell (world.js can feed the same value into the foliage wind)
export function gust(t) { return 0.5 + 0.5 * Math.sin(t * 0.21) * Math.sin(t * 0.077 + 1.3); }

const SHELTER = `
  uniform vec4 house;    // x, z, cos(yaw), sin(yaw) of the house you're in (w = 2: none)
  uniform vec2 houseHalf;
  uniform vec4 roofs[8]; // porches, canopies: centre x, z, half width, half depth (axis aligned; hw = 0: unused)
  uniform float roofY[8];
  float sheltered(vec3 p){
    if (house.w < 1.5) {
      vec2 d = p.xz - house.xy;
      vec2 l = vec2(d.x * house.z - d.y * house.w, d.x * house.w + d.y * house.z);
      if (abs(l.x) < houseHalf.x + 0.4 && abs(l.y) < houseHalf.y + 0.4) return 1.0;
    }
    for (int i = 0; i < 8; i++) {
      vec4 R = roofs[i];
      if (R.z > 0.0 && p.y < roofY[i] && abs(p.x - R.x) < R.z && abs(p.z - R.y) < R.w) return 1.0;
    }
    return 0.0;
  }`;
const VS = `
  attribute vec4 drop;   // per drop: x, y, z inside the box, w: random 0..1
  uniform float time, box, height, speed, len;
  uniform vec3 cam; uniform vec2 wind;
  varying float vA; varying vec2 vUv;
  ${SHELTER}
  void main(){
    float y = mod(drop.y - time * speed * (0.9 + drop.w * 0.2), height);
    vec2 xz = cam.xz + mod(drop.xz - cam.xz + box * 0.5, box) - box * 0.5;
    vec3 top = vec3(xz.x, cam.y - height * 0.35 + y, xz.y);
    vec3 v = normalize(vec3(wind.x, -1.0, wind.y));
    float L = len * (0.8 + drop.w * 0.4);
    vec3 p = top - v * L * position.y;                  // position.y: 0 = top of the streak, 1 = bottom
    vec3 toCam = p - cam; float dist = length(toCam);
    vec3 side = normalize(cross(v, toCam / max(dist, 1e-3)));
    float wdt = max(0.012, dist * 0.0013);              // never thinner than about a pixel
    p += side * wdt * 0.5 * position.x;                 // position.x: -1 .. 1 across
    vA = 1.0 - sheltered(p);
    if (p.y < -0.05) vA = 0.0;
    vA *= smoothstep(box * 0.5, box * 0.25, dist) * smoothstep(0.6, 2.5, dist);
    vA *= 0.6 + drop.w * 0.8;
    vUv = vec2(position.x, position.y);
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }`;
const FS = `
  uniform float alpha; uniform vec3 col; varying float vA; varying vec2 vUv;
  void main(){
    if (vA < 0.01) discard;
    float across = 1.0 - vUv.x * vUv.x;                         // soft edges
    float along = smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.7, 1.0, vUv.y));   // brightest mid-streak, fading at both ends
    gl_FragColor = vec4(col, alpha * vA * across * along);
  }`;
// splashes: a little crown of droplets for 0.15 s and a ring spreading out for 0.45 s, at a random spot on the ground
const SVS = `
  attribute vec4 spl;    // per splash: ground x, y, z, phase seed
  uniform float time, cycle;
  uniform vec3 cam;
  varying float vA; varying vec2 vUv; varying float vKind;
  ${SHELTER}
  void main(){
    float tt = fract(time / cycle + spl.w) * cycle;
    vec3 base = spl.xyz;
    vKind = position.z;
    vec3 p;
    if (position.z < 0.5) {   // the crown: a small upright card facing the camera
      float life = 0.15, k = clamp(tt / life, 0.0, 1.0);
      vec3 f = normalize(vec3(cam.x - base.x, 0.0, cam.z - base.z) + 1e-4);
      vec3 rgt = vec3(f.z, 0.0, -f.x);
      float s = 0.035 + 0.05 * k;
      p = base + rgt * position.x * s + vec3(0.0, (position.y * 0.5 + 0.5) * s * 1.3, 0.0);
      vA = tt < life ? (1.0 - k) * smoothstep(0.0, 0.15, k) : 0.0;
    } else {                  // the ripple ring, flat on the ground
      float life = 0.45, k = clamp(tt / life, 0.0, 1.0);
      float s = 0.03 + 0.2 * k;
      p = base + vec3(position.x * s, 0.004, position.y * s);
      vA = tt < life ? (1.0 - k) * (1.0 - k) * 0.8 : 0.0;
    }
    vA *= 1.0 - sheltered(base + vec3(0.0, 0.1, 0.0));
    vA *= smoothstep(16.0, 8.0, length(base - cam));
    vUv = position.xy;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }`;
const SFS = `
  uniform float alpha; uniform vec3 col; varying float vA; varying vec2 vUv; varying float vKind;
  void main(){
    if (vA < 0.01) discard;
    float a;
    if (vKind < 0.5) {         // three thin rays fanning up from the bottom centre, with a droplet at each tip
      vec2 q = vec2(vUv.x, vUv.y * 0.5 + 0.5);
      a = 0.0;
      for (int i = 0; i < 3; i++) {
        float ang = (float(i) - 1.0) * 0.55;
        vec2 dir = vec2(sin(ang), cos(ang));
        float t = clamp(dot(q, dir), 0.0, 1.0);
        float d = length(q - dir * t);
        a += exp(-d * d * 900.0) * (0.4 + 0.6 * t) + exp(-dot(q - dir * 0.95, q - dir * 0.95) * 260.0);
      }
    } else {
      float d = length(vUv);
      a = smoothstep(0.72, 0.9, d) * (1.0 - smoothstep(0.9, 1.0, d));
    }
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0) * alpha * vA);
  }`;
// sand: fine grains streaking past on the wind and a few big dusty puffs that make the storm feel thick
const DVS = `
  attribute vec4 sd;     // x, y, z inside the box, w: random 0..1
  uniform float time, box, height, k, light;
  uniform vec3 cam; uniform vec2 wind;
  varying float vA; varying vec2 vUv; varying float vPuff;
  void main(){
    float puff = step(0.88, sd.w);
    float sp = mix(9.0, 13.0, fract(sd.w * 7.31)) * mix(1.0, 0.55, puff);
    vec2 w = normalize(wind + vec2(1e-4));
    vec2 xz = sd.xz + w * time * sp;
    xz += vec2(sin(time * 1.3 + sd.w * 40.0), cos(time * 1.1 + sd.w * 23.0)) * 0.6;   // turbulence
    xz = cam.xz + mod(xz - cam.xz + box * 0.5, box) - box * 0.5;
    float yy = mod(sd.y + sin(time * 0.9 + sd.w * 31.0) * 0.8, height);
    vec3 p = vec3(xz.x, cam.y - 3.0 + yy, xz.y);
    vec4 mv = viewMatrix * vec4(p, 1.0);
    float s = puff > 0.5 ? 1.6 + 2.2 * fract(sd.w * 13.7) : 0.025 + 0.04 * fract(sd.w * 17.3);
    // grains are smeared along the wind (motion blur): stretch the card the way they move on screen
    vec3 vw = (viewMatrix * vec4(w.x, 0.0, w.y, 0.0)).xyz;
    vec2 ax = length(vw.xy) > 1e-3 ? normalize(vw.xy) : vec2(1.0, 0.0);
    vec2 off = puff > 0.5 ? position.xy * s : ax * position.x * s * 4.0 + vec2(-ax.y, ax.x) * position.y * s;
    mv.xy += off;
    float dist = length(p - cam);
    vA = k * smoothstep(box * 0.5, box * 0.3, dist) * smoothstep(0.3, 1.5, dist) * (puff > 0.5 ? 0.12 : 0.55);
    vUv = position.xy; vPuff = puff;
    gl_Position = projectionMatrix * mv;
  }`;
const DFS = `
  uniform vec3 col; uniform float light; varying float vA; varying vec2 vUv; varying float vPuff;
  void main(){
    float d = dot(vUv, vUv);
    float a = vPuff > 0.5 ? exp(-d * 2.6) : exp(-d * 3.0);
    if (a * vA < 0.003) discard;
    gl_FragColor = vec4(col * light, a * vA);
  }`;
// heat haze: the image ripples a little where you look across a long stretch of hot ground. It reads the scene depth
// so only things far away swim (30 m+), never the wall or the person in front of you, and never the sky.
const HAZE = {
  uniforms: { tDiffuse: { value: null }, tDepth: { value: null }, time: { value: 0 }, k: { value: 0 }, hy: { value: 0.5 }, near: { value: 0.1 }, far: { value: 1000 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    #include <packing>
    uniform sampler2D tDiffuse, tDepth; uniform float time, k, hy, near, far; varying vec2 vUv;
    float distAt(vec2 uv){ float d = texture2D(tDepth, uv).x; return d >= 0.99999 ? -1.0 : -perspectiveDepthToViewZ(d, near, far); }
    void main(){
      float dist = distAt(vUv);
      float m = dist < 0.0 ? 0.0 : smoothstep(28.0, 70.0, dist) * (1.0 - smoothstep(hy - 0.01, hy + 0.03, vUv.y)) * smoothstep(hy - 0.35, hy - 0.05, vUv.y);
      vec2 o = vec2(sin(vUv.y * 300.0 + time * 7.0 + sin(vUv.x * 37.0 + time * 2.3) * 2.0),
                    cos(vUv.y * 190.0 - time * 5.0 + vUv.x * 29.0)) * vec2(0.0016, 0.0006) * k * m;
      vec2 uv2 = vUv + o;
      if (distAt(uv2) < 20.0 && distAt(uv2) >= 0.0) uv2 = vUv;   // don't pull a near object's edge into the haze
      gl_FragColor = texture2D(tDiffuse, uv2);
    }`,
};
class HazePass extends ShaderPass {
  render(renderer, writeBuffer, readBuffer, dt, mask) {
    this.uniforms.tDepth.value = readBuffer.depthTexture || null;
    super.render(renderer, writeBuffer, readBuffer, dt, mask);
  }
}

const quadGeo = (inst, attrName, arr, extraKind = false) => {
  const g = new THREE.InstancedBufferGeometry();
  const P = extraKind
    ? [-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0, -1, -1, 1, 1, -1, 1, -1, 1, 1, 1, 1, 1]
    : [-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0];
  if (!extraKind && attrName === 'sd') P.splice(0, 12, -1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0);
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setIndex(extraKind ? [0, 1, 2, 2, 1, 3, 4, 5, 6, 6, 5, 7] : [0, 1, 2, 2, 1, 3]);
  const a = new THREE.InstancedBufferAttribute(arr, 4); g.setAttribute(attrName, a);
  g.instanceCount = inst;
  return [g, a];
};
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function makeRain(scene, N = 9000) {
  // phones and tablets: fewer drops (a smaller box round the camera keeps it just as dense near you), no heat haze pass
  const LOW = tier();
  if (LOW) N = Math.round(N * (LOW > 1 ? 0.4 : 0.6));
  const box = LOW > 1 ? 24 : LOW ? 28 : 34, height = LOW > 1 ? 12 : LOW ? 14 : 16, NS = LOW > 1 ? 260 : LOW ? 400 : 600, ND = LOW > 1 ? 1100 : LOW ? 1700 : 2600, CYCLE = 0.6;
  // ---- the drops
  const drop = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) { drop[i * 4] = Math.random() * box; drop[i * 4 + 1] = Math.random() * height; drop[i * 4 + 2] = Math.random() * box; drop[i * 4 + 3] = Math.random(); }
  const [g] = quadGeo(N, 'drop', drop);
  const shelter = {
    house: { value: new THREE.Vector4(0, 0, 1, 2) }, houseHalf: { value: new THREE.Vector2(1, 1) },
    roofs: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, 0)) }, roofY: { value: new Array(8).fill(0) },
  };
  const uni = {
    time: { value: 0 }, box: { value: box }, height: { value: height }, speed: { value: 11 }, len: { value: 0.55 },
    cam: { value: new THREE.Vector3() }, wind: { value: new THREE.Vector2(0.12, 0.05) }, ...shelter,
    alpha: { value: 0.3 }, col: { value: new THREE.Color(0xb8c0c8) },
  };
  const m = new THREE.ShaderMaterial({ uniforms: uni, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, fog: false });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 5; mesh.visible = false;
  scene.add(mesh);
  // ---- the splashes (each one is re-placed on the CPU when its cycle wraps: ~17 a frame)
  const spl = new Float32Array(NS * 4), cyc = new Int32Array(NS).fill(-1);
  for (let i = 0; i < NS; i++) spl[i * 4 + 3] = Math.random();
  const [sg, sAttr] = quadGeo(NS, 'spl', spl, true);
  const suni = { time: uni.time, cycle: { value: CYCLE }, cam: uni.cam, ...shelter, alpha: { value: 0.4 }, col: { value: new THREE.Color(0xc8d0d8) } };
  const sm = new THREE.ShaderMaterial({ uniforms: suni, vertexShader: SVS, fragmentShader: SFS, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide });
  const splashes = new THREE.Mesh(sg, sm); splashes.frustumCulled = false; splashes.renderOrder = 5; splashes.visible = false;
  scene.add(splashes);
  // ---- desert sand
  const sd = new Float32Array(ND * 4);
  for (let i = 0; i < ND; i++) { sd[i * 4] = Math.random() * 30; sd[i * 4 + 1] = Math.random() * 10; sd[i * 4 + 2] = Math.random() * 30; sd[i * 4 + 3] = Math.random(); }
  const [dg] = quadGeo(ND, 'sd', sd);
  const duni = { time: uni.time, box: { value: 30 }, height: { value: 10 }, k: { value: 0 }, light: { value: 1 }, cam: uni.cam, wind: { value: new THREE.Vector2(1, 0.3) }, col: { value: new THREE.Color(0xc8a878) } };
  const dm = new THREE.ShaderMaterial({ uniforms: duni, vertexShader: DVS, fragmentShader: DFS, transparent: true, depthWrite: false, fog: false });
  const sand = new THREE.Mesh(dg, dm); sand.frustumCulled = false; sand.renderOrder = 6; sand.visible = false;
  scene.add(sand);
  // ---- heat haze pass (put into the composer once, right after the scene render)
  let haze = null, hazeComposer = null;
  const hv = new THREE.Vector3(), fwd = new THREE.Vector3(), sandCol = new THREE.Color(0xc8a878), tc = new THREE.Color();
  let roofT = 0, fogSet = -1, fogBase = 0;
  const ZA = () => (typeof window !== 'undefined' && window.ZA) || null;
  const R = {
    mesh, splashes, sand, wetK, gust,
    gustNow: 0,
    // the desert sandstorm: one a day at a random hour (force: start one now, for tests / the story)
    storm: { k: 0, day: -1, start: -1, end: -1, on: false },
    onSandstorm: null,
    startSandstorm(hours = 1.2) {
      const za = ZA(); const h = za && za.G ? za.G.hour : 12;
      R.storm.start = h; R.storm.end = h + hours; R.storm.day = za && za.G ? za.G.day : 0; R.storm.forced = true;
    },
    update(dt, t, cam, k, house, night) {
      const za = ZA(), W = za && za.world, G = za && za.G;
      const gu = R.gustNow = gust(t);
      // ---- rain
      mesh.visible = k > 0.02;
      if (mesh.visible) {
        g.instanceCount = Math.floor(N * Math.min(1, k * 1.1));
        uni.time.value = t; uni.cam.value.copy(cam);
        uni.wind.value.set(0.1 + k * 0.35 * gu, 0.05 + k * 0.15 * gu);
        uni.alpha.value = (0.2 + k * 0.16) * (night ? 0.7 : 1);
        // drops are lit by the scene: grey-white by day, only faint glints in the dark (the fog colour tracks the light)
        const fc = scene.fog ? scene.fog.color : null, lum = fc ? Math.min(1, Math.max(0.12, (fc.r * 0.3 + fc.g * 0.59 + fc.b * 0.11) * 1.8)) : 1;
        uni.col.value.setHex(0xb8c0c8).multiplyScalar(lum); suni.col.value.setHex(0xc8d0d8).multiplyScalar(lum * 0.9);
        if (house) shelter.house.value.set(house.x, house.z, Math.cos(house.yaw), Math.sin(house.yaw)), shelter.houseHalf.value.set(house.hw, house.hd);
        else shelter.house.value.w = 2;
        // the 8 nearest porch roofs / canopies (world.rainRoofs: [{ x, z, hw, hd, y }])
        if ((roofT -= dt) <= 0) {
          roofT = 0.5;
          const list = (W && W.rainRoofs) || [];
          const near = list.length > 8 ? list.map(q => [q, (q.x - cam.x) ** 2 + (q.z - cam.z) ** 2]).sort((a, b) => a[1] - b[1]).slice(0, 8).map(a => a[0]) : list;
          for (let i = 0; i < 8; i++) { const q = near[i]; if (q) { shelter.roofs.value[i].set(q.x, q.z, q.hw, q.hd); shelter.roofY.value[i] = q.y; } else shelter.roofs.value[i].set(0, 0, 0, 0); }
        }
        // splashes: re-seat each one on the ground when its cycle comes round
        splashes.visible = true; sg.instanceCount = Math.floor(NS * Math.min(1, k * 1.3));
        suni.alpha.value = (0.22 + k * 0.2) * (night ? 0.6 : 1);
        let dirty = false;
        for (let i = 0; i < sg.instanceCount; i++) {
          const c = Math.floor(t / CYCLE + spl[i * 4 + 3]);
          if (c === cyc[i]) continue;
          cyc[i] = c; dirty = true;
          const a = Math.random() * 6.283, rr = 0.8 + Math.pow(Math.random(), 0.7) * 14;   // denser near you
          const x = cam.x + Math.cos(a) * rr, z = cam.z + Math.sin(a) * rr;
          let y = 0; try { if (W && W.groundY) y = W.groundY(x, z) || 0; } catch (e) { y = 0; }
          spl[i * 4] = x; spl[i * 4 + 1] = y + 0.01; spl[i * 4 + 2] = z;
        }
        if (dirty) sAttr.needsUpdate = true;
      } else splashes.visible = false;
      // ---- how soaked you are: wet through in ~20 s of hard rain, dry in a few minutes
      const out = house ? 0 : 1;
      if (k * out > wetK.value) wetK.value = Math.min(k * out, wetK.value + dt * 0.05 * (0.3 + k));
      else wetK.value = Math.max(0, wetK.value - dt * 0.004);
      // ---- the desert
      const desert = !!(W && W.presetName === 'desert') && G && G.state !== 'title';
      let sk = 0, hk = 0;
      if (desert) {
        const S = R.storm, h = G.hour;
        if (S.day !== G.day && !S.forced) {   // plan today's storm
          S.day = G.day; S.start = 9 + Math.random() * 9; S.end = S.start + 0.8 + Math.random() * 0.7; S.on = false;
        }
        sk = smooth(S.start, S.start + 0.25, h) * (1 - smooth(S.end - 0.25, S.end, h));
        if (h > S.end) S.forced = false;
        if (sk > 0.05 && !S.on) {
          S.on = true;
          try { R.onSandstorm && R.onSandstorm(); } catch (e) { /* the announcement is optional */ }
          try { window.dispatchEvent(new CustomEvent('za:sandstorm')); } catch (e) { /* no window in tests */ }
        }
        if (sk < 0.01 && h > S.end) S.on = false;
        hk = smooth(10.5, 11.5, h) * (1 - smooth(15.5, 16.5, h)) * (1 - sk) * (1 - (G.insideK || 0) * 0.8);
      }
      R.storm.k = sk;
      if (scene.fog) {
        // world.setTime re-bases the fog each frame; if it didn't this frame, start from the last base so it can't compound
        if (scene.fog.density !== fogSet) fogBase = scene.fog.density;
        if (sk > 0.001) {
          const lit = W ? 0.3 + 0.7 * Math.min(1, W.daylight ?? 1) : 1;
          scene.fog.density = fogBase * (1 + 3 * sk) + 0.02 * sk;   // x4, plus enough dust that you really can't see far
          scene.fog.color.lerp(tc.copy(sandCol).multiplyScalar(lit), sk * 0.85);
          fogSet = scene.fog.density;
        } else { scene.fog.density = fogBase; fogSet = -1; }
      }
      sand.visible = sk > 0.01;
      if (sand.visible) {
        uni.time.value = t; uni.cam.value.copy(cam);
        duni.k.value = sk;
        duni.light.value = W ? 0.3 + 0.75 * Math.min(1, W.daylight ?? 1) : 1;
        const ang = 0.4 + Math.sin(t * 0.03) * 0.3;   // the storm comes from one side, veering slowly
        duni.wind.value.set(Math.cos(ang), Math.sin(ang)).multiplyScalar(0.7 + gu * 0.6);
      }
      // heat haze
      const comp = za && za.composer;
      if (comp && !LOW && (hk > 0.01 || haze)) {
        if (!haze || hazeComposer !== comp) {
          hazeComposer = comp; haze = null;
          try {
            // the scene depth, kept with each of the composer's buffers (re-allocated on the next render)
            for (const rt of [comp.renderTarget1, comp.renderTarget2]) if (rt && !rt.depthTexture) { rt.depthTexture = new THREE.DepthTexture(1, 1); rt.dispose(); }
            haze = new HazePass(HAZE); comp.insertPass(haze, Math.min(1, comp.passes.length));
          } catch (e) { haze = null; }
        }
        if (haze) {
          haze.enabled = hk > 0.01;
          if (haze.enabled) {
            const camO = za.camera;
            haze.uniforms.time.value = t; haze.uniforms.k.value = hk; haze.uniforms.near.value = camO.near; haze.uniforms.far.value = camO.far;
            camO.getWorldDirection(fwd); fwd.y = 0; if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1); fwd.normalize();
            hv.setFromMatrixPosition(camO.matrixWorld).addScaledVector(fwd, 2000).project(camO);
            haze.uniforms.hy.value = Math.min(1.2, Math.max(-0.2, hv.y * 0.5 + 0.5));
          }
        }
      }
      R.hazeK = hk;
    },
  };
  scene.userData.weather = R;   // (reachable from tests and other modules: ZA.scene.userData.weather)
  return R;
}
