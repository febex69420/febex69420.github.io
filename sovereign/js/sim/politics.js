// sim/politics.js — the street and the palace.
// Reads the true opinions of simulated citizens and turns them into approval,
// protests, riots, rebellions, elections and coups. Fear can keep the lid on,
// but pressure has to go somewhere.

import { clamp } from '../core/rng.js';
import { G, CFG, chronicle } from '../core/state.js';
import { notify, emit } from '../core/bus.js';
import { lawMods } from './laws.js';
import { avgOpinion, citizensOf, processReleases, citizenById, dieCitizen } from './citizens.js';
import { spawnRebellion, REBEL } from './military.js';

export function initPolitics() {
  G.politics = {
    approval: 52, nationalUnrest: 0, stability: 0.75, corruption: 0.15,
    rebellion: 0, protests: [], coupRisk: 0.05, martyr: null,
    exiledOpposition: false, termYear: G.time.year + 4, annulled: false,
    curfewDeaths: 0,
  };
}

// ------------------------------------------------------------- daily tick --

export function dailyPoliticsTick(rand) {
  const P = G.politics;
  const mods = lawMods();
  processReleases();

  // approval tracks true opinion with a small lag
  const target = (avgOpinion() + 100) / 2;
  P.approval += (target - P.approval) * 0.12;

  // corruption breeds in the dark
  const dark = (G.laws.press >= 2 ? 0.25 : 0) + (G.laws.elections >= 2 ? 0.2 : 0) + (G.player.gov !== 'democracy' ? 0.1 : 0);
  P.corruption = clamp(P.corruption + (dark * 0.5 + 0.08 - P.corruption) * 0.01, 0.02, 0.95);

  // --- protests -------------------------------------------------------------
  updateProtests(rand, mods);

  // --- rebellion pressure -----------------------------------------------------
  let rebels = 0, free = 0;
  for (const c of G.citizens) {
    if (c.nation !== G.player.nation || c.status !== 'free') continue;
    free++;
    if (c.rebel) rebels++;
  }
  P.rebellion = clamp(P.rebellion * 0.97 + (free ? rebels / free : 0) * 0.4, 0, 1);
  if (P.rebellion > 0.28 && rand.chance(P.rebellion * 0.05)) {
    const hot = hottestSettlement();
    if (hot) spawnRebellion(hot, 1 + Math.floor(P.rebellion * 3));
  }

  // --- unrest index ------------------------------------------------------------
  let unrest = P.protests.reduce((a, p) => a + (p.violent ? 0.12 : 0.05), 0);
  unrest += P.rebellion * 0.6;
  unrest += G.military.units.some((u) => u.nation === REBEL) ? 0.15 : 0;
  P.nationalUnrest = clamp(P.nationalUnrest * 0.9 + unrest * 0.35, 0, 1);
  P.stability = clamp(1 - P.nationalUnrest * 0.7 - P.corruption * 0.25 - (G.military.wars.length ? 0.1 : 0), 0, 1);

  // --- coup watch ----------------------------------------------------------------
  const general = G.citizens.find((c) => c.notable === 'general' && c.status === 'free');
  const milMood = general ? general.opinion : 0;
  const underfunded = G.economy.budget.military < (G.military.upkeep || 0) * 0.8;
  const losing = G.military.wars.some((w) => (w.a === G.player.nation ? w.score : -w.score) < -25);
  let coupPressure = 0;
  if (milMood < -30) coupPressure += 0.004;
  if (underfunded) coupPressure += 0.003;
  if (losing) coupPressure += 0.004;
  if (P.approval < 25) coupPressure += 0.002;
  P.coupRisk = clamp(P.coupRisk * 0.995 + coupPressure, 0, 1);
  if (P.coupRisk > 0.5 && rand.chance(0.02)) coupAttempt(rand, general);

  // --- martyrs keep wounds open ---------------------------------------------------
  if (P.martyr && G.time.day - P.martyr.day < 60 && rand.chance(0.1)) {
    for (const c of G.citizens) {
      if (c.nation === G.player.nation && c.status === 'free' && c.traits.brave > 0.5 && rand.chance(0.1)) {
        c.opinion = clamp(c.opinion - 1.5, -100, 100);
      }
    }
  }

  // --- revolution end-state ----------------------------------------------------------
  if (P.rebellion > 0.85 && P.approval < 25) {
    G.gameOver = { reason: 'revolution', text: 'The palace gates gave way. The revolution devours its ruler.' };
    emit('gameover', G.gameOver);
  }
}

