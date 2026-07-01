// sim/military.js — armies, wars and front lines.
// Divisions are discrete units that physically move across the map, fight
// when hostile forces meet, bleed without supply, and capture provinces.
// Both the player and AI nations (and rebels) command units through this module.

import { clamp, dist2 } from '../core/rng.js';
import { G, CFG, chronicle } from '../core/state.js';
import { notify, emit } from '../core/bus.js';
import { lawMods } from './laws.js';
import { population } from './citizens.js';
import { heightAt, provinceAt, nationProvinces } from './world.js';

export const REBEL = -2;

export const UNIT_TYPES = {
  infantry: { name: 'Infantry Division', icon: '🪖', cost: 12e6, upkeep: 4e5, str: 100, atk: 1.0, def: 1.3, speed: 26, manpower: 10, domain: 'land', tech: 'infantry', minLevel: 0 },
  armor: { name: 'Armored Division', icon: '🛡️', cost: 32e6, upkeep: 1.1e6, str: 100, atk: 2.3, def: 1.7, speed: 42, manpower: 6, domain: 'land', tech: 'armor', minLevel: 1 },
  artillery: { name: 'Artillery Brigade', icon: '💥', cost: 20e6, upkeep: 7e5, str: 100, atk: 1.9, def: 0.6, speed: 20, manpower: 5, domain: 'land', tech: 'infantry', minLevel: 1 },
  air: { name: 'Air Wing', icon: '✈️', cost: 48e6, upkeep: 1.7e6, str: 100, atk: 2.6, def: 1.1, speed: 220, manpower: 3, domain: 'air', tech: 'air', minLevel: 1 },
  navy: { name: 'Naval Squadron', icon: '⚓', cost: 62e6, upkeep: 1.9e6, str: 100, atk: 2.4, def: 2.1, speed: 55, manpower: 4, domain: 'sea', tech: 'navy', minLevel: 1 },
};

export const TECH_TREE = {
  infantry: { name: 'Small Arms & Doctrine', icon: '🔫', base: 90, desc: 'Better rifles, training and artillery. Unlocks Artillery at level 1.' },
  armor: { name: 'Armored Warfare', icon: '🚜', base: 120, desc: 'Tank design and mechanization. Unlocks Armored Divisions at level 1.' },
  air: { name: 'Aviation', icon: '🛩️', base: 140, desc: 'Combat aircraft. Unlocks Air Wings at level 1 (requires an airbase).' },
  navy: { name: 'Naval Engineering', icon: '🚢', base: 140, desc: 'Warships. Unlocks Naval Squadrons at level 1 (requires a harbor).' },
  logistics: { name: 'Logistics', icon: '🚚', base: 100, desc: 'Extends supply range and reduces attrition.' },
  doctrine: { name: 'Command Doctrine', icon: '🎖️', base: 110, desc: 'Improves morale recovery and combat coordination.' },
  industry: { name: 'Industrial Methods', icon: '🏭', base: 130, desc: 'Civilian spin-offs boost economic growth.' },
  agritech: { name: 'Agro-Science', icon: '🌾', base: 100, desc: 'Higher farm yields and food security.' },
};

export function initMilitary() {
  G.military = {
    units: [], nextId: 1,
    techs: { infantry: 1, armor: 0, air: 0, navy: 0, logistics: 0, doctrine: 0, industry: 0, agritech: 0 },
    research: { current: null, progress: 0, points: (G.economy?.budget.science || 1.8e7) / 2.2e6 },
    manpower: 60, upkeep: 0, wars: [], capitulated: [],
  };
  // starting garrisons for everyone
  for (const n of G.world.nations) {
    const cap = G.world.settlements[n.capital];
    if (!cap) continue;
    const count = n.id === G.player.nation ? 3 : 2 + Math.floor(n.mil / 80);
    for (let i = 0; i < count; i++) {
      spawnUnit(n.id, i === 1 && n.id !== G.player.nation ? 'armor' : 'infantry', cap.x + (i - 1) * 30, cap.z + 55);
    }
    // AI techs scale with their abstract strength
    if (n.id !== G.player.nation) {
      n.techs = { infantry: 1 + Math.round(n.mil / 90), armor: Math.round(n.mil / 100), air: Math.round(n.mil / 130), navy: 0, logistics: 1, doctrine: 1 };
    }
  }
  for (const u of G.military.units) if (u.nation === G.player.nation) G.military.upkeep += UNIT_TYPES[u.type].upkeep;
}

