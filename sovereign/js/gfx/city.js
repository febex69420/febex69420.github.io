// gfx/city.js — every structure in the world, rendered through one
// InstancedMesh per building archetype. Also owns trees (with seasonal
// foliage), street lamps that glow at night, settlement name labels and
// construction-site scaffolding.

import * as THREE from 'three';
import { G, CFG, seasonIndex } from '../core/state.js';
import { on } from '../core/bus.js';
import { bake, bakedMaterial, makeLabel } from './geom.js';
import { clamp } from '../core/rng.js';

const RESERVE = 260;          // spare instance slots per popular type for construction
let scene;
const meshes = {};            // type → InstancedMesh
const slotOf = {};            // building id → {type, i}
const slotBuilding = {};      // type → array of building ids by slot
let treePine, treeBroad, lampMesh, lampMat;
let labels = [];
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

// ------------------------------------------------------- geometry catalog --

const C = {
  wallA: 0xd9cbb2, wallB: 0xc4b49a, roof: 0x9c4f34, roofB: 0x6e4632,
  concrete: 0xb0aca2, dark: 0x5a5751, metal: 0x8b9299, white: 0xe8e6e0,
  olive: 0x6b6f4a, wood: 0x8a6844, gold: 0xd6a83c, glass: 0x6c8fa8,
};

function housePart(w, h, d, wall, roofC) {
  return [
    { shape: 'box', size: [w, h, d], pos: [0, h / 2, 0], color: wall },
    { shape: 'cone', size: [Math.max(w, d) * 0.72, h * 0.62, 4], pos: [0, h + h * 0.31, 0], rotY: Math.PI / 4, color: roofC },
  ];
}

