# SKYBOUND — Guardian of Lumera
### Design Document & Technical Architecture

> A modern, high‑quality, **fully original** 3D open‑world superhero sandbox that runs
> entirely in the browser with **no build step** and **no third‑party assets**. Everything
> — characters, city, powers, names, logos, audio — is generated procedurally from code
> and is therefore legal for public release. No copyrighted franchise content is used.

---

## 0. Legal / Originality Charter

This is a hard constraint baked into every system:

* **No existing superhero, villain, franchise, logo, costume, catchphrase, voice, or trademark** is referenced or reproduced anywhere — not in code, assets, names, or comments.
* The hero is an original character: codename **"Meridian"** (player‑renameable), guardian of the fictional **Lumera City**.
* All ability names are **generic/descriptive or coined** (e.g. *Optic Lance*, *Cryo Breath*, *Ground Breaker*). Generic power descriptions ("laser eyes", "super strength") are functional genre vocabulary, not trademarks, and are used only as plain descriptions.
* **All art is procedural**: meshes are built from primitives in code; textures are painted onto `<canvas>` at runtime; audio is synthesized with the WebAudio API. There are **zero binary image/audio/model files** shipping with the game (only the MIT‑licensed Three.js library is vendored, with its license file included).
* Shipped under the MIT license (see `LICENSE`). Three.js retains its own MIT license (`vendor/THREE-LICENSE`).

---

## 1. Vision & Pillars

**Fantasy:** You are an almost‑omnipotent, beloved hero. The city adores you. You fly,
you cut skyscrapers in half with your eyes, you catch falling people, you punch giant
robots through buildings — and thousands of citizens cheer, wave, and photograph you.

**Design pillars (in priority order):**

1. **Power feels incredible** — responsive, weighty, cinematic. Every ability has clear
   feedback (visual + audio + camera + physics).
2. **The city is alive** — thousands of NPCs with real behavior, traffic, schedules,
   emotions, and reactions to *you*.
3. **Real‑time destruction & slicing** — the **Optic Lance (laser eyes)** physically cuts
   geometry into separate, simulated physics pieces. This is the showcase feature.
4. **Total freedom** — sandbox first. A "no restrictions" mode lets you do anything.
5. **Runs anywhere, smoothly** — seamless ground‑to‑sky flight, aggressive LOD, instancing,
   and budgeted simulation keep it fast in a browser tab.

---

## 2. Technology & Constraints

| Concern | Decision | Rationale |
|---|---|---|
| Renderer | **Three.js r160** (vendored, MIT) via ES‑module `importmap` | No build step; works on GitHub Pages from `file://`‑like static hosting |
| Language | Vanilla **ES modules**, no transpiler | Zero toolchain; `node --check` validates syntax |
| Physics | **Custom lightweight rigid‑body layer** | Full engines are heavy; we need slicing‑aware, debris‑focused dynamics tuned for spectacle |
| Geometry slicing | **Custom plane mesh‑slicer** | No off‑the‑shelf CSG dependency; gives molten cut caps + per‑piece bodies |
| Audio | **WebAudio synthesis** | No audio files; original, tiny |
| Textures | **Canvas2D procedural** | No image files; original |
| Persistence | **localStorage** (multi‑slot) | No backend |
| Animation | **Procedural articulated rig** | No mocap/FBX; fully original, code‑driven |

**Performance budget targets (mid‑range laptop, 1080p):**
* 60 FPS in normal play, ≥ 40 FPS during heavy slicing/combat.
* ≤ ~120k drawn triangles typical via instancing + LOD.
* Active full‑AI NPC budget: ~80–150 near the player; the rest are statistical/instanced crowd.
* Physics active bodies cap with sleeping; oldest debris recycled.

---

## 3. High‑Level Architecture

