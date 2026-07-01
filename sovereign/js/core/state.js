// core/state.js — the single mutable game state `G` plus world constants.
// `G` holds only plain serializable data (plus a few rebuilt-on-load caches
// marked _underscore). Every sim module reads and mutates G; graphics reads it.

export const CFG = {
  MAP: 2400,            // world is MAP × MAP units, centered on origin
  WATER_Y: 0,           // sea level
  MAX_H: 150,           // rough mountain peak height
  PROV_N: 22,           // province grid is PROV_N × PROV_N over the map
  DAY_SECONDS: [0, 20, 8, 2.5],   // real seconds per game-day at speed 1/2/3 (index 0 = paused)
  SEASON_DAYS: 30,      // days per season (120-day year keeps eras moving)
  CITIZENS_PLAYER: 640, // fully simulated citizens in the player nation
  CITIZENS_AI: 110,     // fully simulated citizens per AI nation
  POP_SCALE: 3200,      // each simulated citizen represents this many people
  START_YEAR: 1987,
};

export const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
export const MONTHS = ['Thawmoon', 'Seedmoon', 'Sunmoon', 'Harvestmoon', 'Mistmoon', 'Frostmoon',
  'Icemoon', 'Windmoon', 'Rainmoon', 'Bloommoon', 'Heatmoon', 'Fallmoon'];

/** The game state. Reset by newGame() / load(). */
export const G = {
  ready: false,
  seed: '',
  time: {
    day: 0,          // absolute day counter since game start
    hour: 8,         // 0..24 float, drives sun & routines
    speed: 1,        // 0 paused, 1..3
    year: CFG.START_YEAR,
    dayOfYear: 0,
  },
  player: {
    nation: 0,
    ruler: 'The Sovereign',
    title: 'President',
    gov: 'democracy',  // democracy | autocracy | monarchy | junta
  },
  world: null,        // filled by world.generateWorld — see that file for shape
  citizens: [],       // every simulated person, all nations
  economy: null,      // filled by economy.initEconomy
  laws: {},           // law id → value
  military: null,     // filled by military.initMilitary
  intel: null,        // filled by nations.initIntel
  politics: null,     // filled by politics.initPolitics
  eventsState: null,  // filled by events.initEvents
  built: [],          // player-constructed buildings (persisted, re-instanced on load)
  log: [],            // chronicle of everything notable, newest first
  gameOver: null,     // {reason, text} once the run ends
};

/** Append to the chronicle (kept to 400 entries). */
export function chronicle(text, kind = 'info') {
  G.log.unshift({ day: G.time.day, text, kind });
  if (G.log.length > 400) G.log.length = 400;
}

/** Pretty in-game date, e.g. "14 Sunmoon 1987". */
export function dateStr() {
  const doy = G.time.dayOfYear;
  const m = Math.min(11, Math.floor(doy / 10));
  return `${(doy % 10) + 1} ${MONTHS[m]} ${G.time.year}`;
}

export function seasonIndex() {
  return Math.floor(G.time.dayOfYear / CFG.SEASON_DAYS) % 4;
}

export const fmtMoney = (n) => {
  const abs = Math.abs(n);
  const s = abs >= 1e12 ? (n / 1e12).toFixed(2) + 'T' :
    abs >= 1e9 ? (n / 1e9).toFixed(2) + 'B' :
    abs >= 1e6 ? (n / 1e6).toFixed(1) + 'M' :
    abs >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : Math.round(n).toString();
  return '₴' + s;
};
export const fmtNum = (n) => {
  const abs = Math.abs(n);
  return abs >= 1e9 ? (n / 1e9).toFixed(2) + 'B' :
    abs >= 1e6 ? (n / 1e6).toFixed(2) + 'M' :
    abs >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : Math.round(n).toString();
};
export const fmtPct = (n) => (n >= 0 ? '+' : '') + (n * 100).toFixed(1) + '%';
