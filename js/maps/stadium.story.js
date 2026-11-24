// Zombie_Apocalypse — SOCCER STADIUM: the story. Harbor City Stadium, cup final night (made-up clubs, no real brands).
// Harbor City FC against Ironbridge Athletic, kick-off 19:45, a full house under the floodlights. Half the crowd ate at
// the new burger van outside the Main Stand before the game — its meat came off the same unmarked truck that
// delivered to Maple Hollow's Quick Stop that morning (radium and CO2). Thirty minutes in, a man in the East End
// collapses. Then he gets back up. The power fails, the floodlights die, and the police chain the gates.
// You were in the Main Stand with your cousin Ben. The only way out is up: the air ambulance can land on the pitch
// at 02:00 — but only if somebody gets the floodlights back on. The key is in the groundsman's store under the
// Main Stand, past the dressing rooms and the players' tunnel; the switch room is up the back stairs.
// Shape: see js/maps/kit.js "STORY MODULE" (and maple.story.js). Spots live in js/maps/stadium.js (SPOTS).
import { STADIUM, SPOTS } from './stadium.js';

export const title = 'Harbor City Stadium';
export const subtitle = 'Cup final night';
export const intro = [
  'Harbor City Stadium. Cup final night.',
  'Harbor City FC against Ironbridge Athletic. A full house.',
  'Ben\'s got the tickets. He\'s already queueing at the burger van.',
];
export const startHour = 18.5;      // 18:30 — the fans pouring in under the floodlights
export const kickoffHour = 19.75;   // 19:45
export const outbreakHour = 20.25;  // 20:15 — the 30th minute: it starts in the East End

// who's around on the calm evening (people.js can dress them; `at` is a spot key in stadium.js SPOTS)
export const cast = [
  { id: 'ben', name: 'Ben', role: 'your cousin, Harbor City mad', at: 'burgerVan', look: 'claret-and-sky scarf, bobble hat, puffer jacket', lines: ['"Two Big Anchors. You want one? Only six bucks."', '"Main Stand, row twelve! We\'ll see Okafor\'s face when he scores!"'] },
  { id: 'dot', name: 'Dot Pearce', role: 'programme seller, forty years at the club', at: 'programmeHut', look: 'club fleece, money belt, glasses on a chain', lines: ['"Programme, hon? Three dollars. Final edition."', '"Forty years I\'ve stood here. Never seen a crowd like it."'] },
  { id: 'marcus', name: 'Marcus Hale', role: 'head steward', at: 'gateN', look: 'hi-vis tabard, radio, flat cap', lines: ['"Tickets out, please. Bags open."', '"Gate A, through the turnstiles, up the end stairs."'] },
  { id: 'okafor', name: 'Danny Okafor', role: 'Harbor City captain (number 9)', at: 'tunnel', look: 'claret kit, captain\'s armband', lines: ['"Big night. Shout loud for us."'] },
  { id: 'reeves', name: 'Sgt. Anne Reeves', role: 'police match commander', at: 'controlRoom', look: 'police hi-vis, cap, radio earpiece', lines: ['"Nobody leaves. Those are my orders. I\'m sorry."'] },
  { id: 'gus', name: 'Gus Mbeki', role: 'groundsman, keeps the floodlight key', at: 'groundsShed', look: 'green overalls, ear defenders round his neck', lines: ['"Don\'t walk on my pitch."', '"The lights? Key\'s in the red cabinet in my store. Switch room\'s up the back stairs."'] },
  { id: 'jo', name: 'Jo Lindqvist', role: 'first-aider', at: 'firstAid', look: 'green paramedic uniform, kit bag', lines: ['"If anyone\'s been bitten, they stay with me. Nobody else touches them."'] },
];