```
                         ┌──────────────────────────────┐
                         │            main.js            │  game orchestrator
                         │  renderer · fixed loop · save │
                         └──────────────┬───────────────┘
        ┌───────────────┬───────────────┼───────────────┬───────────────┐
        ▼               ▼               ▼               ▼               ▼
   render/*        world/city      physics/*        entities/*         ai/*
  sky weather     gen+stream+LOD   slicer bodies    hero powers     bt npc crowd
  postfx          buildings/props  destruction      vision combat   traffic director
        └───────────────┴───────────────┴───────────────┴───────────────┘
                                   ▲
                         core/* (util,input,settings,assets)   ui.js   progression.js
```

**Update model:** a **fixed‑timestep simulation** (60 Hz) with render interpolation.
`main.js` accumulates real time, steps `update(dt)` on all systems in a deterministic
order, then renders with an interpolation alpha. A global **time‑dilation** factor scales
simulation `dt` for super‑speed slow‑motion while keeping input/camera responsive.

**System update order each tick:**
`input → director(events) → traffic → crowd/npc AI → player/powers → combat →
physics(integrate+collide+slicing settle) → destruction settle → camera → ui`.

**Communication:** a tiny synchronous **event bus** (`core/util EventBus`) plus direct
references passed at construction. Systems publish *world events* (`POWER_USED`,
`DESTRUCTION`, `RESCUE`, `LASER`, `FLYBY`, `COMBAT`, `EMERGENCY`) that the **perception**
layer feeds into NPC memory.

---

## 4. Core Systems (`src/core`)

### 4.1 `util.js`
Deterministic PRNG (`mulberry32`), string→seed hash, value/fractal noise (for terrain &
city variation), math (`clamp`, `lerp`, `smoothstep`, `damp`, easing), small pooled vector
helpers, a typed `EventBus`, and a fixed‑size `RingBuffer` (for NPC memory & debris pools).

### 4.2 `input.js`
* Keyboard + mouse with **pointer lock**; optional gamepad.
* **Action map**: logical actions (`flyToggle`, `boost`, `laser`, `punch`, `slam`,
  `cryo`, `thermal`, `pulse`, `xray`, `grab`, `timewarp`, `dash`, `powerWheel`, …) bound to
  physical keys. **Rebindable** at runtime; persisted.
* Reports per‑frame `pressed/down/released`, mouse delta, wheel, and analog look.

### 4.3 `settings.js`
Settings model + persistence + apply:
* **Graphics presets** (Potato / Low / Medium / High / Ultra) controlling render scale,
  shadow quality, draw distance, NPC/traffic density, particle budget, bloom, weather FX.
* **Camera**: FOV, sensitivity, invert‑Y, shake intensity.
* **Audio**: master / SFX / music / UI volumes.
* **Accessibility**: reduce‑motion (camera shake & screen flashes off), colorblind palettes
  for HUD highlights, aim‑assist strength, UI scale, photosensitive‑safe lightning, subtitle
  toggles for event banners, "always‑on hints".
* **Gameplay/Sandbox**: invulnerability, infinite energy, collateral‑consequences on/off,
  time‑of‑day lock, NPC density, spawn menu enable.

### 4.4 `assets.js`
The procedural content factory:
* Canvas textures (façade/window atlas, asphalt, concrete, grass, sand, metal, skin/suit,
  noise, gradient ramps) cached & reused.
* Shared material library (PBR‑ish `MeshStandard`/`MeshLambert` mix chosen by quality).
* Pooled **particle** system (additive sparks, smoke puffs, dust, energy motes, debris bits)
  with a single instanced draw per type.
* **Decals** (scorch, crater rings, cut scorch) as pooled, fading planes.
* WebAudio **SFX synth** (whoosh, boom, laser hum, impact, cheer bed, sirens) — all generated.

---

## 5. Rendering Pipeline (`src/render`)

### 5.1 `sky.js`
* Large inverted **sky dome** with a gradient + sun‑scatter shader; **sun & moon** discs;
  **starfield** that fades in at night.
* **Day–night cycle**: a normalized time‑of‑day drives sun direction, light color/intensity,
  ambient, fog color, and HUD tint. Sun is the scene's directional (shadow‑casting) light.
