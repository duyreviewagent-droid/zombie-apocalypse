// Zombie_Apocalypse — ACHIEVEMENTS: 37 of them in five tiers, a toast when you earn one, and an ACHIEVEMENTS screen.
//  - tiers: DEADLY (sword) · RANGE (arrow on Easy/Medium, gun on Hard+) · MEDIUM-HARD (zombie) · VERY HARD (big zombie) · APOCALYPSE (the horde of 7)
//  - listens to STATS.onEvent (every kill / search / bite / buy... and the end of a run), plus tick() each frame and a few event()s from main.js
//  - saved in the game's save (save.ach) via writeSave — never when PERSIST is off (?nosave=1): then it all lives in memory only
//  - multiplayer: only your own moments reach here (main.js only reports the local player's kills), so each player earns their own
import { icon, badge } from './icons.js';

export const TIERS = {
  deadly: { name: 'DEADLY', ic: 'sword', col: '#e0473a' },
  range: { name: 'RANGE', ic: 'arrow', col: '#e3a83c' },
  medium: { name: 'MEDIUM-HARD', ic: 'zwalk', col: '#7fbf5a' },
  hard: { name: 'VERY HARD', ic: 'zbig', col: '#d9762e' },
  apoc: { name: 'APOCALYPSE', ic: 'horde', col: '#b24ad8' },
};
const HARD_UP = new Set(['hard', 'extreme', 'apocalypse', 'zombiex']);
const DLEVEL = { easy: 1, medium: 2, hard: 3, extreme: 4, apocalypse: 5, zombiex: 6 };
const D_NAME = { easy: 'Easy', medium: 'Medium', hard: 'Hard', extreme: 'Extreme', apocalypse: 'Apocalypse', zombiex: 'ZombieX' };
const MELEE = ['fists', 'knife', 'bat', 'crowbar', 'machete', 'axe'], GUNS = new Set(['pistol', 'shotgun', 'sniper']);
const MAP_IDS = ['maple', 'desert', 'prison', 'jungle', 'stadium'];

