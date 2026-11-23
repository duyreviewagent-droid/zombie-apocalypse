// voice.js — proximity voice chat for up to 4 players: a WebRTC mesh (every player linked to every other),
// signalled through the game server, which relays 'rtc' messages to one target player.
// Each friend's voice comes out of a PannerNode (HRTF) at their head, so you hear where they are: full volume
// within 3 m, fading to silent by 40 m, muffled (lowpass) when a wall is in the way. Holding the radio key
// instead sends your voice to everyone at a steady level through a crackly walkie-talkie filter.
// Self-contained: initVoice() injects its own mic button, speaker list and settings panel (DOM + CSS).
//
// initVoice(ctx) — ctx (only send + myId are required):
//   send(to, data)       relay a signalling object to one player (net module's 'rtc' message)
//   myId()               this player's id (string or number; ids only need to be comparable + unique)
//   audio()              SND.raw() -> { ctx } so voices share the game's AudioContext (+ its listener)
//   headPos(id)          { x, y, z } of that player's head in the world, or null when not in the world
//   listenerPos()        { x, y, z, yaw } of the ear (camera); only needed if no game AudioContext exists
//   occluded(id)         0..1 (or bool) how much wall is between us and them — muffles their voice
//   nameOf(id)           display name
//   canKey()             false while typing in chat / in menus, so B / N don't trigger
//   onUI(open)           settings panel opened (true) / closed (false) — eg release / re-lock the mouse
//   toast(text)          show a short message in the game's toast area
//   iceServers           RTCPeerConnection ICE servers (default: a public STUN server)
//   bottom               CSS length for the mic button's bottom edge

const LS = 'zapoc.voice';
const NEAR = 3, FAR = 40;            // metres: full volume within NEAR, silent beyond FAR
const SPEAK_ON = 0.018, HOLD = 0.3;  // RMS level that counts as talking, and how long the icon lingers
const RADIO_LEVEL = 0.85;

// ---------------------------------------------------------------- pure logic (unit-tested)
export const falloff = d => d <= NEAR ? 1 : d >= FAR ? 0 : Math.pow(1 - (d - NEAR) / (FAR - NEAR), 1.6);
export const muffle = o => { o = Math.max(0, Math.min(1, +o || 0)); return { freq: 20000 * Math.pow(650 / 20000, o), gain: 1 - 0.4 * o }; };
export const isInitiator = (me, other) => String(me) < String(other); // the lower id always makes the offer (no glare)
export function radioCurve(n = 1024, k = 28) { const c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i * 2 / (n - 1) - 1; c[i] = (1 + k) * x / (1 + k * Math.abs(x)) * 0.7; } return c; }
export const keyLabel = code => !code ? '—' : code.startsWith('Key') ? code.slice(3) : code.startsWith('Digit') ? code.slice(5) : code === 'CapsLock' ? 'Caps Lock' : code.replace(/(Left|Right)$/, ' $1').trim();

// ---------------------------------------------------------------- state
let C = {};
const S = { mode: 'open', pttKey: 'KeyB', radioKey: 'KeyN', muted: false, vol: 1, device: '', peerVol: {}, peerMute: {}, auto: false };
try { Object.assign(S, JSON.parse(localStorage.getItem(LS) || '{}')); } catch { }
const saveS = () => { try { localStorage.setItem(LS, JSON.stringify(S)); } catch { } };

let ac = null, own = false, bus = null, noiseBuf = null, curve = null;
let mic = null, sendTrack = null, micAn = null, micBuf = null, level = 0, meHold = 0, micErr = '';
let pttDown = false, radioDown = false, sending = false, radioSent = false, binding = null;
const peers = new Map(); // id -> peer (see makePeer)
let ui = null;

function audio() {
  const g = C.audio && C.audio();
  if (g && g.ctx && g.ctx !== ac) { if (ac && own) { /* game context appeared later: move to it */ rebuildAudio(g.ctx, false); } else if (!ac) rebuildAudio(g.ctx, false); }
  if (!ac) { try { rebuildAudio(new (window.AudioContext || window.webkitAudioContext)(), true); } catch { return null; } }
  return ac;
}
function rebuildAudio(ctx, isOwn) {
  const old = ac; ac = ctx; own = isOwn;
  const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(ac.destination);
  bus = ac.createGain(); bus.gain.value = S.vol; bus.connect(comp);
  noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  curve = radioCurve();
  micAn = null; if (mic) hookMic();
  for (const p of peers.values()) { p.g = null; if (p.stream) buildGraph(p); }
  if (old && old !== ac && own === false) { /* our own fallback context is no longer needed */ try { old.close(); } catch { } }
}

