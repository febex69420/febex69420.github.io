// sim/world.js — procedural world generation.
// Builds terrain functions, carves the map into nations and provinces, founds
// settlements with individually placed buildings, lays roads, plants forests.
// Everything derives from G.seed so identical seeds produce identical worlds.

import { makeRNG, makeNoise2D, fbm, hashStr, clamp, smoothstep, dist2 } from '../core/rng.js';
import { personName, cityName, nationName, leaderTitle, FLAG_PALETTES } from '../core/names.js';
import { G, CFG } from '../core/state.js';

export const NATION_COLORS = [0x4d8bd6, 0xc75450, 0x5aa860, 0xb08c3e, 0x9268b8, 0x50a8a0];

const GOVS = ['democracy', 'autocracy', 'monarchy', 'junta'];

// ---------------------------------------------------------------- terrain --

/** Build the pure height/moisture samplers from the seed (also used on load). */
export function buildTerrainFns(seed) {
  const h1 = makeNoise2D(hashStr(seed + ':h1'));
  const h2 = makeNoise2D(hashStr(seed + ':h2'));
  const h3 = makeNoise2D(hashStr(seed + ':h3'));
  const mN = makeNoise2D(hashStr(seed + ':m'));
  const fN = makeNoise2D(hashStr(seed + ':f'));
  const M = CFG.MAP;

  const heightAt = (x, z) => {
    const nx = x / M, nz = z / M;                       // -0.5 .. 0.5
    const edge = Math.max(Math.abs(nx), Math.abs(nz)) * 2;
    const base = fbm(h1, nx * 2.3 + 17, nz * 2.3 + 31, 4) * 0.5 + 0.5;
    const det = fbm(h2, nx * 9 + 5, nz * 9 + 5, 4) * 0.5 + 0.5;
    const ridge = 1 - Math.abs(fbm(h3, nx * 3.1 + 43, nz * 3.1 + 7, 3));
    let land = base * 0.6 + det * 0.4;
    land -= smoothstep(0.6, 1.02, edge) * 0.9;          // ocean ring at map edge
    const mount = smoothstep(0.62, 0.85, ridge) * smoothstep(0.42, 0.62, base);
    let h = (land - 0.34) * 130 + mount * mount * CFG.MAX_H;
    if (h < 0) h *= 0.55;                               // gentler sea floor
    return h;
  };
  const moistureAt = (x, z) => fbm(mN, x / M * 4 + 9, z / M * 4 + 2, 3) * 0.5 + 0.5;
  const forestAt = (x, z) => fbm(fN, x / M * 5 + 3, z / M * 5 + 77, 3) * 0.5 + 0.5;
  return { heightAt, moistureAt, forestAt };
}

export const heightAt = (x, z) => G.world._h(x, z);
export const isWater = (x, z) => G.world._h(x, z) < CFG.WATER_Y + 0.4;
export function slopeAt(x, z) {
  const h = G.world._h, e = 4;
  return Math.max(Math.abs(h(x + e, z) - h(x - e, z)), Math.abs(h(x, z + e) - h(x, z - e))) / (2 * e);
}

// -------------------------------------------------------------- provinces --

export function provinceAt(x, z) {
  const n = CFG.PROV_N, cs = CFG.MAP / n;
  const ix = clamp(Math.floor((x + CFG.MAP / 2) / cs), 0, n - 1);
  const iz = clamp(Math.floor((z + CFG.MAP / 2) / cs), 0, n - 1);
  const pid = G.world.provGrid[iz * n + ix];
  return pid >= 0 ? G.world.provinces[pid] : null;
}

export function nationAt(x, z) {
  const p = provinceAt(x, z);
  return p ? p.owner : -1;
}

export function nationProvinces(nid) {
  return G.world.provinces.filter((p) => p.owner === nid);
}

// ------------------------------------------------------------- generation --

/**
 * Generate the whole world into G.world.
 * @param {string} seed
 * @param {{nationName:string, gov:string, ruler:string}} opts player setup
 * @param {function(string,number):void} [progress] loading callback
 */
