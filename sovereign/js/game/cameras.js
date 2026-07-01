// game/cameras.js — four ways to see your country.
//  strategy — classic RTS orbit/pan/zoom (default)
//  free     — fly anywhere with pointer-lock mouse look
//  fp       — walk the streets at eye level and meet your citizens
//  cine     — automated letterboxed flyover of interesting places
// Smooth blends between modes; exposes picking rays for selection & building.

import * as THREE from 'three';
import { G, CFG } from '../core/state.js';
import { clamp, lerp } from '../core/rng.js';
import { emit, on } from '../core/bus.js';

export const cam = {
  mode: 'strategy',
  // strategy state
  target: new THREE.Vector3(0, 0, 0), dist: 420, yaw: 0, pitch: 0.9,
  // free / fp state
  pos: new THREE.Vector3(), look: { yaw: 0, pitch: -0.3 },
  // cine state
  cine: null,
  keys: {}, camera: null, dom: null,
  blend: 0,          // >0 while transitioning
  edgePan: true,
};

const MOVE = { fwd: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], up: ['KeyR'], down: ['KeyF'], rotL: ['KeyQ'], rotR: ['KeyE'] };
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

export function initCameras(camera, dom) {
  cam.camera = camera;
  cam.dom = dom;

  const cap = G.world.settlements[G.world.nations[G.player.nation].capital];
  if (cap) cam.target.set(cap.x, 0, cap.z);
  cam.pos.set(cam.target.x, 120, cam.target.z + 120);

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    cam.keys[e.code] = true;
  });
  window.addEventListener('keyup', (e) => { cam.keys[e.code] = false; });
  window.addEventListener('blur', () => { cam.keys = {}; });

  dom.addEventListener('wheel', (e) => {
    if (e.target !== dom) return;
    if (cam.mode === 'strategy') {
      cam.dist = clamp(cam.dist * (1 + Math.sign(e.deltaY) * 0.12), 60, 1400);
    }
  }, { passive: true });

  // mouse look (free / fp via pointer lock)
  dom.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === dom) {
      cam.look.yaw -= e.movementX * 0.0023;
      cam.look.pitch = clamp(cam.look.pitch - e.movementY * 0.0023, -1.5, 1.5);
    } else if (cam.mode === 'strategy' && e.buttons === 4) { // middle-drag rotate
      cam.yaw -= e.movementX * 0.005;
      cam.pitch = clamp(cam.pitch - e.movementY * 0.004, 0.25, 1.5);
    }
    lastMouse.x = e.clientX; lastMouse.y = e.clientY; lastMouse.seen = true;
  });
  dom.addEventListener('mousedown', () => {
    if ((cam.mode === 'free' || cam.mode === 'fp') && document.pointerLockElement !== dom) {
      dom.requestPointerLock();
    }
  });
  on('focus:map', ({ x, z }) => focusOn(x, z));
}

const lastMouse = { x: window.innerWidth / 2, y: window.innerHeight / 2, seen: false };

export function setMode(mode) {
  if (mode === cam.mode) return;
  const prev = cam.mode;
  // seed the new mode's state from the current camera pose
  if (mode === 'free' || mode === 'fp') {
    cam.pos.copy(cam.camera.position);
    const dir = cam.camera.getWorldDirection(_v);
    cam.look.yaw = Math.atan2(-dir.x, -dir.z);
    cam.look.pitch = Math.asin(clamp(dir.y, -1, 1));
    if (mode === 'fp') {
      // drop to the nearest settlement plaza if we're high up
      if (cam.pos.y > 100) {
        const s = nearestSettlement(cam.pos.x, cam.pos.z);
        if (s) cam.pos.set(s.x + 12, 0, s.z + 12);
      }
      cam.pos.y = G.world._h(cam.pos.x, cam.pos.z) + 1.75;
      cam.look.pitch = 0;
    }
  }
  if (mode === 'strategy' && (prev === 'free' || prev === 'fp')) {
    cam.target.set(cam.camera.position.x, 0, cam.camera.position.z);
    cam.dist = Math.max(160, cam.camera.position.y * 1.6);
  }
  if (mode === 'cine') startCine();
  if (mode !== 'free' && mode !== 'fp' && document.pointerLockElement) document.exitPointerLock();
  cam.mode = mode;
  cam.blend = 1;
  emit('camera:mode', mode);
}

