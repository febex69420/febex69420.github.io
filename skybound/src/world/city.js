// city.js — Lumera City: deterministic procedural generation + region-chunked instanced
// rendering, a sliceable/destructible registry, static colliders, and world queries.
//
// generateCityPlan() is pure (no THREE) for deterministic unit tests. The City class
// turns a plan into instanced meshes grouped by REGION so frustum/distance culling and
// streaming work without per-frame matrix churn.
import * as THREE from 'three';
import { clamp } from '../core/util.js';
import {
  BLOCK, ROAD, CELL, GRID, REGION, HALF, DISTRICT, DISTRICT_NAME, generateCityPlan,
} from './cityplan.js';

export { BLOCK, ROAD, CELL, GRID, REGION, HALF, DISTRICT, DISTRICT_NAME, generateCityPlan };

// -------------------------------------------------------- City (THREE) ----
export class City {
  constructor(scene, assets, settings, plan) {
    this.scene = scene; this.assets = assets; this.settings = settings;
    this.plan = plan;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.sliceables = new Map();        // buildingId -> registry entry
    this.colliderGrid = new Map();      // "cx,cz" -> [AABB]
    this.regions = [];                  // region chunks for culling
    this.landmarks = plan.landmarks;

    this._unitBox = new THREE.BoxGeometry(1, 1, 1);
    this._facades = [];
    for (let i = 0; i < 6; i++) {
      const map = assets.facade(i + 1, false);
      const litMap = assets.facade(i + 1, true);
      this._facades.push(new THREE.MeshStandardMaterial({ map, roughness: 0.82, metalness: 0.12, emissiveMap: litMap, emissive: 0x000000 }));
    }
    this._roofMat = new THREE.MeshStandardMaterial({ color: 0x44474c, roughness: 0.9 });
    this._build();
  }

  _colliderKey(x, z) { return Math.floor(x / CELL) + ',' + Math.floor(z / CELL); }
  _addCollider(aabb) {
    const cx = Math.floor((aabb.min.x + aabb.max.x) / 2 / CELL);
    const cz = Math.floor((aabb.min.z + aabb.max.z) / 2 / CELL);
    const k = cx + ',' + cz;
    let arr = this.colliderGrid.get(k); if (!arr) this.colliderGrid.set(k, (arr = []));
    arr.push(aabb);
  }

  staticCollidersNear(x, z, radius = CELL) {
    const out = [];
    const c = Math.ceil(radius / CELL) + 1;
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (let dz = -c; dz <= c; dz++) for (let dx = -c; dx <= c; dx++) {
      const arr = this.colliderGrid.get((cx + dx) + ',' + (cz + dz));
      if (arr) for (const a of arr) if (!a.removed) out.push(a);
    }
    return out;
  }

  _build() {
    const plan = this.plan;
    // ground base (asphalt)
    const gmat = new THREE.MeshStandardMaterial({ map: this.assets.ground('asphalt'), roughness: 0.95, metalness: 0 });
    const gsize = plan.worldSize + CELL * 2;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(gsize, gsize), gmat);
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.receiveShadow = true;
    this.group.add(ground);

    // water plane
    const water = new THREE.Mesh(new THREE.PlaneGeometry(gsize, gsize),
      new THREE.MeshStandardMaterial({ color: 0x244a63, transparent: true, opacity: 0.82, roughness: 0.2, metalness: 0.5 }));
    water.rotation.x = -Math.PI / 2; water.position.y = -0.6;
    this._water = water;

    // region buckets
    const regCols = Math.ceil(GRID / REGION);
    const regions = {};
    const regionOf = (gx, gz) => Math.floor(gx / REGION) + '_' + Math.floor(gz / REGION);
    for (const block of plan.blocks) {
      const rk = regionOf(block.gx, block.gz);
      if (!regions[rk]) regions[rk] = { blocks: [], buildings: [], props: [], tops: [] };
      regions[rk].blocks.push(block);
      for (const b of block.buildings) regions[rk].buildings.push(b);
      for (const p of block.props) regions[rk].props.push(p);
    }

    // sidewalk / grass / sand block-top tiles merged per region
    for (const rk in regions) this._buildRegion(rk, regions[rk]);

