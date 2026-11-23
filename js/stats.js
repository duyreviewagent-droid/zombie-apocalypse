// Zombie_Apocalypse — STATS: what you did this run, and everything you've ever done in Maple Hollow.
//  - the lead calls event(name, data) from the game's moments (a kill, a search, a bite...) and tick() every frame;
//    tick measures how far you went on foot / running / at the wheel / on a bike, and how long you've lasted.
//  - commitRun() folds the run into the lifetime totals (localStorage), per difficulty, and checks the records.
//  - three views: the STATS screen (title menu; tabs Lifetime / Per difficulty / Records), a compact 'This run' block
//    for the pause menu, and a results grid for the end-of-run screen. All markup and CSS live in here.
// Everything is plain data (JSON-safe) so it survives reloads; a half-played run is snapshotted every few seconds and,
// if the page closes mid-run, folded in as 'abandoned' next launch (nothing you did is lost).
import { icon } from './icons.js';

export const WEAPONS = ['fists', 'knife', 'bat', 'crowbar', 'machete', 'axe', 'pistol', 'shotgun', 'sniper', 'molotov', 'car', 'other'];
const W_NAME = { fists: 'Fists', knife: 'Knife', bat: 'Bat', crowbar: 'Crowbar', machete: 'Machete', axe: 'Axe', pistol: 'Pistol', shotgun: 'Shotgun', sniper: 'Rifle', molotov: 'Molotov', car: 'Vehicle', other: 'Other' };
const W_ICON = { fists: 'fist', knife: 'knife', bat: 'bat', crowbar: 'crowbar', machete: 'machete', axe: 'axe', pistol: 'pistol', shotgun: 'shotgun', sniper: 'rifle', molotov: 'flame', car: 'keys', other: 'dmg' };
export const CAUSES = ['eaten', 'turned', 'bled', 'starved', 'thirst', 'burned', 'fall', 'crash', 'other'];
const C_NAME = { eaten: 'Eaten', turned: 'Turned', bled: 'Bled out', starved: 'Starved', thirst: 'Thirst', burned: 'Burned', fall: 'Fell', crash: 'Crashed', other: 'Other' };
const C_ICON = { eaten: 'zombie', turned: 'bio', bled: 'blood', starved: 'food', thirst: 'water', burned: 'flame', fall: 'speed', crash: 'keys', other: 'skull' };
// every per-run counter (all start at 0)
export const COUNTERS = ['kills', 'heads', 'humansHurt', 'humansKilled', 'saved', 'items', 'searched', 'food', 'water', 'bandages', 'meds', 'ambulances',
  'bitten', 'grabbed', 'brokeFree', 'doorsBroken', 'carsDriven', 'bikesRidden', 'texts', 'climbs', 'roofs', 'attics', 'towers', 'shots', 'molotovs',
  'miniBosses', 'bosses', 'theZombie'];   // [boss] (bosses.js: who put down the special ones)
const DIST = ['walk', 'run', 'drive', 'cycle'];
const D_DEF = { easy: 'EASY', medium: 'MEDIUM', hard: 'HARD', extreme: 'EXTREME', apocalypse: 'APOCALYPSE', zombiex: 'ZombieX' };
const D_COL = { easy: '#6fae5a', medium: '#c9a24a', hard: '#d07a34', extreme: '#c62a1e', apocalypse: '#8e1a3c', zombiex: '#7a3cc9' };
const WINS = new Set(['helicopter', 'escaped', 'heli', 'truck', 'won']);
// the records, in the order the Records tab shows them. lower: smaller is better (the fastest escape)
const RECORDS = [
  { k: 'hours', name: 'Longest survival', ic: 'clock', fmt: 'hours' },
  { k: 'kills', name: 'Most put down in one run', ic: 'skull' },
  { k: 'heads', name: 'Most headshots in one run', ic: 'target' },
  { k: 'fastest', name: 'Fastest escape', ic: 'speed', fmt: 'hours', lower: true },
  { k: 'saved', name: 'Most survivors saved', ic: 'heart' },
  { k: 'dist', name: 'Farthest travelled', ic: 'stamina', fmt: 'dist' },
  { k: 'items', name: 'Most things found', ic: 'bag' },
  { k: 'searched', name: 'Most places searched', ic: 'box' },
  { k: 'sec', name: 'Longest session', ic: 'moon', fmt: 'sec' },
];

