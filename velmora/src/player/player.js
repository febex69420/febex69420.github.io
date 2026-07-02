// First-person controller: capsule collision vs the box world + analytic
// terrain, sprint/stamina, crouch, jump, interaction, sitting, sleeping,
// vehicle hand-off, health/regen and camera (incl. vehicle chase cam).
import * as THREE from 'three';
import { clamp, lerp, damp, dist2D } from '../core/utils.js';

export class Player {
  constructor(ctx) {
    this.ctx = ctx;
    const P = ctx.config.player;
    this.position = new THREE.Vector3(0, 40, 150);   // gardens, facing the palace
    this.yaw = Math.PI;
    this.pitch = 0;
    this.velY = 0;
    this.onGround = true;
    this.crouch = false;
    this.health = P.maxHealth;
    this.stamina = P.maxStamina;
    this.regenDelay = 0;
    this.vehicle = null;
    this.sitting = null;
    this.sensitivity = 0.0023;
    this.invertY = false;
    this._bobPhase = 0;
    this._stepAcc = 0;
    this._shake = 0;
    this._camVehicleFirst = false;
    this._fallV = 0;
    this.speed2D = 0;
  }

  spawnAt(x, z, yaw = 0, refY = this.position.y + 2) {
    const y = this.ctx.world.groundHeight(x, z, refY);
    this.position.set(x, y, z);
    this.yaw = yaw;
    this.velY = 0;
  }

  get eyeY() {
    return this.position.y + (this.crouch ? 1.1 : this.ctx.config.player.eyeHeight);
  }

  damage(amount, from) {
    if (this.health <= 0) return;
    this.health -= amount;
    this.regenDelay = 6;
    this.ctx.hud.damageFlash();
    this.shake(0.3);
    if (this.health <= 0) {
      this.health = 0;
      this._die();
    }
  }

  _die() {
    const ctx = this.ctx;
    ctx.hud.notify('MEDICAL CORPS', 'The Supreme Marshal has been evacuated to the palace infirmary.', 'warn');
    ctx.hud.fade(true);
    if (this.vehicle) this.vehicle.exit(this);
    setTimeout(() => {
      this.health = ctx.config.player.maxHealth;
      this.stamina = ctx.config.player.maxStamina;
      this.spawnAt(-70, -80, Math.PI / 2);   // bedchamber is upstairs; infirmary = west wing
      this.position.y = ctx.world.groundHeight(-70, -80, 50);
      ctx.hud.fade(false);
    }, 1600);
  }

  shake(amount) { this._shake = Math.min(1.2, this._shake + amount); }

  sitAt(pos, yaw, line) {
    this.sitting = { pos: pos.clone(), yaw, exit: this.position.clone() };
    this.yaw = yaw;
    if (line) this.ctx.hud.subtitle('COURT HERALD', line);
  }

  sleep() {
    const ctx = this.ctx;
    ctx.hud.fade(true);
    setTimeout(() => {
      ctx.sky.tod = 7;
      ctx.sky.day++;
      ctx.hud.fade(false);
      ctx.hud.notify('PALACE STAFF', `You wake refreshed. Day ${ctx.sky.day} of your rule.`, '');
      this.health = ctx.config.player.maxHealth;
    }, 1200);
  }

  teleport(x, y, z, msg) {
    const ctx = this.ctx;
    ctx.hud.fade(true);
    setTimeout(() => {
      this.position.set(x, y, z);
      this.velY = 0;
      ctx.hud.fade(false);
      if (msg) ctx.hud.notify('', msg, '');
    }, 500);
  }

