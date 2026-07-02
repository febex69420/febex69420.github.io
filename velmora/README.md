# VELMORA — Supreme Marshal

A first-person 3D sandbox that runs entirely in the browser (Three.js, no build
step). You are the **Supreme Marshal of the Grand Republic of Velmora** — a
completely fictional nation with fictional people, flags, rivals and history.

There are **no missions, no story, no win condition**. The whole game is freedom
and immersion: an explorable presidential palace with hundreds of staff, an open
country with a capital city, village, army base, airfield, forests, mountains
and a coastline — plus weapons, vehicles and command systems to play with.

## Play

Open `index.html` over HTTP (it uses ES modules), or visit the hosted page.
Desktop + mouse/keyboard required. Click **ASSUME COMMAND**.

## What you can do

- **Explore the palace** — throne room, grand hall, state office, war room,
  banquet hall, library, private quarters, three floors, an underground bunker
  with command centre + armoury, and a hidden hatch in the office leading to a
  secret tunnel that surfaces in the garden gazebo.
- **Summon a military escort** (`G` or radio) — 8 soldiers rally to you, form a
  wedge, clear crowds, salute, board vehicles with you (APCs join your convoy),
  return fire on threats and dismiss on command.
- **Govern from your desk** (`E` at the office desk) — national stats, summon
  advisors, convene the war council, order troop inspections, deploy squads to
  any region, read procedurally generated intelligence, issue decrees, raise the
  national alert state.
- **Arsenal** (`1–6`) — VK-9 sidearm, AR-77 rifle, K-12 shotgun, M-88 sniper
  (scope), HV-6 LMG, RPL-4 rocket launcher. Tracers, recoil, reloads,
  destructible crates/barrels/range targets, explosions with area damage.
- **Vehicles** (`E` to board) — state limousine with pennants, recon jeep,
  Bastion APC, army truck, Kestrel helicopter, Zarya fighter jet (take off from
  the airfield runway). `T` radio can deliver vehicles anywhere.
- **A living nation** — guards patrol and investigate noises, citizens follow
  daily routes, flee gunfire and remember danger, traffic drives the highways,
  soldiers drill at Fort Karst, day/night cycle, weather with rain and
  lightning, street lights at night.

## Controls

See the in-game start screen (`ESC` pause menu has settings: graphics quality,
volume, sensitivity, invert-Y, time flow).

## Architecture (for extending)

```
src/
  core/     config, event bus, input, procedural audio, materials, utils
  world/    colliders (AABB grid), analytic terrain, sky/weather,
            palace / city / military generators, props & destructibles
  ai/       NPC humanoids + role state machines, population manager,
            escort squad, road traffic
  player/   FPS controller, weapons
  vehicles/ car/heli/jet physics + escort convoy AI
  systems/  effects (pooled particles), government simulation
  ui/       HUD, menus, map
```

Everything shares one `ctx` object; new systems plug into the update loop in
`src/main.js`. World layout (sites, regions, population counts) lives in
`src/core/config.js`.

All countries, persons, organisations and events are fictional.
