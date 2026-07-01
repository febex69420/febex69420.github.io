// gfx/terrain.js — the land itself. One large displaced plane with per-vertex
// biome colors (repainted each season), animated water, road ribbons with
// bridges, national border lines and a war-time territory overlay.

import * as THREE from 'three';
import { G, CFG, seasonIndex } from '../core/state.js';
import { on } from '../core/bus.js';
import { clamp, lerp } from '../core/rng.js';
import { REBEL, frontlineProvinces, atWar } from '../sim/military.js';
import { NATION_COLORS } from '../sim/world.js';

const SEG = 220;
let terrainMesh, waterMat, borderLines, territoryMesh, frontMesh;
let scene;

export function buildTerrain(sceneRef) {
  scene = sceneRef;
  buildGround();
  buildWater();
  buildRoads();
  buildBorders();
  buildTerritoryOverlay();
  on('season', () => paintGround());
  on('province:flip', () => { rebuildBorders(); paintTerritory(); });
  on('war', () => paintTerritory());
  on('peace', () => { rebuildBorders(); paintTerritory(); });
}

// ------------------------------------------------------------------ ground --

function buildGround() {
  const M = CFG.MAP;
  const geo = new THREE.PlaneGeometry(M * 1.35, M * 1.35, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, G.world._h(pos.getX(i), pos.getZ(i)));
  }
  geo.computeVertexNormals();
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3));
  terrainMesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  terrainMesh.receiveShadow = true;
  terrainMesh.name = 'terrain';
  scene.add(terrainMesh);
  paintGround();
}

const BIOME = {
  // [spring, summer, autumn, winter]
  grass: [0x6da24e, 0x7aa848, 0x9a8f42, 0xd8dee6],
  dry: [0x8fa055, 0xa3a352, 0xa8894a, 0xcdd4dc],
  rock: [0x8a8578, 0x8a8578, 0x857f74, 0x9aa0a8],
  snow: [0xe8ecf2, 0xdfe4ea, 0xe8ecf2, 0xf2f5fa],
  sand: [0xc9bd8f, 0xcfc394, 0xc9bd8f, 0xd8d3b8],
  deep: [0x1d4e63, 0x1d4e63, 0x1c4a5e, 0x1a4356],
};

function paintGround() {
  const season = seasonIndex();
  const geo = terrainMesh.geometry;
  const pos = geo.attributes.position, col = geo.attributes.color;
  const c = new THREE.Color(), tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i);
    const moist = G.world._moist(x, z);
    if (y < CFG.WATER_Y - 2) c.setHex(BIOME.deep[season]);
    else if (y < CFG.WATER_Y + 1.2) c.setHex(BIOME.sand[season]);
    else {
      const base = moist > 0.45 ? BIOME.grass[season] : BIOME.dry[season];
      c.setHex(base);
      // altitude blending → rock → snow
      if (y > 34) c.lerp(tmp.setHex(BIOME.rock[season]), clamp((y - 34) / 30, 0, 1));
      if (y > (season === 3 ? 30 : 68)) c.lerp(tmp.setHex(BIOME.snow[season]), clamp((y - (season === 3 ? 30 : 68)) / 22, 0, 1));
      // subtle variation
      const n = (G.world._forest(x * 1.7, z * 1.7) - 0.5) * 0.12;
      c.offsetHSL(0, 0, n);
    }
    col.setXYZ(i, c.r, c.g, c.b);
  }
  col.needsUpdate = true;
}

// ------------------------------------------------------------------- water --

