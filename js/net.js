// net.js — playing Maple Hollow together online (up to 4 survivors in one room).
// HOST-AUTHORITATIVE: the host's browser runs the real game (the dead, the townspeople, the story, the clock, the
// doors, what's been searched). Everybody sends their own body 20 times a second; the host's message also carries a
// snapshot of the world (the dead, the neighbours near anybody, the time, shared things like the helicopter).
// Clients turn the host's zombies and townspeople into puppets (no AI of their own), shown 110 ms in the past and
// smoothly interpolated between snapshots, and send their hits on them to the host. Reliable things (doors, searched
// cupboards, kills, a player getting clawed, story beats) go as ordered events.
// The server (site/server/server.mjs) only keeps the rooms and relays: 'state' (latest-only, 20 Hz) and 'event'.
// Self-contained: init(ctx) injects its own lobby / name tags / toasts (DOM + CSS); main.js wires the callbacks.
import * as THREE from 'three';
import { Soldier, clamp, lerp, damp, wrapPi } from './soldier.js';
import { makeWeaponMesh, WEAPONS } from './weapons.js';
import { Melee, MELEE } from './melee.js';
import { Z, wake, sleep, zombiePose } from './zombies.js';
import { refreshHitShapes, damage as rawDamage } from './combat.js';
import { C } from './state.js';
import { styleFemale } from './hair.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const r2 = x => Math.round(x * 100) / 100, r1 = x => Math.round(x * 10) / 10;
const now = () => performance.now();
const DELAY = 110;          // ms: remote things are shown this far in the past (two 20 Hz snapshots, plus jitter)
const MAXP = 4;
const DIFF_LIST = [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard'], ['extreme', 'Extreme'], ['apocalypse', 'Apocalypse'], ['zombiex', 'ZombieX']];
const HOLD = new Set(['Death_D', 'Hit_Knockback']), LOOP = new Set(['Fixing_Kneeling']);
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { } } };

let X = null;                                   // the ctx main.js gave init()
let ws = null;
export let localId = 0;
// everything about the connection and the room
const S = { connected: false, want: false, retry: 0, retryT: null, code: '', roomName: '', pub: true, hostId: 0, meta: {}, started: false, settings: null,
  inGame: false, intent: null, err: '', rooms: [], view: 'home', diff: 'medium' };
const PL = new Map();                           // id -> { id, name, ready, body, R (puppet, once they send their body) }
export const shared = {};                       // host-owned bits everyone sees (helicopter: { x, y, z, yaw, phase, t } ...)
const cb = { onStart: null, onPlayerJoin: null, onPlayerLeave: null, onHurt: null, onEvent: null, onHostChange: null, onMsg: null, onLeft: null };
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
  if (new URLSearchParams(location.search).has('ws')) X.url = new URLSearchParams(location.search).get('ws');
}
export function setCallbacks(o) { Object.assign(cb, o); }

