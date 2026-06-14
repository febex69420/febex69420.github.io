// combat.js — original enemies with Action Trees, physics-integrated bodies (so slams,
// shockwaves and throws launch them through the world), ragdoll-on-defeat, and the player's
// melee / area / projectile damage resolution + lock-on. All enemy designs are original.
import * as THREE from 'three';
import { Body } from './physics/physics.js';
import { RNG, clamp } from './core/util.js';
import { BehaviorTree, sel, seq, cond, act, cooldown, SUCCESS, FAILURE, RUNNING } from './ai/behavior_tree.js';

// Original enemy archetypes (no franchise references).
const TYPES = {
  drone:    { hp: 60, speed: 16, range: 14, dmg: 6, color: 0x33ddcc, size: 1.1, fly: true, ranged: true },
  thug:     { hp: 120, speed: 9, range: 3, dmg: 12, color: 0x9a3b3b, size: 1.4, fly: false },
  enforcer: { hp: 320, speed: 6, range: 3.5, dmg: 22, color: 0x6a4a8a, size: 1.9, fly: false },
  brute:    { hp: 800, speed: 4.5, range: 4.5, dmg: 40, color: 0x444a55, size: 2.8, fly: false },
};

let _eid = 0;
class Enemy {
  constructor(type, pos, ctx) {
    this.id = _eid++; this.ctx = ctx; this.type = type;
    const t = TYPES[type]; this.def = t;
    this.maxHp = t.hp; this.hp = t.hp;
    this.dead = false; this.deadTimer = 0; this.frozen = 0; this.attackCd = 0;
    this.rng = new RNG(this.id + 99);
    this.bb = this;

    const mat = new THREE.MeshStandardMaterial({ color: t.color, roughness: 0.5, metalness: 0.4, emissive: new THREE.Color(t.color).multiplyScalar(0.15), emissiveIntensity: 0.6 });
    let geo;
    if (t.fly) { geo = new THREE.IcosahedronGeometry(t.size * 0.7, 0); }
    else { geo = buildEnemyFigure(t.size); }
    this.mesh = new THREE.Mesh(geo, mat); this.mesh.castShadow = true;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(t.size * 0.18, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3333 }));
    eye.position.set(0, t.fly ? 0 : t.size * 1.4, t.size * 0.35); this.mesh.add(eye);
    ctx.scene.add(this.mesh);

    this.body = new Body({
      pos: pos.clone(), half: new THREE.Vector3(t.size * 0.5, t.size, t.size * 0.5),
      mass: t.hp * 0.3, mesh: this.mesh, restitution: 0.2, friction: 0.7, kind: 'enemy',
      gravityScale: t.fly ? 0 : 1, onRemove: () => { ctx.scene.remove(this.mesh); geo.dispose(); },
    });
    ctx.physics.add(this.body);
    this.tree = ENEMY_TREE;
  }
  dist2(p) { const dx = this.body.pos.x - p.x, dy = this.body.pos.y - p.y, dz = this.body.pos.z - p.z; return dx * dx + dy * dy + dz * dz; }
  freeze(s) { this.frozen = Math.max(this.frozen, s); }
  knockback(v) { this.body.collide = true; this.body.vel.add(v); this.body.wake(); }
  hurt(dmg, vel) {
    if (this.dead) return;
    this.hp -= dmg;
    this.ctx.particles.spark(this.body.pos.clone().setY(this.body.pos.y + this.def.size), null, 6, 12, 0xff6644);
    if (vel) this.knockback(vel.clone().normalize().multiplyScalar(clamp(dmg * 0.3, 4, 60)).setY(6));
    if (this.hp <= 0) this.die();
  }
  die() {
    if (this.dead) return; this.dead = true; this.deadTimer = 4;
    this.body.gravityScale = 1; this.body.collide = true; this.body.kind = 'debris';
    this.body.omega.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
    this.ctx.particles.spark(this.body.pos.clone(), null, 20, 18, this.def.color);
    this.ctx.particles.smoke(this.body.pos.clone(), 6, 0x222222, 3);
    if (this.ctx.bus) this.ctx.bus.emit('COMBAT', { pos: this.body.pos.clone(), intensity: 1.2, defeated: true });
    if (this.ctx.audio) this.ctx.audio.impact(1);
  }
}

