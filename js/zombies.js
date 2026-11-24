// Zombie_Apocalypse — the dead. Every zombie is one of the real bodies, re-skinned by a shader: grey-green skin with
// dark veins and bruises, milky eyes, yellow teeth, blood round the mouth and down the shirt, filthy clothes.
// They shamble on the captured zombie walk, arms reaching once they've got you. Their minds:
//  - they SEE you in front of them (much less at night — unless your flashlight is on), never through walls;
//  - they HEAR you: running, gunshots (very far), breaking glass, doors, a thrown bottle smashing;
//  - they follow the route map round walls and fences, and beat on closed doors until they break;
//  - close up they claw at you, or grab hold and try to bite (break free!);
//  - hits make them flinch and stagger; heavy blows knock them down and they get back up — only the head kills
//    for sure. Runners (more of them at night) sprint.
import * as THREE from 'three';
import { C, emit } from './state.js';
import { tier } from './tex.js';
import { Soldier, zombieKind, clamp, lerp, wrapPi, damp, dampAngle, aimBone, addTurn } from './soldier.js';
import { refreshHitShapes } from './combat.js';
import { hairDead } from './hair.js';
import { applyLook, lookFor, lkOf, kindName } from './looks.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rnd = (a, b) => a + Math.random() * (b - a);
const tv = V(), tv2 = V(), eye = V(), tgt = V();