export function spawnUnit(nation, type, x, z, rebelOf = -1) {
  const t = UNIT_TYPES[type];
  const u = {
    id: G.military.nextId++, nation, type, name: `${ordinal(G.military.nextId)} ${t.name}`,
    str: t.str, morale: 80, supply: 1, xp: 0, x, z, tx: x, tz: z,
    order: 'hold', rebelOf, captureH: 0,
  };
  G.military.units.push(u);
  return u;
}
const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : Math.min(n % 10, 4) % 4] || 'th');

// ------------------------------------------------------------- recruiting --

export function canRecruit(type) {
  const t = UNIT_TYPES[type];
  const m = G.military;
  if (m.techs[t.tech] < t.minLevel) return `Requires ${TECH_TREE[t.tech].name} level ${t.minLevel}`;
  if (type === 'air' && !G.world.buildings.some((b) => b.nation === G.player.nation && (b.type === 'hangar' || b.type === 'runway') && !b.underConstruction)) return 'Requires an airbase';
  if (type === 'navy' && !G.world.buildings.some((b) => b.nation === G.player.nation && b.type === 'dock' && !b.underConstruction)) return 'Requires a harbor';
  if (m.manpower < t.manpower) return 'Not enough manpower';
  if (G.economy.treasury < t.cost) return 'Not enough funds';
  return null;
}

export function recruit(type) {
  const err = canRecruit(type);
  if (err) { notify('Cannot recruit', err, 'bad'); return null; }
  const t = UNIT_TYPES[type];
  G.economy.treasury -= t.cost;
  G.military.manpower -= t.manpower;
  const spawnAt = pickSpawn(type);
  const u = spawnUnit(G.player.nation, type, spawnAt.x, spawnAt.z);
  chronicle(`${u.name} mustered at ${spawnAt.name}.`, 'info');
  emit('units:changed');
  return u;
}

function pickSpawn(type) {
  const mine = G.world.settlements.filter((s) => s.nation === G.player.nation);
  const pref = type === 'navy' ? 'harbor' : type === 'air' ? 'airport' : 'base';
  const site = mine.find((s) => s.type === pref) || mine.find((s) => s.type === 'capital') || mine[0];
  if (type === 'navy') {
    // ships spawn on water near the harbor
    for (let r = 40; r < 300; r += 20) for (let a = 0; a < 6.28; a += 0.5) {
      const x = site.x + Math.cos(a) * r, z = site.z + Math.sin(a) * r;
      if (heightAt(x, z) < CFG.WATER_Y - 2) return { x, z, name: site.name };
    }
  }
  return { x: site.x + 40, z: site.z + 40, name: site.name };
}

export function disband(unitId) {
  const i = G.military.units.findIndex((u) => u.id === unitId);
  if (i >= 0) {
    const u = G.military.units[i];
    if (u.nation === G.player.nation) G.military.manpower += UNIT_TYPES[u.type].manpower * 0.6;
    G.military.units.splice(i, 1);
    emit('units:changed');
  }
}

// ---------------------------------------------------------------- research --

export function setResearch(tech) {
  G.military.research.current = tech;
  G.military.research.progress = 0;
}

export function techCost(tech) {
  const lvl = G.military.techs[tech];
  return TECH_TREE[tech].base * Math.pow(1.9, lvl);
}

