// gfx/agents.js — the people you can actually see.
// A pool of instanced avatars is bound to the *simulated citizens* who live in
// settlements near the camera. Their positions follow daily routines (home →
// work → plaza), protests pull crowds to the square, and clicking a person
// opens their real citizen record.

import * as THREE from 'three';
import { G } from '../core/state.js';
import { bake } from './geom.js';
import { clamp, dist2 } from '../core/rng.js';

const POOL = 210;
let scene, bodies, heads;
const slots = [];                 // slot → {cid, x, z, tx, tz, seed, speed}
const slotByCid = new Map();
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _c = new THREE.Color();
let rebindTimer = 0;

const CLOTHES = [0x5d6d8a, 0x7a5a48, 0x4a6a52, 0x8a4a52, 0x6a6a6a, 0x907c50, 0x4f5a70, 0x6d4f70];

export function buildAgents(sceneRef) {
  scene = sceneRef;
  const bodyGeo = bake([
    { shape: 'box', size: [0.85, 1.35, 0.5], pos: [0, 1.25, 0], color: 0xffffff },
    { shape: 'box', size: [0.3, 0.62, 0.32], pos: [-0.26, 0.31, 0], color: 0x3a3a42 },
    { shape: 'box', size: [0.3, 0.62, 0.32], pos: [0.26, 0.31, 0], color: 0x3a3a42 },
  ]);
  const headGeo = bake([
    { shape: 'sphere', size: [0.34, 7, 6], pos: [0, 2.16, 0], color: 0xc9a583 },
  ]);
  bodies = new THREE.InstancedMesh(bodyGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), POOL);
  heads = new THREE.InstancedMesh(headGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), POOL);
  bodies.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(POOL * 3).fill(1), 3);
  heads.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(POOL * 3).fill(1), 3);
  bodies.castShadow = true;
  bodies.count = 0; heads.count = 0;
  bodies.name = 'agents';
  scene.add(bodies); scene.add(heads);
  for (let i = 0; i < POOL; i++) slots.push(null);
}

export function agentMesh() { return bodies; }
export function citizenAtInstance(i) {
  const s = slots[i];
  return s ? G.citizens[s.cid] : null;
}

/** Rebind pool slots to citizens living near the camera focus. */
function rebind(focusX, focusZ) {
  const nearSettlements = G.world.settlements
    .filter((s) => !s.mil && dist2(s.x, s.z, focusX, focusZ) < 520 * 520)
    .sort((a, b) => dist2(a.x, a.z, focusX, focusZ) - dist2(b.x, b.z, focusX, focusZ))
    .slice(0, 4);
  const wanted = [];
  for (const s of nearSettlements) {
    for (const c of G.citizens) {
      if (c.home === s.id && c.status === 'free') wanted.push(c.id);
      if (wanted.length >= POOL) break;
    }
    if (wanted.length >= POOL) break;
  }
  const wantedSet = new Set(wanted);
  // free stale slots
  for (let i = 0; i < POOL; i++) {
    if (slots[i] && !wantedSet.has(slots[i].cid)) { slotByCid.delete(slots[i].cid); slots[i] = null; }
  }
  // fill empty slots
  let cursor = 0;
  for (const cid of wanted) {
    if (slotByCid.has(cid)) continue;
    while (cursor < POOL && slots[cursor]) cursor++;
    if (cursor >= POOL) break;
    const c = G.citizens[cid];
    const home = G.world.buildings[c.houseB];
    const x = home ? home.x : 0, z = home ? home.z : 0;
    slots[cursor] = { cid, x, z, tx: x, tz: z, seed: Math.random() * 100, speed: 3.4 + Math.random() * 1.6, idle: 0 };
    slotByCid.set(cid, cursor);
  }
}

