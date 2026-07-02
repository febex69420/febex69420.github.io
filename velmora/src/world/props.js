// Nature scatter (instanced forests, rocks), street lamps, waving flags and the
// destructible prop system (crates, explosive barrels, range targets).
import * as THREE from 'three';
import { getBoxGeom, mulberry32, rand, pick, chance, dist2D } from '../core/utils.js';

export class Props {
  constructor(ctx) {
    this.ctx = ctx;
    this.destructibles = [];
    this.lampSpots = [];   // positions for instanced lamps, built once in build()
    this.time = 0;
    this._crateGeo = getBoxGeom(1.3, 1.3, 1.3);
    this._barrelGeo = new THREE.CylinderGeometry(0.55, 0.55, 1.5, 10);
    this._barrelMat = new THREE.MeshStandardMaterial({ color: 0xa03024, roughness: 0.6, metalness: 0.3 });
    this._targetMat = new THREE.MeshStandardMaterial({ color: 0xd8d2c0, roughness: 0.9 });
    this.group = new THREE.Group();
    this.group.name = 'props';
    ctx.scene.add(this.group);
  }

  // ---------- destructibles ----------
  spawnCrate(x, y, z) {
    const mesh = new THREE.Mesh(this._crateGeo, this.ctx.mats.wood);
    mesh.position.set(x, y + 0.65, z);
    mesh.rotation.y = Math.random() * Math.PI;
    mesh.castShadow = true;
    this.group.add(mesh);
    const colId = this.ctx.world.colliders.addBoxCentered(x, y, z, 1.3, 1.3, 1.3);
    this.destructibles.push({ kind: 'crate', mesh, hp: 30, colId, alive: true, r: 1.1 });
  }
  spawnBarrel(x, y, z) {
    const mesh = new THREE.Mesh(this._barrelGeo, this._barrelMat);
    mesh.position.set(x, y + 0.75, z);
    mesh.castShadow = true;
    this.group.add(mesh);
    const colId = this.ctx.world.colliders.addBoxCentered(x, y, z, 1.1, 1.5, 1.1);
    this.destructibles.push({ kind: 'barrel', mesh, hp: 20, colId, alive: true, r: 1 });
  }
  spawnTarget(x, y, z) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(getBoxGeom(0.15, 1.6, 0.15), this.ctx.mats.woodDark);
    pole.position.y = 0.8;
    const board = new THREE.Mesh(getBoxGeom(1, 1.4, 0.08), this._targetMat);
    board.position.y = 2.1;
    g.add(pole, board);
    g.position.set(x, y, z);
    this.group.add(g);
    this.destructibles.push({ kind: 'target', mesh: g, hp: 10, colId: null, alive: true, r: 1, respawn: 0 });
  }

  // returns true if something took the hit
  hitAt(point, damage) {
    for (const d of this.destructibles) {
      if (!d.alive) continue;
      const p = d.mesh.position;
      if (Math.abs(point.x - p.x) < d.r && Math.abs(point.z - p.z) < d.r && Math.abs(point.y - (p.y + 0.5)) < 2.2) {
        this.damage(d, damage);
        return true;
      }
    }
    return false;
  }

  damage(d, amount) {
    if (!d.alive) return;
    d.hp -= amount;
    if (d.hp > 0) return;
    d.alive = false;
    const p = d.mesh.position;
    if (d.colId !== null) { this.ctx.world.colliders.remove(d.colId); d.colId = null; }
    if (d.kind === 'barrel') {
      this.ctx.effects.explode(p.x, p.y, p.z, 7, 60);
      d.mesh.visible = false;
    } else if (d.kind === 'target') {
      d.mesh.rotation.x = -Math.PI / 2.2;   // knocked flat, pops back up later
      d.respawn = 8;
      this.ctx.effects.burst(p.x, p.y + 1.6, p.z, 0xd8d2c0, 10);
      this.ctx.hud.notify('RANGE', 'Target down.', 'mil');
    } else {
      this.ctx.effects.burst(p.x, p.y + 0.6, p.z, 0x8a6a42, 18);
      this.ctx.audio.impact(p.x, p.y, p.z);
      d.mesh.visible = false;
    }
  }

  applyExplosion(x, y, z, radius) {
    for (const d of this.destructibles) {
      if (!d.alive) continue;
      const p = d.mesh.position;
      const dd = Math.hypot(p.x - x, p.y - y, p.z - z);
      if (dd < radius + 1) this.damage(d, 100);
    }
  }

  // ---------- lamps ----------
  addLamps(list) { for (const [x, y, z] of list) this.lampSpots.push([x, y, z]); }

  // ---------- static scatter, called once after sites exist ----------
  buildNature() {
    const ctx = this.ctx;
    const { config, world, mats: M } = ctx;
    const rng = mulberry32(config.seed + 5);
    const half = config.world.half - 80;
    const sites = Object.values(config.sites);
    const rw = config.sites.airport.runway;

    const conifers = [];
    const broads = [];
    const rocks = [];
    const forestCenters = [
      { x: -700, z: -900, r: 700 }, { x: 900, z: -700, r: 500 },
      { x: -300, z: -1500, r: 500 }, { x: 1600, z: 1300, r: 380 }, { x: -900, z: 1600, r: 300 },
    ];
    const reject = (x, z) => {
      const h = world.terrainHeight(x, z);
      if (h < 2.5 || h > 175) return true;
      for (const s of sites) if (s.r && dist2D(x, z, s.x, s.z) < s.r + 30) return true;
      if (x > rw.x0 - 60 && x < rw.x1 + 60 && z > rw.z0 - 220 && z < rw.z0 + 60) return true;
      const cr = world.cityRect;
      if (cr && x > cr.x0 - 20 && x < cr.x1 + 20 && z > cr.z0 - 20 && z < cr.z1 + 20) return true;
      for (const seg of world.roadSegments) {
        if (segDist(x, z, seg[0], seg[1], seg[2], seg[3]) < 16) return true;
      }
      return false;
    };
    for (let i = 0; i < 3000; i++) {
      let x, z;
      if (i % 5 < 3) {
        const fc = pick(rng, forestCenters);
        const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * fc.r;
        x = fc.x + Math.cos(a) * r; z = fc.z + Math.sin(a) * r;
      } else {
        x = rand(rng, -half, half); z = rand(rng, -half, half);
      }
      if (Math.abs(x) > half || Math.abs(z) > half || reject(x, z)) continue;
      const y = world.terrainHeight(x, z);
      const s = rand(rng, 0.75, 1.5);
      (chance(rng, 0.65) ? conifers : broads).push([x, y, z, s, rng() * Math.PI * 2]);
      if (chance(rng, 0.5)) world.colliders.addBoxCentered(x, y, z, 0.7 * s, 5 * s, 0.7 * s);
    }
    for (let i = 0; i < 260; i++) {
      const x = rand(rng, -half, half), z = rand(rng, -half, half);
      const h = world.terrainHeight(x, z);
      if (h < 30 || reject(x, z)) continue;
      rocks.push([x, h, z, rand(rng, 1, 4.5), rng() * Math.PI]);
    }

    const inst = (geo, mat, list, yOff = 0) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      const m4 = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const up = new THREE.Vector3(0, 1, 0);
      list.forEach(([x, y, z, s, r], i) => {
        q.setFromAxisAngle(up, r);
        m4.compose(new THREE.Vector3(x, y + yOff * s, z), q, new THREE.Vector3(s, s, s));
        im.setMatrixAt(i, m4);
      });
      im.castShadow = true;
      im.receiveShadow = true;
      this.group.add(im);
    };
    inst(new THREE.CylinderGeometry(0.25, 0.4, 3.2, 6), M.trunk, conifers, 1.6);
    inst(new THREE.ConeGeometry(2.4, 7.5, 7), M.leafDark, conifers, 6);
    inst(new THREE.CylinderGeometry(0.3, 0.45, 3.4, 6), M.trunk, broads, 1.7);
    inst(new THREE.IcosahedronGeometry(2.8, 1), M.leaf, broads, 5);
    inst(new THREE.DodecahedronGeometry(1.6, 0), M.rock, rocks, 0.5);

    // street lamps (two instanced meshes: poles + glowing heads)
    if (this.lampSpots.length) {
      const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.12, 4.6, 6), M.gunmetal, this.lampSpots.length);
      const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.3, 8, 6), M.lampGlow, this.lampSpots.length);
      const m4 = new THREE.Matrix4();
      this.lampSpots.forEach(([x, y, z], i) => {
        m4.makeTranslation(x, y + 2.3, z);
        poles.setMatrixAt(i, m4);
        m4.makeTranslation(x, y + 4.7, z);
        heads.setMatrixAt(i, m4);
      });
      poles.castShadow = true;
      this.group.add(poles, heads);
    }
  }

  update(dt) {
    this.time += dt;
    // waving flags (CPU vertex wave, few flags only)
    for (const f of this.ctx.world.flags) {
      const geo = f.geometry;
      const posAttr = geo.attributes.position;
      const w = geo.parameters.width;
      for (let i = 0; i < posAttr.count; i++) {
        const x = posAttr.getX(i);
        const t = (x / w + 0.5);
        posAttr.setZ(i, Math.sin(t * 4 + this.time * 3.2 + f.position.x) * 0.35 * t);
      }
      posAttr.needsUpdate = true;
    }
    // radar dishes rotate
    for (const d of this.ctx.world.radarDishes) d.rotation.y += dt * 0.8;
    // targets pop back up
    for (const d of this.destructibles) {
      if (d.kind === 'target' && !d.alive) {
        d.respawn -= dt;
        if (d.respawn <= 0) { d.alive = true; d.hp = 10; d.mesh.rotation.x = 0; }
      }
    }
  }
}

function segDist(px, pz, ax, az, bx, bz) {
  const abx = bx - ax, abz = bz - az;
  const len2 = abx * abx + abz * abz;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * abx + (pz - az) * abz) / len2)) : 0;
  return Math.hypot(px - (ax + abx * t), pz - (az + abz * t));
}