// ---------------------------------------------------------------- init + UI
const CSS = `
#zvHud { position: fixed; right: 22px; bottom: var(--zv-bottom, 236px); z-index: 30; display: flex; flex-direction: column; align-items: flex-end; gap: 5px; font: 500 12px/1.2 Oswald, 'Helvetica Neue', Arial, sans-serif; color: #e9e4d8; pointer-events: none; }
#zvHud.hidden { display: none; }
#zvHud .mic { pointer-events: auto; display: flex; align-items: center; gap: 8px; padding: 6px 10px 6px 8px; background: rgba(8,8,7,.62); border-right: 2px solid #6f6a62; cursor: pointer; user-select: none; }
#zvHud .mic:hover { background: rgba(8,8,7,.85); }
#zvHud .mic svg { width: 18px; height: 18px; flex: none; }
#zvHud .mic .lbl { font-size: 10px; letter-spacing: .18em; text-transform: uppercase; color: #bdb7aa; white-space: nowrap; }
#zvHud .mic .lv { width: 4px; height: 18px; background: rgba(255,255,255,.12); position: relative; }
#zvHud .mic .lv i { position: absolute; left: 0; right: 0; bottom: 0; height: 0; background: #9be07a; }
#zvHud.live .mic { border-right-color: #9be07a; } #zvHud.live .mic svg { color: #9be07a; }
#zvHud.radio .mic { border-right-color: #e8b04a; } #zvHud.radio .mic svg { color: #e8b04a; }
#zvHud.muted .mic svg { color: #ff8a7a; }
#zvHud .who { display: flex; align-items: center; gap: 6px; padding: 3px 9px; background: rgba(8,8,7,.55); text-shadow: 0 1px 2px #000; }
#zvHud .who svg { width: 12px; height: 12px; color: #9be07a; } #zvHud .who.r svg { color: #e8b04a; }
#zvPanel { position: fixed; inset: 0; z-index: 60; display: none; align-items: center; justify-content: center; background: rgba(0,0,0,.55); font: 400 14px/1.4 Oswald, 'Helvetica Neue', Arial, sans-serif; color: #e9e4d8; }
#zvPanel.show { display: flex; }
#zvPanel .box { width: min(440px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow-y: auto; background: #12110f; border: 1px solid #3a362f; border-left: 3px solid #e8b04a; padding: 18px 20px; box-shadow: 0 20px 60px rgba(0,0,0,.7); }
#zvPanel h3 { margin: 0 0 12px; font: 400 26px 'Bebas Neue', Oswald, sans-serif; letter-spacing: .08em; }
#zvPanel h4 { margin: 16px 0 6px; font-size: 10px; letter-spacing: .25em; text-transform: uppercase; color: #8d877b; font-weight: 500; }
#zvPanel .r { display: flex; align-items: center; gap: 10px; margin: 7px 0; flex-wrap: wrap; }
#zvPanel .r > span:first-child { flex: 1; min-width: 120px; }
#zvPanel button { font: 500 12px Oswald, sans-serif; letter-spacing: .12em; text-transform: uppercase; color: #e9e4d8; background: #24221e; border: 1px solid #4a453c; padding: 6px 12px; cursor: pointer; }
#zvPanel button:hover { background: #33302a; } #zvPanel button.on { background: #e8b04a; color: #14130f; border-color: #e8b04a; }
#zvPanel select, #zvPanel input[type=range] { background: #24221e; color: #e9e4d8; border: 1px solid #4a453c; font: inherit; max-width: 100%; }
#zvPanel select { padding: 4px; min-width: 0; flex: 1; }
#zvPanel input[type=range] { flex: 1; min-width: 100px; accent-color: #e8b04a; }
#zvPanel .meter { flex: 1; height: 8px; background: #24221e; position: relative; min-width: 100px; } #zvPanel .meter i { position: absolute; left: 0; top: 0; bottom: 0; width: 0; background: #9be07a; }
#zvPanel .err { color: #ff8a7a; font-size: 13px; margin: 6px 0; } #zvPanel .note { color: #8d877b; font-size: 12px; }
#zvPanel .key { min-width: 86px; }
#zvPanel .pl { display: flex; align-items: center; gap: 8px; margin: 6px 0; } #zvPanel .pl b { width: 110px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#zvPanel .pl .spk { width: 8px; height: 8px; border-radius: 50%; background: #3a362f; flex: none; } #zvPanel .pl .spk.on { background: #9be07a; }
#zvPanel .close { margin-top: 16px; width: 100%; }
`;
const ICON_MIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4"/></svg>';
const ICON_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4M3 3l18 18"/></svg>';
const ICON_RADIO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="6" y="7" width="12" height="15" rx="2"/><path d="M9 7V2M9 12h6M9 16h6"/></svg>';
export const speakerIcon = ICON_MIC; // name tags may reuse this SVG