export function generateWorld(seed, opts, progress = () => {}) {
  const rng = makeRNG(seed + ':world');
  const fns = buildTerrainFns(seed);
  const M = CFG.MAP, H = fns.heightAt;

  const world = {
    nations: [], provinces: [], provGrid: null, settlements: [],
    buildings: [], roads: [], trees: [], pois: [],
    _h: fns.heightAt, _moist: fns.moistureAt, _forest: fns.forestAt,
  };
  G.world = world;

  // --- nations & capital sites -------------------------------------------
  progress('Raising continents…', 0.05);
  const NN = 5;
  const sites = pickCapitalSites(rng, H, NN);
  // player gets the site closest to map center
  sites.sort((a, b) => dist2(a.x, a.z, 0, 0) - dist2(b.x, b.z, 0, 0));

  const usedNames = new Set([opts.nationName]);
  const palettes = rng.shuffle(FLAG_PALETTES.slice());
  for (let i = 0; i < NN; i++) {
    let name = opts.nationName;
    if (i > 0) {
      do { name = nationName(rng); } while (usedNames.has(name));
    }
    usedNames.add(name);
    const gov = i === 0 ? opts.gov : rng.pick(GOVS);
    const sex = rng.chance(0.3) ? 'f' : 'm';
    world.nations.push({
      id: i, name, color: NATION_COLORS[i], flag: palettes[i % palettes.length],
      gov, capital: -1,
      leader: i === 0 ? { name: opts.ruler, sex: 'm' } : {
        name: personName(rng, sex), sex,
        aggression: rng.range(0.1, 0.95), paranoia: rng.range(0.1, 0.9),
        greed: rng.range(0.2, 0.9), honor: rng.range(0.1, 0.9),
      },
      title: leaderTitle(gov),
      relations: {}, alliances: [], pacts: [], sanctions: [], atWar: [],
      treasury: rng.range(4e8, 1.4e9), gdp: rng.range(6e9, 2e10),
      mil: rng.range(60, 180), warExhaustion: 0, espionageDefense: rng.range(0.3, 0.7),
    });
  }
  for (let i = 0; i < NN; i++) for (let j = 0; j < NN; j++) {
    if (i !== j) world.nations[i].relations[j] = Math.round(rng.range(-25, 35));
  }

  // --- provinces (grid cells owned by nearest capital, noise-warped) ------
  progress('Drawing borders…', 0.15);
  const n = CFG.PROV_N, cs = M / n;
  const warp = makeNoise2D(hashStr(seed + ':warp'));
  world.provGrid = new Int16Array(n * n).fill(-1);
  for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) {
    const x = -M / 2 + (ix + 0.5) * cs, z = -M / 2 + (iz + 0.5) * cs;
    // land test: majority of samples above water
    let landHits = 0, hSum = 0, sMax = 0;
    for (let s = 0; s < 5; s++) {
      const sx = x + (s % 2 ? cs / 4 : -cs / 4) * (s > 2 ? -1 : 1), sz = z + (s < 2 ? cs / 4 : -cs / 4);
      const hh = H(sx, sz);
      hSum += hh;
      if (hh > CFG.WATER_Y + 0.5) landHits++;
      sMax = Math.max(sMax, Math.abs(H(sx + 5, sz) - hh) / 5);
    }
    if (landHits < 3) continue;
    const wx = x + warp(x / 260, z / 260) * 150, wz = z + warp(z / 260 + 50, x / 260) * 150;
    let best = 0, bd = Infinity;
    for (let k = 0; k < NN; k++) {
      const d = dist2(wx, wz, sites[k].x, sites[k].z);
      if (d < bd) { bd = d; best = k; }
    }
    const hAvg = hSum / 5;
    const terrain = hAvg > 55 || sMax > 0.9 ? 'mountain' :
      fns.forestAt(x, z) > 0.62 ? 'forest' : hAvg > 28 ? 'hill' : 'plain';
    const p = {
      id: world.provinces.length, ix, iz, x, z, owner: best, origOwner: best,
      terrain, dev: rng.range(0.2, 0.6), unrest: 0, name: cityName(rng) + ' Province',
      coastal: false,
    };
    world.provGrid[iz * n + ix] = p.id;
    world.provinces.push(p);
  }
  // coastal flags
  for (const p of world.provinces) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const jx = p.ix + dx, jz = p.iz + dz;
      if (jx < 0 || jz < 0 || jx >= n || jz >= n || world.provGrid[jz * n + jx] < 0) { p.coastal = true; break; }
    }
  }

  // --- settlements ---------------------------------------------------------
  progress('Founding cities…', 0.3);
  for (let i = 0; i < NN; i++) {
    foundNationSettlements(world, rng, fns, i, sites[i], i === 0);
  }

  // --- roads ----------------------------------------------------------------
  progress('Paving roads…', 0.55);
  buildRoads(world, rng, H);

  // --- forests ----------------------------------------------------------------
  progress('Planting forests…', 0.7);
  plantTrees(world, rng, fns);

  // --- points of interest for cinematic camera ------------------------------
  for (const s of world.settlements) {
    if (s.type === 'capital' || s.type === 'city') world.pois.push({ x: s.x, z: s.z, label: s.name });
  }

  progress('Populating the realm…', 0.8);
  return world;
}

