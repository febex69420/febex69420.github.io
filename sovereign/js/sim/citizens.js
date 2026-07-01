// sim/citizens.js — every NPC is a persistent, simulated person.
// Citizens have homes, workplaces, families, traits, memories and opinions.
// Aggregate national statistics are derived FROM the agents, not the other
// way round: each simulated citizen stands for CFG.POP_SCALE real people.

import { makeRNG, clamp } from '../core/rng.js';
import { personName } from '../core/names.js';
import { G, CFG, chronicle } from '../core/state.js';
import { notify, emit } from '../core/bus.js';
import { lawMods, remember } from './laws.js';

const JOB_BY_BUILDING = {
  school: 'teacher', hospital: 'doctor', university: 'professor', lab: 'scientist',
  factory: 'worker', farm: 'farmer', market: 'merchant', hall: 'official',
  palace: 'official', police: 'officer', church: 'priest', barracks: 'soldier',
  hangar: 'pilot', dock: 'dockworker', warehouse: 'worker', powerplant: 'engineer',
  nuclear: 'engineer', depot: 'soldier',
};

const PERSONALITIES = ['stoic', 'fiery', 'gentle', 'cynical', 'devout', 'ambitious',
  'cheerful', 'brooding', 'proud', 'timid', 'shrewd', 'idealistic'];

export const NOTABLE_ROLES = [
  ['opposition', 'Opposition Leader'], ['general', 'Army General'], ['journalist', 'Chief Editor'],
  ['tycoon', 'Industrial Tycoon'], ['cleric', 'High Cleric'], ['scientist', 'Chief Scientist'],
  ['judge', 'Supreme Judge'], ['unionist', 'Union Boss'],
];

// ------------------------------------------------------------- generation --

export function generateCitizens(progress = () => {}) {
  const rng = makeRNG(G.seed + ':people');
  G.citizens = [];
  for (const nation of G.world.nations) {
    const count = nation.id === G.player.nation ? CFG.CITIZENS_PLAYER : CFG.CITIZENS_AI;
    const homes = G.world.settlements.filter((s) => s.nation === nation.id && !s.mil && s.houses.length);
    if (!homes.length) continue;
    for (let i = 0; i < count; i++) {
      spawnCitizen(rng, nation.id, weightedHome(rng, homes));
    }
    if (nation.id === G.player.nation) assignNotables(rng);
    progress('Populating the realm…', 0.8 + 0.15 * (nation.id + 1) / G.world.nations.length);
  }
  // marry some of them to each other
  const singles = G.citizens.filter((c) => c.age > 20 && c.age < 60);
  for (const c of singles) {
    if (c.family.spouse >= 0 || !rng.chance(0.55)) continue;
    const mate = singles.find((m) => m.id !== c.id && m.family.spouse < 0 && m.home === c.home && m.sex !== c.sex && Math.abs(m.age - c.age) < 12);
    if (mate) {
      c.family.spouse = mate.id; mate.family.spouse = c.id;
      mate.houseB = c.houseB;
      const kids = rng.int(0, 3);
      c.family.children = mate.family.children = kids;
    }
  }
  emit('citizens:changed');
}

function weightedHome(rng, homes) {
  // bigger settlements attract more residents
  const w = homes.map((h) => ({ capital: 5, city: 3.4, town: 1.8, village: 1, harbor: 0.8 }[h.type] || 1));
  let sum = 0; for (const x of w) sum += x;
  let r = rng() * sum;
  for (let i = 0; i < homes.length; i++) { r -= w[i]; if (r <= 0) return homes[i]; }
  return homes[homes.length - 1];
}

function spawnCitizen(rng, nid, home) {
  const sex = rng.chance(0.5) ? 'f' : 'm';
  const age = clamp(Math.round(17 + rng() * rng() * 60), 17, 88);
  const houseB = rng.pick(home.houses);
  const c = {
    id: G.citizens.length, nation: nid, name: personName(rng, sex), sex, age,
    home: home.id, houseB, workB: -1, job: 'unemployed',
    wealth: clamp(rng.gauss() * 0.5 + 0.42, 0.05, 1),
    traits: {
      brave: rng(), loyal: rng(), ambition: rng(), faith: rng(),
    },
    personality: rng.pick(PERSONALITIES),
    opinion: Math.round(rng.range(-20, 30)),
    happiness: Math.round(rng.range(40, 70)),
    fear: rng.range(0, 0.2),
    memories: [], family: { spouse: -1, children: 0 },
    notable: null, status: 'free', rebel: false, protesting: false,
  };
  assignJob(rng, c);
  G.citizens.push(c);
  return c;
}

