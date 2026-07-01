// ui/panels.js — content of every management window: dashboards, graphs,
// sliders, law cards, recruitment, research, diplomacy, the citizen registry
// with dossiers & justice actions, intelligence ops, chronicle and settings.

import { G, CFG, fmtMoney, fmtNum, chronicle, dateStr } from '../core/state.js';
import { on, emit, notify } from '../core/bus.js';
import { clamp } from '../core/rng.js';
import { LAWS, setLaw, lawMods } from '../sim/laws.js';
import { population, avgOpinion, playerCitizens, governmentAction, JUSTICE_ACTIONS, giveSpeech, settlementMood, nationalMoodFactors } from '../sim/citizens.js';
import { BUDGETS, setTax, setBudget, printMoney, capacityFactors } from '../sim/economy.js';
import { UNIT_TYPES, TECH_TREE, canRecruit, recruit, disband, setResearch, techCost, declareWar, atWar, airstrike } from '../sim/military.js';
import { sendEnvoy, denounce, offerAlliance, breakAlliance, toggleSanction, offerPeace, SPY_OPS, runSpyOp, nationsAdjacent } from '../sim/nations.js';
import { createWindow, openWindow, closeWindow, windowBody, onWindowOpen, isWindowOpen, ACTIONS, keyFor, bindKey } from './ui.js';
import { el, drawChart, confirmModal, fmtShort } from './widgets.js';
import { enterBuild, enterDemolish, BUILDABLE } from '../game/build.js';
import { setSelectedUnit, getSelectedUnit } from '../gfx/units.js';
import { audioState, saveVolumes } from '../game/audio.js';
import { env } from '../gfx/scene.js';

const refreshers = {};
const P = {};   // panel body refs

export function initPanels() {
  mkPanel('overview', 'National Overview', { x: 70, y: 70, w: 420 }, refreshOverview);
  mkPanel('economy', 'Economy & Treasury', { x: 120, y: 80, w: 470 }, refreshEconomy);
  mkPanel('budget', 'State Budget', { x: 160, y: 90, w: 430 }, refreshBudget);
  mkPanel('laws', 'Laws & Decrees', { x: 200, y: 70, w: 470 }, refreshLaws);
  mkPanel('construction', 'Construction Bureau', { x: 230, y: 90, w: 480 }, refreshConstruction);
  mkPanel('military', 'War Ministry', { x: 90, y: 60, w: 500 }, refreshMilitary);
  mkPanel('diplomacy', 'Foreign Ministry', { x: 140, y: 60, w: 500 }, refreshDiplomacy);
  mkPanel('citizens', 'Citizen Registry', { x: 180, y: 50, w: 500 }, refreshCitizens);
  mkPanel('intel', 'Intelligence Service', { x: 220, y: 80, w: 440 }, refreshIntel);
  mkPanel('log', 'Chronicle', { x: 260, y: 90, w: 420 }, refreshLog);
  mkPanel('settings', 'Settings', { x: 300, y: 80, w: 420 }, refreshSettings);
  createWindow('citizen', 'Dossier', { x: 380, y: 120, w: 360 });

  on('tick:day', () => refreshOpen(['overview', 'military', 'diplomacy', 'intel', 'log']));
  on('tick:month', () => refreshOpen(['economy', 'budget', 'citizens']));
  on('citizens:changed', () => refreshOpen(['citizens', 'overview']));
  on('units:changed', () => refreshOpen(['military']));
  on('ui:refresh', () => refreshOpen(Object.keys(refreshers)));
  on('select:citizen', (c) => showCitizen(c));
  on('research:done', () => refreshOpen(['military']));
  on('laws:changed', () => refreshOpen(['laws', 'overview']));
}

function mkPanel(id, title, opts, refresh) {
  const w = createWindow(id, title, opts);
  P[id] = w.body;
  refreshers[id] = refresh;
  onWindowOpen(id, refresh);
}

function refreshOpen(ids) {
  for (const id of ids) if (isWindowOpen(id)) refreshers[id]?.();
}

const barRow = (label, val, color = '#6fc2ff', text = '') => `
  <div class="row"><span class="row-label">${label}</span>
  <span class="bar"><span class="bar-fill" style="width:${clamp(val, 0, 100)}%; background:${color}"></span></span>
  <span class="row-val">${text || Math.round(val) + '%'}</span></div>`;

// ================================================================= OVERVIEW =

