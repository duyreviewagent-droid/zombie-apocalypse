// mp.js — multiplayer glue: ties net.js (rooms + game sync over p2p.js), chat.js and voice.js into the game.
// main.js calls MP.init(ctx) once, then the small MP.* hooks marked "// MP:" in main.js. Every hook does nothing
// unless you're in an online game, so single player is unchanged.
//
// How a game goes: title → MULTIPLAYER → name → Create room (code ABCDE) or Join by code → the host picks map +
// difficulty → Start. Everyone loads the host's map (a page reload when it's a different map: the room code, your
// name and the game settings ride along in sessionStorage and you rejoin by yourself) and wakes up at the same spot
// as the dead come out. The host's game runs the dead and the clock; everyone else sees them as puppets and sends the
// host their hits. Down? A friend still standing gets you back up after a few seconds. Anyone who gets on the
// helicopter (or out any other way) is saved; when the host is done, the game passes to someone still playing.
import * as THREE from 'three';
import * as NET from './net.js';
import * as CHAT from './chat.js';
import * as VOICE from './voice.js';
import { Z, sleep } from './zombies.js';
import { WEAPONS } from './weapons.js';

const SESS = 'za_mp_sess';
const BODIES = ['human', 'butler', 'coach', 'michelle'];
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
let X = null, chatBtn = null, downT = -1;

export const on = () => NET.isOnline() && NET.inGame();         // in an online game right now
export const isClient = () => on() && NET.isClient();           // ...and somebody else's game runs the world
export const isHost = () => on() && NET.isHost();
export const NETMOD = NET;

