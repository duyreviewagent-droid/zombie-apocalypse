// Zombie_Apocalypse — SOCCER STADIUM: Harbor City Stadium, cup final night.
// A classic four-stand ground with open corners: the two-tier MAIN STAND (north) with the players' tunnel, the
// dressing rooms, the groundsman's store, a long staff corridor and a concourse underneath, and executive boxes,
// the press box, the police control room and the floodlight switch room on its first floor; the big SOUTH STAND
// and the EAST and WEST ENDS, each with a concourse of food kiosks, toilets and turnstiles under the seats.
// Four lattice floodlight pylons in the open corners, a big screen over the East End, LED ad boards round the pitch.
// Outside: the club plaza (burger van, programme hut, ticket office, statue, team coaches), the car park to the south,
// the TV trucks on the west road, the maintenance yard on the east road, and a palisade fence round all of it.
// Pitch 105 × 68 m (x along the touchlines), centre spot at (0, 0). North is −z. Everything is axis-aligned.
//
// Exports: buildMap(K) (see kit.js) and STADIUM — the live state the story module uses (power, floodlights, crowd).
import * as LOOT from '../loot.js';
import { tier } from '../tex.js';
const ITEMS = LOOT.ITEMS || {}, LOOT_PANEL = !!(LOOT.LOOT_KINDS && LOOT.LOOT_KINDS.panel);
import { makeMatch } from './stadium.match.js';
import { textures, signAtlas, barsTexture, geos, builder, rng, bakePerson, personSource, HOME, AWAY } from './stadium.kit.js';
const Q_HAS = k => { try { return new URLSearchParams(location.search).has(k); } catch { return false; } };
const Q_NOREAL = () => Q_HAS('noreal');   // (test hooks: ?noreal — the far crowd figures only; ?nomatch — nobody on the pitch)

export const ID = 'stadium';
// ---- the shape of the ground (all the numbers in one place) ----
const PX = 52.5, PZ = 34;                  // half pitch
const AX = 58, AZ = 40;                    // the stands' front walls (edge of the run-off)
const D = 0.8, RISE = 0.38, V0 = 1.8, Y0 = 0.5;   // a row's tread depth, its rise, the first row's front edge and height
const rowV = i => V0 + i * D, rowY = i => Y0 + i * RISE;
const CONC = 8.2;                          // concourses and dressing rooms start this far back under the rows
const STANDS = {
  N: { id: 'N', name: 'MAIN STAND', O: [0, -AZ], o: [0, -1], L: 50, rows: 14, main: true },
  S: { id: 'S', name: 'SOUTH STAND', O: [0, AZ], o: [0, 1], L: 50, rows: 18 },
  E: { id: 'E', name: 'EAST END', O: [AX, 0], o: [1, 0], L: 30, rows: 18, away: true },
  W: { id: 'W', name: 'WEST END', O: [-AX, 0], o: [-1, 0], L: 30, rows: 18 },
};
for (const st of Object.values(STANDS)) {
  st.a = [-st.o[1], st.o[0]];
  st.gang = rowV(st.rows);                                 // the top gangway's front edge
  st.back = st.main ? 30 : st.gang + 2;                    // the back (outer) wall
  st.top = rowY(st.rows);                                  // gangway height
  st.roofY = st.main ? 19.5 : 13.6;
  st.aisles = st.L === 50 ? [-44, -33, -22, -11, 0, 11, 22, 33, 44] : [-22, -11, 0, 11, 22];
}
const P = (st, u, v) => [st.O[0] + st.a[0] * u + st.o[0] * v, st.O[1] + st.a[1] * u + st.o[1] * v];
const MAIN = STANDS.N, L1 = MAIN.top;      // the Main Stand's first floor (gangway, boxes, switch room) — 5.82 m

// named places (story spots, objectives, cast): { x, z, y?, yaw? }
const sp = (st, u, v, y = 0, yaw = 0) => { const [x, z] = P(st, u, v); return { x, z, y, yaw }; };
export const SPOTS = {
  start: { x: 4, z: -86, yaw: 0 },
  burgerVan: { x: -16, z: -85.5 }, programmeHut: { x: 14, z: -79.5 }, ticketOffice: { x: -40, z: -84 }, statue: { x: 0, z: -92 },
  gateN: sp(MAIN, -24.1, 31.25),   // (beside Gate A's queue, not in a turnstile lane)
  reception: sp(MAIN, 0, 31), concourseN: sp(MAIN, -20, 24), firstAid: sp(MAIN, -45, 26),
  seatRow12: { ...sp(MAIN, -20, rowV(11) + 0.45, rowY(11)), yaw: 0 },
  tunnel: sp(MAIN, 0, 3), tunnelGate: sp(MAIN, 0, 7.5), homeDressing: sp(MAIN, -13, 11.5), awayDressing: sp(MAIN, 13, 11.5),
  refRoom: sp(MAIN, 28, 11.5), physio: sp(MAIN, -28, 11.5), groundsShed: sp(MAIN, -41, 11.5), corridor: sp(MAIN, 0, 16.5),
  pressBox: sp(MAIN, 0, 17, L1), controlRoom: sp(MAIN, -2, 25.5, L1), switchRoom: sp(MAIN, 44, 26, L1), lounge: sp(MAIN, -30, 25.5, L1),
  backStairs: sp(MAIN, 32, 31.6), concourseS: sp(STANDS.S, 0, 13), toiletsS: sp(STANDS.S, -14, STANDS.S.back - 3.1), concourseE: sp(STANDS.E, 0, 13), concourseW: sp(STANDS.W, 0, 13),
  centreSpot: { x: 0, z: 0, yaw: Math.PI / 2 },
  pylonNE: { x: 66, z: -56 }, pylonNW: { x: -66, z: -56 }, pylonSE: { x: 66, z: 46 }, pylonSW: { x: -66, z: 46 },
  maintenance: { x: 90, z: -14 }, tvTrucks: { x: -90, z: 0 }, carPark: { x: 0, z: 84 },
};

// the live state (the story module drives it: power cut at the outbreak, the floodlights back on with the key)
export const STADIUM = {
  power: true, lights: true, crowd: true, hasKey: false, switchedOn: false, score: [0, 0], minute: 0,
  W: null, api: null,
};

