// power_laser.js — Optic Lance (laser eyes, the showcase) + Thermal Vision beam.
// The Optic Lance raycasts the nearest sliceable surface, renders a glowing beam, and as
// you SWEEP it across an object derives a cutting plane (eye + entry + exit) that fractures
// the geometry into real physics pieces via the destruction/slicer pipeline. Sweep back and
// forth to carve a tower into chunks; falling chunks are themselves re-sliceable.
import * as THREE from 'three';
import { planeFromThreePoints } from '../physics/slicer.js';
import { clamp } from '../core/util.js';
import { CELL } from '../world/cityplan.js';

// Ray vs AABB (slab). Returns entry distance >=0 or -1.
function rayAABB(ox, oy, oz, dx, dy, dz, min, max) {
  let tmin = 0, tmax = Infinity;
  const inv = [1 / dx, 1 / dy, 1 / dz];
  const o = [ox, oy, oz], lo = [min.x, min.y, min.z], hi = [max.x, max.y, max.z];
  for (let i = 0; i < 3; i++) {
    let t1 = (lo[i] - o[i]) * inv[i], t2 = (hi[i] - o[i]) * inv[i];
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }
  return tmin;
}

class Beam {
  constructor(scene, color) {
    this.color = color;
    const geo = new THREE.CylinderGeometry(0.12, 0.12, 1, 6, 1, true);
    geo.translate(0, 0.5, 0); geo.rotateX(Math.PI / 2); // along +z, base at origin
    this.mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.core = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 6, 1, true), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.core.geometry.translate(0, 0.5, 0); this.core.geometry.rotateX(Math.PI / 2);
    this.mesh.add(this.core);
    this.flare = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.mesh.visible = false; this.flare.visible = false;
    scene.add(this.mesh); scene.add(this.flare);
  }
  show(origin, point, radius = 0.12) {
    this.mesh.visible = true; this.flare.visible = true;
    this.mesh.position.copy(origin);
    const d = new THREE.Vector3().subVectors(point, origin);
    const len = d.length();
    this.mesh.lookAt(point);
    this.mesh.scale.set(radius / 0.12, radius / 0.12, len);
    this.flare.position.copy(point);
    const s = 0.6 + Math.random() * 0.3; this.flare.scale.setScalar(s * (radius / 0.12));
    this.mat.opacity = 0.75 + Math.random() * 0.25;
  }
  hide() { this.mesh.visible = false; this.flare.visible = false; }
}

export class LaserPower {
  constructor(ctx) {
    this.ctx = ctx;
    this.beam = new Beam(ctx.scene, 0xff3b2f);
    this.thermalBeam = new Beam(ctx.scene, 0xff7a1a);
    this.active = false; this.thermalActive = false;
    this.cutStart = null; this.cutTarget = null; this.cutCd = 0; this.dwell = 0;
    this.maxDist = 420;
    this._colliderSet = new Set();
  }

  // Gather candidate sliceable hits along the ray and return the nearest.
  _nearest(origin, dir) {
    const city = this.ctx.city, physics = this.ctx.physics;
    let best = null;
    // buildings: sample colliders along the ray
    this._colliderSet.clear();
    const steps = Math.ceil(this.maxDist / CELL) + 1;
    for (let s = 0; s <= steps; s++) {
      const px = origin.x + dir.x * s * CELL, pz = origin.z + dir.z * s * CELL;
      const cols = city.staticCollidersNear(px, pz, CELL);
      for (const c of cols) this._colliderSet.add(c);
    }
    for (const c of this._colliderSet) {
      if (c.removed) continue;
      const t = rayAABB(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, c.min, c.max);
      if (t >= 0 && t < this.maxDist && (!best || t < best.dist)) {
        best = { kind: 'building', id: c.id, dist: t };
      }
    }
    // dynamic sliceable bodies
    for (const b of physics.bodies) {
      if (!b.userData || !b.userData.sliceable) continue;
      const min = { x: b.pos.x - b.maxHalf, y: b.pos.y - b.maxHalf, z: b.pos.z - b.maxHalf };
      const max = { x: b.pos.x + b.maxHalf, y: b.pos.y + b.maxHalf, z: b.pos.z + b.maxHalf };
      const t = rayAABB(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, min, max);
      if (t >= 0 && t < this.maxDist && (!best || t < best.dist)) best = { kind: 'body', body: b, dist: t };
    }
    // ground
    if (dir.y < -0.01) {
      const t = (0 - origin.y) / dir.y;
      if (t > 0 && t < this.maxDist && (!best || t < best.dist)) best = { kind: 'ground', dist: t };
    }
    if (best) best.point = new THREE.Vector3(origin.x + dir.x * best.dist, origin.y + dir.y * best.dist, origin.z + dir.z * best.dist);
    return best;
  }

