// Drivable vehicles: state limousine, jeep, APC, army truck, helicopter and
// fighter jet — arcade physics, engine audio, damage, escort convoy AI.
import * as THREE from 'three';
import { clamp, lerp, damp, angleDamp, getBoxGeom, dist2D } from '../core/utils.js';

const TYPES = {
  limo: { name: 'State Limousine', kind: 'car', maxSpeed: 30, accel: 9, seats: 4, health: 260, radius: 2.6, camDist: 10 },
  jeep: { name: 'Recon Jeep', kind: 'car', maxSpeed: 34, accel: 12, seats: 4, health: 160, radius: 2.2, camDist: 9 },
  apc: { name: 'VR-8 "Bastion" APC', kind: 'car', maxSpeed: 22, accel: 6, seats: 8, health: 700, radius: 3, camDist: 12 },
  truck: { name: 'Army Truck', kind: 'car', maxSpeed: 24, accel: 6, seats: 6, health: 300, radius: 3, camDist: 12 },
  heli: { name: 'VH-3 "Kestrel" Helicopter', kind: 'heli', maxSpeed: 55, accel: 14, seats: 6, health: 320, radius: 4, camDist: 16 },
  jet: { name: 'SV-11 "Zarya" Fighter', kind: 'jet', maxSpeed: 150, accel: 22, seats: 1, health: 300, radius: 4, camDist: 20 },
};

let VID = 0;

class Vehicle {
  constructor(ctx, type, x, z, rotY) {
    this.ctx = ctx;
    this.id = VID++;
    this.type = type;
    const T = TYPES[type];
    this.def = T;
    this.kind = T.kind;
    this.displayName = T.name;
    this.health = T.health;
    this.alive = true;
    this.yaw = rotY;
    this.pitchV = 0;   // visual pitch
    this.rollV = 0;
    this.speed = 0;
    this.vy = 0;
    this.throttle = 0;  // jet
    this.rpm = 0;
    this.airborne = false;
    this.driver = null;
    this.boarders = [];
    this.ai = null;
    this.retire = false;
    this._retireT = 0;
    this.engine = null;
    this.group = buildMesh(ctx, type);
    const y = ctx.world.groundHeight(x, z, 500);
    this.group.position.set(x, y + 0.1, z);
    this.group.rotation.y = rotY;
    ctx.scene.add(this.group);
  }

  get pos() { return this.group.position; }
  forward(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }
  eyePos() {
    const f = this.forward();
    return new THREE.Vector3(this.pos.x + f.x * 0.5, this.pos.y + (this.kind === 'car' ? 1.6 : 2.2), this.pos.z + f.z * 0.5);
  }

  enter(player) {
    if (!this.alive) return;
    this.driver = 'player';
    player.vehicle = this;
    player._orbitYaw = 0;
    player._orbitPitch = 0.3;
    this._ensureEngine();
    this.ctx.hud.notify('', `${this.displayName} — engine running.`, '');
    this.ctx.hud.setAmmo(null);
  }

  canExit() {
    if (this.kind === 'car') return Math.abs(this.speed) < 6;
    return !this.airborne && Math.abs(this.speed) < 4 && Math.abs(this.vy) < 2;
  }

  exit(player) {
    this.driver = null;
    player.vehicle = null;
    const f = this.forward();
    const px = this.pos.x + f.z * (this.def.radius + 1.2);
    const pz = this.pos.z - f.x * (this.def.radius + 1.2);
    player.spawnAt(px, pz, player.yaw);
    // unload escort boarders
    let k = 0;
    for (const npc of this.boarders) {
      npc._seatedIn = null;
      npc.group.visible = true;
      const ang = (k / Math.max(1, this.boarders.length)) * Math.PI * 2;
      const sx = this.pos.x + Math.cos(ang) * (this.def.radius + 1.5);
      const sz = this.pos.z + Math.sin(ang) * (this.def.radius + 1.5);
      npc.pos.set(sx, this.ctx.world.groundHeight(sx, sz, this.pos.y + 2), sz);
      k++;
    }
    this.boarders = [];
    if (this.engine) { this.engine.stop(); this.engine = null; }
  }