function refreshOverview() {
  const body = P.overview;
  const n = G.world.nations[G.player.nation];
  const pol = G.politics, eco = G.economy;
  const f = nationalMoodFactors();
  const moodRows = Object.entries({ 'Tax burden': f.taxPain, 'Public services': f.services, Security: f.security, Prosperity: f.prosperity, Freedom: f.freedom, Propaganda: f.propaganda })
    .map(([k, v]) => `<div class="kv"><span>${k}</span><b style="color:${v >= 0 ? '#7dff9a' : '#ff8d7d'}">${v >= 0 ? '+' : ''}${v.toFixed(0)}</b></div>`).join('');
  body.innerHTML = `
    <div class="panel-hero">
      <div class="hero-title">${n.name}</div>
      <div class="hero-sub">${G.player.title} ${G.player.ruler} · ${cap(G.player.gov)} · ${dateStr()}</div>
    </div>
    ${barRow('Approval', pol.approval, pol.approval > 50 ? '#5fce7d' : '#ce5f5f')}
    ${barRow('Stability', pol.stability * 100, '#6fc2ff')}
    ${barRow('Unrest', pol.nationalUnrest * 100, '#ff9d5f')}
    ${barRow('Corruption', pol.corruption * 100, '#c78ad6')}
    ${barRow('Rebellion', pol.rebellion * 100, '#ff5f5f')}
    <div class="divider"></div>
    <div class="grid2">
      <div class="kv"><span>Population</span><b>${fmtNum(population())}</b></div>
      <div class="kv"><span>GDP</span><b>${fmtMoney(eco.gdp)}</b></div>
      <div class="kv"><span>Growth</span><b>${(eco.growth * 100).toFixed(1)}%</b></div>
      <div class="kv"><span>Inflation</span><b>${(eco.inflation * 100).toFixed(1)}%</b></div>
      <div class="kv"><span>Food</span><b>${eco.resources.food.toFixed(0)}</b></div>
      <div class="kv"><span>Goods</span><b>${eco.resources.goods.toFixed(0)}</b></div>
      <div class="kv"><span>Power supply</span><b>${(capacityFactors().power * 100).toFixed(0)}%</b></div>
      <div class="kv"><span>Protests</span><b>${pol.protests.length}</b></div>
    </div>
    <div class="divider"></div>
    <div class="section-title">Why people feel this way</div>
    <div class="grid2">${moodRows}</div>
    <div class="divider"></div>
    <div class="section-title">Address the nation</div>
    <div class="btn-row">
      <button class="btn" data-speech="rally">🎤 Rally</button>
      <button class="btn" data-speech="reassure">🕊️ Reassure</button>
      <button class="btn" data-speech="threaten">⚠️ Threaten</button>
    </div>`;
  body.querySelectorAll('[data-speech]').forEach((b) => b.addEventListener('click', () => {
    giveSpeech(b.dataset.speech);
    notify('Address delivered', `The ${G.player.title} spoke to the nation.`, 'info');
    refreshOverview();
  }));
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ================================================================== ECONOMY =

function refreshEconomy() {
  const body = P.economy;
  const eco = G.economy;
  body.innerHTML = `
    <div class="grid2">
      <div class="kv"><span>Treasury</span><b>${fmtMoney(eco.treasury)}</b></div>
      <div class="kv"><span>National debt</span><b style="color:${eco.debt > 0 ? '#ff8d7d' : '#7dff9a'}">${fmtMoney(eco.debt)}</b></div>
      <div class="kv"><span>Monthly revenue</span><b>${fmtMoney(eco.lastRevenue)}</b></div>
      <div class="kv"><span>Monthly spending</span><b>${fmtMoney(eco.lastSpending)}</b></div>
      <div class="kv"><span>Trade income</span><b>${fmtMoney(eco.tradeIncome)}</b></div>
      <div class="kv"><span>Unemployment</span><b>${(eco.unemployment * 100).toFixed(1)}%</b></div>
    </div>
    <div class="charts">
      <canvas id="ch-gdp"></canvas><canvas id="ch-treasury"></canvas>
      <canvas id="ch-inflation"></canvas><canvas id="ch-approval"></canvas>
    </div>
    <div class="section-title">Taxation</div>
    <div id="tax-sliders"></div>
    <div class="section-title">The printing press</div>
    <div class="btn-row">
      <button class="btn" data-print="1e8">Print ₴100M</button>
      <button class="btn" data-print="5e8">Print ₴500M</button>
      <button class="btn danger" data-print="2e9">Print ₴2B</button>
    </div>
    <div class="hint">Printing funds the treasury instantly but devalues the currency — inflation follows.</div>`;
  drawChart(body.querySelector('#ch-gdp'), eco.series.gdp, { label: 'GDP', color: '#6fc2ff' });
  drawChart(body.querySelector('#ch-treasury'), eco.series.treasury, { label: 'Net treasury', color: '#7dce5f' });
  drawChart(body.querySelector('#ch-inflation'), eco.series.inflation, { label: 'Inflation %', color: '#ff9d5f', format: (v) => v.toFixed(1) + '%' });
  drawChart(body.querySelector('#ch-approval'), eco.series.approval, { label: 'Approval %', color: '#ce5f9d', format: (v) => v.toFixed(0) + '%' });
  const taxes = [['income', 'Income tax'], ['corporate', 'Corporate tax'], ['sales', 'Sales tax']];
  const slidersEl = body.querySelector('#tax-sliders');
  for (const [key, label] of taxes) {
    const row = el('div', 'slider-row');
    row.innerHTML = `<span class="row-label">${label}</span>
      <input type="range" min="0" max="70" value="${Math.round(eco.taxes[key] * 100)}">
      <span class="row-val">${Math.round(eco.taxes[key] * 100)}%</span>`;
    const input = row.querySelector('input');
    input.addEventListener('input', () => {
      setTax(key, input.value / 100);
      row.querySelector('.row-val').textContent = input.value + '%';
    });
    slidersEl.append(row);
  }
  body.querySelectorAll('[data-print]').forEach((b) => b.addEventListener('click', () => {
    printMoney(+b.dataset.print);
    refreshEconomy();
    emit('ui:refresh');
  }));
}

// =================================================================== BUDGET =

function refreshBudget() {
  const body = P.budget;
  const eco = G.economy;
  let total = 0;
  for (const k in eco.budget) total += eco.budget[k];
  body.innerHTML = `
    <div class="kv"><span>Total monthly budget</span><b id="budget-total">${fmtMoney(total + (G.military.upkeep || 0))}</b></div>
    <div class="kv"><span>Army upkeep (fixed)</span><b>${fmtMoney(G.military.upkeep || 0)}</b></div>
    <div class="hint">Spending shapes the nation: education & science drive growth and research, healthcare fights epidemics, security suppresses unrest, propaganda buys love.</div>
    <div id="budget-sliders"></div>`;
  const slidersEl = body.querySelector('#budget-sliders');
  for (const [key, label, icon] of BUDGETS) {
    const row = el('div', 'slider-row');
    const val = eco.budget[key];
    row.innerHTML = `<span class="row-label">${icon} ${label}</span>
      <input type="range" min="0" max="120" value="${Math.round(val / 1e6)}">
      <span class="row-val">${fmtMoney(val)}</span>`;
    const input = row.querySelector('input');
    input.addEventListener('input', () => {
      setBudget(key, input.value * 1e6);
      row.querySelector('.row-val').textContent = fmtMoney(input.value * 1e6);
      let t = 0; for (const k in eco.budget) t += eco.budget[k];
      body.querySelector('#budget-total').textContent = fmtMoney(t + (G.military.upkeep || 0));
    });
    slidersEl.append(row);
  }
}

// ===================================================================== LAWS =

function refreshLaws() {
  const body = P.laws;
  body.innerHTML = '<div class="hint">Each decree takes effect immediately. Citizens remember.</div>';
  for (const law of LAWS) {
    const cur = G.laws[law.id] ?? 0;
    const card = el('div', 'law-card');
    card.innerHTML = `<div class="law-head"><span class="law-icon">${law.icon}</span>
      <div><div class="law-name">${law.name}</div><div class="law-desc">${law.desc}</div></div></div>
      <div class="law-opts"></div>`;
    const opts = card.querySelector('.law-opts');
    law.options.forEach((opt, i) => {
      const b = el('button', 'law-opt' + (i === cur ? ' active' : ''), opt);
      b.addEventListener('click', () => {
        if (i === cur) return;
        setLaw(law.id, i);
        refreshLaws();
        emit('ui:refresh');
      });
      opts.append(b);
    });
    body.append(card);
  }
}

// ============================================================== CONSTRUCTION =

function refreshConstruction() {
  const body = P.construction;
  body.innerHTML = `
    <div class="hint">Pick a blueprint, then click the map inside your borders. Roads & railways are laid point-to-point (water becomes bridges). G rotates.</div>
    <div class="build-grid"></div>
    <div class="btn-row"><button class="btn danger" id="demolish-btn">🧨 Demolish mode</button></div>`;
  const grid = body.querySelector('.build-grid');
  for (const b of BUILDABLE) {
    const cardEl = el('button', 'build-card');
    cardEl.innerHTML = `<span class="build-icon">${b.icon}</span><span class="build-name">${b.name}</span>
      <span class="build-cost">${fmtMoney(b.cost)}${b.per ? '<small>/' + b.per.split(' ')[1] + '</small>' : ''}</span>`;
    cardEl.title = `${b.desc} — builds in ${b.days} days`;
    cardEl.addEventListener('click', () => {
      enterBuild(b.type);
      notify('Blueprint selected', `${b.name}: ${b.desc}`, 'info');
    });
    grid.append(cardEl);
  }
  body.querySelector('#demolish-btn').addEventListener('click', enterDemolish);
}

// ================================================================== MILITARY =

function refreshMilitary() {
  const body = P.military;
  const m = G.military;
  const my = m.units.filter((u) => u.nation === G.player.nation);
  const sel = getSelectedUnit();
  const wars = m.wars.filter((w) => w.a === G.player.nation || w.b === G.player.nation);

  body.innerHTML = `
    <div class="grid2">
      <div class="kv"><span>Divisions</span><b>${my.length}</b></div>
      <div class="kv"><span>Manpower</span><b>${Math.floor(m.manpower)}k</b></div>
      <div class="kv"><span>Upkeep</span><b>${fmtMoney(m.upkeep || 0)}/mo</b></div>
      <div class="kv"><span>Wars</span><b>${wars.length}</b></div>
    </div>
    ${wars.map((w) => {
      const enemy = G.world.nations[w.a === G.player.nation ? w.b : w.a];
      const score = w.a === G.player.nation ? w.score : -w.score;
      return `<div class="war-row">⚔️ vs <b>${enemy.name}</b> — war score <b style="color:${score >= 0 ? '#7dff9a' : '#ff8d7d'}">${score.toFixed(0)}</b>
        <div class="btn-row">
        <button class="btn" data-peace="white" data-n="${enemy.id}">Offer white peace</button>
        <button class="btn" data-peace="annex" data-n="${enemy.id}">Demand annexation</button>
        <button class="btn danger" data-peace="surrender" data-n="${enemy.id}">Surrender</button></div></div>`;
    }).join('')}
    <div class="section-title">Recruitment</div>
    <div class="btn-row" id="recruit-row"></div>
    <div class="section-title">Divisions ${sel ? `— selected: <b>${sel.name}</b> (right-click map to move)` : '<small>(select one, then right-click the map to issue movement orders)</small>'}</div>
    <div class="unit-list"></div>
    <div class="btn-row">
      <button class="btn danger" id="airstrike-btn">✈️ Order airstrike (₴4M — click target on map)</button>
    </div>
    <div class="section-title">Research ${m.research.current ? `— <b>${TECH_TREE[m.research.current].name}</b> ${Math.round(m.research.progress / techCost(m.research.current) * 100)}%` : '<small>(pick a project)</small>'}</div>
    <div class="hint">Research speed: ${m.research.points.toFixed(1)} pts/month (science budget + labs & universities)</div>
    <div class="tech-grid"></div>`;

  const rr = body.querySelector('#recruit-row');
  for (const [type, t] of Object.entries(UNIT_TYPES)) {
    const err = canRecruit(type);
    const b = el('button', 'btn' + (err ? ' disabled' : ''), `${t.icon} ${t.name}<small>${fmtMoney(t.cost)} · ${t.manpower}k men</small>`);
    b.title = err || `Upkeep ${fmtMoney(t.upkeep)}/mo`;
    b.addEventListener('click', () => { if (!canRecruit(type)) { recruit(type); refreshMilitary(); emit('ui:refresh'); } else notify('Cannot recruit', canRecruit(type), 'bad'); });
    rr.append(b);
  }

  const list = body.querySelector('.unit-list');
  for (const u of my) {
    const t = UNIT_TYPES[u.type];
    const row = el('div', 'unit-row' + (sel?.id === u.id ? ' selected' : ''));
    row.innerHTML = `<span>${t.icon} ${u.name}</span>
      <span class="unit-stats">str ${u.str.toFixed(0)} · morale ${u.morale.toFixed(0)} · supply ${(u.supply * 100).toFixed(0)}%</span>
      <span class="unit-actions"><button class="mini-btn" data-focus="${u.id}">📍</button><button class="mini-btn" data-disband="${u.id}">✕</button></span>`;
    row.addEventListener('click', (e) => {
      if (e.target.dataset.focus || e.target.dataset.disband) return;
      setSelectedUnit(sel?.id === u.id ? -1 : u.id);
      refreshMilitary();
    });
    list.append(row);
  }
  body.querySelectorAll('[data-focus]').forEach((b) => b.addEventListener('click', () => {
    const u = my.find((x) => x.id === +b.dataset.focus);
    if (u) { setSelectedUnit(u.id); emit('focus:map', { x: u.x, z: u.z }); refreshMilitary(); }
  }));
  body.querySelectorAll('[data-disband]').forEach((b) => b.addEventListener('click', () => {
    confirmModal('Disband division?', 'Some manpower returns to the pool.', () => { disband(+b.dataset.disband); });
  }));
  body.querySelectorAll('[data-peace]').forEach((b) => b.addEventListener('click', () => {
    offerPeace(+b.dataset.n, b.dataset.peace);
    refreshMilitary(); emit('ui:refresh');
  }));
  body.querySelector('#airstrike-btn').addEventListener('click', () => {
    emit('armstrike');           // main.js arms targeting mode
    notify('Airstrike armed', 'Click the target on the map.', 'war');
  });

  const tg = body.querySelector('.tech-grid');
  for (const [key, t] of Object.entries(TECH_TREE)) {
    const lvl = m.techs[key] || 0;
    const cost = techCost(key);
    const active = m.research.current === key;
    const cardEl = el('button', 'tech-card' + (active ? ' active' : ''));
    cardEl.innerHTML = `<span class="build-icon">${t.icon}</span><span class="build-name">${t.name}</span>
      <span class="tech-lvl">Lv ${lvl}</span><span class="build-cost">${cost.toFixed(0)} pts</span>`;
    cardEl.title = t.desc;
    cardEl.addEventListener('click', () => { setResearch(key); refreshMilitary(); });
    tg.append(cardEl);
  }
}

// ================================================================= DIPLOMACY =

function refreshDiplomacy() {
  const body = P.diplomacy;
  const us = G.player.nation;
  const usN = G.world.nations[us];
  body.innerHTML = '<div class="hint">Every leader has a personality. Gifts warm them, sanctions and spycraft chill them, weakness invites them.</div>';
  for (const n of G.world.nations) {
    if (n.id === us) continue;
    const dead = G.military.capitulated.includes(n.id);
    const rel = n.relations[us];
    const war = atWar(us, n.id);
    const allied = usN.alliances.includes(n.id);
    const sanctioned = usN.sanctions.includes(n.id);
    const intel = G.intel.intelOn[n.id] || 0;
    const cardEl = el('div', 'nation-card' + (dead ? ' dead' : ''));
    cardEl.innerHTML = `
      <div class="nation-head">
        <span class="nation-dot" style="background:#${n.color.toString(16).padStart(6, '0')}"></span>
        <div><div class="law-name">${n.name} ${dead ? '(fallen)' : ''}</div>
        <div class="law-desc">${n.title} ${n.leader.name} · ${cap(n.gov)}${intel > 0.3 ? ` · <i>${n.leader.aggression > 0.6 ? 'aggressive' : 'cautious'}${n.leader.paranoia > 0.6 ? ', paranoid' : ''}, ${n.leader.greed > 0.6 ? 'greedy' : 'principled'}</i>` : ''}</div></div>
        <div class="rel-badge" style="color:${rel > 20 ? '#7dff9a' : rel > -25 ? '#ffd97a' : '#ff7d7d'}">${war ? '⚔️ WAR' : rel.toFixed(0)}</div>
      </div>
      ${barRow('Relations', (rel + 100) / 2, rel > 0 ? '#5fce7d' : '#ce5f5f', rel.toFixed(0))}
      ${intel > 0.3 ? `<div class="law-desc">Intel: ~${G.military.units.filter((u) => u.nation === n.id).length} divisions · treasury ${fmtMoney(n.treasury)} · GDP ${fmtMoney(n.gdp)}</div>` : '<div class="law-desc">Intel: minimal — infiltrate to reveal their hand.</div>'}
      ${dead ? '' : `<div class="btn-row">
        <button class="btn" data-act="envoy">🎁 Envoy (₴5M)</button>
        <button class="btn" data-act="denounce">📢 Denounce</button>
        ${allied ? '<button class="btn" data-act="break">💔 Break alliance</button>' : '<button class="btn" data-act="ally">🤝 Alliance</button>'}
        <button class="btn ${sanctioned ? '' : 'warn'}" data-act="sanction">${sanctioned ? '✅ Lift sanctions' : '🚫 Sanction'}</button>
        ${war ? '' : '<button class="btn danger" data-act="war">⚔️ Declare war</button>'}
      </div>
      <div class="btn-row">${SPY_OPS.map((op) => `<button class="btn spy" data-spy="${op.id}" title="${op.desc}">🕵️ ${op.name} (${fmtMoney(op.cost)})</button>`).join('')}</div>`}`;
    cardEl.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
      const act = b.dataset.act;
      if (act === 'envoy') sendEnvoy(n.id);
      if (act === 'denounce') denounce(n.id);
      if (act === 'ally') offerAlliance(n.id);
      if (act === 'break') breakAlliance(n.id);
      if (act === 'sanction') toggleSanction(n.id);
      if (act === 'war') confirmModal(`Declare war on ${n.name}?`, 'Blood, treasure and history will judge this.', () => { declareWar(us, n.id, 'our ambition'); refreshDiplomacy(); emit('ui:refresh'); }, 'Declare War');
      refreshDiplomacy(); emit('ui:refresh');
    }));
    cardEl.querySelectorAll('[data-spy]').forEach((b) => b.addEventListener('click', () => {
      runSpyOp(n.id, b.dataset.spy);
      refreshDiplomacy(); refreshOpen(['intel']); emit('ui:refresh');
    }));
    body.append(cardEl);
  }
}