export const notes = {
  programme: { title: 'Match programme — the Cup Final', text: 'HARBOR CITY FC v IRONBRIDGE ATHLETIC\nKick-off 19:45\n\nFROM THE MANAGER\nWe have not been in a final for thirty-one years. Tonight we play for everybody who has stood in the cold in this ground.\n\nGROUND INFORMATION\nFirst aid: Main Stand concourse, west end.\nNEW this season: the HARBOR GRILL burger van on the plaza. Try the Big Anchor!\n\nPlease do not enter the pitch at any time.' },
  burgerVan: { title: 'Delivery note taped inside the burger van', text: 'DELIVERY NOTE\nMeat: 60 kg beef patties, no brand\nFrom: [blank]\nPaid: CASH\n\nSame driver that does the Quick Stop out in Maple Hollow. Said he had "a few spare boxes going cheap."\n\n[In biro:] Smells funny. Fry it hot. — Kev' },
  steward: { title: 'Steward\'s incident log, East End', text: '20:06 — Male, 40s, collapsed Block M row 3. Grey. Not breathing.\n20:10 — First aid on scene. Pronounced dead.\n20:13 — Subject NOT dead. Bit the first-aider on the neck.\n20:14 — Second collapse Block N. Third, Block L.\n20:15 — They are all getting up. ALL OF THEM.\n20:17 — Power\'s gone. Requesting police open the gates. REFUSED.\n\nIf you find this: they all ate at the van.' },
  police: { title: 'Police briefing sheet (control room)', text: 'OPERATION FINAL\nMatch commander: Sgt. A. Reeves\n\n20:30 — COUNTY: contamination incident (Maple Hollow) now linked to this venue.\nORDER: ground is a CONTAINMENT ZONE. All gates chained. No egress.\n\nEvacuation by AIR ONLY, 02:00, from the pitch.\nThe pilots need the FLOODLIGHTS ON to land.\nFloodlight key: groundsman\'s store, Main Stand (G. Mbeki).' },
  physio: { title: 'Physio\'s clipboard', text: 'Pre-match:\n#4 Hughes — hamstring, strapped\n#9 Okafor — fine\n#11 Barros — upset stomach (ate a burger on the plaza?? told him NO)\n\n20:20:\n#11 Barros collapsed in the shower. Cold. Very cold.\nI\'ve shut him in the ice-bath room. I can hear him at the door. I don\'t know what to do.' },
  referee: { title: 'Referee\'s match report (unfinished)', text: 'Match abandoned, 31st minute.\n\nReason: crowd disorder — no.\nReason: spectators on the field of play, attacking —\n\nI can\'t write this. My assistant is outside the door. He keeps saying my name. His voice is wrong.\n\nThe tunnel gate is the only way onto the pitch from down here. Shut it behind you.' },
  groundsman: { title: 'Note on the groundsman\'s workbench', text: 'FLOODLIGHTS — HOW TO\n1. Key from the RED CABINET (this store)\n2. Up the BACK STAIRS outside the Main Stand, east end — the switch room\n3. Key in the panel, main breaker UP\n4. The lamps come on dim and orange, then white. Give them a minute.\n\n— Gus' },
  kid: { title: 'Scribbled on the back of a ticket', text: 'Me and Dad were in row 4. He went to get a pie and didn\'t come back.\n\nA lady in a yellow coat took me into the toilets and locked the door. She says to be quiet.\n\nThe singing stopped. Now it\'s just screaming.' },
  pressBox: { title: 'Radio commentator\'s notes, press box', text: '28\' — Something in the East End. Stewards running.\n30\' — Fans on the pitch. Not celebrating.\n31\' — Okafor has been — oh God.\n31\' — Lights out. The whole ground. Screaming in the dark.\n\nWe\'re still on air. I don\'t know who\'s listening. Stay in your homes.' },
  pylon: { title: 'Engineer\'s tag on the north-east floodlight pylon', text: 'INSPECTED — lamp bank OK\nWarm-up ~1 min after switch-on\nHelicopter landing: all four pylons must be lit (FAA rule). Switch room panel controls all four.\n\n— Quayline Electrical' },
};

export const radio = [
  [0.0, '*static*'],
  [1.4, '"...this is Air Ambulance Two-Nine, calling anyone inside Harbor City Stadium..."'],
  [5.2, '"...the ground is a containment zone. The gates will NOT be opened. Repeat, the gates will not be opened..."'],
  [9.6, '"...we can put down on the pitch at oh-two-hundred. ONLY if the floodlights are on. We cannot land blind..."'],
  [14.4, '"...we wait one minute on the centre circle. One minute. Then we lift..."'],
  [18.6, '"...floodlights on, centre circle, oh-two-hundred. Nobody who has been bitten. Two-Nine out."'],
  [22.0, '*static*'],
];

// the outbreak "broadcast": the stadium announcer and the big screen, then the TV news (text; voiced only by real recordings)
export const news = {
  anchor: [
    [4.6, 'ANNOUNCER: Ladies and gentlemen, the match has been... temporarily suspended. Please remain in your seats.'],
    [9.4, 'ANNOUNCER: Stewards, code red, East End, Blocks L to N. Code red.'],
    [13.8, 'ANNOUNCER: Please do NOT enter the field of play. Please — please stay calm —'],
    [18.2, 'ANNOUNCER: [feedback] ...the gates are closed by order of the police. Make your way to the... oh my God.'],
  ],
  reporter: [
    [23.0, 'NEWS: Breaking — an outbreak at Harbor City Stadium, linked to contaminated meat sold in Maple Hollow this morning.'],
    [28.0, 'NEWS: Police have chained the stadium gates. "Nobody leaves until we know what this is."'],
    [32.5, 'NEWS: The air ambulance service says it can evacuate from the pitch after dark — "if the ground can be lit."'],
  ],
};