// Enemy Action Tree (approach / attack / retreat).
function heroPos(ctx) { return ctx.hero.pos; }
const ENEMY_TREE = new BehaviorTree(sel(
  // retreat when badly hurt
  seq(
    cond((bb) => bb.hp < bb.maxHp * 0.25),
    act((bb, ctx) => { steer(bb, ctx, -1, bb.def.speed * 0.8, ctx.dt); return RUNNING; }),
  ),
  // attack when in range
  seq(
    cond((bb, ctx) => bb.dist2(heroPos(ctx)) < bb.def.range * bb.def.range),
    cooldown(1.1, act((bb, ctx) => { attack(bb, ctx); return SUCCESS; })),
  ),
  // approach
  act((bb, ctx) => { steer(bb, ctx, 1, bb.def.speed, ctx.dt); return RUNNING; }),
));

function steer(bb, ctx, sign, speed, dt) {
  if (bb.dead || bb.frozen > 0) { bb.body.vel.x *= 0.9; bb.body.vel.z *= 0.9; return; }
  const hp = ctx.hero.pos; const b = bb.body.pos;
  const dx = (hp.x - b.x) * sign, dz = (hp.z - b.z) * sign;
  const l = Math.hypot(dx, dz) || 1;
  bb.body.vel.x = (dx / l) * speed; bb.body.vel.z = (dz / l) * speed;
  if (bb.def.fly) { const dy = (hp.y + 2 - b.y); bb.body.vel.y = clamp(dy, -speed, speed); }
  bb.mesh.rotation.y = Math.atan2(hp.x - b.x, hp.z - b.z);
}
function attack(bb, ctx) {
  if (bb.dead || bb.frozen > 0) return;
  if (bb.def.ranged) {
    ctx.particles.energy(bb.body.pos.clone(), new THREE.Vector3().subVectors(ctx.hero.pos, bb.body.pos).normalize(), 6, 0xff5544, 30);
  } else { ctx.particles.spark(ctx.hero.pos.clone().setY(ctx.hero.pos.y + 1.5), null, 6, 10, 0xff5544); }
  ctx.hero.takeDamage(bb.def.dmg);
  if (ctx.audio) ctx.audio.impact(0.4);
}

function buildEnemyFigure(s) {
  const parts = [];
  const box = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); parts.push(g); };
  box(s * 0.7, s, s * 0.5, 0, s * 0.5, 0);
  box(s * 0.95, s * 0.9, s * 0.6, 0, s * 1.3, 0);
  box(s * 0.55, s * 0.55, s * 0.55, 0, s * 1.95, 0);
  box(s * 0.25, s * 0.8, s * 0.25, -s * 0.6, s * 1.3, 0);
  box(s * 0.25, s * 0.8, s * 0.25, s * 0.6, s * 1.3, 0);
  const nis = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  let total = 0; for (const g of nis) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3); let o = 0;
  for (const g of nis) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.computeBoundingSphere(); return out;
}