let ctx = {}, KEY = 'zombieapocalypse.stats.v1', life = null, run = null, persist = true, snapT = 0, lastP = null, whereT = 0, css = false, scr = null, tab = 'life';
const num = v => (typeof v === 'number' && isFinite(v) ? v : 0);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------------------------------------------------------------- data
function blankLife() { return { v: 1, runs: 0, sec: 0, hours: 0, wins: 0, heli: 0, truck: 0, deathsN: 0, quits: 0, c: {}, kills: {}, dist: {}, deaths: {}, diff: {}, rec: {}, first: null, last: null }; }
function blankRun(meta = {}) {
  const c = {}; for (const k of COUNTERS) c[k] = 0;
  const kills = {}; for (const w of WEAPONS) kills[w] = 0;
  const dist = {}; for (const d of DIST) dist[d] = 0;
  return { v: 1, diff: meta.diff || 'medium', body: meta.body || '', name: meta.name || '', continued: !!meta.continued, at: Date.now(), sec: 0, hours: 0, c, kills, dist, seen: {}, done: false };
}
function load(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
function store(k, v) { if (!persist) return; try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { } }
function fixLife(L) {   // fill anything a newer version added (older saves keep working)
  const B = blankLife(); if (!L || typeof L !== 'object') return B;
  for (const k in B) if (L[k] == null || typeof L[k] !== typeof B[k]) L[k] = B[k];
  return L;
}
const diffOf = d => (life.diff[d] ||= { runs: 0, wins: 0, deaths: 0, quits: 0, best: 0, fastest: 0, kills: 0, heads: 0, sec: 0, hours: 0 });
const runDist = r => DIST.reduce((s, d) => s + num(r.dist[d]), 0);

// what a kill was made with, from the combat info object (info.weapon is the weapon id for guns and melee)
export function weaponOf(info = {}) {
  if (!info) return 'other';
  if (info.vehicle || info.car || info.crash) return 'car';
  if (info.fire || info.weapon === 'molotov') return 'molotov';
  const w = info.weapon; if (w === 'rifle') return 'sniper';
  return WEAPONS.includes(w) ? w : info.melee ? 'fists' : w ? 'other' : 'fists';
}
// how you died, from the combat info object (or G.deathCause)
export function causeOf(x) {
  if (typeof x === 'string') return CAUSES.includes(x) ? x : 'other';
  const i = x || {};
  return i.infection ? 'turned' : i.starve ? 'starved' : i.thirst ? 'thirst' : i.bleed ? 'bled' : i.fire ? 'burned' : i.fall ? 'fall' : i.crash ? 'crash' : 'eaten';
}

// ---------------------------------------------------------------- API
// ctx: { test, persist, diffs, showScreen(id), onClose(), vehicle() -> {kind:'car'|'bike', x, z} | null, where(pos) -> 'roof'|'attic'|'tower'|null, click() }
export function init(c = {}) {
  ctx = c; persist = c.persist !== false; KEY = 'zombieapocalypse.stats.v1' + (c.test ? '.test' : '');
  life = fixLife(load(KEY));
  // a run that never got committed (the window closed mid-run): fold it in so nothing is lost
  const live = load(KEY + '.live');
  if (live && live.c && !live.done) { run = live; commitRun({ how: 'abandoned' }); }
  store(KEY + '.live', null);
  run = blankRun();
  if (typeof document !== 'undefined') injectCSS();
  return api;
}
// a new run starts (newGame). meta: { diff, body, name, continued }
export function resetRun(meta = {}) { run = blankRun(meta); lastP = null; snapT = 0; return run; }
export const run_ = () => run;
export function lifetime() { return life; }
export { run_ as run };

// one game moment. Unknown names are counted too (run.c[name]) so nothing breaks if the lead adds new ones.
export function event(name, d = {}) {
  if (!run || run.done) return;
  d = d || {}; const c = run.c, n = Math.max(1, num(d.n) || 1);
  switch (name) {
    case 'kill': { c.kills++; const w = d.weapon && !d.info ? weaponOf({ weapon: d.weapon }) : weaponOf(d.info || d); run.kills[w] = (run.kills[w] || 0) + 1; if (d.head || (d.info && d.info.part === 'head')) c.heads++; break; }
    case 'shot': c.shots += n; break;
    case 'humanHurt': c.humansHurt++; if (d.killed) c.humansKilled++; break;
    case 'humanKilled': c.humansKilled++; break;
    case 'saved': c.saved += n; break;
    case 'item': c.items += n; break;
    case 'search': c.searched++; break;
    case 'use': {   // one item used from the pack: { id, cat }
      const id = d.id || '', cat = d.cat || '';
      if (id === 'bandage') c.bandages++; else if (cat === 'food' && id !== 'pills' && id !== 'antibiotics') c.food++; else if (cat === 'drink') c.water++; else if (cat === 'med' || id === 'pills' || id === 'antibiotics') c.meds++;
      else if (id === 'molotov') c.molotovs++;
      break;
    }
    case 'eat': c.food++; break;
    case 'drink': c.water++; break;
    case 'bandage': c.bandages++; break;
    case 'med': c.meds++; break;
    case 'molotov': c.molotovs++; break;
    case 'ambulance': c.ambulances++; break;
    case 'bitten': c.bitten++; break;
    case 'grabbed': c.grabbed++; break;
    case 'brokeFree': c.brokeFree++; break;
    case 'doorBroken': c.doorsBroken++; break;
    case 'drive': if (d.kind === 'bike') c.bikesRidden++; else c.carsDriven++; break;
    case 'text': c.texts++; break;
    case 'climb': c.climbs++; break;
    case 'visit': {   // { place: 'roof'|'attic'|'tower', id }: each place counts once per run
      const p = { roof: 'roofs', attic: 'attics', tower: 'towers' }[d.place]; if (!p) break;
      const id = d.place + ':' + (d.id ?? 'x'); if (run.seen[id]) break; run.seen[id] = 1; c[p]++; break;
    }
    default: if (typeof name === 'string' && /^\w{1,24}$/.test(name)) c[name] = num(c[name]) + n;
  }
}

// every frame from step(): distances, time survived. P = player, G = game state
export function tick(dt, P, G) {
  if (!run || run.done || !P || !G || !(dt > 0) || dt > 1) return;
  if (G.state !== 'play' && G.state !== 'escaping') { lastP = null; return; }
  if (!P.alive) { lastP = null; return; }
  run.sec += dt;
  if (G.startHour != null && G.day != null && G.hour != null) run.hours = Math.max(run.hours, (G.day - 1) * 24 + G.hour - G.startHour);
  const V = ctx.vehicle ? ctx.vehicle() : null;
  const x = V && V.x != null ? V.x : P.s && P.s.pos ? P.s.pos.x : null, z = V && V.z != null ? V.z : P.s && P.s.pos ? P.s.pos.z : null;
  if (x != null) {
    if (lastP && lastP.v === !!V) {
      const m = Math.hypot(x - lastP.x, z - lastP.z);
      if (m < dt * 40 + 0.5) {   // (a teleport — a load, a restart — isn't a walk)
        const k = V ? (V.kind === 'bike' ? 'cycle' : 'drive') : m / dt > 3.4 ? 'run' : 'walk';
        if (m > 0.002) run.dist[k] += m;
      }
    }
    lastP = { x, z, v: !!V };
  }
  if (ctx.where && P.s && (whereT += dt) > 0.5) { whereT = 0; const w = ctx.where(P.s.pos); if (w) event('visit', typeof w === 'string' ? { place: w, id: Math.round(P.s.pos.x / 4) + ',' + Math.round(P.s.pos.z / 4) } : w); }
  if ((snapT += dt) > 8) { snapT = 0; store(KEY + '.live', run); }
}

// the run is over. outcome: { how: 'helicopter'|'escaped'|'died'|'quit'|'abandoned', cause, hours, saved }
// returns { newRecords: [record keys], run } — pass it to resultsHTML() for the badges
export function commitRun(o = {}) {
  if (!run || run.done) return { newRecords: [], run };
  const how = o.how || 'quit', win = WINS.has(how), died = how === 'died' || how === 'dead';
  if (o.hours != null) run.hours = Math.max(0, num(o.hours));
  if (o.saved != null) run.c.saved = Math.max(run.c.saved, num(o.saved));
  run.done = true; run.how = how; run.cause = died ? causeOf(o.cause) : null;
  const L = life, D = diffOf(run.diff), c = run.c;
  // a quit straight away isn't a run
  const empty = !win && !died && run.sec < 20 && !COUNTERS.some(k => c[k]);
  if (!empty) {
    if (!run.continued) { L.runs++; D.runs++; }
    L.sec += run.sec; L.hours += run.hours; D.sec += run.sec; D.hours += run.hours; D.kills += c.kills; D.heads += c.heads;
    for (const k in c) L.c[k] = num(L.c[k]) + num(c[k]);
    for (const w in run.kills) L.kills[w] = num(L.kills[w]) + num(run.kills[w]);
    for (const d of DIST) L.dist[d] = num(L.dist[d]) + num(run.dist[d]);
    if (win) { L.wins++; D.wins++; if (how === 'helicopter' || how === 'heli') L.heli++; else L.truck++; }
    else if (died) { L.deathsN++; D.deaths++; L.deaths[run.cause] = num(L.deaths[run.cause]) + 1; }
    else { L.quits++; D.quits++; }
    D.best = Math.max(D.best, run.hours);
    if (win && run.hours > 0) D.fastest = D.fastest ? Math.min(D.fastest, run.hours) : run.hours;
    L.first ||= run.at; L.last = Date.now();
  }
  // the records (only real runs: finished, not abandoned). Your first run doesn't count as beating anything, but a first escape does.
  const newRecords = [];
  if (!empty && how !== 'abandoned') {
    const vals = { hours: run.hours, kills: c.kills, heads: c.heads, fastest: win && run.hours > 0 ? run.hours : 0, saved: c.saved, dist: runDist(run), items: c.items, searched: c.searched, sec: run.sec };
    for (const R of RECORDS) {
      const v = vals[R.k]; if (!(v > 0)) continue;
      const old = L.rec[R.k];
      if (!old || (R.lower ? v < old.v : v > old.v)) { if (old || R.k === 'fastest') newRecords.push(R.k); L.rec[R.k] = { v, diff: run.diff, at: Date.now(), body: run.body }; }
    }
  }
  run.newRecords = newRecords;
  store(KEY, L); store(KEY + '.live', null);
  return { newRecords, run };
}
// forget everything (a 'reset stats' button; tests)
export function wipe() { life = blankLife(); run = blankRun({ diff: run && run.diff }); store(KEY, life); store(KEY + '.live', null); }

// ---------------------------------------------------------------- formatting
export function fmtHours(h) { h = Math.max(0, num(h)); const hh = Math.floor(h), mm = Math.floor((h - hh) * 60); return `${hh}h ${String(mm).padStart(2, '0')}m`; }
export function fmtSec(s) { s = Math.max(0, Math.floor(num(s))); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, ss = s % 60; return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(ss).padStart(2, '0')}s`; }
export function fmtDist(m) { m = Math.max(0, num(m)); return m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 1 : 2)} km` : `${Math.round(m)} m`; }
const fmtN = n => Math.round(num(n)).toLocaleString('en-US');
const fmtBy = (f, v) => f === 'hours' ? fmtHours(v) : f === 'sec' ? fmtSec(v) : f === 'dist' ? fmtDist(v) : f === 'pct' ? Math.round(v) + '%' : fmtN(v);
// a number that counts up when shown (data-n / data-f are read by animate())
const N = (v, f = '') => `<span class="zst-n" data-n="${num(v)}" data-f="${f}">${fmtBy(f, v)}</span>`;
const dName = d => esc((ctx.diffs && ctx.diffs[d] && ctx.diffs[d].name) || D_DEF[d] || d);
const dList = () => { const k = Object.keys(ctx.diffs || D_DEF); for (const d in life.diff) if (!k.includes(d)) k.push(d); return k; };