// the 37. goal: a counted one (progress bar); secret: '???' until unlocked
export const LIST = [
  // DEADLY — up close (8)
  { id: 'firstBlood', t: 'deadly', name: 'First Blood', how: 'Put down a zombie with a melee weapon (or your fists).' },
  { id: 'closeQuarters', t: 'deadly', name: 'Close Quarters', how: 'Get 10 melee kills.', goal: 10, p: 'meleeK' },
  { id: 'bareKnuckles', t: 'deadly', name: 'Bare Knuckles', how: 'Put down 5 zombies with your fists.', goal: 5, p: 'fistK' },
  { id: 'butcher', t: 'deadly', name: 'Butcher', how: 'Get 100 melee kills.', goal: 100, p: 'meleeK' },
  { id: 'untouchable', t: 'deadly', name: 'Untouchable', how: 'Get 5 kills in a row without getting hit.' },
  { id: 'rampage', t: 'deadly', name: 'Rampage', how: 'Get 15 kills in a row without getting hit.' },
  { id: 'giantSlayer', t: 'deadly', name: 'Giant Slayer', how: 'Kill a mini boss with a melee weapon.' },
  { id: 'armory', t: 'deadly', name: 'Armory of Pain', how: 'Kill with all 6: fists, knife, bat, crowbar, machete and axe.', goal: 6, p: 'meleeW' },
  // RANGE — from a distance; badge is an arrow on Easy/Medium, a gun on Hard and up (8)
  { id: 'triggerHappy', t: 'range', name: 'Trigger Happy', how: 'Put down a zombie with a gun.' },
  { id: 'sharpshooter', t: 'range', name: 'Sharpshooter', how: 'Get 10 headshot kills with a gun.', goal: 10, p: 'gunHead' },
  { id: 'longShot', t: 'range', name: 'Long Shot', how: 'Kill a zombie with a gun from 30 m away or more.' },
  { id: 'sniperElite', t: 'range', name: 'Sniper Elite', how: 'Headshot kill from 50 m away or more.' },
  { id: 'gunslinger', t: 'range', name: 'Gunslinger', how: 'Get 100 gun kills.', goal: 100, p: 'gunK' },
  { id: 'cocktail', t: 'range', name: 'Cocktail Hour', how: 'Burn 3 zombies with one molotov.' },
  { id: 'boomstick', t: 'range', name: 'Boomstick', how: 'Drop 2 zombies with one shotgun blast.' },
  { id: 'deadEye', t: 'range', name: 'Dead Eye', how: '5 gun kills in a row, all headshots.' },
  // MEDIUM-HARD — surviving (9)
  { id: 'night', t: 'medium', name: 'Survive the Night', how: 'Make it to 6 AM on day 2.' },
  { id: 'wayOut', t: 'medium', name: 'Way Out', how: 'Escape on Medium or harder.' },
  { id: 'spender', t: 'medium', name: 'Big Spender', how: 'Buy something with zLux.' },
  { id: 'roadkill', t: 'medium', name: 'Roadkill', how: 'Run a zombie over with a vehicle.' },
  { id: 'paramedic', t: 'medium', name: 'Call 911', how: 'Get patched up by a paramedic in an ambulance.' },
  { id: 'scavenger', t: 'medium', name: 'Scavenger', how: 'Search 50 places.', goal: 50, p: 'searched' },
  { id: 'highGround', t: 'medium', name: 'High Ground', how: 'Get up on a roof or a tower.' },
  { id: 'hero', t: 'medium', name: 'Hero', how: 'Save 3 survivors.', goal: 3, p: 'saved' },
  { id: 'roadTrip', t: 'medium', name: 'Road Trip', how: 'Drive or ride 2 km.', goal: 2000, p: 'driveM', unit: 'm' },
  // VERY HARD (7)
  { id: 'bossFight', t: 'hard', name: 'Boss Fight', how: 'Put down a boss.' },
  { id: 'hardOut', t: 'hard', name: 'Hard Way Out', how: 'Escape on Hard or harder.' },
  { id: 'extremeOut', t: 'hard', name: 'Extreme Measures', how: 'Escape on Extreme or harder.' },
  { id: 'clean', t: 'hard', name: 'Not a Scratch', how: 'Escape without getting bitten.' },
  { id: 'fistsOnly', t: 'hard', name: 'Fists of Fury', how: 'Escape with only your fists: no shots, no weapons.' },
  { id: 'day3', t: 'hard', name: 'Still Standing', how: 'Survive until day 3 in one run.' },
  { id: 'ghost', t: 'hard', name: 'Ghost', how: 'Escape without putting down a single zombie.', secret: true },
  // APOCALYPSE (5)
  { id: 'theZombie', t: 'apoc', name: 'THE ZOMBIE', how: 'Put down THE ZOMBIE.', secret: true },
  { id: 'endWorld', t: 'apoc', name: 'End of the World', how: 'Escape on Apocalypse or ZombieX.' },
  { id: 'zombieX', t: 'apoc', name: 'Zombie X', how: 'Escape on ZombieX.', secret: true },
  { id: 'worldTour', t: 'apoc', name: 'World Tour', how: 'Escape on all 5 maps.', goal: 5, p: 'maps' },
  { id: 'legend', t: 'apoc', name: 'Legend', how: 'Unlock every other achievement.', goal: 36, p: '_all' },
];
const BY = Object.fromEntries(LIST.map(a => [a.id, a]));

let X = {}, A = null, persist = true, dirtyT = -1, css = false, scr = null, toastQ = [], toastOn = false;
// per-run (memory only)
let R = null, lastRun = null, lastHp = null, frame = 0;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = v => (typeof v === 'number' && isFinite(v) ? v : 0);
function blank() { return { v: 1, u: {}, p: { meleeK: 0, fistK: 0, gunK: 0, gunHead: 0, searched: 0, saved: 0, driveM: 0, maps: {}, meleeW: {} } }; }
function fix(a) {
  const B = blank(); if (!a || typeof a !== 'object') return B;
  if (!a.u || typeof a.u !== 'object') a.u = {};
  if (!a.p || typeof a.p !== 'object') a.p = B.p;
  for (const k in B.p) if (a.p[k] == null || typeof a.p[k] !== typeof B.p[k]) a.p[k] = B.p[k];
  return a;
}
function blankRun() { return { streak: 0, headStreak: 0, fire: [], shotgun: [], drive0: null }; }