  update(dt) {
    const ctx = this.ctx;
    const { input, camera, world } = ctx;
    const P = ctx.config.player;

    // mouse look (also drives vehicle camera orbit)
    if (input.locked && !ctx.hud.menuOpen) {
      const m = input.consumeMouse();
      const inv = this.invertY ? -1 : 1;
      if (!this.vehicle) {
        this.yaw -= m.x * this.sensitivity;
        this.pitch = clamp(this.pitch - m.y * this.sensitivity * inv, -1.45, 1.45);
      } else {
        this._orbitYaw = (this._orbitYaw || 0) - m.x * this.sensitivity;
        this._orbitPitch = clamp((this._orbitPitch || 0.25) + m.y * this.sensitivity * inv, -0.2, 1.1);
      }
    } else {
      input.consumeMouse();
    }

    // stamina + regen
    if (this.regenDelay > 0) this.regenDelay -= dt;
    else if (this.health < P.maxHealth) this.health = Math.min(P.maxHealth, this.health + 5 * dt);

    if (this.vehicle) {
      this._vehicleCamera(dt);
      this._checkExit();
      return;
    }
    if (this.sitting) {
      this.position.copy(this.sitting.pos);
      this._applyCamera(dt);
      if (input.key('KeyW') || input.key('KeyS') || input.key('KeyA') || input.key('KeyD') || input.pressed('KeyE')) {
        this.position.copy(this.sitting.exit);
        this.sitting = null;
      }
      this._interact();
      return;
    }

    // movement input
    let fwd = 0, str = 0;
    if (input.locked && !ctx.hud.menuOpen) {
      if (input.key('KeyW')) fwd += 1;
      if (input.key('KeyS')) fwd -= 1;
      if (input.key('KeyA')) str -= 1;
      if (input.key('KeyD')) str += 1;
      if (input.pressed('KeyC')) this.crouch = !this.crouch;
    }
    const sprinting = input.key('ShiftLeft') && fwd > 0 && this.stamina > 1 && !this.crouch;
    if (sprinting) this.stamina = Math.max(0, this.stamina - 16 * dt);
    else this.stamina = Math.min(P.maxStamina, this.stamina + 10 * dt);
    const speed = this.crouch ? P.crouchSpeed : sprinting ? P.runSpeed : P.walkSpeed;

    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let vx = 0, vz = 0;
    const len = Math.hypot(fwd, str) || 1;
    vx = ((-sin * fwd) + (cos * str)) / len * speed;
    vz = ((-cos * fwd) + (-sin * str)) / len * speed;
    this.speed2D = Math.hypot(vx, vz);

    // integrate horizontal + collide
    let nx = this.position.x + vx * dt;
    let nz = this.position.z + vz * dt;
    const c = world.colliders.collideCircle(nx, nz, P.radius, this.position.y + P.stepHeight, this.position.y + (this.crouch ? 1.3 : 1.75));
    nx = c.x; nz = c.z;

    // vertical
    const ground = world.groundHeight(nx, nz, this.position.y, P.stepHeight);
    if (input.locked && !ctx.hud.menuOpen && input.pressed('Space') && this.onGround) {
      this.velY = P.jumpSpeed;
      this.onGround = false;
    }
    this.velY -= P.gravity * dt;
    let ny = this.position.y + this.velY * dt;
    if (ny <= ground) {
      // landing
      if (this._fallV < -13) this.damage((-this._fallV - 12) * 6, null);
      ny = ground;
      this.velY = 0;
      this.onGround = true;
    } else {
      this.onGround = ny - ground < 0.05;
      // step up smoothing
      if (this.onGround || (ground - this.position.y > 0 && ground - this.position.y <= P.stepHeight && this.velY <= 0)) {
        ny = Math.max(ny, ground);
      }
      // ceiling
      const ceil = world.colliders.ceilingAt(nx, nz, this.position.y + 1);
      const headroom = this.crouch ? 1.3 : 1.8;
      if (ny + headroom > ceil) { ny = ceil - headroom; this.velY = Math.min(0, this.velY); }
    }
    this._fallV = this.velY;
    this.position.set(nx, ny, nz);

    // swimming/ocean guard: don't sink below sea
    if (this.position.y < world.seaLevel - 1.2) {
      this.position.y = world.seaLevel - 1.2;
      this.velY = 0;
      this.onGround = true;
    }

    // footsteps + head bob
    if (this.onGround && this.speed2D > 0.5) {
      this._bobPhase += this.speed2D * dt * 1.6;
      this._stepAcc += this.speed2D * dt;
      const stride = sprinting ? 3.4 : 2.1;
      if (this._stepAcc > stride) {
        this._stepAcc = 0;
        ctx.audio.footstep(sprinting);
      }
    }

    this._applyCamera(dt);
    this._interact();
  }

