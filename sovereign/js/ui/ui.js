// ui/ui.js — chrome of the game: draggable windows, the dock, the top status
// bar, time controls and a fully rebindable hotkey system.

import { G, dateStr, fmtMoney, fmtNum, SEASONS, seasonIndex } from '../core/state.js';
import { on, emit } from '../core/bus.js';
import { population, avgOpinion } from '../sim/citizens.js';
import { env } from '../gfx/scene.js';
import { el } from './widgets.js';
import { setMode, cycleMode, cam } from '../game/cameras.js';
import { setTerritoryVisible, territoryVisible } from '../gfx/terrain.js';
import { enterBuild, enterDemolish, cancelBuild, build, rotateGhost } from '../game/build.js';

const windows = new Map();      // id → {el, body, open}
let zTop = 100;
let windowsRoot, dockRoot;

// ------------------------------------------------------------------ windows --

export function createWindow(id, title, { x = 120, y = 90, w = 380 } = {}) {
  if (windows.has(id)) return windows.get(id);
  const win = el('div', 'window');
  win.style.cssText = `left:${x}px; top:${y}px; width:${w}px; z-index:${++zTop}; display:none;`;
  const head = el('div', 'window-head');
  head.append(el('div', 'window-title', title));
  const closeBtn = el('button', 'window-close', '✕');
  head.append(closeBtn);
  const body = el('div', 'window-body');
  win.append(head, body);
  windowsRoot.append(win);

  const rec = { el: win, body, id, isOpen: false, onOpen: null };
  closeBtn.addEventListener('click', () => closeWindow(id));
  win.addEventListener('mousedown', () => { win.style.zIndex = ++zTop; });

  // dragging
  let drag = null;
  head.addEventListener('mousedown', (e) => {
    if (e.target === closeBtn) return;
    drag = { dx: e.clientX - win.offsetLeft, dy: e.clientY - win.offsetTop };
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (!drag) return;
    win.style.left = Math.max(0, Math.min(window.innerWidth - 120, e.clientX - drag.dx)) + 'px';
    win.style.top = Math.max(0, Math.min(window.innerHeight - 60, e.clientY - drag.dy)) + 'px';
  });
  window.addEventListener('mouseup', () => { drag = null; });

  windows.set(id, rec);
  return rec;
}

export function openWindow(id) {
  const w = windows.get(id);
  if (!w) return;
  w.el.style.display = 'flex';
  w.el.style.zIndex = ++zTop;
  w.isOpen = true;
  w.onOpen && w.onOpen();
  dockRoot?.querySelector(`[data-win="${id}"]`)?.classList.add('active');
  emit('sfx', 'open');
}

export function closeWindow(id) {
  const w = windows.get(id);
  if (!w) return;
  w.el.style.display = 'none';
  w.isOpen = false;
  dockRoot?.querySelector(`[data-win="${id}"]`)?.classList.remove('active');
  emit('sfx', 'close');
}

export function toggleWindow(id) {
  const w = windows.get(id);
  if (!w) return;
  w.isOpen ? closeWindow(id) : openWindow(id);
}

export function isWindowOpen(id) { return windows.get(id)?.isOpen || false; }
export function windowBody(id) { return windows.get(id)?.body; }
export function onWindowOpen(id, fn) { const w = windows.get(id); if (w) w.onOpen = fn; }

// -------------------------------------------------------------------- dock --

const DOCK_ITEMS = [
  ['overview', '🏛️', 'Overview'], ['economy', '📈', 'Economy'], ['budget', '💰', 'Budget'],
  ['laws', '⚖️', 'Laws'], ['construction', '🏗️', 'Construction'], ['military', '🪖', 'Military'],
  ['diplomacy', '🌐', 'Diplomacy'], ['citizens', '👥', 'Citizens'], ['intel', '🕵️', 'Intelligence'],
  ['log', '📜', 'Chronicle'], ['settings', '⚙️', 'Settings'],
];

function buildDock() {
  for (const [id, icon, title] of DOCK_ITEMS) {
    const b = el('button', 'dock-btn', `<span class="dock-icon">${icon}</span><span class="dock-label">${title}</span>`);
    b.dataset.win = id;
    b.title = title;
    b.addEventListener('click', () => toggleWindow(id));
    dockRoot.append(b);
  }
}

