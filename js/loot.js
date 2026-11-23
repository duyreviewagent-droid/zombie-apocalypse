// Zombie_Apocalypse — what you can find, and where. Kitchens have food, bathrooms have medicine, sheds have tools,
// the police car has a shotgun if you're lucky. Most places have been picked over already: plenty come up empty.
export const ITEMS = {
  beans: { name: 'Canned beans', icon: '🥫', cat: 'food', food: 34, water: -2, use: 'Eat' },
  soup: { name: 'Canned soup', icon: '🥣', cat: 'food', food: 28, water: 10, use: 'Eat' },
  chips: { name: 'Bag of chips', icon: '🍟', cat: 'food', food: 14, water: -6, use: 'Eat' },
  bar: { name: 'Energy bar', icon: '🍫', cat: 'food', food: 20, stam: 30, use: 'Eat' },
  apple: { name: 'Bruised apple', icon: '🍎', cat: 'food', food: 10, water: 6, use: 'Eat' },
  cereal: { name: 'Box of cereal', icon: '📦', cat: 'food', food: 24, water: -4, use: 'Eat' },
  dates: { name: 'Bag of dates', icon: '🌰', cat: 'food', food: 18, water: -2, stam: 10, use: 'Eat' },
  bread: { name: 'Flatbread', icon: '🫓', cat: 'food', food: 22, water: -5, use: 'Eat' },
  water: { name: 'Bottle of water', icon: '💧', cat: 'drink', water: 42, use: 'Drink' },
  soda: { name: 'Can of soda', icon: '🥤', cat: 'drink', water: 24, food: 4, stam: 15, use: 'Drink' },
  juice: { name: 'Juice box', icon: '🧃', cat: 'drink', water: 26, food: 6, use: 'Drink' },
  bandage: { name: 'Bandage', icon: '🩹', cat: 'med', heal: 12, stopBleed: true, use: 'Bandage up' },
  medkit: { name: 'First aid kit', icon: '⛑️', cat: 'med', heal: 55, stopBleed: true, use: 'Use' },
  pills: { name: 'Painkillers', icon: '💊', cat: 'med', heal: 22, use: 'Take' },
  antibiotics: { name: 'Antibiotics', icon: '🧪', cat: 'med', cure: 45, use: 'Take' },
  ammo9: { name: '9mm rounds', icon: '▪', cat: 'ammo' },
  shells: { name: 'Shotgun shells', icon: '▮', cat: 'ammo' },
  rifleAmmo: { name: 'Rifle rounds', icon: '▴', cat: 'ammo' },
  battery: { name: 'Batteries', icon: '🔋', cat: 'tool', use: 'Put in flashlight' },
  // light: a flashlight (F switches it on: without one, F does nothing) and a battery camping lantern (hang it on your
  // pack, or set it down somewhere as a light). One of each is all you need; finding another gives you its batteries.
  flashlight: { name: 'Flashlight', icon: '🔦', cat: 'tool', one: true, use: 'Switch on (F)' },
  lantern: { name: 'Camping lantern', icon: '🏮', cat: 'tool', one: true, use: 'Set it down' },
  bottle: { name: 'Empty bottle', icon: '🍾', cat: 'throw' },
  molotov: { name: 'Molotov', icon: '🔥', cat: 'throw' },
  keys: { name: 'Truck keys', icon: '🔑', cat: 'quest' },
  gascan: { name: 'Gas can', icon: '⛽', cat: 'quest' },
  // prison map: keycards and the sewer key (quest items: never eaten, used or dropped by the bag)
  keycardRed: { name: 'Red keycard (Medical)', icon: '🟥', cat: 'quest', w: 0.02 },
  keycardBlue: { name: 'Blue keycard (Control)', icon: '🟦', cat: 'quest', w: 0.02 },
  keycardGreen: { name: 'Green keycard (Workshop)', icon: '🟩', cat: 'quest', w: 0.02 },
  keycardGold: { name: 'Gold keycard (Warden)', icon: '🟨', cat: 'quest', w: 0.02 },
  sewerKey: { name: 'Sewer grate key', icon: '🗝️', cat: 'quest', w: 0.05 },
  // weapons (found once, then they're yours)
  knife: { name: 'Kitchen knife', icon: '🔪', cat: 'melee' },
  bat: { name: 'Baseball bat', icon: '🏏', cat: 'melee' },
  crowbar: { name: 'Crowbar', icon: '⚒', cat: 'melee' },
  machete: { name: 'Machete', icon: '🗡', cat: 'melee' },
  axe: { name: 'Fire axe', icon: '🪓', cat: 'melee' },
  pistol: { name: '9mm pistol', icon: '🔫', cat: 'gun' },
  shotgun: { name: 'Pump shotgun', icon: '🔫', cat: 'gun' },
  sniper: { name: 'Hunting rifle', icon: '🔭', cat: 'gun' },
};
// [item, weight, min, max]
const T = {
  kitchen: { empty: 0.3, rolls: [1, 3], items: [['beans', 5, 1, 2], ['soup', 4, 1, 2], ['cereal', 3, 1, 1], ['chips', 2, 1, 1], ['knife', 3, 1, 1], ['bottle', 4, 1, 2], ['water', 2, 1, 1], ['battery', 1, 1, 1]] },
  kitchen2: { empty: 0.35, rolls: [1, 2], items: [['knife', 4, 1, 1], ['battery', 3, 1, 2], ['bandage', 2, 1, 1], ['bar', 2, 1, 1], ['bottle', 2, 1, 1], ['ammo9', 1, 3, 8]] },
  fridge: { empty: 0.35, rolls: [1, 3], items: [['water', 5, 1, 2], ['soda', 4, 1, 2], ['juice', 4, 1, 2], ['apple', 3, 1, 2]] },
  pantry: { empty: 0.3, rolls: [1, 3], items: [['beans', 5, 1, 3], ['soup', 4, 1, 2], ['cereal', 3, 1, 1], ['chips', 3, 1, 2], ['water', 2, 1, 2], ['bottle', 3, 1, 2]] },
  medicine: { empty: 0.35, rolls: [1, 2], items: [['bandage', 5, 1, 2], ['pills', 4, 1, 1], ['antibiotics', 2, 1, 1], ['medkit', 1, 1, 1]] },
  nightstand: { empty: 0.45, rolls: [1, 2], items: [['ammo9', 3, 4, 10], ['pistol', 1, 1, 1], ['pills', 3, 1, 1], ['battery', 3, 1, 1], ['flashlight', 1.5, 1, 1], ['bar', 2, 1, 1], ['water', 2, 1, 1]] },
  dresser: { empty: 0.5, rolls: [1, 1], items: [['bandage', 3, 1, 2], ['battery', 2, 1, 1], ['ammo9', 2, 3, 8], ['bar', 2, 1, 1]] },
  closet: { empty: 0.45, rolls: [1, 2], items: [['bat', 3, 1, 1], ['shells', 2, 2, 5], ['shotgun', 1, 1, 1], ['sniper', 0.6, 1, 1], ['rifleAmmo', 1.2, 3, 6], ['battery', 2, 1, 1], ['bandage', 2, 1, 1]] },
  cabinet: { empty: 0.55, rolls: [1, 1], items: [['battery', 3, 1, 2], ['chips', 2, 1, 1], ['soda', 2, 1, 1], ['bottle', 2, 1, 1]] },
  shelf: { empty: 0.65, rolls: [1, 1], items: [['battery', 2, 1, 1], ['pills', 1, 1, 1], ['ammo9', 1, 3, 6]] },
  shed: { empty: 0.25, rolls: [1, 2], items: [['crowbar', 4, 1, 1], ['axe', 2, 1, 1], ['machete', 2, 1, 1], ['bat', 2, 1, 1], ['molotov', 2, 1, 2], ['bottle', 3, 1, 3], ['battery', 2, 1, 2], ['shells', 1, 2, 4]] },
  garage: { empty: 0.25, rolls: [1, 3], items: [['molotov', 3, 1, 2], ['crowbar', 2, 1, 1], ['water', 3, 1, 2], ['chips', 3, 1, 2], ['bar', 3, 1, 2], ['battery', 3, 1, 2], ['flashlight', 1.5, 1, 1], ['lantern', 1, 1, 1]] },
  bin: { empty: 0.6, rolls: [1, 1], items: [['bottle', 5, 1, 2], ['chips', 1, 1, 1], ['apple', 1, 1, 1], ['battery', 1, 1, 1]] },
  car: { empty: 0.45, rolls: [1, 2], items: [['flashlight', 1, 1, 1], ['water', 3, 1, 1], ['soda', 2, 1, 1], ['bar', 3, 1, 1], ['bandage', 2, 1, 1], ['ammo9', 2, 4, 10], ['pistol', 0.5, 1, 1], ['battery', 2, 1, 1], ['crowbar', 1, 1, 1], ['bat', 1, 1, 1]] },
  truck: { empty: 0.4, rolls: [1, 2], items: [['water', 3, 1, 1], ['crowbar', 2, 1, 1], ['shells', 1, 2, 4], ['bottle', 2, 1, 2]] },
  police: { empty: 0, rolls: [2, 3], items: [['flashlight', 2, 1, 1], ['shotgun', 4, 1, 1], ['shells', 5, 4, 8], ['ammo9', 4, 8, 15], ['pistol', 2, 1, 1], ['bandage', 3, 1, 2], ['medkit', 1, 1, 1]] },
  ambulance: { empty: 0.05, rolls: [2, 3], items: [['medkit', 4, 1, 1], ['bandage', 5, 1, 3], ['antibiotics', 4, 1, 1], ['pills', 3, 1, 2], ['water', 2, 1, 2]] },
  store: { empty: 0.3, rolls: [1, 3], items: [['beans', 4, 1, 2], ['soup', 3, 1, 2], ['chips', 4, 1, 2], ['bar', 4, 1, 2], ['cereal', 2, 1, 1], ['battery', 3, 1, 2], ['bottle', 2, 1, 1]] },
  cooler: { empty: 0.2, rolls: [1, 3], items: [['water', 5, 1, 3], ['soda', 5, 1, 2], ['juice', 3, 1, 2]] },
  register: { empty: 0.1, rolls: [1, 2], items: [['pistol', 2, 1, 1], ['ammo9', 4, 6, 12], ['shells', 2, 3, 6], ['battery', 2, 1, 2]] },
  pharmacy: { empty: 0.15, rolls: [1, 3], items: [['bandage', 5, 1, 3], ['pills', 4, 1, 2], ['antibiotics', 3, 1, 1], ['medkit', 1.5, 1, 1]] },
  pump: { empty: 0.85, rolls: [1, 1], items: [['bottle', 1, 1, 1]] },
  bench: { empty: 0.75, rolls: [1, 1], items: [['bottle', 2, 1, 1], ['soda', 1, 1, 1], ['bar', 1, 1, 1]] },
  corpse: { empty: 0.55, rolls: [1, 1], items: [['ammo9', 2, 2, 6], ['bandage', 2, 1, 1], ['chips', 1, 1, 1], ['bar', 1, 1, 1], ['pills', 1, 1, 1], ['battery', 1, 1, 1], ['water', 1, 1, 1]] },
  // the attic: what people keep up there — camping gear (lanterns, flashlights, batteries), old tools, the odd keepsake
  attic: { empty: 0.12, rolls: [1, 3], items: [['lantern', 5, 1, 1], ['flashlight', 3, 1, 1], ['battery', 4, 1, 3], ['bat', 1.5, 1, 1], ['machete', 1, 1, 1], ['bandage', 1.5, 1, 2], ['shells', 1, 2, 4], ['rifleAmmo', 0.6, 3, 6], ['sniper', 0.3, 1, 1]] },
  atticBox: { empty: 0.25, rolls: [1, 2], items: [['lantern', 3, 1, 1], ['flashlight', 3, 1, 1], ['battery', 5, 1, 4], ['bottle', 2, 1, 2], ['bandage', 1, 1, 1], ['crowbar', 0.8, 1, 1]] },
  atticCase: { empty: 0.35, rolls: [1, 2], items: [['flashlight', 2, 1, 1], ['battery', 3, 1, 2], ['pills', 2, 1, 1], ['bandage', 2, 1, 2], ['bar', 1, 1, 1], ['ammo9', 1, 3, 8]] },
  // market stalls: fresh produce, bread, dates, bottled water (the desert town's market square)
  market: { empty: 0.25, rolls: [1, 3], items: [['dates', 5, 1, 2], ['bread', 5, 1, 2], ['apple', 4, 1, 3], ['water', 5, 1, 2], ['juice', 2, 1, 1], ['bar', 1, 1, 1], ['bottle', 1, 1, 1]] },
  escape: { empty: 1, rolls: [0, 0], items: [] },
};
// difficulty supply multiplier (main.js newGame sets LOOT.mul from save.diff): >1 = fuller containers, <1 = scarcer
export const LOOT = { mul: 1 };
const pickW = (list, r) => { let tot = 0; for (const x of list) tot += x[1]; let k = r() * tot; for (const x of list) { k -= x[1]; if (k <= 0) return x; } return list[list.length - 1]; };
// what's in this container: [[item, n], ...]
export function rollLoot(kind, r = Math.random) {
  const t = T[kind] || T.cabinet;
  const mul = LOOT.mul > 0 ? LOOT.mul : 1;
  if (r() < (t.empty >= 1 ? 1 : Math.min(0.95, t.empty / mul))) return [];
  const n = t.rolls[0] + Math.floor(r() * (t.rolls[1] - t.rolls[0] + 1)), out = new Map();
  for (let i = 0; i < n; i++) {
    const [id, , a, b] = pickW(t.items, r);
    const k = Math.max(1, Math.round((a + Math.floor(r() * (b - a + 1))) * mul));
    if (ITEMS[id].cat === 'melee' || ITEMS[id].cat === 'gun' || ITEMS[id].one) out.set(id, 1); else out.set(id, (out.get(id) || 0) + k);
  }
  return [...out.entries()];
}
// how long searching takes (seconds) and which move you make
export function searchInfo(c) {
  const t = { fridge: 1.6, kitchen: 2.2, kitchen2: 1.8, pantry: 2.2, medicine: 1.5, nightstand: 1.6, dresser: 2.4, closet: 2.6, cabinet: 1.6, shelf: 1.8, shed: 3.0, garage: 3.2, bin: 1.8, car: 2.8, truck: 2.4, police: 3.0, ambulance: 3.0, store: 2.0, market: 1.6, cooler: 1.5, register: 2.2, pharmacy: 2.0, pump: 1.2, bench: 1.2, corpse: 2.4, attic: 2.8, atticBox: 2.4, atticCase: 2.0 }[c.kind] || 2;
  const anim = c.y < 0.7 ? 'Fixing_Kneeling' : c.y > 1.15 ? 'Interact' : 'Chest_Open';
  return { t, anim };
}
