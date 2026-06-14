// director.js — the drama director: paces optional world events (crimes, fires, accidents,
// villain attacks, meteor disasters), spawns enemies & emergency response, tracks resolution,
// and grants renown/XP for heroics. Everything is optional — ignore it and just fly.
import * as THREE from 'three';
import { RNG, clamp } from '../core/util.js';
import { HALF } from '../world/cityplan.js';

const EVENT_COLORS = { crime: 0xffcc33, fire: 0xff5522, accident: 0xff8833, villain: 0xcc33ff, meteor: 0x66ddff };

export class Director {
  constructor(ctx) {
    this.ctx = ctx; this.rng = new RNG(31337);
    this.events = [];
    this.spawnTimer = 12;
    this.enabled = true;
    this.maxEvents = 3;
    this.markerGeo = new THREE.CylinderGeometry(0.6, 0.6, 80, 6, 1, true);
  }

  _marker(pos, type) {
    const mat = new THREE.MeshBasicMaterial({ color: EVENT_COLORS[type] || 0xffffff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(this.markerGeo, mat); m.position.set(pos.x, 40, pos.z); this.ctx.scene.add(m); return m;
  }

  _groundPos(minR = 50, maxR = 120) {
    const hero = this.ctx.hero; const a = this.rng.float(0, 6.28); const r = this.rng.float(minR, maxR);
    return new THREE.Vector3(clamp(hero.pos.x + Math.cos(a) * r, -HALF + 20, HALF - 20), 0, clamp(hero.pos.z + Math.sin(a) * r, -HALF + 20, HALF - 20));
  }

  spawn(type, posOverride) {
    const pos = posOverride || this._groundPos();
    const ev = { type, pos, marker: this._marker(pos, type), t: 0, state: 'active', enemies: [], presence: 0, fx: 0 };
    switch (type) {
      case 'crime':
        ev.enemies = this.ctx.combat.spawnWave(this.rng.int(2, 3), pos, ['thug']);
        this.ctx.bus.emit('EMERGENCY', { pos: pos.clone(), intensity: 1 });
        this.ctx.traffic.spawnEmergency(pos, 'police');
        break;
      case 'villain':
        ev.enemies = this.ctx.combat.spawnWave(this.rng.int(4, 6), pos, ['thug', 'enforcer', 'drone', 'brute']);
        this.ctx.bus.emit('EMERGENCY', { pos: pos.clone(), intensity: 1.6 });
        this.ctx.traffic.spawnEmergency(pos, 'police');
        break;
      case 'fire':
        this.ctx.bus.emit('EMERGENCY', { pos: pos.clone(), intensity: 1.4 });
        this.ctx.traffic.spawnEmergency(pos, 'fire');
        break;
      case 'accident':
        this.ctx.traffic.shockwave(pos, 18, 30);
        this.ctx.bus.emit('EMERGENCY', { pos: pos.clone(), intensity: 1 });
        this.ctx.traffic.spawnEmergency(pos, 'ambulance');
        break;
      case 'meteor': {
        ev.pos = new THREE.Vector3(pos.x, 0, pos.z);
        ev.meteorPos = new THREE.Vector3(pos.x, 200, pos.z);
        ev.meteorVel = new THREE.Vector3((this.rng.float(-1, 1)) * 6, -42, (this.rng.float(-1, 1)) * 6);
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(3, 0), new THREE.MeshStandardMaterial({ color: 0x331a10, emissive: 0xff5522, emissiveIntensity: 2 }));
        ev.meteor = m; this.ctx.scene.add(m);
        this.ctx.bus.emit('EMERGENCY', { pos: pos.clone(), intensity: 2 });
        break;
      }
    }
    this.events.push(ev);
    if (this.ctx.ui) this.ctx.ui.notify(EVENT_LABEL[type] || 'Incident', EVENT_COLORS[type]);
    return ev;
  }

  update(dt) {
    // pacing
    if (this.enabled) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.events.length < this.maxEvents) {
        this.spawnTimer = this.rng.float(18, 38);
        const lvl = this.ctx.progression ? this.ctx.progression.level : 1;
        const pool = ['crime', 'accident', 'fire', 'crime', 'villain'];
        if (lvl > 3) pool.push('meteor', 'villain');
        this.spawn(this.rng.pick(pool));
      }
    }

