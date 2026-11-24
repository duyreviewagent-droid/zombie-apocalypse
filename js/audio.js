// Zombie_Apocalypse — all sound. Recorded footsteps (Kenney CC0) through a live mix; everything else is synthesised
// with Web Audio, nothing is a sample:
//  - the dead: groans, moans, shrieks, growls and bites built from a rasping, flapping throat through vowel formants;
//  - fists, bats, crowbars and blades whooshing and landing (blunt thuds, wet cuts, bones cracking);
//  - guns that echo off the houses (and boom in a small room), glass smashing, doors creaking, banging and breaking;
//  - rummaging through cupboards, eating, drinking, tearing bandages, a car alarm, an old truck turning over;
//  - a dead town around you: wind, crows, crickets, a dog, far-off sirens, screams and gunfire, a helicopter that isn't
//    coming for you; and a score: cold drone and lonely piano, a trembling tension layer, and a pounding chase.
let ctx = null, master, sfxBus, musicBus, voiceBus, radioBus, reverb, farVerb, meter, duck, muffle;
let noiseBuf = null, brownBuf = null, started = false, paused = false, roomVerb = null, indoor = 0;
let windG, windF, breathF, breathG, heartT = 0;
// [realism] where you are: outdoor echo vs a room's reflections (crossfaded by indoor), and an 'outside' bus whose lowpass
// closes when you're under a roof, so birds, sirens, wind and far gunfire come through the walls dull
let outSend = null, roomSend = null, fvRet = null, occ = null, occF = null;
const LOWP = (() => { try { const u = navigator.userAgent || ''; return /iPhone|iPod/.test(u) || (/Android/i.test(u) && /Mobile/.test(u)) || /[?&]lowpower=1/.test(location.search); } catch (e) { return false; } })();   // phones: cheaper panning, fewer grains
const S = { music: 0.7, sfx: 1 };
const L = { x: 0, y: 1.6, z: 0, yaw: 0 };
let mode = 'title';

function makeNoise(seconds, brown) {
  const b = ctx.createBuffer(2, ctx.sampleRate * seconds, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c); let last = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; }
  }
  return b;
}
// open country: a short early slap, then echoes coming back off the hills over a couple of seconds
function makeOutdoor(seconds, echoes = 10, decay = 1.6) {
  const sr = ctx.sampleRate, len = sr * seconds, b = ctx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < len; i++) { const t = i / sr; d[i] = (Math.random() * 2 - 1) * Math.exp(-t * decay) * 0.25 * (t < 0.01 ? t / 0.01 : 1); }
    for (let k = 0; k < echoes; k++) {
      const at = Math.floor((0.12 + Math.random() * (seconds * 0.6)) * sr), g = (0.5 - k * 0.035) * (Math.random() < 0.5 ? -1 : 1), w = 200 + Math.random() * 600;
      for (let j = 0; j < w && at + j < len; j++) d[at + j] += g * (Math.random() * 2 - 1) * Math.exp(-j / (w * 0.3));
    }
    let lp = 0; for (let i = 0; i < len; i++) { const a = 0.32 - 0.26 * Math.min(1, i / len * 2); lp += (d[i] - lp) * a; d[i] = lp; }
  }
  return b;
}

export function init() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  const wake = () => { if (ctx.state !== 'running') ctx.resume(); };
  addEventListener('keydown', wake); addEventListener('pointerdown', wake);
  master = ctx.createGain(); master.gain.value = 0.95;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 4; comp.attack.value = 0.002; comp.release.value = 0.3;
  const makeup = ctx.createGain(); makeup.gain.value = 1.7;
  const limit = ctx.createDynamicsCompressor(); limit.threshold.value = -2; limit.knee.value = 0; limit.ratio.value = 20; limit.attack.value = 0.001; limit.release.value = 0.1;
  master.connect(comp).connect(makeup).connect(limit).connect(ctx.destination);
  meter = ctx.createAnalyser(); meter.fftSize = 2048; limit.connect(meter);
  // everything except the music goes through "muffle": a blast close by dulls your hearing for a moment
  muffle = ctx.createBiquadFilter(); muffle.type = 'lowpass'; muffle.frequency.value = 20000; muffle.Q.value = 0.5;
  duck = ctx.createGain(); duck.gain.value = 1;
  muffle.connect(duck).connect(master);
  reverb = ctx.createConvolver(); reverb.buffer = makeOutdoor(2.2, 6, 2.4);
  const rv = ctx.createGain(); rv.gain.value = 0.45; reverb.connect(rv).connect(muffle);
  farVerb = ctx.createConvolver(); farVerb.buffer = makeOutdoor(3.4, 14, 1.2);
  const fv = ctx.createGain(); fv.gain.value = 0.55; farVerb.connect(fv).connect(muffle); fvRet = fv;
  sfxBus = ctx.createGain(); sfxBus.gain.value = S.sfx; sfxBus.connect(muffle);
  const sr = ctx.createGain(); sr.gain.value = 0.22; sfxBus.connect(sr).connect(reverb); outSend = sr;
  occ = ctx.createGain(); occF = ctx.createBiquadFilter(); occF.type = 'lowpass'; occF.frequency.value = 20000; occF.Q.value = 0.4; occ.connect(occF).connect(sfxBus);
  musicBus = ctx.createGain(); musicBus.gain.value = S.music * 1.3; musicBus.connect(master);
  const mr = ctx.createGain(); mr.gain.value = 0.35; musicBus.connect(mr).connect(reverb);
  voiceBus = ctx.createGain(); voiceBus.gain.value = 1.4; voiceBus.connect(sfxBus);
  // the radio: a small speaker on your vest
  radioBus = ctx.createGain(); radioBus.gain.value = 1.0;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 380; hp.Q.value = 0.7;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3300; lp.Q.value = 0.9;
  const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 1700; pk.gain.value = 6; pk.Q.value = 1.2;
  const ws = ctx.createWaveShaper(); const curve = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 2.4) / Math.tanh(2.4); } ws.curve = curve;
  const rg = ctx.createGain(); rg.gain.value = 1.3;
  radioBus.connect(hp).connect(pk).connect(ws).connect(lp).connect(rg).connect(master);
  noiseBuf = makeNoise(4, false); brownBuf = makeNoise(4, true);
  roomVerb = ctx.createConvolver(); roomVerb.buffer = makeRoom(0.9); const rmv = ctx.createGain(); rmv.gain.value = 0.5; roomVerb.connect(rmv).connect(muffle);
  roomSend = ctx.createGain(); roomSend.gain.value = 0; sfxBus.connect(roomSend).connect(roomVerb);
  loadReal();
  Promise.all([0, 1, 2, 3, 4].map(i => fetchRetry(`sounds/step${i}.wav`).then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b))))
    .then(bs => { stepBufs = bs; }).catch(e => console.log('steps not loaded', e));
}
export const ready = () => !!ctx;
export const now = () => ctx ? ctx.currentTime : 0;

// ---------------------------------------------------------------- listener + positional sources
export function listener(x, y, z, yaw) {
  L.x = x; L.y = y; L.z = z; L.yaw = yaw;
  if (!ctx) return;
  const l = ctx.listener, t = ctx.currentTime;
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  if (l.positionX) { l.positionX.setTargetAtTime(x, t, 0.02); l.positionY.setTargetAtTime(y, t, 0.02); l.positionZ.setTargetAtTime(z, t, 0.02); l.forwardX.setTargetAtTime(fx, t, 0.02); l.forwardY.setTargetAtTime(0, t, 0.02); l.forwardZ.setTargetAtTime(fz, t, 0.02); l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0; }
  else { l.setPosition(x, y, z); l.setOrientation(fx, 0, fz, 0, 1, 0); }
}
function at(pos, dest = sfxBus, ref = 3, roll = 1) {
  if (!pos) return dest;
  const p = ctx.createPanner(); p.panningModel = LOWP ? 'equalpower' : 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = roll; p.maxDistance = 600;
  if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y ?? 1; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y ?? 1, pos.z);
  // [realism] air soaks up the highs over distance: past ~30 m a sound loses its edge (400 m: a dull thud)
  const d = Math.hypot(pos.x - L.x, pos.z - L.z);
  if (d > 30) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 0.5; f.frequency.value = Math.max(900, 19000 / (1 + (d - 30) / 40)); p.connect(f).connect(dest); }
  else p.connect(dest);
  return p;
}
const dist = pos => pos ? Math.hypot(pos.x - L.x, pos.z - L.z) : 0;

// ---------------------------------------------------------------- building blocks
let stepBufs = null, lastStep = -1;
function recorded(t, { gain = 1, rate = 1, pan = 0, lp = 18000, pos = null }) {
  let i; do { i = Math.floor(Math.random() * stepBufs.length); } while (i === lastStep && stepBufs.length > 1);
  lastStep = i;
  const s = ctx.createBufferSource(); s.buffer = stepBufs[i]; s.playbackRate.value = rate;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp;
  const g = ctx.createGain(); g.gain.value = gain;
  if (pos) s.connect(f).connect(g).connect(at(pos));
  else { const p = ctx.createStereoPanner(); p.pan.value = pan; s.connect(f).connect(g).connect(p).connect(sfxBus); }
  s.start(t);
}
function out(pos, dest = sfxBus, pan = 0, ref = 3, roll = 1) { if (pos) return at(pos, dest, ref, roll); if (!pan) return dest; const p = ctx.createStereoPanner(); p.pan.value = pan; p.connect(dest); return p; }
function burst(t, { f = 1000, q = 1, type = 'bandpass', a = 0.002, d = 0.05, g = 0.5, pan = 0, dest = sfxBus, pos = null, sweep = 0, ref = 3, brown = false }) {
  const s = ctx.createBufferSource(); s.buffer = brown ? brownBuf : noiseBuf;
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (sweep) fl.frequency.exponentialRampToValueAtTime(Math.max(30, f * sweep), t + a + d);
  const e = ctx.createGain(); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(g, t + a); e.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  s.connect(fl).connect(e).connect(out(pos, dest, pan, ref));
  s.start(t, Math.random() * 3); s.stop(t + a + d + 0.05);
  return e;
}
function thump(t, f0, f1, d, g, { pan = 0, pos = null, dest = sfxBus, type = 'sine', ref = 3 } = {}) {
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + d);
  const e = ctx.createGain(); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(g, t + 0.003); e.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(e).connect(out(pos, dest, pan, ref)); o.start(t); o.stop(t + d + 0.02);
}
function tone(t, f, d, g, type = 'sine', dest = sfxBus, pos = null, a = 0.004) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
  const e = ctx.createGain(); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(g, t + a); e.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(e).connect(pos ? at(pos, dest) : dest); o.start(t); o.stop(t + d + 0.03);
}
function click(t, f, g, pos, pan = 0) { burst(t, { f, q: 3, d: 0.012, g, pos, pan }); }

// ---------------------------------------------------------------- footsteps, body
const SURF = { grass: { lp: 3200, rate: 0.85, g: 0.8 }, dirt: { lp: 5200, rate: 0.9, g: 0.95 }, mud: { lp: 1800, rate: 0.75, g: 0.9 }, concrete: { lp: 16000, rate: 1, g: 1 }, asphalt: { lp: 12000, rate: 0.97, g: 1 }, gravel: { lp: 9000, rate: 1.05, g: 1.1 }, metal: { lp: 16000, rate: 1.2, g: 1 }, wood: { lp: 6000, rate: 0.82, g: 1.15 }, carpet: { lp: 1500, rate: 0.8, g: 0.6 }, tile: { lp: 16000, rate: 1.12, g: 1.05 }, sand: { lp: 2400, rate: 0.78, g: 0.75 }, water: { lp: 1100, rate: 0.7, g: 0.55 } };
export function step({ speed = 1.4, run = 0, crouch = 0, side = 0, pan = 0, pos = null, surface = 'grass', heavy = 1, mine = false, zombie = false }) {
  if (!ctx || paused) return;
  if (pos && dist(pos) > 45) return;
  const t = ctx.currentTime + 0.005, r = () => 0.85 + Math.random() * 0.3, sf = SURF[surface] || SURF.grass;
  const loud = (mine ? 2.0 : 2.4) * heavy * (0.35 + Math.min(speed, 5) * 0.12 + run * 0.25) * (1 - crouch * 0.55) * r() * sf.g;
  if (stepBufs) recorded(t, { gain: loud * 0.7, rate: sf.rate * (0.92 + run * 0.12) * (0.94 + Math.random() * 0.12), pan, lp: sf.lp, pos });
  thump(t, 90 * r(), 40, 0.08, loud * 0.3, { pan, pos });
  // the backpack rattling
  if (mine && run > 0.3 && Math.random() < 0.5) burst(t + 0.02, { f: 3200, q: 2, d: 0.04, g: loud * 0.06, pan, pos });
  if (surface === 'wood' && Math.random() < 0.25) creak(t + 0.03, pos, 0.25 * loud);
  if (surface === 'grass') burst(t, { f: 2600, q: 0.8, d: 0.09, g: loud * 0.12, pan, pos });
  // sand: a soft dry crunch that slides; shallow water: the foot sloshing in, then droplets splashing off it
  else if (surface === 'sand') { burst(t, { f: 1500, q: 0.6, a: 0.008, d: 0.12, g: loud * 0.14, pan, pos, sweep: 0.6 }); burst(t + 0.03, { f: 4200, q: 1.2, d: 0.05, g: loud * 0.04, pan, pos }); }
  else if (surface === 'water') {
    burst(t, { f: 650, q: 0.9, a: 0.012, d: 0.2, g: loud * 0.45, pan, pos, sweep: 1.8 });
    burst(t + 0.05, { f: 1800, q: 0.7, a: 0.02, d: 0.25, g: loud * 0.18, pan, pos, sweep: 0.5 });
    for (let i = 0; i < 3; i++) burst(t + 0.08 + Math.random() * 0.15, { f: 2500 + Math.random() * 2500, q: 4, d: 0.025, g: loud * 0.05, pan, pos });
  }
  // [realism] what the sole meets (only for you and anyone close: no extra nodes for a crowd far off)
  if (mine || (pos && dist(pos) < 14)) {
    if (surface === 'gravel') { const n = LOWP ? 3 : 6; for (let i = 0; i < n; i++) burst(t + Math.random() * 0.07, { f: 2200 + Math.random() * 4000, q: 2.5, a: 0.001, d: 0.01 + Math.random() * 0.02, g: loud * 0.09, pan, pos }); }   // stones grinding under the heel
    else if (surface === 'metal') { tone(t, 330 + Math.random() * 60, 0.18, loud * 0.05, 'triangle', sfxBus, pos, 0.001); tone(t, 920 + Math.random() * 120, 0.1, loud * 0.025, 'sine', sfxBus, pos, 0.001); }   // a hollow grate rings
    else if (surface === 'wood') thump(t + 0.004, 150 + Math.random() * 30, 95, 0.09, loud * 0.18, { pan, pos, type: 'triangle' });   // floorboards: hollow underneath
    else if ((surface === 'concrete' || surface === 'asphalt' || surface === 'tile') && run > 0.3) burst(t + 0.05, { f: 3000, q: 0.7, a: 0.01, d: 0.06, g: loud * 0.05, pan, pos, sweep: 0.5 });   // the sole scuffs as it pushes off
    else if (surface === 'mud') burst(t + 0.04, { f: 520, q: 1.2, a: 0.015, d: 0.12, g: loud * 0.2, pan, pos, sweep: 1.6 });   // the suck as the boot pulls out
  }
  // a shambler doesn't lift its feet: the other foot drags and scuffs along after the heel lands
  if (zombie && run < 0.5) { burst(t + 0.06, { f: 400 + Math.random() * 200, q: 0.7, a: 0.03, d: 0.18, g: loud * 0.15, pan, pos, brown: true }); burst(t + 0.08, { f: 1800 + Math.random() * 600, q: 0.6, a: 0.03, d: 0.14, g: loud * 0.05, pan, pos, sweep: 0.7 }); }
}
export function land(impact = 3, mine = true, pos = null) {
  if (!ctx || paused) return;
  const t = ctx.currentTime + 0.005, g = Math.min(1, impact / 5);
  if (stepBufs) { recorded(t, { gain: 1.1 * g + 0.3, rate: 0.85, pan: -0.1, lp: 6000, pos }); recorded(t + 0.03, { gain: g + 0.2, rate: 0.8, pan: 0.1, lp: 6000, pos }); }
  thump(t, 110, 36, 0.16, 0.5 * g + 0.15, { pos });
  burst(t + 0.01, { f: 3800, q: 1.5, d: 0.06, g: 0.12, pos });
}
// Death_D (the shared fall animation) drops the hips to the floor 1.2 s into the clip at rate 1: every body-fall thud lands then
export const DEATH_HIT = 1.2;
export function bodyFall(pos, g = 1, delay = 0) {
  if (!ctx || paused) return;
  delay += pos ? dist(pos) / 343 : 0;
  if (hasReal('bodyfall')) { rs('bodyfall', { pos, gain: 0.8 * g, delay }); return; }
  const t = ctx.currentTime + 0.01 + delay;
  thump(t, 120, 40, 0.2, 0.6 * g, { pos }); burst(t, { f: 700, q: 0.8, d: 0.15, g: 0.35 * g, pos }); burst(t + 0.06, { f: 4000, q: 2, d: 0.05, g: 0.12 * g, pos });
}
let breathPh = 0, lastT = 0;
let fear = 0;
export function setFear(f) { fear = f; }
export function body({ speed, exertion, hurt = 0 }) {
  if (!ctx || !breathG || paused) return;
  const nw = ctx.currentTime, dt = Math.min(0.1, nw - lastT || 0.016); lastT = nw;
  breathPh = (breathPh + dt * (0.24 + exertion * 0.6 + hurt * 0.3)) % 1;
  let env, f;
  if (breathPh < 0.42) { env = Math.sin(breathPh / 0.42 * Math.PI) * 0.6; f = 1400; } else if (breathPh < 0.9) { env = Math.sin((breathPh - 0.42) / 0.48 * Math.PI); f = 750; } else { env = 0; f = 900; }
  breathG.gain.setTargetAtTime(env * (0.01 + exertion * exertion * 0.22 + hurt * 0.12), nw, 0.05);
  breathF.frequency.setTargetAtTime(f + exertion * 300, nw, 0.08);
  // heartbeat when badly hurt or terrified
  const hb = Math.max(hurt, fear);
  if (hb > 0.35) { heartT -= dt; if (heartT <= 0) { heartT = 0.85 - hb * 0.35; thump(nw + 0.01, 60, 38, 0.14, 0.32 * hb); thump(nw + 0.2, 55, 36, 0.12, 0.22 * hb); } }
  void speed;
}