* **Fog** (exponential) tuned per weather for depth and to hide LOD pop.

### 5.2 `weather.js`
State machine: `clear → cloudy → overcast → rain/storm → clearing`. Drives:
* **Volumetric‑style clouds**: layered, scrolling, soft billboard/shader clouds at altitude
  so flying *through/over* them looks great.
* **Precipitation**: instanced rain/snow streaks following the camera; ground wetness/reflection
  boost; puddle specular.
* **Storm**: distant lightning flashes (photosensitive‑safe option), thunder (synth), wind that
  feeds the flight wind‑streak system.

### 5.3 `postfx.js`
Self‑contained **bloom/glow** (bright‑pass threshold → separable Gaussian blur (downsampled) →
additive composite) + subtle color grade / vignette. Driven hard by lasers, energy, the sun,
and explosions. Fully disabled on Potato; scaled by quality. Implemented with `WebGLRenderTarget`s
and fullscreen‑quad shaders (no addon dependency).

---

## 6. World (`src/world/city.js`)

**Lumera City** is generated deterministically from a seed.

### 6.1 Layout
* A **road grid** with major avenues and minor streets defines rectangular **lots**.
* **Districts** assigned by region & noise:
  * **Downtown core** — dense **skyscrapers** (the tallest, most sliceable towers).
  * **Midtown offices** — mid‑rise glass/concrete towers.
  * **Residential** — **apartment** blocks & **neighborhood** houses with yards.
  * **Commercial** — **shops**, storefronts, signage, plazas.
  * **Industrial** — warehouses, tanks, cranes, smokestacks.
  * **Parks & green** — trees, paths, ponds, benches.
  * **Waterfront/Beach** — sand, boardwalk, water plane, piers.
  * **Stadium** — a large arena landmark.
  * **Bridges & highways** — elevated roads spanning a river, connecting districts.
  * **Hidden locations** — rooftop secrets, an underground bunker entrance, a lab, collectible "data‑cores".

### 6.2 Rendering & streaming (`streaming` inside city)
* **Instancing**: identical building shells, windows, props, trees, street lights, and
  parked cars draw via `InstancedMesh`. Hundreds of buildings → a handful of draw calls.
* **Spatial grid** of city cells. Each frame we compute the **active set** by distance &
  frustum: near cells = full detail + collision + sliceable; mid = simplified; far = LOD
  impostor boxes. **No loading screens** — it's one scene; cells just swap LOD.
* **Sliceable registry**: every building, vehicle, prop, tree, sign, wall, road segment is
  registered as *sliceable/destructible* with its mesh, transform, material, and mass so the
  laser/destruction systems can convert it into dynamic pieces on demand.

### 6.3 Buildings & props
Factory functions build each archetype from boxes/extrusions with procedural window grids,
ledges, rooftop units (AC, antennae, water towers), entrances, and signage. Props: street
lights, traffic lights, signs, hydrants, benches, trees, planters, dumpsters, parked cars,
billboards — all sliceable.

---

## 7. Physics (`src/physics`)

### 7.1 `physics.js` — rigid‑body world
* Bodies: **box** and **sphere** with mass, inertia approximation, linear+angular velocity,
  restitution, friction, and **sleeping**.
* Integration: semi‑implicit Euler with sub‑steps for fast pieces.
* Collision: **uniform‑grid broadphase**; resolve **body↔ground** (heightless flat + terrain
  height where relevant) and **body↔body** (box approximations) with impulse + positional
  correction. Static city colliders (building AABBs, road) stop dynamic bodies.
* **Forces API**: `applyRadialImpulse(center, radius, strength)` for shockwaves, ground slams,
  explosions, sonic booms — pushes bodies *and* notifies NPCs/vehicles.
* Budget: active‑body cap with **oldest‑recycled** policy; sleeping bodies are skipped.