function assignJob(rng, c) {
  if (c.age > 67) { c.job = 'retired'; return; }
  const works = G.world.buildings.filter((b) => b.settlement === c.home && JOB_BY_BUILDING[b.type]);
  // also allow working at a military base / airport near home
  const near = G.world.settlements.filter((s) => s.nation === c.nation && s.mil);
  for (const s of near) for (const b of G.world.buildings) {
    if (b.settlement === s.id && JOB_BY_BUILDING[b.type] && rng.chance(0.06)) works.push(b);
  }
  if (works.length && rng.chance(0.88)) {
    const b = rng.pick(works);
    c.workB = b.id;
    c.job = JOB_BY_BUILDING[b.type];
  } else {
    c.job = rng.chance(0.5) ? 'laborer' : 'unemployed';
  }
}

function assignNotables(rng) {
  const pool = G.citizens.filter((c) => c.nation === G.player.nation && c.age > 30 && c.age < 66);
  for (const [role, title] of NOTABLE_ROLES) {
    const pick = pool.splice(rng.int(0, pool.length - 1), 1)[0];
    if (!pick) continue;
    pick.notable = role;
    pick.notableTitle = title;
    if (role === 'general') { pick.job = 'general'; pick.traits.loyal = rng.range(0.35, 0.9); }
    if (role === 'opposition') { pick.opinion = rng.range(-60, -25); pick.traits.ambition = rng.range(0.7, 1); }
    if (role === 'tycoon') pick.wealth = 1;
    if (role === 'journalist') pick.traits.brave = rng.range(0.6, 1);
  }
}

// ---------------------------------------------------------------- queries --

export const citizenById = (id) => G.citizens[id] || null;

export function citizensOf(sid) {
  return G.citizens.filter((c) => c.home === sid && c.status === 'free');
}

export function playerCitizens() {
  return G.citizens.filter((c) => c.nation === G.player.nation);
}

/** Mean opinion of free citizens in the player nation (-100..100). */
export function avgOpinion() {
  let sum = 0, n = 0;
  for (const c of G.citizens) {
    if (c.nation !== G.player.nation || c.status !== 'free') continue;
    const w = c.notable ? 6 : 1;                    // notables sway public discourse
    sum += c.opinion * w; n += w;
  }
  return n ? sum / n : 0;
}

export function settlementMood(sid) {
  let sum = 0, n = 0;
  for (const c of G.citizens) {
    if (c.home !== sid || c.status !== 'free') continue;
    sum += c.opinion; n++;
  }
  return n ? sum / n : 0;
}

/** National population derived from the agents. */
export function population() {
  let n = 0;
  for (const c of G.citizens) {
    if (c.nation === G.player.nation && c.status === 'free') n += 1 + c.family.children * 0.62;
  }
  return Math.round(n * CFG.POP_SCALE);
}

// -------------------------------------------------------------- daily tick --

/** What the average citizen thinks the state of the nation is (national target opinion). */
export function nationalMoodFactors() {
  const eco = G.economy, mods = lawMods();
  const taxPain = (eco.taxes.income * 1.4 + eco.taxes.corporate * 0.5 + eco.taxes.sales * 1.1) * mods.taxEff;
  const services = (eco.budget.education + eco.budget.healthcare) / Math.max(1, population()) * 5e4;
  const security = mods.order * 22 - (G.military.wars.length ? 14 : 0) - G.politics.rebellion * 25;
  const prosperity = (eco.growth * 320) - eco.inflation * 55 - eco.unemployment * 65;
  const freedom = mods.freedom * 46;
  const propaganda = Math.sqrt(Math.max(0, eco.budget.propaganda) / 4e6) * (7 + mods.propaganda * 22);
  return { taxPain: -taxPain * 62, services: clamp(services, 0, 26), security, prosperity, freedom, propaganda };
}

