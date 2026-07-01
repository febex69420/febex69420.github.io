// main.js — bootstrap & game loop.
// Menu → procedural generation → simulation + rendering + UI wiring.
// Owns pointer interaction on the map (selection, orders, construction,
// airstrikes, talking to citizens) and save/load.

import * as THREE from 'three';
import { G, CFG, chronicle } from './core/state.js';
import { on, emit, notify, clearBus } from './core/bus.js';
import { makeRNG } from './core/rng.js';
import { nationName, personName } from './core/names.js';

import { generateWorld, buildTerrainFns } from './sim/world.js';
import { generateCitizens } from './sim/citizens.js';
import { initEconomy } from './sim/economy.js';
import { initLaws } from './sim/laws.js';
import { initMilitary, airstrike } from './sim/military.js';
import { initIntel } from './sim/nations.js';
import { initPolitics } from './sim/politics.js';
import { initEvents } from './sim/events.js';
import { initTick, tick } from './sim/tick.js';

import { initScene, updateScene, env } from './gfx/scene.js';
import { buildTerrain, updateTerrain, getTerrainMesh } from './gfx/terrain.js';
import { buildCity, updateCity } from './gfx/city.js';
import { buildUnits, updateUnits, unitMeshes, unitsByMesh, setSelectedUnit, getSelectedUnit } from './gfx/units.js';
import { buildAgents, updateAgents, agentMesh, citizenAtRenderIndex } from './gfx/agents.js';

import { initCameras, updateCameras, cam, setMode, pickRay, pickGround } from './game/cameras.js';
import { initBuild, build, buildPointerMove, buildClick, cancelBuild } from './game/build.js';
import { initAudio, updateAudio, sfx } from './game/audio.js';

import { initUI, refreshTopBar, refreshTimeBar, setSpeed } from './ui/ui.js';
import { initPanels } from './ui/panels.js';
import { initMinimap, drawMinimap, initToasts, initModals } from './ui/widgets.js';

const SAVE_KEY = 'sovereign:save:v1';
let started = false;
let airstrikeArmed = false;

// ------------------------------------------------------------------- menu --

function setupMenu() {
  const $ = (id) => document.getElementById(id);
  $('seed-input').value = randomSeedName();
  $('nation-input').value = 'New ' + nationName(makeRNG(Date.now())) ;
  $('ruler-input').value = personName(makeRNG(Date.now() + 1), 'm');
  $('dice-btn').addEventListener('click', () => { $('seed-input').value = randomSeedName(); });
  $('start-btn').addEventListener('click', () => {
    initAudio(); sfx('chime');
    newGame({
      seed: $('seed-input').value.trim() || 'sovereign',
      nationName: $('nation-input').value.trim() || 'Veldonia',
      ruler: $('ruler-input').value.trim() || 'The Sovereign',
      gov: $('gov-select').value,
    });
  });
  const save = localStorage.getItem(SAVE_KEY);
  if (save) {
    $('continue-btn').style.display = 'block';
    $('continue-btn').addEventListener('click', () => { initAudio(); loadGame(); });
  }
}

function randomSeedName() {
  const r = makeRNG(String(Date.now() + Math.random()));
  return nationName(r).toLowerCase() + '-' + r.int(100, 999);
}

// ---------------------------------------------------------------- new game --

const frame = () => new Promise((r) => requestAnimationFrame(r));

async function newGame(opts) {
  document.getElementById('menu').style.display = 'none';
  const loading = document.getElementById('loading');
  loading.style.display = 'flex';
  const fill = document.getElementById('loading-fill');
  const text = document.getElementById('loading-text');
  const progress = async (label, pct) => { text.textContent = label; fill.style.width = (pct * 100).toFixed(0) + '%'; };

  G.seed = opts.seed;
  G.player.ruler = opts.ruler;
  G.player.gov = opts.gov;
  G.player.title = { democracy: 'President', autocracy: 'Supreme Leader', monarchy: 'Monarch', junta: 'General' }[opts.gov];
  await progress('Raising continents…', 0.05); await frame();
  generateWorld(G.seed, { nationName: opts.nationName, gov: opts.gov, ruler: opts.ruler });
  await progress('Writing the constitution…', 0.45); await frame();
  initLaws(); initEconomy(); initMilitary(); initIntel(); initPolitics(); initEvents();
  await progress('Populating the realm…', 0.6); await frame();
  generateCitizens();
  await progress('Rendering the world…', 0.75); await frame();
  await startWorld(progress);
  chronicle(`${opts.nationName} enters history. ${G.player.title} ${opts.ruler} takes power.`, 'good');
  notify('Long live the nation', `Welcome to ${opts.nationName}. Rule as you see fit — everything here remembers.`, 'good');
}