const GEO_BUILDERS = {
  house: () => bake([...housePart(8, 4.6, 7, C.wallA, C.roof),
    { shape: 'box', size: [1.4, 2.4, 1.4], pos: [2.4, 5.6, 1.5], color: C.roofB }]),
  apartment: () => bake([
    { shape: 'box', size: [11, 17, 9], pos: [0, 8.5, 0], color: C.concrete },
    { shape: 'box', size: [11.4, 0.8, 9.4], pos: [0, 17.4, 0], color: C.dark },
    { shape: 'box', size: [1.6, 17, 9.2], pos: [-3.2, 8.5, 0.2], color: 0xa39e93 },
  ]),
  hall: () => bake([
    { shape: 'box', size: [15, 7.5, 11], pos: [0, 3.75, 0], color: 0xcfc6b8 },
    { shape: 'box', size: [16, 1, 12], pos: [0, 8, 0], color: C.dark },
    ...[-5, -1.7, 1.7, 5].map((x) => ({ shape: 'cyl', size: [0.55, 0.55, 7, 6], pos: [x, 3.5, 6], color: C.white })),
    { shape: 'box', size: [16, 1.2, 2.5], pos: [0, 7.4, 6], color: C.white },
  ]),
  palace: () => bake([
    { shape: 'box', size: [26, 9, 15], pos: [0, 4.5, 0], color: 0xe3d9c6 },
    { shape: 'box', size: [8, 12, 8], pos: [0, 6, 0], color: 0xd9cdb4 },
    { shape: 'sphere', size: [4.6, 10, 8], pos: [0, 13.5, 0], color: C.gold },
    ...[-9, 9].map((x) => ({ shape: 'box', size: [5, 11, 5], pos: [x, 5.5, 0], color: 0xd9cdb4 })),
    ...[-9, 9].map((x) => ({ shape: 'cone', size: [3.6, 3.4, 4], pos: [x, 12.6, 0], rotY: 0.78, color: C.roofB })),
    ...[-4.5, -1.5, 1.5, 4.5].map((x) => ({ shape: 'cyl', size: [0.5, 0.5, 8, 6], pos: [x, 4, 7.8], color: C.white })),
  ]),
  school: () => bake([
    { shape: 'box', size: [16, 6, 8], pos: [0, 3, 0], color: 0xc9b795 },
    { shape: 'box', size: [8, 6, 8], pos: [4, 3, 6], color: 0xbfae8d },
    { shape: 'box', size: [17, 0.8, 9], pos: [0, 6.4, 0], color: C.roofB },
  ]),
  hospital: () => bake([
    { shape: 'box', size: [16, 11, 10], pos: [0, 5.5, 0], color: C.white },
    { shape: 'box', size: [4.5, 1.2, 0.8], pos: [0, 8.5, 5.1], color: 0xd03a2e },
    { shape: 'box', size: [1.2, 4.5, 0.8], pos: [0, 8.5, 5.1], color: 0xd03a2e },
  ]),
  university: () => bake([
    { shape: 'box', size: [20, 8, 12], pos: [0, 4, 0], color: 0xcfc0a6 },
    { shape: 'sphere', size: [4, 10, 8], pos: [0, 9.5, 0], color: 0x4e7a68 },
    ...[-7, -2.4, 2.4, 7].map((x) => ({ shape: 'cyl', size: [0.55, 0.55, 7.5, 6], pos: [x, 3.75, 6.5], color: C.white })),
  ]),
  church: () => bake([
    { shape: 'box', size: [8, 6, 13], pos: [0, 3, 0], color: 0xd8d0c0 },
    { shape: 'cone', size: [5.6, 3.6, 4], pos: [0, 7.8, 0], rotY: 0.78, color: C.roofB },
    { shape: 'box', size: [3.4, 11, 3.4], pos: [0, 5.5, 7], color: 0xd8d0c0 },
    { shape: 'cone', size: [2.6, 4.5, 4], pos: [0, 13, 7], rotY: 0.78, color: C.roofB },
  ]),
  market: () => bake([
    { shape: 'box', size: [14, 0.6, 10], pos: [0, 4.2, 0], color: 0xc25048 },
    ...[-5, 5].flatMap((x) => [-3.5, 3.5].map((z) => ({ shape: 'cyl', size: [0.35, 0.35, 4.2, 5], pos: [x, 2.1, z], color: C.wood }))),
    { shape: 'box', size: [3.4, 1.6, 2.2], pos: [-3, 0.8, 0], color: 0x6fa055 },
    { shape: 'box', size: [3.4, 1.6, 2.2], pos: [2, 0.8, 1.6], color: 0xc9a03a },
  ]),
  factory: () => bake([
    { shape: 'box', size: [18, 8, 12], pos: [0, 4, 0], color: 0x9a958c },
    { shape: 'box', size: [18, 2.4, 4], pos: [0, 9.2, -3], color: 0x847f76 },
    { shape: 'cyl', size: [1.1, 1.4, 13, 7], pos: [6, 6.5, 3.5], color: 0x77726a },
    { shape: 'cyl', size: [0.9, 1.2, 10, 7], pos: [3, 5, 3.5], color: 0x77726a },
  ]),
  warehouse: () => bake([
    { shape: 'box', size: [14, 6, 10], pos: [0, 3, 0], color: 0x8c7d64 },
    { shape: 'cyl', size: [5, 5, 14, 3, 1, false, 0, Math.PI], pos: [0, 6, 0], rotX: Math.PI / 2, rotY: Math.PI / 2, color: 0x9c8d74 },
  ]),
  farm: () => bake([
    { shape: 'box', size: [10, 5, 8], pos: [0, 2.5, 0], color: 0xa8402f },
    { shape: 'cone', size: [7, 3, 4], pos: [0, 6.5, 0], rotY: 0.78, color: 0x7a3325 },
    { shape: 'cyl', size: [2.2, 2.2, 9, 8], pos: [8, 4.5, 0], color: 0xb8b2a4 },
    { shape: 'sphere', size: [2.2, 8, 6], pos: [8, 9, 0], color: 0x9c968a },
  ]),
  field: () => bake([
    { shape: 'box', size: [26, 0.5, 18], pos: [0, 0.25, 0], color: 0x8a9a3e },
    { shape: 'box', size: [26, 0.6, 3], pos: [0, 0.3, -5], color: 0x9aa848 },
    { shape: 'box', size: [26, 0.6, 3], pos: [0, 0.3, 3], color: 0x7e8c38 },
  ]),
  powerplant: () => bake([
    { shape: 'box', size: [16, 9, 12], pos: [0, 4.5, 0], color: 0x8f8a80 },
    { shape: 'cyl', size: [1.6, 2, 18, 8], pos: [5, 9, 3], color: 0xa8a29a },
    { shape: 'box', size: [6, 5, 6], pos: [-6, 2.5, 4], color: 0x77726a },
  ]),
  nuclear: () => bake([
    { shape: 'cyl', size: [3.4, 5.4, 16, 10], pos: [-5, 8, 0], color: 0xcfd2d6 },
    { shape: 'cyl', size: [3.4, 5.4, 16, 10], pos: [5, 8, 3], color: 0xcfd2d6 },
    { shape: 'sphere', size: [4.4, 10, 8], pos: [1, 3, -6], color: 0xb8bcc2 },
    { shape: 'box', size: [10, 4, 6], pos: [1, 2, -12], color: 0x9a958c },
  ]),
  barracks: () => bake([
    { shape: 'box', size: [16, 4, 7], pos: [0, 2, 0], color: C.olive },
    { shape: 'box', size: [17, 0.7, 8], pos: [0, 4.4, 0], color: 0x55583a },
  ]),
  bunker: () => bake([
    { shape: 'box', size: [9, 3, 9], pos: [0, 1.5, 0], color: 0x707068 },
    { shape: 'box', size: [9.5, 0.9, 9.5], pos: [0, 3.2, 0], color: 0x606058 },
    { shape: 'box', size: [5, 0.7, 0.6], pos: [0, 2.2, 4.6], color: 0x2a2a26 },
  ]),
  wall: () => bake([
    { shape: 'box', size: [14, 4.4, 1.8], pos: [0, 2.2, 0], color: 0x8a8a82 },
    ...[-6, 6].map((x) => ({ shape: 'box', size: [2.4, 5.6, 2.4], pos: [x, 2.8, 0], color: 0x7a7a72 })),
  ]),
  tower: () => bake([
    { shape: 'cyl', size: [1.6, 2.2, 13, 7], pos: [0, 6.5, 0], color: C.concrete },
    { shape: 'box', size: [5, 2.6, 5], pos: [0, 14.3, 0], color: C.glass },
    { shape: 'box', size: [5.6, 0.6, 5.6], pos: [0, 15.9, 0], color: C.dark },
  ]),
  runway: () => bake([
    { shape: 'box', size: [95, 0.5, 13], pos: [0, 0.25, 0], color: 0x55565a },
    ...[-36, -18, 0, 18, 36].map((x) => ({ shape: 'box', size: [7, 0.6, 0.9], pos: [x, 0.3, 0], color: 0xd8d8d0 })),
  ]),
  hangar: () => bake([
    { shape: 'cyl', size: [6, 6, 14, 10, 1, false, 0, Math.PI], pos: [0, 0, 0], rotX: -Math.PI / 2, rotY: Math.PI, color: 0x8a9078 },
    { shape: 'box', size: [12.5, 0.4, 14], pos: [0, 0.2, 0], color: 0x6a6a62 },
  ]),
  dock: () => bake([
    { shape: 'box', size: [8, 1.2, 34], pos: [0, 1.2, 10], color: C.wood },
    ...[0, 8, 16, 24].map((z) => ({ shape: 'cyl', size: [0.5, 0.5, 3.5, 5], pos: [3.5, 0.4, z], color: 0x6a4c30 })),
    { shape: 'box', size: [5, 4, 6], pos: [0, 2.8, -4], color: 0x9c8d74 },
  ]),
  crane: () => bake([
    { shape: 'box', size: [4, 1.6, 4], pos: [0, 0.8, 0], color: 0xc98f2e },
    { shape: 'box', size: [1.6, 16, 1.6], pos: [0, 8, 0], color: 0xc98f2e },
    { shape: 'box', size: [14, 1.2, 1.4], pos: [5, 15.5, 0], color: 0xc98f2e },
    { shape: 'box', size: [0.4, 6, 0.4], pos: [10.5, 12, 0], color: 0x555555 },
  ]),
  monument: () => bake([
    { shape: 'box', size: [7, 1.6, 7], pos: [0, 0.8, 0], color: 0xb8b2a4 },
    { shape: 'box', size: [2.6, 15, 2.6], pos: [0, 9, 0], color: 0xcfc9ba },
    { shape: 'cone', size: [1.9, 2.6, 4], pos: [0, 17.7, 0], rotY: 0.78, color: C.gold },
  ]),
  park: () => bake([
    { shape: 'cyl', size: [11, 11, 0.5, 14], pos: [0, 0.25, 0], color: 0x5d9150 },
    { shape: 'cyl', size: [0.5, 0.6, 3.4, 5], pos: [-4, 1.7, -2], color: 0x6a4c30 },
    { shape: 'sphere', size: [2.6, 7, 6], pos: [-4, 4.6, -2], color: 0x4a7a3a },
    { shape: 'cyl', size: [0.4, 0.5, 2.8, 5], pos: [4, 1.4, 3], color: 0x6a4c30 },
    { shape: 'sphere', size: [2.1, 7, 6], pos: [4, 3.9, 3], color: 0x548544 },
    { shape: 'cyl', size: [2.6, 2.6, 0.7, 10], pos: [2, 0.35, -4], color: 0x7ab3c9 },
  ]),
  police: () => bake([
    { shape: 'box', size: [12, 7, 9], pos: [0, 3.5, 0], color: 0x9fa6b2 },
    { shape: 'box', size: [12.5, 1, 9.5], pos: [0, 7.5, 0], color: 0x3a4a6a },
    { shape: 'box', size: [4, 1.4, 0.6], pos: [0, 5.5, 4.7], color: 0x3a4a9a },
  ]),
  lab: () => bake([
    { shape: 'box', size: [13, 6, 9], pos: [0, 3, 0], color: C.white },
    { shape: 'sphere', size: [3, 10, 8], pos: [-3, 7.4, 0], color: 0xb9c4cc },
    { shape: 'cyl', size: [0.3, 0.3, 5, 5], pos: [4, 8.5, 2], color: C.metal },
  ]),
  plaza: () => bake([
    { shape: 'cyl', size: [16, 16, 0.5, 18], pos: [0, 0.25, 0], color: 0xb5ac98 },
    { shape: 'cyl', size: [2.4, 2.8, 1.2, 10], pos: [0, 0.85, 0], color: 0x9a917d },
    { shape: 'cyl', size: [1.4, 1.4, 2.6, 8], pos: [0, 2.2, 0], color: 0x8b8270 },
  ]),
  parade: () => bake([
    { shape: 'box', size: [30, 0.5, 20], pos: [0, 0.25, 0], color: 0x9a9890 },
    { shape: 'box', size: [1, 9, 1], pos: [-12, 4.5, -8], color: C.metal },
  ]),
  depot: () => bake([
    { shape: 'box', size: [10, 4.5, 8], pos: [0, 2.25, 0], color: 0x7d7f6a },
    { shape: 'box', size: [2.6, 2.6, 2.6], pos: [4, 1.3, 5.4], color: 0x8a6844 },
    { shape: 'box', size: [2.2, 2.2, 2.2], pos: [6.6, 1.1, 4.4], color: 0x77572f },
  ]),
  housing: () => bake([...housePart(9, 5, 8, 0xcabb9e, 0x8c4a30)]),
  bridgestub: () => bake([{ shape: 'box', size: [6, 1, 6], pos: [0, 0.5, 0], color: 0x777777 }]),
};

