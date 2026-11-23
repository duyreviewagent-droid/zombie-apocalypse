// Zombie_Apocalypse — BLACKWATER PRISON: the story.
// Blackwater State Penitentiary, maximum security, on a bend of the Blackwater River. Tuesday, March 3.
// At 05:40 the county jail sent over one prisoner on the dawn bus: Curtis Vance, 41, a delivery driver arrested for
// running a roadblock in Maple County with a refrigerated truck full of unlabelled beef. He was sick on the bus.
// At 10:50 he dies in the infirmary. At 11:04 he gets back up. The nurse hits the alarm — and the whole prison goes
// into LOCKDOWN with the dead on the inside.
// You are a guard (a corrections officer on the day shift) or an inmate (B-Block, cell 1-14), depending on who you
// picked: role(who) decides. The way out is the same: three keycards, the warden's office, and then either the
// warden's helicopter on the pad outside the south gate (01:00, sixty seconds) or the old storm sewer under the
// west wall to the river outfall, where the State Police boat waits at 03:00 for ninety seconds.
// Same shape as maple.story.js (see kit.js "STORY MODULE"): title, intro, chapters, notes, radio, news, ending,
// beats(G, api) — plus cast, role(), keycards, the alternative ending and the PA lines.

export const id = 'prison';
export const title = 'Blackwater Prison';
export const subtitle = 'Tuesday, March 3';

// guard or inmate: the older, heavier bodies get the uniform; the others the orange jumpsuit
// (who: { body, name, job } as main.js passes it). The map's SPOTS have a start for each.
export function role(who) {
  const b = who && who.body;
  if (b === 'coach' || b === 'butler' || b === 'michelle') return 'guard';   // (a men's penitentiary: Michelle works here)
  return 'inmate';
}
// what each role is called, where they start (spot keys in prison.js), and what they start with
export const roles = {
  guard: { job: 'corrections officer, day shift', start: 'guardStart', startText: 'You clock in at the staff entrance. Coffee, a radio, a baton.', items: [['flashlight', 1], ['bandage', 1]], weapon: null },
  inmate: { job: 'inmate #44-1187, B-Block cell 1-14', start: 'inmateStart', startText: 'Cell 1-14, B-Block, Tier 1. Morning count. Same as the last nine hundred mornings.', items: [], weapon: null },
};

// shown over the black before the first frame (one line at a time)
export const intro = [
  'Blackwater State Penitentiary. Tuesday, March 3.',
  'Eleven hundred men. Forty-two guards on the day shift. One road in.',
  'At dawn the county bus brought a new prisoner. He was sick on the way.',
  'By noon, nobody will be getting out.',
];
// the longer card for the start screen (per role)
export const introCard = {
  guard: ['<p class="date">TUESDAY, MARCH 3 · BLACKWATER STATE PENITENTIARY · 07:00</p>', '<p>Fog off the river. The towers are lit. Sergeant Okafor is already in Control with the morning count.</p>', '<p>You\'re on the day shift. Twelve hours. Nothing ever happens on a Tuesday.</p>'],
  inmate: ['<p class="date">TUESDAY, MARCH 3 · BLACKWATER STATE PENITENTIARY · 07:00</p>', '<p>The doors on Tier 1 rack open with a bang. Morning count, then chow.</p>', '<p>Somebody says the new guy on the county bus was coughing blood. Somebody always says something.</p>'],
};
export const startHour = 7;        // morning count
export const outbreakHour = 11;    // 11:04, the infirmary alarm

// who's around on the calm morning (people.js can dress them; 'at' is a spot key in prison.js)
export const cast = [
  { id: 'okafor', name: 'Sgt. Ruth Okafor', role: 'shift sergeant, Control room', at: 'control', look: 'grey uniform, reading glasses on a cord', lines: ['"Count\'s eleven-oh-four. Eleven-oh-four men and one coughing in the infirmary."', '"If that alarm goes, the doors lock. All of them. That\'s the job."'] },
  { id: 'hale', name: 'Dr. Miriam Hale', role: 'prison doctor, infirmary', at: 'infirmary', look: 'white coat over scrubs, red keycard on a lanyard', lines: ['"His temperature is a hundred and six. That isn\'t a fever, that\'s a furnace."', '"Get me the county jail on the phone. What did they FEED him?"'] },
  { id: 'vance', name: 'Curtis Vance', role: 'the new prisoner (patient zero)', at: 'infirmaryBed', look: 'orange jumpsuit, grey skin, cuffed to the bed', lines: ['"I just drove the truck. I just drove the truck, man."'] },
  { id: 'pruitt', name: 'Warden Douglas Pruitt', role: 'the warden', at: 'warden', look: 'navy suit, no tie, gold keycard', lines: ['"Nobody leaves this facility. Not until the State says so."'] },
  { id: 'dee', name: 'Darnell "Dee" Washington', role: 'inmate, laundry trusty, knows the tunnels', at: 'laundry', look: 'orange jumpsuit, laundry apron, reading a paperback', lines: ['"Storm drain under the laundry runs clean to the river. Built in 1931. Nobody remembers it but me."', '"Grate\'s padlocked. Maintenance keeps the key. Or the warden does."'] },
  { id: 'reyes', name: 'Officer Luis Reyes', role: 'tower 3 guard', at: 'tower3', look: 'rifle, rain jacket', lines: ['"From up here you can see the whole river. And whatever\'s walking toward it."'] },
  { id: 'cook', name: 'Big Tony Marchetti', role: 'inmate, kitchen', at: 'kitchen', look: 'hairnet, white apron, forearms like hams', lines: ['"Chow\'s at twelve. If anybody\'s still eating."'] },
];

