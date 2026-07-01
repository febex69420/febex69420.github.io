// sim/events.js — the dice of history.
// Weighted random events (disasters, epidemics, crashes, scandals, refugees,
// festivals…) that read the world state, so every playthrough drifts its own
// way. Some events demand a decision; all leave marks on the simulation.

import { clamp } from '../core/rng.js';
import { G, CFG, chronicle } from '../core/state.js';
import { notify, emit } from '../core/bus.js';
import { citizensOf, dieCitizen, playerCitizens } from './citizens.js';
import { remember } from './laws.js';

export function initEvents() {
  G.eventsState = { epidemic: null, cooldown: 12, lastEventDay: 0 };
}

// helper: pick a random player settlement (weighted by population)
function randomSettlement(rand, filter = () => true) {
  const list = G.world.settlements.filter((s) => s.nation === G.player.nation && !s.mil && filter(s));
  return list.length ? rand.pick(list) : null;
}

function moodHit(settlementId, amount, memory) {
  const targets = settlementId == null ? playerCitizens() : citizensOf(settlementId);
  for (const c of targets) {
    if (c.status !== 'free') continue;
    c.opinion = clamp(c.opinion + amount + Math.random() * amount * 0.5, -100, 100);
    if (memory && Math.abs(amount) >= 4 && Math.random() < 0.5) remember(c, memory, amount);
  }
}

// ------------------------------------------------------------ event catalog --