  seatFor(npc) {
    if (npc._seatedIn === this) return true;
    if (this.boarders.length >= this.def.seats - 1) return false;
    if (dist2D(npc.pos.x, npc.pos.z, this.pos.x, this.pos.z) > 7) return false;
    npc._seatedIn = this;
    npc.group.visible = false;
    this.boarders.push(npc);
    return true;
  }

  _ensureEngine() {
    if (!this.engine && this.ctx.audio.enabled) this.engine = this.ctx.audio.createEngine(this.kind);
  }

  damage(amount, point) {
    if (!this.alive) return;
    this.health -= amount;
    if (this.health <= 0) this._explode();
  }

  _explode() {
    if (!this.alive) return;
    this.alive = false;
    const ctx = this.ctx;
    const p = this.pos;
    if (this.driver === 'player') {
      this.exit(ctx.player);
      ctx.player.damage(45, p);
    }
    for (const npc of this.boarders) { npc._seatedIn = null; npc.group.visible = true; npc.damage(200, p); }
    this.boarders = [];
    if (this.engine) { this.engine.stop(); this.engine = null; }
    ctx.effects.explode(p.x, p.y + 1, p.z, 8, 90);
    this.group.visible = false;
  }

  update(dt) {
    if (!this.alive) return;
    const ctx = this.ctx;
    const input = ctx.input;
    const driven = this.driver === 'player';
    const canControl = driven && input.locked && !ctx.hud.menuOpen;

    let throttleIn = 0, steerIn = 0, liftIn = 0;
    if (canControl) {
      if (input.key('KeyW')) throttleIn += 1;
      if (input.key('KeyS')) throttleIn -= 1;
      if (input.key('KeyA')) steerIn += 1;
      if (input.key('KeyD')) steerIn -= 1;
      if (input.key('Space')) liftIn += 1;
      if (input.key('ControlLeft') || input.key('KeyC')) liftIn -= 1;
      if (input.pressed('KeyH')) ctx.audio.radioBeep();
    }
    if (this.ai) this._aiDrive(dt, v => { throttleIn = v.t; steerIn = v.s; });

    if (this.kind === 'car') this._updateCar(dt, throttleIn, steerIn, driven || !!this.ai);
    else if (this.kind === 'heli') this._updateHeli(dt, throttleIn, steerIn, liftIn, driven);
    else this._updateJet(dt, throttleIn, steerIn, canControl);

    // engine audio + hud
    if (this.engine) this.engine.update(this.rpm, this.pos.x, this.pos.y, this.pos.z);
    if (driven) {
      ctx.player.position.set(this.pos.x, this.pos.y, this.pos.z);
      ctx.player.yaw = this.yaw + (ctx.player._orbitYaw || 0);
      const kmh = Math.round(Math.abs(this.speed) * 3.6);
      const alt = this.kind === 'car' ? null : Math.max(0, Math.round(this.pos.y - ctx.world.groundHeight(this.pos.x, this.pos.z, this.pos.y)));
      ctx.hud.setSpeedo(kmh, alt, this.displayName);
    }
    // retirement of AI vehicles
    if (this.retire) {
      this._retireT += dt;
      const far = dist2D(this.pos.x, this.pos.z, ctx.player.position.x, ctx.player.position.z) > 90;
      if (far || this._retireT > 18) this.dispose();
    }
  }