export function init(ctx) {
  X = ctx;
  NET.init(Object.assign(ctx, {
    speaking: id => VOICE.speaking(id), speakerIcon: VOICE.speakerIcon,
    // the lobby's mic button: ask first; then it's an open mic while you're in the lobby (mute with the same button)
    voice: { toggle: () => { if (!VOICE.micOn()) VOICE.askThenEnable(() => { VOICE.setMode('open'); VOICE.setMuted(false); }); else { VOICE.setMode('open'); VOICE.toggleMute(); } }, on: () => VOICE.micOn(), muted: () => VOICE.isMuted() },
    onStart: s => onStart(s),
    onEvent: e => onEvent(e),
    onHurt: (amt, pos, info) => X.hurtMe(amt, pos, info),
    onHostChange: (me, o) => { if (o && o.solo) { CHAT.system('You are playing alone now.'); } },
    onPlayerJoin: p => { CHAT.system(`${p.name} joined`); },
    onPlayerLeave: p => { CHAT.dropPlayer(p.id); CHAT.system(`${p.name} ${p.why === 'kicked' ? 'was removed' : p.why === 'lost' ? 'lost connection' : 'left'}`); },
    onLeft: (why, wasInGame) => { offline(); if (wasInGame && X.G.state !== 'title') X.toTitle(); if (why === 'kicked') NET.openLobby(); },
    onJoined: m => { VOICE.setPeers(m.players.map(p => p.id)); CHAT.system(`In room ${m.code} — Enter to chat${X.touch ? '' : ', hold B to talk'}`); },
  }));
  NET.on('chat', m => CHAT.receive(m));
  NET.on('rtc', m => VOICE.receive(m.from, m.d));
  NET.on('peer+', m => { if (!m.rename) VOICE.peerJoined(m.id); });
  NET.on('peer-', m => VOICE.peerLeft(m.id));
  NET.on('host', m => CHAT.system(m.id === NET.localId ? 'You are the host now' : `${m.name} is the host now`));
  const proj = V();
  CHAT.initChat({
    send: text => NET.send({ t: 'chat', text }),
    myId: () => NET.localId,
    canOpen: () => NET.isOnline() && ['play', 'dead', 'bag', 'result'].includes(X.G.state),
    onOpen: () => { X.keys.clear(); X.G.mouse.left = X.G.mouse.right = false; },
    distTo: id => { const r = remote(id), P = X.getP(); return r && P ? Math.hypot(r.s.pos.x - P.s.pos.x, r.s.pos.z - P.s.pos.z) : null; },
    project: id => { const r = remote(id); if (!r) return null; proj.set(r.s.pos.x, (r.s.pivot ? r.s.pivot.position.y : 0) + 2.25, r.s.pos.z).project(X.camera); if (proj.z > 1) return null; return { x: (proj.x * 0.5 + 0.5) * innerWidth, y: (-proj.y * 0.5 + 0.5) * innerHeight }; },
    bottom: X.touch ? '46vh' : '214px',
  });
  VOICE.initVoice({
    send: (to, d) => NET.send({ t: 'rtc', to, d }),
    myId: () => NET.localId,
    audio: () => X.SND.raw && X.SND.raw(),
    // in the lobby (no bodies yet) everyone's voice is right by your ear; in the game it comes from their head
    headPos: id => { if (!on()) { const c = X.camera.position; return { x: c.x, y: c.y, z: c.z }; } const r = remote(id); return r ? { x: r.s.pos.x, y: 1.6, z: r.s.pos.z } : null; },
    occluded: id => { const r = remote(id); if (!r || !X.world.los) return 0; return X.world.los(X.camera.position, V(r.s.pos.x, 1.5, r.s.pos.z)) ? 0 : 1; },
    nameOf: id => { const p = NET.players().find(q => q.id === id); return p && p.name; },
    canKey: () => !CHAT.isTyping() && !NET.lobbyOpen() && NET.isOnline() && ['play', 'dead', 'bag', 'result', 'escaping'].includes(X.G.state),
    onUI: open => { if (open) { X.keys.clear(); } },
    toast: t => X.toast(t, ''),
    askMic: (yes, no) => X.ask('Use your microphone?', 'Your friends in this room will hear you when you hold B (on a touch screen: tap the mic button). People near you in the game hear you louder. Your browser will ask for permission too.', 'Turn it on', yes, 'Not now', no),
    touch: !!X.touch,
    bottom: X.touch ? 'calc(46vh - 44px)' : '178px',
  });
  CHAT.setVisible(false); VOICE.setVisible(false);
  if (X.touch) {   // a chat button for thumbs (Enter on a keyboard)
    chatBtn = document.createElement('button'); chatBtn.id = 'mpChatBtn'; chatBtn.textContent = 'CHAT';
    chatBtn.style.cssText = 'position:fixed;left:max(14px,env(safe-area-inset-left));top:46vh;z-index:31;display:none;padding:8px 14px;background:rgba(14,13,12,.72);border:1px solid rgba(232,176,74,.55);color:#e8b04a;font:12px Oswald,sans-serif;letter-spacing:.25em;border-radius:3px;touch-action:manipulation';
    chatBtn.addEventListener('pointerdown', e => e.stopPropagation());
    chatBtn.onclick = e => { e.stopPropagation(); CHAT.open(); };
    document.body.appendChild(chatBtn);
  }
  addEventListener('pagehide', () => { if (NET.isOnline() && !reloading) NET.leave(); });
}
let reloading = false;
const remote = id => { const p = NET.players().find(q => q.id === id); return p && p.unit ? p.unit : null; };
function offline() { VOICE.leave(); CHAT.clear(); CHAT.setVisible(false); VOICE.setVisible(false); hudOn = false; }

// the title-screen button
export function openLobby() { NET.openLobby(); }
export function lobbyOpen() { return NET.lobbyOpen(); }

// main.js, once the page has loaded: are we coming back from a reload into a room's game? -> its settings (start it)
export function resumeSettings() {
  let s = null; try { s = JSON.parse(sessionStorage.getItem(SESS) || 'null'); sessionStorage.removeItem(SESS); } catch { }
  if (!s || !s.code || !s.settings || Date.now() - (s.at || 0) > 120000) return null;
  if (s.settings.map && s.settings.map !== X.mapId()) return null;
  whoSaved = s.who || null;
  NET.resume(s);
  return s.settings;
}

// the host pressed Start (or we joined a game in progress)
function onStart(settings) {
  if (settings.map && settings.map !== X.mapId()) {   // another map: reload with it, and come straight back into the room
    const sess = NET.session(); if (sess) { sess.at = Date.now(); sess.who = who(); try { sessionStorage.setItem(SESS, JSON.stringify(sess)); } catch { } }
    NET.prepareReload(); reloading = true;
    X.showLoading && X.showLoading(`Loading ${settings.mapName || 'the map'}…`);
    setTimeout(() => X.reloadTo(settings.map), 350);
    return;
  }
  VOICE.setMode(X.touch ? 'open' : 'ptt');   // in the game: hold B to talk (a phone/iPad: the mic button is on/off)
  X.start(settings);
}
// which body / name you play as, and where you stand at the start (so you don't all stand in one spot)
let whoSaved = null;
export function who() {
  if (whoSaved) return whoSaved;
  const list = NET.players().map(p => p.id).sort((a, b) => a - b), i = Math.max(0, list.indexOf(NET.localId));
  const chars = X.characters ? X.characters() : [], c = chars.find(c => c.name === NET.myChar()) || chars[i % Math.max(1, chars.length)];
  return c ? { body: c.body, name: c.name, job: c.job, index: i } : { body: BODIES[i % BODIES.length], name: 'Sam Carter', job: 'survivor', index: i };
}

