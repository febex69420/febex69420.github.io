// sim/economy.js — national economy. GDP is computed bottom-up from what the
// simulated citizens actually do for a living, then flows through taxes,
// budgets, debt, inflation and trade. Consequences compound over months.

import { clamp } from '../core/rng.js';
import { G, CFG, chronicle } from '../core/state.js';
import { notify } from '../core/bus.js';
import { lawMods } from './laws.js';
import { population, playerCitizens } from './citizens.js';

export const BUDGETS = [
  ['education', 'Education', '🎓'], ['healthcare', 'Healthcare', '🏥'],
  ['military', 'Military', '🪖'], ['science', 'Science', '🔬'],
  ['infrastructure', 'Infrastructure', '🛣️'], ['security', 'Internal Security', '🛡️'],
  ['propaganda', 'Information Ministry', '📢'],
];

const SECTOR_OF_JOB = {
  farmer: 'agriculture', worker: 'industry', engineer: 'industry', dockworker: 'trade',
  merchant: 'trade', teacher: 'services', doctor: 'services', professor: 'services',
  scientist: 'services', official: 'services', officer: 'services', priest: 'services',
  pilot: 'services', laborer: 'industry', general: 'services',
};

export function initEconomy() {
  G.economy = {
    treasury: 6e8, debt: 0, inflation: 0.02, growth: 0.02, unemployment: 0.07,
    gdp: 1.1e10, currency: 1.0, printEffect: 0,
    taxes: { income: 0.24, corporate: 0.2, sales: 0.1 },
    budget: { education: 3e7, healthcare: 3e7, military: 4.5e7, science: 1.8e7, infrastructure: 2.4e7, security: 1.4e7, propaganda: 4e6 },
    resources: { food: 100, fuel: 80, materials: 90, goods: 85, power: 1 },
    sanctionsOnUs: 0, tradeIncome: 0, lastRevenue: 0, lastSpending: 0,
    series: { gdp: [], treasury: [], approval: [], inflation: [], population: [], unemployment: [], mil: [] },
  };
}

export function setTax(kind, value) {
  G.economy.taxes[kind] = clamp(value, 0, 0.9);
}

export function setBudget(kind, value) {
  G.economy.budget[kind] = Math.max(0, value);
}

/** The printing press: instant cash, delayed pain. */
export function printMoney(amount) {
  const eco = G.economy;
  eco.treasury += amount;
  eco.printEffect += amount / Math.max(1e9, eco.gdp);
  chronicle(`The central bank printed ${fmt(amount)}.`, 'bad');
  notify('Printing press running', `${fmt(amount)} added to the treasury. Inflation will follow.`, 'bad');
}
const fmt = (n) => '₴' + (n >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : (n / 1e6).toFixed(0) + 'M');

/** Count player buildings of a type (procedural + constructed). */
export function countBuildings(type) {
  let n = 0;
  for (const b of G.world.buildings) {
    if (b.nation === G.player.nation && b.type === type && b.hp > 20 && !b.underConstruction) n++;
  }
  return n;
}

/** Effectiveness multipliers from physical infrastructure. */
export function capacityFactors() {
  const pop = Math.max(1, population() / 1e5);   // per 100k people
  const edu = clamp((countBuildings('school') * 1 + countBuildings('university') * 2.4) / pop * 1.9, 0.25, 2);
  const health = clamp((countBuildings('hospital') * 1.6) / pop * 2.4, 0.25, 2);
  const demand = countBuildings('factory') * 1.1 + pop * 0.55;
  const supply = countBuildings('powerplant') * 4 + countBuildings('nuclear') * 14 + pop * 0.5;
  const power = clamp(supply / Math.max(1, demand), 0.4, 1.5);
  const science = clamp((countBuildings('lab') + countBuildings('university')) * 0.5 + 0.5, 0.5, 2.5);
  return { edu, health, power, science };
}

// ------------------------------------------------------------ monthly tick --