function pickCapitalSites(rng, H, count) {
  const M = CFG.MAP;
  let best = null, bestScore = -1;
  for (let attempt = 0; attempt < 60; attempt++) {
    const pts = [];
    let guard = 0;
    while (pts.length < count && guard++ < 4000) {
      const x = rng.range(-M * 0.4, M * 0.4), z = rng.range(-M * 0.4, M * 0.4);
      const h = H(x, z);
      if (h < 3 || h > 45) continue;
      if (pts.some((p) => dist2(p.x, p.z, x, z) < (M * 0.26) ** 2)) continue;
      pts.push({ x, z });
    }
    if (pts.length === count) return pts;
    if (pts.length > bestScore) { bestScore = pts.length; best = pts; }
  }
  // relax spacing if the map is stingy
  const pts = best || [];
  let guard = 0;
  while (pts.length < count && guard++ < 20000) {
    const x = rng.range(-M * 0.42, M * 0.42), z = rng.range(-M * 0.42, M * 0.42);
    if (H(x, z) < 2) continue;
    if (pts.some((p) => dist2(p.x, p.z, x, z) < (M * 0.16) ** 2)) continue;
    pts.push({ x, z });
  }
  return pts;
}

// ------------------------------------------------------------ settlements --

function findSiteNear(world, rng, fns, nid, cx, cz, rMin, rMax, tries = 300) {
  for (let t = 0; t < tries; t++) {
    const a = rng.range(0, Math.PI * 2), r = rng.range(rMin, rMax);
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    if (Math.abs(x) > CFG.MAP * 0.47 || Math.abs(z) > CFG.MAP * 0.47) continue;
    const h = fns.heightAt(x, z);
    if (h < 2.5 || h > 42) continue;
    if (slopeSample(fns, x, z) > 0.45) continue;
    if (nationAt(x, z) !== nid) continue;
    if (world.settlements.some((s) => dist2(s.x, s.z, x, z) < 190 ** 2)) continue;
    return { x, z };
  }
  return null;
}

function slopeSample(fns, x, z) {
  const h = fns.heightAt, e = 6;
  return Math.max(Math.abs(h(x + e, z) - h(x - e, z)), Math.abs(h(x, z + e) - h(x, z - e))) / (2 * e);
}

