// Individual NPC: procedural low-poly humanoid + role-driven state machine.
// Roles: guard, soldier, officer, servant, advisor, official, citizen, hostile, escort.
import * as THREE from 'three';
import { clamp, lerp, damp, angleDamp, yawFromDir, dist2D } from '../core/utils.js';

// ---------- shared geometry ----------
const G = {
  head: new THREE.BoxGeometry(0.32, 0.34, 0.3),
  torso: new THREE.BoxGeometry(0.5, 0.66, 0.27),
  arm: new THREE.BoxGeometry(0.13, 0.6, 0.14),
  leg: new THREE.BoxGeometry(0.17, 0.8, 0.18),
  cap: new THREE.BoxGeometry(0.36, 0.12, 0.34),
  visor: new THREE.BoxGeometry(0.3, 0.05, 0.16),
  helmet: new THREE.SphereGeometry(0.21, 8, 5, 0, Math.PI * 2, 0, Math.PI / 1.9),
  band: new THREE.BoxGeometry(0.34, 0.09, 0.32),
  gunBody: new THREE.BoxGeometry(0.07, 0.12, 0.7),
  gunMag: new THREE.BoxGeometry(0.06, 0.18, 0.1),
};

let NPC_ID = 0;

export class NPC {
  constructor(ctx, role, x, z, opts = {}) {
    this.ctx = ctx;
    this.id = NPC_ID++;
    this.role = role;
    this.name = opts.name || 'Citizen';
    this.state = 'idle';
    this.stateTime = 0;
    this.yaw = opts.yaw ?? Math.random() * Math.PI * 2;
    this.walkPhase = Math.random() * 10;
    this.health = role === 'hostile' ? 60 : 80;
    this.alive = true;
    this.deadTime = 0;
    this.fearTime = 0;
    this.avoid = null;          // remembered danger position
    this.saluteCd = 0;
    this.talkTime = 0;
    this.investigate = null;
    this.route = opts.route || null;
    this.routeIdx = 0;
    this.loop = opts.loop !== false;
    this.post = opts.post || null;      // {x,z,yaw} static post
    this.seat = null;                    // ordered destination (meetings, lineups)
    this.wanderSpots = opts.wanderSpots || null;
    this.wanderTarget = null;
    this.armed = ['guard', 'soldier', 'hostile', 'escort'].includes(role);
    this.fireCd = 0;
    this.burstLeft = 0;
    this.target = null;
    this.formationIdx = 0;
    this.speedMul = opts.speedMul || 1;
    this.yield = 0;

    this._build(opts);
    // opts.y anchors interior spawns to their floor (else roofs would win)
    const refY = opts.y !== undefined ? opts.y + 1 : 500;
    const y = ctx.world.groundHeight(x, z, refY);
    this.group.position.set(x, y, z);
    this.home = new THREE.Vector3(x, y, z);
    this._stuck = 0;
  }

  get pos() { return this.group.position; }