// ---------------------------------------------------------------- guns
// profiles: crack (high transient), boom (body), low (sub thump), mech (action), tail (how much echo)
const GUN = {
  pistol: { crack: 0.8, crackF: 2600, boom: 0.6, boomF: 900, low: 0.4, lowF: 140, d: 0.09, mech: 0.25, tail: 0.6 },
  rifle: { crack: 1.0, crackF: 3200, boom: 0.75, boomF: 700, low: 0.55, lowF: 120, d: 0.11, mech: 0.3, tail: 0.85 },
  ak: { crack: 0.9, crackF: 2700, boom: 0.95, boomF: 560, low: 0.7, lowF: 105, d: 0.13, mech: 0.32, tail: 0.95 },
  lmg: { crack: 0.95, crackF: 3000, boom: 0.85, boomF: 620, low: 0.6, lowF: 110, d: 0.11, mech: 0.22, tail: 0.85 },
  shotgun: { crack: 0.7, crackF: 2000, boom: 1.2, boomF: 420, low: 1.0, lowF: 85, d: 0.2, mech: 0.1, tail: 1.1 },
  sniper: { crack: 1.25, crackF: 3600, boom: 1.1, boomF: 480, low: 0.9, lowF: 90, d: 0.18, mech: 0.1, tail: 1.4 },
};
let lastGun = 0;
export function gun(kind, pos = null) {
  if (!ctx || paused) return;
  const nw = ctx.currentTime;
  if (kind === 'rpg') return rocketLaunch(pos);
  const P = GUN[kind] || GUN.rifle, d = dist(pos);
  if (pos && d > 260) return;
  if (d < 120) hush(10);   // [realism] the crickets and birds stop after a shot
  const rec = { pistol: 'gun_pistol', shotgun: 'gun_shotgun', sniper: 'gun_rifle' }[kind];
  if (rec && hasReal(rec)) {
    const far = pos ? Math.min(1, d / 120) : 0, delay = pos ? d / 343 : 0;
    // the recording itself also goes out into the open air and comes back off the houses and hills (none of that indoors)
    if (!pos) rs(rec, { gain: 1.0, vary: 0.04, room: indoor * 0.9, verb: 0.3 * P.tail * (1 - indoor * 0.7) });
    else rs(d > 120 || !hasReal(rec) ? 'gun_far' : rec, { pos, gain: 1.2, delay, lp: 20000 * Math.pow(0.12, far), ref: 6, roll: 0.9, verb: 0.2 + far * 0.5 });
    // the punch you feel in your chest, and the street answering back
    const t = nw + 0.004 + delay;
    thump(t, P.lowF * 1.6, P.lowF * 0.4, P.d * 1.6, (pos ? 0.3 : 0.55) * P.low, { pos, ref: 6 });
    const ns = ctx.createBufferSource(); ns.buffer = noiseBuf; const nf = ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 2500; const ne = ctx.createGain(); ne.gain.setValueAtTime(0, t); ne.gain.linearRampToValueAtTime(0.5 * P.tail, t + 0.002); ne.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    ns.connect(nf).connect(ne).connect(at(pos, farVerb, 6, 0.6)); ns.start(t, Math.random() * 3); ns.stop(t + 0.1);
    lastGun = nw; return;
  }
  // far shots arrive late and lose their top end
  const delay = pos ? d / 343 : 0, t = nw + 0.004 + delay;
  const far = pos ? Math.min(1, d / 120) : 0, mine = !pos;
  const v = (0.9 + Math.random() * 0.2) * (mine ? 1 : 1.25);
  const lpF = 20000 * Math.pow(0.08, far);
  const bus = ctx.createBiquadFilter(); bus.type = 'lowpass'; bus.frequency.value = lpF;
  const g = ctx.createGain(); g.gain.value = 1;
  bus.connect(g);
  if (pos) { const p = at(pos, sfxBus, 6, 0.9); g.connect(p); const fs = ctx.createGain(); fs.gain.value = 0.25 + far * 0.6; g.connect(fs).connect(at(pos, farVerb, 6, 0.6)); }
  else { g.connect(sfxBus); const fs = ctx.createGain(); fs.gain.value = 0.35 * P.tail * (1 - indoor * 0.6); g.connect(fs).connect(farVerb); if (indoor > 0.3) { const rs = ctx.createGain(); rs.gain.value = 0.9 * indoor; g.connect(rs).connect(roomVerb); } }
  const crack = ctx.createBufferSource(); crack.buffer = noiseBuf;
  const cf = ctx.createBiquadFilter(); cf.type = 'highpass'; cf.frequency.value = P.crackF; const ce = ctx.createGain();
  ce.gain.setValueAtTime(0, t); ce.gain.linearRampToValueAtTime(P.crack * v * 1.1, t + 0.0008); ce.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
  crack.connect(cf).connect(ce).connect(bus); crack.start(t, Math.random() * 3); crack.stop(t + 0.08);
  const boom = ctx.createBufferSource(); boom.buffer = noiseBuf;
  const bf = ctx.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.setValueAtTime(P.boomF * 1.6, t); bf.frequency.exponentialRampToValueAtTime(P.boomF * 0.5, t + P.d); bf.Q.value = 0.7;
  const be = ctx.createGain(); be.gain.setValueAtTime(0, t); be.gain.linearRampToValueAtTime(P.boom * v * 1.2, t + 0.002); be.gain.exponentialRampToValueAtTime(0.0001, t + P.d * 1.6);
  boom.connect(bf).connect(be).connect(bus); boom.start(t, Math.random() * 3); boom.stop(t + P.d * 2);
  const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(P.lowF * 1.8, t); o.frequency.exponentialRampToValueAtTime(P.lowF * 0.4, t + P.d * 1.4);
  const oe = ctx.createGain(); oe.gain.setValueAtTime(0, t); oe.gain.linearRampToValueAtTime(P.low * v * (mine ? 1.1 : 0.7), t + 0.002); oe.gain.exponentialRampToValueAtTime(0.0001, t + P.d * 1.8);
  o.connect(oe).connect(bus); o.start(t); o.stop(t + P.d * 2);
  // saturate own shots a little: they should feel punchy
  if (mine && P.mech) { click(t + 0.02, 3800, P.mech * 0.5, null, 0.15); click(t + 0.045, 2600, P.mech * 0.35, null, 0.1); }
  lastGun = nw;
}
function rocketLaunch(pos) {
  const t = ctx.currentTime + 0.005 + (pos ? dist(pos) / 343 : 0);
  burst(t, { f: 300, type: 'lowpass', d: 0.4, g: 1.2, pos, brown: true, ref: 6 });
  burst(t, { f: 900, q: 0.6, d: 0.9, g: 0.9, pos, sweep: 3, ref: 6 });
  burst(t + 0.05, { f: 2500, q: 0.4, d: 1.4, g: 0.45, pos, sweep: 0.4, ref: 6 });
  thump(t, 90, 30, 0.4, 0.9, { pos, ref: 6 });
}
export function rocketFly(pos) { if (!ctx || paused) return; burst(ctx.currentTime, { f: 1500, q: 0.7, d: 0.25, g: 0.25, pos, sweep: 0.8, ref: 4 }); }
// a bullet cracking past your head, from the side it passed
export function whiz(pos, close = 1) {
  if (!ctx || paused) return;
  const t = ctx.currentTime + 0.002;
  burst(t, { f: 5200, type: 'highpass', d: 0.018, g: 0.9 * close, pos, ref: 1.5 });
  burst(t + 0.003, { f: 2400 + Math.random() * 1200, q: 3, d: 0.12, g: 0.3 * close, pos, sweep: 0.55, ref: 1.5 });
}
// ---- impacts ----
export function impact(pos, mat = 'dirt', loud = 1, own = false) {   // own: your own (hitscan) shot — heard when the blood shows, not d/343 later
  if (!ctx || paused) return;
  const d = dist(pos); if (d > (own ? 140 : 80)) return;
  const sd = own ? Math.min(0.03, d / 343) : d / 343;
  const t = ctx.currentTime + 0.003 + sd;
  if (mat === 'metal' || mat === 'barrel') { tone(t, 1800 + Math.random() * 1600, 0.25, 0.22 * loud, 'triangle', sfxBus, pos); burst(t, { f: 5000, q: 2, d: 0.03, g: 0.35 * loud, pos }); }
  else if (mat === 'wood' || mat === 'paper') { burst(t, { f: 900, q: 1.5, d: 0.05, g: 0.4 * loud, pos }); thump(t, 300, 120, 0.05, 0.2 * loud, { pos }); }
  else if (mat === 'concrete' || mat === 'brick' || mat === 'rock') { burst(t, { f: 2200, q: 1.2, d: 0.05, g: 0.45 * loud, pos }); burst(t + 0.01, { f: 6000, q: 1, d: 0.08, g: 0.12 * loud, pos }); }
  else if (mat === 'flesh' || mat === 'fleshHead') {   // a bullet going into a body: the real wet hit, and a skull cracking on a headshot
    if (hasReal('squish')) {
      const delay = sd;
      rs('squish', { pos, gain: 0.7 * loud, rate: 1.25, vary: 0.08, delay });
      if (hasReal('hit_punch')) rs('hit_punch', { pos, gain: 0.3 * loud, rate: 1.3, delay });
      if (mat === 'fleshHead') { rs('hit_bone', { pos, gain: 0.6 * loud, delay }); if (Math.random() < 0.5) rs('splat', { pos, gain: 0.45 * loud, delay: delay + 0.02 }); }
      return;
    }
    thump(t, 160, 60, 0.08, 0.5 * loud, { pos }); burst(t, { f: 500, q: 1, d: 0.06, g: 0.4 * loud, pos });
    if (mat === 'fleshHead') burst(t + 0.005, { f: 1800, q: 3, d: 0.03, g: 0.5 * loud, pos });
  }
  else if (mat === 'cloth' || mat === 'sand') { burst(t, { f: 600, q: 0.7, d: 0.08, g: 0.4 * loud, pos }); }
  else if (mat === 'leaves') { leafRustle(t, pos, 0.5 * loud, 0.25); }
  else if (mat === 'plastic') { plasticKnock(t, pos, 0.6 * loud); }
  else if (mat === 'clay') { thump(t, 260, 140, 0.05, 0.3 * loud, { pos }); burst(t, { f: 2400, q: 2, d: 0.04, g: 0.3 * loud, pos }); }
  else { burst(t, { f: 700, q: 0.6, d: 0.08, g: 0.45 * loud, pos }); burst(t, { f: 3000, q: 0.8, d: 0.04, g: 0.15 * loud, pos }); }
}
export function plateDing(pos, big = 1) { if (!ctx || paused) return; const t = ctx.currentTime + 0.003 + dist(pos) / 343; for (const [f, g, dd] of [[1180, 0.4, 1.4], [2950, 0.18, 0.9], [4410, 0.08, 0.5]]) tone(t, f / big, dd, g, 'sine', sfxBus, pos, 0.001); }
export function paperHit(pos) { if (!ctx || paused) return; const t = ctx.currentTime + 0.003 + dist(pos) / 343; burst(t, { f: 1800, q: 0.8, d: 0.03, g: 0.25, pos }); thump(t, 220, 90, 0.05, 0.12, { pos }); }
export function popClack(pos, up = true) { if (!ctx || paused) return; const t = ctx.currentTime + 0.005; thump(t, up ? 260 : 180, 80, 0.12, 0.3, { pos }); burst(t, { f: 1400, q: 1.5, d: 0.06, g: 0.3, pos }); }
export function bell() { if (!ctx) return; const t = ctx.currentTime + 0.01; for (const [f, g] of [[880, 0.35], [2215, 0.15], [3520, 0.06]]) tone(t, f, 2.2, g, 'sine', sfxBus, null, 0.001); }
export function hitmarker(kill = false, head = false) {
  if (!ctx) return;
  const t = ctx.currentTime + 0.01;
  tone(t, head ? 2600 : 1900, 0.06, 0.13, 'triangle');
  if (kill) { tone(t + 0.05, 1300, 0.12, 0.12, 'triangle'); tone(t + 0.1, 1700, 0.18, 0.1, 'triangle'); }
}
export function hurt(g = 1, dir = 0) {
  if (!ctx || paused) return;
  const t = ctx.currentTime + 0.005;
  thump(t, 140, 50, 0.18, 0.6 * g, { pan: dir * 0.6 }); burst(t, { f: 400, q: 0.7, d: 0.12, g: 0.4 * g, pan: dir * 0.6 });
  dull(0.12 + g * 0.2, 2500);
}
export function shellLand(pos, big = false) { if (!ctx || paused || dist(pos) > 14) return; const t = ctx.currentTime + 0.002; tone(t, (big ? 2400 : 5200) + Math.random() * 900, big ? 0.08 : 0.12, big ? 0.05 : 0.06, 'triangle', sfxBus, pos, 0.001); }

// ---- the weapon handling ----
export function mech(kind, pos = null) {
  if (!ctx || paused) return;
  if (pos && dist(pos) > 25) return;
  const t = ctx.currentTime + 0.005;
  if (kind === 'light') { click(t, 3000, 0.35, pos); burst(t + 0.01, { f: 2000, q: 2, d: 0.05, g: 0.25, pos }); burst(t + 0.12, { f: 900, q: 0.6, d: 0.35, g: 0.12, pos, sweep: 1.4 }); return; }   // a lighter strike, then the rag catches
  switch (kind) {
    case 'magOut': click(t, 2200, 0.35, pos); burst(t + 0.03, { f: 900, q: 1, d: 0.06, g: 0.25, pos }); break;
    case 'magIn': click(t, 1800, 0.45, pos); thump(t, 400, 150, 0.04, 0.3, { pos }); click(t + 0.04, 3200, 0.3, pos); break;
    case 'charge': click(t, 2600, 0.4, pos); burst(t + 0.02, { f: 1600, q: 2, d: 0.05, g: 0.3, pos }); click(t + 0.11, 2000, 0.5, pos); thump(t + 0.11, 500, 180, 0.04, 0.25, { pos }); break;
    case 'bolt': click(t, 2400, 0.4, pos); burst(t + 0.05, { f: 1300, q: 2, d: 0.08, g: 0.35, pos }); click(t + 0.2, 1900, 0.45, pos); click(t + 0.32, 2600, 0.4, pos); break;
    case 'pump': burst(t, { f: 900, q: 1.5, d: 0.08, g: 0.45, pos }); click(t + 0.08, 1500, 0.5, pos); burst(t + 0.16, { f: 1100, q: 1.5, d: 0.07, g: 0.45, pos }); click(t + 0.23, 2100, 0.55, pos); break;
    case 'shell': click(t, 2000, 0.35, pos); burst(t + 0.02, { f: 700, q: 1, d: 0.05, g: 0.2, pos }); break;
    case 'dry': click(t, 3000, 0.4, pos); break;
    case 'switch': burst(t, { f: 1200, q: 0.8, d: 0.12, g: 0.18, pos }); click(t + 0.12, 2600, 0.25, pos); break;
    case 'pin': tone(t, 4200, 0.25, 0.08, 'sine', sfxBus, pos); click(t, 5000, 0.2, pos); break;
    case 'spoon': tone(t, 3100, 0.18, 0.08, 'triangle', sfxBus, pos); break;
    case 'bounce': click(t, 1600, 0.3, pos); thump(t, 300, 120, 0.05, 0.2, { pos }); break;
    case 'rocketIn': burst(t, { f: 600, q: 1, d: 0.15, g: 0.3, pos }); click(t + 0.15, 1400, 0.45, pos); break;
    case 'pickup': burst(t, { f: 1000, q: 0.8, d: 0.1, g: 0.25, pos }); click(t + 0.08, 2400, 0.3, pos); click(t + 0.2, 1800, 0.3, pos); break;
  }
}
// ---------------------------------------------------------------- explosions
export function explosion(pos, power = 1) {
  if (!ctx || paused) return;
  const d = dist(pos), delay = d / 343, t = ctx.currentTime + 0.005 + delay;
  const far = Math.min(1, d / 160);
  if (d < 250) hush(18);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 18000 * Math.pow(0.06, far);
  const g = ctx.createGain(); g.gain.value = 1.4 * power;
  const p = at(pos, sfxBus, 10, 0.8); lp.connect(g).connect(p);
  const fs = ctx.createGain(); fs.gain.value = 0.6 + far * 0.6; g.connect(fs).connect(at(pos, farVerb, 10, 0.5));
  // the crack of the blast, the roar, the sub drop
  const n1 = ctx.createBufferSource(); n1.buffer = noiseBuf; const e1 = ctx.createGain(); e1.gain.setValueAtTime(0, t); e1.gain.linearRampToValueAtTime(1, t + 0.002); e1.gain.exponentialRampToValueAtTime(0.0001, t + 0.12); n1.connect(e1).connect(lp); n1.start(t, Math.random() * 2); n1.stop(t + 0.2);
  const n2 = ctx.createBufferSource(); n2.buffer = brownBuf; const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.setValueAtTime(1600, t); f2.frequency.exponentialRampToValueAtTime(140, t + 2.2);
  const e2 = ctx.createGain(); e2.gain.setValueAtTime(0, t); e2.gain.linearRampToValueAtTime(1.8, t + 0.01); e2.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
  n2.connect(f2).connect(e2).connect(lp); n2.start(t, Math.random() * 1); n2.stop(t + 2.8);
  const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(80, t); o.frequency.exponentialRampToValueAtTime(22, t + 1.4);
  const oe = ctx.createGain(); oe.gain.setValueAtTime(0, t); oe.gain.linearRampToValueAtTime(1.3, t + 0.006); oe.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
  o.connect(oe).connect(lp); o.start(t); o.stop(t + 1.7);
  // debris raining back down
  for (let i = 0; i < 10 * power; i++) { const tt = t + 0.4 + Math.random() * 1.4; burst(tt, { f: 600 + Math.random() * 2500, q: 1.2, d: 0.03 + Math.random() * 0.05, g: 0.12 * (1 - far), pos: { x: pos.x + (Math.random() - 0.5) * 8, y: 0.2, z: pos.z + (Math.random() - 0.5) * 8 } }); }
  // close: your ears ring and the world goes dull for a moment
  if (d < 14 * power) { const k = 1 - d / (14 * power); dull(1.2 + k * 2.5, 600 + (1 - k) * 2000, t); tinnitus(k, t); }
}
function dull(dur, f, t = ctx.currentTime) {
  muffle.frequency.cancelScheduledValues(t); muffle.frequency.setValueAtTime(Math.min(muffle.frequency.value, f), t);
  muffle.frequency.setTargetAtTime(20000, t + dur * 0.4, dur * 0.35);
}
function tinnitus(k, t) { const o = ctx.createOscillator(); o.frequency.value = 3600 + Math.random() * 600; const e = ctx.createGain(); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(0.05 * k, t + 0.05); e.gain.exponentialRampToValueAtTime(0.0001, t + 2.5 + k * 2); o.connect(e).connect(master); o.start(t); o.stop(t + 5); }
export function barrelBoom(pos) { explosion(pos, 1.1); }
export function fire(pos) { if (!ctx || paused) return; burst(ctx.currentTime, { f: 400, q: 0.5, d: 0.6, g: 0.06, pos, brown: true }); }


// fetch with a few retries (a server waking up, a dropped connection) so sounds never silently go missing
const fetchRetry = (url, n = 4) => fetch(url).then(r => { if (!r.ok) throw new Error(r.status); return r; }).catch(e => n > 0 ? new Promise(res => setTimeout(res, 800)).then(() => fetchRetry(url, n - 1)) : Promise.reject(e));
// ---------------------------------------------------------------- recorded sounds (sounds/r, CC0): play one at random from a category
const R = {}; let realReady = false;
// a 30 Hz loudness envelope (0..1) of a voice clip: mouths follow the actual sound, pauses and all
function envOf(buf) {
  const d = buf.getChannelData(0), hop = Math.max(1, Math.floor(buf.sampleRate / 30)), n = Math.ceil(d.length / hop), e = new Float32Array(n);
  let mx = 1e-6;
  for (let k = 0; k < n; k++) { let a = 0; const i0 = k * hop, i1 = Math.min(d.length, i0 + hop); for (let i = i0; i < i1; i += 4) a += d[i] * d[i]; e[k] = Math.sqrt(a / Math.max(1, (i1 - i0) / 4)); if (e[k] > mx) mx = e[k]; }
  for (let k = 0; k < n; k++) e[k] = Math.min(1, e[k] / mx);
  return e;
}
export let lastEnv = null, lastDelay = 0;   // the envelope (30 Hz) and start delay of the last voice()/zombie() clip that played
function loadReal() {
  fetchRetry('sounds/r/index.json').then(r => r.json()).then(M => {
    const all = Object.entries(M).flatMap(([cat, names]) => names.map(n => [cat, n]));
    // load in order of need: the dead and the guns, then hits/bodies/doors/fire, then voices; the long beds only used by
    // the TV bulletin, the stadium and the market crowd (v_news/v_murmur/v_crowd/v_radio, the biggest files) come last,
    // so the fight sounds are decoded first. (Every map plays the TV/market scenes, so nothing is skipped per map.)
    const tier = c => /^(z_|gun_)/.test(c) ? 0 : /^(v_news|v_murmur|v_crowd|v_radio)$/.test(c) ? 3 : /^v_/.test(c) ? 2 : 1;
    all.sort((a, b) => tier(a[0]) - tier(b[0]));
    let i = 0;
    const next = () => { if (i >= all.length) { realReady = true; return; } const [cat, n] = all[i++]; fetchRetry(`sounds/r/${n}.mp3`).then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b)).then(buf => { if (/^(v_|z_)/.test(cat)) buf.env = envOf(buf); (R[cat] ||= []).push(buf); }).catch(() => { }).finally(next); };
    for (let k = 0; k < 6; k++) next();
  }).catch(e => console.log('no recorded sounds', e));
}
const lastPick = {}; let rsLastBuf = null, rsLastRate = 1;
export const hasReal = cat => !!(R[cat] && R[cat].length);
// play a recording: pos (positional) or pan; rate varies a little each time so repeats don't sound copied
function rs(cat, { pos = null, gain = 1, rate = 1, vary = 0.08, delay = 0, pan = 0, dest = sfxBus, lp = 0, ref = 3, roll = 1, room = 0, offset = 0, dur = 0, verb = 0 } = {}) {
  if (!ctx || !R[cat] || !R[cat].length) return 0;
  const L2 = R[cat]; let i; do { i = Math.floor(Math.random() * L2.length); } while (L2.length > 1 && i === lastPick[cat]);
  lastPick[cat] = i;
  const s = ctx.createBufferSource(); s.buffer = L2[i]; s.playbackRate.value = rate * (1 + (Math.random() - 0.5) * 2 * vary);
  const g = ctx.createGain(); g.gain.value = gain;
  let node = s;
  if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; node.connect(f); node = f; }
  node.connect(g);
  g.connect(out(pos, dest, pan, ref, roll));
  if (room > 0 && roomVerb) { const rg = ctx.createGain(); rg.gain.value = room; g.connect(rg).connect(roomVerb); }
  if (verb > 0 && farVerb) { const vg = ctx.createGain(); vg.gain.value = verb; g.connect(vg).connect(at(pos, farVerb, ref, Math.min(roll, 0.6))); }   // outdoor echo off the houses/hills
  const t = ctx.currentTime + 0.005 + delay;
  // a slice from the middle of a clip (offset) or cut short (dur): short fades so it never starts or stops with a click
  const off = Math.min(offset, Math.max(0, L2[i].duration - 0.05));
  if (off > 0) { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.02); }
  s.start(t, off);
  if (dur) { const fo = Math.min(0.08, dur * 0.3); g.gain.setValueAtTime(gain, t + Math.max(0.02, dur - fo)); g.gain.linearRampToValueAtTime(0, t + dur); s.stop(t + dur + 0.01); }
  rsLastBuf = L2[i]; rsLastRate = s.playbackRate.value;
  return L2[i].duration / s.playbackRate.value;
}