function monthlyResearch() {
  const m = G.military;
  const sciBuildings = G.world.buildings.filter((b) => b.nation === G.player.nation && (b.type === 'lab' || b.type === 'university') && !b.underConstruction).length;
  m.research.points = G.economy.budget.science / 2.2e6 * (1 + sciBuildings * 0.3);
  if (!m.research.current) return;
  m.research.progress += m.research.points;
  const cost = techCost(m.research.current);
  if (m.research.progress >= cost) {
    m.techs[m.research.current]++;
    const t = TECH_TREE[m.research.current];
    notify('Breakthrough!', `${t.name} reached level ${m.techs[m.research.current]}.`, 'good');
    chronicle(`Research complete: ${t.name} ${m.techs[m.research.current]}.`, 'good');
    m.research.progress = 0;
    m.research.current = null;
    emit('research:done');
  }
}

// ---------------------------------------------------------------- war state --

export function atWar(a, b) {
  return G.military.wars.some((w) => (w.a === a && w.b === b) || (w.a === b && w.b === a));
}

export function hostile(u1, u2) {
  if (u1.nation === u2.nation) return false;
  if (u1.nation === REBEL) return u1.rebelOf === u2.nation;
  if (u2.nation === REBEL) return u2.rebelOf === u1.nation;
  return atWar(u1.nation, u2.nation);
}

export function declareWar(a, b, reason = '') {
  if (a === b || atWar(a, b)) return;
  const A = G.world.nations[a], B = G.world.nations[b];
  G.military.wars.push({ a, b, score: 0, startDay: G.time.day, exhaustionA: 0, exhaustionB: 0 });
  A.atWar.push(b); B.atWar.push(a);
  A.relations[b] = -100; B.relations[a] = -100;
  // alliances drag friends in
  for (const ally of B.alliances.slice()) {
    if (ally !== a && !atWar(a, ally) && Math.random() < 0.8) declareWar(a, ally, `alliance with ${B.name}`);
  }
  chronicle(`WAR: ${A.name} declares war on ${B.name}${reason ? ` (${reason})` : ''}.`, 'war');
  notify('⚔️ WAR DECLARED', `${A.name} is at war with ${B.name}.`, 'war');
  emit('war', { a, b });
}

/** End a war. mode: 'white' | 'annex' (winner keeps captured provinces). */
export function makePeace(a, b, mode = 'white') {
  const wi = G.military.wars.findIndex((w) => (w.a === a && w.b === b) || (w.a === b && w.b === a));
  if (wi < 0) return;
  G.military.wars.splice(wi, 1);
  const A = G.world.nations[a], B = G.world.nations[b];
  A.atWar = A.atWar.filter((x) => x !== b); B.atWar = B.atWar.filter((x) => x !== a);
  A.relations[b] = -35; B.relations[a] = -35;
  if (mode === 'white') {
    // captured provinces go home
    for (const p of G.world.provinces) {
      if ((p.owner === a && p.origOwner === b) || (p.owner === b && p.origOwner === a)) {
        flipProvince(p, p.origOwner);
      }
    }
  } else {
    for (const p of G.world.provinces) if (p.owner !== p.origOwner) p.origOwner = p.owner;
  }
  chronicle(`Peace between ${A.name} and ${B.name} (${mode === 'white' ? 'status quo ante' : 'annexation'}).`, 'good');
  notify('🕊️ Peace', `${A.name} and ${B.name} sign a treaty.`, 'good');
  emit('peace', { a, b });
}

export function flipProvince(p, to) {
  const from = p.owner;
  if (from === to) return;
  p.owner = to;
  // settlements in the province change hands
  const cs = CFG.MAP / CFG.PROV_N;
  for (const s of G.world.settlements) {
    const sp = provinceAt(s.x, s.z);
    if (sp === p) s.occupiedBy = to === s.nation ? undefined : to;
  }
  emit('province:flip', { prov: p, from, to });
}

// ------------------------------------------------------------- hourly tick --

const CAPTURE_HOURS = 10;