const EVENTS = [
  {
    id: 'earthquake', weight: () => 0.5,
    run(rand) {
      const s = randomSettlement(rand);
      if (!s) return false;
      s.prosperity = clamp(s.prosperity - 0.25, 0.05, 1);
      s.damaged = 0.6;
      let deaths = 0;
      for (const c of citizensOf(s.id)) if (rand.chance(0.03)) { dieCitizen(c, 'died in the earthquake'); deaths++; }
      for (const b of G.world.buildings) if (b.settlement === s.id && rand.chance(0.25)) b.hp = Math.max(15, b.hp - 50);
      moodHit(s.id, -8, 'Survived the earthquake');
      emit('explosion', { x: s.x, z: s.z, big: false });
      notify('🌋 Earthquake', `${s.name} has been hit hard. ${deaths ? deaths + ' simulated citizens perished.' : 'Buildings are damaged.'} Infrastructure spending will speed recovery.`, 'bad');
      chronicle(`Earthquake devastates ${s.name}.`, 'bad');
      return true;
    },
  },
  {
    id: 'flood', weight: () => 0.5,
    run(rand) {
      const s = randomSettlement(rand, (x) => x.type !== 'capital');
      if (!s) return false;
      s.prosperity = clamp(s.prosperity - 0.15, 0.05, 1);
      G.economy.resources.food = clamp(G.economy.resources.food - 18, 0, 200);
      moodHit(s.id, -5, 'The flood took everything');
      notify('🌊 Flooding', `Rivers burst their banks around ${s.name}. Harvests are lost.`, 'bad');
      chronicle(`Floods around ${s.name}.`, 'bad');
      return true;
    },
  },
  {
    id: 'epidemic', weight: () => (G.eventsState.epidemic ? 0 : 0.35),
    run(rand) {
      const s = randomSettlement(rand);
      if (!s) return false;
      G.eventsState.epidemic = { origin: s.id, infected: [s.id], severity: rand.range(0.4, 1), day: G.time.day, deaths: 0 };
      emit('modal', {
        title: '🦠 Epidemic Outbreak',
        text: `A novel fever is spreading through ${s.name}. The health ministry requests instructions.`,
        choices: [
          { label: 'Quarantine the city (−economy)', fn: () => { G.eventsState.epidemic.quarantine = true; G.economy.growth -= 0.01; chronicle(`Quarantine imposed on ${s.name}.`, 'info'); } },
          { label: 'Keep things open (risky)', fn: () => { chronicle('The government downplays the outbreak.', 'bad'); } },
        ],
      });
      chronicle(`Epidemic breaks out in ${s.name}.`, 'bad');
      return true;
    },
  },
  {
    id: 'boom', weight: () => 0.5,
    run(rand) {
      G.economy.growth = clamp(G.economy.growth + 0.02, -0.15, 0.14);
      G.economy.treasury += 2.5e7;
      moodHit(null, 3, null);
      notify('📈 Economic boom', 'Exports surge; factories run double shifts.', 'good');
      chronicle('Economic boom.', 'good');
      return true;
    },
  },
  {
    id: 'crash', weight: () => 0.4 + (G.economy.inflation > 0.15 ? 0.6 : 0),
    run(rand) {
      G.economy.growth = clamp(G.economy.growth - 0.045, -0.15, 0.14);
      G.economy.gdp *= 0.96;
      G.economy.unemployment = clamp(G.economy.unemployment + 0.05, 0, 0.5);
      moodHit(null, -6, 'Lost savings in the crash');
      notify('📉 Market crash', 'Banks wobble, savings evaporate, dockyards fall silent.', 'bad');
      chronicle('Financial crash.', 'bad');
      return true;
    },
  },
  {
    id: 'refugees', weight: () => (G.world.nations.some((n) => n.id !== G.player.nation && n.atWar.length) ? 0.8 : 0),
    run(rand) {
      const warNation = G.world.nations.find((n) => n.id !== G.player.nation && n.atWar.length);
      if (!warNation) return false;
      emit('modal', {
        title: '🚶 Refugee Crisis',
        text: `Thousands flee the fighting in ${warNation.name} and mass at our border crossings.`,
        choices: [
          {
            label: 'Open the border',
            fn: () => {
              const s = randomSettlement(rand);
              if (s) s.pop += 4000;
              G.politics.nationalUnrest = clamp(G.politics.nationalUnrest + 0.06, 0, 1);
              for (const n of G.world.nations) if (n.id !== G.player.nation && n.gov === 'democracy') n.relations[G.player.nation] = clamp(n.relations[G.player.nation] + 8, -100, 100);
              chronicle('Refugees welcomed; the world approves, some towns grumble.', 'info');
              notify('Borders opened', 'Refugee camps rise on the outskirts. International praise, local strain.', 'info');
            },
          },
          {
            label: 'Seal the border',
            fn: () => {
              for (const n of G.world.nations) if (n.id !== G.player.nation) n.relations[G.player.nation] = clamp(n.relations[G.player.nation] - 6, -100, 100);
              chronicle('Refugees turned away at the border.', 'bad');
              notify('Borders sealed', 'Cable news shows the columns turned back. Capitals condemn us.', 'bad');
            },
          },
        ],
      });
      return true;
    },
  },
  {
    id: 'scandal', weight: () => 0.3 + G.politics.corruption,
    run(rand) {
      const skim = Math.round(G.politics.corruption * 8e7);
      G.economy.treasury = Math.max(0, G.economy.treasury - skim);
      moodHit(null, -4, null);
      notify('🧾 Corruption scandal', `Auditors found ₴${(skim / 1e6).toFixed(0)}M missing from the roads budget. ${G.laws.press === 0 ? 'The free press is merciless.' : 'State media buries the story, but rumors travel.'}`, 'bad');
      chronicle('Corruption scandal exposed.', 'bad');
      return true;
    },
  },
  {
    id: 'assassination', weight: () => (G.politics.approval < 35 || G.politics.martyr ? 0.5 : 0.08),
    run(rand) {
      const survived = rand.chance(0.82);
      if (survived) {
        emit('modal', {
          title: '🎯 Assassination Attempt',
          text: 'A gunman fired on your motorcade. Your guards were faster. The would-be assassin is in custody.',
          choices: [
            { label: 'Public trial', fn: () => { moodHit(null, 2, null); chronicle('The assassin faces an open trial.', 'info'); } },
            {
              label: 'Sweeping purge', fn: () => {
                for (const c of playerCitizens()) { c.fear = clamp(c.fear + 0.2, 0, 1); if (c.rebel && rand.chance(0.3)) { c.status = 'prison'; c.releaseDay = G.time.day + 200; } }
                moodHit(null, -5, 'The purge after the attempt');
                chronicle('Mass arrests follow the assassination attempt.', 'bad');
              },
            },
          ],
        });
        chronicle('Assassination attempt survived.', 'war');
      } else {
        G.gameOver = { reason: 'assassinated', text: 'The motorcade never reached the palace. History will argue about who ordered it.' };
        emit('gameover', G.gameOver);
      }
      return true;
    },
  },
  {
    id: 'discovery', weight: () => 0.4,
    run(rand) {
      G.military.research.progress += 45;
      notify('🔬 Scientific breakthrough', 'University researchers publish a landmark result; our labs surge ahead.', 'good');
      chronicle('Scientific breakthrough at home.', 'good');
      return true;
    },
  },
  {
    id: 'festival', weight: () => 0.45,
    run(rand) {
      const s = randomSettlement(rand);
      if (!s) return false;
      moodHit(s.id, 6, 'The harvest festival was glorious');
      s.boost = 0.1;
      notify('🎉 Festival', `${s.name} celebrates the harvest festival. Spirits lift.`, 'good');
      chronicle(`Festival in ${s.name}.`, 'good');
      emit('festival', { settlement: s });
      return true;
    },
  },
  {
    id: 'strike', weight: () => 0.35 + (G.economy.inflation > 0.12 ? 0.4 : 0),
    run(rand) {
      emit('modal', {
        title: '⚒️ General Strike',
        text: 'Factory unions have walked out over wages and prices. Production is frozen.',
        choices: [
          {
            label: 'Meet their demands (₴30M)',
            fn: () => {
              G.economy.treasury = Math.max(0, G.economy.treasury - 3e7);
              for (const c of playerCitizens()) if (c.job === 'worker' || c.job === 'farmer') { c.opinion = clamp(c.opinion + 14, -100, 100); remember(c, 'The strike won us fair wages', 14); }
              chronicle('Strike settled with wage increases.', 'good');
            },
          },
          {
            label: 'Send in the police',
            fn: () => {
              for (const c of playerCitizens()) {
                if (c.job === 'worker') { c.opinion = clamp(c.opinion - 12, -100, 100); c.fear = clamp(c.fear + 0.15, 0, 1); remember(c, 'They broke the strike with batons', -12); }
              }
              G.economy.growth -= 0.005;
              chronicle('The strike was broken by force.', 'bad');
            },
          },
        ],
      });
      return true;
    },
  },
  {
    id: 'border-incident', weight: () => 0.4,
    run(rand) {
      const others = G.world.nations.filter((n) => n.id !== G.player.nation && !G.military.capitulated.includes(n.id));
      if (!others.length) return false;
      const n = rand.pick(others);
      n.relations[G.player.nation] = clamp(n.relations[G.player.nation] - 8, -100, 100);
      notify('🚧 Border incident', `Shots exchanged at the ${n.name} frontier. Both sides blame the other.`, 'bad');
      chronicle(`Border incident with ${n.name}.`, 'bad');
      return true;
    },
  },
  {
    id: 'goodharvest', weight: () => 0.4,
    run(rand) {
      G.economy.resources.food = clamp(G.economy.resources.food + 30, 0, 200);
      moodHit(null, 2, null);
      notify('🌾 Bumper harvest', 'Granaries overflow this season.', 'good');
      chronicle('Excellent harvest.', 'good');
      return true;
    },
  },
];

