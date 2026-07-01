// sim/nations.js — foreign powers with minds of their own.
// Each AI nation has a leader personality (aggression, paranoia, greed, honor)
// that drives relations, pacts, sanctions, ultimatums and wars — with the
// player and with each other. Also home of the intelligence service.

import { clamp, dist2 } from '../core/rng.js';
import { personName } from '../core/names.js';
import { G, chronicle, CFG } from '../core/state.js';
import { notify, emit } from '../core/bus.js';
import { lawMods } from './laws.js';
import { atWar, declareWar, makePeace, REBEL } from './military.js';

export function initIntel() {
  G.intel = {
    agents: 3, maxAgents: 3,
    intelOn: {},        // nation id → 0..1 knowledge
    reports: [],        // strings shown in the intel panel
    incidents: 0,
  };
}

// --------------------------------------------------------------- adjacency --

export function nationsAdjacent(a, b) {
  const n = CFG.PROV_N, grid = G.world.provGrid, provinces = G.world.provinces;
  for (const p of provinces) {
    if (p.owner !== a) continue;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const jx = p.ix + dx, jz = p.iz + dz;
      if (jx < 0 || jz < 0 || jx >= n || jz >= n) continue;
      const q = grid[jz * n + jx];
      if (q >= 0 && provinces[q].owner === b) return true;
    }
  }
  return false;
}

// ------------------------------------------------------- player diplomacy --

export function sendEnvoy(nid) {
  if (G.economy.treasury < 5e6) return notify('Treasury empty', 'An embassy mission costs ₴5M.', 'bad');
  G.economy.treasury -= 5e6;
  const n = G.world.nations[nid];
  const gain = 6 + Math.random() * 8 * (1 - (n.leader.paranoia || 0.5) * 0.5);
  n.relations[G.player.nation] = clamp(n.relations[G.player.nation] + gain, -100, 100);
  chronicle(`Envoys exchanged gifts with ${n.name}.`, 'good');
  notify('Diplomacy', `${n.name} appreciated the gesture (+${gain.toFixed(0)} relations).`, 'good');
}

export function denounce(nid) {
  const n = G.world.nations[nid];
  n.relations[G.player.nation] = clamp(n.relations[G.player.nation] - 18, -100, 100);
  for (const o of G.world.nations) {
    if (o.id === nid || o.id === G.player.nation) continue;
    if (o.relations[nid] < -20) o.relations[G.player.nation] = clamp(o.relations[G.player.nation] + 4, -100, 100);
  }
  chronicle(`We publicly denounced ${n.name}.`, 'bad');
  notify('Denunciation', `${n.name} recalls its ambassador.`, 'bad');
}

export function offerAlliance(nid) {
  const n = G.world.nations[nid];
  const us = G.player.nation;
  if (n.alliances.includes(us)) return;
  const sharedEnemy = n.atWar.some((e) => G.world.nations[us].atWar?.includes?.(e)) ||
    Object.keys(n.relations).some((k) => n.relations[k] < -50 && G.world.nations[us].relations[k] < -50);
  const willing = n.relations[us] > 55 || (n.relations[us] > 35 && sharedEnemy);
  if (willing) {
    n.alliances.push(us);
    G.world.nations[us].alliances.push(nid);
    chronicle(`Alliance signed with ${n.name}.`, 'good');
    notify('🤝 Alliance', `${n.name} is now our ally.`, 'good');
  } else {
    n.relations[us] = clamp(n.relations[us] - 4, -100, 100);
    notify('Rejected', `${n.name} declines the alliance. Improve relations first.`, 'bad');
  }
}

export function breakAlliance(nid) {
  const n = G.world.nations[nid], us = G.world.nations[G.player.nation];
  n.alliances = n.alliances.filter((x) => x !== us.id);
  us.alliances = us.alliances.filter((x) => x !== nid);
  n.relations[us.id] = clamp(n.relations[us.id] - 30, -100, 100);
  chronicle(`Alliance with ${n.name} dissolved.`, 'bad');
}

export function toggleSanction(nid) {
  const us = G.world.nations[G.player.nation];
  const n = G.world.nations[nid];
  if (us.sanctions.includes(nid)) {
    us.sanctions = us.sanctions.filter((x) => x !== nid);
    n.relations[G.player.nation] = clamp(n.relations[G.player.nation] + 6, -100, 100);
    chronicle(`Sanctions on ${n.name} lifted.`, 'good');
  } else {
    us.sanctions.push(nid);
    n.relations[G.player.nation] = clamp(n.relations[G.player.nation] - 22, -100, 100);
    n.gdp *= 0.985;
    chronicle(`Sanctions imposed on ${n.name}.`, 'bad');
    notify('Sanctions', `Trade with ${n.name} restricted. They will remember this.`, 'bad');
  }
}

