# 👑 SOVEREIGN — Rule Your Nation

A browser-playable **3D sandbox nation simulator**: part grand strategy, part city
builder, part political simulator, all sandbox. You are the ruler of a
procedurally generated fictional country. There are no objectives and no
script — govern however you like, and live with what the simulation makes of it.

**Play it:** open `index.html` (or `/sovereign/` on the site). No build step,
no install — plain ES modules + a vendored copy of three.js.

## What's inside

### A living, procedural world
- Seeded procedural generation: terrain, coasts, mountains, forests, rivers of
  road, five nations with organic borders, provinces, cities, towns, villages,
  farms, factories, military bases, airfields and harbors. Every seed is a new map.
- Full day/night cycle, four seasons that repaint the terrain and trees,
  weather (rain, storms with lightning, snow), drifting clouds, stars,
  street lamps at night.

### Every NPC is a simulated person
- Hundreds of persistent citizens per nation — each with a name, age, family,
  home, workplace, wealth, personality traits, fear, happiness, **memories**
  and an evolving opinion of you. National statistics are derived *from* the
  agents, not the other way around.
- They commute between home, work and the plaza on a daily schedule; they
  gather on the square when they protest; you can walk up to any of them in
  first-person mode and open their dossier.
- Notable citizens (opposition leader, general, tycoon, journalist, cleric…)
  carry outsized influence. The general's mood is worth watching.

### Rule however you want
- **Laws**: press freedom, political speech, assembly, elections, secret
  police, conscription, welfare, religion, borders, curfews, labor law — every
  decree instantly ripples through the population.
- **Economy**: taxes (with evasion at extremes), seven budget lines, national
  debt, trade, resources, sanctions, and a printing press with honest
  consequences (inflation).
- **Justice**: honor, arrest, imprison, exile or execute any citizen.
  Families remember. Martyrs are made. Embassies cable home.
- **Construction**: place roads, railways (water gaps become bridges),
  housing, schools, hospitals, universities, labs, factories, farms, power &
  nuclear plants, monuments, parks, bunkers, walls, airstrips, harbors —
  anywhere in your territory. Buildings take days to complete and then feed
  the simulation (jobs, healthcare, power, research, defense).

### War & diplomacy
- Five AI nations with leader personalities (aggression, paranoia, greed,
  honor) that trade, ally, sanction, spy, issue ultimatums and declare war —
  on you and on each other.
- Real units on the map: infantry, armor, artillery, air wings, naval
  squadrons. Movement orders, morale, supply lines, attrition, terrain,
  front-line provinces, capitulation, annexation or white peace.
- Espionage: infiltrate, sabotage, incite unrest, steal research — with the
  risk of captured agents and diplomatic incidents.
- Rebellions rise from genuinely disaffected citizens; coups brew in an
  unhappy officer corps; democracies hold real elections you can lose
  (and, if you dare, annul).

### Systems that push back
Random events keep runs unique: earthquakes, floods, epidemics (with a real
spread model), booms, crashes, strikes, scandals, refugee crises, border
incidents, festivals, assassination attempts.

### Presentation
- Four camera modes: RTS strategy view, free-fly, first-person street level,
  and a letterboxed cinematic tour. (`C` cycles.)
- Clean draggable-window UI: dashboards, live economic charts, minimap,
  notifications, decision modals, customizable hotkeys.
- Fully procedural audio: UI sounds, war booms, thunder, wind/rain/birds/
  crickets, and a generative ambient score that darkens when the nation does.
- Save/load to localStorage.

## Controls

| Input | Action |
| --- | --- |
| `WASD` / edge pan | Pan the map |
| `Q` / `E`, middle-drag | Rotate |
| Mouse wheel | Zoom |
| `C` | Cycle camera (strategy → fly → walk → cinematic) |
| `Space`, `1–3` | Pause / game speed |
| `T` | Territory overlay |
| `B` | Construction panel |
| Left click | Select unit / citizen / place building |
| Right click | Order selected division to move |
| `G` | Rotate blueprint |
| `Esc` | Cancel / close window |

All hotkeys are rebindable in **Settings**.

## Code layout

```
sovereign/
├── index.html            entry point (importmap + HUD skeleton)
├── css/style.css         UI stylesheet
├── vendor/               three.js r160 (vendored, no CDN needed)
└── js/
    ├── main.js           bootstrap, game loop, pointer input, save/load
    ├── core/             rng+noise, names, event bus, shared state G
    ├── sim/              world gen, citizens, economy, laws, politics,
    │                     nations/diplomacy/espionage, military, events, tick
    ├── gfx/              scene/weather, terrain, buildings, units, agents
    ├── game/             cameras, construction, procedural audio
    └── ui/               window manager, panels, charts/minimap/toasts
```

Design principles: the simulation (`js/sim`) is DOM-free and runs headless
(that's how it's smoke-tested); graphics read simulation state through the
event bus; everything procedural derives from the seed. Adding a mechanic
usually means one new `sim/` module plus a panel.

Everything in the game is fictional and generated at runtime.