  _build(opts) {
    const M = this.ctx.mats;
    const role = this.role;
    const skin = M.skin[this.id % M.skin.length];
    let body, legs, hat = null, hatMat = null, trim = null;
    switch (role) {
      case 'guard': body = M.uniformGuard; legs = M.uniformGuard; hat = 'cap'; hatMat = M.uniformGuard; trim = M.uniformGuardTrim; break;
      case 'soldier': case 'escort': body = M.uniformArmy; legs = M.uniformArmy; hat = 'helmet'; hatMat = M.camoDark; break;
      case 'officer': body = M.uniformOfficer; legs = M.uniformOfficer; hat = 'cap'; hatMat = M.uniformOfficer; trim = M.uniformGuardTrim; break;
      case 'servant': body = M.servant; legs = M.servantTrim; break;
      case 'advisor': case 'official': body = this.id % 2 ? M.suitDark : M.suitGray; legs = body; break;
      case 'hostile': body = M.hostile; legs = M.hostile; hat = 'band'; hatMat = M.hostileBand; break;
      default: body = M.civvies[this.id % M.civvies.length]; legs = M.civvies[(this.id + 3) % M.civvies.length];
    }
    const g = new THREE.Group();
    const mk = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      g.add(m);
      return m;
    };
    this.head = mk(G.head, skin, 0, 1.62, 0);
    this.torso = mk(G.torso, body, 0, 1.13, 0);
    if (trim) mk(new THREE.BoxGeometry(0.52, 0.1, 0.29), trim, 0, 1.36, 0);
    if (!hat) {
      const hair = mk(G.cap, M.hair[this.id % M.hair.length], 0, 1.8, -0.01);
      hair.scale.set(0.95, 0.8, 0.95);
    } else if (hat === 'cap') {
      mk(G.cap, hatMat, 0, 1.83, 0);
      mk(G.visor, hatMat, 0, 1.78, 0.2);
    } else if (hat === 'helmet') {
      mk(G.helmet, hatMat, 0, 1.68, 0);
    } else if (hat === 'band') {
      mk(G.band, hatMat, 0, 1.72, 0);
    }
    // limbs pivot at shoulder/hip
    const limb = (geo, mat, px, py, offY) => {
      const pivot = new THREE.Group();
      pivot.position.set(px, py, 0);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = offY;
      mesh.castShadow = true;
      pivot.add(mesh);
      g.add(pivot);
      return pivot;
    };
    this.armL = limb(G.arm, body, -0.33, 1.4, -0.24);
    this.armR = limb(G.arm, body, 0.33, 1.4, -0.24);
    this.legL = limb(G.leg, legs, -0.13, 0.8, -0.4);
    this.legR = limb(G.leg, legs, 0.13, 0.8, -0.4);
    if (this.armed) {
      const gun = new THREE.Group();
      const gb = new THREE.Mesh(G.gunBody, this.ctx.mats.gunmetal);
      const gm = new THREE.Mesh(G.gunMag, this.ctx.mats.gunmetal);
      gm.position.set(0, -0.12, 0.08);
      gun.add(gb, gm);
      gun.position.set(0.02, -0.5, 0.18);
      this.armR.add(gun);
      this.gun = gun;
    }
    this.group = g;
    this.ctx.scene.add(g);
  }

  setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.stateTime = 0;
  }

  // steer toward a point; returns remaining distance
  moveToward(tx, tz, dt, speed) {
    const p = this.pos;
    const dx = tx - p.x, dz = tz - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return 0;
    this.yaw = angleDamp(this.yaw, yawFromDir(dx / d, dz / d), 10, dt);
    const step = Math.min(speed * dt, d);
    let nx = p.x + (dx / d) * step;
    let nz = p.z + (dz / d) * step;
    const c = this.ctx.world.colliders.collideCircle(nx, nz, 0.33, p.y + 0.35, p.y + 1.5);
    nx = c.x; nz = c.z;
    const g = this.ctx.world.groundHeight(nx, nz, p.y, 0.65);
    if (g - p.y > 0.7 || p.y - g > 8) {
      // blocked by a ledge — slide along
      return d;
    }
    p.x = nx; p.z = nz;
    p.y = damp(p.y, g, 14, dt);
    this.walkPhase += step * 2.6;
    this._moving = speed;
    return d - step;
  }

  faceToward(tx, tz, dt) {
    const p = this.pos;
    this.yaw = angleDamp(this.yaw, yawFromDir(tx - p.x, tz - p.z), 8, dt);
  }

  damage(amount, from) {
    if (!this.alive) return;
    this.health -= amount;
    const ctx = this.ctx;
    if (this.health <= 0) {
      this.alive = false;
      this.setState('dead');
      ctx.events.emit('npc-killed', { npc: this });
      return;
    }
    if (this.role === 'hostile') {
      this.target = 'player';
    } else if (this.armed && from) {
      this.investigate = from.clone ? from.clone() : new THREE.Vector3(from.x, from.y, from.z);
      this.setState('investigate');
    } else {
      this.fearTime = 90;
      this.avoid = from ? new THREE.Vector3(from.x, from.y, from.z) : null;
      this.setState('flee');
    }
  }

  // fire a burst at a target position (world coords). Handles tracer/sound/damage.
  _shootAt(target, dt, accuracy = 0.05) {
    this.fireCd -= dt;
    if (this.fireCd > 0) return;
    if (this.burstLeft <= 0) {
      this.burstLeft = 2 + Math.floor(Math.random() * 3);
      this.fireCd = 0.6 + Math.random() * 0.8;
      return;
    }
    this.burstLeft--;
    this.fireCd = 0.11;
    const ctx = this.ctx;
    const p = this.pos;
    const origin = new THREE.Vector3(p.x, p.y + 1.35, p.z);
    const dir = new THREE.Vector3().subVectors(target, origin).normalize();
    dir.x += (Math.random() - 0.5) * accuracy * 2;
    dir.y += (Math.random() - 0.5) * accuracy;
    dir.z += (Math.random() - 0.5) * accuracy * 2;
    dir.normalize();
    const maxD = 160;
    const wallD = ctx.world.colliders.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, maxD);
    // does it hit the intended target?
    const toT = target.distanceTo(origin);
    ctx.effects.tracer(origin, dir, Math.min(wallD, maxD), 0xffd080);
    ctx.audio.shot('rifle', p.x, p.y, p.z);
    ctx.effects.muzzle(origin.x + dir.x, origin.y + dir.y * 0.5, origin.z + dir.z);
    if (toT < wallD && toT < maxD) {
      const miss = new THREE.Vector3().addScaledVector(dir, toT).add(origin).distanceTo(target);
      if (miss < 0.7) {
        if (this.target === 'player') {
          ctx.player.damage(6 + Math.random() * 6, origin);
        } else if (this.target && this.target.damage) {
          this.target.damage(12 + Math.random() * 10, p);
        }
      }
    }
    ctx.events.emit('noise', { x: p.x, z: p.z, severity: 1, kind: 'gunfire', source: this.role });
  }

  update(dt, ctx) {
    this.stateTime += dt;
    if (!this.alive) {
      this.deadTime += dt;
      const t = Math.min(1, this.deadTime * 2.2);
      this.group.rotation.x = -Math.PI / 2 * t;
      if (this.deadTime > 12) {
        this.pos.y -= dt * 0.25;
        if (this.deadTime > 16) this.group.visible = false;
      }
      return;
    }
    this.saluteCd -= dt;
    if (this.fearTime > 0) this.fearTime -= dt;
    if (this.yield > 0) this.yield -= dt;

    const player = ctx.player;
    const p = this.pos;
    const dPlayer = dist2D(p.x, p.z, player.position.x, player.position.z);

    // universal: militaristic salute to the Supreme Marshal
    if (this.saluteCd <= 0 && dPlayer < 5.5 && Math.abs(player.position.y - p.y) < 3 &&
        ['guard', 'soldier', 'officer', 'escort'].includes(this.role) &&
        !['engage', 'salute', 'flee', 'investigate'].includes(this.state) && !ctx.escort.owns(this)) {
      this.setState('salute');
    }

    switch (this.state) {
      case 'salute':
        this.faceToward(player.position.x, player.position.z, dt);
        if (this.stateTime > 2.2) {
          this.saluteCd = 25;
          this.setState(this.post ? 'post' : 'auto');
        }
        break;
      case 'flee': {
        const away = this.avoid || player.position;
        const dx = p.x - away.x, dz = p.z - away.z;
        const d = Math.hypot(dx, dz) || 1;
        this.moveToward(p.x + (dx / d) * 20, p.z + (dz / d) * 20, dt, 5.2);
        if (this.stateTime > 6) this.setState('auto');
        break;
      }
      case 'investigate': {
        if (!this.investigate) { this.setState('auto'); break; }
        const d = this.moveToward(this.investigate.x, this.investigate.z, dt, 4.6);
        if (d < 3) {
          this.faceToward(this.investigate.x + Math.sin(this.stateTime), this.investigate.z + Math.cos(this.stateTime), dt);
          if (this.stateTime > 8) { this.investigate = null; this.setState('auto'); }
        }
        break;
      }
      case 'engage': {
        const t = this.target;
        const tp = t === 'player' ? player.position : (t && t.alive ? t.pos : null);
        if (!tp || (t !== 'player' && !t.alive)) { this.target = null; this.setState('auto'); break; }
        const d = dist2D(p.x, p.z, tp.x, tp.z);
        this.faceToward(tp.x, tp.z, dt);
        if (d > 26) this.moveToward(tp.x, tp.z, dt, 5.6);
        else if (d < 12) {
          const dx = p.x - tp.x, dz = p.z - tp.z;
          this.moveToward(p.x + dx, p.z + dz, dt, 3);
        }
        this._shootAt(new THREE.Vector3(tp.x, tp.y + 1.2, tp.z), dt, this.role === 'hostile' ? 0.12 : 0.06);
        break;
      }
      case 'seat': {
        if (this.seat) {
          const d = this.moveToward(this.seat.x, this.seat.z, dt, 3.4);
          if (d < 0.4 && this.seat.yaw !== undefined) this.yaw = angleDamp(this.yaw, this.seat.yaw, 6, dt);
        }
        break;
      }
      case 'lineup': {
        if (this.seat) {
          const d = this.moveToward(this.seat.x, this.seat.z, dt, 4.6);
          if (d < 0.3) {
            this.yaw = angleDamp(this.yaw, this.seat.yaw ?? 0, 8, dt);
            if (dPlayer < 7 && this.saluteCd <= 0) { this.armR.rotation.x = -2.4; }
          }
        }
        break;
      }
      case 'dead': break;
      case 'post': {
        if (this.post) {
          const d = dist2D(p.x, p.z, this.post.x, this.post.z);
          if (d > 0.5) this.moveToward(this.post.x, this.post.z, dt, 3.2);
          else this.yaw = angleDamp(this.yaw, this.post.yaw, 4, dt);
        }
        break;
      }
      default:
        this._autoBehavior(dt, ctx, dPlayer);
    }

    this._animate(dt, ctx);
  }

  _autoBehavior(dt, ctx, dPlayer) {
    // default per-role life
    if (this.state === 'auto') this.setState(this.post ? 'post' : this.route ? 'patrol' : 'wander');
    if (this.yield > 0) {
      // step aside for the Marshal's escort
      const px = ctx.player.position.x, pz = ctx.player.position.z;
      const dx = this.pos.x - px, dz = this.pos.z - pz;
      const d = Math.hypot(dx, dz) || 1;
      if (d < 7) this.moveToward(this.pos.x + dx / d * 4, this.pos.z + dz / d * 4, dt, 3.4);
      return;
    }
    if (this.route) {
      // patrol along the route
      const wp = this.route[this.routeIdx];
      const speed = (this.fearTime > 0 ? 5 : 1.9) * this.speedMul * (ctx.government.alertLevel === 2 && this.armed ? 1.6 : 1);
      const before = this.pos.x + this.pos.z;
      const d = this.moveToward(wp.x, wp.z, dt, this.armed ? Math.max(speed, 2.6) : speed);
      if (d < 1.2) this.routeIdx = (this.routeIdx + 1) % this.route.length;
      // wall-stuck? skip to the next waypoint
      this._stuck = Math.abs(this.pos.x + this.pos.z - before) < 0.01 * dt * 60 ? this._stuck + dt : 0;
      if (this._stuck > 2.5) { this.routeIdx = (this.routeIdx + 1) % this.route.length; this._stuck = 0; }
    } else if (this.wanderSpots) {
      if (!this.wanderTarget || this.stateTime > 20) {
        this.wanderTarget = this.wanderSpots[Math.floor(Math.random() * this.wanderSpots.length)];
        this.stateTime = 0;
      }
      const before = this.pos.x + this.pos.z;
      const d = this.moveToward(this.wanderTarget.x, this.wanderTarget.z, dt, 1.6);
      if (d < 0.8 && this.stateTime < 14) { /* linger */ this._moving = 0; }
      else {
        this._stuck = Math.abs(this.pos.x + this.pos.z - before) < 0.01 * dt * 60 ? this._stuck + dt : 0;
        if (this._stuck > 2.5) { this.wanderTarget = null; this._stuck = 0; }
      }
    } else if (this.talkTime > 0) {
      this.talkTime -= dt;
      this.faceToward(ctx.player.position.x, ctx.player.position.z, dt);
    }
  }

  _animate(dt, ctx) {
    const speedF = clamp((this._moving || 0) / 4, 0, 1.4);
    const s = Math.sin(this.walkPhase);
    const idleBob = Math.sin(ctx.elapsed * 2 + this.id) * 0.03;
    if (this.state === 'salute') {
      this.armR.rotation.x = lerp(this.armR.rotation.x, -2.5, Math.min(1, dt * 10));
      this.armR.rotation.z = lerp(this.armR.rotation.z, -0.5, Math.min(1, dt * 10));
      this.armL.rotation.x = 0;
      this.legL.rotation.x = this.legR.rotation.x = 0;
    } else if (this.state === 'engage' || (this.armed && ctx.government.alertLevel === 2)) {
      this.armR.rotation.x = lerp(this.armR.rotation.x, -1.25, Math.min(1, dt * 8));
      this.armL.rotation.x = lerp(this.armL.rotation.x, -1.1, Math.min(1, dt * 8));
      this.armR.rotation.z = 0;
      this.legL.rotation.x = s * 0.5 * speedF;
      this.legR.rotation.x = -s * 0.5 * speedF;
    } else if (speedF > 0.02) {
      this.legL.rotation.x = s * 0.55 * speedF;
      this.legR.rotation.x = -s * 0.55 * speedF;
      this.armL.rotation.x = -s * 0.4 * speedF;
      this.armR.rotation.x = this.armed ? -0.5 : s * 0.4 * speedF;
      this.armR.rotation.z = 0;
    } else {
      this.legL.rotation.x = lerp(this.legL.rotation.x, 0, dt * 6);
      this.legR.rotation.x = lerp(this.legR.rotation.x, 0, dt * 6);
      this.armL.rotation.x = lerp(this.armL.rotation.x, idleBob, dt * 6);
      this.armR.rotation.x = lerp(this.armR.rotation.x, this.armed ? -0.5 : idleBob, dt * 6);
      this.armR.rotation.z = lerp(this.armR.rotation.z, 0, dt * 6);
    }
    this.group.rotation.y = this.yaw;
    this._moving = 0;   // consumed; externally-driven movement (escort) re-sets it
  }

  dispose() {
    this.ctx.scene.remove(this.group);
  }
}