  _updateCar(dt, throttleIn, steerIn, active) {
    const ctx = this.ctx;
    const T = this.def;
    // drive
    const target = throttleIn * T.maxSpeed * (throttleIn < 0 ? 0.4 : 1);
    if (active && throttleIn !== 0) this.speed = lerp(this.speed, target, Math.min(1, dt * T.accel / Math.max(6, Math.abs(this.speed))));
    else this.speed = damp(this.speed, 0, 0.8, dt);
    const brake = (this.driver === 'player' && ctx.input.key('Space'));
    if (brake) this.speed = damp(this.speed, 0, 4, dt);
    this.rpm = clamp(Math.abs(this.speed) / T.maxSpeed + (throttleIn !== 0 ? 0.2 : 0), 0, 1);
    // steer
    const steerFactor = clamp(Math.abs(this.speed) / 8, 0, 1) * (this.speed < 0 ? -1 : 1);
    this.yaw += steerIn * 1.6 * steerFactor * dt;
    // move
    const f = this.forward();
    let nx = this.pos.x + f.x * this.speed * dt;
    let nz = this.pos.z + f.z * this.speed * dt;
    // collide with world boxes
    const c = ctx.world.colliders.collideCircle(nx, nz, T.radius, this.pos.y + 0.4, this.pos.y + 1.8);
    const pushed = Math.hypot(c.x - nx, c.z - nz);
    if (pushed > 0.01) {
      if (Math.abs(this.speed) > 14) {
        this.damage(Math.abs(this.speed) * 1.2, this.pos);
        ctx.events.emit('noise', { x: this.pos.x, z: this.pos.z, severity: 1.4, kind: 'crash' });
        ctx.player.shake(this.driver === 'player' ? 0.5 : 0);
        ctx.audio.impact(this.pos.x, this.pos.y, this.pos.z);
      }
      this.speed *= Math.max(0.2, 1 - pushed * 2);
    }
    nx = c.x; nz = c.z;
    const g = ctx.world.groundHeight(nx, nz, this.pos.y + 1.5, 1.1);
    this.pos.set(nx, damp(this.pos.y, g + 0.1, 10, dt), nz);
    // terrain tilt
    const n = ctx.world.terrain.normal(nx, nz);
    const fpitch = Math.asin(clamp(f.dot(n), -0.5, 0.5));
    const right = new THREE.Vector3(f.z, 0, -f.x);
    const froll = Math.asin(clamp(right.dot(n), -0.5, 0.5));
    this.pitchV = damp(this.pitchV, fpitch, 6, dt);
    this.rollV = damp(this.rollV, froll, 6, dt);
    this.group.rotation.set(this.pitchV, this.yaw, this.rollV, 'YXZ');
    // wheels spin
    if (this.wheels) for (const w of this.wheels) w.rotation.x += this.speed * dt * 1.4;
  }

  _updateHeli(dt, throttleIn, steerIn, liftIn, driven) {
    const ctx = this.ctx;
    const T = this.def;
    const g = ctx.world.groundHeight(this.pos.x, this.pos.z, this.pos.y + 1);
    const onGround = this.pos.y <= g + 0.25;
    // spool
    const wantRpm = driven ? (onGround && liftIn <= 0 && Math.abs(this.speed) < 1 ? 0.35 : 1) : 0;
    this.rpm = damp(this.rpm, wantRpm, 0.7, dt);
    // vertical
    const lift = liftIn > 0 ? 7.5 : liftIn < 0 ? -6 : (onGround ? 0 : -0.8);
    this.vy = damp(this.vy, this.rpm > 0.75 ? lift : -5, 2.4, dt);
    let ny = this.pos.y + this.vy * dt;
    if (ny <= g + 0.15) {
      if (this.vy < -9) this.damage(60, this.pos);
      ny = g + 0.15;
      this.vy = 0;
    }
    this.airborne = ny > g + 0.6;
    // horizontal: tilt drives acceleration
    const tilt = this.airborne ? throttleIn * 0.24 : 0;
    this.pitchV = damp(this.pitchV, tilt, 4, dt);
    this.rollV = damp(this.rollV, this.airborne ? -steerIn * 0.16 : 0, 4, dt);
    if (this.airborne) this.yaw += steerIn * 1.1 * dt;
    const accel = this.airborne ? throttleIn * T.accel : 0;
    this.speed = clamp(damp(this.speed, this.speed + accel, 3, dt) * (1 - dt * 0.35), -T.maxSpeed * 0.4, T.maxSpeed);
    if (!this.airborne) this.speed = damp(this.speed, 0, 4, dt);
    const f = this.forward();
    let nx = this.pos.x + f.x * this.speed * dt;
    let nz = this.pos.z + f.z * this.speed * dt;
    const c = ctx.world.colliders.collideCircle(nx, nz, T.radius, ny + 0.5, ny + 3);
    if (Math.hypot(c.x - nx, c.z - nz) > 0.05 && Math.abs(this.speed) > 10) this.damage(50, this.pos);
    this.pos.set(c.x, ny, c.z);
    this.group.rotation.set(this.pitchV, this.yaw, this.rollV, 'YXZ');
    // rotors
    if (this.rotor) { this.rotor.rotation.y += this.rpm * 28 * dt; }
    if (this.tailRotor) { this.tailRotor.rotation.x += this.rpm * 34 * dt; }
  }

