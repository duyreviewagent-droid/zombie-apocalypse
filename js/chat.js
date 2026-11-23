// chat.js — the online text chat box (bottom-left). Self-contained: it injects its own DOM + CSS on initChat().
// Enter opens the input (game keys stop while typing — main.js checks isTyping()), Enter sends, Escape cancels.
// Messages are name-coloured with a timestamp; system lines (joined / left / host changed) are grey italics.
// The last 50 lines are kept and the log scrolls. When idle the box fades away; a new message wakes it for a while.
// When a nearby player talks, a speech bubble shows over their head: either the game draws it (ctx.onBubble)
// or chat.js draws its own DOM label at the screen point ctx.project(id) gives back.
//
// initChat(ctx) — ctx (everything optional except send):
//   send(text)            hand a line to the net module (its 'chat' message)
//   myId()                this player's id (so our own echo isn't bubbled twice)
//   canOpen()             true when Enter may open the chat (eg G.state is 'play' or 'dead')
//   onOpen(), onClose()   eg clear held keys / re-lock the mouse
//   distTo(id)            metres from us to that player (bubbles only within BUBBLE_R); null = not in world
//   project(id)           { x, y } CSS px of that player's head on screen, or null when off-screen / behind
//   onBubble(id, text)    if given, the game draws the bubble itself and chat.js draws none
//   colorOf(id)           a CSS colour for that player's name (else one is picked from the id)
//   bottom                CSS length for the box's bottom edge (default above the vitals panel)

const MAX = 50, IDLE = 9, BUBBLE_T = 6, BUBBLE_R = 28, MAXLEN = 200;
const PALETTE = ['#e8b04a', '#6fc3ff', '#9be07a', '#ff8a7a', '#d49cff', '#7fe0d0'];
let C = null, root, logEl, inp, hintEl, bubbleLayer;
let typing = false, idle = 99, lines = [], sentAt = [];
const bubbles = new Map(); // id -> { el, t }

