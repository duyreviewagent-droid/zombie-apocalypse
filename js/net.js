// net.js — playing Maple Hollow together online (up to 4 survivors in one room).
// HOST-AUTHORITATIVE: the host's browser runs the real game (the dead, the townspeople, the story, the clock, the
// doors, what's been searched). Everybody sends their own body 20 times a second; the host's message also carries a
// snapshot of the world (the dead, the neighbours near anybody, the time, shared things like the helicopter).
// Clients turn the host's zombies and townspeople into puppets (no AI of their own), shown 110 ms in the past and
// smoothly interpolated between snapshots, and send their hits on them to the host. Reliable things (doors, searched
// cupboards, kills, a player getting clawed, story beats) go as ordered events.
// There is no game server: p2p.js connects the players' browsers straight to each other (WebRTC, found through free
// public Nostr relays / WebTorrent trackers) and speaks the old server's protocol ('state' 20 Hz, reliable 'event's).
// Self-contained: init(ctx) fills in the #mp lobby screen, name tags and toasts (DOM + CSS); main.js wires the callbacks
// (through mp.js).
import * as THREE from 'three';
import { Soldier, clamp, lerp, damp, wrapPi } from './soldier.js';
import { makeWeaponMesh, WEAPONS } from './weapons.js';
import { Melee, MELEE } from './melee.js';
import { Z, wake, sleep, zombiePose } from './zombies.js';
import { refreshHitShapes, damage as rawDamage } from './combat.js';
import { C } from './state.js';
import { styleFemale } from './hair.js';
import { P2PSocket, supported } from './p2p.js';
export { supported };

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const r2 = x => Math.round(x * 100) / 100, r1 = x => Math.round(x * 10) / 10;
const now = () => performance.now();
const DELAY = 110;          // ms: remote players are shown this far in the past (two 20 Hz snapshots, plus jitter)
const DELAYW = 220;         // ms: the host's world (zombies, townspeople) comes at 10 Hz: two of those, plus jitter
const MAXP = 4;
const DIFF_LIST = [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard'], ['extreme', 'Extreme'], ['apocalypse', 'Apocalypse'], ['zombiex', 'ZombieX']];
const HOLD = new Set(['Death_D', 'Hit_Knockback']), LOOP = new Set(['Fixing_Kneeling']);
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { } } };

let X = null;                                   // the ctx main.js gave init()
let ws = null;
export let localId = 0;
// everything about the connection and the room
const S = { connected: false, want: false, retry: 0, retryT: null, code: '', roomName: '', pub: false, hostId: 0, meta: {}, started: false, settings: null,
  inGame: false, intent: null, err: '', rooms: [], view: 'home', diff: 'medium', map: 'maple', name: '', max: 4 };
// this player's number in rooms: kept for the tab's life (sessionStorage), so a reload to load the host's map comes back as the same player
export function myNumId() {
  let v = 0; try { v = +sessionStorage.getItem('za_mp_id') || 0; } catch { }
  if (!v) { v = 1 + Math.floor(Math.random() * 999998); try { sessionStorage.setItem('za_mp_id', String(v)); } catch { } }
  return v;
}
const PL = new Map();                           // id -> { id, name, ready, body, R (puppet, once they send their body) }
export const shared = {};                       // host-owned bits everyone sees (helicopter: { x, y, z, yaw, phase, t } ...)
const cb = { onStart: null, onPlayerJoin: null, onPlayerLeave: null, onHurt: null, onEvent: null, onHostChange: null, onMsg: null, onLeft: null, onJoined: null };
const listeners = {};                           // raw server message type -> [fn] (chat, rtc: for the chat/voice modules)

// ---------------------------------------------------------------- public api
export function isOnline() { return !!S.code; }
export function isHost() { return !!S.code && S.hostId === localId; }
export function isClient() { return !!S.code && S.hostId !== localId; }
export function inGame() { return S.inGame; }
export function connected() { return S.connected; }
export function roomCode() { return S.code; }
export function hostId() { return S.hostId; }
// everyone in the room (you too): { id, name, ready, body, host, me, alive, hp, pos, veh, unit }
export function players() {
  return [...PL.values()].map(p => ({ id: p.id, name: p.name, ready: p.ready, body: p.body, host: p.id === S.hostId, me: p.id === localId,
    alive: p.id === localId ? !!(X && X.getP() && X.getP().alive) : !!(p.R && p.R.u.alive), hp: p.R ? p.R.u.hp : null, pos: p.R ? p.R.s.pos : null, veh: p.R ? p.R.veh : null, unit: p.R ? p.R.u : null }));
}
// remote players as game units (what a zombie can chase and claw): { s, team 0, hp, alive, remote, netId, name, sph, head }
export function proxies() { const a = []; for (const p of PL.values()) if (p.R) a.push(p.R.u); return a; }
export function remoteOf(u) { return u && u.remote ? u : null; }
export function zombieByNetId(id) { return ZM.get(id) || Z.list.find(u => u.netId === id) || null; }
// raw messages: send(obj) to the server (t: 'chat' | 'rtc' | 'event' ...). on(type, fn) to hear server messages.
export function send(obj) { if (ws && ws.readyState === 1) { ws.send(JSON.stringify(obj)); return true; } return false; }
export function on(type, fn) { (listeners[type] ||= []).push(fn); }
// a game event for everybody else (or one player): arrives as onEvent({ k: type, ...data, from })
// sticky: the host remembers it and replays it to anyone who joins later (story beats, chaos items shown)
export function event(type, data = {}, opt = {}) {
  if (!S.code) return;
  const d = { k: 'ev', type, data };
  if (opt.sticky && isHost()) { sticky.push(d); if (sticky.length > 60) sticky.shift(); }
  ev(d, opt.to);
}
const sticky = [];
function ev(d, to) { send(to != null ? { t: 'event', d, to } : { t: 'event', d }); }

export function init(ctx) {
  X = ctx;
  for (const k in cb) if (ctx[k]) cb[k] = ctx[k];
  css(); dom();
  S.name = store.get('za_name') || '';
  if (X.diffDefault) S.diff = X.diffDefault();
  if (X.mapDefault) S.map = X.mapDefault();
}
// after a page reload (to load the host's map): straight back into the room and the game
// sess: { code, name, hostId, wasHost, settings }
export function resume(sess) {
  if (!sess || !sess.code) return;
  // straight away we're in that room as far as the game goes (host or not, as before the reload); the connection follows
  localId = myNumId(); S.name = sess.name || S.name; S.code = sess.code; S.wasHost = !!sess.wasHost; S.hostId = sess.wasHost ? localId : (sess.hostId || 0);
  addPlayer(localId, myName(), true);
  S.started = true; S.settings = sess.settings || null; S.inGame = true; S.ready = false;
  if (S.settings) { S.diff = S.settings.diff || S.diff; S.map = S.settings.map || S.map; }
  S.intent = sess.wasHost ? { create: { code: sess.code } } : { join: sess.code, rejoin: true };
  S.resumeCode = sess.code;
  connect();
}
// what to carry over a page reload
export function session() { return S.code ? { code: S.code, name: myName(), hostId: S.hostId, wasHost: isHost(), settings: S.settings } : null; }
// tell the others this page is about to reload (they keep us for a minute)
export function prepareReload() { send({ t: 'reload' }); }
// the host is done (got out / died for good): give the world to someone still playing
export function handoff() {
  if (!isHost()) return false;
  const live = players().filter(p => !p.me && p.alive).map(p => p.id);
  const ids = live.length ? live : players().filter(p => !p.me).map(p => p.id);
  if (!ids.length) return false;
  send({ t: 'handoff', id: Math.min(...ids) }); return true;
}
export function settings() { return S.settings; }
export function setCallbacks(o) { Object.assign(cb, o); }

// ---------------------------------------------------------------- connection
function connect() {
  S.want = true;
  if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
  clearTimeout(S.retryT);
  if (!supported()) { S.err = 'Online play needs the game\'s website (a secure https page with WebRTC).'; S.want = false; render(); return; }
  try { ws = new P2PSocket({ id: myNumId() }); } catch (e) { return lost(); }
  const me = ws;
  ws.onopen = () => { if (me !== ws) return; S.connected = true; S.retry = 0; send({ t: 'hello', name: myName() }); pill(); render(); };
  ws.onmessage = e => { if (me !== ws) return; let m; try { m = JSON.parse(e.data); } catch { return; } try { handle(m); } catch (er) { console.error('net', m.t, er); } };
  ws.onclose = () => { if (me !== ws) return; S.connected = false; lost(); };
  ws.onerror = () => { };
}
// the connection dropped: try again (1, 2, 4 ... 10 s) and get back into the same room
function lost() {
  S.connected = false; pill(); render();
  if (!S.want || !supported()) return;
  if (S.code) S.intent = { join: S.code, rejoin: true };
  const wait = Math.min(10000, 1000 * 2 ** S.retry++);
  clearTimeout(S.retryT); S.retryT = setTimeout(connect, wait);
  if (S.retry > 7 && S.code) {   // a minute and more: carry on alone
    toast('Lost the connection — playing on alone', 'bad'); goSolo();
  }
}
function goSolo() {
  const was = S.inGame; S.code = ''; S.hostId = localId; S.intent = null; S.started = false;
  for (const p of [...PL.values()]) if (p.id !== localId) dropPlayer(p.id, 'lost', true);
  releasePuppets();
  if (was && cb.onHostChange) cb.onHostChange(true, { solo: true });
  pill(); render();
}
export function leave() {
  send({ t: 'leave' });   // (also stops a join that's still looking for the room)
  S.code = ''; S.intent = null; S.started = false; S.inGame = false; S.ready = false; S.hostId = 0; sticky.length = 0;
  doorKey = []; searchedSet.clear(); for (const k in shared) delete shared[k];
  for (const p of [...PL.values()]) if (p.id !== localId) dropPlayer(p.id, 'left', true);
  PL.clear(); releasePuppets(); pill(); render();
}
// stop being online at all (close the socket)
export function disconnect() { leave(); S.want = false; clearTimeout(S.retryT); if (ws) { const w = ws; ws = null; try { w.close(); } catch { } } S.connected = false; pill(); }