export function getBuildingGeometry(type) {
  return (GEO_BUILDERS[type] || GEO_BUILDERS.house)();
}

// ------------------------------------------------------------ instancing --

export function buildCity(sceneRef) {
  scene = sceneRef;
  // count buildings per type
  const byType = {};
  for (const b of G.world.buildings) (byType[b.type] ||= []).push(b);
  const CONSTRUCTIBLE = ['house', 'housing', 'apartment', 'school', 'hospital', 'university', 'factory', 'farm', 'field',
    'powerplant', 'nuclear', 'barracks', 'bunker', 'wall', 'monument', 'park', 'lab', 'hangar', 'runway', 'dock', 'tower', 'police', 'market', 'church', 'warehouse'];
  for (const type of new Set([...Object.keys(byType), ...CONSTRUCTIBLE])) {
    const list = byType[type] || [];
    const cap = list.length + (CONSTRUCTIBLE.includes(type) ? RESERVE : 8);
    const mesh = new THREE.InstancedMesh(getBuildingGeometry(type), bakedMaterial(), cap);
    mesh.count = 0;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'b:' + type;
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    scene.add(mesh);
    meshes[type] = mesh;
    slotBuilding[type] = [];
  }
  for (const b of G.world.buildings) addBuildingInstance(b);
  buildTrees();
  buildLamps();
  buildLabels();
  on('season', () => tintTrees());
  on('province:flip', () => refreshLabels());
}

