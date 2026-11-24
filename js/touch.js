// Zombie_Apocalypse — touch controls for iPhone / iPad (and any touch-first device). Only ever switched on when
// mobile.js says this is a touch device (or ?touch=1): on desktop nothing here runs.
// Everything maps onto the game's own input — the keys Set, synthetic key presses, G.mouse, G.shoveReq, G.stick —
// so every bit of game logic stays exactly the same.
import { DEV } from './mobile.js';
import { icon } from './icons.js';

// icons the HUD set doesn't have (same 24×24 line style as icons.js)
const EX = {
  jump: '<path d="M12 20V7"/><path d="M6.5 12.5L12 7l5.5 5.5"/><path d="M5 3.5h14"/>',
  crouch: '<circle cx="12" cy="5" r="2.2"/><path d="M9 21l1.2-5.5L7 12l3.5-4h3l3 4.5-3.5 1.5L15 21"/>',
  hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12"/><path d="M11 11V4a1.5 1.5 0 0 1 3 0v7"/><path d="M14 11V5.5a1.5 1.5 0 0 1 3 0V14c0 4-2.6 7-6.5 7-2.6 0-4.1-1.2-5.4-3.2L3.4 14.6a1.5 1.5 0 0 1 2.5-1.6L8 15.5"/>',
  eye: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  shove: '<path d="M4 12h9"/><path d="M10 7l5 5-5 5"/><path d="M19 4v16"/>',
  reload: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4.5V11h-6.5"/>',
  lantern: '<path d="M9 3.5h6M12 3.5V6"/><path d="M8 6h8l1 3v8.5L16 21H8l-1-3.5V9z"/><path d="M12 10.5c1.4 1.3 1.6 3.1 0 4.5-1.6-1.4-1.4-3.2 0-4.5z"/>',
  view: '<path d="M3 8.5h3.5l2-2.5h7l2 2.5H21V19H3z"/><circle cx="12" cy="13" r="3.6"/>',
  gas: '<path d="M7 21h10"/><path d="M8.5 21l1.5-15h4l1.5 15"/><path d="M10 11h4"/>',
  brake: '<rect x="5" y="9" width="14" height="10" rx="1.5"/><path d="M8 9V6h8v3"/>',
  exit: '<path d="M14 4h5v16h-5"/><path d="M10 8l-4 4 4 4"/><path d="M6 12h10"/>',
  hbrake: '<circle cx="12" cy="12" r="8"/><path d="M12 7v6"/><circle cx="12" cy="16.2" r=".6"/>',
};
export const ic = n => EX[n] ? `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${EX[n]}</svg>` : icon(n);

// the tutorial and tips, said for thumbs
export const TOUCH_TUT = {
  look: { keys: ['Drag'], text: 'Drag your finger on the <b>right side</b> of the screen to turn the camera.' },
  walk: { keys: ['Stick'], text: 'Put your thumb down anywhere on the <b>left side</b> and slide it to walk. You go the way the camera faces.' },
  sprint: { keys: ['Push far'], text: 'Push the stick <b>all the way out</b> to run — or <b>double-tap</b> the left side to keep running. Running tires you out, and they hear it.' },
  crouch: { keys: ['Crouch'], text: 'Tap the <b>crouch</b> button: quiet, and harder to see. Tap it again to stand up.' },
  jump: { keys: ['Jump'], text: 'Tap <b>jump</b> (the arrow). Near a fence, a hedge or a ledge, it vaults or climbs over.' },
  view: { keys: ['View'], text: 'Tap the <b>camera</b> button at the top right to switch between first and third person.' },
  door: { keys: ['Use'], text: 'Walk up to a door and tap <b>Use</b> (the hand) — or the label in the middle of the screen. Close doors behind you later: they slow the dead down.' },
  search: { keys: ['Use'], text: 'Find a <b>cupboard, drawer or the fridge</b> and tap <b>Use</b> to search it. What you find goes into your backpack.' },
  bag: { keys: ['Bag'], text: 'Tap the <b>backpack</b> button on the right, just above the big attack button: you swing it round and open it.' },
  eat: { keys: ['Bag'], text: 'In the backpack, tap <b>Eat</b> or <b>Drink</b> on something. Food and water keep you going.' },
  phone: { keys: ['Phone'], text: 'Tap the <b>phone</b> button at the top right. Open <b>Messages</b> and text Mom or Ben.' },
  attack: { keys: ['Attack'], text: 'Tap the big <b>attack</b> button to swing at the air. The dot in the middle is your aim; <b>shove</b> pushes them off you.' },
};
export const TOUCH_TIPS = {
  zombie: { keys: ['Attack'], text: 'Put the dot on the <b>head</b> — only that puts them down for good. Or don\'t fight: run, and close doors behind you.' },
  grab: { keys: ['MASH'], text: 'Tap <b>MASH</b> as fast as you can to break free before it bites.' },
  night: { keys: ['Light'], text: 'Tap the <b>flashlight</b> button. It helps you see — and helps them see you.' },
  bleed: { keys: ['Heal'], text: 'You\'re bleeding. Tap the <b>bandage</b> button — or open the backpack and use one.' },
  hungry: { keys: ['Bag'], text: 'Open your <b>backpack</b> (top right) and eat something before you get weak.' },
  weapon: { keys: ['Slots'], text: 'It\'s in your hand. Tap the <b>weapon slots</b> at the top right to switch — the rest ride on your backpack.' },
};
export function touchStep(S, tips = false) {
  if (!DEV.touch || !S) return S;
  const T = (tips ? TOUCH_TIPS : TOUCH_TUT)[S.id];
  return T ? { ...S, ...T } : S;
}
// in-game text that names keys, said for thumbs
const TW = { F: 'LIGHT', Q: 'HEAL', Tab: 'BAG', T: 'phone', C: 'DUCK', V: 'view', L: 'LAMP', G: 'THROW', H: 'FIRE', R: 'RELOAD' };
export function touchWords(s) {
  if (!DEV.touch || !s || typeof s !== 'string') return s;
  return s
    .replace(/W \/ S drive · A \/ D steer · Space handbrake · E get out/g, 'GAS / BRAKE · stick steers · EXIT gets out')
    .replace(/W pedal · S brake · A \/ D steer · Shift sprint · Space jump · E get off/g, 'GAS pedals · stick steers · EXIT gets off')
    .replace(/press L to light it, E to set it down/g, 'the LAMP button lights it, USE sets it down')
    .replace(/\b([Pp])ress (<b>|<kbd>)?E(<\/b>|<\/kbd>)?(?![a-zA-Z])/g, (m, p, a = '', b = '') => (p === 'P' ? 'Tap ' : 'tap ') + a + 'USE' + b)
    .replace(/<b>E<\/b>/g, '<b>USE</b>').replace(/— E\b/g, '— USE')
    .replace(/\bMash (<b>|<kbd>)?Space(<\/b>|<\/kbd>)?/gi, 'Tap MASH')
    .replace(/\b([Pp])ress (<b>|<kbd>)?(F|Q|Tab|T|C|V|L|G|H|R)(<\/b>|<\/kbd>)?(?![a-zA-Z0-9])/g, (m, p, a = '', k, b = '') => (p === 'P' ? 'Tap' : 'tap') + ' the ' + a + TW[k] + b + ' button');
}