// ================================================================== CITIZENS =

let citizenFilter = '';
let citizenSort = 'notable';

function refreshCitizens() {
  const body = P.citizens;
  const people = playerCitizens().filter((c) => c.status !== 'dead');
  const shown = people
    .filter((c) => !citizenFilter || c.name.toLowerCase().includes(citizenFilter) || c.job.includes(citizenFilter) || (c.notableTitle || '').toLowerCase().includes(citizenFilter))
    .sort((a, b) => citizenSort === 'notable' ? (b.notable ? 1 : 0) - (a.notable ? 1 : 0) || b.opinion - a.opinion :
      citizenSort === 'angry' ? a.opinion - b.opinion : b.opinion - a.opinion)
    .slice(0, 60);
  body.innerHTML = `
    <div class="kv"><span>Simulated citizens</span><b>${people.length} (each ≈ ${fmtNum(CFG.POP_SCALE)} people)</b></div>
    <div class="kv"><span>Average opinion of you</span><b style="color:${avgOpinion() > 0 ? '#7dff9a' : '#ff8d7d'}">${avgOpinion().toFixed(1)}</b></div>
    <div class="filter-row">
      <input id="cit-filter" placeholder="Search name, job, title…" value="${citizenFilter}">
      <select id="cit-sort">
        <option value="notable" ${citizenSort === 'notable' ? 'selected' : ''}>Notables first</option>
        <option value="angry" ${citizenSort === 'angry' ? 'selected' : ''}>Angriest first</option>
        <option value="loyal" ${citizenSort === 'loyal' ? 'selected' : ''}>Most loyal first</option>
      </select>
    </div>
    <div class="cit-list"></div>
    <div class="hint">Click a person here — or click them on the street — to open their dossier. In first-person mode, walk up to anyone.</div>`;
  const list = body.querySelector('.cit-list');
  for (const c of shown) {
    const row = el('div', 'cit-row' + (c.notable ? ' notable' : ''));
    const s = G.world.settlements[c.home];
    row.innerHTML = `<canvas class="cit-face" width="34" height="34"></canvas>
      <div class="cit-info"><b>${c.name}</b>${c.notable ? ` <span class="tag">${c.notableTitle}</span>` : ''}${c.status === 'prison' ? ' <span class="tag bad">imprisoned</span>' : ''}${c.rebel ? ' <span class="tag bad">dissident</span>' : ''}
      <div class="law-desc">${c.job}, ${c.age} · ${s ? s.name : '—'}</div></div>
      <div class="rel-badge" style="color:${c.opinion > 10 ? '#7dff9a' : c.opinion > -25 ? '#ffd97a' : '#ff7d7d'}">${c.opinion.toFixed(0)}</div>`;
    drawFace(row.querySelector('canvas'), c);
    row.addEventListener('click', () => showCitizen(c));
    list.append(row);
  }
  body.querySelector('#cit-filter').addEventListener('input', (e) => { citizenFilter = e.target.value.toLowerCase(); refreshCitizens(); });
  body.querySelector('#cit-sort').addEventListener('change', (e) => { citizenSort = e.target.value; refreshCitizens(); });
}

