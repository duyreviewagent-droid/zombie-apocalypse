// Zombie_Apocalypse — SOCCER STADIUM: the match on the pitch and the stewards round the ground (calm evening).
// Eight a side (Harbor City in claret, Ironbridge in yellow) and a referee, the game's own animated characters (the
// rigged models with their walk/run clips, like the townspeople), playing a simple game of football: the nearest man
// chases the ball, the rest hold a shape that slides with it, they pass forward, dribble, shoot; the keepers save.
// The goals the story wants (stadium.story.js: Harbor at ~17', the away end's equaliser at ~26') are the only ones
// that go in: the side that "wants" its goal gets a clear run and the keeper is beaten. After a goal: the scorers
// celebrate by the corner flag, everyone walks back, kick-off.
// When the announcer suspends the match they stop and stare at the East End; at the blackout they scatter for the
// tunnel — a few go down on the grass and get back up as the dead (story api.spawnZombie, lying) — never just vanish.
// Stewards in hi-vis stand at the gates, the tunnel, pitch-side and in the concourses (a little patrol back and forth);
// at the outbreak the pitch-side ones run toward the East End, then everybody runs for the nearest way out.
// makeMatch(K, { S, KINDS, HOME, AWAY, stewards: [{ x, z, yaw, ax, az }] }) → { update(dt, focus, hour), reset() }
import * as THREE from 'three';
import { Soldier } from '../soldier.js';
import { tier } from '../tex.js';

