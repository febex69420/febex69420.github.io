// The Marshal's personal arsenal — six fictional weapons with viewmodels,
// recoil, spread, tracers, impacts, rockets with splash damage, reloads and ADS.
import * as THREE from 'three';
import { clamp, lerp, damp, getBoxGeom } from '../core/utils.js';

const DEFS = [
  { id: 'pistol', name: 'VK-9 SIDEARM', dmg: 26, rof: 0.17, auto: false, mag: 15, reserve: 90, spread: 0.014, recoil: 0.014, sound: 'pistol', reload: 1.1, tracer: 0xffe0a0 },
  { id: 'rifle', name: 'AR-77 "VULKAN"', dmg: 24, rof: 0.095, auto: true, mag: 30, reserve: 240, spread: 0.02, recoil: 0.01, sound: 'rifle', reload: 1.7, tracer: 0xffd080 },
  { id: 'shotgun', name: 'K-12 "DRUMFIRE"', dmg: 13, pellets: 8, rof: 0.8, auto: false, mag: 6, reserve: 42, spread: 0.055, recoil: 0.045, sound: 'shotgun', reload: 2.2, tracer: 0xffc060 },
  { id: 'sniper', name: 'M-88 "LONGEYE"', dmg: 130, rof: 1.5, auto: false, mag: 5, reserve: 30, spread: 0.001, recoil: 0.05, sound: 'sniper', reload: 2.4, zoom: true, tracer: 0xd0e8ff },
  { id: 'lmg', name: 'HV-6 "TALON"', dmg: 20, rof: 0.075, auto: true, mag: 100, reserve: 300, spread: 0.032, recoil: 0.012, sound: 'lmg', tracer: 0xffb060, reload: 3.4 },
  { id: 'rpg', name: 'RPL-4 "METEOR"', dmg: 160, rof: 1.2, auto: false, mag: 1, reserve: 12, spread: 0.004, recoil: 0.08, sound: 'rocket', reload: 2.6, rocket: true, tracer: 0xffa040 },
];

export class Weapons {
  constructor(ctx) {
    this.ctx = ctx;
    this.slots = DEFS.map(d => ({ def: d, mag: d.mag, reserve: d.reserve }));
    this.current = -1;           // holstered
    this.cooldown = 0;
    this.reloading = 0;
    this.ads = false;
    this.kick = 0;
    this.rockets = [];
    this.baseFov = 70;

    // viewmodel rig attached to camera
    this.rig = new THREE.Group();
    ctx.camera.add(this.rig);
    this.models = DEFS.map(d => {
      const m = this._buildModel(d.id);
      m.visible = false;
      this.rig.add(m);
      return m;
    });
    this.rocketGeo = new THREE.ConeGeometry(0.14, 0.8, 8);
    this.rocketMat = new THREE.MeshStandardMaterial({ color: 0x4c5b3c, roughness: 0.6 });
  }

