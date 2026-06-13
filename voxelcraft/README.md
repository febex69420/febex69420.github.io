# VoxelCraft

A complete 3D voxel sandbox game inspired by Minecraft — running entirely in the
browser with no build step and no server. **Play it at `/voxelcraft/` on this site.**

Everything is generated in-engine: block textures, item icons, sounds and music are
all procedural, so the whole game is a few hundred KB of code plus Three.js.

## Features

- **True 3D world** — 16×128×16 chunks, infinite procedural terrain, dynamic chunk
  loading/unloading, per-vertex sky+block lighting with ambient occlusion
- **Biomes** — ocean, beach, plains, forest, birch forest, desert, snowy tundra,
  mountains, swamp; caves, ore veins, lava lakes, trees, flowers, cacti, pumpkins
- **Structures** — villages with villagers, underground dungeons with monster
  spawners and loot chests
- **Survival** — health, hunger, drowning, fall/lava/cactus damage, armor, death &
  respawn, beds set spawn and skip the night
- **Mining & crafting** — tool tiers (wood/stone/iron/gold/diamond) with durability
  and mining speeds, 2×2 and 3×3 crafting, furnaces with fuel, chests
- **Mobs** — pig, cow, sheep, chicken, villager, zombie, skeleton (archer), spider
  (climbs), creeper (explodes); AI with wander/chase/flee/ranged states, day/night
  spawning rules, undead burn in sunlight
- **Redstone** — dust with 15-level signal falloff, torches (inverters — build
  clocks!), levers, buttons, pressure plates, redstone blocks, lamps, powered
  doors, TNT
- **Dimensions** — build an obsidian portal, light it with flint & steel, and enter
  the Nether (1:8 coordinate scaling, auto-built return portals)
- **Farming** — hoe grass into farmland, plant seeds, growing wheat, bread
- **Day/night cycle** — 20-minute days, sun/moon/stars, drifting clouds, dawn and
  dusk tints
- **Weather** — rain, snow in cold biomes, thunderstorms with lightning
- **Audio** — synthesized material-aware dig/place/step sounds, mob voices,
  generative ambient music (different scale in the Nether)
- **Creative mode** — flight (double-tap space), instant breaking, creative
  inventory with category tabs and search
- **Commands** — `/give /tp /time /weather /gamemode /summon /kill /clear /seed
  /setblock /fill /spawnpoint /difficulty /heal /feed /say /help`
- **Multiplayer** — open the same world in two browser tabs on the same machine:
  shared blocks, chat, and visible player avatars (BroadcastChannel transport;
  static hosting cannot run a game server)
- **Persistence** — multiple named worlds with seeds, autosave to localStorage

## Controls

| Input | Action |
|---|---|
| WASD / Space / Ctrl / Shift | Move / jump / sprint / sneak |
| Mouse, Left / Right / Middle click | Look, mine·attack / place·use / pick block |
| Mouse wheel, 1–9 | Select hotbar slot |
| E | Inventory (creative inventory in creative mode) |
| Q / Ctrl-Q | Drop item / stack |
| T or / | Chat & commands |
| F3 | Debug overlay |
| Double-tap Space | Toggle flight (creative) |

## Development

No build step. Serve the folder statically (`python3 -m http.server`) and open it.
`node smoke.test.mjs` and `node integration.test.mjs` run the headless engine tests
(world generation, lighting, liquids, crafting, redstone, commands) — `npm install
--no-save three` first. See `DESIGN.md` for the full architecture document.