### 7.2 `slicer.js` — the mesh slicer (showcase)
Pure geometry. Input: a **BufferGeometry** (world‑space or with transform) + a **cutting plane**
`(normal, constant)`. Output: **two new BufferGeometries** (`positive`, `negative`), each:
* Triangles fully on one side are copied to that side.
* **Straddling triangles** are clipped at the plane: split into 1+2 sub‑triangles via
  edge–plane intersection (interpolating position, normal, uv).
* The open boundary (the **cut loop**) is **capped**: intersection points are collected,
  projected to the plane basis, ordered, and triangulated (fan/ear‑clip) to produce a
  watertight cap with a distinct **molten/scorched** material id.
* Returns cut‑plane centroid & area so callers can place sparks, smoke, glow, and choose
  separation impulse.

Properties: works at **any angle/position**, supports **repeated cuts** (each piece is itself
sliceable), and preserves normals/UVs so pieces still look textured. Degenerate‑safe
(epsilon classification, skips slivers).

### 7.3 `destruction.js`
Bridges static world → dynamic sim:
* `fracture(sliceable, plane)` → uses slicer to produce pieces, removes/holes the original
  (or hides the sliced instance), spawns **rigid bodies** for pieces with inherited
  **mass/momentum**, adds molten‑edge glow + sparks + smoke + debris dust + sound, and applies
  a separation impulse so halves slide apart satisfyingly.
* **Building shake**: impulse near a structure offsets its instance transform with a damped
  spring (visual tremor) and may shed debris.
* **Vehicle deformation**: on impact, push affected vertices inward / swap to a dented profile;
  windows shatter (particle burst); cars can crush, flip, explode (fuel), and be sliced.
* **Craters**: ground slams stamp a crater decal + ring shockwave + dust + radial impulse.

---

## 8. The Hero (`src/entities/hero.js`)

### 8.1 Procedural rig & animation
An **articulated figure** assembled from primitives (head, torso, pelvis, upper/lower arms,
hands, thighs/shins/feet, plus a cape sim) parented in a small skeleton. A procedural
**animation driver** blends pose generators:
* **Locomotion**: idle, walk, run, **super‑sprint** (lean + motion blur streaks).
* **Flight**: hover (subtle bob), forward flight (arms back, body horizontal), **boost**
  (arrow pose + sonic cone), banking on turns.
* **Combat**: punch / combo, uppercut launcher, **ground slam** wind‑up & impact, **shock clap**,
  grab & throw, block.
* **Powers**: eyes‑glow + head aim for **Optic Lance/Thermal**, breath pose for **Cryo**,
  hands‑forward for **Pulse/Beams**.
* **Reactions**: land (knee bend), hit‑react, taunt/wave to fans.
Driven by a small state machine + additive layers (aim look‑at, cape physics, secondary motion).

### 8.2 Controller & camera
* **States:** `Grounded` (walk/run/sprint/jump) and `Airborne/Flight` (hover/fly/boost), with
  smooth transitions (jump→hover, dive→land).
* **Movement** is physics‑influenced but **responsive‑first** (arcade‑tuned acceleration,
  air control, banking). Sonic‑boom boost ramps to extreme speed with screen FX + wind.
* **Camera rig:** smooth third‑person follow with collision‑avoid, dynamic FOV (widens with
  speed), speed shake (accessibility‑gated), and a **first‑person aim** lean for precise
  Optic Lance targeting. Free‑look, recenter, and photo‑mode framing.
* **Super‑speed slow‑motion:** entering sprint/boost can engage **time dilation** (world `dt`
  scaled down) while camera/input stay crisp — "bullet‑time" perception while moving fast.

---

## 9. Powers (`src/entities/powers.js` + `power_*` + `vision.js`)

A **PowerManager** owns an **energy** pool (regenerating; infinite in sandbox), cooldowns,
charge meters, the active power selection (**power wheel**), and dispatches to modules. Each
power: `canActivate`, `start/hold/release`, `update(dt)`, HUD descriptor, FX, and event
emission so NPCs react.