// ------------------------------------------------------------- daily driver --

export function dailyEventsTick(rand) {
  const ES = G.eventsState;
  stepEpidemic(rand);
  if (ES.cooldown-- > 0) return;
  // roughly one event every ~9 days, weighted
  if (!rand.chance(0.11)) return;
  const weights = EVENTS.map((e) => e.weight());
  let sum = 0; for (const w of weights) sum += w;
  if (sum <= 0) return;
  let r = rand() * sum;
  for (let i = 0; i < EVENTS.length; i++) {
    r -= weights[i];
    if (r <= 0) {
      if (EVENTS[i].run(rand)) {
        ES.cooldown = 5 + Math.floor(rand() * 6);
        ES.lastEventDay = G.time.day;
      }
      break;
    }
  }
}

// ---------------------------------------------------------------- epidemic --

function stepEpidemic(rand) {
  const ep = G.eventsState.epidemic;
  if (!ep) return;
  const healthPower = (G.economy.budget.healthcare / 3e7) * (1 + G.world.buildings.filter((b) => b.nation === G.player.nation && b.type === 'hospital' && !b.underConstruction).length * 0.12);
  // spread
  if (!ep.quarantine && rand.chance(0.12 * ep.severity)) {
    const candidates = G.world.settlements.filter((s) => s.nation === G.player.nation && !s.mil && !ep.infected.includes(s.id));
    if (candidates.length) {
      const s = rand.pick(candidates);
      ep.infected.push(s.id);
      notify('🦠 Epidemic spreads', `Cases confirmed in ${s.name}.`, 'bad');
    }
  }
  // sickness & death
  for (const sid of ep.infected) {
    for (const c of citizensOf(sid)) {
      if (rand.chance(0.004 * ep.severity / Math.max(0.5, healthPower))) {
        dieCitizen(c, 'died of the fever');
        ep.deaths++;
      }
    }
  }
  // burn out
  ep.severity -= 0.004 * healthPower + (ep.quarantine ? 0.004 : 0);
  if (ep.severity <= 0.05) {
    notify('✅ Epidemic over', `The fever has burned out. ${ep.deaths} simulated citizens died.`, ep.deaths > 15 ? 'bad' : 'good');
    chronicle(`Epidemic ends (${ep.deaths} dead).`, 'info');
    if (ep.deaths > 15) moodHit(null, -5, 'The state failed us during the fever');
    G.eventsState.epidemic = null;
  }
}