// ------------------------------------------------------------------ top bar --

let bar = {};

function buildTopBar(root) {
  const mk = (id, icon, tip) => {
    const s = el('div', 'stat', `<span class="stat-icon">${icon}</span><span class="stat-val" id="tb-${id}">—</span>`);
    s.title = tip;
    root.append(s);
    return s.querySelector('.stat-val');
  };
  const flag = el('div', 'nation-flag');
  root.append(flag);
  bar.flag = flag;
  bar.name = el('div', 'nation-name', '—');
  root.append(bar.name);
  bar.treasury = mk('treasury', '💰', 'Treasury (national funds)');
  bar.income = mk('income', '📊', 'Monthly balance');
  bar.pop = mk('pop', '👥', 'Population');
  bar.approval = mk('approval', '❤️', 'Approval rating');
  bar.unrest = mk('unrest', '🔥', 'National unrest');
  bar.manpower = mk('manpower', '🎖️', 'Military manpower');
  bar.war = el('div', 'stat war-stat', '⚔️ AT WAR');
  bar.war.style.display = 'none';
  root.append(bar.war);
}

export function refreshTopBar() {
  if (!G.ready) return;
  const n = G.world.nations[G.player.nation];
  bar.name.textContent = n.name;
  bar.flag.style.background = `linear-gradient(180deg, #${n.flag[0].toString(16).padStart(6, '0')} 50%, #${n.flag[1].toString(16).padStart(6, '0')} 50%)`;
  bar.treasury.textContent = fmtMoney(G.economy.treasury) + (G.economy.debt > 0 ? ` (−${fmtMoney(G.economy.debt)})` : '');
  const bal = G.economy.lastRevenue - G.economy.lastSpending;
  bar.income.textContent = (bal >= 0 ? '+' : '') + fmtMoney(bal);
  bar.income.style.color = bal >= 0 ? '#7dff9a' : '#ff7d7d';
  bar.pop.textContent = fmtNum(population());
  bar.approval.textContent = G.politics.approval.toFixed(0) + '%';
  bar.approval.style.color = G.politics.approval > 55 ? '#7dff9a' : G.politics.approval > 35 ? '#ffd97a' : '#ff7d7d';
  bar.unrest.textContent = (G.politics.nationalUnrest * 100).toFixed(0) + '%';
  bar.unrest.style.color = G.politics.nationalUnrest < 0.25 ? '#9fb4cc' : G.politics.nationalUnrest < 0.5 ? '#ffd97a' : '#ff7d7d';
  bar.manpower.textContent = Math.floor(G.military.manpower) + 'k';
  bar.war.style.display = G.military.wars.some((w) => w.a === G.player.nation || w.b === G.player.nation) ? 'flex' : 'none';
}

// ---------------------------------------------------------------- time bar --

let timeEls = {};

function buildTimeBar(root) {
  timeEls.date = el('div', 'time-date', '—');
  timeEls.season = el('div', 'time-season', '');
  timeEls.clock = el('div', 'time-clock', '');
  const speeds = el('div', 'time-speeds');
  timeEls.speedBtns = [];
  const mkBtn = (label, speed, tip) => {
    const b = el('button', 'time-btn', label);
    b.title = tip;
    b.addEventListener('click', () => setSpeed(speed));
    speeds.append(b);
    timeEls.speedBtns[speed] = b;
  };
  mkBtn('⏸', 0, 'Pause (Space)');
  mkBtn('▶', 1, 'Normal speed (1)');
  mkBtn('▶▶', 2, 'Fast (2)');
  mkBtn('▶▶▶', 3, 'Very fast (3)');
  root.append(timeEls.date, timeEls.season, timeEls.clock, speeds);
  refreshTimeButtons();
}

export function setSpeed(s) {
  G.time.speed = s;
  refreshTimeButtons();
}

function refreshTimeButtons() {
  timeEls.speedBtns?.forEach((b, i) => b && b.classList.toggle('active', G.time.speed === i));
}