export function initVoice(ctx) {
  C = ctx || {};
  if (ui) return api;
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const hud = document.createElement('div'); hud.id = 'zvHud'; hud.className = 'hidden';
  if (C.bottom) hud.style.setProperty('--zv-bottom', C.bottom);
  hud.innerHTML = `<div class="list"></div><div class="mic" title="Voice chat settings"><span class="lv"><i></i></span><span class="ic">${ICON_OFF}</span><span class="lbl">Voice off</span></div>`;
  document.body.appendChild(hud);
  const pan = document.createElement('div'); pan.id = 'zvPanel';
  pan.innerHTML = `<div class="box"><h3>Voice chat</h3>
  <div class="r"><span>Microphone</span><button data-a="mic">Enable microphone</button></div>
  <div class="err"></div>
  <div class="r"><span>Input device</span><select data-a="dev"><option value="">Default</option></select></div>
  <div class="r"><span>Input level</span><span class="meter"><i></i></span></div>
  <div class="r"><span>Mute my mic</span><button data-a="mute">Off</button></div>
  <h4>Talking</h4>
  <div class="r"><span>Mode</span><button data-a="open">Open mic</button><button data-a="ptt">Push to talk</button></div>
  <div class="r"><span>Push-to-talk key (hold)</span><button class="key" data-a="kptt"></button></div>
  <div class="r"><span>Radio key (hold — everyone hears you, anywhere)</span><button class="key" data-a="kradio"></button></div>
  <div class="note">Normal talk is heard by players near you, from where you stand. Walls muffle it. The radio reaches the whole team.</div>
  <h4>Volume</h4>
  <div class="r"><span>Voices</span><input type="range" min="0" max="2" step="0.05" data-a="vol"></div>
  <div class="players"></div>
  <button class="close" data-a="close">Done</button></div>`;
  document.body.appendChild(pan);
  ui = { hud, pan, list: hud.querySelector('.list'), ic: hud.querySelector('.ic'), lbl: hud.querySelector('.lbl'), lv: hud.querySelector('.lv i'), meter: pan.querySelector('.meter i'), err: pan.querySelector('.err'), players: pan.querySelector('.players'), q: a => pan.querySelector(`[data-a="${a}"]`) };
  hud.querySelector('.mic').onclick = () => openSettings();
  pan.addEventListener('click', e => { if (e.target === pan) closeSettings(); });
  pan.addEventListener('keydown', e => { e.stopPropagation(); if (e.code === 'Escape' && !binding) closeSettings(); });
  ui.q('mic').onclick = () => mic ? disableMic() : enableMic();
  ui.q('mute').onclick = () => setMuted(!S.muted);
  ui.q('open').onclick = () => { S.mode = 'open'; saveS(); syncUI(); };
  ui.q('ptt').onclick = () => { S.mode = 'ptt'; saveS(); syncUI(); };
  ui.q('kptt').onclick = () => { binding = 'pttKey'; syncUI(); };
  ui.q('kradio').onclick = () => { binding = 'radioKey'; syncUI(); };
  ui.q('vol').oninput = e => { S.vol = +e.target.value; if (bus) bus.gain.value = S.vol; saveS(); };
  ui.q('dev').onchange = e => { S.device = e.target.value; saveS(); if (mic) enableMic(); };
  ui.q('close').onclick = () => closeSettings();
  addEventListener('keydown', onKey, true);
  addEventListener('keyup', onKeyUp, true);
  addEventListener('blur', () => { pttDown = radioDown = false; });
  syncUI();
  return api;
}

function onKey(e) {
  if (binding) { // rebinding a hold key: the next key pressed becomes it (Escape cancels)
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.code !== 'Escape') { const other = binding === 'pttKey' ? 'radioKey' : 'pttKey'; if (S[other] === e.code) S[other] = S[binding]; S[binding] = e.code; saveS(); }
    binding = null; syncUI(); return;
  }
  if (e.metaKey || e.repeat || (C.canKey && !C.canKey())) return;
  // Caps Lock on a Mac only reports a toggle (down when it locks, up when it unlocks), so it acts as a latch
  if (e.code === S.pttKey) { pttDown = e.code === 'CapsLock' ? e.getModifierState('CapsLock') : true; }
  if (e.code === S.radioKey) { radioDown = e.code === 'CapsLock' ? e.getModifierState('CapsLock') : true; if (!mic && !micErr) note('Turn on your microphone in voice settings to use the radio'); }
}
function onKeyUp(e) {
  if (e.code === S.pttKey) pttDown = e.code === 'CapsLock' ? e.getModifierState('CapsLock') : false;
  if (e.code === S.radioKey) radioDown = e.code === 'CapsLock' ? e.getModifierState('CapsLock') : false;
}
let noted = 0;
function note(t) { const n = performance.now(); if (n - noted < 4000) return; noted = n; C.toast ? C.toast(t) : null; }