  _buildModel(id) {
    const M = this.ctx.mats;
    const g = new THREE.Group();
    const part = (w, h, d, x, y, z, mat = M.gunmetal) => {
      const mesh = new THREE.Mesh(getBoxGeom(w, h, d), mat);
      mesh.position.set(x, y, z);
      g.add(mesh);
      return mesh;
    };
    switch (id) {
      case 'pistol':
        part(0.05, 0.09, 0.26, 0, 0.02, -0.1);
        part(0.045, 0.14, 0.06, 0, -0.08, 0.02);
        break;
      case 'rifle':
        part(0.055, 0.1, 0.62, 0, 0, -0.18);
        part(0.05, 0.18, 0.07, 0, -0.11, 0.02);
        part(0.05, 0.06, 0.2, 0, -0.02, 0.18, M.wood);
        part(0.02, 0.05, 0.05, 0, 0.08, -0.3);
        break;
      case 'shotgun':
        part(0.06, 0.1, 0.7, 0, 0, -0.2);
        part(0.07, 0.07, 0.24, 0, -0.07, -0.28, M.wood);
        part(0.05, 0.12, 0.2, 0, -0.08, 0.16, M.wood);
        break;
      case 'sniper':
        part(0.05, 0.09, 0.95, 0, 0, -0.3);
        part(0.06, 0.08, 0.22, 0, 0.09, -0.15);
        part(0.05, 0.14, 0.2, 0, -0.1, 0.14, M.woodDark);
        part(0.02, 0.02, 0.3, 0, 0.02, -0.75);
        break;
      case 'lmg':
        part(0.07, 0.13, 0.75, 0, 0, -0.2);
        part(0.09, 0.18, 0.14, 0, -0.14, -0.05);
        part(0.05, 0.16, 0.07, 0, -0.12, 0.2);
        part(0.02, 0.12, 0.02, 0, -0.15, -0.5);
        break;
      case 'rpg':
        part(0.11, 0.11, 1.05, 0, 0, -0.2);
        part(0.16, 0.16, 0.2, 0, 0, -0.75, M.camoDark);
        part(0.05, 0.12, 0.06, 0, -0.12, 0.05);
        break;
    }
    g.position.set(0.28, -0.26, -0.55);
    return g;
  }

  get slot() { return this.current >= 0 ? this.slots[this.current] : null; }

  resupplyAll() {
    for (const s of this.slots) { s.mag = s.def.mag; s.reserve = s.def.reserve; }
    this.ctx.hud.notify('ARMOURY', 'Full arsenal issued to the Supreme Marshal.', 'mil');
    this.ctx.audio.reload();
  }

  select(i) {
    if (i === this.current) i = -1;   // toggle holster
    this.current = i;
    this.reloading = 0;
    this.ads = false;
    this.models.forEach((m, k) => { m.visible = k === i; });
    if (i >= 0) this.ctx.audio.uiClick();
  }

  holster() { this.select(-1); this.models.forEach(m => m.visible = false); this.current = -1; }

