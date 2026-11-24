// Zombie_Apocalypse — HUMAN's realistic person, the last one left in Maple Hollow.
// Scavenge the houses for food, water, medicine and anything you can swing; fight the dead with your fists, a bat,
// an axe or a gun (gunshots bring the whole street); get through the night — at 02:00 a rescue helicopter lands at
// the crossroads of Main & Maple. It waits one minute. Then it leaves, with whoever got in.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { Soldier, prepareKind, clamp, lerp, smooth, damp, wrapPi, dampAngle } from './soldier.js';
import { WEAPONS, SLOTS, Arms, makeWeaponMesh } from './weapons.js';
import { MELEE, MELEE_ORDER, Melee, analyseSwings } from './melee.js';
import { makeWorld } from './world.js';
import { makeFX, PSCALE } from './fx.js';
import * as SND from './audio.js';
import { C, emit } from './state.js';
import { fire, refreshHitShapes, rayUnits, damage, kill, meleeWorld, sphereSurface } from './combat.js';
import { Z, DIFF as ZD, makeZombie, wake, sleep, zombieThink, zombiePose, zombieHurt, knockDown, giveVest } from './zombies.js';
import { ITEMS, rollLoot, searchInfo } from './loot.js';
import { NOTES, RADIO, CHAPTERS, TUTORIAL, TIPS as TUT_TIPS } from './story.js';
import { Pack, Hands, Wrap, itemModel, propModel, zipSound, rustle, strapSound } from './backpack.js';
import { makeRain } from './weather.js';
import { icon, ITEM_ICON } from './icons.js';
import * as PEOPLE from './people.js';
import { cleanFemale, styleFemale } from './hair.js';
import * as DRIVE from './drive.js';
import * as TRAFFIC from './traffic.js';   // [traffic] the town's cars and bikes on the calm morning (traffic.js)
import * as LANTERN from './lantern.js';
import * as TX from './tex.js';
import { buildCar, makeDrivable } from './vehicles.js';
import * as HELI from './heli.js';
import STATS from './stats.js';
import { MAPS, validMap, loadStory, normalizeStory } from './maps/index.js';
import { DEV, PROFILE as MOB, capTextures, makeGovernor, guardContext } from './mobile.js';   // phones / tablets: MOB is null on desktop
import { initTouch, touchStep, touchWords, ic as touchIcon } from './touch.js';
import * as MP from './mp.js';   // MP: online multiplayer (mp.js + net.js + p2p.js + chat.js + voice.js); every MP.* hook is a no-op in single player
import * as LOOKS from './looks.js';   // [looks] everyone their own look, you included
import * as SHOP from './shop.js';   // [zLux] money + a store on every map (shop.js, money.js)
import * as BOSS from './bosses.js';   // [boss] mini bosses, bosses and THE ZOMBIE (bosses.js; zombies.js rolls them)
import { whoInfoHTML, WHO_INFO_CSS } from './whoinfo.js';   // [who] the file on the person you pick
// line icons into the static markup
for (const e of document.querySelectorAll('[data-ic]')) e.outerHTML = icon(e.dataset.ic);

const Q = new URLSearchParams(location.search);
const MANUAL = Q.has('manual'), DBG = Q.has('dbg');
const TOUCH = DEV.touch;   // touch controls (touch.js) instead of mouse + keyboard
const ODPR = () => MOB ? Math.min(devicePixelRatio || 1, MOB.overlayDpr) : devicePixelRatio;   // the 2D overlay canvas
const $ = id => document.getElementById(id);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- save (records and settings only)
const SAVE_KEY = 'zombieapocalypse.save.v1';
const save = (() => { try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch { return {}; } })();
for (const [k, v] of Object.entries({ diff: 'medium', bestDays: 0, bestHours: 0, kills: 0, runs: 0, escapes: 0, deaths: 0, music: 0.6, sfx: 1, quality: 2, shake: true, sens: 1, view: 'third', invert: false })) save[k] ??= v;
const PERSIST = !Q.has('nosave');
function writeSave() { if (!PERSIST) return; try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { } }
// ---------------------------------------------------------------- the map: picked on "Set up your run" (?map=<id> for tests). One map per page load.
let MAP_ID = validMap(Q.get('map') || save.map || 'maple');
let STORY = null, MAPINFO = null;   // the map's story module (js/maps/<id>.story.js) and what world.buildAsync returned
const MAPLE = () => MAP_ID === 'maple';
function switchMap(id, toWho) { id = validMap(id); if (id === MAP_ID) return; save.map = id; if (PERSIST) writeSave(); const q = new URLSearchParams(location.search); q.set('map', id); q.set('setup', toWho ? 'who' : '1'); if (toWho) q.set('d', save.diff); location.search = q.toString(); }

// ---------------------------------------------------------------- renderer
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: MANUAL });
renderer.info.autoReset = false;   // (reset once a frame in render(): the counts cover every pass)
renderer.debug.checkShaderErrors = DBG;   // (checking every shader's compile log stalls the first frames)
if (MOB) renderer.shadowMap.autoUpdate = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 1500);
C.scene = scene; C.camera = camera; C.SND = SND;
let composer, film, bloomPass = null;
// the look: a cold, washed-out grade, heavy vignette, film grain; red at the edges when you're hurt, colour draining
// as you bleed out, a sick green pulse as the infection takes hold
const FilmShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, grain: { value: 0.045 }, res: { value: new THREE.Vector2(1, 1) }, hurt: { value: 0 }, flash: { value: 0 }, desat: { value: 0 }, sick: { value: 0 }, night: { value: 0 }, life: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float time, grain, hurt, flash, desat, sick, night, life; uniform vec2 res; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5; float r2 = dot(c,c);
      vec2 wob = sick > 0.4 ? vec2(sin(vUv.y * 9.0 + time * 1.3), cos(vUv.x * 7.0 + time)) * 0.0025 * (sick - 0.4) : vec2(0.0);
      vec2 off = c * r2 * (0.006 + hurt * 0.02);
      vec2 uv = vUv + wob;
      vec3 col = vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);
      float l = dot(col, vec3(0.3, 0.59, 0.11));
      col = mix(col, vec3(l), clamp(0.28 * (1.0 - life) + desat + hurt * 0.4, 0.0, 1.0));   // the world has lost its colour (not yet, that morning)
      col = mix(col, col * vec3(0.94, 1.02, 0.98), 0.6 * (1.0 - life));            // cold, a little green
      col *= mix(vec3(1.0), vec3(1.05, 1.01, 0.93), life * 0.6);                   // ...the warm light of the Saturday before
      col = mix(col, col * vec3(0.8, 0.9, 1.15), night * 0.5);                    // blue at night
      col = mix(col, (col - 0.18) * 1.08 + 0.18, smoothstep(0.02, 0.25, col));   // a touch of contrast (pivot at mid-grey; the shadows keep their toe)
      col *= mix(1.0, mix(mix(0.38, 0.72, life), mix(0.55, 0.85, life), night), smoothstep(0.06, 0.62, r2 * 1.55)); // heavy vignette (lighter at night: the dark is dark enough)
      col = mix(col, vec3(0.42, 0.02, 0.0), smoothstep(0.08, 0.5, r2) * hurt * 0.85);
      col = mix(col, col * vec3(0.8, 1.15, 0.7), sick * (0.25 + 0.15 * sin(time * 2.0)) * smoothstep(0.05, 0.5, r2 + 0.1));
      col += vec3(1.0, 0.95, 0.85) * flash;
      float n = h(vUv * res + fract(time) * 91.7) - 0.5;
      col += n * grain * (0.35 + 0.65 * (1.0 - l));
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};
// a light FXAA (edge-aware blend along the strongest luma gradient) for when there's no MSAA: Medium / High and tablets
const FXAAShader = {
  uniforms: { tDiffuse: { value: null }, texel: { value: new THREE.Vector2(1, 1) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 texel; varying vec2 vUv;
    float L(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
    void main(){
      vec3 cM = texture2D(tDiffuse, vUv).rgb;
      float lM = L(cM), lNW = L(texture2D(tDiffuse, vUv + vec2(-1.0,-1.0) * texel).rgb), lNE = L(texture2D(tDiffuse, vUv + vec2(1.0,-1.0) * texel).rgb),
            lSW = L(texture2D(tDiffuse, vUv + vec2(-1.0,1.0) * texel).rgb), lSE = L(texture2D(tDiffuse, vUv + vec2(1.0,1.0) * texel).rgb);
      float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
      if (lMax - lMin < max(0.0312, lMax * 0.125)) { gl_FragColor = vec4(cM, 1.0); return; }
      vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
      float red = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0), rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);
      dir = clamp(dir * rcp, -8.0, 8.0) * texel;
      vec3 a = 0.5 * (texture2D(tDiffuse, vUv - dir * (1.0/6.0)).rgb + texture2D(tDiffuse, vUv + dir * (1.0/6.0)).rgb);
      vec3 b = a * 0.5 + 0.25 * (texture2D(tDiffuse, vUv - dir * 0.5).rgb + texture2D(tDiffuse, vUv + dir * 0.5).rgb);
      float lb = L(b); gl_FragColor = vec4((lb < lMin || lb > lMax) ? a : b, 1.0);
    }`,
};
let fxaa = null, aoPass = null;
function buildComposer() {
  if (MOB) return buildComposerMobile();
  if (composer) { try { composer.renderTarget1.dispose(); composer.renderTarget2.dispose(); for (const p of composer.passes) p.dispose && p.dispose(); } catch { } }   // (a quality change: let the old one go)
  const q = save.quality, pr = Math.min(devicePixelRatio, q >= 3 ? 2 : q >= 1 ? 1.25 : 1);
  renderer.setPixelRatio(pr);
  // MSAA only on Ultra (it's the most expensive thing per pixel); Medium / High get FXAA instead
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: q >= 3 && pr < 1.5 && !Q.has('nomsaa') ? 4 : 0 });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  aoPass = null;
  if (q >= 2 && !Q.has('noao')) {   // ambient occlusion: full resolution on Ultra, half (8 samples) on High
    const ao = new GTAOPass(scene, camera, innerWidth, innerHeight);
    if (q < 3) { const ss = ao.setSize.bind(ao); ao.setSize = (w, h) => ss(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2))); ao.setSize(innerWidth, innerHeight); }
    ao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.5, thickness: 1.2, scale: 1.1, samples: q >= 3 ? 16 : 8 });
    ao.blendIntensity = 0.9; composer.addPass(ao); aoPass = ao;
  }
  bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.4, 0.55, 0.88); composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
  fxaa = q >= 1 && q < 3 ? new ShaderPass(FXAAShader) : null; if (fxaa) composer.addPass(fxaa);
  film = new ShaderPass(FilmShader); composer.addPass(film);
  renderer.shadowMap.type = q >= 1 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  resize();
}
// phones / tablets: no MSAA, no AO, bloom only on tablets (and off at Low), plain PCF shadows, a lower render resolution
// that the governor (mobile.js) nudges up or down to hold the frame rate
function buildComposerMobile() {
  if (composer) { try { composer.renderTarget1.dispose(); composer.renderTarget2.dispose(); for (const p of composer.passes) p.dispose && p.dispose(); } catch { } }
  const q = save.quality, pr = Math.max(MOB.prMin, Math.min(MOB.prCap, MOB.prStart * [0.8, 0.9, 1, 1.1][clamp(q | 0, 0, 3)]));
  renderer.setPixelRatio(pr);
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 0 });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = null;
  if (MOB.bloom && q >= 1) { bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.35, 0.5, 0.9); composer.addPass(bloomPass); }
  composer.addPass(new OutputPass());
  fxaa = DEV.tablet && q >= 1 ? new ShaderPass(FXAAShader) : null; if (fxaa) composer.addPass(fxaa);   // tablets: a cheap edge smooth (no MSAA here)
  film = new ShaderPass(FilmShader); composer.addPass(film);
  renderer.shadowMap.type = THREE.PCFShadowMap;
  resize();
}
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  if (composer) { const pr = renderer.getPixelRatio(); composer.setPixelRatio(pr); composer.setSize(w, h); film.uniforms.res.value.set(w, h); if (fxaa) fxaa.uniforms.texel.value.set(1 / (w * pr), 1 / (h * pr)); }
  const ov = $('overlay'), od = ODPR(); ov.width = w * od; ov.height = h * od; ov.style.width = w + 'px'; ov.style.height = h + 'px';
}
addEventListener('resize', resize);

const world = makeWorld(scene, renderer); C.world = world;
if (MOB && world.sun) world.sun.shadow.mapSize.set(MOB.shadow, MOB.shadow);   // (desktop: 2048-4096)
const fx = makeFX(scene); C.fx = fx;
const rain = makeRain(scene);
fx.onShellLand = (p, big) => SND.shellLand(p, big);
// blood on the ground under every hit
fx.onBlood = (p, d, amt) => { if (Math.random() < 0.6 * amt) { const k = 0.4 + Math.random() * 0.7; world.blood(p.x + (d ? d.x : 0) * k, p.z + (d ? d.z : 0) * k, 0.18 + Math.random() * 0.25 * amt, world.houseAt(p.x, p.z) ? 0.035 : 0.025); } };

// your flashlight
const torch = new THREE.SpotLight(0xfff0dc, 0, 30, 0.42, 0.5, 1.5);
torch.castShadow = !(MOB && DEV.lowPower); torch.shadow.mapSize.set(MOB ? 512 : 1024, MOB ? 512 : 1024); torch.shadow.bias = -0.0005; torch.shadow.camera.near = 0.2;
scene.add(torch, torch.target);
// a small black flashlight on the vest (rebuilt onto each new body)
const torchBodyM = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.45, metalness: 0.6 });
const torchLensM = new THREE.MeshStandardMaterial({ color: 0xfff2d8, emissive: 0xfff0dc, emissiveIntensity: 0, roughness: 0.1 });
const torchHaloM = new THREE.SpriteMaterial({ map: (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g2 = cv.getContext('2d'), gr = g2.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,244,220,1)'); gr.addColorStop(0.35, 'rgba(255,236,200,0.35)'); gr.addColorStop(1, 'rgba(255,230,190,0)'); g2.fillStyle = gr; g2.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(cv); })(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
function torchModel(S) {
  if (S.torchM && S.torchM.parent === S.B.Spine2) return S.torchM;
  const fl = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.16, 14), torchBodyM); body.castShadow = true;
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.024, 0.035, 16), torchBodyM); head.position.y = 0.095;
  const grip = new THREE.Mesh(new THREE.TorusGeometry(0.0205, 0.003, 6, 16), torchBodyM); grip.rotation.x = Math.PI / 2; grip.position.y = -0.02;
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.021, 16), torchLensM.clone()); lens.rotation.x = -Math.PI / 2; lens.position.y = 0.1135;
  const halo = new THREE.Sprite(torchHaloM.clone()); halo.scale.setScalar(0.22); halo.position.y = 0.13;
  fl.add(body, head, grip, lens, halo); fl.userData = { lens, halo };
  // (the bone's units can be centimetres on some rigs: undo its world scale so the torch stays real-size)
  S.B.Spine2.add(fl); S.B.Spine2.updateMatrixWorld(true); const ws = S.B.Spine2.getWorldScale(V()); const k = 1 / (ws.x || 1);
  fl.scale.setScalar(k); fl.position.set(-0.09 * k, 0.08 * k, 0.13 * k); fl.rotation.x = Math.PI / 2;
  S.torchM = fl; return fl;
}

// ---------------------------------------------------------------- the rescue helicopter (heli.js): 02:00 at Main & Maple, one minute on the ground
const LZ = { x: 0, z: 0, yaw: Math.PI };   // lands along Maple Ave, its tail clear of the cars parked on Main St
function initHeli() {
const E = END();
if (!MAPLE()) { const at = (E && E.at) || (MAPINFO && MAPINFO.lz) || world.lz || { x: 0, z: 0 }; Object.assign(LZ, { x: at.x, z: at.z, yaw: at.yaw ?? (MAPINFO && MAPINFO.lz && MAPINFO.lz.yaw) ?? 0 }); }
HELI.init({
  scene, camera, renderer,
  audio: () => SND.raw(),
  noise: (p, r) => noise(p, r),
  groundY: (x, z) => world.groundY ? world.groundY(x, z, 0, true) : 0,
  daylight: () => world.daylight ?? 0,
  playerPos: () => P && P.s ? P.s.pos : null,
  lz: LZ, lzName: MAPLE() ? 'Main St & Maple Ave' : lzName(),
  schedule: MAPLE() || !E ? [{ day: 2, hour: 2 }, { day: 3, hour: 2 }] : (E.schedule || [{ day: 2, hour: E.hour ?? 2 }]),   // 02:00 the night of day 1 (the day rolls over at midnight), then the last one
  boardKey: 'E',
  onInbound: () => heliInbound(),
  onArrive: () => heliArrive(),
  onCountdown: s => heliCount(s),
  onDepart: ps => heliDepart(ps),
  onMissed: final => heliMissed(final),
  onGone: () => {},
  ending: MAPLE() || !E ? null : E.kind === 'boat' && !E.vehicle ? { ...E, vehicle: 'boat' } : E,   // the map's way out: the desert Cessna, the prison/jungle boats, the stadium's ready check and window
  onNotReady: () => { if (E && E.notReady) think(E.notReady, 5); },
});
}

// ---------------------------------------------------------------- state
const G = {
  state: 'loading', t: 0, camYaw: Math.PI, camPitch: -0.12, saveT: 0,
  mouse: { x: innerWidth / 2, y: innerHeight / 2, inside: false, left: false, right: false }, lastShot: -99,
  aimPoint: V(), aimDist: 50, aimUnit: null, aimPart: null, help: true,
};
C.G = G;
const keys = new Set();
const timers = [];
function later(fn, s) { const id = G.runId || 0; timers.push({ t: G.t + s, fn: () => { if ((G.runId || 0) === id) fn(); } }); }
function runTimers() {
  const due = timers.filter(x => x.t <= G.t);
  if (!due.length) return;
  for (const x of due) timers.splice(timers.indexOf(x), 1);
  for (const x of due) { try { x.fn(); } catch (e) { console.error(e); } }
}
let P = null, MEL = null, SWINGS = null;
let PACK = null, HANDS = null, WRAP = null;   // your backpack, your hands, the bandage on your arm (backpack.js)
const RIGS = {};
const KINDS = {};

// ---------------------------------------------------------------- loading
const loader = new GLTFLoader();
const files = ['human', 'motion', 'human-base-animations', 'butler', 'coach', 'michelle'];
const progress = {};
const loadGLB = (name, n = 4) => new Promise((res, rej) => loader.load(`models/${name}.glb`, res, e => {
  if (e.total) { progress[name] = e.loaded / e.total; const s = Object.values(progress).reduce((a, b) => a + b, 0) / files.length; $('loadbar').style.width = (s * 55) + '%'; }
}, err => n > 1 ? setTimeout(() => loadGLB(name, n - 1).then(res, rej), 900) : rej(err)));
const tick = () => new Promise(r => setTimeout(r, 0));
const ZOMBIES = Q.has('zn') ? +Q.get('zn') : MOB ? Math.round(34 * MOB.poolScale) : 34;
let TIPS = ['Only the head kills for sure.', 'Gunshots bring the whole street.', 'Close a door behind you. They\'ll have to beat it down.', 'At night they can barely see you — unless your flashlight is on.', 'Rain covers the sound of your footsteps.', 'Grabbed? Mash Space before it bites.', 'A thrown bottle draws them away.', 'Bandage a cut before you bleed out.', 'The big ones don\'t stagger. Don\'t trade blows.', 'Crouch to move quietly.'];
let tipI = 0; const tipTimer = setInterval(() => { const e = $('loadtip'); if (!e) return; e.style.opacity = 0; setTimeout(() => { e.textContent = TIPS[tipI++ % TIPS.length]; e.style.opacity = 1; }, 600); }, 3200);
async function load() {
  const g = {};
  await Promise.all(files.map(async f => { g[f] = await loadGLB(f); }));
  const motion = g.motion, moves = g['human-base-animations'];
  // the Mixamo body is a different size: bring her up to an ordinary adult height next to the others
  { const top = sc => { sc.updateMatrixWorld(true); let y = 0; sc.traverse(o => { if (o.isBone && /HeadTop_End$/.test(o.name)) y = o.getWorldPosition(V()).y; }); return y; };
    const ref = top(g.human.scene), mh = top(g.michelle.scene);
    if (ref > 0 && mh > 0) { const k = ref * 0.95 / mh, arm = g.michelle.scene.children.find(o => !o.isMesh) || g.michelle.scene.children[0]; arm.scale.multiplyScalar(k); arm.position.multiplyScalar(k); g.michelle.scene.updateMatrixWorld(true); } }
  for (const k of ['human', 'butler', 'coach', 'michelle']) {
    $('loadtext').textContent = k === 'human' ? 'waking you up' : 'raising the dead'; await tick();
    KINDS[k] = prepareKind(g[k], motion, moves);
    if (k === 'michelle') cleanFemale(KINDS.michelle.root);
    $('loadbar').style.width = (55 + Object.keys(KINDS).length * 8) + '%';
  }
  SWINGS = analyseSwings(KINDS.human); Z.swings = SWINGS;
  $('loadtext').textContent = 'building ' + MAPS[MAP_ID].name; await tick(); await tick();
  world.KINDS = KINDS;   // [stadium] the map builders can pose the real character models (the stadium's fans and players)
  MAPINFO = await world.buildAsync(MAP_ID); C.mapInfo = MAPINFO;
  if (world.mapId !== MAP_ID) MAP_ID = world.mapId || 'maple';
  // (Chrome sometimes cancels this dynamic import right after the heavy world build — net::ERR_ABORTED — and caches the
  // failure for that URL: try again once, on a fresh URL, rather than dying on "Could not load")
  STORY = await loadStory(MAP_ID).catch(async e => { console.warn('story import retry:', e && e.message); await tick(); const m = await import(`./maps/${MAP_ID}.story.js?r=${Date.now()}`); return normalizeStory(m.default || m, MAP_ID, null, m); });
  C.story = STORY;
  if (STORY && Array.isArray(STORY.loadTips) && STORY.loadTips.length) TIPS = STORY.loadTips;   // the map's own loading tips, if it has them
  await tick();   // (let the bar and the tips repaint between the big pieces)
  if (!MAPLE()) placeMapNotes();
  if (world.lockGates) world.lockGates();
  SHOP.init({ scene, world, camera, G, keys, KINDS, PEOPLE, SND, P: () => P, MAP_ID: () => MAP_ID, toast, think, addItem, startSearch, showScreen, closeBag, equipGun, startThrow, later, fillTank });   // [zLux] the store, its keeper, the HUD wallet
  initHeli();
  DRIVE.initDrive({ scene, world, SND, fx, camera, damage, noise, Z, C, getP: () => P, hasKeys: () => (G.inv && G.inv.keys || 0) > 0, PEOPLE });
  TRAFFIC.initTraffic({ scene, world, SND, fx, camera, damage, noise, Z, C, G, getP: () => P, PEOPLE, KINDS, onStep, MP });   // [traffic]
  LANTERN.initLanterns({ scene, world, noise, SND, getP: () => P });
  await tick();
  world.occupants = () => [...Z.list.filter(u => u.active).map(u => u.s.pos), ...(C.npcs || []).map(u => u.s.pos), ...(P ? [P.s.pos] : [])];
  Soldier.groundY = world.groundY; world.nBase = world.containers.length;
  for (const c of world.containers) { if (c.fixed) c.fixed0 = c.fixed.map(a => [...a]); if (c.kind === 'corpse') c.mapBody = true; }   // the map's own loot and bodies: a new run puts them back
  $('loadtext').textContent = 'they\'re coming'; await tick();
  const s = new Soldier(KINDS.human, scene, { clone: true, onStep });   // (its own copy: the pack, guns and hands it wears must not end up on every zombie / person cloned from KINDS.human)
  s.update(1 / 60, {});
  P = { s, team: 0, hp: 100, maxHp: 100, alive: true, name: 'YOU', isPlayer: true, kills: 0, deaths: 0, hurtT: 99, deadT: 0 };
  P.arms = new Arms(s, scene, [], { onEvent: (ty, d) => armsEvent(ty, d), countThrow: id => G.inv ? (G.inv[id] || 0) : 0 });
  P.arms.cur = null;
  MEL = new Melee(s, scene, SWINGS);
  C.units.push(P); C.player = P;
  RIGS.human = { s, arms: P.arms, mel: MEL }; P.body = 'human';
  PACK = new Pack(scene); HANDS = new Hands(scene); WRAP = new Wrap(scene); PACK.wear(s, 'human');
  const bodies = ['human', 'butler', 'coach', 'michelle'];
  for (let i = 0; i < ZOMBIES; i++) {
    makeZombie(KINDS[bodies[i % 4]], scene, Math.floor(i / 3) % 4, onStep);
    if (i % 6 === 5) { $('loadbar').style.width = (80 + i / ZOMBIES * 15) + '%'; await tick(); }
  }
  $('loadtext').textContent = 'waking the dead'; await tick();
  await PEOPLE.makePeople({ scene, world, KINDS, SWINGS, onStep, damage, noise, SND, fx, P: () => P, G, camera, onTurned, onSurvivorDown, onBrotherHere: u => theySay('bro', 'here'), onBrotherDown: u => { if (G.state === 'play') think('BEN! No... no no no.', 3.5); }, onHumanHurt, onBrotherLeaves: () => later(() => think('Ben, wait — I didn\'t... Ben!', 3), 1.2), onPlayerCut: () => { if (G.bleed <= 0) toast('You\'re bleeding — bandage it (Q)', 'bad'); G.bleed = Math.max(G.bleed, 1); } }, 21, tick);
  PEOPLE.wire();
  // warm up every shader so nothing stutters the first time it appears
  $('loadtext').textContent = 'warming up'; await tick();
  if (MOB) capTextures(scene);   // smaller textures, lower anisotropy, before anything's uploaded
  // (compiled against the composer's own render target: drawing into it, three.js leaves tone mapping to the output
  // pass, so a compile against the screen would make programs the game never uses)
  const warm = async (obj, tgt = null) => { const rt0 = renderer.getRenderTarget(); renderer.setRenderTarget(composer.readBuffer);
    try { if (renderer.compileAsync) await renderer.compileAsync(obj, camera, tgt); else renderer.compile(obj, camera, tgt); } catch (e) { console.log('compile', e); } finally { renderer.setRenderTarget(rt0); } };
  const hour0 = world.time ?? null;
  if (!MOB) {
    PEOPLE.PPL.list.forEach((u, i) => { u.s.place(-40 + (i % 6), 24 + Math.floor(i / 6), 0); u.s.setVisible(true); });
    Z.pool.slice(0, 8).forEach((u, i) => { wake(u, -44 + Math.cos(i) * 4, 22 + Math.sin(i) * 4); });
    for (const t of Object.values(P.arms.throwMeshes)) t.visible = true;
    for (const id of SLOTS) P.arms.give(id); for (const id in P.arms.guns) P.arms.guns[id].visible = true;
    for (const id in MEL.meshes) MEL.meshes[id].visible = true;
    fx.lights.forEach(L => L.l.intensity = 1); torch.intensity = 1;
    s.place(-44, 20, 0); updateCamera(0.016);
    await warm(scene);
    composer.render();
  } else {
    // phones / tablets: compiling everything at once makes iOS drop the graphics chip — a little at a time instead
    // (the map in small chunks, then one of the dead per body, then a frame at night with the lights on)
    const kids = scene.children.slice();
    for (let i = 0; i < kids.length; i += 6) { $('loadbar').style.width = (96 + 3 * i / kids.length) + '%'; for (const o of kids.slice(i, i + 6)) await warm(o, scene); await tick(); }
    const seen = new Set(), few = Z.pool.filter(u => { const k = u.s.kind; if (seen.has(k)) return false; seen.add(k); return true; });
    few.forEach((u, i) => wake(u, -44 + Math.cos(i) * 3, 22 + Math.sin(i) * 3));
    fx.lights.forEach(L => L.l.intensity = 1); torch.intensity = 1;
    s.place(-44, 20, 0); updateCamera(0.016); await tick();
    for (const u of few) { await warm(u.s.pivot || u.s.root, scene); await tick(); }
    if (world.setTime) world.setTime(23);
    try { composer.render(); } catch (e) { console.log('warm frame', e); }
    await tick();
  }
  if (world.setTime && hour0 != null) world.setTime(hour0);
  fx.lights.forEach(L => L.l.intensity = 0); torch.intensity = 0; torch.shadow.autoUpdate = false;
  for (const t of Object.values(P.arms.throwMeshes)) t.visible = false;
  Z.pool.forEach(u => sleep(u));
  PEOPLE.PPL.list.forEach(u => u.s.setVisible(false));
  $('loadbar').style.width = '100%';
}

// ---------------------------------------------------------------- footsteps (and the noise they make)
const STEPB = { t: 0, n: 0 };
function onStep(s, e) {
  if (G.state !== 'play' && G.state !== 'dead' && G.state !== 'title') return;
  const mine = P && s === P.s;
  const surface = world.groundKind(s.pos.x, s.pos.z, s.gy || 0);
  if (e.jump) return;
  if (e.land) { if (mine) { noise(s.pos, 7); if (e.land > 6.5 && P.alive) damage(P, (e.land - 6.5) * 9, null, { fall: true }); } return SND.land(e.land, mine, mine ? null : s.pos); }
  if (e.body) return SND.bodyFall(s.pos, Math.min(1, e.body / 5));
  if (!s.visible && !(s.pivot && s.pivot.parent && Z.list.some(u => u.s === s && u.active))) return;
  if (!mine && s.pos.distanceTo(P.s.pos) > 30) return;
  // a crowd: at most 6 other people's footsteps every 0.1 s — the near ones always, the far ones only while there's room
  if (!mine) { const now = performance.now(); if (now - STEPB.t > 100) { STEPB.t = now; STEPB.n = 0; } if (STEPB.n >= 6 && s.pos.distanceTo(P.s.pos) > 7) return; STEPB.n++; }
  SND.step({ ...e, pan: mine ? e.side * 0.12 : 0, pos: mine ? null : V().set(s.pos.x, 0.1, s.pos.z), surface, mine, zombie: !!s.isZombie, heavy: mine ? 1 : (s.isZombie && s.big ? 1.0 : 0.75) });
  if (mine) noise(s.pos, e.crouch > 0.5 ? 1.5 : e.run > 0.5 ? 13 : 5);
}
function noise(p, loud) { C.noises.push({ x: p.x, z: p.z, t: G.t, loud: loud * (1 - (world.rain || 0) * 0.35) }); MP.noise(p, loud); }   // rain covers you a little (MP: a client's loud ones go to the host's dead)

// ---------------------------------------------------------------- the backpack
const NEW_INV = () => ({ water: 1, bar: 1, bandage: 1 });
function addItem(id, n = 1, opt = {}) {
  const I = ITEMS[id]; if (!I) return;
  if (I.cat === 'melee') {
    if (G.melee[id] != null) { G.melee[id] = MELEE[id].dur; return 'repair'; }   // a fresh one replaces the worn one
    G.melee[id] = MELEE[id].dur;
    if (MEL.cur === 'fists' && G.weapon === 'fists' && !P.arms.cur) { if (opt.defer) { G.weapon = id; return 'equip'; } equipMelee(id); }   // defer: the hand that picks it up keeps it
    return 'new';
  }
  if (I.cat === 'gun') {
    const fresh = !P.arms.guns[id];
    P.arms.give(id); P.arms.guns[id].visible = false;
    const W = WEAPONS[id];
    if (fresh) { P.arms.ammo[id].mag = Math.floor(W.mag * rnd(0.2, 0.8)); P.arms.ammo[id].res = 0; }
    else G.inv[W.ammo] = (G.inv[W.ammo] || 0) + Math.ceil(W.mag / 2);
    return fresh ? 'new' : 'ammo';
  }
  if (I.one) {
    if (G.inv[id] > 0) { G.inv.battery = (G.inv.battery || 0) + 1; return 'item'; }   // a second one: you keep its batteries
    G.inv[id] = 1;
    if (id === 'flashlight') { toast('Flashlight — press F', 'good'); G.battery = Math.max(G.battery, 60); }
    if (id === 'lantern') toast('Camping lantern — press L to light it, E to set it down', 'good');
    return 'new';
  }
  G.inv[id] = (G.inv[id] || 0) + n;
  return 'item';
}
function useItem(id) {
  const I = ITEMS[id]; if (!I || !(G.inv[id] > 0) || !P.alive) return false;
  if (I.cat === 'food' || I.cat === 'drink') {
    if (HANDS.busy()) { toast('Hands full', 'grey'); return false; }
    G.inv[id]--; G.stats.used++; STATS.event('use', { id, cat: I.cat });
    // it does you good when it gets to your mouth, not when you take it out of the pack
    consumeAnim(id, () => { if (I.food) G.food = clamp(G.food + I.food, 0, 100); if (I.water) G.water = clamp(G.water + I.water, 0, 100); if (I.stam) G.stam = clamp(G.stam + I.stam, 0, 100); });   // out of the pack, to your mouth (the crunch and the gulps when it gets there)
    toast(`${I.use === 'Eat' ? 'Ate' : 'Drank'} ${I.name.toLowerCase()}`, 'grey');
    tut('eat');
    return true;
  }
  if (I.cat === 'med') {
    if (HANDS.busy()) { toast('Hands full', 'grey'); return false; }
    G.inv[id]--; G.stats.used++; STATS.event('use', { id, cat: I.cat });
    if (I.heal) G.healQ += I.heal;
    if (I.stopBleed) G.bleed = 0;
    if (I.cure) G.infection = Math.max(0, G.infection - I.cure);
    if (I.stopBleed || id === 'medkit') bandageAnim(id);   // the roll out of the pack, wound round your forearm
    else consumeAnim(id);                                 // pills: out of the pack, a couple swallowed
    toast(id === 'bandage' ? 'Bandaged the wound' : id === 'medkit' ? 'Patched yourself up' : id === 'antibiotics' ? 'Took the antibiotics' : 'Took painkillers', 'good');
    return true;
  }
  if (id === 'lantern') { if (!LANTERN.carrying()) LANTERN.carry(true); const S = P.s, a = S.yaw; LANTERN.place(S.pos.x + Math.sin(a) * 0.6, S.pos.z + Math.cos(a) * 0.6, a); G.inv.lantern--; toast('Lantern set down', 'grey'); return true; }
  if (id === 'battery') { G.inv[id]--; const lanternLow = G.inv.lantern > 0 && LANTERN.charge() < 100, torchLow = G.inv.flashlight > 0 && G.battery < 100; if ((lanternLow && (!torchLow || LANTERN.carrying() || LANTERN.charge() < G.battery)) || (!(G.inv.flashlight > 0) && G.inv.lantern > 0)) { LANTERN.recharge(); toast('Fresh batteries in the lantern', 'grey'); return true; } G.battery = 100; batteryAnim(); toast('Fresh batteries in the flashlight', 'grey'); return true; }
  return SHOP.useMore(id);   // [zLux] everything else in the pack does something too
}
function quickHeal() {
  for (const id of G.bleed > 0 ? ['bandage', 'medkit'] : ['medkit', 'bandage', 'pills']) if (G.inv[id] > 0) { useItem(id); return; }
  toast('Nothing to patch yourself up with', 'bad');
}

// ---------------------------------------------------------------- weapons
// switching weapons is done with your hand: the one you had goes onto the backpack (or the belt), the next comes off it
function equipMelee(id, instant = false) {
  if (G.weapon === id && (P.arms.cur ? false : MEL.cur === id)) return;
  const prev = P.arms.cur || MEL.cur; G.weapon = id;
  if (instant || !HANDS || !P.alive || G.state === 'title' || DRIVE.active()) { if (HANDS) HANDS.flush(); G.weapon = id; MEL.set(id); P.arms.holster(); SND.mech('switch'); return; }
  weaponSwap(prev, id);
}
function equipGun(id, instant = false) {
  if (!P.arms.guns[id]) { toast(`No ${WEAPONS[id].name.toLowerCase()}`, 'grey'); return; }
  if (P.arms.cur === id) return;
  const prev = P.arms.cur || MEL.cur; G.weapon = id; MEL.swing = null;
  if (instant || !HANDS || !P.alive || DRIVE.active()) { if (HANDS) HANDS.flush(); G.weapon = id; MEL.hideAll(); MEL.cur = 'fists'; P.arms.select(id); return; }
  weaponSwap(prev, id);
}
function selectSlot(n) {
  if (G.state !== 'play' || G.grabbedBy || G.search) return;
  if (n === 1) equipMelee('fists');
  else if (n === 2) {
    const have = MELEE_ORDER.filter(id => G.melee[id] != null);
    if (!have.length) { toast('No melee weapon — find one', 'grey'); return; }
    const i = have.indexOf(G.weapon);
    equipMelee(have[(i + 1) % have.length]);
  } else equipGun(['pistol', 'shotgun', 'sniper'][n - 3]);
}
function armsEvent(type, d) {
  if (['magOut', 'magIn', 'charge', 'bolt', 'shell', 'dry', 'switch', 'pin', 'pump', 'light'].includes(type)) SND.mech(type);
  else if (type === 'pumpLater') later(() => SND.mech('pump'), 0.2);
  else if (type === 'throw') throwIt(d.id, d.pos);
}
// bottles and Molotovs: real arcs, shatter where they land
const throws = [];
const throwMesh = {};
function throwIt(id, hand) {
  if (!(G.inv[id] > 0)) return;
  G.inv[id]--; if (id === 'molotov') STATS.event('molotov');
  const tgt = G.aimPoint.clone();
  const dd = Math.hypot(tgt.x - hand.x, tgt.z - hand.z); if (dd > 26) tgt.lerpVectors(hand, tgt, 26 / dd);
  const v = lob(hand, tgt, 15);
  const m = makeWeaponMesh(id); scene.add(m); m.position.copy(hand);
  throws.push({ id, m, p: m.position, v, w: V(rnd(-12, 12), rnd(-12, 12), rnd(-12, 12)), t: 0 });
  SND.throwWhoosh();
}
function lob(from, target, maxV) {
  const dx = target.x - from.x, dz = target.z - from.z, dy = target.y - from.y, h = Math.hypot(dx, dz) || 0.01, g = 9.8;
  for (const ang of [0.45, 0.6, 0.75]) { const c = Math.cos(ang), s = Math.sin(ang), den = 2 * c * c * (h * Math.tan(ang) - dy); if (den <= 0) continue; const v = Math.sqrt(g * h * h / den); if (v <= maxV) return V(dx / h * c * v, s * v, dz / h * c * v); }
  return V(dx / h * Math.cos(0.7) * maxV, Math.sin(0.7) * maxV, dz / h * Math.cos(0.7) * maxV);
}
const fires = [];
function updateThrows(dt) {
  for (let i = throws.length - 1; i >= 0; i--) {
    const T = throws[i]; T.t += dt;
    const step = T.v.length() * dt, d = V().copy(T.v).normalize();
    const h = world.ray(T.p, d, step + 0.05);
    let hitZ = null;
    const uh = rayUnits(T.p, d, step + 0.05, P); if (uh && (!h || uh.t < h.t)) hitZ = uh;
    const gy = world.groundY ? world.groundY(T.p.x, T.p.z, T.p.y) : 0, nextY = T.p.y + T.v.y * dt;
    let groundT = null; if (nextY <= gy + 0.03) groundT = clamp((T.p.y - gy) / Math.max(1e-4, -T.v.y * dt), 0, 1) * step;
    if (h || hitZ || groundT != null || T.t > 5) {
      const at = T.p.clone().addScaledVector(d, Math.min(h ? h.t : 1e9, hitZ ? hitZ.t : 1e9, groundT != null ? groundT : 1e9, step));
      at.y = Math.max(gy + 0.02, at.y);
      scene.remove(T.m); throws.splice(i, 1);
      fx.glass(at); SND.glass(at, 1); noise(at, 30);
      if (hitZ && hitZ.unit.npc) { PEOPLE.hurtNPC(hitZ.unit, hitZ.part === 'head' ? 22 : 12, P, { part: hitZ.part, thrown: true, dir: d }); SND.meleeHit('blunt', at, hitZ.part === 'head', 0.6); }
      else if (hitZ) { damage(hitZ.unit, 12, P, { dir: d, part: hitZ.part, knock: 0.3 }); SND.meleeHit('blunt', at, hitZ.part === 'head', 0.6); }
      if (T.id === 'molotov') { if (h && !hitZ) at.addScaledVector(d, -0.35); const fy = world.groundY ? world.groundY(at.x, at.z, at.y + 0.3) : 0; const fp = V(at.x, fy + 0.02, at.z); fires.push({ p: fp, t: 9, r: 2.4, sndT: 0 }); SND.ignite(fp); world.blood && null; world.paint(fp.x, fp.z, 2.6, 'scorch', 0.9); fx.flames(fp, 2.4, 30); noise(fp, 22); }
      continue;
    }
    T.v.y -= 9.8 * dt; T.p.addScaledVector(T.v, dt);
    T.m.rotation.x += T.w.x * dt; T.m.rotation.y += T.w.y * dt; T.m.rotation.z += T.w.z * dt;
    if (T.id === 'molotov') { if (Math.random() < 0.6) fx.fire(T.p, 1); if (fx.holdLight) fx.holdLight(T, T.p, 2, 5, 0xff8a33); }
  }
  // burning fuel: hurts whoever stands in it, sets the dead alight
  for (let i = fires.length - 1; i >= 0; i--) {
    const F = fires[i]; F.t -= dt;
    if (F.t <= 0) { fires.splice(i, 1); continue; }
    fx.flames(F.p, F.r * Math.min(1, F.t / 2), 3);
    F.sndT -= dt; if (F.sndT <= 0) { F.sndT = 0.45; SND.fireLoop(F.p, Math.min(1, F.t / 3)); }
    const lvl = u => Math.abs((u.s.gy ?? u.s.pos.y) - F.p.y) < 1.2;   // same floor as the fire
    for (const u of Z.list) if (u.alive && lvl(u) && Math.hypot(u.s.pos.x - F.p.x, u.s.pos.z - F.p.z) < F.r) { u.burn = 6; }
    for (const n of C.npcs || []) if (n.alive && !n.gone && lvl(n) && Math.hypot(n.s.pos.x - F.p.x, n.s.pos.z - F.p.z) < F.r) { n.burnT = (n.burnT || 0) + dt; if (n.burnT > 0.4) { n.burnT = 0; PEOPLE.hurtNPC(n, 7, P, { fire: true }); if (Math.random() < 0.5) fx.fire(V(n.s.pos.x, 1, n.s.pos.z), 1); } }
    if (P.alive && !DRIVE.active() && lvl(P) && Math.hypot(P.s.pos.x - F.p.x, P.s.pos.z - F.p.z) < F.r * 0.85) { G.burnHurt = (G.burnHurt || 0) + dt; if (G.burnHurt > 0.35) { G.burnHurt = 0; damage(P, 4, null, { fire: true }); } }
  }
}

// ---------------------------------------------------------------- input
addEventListener('keydown', e => {
  if (e.metaKey) { keys.clear(); return; }   // Cmd-anything (Cmd-Tab, Cmd-Q...): a Mac never sends the keyups that follow, so nothing may stay held
  if (MP.typing()) return;   // MP: typing in the chat / lobby
  if (G.state === 'note') { if (['KeyE', 'Space', 'Escape', 'Enter', 'Tab'].includes(e.code)) { closeNote(); e.preventDefault(); } return; }
  if (G.state === 'intro') return;
  if (G.state === 'news') { if (['Space', 'Enter', 'Escape'].includes(e.code) && G.news && G.news.t > 1) endNews(true); e.preventDefault(); return; }
  if (G.state === 'phone' && e.code === 'Escape') { closePhone(); e.preventDefault(); return; }
  if ((e.code === 'KeyP' || e.code === 'Escape') && G.state === 'title' && STATS.isOpen()) return;
  if (e.code === 'KeyP' || e.code === 'Escape') { if (G.state === 'bag') closeBag(); else togglePause(); e.preventDefault(); return; }
  if (e.code === 'KeyV' && (G.state === 'play' || G.state === 'dead')) { save.view = save.view === 'first' ? 'third' : 'first'; writeSave(); syncSettings(); toast(save.view === 'first' ? 'First person' : 'Third person', 'grey'); tut('view'); return; }
  if (e.code === 'Tab') { e.preventDefault(); if (G.state === 'bag' || (G.packAnim && G.packAnim.dir > 0)) closeBag(); else if (G.state === 'play' && P.alive) openBag(); return; }
  if (e.code === 'KeyT' && (G.state === 'play' || G.state === 'phone') && P.alive) { e.preventDefault(); if (G.state === 'phone') closePhone(); else openPhone(); return; }
  if (e.code === 'KeyM') { save.music = save.music > 0 ? 0 : 0.6; SND.setMusic(save.music); syncSettings(); writeSave(); }
  if (G.state === 'result' && (e.code === 'Enter' || e.code === 'Space')) { $('resultPanel').querySelector('button')?.click(); return; }
  if (G.state !== 'play' && G.state !== 'dead') return;
  keys.add(e.code);
  if (e.repeat) { e.preventDefault(); return; }
  if (G.state !== 'play' || !P.alive) return;
  if (G.grabbedBy && (e.code === 'Space' || e.code === 'KeyE')) { struggle(); e.preventDefault(); return; }
  if (e.code === 'Space') { G.jumpReq = true; tut('jump'); }
  if (e.code === 'KeyC') { G.crouch = !G.crouch; if (G.crouch) tut('crouch'); }
  if (e.code === 'KeyR') P.arms.cur && P.arms.startReload();
  if (e.code === 'KeyE') G.useReq = true;
  if (e.code === 'KeyF') { if (!(G.inv && G.inv.flashlight > 0)) { toast('No flashlight — search attics, nightstands, garages, cars', 'bad'); return; } G.flashlight = !G.flashlight; SND.flashlight(G.flashlight); if (G.flashlight && G.battery <= 0) toast('Flashlight is dead — find batteries', 'bad'); }
  if (e.code === 'KeyL' && G.state === 'play') { if (!(G.inv && G.inv.lantern > 0)) toast('No lantern — old camping gear is usually up in the attic', 'bad'); else { const on = LANTERN.carry(!LANTERN.carrying()); toast(on ? 'Lantern on — it lights you up, and they can see it' : 'Lantern off', 'grey'); } }
  if (e.code === 'KeyQ') quickHeal();
  if (e.code === 'KeyG') startThrow('bottle');
  if (e.code === 'KeyH') startThrow('molotov');
  const n = { Digit1: 1, Digit2: 2, Digit3: 3, Digit4: 4, Digit5: 5 }[e.code]; if (n) selectSlot(n);
  e.preventDefault();
});
addEventListener('keyup', e => { keys.delete(e.code); if (e.key === 'Meta') keys.clear(); });
addEventListener('blur', () => { keys.clear(); G.mouse.left = G.mouse.right = false; });
canvas.addEventListener('pointermove', e => { if (TOUCH && e.pointerType === 'touch') return; G.mouse.x = e.clientX; G.mouse.y = e.clientY; G.mouse.inside = true; });
addEventListener('pointermove', e => { if (TOUCH && e.pointerType === 'touch') return; G.mouse.x = e.clientX; G.mouse.y = e.clientY; });
document.addEventListener('mouseleave', () => { G.mouse.inside = false; });
document.addEventListener('mouseenter', () => { G.mouse.inside = true; });
// ---- mouse look: click the game to grab the mouse; moving it turns your head. Esc / P gives it back.
const IN_APP = !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.zapoc);
G.locked = false;
const LOOK_STATES = ['play', 'dead', 'escaping'];
// the mouse is never hidden or grabbed: it's your crosshair. Hold the right button and drag to turn the camera.
function lockMouse() { }
function unlockMouse() { }
function look(dx, dy) {
  if (!LOOK_STATES.includes(G.state) || G.state === 'escaping') return;
  if (Math.abs(dx) > 300 || Math.abs(dy) > 300) return;   // a stray jump when the lock engages
  const k = 0.0042 * save.sens * (G.scoped ? 0.22 : G.aimW > 0.5 ? 0.6 : 1) * (1 - 0.4 * (G.zoomW || 0));
  G.camYaw -= dx * k;
  G.camPitch -= dy * k * (save.invert ? -1 : 1);
  G.lookT = G.t; TUT.look += Math.abs(dx) + Math.abs(dy);
}
// right button held: drag to look. A quick right click (no drag) is a shove.
const rdrag = { on: false, d: 0, t: 0 };
addEventListener('pointermove', e => { if (rdrag.on && (e.buttons & 2)) { rdrag.d += Math.abs(e.movementX) + Math.abs(e.movementY); look(e.movementX, e.movementY); } });
canvas.addEventListener('pointerdown', e => {
  if (TOUCH && e.pointerType === 'touch') return;   // touch.js has its own stick, look and buttons
  G.mouse.inside = true; G.mouse.x = e.clientX; G.mouse.y = e.clientY;
  if (e.button === 0) { G.mouse.left = true; G.clickReq = true; }
  if (e.button === 2) { G.mouse.right = true; rdrag.on = true; rdrag.d = 0; rdrag.t = performance.now(); }
  if (G.grabbedBy && e.button === 0) struggle();
  try { canvas.setPointerCapture(e.pointerId); } catch { }
});
addEventListener('pointerup', e => {
  if (TOUCH && e.pointerType === 'touch') return;
  if (e.button === 0) G.mouse.left = false;
  if (e.button === 2) { G.mouse.right = false; if (rdrag.on && rdrag.d < 10 && performance.now() - rdrag.t < 200) G.shoveReq = true; rdrag.on = false; }
});
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('wheel', e => { e.preventDefault(); if (G.state !== 'play' || Math.abs(e.deltaY) < 10) return; G.wheelT = (G.wheelT || 0); if (G.t < G.wheelT) return; G.wheelT = G.t + 0.15; const order = ['fists', ...MELEE_ORDER.filter(id => G.melee[id] != null), ...SLOTS.filter(id => P.arms.guns[id])]; const i = order.indexOf(G.weapon); const nx = order[(i + (e.deltaY > 0 ? 1 : -1) + order.length) % order.length]; if (MELEE[nx]) equipMelee(nx); else equipGun(nx); }, { passive: false });
function startThrow(id) {
  if (DRIVE.active() || G.vault || G.state !== 'play' || G.inAmb) return;
  if (!P.alive || G.grabbedBy || G.search) return;
  if (!(G.inv[id] > 0)) { toast(id === 'bottle' ? 'No bottles to throw' : 'No Molotovs', 'grey'); return; }
  if (MEL.swing) return;
  P.arms.startThrow(id);
}

// ---------------------------------------------------------------- messages
let capT = 0, capPrio = false; const capQ = [];
// a caption stays up long enough to read (1.2 s + ~2.6 words a second); broadcast lines (prio) queue instead of being stepped on
function think(text, dur = 4, prio = false) {
  text = touchWords(text); if (!text) { if (!capPrio) { capT = 0.01; } return; }
  const words = String(text).split(/\s+/).length; dur = Math.max(dur, 1.2 + words / 2.6);
  if (capT > 0 && capPrio) { if (capQ.length < 4 || prio) capQ.push([text, dur, prio]); if (capQ.length > 6) capQ.splice(capQ.findIndex(q => !q[2]) >>> 0, 1); return; }
  const c = $('caption'); c.textContent = text; c.classList.add('show'); capT = dur; capPrio = prio;
}
function capTick(dt) { if (capT > 0) { capT -= dt; if (capT <= 0) { capPrio = false; const q = capQ.shift(); if (q) { const c = $('caption'); c.textContent = q[0]; capT = q[1]; capPrio = q[2]; } else $('caption').classList.remove('show'); } } }
function capClear() { capQ.length = 0; capT = 0; capPrio = false; $('caption').classList.remove('show'); }
// ALL-CAPS names (the people list) read as Names; anything already mixed-case is left alone
const nm = s => !s ? s : s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s'\-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()) : s;
function toast(text, cls = '', ic = null) { text = touchWords(text); const t = document.createElement('div'); t.className = 'toast ' + cls; t.innerHTML = (ic ? icon(ic) : cls === 'bad' ? icon('blood') : cls === 'good' ? icon('check') : '') + `<span>${String(text).replace(/</g, '&lt;')}</span>`; $('toasts').appendChild(t); setTimeout(() => t.classList.add('out'), 3200); setTimeout(() => t.remove(), 4000); while ($('toasts').children.length > (TOUCH ? 3 : 7)) $('toasts').firstChild.remove(); }
let bigT = 0;
function bigText(t, s = '', dur = 3) { $('big').innerHTML = `<div class="t">${t}</div><div class="s">${s}</div>`; $('big').style.opacity = 1; bigT = dur; document.body.classList.add('bigOn'); }

// ---------------------------------------------------------------- combat events
let hitT = 0, hitKill = false, hitHead = false;
C.events.hitBox = (b, dmg, u, p) => { if (!b || !b.brk || !world.hitBreakable || !p || !u) return; world.hitBreakable(p, V(p.x - u.s.pos.x, 0, p.z - u.s.pos.z), Math.min(2, dmg / 40), 'bullet'); };
C.events.hitmarker = (v, killed, head) => { hitT = 0.25; hitKill = killed; hitHead = head; };
C.events.playerHurt = (dmg, info, by) => {
  if (G.state === 'bag' && !(info.bleed || info.starve || info.thirst || info.infection)) { const b = $('bag'); b.classList.remove('hurt'); void b.offsetWidth; b.classList.add('hurt'); }
  // bleeding, hunger, thirst, the fever: a slow drain, not a blow — no flinch, no sound
  if (info.bleed || info.starve || info.thirst || info.infection) { G.hurtFlash = Math.min(0.35, (G.hurtFlash || 0) + dmg / 30); return; }
  if (info.fire) { G.hurtFlash = Math.min(1, (G.hurtFlash || 0) + 0.15); if (G.t > (G.fireOuchT || 0)) { G.fireOuchT = G.t + 1.2; SND.hurtPlayer(0.4, 0, 'claw'); } return; }
  G.hurtFlash = Math.min(1, (G.hurtFlash || 0) + dmg / 40);
  let rel = 0;
  if (by && by !== P) { const a = Math.atan2(by.s.pos.x - P.s.pos.x, by.s.pos.z - P.s.pos.z); rel = wrapPi(a - G.camYaw); G.hurtDir.push({ a: rel, t: 1.2 }); }
  SND.hurtPlayer(Math.min(1, dmg / 25), Math.sin(rel), info.bite ? 'bite' : 'claw');
  C.shake = Math.max(C.shake, Math.min(0.55, dmg / 45));
  if (G.search) cancelSearch();
};
C.events.hurt = (v, dmg, by, info) => { MP.hitLanded(v, dmg, by, info, false); if (v.zombie) { zombieHurt(v, dmg, by, info); if (Math.random() < 0.6) SND.zombie('hurt', v.s.pos, zp(v)); } };
C.events.kill = (v, by, info) => {
  if (v === P) return playerDied(info);
  if (v.remote) return MP.hitLanded(v, 0, by, info, true);   // MP: you knocked a friend down (friendly fire)
  if (!v.zombie) return;
  MP.hitLanded(v, 0, by, info, true);   // MP: a client's kill on one of the host's dead
  { // how it dies, by ear: a head shot drops it without a sound but the skull going; one already on the floor just stops
    const rate = v.s.deathRate || 1.075, wasDown = v.z.down > 0, head = info.part === 'head';
    if (head) SND.impact(V(v.s.pos.x, (v.s.pos.y || 0) + (wasDown ? 0.25 : 1.6), v.s.pos.z), 'fleshHead', 0.9);
    if (head || wasDown) { if (!wasDown) SND.bodyFall(v.s.pos, 0.8, SND.DEATH_HIT / rate); else if (!head && Math.random() < 0.5) SND.zombie('hurt', v.s.pos, zp(v)); }
    else SND.zombie('die', v.s.pos, zp(v), rate);
  }
  v.deadT = 0; v.z.down = 0;
  if (by === P) { G.stats.kills++; save.kills++; if (info.part === 'head') G.stats.heads++; STATS.event('kill', { info }); }
  if (G.grabbedBy === v) releaseGrab(false);
  // they leave a body (and sometimes something on it)
  const c = world.container('corpse', v.s.pos.x, v.s.pos.z, 0.3, v.dale ? "Dale's body (orange vest)" : 'Body', 0, null, { dyn: true });
  c.unit = v; v.corpse = c;
  if (v.dale) { c.fixed = [['keys', 1]]; c.note = 'dale2'; if (by === P) later(() => think('The orange vest... Dale. I\'m sorry.', 3.5), 1); }
  world.blood(v.s.pos.x + (info.dir ? info.dir.x * 0.6 : 0), v.s.pos.z + (info.dir ? info.dir.z * 0.6 : 0), 0.5 + Math.random() * 0.4, world.houseAt(v.s.pos.x, v.s.pos.z) ? 0.036 : 0.026);
};
C.events.zombieSpots = (u, d) => {
  if (d < 25 && G.t - (G.spottedT || -99) > 20) { G.spottedT = G.t; SND.sting('spotted'); }
  // the ones nearby hear it and come too
  noise(u.s.pos, u.runner ? 26 : 14);
  return SND.zombie(u.runner ? 'scream' : 'alert', u.s.pos, zp(u));   // (how long it screams, so its mouth moves for exactly that long)
};
C.events.zombieSpotsNPC = (u, n) => { noise(u.s.pos, 12); return SND.zombie(u.runner ? 'scream' : 'alert', u.s.pos, zp(u)); };
C.events.zombieClawNPC = (u, n) => { SND.meleeHit('fist', V(n.s.pos.x, 1.2, n.s.pos.z), false, 0.7); SND.impact(V(n.s.pos.x, 1.2, n.s.pos.z), 'flesh', 0.5); PEOPLE.hurtNPC(n, rnd(34, 52) * (u.big ? 1.5 * u.bigK : 1) * (u.dmgK || 1) * (G.state === 'news' ? 1.3 : 1), u); if (!n.alive) SND.zombie('bite', n.s.pos, zp(u)); };   // [boss] dmgK
C.events.zombieFeed = u => SND.zombie('bite', u.s.pos, zp(u));
C.events.zombieChew = u => SND.feed ? SND.feed(u.s.pos) : SND.zombie('bite', u.s.pos, zp(u));
// a neighbour gets back up as one of them
function onTurned(z, n) {
  if (n.role === 'bro') { later(() => think('Ben... I\'m so sorry.', 4), 0.6); return; }
  if (G.state === 'play' && P.alive && z.s.pos.distanceTo(P.s.pos) < 20 && world.los(V(P.s.pos.x, 1.5, P.s.pos.z), V(z.s.pos.x, 0.8, z.s.pos.z))) later(() => think(n.name && n.role === 'surv' ? `${nm(n.name)}... no. Not you too.` : pick(['They\'re... getting up. Oh God, they\'re getting up.', 'It\'s moving again.', 'Don\'t get up. Please don\'t get up.']), 3.5), 0.6);
}
// you hurt a person (people.js tells us; they and everyone who saw it react there)
function onHumanHurt(n, killed) {
  const first = (n.hitByMe || 0) <= 1;
  if (first) { G.stats.humansHurt = (G.stats.humansHurt || 0) + 1; STATS.event('humanHurt', { killed }); if (killed) G.stats.humansKilled = (G.stats.humansKilled || 0) + 1; }
  else if (killed) { G.stats.humansKilled = (G.stats.humansKilled || 0) + 1; STATS.event('humanKilled'); }
  if (G.state !== 'play' || !P.alive) return;
  if (killed && !G.saidKilled) { G.saidKilled = true; later(() => think(pick(['Oh God. What did I do... what did I DO?', 'They\'re not moving. They\'re not... I killed them.', 'I killed a person. A real, living person.']), 4), 1); }
  else if (first && !G.saidHurt && n.role !== 'bro') { G.saidHurt = true; later(() => think('They\'re a person. They\'re still a person...', 3), 1.4); }
}
function onSurvivorDown(n) {
  if (G.state === 'play' && P.alive && n.s.pos.distanceTo(P.s.pos) < 30) think(`${nm(n.name)}! NO!`, 2.5);
}
C.events.zombieAlert = u => SND.zombie('groan', u.s.pos, zp(u));
C.events.zombieGroan = (u, chasing) => SND.zombie(chasing ? (Math.random() < 0.5 ? 'growl' : 'groan') : Math.random() < 0.5 ? 'moan' : 'groan', u.s.pos, zp(u));
C.events.zombieGrowl = u => SND.zombie('growl', u.s.pos, zp(u));
C.events.zombieClaw = u => {
  const dmg = rnd(6, 11) * DIFF.dmg * (u.big ? 1.7 * u.bigK : 1) * (u.dmgK || 1);   // [boss] dmgK: 2x mini boss, 5x boss, 8x The Zombie
  if (MP.clawRemote(u, dmg)) return;   // MP: the host's zombie clawed a friend
  if (!P.alive || C.godMode) return;
  damage(P, dmg, u, { claw: true });
  if (Math.random() < 0.35) { if (G.bleed <= 0) toast('You\'re bleeding — bandage it (Q)', 'bad'); G.bleed = Math.max(G.bleed, 1); }
  fx.blood(P.chest || P.s.pos, V(Math.sin(u.s.yaw), 0, Math.cos(u.s.yaw)), 0.6);
};
// each zombie's own voice: women higher, every one a little different, the big ones deep
function zp(u) { if (!u) return 1; return ((u.big ? 0.72 : (u.s && (u.s.isFemale || (u.s.kind && u.s.kind.root && u.s.kind.root.userData.female)) ? 1.18 : 0.94)) + (((u.id || 0) * 29) % 9) * 0.012) * (u.vpK || 1); }   // [boss] vpK: deeper
C.events.zombieGrab = u => {
  if (MP.clawRemote(u, rnd(12, 18) * DIFF.dmg * (u.big ? 1.5 : 1), true)) return;   // MP: grabbed a friend: a bite on their side
  if (!P.alive || G.grabbedBy || G.vaulting || C.godMode) return;
  G.grabbedBy = u; G.grabT = 0; G.struggle = 0; tip('grab'); STATS.event('grabbed'); G.biteAt = rnd(1.9, 2.6) * (G.stam < 25 ? 0.8 : 1);
  u.z.hold = true;   // it takes hold of your shoulders (zombies.js zombiePose reaches both hands to you)
  document.body.classList.add('grabbed');
  SND.zombie('growl', u.s.pos, zp(u)); SND.sting('grab'); C.shake = Math.max(C.shake, 0.35);
  if (G.search) cancelSearch();
  MEL.swing = null;
  P.s.playUp('Hit_Chest', { rate: 0.8, loop: true, fade: 0.1 });
};
C.events.doorBang = (D, u) => { SND.door('bang', V(D.x, 1.2, D.z)); noise(V(D.x, 0, D.z), 14); };
C.events.doorBreak = (D, u) => { STATS.event('doorBroken', { by: 'zombie' }); const dir = Math.sign(Math.cos(D.yaw) * (u.s.pos.z - D.z) - Math.sin(D.yaw) * (u.s.pos.x - D.x)) || 1; world.breakDoor(D, dir); SND.door('break', V(D.x, 1, D.z)); noise(V(D.x, 0, D.z), 25); if (Math.hypot(D.x - P.s.pos.x, D.z - P.s.pos.z) < 15) think('They broke the door down.', 3); };
function struggle() {
  if (!G.grabbedBy) return;
  G.struggle += 0.11 * (G.stam > 10 ? 1 : 0.6) / (G.grabbedBy.big ? 1.45 * G.grabbedBy.bigK : 1); SND.struggle(); C.shake = Math.max(C.shake, 0.15);
  G.stam = Math.max(0, G.stam - 1.5);
  if (G.struggle >= 1) releaseGrab(true);
}
function releaseGrab(brokeFree) {
  if (brokeFree) STATS.event('brokeFree');
  const u = G.grabbedBy; G.grabbedBy = null; document.body.classList.remove('grabbed');
  P.s.ups.Hit_Chest && (P.s.ups.Hit_Chest.target = 0); P.s.up = null;
  if (u) u.z.hold = false;
  if (u && u.alive) {
    u.s.ups.Zombie_Scratch && (u.s.ups.Zombie_Scratch.target = 0); u.s.up = null;
    if (brokeFree) { const dir = V(u.s.pos.x - P.s.pos.x, 0, u.s.pos.z - P.s.pos.z).normalize(); const ph = ((MEL.swings || SWINGS || {}).Push || { hit: 1.73 }).hit; P.s.playUp('Push', { rate: 1.4, fade: 0.05, from: Math.max(0, ph - 0.3), fadeAt: ph + 0.3 }); later(() => { if (!u.alive) return; SND.shove(); if (Math.random() < 0.55) knockDown(u, dir); else zombieHurt(u, 0, P, { knock: 0.9, dir }); }, 0.21); u.z.atkT = 2.2; G.noGrabT = C.t + 4; }
    else u.z.atkT = 1.6;
  }
}
function updateGrab(dt) {
  const u = G.grabbedBy; if (!u) return;
  if (!u.alive || !P.alive) { releaseGrab(false); return; }
  G.grabT += dt; G.struggle = Math.max(0, G.struggle - dt * 0.18);
  // it holds on, face to face
  const a = Math.atan2(u.s.pos.x - P.s.pos.x, u.s.pos.z - P.s.pos.z);
  u.s.pos.x = damp(u.s.pos.x, P.s.pos.x + Math.sin(a) * 0.62, 5, dt); u.s.pos.z = damp(u.s.pos.z, P.s.pos.z + Math.cos(a) * 0.62, 5, dt);
  u.s.yaw = dampAngle(u.s.yaw, a + Math.PI, 10, dt);
  G.camShakeGrab = 0.1;
  if (G.grabT >= G.biteAt) {
    // the bite
    SND.zombie('bite', u.s.pos, zp(u));
    damage(P, rnd(18, 26) * DIFF.dmg * (u.big ? 1.5 * u.bigK : 1), u, { bite: true });
    G.infection = Math.min(100, G.infection + rnd(28, 38)); G.bleed = Math.max(G.bleed, 2); G.stats.bites++; STATS.event('bitten');
    fx.blood(P.head || P.s.pos, V(0, 0.3, 0), 1.5);
    toast('BITTEN — you\'re infected. Find antibiotics.', 'bad');
    if (G.stats.bites === 1) later(() => think('It bit me. I can feel it burning in my arm...', 4), 1.2);
    releaseGrab(false);
  }
}

// ---------------------------------------------------------------- aiming
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), tmpO = V(), tmpD = V();
function cursorAim() {
  if (G.scoped) ndc.set(0, 0); else ndc.set(G.mouse.x / innerWidth * 2 - 1, -(G.mouse.y / innerHeight) * 2 + 1);   // the cursor is the crosshair
  ray.setFromCamera(ndc, camera);
  const o = tmpO.copy(ray.ray.origin), d = tmpD.copy(ray.ray.direction);
  const skip = G.scoped || FP() ? 0.3 : Math.max(0.5, camera.position.distanceTo(P.head || P.s.pos) * 0.9);
  o.addScaledVector(d, skip);
  let t = 400;
  const wh = world.ray(o, d, t, true, 2.55); if (wh) t = wh.t;
  const uh = rayUnits(o, d, t, P); if (uh) t = uh.t;
  G.aimPoint.copy(o).addScaledVector(d, t);
  G.aimDist = t + skip;
  G.aimUnit = uh && uh.t <= t + 1e-3 ? uh.unit : null; G.aimPart = G.aimUnit ? uh.part : null;
}
function inputMove() {
  if (G.inAmb) return null;
  let x = 0, y = 0;
  if (keys.has('KeyW')) y += 1; if (keys.has('KeyS')) y -= 1; if (keys.has('KeyA')) x -= 1; if (keys.has('KeyD')) x += 1;
  if (!x && !y && G.stick) { x = G.stick.x; y = G.stick.y; }   // the touch stick (analog)
  if (!x && !y) return null;
  return G.camYaw + Math.atan2(-x, y);
}

// ---------------------------------------------------------------- the player
// ---------------------------------------------------------------- difficulty
// count: how many of them · speed: walkers · run: runners · dmg: how hard they hit · big: share of big ones ·
// bigMul: how much better the big ones are at everything · allRun · noSprint (you can't run)
const DIFFS = {
  easy: { name: 'EASY', count: 0.3, speed: 0.8, run: 0.8, runners: 0, dmg: 0.8, big: 0, bigMul: 1, desc: '70% fewer zombies. Slow and clumsy — none of them run. They hit 20% softer.' },
  medium: { name: 'MEDIUM', count: 1, speed: 1, run: 1, runners: 0.6, dmg: 1, big: 0.05, bigMul: 1, desc: 'The way it was meant to be.' },
  hard: { name: 'HARD', count: 1.2, speed: 1.1, run: 1.1, runners: 1, dmg: 1, big: 0.08, bigMul: 1, desc: '20% more zombies, 10% faster.' },
  extreme: { name: 'EXTREME', count: 2, speed: 1.5, run: 1.5, runners: 1.2, dmg: 1.3, big: 0.1, bigMul: 1, desc: 'Twice as many. 50% faster. They hit 30% harder.' },
  apocalypse: { name: 'APOCALYPSE', count: 3.5, speed: 2.2, run: 2.2, runners: 1.4, dmg: 2.2, big: 0.14, bigMul: 1.2, desc: '250% more, 120% faster, 120% more damage. The big ones are 1.2× worse.' },
  zombiex: { name: 'ZombieX', count: 6, speed: 2, run: 2, runners: 1, dmg: 4, big: 0.18, bigMul: 1.6, allRun: true, noSprint: true, desc: '500% more. They ALL run, at double speed. 300% more damage. Big ones 1.6× worse. You can\'t run.' },
};
const DIFF = { dmg: 1 };
const POOL_CAP = { easy: 34, medium: 34, hard: 40, extreme: 60, apocalypse: 84, zombiex: 110 };
function playerStep(dt) {
  const A = P.arms, S = P.s;
  if (!P.alive) { S.update(dt, {}); world.collide(S.pos, 0.3); A.update(dt, { trigger: false }); updateDropped(dt); return; }
  if (DROPPED.length) clearDropped();   // back up (a new run, or a friend got you up): it's in your hands again
  if (DRIVE.active()) {   // at the wheel / on the bike: WASD drives, Space brakes, E gets out
    S.update(dt, { move: null, speed: 0, aimYaw: S.yaw, aimPitch: 0, combat: 0 });
    DRIVE.update(dt, { up: keys.has('KeyW'), down: keys.has('KeyS'), left: keys.has('KeyA'), right: keys.has('KeyD'), brake: keys.has('Space'), jump: G.jumpReq, sprint: keys.has('ShiftLeft') || keys.has('ShiftRight'), exit: G.useReq });
    G.useReq = false; G.jumpReq = false; G.clickReq = false; A.update(dt, { trigger: false }); for (const id in A.guns) A.guns[id].visible = false; MEL.hideAll(); refreshHitShapes(P); return;
  }
  cursorAim();
  const grabbed = !!G.grabbedBy, swapping = !!(HANDS.cur && HANDS.cur.weapon), busy = !!G.search || PACK.swing > 0.15 || swapping;
  // a click or a jump pressed mid weapon swap isn't lost: it happens as soon as the new one's in your hand
  if (swapping) { if (G.clickReq) G.bufClick = G.t; if (G.jumpReq) G.bufJump = G.t; }
  else { if (G.bufClick && G.t - G.bufClick < 0.45) G.clickReq = true; if (G.bufJump && G.t - G.bufJump < 0.45) G.jumpReq = true; G.bufClick = G.bufJump = 0; }
  let move = G.state === 'play' && !grabbed ? inputMove() : null;
  if (G.search && move != null) { cancelSearch(); }
  // walking off while your hand's still in the cupboard, or while you're getting the pack off: you stop doing it
  if (G.pickAct && move != null) { HANDS.flush(); P.s.stopAct(0.25); G.pickAct = false; }
  if (G.packAnim && G.packAnim.dir > 0 && move != null) closeBag();
  if (grabbed && (HANDS.busy() || G.packAnim)) { HANDS.flush(); G.pickAct = false; if (G.packAnim) closeBag(); }
  if (G.clickReq && HANDS.busy() && !swapping && !G.pickAct) HANDS.flush();   // you drop what you're doing to fight
  if (G.search) move = null;
  const gun = !!A.cur;
  const aim = gun && G.mouse.right && rdrag.d < 12 && G.state === 'play' && !grabbed;   // hold right still to aim; drag with it to look around
  const trigger = gun && G.mouse.left && G.state === 'play' && !grabbed && !busy;
  if (trigger || (G.clickReq && !gun)) G.lastShot = G.t;
  const wantSprint = (keys.has('ShiftLeft') || keys.has('ShiftRight')) && move != null && !aim && !trigger && (!FP() || Math.abs(wrapPi(move - G.camYaw)) < 1.2);
  const sprint = wantSprint && G.stam > 1 && !G.winded && !DIFF.noSprint;
  if (sprint && G.crouch) G.crouch = false;
  const combat = FP() || aim || trigger || G.t - G.lastShot < (gun ? 1.6 : 0.5) || !!MEL.swing || (A.reloadT >= 0 && G.t - G.lastShot < 4) ? 1 : 0;
  // how fast you can go: hurt, starving, exhausted all slow you down
  const weak = clamp(1 - Math.max(0, 40 - P.hp) / 80 - (G.food < 10 ? 0.12 : 0) - (G.water < 10 ? 0.12 : 0) - (G.winded ? 0.15 : 0), 0.55, 1);
  let speed = (G.crouch ? S.vc * 1.05 : aim ? S.vw * 1.05 : sprint ? S.vr * 1.22 : S.vr * 0.92) * weak;
  if (G.stick && !sprint && G.stick.m < 0.6) speed = Math.min(speed, S.vw * 1.05 * weak * (0.4 + 0.6 * smooth(0.12, 0.6, G.stick.m)));   // a light push on the touch stick walks — the lighter, the slower (a creep at the edge of the dead zone)
  const eye = P.head || V().set(S.pos.x, 1.6, S.pos.z);
  let dx = G.aimPoint.x - eye.x, dy = G.aimPoint.y - eye.y, dz = G.aimPoint.z - eye.z, hd = Math.hypot(dx, dz);
  if (hd < 1.2) { dx = Math.sin(G.camYaw); dz = Math.cos(G.camYaw); dy = Math.sin(G.camPitch); hd = 1; }
  const aimYaw = Math.atan2(dx, dz);
  // vaulting a fence / hedge
  if (G.jumpReq && !G.vault && !grabbed && !busy) {
    const facing = move != null ? move : S.yaw;
    // a ledge in front at chest height (crates, a landing, a porch roof): climb up onto it
    const L = !S.climbing && world.ledgeAhead ? world.ledgeAhead(S.pos.x, S.pos.z, S.gyT ?? S.gy ?? 0, facing) : null;
    if (L && G.stam > 10) { STATS.event('climb'); S.mantle(L); P.s.playUp('Push', { rate: 0.9, fade: 0.1, fadeAt: 0.8 }); reachHand(out => { out.set(L.x, L.y + 0.05, L.z); return true; }, { side: freeHand(), inT: 0.15, hold: 0.45, out: 0.3, curl: 1 }); G.stam -= 10; noise(S.pos, 5); SND.land(2, true); G.jumpReq = false; }
    const va = !L && !S.climbing ? world.vaultAhead(S.pos.x, S.pos.z, facing) : null;
    if (va && G.stam > 8) {
      // a real hop over it: the body's own jump (take-off speed from how high the thing is), a hand planted on top
      const J = S.jump, top = va.box.y1 ?? 0.9, hT = clamp(top - (S.gy || 0) + 0.2, 0.45, 0.95);
      J.st = 'air'; J.t = 0; J.y = Math.max(0, J.y || 0); J.vy0 = J.vy = Math.sqrt(2 * 9.81 * hT); J.runAt = 0.6; J.fall = false; J.clipL = 0;
      const dur = 2 * J.vy0 / 9.81 * 0.95, hx = lerp(S.pos.x, va.x, 0.42), hz = lerp(S.pos.z, va.z, 0.42);
      G.vault = { x0: S.pos.x, z0: S.pos.z, x1: va.x, z1: va.z, t: 0, dur };
      reachHand(out => { out.set(hx, top + 0.03, hz); return true; }, { side: freeHand(), inT: 0.12, hold: dur * 0.3, out: 0.25, curl: 1 });
      G.stam -= 8; noise(S.pos, 6); SND.land(1.5, true);
    }
  }
  const cmd = { move, speed: move != null ? speed : 0, aimYaw, aimPitch: Math.atan2(dy, hd), combat: combat || A.throwT >= 0 ? 1 : 0, crouch: (G.crouch || (world.headroom && world.headroom(S.pos.x, S.pos.z, S.gy || 0) < 1.75)) && !G.vault, jump: G.jumpReq && !G.vault && !grabbed && !busy && G.stam > 5, tired: G.winded ? 0.8 : 0 };
  if (G.vault) { cmd.move = null; cmd.speed = 0; cmd.face = Math.atan2(G.vault.x1 - G.vault.x0, G.vault.z1 - G.vault.z0); }
  if (cmd.jump && !G.vault) G.stam -= 5;
  G.jumpReq = false;
  if (grabbed) { cmd.face = Math.atan2(G.grabbedBy.s.pos.x - S.pos.x, G.grabbedBy.s.pos.z - S.pos.z); cmd.aimYaw = cmd.face; }
  if (G.doorUse) { const U2 = G.doorUse; U2.t += dt; if (U2.snap) { const k = Math.min(1, U2.t / 0.28), e = k * k * (3 - 2 * k); S.pos.x = lerp(U2.x0, U2.x1, e); S.pos.z = lerp(U2.z0, U2.z1, e); } cmd.move = null; cmd.speed = 0; cmd.face = U2.face; cmd.aimYaw = U2.face; cmd.combat = 0; if (U2.t > 0.95 || move != null && U2.t > 0.5) G.doorUse = null; }
  const ox = S.pos.x, oz = S.pos.z;
  S.update(dt, cmd);
  if (HELI.blocks(S.pos.x, S.pos.z, 0.33)) { if (!HELI.blocks(ox, oz, 0.33)) { S.pos.x = ox; S.pos.z = oz; } else HELI.pushOut(S.pos, 0.33); }   // the parked helicopter is solid (already inside it: step out to the nearest edge)
  if (G.vault) {
    const Vt = G.vault; Vt.t += dt; const k = clamp(Vt.t / Vt.dur, 0, 1);   // (the height is the body's own jump arc)
    S.pos.x = lerp(Vt.x0, Vt.x1, k); S.pos.z = lerp(Vt.z0, Vt.z1, k); S.vel.set(0, 0, 0);
    G.vaulting = true;
    if (Vt.t >= Vt.dur) { G.vault = null; G.vaulting = false; world.collide(S.pos, 0.33); }
    else world.collide(S.pos, 0.33, { ignoreVault: true });
  } else world.collide(S.pos, 0.33);
  // stamina: running, swinging and jumping wear you out
  if (sprint && S.speed > S.vw * 1.2) G.stam -= dt * 11; else G.stam += dt * (G.crouch || S.speed < 0.3 ? 16 : 10) * (G.food > 20 && G.water > 20 ? 1 : 0.5);
  G.stam = clamp(G.stam, 0, 100);
  if (G.stam <= 0.5) G.winded = true; if (G.winded && G.stam > 30) G.winded = false;
  // ---- melee ----
  if (!gun) {
    if (G.clickReq && !grabbed && !busy && A.throwT < 0) {
      // a body on the ground in front of you: finish it
      const downed = Z.list.find(u => u.alive && u.z.down > 0 && u.s.pos.distanceTo(S.pos) < 1.6 && Math.abs(wrapPi(Math.atan2(u.s.pos.x - S.pos.x, u.s.pos.z - S.pos.z) - aimYaw)) < 0.9);
      const opt = downed ? { anim: MEL.W.id === 'fists' ? 'Punch_Cross' : 'Sword_Attack', rate: 1.1 } : {};
      if (MEL.attack(G.stam, opt)) { G.stam -= MEL.W.stam; MEL.swing.target = downed || null; tut('attack'); }
    }
    if (G.shoveReq && !grabbed && !busy && !MEL.swing && G.stam > 5 && A.throwT < 0) {
      if (MEL.attack(G.stam, { anim: 'Push', rate: 1.35, push: true })) { G.stam -= 12; }
    }
    const ev = MEL.update(dt);
    if (MEL.whoosh) SND.swing(MEL.whooshK, null);
    if (ev === 'hit') meleeLand(aimYaw);
    MEL.pose(A.throwT < 0);
    A.update(dt, { trigger: false }); A.pose(dt, {});
  } else {
    MEL.update(dt); MEL.hideAll();
    // ammo lives in your backpack
    const W = A.W, am = A.ammo[A.cur]; am.res = G.inv[W.ammo] || 0;
    const fired = A.update(dt, { trigger, aim, sprint, crouch: G.crouch });
    G.inv[W.ammo] = am.res;
    A.pose(dt, {});
    if (fired) {
      fire(P, G.aimPoint); MP.shot(P, A.cur);   // MP: the others hear it
      const k = A.W.recoil * (aim ? 0.5 : 0.8);
      G.recoilP = (G.recoilP || 0) + k * 0.35; G.recoilY = (G.recoilY || 0) + (Math.random() - 0.5) * k * 0.25;
      G.stats.shots++; STATS.event('shot'); tut('attack');
    }
    if (G.shoveReq && !aim && !grabbed) {}   // right click aims with a gun
  }
  G.clickReq = false; G.shoveReq = false;
  refreshHitShapes(P);
  // E: search / open / use
  if (G.useReq) { G.useReq = false; if (!grabbed) { const c = context(); if (c) c.go(); else if (LANTERN.carrying() && G.inv.lantern > 0) useItem('lantern'); } }
  if (G.search) updateSearch(dt);
  handReach(dt);
  if (G.talkLook) { const L = G.talkLook; L.t -= dt; if (L.t <= 0 || !L.n.s || L.n.s.pos.distanceTo(S.pos) > 6) { if (P.s.lookAt && P.s.lookAt === L.v) P.s.lookAt = null; G.talkLook = null; P.s.lookAt = null; } else { (P.s.lookAt ||= V()).set(L.n.s.pos.x, (L.n.s.pos.y || 0) + 1.62, L.n.s.pos.z); } }
  updateGrab(dt);
  // breathing and heartbeat
  SND.body({ speed: S.speed, exertion: Math.max(S.exertion, 1 - G.stam / 100), hurt: 1 - P.hp / P.maxHp });
}
// a swing lands: whoever's in front of you, within reach
function meleeLand(aimYaw) {
  const W = MEL.W, S = P.s, sw = MEL.swing || {};
  const push = !!sw.push, power = sw.power || 1;
  const reach = push ? 1.2 : W.reach + 0.05, arc = push ? 1.25 : W.heavy ? 0.95 : 0.8;
  const hits = [];
  // measured against the zombie's real body (its hit spheres), from your shoulder, in the direction you swing
  const sh = V(S.pos.x, 1.3 - S.crouchW * 0.35, S.pos.z), to = V();
  const downOf = u => u.npc ? (u.st === 'ko' ? 1 : 0) : u.z.down;
  for (const u of [...Z.list, ...(C.npcs || []), ...MP.proxies()]) {   // MP: friends too (friendly fire)
    if (!u.alive || u.gone || (u.npc && (u.hidden || u.boarded))) continue;
    if (Math.hypot(u.s.pos.x - S.pos.x, u.s.pos.z - S.pos.z) > reach + 1.5) continue;
    if (u.npc && (!u.sph || u.sphT !== C.t)) refreshHitShapes(u);   // the townspeople: their real body, too
    if (!u.sph) continue;
    let best = 1e9, bestS = null;
    for (const sp of u.sph) {
      to.subVectors(sp.c, sh); const dist = to.length() - sp.r;
      const a = Math.atan2(to.x, to.z);
      const ang = Math.abs(wrapPi(a - aimYaw)); if (ang > arc && !(dist < 0.3 && ang < Math.PI / 2)) continue;   // pressed against your side counts; behind you never
      if (dist < best) { best = dist; bestS = sp; }
    }
    if (!bestS || best > reach + (downOf(u) > 0 ? 0.7 : 0)) continue;   // one on the ground: you bend down to it
    if (!world.los(sh, bestS.c)) continue;   // not through walls, doors or glass
    hits.push([u, best, bestS]);
  }
  hits.sort((a, b) => a[1] - b[1]);
  const n = push ? 3 : W.heavy || W.id === 'bat' ? 2 : 1;
  if (!hits.length) {
    if (!push) {
      const d = V(Math.sin(aimYaw), -0.15, Math.cos(aimYaw)).normalize(), rh = world.ray(sh, d, W.reach + 0.2);
      const at = rh ? V().copy(sh).addScaledVector(d, rh.t) : V(sh.x + d.x * W.reach * 0.85, 0.55, sh.z + d.z * W.reach * 0.85);
      const bh = (!rh || (rh.box && rh.box.brk)) && world.hitBreakable ? world.hitBreakable(at, d, power * (W.heavy ? 1.15 : 1), W.id) : null;
      if (bh) { G.hitStop = bh.broke ? 0.07 : 0.045; C.shake = Math.max(C.shake, bh.broke ? 0.18 : 0.09); if (G.melee[W.id] != null) G.melee[W.id] -= bh.mat === 'leaves' ? 0.25 : 0.5; noise(S.pos, bh.broke ? 12 : 7); }
      else { const wh = meleeWorld(sh, aimYaw, W.reach, W); if (wh) { G.hitStop = 0.04; if (G.melee[W.id] != null) G.melee[W.id] -= 1; noise(S.pos, 6); } else noise(S.pos, 3); }
    }
    return;
  }
  if (push) {
    SND.shove();
    for (const [u] of hits.slice(0, n)) { const dir = V(u.s.pos.x - S.pos.x, 0, u.s.pos.z - S.pos.z).normalize(); if (downOf(u) > 0) continue; if (u.remote) { damage(u, 3, P, { dir, knock: 1, melee: true, push: true }); continue; } if (u.npc) { PEOPLE.shoveNPC(u, dir, P); continue; } if (Math.random() < 0.38) knockDown(u, dir); else zombieHurt(u, 0, P, { knock: 0.75, dir }); u.z.atkT = Math.max(u.z.atkT, 1.2); }
    C.shake = Math.max(C.shake, 0.12); noise(S.pos, 6);
    return;
  }
  hits.slice(0, n).forEach(([u, , spx], i) => {
    const down = downOf(u) > 0;
    // where the swing actually landed (the sphere it reached) — the crosshair only counts when that part is in reach
    let part = down ? 'head' : spx ? spx.part : 'body';
    if (!down && G.aimUnit === u && G.aimPart && u.sph) { const ai = G.aimPart === 'head' ? u.sph[0] : null; if (!ai || sh.distanceTo(ai.c) - ai.r < reach) part = G.aimPart; }
    if (!down && (W.heavy || sw.name === 'Sword_Attack') && u.sph && u.sph[0] && sh.distanceTo(u.sph[0].c) - u.sph[0].r < reach) part = 'head';   // overhead blows come down on the head
    if (part === 'arms' || !part) part = 'body';
    const k = (i === 0 ? 1 : 0.6) * power * rnd(0.85, 1.15) * (down ? 1.8 : 1);
    const dmg = W.dmg * (part === 'head' ? W.head : 1) * k;
    const dir = V(u.s.pos.x - S.pos.x, 0, u.s.pos.z - S.pos.z).normalize();
    refreshHitShapes(u);
    const pt = u.sph ? sphereSurface(part === 'head' ? u.sph[0] : (spx && spx.part === part ? spx : spx && spx.part !== 'head' ? spx : u.sph[2]), sh, V()) : u.s.pos;
    if (u.npc) { const hp0 = u.hp; PEOPLE.hurtNPC(u, dmg * (part === 'legs' ? 0.7 : 1), P, { dir, part, weapon: W.id, point: pt, melee: true }); C.events.hitmarker(u, !u.alive, part === 'head'); void hp0; }
    else damage(u, dmg * (part === 'legs' ? 0.7 : 1), P, { dir, part, weapon: W.id, point: pt, knock: W.knock * power * (part === 'head' ? 1.2 : 1), melee: true });
    SND.meleeHit(W.blade ? 'blade' : W.id === 'fists' ? 'fist' : W.id === 'crowbar' ? 'metal' : 'blunt', pt, part === 'head', W.heavy ? 1.2 : 1);
    if (down && u.alive === false) SND.stomp(pt);
    fx.blood(pt, V(dir.x, 0.25, dir.z), W.id === 'fists' ? 0.35 : W.blade ? 1.3 : 0.9);
    if (G.melee[W.id] != null) {
      G.melee[W.id] -= 1;
      if (G.melee[W.id] <= 0) { delete G.melee[W.id]; toast(`Your ${W.name.toLowerCase()} broke`, 'bad'); SND.breakWeapon(); later(() => equipMelee('fists'), 0.3); }
    }
  });
  G.hitStop = W.heavy ? 0.07 : 0.045;
  C.shake = Math.max(C.shake, W.heavy ? 0.22 : 0.12);
  noise(S.pos, 9);
}

// ---------------------------------------------------------------- searching, doors, the truck
function context() {
  if (!P.alive || G.search) return null;
  const S = P.s, px = S.pos.x, pz = S.pos.z;
  let best = null, bd = 1e9;
  { const sh = SHOP.context(px, pz, S.yaw); if (sh) return sh; }
  { const mc = MP.context(px, pz); if (mc) return mc; }   // MP: help a friend up, bandage them, give them supplies, ride in their car   // [zLux] the shop counter, the vending machine, money on the floor
  // containers in front of you
  { const Ln = LANTERN.nearest(px, pz, 1.3); if (Ln) return { label: 'Pick up the lantern', sub: `${Math.round(Ln.charge)}% battery`, go: () => { LANTERN.pickUp(Ln); G.inv.lantern = (G.inv.lantern || 0) + 1; SND.mech && SND.mech('switch'); } }; }
  { const dv = DRIVE.canUse(px, pz, P); if (dv) return dv.locked ? { label: dv.label, sub: dv.sub, go: () => { dv.go(); think('Locked. No keys in this one.', 2.5); } } : { ...dv, go: () => { const was = DRIVE.active(); dv.go(); const v = DRIVE.current(); if (!was && DRIVE.active() && v) STATS.event('drive', { kind: v.kind }); } }; }
  if (HELI.canBoard(S.pos) && !HELI.passengers().includes('player')) { const nd = (END() && END().needs || []).find(id => !((G.inv[id] || 0) > 0)); if (nd) { const nmI = (ITEMS[nd] && ITEMS[nd].name || nd).replace(/^(the|a|an) /i, ''); return { label: (END().prompt) || 'Climb into the ' + rideName(), sub: 'I need the ' + nmI, go: () => think(`I can't go yet. I need the ${nmI}.`, 3) }; } }
  if (HELI.canBoard(S.pos) && !HELI.passengers().includes('player')) return { label: MAPLE() ? 'Climb into the helicopter' : (END() && END().prompt) || 'Climb into the ' + rideName(), sub: `${Math.ceil(HELI.timeLeft())} s left`, go: boardHeli };
  { const A = ambulanceBack(); if (A) return { label: 'Get in the ambulance', sub: `${Math.ceil(A.openT)} s · ${Math.round(PH.chance * 100)}% chance they can help`, go: () => boardAmbulance(A) }; }
  { const n = PEOPLE.talkable(px, pz); if (n) { const d = Math.hypot(n.s.pos.x - px, n.s.pos.z - pz); const a = Math.abs(wrapPi(Math.atan2(n.s.pos.x - px, n.s.pos.z - pz) - S.yaw)); if (a < 1.4) { bd = d + a * 0.4 - 0.4; best = { n }; } } }
  for (const c of world.containers) {
    if (c.hidden) continue;
    if (Math.abs((S.gy || 0) - (c.floorY || 0)) > 1.4) continue;
    const d = Math.hypot(c.x - px, c.z - pz); if (d > (c.kind === 'escape' ? 3.2 : 1.75)) continue;
    if (c.unit && (c.unit.alive || !c.unit.active)) continue;
    if (c.kind !== 'escape' && !(c.kind === 'corpse' && d < 1.2) && !reachable(c.x, c.y, c.z, c.floorY || 0)) continue;   // never through a wall
    const a = Math.abs(wrapPi(Math.atan2(c.x - px, c.z - pz) - S.yaw));
    const score = d + a * 0.6 + (c.searched ? 0.8 : 0) - (c.kind === 'corpse' && !c.searched ? 0.6 : 0) - (c.unit && c.unit.dale ? 1 : 0) - (c.kind === 'radio' && G.stage === 0 ? 1 : 0);
    if (score < bd) { bd = score; best = { c }; }
  }
  // locked gates (the prison's keycard doors): before the ordinary doors
  { const gt = world.gateNear && world.gateNear(px, pz); if (gt && !gt.open) { const need = ITEMS[gt.needs] || { name: 'key' }, has = (G.inv[gt.needs] || 0) > 0; return { label: 'Open ' + (gt.name || 'the gate'), sub: has ? 'you have the ' + need.name : 'Needs the ' + need.name, go: () => { if (has) { world.openGate(gt); SND.mech && SND.mech('switch'); toast((gt.name || 'The gate') + ' — open', 'good', 'check'); } else think('Locked. It needs the ' + need.name + '.', 2.5); } }; } }
  // doors
  for (const D of world.doors) {
    if (D.broken) continue;
    const d = Math.hypot(D.x - px, D.z - pz); if (d > 1.6) continue;
    if (!world.los(V(px, 1.2, pz), V(D.x + (px - D.x) * 0.3, 1.2, D.z + (pz - D.z) * 0.3))) continue;
    const score = d + 0.3;
    if (score < bd) { bd = score; best = { D }; }
  }
  if (!best) return null;
  if (best.n) { const n = best.n; return { label: 'Talk to ' + (n.name ? nm(n.name) : PEOPLE.firstOf ? PEOPLE.firstOf(n) : n.role === 'surv' ? 'the survivor' : 'your neighbour'), sub: n.role === 'surv' ? 'another survivor' : G.phase === 'calm' ? 'a neighbour' : '', go: () => talkTo(n) }; }
  if (best.D) { const D = best.D; const open = D.want > 0.5; return { label: open ? 'Close the door' : 'Open the door', go: () => useDoor(D, !open) }; }
  const c = best.c;
  if (c.radio && !MAPLE() && G.phase === 'outbreak' && !G.radioDone) return { label: 'Listen to ' + (/^[A-Z][a-z]/.test(c.label) ? c.label.charAt(0).toLowerCase() + c.label.slice(1) : c.label), sub: 'it\'s crackling', go: () => { c.searched = true; playMapRadio(); } };
  if (c.kind === 'paper' && !c.searched) return { label: 'Pick up the note', sub: c.label, go: () => { c.searched = true; if (c.paper) c.paper.visible = false; SND.rummage('note', 0.5); if (c.note) showNote(c.note); } };
  if (c.kind === 'tv') return G.phase === 'calm' ? { label: 'Watch TV', sub: 'pass the time till lunch', go: () => watchTV() } : { label: 'The TV', sub: 'the emergency alert, on a loop', go: () => think('THIS IS NOT A TEST. REMAIN INDOORS. Same message, over and over.', 3.5) };
  if (c.kind === 'radio' && G.phase === 'calm') return { label: 'The kitchen radio', sub: 'playing oldies', go: () => think('Just oldies. Somebody\'s mowing their lawn two streets over.', 3) };
  if (c.kind === 'radio') return { label: G.stage === 0 ? 'Listen to the radio' : 'The radio', sub: G.stage === 0 ? 'it\'s crackling' : 'only static now', go: () => { if (G.stage === 0) playBroadcast(); else think('Nothing but static.', 2); } };
  if (c.kind === 'escape' && G.phase === 'calm') return { label: 'Dale\'s pickup', sub: 'old, but he loves it', go: () => think('Older than me, that truck. Dale washes it every Saturday.', 3) };
  if (c.kind === 'escape' && !G.notes.includes('dale1')) return { label: 'Read the note on the window', sub: 'Dale\'s pickup', go: () => showNote('dale1') };
  if (c.kind === 'escape') {
    const T = world.truck, fueled = !!(T && T.fueled);
    if (!fueled && G.inv.gascan > 0) return { label: 'Fill the tank', sub: 'Dale\'s pickup · the gas can', go: fillTank };
    return { label: 'Dale\'s pickup truck', sub: fueled ? (G.inv.keys > 0 ? 'gas in the tank, keys in your pocket' : 'gas in the tank — Dale had the keys') : !G.inv.keys ? 'the tank is empty, and it\'s locked' : 'the tank is empty — you need gas', go: () => think(fueled ? (G.inv.keys > 0 ? 'It\'s got gas, and I\'ve got the keys.' : 'Locked. Dale had the keys on him... he was wearing his orange work vest.') : 'Bone dry. There\'s a gas can in the Hendersons\' shed, Dale said.', 4) };
  }
  if (c.searched) return { label: c.label, sub: c.takenBy ? 'someone got here first' : 'already searched', go: () => think(c.takenBy ? `Cleaned out. ${nm(c.takenBy)} got here first.` : pick(['Nothing left here.', 'I already went through this.', 'Empty.']), 2.5) };
  return { label: 'Search ' + (/^[A-Z][a-z]/.test(c.label) ? c.label.charAt(0).toLowerCase() + c.label.slice(1) : c.label), go: () => startSearch(c) };
}
const rEye = V(), rTo = V();
function reachable(x, y, z, fy = 0) {
  const S = P.s; rEye.set(S.pos.x, (S.gy || 0) + 1.15, S.pos.z);
  const dx = S.pos.x - x, dz = S.pos.z - z, L = Math.hypot(dx, dz) || 1;
  rTo.set(x + dx / L * Math.min(0.3, L * 0.5), fy + Math.min(1.15, Math.max(0.4, y)), z + dz / L * Math.min(0.3, L * 0.5));
  return world.los(rEye, rTo);
}
function startSearch(c) {
  const info = searchInfo(c);
  G.search = { c, t: 0, dur: info.t, anim: info.anim, sndT: 0 };
  P.s.vel.set(0, 0, 0);
  P.s.yaw = Math.atan2(c.x - P.s.pos.x, c.z - P.s.pos.z);
  // step up to it, square on, so your hands meet the handle
  if (c.stand && Math.hypot(c.stand.x - P.s.pos.x, c.stand.z - P.s.pos.z) < 2.2 && world.walkable(c.stand.x, c.stand.z) && world.los(V(P.s.pos.x, 1.0, P.s.pos.z), V(c.stand.x, 1.0, c.stand.z))) G.search.snap = { x0: P.s.pos.x, z0: P.s.pos.z, x1: c.stand.x, z1: c.stand.z, y0: P.s.yaw, y1: c.stand.yaw };
  else if (c.stand) P.s.yaw = c.stand.yaw;
  // the door / drawer / lid opens as your hands get there, and stays open
  if (c.parts && c.parts.length && !c.openTarget) reachHand(partGrip(c.parts[0]), { inT: G.search.snap ? 0.4 : 0.3, hold: 0.75, out: 0.4, curl: 0.8 });
  if (c.parts && !c.openTarget) later(() => { if (G.search && G.search.c === c && world.open(c)) { const k = c.car ? 'car' : c.kind === 'fridge' ? 'fridge' : c.kind === 'bin' ? 'lid' : c.parts[0].kind === 'slide' ? 'slide' : 'door'; SND.opening(k, V(c.x, c.y, c.z)); noise(V(c.x, 0, c.z), 4); } }, G.search.snap ? 0.42 : 0.3);
  P.s.play(info.anim, { loop: true, fade: 0.25, rate: info.anim === 'Fixing_Kneeling' ? 1 : 0.9, from: info.anim === 'Chest_Open' ? 0.2 : 0 });
  MEL.swing = null; P.arms.reloadT = -1;
  SND.rummage(c.kind, info.t, null, { events: false });
  planTouches(G.search, c);
  if (c.car && c.car.alarm && !c.car.alarmDone && Math.random() < 0.7) { c.car.alarmDone = true; later(() => { const p = V(c.car.x, 1, c.car.z); SND.carAlarm(p, 14); alarmFlash(p, 14, c.car); for (let i = 0; i < 7; i++) later(() => noise(p, 60), i * 2); think('Car alarm! Move — now!', 3); }, 0.4); }
}
const alarmLight = new THREE.PointLight(0xffa030, 0, 11, 1.6); world.addLight(alarmLight);
let alarmA = null;
function alarmFlash(p, dur, car = null) { alarmA = { p: p.clone(), t: 0, dur, car }; if (car) { const L = (car.g.userData.L || 4.6) / 2; alarmLight.position.set(car.x + Math.sin(car.yaw) * L, 0.7, car.z + Math.cos(car.yaw) * L); } else alarmLight.position.set(p.x, 1.0, p.z); }
function updateAlarm(dt) { if (!alarmA) return; alarmA.t += dt; const on = alarmA.t < alarmA.dur && Math.floor(alarmA.t / 0.4) % 2 === 0; alarmLight.intensity = on ? 9 : 0; const lamps = alarmA.car && alarmA.car.g.userData.lamps || []; for (const m of lamps) m.emissiveIntensity = on ? 2.5 : 0; if (alarmA.t > alarmA.dur) { for (const m of lamps) m.emissiveIntensity = 0; alarmA = null; } }
function cancelSearch() { if (!G.search) return; G.search = null; P.s.stopAct(0.25); }
function updateSearch(dt) {
  const Sr = G.search; Sr.t += dt; Sr.sndT -= dt;
  if (Sr.snap) { const k = Math.min(1, Sr.t / 0.32), e = k * k * (3 - 2 * k); P.s.pos.x = lerp(Sr.snap.x0, Sr.snap.x1, e); P.s.pos.z = lerp(Sr.snap.z0, Sr.snap.z1, e); P.s.yaw = dampAngle(P.s.yaw, Sr.snap.y1, 14, dt); P.s.aimYaw = P.s.yaw; if (k >= 1) Sr.snap = null; }
  if (Sr.sndT <= 0) { Sr.sndT = 0.6; noise(P.s.pos, 4); }
  runTouches(Sr);
  if (Sr.t < Sr.dur) return;
  G.search = null;
  if (Sr.fuel) {   // the gas is in Dale's tank
    P.s.stopAct(0.3); G.inv.gascan = Math.max(0, (G.inv.gascan || 0) - 1); if (world.truck) world.truck.fueled = true;
    SND.sting('objective'); toast('Dale\'s pickup has gas in it now', 'good', 'gas');
    later(() => think(G.inv.keys > 0 ? 'Full enough. And I\'ve got the keys.' : 'Gas in. Now it just needs Dale\'s keys.', 3.5), 0.8);
    return;
  }
  const c = Sr.c; c.searched = true; G.stats.searched++;
  if (c.radio && !MAPLE() && G.phase === 'outbreak' && !G.radioDone) later(playMapRadio, 0.6);
  if (c.paper) c.paper.visible = false; STATS.event('search', { kind: c.kind }); tut('search');
  let loot = c.fixed ? [...c.fixed, ...rollLoot(c.kind).filter(x => x[0] !== c.fixed[0][0])] : rollLoot(c.kind);
  loot = SHOP.cashLoot(c, loot);   // [zLux] money in tills, drawers, wallets on bodies
  if (c.note) later(() => showNote(c.note), loot.length ? 0.9 : 0.2);
  if (!loot.length) { P.s.stopAct(0.3); if (!c.note) toast(c.kind === 'corpse' ? 'Nothing on the body' : pick(['Nothing useful', 'Empty', 'Already picked clean']), 'grey'); return; }
  // it's yours now (the story moves on at once); your hand takes each thing out and puts it in the pack
  const got = [];
  for (const [id, n] of loot) {
    const r = addItem(id, n, { defer: true }); const I = ITEMS[id];
    G.stats.items += n; STATS.event('item', { n }); got.push({ id, n, r });
    if (I.cat !== 'melee' || r !== 'equip') G.transit.set(id, (G.transit.get(id) || 0) + (I.cat === 'melee' || I.cat === 'gun' ? 1 : n));
    if (id === 'keys') { SND.sting('objective'); later(() => think(world.truck && world.truck.fueled ? 'Dale\'s keys. And his truck\'s got gas in it now.' : 'Dale\'s keys. His pickup\'s still on Main St — it just needs gas.', 4), 1.2); }
    if (id === 'gascan') { SND.sting('objective'); later(() => think('Half a can of gas. Enough for Dale\'s pickup. ...What was that?', 3.5), 0.6); later(horde, 2.5); }
    if (I.cat === 'gun' && r === 'new') later(() => think(`A ${I.name.toLowerCase()}. Loud — every one of them will hear it.`, 3.5), 1.2);
    if (I.cat === 'melee' && r === 'equip') later(() => { think(`${I.name}. Better than my fists.`, 2.5); tip('weapon'); }, 1.0);
  }
  pickUp(c, got);
}
// ---------------------------------------------------------------- the map's story (Maple Hollow keeps its hard-wired one; the others come from js/maps/<id>.story.js)
function CHS() { return (!MAPLE() && STORY && STORY.chapters && STORY.chapters.length) ? STORY.chapters : CHAPTERS; }
function noteOf(id) { return (!MAPLE() && STORY && STORY.notes && STORY.notes[id]) || NOTES[id] || null; }
function goalOf(ch) { return !ch ? '' : typeof ch.goal === 'string' ? ch.goal : ch.goal ? (ch.goal[G.role] || Object.values(ch.goal)[0] || '') : ''; }
function END() { return (!MAPLE() && STORY && STORY.ending) || null; }
function rideName() { const E = END(); return !E ? 'helicopter' : E.kind === 'plane' ? 'plane' : E.kind === 'boat' || E.vehicle === 'boat' ? 'boat' : 'helicopter'; }
function lzName() { return MAPLE() ? 'Main & Maple' : (MAPINFO && MAPINFO.lzName) || (END() && END().name) || 'the landing zone'; }
const lzH = () => lzName().replace(/&/g, '&amp;');
function endHour() { const E = END(); return E ? (E.hour ?? 2) : 2; }
function obHour() { return MAPLE() ? 12 : (STORY && STORY.outbreakHour) ?? 12; }
function mapName() { return MAPLE() ? 'Maple Hollow' : (MAPINFO && MAPINFO.name) || (STORY && STORY.title) || MAPS[MAP_ID].name; }
const hhmm = h => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.floor((h % 1) * 60 + 1e-6)).padStart(2, '0')}`;
function spotOf(k) { if (!k) return null; if (typeof k === 'object') return k.x != null ? k : null; const S = (MAPINFO && MAPINFO.spots) || (world.jungle && world.jungle.SPOTS) || {}; const p = S[k]; return p && p.x != null ? p : null; }
function homeHouse() { return MAPLE() ? world.houses.find(h => h.x === -44 && h.z === 17) : (MAPINFO && MAPINFO.home && MAPINFO.home.x != null ? MAPINFO.home : null); }
function startSpot() { const st = (G.role && MAPINFO && MAPINFO.starts && MAPINFO.starts[G.role]) || (MAPINFO && MAPINFO.start) || { x: 0, z: 0, yaw: 0 }; return typeof st === 'string' ? spotOf(st) || { x: 0, z: 0, yaw: 0 } : st; }
// where the chapter's marker points (story.objectives: an array of spots, or chapter id -> spot key)
function objectiveSpot(i) { const o = STORY && STORY.objectives, ch = CHS()[i]; if (!o || !ch) return null; return spotOf(Array.isArray(o) ? o[i] : o[ch.id]); }
// each map note goes into the nearest container (or onto a desk/the floor as a sheet of paper of its own) — once, at load
const notePaper = new THREE.MeshStandardMaterial({ color: 0xe9e4d6, roughness: 0.95, side: THREE.DoubleSide });
const notePaperGeo = new THREE.PlaneGeometry(0.21, 0.29);
function placeMapNotes() {
  for (const n of (MAPINFO && MAPINFO.notes) || []) {
    const ny = n.y ?? 0.8; let best = null, bd = 1.5;
    for (const c of world.containers) { if (c.mapNote || c.kind === 'escape') continue; const cy = (c.floorY || 0) + (c.y || 0); const d = Math.hypot(c.x - n.x, c.z - n.z) + Math.abs(cy - ny) * 0.6; if (d < bd) { bd = d; best = c; } }
    if (!best) {   // nothing to put it in: a loose sheet of paper, lying where the map says
      const fy = ny > 2.4 ? Math.max(0, ny - 0.85) : 0;
      best = world.container('paper', n.x, n.z, ny - fy, (noteOf(n.id) || {}).title || 'A note', 0, null, fy ? { floorY: fy } : {});
      const m = new THREE.Mesh(notePaperGeo, notePaper); m.rotation.set(-Math.PI / 2, 0, Math.random() * 6.28); m.position.set(n.x, ny + 0.012, n.z); m.receiveShadow = true; scene.add(m); best.paper = m;
    }
    best.mapNote = n.id;
  }
}
function setupMapStory() {
  for (const c of world.containers) { delete c.note; if (c.mapNote) c.note = c.mapNote; if (c.paper) c.paper.visible = true; }
  G.radioDone = false;
  if (STORY && STORY.reset) try { STORY.reset(); } catch (e) { console.error(e); }
  if (world.lockGates) try { world.lockGates(); } catch (e) { console.error(e); }
}
// the map's broadcast (radio, walkie-talkie, prison PA): captions only — the words on screen, never a made-up voice
function startMapNews() {
  if (G.phase !== 'calm') return;
  const nw = (STORY && STORY.news) || {}, src = nw.title || (nw.kind === 'pa' ? 'PUBLIC ADDRESS' : 'RADIO');
  G.phase = 'news'; G.hour = Math.max(G.hour, obHour()); world.setTime(G.hour);
  G.news = { map: true, t: 0, ended: false };
  if (G.search) cancelSearch();
  SND.setPeace(0); if (nw.kind === 'pa') SND.eas(6); else { SND.phoneBuzz(); SND.radioStatic(3, null); }
  const lines = [...(nw.anchor || []).map(([t, l]) => [t, (/^[A-Z ]+:/.test(l) || /^\*/.test(l) ? '' : src + ': ') + l]), ...(nw.reporter || [])];
  for (const [t, line] of lines) later(() => { if (G.phase === 'news') think(line, 4.8, true); }, t);
  later(() => endMapNews(false), (lines.length ? Math.max(...lines.map(l => l[0])) : 0) + 5);
}
function endMapNews(skipped, quiet = false) {
  const N = G.news; if (!N || N.ended) return;
  N.ended = true;
  G.phase = 'outbreak'; G.obT = G.t; G.survT = 0; if (!(G.stage > 0)) G.stage = 0;
  if (skipped) capClear();
  SND.musicPlaying(true); if (quiet) return; SND.sting('spotted');
  later(() => { if (Math.floor(G.stage) === 0 && P && P.alive) bigText('CHAPTER 1', `${CHS()[0].title} · ${DIFF.name}`, 4); }, 0.6); later(checkpoint, 5);
  later(() => think((STORY && STORY.outbreakLine) || 'It\'s happening. Here. I have to move — now.', 4.5), 3.2);
}
// the map's radio (a container with radio: true): its story.radio lines, as captions over real radio static
function playMapRadio() {
  if (G.radioDone) return think('Only static now.', 2);
  G.radioDone = true;
  const RL = (STORY && STORY.radio) || [];
  SND.radioStatic(Math.max(6, (RL.length ? RL[RL.length - 1][0] : 0) + 2), null); noise(P.s.pos, 8);
  for (const [t, line] of RL) later(() => think(line, 4.2, true), t);
}
// does this chapter's "done" hold yet? (time:<h> · item(s):<id>[+<id>] · note:<id> · radio · reach:<spot> · board)
function doneKey(k) {
  const i = k.indexOf(':'), a = i < 0 ? k : k.slice(0, i), b = i < 0 ? '' : k.slice(i + 1);
  if (a === 'time') { const h = +b, tgt = h >= obHour() - 0.01 ? h : 24 + h; return (G.day - 1) * 24 + G.hour >= tgt; }
  if (a === 'item' || a === 'items') return b.split('+').every(id => id === 'weapon' ? supplies().weapon : id === 'food' ? supplies().food > 0 : (G.inv[id] || 0) > 0);
  if (a === 'note') return G.notes.includes(b);
  if (a === 'radio') return !!G.radioDone;
  if (a === 'reach') { const p = spotOf(b); return !!p && Math.hypot(P.s.pos.x - p.x, P.s.pos.z - p.z) < (p.r || 7); }
  return false;
}
function mapStoryTick() {
  if (G.phase !== 'outbreak' || G.state !== 'play' && G.state !== 'bag') return;
  const chs = CHS(), i = Math.floor(G.stage), last = chs.length - 1, ch = chs[i];
  if (!ch || G.stage !== i) return;
  if (i < last && !G.heliSeen && HELI.state() !== 'waiting' && HELI.state() !== 'over') { G.heliSeen = true; setStage(last, 0.2); return; }
  if (i < last && ch.done && ch.done !== 'board' && doneKey(ch.done)) setStage(i + 1, 0.8);
}
function mapBeats() {
  if (MAPLE() || !STORY || !STORY.beats || !P) return;
  G.player = P; G.P = P;
  try { STORY.beats(G, { think, toast, bigText, setStage, later, world, SND, noise, spawnZombie: (x, z, o = {}) => { const u = Z.pool.find(q => !q.active && !q.dale); if (u) wake(u, x, z, o); return u || null; }, playerPos: () => P && P.s ? P.s.pos : null, player: P }); } catch (e) { if (!mapBeats.err) { mapBeats.err = true; console.error('story.beats', e); } }
}
// ---------------------------------------------------------------- the story
function setStage(n, delay = 0.5) {
  if (n <= G.stage) return;
  G.stage = n;
  later(checkpoint, 4.5);
  later(() => { const ch = CHS()[n]; if (ch) bigText(`CHAPTER ${n + 1}`, ch.title, 3.5); SND.sting('objective'); }, delay);
  if (!MAPLE()) { const ch = CHS()[n]; if (ch && ch.say) later(() => think(ch.say, 4.5), delay + 3.8); return; }
  if (n === 1) later(() => think('Two in the morning. That\'s a long time out here. I need a weapon, food and water — before it gets dark.', 5), delay + 3.8);
  if (n === 2) later(() => think(G.hour >= 19 || G.hour < 6 ? 'It\'s dark. Find somewhere safe... and be at Main and Maple at two.' : 'That\'ll do. Now I just have to last until two — and be at Main and Maple.', 4.5), delay + 3.8);
  if (n === 3) later(() => think('There it is. Main and Maple. Run!', 3), delay + 3.6);
}
// chapter 2 is done when you've got what you need for the night (or the night comes anyway)
function supplies() {
  let food = 0, drink = 0;
  for (const id in G.inv) { const I = ITEMS[id]; if (!I || !(G.inv[id] > 0) || id === 'pills' || id === 'antibiotics') continue; if (I.cat === 'food') food += G.inv[id]; else if (I.cat === 'drink') drink += G.inv[id]; }
  const weapon = MELEE_ORDER.some(id => G.melee[id] != null) || SLOTS.some(id => P.arms.guns[id]);
  return { weapon, food, drink, ok: weapon && food >= 2 && drink >= 2 };
}
function storyTick() {
  if (!MAPLE()) return mapStoryTick();
  if (G.phase !== 'outbreak' || G.state !== 'play' && G.state !== 'bag') return;
  const st = Math.floor(G.stage);
  if (st === 1 && G.stage === 1) { const sp = supplies(); if (sp.ok) setStage(2, 1.2); else if (G.day > 1 || G.hour >= 20) { setStage(2, 0.3); later(() => think('Dark already, and I\'m not ready. It\'ll have to do.', 4), 4.5); } }
  if (st === 2 && !G.heliSeen && HELI.state() !== 'waiting' && HELI.state() !== 'over') { G.heliSeen = true; setStage(CHS().length - 1, 0.2); }
}
// ---------------------------------------------------------------- the helicopter: what happens around it
function heliInbound() {
  G.heliSeen = true; { const last = CHS().length - 1; if (Math.floor(G.stage) < last && G.phase === 'outbreak') setStage(last, 0.2); }
  const rd = rideName(), cue = MAPLE() ? 'Rotors. A helicopter, coming in low over the town. The crossroads — GO!' : rd === 'plane' ? `An engine, low over the rooftops. The plane — ${lzName()}. GO!` : rd === 'boat' ? `A boat engine, out on the water. ${lzName()[0].toUpperCase() + lzName().slice(1)} — GO!` : `Rotors. A helicopter, coming in low. ${lzName()[0].toUpperCase() + lzName().slice(1)} — GO!`;
  if (G.state === 'play' || G.state === 'bag' || G.state === 'phone') { think(P.alive ? cue : '', 4.5); SND.sting('spotted'); }
}
function heliArrive() {
  if (G.state === 'title' || !P.alive) return;
  toast(MAPLE() ? 'The helicopter is down at Main & Maple. ONE MINUTE.' : `The ${rideName()} is waiting at ${lzName()}. ${Math.max(1, Math.round(HELI.timeLeft()))} SECONDS.`, 'good', 'clock');
  // the noise brings them: from every street, and some of them run
  const n = Math.round(4 * Math.max(1, DIFF.count * 0.8));
  for (let i = 0; i < n; i++) {
    const u = Z.pool.find(z => !z.active && !z.dale); if (!u) break;
    const a = Math.random() * Math.PI * 2, r = rnd(45, 65), x = LZ.x + Math.cos(a) * r, z = LZ.z + Math.sin(a) * r;
    if (!world.walkable(x, z) || Math.hypot(x - P.s.pos.x, z - P.s.pos.z) < 25) continue;
    wake(u, x, z, { state: 'investigate', runner: Math.random() < 0.22 * (DIFF.runners ?? 1) + (DIFF.allRun ? 1 : 0), big: Math.random() < DIFF.big });
    u.z.goal = V(LZ.x + rnd(-4, 4), 0, LZ.z + rnd(-4, 4)); u.z.t = 60;
  }
  G.heliCallT = 0;
}
function heliCount(s) {
  if (s === 30 || s === 10) { SND.sting('objective'); if (!HELI.passengers().includes('player') && P.alive) think(s === 30 ? 'Thirty seconds!' : 'Ten seconds — GO!', 2); }
}
// every so often while it's down: the ones who still trust you run for it
function heliPeople(dt) {
  if (HELI.state() !== 'landed') return;
  G.heliCallT = (G.heliCallT || 0) - dt; if (G.heliCallT > 0) return; G.heliCallT = 1.5;
  PEOPLE.heliCall(LZ, HELI.doorPos(), 75, u => { const seat = HELI.board(u); if (seat >= 0) { G.saved = (G.saved || 0) + 1; STATS.event('saved', { n: 1 }); if (G.boarded || P.alive) toast(`${u.name ? nm(u.name) : 'A survivor'} made it into the ${rideName()}`, 'good', 'heart'); } return seat; });
  // you're aboard: it goes as soon as the ones on their way are in (they get a few seconds)
  if (G.boarded && HELI.timeLeft() > 0) { G.boardWait = (G.boardWait ?? 9) - 1.5; if (G.boardWait <= 0 || !PEOPLE.heliRunners()) HELI.leaveNow(); }
}
function boardHeli() {
  const seat = HELI.board('player'); if (seat < 0) return;
  G.heliSeat = seat; G.climbT = 0;
  G.boarded = true; G.boardWait = 9; G.state = 'escaping'; G.escT = 0;
  if (G.search) cancelSearch(); if (G.grabbedBy) releaseGrab(false); HANDS.flush(); G.pickAct = false;
  P.s.vel.set(0, 0, 0); P.s.playUp('Interact', { rate: 1.2, fade: 0.1, fadeAt: 0.7 });
  SND.door('close', HELI.doorPos()); toast('You\'re in!', 'good', 'check');
  later(() => { if (!G.boarded) return; P.s.setVisible(false); MEL.hideAll(); P.arms.hideAll(); PACK.P && (PACK.P.visible = false); }, 0.75);
  think(PEOPLE.heliRunners() ? 'I\'m in! Come on — come ON!' : 'I\'m in. I\'m in...', 3);
  STATS.event('boarded');
}
function heliDepart(ps) {
  PEOPLE.heliGone();
  if (!ps.includes('player')) return;
  G.heliCine = true; G.heliEscape = true; G.saved = ps.filter(w => w !== 'player').length;
  SND.musicPlaying(false);
  later(() => think(G.saved ? `${G.saved} more of us made it. We're going.` : 'We\'re going. We\'re actually going.', 4), 1.5);
}
function heliMissed(final) {
  PEOPLE.heliGone();
  if (G.state === 'title' || G.state === 'result' || !P.alive) return;
  if (final) { if (G.boarded) return; G.missedFinal = true; think(MAPLE() || !END() || !END().loseLine ? 'No... NO! Come back!' : END().loseLine, 3); later(() => { if (G.state === 'play' || G.state === 'bag' || G.state === 'phone' || G.state === 'note') { if (G.state !== 'play') { closeBag(); closePhone(); closeNote(); } endRun('left'); } }, 6); return; }
  G.missed = (G.missed || 0) + 1;
  if (MAPLE()) { think('It left without me. ...The radio said they\'d come back. Tomorrow night, two o\'clock. The last one.', 6); toast('The helicopter left. The LAST one lands at 02:00 tomorrow night.', 'bad', 'clock'); }
  else { const nf = HELI.nextFlight(); think(`It left without me. ...One more chance${nf ? ' — ' + hhmm(nf.hour) + ' tomorrow' : ''}. The last one.`, 6); toast(`The ${rideName()} left. The LAST one comes at ${nf ? hhmm(nf.hour) : hhmm(endHour())} tomorrow.`, 'bad', 'clock'); }
  later(checkpoint, 8);
}
// Dale's pickup: put the gas in it (driving it is drive.js's business)
function fillTank() {
  if (!(G.inv.gascan > 0) || !world.truck) return;
  const T = world.truck;
  P.s.vel.set(0, 0, 0); P.s.yaw = Math.atan2(T.x - P.s.pos.x, T.z - P.s.pos.z);
  P.s.play('Fixing_Kneeling', { loop: true, fade: 0.3 }); G.search = { c: { kind: 'escape', x: T.x, y: 0.9, z: T.z }, t: 0, dur: 3.2, anim: 'Fixing_Kneeling', sndT: 0, fuel: true, touches: [], items: [], ti: 0 };
  SND.rummage('car', 3, null); noise(P.s.pos, 8);
}
function playBroadcast() {
  G.stage = 0.5;
  SND.radioStatic(24, null);
  noise(P.s.pos, 8);
  for (const [t, line] of RADIO) later(() => think(line, 4.2, true), t);
  later(() => { think('Two in the morning. Main and Maple. One minute... I have to be there.', 5); G.stage = 0; setStage(1, 0.2); }, 24);
}
let noteDone = null;
function showNote(id, done = null) {
  const N = noteOf(id); if (!N) return;
  if (!G.notes.includes(id)) G.notes.push(id);
  $('noteTitle').textContent = N.title;
  $('noteText').textContent = N.text.replace(/\{HEND\}/g, G.hend ? G.hend.name : 'on Maple Ave').replace(/^Sam —/, (G.pname || 'Sam') + ' —');
  unlockMouse(); noteDone = done; G.prevNoteState = G.state; G.state = 'note'; keys.clear(); G.mouse.left = G.mouse.right = false;
  showScreen('note'); SND.rummage('note', 0.6);
}
function closeNote() { if (G.state !== 'note') return; G.state = 'play'; showScreen(null); const d = noteDone; noteDone = null; if (d) d(); if (G.state === 'play') lockMouse(); }
$('note').addEventListener('pointerdown', closeNote);
$('tv').addEventListener('pointerdown', () => { if (G.state === 'news' && G.news && G.news.t > 1) endNews(true); });
// they heard you take it: a crowd closes in from all sides
function horde() {
  think('They\'re coming. A lot of them.', 3); SND.sting('spotted');
  for (let i = 0; i < Math.round(7 * Math.max(1, DIFF.count * 0.7)); i++) {
    const u = Z.pool.find(z => !z.active && !z.dale); if (!u) break;
    const a = Math.random() * Math.PI * 2, r = rnd(22, 34);
    let x = P.s.pos.x + Math.cos(a) * r, z = P.s.pos.z + Math.sin(a) * r;
    if (!world.walkable(x, z)) continue;
    wake(u, x, z, { state: 'investigate', runner: i < Math.round(2 * (DIFF.runners ?? 1)), big: Math.random() < DIFF.big * 1.5 });
    u.z.goal = P.s.pos.clone(); u.z.t = 40;
  }
}
function mapIntroLines() {
  const role = STORY && STORY.role ? STORY.role(G.who) : null;
  if (role && STORY.introCard && STORY.introCard[role]) return STORY.introCard[role];
  const il = Array.isArray(STORY && STORY.intro) ? STORY.intro : (STORY && STORY.intro && STORY.intro.lines) || [];
  return [`<p class="date">${String((STORY && STORY.subtitle) || '').toUpperCase()} · ${mapName().toUpperCase()} · ${hhmm((STORY && STORY.startHour) ?? 8)}</p>`, ...il.map(l => `<p>${String(l).replace(/</g, '&lt;')}</p>`), ...(role && STORY.roles && STORY.roles[role] && STORY.roles[role].startText ? [`<p>${STORY.roles[role].startText}</p>`] : [])];
}
function introThen(fn) {
  const lines = !MAPLE() ? mapIntroLines() : ['<p class="date">SATURDAY, NOVEMBER 8 · MAPLE HOLLOW · 10:30 AM</p>', '<p>Blue sky. Somebody\'s mowing a lawn two streets over. Down at the Quick Stop, Raj has fired up the grill.</p>', `<p>You're ${G.who ? G.who.name : 'Sam Carter'}, ${G.who ? G.who.job : 'high-school history teacher'}, at ${G.who ? addressOf(G.who.house) : '44 Main St'}. Em took the kids to her sister\'s in Ridgefield for the weekend. The house is quiet.</p>`, '<p>It\'s a normal Saturday.</p>', '<p>For about another hour and a half.</p>'];
  $('introLines').innerHTML = lines.join('');
  G.state = 'intro'; showScreen('intro');
  const ps = [...$('introLines').children];
  const timers2 = ps.map((p, i) => setTimeout(() => p.classList.add('on'), 400 + i * 2300));
  let done = false;
  const go = () => { if (done) return; done = true; timers2.forEach(clearTimeout); $('intro').removeEventListener('pointerdown', go); removeEventListener('keydown', key); showScreen(null); fn(); lockMouse(); };
  const key = e => { if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') go(); };
  $('intro').addEventListener('pointerdown', go); addEventListener('keydown', key);
  setTimeout(go, 400 + ps.length * 2300 + 3500);
}

// ---------------------------------------------------------------- searching, in sync: every sound is something your hand moves
const PREF = { beans: ['can'], soup: ['can'], water: ['bottle', 'jar'], soda: ['bottle', 'can'], juice: ['bottle', 'carton'], cereal: ['box'], chips: ['box'], bar: ['box'], pills: ['jar', 'bottle'], antibiotics: ['jar', 'bottle'], bandage: ['box', 'cloth'], medkit: ['box'], battery: ['misc', 'box'] };
const tp = V();
function planTouches(Sr, c) {
  const items = (c.items || []).filter(it => !it.taken);
  const start = c.parts && c.parts.length ? 0.85 : 0.45, end = Sr.dur - 0.35;
  const n = Math.max(2, Math.round((end - start) * 1.6));
  Sr.touches = []; for (let i = 0; i < n; i++) Sr.touches.push(start + (end - start) * (i + Math.random() * 0.6) / n);
  Sr.items = items; Sr.ti = 0; Sr.handP = null;
}
function runTouches(Sr) {
  const c = Sr.c;
  while (Sr.ti < Sr.touches.length && Sr.t >= Sr.touches[Sr.ti]) {
    Sr.ti++;
    const avail = Sr.items.filter(it => !it.taken);
    if (avail.length) {
      const it = pick(avail), how = Math.random() < 0.2 && it.kind !== 'cloth' && it.kind !== 'misc' ? 'tip' : 'shift';
      world.moveItem(it, how); world.itemPos(it, tp); SND.touch(it.kind, tp.clone(), how);
      if (how === 'tip') noise(tp, 4);
      // your hand goes to it
      if (!Sr.handP) { Sr.handP = tp.clone(); reachHand(out => { if (Sr.handGoal) Sr.handP.lerp(Sr.handGoal, 0.18); out.copy(Sr.handP); return !!G.search; }, { inT: 0.25, hold: Math.max(0.3, Sr.dur - Sr.t - 0.4), out: 0.3, curl: 0.7 }); }
      else (Sr.handGoal ||= V()).copy(tp);   // the hand glides to the next item
    } else if (c.kind === 'corpse' && c.unit) {   // going through their pockets: the body shifts as you do
      const S2 = c.unit.s; S2.pos.x += rnd(-0.03, 0.03); S2.pos.z += rnd(-0.03, 0.03); S2.pivot.rotation.y += rnd(-0.06, 0.06); S2.pivot.updateMatrixWorld(true);
      SND.touch('body', V(c.x, 0.3, c.z));
      if (!Sr.handP) { Sr.handP = V(c.x, 0.35, c.z); reachHand(out => { out.copy(Sr.handP); return !!G.search; }, { inT: 0.25, hold: Math.max(0.3, Sr.dur - Sr.t - 0.4), out: 0.3, curl: 0.6 }); }
    } else SND.touch('hand', V(c.x, c.y, c.z));
  }
}
// ---------------------------------------------------------------- hands: you take hold of what you open
const hTmp = V(), hTmp2 = V(), hUp = V(0, 1, 0);
const freeHand = () => (P.arms.cur || (MEL.cur && MEL.cur !== 'fists')) ? -1 : 1;
function reachHand(get, { side = freeHand(), inT = 0.28, hold = 0.5, out = 0.3, curl = 0.85 } = {}) { G.hand = { get, side, inT, hold, out, curl, t: 0, p: V(), f: V(), s: V() }; }
function handReach(dt) {
  const R = G.hand; if (!R || !P.alive) { G.hand = null; return; }
  R.t += dt;
  const end = R.inT + R.hold + R.out;
  if (R.t >= end) { G.hand = null; return; }
  // the target went away (search over, walked off): keep the last point and ease the arm back, never snap
  if (!R.lost && !R.get(R.p)) { R.lost = true; R.t = Math.max(R.t, R.inT + R.hold); if (R.p.lengthSq() === 0) { G.hand = null; return; } }
  const k = R.t < R.inT ? smooth(0, R.inT, R.t) : R.t < R.inT + R.hold ? 1 : 1 - smooth(R.inT + R.hold, end, R.t);
  const sh = P.s.B[R.side > 0 ? 'RightArm' : 'LeftArm'].getWorldPosition(hTmp);
  R.f.subVectors(R.p, sh); R.f.y *= 0.4; R.f.normalize();
  R.s.crossVectors(R.f, hUp).normalize().multiplyScalar(R.side);
  P.s.reach(R.side, { p: R.p, f: R.f, s: R.s, curl: R.curl, blend: true }, k * 0.95);
}
// a door: step up to the lever, grip it, push (or pull) it open — or swing it shut
function useDoor(D, open) {
  const S = P.s;
  const hp = world.doorHandle(D, S.pos.x, S.pos.z, V());
  // stand ~0.55 m back from the lever, on your side of the door
  const toMe = V(S.pos.x - hp.x, 0, S.pos.z - hp.z); const dl = toMe.length() || 1; toMe.divideScalar(dl);
  const st = V(hp.x + toMe.x * 0.4, 0, hp.z + toMe.z * 0.4);
  const ok = dl > 0.45 && world.walkable(st.x, st.z) && world.los(V(S.pos.x, 1, S.pos.z), V(st.x, 1, st.z));
  G.doorUse = { t: 0, snap: ok, x0: S.pos.x, z0: S.pos.z, x1: st.x, z1: st.z, face: Math.atan2(hp.x - (ok ? st.x : S.pos.x), hp.z - (ok ? st.z : S.pos.z)) };
  const side = freeHand(); if (open) tut('door');
  reachHand(out => { world.doorHandle(D, P.s.pos.x, P.s.pos.z, out); const sh = P.s.B[side > 0 ? 'RightArm' : 'LeftArm'].getWorldPosition(hTmp2); if (out.distanceTo(sh) > 0.62 && G.hand && G.hand.t < G.hand.inT + G.hand.hold) G.hand.t = G.hand.inT + G.hand.hold; return true; }, { side, inT: ok ? 0.3 : 0.22, hold: 0.3, out: 0.25, curl: 0.9 });
  later(() => { world.setDoor(D, open); MP.door(D, open); SND.door(open ? 'open' : 'close', V(D.x, 1, D.z)); noise(V(D.x, 0, D.z), open ? 6 : 8); }, ok ? 0.3 : 0.22);
}
// a cupboard door, a drawer, a lid: your hand goes to its knob and rides it open
const kBox = new THREE.Box3();
function partGrip(pt) {
  if (pt.knob) return out => { pt.knob.getWorldPosition(out); return true; };
  // no knob: the far edge of whatever moves
  pt.o.updateMatrixWorld(true); kBox.setFromObject(pt.o);
  const c = kBox.getCenter(V()), o = pt.o.getWorldPosition(V());
  const local = pt.o.worldToLocal(c.clone().addScaledVector(c.clone().sub(o), 0.5));
  return out => { pt.o.updateMatrixWorld(true); out.copy(local).applyMatrix4(pt.o.matrixWorld); return true; };
}

// ---------------------------------------------------------------- your backpack and your hands (models in backpack.js)
// Everything you pick up is taken by your hand — the very can off the shelf — and goes over your shoulder into the
// pack; weapons come off the pack (or your belt) into your hand and go back onto it; food comes out of the pack to your
// mouth; a bandage gets wound round your arm. Every sound here is made the moment the hand does the thing.
const hv = V(), hv2 = V(), hv3 = V(), pkT = V(), pkL = V(), hq0 = new THREE.Quaternion();
const fwdOf = (out = V()) => out.set(Math.sin(P.s.yaw), 0, Math.cos(P.s.yaw));
const rightOf = (out = V()) => out.set(-Math.cos(P.s.yaw), 0, Math.sin(P.s.yaw));
// above your shoulder, a little behind: on the way into (or out of) the pack on your back
function overTop(side, out) { P.s.B[side > 0 ? 'RightArm' : 'LeftArm'].getWorldPosition(out); out.y += 0.22; out.addScaledVector(fwdOf(hv2), -0.05); out.addScaledVector(rightOf(hv2), -side * 0.06); return out; }
function intoPack(out) { PACK.anchor('mouth', out); out.y += 0.06; return out; }
function fromPack(side) { return out => PACK.swing > 0.5 ? (PACK.anchor('mouth', out), out.y += 0.03, out) : overTop(side, out); }
function mouthPt(out, fwd = 0) { P.s.B.Head.getWorldPosition(out); out.addScaledVector(fwdOf(hv2), 0.11 + fwd); out.y -= 0.075; return out; }
function chestPt(side, out) { P.s.B.Spine2.getWorldPosition(out); out.addScaledVector(fwdOf(hv2), 0.3).addScaledVector(rightOf(hv2), side * 0.1); out.y -= 0.06; return out; }
function hipPt(out) { P.s.B.Hips.getWorldPosition(out); out.addScaledVector(rightOf(hv2), 0.2); out.y += 0.02; return out; }
// the prop's centre and turn in the world (to hand it over without a jump)
function propFrom(it, model) {
  const q = it.mesh ? it.mesh.getWorldQuaternion(new THREE.Quaternion()) : it.q.clone();
  const p = it.mesh ? it.mesh.getWorldPosition(V()) : it.p.clone();
  if (model && model.children[0]) p.add(model.children[0].position.clone().negate().applyQuaternion(q));
  return { p, q };
}
function pickUp(c, got) {
  const props = (c.items || []).filter(it => !it.taken && !it.res), trips = [];
  for (const g of got) {
    const want = PREF[g.id] || [];
    const it = props.find(x => !x.res && want.includes(x.kind)) || null; if (it) it.res = true;
    const more = []; if (it) for (let q = 1; q < Math.min(g.n, 3); q++) { const m = props.find(x => !x.res && want.includes(x.kind)); if (!m) break; m.res = true; more.push(m); }   // two cans of beans: both
    trips.push({ ...g, it, more, also: [] });
  }
  while (trips.length > 3) trips[2].also.push(trips.pop());   // three trips to the pack at most; the rest go in with the last
  G.pickAct = true;
  const side = freeHand(), box = V(c.x, clamp(c.y ?? 0.9, 0.25, 1.7), c.z); if (c.kind === 'corpse') box.y = 0.3;
  trips.forEach((T, i) => HANDS.play(pickJob(c, T, side, box, i === 0)));
}
function itemToast(T) { const I = ITEMS[T.id]; toast(`${I.name}${T.n > 1 && I.cat !== 'melee' && I.cat !== 'gun' ? '  ×' + T.n : ''}${T.r === 'repair' ? ' (fresh one)' : T.r === 'ammo' ? ' (took the ammo)' : ''}`, I.cat === 'quest' || I.cat === 'melee' || I.cat === 'gun' ? 'gold' : 'good', ITEM_ICON[T.id]); }
function pickJob(c, T, side, box, first) {
  const grabP = V(), lift = V();
  const at = out => T.grabbed ? out.copy(grabP) : T.it ? world.itemPos(T.it, out) : out.copy(box);
  const liftP = out => out.copy(grabP).add(lift);
  const keep = T.r === 'equip';   // a weapon you'll fight with: it stays in your hand
  const grab = now => {
    at(grabP); T.grabbed = true;
    lift.set(P.s.pos.x - grabP.x, 0, P.s.pos.z - grabP.z); if (lift.lengthSq() > 1e-6) lift.normalize(); lift.multiplyScalar(0.14); lift.y = 0.16;
    if (first) { G.pickAct = false; P.s.stopAct(0.55); SND.sting('found'); }
    if (T.it) {
      const model = !now && !keep ? propModel(T.it) : null, from = model && propFrom(T.it, model);
      world.moveItem(T.it, 'take'); SND.touch(T.it.kind, grabP.clone(), 'take');
      if (model) HANDS.hold(side, model, { from });
    } else {
      SND.touch(c.kind === 'corpse' ? 'body' : ITEMS[T.id].cat === 'melee' || ITEMS[T.id].cat === 'gun' ? 'misc' : 'hand', grabP.clone());
      if (!now && !keep) HANDS.hold(side, SHOP.handModel(T.id) || itemModel(T.id), { grow: true });   // [zLux] bills in your hand
    }
    for (const m of T.more) world.moveItem(m, 'take');
    if (keep) { MEL.set(T.id); SND.mech('switch'); }
    if (T.id === 'keys') SND.keys();
    itemToast(T); for (const x of T.also) itemToast(x);
  };
  const stow = now => {
    HANDS.drop(side, now);
    for (const x of [T, ...T.also]) G.transit.delete(x.id);
    PACK.pulse(0.7);
    const I = ITEMS[T.id];
    if (!now) { rustle(0.28, 0.32); zipSound(0.16, true, 0.25); }
    SND.pickup(I.cat === 'melee' || I.cat === 'gun' ? 'weapon' : I.cat === 'ammo' ? 'ammo' : 'item');
  };
  const keys = [{ t: 0.36, at, curl: 0.15 }, { t: 0.46, at, curl: 0.95 }, { t: 0.74, at: liftP, curl: 0.95 }];
  if (keep) return { side, keys, ev: [[0.44, grab]], outT: 0.4 };
  keys.push({ t: 1.06, at: out => overTop(side, out), curl: 0.95 }, { t: 1.26, at: intoPack, curl: 0.95 });
  return { side, keys, ev: [[0.44, grab], [1.2, stow]], outT: 0.35 };
}
// weapons: the one in your hand goes onto the pack (or your belt), the next one comes off it
const isMelee = id => !!id && id !== 'fists' && !!MELEE[id], isGun = id => !!id && !!WEAPONS[id] && !MELEE[id];
function weaponSwap(prev, next) {
  if (HANDS.busy()) HANDS.flush();
  const side = 1;
  if (isGun(prev)) {
    const gid = prev; P.arms.holster(); G.transit.set(gid, 1);
    HANDS.hold(side, itemModel(gid));   // the same gun, now just in your hand
    const dest = out => gid === 'pistol' ? hipPt(out) : (PACK.mountPos(gid, out) || PACK.anchor('gun', out));
    const k = gid === 'pistol' ? [{ t: 0.3, at: dest, curl: 1 }] : [{ t: 0.26, at: out => overTop(side, out), curl: 1 }, { t: 0.44, at: dest, curl: 1 }];
    HANDS.play({ side, keys: k, weapon: true, ev: [[k[k.length - 1].t - 0.02, () => { HANDS.drop(side, true); G.transit.delete(gid); strapSound(0.3); }]], outT: next === 'fists' ? 0.3 : 0 });
  } else if (isMelee(prev) && G.melee[prev] != null) {
    const order = MELEE_ORDER.filter(id => G.melee[id] != null && id !== 'knife' && id !== next), slot = Math.max(0, order.indexOf(prev));
    const dest = out => prev === 'knife' ? PACK.anchor('side', out, -1) : PACK.slotPos(slot, out);
    HANDS.play({ side, weapon: true, keys: [{ t: 0.2, at: out => overTop(side, out), curl: 1 }, { t: 0.32, at: dest, curl: 1 }], ev: [[0.3, () => { MEL.set('fists'); strapSound(0.3); }]], outT: next === 'fists' ? 0.3 : 0 });
  } else if (isMelee(prev)) MEL.set('fists');   // broken: it's gone
  if (isMelee(next)) {
    const src = out => PACK.mountPos(next, out) || (next === 'knife' ? PACK.anchor('side', out, -1) : PACK.anchor('grip', out));
    HANDS.play({ side, weapon: true, keys: [{ t: 0.26, at: out => overTop(side, out), curl: 0.2 }, { t: 0.42, at: src, curl: 0.2 }, { t: 0.5, at: src, curl: 1 }, { t: 0.76, at: out => overTop(side, out), curl: 1 }], ev: [[0.48, () => { MEL.set(next); SND.mech('switch'); strapSound(0.25); }]], outT: 0.35 });
  } else if (isGun(next)) {
    const src = out => next === 'pistol' ? hipPt(out) : (PACK.mountPos(next, out) || PACK.anchor('gun', out));
    // a long gun comes off the back over the shoulder (never through the chest); the pistol from the hip
    const k = next === 'pistol' ? [{ t: 0.3, at: src, curl: 0.3 }, { t: 0.38, at: src, curl: 1 }] : [{ t: 0.22, at: out => overTop(side, out), curl: 0.3 }, { t: 0.36, at: src, curl: 0.3 }, { t: 0.44, at: src, curl: 1 }, { t: 0.6, at: out => overTop(side, out), curl: 1 }];
    HANDS.play({ side, weapon: true, keys: k, ev: [[k[k.length - 1].t - 0.02, () => { MEL.hideAll(); MEL.cur = 'fists'; MEL.swing = null; P.arms.select(next); }]], outT: 0.25 });
  } else if (!isMelee(prev) && !isGun(prev)) MEL.set('fists');
}
// what you eat and drink: out of the pack, up to your mouth — and the empty can dropped
const LITTER = { beans: 'can', soup: 'can', soda: 'can', water: 'bottle', juice: 'carton', chips: 'box' };
const litter = [];
function consumeAnim(id, apply = null) {
  const I = ITEMS[id], side = freeHand(), pills = id === 'pills' || id === 'antibiotics', eat = I.cat === 'food' && !pills;
  const src = fromPack(side), chest = out => chestPt(side, out);
  const keys = [{ t: 0.32, at: src, curl: 0.2 }, { t: 0.42, at: src, curl: 0.95 }, { t: 0.72, at: chest, curl: 0.95 }, { t: 1.0, at: out => mouthPt(out) }];
  let endT;
  if (eat) { for (let i = 0; i < 5; i++) keys.push({ t: 1.14 + i * 0.33, at: out => mouthPt(out, 0.05) }, { t: 1.28 + i * 0.33, at: out => mouthPt(out) }); endT = 2.7; }
  else { keys.push({ t: pills ? 1.6 : 2.4, at: out => mouthPt(out, -0.01) }); endT = pills ? 1.6 : 2.4; }
  keys.push({ t: endT + 0.32, at: chest });
  const done = now => { const kind = LITTER[id]; if (kind && !now) { const m = HANDS.release(side); if (m) litter.push({ m, v: V().copy(fwdOf(hv)).multiplyScalar(0.7).addScaledVector(rightOf(hv3), side * 0.5).setY(0.6), t: 0, kind, w: V(rnd(-6, 6), rnd(-3, 3), rnd(-6, 6)) }); } else HANDS.drop(side, now); };
  HANDS.play({ side, keys, outT: 0.35, ev: [
    [0.4, now => { if (!now) { HANDS.hold(side, itemModel(id), { grow: true }); rustle(0.22, 0.25); } }],
    [eat ? 1.0 : 0.78, now => { if (apply) { apply(); apply = null; } if (now) return; if (eat) SND.eat(); else SND.drink(); }],   // the crunch at your mouth; the cap / ring-pull, then the gulps
    [endT + 0.3, done]] });
}
// a bandage: the roll out of the pack, your other arm held out, wound round it three times (and it stays on)
function bandageAnim(id) {
  const R = 1, L = -1, fa = V(), fh = V();
  const armOut = out => { P.s.B.Spine2.getWorldPosition(out); out.addScaledVector(fwdOf(hv2), 0.34).addScaledVector(rightOf(hv2), 0.02); out.y -= 0.1; return out; };
  const around = th => out => { P.s.B.LeftForeArm.getWorldPosition(fa); P.s.B.LeftHand.getWorldPosition(fh); out.lerpVectors(fa, fh, 0.55); fwdOf(hv2); out.y += Math.cos(th) * 0.075; out.addScaledVector(hv2, Math.sin(th) * 0.075 - 0.01); out.addScaledVector(rightOf(hv3), 0.03); return out; };
  const W0 = 0.85, per = 0.42, loops = 3, endW = W0 + loops * per, kr = [{ t: 0.32, at: fromPack(R), curl: 0.2 }, { t: 0.42, at: fromPack(R), curl: 0.95 }, { t: W0, at: around(0), curl: 0.9 }];
  for (let i = 1; i <= loops * 6; i++) kr.push({ t: W0 + i * per / 6, at: around(i * Math.PI / 3) });
  kr.push({ t: endW + 0.25, at: out => armOut(out).add(hv.set(0, 0.06, 0)) });
  HANDS.play({ lists: [{ side: L, keys: [{ t: 0.62, at: armOut, curl: 0.45 }, { t: endW + 0.3, at: armOut, curl: 0.45 }], inT: 0.15 }, { side: R, keys: kr }], outT: 0.4,
    tick: t => { G.wrapK = Math.max(G.wrapK || 0, smooth(W0, endW, t)); },
    ev: [[0.4, now => { if (!now) { HANDS.hold(R, itemModel(id === 'medkit' ? 'medkit' : 'bandage'), { grow: true }); rustle(0.2, 0.25); } }],
      [0.7, now => { if (!now && id === 'medkit') HANDS.hold(R, itemModel('bandage')); }],   // out of the kit: the gauze
      [W0 - 0.05, now => { if (!now) SND.bandage(); }],
      [endW + 0.05, now => { HANDS.drop(R, now); G.wrapK = 1; }]] });
}
function batteryAnim() {
  const side = freeHand(), torchPt = out => { P.s.B.Spine2.getWorldPosition(out); out.addScaledVector(fwdOf(hv2), 0.24).addScaledVector(rightOf(hv2), -0.06); out.y += 0.05; return out; };
  HANDS.play({ side, keys: [{ t: 0.32, at: fromPack(side), curl: 0.2 }, { t: 0.42, at: fromPack(side), curl: 0.95 }, { t: 0.8, at: torchPt, curl: 0.9 }, { t: 1.2, at: torchPt, curl: 0.9 }], outT: 0.35,
    ev: [[0.4, now => { if (!now) HANDS.hold(side, itemModel('battery'), { grow: true }); }], [0.82, now => { if (!now) SND.battery(); }], [1.15, now => HANDS.drop(side, now)]] });
}
function updateLitter(dt) {
  for (let i = litter.length - 1; i >= 0; i--) {
    const L = litter[i]; L.t += dt;
    if (!L.down) {
      L.v.y -= 9.8 * dt; L.m.position.addScaledVector(L.v, dt); L.m.rotation.x += L.w.x * dt; L.m.rotation.z += L.w.z * dt;
      const gy = (P.s.gy || 0) + 0.035;
      if (L.m.position.y <= gy) { L.m.position.y = gy; L.down = true; L.m.rotation.set(Math.PI / 2, 0, L.m.rotation.y); SND.touch(L.kind === 'carton' ? 'box' : L.kind, L.m.position.clone(), 'tip'); }
    }
    if (L.t > 120) { L.m.removeFromParent(); litter.splice(i, 1); }
  }
}
function clearLitter() { for (const L of litter) L.m.removeFromParent(); litter.length = 0; }
// how full the pack is (what's actually arrived in it)
function packFill() {
  let n = 0;
  for (const id in G.inv) { const I = ITEMS[id], k = (G.inv[id] || 0) - (G.transit.get(id) || 0); if (!I || k <= 0 || I.cat === 'cash') continue; n += I.cat === 'ammo' ? k / 12 : I.cat === 'med' ? k * 0.6 : id === 'gascan' ? 4 : id === 'keys' ? 0.1 : id === 'battery' ? k * 0.3 : k; }
  return clamp(n / 14, 0, 1);
}
const ikT = { p: V(), f: V(), s: V(), curl: 0.9, blend: true };
function holdIK(side, p, w, curl = 0.9) { const sh = P.s.B[side > 0 ? 'RightArm' : 'LeftArm'].getWorldPosition(hv3); ikT.p.copy(p); ikT.f.subVectors(p, sh); ikT.f.y *= 0.4; ikT.f.normalize(); ikT.s.crossVectors(ikT.f, V(0, 1, 0)); if (ikT.s.lengthSq() < 1e-4) rightOf(ikT.s).multiplyScalar(-1); ikT.s.normalize().multiplyScalar(side); ikT.curl = curl; P.s.reach(side, ikT, w * 0.97); }
// the backpack, every frame (dt: real time — the world slows while the bag is open, your hands don't)
function packStep(dt) {
  if (!PACK || !P) return;
  const A = G.packAnim;
  // getting into it: off the right shoulder, swung round to the front, unzipped — then the inventory opens
  if (A) {
    A.t += dt;
    if (A.dir > 0 && G.state !== 'play' && G.state !== 'bag') closeBag();   // a call, a note, the news took you away mid-swing: put it back
    if (A.dir > 0) {
      if (A.t > 0.2) { PACK.swing = Math.min(1, PACK.swing + dt / 0.62); if (!A.snd.sw && PACK.swing > 0.25) { A.snd.sw = 1; rustle(0.45, 0.32, 1100); } }
      if (PACK.swing >= 1) { if (!A.snd.zip) { A.snd.zip = 1; zipSound(0.42, true, 0.45); } PACK.zip = Math.min(1, PACK.zip + dt / 0.42); }
      if (PACK.zip >= 1 && G.state === 'play') { A.dir = 0; bagShown(); }
    } else if (A.dir < 0) {
      if (PACK.zip > 0) { if (!A.snd.zc) { A.snd.zc = 1; zipSound(0.3, false, 0.4); } PACK.zip = Math.max(0, PACK.zip - dt / 0.3); }
      else { if (!A.snd.sb) { A.snd.sb = 1; rustle(0.45, 0.3, 1100); } PACK.swing = Math.max(0, PACK.swing - dt / 0.6); if (PACK.swing <= 0) { strapSound(0.3); G.packAnim = null; } }
    }
  }
  const title = G.state === 'title';
  const heldMel = P.arms.cur ? null : MEL.cur;
  PACK.setCarried(title ? [] : MELEE_ORDER.filter(id => G.melee && G.melee[id] != null && id !== heldMel), title ? null : ['shotgun', 'sniper'].find(id => P.arms.guns[id] && P.arms.cur !== id) || null, !title && (G.inv.water || 0) - (G.transit.get('water') || 0) > 0);
  for (const o of PACK.P.mounts.children) o.visible = !G.transit.has(o.userData.id || o.userData.gun);
  PACK.update(dt, title ? 0.45 : packFill());
  // both hands on the pack while it's off your back
  const on = !!G.packAnim && P.alive, A2 = G.packAnim;
  G.pkWR = damp(G.pkWR || 0, on ? 1 : 0, 10, dt); G.pkWL = damp(G.pkWL || 0, on && PACK.swing > 0.55 ? 1 : 0, 8, dt);
  if (G.pkWR > 0.01 && P.alive) {
    if (A2 && ((A2.dir > 0 && A2.t < 0.22) || (A2.dir < 0 && PACK.swing < 0.2))) PACK.anchor('strap', pkT, -1);   // the right strap, on your shoulder
    else if (PACK.swing < 0.999) PACK.anchor('haul', pkT);
    else if (PACK.zip < 0.999 && A2 && A2.dir !== 0) PACK.anchor('pull', pkT);
    else PACK.anchor('corner', pkT, 1);
    if (!G.pkR) G.pkR = pkT.clone(); else G.pkR.lerp(pkT, 1 - Math.exp(-16 * dt));
    if (!HANDS.uses(1)) holdIK(1, G.pkR, G.pkWR, 0.85);
  } else G.pkR = null;
  if (G.pkWL > 0.01 && P.alive && !HANDS.uses(-1)) holdIK(-1, PACK.anchor('corner', pkL, -1), G.pkWL, 0.85);
  HANDS.update(dt, P.s);
  if (HANDS.cur && !P.arms.cur && MEL.cur !== 'fists' && HANDS.uses(1)) MEL.place(true);   // the weapon rides the hand
  MEL.busy[1] = HANDS.uses(1) || G.pkWR > 0.05; MEL.busy[-1] = HANDS.uses(-1) || G.pkWL > 0.05;
  WRAP.update(P.s, G.wrapK || 0, -1);
  updateLitter(dt);
}

// ---------------------------------------------------------------- the tutorial (first run) and tips (each once, ever)
save.tips ||= {};
const TUT = { done: new Set(), on: false, i: 0, wait: 0, walk: 0, sprint: 0, look: 0, tq: [], tipT: 0, gap: 0, zT: 0, calm: false };
function tutStart() { tipHide(true); TUT.done.clear(); TUT.on = true; TUT.i = 0; TUT.wait = 0; TUT.walk = TUT.sprint = TUT.look = 0; TUT.calm = G.phase === 'calm'; tutShow(); }
function tutStop(how) {
  if (!TUT.on) return; TUT.on = false; $('tut').classList.remove('show');
  if (how !== 'quiet') { save.tutorialDone = true; save.tutorial = false; writeSave(); }
  if (how === 'done') { toast('Tutorial done — tips will pop up when you need them', 'good', 'check'); SND.sting('found'); }
  TUT.gap = 1.5;
}
function tutShow() {
  const S = touchStep(TUTORIAL[TUT.i]); if (!S) return tutStop('done');
  const el = $('tut'); el.classList.remove('tip', 'ok'); el.classList.add('show');
  $('tutN').textContent = `TUTORIAL · STEP ${TUT.i + 1} OF ${TUTORIAL.length}`; $('tutTitle').textContent = S.title; $('tutText').innerHTML = S.text;
  $('tutKeys').innerHTML = S.keys.map(k => `<kbd>${k}</kbd>`).join('');
  $('tutDots').innerHTML = TUTORIAL.map((_, i) => `<i class="${i < TUT.i ? 'd' : i === TUT.i ? 'c' : ''}"></i>`).join('');
  $('tutSkip').textContent = 'Skip tutorial'; $('tutNext').style.display = '';
  el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  if (TUT.done.has(S.id)) { TUT.wait = 0.6; el.classList.add('ok'); }
}
// you did the thing this step was waiting for
function tut(id) {
  if (TUT.on) TUT.done.add(id);   // done early counts: the step's ticked off the moment it comes up
  if (!TUT.on || TUT.wait > 0) return; const S = TUTORIAL[TUT.i]; if (!S || S.id !== id) return;
  TUT.wait = 1.1; $('tut').classList.add('ok'); SND.phoneTap && SND.phoneTap();
}
function tip(id) { if (save.tips[id] || !TUT_TIPS[id] || TUT.tq.includes(id)) return; save.tips[id] = 1; writeSave(); TUT.tq.push(id); }
function tipShow(id) {
  const S = touchStep(TUT_TIPS[id] && { id, ...TUT_TIPS[id] }, true), el = $('tut'); el.classList.remove('ok'); el.classList.add('show', 'tip');
  $('tutN').textContent = 'TIP'; $('tutTitle').textContent = S.title; $('tutText').innerHTML = S.text; $('tutKeys').innerHTML = S.keys.map(k => `<kbd>${k}</kbd>`).join('');
  $('tutDots').innerHTML = ''; $('tutSkip').textContent = 'Got it'; $('tutNext').style.display = 'none';
  el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); TUT.tipT = 8;
}
// no tips over the big moments: the ride coming in / on the ground, a chapter card, a zombie on you (except the tip for that)
function tipBusy(id) { const hs = HELI.state(); return hs === 'inbound' || hs === 'descend' || hs === 'landed' || bigT > 0 || (!!G.grabbedBy && id !== 'grab'); }
function tipHide(now = false) { if (TUT.tipT <= 0 && !now) return; TUT.tipT = 0; if (!TUT.on) $('tut').classList.remove('show', 'tip'); TUT.gap = 0.8; }
$('tutSkip').onclick = () => { if (TUT.on) { tutStop('skip'); toast('Tutorial skipped — replay it any time from the pause menu', 'grey'); } else tipHide(true); };
$('tutNext').onclick = () => { if (TUT.on && TUT.wait <= 0) { TUT.i++; tutShow(); } };
$('tutReplay').onclick = () => { togglePause(); tutStart(); };
function tutTick(dt) {
  if (G.state !== 'play' && G.state !== 'bag' && G.state !== 'phone') return;
  // tips: a look at what's happening, twice a second
  TUT.zT -= dt;
  if (TUT.zT <= 0 && P && P.alive) {
    TUT.zT = 0.5;
    if (G.phase === 'outbreak' && !save.tips.zombie) { const eye = V(P.s.pos.x, (P.s.gy || 0) + 1.6, P.s.pos.z), cd = camera.getWorldDirection(V()); for (const u of Z.list) { if (!u.active || !u.alive) continue; const d = u.s.pos.distanceTo(P.s.pos); if (d > 16) continue; const to = V(u.s.pos.x - eye.x, 1.5 - eye.y, u.s.pos.z - eye.z).normalize(); if (to.dot(cd) > 0.75 && world.los(eye, V(u.s.pos.x, 1.5, u.s.pos.z))) { tip('zombie'); break; } } }
    if (G.bleed > 0) tip('bleed');
    if (G.food < 25 && G.phase !== 'calm') tip('hungry');
    if (world.night > 0.6 && G.phase !== 'calm') tip('night');
  }
  if (TUT.tipT > 0) { TUT.tipT -= dt; if (TUT.tipT <= 0) tipHide(true); }
  else if (!TUT.on && TUT.tq.length) { TUT.gap -= dt; if (TUT.gap <= 0 && !tipBusy(TUT.tq[0])) tipShow(TUT.tq.shift()); }
  if (!TUT.on) return;
  if (TUT.calm && G.phase !== 'calm') { const far = TUT.i >= 6; tutStop(far ? 'skip' : 'quiet'); toast(far ? 'Tutorial over: tips will pop up when you need them' : 'Tutorial paused: replay it from the pause menu', 'grey'); return; }   // the outbreak started under it
  if (TUT.wait > 0) { TUT.wait -= dt; if (TUT.wait <= 0) { TUT.i++; tutShow(); } return; }
  const S = TUTORIAL[TUT.i]; if (!S || G.state !== 'play') return;
  if (S.id === 'walk' && P.s.speed > 0.5) { TUT.walk += P.s.speed * dt; if (TUT.walk > 4) tut('walk'); }
  if (S.id === 'sprint' && (keys.has('ShiftLeft') || keys.has('ShiftRight')) && P.s.speed > P.s.vw * 1.3) { TUT.sprint += dt; if (TUT.sprint > 0.7) tut('sprint'); }
  if (S.id === 'look' && TUT.look > 140) tut('look');
}

// ---------------------------------------------------------------- who you are: one of your neighbours, in their own house
const PEOPLE_POOL = [
  ['human', 'Sam Carter', 'high-school history teacher'], ['human', 'Alex Reed', 'night-shift nurse'], ['human', 'Jordan Hale', 'auto mechanic'],
  ['butler', 'Walter Hughes', 'retired mailman'], ['butler', 'Frank Doyle', 'hardware-store clerk'],
  ['coach', 'Mike Russo', 'Little League coach'], ['coach', 'Dan Kowalski', 'plumber'],
  ['michelle', 'Nina Brooks', 'paramedic student'], ['michelle', 'Tasha Greene', 'barista at the Bean'], ['michelle', 'Maya Ortiz', 'high-school track coach'], ['michelle', 'Jade Wilson', 'veterinary nurse'],
];
const addressOf = h => !MAPLE() || !h ? (h && (h.name || h.label)) || mapName() : Math.abs(h.z) === 17 ? `${2 * Math.round(h.x + 100) + (h.z < 0 ? 1 : 0)} Main St` : `${2 * Math.round(h.z + 100) + (h.x < 0 ? 1 : 0)} Maple Ave`;
function rollWho() {
  const homes = world.houses.filter(h => !h.store && h.front && !(h.x === 68 && h.z === 17)).sort(() => Math.random() - 0.5);
  const women = PEOPLE_POOL.filter(p => p[0] === 'michelle').sort(() => Math.random() - 0.5), men = PEOPLE_POOL.filter(p => p[0] !== 'michelle').sort(() => Math.random() - 0.5);
  const picks = [women[0], men[0], Math.random() < 0.5 ? women[1] : men[1], men[2]].sort(() => Math.random() - 0.5);
  return picks.map((p, i) => ({ body: p[0], name: p[1], job: p[2], house: MAPLE() ? homes[i] : homeHouse() }));
}
// a head-and-shoulders portrait of each body, rendered once in a little studio of its own
const FACES = {};
function faceOf(body, name = '') {   // [looks] the portrait is of the person you'll be (their own look)
  const fk = body + ':' + name; if (FACES[fk] != null) return FACES[fk];
  try {
    const ps = new THREE.Scene(); ps.background = new THREE.Color(0x1c1a18);
    ps.add(new THREE.HemisphereLight(0xfff4e8, 0x302820, 1.6)); const key = new THREE.DirectionalLight(0xfff0dc, 2.4); key.position.set(1.2, 2.2, 2); ps.add(key);
    const rim = new THREE.DirectionalLight(0x9ab0ff, 1.2); rim.position.set(-1.5, 2, -1.5); ps.add(rim);
    const s2 = new Soldier(KINDS[body] || KINDS.human, ps, { clone: true }); LOOKS.applyLook(s2, LOOKS.lookFor('who:' + name, body)); s2.place(0, 0, 0); for (let i = 0; i < 20; i++) s2.update(1 / 30, {});
    s2.pivot.updateMatrixWorld(true); const head = s2.B.Head.getWorldPosition(V());
    const cam = new THREE.PerspectiveCamera(30, 0.8, 0.05, 20); cam.position.set(head.x + 0.35, head.y - 0.02, head.z + 1.15); cam.lookAt(head.x, head.y - 0.12, head.z);
    const W2 = 160, H2 = 200, rt = new THREE.WebGLRenderTarget(W2, H2);
    renderer.setRenderTarget(rt); renderer.render(ps, cam); renderer.setRenderTarget(null);
    const px = new Uint8Array(W2 * H2 * 4); renderer.readRenderTargetPixels(rt, 0, 0, W2, H2, px);
    const cv = document.createElement('canvas'); cv.width = W2; cv.height = H2; const cx = cv.getContext('2d'), id = cx.createImageData(W2, H2);
    for (let y = 0; y < H2; y++) id.data.set(px.subarray((H2 - 1 - y) * W2 * 4, (H2 - y) * W2 * 4), y * W2 * 4);
    cx.putImageData(id, 0, 0); FACES[fk] = cv.toDataURL('image/jpeg', 0.85);
    rt.dispose(); s2.pivot.removeFromParent();
  } catch (e) { FACES[fk] = ''; }
  return FACES[fk];
}
function showWho(go) {
  const roll = () => {
    const W2 = rollWho();
    $('whoList').innerHTML = W2.map((w, i) => `<button class="dbtn who" data-i="${i}">${faceOf(w.body, w.name) ? `<img class="face" src="${faceOf(w.body, w.name)}" alt="">` : ''}<div class="wtx"><div class="top"><b>${w.name.toUpperCase()}</b></div><small>${w.job[0].toUpperCase() + w.job.slice(1)}.<br>Lives at <b>${addressOf(w.house)}</b></small></div></button>`).join('');
    const pickCard = i => { G.whoPick = W2[i]; for (const b of $('whoList').querySelectorAll('button')) b.classList.toggle('sel', +b.dataset.i === i);
      // [who] the file on them, under the cards
      if (!$('whoInfo')) { const d = document.createElement('div'); d.id = 'whoInfo'; $('whoList').after(d); const st = document.createElement('style'); st.textContent = WHO_INFO_CSS; document.head.appendChild(st); }
      const w = W2[i]; $('whoInfo').innerHTML = whoInfoHTML(w, faceOf(w.body, w.name), addressOf(w.house)); };
    for (const b of $('whoList').querySelectorAll('button')) { b.onclick = () => pickCard(+b.dataset.i); b.ondblclick = () => { pickCard(+b.dataset.i); $('whoStart').click(); }; }
    pickCard(0); G.whoPickCard = pickCard; G.whoN = W2.length;
  };
  roll(); $('whoShuffle').onclick = roll;
  if (!$('whoRandom')) { const rb = document.createElement('button'); rb.className = 'm'; rb.id = 'whoRandom'; rb.textContent = '🎲 Random player'; $('whoShuffle').after(rb); }
  $('whoRandom').onclick = () => { roll(); G.whoPickCard(Math.floor(Math.random() * G.whoN)); }; $('whoBack').onclick = () => showDiffs();
  // the run's options (remembered for next time)
  $('oCkpt').checked = save.ckpt !== false; $('oHC').checked = !!save.hc; $('oBub').checked = save.bubbles !== false; $('oShake').checked = !!save.shake; $('oView').value = save.view || 'third';
  $('oMusic').value = save.music ?? 0.7; $('oSfx').value = save.sfx ?? 1; $('oTut').checked = save.tutorial ?? !save.tutorialDone; sliderFill();
  const apply = () => { save.tutorial = $('oTut').checked; save.ckpt = $('oCkpt').checked; save.hc = $('oHC').checked; save.bubbles = $('oBub').checked; save.shake = $('oShake').checked; save.view = $('oView').value; save.music = +$('oMusic').value; save.sfx = +$('oSfx').value; document.body.classList.toggle('hc', !!save.hc); SND.setMusic(save.music); SND.setSfx(save.sfx); writeSave(); syncSettings(); };
  for (const id of ['oTut', 'oCkpt', 'oHC', 'oBub', 'oShake', 'oView', 'oMusic', 'oSfx']) { $(id).oninput = apply; $(id).onchange = apply; }
  $('whoStart').onclick = () => { apply(); G.who = G.whoPick; G.ckpt = null; if (RUN_ON) showSlots('new', go); else { G.slot = null; go(); } };
  showScreen('who');
}
// put you in that body (each body keeps its own arms and weapons, made the first time it's needed)
function setBody(body) {
  if (!RIGS[body]) {
    const s = new Soldier(KINDS[body] || KINDS.human, scene, { clone: true, onStep }); if (body === 'michelle') styleFemale(s, 11); s.update(1 / 60, {});
    const arms = new Arms(s, scene, [], { onEvent: (ty, d) => armsEvent(ty, d), countThrow: id => G.inv ? (G.inv[id] || 0) : 0 }); arms.cur = null;
    RIGS[body] = { s, arms, mel: new Melee(s, scene, SWINGS) };
  }
  const R = RIGS[body];
  for (const k in RIGS) if (RIGS[k] !== R) { RIGS[k].s.setVisible(false); RIGS[k].arms.hideAll(); RIGS[k].mel.hideAll(); }
  if (HANDS) HANDS.flush();
  P.s = R.s; P.arms = R.arms; MEL = R.mel; P.sph = null; P.body = body; HEADS = null; G.fpHidden = null;
  P.s.setVisible(true);
  if (PACK) PACK.wear(P.s, body);
}

// ---------------------------------------------------------------- saving the run: where you are, what you carry, what you've done
// three save slots. A run is saved only at checkpoints (the start of the run counts as the first one), so if you
// quit before a checkpoint you come back to the beginning.
const RUN_ON = PERSIST || Q.has('runsave');
const SLOT_KEY = i => 'zombieapocalypse.slot.' + i + (PERSIST ? '' : '.test');
const readSlot = i => { try { return JSON.parse(localStorage.getItem(SLOT_KEY(i))); } catch { return null; } };
const readRun = () => { const r = G.slot != null ? readSlot(G.slot) : null; return r && r.ckpt; };
function writeSlot() { if (!RUN_ON || G.slot == null) return; const rec = { diff: save.diff, map: MAP_ID, who: { body: P.body, name: (G.who && G.who.name) || 'Sam Carter', job: (G.who && G.who.job) || '', house: world.houses.indexOf(G.home) }, ckpt: G.ckpt || null, at: Date.now() }; try { localStorage.setItem(SLOT_KEY(G.slot), JSON.stringify(rec)); } catch { } }
function clearRun() { if (!RUN_ON || G.slot == null) return; try { localStorage.removeItem(SLOT_KEY(G.slot)); } catch { } }
function saveRun() { if (G.slot == null) G.slot = 0; const d = runData(); if (!d) return; G.ckpt = d; writeSlot(); }   // (tests)
function checkpoint() {
  if (save.ckpt === false || MP.on()) return;   // MP: no checkpoints online
  const d = runData();
  if (!d) { if (P && P.alive && G.state !== 'title' && G.state !== 'result') later(checkpoint, 1.5); return; }   // on the phone, mid-jump: try again in a moment
  G.ckpt = d; writeSlot(); toast('Checkpoint saved', 'grey', 'check'); tip('checkpoint');
}
// which flights have been and gone (the one in the air or on the ground right now counts as still to come)
function heliSnap() { const hs = HELI.snapshot(); if (hs && ['inbound', 'descend', 'landed'].includes(HELI.state())) { const i = hs.done.lastIndexOf(true); if (i >= 0) hs.done[i] = false; } return hs; }
function runData() {
  if (!P || !P.alive || !['play', 'bag', 'note', 'phone'].includes(G.state) || G.phase === 'news' || P.s.jump.st !== 'ground' || G.vaulting || P.s.climbing || DRIVE.active()) return null;
  const nb = world.nBase || world.containers.length;
  const d = {
    v: 1, at: Date.now(), diff: save.diff,
    who: { body: P.body, name: (G.who && G.who.name) || 'Sam Carter', job: (G.who && G.who.job) || '', house: world.houses.indexOf(G.home) },
    G: { hour: G.hour, day: G.day, startHour: G.startHour, phase: G.phase, prologue: G.prologue, stage: Math.floor(G.stage), food: G.food, water: G.water, stam: G.stam, bleed: G.bleed, infection: G.infection, battery: G.battery, flashlight: G.flashlight, inv: G.inv, melee: G.melee, weapon: G.weapon, stats: G.stats, notes: G.notes, recruits: G.recruits, missed: G.missed || 0, heliSeen: !!G.heliSeen && HELI.state() !== 'waiting', saved: G.saved || 0 },
    v2: 1, heli: heliSnap(), fueled: !!(world.truck && world.truck.fueled),
    obElapsed: G.phase === 'outbreak' ? G.t - G.obT : 0,
    p: [P.s.pos.x, P.s.pos.z, P.s.yaw, P.s.gy || 0], hp: P.hp,
    guns: Object.keys(P.arms.guns || {}).map(id => [id, P.arms.ammo[id] ? P.arms.ammo[id].mag : 0]),
    searched: world.containers.slice(0, nb).map((c, i) => c.searched ? [i, c.takenBy || 0] : null).filter(Boolean),
    doors: world.doors.map(D => (D.broken ? 2 : 0) + (D.want > 0.5 ? 1 : 0)),
    chaos: world.chaos.map(it => it.shown ? 1 : 0).join(''),
    props: world.props.map((it, i) => it.taken ? i : -1).filter(i => i >= 0),
    shed: world.containers.indexOf(world.containers.find(c => c.fixed && c.fixed[0] && c.fixed[0][0] === 'gascan')),
    map: MAP_ID, radioDone: !!G.radioDone, role: G.role || null,
  };
  return JSON.parse(JSON.stringify(d));
}
async function continueRun() {
  const d = readRun(); if (!d) return;
  save.diff = d.diff || save.diff;
  G.who = { body: d.who.body, name: d.who.name, job: d.who.job, house: world.houses[d.who.house] || homeHouse() };
  showScreen(null); await newGame(d);
}
function applyRun(d) {
  // the story so far
  if (d.G.phase === 'outbreak') { if (MAPLE()) { startNews(); endNews(true, true); } else { G.phase = 'calm'; startMapNews(); endMapNews(true, true); } G.obT = G.t - (d.obElapsed || 0); }
  Object.assign(G, JSON.parse(JSON.stringify(d.G))); G.radioDone = !!d.radioDone; G.phase = d.G.phase === 'news' ? 'calm' : d.G.phase; if (G.phase === 'calm') G.hour = Math.min(G.hour, obHour() - 0.05);
  world.sunny = G.phase === 'calm' ? 1 : clamp(1 - (G.t - G.obT) / (HOUR * 2.5), 0, 1); world.setTime(G.hour);
  if (!d.v2) { G.stage = G.stage >= 1 ? 1 : 0; G.missed = 0; }   // a run saved before the helicopter: pick it up from SUPPLIES
  G.stage = Math.min(G.stage, CHS().length - 1); G.stats.humansHurt ||= 0; G.stats.humansKilled ||= 0;
  if (G.inv.keys > 0) for (const u of Z.list) if (u.dale) sleep(u);   // you already took the keys off Dale
  HELI.restore(d.heli); if (world.truck) world.truck.fueled = !!d.fueled;
  if (Math.floor(G.stage) >= 3 && HELI.state() === 'waiting') G.heliSeen = false;
  // the gas can's shed
  if (d.shed >= 0 && world.containers[d.shed]) { for (const c of world.containers) if (c.fixed && c.fixed[0] && c.fixed[0][0] === 'gascan') delete c.fixed; const sh = world.containers[d.shed]; sh.fixed = [['gascan', 1]]; const hh = sh.house; if (hh) G.hend = { x: sh.x, z: sh.z, name: addressOf(hh) }; }
  // the town as you left it
  for (const [i, by] of d.searched || []) { const c = world.containers[i]; if (!c) continue; c.searched = true; if (by) c.takenBy = by; if (c.parts && c.parts.length) world.open(c); }
  (d.doors || []).forEach((v, i) => { const D = world.doors[i]; if (!D) return; if (v & 2) { D.broken = true; D.box.off = true; D.pivot.visible = false; } else if (v & 1) { D.open = D.want = 1; } });
  if (d.chaos) world.chaos.forEach((it, i) => { if (d.chaos[i] === '1' && !it.shown) world.setChaos(it, true); });
  for (const i of d.props || []) { const it = world.props[i]; if (it && !it.taken) world.moveItem(it, 'take'); }
  // you
  P.s.place(d.p[0], d.p[1], d.p[2], d.p[3] || 0); P.hp = d.hp; G.camYaw = d.p[2]; camInit = false;
  for (const [id, mag] of d.guns || []) { P.arms.give(id); P.arms.guns[id].visible = false; if (P.arms.ammo[id]) P.arms.ammo[id].mag = mag; }
  if (WEAPONS[G.weapon] && P.arms.guns[G.weapon]) equipGun(G.weapon); else if (G.melee[G.weapon] != null) equipMelee(G.weapon); else { G.weapon = 'fists'; MEL.set('fists'); }
  if (G.phase === 'outbreak') { SND.setPeace(0); SND.musicPlaying(true); }
  const hh = Math.floor(G.hour), mm = Math.floor((G.hour - hh) * 60);
  bigText('CONTINUED', `${(G.who && G.who.name) || ''} · DAY ${G.day} · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, 3.5);
}
function refreshContinue() {
  const b = $('btnCont'); if (!b) return;
  const rs = RUN_ON ? [0, 1, 2].map(readSlot).filter(Boolean) : [];
  b.style.display = rs.length ? '' : 'none';
  if (rs.length) { b.querySelector('b').textContent = 'LOAD GAME'; b.querySelector('small').textContent = `${rs.length} saved run${rs.length > 1 ? 's' : ''} · latest: ${rs.sort((a, c) => c.at - a.at)[0].who.name}`; }
}

// ---------------------------------------------------------------- your phone: Messages, Phone (Mom, Ben, 911); the other apps are broken
const CONTACTS = { mom: { name: 'Mom', sub: 'Lisbon, Portugal', av: '👩' }, bro: { name: 'Ben', sub: 'next door', av: '🧔' } };
const PH = { app: 'home', thread: null, call: null, msgs: { mom: [], bro: [] }, unread: { mom: 0, bro: 0 }, typing: null, step: { mom: 'calm0', bro: 'calm0' }, ambs: 0, chance: 0 };
// each step: what they say, then the replies you can pick (each -> next step)
const SCRIPT = {
  mom: {
    calm0: { say: ['Morning sweetheart! It\'s 4pm here in Lisbon ☀️', 'Did Em and the kids get off ok?'], opts: [['Yeah, they left last night', 'calm1'], ['Quiet house for once 😅', 'calm1']] },
    calm1: { say: ['Good! Eat something proper today. NOT those Quick Stop burgers 😂'], opts: [['Haha ok Mom', 'calm2'], ['No promises', 'calm2']] },
    calm2: { say: ['Love you! Call me later ❤️'], opts: [] },
    ob0: { say: ['Honey I just saw it on the news here. MAPLE HOLLOW.', 'Are you safe???'], opts: [['I\'m ok. I\'m inside.', 'ob1'], ['It\'s bad, Mom. People are biting people.', 'ob1']] },
    ob1: { say: ['Oh my God. Lock the doors.', 'Is Ben with you?'], opts: [['He\'s next door', 'ob2'], ['I\'ll go get him', 'ob2']] },
    ob2: { say: ['Please stay together. I\'m trying to get a flight but they\'ve cancelled everything to the US.'], opts: [['Don\'t come here. Please.', 'ob3'], ['I love you Mom', 'ob3']] },
    ob3: { say: ['I love you too. Text me every hour. EVERY hour, you hear me?'], opts: [] },
    late: { say: ['Still ok?? Please answer'], opts: [['Still here. Still ok.', 'late1'], ['There\'s a rescue helicopter at 2am. I\'m getting on it.', 'late1']] },
    late1: { say: ['Thank God. I\'m praying for you both ❤️'], opts: [] },
  },
  bro: {
    calm0: { say: ['yo you up? 🍔 raj fired up the grill', 'quick stop at 12?'], opts: [['Sure, I\'ll meet you there', 'calm1'], ['Can\'t, maybe later', 'calm1']] },
    calm1: { say: ['cool cool'], opts: [] },
    ob0: { say: ['DUDE', 'the quick stop. did you see that?? gary just BIT raj', 'its on every channel'], opts: [['I saw. Lock your door.', 'ob1'], ['Come over here. Now.', 'come']] },
    ob1: { say: ['locking up. text me if you need me'], opts: [['Actually — come over. We stick together.', 'come']] },
    come: { say: ['ok. coming. dont hit me with anything lol'], opts: [], act: 'broCome' },
    here: { say: ['im here. whats the plan'], opts: [] },
  },
};
function openPhone() { if (G.state !== 'play') return; if (G.role === 'inmate') { if (!(G.t < (G.noPhoneT || 0))) { G.noPhoneT = G.t + 4; think('No phone. They took it off me at intake.', 2.5); } return; } G.state = 'phone'; keys.clear(); G.mouse.left = G.mouse.right = false; PH.app = PH.app === 'call' && !PH.call ? 'home' : PH.app; renderPhone(); $('phone').classList.add('show'); SND.phoneTap && SND.phoneTap(); P.s.playUp('Interact', { rate: 0.7, fade: 0.2, fadeAt: 1.2 }); }
function closePhone() { if (G.state === 'phone') G.state = 'play'; $('phone').classList.remove('show'); if (PH.call && PH.call.who !== '911') PH.call = null; }
function phTime() { const hh = Math.floor(G.hour), mm = Math.floor((G.hour - hh) * 60); return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')}`; }
function addMsg(who, from, text) { PH.msgs[who].push({ from, text }); if (from === 'them' && !(G.state === 'phone' && PH.app === 'chat' && PH.thread === who)) { PH.unread[who]++; toast(`${CONTACTS[who].name}: ${text}`, 'grey', 'note'); SND.phoneBuzz(); } if (G.state === 'phone') renderPhone(); }
// they type, then say their lines one by one
function theySay(who, step) {
  const S = SCRIPT[who][step]; if (!S) return; PH.step[who] = '_wait'; if (!PH.typing || typeof PH.typing !== 'object') PH.typing = {};
  // one line after another: typing… then the line, a breath, typing… — the reply options only once the last one's in
  let t = 0;
  S.say.forEach((line, i) => {
    later(() => { PH.typing[who] = true; if (G.state === 'phone') renderPhone(); }, t); t += 1.2 + line.length * 0.03;
    later(() => { PH.typing[who] = false; addMsg(who, 'them', line); if (i === S.say.length - 1) { PH.step[who] = step; if (S.act === 'broCome') broCome(); if (G.state === 'phone') renderPhone(); } }, t); t += 0.5;
  });
}
function reply(who, text, next) { STATS.event('text'); tut('phone'); addMsg(who, 'me', text); SND.phoneTap && SND.phoneTap(); PH.step[who] = '_wait'; later(() => theySay(who, next), 1.5); }
function renderPhone() {
  const el = $('phoneScreen'); if (!el) return;
  const hrs = Math.max(0, (G.day - 1) * 24 + G.hour - G.startHour), bat = Math.max(3, Math.round(100 - hrs * 5.5)), bar = `<div class="pbar"><span>${phTime()}</span><span>${G.phase === 'outbreak' ? '▂▄_ ' : '▂▄▆ '}${bat < 20 ? '<b style="color:#ff453a">' : ''}${bat}%${bat < 20 ? '</b>' : ''}</span></div>`;
  const app = (id, ic, nm, badge = 0) => `<button class="papp" data-app="${id}"><i>${ic}</i><span>${nm}</span>${badge ? `<b>${badge}</b>` : ''}</button>`;
  let h = bar;
  if (PH.app === 'home') h += `<div class="phome"><div class="pclock">${phTime()}</div><div class="pdate">Saturday, November 8</div><div class="pgrid">${app('msgs', '💬', 'Messages', PH.unread.mom + PH.unread.bro)}${app('call', '📞', 'Phone')}${app('weather', '⛅', 'Weather')}${app('settings', '⚙️', 'Settings')}${app('store', '🛍️', 'App Store')}${app('camera', '📷', 'Camera')}</div><div class="phint">T or Esc to put it away</div></div>`;
  else if (PH.app === 'msgs') h += `<div class="phead"><button class="pback">‹</button>Messages</div>` + Object.keys(CONTACTS).map(k => { const m = PH.msgs[k][PH.msgs[k].length - 1]; return `<button class="prow" data-thread="${k}"><i>${CONTACTS[k].av}</i><span><b>${CONTACTS[k].name}</b><small>${m ? m.text.replace(/</g, '&lt;') : CONTACTS[k].sub}</small></span>${PH.unread[k] ? `<em>${PH.unread[k]}</em>` : ''}</button>`; }).join('');
  else if (PH.app === 'chat') {
    const k = PH.thread, S = SCRIPT[k][PH.step[k]];
    h += `<div class="phead"><button class="pback">‹</button>${CONTACTS[k].av} ${CONTACTS[k].name}<small>${CONTACTS[k].sub}</small></div><div class="pchat" id="pchat">${PH.msgs[k].map(m => `<div class="pm ${m.from}">${m.text.replace(/</g, '&lt;')}</div>`).join('')}${PH.typing && PH.typing[k] ? '<div class="pm them typing">• • •</div>' : ''}</div>`;
    h += `<div class="popts">${S && PH.step[k] !== '_wait' && !(PH.typing && PH.typing[k]) ? S.opts.map(([t, n], i) => `<button class="popt" data-opt="${i}">${t}</button>`).join('') : ''}</div>`;
    PH.unread[k] = 0;
  }
  else if (PH.app === 'call') {
    if (PH.call) { const C2 = PH.call; h += `<div class="pcall"><div class="pav">${C2.who === '911' ? '🚑' : CONTACTS[C2.who].av}</div><div class="pname">${C2.who === '911' ? '911' : CONTACTS[C2.who].name}</div><div class="pstat">${C2.state}</div><div class="pline">${C2.line || ''}</div><div class="popts">${(C2.opts || []).map(([t], i) => `<button class="popt" data-copt="${i}">${t}</button>`).join('')}</div><button class="pend">End call</button></div>`; }
    else h += `<div class="phead"><button class="pback">‹</button>Phone</div>` + [['mom', '👩', 'Mom'], ['bro', '🧔', 'Ben'], ['911', '🚑', '911 · Emergency']].map(([k, av, nm]) => `<button class="prow" data-callto="${k}"><i>${av}</i><span><b>${nm}</b><small>${k === '911' ? (PH.ambs ? `${PH.ambs}/3 ambulances sent` : 'police · fire · ambulance') : CONTACTS[k].sub}</small></span><em class="pdial">📞</em></button>`).join('');
  }
  else { const nm = { weather: 'Weather', settings: 'Settings', store: 'App Store', camera: 'Camera' }[PH.app]; h += `<div class="phead"><button class="pback">‹</button>${nm}</div><div class="perr"><div>⚠️</div><b>${nm} isn't responding</b><small>Error 0x8E1 — the app has malfunctioned and can't open. ${PH.app === 'weather' ? 'Location services unavailable.' : PH.app === 'store' ? 'Cannot connect to the App Store.' : 'Try again later.'}</small></div>`; }
  el.innerHTML = h;
  const ch = $('pchat'); if (ch) ch.scrollTop = ch.scrollHeight;
  for (const b of el.querySelectorAll('[data-app]')) b.onclick = () => { PH.app = b.dataset.app; if (!['home', 'msgs', 'call'].includes(PH.app)) SND.phoneErr && SND.phoneErr(); renderPhone(); };
  for (const b of el.querySelectorAll('.pback')) b.onclick = () => { PH.app = PH.app === 'chat' ? 'msgs' : 'home'; renderPhone(); };
  for (const b of el.querySelectorAll('[data-thread]')) b.onclick = () => { PH.app = 'chat'; PH.thread = b.dataset.thread; renderPhone(); };
  for (const b of el.querySelectorAll('[data-opt]')) b.onclick = () => { const k = PH.thread, S = SCRIPT[k][PH.step[k]], [t, n] = S.opts[+b.dataset.opt]; reply(k, t, n); };
  for (const b of el.querySelectorAll('[data-callto]')) b.onclick = () => startCall(b.dataset.callto);
  for (const b of el.querySelectorAll('[data-copt]')) b.onclick = () => { const o = PH.call.opts[+b.dataset.copt]; PH.call.opts = []; o[1](); renderPhone(); };
  const pe = el.querySelector('.pend'); if (pe) pe.onclick = () => { PH.call = null; SND.phoneTap && SND.phoneTap(); renderPhone(); };
}
// calls: it rings, they pick up, the words are on screen (no voices)
function callLine(text, state = 'connected', dur = 3.2) { if (!PH.call) return; PH.call.state = state; PH.call.line = text; SND.tvVoice(Math.min(4, 0.6 + text.length * 0.045)); renderPhone(); }
function startCall(who) {
  PH.app = 'call'; PH.call = { who, state: 'calling…', line: '', opts: [] }; renderPhone();
  SND.ringback && SND.ringback(2);
  const c0 = PH.call, alive = () => PH.call === c0;
  if (who === '911') {
    later(() => { if (!alive()) return; callLine('"911, what\'s your emergency?"');
      c0.opts = G.phase !== 'outbreak' ? [['"Sorry — wrong number."', () => { callLine('"Please don\'t call 911 unless it\'s an emergency, sir."'); later(() => alive() && (PH.call = null, renderPhone()), 3); }]]
        : [['"People are attacking people — they\'re BITING!"', () => call911(c0)], ['"Someone\'s hurt. I need an ambulance."', () => call911(c0)]];
      renderPhone(); }, 3.2);
  } else {
    later(() => { if (!alive()) return;
      const L = who === 'mom' ? (G.phase === 'outbreak' ? ['"Oh thank God — I\'ve been calling and calling!"', '"Listen to me. Get Ben. Stay together. Don\'t open the door to ANYONE."', '"I love you. Call me when you can."'] : ['"Hi honey! What a surprise!"', '"Are you eating? You sound tired."', '"Ok, love you, bye bye!"'])
        : (G.phase === 'outbreak' ? ['"Yeah?! — sorry, I\'m whispering, there\'s one in my yard."', '"Text me if you want me to come over. I\'ll come."'] : ['"Yo! Burgers at twelve, right?"', '"Cool. See you there."']);
      L.forEach((l, i) => later(() => alive() && callLine(l), i * 3.6));
      later(() => { if (alive()) { PH.call = null; renderPhone(); } }, L.length * 3.6 + 1);
    }, 4.5);
  }
}
// an ambulance for every call (three at most); the further ones take longer
const AMB_ETA = [50, 96, 180];
function call911(c0) {
  const alive = () => PH.call === c0;
  if (!MAPLE()) { callLine('"911, all lines are busy. Please stay on the line..."'); later(() => alive() && callLine('*the line goes dead*'), 3.5); later(() => alive() && (PH.call = null, renderPhone()), 6); return; }
  if (PH.ambs >= 3) { callLine('"Sir — every unit we have is already out there. Nobody else is coming. I\'m sorry."'); later(() => alive() && (PH.call = null, renderPhone()), 4); return; }
  later(() => alive() && callLine('"We\'re getting a lot of calls from Maple Hollow. What\'s your address?"'), 0.4);
  later(() => { if (!alive()) return; c0.opts = [[`"${addressOf(G.home)}" — no, I'm out — I'm near ${nearStreet()}`, () => {
    const n = PH.ambs++, eta = AMB_ETA[n]; PH.chance += 0.08;
    callLine(`"Okay. ${n === 0 ? 'An ambulance is on the way' : n === 1 ? 'I\'m sending another unit, from Ridgefield' : 'The last unit is coming from the county hospital'} — about ${eta < 60 ? eta + ' seconds' : (eta / 60).toFixed(1).replace('.0', '') + ' minutes'}. Stay where you are."`);
    dispatchAmbulance(eta, n); STATS.event('ambulance');
    later(() => alive() && (PH.call = null, renderPhone()), 5);
  }]]; renderPhone(); }, 4);
}
function nearStreet() { const p = P.s.pos; return Math.abs(p.z) < Math.abs(p.x) ? 'Main Street' : 'Maple Avenue'; }
function broCome() { const r = PEOPLE.brotherComes ? PEOPLE.brotherComes(P) : 'none'; if (r === 'dead') later(() => think('Ben isn\'t answering anymore...', 3), 2); else if (r === 'gone') later(() => think('No reply from Ben.', 3), 2); }
// texts that arrive by themselves as the day goes on
function phoneTick(dt) {
  // the clock on the open phone keeps time (just the text — no full redraw)
  if (G.state === 'phone') { const pt = phTime(); if (PH.clk !== pt) { PH.clk = pt; const el = $('phoneScreen'); if (el) { const c = el.querySelector('.pclock'), b = el.querySelector('.pbar span'); if (c) c.textContent = pt; if (b) b.textContent = pt; } } }
  if (!MAPLE() && !(STORY && STORY.phone)) { updateAmbulances(dt); return; }   // Mom and Ben's texts are Maple Hollow's story
  if (!PH.started) { PH.started = true; addMsg('mom', 'them', SCRIPT.mom.calm0.say[0]); addMsg('mom', 'them', SCRIPT.mom.calm0.say[1]); addMsg('bro', 'them', SCRIPT.bro.calm0.say[0]); addMsg('bro', 'them', SCRIPT.bro.calm0.say[1]); PH.step.mom = 'calm0'; PH.step.bro = 'calm0'; }
  if (G.phase === 'outbreak' && !PH.obSent) { PH.obSent = true; later(() => theySay('bro', 'ob0'), 25); later(() => theySay('mom', 'ob0'), 60); }
  if (G.phase === 'outbreak' && PH.obSent && G.t - (PH.lateT ?? G.t) > HOUR * 3 && ['ob3', 'late1'].includes(PH.step.mom)) { PH.lateT = G.t; theySay('mom', 'late'); }
  PH.lateT ??= G.t;
  updateAmbulances(dt);
}

// ---------------------------------------------------------------- the ambulances you call: they drive in down the nearest street, siren
// and lights, stop by you, open up for 20 seconds. Anyone who climbs in the back in that time has a chance (8% for every
// ambulance you've called) of being patched up. The paramedics get out to help the "sick" — and that goes how you'd think.
const AMBS = [];
// one shared light for the ambulance's beacons, in the scene from the start (adding a light later recompiles every shader)
const ambLight = new THREE.PointLight(0xff2010, 0, 18, 1.6); world.addLight(ambLight);
// and its headlights' beam down the road at night (computers only: one more light in every shader costs a phone too much)
const ambSpot = MOB ? null : new THREE.SpotLight(0xfff2dc, 0, 42, 0.55, 0.55, 1.4);
if (ambSpot) { ambSpot.castShadow = false; world.addLight(ambSpot); scene.add(ambSpot.target); }
const ambFwd = V(), ambO = V();
// the road ahead of the van: a wreck, a parked car, a barricade? (the same boxes you collide with)
function ambBlocked(A) { ambFwd.set(A.axis === 'x' ? A.dir : 0, 0, A.axis === 'z' ? A.dir : 0); ambO.set(A.pos.x, 0.8, A.pos.z).addScaledVector(ambFwd, 2.7); const h = world.ray(ambO, ambFwd, 4); return h ? h.t : null; }
// whoever's in the road gets hit (the dead, the living, you)
function ambHits(A) {
  if (A.speed <= 4) return;
  const dir = V(A.axis === 'x' ? A.dir : 0, 0, A.axis === 'z' ? A.dir : 0);
  for (const u of Z.list) if (u.alive && u.active && u.s.pos.distanceTo(A.pos) < 2.2) damage(u, 60, null, { dir, knock: 1 });
  for (const n of C.npcs || []) if (n.alive && !n.gone && !n.hidden && !n.boarded && n.s.pos.distanceTo(A.pos) < 2.2 && PEOPLE.hurtNPC) PEOPLE.hurtNPC(n, 60, null, { dir });
  if (P.alive && !G.inAmb && !DRIVE.active() && A.speed > 6 && P.s.pos.distanceTo(A.pos) < 2.2 && C.t > (A.hitPT || 0)) { A.hitPT = C.t + 1.5; damage(P, 30, null, { dir, knock: 1 }); C.shake = Math.max(C.shake, 0.6); SND.impact && SND.impact(P.s.pos.clone(), 'flesh', 1); }
}
// wheels roll, the body dips when it brakes, the brake lights come on
function ambDrive(A, dt) {
  const L = A.live; if (!L) return;
  for (const w of L.wheels) w.spin.rotation.x += A.speed * dt / L.r;
  const decel = dt > 0 ? (A.prevSpeed - A.speed) / dt : 0;
  L.body.rotation.x = damp(L.body.rotation.x, clamp(decel * 0.004, -0.04, 0.04), 8, dt);
  if (L.tail) L.tail.emissiveIntensity = A.speed < A.prevSpeed - 0.1 * dt * 60 || (A.state === 'driving' && A.speed < 2) ? 2 : 0.4;
  A.prevSpeed = A.speed;
}
const ambPaint = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.2, metalness: 0.12, envMapIntensity: 1.35 });   // a fresh glossy fleet finish (the same shader as every other car: no hitch when it turns up)
function dispatchAmbulance(eta, n) { AMBS.push({ n, eta, t: 0, state: 'coming' }); }
const ambRed = new THREE.MeshStandardMaterial({ color: 0xb01810, roughness: 0.42, metalness: 0.15 });   // the red stripe and roof panel (vehicles.js wants the material)
function makeAmbulance() {
  const g = buildCar('van', ambPaint, { ambulance: true, red: ambRed }); scene.add(g);
  const lbl = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.42), new THREE.MeshStandardMaterial({ map: TX.labelTexture(['AMBULANCE'], '#f2f2ee', '#b01810', 512, 128, 'bold 74px Helvetica'), roughness: 0.4 }));
  for (const sx of [-1, 1]) { const l = lbl.clone(); l.position.set(sx * 1.005, 1.75, -0.6); l.rotation.y = sx * Math.PI / 2; g.add(l); }
  const red = new THREE.MeshStandardMaterial({ color: 0x6a0a06, emissive: 0xff1a10, emissiveIntensity: 0, roughness: 0.12, metalness: 0.1 }), wht = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.12, metalness: 0.1 });
  // a real light bar: a dark housing with chrome end caps, rounded lenses (red, white, red) sitting in it
  { const house = new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.5, metalness: 0.3 }), chrome = new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.18, metalness: 0.9 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.07, 0.3), house); base.position.set(0, 2.49, 1.05); g.add(base);
    for (const sx of [-1, 1]) { const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 14).rotateZ(Math.PI / 2), chrome); cap.position.set(sx * 0.875, 2.55, 1.05); g.add(cap); }
    const lens = new THREE.CapsuleGeometry(0.068, 0.4, 4, 12).rotateZ(Math.PI / 2);
    for (const [m, x] of [[red, -0.56], [wht, 0], [red, 0.56]]) { const b = new THREE.Mesh(lens, m); b.position.set(x, 2.56, 1.05); b.scale.z = 1.45; g.add(b); } }
  const live = makeDrivable(g, 'van');   // real wheels that turn, a body that pitches, brake lights
  return { g, red, wht, light: ambLight, live, prevSpeed: 0, parts: g.userData.parts || [] };
}
function updateAmbulances(dt) {
  if (!AMBS.some(B => B.g && B.state !== 'gone')) { ambLight.intensity = 0; if (ambSpot) ambSpot.intensity = 0; }
  for (const A of AMBS) {
    A.t += dt;
    if (A.state === 'coming' && A.t >= A.eta - 9) {   // it turns into the street, siren going
      Object.assign(A, makeAmbulance());
      const p = P.s.pos, onMain = Math.abs(p.z) < Math.abs(p.x) || Math.abs(p.x) > 95;
      const side = onMain ? (p.x > 0 ? 1 : -1) : (p.z > 0 ? 1 : -1);
      A.axis = onMain ? 'x' : 'z'; A.dir = -side;
      A.stop = onMain ? clamp(p.x, -92, 92) : clamp(p.z, -92, 92);
      A.pos = onMain ? V(side * 104, 0, -2.1 * A.dir) : V(-2.1 * -A.dir * 0 + 2.1 * A.dir, 0, side * 104);
      if (onMain) A.pos.z = 2.1 * A.dir; else A.pos.x = -2.1 * A.dir;
      A.speed = 14; A.state = 'driving'; A.sirenT = 0;
      A.g.rotation.y = onMain ? (A.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (A.dir > 0 ? 0 : Math.PI);
      toast('🚑 Ambulance coming', 'grey', 'note');
    }
    if (!A.g) continue;
    const flash = Math.floor(G.t * 6) % 2, lit = A.state !== 'gone' && A.state !== 'coming';
    A.red.emissiveIntensity = lit && flash ? 3 : 0.2; A.wht.emissiveIntensity = lit && !flash ? 3 : 0.2;
    if (AMBS.find(B => B.g && B.state !== 'gone') === A) {
      ambLight.position.copy(A.pos); ambLight.position.y += 2.8; ambLight.intensity = lit ? (flash ? 14 : 6) : 0; ambLight.color.setHex(flash ? 0xff2010 : 0xffffff);
      const nt = world.night || 0, ya = A.g.rotation.y, fx2 = Math.sin(ya), fz2 = Math.cos(ya);
      if (ambSpot) { ambSpot.position.set(A.pos.x + fx2 * 2.9, 0.85, A.pos.z + fz2 * 2.9); ambSpot.target.position.set(A.pos.x + fx2 * 16, 0, A.pos.z + fz2 * 16); ambSpot.target.updateMatrixWorld(); ambSpot.intensity = lit && nt > 0.25 ? 26 * smooth(0.25, 0.6, nt) : 0; }
    }
    if (A.live && A.live.head) A.live.head.emissiveIntensity = lit ? 0.5 + 2.5 * smooth(0.15, 0.6, world.night || 0) : 0;   // dipped headlights on, always (bright at night)
    if (A.state === 'driving') {
      const cur = A.axis === 'x' ? A.pos.x : A.pos.z, left = (A.stop - cur) * A.dir;
      let want = Math.min(14, Math.max(0.7, Math.sqrt(2 * 4.5 * Math.max(0, left - 0.15))));   // it brakes like a real van: a steady ~4.5 m/s², the nose dipping, right down to the spot
      const bt = ambBlocked(A); if (bt != null) want = Math.min(want, Math.max(0, (bt - 0.6) * 2.5));   // something in the road: brake and stop short of it
      A.speed = want > A.speed ? Math.min(want, A.speed + 6 * dt) : Math.max(want, A.speed - 12 * dt);
      if (bt != null && bt < 1.2 && A.speed < 0.3) { A.stop = cur; A.speed = 0; }   // can't get through: the doors open here
      if (A.axis === 'x') A.pos.x += A.dir * A.speed * dt; else A.pos.z += A.dir * A.speed * dt;
      A.sirenT -= dt; if (A.sirenT <= 0) { A.sirenT = 3.2; SND.siren && SND.siren(A.pos.clone(), 3.2); noise(A.pos, 45); }
      ambHits(A);
      if (left <= 0.2 || A.stop === cur) { A.state = 'open'; A.openT = 20; A.speed = 0; for (const pt of A.parts) { pt.base ??= pt.o.rotation[pt.axis || 'y']; } A.openK = 0; SND.door('open', A.pos.clone()); A.board = []; if (PEOPLE.ambulanceArrives) PEOPLE.ambulanceArrives(A, PH.chance); think(A.n === 0 ? 'The ambulance! Get in the back — quick!' : 'Another one. Get in!', 3); }
    }
    if (A.state === 'open') {
      A.openK = Math.min(1, A.openK + dt * 2); for (const pt of A.parts) pt.o.rotation[pt.axis || 'y'] = pt.base + pt.a * A.openK;
      A.openT -= dt;
      if (A.openT <= 0) { A.state = 'left'; A.speed = 0; for (const pt of A.parts) pt.o.rotation[pt.axis || 'y'] = pt.base; SND.door('close', A.pos.clone()); }
    }
    if (A.state === 'left') {   // doors shut, it pulls away down the street and out of town, siren going
      const bt = ambBlocked(A);
      A.speed = bt != null ? Math.max(0, Math.min(A.speed - 12 * dt, (bt - 0.6) * 2.5)) : Math.min(16, (A.speed || 0) + 5 * dt);
      A.stuckT = bt != null && A.speed < 0.3 ? (A.stuckT || 0) + dt : 0;
      if (A.axis === 'x') A.pos.x += A.dir * A.speed * dt; else A.pos.z += A.dir * A.speed * dt;
      A.sirenT -= dt; if (A.sirenT <= 0) { A.sirenT = 3.2; SND.siren && SND.siren(A.pos.clone(), 3.2); }
      ambHits(A);
      if (Math.abs(A.axis === 'x' ? A.pos.x : A.pos.z) > 112 || (A.stuckT > 6 && A.pos.distanceTo(P.s.pos) > 40)) { A.g.removeFromParent(); A.g = null; A.state = 'gone'; continue; }
    }
    A.g.position.copy(A.pos); ambDrive(A, dt);
    // a parked ambulance is solid
    if (P.alive && A.state !== 'left') { const dx = P.s.pos.x - A.pos.x, dz = P.s.pos.z - A.pos.z, c = Math.cos(A.g.rotation.y), sn = Math.sin(A.g.rotation.y), lx = dx * c - dz * sn, lz = dx * sn + dz * c; if (Math.abs(lx) < 1.35 && Math.abs(lz) < 3.0) { const px = 1.35 - Math.abs(lx), pz = 3.0 - Math.abs(lz); if (px < pz) { const nl = Math.sign(lx) * 1.35; P.s.pos.x = A.pos.x + nl * c + lz * sn; P.s.pos.z = A.pos.z - nl * sn + lz * c; } else { const nz = Math.sign(lz) * 3.0; P.s.pos.x = A.pos.x + lx * c + nz * sn; P.s.pos.z = A.pos.z - lx * sn + nz * c; } } }
  }
}
// climbing into the back of an open ambulance
function ambulanceBack() { for (const A of AMBS) if (A.state === 'open' && A.g) { const bx = A.pos.x - Math.sin(A.g.rotation.y) * 3.1, bz = A.pos.z - Math.cos(A.g.rotation.y) * 3.1; if (Math.hypot(bx - P.s.pos.x, bz - P.s.pos.z) < 2.0) return A; } return null; }
function boardAmbulance(A) {
  if (A.board.includes(P)) { think('They already looked at me.', 2); return; }
  A.board.push(P); $('fade').classList.add('on'); SND.door('close', A.pos.clone());
  G.inAmb = true; P.s.setVisible(false); if (G.grabbedBy) releaseGrab(false);   // you're inside the van: out of sight, out of reach
  later(() => {
    G.inAmb = false; P.s.setVisible(true);
    const healed = Math.random() < PH.chance;
    if (healed) { P.hp = P.maxHp; G.bleed = 0; G.infection = 0; G.stam = 100; toast('The paramedic patched you up — cleaned, stitched, antibiotics', 'good', 'medkit'); SND.bandage(); }
    else toast('"Sorry — we can\'t do anything for you here." They help you back out.', 'bad');
    $('fade').classList.remove('on');
  }, 2.5);
}

// ---------------------------------------------------------------- the three save slots, and "are you sure?"
function slotLine(r) {
  if (!r) return '<small>Empty</small>';
  const d = r.ckpt, st = (MAPS[r.map || 'maple'] || MAPS.maple).name + ' · ' + (d ? `Chapter ${(d.v2 ? Math.min(d.G.stage, (r.map || 'maple') === MAP_ID ? CHS().length - 1 : 9) : Math.min(d.G.stage, 1)) + 1} · day ${d.G.day}, ${String(Math.floor(d.G.hour)).padStart(2, '0')}:${String(Math.floor((d.G.hour % 1) * 60)).padStart(2, '0')}` : 'no checkpoint yet — starts from the beginning');
  return `<small>${st} · ${(DIFFS[r.diff] || DIFFS.medium).name}<br>${new Date(r.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</small>`;
}
function showSlots(mode, go = null) {
  $('slotTitle').textContent = mode === 'load' ? 'LOAD GAME' : 'CHOOSE A SAVE SLOT';
  $('slotSub').textContent = mode === 'load' ? 'carry on from your last checkpoint' : 'your run is saved here at every checkpoint';
  const draw = () => {
    $('slotList').innerHTML = [0, 1, 2].map(i => { const r = RUN_ON ? readSlot(i) : null; return `<div class="slotrow"><button class="slotcard ${r ? '' : 'empty'}" data-slot="${i}" ${mode === 'load' && !r ? 'disabled' : ''}><span class="sname">SLOT ${i + 1}${r ? ' · ' + r.who.name.toUpperCase() : ''}</span><span class="sinfo">${slotLine(r)}</span></button>${r ? `<button class="m sdel" data-del="${i}" title="Delete">✕</button>` : ''}</div>`; }).join('');
    for (const b of $('slotList').querySelectorAll('[data-slot]')) b.onclick = () => {
      const i = +b.dataset.slot, r = RUN_ON ? readSlot(i) : null;
      if (mode === 'load') { if (r) loadSlot(i, r); return; }
      const use = () => { G.slot = i; G.ckpt = null; go(); };
      if (r) ask('Overwrite this save?', `Slot ${i + 1} has ${r.who.name}'s run in it. Starting a new game here deletes it.`, 'Overwrite', use); else use();
    };
    for (const b of $('slotList').querySelectorAll('[data-del]')) b.onclick = () => { const i = +b.dataset.del; ask('Delete this save?', `Slot ${i + 1} will be emptied. This can't be undone.`, 'Delete', () => { try { localStorage.removeItem(SLOT_KEY(i)); } catch { } showSlots(mode, go); }); };
  };
  draw(); $('slotBack').onclick = () => mode === 'load' ? toTitle() : showWho(go);
  showScreen('saveSlots');
}
async function loadSlot(i, r) {
  if (validMap(r.map || 'maple') !== MAP_ID) { save.map = validMap(r.map || 'maple'); writeSave(); const q = new URLSearchParams(location.search); q.set('map', save.map); q.set('slot', String(i)); location.search = q.toString(); return; }   // another map: build that one first
  G.slot = i; save.diff = r.diff || save.diff;
  G.who = { body: r.who.body, name: r.who.name, job: r.who.job, house: world.houses[r.who.house] || homeHouse() };
  showScreen(null);
  if (r.ckpt) { G.ckpt = r.ckpt; await newGame(r.ckpt); G.ckpt = r.ckpt; }
  else { G.ckpt = null; introThen(newGame); }
}
function ask(title, text, yes, onYes, no = 'Cancel', onNo = null) {
  $('askTitle').textContent = title; $('askText').textContent = text; $('askYes').textContent = yes; $('askNo').textContent = no;
  $('ask').classList.add('show');
  $('askYes').onclick = () => { $('ask').classList.remove('show'); onYes(); };
  $('askNo').onclick = () => { $('ask').classList.remove('show'); if (onNo) onNo(); };
}
function quitAsk() {
  if (G.prevState === 'dead') { timers.length = 0; SND.pause(false); endRun('died'); return; }
  const ck = G.ckpt;
  ask('Quit to the title screen?', ck ? `You'll go back to your last checkpoint — Chapter ${Math.min(ck.G.stage, CHS().length - 1) + 1}, day ${ck.G.day}. Anything you've done since then will be lost.` : `You haven't reached a checkpoint yet. If you quit now you'll start from the beginning next time.`, 'Quit', () => { STATS.commitRun({ how: 'quit', hours: (G.day - 1) * 24 + G.hour - G.startHour }); SND.pause(false); toTitle(); }, 'Keep playing');
}

// ---------------------------------------------------------------- Saturday, before noon
function talkTo(n) {
  const r = PEOPLE.talk(n);
  P.s.lookAt = V(n.s.pos.x, 1.6, n.s.pos.z); G.talkLook = { n, t: 5 };
  n.s.lookAt = V(P.s.pos.x, 1.6, P.s.pos.z); n.lookT = 5;
  P.s.playUp('Interact', { rate: 1.2, fade: 0.15, fadeAt: 0.8 });
  if (r === 'dale' && G.phase === 'calm' && G.prologue < 1) { G.prologue = 1; later(() => { if (G.phase === 'calm') think('Burgers. Now I\'m hungry. I\'ll head home and put the TV on till lunch.', 4); }, 5.5); }
  if (r === 'surv' && !n.gave && Math.random() < 0.6) { n.gave = true; const id = pick(['bandage', 'water', 'bar', 'beans']); addItem(id, 1); later(() => { toast(`${nm(n.name)} gave you: ${ITEMS[id].name}`, 'good', ITEM_ICON[id]); SND.pickup('item'); }, 1.2); later(() => n.say('Here. Take it. I\'ll find more.', 2.5), 5.2); }
}
// kill the time till lunch in front of the TV: the clock jumps to noon
function watchTV() {
  if (G.phase !== 'calm') return;
  think('Nothing on. Golf, a cooking show, a mattress sale...', 3);
  $('fade').classList.add('on');
  later(() => { G.hour = 11.98; world.setTime(G.hour); $('fade').classList.remove('on'); P.s.yaw = G.tvSpot.yaw + (G.home.flip > 0 ? 0 : 0); }, 1.4);
}
// ---------------------------------------------------------------- noon: the broadcast
const ANCHOR = [
  [4.6, 'We interrupt this program with breaking news out of Maple Hollow.'],
  [9.0, 'A man has collapsed outside the Quick Stop market on Main Street after eating a hamburger from the store\'s grill.'],
  [13.6, 'County health officials say the meat was contaminated with a mixture of radium and carbon dioxide. They do not yet know how.'],
  [18.2, 'Witnesses say the man is "behaving strangely." We go live to the scene.'],
];
const REPORTER = [
  [23.0, 'REPORTER: ...I\'m outside the Quick Stop, where just minutes ago — wait. He\'s on the ground. Somebody\'s helping him —'],
  [28.0, 'REPORTER: He\'s getting up. Sir? Sir, are you — OH MY GOD. HE BIT HIM. HE BIT HIM!'],
  [32.5, 'REPORTER: Get back! Everybody get back! Danny, keep rolling — DANNY —'],
];
function startNews() {
  if (G.phase !== 'calm') return;
  const store = world.houses.find(h => h.store);
  const near = Math.hypot(P.s.pos.x - store.x, P.s.pos.z - (store.z + 9)) < 40 && !Q.has('skipcalm');
  G.phase = 'news'; G.hour = Math.max(G.hour, 12); world.setTime(G.hour);
  const atTV = G.tvSpot && G.inside === G.home && Math.hypot(P.s.pos.x - G.tvSpot.x, P.s.pos.z - G.tvSpot.z) < 8;
  G.news = { t: 0, tv: atTV && !near && !Q.has('phonenews') || Q.has('skipcalm'), phone: !atTV && !near, beat: 0, line: -1, rline: -1, live: false, dropT: -1, lost: -1, ended: false, cam: { pos: V(11.6, 1.62, 5.8), look: V(21.2, 1.15, -8.6) }, shake: V(), charger: null };
  SND.eas(9); SND.phoneBuzz(); SND.setPeace(0);
  if (G.search) cancelSearch();
  PEOPLE.outbreakBegins();
  PEOPLE.PPL.fast = 0.45; PEOPLE.PPL.marketOn = true; C.feedK = 0.35;
  // Dale hears it too. Linda's at the Quick Stop.
  const dale = PEOPLE.PPL.cast.dale;
  if (dale && dale.alive) { if (dale.s.act) dale.s.stopAct(0.3); dale.st = 'runto'; dale.goal = { x: 9, z: -5.2 }; dale.say('LINDA\'S AT THE QUICK STOP!', 3); }
  if (G.news.tv) {
    G.state = 'news'; keys.clear(); G.mouse.left = G.mouse.right = false;
    document.body.classList.add('tvmode');
    $('tvStudio').classList.add('on', 'eas'); $('tvLive').classList.remove('on'); $('tvLost').classList.remove('on');
    $('tvText').innerHTML = 'THE FOLLOWING MESSAGE IS TRANSMITTED AT THE REQUEST OF THE MAPLE COUNTY HEALTH DEPARTMENT.<br><b>THIS IS NOT A TEST.</b>';
    $('tvHead').textContent = 'EMERGENCY ALERT SYSTEM';
    showScreen('tv'); $('tv').classList.add('inroom'); tvSetup();
  } else if (G.news.phone) {
    later(() => toast('EMERGENCY ALERT · Maple County Health Dept · Remain indoors', 'bad', 'note'), 0.4);
    later(() => think('Every phone on the street goes off at once.', 3.5), 1);
  } else {
    later(() => think('Every phone on the street goes off at once. ...Gary? What\'s wrong with Gary?', 4.5), 1);
  }
}
function newsStep(dt) {
  const N = G.news; if (!N || N.ended) return;
  N.t += dt; const t = N.t;
  const C2 = PEOPLE.PPL.cast;
  // what happens outside the Quick Stop (on camera or not)
  const beats = [[6, 'sick'], [19.5, 'help'], [22.5, 'fall'], [26.5, 'turn']];
  while (N.beat < beats.length && t >= beats[N.beat][0]) { PEOPLE.marketBeat(beats[N.beat][1]); N.beat++; }
  if (t > 30 && !N.charger) {   // one of them comes for the camera crew
    let best = null, bd = 1e9; for (const z of Z.list) { if (!z.active || !z.alive || z.z.state === 'feed') continue; const d = z.s.pos.distanceTo(N.cam.pos); if (d < bd) { bd = d; best = z; } }
    if (best) { N.charger = best; best.z.state = 'investigate'; best.z.goal = N.cam.pos.clone(); best.z.t = 30; best.runner = true; best.runSpeed = 3.8; }
  }
  if (N.charger && N.charger.alive && N.charger.z.state !== 'chase') { N.charger.z.state = 'investigate'; N.charger.z.goal = N.cam.pos.clone(); N.charger.z.t = 30; }
  if (!N.tv) {   // you were there — or you're reading it on your phone
    if (N.phone) for (let i = ANCHOR.length - 1; i >= 0; i--) if (t >= ANCHOR[i][0] + 1) { if (N.line !== i) { N.line = i; think('📱 WMHX 7: ' + ANCHOR[i][1], 4.4); SND.phoneBuzz(); } break; }
    if (t > 34) endNews(false);
    return;
  }
  // the broadcast itself
  if (t >= 4.4 && !N.studio) { N.studio = true; $('tvStudio').classList.remove('eas'); $('tvHead').textContent = 'BREAKING NEWS'; SND.newsSting(); }
  for (let i = ANCHOR.length - 1; i >= 0; i--) if (t >= ANCHOR[i][0]) { if (N.line !== i) { N.line = i; $('tvText').textContent = ANCHOR[i][1]; SND.tvVoice(4.2); } break; }
  if (t >= 22 && !N.live) { N.live = true; $('tvStudio').classList.remove('on'); $('tvLive').classList.add('on'); SND.tvStop && SND.tvStop(); SND.tvScene && SND.tvScene('crowd'); }
  for (let i = REPORTER.length - 1; i >= 0; i--) if (t >= REPORTER[i][0]) { if (N.rline !== i) { N.rline = i; $('tvCap').textContent = REPORTER[i][1]; if (i === 1) SND.tvScene && SND.tvScene('omg'); if (i === 2 && !N.panicSnd) { N.panicSnd = true; SND.tvScene && SND.tvScene('panic'); } } break; }
  if (N.live && !N.panicSnd && N.charger && N.charger.alive && N.charger.s.pos.distanceTo(N.cam.pos) < 9) { N.panicSnd = true; SND.tvScene && SND.tvScene('panic'); }
  if (N.live) { const d = new Date(0, 0, 0, 12, Math.floor((t - 22) / 60)); $('tvClock').textContent = `12:${String(d.getMinutes()).padStart(2, '0')} PM`; }
  // the camera goes down
  if (N.dropT < 0 && N.live && ((N.charger && N.charger.alive && N.charger.s.pos.distanceTo(N.cam.pos) < 2.6) || t > 40)) { N.dropT = 0; SND.tvScene ? SND.tvScene('scream') : SND.zombie('scream', N.cam.pos); C.shake = 0.8; }
  if (N.dropT >= 0) {
    N.dropT += dt;
    if (N.dropT > 1.1 && N.lost < 0) { N.lost = 0; $('tvLive').classList.remove('on'); $('tvLost').classList.add('on'); SND.tvStop && SND.tvStop(); SND.staticBurst(2.2); }
  }
  if (N.lost >= 0) {
    N.lost += dt;
    if (N.lost > 2.2 && !N.back) { N.back = true; $('tvLost').classList.remove('on'); $('tvStudio').classList.add('on'); $('tvHead').textContent = 'BREAKING NEWS'; $('tvText').innerHTML = '...We seem to have lost our signal from Main Street.<br>If you are in Maple Hollow: <b>stay inside. Lock your doors. Do not approach anyone who appears ill.</b>'; SND.tvVoice(5); }
    if (N.lost > 8.5) endNews(false);
  }
}
// noon is over. It's begun.
function endNews(skipped, quiet = false) {
  const N = G.news; if (!N || N.ended) return;
  N.ended = true;
  SND.tvStop && SND.tvStop();
  while (N.beat < 4) { PEOPLE.marketBeat(['sick', 'help', 'fall', 'turn'][N.beat]); N.beat++; }
  PEOPLE.marketAftermath();
  if (!DIFF.allRun) for (const u of Z.list) if (u.turned && u.runner && !(DIFF.runners > 0.9)) { u.runner = false; u.runSpeed = u.walkSpeed * rnd(1.25, 1.45); }
  PEOPLE.PPL.fast = 1; PEOPLE.PPL.marketOn = false; C.feedK = 1;
  const C2 = PEOPLE.PPL.cast;
  // Jesse and Morgan got clear
  const spot = (x, z) => world.walkable(x, z) ? [x, z] : [x + 1, z];
  if (C2.jesse && C2.jesse.alive && (skipped || C2.jesse.role !== 'surv')) PEOPLE.becomeSurvivor(C2.jesse, ...spot(62, -5.2));
  if (C2.morgan && C2.morgan.alive && (skipped || C2.morgan.role !== 'surv')) PEOPLE.becomeSurvivor(C2.morgan, ...spot(-5.3, -52));
  // Dale went in after Linda. He found her.
  const dale = C2.dale, store = world.houses.find(h => h.store);
  if (dale && !dale.zu) { dale.gone = false; dale.alive = true; dale.downAt = 0; dale.s.resetActs(); dale.s.place(store.inside[1][0], store.inside[1][1], rnd(-3, 3)); const z = PEOPLE.turnNPC(dale, { standing: true, state: 'idle' }); if (z) { z.maxHp = z.hp = 110; z.z.indoor = true; } }
  G.phase = 'outbreak'; G.obT = G.t; G.survT = 0;
  if (G.state === 'news') {
    G.state = 'play'; showScreen(null); document.body.classList.remove('tvmode'); $('tv').classList.remove('inroom'); camInit = false; if (TVS) { TVS.group.visible = false; TVS.light.intensity = 0; }
    $('tvLive').classList.remove('on'); $('tvLost').classList.remove('on'); $('tvStudio').classList.remove('on');
  }
  SND.musicPlaying(true); if (quiet) return; SND.sting('spotted');
  later(() => bigText('CHAPTER 1', `${CHAPTERS[0].title} · ${DIFF.name}`, 4), 0.6); later(checkpoint, 5);
  later(() => think(N.tv ? 'That\'s the Quick Stop. That\'s three blocks from here. ...Lock the door. Find out what\'s going on.' : N.phone ? 'The Quick Stop. Three blocks from here. ...I need to get home. Now.' : 'Gary... bit Raj. Raj is getting up. I have to get out of here — home. Now.', 5), 3.2);
}
// the afternoon: the town comes apart (out of your sight), other survivors appear
function outbreakStep(dt) {
  G.revealT -= dt;
  if (G.revealT <= 0) { G.revealT = 0.6; const k = clamp((G.t - G.obT) / (HOUR * 3.2), 0, 1); const cf = V(); camera.getWorldDirection(cf); world.revealChaos(k, camera.position, cf); }
  // somebody else who's still alive comes out of hiding now and then
  G.survT += dt;
  if (G.recruits < 3 && G.survT > HOUR * (1.2 + G.recruits * 1.6)) {
    G.survT = 0;
    const alive = PEOPLE.PPL.list.filter(u => u.role === 'surv' && u.alive && !u.gone).length;
    if (alive < 4) { for (let k = 0; k < 20; k++) { const a = Math.random() * 6.28, r = rnd(35, 60), x = clamp(P.s.pos.x + Math.cos(a) * r, -100, 100), z = clamp(P.s.pos.z + Math.sin(a) * r, -100, 100); if (!world.walkable(x, z) || world.los(camera.position, V(x, 1.5, z))) continue; if (PEOPLE.emerge(x, z)) { G.recruits++; } break; } }
  }
}
// ---------------------------------------------------------------- what people say, drawn over their heads
function drawBubbles() {
  if (save.bubbles === false) return;
  if (G.state === 'news' && G.news && G.news.tv) return;   // in your living room: the TV has the captions, not the walls
  const dpr = ODPR(), W = ov.width, H = ov.height, m = 6 * dpr, placed = [];
  const list = PEOPLE.bubbles().map(u => [u, u.s.pos.distanceTo(camera.position)]).sort((a, b) => a[1] - b[1]);   // nearest first: they get the spot over their head
  for (const [u, d] of list) {
    if (d > (G.state === 'news' ? 40 : 22)) continue;
    const p = V(u.s.pos.x, 2.05, u.s.pos.z).project(camera); if (p.z > 1 || Math.abs(p.x) > 1 || Math.abs(p.y) > 1.1) continue;
    if (G.state !== 'news' && !world.los(camera.position, V(u.s.pos.x, 1.7, u.s.pos.z))) continue;
    const x = (p.x * 0.5 + 0.5) * W, y = (-p.y * 0.5 + 0.5) * H, a = Math.min(1, u.bubble.t * 2) * clamp(1.4 - d / 22, 0.45, 1);
    const maxL = Math.min(260 * dpr, W - 2 * m - 18 * dpr);
    octx.font = `${14 * dpr}px 'Special Elite', 'Courier New', monospace`;
    const words = u.bubble.text.split(' '), lines = []; let ln = '';
    for (const w of words) { const tt = ln ? ln + ' ' + w : w; if (octx.measureText(tt).width > maxL && ln) { lines.push(ln); ln = w; } else ln = tt; }
    if (ln) lines.push(ln);
    const lw = Math.max(...lines.map(l => octx.measureText(l).width)), pad = 9 * dpr, lh = 18 * dpr, nm = u.name ? u.name : '';
    let nmW = 0; if (nm) { octx.font = `600 ${10 * dpr}px Oswald, Helvetica`; nmW = octx.measureText(nm).width; octx.font = `${14 * dpr}px 'Special Elite', 'Courier New', monospace`; }
    const bw = Math.max(lw, nmW) + pad * 2, bh = lines.length * lh + pad * 2 + (nm ? 14 * dpr : 0);
    const bx = clamp(x - bw / 2, m, Math.max(m, W - bw - m)); let by = y - bh - 12 * dpr;
    // two people talking at once: the further one's bubble steps up out of the way (a thin line back to them)
    for (let k = 0; k < 6; k++) { const o = placed.find(r => bx < r.x + r.w && bx + bw > r.x && by < r.y + r.h && by + bh > r.y); if (!o) break; by = o.y - bh - 6 * dpr; }
    by = Math.max(m, by); placed.push({ x: bx, y: by, w: bw, h: bh });
    const lifted = by + bh < y - 14 * dpr, tx = clamp(x, bx + 10 * dpr, bx + bw - 10 * dpr), tb = by + bh;
    octx.globalAlpha = a;
    octx.fillStyle = 'rgba(14,12,10,0.82)'; octx.strokeStyle = u.role === 'surv' ? 'rgba(220,180,90,0.8)' : 'rgba(232,228,218,0.35)'; octx.lineWidth = 1 * dpr;
    if (lifted) { octx.beginPath(); octx.moveTo(tx, tb); octx.lineTo(x, y - 4 * dpr); octx.stroke(); }
    octx.beginPath(); octx.moveTo(bx, by); octx.lineTo(bx + bw, by); octx.lineTo(bx + bw, tb); octx.lineTo(tx + 7 * dpr, tb); octx.lineTo(tx, tb + 8 * dpr); octx.lineTo(tx - 7 * dpr, tb); octx.lineTo(bx, tb); octx.closePath(); octx.fill(); octx.stroke();
    octx.textAlign = 'left'; let ty = by + pad + 13 * dpr;
    if (nm) { octx.font = `600 ${10 * dpr}px Oswald, Helvetica`; octx.fillStyle = u.role === 'surv' ? '#e0b860' : '#a8a296'; octx.fillText(nm, bx + pad, ty - 2 * dpr); ty += 14 * dpr; octx.font = `${14 * dpr}px 'Special Elite', 'Courier New', monospace`; }
    octx.fillStyle = '#ece6da'; for (const l of lines) { octx.fillText(l, bx + pad, ty); ty += lh; }
    octx.globalAlpha = 1;
  }
}
// the news camera: across Main St from the Quick Stop, handheld
function newsCamera(dt) {
  const N = G.news, c = N.cam, t = G.t;
  const sh = 0.012 + (N.t > 27 ? 0.03 : 0);
  N.shake.set(Math.sin(t * 1.3) * sh + Math.sin(t * 4.7) * sh * 0.4, Math.sin(t * 1.7 + 1) * sh * 0.7, 0);
  camera.position.copy(c.pos);
  const look = c.look.clone();
  if (N.charger && N.charger.alive && N.t > 30) look.lerp(V(N.charger.s.pos.x, 1.3, N.charger.s.pos.z), clamp((N.t - 30) / 3, 0, 0.8));
  camera.lookAt(look);
  camera.rotateX(N.shake.y); camera.rotateY(N.shake.x);
  if (N.dropT >= 0) { const k = clamp(N.dropT / 0.8, 0, 1); camera.position.y = lerp(c.pos.y, 0.25, k * k); camera.rotateZ(k * 1.35); camera.rotateX(-k * 0.9); }
  const fov = 38; if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); fovNow = fov; }
  PSCALE.value = innerHeight * renderer.getPixelRatio() / (2 * Math.tan(camera.fov * Math.PI / 360));
  world.update(dt, G.t, c.pos, null);
  SND.listener(c.pos.x, c.pos.y, c.pos.z, Math.atan2(c.look.x - c.pos.x, c.look.z - c.pos.z) + Math.PI);
  SND.setIndoor(0); SND.setNight(world.night); SND.setRain(world.rain || 0);
}

// ---------------------------------------------------------------- the broadcast on the TV in your living room
// the live pictures are rendered from the news crew's camera onto the actual TV screen; the station's graphics
// are drawn on top of them; you watch it over your own shoulder
let TVS = null;
const newsCam = new THREE.PerspectiveCamera(38, 16 / 9, 0.05, 1500);
function tvSetup() {
  const H = G.home; if (TVS && TVS.house === H) { TVS.group.visible = true; return TVS; }
  if (TVS) { TVS.group.removeFromParent(); TVS.rt.dispose(); }
  const c = Math.cos(H.yaw), sn = Math.sin(H.yaw), P0 = (lx, lz) => [H.x + lx * H.flip * c + lz * sn, H.z - lx * H.flip * sn + lz * c];
  const [sx, sz] = P0(-0.637, 2.6), [fx, fz] = P0(-1.637, 2.6);
  const group = new THREE.Group(); group.position.set(sx, 1.025, sz); group.rotation.y = Math.atan2(fx - sx, fz - sz); scene.add(group);
  const rt = new THREE.WebGLRenderTarget(640, 360);
  const live = new THREE.Mesh(new THREE.PlaneGeometry(1.17, 0.64), new THREE.MeshBasicMaterial({ map: rt.texture, toneMapped: false })); group.add(live);
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 576; const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const over = new THREE.Mesh(new THREE.PlaneGeometry(1.17, 0.64), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false })); over.position.z = 0.002; group.add(over);
  const light = new THREE.PointLight(0x9ab8ff, 0, 5, 2); light.position.set(0, -0.2, 1.2); group.add(light);
  const [vx, vz] = P0(-2.3, 2.7), [px, pz] = P0(-2.55, 3.85);
  TVS = { house: H, group, rt, live, cv, ctx: cv.getContext('2d'), tex, light, center: V(sx, 1.0, sz), view: V(vx, 1.3, vz), stand: [px, pz], drawT: 0 };
  P.s.place(px, pz, Math.atan2(sx - px, sz - pz)); P.s.resetActs();
  return TVS;
}
function wrapText(g, text, x, y, maxW, lh) { let ln = '', yy = y; for (const w of text.split(' ')) { const t2 = ln ? ln + ' ' + w : w; if (g.measureText(t2).width > maxW && ln) { g.fillText(ln, x, yy); ln = w; yy += lh; } else ln = t2; } if (ln) g.fillText(ln, x, yy); }
// shrink the font until the line fits (returns the size it settled on); fitWrap does the same for a wrapped block in a box
function fitText(g, s, maxW, px, weight = '', fam = 'Helvetica') { for (; ; px -= 2) { g.font = `${weight ? weight + ' ' : ''}${px}px ${fam}`; if (px <= 12 || g.measureText(s).width <= maxW) return px; } }
function fitWrap(g, s, x, y, maxW, maxH, px, weight = '', fam = 'Helvetica') {
  for (; ; px -= 2) { g.font = `${weight ? weight + ' ' : ''}${px}px ${fam}`; const lh = Math.round(px * 1.35); let n = 1, ln = ''; for (const w of s.split(' ')) { const t2 = ln ? ln + ' ' + w : w; if (g.measureText(t2).width > maxW && ln) { n++; ln = w; } else ln = t2; } if (px <= 14 || n * lh <= maxH) return wrapText(g, s, x, y, maxW, lh); }
}
// the TV's words as plain text: <br> is a gap between sentences, not nothing
const tvPlain = () => { const h = $('tvText').innerHTML; if (tvPlain.h === h) return tvPlain.v; const t = document.createElement('textarea'); t.innerHTML = h.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ''); tvPlain.h = h; return (tvPlain.v = t.value.replace(/\s+/g, ' ').trim()); };
function tvDraw() {
  const T = TVS, g = T.ctx, W2 = 1024, H2 = 576;
  const mode = $('tvLost').classList.contains('on') ? 'lost' : $('tvLive').classList.contains('on') ? 'live' : $('tvStudio').classList.contains('eas') ? 'eas' : 'studio';
  g.clearRect(0, 0, W2, H2);
  if (mode === 'lost') { const id = g.createImageData(W2 / 4, H2 / 4); for (let i = 0; i < id.data.length; i += 4) { const v = Math.random() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; } g.putImageData(id, 0, 0); g.drawImage(T.cv, 0, 0, W2 / 4, H2 / 4, 0, 0, W2, H2); g.fillStyle = '#000'; g.fillRect(W2 / 2 - 230, H2 / 2 - 50, 460, 100); g.fillStyle = '#eee'; g.font = 'bold 64px Helvetica'; g.textAlign = 'center'; g.fillText('SIGNAL LOST', W2 / 2, H2 / 2 + 22); T.light.intensity = 0.6 + Math.random() * 0.6; return mode; }
  if (mode !== 'live') {
    const gr = g.createLinearGradient(0, 0, W2, H2); gr.addColorStop(0, mode === 'eas' ? '#111' : '#1d3f7a'); gr.addColorStop(1, mode === 'eas' ? '#050505' : '#060d1c'); g.fillStyle = gr; g.fillRect(0, 0, W2, H2);
    const head = $('tvHead').textContent; g.textAlign = 'left'; const hp = fitText(g, head, W2 - 120 - 48, 66, 'bold', 'Helvetica'), hw = Math.min(W2 - 120, g.measureText(head).width + 48);
    g.fillStyle = mode === 'eas' ? '#e6c21a' : '#c8161a'; g.fillRect(60, 80, hw, 96);
    g.fillStyle = mode === 'eas' ? '#111' : '#fff'; g.fillText(head, 84, 128 + hp * 0.36);
    g.fillStyle = '#eef2fa'; fitWrap(g, tvPlain(), 64, 260, 900, mode === 'eas' ? H2 - 290 : 468 - 250, 34, mode === 'eas' ? '' : 'bold', mode === 'eas' ? 'Courier New' : 'Helvetica');
  } else {
    g.fillStyle = '#d4161a'; g.fillRect(820, 36, 92, 40); g.fillStyle = '#fff'; g.font = 'bold 30px Helvetica'; g.textAlign = 'left'; g.fillText('LIVE', 832, 67); g.fillText($('tvClock').textContent, 920, 67);
    const cap = $('tvCap').textContent; if (cap) { g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(80, 360, 864, 80); g.fillStyle = '#fff'; g.font = '26px Helvetica'; g.textAlign = 'center'; wrapText(g, cap, W2 / 2, 392, 820, 32); }
  }
  // the station's bug and lower third, always on
  g.textAlign = 'left'; g.fillStyle = '#c8161a'; g.beginPath(); g.arc(70, 60, 26, 0, 7); g.fill(); g.fillStyle = '#fff'; g.font = 'bold 30px Helvetica'; g.fillText('7', 61, 71); g.font = 'bold 22px Helvetica'; g.fillText('WMHX NEWS', 106, 68);
  if (mode !== 'eas') { g.fillStyle = '#c8161a'; g.fillRect(40, 468, 200, 62); g.fillStyle = '#f2f0ea'; g.fillRect(240, 468, 744, 62); g.fillStyle = '#fff'; fitText(g, 'BREAKING', 200 - 28, 30, 'bold', 'Helvetica'); g.fillText('BREAKING', 54, 510); g.fillStyle = '#8a1810'; fitText(g, 'MAPLE HOLLOW · QUICK STOP MARKET, MAIN ST', 744 - 32, 14, 'bold', 'Helvetica'); g.fillText('MAPLE HOLLOW · QUICK STOP MARKET, MAIN ST', 256, 488); g.fillStyle = '#121212'; fitText(g, 'MAN FALLS ILL AFTER EATING CONTAMINATED BURGER', 744 - 32, 26, 'bold', 'Helvetica'); g.fillText('MAN FALLS ILL AFTER EATING CONTAMINATED BURGER', 256, 520); }
  T.light.intensity = mode === 'live' ? 1.2 : 1.6;
  return mode;
}
function tvRoomCamera(dt) {
  const N = G.news, T = TVS || tvSetup(), c = N.cam, t = G.t;
  // the crew's camera (handheld, then knocked down) renders onto the screen
  const sh = 0.012 + (N.t > 27 ? 0.03 : 0);
  N.shake.set(Math.sin(t * 1.3) * sh + Math.sin(t * 4.7) * sh * 0.4, Math.sin(t * 1.7 + 1) * sh * 0.7, 0);
  newsCam.position.copy(c.pos);
  const look = c.look.clone();
  if (N.charger && N.charger.alive && N.t > 30) look.lerp(V(N.charger.s.pos.x, 1.3, N.charger.s.pos.z), clamp((N.t - 30) / 3, 0, 0.8));
  newsCam.lookAt(look); newsCam.rotateX(N.shake.y); newsCam.rotateY(N.shake.x);
  if (N.dropT >= 0) { const k = clamp(N.dropT / 0.8, 0, 1); newsCam.position.y = lerp(c.pos.y, 0.25, k * k); newsCam.rotateZ(k * 1.35); newsCam.rotateX(-k * 0.9); }
  newsCam.updateMatrixWorld();
  T.drawT -= dt; let mode = T.mode;
  if (T.drawT <= 0) { T.drawT = 1 / 15; mode = T.mode = tvDraw(); T.tex.needsUpdate = true; }
  T.live.visible = mode === 'live';
  if (mode === 'live') { T.group.visible = false; renderer.setRenderTarget(T.rt); renderer.render(scene, newsCam); renderer.setRenderTarget(null); T.group.visible = true; }
  // you, watching it
  camera.position.copy(T.view); camera.lookAt(T.center);
  if (camera.fov !== 42) { camera.fov = 42; camera.updateProjectionMatrix(); fovNow = 42; }
  { const sub = $('tvSub'); if (sub) { const tx = mode === 'live' ? $('tvCap').textContent : mode === 'lost' ? '' : tvPlain(); if (sub.textContent !== tx) sub.textContent = tx; } }
  PSCALE.value = innerHeight * renderer.getPixelRatio() / (2 * Math.tan(camera.fov * Math.PI / 360));
  world.update(dt, G.t, P.s.pos, G.home);
  SND.listener(T.view.x, T.view.y, T.view.z, Math.atan2(T.center.x - T.view.x, T.center.z - T.view.z) + Math.PI);
  SND.setIndoor(1); SND.setNight(world.night); SND.setRain(world.rain || 0);
}

// the way out
function startEscape() {
  G.state = 'escaping'; G.escT = 0;
  P.s.vel.set(0, 0, 0);
  P.s.play('Fixing_Kneeling', { loop: true, fade: 0.3 });
  think('Come on, come on...', 3);
  noise(P.s.pos, 45);
  SND.rummage('car', 3, null);
  later(() => { SND.engine('crank'); noise(P.s.pos, 60); }, 3.2);
  later(() => { SND.engine('crank'); }, 4.6);
  later(() => { SND.engine('start'); think('YES!', 2); noise(P.s.pos, 90); P.s.setVisible(false); MEL.hideAll(); P.arms.hideAll(); G.driving = { t: 0 }; }, 6.0);
  later(() => $('fade').classList.add('on'), 10.5);
  later(() => endRun('escaped'), 13.2);
}
function updateEscape(dt) {
  G.escT += dt;
  if (G.driving) {
    // the truck pulls out of the driveway and drives off down Main St, east — steered like a real car from wherever it
    // actually stands (pure pursuit of a point in the eastbound lane ahead; it can only turn as it rolls), wheels turning
    const T = world.truck; G.driving.t += dt; const t = G.driving.t, D = G.driving, WB = 3.1;
    if (!D.live) { D.live = T.g.userData.live || (T.g.userData.wheelMeshes ? makeDrivable(T.g, T.type || 'pickup') : null); D.v = 0; D.steer = 0; }
    const gp = T.g.position, yaw = T.g.rotation.y, tx = gp.x + 9, tz = 2.2;
    const alpha = wrapPi(Math.atan2(tx - gp.x, tz - gp.z) - yaw), Ld = Math.hypot(tx - gp.x, tz - gp.z);
    const steerW = clamp(Math.atan2(2 * WB * Math.sin(alpha), Ld), -0.6, 0.6);
    D.steer = damp(D.steer, steerW, 4, dt);
    const vW = Math.min(16, 0.8 + t * 3.2) * (Math.abs(D.steer) > 0.25 ? 0.4 : 1);
    D.v = vW > D.v ? Math.min(vW, D.v + 4.5 * dt) : Math.max(vW, D.v - 6 * dt);
    T.g.rotation.y = yaw + D.v / WB * Math.tan(D.steer) * dt;
    gp.x += Math.sin(T.g.rotation.y) * D.v * dt; gp.z += Math.cos(T.g.rotation.y) * D.v * dt;
    if (D.live) { for (const w of D.live.wheels) { w.spin.rotation.x += D.v * dt / D.live.r; if (w.front) w.hub.rotation.y = D.steer; } if (D.live.body) D.live.body.rotation.x = damp(D.live.body.rotation.x, -clamp((vW - D.v) * 0.004, -0.03, 0.03), 6, dt); }
    if (!G.driving.crash && T.g.position.x > 103) { G.driving.crash = true; SND.door('break', V(105, 1, 2)); SND.glass(V(105, 1, 2), 1); C.shake = 0.6; }
    T.box.off = true;
  }
}

// ---------------------------------------------------------------- the horde
function focusPos() { return G.state === 'news' && G.news && G.news.tv ? G.news.cam.pos : P.s.pos; }
function zombiesStep(dt) {
  const near = [], camF = V(); camera.getWorldDirection(camF);
  const F = focusPos();
  const crowd = Z.list.length > 40, heliDown = HELI.state() === 'landed' || HELI.state() === 'descend';
  let chasing = 0, closeN = 0;
  for (const u of Z.list) {
    if (!u.active) continue;
    const S = u.s, d = S.pos.distanceTo(F);
    if (!u.alive) {
      u.deadT += dt;
      if (u.deadT < 6) { S.update(dt, {}); world.collide(S.pos, 0.3); }
      continue;
    }
    // far ones think and move less often
    // far ones think and move less often — much less when the streets are packed
    const crowd = Z.list.length > 40;
    u.lod = MP.on() && MP.nearDist(S.pos, P) < 22 ? 1 : MOB ? (crowd ? (d > 45 ? 5 : d > 28 ? 3 : d > 14 ? 2 : 1) : (d > 45 ? 3 : d > 25 ? 2 : 1)) : crowd ? (d > 70 ? 5 : d > 45 ? 3 : d > 22 ? 2 : 1) : (d > 70 ? 3 : d > 45 ? 2 : 1);
    // only the near ones cast shadows (a shadow pass per body adds up fast)
    const sh = d < (crowd ? 18 : 30);
    if (u.shadowOn !== sh) { u.shadowOn = sh; u.s.root.traverse(o => { if (o.isMesh) o.castShadow = sh; }); }
    u.lodN = ((u.lodN || 0) + 1) % u.lod;
    if (u.z.lying && S.pos.distanceTo(P.s.pos) < 7) { u.z.lying = false; u.z.down = rnd(0.2, 1.2); u.z.state = 'chase'; u.z.seen = C.t; u.z.lastSeen.copy(P.s.pos); }
    // don't draw the ones behind you or lost in the fog (they still walk and think)
    { const tx = S.pos.x - camera.position.x, tz = S.pos.z - camera.position.z, tl = Math.hypot(tx, tz) || 1;
      const ahead = (tx * camF.x + tz * camF.z) / tl > -0.35;
      const show = G.noCull || d < 5 || (ahead && d < (crowd ? 75 : 110));
      if (S.visible !== show) S.setVisible(show); }
    // only the thinking is throttled for far ones; every body moves and animates every frame (no 12-30 fps stutter)
    let cmd;
    if (u.lodN === 0 || !u.lastCmd) { cmd = zombieThink(u, dt * u.lod, MP.target(u, P), G); u.lastCmd = cmd; }
    else { cmd = Object.assign({}, u.lastCmd); cmd.jump = false; }
    cmd = Object.assign({}, cmd);
    if (u.burn > 0) { u.burn -= dt; if (Math.random() < 0.7 * Math.min(1, dt * 60 / u.lod)) fx.fire(V(S.pos.x, 0.9 + Math.random() * 0.6, S.pos.z), 1); if (Math.random() < dt * 3) damage(u, 6, P, { fire: true }); if (cmd.move != null) cmd.speed *= 1.3; }
    if (G.grabbedBy === u) { cmd.move = null; }
    cmd.aimYaw = S.yaw; cmd.combat = 0;
    const ox = S.pos.x, oz = S.pos.z; u._ox = ox; u._oz = oz; u._mv = true;
    S.update(dt, cmd);
    if (u.giant) BOSS.giantCollide(u); else world.collide(S.pos, 0.3);   // [boss] The Zombie steps over fences and cars
    if (heliDown && HELI.blocks(S.pos.x, S.pos.z, 0.3) && !HELI.blocks(ox, oz, 0.3)) { S.pos.x = ox; S.pos.z = oz; }
    if (u.alive && S.visible && d < (MOB ? (crowd ? 14 : 24) : (crowd ? 26 : 45))) zombiePose(u, u.z.tgt && u.z.tgt.alive ? u.z.tgt : P, dt);
    if (u.z.state === 'chase') { chasing++; if (d < 10) closeN++; }
    if (d < 12) near.push(u);
  }
  separate();
  for (const u of Z.list) if (u.active && u.alive) {
    const S = u.s;
    if (u.giant) BOSS.giantCollide(u);   // [boss]
    else {
    if (S.pos.distanceTo(F) < 30) { world.collide(S.pos, 0.3 * Math.min(2.6, u.sizeK || 1)); DRIVE.pushBodies(S.pos, 0.3 * Math.min(2.6, u.sizeK || 1)); }   // [boss] (capped)
    world.keepSide(u.safe ||= { x: S.pos.x, z: S.pos.z, set: true }, S.pos);
    }   // [boss]
    // pressed into a wall or the crowd: the stride follows how far the body really went (no treadmill / moonwalk)
    if (u._mv && dt > 0 && G.grabbedBy !== u && !(u.z.down > 0)) {
      const ax = (S.pos.x - u._ox) / dt, az = (S.pos.z - u._oz) / dt;
      if (ax * ax + az * az < 100) { S.vel.x = 0.5 * S.vel.x + 0.5 * ax; S.vel.z = 0.5 * S.vel.z + 0.5 * az; S.speed = Math.hypot(S.vel.x, S.vel.z); }
    }
    u._mv = false;
    refreshHitShapes(u);   // after every push: shots test the body you see
  }
  if (P.alive && !G.vault && !DRIVE.active()) { world.collide(P.s.pos, 0.33); DRIVE.pushBodies(P.s.pos, 0.33); world.keepSide(G.safe ||= { x: P.s.pos.x, z: P.s.pos.z, set: true }, P.s.pos); }
  else if (G.vault) G.safe = null;
  G.chasing = chasing; G.closeN = closeN;
}
// MP: on a client the dead are the host's (puppets, moved by net.js); you still bump into them and the walls
function clientZombies(dt) {
  MP.NETMOD.zombiesStep(dt); separate();
  if (P.alive && !G.vault && !DRIVE.active()) { world.collide(P.s.pos, 0.33); DRIVE.pushBodies(P.s.pos, 0.33); world.keepSide(G.safe ||= { x: P.s.pos.x, z: P.s.pos.z, set: true }, P.s.pos); }
  else if (G.vault) G.safe = null;
}
// bodies never overlap, out to the draw distance: a 2 m spatial hash, each pair tested once
const sepHash = new Map();
function separate() {
  const F = focusPos(), R0 = Z.list.length > 40 ? 75 : 110;
  const list = Z.list.filter(u => u.active && u.alive && u.z.down <= 0 && u.s.pos.distanceTo(F) < R0);
  for (const n of C.npcs || []) if (n.alive && !n.gone && n.s.pos.distanceTo(F) < R0) list.push(n);
  if (P.alive && !G.vault && !G.inAmb) list.push(P);
  sepHash.clear();
  const key = (cx, cz) => (cx + 2048) * 4096 + (cz + 2048);
  for (let i = 0; i < list.length; i++) { const p = list[i].s.pos, k = key(Math.floor(p.x / 2), Math.floor(p.z / 2)); let b = sepHash.get(k); if (!b) sepHash.set(k, b = []); b.push(i); }
  for (let i = 0; i < list.length; i++) {
    const a = list[i].s.pos, cx = Math.floor(a.x / 2), cz = Math.floor(a.z / 2);
    for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
      const bucket = sepHash.get(key(cx + ox, cz + oz)); if (!bucket) continue;
      for (const j of bucket) {
        if (j <= i) continue;
        const b = list[j].s.pos, dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), Rr = 0.3 * ((list[i].sizeK || 1) + (list[j].sizeK || 1));
        if (d < Rr && d > 1e-4 && Math.abs((a.y || 0) - (b.y || 0)) < 1.2) {
          const p = (Rr - d) / d * 0.5;
          const wa = (list[i] === P ? 0.35 : 1) * (list[i].massK || 1), wb = (list[j] === P ? 0.35 : 1) * (list[j].massK || 1);   // [boss] massK: the big ones barely budge   // a crowd pushes you, you push it less
          a.x -= dx * p * wa; a.z -= dz * p * wa; b.x += dx * p * wb; b.z += dz * p * wb;
        }
      }
    }
  }
  // the ones on the floor (knocked down, or dead) are heavy: the others walk round them, not through them, and they
  // don't budge (measured at the hips — where the body actually is, not where its feet were). You can still step over.
  for (const u of Z.list) {
    if (!u.active || (u.alive && !(u.z.down > 0)) || !u.s.B || !u.s.B.Hips || u.s.pos.distanceTo(F) > 40) continue;
    const h = u.s.B.Hips.getWorldPosition(sepV), cx = Math.floor(h.x / 2), cz = Math.floor(h.z / 2), R = 0.42 * (u.sizeK || 1);
    for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
      const bucket = sepHash.get(key(cx + ox, cz + oz)); if (!bucket) continue;
      for (const j of bucket) {
        const w = list[j]; if (w === P || w === u || (w.z && w.z.state === 'feed') || w.s.act === 'Fixing_Kneeling') continue;
        const b = w.s.pos, dx = b.x - h.x, dz = b.z - h.z, d = Math.hypot(dx, dz), Rr = R + 0.25 * (w.sizeK || 1);
        if (d < Rr && d > 1e-4 && Math.abs((b.y || 0) - (u.s.pos.y || 0)) < 1.2) { const k = (Rr - d) / d * 0.35; b.x += dx * k; b.z += dz * k; }
      }
    }
  }
}
const sepV = V();
// keep the right number of the dead around you: more at night, more every day
function populate(dt, initial = false) {
  G.popT = (G.popT || 0) - dt; if (G.popT > 0 && !initial) return; G.popT = 1.2;
  const night = world.night > 0.5;
  const ramp = G.phase === 'outbreak' ? clamp(0.3 + (G.t - G.obT) / (HOUR * 2.2), 0.3, 1) : 0;
  const want = Math.max(1, Math.min(Z.pool.length - 4, Math.round(((night ? 26 : 12) + (G.day - 1) * 3 + (initial ? 4 : 0)) * DIFF.count * ramp * (1 + 0.4 * (MP.playerCount() - 1)))));   // MP: more players, more of them   // the night is when they come out
  // put far-away ones back to sleep (not the ones after you, not Dale)
  for (const u of [...Z.list]) {
    const d = MP.on() ? MP.nearDist(u.s.pos, P) : u.s.pos.distanceTo(P.s.pos);   // MP: near anybody
    if (!u.alive) { if ((u.deadT > 40 && d > 45) || (d > 70)) { if (u.corpse) { const i = world.containers.indexOf(u.corpse); if (i >= 0 && !u.dale) world.containers.splice(i, 1); } if (!u.dale) sleep(u); } continue; }
    if (d > 85 && u.z.state !== 'chase' && u.z.state !== 'feed' && !u.dale) sleep(u);
  }
  const alive = Z.list.filter(u => u.alive).length;
  let n = Math.min(initial ? want : Math.max(2, Math.ceil(2 * DIFF.count)), want - alive);
  // they come in small groups, spread round the town (bigger groups the harder it is), never all in one place
  const [g0, g1] = GROUP[save.diff] || GROUP.medium;
  let left = n;
  for (let tries = 0; left > 0 && tries < 8; tries++) {
    const spot = groupSpot(initial); if (!spot) break;
    const size = Math.min(left, g0 + Math.floor(Math.random() * (g1 - g0 + 1)));
    const H = spot.indoor ? world.houseAt(spot.x, spot.z) : null;
    const heading = rnd(-Math.PI, Math.PI), state = spot.indoor ? 'idle' : Math.random() < 0.6 ? 'wander' : 'idle';
    for (let k = 0; k < size; k++) {
      const u = Z.pool.find(z => !z.active && !z.dale); if (!u) { left = 0; break; }
      let x = spot.x, z = spot.z;
      if (k > 0) {
        if (H && H.inside) [x, z] = H.inside[k % H.inside.length];
        else for (let q = 0; q < 8; q++) { const a = Math.random() * 6.28, rr = rnd(1.2, 3.8), xx = spot.x + Math.cos(a) * rr, zz = spot.z + Math.sin(a) * rr; if (world.walkable(xx, zz)) { x = xx; z = zz; break; } }
      }
      wake(u, x, z, { yaw: heading + rnd(-0.6, 0.6), big: Math.random() < DIFF.big, runner: night && Math.random() < (0.26 + G.day * 0.05) * (DIFF.runners ?? 1), state, indoor: spot.indoor, lying: !spot.indoor && Math.random() < 0.12 });
      u.z.wander = rnd(-0.4, 0.4); u.group = spot;
      if (!initial && night && k === 0 && Math.random() < 0.65) spot.hunt = P.s.pos.clone().add(V(rnd(-15, 15), 0, rnd(-15, 15)));
      if (spot.hunt) { u.z.state = 'investigate'; u.z.goal = spot.hunt.clone().add(V(rnd(-2, 2), 0, rnd(-2, 2))); u.z.t = 30; }
      left--;
    }
  }
}
const GROUP = { easy: [2, 3], medium: [2, 4], hard: [3, 5], extreme: [4, 6], apocalypse: [5, 7], zombiex: [6, 8] };
// a place for a new group: out of sight, and well away from every other group
function groupSpot(initial) {
  for (let t = 0; t < 12; t++) {
    const sp = spawnSpot(initial); if (!sp) return null;
    if (!Z.list.some(u => u.active && u.alive && Math.hypot(u.s.pos.x - sp.x, u.s.pos.z - sp.z) < 20)) return sp;
  }
  return spawnSpot(initial);
}
const camFwd = V();
function spawnSpot(initial) {
  camera.getWorldDirection(camFwd);
  const O = MP.spawnAround(P);   // MP: round a random player (just you in single player)
  for (let tries = 0; tries < 30; tries++) {
    let x, z, indoor = false;
    if (Math.random() < 0.3) {   // in a house nobody's searched
      const H = pick(world.houses); const d = Math.hypot(H.x - O.x, H.z - O.z);
      if (d < (initial ? 25 : 30) || d > 75 || H === G.home || !H.inside) continue;
      [x, z] = pick(H.inside); indoor = true;
    } else {
      const a = Math.random() * Math.PI * 2, r = initial ? rnd(28, 80) : rnd(38, 70);
      x = clamp(O.x + Math.cos(a) * r, -102, 102); z = clamp(O.z + Math.sin(a) * r, -102, 102);
    }
    if (!world.walkable(x, z)) continue;
    const d = MP.on() ? MP.nearDist({ x, z }, P) : Math.hypot(x - P.s.pos.x, z - P.s.pos.z);
    if (d < 24) continue;
    // never pop in where you can see it
    const tx = x - camera.position.x, tz = z - camera.position.z;
    if (!initial && (tx * camFwd.x + tz * camFwd.z) / (Math.hypot(tx, tz) || 1) > 0.45 && world.los(camera.position, V(x, 1.5, z))) continue;
    if (Z.list.some(u => u.active && u.s.pos.distanceTo(V(x, 0, z)) < 1.2)) continue;
    return { x, z, indoor };
  }
  return null;
}

// ---------------------------------------------------------------- survival: hunger, thirst, blood, infection, the clock
const HOUR = 40;   // real seconds per in-game hour
const HOUR_CALM = 75;   // ...and on the quiet Saturday morning, before noon
function weather(dt) {
  G.wxT = (G.wxT ?? 0) - dt;
  if (G.wxT <= 0) {
    G.wxT = HOUR * (2 + Math.random() * 4);
    const early = G.day === 1 && G.hour < 14;   // the story opens on a bright, dry day
    const r = Math.random();
    G.rainTarget = early || (world.sunny || 0) > 0.3 ? 0 : r < 0.55 ? 0 : r < 0.8 ? 0.35 + Math.random() * 0.25 : 0.75 + Math.random() * 0.25;
  }
  world.rain = damp(world.rain || 0, G.rainTarget || 0, 0.08, dt);
  if (world.rain < 0.002) world.rain = 0;
  // lightning: the whole street flashes white, the thunder rolls in a few seconds later
  if (world.rain > 0.65) {
    G.boltT = (G.boltT ?? 15) - dt;
    if (G.boltT <= 0) { G.boltT = 14 + Math.random() * 40; const close = Math.random(); C.flash = Math.max(C.flash, (world.night > 0.5 ? 0.45 : 0.18) * (0.5 + close)); G.boltFlash = 0.35; later(() => SND.thunder(close), 0.6 + (1 - close) * 4); }
  }
  G.boltFlash = Math.max(0, (G.boltFlash || 0) - dt);
}
function survive(dt) {
  if (!P.alive) return;
  weather(dt);
  const h0 = G.hour;
  G.hour += dt / (G.phase === 'calm' ? HOUR_CALM : HOUR);
  if (TUT.on && TUT.calm && G.phase === 'calm' && G.hour > obHour() - 0.25 && G.hour < obHour()) G.hour = obHour() - 0.25;   // the morning waits while you learn
  if (G.hour >= 24) { G.hour -= 24; G.day++; }
  { const nf = HELI.nextFlight(), wh = nf ? nf.hour - 0.5 : -9; if (G.phase === 'outbreak' && wh >= 0 && h0 < wh && G.hour >= wh && HELI.state() === 'waiting' && nf.day === G.day) { SND.sting('objective'); think(MAPLE() ? 'Half past one. Half an hour. I need to get to Main and Maple.' : `Half an hour. I need to get to ${lzName()}.`, 4.5); } }
  if (h0 < 21 && G.hour >= 21) { SND.sting('night'); bigText('NIGHTFALL', `day ${G.day} · more of them, and some of them run · ${MAPLE() ? 'helicopter at 02:00' : rideName() + ' at ' + hhmm(endHour())}`, 4); later(() => think(G.flashlight ? 'Dark already. The flashlight will give me away...' : 'It\'s getting dark. They\'ll be everywhere soon.', 4), 1); }
  if (h0 < 6 && G.hour >= 6) { SND.sting('day'); bigText(`DAY ${G.day}`, 'you made it through the night', 4); save.bestDays = Math.max(save.bestDays, G.day - 1); writeSave(); }
  world.sunny = G.phase === 'calm' || G.phase === 'news' ? 1 : G.phase === 'outbreak' ? clamp(1 - (G.t - G.obT) / (HOUR * 2.5), 0, 1) : 0;
  world.setTime(G.hour);
  // the body
  const hrs = dt / HOUR;
  G.food = Math.max(0, G.food - hrs * 2.6 * (P.s.exertion > 0.5 ? 1.5 : 1));
  G.water = Math.max(0, G.water - hrs * 3.8 * (P.s.exertion > 0.5 ? 1.6 : 1));
  if (G.food <= 0) damage(P, dt * 0.25, null, { starve: true });
  if (G.water <= 0) damage(P, dt * 0.4, null, { thirst: true });
  if (G.bleed > 0) { G.bleedT = (G.bleedT || 0) + dt; damage(P, dt * 0.55 * G.bleed, null, { bleed: true }); if (G.bleedT > 1.2) { G.bleedT = 0; if (P.s.speed > 0.5 || Math.random() < 0.3) world.blood(P.s.pos.x + rnd(-0.2, 0.2), P.s.pos.z + rnd(-0.2, 0.2), 0.12 + Math.random() * 0.1, world.houseAt(P.s.pos.x, P.s.pos.z) ? 0.036 : 0.026); } }
  if (G.infection > 0) { G.infection = Math.min(100, G.infection + dt * 0.055); if (G.infection > 60) damage(P, dt * 0.08, null, { infection: true }); if (G.infection >= 100) { kill(P, null, { infection: true }); return; } if (G.infection > 70 && !G.saidFever) { G.saidFever = true; think('So cold... I need antibiotics. Now.', 4); } }
  // healing: medicine works over a few seconds; a fed, watered body slowly mends
  if (G.healQ > 0) { const k = Math.min(G.healQ, dt * 8); G.healQ -= k; P.hp = Math.min(P.maxHp, P.hp + k); }
  P.hurtT += dt;
  if (P.hurtT > 10 && G.food > 35 && G.water > 35 && G.bleed <= 0 && G.infection < 50) P.hp = Math.min(P.maxHp, P.hp + dt * 0.35);
  // the flashlight
  if (G.flashlight) { G.battery = Math.max(0, G.battery - dt * 0.28); if (G.battery <= 0 && !G.saidBattery) { G.saidBattery = true; think('The flashlight died. I need batteries.', 3); } }
  if (G.battery > 0) G.saidBattery = false;
  // things to say
  if (G.food < 20 && !G.saidFood) { G.saidFood = true; think('I\'m starving. I have to eat something.', 3.5); } if (G.food > 40) G.saidFood = false;
  if (G.water < 20 && !G.saidWater) { G.saidWater = true; think('My mouth is like sand. I need water.', 3.5); } if (G.water > 40) G.saidWater = false;
}
// what you were holding falls out of your hand when you go down: a real copy of it, tumbling to the floor and lying there
const DROPPED = [];
function dropHeld(info = {}) {
  const src = P.arms.cur ? P.arms.guns[P.arms.cur] : MEL.cur && MEL.cur !== 'fists' ? MEL.meshes[MEL.cur] : null;
  if (!src || !src.parent || DRIVE.active() || G.inAmb) return;   // (it may already be hidden by the hit that killed you: it's still what you held)
  src.updateWorldMatrix(true, true);
  const m = src.clone(true); src.matrixWorld.decompose(m.position, m.quaternion, m.scale); m.visible = true;
  m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = true; } });
  scene.add(m);
  const d = info.dir || V(Math.sin(P.s.yaw), 0, Math.cos(P.s.yaw));
  DROPPED.push({ m, v: V(d.x * 1.2 + rnd(-0.5, 0.5), 1.4, d.z * 1.2 + rnd(-0.5, 0.5)), w: V(rnd(-6, 6), rnd(-3, 3), rnd(-6, 6)), q1: null, bounce: 0 });
}
const dropB = new THREE.Box3();
function updateDropped(dt) {
  for (const D of DROPPED) {
    const m = D.m, p = m.position, gy = (world.groundY ? world.groundY(p.x, p.z, p.y + 0.3) : 0) + 0.01;
    if (!D.q1) {
      D.v.y -= 9.8 * dt; p.addScaledVector(D.v, dt);
      m.rotation.x += D.w.x * dt; m.rotation.y += D.w.y * dt; m.rotation.z += D.w.z * dt;
      world.collide && world.collide(p, 0.08);
      if (p.y <= gy + 0.06 && D.v.y < 0) {
        if (D.v.y < -1.6 && D.bounce < 2) { D.bounce++; D.v.y *= -0.28; D.v.x *= 0.45; D.v.z *= 0.45; D.w.multiplyScalar(0.4); SND.impact(p.clone(), 'wood', 0.5 / D.bounce); }
        else {   // it settles flat on its side, the way it came down
          const e = new THREE.Euler().setFromQuaternion(m.quaternion, 'YXZ');
          D.q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, e.y, Math.abs(e.z) > 1.57 ? -Math.PI / 2 : Math.PI / 2, 'YXZ'));
        }
      }
    }
    if (D.q1) { if (D.rest) continue; m.quaternion.slerp(D.q1, 1 - Math.exp(-14 * dt)); if (m.quaternion.angleTo(D.q1) < 0.01) { m.quaternion.copy(D.q1); D.rest = true; } }
    m.updateMatrixWorld(true); dropB.setFromObject(m);
    if (dropB.min.y < gy) p.y += gy - dropB.min.y; else if (D.q1) p.y -= Math.min(dropB.min.y - gy, 0.5 * dt + 0.002);
    m.updateMatrixWorld(true);
  }
}
function clearDropped() { for (const D of DROPPED) scene.remove(D.m); DROPPED.length = 0; }
function playerDied(info) {
  if (G.state === 'bag' || G.state === 'note') { showScreen(null); noteDone = null; }
  $('phone').classList.remove('show'); PH.call = null;
  DRIVE.reset(); HANDS.flush(); G.pickAct = false; if (G.packAnim || PACK.swing > 0) G.packAnim = { dir: -1, t: 0, snd: {} };
  G.state = 'dead'; P.deadT = 0; G.deathCause = info.infection ? 'turned' : info.starve ? 'starved' : info.thirst ? 'thirst' : info.bleed ? 'bled' : info.fire ? 'burned' : info.fall ? 'fall' : info.crash ? 'crash' : info.human ? 'killed' : 'eaten';
  if (G.grabbedBy) releaseGrab(false);
  cancelSearch(); dropHeld(info); MEL.hideAll(); P.arms.hideAll();
  SND.sting('death'); SND.musicPlaying(false); SND.playerDeath(P.s.deathRate || 1);
  save.deaths++; writeSave();
  bigText(G.deathCause === 'turned' ? 'YOU TURNED' : 'YOU DIED', '', 5);
  if (G.deathCause === 'turned') later(() => { P.s.resetActs(); P.s.play('LayToIdle', { fade: 0.5, rate: 0.6 }); }, 2.5);
  if (!MP.died()) later(() => endRun('died'), 5);   // MP: a friend still up gets you back up (mp.js)
}
function endRun(how) {
  if (G.state === 'result' || G.state === 'title') return;
  MP.ended(how);   // MP: tell the room; a host who's done passes the world on
  const win = how === 'escaped';
  if (win) clearRun();
  const hours = (G.day - 1) * 24 + G.hour - G.startHour;
  const sres = STATS.commitRun({ how: win ? (G.heliEscape ? 'helicopter' : 'escaped') : how === 'left' ? 'died' : how, cause: how === 'left' ? 'other' : G.deathCause, hours, saved: G.saved || 0 });
  G.madeIt = win;
  save.bestHours = Math.max(save.bestHours, hours); if (win) save.escapes++;
  save.bestDays = Math.max(save.bestDays, G.day - 1 + (win ? 1 : 0));
  writeSave();
  G.state = 'result'; keys.clear(); G.mouse.left = G.mouse.right = false; G.boarded = false; G.heliCine = false;
  HELI.setUIVisible(false); $('fade').classList.remove('on'); capClear(); document.body.classList.remove('playing', 'paused', 'bagopen');
  const cause = { turned: 'The infection took you. You got back up.', starved: 'You starved.', thirst: 'You died of thirst.', bled: 'You bled out.', burned: 'You burned.', fall: 'The fall killed you.', crash: 'You crashed.', killed: 'Somebody you hurt hurt you back. Worse.', eaten: 'They got you.' }[G.deathCause] || '';
  const sv = G.saved || 0, hurt = G.stats.humansHurt || 0, killedH = G.stats.humansKilled || 0;
  const E = END(), outro = E && STORY.outro && STORY.outro[E.kind];
  const title = win ? (E && E.win) || 'YOU MADE IT' : how === 'left' ? (E && E.lose) || 'LEFT BEHIND' : 'YOU DIED';
  const story = E && win ? (E.winText || (outro ? outro.filter(l => !/^YOU MADE IT$/.test(l)).join(' ') : `You got out of ${mapName()}.`)) + (sv ? ` ${sv} other ${sv === 1 ? 'survivor' : 'survivors'} made it with you.` : '')
    : E && how === 'left' ? E.loseText || `The ${rideName()} left without you. Nobody is coming back for ${mapName()}.`
    : win
    ? `The skids lift off the asphalt. Below you the crossroads fills with them — running, reaching, falling away as the searchlight swings past the Quick Stop. Maple Hollow gets small and dark. ${sv ? `${sv} other ${sv === 1 ? 'survivor' : 'survivors'} made it aboard with you.` : 'Nobody else made it aboard.'} Somewhere past the hills, Em and the kids are waiting.`
    : how === 'left' ? 'The last helicopter lifted off without you. The rotors fade over the hills, and the town goes quiet — except for them. Nobody is coming back for Maple Hollow.'
    : cause;
  $('resultPanel').innerHTML = `<div class="sub">${mapName().toUpperCase()} · ${DIFF.name} · DAY ${G.day}</div>
    <h2 class="${win ? 'win' : 'lose'}">${title}</h2>
    <div class="sub" style="text-transform:none;letter-spacing:.04em;font-size:13px;color:#ccc;line-height:1.6">${story}</div>
    ${STATS.resultsHTML(sres)}
    ${hurt ? `<div class="sub rsaved">${icon('person')} <b>${hurt}</b> ${hurt === 1 ? 'person' : 'people'} you hurt${killedH ? ` · <b>${killedH}</b> killed` : ''}</div>` : ''}
    <div class="sub">best ${save.bestDays} day${save.bestDays === 1 ? '' : 's'} · ${save.kills} kills all time · ${save.escapes} escape${save.escapes === 1 ? '' : 's'}</div>
    <div class="btns">${!win && G.ckpt ? `<button class="m go" id="rCkpt">Retry · Chapter ${Math.min(Math.floor(G.ckpt.G.stage) || 0, CHS().length - 1) + 1}</button>` : ''}<button class="m" id="rAgain">Try again</button><button class="m" id="rMenu">Title</button></div>`;
  STATS.animate($('resultPanel'));
  showScreen('result');
  $('rAgain').onclick = () => { showScreen(null); G.ckpt = null; newGame(); };
  if ($('rCkpt')) $('rCkpt').onclick = () => { const d = G.ckpt; G.who = { body: d.who.body, name: d.who.name, job: d.who.job, house: world.houses[d.who.house] }; save.diff = d.diff; showScreen(null); newGame(d).then(() => { G.ckpt = d; }); };
  $('rMenu').onclick = () => toTitle();
  if (MP.on()) { $('rAgain').remove(); if ($('rCkpt')) $('rCkpt').remove(); $('rMenu').textContent = 'Leave the room'; $('rMenu').classList.add('go'); }   // MP
}

// ---------------------------------------------------------------- a new run
function resetWorldState() {
  LANTERN.reset();
  world.rain = 0; world.closeAll(); world.calm(); world.resetProps();
  for (const c of world.containers) { c.searched = false; if (c.fixed0) c.fixed = c.fixed0.map(a => [...a]); else delete c.fixed; }
  for (let i = world.containers.length - 1; i >= 0; i--) { const c = world.containers[i]; if (c.dyn || (c.kind === 'corpse' && !c.mapBody)) world.containers.splice(i, 1); }
  for (const D of world.doors) { if (D.fall) { D.fall = null; D.pivot.rotation.x = 0; } D.broken = false; D.pivot.visible = true; D.box.off = false; D.open = D.want = 0; D.hp = D.maxHp; }
  for (const c of world.containers) { delete c.takenBy; delete c.skipBy; }
  for (const T of throws) scene.remove(T.m); throws.length = 0; fires.length = 0;
  if (world.truck) { const T = world.truck; T.g.position.set(T.x, 0, T.z); T.g.rotation.set(0, T.yaw, 0); T.box.off = false; T.fueled = false; }
  for (const c of world.cars) c.alarmDone = false;
  Z.pool.forEach(u => { u.dale = u.dale; sleep(u); });
  fx.clear();
  $('fade').classList.remove('on');
}
async function newGame(restore = null) {
  timers.length = 0; G.runId = (G.runId || 0) + 1; G.inAmb = false;
  DRIVE.reset();
  resetWorldState();
  const D = DIFFS[save.diff] || DIFFS.medium;
  Object.assign(DIFF, D); Object.assign(ZD.cur, D);
  if (MOB) DIFF.count = D.count * MOB.zombieScale;   // phones / tablets: fewer of them about at once (same speed, same bite)
  const need = MOB ? Math.max(20, Math.round((POOL_CAP[save.diff] || 34) * MOB.poolScale)) : POOL_CAP[save.diff] || 34, bodies = ['human', 'butler', 'coach', 'michelle'];
  if (Z.pool.length < need) {
    showScreen('intro'); $('introLines').innerHTML = `<p class="date on">${D.name}</p><p class="on">More of them are coming...</p>`;
    for (let i = Z.pool.length; i < need; i++) { makeZombie(KINDS[bodies[i % 4]], scene, Math.floor(i / 4) % 4, onStep); if (i % 5 === 4) await tick(); }
    if (MOB) capTextures(scene);
    showScreen(null);
  }
  const who = G.who || { body: 'human', name: 'Sam Carter', job: 'high-school history teacher', house: homeHouse() };
  if (!MAPLE()) who.house = homeHouse();
  G.role = !MAPLE() && STORY && STORY.role ? STORY.role(who) : null;
  HANDS.flush(); PACK.swing = PACK.zip = 0; G.packAnim = null; clearLitter(); tutStop('quiet'); tipHide(true);
  setBody(who.body); G.pname = who.name.split(' ')[0];
  { const L0 = LOOKS.lookFor('who:' + who.name, who.body), uni = G.role === 'inmate' || G.role === 'guard';   // [looks] you look like your card
    LOOKS.applyLook(P.s, uni ? { ...L0, hat: G.role === 'guard' ? 'cap' : 'none', hatCol: 1 } : L0);   // the prison: an inmate goes bare-headed, a guard wears the navy cap
    if (G.role === 'inmate') LOOKS.outfit(P.s, 0xe26e1e, 0xe26e1e);   // the orange jumpsuit (as people.js uniformOn() dyes it)
    else if (G.role === 'guard') LOOKS.outfit(P.s, 0x22305a, 0x1b2440); }   // navy uniform shirt and trousers
  G.home = who.house;
  const H = G.home;
  // you wake up at home (Maple Hollow) — or wherever the map's story starts you
  const c = Math.cos(H ? H.yaw || 0 : 0), s = Math.sin(H ? H.yaw || 0 : 0), P0 = (lx, lz) => [H.x + lx * (H.flip || 1) * c + lz * s, H.z - lx * (H.flip || 1) * s + lz * c];
  P.alive = true; P.hp = P.maxHp; P.hurtT = 99; P.s.dead = false; P.active = true; P.s.resetActs(); P.s.setVisible(true);
  if (MAPLE()) { const [sx, sz] = P0(-3.5, 2.2); P.s.place(sx, sz, Math.atan2(...(() => { const [dx, dz] = P0(-3, 6); return [dx - sx, dz - sz]; })())); }
  else { const st = startSpot(); P.s.place(st.x, st.z, st.yaw || 0); }
  for (const id of SLOTS) P.arms.take(id); P.arms.holster(); P.arms.throwT = -1;
  Object.assign(G, {
    hour: MAPLE() ? 10.5 : (STORY.startHour ?? 8), startHour: MAPLE() ? 10.5 : (STORY.startHour ?? 8), day: 1, radioDone: false, map: MAP_ID, phase: 'calm', prologue: 0, news: null, hand: null, doorUse: null, obT: 0, survT: 0, revealT: 0, recruits: 0, food: 72, water: 64, stam: 100, bleed: 0, infection: 0, battery: 65, healQ: 0, flashlight: false, winded: false,
    inv: NEW_INV(), melee: {}, weapon: 'fists', crouch: false, search: null, grabbedBy: null, vault: null, vaulting: false, driving: null, hurtDir: [],
    transit: new Map(), packAnim: null, pickAct: false, wrapK: 0, pkR: null,
    rainTarget: 0, wxT: HOUR * 3.5, boltT: 20,
    stats: { kills: 0, heads: 0, searched: 0, items: 0, bites: 0, used: 0, shots: 0, humansHurt: 0, humansKilled: 0 }, stage: 0, notes: [], madeIt: false, saidFood: false, saidWater: false, saidFever: false, popT: 0, spottedT: -99,
    boarded: false, heliCine: false, heliEscape: false, heliSeen: false, heliCallT: 0, boardWait: 9, saved: 0, missed: 0, missedFinal: false, zoomW: 0, saidKilled: false, saidHurt: false,
  });
  STATS.resetRun({ diff: save.diff, body: who.body, name: who.name, continued: !!restore });
  HELI.reset(); HELI.setUIVisible(true);
  if (world.truck) world.truck.fueled = false;
  if (PACK.P) PACK.P.visible = true;
  C.stats = { shots: 0, hits: 0, kills: 0 };
  MEL.set('fists');
  world.setTime(G.hour);
  // the story's props: the radio, Em's note, the notes about town, the Hendersons' shed with the gas
  if (MAPLE()) setupStory(H, P0); else setupMapStory();
  // nobody's dead yet. Dale's washing his truck, Gary's queueing for a burger, the neighbours are out walking.
  world.calm(); world.sunny = 1; world.setTime(G.hour);
  for (const A of AMBS) if (A.g) A.g.removeFromParent(); AMBS.length = 0; Object.assign(PH, { app: 'home', thread: null, call: null, msgs: { mom: [], bro: [] }, unread: { mom: 0, bro: 0 }, typing: null, step: { mom: 'calm0', bro: 'calm0' }, ambs: 0, chance: 0, started: false, obSent: false, lateT: null });
  if (MAPLE()) PEOPLE.castCalm();
  TRAFFIC.start();   // [traffic]
  G.camYaw = P.s.yaw; G.camPitch = -0.15; camInit = false;
  G.state = 'play'; showScreen(null);
  document.body.classList.add('playing');
  C.mode = 'play'; SND.setMode('play'); SND.musicPlaying(false); SND.setPeace(1);
  save.runs++; writeSave();
  fadeHelp();
  if (!MAPLE()) mapTips();
  if (restore) return applyRun(restore);
  { const R = G.role && STORY && STORY.roles && STORY.roles[G.role];   // the role's kit (the prison: a guard's flashlight and bandage)
    if (R) { for (const [id, n] of R.items || []) if (ITEMS[id]) addItem(id, n || 1, { defer: true }); if (R.weapon && ITEMS[R.weapon]) addItem(R.weapon, 1); } }
  writeSlot();   // the run exists from the start (no checkpoint yet)
  if ((save.tutorial ?? !save.tutorialDone) && !Q.has('notut')) later(() => { if (G.phase === 'calm' && G.state !== 'title') tutStart(); }, 7);
  if (D.noSprint) later(() => toast('ZombieX: you can\'t run', 'bad'), 1.5);
  if (!MAPLE()) {
    bigText(String(STORY.title || mapName()).toUpperCase(), `${String(STORY.subtitle || 'a normal day').toUpperCase()} · ${D.name}`, 4);
    const il = Array.isArray(STORY.intro) ? STORY.intro : [];
    if (il[1]) later(() => { if (G.phase === 'calm') think(il[1], 4.5); }, 2.5);
    if (Q.has('skipcalm')) later(() => { G.hour = Math.max(G.hour, obHour()); startMapNews(); endMapNews(true); }, 0.1);
    return;
  }
  bigText('SATURDAY', `A NORMAL DAY · ${D.name}`, 4);
  later(() => think('Em took the kids to her sister\'s for the weekend. Quiet house. Nice day out.', 4.5), 2.5);
  later(() => { if (G.phase === 'calm') think('Dale\'s out washing that old truck again. I should say hi.', 4); }, 8);
  if (Q.has('skipcalm')) later(() => { startNews(); endNews(true); }, 0.1);   // test hook: straight to the outbreak
}
function setupStory(H, P0) {
  for (let i = world.containers.length - 1; i >= 0; i--) if (world.containers[i].kind === 'radio') world.containers.splice(i, 1);
  for (const c of world.containers) delete c.note;
  const [rx, rz] = P0(-0.2, -4.25); world.container('radio', rx, rz, 1.0, 'Radio on the counter', H.yaw, H);
  for (let i = world.containers.length - 1; i >= 0; i--) if (world.containers[i].kind === 'tv') world.containers.splice(i, 1);
  { const [tx, tz] = P0(-0.55, 2.0); G.tvSpot = world.container('tv', tx, tz, 1.0, 'The TV', H.yaw, H); }
  const fridge = world.containers.find(c => c.house === H && c.kind === 'fridge'); if (fridge) fridge.note = 'em';
  const home = world.containers.find(c => c.house === H && c.kind === 'kitchen'); if (home) home.fixed = [['knife', 1], ['beans', 1]];
  const set = (pred, id) => { const c = pick(world.containers.filter(pred)); if (c) c.note = id; };
  set(c => c.kind === 'police', 'police'); set(c => c.kind === 'ambulance', 'ambulance'); set(c => c.kind === 'register', 'raj');
  set(c => c.kind === 'nightstand' && c.house !== H, 'kid'); set(c => c.kind === 'bin', 'leaflet');
  // the Hendersons: a house on Maple Ave with a shed in the back
  const sheds = world.containers.filter(c => c.kind === 'shed' && c.house && Math.abs(c.house.x) === 17 && Math.hypot(c.x - P.s.pos.x, c.z - P.s.pos.z) > 40);
  const shed = sheds.length ? pick(sheds) : pick(world.containers.filter(c => c.kind === 'shed'));
  shed.fixed = [['gascan', 1]]; shed.label = 'The Hendersons\' shed';
  const hh = shed.house; G.hend = { x: shed.x, z: shed.z, name: addressOf(hh) };
  NOTES.dale1.text = NOTES.dale1.text.replace(/left it in the Hendersons' shed[^.]*\./, `left it in the Hendersons' shed — ${G.hend.name}.`);
  NOTES.dale2.text = NOTES.dale2.text.replace(/the gas is in the Hendersons' shed[^.]*\./, `the gas is in the Hendersons' shed, ${G.hend.name}.`);
}
// the map's own tips (story.tips) through the same tip card as Maple's: each once, at the moment it matters
// (roofs at night, the heat when you're thirsty, the dark underground), the rest one at a time once the dead are out
function mapTips() {
  const T = (STORY && STORY.tips) || {}, ids = Object.keys(T).filter(k => T[k] && T[k].text);
  if (!ids.length) return;
  for (const k of ids) TUT_TIPS[MAP_ID + '.' + k] = { title: T[k].title || k.toUpperCase(), keys: T[k].keys || [], text: T[k].text };
  const when = {
    roofs: () => world.night > 0.6 && G.phase !== 'calm',
    heat: () => G.water < 30,
    cave: () => (P.s.gy || 0) < -1.5 || (world.night > 0.6 && !G.flashlight), sewer: () => (P.s.gy || 0) < -1.5,
    sandstorm: () => false,   // (only when one comes: the map's own beats say so)
  };
  let gapT = 25;
  const loop = () => {
    if (G.state === 'play' && P && P.alive) {
      for (const k of ids) if (when[k] && when[k]()) tip(MAP_ID + '.' + k);
      if (G.phase === 'outbreak' && (gapT -= 1) <= 0) { const k = ids.find(k => !when[k] && !save.tips[MAP_ID + '.' + k]); if (k) { tip(MAP_ID + '.' + k); gapT = 75; } }
    }
    later(loop, 1);
  };
  later(loop, 1);
}
function fadeHelp() { $('help').classList.remove('fade'); clearTimeout(fadeHelp.t); fadeHelp.t = setTimeout(() => $('help').classList.add('fade'), 25000); }
function toTitle() {
  MP.leaveGame();   // MP: leave the online room
  timers.length = 0; G.runId = (G.runId || 0) + 1;
  DRIVE.reset(); HELI.reset(); HELI.setUIVisible(false); G.boarded = false; G.heliCine = false; if (PACK && PACK.P) PACK.P.visible = true;
  TRAFFIC.stop();   // [traffic]
  if (HANDS) { HANDS.flush(); PACK.swing = PACK.zip = 0; G.packAnim = null; clearLitter(); tutStop('quiet'); tipHide(true); }
  resetWorldState();
  showScreen('title'); G.state = 'title'; world.ruin(); world.sunny = 0; PEOPLE.PPL.list.forEach(u => { u.active = false; u.gone = true; u.s.setVisible(false); if (u.mel) u.mel.hideAll(); }); C.npcs = []; G.phase = 'title'; SND.setPeace(0); $('tv').classList.remove('show');
  document.body.classList.remove('playing', 'grabbed');
  C.mode = 'title'; SND.setMode('title');
  // you, on your front lawn at dusk, and the dead coming up the street
  const H = homeHouse();
  if (RIGS.human) setBody(P.body || 'human');
  const T0 = MAPLE() ? { x: -46, z: 9.5, yaw: Math.PI * 0.95 } : startSpot();
  P.alive = true; P.hp = 100; P.s.dead = false; P.s.resetActs(); P.s.setVisible(true); P.s.place(T0.x, T0.z, T0.yaw ?? 0);
  MEL.set('bat'); G.weapon = 'bat'; P.arms.holster();
  G.hour = 19.6; world.setTime(G.hour);
  if (MAPLE()) for (let i = 0; i < Math.min(6, Z.pool.length - 2); i++) { const u = Z.pool[i + 1]; wake(u, -46 + rnd(-14, 14), -3 - i * 3.5 - rnd(0, 4), { state: 'investigate' }); u.z.goal = V(-46 + rnd(-6, 6), 0, 1.5 + rnd(0, 2)); u.z.t = 999; }   // they come up the street, but stop short of the lawn
  else { const fx0 = Math.sin(T0.yaw ?? 0), fz0 = Math.cos(T0.yaw ?? 0); for (let i = 0, k = 0; i < 40 && k < Math.min(6, Z.pool.length - 2); i++) { const r = 12 + k * 3 + rnd(0, 4), a = rnd(-0.7, 0.7), x = T0.x + (fx0 * Math.cos(a) - fz0 * Math.sin(a)) * r, z = T0.z + (fz0 * Math.cos(a) + fx0 * Math.sin(a)) * r; if (!world.walkable(x, z)) continue; const u = Z.pool[k + 1]; wake(u, x, z, { state: 'investigate' }); u.z.goal = V(T0.x + fx0 * 4 + rnd(-3, 3), 0, T0.z + fz0 * 4 + rnd(-3, 3)); u.z.t = 999; k++; } }
  G.camYaw = MAPLE() ? Math.PI * 1.15 : (T0.yaw ?? 0) + Math.PI + 0.5; G.camPitch = -0.05; camInit = false;
  void H;
  refreshContinue();
  STATS.addTitleButton(document.querySelector('#title .menu'), '03');
  $('career').innerHTML = save.runs ? `best: ${save.bestDays} day${save.bestDays === 1 ? '' : 's'} survived · ${save.kills} zombies put down<br>${save.escapes} escape${save.escapes === 1 ? '' : 's'} · ${save.deaths} death${save.deaths === 1 ? '' : 's'}` : 'nobody has made it out yet';
}
function showScreen(id) { for (const s of document.querySelectorAll('.screen')) s.classList.toggle('show', s.id === id); }

// ---------------------------------------------------------------- the backpack screen
// Tab: you swing the pack off your shoulder round to your front and unzip it — then you can see inside
function openBag() {
  if (G.state === 'bag' || G.state !== 'play' || !P.alive) return;
  if (PACK.swing >= 1 && PACK.zip >= 1) return bagShown();   // it's already open in front of you (back from reading a note)
  if (G.grabbedBy || DRIVE.active() || G.search) return;
  if (G.packAnim && G.packAnim.dir > 0) return;
  if (HANDS.busy()) HANDS.flush();
  G.packAnim = { dir: 1, t: 0, snd: {} }; rustle(0.25, 0.28, 1500);
}
function bagShown() { unlockMouse(); document.body.classList.add('bagopen'); G.state = 'bag'; keys.clear(); G.mouse.left = G.mouse.right = false; renderBag(); showScreen('bag'); tut('bag'); }
// ...and zip it up and sling it back on
function closeBag() {
  document.body.classList.remove('bagopen');
  if (G.state === 'bag') { G.state = 'play'; showScreen(null); lockMouse(); }
  if (G.packAnim || PACK.swing > 0) { G.packAnim ||= { t: 0, snd: {} }; G.packAnim.dir = -1; G.packAnim.t = 0; G.packAnim.snd = {}; }
}
// inside the pack: the main compartment (weapons, ammo, gear), the food pocket, the medicine pocket, the front pocket
// (phone, keys, notes). Each thing with its count, what it does, and Use / Hold.
function renderBagSub() {
  const fill = Math.round(packFill() * 100);
  $('bagSub').innerHTML = `<span>${icon('food')} ${Math.round(G.food)}</span><span>${icon('water')} ${Math.round(G.water)}</span><span>${icon('heart')} ${Math.round(P.hp)}</span><span>${icon('torch')} ${Math.round(G.battery)}%</span>${G.bleed > 0 ? `<span class="bad">${icon('blood')} BLEEDING</span>` : ''}${G.infection > 0 ? `<span class="sick">${icon('bio')} ${Math.round(G.infection)}%</span>` : ''}<span class="cap"><small>PACKED</small><b class="capbar"><i style="width:${fill}%"></i></b><small>${fill}%</small></span>`;
}
function renderBag() {
  const tile = (id, n, d, btn) => `<div class="it" data-id="${id}"><div class="ib">${icon(ITEM_ICON[id] || 'box')}${n ? `<em>${n}</em>` : ''}</div><div class="nm">${ITEMS[id] ? ITEMS[id].name : id}</div><div class="d">${d || '&nbsp;'}</div>${btn || ''}</div>`;
  const fxOf = I => [I.food ? `food +${I.food}` : '', I.water ? `water ${I.water > 0 ? '+' : ''}${I.water}` : '', I.heal ? `health +${I.heal}` : '', I.stopBleed ? 'stops bleeding' : '', I.cure ? `infection −${I.cure}` : '', I.stam ? `stamina +${I.stam}` : ''].filter(Boolean).join(' · ');
  const items = ids => ids.filter(id => G.inv[id] > 0).map(id => { const I = ITEMS[id]; return tile(id, G.inv[id], fxOf(I) || (I.cat === 'ammo' ? 'ammunition' : I.cat === 'throw' ? (id === 'molotov' ? 'throw: H' : 'throw: G — a distraction') : ''), I.use ? `<button data-use="${id}" ${HANDS.busy() ? 'disabled' : ''}>${I.use}</button>` : ''); }).join('');
  const held = id => G.weapon === id;
  const weapons = ['fists', ...MELEE_ORDER.filter(id => G.melee[id] != null)].map(id => tile(id, 0, id === 'fists' ? 'always with you' : `condition ${Math.round(G.melee[id] / MELEE[id].dur * 100)}%`, `<button data-eq="${id}" class="${held(id) ? 'held' : ''}">${held(id) ? 'In hand' : 'Hold'}</button>`).replace('<div class="nm">' + (ITEMS[id] ? ITEMS[id].name : id), '<div class="nm">' + MELEE[id].name[0] + MELEE[id].name.slice(1).toLowerCase())).join('')
    + SLOTS.filter(id => P.arms.guns[id]).map(id => tile(id, 0, `${P.arms.ammo[id].mag} loaded · ${G.inv[WEAPONS[id].ammo] || 0} spare`, `<button data-gun="${id}" class="${held(id) ? 'held' : ''}">${held(id) ? 'In hand' : 'Hold'}</button>`)).join('');
  const pocket = (cls, title, sub, body, empty) => `<section class="pocket ${cls}"><h4><span>${title}</span><small>${sub}</small></h4><div class="bagGrid">${body || `<div class="none">${empty}</div>`}</div></section>`;
  const front = `<div class="it phoneIt"><div class="ib">${icon('phone')}</div><div class="nm">Your phone</div><div class="d">${PH.unread.mom + PH.unread.bro ? (PH.unread.mom + PH.unread.bro) + ' unread' : 'messages · calls · 911'}</div><button id="bagPhone">Open (T)</button></div>`
    + items(['zlux', 'keys', 'keycardRed', 'keycardBlue', 'keycardGreen', 'keycardGold', 'sewerKey']) + G.notes.map(id => `<div class="it"><div class="ib">${icon('note')}</div><div class="nm">${(noteOf(id) || { title: 'A note' }).title}</div><div class="d">read it again</div><button class="notebtn" data-note="${id}">Read</button></div>`).join('');
  renderBagSub();
  $('bagBody').innerHTML = pocket('main', 'MAIN COMPARTMENT', 'weapons · ammo · gear', weapons + items(['ammo9', 'shells', 'rifleAmmo', 'battery', 'flashlight', 'lantern', 'bottle', 'molotov', 'gascan']), '')
    + pocket('food', 'FOOD POCKET', 'eat and drink', items(['beans', 'soup', 'chips', 'bar', 'apple', 'cereal', 'dates', 'bread', 'water', 'soda', 'juice']), 'Nothing to eat. Kitchens, pantries and fridges.')
    + pocket('med', 'MEDICINE POCKET', 'patch yourself up', items(['bandage', 'medkit', 'pills', 'antibiotics']), 'No medicine. Bathroom cabinets, the pharmacy, the ambulance.')
    + pocket('front', 'FRONT POCKET', 'phone · keys · notes', front, '');
  for (const b of $('bagBody').querySelectorAll('[data-use]')) b.onclick = () => { useItem(b.dataset.use); renderBag(); };
  for (const b of $('bagBody').querySelectorAll('[data-eq]')) b.onclick = () => { equipMelee(b.dataset.eq); renderBag(); };
  for (const b of $('bagBody').querySelectorAll('[data-gun]')) b.onclick = () => { equipGun(b.dataset.gun); renderBag(); };
  for (const b of $('bagBody').querySelectorAll('[data-note]')) b.onclick = () => { showScreen(null); showNote(b.dataset.note, () => { openBag(); }); };
  $('bagPhone').onclick = () => { closeBag(); openPhone(); };
}
$('bagClose').onclick = closeBag;

// ---------------------------------------------------------------- camera
const camPos = V(), camLook = V(), pivot = V();
let camInit = false, fovNow = 55;
const FP = () => save.view === 'first' && P && P.alive && G.state !== 'title' && G.state !== 'escaping' && !(G.bagCamK > 0.02);
function edgeSteer(dt) {
  if (G.state !== 'play' && G.state !== 'dead') return;
  if (keys.has('ArrowLeft')) { G.camYaw += 2.2 * dt; G.lookT = G.t; } if (keys.has('ArrowRight')) { G.camYaw -= 2.2 * dt; G.lookT = G.t; }
  if (keys.has('ArrowUp')) G.camPitch += 1.2 * dt; if (keys.has('ArrowDown')) G.camPitch -= 1.2 * dt;
  // touch aim assist: a quick, smooth turn onto the one you're attacking (not a jump cut); for ~0.35 s at most
  if (G.assistYaw != null) { if (G.t > (G.assistT || 0)) G.assistYaw = null; else { const k = 1 - Math.exp(-18 * dt); G.camYaw += wrapPi(G.assistYaw - G.camYaw) * k; G.lookT = G.t; } }
  // third person: when you run somewhere and leave the mouse alone, the camera swings round behind you
  const S = P.s;
  if (P.alive && !DRIVE.active() && S.speed > 0.6 && G.t - (G.lookT || 0) > 0.7 && !MEL.swing && !G.mouse.right && G.t - G.lastShot > 1.5) {
    const off = wrapPi(S.moveA - G.camYaw);
    if ((keys.has('KeyW') || (G.stick && G.stick.y > 0.5)) && Math.abs(off) < 1.0 && !rdrag.on) G.camYaw += off * (1 - Math.exp(-dt * 1.8 * Math.min(1, S.speed / 3)));
    if (!FP()) G.camPitch = damp(G.camPitch, -0.14, 1.2, dt);
  }
  G.camPitch = FP() ? clamp(G.camPitch, -1.35, 1.25) : clamp(G.camPitch, -0.85, 0.55);
}
const fpHead = V();
let HEADS = null;
function headMeshes() { if (!HEADS) { HEADS = []; P.s.root.traverse(o => { if (o.isMesh && /head|hair|eye|teeth|beard|glasses/i.test(o.name + ' ' + (o.material && o.material.name))) HEADS.push(o); }); } return HEADS; }
const shakeV = V();
// the camera's sight line: like world.ray, but optionally ignoring the roofs' stepped boxes (on a roof or in an attic the
// real slope is checked by camFree instead: the steps stick out of the shingles and would yank the camera in)
const camOff = [];
function camRay(o, d, L, maxY, skipRoofs) {
  camOff.length = 0;
  if (skipRoofs) for (const b of world.near(o.x + d.x * L / 2, o.z + d.z * L / 2, L / 2 + 1.5)) if (b.roofOf && !b.off) camOff.push(b);
  for (const b of camOff) b.off = true;
  const h = world.ray(o, d, L, true, maxY);
  for (const b of camOff) b.off = false;
  return h;
}
// the underside of the lowest slab / roof over a point, above head height (Infinity if open sky)
function ceilOver(x, z, y) {
  let c = Infinity;
  for (const b of world.near(x, z, 0.6)) {
    if (b.off || !(b.y0 > y + 1.3) || b.y0 >= c) continue;
    const dx = x - b.x, dz = z - b.z;
    if (Math.abs(dx * b.c - dz * b.s) < b.hx && Math.abs(dx * b.s + dz * b.c) < b.hz) c = b.y0;
  }
  return c;
}
const houseLZ = (H, x, z) => (x - H.x) * Math.sin(H.yaw) + (z - H.z) * Math.cos(H.yaw);
const houseLX = (H, x, z) => (x - H.x) * Math.cos(H.yaw) - (z - H.z) * Math.sin(H.yaw);
// how far along a → b (0..1) the camera can go before it'd be in the roof (mode 'roof': over the shingles; 'attic':
// under the rafters, inside the gables, over the floor)
const cfP = V();
function camFree(a, b, mode) {
  const H = G.inside, n = 14;
  for (let k = 1; k <= n; k++) {
    const f = k / n; cfP.lerpVectors(a, b, f);
    let bad = false;
    if (mode === 'roof') { const ry = world.roofY(cfP.x, cfP.z); bad = ry !== null && cfP.y < ry + 0.35; }
    else if (H && H.yUnder) {
      const lx = houseLX(H, cfP.x, cfP.z), lz = houseLZ(H, cfP.x, cfP.z);
      bad = Math.abs(lx) > H.hw - 0.25 || Math.abs(lz) > H.hd + 0.3 || cfP.y > H.yUnder(lz) - 0.2 || cfP.y < (H.atticY || 2.94) + 0.25;
    }
    if (bad) return (k - 1) / n;
  }
  return 1;
}
function updateCamera(dt) {
  if (G.state === 'news' && G.news && G.news.tv) return tvRoomCamera(dt);
  // the lift-off: the camera circles the helicopter as it climbs away over the town
  { const hc = G.boarded || G.heliCine ? HELI.cameraTarget() : null;
    if (hc) {
      camera.position.copy(hc.pos); camera.lookAt(hc.look); if (Math.abs(camera.fov - hc.fov) > 0.01) { camera.fov = hc.fov; camera.updateProjectionMatrix(); } fovNow = hc.fov;
      PSCALE.value = innerHeight * renderer.getPixelRatio() / (2 * Math.tan(camera.fov * Math.PI / 360));
      world.update(dt, G.t, hc.pos, null); SND.listener(hc.pos.x, hc.pos.y, hc.pos.z, Math.atan2(hc.look.x - hc.pos.x, hc.look.z - hc.pos.z) + Math.PI);
      SND.setIndoor(0); SND.setNight(world.night); SND.setRain(world.rain || 0); rain.update(dt, G.t, hc.pos, world.rain || 0, null, world.night > 0.5);
      torch.intensity = 0; torch.shadow.autoUpdate = false; document.body.classList.add('cine');
      return;
    }
    document.body.classList.remove('cine'); }
  const S = P ? P.s : null;
  const aimW = G.aimW = damp(G.aimW || 0, P && P.arms.cur && G.mouse.right && G.state === 'play' && P.alive ? 1 : 0, 10, dt);
  // holding the right button without a gun: lean in for a closer look (a quick click is still a shove)
  const zoomOn = P && !P.arms.cur && G.mouse.right && rdrag.on && performance.now() - rdrag.t > 200 && G.state === 'play' && P.alive && !DRIVE.active();
  const zw = G.zoomW = damp(G.zoomW || 0, zoomOn ? 1 : 0, zoomOn ? 5 : 6.5, dt), zoomE = zw * zw * (3 - 2 * zw);
  G.scoped = P && P.alive && P.arms.cur && P.arms.W.scope && aimW > 0.85 && G.state === 'play';
  if (G.state === 'title') { G.camYaw += dt * 0.035; G.camPitch = -0.06; }
  const inside = S ? world.houseAt(S.pos.x, S.pos.z, S.gy || 0) : null; G.inside = inside;
  G.insideK = damp(G.insideK || 0, inside ? 1 : 0, 3, dt);
  const gy0 = S ? S.gy || 0 : 0;
  // where you are decides where the camera may go: up on a roof (over the shingles), in an attic (under the rafters,
  // between the gables), climbing the attic ladder (under the kitchen ceiling), downstairs (under the ceiling)
  // (one threshold with hysteresis for both: up past 2.6 m switches, back under 2.4 m switches back — no flicker at the eaves or the hatch)
  const upHigh = G.upHigh = gy0 > 2.6 ? true : gy0 < 2.4 ? false : !!G.upHigh;
  const onRoof = !!(S && !inside && upHigh && !DRIVE.active() && world.roofY(S.pos.x, S.pos.z) !== null);
  const inAttic = !!(S && inside && inside.yUnder && inside.hatch && upHigh);   // (a real attic — not a prison's / stadium's upper floor)
  G.roofK = damp(G.roofK || 0, onRoof ? 1 : 0, 3, dt); G.atticK = damp(G.atticK || 0, inAttic ? 1 : 0, 3, dt);
  // the pivot at your real eye height (measured off your own head while you stand still-ish: Michelle's shorter than Ben)
  if (S && S.B && S.B.Head && S.crouchW < 0.1 && !(S.jump.y > 0.02) && P.alive && !DRIVE.active()) {
    const hy = S.B.Head.getWorldPosition(V()).y - gy0;
    if (hy > 1.2 && hy < 2.0) G.eyeH = G.eyeH ? damp(G.eyeH, hy, 0.8, dt) : hy;
  }
  const eyeH = clamp((G.eyeH || 1.62) - 0.1, 1.3, 1.75);
  const tgt = V(S ? S.pos.x : 0, (S ? eyeH - S.crouchW * 0.42 + S.jump.y * 0.6 + gy0 : 1.5), S ? S.pos.z : 0);
  // on the attic ladder your head is up through the hatch: the camera stays in the kitchen and looks at the rest of you
  if (S && inside && inside.hatch && !inAttic && !upHigh && gy0 > 0.25) tgt.y = Math.min(tgt.y, 2.3);
  if (inAttic) tgt.y = Math.min(tgt.y, Math.max(gy0 + 1.0, inside.yUnder(houseLZ(inside, S.pos.x, S.pos.z)) - 0.45));
  const DC = DRIVE.cameraTarget(); if (DC) { tgt.copy(DC.pos); if (DC.height) tgt.y += DC.height * 0.3; if (!G.mouse.right && G.t - (G.lookT || 0) > 1.0) { G.camYaw = dampAngle(G.camYaw, DC.yaw, 2.5, dt); G.camPitch = damp(G.camPitch, -0.12, 2, dt); } }
  if (P && !P.alive) tgt.y = 0.8 + (P.s.gy || 0);
  if (G.state === 'escaping' && G.driving && world.truck) tgt.set(world.truck.g.position.x, 1.8, world.truck.g.position.z);
  const snap = !camInit;
  if (!camInit) { pivot.copy(tgt); camInit = true; }
  pivot.x = damp(pivot.x, tgt.x, 18, dt); pivot.z = damp(pivot.z, tgt.z, 18, dt); pivot.y = damp(pivot.y, tgt.y, 8, dt);
  G.recoilP = damp(G.recoilP || 0, 0, 7, dt); G.recoilY = damp(G.recoilY || 0, 0, 7, dt);
  const fpNow = FP();
  // first person <-> third person (and into the bag view, and when you die): the camera glides between them
  G.fpK = snap ? (fpNow ? 1 : 0) : damp(G.fpK || 0, fpNow ? 1 : 0, 9, dt); const fpE = smooth(0, 1, G.fpK);
  const yaw = G.camYaw + G.recoilY;
  let pitch = clamp(G.camPitch + G.recoilP, -0.62, 0.45) - (fpNow ? 0 : G.insideK * 0.08 + G.roofK * 0.1);
  let distT = DC ? DC.dist : G.state === 'title' ? 4.2 : P && !P.alive ? 4.5 : G.state === 'escaping' ? 7 : lerp(lerp(lerp(lerp(lerp(3.2, 2.5, G.insideK), 1.75, G.atticK), 3.4, G.roofK), 1.9, aimW), 1.55, zoomE);
  G.camBase = snap || !G.camBase ? distT : damp(G.camBase, distT, 8, dt);
  const shoulder = DC ? 0 : G.state === 'title' ? 0.3 : P && !P.alive ? 0 : lerp(lerp(lerp(0.55, 0.42, G.atticK), 0.66, aimW), 0.6, zoomE);
  const right = V(-Math.cos(yaw), 0, Math.sin(yaw));
  const dirOf = (pt, out) => out.set(Math.sin(yaw) * Math.cos(pt), Math.sin(pt), Math.cos(yaw) * Math.cos(pt));
  const dir = V();
  // third person: tilt down over a roof's slope until the line from you to the camera clears the shingles
  let tilt = 0;
  if (onRoof && !fpNow && !G.scoped) {
    const side = V().copy(pivot).addScaledVector(right, shoulder), want = V();
    for (let k = 0; k <= 8; k++) { tilt = -k * 0.08; dirOf(pitch + tilt, dir); want.copy(side).addScaledVector(dir, -G.camBase); if (camFree(pivot, want, 'roof') >= 0.999) break; }
  }
  // in an attic: the rafters come down to the floor at the eaves, so the camera stays low behind you (level or looking up a
  // touch) — pick the tilt that leaves the most room between you and the boards
  if (inAttic && !fpNow && !G.scoped) {
    const side = V().copy(pivot).addScaledVector(right, shoulder), want = V(); let best = -1;
    for (let k = 0; k <= 8; k++) { const tt = -0.16 + k * 0.08; dirOf(pitch + tt, dir); want.copy(side).addScaledVector(dir, -G.camBase); const f = camFree(pivot, want, 'attic'); if (f > best + 0.03) { best = f; tilt = tt; } if (f >= 0.999 && tt >= -0.02) break; }
  }
  G.camTilt = snap ? tilt : damp(G.camTilt || 0, tilt, tilt < (G.camTilt || 0) ? 9 : 2.5, dt);
  pitch = Math.max(-1.15, pitch + G.camTilt);
  dirOf(pitch, dir);
  let tpPos = null;
  if (G.scoped) camPos.copy(P.head || pivot).addScaledVector(dir, 0.15);
  else {
    if (fpE < 0.999) {
      tpPos = V();
      const side = V().copy(pivot).addScaledVector(right, shoulder);
      const want = V().copy(side).addScaledVector(dir, -G.camBase);
      const back = V().subVectors(want, pivot); const L = back.length(); back.divideScalar(L);
      // what's in the way: walls, furniture, the tower's posts (not the roof's slopes: on a roof or in an attic its
      // exact shape is checked below instead of the stepped boxes that stop bullets)
      const mode = onRoof ? 'roof' : inAttic ? 'attic' : null;
      const h = camRay(pivot, back, L + 0.2, gy0 + 2.6, !!mode);
      let lim = h && h.t < L + 0.2 ? Math.max(0.3, h.t - 0.25) : L;
      if (mode) lim = Math.min(lim, Math.max(0.3, camFree(pivot, want, mode) * L - 0.15));
      // the camera pulls in at once when something comes between (never through a wall) and eases back out
      G.camDist = snap || G.camDist == null ? lim : lim < G.camDist ? lim : damp(G.camDist, lim, 3, dt);
      tpPos.copy(pivot).addScaledVector(back, Math.min(G.camDist, L));
      tpPos.y = Math.max(tpPos.y, 0.25);
      // keep the lens off the walls either side (small rooms, hallways, the bathroom)
      for (const sg of [1, -1]) { const ax = V().copy(right).multiplyScalar(sg), hh = camRay(tpPos, ax, 0.3, gy0 + 2.6, !!mode); if (hh) tpPos.addScaledVector(ax, -(0.3 - hh.t)); }
      if (inAttic) {
        const ceil = inside.yUnder(houseLZ(inside, tpPos.x, tpPos.z)) - 0.2;
        tpPos.y = clamp(tpPos.y, (inside.atticY || 2.94) + 0.3, Math.max((inside.atticY || 2.94) + 0.3, ceil));
      } else if (inside) {
        // under the ceiling of the floor you're on (big buildings with upstairs — the prison, the stadium stands — find it from the slabs over you)
        let cc = world.camCeil ? world.camCeil(S.pos.x, S.pos.z, gy0) : 2.55;
        if (!inside.hatch && !(inside.yUnder && gy0 > 2.5)) { const co = Math.min(ceilOver(S.pos.x, S.pos.z, gy0), ceilOver(tpPos.x, tpPos.z, gy0)); cc = isFinite(co) ? Math.max(gy0 + 1.5, co - 0.22) : gy0 > 1 ? gy0 + 2.3 : cc; }
        tpPos.y = Math.min(tpPos.y, cc);
        if (gy0 > 1) tpPos.y = Math.max(tpPos.y, gy0 + 0.35);   // never under the floor you're standing on
      }
      if (onRoof) { const ry = world.roofY(tpPos.x, tpPos.z); if (ry !== null) tpPos.y = Math.max(tpPos.y, ry + 0.3); }
      // the attic switch moves the camera up/down through the hatch: glide there (in the hatch's opening), never pop through the ceiling
      const hat = inside && inside.hatch;
      if (hat && hat.length === 4 && gy0 > 2.0 && gy0 < 3.2 && G.camY != null && Math.abs(G.camY - tpPos.y) > 0.05) {
        const fl = inside.flip || 1, ax = fl * Math.min(hat[0], hat[2]), bx = fl * Math.max(hat[0], hat[2]), x0 = Math.min(ax, bx) + 0.15, x1 = Math.max(ax, bx) - 0.15;
        const lx = clamp(houseLX(inside, tpPos.x, tpPos.z), x0, x1), lz = clamp(houseLZ(inside, tpPos.x, tpPos.z), hat[1] + 0.15, hat[3] - 0.15), c2 = Math.cos(inside.yaw), s2 = Math.sin(inside.yaw);
        tpPos.x = inside.x + lx * c2 + lz * s2; tpPos.z = inside.z - lx * s2 + lz * c2;
      }
      G.camY = snap || G.camY == null || Math.abs(G.camY - tpPos.y) > 3 ? tpPos.y : damp(G.camY, tpPos.y, 10, dt);
      tpPos.y = G.camY;
    }
    if (fpE > 0.001) {
      // first person: from your own eyes (smoothed a touch so the walk doesn't shake the view)
      const h = P.s.B.Head.getWorldPosition(V());
      if (fpHead.lengthSq() === 0 || fpHead.distanceTo(h) > 1) fpHead.copy(h);
      fpHead.x = damp(fpHead.x, h.x, 30, dt); fpHead.y = damp(fpHead.y, h.y, 14, dt); fpHead.z = damp(fpHead.z, h.z, 30, dt);
      camPos.copy(fpHead).addScaledVector(V(Math.sin(yaw), 0, Math.cos(yaw)), P.body === 'michelle' ? 0.17 : 0.11); camPos.y += 0.07;
      if (tpPos) camPos.lerp(tpPos, 1 - fpE);
    } else camPos.copy(tpPos);
    G.tooClose = fpE < 0.5 && camPos.distanceTo(pivot) < 0.9;
  }
  C.shake = Math.max(0, C.shake - dt * 1.6);
  const sh = (save.shake ? 1 : 0.3) * (C.shake * C.shake + (G.grabbedBy ? 0.04 : 0)), t = G.t;
  shakeV.set(Math.sin(t * 37) * 0.6 + Math.sin(t * 71) * 0.4, Math.sin(t * 43 + 1) * 0.6 + Math.sin(t * 89) * 0.4, 0).multiplyScalar(sh * 0.12);
  camLook.copy(camPos).addScaledVector(dir, 10);
  // the backpack open in front of you: the camera comes round to look at you (you're on the left, the bag's contents on the right)
  G.bagCamK = damp(G.bagCamK || 0, S && P.alive && (G.state === 'bag' || (G.packAnim && G.packAnim.dir > 0 && PACK.swing > 0.3)) ? 1 : 0, 3.2, G.state === 'bag' ? dt * 4 : dt);
  if (G.bagCamK > 0.001 && S) {
    const e = smooth(0, 1, G.bagCamK), ch = S.B.Spine2.getWorldPosition(V()), f = fwdOf(V()), r = rightOf(V());
    const bp = ch.clone().addScaledVector(f, 1.5).addScaledVector(r, 0.55); bp.y += 0.25;
    const d = bp.clone().sub(ch), L = d.length(); d.divideScalar(L);
    const h = world.ray(ch, d, L + 0.25, true, (S.gy || 0) + 2.6); if (h && h.t < L + 0.25) bp.copy(ch).addScaledVector(d, Math.max(0.55, h.t - 0.22));
    const look = ch.clone(); look.y -= 0.18; const vd = look.clone().sub(bp).normalize(), cr = V().crossVectors(vd, V(0, 1, 0)).normalize();
    look.addScaledVector(cr, 0.62 * Math.min(1, bp.distanceTo(ch) / 1.5));
    camPos.lerp(bp, e); camLook.lerp(look, e);
  }
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  camera.rotateX(shakeV.y * 0.5); camera.rotateY(shakeV.x * 0.5);
  // a little sway when you're hurt or exhausted
  if (P && P.alive && G.state === 'play') { const k = (1 - P.hp / P.maxHp) * 0.012 + (G.winded ? 0.01 : 0); camera.rotateZ(Math.sin(t * 1.1) * k); camera.rotateX(Math.sin(t * 0.8) * k * 0.6); }
  const fovT = DC && DC.fov ? DC.fov : G.scoped ? 60 / (P.arms.W.scope || 4) : FP() ? lerp(lerp(72, 58, aimW), 46, zoomE) : lerp(lerp(55, 44, aimW) + (G.insideK * 6), 36, zoomE);
  fovNow = G.scoped ? fovT : damp(fovNow, fovT, DC ? 3 : 12, dt);
  if (Math.abs(camera.fov - fovNow) > 0.01) { camera.fov = fovNow; camera.updateProjectionMatrix(); }
  PSCALE.value = innerHeight * renderer.getPixelRatio() / (2 * Math.tan(camera.fov * Math.PI / 360));
  if (P && G.state !== 'escaping') {
    const hideMe = G.inAmb || !DRIVE.active() && (G.scoped || (G.tooClose && P.alive && !(G.bagCamK > 0.3))); P.s.setVisible(!hideMe); if (P.arms.cur && P.alive) for (const id in P.arms.guns) P.arms.guns[id].visible = !hideMe && id === P.arms.cur;
    // in first person your own head isn't in the way (the rest of you is: look down and you'll see your feet)
    const fp = (G.fpK || 0) > 0.5 && FP(); if (fp !== G.fpHidden) { G.fpHidden = fp; for (const m of headMeshes()) m.visible = !fp; }
  }
  world.update(dt, G.t, S ? S.pos : pivot, inside);
  LANTERN.update(dt, G.t);
  SND.listener(camPos.x, camPos.y, camPos.z, yaw + Math.PI);
  SND.setIndoor(G.insideK); SND.setNight(world.night); SND.setRain(G.state === 'title' ? 0 : world.rain || 0);
  rain.update(dt, G.t, camPos, G.state === 'title' ? 0 : world.rain || 0, inside, world.night > 0.5);
  if (G.state !== 'title' && (G.state !== 'play' || !P.alive)) world.setTime(G.hour);   // (survive() re-bases the light only while you're alive and playing)
  if (G.boltFlash > 0) { world.hemi.intensity += G.boltFlash * 6; scene.environmentIntensity += G.boltFlash * 2; }
  // daylight bouncing round a room through the windows
  if (G.state !== 'title') { world.hemi.intensity += G.insideK * 0.6 * world.daylight; scene.environmentIntensity += G.insideK * 0.3 * world.daylight; }
  // the flashlight beam: from your chest to where you're looking
  const on = G.flashlight && G.inv && G.inv.flashlight > 0 && G.battery > 0 && P && P.alive && G.state !== 'title';
  const dim = G.battery < 15 ? 0.35 + 0.65 * (G.battery / 15) * (Math.random() < 0.04 ? 0.2 : 1) : 1;
  torch.intensity = on ? 90 * dim * (1 - 0.9 * world.daylight) * (1 - 0.5 * G.insideK * world.daylight) : 0;
  torch.shadow.autoUpdate = torch.intensity > 0.5;   // no shadow pass for a torch that's off (no recompile either)
  // the flashlight itself, clipped to the vest's left strap: the beam comes out of its lens
  const fl = P && S && S.B && S.B.Spine2 ? torchModel(S) : null;
  if (fl) { fl.visible = !!(G.inv && G.inv.flashlight > 0) && G.state !== 'title' && !(G.fpHidden && G.fpK > 0.9); fl.userData.lens.material.emissiveIntensity = on ? 4 * dim : 0; fl.userData.halo.material.opacity = on ? 0.6 * dim * (1 - 0.8 * world.daylight) : 0; }
  if (on) {
    const ch = P.chest || S.pos;
    const yawL = P.s.aimYaw ?? P.s.yaw;
    if (fl && fl.visible) fl.userData.lens.getWorldPosition(torch.position).add(V(Math.sin(yawL) * 0.04, 0, Math.cos(yawL) * 0.04));
    else torch.position.set(ch.x + Math.sin(yawL) * 0.25, ch.y + 0.1, ch.z + Math.cos(yawL) * 0.25);
    torch.target.position.lerp(V().copy(G.aimPoint).setY(Math.max(0.2, G.aimPoint.y)), 0.35);
  }
}

// ---------------------------------------------------------------- HUD
const ov = $('overlay'), octx = ov.getContext('2d');
function drawOverlay(dt) {
  const dpr = ODPR(), W = ov.width, H = ov.height;
  octx.clearRect(0, 0, W, H);
  if (G.state === 'play' || G.state === 'news' || G.state === 'dead') drawBubbles();
  if (G.state !== 'play' && G.state !== 'dead') return;
  const x = G.mouse.x * dpr, y = G.mouse.y * dpr;
  if (P.alive && !G.scoped) {
    const A = P.arms;
    octx.shadowColor = 'rgba(0,0,0,0.85)'; octx.shadowBlur = 3 * dpr;
    if (A.cur) {
      const Wp = A.W;
      const sp = lerp(Wp.hip, Wp.aim, A.aimW) * (1 + Math.min(1, P.s.speed / 3) * 1.5) * (P.s.crouchW > 0.5 ? 0.7 : 1);
      const f = H / (2 * Math.tan(camera.fov * Math.PI / 360));
      const gap = Math.max(4 * dpr, sp * f), L = 8 * dpr;
      octx.strokeStyle = 'rgba(255,255,255,0.9)'; octx.lineWidth = 1.6 * dpr;
      octx.beginPath();
      octx.moveTo(x - gap - L, y); octx.lineTo(x - gap, y); octx.moveTo(x + gap, y); octx.lineTo(x + gap + L, y);
      octx.moveTo(x, y - gap - L); octx.lineTo(x, y - gap); octx.moveTo(x, y + gap); octx.lineTo(x, y + gap + L);
      octx.stroke();
      if (A.reloadT >= 0) { octx.strokeStyle = 'rgba(255,255,255,0.8)'; octx.lineWidth = 2.5 * dpr; octx.beginPath(); octx.arc(x, y, 22 * dpr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (A.reloadT / A.reloadDur)); octx.stroke(); }
    } else {
      // melee: a small ring that tightens when something's in reach
      const inReach = G.aimUnit && G.aimUnit.alive && G.aimUnit.s.pos.distanceTo(P.s.pos) < MEL.W.reach + 0.4;
      octx.strokeStyle = inReach ? 'rgba(255,110,90,0.95)' : 'rgba(255,255,255,0.75)'; octx.lineWidth = 1.6 * dpr;
      octx.beginPath(); octx.arc(x, y, (inReach ? 7 : 10) * dpr, 0, 7); octx.stroke();
    }
    octx.fillStyle = G.aimUnit && G.aimUnit.alive ? '#ff5a4a' : 'rgba(255,255,255,0.9)';
    octx.beginPath(); octx.arc(x, y, 1.6 * dpr, 0, 7); octx.fill();
    octx.shadowBlur = 0;
  }
  // searching: a ring round the middle of the screen
  if (G.search) {
    const k = G.search.t / G.search.dur, cx = W / 2, cy = H * 0.62;
    octx.lineWidth = 4 * dpr; octx.strokeStyle = 'rgba(255,255,255,0.15)'; octx.beginPath(); octx.arc(cx, cy, 26 * dpr, 0, 7); octx.stroke();
    octx.strokeStyle = '#e8e4da'; octx.beginPath(); octx.arc(cx, cy, 26 * dpr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); octx.stroke();
    octx.fillStyle = '#e8e4da'; octx.font = `500 ${13 * dpr}px Oswald, -apple-system, Helvetica`; octx.textAlign = 'center'; octx.fillText(G.search.fuel ? 'FILLING THE TANK' : 'SEARCHING', cx, cy + 46 * dpr);
  }
  if (hitT > 0) {
    hitT -= dt;
    const s = (hitKill ? 12 : 8) * dpr, g = 5 * dpr;
    octx.strokeStyle = hitKill ? '#ff4a3a' : hitHead ? '#ffd27a' : '#fff'; octx.lineWidth = 2.2 * dpr; octx.globalAlpha = Math.min(1, hitT * 6);
    octx.beginPath(); for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { octx.moveTo(x + a * g, y + b * g); octx.lineTo(x + a * (g + s), y + b * (g + s)); } octx.stroke(); octx.globalAlpha = 1;
  }
  const cx = W / 2, cy = H / 2;
  for (let i = G.hurtDir.length - 1; i >= 0; i--) {
    const d = G.hurtDir[i]; d.t -= dt; if (d.t <= 0) { G.hurtDir.splice(i, 1); continue; }
    const a = -d.a - Math.PI / 2, r = Math.min(W, H) * 0.18;
    octx.strokeStyle = `rgba(200,30,20,${Math.min(0.85, d.t)})`; octx.lineWidth = 7 * dpr;
    octx.beginPath(); octx.arc(cx, cy, r, a - 0.3, a + 0.3); octx.stroke();
  }
  // the bottle arc while winding up a throw
  if (P.arms.throwT >= 0 && !P.arms.thrown && P.alive) {
    const hand = P.s.B.RightHand.getWorldPosition(V()), tgt = G.aimPoint.clone();
    const dd = Math.hypot(tgt.x - hand.x, tgt.z - hand.z); if (dd > 26) tgt.lerpVectors(hand, tgt, 26 / dd);
    const v = lob(hand, tgt, 15), p = hand.clone();
    octx.fillStyle = 'rgba(255,230,160,0.8)';
    for (let i = 0; i < 40; i++) { p.addScaledVector(v, 0.05); v.y -= 9.8 * 0.05; if (p.y < (world.groundY ? world.groundY(p.x, p.z, p.y) : 0)) break; const s = p.clone().project(camera); if (s.z > 1) continue; octx.beginPath(); octx.arc((s.x * 0.5 + 0.5) * W, (-s.y * 0.5 + 0.5) * H, 2 * dpr, 0, 7); octx.fill(); }
  }
}
let hudT = 0;
const bar = (id, v) => { $(id).firstElementChild.style.width = clamp(v, 0, 100) + '%'; };
function hud(dt) {
  capTick(dt);
  if (bigT > 0) { bigT -= dt; if (bigT <= 0) { $('big').style.opacity = 0; document.body.classList.remove('bigOn'); } }
  $('scope').classList.toggle('on', !!G.scoped);
  if (G.scoped) { $('scope').style.setProperty('--x', '50%'); $('scope').style.setProperty('--y', '50%'); }
  if (G.grabbedBy) $('strB').style.width = (G.struggle * 100) + '%';
  document.body.classList.toggle('isdead', G.state === 'dead' || G.state === 'result');
  if (G.state !== 'pause') document.body.classList.remove('paused');
  { const ui = (G.state === 'play' || G.state === 'dead' || (G.state === 'escaping' && G.boarded && !G.heliCine)) && G.phase !== 'title'; if (ui !== G.heliUI) { G.heliUI = ui; HELI.setUIVisible(ui); } }
  hudT -= dt; if (hudT > 0 || !P || G.state === 'title') return; hudT = 0.1;
  bar('hpB', P.hp); $('hpN').textContent = Math.ceil(P.hp); $('vHp').classList.toggle('low', P.hp < 30);
  bar('stB', G.stam); $('stN').textContent = Math.round(G.stam); $('vSt').classList.toggle('low', G.winded);
  bar('fdB', G.food); $('fdN').textContent = Math.round(G.food); $('vFd').classList.toggle('low', G.food < 20);
  bar('wtB', G.water); $('wtN').textContent = Math.round(G.water); $('vWt').classList.toggle('low', G.water < 20);
  $('vIn').style.display = G.infection > 0 ? '' : 'none'; bar('inB', G.infection); $('inN').textContent = Math.round(G.infection);
  const st = [];
  if (G.bleed > 0) st.push(`<span class="st">${icon('blood')}BLEEDING · ${TOUCH ? 'TAP HEAL' : 'Q'}</span>`);
  if (G.infection > 0) st.push(`<span class="st y">${icon('bio')}INFECTED</span>`);
  if (G.winded) st.push(`<span class="st g">${icon('stamina')}WINDED</span>`);
  if (G.crouch) st.push('<span class="st g">CROUCHED</span>');
  if (G.inside) st.push(`<span class="st g">INDOORS</span>`);
  const sh = st.join(''); if ($('status')._h !== sh) { $('status').innerHTML = sh; $('status')._h = sh; }
  // the clock
  const hh = Math.floor(G.hour), mm = Math.floor((G.hour - hh) * 60);
  $('clDay').textContent = `DAY ${G.day} · ${DIFF.name}`; $('clTime').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  $('clNote').textContent = G.hour >= 19.5 && G.hour < 21 ? 'NIGHT IS COMING' : G.hour >= 21 || G.hour < 5 ? 'NIGHT' : world.rain > 0.5 ? 'RAIN' : '';
  { const nt = G.hour >= 20 || G.hour < 6, ci = nt ? 'moon' : 'sun'; if ($('clIc')._h !== ci) { $('clIc').innerHTML = icon(ci); $('clIc')._h = ci; $('clIc').classList.toggle('night', nt); } }
  // objectives
  const CHL = CHS(), st2 = Math.max(0, Math.min(Math.floor(G.stage) || 0, CHL.length - 1)), CH = CHL[st2] || CHL[0] || {}, MP = MAPLE(), lastCh = st2 >= CHL.length - 1;
  const calm = G.phase === 'calm' || G.phase === 'news';
  const hs = HELI.state(), nf = HELI.nextFlight(), nowH = (G.day - 1) * 24 + G.hour, hm = h => `${Math.floor(h)}h ${String(Math.floor((h % 1) * 60)).padStart(2, '0')}m`;
  const left = nf ? (nf.day - 1) * 24 + nf.hour - nowH : -1;
  const goal = !MP ? (lastCh && hs === 'waiting' && G.missed ? `It left without you. The <b>last ${rideName()}</b> comes to <b>${lzH()}</b> at <b>${hhmm(nf ? nf.hour : endHour())}</b> tomorrow. Stay alive.` : lastCh && hs === 'landed' ? `It's waiting at <b>${lzH()}</b>. Get aboard — <b>E</b>.` : goalOf(CH)) : st2 === 3 && hs === 'waiting' && G.missed ? 'It left without you. The <b>last helicopter</b> lands at <b>Main &amp; Maple</b>, <b>02:00</b> tomorrow night. Stay alive.' : st2 === 3 && hs === 'landed' ? 'It\'s on the ground at <b>Main &amp; Maple</b>. Get in — <b>E</b> at the open door.' : CH.goal;
  let oh = calm && !MP ? `<div class="o">${icon('target')}<span>${G.phase === 'news' ? 'Listen...' : (STORY.calmGoal || `A normal day in <b>${mapName()}</b>. Look around — get to know the place.`)}</span></div>` : calm ? `<div class="o">${icon('target')}<span>${G.phase === 'news' ? 'What is happening at the <b>Quick Stop</b>?' : G.prologue ? 'Head home. Lunch is at noon — <b>put the TV on</b>.' : 'A quiet Saturday. Say hi to <b>Dale</b> — he\'s washing his pickup at <b>68 Main St</b>.'}</span></div>` : `<div class="o">${icon('target')}<span>${G.stage === 0.5 ? 'Listen...' : !calm && hs === 'orbit' ? (MP ? 'It can\'t land — <b>clear the crossroads!</b>' : `It's circling — it can't land yet! ${(END() && END().notReadyGoal) || (END() && END().ready && CHL.length > 1 ? goalOf(CHL[CHL.length - 2]) : '')}`) : goal}</span></div>`;
  if (!calm && st2 === 1 && MP) { const sp = supplies(); oh += `<div class="o ${sp.weapon ? 'done' : ''}">${icon(sp.weapon ? 'check' : 'bat')}<span>A weapon</span></div><div class="o ${sp.food >= 2 ? 'done' : ''}">${icon(sp.food >= 2 ? 'check' : 'food')}<span>Food <small>${Math.min(sp.food, 2)}/2</small></span></div><div class="o ${sp.drink >= 2 ? 'done' : ''}">${icon(sp.drink >= 2 ? 'check' : 'water')}<span>Water <small>${Math.min(sp.drink, 2)}/2</small></span></div>`; }
  if (!calm && MP && st2 >= 1 && G.notes.includes('dale1') && !(world.truck && world.truck.fueled && G.inv.keys > 0)) oh += `<div class="o side ${world.truck && world.truck.fueled ? 'done' : ''}">${icon('gas')}<span>Dale's pickup: ${world.truck && world.truck.fueled ? 'fueled' : G.inv.gascan > 0 ? '<b>fill the tank</b>' : 'needs gas'} · ${G.inv.keys > 0 ? 'keys ✓' : 'needs keys'}</span></div>`;
  if (!calm && st2 >= 1) {
    const RIC = rideName() === 'helicopter' ? 'heli' : 'clock', RD = rideName().toUpperCase(), LZU = MP ? 'MAIN &amp; MAPLE' : lzH().toUpperCase();
    if (hs === 'landed') oh += `<div class="dl hot">${icon(RIC)}${RD} ${MP || RD === 'HELICOPTER' ? 'ON THE GROUND' : 'WAITING'} · ${Math.ceil(HELI.timeLeft())} s</div>`;
    else if (hs === 'inbound' || hs === 'descend') oh += `<div class="dl hot">${icon(RIC)}${RD} INBOUND · ${LZU}</div>`;
    else if (hs === 'orbit') oh += `<div class="dl hot">${icon(RIC)}${RD} CIRCLING · CAN'T LAND</div>`;
    else if (hs === 'liftoff' || hs === 'outbound') oh += `<div class="dl">${icon(RIC)}THE ${RD} IS LEAVING</div>`;
    else if (left > 0) oh += `<div class="dl ${left < 1 ? 'hot' : ''}">${icon(RIC)}${nf && G.missed ? 'LAST ' : ''}${RD} IN ${hm(left)} · ${hhmm(nf.hour)}</div>`;
    else oh += `<div class="dl">${icon('clock')}NO MORE ${RD}S</div>`;
  }
  $('objCh').textContent = calm && !MP ? 'PROLOGUE · ' + String(mapName()).toUpperCase() : calm ? 'PROLOGUE · SATURDAY' : `CHAPTER ${st2 + 1} · ${CH.title}`;
  if (TOUCH) oh = touchWords(oh);
  if ($('objList')._h !== oh) { $('objList').innerHTML = oh; $('objList')._h = oh; document.documentElement.style.setProperty('--objB', Math.round($('obj').getBoundingClientRect().bottom) + 'px'); }
  // compass with where you're going on it
  let ch = '';
  const cw = $('compass').clientWidth || 360, hw = cw / 2;
  for (const [l, a] of [['N', Math.PI], ['E', Math.PI / 2], ['S', 0], ['W', -Math.PI / 2]]) { const rel = wrapPi(a - G.camYaw); if (Math.abs(rel) < 1.4) ch += `<span style="left:${hw - rel / 1.4 * hw}px">${l}</span>`; }
  const lzShort = () => lzName().replace(/^the /i, '').replace(/\s*\(.*\)\s*$/, '').toUpperCase();
  const notReady = !MP && END() && typeof END().ready === 'function' && hs !== 'landed' && hs !== 'descend' && (() => { try { return !END().ready(); } catch (e) { return false; } })();   // e.g. the stadium: the floodlights first
  const stT = notReady && lastCh && CHL.length > 1 ? CHL.length - 2 : st2;
  const tg = !MP ? (calm ? null : !notReady && (lastCh || (st2 === CHL.length - 2 && left < 1.5 && left > 0)) || hs === 'landed' || hs === 'descend' ? [LZ, hs === 'landed' || hs === 'descend' ? rideName().toUpperCase() : lzShort()] : (() => { const o = objectiveSpot(stT); return o ? [o, ((CHL[stT] || CH).title || '').toUpperCase()] : lastCh ? [LZ, lzShort()] : null; })())
    : G.phase === 'calm' ? (G.prologue ? [G.tvSpot, 'HOME'] : [world.truck, 'DALE']) : G.phase === 'news' ? null
    : st2 >= 3 || (st2 === 2 && left < 1.5) ? [LZ, hs === 'landed' || hs === 'descend' ? 'HELICOPTER' : 'CROSSROADS']
    : st2 === 2 ? [LZ, 'MAIN & MAPLE']
    : st2 === 1 && G.inv.gascan > 0 && world.truck && !world.truck.fueled && G.notes.includes('dale1') ? [world.truck, 'TRUCK'] : null;
  if (tg && tg[0]) { const a = Math.atan2(tg[0].x - P.s.pos.x, tg[0].z - P.s.pos.z), rel = wrapPi(a - G.camYaw), d = Math.hypot(tg[0].x - P.s.pos.x, tg[0].z - P.s.pos.z); if (Math.abs(rel) < 1.4) ch += `<span class="m" style="left:${clamp(hw - rel / 1.4 * hw, Math.max(70, cw * 0.3), Math.min(cw - 70, cw * 0.7))}px;white-space:nowrap">▼ ${tg[1]} ${d.toFixed(0)}m</span>`; }
  $('compass').innerHTML = ch;
  // weapon
  const A = P.arms;
  { const wi = ITEM_ICON[G.weapon] || 'fist'; if ($('wic')._h !== wi) { $('wic').innerHTML = icon(wi); $('wic')._h = wi; } }
  if (A.cur) {
    const W = A.W, a = A.ammo[A.cur];
    $('wname').textContent = W.name; $('wcount').innerHTML = `${a.mag}<small>/ ${G.inv[W.ammo] || 0}</small>`; $('wcount').classList.toggle('empty', a.mag === 0); $('wdur').style.display = 'none';
  } else {
    const W = MEL.W;
    $('wname').textContent = W.name; $('wcount').innerHTML = ''; $('wdur').style.display = W.id === 'fists' ? 'none' : '';
    if (W.id !== 'fists') $('wdur').firstElementChild.style.width = (G.melee[W.id] / W.dur * 100) + '%';
  }
  const qx = `<span>${icon('bottle')}${G.inv.bottle || 0}<em>G</em></span><span>${icon('flame')}${G.inv.molotov || 0}<em>H</em></span><span>${icon('cross')}${(G.inv.bandage || 0) + (G.inv.medkit || 0)}<em>Q</em></span><span class="${G.flashlight ? 'on' : ''}">${icon('torch')}${Math.round(G.battery)}%<em>F</em></span>`;
  if ($('wextra')._h !== qx) { $('wextra').innerHTML = qx; $('wextra')._h = qx; }
  const slots = [['fists', 1, 'FISTS'], [MELEE_ORDER.find(id => G.melee[id] != null && id === G.weapon) || MELEE_ORDER.find(id => G.melee[id] != null), 2, 'MELEE'], ['pistol', 3, 'PISTOL'], ['shotgun', 4, 'SHOTGUN'], ['sniper', 5, 'RIFLE']];
  const sl = slots.map(([id, n, nm]) => { const have = id === 'fists' || (id && (MELEE[id] ? G.melee[id] != null : A.guns[id])); const on = id && G.weapon === id; return `<div class="slot ${on ? 'on' : ''} ${have ? '' : 'none'}"><b>${n}</b>${icon(ITEM_ICON[id || ''] || (n === 2 ? 'bat' : 'fist'))}${id && MELEE[id] && id !== 'fists' ? MELEE[id].name.split(' ').slice(-1)[0] : nm}</div>`; }).join('');
  if ($('slots')._h !== sl) { $('slots').innerHTML = sl; $('slots')._h = sl; }
  const ctx = G.state === 'play' && P.alive && !G.grabbedBy ? context() : null;
  G.ctx = ctx;
  { const ph = ctx ? `${TOUCH ? touchIcon('hand') : '<kbd>E</kbd>'} ${ctx.label}${ctx.sub ? `<span class="sm">${TOUCH ? touchWords(ctx.sub) : ctx.sub}</span>` : ''}` : ''; if ($('prompt')._h !== ph) { $('prompt').innerHTML = ph; $('prompt')._h = ph; } }
}

// ---------------------------------------------------------------- menus
function startAudio() { SND.init(); SND.setMusic(save.music); SND.setSfx(save.sfx); SND.start(); }
function showDiffs() {
  const lvl = { easy: 1, medium: 2, hard: 3, extreme: 4, apocalypse: 5, zombiex: 6 };
  const barH = (ic, lbl, v) => `<div class="stat">${icon(ic)}<span>${lbl}</span><span class="b"><i style="width:${Math.round(Math.min(1, v) * 100)}%"></i></span></div>`;
  $('diffList').innerHTML = Object.entries(DIFFS).map(([k, d]) => `<button class="dbtn ${k} ${save.diff === k ? 'on' : ''}" data-d="${k}"><div class="top"><b>${d.name}</b><span class="sk">${Array.from({ length: 6 }, (_, i) => icon('skull', i < lvl[k] ? '' : 'off')).join('')}</span></div><small>${d.desc}</small>${barH('zombie', 'HORDE', d.count / 6)}${barH('speed', 'SPEED', (d.allRun ? 2.4 : d.speed) / 2.4)}${barH('dmg', 'DAMAGE', d.dmg / 4)}</button>`).join('');
  $('diffList').insertAdjacentHTML('beforeend', `<button class="dbtn rnd" data-d="random" style="text-align:left"><div class="top"><b>🎲 RANDOM DIFFICULTY</b></div><small>Let fate decide how bad it is — you find out when the day starts.</small></button>`);
  // pick a map and a difficulty (just highlights them) — nothing starts until you press Continue
  let pickMap = MAP_ID, pickDiff = save.diff || 'medium';
  const mark = () => { for (const b of $('diffList').querySelectorAll('button')) b.classList.toggle('on', b.dataset.d === pickDiff); for (const b of $('mapList').querySelectorAll('button')) b.classList.toggle('on', b.dataset.m === pickMap); $('diffGo').textContent = pickMap === 'random' ? 'Continue — random map' : pickMap === MAP_ID ? 'Continue' : 'Continue — load ' + MAPS[pickMap].name; };
  for (const b of $('diffList').querySelectorAll('button')) b.onclick = () => { if (!SND.raw || !SND.raw()) startAudio(); pickDiff = b.dataset.d; mark(); };
  let ml = $('mapList'); if (!ml) { ml = document.createElement('div'); ml.id = 'mapList'; ml.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:0 auto 14px;max-width:980px'; $('diffList').parentNode.insertBefore(ml, $('diffList')); }
  if (!$('mapCss')) { const st = document.createElement('style'); st.id = 'mapCss'; st.textContent = '#mapList .dbtn.on{border-color:#d8c27a;box-shadow:inset 0 0 0 1px #d8c27a;background:rgba(216,194,122,.08)}'; document.head.appendChild(st); }
  ml.innerHTML = Object.values(MAPS).map(m => `<button class="dbtn map ${MAP_ID === m.id ? 'on' : ''}" data-m="${m.id}" style="text-align:left"><div class="top"><b>${m.name}</b></div><small>${m.blurb}</small></button>`).join('');
  ml.insertAdjacentHTML('beforeend', `<button class="dbtn rnd" data-m="random" style="text-align:left"><div class="top"><b>🎲 RANDOM MAP</b></div><small>Any one of the five — a surprise.</small></button>`);
  for (const b of ml.querySelectorAll('button')) b.onclick = () => { pickMap = b.dataset.m; mark(); };
  $('diffGo').onclick = () => { if (!SND.raw || !SND.raw()) startAudio();
    const pick = a => a[Math.floor(Math.random() * a.length)];
    if (pickDiff === 'random') pickDiff = pick(Object.keys(DIFFS)); if (pickMap === 'random') pickMap = pick(Object.keys(MAPS));
    save.diff = pickDiff; writeSave(); if (pickMap !== MAP_ID) { $('diffGo').textContent = 'Loading…'; switchMap(pickMap, true); } else showWho(() => introThen(newGame)); };
  mark(); showScreen('diff'); const sc = $('diff').querySelector('.center-panel'); if (sc) sc.scrollTop = 0;
}
$('btnPlay').onclick = () => { startAudio(); showDiffs(); };
$('btnMP').onclick = () => { startAudio(); MP.openLobby(); };   // MP
document.body.classList.toggle('hc', !!save.hc);
$('btnCont').onclick = () => { startAudio(); showSlots('load'); };
$('diffBack').onclick = () => showScreen('title');
$('btnHow').onclick = () => { startAudio(); showScreen('howto'); };
$('howBack').onclick = () => showScreen('title');
function togglePause() {
  if (G.state === 'play' || (G.state === 'escaping' && G.boarded && !G.heliCine)) {
    unlockMouse();
    G.prevState = G.state; G.state = 'pause'; keys.clear(); G.mouse.left = G.mouse.right = false; showScreen('pause'); SND.pause(true); document.body.classList.add('paused');
    $('pauseSub').textContent = `${DIFF.name} · day ${G.day} · ${G.stats.kills} put down`;
    STATS.showInPause(document.querySelector('#pause .center-panel')); $('restart').style.display = MP.on() ? 'none' : ''; HELI.setMuted(true); HELI.setUIVisible(false);
  } else if (G.state === 'pause') { G.state = G.prevState || 'play'; showScreen(null); SND.pause(false); document.body.classList.remove('paused'); HELI.setMuted(false); HELI.setUIVisible(true); lockMouse(); }
}
$('resume').onclick = togglePause;
$('restart').onclick = () => ask('Start over?', 'Your run in this slot will restart from the beginning. Your checkpoint will be lost.', 'Start over', () => { STATS.commitRun({ how: 'quit', hours: (G.day - 1) * 24 + G.hour - G.startHour }); SND.pause(false); showScreen(null); G.ckpt = null; newGame(); }, 'Keep playing');
$('toMenu').onclick = () => quitAsk();
function sliderFill() { for (const e of document.querySelectorAll('.center-panel input[type=range]')) e.style.setProperty('--fill', ((e.value - e.min) / (e.max - e.min) * 100) + '%'); }
addEventListener('input', e => { if (e.target.type === 'range') sliderFill(); });
function syncSettings() { $('vmusic').value = save.music; $('vsfx').value = save.sfx; $('vq').value = save.quality; $('vshake').checked = save.shake; $('vsens').value = save.sens; $('vview').value = save.view; $('vinv').checked = !!save.invert; sliderFill(); world.firstPerson = save.view === 'first'; }
$('vsens').addEventListener('input', e => { save.sens = +e.target.value; writeSave(); });
$('vview').addEventListener('change', e => { save.view = e.target.value; world.firstPerson = save.view === 'first'; writeSave(); });
$('vinv').addEventListener('change', e => { save.invert = e.target.checked; writeSave(); });
$('vmusic').addEventListener('input', e => { save.music = +e.target.value; SND.setMusic(save.music); writeSave(); });
$('vsfx').addEventListener('input', e => { save.sfx = +e.target.value; SND.setSfx(save.sfx); writeSave(); });
$('vq').addEventListener('change', e => { save.quality = +e.target.value; buildComposer(); writeSave(); });
$('vshake').addEventListener('change', e => { save.shake = e.target.checked; writeSave(); });

// ---------------------------------------------------------------- loop
let dtS = 1 / 60;
function step(dt) {
  // nothing can hurt you until you're actually playing (title, difficulty picker, intro, menus)
  C.godMode = !['play', 'bag', 'note', 'escaping', 'phone'].includes(G.state) || !!G.boarded || !!G.inAmb;
  C.calm = G.state === 'title' || G.state === 'intro' || G.state === 'loading';
  if ((G.state === 'pause' && !MP.on()) || (G.state === 'shop' && !MP.on()) || G.state === 'bag' && false) return;   // [zLux] the shop screen pauses too   // MP: online, the world never stops for one player's pause menu
  if (G.hitStop > 0) { G.hitStop -= dt; dt *= 0.2; }
  if (G.locked && !LOOK_STATES.includes(G.state)) unlockMouse();
  const bagOpen = G.state === 'bag' || G.state === 'note' || G.state === 'phone';
  const rdt = dt;
  if (TC) TC.tick(rdt);
  if (bagOpen && !MP.on()) dt *= 0.25;   // the world slows (not stops) while you rummage in your bag
  G.t += dt; C.t = G.t;
  runTimers();
  SHOP.update(dt);   // [zLux]
  if (G.state === 'play' || G.state === 'dead' || bagOpen) {
    edgeSteer(dt);
    if (G.state !== 'dead') survive(dt);
  }
  if (G.state !== 'news' && G.noCull) { G.noCull = false; PEOPLE.PPL.noCull = false; }
  if (G.state !== 'phone' && G.state !== 'pause' && $('phone').classList.contains('show')) { $('phone').classList.remove('show'); PH.call = null; }
  if (G.state === 'title') {
    P.s.update(dt, { move: null, aimYaw: P.s.yaw, aimPitch: 0, combat: 0 }); MEL.pose(true); MEL.update(dt);
    world.setTime(19.6);
  } else if (G.state === 'escaping') { P.s.update(dt, {}); if (G.boarded && HELI.state() === 'landed') { G.climbT = Math.min(1, (G.climbT || 0) + dt / 0.7); const a = HELI.doorPos(), b = HELI.seatPos(Math.max(0, G.heliSeat | 0)), k = G.climbT * G.climbT * (3 - 2 * G.climbT); P.s.pos.set(a.x + (b.x - a.x) * k, P.s.pos.y, a.z + (b.z - a.z) * k); P.s.pivot.position.y = Math.max(0, a.y - 0.9 + (b.y - a.y + 0.9) * Math.min(1, k * 1.6)); P.s.yaw = Math.atan2(b.x - a.x, b.z - a.z); } updateEscape(dt); }
  else if (G.state === 'intro') { P.s.update(dt, {}); }
  else if (G.state === 'news') { P.s.update(dt, {}); MEL.pose(true); newsStep(dt); G.noCull = !!(G.news && G.news.tv); PEOPLE.PPL.noCull = G.noCull; }
  else if (G.state !== 'result' && G.state !== 'pause' && !MP.riding(dt)) playerStep(dt);   // MP: a passenger in a friend's car goes where it goes
  if (G.state !== 'result') packStep(rdt);
  // the open bag's header (HP, food, water, bleeding) stays live; its Eat/Drink buttons come back when your hands are free
  if (G.state === 'bag') { G.bagSubT = (G.bagSubT || 0) - rdt; if (G.bagSubT <= 0) { G.bagSubT = 0.25; renderBagSub(); } const hb = HANDS.busy(); if (hb !== G.bagHandsBusy) { G.bagHandsBusy = hb; for (const b of document.querySelectorAll('#bagBody [data-use]')) b.disabled = hb; } }
  tutTick(rdt);
  if (G.state === 'dead') P.deadT += dt;
  // the helicopter flies on game time; it freezes on the menus
  if (['play', 'bag', 'note', 'phone', 'escaping', 'dead'].includes(G.state) && G.phase !== 'title') {
    HELI.update(dt, G.hour, G.day); heliPeople(dt); if (!MP.isClient()) storyTick();   // MP: the host's chapter comes over the net
    if (G.heliCine) { const hc = HELI.cameraTarget(); if (hc && hc.t > 13.6) $('fade').classList.add('on'); if (HELI.cinematicDone()) endRun('escaped'); }
  }
  STATS.tick(dt, P, G);
  if (G.state !== 'result') {
    if ((G.state === 'play' || G.state === 'bag' || (MP.on() && G.state !== 'title')) && G.phase === 'outbreak' && !MP.isClient()) { populate(dt); outbreakStep(dt); }   // MP: only the host's game makes the dead (and keeps doing it while friends play on)
    if (G.state === 'play' || G.state === 'phone') phoneTick(dt);
    if (G.state === 'play' && P.alive && world.hazards) for (const h of world.hazards) { if (h.off || !h.dps) continue; if (Math.hypot(P.s.pos.x - h.x, P.s.pos.z - h.z) < h.r && (P.s.gy || 0) < 0.6) { damage(P, dt * h.dps, null, { [h.kind]: true }); G.hurtFlash = Math.max(G.hurtFlash || 0, 0.3); } }
    if (G.state === 'play' && G.phase === 'calm' && G.hour >= obHour() && G.hour < obHour() + 6) { if (MAPLE()) startNews(); else startMapNews(); }
    if (G.state === 'play' && G.phase === 'news' && MAPLE()) newsStep(dt);   // it's happening right in front of you
    if (G.state === 'play' || G.state === 'bag') mapBeats();
    if (MP.isClient()) MP.NETMOD.peopleStep(dt); else PEOPLE.peopleStep(dt, focusPos());   // MP: a client shows the host's townspeople
    if (!MP.on()) TRAFFIC.update(dt);   // [traffic] (single player only)
    if (G.state !== 'title' && G.state !== 'escaping' && G.state !== 'dead' && P.alive && G.t % 0.5 < dt + 1e-4) world.navFrom(P.s.pos.x, P.s.pos.z, 55);
    if (G.state === 'title' && world.NAV.gen === 0) { const T0 = MAPLE() ? { x: -46, z: 9 } : startSpot(); world.navFrom(T0.x, T0.z, 40); }
    if (MP.isClient()) clientZombies(dt); else zombiesStep(dt);   // MP: a client shows the host's dead
    updateThrows(dt);
  }
  C.noises = C.noises.filter(n => G.t - n.t < 1.5);
  BOSS.update(dt);   // [boss] deaths that let more out, The Zombie, the boss bar (nothing to do when none are about)
  // fires and smoke
  for (const e of world.emitters) {
    if (e.off) continue;
    e.t -= dt; if (e.t > 0) continue; e.t = 1 / e.rate;
    const p = V(e.x, e.y, e.z);
    if (e.grill) { fx.smokePuff(p, 0.35, 0.5, 0.05); if (P && p.distanceTo(P.s.pos) < 10) (SND.sizzle || SND.fireLoop)(p, 0.12); }
    else if (e.pool && fx.flames) { fx.flames(p, e.pool, 3); if (P && p.distanceTo(P.s.pos) < 25 && Math.random() < 0.15) SND.fireLoop(p, 0.8); }
    else if (e.kind === 'sparks') { if (fx.sparks) fx.sparks(p, 8 + Math.random() * 14); if (Math.random() < 0.3 && SND.zap) SND.zap(p); }
    else if (e.kind === 'smoke') fx.smokePuff(p, 1, 1, 0.16); else if (e.kind === 'fire') { fx.fire(p, 2); if (Math.random() < 0.05) SND.fireLoop(p, 0.6); } else if (e.kind === 'column') fx.column(p);
  }
  updateAlarm(dt);
  updateCamera(dt);
  if (MOB && scene.fog && scene.fog.density > 0) {   // draw distance: only as far as the fog lets you see
    const far = clamp(MOB.farK / scene.fog.density, MOB.farMin, 1500);
    if (Math.abs(far - camera.far) > camera.far * 0.08) { camera.far = far; camera.updateProjectionMatrix(); }
  }
  fx.update(dt, camera);
  // fear: how close and how many
  const fear = clamp(G.closeN * 0.22 + (G.grabbedBy ? 0.6 : 0), 0, 1);
  SND.setFear(fear);
  SND.setIntensity(G.state === 'title' ? 0.1 : clamp(G.chasing * 0.14 + G.closeN * 0.2 + (G.grabbedBy ? 0.5 : 0), 0, 1));
  G.hurtFlash = Math.max(0, (G.hurtFlash || 0) - dt * 1.5);
  C.flash = Math.max(0, C.flash - dt * 2.5);
  const hpK = P ? 1 - P.hp / P.maxHp : 0;
  film.uniforms.hurt.value = clamp(Math.max(G.hurtFlash * 0.7, hpK * 0.8 - 0.2), 0, 1);
  film.uniforms.flash.value = C.flash;
  film.uniforms.desat.value = G.state === 'dead' ? 0.7 : clamp(hpK - 0.5, 0, 0.5);
  film.uniforms.sick.value = (G.infection || 0) / 100;
  film.uniforms.night.value = world.night;
  film.uniforms.life.value = G.state === 'title' ? 0 : world.presetName === 'desert' ? Math.max(world.sunny || 0, (world.daylight ?? 0) * 0.7) : world.sunny || 0;   // (the desert by day: bleached by the sun, not grey-green)
  film.uniforms.time.value = G.t;
  G.insideK = lerp(G.insideK || 0, G.inside ? 1 : 0, Math.min(1, dt * 3));
  renderer.toneMappingExposure = lerp(1.0, 1.35, world.night * (1 - G.insideK));   // eyes adjust to the night outside (not under a roof with the lights on)
  drawOverlay(dt); hud(dt);
  if (DBG) { let d = $('dbg'); if (!d) { d = document.createElement('div'); d.id = 'dbg'; d.style.cssText = 'position:fixed;top:120px;left:10px;color:#0f0;font:12px monospace;z-index:30;white-space:pre;text-shadow:0 0 3px #000'; document.body.appendChild(d); } d.textContent = `${SND.debugInfo()} | fps ${(1 / dtS).toFixed(0)} pr ${renderer.getPixelRatio().toFixed(2)} | ${G.state} | zombies ${Z.list.filter(u => u.alive).length}/${Z.list.length} chase ${G.chasing} | ${P.s.pos.x.toFixed(1)},${P.s.pos.z.toFixed(1)} | calls ${renderer.info.render.calls} tris ${renderer.info.render.triangles}`; }
}
let frameN = 0, shadowEvery = 1;
function render() {
  renderer.info.reset(); frameN++;
  if (bloomPass && !MOB) bloomPass.enabled = world.night > 0.3 || save.quality >= 3 || G.state === 'title';   // bloom where there's light to bloom: night, lamps, fire
  if (!MOB) { renderer.shadowMap.autoUpdate = shadowEvery < 2; if (shadowEvery > 1) renderer.shadowMap.needsUpdate = frameN % shadowEvery === 0; }
  if (window.__hitBoxes && C.t - (window.__hitT || 0) > 0.5) { window.__hitT = C.t; window.__hitBoxes(); } if (window.__hitDbg) window.__hitDbg(); composer.render(); }
let perfT = 0, perfN = 0, perfSum = 0;
let perfGood = 0, perfLvl = 0;
const PR_CAP = Math.min(2, devicePixelRatio || 1);
let GOV = null;
function perf(dt) {
  if (MOB) { if (!GOV) GOV = makeGovernor({ renderer, resize, world, getBloom: () => bloomPass }); GOV.tick(dt, !['pause', 'loading', 'title', 'result', 'intro'].includes(G.state) && !Q.has('noadapt')); return; }
  if (G.state === 'pause' || G.state === 'loading' || Q.has('noadapt')) return;
  dt = Math.min(dt, 0.1);   // a really slow frame still counts (just clamped)
  perfSum += dt; perfN++; perfT += dt;
  if (perfT < 2.5) return;
  const avg = perfSum / perfN; perfT = perfSum = perfN = 0;
  const pr = renderer.getPixelRatio();
  if (avg > 1 / 25 && pr > 1) { perfGood = 0; renderer.setPixelRatio(1); resize(); }   // really struggling: straight down to 1x
  else if (avg > 1 / 40) {
    perfGood = 0;   // cheapest losses first: MSAA, then AO, then the shadows every other frame, then resolution, then the shadow map size
    if (composer.renderTarget1 && composer.renderTarget1.samples > 0) { composer.renderTarget1.samples = 0; if (composer.renderTarget2) composer.renderTarget2.samples = 0; }
    else if (aoPass && aoPass.enabled) aoPass.enabled = false;
    else if (shadowEvery < 2) shadowEvery = 2;
    else if (pr > 1) { renderer.setPixelRatio(Math.max(1, pr - 0.25)); resize(); }
    else if (perfLvl === 0 && world.sun && world.sun.shadow.mapSize.x > 1024) { perfLvl = 1; const sh = world.sun.shadow; sh.mapSize.set(1024, 1024); if (sh.map) { sh.map.dispose(); sh.map = null; } }
  } else if (avg < 1 / 58) {
    if (++perfGood >= 3 && pr < PR_CAP) { perfGood = 0; renderer.setPixelRatio(Math.min(PR_CAP, pr + 0.25)); resize(); }   // smooth again: sharpen back up
  } else perfGood = 0;
}
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = clamp((now - last) / 1000, 0, 0.1); last = now;
  dtS = lerp(dtS, dt, 0.2);
  if (G.state !== 'loading' && !MANUAL) {   // the game runs on real time (a slow frame takes up to 3 steps of at most 1/30 s); dtS only smooths the camera
    const n = Math.min(3, Math.ceil(dt / (1 / 30) - 1e-6) || 1), h = dt / n;
    for (let i = 0; i < n; i++) step(h);
    render(); perf(dt);
  }
  if (G.state !== 'loading') MP.update(Math.min(dt, 0.1));   // MP: the room, chat, voice (every frame, every screen)
}
// ---- touch screens: the stick, look and buttons (touch.js); on desktop TC stays null
const TC = initTouch({
  G, keys, save, rdrag, look, toast,
  alive: () => !!(P && P.alive), driving: () => DRIVE.active(), bike: () => DRIVE.bike(), gun: () => !!(P && P.arms.cur), hp: () => P ? P.hp : 100,
  weaponIcon: () => ITEM_ICON[G.weapon] || 'fist', lanternOn: () => LANTERN.carrying(),
  // thumbs aren't a mouse: on attack, turn to the nearest zombie in front (close in for a swing, a narrow cone for a gun)
  assist: () => {
    if (!P || !P.alive || DRIVE.active() || G.state !== 'play') return;
    const gun = !!P.arms.cur, R = gun ? 28 : 4.2, cone = gun ? 0.22 : 1.2; let best = null, bs = 1e9;
    for (const u of Z.list) { if (!u.active || !u.alive) continue; const dx = u.s.pos.x - P.s.pos.x, dz = u.s.pos.z - P.s.pos.z, d = Math.hypot(dx, dz); if (d > R || d < 0.2) continue;
      let da = Math.atan2(dx, dz) - G.camYaw; da = Math.atan2(Math.sin(da), Math.cos(da)); if (Math.abs(da) > cone) continue; const sc = d + Math.abs(da) * 3; if (sc < bs) { bs = sc; best = da; } }
    if (best !== null) { G.assistYaw = G.camYaw + best * (gun ? 0.85 : 1); G.assistT = G.t + 0.35; }   // (edgeSteer swings the camera there smoothly)
  },
  ammo: () => { const A = P && P.arms; if (!A || !A.cur) return ''; const a = A.ammo[A.cur]; return `${a.mag}/${G.inv[A.W.ammo] || 0}`; },
});
if (TOUCH) document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'play') togglePause(); });   // a call, the home button: pause
// ---- iOS drops the WebGL context when memory runs short or the tab's been in the background: wait for it to come
// back (pausing the game), rebuild the post-processing; if it doesn't come back, save the run where it is and reload
guardContext(canvas, {
  onLost: () => { if (G.state === 'play') togglePause(); },
  onRestored: () => { if (world.sun && world.sun.shadow.map) { world.sun.shadow.map.dispose(); world.sun.shadow.map = null; } buildComposer(); },
  onGiveUp: () => {
    const q = new URLSearchParams(location.search); q.delete('play');
    try { if (RUN_ON && P && P.alive && G.phase && G.phase !== 'title' && ['play', 'pause', 'bag', 'phone', 'note'].includes(G.state)) { if (G.slot == null) G.slot = 0; const d = runData(); if (d) { G.ckpt = d; writeSlot(); q.set('slot', G.slot); } } } catch (e) { console.error(e); }
    location.search = q.toString();
  },
});
window.ZA = { HELI, STATS, setStage, supplies, LZ, G, C, Z, keys, save, step, render, get composer() { return composer; }, camera, renderer, scene, get P() { return P; }, get MEL() { return MEL; }, get PACK() { return PACK; }, get HANDS() { return HANDS; }, openBag, closeBag, tutStart, TUT, world, fx, SND, newGame, toTitle, damage, kill, KINDS, cursorAim, addItem, useItem, context, startSearch, wake, meleeLand, equipMelee, equipGun, startEscape, knockDown, saveRun, continueRun, readRun, PEOPLE, startNews, endNews, talkTo, focusPos, runData, checkpoint, later, playMapRadio, startMapNews, endMapNews, get STORY() { return STORY; }, get MAPINFO() { return MAPINFO; }, get MAP_ID() { return MAP_ID; }, throws, AMBS: () => AMBS, updateAmbulances, dispatchAmbulance, throwIt, useDoor, DEV, MOB, get GOV() { return GOV; }, TC, DRIVE };

buildComposer(); syncSettings();
STATS.init({
  test: Q.has('nosave') || Q.has('test'), persist: true, diffs: DIFFS, showScreen,
  onClose: () => showScreen('title'),
  vehicle: () => { const v = DRIVE.active() && DRIVE.current(); return v ? { kind: v.kind, x: v.x, z: v.z } : null; },
  click: () => SND.phoneTap && SND.phoneTap(),
});
G.chasing = 0; G.closeN = 0; G.hurtDir = []; G.transit = new Map(); G.inv = NEW_INV(); G.melee = {}; G.stats = { kills: 0 }; G.hour = 19.6; G.day = 1; G.food = 100; G.water = 100; G.stam = 100; G.battery = 100; G.infection = 0;
// ---------------------------------------------------------------- MP: online multiplayer (mp.js does the rest)
// start (or, after a reload to load the host's map, rejoin) an online game with the host's settings
async function startMP(st) {
  startAudio();
  if (st.diff && DIFFS[st.diff]) save.diff = st.diff;
  const w = MP.who();
  G.who = { body: w.body, name: w.name, job: w.job || 'survivor', house: homeHouse() };
  G.slot = null; G.ckpt = null;
  showScreen(null);
  await newGame();
  // online there's no quiet morning: everyone wakes up to the outbreak
  if (G.phase === 'calm') { if (MAPLE()) { startNews(); endNews(true); } else { G.hour = Math.max(G.hour, obHour()); startMapNews(); endMapNews(true); } }
  // stand next to each other, not inside each other
  if (w.index > 0) { const y = P.s.yaw, off = [[1.1, 0], [-1.1, 0], [0, -1.1], [1.1, -1.1]][(w.index - 1) % 4];
    for (const k of [1, 0.6, 0.3]) { const x = P.s.pos.x + (off[0] * Math.cos(y) + off[1] * Math.sin(y)) * k, z = P.s.pos.z + (-off[0] * Math.sin(y) + off[1] * Math.cos(y)) * k; if (world.walkable(x, z)) { P.s.place(x, z, y); break; } } }
}
// a friend got you back up (instead of game over)
function mpRespawn(x, z) {
  if (G.state !== 'dead') return;
  let px = x, pz = z; const a0 = Math.random() * 6.28;
  for (let k = 0; k < 8; k++) { const xx = x + Math.cos(a0 + k * 0.8) * 1.3, zz = z + Math.sin(a0 + k * 0.8) * 1.3; if (world.walkable(xx, zz)) { px = xx; pz = zz; break; } }
  P.alive = true; P.hp = P.maxHp * 0.6; P.hurtT = 99; P.s.dead = false; P.s.resetActs(); P.s.setVisible(true); P.s.place(px, pz, P.s.yaw);
  Object.assign(G, { state: 'play', bleed: 0, grabbedBy: null, infection: Math.min(G.infection || 0, 30), saidFever: false, food: Math.max(G.food, 40), water: Math.max(G.water, 40) });
  document.body.classList.remove('grabbed'); $('big').style.opacity = 0;
  if (P.arms.cur) equipGun(P.arms.cur, true); else equipMelee(MEL.cur || 'fists', true);
  SND.musicPlaying(true); camInit = false;
}
// one of the host's dead clawed / bit you
function mpHurt(amt, pos, info) {
  if (!P.alive || G.state === 'result' || G.state === 'title') return;
  const z = info && info.zombie && info.zombie.s ? info.zombie : null;
  damage(P, amt, z, { claw: true });
  if (Math.random() < (info && info.bite ? 0.7 : 0.35)) { if (G.bleed <= 0) toast('You\'re bleeding — bandage it (Q)', 'bad'); G.bleed = Math.max(G.bleed, 1); }
  fx.blood(P.chest || P.s.pos, V(pos.x - P.s.pos.x, 0, pos.z - P.s.pos.z).normalize().negate(), 0.6);
}
MP.init({
  G, C, SND, world, scene, camera, KINDS, keys, Z, touch: TOUCH, onStep,
  get SWINGS() { return SWINGS; },
  getP: () => P, people: () => PEOPLE.PPL.list, damage, focusPos, showScreen,
  getWeapon: () => (P && P.arms.cur) || (MEL && MEL.cur) || 'fists', getVehicle: () => mpVehicle(), getBody: () => (P && P.body) || 'human',
  maps: () => Object.values(MAPS).map(m => ({ id: m.id, name: m.name, blurb: m.blurb })),
  diffs: () => Object.entries(DIFFS).map(([id, d]) => ({ id, name: d.name, desc: d.desc })),
  mapId: () => MAP_ID, mapDefault: () => MAP_ID, diffDefault: () => save.diff || 'medium',
  toast: (t, k) => toast(t, k === 'bad' ? 'bad' : k === 'good' ? 'good' : 'grey'), bigText, ask, setStage, endRun, toTitle,
  start: st => startMP(st), respawn: mpRespawn, hurtMe: mpHurt,
  reloadTo: id => { id = validMap(id); save.map = id; writeSave(); const q = new URLSearchParams(location.search); q.set('map', id); for (const k of ['setup', 'd', 'play', 'slot']) q.delete(k); location.search = q.toString(); },
  showLoading: () => $('fade').classList.add('on'),
  // the lobby's characters: 4 men and 4 women from "Set up your run", with their portraits and info cards
  characters: () => MP_CHARS.map(n => { const p = PEOPLE_POOL.find(q => q[1] === n); return { body: p[0], name: p[1], job: p[2], get face() { try { return faceOf(p[0], p[1]); } catch { return ''; } } }; }),
  whoInfo: c => { if (!$('mpWhoCss')) { const st = document.createElement('style'); st.id = 'mpWhoCss'; st.textContent = WHO_INFO_CSS; document.head.appendChild(st); } return whoInfoHTML(c, c.face, mapName()); },
  lookPuppet: (s, name, body) => { const c = PEOPLE_POOL.find(q => q[1] === name); if (c && c[0] === body) LOOKS.applyLook(s, LOOKS.lookFor('who:' + name, body)); },
  vehicle: v => v[0] === 'c' ? DRIVE.cars[v[1]] : v[0] === 'b' ? DRIVE.bikes[v[1]] : null,
  moveVehicle: v => { const T = v[0] === 'c' ? DRIVE.cars[v[1]] : DRIVE.bikes[v[1]]; if (!T || T === DRIVE.current()) return; T.g.position.x = T.x = v[2]; T.g.position.z = T.z = v[3]; T.g.rotation.y = T.yaw = v[4]; if (T.C && T.C.box) T.C.box.off = true; if (T.C) { T.C.x = v[2]; T.C.z = v[3]; } },
  driving: () => DRIVE.active(),
  pvpHurt: (dmg, by, e) => { if (!P.alive) return; damage(P, dmg, by && by.s ? by : null, { human: true, part: e.part || undefined, blast: !!e.blast }); if (P.alive && (e.knock > 0.6 || dmg > 30 || e.blast) && P.s.acts.Hit_Knockback) { P.s.play('Hit_Knockback', { fade: 0.1, rate: 1.3 }); C.shake = Math.max(C.shake, 0.4); } },
  healMe: (hp, who) => { P.hp = Math.min(P.maxHp, P.hp + hp); G.bleed = 0; toast(`${who} bandaged you up`, 'good'); },
  giveMe: (id, who) => { if (ITEMS[id]) { addItem(id, 1); toast(`${who} gave you ${ITEMS[id].name}`, 'good'); } },
  have: id => (G.inv[id] || 0) > 0,
  take: id => { if (!(G.inv[id] > 0)) return false; G.inv[id]--; if (!G.inv[id]) delete G.inv[id]; return true; },
  giveable: () => { const out = []; for (const cat of ['food', 'drink']) { const id = Object.keys(G.inv).find(k => G.inv[k] > 0 && ITEMS[k] && ITEMS[k].cat === cat); if (id) out.push({ id, name: ITEMS[id].name }); } return out; },
  reach: () => P.s.playUp && P.s.playUp('Interact', { rate: 1.2, fade: 0.1, fadeAt: 0.7 }),
  kneel: on => { if (on) P.s.play('Fixing_Kneeling', { loop: true, fade: 0.3 }); else if (P.s.act === 'Fixing_Kneeling') P.s.stopAct(0.3); },
  hideMe: on => { P.s.setVisible(!on); if (on) { MEL.hideAll(); P.arms.hideAll(); if (PACK.P) PACK.P.visible = false; } else { if (PACK.P) PACK.P.visible = true; if (P.arms.cur) equipGun(P.arms.cur, true); else equipMelee(MEL.cur || 'fists', true); } },
});
// MP: what you're in, for the others: ['c' car | 'b' bike, index, x, z, yaw], or ['r', driver] riding with a friend
const MP_CHARS = ['Sam Carter', 'Jordan Hale', 'Walter Hughes', 'Mike Russo', 'Nina Brooks', 'Tasha Greene', 'Maya Ortiz', 'Jade Wilson'];
function mpVehicle() {
  if (MP.isRiding()) return MP.rideState();
  const V = DRIVE.active() && DRIVE.current(); if (!V) return null;
  const r = x => Math.round(x * 100) / 100, car = V.kind === 'car', i = car ? DRIVE.cars.indexOf(V) : DRIVE.bikes.indexOf(V);
  return i < 0 ? null : [car ? 'c' : 'b', i, r(V.g.position.x), r(V.g.position.z), r(V.g.rotation.y)];
}
window.ZA.MP = MP;   // (tests)
BOSS.init({ G, getP: () => P, fx, world: () => world, camera, bigText, think, later, PEOPLE, STATS, MP, DRIVE, Q, mobile: !!MOB });   // [boss] (also adds ZA.spawnBoss, ?boss=mini|boss|giant)
load().then(async () => {
  toTitle();
  document.body.classList.add('ready');
  if (Q.has('diff')) save.diff = Q.get('diff');
  if (Q.has('hit')) {   // debug: draw every solid box (live: rebuilt every 0.5 s, switched-off boxes left out) and every body's hit spheres
    const g = new THREE.BufferGeometry();
    window.__hitBoxes = () => {
      const pos = [], col = [], add = (a, b2, c) => { pos.push(...a, ...b2); col.push(...c, ...c); };
      for (const b2 of world.boxes) {
        if (b2.off || b2.zOnly) continue;
        const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => [b2.x + (sx * b2.hx) * b2.c + (sz * b2.hz) * b2.s, b2.z - (sx * b2.hx) * b2.s + (sz * b2.hz) * b2.c]);
        const c = b2.door ? [0.2, 0.5, 1] : b2.vault ? [1, 0.9, 0.1] : b2.navSkip ? [0.2, 1, 1] : [1, 0.15, 0.1];
        for (let i = 0; i < 4; i++) { const [x0, z0] = cs[i], [x1, z1] = cs[(i + 1) % 4]; add([x0, b2.y0 + 0.02, z0], [x1, b2.y0 + 0.02, z1], c); add([x0, b2.y1, z0], [x1, b2.y1, z1], c); add([x0, b2.y0, z0], [x0, b2.y1, z0], c); }
      }
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeBoundingSphere();
      window.__hitN = pos.length / 18;
    };
    window.__hitBoxes();
    const ls = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.8 })); ls.renderOrder = 50; scene.add(ls);
    const sg = new THREE.SphereGeometry(1, 10, 6), sm = new THREE.MeshBasicMaterial({ color: 0x40ff60, wireframe: true, depthTest: false, transparent: true, opacity: 0.5 }), pool = [];
    window.__hitDbg = () => { let k = 0; for (const u of C.units) { if (!u.alive || !u.sph || !u.s.visible) continue; for (const S of u.sph) { let m = pool[k]; if (!m) { m = pool[k] = new THREE.Mesh(sg, sm); m.renderOrder = 51; scene.add(m); } m.visible = true; m.position.copy(S.c); m.scale.setScalar(S.r); k++; } } for (; k < pool.length; k++) pool[k].visible = false; };
  }
  if (Q.has('who')) { const w = rollWho(); G.who = w.find(x => x.body === Q.get('who')) || w[0]; }   // test hook
  const mpResume = MP.resumeSettings();   // MP: back from loading the host's map: straight into the online game
  if (mpResume) await startMP(mpResume);
  else if (Q.has('play')) { startAudio(); showScreen(null); await newGame(); }
  else if (Q.has('slot') && RUN_ON) { const i = +Q.get('slot'), r = readSlot(i); if (r && validMap(r.map || 'maple') === MAP_ID) await loadSlot(i, r); }
  else if (Q.get('setup') === 'who') { if (Q.get('d') && DIFFS[Q.get('d')]) save.diff = Q.get('d'); showWho(() => introThen(newGame)); }   // came back from loading the map you picked: straight on to "set up your run"
  else if (Q.has('setup')) showDiffs();
  if (Q.has('rain')) { world.rain = G.rainTarget = +Q.get('rain'); G.wxT = 1e9; }   // test hook
  if (Q.has('at')) { const [x, z] = Q.get('at').split(',').map(Number); P.s.place(x, z, 0); }
  requestAnimationFrame(t => { last = t; frame(t); });
}).catch(e => { console.error(e); $('loadtext').innerHTML = 'Could not load: ' + String(e.message || e).replace(/</g, '&lt;') + ' <button onclick="location.reload()" style="margin-left:10px;background:none;border:1px solid #c62a1e;color:#ece6da;padding:4px 10px;cursor:pointer;font:inherit">RETRY</button>'; });