export function openSettings() { if (!ui) return; ui.pan.classList.add('show'); listDevices(); syncUI(); C.onUI && C.onUI(true); }
export function closeSettings() { if (!ui || !ui.pan.classList.contains('show')) return; binding = null; ui.pan.classList.remove('show'); C.onUI && C.onUI(false); }
export const settingsOpen = () => !!ui && ui.pan.classList.contains('show');
// show the mic button only while in an online room
export function setVisible(on) { if (ui) ui.hud.classList.toggle('hidden', !on); if (!on) closeSettings(); }

function syncUI() {
  if (!ui) return;
  const q = ui.q;
  q('mic').textContent = mic ? 'Turn microphone off' : 'Enable microphone'; q('mic').classList.toggle('on', !!mic);
  q('mute').textContent = S.muted ? 'Muted' : 'Off'; q('mute').classList.toggle('on', S.muted);
  q('open').classList.toggle('on', S.mode === 'open'); q('ptt').classList.toggle('on', S.mode === 'ptt');
  q('kptt').textContent = binding === 'pttKey' ? 'Press a key…' : keyLabel(S.pttKey);
  q('kradio').textContent = binding === 'radioKey' ? 'Press a key…' : keyLabel(S.radioKey);
  q('vol').value = S.vol;
  ui.err.textContent = micErr; ui.err.style.display = micErr ? '' : 'none';
  // per-player rows
  const ids = [...peers.keys()];
  if (ui.players.dataset.ids !== ids.join('|')) {
    ui.players.dataset.ids = ids.join('|'); ui.players.innerHTML = '';
    for (const id of ids) {
      const row = document.createElement('div'); row.className = 'pl'; row.dataset.id = id;
      row.innerHTML = `<span class="spk"></span><b></b><input type="range" min="0" max="2" step="0.05"><button>Mute</button>`;
      row.querySelector('b').textContent = nameOf(id);
      const r = row.querySelector('input'), b = row.querySelector('button');
      r.value = S.peerVol[id] ?? 1; r.oninput = () => setPeerVolume(id, +r.value);
      b.onclick = () => setPeerMuted(id, !S.peerMute[id]);
      ui.players.appendChild(row);
    }
  }
  for (const row of ui.players.children) { const id = row.dataset.id, b = row.querySelector('button'); b.classList.toggle('on', !!S.peerMute[id]); b.textContent = S.peerMute[id] ? 'Muted' : 'Mute'; }
}
async function listDevices() {
  try {
    const sel = ui.q('dev'), ds = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput');
    sel.innerHTML = '<option value="">Default</option>' + ds.filter(d => d.deviceId && d.deviceId !== 'default').map((d, i) => `<option value="${d.deviceId.replace(/"/g, '')}">${(d.label || 'Microphone ' + (i + 1)).replace(/</g, '&lt;')}</option>`).join('');
    sel.value = S.device || '';
  } catch { }
}
const nameOf = id => (C.nameOf && C.nameOf(id)) || 'Player ' + id;