export function buildMap(K) {
  const { THREE, W, MAT, TILE } = K;
  STADIUM.W = W;
  K.bounds(-112, -112, 112, 112);
  K.preset('stadium');
  const T = textures(17), G = geos(), Bd = builder(K), R = rng(2024);
  const { box, rect, wall } = Bd;
  const std = K.std;
  // ---------------------------------------------------------------- materials
  const add = (k, m, tile) => { MAT[k] = m; if (tile) TILE[k] = tile; return m; };
  add('sdGrass', std({ map: T.grass, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), 10.5);
  add('sdApron', std({ map: T.apron, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), 4);
  add('sdLine', std({ color: 0xf4f4ee, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), 1);
  add('sdTread', std({ map: T.tread, roughness: 0.92 }), 2.4);
  add('sdRiser', std({ map: T.tread, color: 0xb8b6b0, roughness: 0.92 }), 2.4);
  add('sdNosing', std({ map: T.nosing, roughness: 0.7 }), 1);
  add('sdClad', std({ map: T.clad, roughness: 0.45, metalness: 0.5 }), 6);
  add('sdBand', std({ map: T.band, roughness: 0.5, metalness: 0.3 }), 8);
  add('sdBlock', std({ map: T.block, roughness: 0.9 }), 3.2);
  add('sdRubber', std({ map: T.rubberFloor, roughness: 0.95 }), 2);
  add('sdTile', std({ map: T.tile, roughness: 0.3 }), 1.6);
  add('sdLocker', std({ map: T.locker, roughness: 0.6 }), 2);
  add('sdConc', std({ map: K.TX.concreteTexture(0.85), color: 0xb8b4aa, roughness: 0.55 }), 4);   // polished concourse floor
  add('sdSteel', std({ color: 0xa8adb2, roughness: 0.45, metalness: 0.6 }));   // (painted steel: a white one glared under the floodlights)
  add('sdGlassBand', std({ color: 0x1a2430, roughness: 0.08, metalness: 0.6, envMapIntensity: 1.5 }), 4);
  add('sdRoofTop', std({ map: K.TX.corrugatedTexture([170, 176, 182]), roughness: 0.5, metalness: 0.6 }), 4);
  add('sdRoofUnder', std({ map: K.TX.corrugatedTexture([206, 208, 210]), roughness: 0.7, metalness: 0.3 }), 3);   // (the underside of the profiled steel deck)
  add('sdPalisade', std({ color: 0x1e3a2a, roughness: 0.5, metalness: 0.6 }));
  { const bt2 = barsTexture(); add('sdBars', std({ map: bt2, color: 0x2a4a36, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.6 }), 2.9); bt2.repeat.set(2.9 / 0.8, 1); }
  add('sdAsphalt', std({ ...K.TX.relief(K.TX.asphaltTexture ? K.TX.asphaltTexture() : K.TX.concreteTexture(0.6), 0.4), roughness: 0.95 }), 6);
  add('sdSeatC', std({ map: T.seat, color: new THREE.Color(HOME.col), roughness: 0.35 }));
  add('sdSeatB', std({ map: T.seat, color: new THREE.Color(HOME.col2), roughness: 0.35 }));
  add('sdSeatY', std({ map: T.seat, color: new THREE.Color(0xd8b020), roughness: 0.35 }));
  add('sdSeatG', std({ map: T.seat, color: new THREE.Color(0x3a3e44), roughness: 0.35 }));
  add('sdNet', std({ map: T.net, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8, transparent: false }));
  add('sdCanopy', std({ color: 0xeeeeea, roughness: 0.6, side: THREE.DoubleSide }));
  // things that glow when the power's on
  const glow = (col, em, i = 1.6, o = {}) => std({ color: col, emissive: em, emissiveIntensity: i, roughness: 0.4, ...o });
  const bt = T.boards; bt.repeat.set(1, 32 / 0.92);
  const boards = add('sdBoards', std({ map: bt, emissive: 0xffffff, emissiveMap: bt, emissiveIntensity: 1.1, roughness: 0.4 }), 32);
  const rt = T.boards.clone(); rt.needsUpdate = true; rt.repeat.set(1, 32 / 1.5); rt.offset.set(0, -(L1 + 2.98) / 1.5);
  const ribbon = add('sdRibbon', std({ map: rt, emissive: 0xffffff, emissiveMap: rt, emissiveIntensity: 1.1, roughness: 0.4 }), 32);
  // the ends of a board run (between whole sponsor panels): a claret panel with a pale-blue rule, lit like the rest
  const bEnd = K.ctex ? K.ctex(64, 64, (g, w, h) => { g.fillStyle = HOME.col; g.fillRect(0, 0, w, h); g.fillStyle = HOME.col2; g.fillRect(0, h * 0.42, w, h * 0.16); g.fillStyle = 'rgba(0,0,0,0.2)'; for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1); }, [1, 1]) : null;
  const boardEnd = add('sdBoardEnd', std({ map: bEnd, color: 0xffffff, emissive: 0xffffff, emissiveMap: bEnd, emissiveIntensity: 0.9, roughness: 0.4 }), 0.92);
  const strip = add('sdStrip', glow(0xf6f6f2, 0xfff6e8, 2.2));
  const lens = add('sdLens', glow(0xfffbe8, 0xfff4dc, 6, { side: THREE.DoubleSide }));
  const screenM = add('sdScreen', std({ map: T.screen, emissive: 0xffffff, emissiveMap: T.screen, emissiveIntensity: 1.25, roughness: 0.3 }));
  const GLOW = [boards, boardEnd, ribbon, strip, screenM];
  const GLOW0 = GLOW.map(m => m.emissiveIntensity);
  // every sign shares one atlas texture (one material)
  const ATL = signAtlas(2048), signMat = add('sdSigns', std({ map: ATL.tex, roughness: 0.5, emissive: 0xffffff, emissiveMap: ATL.tex, emissiveIntensity: 0.35 }));
  GLOW.push(signMat); GLOW0.push(0.35);
  const sign = (lines, x, y, z, ry, w = 2.4, h = 0.6, bg = '#1a2a4a', fg = '#ffffff') => { const r = ATL.add(lines, bg, fg, w / h); if (!r) return; K.xadd(ATL.plane(r, w, h), signMat, K.mat4(x, y, z, ry), false); };

  // ---------------------------------------------------------------- the ground: pitch, run-off, plazas, car park
  K.slab(-PX, -PZ, PX, PZ, 'sdGrass', 'grass', 0.025);
  K.slab(-AX, -AZ, AX, AZ, 'sdApron', 'grass', 0.02);
  const line = (x0, z0, x1, z1) => K.box((x0 + x1) / 2, 0.025, (z0 + z1) / 2, Math.max(0.06, Math.abs(x1 - x0) / 2), 0.034, Math.max(0.06, Math.abs(z1 - z0) / 2), 0, f => f === 'top' ? 'sdLine' : null);
  line(-PX, -PZ, PX, -PZ); line(-PX, PZ, PX, PZ); line(-PX, -PZ, -PX, PZ); line(PX, -PZ, PX, PZ); line(0, -PZ, 0, PZ);
  for (const s of [-1, 1]) {
    const gx = s * PX;
    line(gx, -20.16, gx - s * 16.5, -20.16); line(gx, 20.16, gx - s * 16.5, 20.16); line(gx - s * 16.5, -20.16, gx - s * 16.5, 20.16);   // penalty box
    line(gx, -9.16, gx - s * 5.5, -9.16); line(gx, 9.16, gx - s * 5.5, 9.16); line(gx - s * 5.5, -9.16, gx - s * 5.5, 9.16);           // six-yard box
    K.xadd(G.disc(0.12), MAT.sdLine, K.mat4(gx - s * 11, 0.036, 0), false);                                                               // penalty spot
    const a = Math.acos(5.5 / 9.15);   // the "D": the part of the 9.15 m circle outside the box
    K.xadd(G.arc(9.15, s > 0 ? Math.PI - a : -a, s > 0 ? Math.PI + a : a), MAT.sdLine, K.mat4(gx - s * 11, 0.036, 0), false);
    for (const sz of [-1, 1]) K.xadd(G.arc(1, 0, Math.PI / 2), MAT.sdLine, K.mat4(gx, 0.036, sz * PZ, s > 0 ? (sz > 0 ? Math.PI / 2 : Math.PI) : (sz > 0 ? 0 : -Math.PI / 2)), false);   // corner arcs
  }
  K.xadd(G.ring(9.15), MAT.sdLine, K.mat4(0, 0.036, 0), false); K.xadd(G.disc(0.15), MAT.sdLine, K.mat4(0, 0.037, 0), false);
  // outside: the plaza (north), the car park (south), service roads east and west
  K.slab(-106, -106, 106, -70.6, 'walk', 'concrete');
  K.slab(-106, 58.8, 106, 106, 'sdAsphalt', 'asphalt');
  K.slab(76.1, -70.6, 106, 58.8, 'drive', 'asphalt'); K.slab(-106, -70.6, -76.1, 58.8, 'drive', 'asphalt');
  // the open corners between the stands: paved
  for (const sx of [-1, 1]) { K.slab(sx > 0 ? 50.3 : -76.1, -70.6, sx > 0 ? 76.1 : -50.3, -AZ, 'walk', 'concrete'); K.slab(sx > 0 ? 50.3 : -76.1, AZ, sx > 0 ? 76.1 : -50.3, 58.8, 'walk', 'concrete'); }

  // ---------------------------------------------------------------- the stands
  const pf = st => st.o[1] < 0 ? 'pz' : st.o[1] > 0 ? 'nz' : st.o[0] > 0 ? 'nx' : 'px';   // the face that looks at the pitch
  const bf = st => ({ pz: 'nz', nz: 'pz', nx: 'px', px: 'nx' })[pf(st)];
  const sbox = (st, u0, v0, u1, v1, y0, y1, mat, opts) => { const [x0, z0] = P(st, u0, v0), [x1, z1] = P(st, u1, v1); return box(x0, z0, x1, z1, y0, y1, mat, opts); };
  const srect = (st, u0, v0, u1, v1, o) => { const [x0, z0] = P(st, u0, v0), [x1, z1] = P(st, u1, v1); return rect(x0, z0, x1, z1, o); };
  const deck = (st, u0, v0, u1, v1, y) => { const d = srect(st, u0, v0, u1, v1, { y }); W.decks.push(d); return d; };
  const yawTo = st => Math.atan2(-st.o[0], -st.o[1]);        // a seat's yaw: facing the pitch
  const segs = (st, cut) => {   // the seat blocks between the aisles: [[u0, u1], ...]; cut: extra gaps [[u0, u1]]
    const g = st.aisles.map(a => [a - 0.6, a + 0.6]).concat(cut || []).sort((p, q) => p[0] - q[0]); const out = []; let u = -st.L;
    for (const [a, b] of g) { if (a > u) out.push([u, a]); u = Math.max(u, b); } if (u < st.L) out.push([u, st.L]); return out;
  };
  const seatMat = st => st.away ? MAT.sdSeatY : st.id === 'S' ? MAT.sdSeatC : st.id === 'W' ? MAT.sdSeatB : MAT.sdSeatC;
  const fans = [];   // [x, y, z, yaw, colourIndex] — sat in the seats on the calm evening
  const PLAYER_SEAT = [SPOTS.seatRow12.x, SPOTS.seatRow12.z];

  function lowerTier(st) {
    const n = st.rows, yaw = yawTo(st), tunnelCut = st.main ? [[-3.3, 3.3]] : [];
    // the front wall (a 1.1 m parapet you can hop), open at each aisle and the tunnel; the walkway behind it
    for (const [u0, u1] of segs(st, tunnelCut)) sbox(st, u0, 0, u1, 0.25, 0, 1.1, { top: 'sdBlock', side: 'sdBlock' }, { extra: { vault: true } });
    sbox(st, -st.L, 0.25, st.L, V0, 0, 0.04, { top: 'sdTread' }, { solid: false });
    // the rows: a concrete tread per row (risers facing the pitch), cut round the tunnel mouth on the Main Stand
    for (let i = 0; i < n; i++) {
      const v0 = rowV(i), v1 = v0 + D, y = rowY(i), yb = i ? rowY(i - 1) - 0.1 : 0;
      const cut = st.main && y - 0.3 < 3.25 ? [[-3.3, 3.3]] : [];
      const spans = cut.length ? [[-st.L, -3.3], [3.3, st.L]] : [[-st.L, st.L]];
      for (const [u0, u1] of spans) {
        sbox(st, u0, v0, u1, v1, yb, y, f => f === 'top' ? 'sdTread' : 'sdRiser', { surf: 'concrete', extra: { noWalk: true } });   // (with an underside: no see-through gaps from below)
        deck(st, u0, v0, u1, v1, y);
      }
      // aisle half-steps with yellow nosings
      for (const a of st.aisles) {
        if (cut.length && Math.abs(a) < 3.3) continue;
        if (i < n - 1) { sbox(st, a - 0.6, v0 + D / 2, a + 0.6, v1, y, y + RISE / 2, f => f === 'top' ? 'sdTread' : f === 'bot' ? null : 'sdRiser', { solid: false }); deck(st, a - 0.6, v0 + D / 2, a + 0.6, v1, y + RISE / 2); }
        sbox(st, a - 0.6, v0, a + 0.6, v0 + 0.05, y, y + 0.006, { top: 'sdNosing' }, { solid: false });
        if (i < n - 1) sbox(st, a - 0.6, v0 + D / 2, a + 0.6, v0 + D / 2 + 0.05, y + RISE / 2, y + RISE / 2 + 0.006, { top: 'sdNosing' }, { solid: false });
        // handrail posts down the aisle every 4 rows
        if (i % 4 === 1) { const [x, z] = P(st, a, v0 + 0.3); K.WX(G.cyl, MAT.chrome, x, y + 0.5, z, 0, 0.05, 1.0, 0.05); }
      }
      // seats (instanced), and who sits in them
      for (const [u0, u1] of segs(st, tunnelCut.length && y - 0.3 < 3.25 ? tunnelCut : [])) {
        for (let u = u0 + 0.3; u <= u1 - 0.25; u += 0.5) {
          const [x, z] = P(st, u, v0 + 0.42);
          K.inst(G.seat, seatMat(st), K.mat4(x, y, z, yaw), false);
          if (st.main && Math.abs(x - PLAYER_SEAT[0]) < 1.1 && Math.abs(z - PLAYER_SEAT[1]) < 0.4) continue;   // your seat and Ben's
          if (st.main && i > 11 && i <= 13 && Math.abs(x - PLAYER_SEAT[0]) < 1.6) continue;   // (the two rows behind you: nobody's head in the camera)
          if (R() < 0.82) fans.push([x, y, z, yaw, st.away ? (R() < 0.8 ? 2 : 3) : R() < 0.55 ? 0 : R() < 0.7 ? 1 : 3]);
        }
      }
    }
    // zombies don't climb into the stands: they stop at the front row (and under it nothing gets through)
    sbox(st, -st.L, V0, st.L, rowV(1), 0, 0.3, null, { extra: { zOnly: true, navSkip: false } });
    for (const [u0, u1] of st.main ? [[-st.L, -3.3], [3.3, st.L]] : [[-st.L, st.L]]) sbox(st, u0, rowV(1), u1, CONC, 0, 0.55, null, {});
    // the top gangway (and its handrail along the back of the last row)
    const gy = st.top;
    sbox(st, -st.L, st.gang, st.L, st.gang + 2, gy - 0.4, gy, f => f === 'top' ? 'sdTread' : f === 'bot' ? null : 'sdRiser', { extra: { noWalk: true } });
    deck(st, -st.L, st.gang, st.L, st.gang + 2, gy);
    // the stand's end walls: stepped with the rows, a parapet a metre above each; at ground level open where the
    // concourse comes out (and on the Main Stand, where the corridor does)
    for (const s of [-1, 1]) {
      const u0 = s * st.L, u1 = s * (st.L + 0.3);
      for (let i = 0; i < n; i++) {
        const v0 = rowV(i), y0 = v0 + D > CONC ? 3.15 : 0;
        sbox(st, u0, v0, u1, v0 + D, y0, rowY(i) + 1.0, { top: 'sdClad', side: 'sdClad', bot: 'sdClad' }, { surf: 'metal' });
      }
    }
  }
  // the concourse under a stand: floor, ceiling with strip lights, the wall to the void under the rows; the back
  // (façade) wall comes later with the gates
  const concHouses = [];
  function concourse(st, v0, v1, yC = 3.0) {
    const L = st.L;
    sbox(st, -L, v0, L, v1, 0, 0.015, { top: 'sdConc' }, { solid: false });   // (under the 3 cm floors of the rooms on it: no z-fighting)
    sbox(st, -L, v0, L, v1, yC, yC + 0.15, { bot: 'ceilTile' }, { extra: {} });
    sbox(st, -L, v0 - 0.25, L, v0, 0, yC, { [bf(st)]: 'sdBlock', top: 'sdBlock' }, {});
    for (let u = -L + 3; u < L - 1; u += 4) sbox(st, u - 0.6, (v0 + v1) / 2 - 0.08, u + 0.6, (v0 + v1) / 2 + 0.08, yC - 0.05, yC, { bot: 'sdStrip' }, { solid: false });
    // a "house" for the camera: under the ceiling counts as indoors, standing on the rows above does not
    const [ax, az] = P(st, -L, v0), [bx, bz] = P(st, L, v1);
    concHouses.push({ x0: Math.min(ax, bx), z0: Math.min(az, bz), x1: Math.max(ax, bx), z1: Math.max(az, bz), yTop: yC, name: st.name + ' concourse' });
  }

  // ---------------------------------------------------------------- a food kiosk / bar against a wall
  // (u0..u1 along the stand at the concourse's front wall; the counter faces the concourse)
  const kioskNames = [['PIES', 'HOT DOGS', '#7a1a1a'], ['BURGERS', 'FRIES', '#1a3a6a'], ['BAR', 'DRAUGHT ALE', '#2a2a2a'], ['HOT DRINKS', 'SNACKS', '#2a5a2a'], ['HALF-TIME', 'BAR', '#4a1a4a']];
  let kioskN = 0;
  function kiosk(st, u0, v0, depth = 3.2) {
    const u1 = u0 + 6, vc = v0 + depth, yaw = yawTo(st), [kn1, kn2, kcol] = kioskNames[kioskN++ % kioskNames.length];
    // side walls, the counter (with a lift-up flap gap at one end), the shutter box over it
    sbox(st, u0, v0, u0 + 0.2, vc, 0, 3.0, 'sdBlock'); sbox(st, u1 - 0.2, v0, u1, vc, 0, 3.0, 'sdBlock');
    sbox(st, u0 + 0.2, vc - 0.6, u1 - 1.1, vc, 0, 1.08, { top: 'counter', side: 'sdClad' }, { surf: 'metal' });
    sbox(st, u0 + 0.2, vc - 0.3, u1 - 0.2, vc, 2.35, 3.0, { side: 'sdBand', bot: 'darkMetal' }, { solid: false });
    { const [x, z] = P(st, (u0 + u1) / 2, vc + 0.02); sign([kn1, kn2], x, 2.68, z, yaw + Math.PI, 5.6, 0.62, kcol); }
    // behind the counter: a back counter with a fryer, a pie warmer, a drinks fridge, a till
    sbox(st, u0 + 0.2, v0 + 0.25, u1 - 0.2, v0 + 0.85, 0, 0.92, { top: 'counter', side: 'appliance' }, { surf: 'metal' });
    { const [x, z] = P(st, u0 + 1.2, v0 + 0.5); K.WX(G.box, MAT.chrome, x, 1.12, z, yaw, 0.7, 0.4, 0.5); K.WX(G.box, MAT.shopGlass, x + 0, 1.34, z, yaw, 0.68, 0.02, 0.48); }
    { const [x, z] = P(st, u1 - 1.0, v0 + 0.55); K.WX(G.box, MAT.appliance, x, 1.0, z, yaw, 0.7, 2.0, 0.6); const [gx, gz] = P(st, u1 - 1.0, v0 + 0.86); K.WX(G.box, MAT.shopGlass, gx, 1.0, gz, yaw, 0.62, 1.8, 0.02); }
    const [fx, fz] = P(st, u1 - 1.0, v0 + 1.0);
    K.container('fridge', fx, fz, 1.0, 'Drinks fridge', yaw);
    const [rx, rz] = P(st, u0 + 3, vc - 0.3); K.WX(G.box, MAT.darkMetal, rx, 1.18, rz, yaw, 0.36, 0.2, 0.3);
    K.container('register', rx, rz, 1.1, 'Till', yaw);
    const [bx2, bz2] = P(st, u0 + 1.4, v0 + 0.55); K.container(kioskN % 2 ? 'pantry' : 'kitchen', bx2, bz2, 0.9, kn1 === 'BAR' ? 'Behind the bar' : 'Kitchen shelves', yaw);
    // pumps/cups on the counter
    for (let k = 0; k < 6; k++) { const [x, z] = P(st, u0 + 0.6 + k * 0.6, vc - 0.3); K.inst(G.cup, MAT.white, K.mat4(x, 1.08, z, 0, 1, 1, 1)); }
    // the roller shutter: rolled up on the calm evening, half down after (in the chaos layer)
    const [cx, cz] = P(st, (u0 + u1) / 2, vc - 0.15);
    K.chaos(cx, cz, () => { sbox(st, u0 + 0.2, vc - 0.18, u1 - 1.1, vc - 0.12, 1.5, 2.35, { side: 'sdRoofTop' }, { solid: false }); });
  }
  // toilets: a block against the back wall with urinals, stalls and sinks (a real room: a door, the camera works)
  function toilets(st, uc, label = 'TOILETS') {
    const yaw = yawTo(st), [x, z] = P(st, uc, st.back - 3.1), alongX = st.a[0] !== 0;
    const w = 9, d = 5.4;
    const H = K.room(x, z, alongX ? w : d, alongX ? d : w, 0, { h: 2.9, mat: 'sdBlock', inMat: 'sdTile', floor: 'sdTile', roof: null, ceiling: true, home: false, name: label,
      doors: [{ side: alongX ? (st.o[1] < 0 ? 'n' : 's') : (st.o[0] > 0 ? 'w' : 'e'), at: -2.5, w: 1.0, col: 0x5a6a7a }] });
    H.yTop = () => 3.0;
    for (let k = 0; k < 5; k++) { const [ux, uz] = P(st, uc - 3.6 + k * 0.9, st.back - 0.72); K.inst(G.urinal, MAT.porcelain, K.mat4(ux, 0, uz, yaw)); }
    for (let k = 0; k < 3; k++) { const [ux, uz] = P(st, uc + 1.4 + k * 1.1, st.back - 0.95); K.inst(G.toilet, MAT.porcelain, K.mat4(ux, 0, uz, yaw));
      sbox(st, uc + 0.85 + k * 1.1, st.back - 2.0, uc + 0.9 + k * 1.1, st.back - 0.5, 0.15, 2.0, 'sdLocker', { surf: 'wood' }); }
    sbox(st, uc - 4.3, st.back - 5.6, uc - 1.0, st.back - 5.1, 0, 0.82, { top: 'counter', side: 'sdTile' });
    for (let k = 0; k < 4; k++) { const [ux, uz] = P(st, uc - 3.9 + k * 0.8, st.back - 5.35); K.inst(G.sink, MAT.porcelain, K.mat4(ux, 0.02, uz, yaw + Math.PI)); K.inst(G.tap, MAT.chrome, K.mat4(ux, 0, uz, yaw + Math.PI)); }
    const [sx, sz] = P(st, uc - 2.5, st.back - 5.8); sign(label, sx, 2.5, sz, yaw, 1.6, 0.4, '#1a4a7a');
    return H;
  }
  // a block of turnstiles in a gate opening (u0..u1 along the back wall at st.back): units every 1.2 m
  const gates = [];
  function turnstiles(st, u0, u1, label) {
    const yaw = yawTo(st) + Math.PI, n = Math.floor((u1 - u0) / 1.2);
    for (let k = 0; k < n; k++) {
      const u = u0 + 0.35 + k * 1.2; const [x, z] = P(st, u, st.back + 0.2);
      K.inst(G.turnstile, MAT.metal, K.mat4(x, 0, z, yaw + Math.PI / 2));
      sbox(st, u - 0.17, st.back - 0.15, u + 0.17, st.back + 0.55, 0, 1.0, null, { surf: 'metal' });   // (a little narrower than the cabinet: the 0.7 m lane between two was too tight to get through)
    }
    const [x, z] = P(st, (u0 + u1) / 2, st.back + 0.42); sign([label, 'TURNSTILES'], x, 2.72, z, yaw, 3.2, 0.62, '#0e2a4a');   // (under the canopy, over the lanes: the canopy hid a higher one)
    // after the outbreak: the steel shutters are down over every turnstile block (police orders)
    K.chaos(x, z, () => { sbox(st, u0, st.back + 0.42, u1, st.back + 0.52, 0, 3.0, { side: 'sdRoofTop' }, { surf: 'metal' }); });
    gates.push({ st: st.id, x, z });
  }
  // the back (façade) wall of a stand: cladding outside, block inside, a club band at the top, gaps for gates
  function facade(st, openings) {
    const L = st.L + 0.3, t = 0.4, yTop = st.roofY + 0.4;
    // openings: [u0, u1, yBottom, yTop] (a gate at the ground, a door up on the first floor)
    const ops = openings.slice().sort((p, q) => p[0] - q[0]); let u = -L;
    const fm = { px: 'sdClad', nx: 'sdClad', pz: 'sdClad', nz: 'sdClad', top: 'sdClad', [pf(st)]: 'sdBlock' };
    const fpiece = (a, b, y0, y1) => { if (b - a > 0.01 && y1 - y0 > 0.01) sbox(st, a, st.back, b, st.back + t, y0, y1, fm, { surf: 'metal' }); };
    for (const [a, b, ya, yb] of ops) { fpiece(u, a, 0, yTop - 1.2); fpiece(a, b, 0, ya); fpiece(a, b, yb, yTop - 1.2); u = b; }
    fpiece(u, L, 0, yTop - 1.2);
    // a band of dark glazing (the first floor of the Main Stand; high windows on the others), steel fins every 5 m
    const [g0, g1] = st.main ? [L1 + 0.5, L1 + 2.7] : [3.6, 5.6], out = st.back + t;
    let ug = -L + 0.6;
    for (const [a, b, ya, yb] of ops.concat([[L - 0.6, L, 0, 99]])) { if (yb > g0 && ya < g1) { if (a - 0.3 > ug) sbox(st, ug, out, a - 0.3, out + 0.04, g0, g1, { [bf(st)]: 'sdGlassBand' }, { solid: false }); ug = b + 0.3; } }
    for (let uf = -L + 2.5; uf < L - 1; uf += 5) {
      if (ops.some(([a, b]) => uf > a - 0.6 && uf < b + 0.6) || Math.abs(uf) < 8.6) continue;   // (none across the stand's name)
      const [x, z] = P(st, uf, out + 0.3); K.inst(G.box, MAT.sdSteel, K.mat4(x, (yTop - 1.2) / 2, z, Math.atan2(st.o[0], st.o[1]), 0.22, yTop - 1.2, 0.6));
    }
    // a canopy over each ground-level gate
    for (const [a, b, ya] of ops) if (ya < 0.5) { const [cx, cz] = P(st, (a + b) / 2, out + 1.0); const ax = Math.abs(st.a[0]) > 0.5; K.box(cx, 3.35, cz, ax ? (b - a) / 2 + 0.8 : 1.0, 3.55, ax ? 1.0 : (b - a) / 2 + 0.8, 0, f => f === 'top' ? 'sdRoofTop' : f === 'bot' ? 'sdRoofUnder' : 'sdBand'); }
    sbox(st, -L, st.back - 0.02, L, st.back + t + 0.04, yTop - 1.2, yTop, { ...fm, [bf(st)]: 'sdBand' }, { surf: 'metal' });
    // the stand's name in big letters on the outside
    const [x, z] = P(st, 0, st.back + t + 0.03); sign(st.name, x, yTop - 3.2, z, yawTo(st) + Math.PI, 16, 1.9, HOME.col, '#ffffff');
  }
  // the roof: a deck of steel over the stand on cantilever trusses, a fascia with the club colours
  function roof(st, vFront) {
    const L = st.L + 0.8, y = st.roofY, vb = st.back + 0.4;
    sbox(st, -L, vFront, L, vb, y - 0.3, y, { top: 'sdRoofTop', bot: 'sdRoofUnder', side: 'sdBand' }, { solid: false });
    for (let v = vFront + 1.2; v < vb - 0.6; v += 2.6) { const a = P(st, -L + 0.2, v), b = P(st, L - 0.2, v); K.wbeam([a[0], y - 0.42, a[1]], [b[0], y - 0.42, b[1]], 0.1, 0.24, MAT.sdSteel, false); }   // purlins under the deck
    for (let u = -st.L; u <= st.L + 0.01; u += 10) {
      const a = P(st, u, vb), b = P(st, u, vFront + 0.5);
      K.wbeam([a[0], y, a[1]], [a[0], y + 4.2, a[1]], 0.35, 0.35, MAT.sdSteel);
      K.wbeam([a[0], y + 4.2, a[1]], [b[0], y + 0.2, b[1]], 0.3, 0.45, MAT.sdSteel);
      K.wbeam([a[0], y + 0.2, a[1]], [b[0], y + 0.2, b[1]], 0.22, 0.3, MAT.sdSteel);
      for (let k = 1; k < 5; k++) { const t2 = k / 5, m = P(st, u, vb + (vFront + 0.5 - vb) * t2); K.wbeam([m[0], y + 0.2, m[1]], [m[0], y + 4.2 - 4.0 * t2, m[1]], 0.12, 0.12, MAT.sdSteel, false); }
    }
  }
  // stairs up the outside of a stand's end, from the corner to the top gangway, with a landing beside it
  function endStairs(st, s) {
    const u0 = s * (st.L + 0.3), u1 = s * (st.L + 2.9), uc = (u0 + u1) / 2;
    const va = st.main ? 2.2 : 4.0, vb = st.gang, len = vb - va, top = st.top;
    const [cx, cz] = P(st, uc, (va + vb) / 2);
    // K.stairs rises toward its local +z: aim local +z along the stand's o (away from the pitch). Open treads, so
    // the concourse can come out underneath where it's high enough
    const yaw = Math.atan2(st.o[0], st.o[1]);
    K.stairs(cx, cz, yaw, 2.4, len, 0, top, 'sdTread', { open: true });
    const hAt = v => top * (v - va) / len, NS = 8;
    for (let j = 0; j < NS; j++) {
      const s0 = va + j * len / NS, s1 = va + (j + 1) * len / NS, lo = hAt(s0), hi = hAt(s1);
      if (lo < 2.3 && lo - 0.3 > 0.3) sbox(st, u0, s0, u1, s1, 0, lo - 0.3, null, {});                         // too low to walk under
      sbox(st, u1, s0, u1 + s * 0.1, s1, Math.max(0, lo - 0.3), hi + 1.05, null, { surf: 'metal' });          // the outer rail
    }
    // stringers under the treads
    for (const uu of [u0 + s * 0.15, u1 - s * 0.15]) { const a = P(st, uu, va), b = P(st, uu, vb); K.wbeam([a[0], -0.1, a[1]], [b[0], top - 0.2, b[1]], 0.14, 0.32, MAT.sdSteel); }
    // the landing beside the gangway, on two posts
    sbox(st, s * st.L, vb, u1, st.gang + 2, top - 0.3, top, { top: 'sdTread', side: 'sdRiser', bot: 'sdRiser' }, { extra: { noWalk: true } });
    deck(st, s * st.L, vb, u1, st.gang + 2, top);
    for (const v of [vb + 0.3, st.gang + 1.7]) { const [px, pz] = P(st, u1 - s * 0.2, v); K.WX(G.box, MAT.sdSteel, px, (top - 0.3) / 2, pz, 0, 0.25, top - 0.3, 0.25); K.solid(px, pz, 0.14, 0.14, 0, top - 0.3, 'metal'); }
    const r0 = P(st, u1 + s * 0.05, vb), r1 = P(st, u1 + s * 0.05, st.gang + 2);
    K.wbeam([r0[0], top + 1.0, r0[1]], [r1[0], top + 1.0, r1[1]], 0.05, 0.05, MAT.metal, false);
    sbox(st, u1, vb, u1 + s * 0.08, st.gang + 2, top, top + 1.05, null, { surf: 'metal' });
  }

  // ================================================================ build the four stands
  for (const st of Object.values(STANDS)) {
    { const [ax, az] = P(st, -st.L - 3, 0), [bx, bz] = P(st, st.L + 3, st.back + 0.5); K.region(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), 'paved', 'concrete'); }
    lowerTier(st);
    roof(st, st.main ? 1.0 : 1.2);
    for (const s of [-1, 1]) endStairs(st, s);
    if (!st.main) {
      concourse(st, CONC, st.back);
      // gates: a turnstile block in the middle (and two more on the long South Stand)
      const g = st.L === 50 ? [[-28, -22, 0, 3.0], [-3, 3, 0, 3.0], [22, 28, 0, 3.0]] : [[-3, 3, 0, 3.0]];
      facade(st, g);
      for (const [a, b] of g) turnstiles(st, a, b, st.id === 'S' ? 'SOUTH GATE ' + (a < -10 ? 'G' : a > 10 ? 'J' : 'H') : st.id === 'E' ? 'GATE E — AWAY FANS' : 'GATE W');
      // kiosks along the front wall, toilets against the back
      const ks = st.L === 50 ? [-44, -26, -8, 10, 36] : [-26, 14];
      for (const u of ks) kiosk(st, u, CONC);
      toilets(st, st.L === 50 ? -14 : -12, 'TOILETS');
      // bins along the concourse, a few benches
      for (const u of st.L === 50 ? [-34, -16, 2, 26, 46] : [-18, 4, 26]) { const [x, z] = P(st, u, st.back - 0.7); K.trashBin(x, z, yawTo(st)); }
    }
  }

  // ================================================================ the Main Stand: upper tier, boxes, dressing rooms
  const N = MAIN;
  // ---- the ground floor behind/under the lower tier ----
  // tunnel: walls stepping up with the rows, a roof slab over its mouth, a gate halfway
  for (const s of [-1, 1]) {
    for (let i = 0; i < 8; i++) { const v0 = rowV(i); sbox(N, s * 2.6, v0, s * 3.3, v0 + D, 0, Math.max(3.25, rowY(i) + 1.0), { top: 'sdClad', side: 'sdBlock' }, {}); }
    sbox(N, s * 2.6, 0.25, s * 3.3, V0, 0, 3.25, { top: 'sdClad', side: 'sdBlock' }, {});
  }
  sbox(N, -3.3, 0.25, 3.3, CONC, 2.95, 3.25, { top: 'sdTread', bot: 'ceilTile', side: 'sdBlock' }, { extra: {} });
  deck(N, -3.3, 0.25, 3.3, CONC, 3.25);
  sbox(N, -2.6, CONC, 2.6, 15, 2.8, 2.95, { bot: 'ceilTile' }, {});
  sbox(N, -2.6, 0.25, 2.6, 15, 0, 0.03, { top: 'sdRubber' }, { solid: false });
  for (let v = 1.5; v < 15; v += 2.5) sbox(N, -0.5, v - 0.08, 0.5, v + 0.08, 2.75, 2.8, { bot: 'sdStrip' }, { solid: false });
  { const [x, z] = P(N, 0, 0.2); sign(['THIS IS', 'HARBOR CITY'], x, 2.55, z, 0, 4.6, 0.7, HOME.col); }   // over the tunnel mouth, pitch side
  // the tunnel gate: a pair of steel doors
  { const [x0, z0] = P(N, -2.6, 7.5), [x1, z1] = P(N, 2.6, 7.5);
    const r = K.wall(x0, z0, x1, z1, { h: 2.95, t: 0.2, mat: 'darkMetal', inMat: 'darkMetal', openings: [{ at: -1.25, w: 2.3, door: true, dir: -1, col: 0x3a3e44, hp: 260 }, { at: 1.25, w: 2.3, door: true, dir: 1, col: 0x3a3e44, hp: 260 }] }); }
  // the extendable tunnel on the run-off (the players walk out under it): a white half-tube with ribs
  { const len = 5.4, [x, z] = P(N, 0, -2.4);
    K.xadd(new THREE.CylinderGeometry(1.95, 1.95, len, 20, 1, true, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2), MAT.sdCanopy, K.mat4(x, 0.25, z, 0, 1, 1, 1, 0, 0));
    for (const s of [-1, 1]) K.box(s * 1.95, 0, z, 0.02, 0.27, len / 2, 0, () => 'white');
    for (let k = 0; k <= 4; k++) { const [rx, rz] = P(N, 0, -5.1 + k * len / 4); K.xadd(new THREE.TorusGeometry(1.97, 0.05, 6, 20, Math.PI), MAT.sdSteel, K.mat4(rx, 0.25, rz, 0)); }
    for (const s of [-1, 1]) sbox(N, s * 1.9, -5.1, s * 2.0, 0.25, 0, 2.2, null, { surf: 'metal' });
  }
  // ---- rooms under the stand (v CONC..15): grounds store, physio, home, away, referee, kit room ----
  const roomsN = [
    { id: 'grounds', u0: -50, u1: -32, name: 'GROUNDS STORE', inMat: 'sdBlock', floor: 'sdConc' },
    { id: 'physio', u0: -32, u1: -24, name: 'PHYSIO', inMat: 'sdTile', floor: 'sdTile' },
    { id: 'home', u0: -24, u1: -2.6, name: 'HOME DRESSING ROOM', inMat: 'paint1', floor: 'sdRubber', toTunnel: 'e' },
    { id: 'away', u0: 2.6, u1: 24, name: 'AWAY DRESSING ROOM', inMat: 'paint3', floor: 'sdRubber', toTunnel: 'w' },
    { id: 'ref', u0: 24, u1: 32, name: 'MATCH OFFICIALS', inMat: 'paint4', floor: 'floorCarpet2' },
    { id: 'kit', u0: 32, u1: 50, name: 'KIT ROOM', inMat: 'sdBlock', floor: 'sdConc' },
  ];
  const RN = {};
  for (const r of roomsN) {
    const [x0, z0] = P(N, r.u0, CONC), [x1, z1] = P(N, r.u1, 15), w = Math.abs(x1 - x0), d = Math.abs(z1 - z0);
    const doors = [{ side: 's', at: r.id === 'home' ? -6 : r.id === 'away' ? 6 : 0, w: 1.0, col: r.id === 'home' ? 0x7a1a24 : r.id === 'away' ? 0xc8a020 : 0x5a6a7a }];
    if (r.toTunnel) doors.push({ side: r.toTunnel, at: 0, w: 1.0, col: 0x3a3e44 });
    const H = K.room((x0 + x1) / 2, (z0 + z1) / 2, w, d, 0, { h: 3.2, t: 0.25, mat: 'sdBlock', inMat: r.inMat, floor: r.floor, roof: null, ceiling: true, ceilMat: 'ceilTile', home: false, name: r.name, doors });
    H.yTop = () => 3.3;
    RN[r.id] = { ...r, H, x: (x0 + x1) / 2, z: (z0 + z1) / 2, w, d };
    const [sx, sz] = P(N, (r.u0 + r.u1) / 2 + (r.id === 'home' ? -6 : r.id === 'away' ? 6 : 0) + 1.3, 15.14);
    sign(r.name, sx, 2.45, sz, Math.PI, 1.9, 0.32, '#1a1a1a');
  }
  // dressing rooms: benches round the walls, wooden lockers with pegs, a tactics board, a massage table, showers
  for (const id of ['home', 'away']) {
    const r = RN[id], u0 = r.u0 + 0.25, u1 = r.u1 - 0.25, colM = id === 'home' ? MAT.sdSeatC : MAT.sdSeatY;
    sbox(N, u0, CONC + 0.25, u1, CONC + 0.75, 0, 0.45, { top: 'darkWood', side: 'darkWood' }, { surf: 'wood', extra: { vault: true } });
    sbox(N, u0, CONC + 0.2, u1, CONC + 0.35, 0.45, 2.2, 'sdLocker', { surf: 'wood' });
    for (let u = u0 + 0.6; u < u1 - 0.4; u += 0.9) {   // a shirt on each peg, boots under the bench
      const [x, z] = P(N, u, CONC + 0.45); K.inst(G.box, colM, K.mat4(x, 1.55, z, 0, 0.5, 0.62, 0.06));
      K.inst(G.box, MAT.black, K.mat4(x - 0.08, 0.05, z + 0.25 * (N.o[1] < 0 ? -1 : 1), 0, 0.1, 0.1, 0.28));
    }
    for (let k = 0; k < 3; k++) { const [x, z] = P(N, u0 + 3 + k * 6, CONC + 0.5); K.container(k === 1 ? 'dresser' : 'closet', x, z, 1.2, 'Player\'s locker', 0); }
    const [tx, tz] = P(N, (u0 + u1) / 2 + (id === 'home' ? 4 : -4), 14.6); K.WX(G.box, MAT.white, tx, 1.5, tz + 0.03, 0, 2.4, 1.2, 0.04);   // tactics board (on the corridor-side wall)
    K.WX(G.box, MAT.darkMetal, tx, 1.5, tz, 0, 2.5, 1.3, 0.02);
    const [mx, mz] = P(N, (u0 + u1) / 2, 11.6); K.block(mx, 0, mz, 0.95, 0.8, 0.35, 0, f => f === 'top' ? 'fabric4' : 'metal', 'metal');   // massage table
    // showers at the far end
    const ush = id === 'home' ? u0 : u1 - 3.6;
    sbox(N, ush, CONC + 1.2, ush + 3.6, CONC + 1.35, 0, 2.2, 'sdTile', {});
    for (let k = 0; k < 3; k++) { const [x, z] = P(N, ush + 0.6 + k * 1.2, CONC + 3.2); K.WX(G.cyl, MAT.chrome, x, 2.2, z, 0, 0.18, 0.05, 0.18); }
  }
  { const r = RN.physio; const [x, z] = P(N, -28, 11.6); K.block(x, 0, z, 0.35, 0.8, 0.95, 0, f => f === 'top' ? 'fabric4' : 'metal', 'metal');
    const [cx, cz] = P(N, -30.5, 14.5); K.block(cx, 0, cz, 0.9, 1.9, 0.25, 0, 'cabinet', 'wood'); K.container('medicine', cx, cz, 1.2, 'Medical cabinet', 0);
    const [ix, iz] = P(N, -26, 9.5); K.block(ix, 0, iz, 0.9, 0.8, 0.55, 0, f => f === 'top' ? 'darkMetal' : 'porcelain', 'metal');   // the ice bath
  }
  { const [x, z] = P(N, 28, 14.3); K.block(x, 0, z, 1.0, 0.76, 0.4, 0, f => f === 'top' ? 'darkWood' : 'cabinet', 'wood'); K.container('cabinet', x, z, 0.8, 'Referee\'s desk', 0);
    const [lx, lz] = P(N, 30.8, 10); K.block(lx, 0, lz, 0.3, 2.0, 1.2, 0, 'sdLocker', 'wood'); K.container('closet', lx, lz, 1.2, 'Officials\' lockers', 0);
  }
  // the grounds store: a ride-on mower, line marker, seed sacks, shelving, the red key cabinet (THE floodlight key)
  let keyC = null;
  { const [mx, mz] = P(N, -45, 11); K.block(mx, 0, mz, 0.7, 1.0, 1.1, 0, f => f === 'top' ? 'darkMetal' : 'greenPaint', 'metal');
    K.WX(G.cyl, MAT.rubber, mx - 0.72, 0.3, mz - 0.6, 0, 0.6, 0.25, 0.6, 0, Math.PI / 2); K.WX(G.cyl, MAT.rubber, mx + 0.72, 0.3, mz - 0.6, 0, 0.6, 0.25, 0.6, 0, Math.PI / 2);
    const [sx, sz] = P(N, -47.3, 14.45); K.block(sx, 0, sz, 2.2, 2.2, 0.3, 0, 'shelfMetal', 'metal'); K.container('garage', sx, sz, 1.3, 'Tool shelves', 0);
    const [wx, wz] = P(N, -36, 9.2); K.block(wx, 0, wz, 1.6, 0.9, 0.4, 0, f => f === 'top' ? 'plank' : 'darkWood', 'wood'); K.container('shed', wx, wz, 0.95, 'Groundsman\'s workbench', 0);
    const [kx, kz] = P(N, -33.2, 12.5); K.WX(G.box, MAT.redPaint, kx, 1.5, kz, 0, 0.12, 0.5, 0.4);
    keyC = K.container('cabinet', kx, kz, 1.5, 'Red key cabinet (the floodlight key)', 0, null, ITEMS.floodKey ? { floodKey: true, fixed: [['floodKey', 1]] } : { floodKey: true });
    for (let k = 0; k < 5; k++) { const [bx2, bz2] = P(N, -48 + k * 0.7, 14.3); K.inst(G.box, MAT.fabric3, K.mat4(bx2, 0.3, bz2, 0.2 * k, 0.5, 0.6, 0.35)); }
    sign(['FLOODLIGHT KEY', 'IN RED CABINET'], kx + 0.07, 2.15, kz, -Math.PI / 2, 1.1, 0.34, '#8a1010');
  }
  // ---- the staff corridor (v 15..18) and the concourse (v 18..30) on the ground floor ----
  sbox(N, -50, 15, 50, 18, 0, 0.03, { top: 'sdRubber' }, { solid: false });
  for (let u = -46; u < 48; u += 5) sbox(N, u - 0.6, 16.4, u + 0.6, 16.6, 3.15, 3.2, { bot: 'sdStrip' }, { solid: false });
  sbox(N, -50, 15, 50, 18, 3.2, 3.3, { bot: 'ceilTile' }, {});   // a dropped ceiling in the corridor
  { const [x0, z0] = P(N, -50, 18), [x1, z1] = P(N, 50, 18);
    K.wall(x0, z0, x1, z1, { h: 5.4, t: 0.25, mat: 'sdBlock', inMat: 'sdBlock', openings: [{ at: -24.5, w: 1.0, door: true, dir: 1, col: 0x5a6a7a }, { at: 23, w: 1.0, door: true, dir: 1, col: 0x5a6a7a }, { at: -2.5, w: 1.6 }, { at: 2.5, w: 1.6 }] }); }
  for (const s of [-1, 1]) { const [x0, z0] = P(N, s * 50.15, 15), [x1, z1] = P(N, s * 50.15, 18); K.wall(x0, z0, x1, z1, { h: 3.3, t: 0.3, mat: 'sdClad', inMat: 'sdBlock', openings: [{ at: 0, w: 1.0, door: true, dir: s, col: 0x3a4a3a }] }); }
  // concourse: ceiling at 5.4 (the first floor's underside), floor, lights, the lobby in the middle
  sbox(N, -50, 18, 50, 30, 0, 0.015, { top: 'sdConc' }, { solid: false });   // (first aid, the shop and the toilets have their own 3 cm floors on top)
  for (let u = -47; u < 48; u += 4) sbox(N, u - 0.6, 23.92, u + 0.6, 24.08, 5.35, 5.4, { bot: 'sdStrip' }, { solid: false });
  // first-floor slab over the corridor & concourse; it's also what you walk on up there
  sbox(N, -50, 15, 50, 30, L1 - 0.42, L1, f => f === 'bot' ? 'ceilTile' : f === 'top' ? null : 'sdBlock', { extra: { noWalk: true } });
  deck(N, -50, 13, 50, 30, L1);
  // lobby (main reception) between two glass partitions
  for (const s of [-1, 1]) { const [x0, z0] = P(N, s * 6, 18.1), [x1, z1] = P(N, s * 6, 29.9); K.wall(x0, z0, x1, z1, { h: 5.4, t: 0.2, mat: 'sdBlock', inMat: 'sdBlock', openings: [{ at: 0, w: 1.0, door: true, dir: 1, glassDoor: true }, { at: -3.5, w: 2.4, glass: true, sill: 0.9, top: 2.6 }, { at: 3.5, w: 2.4, glass: true, sill: 0.9, top: 2.6 }] }); }
  { const [x, z] = P(N, 0, 23); K.block(x, 0, z, 2.4, 1.1, 0.6, 0, f => f === 'top' ? 'counter' : 'darkWood', 'wood'); K.container('cabinet', x, z, 1.1, 'Reception desk', 0);
    const [cx, cz] = P(N, 0, 18.12); K.xadd(G.plane, std({ map: T.crest, transparent: true, alphaTest: 0.1, roughness: 0.5 }), K.mat4(cx, 3.4, cz, Math.PI, 2.6, 2.6, 1), false);
    for (const s of [-1, 1]) { const [px, pz] = P(N, s * 3.5, 27); K.inst(G.bench, MAT.darkWood, K.mat4(px, 0, pz, Math.PI / 2, 2, 1, 1)); K.solid(px, pz, 0.22, 1.0, 0, 0.5, 'wood', 0, { vault: true }); }
  }
  // first aid room (west end of the concourse) and the club shop (east end)
  { const [x0, z0] = P(N, -50, 22), [x1, z1] = P(N, -40, 30);
    const H = K.room((x0 + x1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(z1 - z0), 0, { h: 3.0, mat: 'sdBlock', inMat: 'paint1', floor: 'sdTile', roof: null, ceiling: true, home: false, name: 'FIRST AID', doors: [{ side: 'n', at: 2.5, w: 1.1, col: 0x2a7a3a }] });
    H.yTop = () => 3.1;
    const [bx2, bz2] = P(N, -47.5, 27); K.block(bx2, 0, bz2, 0.4, 0.7, 1.0, 0, f => f === 'top' ? 'mattress' : 'metal', 'metal');
    const [mx, mz] = P(N, -44, 29.5); K.block(mx, 0, mz, 1.0, 1.9, 0.25, 0, 'white', 'metal'); K.container('medicine', mx, mz, 1.2, 'First aid supplies', 0);
    const [sx, sz] = P(N, -45, 21.85); sign(['FIRST AID'], sx, 2.6, sz, 0, 1.6, 0.45, '#1a7a3a');
  }
  { const [x0, z0] = P(N, 38, 21), [x1, z1] = P(N, 50, 30);
    const H = K.room((x0 + x1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(z1 - z0), 0, { h: 3.0, mat: 'sdBlock', inMat: 'paint0', floor: 'floorTile', roof: null, ceiling: true, home: false, name: 'CLUB SHOP', doors: [{ side: 'n', at: -3, w: 1.6, glassDoor: true }], windows: [{ side: 'n', at: 2.5, w: 4, sill: 0.4, top: 2.6 }] });
    H.yTop = () => 3.1;
    for (let k = 0; k < 3; k++) { const [x, z] = P(N, 41 + k * 3, 26); K.block(x, 0, z, 1.1, 1.6, 0.35, 0, 'shelfMetal', 'metal'); K.container('store', x, z, 1.0, 'Shop shelves', 0);
      for (let j = 0; j < 6; j++) K.inst(G.box, j % 2 ? MAT.sdSeatC : MAT.sdSeatB, K.mat4(x - 0.9 + j * 0.36, 1.0 + (j % 3) * 0.3, z, 0, 0.3, 0.04, 0.4)); }
    const [rx, rz] = P(N, 47, 22.5); K.block(rx, 0, rz, 1.2, 1.0, 0.45, 0, f => f === 'top' ? 'counter' : 'cabinet', 'wood'); K.container('register', rx, rz, 1.0, 'Shop till', 0);
    const [sx, sz] = P(N, 44, 20.85); sign(['CLUB SHOP'], sx, 2.6, sz, 0, 2.2, 0.5, HOME.col);
  }
  for (const u of [-34, -20, 14, 26]) kiosk(N, u, 18.25, 3.2);
  toilets(N, -11.5, 'TOILETS');
  for (const u of [-38, -10, 10, 33]) { const [x, z] = P(N, u, 29.3); K.trashBin(x, z, Math.PI); }
  concHouses.push({ x0: -50, z0: -70, x1: 50, z1: -55, yTop: 9.2, yUnder: 8.8, name: 'Main Stand' });
  concHouses.push({ x0: -2.6, z0: -55, x1: 2.6, z1: -40.25, yTop: 2.95, name: 'the tunnel' });
  // back façade with the gates: two turnstile blocks, the glass doors of main reception
  facade(N, [[-31, -25, 0, 3.0], [-1.6, 1.6, 0, 2.6], [25, 31, 0, 3.0], [48.1, 49.2, L1, L1 + 2.2]]);
  turnstiles(N, -31, -25, 'GATE A'); turnstiles(N, 25, 31, 'GATE C');
  { const [x0, z0] = P(N, -1.6, 30.2), [x1, z1] = P(N, 1.6, 30.2); K.wall(x0, z0, x1, z1, { h: 2.6, t: 0.12, mat: 'alu', openings: [{ at: -0.8, w: 1.5, door: true, dir: 1, glassDoor: true }, { at: 0.8, w: 1.5, door: true, dir: -1, glassDoor: true }] });
    const [sx, sz] = P(N, 0, 30.45); sign(['MAIN RECEPTION'], sx, 2.98, sz, Math.PI, 3.6, 0.5, '#1a1a1a'); }

  // ---- the first floor (y = L1): executive boxes and the press box, a corridor, lounge, control room, switch room ----
  const up = (st, u0, v0, u1, v1, h, mat, opts) => sbox(st, u0, v0, u1, v1, L1, L1 + h, mat, opts);
  sbox(N, -50, 15, 50, 19, L1, L1 + 0.02, { top: 'floorCarpet2' }, { solid: false });
  sbox(N, -50, 21, -12, 30, L1, L1 + 0.02, { top: 'floorWood' }, { solid: false });
  sbox(N, -50, 19, 50, 21, L1, L1 + 0.02, { top: 'sdRubber' }, { solid: false });
  sbox(N, -12, 21, 8, 30, L1, L1 + 0.02, { top: 'floorCarpet2' }, { solid: false });
  sbox(N, 8, 21, 32, 30, L1, L1 + 0.02, { top: 'sdTile' }, { solid: false });
  sbox(N, 32, 21, 38, 30, L1, L1 + 0.02, { top: 'floorCarpet' }, { solid: false });
  sbox(N, 38, 21, 50, 30.4, L1, L1 + 0.02, { top: 'sdConc' }, { solid: false });
  const fwall = (u0, v0, u1, v1, ops, mat = 'sdBlock', inMat = 'paint0', h = 2.98) => { const [x0, z0] = P(N, u0, v0), [x1, z1] = P(N, u1, v1); const r = K.wall(x0, z0, x1, z1, { y0: L1, h, t: 0.2, mat, inMat, openings: ops }); for (const D2 of r.doors) liftDoor(D2, L1); return r; };
  // a door hung on the first floor: the leaf and both its boxes up at y
  function liftDoor(D2, y) { D2.pivot.position.y = y; for (const b of [D2.box, D2.obox]) { b.y0 += y; b.y1 += y; } D2.y = y; }
  // the glass front of the boxes, open at each box's balcony door
  { const ops = []; for (let u = -45; u <= 45; u += 10) ops.push({ at: u - 1.3, w: 6.2, glass: true, sill: 0.25, top: 2.75, glassMat: 'shopGlass' }, { at: u + 2.4, w: 1.0 }, { at: u + 3.9, w: 1.6, glass: true, sill: 0.25, top: 2.75, glassMat: 'shopGlass' }); fwall(-50, 15, 50, 15, ops, 'sdClad', 'paint0'); }   // (the boxes' fronts: glass wall to wall, a balcony door in each)
  for (let u = -40; u <= 40; u += 10) if (Math.abs(u) > 10) fwall(u, 15, u, 19, []);
  fwall(-8, 15, -8, 19, []); fwall(8, 15, 8, 19, []);
  { const ops = []; for (let u = -45; u <= 45; u += 10) if (Math.abs(u) > 6) ops.push({ at: u + 3, w: 0.95, door: true, dir: -1, col: 0x6a4a32 }); ops.push({ at: 0, w: 0.95, door: true, dir: -1, col: 0x2a3a4a }); fwall(-50, 19, 50, 19, ops); }   // (they open into the boxes, not across the corridor)
  fwall(-50, 21, 50, 21, [{ at: -31, w: 1.6 }, { at: -2, w: 0.95, door: true, dir: 1, col: 0x2a3a4a }, { at: 20, w: 0.95, door: true, dir: 1 }, { at: 44, w: 0.95, door: true, dir: 1, col: 0x8a1010, hp: 300 }]);
  fwall(-12, 21, -12, 30, []); fwall(8, 21, 8, 30, []); fwall(32, 21, 32, 30, []); fwall(38, 21, 38, 30, []);
  // the ceiling of the first floor (the upper tier sits on it)
  sbox(N, -50, 15, 50, 30, L1 + 2.98, L1 + 3.2, { bot: 'ceilTile' }, {});
  for (let u = -47; u < 48; u += 5) for (const v of [17, 20, 25.5]) sbox(N, u - 0.5, v - 0.08, u + 0.5, v + 0.08, L1 + 2.93, L1 + 2.98, { bot: 'sdStrip' }, { solid: false });
  // a searchable spot on the first floor: y given as a height (L1 + …), stored relative to the floor (main.js only
  // offers a prompt for a container on the floor you're standing on)
  const cUp = (kind, x, z, y, label, yaw = 0, house = null, extra = {}) => K.container(kind, x, z, y - L1, label, yaw, house, { ...extra, floorY: L1 });
  // in the boxes: a table and chairs each; the press box: desks, monitors, the commentators' notes
  for (let u = -45; u <= 45; u += 10) {
    if (Math.abs(u) < 6) continue;
    const [x, z] = P(N, u, 17.3); K.block(x, L1, z, 0.9, L1 + 0.74, 0.5, 0, f => f === 'top' ? 'darkWood' : 'black', 'wood', true, { vault: true });
    for (const dx of [-0.6, 0, 0.6]) K.inst(G.chair, MAT.black, K.mat4(x + dx, L1, z - 0.8, 0));
    // balcony seats in front of the glass
    for (let k = 0; k < 8; k++) { const [bx2, bz2] = P(N, u - 4.3 + k * 0.62, 14.3); K.inst(G.seat, MAT.sdSeatG, K.mat4(bx2, L1, bz2, 0)); }
  }
  { for (let k = 0; k < 6; k++) { const [x, z] = P(N, -6.5 + k * 2.6, 15.6); K.block(x, L1, z, 1.2, L1 + 0.75, 0.35, 0, f => f === 'top' ? 'counter' : 'black', 'wood', true, { vault: true }); K.inst(G.monitor, MAT.screen, K.mat4(x, L1 + 0.75, z + 0.1 * (N.o[1] < 0 ? -1 : 1), Math.PI)); K.inst(G.chair, MAT.black, K.mat4(x, L1, z - 0.9, Math.PI)); }
    const [x, z] = P(N, 0, 15.6); cUp('cabinet', x, z, L1 + 0.8, 'Commentary desk', 0);
    const [sx, sz] = P(N, 0, 14.85); sign(['PRESS'], sx, L1 + 2.75, sz, 0, 1.6, 0.36, '#1a1a1a'); }
  // the hospitality lounge: a long bar, tables
  { const [x, z] = P(N, -31, 29.2); K.block(x, L1, z, 9, L1 + 1.08, 0.4, 0, f => f === 'top' ? 'counter' : 'darkWood', 'wood'); cUp('cooler', x - 3, z, L1 + 1.0, 'Behind the bar', 0); cUp('kitchen2', x + 4, z, L1 + 1.0, 'Bar fridge', 0);
    for (let k = 0; k < 6; k++) { const [tx, tz] = P(N, -46 + k * 6, 24.5); K.block(tx, L1, tz, 0.6, L1 + 0.74, 0.6, 0, f => f === 'top' ? 'white' : 'black', 'wood', true, { vault: true }); for (const a of [0, 1.57, 3.14, 4.71]) K.inst(G.chair, MAT.darkWood, K.mat4(tx + Math.sin(a) * 0.95, L1, tz + Math.cos(a) * 0.95, a + Math.PI)); } }
  // the police control room: a wall of CCTV monitors over the pitch-side window, desks, the radio
  { for (let k = 0; k < 5; k++) { const [x, z] = P(N, -10 + k * 3.4, 29.3); K.block(x, L1, z, 1.4, L1 + 0.75, 0.4, 0, f => f === 'top' ? 'counter' : 'black', 'wood'); for (let j = 0; j < 2; j++) K.inst(G.monitor, MAT.screen, K.mat4(x - 0.4 + j * 0.8, L1 + 0.75, z, Math.PI)); }
    const [x, z] = P(N, -2, 29.3); cUp('police', x, z, L1 + 0.8, 'Police equipment locker', 0, null, { fixed: [['ammo9', 12]] });
    const [cx, cz] = P(N, -8, 22); cUp('cabinet', cx, cz, L1 + 0.9, 'Briefing table', 0);
    K.block(cx, L1, cz, 1.6, L1 + 0.74, 0.7, 0, f => f === 'top' ? 'white' : 'black', 'wood', true, { vault: true }); }
  // the kitchen, the office
  { const [x, z] = P(N, 20, 29.4); K.block(x, L1, z, 6, L1 + 0.92, 0.35, 0, f => f === 'top' ? 'counter' : 'appliance', 'metal'); cUp('kitchen', x - 3, z, L1 + 0.95, 'Catering kitchen', 0); cUp('fridge', x + 4, z, L1 + 1.0, 'Walk-in fridge', 0);
    const [ox, oz] = P(N, 35, 27); K.block(ox, L1, oz, 1.0, L1 + 0.75, 0.5, 0, f => f === 'top' ? 'darkWood' : 'cabinet', 'wood'); cUp('cabinet', ox, oz, L1 + 0.8, 'Stadium manager\'s desk', 0); }
  // THE SWITCH ROOM: breaker cabinets, the floodlight panel (needs the key)
  let switchC = null, switchLamp = null;
  { for (let k = 0; k < 4; k++) { const [x, z] = P(N, 39 + k * 2.6, 29.4); K.block(x, L1, z, 1.1, L1 + 2.1, 0.35, 0, f => f === 'top' ? 'darkMetal' : 'appliance', 'metal'); }
    const [x, z] = P(N, 46, 21.5); K.block(x, L1, z, 0.9, L1 + 1.9, 0.3, 0, 'appliance', 'metal');
    switchC = cUp(LOOT_PANEL ? 'panel' : 'cabinet', x, z, L1 + 1.2, 'Floodlight panel (locked: needs the key)', 0, null, { floodSwitch: true });
    // (hidden until you have the key — a search would roll 'cabinet' loot again and again; once loot.js has an
    //  empty 'panel' kind it stays visible all along, labelled by state, and a keyless search is refused in update)
    switchC.hidden = !LOOT_PANEL;
    // its front (the side facing into the room, away from the corridor wall): a breaker face, the status lamp, the key
    // switch and a big red lever that's down until the lights go on
    const [fx2, fz2] = P(N, 46, 21.81), fy = Math.atan2(-N.o[0], -N.o[1]) + Math.PI;   // (facing +v: into the room)
    const face = K.ctex(128, 256, (g, w, h) => {
      g.fillStyle = '#8e969c'; g.fillRect(0, 0, w, h); g.strokeStyle = '#5a6064'; g.lineWidth = 3; g.strokeRect(4, 4, w - 8, h - 8);
      g.fillStyle = '#d8b020'; g.fillRect(10, 10, w - 20, 26); g.fillStyle = '#111'; g.font = 'bold 15px Helvetica, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('FLOODLIGHTS', w / 2, 24);
      for (let r = 0; r < 6; r++) for (let c = 0; c < 4; c++) { const x0 = 14 + c * 26, y0 = 48 + r * 20; g.fillStyle = '#1a1c1e'; g.fillRect(x0, y0, 20, 15); g.fillStyle = (r + c) % 5 ? '#e8e8e4' : '#c82020'; g.fillRect(x0 + 7, y0 + 2, 6, 7); }
      g.fillStyle = '#1a1c1e'; g.fillRect(14, 176, 100, 2); g.fillStyle = '#222'; g.font = 'bold 11px Helvetica, Arial'; g.fillText('PYLONS 1 – 4', w / 2, 190);
      g.fillStyle = '#d8b020'; g.beginPath(); g.moveTo(64, 204); g.lineTo(82, 236); g.lineTo(46, 236); g.closePath(); g.fill(); g.fillStyle = '#111'; g.fillRect(62, 214, 4, 12); g.fillRect(62, 229, 4, 4);
    });
    K.xadd(G.plane, std({ map: face, roughness: 0.5, metalness: 0.3 }), K.mat4(fx2, L1 + 1.0, fz2, fy, 1.7, 1.75, 1), false);
    switchLamp = std({ color: 0x401010, emissive: 0xff2010, emissiveIntensity: 2.0, roughness: 0.3 });
    const [lx2, lz2] = P(N, 45.3, 21.84); K.WX(G.box, switchLamp, lx2, L1 + 1.78, lz2, 0, 0.12, 0.12, 0.04);
    const [kx2, kz2] = P(N, 45.6, 21.84); K.WX(G.cyl, MAT.chrome, kx2, L1 + 1.0, kz2, 0, 0.09, 0.05, 0.09, Math.PI / 2, 0);   // the key switch
    // the lever: pivots at the panel's side, handle down (off) / up (on)
    { const [px2, pz2] = P(N, 46.7, 21.92), piv = new THREE.Group(); piv.position.set(px2, L1 + 1.1, pz2); piv.rotation.y = fy;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 0.05).translate(0, 0.21, 0), MAT.chrome), grip = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 10).rotateZ(Math.PI / 2).translate(0, 0.44, 0), MAT.redPaint || switchLamp);
      piv.add(arm, grip); K.level.add(piv); piv.rotation.order = 'YXZ'; piv.rotation.x = 2.4; STADIUM.lever = piv; }
    const [sx3, sz3] = P(N, 46, 21.13);
    sign(['FLOODLIGHTS', 'KEY ▸ BREAKER UP'], sx3, L1 + 2.35, sz3, fy, 1.3, 0.42, '#8a6a10', '#111');
  }
  // the switch room's outside door, at the top of the back stairs (SPOTS.backStairs; the stairs run along the back wall)
  { const [hx, hz] = P(N, 48.15, 30.2); liftDoor(K.door(hx, hz, 0, -1, 0x8a1010, null, { w: 1.0, hp: 320 }), L1);   // (it opens inward: swung out it blocked the top of the stairs)
    const [sx, sz] = P(N, 48.65, 30.45); sign(['SWITCH ROOM', 'AUTHORISED ONLY'], sx, L1 + 2.55, sz, Math.PI, 1.3, 0.42, '#d8b020', '#111'); }
  { const len = 12.5, [cx, cz] = P(N, 32.5 + len / 2, 31.6);
    K.stairs(cx, cz, Math.PI / 2, 2.4, len, 0, L1, 'sdTread', { open: true });
    sbox(N, 45, 30.4, 50.3, 32.8, L1 - 0.3, L1, { top: 'sdTread', side: 'sdRiser', bot: 'sdRiser' }, { extra: { noWalk: true } });
    deck(N, 45, 29.9, 50.3, 32.8, L1);   // (through the doorway in the back wall, onto the first floor)
    sbox(N, 45, 32.8, 50.3, 32.9, L1, L1 + 1.05, null, { surf: 'metal' }); sbox(N, 50.3, 30.4, 50.4, 32.9, L1, L1 + 1.05, null, { surf: 'metal' });
    for (const u of [46, 50]) { const [px, pz] = P(N, u, 32.6); K.WX(G.box, MAT.sdSteel, px, L1 / 2, pz, 0, 0.25, L1, 0.25); }
    sbox(N, 45, 32.5, 45.3, 32.8, 0, L1 - 0.3, null, {}); sbox(N, 49.95, 32.5, 50.25, 32.8, 0, L1 - 0.3, null, {});
    const [rx0, rz0] = P(N, 45, 32.85), [rx1, rz1] = P(N, 50.3, 32.85); K.wbeam([rx0, L1 + 1.0, rz0], [rx1, L1 + 1.0, rz1], 0.05, 0.05, MAT.metal, false); }
  // ---- the upper tier over the first floor (seen from the pitch; you can't get up there) ----
  { const n = 12, d2 = 0.88, r2 = 0.56, vu = 19.2, yu = 9.4;
    sbox(N, -50, 18.8, 50, 19.2, L1 + 2.98, L1 + 4.48, { [pf(N)]: 'sdRibbon', top: 'sdClad', side: 'sdClad' }, {});
    sbox(N, -50, 18.8, 50, 19.2, L1 + 4.48, yu + 0.9, { top: 'sdClad', side: 'sdClad' }, {});
    for (let j = 0; j < n; j++) {
      const v0 = vu + j * d2, y = yu + j * r2;
      sbox(N, -50, v0, 50, v0 + d2, y - r2 - 0.1, y, f => f === 'top' ? 'sdTread' : 'sdRiser', { extra: { noWalk: true } });
      for (let u = -49.7; u <= 49.7; u += 0.5) { const [x, z] = P(N, u, v0 + 0.46); K.inst(G.seat, Math.abs(u) < 12 && j > 3 && j < 9 && ((Math.floor(u / 2) + j) % 3 === 0) ? MAT.sdSeatB : MAT.sdSeatC, K.mat4(x, y, z, 0), false); if (R() < 0.85) fans.push([x, y, z, 0, R() < 0.6 ? 0 : 1]); }
    }
    // the club crest on the upper tier's front, the clock
    const [cx, cz] = P(N, 0, 18.75); K.xadd(G.plane, std({ map: T.crest, transparent: true, alphaTest: 0.1, roughness: 0.5, emissive: 0xffffff, emissiveMap: T.crest, emissiveIntensity: 0.25 }), K.mat4(cx, L1 + 3.65, cz + 0.01, 0, 1.6, 1.6, 1), false);
  }
  // the main stand's end walls up to the roof above the corridor/concourse openings
  for (const s of [-1, 1]) sbox(N, s * 50, 15, s * 50.3, 30, 5.4, N.roofY, { side: 'sdClad', top: 'sdClad' }, { surf: 'metal' });
  for (const s of [-1, 1]) sbox(N, s * 50, 18, s * 50.3, 30, 3.3, 5.4, { side: 'sdClad' }, { surf: 'metal' });

  // ================================================================ around the pitch: goals, dugouts, boards, flags
  const sideNet = new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(2.0, 0), new THREE.Vector2(2.0, 2.0), new THREE.Vector2(0, 2.44)]));
  for (const s of [-1, 1]) {
    const gx = s * PX, back = gx + s * 2.0, yaw = s > 0 ? -Math.PI / 2 : Math.PI / 2;
    for (const sz of [-1, 1]) { K.WX(G.goalPost, MAT.white, gx, 1.22, sz * 3.66, 0, 1, 2.44, 1); K.solid(gx, sz * 3.66, 0.07, 0.07, 0, 2.44, 'metal'); }
    K.WX(G.goalPost, MAT.white, gx, 2.44, 0, 0, 1, 7.44, 1, Math.PI / 2, 0);
    // the net: a sloped roof and back, two sides; stanchions behind
    K.xadd(G.plane, MAT.sdNet, K.mat4(back, 1.0, 0, yaw, 7.32, 2.0, 1), false);
    K.xadd(G.plane, MAT.sdNet, K.mat4((gx + back) / 2, 2.22, 0, yaw, 7.32, 2.0, 1, -1.35 * 1, 0), false);
    for (const sz of [-1, 1]) K.xadd(sideNet, MAT.sdNet, K.mat4(gx, 0, sz * 3.66, s > 0 ? 0 : Math.PI), false);
    for (const sz of [-1, 1]) K.wbeam([gx, 2.44, sz * 3.66], [back, 2.0, sz * 3.66], 0.04, 0.04, MAT.white, false);
    K.solid((gx + back) / 2, -3.7, 1.0, 0.05, 0, 2.3, 'metal', 0, { window: true });
    K.solid((gx + back) / 2, 3.7, 1.0, 0.05, 0, 2.3, 'metal', 0, { window: true });
    K.solid(back, 0, 0.05, 3.7, 0, 2.0, 'metal', 0, { window: true });
    // corner flags
    for (const sz of [-1, 1]) { K.WX(G.cyl, MAT.yellowPaint, gx, 0.75, sz * PZ, 0, 0.03, 1.5, 0.03); K.xadd(G.flag, MAT.sdSeatC, K.mat4(gx, 1.3, sz * PZ, s * sz > 0 ? 0.6 : 2.5, 1, 1, 1), false); }
  }
  // LED ad boards round the pitch (low: you can vault them)
  const boardRun = (x0, z0, x1, z1) => {
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0), Lr = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
    // one solid box for the run; the faces drawn in pieces so no sponsor is ever cut in half: whole 4 m sponsor panels
    // (the texture repeats every 32 m of world position: a panel boundary every 4 m) and plain club-colour panels at the ends
    const pc = (p, q, mat) => { if (q - p < 0.02) return; box(alongX ? p : x0 - 0.15, alongX ? z0 - 0.15 : p, alongX ? q : x0 + 0.15, alongX ? z0 + 0.15 : q, 0, 0.92, mat, { solid: false }); };
    const lo = alongX ? Math.min(x0, x1) : Math.min(z0, z1), hi = alongX ? Math.max(x0, x1) : Math.max(z0, z1), s0 = Math.ceil(lo / 4 - 1e-6) * 4, s1 = Math.floor(hi / 4 + 1e-6) * 4;
    const face = (m) => f => f === 'top' ? 'black' : (alongX ? (f === 'pz' || f === 'nz') : (f === 'px' || f === 'nx')) ? m : 'black';
    box(alongX ? x0 : x0 - 0.15, alongX ? z0 - 0.15 : z0, alongX ? x1 : x0 + 0.15, alongX ? z0 + 0.15 : z1, 0, 0.92, null, { surf: 'metal', extra: { vault: true } });
    if (s1 > s0) { pc(lo, s0, face('sdBoardEnd')); pc(s0, s1, face('sdBoards')); pc(s1, hi, face('sdBoardEnd')); } else pc(lo, hi, face('sdBoardEnd'));
    for (let a = 1.5; a < Lr; a += 3) { const x = alongX ? Math.min(x0, x1) + a : x0, z = alongX ? z0 : Math.min(z0, z1) + a; K.inst(G.box, MAT.darkMetal, K.mat4(x + (alongX ? 0 : (x0 > 0 ? 0.5 : -0.5)), 0.4, z + (alongX ? (z0 > 0 ? 0.5 : -0.5) : 0), 0, 0.06, 0.8, 0.06)); }
  };
  // (gaps where the stewards go through, in line with the aisles)
  const runs = (a0, a1, gaps, f) => { let a = a0; for (const g of gaps) { if (g - 0.8 > a) f(a, g - 0.8); a = g + 0.8; } if (a < a1) f(a, a1); };
  runs(-56.15, 56.15, [-33, -22, -14, 14, 22, 33], (a, b) => boardRun(a, 37.5, b, 37.5));   // (round the corners: the runs meet)
  runs(-56.15, -18, [-33, -22], (a, b) => boardRun(a, -37.5, b, -37.5)); runs(18, 56.15, [22, 33], (a, b) => boardRun(a, -37.5, b, -37.5));
  for (const s of [-1, 1]) runs(-37.35, 37.35, [-22, -11, 0, 11, 22], (a, b) => boardRun(s * 56, a, s * 56, b));
  // the dugouts in front of the Main Stand: a bench under a curved perspex shelter
  for (const s of [-1, 1]) {
    const xc = s * 11, z0 = -39.8, z1 = -37.9;
    box(xc - 4, z0, xc + 4, z0 + 0.15, 0, 2.1, { side: 'sdBlock', top: 'sdBlock' }, {});
    box(xc - 4, z0, xc - 3.85, z1, 0, 2.1, { side: 'shopGlass' }, { extra: { window: true } }); box(xc + 3.85, z0, xc + 4, z1, 0, 2.1, { side: 'shopGlass' }, { extra: { window: true } });
    box(xc - 4, z0, xc + 4, z1 + 0.1, 2.1, 2.16, { top: 'shopGlass', bot: 'shopGlass' }, { solid: false });
    for (let k = 0; k < 13; k++) K.inst(G.seat, s < 0 ? MAT.sdSeatC : MAT.sdSeatY, K.mat4(xc - 3.5 + k * 0.58, 0, -39.3, 0));
    K.solid(xc, -39.3, 3.8, 0.3, 0, 0.55, 'wood', 0, { vault: true });
    K.container('bench', xc + 2.5, -39.2, 0.5, s < 0 ? 'Home dugout' : 'Away dugout', 0);
  }
  { K.block(4.6, 0, -39.2, 0.7, 0.75, 0.35, 0, f => f === 'top' ? 'black' : 'sdClad', 'metal'); K.inst(G.monitor, MAT.screen, K.mat4(4.6, 0.75, -39.25, 0)); }   // the fourth official's desk
  // TV camera platforms on the halfway line and behind the goals
  for (const [x, z, ry] of [[-26, -36.6, 0], [-55.5, -14, Math.PI / 2], [55.5, 14, -Math.PI / 2], [30, 36.8, Math.PI]]) { K.inst(G.camera, MAT.darkMetal, K.mat4(x, 0, z, ry)); K.solid(x, z, 0.3, 0.3, 0, 1.8, 'metal', 0, { vault: true }); }
  // (the match ball is stadium.match.js's: it's in play, and it stays wherever it ended up when the lights went)

  // ================================================================ floodlight pylons (lattice towers) and the big screen
  const pylons = [];
  for (const [px, pz] of [[66, -56], [-66, -56], [66, 46], [-66, 46]]) {
    const H2 = 42, b0 = 2.0, b1 = 0.8, yawP = Math.atan2(-px, -pz);
    K.block(px, 0, pz, 2.4, 0.8, 2.4, 0, f => f === 'top' ? 'concrete' : 'concrete', 'concrete');
    const legs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const [lx, lz] of legs) K.wbeam([px + lx * b0, 0.8, pz + lz * b0], [px + lx * b1, H2, pz + lz * b1], 0.22, 0.22, MAT.metal);
    for (let y = 0.8; y < H2 - 1; y += 3.4) {
      const t0 = (y - 0.8) / (H2 - 0.8), t1 = Math.min(1, (y + 3.4 - 0.8) / (H2 - 0.8)), w0 = b0 + (b1 - b0) * t0, w1 = b0 + (b1 - b0) * t1;
      for (let k = 0; k < 4; k++) { const [ax, az] = legs[k], [bx2, bz2] = legs[(k + 1) % 4];
        K.wbeam([px + ax * w0, y, pz + az * w0], [px + bx2 * w0, y, pz + bz2 * w0], 0.08, 0.08, MAT.metal, false);
        K.wbeam([px + ax * w0, y, pz + az * w0], [px + bx2 * w1, y + 3.4, pz + bz2 * w1], 0.06, 0.06, MAT.metal, false); }
    }
    // a caged ladder up one leg
    K.wbeam([px - b0 - 0.3, 0.8, pz], [px - b1 - 0.3, H2, pz], 0.05, 0.05, MAT.metal, false);
    // the head: a frame of 6 × 4 lamps tilted down toward the centre spot
    const TL = 0.45, sy = Math.sin(yawP), cy = Math.cos(yawP);
    const hx = px + sy * 1.4, hz = pz + cy * 1.4, hy = H2 + 2.6;
    const rgt = [cy, 0, -sy], upv = [sy * Math.sin(TL), Math.cos(TL), cy * Math.sin(TL)], fwd = [sy * Math.cos(TL), -Math.sin(TL), cy * Math.cos(TL)];
    K.WX(G.box, MAT.darkMetal, hx, hy, hz, yawP, 7.2, 5.0, 0.3, TL, 0);
    for (let r2 = 0; r2 < 4; r2++) for (let c2 = 0; c2 < 6; c2++) {
      const lx = -2.9 + c2 * 1.16, ly = -1.8 + r2 * 1.2;
      const x = hx + rgt[0] * lx + upv[0] * ly + fwd[0] * 0.3, y = hy + upv[1] * ly + fwd[1] * 0.3, z = hz + rgt[2] * lx + upv[2] * ly + fwd[2] * 0.3;
      K.inst(G.lamp, MAT.darkMetal, K.mat4(x, y, z, yawP, 1, 1, 1, TL));
      K.inst(G.lens, lens, K.mat4(x + fwd[0] * 0.19, y + fwd[1] * 0.19, z + fwd[2] * 0.19, yawP, 1, 1, 1, TL), false);
    }
    K.solid(px, pz, 2.4, 2.4, 0, 0.8, 'concrete', 0, { vault: true });
    for (const [lx, lz] of legs) K.solid(px + lx * b0, pz + lz * b0, 0.2, 0.2, 0, 6, 'metal');
    pylons.push({ x: px, z: pz, hx, hy, hz });
  }
  // the big screen on a frame over the East End's roof
  { const x = 74.5, y = STANDS.E.roofY + 6.5;   // (clear of the roof's trusses, which rise 4.2 m over it)
    K.WX(G.box, MAT.black, x + 0.25, y, 0, 0, 0.4, 7.2, 16.4);
    K.xadd(G.plane, screenM, K.mat4(x, y, 0, -Math.PI / 2, 16, 6.8, 1), false);
    for (const s of [-1, 1]) K.wbeam([x + 0.4, STANDS.E.roofY, s * 7], [x + 0.4, y - 3.5, s * 7], 0.3, 0.3, MAT.metal); }

  // ================================================================ the outside: fences, corners, plaza, car park
  // the corners: steel palisade from stand to stand, a gate for vehicles (shut) and a door for people
  const palisade = (x0, z0, x1, z1, doorAt = null) => {
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0), Lp = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0), sgn = alongX ? Math.sign(x1 - x0) : Math.sign(z1 - z0);
    const at = a => alongX ? [x0 + sgn * a, z0] : [x0, z0 + sgn * a];
    const pieces = doorAt == null ? [[0, Lp]] : [[0, doorAt - 0.6], [doorAt + 0.6, Lp]];
    for (const [a, b] of pieces) {
      if (b - a < 0.05) continue;
      const [ax, az] = at(a), [bx2, bz2] = at(b);
      box(ax - (alongX ? 0 : 0.01), az - (alongX ? 0.01 : 0), bx2 + (alongX ? 0 : 0.01), bz2 + (alongX ? 0.01 : 0), 0, 2.9, f => alongX ? (f === 'pz' || f === 'nz' ? 'sdBars' : null) : (f === 'px' || f === 'nx' ? 'sdBars' : null), { solid: false });
      box(ax - (alongX ? 0 : 0.06), az - (alongX ? 0.06 : 0), bx2 + (alongX ? 0 : 0.06), bz2 + (alongX ? 0.06 : 0), 0, 2.9, null, { surf: 'metal', extra: { window: true } });
      for (let k = a; k <= b + 0.01; k += 3) { const [px, pz] = at(Math.min(k, b)); K.inst(G.box, MAT.sdPalisade, K.mat4(px, 1.45, pz, 0, 0.1, 2.95, 0.1)); }
    }
    if (doorAt != null) { const [hx, hz] = at(doorAt - 0.55); K.door(hx, hz, alongX ? 0 : -Math.PI / 2 * sgn, 1, 0x1e3a2a, null, { w: 1.1, hp: 400 }); }
  };
  for (const sx of [-1, 1]) {
    palisade(sx * 52.9, -70.5, sx * 76.0, -70.5, 11.5);   // north corners (the stairs end at 52.7)
    palisade(sx * 76.0, -70.5, sx * 76.0, -30.2, 20);
    palisade(sx * 52.9, 58.8, sx * 76.0, 58.8, 11.5);
    palisade(sx * 76.0, 58.8, sx * 76.0, 30.2, 14);
  }
  // the perimeter: a palisade all round the grounds (gates on the plaza and car park are chained after the outbreak)
  const E2 = 106;
  palisade(-E2, -E2, -8, -E2); palisade(8, -E2, E2, -E2); palisade(E2, -E2, E2, E2); palisade(E2, E2, 8, E2); palisade(-8, E2, -E2, E2); palisade(-E2, E2, -E2, -E2);
  for (const z of [-E2, E2]) {
    K.chaos(0, z, () => { K.barricade(-4, z + Math.sign(-z) * 1.5, 0); K.barricade(0.5, z + Math.sign(-z) * 1.5, 0); K.barricade(4.5, z + Math.sign(-z) * 1.5, 0); K.policeCar(-2.5, z + Math.sign(-z) * 6, 0.25); for (let i = 0; i < 6; i++) K.cone(-6 + i * 2.4, z + Math.sign(-z) * 3.2, R() < 0.2); });
    for (const sx of [-1, 1]) { K.WX(G.box, MAT.sdPalisade, sx * 8, 1.6, z, 0, 0.3, 3.2, 0.3); K.solid(sx * 8, z, 0.2, 0.2, 0, 3.2, 'metal'); }
  }
  // the club plaza (north): a statue, flagpoles, the burger van, the programme hut, the ticket office, trees
  { // the plinth: dressed granite blocks with a moulded cap; on it, Jimmy Reid in bronze (one of the game's own people,
    // posed and cast once), a foot on the ball
    const stoneT = K.ctex(256, 256, (g, w, h, r) => {
      g.fillStyle = '#a8a49a'; g.fillRect(0, 0, w, h);
      for (let k = 0; k < 5000; k++) { const v = 120 + r() * 90 | 0; g.fillStyle = `rgba(${v},${v - 4},${v - 10},0.35)`; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
      g.fillStyle = '#6e6a62'; for (let y = 0; y < h; y += 64) { g.fillRect(0, y, w, 3); for (let x = (y / 64) % 2 ? 0 : 64; x < w; x += 128) g.fillRect(x, y, 3, 64); }
    }, [1, 1]);
    add('sdStone', std({ map: stoneT, roughness: 0.75 }), 2);
    K.block(0, 0, -92, 1.6, 1.45, 1.6, 0, 'sdStone', 'concrete');
    K.box(0, 1.45, -92, 1.72, 1.6, 1.72, 0, f => f === 'bot' ? null : 'sdStone');
    K.box(0, 0, -92, 1.75, 0.22, 1.75, 0, f => f === 'bot' ? null : 'sdStone');
    const bronze = std({ color: 0x7a5a34, roughness: 0.42, metalness: 0.65 });
    let cast = false;
    try {
      const KD = globalThis.ZA && globalThis.ZA.KINDS, kd = KD && (KD.coach || KD.human);
      if (kd && kd.root) {
        const { geo, mats } = bakePerson(personSource(kd), 'stand'), hid = new THREE.MeshBasicMaterial({ visible: false });
        const m = new THREE.Mesh(geo, mats.map(md => md.transparent || md.alphaTest ? hid : bronze));
        m.position.set(0, 1.6, -92.1); m.scale.setScalar(1.45); m.castShadow = true; m.receiveShadow = true; K.level.add(m); cast = true;
      }
    } catch (e) { console.warn('stadium statue', e); }
    if (!cast) {
      K.WX(G.cyl, bronze, 0, 2.5, -92, 0, 0.5, 1.8, 0.4); K.WX(G.cyl, bronze, 0, 3.6, -92, 0, 0.32, 0.45, 0.32);
      K.WX(G.cyl, bronze, 0.35, 3.0, -92, 0, 0.14, 1.1, 0.14, 0, -0.9); K.WX(G.cyl, bronze, -0.32, 2.7, -91.9, 0, 0.13, 1.0, 0.13, 0.3, 0.4);
    }
    K.WX(G.ball, bronze, 0.5, 1.76, -91.55, 0, 1.45, 1.45, 1.45);
    K.solid(0, -92, 0.5, 0.5, 0, 4.3, 'metal');
    sign(['JIMMY "THE ANCHOR" REID', '1931 — 2004 · 512 GAMES'], 0, 0.9, -90.38, 0, 2.6, 0.6, '#3a2a1a', '#e8d8a0');
    for (const x of [-9, -6, -3, 3, 6, 9]) { K.WX(G.pole, MAT.alu, x, 0, -99, 0, 1, 9, 1); K.xadd(G.flag, x % 2 ? MAT.sdSeatC : MAT.sdSeatB, K.mat4(x, 8.2, -99, 0.3, 4, 4, 1), false); K.solid(x, -99, 0.12, 0.12, 0, 9, 'metal'); }
    for (const [x, z] of [[-60, -96], [-45, -100], [-28, -100], [28, -100], [45, -100], [60, -96], [-90, -90], [90, -90]]) { K.tree(x, z, 1.0 + R() * 0.3, 0); }
    for (let x = -77; x <= 77; x += 22) K.streetLamp(x, -76, Math.PI);   // (none on the axis of the main entrance)
  }
  // the burger van (where it started): a box van with a serving hatch and an awning
  { const x = -16, z = -88, van = std({ color: 0xe8e4dc, roughness: 0.4, metalness: 0.2 });
    K.block(x, 0.45, z, 3.0, 2.9, 1.2, 0, f => f === 'bot' ? 'darkMetal' : 'white', 'metal');
    K.solid(x + 0.9, z, 3.95, 1.2, 0, 2.9, 'metal');
    K.WX(G.box, MAT.darkMetal, x - 1.8, 1.7, z + 1.21, 0, 2.2, 0.9, 0.02);
    K.xadd(G.plane, MAT.awning, K.mat4(x - 1.8, 2.55, z + 1.6, 0, 2.6, 0.9, 1, -1.1, 0), false);
    for (const s of [-1, 1]) for (const zz of [-0.9, 0.9]) K.WX(G.wheel, MAT.rubber, x + s * 2.0, 0.42, z + zz, 0, 0.85, 0.85, 0.85);
    K.WX(G.box, van, x + 3.95, 1.45, z, 0, 1.8, 2.0, 2.2); K.WX(G.box, MAT.shopGlass, x + 4.86, 1.9, z, 0, 0.02, 0.8, 2.0);
    for (const zz of [-1.11, 1.11]) K.WX(G.box, MAT.shopGlass, x + 4.0, 1.9, z + zz, 0, 1.0, 0.7, 0.02);
    for (const zz of [-0.9, 0.9]) K.WX(G.wheel, MAT.rubber, x + 4.2, 0.42, z + zz, 0, 0.85, 0.85, 0.85);
    sign(['HARBOR GRILL', 'BIG ANCHOR BURGER $6'], x - 0.2, 3.25, z + 1.22, 0, 5.4, 0.7, '#a8201a', '#fff4d0');
    K.container('kitchen', x - 1.8, z + 0.7, 1.2, 'Burger van', 0);
    K.block(x - 1.8, 0, z + 1.55, 1.2, 0.95, 0.3, 0, f => f === 'top' ? 'counter' : 'sdClad', 'metal');
    K.chaos(x, z + 3, () => { K.emitter({ x: x - 1, y: 3.1, z, kind: 'smoke', rate: 1.5, t: 0 }); K.blood(x - 1.5, z + 2.6, 1.1, 0.03); });
  }
  // the programme hut and the ticket office
  { const H = K.room(14, -81.5, 3.6, 3.0, 0, { h: 2.6, mat: 'sdClad', inMat: 'paint1', floor: 'floorWood', roof: 'flat', roofMat: 'concrete', home: false, name: 'PROGRAMMES', doors: [{ side: 'n', at: 0.8, w: 0.9 }], windows: [{ side: 's', at: -0.5, w: 1.8, sill: 0.95, top: 2.1 }] });
    K.container('shelf', 14, -81.8, 1.0, 'Programme stack', 0); sign(['PROGRAMMES $3'], 14, 2.35, -80.0, 0, 2.6, 0.5, HOME.col); }
  { const H = K.room(-40, -86, 8, 5, 0, { h: 3.0, mat: 'brick', inMat: 'paint2', floor: 'floorTile', roof: 'flat', home: false, name: 'TICKET OFFICE', doors: [{ side: 'n', at: 2.5, w: 1.0 }], windows: [{ side: 's', at: -2.5, w: 1.4, sill: 0.95, top: 2.0 }, { side: 's', at: -0.5, w: 1.4, sill: 0.95, top: 2.0 }, { side: 's', at: 1.5, w: 1.4, sill: 0.95, top: 2.0 }] });
    K.block(-41, 0, -84.2, 2.8, 1.0, 0.35, 0, f => f === 'top' ? 'counter' : 'cabinet', 'wood'); K.container('register', -41.5, -84.6, 1.0, 'Ticket desk', 0); K.container('cabinet', -37.2, -88, 1.0, 'Office cupboard', 0);
    sign(['TICKET OFFICE'], -40, 3.4, -83.45, 0, 3.4, 0.55, '#0e2a4a'); }
  // team coaches in the plaza (the home coach is unlocked)
  const coach = (x, z, yaw, col, label, kind = 'car') => {
    const m = std({ color: col, roughness: 0.35, metalness: 0.4 });
    K.xadd(G.bus, m, K.mat4(x, 0, z, yaw)); K.xadd(G.busWin, MAT.screen, K.mat4(x, 2.35, z - Math.cos(yaw) * 0.3, yaw));
    for (const s of [-1, 1]) for (const a of [-4, 3.5, 4.8]) K.xadd(G.wheel, MAT.rubber, K.mat4(x + Math.cos(yaw) * s * 1.2 + Math.sin(yaw) * a, 0.5, z - Math.sin(yaw) * s * 1.2 + Math.cos(yaw) * a, yaw));
    K.solid(x, z, 1.3, 6.0, yaw, 3.3, 'metal');
    K.container(kind, x + Math.cos(yaw) * 1.4, z - Math.sin(yaw) * 1.4, 1.2, label, yaw);
  };
  coach(40, -86, Math.PI / 2, 0x8a1c2a, 'Harbor City team coach'); coach(62, -86, Math.PI / 2, 0xd8a818, 'Ironbridge team coach');
  coach(-70, 96, 0, 0xe8e8e8, 'Supporters\' coach'); coach(-62, 96, 0, 0x1a4a8a, 'Supporters\' coach');
  K.chaos(-62, 96, () => { K.emitter({ x: -62, y: 3.4, z: 96, kind: 'fire', rate: 5, t: 0 }); K.emitter({ x: -62, y: 4, z: 96, kind: 'column', rate: 2, t: 0 }); K.hazard(-62, 96, 2.2, 'fire', 12); });
  // the car park: bays, lamp posts, cars (some crashed and burning after the outbreak)
  { for (let row = 0; row < 4; row++) {
      const z = 66 + row * 10;
      for (let x = -96; x <= 96; x += 2.8) K.box(x, 0.02, z + (row % 2 ? -2.4 : 2.4), 0.06, 0.03, 2.4, 0, f => f === 'top' ? 'roadWhite' : null);
    }
    let ci = 0; const z0r = row => 66 + row * 10 + (row % 2 ? -2.4 : 2.4);   // (not where the wrecks and the ambulance go)
    for (let row = 0; row < 4; row++) for (let x = -94.6; x <= 94; x += 2.8) {
      if (ci >= (tier() > 1 ? 16 : tier() ? 24 : 34)) break;   // (cup final night: the car park's nearly full)
      if (R() > 0.42 || (Math.abs(x + 66) < 9 && row === 3) || [[20, 81], [-30, 76], [55, 86], [4, 63], [-6, 64]].some(([wx, wz]) => Math.abs(x + 1.4 - wx) < 3.2 && Math.abs(z0r(row) - wz) < 3.5)) continue;
      const z = 66 + row * 10 + (row % 2 ? -2.4 : 2.4), yaw = row % 2 ? 0 : Math.PI;
      K.car(x + 1.4, z, yaw + (R() - 0.5) * 0.06, ci++ % 8, R() < 0.3 ? 'suv' : R() < 0.15 ? 'pickup' : 'sedan');
    }
    for (let x = -70; x <= 70; x += 28) for (const z of [62, 81, 101]) { if (x === -70 && z === 101) continue; K.streetLamp(x, z, 0); }   // (not through the supporters' coach)
    K.wreck(20, 81, 0.6, 1, true); K.wreck(-30, 76, 2.2, 4, false); K.wreck(55, 86, -0.4, 6, false, Math.PI / 2 * 0.98); K.wreck(4, 63, 1.3, 2, true);
    K.chaos(0, 66, () => K.ambulance(-6, 64, 1.4));
  }
  // west road: the TV outside-broadcast trucks, a satellite dish, cables
  { for (const [z, col] of [[-20, 0x2a2e34], [6, 0xe8e8e8]]) {
      const m = std({ color: col, roughness: 0.4, metalness: 0.3 });
      K.block(-91, 0.5, z, 1.3, 4.0, 6.5, 0, f => f === 'bot' ? 'darkMetal' : 'sdClad', 'metal'); K.solid(-91, z, 1.3, 6.5, 0, 4.0, 'metal');
      K.WX(G.box, m, -91, 1.7, z - 8.0, 0, 2.5, 2.6, 2.6); K.solid(-91, z - 8.0, 1.3, 1.3, 0, 3.0, 'metal');
      for (const a of [-6, -4.5, 4, 5.5, -8.4]) for (const s of [-1, 1]) K.WX(G.wheel, MAT.rubber, -91 + s * 1.2, 0.5, z + a, 0, 1, 1, 1);
      K.container('truck', -89.6, z + 2, 1.2, 'Broadcast truck', 0);
      sign(['HCTV', 'LIVE'], -89.68, 3.0, z, Math.PI / 2, 3.6, 1.2, '#b01010', '#ffffff');
    }
    { const dish = new THREE.SphereGeometry(1.4, 20, 6, 0, Math.PI * 2, 0, 0.8).translate(0, -1.4, 0).rotateX(Math.PI);   // a bowl, vertex at the origin
      K.WX(dish, std({ color: 0xe8e8e4, roughness: 0.5, metalness: 0.1, side: THREE.DoubleSide }), -91, 5.15, 10, 0, 1, 1, 1, 0.55, 0);
      K.WX(G.cyl, MAT.metal, -91, 4.82, 10, 0, 0.1, 0.65, 0.1);   // the mast on the truck roof (4.5)
      K.wbeam([-91, 5.2, 10], [-91, 5.9, 9.2], 0.03, 0.03, MAT.metal, false); }   // the feed arm   // (on the second truck's roof, on a short mast)
    for (let k = 0; k < 6; k++) K.wbeam([-89.7, 0.05, -12 + k * 3], [-77, 0.05, -12 + k * 2.4], 0.05, 0.04, MAT.black, false);
  }
  // east road: the maintenance yard (a workshop, fuel drums, a skip)
  { const H = K.room(91, -14, 10, 7, 0, { h: 3.4, mat: 'sdClad', inMat: 'sdBlock', floor: 'sdConc', roof: 'flat', home: false, name: 'MAINTENANCE', doors: [{ side: 'w', at: 1.5, w: 1.0, col: 0x3a4a3a }], windows: [{ side: 'w', at: -1.8, w: 1.6, sill: 1.0, top: 2.2 }] });
    K.block(93.5, 0, -16.8, 2.0, 0.92, 0.45, 0, f => f === 'top' ? 'plank' : 'darkWood', 'wood'); K.container('garage', 93.5, -16.8, 0.95, 'Workshop bench', 0);
    K.block(95.3, 0, -11.5, 0.35, 2.0, 1.6, 0, 'shelfMetal', 'metal'); K.container('shed', 95.3, -11.5, 1.2, 'Parts shelves', 0);
    for (let k = 0; k < 5; k++) { K.inst(G.barrel, k % 2 ? MAT.redPaint : MAT.bluePaint, K.mat4(84 + (k % 3) * 0.7, 0, -4 + Math.floor(k / 3) * 0.7, R() * 6)); }
    K.solid(84.7, -3.6, 1.1, 0.8, 0, 0.9, 'metal', 0, { vault: true });
    K.crateStack(84, 4, 0.2, 2); K.crateStack(86.5, 8, -0.3, 1);
    sign(['MAINTENANCE'], 85.88, 2.9, -14, -Math.PI / 2, 2.6, 0.5, '#2a3a2a');
    // a shipping container to climb (from the crate at its end): a lookout over the east road
    add('sdBox', std({ map: K.TX.corrugatedTexture([40, 84, 120]), roughness: 0.6, metalness: 0.4 }), 1.2);
    K.deck(97, 14, 3.05, 1.22, 0, 2.6, { solid: true, climb: true, mat: 'sdBox', side: 'sdBox', surf: 'metal' });
    K.deck(93.35, 14.4, 0.55, 0.5, 0, 1.25, { solid: true, climb: true, mat: 'plank' });
    K.container('shed', 100, 12.6, 1.0, 'Shipping container', 0);
  }
  // the ticket office roof: crates and a bin against its west wall get you up there
  K.deck(-44.65, -86.2, 0.5, 0.55, 0, 1.75, { solid: true, climb: true, mat: 'plank' });
  K.deck(-45.9, -86.2, 0.7, 0.55, 0, 1.2, { solid: true, climb: true, mat: 'greenPaint' });
  K.deck(-40, -86, 4.0, 2.5, 0, 3.22, { climb: true, draw: false });

  // ================================================================ the aftermath (chaos layer): the stands and pitch
  const cup = std({ color: 0xe8e4d8, roughness: 0.6 });
  for (let k = 0; k < 18; k++) {   // litter, scarves and blood on the pitch (in pieces, each revealed out of sight)
    const cx = -45 + (k % 6) * 18, cz = -24 + Math.floor(k / 6) * 24;
    K.chaos(cx, cz, () => {
      for (let j = 0; j < 14; j++) { const x = cx + (R() - 0.5) * 16, z = cz + (R() - 0.5) * 20; K.inst(G.cup, cup, K.mat4(x, 0.05, z, R() * 6, 1, 1, 1, Math.PI / 2, 0), false); }
      for (let j = 0; j < 4; j++) { const x = cx + (R() - 0.5) * 16, z = cz + (R() - 0.5) * 20; K.inst(G.box, R() < 0.6 ? MAT.sdSeatC : MAT.sdSeatB, K.mat4(x, 0.04, z, R() * 6, 1.4, 0.02, 0.2), false); }
      for (let j = 0; j < 2; j++) K.blood(cx + (R() - 0.5) * 14, cz + (R() - 0.5) * 18, 0.6 + R() * 0.8, 0.04);
    }, 'pitch' + k);
  }
  // a torn-down ad board lying on the grass, a stretcher, a steward's jacket
  K.chaos(-30, 33, () => { K.box(-30, 0.03, 33.5, 2.4, 0.18, 0.46, 0.2, f => f === 'top' ? 'sdBoards' : 'black'); K.solid(-30, 33.5, 2.4, 0.46, 0.2, 0.18, 'metal', 0, { vault: true }); });
  K.chaos(46, 10, () => { K.box(46, 0.03, 10, 0.3, 0.2, 1.0, 0.5, f => f === 'top' ? 'orange' : 'metal'); K.blood(46.4, 10.4, 1.3, 0.04); });
  for (const st of Object.values(STANDS)) {
    const [x, z] = P(st, 0, 6);
    K.chaos(x, z, () => { for (let j = 0; j < 40; j++) { const u = (R() - 0.5) * st.L * 1.9, i = Math.floor(R() * st.rows), [px, pz] = P(st, u, rowV(i) + 0.2); K.inst(G.cup, cup, K.mat4(px, rowY(i) + 0.02, pz, R() * 6, 1, 1, 1, R() < 0.5 ? Math.PI / 2 : 0, 0), false); } for (let j = 0; j < 6; j++) { const i = Math.floor(R() * st.rows), [px, pz] = P(st, (R() - 0.5) * st.L * 1.8, rowV(i) + 0.4); K.blood(px, pz, 0.5 + R() * 0.5, rowY(i) + 0.02); } }, 'stand' + st.id);
    // the concourse: overturned bins, blood, one kiosk on fire
    if (!st.main) { const [cx, cz] = P(st, 0, 13); K.chaos(cx, cz, () => { for (let j = 0; j < 5; j++) { const [px, pz] = P(st, (R() - 0.5) * st.L * 1.8, CONC + 1 + R() * 8); K.blood(px, pz, 0.6 + R() * 0.7, 0.04); } }, 'conc' + st.id); }
  }
  { const [x, z] = P(STANDS.S, -41, CONC + 2.5); K.chaos(x, z, () => { K.emitter({ x, y: 1.5, z, kind: 'smoke', rate: 2, t: 0 }); K.emitter({ x, y: 1.1, z, kind: 'fire', rate: 3, t: 0 }); K.hazard(x, z, 1.3, 'fire', 10); }); }
  // smoke over the city: it isn't only here
  for (const [x, z] of [[-240, -300], [280, -180], [-320, 160], [200, 340], [40, -420]]) K.chaos(x, z, () => K.emitter({ x, y: 4, z, kind: 'column', rate: 3, t: 0 }));

  // ================================================================ the city round the stadium (outside the bounds)
  { const R2 = rng(77);
    // four façade styles (a 14 m tile: four 3.5 m storeys, eight 1.75 m window bays), each with its own night map in
    // which only the lit windows glow (so the walls don't): grey concrete, dark glass curtain wall, brick, pale stone
    const STY = [
      { wall: '#7c7e80', win: '#1c232c', frame: '#55585c', band: '#8c8e90', w: 22, h: 36 },
      { wall: '#2a3440', win: '#18222e', frame: '#5c6670', band: '#3a4652', w: 30, h: 56, curtain: true },
      { wall: '#7a4a3a', win: '#1a1e24', frame: '#d8d2c4', band: '#8a5a48', w: 18, h: 34 },
      { wall: '#b8ae9a', win: '#20262e', frame: '#8a8270', band: '#a89e8a', w: 20, h: 38 },
    ];
    STY.forEach((st, si) => {
      const lit = [];
      const map = K.ctex(256, 256, (g, w, h) => {
        g.fillStyle = st.wall; g.fillRect(0, 0, w, h);
        for (let k = 0; k < 900; k++) { g.fillStyle = `rgba(0,0,0,${0.05 * R2()})`; g.fillRect(R2() * w, R2() * h, 2, 2); }
        for (let fl = 0; fl < 4; fl++) {
          const y0 = fl * 64; g.fillStyle = st.band; g.fillRect(0, y0 + 60, w, 4);   // the floor slab's edge
          for (let b = 0; b < 8; b++) {
            const x = b * 32 + (32 - st.w) / 2, y = y0 + (st.curtain ? 4 : 14), on = R2() < 0.32;
            g.fillStyle = st.frame; g.fillRect(x - 2, y - 2, st.w + 4, st.h + 4);
            const gr = g.createLinearGradient(0, y, 0, y + st.h); gr.addColorStop(0, '#3a4654'); gr.addColorStop(1, st.win); g.fillStyle = gr; g.fillRect(x, y, st.w, st.h);
            if (st.curtain) { g.fillStyle = st.frame; g.fillRect(x, y + st.h * 0.7, st.w, 2); }
            if (on) lit.push([x, y, st.w, st.h, R2()]);
          }
        }
        for (let k = 0; k < 6; k++) { const x = R2() * w; const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(30,25,20,0)'); gr.addColorStop(1, 'rgba(30,25,20,0.12)'); g.fillStyle = gr; g.fillRect(x, 0, 4, h); }   // weather streaks
      }, [1, 1]);
      const em = K.ctex(256, 256, (g, w, h) => {
        g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
        for (const [x, y, ww, hh, t] of lit) { g.fillStyle = t < 0.7 ? `rgb(${230 + t * 30 | 0},${190 + t * 50 | 0},${120 + t * 60 | 0})` : '#a8c4ff'; g.fillRect(x, y, ww, hh); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, y + hh * 0.55, ww, hh * 0.45); }   // (blinds half down)
      }, [1, 1]);
      add('sdTower' + si, std({ map, emissive: 0xffffff, emissiveMap: em, emissiveIntensity: 0, roughness: st.curtain ? 0.25 : 0.8, metalness: st.curtain ? 0.4 : 0 }), 14);
    });
    add('sdTowerCap', std({ map: K.TX.concreteTexture(0.7), color: 0x9a9c9e, roughness: 0.9 }), 4);
    for (let k = 0; k < 26; k++) {
      const a = k / 26 * Math.PI * 2 + R2() * 0.1, d = 135 + R2() * 25, x = Math.cos(a) * d, z = Math.sin(a) * d;
      const hw = 7 + R2() * 9, hd = 7 + R2() * 9, h = Math.round((14 + R2() * 46) / 3.5) * 3.5, m = 'sdTower' + (k % 4);
      K.box(x, 0, z, hw, h, hd, a, f => f === 'top' ? 'sdTowerCap' : f === 'bot' ? null : m);
      K.box(x, h, z, hw + 0.25, h + 1.1, hd + 0.25, a, f => f === 'bot' ? null : 'sdTowerCap');   // the parapet
      K.box(x + Math.cos(a) * hw * 0.3, h + 1.1, z - Math.sin(a) * hw * 0.3, hw * 0.3, h + 3.6, hd * 0.35, a, f => f === 'bot' ? null : 'sdTowerCap');   // the plant room on the roof
    }
  }

  // ---- the plaza and the concourses on match night: queues of standing fans (crowd layer), crowd barriers ----
  const standers = [];   // [x, z, yaw, colour]
  const queue = (x0, z0, x1, z1, n, yaw, dense = true) => { for (let k = 0; k < n; k++) { const t = R(); standers.push([x0 + (x1 - x0) * t + (R() - 0.5) * 0.9, z0 + (z1 - z0) * t + (R() - 0.5) * 0.9, yaw + (R() - 0.5) * 1.2, R() < 0.6 ? 0 : R() < 0.6 ? 1 : 3, dense]); } };   // (dense: a queue — you squeeze through it, it isn't a wall)
  for (const ux of [-28, 28]) { queue(ux - 2.5, -86, ux + 2.5, -72, 70, 0); for (const dx of [-3.4, 3.4]) { K.block(ux + dx, 0, -77.4, 0.04, 1.1, 4.1, 0, 'metal', 'metal', true); } }
  queue(-1.5, -80, 1.5, -71.5, 25, 0);
  queue(-20, -85, -12, -83, 22, Math.PI);           // the burger van queue
  queue(10, -79, 18, -76, 14, Math.PI);             // programmes
  queue(-60, -98, 60, -78, 120, 0, false);          // milling about the plaza
  queue(-60, 66, 60, 74, 60, Math.PI, false);       // walking in from the car park
  // (not inside the rooms on the concourse: first aid, the shop, the lobby, the toilets)
  const inRoom = (st, u) => st.main ? (u > -46.2 && u < -39.3) || (u > 37.3 && u < 46) || (u > -16.8 && u < -6.2) || Math.abs(u) < 6.6 : Math.abs(u - (st.L === 50 ? -14 : -12)) < 5.3;
  for (const st of Object.values(STANDS)) for (let k = 0; k < (st.main ? 50 : 70); k++) { let u = (R() - 0.5) * st.L * 1.8; const v = st.main ? 24 + R() * 4 : CONC + 4 + R() * 3, yaw = R() * 6.28, col = R() < 0.7 ? (st.away ? 2 : 0) : 3; if (inRoom(st, u)) continue; const [x, z] = P(st, u, v); standers.push([x, z, yaw, col]); }
  // ================================================================ the crowd (calm evening only): instanced fans
  const crowd = new THREE.Group(); K.level.add(crowd);
  const crowdUni = { cT: { value: 0 }, cCheer: { value: 0.15 }, cKeep: { value: 1 } };
  const crowdMat = (rough) => { const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: rough }); m.onBeforeCompile = sh => { Object.assign(sh.uniforms, crowdUni); sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float cT, cCheer, cKeep; attribute float aRank;').replace('#include <begin_vertex>', `#include <begin_vertex>
      { vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]); float ph = fract(sin(dot(ip.xz, vec2(12.9898, 78.233))) * 43758.5453);
        float b = max(0.0, sin(cT * (5.0 + ph * 3.0) + ph * 40.0)); transformed.y += b * b * cCheer * smoothstep(0.3, 0.9, position.y);
        transformed.x += sin(cT * 1.3 + ph * 20.0) * 0.03 * smoothstep(0.6, 1.3, position.y);
        transformed *= step(aRank, cKeep); }`); }; m.customProgramCacheKey = () => 'sdCrowd' + rough; return m; };
  // three instanced parts per person, far off: shirt + arms (team colours), trousers + shoes, skin (head, neck, hands),
  // hair / hat. Up close (see "real people" below) they're the game's own character models.
  const LT = tier(), sg = LT > 1 ? 5 : 7;
  const C3 = (rt, rb, h, seg = sg) => new THREE.CylinderGeometry(rt, rb, h, seg);
  const Sph = (r, ws, hs, p0 = 0, p1 = Math.PI) => new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, p0, p1);
  const Bx = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const torso = (y, z) => [C3(0.185, 0.145, 0.5, 8).scale(1, 1, 0.6).translate(0, y, z), Sph(0.185, 8, 3, 0, Math.PI / 2).scale(1.08, 0.42, 0.62).translate(0, y + 0.25, z)];
  const headK = (y, z) => [C3(0.048, 0.055, 0.12, 6).translate(0, y - 0.13, z), Sph(0.1, 9, 7).scale(0.86, 1.1, 0.97).translate(0, y, z), Bx(0.026, 0.045, 0.04).translate(0, y - 0.01, z + 0.095),
    Sph(0.022, 4, 3).scale(0.6, 1, 0.8).translate(-0.088, y, z), Sph(0.022, 4, 3).scale(0.6, 1, 0.8).translate(0.088, y, z)];
  const hairK = (y, z) => [Sph(0.106, 9, 4, 0, Math.PI * 0.5).scale(0.9, 1.08, 1.02).translate(0, y + 0.012, z - 0.006), Sph(0.104, 8, 3, Math.PI * 0.5, Math.PI * 0.22).scale(0.9, 1.08, 1.0).translate(0, y + 0.012, z - 0.012)];
  const C3o = (rt, rb, h, seg) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, true);   // (open-ended: the ends are hidden anyway)
  const SEAT = {   // (sitting: hips on the seat pan, thighs forward, hands on the knees; thousands of them, all far off: ~240 triangles)
    top: G.merge([C3o(0.185, 0.145, 0.5, 6).scale(1, 1, 0.6).translate(0, 0.84, -0.06), Sph(0.185, 6, 2, 0, Math.PI / 2).scale(1.08, 0.42, 0.62).translate(0, 1.09, -0.06),
      C3o(0.055, 0.047, 0.28, 4).rotateX(-0.25).translate(-0.215, 0.95, -0.03), C3o(0.055, 0.047, 0.28, 4).rotateX(-0.25).translate(0.215, 0.95, -0.03),
      C3o(0.047, 0.04, 0.26, 4).rotateX(-1.3).translate(-0.2, 0.79, 0.09), C3o(0.047, 0.04, 0.26, 4).rotateX(-1.3).translate(0.2, 0.79, 0.09)]),
    legs: G.merge([C3o(0.155, 0.15, 0.16, 6).scale(1, 1, 0.72).translate(0, 0.53, -0.04), C3o(0.082, 0.068, 0.46, 4).rotateX(Math.PI / 2).translate(-0.095, 0.5, 0.17), C3o(0.082, 0.068, 0.46, 4).rotateX(Math.PI / 2).translate(0.095, 0.5, 0.17),
      C3o(0.06, 0.048, 0.44, 4).translate(-0.095, 0.26, 0.38), C3o(0.06, 0.048, 0.44, 4).translate(0.095, 0.26, 0.38)]),
    head: G.merge([C3o(0.048, 0.055, 0.12, 5).translate(0, 1.14, -0.05), Sph(0.1, 7, 5).scale(0.86, 1.1, 0.97).translate(0, 1.27, -0.05),
      Sph(0.042, 4, 3).scale(0.85, 0.6, 1.3).translate(-0.17, 0.7, 0.21), Sph(0.042, 4, 3).scale(0.85, 0.6, 1.3).translate(0.17, 0.7, 0.21)]),
    hair: G.merge([Sph(0.106, 7, 3, 0, Math.PI * 0.55).scale(0.9, 1.08, 1.02).translate(0, 1.282, -0.056)]),
  };
  const STAND = {
    top: G.merge([...torso(1.21, 0), C3(0.055, 0.047, 0.3).rotateZ(0.06).translate(-0.218, 1.3, 0), C3(0.055, 0.047, 0.3).rotateZ(-0.06).translate(0.218, 1.3, 0),
      C3(0.047, 0.04, 0.27).rotateZ(0.03).translate(-0.228, 1.02, 0.01), C3(0.047, 0.04, 0.27).rotateZ(-0.03).translate(0.228, 1.02, 0.01)]),
    legs: G.merge([C3(0.155, 0.15, 0.16, 8).scale(1, 1, 0.68).translate(0, 0.92, 0), C3(0.082, 0.056, 0.86).translate(-0.095, 0.5, 0), C3(0.082, 0.056, 0.86).translate(0.095, 0.5, 0),
      Bx(0.1, 0.07, 0.25).translate(-0.095, 0.035, 0.04), Bx(0.1, 0.07, 0.25).translate(0.095, 0.035, 0.04)]),
    head: G.merge([...headK(1.63, 0.01), Sph(0.042, 5, 4).scale(0.75, 1.3, 0.6).translate(-0.232, 0.84, 0.02), Sph(0.042, 5, 4).scale(0.75, 1.3, 0.6).translate(0.232, 0.84, 0.02)]),
    hair: G.merge(hairK(1.63, 0.01)),
  };
  const SHIRT = [new THREE.Color(HOME.col), new THREE.Color(HOME.col2), new THREE.Color(0xd8b020), new THREE.Color(0x2a2c30), new THREE.Color(0x4a5a6a), new THREE.Color(0xe8e4dc)];
  const SKIN = [0xf0c8a8, 0xd8a880, 0xa87050, 0x6a4430, 0xe8b898, 0xc89070].map(c => new THREE.Color(c));
  const JEANS = [0x2a3448, 0x1c1e22, 0x3a3a3c, 0x4a4030, 0x2a3a5a, 0x5a5448].map(c => new THREE.Color(c));
  const HAIR = [0x1a1410, 0x3a2414, 0x6a4a2a, 0xb89060, 0x8a8a88, 0x2a1a10, 0x101010].map(c => new THREE.Color(c));
  // everybody's look, picked once (its own random sequence: the layout's stays as it was)
  const CR = rng(909), pick = a => a[Math.floor(CR() * a.length)];
  const dress = (list, seated) => list.map((f, idx) => {
    const [x, y, z, yaw, ci] = seated ? f : [f[0], 0, f[1], f[2], f[3]], hair = pick(HAIR), dense = !seated && !!f[4];
    return { x, y, z, yaw, s: 0.9 + CR() * 0.18, shirt: (CR() < 0.2 ? SHIRT[3 + Math.floor(CR() * 3)] : SHIRT[ci]).clone().multiplyScalar(0.8 + CR() * 0.3),
      legs: pick(JEANS), skin: pick(SKIN), hair, hat: CR() < 0.3 ? SHIRT[ci] : hair, kind: (CR(), (idx * 0.381966) % 1), near: false, rank: CR(), dense };   // (rank: who's still there as the crowd thins — the shader and the collision go by the same number)
  });
  const mtx = new THREE.Matrix4(), qY = new THREE.Quaternion(), vS = new THREE.Vector3(), vP = new THREE.Vector3(), AY = new THREE.Vector3(0, 1, 0), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const place = f => mtx.compose(vP.set(f.x, f.y, f.z), qY.setFromAxisAngle(AY, f.yaw), vS.setScalar(f.s));
  const people = (list, kit, seated) => {
    const n = list.length, parts = ['top', 'legs', 'head', 'hair'].map(k => new THREE.InstancedMesh(kit[k], crowdMat(k === 'head' ? 0.6 : 0.85), n));
    list.forEach((f, i) => {
      place(f); for (const im of parts) im.setMatrixAt(i, mtx);
      parts[0].setColorAt(i, f.shirt); parts[1].setColorAt(i, f.legs); parts[2].setColorAt(i, f.skin); parts[3].setColorAt(i, f.hat);   // (a third of them in a bobble hat)
    });
    const rk = new Float32Array(n); list.forEach((f, i) => { rk[i] = f.rank; });
    for (const im of parts) { im.geometry.setAttribute('aRank', new THREE.InstancedBufferAttribute(rk, 1)); im.castShadow = !seated; im.receiveShadow = true; im.computeBoundingSphere(); crowd.add(im); }
    // the standing crowd is solid (you can't walk through the queue); a fan who's gone takes his box with him
    if (!seated) for (const f of list) if (!f.dense) f.box = K.solid(f.x, f.z, 0.2 * f.s, 0.2 * f.s, 0, 1.75 * f.s, 'wood', 0, { navSkip: true, fan: true });
    return { list, parts, seated };
  };
  // 60% fewer fans everywhere (seats and the standing crowd), and fewer again on phones / tablets; an even spread,
  // picked without touching the layout's random sequence
  const keep = 0.4 * (LT > 1 ? 0.4 : LT ? 0.65 : 1), thin = l => l.filter((f, i) => (i * 0.6180339887) % 1 < keep);
  // (nobody standing inside a wall, a van, a coach, a hut or a crowd barrier)
  const clear = ([x, z]) => !W.boxes.some(b => !b.fan && b.y0 < 1.5 && b.y1 > 0.2 && Math.abs((x - b.x) * b.c - (z - b.z) * b.s) < b.hx + 0.3 && Math.abs((x - b.x) * b.s + (z - b.z) * b.c) < b.hz + 0.3);
  const farSeat = people(dress(thin(fans), true), SEAT, true), farStand = people(dress(thin(standers).filter(clear), false), STAND, false);

  // ---- real people up close: the nearest few dozen fans are the game's own character models (posed and baked once:
  // standing in the idle, or sat down), each recoloured to that fan's shirt, trousers, skin and hair. The far figure
  // of whoever's near is hidden (a zero-scale matrix) while the real one stands in for it.
  const KINDS = (globalThis.ZA && globalThis.ZA.KINDS) || null;
  const REAL = [];   // { pose, kind, im, attrs }
  const realMat = (md, pose) => {
    const m = new THREE.MeshStandardMaterial({ map: md.map, color: md.color, roughness: 0.8, transparent: md.transparent, alphaTest: md.alphaTest });
    m.defines = { CPART: md.part };
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, crowdUni, { cNorm: { value: md.norm }, cMix: { value: md.part === 3 ? 0.7 : 1 }, cTorso: { value: new THREE.Vector2(...(pose === 'sit' ? [0.62, 1.08] : [0.98, 1.45])) } });
      sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
uniform float cT, cCheer, cKeep; attribute float aRank; attribute vec3 iShirt, iLegs, iSkin, iHair; varying vec3 vTint, vTint2; varying float vHy;`).replace('#include <begin_vertex>', `#include <begin_vertex>
      #if CPART == 1
        vTint = iShirt;
      #elif CPART == 2
        vTint = iLegs;
      #elif CPART == 3
        vTint = iSkin;
      #elif CPART == 4
        vTint = iHair;
      #elif CPART == 5
        vTint = iLegs; vTint2 = iShirt;
      #else
        vTint = vec3(1.0);
      #endif
      { vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]); float ph = fract(sin(dot(ip.xz, vec2(12.9898, 78.233))) * 43758.5453);
        float b = max(0.0, sin(cT * (5.0 + ph * 3.0) + ph * 40.0)); transformed.y += b * b * cCheer * smoothstep(0.3, 0.9, position.y);
        transformed.x += sin(cT * 1.3 + ph * 20.0) * 0.03 * smoothstep(0.6, 1.3, position.y);
        transformed *= step(aRank, cKeep); }
      vHy = position.y;`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vTint, vTint2; varying float vHy; uniform float cNorm, cMix; uniform vec2 cTorso;').replace('#include <map_fragment>', `#include <map_fragment>
      #if CPART == 5
        { vec3 sc = pow(max(diffuseColor.rgb, vec3(0.0)), vec3(1.0 / 2.2)); float mx = max(max(sc.r, sc.g), sc.b), mn = min(min(sc.r, sc.g), sc.b), dl = mx - mn, sat = mx > 0.0 ? dl / mx : 0.0, hue = 0.0;
          if (dl > 0.0) { hue = mx == sc.r ? mod((sc.g - sc.b) / dl + 6.0, 6.0) : mx == sc.g ? (sc.b - sc.r) / dl + 2.0 : (sc.r - sc.g) / dl + 4.0; hue /= 6.0; }
          float l = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          if (sat > 0.45 && hue > 0.08 && hue < 0.2 && mx > 0.43) diffuseColor.rgb = vTint * clamp(l * 2.2, 0.4, 1.4);   // the yellow trousers: jeans
          else if (vHy > cTorso.x && vHy < cTorso.y && mx < 0.25 && sat < 0.6) diffuseColor.rgb = vTint2 * clamp(l * 22.0, 0.35, 1.3);   // the black top: a shirt / the club colours
        }
      #elif CPART > 0
        { float l = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)) * cNorm; diffuseColor.rgb = mix(diffuseColor.rgb, vTint * l, cMix); }
      #endif`);
    };
    m.customProgramCacheKey = () => 'sdHuman';
    return m;
  };
  const NEAR = { R: LT > 1 ? 12 : LT ? 16 : 24, cap: { stand: LT > 1 ? 8 : LT ? 14 : 36, sit: LT > 1 ? 8 : LT ? 14 : 40 }, t: 0 };
  const KIND_IDS = KINDS ? ['human', 'butler', 'coach', 'michelle'].filter(k => KINDS[k] && KINDS[k].root) : [];
  // (baked a body at a time after the map is up — one every 0.3 s, standing first — so loading doesn't wait for them)
  const REAL_TODO = KIND_IDS.length && !Q_NOREAL() ? ['stand', 'sit'].flatMap(pose => KIND_IDS.map(k => [pose, k])) : [];
  let realNew = false;
  const SRC = {}; for (const k of REAL_TODO.length ? KIND_IDS : []) SRC[k] = personSource(KINDS[k]);
  const bakeNext = () => {
    const [pose, k] = REAL_TODO.shift();
    try {
      const { geo, mats } = bakePerson(SRC[k], pose), cap = NEAR.cap[pose];
      const attrs = {}; for (const a of ['iShirt', 'iLegs', 'iSkin', 'iHair']) geo.setAttribute(a, attrs[a] = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3)); geo.setAttribute('aRank', attrs.aRank = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1));
      const im = new THREE.InstancedMesh(geo, mats.map(md => realMat(md, pose)), cap);
      im.count = 0; im.visible = false; im.castShadow = pose === 'stand'; im.receiveShadow = true; im.frustumCulled = true;
      crowd.add(im); REAL.push({ pose, kind: k, im, attrs }); realNew = true;
    } catch (e) { console.warn('stadium crowd: no real ' + k + ' ' + pose, e); }
    if (!REAL_TODO.length) for (const q in SRC) delete SRC[q];
  };
  const nearUpdate = focus => {
    if (REAL_TODO.length) bakeNext();
    if (!REAL.length || !focus) return;
    const fresh = realNew; realNew = false;   // (a body just baked: everybody near is re-dealt across the bodies)
    const R2 = NEAR.R * NEAR.R;
    for (const far of [farSeat, farStand]) {
      const pose = far.seated ? 'sit' : 'stand', meshes = REAL.filter(r => r.pose === pose), cap = NEAR.cap[pose];
      if (!meshes.length) continue;
      const cand = [];
      for (let i = 0; i < far.list.length; i++) { const f = far.list[i], dx = f.x - focus.x, dz = f.z - focus.z, dy = f.y - (focus.y || 0), d2 = dx * dx + dz * dz + dy * dy; if (d2 < R2) cand.push([d2, i]); }
      cand.sort((a, b) => a[0] - b[0]); const want = new Set(cand.slice(0, cap).map(c => c[1]));
      let dirty = fresh;
      far.list.forEach((f, i) => { const w = want.has(i); if (w === f.near) return; f.near = w; dirty = true; if (w) for (const im of far.parts) im.setMatrixAt(i, ZERO); else { place(f); for (const im of far.parts) im.setMatrixAt(i, mtx); } });
      if (!dirty) continue;
      for (const im of far.parts) im.instanceMatrix.needsUpdate = true;
      for (const r of meshes) r.im.count = 0;
      for (const i of want) {
        const f = far.list[i], r = meshes[Math.min(meshes.length - 1, Math.floor(f.kind * meshes.length))], k = r.im.count++;
        place(f); r.im.setMatrixAt(k, mtx);
        r.attrs.iShirt.setXYZ(k, f.shirt.r, f.shirt.g, f.shirt.b); r.attrs.iLegs.setXYZ(k, f.legs.r, f.legs.g, f.legs.b);
        r.attrs.iSkin.setXYZ(k, f.skin.r, f.skin.g, f.skin.b); r.attrs.iHair.setXYZ(k, f.hair.r, f.hair.g, f.hair.b); r.attrs.aRank.setX(k, f.rank);
      }
      for (const r of meshes) { r.im.visible = r.im.count > 0; r.im.instanceMatrix.needsUpdate = true; for (const a of Object.values(r.attrs)) a.needsUpdate = true; if (r.im.count) r.im.computeBoundingSphere(); }
    }
    if (!STADIUM.crowd) for (const r of REAL) if (r.pose === 'sit') r.im.visible = false;   // (after the blackout nobody sits calmly in the seats next to you)
  };

  // ================================================================ the match and the stewards (stadium.match.js)
  { const PN = (u, v) => P(N, u, v), PS = (st, u, v) => P(st, u, v);
    const xz = a => ({ x: a[0], z: a[1] });
    const posts = [
      { ...xz(PN(-32.4, 31.3)), yaw: Math.PI, ax: -2.5, az: 0, exit: [[-33, -100]] },
      { ...xz(PN(23.5, 31.8)), yaw: Math.PI, ax: -2.5, az: 0, exit: [[23.5, -100]] },
      { x: 3.1, z: -35.5, yaw: 0, ax: 0, az: 1.5, exit: [[0, -34], [0, -45.5]] },
      { x: -35, z: -38.7, yaw: Math.PI, ax: 4, az: 0, pitch: true, exit: [[-17.5, -38.7], [-17.2, -36.5], [0, -34], [0, -45.5]] },
      { x: 35, z: 38.7, yaw: 0, ax: -4, az: 0, pitch: true, exit: [[57.2, 38.7], [60, 48]] },
      { x: -57, z: 12, yaw: -Math.PI / 2, ax: 0, az: 4, pitch: true, exit: [[-57, 38.5], [-60, 48]] },
      { x: 57, z: -12, yaw: Math.PI / 2, ax: 0, az: -4, pitch: true, exit: [[57, -38.5], [60, -48]] },
      ...[STANDS.S, STANDS.E, STANDS.W].map(st => { const [x, z] = PS(st, 4, 11.9), [ex, ez] = PS(st, st.L + 3, 11.9), [ax, az] = PS(st, 7, 11.9); return { x, z, yaw: yawTo(st) + Math.PI, ax: ax - x, az: az - z, exit: [[ex, ez]] }; }),
    ];
    try { STADIUM.match = Q_HAS('nomatch') ? null : makeMatch(K, { S: STADIUM, KINDS, HOME, AWAY, stewards: posts }); } catch (e) { console.warn('stadium match off', e, e && e.stack); STADIUM.match = null; }
  }

  // ================================================================ lights: floodlights (4 spots), a floodlit fill
  const floods = [];
  for (const p of pylons) {
    const l = new THREE.SpotLight(0xf4f6ff, 0, 0, 0.62, 0.45, 0); l.position.set(p.hx, p.hy, p.hz); l.target.position.set(p.x * 0.15, 0, p.z * 0.15); l.castShadow = false;
    // (phones / tablets: two of the four, diagonally opposite, a little brighter — every light costs every pixel)
    if (tier() && (floods.length === 1 || floods.length === 2)) { floods.push(l); continue; }
    // desktop: the north-west pylon's lamps throw real shadows (players, goals, the boards, you) across the pitch; its
    // shadow map is only redrawn while the floodlights are on (see update) — toggling castShadow would recompile
    if (!tier() && floods.length === 1) { l.castShadow = true; l.shadow.mapSize.set(2048, 2048); l.shadow.bias = -0.0004; l.shadow.normalBias = 0.04; l.shadow.camera.near = 8; l.shadow.camera.far = 170; l.shadow.autoUpdate = false; l.shadow.needsUpdate = true; }
    K.level.add(l, l.target); floods.push(l);
  }
  const fill = new THREE.HemisphereLight(0xe4ecff, 0x40503a, 0); K.level.add(fill);
  // ---- emergency lighting: battery-backed EXIT signs (always lit), bulkhead lamps that come on when the mains go,
  // and a handful of real lights where you have to find your way (concourses, tunnel, corridor, back stairs). Pooled
  // on phones / tablets (world.addLight).
  const exitTex = K.ctex ? K.ctex(128, 48, (g, w, h) => { g.fillStyle = '#0a8a3a'; g.fillRect(0, 0, w, h); g.fillStyle = '#eafff0'; g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('EXIT ➜', w / 2, h / 2 + 1); }, [1, 1]) : null;
  const exitM = std({ map: exitTex, color: 0xffffff, emissive: 0xffffff, emissiveMap: exitTex, emissiveIntensity: 2.0, roughness: 0.5 });
  const emLamp = std({ color: 0xf4f6f0, emissive: 0xe8f0ff, emissiveIntensity: 0.15, roughness: 0.4 });
  const exitGeo = new THREE.PlaneGeometry(0.62, 0.24), lampGeo = new THREE.BoxGeometry(0.36, 0.1, 0.16);
  const exitSign = (st, u, v, y, face) => { const [x, z] = P(st, u, v); K.xadd(exitGeo, exitM, K.mat4(x, y, z, face), false); };
  for (const st of [STANDS.S, STANDS.E, STANDS.W]) {
    const back = yawTo(st);   // (a sign on the inside of the back wall faces the pitch)
    for (const u of st.L === 50 ? [-25, 0, 25] : [0]) exitSign(st, u, st.back - 0.03, 2.7, back);
    for (const s of [-1, 1]) exitSign(st, s * (st.L - 0.5), 13, 2.7, Math.atan2(-s * st.a[0], -s * st.a[1]));
    for (let u = -st.L + 6; u < st.L - 2; u += 12) { const [x, z] = P(st, u, (CONC + st.back) / 2 + 1.2); K.xadd(lampGeo, emLamp, K.mat4(x, 2.93, z, yawTo(st)), false); }
  }
  for (const s of [-1, 1]) exitSign(N, s * 49.6, 16.5, 2.75, -Math.PI / 2 * s);
  exitSign(N, -28, 29.7, 2.8, 0); exitSign(N, 28, 29.7, 2.8, 0); exitSign(N, 0, 1.0, 2.6, Math.PI);
  { const [x, z] = P(N, 46.5, 29.95); K.xadd(exitGeo, exitM, K.mat4(x, L1 + 2.5, z, 0), false); }   // over the switch-room door, inside
  for (let u = -47; u < 48; u += 11) { const [x, z] = P(N, u, 16.5); K.xadd(lampGeo, emLamp, K.mat4(x, 3.13, z, 0), false); const [x2, z2] = P(N, u + 4, 26); K.xadd(lampGeo, emLamp, K.mat4(x2, 5.33, z2, 0), false); const [x3, z3] = P(N, u + 2, 20); K.xadd(lampGeo, emLamp, K.mat4(x3, L1 + 2.9, z3, 0), false); }
  for (let v = 3; v < 15; v += 4) { const [x, z] = P(N, 0, v); K.xadd(lampGeo, emLamp, K.mat4(x + 0.9, 2.7, z, Math.PI / 2), false); }
  { const [x, z] = P(N, -33.35, 12.5); K.xadd(lampGeo, emLamp, K.mat4(x, 2.55, z, Math.PI / 2), false); }   // a bulkhead lamp over the red key cabinet
  const emLights = [[P(N, -24, 24), 4.6, 18], [P(N, 24, 24), 4.6, 18], [P(N, 0, 9), 2.6, 15], [P(N, 44, 25.5), L1 + 2.7, 14], [P(STANDS.S, 0, 13), 2.8, 18], [P(N, -38, 11.5), 2.8, 12]]   // (six: every light costs every pixel)
    .map(([[x, z], y, r]) => { const l = new THREE.PointLight(0xdfe8ff, 0, r, 2); l.position.set(x, y, z); l.castShadow = false; (W.addLight ? W.addLight(l, K.level) : K.level.add(l)); return l; });

  // ================================================================ "houses" for the concourses (camera + indoors)
  for (const c of concHouses) {
    const hw = (c.x1 - c.x0) / 2, hd = (c.z1 - c.z0) / 2;
    const H = { id: 900 + W.houses.length, x: (c.x0 + c.x1) / 2, z: (c.z0 + c.z1) / 2, yaw: 0, flip: 1, hw: hw + 0.05, hd: hd + 0.05, name: c.name, rooms: [[-hw, -hd, hw, hd, 'tile']], kind: 'room', wallH: c.yTop, doors: [], front: null, roof: new THREE.Group(), store: true, inside: [[(c.x0 + c.x1) / 2, (c.z0 + c.z1) / 2]] };
    H.yTop = () => c.yTop; if (c.yUnder != null) H.yUnder = () => c.yUnder;
    W.houses.push(H);
  }
  // (the Main Stand's record covers both floors: below 2.5 m the camera stays under 2.55 m; on the first floor
  //  W.camCeil uses yUnder, the first floor's ceiling)

  // ================================================================ zombie spawns (gates, corners, car park, plaza)
  const spawns = [];
  for (const [x, z] of [[-64, -64], [64, -64], [-64, 52], [64, 52], [-90, -40], [90, -40], [-90, 40], [90, 40], [-60, 100], [60, 100], [0, 100], [-80, -100], [80, -100], [0, -100],
    [-40, 50], [40, 50], [-68, 0], [68, 0], [-30, -64], [30, -64], [-56, -36], [56, -36], [-56, 36], [56, 36], [0, 50], [-20, 50]]) { if (!W.boxes.some(b => !b.fan && b.y0 < 1.0 && b.y1 > 0.1 && Math.abs((x - b.x) * b.c - (z - b.z) * b.s) < b.hx + 0.4 && Math.abs((x - b.x) * b.s + (z - b.z) * b.c) < b.hz + 0.4)) spawns.push({ x, z }); }

  // ================================================================ notes where the story says
  const NS = (k, y = 1.0) => { const s = SPOTS[k]; return { x: s.x, z: s.z, y: (s.y || 0) + y }; };
  const notes = [
    { id: 'programme', ...NS('programmeHut') }, { id: 'burgerVan', x: -17.5, z: -87.3, y: 1.2 }, { id: 'steward', ...sp(STANDS.E, -23, CONC + 2.9), y: 1.1 },
    { id: 'police', ...sp(N, -8, 22), y: L1 + 0.76 }, { id: 'physio', ...NS('physio', 0.82) }, { id: 'referee', ...sp(N, 28, 14.3), y: 0.78 }, { id: 'groundsman', x: SPOTS.groundsShed.x + 5, z: SPOTS.groundsShed.z + 2.2, y: 0.95 },
    { id: 'kid', ...NS('toiletsS') }, { id: 'pressBox', ...sp(N, 0, 15.6), y: L1 + 0.77 }, { id: 'pylon', x: 64.2, z: -54.2, y: 0.82 },
  ];

  // ================================================================ the live part: power, floodlights, the crowd, the screen
  let tAcc = 0, screenT = 0, lastLights = null, lastPower = null, emT = 0, screenKey = null;
  STADIUM.keyC = keyC; STADIUM.switchC = switchC;
  STADIUM.setPower = on => { STADIUM.power = !!on; };
  STADIUM.setLights = on => { STADIUM.lights = !!on; };
  // the crowd never vanishes in a frame: it thins out over ~10 s (fans fleeing), a few stay as silhouettes
  STADIUM.crowdTarget = 1;
  STADIUM.setCrowd = (on, now) => { STADIUM.crowd = !!on; STADIUM.crowdTarget = on ? 1 : 0.15; crowd.visible = true; if (now) crowdUni.cKeep.value = STADIUM.crowdTarget; };
  STADIUM.cheer = k => { crowdUni.cCheer.value = k; };
  STADIUM.update = (dt, focus) => {
    tAcc += dt; crowdUni.cT.value = tAcc; STADIUM.t = tAcc;
    if ((NEAR.t -= dt) <= 0 && focus) { NEAR.t = 0.3; nearUpdate(focus); const kv = crowdUni.cKeep.value; for (const f of farStand.list) if (f.box) f.box.off = !(f.rank < kv); }   // (the real people up close; the standing crowd's boxes)
    if (STADIUM.match) { try { STADIUM.match.update(dt, focus, W.time, STADIUM.phase, STADIUM.you || null); } catch (e) { if (!STADIUM.matchErr) { STADIUM.matchErr = true; console.error('stadium match', e); } } }
    { const ck = crowdUni.cKeep; ck.value += ((STADIUM.crowdTarget ?? 1) - ck.value) * Math.min(1, dt * 0.3); if (Math.abs(ck.value - STADIUM.crowdTarget) < 0.002) ck.value = STADIUM.crowdTarget; }
    // the key: once the red cabinet's been searched you have it, and the switch panel can be used
    if (keyC && keyC.searched && !STADIUM.hasKey) STADIUM.hasKey = true;
    if (switchC) {
      switchC.hidden = !LOOT_PANEL && !STADIUM.hasKey;
      if (switchC.searched && !STADIUM.hasKey && !STADIUM.switchedOn) { switchC.searched = false; STADIUM.lockedTry = (STADIUM.lockedTry || 0) + 1; }   // (no key: it won't turn)
      switchC.label = STADIUM.switchedOn ? 'Floodlight panel (breaker UP)' : STADIUM.hasKey ? 'Floodlight panel: turn the key, breaker UP' : 'Floodlight panel (locked: needs the key)';
    }
    if (switchC && switchC.searched && STADIUM.hasKey && !STADIUM.switchedOn) { STADIUM.switchedOn = true; STADIUM.switchT = 0; STADIUM.power = true; STADIUM.lights = true; }
    if (STADIUM.switchT != null) STADIUM.switchT += dt;
    // metal-halide lamps: after the switch they strike dim orange and warm up to white over ~1 minute (as Gus's note says)
    let warm = STADIUM.switchT != null ? Math.min(1, STADIUM.switchT / 60) : 1; warm = warm * warm * (3 - 2 * warm);
    if (STADIUM.switchT != null && STADIUM.switchT < 60) warm = Math.max(warm, 0.06 * Math.min(1, STADIUM.switchT / 1.5));   // (the strike: a dim glow at once)
    const on = STADIUM.lights ? warm : 0, night = W.night != null ? W.night : 1 - (W.daylight ?? 1);
    for (const l of floods) { l.intensity = on * 3.2 * (tier() ? 1.6 : 1) * (0.35 + 0.65 * night); l.color.setRGB(1, 0.78 + 0.22 * warm, 0.55 + 0.45 * warm); if (l.castShadow) l.shadow.autoUpdate = l.intensity > 0.05; }
    lens.emissiveIntensity = 0.15 + on * 7;
    // the fill: floodlit stands and pitch (fades with distance from the centre so the car park stays dark)
    const dc = focus ? Math.hypot(focus.x, focus.z) : 0;
    fill.intensity = on * night * 0.32 * Math.max(0.15, 1 - Math.max(0, dc - 70) / 50);
    if (STADIUM.lever) { const want = STADIUM.switchedOn ? 0.5 : 2.4; STADIUM.lever.rotation.x += (want - STADIUM.lever.rotation.x) * Math.min(1, dt * 6); }
    if (switchLamp) switchLamp.emissive.setHex(STADIUM.switchedOn ? 0x20ff40 : STADIUM.hasKey ? 0xffa010 : 0xff2010);
    if (STADIUM.power !== lastPower) { lastPower = STADIUM.power; GLOW.forEach((m, i) => { m.emissiveIntensity = STADIUM.power ? GLOW0[i] : 0; }); }
    // the emergency lamps: off with the mains on; after the blackout they glow (a slow flicker as the batteries come in)
    { const em = STADIUM.power ? 0 : Math.min(1, (emT += dt) / 2.5) * (0.92 + 0.08 * Math.sin(tAcc * 7.3)); if (STADIUM.power) emT = 0; emLamp.emissiveIntensity = 0.2 + em * 4; for (const l of emLights) { if (STADIUM.power) { l.intensity = 10; l.color.setHex(0xfff0dc); } else { l.intensity = em * 14; l.color.setHex(0xdfe8ff); } } }   // (mains on: they're the concourse's ordinary lights)
    // the big screen on its backup battery after the blackout: a flickering red EVACUATE
    if (!STADIUM.power) screenM.emissiveIntensity = STADIUM.broken ? 0.35 + 0.25 * Math.random() : 0;
    for (let k = 0; k < 4; k++) { const tm = MAT['sdTower' + k]; if (tm) tm.emissiveIntensity = night * (STADIUM.power ? 1.1 : 0.7); }   // (the city still has power)
    // the big screen: the score and the minute during the match; static and EVACUATE after
    screenT -= dt;
    if (screenT <= 0) {   // (redrawn only when something on it changes — each redraw re-uploads a 1024 × 384 texture; the static after the blackout every 1.5 s)
      screenT = STADIUM.broken ? 1.5 : 0.5;
      const key = STADIUM.broken ? Math.random() : STADIUM.score.join('-') + '|' + STADIUM.minute + '|' + (STADIUM.screenMsg || '') + '|' + STADIUM.power;
      if ((STADIUM.power || STADIUM.broken) && key !== screenKey) { screenKey = key; T.drawScreen(STADIUM.score[0], STADIUM.score[1], STADIUM.minute > 0 ? STADIUM.minute + '\'' : 'KICK-OFF 19:45', STADIUM.screenMsg || null, STADIUM.broken ? 1 : 0); }
    }
  };
  W.anims.push((dt, t, focus) => STADIUM.update(dt, focus));
  STADIUM.update(0, null);
  STADIUM.SPOTS = SPOTS;

  return {
    name: 'Harbor City Stadium',
    start: SPOTS.start,
    lz: { x: 0, z: 0, yaw: Math.PI / 2 },
    lzName: 'the centre circle',
    spawns, bounds: W.bounds, preset: 'stadium', ambient: 'city',
    names: { lz: 'the centre circle', town: 'Harbor City', stadium: 'Harbor City Stadium', home: HOME.name, away: AWAY.name, switch: 'the floodlight switch room' },
    notes, spots: SPOTS,
  };
}
export default buildMap;