// ---------------------------------------------------------------- the look
// 12 looks per body: each one its own cloth colours (hue turned), filth, amount of blood (fresh and wet, or old
// and dried brown) and skin pallor, on top of a random seed for where the veins, bruises and splashes fall
const ZMATS = new Map();
const vr = (v, k) => { const x = Math.sin(v * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
export const ZLOOKS = 12;
const SLOTN = { skin: 0, cloth: 1, eye: 2, teeth: 3, hair: 4, mixed: 5 };
// amt: a {value} uniform 0..1 for a body still turning (the colour drains out of them as they lie there)
function zombify(src, slot, variant, mouthY = 1.57, amt = null) {
  if (tier() > 1) variant %= 4;   // phones: 4 looks per body, not 12 (a third of the materials to keep and switch between)
  const key = src.uuid + ':' + variant + ':' + slot;
  if (!amt && ZMATS.has(key)) return ZMATS.get(key);
  const m = src.clone();
  const LK = lkOf(src);   // a look's dye (looks.js): the dead wear the same clothes and skin, dyed the same way first
  m.metalness = 0; m.metalnessMap = null;
  const v = variant;
  m.roughness = slot === 'skin' ? 0.62 : slot === 'eye' ? 0.15 : slot === 'mixed' ? 0.8 : 0.95;
  const U = {
    zSlot: { value: SLOTN[slot] }, zSeed: { value: v * 7.31 + 1.7 },
    zTint: { value: new THREE.Color([0x9aa48a, 0xa8a090, 0x8c9a90, 0xb0a890][v % 4]) },
    zHue: { value: (vr(v, 1) - 0.5) * 0.7 }, zDirt: { value: 0.3 + vr(v, 2) * 0.7 }, zBlood: { value: 0.3 + vr(v, 3) * 0.8 },
    zPale: { value: 0.85 + vr(v, 4) * 0.3 }, zDry: { value: vr(v, 5) < 0.5 ? 1 : 0 }, zMouthY: { value: mouthY }, zAmt: amt || { value: 1 },
  };
  m.userData.zU = U;
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U); if (LK) Object.assign(sh.uniforms, LK.U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vBind;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBind = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
${LK ? LK.decl : ''}
        uniform float zSlot, zSeed, zHue, zDirt, zBlood, zPale, zDry, zMouthY, zAmt; uniform vec3 zTint; varying vec3 vBind;
        float zh(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        float zn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(zh(i), zh(i + vec3(1,0,0)), f.x), mix(zh(i + vec3(0,1,0)), zh(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(zh(i + vec3(0,0,1)), zh(i + vec3(1,0,1)), f.x), mix(zh(i + vec3(0,1,1)), zh(i + vec3(1,1,1)), f.x), f.y), f.z); }
        float zf(vec3 p){ return zn(p) * 0.55 + zn(p * 2.3 + 3.1) * 0.3 + zn(p * 5.1 + 7.7) * 0.15; }
        vec3 zhue(vec3 c, float h){   // turn the colour round the colour wheel (YIQ), keeping its brightness
          float Y = dot(c, vec3(0.299, 0.587, 0.114)), I = dot(c, vec3(0.596, -0.274, -0.322)), Q = dot(c, vec3(0.211, -0.523, 0.312));
          float cs = cos(h), sn = sin(h); float I2 = I * cs - Q * sn, Q2 = I * sn + Q * cs;
          return max(vec3(Y + 0.956 * I2 + 0.621 * Q2, Y - 0.272 * I2 - 0.647 * Q2, Y - 1.106 * I2 + 1.703 * Q2), 0.0); }`)
      .replace('#include <map_fragment>', `
        #ifdef USE_MAP
          vec4 texel = texture2D(map, vMapUv);
          vec3 c = ${LK ? 'lkDye(texel.rgb, vMapUv)' : 'texel.rgb'};
        #else
          vec3 c = diffuseColor.rgb;
          vec4 texel = vec4(1.0);
        #endif
        vec3 c0 = c;
        vec3 P = vBind * 9.0 + zSeed;
        float L = dot(c, vec3(0.3, 0.59, 0.11));
        float blood = 0.0, hairW = 0.0;
        // blood from the mouth down the chin, neck and front of the shirt
        float front = smoothstep(0.0, 0.08, vBind.z);
        float mouth = smoothstep(0.07, 0.0, abs(vBind.y - zMouthY)) * smoothstep(0.06, 0.0, abs(vBind.x)) * front;
        float drip = smoothstep(zMouthY + 0.05, zMouthY - 0.47, vBind.y) * smoothstep(zMouthY - 0.62, zMouthY - 0.37, vBind.y + zf(vec3(vBind.x * 30.0, 0.0, zSeed)) * 0.4) * smoothstep(0.16, 0.0, abs(vBind.x + (zf(vec3(vBind.y * 6.0, zSeed, 1.0)) - 0.5) * 0.25)) * front;
        // splashes run downward (stretched tall), never round polka dots
        float splat = smoothstep(0.66, 0.72, zf(vec3(P.x * 0.7, P.y * 0.25, P.z * 0.7) + 11.0)) * zBlood;
        // --- dead skin: corpse-grey (dark skin lifted toward the same grey), veins, bruising
        vec3 dead = mix(vec3(L), vec3(0.45), 0.35) * zTint * 1.25 * zPale;
        vec3 cs = mix(c, dead, 0.82);
        float vein = 1.0 - smoothstep(0.0, 0.035, abs(zf(P * 1.6) - 0.5));
        cs = mix(cs, vec3(0.22, 0.2, 0.28), vein * 0.45);
        float bruise = smoothstep(0.55, 0.75, zf(P * 0.5 + 5.0));
        cs = mix(cs, vec3(0.35, 0.28, 0.3), bruise * 0.45);
        cs *= 0.85 + zf(P * 3.0) * 0.25;
        float bs = max(mouth * 1.2, max(drip * 0.8 * zBlood, splat * 0.6));
        // --- clothes: another colour, filthy, torn, whites gone yellow-grey, soaked down the front, mud on the shoes
        vec3 cc = zhue(c, zHue);
        cc = mix(cc, cc * vec3(0.78, 0.74, 0.62), smoothstep(0.6, 0.9, L));
        cc = mix(cc, vec3(dot(cc, vec3(0.3, 0.59, 0.11))), 0.4) * 0.8;
        float dirt = smoothstep(0.45, 0.8, zf(P * 0.9 + 2.0)) * zDirt;
        cc = mix(cc, vec3(0.28, 0.22, 0.15), dirt * 0.6);
        float tear = smoothstep(0.78, 0.82, zf(P * 1.4 + 9.0)) * (0.5 + zDirt * 0.5);
        cc *= 1.0 - tear * 0.55;
        cc = mix(cc, vec3(0.12, 0.09, 0.06), smoothstep(0.12, 0.0, vBind.y) * 0.55);
        float bc = max(drip * zBlood, smoothstep(0.6, 0.68, zf(vec3(P.x * 0.55, P.y * 0.2, P.z * 0.55) + 21.0)) * 0.85 * zBlood);
        // --- hair: matted, greyed, dull
        vec3 ch = mix(c, vec3(L) * 0.7, 0.6);
        if (zSlot < 0.5) { c = cs; blood = bs; }
        else if (zSlot < 1.5) { c = cc; blood = bc; }
        else if (zSlot < 2.5) { c = mix(c, vec3(0.78, 0.76, 0.66), 0.85); }      // eyes: milky, clouded over
        else if (zSlot < 3.5) { c = c * vec3(0.8, 0.68, 0.45); blood = 0.5; }     // teeth: yellow-brown, bloody
        else if (zSlot < 4.5) { c = ch; hairW = 1.0; }
        else {   // one mesh for everything (skin, clothes, hair): sort the texels by colour
          vec3 cg = sqrt(c);   // judged in display (sRGB-ish) values: the texture arrives linear
          float sat = max(cg.r, max(cg.g, cg.b)) - min(cg.r, min(cg.g, cg.b));
          float skinM = step(cg.b, cg.g + 0.01) * step(cg.g, cg.r + 0.01) * smoothstep(0.05, 0.12, sat) * (1.0 - smoothstep(0.45, 0.6, sat));
          float hairM = step(zMouthY - 0.08, vBind.y) * (1.0 - skinM) * step(dot(cg, vec3(0.3, 0.59, 0.11)), 0.3);
          float clothM = max(0.0, 1.0 - skinM - hairM);
          c = cs * skinM + cc * clothM + ch * hairM;
          blood = bs * skinM + bc * clothM;
          hairW = hairM;
        }
        // old blood is near black-red; dried brown on some of them (never round the mouth: that's fresh)
        vec3 bcol = mix(vec3(0.045, 0.006, 0.004), vec3(0.11, 0.013, 0.008), zf(P * 4.0));
        bcol = mix(bcol, vec3(0.11, 0.05, 0.03), zDry * (0.6 + 0.4 * zf(P * 2.0)) * (1.0 - mouth));
        blood = clamp(blood, 0.0, 1.0);
        c = mix(c, bcol, blood * 0.9);
        c = mix(c0, c, zAmt);
        diffuseColor.rgb *= c;
        diffuseColor.a *= texel.a;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.32, blood * 0.8 * (1.0 - zDry * 0.7) * zAmt);   // fresh blood is wet
        roughnessFactor = mix(roughnessFactor, 0.9, hairW * zAmt);`);
  };
  m.customProgramCacheKey = () => 'zombie-v3' + (LK ? LK.key : '');
  m.needsUpdate = true;
  if (!amt) ZMATS.set(key, m);
  return m;
}
export function slotOf(o) {
  const n = (o.name + ' ' + (o.material && o.material.name)).toLowerCase();
  if (n.includes('ch03')) return 'mixed';
  if (n.includes('eye')) return 'eye';
  if (n.includes('teeth')) return 'teeth';
  if (n.includes('hair') || n.includes('beard')) return 'hair';
  if (n.includes('skin') || n.includes('body') || n.includes('head')) return 'skin';
  return 'cloth';
}
// where the mouth is on this body (in its bind pose): just under the head bone
function mouthOf(o) {
  if (/ch03/i.test(o.name + (o.material && o.material.name))) return 1.385;   // her lips (1.5 was her forehead: the old sunglasses hid the smear)
  const sk = o.skeleton; if (!sk) return 1.57;
  const i = sk.bones.findIndex(b => /Head$/.test(b.name)); if (i < 0) return 1.57;
  return tv.setFromMatrixPosition(tm.copy(sk.boneInverses[i]).invert()).y - 0.068;
}
const tm = new THREE.Matrix4();
// amt: see zombify — a body that's still turning gets its own materials so the change can creep over it
export function dressZombie(s, variant, amt = null) {
  s.root.traverse(o => {
    if (!o.isMesh || !o.material || o.userData.zDressed === variant && !amt || o.userData.lkKeep) return;
    // her hair (hair.js): its own dead version — matted, dull, filthy — never zombify()'s (that would lose the strands)
    if (o.userData.hair) { if (amt) o.material = hairDead(o, amt); else if (o.userData.zDressed !== -1) o.material = hairDead(o); o.userData.zDressed = variant; return; }
    const slot = o.userData.lkSlot || slotOf(o), nm = (o.name + o.material.name).toLowerCase();
    // every one of them different: caps on some, the beard or hair gone on others (a look from looks.js already is)
    if (!s.keepLook && !s.lookL) {
      if (nm.includes('headwear')) o.visible = Math.random() < 0.3;
      else if (nm.includes('beard')) o.visible = Math.random() < 0.7;
      else if (nm.includes('hair')) o.visible = Math.random() < 0.9;
    }
    const src = o.userData.zSrc || o.material;
    o.userData.zSrc = src;
    o.material = zombify(src, slot, variant, mouthOf(o), amt);
    o.userData.zDressed = variant;
  });
}
// a person going grey where they lie (people.js: startTurning when they go down, turnAmount(k) as k goes 0 -> 1)
export function startTurning(s, variant) {
  if (s.zTurn) return s.zTurn;
  s.zTurn = { value: 0 }; s.keepLook = true;
  dressZombie(s, variant, s.zTurn);
  s.zVariant = variant;
  return s.zTurn;
}
export function turnAmount(s, k) {
  if (!s.zTurn) return;
  const prev = s.zTurn.value; s.zTurn.value = clamp(k, 0, 1);
  // a couple of twitches as it takes them
  for (const at of [0.6, 0.85]) if (prev < at && k >= at) s.spasm = 1;
}
// the man with the truck keys wears an orange work vest
function vest(s) {
  const B = s.B, g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0xff6a10, roughness: 0.7, emissive: 0x401800, emissiveIntensity: 0.3 });
  const strip = new THREE.MeshStandardMaterial({ color: 0xd8d8d0, roughness: 0.3, metalness: 0.4 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.17, 0.42, 14, 1, true), m); body.material.side = THREE.DoubleSide; body.scale.set(1.08, 1, 0.78);
  g.add(body);
  for (const y of [-0.08, 0.06]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.193, 0.185, 0.035, 14, 1, true), strip); b.position.y = y; b.scale.set(1.08, 1, 0.78); g.add(b); }
  B.Spine1.updateWorldMatrix(true, false);
  const p = B.Spine1.getWorldPosition(V()); p.y += 0.06;
  g.position.copy(p); g.updateMatrix();
  g.matrix.premultiply(B.Spine1.matrixWorld.clone().invert());
  g.matrix.decompose(g.position, g.quaternion, g.scale);
  B.Spine1.add(g);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
}

// ---------------------------------------------------------------- the horde
export const Z = { list: [], pool: [], swings: null, target: 14, hordeT: 0 };
// the current difficulty (main.js sets it): count, speed (walkers), run (runners), dmg, big (chance), bigMul, allRun
const HPK = { EASY: 0.75, MEDIUM: 1, HARD: 1.1, EXTREME: 1.2, APOCALYPSE: 1.35, ZombieX: 1.5 };   // tougher on the harder settings (headshots still kill)
export const DIFF = { cur: { count: 1, speed: 1, run: 1, dmg: 1, big: 0.05, bigMul: 1, allRun: false } };
let NEXT = 1, MADE = 0;
// ---------------------------------------------------------------- [boss] the special ones (bosses.js does the rest)
// Every multiplier is against that difficulty's ordinary zombie. size: how tall (the whole body scaled); speed, dmg,
// hp: x the normal one; kd: how often a knockdown just doesn't take; vp: voice pitch (deeper); mass: how hard the
// crowd shoves it (separate() in main.js); atkRate: the swing's playback (slower, heavier); atkR: claw reach (m).
export const BOSS_TYPES = {
  mini: { name: 'MINI BOSS', size: 2, speed: 2, dmg: 2, hp: 2, kd: 0.5, vp: 0.72, mass: 0.25, atkRate: 0.85, room: 0.6 },
  boss: { name: 'BOSS', size: 2.6, speed: 0.9, dmg: 5, hp: 10, kd: 0.8, vp: 0.58, mass: 0.12, atkRate: 0.62, room: 0.9, heavy: true },
  giant: { name: 'THE ZOMBIE', size: 10, speed: 0.6, dmg: 8, hp: 60, kd: 1, vp: 0.42, mass: 0.01, atkRate: 0.5, room: 3, heavy: true },
};
// filled in by bosses.js: allow() (may one roll here?), rolled(u) (a mini boss / boss just rolled), think(u, dt, P, G)
// (The Zombie's own mind), heavyHit(u, victim) (a boss's blow lands), step(u, e) (a boss's foot comes down)
export const BOSSH = {};
const PLAIN = { size: 1, speed: 1, dmg: 1, hp: 1, kd: 0, vp: 1, mass: 1, atkRate: 1 };
function roomFor(x, z, r) {
  const W = C.world; if (!W || !W.walkable) return true;
  for (let a = 0; a < 8; a++) if (!W.walkable(x + Math.cos(a * 0.785) * r, z + Math.sin(a * 0.785) * r)) return false;
  return W.walkable(x, z);
}
// put the type's size, speed, strength and voice on a zombie that wake() has just set up (or take them off again)
function applyBoss(u, type) {
  const T = BOSS_TYPES[type] || PLAIN, S = u.s;
  u.bossT = BOSS_TYPES[type] ? type : null; u.giant = type === 'giant';
  u.dmgK = T.dmg; u.vpK = T.vp; u.massK = T.mass; u.kdK = T.kd; u.atkRate = T.atkRate; u.heavy = !!T.heavy;
  u.atkR = type === 'giant' ? 5.5 : null; u.bossDone = false; u.bossKid = false;
  if (S._onStep0 !== undefined) { S.onStep = S._onStep0; delete S._onStep0; }
  if (!u.bossT) { S.strideK = 1; S.big = !!u.big; return; }
  u.big = false; u.bigK = 1; u.base = { walk: u.walkSpeed, run: u.runSpeed, runner: u.runner };   // (tests: what an ordinary one would have been)
  const sc = rnd(0.97, 1.03) * T.size;
  S.root.scale.setScalar(sc); u.sizeK = sc * 1.05;
  bulk(S, true);
  u.maxHp = u.hp = rnd(85, 100) * (DIFF.cur.hpK ?? HPK[DIFF.cur.name] ?? 1) * T.hp;
  if (type === 'giant') {   // it never runs: 0.6x what the one it replaced would have done, on long slow strides
    u.walkSpeed = (u.runner ? u.runSpeed : u.walkSpeed) * T.speed; u.runner = false; u.runSpeed = u.walkSpeed;
    S.strideK = Math.max(1, u.walkSpeed / 0.22);   // (slow shuffling half-strides: the feet don't skate)
  } else {
    u.walkSpeed *= T.speed; u.runSpeed = Math.min(13, u.runSpeed * T.speed);
    S.strideK = sc;   // twice the size and twice the speed: the same stride rate as a normal one, twice as long
  }
  S.big = true;   // heavy footsteps (main.js onStep)
  S._onStep0 = S.onStep;
  S.onStep = (s, e) => { if (S._onStep0) S._onStep0(s, e); if (BOSSH.step) BOSSH.step(u, e); };
}
export function makeZombie(kind, scene, variant, onStep) {
  const s = new Soldier(zombieKind(kind), scene, { clone: true, onStep });
  s.animLod = true;
  s.update(1 / 60, {}); s.pivot.updateMatrixWorld(true);
  // the 4 bodies x 12 looks: made in order, every body/look pair comes up once before any repeats
  void variant; variant = (MADE + Math.floor(MADE / 4)) % ZLOOKS; MADE++;
  // a woman: her own skin tone, clothes and hair (hair.js) — then made dead like the rest (only once the lead has
  // taken Michelle's buns/headphones/glasses off with cleanFemale, else she'd get hair on top of the buns)
  // everyone their own look (looks.js), the same rules as the living: nobody's twin (then made dead below)
  applyLook(s, lookFor('z' + MADE, kindName(kind.root)), { zombie: true });
  dressZombie(s, variant);
  // anything only the player's own body should have (tagged userData.playerOnly) doesn't come along in the clone
  const po = []; s.root.traverse(o => { if (o.userData && o.userData.playerOnly) po.push(o); }); for (const o of po) o.removeFromParent();
  // phones and tablets: only the skinned body throws a shadow (hair, hats, vests and the like cost a draw each for a speck)
  if (C.mobile) s.pivot.traverse(o => { if (o.isMesh && !o.isSkinnedMesh) { o.castShadow = false; o.userData.noShadow = true; } });
  const u = { s, team: 1, hp: 100, maxHp: 100, alive: false, active: false, zombie: true, name: 'ZOMBIE', id: NEXT++, kills: 0, deaths: 0, hurtT: 99, deadT: 0, variant };
  s.setVisible(false);
  Z.pool.push(u); C.units.push(u);
  return u;
}
export function giveVest(u) { if (u.bossT) { applyBoss(u, null); u.s.root.scale.setScalar(1); u.sizeK = 1; bulk(u.s, false); u.maxHp = u.hp = 100; }   // [boss] Dale is just Dale
  vest(u.s); u.dale = true; u.name = 'DALE'; }
export function vestOn(s) { vest(s); }
// a person who's just died and is getting back up: their own body becomes one of the dead
// Their own clothes, hair and size stay: only the colour drains out of them (gradually if people.js started it
// with startTurning while they lay there, otherwise over the last moments before they rise).
export function adoptZombie(s, variant) {
  const zk = zombieKind(s.kind);
  for (const n of ['idle', 'walk']) { const w = s.A[n].getEffectiveWeight(); s.A[n].stop(); s.A[n] = s.mixer.clipAction(zk.clips[n]); s.A[n].play(); s.A[n].setEffectiveWeight(w); }
  s.kind = zk; s.vw = zk.vw; s.animLod = true;
  if (!s.zTurn) startTurning(s, variant + 4 * Math.floor(Math.random() * 3));
  const u = { s, team: 1, hp: 100, maxHp: 100, alive: false, active: false, zombie: true, name: 'ZOMBIE', id: NEXT++, kills: 0, deaths: 0, hurtT: 99, deadT: 0, variant, turned: true };
  Z.pool.push(u); C.units.push(u);
  return u;
}

// put a zombie into the world
export function wake(u, x, z, opts = {}) {
  const runner = opts.runner ?? false;
  u.active = true; u.alive = true; u.deadT = 0; u.s.dead = false; u.hurtT = 99; u.searched = false; u.corpse = null;
  u.maxHp = u.hp = opts.hp || rnd(75, 110) * (DIFF.cur.hpK ?? HPK[DIFF.cur.name] ?? 1);
  u.s.resetActs(); u.s.place(x, z, opts.yaw ?? rnd(-Math.PI, Math.PI)); u.s.setVisible(true);
  u.safe = null;
  const D = DIFF.cur;
  // a big one: a head taller, twice as broad, much harder to stop
  u.big = !!opts.big; u.bigK = u.big ? D.bigMul : 1;
  // sizes vary (a turned neighbour keeps their own); a big one is about 2 m and gets its bulk from its bones —
  // a thick chest, heavy arms and thighs — never by stretching the whole body (that shears the limbs)
  const sc = rnd(0.9, 1.08);
  if (u.big) { u.s.root.scale.setScalar(sc * 1.14); u.sizeK = sc * 1.14 * 1.05; }   // (bulk: a broader chest and limbs)
  else { if (!(opts.keepScale || u.turned)) u.s.root.scale.setScalar(u.s.lookL ? u.s.lookL.zs : sc); u.sizeK = u.s.root.scale.x; }
  bulk(u.s, u.big);   // ([boss] applyBoss bulks the special ones up afterwards)
  if (u.big) { u.maxHp = u.hp = (opts.hp || rnd(240, 300)) * u.bigK; }
  if (D.allRun) opts.runner = true;
  u.runner = opts.runner ?? runner;
  u.walkSpeed = Math.min(7, u.s.vw * rnd(0.85, 1.2) * D.speed * (u.big ? 0.85 : 1));   // (bigK is for HP and damage: a brute is not faster)
  u.runSpeed = Math.min(10.5, u.runner ? rnd(3.3, 4.1) * D.run * (u.big ? 0.85 : 1) : u.walkSpeed * rnd(1.25, 1.5));
  u.z = { state: opts.state || 'idle', t: rnd(1, 6), goal: null, seen: 0, lastSeen: V(), heard: null, atkT: rnd(0, 1), groanT: rnd(2, 12), losT: 0, lostT: 0, wander: rnd(-3, 3), stuckT: 0, lastP: V(x, 0, z), grab: null, tgt: null, feedOn: null, down: 0, doorT: 0, tilt: rnd(-0.25, 0.25), lean: rnd(0, 0.18), sway: rnd(0, 6), indoor: !!opts.indoor, path: null, pathI: 0, pathAt: -9, pathGoal: null, doorHit: null, biteT: 0, bites: 0, dipT: -1, flinchF: 0 };
  u.legDmg = 0; u.limp = false; u.crawl = false;
  if (u.s.zTurn && u.s.zTurn.value < 1) u.z.turnFrom = u.s.zTurn.value;
  if (opts.lying) { u.s.play('Death_D', { hold: true, snap: true, from: 3 }); u.z.down = 999; u.z.lying = true; }
  // [boss] 8% of them a mini boss, 3% a boss — outdoors, after the outbreak, never a turned neighbour, Dale, one
  // lying in the road, or a client's copy of the host's zombie (net.js passes hp). opts.boss forces a type (or none).
  let bt = opts.boss, rolled = false;
  if (bt === undefined && !opts.indoor && !opts.lying && !u.turned && !u.dale && !C.calm && !('hp' in opts) && BOSSH.allow && BOSSH.allow(u)) {
    const r = Math.random(); bt = r < 0.03 ? 'boss' : r < 0.11 ? 'mini' : null; rolled = !!bt;
  }
  if (bt && bt !== 'giant' && !opts.force && !roomFor(x, z, BOSS_TYPES[bt].room)) bt = null;   // no room to stand up in
  applyBoss(u, bt);
  if (!Z.list.includes(u)) Z.list.push(u);
  if (u.bossT && BOSSH.rolled) BOSSH.rolled(u, rolled);
  return u;
}
// a big one's bulk, put on through the bones (and taken off again: the pool reuses bodies)
const BULK = ['Spine1', 'Spine2', 'Neck', 'LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg'];
const bq = new THREE.Matrix3(), bm4 = new THREE.Matrix4();
function bulk(s, on) {
  const B = s.B, B0 = s.bulkBase ||= Object.fromEntries(BULK.filter(n => B[n]).map(n => [n, B[n].scale.clone()]));
  for (const n in B0) B[n].scale.copy(B0[n]);
  if (!on) return;
  const mul = (n, x, y, z) => B0[n] && B[n].scale.set(B0[n].x * x, B0[n].y * y, B0[n].z * z);
  const cx = 1.12 * 1.08, cy = 1.02, cz = 1.1 * 1.06;
  mul('Spine1', 1.12, 1, 1.1); mul('Spine2', 1.08, 1.02, 1.06);
  mul('Neck', 1.08 / cx, 1 / cy, 1.08 / cz);   // a thick neck, but the head stays its own size
  // the shoulders take back the chest's widening (turned into their own axes), then the arms get heavy
  for (const side of ['Left', 'Right']) {
    const sh = B[side + 'Shoulder'];
    if (sh) {
      bq.setFromMatrix4(bm4.makeRotationFromQuaternion(sh.quaternion));
      const e = bq.elements, inv = [1 / cx, 1 / cy, 1 / cz], d = [0, 0, 0];
      for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) d[i] += e[i * 3 + k] * e[i * 3 + k] * inv[k];   // diag of R^T S^-1 R
      mul(side + 'Shoulder', d[0], d[1], d[2]);
    }
    mul(side + 'Arm', 1.1, 1.1, 1.1);
    mul(side + 'UpLeg', 1.14, 1, 1.14);
    mul(side + 'Leg', 1.06 / 1.14, 1, 1.06 / 1.14);
  }
}
export function sleep(u) {
  u.active = false; u.alive = false; u.s.setVisible(false); u.corpse = null;
  const i = Z.list.indexOf(u); if (i >= 0) Z.list.splice(i, 1);
}

// ---------------------------------------------------------------- senses
function canSee(u, P, G) {
  const S = u.s, d = S.pos.distanceTo(P.s.pos);
  const W = C.world;
  const night = W.night;
  let range = lerp(30, 9, night) * (1 - (W.rain || 0) * 0.25);   // rain hides you a little
  if (G.flashlight && night > 0.2) range = Math.max(range, 26);   // your light gives you away
  if (P.s.crouchW > 0.5) range *= 0.55;
  if (G.inside && G.inside !== W.houseAt(S.pos.x, S.pos.z)) range *= 0.7;
  if (d > range) return false;
  // in front, or very close (they feel you there)
  const a = Math.atan2(P.s.pos.x - S.pos.x, P.s.pos.z - S.pos.z);
  const off = Math.abs(wrapPi(a - S.yaw));
  if (off > 1.15 && d > 2.2) return false;
  eye.set(S.pos.x, 1.6, S.pos.z); tgt.set(P.s.pos.x, 1.3 - P.s.crouchW * 0.4, P.s.pos.z);
  return W.los(eye, tgt);
}
// can it see somebody else (a neighbour, a survivor)?
function canSeeH(u, h) {
  const S = u.s, d = S.pos.distanceTo(h.s.pos), W = C.world;
  const range = lerp(26, 8, W.night) * (1 - (W.rain || 0) * 0.25);
  if (d > range) return false;
  const off = Math.abs(wrapPi(Math.atan2(h.s.pos.x - S.pos.x, h.s.pos.z - S.pos.z) - S.yaw));
  if (off > 1.3 && d > 3) return false;
  eye.set(S.pos.x, 1.6, S.pos.z); tgt.set(h.s.pos.x, 1.3, h.s.pos.z);
  return W.los(eye, tgt);
}
// noises the dead can hear: { x, z, t, loud (radius in m) }
function hear(u) {
  let best = null, bd = 0;
  for (const n of C.noises) {
    if (n.heardBy && n.heardBy.has(u.id)) continue;
    const d = Math.hypot(n.x - u.s.pos.x, n.z - u.s.pos.z);
    const r = n.loud * (C.world.houseAt(u.s.pos.x, u.s.pos.z) ? 0.6 : 1);
    if (d < r && (!best || n.loud / (d + 1) > bd)) { best = n; bd = n.loud / (d + 1); }
  }
  if (best) { (best.heardBy ||= new Set()).add(u.id); }
  return best;
}

// ---------------------------------------------------------------- finding the way
// Round walls, fences and houses on the town's walking grid (people.js's A*), shared out a few searches a frame
// so a crowd never stalls the game. A clear straight line needs no search at all.
let findPath = null;
import('./people.js').then(m => { findPath = m.findPath; }).catch(() => {});
let PQ = 0, PQt = -1;
const hpF = new THREE.Vector3();
const pA = V(), pB = V();
function wayTo(u, gx, gz, every = 1.5) {
  const Zb = u.z, S = u.s, W = C.world;
  const straight = Math.atan2(gx - S.pos.x, gz - S.pos.z);
  const far = Math.hypot(gx - S.pos.x, gz - S.pos.z);
  if (!findPath || !W.NAV || !W.NAV.nx) return straight;
  if (!(Zb.forcePath > C.t) && (far < 2.5 || W.los(pA.set(S.pos.x, 0.6, S.pos.z), pB.set(gx, 0.6, gz)))) { Zb.path = null; return straight; }
  const g = Zb.pathGoal;
  if (!g || Math.hypot(g.x - gx, g.z - gz) > 2 || C.t - Zb.pathAt > every + (u.id % 10) * 0.05) {
    if (PQt !== C.t) { PQt = C.t; PQ = 0; }
    if (PQ < 6) { PQ++; Zb.path = findPath(S.pos.x, S.pos.z, gx, gz, 8000); Zb.pathI = 0; Zb.pathAt = C.t; Zb.pathGoal = { x: gx, z: gz }; Zb.waitT = 0; }
    else Zb.waitT = (Zb.waitT || 0) + 1;
  }
  const p = Zb.path;
  if (p && p.length) {
    while (Zb.pathI < p.length - 1 && Math.hypot(p[Zb.pathI][0] - S.pos.x, p[Zb.pathI][1] - S.pos.z) < 0.6) Zb.pathI++;
    const q = p[Zb.pathI]; return Math.atan2(q[0] - S.pos.x, q[1] - S.pos.z);
  }
  // no path yet (this frame's searches are used up) and a wall between: stand and sway a moment, don't walk into it
  // (a search that found no way at all still heads straight: the stuck handling takes it from there)
  return Zb.waitT > 0 && Zb.waitT < 30 ? null : straight;
}

// a goal inside a wall or a house's solid bits: move it to the nearest walkable cell (or give it up: null)
function freeCell(g) {
  const N = C.world && C.world.NAV;
  if (!N || !N.blocked || !N.nx) return g;
  const c = N.cell, i0 = Math.round((g.x - N.x0) / c), j0 = Math.round((g.z - N.z0) / c);
  for (let r = 0; r <= 6; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
    const i = i0 + di, j = j0 + dj; if (i < 0 || j < 0 || i >= N.nx || j >= N.nz) continue;
    const b = N.blocked[j * N.nx + i]; if (b === 0 || b === 3) { if (r) g.set(N.x0 + i * c, 0, N.z0 + j * c); return g; }
  }
  return null;
}

// ---------------------------------------------------------------- the voice
// the jaw moves for exactly as long as the sound plays (audio returns how long; nothing heard, nothing moves)
function voice(u, ev, guess, ...a) {
  const d = emit(ev, u, ...a);
  if (typeof d === 'number') { if (d > 0) u.s.talkT = Math.min(d, 3); }
  else if (C.events[ev]) u.s.talkT = guess;
}

// ---------------------------------------------------------------- one zombie's tick
// returns a command for the body
const hp = V(), hd = V();
export function zombieThink(u, dt, P, G) {
  const Zb = u.z, S = u.s, W = C.world;
  if (u.bossT && u.heavy && S.fly) S.fly = null;   // [boss] a blast or a car doesn't throw a boss through the air
  if (u.giant && BOSSH.think) return BOSSH.think(u, dt, P, G);   // [boss] The Zombie has a mind of its own (bosses.js)
  const cmd = { move: null, speed: 0, face: null };
  S.noLod = !!(Zb.swing || Zb.grab || Zb.doorHit || S.pos.distanceToSquared(P.s.pos) < 9);   // never half-animate one that's on you
  // a turned body: the last of the colour goes out of them before they're up
  if (S.zTurn && S.zTurn.value < 1) S.zTurn.value = Math.min(1, S.zTurn.value + dt / Math.max(0.4, Zb.down > 0 && Zb.down < 30 ? Zb.down : 1));
  if (Zb.down > 0) {                       // knocked down: lie there, then get back up
    Zb.down -= dt; Zb.doorHit = null;
    // a front knockdown: once the stagger back has put it on the floor, it lies there like any other fall
    if (S.act === 'Hit_Knockback' && S.actTime() > 0.3) { const dd = S.acts.Death_D.dur; S.play('Death_D', { hold: true, from: dd - 0.05, fade: 0.3 }); }
    if (Zb.fallYaw != null) { S.yaw = dampAngle(S.yaw, Zb.fallYaw, 3, dt); if (Math.abs(wrapPi(S.yaw - Zb.fallYaw)) < 0.02 || S.actTime() > 0.7) Zb.fallYaw = null; }
    if (Zb.down <= 0 && u.alive) {
      if (u.crawl) { Zb.down = 0; Zb.crawlT = 0; Zb.fallYaw = null; }   // legs shot out: it never stands again, it drags itself
      else { S.play('LayToIdle', { fade: 0.35, rate: rnd(0.8, 1.1) }); Zb.getUp = true; }
    }
    return cmd;
  }
  if (Zb.getUp) { if (!S.act || S.act !== 'LayToIdle') Zb.getUp = false; else return cmd; }
  if (Zb.stunT > 0) { Zb.stunT -= dt; if (!Zb.hold) return cmd; }   // a hard hit: it stalls a moment, swaying, before it comes on again
  // who it's after: you, or one of the living around town
  if (Zb.tgt && Zb.tgt !== P && (!Zb.tgt.alive || Zb.tgt.gone)) { const v = Zb.tgt; Zb.tgt = null; if (Zb.state === 'chase') { if (v.downAt && !v.gone && S.pos.distanceTo(v.s.pos) < 6) { Zb.state = 'feed'; Zb.feedOn = v; Zb.t = rnd(5, 9) * (C.feedK || 1); } else { Zb.state = 'investigate'; Zb.goal = Zb.lastSeen.clone(); Zb.t = 5; } } }
  const T = Zb.tgt && Zb.tgt !== P ? Zb.tgt : P;
  const pd = S.pos.distanceTo(T.s.pos);
  const feeding = Zb.state === 'feed';
  // ---- perception (throttled) ----
  Zb.losT -= dt;
  if (Zb.losT <= 0 && !C.calm) {   // on the title screen they don't notice you
    Zb.losT = pd < 12 ? 0.15 : pd < 35 ? 0.35 : 0.8;
    const dP = S.pos.distanceTo(P.s.pos);
    // one that's feeding only looks up for somebody right on top of it
    if (P.alive && !C.ignoreP && (!feeding || dP < 9) && canSee(u, P, G)) {
      if (Zb.state !== 'chase' || Zb.tgt !== P) { if (Zb.state !== 'chase') voice(u, 'zombieSpots', u.runner ? 1.3 : 1.1, dP); if (S.act === 'Fixing_Kneeling') S.stopAct(0.3); Zb.state = 'chase'; Zb.path = null; }
      Zb.tgt = P; Zb.seen = C.t; Zb.lastSeen.copy(P.s.pos);
    } else if (C.npcs && C.npcs.length && Zb.tgt !== P) {
      let best = null, bd = 1e9;
      for (const h of C.npcs) { if (!h.alive || h.hidden || h.gone) continue; const d = S.pos.distanceTo(h.s.pos); if (d < bd && d < 28 && canSeeH(u, h)) { best = h; bd = d; } }
      if (best && (!feeding || bd < 4) && (Zb.state !== 'chase' || best === Zb.tgt || (bd < pd - 2 && !(Zb.lockT > C.t)))) {
        if (Zb.state !== 'chase') { voice(u, 'zombieSpotsNPC', 1.1, best); if (S.act === 'Fixing_Kneeling') S.stopAct(0.3); }
        if (Zb.tgt !== best) Zb.path = null;
        Zb.state = 'chase'; Zb.tgt = best; Zb.seen = C.t; Zb.lastSeen.copy(best.s.pos);
      }
    }
  }
  const n = C.calm ? null : hear(u);
  if (n && Zb.state !== 'chase' && (Zb.state !== 'feed' || n.loud > 40)) { if (S.act === 'Fixing_Kneeling') S.stopAct(0.3); Zb.state = 'investigate'; Zb.goal = freeCell(V(n.x + rnd(-2, 2), 0, n.z + rnd(-2, 2))); Zb.path = null; Zb.t = rnd(8, 14); if (n.loud > 40 && Math.random() < 0.4) voice(u, 'zombieAlert', 1.6); }
  else if (n && Zb.state === 'chase' && T === P && C.t - Zb.seen > 2) { Zb.lastSeen.set(n.x, 0, n.z); }
  // ---- legs shot out: it lies on its back and drags itself along the floor toward you, head first ----
  if (u.crawl && u.alive) {
    const dd = S.acts.Death_D.dur;
    if (S.act !== 'Death_D') S.play('Death_D', { hold: true, from: dd - 0.05, fade: 0.3 });
    Zb.reach = 0; Zb.swing = null; Zb.doorHit = null; Zb.door = null;
    let gx = null, gz = null;
    if (Zb.state === 'chase' && T.alive) { const fr = C.t - Zb.seen < 1.5; gx = fr ? T.s.pos.x : Zb.lastSeen.x; gz = fr ? T.s.pos.z : Zb.lastSeen.z; if (C.t - Zb.seen > 12) { Zb.state = 'idle'; Zb.tgt = null; } }
    else if (Zb.state === 'investigate' && Zb.goal) { gx = Zb.goal.x; gz = Zb.goal.z; Zb.t -= dt; if (Zb.t <= 0 || Math.hypot(gx - S.pos.x, gz - S.pos.z) < 1) { Zb.state = 'idle'; Zb.t = rnd(3, 8); } }
    else if (Zb.state !== 'idle') { Zb.state = 'idle'; Zb.t = rnd(3, 8); }
    if (gx != null && Math.hypot(gx - S.pos.x, gz - S.pos.z) > 0.7) {
      const dir = wayTo(u, gx, gz, 2) ?? Math.atan2(gx - S.pos.x, gz - S.pos.z);
      // lying on its back with its head toward you: the body's yaw points away from where it's going
      S.yaw = dampAngle(S.yaw, dir + Math.PI, 2.5, dt);
      Zb.crawlT = (Zb.crawlT || 0) + dt * 4;
      const pull = 0.6 * Math.max(0, Math.sin(Zb.crawlT)) * Math.min(1, Math.abs(Math.cos(wrapPi(S.yaw - dir - Math.PI))) + 0.2);
      S.pos.x += Math.sin(dir) * pull * dt; S.pos.z += Math.cos(dir) * pull * dt;
      if (Math.sin(Zb.crawlT) > 0.7 && !Zb.crawlSnd) { Zb.crawlSnd = true; if (Math.random() < 0.3) voice(u, 'zombieGroan', 1.4, true); }
      if (Math.sin(Zb.crawlT) < 0) Zb.crawlSnd = false;
    }
    // at your ankles: it claws at you (half the damage of a standing one)
    Zb.atkT -= dt;
    if (Zb.state === 'chase' && T.alive && pd < 1.0 && Zb.atkT <= 0) { Zb.atkT = rnd(1.8, 2.8) / (DIFF.cur.aggro || 1); if (T === P) { if (!G.vaulting) emit('zombieClaw', u, { half: true, low: true }); } else emit('zombieClawNPC', u, T, { half: true }); }
    Zb.groanT -= dt;
    if (Zb.groanT <= 0) { Zb.groanT = rnd(4, 10); voice(u, 'zombieGroan', 1.8, Zb.state === 'chase'); }
    Zb.lastP.copy(S.pos);
    return cmd;
  }
  // ---- behaviour ----
  const legK = u.crawl ? 0.18 : u.limp ? 0.55 : 1;   // shot in the legs: limping, or dragging itself
  if (Zb.state === 'chase') {
    const lost = C.t - Zb.seen;
    if (!T.alive || lost > 12) { Zb.state = 'investigate'; Zb.goal = Zb.lastSeen.clone(); Zb.t = 6; Zb.tgt = null; Zb.path = null; }
    // being close counts as seeing
    if (pd < 2.5 && T.alive) { Zb.seen = C.t; Zb.lastSeen.copy(T.s.pos); }
    const fresh = lost < 1.5;
    let dir = null;
    if (T === P && fresh && pd < 54 && W.NAV.gen > 0 && !(Zb.forcePath > C.t)) dir = W.navDir(S.pos.x, S.pos.z);
    if (dir == null) {
      const gx = fresh ? T.s.pos.x : Zb.lastSeen.x, gz = fresh ? T.s.pos.z : Zb.lastSeen.z;
      if (Math.hypot(gx - S.pos.x, gz - S.pos.z) > 0.8) dir = wayTo(u, gx, gz, Zb.forcePath > C.t ? 0.5 : 1.5);
    }
    const run = (u.runner ? u.runSpeed : u.walkSpeed * (pd < 8 ? 1.15 : 1) * (T === P ? 1 : 1.1)) * legK;
    const stopD = Zb.atStop ? 1.05 : 0.85; Zb.atStop = pd <= stopD;   // (hysteresis: no stepping in and out at the edge)
    if (!Zb.atStop && dir != null) { cmd.move = dir; cmd.speed = run * clamp((pd - 0.8) / 0.8, 0.25, 1); }
    // out of sight it only knows where it last saw you: it faces there, not through the walls at you
    const fx = fresh ? T.s.pos.x : Zb.lastSeen.x, fz = fresh ? T.s.pos.z : Zb.lastSeen.z;
    cmd.face = Math.hypot(fx - S.pos.x, fz - S.pos.z) > 0.3 ? Math.atan2(fx - S.pos.x, fz - S.pos.z) : (dir ?? S.yaw);
    Zb.reach = fresh ? clamp(1 - (pd - 1.2) / 5, 0, 1) : 0;
    // got to where it last saw you and you're gone: keep searching on along the way it was going
    if (!fresh && Zb.state === 'chase' && Math.hypot(Zb.lastSeen.x - S.pos.x, Zb.lastSeen.z - S.pos.z) < 1.2) {
      const h = S.yaw + rnd(-0.5, 0.5), L = rnd(3, 6);
      Zb.state = 'investigate'; Zb.goal = V(Zb.lastSeen.x + Math.sin(h) * L, 0, Zb.lastSeen.z + Math.cos(h) * L); Zb.t = rnd(5, 8); Zb.path = null;
    }
    // attack
    Zb.atkT -= dt;
    if (T.alive && !u.crawl && pd < (u.atkR || 1.2 * u.sizeK) && Zb.atkT <= 0 && !S.up && Math.abs(wrapPi(cmd.face - S.yaw)) < 0.9 && reachP(u, T)) {
      Zb.atkT = rnd(1.6, 2.4) * (u.runner ? 0.8 : 1) * (T === P ? 1 : 0.75) / (DIFF.cur.aggro || 1) / (u.atkRate || 1);
      if (T === P && !G.grabbedBy && !u.bossT && Math.random() < (u.runner ? 0.38 : 0.25) * (DIFF.cur.aggro || 1) && !(G.noGrabT > C.t)) emit('zombieGrab', u);
      else {
        // the hit lands when the captured swing's hand gets there at this speed (plus a frame: never before it)
        const rate = rnd(1.0, 1.25) * (u.atkRate || 1);
        S.playUp('Zombie_Scratch', { rate, fade: 0.1, fadeAt: 1.3 / (u.atkRate || 1), fadeOut: 0.3 });
        Zb.swing = { t: 0, hitAt: (Z.swings?.Zombie_Scratch?.hit || 0.6) / rate + 1 / 60, done: false, on: T };
        voice(u, 'zombieGrowl', 0.7);
      }
    }
  } else if (Zb.state === 'feed') {   // crouched over somebody it pulled down, tearing at them
    Zb.reach = 0; Zb.t -= dt;
    const v = Zb.feedOn;
    // the body, not the victim's pivot: they fell some way from where they stood
    if (v && !v.gone) { if (v.s.B && v.s.B.Spine2) v.s.B.Spine2.getWorldPosition(hpF); else hpF.copy(v.s.pos); Zb.feedAt = hpF; }
    const d = v ? Math.hypot(hpF.x - S.pos.x, hpF.z - S.pos.z) : 0;
    if (!v || v.gone || Zb.t <= 0) { if (S.act === 'Fixing_Kneeling') S.stopAct(0.5); Zb.feedOn = null; Zb.feedAt = null; Zb.state = 'idle'; Zb.t = rnd(2, 5); Zb.dipT = -1; }
    else if (d > 0.7 && !S.act) { cmd.move = wayTo(u, hpF.x, hpF.z, 2) ?? Math.atan2(hpF.x - S.pos.x, hpF.z - S.pos.z); cmd.speed = u.walkSpeed * legK * clamp(d / 1.2, 0.35, 1); }
    else if (!S.act) { cmd.face = Math.atan2(hpF.x - S.pos.x, hpF.z - S.pos.z); if (Math.abs(wrapPi(cmd.face - S.yaw)) < 0.15) { S.play('Fixing_Kneeling', { loop: true, fade: 0.4, rate: 1.1 }); Zb.biteT = rnd(0.6, 1.0); Zb.bites = 0; } }
    else if (S.act === 'Fixing_Kneeling') {
      // every second or so it dips its head and tears another mouthful: you hear it as it happens
      Zb.biteT -= dt;
      if (Zb.biteT <= 0 && Zb.dipT < 0) { Zb.biteT = rnd(0.9, 1.6); Zb.dipT = 0; Zb.bitDone = false; }
    }
  } else if (Zb.state === 'investigate') {
    Zb.t -= dt; Zb.reach = 0;
    const g = Zb.goal, d = g ? Math.hypot(g.x - S.pos.x, g.z - S.pos.z) : 0;
    if (!g || d < 1.2 || Zb.t <= 0) { Zb.state = 'idle'; Zb.t = rnd(3, 9); Zb.path = null; }
    else { cmd.move = wayTo(u, g.x, g.z, 3); cmd.speed = (u.runner ? u.walkSpeed * 1.6 : u.walkSpeed) * legK; }
  } else if (Zb.state === 'wander') {
    Zb.t -= dt; Zb.reach = 0;
    if (Zb.wHead == null) Zb.wHead = S.yaw;
    Zb.wHead += (Math.random() - 0.5) * dt * 0.6;   // a heading of its own in the world: it shambles somewhere, not in circles
    cmd.move = Zb.wHead; cmd.speed = u.walkSpeed * 0.7 * legK;
    if (Zb.t <= 0) { Zb.state = 'idle'; Zb.t = rnd(4, 12); }
  } else {   // idle: standing, swaying, now and then wandering off
    Zb.t -= dt; Zb.reach = 0;
    if (Zb.t <= 0) { if (!Zb.indoor || Math.random() < 0.3) { Zb.state = 'wander'; Zb.t = rnd(3, 9); Zb.wHead = S.yaw + rnd(-1.2, 1.2); } else Zb.t = rnd(4, 10); }
  }
  // ---- the feeding dip: down, the bite at the bottom, back up ----
  if (Zb.dipT >= 0) {
    Zb.dipT += dt;
    if (!Zb.bitDone && Zb.dipT >= 0.2) {
      Zb.bitDone = true; Zb.bites++;
      if (C.events.zombieChew) voice(u, 'zombieChew', 0.6); else voice(u, 'zombieFeed', 0.6);
      if (Zb.bites % 2 === 0 && C.fx && S.B.Head && S.visible) { S.B.Head.getWorldPosition(hp); hp.y -= 0.12; hd.set(Math.sin(S.yaw), 0.6, Math.cos(S.yaw)); C.fx.blood(hp, hd, 0.45); }
    }
    if (Zb.dipT > 0.42 || Zb.state !== 'feed') Zb.dipT = -1;
  }
  // ---- doors in the way: beat on them until they give ----
  Zb.doorT -= dt;
  if (cmd.move != null && Zb.doorT <= 0) {
    Zb.doorT = 0.25; Zb.door = null;
    for (const D of W.doors) {
      if (D.broken || D.box.off) continue;
      const dd = Math.hypot(D.x - S.pos.x, D.z - S.pos.z); if (dd > 1.15) continue;
      const toD = Math.atan2(D.x - S.pos.x, D.z - S.pos.z);
      if (Math.abs(wrapPi(toD - cmd.move)) < 1.2) { Zb.door = D; break; }
    }
  }
  if (Zb.door && !Zb.door.broken && !Zb.door.box.off) {
    const D = Zb.door;
    cmd.face = Math.atan2(D.x - S.pos.x, D.z - S.pos.z); cmd.move = null;
    // the bang (and the shake, and the damage) come when the fist actually lands on the door
    if (!S.up && !Zb.doorHit) { const rate = rnd(0.9, 1.2); S.playUp('Zombie_Scratch', { rate, fade: 0.1, fadeAt: 1.2 }); Zb.doorHit = { t: 0, at: (Z.swings?.Zombie_Scratch?.hit || 0.57) / rate + 1 / 60, D }; }
  }
  if (Zb.doorHit) {
    const H = Zb.doorHit, D = H.D; H.t += dt;
    if (H.t >= H.at) {
      Zb.doorHit = null;
      if (!D.broken && !D.box.off && S.up === 'Zombie_Scratch' && Math.hypot(D.x - S.pos.x, D.z - S.pos.z) < 1.3) {
        emit('doorBang', D, u); D.hp -= rnd(8, 14) * (u.runner ? 1.5 : 1) * (u.big ? 2.5 * u.bigK : 1) * (u.dmgK || 1); D.bangT = 0.3;
        if (D.hp <= 0) emit('doorBreak', D, u);
      }
    }
  }
  // ---- the claw lands (only if the swinging hand really got to them) ----
  if (Zb.swing) {
    Zb.swing.t += dt;
    if (!Zb.swing.done && Zb.swing.t >= Zb.swing.hitAt) {
      const V2 = Zb.swing.on || P, vd = S.pos.distanceTo(V2.s.pos);
      const a = Math.atan2(V2.s.pos.x - S.pos.x, V2.s.pos.z - S.pos.z);
      if (!(V2.alive && vd < (u.atkR || 1.2 * u.sizeK) && Math.abs(wrapPi(a - S.yaw)) < 1.0 && reachP(u, V2))) Zb.swing.done = true;   // missed
      // the hand is still on its way (the pose here is last frame's): give it a few frames to arrive, then it's a miss
      // ([boss] a big one's hands swing down from above your head: in reach and facing you is a hit)
      else if (u.bossT || handReaches(u, V2)) { Zb.swing.done = true; if (V2 === P) { if (!G.vaulting) { emit('zombieClaw', u); if (u.heavy && BOSSH.heavyHit) BOSSH.heavyHit(u, V2); } } else { emit('zombieClawNPC', u, V2); if (u.heavy && BOSSH.heavyHit) BOSSH.heavyHit(u, V2); } }
      else if (Zb.swing.t > Zb.swing.hitAt + 0.15) Zb.swing.done = true;
    }
    if (Zb.swing.t > 1.4 / (u.atkRate || 1)) Zb.swing = null;
  }
  // ---- stuck on something: try sideways for a moment ----
  if (cmd.move != null) {
    const moved = Math.hypot(S.pos.x - Zb.lastP.x, S.pos.z - Zb.lastP.z);
    Zb.stuckT = moved < cmd.speed * dt * 0.25 ? Zb.stuckT + dt : Math.max(0, Zb.stuckT - dt * 2);
    if (Zb.stuckT > 0.8 && Zb.state === 'wander') { Zb.wHead = (Zb.wHead ?? S.yaw) + Math.PI * rnd(0.6, 1.0); Zb.stuckT = 0; }   // walked into a wall: turn away from it
    if (Zb.stuckT > 0.8) { cmd.move += Zb.side ?? (Zb.side = -(Zb.sideL || -1.2), Zb.sideL = Zb.side); if (Zb.stuckT > 2.4) { Zb.stuckT = 0; Zb.side = null; Zb.path = null; Zb.pathAt = -9; if (Zb.state !== 'chase') { Zb.state = 'wander'; Zb.t = rnd(2, 4); Zb.wHead = S.yaw + Math.PI + rnd(-0.6, 0.6); Zb.goal = null; } } }
  }
  // ---- not getting any closer (sliding along a car, round a fence): find a real way round ----
  if (Zb.state === 'chase' || Zb.state === 'investigate') {
    const gx = Zb.state === 'chase' ? (C.t - Zb.seen < 1.5 ? T.s.pos.x : Zb.lastSeen.x) : Zb.goal ? Zb.goal.x : S.pos.x;
    const gz = Zb.state === 'chase' ? (C.t - Zb.seen < 1.5 ? T.s.pos.z : Zb.lastSeen.z) : Zb.goal ? Zb.goal.z : S.pos.z;
    const gd = Math.hypot(gx - S.pos.x, gz - S.pos.z);
    if (cmd.move == null || gd < 2) { Zb.progAt = C.t; Zb.progD = gd; }
    else if (Zb.progAt == null || C.t - Zb.progAt > 1.5) {
      if (Zb.progAt != null && Zb.progD - gd < 0.4 && !(Zb.forcePath > C.t)) { Zb.path = null; Zb.pathAt = -9; Zb.forcePath = C.t + 3; }
      Zb.progAt = C.t; Zb.progD = gd;
    }
  } else Zb.progAt = null;
  Zb.lastP.copy(S.pos);
  // ---- groans ----
  Zb.groanT -= dt;
  if (Zb.groanT <= 0 && Zb.state !== 'feed') { Zb.groanT = Zb.state === 'chase' ? rnd(2.5, 6) : rnd(6, 16); voice(u, 'zombieGroan', 2.2, Zb.state === 'chase'); }
  return cmd;
}

// can its hands actually get to you? (not through a wall, a window or a closed door)
const rA = V(), rB = V();
function reachP(u, T) { if (Math.abs((T.s.pos.y || 0) - (u.s.pos.y || 0)) > 1.0) return false; rA.set(u.s.pos.x, 1.25, u.s.pos.z); rB.set(T.s.pos.x, 1.25, T.s.pos.z); return C.world.los(rA, rB); }
// did the swinging hand get to the body? (nearest hand to the nearest hit sphere)
const hA = V();
function handReaches(u, T) {
  const B = u.s.B;
  if (!T.sph || !T.sph.length) return true;   // no hit shapes on this one: the distance test above is all there is
  let best = 1e9;
  for (const side of ['RightHand', 'LeftHand']) {
    if (!B[side]) continue; B[side].getWorldPosition(hA);
    for (const sp of T.sph) best = Math.min(best, hA.distanceTo(sp.c) - sp.r);
  }
  return best < 0.25 * u.sizeK;
}
// arms out toward you, head lolling, the hunch: on top of the captured walk
const fwd = V(), lft = V();
export function zombiePose(u, P, dt) {
  const S = u.s, Zb = u.z, B = S.B;
  if (!u.alive || S.frozen) return;
  // dragging itself along on its back: the arms reach back over the head and pull, one then the other
  if (u.crawl && S.act === 'Death_D' && Zb.down <= 0 && B.LeftArm) {
    const w = S.acts.Death_D.w, ph = Zb.crawlT || 0, back = S.yaw + Math.PI;
    for (const [side, k] of [['Left', 0], ['Right', Math.PI]]) {
      const a = Math.sin(ph + k), up = 0.25 + 0.35 * Math.max(0, a);
      fwd.set(Math.sin(back + (side === 'Left' ? 0.35 : -0.35)) * (0.6 + 0.4 * a), up, Math.cos(back + (side === 'Left' ? 0.35 : -0.35)) * (0.6 + 0.4 * a)).normalize();
      aimBone(B[side + 'Arm'], B[side + 'ForeArm'], fwd, 0.8 * w, true);
      fwd.y -= 0.35 + 0.3 * Math.max(0, -a); fwd.normalize();
      aimBone(B[side + 'ForeArm'], B[side + 'Hand'], fwd, 0.7 * w, true);
    }
    S.curlFingers(1, 0.6, w); S.curlFingers(-1, 0.6, w);
    if (B.Head) { tv2.set(Math.sin(S.yaw), 0, Math.cos(S.yaw)); lft.set(Math.cos(S.yaw), 0, -Math.sin(S.yaw)); addTurn(B.Neck, lft, -0.35 * w); }
    S.setMorph(['jawOpen', 'mouthOpen'], 0.35 + 0.3 * Math.max(0, Math.sin(ph * 0.5)));
    return;
  }
  if (Zb.down > 0) return;
  lft.set(Math.cos(S.yaw), 0, -Math.sin(S.yaw));   // the body's left: turning round it bends forward
  tv2.set(Math.sin(S.yaw), 0, Math.cos(S.yaw));
  // feeding: the head and shoulders dip into the body at every bite
  if (S.act === 'Fixing_Kneeling' && Zb.state === 'feed') {
    // hunched over the body, hands down on it (not a repair pose working at the floor)
    const k = Math.min(1, S.actTime() / 0.5);
    addTurn(B.Spine1, lft, 0.35 * k); addTurn(B.Neck, lft, 0.3 * k);
    if (Zb.feedAt) for (const side of ['Left', 'Right']) {
      const sh = B[side + 'Arm'].getWorldPosition(tv);
      fwd.set(Zb.feedAt.x - sh.x + lft.x * (side === 'Left' ? 0.12 : -0.12), Zb.feedAt.y + 0.05 - sh.y, Zb.feedAt.z - sh.z + lft.z * (side === 'Left' ? 0.12 : -0.12)).normalize();
      aimBone(B[side + 'Arm'], B[side + 'ForeArm'], fwd, 0.8 * k); aimBone(B[side + 'ForeArm'], B[side + 'Hand'], fwd, 0.6 * k);
    }
  }
  if (Zb.dipT >= 0 && S.act === 'Fixing_Kneeling') {
    const w = Math.sin(clamp(Zb.dipT / 0.42, 0, 1) * Math.PI);
    addTurn(B.Spine2, lft, 0.45 * w); addTurn(B.Neck, lft, 0.5 * w);
    S.setMorph(['jawOpen', 'mouthOpen'], w);
    return;
  }
  if (S.act) return;
  // its own stoop, and a flinch forward when hit from behind
  Zb.flinchF = damp(Zb.flinchF || 0, 0, 5, dt);
  addTurn(B.Spine1, lft, (Zb.lean || 0) * 0.8 + Zb.flinchF);
  // running: pitched forward from the waist, chin up to keep its eyes on you, the shoulders rolling with each stride
  const runW = S.speed > S.vw ? clamp((S.speed - S.vw) / Math.max(0.5, (S.vr || 3) - S.vw), 0, 1) : 0;
  if (runW > 0.02 && B.Spine2) {
    addTurn(B.Spine2, lft, 0.2 * runW); addTurn(B.Neck, lft, -0.16 * runW);
    addTurn(B.Spine1, tv2, Math.sin((S.phase || 0) * Math.PI * 2) * 0.09 * runW);
  }
  // staggered by a hard hit: the upper body rocks off to the side it was knocked
  if (Zb.stunT > 0) addTurn(B.Spine1, tv2, -(Zb.stagS || 1) * Math.sin(Math.min(1, Zb.stunT / 0.4) * Math.PI) * 0.22);
  // holding on to you: both hands clamp your shoulders and it lunges in to bite, jaw wide, again and again
  Zb.holdW = damp(Zb.holdW || 0, Zb.hold ? 1 : 0, 8, dt);
  if (Zb.holdW > 0.02 && P && P.s && P.s.B && P.s.B.LeftArm) {
    const w = Zb.holdW;
    for (const side of ['Left', 'Right']) {
      const sh = B[side + 'Arm'].getWorldPosition(tv), to = P.s.B[(side === 'Left' ? 'Right' : 'Left') + 'Arm'].getWorldPosition(hA);
      fwd.subVectors(to, sh).normalize();
      aimBone(B[side + 'Arm'], B[side + 'ForeArm'], fwd, 0.9 * w);
      aimBone(B[side + 'ForeArm'], B[side + 'Hand'], fwd, 0.75 * w);
    }
    S.curlFingers(1, 0.85, w); S.curlFingers(-1, 0.85, w);
    Zb.holdT = (Zb.holdT || 0) + dt;
    const lunge = Math.pow(Math.max(0, Math.sin(Zb.holdT * 5.2)), 3) * w;
    addTurn(B.Spine2, lft, 0.18 * lunge); addTurn(B.Neck, lft, 0.3 * lunge);
    S.setMorph(['jawOpen', 'mouthOpen'], 0.35 + 0.65 * lunge);
    Zb.sway += dt * 0.7;
    return;
  } else Zb.holdT = 0;
  if (u.limp && B.Hips) { Zb.limpP = (Zb.limpP || 0) + dt * S.speed * 3.2; addTurn(B.Hips, tv2, Math.sin(Zb.limpP) * 0.12 * Math.min(1, S.speed)); }
  Zb.reachW = damp(Zb.reachW || 0, (Zb.reach || 0) * (S.up ? 0 : 1), 4, dt);
  if (Zb.reachW > 0.02 && P) {
    for (const side of ['Left', 'Right']) {
      const sh = B[side + 'Arm'].getWorldPosition(tv);
      fwd.set(P.s.pos.x - sh.x, (P.head ? P.head.y - 0.2 : 1.3) - sh.y, P.s.pos.z - sh.z).normalize();
      fwd.x += Math.sin(S.yaw + (side === 'Left' ? 0.5 : -0.5)) * 0.15; fwd.z += Math.cos(S.yaw + (side === 'Left' ? 0.5 : -0.5)) * 0.15;
      aimBone(B[side + 'Arm'], B[side + 'ForeArm'], fwd, Zb.reachW * 0.85);
      aimBone(B[side + 'ForeArm'], B[side + 'Hand'], fwd, Zb.reachW * 0.7);
    }
    S.curlFingers(1, 0.45, Zb.reachW); S.curlFingers(-1, 0.45, Zb.reachW);
  }
  // the head lolls to one side
  Zb.sway += dt * 0.7;
  const roll = Zb.tilt + Math.sin(Zb.sway) * 0.05;
  addTurn(B.Neck, tv2, roll * 0.5); addTurn(B.Head, tv2, roll * 0.6);
  S.setMorph(['jawOpen', 'mouthOpen'], 0.25 + Math.max(0, S.mouth) * 1.4);
}

// ---------------------------------------------------------------- getting hurt
// (called by combat.damage through emit('hurt'))
export function zombieHurt(u, dmg, by, info) {
  const Zb = u.z, S = u.s;
  if (by && (by.isPlayer || by.npc) && (Zb.state !== 'chase' || Zb.tgt !== by && by.npc && !(Zb.tgt === C.player))) { if (S.act === 'Fixing_Kneeling') S.stopAct(0.2); Zb.state = 'chase'; Zb.tgt = by; Zb.seen = C.t; Zb.lastSeen.copy(by.s.pos); Zb.path = null; }
  const knock = (info.knock || 0) * (u.big ? 0.35 / u.bigK : 1) / (u.bossT ? u.sizeK * u.sizeK : 1);   // the big ones barely stagger ([boss] the special ones less still)
  const dir = info.dir || V(Math.sin(S.yaw + Math.PI), 0, Math.cos(S.yaw + Math.PI));
  Zb.doorHit = null;
  // shot in the legs: a limp, then it can't stand at all
  if (info.part === 'legs' && dmg > 0 && !u.heavy) {   // ([boss] a boss or The Zombie never goes down on its belly)
    u.legDmg = (u.legDmg || 0) + dmg / (u.bossT ? 2 : 1);
    if (u.legDmg > 80 && !u.crawl) { u.crawl = true; u.limp = true; if (Zb.down <= 0) { knockDown(u, dir); Zb.down = rnd(1.5, 2.5); return; } }
    else if (u.legDmg > 45 && !u.limp) { u.limp = true; if (Math.random() < 0.3 && Zb.down <= 0) { knockDown(u, dir); return; } }
  }
  // heavy blow or shove: stagger back, maybe go down
  if (knock > 0) {
    S.vel.set(dir.x * (1.2 + knock * 2.2), 0, dir.z * (1.2 + knock * 2.2));
    if (Math.random() < knock * (info.part === 'head' ? 0.9 : 0.55) && Zb.down <= 0) { knockDown(u, dir); return; }
  }
  Zb.atkT = Math.max(Zb.atkT, 0.6 + knock);   // it takes them a moment to come again
  if (Zb.swing) Zb.swing = null;
  // a hard hit (20+): it stalls on the spot and staggers half a step sideways, off its line (not on the boss ones)
  if (dmg >= 20 && !u.heavy && Zb.down <= 0 && !S.act) {
    Zb.stunT = Math.max(Zb.stunT || 0, 0.3 + Math.min(0.45, dmg / 160));
    const sd = Math.random() < 0.5 ? 1 : -1, st = 0.6 + Math.min(0.7, dmg / 90);
    S.vel.x += -dir.z * sd * st; S.vel.z += dir.x * sd * st; Zb.stagS = sd;
  }
  // which way the hit came from: from behind it lurches forward, not back toward the shooter
  const rel = wrapPi(Math.atan2(dir.x, dir.z) - S.yaw);
  if (Math.abs(rel) < Math.PI / 2) { Zb.flinchF = 0.35 + Math.min(0.2, dmg / 200); if (!S.act && Zb.down <= 0) S.vel.addScaledVector(dir, 0.6); }   // lurches a step forward
  else if (!S.act) S.playUp(info.part === 'head' ? 'Hit_Head' : 'Hit_Chest', { rate: 1.3, fade: 0.05, fadeAt: 0.55, fadeOut: 0.25 });
}
// knocked off its feet: hit from the front it staggers back and goes over; from behind it twists as it falls
export function knockDown(u, dir) {
  const Zb = u.z, S = u.s;
  if (u.bossT && Math.random() < (u.kdK || 0)) { Zb.atkT = Math.max(Zb.atkT, 0.5); return; }   // [boss] it rocks, and stays up
  // already down (or going down): it stays down a bit longer, no snapping back upright to fall again
  if (Zb.down > 0 || S.act === 'Death_D' || S.act === 'Hit_Knockback') { Zb.down = Math.max(Zb.down, rnd(1.2, 2.2)); Zb.swing = null; Zb.doorHit = null; return; }
  if (S.act === 'LayToIdle') { Zb.getUp = false; S.play('Death_D', { hold: true, from: S.acts.Death_D.dur * 0.75, fade: 0.3 }); Zb.down = rnd(1.8, 3.4); Zb.swing = null; Zb.doorHit = null; emit('bodyDown', u, 2.5); return; }
  if (S.up) { S.ups[S.up].target = 0; S.up = null; }   // (play() crossfades the move going out: nothing snaps)
  if (S.act === 'Fixing_Kneeling') Zb.feedOn = null;
  let rate;
  const fall = Math.atan2(-dir.x, -dir.z), rel = Math.abs(wrapPi(fall - S.yaw));
  if (rel < Math.PI / 2) {
    S.yaw = fall + rnd(-0.3, 0.3); Zb.fallYaw = null;
    if (Math.random() < 0.6) { rate = 1.25; S.play('Hit_Knockback', { rate, fade: 0.1, hold: true }); }
    else { rate = 1.4; S.play('Death_D', { hold: true, fade: 0.15, rate }); }
  } else {
    // from behind: it twists a little as it goes down, never spins round on the spot
    Zb.fallYaw = S.yaw + clamp(wrapPi(fall - S.yaw), -0.6, 0.6) * (Math.random() < 0.5 ? 1 : -1);
    rate = 1.25; S.play('Death_D', { hold: true, fade: 0.15, rate });
  }
  emit('bodyDown', u, rate);   // the body hitting the ground (main.js: SND.bodyFall)
  Zb.down = rnd(1.8, 3.4); Zb.swing = null; Zb.doorHit = null; Zb.dipT = -1;
}
