// hero.js — the player: a procedural articulated rig with procedural animation, a
// responsive flight/ground controller, a third-person camera rig with aim, and the
// movement powers (flight, hover, sonic boost, super-speed slow-mo, skyfall jump, dash,
// wall impacts). Combat/optic powers live in the power_* modules and read this.
import * as THREE from 'three';
import { clamp, clamp01, lerp, damp, angleLerp, smoothstep, TAU } from '../core/util.js';

// ----------------------------------------------------------------- rig ----
class HeroRig {
  constructor(scene) {
    this.group = new THREE.Group();
    const suit = new THREE.MeshStandardMaterial({ color: 0x2b50c8, roughness: 0.5, metalness: 0.3, emissive: 0x0a1840, emissiveIntensity: 0.3 });
    const accent = new THREE.MeshStandardMaterial({ color: 0xf2c14e, roughness: 0.4, metalness: 0.5, emissive: 0x3a2c00, emissiveIntensity: 0.4 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xd7a07a, roughness: 0.7 });
    this.eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x66ddff, emissiveIntensity: 0.6 });
    this.mats = { suit, accent, skin };

    const part = (w, h, d, mat, parent) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.castShadow = true; (parent || this.group).add(m); return m;
    };
    // torso + pelvis
    this.pelvis = new THREE.Group(); this.group.add(this.pelvis);
    this.torso = part(0.95, 1.15, 0.55, suit, this.pelvis); this.torso.position.y = 0.85;
    part(0.99, 0.3, 0.58, accent, this.torso).position.y = -0.5; // belt
    this.chest = part(0.55, 0.5, 0.2, accent, this.torso); this.chest.position.set(0, 0.2, 0.29); // emblem (original diamond)
    this.chest.rotation.z = Math.PI / 4; this.chest.scale.set(0.7, 0.7, 1);
    // head
    this.head = part(0.5, 0.55, 0.5, skin, this.torso); this.head.position.y = 0.92;
    this.eyeL = part(0.12, 0.06, 0.05, this.eyeMat, this.head); this.eyeL.position.set(-0.12, 0.05, 0.26);
    this.eyeR = part(0.12, 0.06, 0.05, this.eyeMat, this.head); this.eyeR.position.set(0.12, 0.05, 0.26);
    // arms
    this.armL = new THREE.Group(); this.torso.add(this.armL); this.armL.position.set(-0.62, 0.5, 0);
    this.upperArmL = part(0.26, 0.6, 0.26, suit, this.armL); this.upperArmL.position.y = -0.3;
    this.foreArmL = part(0.22, 0.55, 0.22, skin, this.armL); this.foreArmL.position.y = -0.85;
    this.armR = new THREE.Group(); this.torso.add(this.armR); this.armR.position.set(0.62, 0.5, 0);
    this.upperArmR = part(0.26, 0.6, 0.26, suit, this.armR); this.upperArmR.position.y = -0.3;
    this.foreArmR = part(0.22, 0.55, 0.22, skin, this.armR); this.foreArmR.position.y = -0.85;
    // legs
    this.legL = new THREE.Group(); this.pelvis.add(this.legL); this.legL.position.set(-0.26, 0.1, 0);
    part(0.32, 0.7, 0.32, suit, this.legL).position.y = -0.35;
    part(0.28, 0.7, 0.3, suit, this.legL).position.y = -1.0;
    part(0.32, 0.18, 0.5, accent, this.legL).position.set(0, -1.4, 0.08);
    this.legR = new THREE.Group(); this.pelvis.add(this.legR); this.legR.position.set(0.26, 0.1, 0);
    part(0.32, 0.7, 0.32, suit, this.legR).position.y = -0.35;
    part(0.28, 0.7, 0.3, suit, this.legR).position.y = -1.0;
    part(0.32, 0.18, 0.5, accent, this.legR).position.set(0, -1.4, 0.08);
    // cape
    this.cape = part(0.95, 1.5, 0.06, new THREE.MeshStandardMaterial({ color: 0xc23a3a, roughness: 0.6, side: THREE.DoubleSide }), this.torso);
    this.cape.position.set(0, 0.0, -0.32); this.cape.geometry.translate(0, -0.75, 0);

    this.group.position.y = 1.55; // root so feet ~ y=0 when pos at ground
    scene.add(this.group);
  }

  setEyeGlow(v) { this.eyeMat.emissiveIntensity = 0.6 + v * 4; this.eyeMat.emissive.setHex(v > 0.5 ? 0xff3322 : 0x66ddff); }

  // Procedural animation. p = { speed, flying, boosting, grounded, t, moveAmt, turn, action }
  animate(p, dt) {
    const t = p.t;
    const damp2 = (a, b, l) => damp(a, b, l, dt);
    // base targets
    let pelvisY = 0, pitch = 0, armSwing = 0, legSwing = 0, lean = 0, capeSwing = 0;
    if (p.flying) {
      pitch = p.boosting ? 1.3 : 1.0;             // body horizontal
      this.armL.rotation.x = damp2(this.armL.rotation.x, p.boosting ? -2.7 : -2.5, 8);
      this.armR.rotation.x = damp2(this.armR.rotation.x, p.boosting ? -2.7 : 0.4, 8);
      legSwing = Math.sin(t * 3) * 0.05;
      capeSwing = 1.1 + Math.sin(t * 6) * 0.15;
      lean = -p.turn * 0.5;
    } else if (p.grounded && p.moveAmt > 0.05) {
      const cadence = p.speed > 24 ? 16 : 9;
      const sw = Math.sin(t * cadence) * clamp(p.moveAmt, 0, 1);
      legSwing = sw * 0.8; armSwing = -sw * 0.7;
      pelvisY = Math.abs(Math.sin(t * cadence)) * 0.08;
      pitch = clamp(p.speed / 80, 0, 0.5);
      this.armL.rotation.x = damp2(this.armL.rotation.x, armSwing, 12);
      this.armR.rotation.x = damp2(this.armR.rotation.x, -armSwing, 12);
      capeSwing = 0.25 + clamp(p.speed / 60, 0, 0.6);
    } else {
      // idle breathing
      pelvisY = Math.sin(t * 1.6) * 0.03;
      this.armL.rotation.x = damp2(this.armL.rotation.x, 0.05 + Math.sin(t * 1.6) * 0.03, 6);
      this.armR.rotation.x = damp2(this.armR.rotation.x, 0.05 - Math.sin(t * 1.6) * 0.03, 6);
      capeSwing = 0.15;
    }

    // action overrides (punch / slam / wave)
    if (p.action === 'punch') { this.armR.rotation.x = -1.7; this.foreArmR.rotation.x = 0; }
    else if (p.action === 'slam') { this.armL.rotation.x = this.armR.rotation.x = -2.6; }
    else if (p.action === 'wave') { this.armR.rotation.x = -2.8; this.armR.rotation.z = Math.sin(t * 8) * 0.4; }
    else this.armR.rotation.z = damp2(this.armR.rotation.z, 0, 8);

    this.pelvis.position.y = damp2(this.pelvis.position.y, pelvisY, 10);
    this.torso.rotation.x = damp2(this.torso.rotation.x, pitch, 8);
    this.torso.rotation.z = damp2(this.torso.rotation.z, lean, 8);
    this.legL.rotation.x = damp2(this.legL.rotation.x, legSwing, 12);
    this.legR.rotation.x = damp2(this.legR.rotation.x, -legSwing, 12);
    this.cape.rotation.x = damp2(this.cape.rotation.x, capeSwing, 6);
    this.cape.rotation.z = Math.sin(t * 5) * 0.06;
  }
}