export function addBuildingInstance(b) {
  const mesh = meshes[b.type];
  if (!mesh || mesh.count >= mesh.instanceMatrix.count) return;
  const i = mesh.count++;
  slotOf[b.id] = { type: b.type, i };
  slotBuilding[b.type][i] = b.id;
  writeMatrix(b, i);
  mesh.instanceMatrix.needsUpdate = true;
}

function writeMatrix(b, i) {
  const mesh = meshes[b.type];
  const y = Math.max(G.world._h(b.x, b.z), CFG.WATER_Y - 0.5);
  const grow = b.underConstruction ? clamp(0.15 + (b.progress || 0) * 0.85, 0.15, 1) : 1;
  _p.set(b.x, y - 0.15, b.z);
  _q.setFromAxisAngle(_up, b.rot || 0);
  _s.set(1, grow, 1);
  _m.compose(_p, _q, _s);
  mesh.setMatrixAt(i, _m);
  // damaged or in-progress buildings look darker / dustier
  const shade = b.underConstruction ? 0.55 : b.hp < 50 ? 0.45 : 1;
  mesh.instanceColor.setXYZ(i, shade, shade * (b.hp < 50 ? 0.9 : 1), shade * (b.hp < 50 ? 0.85 : 1));
  mesh.instanceColor.needsUpdate = true;
}