  _updateJet(dt, pitchIn, rollIn, canControl) {
    const ctx = this.ctx;
    const T = this.def;
    if (canControl) {
      if (ctx.input.key('ShiftLeft')) this.throttle = clamp(this.throttle + dt * 0.5, 0, 1);
      if (ctx.input.key('ControlLeft') || ctx.input.key('KeyC')) this.throttle = clamp(this.throttle - dt * 0.6, 0, 1);
    }
    this.rpm = this.throttle;
    const g = ctx.world.groundHeight(this.pos.x, this.pos.z, this.pos.y + 1);
    const onGround = !this.airborne && this.pos.y <= g + 0.4;
    // speed
    const drag = this.airborne ? 0.06 : 0.25;
    this.speed += (this.throttle * T.maxSpeed - this.speed) * Math.min(1, dt * 0.35) - this.speed * drag * dt;
    if (this.speed < 0) this.speed = 0;

    if (onGround) {
      this.yaw += rollIn * 0.8 * clamp(this.speed / 30, 0, 1) * dt * (this.speed > 1 ? 1 : 0);
      this.pitchAngle = 0;
      this.rollV = damp(this.rollV, 0, 5, dt);
      if (this.speed > 52 && pitchIn > 0) {
        this.airborne = true;
        this.pitchAngle = 0.12;
        ctx.hud.notify('TOWER', 'Airborne. Clear skies, Supreme Marshal.', 'mil');
      }
      const f = this.forward();
      let nx = this.pos.x + f.x * this.speed * dt;
      let nz = this.pos.z + f.z * this.speed * dt;
      const c = ctx.world.colliders.collideCircle(nx, nz, T.radius, this.pos.y + 0.5, this.pos.y + 2);
      if (Math.hypot(c.x - nx, c.z - nz) > 0.05 && this.speed > 15) { this._explode(); return; }
      this.pos.set(c.x, damp(this.pos.y, g + 0.4, 10, dt), c.z);
    } else {
      // flight model
      this.pitchAngle = clamp((this.pitchAngle || 0) + pitchIn * 0.9 * dt, -0.9, 0.9);
      this.rollV = clamp(this.rollV - rollIn * 1.6 * dt, -1.2, 1.2);
      this.rollV = damp(this.rollV, this.rollV * 0.94, 1, dt);
      this.yaw += -this.rollV * 0.9 * clamp(this.speed / 60, 0.2, 1.3) * dt;
      const stall = this.speed < 42;
      if (stall) this.pitchAngle = damp(this.pitchAngle, -0.5, 1.2, dt);
      const climb = Math.sin(this.pitchAngle) * this.speed;
      const f = this.forward();
      const horiz = Math.cos(this.pitchAngle) * this.speed;
      let nx = this.pos.x + f.x * horiz * dt;
      let nz = this.pos.z + f.z * horiz * dt;
      let ny = this.pos.y + (climb - (stall ? 6 : 0)) * dt;
      const gh = ctx.world.groundHeight(nx, nz, ny + 2);
      if (ny <= gh + 0.4) {
        // touching down or crashing
        const gentle = this.speed < 75 && this.pitchAngle > -0.15 && this.pitchAngle < 0.12 && Math.abs(this.rollV) < 0.25;
        const flatGround = Math.abs(gh - g) < 0.5;
        if (gentle && flatGround) {
          this.airborne = false;
          ny = gh + 0.4;
          ctx.hud.notify('TOWER', 'Touchdown confirmed.', 'mil');
        } else {
          this.pos.set(nx, ny, nz);
          this._explode();
          return;
        }
      }
      // world ceiling / bounds
      if (ny > 1400) { ny = 1400; this.pitchAngle = Math.min(this.pitchAngle, 0); }
      const HALF = ctx.config.world.half * 1.4;
      nx = clamp(nx, -HALF, HALF);
      nz = clamp(nz, -HALF, HALF);
      this.pos.set(nx, ny, nz);
    }
    this.group.rotation.set(this.airborne ? -this.pitchAngle : 0, this.yaw, this.rollV, 'YXZ');
    if (this.burner) {
      this.burner.material.emissiveIntensity = this.throttle * 3;
      this.burner.scale.setScalar(0.5 + this.throttle);
    }
  }

