// Zombie_Apocalypse — accessibility options (Set up your run → ACCESSIBILITY, and the pause menu):
//   · damage numbers   — how hard each of your hits landed, floating up off the body (gold = headshot, red = kill)
//   · zombie counter   — how many of the dead are on the map, how many close by, and whether any are chasing you
//   · health bars      — a small bar over any zombie you've hurt (and bosses)
//   · danger arrows    — arrows at the screen edge pointing to zombies close behind / beside you (for anyone who can't hear them)
//   · bigger text      — the HUD and subtitles one size up
// Everything is drawn on one 2D canvas over the game (no extra 3D cost), and nothing runs for options that are off.
import * as THREE from 'three';

let E = null, cv = null, g = null, badge = null, gameT = 0;   // gameT: seconds of game time (bars fade 8 s of PLAY after a hit, however slow the frames)
const nums = [];   // { x, y, z, v, t, col, big }
const hurtSeen = new Map();   // zombie → time it was last hurt (bars show for hurt ones)
const V = new THREE.Vector3();
export const OPTS = [
  ['dmgNums', 'Damage numbers', 'how hard each hit lands, floating off the body'],
  ['zCount', 'Zombie counter', 'how many are on the map, near you, and chasing you'],
  ['zBars', 'Zombie health bars', 'a small bar over any zombie you\'ve hurt'],
  ['danger', 'Danger arrows', 'arrows at the screen edge point at zombies close behind you'],
  ['bigText', 'Bigger text', 'the HUD and subtitles one size up'],
];
const on = k => !!(E && E.save.acc && E.save.acc[k]);

export function init(env) {
  E = env; E.save.acc = E.save.acc || { zCount: true };
  cv = document.createElement('canvas'); cv.id = 'accCv';
  cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:6';
  document.body.appendChild(cv); g = cv.getContext('2d');
  badge = document.createElement('div'); badge.id = 'zCount'; badge.className = 'hud';
  document.body.appendChild(badge);
  const st = document.createElement('style');
  st.textContent = `#zCount { position: fixed; left: 50%; transform: translateX(-50%); top: calc(env(safe-area-inset-top, 0px) + 96px); z-index: 7; display: none; gap: 10px; align-items: center; padding: 5px 12px; border-radius: 3px; background: rgba(10,10,9,.62); border: 1px solid rgba(255,255,255,.12); color: #ece6da; font: 500 13px Oswald, sans-serif; letter-spacing: .12em; white-space: nowrap; pointer-events: none; }
#zCount b { color: #ff8a70; font-weight: 600; } #zCount .ch { color: #ff4a3a; }
body.playing.accZ #zCount { display: flex; }
body.accBig #caption { font-size: 22px !important; } body.accBig #objList, body.accBig .toast, body.accBig #prompt { font-size: 115% !important; } body.accBig #clock .d, body.accBig #obj .ch { font-size: 14px !important; }
#who .accHead { margin: 14px 0 4px; font-size: 11px; letter-spacing: .28em; color: #d8c27a; }`;
  document.head.appendChild(st);
  // every hit YOU land fires C.events.hitmarker (after the hp comes off, before hurt/kill): the damage is what came off
  const lastHp = new WeakMap();
  const prevHurt = E.C.events.hurt;
  E.C.events.hurt = (v, dmg, by, info) => { prevHurt && prevHurt(v, dmg, by, info); if (v && v.zombie) hurtSeen.set(v, gameT); };
  const prevHit = E.C.events.hitmarker;
  E.C.events.hitmarker = (v, killed, head) => {
    prevHit && prevHit(v, killed, head);
    if (!v || !v.s) return;
    const before = lastHp.has(v) && lastHp.get(v) > v.hp ? lastHp.get(v) : (v.maxHp || 100), dmg = Math.max(1, Math.round(before - v.hp));
    lastHp.set(v, killed ? (v.maxHp || 100) : v.hp);
    if (v.zombie) hurtSeen.set(v, gameT);
    if (!on('dmgNums')) return;
    const p = v.s.pos, h = (v.sizeK || 1) * 1.75;
    nums.push({ x: p.x + (Math.random() - 0.5) * 0.4, y: (v.s.gy || 0) + h * (head ? 1 : 0.75), z: p.z + (Math.random() - 0.5) * 0.4, v: dmg, t: 0,
      col: killed ? '#ff4a3a' : head ? '#ffd24a' : '#ffffff', head: !!head, kill: !!killed, who: v });
    if (nums.length > 40) nums.shift();
  };
  addOptions();
  sync();
}
function sync() {
  document.body.classList.toggle('accZ', on('zCount'));
  document.body.classList.toggle('accBig', on('bigText'));
}
// the options: a section on "Set up your run", and the same toggles in the pause menu
function addOptions() {
  const mk = (where, cls) => {
    if (!where || where.querySelector('.' + cls)) return;
    const box = document.createElement('div'); box.className = cls;
    box.innerHTML = '<div class="accHead lbl">ACCESSIBILITY</div>' + OPTS.map(([k, t, d]) => `<label class="opt"><span>${t}<small>${d}</small></span><input type="checkbox" data-acc="${k}"></label>`).join('');
    where.appendChild(box);
    for (const i of box.querySelectorAll('input')) { i.checked = on(i.dataset.acc); i.onchange = () => { E.save.acc[i.dataset.acc] = i.checked; E.writeSave && E.writeSave(); sync(); for (const j of document.querySelectorAll(`input[data-acc="${i.dataset.acc}"]`)) j.checked = i.checked; }; }
  };
  mk(document.querySelector('#who .opts'), 'accWho');
  const pz = document.querySelector('#pause .center-panel'), keys = pz && pz.querySelector('.keys');
  if (pz && !pz.querySelector('.accPause')) { const holder = document.createElement('div'); if (keys) pz.insertBefore(holder, keys); else pz.appendChild(holder); mk(holder, 'accPause'); }
}