function hottestSettlement() {
  let best = null, worst = 0;
  for (const s of G.world.settlements) {
    if (s.nation !== G.player.nation || s.mil) continue;
    const mood = settlementDiscontent(s.id);
    if (mood > worst) { worst = mood; best = s; }
  }
  return worst > 0.3 ? best : null;
}

export function settlementDiscontent(sid) {
  const cs = citizensOf(sid);
  if (!cs.length) return 0;
  let angry = 0;
  for (const c of cs) if (c.opinion < -30) angry++;
  return angry / cs.length;
}

// ---------------------------------------------------------------- protests --

function updateProtests(rand, mods) {
  const P = G.politics;
  // new protests ignite where discontent is high
  for (const s of G.world.settlements) {
    if (s.nation !== G.player.nation || s.mil) continue;
    if (P.protests.some((p) => p.settlement === s.id)) continue;
    const disc = settlementDiscontent(s.id);
    const ease = 0.5 + (mods.protestEase || 0);            // assembly law
    const fearAvg = avgFear(s.id);
    const chance = Math.max(0, disc - 0.22) * 0.25 * ease * (1 - fearAvg * 0.65);
    if (rand.chance(chance)) {
      const banned = G.laws.assembly === 2;
      const protest = { settlement: s.id, size: Math.round(disc * citizensOf(s.id).length), day: G.time.day, violent: banned && rand.chance(0.4) };
      P.protests.push(protest);
      for (const c of citizensOf(s.id)) if (c.opinion < -25 && rand.chance(0.7)) c.protesting = true;
      s.unrest = clamp(s.unrest + 0.3, 0, 1);
      chronicle(`${protest.violent ? 'Riots' : 'Protests'} erupt in ${s.name}.`, 'bad');
      notify(protest.violent ? '🔥 Riot' : '✊ Protest', `Crowds fill the streets of ${s.name}${banned ? ' in defiance of the ban' : ''}.`, 'bad');
      emit(protest.violent ? 'riot' : 'protest', { settlement: s });
    }
  }
  // evolve & resolve
  for (let i = P.protests.length - 1; i >= 0; i--) {
    const p = P.protests[i];
    const s = G.world.settlements[p.settlement];
    const disc = settlementDiscontent(p.settlement);
    const order = mods.order || 0;
    // escalation
    if (!p.violent && rand.chance(0.04 + disc * 0.05)) {
      p.violent = true;
      chronicle(`The protest in ${s.name} turns violent.`, 'bad');
      emit('riot', { settlement: s });
    }
    if (p.violent) {
      s.prosperity = clamp(s.prosperity - 0.01, 0.05, 1);
      s.unrest = clamp(s.unrest + 0.02, 0, 1);
      // heavy-handed dispersal can kill
      if (order > 0.15 && rand.chance(order * 0.25)) {
        const victims = citizensOf(p.settlement).filter((c) => c.protesting);
        if (victims.length && rand.chance(0.3)) {
          const v = victims[Math.floor(rand() * victims.length)];
          dieCitizen(v, 'was killed during a crackdown');
          P.curfewDeaths++;
          chronicle(`${v.name} killed as police cracked down in ${s.name}.`, 'bad');
          for (const c of citizensOf(p.settlement)) c.opinion = clamp(c.opinion - 6, -100, 100);
        }
      }
    }
    // dispersal / fizzle
    const calm = disc < 0.18 || rand.chance(order * 0.12) || rand.chance(0.03);
    if (calm) {
      P.protests.splice(i, 1);
      for (const c of citizensOf(p.settlement)) c.protesting = false;
      s.unrest = clamp(s.unrest - 0.2, 0, 1);
      chronicle(`The streets of ${s.name} are quiet again.`, 'info');
      emit('protest:end', { settlement: s });
    }
  }
}

function avgFear(sid) {
  const cs = citizensOf(sid);
  if (!cs.length) return 0;
  return cs.reduce((a, c) => a + c.fear, 0) / cs.length;
}

// -------------------------------------------------------------------- coup --