// ---------------------------------------------------------------- every frame (main.js frame(), every state)
let clientSweepT = 0, hudOn = false;
export function update(dt) {
  NET.update(dt); CHAT.update(dt); VOICE.update(dt);
  // the in-game chat box and mic button: only in an online game (the lobby has its own chat panel and mic button)
  const show = NET.isOnline() && !NET.lobbyOpen() && X.G.state !== 'title';
  if (show !== hudOn) { hudOn = show; CHAT.setVisible(show); VOICE.setVisible(show); }
  if (chatBtn) chatBtn.style.display = NET.isOnline() && on() && ['play', 'dead'].includes(X.G.state) && !CHAT.isTyping() ? '' : 'none';
  // a client never runs dead of its own: anything the story woke up here goes back to sleep (the host's come in as puppets)
  if (isClient() && (clientSweepT -= dt) <= 0) { clientSweepT = 0.25; for (const u of [...Z.list]) if (u.active && !u.netId && !u.puppet) sleep(u); }
  if (downT >= 0 && on()) stepDown(dt);
  if (on()) stepHelp(dt);
}

// ---------------------------------------------------------------- the host's dead and the other players
// zombieThink's target: you, or whichever living friend is closer
export function target(u, P) { return isHost() ? NET.targetFor(u, P) : P; }
// how far is the nearest player (you or a friend) from p
export function nearDist(p, P) {
  let d = P ? Math.hypot(P.s.pos.x - p.x, P.s.pos.z - p.z) : 1e9;
  if (on()) for (const u of NET.proxies()) if (u.alive) d = Math.min(d, Math.hypot(u.s.pos.x - p.x, u.s.pos.z - p.z));
  return d;
}
// where new dead come in: around a random living player (the host's game spawns for everyone)
export function spawnAround(P) {
  if (!isHost()) return P.s.pos;
  const l = [P, ...NET.proxies()].filter(u => u && u.alive && !u.gone);
  return (l[Math.floor(Math.random() * l.length)] || P).s.pos;
}
export function playerCount() { return on() ? Math.max(1, NET.players().length) : 1; }
// the host's zombie clawed / grabbed a friend (it was chasing their proxy): tell them; true = handled
export function clawRemote(u, dmg, bite = false) {
  const T = u && u.z && u.z.tgt;
  if (!isHost() || !T || !T.remote) return false;
  if (u.s.pos.distanceTo(T.s.pos) < 2.2) NET.hurtPlayer(T, dmg, u, bite ? { bite: 1 } : { claw: 1 });
  return true;
}
// our own hits on the host's dead (C.events.hurt / kill in main.js, after the local damage)
export function hitLanded(v, dmg, by, info, killed) {
  if (!on() || !by || !by.isPlayer) return;
  if (v.remote) {   // friendly fire: you hit a friend — it lands on their side (damage, maybe a knockdown)
    const d = info && info.dir;
    NET.event('pvp', { dmg: Math.round((killed ? Math.max(dmg, 40) : dmg) * 10) / 10, part: info && info.part || null, knock: info && info.knock || 0, melee: info && info.melee ? 1 : 0, blast: info && info.blast ? 1 : 0, dx: d ? Math.round(d.x * 100) / 100 : 0, dz: d ? Math.round(d.z * 100) / 100 : 0 }, { to: v.netId });
    return;
  }
  if (isClient() && v.zombie) NET.forwardHit(v, dmg, info, killed);
}
// friends you can hit with a swing (main.js meleeLand)
export const proxies = () => on() ? NET.proxies().filter(u => u.alive && !u.gone && u.s.visible) : [];
// loud things a client does (gunshots, smashing): the host's dead should hear them
export function noise(p, loud) { if (isClient() && loud >= 14) NET.noise(p, loud); }
// a door you opened / closed
export function door(D, open) { if (isClient()) NET.door(D, open); }
// a shot: the others hear it where you are
export function shot(P, id) { if (on() && P) NET.event('shot', { x: Math.round(P.s.pos.x * 10) / 10, z: Math.round(P.s.pos.z * 10) / 10, w: id }); }