| Group | Powers |
|---|---|
| **Movement** (in hero controller) | Flight, Hover, **Sonic Boost** (boom + shockwave), Super‑Sprint, **Time Dilation** slow‑mo, **Skyfall Jump** (charge leap), **Dash** (rapid blink), wall‑impact crunch |
| **Optic** (`power_laser.js`) | **Optic Lance (laser eyes)** — real‑time slicing beam; **Thermal Vision** — burning/melting beam |
| **Beams/Blasts** (`power_beams.js`) | **Pulse Blast** (+ charged **Overcharge**), **Cryo Breath** (freeze cone), **Gale Force** (wind/shockwave), **Energy Beam**, precision cutting |
| **Strength** (`power_strength.js`) | **Power Punch** (combo), **Ground Breaker** (slam → crater+shockwave), **Shock Clap** (thunderclap wave), **Seismic Throw** (throw objects/vehicles), **Grab/Lift** (cars & massive objects) |
| **Vision/Senses** (`vision.js`) | **Deep Sight** (x‑ray — see/highlight through walls), Thermal overlay, **Acute Hearing** (ping & highlight nearby events/crimes) |
| **Defense** | **Aegis** — durability/invulnerability setting, damage resistance toggle |

**Energy/feel:** powers cost energy & have brief cooldowns to create rhythm, but sandbox mode
removes all costs. Charged attacks scale with hold time. Everything emits screen FX, particles,
camera kick, audio, and a **world event** for NPC perception.

### 9.1 Optic Lance pipeline (the centerpiece)
1. Beam originates at the eyes along the aim ray (first‑person lean for precision).
2. A glowing **beam mesh** + heat haze + eye glow + hum render every frame while held.
3. **Raycast** finds the nearest *sliceable* it touches; the impact point spawns sparks,
   molten glow, smoke, and a scorch decal.
4. As you **sweep** the beam, successive hit points define a **cut path**. When the sweep
   crosses an object we derive a **cutting plane** from the eye position + entry/exit points
   (any angle) and call `destruction.fracture()`.
5. The object **splits into real physics pieces** that inherit mass/momentum, glow at the
   molten cut, and tumble/fall. Pieces remain sliceable → **multiple cuts** carve a tower into
   chunks. Big satisfying audio + camera + crowd "ooooh".

---

## 10. NPC AI — Action Tree (`src/ai`)

### 10.1 `behavior_tree.js` — the Action Tree core
A proper **behavior/action tree**:
* **Composites:** `Sequence`, `Selector`, `Parallel`, `RandomSelector`.
* **Decorators:** `Inverter`, `Succeeder`, `Cooldown`, `UntilFail`, `Condition` guard.
* **Leaves:** `Action` (returns `SUCCESS/FAILURE/RUNNING`), `Wait`, `Condition`.
* **Blackboard** per agent (memory, targets, emotion, goals, schedule cursor).
* Ticked with a budget; running nodes resume next tick. Trees are **data‑built** & shared
  (one tree instance ticked against many blackboards) for cache‑friendliness.

### 10.2 `npc.js` — the citizen
Each NPC has:
* **Identity:** name, look (procedural color/build), home & work lot, role.
* **Emotions:** `joy, fear, admiration, surprise, anger` (decaying floats) → drive animation,
  facing, and tree branch selection.
* **Memory:** a `RingBuffer` of recent perceived **world events** (what/where/when/intensity)
  with decay; influences behavior ("remember the laser show") and dialogue.
* **Perception:** each tick samples nearby events (power use, destruction, rescues, flight
  overhead, laser, super‑speed, combat) within sense radius → pushes to memory & bumps emotion.
* **Schedule:** daily routine keyed to day–night (home → commute → work/shop/park → home),
  interruptible by reactions/emergencies.
* **Render:** instanced billboard/low‑poly figure with a few animation states (idle, walk,
  wave, cheer, photo, flee, cower, point).