// ---------------------------------------------------------------- API
// ctx: { STATS, save, writeSave, persist, G, getP(), SND, showScreen(id), mapId(), mapName(id), click() }
export function init(c = {}) {
  X = c; persist = c.persist !== false;
  // with ?nosave=1 we never read or write the player's real achievements: a blank set in memory
  A = persist && c.save ? (c.save.ach = fix(c.save.ach)) : blank();
  R = blankRun();
  if (c.STATS && c.STATS.onEvent) c.STATS.onEvent(onStat);
  if (typeof document !== 'undefined') { injectCSS(); addPauseButton(); addTitleButton(document.querySelector('#title .menu')); }
  if (typeof window !== 'undefined' && window.ZA) window.ZA.ACH = api;
  return api;
}
function write(now) { if (!persist || !X.writeSave) return; if (now) { dirtyT = -1; X.writeSave(); } else if (dirtyT < 0) dirtyT = 0; }
const curRun = () => (X.STATS && X.STATS.run ? X.STATS.run() : null);
const curDiff = () => { const r = curRun(); return (r && r.diff) || (X.save && X.save.diff) || 'medium'; };
export const has = id => !!(A && A.u[id]);
export const count = () => (A ? LIST.filter(a => A.u[a.id]).length : 0);

export function unlock(id) {
  const a = BY[id]; if (!a || !A || A.u[id]) return false;
  A.u[id] = { at: Date.now(), diff: curDiff(), map: X.mapId ? X.mapId() : '' };
  write(true); toast(a);
  if (id !== 'legend' && LIST.every(b => b.id === 'legend' || A.u[b.id])) unlock('legend');
  if (scr && scr.classList.contains('show')) render();
  return true;
}
// a counter: add n, unlock when it reaches the goal (several achievements can share one counter)
function bump(key, n = 1) {
  A.p[key] = num(A.p[key]) + n; write(false);
  for (const a of LIST) if (a.p === key && A.p[key] >= a.goal) unlock(a.id);
}
function progress(a) {
  if (!a.goal) return null;
  const v = a.p === '_all' ? LIST.filter(b => b.id !== 'legend' && A.u[b.id]).length : a.p === 'maps' || a.p === 'meleeW' ? Object.keys(A.p[a.p] || {}).length : num(A.p[a.p]);
  return Math.min(a.goal, Math.floor(v));
}