// ----------------------------------------------------------------- hero ----
export class Hero {
  constructor(scene, ctx) {
    this.scene = scene; this.ctx = ctx;
    this.input = ctx.input; this.settings = ctx.settings;
    this.rig = new HeroRig(scene);

    this.pos = new THREE.Vector3(0, 0, 0);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.camYaw = 0; this.camPitch = 0.2; this.camDist = 8;
    this.flying = false; this.grounded = true;
    this.boosting = false;
    this.jumpHeld = 0; this.charging = false; this.chargeAmt = 0;
    this.timeDilation = false; this.timeScale = 1;
    this.t = 0;
    this.action = null; this.actionTimer = 0;
    this.dashCd = 0;
    this.radius = 0.6; this.height = 3.0;
    this.maxHealth = 1000; this.health = 1000;
    this.aegis = true;               // durability on by default
    this.aimDir = new THREE.Vector3(0, 0, -1);
    this.eye = new THREE.Vector3();
    this.lastBoomSpeed = 0;
    this._tmp = new THREE.Vector3(); this._tmp2 = new THREE.Vector3();
    this.speed = 0; this.sonic = false;

    // tuning
    this.WALK = 9; this.RUN = 20; this.SUPER = 70; this.FLY = 42; this.BOOST = 150;
  }