/** Procedural pixel portrait from citizen identity. */
export function drawFace(canvas, c) {
  const ctx = canvas.getContext('2d');
  const S = canvas.width;
  let h = c.id * 2654435761 >>> 0;
  const next = () => (h = (h * 1103515245 + 12345) >>> 0) / 4294967296;
  const skin = ['#e8c39e', '#d9a875', '#c68f5e', '#a9714b', '#8d5a3a'][Math.floor(next() * 5)];
  const hair = ['#2a2020', '#4a3320', '#7a5a30', '#a88a50', '#888888', '#c04a2a'][Math.floor(next() * 6)];
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = c.notable ? '#453a18' : '#232a38';
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = skin;
  ctx.fillRect(S * 0.25, S * 0.2, S * 0.5, S * 0.55);
  ctx.fillStyle = hair;
  const hairStyle = next();
  ctx.fillRect(S * 0.22, S * 0.12, S * 0.56, S * (0.14 + hairStyle * 0.12));
  if (c.sex === 'f' && hairStyle > 0.4) { ctx.fillRect(S * 0.18, S * 0.2, S * 0.1, S * 0.4); ctx.fillRect(S * 0.72, S * 0.2, S * 0.1, S * 0.4); }
  ctx.fillStyle = '#1a1a22';
  ctx.fillRect(S * 0.35, S * 0.42, S * 0.08, S * 0.08);
  ctx.fillRect(S * 0.57, S * 0.42, S * 0.08, S * 0.08);
  if (c.age > 55) { ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(S * 0.22, S * 0.12, S * 0.56, S * 0.06); }
  if (next() > 0.6 && c.sex === 'm') { ctx.fillStyle = hair; ctx.fillRect(S * 0.35, S * 0.62, S * 0.3, S * 0.07); }
  ctx.fillStyle = '#88342e';
  ctx.fillRect(S * 0.42, S * 0.66, S * 0.16, S * 0.03);
}