// the calm evening's goal (main.js shows STORY.calmGoal before the outbreak); the chapters are the outbreak's, from
// stage 0, each with what finishes it (main.js doneKey: reach:<spot> · time:<h> · board); the key is a beat (below)
export const calmGoal = 'Find <b>Ben</b> at the burger van, get a <b>programme</b>, go through <b>Gate A</b> and take your seat: <b>Main Stand, row 12</b>. Kick-off <b>19:45</b>.';
export const chapters = [
  { id: 'down', title: 'PITCH INVASION', goal: 'The lights are out and the gates are chained. Get <b>down from the stand</b> into the <b>concourse</b>. Find a <b>weapon</b>.', done: 'reach:concourseN' },
  { id: 'tunnel', title: 'THE TUNNEL', goal: 'Through the <b>players\' tunnel</b> and the <b>dressing rooms</b>: the <b>floodlight key</b> is in the red cabinet in the <b>groundsman\'s store</b>.' },
  { id: 'lights', title: 'LIGHTS ON', goal: 'Up the <b>back stairs</b> of the Main Stand to the <b>switch room</b>. Turn the <b>floodlights</b> on. Hold out until <b>02:00</b>.' },   // (done in beats(): only once the lights are on — the helicopter can't land in the dark)
  { id: 'heli', title: 'THE HELICOPTER', goal: 'The air ambulance lands on the <b>centre circle</b>. It waits <b>one minute</b>. Get in — <b>E</b>.', done: 'board' },
];

export const tips = {
  stands: { title: 'THE STANDS', keys: [], text: 'The rows are steps: walk up and down them, or use the <b>aisles</b>. The <b>end stairs</b> go to the top gangway.' },
  gates: { title: 'CHAINED', keys: [], text: 'The police have shuttered the turnstiles. Find another way: the <b>corner doors</b>, the <b>reception</b>, the <b>tunnel</b>.' },
  lights: { title: 'FLOODLIGHTS', keys: ['E'], text: 'The <b>switch room</b> is up the Main Stand\'s <b>back stairs</b>. It needs the <b>key</b> from the groundsman\'s store.' },
  pitch: { title: 'THE PITCH', keys: [], text: 'Out in the open they see you from everywhere. Keep moving.' },
  boards: { title: 'AD BOARDS', keys: ['Space'], text: 'Jump the <b>ad boards</b> round the pitch — and the low wall in front of the stands.' },
};

export const ending = {
  kind: 'heli',
  at: { x: 0, z: 0, yaw: Math.PI / 2 },
  name: 'the centre circle',
  hour: 2,
  schedule: [{ day: 2, hour: 2 }, { day: 3, hour: 2 }],
  window: 60,
  // it only lands with the floodlights on (main.js / heli.js: if ready() is false at the hour, it circles and leaves)
  ready: () => STADIUM.switchedOn,
  notReady: 'The helicopter circles twice over the black stadium. Without the floodlights it can\'t land. It turns away.',
  win: 'YOU MADE IT',
  winText: 'The air ambulance lifts off the centre circle into the glare of the floodlights. Below, Harbor City Stadium is full again — and none of them are cheering.',
};

// chapter objectives and where notes lie (spot keys in stadium.js SPOTS)
export const objectives = ['concourseN', 'groundsShed', 'switchRoom', 'centreSpot'].map(k => ({ ...SPOTS[k] }));