// ---------------------------------------------------------------- connection
function wsURL() {
  if (X.url) return X.url;
  const l = location;
  if (l.protocol === 'http:' || l.protocol === 'https:') return (l.protocol === 'https:' ? 'wss://' : 'ws://') + l.host + '/ws';
  return 'wss://zombie-apocalypse-game.fly.dev/ws';   // the Mac app (zapoc://) talks to the live server
}
function connect() {
  S.want = true;
  if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
  clearTimeout(S.retryT);
  try { ws = new WebSocket(wsURL()); } catch (e) { return lost(); }
  const me = ws;
  ws.onopen = () => { if (me !== ws) return; S.connected = true; S.retry = 0; send({ t: 'hello', name: myName() }); pill(); render(); };
  ws.onmessage = e => { if (me !== ws) return; let m; try { m = JSON.parse(e.data); } catch { return; } try { handle(m); } catch (er) { console.error('net', m.t, er); } };
  ws.onclose = () => { if (me !== ws) return; S.connected = false; lost(); };
  ws.onerror = () => { };
}
// the connection dropped: try again (1, 2, 4 ... 10 s) and get back into the same room
function lost() {
  S.connected = false; pill(); render();
  if (!S.want) return;
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
  if (S.code) send({ t: 'leave' });
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
      if (I && I.create) send({ t: 'create', name: I.create.name, public: I.create.pub, diff: S.diff, phase: 'Lobby' });
      else if (I && I.join) send({ t: 'join', code: I.join });
      else if (S.view === 'browse') send({ t: 'list' });
      break;
    }
    case 'rooms': S.rooms = m.rooms || []; render(); break;
    case 'joined': {
      const rejoin = S.inGame;
      S.code = m.code; S.wasHost = m.host === localId; S.roomName = m.name; S.pub = m.public; S.hostId = m.host; S.meta = m.meta || {}; S.err = '';
      store.set('za_room', m.code);
      if (S.meta.diff && DIFF_LIST.some(d => d[0] === S.meta.diff)) S.diff = S.meta.diff;
      for (const p of [...PL.values()]) if (!m.players.some(q => q.id === p.id)) dropPlayer(p.id, 'lost', true);
      for (const q of m.players) addPlayer(q.id, q.name, true);
      me().ready = m.host === localId;
      S.view = 'room'; render(); pill();
      sendHi();
      if (rejoin) {   // back after a drop: the host will send us the world again
        toast('Reconnected', 'good'); S.ready = false;
        if (m.host !== localId && S.wasHost) becomeClient();
      }
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
    case 'meta': S.meta = { ...S.meta, ...m }; S.roomName = m.name; S.pub = m.public; if (m.diff && DIFF_LIST.some(d => d[0] === m.diff)) S.diff = m.diff; render(); break;
    case 'left': break;
    case 'kicked': { const g = S.inGame; leave(); S.view = 'home'; S.err = m.why || 'Removed from the room.'; render(); if (g && cb.onLeft) cb.onLeft('kicked'); break; }
    case 'state': if (m.d) onState(m.from, m.d); break;
    case 'event': if (m.d) onEvent(m.from, m.d); break;
    case 'error': {
      if (m.code === 'rate' && S.inGame) break;
      if ((m.code === 'noroom' || m.code === 'full' || m.code === 'closed') && S.inGame) { toast('Could not get back into the room — playing on alone', 'bad'); goSolo(); break; }
      S.err = m.msg || m.code; render(); break;
    }
  }
}
function me() { return PL.get(localId) || addPlayer(localId, myName(), true); }
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
function sendHi(to) { const m = me(); ev({ k: 'hi', name: myName(), ready: m.ready, body: X.getBody ? X.getBody() : 'human' }, to); }