export function monthlyEconomyTick(rand) {
  const eco = G.economy;
  const mods = lawMods();
  const cap = capacityFactors();
  const pop = population();

  // --- production from the actual workforce -------------------------------
  const sectors = { agriculture: 0, industry: 0, services: 0, trade: 0 };
  let workers = 0, jobless = 0;
  for (const c of playerCitizens()) {
    if (c.status !== 'free') continue;
    const s = SECTOR_OF_JOB[c.job];
    if (s) { sectors[s] += 1 + c.wealth * 0.5; workers++; }
    else if (c.job === 'unemployed') jobless++;
    else if (c.job === 'soldier') workers += 0.3;
  }
  const scale = CFG.POP_SCALE * 3900;             // ₴ per worker-unit per year
  const seasonMul = [1.05, 1.15, 1.1, 0.72][Math.floor(G.time.dayOfYear / CFG.SEASON_DAYS) % 4];
  sectors.agriculture *= scale * 1.1 * seasonMul;
  sectors.industry *= scale * 1.7 * cap.power * (1 + countBuildings('factory') * 0.012);
  sectors.services *= scale * 1.5 * cap.edu;
  sectors.trade *= scale * 1.4 * (1 - eco.sanctionsOnUs * 0.45);
  eco.sectors = sectors;

  const rawGdp = sectors.agriculture + sectors.industry + sectors.services + sectors.trade;
  // long-run drift toward what the workforce produces, moved by growth rate
  eco.gdp = Math.max(1e9, eco.gdp * (1 + eco.growth / 12) * 0.9 + rawGdp * 0.1);

  // --- taxation (Laffer-flavored: extreme rates leak) ----------------------
  const evade = (r) => r * (1 - Math.pow(Math.max(0, r - 0.42), 1.5) * 1.7);
  const monthlyGdp = eco.gdp / 12;
  let revenue = monthlyGdp * (evade(eco.taxes.income) * 0.52 + evade(eco.taxes.corporate) * 0.3 + evade(eco.taxes.sales) * 0.33) * mods.taxEff;
  eco.tradeIncome = tradeFlow();
  revenue += eco.tradeIncome;

  // --- spending -------------------------------------------------------------
  let spending = 0;
  for (const k in eco.budget) spending += eco.budget[k];
  spending += mods.cost || 0;
  spending += G.military.upkeep || 0;
  const interest = eco.debt * 0.007;
  spending += interest;

  eco.lastRevenue = revenue; eco.lastSpending = spending;
  eco.treasury += revenue - spending;
  if (eco.treasury < 0) {                          // automatic borrowing
    eco.debt += -eco.treasury;
    eco.treasury = 0;
    if (eco.debt > eco.gdp * 0.9 && rand.chance(0.3)) {
      notify('Debt crisis looming', 'Creditors are losing faith in the treasury.', 'bad');
    }
  } else if (eco.debt > 0) {                       // surplus pays down debt
    const pay = Math.min(eco.debt, eco.treasury * 0.12);
    eco.debt -= pay; eco.treasury -= pay;
  }

  // --- inflation & growth ----------------------------------------------------
  const supplyShock = (G.military.wars.length ? 0.012 : 0) + eco.sanctionsOnUs * 0.02 + (eco.resources.food < 40 ? 0.02 : 0);
  eco.inflation = clamp(eco.inflation * 0.86 + 0.02 * 0.14 + eco.printEffect * 0.55 + supplyShock, -0.02, 0.9);
  eco.printEffect *= 0.72;
  eco.currency = clamp(eco.currency * (1 - eco.printEffect * 0.3), 0.05, 2);

  let invest = (eco.budget.infrastructure / 2.4e7 - 1) * 0.006 + (eco.budget.education / 3e7 - 1) * 0.004 + (eco.budget.science / 1.8e7 - 1) * 0.003;
  invest += Math.min(6, G.world.roads.filter((r) => r.kind === 'rail').length) * 0.0016;   // railways
  invest += (G.military.techs.industry || 0) * 0.002 + (G.military.techs.agritech || 0) * 0.001;
  const unrestDrag = G.politics.nationalUnrest * 0.05;
  const warDrag = G.military.wars.length * 0.012;
  eco.growth = clamp(eco.growth * 0.6 + (0.022 + invest + (mods.growth || 0) - unrestDrag - warDrag - Math.max(0, eco.inflation - 0.08) * 0.3 - eco.sanctionsOnUs * 0.015) * 0.4, -0.15, 0.12);

  const employable = workers + jobless;
  eco.unemployment = clamp(employable ? jobless / employable : 0.08, 0.01, 0.5) * (1 - eco.growth * 2);

  // --- resources --------------------------------------------------------------
  const r = eco.resources;
  r.food = clamp(r.food + countBuildings('farm') * 2.4 * seasonMul - pop / 3.4e5, 0, 200);
  r.fuel = clamp(r.fuel + countBuildings('mine') * 3 + 2 - countBuildings('factory') * 0.5 - (G.military.wars.length ? 6 : 0), 0, 200);
  r.materials = clamp(r.materials + countBuildings('mine') * 4 + 3 - countBuildings('factory') * 0.8, 0, 200);
  r.goods = clamp(r.goods + countBuildings('factory') * 1.6 * cap.power - pop / 4.5e5, 0, 200);
  r.power = cap.power;
  if (r.food < 25) notify('Food shortage', 'Granaries are running low. Citizens are hungry.', 'bad');

  // --- local prosperity drifts with the nation --------------------------------
  for (const s of G.world.settlements) {
    if (s.nation !== G.player.nation) continue;
    const target = clamp(0.5 + eco.growth * 3 - s.unrest * 0.3 - (s.damaged || 0) * 0.4 + (s.boost || 0), 0.05, 1);
    s.prosperity = clamp(s.prosperity + (target - s.prosperity) * 0.12, 0.05, 1);
    if (s.boost) s.boost *= 0.9;
  }

  // AI nations grow too
  for (const n of G.world.nations) {
    if (n.id === G.player.nation) continue;
    n.gdp *= 1 + (0.015 + (rand() - 0.45) * 0.02 - n.atWar.length * 0.012) / 12;
    n.treasury = Math.max(0, n.treasury + n.gdp * 0.017 / 12 - n.mil * 8e4);
  }
}

/** Trade income from every nation not sanctioning us, scaled by relations. */
function tradeFlow() {
  let total = 0, sanction = 0;
  const us = G.player.nation;
  for (const n of G.world.nations) {
    if (n.id === us) continue;
    if (n.sanctions.includes(us) || n.atWar.includes(us)) { sanction++; continue; }
    const rel = n.relations[us];
    if (rel > -20) total += (rel + 30) / 130 * Math.min(n.gdp, G.economy.gdp) * 0.0022;
  }
  G.economy.sanctionsOnUs = clamp(sanction / Math.max(1, G.world.nations.length - 1), 0, 1);
  return total;
}

/** Push one point onto every chart series (called monthly). */
export function pushSeries(approval) {
  const s = G.economy.series;
  const push = (arr, v) => { arr.push(v); if (arr.length > 240) arr.shift(); };
  push(s.gdp, G.economy.gdp);
  push(s.treasury, G.economy.treasury - G.economy.debt);
  push(s.approval, approval);
  push(s.inflation, G.economy.inflation * 100);
  push(s.population, population());
  push(s.unemployment, G.economy.unemployment * 100);
  push(s.mil, G.military.units.filter((u) => u.nation === G.player.nation).length);
}