async function startWorld(progress) {
  const canvas = document.getElementById('game');
  initScene(canvas);
  buildTerrain(env.scene);
  await progress('Raising cities…', 0.85); await frame();
  buildCity(env.scene);
  buildUnits(env.scene);
  buildAgents(env.scene);
  initCameras(env.camera, canvas);
  initBuild(env.scene);
  await progress('Convening the ministries…', 0.95); await frame();
  initUI();
  initPanels();
  initToasts(document.getElementById('toasts'));
  initModals(document.getElementById('modal-root'));
  initMinimap(document.getElementById('minimap'));
  initTick();
  wireInput(canvas);
  wireGameOver();
  on('game:save', saveGame);
  G.ready = true;
  G.time.speed = 1;
  refreshTopBar(); refreshTimeBar();
  document.getElementById('loading').style.display = 'none';
  document.getElementById('hud').style.display = 'block';
  started = true;
  requestAnimationFrame(loop);
}

// -------------------------------------------------------------------- loop --

let lastT = 0, uiClock = 0;
const clock = new THREE.Clock();

function loop() {
  requestAnimationFrame(loop);
  const rawDt = clock.getDelta();
  const dt = Math.min(rawDt, 0.1);       // visuals: clamp hard to avoid jumps
  const elapsed = clock.elapsedTime;

  tick(Math.min(rawDt, 0.5));            // simulation: keep pace on slow frames
  updateCameras(dt);
  updateScene(dt);
  updateTerrain(dt, elapsed);
  updateUnits(elapsed);
  const focus = cam.mode === 'strategy' ? cam.target : env.camera.position;
  updateAgents(dt, env.camera, focus);
  updateCity(env.camera);

  uiClock += dt;
  if (uiClock > 0.45) {
    uiClock = 0;
    refreshTimeBar();
    drawMinimap(focus);
    updateAudio();
  }
  env.renderer.render(env.scene, env.camera);
}

// ------------------------------------------------------------------- input --

function wireInput(canvas) {
  let downPos = null;
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('pointerdown', (e) => { downPos = { x: e.clientX, y: e.clientY, b: e.button }; });

  canvas.addEventListener('pointermove', (e) => {
    if (build.mode && (build.mode === 'place' || (build.mode === 'line' && build.lineStart))) {
      const pt = pickGround(e.clientX, e.clientY, getTerrainMesh());
      buildPointerMove(pt);
    }
  });

  canvas.addEventListener('pointerup', (e) => {
    if (!downPos || Math.abs(e.clientX - downPos.x) + Math.abs(e.clientY - downPos.y) > 6) return; // it was a drag
    const { b } = downPos;
    downPos = null;
    if (document.pointerLockElement === canvas && cam.mode !== 'fp') return;

    if (b === 2) { // right click: orders
      const sel = getSelectedUnit();
      const pt = pickGround(e.clientX, e.clientY, getTerrainMesh());
      if (sel && pt) {
        sel.tx = pt.x; sel.tz = pt.z; sel.order = 'move';
        notify('Orders issued', `${sel.name} is moving out.`, 'info');
        sfx('click');
      }
      return;
    }
    if (b !== 0) return;

    // airstrike targeting
    if (airstrikeArmed) {
      const pt = pickGround(e.clientX, e.clientY, getTerrainMesh());
      if (pt) airstrike(pt.x, pt.z);
      airstrikeArmed = false;
      return;
    }
    // construction
    if (build.mode) {
      const pt = pickGround(e.clientX, e.clientY, getTerrainMesh());
      if (buildClick(pt)) { emit('ui:refresh'); return; }
    }
    // unit selection
    const ray = pickRay(e.clientX, e.clientY);
    const uHits = ray.intersectObjects(unitMeshes(), false);
    if (uHits.length) {
      const hit = uHits[0];
      const type = hit.object.name.slice(2);
      const u = unitsByMesh[type]?.[hit.instanceId];
      if (u && u.nation === G.player.nation) {
        setSelectedUnit(u.id);
        sfx('click');
        emit('units:changed');
        return;
      }
      if (u) { notify(u.nation === -2 ? 'Rebel force' : G.world.nations[u.nation].name, `${u.type} division · strength ${u.str.toFixed(0)}`, 'info'); return; }
    }
    // citizen picking
    const aHits = ray.intersectObject(agentMesh(), false);
    if (aHits.length) {
      const c = citizenAtRenderIndex(aHits[0].instanceId);
      if (c) { emit('select:citizen', c); sfx('open'); return; }
    }
    // clicking empty ground clears unit selection
    setSelectedUnit(-1);
  });

  on('armstrike', () => { airstrikeArmed = true; cancelBuild(); });
}

