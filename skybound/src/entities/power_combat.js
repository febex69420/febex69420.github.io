// power_combat.js — strength & blast abilities: Pulse Blast (+Overcharge), Cryo Breath,
// Gale Force, Power Punch, Ground Breaker (slam), Shock Clap, and Grab/Lift/Throw.
import * as THREE from 'three';
import { clamp } from '../core/util.js';
import { Body } from '../physics/physics.js';

export class AbilityPowers {
  constructor(ctx) {
    this.ctx = ctx;
    this.projectiles = [];
    this.held = null;
    this.pulseCharge = 0;
    this.slamPending = false;
    this.comboCount = 0; this.comboTimer = 0;
    this._tmp = new THREE.Vector3();
  }

  // ---------- primary-driven (called by PowerManager) ----------
  punch() {
    const hero = this.ctx.hero;
    if (!this.ctx.power.consume(4)) return;
    hero.triggerAction('punch', 0.25);
    this.comboCount = (this.comboTimer > 0 ? this.comboCount + 1 : 1);
    this.comboTimer = 1.1;
    const origin = hero.pos.clone().setY(hero.pos.y + 1.6).addScaledVector(hero.aimDir, 1.5);
    const dir = hero.aimDir.clone();
    if (this.ctx.audio) this.ctx.audio.whoosh(0.7);
    // hit enemies
    const hit = this.ctx.combat && this.ctx.combat.meleeStrike(origin, dir, 2.6, 120 + this.comboCount * 20, this.comboCount % 4 === 0);
    // hit world: spark + small debris; strong punch can fracture
    this.ctx.particles.spark(origin, dir, 6, 10, 0xfff0c0);
    this.ctx.physics.applyRadialImpulse(origin, 4, 30, { up: 0.3 });
    if (this.ctx.bus) this.ctx.bus.emit('POWER_USED', { kind: 'punch', pos: origin, intensity: 0.7 });
    if (hit) hero.addShake(0.12);
  }