const CSS = `
body.touch, body.touch * { -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; }
html.touch, body.touch { touch-action: none; overscroll-behavior: none; -webkit-text-size-adjust: 100%; }
body.touch button, body.touch select, body.touch input, body.touch label, body.touch .mi, body.touch .dbtn, body.touch .slot { touch-action: manipulation; }
body.touch .center-panel, body.touch #bagBody, body.touch #phoneScreen, body.touch .pchat, body.touch #slotList, body.touch #whoList, body.touch .bagwrap { touch-action: pan-y; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; }
body.touch canvas#gl { cursor: default; }
body.touch #help, body.touch #title .hint .k { display: none !important; }
#tcZone { position: fixed; inset: 0; z-index: 4; touch-action: none; display: none; }
#tc { position: fixed; inset: 0; z-index: 7; pointer-events: none; display: none; font-family: 'Oswald', 'Arial Narrow', sans-serif; }
body.tcOn #tcZone, body.tcOn #tc { display: block; }
#tc .tb { position: absolute; pointer-events: auto; box-sizing: border-box; width: var(--s, 56px); height: var(--s, 56px); margin: calc(var(--s, 56px) / -2) 0 0 calc(var(--s, 56px) / -2);
  border-radius: 50%; background: rgba(10,10,9,.42); border: 1.5px solid rgba(236,230,218,.34); color: #ece6da; display: flex; align-items: center; justify-content: center;
  font-size: calc(var(--s, 56px) * .44); padding: 0; touch-action: none; transition: transform .08s, background .12s, opacity .2s; opacity: .92; }
#tc .tb .ic { width: 1em; height: 1em; }
#tc .tb.dn { transform: scale(.9); background: rgba(236,230,218,.32); }
#tc .tb.on { background: rgba(198,42,30,.55); border-color: rgba(255,140,120,.75); }
#tc .tb.hot { border-color: #ffd27a; box-shadow: 0 0 0 2px rgba(255,210,122,.35), 0 0 18px rgba(255,210,122,.35); color: #ffe3a8; }
#tc .tb.off { display: none; }
#tc .tb i { position: absolute; right: -3px; top: -3px; min-width: 18px; height: 18px; border-radius: 9px; background: #c62a1e; color: #fff; font: 600 11px/18px Oswald, sans-serif; font-style: normal; text-align: center; padding: 0 4px; box-sizing: border-box; }
#tc .tb em { position: absolute; left: 50%; bottom: 5px; transform: translateX(-50%); font: 500 10.5px Oswald, sans-serif; letter-spacing: .1em; line-height: 1; font-style: normal; color: rgba(236,230,218,.8); white-space: nowrap; text-shadow: 0 1px 2px #000; text-transform: uppercase; }
#tc .tb.big { --s: 84px; background: rgba(150,30,22,.42); border-color: rgba(255,150,130,.5); }
#tc .tb.big em { bottom: 9px; font-size: 11px; }
#tcR .tb:not(.big) .ic { transform: translateY(-5px) scale(.9); }
#tcT .tb em { display: none; }
#tcR { position: absolute; right: calc(env(safe-area-inset-right, 0px) + 18px + 42px); bottom: calc(env(safe-area-inset-bottom, 0px) + 14px + 42px); width: 0; height: 0; }
#tcT { position: absolute; right: calc(env(safe-area-inset-right, 0px) + 10px); top: calc(env(safe-area-inset-top, 0px) + 8px); display: flex; gap: 8px; }
#tcT .tb { position: relative; margin: 0; --s: 48px; }
#tcStick { position: absolute; width: 128px; height: 128px; margin: -64px 0 0 -64px; border-radius: 50%; border: 2px solid rgba(236,230,218,.28); background: radial-gradient(circle, rgba(10,10,9,.05), rgba(10,10,9,.28)); display: none; pointer-events: none; }
#tcStick.show { display: block; }
#tcStick.idle { opacity: .45; }
#tcStick.run { border-color: rgba(255,170,120,.75); }
#tcStick .k { position: absolute; left: 50%; top: 50%; width: 56px; height: 56px; margin: -28px 0 0 -28px; border-radius: 50%; background: rgba(236,230,218,.4); border: 1.5px solid rgba(255,255,255,.55); }
#tcStick .r { position: absolute; left: 50%; top: -18px; transform: translateX(-50%); font: 600 10px Oswald, sans-serif; letter-spacing: .25em; color: #ffb890; display: none; text-shadow: 0 1px 2px #000; }
#tcStick.run .r { display: block; }
#tcMash { position: absolute; left: 50%; bottom: calc(env(safe-area-inset-bottom, 0px) + 18%); transform: translateX(-50%); pointer-events: auto; width: 150px; height: 150px; border-radius: 50%; background: rgba(198,42,30,.65);
  border: 3px solid #ffb4a4; color: #fff; font: 400 40px 'Bebas Neue', Oswald, sans-serif; letter-spacing: .1em; display: none; align-items: center; justify-content: center; touch-action: none; animation: tcm .25s infinite alternate; }
@keyframes tcm { to { transform: translateX(-50%) scale(1.06); } }
#tcMash.show { display: flex; }
#tcMash.dn { background: rgba(255,90,70,.85); }
#tcRot { position: fixed; inset: 0; z-index: 70; background: #0b0b0a; color: #ece6da; display: none; flex-direction: column; align-items: center; justify-content: center; text-align: center; font: 500 18px Oswald, sans-serif; letter-spacing: .14em; padding: 24px; }
#tcRot b { font: 400 clamp(26px, 10vw, 44px) 'Bebas Neue', Oswald, sans-serif; letter-spacing: .1em; display: block; margin-bottom: 8px; white-space: nowrap; }
#tcRot small { display: block; max-width: 86vw; font: 300 clamp(13px, 4vw, 16px)/1.4 Oswald, sans-serif; letter-spacing: .08em; color: #9b9486; }
#tcRot .ph { width: 46px; height: 80px; border: 3px solid #ece6da; border-radius: 9px; margin: 0 auto 22px; animation: tcr 1.8s ease-in-out infinite; }
@keyframes tcr { 0%, 25% { transform: rotate(0); } 60%, 100% { transform: rotate(-90deg); } }
@media (orientation: portrait) { body.touch.phone.playing #tcRot, body.touch.phone.tvmode #tcRot { display: flex; } }
body.touch #prompt.tap { pointer-events: auto; z-index: 6; padding: 8px 14px; border-radius: 6px; background: rgba(10,10,9,.45); border: 1px solid rgba(255,210,122,.45); }
body.touch #slots { pointer-events: auto; z-index: 6; }
body.touch #slots .slot { cursor: pointer; }
body.touch #struggle .s kbd { display: none; }
/* the HUD, out of the way of the thumbs */
body.touch #weapon { display: none !important; }
/* (these boxes are CSS-zoomed by --ui, and WebKit zooms their offsets too: divide by it) */
body.touch #slots { right: calc((env(safe-area-inset-right, 0px) + 10px) / var(--ui)) !important; bottom: auto !important; top: calc((env(safe-area-inset-top, 0px) + 62px) / var(--ui)) !important; }
body.touch #vitals { left: calc((env(safe-area-inset-left, 0px) + 8px) / var(--ui)) !important; bottom: auto !important; top: calc((env(safe-area-inset-top, 0px) + 6px) / var(--ui)) !important; }
body.touch #obj { left: calc((env(safe-area-inset-left, 0px) + 8px) / var(--ui)) !important; top: calc((env(safe-area-inset-top, 0px) + 10px + var(--vitH, 80px)) / var(--ui)) !important; }
body.touch #toasts { right: auto !important; left: calc((env(safe-area-inset-left, 0px) + 10px) / .8) !important; top: calc((var(--objB, 50vh) + 8px) / .8) !important; align-items: flex-start !important; }
body.touch.tcBig #tut, body.touch.grabbed #tut { display: none !important; }
body.touch.tcDrive #tut { left: calc((env(safe-area-inset-left, 0px) + 8px) / var(--ui)) !important; transform: none; top: calc((var(--objB, 40vh) + 8px) / var(--ui)) !important; width: min(300px, 34vw) !important; }
body.touch #tut { top: calc((env(safe-area-inset-top, 0px) + 76px) / var(--ui)) !important; bottom: auto !important; left: 50% !important; transform: translateX(-50%); width: min(380px, 50vw) !important; }
body.touch.tcBag #tut { top: auto !important; bottom: calc((env(safe-area-inset-bottom, 0px) + 10px) / var(--ui)) !important; left: calc((env(safe-area-inset-left, 0px) + 8px) / var(--ui)) !important; transform: none; width: min(300px, 30vw) !important; }
body.touch #tut button { padding: 10px 6px !important; }
body.touch #caption { bottom: calc(env(safe-area-inset-bottom, 0px) + 10px) !important; left: calc((100vw - 380px - env(safe-area-inset-right, 0px)) / 2 + env(safe-area-inset-left, 0px) / 2) !important; max-width: calc(100vw - 400px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)) !important; min-width: 240px; z-index: 8; pointer-events: none; -webkit-line-clamp: 5 !important; }
body.touch #prompt { bottom: 31vh !important; }
body.touch.phone #prompt { left: auto !important; right: 40vw; bottom: auto !important; top: 64% !important; transform: translateY(-50%) !important; max-width: 40vw; white-space: normal !important; flex-wrap: wrap; z-index: 8; box-sizing: border-box; }
body.touch.phone #prompt .sm { flex-basis: 100%; margin-top: 2px; }
body.touch.phone { --ui: .66 !important; }
body.touch.phone #compass { top: calc((env(safe-area-inset-top, 0px) + 54px) / var(--ui)) !important; width: 260px !important; }
body.touch.phone #tut { width: min(420px, 50vw) !important; }
body.touch.tablet #tut { top: calc((env(safe-area-inset-top, 0px) + 98px) / var(--ui)) !important; }
body.touch.phone #vitals { width: 230px !important; padding: 8px 10px !important; }
body.touch.phone #obj { width: min(300px, 40vw) !important; min-width: 150px !important; box-sizing: border-box; }
body.touch.phone #obj .ch { letter-spacing: .18em !important; flex-wrap: wrap; }
body.touch.phone #obj .o { font-size: 12px !important; line-height: 1.35 !important; }
body.touch.phone #caption { font-size: 14px !important; }
body.touch #toasts { zoom: .8; }
body.touch #toasts .toast { max-width: 38vw; }
body.touch.phone .center-panel { max-height: calc(100vh - 12px) !important; overflow-y: auto !important; }
body.touch.tablet { --ui: .9 !important; }
#bagClose { min-width: 96px; min-height: 44px; font-size: 16px !important; }
body.touch #intro .skip, body.touch #tv .skip, body.touch #note .close { font-size: 13px; }
#tcHow { margin: 0 0 14px; padding: 10px 14px; border-left: 2px solid #c62a1e; background: rgba(255,255,255,.04); font-size: 13px; line-height: 1.7; text-align: left; }
#tcHow b { color: #fff; }
`;