// --------------------------------------------------------------- game over --

function wireGameOver() {
  on('gameover', (go) => {
    G.time.speed = 0;
    const elGO = document.getElementById('gameover');
    document.getElementById('gameover-title').textContent = {
      conquered: '🏳️ THE NATION HAS FALLEN', revolution: '🔥 REVOLUTION', coup: '🪖 COUP D\'ÉTAT',
      'voted-out': '🗳️ VOTED OUT', assassinated: '🎯 ASSASSINATED',
    }[go.reason] || 'THE END';
    document.getElementById('gameover-text').textContent = go.text;
    const stats = document.getElementById('gameover-stats');
    stats.innerHTML = `You ruled for <b>${Math.floor(G.time.day / 120)} years and ${G.time.day % 120} days</b>.<br>
      Final approval: <b>${G.politics.approval.toFixed(0)}%</b> · GDP: <b>${(G.economy.gdp / 1e9).toFixed(1)}B</b> · Wars fought: <b>${G.log.filter((l) => l.kind === 'war').length}</b>`;
    elGO.style.display = 'flex';
    document.getElementById('gameover-restart').onclick = () => location.reload();
    document.getElementById('gameover-observe').onclick = () => { elGO.style.display = 'none'; };
  });
}

// --------------------------------------------------------------- save/load --

function saveGame() {
  try {
    const world = G.world;
    const snapshot = {
      version: 1, seed: G.seed, player: G.player, time: G.time, laws: G.laws,
      economy: G.economy, citizens: G.citizens, military: G.military, intel: G.intel,
      politics: G.politics, eventsState: G.eventsState, built: G.built, log: G.log,
      world: {
        nations: world.nations, provinces: world.provinces, provGrid: Array.from(world.provGrid),
        settlements: world.settlements, buildings: world.buildings, roads: world.roads,
        trees: world.trees, pois: world.pois,
      },
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot));
    notify('💾 Saved', 'The nation is preserved in the archive.', 'good');
  } catch (e) {
    console.error(e);
    notify('Save failed', String(e.message || e), 'bad');
  }
}

async function loadGame() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return;
  let snap;
  try { snap = JSON.parse(raw); } catch { return notify('Load failed', 'Corrupt save.', 'bad'); }
  document.getElementById('menu').style.display = 'none';
  const loading = document.getElementById('loading');
  loading.style.display = 'flex';
  const fill = document.getElementById('loading-fill');
  const text = document.getElementById('loading-text');
  const progress = async (label, pct) => { text.textContent = label; fill.style.width = (pct * 100).toFixed(0) + '%'; };
  await progress('Opening the archive…', 0.2); await frame();

  G.seed = snap.seed;
  Object.assign(G.player, snap.player);
  Object.assign(G.time, snap.time);
  G.laws = snap.laws; G.economy = snap.economy; G.citizens = snap.citizens;
  G.military = snap.military; G.intel = snap.intel; G.politics = snap.politics;
  G.eventsState = snap.eventsState; G.built = snap.built; G.log = snap.log;
  const fns = buildTerrainFns(G.seed);
  G.world = {
    ...snap.world,
    provGrid: Int16Array.from(snap.world.provGrid),
    _h: fns.heightAt, _moist: fns.moistureAt, _forest: fns.forestAt,
  };
  await progress('Rendering the world…', 0.6); await frame();
  await startWorld(progress);
  G.time.speed = 0;
  notify('Archive opened', `Welcome back, ${G.player.title} ${G.player.ruler}. The nation held its breath. (Paused)`, 'good');
}

// -------------------------------------------------------------------- boot --

setupMenu();

// Debug/modding handle (also used by the automated smoke tests).
window.__SOV = { G, env, cam };