export function refreshTimeBar() {
  if (!G.ready) return;
  timeEls.date.textContent = dateStr();
  const icons = { clear: '☀️', cloudy: '⛅', rain: '🌧️', storm: '⛈️', snow: '🌨️' };
  timeEls.season.textContent = `${SEASONS[seasonIndex()]} ${icons[env.weather] || ''}`;
  const h = Math.floor(G.time.hour), m = Math.floor((G.time.hour % 1) * 60);
  timeEls.clock.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ----------------------------------------------------------------- cam bar --

function buildCamBar(root) {
  const modes = [['strategy', '🗺️', 'Strategy view'], ['free', '🕊️', 'Free camera'], ['fp', '🚶', 'Walk the streets'], ['cine', '🎬', 'Cinematic']];
  for (const [mode, icon, tip] of modes) {
    const b = el('button', 'cam-btn', icon);
    b.title = `${tip} (C cycles)`;
    b.dataset.mode = mode;
    b.addEventListener('click', () => setMode(mode));
    root.append(b);
  }
  const terr = el('button', 'cam-btn', '🎨');
  terr.title = 'Territory overlay (T)';
  terr.addEventListener('click', () => setTerritoryVisible(!territoryVisible()));
  root.append(terr);
  on('camera:mode', (m) => {
    root.querySelectorAll('.cam-btn[data-mode]').forEach((b) => b.classList.toggle('active', b.dataset.mode === m));
  });
  root.querySelector('[data-mode="strategy"]').classList.add('active');
}

// ------------------------------------------------------------------ hotkeys --

export const ACTIONS = {
  pause: { label: 'Pause', def: 'Space', fn: () => setSpeed(G.time.speed === 0 ? 1 : 0) },
  speed1: { label: 'Speed 1', def: 'Digit1', fn: () => setSpeed(1) },
  speed2: { label: 'Speed 2', def: 'Digit2', fn: () => setSpeed(2) },
  speed3: { label: 'Speed 3', def: 'Digit3', fn: () => setSpeed(3) },
  camera: { label: 'Cycle camera', def: 'KeyC', fn: () => cycleMode() },
  territory: { label: 'Territory overlay', def: 'KeyT', fn: () => setTerritoryVisible(!territoryVisible()) },
  buildMenu: { label: 'Construction panel', def: 'KeyB', fn: () => toggleWindow('construction') },
  military: { label: 'Military panel', def: 'KeyN', fn: () => toggleWindow('military') },
  overview: { label: 'Overview panel', def: 'KeyO', fn: () => toggleWindow('overview') },
  rotate: { label: 'Rotate blueprint', def: 'KeyG', fn: () => rotateGhost() },
  cancel: { label: 'Cancel / close', def: 'Escape', fn: () => escapeAction() },
};

export let keymap = JSON.parse(localStorage.getItem('sov:keys') || '{}');
export function bindKey(action, code) {
  keymap[action] = code;
  localStorage.setItem('sov:keys', JSON.stringify(keymap));
}
export function keyFor(action) { return keymap[action] || ACTIONS[action].def; }

function escapeAction() {
  if (build.mode) { cancelBuild(); return; }
  // close top-most open window
  let top = null;
  for (const [id, w] of windows) {
    if (w.isOpen && (!top || +w.el.style.zIndex > +top.el.style.zIndex)) top = w;
  }
  if (top) closeWindow(top.id);
}

function initHotkeys() {
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if (!G.ready) return;
    for (const action in ACTIONS) {
      if (keyFor(action) === e.code) {
        e.preventDefault();
        ACTIONS[action].fn();
        return;
      }
    }
  });
}

// -------------------------------------------------------------------- init --

export function initUI() {
  windowsRoot = document.getElementById('windows');
  dockRoot = document.getElementById('dock');
  buildDock();
  buildTopBar(document.getElementById('topbar'));
  buildTimeBar(document.getElementById('timebar'));
  buildCamBar(document.getElementById('cambar'));
  initHotkeys();
  on('tick:day', () => { refreshTopBar(); });
  on('ui:refresh', () => { refreshTopBar(); });

  // build-mode hint line
  const hint = document.getElementById('buildhint');
  on('build:mode', (m) => {
    hint.style.display = m ? 'block' : 'none';
    hint.textContent = m === 'demolish' ? 'DEMOLITION — click a structure to tear it down (Esc to cancel)' :
      m === 'line' ? 'Click start point, then end point. Esc cancels.' :
        m === 'place' ? 'Click to build · G rotates · Esc cancels' : '';
  });
}