    // beach + sea grouping
    this.group.add(water);
    void regCols;
  }

  _districtTopColor(d) {
    switch (d) {
      case DISTRICT.PARK: return 0x3f7a3a;
      case DISTRICT.BEACH: return 0xcdb98a;
      case DISTRICT.PLAZA: return 0x9a9da2;
      case DISTRICT.WATER: return null;
      default: return 0x6b6f74; // sidewalk concrete
    }
  }

  _buildRegion(rk, reg) {
    const node = new THREE.Group();
    node.name = 'region_' + rk;
    const bounds = new THREE.Box3();

    // seed bounds with block centers so regions without buildings (beach/water) are valid
    for (const block of reg.blocks) bounds.expandByPoint(new THREE.Vector3(block.x, 0, block.z));

    // ---- block top tiles (merged) ----
    const tilePos = [], tileNorm = [], tileCol = [], tileIdx = [];
    let vbase = 0;
    const c = new THREE.Color();
    for (const block of reg.blocks) {
      const col = this._districtTopColor(block.district);
      if (col == null) continue;
      c.set(col);
      const s = BLOCK / 2 + (block.district === DISTRICT.PARK || block.district === DISTRICT.BEACH ? ROAD * 0.3 : -1);
      const y = block.district === DISTRICT.BEACH ? 0.02 : 0.06;
      const xs = [block.x - s, block.x + s], zs = [block.z - s, block.z + s];
      const verts = [[xs[0], y, zs[0]], [xs[1], y, zs[0]], [xs[1], y, zs[1]], [xs[0], y, zs[1]]];
      for (const v of verts) { tilePos.push(v[0], v[1], v[2]); tileNorm.push(0, 1, 0); tileCol.push(c.r, c.g, c.b); }
      tileIdx.push(vbase, vbase + 2, vbase + 1, vbase, vbase + 3, vbase + 2);
      vbase += 4;
    }
    if (tilePos.length) {
      const tg = new THREE.BufferGeometry();
      tg.setAttribute('position', new THREE.Float32BufferAttribute(tilePos, 3));
      tg.setAttribute('normal', new THREE.Float32BufferAttribute(tileNorm, 3));
      tg.setAttribute('color', new THREE.Float32BufferAttribute(tileCol, 3));
      tg.setIndex(tileIdx);
      const tiles = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
      tiles.receiveShadow = true;
      node.add(tiles);
    }

    // ---- buildings bucketed by facade material ----
    const buckets = new Map(); // mat -> instances [{m,b}]
    const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
    const pushInstance = (b, cx, cy, cz, w, h, d, matIdx) => {
      let arr = buckets.get(matIdx); if (!arr) buckets.set(matIdx, (arr = []));
      tmpP.set(cx, cy, cz); tmpS.set(w, h, d);
      const matrix = new THREE.Matrix4().compose(tmpP, tmpQ.identity(), tmpS);
      arr.push({ matrix, b });
      return arr.length - 1;
    };

    for (const b of reg.buildings) {
      const entry = { id: b.id, parts: [], material: this._facades[b.mat], mass: Math.max(40, b.w * b.d * b.h * 0.02), district: b.district, instanceRefs: [], realized: false };
      // main body
      const bodyIdx = pushInstance(b, b.x, b.h / 2, b.z, b.w, b.h, b.d, b.mat);
      entry.parts.push({ center: [b.x, b.h / 2, b.z], size: [b.w, b.h, b.d], matIdx: b.mat });
      entry.instanceRefs.push({ matIdx: b.mat, localIdx: bodyIdx });
      // collider (axis-aligned)
      const aabb = { min: new THREE.Vector3(b.x - b.w / 2, 0, b.z - b.d / 2), max: new THREE.Vector3(b.x + b.w / 2, b.h, b.z + b.d / 2), id: b.id, removed: false };
      entry.aabb = aabb; this._addCollider(aabb);
      // stepped top
      if (b.stepped && b.topH > 0) {
        const tw = b.topW || b.w * 0.6;
        const tIdx = pushInstance(b, b.x, b.h + b.topH / 2, b.z, tw, b.topH, tw, b.mat);
        entry.parts.push({ center: [b.x, b.h + b.topH / 2, b.z], size: [tw, b.topH, tw], matIdx: b.mat });
        entry.instanceRefs.push({ matIdx: b.mat, localIdx: tIdx });
        aabb.max.y = b.h + b.topH;
      }
      entry.region = node;
      this.sliceables.set(b.id, entry);
    }

    // build instanced meshes per bucket
    const bucketMeshes = new Map();
    for (const [matIdx, arr] of buckets) {
      const im = new THREE.InstancedMesh(this._unitBox, this._facades[matIdx], arr.length);
      im.castShadow = true; im.receiveShadow = true;
      const col = new THREE.Color();
      for (let i = 0; i < arr.length; i++) {
        im.setMatrixAt(i, arr[i].matrix);
        col.setScalar(arr[i].b.tint).multiplyScalar(0.9);
        im.setColorAt(i, col);
        bounds.expandByPoint(new THREE.Vector3().setFromMatrixPosition(arr[i].matrix));
      }
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      node.add(im);
      bucketMeshes.set(matIdx, im);
    }
    // wire instanceRefs to real InstancedMesh + global idx
    for (const b of reg.buildings) {
      const entry = this.sliceables.get(b.id);
      for (const ref of entry.instanceRefs) ref.im = bucketMeshes.get(ref.matIdx);
    }

    // ---- props: lamps + trees (instanced, decor) ----
    this._buildProps(node, reg, bounds);

    bounds.expandByScalar(CELL);
    this.group.add(node);
    this.regions.push({ node, bounds, center: bounds.getCenter(new THREE.Vector3()), radius: bounds.getSize(new THREE.Vector3()).length() / 2 });
  }

  _buildProps(node, reg, bounds) {
    const lamps = [], trees = [];
    for (const p of reg.props) { if (p.type === 'lamp') lamps.push(p); else if (p.type === 'tree') trees.push(p); }
    if (lamps.length) {
      const geo = new THREE.CylinderGeometry(0.18, 0.22, 6, 6);
      const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.8 }), lamps.length);
      const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
      for (let i = 0; i < lamps.length; i++) { p.set(lamps[i].x, 3, lamps[i].z); m.compose(p, q, s); im.setMatrixAt(i, m); }
      im.castShadow = true; node.add(im);
      // glowing lamp head
      const hgeo = new THREE.SphereGeometry(0.4, 6, 5);
      const him = new THREE.InstancedMesh(hgeo, new THREE.MeshStandardMaterial({ color: 0xffe9b0, emissive: 0xffd070, emissiveIntensity: 1.2 }), lamps.length);
      for (let i = 0; i < lamps.length; i++) { p.set(lamps[i].x, 6.1, lamps[i].z); m.compose(p, q, s); him.setMatrixAt(i, m); }
      node.add(him);
    }
    if (trees.length) {
      const trunkGeo = new THREE.CylinderGeometry(0.3, 0.45, 4, 6);
      const folGeo = new THREE.SphereGeometry(1, 7, 6);
      const trunk = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x5a3f28, roughness: 0.9 }), trees.length);
      const fol = new THREE.InstancedMesh(folGeo, new THREE.MeshStandardMaterial({ color: 0x356b2f, roughness: 0.85 }), trees.length);
      const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
      for (let i = 0; i < trees.length; i++) {
        const t = trees[i];
        p.set(t.x, 2, t.z); s.set(1, 1, 1); m.compose(p, q, s); trunk.setMatrixAt(i, m);
        p.set(t.x, 4 + t.s * 0.4, t.z); s.set(t.s, t.s * 1.2, t.s); m.compose(p, q, s); fol.setMatrixAt(i, m);
      }
      trunk.castShadow = fol.castShadow = true;
      node.add(trunk); node.add(fol);
    }
    void bounds;
  }

  // Hide a building's instances & return convex part specs for the destruction system.
  realizeBuilding(id) {
    const entry = this.sliceables.get(id);
    if (!entry || entry.realized) return null;
    entry.realized = true;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const ref of entry.instanceRefs) {
      if (ref.im) { ref.im.setMatrixAt(ref.localIdx, zero); ref.im.instanceMatrix.needsUpdate = true; }
    }
    if (entry.aabb) entry.aabb.removed = true;
    return entry;
  }

  // ---- world queries ----
  groundY(x, z) {
    // sea region is below 0; everything else is street level 0
    const gx = Math.floor((x + HALF) / CELL), gz = Math.floor((z + HALF) / CELL);
    if (gz < this.plan.shoreRow) return -0.6;
    return 0;
  }
  districtAt(x, z) {
    const gx = clamp(Math.floor((x + HALF) / CELL), 0, GRID - 1);
    const gz = clamp(Math.floor((z + HALF) / CELL), 0, GRID - 1);
    const b = this.plan.blocks[gz * GRID + gx];
    return b ? b.district : DISTRICT.RESIDENTIAL;
  }
  districtNameAt(x, z) { return DISTRICT_NAME[this.districtAt(x, z)] || 'Lumera'; }

  spawnPoint() {
    const lm = this.landmarks[0];
    return new THREE.Vector3(lm.x, 2, lm.z + 30);
  }

  // Per-frame culling: hide far regions, frustum-cull the rest.
  update(camPos, frustum, drawDistance = 1) {
    const maxD = 1200 * drawDistance;
    for (const r of this.regions) {
      const d = r.center.distanceTo(camPos);
      let visible = d < maxD;
      if (visible && frustum) visible = frustum.intersectsSphere({ center: r.center, radius: r.radius });
      r.node.visible = visible;
    }
    if (this._water) this._water.position.set(camPos.x, -0.6, camPos.z);
  }
}
