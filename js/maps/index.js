// Zombie_Apocalypse — the map registry. Maple Hollow is built by world.js itself; every other map is a pair of
// modules here: <id>.js (the place: export function buildMap(K), see kit.js) and <id>.story.js (its story).
// main.js: const info = await world.buildAsync(mapId); const story = await loadStory(mapId);
export const MAPS = {
  maple:   { id: 'maple',   name: 'Maple Hollow',        blurb: 'A quiet suburb on a Saturday. Then the noon news.',          preset: 'suburb',  ending: 'heli',   builtin: true },
  desert:  { id: 'desert',  name: 'Arroyo Seco',         blurb: 'An adobe village on the old highway. Market day. Nobody should drink the well water.', preset: 'desert', ending: 'plane' },
  prison:  { id: 'prison',  name: 'Blackwater Prison',   blurb: 'Cell blocks, a yard, guard towers. The doors are open.',     preset: 'prison',  ending: 'tunnel' },
  jungle:  { id: 'jungle',  name: 'Rio Verde',           blurb: 'A research station deep in the jungle, by the river.',      preset: 'jungle',  ending: 'boat' },
  stadium: { id: 'stadium', name: 'Harbor City Stadium', blurb: 'Cup final night. A full house. One of them was sick.', preset: 'stadium', ending: 'heli' },
};
export const MAP_IDS = Object.keys(MAPS);
export const DEFAULT_MAP = 'maple';
export const validMap = id => (id && MAPS[id] ? id : DEFAULT_MAP);
// the place (Maple Hollow: null — world.js builds it)
export async function loadMap(id) {
  id = validMap(id);
  if (MAPS[id].builtin) return null;
  return await import(`./${id}.js`);
}
// the story, normalized to the STORY MODULE contract in kit.js whatever shape the module uses:
//   { id, title, subtitle, intro: [lines], startHour, outbreakHour, chapters, notes, radio, news, tips, cast,
//     objectives: [{ id, x, z, y, label }] (one per chapter, in order), noteSpots: { noteId: spotKey },
//     ending: { kind, at: { x, z, yaw }, name, hour, schedule, window, ... }, beats(G, api), reset() }
// Pass the info world.buildAsync returned (info.spots) so spot-key objectives resolve to positions.
// main.js: const info = await world.buildAsync(mapId); const story = await loadStory(mapId, info);
export async function loadStory(id, info = null) {
  id = validMap(id);
  const m = await import(`./${id}.story.js`);
  return normalizeStory(m.default || m, id, info, m);
}
const pick = (...v) => v.find(a => a !== undefined && a !== null);
export function normalizeStory(s, id, info = null, mod = {}) {
  const o = Object.assign({}, s);
  const get = k => pick(s[k], s[k.toUpperCase()], mod[k], mod[k.toUpperCase()]);
  o.id = pick(s.id, s.ID, mod.id, mod.ID, id);
  for (const k of ['title', 'subtitle', 'startHour', 'outbreakHour', 'chapters', 'notes', 'radio', 'tips', 'cast', 'ending', 'tutorial'])
    { const v = get(k); if (v !== undefined) o[k] = v; }
  let intro = get('intro'); if (intro && !Array.isArray(intro)) intro = intro.lines || [];
  o.intro = intro || [];
  o.news = pick(s.news, s.NEWS, s.BROADCAST, mod.news, mod.BROADCAST) || { anchor: [], reporter: [] };
  o.news.anchor = o.news.anchor || []; o.news.reporter = o.news.reporter || [];
  o.chapters = o.chapters || []; o.notes = o.notes || {}; o.radio = o.radio || [];
  o.noteSpots = pick(s.noteSpots, s.NOTE_SPOTS, mod.noteSpots, mod.NOTE_SPOTS) || {};
  // objectives: array of { id, x, z, y, label }. Accepts an array of points, or { chapterId|key: spotKey }.
  const spots = (info && info.spots) || {};
  const at = k => (typeof k === 'string' ? spots[k] : k);
  const raw = pick(s.objectives, s.OBJECTIVES, mod.objectives, mod.OBJECTIVES);
  let list = [];
  if (Array.isArray(raw)) list = raw.map((p, i) => ({ id: p.id || (o.chapters[i] && o.chapters[i].id) || 'c' + i, ref: p }));
  else if (raw && typeof raw === 'object') list = Object.keys(raw).map(k => ({ id: k, ref: raw[k], key: raw[k] }));
  o.objectives = list.map((e, i) => {
    const p = at(e.ref);
    if (!p || !isFinite(p.x) || !isFinite(p.z)) return null;
    return { id: e.id, x: p.x, z: p.z, y: p.y || 0, spot: e.key, label: p.label || (o.chapters[i] && o.chapters[i].title) || e.id };
  }).filter(Boolean);
  if (typeof o.beats !== 'function') o.beats = () => {};
  if (typeof o.reset !== 'function') o.reset = typeof mod.reset === 'function' ? mod.reset : () => {};
  return o;
}