function onEvent(e) {
  const G = X.G;
  switch (e.k) {
    case 'stage': if (isClient() && e.stage > (e.prev ?? 0)) { G.stage = e.prev ?? 0; X.setStage(e.stage, 0.3); } break;
    case 'shot': { const W = WEAPONS[e.w]; if (W && X.SND.gun && e.x != null) X.SND.gun(W.snd, V(e.x, 1.4, e.z)); break; }
    case 'saved': CHAT.system(`${e.name || 'A friend'} made it out!`); X.toast(`${e.name || 'A friend'} made it out!`, 'good'); break;
    case 'down': CHAT.system(`${e.name || 'A friend'} is down!`); break;
    case 'pvp': X.pvpHurt(e.dmg, remote(e.from), e); break;
    case 'revive': if (G.state === 'dead' && downT >= 0) { downT = -1; X.respawn(X.getP().s.pos.x, X.getP().s.pos.z); X.toast(`${nameOf(e.from)} got you back up`, 'good'); } break;
    case 'heal': X.healMe(e.hp || 0, nameOf(e.from)); break;
    case 'give': for (const id of e.items || []) X.giveMe(id, nameOf(e.from)); break;
    case 'lobbyClosed': if (G.state === 'title') X.showScreen('title'); break;
  }
}

// ---------------------------------------------------------------- going down, getting back up
// main.js playerDied(): true = a friend is still up, so you'll get back up beside them (no game over)
export function died() {
  if (!on()) return false;
  NET.event('down', { name: myName() });
  if (!friendUp()) return false;
  downT = 0; return true;
}
const myName = () => (NET.players().find(p => p.me) || {}).name || 'A friend';
const nameOf = id => (NET.players().find(p => p.id === id) || {}).name || 'A friend';
function friendUp() { return NET.proxies().some(u => u.alive && !u.gone); }
function stepDown(dt) {
  const G = X.G;
  if (G.state !== 'dead') { downT = -1; return; }
  const before = downT; downT += dt;
  if (Math.floor(before / 6) !== Math.floor(downT / 6) || before < 1.5 && downT >= 1.5) X.bigText('YOU\'RE DOWN', `a friend can help you up (E next to you) · ${Math.max(0, Math.ceil(BLEED - downT))} s`, 3);
  // nobody left standing, or nobody came in time: that's it
  if ((downT > 4 && !friendUp()) || downT > BLEED) { downT = -1; X.endRun('died'); }
}
const BLEED = 75;   // seconds a friend has to get you back up
// ---------------------------------------------------------------- helping each other (main.js context(): E)
let rev = null;   // you're helping someone up: { id, t }
const REV_T = 3;
function nearFriend(px, pz, R, f) { let best = null, bd = R; for (const u of NET.proxies()) { if (u.gone || !f(u)) continue; const d = Math.hypot(u.s.pos.x - px, u.s.pos.z - pz); if (d < bd) { bd = d; best = u; } } return best; }
export function context(px, pz) {
  if (!on()) return null;
  if (ride) return { label: 'Get out', sub: `riding with ${nameOf(ride.id)}`, go: () => unride() };
  if (rev) return { label: `Helping ${nameOf(rev.id)} up… ${Math.round(rev.t / REV_T * 100)}%`, sub: 'stay right next to them', go: () => { } };
  const down = nearFriend(px, pz, 1.9, u => !u.alive);
  if (down) return { label: `Help ${down.name} up`, sub: `stay next to them for ${REV_T} seconds`, go: () => { rev = { id: down.netId, t: 0 }; X.kneel(true); } };
  const car = rideable(px, pz);
  if (car) return { label: `Get in with ${car.name}`, sub: `ride in their car · E to get out`, go: () => getIn(car) };
  const hurt = nearFriend(px, pz, 1.9, u => u.alive && u.hp < 85);
  if (hurt && X.have('bandage')) return { label: `Bandage ${hurt.name}`, sub: `${Math.round(hurt.hp)} health · uses one of your bandages`, go: () => { if (!X.take('bandage')) return; NET.event('heal', { hp: 30 }, { to: hurt.netId }); X.toast(`You patched ${hurt.name} up`, 'good'); X.reach(); } };
  const pal = nearFriend(px, pz, 1.9, u => u.alive);
  if (pal) { const g = X.giveable(); if (g.length) return { label: `Give ${pal.name} supplies`, sub: g.map(x => x.name).join(' + '), go: () => { const ids = g.map(x => x.id).filter(id => X.take(id)); if (ids.length) { NET.event('give', { items: ids }, { to: pal.netId }); X.toast(`You gave ${pal.name} ${g.map(x => x.name).join(' and ')}`, 'good'); X.reach(); } } }; }
  return null;
}
function stepHelp(dt) {
  if (!rev) return;
  const P = X.getP(), u = NET.proxies().find(q => q.netId === rev.id);
  if (!u || u.alive || !P || !P.alive || X.G.state !== 'play' || Math.hypot(u.s.pos.x - P.s.pos.x, u.s.pos.z - P.s.pos.z) > 2.4) { rev = null; X.kneel(false); return; }
  rev.t += dt;
  if (rev.t >= REV_T) { NET.event('revive', {}, { to: rev.id }); X.toast(`You got ${u.name} back up`, 'good'); rev = null; X.kneel(false); }
}