// what you're doing now, for each chapter (main.js adds the checklist and the countdown).
// done: when it moves on (reach:<spot> · note:<id> · item:<id> · time:<hour> · board) — same words the other maps use
export const chapters = [
  { id: 'count', title: 'MORNING COUNT', goal: { guard: 'Report to <b>Control</b> in the admin block. Sgt. Okafor has your radio.', inmate: 'Morning count. Go down to the <b>yard</b> — or the <b>cafeteria</b> for chow.' }, done: 'time:11.05' },
  { id: 'lockdown', title: 'LOCKDOWN', goal: 'The alarm. The doors are jammed open — the dead are out of the <b>infirmary</b>. Get a <b>weapon</b>. Stay alive.', done: 'item:weapon' },
  { id: 'cards', title: 'THE KEYCARDS', goal: 'Three keycards open the <b>admin block</b>: <b>RED</b> (Dr. Hale, infirmary) · <b>BLUE</b> (Control, admin) · <b>GREEN</b> (tower 3 or the workshop).', done: 'item:keycardRed+keycardBlue+keycardGreen' },
  { id: 'warden', title: 'THE WARDEN', goal: 'Up to the <b>warden\'s office</b>, 2nd floor of the admin block. His <b>radio</b>, his <b>gold card</b>, the <b>sewer key</b>.', done: 'note:wardenLog' },
  { id: 'out', title: 'THE WAY OUT', goal: 'Two ways out: the <b>warden\'s helicopter</b> on the pad outside the south gate at <b>01:00</b> — or the <b>storm sewer</b> under the laundry to the <b>river outfall</b> at <b>03:00</b>. Get in — <b>E</b>.', done: 'board' },
];

