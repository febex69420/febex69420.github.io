# SUPREME LEADER

A 2D pixel-art sidescroller built with **HTML canvas + vanilla JavaScript** (no
libraries, no build step). You play as the dictator of the world's most powerful
nation. Walk through a wide, scrolling world, talk to the people who serve and
fear you, and rule by decree.

Open `index.html` in a browser to play. Live path on the site:
`/supreme-leader/`.

## Controls

| Action | Keys |
| --- | --- |
| Walk | `A` / `D` or `◀` / `▶` |
| Jump | `Space` / `W` / `▲` |
| Talk to nearby character | `E` |
| Open / close command menu | `Tab` |
| Choose an option | `1` – `7` (or click) |
| Close a menu / dialogue | `Esc` |

On touch devices an on-screen pad appears automatically.

## The world

Five horizontal sectors, each with its own pixel scenery and inhabitants:

1. **Grand Palace** — generals, ministers and a foreign diplomat.
2. **City Streets** — ordinary citizens, propaganda billboards, neon skyline.
3. **Military Base** — generals, soldiers, tanks, a sweeping radar.
4. **Prison Complex** — prisoners who beg for mercy, searchlights, barbed wire.
5. **Nuclear Bunker** — scientists, control panels, and a live missile silo.

## Characters

Generals, ministers, citizens, prisoners, foreign diplomats and scientists
wander on their own. Press **E** near one to talk. Some flatter you, some
secretly plot, some beg. Each conversation lets you **reward**, **threaten**, or
act on them — and that changes their mood (shown as a small glyph) and your
nation's stats.

## Supreme Command (Tab)

Every decree visibly changes the world:

- **Arrest Nearby** — the nearest character is seized and vanishes in a puff.
- **Fire a Minister** — purge the nearest minister.
- **Raise / Lower Taxes** — citizens turn angry or loyal.
- **Propaganda Blitz** — confetti, cheering crowds, soaring loyalty.
- **Declare War** — a column of soldiers marches across the screen.
- **Launch Nukes** — screen shake, a white flash, and mushroom clouds on the
  horizon.

## Random events

Roughly every 15–30 seconds something interrupts you: a protest erupts, a rival
power sends a threatening cable, a general demands an audience, a plot is
uncovered, the grid fails. Your choices ripple through the stats. Become both
unloved and unfeared and the generals will move against you.

## Project structure

```
supreme-leader/
├── index.html        # markup + HUD / menu / dialogue / modal overlays
├── style.css         # dark "Pixel Art" design system (Press Start 2P / VT323)
└── js/
    ├── input.js      # keyboard + on-screen touch input
    ├── world.js      # zones, parallax backgrounds, all scenery drawing
    ├── player.js     # the dictator: physics + sprite
    ├── dialogue.js   # what each character type/mood says + talk UI
    ├── npcs.js       # NPC AI, typed sprites, portraits, spawner
    ├── commands.js   # the Supreme Command decrees
    ├── events.js     # random interrupting events + coup state
    └── main.js       # game loop, camera, HUD, particles/effects, input routing
```

Scripts are loaded as plain `<script>` tags (in dependency order), so the game
runs straight from the filesystem with no server or bundler.