export function hourlyMilitaryTick(rand) {
  const units = G.military.units;
  const toRemove = [];

  for (const u of units) {
    stepMovement(u, rand);
    stepSupply(u, rand);
  }

  // combat: pairwise within engagement range
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    for (let j = i + 1; j < units.length; j++) {
      const v = units[j];
      if (!hostile(u, v)) continue;
      const range = (u.type === 'artillery' || v.type === 'artillery') ? 70 * 70 : 38 * 38;
      if (dist2(u.x, u.z, v.x, v.z) > range) continue;
      fight(u, v, rand);
      if (rand.chance(0.3)) emit('battle', { x: (u.x + v.x) / 2, z: (u.z + v.z) / 2, size: 1 });
    }
  }

  // deaths & capture
  for (const u of units) {
    if (u.str <= 4 || u.morale <= 2) { toRemove.push(u); continue; }
    stepCapture(u, rand);
  }
  if (toRemove.length) {
    for (const u of toRemove) {
      const idx = units.indexOf(u);
      if (idx >= 0) units.splice(idx, 1);
      if (u.nation === G.player.nation) {
        notify('Division destroyed', `${u.name} has been wiped out.`, 'war');
        chronicle(`${u.name} destroyed in battle.`, 'war');
      } else if (u.nation === REBEL) {
        chronicle('A rebel force has been crushed.', 'good');
      }
      warCasualties(u);
    }
    emit('units:changed');
  }
}

