// Zombie_Apocalypse — JUNGLE CAVE: the story.
// You came up the coast with a small expedition (Dr. Elena Ruiz, the boat's skipper Tomas, the guide Kofi) to find
// the Halvorsen research team: five scientists who stopped answering the radio nine days ago. They were sampling a
// glowing mineral in the old cave under the mountain. The samples were what started it. The boat — the RIO LENTO —
// waits at the dock. Tomas says he leaves at 06:00, at first light, with or without you.
// Chapters move on as you do things; notes in tents, the lab and on the bodies tell the rest.
// (Same shape as js/story.js: NOTES, RADIO, CHAPTERS, TIPS; plus INTRO, CAST, ENDING and the map-specific bits.)

export const ID = 'jungle';
export const TITLE = 'Rio Verde';

// the opening card, before you get control (a calm, hot morning at the beach camp)
export const INTRO = {
  date: 'Day 1 — 08:00 — Rio Verde, the north coast',
  lines: [
    'Nine days ago the Halvorsen research team stopped answering the radio.',
    'Five scientists. A camp up the valley. A cave nobody local will go into.',
    'Dr. Ruiz hired the RIO LENTO and the three of you to bring them home.',
    'Tomas will keep the boat at the dock until first light tomorrow. Not a minute more.',
  ],
  start: 'beach',   // spawn key in the layout (jungle.js SPOTS.start)
};

// who's around on the calm morning (people.js can dress them; kept to ideas + positions keys in jungle.js)
export const CAST = [
  { id: 'ruiz', name: 'Dr. Elena Ruiz', role: 'expedition leader, virologist', at: 'beachCamp', look: 'khaki shirt, wide hat, satchel', lines: ['"Halvorsen was careful. Careful people don\'t go quiet for nine days."', '"Their camp is up the river. Start there."'] },
  { id: 'tomas', name: 'Tomas', role: 'skipper of the RIO LENTO', at: 'dock', look: 'faded blue cap, rubber boots', lines: ['"Six in the morning. I see the sun, I go."', '"Fuel for one trip. Don\'t make me waste it."'] },
  { id: 'kofi', name: 'Kofi', role: 'guide, knows the valley', at: 'trailhead', look: 'machete on his belt, green rain jacket', lines: ['"The bridges are old. One at a time."', '"My grandmother called that cave the throat. Nobody goes in the throat."'] },
  { id: 'nils', name: 'Nils Halvorsen', role: 'team lead (missing)', at: 'caveLab', look: 'torn lab coat over a fleece', lines: [] },
  { id: 'priya', name: 'Priya Das', role: 'geochemist (missing)', at: 'camp', look: 'headlamp, field vest', lines: [] },
];

export const NOTES = {
  manifest: { title: 'RIO LENTO — passenger list', text: 'RIO LENTO, charter, Rio Verde north coast.\n\n1. Dr. E. Ruiz\n2. K. Mensah (guide)\n3. — (you)\n\nReturn: departs dock 06:00, Day 2.\nFuel: one trip. Skipper will NOT wait.\n\n— T.' },
  campLog: { title: 'Halvorsen camp — field log', text: 'Day 3. Priya\'s samples from Chamber 2 fluoresce green without UV. Never seen anything like it. Geiger clicks, but low.\n\nDay 5. The mineral is giving off gas in water. CO2 and something else. Marco got a lungful at the underground lake. Headache, fever.\n\nDay 6. Marco bit Dr. Lind. He doesn\'t remember doing it.\n\nDay 7. Marco is dead.\n\nDay 7, evening. Marco is walking around.' },
  priya: { title: 'Priya\'s notebook, in her tent', text: 'Sample V-12: radium-bearing, embedded in a calcite crust. When it gets wet it fizzes. The gas makes people\'s blood glow under the lamp.\n\nI told Nils to stop. He moved the whole lab into the cave so "nothing leaves the mountain."\n\nIt already left. The bats drink from that lake.' },
  generator: { title: 'Taped to the generator', text: 'GENNY RULES\n- Diesel only (the red cans in the supply hut)\n- Run it 2 hrs max at night\n- Do NOT run it in the cave tunnel, Nils, I am serious\n\n— P.' },
  ruins: { title: 'A rubbing taken in the ruins', text: '[Charcoal on paper. A carved figure with its mouth open; light pouring out of it. Lines of people walking into a mountain.]\n\nKofi\'s translation, pencilled underneath:\n"Those who drink from the throat sleep, and rise hungry. Seal the throat."\n\nNils had written next to it: superstition. ← well.' },
  dock: { title: 'Chalked on the dock post', text: 'BOAT LEAVES AT 6\nTOMAS\n\n[Underneath, in a different hand:]\nTHEY CAME OUT OF THE TREES AT DUSK. STAY ON THE WATER.' },
  lab: { title: 'Nils Halvorsen — last entry', text: 'Lind turned. Then Okafor. Priya ran for the radio at the camp; I never heard her call.\n\nI am in the lab with the door barred. The samples are in the steel case. They must NOT reach the mainland.\n\nIf you\'re from the boat: the cave radio still works. Call the coast guard. Tell them to bring fire.\n\nI\'m cold. My hand is grey.' },
  bat: { title: 'Scrawled on a crate in the bat chamber', text: 'DONT SHINE THE LIGHT UP\nTHEY ALL WAKE' },
  bridge: { title: 'Nailed to the bridge post', text: 'MAX 2 PEOPLE\nBoards 9 + 14 rotten\n— K.' },
};