function foundNationSettlements(world, rng, fns, nid, capSite, isPlayer) {
  const nation = world.nations[nid];
  const cap = addSettlement(world, rng, nid, 'capital', capSite.x, capSite.z, isPlayer);
  nation.capital = cap.id;

  const plan = isPlayer
    ? [['city', 2], ['town', 2], ['village', 3]]
    : [['city', 1], ['town', 1], ['village', 2]];
  for (const [type, count] of plan) {
    for (let i = 0; i < count; i++) {
      const site = findSiteNear(world, rng, fns, nid, capSite.x, capSite.z, 220, 620);
      if (site) addSettlement(world, rng, nid, type, site.x, site.z, isPlayer);
    }
  }
  // military base + airport near the capital
  const baseSite = findSiteNear(world, rng, fns, nid, capSite.x, capSite.z, 150, 320, 400);
  if (baseSite) addSettlement(world, rng, nid, 'base', baseSite.x, baseSite.z, isPlayer);
  const airSite = findSiteNear(world, rng, fns, nid, capSite.x, capSite.z, 160, 380, 400);
  if (airSite) addSettlement(world, rng, nid, 'airport', airSite.x, airSite.z, isPlayer);
  // harbor on the coast if the nation owns coastal land
  const coastal = world.provinces.filter((p) => p.owner === nid && p.coastal);
  if (coastal.length) {
    for (let t = 0; t < 250; t++) {
      const p = rng.pick(coastal);
      const x = p.x + rng.range(-45, 45), z = p.z + rng.range(-45, 45);
      const h = fns.heightAt(x, z);
      if (h > 1 && h < 8 && nearWater(fns, x, z)) {
        addSettlement(world, rng, nid, 'harbor', x, z, isPlayer);
        break;
      }
    }
  }
}

function nearWater(fns, x, z) {
  for (const [dx, dz] of [[40, 0], [-40, 0], [0, 40], [0, -40], [60, 60], [-60, -60]]) {
    if (fns.heightAt(x + dx, z + dz) < CFG.WATER_Y) return true;
  }
  return false;
}

/** Building record helper. */
function B(world, type, x, z, rot, nid, sid) {
  const b = { id: world.buildings.length, type, x, z, rot, nation: nid, settlement: sid, hp: 100 };
  world.buildings.push(b);
  return b;
}