function buildWater() {
  const M = CFG.MAP;
  const geo = new THREE.PlaneGeometry(M * 1.35, M * 1.35, 48, 48);
  geo.rotateX(-Math.PI / 2);
  waterMat = new THREE.MeshPhongMaterial({
    color: 0x2e6f8e, transparent: true, opacity: 0.82, shininess: 140,
    specular: 0x99ccee, depthWrite: false,
  });
  waterMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    waterMat.userData.shader = shader;
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       transformed.y += sin(position.x * 0.02 + uTime * 1.4) * 0.35 + cos(position.z * 0.025 + uTime * 1.1) * 0.3;`
    );
  };
  const water = new THREE.Mesh(geo, waterMat);
  water.position.y = CFG.WATER_Y;
  water.renderOrder = 1;
  scene.add(water);
}

export function updateTerrain(dt, elapsed) {
  if (waterMat?.userData.shader) waterMat.userData.shader.uniforms.uTime.value = elapsed;
  if (frontMesh) {
    frontMesh.material.opacity = 0.25 + Math.sin(elapsed * 3) * 0.15;
    if (Math.floor(elapsed) % 2 === 0 && !frontMesh.userData.fresh) { paintFrontline(); frontMesh.userData.fresh = true; }
    else if (Math.floor(elapsed) % 2 === 1) frontMesh.userData.fresh = false;
  }
}

// ------------------------------------------------------------------- roads --

let roadMesh = null;

function roadGeometry() {
  const geos = [];
  for (const road of G.world.roads) {
    const pts = road.pts;
    if (pts.length < 2) continue;
    const isRail = road.kind === 'rail';
    const verts = [], cols = [];
    const W = isRail ? 2.4 : 3.2;
    for (let i = 0; i < pts.length; i++) {
      const [x, z, bridge] = pts[i];
      const next = pts[Math.min(i + 1, pts.length - 1)];
      const prev = pts[Math.max(i - 1, 0)];
      let dx = next[0] - prev[0], dz = next[1] - prev[1];
      const d = Math.hypot(dx, dz) || 1;
      const px = -dz / d * W, pz = dx / d * W;
      const y = bridge ? CFG.WATER_Y + 1.6 : G.world._h(x, z) + 0.25;
      verts.push(x - px, y, z - pz, x + px, y, z + pz);
      const shade = bridge ? 0.42 : isRail ? 0.36 : 0.30;
      const rb = isRail ? 0.9 : 1.06;
      cols.push(shade, shade * (isRail ? 0.92 : 1), shade * rb, shade, shade * (isRail ? 0.92 : 1), shade * rb);
    }
    const idx = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, e = i * 2 + 3;
      idx.push(a, b, c, b, e, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cols), 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    geos.push(g.toNonIndexed());
  }
  if (!geos.length) return null;
  let total = 0;
  for (const g of geos) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3), col = new Float32Array(total * 3), nor = new Float32Array(total * 3);
  let off = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, off * 3);
    col.set(g.attributes.color.array, off * 3);
    nor.set(g.attributes.normal.array, off * 3);
    off += g.attributes.position.count;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  merged.setAttribute('color', new THREE.BufferAttribute(col, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return merged;
}

function buildRoads() {
  const geo = roadGeometry();
  if (!geo) return;
  roadMesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  roadMesh.receiveShadow = true;
  scene.add(roadMesh);
}

/** Called after the player lays a new road/railway. */
export function rebuildRoadMesh() {
  if (roadMesh) { scene.remove(roadMesh); roadMesh.geometry.dispose(); roadMesh = null; }
  buildRoads();
}

// ------------------------------------------------------------------ borders --

function borderGeometry() {
  const n = CFG.PROV_N, cs = CFG.MAP / n, grid = G.world.provGrid, provs = G.world.provinces;
  const verts = [];
  const lift = (x, z) => Math.max(G.world._h(x, z), CFG.WATER_Y) + 1.2;
  for (const p of provs) {
    // right & bottom edges only (avoids duplicates)
    for (const [dx, dz] of [[1, 0], [0, 1]]) {
      const jx = p.ix + dx, jz = p.iz + dz;
      let other = -1;
      if (jx < n && jz < n) {
        const q = grid[jz * n + jx];
        other = q >= 0 ? provs[q].owner : -1;
      }
      if (other === p.owner || other === -1) continue;
      // edge between cell (ix,iz) and neighbor — draw a segmented line
      const x0 = -CFG.MAP / 2 + (p.ix + (dx ? 1 : 0)) * cs;
      const z0 = -CFG.MAP / 2 + (p.iz + (dz ? 1 : 0)) * cs;
      const steps = 4;
      for (let s = 0; s < steps; s++) {
        const t0 = s / steps, t1 = (s + 1) / steps;
        const ax = dx ? x0 : x0 + t0 * cs, az = dx ? z0 + t0 * cs : z0;
        const bx = dx ? x0 : x0 + t1 * cs, bz = dx ? z0 + t1 * cs : z0;
        verts.push(ax, lift(ax, az), az, bx, lift(bx, bz), bz);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
  return g;
}

function buildBorders() {
  borderLines = new THREE.LineSegments(borderGeometry(),
    new THREE.LineBasicMaterial({ color: 0xf2f4f8, transparent: true, opacity: 0.5 }));
  scene.add(borderLines);
}

function rebuildBorders() {
  borderLines.geometry.dispose();
  borderLines.geometry = borderGeometry();
}

// ------------------------------------------------------- territory overlay --

function buildTerritoryOverlay() {
  const provs = G.world.provinces;
  const cs = CFG.MAP / CFG.PROV_N;
  const quad = new THREE.PlaneGeometry(cs, cs);
  quad.rotateX(-Math.PI / 2);
  territoryMesh = new THREE.InstancedMesh(quad,
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.16, depthWrite: false }), provs.length);
  const m = new THREE.Matrix4();
  for (const p of provs) {
    m.makeTranslation(p.x, Math.max(G.world._h(p.x, p.z), CFG.WATER_Y) + 2.4, p.z);
    territoryMesh.setMatrixAt(p.id, m);
  }
  territoryMesh.visible = false;
  territoryMesh.renderOrder = 2;
  scene.add(territoryMesh);

  frontMesh = new THREE.InstancedMesh(quad.clone(),
    new THREE.MeshBasicMaterial({ color: 0xff3322, transparent: true, opacity: 0.3, depthWrite: false }), 140);
  frontMesh.count = 0;
  frontMesh.renderOrder = 3;
  scene.add(frontMesh);
  paintTerritory();
}

export function setTerritoryVisible(v) { territoryMesh.visible = v; }
export function territoryVisible() { return territoryMesh.visible; }
export function getTerrainMesh() { return terrainMesh; }

const REBEL_COLOR = 0x66161d;
export function paintTerritory() {
  const c = new THREE.Color();
  for (const p of G.world.provinces) {
    c.setHex(p.owner === REBEL ? REBEL_COLOR : (NATION_COLORS[p.owner] ?? 0x555555));
    territoryMesh.setColorAt(p.id, c);
  }
  if (territoryMesh.instanceColor) territoryMesh.instanceColor.needsUpdate = true;
  paintFrontline();
}

function paintFrontline() {
  const list = frontlineProvinces().slice(0, 140);
  const m = new THREE.Matrix4();
  frontMesh.count = list.length;
  let i = 0;
  for (const p of list) {
    m.makeTranslation(p.x, Math.max(G.world._h(p.x, p.z), CFG.WATER_Y) + 2.8, p.z);
    frontMesh.setMatrixAt(i++, m);
  }
  frontMesh.instanceMatrix.needsUpdate = true;
}