/** Where does this citizen want to be right now? */
function routineTarget(c, slot) {
  const hour = G.time.hour;
  const home = G.world.buildings[c.houseB];
  const hx = home ? home.x : 0, hz = home ? home.z : 0;
  const settlement = G.world.settlements[c.home];

  if (c.protesting && settlement) {
    // protests gather around the plaza fountain
    const a = (slot.seed * 7) % 6.28;
    const r = 6 + (slot.seed * 13) % 12;
    return [settlement.x + Math.cos(a) * r, settlement.z + Math.sin(a) * r, true];
  }
  if (hour < 6.5 || hour > 21.5) return [hx, hz, false];
  const work = c.workB >= 0 ? G.world.buildings[c.workB] : null;
  if (work && hour > 8 && hour < 16.5 && c.job !== 'retired' && c.job !== 'unemployed') {
    return [work.x + Math.sin(slot.seed) * 5, work.z + Math.cos(slot.seed) * 5, false];
  }
  // leisure: wander around the settlement center
  if (slot.idle <= 0 && settlement) {
    const a = Math.random() * 6.28, r = 8 + Math.random() * Math.min(46, settlement.radius);
    slot.tx = settlement.x + Math.cos(a) * r;
    slot.tz = settlement.z + Math.sin(a) * r;
    slot.idle = 4 + Math.random() * 9;
  }
  return null;      // keep current wander target
}

export function updateAgents(dt, camera, focus) {
  rebindTimer -= dt;
  if (rebindTimer <= 0) { rebind(focus.x, focus.z); rebindTimer = 1.2; }

  // hide crowd entirely when camera is far away
  const camHigh = camera.position.y > 420;
  bodies.visible = heads.visible = !camHigh;
  if (camHigh) return;

  let n = 0;
  const elapsed = performance.now() / 1000;
  for (let i = 0; i < POOL; i++) {
    const slot = slots[i];
    if (!slot) continue;
    const c = G.citizens[slot.cid];
    if (!c || c.status !== 'free') { slots[i] = null; slotByCid.delete(slot.cid); continue; }
    slot.idle -= dt;
    const t = routineTarget(c, slot);
    if (t) { slot.tx = t[0]; slot.tz = t[1]; }
    const dx = slot.tx - slot.x, dz = slot.tz - slot.z;
    const d = Math.hypot(dx, dz);
    const rioting = c.protesting && G.politics.protests.some((p) => p.settlement === c.home && p.violent);
    const sp = slot.speed * (rioting ? 2.2 : 1);
    if (d > 0.6) {
      slot.x += (dx / d) * sp * dt;
      slot.z += (dz / d) * sp * dt;
    }
    const y = G.world._h(slot.x, slot.z);
    if (y < 0.2) { slot.tx = slot.x - dx; slot.tz = slot.z - dz; }
    const moving = d > 0.6;
    const bob = moving ? Math.abs(Math.sin(elapsed * 9 + slot.seed)) * 0.14 : 0;
    const wave = c.protesting ? Math.sin(elapsed * 6 + slot.seed) * 0.12 : 0;
    _p.set(slot.x, Math.max(y, 0) + bob, slot.z);
    _q.setFromAxisAngle(_up, moving ? Math.atan2(dx, dz) : slot.seed % 6.28);
    const scale = 0.85 + (slot.seed % 0.25);
    _s.set(scale, scale * (1 + wave * 0.3), scale);
    _m.compose(_p, _q, _s);
    bodies.setMatrixAt(n, _m);
    heads.setMatrixAt(n, _m);
    // clothes: notables gold, rebels dark red, protesters carry anger
    if (c.notable) _c.setHex(0xd6a83c);
    else if (c.rebel) _c.setHex(0x7a2830);
    else _c.setHex(CLOTHES[slot.cid % CLOTHES.length]);
    if (c.protesting) _c.lerp(new THREE.Color(0xb03030), 0.35);
    bodies.instanceColor.setXYZ(n, _c.r, _c.g, _c.b);
    heads.instanceColor.setXYZ(n, 1, 1, 1);
    slots[i]._render = n;                 // instance index → slot mapping for picking
    slotRender[n] = i;
    n++;
  }
  bodies.count = n; heads.count = n;
  bodies.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  bodies.instanceColor.needsUpdate = true;
}

const slotRender = [];
export function citizenAtRenderIndex(i) {
  const slotIdx = slotRender[i];
  const s = slots[slotIdx];
  return s ? G.citizens[s.cid] : null;
}