function coupAttempt(rand, general) {
  const P = G.politics;
  P.coupRisk = 0.1;
  const name = general ? general.name : 'A cabal of colonels';
  emit('modal', {
    title: '🚨 COUP ATTEMPT',
    text: `${name} has moved against you. Tanks are rolling toward the palace. Loyalist officers await your orders.`,
    choices: [
      {
        label: 'Fight — rally loyalists',
        fn: () => {
          const loyal = 0.35 + P.approval / 200 + (G.economy.budget.military > (G.military.upkeep || 1) ? 0.15 : 0);
          if (Math.random() < loyal) {
            chronicle('The coup collapsed. Loyalist troops held the palace.', 'good');
            notify('Coup crushed', 'The plotters face justice. The army is purged.', 'good');
            if (general) { general.status = 'prison'; general.releaseDay = Infinity; general.notable = null; }
            for (const u of G.military.units) if (u.nation === G.player.nation && Math.random() < 0.25) u.str *= 0.6;
            for (const c of G.citizens) if (c.nation === G.player.nation) c.fear = clamp(c.fear + 0.15, 0, 1);
          } else {
            G.gameOver = { reason: 'coup', text: 'The garrison changed sides at dawn. Your rule ends at gunpoint.' };
            emit('gameover', G.gameOver);
          }
        },
      },
      {
        label: 'Negotiate — concessions to the army',
        fn: () => {
          G.economy.budget.military *= 1.5;
          G.economy.treasury = Math.max(0, G.economy.treasury - 5e7);
          if (general) general.opinion = clamp(general.opinion + 40, -100, 100);
          chronicle('Bought off the plotters with budget and pardons.', 'bad');
          notify('Uneasy truce', 'The generals stand down — for now. The army budget balloons.', 'bad');
        },
      },
    ],
  });
}

// --------------------------------------------------------------- elections --

export function yearlyPoliticsTick(rand) {
  const P = G.politics;
  if (G.time.year >= P.termYear) {
    P.termYear = G.time.year + 4;
    if (G.laws.elections === 2 || G.player.gov === 'autocracy' || G.player.gov === 'monarchy' || G.player.gov === 'junta') {
      if (G.laws.elections !== 2) return;                    // no elections held
      chronicle('Another term begins without elections.', 'info');
      return;
    }
    holdElection(rand);
  }
}

function holdElection(rand) {
  const P = G.politics;
  let vote = P.approval / 100;
  if (G.laws.elections === 1) vote = clamp(vote + 0.13, 0, 0.98);      // "managed" ballots
  vote += rand.range(-0.05, 0.05);
  const share = Math.round(clamp(vote, 0.02, 0.98) * 100);
  if (share >= 50) {
    chronicle(`ELECTION WON with ${share}% of the vote.`, 'good');
    notify('🗳️ Re-elected', `The people grant another term (${share}%).`, 'good');
    for (const c of G.citizens) if (c.nation === G.player.nation && c.opinion > 0) c.opinion = clamp(c.opinion + 4, -100, 100);
  } else {
    emit('modal', {
      title: '🗳️ ELECTION LOST',
      text: `The opposition takes ${100 - share}% of the vote. The constitution says you must go.`,
      choices: [
        {
          label: 'Concede with dignity',
          fn: () => {
            G.gameOver = { reason: 'voted-out', text: `Voted out with ${share}% support. You leave through the front door — history will be kind.` };
            emit('gameover', G.gameOver);
          },
        },
        {
          label: 'Annul the results',
          fn: () => {
            G.player.gov = 'autocracy';
            G.laws.elections = 2;
            P.annulled = true;
            for (const c of G.citizens) {
              if (c.nation !== G.player.nation || c.status !== 'free') continue;
              c.opinion = clamp(c.opinion - 24, -100, 100);
              if (c.traits.brave > 0.6) c.rebel = c.opinion < -40;
            }
            for (const n of G.world.nations) {
              if (n.id !== G.player.nation) n.relations[G.player.nation] = clamp(n.relations[G.player.nation] - 30, -100, 100);
            }
            chronicle('THE ELECTION WAS ANNULLED. Democracy is suspended.', 'war');
            notify('⚠️ Self-coup', 'You cling to power. The world recoils; the streets simmer.', 'war');
          },
        },
      ],
    });
  }
}