export function dailyCitizensTick(rand) {
  const f = nationalMoodFactors();
  const mods = lawMods();
  const base = f.taxPain + f.services + f.security + f.prosperity + f.freedom + f.propaganda;
  const settlementProsperity = {};
  for (const s of G.world.settlements) settlementProsperity[s.id] = s.prosperity;

  let deaths = 0;
  for (const c of G.citizens) {
    if (c.status === 'dead' || c.status === 'exile') continue;
    const isPlayerNation = c.nation === G.player.nation;
    if (!isPlayerNation) { // light-touch simulation abroad
      if (rand.chance(0.02)) c.opinion = clamp(c.opinion + rand.range(-2, 2), -100, 100);
      continue;
    }

    // memories fade
    let memSum = 0;
    for (const m of c.memories) {
      const age = G.time.day - m.day;
      memSum += m.impact * Math.max(0, 1 - age / 200);
    }

    // personal spin on the national mood
    let target = base * 0.055;
    target += (settlementProsperity[c.home] - 0.5) * 26;
    if (c.wealth < 0.35) target += mods.poorMood * 55 - G.economy.inflation * 40;
    if (c.wealth > 0.75) target += mods.richMood * 45 - G.economy.taxes.income * 30;
    if (c.job === 'worker' || c.job === 'farmer' || c.job === 'dockworker') target += mods.workerMood * 55;
    if (c.traits.faith > 0.6) target += mods.faithMood * 50;
    if (c.job === 'unemployed') target -= 14;
    if (c.job === 'soldier' || c.job === 'general' || c.job === 'pilot') target += G.economy.budget.military / 3e7 - (G.military.wars.length ? 6 : 0);
    if (c.notable === 'opposition') target -= 30;
    target += (c.traits.loyal - 0.45) * 34;
    target += memSum * 1.6;
    if (c.status === 'prison') target -= 28;

    // drift toward target; fearful citizens keep quiet but seethe
    c.opinion = clamp(c.opinion + (target - c.opinion) * 0.055 + rand.range(-0.8, 0.8), -100, 100);
    c.fear = clamp(c.fear + (mods.fear - c.fear) * 0.05, 0, 1);
    const comfort = f.services + f.prosperity * 0.7 + (settlementProsperity[c.home] - 0.5) * 30;
    c.happiness = clamp(c.happiness + (52 + comfort * 0.45 + c.opinion * 0.16 - c.happiness) * 0.05, 0, 100);

    // radicalization: miserable + brave + not too afraid → dissident
    if (!c.rebel && c.opinion < -45 && c.traits.brave > 0.55 && rand.chance(0.012 * (1 - c.fear * 0.7))) {
      c.rebel = true;
      if (c.notable) chronicle(`${c.notableTitle} ${c.name} has turned against the government.`, 'bad');
    }
    if (c.rebel && c.opinion > -18) c.rebel = false;

    // life goes on: aging & mortality handled yearly-ish
    if (rand.chance(0.0004)) {
      c.age++;
      if (c.age > 74 && rand.chance((c.age - 70) * 0.02)) { dieCitizen(c, 'passed away peacefully'); deaths++; }
    }
    // births keep the roster alive
    if (c.family.spouse >= 0 && c.age < 45 && rand.chance(0.0005 * (1 + f.services / 30))) {
      c.family.children++;
      const sp = citizenById(c.family.spouse);
      if (sp) sp.family.children = c.family.children;
    }
  }
  if (deaths > 2) emit('citizens:changed');
}

export function dieCitizen(c, cause) {
  c.status = 'dead';
  c.protesting = false; c.rebel = false;
  const sp = citizenById(c.family.spouse);
  if (sp && sp.status === 'free') {
    sp.opinion = clamp(sp.opinion - (cause.includes('executed') || cause.includes('killed') ? 45 : 4), -100, 100);
    remember(sp, `${c.name}, their spouse, ${cause}`, cause.includes('executed') ? -45 : -4);
  }
}

// ---------------------------------------------------- government vs. person --

const ACTION_INFO = {
  honor: { label: 'Award State Medal', cost: 2e6 },
  arrest: { label: 'Arrest (30 days)', cost: 1e5 },
  imprison: { label: 'Imprison indefinitely', cost: 2e5 },
  exile: { label: 'Exile abroad', cost: 5e5 },
  execute: { label: 'Execute', cost: 0 },
  pardon: { label: 'Pardon & release', cost: 0 },
};
export const JUSTICE_ACTIONS = ACTION_INFO;

/**
 * The ruler moves against (or for) a specific citizen. This is where personal
 * rule meets consequence: families remember, factions react, embassies cable home.
 */