  eyesPosition() {
    return this.eye.set(this.pos.x, this.pos.y + 2.45, this.pos.z).addScaledVector(this.aimDir, 0.3);
  }
  getAimRay() { return { origin: this.eyesPosition().clone(), dir: this.aimDir.clone() }; }
  forward() { return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }

  teleport(p) { this.pos.copy(p); this.vel.set(0, 0, 0); this.flying = p.y > 4; }

  takeDamage(amount) {
    if (this.settings.get('invulnerable') || (this.aegis && amount < 40)) amount *= this.aegis ? 0.25 : 1;
    if (this.settings.get('invulnerable')) return;
    this.health = clamp(this.health - amount, 0, this.maxHealth);
    if (this.ctx.bus) this.ctx.bus.emit('HERO_HIT', { amount });
  }
  heal(a) { this.health = clamp(this.health + a, 0, this.maxHealth); }

  // ---- world collision (capsule vs ground/roofs/walls) ----
  _resolveCollision(realDt) {
    const city = this.ctx.city;
    const cols = city.staticCollidersNear(this.pos.x, this.pos.z, this.radius + 4);
    let support = city.groundY(this.pos.x, this.pos.z);
    // support from rooftops
    for (const c of cols) {
      if (c.removed) continue;
      if (this.pos.x > c.min.x - this.radius && this.pos.x < c.max.x + this.radius &&
          this.pos.z > c.min.z - this.radius && this.pos.z < c.max.z + this.radius) {
        if (this.pos.y + 0.2 >= c.max.y) support = Math.max(support, c.max.y);
      }
    }
    // wall push-out (only when beside a building, not above its roof)
    for (const c of cols) {
      if (c.removed) continue;
      const insideX = this.pos.x > c.min.x - this.radius && this.pos.x < c.max.x + this.radius;
      const insideZ = this.pos.z > c.min.z - this.radius && this.pos.z < c.max.z + this.radius;
      const belowRoof = this.pos.y < c.max.y - 0.3 && this.pos.y + this.height > c.min.y;
      if (insideX && insideZ && belowRoof) {
        const px = Math.min(this.pos.x + this.radius - c.min.x, c.max.x - (this.pos.x - this.radius));
        const pz = Math.min(this.pos.z + this.radius - c.min.z, c.max.z - (this.pos.z - this.radius));
        const speed = this.vel.length();
        if (px < pz) { this.pos.x += (this.pos.x < (c.min.x + c.max.x) / 2 ? -px : px); this.vel.x = 0; }
        else { this.pos.z += (this.pos.z < (c.min.z + c.max.z) / 2 ? -pz : pz); this.vel.z = 0; }
        if (speed > 55) this._wallImpact(speed);
      }
    }
    // ground/roof support
    if (this.pos.y <= support + 0.01) {
      if (this.vel.y < 0) {
        if (this.vel.y < -45 && !this.flying) this._land(-this.vel.y);
        this.vel.y = 0;
      }
      this.pos.y = support;
      this.grounded = true;
      if (this.flying && support > 0.1 || (this.flying && this.input.down_('descend'))) { /* allow landing */ }
    } else {
      this.grounded = false;
    }
  }