// ---------------------------------------------------------------- microphone
export async function enableMic() {
  micErr = '';
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { micErr = window.isSecureContext === false ? 'The microphone needs a secure (https) page.' : 'This browser / app can\'t use a microphone. You can still hear the others.'; syncUI(); return false; }
  try {
    const audioC = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 };
    if (S.device) audioC.deviceId = { exact: S.device };
    let st;
    try { st = await navigator.mediaDevices.getUserMedia({ audio: audioC }); }
    catch (e) { if (S.device && e.name === 'OverconstrainedError') { S.device = ''; delete audioC.deviceId; st = await navigator.mediaDevices.getUserMedia({ audio: audioC }); } else throw e; }
    stopMic();
    mic = st; sendTrack = mic.getAudioTracks()[0].clone(); sendTrack.enabled = false;
    mic.getAudioTracks()[0].onended = () => { disableMic(); micErr = 'The microphone was disconnected.'; syncUI(); };
    const a = audio(); if (a && a.state === 'suspended') a.resume().catch(() => { });
    hookMic();
    for (const p of peers.values()) attachSend(p);
    S.auto = true; saveS(); listDevices();
  } catch (e) {
    micErr = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError') ? 'Microphone permission was refused. Allow it in your browser (or System Settings > Privacy > Microphone) and try again.' : e && e.name === 'NotFoundError' ? 'No microphone was found.' : 'Could not start the microphone' + (e && e.message ? ': ' + e.message : '.');
  }
  syncUI(); return !!mic;
}
function hookMic() { if (!mic || !ac) return; const src = ac.createMediaStreamSource(mic); micAn = ac.createAnalyser(); micAn.fftSize = 512; micBuf = new Float32Array(micAn.fftSize); src.connect(micAn); }
function stopMic() { if (mic) mic.getTracks().forEach(t => t.stop()); if (sendTrack) sendTrack.stop(); mic = sendTrack = micAn = null; level = 0; }
export function disableMic() { stopMic(); for (const p of peers.values()) attachSend(p); S.auto = false; saveS(); syncUI(); }
export function setMuted(m) { S.muted = !!m; saveS(); syncUI(); }
export const isMuted = () => S.muted;
export const toggleMute = () => setMuted(!S.muted);
export const micOn = () => !!mic;
export function setMode(m) { S.mode = m === 'ptt' ? 'ptt' : 'open'; saveS(); syncUI(); }
export function setKeys({ ptt, radio } = {}) { if (ptt) S.pttKey = ptt; if (radio) S.radioKey = radio; saveS(); syncUI(); }
export function setPeerVolume(id, v) { S.peerVol[id] = v; saveS(); const p = peers.get(id); if (p && p.g) p.g.pv.gain.value = S.peerMute[id] ? 0 : v; }
export function setPeerMuted(id, m) { S.peerMute[id] = !!m; saveS(); setPeerVolume(id, S.peerVol[id] ?? 1); syncUI(); }
// call from a user gesture (eg the 'join room' click) to turn the mic back on if it was on last time
export function autoStart() { if (S.auto && !mic) enableMic(); }

// ---------------------------------------------------------------- peers (WebRTC mesh)
function makePeer(id) {
  const p = { id, pc: null, gen: 0, stream: null, el: null, g: null, level: 0, hold: 0, radio: false, ice: [], failT: 0, remoteMuted: false };
  peers.set(id, p); return p;
}
function newPC(p) {
  if (p.pc) try { p.pc.close(); } catch { }
  const pc = p.pc = new RTCPeerConnection({ iceServers: C.iceServers || [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] });
  p.ice = []; p.failT = 0;
  pc.onicecandidate = e => { if (e.candidate && p.pc === pc) C.send(p.id, { k: 'ice', gen: p.gen, c: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate }); };
  pc.ontrack = e => { if (p.pc !== pc) return; p.stream = e.streams && e.streams[0] ? e.streams[0] : new MediaStream([e.track]); buildGraph(p); };
  return pc;
}
async function offer(p) {
  p.gen = Math.floor(Math.random() * 1e9) + 1; const pc = newPC(p);
  const t = pc.addTransceiver('audio', { direction: 'sendrecv' }); p.tx = t; attachSend(p);
  try { await pc.setLocalDescription(await pc.createOffer()); C.send(p.id, { k: 'offer', gen: p.gen, sdp: pc.localDescription.sdp }); } catch (e) { console.warn('voice offer', e); }
}
function attachSend(p) {
  const t = p.tx || (p.pc && p.pc.getTransceivers()[0]); if (!t) return;
  try { t.sender.replaceTrack(sendTrack || null); } catch { }
}
// the room's player list changed: pass every OTHER player's id (max 3)
export function setPeers(ids) {
  const me = C.myId ? C.myId() : null, want = new Set((ids || []).filter(i => i != null && i !== me));
  for (const id of [...peers.keys()]) if (!want.has(id)) peerLeft(id);
  for (const id of want) if (!peers.has(id)) peerJoined(id);
}
export function peerJoined(id) {
  if (peers.has(id) || (C.myId && id === C.myId())) return;
  const p = makePeer(id);
  if (isInitiator(C.myId(), id)) offer(p);
  else C.send(id, { k: 'hello' }); // nudge the initiator in case it set us up before we were listening
  syncUI();
}
export function peerLeft(id) {
  const p = peers.get(id); if (!p) return;
  try { p.pc && p.pc.close(); } catch { }
  dropGraph(p); if (p.el) { p.el.srcObject = null; p.el = null; }
  peers.delete(id); syncUI();
}
// leave the room: hang up everyone (the mic stays on for next time unless stopMic=true)
export function leave(stop = false) { for (const id of [...peers.keys()]) { try { C.send(id, { k: 'bye' }); } catch { } peerLeft(id); } if (stop) stopMic(); radioSent = sending = false; syncUI(); }