export function initTouch(A) {
  if (!DEV.touch) return null;
  const { G, keys, save } = A;
  const $ = id => document.getElementById(id);
  document.documentElement.classList.add('touch');
  document.body.classList.add('touch', DEV.phone ? 'phone' : 'tablet');
  // let the page reach under the notch / home bar, and use env(safe-area-inset-*) to keep clear of them
  { const m = document.querySelector('meta[name=viewport]'); if (m && !/viewport-fit/.test(m.content)) m.content += ', viewport-fit=cover'; }
  { const st = document.createElement('style'); st.id = 'touchCSS'; st.textContent = CSS; document.head.appendChild(st); }

  // ---- synthetic keys, reference-counted (two things can hold W: the stick and the GAS pedal)
  const held = new Map();
  const fire = (type, code) => dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true, cancelable: true }));
  const press = code => { fire('keydown', code); fire('keyup', code); };
  function hold(code, src, on) {
    let s = held.get(code); if (!s) held.set(code, s = new Set());
    const was = s.size > 0; if (on) s.add(src); else s.delete(src);
    if (!was && s.size) fire('keydown', code); else if (was && !s.size) fire('keyup', code);
  }
  function releaseAll() { for (const [code, s] of held) if (s.size) { s.clear(); fire('keyup', code); } G.mouse.left = G.mouse.right = false; if (A.rdrag) A.rdrag.on = false; stickEnd(); lookId = null; for (const b of Object.values(B)) b.el.classList.remove('dn'); }

  // ---- DOM
  const zone = document.createElement('div'); zone.id = 'tcZone'; document.body.appendChild(zone);
  const root = document.createElement('div'); root.id = 'tc'; document.body.appendChild(root);
  root.innerHTML = `<div id="tcStick"><div class="r">RUN</div><div class="k"></div></div><div id="tcR"></div><div id="tcT"></div><div id="tcMash">MASH</div>`;
  const rot = document.createElement('div'); rot.id = 'tcRot'; rot.innerHTML = '<div class="ph"></div><b>TURN YOUR PHONE</b><small>Zombie_Apocalypse plays sideways</small>'; document.body.appendChild(rot);
  const stickEl = $('tcStick'), knob = stickEl.querySelector('.k'), R = $('tcR'), T = $('tcT'), mash = $('tcMash');
  { const h = Math.round(98 * (DEV.phone ? 1 : 1.18) / 2); R.style.right = `calc(env(safe-area-inset-right, 0px) + 18px + ${h}px)`; R.style.bottom = `calc(env(safe-area-inset-bottom, 0px) + 14px + ${h}px)`; }

  // buttons: id → { el, ...def }. Ring positions are polar around the attack button (angle in degrees, 180 = left).
  const B = {};
  const K = DEV.phone ? 1 : 1.18;
  function btn(id, parent, def) {
    const el = document.createElement('button'); el.className = 'tb' + (def.big ? ' big' : ''); el.dataset.b = id; el.setAttribute('aria-label', def.label || id);
    el.innerHTML = ic(def.icon) + (def.em != null ? `<em>${def.em}</em>` : '') + '<i style="display:none"></i>';
    if (def.s) el.style.setProperty('--s', Math.round(def.s * K) + 'px');
    if (def.at) { const [r, a] = def.at, rad = a * Math.PI / 180; el.style.left = Math.round(Math.cos(rad) * r * K) + 'px'; el.style.top = Math.round(-Math.sin(rad) * r * K) + 'px'; }
    parent.appendChild(el); B[id] = { el, ...def, badge: el.querySelector('i'), emEl: el.querySelector('em') };
    return B[id];
  }
  // on foot
  btn('attack', R, { big: true, icon: 'fist', em: '', s: 98, at: [0, 0], down: () => { if (G.grabbedBy) { press('Space'); return; } try { A.assist && A.assist(); } catch { } G.mouse.left = true; G.clickReq = true; }, up: () => { G.mouse.left = false; }, label: 'Attack' });
  btn('aim', R, { icon: 'eye', em: 'aim', s: 64, at: [132, 184], down: () => { G.mouse.right = true; if (A.rdrag) { A.rdrag.on = true; A.rdrag.d = 0; A.rdrag.t = performance.now(); } }, up: () => { G.mouse.right = false; if (A.rdrag) A.rdrag.on = false; }, label: 'Aim / zoom (hold)' });
  btn('bag', R, { icon: 'backpack', em: 'bag', s: 64, at: [132, 88], tap: () => press('Tab'), label: 'Backpack' });
  btn('use', R, { icon: 'hand', em: 'use', s: 64, at: [136, 153], tap: () => press('KeyE'), label: 'Use' });
  btn('jump', R, { icon: 'jump', em: 'jump', s: 64, at: [136, 118], down: () => hold('Space', 'jump', true), up: () => hold('Space', 'jump', false), label: 'Jump / climb' });
  btn('shove', R, { icon: 'shove', em: 'shove', s: 56, at: [212, 182], tap: () => { G.shoveReq = true; }, label: 'Shove' });
  btn('crouch', R, { icon: 'crouch', em: 'duck', s: 56, at: [212, 160], tap: () => press('KeyC'), label: 'Crouch' });
  btn('reload', R, { icon: 'reload', em: 'reload', s: 56, at: [212, 138], tap: () => press('KeyR'), label: 'Reload' });
  btn('heal', R, { icon: 'cross', em: 'heal', s: 56, at: [212, 116], tap: () => press('KeyQ'), label: 'Bandage' });
  btn('bottle', R, { icon: 'bottle', em: 'throw', s: 52, at: [286, 177], tap: () => press('KeyG'), label: 'Throw a bottle' });
  btn('molotov', R, { icon: 'flame', em: 'fire', s: 52, at: [286, 163], tap: () => press('KeyH'), label: 'Throw a Molotov' });
  btn('light', R, { icon: 'torch', em: 'light', s: 52, at: [286, 149], tap: () => press('KeyF'), label: 'Flashlight' });
  btn('lantern', R, { icon: 'lantern', em: 'lamp', s: 52, at: [286, 135], tap: () => press('KeyL'), label: 'Lantern' });
  // at the wheel / on the bike
  btn('gas', R, { big: true, icon: 'gas', em: 'gas', s: 84, at: [0, 0], down: () => hold('KeyW', 'gas', true), up: () => hold('KeyW', 'gas', false), label: 'Gas' });
  btn('brake', R, { icon: 'brake', em: 'brake', s: 64, at: [104, 180], down: () => hold('KeyS', 'brake', true), up: () => hold('KeyS', 'brake', false), label: 'Brake / reverse' });
  btn('hbrake', R, { icon: 'hbrake', em: 'drift', s: 52, at: [100, 112], down: () => hold('Space', 'hb', true), up: () => hold('Space', 'hb', false), label: 'Handbrake' });
  btn('exit', R, { icon: 'exit', em: 'exit', s: 52, at: [178, 150], tap: () => press('KeyE'), label: 'Get out' });
  // the top row
  btn('view', T, { icon: 'view', tap: () => press('KeyV'), label: 'First / third person' });
  btn('phone', T, { icon: 'phone', tap: () => press('KeyT'), label: 'Phone' });
  btn('pause', T, { icon: 'pause', tap: () => press('Escape'), label: 'Pause' });

  // ---- looking: a quick swipe turns further than a slow drag of the same length
  const lookK = () => (DEV.phone ? 1.8 : 1.3);
  const lookBy = (dx, dy) => { const sp = Math.hypot(dx, dy), acc = 1 + Math.min(0.8, Math.max(0, (sp - 6) / 30)), k = lookK() * acc; A.look(dx * k, dy * k); };
  // ---- button touches (each finger tracked on its own: hold attack and drag to look at the same time)
  const owner = new Map();   // touch id → button id
  const bLook = new Map();   // touch id → last [x, y] (attack / aim also turn the camera when you slide off them)
  for (const [id, b] of Object.entries(B)) {
    const el = b.el;
    el.addEventListener('touchstart', e => {
      e.preventDefault(); e.stopPropagation();
      for (const t of e.changedTouches) { owner.set(t.identifier, id); if (id === 'attack' || id === 'aim') bLook.set(t.identifier, [t.clientX, t.clientY]); }
      if (el.classList.contains('dn')) return;
      el.classList.add('dn'); b.t0 = performance.now();
      try { if (b.down) b.down(); else if (b.tap) b.tap(); } catch (err) { console.error(err); }
      A.tapSound && A.tapSound();
    }, { passive: false });
    const end = e => {
      e.preventDefault(); e.stopPropagation();
      let mine = false; for (const t of e.changedTouches) { bLook.delete(t.identifier); if (owner.get(t.identifier) === id) { owner.delete(t.identifier); mine = true; } }
      if (!mine) return;
      for (const v of owner.values()) if (v === id) return;   // another finger's still on it
      el.classList.remove('dn'); try { b.up && b.up(); } catch (err) { console.error(err); }
    };
    el.addEventListener('touchend', end, { passive: false }); el.addEventListener('touchcancel', end, { passive: false });
    if (id === 'attack' || id === 'aim') el.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const t of e.changedTouches) { const p = bLook.get(t.identifier); if (!p) continue; const dx = t.clientX - p[0], dy = t.clientY - p[1]; p[0] = t.clientX; p[1] = t.clientY; if (lookId == null || lookId === t.identifier) lookBy(dx, dy); }
    }, { passive: false });
    // a mouse / pencil without touch events (and the tests): plain clicks still work
    el.addEventListener('mousedown', e => { if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return; e.preventDefault(); el.classList.add('dn'); if (b.down) b.down(); else if (b.tap) b.tap(); const up = () => { el.classList.remove('dn'); b.up && b.up(); removeEventListener('mouseup', up); }; addEventListener('mouseup', up); });
  }
  mash.addEventListener('touchstart', e => { e.preventDefault(); mash.classList.add('dn'); press('Space'); }, { passive: false });
  mash.addEventListener('touchend', e => { e.preventDefault(); mash.classList.remove('dn'); }, { passive: false });
  mash.addEventListener('mousedown', e => { e.preventDefault(); press('Space'); });

  // the weapon slots at the top right and the "Use" prompt in the middle are buttons too
  { const sl = new Map();   // touch id → { x0, y0, x, y, n, moved }
    $('slots').addEventListener('touchstart', e => { e.preventDefault(); for (const t of e.changedTouches) { const s = t.target.closest && t.target.closest('.slot'); sl.set(t.identifier, { x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY, n: s ? [...$('slots').children].indexOf(s) + 1 : 0, moved: false }); } }, { passive: false });
    $('slots').addEventListener('touchmove', e => { e.preventDefault(); for (const t of e.changedTouches) { const q = sl.get(t.identifier); if (!q) continue; if (!q.moved && Math.hypot(t.clientX - q.x0, t.clientY - q.y0) >= 12) q.moved = true; if (q.moved && lookId == null) lookBy(t.clientX - q.x, t.clientY - q.y); q.x = t.clientX; q.y = t.clientY; } }, { passive: false });
    const se = e => { e.preventDefault(); for (const t of e.changedTouches) { const q = sl.get(t.identifier); sl.delete(t.identifier); if (q && !q.moved && q.n > 0 && e.type === 'touchend') press('Digit' + q.n); } };
    $('slots').addEventListener('touchend', se, { passive: false }); $('slots').addEventListener('touchcancel', se, { passive: false }); }
  { const bg = $('bag'); if (bg) bg.addEventListener('touchstart', e => { if (e.target === bg && G.state === 'bag') { e.preventDefault(); press('Tab'); } }, { passive: false }); }   // tap beside the backpack: zip it up
  $('prompt').addEventListener('touchstart', e => { if (!$('prompt').classList.contains('tap')) return; e.preventDefault(); press('KeyE'); }, { passive: false });

  // ---- the stick (left) and looking (right) on the open screen
  const ST = { id: null, ox: 0, oy: 0, x: 0, y: 0, m: 0, t0: 0, lastEnd: 0, lastTap: false, lock: false, idleAt: 0 };
  let lookId = null, lx = 0, ly = 0;
  const RAD = 56 * (DEV.phone ? 1 : 1.15);
  G.stick = null;
  function stickEnd() {
    if (ST.id == null) return;
    const dur = performance.now() - ST.t0;
    ST.lastTap = dur < 230 && ST.m < 0.3; ST.lastEnd = performance.now();
    ST.id = null; ST.m = 0; G.stick = null; stickKeys(0, 0, 0);
    stickEl.classList.add('idle'); knob.style.transform = '';
  }
  function stickKeys(x, y, m) {
    const driving = A.driving && A.driving();
    hold('KeyW', 'stick', driving && y > 0.4); hold('KeyS', 'stick', driving && y < -0.45);
    hold('KeyA', 'stick', driving && x < -0.3); hold('KeyD', 'stick', driving && x > 0.3);
    const sprint = m > 0.2 && (ST.lock || m > 0.93) && y > -0.3;
    hold('ShiftLeft', 'stick', sprint);
    stickEl.classList.toggle('run', ST.lock);
  }
  function stickMove(cx, cy) {
    let dx = cx - ST.ox, dy = cy - ST.oy; const L = Math.hypot(dx, dy);
    // the origin follows a thumb that slides past the ring, so it never runs out of stick
    if (L > RAD * 1.35) { const k = (L - RAD * 1.35) / L; ST.ox += dx * k; ST.oy += dy * k; dx = cx - ST.ox; dy = cy - ST.oy; stickEl.style.left = ST.ox + 'px'; stickEl.style.top = ST.oy + 'px'; }
    const L2 = Math.hypot(dx, dy), m = Math.min(1, L2 / RAD), dead = 0.12;
    const nx = L2 ? dx / L2 : 0, ny = L2 ? -dy / L2 : 0, mm = m < dead ? 0 : (m - dead) / (1 - dead);
    ST.x = nx * mm; ST.y = ny * mm; ST.m = Math.min(1, L2 / RAD);
    G.stick = mm > 0 ? { x: ST.x, y: ST.y, m: mm } : null;
    const kx = Math.min(L2, RAD) * nx, ky = -Math.min(L2, RAD) * ny; knob.style.transform = `translate(${kx}px, ${ky}px)`;
    stickKeys(ST.x, ST.y, ST.m);
  }
  zone.addEventListener('touchstart', e => {
    e.preventDefault();
    if (G.state === 'phone') { press('KeyT'); return; }   // tap beside the phone: put it away
    if (G.state === 'bag') { press('Tab'); return; }      // ...or beside the backpack: zip it up
    for (const t of e.changedTouches) {
      const left = t.clientX < innerWidth * 0.42 && t.clientY > innerHeight * 0.22;
      if (left && ST.id == null) {
        const now = performance.now();
        if (ST.lastTap && now - ST.lastEnd < 320) { ST.lock = !ST.lock; A.toast && A.toast(ST.lock ? 'Running — double-tap the stick again to walk' : 'Walking', 'grey'); }
        ST.id = t.identifier; ST.ox = t.clientX; ST.oy = t.clientY; ST.t0 = now; ST.m = 0;
        stickEl.style.left = ST.ox + 'px'; stickEl.style.top = ST.oy + 'px'; stickEl.classList.add('show'); stickEl.classList.remove('idle'); knob.style.transform = '';
      } else if (lookId == null) { lookId = t.identifier; lx = t.clientX; ly = t.clientY; }
    }
  }, { passive: false });
  zone.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === ST.id) stickMove(t.clientX, t.clientY);
      else if (t.identifier === lookId) { const dx = t.clientX - lx, dy = t.clientY - ly; lx = t.clientX; ly = t.clientY; lookBy(dx, dy); }
    }
  }, { passive: false });
  const zEnd = e => { e.preventDefault(); for (const t of e.changedTouches) { if (t.identifier === ST.id) stickEnd(); if (t.identifier === lookId) lookId = null; } };
  zone.addEventListener('touchend', zEnd, { passive: false }); zone.addEventListener('touchcancel', zEnd, { passive: false });
  // (mouse on the zone — a desktop browser with ?touch=1: drag on the right looks, on the left steers)
  zone.addEventListener('mousedown', e => {
    if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;
    const left = e.clientX < innerWidth * 0.42; let px = e.clientX, py = e.clientY;
    if (left) { ST.id = 'm'; ST.ox = px; ST.oy = py; ST.t0 = performance.now(); stickEl.style.left = px + 'px'; stickEl.style.top = py + 'px'; stickEl.classList.add('show'); stickEl.classList.remove('idle'); }
    const mv = ev => { if (left) stickMove(ev.clientX, ev.clientY); else { A.look((ev.clientX - px) * lookK(), (ev.clientY - py) * lookK()); px = ev.clientX; py = ev.clientY; } };
    const up = () => { if (left) stickEnd(); removeEventListener('mousemove', mv); removeEventListener('mouseup', up); };
    addEventListener('mousemove', mv); addEventListener('mouseup', up);
  });

  // ---- no page scroll / pinch / double-tap zoom / long-press menus anywhere in the game
  document.addEventListener('gesturestart', e => e.preventDefault(), { passive: false });
  document.addEventListener('gesturechange', e => e.preventDefault(), { passive: false });
  document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
  document.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('selectstart', e => { if (!(e.target && e.target.closest && e.target.closest('input,textarea'))) e.preventDefault(); });
  document.addEventListener('touchmove', e => { if (e.touches.length > 1 || !(e.target && e.target.closest && e.target.closest('.center-panel, #bagBody, #phoneScreen, .pchat, #slotList, #whoList, .bagwrap, #howto, #result, #note .paper, .pcall, .zst-screen, #who .setupGrid > div'))) e.preventDefault(); }, { passive: false });
  { let lastT = 0; document.addEventListener('touchend', e => { const now = performance.now(); if (now - lastT < 320 && !(e.target && e.target.closest && e.target.closest('input,select,textarea'))) e.preventDefault(); lastT = now; }, { passive: false }); }
  addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });
  addEventListener('orientationchange', () => { releaseAll(); setTimeout(() => dispatchEvent(new Event('resize')), 350); });

  // ---- words on the menus and screens
  const setText = (sel, html) => { const e = document.querySelector(sel); if (e) e.innerHTML = html; };
  setText('#title .hint', '<span style="white-space:nowrap">Left thumb: move</span><br><span style="white-space:nowrap">Right thumb: look</span><br><span style="white-space:nowrap">Buttons: attack, bag, jump, use</span><br><span style="white-space:nowrap">Top right: view, phone, pause</span>');
  setText('#intro .skip', 'TAP TO CONTINUE');
  setText('#tv .skip', 'TAP TO SKIP');
  setText('#note .close', 'TAP TO PUT IT DOWN');
  setText('#struggle .s', 'TAP <b>MASH</b> TO BREAK FREE');
  { const bc = $('bagClose'); if (bc) bc.innerHTML = 'Zip it up'; }
  setText('#pause .keys', 'Left side: move (push far to run, double-tap to keep running) · right side: drag to look<br>Attack · Aim (hold) · Use · Jump · Shove · Crouch · Reload · Heal · Throw · Light<br>Tap the weapon slots to switch · bag: right side, over attack · top right: view, phone, pause');
  { const l = $('vsens') && $('vsens').closest('label'); if (l && l.firstChild && l.firstChild.nodeType === 3) l.firstChild.textContent = 'Look speed '; }
  { const l = $('vinv') && $('vinv').closest('label'); if (l && l.firstChild && l.firstChild.nodeType === 3) l.firstChild.textContent = 'Invert look Y '; }
  { const h = document.querySelector('#howto .cols'); if (h && !$('tcHow')) { const d = document.createElement('div'); d.id = 'tcHow'; d.innerHTML = '<b>ON A TOUCH SCREEN</b><br>Left thumb anywhere on the left: <b>move</b> — push it all the way to <b>run</b>, double-tap to keep running.<br>Drag on the right: <b>look</b>. The dot in the middle is your aim.<br><b>Attack</b> (big button) · <b>Aim</b> hold (zoom without a gun) · <b>Use</b> (search, doors — or tap the label) · <b>Jump</b> · <b>Shove</b> · <b>Crouch</b> · <b>Reload</b> · <b>Heal</b> · <b>Throw</b> · <b>Light</b><br><b>Backpack</b>: right side, over the attack button. Top right: first/third person, <b>phone</b>, pause. Tap the weapon slots to switch weapons.<br>In a car: the stick steers, <b>GAS</b> / <b>BRAKE</b>, <b>EXIT</b>. Grabbed: hammer <b>MASH</b>.'; h.parentNode.insertBefore(d, h); } }

  // ---- what's on screen, every frame
  let uiT = 0, lastMode = '';
  const show = (id, on) => B[id].el.classList.toggle('off', !on);
  function tick(dt) {
    // the crosshair is the middle of the screen
    G.mouse.x = innerWidth / 2; G.mouse.y = innerHeight / 2; G.mouse.inside = true;
    const st = G.state, alive = A.alive();
    document.body.classList.toggle('tcBag', st === 'bag');
    { const bo = +($('big').style.opacity || 0) > 0.05; if (bo !== tick.big) { tick.big = bo; document.body.classList.toggle('tcBig', bo); } }
    const driving = A.driving && A.driving(), grabbed = !!G.grabbedBy, inv = G.inv || {};
    const mode = st === 'phone' ? 'phone' : st === 'dead' || (st === 'play' && !alive) ? 'dead' : st !== 'play' ? 'off' : grabbed ? 'grab' : driving ? 'drive' : 'foot';
    document.body.classList.toggle('tcOn', mode !== 'off');
    if (mode !== lastMode) { if (lastMode) releaseAll(); lastMode = mode; uiT = 0; document.body.classList.toggle('tcDrive', mode === 'drive'); }
    if (mode === 'off') { mash.classList.remove('show'); return; }
    uiT -= dt; if (uiT > 0) return; uiT = 0.1;
    mash.classList.toggle('show', grabbed);
    const foot = mode === 'foot';
    stickEl.style.visibility = foot || mode === 'drive' ? '' : 'hidden';
    for (const id of ['attack', 'aim', 'use', 'jump', 'shove', 'crouch']) show(id, foot);
    const gun = A.gun();
    show('reload', foot && !!gun);
    const band = (inv.bandage || 0) + (inv.medkit || 0);
    show('heal', foot && band > 0 && (G.bleed > 0 || A.hp() < 100));
    show('bottle', foot && (inv.bottle || 0) > 0); show('molotov', foot && (inv.molotov || 0) > 0);
    show('light', foot && (inv.flashlight || 0) > 0); show('lantern', foot && (inv.lantern || 0) > 0);
    for (const id of ['gas', 'brake', 'hbrake', 'exit']) show(id, mode === 'drive');
    show('view', foot || mode === 'drive'); show('bag', foot); show('phone', foot || mode === 'phone'); show('pause', mode !== 'phone');
    for (const id of ['attack', 'aim', 'use', 'jump', 'shove', 'crouch', 'reload', 'heal', 'bottle', 'molotov', 'light', 'lantern']) if (mode === 'grab') show(id, false);
    // state on the buttons
    B.crouch.el.classList.toggle('on', !!G.crouch);
    B.light.el.classList.toggle('on', !!G.flashlight);
    B.lantern.el.classList.toggle('on', !!(A.lanternOn && A.lanternOn()));
    const badge = (b, n) => { b.badge.style.display = n > 0 ? '' : 'none'; b.badge.textContent = n; };
    badge(B.bottle, inv.bottle || 0); badge(B.molotov, inv.molotov || 0); badge(B.heal, band);
    // the attack button wears your weapon (and your ammo)
    const wi = A.weaponIcon(); if (B.attack.wi !== wi) { B.attack.wi = wi; B.attack.el.firstElementChild.outerHTML = icon(wi); }
    const am = A.ammo(); B.attack.emEl.textContent = am || '';
    B.aim.emEl.textContent = gun ? 'aim' : 'zoom';
    if (mode === 'drive') B.hbrake.emEl.textContent = A.bike && A.bike() ? 'jump' : 'drift';
    // what "Use" would do right now
    const c = G.ctx;
    B.use.el.classList.toggle('hot', !!c);
    $('prompt').classList.toggle('tap', !!c);
    // the stick ring rests where your thumb last was (or a sensible spot)
    if (ST.id == null) { if (!stickEl.classList.contains('show')) { stickEl.style.left = (Math.max(110, innerWidth * 0.14)) + 'px'; stickEl.style.top = (innerHeight - Math.max(100, innerHeight * 0.26)) + 'px'; stickEl.classList.add('show', 'idle'); } }
    if (ST.lock && ST.id == null && performance.now() - ST.lastEnd > 4000) { ST.lock = false; stickEl.classList.remove('run'); }
    // keep the objective box under the vitals
    const vh = $('vitals').getBoundingClientRect().height; if (vh && Math.abs((tick.vh || 0) - vh) > 2) { tick.vh = vh; document.body.style.setProperty('--vitH', Math.round(vh + 8) + 'px'); }
    // ...and the toasts (and the tips while driving) under the objective box
    { const ob = $('obj').getBoundingClientRect(), b = ob.height ? Math.round(ob.bottom) : 0; if (b && Math.abs((tick.ob || 0) - b) > 2) { tick.ob = b; document.body.style.setProperty('--objB', b + 'px'); } }
    fitRing();
  }
  // keep the ring's buttons clear of the weapon slots (short screens): any button that would sit under them slides down
  let ringKey = '';
  function fitRing() {
    const sr = $('slots').getBoundingClientRect(), vis = Object.keys(B).filter(id => B[id].at && !B[id].el.classList.contains('off'));
    const key = innerWidth + 'x' + innerHeight + ':' + Math.round(sr.bottom) + ':' + Math.round(sr.left) + ':' + vis.join(',');
    if (key === ringKey) return; ringKey = key;
    for (const id of vis) {
      const b = B[id], el = b.el; el.style.marginTop = '';
      if (!sr.width) continue;
      const r = el.getBoundingClientRect();
      if (r.right > sr.left && r.left < sr.right && r.top < sr.bottom + 4 && r.bottom > sr.top) el.style.marginTop = `calc(var(--s, 56px) / -2 + ${Math.ceil(sr.bottom + 4 - r.top)}px)`;
    }
    // phones: the "Use" prompt sits just left of whichever ring buttons are showing at its height (it's CSS-zoomed: divide by it)
    if (DEV.phone) {
      const pe = $('prompt'), y0 = innerHeight * 0.36, y1 = innerHeight * 0.8; let L = innerWidth * 0.6;
      for (const id of vis) { const r = B[id].el.getBoundingClientRect(); if (r.width && r.bottom > y0 && r.top < y1) L = Math.min(L, r.left); }
      const z = parseFloat(getComputedStyle(pe).zoom) || 1, w = Math.max(200, Math.min(innerWidth * 0.46, L - 16));
      pe.style.setProperty('right', ((innerWidth - L + 8) / z) + 'px', 'important'); pe.style.setProperty('max-width', (w / z) + 'px', 'important');
    }
  }
  // test hooks
  window.ZA_TOUCH = { B, stick: (x, y) => { G.stick = x || y ? { x, y, m: Math.min(1, Math.hypot(x, y)) } : null; stickKeys(x, y, Math.hypot(x, y)); }, look: (dx, dy) => A.look(dx, dy), tap: id => { const b = B[id]; if (b.down) { b.down(); setTimeout(() => b.up && b.up(), 80); } else b.tap(); }, hold: (id, on) => { const b = B[id]; on ? b.down() : b.up(); }, held, releaseAll };
  return { tick, releaseAll };
}

