// Zombie_Apocalypse — the story. Maple Hollow, Saturday, November 8. A normal morning — until noon.
// At 12:00 every phone and TV in town goes off: a man has collapsed at the Quick Stop after eating one of Raj's
// grill burgers. The meat was laced with a mixture of radium and CO2. Gary got back up. He bit Raj. Raj got back up...
// Chapters move on as you do things; notes found in drawers and on bodies tell the rest.
export const NOTES = {
  em: { title: 'A note on the fridge', text: 'Sam —\n\nTook the kids to my sister\'s in Ridgefield for the weekend. Back Sunday night.\n\nThere\'s lasagne in the freezer. Eat something that isn\'t a Quick Stop burger, please.\n\nLove you.\n\n— Em' },
  dale1: { title: 'Taped to the pickup\'s window', text: 'Linda walked down to the Quick Stop for burgers at half eleven. Then the TV went crazy.\n\nI\'m going to get her. Keys are on me.\n\nTruck\'s dry — the gas can\'s in the Hendersons\' shed, {HEND}, for safekeeping.\n\nIf I\'m not back in an hour, God help whoever reads this.\n\n— Dale Miller, 68 Main' },
  dale2: { title: 'In Dale\'s shirt pocket', text: 'Found her. Too late.\n\nShe was behind the counter with Raj. She didn\'t know me.\n\nShe got my hand before I —\n\nI can feel it. It\'s cold and it\'s spreading. If somebody finds this: the gas is in the Hendersons\' shed, {HEND}. Take the truck. Get out.' },
  police: { title: 'Patrol log, Unit 14', text: '1203 — Call: male collapsed, Quick Stop, Main & Maple. Reported "convulsing."\n1211 — On scene. Subject DECEASED per bystanders. Subject is NOT deceased. Subject biting.\n1219 — Ofc. Pratt bitten, R forearm. Transported.\n1302 — Pratt deceased 1251. Pratt not deceased 1258.\n1340 — County orders quarantine. Fence going up on all roads.\n1415 — Told to hold the roadblock. Nobody in, nobody out.\n1630 — Out of ammo. Radio\'s quiet. I\'m going home.' },
  ambulance: { title: 'Patient care report', text: 'PT: male, 50s ("Gary"). Ingested ground beef, Quick Stop grill, approx 1130.\nSeizure, hyperthermia 106.2. Skin grey. Pupils fixed.\nTime of death: 12:41.\n\nPatient reanimated 12:58. Bit my partner.\n\nThe blood glows under the UV lamp. That isn\'t possible.\n\nDO NOT TRANSPORT.\nDO NOT TRANSPORT.' },
  kid: { title: 'A crayon drawing', text: '[A house. A stick family. One of them is coloured grey, with red around its mouth.]\n\nDADDY ATE A BURGER\nNOW HES SICK\nMOMMY SAYS DONT GO IN THERE\nI AM BEING BRAVE' },
  leaflet: { title: 'Leaflet: by order of the Governor', text: 'NOTICE\n\nMAPLE HOLLOW IS UNDER QUARANTINE.\n\nA contaminated food product has caused a serious outbreak of illness. Do NOT eat ground beef bought in Maple County.\n\nRemain in your homes. Do not approach the perimeter fence. Persons attempting to cross the perimeter will be fired upon.\n\nRelief supplies will be delivered.\n\n[The supplies never came.]' },
  raj: { title: 'Behind the Quick Stop counter', text: 'To whoever:\n\nThe meat came in this morning off a truck I\'d never seen before. No labels. Half the price. I said yes.\n\nGary was my first customer. Linda was my second.\n\nIt bit me. I locked the back. I can feel it in my arm.\n\nIf you\'re reading this I didn\'t make it. I\'m sorry. I\'m so sorry.\n\n— Raj' },
};
export const RADIO = [
  [0.0, '*static*'],
  [1.6, '"...this is the National Guard, Route 9 checkpoint, repeating on all bands..."'],
  [5.6, '"...the town of Maple Hollow is under emergency quarantine. A contaminated food product — do not approach the sick..."'],
  [9.8, '"...a rescue helicopter will land at the crossroads of Main Street and Maple Avenue at 0200 hours tonight..."'],
  [14.2, '"...it will wait on the ground for ONE minute. One minute. Anyone not aboard will be left behind..."'],
  [19.0, '"...repeat: Main and Maple, 0200 tonight. Do not bring anyone who has been bitten. We will not wait..."'],
  [22.5, '*static*'],
];
// what you're doing now, for each chapter (main.js adds the checklist and the countdown)
export const CHAPTERS = [
  { title: 'IT BEGINS', goal: 'Get home. The <b>radio in the kitchen</b> — find out what\'s going on.' },
  { title: 'SUPPLIES', goal: 'Get ready for the night: a <b>weapon</b>, <b>food</b> and <b>water</b>. Search kitchens, pantries, garages — before dark.' },
  { title: 'THE NIGHT', goal: 'Survive until <b>02:00</b>. Then be at the <b>crossroads of Main &amp; Maple</b>.' },
  { title: 'THE HELICOPTER', goal: 'The helicopter is coming to <b>Main &amp; Maple</b>. It waits <b>one minute</b>. Get in — <b>E</b>.' },
];
// the tutorial for a first run: one thing at a time on the quiet Saturday morning, each step waits for you to do it
// (id: what main.js listens for; keys: shown as keycaps; text: one short line)
export const TUTORIAL = [
  { id: 'look', title: 'LOOK AROUND', keys: ['Right-drag'], text: 'Hold the <b>right mouse button</b> and drag to turn the camera.' },
  { id: 'walk', title: 'WALK', keys: ['W', 'A', 'S', 'D'], text: 'Walk around your house. You go the way the camera faces.' },
  { id: 'sprint', title: 'RUN', keys: ['Shift'], text: 'Hold <b>Shift</b> while you walk to run. Running tires you out — and they hear it.' },
  { id: 'crouch', title: 'CROUCH', keys: ['C'], text: 'Press <b>C</b> to crouch: quiet, and harder to see. Press it again to stand up.' },
  { id: 'jump', title: 'JUMP & CLIMB', keys: ['Space'], text: 'Press <b>Space</b> to jump. Near a fence, a hedge or a ledge, it vaults or climbs over.' },
  { id: 'view', title: 'CHANGE VIEW', keys: ['V'], text: 'Press <b>V</b> to switch between first and third person. Pick the one you like.' },
  { id: 'door', title: 'OPEN A DOOR', keys: ['E'], text: 'Walk up to a door and press <b>E</b>. Your hand takes the handle. Close doors behind you later — they slow the dead down.' },
  { id: 'search', title: 'SEARCH', keys: ['E'], text: 'Find a <b>cupboard, drawer or the fridge</b> and press <b>E</b> to search it. What you find goes into your backpack.' },
  { id: 'bag', title: 'YOUR BACKPACK', keys: ['Tab'], text: 'Press <b>Tab</b>: you swing your backpack round and open it. Everything you carry is in there.' },
  { id: 'eat', title: 'EAT OR DRINK', keys: ['Tab'], text: 'In the backpack, press <b>Eat</b> or <b>Drink</b> on something. Food and water keep you going.' },
  { id: 'phone', title: 'YOUR PHONE', keys: ['T'], text: 'Press <b>T</b> for your phone. Open <b>Messages</b> and text Mom or Ben.' },
  { id: 'attack', title: 'FIGHT', keys: ['Click'], text: 'Click to swing at the air — nobody\'s around. Later: aim at the cursor, <b>quick right-click</b> to shove.' },
];
// short tips, each shown once, at the moment it matters
export const TIPS = {
  zombie: { title: 'ONE OF THEM', keys: ['Click'], text: 'Aim for the <b>head</b> — only that puts them down for good. Or don\'t fight: run, and close doors behind you.' },
  grab: { title: 'GRABBED!', keys: ['Space'], text: 'Mash <b>Space</b> as fast as you can to break free before it bites.' },
  night: { title: 'NIGHT', keys: ['F'], text: 'Press <b>F</b> for your flashlight. It helps you see — and helps them see you.' },
  checkpoint: { title: 'CHECKPOINT', keys: [], text: 'Your run was just <b>saved</b>. If you die, you can retry from here.' },
  bleed: { title: 'BLEEDING', keys: ['Q'], text: 'You\'re bleeding. Press <b>Q</b> to bandage it — or open the backpack and use a bandage.' },
  hungry: { title: 'HUNGRY', keys: ['Tab'], text: 'Open your backpack with <b>Tab</b> and eat something before you get weak.' },
  weapon: { title: 'A WEAPON', keys: ['2'], text: 'It\'s in your hand. Press <b>1</b> for fists, <b>2</b> to switch weapons — the rest ride on your backpack.' },
};