// a relayed 'rtc' message from another player
export async function receive(from, d) {
  if (!d || from == null) return;
  let p = peers.get(from);
  if (!p) { if ((d.k === 'offer' && !isInitiator(C.myId(), from)) || d.k === 'hello') p = makePeer(from); else return; syncUI(); }
  try {
    if (d.k === 'hello') { if (isInitiator(C.myId(), from) && (!p.pc || p.pc.connectionState === 'failed' || p.pc.connectionState === 'closed')) offer(p); }
    else if (d.k === 'offer') {
      if (isInitiator(C.myId(), from)) return; // they shouldn't offer to us; ignore (avoids glare)
      if (!p.pc || d.gen !== p.gen) { p.gen = d.gen; newPC(p); }
      const pc = p.pc;
      await pc.setRemoteDescription({ type: 'offer', sdp: d.sdp });
      p.tx = pc.getTransceivers()[0]; if (p.tx) { p.tx.direction = 'sendrecv'; attachSend(p); }
      for (const c of p.ice.splice(0)) await pc.addIceCandidate(c).catch(() => { });
      await pc.setLocalDescription(await pc.createAnswer());
      C.send(from, { k: 'answer', gen: p.gen, sdp: pc.localDescription.sdp });
      C.send(from, { k: 'state', radio: radioSent });
    }
    else if (d.k === 'answer') {
      if (!p.pc || d.gen !== p.gen || p.pc.signalingState !== 'have-local-offer') return;
      await p.pc.setRemoteDescription({ type: 'answer', sdp: d.sdp });
      for (const c of p.ice.splice(0)) await p.pc.addIceCandidate(c).catch(() => { });
      C.send(from, { k: 'state', radio: radioSent });
    }
    else if (d.k === 'ice') {
      if (!p.pc || d.gen !== p.gen) return;
      if (p.pc.remoteDescription) await p.pc.addIceCandidate(d.c).catch(() => { }); else p.ice.push(d.c);
    }
    else if (d.k === 'bye') peerLeft(from);
    else if (d.k === 'state') { const was = p.radio; p.radio = !!d.radio; if (was !== p.radio) squelch(p); }
  } catch (e) { console.warn('voice rtc', d.k, e); }
}

// ---------------------------------------------------------------- receive graph per voice
//  stream -> source -+-> analyser (talking icon)
//                    +-> lowpass (walls) -> distance gain -> HRTF panner ---------------+-> player volume -> voice bus
//                    +-> highpass -> lowpass -> presence peak -> clipper + hiss/crackle -> radio gain -+
function buildGraph(p) {
  const a = audio(); if (!a || !p.stream) return;
  dropGraph(p);
  // Chrome only feeds a remote WebRTC stream into Web Audio while a media element is also playing it (muted)
  if (!p.el) { p.el = document.createElement('audio'); p.el.muted = true; p.el.autoplay = true; }
  p.el.srcObject = p.stream; p.el.play && p.el.play().catch(() => { });
  const g = {};
  g.src = a.createMediaStreamSource(p.stream);
  g.an = a.createAnalyser(); g.an.fftSize = 512; g.buf = new Float32Array(g.an.fftSize); g.src.connect(g.an);
  g.pv = a.createGain(); g.pv.gain.value = S.peerMute[p.id] ? 0 : (S.peerVol[p.id] ?? 1); g.pv.connect(bus);
  // proximity path
  g.lp = a.createBiquadFilter(); g.lp.type = 'lowpass'; g.lp.frequency.value = 20000; g.lp.Q.value = 0.5;
  g.dg = a.createGain(); g.dg.gain.value = 0;
  g.pan = a.createPanner(); g.pan.panningModel = 'HRTF'; g.pan.distanceModel = 'inverse'; g.pan.refDistance = 1; g.pan.rolloffFactor = 0; // we do the falloff ourselves
  g.src.connect(g.lp).connect(g.dg).connect(g.pan).connect(g.pv);
  // radio path
  g.hp = a.createBiquadFilter(); g.hp.type = 'highpass'; g.hp.frequency.value = 420; g.hp.Q.value = 0.9;
  g.rl = a.createBiquadFilter(); g.rl.type = 'lowpass'; g.rl.frequency.value = 2900; g.rl.Q.value = 1.1;
  g.pk = a.createBiquadFilter(); g.pk.type = 'peaking'; g.pk.frequency.value = 1700; g.pk.gain.value = 7; g.pk.Q.value = 1.2;
  g.pre = a.createGain(); g.pre.gain.value = 3.2;
  g.ws = a.createWaveShaper(); g.ws.curve = curve; g.ws.oversample = '2x';
  g.rg = a.createGain(); g.rg.gain.value = 0;
  g.src.connect(g.hp).connect(g.rl).connect(g.pk).connect(g.pre).connect(g.ws).connect(g.rg).connect(g.pv);
  // hiss + crackle under the radio voice (gated by the same radio gain)
  g.noise = a.createBufferSource(); g.noise.buffer = noiseBuf; g.noise.loop = true;
  g.nb = a.createBiquadFilter(); g.nb.type = 'bandpass'; g.nb.frequency.value = 2400; g.nb.Q.value = 0.7;
  g.hiss = a.createGain(); g.hiss.gain.value = 0.035; g.crk = a.createGain(); g.crk.gain.value = 0;
  g.noise.connect(g.nb); g.nb.connect(g.hiss).connect(g.rg); g.nb.connect(g.crk).connect(g.rg);
  g.noise.start();
  p.g = g;
}
function dropGraph(p) {
  const g = p.g; if (!g) return; p.g = null;
  try { g.noise.stop(); } catch { }
  for (const k of ['src', 'an', 'lp', 'dg', 'pan', 'hp', 'rl', 'pk', 'pre', 'ws', 'rg', 'nb', 'hiss', 'crk', 'pv', 'noise']) try { g[k].disconnect(); } catch { }
}
// the short 'kssh' click when a radio key goes down / up
function squelch(p) {
  const a = ac, g = p.g; if (!a || !g || S.peerMute[p.id]) return;
  const t = a.currentTime, s = a.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = 1.3;
  const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = p.radio ? 3000 : 1800; f.Q.value = 0.8;
  const e = a.createGain(); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(0.22, t + 0.008); e.gain.exponentialRampToValueAtTime(0.001, t + (p.radio ? 0.09 : 0.16));
  s.connect(f).connect(e).connect(g.pv); s.start(t, Math.random()); s.stop(t + 0.2);
}