// ---------------------------------------------------------------- people talking: real recorded human voices (sounds/r/v_*, CC0 / public domain)
// No text-to-speech anywhere: every word, scream, sob and laugh is a recording of a real person (see sounds/r/CREDITS.txt).
// voice(kind, pos, { female, pitch }) plays one at random from v_<kind>_f / v_<kind>_m (or the shared v_<kind>), where that
// person is standing: distance falloff + the delay of sound, muffled through a wall, each person's own pitch. Returns the
// clip's real length in seconds (people.js moves the mouth for exactly that long), or 0 if nothing played.
const VFALL = {
  gasp_m: ['v_gasp_m', ['v_pant', { dur: 1.1, offset: 0.4 }], 'v_hurt_m'], cry_m: ['v_cry_m', 'v_sigh', ['v_pant', { dur: 2.2 }]], thanks_m: ['v_thanks_m', ['v_sigh', { dur: 1.0 }]],
  hello_m: ['v_hello_m', 'v_hey_m'], bye_m: ['v_bye_m'], what_m: ['v_what_m', 'v_gasp_m', ['v_pant', { dur: 0.6, offset: 0.3 }]], come_m: ['v_come_m'], come_f: ['v_come_f', 'v_run_f'],
  die_f: ['v_die_f', 'v_scream_f'], cough_f: ['v_cough_f', ['v_cough_m', { rate: 1.08 }]], sigh_f: ['v_sigh_f', 'v_sigh'], sigh_m: ['v_sigh_m', 'v_sigh'],
  yawn_f: ['v_yawn'], yawn_m: ['v_yawn'], pant_f: ['v_pant'], pant_m: ['v_pant'], omg_m: ['v_omg_m', ['v_pant', { dur: 0.9, offset: 0.4 }]], laugh_m: ['v_laugh_m'], laugh_f: ['v_laugh_f'],
  look_m: ['v_look_m', 'v_hey_m'], look_f: ['v_look_f', 'v_hey_f'], help_m: ['v_help_m', 'v_hey_m'], help_f: ['v_help_f', 'v_scream_f'],
};
const vOn = [], vCool = {};   // when each voice playing now ends: a crowd of people screaming at once turns to mush, so only a few at a time
let vBus = null, vLog = null;
function envSlice(env, off, rate) {   // the envelope as heard: skip the offset, resample for the playback rate (still 30 Hz)
  if (!env) return null; if (!off && Math.abs(rate - 1) < 0.01) return env;
  const n = Math.max(1, Math.floor((env.length - off * 30) / rate)), e = new Float32Array(n);
  for (let k = 0; k < n; k++) e[k] = env[Math.min(env.length - 1, Math.floor(off * 30 + k * rate))];
  return e;
}
export function voiceLog(on = true) { vLog = on ? [] : null; return vLog; }   // tests: every voice() call that played
function vcat(kind, female) {
  const g = female ? 'f' : 'm', L2 = VFALL[kind + '_' + g] || [`v_${kind}_${g}`, `v_${kind}`];
  for (const c of L2) { const [cat, o] = Array.isArray(c) ? c : [c, null]; if (hasReal(cat)) return [cat, o || {}]; }
  return null;
}
export const canVoice = (kind, female = false) => !!(ctx && vcat(kind, female));
export function voice(kind, pos, { female = false, pitch = 1, gain = 1, muffled = false, max = 60, pri = 0, dur = 0 } = {}) {
  if (!ctx || paused) return 0;
  const d = pos ? dist(pos) : 0; if (d > max) return 0;
  const hit = vcat(kind, female); if (!hit) return 0;
  const nw = ctx.currentTime;
  for (let i = vOn.length - 1; i >= 0; i--) if (vOn[i] < nw) vOn.splice(i, 1);
  if (vOn.length >= (pri > 1 ? 7 : pri > 0 ? 5 : 3)) return 0;   // screams and dying cut through; chatter waits its turn
  const [cat, o] = hit, L2 = R[cat];
  if (L2.length === 1 && pri < 1) { if (nw < (vCool[cat] || 0)) return 0; vCool[cat] = nw + 8; }   // the one clip we have: not twice in a row from two mouths
  let i; do { i = Math.floor(Math.random() * L2.length); } while (L2.length > 1 && i === lastPick[cat]);
  lastPick[cat] = i;
  if (!vBus) { vBus = ctx.createGain(); vBus.gain.value = 1.15; vBus.connect(sfxBus); }
  const buf = L2[i], s = ctx.createBufferSource(); s.buffer = buf;
  const rate = Math.min(1.15, Math.max(0.85, (o.rate || 1) * pitch * (1 + (Math.random() - 0.5) * 0.03))); s.playbackRate.value = rate;   // stacked pitch never chipmunks
  // through a wall (them inside, you out — or the other way round) only the low end gets through; far off, the air eats the top
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = muffled ? 900 : d > 25 ? 5200 - Math.min(3200, (d - 25) * 60) : 16000;
  const g = ctx.createGain(); g.gain.value = gain * (muffled ? 0.55 : 1);
  s.connect(lp).connect(g).connect(out(pos, vBus, 0, 3.2, 1));
  if (indoor > 0.3 && roomVerb && d < 12) { const rg = ctx.createGain(); rg.gain.value = 0.3; g.connect(rg).connect(roomVerb); }
  const t = nw + 0.01 + d / 343, off = o.offset ? Math.min(o.offset, buf.duration * 0.5) : 0;
  let len = (buf.duration - off) / rate; const cap = dur || o.dur || 0;
  if (cap && cap < len) { len = cap; g.gain.setValueAtTime(g.gain.value, t + len - 0.12); g.gain.linearRampToValueAtTime(0.0001, t + len); }
  s.start(t, off); s.stop(t + len + 0.02);
  vOn.push(t + len);
  lastDelay = t - nw; lastEnv = envSlice(buf.env, off, rate);
  if (vLog) vLog.push({ kind, cat, clip: i, female, d: Math.round(d), len: +len.toFixed(2), delay: +lastDelay.toFixed(3), t: +nw.toFixed(2) });
  return len + d / 343;
}
// a whole crowd: murmuring in the calm, shouting and screaming when it all goes wrong
export function crowd(pos, panic = false, gain = 1) {
  if (!ctx || paused) return 0; const cat = panic ? 'v_crowd' : 'v_murmur'; if (!hasReal(cat) || (pos && dist(pos) > 70)) return 0;
  return rs(cat, { pos, gain: (panic ? 0.75 : 0.5) * gain, vary: 0.04, delay: pos ? dist(pos) / 343 : 0, ref: 6, roll: 0.9, lp: pos && dist(pos) > 30 ? 3000 : 0 });
}
// the TV: a recorded announcer (public-domain emergency broadcast) through a small speaker, and what the live camera hears
let tvBus = null, tvUntil = 0, tvSeq = 0; const tvNodes = [];
function tvOut() {
  if (tvBus) return tvBus;
  tvBus = ctx.createGain(); tvBus.gain.value = 1.0;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 220;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200;
  const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 2000; pk.gain.value = 3; pk.Q.value = 0.8;
  tvBus.connect(hp).connect(pk).connect(lp).connect(sfxBus);
  if (roomVerb) { const rv = ctx.createGain(); rv.gain.value = 0.25; lp.connect(rv).connect(roomVerb); }
  return tvBus;
}
function tvClip(cat, idx, t, gain = 1, rate = 1) {
  const L2 = R[cat]; if (!L2 || !L2.length) return 0;
  const buf = L2[idx == null ? Math.floor(Math.random() * L2.length) : idx % L2.length];
  const s = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
  const g = ctx.createGain(); g.gain.value = gain; s.connect(g).connect(tvOut()); s.start(t); tvNodes.push(s);
  if (vLog) vLog.push({ kind: 'tv', cat, len: +(buf.duration / rate).toFixed(2), t: +ctx.currentTime.toFixed(2) });
  return buf.duration / rate;
}
// the anchor's voice for one stretch of the broadcast; true if a recording is (still) talking
function tvAnchor(part = null) {
  if (!hasReal('v_news')) return false;
  const nw = ctx.currentTime; if (nw < tvUntil) return true;
  const first = part ? part === 'bulletin' : tvSeq === 0; tvSeq++;
  const L2 = R.v_news, pickI = first ? [0, 6, 2] : [1];   // first the bulletin, then (signal lost) "are you prepared ... in your home?"
  let t = nw + 0.15;
  for (const k of pickI) { const n = k < L2.length ? k : (k % L2.length); t += tvClip('v_news', n, t, 1.0) + 0.3; }
  tvUntil = t; return true;
}
export function tvReset() { tvSeq = 0; tvStop(); }   // a new game: the noon bulletin starts from the top again
export function tvStop() { for (const s of tvNodes.splice(0)) { try { s.stop(); } catch (e) { /* already done */ } } tvUntil = 0; }
// on the live feed from Main Street: 'crowd' murmur turning, 'omg' the reporter, 'scream' somebody, 'panic' everybody
export function tvScene(kind) {
  if (!ctx) return 0; const t = ctx.currentTime + 0.05;
  if (kind === 'crowd') return tvClip('v_murmur', null, t, 0.7);
  if (kind === 'omg') return tvClip(hasReal('v_omg_f') ? 'v_omg_f' : 'v_no_f', 0, t, 1.0);
  if (kind === 'scream') { tvClip('v_scream_m', null, t, 0.8); return tvClip('v_scream_f', null, t + 0.5, 0.7); }
  if (kind === 'panic') { tvClip('v_crowd', null, t, 0.9); tvClip('v_run_m', null, t + 0.6, 0.8); return tvClip('v_scream_f', null, t + 1.4, 0.6); }
  return 0;
}
// a radio on the vest / in the kitchen: real air-to-ground chatter in bursts through the static
function radioBursts(dur, pos) {
  if (!hasReal('v_radio')) return false;
  let t = ctx.currentTime + 1.4; const end = ctx.currentTime + dur - 1.5;
  while (t < end) {
    const L2 = R.v_radio, buf = L2[Math.floor(Math.random() * L2.length)];
    if (t + buf.duration > end) break;
    const s = ctx.createBufferSource(); s.buffer = buf;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 450;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3000;
    const g = ctx.createGain(); g.gain.value = 0.85;
    s.connect(hp).connect(lp).connect(g).connect(out(pos, sfxBus, 0, 2)); s.start(t);
    if (vLog) vLog.push({ kind: 'radio', cat: 'v_radio', len: +buf.duration.toFixed(2) });
    t += buf.duration + 0.6 + Math.random() * 1.6;
  }
  return true;
}

// a small room: dense, short reflections
function makeRoom(seconds) {
  const sr = ctx.sampleRate, len = Math.floor(sr * seconds), b = ctx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) { const t = i / sr; d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 7) * 0.5; } let lp = 0; for (let i = 0; i < len; i++) { lp += (d[i] - lp) * 0.45; d[i] = lp; } }
  return b;
}
export function setIndoor(k) { indoor = k; }

// ---------------------------------------------------------------- the dead: voices built from a rasping throat and vowel formants
const VOW = { aa: [[730, 1], [1090, 0.5], [2440, 0.25]], oo: [[320, 1], [800, 0.45], [2240, 0.12]], uh: [[540, 1], [1180, 0.45], [2390, 0.18]], eh: [[600, 1], [1800, 0.4], [2600, 0.2]] };
const voices = [];   // throttle: no more than a handful of zombie voices at once
function zthroat(t, pos, { f0, f1, dur, vowel = 'uh', vowel2 = null, gain = 0.5, rasp = 0.6, fry = 34, jitter = 0.08, scream = 0 }) {
  const end = t + dur;
  const src = ctx.createOscillator(); src.type = 'sawtooth';
  src.frequency.setValueAtTime(f0, t); src.frequency.linearRampToValueAtTime(f0 * 1.06, t + dur * 0.25); src.frequency.exponentialRampToValueAtTime(Math.max(30, f1), end);
  // wobble: an unsteady, broken voice
  const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 4 + Math.random() * 5; const lg = ctx.createGain(); lg.gain.value = f0 * jitter; lfo.connect(lg).connect(src.frequency);
  // vocal fry: the throat flapping
  const am = ctx.createGain(); am.gain.value = 0.6;
  const fr = ctx.createOscillator(); fr.type = 'square'; fr.frequency.setValueAtTime(fry, t); fr.frequency.linearRampToValueAtTime(fry * 0.7, end); const fg = ctx.createGain(); fg.gain.value = 0.4 * rasp; fr.connect(fg).connect(am.gain);
  const sh = ctx.createWaveShaper(); const cv = new Float32Array(512); for (let i = 0; i < 512; i++) { const x = i / 256 - 1; cv[i] = Math.tanh(x * (3 + scream * 4)); } sh.curve = cv;
  src.connect(am).connect(sh);
  // breath noise through the same mouth
  const ns = ctx.createBufferSource(); ns.buffer = noiseBuf; const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 1400 + scream * 1500; nf.Q.value = 0.6; const ng = ctx.createGain(); ng.gain.value = 0.35 * rasp + scream * 0.5;
  ns.connect(nf).connect(ng);
  const env = ctx.createGain(); env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(gain, t + Math.min(0.15, dur * 0.25)); env.gain.setValueAtTime(gain * 0.9, t + dur * 0.6); env.gain.exponentialRampToValueAtTime(0.0001, end);
  const mix = ctx.createGain(); mix.gain.value = 1;
  const V0 = VOW[vowel], V1 = vowel2 ? VOW[vowel2] : V0;
  for (let i = 0; i < 3; i++) {
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 5 + i * 2;
    bp.frequency.setValueAtTime(V0[i][0] * (1 + scream * 0.3), t); bp.frequency.linearRampToValueAtTime(V1[i][0] * (1 + scream * 0.3), end);
    const g = ctx.createGain(); g.gain.value = V0[i][1] * 2.2;
    sh.connect(bp).connect(g).connect(mix); nf.connect(bp);
  }
  ng.connect(mix);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4200 + scream * 3000;
  mix.connect(lp).connect(env).connect(at(pos, sfxBus, 2.5, 1.1));
  if (indoor > 0.3 && pos && dist(pos) < 12) { const rv = ctx.createGain(); rv.gain.value = 0.5; env.connect(rv).connect(roomVerb); }
  for (const o of [src, lfo, fr]) { o.start(t); o.stop(end + 0.05); }
  ns.start(t, Math.random() * 3); ns.stop(end + 0.05);
  voices.push(end);
}
export function zombie(kind, pos, pitch = 1, rate = 1.075) {   // rate: the Death_D playback rate for 'die' (combat picks 0.95-1.2)
  if (!ctx || paused || !pos) return 0;
  const d = dist(pos); if (d > 55) { if (kind === 'die' && d < 90) bodyFall(pos, 0.5, DEATH_HIT / rate); return 0; }
  const nw = ctx.currentTime;
  for (let i = voices.length - 1; i >= 0; i--) if (voices[i] < nw) voices.splice(i, 1);
  if (voices.length > 5 && kind !== 'scream' && kind !== 'bite') { if (kind === 'die') bodyFall(pos, 0.8, DEATH_HIT / rate); return 0; }   // nothing heard, nothing moves   // too many voices: a dying one still hits the floor
  const t = nw + 0.02 + d / 343, r = (a, b) => a + Math.random() * (b - a);
  const delay = d / 343, room = indoor > 0.3 && d < 12 ? 0.4 : 0;
  const REAL = { groan: ['z_moan', 0.9, 0.95], moan: ['z_moan', 0.8, 0.88], growl: ['z_growl', 1.0, 1], alert: ['z_yell', 1.0, 0.95], scream: ['z_yell', 1.15, 1.12], hurt: ['z_growl', 0.9, 1.12], die: ['z_death', 1.0, 0.95], bite: ['z_growl', 1.2, 1] };
  if (REAL[kind] && hasReal(REAL[kind][0])) {
    const [cat, g, prate] = REAL[kind];
    const dd = rs(cat, { pos, gain: g * (pitch < 1 ? 1.25 : 1), rate: prate * pitch, vary: 0.1, delay, ref: 2.5, roll: 1.1, room });
    voices.push(nw + delay + dd); lastDelay = delay; lastEnv = rsLastBuf && rsLastBuf.env ? envSlice(rsLastBuf.env, 0, rsLastRate) : null;
    if (kind === 'bite') { rs('hit_bone', { pos, gain: 0.9, delay: delay + 0.12 }); rs('squish', { pos, gain: 0.8, delay: delay + 0.1 }); }
    // [realism] no two the same: a moan sometimes trails off into a wet rattle in the throat (a growl, slowed and quiet)
    if ((kind === 'groan' || kind === 'moan') && d < 30 && Math.random() < 0.35) rs('z_growl', { pos, gain: 0.45, rate: 0.72 * pitch, vary: 0.06, delay: delay + dd * 0.82, ref: 2.5, roll: 1.1, room, lp: 2200 });
    if (kind === 'die') rs('bodyfall', { pos, gain: 0.7, delay: delay + DEATH_HIT / rate, ref: 3 });   // the body hits the floor when the hips do (rate = its Death_D rate)
    return dd + delay;
  }
  let D = 0; const dur = (a, b) => (D = r(a, b));
  switch (kind) {
    case 'groan': zthroat(t, pos, { f0: r(85, 125), f1: r(60, 80), dur: dur(1.1, 2.4), vowel: Math.random() < 0.5 ? 'uh' : 'oo', vowel2: 'aa', gain: 0.38, rasp: 0.7 }); break;
    case 'moan': zthroat(t, pos, { f0: r(110, 150), f1: r(70, 95), dur: dur(1.8, 3.2), vowel: 'oo', vowel2: 'uh', gain: 0.32, rasp: 0.5, jitter: 0.05 }); break;
    case 'growl': zthroat(t, pos, { f0: r(70, 95), f1: r(55, 70), dur: dur(0.5, 0.9), vowel: 'aa', gain: 0.55, rasp: 1, fry: 28 }); break;
    case 'alert': zthroat(t, pos, { f0: r(140, 190), f1: r(90, 110), dur: dur(0.9, 1.4), vowel: 'aa', vowel2: 'uh', gain: 0.6, rasp: 0.9, scream: 0.3 }); break;
    case 'scream': zthroat(t, pos, { f0: r(380, 520), f1: r(260, 330), dur: dur(1.0, 1.6), vowel: 'aa', vowel2: 'eh', gain: 0.75, rasp: 1, scream: 1, jitter: 0.12 }); break;
    case 'hurt': zthroat(t, pos, { f0: r(120, 170), f1: r(80, 100), dur: dur(0.25, 0.45), vowel: 'uh', gain: 0.5, rasp: 0.9 }); break;
    case 'die': zthroat(t, pos, { f0: r(100, 130), f1: 45, dur: dur(1.0, 1.5), vowel: 'aa', vowel2: 'oo', gain: 0.45, rasp: 1, fry: 18 }); gurgle(t + 0.2, pos, 0.8); bodyFall(pos, 0.8, DEATH_HIT / rate); break;
    case 'bite': zthroat(t, pos, { f0: r(80, 100), f1: 60, dur: (D = 0.7), vowel: 'aa', gain: 0.7, rasp: 1, fry: 26 }); flesh(t + 0.15, pos, 1.3, true); break;
  }
  lastDelay = delay; lastEnv = null;
  return D ? D + delay : 0;
}
// [realism] a zombie down on a body, eating: a slice of the real feeding recording (tearing, chewing, swallowing), its own
// part each time; main.js calls this for each bite of the feeding dip (zombieChew). Returns how long the mouth works.
const feedOn = [];
export function feed(pos) {
  if (!ctx || paused || !pos) return 0;
  const d = dist(pos); if (d > 30) return 0;
  const nw = ctx.currentTime; for (let i = feedOn.length - 1; i >= 0; i--) if (feedOn[i] < nw) feedOn.splice(i, 1);
  if (!hasReal('z_feed') || feedOn.length >= 3) return zombie('bite', pos, 1);
  const delay = d / 343, buf = R.z_feed[0], len = 0.6 + Math.random() * 0.6, off = Math.random() * Math.max(0, buf.duration - len - 0.1);
  const dd = rs('z_feed', { pos, gain: 1.1, rate: 1, vary: 0.08, delay, offset: off, dur: len, ref: 2.5, room: indoor > 0.3 && d < 12 ? 0.35 : 0 });
  if (Math.random() < 0.35) rs('squish', { pos, gain: 0.45, delay: delay + Math.random() * 0.3 });
  feedOn.push(nw + delay + len); lastDelay = delay; lastEnv = null;
  return dd ? len : 0;
}
function gurgle(t, pos, g) { for (let i = 0; i < 8; i++) { const tt = t + i * 0.07 + Math.random() * 0.04; thump(tt, 300 + Math.random() * 250, 120, 0.05, 0.12 * g, { pos }); burst(tt, { f: 700, q: 3, d: 0.04, g: 0.08 * g, pos }); } }
// wet: torn flesh, a crunch of bone
function flesh(t, pos, g = 1, bone = false) {
  thump(t, 140, 55, 0.1, 0.55 * g, { pos });
  burst(t, { f: 650, q: 1.6, d: 0.09, g: 0.5 * g, pos, sweep: 0.5 });
  burst(t + 0.01, { f: 2600, q: 1.2, d: 0.05, g: 0.25 * g, pos });
  if (bone) { burst(t + 0.02, { f: 3400, q: 4, d: 0.015, g: 0.5 * g, pos }); burst(t + 0.045, { f: 2200, q: 5, d: 0.02, g: 0.35 * g, pos }); }
}

