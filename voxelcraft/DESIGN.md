# VoxelCraft — Design Document

A complete 3D voxel sandbox game in the browser, inspired by Minecraft. Runs entirely
client-side (GitHub Pages compatible), no build step, no server. Three.js (WebGL) for
rendering; everything else — terrain, textures, sounds, music — is procedurally generated
in-engine.

---

## 1. High-level architecture

```
index.html          UI markup + CSS + import map (three.js from CDN)
js/util.js          Constants, seeded RNG, math, shared voxel AABB physics solver
js/noise.js         Seeded simplex noise (2D/3D) + fBm
js/blocks.js        Block & item registries, procedural texture atlas + item icon sheet
js/worldgen.js      Terrain pipeline: biomes, heightmap, caves, ores, decorations,
                    structures (trees, villages, dungeons), Nether generator
js/world.js         Chunk store, block get/set, lighting engine (sky+block flood fill),
                    scheduled ticks (liquids), random ticks, edit-diff tracking
js/mesher.js        Chunk meshing (face culling, AO, per-vertex light), custom shaders
js/crafting.js      Shaped/shapeless recipes, smelting map, fuel registry
js/redstone.js      Power network evaluation (wire, torch, lever, button, plate, lamp…)
js/entities.js      Entity manager: mobs + AI, item drops, arrows, TNT, particles, spawning
js/player.js        First-person controller, physics, mining/placing, survival stats,
                    inventory model, damage/death/respawn
js/audio.js         WebAudio synthesizer: all SFX + generative ambient music
js/ui.js            HUD, inventory/crafting/furnace/chest screens, creative inventory,
                    chat, pause & settings menus, death screen, drag-and-drop item logic
js/commands.js      Chat command parser (/give /tp /time /gamemode /summon /fill …)
js/multiplayer.js   Shared-world multiplayer via BroadcastChannel (tab-to-tab on one
                    machine — the only server-less option on a static host)
js/main.js          Game orchestrator: scene, sky/clouds/weather, day cycle, fixed-tick
                    loop, save/load manager, title & world-select flow, dimensions
```

The `Game` object is the dependency hub: every system receives `game` and reaches
siblings through it (`game.world`, `game.player`, `game.ui`, `game.audio`, …).

## 2. World & chunks

- Chunk: 16×128×16 blocks. Index `(y<<8)|(z<<4)|x`. `Uint8Array` block ids,
  `Uint8Array` light (high nibble sky, low nibble block light).
- Chunks load in a radius around the player (configurable render distance 2–10),
  generated on demand, meshed with a per-frame budget to avoid hitches, unloaded
  (meshes disposed) outside radius+2.
- Block metadata (furnace state, chest contents, door open/facing, wheat growth,
  water level…) lives in a per-world `Map("x,y,z" → object)` — sparse and cheap.
- Edits are tracked as per-chunk diffs (`Map(chunkKey → Map(index → id))`) so saves
  store only deltas over deterministic generation.

## 3. World generation pipeline (per chunk, deterministic from seed)

1. **Climate** — temperature & humidity simplex fields select biome per column:
   ocean, beach, plains, forest, birch forest, desert, snowy tundra, mountains, swamp.
2. **Height** — continental fBm + ridged mountain noise blended by biome; sea level 62.
3. **Strata** — surface block by biome (grass/sand/snowy grass), dirt depth, stone, bedrock.
4. **Caves** — 3D simplex carving (two octave bands intersected for tunnel feel),
   surface-breaching allowed; lava pools below y=11.
5. **Ores** — seeded veins by depth: coal, iron, gold, redstone, diamond.
6. **Decorations** — trees (oak/birch/cactus per biome), flowers, tall grass, pumpkins,
   sugar-free :), mushrooms in caves, snow cover.
7. **Structures** — villages (house clusters + villagers, hashed onto a sparse grid),
   dungeons (underground cobble rooms with chest loot + spawner block).
8. **Nether (dimension 1)** — netherrack mass carved by 3D noise, lava ocean at y≤32,
   glowstone clusters on ceilings, soul sand patches, bedrock floor/ceiling.

## 4. Rendering

- One opaque mesh + one translucent (water) mesh per chunk; faces culled against
  opaque neighbors; cross-quads for plants; slim boxes for torches/wire/etc.
- Custom `ShaderMaterial`: texture atlas (nearest-filter, procedural 16×16 tiles),
  per-vertex `sky`/`block` light + AO/face shade attributes, uniform `uDay` so the
  day/night cycle re-shades the world without re-meshing, manual fog, water sway.
- Sky: gradient dome color-lerped through dawn/day/dusk/night, sun & moon billboards,
  star points at night, drifting procedural clouds, rain/snow particle curtains.
- Block-break crack overlay decal; item drops render as mini blocks/sprites; mobs are
  articulated box models (head yaw, leg swing) built from atlas-textured boxes.