export function cycleMode() {
  const order = ['strategy', 'free', 'fp', 'cine'];
  setMode(order[(order.indexOf(cam.mode) + 1) % order.length]);
}

export function focusOn(x, z) {
  cam.target.set(x, 0, z);
  if (cam.mode !== 'strategy') setMode('strategy');
}

function nearestSettlement(x, z) {
  let best = null, bd = Infinity;
  for (const s of G.world.settlements) {
    const d = (s.x - x) ** 2 + (s.z - z) ** 2;
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

// ------------------------------------------------------------------ cine --

function startCine() {
  // fly over drama first: battles, protests, then cities
  const pois = [];
  for (const u of G.military.units) if (u.nation === G.player.nation) { pois.push({ x: u.x, z: u.z }); break; }
  for (const p of G.politics.protests) {
    const s = G.world.settlements[p.settlement];
    pois.push({ x: s.x, z: s.z });
  }
  for (const poi of G.world.pois) pois.push(poi);
  const route = pois.slice(0, 6);
  if (route.length < 2) route.push({ x: 0, z: 0 }, { x: 200, z: 200 });
  cam.cine = { route, leg: 0, t: 0 };
  document.getElementById('letterbox')?.classList.add('on');
}

function endCineVisuals() {
  document.getElementById('letterbox')?.classList.remove('on');
}

// ------------------------------------------------------------------ update --

const pressed = (names) => names.some((k) => cam.keys[k]);

export function updateCameras(dt) {
  const c = cam.camera;
  switch (cam.mode) {
    case 'strategy': updateStrategy(dt); break;
    case 'free': updateFree(dt, 90); break;
    case 'fp': updateFP(dt); break;
    case 'cine': updateCine(dt); break;
  }
  if (cam.mode !== 'cine') endCineVisuals();
  cam.blend = Math.max(0, cam.blend - dt * 1.4);
}

function updateStrategy(dt) {
  const speed = cam.dist * 0.9 * dt;
  const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
  if (pressed(MOVE.fwd)) { cam.target.x -= sy * speed; cam.target.z -= cy * speed; }
  if (pressed(MOVE.back)) { cam.target.x += sy * speed; cam.target.z += cy * speed; }
  if (pressed(MOVE.left)) { cam.target.x -= cy * speed; cam.target.z += sy * speed; }
  if (pressed(MOVE.right)) { cam.target.x += cy * speed; cam.target.z -= sy * speed; }
  if (pressed(MOVE.rotL)) cam.yaw += dt * 1.6;
  if (pressed(MOVE.rotR)) cam.yaw -= dt * 1.6;
  // edge pan (only once the mouse has actually moved in this session)
  if (cam.edgePan && lastMouse.seen && document.pointerLockElement == null) {
    const m = 12, W = window.innerWidth, H = window.innerHeight;
    if (lastMouse.x < m) { cam.target.x -= cy * speed; cam.target.z += sy * speed; }
    if (lastMouse.x > W - m) { cam.target.x += cy * speed; cam.target.z -= sy * speed; }
    if (lastMouse.y < m) { cam.target.x -= sy * speed; cam.target.z -= cy * speed; }
    if (lastMouse.y > H - m) { cam.target.x += sy * speed; cam.target.z += cy * speed; }
  }
  const L = CFG.MAP * 0.7;
  cam.target.x = clamp(cam.target.x, -L, L);
  cam.target.z = clamp(cam.target.z, -L, L);

  const groundY = Math.max(G.world._h(cam.target.x, cam.target.z), CFG.WATER_Y);
  const px = cam.target.x + Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist;
  const pz = cam.target.z + Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist;
  const py = groundY + Math.sin(cam.pitch) * cam.dist;
  const k = cam.blend > 0 ? 1 - Math.pow(0.001, dt) : 1 - Math.pow(0.0001, dt);
  _v.set(px, Math.max(py, G.world._h(px, pz) + 8), pz);
  cam.camera.position.lerp(_v, k);
  _v2.set(cam.target.x, groundY, cam.target.z);
  lookAtSmooth(_v2, k);
}

function updateFree(dt, baseSpeed) {
  const fast = cam.keys.ShiftLeft || cam.keys.ShiftRight;
  const sp = baseSpeed * (fast ? 4 : 1) * dt;
  const dir = _v.set(-Math.sin(cam.look.yaw) * Math.cos(cam.look.pitch), Math.sin(cam.look.pitch), -Math.cos(cam.look.yaw) * Math.cos(cam.look.pitch));
  const right = _v2.set(-dir.z, 0, dir.x).normalize();
  if (pressed(MOVE.fwd)) cam.pos.addScaledVector(dir, sp);
  if (pressed(MOVE.back)) cam.pos.addScaledVector(dir, -sp);
  if (pressed(MOVE.left)) cam.pos.addScaledVector(right, -sp);
  if (pressed(MOVE.right)) cam.pos.addScaledVector(right, sp);
  if (pressed(MOVE.up) || cam.keys.Space) cam.pos.y += sp;
  if (pressed(MOVE.down)) cam.pos.y -= sp;
  cam.pos.y = Math.max(cam.pos.y, G.world._h(cam.pos.x, cam.pos.z) + 2);
  cam.pos.x = clamp(cam.pos.x, -CFG.MAP, CFG.MAP);
  cam.pos.z = clamp(cam.pos.z, -CFG.MAP, CFG.MAP);
  applyLook(dt);
}

function updateFP(dt) {
  const fast = cam.keys.ShiftLeft || cam.keys.ShiftRight;
  const sp = (fast ? 9 : 4.2) * dt;
  const yaw = cam.look.yaw;
  const fwd = _v.set(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right = _v2.set(-fwd.z, 0, fwd.x);
  if (pressed(MOVE.fwd)) cam.pos.addScaledVector(fwd, sp);
  if (pressed(MOVE.back)) cam.pos.addScaledVector(fwd, -sp);
  if (pressed(MOVE.left)) cam.pos.addScaledVector(right, -sp);
  if (pressed(MOVE.right)) cam.pos.addScaledVector(right, sp);
  // stay on land
  const h = G.world._h(cam.pos.x, cam.pos.z);
  if (h < CFG.WATER_Y + 0.3) cam.pos.addScaledVector(fwd, -sp * 2);
  cam.pos.y = lerp(cam.pos.y, Math.max(G.world._h(cam.pos.x, cam.pos.z), CFG.WATER_Y) + 1.75, 1 - Math.pow(0.0001, dt));
  applyLook(dt);
}

function applyLook(dt) {
  const k = cam.blend > 0 ? 1 - Math.pow(0.001, dt) : 1;
  cam.camera.position.lerp(cam.pos, k);
  const dir = _v.set(-Math.sin(cam.look.yaw) * Math.cos(cam.look.pitch), Math.sin(cam.look.pitch), -Math.cos(cam.look.yaw) * Math.cos(cam.look.pitch));
  _v2.copy(cam.camera.position).add(dir);
  cam.camera.lookAt(_v2);
}

function updateCine(dt) {
  const ci = cam.cine;
  if (!ci) return setMode('strategy');
  ci.t += dt / 14;                     // seconds per leg
  if (ci.t >= 1) { ci.t = 0; ci.leg = (ci.leg + 1) % ci.route.length; }
  const a = ci.route[ci.leg], b = ci.route[(ci.leg + 1) % ci.route.length];
  const t = ci.t, e = t * t * (3 - 2 * t);
  const x = lerp(a.x, b.x, e), z = lerp(a.z, b.z, e);
  const orbit = ci.leg * 2.1 + t * 1.2;
  const h = Math.max(G.world._h(x, z), CFG.WATER_Y);
  _v.set(x + Math.cos(orbit) * 130, h + 60 + Math.sin(t * Math.PI) * 50, z + Math.sin(orbit) * 130);
  cam.camera.position.lerp(_v, 1 - Math.pow(0.001, dt));
  _v2.set(x, h + 8, z);
  lookAtSmooth(_v2, 1 - Math.pow(0.002, dt));
}

const _lookCur = new THREE.Vector3();
let lookInit = false;
function lookAtSmooth(target, k) {
  if (!lookInit) { _lookCur.copy(target); lookInit = true; }
  _lookCur.lerp(target, k);
  cam.camera.lookAt(_lookCur);
}

// ------------------------------------------------------------------ picking --

/** Raycaster from a client-space point. */
export function pickRay(clientX, clientY) {
  ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, cam.camera);
  return raycaster;
}

/** Intersect the pick ray with the terrain mesh; returns point or null. */
export function pickGround(clientX, clientY, terrainMesh) {
  const ray = pickRay(clientX, clientY);
  const hits = ray.intersectObject(terrainMesh, false);
  return hits.length ? hits[0].point : null;
}
