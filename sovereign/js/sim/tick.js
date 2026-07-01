// sim/tick.js — the heartbeat. Converts elapsed real time into game hours and
// fires hourly / daily / monthly / yearly simulation passes in order.
// Kept free of any DOM/three.js so the whole simulation runs headless too.

import { makeRNG } from '../core/rng.js';
import { G, CFG, seasonIndex } from '../core/state.js';
import { emit } from '../core/bus.js';
import { dailyCitizensTick } from './citizens.js';
import { monthlyEconomyTick, pushSeries } from './economy.js';
import { hourlyMilitaryTick, dailyMilitaryTick, monthlyMilitaryTick } from './military.js';
import { monthlyDiplomacyTick, processTimers } from './nations.js';
import { dailyPoliticsTick, yearlyPoliticsTick } from './politics.js';
import { dailyEventsTick } from './events.js';

let simRand = null;
let hourCarry = 0;

export function initTick() {
  simRand = makeRNG(G.seed + ':runtime:' + G.time.day);
  hourCarry = 0;
}

export function getSimRand() { return simRand; }

/**
 * Advance the simulation by real-time delta.
 * @param {number} dt seconds of real time since last frame
 */
export function tick(dt) {
  if (!G.ready || G.gameOver || G.time.speed === 0) return;
  const secPerDay = CFG.DAY_SECONDS[G.time.speed] || 20;
  const gameHours = (dt / secPerDay) * 24;
  hourCarry += gameHours;
  G.time.hour += gameHours;

  // discrete hourly steps (cap to avoid spiral after a stall)
  let steps = 0;
  while (hourCarry >= 1 && steps < 30) {
    hourCarry -= 1;
    steps++;
    hourlyMilitaryTick(simRand);
    emit('tick:hour');
  }
  if (steps === 30) hourCarry = 0;

  while (G.time.hour >= 24) {
    G.time.hour -= 24;
    advanceDay();
  }
}

function advanceDay() {
  const prevSeason = seasonIndex();
  G.time.day++;
  G.time.dayOfYear++;
  if (G.time.dayOfYear >= CFG.SEASON_DAYS * 4) {
    G.time.dayOfYear = 0;
    G.time.year++;
    yearlyPoliticsTick(simRand);
    emit('tick:year');
  }
  if (seasonIndex() !== prevSeason) emit('season', seasonIndex());

  dailyCitizensTick(simRand);
  dailyPoliticsTick(simRand);
  dailyMilitaryTick(simRand);
  dailyEventsTick(simRand);
  processTimers();

  if (G.time.day % 30 === 0) {
    monthlyEconomyTick(simRand);
    monthlyMilitaryTick(simRand);
    monthlyDiplomacyTick(simRand);
    pushSeries(G.politics.approval);
    emit('tick:month');
  }
  emit('tick:day');
}

/** Force N days to pass instantly (used by tests & the "skip" debug key). */
export function skipDays(n) {
  for (let i = 0; i < n; i++) {
    for (let h = 0; h < 24; h++) hourlyMilitaryTick(simRand);
    advanceDay();
  }
}
