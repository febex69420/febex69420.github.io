// physics.js — lightweight rigid-body world tuned for debris, thrown objects, sliced
// pieces and ragdolls. Box bodies with ground + static-AABB + (cheap) body-body
// collision, sleeping, a soft body cap with recycling, and a radial-impulse API that
// drives shockwaves, ground slams and explosions.
import * as THREE from 'three';
import { clamp } from '../core/util.js';

let _bid = 0;

export class Body {
  constructor(opts = {}) {
    this.id = _bid++;
    this.pos = opts.pos ? opts.pos.clone() : new THREE.Vector3();
    this.quat = opts.quat ? opts.quat.clone() : new THREE.Quaternion();
    this.vel = opts.vel ? opts.vel.clone() : new THREE.Vector3();
    this.omega = new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2).multiplyScalar(opts.spin || 0);
    this.half = opts.half ? opts.half.clone() : new THREE.Vector3(0.5, 0.5, 0.5);
    this.radius = this.half.length();
    this.maxHalf = Math.max(this.half.x, this.half.y, this.half.z);
    this.mass = opts.mass != null ? opts.mass : 1;
    this.invMass = this.mass > 0 ? 1 / this.mass : 0;
    this.restitution = opts.restitution != null ? opts.restitution : 0.25;
    this.friction = opts.friction != null ? opts.friction : 0.6;
    this.gravityScale = opts.gravityScale != null ? opts.gravityScale : 1;
    this.mesh = opts.mesh || null;
    this.awake = true;
    this.sleepTimer = 0;
    this.bornAt = 0;
    this.lifetime = opts.lifetime || Infinity;
    this.collide = opts.collide !== false;
    this.kind = opts.kind || 'debris';
    this.onRemove = opts.onRemove || null;
    this.userData = opts.userData || {};
  }
  wake() { this.awake = true; this.sleepTimer = 0; }
  setHalf(h) { this.half.copy(h); this.radius = h.length(); this.maxHalf = Math.max(h.x, h.y, h.z); }
  syncMesh() { if (this.mesh) { this.mesh.position.copy(this.pos); this.mesh.quaternion.copy(this.quat); } }
}

export class PhysicsWorld {
  constructor(opts = {}) {
    this.bodies = [];
    this.gravity = opts.gravity != null ? opts.gravity : -34;
    this.groundY = opts.groundY || (() => 0);
    this.collidersNear = opts.collidersNear || (() => []);
    this.maxBodies = opts.maxBodies || 320;
    this.time = 0;
    this.cellSize = 12;
    this._grid = new Map();
    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
    this._dq = new THREE.Quaternion();
  }

  add(body) {
    body.bornAt = this.time;
    this.bodies.push(body);
    if (this.bodies.length > this.maxBodies) this._recycleOldest();
    return body;
  }
  remove(body) {
    const i = this.bodies.indexOf(body);
    if (i >= 0) this.bodies.splice(i, 1);
    if (body.onRemove) body.onRemove(body);
  }
  _recycleOldest() {
    // Remove the oldest non-special dynamic body to bound the simulation.
    for (let i = 0; i < this.bodies.length; i++) {
      if (this.bodies[i].kind === 'debris') { this.remove(this.bodies[i]); return; }
    }
    if (this.bodies.length) this.remove(this.bodies[0]);
  }

  _key(x, z) { return Math.floor(x / this.cellSize) + ',' + Math.floor(z / this.cellSize); }

  step(dt) {
    this.time += dt;
    dt = Math.min(dt, 1 / 30);
    const bodies = this.bodies;

    // lifetime cull
    for (let i = bodies.length - 1; i >= 0; i--) {
      const b = bodies[i];
      if (this.time - b.bornAt > b.lifetime) this.remove(b);
    }

    // integrate + world collisions
    for (const b of bodies) {
      if (!b.awake || b.invMass === 0) continue;
      const steps = b.vel.lengthSq() > 3600 ? 3 : 1; // substep fast bodies
      const h = dt / steps;
      for (let s = 0; s < steps; s++) {
        b.vel.y += this.gravity * b.gravityScale * h;
        b.pos.addScaledVector(b.vel, h);
        // integrate orientation
        this._dq.set(b.omega.x * 0.5 * h, b.omega.y * 0.5 * h, b.omega.z * 0.5 * h, 0).multiply(b.quat);
        b.quat.x += this._dq.x; b.quat.y += this._dq.y; b.quat.z += this._dq.z; b.quat.w += this._dq.w;
        b.quat.normalize();
        b.omega.multiplyScalar(1 - 0.6 * h); // angular damping
        this._collideGround(b);
        if (b.collide) this._collideStatic(b);
      }
      // sleep test
      if (b.vel.lengthSq() < 0.04 && b.omega.lengthSq() < 0.04) {
        b.sleepTimer += dt;
        if (b.sleepTimer > 0.8) b.awake = false;
      } else b.sleepTimer = 0;
    }

    // cheap body-body (sphere approx) via broadphase grid
    this._collidePairs();

    // sync meshes
    for (const b of bodies) b.syncMesh();
  }