export function refreshBuildingInstance(b) {
  const slot = slotOf[b.id];
  if (!slot) return;
  writeMatrix(b, slot.i);
  meshes[b.type].instanceMatrix.needsUpdate = true;
}

export function removeBuildingInstance(b) {
  const slot = slotOf[b.id];
  if (!slot) return;
  const mesh = meshes[slot.type];
  const last = mesh.count - 1;
  const lastId = slotBuilding[slot.type][last];
  if (last !== slot.i && lastId !== undefined) {
    // move last instance into the vacated slot
    mesh.getMatrixAt(last, _m);
    mesh.setMatrixAt(slot.i, _m);
    mesh.instanceColor.setXYZ(slot.i, mesh.instanceColor.getX(last), mesh.instanceColor.getY(last), mesh.instanceColor.getZ(last));
    slotOf[lastId] = { type: slot.type, i: slot.i };
    slotBuilding[slot.type][slot.i] = lastId;
  }
  mesh.count = last;
  slotBuilding[slot.type].length = last;
  delete slotOf[b.id];
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
}

// -------------------------------------------------------------------- trees --

const PINE_CANOPY = [0x33613a, 0x2f6b36, 0x585e3c, 0x4c5a52];
const BROAD_CANOPY = [0x4d8a3d, 0x4a9440, 0xb0742e, 0xd9dde2];