// ---------------------------------------------------------------- server messages
function handle(m) {
  (listeners[m.t] || []).forEach(f => { try { f(m); } catch (e) { console.error(e); } });
  if (cb.onMsg && (m.t === 'chat' || m.t === 'rtc')) cb.onMsg(m);
  switch (m.t) {
    case 'welcome': {
      localId = m.id;
      const I = S.intent; S.intent = null;
      if (I && I.create) send({ t: 'create', name: `${myName()}'s game`, code: I.create.code, diff: S.diff, map: S.map, max: S.max, phase: S.inGame ? 'In game' : 'Lobby' });
      else if (I && I.join) send({ t: 'join', code: I.join, rejoin: !!I.rejoin });
      else if (S.view === 'browse') send({ t: 'list' });
      break;
    }
    case 'rooms': S.rooms = m.rooms || []; render(); break;
    case 'joined': {
      const rejoin = S.inGame, wasHost = S.wasHost;
      S.code = m.code; S.wasHost = m.host === localId; S.roomName = m.name; S.pub = false; S.hostId = m.host; S.meta = m.meta || {}; S.err = '';
      if (S.meta.diff) S.diff = S.meta.diff;
      if (S.meta.map) S.map = S.meta.map;
      if (S.meta.max) S.max = S.meta.max;
      for (const p of [...PL.values()]) if (!m.players.some(q => q.id === p.id)) dropPlayer(p.id, 'lost', true);
      for (const q of m.players) addPlayer(q.id, q.name, true);
      if (!rejoin) me().ready = false;
      S.view = 'room'; render(); pill();
      sendHi();
      if (rejoin) {   // back after a drop / a reload: the host will send us the world again
        toast(S.resumeCode ? 'Back in the room' : 'Reconnected', 'good'); S.ready = false; S.resumeCode = '';
        if (m.host !== localId && wasHost) becomeClient();
        else if (m.host === localId && !wasHost) becomeHost();
      }
      if (cb.onJoined) try { cb.onJoined(m); } catch (e) { console.error(e); }
      break;
    }
    case 'peer+': {
      const fresh = !PL.has(m.id);
      addPlayer(m.id, m.name);
      if (fresh && !m.rename) {
        sendHi(m.id);
        if (S.inGame) toast(`${m.name} joined`, 'good');
        if (cb.onPlayerJoin) cb.onPlayerJoin({ id: m.id, name: m.name });
        // the game's already going: the host brings them in (they ask for the whole world once their game is set up)
        if (isHost() && S.started) ev({ k: 'start', settings: S.settings, late: true }, m.id);
      }
      render(); break;
    }
    case 'peer-': dropPlayer(m.id, m.why); render(); break;
    case 'host': {
      const was = S.hostId; S.hostId = m.id; S.wasHost = m.id === localId;
      if (S.inGame && was !== m.id) toast(m.id === localId ? 'The host left — you are the host now' : `${m.name} is the host now`, 'grey');
      if (m.id === localId) becomeHost(); else if (was === localId) becomeClient();
      render(); break;
    }
    case 'meta': S.meta = { ...S.meta, ...m }; S.roomName = m.name; if (m.diff) S.diff = m.diff; if (m.map) S.map = m.map; if (m.max) S.max = m.max; render(); break;
    case 'left': break;
    case 'kicked': { const g = S.inGame; leave(); S.view = 'home'; S.err = m.why || 'Removed from the room.'; render(); if (cb.onLeft) cb.onLeft('kicked', g); break; }
    case 'state': if (m.d) onState(m.from, m.d); break;
    case 'event': if (m.d) onEvent(m.from, m.d); break;
    case 'error': {
      if (m.code === 'rate' && S.inGame) break;
      if ((m.code === 'noroom' || m.code === 'full' || m.code === 'closed') && S.inGame) { toast('Could not get back into the room — playing on alone', 'bad'); goSolo(); break; }
      S.err = m.msg || m.code; if (S.view === 'wait') S.view = m.code === 'noroom' || m.code === 'full' ? 'join' : 'home'; render(); break;
    }
  }
}
function me() { return PL.get(localId) || addPlayer(localId, myName(), true); }
// a player's character (one of X.characters(), by name). Two players can't be the same person: if we both took it at
// once, the lower id keeps it and the other one picks again.
function setChar(q, c) {
  q.char = c || null;
  const m = me();
  if (q !== m && c && m.char === c && localId > q.id) { m.char = null; m.ready = false; ev({ k: 'char', c: null }); toast(`${q.name} took that character first — pick another`, 'bad'); }
  if (q.R && c && X.lookPuppet) try { X.lookPuppet(q.R.s, c, q.R.body); } catch { }
}
export function myChar() { return me().char || null; }
function addPlayer(id, name, quiet) {
  let p = PL.get(id);
  if (!p) { p = { id, name, ready: false, body: 'human', R: null }; PL.set(id, p); }
  p.name = name || p.name;
  if (p.R) { p.R.u.name = p.name; p.R.tagName.textContent = p.name; }
  return p;
}
function dropPlayer(id, why, quiet) {
  const p = PL.get(id); if (!p || id === localId) return;
  if (p.R) killPuppet(p.R);
  PL.delete(id);
  if (!quiet && S.inGame) toast(`${p.name} ${why === 'lost' ? 'lost connection' : why === 'kicked' ? 'was removed' : 'left'}`, 'grey');
  if (!quiet && cb.onPlayerLeave) cb.onPlayerLeave({ id, name: p.name, why });
}
function sendHi(to) { const m = me(); ev({ k: 'hi', name: myName(), ready: m.ready, char: m.char || null, body: X.getBody ? X.getBody() : 'human' }, to); }

// ---------------------------------------------------------------- events
function onEvent(from, d) {
  const p = PL.get(from);
  switch (d.k) {
    case 'hi': { const q = addPlayer(from, d.name); q.ready = !!d.ready; q.body = d.body || q.body; setChar(q, d.char); render(); break; }
    case 'ready': if (p) { p.ready = !!d.v; render(); } break;
    case 'char': if (p) { setChar(p, d.c); p.ready = false; render(); } break;
    case 'start': if (from === S.hostId) startGame(d.settings, !!d.late); break;
    case 'full': if (from === S.hostId) applyFull(d); break;
    case 'sync?': if (isHost()) ev(fullSync(), from); break;
    case 'hit': if (isHost()) hostHit(from, d); break;
    case 'zkill': { const u = zombieByNetId(d.id); emitEv({ k: 'zkill', u, by: d.by, mine: d.by === localId, part: d.part, from }); break; }
    case 'hurt': if (cb.onHurt) cb.onHurt(d.amt, V(d.x, 0, d.z), { ...d, zombie: zombieByNetId(d.zid) }); break;
    case 'door': {   // a client opened/closed a door: the host does it and tells everyone
      const D = X.world.doors[d.i]; if (!D) break;
      if (isHost()) { X.world.setDoor ? X.world.setDoor(D, d.want) : (D.want = d.want ? 1 : 0); }
      break;
    }
    case 'doors': if (from === S.hostId && !isHost() && S.ready) applyDoors(d.l); break;
    case 'search': if (S.ready) applySearch(d.keys, from, d.taken); break;
    case 'noise': if (isHost()) C.noises.push({ x: d.x, z: d.z, t: C.t, loud: d.loud }); break;
    case 'ev': emitEv({ k: d.type, ...(d.data || {}), from }); break;
  }
}
function emitEv(e) { if (cb.onEvent) try { cb.onEvent(e); } catch (er) { console.error(er); } }

// ---------------------------------------------------------------- starting the game
function startGame(settings, late) {
  S.started = true; S.settings = settings;
  closeLobby();
  if (S.inGame) { S.ready = false; return; }   // (a rejoin: we're already playing; we ask for the world again)
  S.inGame = true;
  if (!isHost()) becomeClient();
  if (cb.onStart) cb.onStart({ ...settings, late, host: isHost(), players: players() });
}
function hostStart() {
  if (!isHost()) return;
  if (S.inGame) { closeLobby(); return; }
  const settings = { diff: S.diff, map: S.map, max: S.max, seed: (Math.random() * 1e9) | 0, room: S.code, n: PL.size };
  S.settings = settings;
  send({ t: 'meta', phase: 'In game' });
  ev({ k: 'start', settings });
  startGame(settings, false);
}
// main.js: you went back to the title / quit: leave the room
export function endGame() { S.inGame = false; leave(); }

// ---------------------------------------------------------------- your own body, out to everyone
let sendT = 0, seq = 0;
function myState() {
  const P = X.getP(); if (!P) return null;
  const s = P.s, a = s.act ? s.acts[s.act] : null, up = s.up ? s.ups[s.up] : null;
  const weap = X.getWeapon ? X.getWeapon() : (P.arms && P.arms.cur) || (X.getMel && X.getMel() ? X.getMel().cur : 'fists');
  const veh = X.getVehicle ? X.getVehicle() : null;
  return [r2(s.pos.x), r2(s.pivot.position.y), r2(s.pos.z), r2(s.yaw), r2(s.vel.x), r2(s.vel.z), r2(s.aimYaw), r2(s.aimPitch), r1(s.combatW), s.crouchW > 0.5 ? 1 : 0,
    a ? [s.act, r2(a.t), a.opt.rate || 1, (a.opt.hold ? 1 : 0) | (a.opt.loop ? 2 : 0)] : 0, up ? [s.up, r2(up.t), up.opt.rate || 1, up.opt.loop ? 2 : 0] : 0,
    weap || 0, Math.round(P.hp), P.alive ? 1 : 0, s.jump.st === 'prep' || s.jump.st === 'air' ? 1 : 0, P.body || 'human', veh || 0, s.visible ? 1 : 0];
}