// per-frame beats: the match clock and the crowd on the calm evening; the blackout at the outbreak; the lights
// coming back on; the story's own little moments (main.js passes { think, toast, bigText, setStage, later, world, ... })
const B = { cut: false, said: {}, last: null, newsT: 0 };
export function beats(G, api = {}) {
  const S = STADIUM; if (!S.update) return;
  const W = (api && api.world) || S.W, h = G && G.hour != null ? G.hour : W ? W.time : 0;
  const say = (k, txt, d = 3.2) => { if (B.said[k]) return; B.said[k] = true; if (api.think) api.think(txt, d); else if (api.toast) api.toast(txt); };
  const phase = G ? G.phase : 'calm';
  // what the match and the stewards (stadium.match.js) go by: the phase, where you are, the game's hooks
  S.phase = phase; S.api = api; S.kickoffHour = kickoffHour;
  { const pp = api.playerPos ? api.playerPos() : (G && G.player && G.player.s ? G.player.s.pos : null); S.you = pp ? { x: pp.x, z: pp.z, y: pp.y } : null; }
  // real time from the stadium's own clock (frame-rate independent; main.js doesn't pass dt)
  const now = S.t || 0, dt = B.last == null ? 0 : Math.max(0, Math.min(0.25, now - B.last)); B.last = now;
  if (phase === 'calm' || phase === 'news') B.live = true;   // (saw the match: a save loaded later finds the ground already emptied)
  if (phase === 'calm' || (phase === 'news' && !B.cut)) {
    // the match: kick-off at 19:45, the score, a roar for each goal, singing in between
    if (h >= kickoffHour) { S.minute = Math.min(45, Math.floor((h - kickoffHour) * 60)); S.screenMsg = null; } else { S.minute = 0; S.screenMsg = 'WELCOME TO HARBOR CITY STADIUM'; }
    // the goals: Harbor score (Okafor) and the away end's equaliser. With the match on the pitch (stadium.match.js) the
    // story only says which side's turn it is and the players score it; without it, the screen just changes
    if (S.match) {
      if (S.minute >= 10 && S.score[0] === 0) S.wantGoal = 0;
      else if (S.minute >= 21 && S.score[0] > 0 && S.score[1] === 0) S.wantGoal = 1;
    } else {
      if (S.minute >= 17 && S.score[0] === 0) { S.score[0] = 1; S.goalT = 4; S.goalBig = 0.32; }
      if (S.minute >= 26 && S.score[1] === 0) { S.score[1] = 1; S.goalT = 2.5; S.goalBig = 0.18; }   // (the away end's equaliser)
    }
    S.goalT = Math.max(0, (S.goalT || 0) - dt);
    S.cheer(S.goalT > 0 ? (S.goalBig || 0.32) : S.minute > 0 ? 0.08 : 0.04);
    if (!S.crowd) S.setCrowd(true);
    // the match plays on under the announcements; the power goes just after "...oh my God" (18.2 s)
    if (phase === 'news') { B.newsT += dt; S.halted = B.newsT > 4.6; if (B.newsT > 19) blackout(S); }   // ("the match has been temporarily suspended")
  } else if (!B.cut) blackout(S);
  // the panic: the ones still in their seats jump up and down for a few seconds before they get out (stadium.evac.js
  // walks everybody out: stood up a few seconds apart, along the rows, down / up the aisles, out of the corners to the gates)
  if (B.cut && B.panicT > 0) { B.panicT = Math.max(0, B.panicT - dt); S.cheer(B.panicT > 0 ? 0.3 * Math.min(1, B.panicT / 3) : 0); }
  if (S.hasKey) { say('key', 'The floodlight key. Now the switch room — up the back stairs, outside the Main Stand.'); if (phase === 'outbreak' && api.setStage) api.setStage(2, 1.2); }   // (THE TUNNEL is done: LIGHTS ON)
  if (S.lockedTry && S.lockedTry !== B.lockedSeen) { B.lockedSeen = S.lockedTry; if (api.think && !S.hasKey) api.think('Locked. It needs the floodlight key — Gus keeps it in the red cabinet in his store.', 3); }
  // LIGHTS ON is done when the floodlights are on and it's nearly two (not on the clock alone: in the dark the helicopter turns away)
  if (S.switchedOn && phase === 'outbreak' && G && Math.floor(G.stage) === 2 && h >= 1.5 && h < 12 && api.setStage) api.setStage(3, 0.8);
  if (S.switchedOn && (S.switchT || 0) > 8) say('lights', 'The lamps hum, glow orange... then white. The whole ground lit up like match night. They\'ll see that for miles.', 4);
  if (G && G.player && G.player.pos) {
    const p = G.player.pos, near = (k, r) => SPOTS[k] && Math.hypot(p.x - SPOTS[k].x, p.z - SPOTS[k].z) < r;
    if (near('tunnelGate', 4)) say('tunnel', 'The players\' tunnel. Studs on the concrete. It smells of liniment and something worse.');
    if (near('switchRoom', 4) && !S.hasKey) say('nokey', 'The panel needs a key. The groundsman\'s store — under the Main Stand.');
  }
}
function blackout(S) { B.cut = true; B.panicT = 10; S.setPower(false); S.setLights(false); S.setCrowd(false, !B.live); S.broken = true; S.screenMsg = 'EVACUATE'; S.cheer(0.3); }
// a fresh run (main.js may call this on restart)
export function reset() {
  Object.assign(B, { cut: false, said: {}, last: null, newsT: 0, panicT: 0, lockedSeen: 0, live: false });
  Object.assign(STADIUM, { power: true, lights: true, crowd: true, hasKey: false, switchedOn: false, switchT: null, score: [0, 0], minute: 0, broken: false, screenMsg: null, goalT: 0, goalBig: 0, lockedTry: 0, halted: false, wantGoal: null });
  if (STADIUM.match && STADIUM.match.reset) STADIUM.match.reset();
  if (STADIUM.keyC) STADIUM.keyC.searched = false;
  if (STADIUM.switchC) STADIUM.switchC.searched = false;
  if (STADIUM.setCrowd) STADIUM.setCrowd(true, true);
}

export default { title, subtitle, intro, startHour, kickoffHour, outbreakHour, calmGoal, cast, chapters, notes, radio, news, tips, ending, objectives, beats, reset };