### 10.3 `npc_trees.js` — behaviors
Concrete trees selected by emotion/role:
* **Civilian routine** — follow schedule, wander sidewalks, idle, chat in groups.
* **Adoring fan** — on seeing the hero: orient, **wave**, **cheer**, **take a photo** (flash +
  hold phone), **ask for autograph** (approach & queue), **gather/crowd**, celebrate heroics.
* **Startled/awe** — gasp, point, step back at powers/destruction.
* **Fearful/flee** — run from danger, **panic** in emergencies, cower, scatter from shockwaves.
* **Bystander‑in‑peril** — needs rescue (in fires/accidents) → grateful when saved (big
  admiration + renown reward).

### 10.4 `crowd.js` — scaling to thousands
* **Spawner** maintains a population around the player; recycles distant NPCs.
* **LOD AI:** *near* NPCs run the **full action tree** every tick; *mid* NPCs run a cheap
  reduced tick (a few states) every N frames; *far* NPCs are **statistical** (instanced,
  steered by flow fields, no tree). Promotion/demotion as the player moves.
* **Steering/flocking:** separation, cohesion, alignment, seek/flee, arrival, sidewalk‑follow,
  and **gather‑around‑hero** (orbit at a respectful radius, leaving a stage). 
* **Cheering waves:** admiration spikes propagate through a crowd (a wave of raised arms +
  synth cheer bed that swells with crowd size). Photo flashes ripple. Autograph queue forms.

### 10.5 `traffic.js`
* **Lane graph** built from the road grid (nodes at intersections, directed lane edges).
* **Vehicles** (cars, buses, trucks, **emergency**: police/ambulance/fire) drive edges with a
  **car‑following** model (desired speed, gap keeping, braking), stop at **traffic lights**,
  turn at intersections, and **react dynamically**: brake/stop/reroute around accidents, road
  blockage, destruction, or the player; honk; flee shockwaves; pile up believably.
* **Emergency dispatch:** the director sends sirening emergency vehicles toward incidents.
* Vehicles are **grabbable, throwable, sliceable, and deformable**.

### 10.6 `director.js` — world events & combat spawning
A **drama director** that paces optional content so the world feels eventful but never forced:
* **Events:** muggings/crimes, building fires, car accidents/pile‑ups, gas explosions,
  **villain attacks** (original enemies), robot/drone incursions, hostage situations,
  **disasters** (meteor strike, tremor, runaway vehicle, flood surge).
* Each event has triggers, participants (victims, perpetrators, emergency response, crowd
  reaction), success/fail states, and **renown rewards** for heroic resolution.
* Difficulty/pacing adapts to player level & current chaos; everything is optional — ignore it
  and just fly around, or chase the action.

---

## 11. Combat (`src/combat.js` + `entities/enemies` in director)

* **Enemies/villains** are **original** designs (e.g. *Riot Drones*, *Heavy Enforcers*, the
  *Ironclad* bruiser, the flying *Stormcaller*) with their own action trees (approach, attack,
  flank, retreat, special).
* **Player combat:** light/heavy punches & combos, **launchers** (juggle in air), grabs &
  **throws into the environment**, **Ground Breaker** AoE, **Shock Clap**, beams/laser, and
  **environmental knockback** — enemies are launched **through vehicles, walls, props, and
  structures**, triggering slicing/destruction & ragdolls.
* **Ragdolls:** on death/launch, enemies switch to rigid‑body ragdoll (linked capsules) that
  collides with the world and debris.
* **Feel:** hit‑stop (micro freeze), camera kick, impact particles, lock‑on/target assist
  (accessibility‑scalable), big readable telegraphs. Large‑scale **waves** for set‑pieces.
* Player damage gated by **Aegis**/invulnerability settings (default very durable; full‑invuln
  available).

---

## 12. Progression (`src/progression.js`)

* **Hero Level / XP** from heroics & combat.
* **Renown** — the city's admiration meter; rises with rescues, stopping crimes, crowd‑pleasing
  power displays; (optionally) dips with collateral when "consequences" is enabled (off by
  default — pure sandbox).
