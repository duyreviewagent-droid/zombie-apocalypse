// Zombie_Apocalypse — phones and tablets: what we're running on, and how much the game asks of it.
// Desktop gets DEV.mobile === false and PROFILE === null: nothing here changes a thing there.
// Test hooks: ?touch=1 (force the touch controls + mobile profile on a desktop browser), ?touch=0 (force them off),
// ?lowpower=1 (the phone profile on any device), ?nogov=1 (no adaptive governor).
import { C } from './state.js';

const Q = new URLSearchParams(location.search);
const nav = navigator, ua = nav.userAgent || '';
const mtp = nav.maxTouchPoints || 0;
const coarse = (() => { try { return matchMedia('(pointer: coarse)').matches; } catch { return false; } })();
const iPadOS = /Macintosh/.test(ua) && mtp > 1;                 // iPadOS 13+ says it's a Mac
const iOS = /iPhone|iPad|iPod/.test(ua) || iPadOS;
const android = /Android/i.test(ua);
const forced = Q.has('touch') ? Q.get('touch') !== '0' : null;
const touch = forced != null ? forced : (iOS || android || (coarse && mtp > 0));
const sMin = Math.min(screen.width || innerWidth, screen.height || innerHeight);
const phone = touch && (/iPhone|iPod/.test(ua) || (android && /Mobile/.test(ua)) || sMin < 560);
const tablet = touch && !phone;
const mem = nav.deviceMemory || 0;                                 // (Safari doesn't tell)
const lowMem = (mem && mem <= 4) || (/iPhone/.test(ua) && Math.max(screen.width, screen.height) <= 700);   // SE / mini class
const lowPower = Q.has('lowpower') || (touch && (phone || lowMem));

export const DEV = { touch, iOS, iPadOS, android, phone, tablet, lowMem, lowPower, mobile: touch || iOS || Q.has('lowpower') };

// the quality profile. null on desktop (the desktop path in main.js stays exactly as it was).
export const PROFILE = !DEV.mobile ? null : {
  // render resolution (CSS px × this). Phones are 3× screens: 1.5 is plenty under the film grain.
  prStart: 1,
  prCap: Math.min(devicePixelRatio || 1, 1.25),
  prMin: phone ? 0.85 : 1,
  overlayDpr: Math.min(devicePixelRatio || 1, 2),                  // the 2D crosshair / bubbles canvas
  shadow: phone || lowMem ? 1024 : 1024,                            // sun shadow map (desktop: 2048-4096)
  shadowMin: 512,
  softShadows: false,                                               // PCF, not PCFSoft
  msaa: 0,
  bloom: !phone,                                                    // phones: no bloom pass at all
  ao: false,
  zombieScale: phone ? 0.55 : 0.65,                                 // how many of them are about at once
  poolScale: phone ? 0.6 : 0.7,                                     // ...and how many bodies we build up front
  farMin: 160, farK: 2.7,                                           // draw distance follows the fog: far = farK / density
  texMax: phone || lowMem ? 512 : 1024,                             // biggest texture side we upload
  aniso: phone ? 2 : 4,
  texMaxDetail: phone ? 256 : (lowMem ? 512 : 1024),               // normal / roughness / bump maps: fine detail nobody sees on a phone
  shadowEvery: 2,                                                   // re-render the sun's shadow every Nth frame (governor raises it to 3)
};
if (PROFILE) { C.mobile = true; C.lowPower = lowPower; C.profile = PROFILE; }
C.touch = touch;

// ---- shrink textures before they're uploaded (GPU memory is what gets a tab killed on iOS)
const capped = new WeakSet();
function capOne(t, detail = false) {
  if (!t || capped.has(t) || !t.isTexture) return; capped.add(t);
  if (t.anisotropy > PROFILE.aniso) t.anisotropy = PROFILE.aniso;
  if (t.isRenderTargetTexture || t.isDataTexture || t.isCompressedTexture || t.isCubeTexture || t.isVideoTexture || t.isData3DTexture) return;
  const im = t.image; if (!im || !im.width || !im.height) return;
  const max = detail ? Math.min(PROFILE.texMax, PROFILE.texMaxDetail) : PROFILE.texMax, w = im.width, h = im.height;
  if (w <= max && h <= max) return;
  const isCanvas = typeof HTMLCanvasElement !== 'undefined' && im instanceof HTMLCanvasElement;
  const isImg = (typeof HTMLImageElement !== 'undefined' && im instanceof HTMLImageElement) || (typeof ImageBitmap !== 'undefined' && im instanceof ImageBitmap);
  // canvases that get redrawn later (TV screens, scoreboards) are clamp-wrapped: leave those alone; the painted
  // tiling materials repeat — and a clamp-wrapped canvas that's painted once can say so with userData.capOK
  if (!(isImg || (isCanvas && (t.wrapS === 1000 /* RepeatWrapping */ || (t.userData && t.userData.capOK))))) return;
  const k = max / Math.max(w, h), c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
  try { c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); } catch { return; }
  t.image = c; t.needsUpdate = true;
  capTextures.n = (capTextures.n || 0) + 1;
}
const TEX_KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'bumpMap', 'alphaMap', 'displacementMap', 'specularMap', 'lightMap'];
export function capTextures(root) {
  if (!PROFILE || !root) return;
  // a texture that's anyone's colour map keeps the full size, even where it's also used as a bump / roughness map
  const DETAIL = new Set(['normalMap', 'roughnessMap', 'bumpMap', 'metalnessMap', 'aoMap']), colour = new Set(), list = [];
  root.traverse(o => {
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : null; if (!ms) return;
    for (const m of ms) {
      if (!m) continue;
      for (const k of TEX_KEYS) if (m[k]) { list.push([m[k], DETAIL.has(k)]); if (!DETAIL.has(k)) colour.add(m[k]); }
      if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u && u.value && u.value.isTexture) { list.push([u.value, false]); colour.add(u.value); }
    }
  });
  for (const [t, d] of list) capOne(t, d && !colour.has(t));
}