// the cave radio, once you switch it on in the lab (seconds from switching it on, text)
export const RADIO = [
  [0.0, '*static, then a hiss of water dripping on metal*'],
  [1.8, '"...Coast Guard station Punta Gris to any station, Rio Verde, we read you, go ahead..."'],
  [6.0, '"...copy, outbreak on the north coast. Do NOT bring any samples aboard any vessel..."'],
  [10.4, '"...your charter RIO LENTO reports she sails from the north dock at zero-six-hundred..."'],
  [14.6, '"...she will hold at the dock for TWO minutes after first light. Then the island is closed. Nobody leaves..."'],
  [19.4, '"...anyone bitten stays behind. Repeat: north dock, zero-six-hundred. Godspeed..."'],
  [23.0, '*static*'],
];

// a crackling call on the expedition walkie-talkie as the outbreak reaches the beach camp (the "news" moment)
export const BROADCAST = {
  at: 12.0,   // hour
  title: 'WALKIE-TALKIE — CHANNEL 3',
  lines: [
    '"Ruiz to everyone. Ruiz to everyone. Something came out of the trees at the beach camp."',
    '"It was Okafor. From the Halvorsen team. He\'s — his skin is grey. He bit Kofi."',
    '"Don\'t come back to the beach. Find their camp. Find out what they found. Find a radio."',
    '"...Tomas, keep the boat. Keep the BOAT—" *static*',
  ],
};

// what you're doing now, for each chapter (main.js adds the checklist and the countdown)
export const CHAPTERS = [
  { id: 'trail', title: 'THE EXPEDITION', goal: 'Follow the river trail north. Find the <b>Halvorsen research camp</b>.', done: 'reach:camp' },
  { id: 'camp', title: 'THE CAMP', goal: 'Search the camp: <b>tents</b>, the <b>huts on stilts</b>, the <b>generator</b>. Find a <b>flashlight</b> and the <b>field log</b>.', done: 'note:campLog' },
  { id: 'throat', title: 'THE THROAT', goal: 'Into the cave under the mountain. Find the <b>cave lab</b> and the <b>radio</b>. Press <b>F</b> for light.', done: 'radio' },
  { id: 'night', title: 'THE NIGHT', goal: 'Get out of the mountain and back down the valley to the beach. Survive until <b>06:00</b>. Be at the <b>north dock</b>.', done: 'time:5.9' },
  { id: 'boat', title: 'THE BOAT', goal: 'When the <b>RIO LENTO</b> comes in to the <b>north dock</b> at 06:00, Tomas waits <b>two minutes</b> (120 s). Get aboard — <b>E</b>.', done: 'board' },
];

// the way out: the boat at the end of the dock (jungle.js SPOTS.boat), at 06:00 on day 2, for 120 seconds
export const ENDING = {
  kind: 'boat',
  at: 'boat',          // spot key in jungle.js
  hour: 6.0,           // first light
  window: 120,         // seconds it waits
  prompt: 'Board the RIO LENTO',
  win: 'YOU MADE IT',
  winText: 'The RIO LENTO pulls away from the dock as the sun comes up over Rio Verde. Behind you, the jungle is full of shapes. Tomas doesn\'t look back.',
  lose: 'THE BOAT LEFT WITHOUT YOU',
  loseText: 'You watch its wake fade into the morning haze. The island is closed now.',
};

// short tips, shown once each, at the moment they matter
export const TIPS = {
  cave: { title: 'THE CAVE', keys: ['F'], text: 'It\'s pitch black in there. Press <b>F</b> for your flashlight — or carry a <b>lantern</b>.' },
  bridge: { title: 'ROPE BRIDGE', keys: [], text: 'The bridges hold — mostly. They\'re the only dry way across the river.' },
  river: { title: 'THE RIVER', keys: [], text: 'The water is deep and fast. Cross on the <b>bridges</b> or the <b>fallen log</b> downstream.' },
  climb: { title: 'CLIMB', keys: ['Space'], text: 'Ladders and stairs take you up to the <b>stilt huts</b> and the <b>temple</b>.' },
};