* **Skill points** → upgrade trees: power **damage/range/charge**, energy pool & regen, flight
  top‑speed, slicing power, new abilities & ability tiers.
* **Stats & challenges:** distance flown, objects sliced, people saved, combos, longest cut,
  highest crowd gathered — feeding optional objectives.
* Fully optional: a **God / Sandbox toggle** unlocks everything instantly.

---

## 13. UI / UX (`src/ui.js`)

* **Title screen**, save‑slot select/new game, settings, controls (full **rebinding**),
  accessibility, credits.
* **Pause** menu (resume, settings, save, quit‑to‑title).
* **HUD:** energy + health/Aegis bars, **Renown/XP**, a radial **power wheel** (hold to open,
  flick to select), **compass + minimap** (districts, events, objectives), **event/notification
  banners** ("Fire downtown!", "Crowd loves you!"), objective tracker, combo counter, speed &
  altitude readout, sliced/destroyed tallies, control hints.
* **Photo mode** (optional): freeze, free camera, FOV, filters — for showing off slices.
* **Spawn / sandbox menu:** teleport to landmarks, set time/weather, spawn objects/vehicles/
  enemies, toggle invulnerability/infinite‑energy/slow‑mo — total freedom.
* Built with DOM overlays (cheap, crisp text, easy a11y) over the WebGL canvas; **UI scale**
  and **colorblind palettes** honored.

---

## 14. Save System

* **Multi‑slot** localStorage saves: hero name, level/XP/renown/skills, unlocked powers,
  position, time‑of‑day, settings, sandbox toggles, stats, and persistent world flags
  (collected data‑cores, discovered hidden locations). Transient sim (debris, crowds, traffic,
  events) is **not** serialized — it regenerates. Autosave on key milestones + manual save.
  Versioned schema with migration guard.

---

## 15. Optimization Strategy (cross‑cutting)

* **Instancing** for all repeated geometry (buildings, windows, props, NPCs, vehicles, particles).
* **LOD + distance/frustum culling** via the city spatial grid; impostor far buildings.
* **AI LOD** (full / reduced / statistical) with a per‑frame tick budget and round‑robin.
* **Physics budget**: active‑body cap, **sleeping**, oldest‑recycled debris, sub‑stepping only
  for fast bodies, broadphase grid.
* **Slicing guards**: per‑frame cut cap, triangle‑count cap per piece (skip slivers), pieces
  auto‑sleep & recycle, very small pieces become non‑colliding debris.
* **Particle/decal pools** (no per‑frame allocation in hot paths); object pooling for vectors.
* **Render scale** + optional bloom/shadow downgrade per quality preset; **adaptive quality**
  can nudge render scale to hold target FPS.
* **Time‑sliced world streaming** so building/LOD swaps never stall a frame.

---

## 16. Controls (default; all rebindable)

| Action | Key/Mouse |
|---|---|
| Move | `W A S D` |
| Look | Mouse |
| Sprint / Super‑Speed | `Shift` |
| Jump / Skyfall (hold to charge) | `Space` |
| Toggle Flight | `F` |
| Ascend / Descend (flying) | `Space` / `Ctrl` |
| Sonic Boost | `Shift` (in flight) |
| Dash | double‑tap dir / `Q` |
| Time Dilation (slow‑mo) | `T` |
| **Optic Lance (laser eyes)** | **Left Mouse (hold & sweep)** |
| Thermal Vision beam | `Right Mouse` (in optic mode) |
| Power Punch / Combo | `Left Mouse` (melee mode) |
| Ground Breaker (slam) | `Space`+`LMB` while airborne / `G` |
| Shock Clap | `C` |
| Grab / Lift / Throw | `E` (grab) → `LMB` (throw) |
| Pulse Blast | `R` (hold = Overcharge) |
| Cryo Breath | `V` |
| Gale Force | `X` |
| Deep Sight (x‑ray) | `Z` |
| Acute Hearing | `H` |
| Aegis (invuln toggle) | `B` |
| Power Wheel | hold `Tab` |
| Lock‑on | `Middle Mouse` |
| Photo Mode | `P` |
| Sandbox/Spawn menu | `M` |
| Pause | `Esc` |