// ---------------------------------------------------------------- per frame
function rms(an, buf) { an.getFloatTimeDomainData(buf); let s = 0; for (let i = 0; i < buf.length; i += 2) s += buf[i] * buf[i]; return Math.sqrt(s / (buf.length / 2)); }
function earPos() {
  if (C.listenerPos) { const l = C.listenerPos(); if (l) return l; }
  const l = ac && ac.listener; if (l && l.positionX) return { x: l.positionX.value, y: l.positionY.value, z: l.positionZ.value };
  return null;
}
// call every frame with dt in seconds (also while paused / dead so voices keep working)
export function update(dt) {
  if (!ui || (!peers.size && !mic)) { if (ui) drawHudIdle(); return; }
  const a = audio(); if (!a) return;
  if (own && C.listenerPos) { const l = C.listenerPos(); if (l) { const L = a.listener, fx = -Math.sin(l.yaw || 0), fz = -Math.cos(l.yaw || 0); if (L.positionX) { L.positionX.value = l.x; L.positionY.value = l.y; L.positionZ.value = l.z; L.forwardX.value = fx; L.forwardY.value = 0; L.forwardZ.value = fz; } else { L.setPosition(l.x, l.y, l.z); L.setOrientation(fx, 0, fz, 0, 1, 0); } } }
  // my mic: level meter, who gets my voice, and the radio flag the others need
  const lv = micAn ? rms(micAn, micBuf) : 0; level = Math.max(lv, level - dt * 0.25);
  const radio = !!mic && !S.muted && radioDown;
  sending = !!mic && !S.muted && (S.mode === 'open' || pttDown || radioDown);
  if (sendTrack && sendTrack.enabled !== sending) sendTrack.enabled = sending;
  if (radio !== radioSent) { radioSent = radio; for (const p of peers.values()) C.send(p.id, { k: 'state', radio }); }
  meHold = sending && lv > SPEAK_ON ? HOLD : Math.max(0, meHold - dt);
  // every friend's voice: where it comes from, how loud, how muffled
  const ear = earPos(), t = a.currentTime;
  for (const p of peers.values()) {
    const g = p.g;
    // a link that dropped, or an offer that never got an answer, is redialled by the initiator
    if (p.pc) { const s = p.pc.connectionState; if (s === 'failed' || s === 'disconnected' || p.pc.signalingState === 'have-local-offer') { p.failT += dt; if (p.failT > 8 && isInitiator(C.myId(), p.id)) offer(p); } else p.failT = 0; }
    if (!g) continue;
    const l = rms(g.an, g.buf); p.level = l; p.hold = l > SPEAK_ON ? HOLD : Math.max(0, p.hold - dt);
    const h = C.headPos ? C.headPos(p.id) : null;
    let gain = 0, mf = muffle(0);
    if (h && ear) {
      const d = Math.hypot(h.x - ear.x, (h.y ?? 1.6) - (ear.y ?? 1.6), h.z - ear.z);
      gain = falloff(d);
      if (gain > 0 && C.occluded) { mf = muffle(C.occluded(p.id)); gain *= mf.gain; }
      if (g.pan.positionX) { g.pan.positionX.setTargetAtTime(h.x, t, 0.03); g.pan.positionY.setTargetAtTime(h.y ?? 1.6, t, 0.03); g.pan.positionZ.setTargetAtTime(h.z, t, 0.03); } else g.pan.setPosition(h.x, h.y ?? 1.6, h.z);
    }
    g.dg.gain.setTargetAtTime(gain, t, 0.08);
    g.lp.frequency.setTargetAtTime(mf.freq, t, 0.1);
    g.rg.gain.setTargetAtTime(p.radio ? RADIO_LEVEL : 0, t, 0.02);
    // random crackle bursts while their radio is keyed
    if (p.radio && Math.random() < dt * 6) { g.crk.gain.cancelScheduledValues(t); g.crk.gain.setValueAtTime(0.25 + Math.random() * 0.35, t); g.crk.gain.exponentialRampToValueAtTime(0.001, t + 0.02 + Math.random() * 0.05); }
  }
  drawHud();
}
let hudKey = '';
function drawHudIdle() { if (ui.lbl.textContent !== 'Voice off' && !mic) { ui.lbl.textContent = 'Voice off'; ui.ic.innerHTML = ICON_OFF; ui.ic.dataset.k = 'off'; ui.list.innerHTML = ''; hudKey = ''; } }
function drawHud() {
  const h = ui.hud, st = !mic ? 'off' : S.muted ? 'muted' : radioSent ? 'radio' : sending ? 'live' : 'idle';
  h.classList.toggle('live', st === 'live'); h.classList.toggle('radio', st === 'radio'); h.classList.toggle('muted', st === 'muted');
  const lbl = st === 'off' ? 'Mic off' : st === 'muted' ? 'Muted' : st === 'radio' ? 'Radio' : st === 'live' ? (S.mode === 'ptt' ? 'Talking' : 'Mic on') : `Hold ${keyLabel(S.pttKey)} to talk`;
  const ic = st === 'radio' ? ICON_RADIO : st === 'off' || st === 'muted' ? ICON_OFF : ICON_MIC;
  if (ui.lbl.textContent !== lbl) ui.lbl.textContent = lbl;
  if (ui.ic.dataset.k !== st) { ui.ic.innerHTML = ic; ui.ic.dataset.k = st; }
  const pc = Math.min(100, level * 600) + '%';
  ui.lv.style.height = sending ? pc : '0%'; ui.meter.style.width = pc;
  // who is talking right now (helps when they're out of sight)
  const talk = [...peers.values()].filter(p => p.hold > 0 && !S.peerMute[p.id]);
  const k = talk.map(p => p.id + (p.radio ? 'r' : '')).join(',');
  if (k !== hudKey) {
    hudKey = k; ui.list.innerHTML = '';
    for (const p of talk) { const d = document.createElement('div'); d.className = 'who' + (p.radio ? ' r' : ''); d.innerHTML = p.radio ? ICON_RADIO : ICON_MIC; d.appendChild(document.createTextNode(nameOf(p.id))); ui.list.appendChild(d); }
  }
  if (ui.pan.classList.contains('show')) for (const row of ui.players.children) { const p = peers.get(row.dataset.id) || peers.get(+row.dataset.id); row.querySelector('.spk').classList.toggle('on', !!p && p.hold > 0); }
}

// ---------------------------------------------------------------- queries for name tags etc.
export function speaking(id) {
  if (id === 'me' || (C.myId && id === C.myId())) return meHold > 0;
  const p = peers.get(id); return !!p && p.hold > 0 && !S.peerMute[id];
}
export function onRadio(id) { if (id === 'me' || (C.myId && id === C.myId())) return radioSent; const p = peers.get(id); return !!p && p.radio; }
export function peerState(id) { const p = peers.get(id); return p ? { connected: !!p.pc && p.pc.connectionState === 'connected', hasAudio: !!p.g, level: p.level, speaking: speaking(id), radio: p.radio, muted: !!S.peerMute[id], volume: S.peerVol[id] ?? 1 } : null; }
export const settings = () => ({ ...S });
export const _debug = () => ({ ac, own, peers, mic, sendTrack, sending, radioSent, level });

const api = { initVoice, update, receive, setPeers, peerJoined, peerLeft, leave, enableMic, disableMic, autoStart, setMuted, toggleMute, isMuted, micOn, setMode, setKeys, setPeerVolume, setPeerMuted, openSettings, closeSettings, settingsOpen, setVisible, speaking, onRadio, peerState, settings, speakerIcon };
export default api;