function buildTrees() {
  const pineGeo = bake([
    { shape: 'cyl', size: [0.4, 0.6, 3, 5], pos: [0, 1.5, 0], color: 0x6a4c30 },
    { shape: 'cone', size: [2.6, 4.4, 7], pos: [0, 4.6, 0], color: 0xffffff },
    { shape: 'cone', size: [1.9, 3.4, 7], pos: [0, 7.2, 0], color: 0xf2f2f2 },
  ]);
  const broadGeo = bake([
    { shape: 'cyl', size: [0.5, 0.7, 3.4, 5], pos: [0, 1.7, 0], color: 0x77543a },
    { shape: 'sphere', size: [3.1, 7, 6], pos: [0, 5.6, 0], color: 0xffffff },
  ]);
  const pines = G.world.trees.filter((t) => t.t === 0);
  const broads = G.world.trees.filter((t) => t.t === 1);
  treePine = new THREE.InstancedMesh(pineGeo, bakedMaterial(), Math.max(1, pines.length));
  treeBroad = new THREE.InstancedMesh(broadGeo, bakedMaterial(), Math.max(1, broads.length));
  for (const [mesh, list] of [[treePine, pines], [treeBroad, broads]]) {
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(mesh.instanceMatrix.count * 3).fill(1), 3);
    mesh.castShadow = true;
    let i = 0;
    for (const t of list) {
      _p.set(t.x, G.world._h(t.x, t.z) - 0.2, t.z);
      _q.setFromAxisAngle(_up, (t.x * 13.7) % 6.28);
      _s.setScalar(t.s);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i++, _m);
    }
    mesh.count = list.length;
    scene.add(mesh);
  }
  tintTrees();
}

function tintTrees() {
  const s = seasonIndex();
  const c = new THREE.Color();
  for (const [mesh, palette] of [[treePine, PINE_CANOPY], [treeBroad, BROAD_CANOPY]]) {
    c.setHex(palette[s]);
    for (let i = 0; i < mesh.count; i++) {
      const j = (i * 7) % 10;
      mesh.instanceColor.setXYZ(i, c.r * (0.9 + j * 0.02), c.g * (0.9 + j * 0.02), c.b * (0.9 + j * 0.02));
    }
    mesh.instanceColor.needsUpdate = true;
  }
}

// -------------------------------------------------------------------- lamps --

function buildLamps() {
  const geo = bake([
    { shape: 'cyl', size: [0.14, 0.2, 5.4, 5], pos: [0, 2.7, 0], color: 0x44464a },
    { shape: 'sphere', size: [0.55, 6, 5], pos: [0, 5.6, 0], color: 0xffe9b0 },
  ]);
  lampMat = new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0xffdf8a, emissiveIntensity: 0 });
  const spots = [];
  for (const s of G.world.settlements) {
    if (s.mil) continue;
    const n = s.type === 'capital' ? 8 : s.type === 'city' ? 6 : 4;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      spots.push([s.x + Math.cos(a) * 20, s.z + Math.sin(a) * 20]);
    }
  }
  lampMesh = new THREE.InstancedMesh(geo, lampMat, spots.length);
  let i = 0;
  for (const [x, z] of spots) {
    _p.set(x, G.world._h(x, z), z);
    _q.identity(); _s.setScalar(1);
    _m.compose(_p, _q, _s);
    lampMesh.setMatrixAt(i++, _m);
  }
  scene.add(lampMesh);
}

// -------------------------------------------------------------------- labels --

function buildLabels() {
  for (const s of G.world.settlements) {
    const label = makeLabel(s.name, { size: s.type === 'capital' ? 30 : 22, color: s.type === 'capital' ? '#ffd97a' : '#e8eef8' });
    label.position.set(s.x, G.world._h(s.x, s.z) + (s.type === 'capital' ? 46 : 34), s.z);
    label.userData.sid = s.id;
    label.userData.bx = label.scale.x;
    label.userData.by = label.scale.y;
    scene.add(label);
    labels.push(label);
  }
}

function refreshLabels() { /* occupation is drawn on minimap; labels stay */ }

/** Per-frame: lamp glow at night, label visibility by camera height. */
export function updateCity(camera) {
  const h = G.time.hour;
  const night = h < 6.2 || h > 18.5;
  lampMat.emissiveIntensity = night ? 1.6 : 0;
  const high = camera.position.y > 130;
  for (const label of labels) {
    label.visible = high;
    if (high) {
      const d = camera.position.distanceTo(label.position);
      const k = clamp(d / 700, 0.6, 3.2);
      label.scale.set(label.userData.bx * k, label.userData.by * k, 1);
    }
  }
}