export class Combat {
  constructor(ctx) {
    this.ctx = ctx; this.enemies = [];
    this.lockTarget = null;
    this.kills = 0;
  }
  spawn(type, pos) { const e = new Enemy(type, pos, this.ctx); this.enemies.push(e); return e; }
  spawnWave(count, center, types) {
    const r = 30; const out = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const p = new THREE.Vector3(center.x + Math.cos(a) * r, center.y + 2, center.z + Math.sin(a) * r);
      out.push(this.spawn(types ? types[i % types.length] : 'thug', p));
    }
    return out;
  }

  meleeStrike(origin, dir, range, dmg, launcher) {
    let hit = false;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const to = new THREE.Vector3().subVectors(e.body.pos, origin);
      if (to.length() < range + e.def.size && to.normalize().dot(dir) > 0.2) {
        const v = dir.clone().multiplyScalar(launcher ? 70 : 26); if (launcher) v.y += 30;
        e.hurt(dmg, v); hit = true;
      }
    }
    return hit;
  }
  areaDamage(center, radius, dmg, dir) {
    let hit = false;
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (e.dist2(center) < radius * radius) {
        const kb = dir ? dir.clone() : new THREE.Vector3().subVectors(e.body.pos, center).normalize();
        e.hurt(dmg, kb.multiplyScalar(1)); hit = true;
      }
    }
    return hit;
  }
  areaEffect(center, radius, fn) { for (const e of this.enemies) { if (!e.dead && e.dist2(center) < radius * radius) fn(e); } }
  projectileHit(pos, radius, dmg, vel) {
    for (const e of this.enemies) { if (!e.dead && e.dist2(pos) < radius * radius) { e.hurt(dmg, vel); return true; } }
    return false;
  }
  enemyPositions() { return this.enemies.filter((e) => !e.dead).map((e) => ({ x: e.body.pos.x, y: e.body.pos.y, z: e.body.pos.z })); }
  get activeCount() { return this.enemies.reduce((a, e) => a + (e.dead ? 0 : 1), 0); }

  update(dt) {
    const input = this.ctx.input;
    if (input && input.pressed('lockon')) this._cycleLock();
    const ctx = { hero: this.ctx.hero, dt, time: this.ctx.time, particles: this.ctx.particles, audio: this.ctx.audio };
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.frozen > 0) { e.frozen -= dt; e.mesh.material.emissive.setHex(0x66ccff); }
      else e.mesh.material.emissive.setHex(new THREE.Color(e.def.color).multiplyScalar(0.15).getHex());
      if (e.dead) {
        e.deadTimer -= dt;
        if (e.deadTimer <= 0) { this.kills++; this.ctx.physics.remove(e.body); this.enemies.splice(i, 1); if (this.lockTarget === e) this.lockTarget = null; if (this.ctx.bus) this.ctx.bus.emit('RESCUE', { pos: e.body.pos.clone(), intensity: 0.6 }); }
        continue;
      }
      e.tree.tick(e, ctx);
      // launched-into-environment impact
      const sp = e.body.vel.length();
      if (sp > 40) { const cols = this.ctx.city.staticCollidersNear(e.body.pos.x, e.body.pos.z, 4); for (const c of cols) { if (!c.removed && inside(e.body.pos, c)) { e.hurt(sp * 0.5, e.body.vel.clone().negate()); this.ctx.destruction.spawnDebris(e.body.pos.clone(), { count: 6, color: 0x999999 }); break; } } }
    }
    // lock target validity
    if (this.lockTarget && (this.lockTarget.dead || this.lockTarget.dist2(this.ctx.hero.pos) > 120 * 120)) this.lockTarget = null;
  }

  _cycleLock() {
    const hero = this.ctx.hero;
    let best = null, bd = Infinity;
    for (const e of this.enemies) {
      if (e.dead || e === this.lockTarget) continue;
      const to = new THREE.Vector3().subVectors(e.body.pos, hero.pos);
      const d = to.length(); if (d > 120) continue;
      const align = to.normalize().dot(hero.aimDir);
      const score = d * (1.4 - align);
      if (score < bd) { bd = score; best = e; }
    }
    this.lockTarget = best || (this.enemies.find((e) => !e.dead) || null);
    if (this.ctx.audio && this.lockTarget) this.ctx.audio.ui();
  }
  getLock() { return this.lockTarget ? this.lockTarget.body.pos : null; }

  clear() { for (const e of this.enemies) this.ctx.physics.remove(e.body); this.enemies.length = 0; this.lockTarget = null; }
}

function inside(p, c) { return p.x > c.min.x && p.x < c.max.x && p.y > c.min.y && p.y < c.max.y && p.z > c.min.z && p.z < c.max.z; }