## 5. Lighting

Minecraft-style 0–15 two-channel voxel lighting:
- **Skylight**: column seeding from the top, then BFS flood (down propagates lossless).
- **Block light**: BFS from emitters (torch 14, glowstone 15, lava 15, portal 11, …).
- Incremental add/remove floods on block change (classic two-phase removal BFS),
  cross-chunk via world-coordinate access; touched chunks re-mesh.
- Final shade = `max(sky × daylight, block)` evaluated in the shader.

## 6. Physics

Shared swept-AABB-vs-voxel solver (axis-separated) used by the player and every entity:
gravity, step-less collision, water/lava buoyancy & drag, ladders, fall damage,
knockback. Player: walk/sprint/sneak/jump/swim/fly (creative), eye height 1.62,
0.6×1.8 AABB.

## 7. Survival systems

Health (20), hunger (20) + saturation, air (drowning), fall/lava/fire/cactus/void
damage, regeneration when fed, starvation, eating, armor (iron/diamond sets reduce
damage), death screen with item scatter + respawn at spawn point/bed.

## 8. Items, crafting, containers

- Registry of ~70 blocks and ~70 items: tools in 5 material tiers with durability,
  mining speed and tier-gated drops; weapons; food; armor.
- Shaped (pattern-based, mirrored allowed) + shapeless recipes; 2×2 personal grid,
  3×3 crafting table; furnace with fuel burn time, smelt progress, scheduled ticks;
  chests (27 slots, persistent metadata).
- Full drag-and-drop inventory UI (left = take/place all, right = half/one), shift-click
  quick-move, hotbar 1–9 + wheel, creative inventory with category tabs and search.

## 9. Mobs & AI

Pig, cow, sheep, chicken (passive — wander, flee when hit, drop food/leather/wool/
feathers), villager (wanders home), zombie (chase + melee), skeleton (kiting archer),
spider (climbs, lunges), creeper (stalk → hiss → explode). State-machine AI: idle/
wander/chase/attack/flee with line-of-sight checks and pathless steering + jump.
Spawning: hostiles in darkness/at night within spawn ring, passives on grass in
daylight; per-type caps; despawn when far; spawner blocks in dungeons.

## 10. Redstone logic

Components: redstone dust (15-level signal falloff), redstone torch (inverter with
1-tick delay → clocks work), lever, stone button (timed pulse), pressure plate
(entity-weighted), redstone block, redstone lamp, powered doors, TNT ignition.
On change, the connected network re-evaluates: gather sources, multi-source BFS
through wire. Torch updates ride the 20 TPS tick queue.

## 11. Day/night, weather, dimensions

- 20-minute day (24000 ticks), `/time` controls; sleeping in a bed skips night and
  sets spawn. Hostiles burn at dawn? → kept: zombies/skeletons ignite in sunlight.
- Weather state machine (clear/rain/thunder) with timers, rain/snow particles
  (biome-dependent), lightning flashes + thunder, dimmer sky light during storms.
- Overworld + Nether: obsidian portal frames lit with flint & steel; 1:8 coordinate
  mapping; auto-built return portals; separate world store, generator, sky and fog.

## 12. Persistence

`localStorage`, multiple named worlds. Saved: seed, gamemode, time, weather, spawn,
player (position, stats, inventory, armor), per-dimension chunk edit diffs, block
metadata, entities. Autosave every 30 s + on pause/unload. World select screen with
create (name/seed/mode) and delete.

## 13. Multiplayer

Static hosting cannot run a socket server, so multiplayer uses `BroadcastChannel`:
every tab on the same machine that opens the same world joins a shared session.
Lowest peer id is host (simulates mobs/time/weather and broadcasts snapshots);
all peers exchange player transforms (10 Hz), block edits, chat, and item pickups.
Remote players render as named player models. The protocol is transport-agnostic —
the same message layer would ride on WebRTC/WebSocket if a server existed.

## 14. Audio

Pure WebAudio synthesis (no assets): material-aware dig/place/step sounds (filtered
noise bursts), hurt/eat/pop/click/splash/bow/explosion, mob voices (pitched osc
gestures), rain loop, thunder, portal whoosh; generative music engine — slow pentatonic
melodies over soft pads with feedback-delay "reverb", different scale/timbre in the
Nether. Master/music/SFX volume settings.

## 15. Commands

`/help /give /tp /time /weather /gamemode /summon /kill /clear /seed /setblock /fill
/spawnpoint /difficulty /say /heal /feed` — parsed from chat (T or /), with player
feedback and multiplayer chat relay.

## 16. Performance strategy

Typed arrays everywhere; chunk gen/mesh/light budgets per frame; dirty-flag remeshing;
single draw call per chunk per pass; texture atlas (one bind); object pooling for
particles; entity AI LOD by distance; localStorage writes debounced; no GC-heavy
per-frame allocation in hot loops.