let cT = 0;
export function update(dt) {
  if (!E) return;
  const W = innerWidth, H = innerHeight, dpr = Math.min(2, devicePixelRatio || 1);
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  const P = E.P(), G = E.G, cam = E.camera, play = G.state === 'play' && P && P.s;
  if (!play) { nums.length = 0; return; }
  gameT += dt;
  const zs = E.Z.list.filter(u => u.alive && u.active);
  // the counter
  if (on('zCount') && (cT -= dt) <= 0) {
    cT = 0.3; let near = 0, chase = 0;
    for (const u of zs) { const d = u.s.pos.distanceTo(P.s.pos); if (d < 25) near++; if (u.z && u.z.state === 'chase' && u.z.tgt === P) chase++; }
    badge.innerHTML = `🧟 <span><b>${zs.length}</b> ON THE MAP</span><span>· <b>${near}</b> NEAR YOU</span>${chase ? `<span class="ch">· ${chase} CHASING YOU</span>` : ''}`;
  }
  const toScreen = (x, y, z) => { V.set(x, y, z).project(cam); return V.z < 1 && V.z > -1 ? [(V.x + 1) / 2 * W, (1 - V.y) / 2 * H] : null; };
  // health bars over the hurt ones (and bosses), close enough to matter
  if (on('zBars')) {
    for (const u of zs) {
      const d = u.s.pos.distanceTo(P.s.pos); if (d > 30) continue;
      const hurt = hurtSeen.get(u); if (!(u.bossT || (hurt != null && gameT - hurt < 8 && u.hp < u.maxHp))) continue;
      const sp = toScreen(u.s.pos.x, (u.s.gy || 0) + (u.sizeK || 1) * 1.95 + 0.15, u.s.pos.z); if (!sp) continue;
      const w = Math.max(28, 60 - d * 1.2), f = Math.max(0, Math.min(1, u.hp / (u.maxHp || 100)));
      g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(sp[0] - w / 2 - 1, sp[1] - 1, w + 2, 6);
      g.fillStyle = f > 0.5 ? '#c8b04a' : f > 0.25 ? '#d87a2a' : '#d8392a'; g.fillRect(sp[0] - w / 2, sp[1], w * f, 4);
    }
  }
  // damage numbers: float up and fade
  if (nums.length) {
    g.textAlign = 'center'; g.lineJoin = 'round';
    for (let i = nums.length - 1; i >= 0; i--) {
      const n = nums[i]; n.t += dt; if (n.t > 1.2) { nums.splice(i, 1); continue; }
      if (!n.kill && n.who && !n.who.alive) { n.kill = true; n.col = '#ff4a3a'; }
      const sp = toScreen(n.x, n.y + n.t * 0.9, n.z); if (!sp) continue;
      const a = n.t < 0.15 ? n.t / 0.15 : 1 - Math.max(0, n.t - 0.7) / 0.5, sz = (n.head || n.kill ? 24 : 18) * (1 + Math.max(0, 0.25 - n.t) * 1.6);
      g.globalAlpha = Math.max(0, a); g.font = `700 ${sz}px Oswald, sans-serif`;
      const txt = n.v + (n.head ? '!' : '');
      g.strokeStyle = 'rgba(0,0,0,.8)'; g.lineWidth = 4; g.strokeText(txt, sp[0], sp[1]); g.fillStyle = n.col; g.fillText(txt, sp[0], sp[1]);
    }
    g.globalAlpha = 1;
  }
  // danger arrows: zombies within 12 m that you can't see (behind / off screen), pointing from the screen edge
  if (on('danger')) {
    const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd); const yawC = Math.atan2(fwd.x, fwd.z);
    for (const u of zs) {
      const dx = u.s.pos.x - P.s.pos.x, dz = u.s.pos.z - P.s.pos.z, d = Math.hypot(dx, dz); if (d > 12) continue;
      const sp = toScreen(u.s.pos.x, (u.s.gy || 0) + 1.2, u.s.pos.z);
      if (sp && sp[0] > 0 && sp[0] < W && sp[1] > 0 && sp[1] < H) continue;   // you can see it
      let a = Math.atan2(dx, dz) - yawC; a = Math.atan2(Math.sin(a), Math.cos(a));   // 0 = ahead, ±π = behind
      const R = Math.min(W, H) * 0.42, cx = W / 2 + Math.sin(-a) * R * (W / Math.min(W, H)) * 0.9, cy = H / 2 - Math.cos(a) * R;
      const k = 1 - d / 12, sz = 14 + k * 14;
      g.save(); g.translate(cx, cy); g.rotate(-a); g.globalAlpha = 0.45 + k * 0.5;
      g.fillStyle = '#ff3a2a'; g.strokeStyle = 'rgba(0,0,0,.7)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, -sz); g.lineTo(sz * 0.7, sz * 0.5); g.lineTo(0, sz * 0.15); g.lineTo(-sz * 0.7, sz * 0.5); g.closePath(); g.stroke(); g.fill();
      g.restore();
    }
    g.globalAlpha = 1;
  }
}