function addSettlement(world, rng, nid, type, x, z, isPlayer) {
  const s = {
    id: world.settlements.length, nation: nid, type,
    name: type === 'base' ? 'Fort ' + cityName(rng, true) :
      type === 'airport' ? cityName(rng) + ' Airfield' :
      type === 'harbor' ? 'Port ' + cityName(rng, true) :
      cityName(rng, type === 'village'),
    x, z, radius: 0, houses: [], works: [], unrest: 0, prosperity: rng.range(0.35, 0.65),
    pop: 0, mil: type === 'base' || type === 'airport',
  };
  world.settlements.push(s);
  const layouts = {
    capital: { rings: 4, houses: 26, apts: 6, civic: ['palace', 'hall', 'school', 'hospital', 'university', 'church', 'market', 'police', 'lab', 'monument', 'park'], factories: 3, farms: 2 },
    city: { rings: 3, houses: 20, apts: 3, civic: ['hall', 'school', 'hospital', 'market', 'church', 'park'], factories: 2, farms: 2 },
    town: { rings: 2, houses: 13, apts: 1, civic: ['hall', 'school', 'market'], factories: 1, farms: 2 },
    village: { rings: 2, houses: 8, apts: 0, civic: ['church'], factories: 0, farms: 3 },
    base: null, airport: null, harbor: null,
  };

  if (type === 'base') { layoutBase(world, rng, s); return s; }
  if (type === 'airport') { layoutAirport(world, rng, s); return s; }
  if (type === 'harbor') { layoutHarbor(world, rng, s); return s; }

  const L = layouts[type];
  s.radius = 30 + L.rings * 22;
  // civic buildings around the central plaza
  B(world, 'plaza', x, z, 0, nid, s.id);
  let ci = 0;
  for (const civ of L.civic) {
    const a = (ci / L.civic.length) * Math.PI * 2 + rng.range(-0.1, 0.1);
    const r = civ === 'monument' ? 0.1 : 34 + rng.range(-4, 6);
    const bx = x + Math.cos(a) * r, bz = z + Math.sin(a) * r;
    const b = B(world, civ, bx, bz, a + Math.PI, nid, s.id);
    s.works.push(b.id);
    ci++;
  }
  // housing in rings, with jitter, skipping water/steep spots
  const total = L.houses + L.apts;
  let placed = 0, tries = 0;
  while (placed < total && tries++ < total * 12) {
    const ring = 1 + Math.floor(placed / Math.max(6, total / L.rings));
    const a = rng.range(0, Math.PI * 2);
    const r = 46 + ring * 24 + rng.range(-9, 9);
    const bx = x + Math.cos(a) * r, bz = z + Math.sin(a) * r;
    const h = world._h(bx, bz);
    if (h < 1.5 || slopeSample({ heightAt: world._h }, bx, bz) > 0.5) continue;
    if (world.buildings.some((o) => o.settlement === s.id && dist2(o.x, o.z, bx, bz) < 15 ** 2)) continue;
    const isApt = placed >= L.houses;
    const b = B(world, isApt ? 'apartment' : 'house', bx, bz, Math.atan2(x - bx, z - bz), nid, s.id);
    s.houses.push(b.id);
    placed++;
  }
  // industry on the outskirts
  for (let i = 0; i < L.factories; i++) {
    const a = rng.range(0, Math.PI * 2), r = s.radius + rng.range(14, 40);
    const bx = x + Math.cos(a) * r, bz = z + Math.sin(a) * r;
    if (world._h(bx, bz) < 1.5) continue;
    const f = B(world, 'factory', bx, bz, rng.range(0, Math.PI * 2), nid, s.id);
    s.works.push(f.id);
    B(world, 'warehouse', bx + rng.range(-22, 22), bz + rng.range(-22, 22), 0, nid, s.id);
  }
  // farms further out
  for (let i = 0; i < L.farms; i++) {
    const a = rng.range(0, Math.PI * 2), r = s.radius + rng.range(50, 110);
    const bx = x + Math.cos(a) * r, bz = z + Math.sin(a) * r;
    if (world._h(bx, bz) < 1.5 || slopeSample({ heightAt: world._h }, bx, bz) > 0.35) continue;
    const f = B(world, 'farm', bx, bz, rng.range(0, Math.PI * 2), nid, s.id);
    s.works.push(f.id);
    for (let k = 0; k < 3; k++) {
      B(world, 'field', bx + rng.range(-40, 40), bz + rng.range(-40, 40), rng.range(0, Math.PI), nid, s.id);
    }
  }
  const popByType = { capital: 60000, city: 26000, town: 9000, village: 2600 };
  s.pop = Math.round(popByType[type] * rng.range(0.75, 1.3));
  return s;
}

function layoutBase(world, rng, s) {
  const { x, z, nation: nid } = s;
  s.radius = 70;
  B(world, 'parade', x, z, 0, nid, s.id);
  for (let i = 0; i < 4; i++) {
    const b = B(world, 'barracks', x - 46 + i * 26, z - 42, 0, nid, s.id);
    s.works.push(b.id);
  }
  B(world, 'bunker', x - 55, z + 30, 0.4, nid, s.id);
  B(world, 'bunker', x + 55, z + 30, -0.4, nid, s.id);
  B(world, 'tower', x + 60, z - 50, 0, nid, s.id);
  B(world, 'depot', x - 20, z + 48, 0, nid, s.id);
  B(world, 'depot', x + 14, z + 48, 0, nid, s.id);
}

function layoutAirport(world, rng, s) {
  const { x, z, nation: nid } = s;
  s.radius = 110;
  const rot = rng.range(0, Math.PI);
  B(world, 'runway', x, z, rot, nid, s.id);
  B(world, 'tower', x + Math.cos(rot + 1.57) * 42, z + Math.sin(rot + 1.57) * 42, rot, nid, s.id);
  const hb = B(world, 'hangar', x + Math.cos(rot + 1.57) * 66, z + Math.sin(rot + 1.57) * 66, rot, nid, s.id);
  s.works.push(hb.id);
  B(world, 'hangar', x + Math.cos(rot + 1.57) * 66 + Math.cos(rot) * 30, z + Math.sin(rot + 1.57) * 66 + Math.sin(rot) * 30, rot, nid, s.id);
}