  _aiDrive(dt, apply) {
    const ai = this.ai;
    let t = 0, s = 0;
    if (this.retire) {
      t = 0.6;
      apply({ t, s: 0.2 });
      return;
    }
    const target = ai.target;
    if (!target || !target.alive) { apply({ t: 0, s: 0 }); return; }
    const tf = target.forward();
    const goal = new THREE.Vector3(
      target.pos.x - tf.x * ai.behind + tf.z * ai.side,
      0,
      target.pos.z - tf.z * ai.behind - tf.x * ai.side,
    );
    const dx = goal.x - this.pos.x, dz = goal.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const desiredYaw = Math.atan2(-dx, -dz);
    let dy = ((desiredYaw - this.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    s = clamp(dy * 2, -1, 1);
    t = dist > 40 ? 1 : dist > 8 ? clamp((dist - 6) / 20 + Math.abs(target.speed) / this.def.maxSpeed, 0, 1) : 0;
    if (Math.abs(dy) > 1.6 && dist < 15) t *= 0.3;
    apply({ t, s });
  }

  dispose() {
    if (this.engine) { this.engine.stop(); this.engine = null; }
    this.ctx.scene.remove(this.group);
    this.alive = false;
    this._disposed = true;
  }
}

// ---------- mesh builders ----------
function buildMesh(ctx, type) {
  const M = ctx.mats;
  const g = new THREE.Group();
  const part = (w, h, d, x, y, z, mat) => {
    const mesh = new THREE.Mesh(getBoxGeom(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    g.add(mesh);
    return mesh;
  };
  const wheels = [];
  const wheel = (r, wdt, x, y, z) => {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(r, r, wdt, 10), M.rubber);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, y, z);
    w.castShadow = true;
    g.add(w);
    wheels.push(w);
    return w;
  };
  switch (type) {
    case 'limo': {
      part(2.1, 0.62, 7.6, 0, 0.85, 0, M.limoBlack);
      part(1.9, 0.55, 3.6, 0, 1.4, 0.3, M.glassDark);
      part(2.14, 0.16, 7.64, 0, 0.56, 0, M.gunmetal);
      part(1.7, 0.14, 0.1, 0, 0.8, -3.82, M.headlight);
      part(1.7, 0.14, 0.1, 0, 0.8, 3.82, M.taillight);
      // hood pennants
      const flagMat = new THREE.MeshStandardMaterial({ map: ctx.world.flagTexture, side: THREE.DoubleSide });
      for (const fx of [-0.8, 0.8]) {
        part(0.04, 0.5, 0.04, fx, 1.4, -3.3, M.metal);
        const f = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.28), flagMat);
        f.position.set(fx + 0.22, 1.52, -3.3);
        g.add(f);
      }
      wheel(0.42, 0.3, -1, 0.42, -2.5); wheel(0.42, 0.3, 1, 0.42, -2.5);
      wheel(0.42, 0.3, -1, 0.42, 2.5); wheel(0.42, 0.3, 1, 0.42, 2.5);
      break;
    }
    case 'jeep': {
      part(2, 0.7, 4.4, 0, 0.85, 0, M.camo);
      part(1.9, 0.45, 1.4, 0, 1.45, 0.9, M.camoDark);
      part(0.2, 0.5, 0.2, 0.7, 1.5, -0.6, M.gunmetal);
      part(1.6, 0.14, 0.1, 0, 0.75, -2.24, M.headlight);
      wheel(0.48, 0.34, -1.02, 0.48, -1.5); wheel(0.48, 0.34, 1.02, 0.48, -1.5);
      wheel(0.48, 0.34, -1.02, 0.48, 1.5); wheel(0.48, 0.34, 1.02, 0.48, 1.5);
      break;
    }
    case 'apc': {
      part(2.7, 1.3, 6.6, 0, 1.35, 0, M.camo);
      part(2.3, 0.7, 4.4, 0, 2.3, 0.2, M.camoDark);
      part(1.2, 0.5, 1.6, 0, 2.9, -0.4, M.camoDark);
      part(0.14, 0.14, 1.8, 0, 3, -1.5, M.gunmetal);
      part(2.1, 0.2, 0.12, 0, 1.1, -3.34, M.headlight);
      for (const zz of [-2.2, 0, 2.2]) { wheel(0.6, 0.42, -1.45, 0.6, zz); wheel(0.6, 0.42, 1.45, 0.6, zz); }
      break;
    }
    case 'truck': {
      part(2.4, 1.5, 2, 0, 1.55, -2.6, M.camo);
      part(2.2, 0.5, 0.3, 0, 1, -3.6, M.camoDark);
      part(2.4, 1.7, 4.6, 0, 1.9, 1.2, M.camoDark);
      part(2.5, 0.2, 5, 0, 1, 1.2, M.gunmetal);
      part(2, 0.18, 0.1, 0, 0.9, -3.72, M.headlight);
      wheel(0.55, 0.4, -1.25, 0.55, -2.4); wheel(0.55, 0.4, 1.25, 0.55, -2.4);
      wheel(0.55, 0.4, -1.25, 0.55, 1); wheel(0.55, 0.4, 1.25, 0.55, 1);
      wheel(0.55, 0.4, -1.25, 0.55, 2.6); wheel(0.55, 0.4, 1.25, 0.55, 2.6);
      break;
    }
    case 'heli': {
      part(2, 1.6, 5, 0, 1.7, 0.4, M.camo);
      part(1.6, 1.1, 1.6, 0, 1.8, -1.9, M.glassDark);
      part(0.7, 0.7, 4.4, 0, 2.1, 4, M.camoDark);
      part(0.2, 1.4, 0.9, 0, 2.9, 6, M.camo);
      // skids
      part(0.16, 0.16, 4.4, -1.1, 0.35, 0, M.gunmetal);
      part(0.16, 0.16, 4.4, 1.1, 0.35, 0, M.gunmetal);
      part(0.14, 0.7, 0.14, -1.1, 0.8, -1.4, M.gunmetal);
      part(0.14, 0.7, 0.14, 1.1, 0.8, -1.4, M.gunmetal);
      part(0.14, 0.7, 0.14, -1.1, 0.8, 1.4, M.gunmetal);
      part(0.14, 0.7, 0.14, 1.1, 0.8, 1.4, M.gunmetal);
      break;
    }
    case 'jet': {
      part(1.4, 1.1, 9, 0, 1.4, 0, M.metal);
      part(1, 0.7, 2, 0, 1.9, -2.6, M.glassDark);
      part(7.6, 0.16, 3, 0, 1.4, 1, M.metal);          // main delta wing
      part(3.2, 0.14, 1.4, 0, 1.5, 3.9, M.metal);      // tail plane
      part(0.14, 1.6, 1.4, 0, 2.4, 3.9, M.metal);      // fin
      part(0.9, 0.9, 0.6, 0, 1.4, 4.6, M.gunmetal);    // nozzle
      break;
    }
  }
  const veh = g;
  veh.userData.wheels = wheels;
  return veh;
}