  _wallImpact(speed) {
    const p = this.pos.clone(); p.y += 1.5;
    this.ctx.particles.dust(p, 16, 0xbcbcbc);
    this.ctx.particles.spark(p, null, 10, 12, 0xffe0a0);
    if (this.ctx.audio) this.ctx.audio.impact(clamp(speed / 120, 0.5, 1.4));
    this.addShake(clamp(speed / 120, 0.2, 0.8));
    this.vel.multiplyScalar(0.2);
    if (this.ctx.bus) this.ctx.bus.emit('POWER_USED', { kind: 'impact', pos: p, intensity: 1 });
  }
  _land(force) {
    const p = this.pos.clone();
    this.ctx.particles.dust(p, clamp(force / 4, 6, 26), 0xb9a98a);
    if (force > 70) { this.ctx.destruction.crater(p, clamp(force / 8, 4, 12), force * 2); }
    if (this.ctx.audio) this.ctx.audio.impact(clamp(force / 80, 0.4, 1.2));
    this.addShake(clamp(force / 150, 0.1, 0.6));
  }

  _sonicBoom() {
    const p = this.pos.clone();
    this.ctx.destruction.explosion(p, 18, 60, 0xbfe6ff);
    if (this.ctx.bus) this.ctx.bus.emit('POWER_USED', { kind: 'sonicboom', pos: p, intensity: 2 });
    this.addShake(0.6);
  }