---

## 17. Module Map (implementation)

```
skybound/
  index.html                 entry, importmap, HUD/menus markup, styles, boot
  vendor/three.module.min.js  (MIT, vendored) + THREE-LICENSE
  src/
    main.js                  orchestrator: renderer, fixed loop, system wiring, save/load
    core/util.js             prng, noise, math, EventBus, pools, RingBuffer
    core/input.js            input + action map + rebinding
    core/settings.js         settings model, presets, persistence, accessibility apply
    core/assets.js           procedural textures/materials, particle & decal pools, audio synth
    render/sky.js            sky dome, sun/moon/stars, day-night, fog
    render/weather.js        weather FSM, clouds, rain/snow, lightning
    render/postfx.js         bloom/glow + grade
    world/city.js            city gen, districts, buildings, props, instancing, streaming/LOD, sliceable registry
    physics/slicer.js        plane mesh slicer (+ caps)
    physics/physics.js       rigid bodies, broadphase, collisions, radial impulses
    physics/destruction.js   fracture, debris, vehicle deform, building shake, craters
    entities/hero.js         procedural rig, animation, controller, camera, movement powers
    entities/powers.js       PowerManager, energy, wheel, dispatch
    entities/power_laser.js  Optic Lance + Thermal (slicing/burning)
    entities/power_beams.js  Pulse, Cryo, Gale, Energy beams/blasts
    entities/power_strength.js punch/slam/clap/throw/grab/lift
    entities/vision.js       Deep Sight (x-ray), thermal overlay, Acute Hearing
    ai/behavior_tree.js      action/behavior tree core + blackboard
    ai/npc.js                citizen: emotion, memory, perception, schedule, render
    ai/npc_trees.js          civilian/fan/awe/flee/peril trees
    ai/crowd.js              spawner, AI LOD, steering/flocking, cheering, photos, autographs
    ai/traffic.js            lane graph, vehicles, car-following, lights, emergency, reactions
    ai/director.js           world events, enemies/villains, waves, renown rewards
    combat.js                player combat resolution, launches, ragdolls, lock-on
    progression.js           XP/level/renown/skills/unlocks/stats
    ui.js                    HUD, menus, settings UI, rebinding, photo & sandbox menus
  smoke.test.mjs             pure-logic tests (slicer, behavior tree, prng/noise, steering, save)
  integration.test.mjs       cross-module wiring checks
  README.md  package.json  LICENSE  .gitignore
```

---

## 18. Build / Validation Plan

1. Author modules; validate every file with `node --check` (ESM syntax).
2. Pure‑logic **unit tests** (`smoke.test.mjs`): slicer correctness (volume/closure, repeated
   cuts), behavior‑tree semantics, PRNG/noise determinism, steering math, save round‑trip,
   city seed determinism.
3. **Integration** checks (`integration.test.mjs`): module exports/wiring, action‑map coverage,
   power registry completeness.
4. Manual in‑browser QA pass (flight, slicing, crowds, traffic, combat, weather, save) and
   perf check against budgets, then iterate.

---

## 19. Milestones (delivery order)

1. **Core + render + city** — fly around a living‑looking city, day/night, weather. *(foundation)*
2. **Hero + movement powers** — flight/hover/boost/sprint/jump/dash + camera feel.
3. **Optic Lance + slicer + destruction** — the showcase; cut the city apart.
4. **NPC action‑tree + crowd** — adoring, reacting citizens at scale.
5. **Traffic + director events** — alive streets, emergencies, rescues.
6. **Combat + enemies + ragdolls** — fights & set‑pieces.
7. **Progression + UI + save + settings/accessibility** — wrap, polish, optimize.

---

*This document is the contract the code follows. Where reality forces trade‑offs (browser perf,
single‑session scope), we favor the pillars in order: power feel → living city → slicing/destruction
→ freedom → performance.*