const esc = s => String(s ?? '');
const hhmm = t => { const d = new Date(t || Date.now()); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
export function colorFor(id) { if (C && C.colorOf) { const c = C.colorOf(id); if (c) return c; } let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; }

const CSS = `
#zcChat { position: fixed; left: 22px; bottom: var(--zc-bottom, 178px); z-index: 30; width: min(360px, calc(100vw - 44px)); font: 500 13px/1.35 Oswald, 'Helvetica Neue', Arial, sans-serif; color: #e9e4d8; pointer-events: none; display: flex; flex-direction: column; gap: 5px; transition: opacity .6s; }
#zcChat.hidden { display: none; }
#zcChat .log { max-height: min(210px, max(44px, calc(100vh - var(--zc-bottom, 178px) - 240px))); overflow-y: auto; overflow-x: hidden; padding: 6px 9px; background: rgba(8,8,7,.45); border-left: 2px solid rgba(232,176,74,.55); scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.25) transparent; transition: opacity .8s, background .3s; overflow-wrap: anywhere; }
#zcChat .log:empty { display: none; }
#zcChat .ln { padding: 1px 0; text-shadow: 0 1px 2px rgba(0,0,0,.9); }
#zcChat .ln .tm { color: #8d877b; font-size: 10px; margin-right: 6px; letter-spacing: .05em; }
#zcChat .ln .nm { font-weight: 700; margin-right: 5px; }
#zcChat .ln.sys { color: #a9a395; font-style: italic; font-weight: 400; }
#zcChat .row { display: none; align-items: center; gap: 6px; background: rgba(8,8,7,.78); border: 1px solid rgba(232,176,74,.5); padding: 4px 8px; }
#zcChat .row span { font-size: 10px; letter-spacing: .2em; color: #e8b04a; text-transform: uppercase; flex: none; }
#zcChat input { flex: 1; min-width: 0; background: transparent; border: 0; outline: 0; color: #fff; font: inherit; font-size: 14px; padding: 3px 0; }
#zcChat .hint { font-size: 9px; letter-spacing: .25em; text-transform: uppercase; color: rgba(233,228,216,.45); transition: opacity .8s; text-shadow: 0 1px 2px #000; }
#zcChat.open { pointer-events: auto; }
#zcChat.open .row { display: flex; }
#zcChat.open .hint { display: none; }
#zcChat.open .log { background: rgba(8,8,7,.7); opacity: 1 !important; }
#zcChat.idle .log { opacity: 0; }
#zcChat.idle .hint { opacity: .55; }
#zcBubbles { position: fixed; inset: 0; pointer-events: none; z-index: 12; overflow: hidden; }
#zcBubbles .bb { position: absolute; transform: translate(-50%, -100%); max-width: min(240px, 60vw); padding: 5px 9px; background: rgba(250,247,240,.93); color: #1b1a17; font: 500 13px/1.3 Oswald, Arial, sans-serif; border-radius: 9px; box-shadow: 0 3px 10px rgba(0,0,0,.45); white-space: pre-wrap; overflow-wrap: anywhere; transition: opacity .3s; }
#zcBubbles .bb::after { content: ''; position: absolute; left: 50%; bottom: -6px; margin-left: -6px; border: 6px solid transparent; border-bottom: 0; border-top-color: rgba(250,247,240,.93); }
`;

export function initChat(ctx) {
  C = ctx || {};
  if (root) return api;
  const st = document.createElement('style'); st.id = 'zcChatCss'; st.textContent = CSS; document.head.appendChild(st);
  root = document.createElement('div'); root.id = 'zcChat'; root.className = 'idle';
  if (C.bottom) root.style.setProperty('--zc-bottom', C.bottom);
  root.innerHTML = `<div class="log"></div><div class="row"><span>Say</span><input maxlength="${MAXLEN}" autocomplete="off" spellcheck="false" placeholder="Type a message — Enter to send, Esc to cancel"></div><div class="hint">Enter to chat</div>`;
  document.body.appendChild(root);
  bubbleLayer = document.createElement('div'); bubbleLayer.id = 'zcBubbles'; document.body.appendChild(bubbleLayer);
  logEl = root.querySelector('.log'); inp = root.querySelector('input'); hintEl = root.querySelector('.hint');
  // keys typed into the box never reach the game's own key handler (which listens on window, bubbling)
  inp.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); const t = inp.value.trim(); if (t) submit(t); close(); }
    else if (e.code === 'Escape') { e.preventDefault(); close(); }
  });
  inp.addEventListener('keyup', e => e.stopPropagation());
  inp.addEventListener('blur', () => { if (typing && !inp.value.trim()) close(); });
  // Enter anywhere opens the chat (capture phase, so main.js never sees this Enter)
  addEventListener('keydown', e => {
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if ((e.code === 'Enter' || e.code === 'NumpadEnter') && !e.repeat && !root.classList.contains('hidden') && (!C.canOpen || C.canOpen())) { e.preventDefault(); e.stopImmediatePropagation(); open(); }
  }, true);
  return api;
}

export function isTyping() { return typing; }
export function open() {
  if (!root || typing) return;
  typing = true; root.classList.add('open'); root.classList.remove('idle'); idle = 0;
  inp.value = ''; setTimeout(() => inp.focus(), 0); logEl.scrollTop = logEl.scrollHeight;
  C.onOpen && C.onOpen();
}
export function close() {
  if (!root || !typing) return;
  typing = false; root.classList.remove('open'); inp.value = ''; inp.blur(); idle = 0;
  C.onClose && C.onClose();
}
// show/hide the whole box (eg hide on the title screen / single-player)
export function setVisible(on) { if (!root) return; if (!on) close(); root.classList.toggle('hidden', !on); if (!on) clearBubbles(); }

function submit(text) {
  const now = performance.now(); sentAt = sentAt.filter(t => now - t < 5000);
  if (sentAt.length >= 5) { system('Slow down — wait a moment before sending more.'); return; }
  sentAt.push(now);
  text = text.slice(0, MAXLEN);
  C.send && C.send(text);
}