function layoutHarbor(world, rng, s) {
  const { x, z, nation: nid } = s;
  s.radius = 60;
  // dock reaches toward the nearest water
  let wa = 0, found = false;
  for (let a = 0; a < Math.PI * 2; a += 0.3) {
    if (world._h(x + Math.cos(a) * 55, z + Math.sin(a) * 55) < CFG.WATER_Y) { wa = a; found = true; break; }
  }
  if (!found) wa = rng.range(0, Math.PI * 2);
  const d = B(world, 'dock', x + Math.cos(wa) * 40, z + Math.sin(wa) * 40, wa, nid, s.id);
  s.works.push(d.id);
  B(world, 'crane', x + Math.cos(wa) * 30, z + Math.sin(wa) * 30 + 8, wa, nid, s.id);
  B(world, 'warehouse', x - Math.cos(wa) * 18, z - Math.sin(wa) * 18, wa, nid, s.id);
  B(world, 'warehouse', x - Math.cos(wa) * 18 + 20, z - Math.sin(wa) * 18, wa, nid, s.id);
  s.pop = Math.round(1500 * rng.range(0.8, 1.4));
}

// ------------------------------------------------------------------ roads --

function buildRoads(world, rng, H) {
  // spanning connections: each settlement links to its nearest already-linked one
  const nodes = world.settlements.filter((s) => s.type !== 'airport');
  if (!nodes.length) return;
  const linked = [nodes[0]];
  const rest = nodes.slice(1);
  while (rest.length) {
    let bi = 0, bj = 0, bd = Infinity;
    for (let i = 0; i < rest.length; i++) for (let j = 0; j < linked.length; j++) {
      const d = dist2(rest[i].x, rest[i].z, linked[j].x, linked[j].z);
      if (d < bd) { bd = d; bi = i; bj = j; }
    }
    addRoad(world, rng, H, rest[bi], linked[bj]);
    linked.push(rest.splice(bi, 1)[0]);
  }
  // airports get a spur from their capital's road web
  for (const a of world.settlements.filter((s) => s.type === 'airport')) {
    let best = null, bd = Infinity;
    for (const s of nodes) {
      const d = dist2(a.x, a.z, s.x, s.z);
      if (d < bd) { bd = d; best = s; }
    }
    if (best) addRoad(world, rng, H, a, best);
  }
}

function addRoad(world, rng, H, a, b) {
  const d = Math.sqrt(dist2(a.x, a.z, b.x, b.z));
  const segs = Math.max(6, Math.round(d / 30));
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    let x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
    // gentle organic wobble, pinned at endpoints
    const w = Math.sin(t * Math.PI) * rng.range(-1, 1) * d * 0.04;
    const px = -(b.z - a.z) / d, pz = (b.x - a.x) / d;
    x += px * w; z += pz * w;
    const h = H(x, z);
    pts.push([x, z, h < CFG.WATER_Y + 0.5]); // third component marks bridge spans
  }
  world.roads.push({ pts, a: a.id, b: b.id });
}

// ----------------------------------------------------------------- forests --

function plantTrees(world, rng, fns) {
  const M = CFG.MAP;
  const target = 3400;
  let guard = 0;
  while (world.trees.length < target && guard++ < target * 6) {
    const x = rng.range(-M / 2, M / 2), z = rng.range(-M / 2, M / 2);
    const h = fns.heightAt(x, z);
    if (h < 1.5 || h > 95) continue;
    const f = fns.forestAt(x, z);
    if (f < 0.56 && !(f > 0.42 && rng.chance(0.12))) continue;
    if (slopeSample(fns, x, z) > 0.9) continue;
    if (world.settlements.some((s) => dist2(s.x, s.z, x, z) < (s.radius + 40) ** 2)) continue;
    const pine = h > 40 || fns.moistureAt(x, z) < 0.4;
    world.trees.push({ x, z, t: pine ? 0 : 1, s: rng.range(0.7, 1.4) });
  }
}
