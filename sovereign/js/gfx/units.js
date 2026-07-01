// gfx/units.js — divisions on the map: tanks, infantry stands, guns, planes
// and ships, instanced per type and tinted by nation color. Handles selection
// rings, movement order lines and facing.

import * as THREE from 'three';
import { G, CFG } from '../core/state.js';
import { bake } from './geom.js';
import { REBEL } from '../sim/military.js';
import { NATION_COLORS } from '../sim/world.js';

const CAP = 130;
let scene;
const meshes = {};
export const unitsByMesh = {};   // type → [unit refs in instance order]
let ring, orderLine;
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1);
const _up = new THREE.Vector3(0, 1, 0);
const _c = new THREE.Color();
let selectedId = -1;

const W = 0xdddddd, D = 0x555555;

const GEOS = {
  infantry: () => bake([
    ...[-2, 0, 2].map((x) => ({ shape: 'box', size: [1.1, 2.2, 0.8], pos: [x, 1.1, 0], color: W })),
    ...[-2, 0, 2].map((x) => ({ shape: 'sphere', size: [0.5, 6, 5], pos: [x, 2.5, 0], color: 0xc9a583 })),
    { shape: 'box', size: [0.18, 4.5, 0.18], pos: [3.4, 2.2, 0], color: 0x8a6844 },
    { shape: 'box', size: [2.4, 1.4, 0.12], pos: [4.5, 3.6, 0], color: W },
  ]),
  armor: () => bake([
    { shape: 'box', size: [7, 2, 4.4], pos: [0, 1.4, 0], color: W },
    { shape: 'box', size: [7.6, 1.2, 1.1], pos: [0, 0.7, 2.2], color: D },
    { shape: 'box', size: [7.6, 1.2, 1.1], pos: [0, 0.7, -2.2], color: D },
    { shape: 'cyl', size: [1.7, 2, 1.3, 8], pos: [-0.4, 3, 0], color: W },
    { shape: 'cyl', size: [0.22, 0.22, 5.5, 6], pos: [2.8, 3.1, 0], rotZ: Math.PI / 2, color: D },
  ]),
  artillery: () => bake([
    { shape: 'box', size: [4.5, 1.2, 3.6], pos: [0, 1, 0], color: W },
    { shape: 'cyl', size: [0.8, 0.8, 1.2, 8], pos: [1, 1.8, 1.8], rotX: Math.PI / 2, color: D },
    { shape: 'cyl', size: [0.8, 0.8, 1.2, 8], pos: [1, 1.8, -1.8], rotX: Math.PI / 2, color: D },
    { shape: 'cyl', size: [0.3, 0.42, 7, 6], pos: [2.4, 3.4, 0], rotZ: 1.15, color: W },
  ]),
  air: () => bake([
    { shape: 'cyl', size: [0.9, 0.5, 8, 7], pos: [0, 0, 0], rotZ: Math.PI / 2, color: W },
    { shape: 'box', size: [3.2, 0.25, 11], pos: [0.6, 0, 0], color: W },
    { shape: 'box', size: [2.2, 0.22, 4], pos: [-3.4, 0.8, 0], color: W },
    { shape: 'box', size: [1.6, 1.6, 0.22], pos: [-3.6, 1, 0], color: W },
  ]),
  navy: () => bake([
    { shape: 'box', size: [13, 2.2, 3.6], pos: [0, 0.4, 0], color: W },
    { shape: 'box', size: [5, 2.4, 2.6], pos: [-0.5, 2.6, 0], color: 0xbbbbbb },
    { shape: 'box', size: [1.6, 2.6, 1.4], pos: [1, 4.4, 0], color: D },
    { shape: 'cyl', size: [0.18, 0.18, 4.4, 5], pos: [4.5, 2.6, 0], rotZ: 1.2, color: D },
  ]),
};

export function buildUnits(sceneRef) {
  scene = sceneRef;
  for (const type in GEOS) {
    const mesh = new THREE.InstancedMesh(GEOS[type](), new THREE.MeshLambertMaterial({ vertexColors: true }), CAP);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3).fill(1), 3);
    mesh.count = 0;
    mesh.castShadow = true;
    mesh.name = 'u:' + type;
    scene.add(mesh);
    meshes[type] = mesh;
    unitsByMesh[type] = [];
  }
  ring = new THREE.Mesh(new THREE.RingGeometry(7, 8.6, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff2a8, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  scene.add(ring);
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  orderLine = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xfff2a8, transparent: true, opacity: 0.7 }));
  orderLine.visible = false;
  scene.add(orderLine);
}

export function setSelectedUnit(id) { selectedId = id; }
export function getSelectedUnit() { return G.military.units.find((u) => u.id === selectedId) || null; }

export function unitMeshes() { return Object.values(meshes); }

/** Per-frame sync of unit instances (cheap: <150 units). */
export function updateUnits(elapsed) {
  for (const type in meshes) { meshes[type].count = 0; unitsByMesh[type].length = 0; }
  for (const u of G.military.units) {
    const mesh = meshes[u.type];
    if (!mesh || mesh.count >= CAP) continue;
    const i = mesh.count++;
    unitsByMesh[u.type][i] = u;
    const ground = G.world._h(u.x, u.z);
    const y = u.type === 'air' ? Math.max(ground, CFG.WATER_Y) + 46 + Math.sin(elapsed * 2 + u.id) * 2 :
      u.type === 'navy' ? CFG.WATER_Y + 0.6 : Math.max(ground, CFG.WATER_Y) + 0.2;
    _p.set(u.x, y, u.z);
    const moving = Math.abs(u.tx - u.x) + Math.abs(u.tz - u.z) > 2;
    const ang = moving ? Math.atan2(-(u.tz - u.z), u.tx - u.x) : (u.id * 1.3) % 6.28;
    _q.setFromAxisAngle(_up, ang);
    const sc = 0.6 + (u.str / 100) * 0.5;
    _s.set(sc, sc, sc);
    _m.compose(_p, _q, _s);
    mesh.setMatrixAt(i, _m);
    _c.setHex(u.nation === REBEL ? 0x8a1f28 : (NATION_COLORS[u.nation] ?? 0x888888));
    if (u.morale < 30) _c.multiplyScalar(0.6);
    mesh.instanceColor.setXYZ(i, _c.r, _c.g, _c.b);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
  }
  // selection ring + order line
  const sel = getSelectedUnit();
  ring.visible = !!sel;
  orderLine.visible = false;
  if (sel) {
    const gy = sel.type === 'navy' ? CFG.WATER_Y : G.world._h(sel.x, sel.z);
    ring.position.set(sel.x, Math.max(gy, CFG.WATER_Y) + 1.6, sel.z);
    ring.material.opacity = 0.65 + Math.sin(elapsed * 4) * 0.25;
    if (Math.abs(sel.tx - sel.x) + Math.abs(sel.tz - sel.z) > 3) {
      const p = orderLine.geometry.attributes.position.array;
      p[0] = sel.x; p[1] = Math.max(gy, CFG.WATER_Y) + 2; p[2] = sel.z;
      p[3] = sel.tx; p[4] = Math.max(G.world._h(sel.tx, sel.tz), CFG.WATER_Y) + 2; p[5] = sel.tz;
      orderLine.geometry.attributes.position.needsUpdate = true;
      orderLine.visible = true;
    }
  }
}