// ---------------------------------------------------------------- melee
export function swing(heavy = 0.5, pos = null) {
  if (!ctx || paused) return;
  const t = ctx.currentTime + 0.01, f = 500 - heavy * 200;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4; bp.frequency.setValueAtTime(f, t); bp.frequency.exponentialRampToValueAtTime(f * 3.2, t + 0.12); bp.frequency.exponentialRampToValueAtTime(f * 1.1, t + 0.28);
  const e = ctx.createGain(); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(0.32 + heavy * 0.2, t + 0.1); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  s.connect(bp).connect(e).connect(out(pos)); s.start(t, Math.random() * 3); s.stop(t + 0.35);
}
export function meleeHit(kind, pos, head = false, power = 1) {
  if (!ctx || paused) return;
  const t = ctx.currentTime + 0.004, g = power;
  if (hasReal('hit_punch')) {
    if (kind === 'fist') { rs('hit_punch', { pos, gain: 0.9 * g }); if (head && Math.random() < 0.5) rs('hit_bone', { pos, gain: 0.35 }); return; }
    if (kind === 'blade') { rs('squish', { pos, gain: 0.9 * g, rate: 1.1 }); rs('hit_punch', { pos, gain: 0.45 * g, rate: 1.2 }); if (head) rs('hit_bone', { pos, gain: 0.7 }); return; }
    rs('hit_heavy', { pos, gain: 0.95 * g }); rs('hit_punch', { pos, gain: 0.55 * g, rate: 0.85 });
    if (head) { rs('hit_bone', { pos, gain: 0.9 }); if (Math.random() < 0.5) rs('splat', { pos, gain: 0.5 }); }
    if (kind === 'metal') rs('metal_hit', { pos, gain: 0.35, rate: 1.1 });
    return;
  }
  if (kind === 'blade') { burst(t, { f: 3800, type: 'highpass', d: 0.05, g: 0.35 * g, pos }); flesh(t + 0.005, pos, 0.9 * g, head); }
  else if (kind === 'fist') { thump(t, 160, 70, 0.07, 0.6 * g, { pos }); burst(t, { f: 1200, q: 0.8, d: 0.04, g: 0.35 * g, pos }); }
  else { thump(t, 110, 42, 0.13, 0.85 * g, { pos }); burst(t, { f: 900, q: 1, d: 0.06, g: 0.5 * g, pos }); flesh(t + 0.004, pos, 0.7 * g, head); if (head) { burst(t + 0.01, { f: 1800, q: 3, d: 0.03, g: 0.6 * g, pos }); } }
  if (kind === 'metal') tone(t, 1600 + Math.random() * 500, 0.3, 0.06, 'triangle', sfxBus, pos);
}
export function shove(pos = null) { if (!ctx || paused) return; const t = ctx.currentTime + 0.01; burst(t, { f: 500, q: 0.9, d: 0.12, g: 0.35, pos }); thump(t + 0.04, 130, 60, 0.08, 0.45, { pos }); }
export function breakWeapon() { if (!ctx) return; const t = ctx.currentTime + 0.01; burst(t, { f: 1500, q: 2, d: 0.05, g: 0.7 }); burst(t + 0.02, { f: 3000, q: 3, d: 0.15, g: 0.35 }); for (let i = 0; i < 5; i++) click(t + 0.05 + i * 0.03, 2000 + Math.random() * 2000, 0.25); }
export function stomp(pos) { if (!ctx || paused) return; const t = ctx.currentTime + 0.01; if (hasReal('splat')) { rs('splat', { pos, gain: 0.8 }); rs('hit_bone', { pos, gain: 0.9 }); return; } thump(t, 90, 35, 0.15, 0.9, { pos }); flesh(t, pos, 1.2, true); }

// ---------------------------------------------------------------- the house: doors, cupboards, glass, searching
function creak(t, pos, g = 0.3, dur = 0.5) {
  const o = ctx.createOscillator(); o.type = 'sawtooth'; const f = 180 + Math.random() * 220;
  o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * (1.3 + Math.random() * 0.5), t + dur * 0.6); o.frequency.linearRampToValueAtTime(f * 0.9, t + dur);
  const am = ctx.createGain(); am.gain.value = 0.5; const l = ctx.createOscillator(); l.frequency.value = 22 + Math.random() * 20; const lg = ctx.createGain(); lg.gain.value = 0.5; l.connect(lg).connect(am.gain);
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 3;
  const e = ctx.createGain(); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(g * 0.4, t + 0.05); e.gain.setValueAtTime(g * 0.4, t + dur * 0.7); e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(am).connect(bp).connect(e).connect(out(pos)); o.start(t); l.start(t); o.stop(t + dur + 0.05); l.stop(t + dur + 0.05);
}
export function door(kind, pos) {
  if (!ctx || paused) return;
  const t = ctx.currentTime + 0.01 + (pos ? dist(pos) / 343 : 0);
  if (hasReal('door_close')) {
    const delay = t - ctx.currentTime, room = indoor > 0.3 ? 0.35 : 0.1;
    if (kind === 'open') { rs('door_open', { pos, gain: 0.8, delay, room }); if (Math.random() < 0.6) rs('creak', { pos, gain: 0.35, delay: delay + 0.05, dur: 1.2, offset: Math.random() * 1.2, rate: 1.1 }); }
    else if (kind === 'close') rs('door_close', { pos, gain: 0.9, delay, room });
    else if (kind === 'bang') rs('door_bang', { pos, gain: 1.0, delay, ref: 4, room });
    else if (kind === 'break') { rs('wood_break', { pos, gain: 1.0, delay, ref: 5 }); rs('door_bang', { pos, gain: 0.9, delay }); rs('bodyfall', { pos, gain: 0.6, delay: delay + 0.45, rate: 0.8 }); }
    return;
  }
  if (kind === 'open') { click(t, 1800, 0.3, pos); creak(t + 0.05, pos, 0.5, 0.7); }
  else if (kind === 'close') { creak(t, pos, 0.35, 0.4); thump(t + 0.38, 130, 60, 0.12, 0.7, { pos }); click(t + 0.39, 1500, 0.4, pos); }
  else if (kind === 'bang') { thump(t, 95, 45, 0.18, 0.9, { pos, ref: 4 }); burst(t, { f: 450, q: 0.8, d: 0.15, g: 0.55, pos, ref: 4 }); burst(t + 0.02, { f: 2400, q: 2, d: 0.05, g: 0.2, pos }); if (Math.random() < 0.4) creak(t + 0.1, pos, 0.3, 0.3); }
  else if (kind === 'break') { thump(t, 120, 40, 0.3, 1.0, { pos, ref: 5 }); for (let i = 0; i < 8; i++) burst(t + Math.random() * 0.25, { f: 1200 + Math.random() * 2500, q: 2, d: 0.05, g: 0.4, pos }); thump(t + 0.45, 90, 35, 0.25, 0.8, { pos }); }
}
export function glass(pos, big = 1) {
  if (!ctx || paused) return;
  if (hasReal('glass')) { rs('glass', { pos, gain: 0.9 * big, delay: pos ? dist(pos) / 343 : 0, ref: 4 }); return; }
  const t = ctx.currentTime + 0.01 + (pos ? dist(pos) / 343 : 0);
  burst(t, { f: 4500, type: 'highpass', d: 0.12, g: 0.7 * big, pos, ref: 4 });
  for (let i = 0; i < 14 * big; i++) { const tt = t + Math.random() * 0.45 * big; tone(tt, 2500 + Math.random() * 5000, 0.06 + Math.random() * 0.12, 0.05 + Math.random() * 0.06, 'sine', sfxBus, pos, 0.001); }
  thump(t, 300, 120, 0.06, 0.3, { pos });
}
// rummaging through a cupboard: rustles, things knocking together, a drawer sliding
export function rummage(kind, dur, pos = null, { events = true } = {}) {
  if (!ctx || paused) return;
  const t0 = ctx.currentTime + 0.02;
  if (!events) { if (['car', 'truck', 'police', 'ambulance'].includes(kind) && hasReal('metal_hit')) rs('metal_hit', { pos, gain: 0.25, rate: 1.4 }); return; }   // what you actually touch makes its own sound (touch())
  if (hasReal('rummage')) {
    if (kind === 'fridge' || ['closet', 'cabinet', 'medicine', 'pantry'].includes(kind)) rs('door_open', { pos, gain: 0.45, rate: 1.3 });
    if (['car', 'truck', 'police', 'ambulance'].includes(kind)) rs('metal_hit', { pos, gain: 0.25, rate: 1.4 });
    const n = Math.max(2, Math.floor(dur * 2.2));
    for (let i = 0; i < n; i++) rs(kind === 'corpse' ? 'bodyfall' : 'rummage', { pos, gain: kind === 'corpse' ? 0.25 : 0.4 + Math.random() * 0.25, delay: 0.25 + i * (dur - 0.4) / n + Math.random() * 0.1, rate: 0.9 + Math.random() * 0.3, room: indoor * 0.3 });
    return;
  }
  if (kind === 'fridge') { burst(t0, { f: 400, q: 0.7, d: 0.15, g: 0.3, pos }); click(t0 + 0.12, 900, 0.25, pos); tone(t0, 120, dur, 0.02, 'sawtooth', sfxBus, pos, 0.1); }
  else if (kind === 'car' || kind === 'truck' || kind === 'police' || kind === 'ambulance') { click(t0, 1400, 0.4, pos); thump(t0 + 0.02, 220, 90, 0.08, 0.35, { pos }); }
  else if (['kitchen', 'kitchen2', 'dresser', 'nightstand', 'register'].includes(kind)) { const s = ctx.createBufferSource(); s.buffer = noiseBuf; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(500, t0); f.frequency.linearRampToValueAtTime(900, t0 + 0.25); f.Q.value = 2; const e = ctx.createGain(); e.gain.setValueAtTime(0, t0); e.gain.linearRampToValueAtTime(0.3, t0 + 0.05); e.gain.exponentialRampToValueAtTime(0.001, t0 + 0.3); s.connect(f).connect(e).connect(out(pos)); s.start(t0, Math.random()); s.stop(t0 + 0.35); }
  else if (kind === 'closet' || kind === 'cabinet' || kind === 'medicine' || kind === 'pantry') creak(t0, pos, 0.25, 0.35);
  const n = Math.floor(dur * 7);
  for (let i = 0; i < n; i++) {
    const t = t0 + 0.3 + Math.random() * (dur - 0.4);
    if (Math.random() < 0.6) burst(t, { f: 1200 + Math.random() * 3000, q: 0.9, d: 0.04 + Math.random() * 0.08, g: 0.06 + Math.random() * 0.08, pos });
    else if (kind === 'corpse') burst(t, { f: 500, q: 0.8, d: 0.08, g: 0.1, pos });
    else tone(t, 1500 + Math.random() * 3000, 0.08, 0.025 + Math.random() * 0.03, 'triangle', sfxBus, pos, 0.001);
  }
}
// a drawer running out on its runners, a cupboard door's hinge, a car's trunk latch
export function opening(kind, pos = null) {
  if (!ctx || paused) return;
  const t = ctx.currentTime + 0.01;
  if (kind === 'slide') { const s = ctx.createBufferSource(); s.buffer = noiseBuf; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 3; f.frequency.setValueAtTime(700, t); f.frequency.linearRampToValueAtTime(1300, t + 0.35); const e = ctx.createGain(); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(0.22, t + 0.05); e.gain.setValueAtTime(0.22, t + 0.28); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.4); s.connect(f).connect(e).connect(out(pos)); s.start(t, Math.random()); s.stop(t + 0.45); thump(t + 0.38, 220, 120, 0.05, 0.25, { pos }); for (let k = 0; k < 4; k++) tone(t + 0.4 + Math.random() * 0.1, 2400 + Math.random() * 2000, 0.06, 0.03, 'triangle', sfxBus, pos, 0.001); }
  else if (kind === 'car') { click(t, 1400, 0.45, pos); thump(t + 0.02, 260, 110, 0.07, 0.35, { pos }); creak(t + 0.08, pos, 0.18, 0.4); }
  else if (kind === 'fridge') { burst(t, { f: 380, q: 0.6, d: 0.18, g: 0.35, pos }); click(t + 0.05, 900, 0.2, pos); for (let k = 0; k < 3; k++) tone(t + 0.2 + k * 0.07, 2800 + Math.random() * 1500, 0.08, 0.025, 'triangle', sfxBus, pos, 0.001); }
  else if (kind === 'lid') { thump(t, 300, 140, 0.06, 0.3, { pos }); burst(t, { f: 900, q: 1, d: 0.08, g: 0.15, pos }); }
  else { click(t, 1700, 0.25, pos); creak(t + 0.03, pos, 0.28, 0.45); }
}
export function keys() { rs('keys', { gain: 0.8 }); }
export function pickup(kind = 'item') {
  if (!ctx) return;
  const t = ctx.currentTime + 0.01;
  if (kind === 'weapon') { burst(t, { f: 800, q: 0.8, d: 0.12, g: 0.3 }); thump(t + 0.08, 200, 90, 0.08, 0.35); click(t + 0.12, 2400, 0.2); }
  else if (kind === 'ammo') { for (let i = 0; i < 4; i++) tone(t + i * 0.04, 3200 + Math.random() * 1200, 0.06, 0.05, 'triangle', sfxBus, null, 0.001); }
  else { burst(t, { f: 1600, q: 0.9, d: 0.1, g: 0.22 }); burst(t + 0.12, { f: 2800, q: 1.5, d: 0.2, g: 0.12, sweep: 1.4 }); }   // into the backpack, zip
}
export function eat() { if (!ctx) return; if (hasReal('crunch')) { for (let i = 0; i < 5; i++) rs('crunch', { gain: 0.7, delay: i * 0.33 + Math.random() * 0.06 }); return; } const t = ctx.currentTime + 0.01; for (let i = 0; i < 6; i++) { const tt = t + i * 0.32 + Math.random() * 0.06; burst(tt, { f: 2400, q: 0.7, d: 0.07, g: 0.3 }); burst(tt + 0.03, { f: 900, q: 1, d: 0.05, g: 0.2 }); } }
export function drink() { if (!ctx) return; const t = ctx.currentTime + 0.01; click(t, 2000, 0.3); for (let i = 0; i < 6; i++) { const tt = t + 0.25 + i * 0.22; const o = ctx.createOscillator(); o.frequency.setValueAtTime(240 + Math.random() * 80, tt); o.frequency.exponentialRampToValueAtTime(520, tt + 0.08); const e = ctx.createGain(); e.gain.setValueAtTime(0, tt); e.gain.linearRampToValueAtTime(0.2, tt + 0.01); e.gain.exponentialRampToValueAtTime(0.0001, tt + 0.1); o.connect(e).connect(sfxBus); o.start(tt); o.stop(tt + 0.12); thump(tt, 90, 60, 0.08, 0.2); } }
export function bandage() { if (!ctx) return; const t = ctx.currentTime + 0.01; for (let i = 0; i < 3; i++) { const s = ctx.createBufferSource(); s.buffer = noiseBuf; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2200; f.Q.value = 1.2; const am = ctx.createGain(); am.gain.value = 0; const tt = t + i * 0.45; am.gain.setValueAtTime(0, tt); for (let k = 0; k < 12; k++) am.gain.setValueAtTime(k % 2 ? 0.05 : 0.3, tt + k * 0.025); am.gain.setValueAtTime(0, tt + 0.32); s.connect(f).connect(am).connect(sfxBus); s.start(tt, Math.random()); s.stop(tt + 0.35); } }
export function flashlight(on) { if (!ctx) return; const t = ctx.currentTime + 0.005; click(t, on ? 2600 : 2000, 0.35); thump(t, 400, 200, 0.02, 0.15); }
export function battery() { if (!ctx) return; const t = ctx.currentTime + 0.01; click(t, 1800, 0.3); click(t + 0.15, 2600, 0.3); click(t + 0.4, 2200, 0.35); }
// A fire is ONE continuous crackling bed per blaze (the real recording looped from a random point), not a string of short
// slices: fireLoop(pos, k) keeps calling it alive (main.js calls it every ~0.5 s, or now and then); a bed nobody has
// called for ~3 s fades out and stops. fireStart/fireStop give an explicit handle when a caller wants one.
const FIRES = new Map(); let fireSweep = 0;
const fireKey = p => Math.round(p.x / 3) + ',' + Math.round(p.z / 3);
export function fireStart(pos, k = 1) {
  if (!ctx || !hasReal('fire')) return null;
  const b = loopBed('fire', { x: pos.x, y: pos.y ?? 0.5, z: pos.z }, 4); if (!b) return null;
  b.s.playbackRate.value = 0.95 + Math.random() * 0.1; b.k = k; b.seen = ctx.currentTime; b.pos = { x: pos.x, z: pos.z };
  b.g.gain.setTargetAtTime(0.6 * k, ctx.currentTime + 0.05, 0.25);
  if (!fireSweep) fireSweep = setInterval(fireTick, 250);
  return b;
}
export function fireStop(h, fade = 0.4) {
  if (!h || h.dead || !ctx) return; h.dead = true;
  const t = ctx.currentTime; h.g.gain.cancelScheduledValues(t); h.g.gain.setTargetAtTime(0, t, fade / 3);
  try { h.s.stop(t + fade + 0.1); } catch (e) { /* already stopped */ }
  for (const [key, v] of FIRES) if (v === h) FIRES.delete(key);
}
function fireTick() {
  if (!ctx) return;
  const t = ctx.currentTime;
  for (const [, h] of FIRES) {
    const far = Math.hypot(h.pos.x - L.x, h.pos.z - L.z) > 34;
    if (t - h.seen > 3 || far) fireStop(h);
    else h.g.gain.setTargetAtTime(paused ? 0 : 0.6 * h.k, t, 0.3);
  }
  if (!FIRES.size) { clearInterval(fireSweep); fireSweep = 0; }
}
export function fireLoop(pos, k = 1) {
  if (!ctx || paused || dist(pos) > 30) return;
  if (hasReal('fire')) {
    const key = fireKey(pos); let h = FIRES.get(key);
    if (!h) {
      if (FIRES.size >= 5) {   // only the nearest few blazes get their own bed
        let worst = null, wd = dist(pos); for (const [, v] of FIRES) { const dv = Math.hypot(v.pos.x - L.x, v.pos.z - L.z); if (dv > wd) { wd = dv; worst = v; } }
        if (!worst) return; fireStop(worst, 0.3);
      }
      h = fireStart(pos, k); if (!h) return; FIRES.set(key, h);
    }
    h.seen = ctx.currentTime; if (Math.abs(h.k - k) > 0.02) { h.k = k; h.g.gain.setTargetAtTime(0.6 * k, ctx.currentTime, 0.3); }
    return;
  }
  const t = ctx.currentTime; burst(t, { f: 500, q: 0.4, a: 0.08, d: 0.5, g: 0.1 * k, pos, brown: true }); for (let i = 0; i < 3; i++) click(t + Math.random() * 0.4, 1500 + Math.random() * 3000, 0.08 * k, pos);
}
export function ignite(pos) { if (!ctx) return; const t = ctx.currentTime + 0.01; burst(t, { f: 300, type: 'lowpass', d: 0.8, g: 0.9, pos, brown: true, ref: 4 }); burst(t, { f: 1200, q: 0.5, d: 0.5, g: 0.4, pos, sweep: 0.4 }); }
// a car alarm, the oldest trick in the book (and every zombie for a block hears it)
export function carAlarm(pos, dur = 14) {
  if (!ctx || paused) return;
  const t = ctx.currentTime + 0.05;
  const o = ctx.createOscillator(); o.type = 'square';
  for (let k = 0; k < dur * 2.5; k++) { const tt = t + k * 0.4; o.frequency.setValueAtTime(k % 2 ? 950 : 720, tt); }
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
  const e = ctx.createGain(); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(0.12, t + 0.05); e.gain.setValueAtTime(0.12, t + dur - 0.1); e.gain.linearRampToValueAtTime(0, t + dur);
  o.connect(lp).connect(e).connect(at(pos, sfxBus, 6, 0.8)); o.start(t); o.stop(t + dur + 0.1);
}
export function engine(kind) {
  if (!ctx) return;
  const t = ctx.currentTime + 0.05;
  if (kind === 'crank') { for (let i = 0; i < 7; i++) { thump(t + i * 0.16, 70, 40, 0.12, 0.5); burst(t + i * 0.16, { f: 300, q: 0.8, d: 0.1, g: 0.25 }); } }
  else if (kind === 'start') {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(30, t); o.frequency.linearRampToValueAtTime(55, t + 0.6); o.frequency.linearRampToValueAtTime(38, t + 1.5); o.frequency.linearRampToValueAtTime(70, t + 4); o.frequency.linearRampToValueAtTime(95, t + 8);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400;
    const e = ctx.createGain(); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(0.5, t + 0.3); e.gain.setValueAtTime(0.5, t + 7); e.gain.linearRampToValueAtTime(0.0001, t + 10);
    o.connect(lp).connect(e).connect(sfxBus); o.start(t); o.stop(t + 10.2);
    burst(t, { f: 200, type: 'lowpass', d: 0.4, g: 0.6, brown: true });
  }
}
export function hurtPlayer(g = 1, dir = 0, kind = 'claw') {
  if (!ctx || paused) return;
  const t = ctx.currentTime + 0.005;
  thump(t, 140, 50, 0.18, 0.6 * g, { pan: dir * 0.6 }); burst(t, { f: kind === 'claw' ? 2600 : 400, q: 0.7, d: 0.12, g: 0.4 * g, pan: dir * 0.6 });
  if (kind === 'bite') { if (hasReal('hit_bone')) { rs('hit_bone', { gain: 1 }); rs('squish', { gain: 0.9 }); } else flesh(t, null, 1.4, true); }
  if ((hasReal('p_hurt') || playerFemale) && (g > 0.35 || Math.random() < 0.5) && ctx.currentTime > gruntT) { gruntT = ctx.currentTime + 1.2; playerGrunt(0.55 + g * 0.3); }
  else if (hasReal('hit_punch')) rs('hit_punch', { gain: 0.5 * g, rate: 0.8 });
  dull(0.12 + g * 0.2, 2500);
  // your own breath catches: a sharp gasp
  burst(t + 0.02, { f: 1100, q: 2, d: 0.18, g: 0.18 * g });
}
let gruntT = 0, playerFemale = false;
export function setPlayerFemale(f) { playerFemale = !!f; }   // main.js: SND.setPlayerFemale(P.body === 'michelle')
function playerGrunt(gain, rate = 0.95) { return (playerFemale && voice('hurt', null, { female: true, gain, pri: 2 })) || rs('p_hurt', { gain, delay: 0.04, rate, vary: 0.05, room: indoor * 0.3 }); }
export function playerDeath(rate = 1) { if (!(playerFemale && voice('die', null, { female: true, gain: 0.9, pri: 2, dur: 2.6 }))) rs('p_death', { gain: 0.8, room: indoor * 0.3 }); rs('bodyfall', { gain: 0.9, delay: DEATH_HIT / rate, room: indoor * 0.3 }); }
// an old radio: hiss, crackle, a voice-shaped murmur under the static (no words — the captions carry them)
export function radioStatic(dur = 24, pos = null) {
  if (!ctx) return;
  const t = ctx.currentTime + 0.05;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.6;
  const e = ctx.createGain(); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(0.09, t + 0.2); e.gain.setValueAtTime(0.09, t + dur - 0.5); e.gain.linearRampToValueAtTime(0, t + dur);
  s.connect(bp).connect(e).connect(out(pos, sfxBus, 0, 2)); s.start(t, Math.random()); s.stop(t + dur + 0.1);
  for (let i = 0; i < dur * 9; i++) click(t + Math.random() * dur, 2000 + Math.random() * 3000, 0.08 + Math.random() * 0.1, pos);
  // real voices on the air (recorded); the old voice-shaped murmur only if the recordings never loaded
  if (radioBursts(dur, pos)) return;
  const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 120;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 3;
  const ve = ctx.createGain(); ve.gain.value = 0;
  for (let k = 1.6; k < dur - 2; k += 0.18 + Math.random() * 0.25) { ve.gain.setValueAtTime(Math.random() < 0.75 ? 0.025 + Math.random() * 0.03 : 0, t + k); o.frequency.setValueAtTime(100 + Math.random() * 60, t + k); f.frequency.setValueAtTime(600 + Math.random() * 900, t + k); }
  ve.gain.setValueAtTime(0, t + dur - 2);
  o.connect(f).connect(ve).connect(out(pos, sfxBus, 0, 2)); o.start(t); o.stop(t + dur);
}
export function struggle() { if (!ctx) return; if (Math.random() < 0.3 && ctx.currentTime > gruntT) { gruntT = ctx.currentTime + 0.8; playerGrunt(0.4, 1.05); } const t = ctx.currentTime + 0.01; burst(t, { f: 700, q: 1.2, d: 0.15, g: 0.3 }); burst(t + 0.05, { f: 1300, q: 2, d: 0.1, g: 0.18 }); thump(t, 120, 70, 0.06, 0.25); }
export function throwWhoosh() { swing(0.2); }