  update(realDt) {
    const input = this.input;
    this.t += realDt;
    this.dashCd = Math.max(0, this.dashCd - realDt);
    if (this.actionTimer > 0) { this.actionTimer -= realDt; if (this.actionTimer <= 0) this.action = null; }

    // ---- camera look ----
    const look = input.consumeLook();
    this.camYaw -= look.dx;
    this.camPitch = clamp(this.camPitch + look.dy, -1.35, 1.35);
    // aim direction from camera angles
    const cp = Math.cos(this.camPitch);
    this.aimDir.set(Math.sin(this.camYaw) * cp, -Math.sin(this.camPitch), Math.cos(this.camYaw) * cp).normalize();

    // ---- toggles ----
    if (input.pressed('flyToggle')) this._toggleFlight();
    if (input.pressed('timewarp')) this.timeDilation = !this.timeDilation;
    if (input.pressed('aegis')) this.aegis = !this.aegis;
    if (input.pressed('dash') && this.dashCd <= 0) this._dash();

    const move = input.moveAxis();
    const moveAmt = Math.hypot(move.x, move.y);
    // camera-relative basis
    const fwd = this._tmp.set(Math.sin(this.camYaw), 0, Math.cos(this.camYaw));
    const right = this._tmp2.set(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
    const wish = new THREE.Vector3().addScaledVector(fwd, move.y).addScaledVector(right, move.x);
    if (wish.lengthSq() > 1e-4) wish.normalize();

    if (this.flying) this._updateFlight(wish, moveAmt, input, realDt);
    else this._updateGround(wish, moveAmt, input, realDt);

    // integrate
    this.pos.addScaledVector(this.vel, realDt);
    this._resolveCollision(realDt);

    // facing
    const horizSpeed = Math.hypot(this.vel.x, this.vel.z);
    if (horizSpeed > 1.5) {
      const targetYaw = Math.atan2(this.vel.x, this.vel.z);
      this.yaw = angleLerp(this.yaw, targetYaw, clamp(realDt * 10, 0, 1));
    } else if (this.flying || moveAmt > 0) {
      this.yaw = angleLerp(this.yaw, this.camYaw, clamp(realDt * 6, 0, 1));
    }

    this.speed = this.vel.length();
    this.sonic = this.speed > 120;

    // ---- super-speed slow-motion ----
    let ts = 1;
    if (this.timeDilation && (this.speed > this.RUN * 1.5 || this.boosting)) ts = lerp(1, 0.35, clamp01((this.speed - this.RUN) / 80));
    this.timeScale = damp(this.timeScale, ts, 8, realDt);

    // ---- rig placement + animation ----
    this.rig.group.position.set(this.pos.x, this.pos.y + 1.55, this.pos.z);
    this.rig.group.rotation.y = this.yaw;
    const turn = clamp((this.camYaw - this.yaw), -1, 1);
    this.rig.animate({ speed: this.speed, flying: this.flying, boosting: this.boosting, grounded: this.grounded, t: this.t, moveAmt, turn, action: this.action }, realDt);

    // wind streaks at speed
    if (this.speed > 40 && this.ctx.particles && Math.random() < clamp(this.speed / 160, 0.1, 0.9)) {
      const back = this.pos.clone().addScaledVector(this.vel, -0.05); back.y += 1.5 + Math.random() * 2;
      this.ctx.particles.energy(back, this.vel.clone().normalize().negate(), 2, this.boosting ? 0xbfe6ff : 0xffffff, 6);
    }
  }

  _toggleFlight() {
    this.flying = !this.flying;
    if (this.flying) { this.vel.y = Math.max(this.vel.y, 8); this.grounded = false; if (this.ctx.audio) this.ctx.audio.whoosh(1); }
    else if (this.ctx.audio) this.ctx.audio.whoosh(0.6);
  }

  _dash() {
    this.dashCd = 0.6;
    const dir = this.vel.lengthSq() > 1 ? this.vel.clone().normalize() : this.forward();
    if (!this.flying) dir.y = 0.1;
    this.vel.addScaledVector(dir, 36);
    this.ctx.particles.energy(this.pos.clone().setY(this.pos.y + 1.5), dir.clone().negate(), 14, 0x9fdcff, 16);
    if (this.ctx.audio) this.ctx.audio.whoosh(1.1);
    if (this.ctx.bus) this.ctx.bus.emit('POWER_USED', { kind: 'dash', pos: this.pos.clone(), intensity: 0.6 });
  }

  _updateGround(wish, moveAmt, input, dt) {
    const g = -34;
    const sprint = input.down_('sprint');
    const target = sprint ? this.SUPER : (moveAmt > 0 ? this.RUN : 0);
    const accel = this.grounded ? 90 : 24;
    const desired = wish.clone().multiplyScalar(target);
    this.vel.x = damp(this.vel.x, desired.x, accel / Math.max(target, 8), dt);
    this.vel.z = damp(this.vel.z, desired.z, accel / Math.max(target, 8), dt);
    this.vel.y += g * dt;

    // jump / skyfall charge
    if (input.down_('jump') && this.grounded) {
      this.jumpHeld += dt;
      if (this.jumpHeld > 0.18) { this.charging = true; this.chargeAmt = clamp(this.jumpHeld, 0, 1.2); }
    }
    if (input.released('jump')) {
      if (this.charging) {
        const power = 14 + this.chargeAmt * 34;
        this.vel.y = power;
        this.vel.addScaledVector(wish, this.chargeAmt * 30);
        this.ctx.particles.dust(this.pos.clone(), 18, 0xb9a98a);
        if (this.ctx.audio) this.ctx.audio.boom(0.6);
        if (this.ctx.bus) this.ctx.bus.emit('POWER_USED', { kind: 'superjump', pos: this.pos.clone(), intensity: 1 });
      } else if (this.grounded) { this.vel.y = 13; }
      this.jumpHeld = 0; this.charging = false; this.chargeAmt = 0;
    }
    if (!input.down_('jump')) { this.jumpHeld = 0; this.charging = false; }
    this.boosting = false;
  }

  _updateFlight(wish, moveAmt, input, dt) {
    const sprint = input.down_('sprint');
    this.boosting = sprint && moveAmt > 0.1;
    const target = this.boosting ? this.BOOST : (moveAmt > 0.1 ? this.FLY : 0);
    // vertical
    let vy = 0;
    if (input.down_('jump')) vy += 1;
    if (input.down_('descend')) vy -= 1;
    const aimAssistUp = this.aimDir.y * (moveAmt > 0.1 ? -target * 0.5 : 0); // climb/dive with look while flying

    const desired = wish.clone().multiplyScalar(target);
    desired.y = vy * (this.boosting ? 60 : 30) + aimAssistUp;
    const accel = this.boosting ? 55 : 30;
    this.vel.x = damp(this.vel.x, desired.x, accel / Math.max(target, 20), dt);
    this.vel.z = damp(this.vel.z, desired.z, accel / Math.max(target, 20), dt);
    this.vel.y = damp(this.vel.y, desired.y, 6, dt);
    // gentle hover gravity when idle
    if (moveAmt < 0.1 && Math.abs(vy) < 0.1) this.vel.y += Math.sin(this.t * 2) * 0.3 * dt;

    // sonic boom when crossing threshold
    const s = this.vel.length();
    if (s > 125 && this.lastBoomSpeed <= 125) this._sonicBoom();
    this.lastBoomSpeed = s;

    // landing
    if (input.down_('descend') && this.grounded) { this.flying = false; this.vel.y = 0; }
  }

  // ---- third-person camera with collision + dynamic FOV ----
  updateCamera(camera, dt) {
    const eye = this.eyesPosition();
    const headTarget = this._tmp.set(this.pos.x, this.pos.y + 2.0, this.pos.z);
    // desired camera position behind along aim
    const back = this._tmp2.copy(this.aimDir).multiplyScalar(-1);
    const dist = this.camDist;
    const desired = new THREE.Vector3().copy(headTarget).addScaledVector(back, dist).add(new THREE.Vector3(0, 0.6, 0));

    // collision pull-in: sample the segment for building intrusion
    const cols = this.ctx.city.staticCollidersNear(desired.x, desired.z, 6);
    let t = 1;
    const dir = new THREE.Vector3().subVectors(desired, headTarget);
    const len = dir.length(); dir.divideScalar(len || 1);
    for (let s = 0.2; s <= 1; s += 0.15) {
      const px = headTarget.x + dir.x * len * s, py = headTarget.y + dir.y * len * s, pz = headTarget.z + dir.z * len * s;
      for (const c of cols) {
        if (c.removed) continue;
        if (px > c.min.x && px < c.max.x && py > c.min.y && py < c.max.y && pz > c.min.z && pz < c.max.z) { t = Math.min(t, s - 0.05); }
      }
    }
    desired.copy(headTarget).addScaledVector(dir, len * clamp(t, 0.2, 1));

    camera.position.lerp(desired, clamp(dt * 9, 0, 1));
    camera.lookAt(headTarget);

    // dynamic FOV with speed
    const baseFov = this.settings.get('fov');
    const targetFov = this.settings.get('speedFovBoost') ? baseFov + clamp(this.speed / 4, 0, 28) : baseFov;
    camera.fov = damp(camera.fov, targetFov, 5, dt);
    camera.updateProjectionMatrix();

    // shake
    if (this._shake > 0 && !this.settings.get('reduceMotion')) {
      const sh = this._shake * this.settings.get('shake');
      camera.position.x += (Math.random() - 0.5) * sh;
      camera.position.y += (Math.random() - 0.5) * sh;
      this._shake = Math.max(0, this._shake - dt * 2.5);
    }
    void eye;
  }
  addShake(v) { this._shake = Math.max(this._shake || 0, v); }

  // ---- save/load ----
  saveState() { return { pos: [this.pos.x, this.pos.y, this.pos.z], flying: this.flying, health: this.health }; }
  loadState(s) { if (!s) return; if (s.pos) this.pos.set(s.pos[0], s.pos[1], s.pos[2]); this.flying = !!s.flying; if (s.health) this.health = s.health; }

  triggerAction(name, dur = 0.3) { this.action = name; this.actionTimer = dur; }
}