const PX = 52.5, PZ = 34, GOAL_Z = 3.66;
const lumOf = (map) => {   // a texture's mean linear brightness (for the recolour; ~1 for no texture)
  const img = map && map.image; if (!img || !img.width) return 0.5;
  try {
    const S = 32, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, S, S);
    const d = g.getImageData(0, 0, S, S).data; let s = 0, n = 0;
    const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 128) continue; const l = 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]); if (l < 0.004) continue; s += l; n++; }
    return n ? s / n : 0.5;
  } catch { return 0.5; }
};
// a kit: the outfit texture's folds and seams kept, its colour replaced (luminance × the kit colour)
const KITM = new Map();
function kitMat(src, hex, mix = 1) {
  const key = src.uuid + ':' + hex + ':' + mix; let m = KITM.get(key); if (m) return m;
  m = src.clone(); const col = new THREE.Color(hex), norm = 1 / Math.max(0.03, lumOf(src.map) * (src.color ? 0.2126 * src.color.r + 0.7152 * src.color.g + 0.0722 * src.color.b : 1));
  m.onBeforeCompile = sh => {
    sh.uniforms.kCol = { value: col }; sh.uniforms.kNorm = { value: norm }; sh.uniforms.kMix = { value: mix };
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 kCol; uniform float kNorm, kMix;').replace('#include <map_fragment>', `#include <map_fragment>
      { float l = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)) * kNorm; diffuseColor.rgb = mix(diffuseColor.rgb, kCol * min(l, 1.6), kMix); }`);
  };
  m.customProgramCacheKey = () => 'sdKit';
  KITM.set(key, m); return m;
}
function wear(s, top, bottom, { hat = false } = {}) {
  s.root.traverse(o => {
    if (!o.isMesh || !o.material) return;
    const n = (o.name + ' ' + o.material.name).toLowerCase();
    if (n.includes('headwear')) { o.visible = hat; return; }
    if (n.includes('outfit_top') && top != null) o.material = kitMat(o.material, top);
    else if (n.includes('outfit_bottom') && bottom != null) o.material = kitMat(o.material, bottom);
  });
}
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export function makeMatch(K, { S, KINDS, HOME, AWAY, stewards = [] }) {
  if (!KINDS || !KINDS.human) return null;
  const LT = tier(), level = K.level;
  const bodies = ['human', 'butler', 'coach'].filter(k => KINDS[k]);
  // (the footballers and the referee are the body in a T-shirt and shorts; the stewards anybody)
  const mk = (i, top, bottom, scale = 1, sporty = false) => {
    const kind = sporty && KINDS.coach ? KINDS.coach : KINDS[bodies[i % bodies.length]], s = new Soldier(kind, level, { clone: true });
    s.update(1 / 60, {}); wear(s, top, bottom); s.root.scale.setScalar(scale * rnd(0.96, 1.04)); s.animLod = true;
    return s;
  };
  // ---- the ball ----
  const ballTex = (() => { const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64; const g = cv.getContext('2d'); g.fillStyle = '#f4f4f0'; g.fillRect(0, 0, 128, 64); g.fillStyle = '#1a1a1a'; for (let i = 0; i < 9; i++) { g.beginPath(); const x = (i * 37) % 128, y = 10 + (i * 23) % 44; for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; g.lineTo(x + Math.cos(a) * 7, y + Math.sin(a) * 7); } g.fill(); } const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.45 }));
  ball.castShadow = true; level.add(ball);
  const B = { p: new THREE.Vector3(0, 0.11, 0), v: new THREE.Vector3(), held: null, heldT: 0, lastTeam: -1, lastTouch: null };
  // ---- the teams: home (0) attacks +x, away (1) attacks −x ----
  const SHAPE = [[-49, 0], [-34, -17], [-36, 0], [-34, 17], [-16, -20], [-19, 0], [-16, 20], [-4, 3]];   // GK, 3 at the back, 3 in the middle, the striker
  const players = [];
  for (const team of [0, 1]) for (let r = 0; r < 8; r++) {
    const gk = r === 0, kit = team === 0 ? (gk ? 0x2a8a3a : HOME.col) : (gk ? 0x3070d0 : 0xd8b020), shorts = team === 0 ? 0xf2f2f2 : 0x1a1a1a;
    const s = mk(team * 8 + r + team, kit, shorts, 1, true), sx = team === 0 ? 1 : -1;
    players.push({ s, team, role: r, gk, home: [SHAPE[r][0] * sx, SHAPE[r][1] * sx], cool: 0, speed: rnd(5.6, 6.6), mode: 'play', fallT: 0, hidden: false, num: r === 7 ? 9 : r + 1 });
  }
  const ref = { s: mk(5, 0x161616, 0x161616, 1, true), team: 2, role: -1, home: [0, -8], speed: 5, mode: 'play', hidden: false };
  const all = [...players, ref];
  // ---- the stewards ----
  const crew = stewards.slice(0, LT > 1 ? 4 : LT ? 7 : stewards.length).map((p, i) => {
    const s = mk(i + 1, 0xff7a12, 0x1c2230);   // (orange hi-vis: not to be mistaken for Ironbridge's yellow)
    return { s, team: 3, post: p, mode: 'post', t: rnd(0, 6), dir: 1, hidden: false };
  });
  const M = { state: 'warm', t: 0, kickT: 0, kickTeam: 0, celebrate: null, panicT: 0, lastHalt: false, warmSpots: new Map() };
  const goalX = team => team === 0 ? PX : -PX;   // the goal a team attacks
  const resetBall = () => { B.p.set(0, 0.11, 0); B.v.set(0, 0, 0); B.held = null; };
  function placeAll() {
    for (const u of players) { u.s.place(u.home[0] * 0.95, u.home[1], u.team === 0 ? Math.PI / 2 : -Math.PI / 2); u.s.setVisible(true); u.mode = 'play'; u.hidden = false; u.fallT = 0; u.zombie = false; u.s.resetActs && u.s.resetActs(); }
    ref.s.place(0, -9, 0); ref.s.setVisible(true); ref.mode = 'play'; ref.hidden = false;
    for (const c of crew) { c.s.place(c.post.x, c.post.z, c.post.yaw || 0); c.s.setVisible(true); c.mode = 'post'; c.hidden = false; c.zombie = false; c.leg = 0; c.turnAt = null; c.t2 = 0; c.s.resetActs && c.s.resetActs(); }
    resetBall(); M.state = 'warm'; M.celebrate = null; M.panicT = 0;
  }
  placeAll();

  // ---- moving a body toward a point (with a little room round everybody else) ----
  const cmd = { move: 0, speed: 0, aimYaw: null };
  function steer(u, tx, tz, speed, dt, face = null) {
    const p = u.s.pos; let dx = tx - p.x, dz = tz - p.z; const d = Math.hypot(dx, dz);
    let sx = 0, sz = 0;
    for (const o of all) { if (o === u || o.hidden) continue; const ox = p.x - o.s.pos.x, oz = p.z - o.s.pos.z, od2 = ox * ox + oz * oz; if (od2 < 1.4 && od2 > 1e-4) { const od = Math.sqrt(od2); sx += ox / od * (1.2 - od); sz += oz / od * (1.2 - od); } }
    if (M.you) { const ox = p.x - M.you.x, oz = p.z - M.you.z, od2 = ox * ox + oz * oz; if (od2 < 2.2 && od2 > 1e-4) { const od = Math.sqrt(od2); sx += ox / od * 1.6 * (1.5 - od); sz += oz / od * 1.6 * (1.5 - od); } }
    let sp = d < 0.4 ? 0 : Math.min(speed, d * 1.6 + 0.4);
    if (d > 1e-3) { dx /= d; dz /= d; }
    const mx = dx * sp + sx * 3, mz = dz * sp + sz * 3, ms = Math.hypot(mx, mz);
    cmd.move = ms > 0.05 ? Math.atan2(mx, mz) : null; cmd.speed = ms;
    cmd.aimYaw = null;
    u.s.update(dt, cmd);
    if (ms < 0.1 && face != null) { u.s.yaw += Math.atan2(Math.sin(face - u.s.yaw), Math.cos(face - u.s.yaw)) * Math.min(1, dt * 4); u.s.pivot.rotation.y = u.s.yaw; }
    // stay off the stands (the run-off is 58 × 40; the canopy over the tunnel mouth: only the tunnel's way in)
    p.x = clamp(p.x, -57.4, 57.4); if (!(Math.abs(p.x) < 1.7 && p.z < -33)) p.z = clamp(p.z, -39.4, 39.4);
  }
  const faceTo = (u, x, z) => Math.atan2(x - u.s.pos.x, z - u.s.pos.z);

  // ---- a touch of the ball: shoot, pass or dribble ----
  function touch(u) {
    const p = u.s.pos, gx = goalX(u.team), dir = Math.sign(gx), want = S.wantGoal === u.team;
    u.cool = 0.45; B.lastTeam = u.team; B.lastTouch = u;
    if (u.gk) {   // the keeper: a long kick upfield to a team-mate
      const mates = players.filter(o => o.team === u.team && !o.gk && !o.hidden);
      const t = mates.sort((a, b) => (b.s.pos.x - a.s.pos.x) * dir - (a.s.pos.x - b.s.pos.x) * dir)[Math.floor(Math.random() * 3)] || mates[0];
      if (t) kick(t.s.pos.x + dir * 3, t.s.pos.z, 19, 6); return;
    }
    const dG = Math.hypot(gx - p.x, p.z);
    if (dG < (want ? 20 : 24)) {   // shoot: the wanted goal goes in the corner; otherwise wide, over or at the keeper
      const tz = want ? (Math.random() < 0.5 ? -1 : 1) * rnd(1.6, 3.0) : (Math.random() < 0.5 ? rnd(-1.2, 1.2) : (Math.random() < 0.5 ? -1 : 1) * rnd(4.4, 7));
      kick(gx + dir * 2, tz, want ? 21 : rnd(17, 23), want ? rnd(0.5, 2.0) : rnd(1, 4.5)); u.shot = true; return;
    }
    // pass to a team-mate further forward and not marked, or carry it on
    let best = null, bs = -1e9;
    for (const o of players) {
      if (o.team !== u.team || o === u || o.gk || o.hidden) continue;
      const fwd = (o.s.pos.x - p.x) * dir, d = Math.hypot(o.s.pos.x - p.x, o.s.pos.z - p.z);
      if (d < 6 || d > 38) continue;
      let mark = 99; for (const e of players) if (e.team !== u.team && !e.hidden) mark = Math.min(mark, Math.hypot(e.s.pos.x - o.s.pos.x, e.s.pos.z - o.s.pos.z));
      if (want && fwd < 8) continue;   // (going for the goal: only a ball forward)
      const sc = fwd * 0.6 + Math.min(mark, 8) * 1.5 - d * 0.1 + (want ? fwd * 0.5 : 0);
      if (sc > bs) { bs = sc; best = o; }
    }
    let press = 99; for (const e of players) if (e.team !== u.team && !e.hidden) press = Math.min(press, Math.hypot(e.s.pos.x - p.x, e.s.pos.z - p.z));
    if (best && (want ? Math.random() < 0.3 : press < 4 || Math.random() < 0.35)) { const d = Math.hypot(best.s.pos.x - p.x, best.s.pos.z - p.z); kick(best.s.pos.x + dir * 2, best.s.pos.z, clamp(d * 0.9 + 4, 8, 20), d > 25 ? 4 : 0.3); return; }
    // dribble: a push forward (toward the goal, round whoever's in the way)
    const a = Math.atan2(gx - p.x, -p.z * 0.6) + rnd(-0.5, 0.5);
    B.v.set(Math.sin(a) * 6.5, 0, Math.cos(a) * 6.5); u.cool = 0.3;
  }
  function kick(tx, tz, speed, up) {
    const dx = tx - B.p.x, dz = tz - B.p.z, d = Math.hypot(dx, dz) || 1;
    B.v.set(dx / d * speed, up, dz / d * speed); B.held = null;
  }
  // ---- the ball's flight and roll; out of play, the keepers' saves, goals ----
  function ballStep(dt) {
    if (B.held) {   // in the keeper's hands
      const h = B.held.s; B.p.set(h.pos.x + Math.sin(h.yaw) * 0.35, 1.0, h.pos.z + Math.cos(h.yaw) * 0.35); B.v.set(0, 0, 0);
      if ((B.heldT -= dt) <= 0) { const k = B.held; B.held = null; touch(k); }
      return;
    }
    B.v.y -= 9.81 * dt; B.p.addScaledVector(B.v, dt);
    if (B.p.y < 0.11) { B.p.y = 0.11; if (B.v.y < -1) B.v.y = -B.v.y * 0.45; else B.v.y = 0; B.v.x *= Math.exp(-0.9 * dt); B.v.z *= Math.exp(-0.9 * dt); }
    ball.rotation.x += B.v.z * dt / 0.11; ball.rotation.z -= B.v.x * dt / 0.11;
    if (M.state !== 'play') { if (Math.abs(B.p.x) > PX + 3) { B.p.x = Math.sign(B.p.x) * (PX + 3); B.v.set(0, 0, 0); } if (Math.abs(B.p.z) > PZ + 3) { B.p.z = Math.sign(B.p.z) * (PZ + 3); B.v.set(0, 0, 0); } return; }
    // the keepers: anything near them they gather (unless their side is the one the story wants beaten)
    for (const u of players) {
      if (!u.gk || u.hidden) continue;
      const conceding = S.wantGoal != null && S.wantGoal !== u.team;
      if (conceding) continue;
      if (Math.hypot(B.p.x - u.s.pos.x, B.p.z - u.s.pos.z) < 1.6 && B.p.y < 2.4 && Math.abs(B.p.x - goalX(1 - u.team)) < 18) { B.held = u; B.heldT = 1.4; B.lastTeam = u.team; return; }
    }
    // a goal? (between the posts, under the bar)
    if (Math.abs(B.p.x) > PX && Math.abs(B.p.z) < GOAL_Z && B.p.y < 2.44) {
      const team = B.p.x > 0 ? 0 : 1;
      if (S.wantGoal === team) { goal(team); return; }
      // (not the story's goal: the keeper had it after all)
      const gk = players.find(u => u.gk && u.team !== team); if (gk) { B.held = gk; B.heldT = 1.2; } return;
    }
    // out of play: the other side restarts (a goal kick by the keeper, or a throw from the line)
    if (Math.abs(B.p.x) > PX + 0.5 || Math.abs(B.p.z) > PZ + 0.5) {
      const team = 1 - (B.lastTeam < 0 ? 0 : B.lastTeam);
      if (Math.abs(B.p.x) > PX + 0.5) { const gk = players.find(u => u.gk && u.team === team && Math.sign(goalX(1 - team)) === Math.sign(B.p.x)); if (gk) { B.held = gk; B.heldT = 1.0; return; } }
      B.p.set(clamp(B.p.x, -PX + 1, PX - 1), 0.11, clamp(B.p.z, -PZ + 0.3, PZ - 0.3)); B.v.set(0, 0, 0); M.restart = { team, t: 1.2 };
    }
  }
  function goal(team) {
    S.score[team]++; S.wantGoal = null; S.goalT = team === 0 ? 4 : 2.5; S.goalBig = team === 0 ? 0.32 : 0.18;
    const sc = B.lastTouch && B.lastTouch.team === team ? B.lastTouch : players.find(u => u.team === team && u.role === 7);
    M.state = 'goal'; M.t = 0; M.kickTeam = 1 - team; M.celebrate = { team, x: Math.sign(goalX(team)) * (PX - 1), z: B.p.z >= 0 ? PZ - 1 : -PZ + 1, scorer: sc };
    B.v.multiplyScalar(0.2);
  }

  // ---- each frame ----
  function playStep(dt) {
    for (const u of players) u.cool = Math.max(0, (u.cool || 0) - dt);
    const bx = B.p.x, bz = B.p.z;
    // who goes for the ball: each side's nearest outfield man (and the keeper, near his own box)
    const chaser = [null, null];
    for (const t of [0, 1]) {
      let best = null, bd = 1e9;
      for (const u of players) { if (u.team !== t || u.hidden) continue; const d = Math.hypot(u.s.pos.x - bx, u.s.pos.z - bz) + (u.gk ? (Math.abs(bx - goalX(1 - t)) < 16 && Math.abs(bz) < 20 ? -2 : 99) : 0); if (d < bd) { bd = d; best = u; } }
      chaser[t] = best;
    }
    if (M.restart) { M.restart.t -= dt; }
    for (const u of players) {
      if (u.hidden) continue;
      const dir = Math.sign(goalX(u.team)), opp = S.wantGoal != null && S.wantGoal !== u.team;
      if (u === chaser[u.team] && !B.held && !(M.restart && M.restart.team !== u.team)) {
        const lead = 0.25; steer(u, bx + B.v.x * lead, bz + B.v.z * lead, u.speed * (opp ? 0.55 : 1), dt);
        const d = Math.hypot(u.s.pos.x - bx, u.s.pos.z - bz);
        if (d < 0.75 && B.p.y < 0.9 && !u.cool && !opp) { if (M.restart) M.restart = null; touch(u); }   // (the side the story wants scored against is a step slow: it can't win the ball back)
      } else if (u.gk) {
        const gx = goalX(1 - u.team) - Math.sign(goalX(1 - u.team)) * 1.2;
        steer(u, gx, clamp(bz * 0.12, -2.6, 2.6), 4, dt, faceTo(u, bx, bz));
      } else {   // hold the shape, slid with the ball
        const push = clamp(bx * 0.55 + dir * 6, -30, 30), tx = clamp(u.home[0] + push, -PX + 4, PX - 4), tz = clamp(u.home[1] * 0.9 + bz * 0.3, -PZ + 2, PZ - 2);
        steer(u, tx, tz, u.speed * 0.55, dt, faceTo(u, bx, bz));
      }
    }
    // the referee keeps up, a little to one side
    steer(ref, clamp(bx - 8, -40, 40), clamp(bz + (bz > 0 ? -10 : 10), -28, 28), 5.2, dt, faceTo(ref, bx, bz));
    ballStep(dt);
  }
  function shapeStep(dt, toKick) {   // walk back to the kick-off shape (or the warm-up spots)
    for (const u of players) {
      if (u.hidden) continue;
      let tx = u.home[0] * 0.95, tz = u.home[1];
      if (!toKick) { let w = M.warmSpots.get(u); if (!w || Math.hypot(u.s.pos.x - w[0], u.s.pos.z - w[1]) < 1) { const sx = u.team === 0 ? -1 : 1; w = [sx * rnd(4, 44), rnd(-28, 28)]; M.warmSpots.set(u, w); } tx = w[0]; tz = w[1]; }
      if (toKick && u.team === M.kickTeam && u.role === 7) { tx = -Math.sign(goalX(u.team)) * 0.4; tz = 0; }
      steer(u, tx, tz, toKick ? 3.2 : 2.6, dt, faceTo(u, 0, 0));
    }
    steer(ref, 0, toKick ? -6 : -12, 2.5, dt, faceTo(ref, 0, 0));
    if (toKick) { B.p.lerp(new THREE.Vector3(0, 0.11, 0), Math.min(1, dt * 2)); B.v.set(0, 0, 0); } else ballStep(dt);
  }
  function celebrateStep(dt) {
    const c = M.celebrate;
    for (const u of players) {
      if (u.hidden) continue;
      if (u.team === c.team && !u.gk) steer(u, c.x + (u.role % 3 - 1) * 1.2, c.z * 0.97 + (u.role % 2) * 1.0, u === c.scorer ? 6.5 : 5.5, dt);
      else steer(u, u.home[0] * 0.95, u.home[1], 1.4, dt, faceTo(u, 0, 0));
    }
    steer(ref, 0, -6, 2, dt, faceTo(ref, 0, 0));
    ballStep(dt);
  }
  // the outbreak: halt and stare; then the blackout: run (a few go down, and get back up)
  function haltStep(dt) {
    for (const u of all) { if (u.hidden) continue; steer(u, u.s.pos.x, u.s.pos.z, 0, dt, faceTo(u, 58, 0)); }
    ballStep(dt);
  }
  const TUNNEL = [[0, -33.8], [0, -41.5], [0, -45.5]];
  function panicStep(dt) {
    M.panicT += dt;
    for (const u of all) {
      if (u.hidden) continue;
      if (u.mode === 'down') {   // on the grass... then up as one of them
        u.fallT += dt;
        u.s.update(dt, {});
        if (u.fallT > 3.5 && S.api && S.api.spawnZombie) { const z = S.api.spawnZombie(u.s.pos.x, u.s.pos.z, { lying: true, yaw: u.s.yaw }); if (z) { u.s.setVisible(false); u.hidden = true; u.zombie = true; } else u.fallT = 0; }
        continue;
      }
      if (u.mode !== 'run') {
        u.mode = 'run'; u.leg = 0;
        u.turnAt = (u.team !== 2 && (u.role === 2 || u.role === 5) && u.team === 1) || (u.team === 0 && u.role === 4) ? rnd(2, 7) : null;
        u.delay = rnd(0, 1.2);
      }
      if ((u.delay -= dt) > 0) { u.s.update(dt, {}); continue; }
      if (u.turnAt != null && M.panicT > u.turnAt) { u.mode = 'down'; u.fallT = 0; u.s.play('Death_D', { hold: true }); continue; }
      const w = TUNNEL[u.leg], d = Math.hypot(u.s.pos.x - w[0], u.s.pos.z - w[1]);
      steer(u, w[0] + (u.leg ? 0 : ((u.s.id % 5) - 2) * 0.5), w[1], u.leg ? 3.5 : 6.5, dt);
      if (d < (u.leg ? 0.8 : 2.5)) { u.leg++; if (u.leg >= TUNNEL.length) { u.s.setVisible(false); u.hidden = true; } }   // (in the tunnel, under its roof: gone down to the dressing rooms)
    }
    ballStep(dt);
  }
  // ---- stewards ----
  function crewStep(dt, phase) {
    for (const c of crew) {
      if (c.hidden) continue;
      const p = c.post;
      if (c.mode === 'down') { c.fallT += dt; c.s.update(dt, {}); if (c.fallT > 3.5 && S.api && S.api.spawnZombie) { const z = S.api.spawnZombie(c.s.pos.x, c.s.pos.z, { lying: true, yaw: c.s.yaw }); if (z) { c.s.setVisible(false); c.hidden = true; } else c.fallT = 0; } continue; }
      if (phase === 'calm') {   // at the post: a few steps one way, a few back, a look round
        c.t -= dt; if (c.t <= 0) { c.t = rnd(4, 9); c.dir = -c.dir; }
        const k = c.dir > 0 ? 1 : 0, tx = p.x + (p.ax || 0) * k, tz = p.z + (p.az || 0) * k;
        steerFree(c, tx, tz, 1.25, dt, p.yaw);
      } else if (phase === 'news') {   // code red: the pitch-side ones go toward the East End; the rest hold the gates
        if (p.pitch) steerFree(c, clamp(c.s.pos.x + 10, -54, 54), c.s.pos.z, 4.5, dt); else steerFree(c, p.x, p.z, 1.2, dt, Math.atan2(58 - p.x, -p.z));
      } else {   // the blackout: run for the nearest way out (and out of sight there); one or two don't make it
        if (c.turnAt == null) c.turnAt = (crew.indexOf(c) % 3 === 1) ? rnd(3, 9) : -1;
        if (c.turnAt > 0 && (c.t2 = (c.t2 || 0) + dt) > c.turnAt) { c.mode = 'down'; c.fallT = 0; c.s.play('Death_D', { hold: true }); continue; }
        const route = p.exit || [[p.x, p.z]]; c.leg = c.leg || 0;
        const ex = route[Math.min(c.leg, route.length - 1)]; steerFree(c, ex[0], ex[1], 5.5, dt);
        if (Math.hypot(c.s.pos.x - ex[0], c.s.pos.z - ex[1]) < 1.2) {
          if (c.leg < route.length - 1) c.leg++;
          else { const f = M.focus, far = !f || Math.hypot(f.x - ex[0], f.z - ex[1]) > 18; if (far || ex[1] < -44) { c.s.setVisible(false); c.hidden = true; } }   // (out of sight round the corner / down the tunnel)
        }
      }
    }
  }
  function steerFree(c, tx, tz, speed, dt, face = null) {   // (stewards walk where there's floor: posts and exits are picked clear)
    const p = c.s.pos, dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
    let mx = 0, mz = 0; if (d > 0.3) { const sp = Math.min(speed, d * 1.5 + 0.3); mx = dx / d * sp; mz = dz / d * sp; }
    if (M.you) { const ox = p.x - M.you.x, oz = p.z - M.you.z, od2 = ox * ox + oz * oz; if (od2 < 2.2 && od2 > 1e-4) { const od = Math.sqrt(od2); mx += ox / od * 4 * (1.5 - od); mz += oz / od * 4 * (1.5 - od); } }
    const ms = Math.hypot(mx, mz); cmd.move = ms > 0.05 ? Math.atan2(mx, mz) : null; cmd.speed = ms; cmd.aimYaw = null;
    c.s.update(dt, cmd);
    if (ms < 0.1 && face != null) { c.s.yaw += Math.atan2(Math.sin(face - c.s.yaw), Math.cos(face - c.s.yaw)) * Math.min(1, dt * 3); c.s.pivot.rotation.y = c.s.yaw; }
  }

  // ---- the player can kick the ball about too ----
  function youKick(you) {
    if (!you || B.held) return;
    const dx = B.p.x - you.x, dz = B.p.z - you.z, d = Math.hypot(dx, dz);
    if (d < 0.55 && B.p.y < 0.6 && Math.abs((you.y || 0)) < 0.5) { const sp = 7; B.v.set(dx / (d || 1) * sp, 0.6, dz / (d || 1) * sp); B.lastTeam = -1; }
  }

  let phaseSeen = null;
  function update(dt, focus, hour, phase, you) {
    dt = Math.min(dt, 0.1); M.focus = focus; M.you = you;
    if (dt <= 0) return;
    if (!phase) return;   // (the story hasn't said yet)
    // (a save loaded in mid-outbreak, or after it: the pitch is already empty — nobody runs off a match you never saw)
    if (phase === 'calm') phaseSeen = 'calm';
    else if (phaseSeen !== 'calm' && !M.cleared) { M.cleared = true; for (const u of all) { u.s.setVisible(false); u.hidden = true; } for (const c of crew) { c.s.setVisible(false); c.hidden = true; } }
    youKick(you);
    if (S.broken) { panicStep(dt); crewStep(dt, 'dark'); ball.position.copy(B.p); return; }
    crewStep(dt, phase === 'calm' ? 'calm' : 'news');
    if (S.halted) { haltStep(dt); ball.position.copy(B.p); return; }
    const KO = S.kickoffHour || 19.75;
    if (hour < KO - 0.1) { M.state = 'warm'; shapeStep(dt, false); }
    else if (hour < KO) { M.state = 'line'; shapeStep(dt, true); }
    else if (M.state === 'warm' || M.state === 'line') { M.state = 'play'; M.kickTeam = 0; resetBall(); kickOff(); }
    else if (M.state === 'goal') { M.t += dt; if (M.t < 6) celebrateStep(dt); else { M.state = 'back'; M.t = 0; } }
    else if (M.state === 'back') { M.t += dt; shapeStep(dt, true); if (M.t > 4.5) { M.state = 'play'; resetBall(); kickOff(); } }
    else playStep(dt);
    ball.position.copy(B.p);
  }
  function kickOff() {   // the striker of the side kicking off rolls it back to a midfielder
    const t = M.kickTeam, mid = players.find(u => u.team === t && u.role === 5);
    if (mid) { kick(mid.s.pos.x, mid.s.pos.z, 9, 0.2); B.lastTeam = t; }
  }
  function reset() { phaseSeen = null; M.cleared = false; S.wantGoal = null; placeAll(); for (const u of all) u.s.update(1 / 60, {}); for (const c of crew) c.s.update(1 / 60, {}); ball.position.copy(B.p); }
  return { update, reset, players, ref, crew, ball: B, M };
}