// objective markers by chapter (spot keys in jungle.js SPOTS)
export const OBJECTIVES = { trail: 'camp', camp: 'camp', throat: 'caveLab', night: 'dock', boat: 'boat' };

// where each note lies (spot keys in jungle.js; the map places a paper there and a container gets the note)
export const NOTE_SPOTS = { manifest: 'beachCamp', dock: 'dock', campLog: 'campLab', priya: 'campTent', generator: 'campGen', ruins: 'ruinsAltar', bridge: 'bridgeN', bat: 'batCave', lab: 'caveLab' };

// ---- the map-system story interface (see kit.js, "STORY MODULE") ----
export const title = 'Rio Verde';
export const subtitle = 'The Halvorsen Expedition — Day 1';
export const intro = INTRO.lines;
export const startHour = 8;          // the calm morning at the beach camp ...
export const outbreakHour = 12;      // ... until Ruiz's call on the walkie-talkie
export const chapters = CHAPTERS.map(c => ({ title: c.title, goal: c.goal, id: c.id, done: c.done }));
export const notes = NOTES;
export const radio = RADIO;
export const tips = TIPS;
// the noon "broadcast": a call on the expedition walkie-talkie (text; main.js shows it as captions — no TTS)
export const news = {
  anchor: [[2.0, BROADCAST.lines[0]], [7.0, BROADCAST.lines[1]], [12.5, BROADCAST.lines[2]]],
  reporter: [[18.0, BROADCAST.lines[3]]],
  title: BROADCAST.title,
};
// the way out: the RIO LENTO at the north dock, first light (06:00) on day 2, 2 minutes (then the island is closed)
export const ending = {
  kind: 'boat',
  at: { x: 40.2, z: 139, yaw: 0 },   // = jungle.js LZ (on the dock beside the boat)
  name: 'the north dock',
  // the boat comes in from the east (heli.js boatPath) and lies along the dock's east side, its door at the dock's
  // edge where the rail has its gap: centre 3.1 m east of the dock's middle, level with the LZ; it floats on the sea
  vehicle: 'boat', dockSide: 3.1, dockOut: -0.5, waterY: -0.5,
  hour: ENDING.hour,
  schedule: [{ day: 2, hour: 6 }],
  window: ENDING.window,
  prompt: ENDING.prompt, win: ENDING.win, winText: ENDING.winText, lose: ENDING.lose, loseText: ENDING.loseText,
};
// map-specific moments, run every frame by main.js. api: { think, toast, bigText, setStage, later, world, SND, spawnZombie }
// (all calls guarded: whatever the host passes, this never throws)
export function beats(G, api) {
  const W = api && api.world, P = G && (G.player || G.P), pos = P && (P.s ? P.s.pos : P.pos);
  if (!W || !W.jungle || !pos) return;
  const S = W.jungle.SPOTS, B = (G.jungleBeats ||= {}), near = (sp, r) => sp && Math.hypot(pos.x - sp.x, pos.z - sp.z) < r;
  const say = (k, txt) => { if (B[k]) return; B[k] = true; try { (api.think || api.toast || (() => {}))(txt); } catch (e) { /* host without captions */ } };
  if (near(S.bridgeN, 14)) say('bridge', 'The bridge creaks. Two boards are missing in the middle. Don\'t look down.');
  if (near(S.camp, 22)) say('camp', 'The Halvorsen camp. Nobody\'s been here for days... the generator\'s cold.');
  if (near(S.caveMouth, 10)) say('mouth', 'The Throat. Cold air is breathing out of it. I need a light in there — F.');
  if (near(S.lake, 16)) say('lake', 'The water is glowing. That\'s the stuff from the samples.');
  if (near(S.caveLab, 12)) say('lab', 'Their lab. The radio\'s still on the bench.');
  if (near(S.ruins, 18)) say('ruins', 'Ruins. Older than anything on the maps.');
  if (near(S.waterfall, 16)) say('falls', 'The waterfall\'s loud enough to cover my footsteps. And theirs.');
  if (near(S.dock, 10)) say('dock', 'The dock. Tomas, please still be here.');
  // the camp generator: walk up to it and it gets started (the bulb string and the camp light come on after dark)
  if (S.campGen && near(S.campGen, 2.2) && !W.jungle.genOn) { W.jungle.genOn = true; say('gen', "Diesel's still in it... one pull, two — it catches. There'll be light here tonight."); }
}
export default { id: 'jungle', title, subtitle, intro, startHour, outbreakHour, cast: CAST, chapters, notes, radio, tips, news, ending, objectives: OBJECTIVES, noteSpots: NOTE_SPOTS, beats };