// notes, logs and documents (found in drawers, on desks, on bodies; text may use \n)
export const notes = {
  transfer: { title: 'County transfer sheet', text: 'MAPLE COUNTY JAIL → BLACKWATER SP\nINMATE: VANCE, Curtis J.  DOB 04/11/84\nCHARGE: Evading (roadblock, Rt 9), reckless driving\nVEHICLE: refrigerated box truck, NO PLATES, NO MANIFEST. Load: approx 2 tons ground beef, unlabelled.\n\nMEDICAL: Inmate vomited x3 on bus. Temp not taken. "Says he\'s fine."\n\nTransporting officer: Do NOT put this man in general population until he\'s seen by medical.' },
  hale: { title: 'Dr. Hale — patient notes', text: '08:10 VANCE. T 104.8. Grey, diaphoretic. Says he ate "a couple of the burgers off the truck."\n09:30 T 106.1. Seizure. Restrained.\n10:12 Blood under the UV lamp GLOWS. Pale green. I have never seen this.\n10:50 Asystole. Time of death 10:50.\n10:58 Patient sat up.\n\nHe bit Nurse Ames. He is cuffed to the bed. The cuffs are holding. I am going to call—\n\n[The rest is blood.]' },
  okafor: { title: 'Control room — shift log', text: '07:00 Count clear. 1104.\n09:15 Infirmary requests county medical records on VANCE. County not answering.\n11:04 ALARM — INFIRMARY. Code Red. Facility LOCKDOWN.\n11:06 Lockdown fault. Tier doors in A and B will NOT close. Repeat, will NOT close.\n11:20 Officers down in the yard. They are getting back up.\n11:41 Warden has ordered the outer gate SEALED. Nobody out. Including us.\n\nBlue card\'s in my desk. If you\'re reading this, take it. — R.O.' },
  dee: { title: 'Paperback, a page folded down', text: '[Scribbled in the margin of a western:]\n\nStorm drain — 1931 plans, Library shelf 9.\nLaundry floor grate → 300 ft west → under the wall → river outfall.\nGrate padlocked. Key: maintenance board in the workshop office? Or Pruitt keeps it.\nHigh water = drown. Go at night when the dam\'s closed.\n\n— D.W.' },
  pruitt: { title: 'Memo, on the warden\'s desk', text: 'FROM: Office of the Warden\nTO: All staff\n\nThe State has asked us to hold the facility until the National Guard arrives. Under no circumstances is the outer gate to be opened. Staff will remain at their posts.\n\nMy helicopter will be on the pad at 01:00 for the Governor\'s briefing in the capital. It will not wait.\n\n— D. Pruitt' },
  wardenLog: { title: 'The warden\'s radio log (his handwriting)', text: '23:10 — State Police on the river. They\'ll send a boat to the old sewer outfall at 03:00. Ninety seconds. No more.\n23:30 — Tom (pilot) says he can land on the pad outside the south gate at 01:00. One minute on the ground.\n23:45 — I am not leaving my men. I am not leaving my men.\n\n[Under it, shakier:]\nI\'m bitten. Take the gold card. Take the sewer key. Somebody should get out of here.' },
  reyes: { title: 'Tower 3 — log book', text: '11:15 Yard full of runners. Fired 30 rds. They don\'t stop unless it\'s the head.\n12:40 Ran out. Green card\'s in the gun locker for the workshop roll-up door. Workshop is CLEAR, last I saw.\n14:00 Somebody\'s going to have to come get me.\n14:05 No. Nobody\'s coming.' },
  kite: { title: 'A "kite" (a note passed between cells)', text: 'C-dog —\n\nthe new guy from county is in the infirmary and the CO\'s are all wearing masks. somethings wrong.\nif the doors pop, dont go to the yard. go UP. the walkways. they cant do stairs good.\n\n— T' },
  menu: { title: 'Cafeteria menu board', text: 'TUESDAY\nBreakfast — oatmeal, toast, coffee\nLunch — BURGERS (donated, Maple County Meats)\nDinner — chili\n\n[Somebody has drawn a skull next to BURGERS.]' },
  visit: { title: 'Visiting room sign-in sheet', text: 'TUES 3/3\n09:00 Linda Vance — for C. Vance — DENIED (inmate in medical)\n09:05 Linda Vance — "I just want to know he\'s okay"\n09:40 Linda Vance — escorted out, left a letter\n\n[The letter, unopened, is clipped to the sheet.]' },
  sol: { title: 'Scratched into the solitary cell wall', text: '43 DAYS IN THE HOLE\nTHE LIGHTS WENT OUT AT 11\nSOMEBODYS SCREAMING IN THE HALL\nTHEN NOBODY IS' },
};

// the warden's radio, once you switch it on in his office (seconds from switching it on, text)
export const radio = [
  [0.0, '*static*'],
  [1.6, '"...State Police Marine Unit Four to Blackwater, come in Blackwater..."'],
  [5.8, '"...the county is under quarantine. The facility will be sealed until the Guard arrives. That could be days..."'],
  [10.4, '"...we can take survivors off at the old storm sewer outfall on the river, zero-three-hundred. Ninety seconds..."'],
  [15.2, '"...Warden, your pilot confirms the pad outside the south gate at zero-one-hundred. One minute on the ground..."'],
  [20.0, '"...anyone who has been bitten stays behind. Repeat: the outfall at 0300, or the pad at 0100. Godspeed..."'],
  [24.0, '*static*'],
];

// the prison PA (the "news" moment): the alarm and the lockdown announcement at 11:04 ([seconds, line])
export const news = {
  kind: 'pa',
  title: 'PUBLIC ADDRESS — ALL UNITS',
  anchor: [
    [0.5, '*a two-tone alarm, over and over*'],
    [3.0, 'CONTROL: Code Red, infirmary. Code Red, infirmary. All inmates on the ground. All inmates on the ground.'],
    [8.5, 'CONTROL: Facility lockdown. Facility lockdown. All doors, secure your doors.'],
    [14.0, 'CONTROL: ...A and B tier doors are NOT responding. Repeat, tier doors are NOT responding—'],
  ],
  reporter: [
    [19.5, 'NURSE (over the infirmary phone, still open on the PA): He\'s up — he\'s UP — Doctor, get BACK—'],
    [24.5, 'CONTROL: All officers to the infirmary. All — oh God. Ames? Ames, stay down—'],
    [29.0, '*the line goes dead; only the alarm is left*'],
  ],
};
// one-line PA calls through the afternoon and night (hour, line) — main.js can toast them, or beats() can
export const pa = [
  [7.1, 'Count time. Count time. All inmates to your cells for count.'],
  [8.0, 'Chow line, A-Block. Chow line, A-Block.'],
  [9.5, 'Visits are cancelled for today. Repeat, visits are cancelled.'],
  [12.2, '...is anybody in Control? Is anybody...'],
  [16.0, '*the PA clicks on; somebody breathing; it clicks off*'],
  [20.5, 'This is Warden Pruitt. The Guard is coming. Stay where you are. Stay where—'],
];