// ---------------------------------------------------------------- the host's world, out to everyone
let nidN = 0;
const nid = u => u.netId ||= localId * 100000 + (++nidN);
function actPack(s) {
  const a = s.act ? s.acts[s.act] : null, up = s.up ? s.ups[s.up] : null;
  return [a ? [s.act, r2(a.t), a.opt.rate || 1, (a.opt.hold ? 1 : 0) | (a.opt.loop ? 2 : 0)] : 0, up ? [s.up, r2(up.t), up.opt.rate || 1, up.opt.loop ? 2 : 0] : 0];
}
function nearAny(x, z, r) {
  const P = X.getP(); if (P && Math.hypot(P.s.pos.x - x, P.s.pos.z - z) < r) return true;
  for (const p of PL.values()) if (p.R && Math.hypot(p.R.s.pos.x - x, p.R.s.pos.z - z) < r) return true;
  return false;
}
let shareJ = '', shareT = 0;
function worldSnap() {
  const G = X.G, w = { h: [r2(G.hour || 0), G.day || 1, G.phase || '', G.stage || 0], z: [], n: [] };
  for (const u of Z.list) {
    if (!u.active) continue;
    const s = u.s; if (!nearAny(s.pos.x, s.pos.z, 140)) continue;
    const f = (u.alive ? 1 : 0) | (u.big ? 2 : 0) | (u.runner ? 4 : 0) | (u.z && u.z.down > 0 ? 8 : 0) | (u.crawl ? 16 : 0) | (u.limp ? 32 : 0) | (u.z && u.z.state === 'chase' ? 64 : 0) | (u.turned ? 128 : 0);
    w.z.push([nid(u), r2(s.pos.x), r2(s.pos.z), r2(s.yaw), r2(s.vel.x), r2(s.vel.z), f, ...actPack(s), Z.pool.indexOf(u), u.variant || 0, r2(s.root.scale.x), Math.round(u.hp)]);
  }
  const ppl = X.people ? X.people() : [];
  for (let i = 0; i < ppl.length; i++) {
    const u = ppl[i]; if (!u.active || u.gone) continue;
    const s = u.s; if (!nearAny(s.pos.x, s.pos.z, 90)) continue;
    w.n.push([i, r2(s.pos.x), r2(s.pos.z), r2(s.yaw), r2(s.vel.x), r2(s.vel.z), (u.alive ? 1 : 0) | (s.dead ? 2 : 0), ...actPack(s)]);
  }
  const j = JSON.stringify(shared);
  if (j !== shareJ || now() - shareT > 1000) { w.sh = shared; shareJ = j; shareT = now(); }
  return w;
}
// doors and searched cupboards are watched on the host and sent reliably when they change
let doorKey = [], searchedSet = new Set(), watchT = 0;
const cKey = c => `${c.kind}:${Math.round(c.x * 10)},${Math.round(c.z * 10)}`;
function watchWorld() {
  const W = X.world, l = [];
  W.doors.forEach((D, i) => { const k = (D.want ? 1 : 0) | (D.broken ? 2 : 0); if (doorKey[i] !== k) { doorKey[i] = k; l.push([i, D.want ? 1 : 0, D.broken ? 1 : 0, D.brokeDir || 1]); } });
  if (l.length) ev({ k: 'doors', l });
  const keys = [];
  for (const c of W.containers) if (c.searched) { const k = cKey(c); if (!searchedSet.has(k)) { searchedSet.add(k); keys.push(k); } }
  if (keys.length) ev({ k: 'search', keys });
}
function fullSync() {
  const W = X.world;
  return { k: 'full', doors: W.doors.map((D, i) => [i, D.want ? 1 : 0, D.broken ? 1 : 0, 1]), searched: W.containers.filter(c => c.searched).map(cKey), sticky, shared };
}
function applyFull(d) {
  applyDoors(d.doors || []);
  applySearch(d.searched || [], S.hostId);
  Object.assign(shared, d.shared || {});
  for (const e of d.sticky || []) emitEv({ k: e.type, ...(e.data || {}), from: S.hostId, replay: true });
}
function applyDoors(l) {
  const W = X.world;
  for (const [i, want, broken, dir] of l) {
    const D = W.doors[i]; if (!D) continue;
    if (broken && !D.broken) { if (W.breakDoor) W.breakDoor(D, dir || 1); else { D.broken = true; D.pivot.visible = false; if (D.box) D.box.off = true; } emitEv({ k: 'doorBreak', door: D }); }
    else if (!D.broken) { const was = D.want; D.want = want; if (was !== want) emitEv({ k: 'door', door: D, open: !!want }); }
  }
}
function applySearch(keys, from, taken) {
  const W = X.world, set = new Set(keys);
  for (const c of W.containers) if (set.has(cKey(c))) { const was = c.searched; c.searched = true; searchedSet.add(cKey(c)); if (!was || taken) emitEv({ k: 'search', c, from, taken }); }
}
// main.js: you opened/closed a door (call it from wherever you change D.want). Clients ask the host.
export function door(D, open) {
  if (!isClient()) return false;
  D.want = open ? 1 : 0;   // feels instant; the host's answer follows
  ev({ k: 'door', i: X.world.doors.indexOf(D), want: open ? 1 : 0 }, S.hostId);
  return true;
}
// main.js: you finished searching a container (taken: which props/items you took, anything JSON)
export function searched(c, taken = null) { if (!S.code) return; c.searched = true; searchedSet.add(cKey(c)); ev({ k: 'search', keys: [cKey(c)], taken }); }
// main.js (clients): a noise you made (gunshot, smashed window) so the host's dead hear it
export function noise(p, loud) { if (isClient()) ev({ k: 'noise', x: r1(p.x), z: r1(p.z), loud }, S.hostId); }

// ---------------------------------------------------------------- incoming snapshots
// each sender's clock is its own: keep the smallest (arrival - sent) seen as the offset (drifts slowly up)
const clocks = new Map();
function clockOf(id, ts) {
  const est = now() - ts; let c = clocks.get(id);
  if (!c) { c = { off: est }; clocks.set(id, c); }
  else if (est < c.off) c.off = est; else c.off += (est - c.off) * 0.004;
  return c;
}
const viewT = (id, dl = DELAY) => { const c = clocks.get(id); return c ? now() - c.off - dl : 0; };
function push(buf, t, a) { if (buf.length && t <= buf[buf.length - 1].t) return; buf.push({ t, a }); if (buf.length > 12) buf.shift(); }
// the state at time t: between the two snapshots either side of it (or carried on a little past the last)
// layout of a: [.., x(i), z, yaw, vx, vz] at the given offsets
function sample(buf, t, ix, iz, iy, ivx, ivz) {
  if (!buf.length) return null;
  let i = buf.length - 1;
  while (i > 0 && buf[i].t > t) i--;
  const A = buf[i], B = buf[i + 1];
  const o = O;
  if (!B || t < A.t) {   // past the newest: keep going the way they were going (up to a quarter second)
    const dt = clamp((t - A.t) / 1000, 0, 0.25);
    o.x = A.a[ix] + A.a[ivx] * dt; o.z = A.a[iz] + A.a[ivz] * dt; o.yaw = A.a[iy]; o.vx = A.a[ivx]; o.vz = A.a[ivz]; o.a = A.a; o.k = 0; o.A = o.B = null;
    return o;
  }
  const k = clamp((t - A.t) / Math.max(1, B.t - A.t), 0, 1);
  o.x = lerp(A.a[ix], B.a[ix], k); o.z = lerp(A.a[iz], B.a[iz], k);
  o.yaw = A.a[iy] + wrapPi(B.a[iy] - A.a[iy]) * k;
  o.vx = lerp(A.a[ivx], B.a[ivx], k); o.vz = lerp(A.a[ivz], B.a[ivz], k);
  o.a = k < 0.5 ? A.a : B.a; o.k = k; o.A = A.a; o.B = B.a;
  // a jump in position (teleport, respawn): don't slide across the map
  if (Math.hypot(B.a[ix] - A.a[ix], B.a[iz] - A.a[iz]) > 6) { o.x = B.a[ix]; o.z = B.a[iz]; }
  return o;
}
const O = {};
let lastSnapSeq = 0;
function onState(from, d) {
  if (!d.ts) return;
  clockOf(from, d.ts);
  if (d.p) playerSnap(from, d.ts, d.p);
  if (d.w && from === S.hostId && !isHost() && S.ready) worldIn(d.ts, d.w);
}

