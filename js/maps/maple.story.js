// Zombie_Apocalypse — Maple Hollow's story, in the shape every map's story module has (see kit.js, "STORY MODULE").
// It re-uses the text in js/story.js (which main.js still imports directly) so there is one copy of it; this file
// proves the interface: main.js can run any map's story from a module like this one.
import { NOTES, RADIO, CHAPTERS, TUTORIAL, TIPS } from '../story.js';

export const title = 'Maple Hollow';
export const subtitle = 'Saturday, November 8';
// shown over the black before the first frame (one line at a time)
export const intro = [
  'Maple Hollow. Saturday, November 8.',
  'A normal morning.',
  'Until noon.',
];
export const startHour = 8;          // the run starts at 08:00 (the calm morning) ...
export const outbreakHour = 12;      // ... and the noon broadcast turns it
export const chapters = CHAPTERS;
export const notes = NOTES;
export const radio = RADIO;
export const tutorial = TUTORIAL;
export const tips = TIPS;
// the noon broadcast: [time in s, line]
export const news = {
  anchor: [
    [4.6, 'We interrupt this program with breaking news out of Maple Hollow.'],
    [9.0, 'A man has collapsed outside the Quick Stop market on Main Street after eating a hamburger from the store\'s grill.'],
    [13.6, 'County health officials say the meat was contaminated with a mixture of radium and carbon dioxide. They do not yet know how.'],
    [18.2, 'Witnesses say the man is "behaving strangely." We go live to the scene.'],
  ],
  reporter: [
    [23.0, 'REPORTER: ...I\'m outside the Quick Stop, where just minutes ago — wait. He\'s on the ground. Somebody\'s helping him —'],
    [28.0, 'REPORTER: He\'s getting up. Sir? Sir, are you — OH MY GOD. HE BIT HIM. HE BIT HIM!'],
    [32.5, 'REPORTER: Get back! Everybody get back! Danny, keep rolling — DANNY —'],
  ],
};
// the way out: the rescue helicopter at the crossroads, 02:00 the first night (and one last time the next), one minute
export const ending = {
  kind: 'heli',
  at: { x: 0, z: 0, yaw: Math.PI },
  name: 'Main St & Maple Ave',
  hour: 2,
  schedule: [{ day: 2, hour: 2 }, { day: 3, hour: 2 }],
  window: 60,
};
// the per-frame / per-event hook for map-specific moments (Maple Hollow's are still hard-wired in main.js).
// G: the game state; api: { think, toast, bigText, setStage, later, world, SND, spawnZombie } (what main.js passes)
export function beats(G, api) { }

export default { title, subtitle, intro, startHour, outbreakHour, chapters, notes, radio, tutorial, tips, news, ending, beats };
