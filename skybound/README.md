# SKYBOUND — Guardian of Lumera

A modern, **fully original** 3D open-world **superhero sandbox** that runs entirely in the
browser — no build step, no install, no third-party assets. You are **Meridian**, an almost
unstoppable hero adored by the city of **Lumera**: fly at sonic-boom speed, **slice
skyscrapers in half with your laser eyes**, catch meteors, fight original villains, and watch
thousands of citizens cheer, wave, and take photos.

> ▶ **Play:** open `index.html` (or visit the hosted page) and click **New Game**.

Everything — the hero, the city, every ability, the enemies, the audio — is **generated
procedurally from code**. No copyrighted superheroes, logos, names, voices, or assets are used.
See `LICENSE` and the originality charter in `DESIGN.md §0`.

---

## ✦ Highlights

- **Real-time laser slicing (the showcase).** The Optic Lance physically **cuts geometry**.
  Sweep it across a tower and it splits into **real, separate physics pieces** that inherit
  mass and momentum, glow at the molten cut, tumble, and **can be sliced again** — carve a
  skyscraper into chunks. Built on a custom convex plane-slicer (volume-conserving, any angle).
- **A living city.** ~480 city blocks across Downtown, Midtown, Residential, Commercial,
  Industrial, Parks, a Beach, a Stadium, a river with bridges, and hidden landmarks — all
  instanced and region-culled so you can fly ground-to-sky **with no loading screens**.
- **Thousands of adoring NPCs** driven by a real **Action Tree** (behavior tree): they have
  emotions, memory, schedules, and perception. They cheer, wave, photograph you, gather around,
  gawk at your powers, and flee real danger — and **remember** what they just saw.
- **Physics destruction.** Buildings fracture, debris tumbles, vehicles deform/flip/explode,
  ground slams leave craters and shockwaves, sonic booms blast everything outward.
- **Dynamic traffic** with car-following, traffic lights, emergency response, and vehicles you
  can **grab, throw, slice, and shockwave**.
- **A full power set** — flight, hover, sonic boost, super-speed with **slow-motion**, super
  jump, dash, laser eyes, thermal vision, pulse blasts (+overcharge), cryo breath, gale force,
  power punches, ground breaker, shock clap, grab/lift/throw, deep sight (x-ray), acute hearing,
  and the Aegis durability toggle.
- **Combat & events.** Original villains with their own action trees and ragdolls; an optional
  **drama director** that paces crimes, fires, accidents, villain attacks, and meteor disasters.
- **Day–night cycle, dynamic weather** (clouds, rain, storms, lightning), bloom/glow, and
  cinematic camera work.
- **Robust meta** — multi-slot saves, full graphics/camera/audio/**accessibility** settings,
  **rebindable controls**, a skill tree, and a **sandbox menu** (spawn anything, set weather/time,
  teleport, toggle invulnerability/infinite energy).

---

## ✦ Controls (default — all rebindable in *Settings → Controls*)

| Action | Key |
|---|---|
| Move | `W A S D` · Look: Mouse |
| Sprint / Super-speed / Flight boost | `Shift` |
| Jump / Skyfall (hold to charge) | `Space` |
| Toggle flight | `F` · Ascend `Space` / Descend `Ctrl` |
| Dash | `Q` · Slow-mo `T` |
| **Primary fire** (Laser / Punch / Pulse) | **Left Mouse** — *hold & sweep the laser to slice* |
| Switch primary | `1` `2` `3` or Mouse Wheel · Power wheel `Tab` |
| Thermal vision | Right Mouse |
| Ground slam `G` · Shock clap `C` · Grab/Throw `E` |
| Pulse `R` · Cryo breath `V` · Gale force `X` |
| Deep Sight (x-ray) `Z` · Acute hearing `H` · Aegis `B` · Lock-on Middle Mouse |
| Sandbox menu `M` · Pause `Esc` |

---

## ✦ Architecture (no build step)

Pure ES modules with an `importmap` pointing at a vendored, MIT-licensed **Three.js r160**.
Open the file statically (GitHub Pages friendly). Full system design is in **`DESIGN.md`**.

```
src/
  main.js                 orchestrator: renderer, loop (time-dilation), wiring, save/load
  core/      util · input · settings · assets (procedural textures/particles/audio)
  render/    sky (day-night) · weather · postfx (bloom)
  world/     cityplan (pure, deterministic) · city (instancing/culling/sliceables)
  physics/   slicer (plane mesh-cutter) · physics (rigid bodies) · destruction
  entities/  hero (rig+anim+controller+camera) · powers · power_laser · power_combat · vision
  ai/        behavior_tree · npc · crowd · traffic · director
  combat.js · progression.js · ui.js
```

### Tests
Pure-logic cores are unit-tested under Node (no browser needed):

```bash
node smoke.test.mjs        # slicer, behavior tree, RNG/noise, ring buffer, event bus
node integration.test.mjs  # progression, save migration, city determinism, slicer stress
```

The slicer tests verify **volume conservation** across straight, angled, and **24 repeated
random cuts** — the guarantee that makes infinite re-slicing exact.

---

## ✦ Originality & License

MIT (`LICENSE`). All game content is original and procedurally generated; the only bundled
third-party component is Three.js, under its own MIT license (`vendor/THREE-LICENSE`). No
copyrighted characters, trademarks, logos, voices, or assets from any existing franchise are
used anywhere in this project.