// ---------------------------------------------------------------- ambience: a dead town
export function start() {
  if (started || !ctx) return; started = true;
  const loop = buf => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; return s; };
  const ws = loop(brownBuf);
  windF = ctx.createBiquadFilter(); windF.type = 'bandpass'; windF.frequency.value = 400; windF.Q.value = 0.4;
  windG = ctx.createGain(); windG.gain.value = 0.18;
  ws.connect(windF).connect(windG).connect(occ || sfxBus); ws.start(0, Math.random());
  const bs = loop(noiseBuf);
  breathF = ctx.createBiquadFilter(); breathF.type = 'bandpass'; breathF.frequency.value = 900; breathF.Q.value = 0.8;
  breathG = ctx.createGain(); breathG.gain.value = 0;
  bs.connect(breathF).connect(breathG).connect(sfxBus); bs.start(0, Math.random());
  // crickets at night
  crickG = ctx.createGain(); crickG.gain.value = 0; crickG.connect(sfxBus);
  setInterval(ambient, 500);
  music();
}
let crickG = null, nightK = 0;
export function setNight(k) { nightK = k; }
// rain: a hiss outside; under a roof it turns into a dull drumming overhead
let rainA = null;
export function setRain(k) {
  if (!ctx || !started) return;
  if (!rainA) {
    const loop = buf => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, Math.random()); return s; };
    const hiss = loop(noiseBuf), hf = ctx.createBiquadFilter(); hf.type = 'highpass'; hf.frequency.value = 1800;
    const hp = ctx.createBiquadFilter(); hp.type = 'lowpass'; hp.frequency.value = 9000;
    const hg = ctx.createGain(); hg.gain.value = 0; hiss.connect(hf).connect(hp).connect(hg).connect(sfxBus);
    const body = loop(brownBuf), bf = ctx.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 500; bf.Q.value = 0.5;
    const bg = ctx.createGain(); bg.gain.value = 0; body.connect(bf).connect(bg).connect(sfxBus);
    rainA = { hg, bg, hp };
    // drips and patter
    setInterval(() => { if (!rainA || paused || rainA.k < 0.05) return; const t = ctx.currentTime; for (let i = 0; i < 6 * rainA.k; i++) { const tt = t + Math.random() * 0.4; if (indoor > 0.5) thump(tt, 180 + Math.random() * 120, 90, 0.04, 0.03 * rainA.k); else burst(tt, { f: 2800 + Math.random() * 4500, q: 1.5 + Math.random() * 2, a: 0.0008, d: 0.006 + Math.random() * 0.012, g: 0.035 * rainA.k, pan: Math.random() * 1.6 - 0.8 }); }
      // [realism] drops landing in puddles ('plip': the pitch jumps up as the bubble rings), and on the window glass when you're inside
      const np = Math.round((LOWP ? 1 : 2.5) * rainA.k * Math.random() + (Math.random() < rainA.k * 0.5 ? 1 : 0));
      for (let i = 0; i < np; i++) { const tt = t + Math.random() * 0.4; if (indoor > 0.5) tone(tt, 2600 + Math.random() * 1800, 0.02, 0.012 * rainA.k, 'sine', sfxBus, null, 0.0005); else plip(tt, Math.random() * 1.6 - 0.8, 0.03 * rainA.k); }
    }, 400);   // each drop a tiny tick of filtered noise (stereo-panned: no HRTF panner per drop)
  }
  rainA.k = k;
  const t = ctx.currentTime, inside = indoor;
  rainA.hg.gain.setTargetAtTime(k * 0.22 * (1 - inside * 0.8), t, 0.6);
  rainA.bg.gain.setTargetAtTime(k * (0.1 + inside * 0.25), t, 0.6);
  rainA.hp.frequency.setTargetAtTime(inside > 0.5 ? 1200 : 9000, t, 0.4);
}
function plip(t, pan, g) {
  const o = ctx.createOscillator(), f = 900 + Math.random() * 1600; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * (1.6 + Math.random() * 0.6), t + 0.035);
  const e = ctx.createGain(); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(g, t + 0.002); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
  const p = ctx.createStereoPanner(); p.pan.value = pan; o.connect(e).connect(p).connect(occ || sfxBus); o.start(t); o.stop(t + 0.05);
}
export function thunder(close = 0.5) {
  if (!ctx || paused) return;
  const t = ctx.currentTime + 0.05, a = Math.random() * 6.28, p = { x: L.x + Math.cos(a) * 200, y: 60, z: L.z + Math.sin(a) * 200 };
  if (close > 0.7) burst(t, { f: 1800, type: 'highpass', d: 0.25, g: 0.5 * close });   // the crack overhead
  const s = ctx.createBufferSource(); s.buffer = brownBuf; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(900 * close + 200, t); f.frequency.exponentialRampToValueAtTime(90, t + 4);
  const e = ctx.createGain(); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(0.9 * close + 0.2, t + 0.15); for (let k = 1; k < 6; k++) e.gain.linearRampToValueAtTime((0.4 + Math.random() * 0.6) * (0.9 * close + 0.2) * (1 - k / 7), t + k * 0.6); e.gain.exponentialRampToValueAtTime(0.0001, t + 5.5);
  s.connect(f).connect(e).connect(at(p, farVerb, 80, 0.3)); s.start(t, Math.random() * 2); s.stop(t + 6);
  const g2 = ctx.createGain(); g2.gain.value = 0.6; e.connect(g2).connect(occ || sfxBus);
}
let ambT = 0;
function farPos(r0 = 150, r1 = 450) { const a = Math.random() * Math.PI * 2, r = r0 + Math.random() * (r1 - r0); return { x: L.x + Math.cos(a) * r, y: 6, z: L.z + Math.sin(a) * r }; }
// somewhere out beyond the town fence (106 m from the centre), never on a street you can see: try a few directions, push it out if needed
function outPos(r0 = 150, r1 = 300) {
  let p = farPos(r0, r1);
  for (let i = 0; i < 6 && Math.hypot(p.x, p.z) < 125; i++) p = farPos(r0, r1);
  const m = Math.hypot(p.x, p.z); if (m < 125) { const k = 125 / Math.max(1, m); p.x *= k; p.z *= k; }
  return p;
}
function ambient() {
  if (!ctx || paused) return;
  const t = ctx.currentTime;
  // which place we're in (world.ambient: suburb | desert | jungle | prison | city): each has its own bed of real recordings
  const set = ambSet();
  envTick(t);
  // [realism] wind comes in gusts (a random walk, not a sine): the low roar and the leaves in the trees rise and fall together
  const gk = windGust(set);
  windF.frequency.setTargetAtTime(240 + gk * 380 + Math.sin(t * 0.37) * 40, t, 1.2);
  windG.gain.setTargetAtTime((0.07 + gk * 0.12) * (1 - indoor * 0.7), t, 1.2);
  living(t, set);
  if (set !== 'suburb' && mowerG) mowerG.gain.setTargetAtTime(0, t, 0.8);
  if (set !== 'suburb' && mode === 'play') mapAmb(set, t);
  // a normal Saturday: birds in the trees, a lawnmower a few streets over, a dog, a car door
  if (peace > 0.5 && mode === 'play') { if (set === 'suburb') peaceAmb(t); return; }
  ambT -= 0.5;
  if (ambT > 0 || mode !== 'play') return;
  ambT = 3 + Math.random() * 7;
  const k = Math.random();
  if (k < 0.18) { // a siren, far away (sometimes two, out of step): a real wail through a horn, its echo off the town
    farSiren(t, farPos(300, 600), 10 + Math.random() * 6); if (Math.random() < 0.3) farSiren(t + 1.3 + Math.random() * 2, farPos(300, 600), 9 + Math.random() * 5);
  } else if (k < 0.27 && set !== 'city' && set !== 'jungle') { // dogs left behind in the yards: barking at something, howling at night
    const p = outPos(160, 320); if (nightK > 0.5 && Math.random() < 0.35) howl(t, p, 0.05); else bark(t, p, 0.07, Math.random() < 0.4);
  } else if (k < 0.32 && nightK < 0.35) { // crows: the dead town feeds them
    crow(t, outPos(90, 200), 0.05, 2 + Math.floor(Math.random() * 4));
  } else if (k < 0.34) { // gunfire across town: someone else is still alive
    const p = farPos(200, 500), n = 1 + Math.floor(Math.random() * 6);
    for (let i = 0; i < n; i++) { const tt = i * (0.25 + Math.random() * 0.6); if (hasReal('gun_far')) rs('gun_far', { pos: p, gain: 0.5, delay: tt, lp: 1500, ref: 80, roll: 1, dest: occ || sfxBus, verb: 0.35 }); else burst(t + tt, { f: 600, q: 0.6, d: 0.12, g: 0.3, pos: p, ref: 60 }); }
  } else if (k < 0.46) { // a scream
    const p = farPos(120, 300); if (hasReal('z_yell')) { rs('z_yell', { pos: p, gain: 0.5, lp: 2500, ref: 40, rate: 0.9, dest: occ || sfxBus, verb: 0.3 }); return; } zthroat(t + 0.1, p, { f0: 600 + Math.random() * 200, f1: 380, dur: 1.4, vowel: 'aa', vowel2: 'eh', gain: 0.25, rasp: 0.3, scream: 0.7, jitter: 0.06 });
  } else if (k < 0.66 && hasReal('z_moan')) { // the dead, out past the fence where you can't see them (nothing inside town moans without a body)
    rs('z_moan', { pos: outPos(130, 220), gain: 0.6, lp: 1400, ref: 30, rate: 0.85, dest: occ || sfxBus });
  } else if (k < 0.85) { // a helicopter passing far off — it isn't coming for you
    const p = farPos(250, 400), s = ctx.createBufferSource(); s.buffer = brownBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300;
    const am = ctx.createGain(); am.gain.value = 0.5; const l = ctx.createOscillator(); l.frequency.value = 11; const lg = ctx.createGain(); lg.gain.value = 0.5; l.connect(lg).connect(am.gain);
    const e = ctx.createGain(); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(0.35, t + 5); e.gain.linearRampToValueAtTime(0, t + 12);
    s.connect(f).connect(am).connect(e).connect(at(p, occ || sfxBus, 60, 1)); s.start(t); l.start(t); s.stop(t + 12.2); l.stop(t + 12.2);
  } else if (nightK > 0.5) { // an owl
    const p = outPos(130, 200); for (let i = 0; i < 2; i++) { const tt = t + i * 0.5; const o = ctx.createOscillator(); o.frequency.setValueAtTime(420, tt); o.frequency.linearRampToValueAtTime(380, tt + 0.35); const e = ctx.createGain(); e.gain.setValueAtTime(0, tt); e.gain.linearRampToValueAtTime(0.04, tt + 0.05); e.gain.exponentialRampToValueAtTime(0.0001, tt + 0.4); o.connect(e).connect(at(p, occ || sfxBus, 60)); o.start(tt); o.stop(tt + 0.45); }
  }
}
// ---------------------------------------------------------------- [realism] the living soundscape
// The room you're in: outdoors the shots echo off the houses; indoors a room's dense reflections take over and the
// world outside (birds, sirens, wind, far guns) comes through the walls dull.
function envTick(t) {
  const k = indoor;
  if (outSend) outSend.gain.setTargetAtTime(0.22 * (1 - 0.75 * k), t, 0.3);
  if (roomSend) roomSend.gain.setTargetAtTime(0.16 * k, t, 0.3);
  if (fvRet) fvRet.gain.setTargetAtTime(0.55 * (1 - 0.45 * k), t, 0.3);
  if (occF) occF.frequency.setTargetAtTime(20000 * Math.pow(0.045, k), t, 0.3);   // indoors: ~900 Hz
}
let gust = 0.4, gustTo = 0.4, quietT = 0;
const TREES = { suburb: 1, jungle: 1.4, desert: 0.12, prison: 0.3, city: 0.35 };
function windGust(set) {
  if (Math.random() < 0.09) gustTo = Math.pow(Math.random(), 1.5) * (set === 'desert' ? 1.25 : 1);
  gust += (gustTo - gust) * 0.2;
  return gust;
}
export function hush(sec = 8) { if (ctx) quietT = Math.max(quietT, ctx.currentTime + sec); }   // a loud bang: the crickets and birds go quiet for a while
// looped beds built once from code (no files): field crickets, a far trill chorus, cicadas, tree frogs
function synthBuf(sec, sr, fill) { const b = ctx.createBuffer(1, Math.floor(sec * sr), sr); fill(b.getChannelData(0), sr, b.length); return b; }
function cricketBuf(f, every, pulses) {   // a field cricket: chirps of 3-5 sine pulses (~4.5 kHz), ~2-3 chirps a second, never quite even
  return synthBuf(5.3 + Math.random() * 1.4, 22050, (d, sr, n) => {
    let t0 = Math.random() * every;
    while (t0 < n / sr - 0.3) {
      const amp = 0.6 + Math.random() * 0.4, ff = f * (0.99 + Math.random() * 0.02);
      for (let p = 0; p < pulses; p++) {
        const ps = Math.floor((t0 + p * 0.034) * sr), pl = Math.floor(0.019 * sr);
        for (let i = 0; i < pl && ps + i < n; i++) { const e = Math.sin(Math.PI * i / pl); d[ps + i] += Math.sin(2 * Math.PI * ff * (1 - 0.03 * i / pl) * i / sr) * e * e * amp * (p === 0 ? 0.7 : 1); }
      }
      t0 += every * (0.85 + Math.random() * 0.3);
    }
  });
}
function trillBuf() {   // tree crickets / katydids far off: a continuous pulsing shimmer that swells and fades
  return synthBuf(7.7, 22050, (d, sr, n) => {
    const f1 = 2850, f2 = 3420;
    for (let i = 0; i < n; i++) { const t = i / sr, pulse = Math.max(0, Math.sin(2 * Math.PI * 46 * t)), sw = 0.55 + 0.45 * Math.sin(2 * Math.PI * t / n * sr * 2); d[i] = (Math.sin(2 * Math.PI * f1 * t) * 0.6 + Math.sin(2 * Math.PI * f2 * t + 1) * 0.4) * pulse * pulse * sw * 0.5; }
  });
}
function cicadaBuf() {   // a cicada: a buzzing whine that swells for a few seconds, holds, then cuts off; a pause; again
  return synthBuf(9.4, 22050, (d, sr, n) => {
    const on = 6.2, ph = Math.random() * 6;
    for (let i = 0; i < n; i++) {
      const t = i / sr; if (t > on) break;
      const env = Math.min(1, t / 2.6) * (t > on - 0.5 ? (on - t) / 0.5 : 1), buzz = 0.5 + 0.5 * Math.sign(Math.sin(2 * Math.PI * 172 * t + ph)) * 0.8;
      d[i] = (Math.sin(2 * Math.PI * 4300 * t) * 0.5 + Math.sin(2 * Math.PI * 5650 * t + 0.4) * 0.3 + (Math.random() * 2 - 1) * 0.35) * buzz * env * 0.55;
    }
  });
}
function frogBuf() {   // tree frogs: two-note 'ko-KEE' calls and rattling croaks, scattered
  return synthBuf(8.6, 22050, (d, sr, n) => {
    const call = (t0, f0, f1, len, rough, g) => { const s0 = Math.floor(t0 * sr), L0 = Math.floor(len * sr); let ph = 0; for (let i = 0; i < L0 && s0 + i < n; i++) { const k = i / L0, f = f0 + (f1 - f0) * k; ph += 2 * Math.PI * f / sr; const e = Math.sin(Math.PI * k) ** 0.6, am = rough ? 0.5 + 0.5 * Math.sign(Math.sin(2 * Math.PI * 85 * i / sr)) : 1; d[s0 + i] += (Math.sin(ph) + 0.3 * Math.sin(2 * ph)) * e * am * g; } };
    for (let t = Math.random() * 0.4; t < n / sr - 0.6; t += 0.25 + Math.random() * 0.7) {
      if (Math.random() < 0.55) { const g = 0.25 + Math.random() * 0.5, b = 0.9 + Math.random() * 0.25; call(t, 1050 * b, 1150 * b, 0.09, false, g); call(t + 0.13, 1900 * b, 2250 * b, 0.12, false, g); }
      else { const g = 0.2 + Math.random() * 0.3; for (let r = 0; r < 3; r++) call(t + r * 0.11, 620 + Math.random() * 80, 560, 0.07, true, g); }
    }
  });
}
let BEDS = null;
function bed(buf, pan) { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; const g = ctx.createGain(); g.gain.value = 0; const p = ctx.createStereoPanner(); p.pan.value = pan; s.connect(g).connect(p).connect(occ || sfxBus); s.start(ctx.currentTime + 0.05, Math.random() * buf.duration); return g; }
function living(t, set) {
  if (!BEDS) BEDS = { cr: [bed(cricketBuf(4500, 0.36, 4), -0.6), bed(cricketBuf(4150, 0.47, 3), 0.55), ...(LOWP ? [] : [bed(cricketBuf(4800, 0.29, 5), 0.1)])], tr: bed(trillBuf(), 0), ci: bed(cicadaBuf(), 0.3), fr: bed(frogBuf(), -0.2) };
  const hr = (typeof window !== 'undefined' && window.ZA && window.ZA.G && typeof window.ZA.G.hour === 'number') ? window.ZA.G.hour % 24 : hour;
  const night = Math.min(1, Math.max(0, (nightK - 0.25) / 0.5)), day = 1 - Math.min(1, nightK / 0.35);
  const q = t < quietT ? 0.15 : 1, rain = rainA && rainA.k > 0.3 ? 0.35 : 1, open = 1 - indoor * 0.5, tau = t < quietT ? 0.4 : 3;
  const crK = { suburb: 1, desert: 0.8, jungle: 0.6, prison: 0.5, city: 0.35 }[set] ?? 0.7;
  BEDS.cr.forEach((g, i) => g.gain.setTargetAtTime(0.03 * crK * night * q * rain * open * (i === 2 ? 0.6 : 1), t, tau));
  BEDS.tr.gain.setTargetAtTime(0.022 * ({ jungle: 1.6, suburb: 0.7, desert: 0.3 }[set] || 0.25) * night * q * rain * open, t, tau);
  const warm = hr > 10 && hr < 19.5 ? 1 : 0;
  BEDS.ci.gain.setTargetAtTime(0.02 * ({ desert: 1, jungle: 0.9, suburb: 0.35 }[set] || 0.15) * day * warm * q * rain * open, t, tau);
  BEDS.fr.gain.setTargetAtTime(0.03 * ({ jungle: 1, prison: 0.3, suburb: 0.12 }[set] || 0) * night * q * open, t, tau);
  // the leaves overhead hiss with each gust (a second, bright layer of the wind)
  if (!leafG && occ) { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 3800; f.Q.value = 0.5; leafG = ctx.createGain(); leafG.gain.value = 0; s.connect(f).connect(leafG).connect(occ); s.start(0, Math.random() * 3); }
  if (leafG) leafG.gain.setTargetAtTime(0.045 * (TREES[set] ?? 0.5) * Math.pow(gust, 1.6) * (1 - indoor * 0.6), t, 0.9);
  // birds by day: a dawn chorus at first light, fewer at midday, more again towards evening; fewer once the town's dead
  if (mode === 'play' && nightK < 0.35 && t > quietT && !(rainA && rainA.k > 0.5)) {
    const dawn = hr > 5 && hr < 9 ? 2.4 : hr > 16.5 && hr < 20 ? 1.5 : 1, calm = peace > 0.5 ? 1 : 0.55;
    if (Math.random() < 0.16 * dawn * calm * (LOWP ? 0.6 : 1)) {
      const p = { x: L.x + (Math.random() - 0.5) * 70, y: 5 + Math.random() * 6, z: L.z + (Math.random() - 0.5) * 70 }, r = Math.random();
      if (set === 'jungle') { if (r < 0.5) warble(t, p, 0.03, 2600); else if (r < 0.75) whistle(t, p, 0.03); else chirp(t, p, 2200 + Math.random() * 2600, 3 + Math.floor(Math.random() * 4), 0.025); }
      else if (r < 0.4) warble(t, p, 0.022 + Math.random() * 0.015, 2000 + Math.random() * 900);
      else if (r < 0.55 && set !== 'prison') dove(t, outPos(40, 90), 0.05);
      else if (r < 0.62 && set === 'suburb') woodpecker(t, outPos(50, 110), 0.12);
      else chirp(t, p, 2600 + Math.random() * 2400, 2 + Math.floor(Math.random() * 5), 0.018 + Math.random() * 0.02);
    }
  }
}
let leafG = null;
// one bird call through a single positional node (all its notes share it)
function callBus(p, g = 1, ref = 12) { const b = ctx.createGain(); b.gain.value = g; b.connect(at(p, occ || sfxBus, ref)); return b; }
function warble(t, p, g, base) {   // a robin-like phrase: 4-9 quick sliding whistled notes
  const bus = callBus(p, 1); const n = 4 + Math.floor(Math.random() * 6); let tt = t;
  for (let i = 0; i < n; i++) {
    const f1 = base * (0.85 + Math.random() * 0.55), f2 = f1 * (0.7 + Math.random() * 0.6), d = 0.06 + Math.random() * 0.1;
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(f1, tt); o.frequency.exponentialRampToValueAtTime(f2, tt + d);
    const e = ctx.createGain(); e.gain.setValueAtTime(0, tt); e.gain.linearRampToValueAtTime(g * (0.6 + Math.random() * 0.4), tt + 0.012); e.gain.exponentialRampToValueAtTime(0.0001, tt + d);
    o.connect(e).connect(bus); o.start(tt); o.stop(tt + d + 0.02); tt += d + 0.03 + Math.random() * 0.07;
  }
}
function whistle(t, p, g) {   // a long falling jungle whistle, two or three times
  const bus = callBus(p, 1, 20);
  for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) { const tt = t + i * 0.7, f = 2400 + Math.random() * 900; const o = ctx.createOscillator(); o.frequency.setValueAtTime(f, tt); o.frequency.exponentialRampToValueAtTime(f * 0.62, tt + 0.45); const e = ctx.createGain(); e.gain.setValueAtTime(0, tt); e.gain.linearRampToValueAtTime(g, tt + 0.04); e.gain.setValueAtTime(g, tt + 0.3); e.gain.exponentialRampToValueAtTime(0.0001, tt + 0.5); o.connect(e).connect(bus); o.start(tt); o.stop(tt + 0.52); }
}
function dove(t, p, g) {   // a mourning dove: 'coo-OOO-oo ... oo ... oo', soft and hollow
  const bus = ctx.createGain(); bus.gain.value = 1; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100; bus.connect(lp).connect(at(p, occ || sfxBus, 20));
  const b = 0.92 + Math.random() * 0.12;
  for (const [o0, d, f0, f1, f2, a] of [[0, 0.32, 470, 540, 520, 0.6], [0.42, 0.62, 560, 640, 470, 1], [1.25, 0.42, 470, 455, 430, 0.8], [1.9, 0.42, 470, 455, 430, 0.75], [2.55, 0.4, 465, 450, 425, 0.7]]) {
    const tt = t + o0, o = ctx.createOscillator(); o.frequency.setValueAtTime(f0 * b, tt); o.frequency.linearRampToValueAtTime(f1 * b, tt + d * 0.4); o.frequency.linearRampToValueAtTime(f2 * b, tt + d);
    const h = ctx.createGain(); h.gain.value = 0.15; const o2 = ctx.createOscillator(); o2.frequency.setValueAtTime(f0 * b * 2, tt); o2.frequency.linearRampToValueAtTime(f1 * b * 2, tt + d * 0.4); o2.frequency.linearRampToValueAtTime(f2 * b * 2, tt + d);
    const e = ctx.createGain(); e.gain.setValueAtTime(0, tt); e.gain.linearRampToValueAtTime(g * a, tt + 0.08); e.gain.setValueAtTime(g * a, tt + d - 0.12); e.gain.linearRampToValueAtTime(0, tt + d);
    o.connect(e); o2.connect(h).connect(e); e.connect(bus); o.start(tt); o2.start(tt); o.stop(tt + d + 0.02); o2.stop(tt + d + 0.02);
  }
}
function woodpecker(t, p, g) {   // a drum roll on a dead trunk: fast knocks, slowing and fading
  const bus = callBus(p, 1, 20), n = 12 + Math.floor(Math.random() * 10), rate = 15 + Math.random() * 6;
  for (let i = 0; i < n; i++) { const tt = t + i / (rate * (1 - i / n * 0.25)); thump(tt, 1500, 650, 0.022, g * (1 - i / n * 0.6), { dest: bus, type: 'triangle' }); }
}
function crow(t, p, g, n) {   // carrion crows: harsh, nasal 'caaw's
  const bus = ctx.createGain(); bus.gain.value = g; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3600; bus.connect(lp).connect(at(p, occ || sfxBus, 25));
  const vs = ctx.createGain(); vs.gain.value = 0.5; bus.connect(vs).connect(farVerb);
  const f0 = 540 + Math.random() * 90;
  for (let i = 0; i < n; i++) {
    const tt = t + i * (0.42 + Math.random() * 0.18), d = 0.24 + Math.random() * 0.1;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f0 * 0.92, tt); o.frequency.linearRampToValueAtTime(f0, tt + 0.05); o.frequency.exponentialRampToValueAtTime(f0 * 0.8, tt + d);
    const am = ctx.createGain(); am.gain.value = 0.65; const r = ctx.createOscillator(); r.type = 'square'; r.frequency.value = 70 + Math.random() * 20; const rg = ctx.createGain(); rg.gain.value = 0.35; r.connect(rg).connect(am.gain);
    const e = ctx.createGain(); e.gain.setValueAtTime(0, tt); e.gain.linearRampToValueAtTime(1, tt + 0.02); e.gain.setValueAtTime(0.9, tt + d * 0.6); e.gain.exponentialRampToValueAtTime(0.0001, tt + d);
    o.connect(am);
    for (const [f, q, a] of [[1250, 4, 1], [2100, 5, 0.6], [3100, 6, 0.25]]) { const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q; const bg = ctx.createGain(); bg.gain.value = a * 2.4; am.connect(bp).connect(bg).connect(e); }
    e.connect(bus); o.start(tt); r.start(tt); o.stop(tt + d + 0.02); r.stop(tt + d + 0.02);
  }
}
function bark(t, p, g, big) {   // a dog in a yard a few streets over: short sharp 'woofs', echoing off the houses
  const bus = ctx.createGain(); bus.gain.value = g; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400; bus.connect(lp).connect(at(p, occ || sfxBus, 40));
  const vs = ctx.createGain(); vs.gain.value = 0.7; bus.connect(vs).connect(farVerb);
  const n = 2 + Math.floor(Math.random() * 4), f0 = (big ? 250 : 410) * (0.92 + Math.random() * 0.16); let tt = t;
  for (let i = 0; i < n; i++) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f0 * 0.8, tt); o.frequency.linearRampToValueAtTime(f0 * 1.18, tt + 0.03); o.frequency.exponentialRampToValueAtTime(f0 * 0.65, tt + 0.17);
    const e = ctx.createGain(); e.gain.setValueAtTime(0, tt); e.gain.linearRampToValueAtTime(1, tt + 0.006); e.gain.setValueAtTime(0.85, tt + 0.045); e.gain.exponentialRampToValueAtTime(0.0001, tt + 0.18);
    for (const [f, q, a] of [[big ? 560 : 720, 3, 1], [big ? 1200 : 1550, 4, 0.55]]) { const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q; const bg = ctx.createGain(); bg.gain.value = a * 2.5; o.connect(bp).connect(bg).connect(e); }
    e.connect(bus); o.start(tt); o.stop(tt + 0.2);
    burst(tt, { f: big ? 900 : 1300, q: 0.9, a: 0.004, d: 0.07, g: 0.35, dest: bus });
    tt += (i % 3 === 2 ? 0.7 : 0.26) + Math.random() * 0.2;
  }
}
function howl(t, p, g) {   // a dog howling at night, far away: rising, holding, sliding down, with the echo hanging after it
  const bus = ctx.createGain(); bus.gain.value = g; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800; bus.connect(lp).connect(at(p, occ || sfxBus, 60));
  const vs = ctx.createGain(); vs.gain.value = 1; bus.connect(vs).connect(farVerb);
  const b = 0.9 + Math.random() * 0.2, d = 2.6 + Math.random() * 1.2;
  const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(400 * b, t); o.frequency.linearRampToValueAtTime(590 * b, t + 0.6); o.frequency.linearRampToValueAtTime(560 * b, t + d * 0.7); o.frequency.exponentialRampToValueAtTime(380 * b, t + d);
  const v = ctx.createOscillator(); v.frequency.value = 5 + Math.random(); const vg = ctx.createGain(); vg.gain.value = 7; v.connect(vg).connect(o.frequency);
  const e = ctx.createGain(); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(1, t + 0.35); e.gain.setValueAtTime(1, t + d * 0.75); e.gain.linearRampToValueAtTime(0, t + d);
  for (const [f0, f1, q, a] of [[650, 800, 5, 1], [1050, 1250, 6, 0.4]]) { const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = q; bp.frequency.setValueAtTime(f0, t); bp.frequency.linearRampToValueAtTime(f1, t + d * 0.6); const bg = ctx.createGain(); bg.gain.value = a * 3; o.connect(bp).connect(bg).connect(e); }
  e.connect(bus); o.start(t); v.start(t); o.stop(t + d + 0.05); v.stop(t + d + 0.05);
}
// tests / ?audiotest: play one far-off call now (kind: bark|howl|crow|dove|warble|woodpecker|whistle|siren|plip)
export function ambTest(kind, r = 120) {
  if (!ctx) return; const t = ctx.currentTime + 0.05, p = { x: L.x + r, y: 6, z: L.z };
  ({ bark: () => bark(t, p, 0.07, false), howl: () => howl(t, p, 0.05), crow: () => crow(t, p, 0.05, 3), dove: () => dove(t, p, 0.05), warble: () => warble(t, p, 0.03, 2300), woodpecker: () => woodpecker(t, p, 0.12), whistle: () => whistle(t, p, 0.03), siren: () => farSiren(t, p, 12), plip: () => { for (let i = 0; i < 20; i++) plip(t + i * 0.1, 0, 0.03); } }[kind] || (() => { }))();
}
export const ambState = () => BEDS ? { cr: BEDS.cr.map(g => +g.gain.value.toFixed(4)), tr: +BEDS.tr.gain.value.toFixed(4), ci: +BEDS.ci.gain.value.toFixed(4), fr: +BEDS.fr.gain.value.toFixed(4), leaf: leafG ? +leafG.gain.value.toFixed(4) : 0, occ: occF ? Math.round(occF.frequency.value) : 0, room: roomSend ? +roomSend.gain.value.toFixed(3) : 0, gust: +gust.toFixed(2) } : null;
function farSiren(t, p, dur) {   // a far emergency siren: the slow wail (up ~2 s, down ~3 s) through a horn, drifting as it drives
  const o = ctx.createOscillator(); o.type = 'sawtooth'; const o2 = ctx.createOscillator(); o2.type = 'square'; const g2 = ctx.createGain(); g2.gain.value = 0.3; o2.connect(g2);
  const lo = 640 + Math.random() * 40, hi = 1320 + Math.random() * 80, cyc = 4.6 + Math.random() * 1.2;
  for (const osc of [o, o2]) { osc.frequency.setValueAtTime(lo, t); for (let c = 0; c * cyc < dur; c++) { const c0 = t + c * cyc; osc.frequency.linearRampToValueAtTime(hi, c0 + cyc * 0.42); osc.frequency.exponentialRampToValueAtTime(lo, c0 + cyc); } osc.detune.setValueAtTime(25, t); osc.detune.linearRampToValueAtTime(-25, t + dur); }
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2200; const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 480;
  const e = ctx.createGain(); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(0.05, t + 2.5); e.gain.setValueAtTime(0.05, t + dur - 3); e.gain.linearRampToValueAtTime(0, t + dur);
  o.connect(f); g2.connect(f); f.connect(hp).connect(e).connect(at(p, occ || sfxBus, 60, 1));
  const vs = ctx.createGain(); vs.gain.value = 0.6; e.connect(vs).connect(farVerb);
  o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
}
// ---------------------------------------------------------------- per-map ambience (recordings only; a missing file just stays quiet)
let ambName = null, ambMapT = 0, stad = null, stadTried = false, stadBed = null, hour = 12, bellDay = -1;
export function setAmbient(name) { ambName = name || null; }   // main.js may call it after the map builds; otherwise read from the world
export function setHour(h) { hour = h; }
export const ambDebug = () => ({ set: ambSet(), stadium: !!stad, crowd: stadBed ? [stadBed.talk && +stadBed.talk.g.gain.value.toFixed(2), stadBed.roar && +stadBed.roar.g.gain.value.toFixed(2)] : null });
function ambSet() {
  if (ambName) return ambName;
  const Z = typeof window !== 'undefined' && window.ZA, w = Z && Z.world;
  return (w && (w.ambient || (w.W && w.W.ambient))) || 'suburb';
}
function loopBed(cat, pos, ref = 30) {   // a real recording looped (with its own random start), positional or not; gain starts at 0
  if (!hasReal(cat)) return null;
  const L2 = R[cat], s = ctx.createBufferSource(); s.buffer = L2[Math.floor(Math.random() * L2.length)]; s.loop = true;
  const g = ctx.createGain(); g.gain.value = 0; s.connect(g).connect(out(pos, sfxBus, 0, ref, 0.7)); s.start(ctx.currentTime + 0.05, Math.random() * s.buffer.duration);
  return { s, g };
}
function mapAmb(set, t) {
  const calm = peace > 0.5, open = 1 - indoor * 0.75;
  if (set === 'desert') {   // dry wind (stronger, higher), a far dog, cicadas by day, a chapel bell at noon
    windG.gain.setTargetAtTime((0.2 + Math.sin(t * 0.17) * 0.08) * (1 - indoor * 0.7), t, 1.5);
    windF.frequency.setTargetAtTime(520 + Math.sin(t * 0.11) * 200, t, 1.5);
    if (hasReal('cicada') && nightK < 0.4 && Math.random() < 0.15) rs('cicada', { pos: outPos(60, 140), gain: 0.25 * open, ref: 30, lp: 6000 });
    const day = Math.floor(Date.now() / 3.6e6);
    if (hasReal('bell') && hour >= 12 && hour < 12.1 && bellDay !== day) { bellDay = day; for (let i = 0; i < 12; i++) rs('bell', { pos: outPos(180, 260), gain: 0.45, delay: i * 2.6, ref: 80, vary: 0 }); }
  }
  if (set === 'jungle' && hasReal('insects') && Math.random() < 0.3) rs('insects', { pos: { x: L.x + (Math.random() - 0.5) * 40, y: 2, z: L.z + (Math.random() - 0.5) * 40 }, gain: 0.3 * open, ref: 15 });
  ambMapT -= 0.5; if (ambMapT > 0) return; ambMapT = 6 + Math.random() * 12;
  const k = Math.random();
  if (set === 'desert') { if (k < 0.35 && hasReal('dog')) rs('dog', { pos: outPos(160, 280), gain: 0.4, lp: 1600, ref: 50 }); }
  else if (set === 'jungle') { if (k < 0.6) for (let i = 0; i < 3; i++) chirp(t + i * 0.7 + Math.random() * 0.4, { x: L.x + (Math.random() - 0.5) * 60, y: 10, z: L.z + (Math.random() - 0.5) * 60 }, 1800 + Math.random() * 2600, 3 + Math.floor(Math.random() * 4), 0.025 * open); }
  else if (set === 'prison') {   // steel doors slamming somewhere in the blocks, echoing; a PA crackle; the river outside
    const p = { x: L.x + (Math.random() - 0.5) * 80, y: 2, z: L.z + (Math.random() - 0.5) * 80 };
    if (k < 0.45 && hasReal('door_bang')) rs('door_bang', { pos: p, gain: 0.55, lp: 2400, ref: 12, rate: 0.85, room: 0.6 });
    else if (k < 0.7 && hasReal('metal_hit')) rs('metal_hit', { pos: p, gain: 0.35, lp: 2000, ref: 12, rate: 0.8, room: 0.5 });
    else if (k < 0.85 && hasReal('v_radio')) paClip('v_radio', null, p);
    if (hasReal('hum') && indoor > 0.5 && Math.random() < 0.5) rs('hum', { gain: 0.15, dur: 8 });
  } else if (set === 'city') {   // the stadium: crowd beds while the match is on (see stadiumCrowd), traffic hiss far off otherwise
    if (!calm && k < 0.3 && hasReal('v_crowd')) rs('v_crowd', { pos: outPos(160, 260), gain: 0.35, lp: 1400, ref: 50 });
  }
  if (set === 'city') stadiumCrowd(t);
}
// Harbor City Stadium on the calm evening: a crowd bed (real CC0 crowd recordings) that roars when STADIUM.goalT > 0
function stadiumCrowd(t) {
  if (!stadTried) { stadTried = true; import('./maps/stadium.js').then(m => { stad = m.STADIUM; }).catch(() => { }); }
  const S = stad, on = S && S.crowd && peace > 0.3;
  if (on && !stadBed) stadBed = { talk: loopBed('v_murmur', { x: 0, y: 8, z: 0 }, 60), roar: loopBed('v_crowd', { x: 0, y: 8, z: 0 }, 60) };
  if (!stadBed) return;
  const goal = S && S.goalT > 0, k = 1 - indoor * 0.6;
  if (stadBed.talk) stadBed.talk.g.gain.setTargetAtTime(on ? 0.55 * k : 0, t, on ? 1.5 : 0.25);
  if (stadBed.roar) stadBed.roar.g.gain.setTargetAtTime(on ? (goal ? 1.1 : 0.18) * k : 0, t, goal ? 0.25 : 1.2);
}
// a public-address speaker: a real recorded voice (v_news announcer / v_radio) through a horn-shaped band, echoing off concrete
let paBus = null;
function paClip(cat, idx, pos = null) {
  const L2 = R[cat]; if (!L2 || !L2.length) return 0;
  if (!paBus) { paBus = ctx.createGain(); paBus.gain.value = 0.9; const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 400; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3800; const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 1800; pk.gain.value = 6; pk.Q.value = 1; paBus.connect(hp).connect(pk).connect(lp); lp.connect(sfxBus); const ev = ctx.createGain(); ev.gain.value = 0.7; lp.connect(ev).connect(farVerb); }
  const buf = L2[idx == null ? Math.floor(Math.random() * L2.length) : idx % L2.length], s = ctx.createBufferSource(); s.buffer = buf;
  const d = pos ? dist(pos) : 0; s.connect(out(pos, paBus, 0, 20, 0.6)); s.start(ctx.currentTime + 0.05 + d / 343);
  if (vLog) vLog.push({ kind: 'pa', cat, len: +buf.duration.toFixed(2), t: +ctx.currentTime.toFixed(2) });
  return buf.duration;
}
// the PA variant of the noon broadcast (prison alarm, stadium announcer): the same recorded announcer over the tannoy
export function paVoice(part = 'bulletin') { if (!ctx || !hasReal('v_news')) return 0; let t = 0; for (const k of part === 'bulletin' ? [0, 6, 2] : [1]) t += paClip('v_news', k); return t; }
export function setMode(m) { mode = m; if (m === 'title') { tvSeq = 0; ambName = null; } }
export function setMusic(v) { S.music = v; if (musicBus) musicBus.gain.setTargetAtTime(v * 1.3, ctx.currentTime, 0.3); }
export function setSfx(v) { S.sfx = v; if (sfxBus) sfxBus.gain.setTargetAtTime(v, ctx.currentTime, 0.1); }
export function pause(p) {
  paused = p; if (!ctx) return;
  duck.gain.setTargetAtTime(p ? 0.15 : 1, ctx.currentTime, 0.1);
  if (breathG) breathG.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
}