// every game moment STATS hears about
function onStat(name, d, run) {
  if (!A) return;
  if (run !== lastRun) { lastRun = run; R = blankRun(); }
  switch (name) {
    case 'kill': return onKill(d);
    case 'search': return bump('searched');
    case 'saved': return bump('saved', Math.max(1, num(d.n) || 1));
    case 'buy': return unlock('spender');
    case 'visit': if (d.place === 'roof' || d.place === 'tower') unlock('highGround'); return;
    case 'bitten': case 'grabbed': R.streak = 0; return;
    case 'bosses': return unlock('bossFight');
    case 'theZombie': return unlock('theZombie');
    case 'end': return onEnd(d, run);
  }
}
function onKill(d) {
  const info = d.info || {}, w = X.STATS.weaponOf(info), head = info.part === 'head', v = d.v, P = X.getP && X.getP();
  const t = X.G ? num(X.G.t) : performance.now() / 1000;
  R.streak++;
  if (R.streak >= 5) unlock('untouchable');
  if (R.streak >= 15) unlock('rampage');
  if (MELEE.includes(w)) {
    unlock('firstBlood'); bump('meleeK');
    if (w === 'fists') bump('fistK');
    if (!A.p.meleeW[w]) { A.p.meleeW[w] = 1; write(false); if (Object.keys(A.p.meleeW).length >= 6) unlock('armory'); }
    if (v && v.bossT) unlock('giantSlayer');
  } else if (GUNS.has(w)) {
    unlock('triggerHappy'); bump('gunK');
    if (head) bump('gunHead');
    R.headStreak = head ? R.headStreak + 1 : 0; if (R.headStreak >= 5) unlock('deadEye');
    const dist = v && v.s && P && P.s ? Math.hypot(v.s.pos.x - P.s.pos.x, v.s.pos.z - P.s.pos.z) : 0;
    if (dist >= 30) unlock('longShot');
    if (dist >= 50 && head) unlock('sniperElite');
    if (w === 'shotgun') { R.shotgun = R.shotgun.filter(x => frame - x.f <= 2 || t - x.t < 0.2); R.shotgun.push({ f: frame, t }); if (R.shotgun.length >= 2) unlock('boomstick'); }
  } else if (w === 'molotov') {
    R.fire = R.fire.filter(x => t - x < 8); R.fire.push(t); if (R.fire.length >= 3) unlock('cocktail');
  } else if (w === 'car') unlock('roadkill');
}
function onEnd(d, run) {
  if (!d.win || !run) return;
  const diff = run.diff || curDiff(), lv = DLEVEL[diff] || 2, c = run.c || {}, k = run.kills || {};
  if (lv >= 2) unlock('wayOut');
  if (lv >= 3) unlock('hardOut');
  if (lv >= 4) unlock('extremeOut');
  if (lv >= 5) unlock('endWorld');
  if (diff === 'zombiex') unlock('zombieX');
  if (!num(c.bitten)) unlock('clean');
  if (!num(c.kills)) unlock('ghost');
  const other = Object.keys(k).some(w => w !== 'fists' && num(k[w]) > 0);
  if (num(k.fists) > 0 && !other && !num(c.shots) && !num(c.molotovs)) unlock('fistsOnly');
  const m = X.mapId ? X.mapId() : ''; if (m && MAP_IDS.includes(m)) A.p.maps[m] = 1;
  if (MAP_IDS.every(id => A.p.maps[id])) unlock('worldTour');
  write(true);
}
// from main.js: event('ambHealed') when a paramedic patches you up
export function event(name) { if (!A) return; if (name === 'ambHealed') unlock('paramedic'); }
// every frame: getting hit breaks the streak, the night / day 3, how far you've driven, saving now and then
export function tick(dt) {
  if (!A) return; frame++;
  const G = X.G, P = X.getP && X.getP();
  if (dirtyT >= 0 && (dirtyT += dt) > 6) write(true);
  if (!G || !P || (G.state !== 'play' && G.state !== 'escaping')) { lastHp = null; return; }
  if (lastHp != null && P.hp < lastHp - 0.01) { R.streak = 0; }
  lastHp = P.hp;
  if (!P.alive) return;
  if (G.day >= 2 && (G.day > 2 || G.hour >= 6)) unlock('night');
  if (G.day >= 3) unlock('day3');
  const run = curRun();
  if (run && run.dist) {
    if (run !== lastRun) { lastRun = run; R = blankRun(); }
    const dm = num(run.dist.drive) + num(run.dist.cycle);
    if (R.drive0 == null) R.drive0 = dm;
    if (dm - R.drive0 >= 5) { bump('driveM', dm - R.drive0); R.drive0 = dm; }
  }
}
// tests: forget them all (in memory; written only when saving is on)
export function reset() { const a = blank(); if (persist && X.save) X.save.ach = a; A = a; R = blankRun(); write(true); if (scr && scr.classList.contains('show')) render(); }

// ---------------------------------------------------------------- the toast
function tierIcon(a, diff) { return a.t === 'range' && HARD_UP.has(diff) ? 'gun' : TIERS[a.t].ic; }
function toast(a) {
  toastQ.push(a); if (!toastOn) nextToast();
}
function nextToast() {
  const a = toastQ.shift(); if (!a) { toastOn = false; return; }
  toastOn = true;
  let box = document.getElementById('achToasts');
  if (!box) { box = document.createElement('div'); box.id = 'achToasts'; document.body.appendChild(box); }
  const T = TIERS[a.t], u = A.u[a.id] || {};
  const el = document.createElement('div'); el.className = 'zach-toast'; el.style.setProperty('--tc', T.col);
  el.innerHTML = `${badge(tierIcon(a, u.diff), T.col, 'zach-tb')}<div class="zach-tx"><div class="zach-te">Achievement unlocked</div><b>${esc(a.name)}</b><small><span>${T.name}</span> · ${esc(a.how)}</small></div>`;
  box.appendChild(el);
  try { if (X.SND && X.SND.sting) X.SND.sting(a.t === 'apoc' || a.t === 'hard' ? 'objective' : 'found'); } catch { }
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => { el.classList.remove('in'); el.classList.add('out'); }, 4200);
  setTimeout(() => { el.remove(); nextToast(); }, 4700);
}