  _collideGround(b) {
    const gy = this.groundY(b.pos.x, b.pos.z) + b.half.y;
    if (b.pos.y < gy) {
      b.pos.y = gy;
      if (b.vel.y < 0) {
        b.vel.y = -b.vel.y * b.restitution;
        b.vel.x *= (1 - b.friction * 0.5);
        b.vel.z *= (1 - b.friction * 0.5);
        // tumble from horizontal motion
        b.omega.x += b.vel.z * 0.04;
        b.omega.z -= b.vel.x * 0.04;
        if (Math.abs(b.vel.y) < 1.2) b.vel.y = 0;
      }
    }
  }

  _collideStatic(b) {
    const cols = this.collidersNear(b.pos.x, b.pos.z, b.maxHalf + 4);
    for (const c of cols) {
      if (c.removed) continue;
      // body AABB (rotation-inflated)
      const r = b.maxHalf;
      const bx0 = b.pos.x - r, bx1 = b.pos.x + r, by0 = b.pos.y - r, by1 = b.pos.y + r, bz0 = b.pos.z - r, bz1 = b.pos.z + r;
      if (bx1 < c.min.x || bx0 > c.max.x || by1 < c.min.y || by0 > c.max.y || bz1 < c.min.z || bz0 > c.max.z) continue;
      // penetration per axis -> resolve smallest
      const px = Math.min(bx1 - c.min.x, c.max.x - bx0);
      const py = Math.min(by1 - c.min.y, c.max.y - by0);
      const pz = Math.min(bz1 - c.min.z, c.max.z - bz0);
      const m = Math.min(px, py, pz);
      if (m === px) { const dir = (b.pos.x < (c.min.x + c.max.x) / 2) ? -1 : 1; b.pos.x += dir * px; b.vel.x = -b.vel.x * b.restitution; }
      else if (m === py) { const dir = (b.pos.y < (c.min.y + c.max.y) / 2) ? -1 : 1; b.pos.y += dir * py; if (dir > 0) { b.vel.y = Math.abs(b.vel.y) * b.restitution; b.vel.x *= 0.85; b.vel.z *= 0.85; } else b.vel.y = -Math.abs(b.vel.y) * b.restitution; }
      else { const dir = (b.pos.z < (c.min.z + c.max.z) / 2) ? -1 : 1; b.pos.z += dir * pz; b.vel.z = -b.vel.z * b.restitution; }
    }
  }

  _collidePairs() {
    this._grid.clear();
    const bodies = this.bodies;
    for (const b of bodies) {
      if (!b.collide) continue;
      const k = this._key(b.pos.x, b.pos.z);
      let arr = this._grid.get(k); if (!arr) this._grid.set(k, (arr = []));
      arr.push(b);
    }
    for (const arr of this._grid.values()) {
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const a = arr[i], b = arr[j];
          if (a.invMass === 0 && b.invMass === 0) continue;
          const d = this._tmp.subVectors(b.pos, a.pos);
          const rsum = a.radius * 0.7 + b.radius * 0.7;
          const dist2 = d.lengthSq();
          if (dist2 > rsum * rsum || dist2 < 1e-6) continue;
          const dist = Math.sqrt(dist2);
          const n = d.multiplyScalar(1 / dist);
          const pen = rsum - dist;
          const totInv = a.invMass + b.invMass || 1;
          a.pos.addScaledVector(n, -pen * (a.invMass / totInv));
          b.pos.addScaledVector(n, pen * (b.invMass / totInv));
          const rel = this._tmp2.subVectors(b.vel, a.vel);
          const vn = rel.dot(n);
          if (vn < 0) {
            const e = Math.min(a.restitution, b.restitution);
            const jimp = -(1 + e) * vn / totInv;
            a.vel.addScaledVector(n, -jimp * a.invMass);
            b.vel.addScaledVector(n, jimp * b.invMass);
            a.wake(); b.wake();
          }
        }
      }
    }
  }

  // Push bodies away from a center (shockwaves / slams / explosions). Returns affected.
  applyRadialImpulse(center, radius, strength, opts = {}) {
    const up = opts.up || 0.4;
    const affected = [];
    for (const b of this.bodies) {
      if (b.invMass === 0) continue;
      const d = this._tmp.subVectors(b.pos, center);
      const dist = d.length();
      if (dist > radius) continue;
      const fall = 1 - dist / radius;
      d.y += 0.001; d.normalize();
      d.y += up;
      b.vel.addScaledVector(d, strength * fall * b.invMass * (b.mass || 1) / Math.max(0.3, b.mass) * 6);
      b.omega.x += (Math.random() - 0.5) * fall * 6;
      b.omega.z += (Math.random() - 0.5) * fall * 6;
      b.wake();
      affected.push(b);
    }
    return affected;
  }

  queryNear(center, radius) {
    const out = [];
    const r2 = radius * radius;
    for (const b of this.bodies) if (this._tmp.subVectors(b.pos, center).lengthSq() <= r2) out.push(b);
    return out;
  }

  clearDebris() {
    for (let i = this.bodies.length - 1; i >= 0; i--) if (this.bodies[i].kind === 'debris') this.remove(this.bodies[i]);
  }
}