// ---------------------------------------------------------------- remote players (puppets)
function playerSnap(id, ts, a) {
  if (id === localId) return;
  const p = PL.get(id) || addPlayer(id, 'Survivor');
  if (!S.inGame || !X.KINDS) return;
  if (!p.R || p.R.body !== a[16]) { if (p.R) killPuppet(p.R); p.R = makePuppet(p, a[16]); }
  push(p.R.buf, ts, a);
}
function makePuppet(p, body) {
  const kind = X.KINDS[body] || X.KINDS.human;
  const s = new Soldier(kind, X.scene, { clone: true, onStep: X.onStep || null });
  if (X.lookPuppet && p.char) { try { X.lookPuppet(s, p.char, body); } catch { } } else if (body === 'michelle') try { styleFemale(s, 11); } catch { }
  s.update(1 / 60, {});
  const u = { s, team: 2, hp: 100, maxHp: 100, alive: true, remote: true, npc: false, z: { down: 0, state: 'idle' }, netId: p.id, name: p.name, kills: 0, deaths: 0, hurtT: 99, deadT: 0, head: V(), chest: V() };
  C.units.push(u);   // friendly fire: your shots and blasts can hit them (mp.js forwards the damage)
  const mel = X.SWINGS ? new Melee(s, X.scene, X.SWINGS) : null;
  if (mel) mel.hideAll();
  const tag = document.createElement('div'); tag.className = 'ntag';
  tag.innerHTML = `<b>${X.speakerIcon || ''}<span></span></b><i><s></s></i><u>DOWN · HELP THEM UP</u>`; netTags.appendChild(tag);
  const R = { p, u, s, body, buf: [], mel, guns: {}, weap: null, tag, tagName: tag.querySelector('b span'), tagHp: tag.querySelector('s'), losT: 0, seen: true, veh: null, lastYaw: null };
  R.tagName.textContent = p.name;
  return R;
}
function killPuppet(R) {
  R.s.setVisible(false); R.s.pivot.removeFromParent();
  if (R.mel) for (const k in R.mel.meshes) R.mel.meshes[k].removeFromParent();
  for (const k in R.guns) R.guns[k].removeFromParent();
  R.tag.remove(); R.u.alive = false; R.u.gone = true;
  { const k = C.units.indexOf(R.u); if (k >= 0) C.units.splice(k, 1); }
  R.p.R = null;
}
// put a puppet body where the snapshots say, letting the Soldier animate it as if it walked there itself
function drive(s, o, dt, cmd) {
  s.vel.set(o.vx, 0, o.vz);
  s.pos.x = o.x - o.vx * dt; s.pos.z = o.z - o.vz * dt;
  const sp = Math.hypot(o.vx, o.vz);
  cmd.move = sp > 0.12 ? Math.atan2(o.vx, o.vz) : null; cmd.speed = sp; cmd.accel = 60;
  const prev = s.yaw;
  s.yaw = o.yaw; s.turnRate = dt > 0 ? clamp(wrapPi(o.yaw - prev) / dt, -8, 8) : 0;
  s.update(dt, cmd);
  s.pos.x = o.x; s.pos.z = o.z; s.yaw = o.yaw; s.pivot.rotation.y = o.yaw;
}
function syncActs(s, act, up) {
  if (act) {
    const [n, t, rate, fl] = act;
    if (s.act !== n && s.acts[n]) s.play(n, { from: t, rate, hold: !!(fl & 1) || HOLD.has(n), loop: !!(fl & 2) || LOOP.has(n), fade: 0.15 });
  } else if (s.act && !s.dead) s.stopAct(0.25);
  if (up) {
    const [n, t, rate, fl] = up;
    if (s.up !== n && s.ups[n]) s.playUp(n, { from: t, rate, loop: !!(fl & 2), fade: 0.08 });
  } else if (s.up && s.ups[s.up] && s.ups[s.up].opt.loop) { s.ups[s.up].target = 0; s.up = null; }
}
function deadPose(s, dead) {
  if (dead && !s.dead) { s.dead = true; s.resetActs(); s.play('Death_D', { hold: true, fade: 0.12 }); }
  else if (!dead && s.dead) { s.dead = false; s.resetActs(); }
}
const eyeV = V(), headV = V(), projV = V();
function playersStep(dt) {
  const cam = X.camera, P = X.getP();
  for (const p of PL.values()) {
    const R = p.R; if (!R) continue;
    const o = sample(R.buf, viewT(p.id), 0, 2, 3, 4, 5); if (!o) continue;
    const a = o.a, s = R.s, u = R.u;
    // [x, y, z, yaw, vx, vz, aimYaw, aimPitch, combat, crouch, act, up, weap, hp, alive, jump, body, veh, visible]
    u.hp = a[13]; u.alive = !!a[14]; R.veh = a[17] || null;
    deadPose(s, !u.alive);
    // in a car (driving, or riding with someone): the car on our screen goes where theirs is; they're inside it
    // ['c' car | 'b' bike, index, x, z, yaw] — or ['r', driver id] for a passenger
    if (R.veh && (R.veh[0] === 'c' || R.veh[0] === 'b') && X.moveVehicle) {
      const va = o.A && o.A[17], vb = o.B && o.B[17];
      if (va && vb && va[0] === vb[0] && va[1] === vb[1]) X.moveVehicle([va[0], va[1], lerp(va[2], vb[2], o.k), lerp(va[3], vb[3], o.k), va[4] + wrapPi(vb[4] - va[4]) * o.k]);
      else X.moveVehicle(R.veh);
    }
    const show = !(R.veh && R.veh[0] !== 'b') && a[18] !== 0;
    s.setVisible(show);
    if (!show) { R.tag.style.display = 'none'; hideWeapons(R); continue; }
    syncActs(s, a[10], a[11]);
    const aimYaw = o.A ? o.A[6] + wrapPi(o.B[6] - o.A[6]) * o.k : a[6];
    drive(s, o, dt, { aimYaw, aimPitch: a[7], combat: a[8], crouch: !!a[9], jump: !!a[15] && s.jump.st === 'ground' });
    s.pivot.updateMatrixWorld(true);
    holdWeapon(R, a[12], dt);
    refreshHitShapes(u);
    // the name tag, over the head
    const B = s.B; (B.Head || B.Neck).getWorldPosition(headV); headV.y += 0.42;
    projV.copy(headV).project(cam);
    const dist = cam.position.distanceTo(headV);
    R.losT -= dt;
    if (R.losT <= 0 && P) { R.losT = 0.2; eyeV.copy(cam.position); R.seen = !X.world.los || X.world.los(eyeV, headV); }
    const on = projV.z < 1 && Math.abs(projV.x) < 1.2 && Math.abs(projV.y) < 1.2 && R.seen && dist < 80;
    R.tag.style.display = on ? '' : 'none';
    if (on) {
      const sc = clamp(9 / dist, 0.5, 1.15);
      R.tag.style.transform = `translate(${(projV.x * 0.5 + 0.5) * innerWidth}px, ${(-projV.y * 0.5 + 0.5) * innerHeight}px) translate(-50%, -100%) scale(${sc.toFixed(3)})`;
      R.tag.style.opacity = clamp((80 - dist) / 20, 0, 1).toFixed(2);
      R.tagHp.style.width = clamp(u.hp, 0, 100) + '%';
      R.tag.classList.toggle('down', !u.alive);
      R.tag.classList.toggle('talk', !!(X.speaking && X.speaking(p.id)));
    }
  }
}
function hideWeapons(R) { if (R.mel) R.mel.hideAll(); for (const k in R.guns) R.guns[k].visible = false; }
const gF = V(), gU = V(), gX = V(), gM = new THREE.Matrix4();
function holdWeapon(R, id, dt) {
  const s = R.s;
  if (!id || id === 'fists' || !R.u.alive) { hideWeapons(R); if (R.mel && R.u.alive) { R.mel.cur = 'fists'; R.mel.fist(); } return; }
  if (MELEE[id] && R.mel) {
    for (const k in R.guns) R.guns[k].visible = false;
    if (R.mel.cur !== id) R.mel.set(id);
    R.mel.pose(true); return;
  }
  if (WEAPONS[id] && !WEAPONS[id].throwable) {
    if (R.mel) R.mel.hideAll();
    let g = R.guns[id];
    if (!g) { g = R.guns[id] = makeWeaponMesh(id); X.scene.add(g); }
    for (const k in R.guns) R.guns[k].visible = k === id;
    // in the right hand, pointing where they aim (a simple hold: the real arms pose is the shooter's own business)
    const yaw = s.aimYaw, pit = s.aimPitch * (s.combatW > 0.5 ? 1 : 0.2) - (s.combatW > 0.5 ? 0 : 0.6);
    gF.set(Math.sin(yaw) * Math.cos(pit), Math.sin(pit), Math.cos(yaw) * Math.cos(pit));
    gU.set(0, 1, 0); gX.crossVectors(gU, gF).normalize(); gU.crossVectors(gF, gX);
    gM.makeBasis(gX, gU, gF); g.quaternion.setFromRotationMatrix(gM);
    s.B.RightHand.getWorldPosition(g.position);
    return;
  }
  hideWeapons(R);
}