// ---------------------------------------------------------------- the ACHIEVEMENTS screen (a .screen, so showScreen() hides it like the others)
function ensureScreen() {
  if (scr) return scr;
  scr = document.createElement('div'); scr.className = 'screen zach-screen'; scr.id = 'ach';
  scr.innerHTML = `<div class="zach-panel" role="dialog" aria-label="Achievements">
    <header><div><div class="zach-eye">All maps · all difficulties</div><h2>ACHIEVEMENTS</h2></div><div class="zach-total"></div></header>
    <div class="zach-body"></div>
    <footer><button class="zach-btn" data-a="back">Back</button></footer></div>`;
  document.body.appendChild(scr);
  scr.querySelector('[data-a=back]').onclick = () => { if (X.click) X.click(); close(); };
  addEventListener('keydown', e => { if (e.code === 'Escape' && scr.classList.contains('show')) { e.preventDefault(); e.stopImmediatePropagation(); close(); } }, true);
  return scr;
}
function render() {
  const s = ensureScreen(), n = count();
  s.querySelector('.zach-total').innerHTML = `<b>${n}<span> / ${LIST.length}</span></b><div class="zach-bar"><i style="width:${(n / LIST.length * 100).toFixed(1)}%"></i></div>`;
  const mapName = id => (X.mapName ? X.mapName(id) : id) || '';
  s.querySelector('.zach-body').innerHTML = Object.entries(TIERS).map(([t, T]) => {
    const L = LIST.filter(a => a.t === t), got = L.filter(a => A.u[a.id]).length;
    return `<section style="--tc:${T.col}"><h3>${badge(t === 'range' ? 'arrow' : T.ic, T.col, 'zach-hb')}<span>${T.name}</span><em>${got} / ${L.length}</em>${t === 'range' ? '<small>arrow on Easy / Medium · gun on Hard and up</small>' : ''}</h3><div class="zach-grid">${L.map(a => {
      const u = A.u[a.id], hide = a.secret && !u, p = progress(a);
      const meta = u ? `${new Date(u.at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} · ${D_NAME[u.diff] || esc(u.diff)}${u.map ? ' · ' + esc(mapName(u.map)) : ''}` : '';
      const bar = !u && p != null && !hide ? `<div class="zach-pb"><i style="width:${(p / a.goal * 100).toFixed(1)}%"></i></div><div class="zach-pn">${p.toLocaleString()} / ${a.goal.toLocaleString()}${a.unit ? ' ' + a.unit : ''}</div>` : '';
      return `<div class="zach-card${u ? ' got' : ''}">${badge(hide ? 'skull' : tierIcon(a, u ? u.diff : 'easy'), T.col, '', !u)}<div class="zach-ct"><b>${hide ? '???' : esc(a.name)}</b><small>${hide ? 'Secret achievement. Keep playing...' : esc(a.how)}</small>${u ? `<em>${icon('check')} ${meta}</em>` : bar}</div></div>`;
    }).join('')}</div></section>`;
  }).join('');
}
let from = 'title';
export function open() {
  const s = ensureScreen(); from = X.G && X.G.state === 'pause' ? 'pause' : 'title';
  if (X.showScreen) X.showScreen('ach'); s.classList.add('show');
  render(); s.querySelector('.zach-body').scrollTop = 0;
}
export function close() {
  if (!scr) return; scr.classList.remove('show');
  if (X.showScreen) X.showScreen(from === 'pause' && X.G && X.G.state === 'pause' ? 'pause' : from === 'pause' ? null : 'title');
}
export const isOpen = () => !!(scr && scr.classList.contains('show'));
export function addTitleButton(menu, no = '04') {
  if (!menu) return null;
  let b = menu.querySelector('#btnAch');
  if (!b) { b = document.createElement('button'); b.className = 'mi'; b.id = 'btnAch'; menu.appendChild(b); b.onclick = () => { if (X.click) X.click(); open(); }; }
  b.innerHTML = `<span class="no">${esc(no)}</span><span class="tx"><b>ACHIEVEMENTS</b><small>${count()} / ${LIST.length} unlocked · Deadly, Range, Medium-Hard, Very Hard, Apocalypse</small></span>`;
  return b;
}
function addPauseButton() {
  const box = document.querySelector('#pause .pbtns'); if (!box || box.querySelector('#achPause')) return;
  const b = document.createElement('button'); b.className = 'm'; b.id = 'achPause'; b.textContent = 'Achievements';
  b.onclick = () => { if (X.click) X.click(); open(); };
  box.prepend(b);
}

function injectCSS() {
  if (css) return; css = true;
  const s = document.createElement('style'); s.id = 'zach-css';
  s.textContent = `
#achToasts { position: fixed; z-index: 7; top: calc(env(safe-area-inset-top, 0px) + 104px); right: calc(env(safe-area-inset-right, 0px) + 14px); width: min(360px, calc(100vw - 28px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px))); pointer-events: none; display: flex; flex-direction: column; gap: 8px; }
.zach-toast { --tc: #c62a1e; display: flex; align-items: center; gap: 12px; padding: 10px 14px 10px 10px; box-sizing: border-box; color: #ece6d8; font-family: 'Oswald', 'Arial Narrow', sans-serif;
  background: linear-gradient(100deg, rgba(14,12,11,.94), rgba(26,22,20,.9)); border: 1px solid rgba(255,255,255,.1); border-left: 4px solid var(--tc); border-radius: 3px;
  box-shadow: 0 12px 40px rgba(0,0,0,.6), 0 0 24px color-mix(in srgb, var(--tc) 30%, transparent); transform: translateX(calc(100% + 40px)); opacity: 0; transition: transform .45s cubic-bezier(.2,.9,.25,1.15), opacity .35s; }
.zach-toast.in { transform: none; opacity: 1; } .zach-toast.out { transform: translateX(40px); opacity: 0; transition: transform .4s ease-in, opacity .4s; }
.zach-toast .badge { width: 54px; height: 54px; flex: none; filter: drop-shadow(0 0 8px color-mix(in srgb, var(--tc) 55%, transparent)); }
.zach-tx { min-width: 0; flex: 1; }
.zach-te { font-size: 10px; letter-spacing: .28em; text-transform: uppercase; color: var(--tc); font-weight: 600; }
.zach-tx b { display: block; font-family: 'Bebas Neue', 'Oswald', Impact, sans-serif; font-weight: 400; font-size: 24px; letter-spacing: .05em; line-height: 1.1; margin: 2px 0 1px; overflow-wrap: break-word; }
.zach-tx small { display: block; font-size: 11.5px; line-height: 1.35; color: #b9b2a4; letter-spacing: .02em; }
.zach-tx small span { color: var(--tc); letter-spacing: .14em; font-weight: 600; }
@media (max-height: 500px) { #achToasts { top: calc(env(safe-area-inset-top, 0px) + 54px); right: auto; left: 50%; transform: translateX(-50%); width: min(264px, calc(100vw - 28px)); }
  .zach-toast { transform: translateY(-30px); } .zach-toast.out { transform: translateY(-20px); } .zach-toast { padding: 7px 10px 7px 8px; gap: 9px; } .zach-toast .badge { width: 42px; height: 42px; } .zach-tx b { font-size: 19px; } .zach-tx small { font-size: 10.5px; } }
.zach-screen { position: fixed; inset: 0; z-index: 9; background: radial-gradient(ellipse at 50% 30%, rgba(30,10,8,.6), rgba(0,0,0,.88)); display: flex !important; align-items: center; justify-content: center;
  padding: max(8px, env(safe-area-inset-top, 0px)) max(8px, env(safe-area-inset-right, 0px)) max(8px, env(safe-area-inset-bottom, 0px)) max(8px, env(safe-area-inset-left, 0px)); box-sizing: border-box; }
.zach-panel { position: relative; width: min(1020px, 100%); height: 100%; max-height: 100%; display: flex; flex-direction: column; box-sizing: border-box; color: #ece6d8; font-family: 'Oswald', 'Arial Narrow', sans-serif;
  background: linear-gradient(165deg, rgba(26,24,22,.97), rgba(10,9,8,.98)); border: 1px solid rgba(255,255,255,.08); border-top-color: rgba(255,255,255,.14); border-radius: 3px; box-shadow: 0 30px 90px rgba(0,0,0,.75); }
@media (min-height: 760px) { .zach-panel { height: auto; max-height: min(92vh, 900px); } }
.zach-panel::before { content: ''; position: absolute; left: -1px; top: 26px; width: 3px; height: 46px; background: #c62a1e; box-shadow: 0 0 16px rgba(198,42,30,.6); }
.zach-panel header { display: flex; align-items: flex-end; justify-content: space-between; gap: 10px 18px; flex-wrap: wrap; padding: 20px 26px 14px; border-bottom: 1px solid rgba(255,255,255,.08); flex: none; }
.zach-eye { font-size: 12px; letter-spacing: .4em; text-transform: uppercase; color: #c62a1e; margin-bottom: 4px; }
.zach-panel h2 { margin: 0; font-family: 'Bebas Neue', 'Oswald', Impact, sans-serif; font-weight: 400; font-size: 46px; letter-spacing: .08em; line-height: .95; }
.zach-total { min-width: 150px; text-align: right; } .zach-total b { font-family: 'Bebas Neue', 'Oswald', Impact, sans-serif; font-weight: 400; font-size: 40px; line-height: 1; letter-spacing: .04em; }
.zach-total b span { font-size: .6em; color: #9b9486; } .zach-bar { height: 5px; background: rgba(255,255,255,.08); margin-top: 6px; border-radius: 3px; overflow: hidden; } .zach-bar i { display: block; height: 100%; background: linear-gradient(90deg, #8a1810, #e0473a); }
.zach-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden; -webkit-overflow-scrolling: touch; padding: 8px 26px 20px; scrollbar-width: thin; scrollbar-color: rgba(198,42,30,.6) transparent; }
.zach-body section { margin-top: 14px; }
.zach-body h3 { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 10px; margin: 0 0 10px; padding-bottom: 7px; border-bottom: 1px solid color-mix(in srgb, var(--tc) 40%, transparent); font-weight: 500; font-size: 18px; letter-spacing: .24em; color: var(--tc); }
.zach-body h3 .badge { width: 34px; height: 34px; flex: none; } .zach-body h3 em { font-style: normal; font-size: 13px; letter-spacing: .12em; color: #9b9486; }
.zach-body h3 small { flex-basis: 100%; font-size: 11px; letter-spacing: .12em; color: #8a8478; text-transform: uppercase; }
.zach-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 270px), 1fr)); gap: 8px; }
.zach-card { display: flex; gap: 12px; align-items: center; padding: 10px 12px 10px 8px; background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.07); border-radius: 2px; min-width: 0; }
.zach-card.got { background: linear-gradient(100deg, color-mix(in srgb, var(--tc) 14%, transparent), rgba(255,255,255,.03)); border-color: color-mix(in srgb, var(--tc) 45%, transparent); }
.zach-card .badge { width: 50px; height: 50px; flex: none; } .zach-card:not(.got) .zach-ct { opacity: .62; }
.zach-ct { min-width: 0; flex: 1; } .zach-ct b { display: block; font-size: 16px; font-weight: 600; letter-spacing: .04em; line-height: 1.2; overflow-wrap: break-word; }
.zach-ct small { display: block; font-size: 12.5px; color: #b5ae9f; line-height: 1.35; margin-top: 2px; }
.zach-ct em { display: block; font-style: normal; font-size: 11px; letter-spacing: .06em; color: var(--tc); margin-top: 4px; } .zach-ct em .ic { width: 12px; height: 12px; vertical-align: -2px; }
.zach-pb { height: 4px; background: rgba(255,255,255,.08); border-radius: 2px; overflow: hidden; margin-top: 6px; } .zach-pb i { display: block; height: 100%; background: var(--tc); }
.zach-pn { font-size: 10.5px; letter-spacing: .1em; color: #9b9486; margin-top: 3px; font-variant-numeric: tabular-nums; }
.zach-panel footer { position: sticky; bottom: 0; flex: none; padding: 12px 26px 16px; border-top: 1px solid rgba(255,255,255,.08); display: flex; justify-content: flex-end; background: rgba(10,9,8,.96); }
.zach-btn { border: 1px solid rgba(255,255,255,.14); border-radius: 2px; background: linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.01)); color: #ece6d8; font: inherit; font-weight: 500; font-size: 13px; letter-spacing: .3em; text-transform: uppercase; padding: 11px 34px; cursor: pointer; }
.zach-btn:hover { border-color: #c62a1e; color: #fff; background: linear-gradient(90deg, rgba(198,42,30,.32), rgba(198,42,30,.08)); }
@media (max-width: 640px), (max-height: 500px) { .zach-panel header { padding: 12px 14px 10px; } .zach-panel h2 { font-size: 32px; } .zach-eye { font-size: 10px; } .zach-total b { font-size: 30px; } .zach-total { min-width: 110px; }
  .zach-body { padding: 4px 12px 14px; } .zach-panel footer { padding: 8px 12px 10px; } .zach-btn { padding: 10px 26px; } .zach-card .badge { width: 42px; height: 42px; } }
`;
  document.head.appendChild(s);
}

const api = { init, unlock, has, count, event, tick, reset, open, close, isOpen, addTitleButton, LIST, TIERS, state: () => A };
export default api;