  update(dt) {
    const ctx = this.ctx;
    const input = ctx.input;
    this.cooldown -= dt;

    // rockets always simulate
    this._updateRockets(dt);

    if (ctx.player.vehicle || ctx.player.sitting) {
      if (this.current >= 0) this.holster();
      ctx.hud.setAmmo(null);
      ctx.hud.scope(false);
      return;
    }
    if (input.locked && !ctx.hud.menuOpen) {
      for (let i = 0; i < 6; i++) {
        if (input.pressed('Digit' + (i + 1))) this.select(i);
      }
      if (input.pressed('KeyQ') || input.pressed('Digit0')) this.select(-1);
      const wheel = input.wheel;
      if (wheel !== 0) {
        input.wheel = 0;
        let n = this.current + (wheel > 0 ? 1 : -1);
        if (n < -1) n = 5; if (n > 5) n = -1;
        this.current = n;
        this.models.forEach((m, k) => { m.visible = k === n; });
      }
    }

    const s = this.slot;
    ctx.hud.setAmmo(s ? { name: s.def.name, mag: this.reloading > 0 ? '--' : s.mag, reserve: s.reserve } : null);
    if (!s) { ctx.hud.scope(false); this._animateRig(dt, null); return; }

    // ADS
    this.ads = input.locked && !ctx.hud.menuOpen && input.button(2) && this.reloading <= 0;
    const wantFov = this.ads ? (s.def.zoom ? 16 : 55) : this.baseFov;
    ctx.camera.fov = damp(ctx.camera.fov, wantFov, 12, dt);
    ctx.camera.updateProjectionMatrix();
    ctx.hud.scope(this.ads && !!s.def.zoom);

    // reload
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        const need = s.def.mag - s.mag;
        const take = Math.min(need, s.reserve);
        s.mag += take;
        s.reserve -= take;
      }
    } else if (input.locked && !ctx.hud.menuOpen && input.pressed('KeyR') && s.mag < s.def.mag && s.reserve > 0) {
      this.reloading = s.def.reload;
      this.ctx.audio.reload();
    }

    // fire
    const wantFire = input.locked && !ctx.hud.menuOpen && (s.def.auto ? input.button(0) : input.buttonPressed(0));
    if (wantFire && this.cooldown <= 0 && this.reloading <= 0) {
      if (s.mag <= 0) {
        this.cooldown = 0.3;
        this.ctx.audio.uiClick();
        if (s.reserve > 0) { this.reloading = s.def.reload; this.ctx.audio.reload(); }
      } else {
        this._fire(s);
      }
    }

    this._animateRig(dt, s);
    ctx.hud.setSpread((this.ads ? 0.4 : 1) * (s.def.spread * 900 + this.kick * 260) + (ctx.player.speed2D > 1 ? 8 : 0));
  }

  _fire(s) {
    const ctx = this.ctx;
    const cam = ctx.camera;
    s.mag--;
    this.cooldown = s.def.rof;
    this.kick = Math.min(0.3, this.kick + s.def.recoil * 1.4);
    ctx.player.pitch += s.def.recoil * (0.7 + Math.random() * 0.5);
    ctx.player.yaw += (Math.random() - 0.5) * s.def.recoil * 0.5;
    ctx.audio.shot(s.def.sound);
    const origin = new THREE.Vector3();
    cam.getWorldPosition(origin);
    const baseDir = new THREE.Vector3();
    cam.getWorldDirection(baseDir);
    // muzzle world pos (approx from rig)
    const muzzle = origin.clone().addScaledVector(baseDir, 0.9);
    muzzle.y -= 0.12;
    ctx.effects.muzzle(muzzle.x, muzzle.y, muzzle.z);
    ctx.events.emit('noise', { x: origin.x, z: origin.z, severity: 1, kind: 'gunfire', source: 'player' });

    if (s.def.rocket) {
      const mesh = new THREE.Mesh(this.rocketGeo, this.rocketMat);
      mesh.position.copy(muzzle);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), baseDir);
      ctx.scene.add(mesh);
      this.rockets.push({ mesh, vel: baseDir.clone().multiplyScalar(52), life: 8, smoke: 0 });
      return;
    }
    const pellets = s.def.pellets || 1;
    for (let i = 0; i < pellets; i++) {
      const spread = s.def.spread * (this.ads ? 0.35 : 1) + this.kick * 0.05 + (ctx.player.speed2D > 1 ? 0.012 : 0);
      const dir = baseDir.clone();
      dir.x += (Math.random() - 0.5) * spread * 2;
      dir.y += (Math.random() - 0.5) * spread * 2;
      dir.z += (Math.random() - 0.5) * spread * 2;
      dir.normalize();
      this._hitscan(origin, muzzle, dir, s);
    }
  }

  _hitscan(origin, muzzle, dir, s) {
    const ctx = this.ctx;
    const maxD = 420;
    const wallD = ctx.world.colliders.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, maxD, 0.5);
    // terrain hit
    let terrD = Infinity;
    for (let t = 4; t < Math.min(maxD, wallD); t += 6) {
      const y = origin.y + dir.y * t;
      if (y < ctx.world.terrainHeight(origin.x + dir.x * t, origin.z + dir.z * t)) { terrD = t; break; }
    }
    const npcHit = ctx.npcs.raycastNPC(origin, dir, Math.min(wallD, terrD));
    const vehHit = ctx.vehicles.raycastVehicle(origin, dir, Math.min(wallD, terrD, npcHit ? npcHit.dist : Infinity));
    let hitD = Math.min(wallD, terrD);
    let hitKind = wallD < terrD ? 'wall' : 'terrain';
    if (npcHit && npcHit.dist < hitD) { hitD = npcHit.dist; hitKind = 'npc'; }
    if (vehHit && vehHit.dist < hitD) { hitD = vehHit.dist; hitKind = 'vehicle'; }

    ctx.effects.tracer(muzzle, dir, isFinite(hitD) ? hitD : maxD, s.def.tracer);

    if (!isFinite(hitD)) return;
    const hp = origin.clone().addScaledVector(dir, hitD);
    // destructibles get first claim on the impact point
    if (ctx.world.props.hitAt(hp, s.def.dmg)) { ctx.hud.hitmark(); return; }
    if (hitKind === 'npc') {
      const dmg = s.def.dmg * (npcHit.head ? 2.4 : 1);
      npcHit.npc.damage(dmg, origin);
      ctx.effects.burst(hp.x, hp.y, hp.z, 0x9a5040, 8, 2.5);
      ctx.hud.hitmark();
    } else if (hitKind === 'vehicle') {
      vehHit.vehicle.damage(s.def.dmg, hp);
      ctx.effects.burst(hp.x, hp.y, hp.z, 0xffd080, 10, 4);
      ctx.audio.impact(hp.x, hp.y, hp.z);
      ctx.hud.hitmark();
    } else {
      ctx.effects.burst(hp.x, hp.y, hp.z, hitKind === 'terrain' ? 0x7a6a4a : 0xb8b0a0, 10, 3);
      ctx.effects.smoke(hp.x, hp.y, hp.z, { size: 0.4, grow: 1, up: 0.6, life: 0.5, color: 0xaaa298 });
      ctx.audio.impact(hp.x, hp.y, hp.z);
    }
  }

  _updateRockets(dt) {
    const ctx = this.ctx;
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.life -= dt;
      r.vel.y -= 2.5 * dt;
      const step = r.vel.length() * dt;
      const dir = r.vel.clone().normalize();
      const p = r.mesh.position;
      // collision march
      const wallD = ctx.world.colliders.raycast(p.x, p.y, p.z, dir.x, dir.y, dir.z, step + 0.5, 0.4);
      const terrH = ctx.world.terrainHeight(p.x + dir.x * step, p.z + dir.z * step);
      const npcHit = ctx.npcs.raycastNPC(p, dir, step + 0.6);
      let boom = false;
      if (wallD <= step + 0.5 || npcHit || r.life <= 0) boom = true;
      p.addScaledVector(dir, step);
      if (p.y - 0.3 < terrH || p.y < ctx.world.seaLevel) boom = true;
      r.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      r.smoke -= dt;
      if (r.smoke <= 0) {
        r.smoke = 0.03;
        ctx.effects.smoke(p.x, p.y, p.z, { size: 0.5, grow: 1.4, up: 0.2, life: 0.9, color: 0xcabfae });
      }
      if (boom) {
        ctx.scene.remove(r.mesh);
        this.rockets.splice(i, 1);
        ctx.effects.explode(p.x, p.y, p.z, 9, 150);
      }
    }
  }

  _animateRig(dt, s) {
    this.kick = damp(this.kick, 0, 10, dt);
    const ctx = this.ctx;
    const targetX = this.ads ? 0 : 0.28;
    const targetY = (this.ads ? -0.18 : -0.26) + this.kick * 0.5 + Math.sin(ctx.player._bobPhase * 2) * (ctx.player.speed2D > 0.5 ? 0.008 : 0.002);
    const targetZ = (this.ads ? -0.42 : -0.55) + this.kick * 0.9;
    this.rig.position.x = damp(this.rig.position.x, targetX, 14, dt);
    this.rig.position.y = damp(this.rig.position.y, targetY, 14, dt);
    this.rig.position.z = damp(this.rig.position.z, targetZ, 14, dt);
    this.rig.rotation.x = damp(this.rig.rotation.x, this.kick * 1.6, 14, dt);
    if (s && s.def.zoom && this.ads) this.rig.visible = false;
    else this.rig.visible = true;
    // hide reloading weapon slightly lowered
    if (this.reloading > 0) this.rig.position.y -= 0.14;
  }
}