// ---------------------------------------------------------------- views
const tile = (ic, v, label, f = '', cls = '') => `<div class="zst-tile ${cls}">${icon(ic)}<b>${N(v, f)}</b><small>${esc(label)}</small></div>`;
const mini = (ic, v, label, f = '') => `<div class="zst-mini">${icon(ic)}<span>${esc(label)}</span><b>${N(v, f)}</b></div>`;
function bars(rows, max, f = '') {   // rows: [ic, label, value, colour?]
  max = Math.max(1, max);
  return `<div class="zst-bars">${rows.map(([ic, l, v, col]) => `<div class="zst-bar${v ? '' : ' zst-zero'}">${icon(ic)}<span class="l">${esc(l)}</span><span class="t"><i data-w="${Math.round(num(v) / max * 1000) / 10}" style="${col ? `background:${col}` : ''}"></i></span><b>${N(v, f)}</b></div>`).join('')}</div>`;
}
function weaponBars(k) { const rows = WEAPONS.map(w => [W_ICON[w], W_NAME[w], num(k[w])]).filter(r => r[2] || r[1] !== 'Other').sort((a, b) => b[2] - a[2]); return bars(rows, Math.max(...rows.map(r => r[2]))); }
function distStrip(dist) {
  const tot = DIST.reduce((s, d) => s + num(dist[d]), 0), col = { walk: '#9b9486', run: '#c9a24a', drive: '#c62a1e', cycle: '#4f8fb0' }, nm = { walk: 'Walked', run: 'Ran', drive: 'Drove', cycle: 'Cycled' };
  return `<div class="zst-strip">${DIST.map(d => `<i style="background:${col[d]}" data-w="${tot ? Math.round(num(dist[d]) / tot * 1000) / 10 : 0}"></i>`).join('')}</div>
    <div class="zst-legend">${DIST.map(d => `<span><i style="background:${col[d]}"></i>${nm[d]} <b>${N(dist[d], 'dist')}</b></span>`).join('')}</div>`;
}
const sec = (title, body, cls = '') => `<section class="zst-sec ${cls}"><h4>${esc(title)}</h4>${body}</section>`;