// ---------------------------------------------------------------- the score
// D minor. Calm: a cold low drone and a lonely, out-of-tune piano. Tension (they're near): a high string
// tremolo, a slow pulse. Chase (they're on you): pounding low toms, a driving bass ostinato, dissonant brass.
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
let droneG, tenseG, chaseG, tenseOn = false, chaseOn = false, intensity = 0, intTarget = 0, step16 = 0, nextT = 0, musicOn = true, BPM = 84, SIX = 60 / 84 / 4;
const PROG = [[38, [50, 53, 57]], [34, [46, 50, 53]], [36, [48, 51, 55]], [37, [49, 52, 56]]];   // Dm, Bb, Cm(!), C#dim-ish: never settles
export function setIntensity(x) { intTarget = Math.max(0, Math.min(1, x)); }
export function musicPlaying(on) { musicOn = on; }
function music() {
  droneG = ctx.createGain(); droneG.gain.value = 0; droneG.connect(musicBus);
  tenseG = ctx.createGain(); tenseG.gain.value = 0; tenseG.connect(musicBus);
  chaseG = ctx.createGain(); chaseG.gain.value = 0; chaseG.connect(musicBus);
  // the drone never stops: two detuned saws through a slowly breathing filter
  for (const [m, det] of [[26, -7], [26, 6], [33, 3], [38, -4]]) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(m); o.detune.value = det;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220; f.Q.value = 2;
    const l = ctx.createOscillator(); l.frequency.value = 0.04 + Math.random() * 0.05; const lg = ctx.createGain(); lg.gain.value = 120; l.connect(lg).connect(f.frequency);
    const g = ctx.createGain(); g.gain.value = 0.03;
    o.connect(f).connect(g).connect(droneG); o.start(); l.start();
  }
  // the tension tremolo: a high cluster, trembling
  for (const m of [74, 75, 81]) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(m);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = hz(m) * 1.5; f.Q.value = 1.5;
    const am = ctx.createGain(); am.gain.value = 0.5; const l = ctx.createOscillator(); l.frequency.value = 9 + Math.random() * 3; const lg = ctx.createGain(); lg.gain.value = 0.5; l.connect(lg).connect(am.gain);
    const g = ctx.createGain(); g.gain.value = 0.012;
    o.connect(f).connect(am).connect(g).connect(tenseG); o.start(); l.start();
  }
  nextT = ctx.currentTime + 0.3;
  setInterval(() => {
    if (!ctx) return;
    intensity += (intTarget - intensity) * (intTarget > intensity ? 0.12 : 0.02);
    const on = musicOn && mode !== 'title' ? 1 : mode === 'title' ? 0.8 : 0;
    const now = ctx.currentTime;
    droneG.gain.setTargetAtTime(paused ? 0.4 : on * (0.9 - intensity * 0.3), now, 0.8);
    const tg = paused ? 0 : on * Math.max(0, Math.min(1, (intensity - 0.2) * 2.2)) * (1 - Math.max(0, intensity - 0.75) * 2), cg = paused ? 0 : on * Math.max(0, (intensity - 0.6) * 2.5);
    tenseOn = tg > 0.01; chaseOn = cg > 0.01;
    tenseG.gain.setTargetAtTime(tg, now, 0.6);
    chaseG.gain.setTargetAtTime(cg, now, 0.35);
    while (nextT < now + 0.35) { sched(nextT, step16); nextT += SIX; step16++; }
  }, 90);
}
function sched(t, s) {
  const bar = Math.floor(s / 16), pos = s % 16, [root, ch] = PROG[Math.floor(bar / 2) % 4];
  if (!musicOn) return;
  // a lonely piano: a few notes, never quite a melody
  if (pos % 4 === 0 && Math.random() < 0.28 + (mode === 'title' ? 0.2 : 0)) piano(t, ch[Math.floor(Math.random() * 3)] + 12 + (Math.random() < 0.3 ? 12 : 0), 0.05 * (1 - intensity * 0.6));
  if (pos === 0 && bar % 4 === 0) piano(t, root + 12, 0.045);
  // tension: a slow heartbeat pulse
  if ((pos === 0 || pos === 3) && (tenseOn || tenseG.gain.value > 0.005)) kick(t, 0.25, tenseG, pos === 0 ? 1 : 0.9);
  // chase (no nodes at all while its layer is silent: that is most of the time)
  if (!chaseOn && chaseG.gain.value < 0.005) return;
  const Cg = chaseG;
  if (pos % 2 === 0) bassNote(t, root - 12 + [0, 0, 1, 0, 0, 0, 3, 1][pos / 2], SIX * 1.6, 0.18, Cg);
  if (pos === 0 || pos === 6 || pos === 10) tom(t, 0.55, Cg, 1);
  if (pos === 4 || pos === 12) tom(t, 0.4, Cg, 1.6);
  if (pos === 14 || pos === 15) tom(t, 0.3, Cg, 2.1);
  if (pos % 2 === 1) hat(t, 0.04, Cg);
  if (pos === 0 && bar % 2 === 0) brassStab(t, [root + 12, root + 13, root + 19], SIX * 6, 0.05, Cg);
}
function piano(t, m, v) {
  const f = hz(m) * (1 + (Math.random() - 0.5) * 0.006);   // slightly out of tune
  for (const [mul, g, d] of [[1, 1, 3.5], [2, 0.35, 2.2], [3, 0.12, 1.4], [4.02, 0.06, 0.9]]) {
    const o = ctx.createOscillator(); o.type = mul === 1 ? 'triangle' : 'sine'; o.frequency.value = f * mul;
    const e = ctx.createGain(); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(v * g, t + 0.005); e.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(e).connect(droneG); o.start(t); o.stop(t + d + 0.05);
  }
}
function kick(t, v, dest, p = 1) { const o = ctx.createOscillator(); o.frequency.setValueAtTime(70 * p, t); o.frequency.exponentialRampToValueAtTime(35, t + 0.25); const e = ctx.createGain(); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(v, t + 0.005); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.35); o.connect(e).connect(dest); o.start(t); o.stop(t + 0.4); }
function tom(t, v, dest, p = 1) { const o = ctx.createOscillator(); o.frequency.setValueAtTime(120 * p, t); o.frequency.exponentialRampToValueAtTime(50 * p, t + 0.3); const e = ctx.createGain(); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(v, t + 0.004); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.45); o.connect(e).connect(dest); o.start(t); o.stop(t + 0.5); burst(t, { f: 200 * p, q: 0.8, d: 0.18, g: v * 0.35, dest }); }
function hat(t, v, dest) { burst(t, { f: 8000, type: 'highpass', d: 0.03, g: v, dest }); }
function bassNote(t, m, d, v, dest) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(m); const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(600, t); f.frequency.exponentialRampToValueAtTime(150, t + d); const e = ctx.createGain(); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(v, t + 0.01); e.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(f).connect(e).connect(dest); o.start(t); o.stop(t + d + 0.05); }
function brassStab(t, notes, d, v, dest) { for (const m of notes) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(m); const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(400, t); f.frequency.linearRampToValueAtTime(1600, t + 0.1); f.frequency.linearRampToValueAtTime(500, t + d); const e = ctx.createGain(); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(v, t + 0.06); e.gain.linearRampToValueAtTime(0.0001, t + d); o.connect(f).connect(e).connect(dest); o.start(t); o.stop(t + d + 0.05); } }
function swell(t, notes, d, v, dest, type = 'sawtooth') { for (const m of notes) for (const det of [-7, 7]) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = hz(m); o.detune.value = det; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(300, t); f.frequency.linearRampToValueAtTime(1400, t + d * 0.6); const e = ctx.createGain(); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(v, t + d * 0.6); e.gain.linearRampToValueAtTime(0.0001, t + d); o.connect(f).connect(e).connect(dest); o.start(t); o.stop(t + d + 0.05); } }
// stings
export function sting(kind) {
  if (!ctx) return;
  const t = ctx.currentTime + 0.05, D = musicBus;
  if (kind === 'found') { for (const [m, at2] of [[74, 0], [81, 0.09]]) { const o = ctx.createOscillator(); o.frequency.value = hz(m); const e = ctx.createGain(); e.gain.setValueAtTime(0, t + at2); e.gain.linearRampToValueAtTime(0.05, t + at2 + 0.005); e.gain.exponentialRampToValueAtTime(0.0001, t + at2 + 1.2); o.connect(e).connect(D); o.start(t + at2); o.stop(t + at2 + 1.3); } }
  else if (kind === 'objective') { swell(t, [62, 69, 74], 2.5, 0.03, D, 'triangle'); piano(t, 74, 0.08); piano(t + 0.3, 81, 0.07); }
  else if (kind === 'night') { swell(t, [26, 33, 38], 6, 0.06, D); kick(t, 0.6, D, 0.7); kick(t + 3, 0.5, D, 0.6); }
  else if (kind === 'day') { swell(t, [50, 57, 62, 65], 5, 0.03, D, 'triangle'); }
  else if (kind === 'spotted') { brassStab(t, [50, 51, 56], 0.6, 0.07, D); kick(t, 0.5, D); }
  else if (kind === 'grab') { brassStab(t, [62, 63, 68], 0.4, 0.08, D); }
  else if (kind === 'death') { swell(t, [38, 39, 45, 50], 7, 0.07, D); kick(t, 0.8, D, 0.5); kick(t + 1.5, 0.6, D, 0.45); }
  else if (kind === 'win') { swell(t, [50, 57, 62, 66, 69], 7, 0.05, D, 'triangle'); for (let i = 0; i < 4; i++) piano(t + i * 0.4, [62, 66, 69, 74][i], 0.08); }
}
export function debugInfo() {
  if (!meter) return 'audio off';
  const a = new Float32Array(meter.fftSize); meter.getFloatTimeDomainData(a);
  let s = 0, pk = 0; for (const v of a) { s += v * v; pk = Math.max(pk, Math.abs(v)); }
  return `audio ${ctx.state} rec ${Object.values(R).reduce((a, b) => a + b.length, 0)} rms ${Math.sqrt(s / a.length).toFixed(3)} pk ${pk.toFixed(2)} int ${intensity.toFixed(2)}`;
}