function stepMovement(u, rand) {
  const dx = u.tx - u.x, dz = u.tz - u.z;
  const d = Math.hypot(dx, dz);
  if (d < 2) { if (u.order === 'move') u.order = 'hold'; return; }
  const t = UNIT_TYPES[u.type];
  let sp = t.speed / 3;                     // per hour step, tuned for map scale
  if (u.supply < 0.4) sp *= 0.6;
  const nx = u.x + (dx / d) * Math.min(sp, d), nz = u.z + (dz / d) * Math.min(sp, d);
  const h = heightAt(nx, nz);
  const wantWater = t.domain === 'sea';
  const okTerrain = t.domain === 'air' ? true : wantWater ? h < CFG.WATER_Y - 1 : h > CFG.WATER_Y + 0.3;
  if (okTerrain) { u.x = nx; u.z = nz; return; }
  // simple detour: try angled steps around the obstacle
  for (const da of [0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) {
    const a = Math.atan2(dz, dx) + da;
    const ax = u.x + Math.cos(a) * sp, az = u.z + Math.sin(a) * sp;
    const ah = heightAt(ax, az);
    if (wantWater ? ah < CFG.WATER_Y - 1 : ah > CFG.WATER_Y + 0.3) { u.x = ax; u.z = az; return; }
  }
}

function stepSupply(u, rand) {
  const logi = u.nation === G.player.nation ? G.military.techs.logistics : (G.world.nations[u.nation]?.techs?.logistics || 0);
  const range = 320 + logi * 90;
  let best = Infinity;
  // supply flows from owned provinces' hearts and friendly settlements
  for (const s of G.world.settlements) {
    if (u.nation !== REBEL && s.nation === u.nation && !s.occupiedBy) {
      best = Math.min(best, dist2(s.x, s.z, u.x, u.z));
    }
  }
  if (u.nation === REBEL) best = 200 * 200;         // rebels live off the land
  if (u.type === 'navy') best = Math.min(best, 250 * 250);
  const d = Math.sqrt(best);
  const target = clamp(1 - Math.max(0, d - range) / 500, 0.05, 1);
  u.supply += (target - u.supply) * 0.12;
  if (u.supply < 0.3 && rand.chance(0.35)) {
    u.str = Math.max(3, u.str - 0.5);              // attrition
    u.morale = Math.max(2, u.morale - 0.8);
  }
  // morale recovery when idle & supplied
  const doctrine = u.nation === G.player.nation ? G.military.techs.doctrine : 1;
  if (u.supply > 0.6) u.morale = clamp(u.morale + 0.25 + doctrine * 0.06, 0, 100);
}

function techMul(u) {
  const t = UNIT_TYPES[u.type];
  const techs = u.nation === G.player.nation ? G.military.techs :
    u.nation === REBEL ? { [t.tech]: 1 } : (G.world.nations[u.nation]?.techs || {});
  return 1 + (techs[t.tech] || 0) * 0.18;
}

function fight(u, v, rand) {
  const tU = UNIT_TYPES[u.type], tV = UNIT_TYPES[v.type];
  const provU = provinceAt(u.x, u.z);
  const terr = (p, unit) => (p && p.terrain === 'mountain' && unit.type !== 'air') ? 0.75 : 1;
  const dmgToV = tU.atk * (u.str / 100) * techMul(u) * (u.morale / 90) * (0.5 + u.supply * 0.6) * rand.range(0.6, 1.3) * terr(provU, u);
  const dmgToU = tV.atk * (v.str / 100) * techMul(v) * (v.morale / 90) * (0.5 + v.supply * 0.6) * rand.range(0.6, 1.3);
  v.str = Math.max(0, v.str - dmgToV / tV.def);
  u.str = Math.max(0, u.str - dmgToU / tU.def);
  u.morale = Math.max(0, u.morale - dmgToV * 0.2 - 1.2);
  v.morale = Math.max(0, v.morale - dmgToU * 0.2 - 1.2);
  u.xp = Math.min(100, u.xp + 0.5); v.xp = Math.min(100, v.xp + 0.5);
  // routed units flee toward home
  for (const w of [u, v]) {
    if (w.morale < 22 && w.order !== 'retreat') {
      const home = homeOf(w);
      w.tx = home.x; w.tz = home.z; w.order = 'retreat';
    }
  }
  // war score bookkeeping
  const war = G.military.wars.find((w) => (w.a === u.nation && w.b === v.nation) || (w.a === v.nation && w.b === u.nation));
  if (war) {
    const delta = (dmgToV - dmgToU) * 0.05;
    war.score += (war.a === u.nation ? delta : -delta);
    war.exhaustionA += 0.004; war.exhaustionB += 0.004;
  }
}

function homeOf(u) {
  if (u.nation === REBEL) return { x: u.x + (Math.random() - 0.5) * 200, z: u.z + (Math.random() - 0.5) * 200 };
  const n = G.world.nations[u.nation];
  const cap = G.world.settlements[n?.capital];
  return cap || { x: 0, z: 0 };
}

function stepCapture(u, rand) {
  if (u.type === 'air' || u.type === 'navy') return;
  const p = provinceAt(u.x, u.z);
  if (!p) return;
  const isEnemyProv = u.nation === REBEL ? (p.owner === u.rebelOf) :
    (p.owner !== u.nation && (atWar(u.nation, p.owner) || (p.owner === REBEL)));
  if (!isEnemyProv) { u.captureH = 0; return; }
  // contested if a hostile unit is nearby
  for (const v of G.military.units) {
    if (hostile(u, v) && dist2(u.x, u.z, v.x, v.z) < 90 * 90) { return; }
  }
  // fortifications resist capture
  let holdMul = 1;
  for (const b of G.world.buildings) {
    if ((b.type === 'bunker' || b.type === 'wall') && b.nation === p.owner && b.hp > 20 && !b.underConstruction &&
      dist2(b.x, b.z, u.x, u.z) < 130 * 130) { holdMul = 3; break; }
  }
  u.captureH++;
  if (u.captureH >= CAPTURE_HOURS * holdMul) {
    u.captureH = 0;
    const from = p.owner;
    flipProvince(p, u.nation === REBEL ? REBEL : u.nation);
    const war = G.military.wars.find((w) => (w.a === u.nation && w.b === from) || (w.a === from && w.b === u.nation));
    if (war) war.score += war.a === u.nation ? 6 : -6;
    if (u.nation === G.player.nation) notify('Province captured', `${p.name} is under our control.`, 'good');
    if (from === G.player.nation) notify('Province lost', `${p.name} has fallen to the enemy.`, 'war');
    checkCapitulation(from, u.nation, rand);
  }
}

function checkCapitulation(loser, victor, rand) {
  if (loser < 0 || victor < 0) return;
  const L = G.world.nations[loser];
  if (!L || G.military.capitulated.includes(loser)) return;
  const capSettlement = G.world.settlements[L.capital];
  const capProv = capSettlement && provinceAt(capSettlement.x, capSettlement.z);
  const owned = nationProvinces(loser).length;
  if ((capProv && capProv.owner === victor) || owned === 0) {
    G.military.capitulated.push(loser);
    // total transfer to the victor
    for (const p of G.world.provinces) if (p.owner === loser) flipProvince(p, victor);
    for (const p of G.world.provinces) if (p.owner === victor) p.origOwner = victor;
    G.military.units = G.military.units.filter((u) => u.nation !== loser);
    for (const w of G.military.wars.slice()) {
      if (w.a === loser || w.b === loser) makePeace(w.a, w.b, 'annex');
    }
    chronicle(`${L.name} HAS CAPITULATED to ${victor === G.player.nation ? G.world.nations[victor].name : G.world.nations[victor].name}.`, 'war');
    notify('🏳️ CAPITULATION', `${L.name} has fallen. Its territory changes hands.`, 'war');
    emit('capitulation', { loser, victor });
    if (loser === G.player.nation) {
      G.gameOver = { reason: 'conquered', text: 'Foreign troops parade through your capital. Your government has fallen.' };
      emit('gameover', G.gameOver);
    }
  }
}

function warCasualties(u) {
  // losing a division hurts the home front
  if (u.nation !== G.player.nation) return;
  let hit = 0;
  for (const c of G.citizens) {
    if (c.nation !== G.player.nation || c.status !== 'free' || hit > 8) continue;
    if ((c.job === 'soldier' || Math.random() < 0.01) && Math.random() < 0.4) {
      c.opinion = clamp(c.opinion - 12, -100, 100);
      c.memories.unshift({ day: G.time.day, text: 'Lost someone in the war', impact: -12 });
      if (c.memories.length > 8) c.memories.length = 8;
      hit++;
    }
  }
}

/** Airstrike on a map point. Costs money, needs an air wing, angers the world. */
export function airstrike(x, z) {
  const wing = G.military.units.find((u) => u.nation === G.player.nation && u.type === 'air' && u.str > 20);
  if (!wing) { notify('No air power', 'You need an operational Air Wing.', 'bad'); return false; }
  if (G.economy.treasury < 4e6) { notify('Treasury empty', 'Sorties cost ₴4M.', 'bad'); return false; }
  G.economy.treasury -= 4e6;
  let hits = 0;
  for (const u of G.military.units) {
    if (hostile(wing, u) && dist2(u.x, u.z, x, z) < 80 * 80) {
      u.str = Math.max(0, u.str - 22); u.morale = Math.max(0, u.morale - 18);
      hits++;
    }
  }
  for (const b of G.world.buildings) {
    if (dist2(b.x, b.z, x, z) < 60 * 60 && b.nation !== G.player.nation) { b.hp = Math.max(10, b.hp - 45); hits++; }
  }
  emit('explosion', { x, z, big: true });
  chronicle(`Airstrike ordered (${hits} targets hit).`, 'war');
  const p = provinceAt(x, z);
  if (p && p.owner !== G.player.nation && p.owner >= 0 && !atWar(G.player.nation, p.owner)) {
    // bombing a country you're not at war with is an act of war
    declareWar(p.owner, G.player.nation, 'unprovoked airstrike');
  }
  return true;
}

// ------------------------------------------------------------- daily/monthly --

export function dailyMilitaryTick(rand) {
  // war exhaustion creeps up for everyone involved
  for (const w of G.military.wars) {
    w.exhaustionA += 0.001; w.exhaustionB += 0.001;
  }
  aiCommand(rand);
}

export function monthlyMilitaryTick(rand) {
  const m = G.military;
  monthlyResearch();
  // manpower regenerates from the population and conscription law
  const mods = lawMods();
  m.manpower = Math.min(400, m.manpower + population() / 9e5 * mods.manpower);
  // upkeep
  m.upkeep = 0;
  for (const u of m.units) if (u.nation === G.player.nation) m.upkeep += UNIT_TYPES[u.type].upkeep;
  // AI nations raise armies with their treasuries
  for (const n of G.world.nations) {
    if (n.id === G.player.nation || G.military.capitulated.includes(n.id)) continue;
    const count = m.units.filter((u) => u.nation === n.id).length;
    const wants = 3 + Math.floor(n.mil / 55) + n.atWar.length * 2;
    if (count < wants && n.treasury > 6e7) {
      n.treasury -= 3e7;
      const cap = G.world.settlements[n.capital];
      if (cap) {
        const type = rand.chance(0.3) && (n.techs?.armor || 0) > 0 ? 'armor' : rand.chance(0.15) && (n.techs?.air || 0) > 0 ? 'air' : 'infantry';
        spawnUnit(n.id, type, cap.x + rand.range(-40, 40), cap.z + rand.range(-40, 40));
      }
    }
  }
}

/** Simple but ruthless AI unit orders. */
function aiCommand(rand) {
  for (const u of G.military.units) {
    if (u.nation === G.player.nation) continue;
    if (u.order === 'retreat' && u.morale > 45) u.order = 'hold';
    if (u.order === 'retreat') continue;
    const enemies = G.military.units.filter((v) => hostile(u, v));
    const n = G.world.nations[u.nation];

    if (u.nation === REBEL) {
      // rebels raid the nearest government settlement
      const targets = G.world.settlements.filter((s) => s.nation === u.rebelOf);
      const t = nearest(u, targets);
      if (t && rand.chance(0.5)) { u.tx = t.x; u.tz = t.z; u.order = 'move'; }
      continue;
    }
    if (!n || !n.atWar.length) {
      // peacetime: drift back to garrison
      const cap = G.world.settlements[n?.capital];
      if (cap && dist2(u.x, u.z, cap.x, cap.z) > 300 * 300 && rand.chance(0.3)) {
        u.tx = cap.x + rand.range(-60, 60); u.tz = cap.z + rand.range(-60, 60); u.order = 'move';
      }
      continue;
    }
    // wartime: defend the capital if threatened, else push the front
    const cap = G.world.settlements[n.capital];
    const threat = cap && enemies.length ? nearest({ x: cap.x, z: cap.z }, enemies) : null;
    if (threat && dist2(threat.x, threat.z, cap.x, cap.z) < 350 * 350) {
      u.tx = threat.x; u.tz = threat.z; u.order = 'move';
      continue;
    }
    const enemyProvs = G.world.provinces.filter((p) => n.atWar.includes(p.owner));
    const goal = nearest(u, enemyProvs);
    if (goal && rand.chance(0.6)) {
      u.tx = goal.x + rand.range(-30, 30); u.tz = goal.z + rand.range(-30, 30);
      u.order = 'move';
    }
  }
}

function nearest(u, list) {
  let best = null, bd = Infinity;
  for (const t of list) {
    const d = dist2(u.x, u.z, t.x, t.z);
    if (d < bd) { bd = d; best = t; }
  }
  return best;
}

/** Rebel uprising in a settlement. Called by politics. */
export function spawnRebellion(settlement, size = 2) {
  for (let i = 0; i < size; i++) {
    spawnUnit(REBEL, 'infantry', settlement.x + (i - size / 2) * 34, settlement.z + 70, settlement.nation);
  }
  chronicle(`ARMED UPRISING in ${settlement.name}!`, 'war');
  notify('🔥 Rebellion', `Insurgents have taken up arms near ${settlement.name}.`, 'war');
  emit('units:changed');
  emit('riot', { settlement });
}

/** Provinces on the border of a war (for map/minimap highlighting). */
export function frontlineProvinces() {
  const res = [];
  const n = CFG.PROV_N, grid = G.world.provGrid, provinces = G.world.provinces;
  for (const p of provinces) {
    let front = false;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const jx = p.ix + dx, jz = p.iz + dz;
      if (jx < 0 || jz < 0 || jx >= n || jz >= n) continue;
      const q = grid[jz * n + jx];
      if (q < 0) continue;
      const o = provinces[q].owner;
      if (o !== p.owner && (p.owner === REBEL || o === REBEL || atWar(p.owner, o))) { front = true; break; }
    }
    if (front) res.push(p);
  }
  return res;
}