/** Offer peace. mode 'white' | 'annex' (keep conquests) | 'surrender' (give back + reparations). */
export function offerPeace(nid, mode) {
  const us = G.player.nation;
  const war = G.military.wars.find((w) => (w.a === us && w.b === nid) || (w.a === nid && w.b === us));
  if (!war) return;
  const ourScore = war.a === us ? war.score : -war.score;
  const exhaustion = war.a === us ? war.exhaustionB : war.exhaustionA;
  const n = G.world.nations[nid];
  let accept = false;
  if (mode === 'white') accept = ourScore > -15 || exhaustion > 0.5;
  if (mode === 'annex') accept = ourScore > 30 || (ourScore > 15 && exhaustion > 0.6);
  if (mode === 'surrender') {
    accept = true;
    G.economy.treasury = Math.max(0, G.economy.treasury - 1.2e8);
    n.relations[us] = -20;
  }
  if (accept) {
    makePeace(us, nid, mode === 'annex' ? 'annex' : 'white');
  } else {
    notify('Peace rejected', `${n.name} believes it can still win.`, 'bad');
    war.score += war.a === us ? -2 : 2;
  }
}

// ---------------------------------------------------------------- espionage --

export const SPY_OPS = [
  { id: 'infiltrate', name: 'Infiltrate Networks', cost: 8e6, desc: 'Build intel on a nation: reveals army, economy and plots.' },
  { id: 'sabotage', name: 'Sabotage Industry', cost: 18e6, desc: 'Damage their economy. Risky.' },
  { id: 'incite', name: 'Incite Unrest', cost: 15e6, desc: 'Fund dissidents abroad. Weakens their war support.' },
  { id: 'steal', name: 'Steal Research', cost: 12e6, desc: 'A chance to boost our current research project.' },
];

export function runSpyOp(nid, opId, rand = Math) {
  const op = SPY_OPS.find((o) => o.id === opId);
  const n = G.world.nations[nid];
  if (!op || !n) return;
  if (G.intel.agents < 1) return notify('No agents', 'All operatives are deployed. Wait for them to return.', 'bad');
  if (G.economy.treasury < op.cost) return notify('Treasury empty', `Operation needs ${'₴' + op.cost / 1e6 + 'M'}.`, 'bad');
  G.economy.treasury -= op.cost;
  G.intel.agents--;
  setTimeoutDays(rand20(rand), () => { G.intel.agents = Math.min(G.intel.maxAgents, G.intel.agents + 1); });

  const caught = Math.random() < 0.18 + n.espionageDefense * 0.25 - (G.intel.intelOn[nid] || 0) * 0.15;
  if (caught) {
    G.intel.incidents++;
    n.relations[G.player.nation] = clamp(n.relations[G.player.nation] - 20, -100, 100);
    chronicle(`Spy captured in ${n.name}. Diplomatic incident!`, 'bad');
    notify('🚨 Agent captured', `${n.name} parades our operative on state TV.`, 'bad');
    if (n.leader.paranoia > 0.7 && Math.random() < 0.3) declareWar(nid, G.player.nation, 'espionage provocation');
    return;
  }
  switch (opId) {
    case 'infiltrate':
      G.intel.intelOn[nid] = clamp((G.intel.intelOn[nid] || 0) + 0.45, 0, 1);
      spyReport(`${n.name}: army ~${G.military.units.filter((u) => u.nation === nid).length} divisions, treasury ${(n.treasury / 1e9).toFixed(1)}B, leader ${n.leader.name} (${n.leader.aggression > 0.6 ? 'aggressive' : 'cautious'}${n.leader.paranoia > 0.6 ? ', paranoid' : ''}).`);
      break;
    case 'sabotage':
      n.gdp *= 0.97; n.treasury *= 0.93;
      spyReport(`Sabotage in ${n.name}: refinery fires reported. Their economy staggers.`);
      break;
    case 'incite':
      n.warExhaustion = clamp((n.warExhaustion || 0) + 0.2, 0, 1);
      n.mil = Math.max(30, n.mil - 12);
      spyReport(`Dissident cells funded in ${n.name}. Their conscripts desert.`);
      break;
    case 'steal': {
      const r = G.military.research;
      if (r.current) {
        r.progress += 60;
        spyReport(`Blueprints exfiltrated from ${n.name}: our ${r.current} research leaps ahead.`);
      } else {
        G.economy.treasury += 2e7;
        spyReport(`No active research to feed — our agents stole ${n.name}'s payroll instead (+₴20M).`);
      }
      break;
    }
  }
  notify('🕵️ Operation success', `${op.name} in ${n.name} succeeded.`, 'good');
}

function spyReport(text) {
  G.intel.reports.unshift({ day: G.time.day, text });
  if (G.intel.reports.length > 12) G.intel.reports.length = 12;
  chronicle('Intelligence report filed.', 'info');
}

const timers = [];
function setTimeoutDays(days, fn) { timers.push({ day: G.time.day + days, fn }); }
const rand20 = (r) => 12 + Math.floor(Math.random() * 10);
export function processTimers() {
  for (let i = timers.length - 1; i >= 0; i--) {
    if (G.time.day >= timers[i].day) { timers[i].fn(); timers.splice(i, 1); }
  }
}