// ---------------------------------------------------------------- events
function onEvent(from, d) {
  const p = PL.get(from);
  switch (d.k) {
    case 'hi': { const q = addPlayer(from, d.name); q.ready = !!d.ready; q.body = d.body || q.body; render(); break; }
    case 'ready': if (p) { p.ready = !!d.v; render(); } break;
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
  const settings = { diff: S.diff, seed: (Math.random() * 1e9) | 0, room: S.code };
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
const viewT = id => { const c = clocks.get(id); return c ? now() - c.off - DELAY : 0; };
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
    o.x = A.a[ix] + A.a[ivx] * dt; o.z = A.a[iz] + A.a[ivz] * dt; o.yaw = A.a[iy]; o.vx = A.a[ivx]; o.vz = A.a[ivz]; o.a = A.a; o.k = 0;
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
  if (body === 'michelle') try { styleFemale(s, 11); } catch { }
  s.update(1 / 60, {});
  const u = { s, team: 0, hp: 100, maxHp: 100, alive: true, remote: true, npc: true, netId: p.id, name: p.name, kills: 0, deaths: 0, hurtT: 99, deadT: 0, head: V(), chest: V() };
  const mel = X.SWINGS ? new Melee(s, X.scene, X.SWINGS) : null;
  if (mel) mel.hideAll();
  const tag = document.createElement('div'); tag.className = 'ntag';
  tag.innerHTML = '<b></b><i><s></s></i>'; netTags.appendChild(tag);
  const R = { p, u, s, body, buf: [], mel, guns: {}, weap: null, tag, tagName: tag.querySelector('b'), tagHp: tag.querySelector('s'), losT: 0, seen: true, veh: null, lastYaw: null };
  R.tagName.textContent = p.name;
  return R;
}
function killPuppet(R) {
  R.s.setVisible(false); R.s.pivot.removeFromParent();
  if (R.mel) for (const k in R.mel.meshes) R.mel.meshes[k].removeFromParent();
  for (const k in R.guns) R.guns[k].removeFromParent();
  R.tag.remove(); R.u.alive = false; R.u.gone = true;
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
    const show = !R.veh && a[18] !== 0;
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
  const t = viewT(S.hostId);
  let chasing = 0, closeN = 0;
  for (const u of ZM.values()) {
    const o = sample(u.nbuf, t, 1, 2, 3, 4, 5); if (!o) continue;
    const a = o.a, f = a[6], s = u.s, d = s.pos.distanceTo(F);
    u.hp = a[12]; u.big = !!(f & 2); u.crawl = !!(f & 16); u.limp = !!(f & 32);
    if (!(f & 1) && u.alive) { u.alive = false; u.deadT = 0; s.dead = true; s.resetActs(); s.play('Death_D', { hold: true, fade: 0.1, rate: 1.1 }); }
    else if ((f & 1) && !u.alive) { u.alive = true; s.dead = false; s.resetActs(); }
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
  const list = X.people ? X.people() : [], t = viewT(S.hostId), here = new Set(NPC.list.map(e => e[0]));
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
      if (isHost()) d.w = worldSnap();
      send({ t: 'state', d });
      if (isHost() && ++seq % 4 === 0) watchWorld();
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

// ---------------------------------------------------------------- lobby
let root, netTags, toastBox, pillEl;
function myName() { return (S.name || '').trim() || 'Survivor'; }
export function openLobby() {
  root.classList.add('show');
  if (S.code) S.view = 'room'; else if (S.view === 'room') S.view = 'home';
  if (!S.connected) connect();
  render();
  setTimeout(() => { const i = root.querySelector('#nlName'); if (i && !i.value) i.focus(); }, 50);
}
export function closeLobby() { root.classList.remove('show'); }
export function lobbyOpen() { return root && root.classList.contains('show'); }
function act(a, el) {
  const val = id => (root.querySelector(id) || {}).value || '';
  if ((a === 'make' || a === 'join') && S.connected) { clearTimeout(dom.t); send({ t: 'hello', name: myName() }); }   // the name first
  switch (a) {
    case 'name': S.name = val('#nlName').slice(0, 16); store.set('za_name', S.name); if (S.connected) send({ t: 'hello', name: myName() }); break;
    case 'create': S.view = 'create'; render(); break;
    case 'browse': S.view = 'browse'; if (S.connected) send({ t: 'list' }); render(); break;
    case 'joincode': S.view = 'join'; render(); setTimeout(() => root.querySelector('#nlCode')?.focus(), 30); break;
    case 'back': if (S.code) { leave(); } S.view = 'home'; S.err = ''; render(); break;
    case 'close': closeLobby(); if (!S.inGame && S.code) leave(); if (cb.onEvent) emitEv({ k: 'lobbyClosed' }); break;
    case 'refresh': send({ t: 'list' }); break;
    case 'make': {
      const create = { name: val('#nlRoom') || `${myName()}'s game`, pub: !root.querySelector('#nlPriv').checked };
      S.diff = val('#nlDiff') || S.diff;
      if (S.connected) send({ t: 'create', name: create.name, public: create.pub, diff: S.diff, phase: 'Lobby' }); else { S.intent = { create }; connect(); }
      break;
    }
    case 'join': {
      const code = (el && el.dataset.code) || val('#nlCode').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
      if (code.length !== 4) { S.err = 'Room codes are 4 letters.'; render(); break; }
      if (S.connected) send({ t: 'join', code }); else { S.intent = { join: code }; connect(); }
      break;
    }
    case 'ready': { const m = me(); m.ready = !m.ready; ev({ k: 'ready', v: m.ready }); render(); break; }
    case 'diff': if (isHost()) { S.diff = val('#nlDiff2'); send({ t: 'meta', diff: S.diff }); } break;
    case 'priv': if (isHost()) send({ t: 'meta', public: !root.querySelector('#nlPriv2').checked }); break;
    case 'start': hostStart(); break;
    case 'kick': if (isHost()) send({ t: 'kick', id: +el.dataset.id }); break;
    case 'copy': try { navigator.clipboard.writeText(S.code); toast('Room code copied', 'grey'); } catch { } break;
  }
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const diffName = id => (DIFF_LIST.find(d => d[0] === id) || [id, id])[1];
function render() {
  if (!root) return;
  const box = root.querySelector('.npanel'), conn = S.connected ? '<span class="ok">online</span>' : S.want ? '<span class="wait">connecting…</span>' : '<span>offline</span>';
  const err = S.err ? `<div class="nerr">${esc(S.err)}</div>` : '';
  const diffSel = (id, cur, dis) => `<select id="${id}" ${dis ? 'disabled' : ''}>${DIFF_LIST.map(([k, n]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
  let h = `<div class="eyebrow">Co-op · up to ${MAXP} survivors · ${conn}</div>`;
  if (S.view === 'home') {
    h += `<h2>PLAY ONLINE</h2><div class="sub">Get through the outbreak together.</div>
      <label class="nrow">Your name<input id="nlName" maxlength="16" value="${esc(S.name)}" placeholder="Survivor" data-in="name"></label>
      <button class="nbtn red" data-a="create"><b>Create a room</b><small>you host · pick the difficulty</small></button>
      <button class="nbtn" data-a="joincode"><b>Join with a code</b><small>4 letters from a friend</small></button>
      <button class="nbtn" data-a="browse"><b>Public rooms</b><small>jump into someone's game</small></button>
      ${err}<div class="nfoot"><button class="nlink" data-a="close">Back</button></div>`;
  } else if (S.view === 'create') {
    h += `<h2>NEW ROOM</h2><div class="sub">You'll be the host: your game runs the world.</div>
      <label class="nrow">Room name<input id="nlRoom" maxlength="24" placeholder="${esc(myName())}'s game"></label>
      <label class="nrow">Difficulty${diffSel('nlDiff', S.diff)}</label>
      <label class="nrow nchk"><input type="checkbox" id="nlPriv"> Private (code only, not in the public list)</label>
      <button class="nbtn red" data-a="make"><b>Create</b></button>${err}
      <div class="nfoot"><button class="nlink" data-a="back">Back</button></div>`;
  } else if (S.view === 'join') {
    h += `<h2>JOIN A ROOM</h2><div class="sub">Type the 4-letter code.</div>
      <input id="nlCode" class="ncode" maxlength="4" autocomplete="off" spellcheck="false" placeholder="ABCD" data-enter="join">
      <button class="nbtn red" data-a="join"><b>Join</b></button>${err}
      <div class="nfoot"><button class="nlink" data-a="back">Back</button></div>`;
  } else if (S.view === 'browse') {
    const rows = S.rooms.length ? S.rooms.map(r => `<button class="nroom" data-a="join" data-code="${esc(r.code)}"><span><b>${esc(r.name)}</b><small>host ${esc(r.host)} · ${esc(diffName(r.diff))} · ${esc(r.phase)}</small></span><em>${r.n}/${r.max}</em></button>`).join('')
      : `<div class="nempty">${S.connected ? 'No public rooms right now. Make one!' : 'Connecting…'}</div>`;
    h += `<h2>PUBLIC ROOMS</h2><div class="nlist">${rows}</div>${err}
      <div class="nfoot"><button class="nlink" data-a="back">Back</button><button class="nlink" data-a="refresh">Refresh</button></div>`;
  } else if (S.view === 'room') {
    const host = isHost(), list = [...PL.values()].sort((a, b) => (b.id === S.hostId) - (a.id === S.hostId) || a.id - b.id);
    const allReady = list.every(p => p.id === S.hostId || p.ready);
    const rows = list.map(p => `<div class="nplayer ${p.id === localId ? 'me' : ''}"><span class="nstat ${p.id === S.hostId ? 'host' : p.ready ? 'rdy' : ''}">${p.id === S.hostId ? 'HOST' : p.ready ? 'READY' : 'NOT READY'}</span><b>${esc(p.name)}</b>${p.id === localId ? '<small>you</small>' : ''}${host && p.id !== localId ? `<button class="nkick" data-a="kick" data-id="${p.id}" title="Remove">✕</button>` : ''}</div>`).join('')
      + Array.from({ length: Math.max(0, MAXP - list.length) }, () => '<div class="nplayer empty"><span class="nstat"></span><b>waiting…</b></div>').join('');
    h += `<h2>${esc(S.roomName || 'ROOM')}</h2>
      <div class="ncodebox" data-a="copy" title="Copy">ROOM CODE <b>${esc(S.code)}</b></div>
      <div class="nplayers">${rows}</div>
      <label class="nrow">Difficulty${host ? diffSel('nlDiff2', S.diff) : `<span class="nval">${esc(diffName(S.diff))}</span>`}</label>
      ${host ? `<label class="nrow nchk"><input type="checkbox" id="nlPriv2" ${S.pub ? '' : 'checked'}> Private room</label>` : ''}
      ${S.started && !S.inGame ? '<div class="sub">This game is already under way — you\'ll join it in progress.</div>' : ''}
      ${host ? `<button class="nbtn red" data-a="start" ${allReady ? '' : 'disabled'}><b>${S.inGame ? 'Back to the game' : 'Start'}</b><small>${allReady ? 'everyone is ready' : 'waiting for everyone to be ready'}</small></button>`
        : `<button class="nbtn ${me().ready ? 'on' : 'red'}" data-a="ready"><b>${me().ready ? 'Ready ✓' : 'Ready up'}</b><small>the host starts the game</small></button>`}
      ${err}<div class="nfoot"><button class="nlink" data-a="back">Leave room</button>${S.inGame ? '<button class="nlink" data-a="close">Close</button>' : ''}</div>`;
  }
  box.innerHTML = h;
}
function dom() {
  root = document.createElement('div'); root.id = 'netLobby';
  root.innerHTML = '<div class="npanel center-panel"></div>';
  document.body.appendChild(root);
  root.addEventListener('click', e => { e.stopPropagation(); const b = e.target.closest('[data-a]'); if (b && !b.disabled) act(b.dataset.a, b); });
  root.addEventListener('change', e => { if (e.target.id === 'nlDiff2') act('diff'); else if (e.target.id === 'nlPriv2') act('priv'); else if (e.target.id === 'nlDiff') S.diff = e.target.value; });
  root.addEventListener('input', e => { if (e.target.dataset.in === 'name') { S.name = e.target.value.slice(0, 16); store.set('za_name', S.name); clearTimeout(dom.t); dom.t = setTimeout(() => S.connected && send({ t: 'hello', name: myName() }), 500); } if (e.target.id === 'nlCode') e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); });
  // typing in the lobby must not move you / open the bag (main.js listens on window)
  for (const ty of ['keydown', 'keyup', 'keypress']) root.addEventListener(ty, e => { e.stopPropagation(); if (ty === 'keydown' && e.key === 'Enter' && e.target.dataset.enter) act(e.target.dataset.enter); if (ty === 'keydown' && e.key === 'Escape') act(S.view === 'home' || S.view === 'room' ? 'close' : 'back'); });
  root.addEventListener('pointerdown', e => e.stopPropagation()); root.addEventListener('mousedown', e => e.stopPropagation());
  netTags = document.createElement('div'); netTags.id = 'netTags'; document.body.appendChild(netTags);
  toastBox = document.createElement('div'); toastBox.id = 'netToast'; document.body.appendChild(toastBox);
  pillEl = document.createElement('div'); pillEl.id = 'netPill'; document.body.appendChild(pillEl);
}
function pill() {
  if (!pillEl) return;
  const bad = S.code && !S.connected;
  pillEl.className = bad ? 'show bad' : S.code && S.inGame ? 'show' : '';
  pillEl.innerHTML = bad ? 'RECONNECTING…' : `<b>${esc(S.code)}</b> ${PL.size}/${MAXP}${isHost() ? ' · HOST' : ''}`;
}
const toasts = [];
export function toast(text, kind = 'grey') {
  if (X && X.toast && S.inGame) { try { X.toast(text, kind); return; } catch { } }
  const e = document.createElement('div'); e.className = 'nt ' + kind; e.textContent = text; toastBox.appendChild(e);
  toasts.push({ e, t: 3.5 }); requestAnimationFrame(() => e.classList.add('on'));
}
function toastStep(dt) {
  for (let i = toasts.length - 1; i >= 0; i--) { const T = toasts[i]; T.t -= dt; if (T.t < 0.4) T.e.classList.remove('on'); if (T.t <= 0) { T.e.remove(); toasts.splice(i, 1); } }
  pill();
}
function css() {
  const st = document.createElement('style'); st.id = 'netCss';
  st.textContent = `
  #netLobby { position: fixed; inset: 0; z-index: 60; display: none; align-items: center; justify-content: center; background: radial-gradient(ellipse at center, rgba(20,6,4,.72), rgba(0,0,0,.92)); }
  #netLobby.show { display: flex; }
  #netLobby .npanel { width: min(460px, calc(100vw - 32px)); max-height: calc(100vh - 40px); overflow: auto; padding: 28px 30px 20px; background: var(--glass, rgba(14,13,12,.85)); border: 1px solid var(--edge, rgba(255,255,255,.08)); border-top: 2px solid var(--red, #c62a1e); box-shadow: 0 30px 80px rgba(0,0,0,.7); color: var(--bone, #ece6d8); font-family: 'Oswald', sans-serif; box-sizing: border-box; }
  #netLobby .eyebrow { font-size: 10px; letter-spacing: .4em; text-transform: uppercase; color: var(--red, #c62a1e); margin-bottom: 6px; }
  #netLobby .eyebrow .ok { color: #7fbf6a; } #netLobby .eyebrow .wait { color: #c9a24a; }
  #netLobby h2 { font-family: 'Bebas Neue', 'Oswald', sans-serif; font-weight: 400; font-size: 44px; letter-spacing: .08em; line-height: 1; margin: 0 0 4px; word-break: break-word; }
  #netLobby .sub { font-family: 'Special Elite', monospace; font-size: 12px; letter-spacing: .1em; color: var(--muted, #9b9486); margin: 0 0 18px; }
  #netLobby .nrow { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 11px; letter-spacing: .25em; text-transform: uppercase; color: var(--muted, #9b9486); padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,.05); margin-bottom: 8px; }
  #netLobby .nrow.nchk { justify-content: flex-start; letter-spacing: .12em; text-transform: none; font-size: 13px; cursor: pointer; }
  #netLobby input[type=text], #netLobby input:not([type]), #netLobby select { background: #141210; color: var(--bone, #ece6d8); border: 1px solid var(--edge2, rgba(255,255,255,.14)); border-radius: 2px; font: 15px 'Oswald', sans-serif; padding: 7px 10px; width: 210px; outline: none; letter-spacing: .04em; text-transform: none; }
  #netLobby input:focus, #netLobby select:focus { border-color: var(--red, #c62a1e); }
  #netLobby input[type=checkbox] { accent-color: #c62a1e; width: 16px; height: 16px; }
  #netLobby .ncode { display: block; width: 100% !important; box-sizing: border-box; text-align: center; font: 52px 'Bebas Neue', sans-serif !important; letter-spacing: .5em !important; padding: 8px 0 4px .5em !important; margin-bottom: 12px; text-transform: uppercase !important; }
  #netLobby .nbtn { display: block; width: 100%; text-align: left; margin: 8px 0; padding: 12px 16px; background: rgba(255,255,255,.03); border: 1px solid var(--edge2, rgba(255,255,255,.14)); color: var(--bone, #ece6d8); cursor: pointer; border-radius: 2px; transition: all .16s; font-family: 'Oswald', sans-serif; }
  #netLobby .nbtn b { display: block; font: 400 24px 'Bebas Neue', sans-serif; letter-spacing: .12em; }
  #netLobby .nbtn small { display: block; font-size: 12px; font-weight: 300; color: var(--muted, #9b9486); letter-spacing: .04em; }
  #netLobby .nbtn:hover:not([disabled]) { border-color: var(--red, #c62a1e); background: rgba(198,42,30,.12); transform: translateX(3px); }
  #netLobby .nbtn.red { border-color: rgba(198,42,30,.7); background: rgba(198,42,30,.18); }
  #netLobby .nbtn.on { border-color: #6f9a5c; background: rgba(111,154,92,.16); }
  #netLobby .nbtn[disabled] { opacity: .45; cursor: default; }
  #netLobby .nfoot { display: flex; justify-content: space-between; margin-top: 14px; }
  #netLobby .nlink { background: none; border: 0; color: var(--muted, #9b9486); font: 11px 'Oswald', sans-serif; letter-spacing: .3em; text-transform: uppercase; cursor: pointer; padding: 6px 0; }
  #netLobby .nlink:hover { color: var(--bone, #ece6d8); }
  #netLobby .nerr { margin-top: 10px; padding: 8px 12px; border-left: 2px solid var(--red, #c62a1e); background: rgba(198,42,30,.12); font-size: 13px; color: #f0b4ac; }
  #netLobby .nlist { max-height: 300px; overflow: auto; margin-bottom: 6px; }
  #netLobby .nroom { display: flex; width: 100%; align-items: center; justify-content: space-between; gap: 10px; margin: 6px 0; padding: 10px 14px; background: rgba(255,255,255,.03); border: 1px solid var(--edge, rgba(255,255,255,.08)); color: var(--bone, #ece6d8); cursor: pointer; text-align: left; font-family: 'Oswald', sans-serif; border-radius: 2px; }
  #netLobby .nroom:hover { border-color: var(--red, #c62a1e); }
  #netLobby .nroom b { display: block; font-size: 16px; font-weight: 500; letter-spacing: .04em; } #netLobby .nroom small { font-size: 11px; color: var(--muted, #9b9486); font-weight: 300; }
  #netLobby .nroom em { font: 400 26px 'Bebas Neue', sans-serif; font-style: normal; color: var(--red, #c62a1e); letter-spacing: .08em; }
  #netLobby .nempty { padding: 24px 0; text-align: center; color: var(--dim, #6e685e); font-family: 'Special Elite', monospace; font-size: 13px; }
  #netLobby .ncodebox { margin: 4px 0 16px; padding: 8px 14px; border: 1px dashed rgba(198,42,30,.6); font-size: 10px; letter-spacing: .4em; color: var(--muted, #9b9486); cursor: pointer; display: flex; align-items: center; justify-content: space-between; }
  #netLobby .ncodebox b { font: 400 40px 'Bebas Neue', sans-serif; letter-spacing: .3em; color: var(--bone, #ece6d8); }
  #netLobby .nplayers { margin-bottom: 12px; }
  #netLobby .nplayer { display: flex; align-items: center; gap: 12px; padding: 9px 12px; margin: 4px 0; background: rgba(255,255,255,.035); border-left: 2px solid rgba(255,255,255,.1); }
  #netLobby .nplayer.me { border-left-color: var(--red, #c62a1e); }
  #netLobby .nplayer.empty { opacity: .35; } #netLobby .nplayer.empty b { font-weight: 300; font-style: italic; }
  #netLobby .nplayer b { font-size: 17px; font-weight: 500; letter-spacing: .04em; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #netLobby .nplayer small { font-size: 10px; letter-spacing: .3em; color: var(--dim, #6e685e); text-transform: uppercase; }
  #netLobby .nstat { width: 78px; font-size: 9px; letter-spacing: .25em; color: var(--dim, #6e685e); }
  #netLobby .nstat.host { color: #c9a24a; } #netLobby .nstat.rdy { color: #7fbf6a; }
  #netLobby .nkick { background: none; border: 0; color: var(--dim, #6e685e); cursor: pointer; font-size: 14px; } #netLobby .nkick:hover { color: var(--red, #c62a1e); }
  #netLobby .nval { font-size: 16px; letter-spacing: .06em; color: var(--bone, #ece6d8); text-transform: none; }
  #netTags { position: fixed; inset: 0; pointer-events: none; z-index: 8; overflow: hidden; }
  #netTags .ntag { position: absolute; left: 0; top: 0; transform-origin: 50% 100%; text-align: center; white-space: nowrap; will-change: transform; }
  #netTags .ntag b { display: block; font: 400 22px 'Bebas Neue', 'Oswald', sans-serif; letter-spacing: .1em; color: #ece6d8; text-shadow: 0 0 4px #000, 0 1px 2px #000; }
  #netTags .ntag i { display: block; width: 56px; height: 4px; margin: 2px auto 0; background: rgba(0,0,0,.55); border: 1px solid rgba(0,0,0,.6); }
  #netTags .ntag s { display: block; height: 100%; background: #c62a1e; text-decoration: none; transition: width .2s; }
  #netTags .ntag.down b { color: #8a1810; } #netTags .ntag.down i { display: none; }
  #netToast { position: fixed; top: 74px; left: 50%; transform: translateX(-50%); z-index: 61; display: flex; flex-direction: column; align-items: center; gap: 6px; pointer-events: none; }
  #netToast .nt { padding: 7px 16px; background: rgba(14,13,12,.86); border-left: 2px solid #6e685e; color: #ece6d8; font: 13px 'Oswald', sans-serif; letter-spacing: .08em; opacity: 0; transform: translateY(-6px); transition: all .3s; }
  #netToast .nt.on { opacity: 1; transform: none; } #netToast .nt.good { border-left-color: #6f9a5c; } #netToast .nt.bad { border-left-color: #c62a1e; }
  #netPill { position: fixed; top: 12px; left: 50%; transform: translateX(-50%); z-index: 9; display: none; padding: 3px 12px; background: rgba(14,13,12,.6); border: 1px solid rgba(255,255,255,.08); font: 11px 'Oswald', sans-serif; letter-spacing: .25em; color: #9b9486; pointer-events: none; }
  #netPill.show { display: block; } #netPill b { color: #ece6d8; font-weight: 500; } #netPill.bad { color: #f0b4ac; border-color: #c62a1e; animation: npulse 1s infinite alternate; }
  @keyframes npulse { to { opacity: .5; } }
  @media (max-width: 520px) { #netLobby .npanel { padding: 22px 16px 16px; } #netLobby .nrow { flex-wrap: wrap; } #netLobby input:not([type]), #netLobby select { width: 100%; } }
  `;
  document.head.appendChild(st);
}

// ---------------------------------------------------------------- test hooks
export const _dbg = { S, PL, ZM, clocks, sample, viewT, get ws() { return ws; } };