function lifeHTML() {
  const L = life, c = L.c, k = num(c.kills), hp = k ? num(c.heads) / k * 100 : 0;
  const deaths = CAUSES.map(x => [C_ICON[x], C_NAME[x], num(L.deaths[x]), '#8a1810']).filter(r => r[2]);
  return `<div class="zst-hero">
      ${tile('skull', k, 'zombies put down', '', 'zst-big')}${tile('check', L.wins, `escapes · ${L.heli} by air`, '', 'zst-big zst-win')}${tile('clock', L.hours, 'time survived', 'hours', 'zst-big')}${tile('note', L.runs, 'runs', '', 'zst-big')}
    </div>
    <div class="zst-cols">
      ${sec('Kills by weapon', weaponBars(L.kills))}
      ${sec('Combat', `<div class="zst-ring" style="--p:${hp.toFixed(1)}"><div><b>${N(hp, 'pct')}</b><small>headshots</small></div></div>
        <div class="zst-minis">${mini('target', c.heads, 'Headshots')}${mini('ammo', c.shots, 'Shots fired')}${mini('dmg', c.humansHurt, 'People hurt')}${mini('skull', c.humansKilled, 'People killed')}${mini('flame', c.molotovs, 'Molotovs')}${mini('heart', c.saved, 'Survivors saved')}</div>`)}
      ${sec('On the move', `${distStrip(L.dist)}<div class="zst-minis">${mini('keys', c.carsDriven, 'Cars driven')}${mini('speed', c.bikesRidden, 'Bikes ridden')}${mini('stamina', c.climbs, 'Climbs')}${mini('sun', c.roofs, 'Rooftops')}${mini('box', c.attics, 'Attics')}${mini('target', c.towers, 'Towers')}</div>`, 'zst-wide')}
      ${sec('Staying alive', `<div class="zst-minis">${mini('food', c.food, 'Food eaten')}${mini('water', c.water, 'Water drunk')}${mini('cross', c.bandages, 'Bandages used')}${mini('pills', c.meds, 'Medicine taken')}${mini('medkit', c.ambulances, 'Ambulances called')}${mini('phone', c.texts, 'Texts sent')}</div>`)}
      ${sec('Close calls', `<div class="zst-minis">${mini('bio', c.bitten, 'Times bitten')}${mini('fist', c.grabbed, 'Times grabbed')}${mini('stamina', c.brokeFree, 'Broke free')}${mini('dmg', c.doorsBroken, 'Doors broken')}${mini('bag', c.searched, 'Places searched')}${mini('box', c.items, 'Things found')}</div>`)}
      ${sec('Bosses', `<div class="zst-minis">${mini('skull', c.miniBosses, 'Mini bosses')}${mini('skull', c.bosses, 'Bosses')}${mini('dmg', c.theZombie, 'The Zombie')}</div>`)}
      ${sec(`Deaths · ${fmtN(L.deathsN)}`, deaths.length ? bars(deaths, Math.max(...deaths.map(r => r[2]))) : '<p class="zst-empty">Nobody has died yet.</p>')}
      ${sec('Played', `<div class="zst-minis">${mini('moon', L.sec, 'Real time played', 'sec')}${mini('clock', L.hours, 'In-game hours', 'hours')}${mini('check', L.truck, 'Escapes by road')}${mini('sun', L.heli, 'Escapes by air')}${mini('pause', L.quits, 'Runs abandoned')}${mini('note', L.first ? Math.max(1, Math.ceil((Date.now() - L.first) / 864e5)) : 0, 'Days since first run')}</div>`)}
    </div>`;
}
function diffHTML() {
  const ds = dList(), mx = Math.max(1, ...ds.map(d => num((life.diff[d] || {}).best)));
  return `<div class="zst-diffs">${ds.map((d, i) => {
    const D = life.diff[d] || {}, runs = num(D.runs), wr = runs ? num(D.wins) / runs * 100 : 0;
    return `<div class="zst-drow${runs ? '' : ' zst-none'}" style="--dc:${D_COL[d] || '#c62a1e'}">
      <div class="zst-dname"><b>${dName(d)}</b><span class="sk">${Array.from({ length: 6 }, (_, j) => icon('skull', j <= i ? '' : 'zst-off')).join('')}</span></div>
      <div class="zst-dgrid">
        <div><small>Runs</small><b>${N(runs)}</b></div><div><small>Escapes</small><b>${N(D.wins)}</b></div><div><small>Deaths</small><b>${N(D.deaths)}</b></div>
        <div><small>Best time</small><b>${N(D.best, 'hours')}</b></div><div><small>Fastest out</small><b>${D.fastest ? N(D.fastest, 'hours') : '—'}</b></div><div><small>Put down</small><b>${N(D.kills)}</b></div>
      </div>
      <div class="zst-dbars"><div><small>Win rate</small><span class="t"><i data-w="${wr.toFixed(1)}"></i></span><b>${N(wr, 'pct')}</b></div><div><small>Best</small><span class="t"><i data-w="${(num(D.best) / mx * 100).toFixed(1)}"></i></span><b>${N(D.best, 'hours')}</b></div></div>
    </div>`;
  }).join('')}</div>`;
}
function recHTML() {
  const any = RECORDS.some(R => life.rec[R.k]);
  return `${any ? '' : '<p class="zst-empty">No records yet — survive a night and they start here.</p>'}<div class="zst-recs">${RECORDS.map(R => {
    const r = life.rec[R.k];
    return `<div class="zst-rec${r ? '' : ' zst-none'}">${icon(R.ic)}<div><small>${esc(R.name)}</small><b>${r ? N(r.v, R.fmt) : '—'}</b><em>${r ? `${dName(r.diff)} · ${new Date(r.at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}` : 'not set yet'}</em></div></div>`;
  }).join('')}</div>`;
}

