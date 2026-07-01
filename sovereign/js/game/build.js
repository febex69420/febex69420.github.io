// game/build.js — the construction system.
// Ghost-preview placement of any structure on your own territory, drag-laid
// roads/railways (bridging water automatically), demolition, build timers
// with growing scaffolds, and hooks so finished buildings feed the economy.

import * as THREE from 'three';
import { G, CFG, chronicle, fmtMoney } from '../core/state.js';
import { notify, emit, on } from '../core/bus.js';
import { clamp, dist2 } from '../core/rng.js';
import { nationAt, heightAt, slopeAt } from '../sim/world.js';
import { getBuildingGeometry, addBuildingInstance, refreshBuildingInstance, removeBuildingInstance } from '../gfx/city.js';
import { rebuildRoadMesh } from '../gfx/terrain.js';

export const BUILDABLE = [
  { type: 'road', name: 'Road', icon: '🛣️', cost: 900, per: 'per meter', days: 2, desc: 'Connects places. Drag from A to B; water gaps become bridges.' },
  { type: 'rail', name: 'Railway', icon: '🚆', cost: 2100, per: 'per meter', days: 4, desc: 'Heavy freight artery. Boosts economic growth.' },
  { type: 'housing', name: 'Housing', icon: '🏠', cost: 6e6, days: 10, desc: 'Homes for citizens. Raises local prosperity.' },
  { type: 'apartment', name: 'Apartment Block', icon: '🏢', cost: 14e6, days: 20, desc: 'Dense housing for growing cities.' },
  { type: 'school', name: 'School', icon: '🎓', cost: 12e6, days: 14, desc: 'Educates the young. Improves services & growth.' },
  { type: 'hospital', name: 'Hospital', icon: '🏥', cost: 22e6, days: 20, desc: 'Healthcare capacity. Fights epidemics.' },
  { type: 'university', name: 'University', icon: '🏛️', cost: 45e6, days: 30, desc: 'Higher learning. Feeds science & services.' },
  { type: 'lab', name: 'Research Lab', icon: '🔬', cost: 38e6, days: 24, desc: 'Accelerates military & civil research.' },
  { type: 'factory', name: 'Factory', icon: '🏭', cost: 30e6, days: 22, desc: 'Industrial output & jobs. Needs power.' },
  { type: 'farm', name: 'Farm', icon: '🌾', cost: 9e6, days: 10, desc: 'Food production. Place on flat lowland.' },
  { type: 'powerplant', name: 'Power Plant', icon: '⚡', cost: 40e6, days: 26, desc: 'Powers factories and cities.' },
  { type: 'nuclear', name: 'Nuclear Plant', icon: '☢️', cost: 130e6, days: 45, desc: 'Massive clean power. Handle with care.' },
  { type: 'market', name: 'Market Hall', icon: '🛒', cost: 8e6, days: 8, desc: 'Trade jobs and local commerce.' },
  { type: 'church', name: 'Temple', icon: '⛪', cost: 10e6, days: 14, desc: 'Comfort for the faithful.' },
  { type: 'police', name: 'Police HQ', icon: '🚓', cost: 16e6, days: 12, desc: 'Order enforcement in the region.' },
  { type: 'barracks', name: 'Barracks', icon: '🪖', cost: 18e6, days: 14, desc: 'Military housing; grows manpower.' },
  { type: 'bunker', name: 'Bunker', icon: '🧱', cost: 12e6, days: 10, desc: 'Fortification: provinces with bunkers resist capture.' },
  { type: 'wall', name: 'Defensive Wall', icon: '🏯', cost: 7e6, days: 8, desc: 'Static defense line segment.' },
  { type: 'tower', name: 'Watch Tower', icon: '🗼', cost: 5e6, days: 6, desc: 'Border surveillance.' },
  { type: 'runway', name: 'Airstrip', icon: '🛫', cost: 55e6, days: 30, desc: 'Enables air wings to operate.' },
  { type: 'hangar', name: 'Hangar', icon: '✈️', cost: 25e6, days: 15, desc: 'Aircraft maintenance & basing.' },
  { type: 'dock', name: 'Harbor Dock', icon: '⚓', cost: 35e6, days: 25, desc: 'Enables naval squadrons. Build at the coast.' },
  { type: 'monument', name: 'Monument', icon: '🗽', cost: 28e6, days: 20, desc: 'National pride in stone. Lifts spirits.' },
  { type: 'park', name: 'Park', icon: '🌳', cost: 4e6, days: 6, desc: 'Green space. Citizens breathe easier.' },
];

export const build = {
  mode: null,          // null | 'place' | 'line' | 'demolish'
  type: null, ghost: null, valid: false,
  lineStart: null, lineGhost: null,
  rot: 0,
};

let scene, ghostMatGood, ghostMatBad;

