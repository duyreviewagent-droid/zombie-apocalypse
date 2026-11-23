// Zombie_Apocalypse — DESERT VILLAGE (Arroyo Seco, "Dry Creek"): the story.
// A sun-baked adobe village on the old highway, a dry riverbed, a palm grove, a dirt airstrip. Market day.
// Three weeks without rain; the cistern ran dry on Tuesday, so since Wednesday everybody has drawn from the old
// village well in the market square. Nobody knew why the water had started to taste of metal and fizz in the cup:
// a leaking drum field in the mesa upstream (radium-laced mine tailings and a CO2 vent) had reached the aquifer.
// At noon the village radio carries the news: do not drink the water. By then half the village has.
// People turn after drinking. The way out: a supply plane — the mail Cessna from Las Piedras — lands on the dirt
// airstrip east of the highway at first light, 05:30, and the pilot waits ninety seconds with the engine running.
// Same shape as maple.story.js (see kit.js, "STORY MODULE"); spot keys refer to SPOTS in desert.js.

export const id = 'desert';
export const title = 'Arroyo Seco';
export const subtitle = 'Market day, the third week without rain';
export const intro = [
  'Arroyo Seco. Saturday. Market day.',
  'Three weeks without rain. The cistern is dry.',
  'Since Wednesday, everyone drinks from the old well.',
  'The water tastes of pennies. It fizzes in the cup.',
];
export const startHour = 8.5;        // a hot, calm morning in the market
export const outbreakHour = 12;      // the noon radio bulletin
export const start = 'home';         // SPOTS.home in desert.js

// who's around on the calm morning (positions are spot keys in desert.js)
export const cast = [
  { id: 'amira', name: 'Amira Haddad', role: 'runs the spice stall; your neighbour', at: 'market', look: 'indigo headscarf, apron dusted with paprika', lines: ['"Third week. If it does not rain soon I will be selling dust."', '"The well water? It tastes like an old coin. My husband says it is good for the blood."'] },
  { id: 'tomas', name: 'Father Tomás', role: 'keeps the chapel and its bell tower', at: 'chapel', look: 'black cassock, straw hat, sandals', lines: ['"I ring the bell at noon. Today I may ring it for rain."', '"The tower stairs are steep. The view is worth it."'] },
  { id: 'rafi', name: 'Rafi', role: 'mechanic at the old gas station', at: 'gas', look: 'oil-black overalls, cap on backwards', lines: ['"No gas since the tanker skipped us. I sell cold soda. Cold-ish."', '"The mail plane? Ines lands it on the strip at dawn. They say she is coming tomorrow, extra run."'] },
  { id: 'ines', name: 'Ines Varga', role: 'bush pilot, flies the mail Cessna from Las Piedras', at: 'cafe', look: 'flight jacket despite the heat, aviators', lines: [] },
  { id: 'omar', name: 'Old Omar', role: 'well-keeper, drinks first every morning', at: 'well', look: 'white beard, long robe, walking stick', lines: ['"I have drunk from this well for seventy years."', '"The bubbles? The earth is breathing. It is a blessing."'] },
  { id: 'lucia', name: 'Lucía', role: 'nurse at the little clinic', at: 'clinic', look: 'pale blue scrubs, sun hat', lines: ['"Six people with fevers since Thursday. All of them say their teeth hurt."', '"Drink the bottled water if you have it. Humour me."'] },
  { id: 'kids', name: 'The Haddad twins', role: 'kids chasing a football through the lanes', at: 'square', look: 'one red shirt, one green', lines: ['"Can you kick it over the chapel? Rafi can."'] },
];