// a chat line arrived from the server: { t:'chat', from, name, text, ts } — pass the whole message.
// from = 0 is a system line. The server echoes our own lines back to us, so sending adds nothing locally.
export function receive(m) {
  if (!root || !m || !m.text) return;
  const text = esc(m.text).slice(0, MAXLEN), ts = typeof m.ts === 'number' ? m.ts : Date.now();
  if (m.from === 0 || m.from === '0' || m.sys) { add({ sys: true, text, t: ts }); return; }
  add({ name: esc(m.name || 'Player'), color: colorFor(m.from), text, t: ts });
  const me = C.myId ? C.myId() : null;
  if (m.from == null || m.from === me) return;
  const d = C.distTo ? C.distTo(m.from) : null;
  if (d == null || d > BUBBLE_R) return;
  if (C.onBubble) C.onBubble(m.from, text); else bubble(m.from, text);
}
// grey italic system line: 'Sam joined', 'Sam left', 'You are now the host'…
export function system(text) { if (root) add({ sys: true, text: esc(text), t: Date.now() }); }

function add(l) {
  lines.push(l); if (lines.length > MAX) { lines.shift(); logEl.firstChild && logEl.removeChild(logEl.firstChild); }
  const atBottom = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 30;
  const d = document.createElement('div'); d.className = 'ln' + (l.sys ? ' sys' : '');
  const tm = document.createElement('span'); tm.className = 'tm'; tm.textContent = hhmm(l.t); d.appendChild(tm);
  if (!l.sys) { const nm = document.createElement('span'); nm.className = 'nm'; nm.style.color = l.color; nm.textContent = l.name + ':'; d.appendChild(nm); }
  d.appendChild(document.createTextNode(l.text));
  logEl.appendChild(d);
  if (atBottom || !typing) logEl.scrollTop = logEl.scrollHeight;
  idle = 0; root.classList.remove('idle');
}
export function history() { return lines.slice(); }
export function clear() { lines = []; if (logEl) logEl.textContent = ''; clearBubbles(); close(); }

// ---------------------------------------------------------------- speech bubbles (own DOM version)
export function bubble(id, text) {
  if (!bubbleLayer) return;
  let b = bubbles.get(id);
  if (!b) { b = { el: document.createElement('div'), t: 0 }; b.el.className = 'bb'; bubbleLayer.appendChild(b.el); bubbles.set(id, b); }
  b.el.textContent = text.length > 120 ? text.slice(0, 117) + '…' : text; b.t = BUBBLE_T; b.el.style.opacity = 0;
}
function clearBubbles() { for (const b of bubbles.values()) b.el.remove(); bubbles.clear(); }
export function dropPlayer(id) { const b = bubbles.get(id); if (b) { b.el.remove(); bubbles.delete(id); } }

// call every frame (dt in seconds): fades the idle box and moves the bubbles with their speakers
export function update(dt) {
  if (!root) return;
  if (!typing) { idle += dt; if (idle > IDLE && !root.classList.contains('idle')) root.classList.add('idle'); }
  for (const [id, b] of bubbles) {
    b.t -= dt;
    const p = b.t > 0 && C.project ? C.project(id) : null;
    if (b.t <= 0) { b.el.remove(); bubbles.delete(id); continue; }
    if (!p) { b.el.style.opacity = 0; continue; }
    const W = innerWidth, H = innerHeight, x = Math.max(70, Math.min(W - 70, p.x)), y = Math.max(40, Math.min(H - 10, p.y - 18));
    b.el.style.left = x + 'px'; b.el.style.top = y + 'px';
    b.el.style.opacity = Math.min(1, b.t * 2, (BUBBLE_T - b.t) * 6);
  }
}

const api = { initChat, isTyping, open, close, setVisible, receive, system, history, clear, bubble, dropPlayer, update, colorFor };
export default api;