  startOptic() { this.active = true; if (this.ctx.audio) this.ctx.audio.laserStart(1); if (this.ctx.bus) this.ctx.bus.emit('POWER_USED', { kind: 'laser', pos: this.ctx.hero.pos.clone(), intensity: 1.5 }); }
  stopOptic() { this.active = false; this.beam.hide(); this.cutStart = null; this.cutTarget = null; this.dwell = 0; if (this.ctx.audio) this.ctx.audio.laserStop(); this.ctx.hero.rig.setEyeGlow(0); }
  startThermal() { this.thermalActive = true; }
  stopThermal() { this.thermalActive = false; this.thermalBeam.hide(); this.ctx.hero.rig.setEyeGlow(0); }

  update(dt) {
    this.cutCd = Math.max(0, this.cutCd - dt);
    if (this.active) this._updateOptic(dt);
    if (this.thermalActive) this._updateThermal(dt);
  }

  _updateOptic(dt) {
    const hero = this.ctx.hero;
    const ray = hero.getAimRay();
    hero.rig.setEyeGlow(1);
    const hit = this._nearest(ray.origin, ray.dir);
    if (!hit) { this.beam.show(ray.origin, ray.origin.clone().addScaledVector(ray.dir, this.maxDist)); this.cutStart = null; return; }

    this.beam.show(ray.origin, hit.point);
    // impact fx
    if (Math.random() < 0.8) this.ctx.particles.spark(hit.point, ray.dir, 4, 16, 0xffae5a);
    if (Math.random() < 0.25) this.ctx.particles.smoke(hit.point, 1, 0x2a2a2a, 2);
    if (hit.kind === 'ground') { if (Math.random() < 0.2) this.ctx.decals.add(hit.point, 1.4, 18); this.cutStart = null; this.cutTarget = null; return; }

    const targetKey = hit.kind === 'building' ? 'b' + hit.id : 'd' + hit.body.id;
    if (this.cutTarget !== targetKey) { this.cutTarget = targetKey; this.cutStart = hit.point.clone(); this.dwell = 0; return; }

    this.dwell += dt;
    const sweep = hit.point.distanceTo(this.cutStart);

    // Cut when the sweep is long enough, or after dwelling on one spot (drill-through).
    let doCut = false, plane = null;
    if (sweep > 3.5 && this.cutCd <= 0) {
      plane = planeFromThreePoints([ray.origin.x, ray.origin.y, ray.origin.z], [this.cutStart.x, this.cutStart.y, this.cutStart.z], [hit.point.x, hit.point.y, hit.point.z]);
      doCut = !!plane;
    } else if (this.dwell > 0.45 && this.cutCd <= 0) {
      // vertical drill plane: normal = dir x up
      const up = new THREE.Vector3(0, 1, 0);
      const n = new THREE.Vector3().crossVectors(ray.dir, up).normalize();
      if (n.lengthSq() > 0.01) { plane = { nx: n.x, ny: n.y, nz: n.z, d: -(n.x * hit.point.x + n.y * hit.point.y + n.z * hit.point.z) }; doCut = true; }
      this.dwell = 0;
    }

    if (doCut && plane) {
      let ok = false;
      if (hit.kind === 'building') ok = this.ctx.destruction.fractureBuilding(hit.id, plane, 0xff5a2a);
      else ok = this.ctx.destruction.sliceBody(hit.body, plane, 0xff5a2a);
      if (ok) {
        this.cutCd = 0.1; this.cutStart = hit.point.clone();
        this.ctx.particles.spark(hit.point, null, 22, 22, 0xff7a3a);
        hero.addShake(0.18);
        if (this.ctx.bus) this.ctx.bus.emit('DESTRUCTION', { pos: hit.point.clone(), intensity: 1.6 });
      }
    }
  }

  _updateThermal(dt) {
    const hero = this.ctx.hero;
    const ray = hero.getAimRay();
    hero.rig.setEyeGlow(0.8);
    const hit = this._nearest(ray.origin, ray.dir);
    const end = hit ? hit.point : ray.origin.clone().addScaledVector(ray.dir, this.maxDist);
    this.thermalBeam.show(ray.origin, end, 0.22);
    if (hit) {
      if (Math.random() < 0.7) this.ctx.particles.ember(hit.point, 3, 0xff5522);
      if (Math.random() < 0.5) this.ctx.particles.smoke(hit.point, 2, 0x222222, 3);
      if (Math.random() < 0.15) this.ctx.decals.add(hit.point, 1.6, 20);
      // burn damage to enemies / heat impulse
      if (this.ctx.combat) this.ctx.combat.areaDamage(hit.point, 3, 60 * dt, ray.dir);
    }
    if (this.ctx.bus && Math.random() < 0.1) this.ctx.bus.emit('POWER_USED', { kind: 'thermal', pos: hero.pos.clone(), intensity: 1 });
  }
}
