// sim/laws.js — the legal code. Each law is a lever the ruler can pull; the
// effects feed citizens (happiness/freedom/fear), the economy and diplomacy.
// Values are 0..N option indices into `options`.

import { G, chronicle } from '../core/state.js';
import { notify, emit } from '../core/bus.js';

/**
 * Law catalog. Effects are read by other modules through lawMods():
 *  freedom, order, happiness, growth, intlOpinion, manpower, science,
 *  fear, corruptionMod, faithMood
 */
export const LAWS = [
  {
    id: 'press', name: 'Press Freedom', icon: '📰',
    desc: 'Who controls the newspapers and broadcasts.',
    options: ['Free press', 'Licensed press', 'State media only'],
    fx: [{ freedom: 0.25, intl: 10 }, { freedom: 0, order: 0.05, intl: 0 }, { freedom: -0.3, order: 0.12, fear: 0.1, intl: -15, propaganda: 0.2 }],
  },
  {
    id: 'speech', name: 'Political Speech', icon: '🗣️',
    desc: 'Whether citizens may criticize the government.',
    options: ['Protected', 'Monitored', 'Criminalized'],
    fx: [{ freedom: 0.25, intl: 8 }, { freedom: -0.08, order: 0.06, fear: 0.05 }, { freedom: -0.35, order: 0.15, fear: 0.2, intl: -18 }],
  },
  {
    id: 'assembly', name: 'Right to Assemble', icon: '✊',
    desc: 'Legality of demonstrations and public gatherings.',
    options: ['Unrestricted', 'Permit required', 'Banned'],
    fx: [{ freedom: 0.2, protestEase: 0.3 }, { order: 0.05 }, { freedom: -0.25, order: 0.1, fear: 0.15, protestEase: -0.3, intl: -10 }],
  },
  {
    id: 'elections', name: 'Elections', icon: '🗳️',
    desc: 'Whether the people choose their ruler.',
    options: ['Free elections', 'Managed elections', 'Suspended'],
    fx: [{ freedom: 0.3, intl: 15 }, { freedom: -0.1, intl: -8, fear: 0.05 }, { freedom: -0.4, intl: -25, fear: 0.12 }],
  },
  {
    id: 'police', name: 'Security Apparatus', icon: '🕵️',
    desc: 'Reach of the police and secret services.',
    options: ['Civil police', 'Expanded powers', 'Secret police'],
    fx: [{ freedom: 0.1 }, { order: 0.12, freedom: -0.1, cost: 2e6 }, { order: 0.25, freedom: -0.3, fear: 0.3, intl: -12, cost: 6e6 }],
  },
  {
    id: 'conscription', name: 'Military Service', icon: '🎖️',
    desc: 'How the armed forces are manned.',
    options: ['Volunteer force', 'Selective draft', 'Universal conscription'],
    fx: [{ manpower: 1 }, { manpower: 2, happiness: -0.05 }, { manpower: 3.5, happiness: -0.14, growth: -0.02 }],
  },
  {
    id: 'taxenforce', name: 'Tax Enforcement', icon: '🧾',
    desc: 'How aggressively taxes are collected.',
    options: ['Lenient', 'Standard', 'Ruthless'],
    fx: [{ taxEff: 0.82, happiness: 0.04 }, { taxEff: 1 }, { taxEff: 1.15, happiness: -0.08, fear: 0.06 }],
  },
  {
    id: 'welfare', name: 'Welfare State', icon: '🏥',
    desc: 'Safety net for the poor, sick and old.',
    options: ['None', 'Basic relief', 'Cradle to grave'],
    fx: [{ growth: 0.01, poorMood: -0.2 }, { cost: 3e6, poorMood: 0.08 }, { cost: 11e6, poorMood: 0.25, growth: -0.012 }],
  },
  {
    id: 'religion', name: 'Religious Policy', icon: '⛪',
    desc: 'Relationship between faith and the state.',
    options: ['Secular state', 'State religion', 'Suppressed'],
    fx: [{}, { faithMood: 0.15, freedom: -0.08, science: -0.05 }, { faithMood: -0.3, freedom: -0.15, science: 0.04, fear: 0.08, intl: -8 }],
  },
  {
    id: 'borders', name: 'Border Policy', icon: '🛂',
    desc: 'Movement of people in and out of the country.',
    options: ['Open borders', 'Controlled', 'Sealed'],
    fx: [{ growth: 0.012, intl: 6 }, {}, { growth: -0.015, freedom: -0.15, intl: -10, fear: 0.05 }],
  },
  {
    id: 'curfew', name: 'Curfew', icon: '🌙',
    desc: 'Night-time movement restrictions.',
    options: ['None', 'Cities only', 'Nationwide'],
    fx: [{}, { order: 0.08, freedom: -0.12, nightlife: -0.5 }, { order: 0.15, freedom: -0.25, nightlife: -1, growth: -0.008 }],
  },
  {
    id: 'labor', name: 'Labor Law', icon: '⚒️',
    desc: 'Rights of workers versus industry.',
    options: ['Pro-worker', 'Balanced', 'Pro-industry'],
    fx: [{ workerMood: 0.15, growth: -0.008 }, {}, { workerMood: -0.15, growth: 0.015, richMood: 0.1 }],
  },
];