// ---- the governor: watches the frame rate and trades sharpness / shadows / glow for smoothness.
// levels go down one at a time when it's been under ~28 fps for 3 s, and come back up after 8 s over ~50.
export function makeGovernor({ renderer, resize, world, getBloom }) {
  const P = PROFILE;
  let acc = 0, n = 0, t = 0, bad = 0, good = 0, frame = 0;
  const S = { level: 0, fps: 60, events: [] };
  const sun = () => world && world.sun;
  function setShadow(sz) { const s = sun(); if (!s || s.shadow.mapSize.x === sz) return; s.shadow.mapSize.set(sz, sz); if (s.shadow.map) { s.shadow.map.dispose(); s.shadow.map = null; } }
  // each step down: [what, apply]
  const DOWN = [
    () => { const pr = renderer.getPixelRatio(); if (pr - 0.15 >= P.prMin) { renderer.setPixelRatio(pr - 0.15); resize(); return 'pixel ratio ' + (pr - 0.15).toFixed(2); } return null; },
    () => { if (P.shadowEvery < 2) { P.shadowEvery = 2; return 'shadows every 2nd frame'; } return null; },
    () => { const b = getBloom(); if (b && b.enabled) { b.enabled = false; return 'bloom off'; } return null; },
    () => { const s = sun(); if (s && s.shadow.mapSize.x > P.shadowMin) { setShadow(P.shadowMin); return 'shadow map ' + P.shadowMin; } return null; },
    () => { if (P.shadowEvery < 3) { P.shadowEvery = 3; return 'shadows every 3rd frame'; } return null; },
  ];
  function stepDown() {
    // sharpness first while it's still high; then the rest in order; then sharpness again down to the floor
    const order = renderer.getPixelRatio() > 1.15 ? [0, 1, 2, 3, 4] : [1, 2, 3, 4, 0];
    for (const i of order) { const r = DOWN[i](); if (r) { S.level++; S.events.push('-' + r); return true; } }
    return false;
  }
  function stepUp() {
    const pr = renderer.getPixelRatio();
    if (pr + 0.1 <= P.prCap) { renderer.setPixelRatio(Math.min(P.prCap, pr + 0.1)); resize(); S.events.push('+pixel ratio ' + renderer.getPixelRatio().toFixed(2)); return; }
  }
  S.tick = (dt, active) => {
    // shadows on a budget: the sun's map only re-renders every Nth frame
    frame++;
    if (renderer.shadowMap.autoUpdate !== (P.shadowEvery <= 1)) renderer.shadowMap.autoUpdate = P.shadowEvery <= 1;
    if (P.shadowEvery > 1 && frame % P.shadowEvery === 0) renderer.shadowMap.needsUpdate = true;
    if (!active || Q.has('nogov')) { acc = n = t = 0; return; }
    acc += Math.min(dt, 0.2); n++; t += dt;
    if (t < 1) return;
    const fps = n / acc; S.fps = fps; acc = n = t = 0;
    if (fps < 28) { bad++; good = 0; if (bad >= 3) { bad = 0; stepDown(); } }
    else if (fps > 50) { good++; bad = 0; if (good >= 8) { good = 0; stepUp(); } }
    else { bad = Math.max(0, bad - 1); good = 0; }
  };
  return S;
}

// ---- WebGL context loss (iOS drops it when memory runs short or the tab sits in the background)
export function guardContext(canvas, { onLost, onRestored, onGiveUp, waitMs = 5000 }) {
  let box = null, timer = 0;
  const show = (t, s) => {
    if (!box) { box = document.createElement('div'); box.id = 'glLost'; box.style.cssText = 'position:fixed;inset:0;z-index:60;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,.82);color:#ece6da;font:600 22px Oswald,Arial Narrow,sans-serif;letter-spacing:.2em;text-align:center;padding:20px'; document.body.appendChild(box); }
    box.innerHTML = `<div>${t}</div><div style="font-size:13px;letter-spacing:.12em;opacity:.7;margin-top:10px;font-weight:400">${s}</div>`; box.style.display = 'flex';
  };
  canvas.addEventListener('webglcontextlost', e => {
    e.preventDefault();   // ...so the browser may give it back
    show('RECOVERING…', 'the graphics reset — your run is safe');
    try { onLost && onLost(); } catch (err) { console.error(err); }
    clearTimeout(timer); timer = setTimeout(() => { show('RELOADING…', 'picking up where you left off'); try { onGiveUp && onGiveUp(); } catch (err) { console.error(err); location.reload(); } }, waitMs);
  }, false);
  canvas.addEventListener('webglcontextrestored', () => {
    clearTimeout(timer);
    try { onRestored && onRestored(); } catch (err) { console.error(err); }
    if (box) box.style.display = 'none';
  }, false);
}