export function initBuild(sceneRef) {
  scene = sceneRef;
  ghostMatGood = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.55, emissive: 0x22ff44, emissiveIntensity: 0.25 });
  ghostMatBad = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.5, emissive: 0xff2222, emissiveIntensity: 0.45 });
  on('tick:day', progressConstruction);
}

export function catalogEntry(type) { return BUILDABLE.find((b) => b.type === type); }

export function enterBuild(type) {
  cancelBuild();
  const entry = catalogEntry(type);
  if (!entry) return;
  build.type = type;
  if (type === 'road' || type === 'rail') {
    build.mode = 'line';
    build.lineStart = null;
  } else {
    build.mode = 'place';
    build.ghost = new THREE.Mesh(getBuildingGeometry(type), ghostMatGood);
    scene.add(build.ghost);
  }
  emit('build:mode', build.mode);
}

export function enterDemolish() {
  cancelBuild();
  build.mode = 'demolish';
  emit('build:mode', 'demolish');
}

export function cancelBuild() {
  if (build.ghost) { scene.remove(build.ghost); build.ghost = null; }
  if (build.lineGhost) { scene.remove(build.lineGhost); build.lineGhost.geometry.dispose(); build.lineGhost = null; }
  build.mode = null; build.type = null; build.lineStart = null;
  emit('build:mode', null);
}

export function rotateGhost() { build.rot += Math.PI / 8; }

// ---------------------------------------------------------------- validity --

function placementValid(type, x, z) {
  if (nationAt(x, z) !== G.player.nation) return 'Outside our territory';
  const h = heightAt(x, z);
  const needsCoast = type === 'dock';
  if (needsCoast) {
    if (h < CFG.WATER_Y || h > CFG.WATER_Y + 6) return 'Must be at the shoreline';
  } else {
    if (h < CFG.WATER_Y + 0.8) return 'Cannot build in water';
    if (slopeAt(x, z) > (type === 'farm' || type === 'runway' ? 0.3 : 0.55)) return 'Terrain too steep';
  }
  const rad = type === 'runway' ? 50 : type === 'nuclear' || type === 'powerplant' ? 16 : 11;
  for (const b of G.world.buildings) {
    if (b.hp <= 0) continue;
    if (dist2(b.x, b.z, x, z) < rad * rad) return 'Too close to another structure';
  }
  const entry = catalogEntry(type);
  if (G.economy.treasury < entry.cost) return `Needs ${fmtMoney(entry.cost)}`;
  return null;
}

// ---------------------------------------------------------------- pointer --

export function buildPointerMove(point) {
  if (build.mode === 'place' && build.ghost && point) {
    build.ghost.position.set(point.x, Math.max(heightAt(point.x, point.z), CFG.WATER_Y - 0.5) - 0.1, point.z);
    build.ghost.rotation.y = build.rot;
    const err = placementValid(build.type, point.x, point.z);
    build.valid = !err;
    build.ghost.material = err ? ghostMatBad : ghostMatGood;
    build.err = err;
  }
  if (build.mode === 'line' && build.lineStart && point) {
    updateLineGhost(build.lineStart, point);
  }
}

export function buildClick(point) {
  if (!point) return false;
  if (build.mode === 'place') { placeBuilding(point); return true; }
  if (build.mode === 'line') {
    if (!build.lineStart) {
      build.lineStart = { x: point.x, z: point.z };
    } else {
      commitLine(build.lineStart, point);
      build.lineStart = null;
    }
    return true;
  }
  if (build.mode === 'demolish') { demolishAt(point); return true; }
  return false;
}

// ------------------------------------------------------------------ placing --

function placeBuilding(point) {
  const err = placementValid(build.type, point.x, point.z);
  if (err) { notify('Cannot build here', err, 'bad'); return; }
  const entry = catalogEntry(build.type);
  G.economy.treasury -= entry.cost;
  const b = {
    id: G.world.buildings.length, type: build.type, x: point.x, z: point.z,
    rot: build.rot, nation: G.player.nation, settlement: nearestSettlementId(point.x, point.z),
    hp: 100, underConstruction: true, progress: 0, buildDays: entry.days, playerBuilt: true,
  };
  G.world.buildings.push(b);
  G.built.push(b.id);
  addBuildingInstance(b);
  chronicle(`Construction started: ${entry.name} (${fmtMoney(entry.cost)}).`, 'info');
  emit('built', { b });
  emit('sfx', 'build');
}

function nearestSettlementId(x, z) {
  let best = -1, bd = Infinity;
  for (const s of G.world.settlements) {
    const d = dist2(s.x, s.z, x, z);
    if (d < bd) { bd = d; best = s.id; }
  }
  return best;
}

