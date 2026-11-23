// human-WAR — the shared game state every module reads and writes (filled in by main.js).
export const C = {
  scene: null, camera: null, world: null, fx: null, SND: null,
  units: [],          // every soldier: you, the bots, the range dummies
  player: null,
  mode: 'title',      // 'title' | 'range' | 'war'
  t: 0,
  noises: [],         // gunfire the bots can hear: { x, z, t, team }
  grenades: [], rockets: [], droppedGuns: [],
  stats: { shots: 0, hits: 0, kills: 0, deaths: 0, heads: 0, caps: 0 },
  shake: 0, flash: 0, hurtDir: [],
  events: {},         // callbacks main.js installs: onKill, onHitmarker, onPlayerHurt, toast, caption...
};
export const emit = (name, ...a) => { const f = C.events[name]; if (f) return f(...a); };