function showCitizen(c) {
  const body = windowBody('citizen');
  const s = G.world.settlements[c.home];
  const spouse = c.family.spouse >= 0 ? G.citizens[c.family.spouse] : null;
  const mems = c.memories.slice(0, 6).map((m) => `<div class="mem ${m.impact < 0 ? 'bad' : 'good'}">· ${m.text} <small>(day ${m.day})</small></div>`).join('') || '<div class="law-desc">No strong memories yet.</div>';
  body.innerHTML = `
    <div class="cit-hero">
      <canvas width="72" height="72"></canvas>
      <div><div class="hero-title small">${c.name}</div>
      <div class="law-desc">${c.notable ? c.notableTitle + ' · ' : ''}${c.job}, age ${c.age} · ${c.personality}</div>
      <div class="law-desc">${s ? 'Lives in ' + s.name : ''} ${spouse ? '· married to ' + spouse.name : ''} ${c.family.children ? '· ' + c.family.children + ' children' : ''}</div>
      <div class="law-desc">Status: <b>${c.status}</b>${c.rebel ? ' · <span style="color:#ff7d7d">dissident</span>' : ''}</div></div>
    </div>
    ${barRow('Opinion of you', (c.opinion + 100) / 2, c.opinion > 0 ? '#5fce7d' : '#ce5f5f', c.opinion.toFixed(0))}
    ${barRow('Happiness', c.happiness, '#6fc2ff')}
    ${barRow('Fear', c.fear * 100, '#c78ad6')}
    ${barRow('Wealth', c.wealth * 100, '#d6c23c')}
    <div class="section-title">Memories</div>
    ${mems}
    <div class="section-title">Government action</div>
    <div class="btn-row" id="justice-row"></div>
    <div class="hint">Actions ripple through families, friends and foreign embassies.</div>`;
  drawFace(body.querySelector('canvas'), c);
  const row = body.querySelector('#justice-row');
  const acts = c.status === 'prison' ? ['pardon', 'execute', 'exile'] :
    c.status === 'exile' || c.status === 'dead' ? [] : ['honor', 'arrest', 'imprison', 'exile', 'execute'];
  for (const a of acts) {
    const info = JUSTICE_ACTIONS[a];
    const b = el('button', 'btn ' + (a === 'execute' ? 'danger' : a === 'honor' || a === 'pardon' ? '' : 'warn'), `${info.label}${info.cost ? `<small>${fmtMoney(info.cost)}</small>` : ''}`);
    b.addEventListener('click', () => {
      const doIt = () => { governmentAction(c.id, a); showCitizen(c); refreshOpen(['citizens']); emit('ui:refresh'); };
      if (a === 'execute') confirmModal(`Execute ${c.name}?`, c.notable ? `Executing the ${c.notableTitle} will echo around the world.` : 'The family will never forgive. The streets will hear of it.', doIt, 'Sign the order');
      else doIt();
    });
    row.append(b);
  }
  openWindow('citizen');
}