function progressConstruction() {
  for (const id of G.built) {
    const b = G.world.buildings[id];
    if (!b || !b.underConstruction) continue;
    b.progress += 1 / b.buildDays;
    if (b.progress >= 1) {
      b.underConstruction = false;
      b.progress = 1;
      const entry = catalogEntry(b.type);
      notify('🏗️ Construction complete', `${entry ? entry.name : b.type} is operational.`, 'good');
      chronicle(`${entry ? entry.name : b.type} completed.`, 'good');
      onBuildingComplete(b);
    }
    refreshBuildingInstance(b);
  }
}

function onBuildingComplete(b) {
  const s = G.world.settlements[b.settlement];
  if (b.type === 'monument' && s) {
    s.boost = (s.boost || 0) + 0.15;
    for (const c of G.citizens) {
      if (c.nation === G.player.nation && c.home === b.settlement && c.status === 'free') {
        c.opinion = clamp(c.opinion + 6, -100, 100);
      }
    }
  }
  if (b.type === 'park' && s) s.boost = (s.boost || 0) + 0.08;
  if (b.type === 'barracks') G.military.manpower = Math.min(400, G.military.manpower + 8);
  if ((b.type === 'housing' || b.type === 'apartment') && s) {
    s.houses.push(b.id);
    s.boost = (s.boost || 0) + 0.05;
  }
  emit('citizens:changed');
}

// ------------------------------------------------------------ roads & rails --

function lineCost(a, b, type) {
  const len = Math.sqrt(dist2(a.x, a.z, b.x, b.z));
  const entry = catalogEntry(type);
  return Math.round(len * entry.cost);
}

function updateLineGhost(a, b) {
  if (build.lineGhost) { scene.remove(build.lineGhost); build.lineGhost.geometry.dispose(); }
  const pts = [];
  const segs = 20;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
    const h = heightAt(x, z);
    pts.push(new THREE.Vector3(x, (h < CFG.WATER_Y ? CFG.WATER_Y + 1.8 : h + 0.6), z));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  build.lineGhost = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: build.type === 'rail' ? 0x8899ff : 0xffe28a, linewidth: 2 }));
  scene.add(build.lineGhost);
  build.lineCostPreview = lineCost(a, b, build.type);
}

function commitLine(a, b) {
  const cost = lineCost(a, b, build.type);
  if (G.economy.treasury < cost) { notify('Cannot afford', `This ${build.type} costs ${fmtMoney(cost)}.`, 'bad'); return; }
  const endOk = nationAt(a.x, a.z) === G.player.nation || nationAt(b.x, b.z) === G.player.nation;
  if (!endOk) { notify('Outside territory', 'Routes must start or end in our land.', 'bad'); return; }
  G.economy.treasury -= cost;
  const d = Math.sqrt(dist2(a.x, a.z, b.x, b.z));
  const segs = Math.max(4, Math.round(d / 30));
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
    pts.push([x, z, heightAt(x, z) < CFG.WATER_Y + 0.5]);
  }
  G.world.roads.push({ pts, kind: build.type === 'rail' ? 'rail' : 'road', playerBuilt: true });
  rebuildRoadMesh();
  if (build.lineGhost) { scene.remove(build.lineGhost); build.lineGhost.geometry.dispose(); build.lineGhost = null; }
  chronicle(`${build.type === 'rail' ? 'Railway' : 'Road'} laid (${fmtMoney(cost)}).`, 'good');
  notify('🛤️ Route complete', `${(d | 0)}m of ${build.type === 'rail' ? 'railway' : 'road'} built.`, 'good');
  emit('sfx', 'build');
}

// ---------------------------------------------------------------- demolish --

function demolishAt(point) {
  let best = null, bd = 18 * 18;
  for (const b of G.world.buildings) {
    if (b.nation !== G.player.nation || b.hp <= 0) continue;
    const d = dist2(b.x, b.z, point.x, point.z);
    if (d < bd) { bd = d; best = b; }
  }
  if (!best) { notify('Nothing here', 'No demolishable structure at this spot.', 'info'); return; }
  if (best.type === 'palace') { notify('Absolutely not', 'The palace stays.', 'info'); return; }
  const entry = catalogEntry(best.type);
  const refund = entry ? Math.round(entry.cost * 0.25) : 5e5;
  best.hp = 0;
  removeBuildingInstance(best);
  // people lose homes/workplaces
  for (const c of G.citizens) {
    if (c.workB === best.id) { c.workB = -1; c.job = 'unemployed'; }
    if (c.houseB === best.id) {
      const s = G.world.settlements[c.home];
      const alt = s?.houses.find((h) => G.world.buildings[h]?.hp > 0);
      if (alt !== undefined) c.houseB = alt;
      c.opinion = clamp(c.opinion - 15, -100, 100);
      c.memories.unshift({ day: G.time.day, text: 'The state bulldozed my home', impact: -15 });
    }
  }
  G.economy.treasury += refund;
  chronicle(`Demolished a ${best.type} (refund ${fmtMoney(refund)}).`, 'bad');
  emit('sfx', 'boom');
  emit('citizens:changed');
}