;(() => { const st = document.createElement('style'); st.textContent = 'body.touch.phone #obj .ch, body.touch.phone .st, body.touch.phone #clock .d { font-size: 13px !important; } body.touch.phone #tut .th, body.touch.phone #tut button { font-size: 13px !important; } body.touch.phone #tut button { min-height: 40px; }'; document.head.appendChild(st); })();

;(() => {   // phones: the tutorial box sits between the objective and the buttons, never over a button
  const st = document.createElement('style');
  st.textContent = 'body.touch.phone #tut .tb, body.touch.phone #tut p { font-size: 12.5px !important; line-height: 1.3 !important; }';
  document.head.appendChild(st);
})();
;(() => {   // phones: fit the tutorial box into the free gap between the objective (left), the clock (top) and the buttons (right)
  const fit = () => {
    const tut = document.getElementById('tut'); if (!tut || !document.body.classList.contains('phone') || !document.body.classList.contains('touch')) return;
    if (!tut.getBoundingClientRect().width || getComputedStyle(tut).display === 'none' || +getComputedStyle(tut).opacity === 0) { document.body.classList.remove('tutCover'); return; }
    const R = id => { const e = document.getElementById(id); const r = e && e.getBoundingClientRect(); return r && r.width && getComputedStyle(e).display !== 'none' ? r : null; };
    document.body.classList.remove('tutCover');
    const obj = R('obj'), vit = R('vitals');
    let left = 8; for (const r of [obj, vit]) if (r) left = Math.max(left, r.right + 8);
    let right = innerWidth - 8; let top = 44;
    for (const b of document.querySelectorAll('#tc .tb, #slots .slot')) { if (getComputedStyle(b).display === 'none') continue; const r = b.getBoundingClientRect(); if (!r.width) continue; if (r.top < innerHeight * 0.62) right = Math.min(right, r.left - 8); }
    if (right - left < 240) {   // small phone: no room beside the objective — the tutorial takes the objective's place while it's up
      document.body.classList.add('tutCover'); left = 8; if (vit) top = Math.max(top, vit.bottom + 6);
    } else { const clk = R('clock'); if (clk && clk.right > left && clk.left < right) top = Math.max(top, clk.bottom + 4); }
    const w = Math.min(340, right - left);
    let maxH = innerHeight - top - 12;
    for (const b of document.querySelectorAll('#tc .tb')) { if (getComputedStyle(b).display === 'none') continue; const r = b.getBoundingClientRect(); if (r.width && r.left < left + w && r.right > left) maxH = Math.min(maxH, r.top - top - 8); }
    for (const [k, v] of Object.entries({ left: left + 'px', width: w + 'px', top: top + 'px', 'max-height': Math.max(90, maxH) + 'px', right: 'auto', transform: 'none', bottom: 'auto', zoom: '1' })) tut.style.setProperty(k, v, 'important');
  };
  setInterval(fit, 400); addEventListener('resize', fit);
  const st = document.createElement('style'); st.textContent = 'body.touch.phone #tut { overflow: auto !important; } body.tutCover #obj { visibility: hidden !important; } body.touch.phone #tut { pointer-events: none !important; } body.touch.phone #tut button, body.touch.phone #tut a { pointer-events: auto !important; } body.touch.phone #tut .th { font-size: 11px !important; letter-spacing: .14em !important; } body.touch.phone #tutTitle { font-size: 21px !important; line-height: 1.1 !important; } body.touch.phone #tutText { font-size: 12.5px !important; line-height: 1.3 !important; }'; document.head.appendChild(st);
})();