// ---------------------------------------------------------------- the dead on a client (puppets of the host's)
const ZM = new Map();                // host's netId -> our zombie unit
function worldIn(ts, w) {
  const G = X.G;
  if (w.h) {
    const [hour, day, phase, stage] = w.h, ph0 = G.phase, st0 = G.stage;
    G.hour = hour; G.day = day; G.stage = stage;
    if (phase && phase !== ph0) { G.phase = phase; emitEv({ k: 'phase', phase, prev: ph0 }); }
    if (stage !== st0) emitEv({ k: 'stage', stage, prev: st0 });
  }
  if (w.sh) { for (const k in shared) if (!(k in w.sh)) delete shared[k]; Object.assign(shared, w.sh); }
  const seen = new Set();
  for (const e of w.z) {
    const id = e[0]; seen.add(id);
    let u = ZM.get(id);
    if (u && !u.active) { ZM.delete(id); u.netId = null; u = null; }   // put to sleep under us (a new game, a reset)
    if (!u) { u = adopt(e); if (!u) continue; }
    push(u.nbuf, ts, e);
  }
  for (const [id, u] of ZM) if (!seen.has(id)) { ZM.delete(id); u.netId = null; u.puppet = false; u.nbuf = null; sleep(u); }
  NPC.list = w.n; NPC.ts = ts;
  for (const e of w.n) { const u = (X.people ? X.people() : [])[e[0]]; if (!u) continue; (u.nbuf ||= []); push(u.nbuf, ts, e); }
}
// a zombie we haven't got yet: the same body from the pool if it's free (the pools are made in the same order, so it
// looks the same), else any free one with the same look, else any free one at all
function adopt(e) {
  const [id, x, z, yaw, , , f, , , pi, variant, sc, hp] = e;
  const free = u => u && !u.active && !u.netId;
  let u = !(f & 128) && free(Z.pool[pi]) ? Z.pool[pi] : Z.pool.find(q => free(q) && q.variant === variant) || Z.pool.find(free);
  if (!u && X.makeZombie) u = X.makeZombie();
  if (!u) return null;
  wake(u, x, z, { yaw, big: !!(f & 2), runner: !!(f & 4), hp });
  u.s.root.scale.setScalar(sc || 1);
  u.netId = id; u.puppet = true; u.nbuf = []; u.crawl = !!(f & 16); u.limp = !!(f & 32);
  if (!(f & 1)) { u.alive = false; u.s.dead = true; u.s.play('Death_D', { hold: true, snap: true, from: 3 }); u.deadT = 6; }
  ZM.set(id, u);
  return u;
}
// main.js, on a client, INSTEAD of zombiesStep(dt): move the dead the way the host says
export function zombiesStep(dt) {
  const cam = X.camera, P = X.getP(), F = X.focusPos ? X.focusPos() : P.s.pos, camF = V(); cam.getWorldDirection(camF);
  const t = viewT(S.hostId, DELAYW);
  let chasing = 0, closeN = 0;
  for (const u of ZM.values()) {
    const o = sample(u.nbuf, t, 1, 2, 3, 4, 5); if (!o) continue;
    const a = o.a, f = a[6], s = u.s, d = s.pos.distanceTo(F);
    u.hp = a[12]; u.big = !!(f & 2); u.crawl = !!(f & 16); u.limp = !!(f & 32);
    if (!(f & 1) && u.alive) { u.alive = false; u.deadT = 0; s.dead = true; s.resetActs(); s.play('Death_D', { hold: true, fade: 0.1, rate: 1.1 }); }
    else if ((f & 1) && !u.alive && !(u.netKillT && now() - u.netKillT < 2500)) { u.alive = true; s.dead = false; s.resetActs(); }
    if (u.z) { u.z.down = f & 8 ? 1 : 0; u.z.state = f & 64 ? 'chase' : 'idle'; }
    const tx = s.pos.x - cam.position.x, tz = s.pos.z - cam.position.z, tl = Math.hypot(tx, tz) || 1;
    const show = d < 5 || ((tx * camF.x + tz * camF.z) / tl > -0.35 && d < 110);
    if (s.visible !== show) s.setVisible(show);
    if (!u.alive) { u.deadT += dt; if (u.deadT < 6) { syncActs(s, a[7], 0); drive(s, o, dt, {}); } continue; }
    syncActs(s, a[7], a[8]);
    drive(s, o, dt, { aimYaw: o.yaw, combat: 0 });
    if (s.visible && d < 45) { s.pivot.updateMatrixWorld(true); zombiePose(u, nearestTo(s.pos), dt); }
    refreshHitShapes(u);
    if (f & 64) { chasing++; if (d < 10) closeN++; }
  }
  X.G.chasing = chasing; X.G.closeN = closeN;
}
// townspeople on a client: puppets too (main.js calls this INSTEAD of PEOPLE.peopleStep)
const NPC = { list: [], ts: 0 };
export function peopleStep(dt) {
  const list = X.people ? X.people() : [], t = viewT(S.hostId, DELAYW), here = new Set(NPC.list.map(e => e[0]));
  for (let i = 0; i < list.length; i++) {
    const u = list[i], s = u.s;
    if (!here.has(i)) { if (u.active && !u.dead) { s.setVisible(false); u.active = false; } continue; }
    const o = u.nbuf && sample(u.nbuf, t, 1, 2, 3, 4, 5); if (!o) continue;
    const a = o.a;
    u.active = true; u.gone = false; s.setVisible(true);
    u.alive = !!(a[6] & 1); deadPose(s, !!(a[6] & 2));
    syncActs(s, a[7], a[8]);
    drive(s, o, dt, { aimYaw: o.yaw, combat: 0 });
    refreshHitShapes(u);
  }
}
function nearestTo(p) {
  let best = X.getP(), bd = best ? best.s.pos.distanceTo(p) : 1e9;
  for (const q of PL.values()) if (q.R && q.R.u.alive) { const d = q.R.s.pos.distanceTo(p); if (d < bd) { bd = d; best = q.R.u; } }
  return best;
}

// ---------------------------------------------------------------- hits, hurts, targets
// main.js on a CLIENT: you hit a zombie/townsperson. Returns true when the host will deal with it (skip the local
// damage() call); false = handle it yourself as usual (single player, the host, or not a networked unit).
export function hit(v, dmg, info = {}) {
  if (!isClient() || !v) return false;
  if (v.remote) return true;                                       // no shooting your friends
  const d = info.dir ? [r2(info.dir.x), r2(info.dir.y || 0), r2(info.dir.z)] : null;
  const pack = { dmg: r1(dmg), part: info.part || null, dir: d, knock: info.knock || 0, fire: info.fire ? 1 : 0, blast: info.blast ? 1 : 0, w: info.weapon || null };
  if (v.zombie && v.netId) { ev({ k: 'hit', id: v.netId, ...pack }, S.hostId); return true; }
  const ppl = X.people ? X.people() : [], i = ppl.indexOf(v);
  if (i >= 0) { ev({ k: 'hit', ni: i, ...pack }, S.hostId); return true; }
  return false;
}
// main.js on a CLIENT, AFTER its own local damage() landed on one of the host's zombies (the hit shows at once here;
// the host applies the same damage for real). killed: our hit dropped it here.
export function forwardHit(v, dmg, info = {}, killed = false) {
  if (!isClient() || !v || !v.zombie || !v.netId || !v.puppet) return false;
  const d = info.dir ? [r2(info.dir.x), r2(info.dir.y || 0), r2(info.dir.z)] : null;
  if (killed) v.netKillT = now();
  ev({ k: 'hit', id: v.netId, dmg: killed ? Math.max(r1(dmg), 999) : r1(dmg), part: info.part || null, dir: d, knock: info.knock || 0, fire: info.fire ? 1 : 0, blast: info.blast ? 1 : 0, w: info.weapon || null }, S.hostId);
  return true;
}
function hostHit(from, d) {
  const R = PL.get(from) && PL.get(from).R, by = R ? R.u : null;
  const u = d.id != null ? Z.list.find(q => q.netId === d.id) : (X.people ? X.people() : [])[d.ni];
  if (!u || !u.alive) return;
  const info = { part: d.part || undefined, knock: d.knock || 0, remoteBy: from };
  if (d.dir) info.dir = V(d.dir[0], d.dir[1], d.dir[2]);
  if (d.fire) info.fire = true; if (d.blast) info.blast = true; if (d.w) info.weapon = d.w;
  (X.damage || rawDamage)(u, d.dmg, by, info);
  if (d.id != null && !u.alive) { ev({ k: 'zkill', id: d.id, by: from, part: d.part }); emitEv({ k: 'zkill', u, by: from, mine: false, part: d.part, from }); }
}
// main.js on the HOST: a zombie clawed / grabbed / bit a remote player (u.z.tgt was one of proxies())
export function hurtPlayer(target, amt, byUnit = null, info = {}) {
  if (!target || !target.remote) return false;
  const p = byUnit ? byUnit.s.pos : target.s.pos;
  ev({ k: 'hurt', amt: r1(amt), x: r1(p.x), z: r1(p.z), zid: byUnit && byUnit.netId ? byUnit.netId : (byUnit ? nid(byUnit) : null), ...info }, target.netId);
  return true;
}
// main.js on the HOST, in zombiesStep: who should this zombie go for? (you, or whichever remote player is closer)
// pass the result to zombieThink(u, dt, T, G) in place of P.
export function targetFor(u, P) {
  if (!isHost() || !PL.size) return P;
  const cur = u.z && u.z.tgt;
  let best = P && P.alive ? P : null, bd = best ? u.s.pos.distanceTo(P.s.pos) : 1e9;
  for (const q of PL.values()) {
    if (!q.R || !q.R.u.alive || q.R.veh) continue;
    const d = q.R.s.pos.distanceTo(u.s.pos) - (q.R.u === cur ? 3 : 0);   // a little stickiness: no flip-flopping
    if (d < bd - (best === P && cur === P ? 3 : 0)) { bd = d; best = q.R.u; }
  }
  return best || P;
}

// ---------------------------------------------------------------- host migration
function becomeHost() {
  S.wasHost = true;
  // the dead we were puppeting are ours to run now (from where the last snapshot left them)
  for (const u of ZM.values()) { u.puppet = false; u.nbuf = null; if (u.z) { u.z.state = u.z.state === 'chase' ? 'chase' : 'idle'; u.z.tgt = null; u.z.path = null; } }
  ZM.clear();
  const ppl = X.people ? X.people() : []; for (const u of ppl) u.nbuf = null;
  doorKey = X.world.doors.map(D => (D.want ? 1 : 0) | (D.broken ? 2 : 0));
  if (S.inGame && cb.onHostChange) cb.onHostChange(true, {});
}
function becomeClient() {
  S.wasHost = false;
  if (!S.inGame) return;
  // the host runs the dead now: put ours away; the host's snapshots bring theirs in
  for (const u of [...Z.list]) if (!u.netId || !ZM.has(u.netId)) { u.netId = null; sleep(u); }
  if (cb.onHostChange) cb.onHostChange(false, {});
}
function releasePuppets() {
  for (const u of ZM.values()) { u.puppet = false; u.nbuf = null; }
  ZM.clear();
}

// ---------------------------------------------------------------- every frame
let footT = 0;
export function update(dt) {
  if (!X) return;
  const t = now();
  // the game is set up on our side (newGame done): from now on we send ourselves and take the host's world
  if (S.inGame && !S.ready && X.G.state === 'play' && X.getP()) { S.ready = true; if (isClient()) ev({ k: 'sync?' }, S.hostId); }
  if (S.code && S.connected && S.inGame && S.ready) {
    // you (and, if you're the host, the world) at 20 Hz; the server keeps only the newest per sender, so it's one message
    if (t - sendT >= 50) {
      sendT = t;
      const d = { ts: Math.round(t), p: myState() };
      if (isHost() && (seq & 1)) d.w = worldSnap();   // the world at 10 Hz (it's the big part)
      send({ t: 'state', d });
      if (++seq % 4 === 0 && isHost()) watchWorld();
    }
  }
  if (S.inGame) playersStep(dt);
  // the host's dead hear the remote players' footsteps
  if (isHost() && S.inGame && (footT -= dt) <= 0) {
    footT = 0.4;
    for (const q of PL.values()) { const R = q.R; if (!R || !R.u.alive || !R.s.visible) continue; const sp = R.s.speed; if (sp > 0.5) C.noises.push({ x: R.s.pos.x, z: R.s.pos.z, t: C.t, loud: R.s.crouchW > 0.5 ? 1.5 : sp > 3.2 ? 13 : 5 }); }
  }
  toastStep(dt);
}