  startPulseCharge() { this.pulseCharge = 0; }
  releasePulse() {
    const hero = this.ctx.hero;
    const charged = clamp(this.pulseCharge, 0, 1.5);
    const cost = 8 + charged * 14;
    if (!this.ctx.power.consume(cost)) { this.pulseCharge = 0; return; }
    const dir = hero.aimDir.clone();
    const origin = hero.eyesPosition().clone().addScaledVector(dir, 1.2);
    const size = 0.6 + charged * 1.2;
    const speed = 110 + charged * 40;
    const geo = new THREE.SphereGeometry(size, 12, 10);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: charged > 1 ? 0x99ccff : 0x66e0ff, transparent: true, blending: THREE.AdditiveBlending }));
    this.ctx.scene.add(mesh);
    const light = new THREE.PointLight(0x66ccff, 2 + charged * 3, 30); mesh.add(light);
    this.projectiles.push({ mesh, pos: origin.clone(), vel: dir.multiplyScalar(speed), life: 3, radius: size, dmg: 80 + charged * 160, blast: 8 + charged * 10 });
    mesh.position.copy(origin);
    if (this.ctx.audio) this.ctx.audio.zap(520 - charged * 120, 1);
    hero.addShake(0.1 + charged * 0.15);
    this.pulseCharge = 0;
    if (this.ctx.bus) this.ctx.bus.emit('POWER_USED', { kind: 'pulse', pos: hero.pos.clone(), intensity: 1 + charged });
  }

  // ---------- dedicated keys (read in update) ----------
  _cryo(dt) {
    const hero = this.ctx.hero;
    if (!this.ctx.power.consume(20 * dt)) return;
    const dir = hero.aimDir.clone();
    const origin = hero.eyesPosition();
    for (let i = 0; i < 3; i++) {
      const spread = origin.clone().addScaledVector(dir, 2 + i * 2);
      spread.x += (Math.random() - 0.5) * (2 + i); spread.y += (Math.random() - 0.5) * (1 + i); spread.z += (Math.random() - 0.5) * (2 + i);
      this.ctx.particles.energy(spread, dir, 2, 0xbfeaff, 8);
    }
    // freeze/slow enemies & push light bodies in a cone
    const reach = origin.clone().addScaledVector(dir, 9);
    if (this.ctx.combat) this.ctx.combat.areaEffect(reach, 6, (e) => e.freeze && e.freeze(2.5));
    for (const b of this.ctx.physics.queryNear(reach, 7)) {
      if (b.invMass === 0) continue; b.vel.addScaledVector(dir, 12 * dt * 60 * b.invMass); b.wake();
    }
    if (this.ctx.audio && Math.random() < 0.1) this.ctx.audio.freeze();
  }

  _gale() {
    const hero = this.ctx.hero;
    if (!this.ctx.power.consume(16)) return;
    const dir = hero.aimDir.clone();
    const center = hero.pos.clone().addScaledVector(dir, 8).setY(hero.pos.y + 2);
    for (const b of this.ctx.physics.queryNear(center, 16)) {
      if (b.invMass === 0) continue;
      const push = this._tmp.subVectors(b.pos, hero.pos); push.normalize().addScaledVector(dir, 1.5);
      b.vel.addScaledVector(push, 40); b.wake();
    }
    if (this.ctx.combat) this.ctx.combat.areaEffect(center, 16, (e) => e.knockback && e.knockback(dir.clone().multiplyScalar(40)));
    for (let i = 0; i < 16; i++) this.ctx.particles.energy(hero.pos.clone().setY(hero.pos.y + 2).addScaledVector(dir, Math.random() * 14), dir, 1, 0xe8f4ff, 18);
    if (this.ctx.audio) this.ctx.audio.whoosh(1.2);
    hero.addShake(0.15);
    if (this.ctx.bus) this.ctx.bus.emit('POWER_USED', { kind: 'gale', pos: center, intensity: 1.2 });
  }

  _clap() {
    const hero = this.ctx.hero;
    if (!this.ctx.power.consume(22)) return;
    hero.triggerAction('slam', 0.3);
    const center = hero.pos.clone().setY(hero.pos.y + 1.6).addScaledVector(hero.aimDir, 2);
    this.ctx.destruction.explosion(center, 20, 70, 0xdfeeff);
    if (this.ctx.combat) this.ctx.combat.areaDamage(center, 16, 140, hero.aimDir);
    hero.addShake(0.5);
    if (this.ctx.bus) this.ctx.bus.emit('POWER_USED', { kind: 'clap', pos: center, intensity: 2 });
  }

  _slam() {
    const hero = this.ctx.hero;
    if (hero.grounded) return;
    if (!this.ctx.power.consume(10)) return;
    hero.triggerAction('slam', 0.5);
    hero.vel.y = -140; // drive into the ground; impact crater handled on landing
    this.slamPending = true;
    if (this.ctx.bus) this.ctx.bus.emit('POWER_USED', { kind: 'slamstart', pos: hero.pos.clone(), intensity: 1 });
  }
  _checkSlamLand() {
    if (this.slamPending && this.ctx.hero.grounded) {
      this.slamPending = false;
      const p = this.ctx.hero.pos.clone();
      this.ctx.destruction.crater(p, 14, 120);
      if (this.ctx.combat) this.ctx.combat.areaDamage(p, 16, 200, null);
      this.ctx.hero.addShake(0.7);
      if (this.ctx.bus) this.ctx.bus.emit('POWER_USED', { kind: 'groundslam', pos: p, intensity: 2.5 });
    }
  }

  _grabToggle() {
    if (this.held) { this._throw(); return; }
    const hero = this.ctx.hero;
    const front = hero.pos.clone().addScaledVector(hero.aimDir, 6).setY(hero.pos.y + 1.5);
    let best = null, bestD = 64;
    for (const b of this.ctx.physics.bodies) {
      if (b.invMass === 0 || b.held) continue;
      const d = b.pos.distanceToSquared(front);
      if (d < bestD) { bestD = d; best = b; }
    }
    // also allow grabbing a nearby vehicle from traffic
    if (this.ctx.traffic) {
      const vb = this.ctx.traffic.grabNearest(front, 8);
      if (vb && vb.pos.distanceToSquared(front) < bestD) best = vb;
    }
    if (best) {
      best.held = true; best.collide = false; best.gravityScale = 0; best.vel.set(0, 0, 0); best.awake = true;
      this.held = best;
      if (this.ctx.audio) this.ctx.audio.impact(0.5);
    }
  }
  _throw() {
    if (!this.held) return;
    const hero = this.ctx.hero;
    const b = this.held;
    b.held = false; b.collide = true; b.gravityScale = 1;
    b.vel.copy(hero.aimDir).multiplyScalar(120);
    b.vel.y += 8;
    b.omega.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
    this.held = null;
    if (this.ctx.audio) this.ctx.audio.whoosh(1.3);
    hero.addShake(0.2);
    if (this.ctx.bus) this.ctx.bus.emit('POWER_USED', { kind: 'throw', pos: hero.pos.clone(), intensity: 1.4 });
  }

  update(dt) {
    const input = this.ctx.input;
    // dedicated keys
    if (input.down_('cryo')) this._cryo(dt);
    if (input.pressed('gale')) this._gale();
    if (input.pressed('clap')) this._clap();
    if (input.pressed('slam')) this._slam();
    if (input.pressed('grab')) this._grabToggle();
    this._checkSlamLand();
    if (this.comboTimer > 0) { this.comboTimer -= dt; if (this.comboTimer <= 0) this.comboCount = 0; }

    // held object follows hands
    if (this.held) {
      const hero = this.ctx.hero;
      const target = hero.pos.clone().addScaledVector(hero.aimDir, 4.5).setY(hero.pos.y + 1.8 + Math.max(this.held.maxHalf, 1));
      this.held.pos.lerp(target, clamp(dt * 14, 0, 1));
      this.held.vel.set(0, 0, 0);
      this.held.syncMesh();
    }

    // projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      p.pos.addScaledVector(p.vel, dt);
      p.mesh.position.copy(p.pos);
      p.mesh.scale.setScalar(1 + Math.sin(p.life * 30) * 0.05);
      let hitSomething = p.life <= 0;
      // building collision (point inside any nearby collider)
      const cols = this.ctx.city.staticCollidersNear(p.pos.x, p.pos.z, 6);
      for (const c of cols) { if (!c.removed && p.pos.x > c.min.x && p.pos.x < c.max.x && p.pos.y > c.min.y && p.pos.y < c.max.y && p.pos.z > c.min.z && p.pos.z < c.max.z) { hitSomething = true; break; } }
      if (!hitSomething && p.pos.y <= this.ctx.city.groundY(p.pos.x, p.pos.z) + 0.2) hitSomething = true;
      if (!hitSomething && this.ctx.combat) { if (this.ctx.combat.projectileHit(p.pos, p.radius + 1.2, p.dmg, p.vel)) hitSomething = true; }
      if (hitSomething) {
        this.ctx.destruction.explosion(p.pos.clone(), p.blast, p.dmg * 0.6, 0x66ccff);
        if (this.ctx.combat) this.ctx.combat.areaDamage(p.pos, p.blast, p.dmg, p.vel);
        this.ctx.scene.remove(p.mesh); p.mesh.geometry.dispose();
        this.projectiles.splice(i, 1);
      }
    }
  }

  reset() {
    for (const p of this.projectiles) { this.ctx.scene.remove(p.mesh); p.mesh.geometry.dispose(); }
    this.projectiles.length = 0;
    if (this.held) { this.held.held = false; this.held.collide = true; this.held.gravityScale = 1; this.held = null; }
  }
}