export const notes = {
  bulletin: { title: 'Pinned to the clinic door', text: 'CLINIC — ARROYO SECO\n\nFever, aching teeth, grey fingernails?\nCOME IN. Do not wait.\n\nUntil the cistern is refilled, please BOIL well water.\n\n— Lucía, nurse' },
  omar: { title: 'Omar\'s well book (a school exercise book)', text: 'Wed — cistern dry. Opened the old well. Rope new. Water cold and good.\nThu — water fizzing. Taste of metal. Bucket comes up warm???\nFri — 31 buckets drawn. Hassan\'s goats will not drink it. Goats are fools.\nSat — I do not feel well. My hands are blue at the nails. I will drink more water; it is the heat.' },
  survey: { title: 'A survey report, in the jeep at the wadi', text: 'MESA ROJA — tailings field, site 4\n\nDrums from the old radium mine (1950s) are corroding. Seepage confirmed into the wadi gravels. CO2 venting from the fault line under the mesa: ground water is carbonated and HOT with radium salts.\n\nDownstream wells MUST be closed.\n\nReport filed: 6 weeks ago.\nAction taken: none.' },
  rafi: { title: 'Chalked on the gas station roller door', text: 'NO GAS\nNO WATER\nNO DIESEL\n\nGONE TO THE STRIP\nPLANE AT DAWN\n— R.' },
  chapel: { title: 'The chapel register, last page', text: 'Saturday. Baptism of the Ortiz baby postponed.\n\nNoon: rang the bell. They came — but not for prayer. They came for the sound.\n\nI have barred the chapel. I am in the tower. The stairs are narrow; one at a time, they cannot rush me.\n\nIf they hear the bell, they come. Remember that. Ring it and run the other way.\n\n— T.' },
  ines: { title: 'Radio log, the airstrip shack', text: 'MAIL RUN — Las Piedras → Arroyo Seco\n\nSun 05:30 local, strip 09. Engine running. 90 seconds on the ground, then I go. Nobody bitten comes aboard.\n\nLight the barrels along the strip if you can — I\'ll see them from the ridge.\n\n— I.V.' },
  market: { title: 'Price list on Amira\'s stall', text: 'Saffron ........ 40\nCumin ........... 6\nPaprika ........ 5\nDates (kg) .... 9\nWater (bottle) 3  ← 8 ← 15 ← SOLD OUT' },
  kid: { title: 'A drawing in crayon, under a bed', text: '[A house, a well, a sun. Stick people with big round eyes standing round the well. One is lying down.]\n\nMY FAMILY. GRANDPA IS SLEEPING.\nHE WILL WAKE UP.' },
  tower: { title: 'Scratched into the water tower railing', text: 'ARROYO SECO 1962\n\nUnder it, fresh:\nCAN SEE THE STRIP FROM UP HERE\nTHEY CANT CLIMB\nWAIT FOR THE PLANE' },
};

// the village radio (a battery set in the café), switched on after the outbreak: [seconds from switching on, text]
export const radio = [
  [0.0, '*static, a fragment of music, static*'],
  [2.0, '"...Radio Las Piedras with an emergency notice for the villages of the Arroyo Seco valley..."'],
  [6.4, '"...the provincial water authority confirms the aquifer is contaminated with radium and carbon dioxide from the old Mesa Roja mine..."'],
  [11.6, '"...do NOT drink from wells. Persons who have drunk the water may become violent. Do not approach them..."'],
  [16.4, '"...the road to Las Piedras is closed by the army at the Kilometre 40 checkpoint..."'],
  [20.0, '"...a relief flight will land at the Arroyo Seco strip at zero-five-thirty. It will wait ninety seconds..."'],
  [24.6, '"...anyone with a bite will be refused. Repeat: the strip, zero-five-thirty..."'],
  [28.0, '*static*'],
];
// the noon bulletin, as it plays from every radio in the market: anchor then field reporter
export const news = {
  anchor: [
    [4.0, 'This is Radio Las Piedras. We interrupt the midday music with an urgent health notice.'],
    [8.6, 'Officials report that the well water in Arroyo Seco is contaminated with radium and carbon dioxide leaking from the old Mesa Roja mine.'],
    [14.0, 'Residents who drank the water are reported to be feverish, confused — and in some cases, violent.'],
    [18.4, 'Our reporter reached the village by phone this morning.'],
  ],
  reporter: [
    [22.4, 'REPORTER: ...I\'m at the market square. There\'s a crowd round the old well — an elderly man has collapsed by the bucket —'],
    [27.6, 'REPORTER: They\'re helping him up. He\'s — no. No, he\'s biting her. HE\'S BITING HER —'],
    [32.0, 'REPORTER: Everybody\'s running — get inside! Get INSIDE —' ],
  ],
};