export function governmentAction(cid, action) {
  const c = citizenById(cid);
  if (!c || c.status === 'dead') return false;
  const info = ACTION_INFO[action];
  if (!info) return false;
  if (G.economy.treasury < info.cost) { notify('Treasury empty', 'Cannot fund this action.', 'bad'); return false; }
  G.economy.treasury -= info.cost;

  const fame = c.notable ? 3.2 : 1;      // notable targets echo louder
  const near = G.citizens.filter((o) => o.status === 'free' && o.nation === c.nation && (o.home === c.home || o.notable));

  const ripple = (amt, text) => {
    for (const o of near) {
      const kin = o.id === c.family.spouse ? 3.5 : 1;
      const align = (o.opinion - c.opinion) / 100;   // people who disagree with the victim mind less
      o.opinion = clamp(o.opinion + amt * kin * (1 - align * 0.5) * (0.5 + Math.random()), -100, 100);
      if (Math.abs(amt) * kin > 6) remember(o, text, amt * kin);
    }
  };

  switch (action) {
    case 'honor':
      c.opinion = clamp(c.opinion + 35, -100, 100);
      c.wealth = clamp(c.wealth + 0.15, 0, 1);
      ripple(3 * fame, `${c.name} received a state medal`);
      chronicle(`${c.name} was awarded the Order of the Nation.`, 'good');
      notify('Medal ceremony', `${c.name} honored before the palace.`, 'good');
      break;
    case 'arrest':
      c.status = 'prison'; c.releaseDay = G.time.day + 30;
      c.fear = clamp(c.fear + 0.3, 0, 1);
      ripple(-4 * fame, `${c.name} was arrested by state security`);
      chronicle(`${c.name} was arrested.`, 'bad');
      intlBacklash(c.notable ? 3 : 1);
      break;
    case 'imprison':
      c.status = 'prison'; c.releaseDay = Infinity;
      ripple(-7 * fame, `${c.name} disappeared into the prison system`);
      chronicle(`${c.name} was imprisoned indefinitely.`, 'bad');
      intlBacklash(c.notable ? 6 : 2);
      break;
    case 'exile':
      c.status = 'exile';
      ripple(-6 * fame, `${c.name} was exiled from the country`);
      chronicle(`${c.name} was stripped of citizenship and exiled.`, 'bad');
      intlBacklash(c.notable ? 5 : 2);
      if (c.notable === 'opposition') G.politics.exiledOpposition = true;
      break;
    case 'execute': {
      dieCitizen(c, 'was executed by the state');
      const brutal = -13 * fame;
      ripple(brutal, `${c.name} was executed by the state`);
      // fear rises everywhere; quiet streets, hot hearts
      for (const o of G.citizens) {
        if (o.nation !== c.nation || o.status !== 'free') continue;
        o.fear = clamp(o.fear + 0.16 * fame * 0.5, 0, 1);
        if (o.rebel) o.opinion = clamp(o.opinion - 8, -100, 100);
      }
      chronicle(`${c.name} was executed.`, 'bad');
      notify('Execution carried out', c.notable ? `The ${c.notableTitle} is dead. The world watches.` : `${c.name} is dead.`, 'bad');
      intlBacklash(c.notable ? 12 : 4);
      if (c.notable) G.politics.martyr = { name: c.name, day: G.time.day };
      break;
    }
    case 'pardon':
      if (c.status !== 'prison') return false;
      c.status = 'free'; c.releaseDay = 0;
      c.opinion = clamp(c.opinion + 18, -100, 100);
      ripple(4 * fame, `${c.name} was pardoned and released`);
      chronicle(`${c.name} was pardoned.`, 'good');
      break;
  }
  emit('citizens:changed');
  emit('justice', { c, action });
  return true;
}

function intlBacklash(severity) {
  for (const n of G.world.nations) {
    if (n.id === G.player.nation) continue;
    const care = n.gov === 'democracy' ? 1 : n.gov === 'republic' ? 0.7 : 0.2;
    n.relations[G.player.nation] = clamp(n.relations[G.player.nation] - severity * care * (0.6 + Math.random() * 0.8), -100, 100);
  }
}

/** Timed releases (arrests expiring). Called daily by politics. */
export function processReleases() {
  for (const c of G.citizens) {
    if (c.status === 'prison' && c.releaseDay && G.time.day >= c.releaseDay) {
      c.status = 'free'; c.releaseDay = 0;
      remember(c, 'Released from detention', -6);
    }
  }
}

/** Ruler gives a public address; tone shifts crowds for a while. */
export function giveSpeech(tone) {
  const eff = { rally: [7, 0.06], reassure: [4, -0.04], threaten: [-3, 0.22] }[tone] || [3, 0];
  for (const c of G.citizens) {
    if (c.nation !== G.player.nation || c.status !== 'free') continue;
    const receptive = 0.4 + c.traits.loyal * 0.8;
    c.opinion = clamp(c.opinion + eff[0] * receptive * Math.random(), -100, 100);
    c.fear = clamp(c.fear + eff[1] * 0.5, 0, 1);
  }
  chronicle(`The ${G.player.title} addressed the nation (${tone}).`, 'info');
  emit('speech', { tone });
}