// the STATS screen. It's a .screen like the game's others, so the lead's showScreen('stats') shows/hides it too.
function ensureScreen() {
  if (scr) return scr;
  scr = document.createElement('div'); scr.className = 'screen zst-screen'; scr.id = 'stats';
  scr.innerHTML = `<div class="zst-panel" role="dialog" aria-label="Stats">
    <header><div><div class="zst-eye">maple hollow · records</div><h2>STATS</h2></div>
      <nav class="zst-tabs"><button data-t="life">Lifetime</button><button data-t="diff">Per difficulty</button><button data-t="rec">Records</button></nav></header>
    <div class="zst-body"></div>
    <footer><button class="zst-btn" data-a="back">Back</button></footer></div>`;
  document.body.appendChild(scr);
  scr.querySelector('.zst-tabs').onclick = e => { const b = e.target.closest('button'); if (b) { if (ctx.click) ctx.click(); showTab(b.dataset.t); } };
  scr.querySelector('[data-a=back]').onclick = () => close();
  addEventListener('keydown', e => { if (e.code === 'Escape' && scr.classList.contains('show')) { e.preventDefault(); close(); } });
  return scr;
}
function showTab(t) {
  tab = t; const s = ensureScreen();
  for (const b of s.querySelectorAll('.zst-tabs button')) b.classList.toggle('on', b.dataset.t === t);
  const body = s.querySelector('.zst-body'); body.scrollTop = 0;
  body.innerHTML = t === 'diff' ? diffHTML() : t === 'rec' ? recHTML() : lifeHTML();
  animate(body);
}
export function open(t = tab) {
  const s = ensureScreen();
  if (ctx.showScreen) ctx.showScreen('stats'); else s.classList.add('show');
  s.classList.add('show'); showTab(t);
}
export function close() {
  if (!scr) return; scr.classList.remove('show');
  if (ctx.onClose) ctx.onClose(); else if (ctx.showScreen) ctx.showScreen('title');
}
export const isOpen = () => !!(scr && scr.classList.contains('show'));
// a STATS item for the title menu, styled like the others (.mi). menu = the <nav class="menu"> element
export function addTitleButton(menu, no = '03') {
  if (!menu) return null;
  let b = menu.querySelector('#btnStats');
  if (!b) { b = document.createElement('button'); b.className = 'mi'; b.id = 'btnStats'; menu.appendChild(b); b.onclick = () => { if (ctx.click) ctx.click(); open('life'); }; }
  const L = life, sub = L.runs ? `${fmtN(L.c.kills)} put down · ${fmtN(L.wins)} escape${L.wins === 1 ? '' : 's'} · ${fmtHours(L.hours)} survived` : 'Everything you\'ve done in Maple Hollow.';
  b.innerHTML = `<span class="no">${esc(no)}</span><span class="tx"><b>STATS</b><small>${esc(sub)}</small></span>`;
  return b;
}

// 'This run' for the pause menu: HTML, or put it straight into the panel (after #pauseSub if there is one)
export function pauseHTML() {
  const r = run, c = r.c, best = Object.entries(r.kills).sort((a, b) => b[1] - a[1])[0];
  return `<div class="zst-run"><div class="zst-runh">This run<span>${fmtSec(r.sec)} played</span></div>
    <div class="zst-rgrid">${mini('clock', r.hours, 'Survived', 'hours')}${mini('skull', c.kills, 'Put down')}${mini('target', c.heads, 'Headshots')}${mini('stamina', runDist(r), 'Travelled', 'dist')}${mini('box', c.items, 'Found')}${mini('bio', c.bitten, 'Bitten')}</div>
    ${best && best[1] ? `<div class="zst-fav">${icon(W_ICON[best[0]])} Most kills with <b>${W_NAME[best[0]]}</b> · ${best[1]}</div>` : ''}</div>`;
}
export function showInPause(panel) {
  if (!panel) return; let el = panel.querySelector('.zst-run-wrap');
  if (!el) { el = document.createElement('div'); el.className = 'zst-run-wrap'; const sub = panel.querySelector('#pauseSub'); if (sub) sub.after(el); else panel.prepend(el); }
  el.innerHTML = pauseHTML(); animate(el, 500);
}

// the end-of-run results grid (replaces the old .rstats row). res = what commitRun() returned
export function resultsHTML(res = {}) {
  const r = res.run || run, c = r.c, nr = new Set(res.newRecords || r.newRecords || []);
  const badge = k => nr.has(k) ? '<em class="zst-new">new record</em>' : '';
  const t = (ic, v, label, f, k) => `<div class="zst-tile${nr.has(k) ? ' zst-rec-new' : ''}">${icon(ic)}<b>${N(v, f)}</b><small>${esc(label)}</small>${badge(k)}</div>`;
  const wk = WEAPONS.filter(w => r.kills[w]).sort((a, b) => r.kills[b] - r.kills[a]);
  const acc = c.kills ? Math.round(Math.min(100, c.heads / c.kills * 100)) : null;
  return `<div class="zst-results">
    <div class="zst-rtiles">${t('clock', r.hours, 'survived', 'hours', 'hours')}${t('skull', c.kills, 'put down', '', 'kills')}${t('target', c.heads, 'headshots', '', 'heads')}${t('stamina', runDist(r), 'travelled', 'dist', 'dist')}${t('box', c.items, 'things found', '', 'items')}${t('heart', c.saved, 'survivors saved', '', 'saved')}</div>
    ${wk.length ? `<div class="zst-chips">${wk.map(w => `<span>${icon(W_ICON[w])}${W_NAME[w]}<b>${r.kills[w]}</b></span>`).join('')}</div>` : ''}
    <div class="zst-rmore">${[['bag', c.searched, 'searched'], ['food', c.food, 'eaten'], ['water', c.water, 'drunk'], ['cross', c.bandages, 'bandages'], ['bio', c.bitten, 'bitten'], ['fist', c.grabbed, 'grabbed'], ['dmg', c.doorsBroken, 'doors broken'], ['keys', c.carsDriven + c.bikesRidden, 'vehicles'], ['phone', c.texts, 'texts'], ['medkit', c.ambulances, 'ambulances']].filter(x => x[1]).map(([ic, v, l]) => `<span>${icon(ic)}<b>${fmtN(v)}</b> ${l}</span>`).join('') || '<span>a quiet run</span>'}${acc != null ? `<span>${icon('target')}<b>${acc}%</b> headshot kills</span>` : ''}</div>
    ${nr.size ? `<div class="zst-nrec">${icon('check')} ${nr.size} new personal record${nr.size === 1 ? '' : 's'}${nr.has('fastest') ? ' · fastest escape ever' : ''}</div>` : ''}
  </div>`;
}