// ---------------------------------------------------------------- before it happened, and the moment it did
let peace = 0, mowerG = null, peaceT = 0;
const MOWER = { x: -140, y: 1, z: 60 }, MOWER_G = 0.28;
export function setPeace(k) {
  peace = k; if (!ctx) return;
  if (!mowerG) {   // a two-stroke lawnmower somewhere down the street: brown noise, chopped at the engine's rate
    const s = ctx.createBufferSource(); s.buffer = brownBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 220; f.Q.value = 1.4;
    const am = ctx.createGain(); am.gain.value = 0.6; const l = ctx.createOscillator(); l.type = 'square'; l.frequency.value = 27; const lg = ctx.createGain(); lg.gain.value = 0.4; l.connect(lg).connect(am.gain);
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 54; const og = ctx.createGain(); og.gain.value = 0.05; o.connect(og).connect(f);
    mowerG = ctx.createGain(); mowerG.gain.value = 0;
    // it's in a yard across the creek west of town, past the fence: heard from where it is, never from inside your head
    s.connect(f).connect(am).connect(mowerG).connect(at(MOWER, occ || sfxBus, 25, 1)); s.start(); l.start(); o.start();
    setInterval(() => { if (ctx && mowerG) { l.frequency.setTargetAtTime(25 + Math.sin(ctx.currentTime * 0.4) * 3, ctx.currentTime, 0.5); } }, 500);
  }
  mowerG.gain.setTargetAtTime(k > 0.5 ? MOWER_G * (1 - indoor * 0.8) : 0, ctx.currentTime, 1.2);
}
function chirp(t, p, f0, n, g = 0.03) {
  const bus = callBus(p, 1);   // [realism] one positional node per call (was one per note), through the outside bus
  for (let i = 0; i < n; i++) {
    const tt = t + i * (0.09 + Math.random() * 0.06), o = ctx.createOscillator(); o.type = 'sine';
    const f = f0 * (0.9 + Math.random() * 0.25);
    o.frequency.setValueAtTime(f, tt); o.frequency.exponentialRampToValueAtTime(f * (1.25 + Math.random() * 0.5), tt + 0.05); o.frequency.exponentialRampToValueAtTime(f * 0.85, tt + 0.08);
    const e = ctx.createGain(); e.gain.setValueAtTime(0, tt); e.gain.linearRampToValueAtTime(g, tt + 0.01); e.gain.exponentialRampToValueAtTime(0.0001, tt + 0.09);
    o.connect(e).connect(bus); o.start(tt); o.stop(tt + 0.1);
  }
}
function peaceAmb(t) {
  if (mowerG) mowerG.gain.setTargetAtTime(MOWER_G * (1 - indoor * 0.8), t, 1.2);
  if (Math.random() < 0.55 * (1 - indoor * 0.6)) chirp(t + Math.random() * 0.4, { x: L.x + (Math.random() - 0.5) * 50, y: 6, z: L.z + (Math.random() - 0.5) * 50 }, 2600 + Math.random() * 2400, 2 + Math.floor(Math.random() * 5), 0.02 + Math.random() * 0.02);
  peaceT -= 0.5; if (peaceT > 0) return; peaceT = 4 + Math.random() * 8;
  const k = Math.random();
  // (no dog or kids: those were built from the zombie throat and sounded like the dead; recorded ones can come back as 'dog'/'kids')
  if (k < 0.15 && hasReal('dog')) rs('dog', { pos: outPos(150, 260), gain: 0.5, lp: 1500, ref: 40 });
  else if (k < 0.3 && hasReal('kids')) rs('kids', { pos: outPos(150, 260), gain: 0.4, lp: 1500, ref: 40 });
  else if (k < 0.5) { const p = outPos(150, 300); if (hasReal('door_close')) rs('door_close', { pos: p, gain: 0.5, lp: 1200, ref: 40, dest: occ || sfxBus }); }   // a car door in the next subdivision over
  else if (k < 0.7) { const p = outPos(150, 300), s = ctx.createBufferSource(); s.buffer = brownBuf; s.loop = true; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500; const e = ctx.createGain(); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(0.12, t + 2.5); e.gain.linearRampToValueAtTime(0, t + 6); s.connect(f).connect(e).connect(at(p, occ || sfxBus, 60)); s.start(t); s.stop(t + 6.2); }   // a car going by on the county road past the fence
}
// the Emergency Alert System: the two-tone attention signal, on every phone and TV at once
export function eas(dur = 8) {
  tvSeq = 0;   // a new broadcast (also a second playthrough without a reload): the bulletin from the top
  if (!ctx) return;
  const t = ctx.currentTime + 0.05;
  const g = ctx.createGain(); g.gain.value = 0.0001; g.connect(sfxBus);
  // three bursts of data screech first
  for (let b = 0; b < 3; b++) { const tb = t + b * 1.1; for (let k = 0; k < 18; k++) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = Math.random() < 0.5 ? 2083 : 1563; const e = ctx.createGain(); e.gain.setValueAtTime(0.03, tb + k * 0.04); e.gain.setValueAtTime(0, tb + k * 0.04 + 0.038); o.connect(e).connect(sfxBus); o.start(tb + k * 0.04); o.stop(tb + k * 0.04 + 0.04); } }
  const t2 = t + 3.6;
  for (const f of [853, 960]) { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; const e = ctx.createGain(); e.gain.setValueAtTime(0, t2); e.gain.linearRampToValueAtTime(0.09, t2 + 0.03); e.gain.setValueAtTime(0.09, t2 + dur - 3.8); e.gain.linearRampToValueAtTime(0, t2 + dur - 3.6); const d = ctx.createWaveShaper(); const c = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; c[i] = Math.tanh(x * 2.2); } d.curve = c; o.connect(d).connect(e).connect(sfxBus); o.start(t2); o.stop(t2 + dur); }
}
// the station's breaking-news sting: a brass chord and a timpani hit
export function newsSting() {
  if (!ctx) return;
  const t = ctx.currentTime + 0.05;
  for (const [m, dl] of [[50, 0], [57, 0], [62, 0.0], [66, 0.0], [69, 0.4], [74, 0.4]]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(m); const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(600, t + dl); f.frequency.linearRampToValueAtTime(2600, t + dl + 0.15); const e = ctx.createGain(); e.gain.setValueAtTime(0, t + dl); e.gain.linearRampToValueAtTime(0.035, t + dl + 0.05); e.gain.setValueAtTime(0.035, t + dl + 0.6); e.gain.exponentialRampToValueAtTime(0.0001, t + dl + 2.2); o.connect(f).connect(e).connect(sfxBus); o.start(t + dl); o.stop(t + dl + 2.3); }
  thump(t, 90, 45, 0.6, 0.6); thump(t + 0.4, 80, 40, 0.8, 0.7);
}
// an anchor talking (the murmur of a voice through a TV speaker — the words are on screen)
// Only recordings: the bulletin is the recorded announcer; a short line (dur <= 4.1, e.g. a phone call) is a real clip
// through the phone/TV speaker filter, or just a little line hiss — never a synthesised 'voice'.
export function tvVoice(dur = 6, pos = null, part = null) {
  if (!ctx) return 0;
  if (dur > 4.1) { if (part === null) part = dur >= 5 ? 'after' : null; return tvAnchor(part) ? 1 : 0; }
  return phoneVoice('ok', false);
}
// a phone line: a real recorded word through the small-speaker filter; if there is none, a faint burst of line hiss
export function phoneVoice(kind = 'ok', female = false) {
  if (!ctx) return 0;
  const hit = vcat(kind, female) || vcat('ok', female);
  const t = ctx.currentTime + 0.05;
  if (hit) return tvClip(hit[0], null, t, 0.8);
  burst(t, { f: 2200, q: 0.6, d: 0.25, g: 0.04, type: 'bandpass' }); return 0;
}
// people: a scream, getting hurt, going down
export function scream(pos, pitch = 1, female = null) {
  if (!ctx || paused || dist(pos) > 70) return;
  const delay = dist(pos) / 343;
  // a recorded human voice, never the zombie throat: a woman's higher than a man's
  const each = 1 + (pitch - 1) * 0.5;   // each neighbour's own voice, a little higher or lower
  if (voice('scream', pos, { female: !!female, pitch: each, gain: 0.95, max: 90, pri: 2 })) return;
  if (hasReal('h_scream')) { rs('h_scream', { pos, gain: 0.8, rate: (female === null ? 1 : female ? 1.08 : 0.94) * each, vary: 0.06, delay, ref: 4 }); return; }
  if (hasReal('p_hurt')) { rs('p_hurt', { pos, gain: 0.8, rate: (female === null ? 1.25 : female ? 1.35 : 1.15) * each, vary: 0.05, delay, ref: 4 }); return; }
  const t = ctx.currentTime + 0.02 + delay;
  zthroat(t, pos, { f0: (560 + Math.random() * 160) * pitch, f1: 420 * pitch, dur: 0.9 + Math.random() * 0.6, vowel: 'aa', vowel2: 'eh', gain: 0.32, rasp: 0.15, scream: 0.85, jitter: 0.05, fry: 0 });
}
export function npcHurt(pos, i = 0, female = null) { if (!ctx || paused || dist(pos) > 40) return; if (female !== null && voice('hurt', pos, { female, pitch: 0.95 + (i % 5) * 0.03, pri: 1 })) return; if (hasReal('p_hurt')) rs('p_hurt', { pos, gain: 0.7, rate: 1.0 + (i % 5) * 0.06 }); }
export function npcDeath(pos, i = 0, rate = 1.025, female = null) { if (!ctx || paused || dist(pos) > 50) return; const dl = dist(pos) / 343; if (female !== null && voice('die', pos, { female, pitch: 0.95 + (i % 5) * 0.03, pri: 2 })) { bodyFall(pos, 1, DEATH_HIT / rate); return; } if (hasReal('p_death')) rs('p_death', { pos, gain: 0.7, rate: 1.0 + (i % 5) * 0.05, delay: dl }); bodyFall(pos, 1, DEATH_HIT / rate); }   // rate: their Death_D rate (people.js picks 0.9-1.15)
export function cough(pos, female = false) { if (!ctx || paused) return; if (voice('cough', pos, { female, pri: 1 })) return; const t = ctx.currentTime + 0.02; for (let i = 0; i < 3; i++) { burst(t + i * 0.28, { f: 700, q: 0.8, d: 0.16, g: 0.3, pos }); thump(t + i * 0.28, 160, 90, 0.08, 0.2, { pos }); } }
export function phoneBuzz() { if (!ctx) return; const t = ctx.currentTime + 0.02; for (let i = 0; i < 3; i++) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 160; const e = ctx.createGain(); e.gain.setValueAtTime(0, t + i * 0.55); e.gain.linearRampToValueAtTime(0.05, t + i * 0.55 + 0.02); e.gain.setValueAtTime(0.05, t + i * 0.55 + 0.35); e.gain.linearRampToValueAtTime(0, t + i * 0.55 + 0.38); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400; o.connect(lp).connect(e).connect(sfxBus); o.start(t + i * 0.55); o.stop(t + i * 0.55 + 0.4); } }
export function staticBurst(dur = 1.5) { if (!ctx) return; const t = ctx.currentTime + 0.01; const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; const e = ctx.createGain(); e.gain.setValueAtTime(0.18, t); e.gain.setValueAtTime(0.18, t + dur - 0.2); e.gain.linearRampToValueAtTime(0, t + dur); const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900; s.connect(hp).connect(e).connect(sfxBus); s.start(t, Math.random()); s.stop(t + dur + 0.05); }

