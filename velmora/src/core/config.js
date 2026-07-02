// Central tuning + world layout. Everything that defines "the country" lives here
// so new districts/systems can be added without touching generator internals.
export const CONFIG = {
  seed: 6941,
  nation: {
    name: 'Grand Republic of Velmora',
    ruler: 'Supreme Marshal',
    capital: 'Aurelgrad',
    currency: 'veld',
    founded: 'Year 41 of the New Order',
    rivals: ['Ostrava Pact', 'Kingdom of Tessary', 'Republic of Danreth'],
  },

  world: {
    half: 3000,            // world spans [-half, +half] on X/Z
    seaLevel: 0,
    terrainSegments: 220,
  },

  // Flattened settlement sites. h = plateau height.
  sites: {
    palace:  { x: 0,     z: 0,    r: 360, h: 36, name: 'Palace District' },
    city:    { x: 600,   z: 1800, r: 480, h: 8,  name: 'Aurelgrad' },
    village: { x: 1800,  z: 600,  r: 230, h: 14, name: 'Brenka Village' },
    base:    { x: -1800, z: 900,  r: 360, h: 22, name: 'Fort Karst' },
    airport: { x: -1150, z: 2450, r: 0,   h: 6,  name: 'Marshal Aurel Airfield',
               runway: { x0: -1600, z0: 2450, x1: -700, z1: 2450, halfW: 150 } },
  },

  regions: [
    { name: 'Palace District',      x: 0,     z: 0,    r: 420 },
    { name: 'Aurelgrad',            x: 600,   z: 1800, r: 520 },
    { name: 'Brenka Village',       x: 1800,  z: 600,  r: 280 },
    { name: 'Fort Karst',           x: -1800, z: 900,  r: 400 },
    { name: 'Marshal Aurel Airfield', x: -1150, z: 2450, r: 480 },
    { name: 'Northreach Mountains', x: 0,     z: -2300, r: 900 },
    { name: 'Verdan Forest',        x: -700,  z: -900, r: 700 },
    { name: 'Coastal Strand',       x: 300,   z: 2750, r: 600 },
  ],

  population: {
    palaceGuards: 58,
    servants: 34,
    advisors: 12,
    generals: 8,
    officials: 14,
    cityCitizens: 72,
    villageCitizens: 16,
    baseSoldiers: 42,
    trafficCars: 26,
  },

  player: {
    eyeHeight: 1.68,
    radius: 0.38,
    walkSpeed: 4.4,
    runSpeed: 8.2,
    crouchSpeed: 2.2,
    jumpSpeed: 6.4,
    gravity: 18,
    maxHealth: 100,
    maxStamina: 100,
    stepHeight: 0.55,
  },

  escort: { size: 8, engageRange: 80, teleportDistance: 130 },

  time: {
    dayLengthMinutes: 20,  // real minutes per in-game 24h
    startHour: 9.5,
  },

  graphics: {
    // quality presets, switchable in pause menu
    presets: {
      low:  { shadow: 1024, shadowDist: 70,  pixelRatio: 1,   viewDist: 1800, npcDist: 140 },
      med:  { shadow: 2048, shadowDist: 110, pixelRatio: 1.5, viewDist: 2600, npcDist: 220 },
      high: { shadow: 4096, shadowDist: 150, pixelRatio: 2,   viewDist: 3600, npcDist: 300 },
    },
    default: 'med',
  },
};
