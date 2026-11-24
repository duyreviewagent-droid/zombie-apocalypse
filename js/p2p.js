// p2p.js — online rooms with NO game server: the players' browsers talk to each other directly (WebRTC data
// channels), and find each other through free public signalling (Trystero: Nostr relays + WebTorrent trackers at the
// same time, so if one kind is down the other still works).
//
// P2PSocket looks like the WebSocket net.js used to open to site/server/server.mjs, and speaks the same protocol
// (hello/create/join/leave/meta/kick/chat/state/event/rtc/ping in; welcome/joined/peer+/peer-/host/meta/left/
// kicked/chat/state/event/rtc/pong/error out). The "server" is now emulated inside every player's page:
//   - the room is the Trystero room named after the 5-letter code (appId 'zombie-apocalypse-game-v1')
//   - whoever created the room is the host; everybody introduces themselves to everybody ('hi')
//   - the host turns away a 5th player ('full'); when the host leaves, the player with the lowest id takes over
//   - before the page reloads to load another map, a player says 'reload' so the others keep them (60 s)
// Nothing personal is sent: only the name typed in the game, game state, chat text and (voice.js) voice.
const APP_ID = 'zombie-apocalypse-game-v1';
const NOSTR = ['wss://nos.lol', 'wss://relay.primal.net', 'wss://relay.nostr.net', 'wss://nostr.sathoarder.com', 'wss://relay.snort.social', 'wss://relay.damus.io'];
const TRACKERS = ['wss://tracker.openwebtorrent.com', 'wss://tracker.webtorrent.dev'];
const MAX = 4, NAME_MAX = 30;   // players in a room; characters in a name
const JOIN_WAIT = 25000, REJOIN_WAIT = 50000;   // ms to find the host (a rejoin after a reload waits longer)
// When is somebody really gone? Phones and iPads pause a page that isn't on screen, Wi-Fi hiccups, a slow device
// freezes for a few seconds loading the map — none of that is "leaving". So:
//  - a closed connection only counts after AWAY_KEEP with no way back (Trystero reconnects by itself meanwhile, and
//    the same player on a new connection carries straight on, with no message)
//  - silence (no messages at all, connection still open): the host after HOST_SILENT (the game can't wait for ever
//    for the dead to move), anybody else after SILENT; a page that was itself frozen doesn't count that time
//  - someone who said they're reloading (to load the host's map) is kept RELOAD_KEEP
const AWAY_KEEP = 30000, HOST_SILENT = 30000, SILENT = 120000, RELOAD_KEEP = 60000;
const now = () => Date.now();
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';      // no I / O (they look like 1 / 0)
export const newCode = () => Array.from({ length: 5 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');

// can this page do it? (WebRTC + WebCrypto, which needs a secure page: https or localhost)
export function supported() {
  return typeof RTCPeerConnection !== 'undefined' && !!(globalThis.crypto && crypto.subtle) && globalThis.isSecureContext !== false;
}

let libs = null;   // the vendored Trystero strategies, loaded on first use (single player never loads them)
async function loadLibs() {
  if (!libs) libs = Promise.allSettled([import('./vendor/trystero/nostr.js'), import('./vendor/trystero/torrent.js')]).then(r => r.filter(x => x.status === 'fulfilled').map(x => x.value));
  return libs;
}

// one room over every strategy that loaded: a peer may show up on several; we talk to it through the first
async function joinAll(code, on) {
  const strats = await loadLibs();
  if (!strats.length) throw new Error('could not load the networking code');
  const rooms = [], where = new Map();   // peerId -> Set of room indexes
  strats.forEach((S, i) => {
    let R;
    try { R = S.joinRoom({ appId: APP_ID, relayUrls: i === 0 ? NOSTR : TRACKERS }, code); } catch (e) { console.warn('p2p join', e); return; }
    const k = rooms.length;
    const [send, get] = R.makeAction('za');
    rooms.push({ R, send });
    R.onPeerJoin(id => { let s = where.get(id); const fresh = !s || !s.size; if (!s) where.set(id, s = new Set()); s.add(k); if (fresh) on.join(id); });
    R.onPeerLeave(id => { const s = where.get(id); if (!s) return; s.delete(k); if (!s.size) { where.delete(id); on.leave(id); } });
    get((d, id) => on.data(d, id));
  });
  if (!rooms.length) throw new Error('could not join');
  return {
    send(d, to) {   // to: peerId, an array of them, or null for everyone
      const list = to == null ? [...where.keys()] : Array.isArray(to) ? to : [to];
      const by = new Map();
      for (const id of list) { const s = where.get(id); if (!s || !s.size) continue; const k = [...s][0]; (by.get(k) || by.set(k, []).get(k)).push(id); }
      for (const [k, ids] of by) try { rooms[k].send(d, ids); } catch (e) { console.warn('p2p send', e); }
    },
    peers: () => [...where.keys()],
    leave() { for (const r of rooms) try { r.R.leave(); } catch { } where.clear(); },
  };
}

export class P2PSocket {
  // opts: { id: this player's number (kept across a reload), resume: { code, host: bool } to get back into a room }
  constructor(opts = {}) {
    this.readyState = 0; this.onopen = this.onmessage = this.onclose = this.onerror = null;
    this.id = opts.id; this.name = 'Survivor'; this.resume = opts.resume || null;
    this.room = null;
    setTimeout(() => {
      if (this.readyState !== 0) return;
      if (!supported()) { this.readyState = 3; this._emit({ t: 'error', code: 'unsupported', msg: 'Online play needs a secure web page (https) with WebRTC — open the game\'s website to play together.' }); this.onclose && this.onclose({}); return; }
      this.readyState = 1; this.onopen && this.onopen({});
      this._tick = setInterval(() => this._heartbeat(), 2000);
    }, 0);
  }
  close() { if (this.readyState === 3) return; this._leave(true); this.readyState = 3; clearInterval(this._tick); this.onclose && this.onclose({}); }
  send(str) {
    if (this.readyState !== 1) return;
    let m; try { m = typeof str === 'string' ? JSON.parse(str) : str; } catch { return; }
    try { this._in(m); } catch (e) { console.error('p2p', m && m.t, e); }
  }
  _emit(o) { const s = JSON.stringify(o); queueMicrotask(() => { if (this.onmessage) this.onmessage({ data: s }); }); }
  _err(code, msg) { this._emit({ t: 'error', code, msg }); }

  // ------------------------------------------------------------ what net.js asks for
  _in(m) {
    const R = this.room;
    switch (m.t) {
      case 'hello': {
        if (m.name) this.name = String(m.name).slice(0, NAME_MAX);
        if (!this.welcomed) { this.welcomed = true; this._emit({ t: 'welcome', id: this.id, name: this.name, ver: 'p2p', rooms: [] }); }
        else if (R && R.joined) this._hiAll(true);
        break;
      }
      case 'list': this._emit({ t: 'rooms', rooms: [] }); break;
      case 'create': {
        if (R) return this._err('inroom', 'Already in a room.');
        const code = (m.code && /^[A-Z]{5}$/.test(m.code)) ? m.code : newCode();
        this._open(code, true, { name: m.name || `${this.name}'s game`, diff: m.diff, map: m.map, max: Math.max(2, Math.min(MAX, +m.max || MAX)), phase: m.phase || 'Lobby' }, false);
        break;
      }
      case 'join': {
        if (R) return this._err('inroom', 'Already in a room.');
        const code = String(m.code || '').toUpperCase().replace(/[^A-Z]/g, '');
        if (code.length !== 5) return this._err('noroom', 'Room codes are 5 letters.');
        this._open(code, false, null, !!m.rejoin);
        break;
      }
      case 'leave': this._leave(false); this._emit({ t: 'left' }); break;
      case 'meta': {
        if (!R || !R.joined) return this._err('notin', 'Not in a room.');
        if (R.hostId !== this.id) return this._err('nothost', 'Only the host can change that.');
        if (m.max) m.max = Math.max(2, Math.min(MAX, +m.max || MAX));
        for (const k of ['name', 'diff', 'map', 'phase', 'open', 'max']) if (m[k] !== undefined) R.meta[k] = m[k];
        this._bcast({ x: 'meta', meta: R.meta });
        this._emit({ t: 'meta', ...R.meta, public: false });
        break;
      }
      case 'kick': {
        if (!R || R.hostId !== this.id) return this._err('nothost', 'Only the host can do that.');
        const p = this._byId(m.id); if (!p) return this._err('noplayer', 'No such player.');
        this._to(p.peer, { x: 'kick' }); this._drop(p.peer, 'kicked');
        break;
      }
      case 'chat': {
        if (!R || !R.joined) return;
        const text = String(m.text || '').slice(0, 200).trim(); if (!text) return;
        const ts = now();
        this._bcast({ x: 'chat', text, ts });
        this._emit({ t: 'chat', from: this.id, name: this.name, text, ts });
        break;
      }
      case 'state': if (R && R.joined) this._bcast({ x: 'st', d: m.d }); break;
      case 'event': {
        if (!R || !R.joined) return;
        if (m.to != null) { const p = this._byId(m.to); if (p) this._to(p.peer, { x: 'ev', d: m.d }); }
        else this._bcast({ x: 'ev', d: m.d });
        if (m.echo) this._emit({ t: 'event', from: this.id, d: m.d });
        break;
      }
      case 'rtc': { if (!R || !R.joined) return; const p = this._byId(m.to); if (p) this._to(p.peer, { x: 'rtc', d: m.d }); break; }
      case 'ping': this._emit({ t: 'pong', ts: m.ts, now: now() }); break;
      // p2p only: this page is about to reload (to load the host's map) — keep me in the room for a minute
      case 'reload': if (R && R.joined) this._bcast({ x: 'reload' }); break;
      // p2p only: the host hands the game over to another player (eg the host got on the helicopter)
      case 'handoff': {
        if (!R || R.hostId !== this.id) return;
        const p = this._byId(m.id); if (!p) return;
        this._setHost(p.id); this._bcast({ x: 'host', id: p.id });
        break;
      }
    }
  }

  // ------------------------------------------------------------ the room
  async _open(code, asHost, meta, rejoin) {
    const R = this.room = { code, joined: false, hostId: asHost ? this.id : 0, since: asHost ? now() : 0, meta: meta || {}, peers: new Map(), t0: now(), rejoin, net: null, gone: false };
    let net;
    try {
      net = await joinAll(code, {
        join: peer => { if (this.room !== R) return; const q = R.peers.get(peer); if (q) q.awayT = 0; this._to(peer, this._hi()); },
        leave: peer => { if (this.room !== R) return; this._lost(peer, false); },
        data: (d, peer) => { if (this.room !== R || !d || typeof d !== 'object') return; try { this._msg(d, peer); } catch (e) { console.error('p2p msg', d && d.x, e); } },
      });
    } catch (e) {
      if (this.room === R) { this.room = null; this._err('closed', 'Could not reach the internet to find other players. Check your connection and try again.'); }
      return;
    }
    if (this.room !== R) { net.leave(); return; }
    R.net = net;
    for (const peer of net.peers()) this._to(peer, this._hi());
    if (asHost) this._joined();
    else R.waitT = setTimeout(() => this._noHost(), rejoin ? REJOIN_WAIT : JOIN_WAIT);
  }
  _hi(rename = false) {
    const R = this.room, host = R && R.hostId === this.id;
    return { x: 'hi', id: this.id, name: this.name, host: R ? R.hostId : 0, room: host ? { meta: R.meta, n: this._count(), since: R.since } : null, rename };
  }
  _hiAll(rename) { this._bcast(this._hi(rename)); }
  _count() { let n = 1; for (const p of this.room.peers.values()) if (p.ok) n++; return n; }
  _byId(id) { if (!this.room) return null; for (const p of this.room.peers.values()) if (p.id === id) return p; return null; }
  _to(peer, d) { const R = this.room; if (R && R.net) R.net.send(d, peer); }
  _bcast(d) { const R = this.room; if (!R || !R.net) return; const to = [...R.peers.values()].filter(p => p.ok).map(p => p.peer); if (to.length) R.net.send(d, to); }
  _list() { return [{ id: this.id, name: this.name }, ...[...this.room.peers.values()].filter(p => p.ok).map(p => ({ id: p.id, name: p.name }))]; }
  _joined() {
    const R = this.room; R.joined = true; clearTimeout(R.waitT);
    this._emit({ t: 'joined', code: R.code, name: R.meta.name || 'Room', public: false, max: MAX, you: this.id, host: R.hostId, players: this._list(), meta: R.meta });
  }
  _setHost(id) {
    const R = this.room; if (!R || R.hostId === id) return;
    R.hostId = id; if (id === this.id) R.since = now();
    const p = this._byId(id);
    if (R.joined) this._emit({ t: 'host', id, name: id === this.id ? this.name : p ? p.name : 'Survivor' });
  }
  // nobody answered as the host: on a rejoin, if the others are here, the lowest id carries on as host
  _noHost() {
    const R = this.room; if (!R || R.joined) return;
    const others = [...R.peers.values()].filter(p => p.ok);
    if (R.rejoin && others.length) { R.hostId = Math.min(this.id, ...others.map(p => p.id)); this._joined(); if (R.hostId === this.id) this._hiAll(true); return; }
    this._leave(true);
    this._err('noroom', `Couldn't find room ${R.code}. Check the code — and the host has to be in the room.`);
  }
  _msg(d, peer) {
    const R = this.room; let p = R.peers.get(peer);
    if (d.x === 'hi') {
      const id = +d.id; if (!id || id === this.id) return;
      // the same player on a new connection (they reloaded the page): forget the old one quietly
      for (const [k, q] of R.peers) if (q.id === id && k !== peer) { R.peers.delete(k); p = p || { ...q, peer }; }
      const fresh = !p || !p.ok;
      if (!p) p = { id, name: 'Survivor', peer };
      p.peer = peer; p.id = id; p.name = String(d.name || 'Survivor').slice(0, NAME_MAX); p.last = now(); p.reload = 0; p.awayT = 0;
      R.peers.set(peer, p);
      // the host turns away a 5th player
      if (fresh && R.hostId === this.id && R.joined && this._count() >= (R.meta.max || MAX) && !p.ok) { this._to(peer, { x: 'full' }); R.peers.delete(peer); return; }
      const wasOk = p.ok; p.ok = true;
      if (d.room && d.host === id) {   // they say they're the host
        if (R.hostId === this.id && R.joined && id !== this.id) {
          // two hosts (we lost touch for a while and someone took over): the one who took over last keeps it — their
          // game kept the world going for the others while we were away (the one coming back goes along with it)
          const theirs = d.room.since || 0, mine = R.since || 0;
          if (theirs > mine || (theirs === mine && id < this.id)) { R.meta = d.room.meta || R.meta; this._setHost(id); } else { this._to(peer, this._hi()); }
        } else {
          R.meta = d.room.meta || R.meta;
          if (!R.joined) { R.hostId = id; this._joined(); this._hiAll(true); return; }
          this._setHost(id);
        }
      }
      if (R.joined && (!wasOk || d.rename)) this._emit({ t: 'peer+', id, name: p.name, rename: wasOk && !fresh ? true : undefined });
      return;
    }
    if (d.x === 'who') { this._to(peer, this._hi()); return; }
    if (!p || !p.ok) { this._to(peer, { x: 'who' }); this._to(peer, this._hi()); return; }   // not introduced (or we'd given up on them): introduce again
    p.last = now(); p.reload = 0; p.awayT = 0;
    switch (d.x) {
      case 'st': this._emit({ t: 'state', from: p.id, d: d.d }); break;
      case 'ev': this._emit({ t: 'event', from: p.id, d: d.d }); break;
      case 'rtc': this._emit({ t: 'rtc', from: p.id, d: d.d }); break;
      case 'chat': this._emit({ t: 'chat', from: p.id, name: p.name, text: String(d.text || '').slice(0, 200), ts: d.ts || now() }); break;
      case 'meta': if (p.id === R.hostId) { R.meta = d.meta || R.meta; this._emit({ t: 'meta', ...R.meta, public: false }); } break;
      case 'host': if (p.id === R.hostId) this._setHost(+d.id); break;
      case 'bye': this._drop(peer, 'left'); break;
      case 'reload': p.reload = now(); break;
      case 'kick': if (p.id === R.hostId) { this._leave(true); this._emit({ t: 'kicked', why: 'The host removed you from the room.' }); } break;
      case 'full': if (!R.joined) { this._leave(true); this._err('full', 'That room is full.'); } break;
      case 'pg': break;
    }
  }
  // a connection closed: not gone yet — they get AWAY_KEEP to come back (the heartbeat decides)
  _lost(peer) {
    const R = this.room, p = R && R.peers.get(peer); if (!p) return;
    if (!p.ok) { R.peers.delete(peer); return; }
    p.awayT = p.awayT || now();
  }
  _drop(peer, why) {
    const R = this.room, p = R && R.peers.get(peer); if (!p) return;
    R.peers.delete(peer);
    if (!p.ok) return;
    if (R.joined) this._emit({ t: 'peer-', id: p.id, why });
    if (p.id === R.hostId && R.joined) {   // the host is gone: the lowest id left takes over (everyone works it out the same)
      const ids = [this.id, ...[...R.peers.values()].filter(q => q.ok).map(q => q.id)];
      this._setHost(Math.min(...ids));
      if (R.hostId === this.id) this._emit({ t: 'chat', from: 0, name: '', text: 'The host left — you are the host now.', ts: now() });
    }
  }
  _heartbeat() {
    const R = this.room; if (!R || !R.net) return;
    if (R.joined) this._bcast({ x: 'pg' });
    const t = now();
    // this page was frozen for a while (loading a map, a slow frame, a background tab): their messages are still queued
    // up behind it, so nobody counts as silent for that time
    if (this._hbT && t - this._hbT > 5000) for (const p of R.peers.values()) { p.last = Math.max(p.last || 0, t); if (p.awayT) p.awayT = Math.max(p.awayT, t); }
    this._hbT = t;
    for (const [peer, p] of [...R.peers]) {
      if (!p.ok) continue;
      if (p.reload) { if (t - p.reload > RELOAD_KEEP) this._drop(peer, 'lost'); continue; }
      if (p.awayT && t - p.awayT > AWAY_KEEP) { this._drop(peer, 'lost'); continue; }
      if (t - (p.last || t) > (p.id === R.hostId ? HOST_SILENT : SILENT)) this._drop(peer, 'lost');
    }
  }
  _leave(quiet) {
    const R = this.room; if (!R) return;
    clearTimeout(R.waitT);
    try { if (R.net) { this._bcast({ x: 'bye' }); const n = R.net; setTimeout(() => n.leave(), 120); } } catch { }
    this.room = null;
  }
}
export const _test = { APP_ID, NOSTR, TRACKERS };