// count-up numbers and growing bars. Call after putting any of the HTML above into the page.
export function animate(root, dur = 900) {
  if (!root || typeof requestAnimationFrame === 'undefined') return;
  const still = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ns = [...root.querySelectorAll('.zst-n')], ws = [...root.querySelectorAll('[data-w]')];
  for (const w of ws) w.style.width = '0%';
  requestAnimationFrame(() => requestAnimationFrame(() => { for (const w of ws) w.style.width = w.dataset.w + '%'; }));
  if (still) return;
  const t0 = performance.now();
  const go = now => {
    let more = false;
    ns.forEach((e, i) => {
      const k = Math.min(1, Math.max(0, (now - t0 - Math.min(i, 24) * 22) / dur)), v = +e.dataset.n * (1 - Math.pow(1 - k, 3));
      e.textContent = fmtBy(e.dataset.f, k >= 1 ? +e.dataset.n : v); if (k < 1) more = true;
    });
    if (more) requestAnimationFrame(go);
  };
  requestAnimationFrame(go);
}

// ---------------------------------------------------------------- style
function injectCSS() {
  if (css) return; css = true;
  const s = document.createElement('style'); s.id = 'zst-css';
  s.textContent = `
.zst-screen { --zb: var(--bone, #ece6d8); --zm: var(--muted, #9b9486); --zd: var(--dim, #6e685e); --zr: var(--red, #c62a1e); --ze: var(--edge, rgba(255,255,255,.08)); --ze2: var(--edge2, rgba(255,255,255,.14));
  position: fixed; inset: 0; z-index: 9; display: none; background: radial-gradient(ellipse at 50% 30%, rgba(30,10,8,.55), rgba(0,0,0,.86)); }
.zst-screen.show { display: flex; align-items: center; justify-content: center; padding: 16px; box-sizing: border-box; }
.zst-panel { position: relative; width: min(1020px, 100%); max-height: calc(100vh - 16px); max-height: calc(100dvh - 16px); min-height: 0; display: flex; flex-direction: column; box-sizing: border-box; color: var(--zb);
  background: var(--grain, none), linear-gradient(165deg, rgba(26,24,22,.97), rgba(10,9,8,.98)); border: 1px solid var(--ze); border-top: 1px solid var(--ze2); border-radius: 3px;
  box-shadow: 0 30px 90px rgba(0,0,0,.75), inset 0 1px 0 rgba(255,255,255,.04); font-family: 'Oswald', 'Arial Narrow', sans-serif; animation: zstIn .35s cubic-bezier(.2,.8,.2,1); }
.zst-panel::before { content: ''; position: absolute; left: -1px; top: 26px; width: 3px; height: 46px; background: var(--zr); box-shadow: 0 0 16px rgba(198,42,30,.6); }
@keyframes zstIn { from { opacity: 0; transform: translateY(14px) scale(.985); } }
.zst-panel header { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; padding: 22px 28px 14px; border-bottom: 1px solid var(--ze); flex: none; }
.zst-eye { font-size: 10px; letter-spacing: .45em; text-transform: uppercase; color: var(--zr); margin-bottom: 4px; }
.zst-panel h2 { margin: 0; font-family: 'Bebas Neue', 'Oswald', Impact, sans-serif; font-weight: 400; font-size: 46px; letter-spacing: .08em; line-height: .95; color: var(--zb); }
.zst-tabs { display: flex; gap: 4px; background: rgba(0,0,0,.35); border: 1px solid var(--ze); padding: 3px; border-radius: 2px; flex-wrap: wrap; }
.zst-tabs button { background: none; border: none; color: var(--zm); font: inherit; font-size: 12px; letter-spacing: .22em; text-transform: uppercase; padding: 8px 14px; cursor: pointer; border-radius: 1px; transition: all .18s; }
.zst-tabs button:hover { color: var(--zb); background: rgba(255,255,255,.05); }
.zst-tabs button.on { color: #fff; background: linear-gradient(180deg, rgba(198,42,30,.55), rgba(138,24,16,.55)); box-shadow: inset 0 0 0 1px rgba(198,42,30,.7); }
.zst-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 18px 28px 20px; scrollbar-width: thin; scrollbar-color: rgba(198,42,30,.6) transparent; }
.zst-body::-webkit-scrollbar { width: 8px; } .zst-body::-webkit-scrollbar-thumb { background: rgba(198,42,30,.5); border-radius: 4px; }
.zst-panel footer { flex: none; padding: 12px 28px 18px; border-top: 1px solid var(--ze); display: flex; justify-content: flex-end; }
.zst-btn { border: 1px solid var(--ze2); border-radius: 2px; background: linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.01)); color: var(--zb); font: inherit; font-weight: 500; font-size: 13px; letter-spacing: .3em; text-transform: uppercase; padding: 11px 34px; cursor: pointer; transition: all .18s; }
.zst-btn:hover { border-color: var(--zr); color: #fff; background: linear-gradient(90deg, rgba(198,42,30,.32), rgba(198,42,30,.08)); }
.zst-screen .ic, .zst-run .ic, .zst-results .ic { width: 1em; height: 1em; display: inline-block; vertical-align: -.14em; flex: none; }
.zst-screen .ic.zst-off { opacity: .18; }
.zst-hero { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px; }
.zst-tile { position: relative; padding: 12px 14px; background: rgba(255,255,255,.035); border: 1px solid var(--ze, rgba(255,255,255,.08)); text-align: left; min-width: 0; overflow: hidden; }
.zst-tile .ic { font-size: 18px; color: var(--zr, #c62a1e); }
.zst-tile b { display: block; font-family: 'Bebas Neue', 'Oswald', Impact, sans-serif; font-weight: 400; font-size: 32px; line-height: 1.05; margin-top: 4px; color: var(--zb, #ece6d8); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
.zst-tile small { display: block; font-size: 10px; letter-spacing: .22em; text-transform: uppercase; color: var(--zd, #6e685e); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.zst-tile.zst-big { padding: 16px 16px 14px; background: linear-gradient(160deg, rgba(198,42,30,.13), rgba(255,255,255,.02) 60%); }
.zst-tile.zst-big b { font-size: clamp(32px, 4vw, 48px); }
.zst-tile.zst-big .ic { font-size: 22px; } .zst-tile.zst-win .ic { color: #7ac04a; }
.zst-tile.zst-big::after { content: ''; position: absolute; right: -30px; top: -30px; width: 90px; height: 90px; border-radius: 50%; background: radial-gradient(rgba(198,42,30,.18), transparent 70%); }
.zst-cols { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.zst-sec { background: rgba(0,0,0,.22); border: 1px solid var(--ze); padding: 12px 14px 14px; min-width: 0; }
.zst-sec.zst-wide { grid-column: 1 / -1; }
.zst-sec h4 { margin: 0 0 10px; font-family: 'Bebas Neue', 'Oswald', sans-serif; font-weight: 400; font-size: 19px; letter-spacing: .16em; color: var(--zr); }
.zst-sec:has(.zst-ring) { display: grid; grid-template-columns: auto 1fr; column-gap: 16px; align-items: center; align-content: start; }
.zst-sec:has(.zst-ring) h4 { grid-column: 1 / -1; }
.zst-bars { display: flex; flex-direction: column; gap: 6px; }
.zst-bar { display: grid; grid-template-columns: 16px 74px 1fr 46px; align-items: center; gap: 8px; font-size: 12px; letter-spacing: .06em; color: #cfc8ba; }
.zst-bar .ic { font-size: 15px; color: var(--zm); } .zst-bar.zst-zero { opacity: .38; }
.zst-bar .l { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.zst-bar .t, .zst-dbars .t { height: 6px; background: rgba(255,255,255,.07); border-radius: 3px; overflow: hidden; }
.zst-bar .t i, .zst-dbars .t i { display: block; height: 100%; width: 0; background: linear-gradient(90deg, #8a1810, #c62a1e); border-radius: 3px; transition: width 1s cubic-bezier(.2,.8,.2,1); box-shadow: 0 0 8px rgba(198,42,30,.45); }
.zst-bar b { text-align: right; font-weight: 500; color: var(--zb); font-variant-numeric: tabular-nums; }
.zst-minis { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 4px 14px; }
.zst-mini { display: flex; align-items: center; gap: 8px; padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,.05); font-size: 12px; letter-spacing: .05em; color: var(--zm, #9b9486); min-width: 0; }
.zst-mini .ic { font-size: 14px; color: var(--zd, #6e685e); }
.zst-mini span { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.zst-mini b { font-weight: 500; color: var(--zb, #ece6d8); font-size: 14px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.zst-ring { --p: 0; width: 108px; height: 108px; border-radius: 50%; display: grid; place-items: center; background: conic-gradient(var(--zr) calc(var(--p) * 1%), rgba(255,255,255,.07) 0); position: relative; }
.zst-ring::before { content: ''; position: absolute; inset: 8px; border-radius: 50%; background: #13110f; }
.zst-ring div { position: relative; text-align: center; } .zst-ring b { display: block; font-family: 'Bebas Neue', sans-serif; font-weight: 400; font-size: 30px; line-height: 1; }
.zst-ring small { font-size: 9px; letter-spacing: .2em; text-transform: uppercase; color: var(--zd); }
.zst-strip { display: flex; height: 10px; border-radius: 5px; overflow: hidden; background: rgba(255,255,255,.06); margin: 2px 0 10px; }
.zst-strip i { display: block; height: 100%; width: 0; transition: width 1.1s cubic-bezier(.2,.8,.2,1); }
.zst-legend { display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: 12px; color: var(--zm); margin-bottom: 8px; }
.zst-legend span { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; } .zst-legend i { width: 9px; height: 9px; border-radius: 2px; display: inline-block; }
.zst-legend b { color: var(--zb); font-weight: 500; }
.zst-empty { margin: 4px 0; font-family: 'Special Elite', 'Courier New', monospace; font-size: 13px; color: var(--zd); }
.zst-diffs { display: flex; flex-direction: column; gap: 10px; }
.zst-drow { display: grid; grid-template-columns: 170px 1fr 220px; gap: 16px; align-items: center; padding: 12px 16px; background: linear-gradient(90deg, color-mix(in srgb, var(--dc) 16%, transparent), rgba(255,255,255,.02) 45%); border: 1px solid var(--ze); border-left: 3px solid var(--dc); }
.zst-drow.zst-none { opacity: .45; }
.zst-dname b { display: block; font-family: 'Bebas Neue', sans-serif; font-weight: 400; font-size: 28px; letter-spacing: .08em; line-height: 1; color: var(--zb); }
.zst-dname .sk { display: flex; gap: 2px; margin-top: 4px; color: var(--dc); font-size: 12px; }
.zst-dgrid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px; }
.zst-dgrid small, .zst-dbars small { display: block; font-size: 9px; letter-spacing: .2em; text-transform: uppercase; color: var(--zd); white-space: nowrap; }
.zst-dgrid b { display: block; font-family: 'Bebas Neue', sans-serif; font-weight: 400; font-size: 24px; line-height: 1.1; color: var(--zb); white-space: nowrap; font-variant-numeric: tabular-nums; }
.zst-dbars { display: flex; flex-direction: column; gap: 6px; }
.zst-dbars > div { display: grid; grid-template-columns: 64px 1fr 56px; align-items: center; gap: 8px; }
.zst-dbars .t i { background: var(--dc); box-shadow: 0 0 8px color-mix(in srgb, var(--dc) 60%, transparent); }
.zst-dbars b { text-align: right; font-weight: 500; font-size: 12px; color: var(--zb); white-space: nowrap; }
.zst-recs { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }
.zst-rec { display: flex; gap: 14px; align-items: center; padding: 14px 16px; background: linear-gradient(150deg, rgba(201,162,74,.1), rgba(255,255,255,.02) 55%); border: 1px solid var(--ze); min-width: 0; }
.zst-rec > .ic { font-size: 30px; color: #c9a24a; padding: 9px; border: 1px solid rgba(201,162,74,.35); border-radius: 50%; box-sizing: content-box; }
.zst-rec > div { min-width: 0; } .zst-rec.zst-none { opacity: .4; } .zst-rec.zst-none > .ic { color: var(--zd); border-color: var(--ze); }
.zst-rec small { display: block; font-size: 10px; letter-spacing: .2em; text-transform: uppercase; color: var(--zm); }
.zst-rec b { display: block; font-family: 'Bebas Neue', sans-serif; font-weight: 400; font-size: 34px; line-height: 1.05; color: var(--zb); white-space: nowrap; }
.zst-rec em { display: block; font-style: normal; font-size: 11px; color: var(--zd); letter-spacing: .06em; }
/* pause: this run */
.zst-run { --zb: var(--bone, #ece6d8); --zm: var(--muted, #9b9486); --zd: var(--dim, #6e685e); --zr: var(--red, #c62a1e); text-align: left; margin: 0 0 14px; padding: 10px 12px 8px; background: rgba(0,0,0,.25); border: 1px solid var(--edge, rgba(255,255,255,.08)); font-family: 'Oswald', sans-serif; }
.zst-runh { display: flex; justify-content: space-between; align-items: baseline; font-size: 10px; letter-spacing: .35em; text-transform: uppercase; color: var(--zr); margin-bottom: 4px; }
.zst-runh span { letter-spacing: .12em; color: var(--zd); }
.zst-rgrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 14px; }
.zst-run .zst-mini { padding: 4px 0; font-size: 11px; } .zst-run .zst-mini b { font-size: 13px; }
.zst-fav { margin-top: 6px; font-size: 11px; color: var(--zm); letter-spacing: .05em; display: flex; align-items: center; gap: 6px; } .zst-fav .ic { color: var(--zr); font-size: 14px; } .zst-fav b { color: var(--zb); font-weight: 500; }
/* end of run */
.zst-results { --zb: var(--bone, #ece6d8); --zm: var(--muted, #9b9486); --zd: var(--dim, #6e685e); --zr: var(--red, #c62a1e); --ze: var(--edge, rgba(255,255,255,.08)); margin: 18px 0; text-align: left; font-family: 'Oswald', sans-serif; }
.zst-rtiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.zst-results .zst-tile b { font-size: 30px; }
.zst-tile.zst-rec-new { border-color: rgba(201,162,74,.55); background: linear-gradient(160deg, rgba(201,162,74,.16), rgba(255,255,255,.02) 65%); }
.zst-tile.zst-rec-new .ic { color: #c9a24a; }
.zst-new { position: absolute; top: 8px; right: 8px; font-style: normal; font-size: 8.5px; letter-spacing: .2em; text-transform: uppercase; color: #1a1408; background: #c9a24a; padding: 2px 6px; border-radius: 2px; animation: zstGlow 1.6s ease-in-out infinite; }
@keyframes zstGlow { 50% { box-shadow: 0 0 12px rgba(201,162,74,.8); } }
.zst-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.zst-chips span { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: var(--zm); background: rgba(198,42,30,.1); border: 1px solid rgba(198,42,30,.3); border-radius: 12px; }
.zst-chips .ic { color: var(--zr); font-size: 13px; } .zst-chips b { color: var(--zb); font-weight: 500; }
.zst-rmore { display: flex; flex-wrap: wrap; gap: 4px 16px; margin-top: 10px; font-size: 12px; color: var(--zd); letter-spacing: .04em; }
.zst-rmore span { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; } .zst-rmore b { color: var(--zb); font-weight: 500; } .zst-rmore .ic { font-size: 13px; }
.zst-nrec { margin-top: 12px; padding: 8px 12px; font-size: 12px; letter-spacing: .18em; text-transform: uppercase; color: #e8cf8e; background: rgba(201,162,74,.1); border: 1px solid rgba(201,162,74,.35); display: flex; align-items: center; gap: 8px; }
/* smaller windows: everything reflows, nothing is cut off (the body scrolls) */
@media (max-width: 900px) {
  .zst-drow { grid-template-columns: 1fr; gap: 10px; }
  .zst-dgrid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 760px) {
  .zst-hero { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .zst-cols { grid-template-columns: 1fr; }
  .zst-panel header, .zst-body, .zst-panel footer { padding-left: 16px; padding-right: 16px; }
  .zst-rtiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-height: 700px) {
  .zst-screen.show { padding: 8px; }
  .zst-panel header { padding-top: 12px; padding-bottom: 10px; } .zst-panel h2 { font-size: 34px; }
  .zst-panel footer { padding-top: 8px; padding-bottom: 10px; } .zst-btn { padding: 8px 28px; }
  .zst-body { padding-top: 12px; }
  .zst-tile.zst-big { padding: 10px 12px; } .zst-tile.zst-big b { font-size: 34px; }
  .zst-results { margin: 12px 0; } .zst-results .zst-tile { padding: 7px 10px; display: grid; grid-template-columns: auto 1fr; column-gap: 8px; align-items: center; }
  .zst-results .zst-tile b { font-size: 24px; margin: 0; } .zst-results .zst-tile small { grid-column: 1 / -1; } .zst-new { top: 4px; right: 4px; }
}
@media (max-height: 560px) {
  .zst-screen.show { padding: 8px; } .zst-panel { max-height: calc(100vh - 16px); max-height: calc(100dvh - 16px); }
  .zst-panel header { padding: 10px 18px 6px; } .zst-panel h2 { font-size: 28px; }
  .zst-panel footer { padding: 6px 18px 8px; } .zst-btn { padding: 6px 24px; }
  .zst-body { padding-top: 8px; } .zst-tile.zst-big b { font-size: 28px; }
}
@media (max-width: 480px) { .zst-dgrid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .zst-sec:has(.zst-ring) { grid-template-columns: 1fr; } .zst-ring { margin: 0 auto 10px; } }
@media (prefers-reduced-motion: reduce) { .zst-panel, .zst-new { animation: none; } .zst-bar .t i, .zst-strip i, .zst-dbars .t i { transition: none; } }
`;
  document.head.appendChild(s);
}

const api = { init, event, tick, run: run_, lifetime, resetRun, commitRun, wipe, open, close, isOpen, addTitleButton, pauseHTML, showInPause, resultsHTML, animate, weaponOf, causeOf, fmtHours, fmtSec, fmtDist };
export default api;
