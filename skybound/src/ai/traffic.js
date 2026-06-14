// traffic.js — kinematic vehicles driving the road grid with car-following, traffic lights,
// hero/danger braking, and emergency dispatch. Vehicles convert to dynamic, sliceable
// physics bodies when grabbed, thrown, or hit by a shockwave.
import * as THREE from 'three';
import { RNG, clamp, lerp } from '../core/util.js';
import { CELL, HALF, ROAD, GRID } from '../world/cityplan.js';

const DIRS = [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }];
function boundaryNear(v) { return Math.round((v + HALF) / CELL) * CELL - HALF; }

const VTYPES = {
  car: { l: 4.2, w: 2.0, h: 1.5, speed: 16, colors: [0xcc4444, 0x4466cc, 0xdddddd, 0x333333, 0x44aa66, 0xddaa33] },
  bus: { l: 9, w: 2.6, h: 3.0, speed: 11, colors: [0xddaa33, 0x3377aa] },
  truck: { l: 7, w: 2.6, h: 3.2, speed: 12, colors: [0x888888, 0x556644] },
};

export class Traffic {
  constructor(scene, ctx) {
    this.scene = scene; this.ctx = ctx;
    this.rng = new RNG(7777);
    const density = ctx.settings.get('trafficDensity');
    this.max = clamp(Math.floor(70 * density), 16, 160);
    this.vehicles = [];
    this.emergency = [];
    this.lightPhase = 0;
    this.activeRadius = 220;

    // instanced car body (merged box + cabin)
    this.geo = buildCar();
    this.mesh = new THREE.InstancedMesh(this.geo, new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.3 }), this.max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = true; this.mesh.frustumCulled = false; this.mesh.count = 0;
    scene.add(this.mesh);

    // emergency vehicles rendered individually (few of them)
    this.emergencyGroup = new THREE.Group(); scene.add(this.emergencyGroup);

    this._m4 = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3();
    this._color = new THREE.Color();

    for (let i = 0; i < this.max; i++) this.vehicles.push(this._make());