    const hero = this.ctx.hero;
    for (let i = this.events.length - 1; i >= 0; i--) {
      const ev = this.events[i]; ev.t += dt;
      ev.marker.material.opacity = 0.25 + Math.abs(Math.sin(ev.t * 2)) * 0.3;
      const near = Math.hypot(hero.pos.x - ev.pos.x, hero.pos.z - ev.pos.z) < 16;

      if (ev.type === 'crime' || ev.type === 'villain') {
        const alive = ev.enemies.filter((e) => !e.dead).length;
        if (alive === 0) this._resolve(ev, i, ev.type === 'villain' ? 60 : 25);
        else if (ev.t > 90) this._expire(ev, i);
      } else if (ev.type === 'fire') {
        ev.fx -= dt;
        if (ev.fx <= 0) { ev.fx = 0.08; this.ctx.particles.ember(ev.pos.clone().setY(2 + Math.random() * 6), 4, 0xff5522); this.ctx.particles.smoke(ev.pos.clone().setY(6), 3, 0x222222, 3); }
        if (near) ev.presence += dt; else ev.presence = Math.max(0, ev.presence - dt * 0.5);
        if (ev.presence > 3.5) this._resolve(ev, i, 30);
        else if (ev.t > 60) this._expire(ev, i);
      } else if (ev.type === 'accident') {
        if (near) ev.presence += dt;
        if (ev.presence > 2.5) this._resolve(ev, i, 18);
        else if (ev.t > 45) this._expire(ev, i);
      } else if (ev.type === 'meteor') {
        ev.meteorPos.addScaledVector(ev.meteorVel, dt);
        ev.meteor.position.copy(ev.meteorPos);
        ev.meteor.rotation.x += dt * 2; ev.meteor.rotation.y += dt * 1.3;
        this.ctx.particles.ember(ev.meteorPos.clone(), 3, 0xff7733);
        const heroNear = hero.pos.distanceTo(ev.meteorPos) < 6 && hero.speed > 30;
        if (heroNear) { // intercepted!
          this.ctx.destruction.explosion(ev.meteorPos.clone(), 16, 60, 0x66ddff);
          this.ctx.scene.remove(ev.meteor); ev.meteor.geometry.dispose();
          this._resolve(ev, i, 80); continue;
        }
        if (ev.meteorPos.y <= 2) {
          this.ctx.destruction.explosion(ev.meteorPos.clone().setY(1), 26, 120, 0xff6622);
          this.ctx.destruction.crater(ev.meteorPos.clone().setY(0), 18, 140);
          this.ctx.scene.remove(ev.meteor); ev.meteor.geometry.dispose();
          this._expire(ev, i);
        }
      }
    }
  }

  _resolve(ev, i, reward) {
    this.ctx.bus.emit('RESCUE', { pos: ev.pos.clone(), intensity: 2 });
    if (this.ctx.progression) { this.ctx.progression.addRenown(reward); this.ctx.progression.addXP(reward); this.ctx.progression.stat('saves', 1); }
    if (this.ctx.ui) this.ctx.ui.notify('Crisis resolved! +' + reward + ' Renown', 0x66ff99);
    this._cleanup(ev, i);
  }
  _expire(ev, i) {
    if (this.ctx.ui) this.ctx.ui.notify('Incident ended', 0x888888);
    this._cleanup(ev, i);
  }
  _cleanup(ev, i) {
    this.ctx.scene.remove(ev.marker); ev.marker.geometry && ev.marker.material.dispose();
    this.events.splice(i, 1);
  }

  activeEventPositions() { return this.events.map((e) => ({ x: e.pos.x, y: 0, z: e.pos.z })); }
  clear() { for (const ev of this.events) { this.ctx.scene.remove(ev.marker); if (ev.meteor) this.ctx.scene.remove(ev.meteor); } this.events.length = 0; }
}

const EVENT_LABEL = { crime: 'Crime in progress!', fire: 'Building fire!', accident: 'Traffic accident!', villain: 'Villains attacking!', meteor: 'Meteor incoming!' };