export const chapters = [
  { id: 'begin', title: 'IT BEGINS', goal: 'Something is wrong at the <b>well</b>. Get away from the market square — find somewhere with a <b>door</b>.', done: 'time:12.6' },
  { id: 'water', title: 'CLEAN WATER', goal: 'Don\'t drink from the well. Find <b>bottled water</b> and supplies: the <b>market stalls</b>, the <b>clinic</b>, the <b>gas station</b>.', done: 'items:water' },
  { id: 'radio', title: 'THE RADIO', goal: 'Find a working <b>radio</b> — the <b>café</b> on the square, or the <b>airstrip shack</b>.', done: 'radio' },
  { id: 'night', title: 'THE NIGHT', goal: 'Survive the night. Get high: <b>roofs</b>, the <b>chapel tower</b>, the <b>water tower</b>. Be at the <b>airstrip</b> by <b>05:30</b>.', done: 'time:5.4' },
  { id: 'plane', title: 'THE PLANE', goal: 'The <b>mail plane</b> is on the strip. Ines waits <b>ninety seconds</b>. Get aboard — <b>E</b>.', done: 'board' },
];

export const tips = {
  roofs: { title: 'FLAT ROOFS', keys: ['Space'], text: 'Every house has a <b>stair</b> in its courtyard up to the roof. They can\'t climb stairs in a crowd — the roofs are safer.' },
  heat: { title: 'THE HEAT', keys: [], text: 'It\'s over 40°C. The sun dries you out <b>fast</b>. Shade, bottled water, and <b>never the well</b>.' },
  sandstorm: { title: 'SANDSTORM', keys: [], text: 'A sandstorm is coming over the dunes. You won\'t see far — <b>neither will they</b>.' },
  bell: { title: 'THE BELL', keys: [], text: 'The chapel bell carries across the whole valley. Ring it — and everything that can walk comes to the square.' },
};

// objective markers per chapter (spot keys in desert.js SPOTS)
export const objectives = { begin: 'home', water: 'market', radio: 'cafe', night: 'strip', plane: 'plane' };
// where each note lies (spot keys in desert.js SPOTS; the map puts a container at each)
export const noteSpots = { bulletin: 'clinic', omar: 'well', survey: 'jeep', rafi: 'gas', chapel: 'tower', ines: 'shack', market: 'market', kid: 'kidHouse', tower: 'waterTower' };

// the way out: the mail plane on the strip, 05:30 the first night (and once more the next), ninety seconds
export const ending = {
  kind: 'plane',
  at: { x: 92, z: -62, yaw: Math.PI },   // SPOTS.plane: the turning pad at the north end of the strip
  name: 'the Arroyo Seco airstrip',
  hour: 5.5,
  schedule: [{ day: 2, hour: 5.5 }, { day: 3, hour: 5.5 }],
  window: 90,
  prompt: 'Board the plane',
  win: 'YOU MADE IT',
  winText: 'The little Cessna claws its way off the dirt strip as the sun comes up over the mesas. Below, the village is a ring of shapes round the well. Ines doesn\'t say anything. She hands you a bottle of water.',
  lose: 'THE PLANE LEFT WITHOUT YOU',
  loseText: 'You watch it climb into the pink sky until it\'s a speck over the dunes. The strip is quiet. Not for long.',
};

// map moments: the well (drinking from it is a bad idea), the bell. api: { think, toast, bigText, setStage, later, world, SND, spawnZombie }
export function beats(G, api) {
  if (!G || !api || G.state !== 'play') return;
  const S = (G.desert ||= { wellWarned: false, stripSeen: false });
  const pp = api.playerPos ? api.playerPos() : api.player ? (api.player.s ? api.player.s.pos : api.player) : null;
  if (!pp) return;
  const hour = G.hour ?? 12;
  if (!S.wellWarned && Math.hypot(pp.x - (-4), pp.z - (-4)) < 3.2) {
    S.wellWarned = true;
    if (api.think) api.think(hour >= 12 || hour < 6 ? 'The well. That smell — like hot metal. I\'m not drinking that.' : 'The old well. The water\'s fizzing in the bucket. Weird.');
  }
  if (!S.stripSeen && Math.abs(pp.x - 92) < 9 && pp.z > -96 && pp.z < 36) {
    S.stripSeen = true;
    if (api.think) api.think(hour >= 5.5 && hour < 12 ? 'The strip. Come on, Ines...' : 'The airstrip. The plane comes at half past five. I need to be here — alive.');
  }
}

export default { id, title, subtitle, intro, startHour, outbreakHour, start, cast, notes, radio, news, chapters, tips, objectives, noteSpots, ending, beats };