    if (ctx.bus) ctx.bus.on('SHOCKWAVE', (e) => this.shockwave(e.center, e.radius, e.strength));
  }

  _make() {
    const v = { type: 'car', dir: this.rng.pick(DIRS), lock: 0, along: 'x', speed: 0, target: 16, color: 0xffffff, brake: 0, turnCd: 0, active: false };
    this._respawn(v, true);
    return v;
  }
  _respawn(v, initial) {
    const hero = this.ctx.hero;
    const tk = this.rng.float(0, 1) < 0.16 ? (this.rng.bool() ? 'bus' : 'truck') : 'car';
    const t = VTYPES[tk]; v.type = tk; v.l = t.l; v.w = t.w; v.h = t.h; v.target = t.speed * (0.8 + this.rng.float(0, 0.4));
    v.color = this.rng.pick(t.colors); v.speed = v.target * 0.5;
    const ang = this.rng.float(0, 6.28);
    const r = initial ? this.rng.float(20, this.activeRadius) : this.activeRadius * 0.9;
    let x = hero.pos.x + Math.cos(ang) * r, z = hero.pos.z + Math.sin(ang) * r;
    v.dir = this.rng.pick(DIRS);
    if (v.dir.x !== 0) { v.along = 'x'; v.lock = boundaryNear(z); v.pos = { x, z: v.lock + this._laneOff(v) }; }
    else { v.along = 'z'; v.lock = boundaryNear(x); v.pos = { x: v.lock + this._laneOff(v), z }; }
    v.pos.x = clamp(v.pos.x, -HALF + ROAD, HALF - ROAD); v.pos.z = clamp(v.pos.z, -HALF + ROAD, HALF - ROAD);
  }
  _laneOff(v) {
    // right-hand lane offset relative to travel direction
    if (v.dir.x > 0) return -ROAD * 0.22; if (v.dir.x < 0) return ROAD * 0.22;
    if (v.dir.z > 0) return ROAD * 0.22; return -ROAD * 0.22;
  }

  update(dt) {
    this.lightPhase = (this.lightPhase + dt * 0.12) % 1;
    const nsGreen = this.lightPhase < 0.5;
    const hero = this.ctx.hero;
    let drawn = 0;

    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];
      if (v.dynamic) continue; // converted to physics body
      const dx = v.pos.x - hero.pos.x, dz = v.pos.z - hero.pos.z;
      const dist = Math.hypot(dx, dz);
      v.active = dist < this.activeRadius + 40;
      if (dist > this.activeRadius + 60) { this._respawn(v, false); continue; }

      this._drive(v, dt, nsGreen, i);

      if (dist < this.activeRadius && drawn < this.max) { this._writeInstance(v, drawn); drawn++; }
    }
    this.mesh.count = drawn;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

    this._updateEmergency(dt);
  }

  _drive(v, dt, nsGreen, idx) {
    v.turnCd = Math.max(0, v.turnCd - dt);
    const dirIsNS = v.dir.z !== 0;
    let target = v.target;

    // along-axis coordinate & near-intersection check
    const alongCoord = v.along === 'x' ? v.pos.x : v.pos.z;
    const b = boundaryNear(alongCoord);
    const distToInt = Math.abs(alongCoord - b);

    // traffic light: stop before red intersection
    const greenForMe = dirIsNS ? nsGreen : !nsGreen;
    if (!greenForMe && distToInt < 7 && distToInt > 2.5) target = 0;

    // turn at intersection
    if (distToInt < 1.2 && v.turnCd <= 0 && this.rng.bool(0.4)) {
      const perp = dirIsNS ? [DIRS[0], DIRS[1]] : [DIRS[2], DIRS[3]];
      v.dir = this.rng.pick(perp);
      if (v.dir.x !== 0) { v.along = 'x'; v.lock = b; } else { v.along = 'z'; v.lock = b; }
      const off = this._laneOff(v);
      if (v.along === 'x') v.pos.z = v.lock + off; else v.pos.x = v.lock + off;
      v.turnCd = 2.5;
    }

    // car-following: slow if a vehicle is just ahead in same lane
    for (let j = 0; j < this.vehicles.length; j += 1) {
      if (j === idx) continue; const o = this.vehicles[j];
      if (o.dynamic || !o.active) continue;
      if (o.dir.x !== v.dir.x || o.dir.z !== v.dir.z) continue;
      const sameLane = v.along === 'x' ? Math.abs(o.pos.z - v.pos.z) < 2 : Math.abs(o.pos.x - v.pos.x) < 2;
      if (!sameLane) continue;
      const ahead = (o.pos.x - v.pos.x) * v.dir.x + (o.pos.z - v.pos.z) * v.dir.z;
      if (ahead > 0 && ahead < v.l + 4) { target = Math.min(target, 0); break; }
      if (ahead > 0 && ahead < v.l + 10) target = Math.min(target, v.target * 0.4);
    }

    // brake near hero on the ground / near danger
    const hero = this.ctx.hero;
    const hd = Math.hypot(v.pos.x - hero.pos.x, v.pos.z - hero.pos.z);
    if (hero.grounded && hd < 12) target = Math.min(target, 2);

    v.speed = lerp(v.speed, target, clamp(dt * (target < v.speed ? 5 : 2), 0, 1));
    v.pos.x += v.dir.x * v.speed * dt; v.pos.z += v.dir.z * v.speed * dt;
    // keep locked to lane
    if (v.along === 'x') v.pos.z = lerp(v.pos.z, v.lock + this._laneOff(v), clamp(dt * 4, 0, 1));
    else v.pos.x = lerp(v.pos.x, v.lock + this._laneOff(v), clamp(dt * 4, 0, 1));

    // edge turn-around
    if (Math.abs(v.pos.x) > HALF - ROAD || Math.abs(v.pos.z) > HALF - ROAD) {
      v.dir = { x: -v.dir.x, z: -v.dir.z }; v.turnCd = 2;
      v.pos.x = clamp(v.pos.x, -HALF + ROAD, HALF - ROAD); v.pos.z = clamp(v.pos.z, -HALF + ROAD, HALF - ROAD);
    }
  }

  _writeInstance(v, idx) {
    const heading = Math.atan2(v.dir.x, v.dir.z);
    this._p.set(v.pos.x, v.h / 2, v.pos.z);
    this._q.setFromAxisAngle(UP, heading);
    this._s.set(v.w / 2, v.h / 2, v.l / 2);
    this._m4.compose(this._p, this._q, this._s);
    this.mesh.setMatrixAt(idx, this._m4);
    this._color.setHex(v.color);
    this.mesh.setColorAt(idx, this._color);
  }

  // Convert a kinematic vehicle to a dynamic, sliceable physics body.
  _toDynamic(v, vel) {
    v.dynamic = true;
    const mat = this.ctx.assets.mat('carmat' + v.color, { color: v.color, roughness: 0.5, metalness: 0.3 });
    const body = this.ctx.destruction.dynamicBox(
      new THREE.Vector3(v.pos.x, v.h / 2, v.pos.z),
      new THREE.Vector3(v.w, v.h, v.l), mat, v.color, vel,
    );
    if (body) {
      body.kind = 'debris';
      const heading = Math.atan2(v.dir.x, v.dir.z);
      body.quat.setFromAxisAngle(UP, heading);
      // recycle the kinematic slot after a delay
      v.respawnAt = (this.ctx.hero.t || 0) + 8;
    }
    // schedule slot reuse
    setTimeout(() => { v.dynamic = false; this._respawn(v, false); }, 9000);
    return body;
  }

  grabNearest(point, r) {
    let best = null, bd = r * r;
    for (const v of this.vehicles) {
      if (v.dynamic || !v.active) continue;
      const d = (v.pos.x - point.x) ** 2 + (v.pos.z - point.z) ** 2;
      if (d < bd) { bd = d; best = v; }
    }
    if (!best) return null;
    return this._toDynamic(best, new THREE.Vector3());
  }

  shockwave(center, radius, strength) {
    for (const v of this.vehicles) {
      if (v.dynamic || !v.active) continue;
      const dx = v.pos.x - center.x, dz = v.pos.z - center.z; const d = Math.hypot(dx, dz);
      if (d < radius) {
        const dir = new THREE.Vector3(dx, 1, dz).normalize().multiplyScalar(clamp(strength * (1 - d / radius) * 0.3, 6, 40));
        this._toDynamic(v, dir);
      }
    }
  }

  // ---- emergency vehicles (dispatched by the director) ----
  spawnEmergency(target, kind = 'police') {
    const colors = { police: 0x2244cc, ambulance: 0xeeeeee, fire: 0xcc2222 };
    const geo = buildCar();
    const mat = new THREE.MeshStandardMaterial({ color: colors[kind] || 0x2244cc, roughness: 0.4, metalness: 0.3, emissive: 0x000000 });
    const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = true;
    mesh.scale.set(1.1, 0.85, 2.4);
    const beacon = new THREE.PointLight(kind === 'fire' ? 0xff3322 : 0x3355ff, 2, 30); mesh.add(beacon); beacon.position.y = 3;
    this.emergencyGroup.add(mesh);
    const hero = this.ctx.hero;
    const ang = this.rng.float(0, 6.28);
    const ev = { mesh, mat, beacon, kind, target, pos: new THREE.Vector3(hero.pos.x + Math.cos(ang) * 150, 0, hero.pos.z + Math.sin(ang) * 150), t: 0, life: 40 };
    this.emergency.push(ev);
    if (this.ctx.audio) this.ctx.audio.sirenStart();
    return ev;
  }
  _updateEmergency(dt) {
    for (let i = this.emergency.length - 1; i >= 0; i--) {
      const ev = this.emergency[i]; ev.t += dt; ev.life -= dt;
      const to = new THREE.Vector3(ev.target.x - ev.pos.x, 0, ev.target.z - ev.pos.z);
      const d = to.length();
      if (d > 6) { to.normalize(); ev.pos.addScaledVector(to, Math.min(d, 22 * dt)); ev.mesh.rotation.y = Math.atan2(to.x, to.z); }
      ev.pos.y = 0.8; ev.mesh.position.copy(ev.pos);
      ev.beacon.intensity = 1.5 + Math.abs(Math.sin(ev.t * 8)) * 2.5;
      ev.mat.emissive.setHex(Math.sin(ev.t * 8) > 0 ? (ev.kind === 'fire' ? 0x550000 : 0x000055) : 0x000000);
      if (ev.life <= 0) this.removeEmergency(ev);
    }
  }
  removeEmergency(ev) {
    const i = this.emergency.indexOf(ev); if (i < 0) return;
    this.emergencyGroup.remove(ev.mesh); ev.mesh.geometry.dispose();
    this.emergency.splice(i, 1);
    if (this.emergency.length === 0 && this.ctx.audio) this.ctx.audio.sirenStop();
  }
}

const UP = new THREE.Vector3(0, 1, 0);

function buildCar() {
  const parts = [];
  const box = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); parts.push(g); };
  // unit car (will be scaled per type): body spans -1..1
  box(2, 1.1, 4, 0, 0, 0);          // body
  box(1.7, 0.9, 2.0, 0, 0.7, -0.1); // cabin
  return mergeGeos(parts);
}
function mergeGeos(geos) {
  const nis = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  let total = 0;
  for (const g of nis) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3); let o = 0;
  for (const g of nis) { const p = g.attributes.position.array, n = g.attributes.normal.array; pos.set(p, o * 3); nor.set(n, o * 3); o += g.attributes.position.count; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.computeBoundingSphere();
  return out;
}