// ------------------------------------------------------------- monthly AI --

export function monthlyDiplomacyTick(rand) {
  const us = G.player.nation;
  const mods = lawMods();
  const playerMil = G.military.units.filter((u) => u.nation === us).length * 10 + 20;

  for (const n of G.world.nations) {
    if (n.id === us || G.military.capitulated.includes(n.id)) continue;
    const L = n.leader;
    n.mil = G.military.units.filter((u) => u.nation === n.id).length * 10 + 30;

    // -- relations drift with the player --------------------------------------
    let drift = 0;
    drift += (mods.intl || 0) * 0.04;                                  // our reputation
    drift += n.gov === G.player.gov ? 0.6 : -0.3;                       // kindred systems
    if (G.world.nations[us].alliances.includes(n.id)) drift += 1.2;
    if (G.world.nations[us].sanctions.includes(n.id)) drift -= 1.5;
    if (nationsAdjacent(us, n.id)) drift -= L.aggression * 1.2;         // border friction
    drift += (rand() - 0.5) * 3;
    n.relations[us] = clamp(n.relations[us] + drift, -100, 100);

    // -- relations among AI nations -------------------------------------------
    for (const o of G.world.nations) {
      if (o.id === n.id || o.id === us || G.military.capitulated.includes(o.id)) continue;
      n.relations[o.id] = clamp(n.relations[o.id] + (rand() - 0.5) * 4 - (nationsAdjacent(n.id, o.id) ? L.aggression : 0), -100, 100);
    }

    // -- war decisions ----------------------------------------------------------
    if (!n.atWar.length) {
      // eye the player
      const rel = n.relations[us];
      const stronger = n.mil > playerMil * (1.15 - L.aggression * 0.3);
      if (rel < -55 && stronger && rand() < L.aggression * 0.16) {
        if (rand() < 0.5) {
          // ultimatum first: pay or fight
          const demand = Math.round(4 + rand() * 8) * 1e7;
          emit('modal', {
            title: `⚠️ Ultimatum from ${n.name}`,
            text: `${L.name} demands ${(demand / 1e6).toFixed(0)}M ₴ in "border compensation" — or war.`,
            choices: [
              { label: `Pay ${(demand / 1e6).toFixed(0)}M`, fn: () => { G.economy.treasury = Math.max(0, G.economy.treasury - demand); n.relations[us] = clamp(n.relations[us] + 15, -100, 100); chronicle(`Paid tribute to ${n.name}.`, 'bad'); } },
              { label: 'Refuse — let them come', fn: () => { if (Math.random() < 0.75) declareWar(n.id, us, 'rejected ultimatum'); else { n.relations[us] += 8; chronicle(`${n.name} backed down.`, 'good'); notify('They blinked', `${n.name} withdraws its ultimatum.`, 'good'); } } },
            ],
          });
        } else {
          declareWar(n.id, us, 'territorial ambition');
        }
      }
      // wars between AI nations keep the world alive
      for (const o of G.world.nations) {
        if (o.id === n.id || o.id === us || o.atWar.length || G.military.capitulated.includes(o.id)) continue;
        if (n.relations[o.id] < -60 && rand() < L.aggression * 0.05 && nationsAdjacent(n.id, o.id)) {
          declareWar(n.id, o.id, 'regional rivalry');
        }
      }
    } else {
      // consider peace
      for (const enemy of n.atWar.slice()) {
        const war = G.military.wars.find((w) => (w.a === n.id && w.b === enemy) || (w.a === enemy && w.b === n.id));
        if (!war) continue;
        const myScore = war.a === n.id ? war.score : -war.score;
        const myExh = war.a === n.id ? war.exhaustionA : war.exhaustionB;
        if (myScore < -25 || myExh > 0.75) {
          if (enemy === us) {
            emit('modal', {
              title: `🕊️ ${n.name} sues for peace`,
              text: `${L.name} offers to end the war.${myScore < -30 ? ' They are willing to cede occupied territory.' : ''}`,
              choices: [
                { label: 'White peace', fn: () => makePeace(us, n.id, 'white') },
                ...(myScore < -30 ? [{ label: 'Annex occupied land', fn: () => makePeace(us, n.id, 'annex') }] : []),
                { label: 'Fight on', fn: () => { war.score += war.a === us ? 1 : -1; } },
              ],
            });
          } else if (rand() < 0.5) {
            makePeace(n.id, enemy, myScore < -30 ? 'annex' : 'white');
          }
          break;
        }
      }
    }

    // gifts & niceties
    if (n.relations[us] > 60 && rand() < 0.08) {
      const gift = 1.5e7;
      G.economy.treasury += gift;
      notify('Foreign aid', `${n.name} sends ₴15M in friendship aid.`, 'good');
      chronicle(`${n.name} sent aid.`, 'good');
    }
  }

  // intel decays
  for (const k in G.intel.intelOn) G.intel.intelOn[k] = Math.max(0, G.intel.intelOn[k] - 0.06);
}