// ===================================================================== INTEL =

function refreshIntel() {
  const body = P.intel;
  const I = G.intel;
  body.innerHTML = `
    <div class="grid2">
      <div class="kv"><span>Operatives ready</span><b>${I.agents}/${I.maxAgents}</b></div>
      <div class="kv"><span>Incidents caused</span><b>${I.incidents}</b></div>
    </div>
    <div class="hint">Operations are launched from the Foreign Ministry panel, per nation. Captured spies become diplomatic incidents — or wars.</div>
    <div class="section-title">Field reports</div>
    ${I.reports.map((r) => `<div class="mem">· <small>day ${r.day}</small> ${r.text}</div>`).join('') || '<div class="law-desc">No reports. Deploy operatives abroad.</div>'}`;
}

// ======================================================================= LOG =

function refreshLog() {
  const body = P.log;
  body.innerHTML = G.log.slice(0, 80).map((l) =>
    `<div class="log-row ${l.kind}"><small>d${l.day}</small> ${l.text}</div>`).join('') || '<div class="law-desc">History awaits.</div>';
}

// ================================================================== SETTINGS =

let rebinding = null;

function refreshSettings() {
  const body = P.settings;
  body.innerHTML = `
    <div class="section-title">Audio</div>
    <div id="vol-sliders"></div>
    <div class="section-title">Graphics</div>
    <div class="btn-row">
      <button class="btn" id="tgl-shadows">${env.quality.shadows ? '✅' : '⬜'} Shadows</button>
      <button class="btn" id="tgl-particles">${env.quality.particles ? '✅' : '⬜'} Particles</button>
    </div>
    <div class="section-title">Hotkeys <small>(click to rebind)</small></div>
    <div id="key-list"></div>
    <div class="section-title">Game</div>
    <div class="btn-row">
      <button class="btn" id="save-btn">💾 Save game</button>
      <button class="btn warn" id="menu-btn">🏠 Main menu</button>
    </div>`;
  const vols = body.querySelector('#vol-sliders');
  for (const key of ['master', 'music', 'sfx', 'ambient']) {
    const row = el('div', 'slider-row');
    row.innerHTML = `<span class="row-label">${cap(key)}</span>
      <input type="range" min="0" max="100" value="${Math.round(audioState.volumes[key] * 100)}">
      <span class="row-val">${Math.round(audioState.volumes[key] * 100)}%</span>`;
    const input = row.querySelector('input');
    input.addEventListener('input', () => {
      audioState.volumes[key] = input.value / 100;
      row.querySelector('.row-val').textContent = input.value + '%';
      saveVolumes();
    });
    vols.append(row);
  }
  body.querySelector('#tgl-shadows').addEventListener('click', (e) => {
    env.quality.shadows = !env.quality.shadows;
    env.renderer.shadowMap.enabled = env.quality.shadows;
    refreshSettings();
  });
  body.querySelector('#tgl-particles').addEventListener('click', () => {
    env.quality.particles = !env.quality.particles;
    refreshSettings();
  });
  const keyList = body.querySelector('#key-list');
  for (const action in ACTIONS) {
    const row = el('div', 'key-row');
    row.innerHTML = `<span>${ACTIONS[action].label}</span><button class="mini-btn key-btn">${rebinding === action ? 'press a key…' : keyFor(action)}</button>`;
    row.querySelector('button').addEventListener('click', () => {
      rebinding = action;
      refreshSettings();
      const once = (e) => {
        e.preventDefault();
        bindKey(action, e.code);
        rebinding = null;
        window.removeEventListener('keydown', once, true);
        refreshSettings();
      };
      window.addEventListener('keydown', once, true);
    });
    keyList.append(row);
  }
  body.querySelector('#save-btn').addEventListener('click', () => emit('game:save'));
  body.querySelector('#menu-btn').addEventListener('click', () => confirmModal('Return to menu?', 'Unsaved progress will be lost.', () => location.reload()));
}