// ---------------------------------------------------------------- riding in a friend's car
let ride = null;   // { id: the driver }
function driverOf(u) { const p = NET.players().find(q => q.unit === u); return p && p.veh && p.veh[0] === 'c' ? p : null; }
function rideable(px, pz) {
  if (X.driving()) return null;
  for (const p of NET.players()) {
    if (p.me || !p.veh || p.veh[0] !== 'c' || !p.unit) continue;
    const V = X.vehicle(p.veh); if (!V) continue;
    if (Math.hypot(V.g.position.x - px, V.g.position.z - pz) > 3.2) continue;
    const seats = NET.players().filter(q => q.veh && q.veh[0] === 'r' && q.veh[1] === p.id).length;
    if (seats >= 3) continue;
    return { id: p.id, name: p.name };
  }
  return null;
}
function getIn(c) { ride = { id: c.id }; X.hideMe(true); X.toast(`You're riding with ${c.name} — E to get out`, 'good'); }
function unride() {
  const r = ride; ride = null; if (!r) return;
  const P = X.getP(), p = NET.players().find(q => q.id === r.id), V = p && p.veh && X.vehicle(p.veh);
  const o = V ? V.g.position : P.s.pos, yaw = V ? V.g.rotation.y : P.s.yaw;
  for (const [sx, sz] of [[1.9, 0], [-1.9, 0], [0, -3], [0, 3]]) { const x = o.x + Math.cos(yaw) * sx + Math.sin(yaw) * sz, z = o.z - Math.sin(yaw) * sx + Math.cos(yaw) * sz; if (X.world.walkable(x, z)) { P.s.place(x, z, yaw); break; } }
  X.hideMe(false);
}
// main.js step(), instead of playerStep while you're a passenger: you go where the car goes. true = riding
export function riding(dt) {
  if (!ride) return false;
  const G = X.G, P = X.getP();
  if (!on() || !P.alive) { ride = null; X.hideMe(false); return false; }
  const p = NET.players().find(q => q.id === ride.id), V = p && p.veh && p.veh[0] === 'c' && X.vehicle(p.veh);
  if (!V) { unride(); X.toast('Everybody out!', 'grey'); return false; }
  if (G.useReq) { G.useReq = false; unride(); return false; }
  P.s.vel.set(0, 0, 0); P.s.pos.set(V.g.position.x, P.s.pos.y, V.g.position.z); P.s.yaw = V.g.rotation.y;
  P.s.update(dt, { move: null, aimYaw: P.s.yaw, aimPitch: 0, combat: 0 });
  return true;
}
export const isRiding = () => !!ride;
export const rideState = () => ride ? ['r', ride.id] : null;

// main.js endRun(): you're out of this game (got away, or died with nobody left) — the host passes the world on
export function ended(how) {
  if (!on()) return;
  if (how === 'escaped') NET.event('saved', { name: who().name });
  if (NET.isHost()) NET.handoff();
}
// main.js toTitle(): leave the room
export function leaveGame() { whoSaved = null; downT = -1; rev = null; if (ride) { ride = null; X.hideMe(false); } if (NET.isOnline() || NET.inGame()) { NET.endGame(); offline(); } }
export const players = () => NET.players();
export const typing = () => CHAT.isTyping() || VOICE.settingsOpen() || NET.lobbyOpen();
export const _dbg = NET._dbg;