  _applyCamera(dt) {
    const camera = this.ctx.camera;
    const bob = this.speed2D > 0.5 && this.onGround ? Math.sin(this._bobPhase * 2) * 0.035 : 0;
    let sx = 0, sy = 0;
    if (this._shake > 0.001) {
      this._shake = damp(this._shake, 0, 6, dt);
      sx = (Math.random() - 0.5) * this._shake * 0.12;
      sy = (Math.random() - 0.5) * this._shake * 0.12;
    }
    camera.position.set(this.position.x, this.eyeY + bob + sy, this.position.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(this.pitch + sx, this.yaw, 0);
  }

  _vehicleCamera(dt) {
    const camera = this.ctx.camera;
    const v = this.vehicle;
    if (this._camVehicleFirst) {
      const eye = v.eyePos();
      camera.position.copy(eye);
      camera.rotation.order = 'YXZ';
      camera.rotation.set((this._orbitPitch || 0) * -0.4, v.yaw + (this._orbitYaw || 0), 0);
      return;
    }
    const dist = v.camDist || 10;
    const oy = this._orbitYaw || 0, op = this._orbitPitch ?? 0.3;
    const totalYaw = v.yaw + oy;
    const target = new THREE.Vector3(v.pos.x, v.pos.y + 2, v.pos.z);
    const off = new THREE.Vector3(
      Math.sin(totalYaw) * Math.cos(op), Math.sin(op), Math.cos(totalYaw) * Math.cos(op)
    ).multiplyScalar(dist);
    const desired = target.clone().add(off);
    // keep camera above ground
    const g = this.ctx.world.groundHeight(desired.x, desired.z, desired.y + 3) + 0.5;
    if (desired.y < g) desired.y = g;
    camera.position.lerp(desired, 1 - Math.exp(-8 * dt));
    camera.lookAt(target);
  }

  _checkExit() {
    const ctx = this.ctx;
    if (!ctx.input.locked || ctx.hud.menuOpen) return;
    if (ctx.input.pressed('KeyV')) this._camVehicleFirst = !this._camVehicleFirst;
    if (ctx.input.pressed('KeyE')) {
      if (this.vehicle.canExit()) this.vehicle.exit(this);
      else ctx.hud.notify('', 'Cannot exit at this speed/altitude.', 'warn');
    }
  }

  _interact() {
    const ctx = this.ctx;
    if (!ctx.input.locked || ctx.hud.menuOpen) { ctx.hud.prompt(null); return; }
    const p = this.position;
    // interactables
    let best = null, bestD = 1e9, bestLabel = '';
    for (const it of ctx.world.interactables) {
      const d = Math.hypot(it.pos.x - p.x, it.pos.y - (p.y + 1), it.pos.z - p.z);
      if (d < it.r && d < bestD) {
        const label = typeof it.label === 'function' ? it.label() : it.label;
        if (!label) continue;
        best = it; bestD = d; bestLabel = label;
      }
    }
    // vehicles
    const veh = ctx.vehicles.nearestEnterable(p, 4.2);
    if (veh && bestD > 2) { best = { use: () => veh.enter(this) }; bestLabel = `Board ${veh.displayName}`; bestD = 2; }
    // NPCs to talk to
    if (!best) {
      const npc = ctx.npcs.nearestAlive(p, 2.7, n => n.role !== 'hostile');
      if (npc) {
        best = { use: () => { const line = ctx.npcs.talkTo(npc); ctx.hud.subtitle(line.speaker, line.text); } };
        bestLabel = 'Speak';
      }
    }
    ctx.hud.prompt(best ? bestLabel : null);
    if (best && ctx.input.pressed('KeyE')) best.use(ctx);
  }
}