export class VehicleManager {
  constructor(ctx) {
    this.ctx = ctx;
    this.list = [];
  }

  spawn(type, x, z, rotY = 0) {
    const v = new Vehicle(this.ctx, type, x, z, rotY);
    v.wheels = v.group.userData.wheels;
    if (type === 'heli') {
      // main + tail rotor
      const M = this.ctx.mats;
      const rotor = new THREE.Group();
      const b1 = new THREE.Mesh(getBoxGeom(9, 0.06, 0.34), M.gunmetal);
      const b2 = new THREE.Mesh(getBoxGeom(0.34, 0.06, 9), M.gunmetal);
      rotor.add(b1, b2);
      rotor.position.set(0, 2.75, 0.2);
      v.group.add(rotor);
      v.rotor = rotor;
      const tail = new THREE.Mesh(getBoxGeom(0.06, 1.6, 0.2), M.gunmetal);
      tail.position.set(0.25, 2.6, 5.9);
      v.group.add(tail);
      v.tailRotor = tail;
    }
    if (type === 'jet') {
      const burner = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.6, 8),
        new THREE.MeshStandardMaterial({ color: 0x223, emissive: 0x4090ff, emissiveIntensity: 0 }));
      burner.rotation.x = -Math.PI / 2;
      burner.position.set(0, 1.4, 5.6);
      v.group.add(burner);
      v.burner = burner;
    }
    this.list.push(v);
    return v;
  }

  spawnParked(parked) {
    for (const p of parked) this.spawn(p.type, p.x, p.z, p.rotY || 0);
  }

  nearestEnterable(pos, r) {
    let best = null, bd = r;
    for (const v of this.list) {
      if (!v.alive || v.driver || v.ai) continue;
      const d = dist2D(pos.x, pos.z, v.pos.x, v.pos.z) - v.def.radius;
      if (d < bd && Math.abs(v.pos.y - pos.y) < 4) { bd = d; best = v; }
    }
    return best;
  }

  deliver(type) {
    const ctx = this.ctx;
    const p = ctx.player.position;
    const f = new THREE.Vector3(-Math.sin(ctx.player.yaw), 0, -Math.cos(ctx.player.yaw));
    const x = p.x + f.x * 20, z = p.z + f.z * 20;
    const v = this.spawn(type, x, z, ctx.player.yaw + Math.PI / 2);
    ctx.hud.notify('MOTOR POOL', `${v.displayName} delivered for the Supreme Marshal.`, 'mil');
    ctx.audio.radioBeep();
    return v;
  }

  spawnEscortVehicles(target, n = 2) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const tf = target.forward();
      const x = target.pos.x - tf.x * (14 + i * 14);
      const z = target.pos.z - tf.z * (14 + i * 14);
      const v = this.spawn('apc', x, z, target.yaw);
      v.ai = { mode: 'chase', target, behind: 12 + i * 13, side: i % 2 ? 2.5 : -2.5 };
      v._ensureEngine();
      out.push(v);
    }
    this.ctx.hud.notify('PROTECTION DETAIL', 'Escort vehicles joining your convoy.', 'mil');
    return out;
  }

  flyby() {
    const ctx = this.ctx;
    const p = ctx.player.position;
    const ang = Math.random() * Math.PI * 2;
    const v = this.spawn('jet', p.x + Math.cos(ang) * 1200, p.z + Math.sin(ang) * 1200, 0);
    v.yaw = Math.atan2(-(p.x - v.pos.x), -(p.z - v.pos.z));
    v.pos.y = ctx.world.groundHeight(p.x, p.z, 4000) + 160;
    v.airborne = true;
    v.speed = 120;
    v.throttle = 1;
    v.ai = { mode: 'flyby' };
    v._aiDrive = function (dt, apply) { apply({ t: 0, s: 0 }); this.pitchAngle = 0.02; };
    v.retire = true;
    v._retireT = -20;   // gets ~38s of flight
    ctx.hud.notify('AIR COMMAND', 'Air patrol overflight inbound on your position.', 'mil');
    ctx.audio.radioBeep();
  }

  raycastVehicle(origin, dir, maxDist) {
    let best = null;
    const tmp = new THREE.Vector3();
    for (const v of this.list) {
      if (!v.alive) continue;
      tmp.set(v.pos.x, v.pos.y + 1.2, v.pos.z).sub(origin);
      const t = tmp.dot(dir);
      if (t < 0 || t > maxDist) continue;
      const closest = new THREE.Vector3().copy(origin).addScaledVector(dir, t);
      if (closest.distanceTo(new THREE.Vector3(v.pos.x, v.pos.y + 1.2, v.pos.z)) < v.def.radius * 0.9) {
        if (!best || t < best.dist) best = { vehicle: v, dist: t };
      }
    }
    return best;
  }

  applyExplosion(x, y, z, radius, power) {
    for (const v of this.list) {
      if (!v.alive) continue;
      const d = Math.hypot(v.pos.x - x, v.pos.y - y, v.pos.z - z);
      if (d < radius * 1.6) v.damage(power * (1 - d / (radius * 1.8)), v.pos);
    }
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const v = this.list[i];
      if (v._disposed || (!v.alive && !v.group.visible)) {
        this.list.splice(i, 1);
        if (!v._disposed) this.ctx.scene.remove(v.group);
        continue;
      }
      v.update(dt);
    }
  }
}