// the sound of one thing your hand moves — it always matches what's moving on screen
export function touch(kind, pos = null, how = 'shift') {
  if (!ctx || paused || (pos && dist(pos) > 30)) return;
  const t = ctx.currentTime + 0.01, R = Math.random;
  const ring = (t0, f, d, g) => tone(t0, f, d, g, 'sine', sfxBus, pos, 0.001);
  if (kind === 'can') {            // tin cans: a dull clink, and a roll when one goes over
    thump(t, 420 + R() * 80, 260, 0.05, 0.18, { pos }); ring(t, 2300 + R() * 500, 0.12, 0.05); ring(t + 0.005, 3700 + R() * 600, 0.08, 0.03);
    if (how === 'tip') { const tt = t + 0.3; thump(tt, 380, 200, 0.06, 0.3, { pos }); ring(tt, 2600, 0.18, 0.07); for (let i = 0; i < 4; i++) burst(tt + 0.08 + i * 0.07, { f: 3000, q: 4, d: 0.03, g: 0.05, pos }); }
  } else if (kind === 'jar' || kind === 'bottle') {   // glass: a bright knock that rings a little
    ring(t, 3100 + R() * 900, 0.25, 0.06); ring(t + 0.004, 5200 + R() * 900, 0.14, 0.03); thump(t, 600, 350, 0.03, 0.1, { pos });
    if (how === 'tip') { const tt = t + 0.3; ring(tt, 2900, 0.35, 0.09); ring(tt + 0.09, 3300, 0.2, 0.05); thump(tt, 500, 260, 0.04, 0.18, { pos }); }
  } else if (kind === 'box' || kind === 'carton') {  // cardboard: a scuff and a hollow tap
    burst(t, { f: 900 + R() * 400, q: 0.9, d: 0.09, g: 0.16, pos }); thump(t, 190, 110, 0.06, 0.18, { pos });
    if (how === 'tip') { thump(t + 0.3, 160, 90, 0.08, 0.32, { pos }); burst(t + 0.3, { f: 700, q: 0.8, d: 0.1, g: 0.18, pos }); }
  } else if (kind === 'cloth') { burst(t, { f: 2400, q: 0.5, d: 0.18, g: 0.08, pos, sweep: 0.7 }); }
  else if (kind === 'body') { burst(t, { f: 1800, q: 0.6, d: 0.2, g: 0.09, pos, sweep: 0.6 }); thump(t + 0.05, 120, 70, 0.1, 0.12, { pos }); }
  else if (kind === 'misc') { burst(t, { f: 1500 + R() * 800, q: 1, d: 0.06, g: 0.11, pos }); thump(t, 260, 160, 0.04, 0.1, { pos }); }
  else { burst(t, { f: 1800 + R() * 1500, q: 0.7, d: 0.07 + R() * 0.05, g: 0.06, pos }); }   // a hand moving through things
  if (how === 'take') burst(t + 0.15, { f: 2600, q: 0.6, d: 0.1, g: 0.06, pos, sweep: 0.8 });
}
// ---------------------------------------------------------------- the phone
export function phoneTap() { if (!ctx) return; const t = ctx.currentTime + 0.005; click(t, 2400, 0.12); }
export function phoneErr() { if (!ctx) return; const t = ctx.currentTime + 0.01; tone(t, 520, 0.12, 0.08, 'sine'); tone(t + 0.14, 390, 0.2, 0.08, 'sine'); }
// the ringback you hear while it rings at the other end (US: 440 + 480 Hz, 2 s on, 4 s off)
export function ringback(n = 2) {   // returns stop(): call it when they pick up or you hang up
  if (!ctx) return () => { }; const t0 = ctx.currentTime + 0.3, gs = [];
  for (let i = 0; i < n; i++) for (const f of [440, 480]) { const o = ctx.createOscillator(); o.frequency.value = f; const e = ctx.createGain(); gs.push(e); const t = t0 + i * 3; e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(0.035, t + 0.03); e.gain.setValueAtTime(0.035, t + 1.9); e.gain.linearRampToValueAtTime(0, t + 1.95); const lp = ctx.createBiquadFilter(); lp.type = 'bandpass'; lp.frequency.value = 900; lp.Q.value = 0.7; o.connect(lp).connect(e).connect(sfxBus); o.start(t); o.stop(t + 2); }
  return () => { const t = ctx.currentTime; for (const e of gs) { e.gain.cancelScheduledValues(t); e.gain.setValueAtTime(e.gain.value, t); e.gain.linearRampToValueAtTime(0, t + 0.015); } };
}
// an ambulance siren: one continuous source riding on the van, alternating wail and yelp, with Doppler as it passes.
// sirenStart(obj) — obj.pos (or obj itself) is read every 50 ms; returns a handle for sirenStop(handle).
export function sirenStart(obj) {
  if (!ctx) return null;
  const P = () => (obj && obj.pos) || obj, p0 = P(), t = ctx.currentTime + 0.02;
  const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 1050;
  const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 1050; const g2 = ctx.createGain(); g2.gain.value = 0.25; o2.connect(g2);
  const lfo = ctx.createOscillator(); lfo.type = 'triangle'; lfo.frequency.value = 0.31; const lg = ctx.createGain(); lg.gain.value = 420; lfo.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency);
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2800; const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 500;
  const e = ctx.createGain(); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(0.085, t + 0.4);
  const pn = ctx.createPanner(); pn.panningModel = 'HRTF'; pn.distanceModel = 'inverse'; pn.refDistance = 12; pn.rolloffFactor = 0.8; pn.maxDistance = 600;
  o.connect(f); g2.connect(f); f.connect(hp).connect(e).connect(pn).connect(sfxBus);
  const h = { o, o2, lfo, e, pn, last: null, yelp: false, sw: t + 6 + Math.random() * 4 };
  const upd = () => {
    if (!ctx) return; const q = P(); if (!q) return; const nw = ctx.currentTime;
    if (pn.positionX) { pn.positionX.setTargetAtTime(q.x, nw, 0.03); pn.positionY.setTargetAtTime(q.y ?? 1.5, nw, 0.03); pn.positionZ.setTargetAtTime(q.z, nw, 0.03); } else pn.setPosition(q.x, q.y ?? 1.5, q.z);
    const d = Math.hypot(q.x - L.x, q.z - L.z);
    if (h.last != null) { const vr = (d - h.last) / 0.05, k = Math.max(-0.08, Math.min(0.08, -vr / 343)); o.detune.setTargetAtTime(1200 * Math.log2(1 + k), nw, 0.08); o2.detune.setTargetAtTime(1200 * Math.log2(1 + k), nw, 0.08); }
    h.last = d;
    if (nw > h.sw) { h.yelp = !h.yelp; h.sw = nw + (h.yelp ? 3 + Math.random() * 2 : 6 + Math.random() * 4); lfo.frequency.setValueAtTime(h.yelp ? 3.2 : 0.31, nw); lg.gain.setValueAtTime(h.yelp ? 330 : 420, nw); }
    e.gain.setTargetAtTime(paused ? 0 : 0.085, nw, 0.1);
  };
  if (p0) upd();
  h.iv = setInterval(upd, 50);
  for (const n of [o, o2, lfo]) n.start(t);
  return h;
}
export function sirenStop(h) {
  if (!h || !ctx) return; clearInterval(h.iv); const t = ctx.currentTime;
  h.e.gain.cancelScheduledValues(t); h.e.gain.setValueAtTime(h.e.gain.value, t); h.e.gain.linearRampToValueAtTime(0, t + 0.6);
  for (const n of [h.o, h.o2, h.lfo]) n.stop(t + 0.65);
}
// (old one-shot wail, kept for callers that still use it)
export function siren(pos, dur = 3.2) {
  if (!ctx || paused) return; const t = ctx.currentTime + 0.02;
  const o = ctx.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(700, t); o.frequency.linearRampToValueAtTime(1500, t + dur / 2); o.frequency.linearRampToValueAtTime(700, t + dur);
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2600;
  const e = ctx.createGain(); e.gain.setValueAtTime(0.0, t); e.gain.linearRampToValueAtTime(0.09, t + 0.05); e.gain.setValueAtTime(0.09, t + dur - 0.05); e.gain.linearRampToValueAtTime(0, t + dur);
  o.connect(f).connect(e).connect(out(pos, sfxBus, 0, 12, 0.8)); o.start(t); o.stop(t + dur + 0.02);
}

export const raw = () => ctx ? { ctx, out: sfxBus } : null;
export function zap(pos) { if (!ctx || paused || (pos && dist(pos) > 30)) return; const t = ctx.currentTime + 0.01; burst(t, { f: 4200, type: 'highpass', d: 0.06, g: 0.3, pos }); for (let i = 0; i < 4; i++) click(t + Math.random() * 0.12, 3000 + Math.random() * 3000, 0.2, pos); }

// ---------------------------------------------------------------- things breaking (fences, hedges, bins, pots...)
// leaves and branches thrashing: a dry rustle (grains of filtered noise, each its own little shake), twigs snapping
function leafRustle(t, pos, g = 1, dur = 0.5) {
  const n = Math.round(6 + dur * 22);
  for (let i = 0; i < n; i++) { const k = i / n, tt = t + k * dur + Math.random() * 0.03; burst(tt, { f: 2600 + Math.random() * 3800, q: 0.9 + Math.random(), a: 0.004, d: 0.03 + Math.random() * 0.06, g: g * (0.12 + Math.random() * 0.18) * (1 - k * 0.6), pos }); }
  burst(t, { f: 900, q: 0.6, a: 0.01, d: dur * 0.8, g: g * 0.12, pos });
}
// a hollow plastic body: its own few resonances knocked, a click on the contact
function plasticKnock(t, pos, g = 1) {
  const f0 = 240 + Math.random() * 80;
  for (const [m, a, d] of [[1, 0.45, 0.12], [2.3, 0.22, 0.08], [3.9, 0.1, 0.05]]) thump(t, f0 * m, f0 * m * 0.94, d, g * a, { pos, type: 'triangle' });
  burst(t, { f: 1800, q: 1.4, d: 0.025, g: g * 0.35, pos });
}
// wood giving way: a sharp crack, fibres tearing (a run of tiny snaps), the boards' hollow knock and their clatter
function woodCrack(t, pos, g = 1, big = 1) {
  burst(t, { f: 2600, q: 1.2, a: 0.001, d: 0.025, g: g * 0.9, pos }); thump(t, 180 * big, 70, 0.12, g * 0.55, { pos });
  burst(t + 0.004, { f: 700, q: 0.8, d: 0.09, g: g * 0.5, pos, sweep: 0.6 });
  const n = 5 + Math.round(big * 6); for (let i = 0; i < n; i++) burst(t + 0.01 + Math.random() * 0.14 * big, { f: 1600 + Math.random() * 3500, q: 3 + Math.random() * 3, a: 0.001, d: 0.008 + Math.random() * 0.015, g: g * (0.2 + Math.random() * 0.35), pos });
  for (let i = 0; i < 3; i++) { const tt = t + 0.18 + i * (0.07 + Math.random() * 0.08) * big; thump(tt, 320 + Math.random() * 260, 200, 0.06, g * 0.18, { pos, type: 'triangle' }); burst(tt, { f: 1200, q: 1.5, d: 0.03, g: g * 0.15, pos }); }
}
// mat: wood | leaves | plastic | clay | metal; power ~0.3 (a knock) .. 2 (a car); broke: it gave way (else it just took the blow)
export function breakSound(mat, pos, power = 1, broke = true) {
  if (!ctx || paused) return;
  const d = dist(pos); if (d > 70) return;
  const t = ctx.currentTime + 0.004 + d / 343, g = Math.min(1.6, 0.5 + power * 0.5);
  if (mat === 'leaves') {
    leafRustle(t, pos, g, broke ? 0.7 + power * 0.2 : 0.3);
    if (broke) for (let i = 0; i < 3 + power * 3; i++) burst(t + Math.random() * 0.4, { f: 2000 + Math.random() * 2500, q: 4, a: 0.001, d: 0.012, g: g * 0.35, pos });   // branches snapping
    thump(t, 120, 60, 0.1, g * 0.25, { pos });
  } else if (mat === 'plastic') {
    plasticKnock(t, pos, g);
    if (broke) { burst(t + 0.01, { f: 3200, q: 2, d: 0.05, g: g * 0.35, pos }); for (let i = 0; i < 4; i++) plasticKnock(t + 0.16 + i * (0.08 + Math.random() * 0.1), pos, g * (0.5 - i * 0.1)); }   // it hits the ground and rattles to a stop
  } else if (mat === 'clay') {
    thump(t, 300, 120, 0.06, g * 0.4, { pos });
    if (broke) { burst(t, { f: 3500, q: 1.5, d: 0.06, g: g * 0.5, pos }); for (let i = 0; i < 9; i++) tone(t + 0.01 + Math.random() * 0.25, 2200 + Math.random() * 3800, 0.06, g * 0.06, 'triangle', sfxBus, pos, 0.001); burst(t + 0.05, { f: 500, q: 0.6, d: 0.2, g: g * 0.25, pos, brown: true }); }
    else burst(t, { f: 2200, q: 2, d: 0.03, g: g * 0.3, pos });
  } else if (mat === 'metal') {
    for (const [f, a, dd] of [[180, 0.5, 0.35], [470, 0.25, 0.25], [1130, 0.12, 0.18]]) tone(t, f * (0.9 + Math.random() * 0.2), dd, g * a * 0.5, 'triangle', sfxBus, pos, 0.001);
    burst(t, { f: 3000, q: 1.5, d: 0.04, g: g * 0.4, pos }); thump(t, 90, 50, 0.18, g * 0.45, { pos });
  } else {   // wood
    if (broke) woodCrack(t, pos, g, Math.min(1.6, 0.6 + power * 0.5));
    else { burst(t, { f: 1100, q: 1.6, d: 0.04, g: g * 0.55, pos }); thump(t, 220, 110, 0.07, g * 0.4, { pos }); burst(t + 0.003, { f: 3000, q: 3, d: 0.012, g: g * 0.25, pos }); }
  }
}

// tests: ?audiotest=1 creates the context at load, muted, so voiceLog() records real voice()/zombie() calls headlessly
try { if (typeof location !== 'undefined' && /[?&]audiotest=1/.test(location.search)) { init(); master.gain.value = 0; ctx.resume && ctx.resume(); start(); } } catch (e) { /* no audio here */ }
