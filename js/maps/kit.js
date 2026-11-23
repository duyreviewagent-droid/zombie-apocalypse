/* =====================================================================================================================
   Zombie_Apocalypse — THE MAP KIT.  How to write a map: js/maps/<id>.js + js/maps/<id>.story.js
   =====================================================================================================================

   world.js builds the world. Maple Hollow ('maple') is its own hand-built code; every other map is a module:

       // js/maps/desert.js
       export function buildMap(K) {
         K.bounds(-120, -120, 120, 120);          // FIRST: the playable square (max ±160 m; fences are yours to build)
         K.preset('desert');                      // sky / fog / hills / ground texture / grass / footsteps / ambience
         ... lay the place out with K.* ...
         return { name: 'Dry Creek', start: { x, z, yaw }, home, lz: { x, z, yaw }, lzName: 'the airstrip',
                  spawns: [...], bounds: K.W.bounds, preset: 'desert', ambient: 'desert', names: { ... } };
       }

   main.js does:   const info = await world.buildAsync(mapId);  (→ W.build(mapId, module) → buildMap(K) → finish())
   After buildMap returns, world.js merges/instances everything, builds the collision grid and the zombie nav grid.
   Test it:  ./run.sh "play=1&noao=1&skipcalm=1&notut=1&map=desert" "..."   and ./shot.sh ... with hit=1 (collision overlay).

   COORDINATES. Metres. y up. Ground is y = 0 (unless you use K.terrain). yaw is radians about +y; a box/wall/room
   "local x" points along world (cos yaw, −sin yaw), "local z" along (sin yaw, cos yaw). So yaw 0: local x = +x, z = +z.
   Every solid thing is an oriented box { x, z, hx, hz, yaw, y0, y1 } in W.boxes: people are pushed out of them,
   bullets stop on them, zombies path round them. DRAW AND SOLID MUST MATCH (check with hit=1).
   Static geometry is merged per material per 55 m chunk; repeated props are instanced: thousands of things are fine,
   thousands of separate THREE.Mesh objects are NOT (use K.box / K.inst / K.xadd, not K.mesh, for anything repeated).

   ------------------------------------------------------------------------------------------------ RETURN VALUE
   {
     name:    'Dry Creek',                     // shown in menus
     start:   { x, z, yaw },                    // where the player spawns (open ground, not inside a box)
     home:    H,                                // optional: a record from K.room() / K.house() — the player's base
     lz:      { x, z, yaw },                    // the ending's landing zone / exit (helicopter, plane, boat, tunnel)
     lzName:  'the airstrip',
     spawns:  [{ x, z }, ...],                  // where zombies come from (edges, gates, tunnels). Also K.spawn(x, z).
     bounds:  { x0, z0, x1, z1 },               // same as K.bounds (nobody can leave this square)
     preset:  'desert' | 'jungle' | 'prison' | 'stadium' | 'suburb' | { custom preset object, see below },
     ambient: 'desert' | 'jungle' | 'prison' | 'city' | 'suburb',   // ambience sound set (audio.js picks it up)
     names:   { lz, town, ... },                // any names your story wants
     notes:   [{ x, z, y, id }],                // optional: where story notes lie (main.js puts them in containers)
   }

   ------------------------------------------------------------------------------------------------ K: THE HELPERS
   K.THREE, K.TX (tex.js), K.MAT (all world materials by name), K.GEO (shared geometries), K.TILE (metres per texture
   repeat by material name), K.mat4(x, y, z, ry, sx, sy, sz, rx, rz) → Matrix4, K.std({...}) → MeshStandardMaterial,
   K.ctex(w, h, (ctx2d, w, h) => {...}, [repX, repY]) → CanvasTexture, K.rng(seed) → () => 0..1, K.W (the world),
   K.level (the THREE.Group currently being built into — changes inside K.chaos / K.sub).

   Materials by name (strings for K.box / K.block / walls / rooms; objects as K.MAT.x for K.inst / K.xadd):
     ground/paving  road roadLine roadWhite walk drive concrete curb gravel dirt mulch
     walls          brick concrete siding0..7 paint0..5 (interior) trim plank fence picket ceiling ceilTile
     roofs/floors   shingle0..2 floorWood floorCarpet floorCarpet2 floorTile floorTile2 rug0 rug1
     metal          metal darkMetal rust alu chrome shelfMetal chainlink redPaint yellowPaint bluePaint greenPaint
     other          glass shopGlass frosted orange stripes white black rubber cabinet darkWood counter appliance
                    porcelain mattress fabric0..4 book0..5 leaves leaves2 needles hedge bark rock car0..7 carWhite carBlack
     Add your own: K.MAT.myThing = K.std({ map: K.ctex(...), roughness: 0.8 }); K.TILE.myThing = 2;
     (a string key passed to K.box must exist in K.MAT.)

   GEOMETRY + COLLISION
     K.box(x, y0, z, hx, y1, hz, yaw, mat)          drawn only. mat: name, or f => name|null per face
                                                    (faces 'px','nx','pz','nz','top','bot').  y0/y1 are absolute.
     K.solid(x, z, hx, hz, yaw, y1, surf='concrete', y0=0, extra={})   collision only. surf: footstep/impact sound
                                                    ('concrete','wood','metal','glass','brick','dirt'...).
                                                    extra: { vault: true } low things you hop, { window: true }
                                                    see-through, { zOnly: true } stops zombies only, { noWalk } ...
     K.block(x, y0, z, hx, y1, hz, yaw, mat, surf='wood', solid=true)   both at once (returns the box)
     K.wall(x0, z0, x1, z1, { h=2.8, t=0.2, y0=0, mat (right-hand face), inMat (left-hand face), surf,
            openings: [{ at (m from wall middle), w, sill, top, glass: true }  // a window (pane + frame + window box)
                       { at, w: 0.95, door: true, dir: 1|-1, col, hp, glassDoor, front }  // a real door
                       { at, w }  // an empty doorway / gap ] })  → { boxes, doors }
     K.room(x, z, w, d, yaw, { h, t, mat: 'brick', inMat: 'paint2', floor: 'floorTile'|null, ceiling: true,
            roof: 'flat'|'gable'|null, roofMat, ridge, parapet, step: 'tile',
            doors: [{ side: 's'|'n'|'e'|'w', at, w, dir }], windows: [{ side, at, w, sill, top }],
            inside: [[lx, lz], ...] open floor spots (local), name, home: false (never a player home) })
         → H (a "house": W.houseAt() finds it, so the camera, lighting and roof-hiding work inside; H.doors,
           H.front). Walls are 's' (local z −d/2), 'n' (+d/2), 'e' (x +w/2), 'w' (−w/2). Build bigger buildings
           from several rooms side by side, or rooms + K.wall for inner partitions.
     K.door(x, z, yaw, dir=1, col=0xe6e2d8, house=null, { w, frame, wallT, hp, glassDoor, interior })
         a hinged door: hinge at (x, z), the leaf runs along local +x for w. Zombies bang on and break doors.
     K.gableRoof(x, z, hx, hz, yaw, yEave, yRidge, mat='shingle0', gableMat='siding0', walk=true)
     K.deck(x, z, hx, hz, yaw, y, { mat, solid, climb, draw })   a floor at height y you can stand on
         (stage, catwalk, platform). solid: a block from the ground (climb: true → clamber up with Space).
     K.stairs(x, z, yaw, w, len, yLow, yHigh, mat='concrete', { open, rails })   stairs rising toward local +z
         (W.ramps; zombies don't climb them — W.navBlocks).
     K.inst(geo, material, K.mat4(...), shadow=true)   INSTANCED copy of a shared geometry — use for repeats
     K.xadd(geo, material, K.mat4(...), shadow=true)   one-off detailed shape, merged into the static mesh
     K.WX(geo, mat, x, y, z, ry, sx, sy, sz, rx, rz)   shorthand for xadd
     K.wbeam([x,y,z], [x,y,z], w, h, material)       a beam/pipe/rail between two points
     K.mesh(geo, mat, x, y, z, ry)                    a plain THREE.Mesh (only for things that move / animate)
     K.sub(fn) → Group                                build fn's stuff into its own group (to show/hide as one)
     K.rectOf(x, z, hx, hz, yaw) → [x0, z0, x1, z1]

   NATURE
     K.tree(x, z, scale=1, kind=0|1)  K.pine(x, z, s)  K.bush(x, z, s)  K.hedge(x, z, len, yaw, h=1.1)
     K.sapling(x, z, s)  K.fallenTree(x, z, yaw, len, s)  K.flowerPot(x, z)
     K.rock(x, z, size=1, { yaw, flat, mat, solid })   boulders (solid when > 0.45 m; low ones vaultable)
     Trees are cheap (instanced). The leaves sway in the wind and glow when back-lit; it's all done in the shaders.

   TOWN / STREET PIECES (all solid where they should be)
     K.picketFence(x0, z0, x1, z1)  K.privacyFence(...)  K.chainFence(...)   (vaultable; zombies can't climb)
     K.streetLamp(x, z, yaw)  (lights itself at dusk)   K.trashBin(x, z, yaw)  K.hydrant(x, z)  K.cone(x, z, tipped)
     K.mailbox(x, z, yaw)  K.barricade(x, z, yaw)  K.crateStack(x, z, yaw, n)  K.gardenChair  K.gardenTable  K.yardSign
     K.car(x, z, yaw, colour 0..7, 'sedan'|'suv'|'pickup'|'van', opts) → drivable/searchable car
     K.wreck(x, z, yaw, colour, burning, roll)   (in the chaos layer)   K.policeCar(x, z, yaw)  K.ambulance(x, z, yaw)
     K.house(x, z, yaw, seed, opts)  a complete Maple Hollow house (12 × 10 m + yard/drive; front faces local +z)
     K.watchtower(x, z, yaw, side, alt)  K.store(x, z, yaw)  K.gasStation(x, z, yaw)  K.playground(x, z, yaw)
       (the last three are Maple's own buildings; they work anywhere but say "Quick Stop" etc.)

   LOOT + THINGS THAT OPEN
     K.container(kind, x, z, y, label, yaw=0, house=null, extra={}) → c     a searchable spot (press E).
       kind = a loot table in loot.js: kitchen kitchen2 fridge pantry medicine nightstand dresser closet cabinet shelf
       shed garage bin car truck police ambulance store cooler register pharmacy pump bench corpse attic atticBox
       atticCase (ask the lead for new tables). extra.fixed = [['pistol', 1], ['ammo9', 12]] for guaranteed loot.
       Parts that animate open: c.parts = [{ o: Object3D, a: angle, axis: 'y'|'x'|'z' }   (a hinged lid / door)
                                           { kind: 'slide', o: Object3D, d: metres }]     (a drawer, along local z)
       (build those Object3Ds with K.mesh so they can move; they open when searched.)
     K.breakable(kind, x, z, yaw, o, build, broken)   advanced: see world.js 'things that break'

   THE OUTBREAK LAYER (CHAOS)
     K.chaos(x, z, () => { ...build... }, key=null)   everything built inside is the AFTERMATH: hidden on the calm
       morning, revealed (out of the player's sight) as the outbreak spreads. Wrecks, barricades, fires, bodies,
       blood, boarded windows, toppled fences. Boxes, containers, emitters, hazards inside go on/off with it.
       Use a key to group many small things into one piece ('mess3,4').
     K.emitter({ x, y, z, kind: 'fire'|'smoke'|'column'|'sparks', rate, t: 0 })   particles (main.js runs them)
     K.hazard(x, z, r, 'fire'|'wire', dps)   hurts whoever stands in it
     K.blood(x, z, size, y)                   a blood pool decal

   GROUND, WATER, TERRAIN, AIR
     K.preset(name | { zen, hor, fog (hex colours), fogMul, cloud 0..1, hills (hex), hillH, ground: 'grass'|'dirt'|
              'sand'|'mud', grassK (grass blade density 0..1.2), step (default footstep), ambient })
       built-ins: 'suburb' (Maple), 'desert', 'jungle', 'prison', 'stadium'. Time of day still runs (the lead's
       story module decides the start hour) — presets tint it.
     K.groundKind('sand')                    the base ground texture everywhere
     K.region(x0, z0, x1, z1, 'dirt'|'mud'|'dark'|'paved', step)   paint ground patches + their footstep sound
     K.paint(x, z, radius, 'dirt'|'mud'|'dark', alpha)              a soft round patch (worn grass, scorch, mud)
     K.slab(x0, z0, x1, z1, mat='drive', step='concrete')           flat paving (car park, yard, pitch, runway)
     K.water(x0, z0, x1, z1, y=0.03, colour)   a still water plane (not solid: add K.solid banks if it's deep)
     K.terrain((x, z) => height, step=2)        hills: a displaced ground sheet; W.groundY follows it. Keep it 0
       under buildings (boxes don't follow the terrain) and toward the edges. Rocks/trees: pass y yourself if needed.
     K.light(x, y, z, colour, intensity, dist) → PointLight   (expensive: ≤ 6 per map; glow with emissive materials)

   FRAME
     K.bounds(x0, z0, x1, z1)    (call first; ±160 max)       K.spawn(x, z)   (zombie spawn points)

   ------------------------------------------------------------------------------------------------ PERFORMANCE
   Draw calls: aim for Maple's ballpark (~600-900). Repeats → K.inst; detail → K.xadd/K.box (merged). Lights ≤ 6.
   PointLights / transparent things / emitters cost the most. Grass blades: preset grassK.

   ------------------------------------------------------------------------------------------------ STORY MODULE
   js/maps/<id>.story.js  (see maple.story.js — it mirrors Maple Hollow's story):
     export default {
       title, subtitle, intro: ['line', ...],
       startHour, outbreakHour,
       chapters: [{ title: 'IT BEGINS', goal: 'html' }, ...],
       notes: { id: { title, text } },  radio: [[t, 'line'], ...],  news: { anchor: [[t, line]], reporter: [...] },
       tutorial?, tips?,
       ending: { kind: 'heli'|'plane'|'boat'|'tunnel', at: { x, z, yaw }, name, hour, schedule?: [{ day, hour }], window: s },
       beats(G, api) { }   // called by main.js every frame: map-specific moments
       reset?() { }        // a new run / restart: clear the beats' own state
       objectives: [{ id, x, z, y?, label? }]   // one per chapter, in order (or { chapterId: 'spotKey' } — resolved
                                                //   against info.spots by loadStory)
       noteSpots: { noteId: 'spotKey' }         // where each note lies (a key in the map's SPOTS)
     }
   Every field is lowercase (no TITLE / OBJECTIVES / NOTE_SPOTS / BROADCAST). loadStory(id, info) in maps/index.js
   normalizes older shapes to this one, so main.js reads only story.objectives / story.noteSpots / story.news.
   Voices: REAL RECORDED HUMAN VOICES ONLY (CC0/public domain). Never TTS. No real trademarks (no FIFA).
   ===================================================================================================================== */

// The kit object itself lives in world.js (W.kit — it needs the world's closures). This module only re-exports
// helpers that make map files shorter.
export const deg = d => d * Math.PI / 180;
// a seeded random (mulberry32) for maps that should look the same every run
export function seeded(seed = 1) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// points round a rectangle's edge, every `step` m, `inset` m in (handy for spawns and fence posts)
export function ring(x0, z0, x1, z1, step = 10, inset = 4) {
  const out = []; x0 += inset; z0 += inset; x1 -= inset; z1 -= inset;
  for (let x = x0; x <= x1; x += step) { out.push({ x, z: z0 }, { x, z: z1 }); }
  for (let z = z0 + step; z < z1; z += step) { out.push({ x: x0, z }, { x: x1, z }); }
  return out;
}