// three keycards (+ the warden's gold card and the sewer key); the item ids main.js / loot.js need (see requests)
export const keycards = {
  keycardRed: { name: 'Red keycard (Medical)', icon: '🟥', where: 'Dr. Hale — infirmary office desk' },
  keycardBlue: { name: 'Blue keycard (Control)', icon: '🟦', where: 'Sgt. Okafor\'s desk — Control room, admin block' },
  keycardGreen: { name: 'Green keycard (Workshop)', icon: '🟩', where: 'Tower 3 gun locker (or the workshop office)' },
  keycardGold: { name: 'Gold keycard (Warden)', icon: '🟨', where: 'the warden\'s desk' },
  sewerKey: { name: 'Sewer grate key', icon: '🗝️', where: 'the warden\'s safe' },
};

// short tips, each shown once, at the moment it matters
export const tips = {
  lockdown: { title: 'LOCKDOWN', keys: [], text: 'The tier doors are stuck open. <b>Go up</b>: the walkways and stairs slow the dead down.' },
  card: { title: 'KEYCARD', keys: ['E'], text: 'Card readers glow <b>red</b> when locked. Walk up with the right card and press <b>E</b>.' },
  tower: { title: 'GUARD TOWER', keys: ['W'], text: 'Take the <b>steel stairs</b> up the tower: from the cab you can see the whole yard. Snipe from safety.' },
  sewer: { title: 'THE SEWER', keys: ['F'], text: 'Most of the bulbs down there are dead. Press <b>F</b> for your flashlight.' },
};

// the way out (main ending): the storm-sewer outfall on the river, 03:00, 90 s. The alternative: the warden's
// helicopter on the pad outside the south gate, 01:00, 60 s. 'at' is world x/z (same as SPOTS in prison.js).
export const ending = {
  kind: 'tunnel',
  at: { x: -140.5, z: -80, yaw: -Math.PI / 2 },
  name: 'the river outfall (through the storm sewer)',
  vehicle: 'boat',
  hour: 3,
  schedule: [{ day: 2, hour: 3 }, { day: 3, hour: 3 }],
  window: 90,
  needs: ['sewerKey'],
};
export const endings = [
  ending,
  { kind: 'heli', at: { x: 80, z: 130, yaw: 0 }, name: 'the warden\'s helipad, outside the south gate', hour: 1, schedule: [{ day: 2, hour: 1 }], window: 60, needs: ['keycardGold'] },
];
export const outro = {
  tunnel: ['The boat\'s engine. A flashlight in your face. Hands pulling you over the side.', 'Behind you the prison lights go out, tower by tower.', 'YOU MADE IT'],
  heli: ['The skids lift. The yard falls away under you, full of slow grey shapes.', 'Tom doesn\'t ask where the warden is. You don\'t say.', 'YOU MADE IT'],
};

// the per-frame / per-event hook for map-specific moments.
// G: the game state; api: { think, toast, bigText, setStage, later, world, SND, spawnZombie } (what main.js passes)
// PA calls at their hours, once each; a think-line the first time you reach a few places.
const _said = new Set();
export function beats(G, api) {
  if (!G || !api) return;
  const h = G.hour != null ? G.hour : (G.time != null ? G.time : null);
  if (h != null && api.toast) for (const [at, line] of pa) { const k = 'pa' + at; if (!_said.has(k) && h >= at && h < at + 0.5) { _said.add(k); api.toast('PA: ' + line, 'grey', 'note'); } }
  const W = api.world;
  const pp = (api.playerPos && api.playerPos()) || (G.P && G.P.pos) || (G.player && G.player.pos) || null;
  if (!pp || !W || !W.spots || !api.think) return;
  for (const [spot, line] of [['infirmary', 'The infirmary. The smell hits you first.'], ['yard', 'The yard. The basketball\'s still rolling.'], ['sewerGrate', 'The storm drain. Cold air comes up through the grate.'], ['warden', 'Pruitt\'s office. Leather chairs, the flag, a window over the whole yard.'], ['tower3', 'Tower 3. Reyes\'s chair is still warm.']]) {
    const s = W.spots[spot]; if (!s || _said.has(spot)) continue;
    if (Math.abs((pp.y || 0) - (s.y || 0)) > 1.6) continue;   // same floor only (the warden is upstairs over Control)
    if (Math.hypot(pp.x - s.x, pp.z - s.z) < (s.y ? 4 : 6)) { _said.add(spot); api.think(line); }
  }
}

export default { id, title, subtitle, intro, introCard, startHour, outbreakHour, role, roles, cast, chapters, notes, radio, news, pa, keycards, tips, ending, endings, outro, beats };