// ---------------------------------------------------------------- lobby (the #mp screen in index.html, in the game's own menu style)
// room view: the code, the players (ready ticks, who's talking, the host's kick), the host's settings (map, difficulty,
// how many players), everybody's character (8 people from "Set up your run", one each) with their info card; the room
// chat on the right with a microphone button. Only #mpMain is rebuilt on changes: the chat (and what you're typing) stays.
let root, main, side, btns, chatLog, chatIn, micBtn, netTags, toastBox, pillEl;
const lobbyLines = [];
function myName() { return (S.name || '').trim() || 'Survivor'; }
export function openLobby() {
  if (!root) return;
  if (S.code) S.view = 'room'; else if (S.view === 'room' || S.view === 'wait') S.view = 'home';
  if (!S.code) S.err = '';
  if (X.showScreen) X.showScreen('mp'); else root.classList.add('show');
  render();
  setTimeout(() => { const i = root.querySelector('#mpName'); if (i && !i.value && !matchMedia('(pointer:coarse)').matches) i.focus(); }, 60);
}
export function closeLobby() { if (!root) return; if (lobbyOpen()) { if (X.showScreen) X.showScreen(X.G && X.G.state === 'title' ? 'title' : null); else root.classList.remove('show'); } }
export function lobbyOpen() { return !!root && root.classList.contains('show'); }
function act(a, el) {
  const val = id => (root.querySelector(id) || {}).value || '';
  switch (a) {
    case 'create': {
      if (!nameOk()) break;
      S.err = ''; S.view = 'wait'; S.waitText = 'Opening a room…';
      if (S.connected) send({ t: 'create', name: `${myName()}'s game`, diff: S.diff, map: S.map, max: S.max, phase: 'Lobby' }); else { S.intent = { create: {} }; connect(); }
      render(); break;
    }
    case 'joinview': if (!nameOk()) break; S.err = ''; S.view = 'join'; render(); setTimeout(() => root.querySelector('#mpCode')?.focus(), 40); break;
    case 'join': {
      const code = val('#mpCode').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5);
      if (code.length !== 5) { S.err = 'Room codes are 5 letters.'; render(); break; }
      S.err = ''; S.view = 'wait'; S.waitText = `Looking for room ${code}…`;
      if (S.connected) send({ t: 'join', code }); else { S.intent = { join: code }; connect(); }
      render(); break;
    }
    case 'back': leave(); S.view = 'home'; S.err = ''; render(); break;
    case 'close': if (S.code && !S.inGame) leave(); S.view = 'home'; closeLobby(); emitEv({ k: 'lobbyClosed' }); break;
    case 'map': if (isHost() && el && el.dataset.m) { S.map = el.dataset.m; send({ t: 'meta', map: S.map }); render(); } break;
    case 'diff': if (isHost() && el && el.dataset.d) { S.diff = el.dataset.d; send({ t: 'meta', diff: S.diff }); render(); } break;
    case 'max': if (isHost() && el && el.dataset.n) { const n = +el.dataset.n; if (n < PL.size) { S.err = `There are already ${PL.size} players in the room.`; render(); break; } S.max = n; S.err = ''; send({ t: 'meta', max: n }); render(); } break;
    case 'char': {
      const c = el && el.dataset.c, m = me(); S.peek = c;
      if (!c || S.inGame) { render(); break; }
      const taken = [...PL.values()].find(q => q !== m && q.char === c);
      if (taken) { S.err = `${taken.name} is already ${c.split(' ')[0]}.`; render(); break; }
      S.err = ''; m.char = c; m.ready = false; ev({ k: 'char', c }); render(); break;
    }
    case 'ready': {
      const m = me();
      if (!m.char) { S.err = 'Pick your character first.'; render(); break; }
      S.err = ''; m.ready = !m.ready; ev({ k: 'ready', v: m.ready }); render(); break;
    }
    case 'start': {
      const list = [...PL.values()];
      if (!list.every(q => q.ready && q.char)) { S.err = 'Everyone has to pick a character and tick Ready first.'; render(); break; }
      hostStart(); break;
    }
    case 'kick': if (isHost()) send({ t: 'kick', id: +el.dataset.id }); break;
    case 'copy': try { navigator.clipboard.writeText(S.code); toast('Room code copied', 'grey'); } catch { } break;
    case 'mic': if (X.voice) X.voice.toggle(); setTimeout(micUI, 50); break;
    case 'say': { const t = (chatIn.value || '').trim(); if (t) { send({ t: 'chat', text: t.slice(0, 200) }); chatIn.value = ''; } break; }
  }
}
function nameOk() {
  const i = root.querySelector('#mpName'); if (i) { S.name = i.value.trim().slice(0, 16); store.set('za_name', S.name); }
  if (!S.name.trim()) { S.err = 'Type your name first — it shows over your head.'; render(); setTimeout(() => root.querySelector('#mpName')?.focus(), 30); return false; }
  return true;
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const diffList = () => (X.diffs ? X.diffs() : DIFF_LIST.map(([id, name]) => ({ id, name, desc: '' })));
const mapList = () => (X.maps ? X.maps() : [{ id: 'maple', name: 'Maple Hollow', blurb: '' }]);
const charList = () => (X.characters ? X.characters() : []);
const diffName = id => (diffList().find(d => d.id === id) || { name: id }).name;
const mapName = id => (mapList().find(m => m.id === id) || { name: id }).name;
function render() {
  if (!root) return;
  const err = S.err ? `<div class="mperr">${esc(S.err)}</div>` : '';
  let h = '', b = '';
  root.classList.toggle('room', S.view === 'room');
  if (!supported()) {
    h = `<div class="eyebrow">play together</div><h2>MULTIPLAYER</h2>
      <div class="sub mptext">Online play needs the game's website (a secure https page with WebRTC). This window can't do it — open the website in Safari or Chrome to play with friends.</div>`;
    b = `<button class="m" data-a="close">Back</button>`;
  } else if (S.view === 'home') {
    h = `<div class="eyebrow">play together · up to ${MAXP} survivors</div><h2>MULTIPLAYER</h2>
      <div class="sub mptext">Make a room and send your friends the code — or type theirs.</div>
      <label class="mprow"><span>YOUR NAME</span><input id="mpName" maxlength="16" autocomplete="off" spellcheck="false" value="${esc(S.name)}" placeholder="type your name" data-in="name" data-enter="create"></label>
      <div class="mpgrid2">
        <button class="dbtn mpbig" data-a="create"><div class="top"><b>CREATE ROOM</b></div><small>You're the host: you pick the map, how bad it is and how many can play.</small></button>
        <button class="dbtn mpbig" data-a="joinview"><div class="top"><b>JOIN ROOM</b></div><small>Type the 5-letter code a friend gives you.</small></button>
      </div>
      <div class="mpnote">Players connect straight to each other over the internet. Only your name, where you are, chat and (if you turn it on) your voice are shared.</div>${err}`;
    b = `<button class="m" data-a="close">Back</button>`;
  } else if (S.view === 'join') {
    h = `<div class="eyebrow">multiplayer</div><h2>JOIN A ROOM</h2><div class="sub mptext">Type the 5-letter room code.</div>
      <input id="mpCode" class="mpcode" maxlength="5" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCDE" data-enter="join">${err}`;
    b = `<button class="m" data-a="back">Back</button><button class="m go" data-a="join">Join</button>`;
  } else if (S.view === 'wait') {
    h = `<div class="eyebrow">multiplayer</div><h2>CONNECTING</h2><div class="sub mpwait"><i></i><span>${esc(S.waitText || 'Connecting…')}</span></div>
      <div class="mpnote">This can take up to half a minute.</div>${err}`;
    b = `<button class="m" data-a="back">Cancel</button>`;
  } else if (S.view === 'room') {
    const host = isHost(), m = me(), list = [...PL.values()].sort((a, b) => (b.id === S.hostId) - (a.id === S.hostId) || a.id - b.id);
    const allReady = list.every(q => q.ready && q.char);
    const rows = list.map(q => `<div class="mpplayer ${q.id === localId ? 'me' : ''}" data-id="${q.id}"><span class="mptalk" title="talking"></span><span class="mpst ${q.ready ? 'rdy' : ''}">${q.ready ? '✓ READY' : 'NOT READY'}</span><span class="mpwho"><b>${esc(q.name)}${q.id === S.hostId ? ' <em>HOST</em>' : ''}${q.id === localId ? ' <em>YOU</em>' : ''}</b><small>${q.char ? esc(q.char) : 'choosing…'}</small></span>${host && q.id !== localId ? `<button class="mpkick" data-a="kick" data-id="${q.id}" title="Remove from the room" aria-label="Remove ${esc(q.name)}">✕</button>` : ''}</div>`).join('')
      + Array.from({ length: Math.max(0, S.max - list.length) }, () => '<div class="mpplayer empty"><span class="mpwho"><b>waiting for a friend…</b></span></div>').join('');
    const chars = charList(), peek = chars.find(c => c.name === (S.peek || m.char)) || null;
    const charBtns = chars.map(c => { const by = list.find(q => q.char === c.name); const mine = by === m; return `<button class="mpchar ${mine ? 'on' : ''} ${by && !mine ? 'taken' : ''}" data-a="char" data-c="${esc(c.name)}" ${S.inGame ? 'disabled' : ''}>${c.face ? `<img src="${c.face}" alt="">` : '<i></i>'}<b>${esc(c.name.split(' ')[0])}</b><small>${by && !mine ? esc(by.name) : esc(c.job)}</small></button>`; }).join('');
    const maps = mapList().map(mm => `<button class="dbtn map ${S.map === mm.id ? 'on' : ''}" data-a="map" data-m="${esc(mm.id)}"><div class="top"><b>${esc(mm.name)}</b></div></button>`).join('');
    const diffs = diffList().map(d => `<button class="dbtn ${esc(d.id)} ${S.diff === d.id ? 'on' : ''}" data-a="diff" data-d="${esc(d.id)}"><div class="top"><b>${esc(d.name)}</b></div></button>`).join('');
    const maxes = [2, 3, 4].map(n => `<button class="dbtn ${S.max === n ? 'on' : ''}" data-a="max" data-n="${n}"><div class="top"><b>${n} PLAYERS</b></div></button>`).join('');
    h = `<div class="mphead"><div><div class="eyebrow">multiplayer · ${PL.size}/${S.max} survivors</div><h2>ROOM</h2></div>
        <div class="mpcodebox" data-a="copy" title="Copy the code"><span>ROOM CODE<small>send it to your friends</small></span><b>${esc(S.code)}</b></div></div>
      <div class="mpplayers">${rows}</div>
      ${S.started && !S.inGame ? '<div class="sub mptext">This game has already started — you\'ll join it in progress.</div>' : ''}
      <div class="lbl">WHO ARE YOU? <small>one each</small></div><div class="mpchars">${charBtns}</div>
      ${peek && X.whoInfo ? `<div id="whoInfo" class="mpinfo">${X.whoInfo(peek)}</div>` : ''}
      ${host ? `<div class="lbl">MAP</div><div class="mpmaps">${maps}</div><div class="lbl">HOW BAD IS IT?</div><div class="mpdiffs">${diffs}</div><div class="lbl">HOW MANY PLAYERS?</div><div class="mpmax">${maxes}</div>`
        : `<div class="mppick"><span>MAP <b>${esc(mapName(S.map))}</b></span><span>DIFFICULTY <b>${esc(diffName(S.diff))}</b></span><span>PLAYERS <b>${S.max}</b></span></div><div class="sub mptext">The host picks the map and starts when everyone is ready.</div>`}
      ${err}`;
    b = `<button class="m" data-a="back">Leave</button>`
      + (S.inGame ? '' : `<button class="m ${m.ready ? 'on' : ''}" data-a="ready">${m.ready ? '✓ Ready' : 'Ready?'}</button>`)
      + (host ? `<button class="m go" data-a="start" ${allReady || S.inGame ? '' : 'disabled'}>${S.inGame ? 'Back to the game' : allReady ? 'Start' : 'Waiting…'}</button>` : '')
      + (S.inGame ? `<button class="m" data-a="close">Close</button>` : '');
  }
  main.innerHTML = h; btns.innerHTML = b;
  side.style.display = S.view === 'room' ? '' : 'none';
  micUI(); pill();
}
function lobbyChat(m) {
  if (!m || !m.text) return;
  lobbyLines.push(m); if (lobbyLines.length > 60) lobbyLines.shift();
  if (!chatLog) return;
  const d = document.createElement('div'); d.className = 'ln' + (m.from ? '' : ' sys');
  if (m.from) { const n = document.createElement('b'); n.textContent = (m.name || 'Player') + ': '; d.appendChild(n); }
  d.appendChild(document.createTextNode(m.text)); chatLog.appendChild(d);
  while (chatLog.children.length > 60) chatLog.firstChild.remove();
  chatLog.scrollTop = chatLog.scrollHeight;
}
function micUI() {
  if (!micBtn) return;
  const v = X.voice, on = v && v.on(), muted = v && v.muted();
  micBtn.classList.toggle('on', !!on && !muted);
  micBtn.querySelector('span').textContent = !on ? 'Turn on mic' : muted ? 'Mic muted' : 'Mic on';
}
let talkT = 0;
function lobbyTick(dt) {   // who's talking (a green dot by their name)
  if (!lobbyOpen() || S.view !== 'room' || (talkT -= dt) > 0) return; talkT = 0.15;
  for (const row of main.querySelectorAll('.mpplayer[data-id]')) { const id = +row.dataset.id; row.classList.toggle('talk', !!(X.speaking && X.speaking(id === localId ? 'me' : id))); }
  micUI();
}
function dom() {
  root = document.getElementById('mp');
  if (!root) { root = document.createElement('div'); root.className = 'screen'; root.id = 'mp'; root.innerHTML = '<div class="center-panel"><div id="mpBody"></div><div class="btns sticky" id="mpBtns"></div></div>'; document.body.appendChild(root); }
  const body = root.querySelector('#mpBody'); btns = root.querySelector('#mpBtns');
  body.innerHTML = `<div id="mpMain"></div><aside id="mpSide"><div class="lbl">ROOM CHAT</div><div class="mpchatlog"></div>
    <div class="mpsay"><input id="mpSay" maxlength="200" autocomplete="off" spellcheck="false" placeholder="Say something…" data-enter="say"><button class="m" data-a="say">Send</button></div>
    <button class="m mpmic" data-a="mic"><i></i><span>Turn on mic</span></button><div class="mpnote">Hold <b>B</b> to talk in the game (tap the mic button on a phone or iPad).</div></aside>`;
  main = body.querySelector('#mpMain'); side = body.querySelector('#mpSide'); chatLog = side.querySelector('.mpchatlog'); chatIn = side.querySelector('#mpSay'); micBtn = side.querySelector('.mpmic');
  for (const m of lobbyLines) lobbyChat(m);
  on('chat', m => lobbyChat(m));
  root.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (b && !b.disabled) { e.stopPropagation(); act(b.dataset.a, b); } });
  root.addEventListener('mouseover', e => { const b = e.target.closest('[data-a=char]'); if (b && S.peek !== b.dataset.c && !matchMedia('(pointer:coarse)').matches) { S.peek = b.dataset.c; const c = charList().find(c => c.name === S.peek), box = root.querySelector('#whoInfo'); if (c && box && X.whoInfo) box.innerHTML = X.whoInfo(c); else render(); } });
  root.addEventListener('input', e => {
    if (e.target.dataset.in === 'name') { S.name = e.target.value.slice(0, 16); store.set('za_name', S.name); clearTimeout(dom.t); dom.t = setTimeout(() => S.connected && send({ t: 'hello', name: myName() }), 500); }
    if (e.target.id === 'mpCode') e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5);
  });
  // typing in the lobby must not move you / open the bag (main.js listens on window)
  for (const ty of ['keydown', 'keyup', 'keypress']) root.addEventListener(ty, e => {
    e.stopPropagation();
    if (ty !== 'keydown') return;
    if (e.key === 'Enter' && e.target.dataset && e.target.dataset.enter) { e.preventDefault(); act(e.target.dataset.enter); }
    if (e.key === 'Escape') act(S.view === 'home' || (S.view === 'room' && S.inGame) ? 'close' : 'back');
  });
  netTags = document.createElement('div'); netTags.id = 'netTags'; document.body.appendChild(netTags);
  toastBox = document.createElement('div'); toastBox.id = 'netToast'; document.body.appendChild(toastBox);
  pillEl = document.createElement('div'); pillEl.id = 'netPill'; document.body.appendChild(pillEl);
}
function pill() {
  if (!pillEl) return;
  pillEl.className = S.code && S.inGame ? 'show' : '';
  pillEl.innerHTML = `ROOM <b>${esc(S.code)}</b> · ${PL.size}/${S.max}${isHost() ? ' · HOST' : ''}`;
}
const toasts = [];
export function toast(text, kind = 'grey') {
  if (X && X.toast && S.inGame) { try { X.toast(text, kind); return; } catch { } }
  if (!toastBox) return;
  const e = document.createElement('div'); e.className = 'nt ' + kind; e.textContent = text; toastBox.appendChild(e);
  toasts.push({ e, t: 3.5 }); requestAnimationFrame(() => e.classList.add('on'));
}
function toastStep(dt) {
  for (let i = toasts.length - 1; i >= 0; i--) { const T = toasts[i]; T.t -= dt; if (T.t < 0.4) T.e.classList.remove('on'); if (T.t <= 0) { T.e.remove(); toasts.splice(i, 1); } }
  pill(); lobbyTick(dt);
}
function css() {
  const st = document.createElement('style'); st.id = 'netCss';
  st.textContent = `
  #mp { z-index: 20; }
  #mp .center-panel { width: min(640px, 96vw); }
  #mp.room .center-panel { width: min(1120px, 96vw); }
  #mpBody { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0 22px; }
  #mp.room #mpBody { grid-template-columns: minmax(0, 1fr) 280px; }
  #mpMain { min-width: 0; }
  #mpSide { min-width: 0; display: flex; flex-direction: column; gap: 8px; border-left: 1px solid rgba(255,255,255,.08); padding-left: 18px; }
  #mp .mptext { text-transform: none !important; letter-spacing: .03em !important; line-height: 1.5; }
  #mp .mprow { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; font: 11px 'Oswald', sans-serif; letter-spacing: .3em; color: var(--muted, #9b9486); padding: 10px 0 14px; }
  #mp input { background: rgba(0,0,0,.35); color: var(--bone, #ece6d8); border: 1px solid var(--edge2, rgba(255,255,255,.14)); border-radius: 2px; font: 17px 'Oswald', sans-serif; padding: 9px 12px; flex: 1 1 200px; min-width: 0; outline: none; letter-spacing: .03em; box-sizing: border-box; }
  #mp input:focus { border-color: var(--red, #c62a1e); }
  #mp .mpgrid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; }
  #mp .dbtn { --h1: #c9a24a; text-align: left; width: 100%; min-width: 0; }
  #mp .dbtn .top b { white-space: normal !important; overflow-wrap: anywhere; line-height: 1.05 !important; }
  #mp .dbtn small { min-height: 0 !important; overflow-wrap: anywhere; }
  #mp .dbtn.mpbig .top b { font-size: 30px !important; }
  #mp .dbtn.on { border-color: var(--h1) !important; background: linear-gradient(160deg, rgba(216,194,122,.16), rgba(216,194,122,.03)) !important; box-shadow: inset 0 0 0 1px var(--h1); }
  #mp .mpnote { margin-top: 12px; font: 300 12px/1.5 'Oswald', sans-serif; color: var(--dim, #8a8478); letter-spacing: .03em; }
  #mp .mperr { margin-top: 12px; padding: 9px 12px; border-left: 2px solid var(--red, #c62a1e); background: rgba(198,42,30,.14); font: 14px/1.4 'Oswald', sans-serif; color: #f0b4ac; }
  #mp .mpcode { display: block; width: 100%; text-align: center; font: 60px 'Bebas Neue', sans-serif !important; letter-spacing: .4em !important; padding: 10px 0 4px .4em !important; margin: 8px 0 4px; text-transform: uppercase; }
  #mp .mpwait { display: flex; align-items: center; gap: 12px; text-transform: none; letter-spacing: .05em; font-size: 15px; margin: 18px 0 6px; }
  #mp .mpwait i { width: 16px; height: 16px; border: 2px solid rgba(255,255,255,.2); border-top-color: var(--red, #c62a1e); border-radius: 50%; animation: mpspin .8s linear infinite; flex: none; }
  @keyframes mpspin { to { transform: rotate(360deg); } }
  #mp .mphead { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 8px 16px; margin-bottom: 10px; }
  #mp .mpcodebox { padding: 6px 14px; border: 1px dashed rgba(198,42,30,.65); display: flex; align-items: center; gap: 14px; cursor: pointer; }
  #mp .mpcodebox span { font: 11px 'Oswald', sans-serif; letter-spacing: .3em; color: var(--muted, #9b9486); }
  #mp .mpcodebox small { display: block; letter-spacing: .06em; font-size: 12px; color: var(--dim, #8a8478); margin-top: 2px; }
  #mp .mpcodebox b { font: 400 46px 'Bebas Neue', sans-serif; letter-spacing: .25em; color: var(--bone, #ece6d8); line-height: 1; }
  #mp .mpplayers { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 6px; margin-bottom: 6px; }
  #mp .mpplayer { display: flex; align-items: center; gap: 10px; padding: 8px 10px; background: rgba(255,255,255,.035); border-left: 2px solid rgba(255,255,255,.1); min-width: 0; }
  #mp .mpplayer.me { border-left-color: var(--red, #c62a1e); }
  #mp .mpplayer.empty { opacity: .4; } #mp .mpplayer.empty b { font-weight: 300; font-style: italic; font-size: 14px; }
  #mp .mpwho { flex: 1; min-width: 0; }
  #mp .mpwho b { display: block; font: 500 16px/1.25 'Oswald', sans-serif; letter-spacing: .03em; overflow-wrap: anywhere; }
  #mp .mpwho b em { font: normal 9px 'Oswald', sans-serif; letter-spacing: .2em; color: #c9a24a; margin-left: 4px; vertical-align: middle; }
  #mp .mpwho small { display: block; font: 300 12px 'Oswald', sans-serif; color: var(--muted, #9b9486); overflow-wrap: anywhere; }
  #mp .mpst { flex: none; font: 9px 'Oswald', sans-serif; letter-spacing: .14em; color: var(--dim, #8a8478); width: 62px; }
  #mp .mpst.rdy { color: #7fbf6a; }
  #mp .mptalk { flex: none; width: 9px; height: 9px; border-radius: 50%; background: rgba(255,255,255,.12); }
  #mp .mpplayer.talk .mptalk { background: #6fe07a; box-shadow: 0 0 8px #6fe07a; }
  #mp .mpkick { flex: none; background: none; border: 0; color: var(--dim, #8a8478); cursor: pointer; font-size: 15px; padding: 4px 6px; } #mp .mpkick:hover { color: var(--red, #c62a1e); }
  #mp .lbl { font: 10px 'Oswald', sans-serif; letter-spacing: .35em; color: var(--muted, #9b9486); margin: 12px 0 6px; } #mp .lbl small { letter-spacing: .1em; color: var(--dim, #8a8478); margin-left: 6px; }
  #mp .mpchars { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 6px; }
  #mp .mpchar { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 4px 7px; background: rgba(255,255,255,.035); border: 1px solid rgba(255,255,255,.1); border-radius: 2px; color: var(--bone, #ece6d8); cursor: pointer; min-width: 0; font: inherit; }
  #mp .mpchar img, #mp .mpchar i { width: 52px; height: 64px; object-fit: cover; border-radius: 2px; background: rgba(255,255,255,.05); display: block; }
  #mp .mpchar b { font: 400 20px/1 'Bebas Neue', sans-serif; letter-spacing: .08em; }
  #mp .mpchar small { font: 300 10.5px/1.25 'Oswald', sans-serif; color: var(--muted, #9b9486); text-align: center; overflow-wrap: anywhere; }
  #mp .mpchar.on { border-color: #d8c27a; box-shadow: inset 0 0 0 1px #d8c27a; background: rgba(216,194,122,.1); }
  #mp .mpchar.taken { opacity: .4; }
  #mp .mpinfo { margin-top: 8px; }
  #mp .mpmaps { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px; }
  #mp .mpdiffs, #mp .mpmax { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 6px; }
  #mp .mpmaps .dbtn .top b, #mp .mpdiffs .dbtn .top b, #mp .mpmax .dbtn .top b { font-size: 20px !important; }
  #mp .mpmaps .dbtn, #mp .mpdiffs .dbtn, #mp .mpmax .dbtn { padding: 8px 10px !important; }
  #mp .mppick { display: flex; flex-wrap: wrap; gap: 8px 28px; font: 11px 'Oswald', sans-serif; letter-spacing: .3em; color: var(--muted, #9b9486); margin: 12px 0 4px; }
  #mp .mppick b { display: block; font: 400 28px 'Bebas Neue', sans-serif; letter-spacing: .06em; color: var(--bone, #ece6d8); }
  #mp .mpchatlog { flex: 1; min-height: 160px; max-height: 46vh; overflow-y: auto; padding: 8px 10px; background: rgba(0,0,0,.3); border: 1px solid rgba(255,255,255,.08); font: 14px/1.4 'Oswald', sans-serif; overflow-wrap: anywhere; }
  #mp .mpchatlog .ln { padding: 2px 0; } #mp .mpchatlog .ln b { color: #e8b04a; font-weight: 500; } #mp .mpchatlog .ln.sys { color: var(--muted, #9b9486); font-style: italic; }
  #mp .mpsay { display: flex; gap: 6px; } #mp .mpsay input { font-size: 15px; padding: 7px 9px; flex: 1 1 auto; }
  #mp .mpsay button.m { width: auto !important; margin: 0 !important; padding: 7px 12px !important; letter-spacing: .15em !important; flex: none; }
  #mp .mpmic { display: flex !important; align-items: center; justify-content: center; gap: 10px; margin: 0 !important; letter-spacing: .15em !important; }
  #mp .mpmic i { width: 10px; height: 10px; border-radius: 50%; background: #6e685e; flex: none; }
  #mp .mpmic.on { border-color: #6f9a5c !important; } #mp .mpmic.on i { background: #6fe07a; box-shadow: 0 0 8px #6fe07a; }
  #mp .btns.sticky { flex-wrap: wrap; }
  #mp .btns.sticky button.m { min-width: 0; white-space: normal; letter-spacing: .14em !important; }
  #mp .btns.sticky button.m.on { border-color: #6f9a5c !important; color: #bfe8b0 !important; background: rgba(111,154,92,.18) !important; }
  #mp .btns.sticky button.m[disabled] { opacity: .5; cursor: default; }
  @media (max-width: 860px) { #mp.room #mpBody { grid-template-columns: minmax(0, 1fr); } #mpSide { border-left: 0; padding-left: 0; border-top: 1px solid rgba(255,255,255,.08); padding-top: 8px; margin-top: 12px; } #mp .mpchatlog { min-height: 110px; max-height: 30vh; } }
  @media (max-width: 520px), (max-height: 520px) { #mp .mpcodebox b { font-size: 36px; } #mp .mpcode { font-size: 44px !important; } #mp .mpplayers { grid-template-columns: 1fr; } #mp .mpchars { grid-template-columns: repeat(4, minmax(0, 1fr)); } #mp .mpchar img, #mp .mpchar i { width: 40px; height: 50px; } #mp .dbtn.mpbig .top b { font-size: 24px !important; } }
  #netTags { position: fixed; inset: 0; pointer-events: none; z-index: 8; overflow: hidden; }
  #netTags .ntag { position: absolute; left: 0; top: 0; transform-origin: 50% 100%; text-align: center; white-space: nowrap; will-change: transform; }
  #netTags .ntag b { display: inline-flex; align-items: center; gap: 4px; font: 400 22px 'Bebas Neue', 'Oswald', sans-serif; letter-spacing: .1em; color: #ece6d8; text-shadow: 0 0 4px #000, 0 1px 2px #000; }
  #netTags .ntag b svg { width: 16px; height: 16px; display: none; color: #7fe08a; filter: drop-shadow(0 0 2px #000); }
  #netTags .ntag.talk b svg { display: inline-block; }
  #netTags .ntag i { display: block; width: 56px; height: 4px; margin: 2px auto 0; background: rgba(0,0,0,.55); border: 1px solid rgba(0,0,0,.6); }
  #netTags .ntag s { display: block; height: 100%; background: #c62a1e; text-decoration: none; transition: width .2s; }
  #netTags .ntag.down b { color: #ff6a4a; } #netTags .ntag.down i { display: none; }
  #netTags .ntag u { display: none; text-decoration: none; font: 11px 'Oswald', sans-serif; letter-spacing: .2em; color: #ffb09a; text-shadow: 0 0 3px #000; } #netTags .ntag.down u { display: block; }
  #netToast { position: fixed; top: 74px; left: 50%; transform: translateX(-50%); z-index: 61; display: flex; flex-direction: column; align-items: center; gap: 6px; pointer-events: none; }
  #netToast .nt { padding: 7px 16px; background: rgba(14,13,12,.86); border-left: 2px solid #6e685e; color: #ece6d8; font: 13px 'Oswald', sans-serif; letter-spacing: .08em; opacity: 0; transform: translateY(-6px); transition: all .3s; }
  #netToast .nt.on { opacity: 1; transform: none; } #netToast .nt.good { border-left-color: #6f9a5c; } #netToast .nt.bad { border-left-color: #c62a1e; }
  #netPill { position: fixed; top: 8px; left: 50%; transform: translateX(-50%); z-index: 9; display: none; padding: 3px 12px; background: rgba(14,13,12,.6); border: 1px solid rgba(255,255,255,.08); font: 11px 'Oswald', sans-serif; letter-spacing: .25em; color: #9b9486; pointer-events: none; }
  body.playing #netPill.show { display: block; } #netPill b { color: #ece6d8; font-weight: 500; }
  `;
  document.head.appendChild(st);
}

// ---------------------------------------------------------------- test hooks
export const _dbg = { S, PL, ZM, clocks, sample, viewT, get ws() { return ws; } };