export function initLaws() {
  G.laws = {};
  for (const l of LAWS) G.laws[l.id] = l.id === 'elections' && G.player.gov !== 'democracy' ? 2 : l.id === 'taxenforce' || l.id === 'labor' ? 1 : 0;
}

export function lawValue(id) { return G.laws[id] ?? 0; }
export function lawFx(id) { const l = LAWS.find((x) => x.id === id); return l ? l.fx[lawValue(id)] : {}; }

/** Aggregate modifiers from the whole legal code. */
export function lawMods() {
  const m = {
    freedom: 0, order: 0, happiness: 0, growth: 0, intl: 0, manpower: 1,
    fear: 0, taxEff: 1, cost: 0, protestEase: 0, propaganda: 0, science: 0,
    poorMood: 0, workerMood: 0, richMood: 0, faithMood: 0, nightlife: 0,
  };
  for (const l of LAWS) {
    const fx = l.fx[G.laws[l.id] ?? 0];
    for (const k in fx) {
      if (k === 'taxEff' || k === 'manpower') m[k] *= fx[k];
      else m[k] = (m[k] || 0) + fx[k];
    }
  }
  return m;
}

/** Change a law. Citizens notice immediately; the world reacts. */
export function setLaw(id, value) {
  const law = LAWS.find((l) => l.id === id);
  if (!law || G.laws[id] === value) return;
  const old = G.laws[id];
  G.laws[id] = value;
  const tighter = value > old;
  chronicle(`Law changed: ${law.name} → ${law.options[value]}`, tighter ? 'bad' : 'good');
  notify('Decree signed', `${law.name}: ${law.options[value]}`, tighter ? 'bad' : 'good');

  // citizens form memories about laws that touch them
  for (const c of G.citizens) {
    if (c.nation !== G.player.nation || c.status !== 'free') continue;
    let react = (tighter ? -1 : 1) * (3 + Math.random() * 6);
    if (id === 'religion') react *= c.traits.faith > 0.6 ? 2.2 : 0.5;
    if (id === 'labor') react *= (c.job === 'worker' || c.job === 'farmer') ? 1.8 : 0.6;
    if (id === 'welfare') react *= c.wealth < 0.35 ? -1.8 : 0.4; // more welfare (a "tighter" index) delights the poor
    if (id === 'conscription') react *= c.age < 32 ? 1.8 : 0.7;
    if ((id === 'press' || id === 'speech' || id === 'elections') && c.traits.ambition > 0.6) react *= 1.7;
    c.opinion += react * (0.6 + Math.random() * 0.8);
    if (Math.abs(react) > 6) remember(c, `${tighter ? 'Resented' : 'Welcomed'} the new ${law.name.toLowerCase()} decree`, react);
  }
  // international reaction to repression
  if (law.fx[value].intl !== undefined) {
    const delta = (law.fx[value].intl || 0) - (law.fx[old].intl || 0);
    for (const n of G.world.nations) {
      if (n.id === G.player.nation) continue;
      n.relations[G.player.nation] = Math.max(-100, Math.min(100, n.relations[G.player.nation] + delta * (n.gov === 'democracy' ? 1 : 0.3)));
    }
  }
  emit('laws:changed', { id, value });
}

export function remember(c, text, impact) {
  c.memories.unshift({ day: G.time.day, text, impact: Math.round(impact) });
  if (c.memories.length > 8) c.memories.length = 8;
}
