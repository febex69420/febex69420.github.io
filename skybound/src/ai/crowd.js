// crowd.js — population manager: spawns/recycles citizens around the player, runs their
// Action Trees at LOD, steers them (seek/flee/orbit/separate), renders them instanced, and
// orchestrates cheering, photos and gathering. Scales to a lively city around the hero.
import * as THREE from 'three';
import { NPC } from './npc.js';
import { RNG, clamp, clamp01, lerp } from '../core/util.js';
import { CELL, HALF, ROAD, GRID } from '../world/cityplan.js';

// Decaying danger sources (destruction / combat / emergencies) that NPCs flee from.
class DangerField {
  constructor() { this.items = []; }
  add(pos, radius, life = 6) { this.items.push({ x: pos.x, z: pos.z, r: radius, life, max: life }); }
  update(dt) { for (let i = this.items.length - 1; i >= 0; i--) { this.items[i].life -= dt; if (this.items[i].life <= 0) this.items.splice(i, 1); } }
  near(pos, r) { for (const d of this.items) { const dx = pos.x - d.x, dz = pos.z - d.z; if (dx * dx + dz * dz < (d.r + r) * (d.r + r)) return true; } return false; }
  fleeFrom(pos) {
    let bx = 0, bz = 0, best = Infinity;
    for (const d of this.items) { const dx = pos.x - d.x, dz = pos.z - d.z; const dd = dx * dx + dz * dz; if (dd < best) { best = dd; bx = dx; bz = dz; } }
    const l = Math.hypot(bx, bz) || 1;
    return { x: pos.x + (bx / l) * 40, z: pos.z + (bz / l) * 40 };
  }
}

function snapSidewalk(x, z) {
  // snap the nearer axis onto a road boundary so citizens walk along streets
  const bx = Math.round((x + HALF) / CELL) * CELL - HALF;
  const bz = Math.round((z + HALF) / CELL) * CELL - HALF;
  if (Math.abs(x - bx) < Math.abs(z - bz)) return { x: bx + (Math.random() - 0.5) * ROAD * 0.6, z };
  return { x, z: bz + (Math.random() - 0.5) * ROAD * 0.6 };
}

export class Crowd {
  constructor(scene, ctx) {
    this.scene = scene; this.ctx = ctx;
    this.rng = new RNG(4242);
    this.danger = new DangerField();
    const density = ctx.settings.get('npcDensity');
    this.max = clamp(Math.floor(190 * density), 40, 420);
    this.npcs = [];
    this.frame = 0;
    this.cheerTimer = 0;
    this.spawnRadius = 150; this.despawnRadius = 210;

    // instanced figure (body + head + stub arms), single draw
    const geo = buildFigure();
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: false }), this.max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = true; this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this._color = new THREE.Color();
    if (!this.mesh.instanceColor) this.mesh.setColorAt(0, new THREE.Color(0xffffff));

    // photo flash pool
    this.flashes = []; this.flashPool = [];
    this.flashTex = flashTexture();

    for (let i = 0; i < this.max; i++) this.npcs.push(this._makeNPC());

    // perception wiring
    this._sub = [];
    if (ctx.bus) {
      this._sub.push(ctx.bus.on('POWER_USED', (e) => this._dispatch(e.kind || 'power', e.pos, e.intensity || 1, e.kind)));
      this._sub.push(ctx.bus.on('DESTRUCTION', (e) => { this._dispatch('destruction', e.pos, e.intensity || 1); if (e.pos) this.danger.add(e.pos, 14, 5); }));
      this._sub.push(ctx.bus.on('RESCUE', (e) => this._dispatch('rescue', e.pos, e.intensity || 1.5)));
      this._sub.push(ctx.bus.on('COMBAT', (e) => { this._dispatch('combat', e.pos, e.intensity || 1); if (e.pos) this.danger.add(e.pos, 20, 4); }));
      this._sub.push(ctx.bus.on('EMERGENCY', (e) => { this._dispatch('emergency', e.pos, e.intensity || 1.5); if (e.pos) this.danger.add(e.pos, 30, 8); }));
    }
    this._m4 = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3();
    this._tmpColors = new Array(this.max);
  }

  _makeNPC() {
    const n = new NPC(new RNG(this.rng.int(1, 1e9)));
    this._respawn(n, true);
    return n;
  }
  _respawn(n, initial) {
    const hero = this.ctx.hero;
    const ang = this.rng.float(0, 6.28);
    const r = initial ? this.rng.float(10, this.spawnRadius) : this.rng.float(this.spawnRadius * 0.6, this.spawnRadius);
    let x = hero.pos.x + Math.cos(ang) * r, z = hero.pos.z + Math.sin(ang) * r;
    const sw = snapSidewalk(x, z); x = sw.x; z = sw.z;
    n.pos.x = clamp(x, -HALF + 4, HALF - 4); n.pos.z = clamp(z, -HALF + 4, HALF - 4); n.pos.y = 0;
    n.vel.x = 0; n.vel.z = 0;
    n.home = { x: n.pos.x, z: n.pos.z };
    n.goal = this._wanderGoal(n);
    n.emotion.fear = 0; n.emotion.surprise = 0; n.emotion.admiration = 0.3 + this.rng.float(0, 0.2);
  }
  _wanderGoal(n) {
    const ang = this.rng.float(0, 6.28); const d = this.rng.float(20, 60);
    const sw = snapSidewalk(n.pos.x + Math.cos(ang) * d, n.pos.z + Math.sin(ang) * d);
    return { x: clamp(sw.x, -HALF + 4, HALF - 4), z: clamp(sw.z, -HALF + 4, HALF - 4) };
  }

  _dispatch(kind, pos, intensity, sub) {
    if (!pos) return;
    const k = sub || kind;
    const r2 = 90 * 90;
    for (const n of this.npcs) {
      if (!n.active) continue;
      const dx = n.pos.x - pos.x, dz = n.pos.z - pos.z; const d2 = dx * dx + dz * dz;
      if (d2 < r2) n.perceive(k, Math.sqrt(d2), clamp(intensity, 0.2, 3));
    }
  }

  // ---- queries used by other systems ----
  nearbyPositions(pos, r) {
    const out = []; const r2 = r * r;
    for (const n of this.npcs) { if (!n.active) continue; const dx = n.pos.x - pos.x, dz = n.pos.z - pos.z; if (dx * dx + dz * dz < r2) out.push({ x: n.pos.x, y: 1.6, z: n.pos.z }); }
    return out;
  }
  get count() { let c = 0; for (const n of this.npcs) if (n.active) c++; return c; }
  cheeringCount() { let c = 0; const h = this.ctx.hero.pos; for (const n of this.npcs) { if (!n.active) continue; if ((n.state === 'adore' || n.state === 'gather')) { const dx = n.pos.x - h.x, dz = n.pos.z - h.z; if (dx * dx + dz * dz < 60 * 60) c++; } } return c; }

  update(dt, time) {
    this.frame++;
    this.danger.update(dt);
    const hero = this.ctx.hero;
    // flyby awe
    if (hero.flying && hero.speed > 30 && this.frame % 12 === 0) this._dispatch('flyby', hero.pos, clamp(hero.speed / 80, 0.4, 1.2));

    const treeCtx = { hero, danger: this.danger, time, crowd: this };
    let drawn = 0;
    const camLimit = this.spawnRadius;

    for (let i = 0; i < this.npcs.length; i++) {
      const n = this.npcs[i];
      const dx = n.pos.x - hero.pos.x, dz = n.pos.z - hero.pos.z;
      const dist = Math.hypot(dx, dz);
      n.active = dist < this.despawnRadius;
      if (dist > this.despawnRadius) { this._respawn(n, false); continue; }

      // LOD
      n.lod = dist < 55 ? 0 : dist < 110 ? 1 : 2;
      n.photoCd = Math.max(0, n.photoCd - dt);
      n.decayEmotions(dt);

      // tick action tree at LOD
      if (n.lod === 0 || (n.lod === 1 && (this.frame + i) % 5 === 0) || (n.lod === 2 && (this.frame + i) % 14 === 0)) {
        n.tree.tick(n, treeCtx);
      }

      this._steer(n, dt, treeCtx);

      // photo flash
      if (n.wantPhoto) { n.wantPhoto = false; this._spawnFlash(n); }

      // render (within spawn radius)
      if (dist < camLimit && drawn < this.max) {
        this._writeInstance(n, drawn, dt, time); drawn++;
      }
    }
    this.mesh.count = drawn;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

    // cheering audio swell
    this.cheerTimer -= dt;
    if (this.cheerTimer <= 0) {
      const c = this.cheeringCount();
      if (c > 6 && this.ctx.audio) { this.ctx.audio.cheer(clamp(c / 40, 0.2, 1)); this.cheerTimer = 2.2; }
      else this.cheerTimer = 1.0;
    }

    this._updateFlashes(dt);
  }

  _steer(n, dt, ctx) {
    const hero = ctx.hero;
    let dvx = 0, dvz = 0, speed = 1.4 * n.speedMul;
    const toHeroX = hero.pos.x - n.pos.x, toHeroZ = hero.pos.z - n.pos.z;
    const dHero = Math.hypot(toHeroX, toHeroZ) || 1;

    if (n.state === 'flee') {
      const g = n.goal || this.danger.fleeFrom(n.pos);
      dvx = g.x - n.pos.x; dvz = g.z - n.pos.z; speed = 6 * n.speedMul;
    } else if (n.state === 'adore') {
      // orbit hero at a respectful radius, facing in
      const desired = 9 + (n.id % 5);
      const radial = (dHero - desired);
      dvx = (toHeroX / dHero) * radial + (-toHeroZ / dHero) * 2;
      dvz = (toHeroZ / dHero) * radial + (toHeroX / dHero) * 2;
      speed = 2.2;
    } else if (n.state === 'gather') {
      dvx = toHeroX; dvz = toHeroZ; speed = 3.0 * n.speedMul;
    } else if (n.state === 'gawk') {
      dvx = dvz = 0; n.heading = Math.atan2(toHeroX, toHeroZ);
    } else {
      // routine: walk toward goal; repick when reached
      if (!n.goal || (Math.hypot(n.goal.x - n.pos.x, n.goal.z - n.pos.z) < 4)) n.goal = this._wanderGoal(n);
      dvx = n.goal.x - n.pos.x; dvz = n.goal.z - n.pos.z;
      speed = (n.role === 'jogger' ? 3.2 : 1.4) * n.speedMul;
    }

    // normalize desired
    const dl = Math.hypot(dvx, dvz);
    if (dl > 0.01) { dvx = (dvx / dl) * speed; dvz = (dvz / dl) * speed; }

    // separation (near LOD only, sampled)
    if (n.lod === 0) {
      let sx = 0, sz = 0;
      for (let j = 0; j < this.npcs.length; j += 7) {
        const o = this.npcs[(j + n.id) % this.npcs.length];
        if (o === n || !o.active) continue;
        const ox = n.pos.x - o.pos.x, oz = n.pos.z - o.pos.z; const od = ox * ox + oz * oz;
        if (od < 6.25 && od > 1e-4) { const inv = 1 / Math.sqrt(od); sx += ox * inv; sz += oz * inv; }
      }
      dvx += sx * 1.4; dvz += sz * 1.4;
    }

    // integrate
    n.vel.x = lerp(n.vel.x, dvx, clamp(dt * 6, 0, 1));
    n.vel.z = lerp(n.vel.z, dvz, clamp(dt * 6, 0, 1));
    n.pos.x = clamp(n.pos.x + n.vel.x * dt, -HALF + 3, HALF - 3);
    n.pos.z = clamp(n.pos.z + n.vel.z * dt, -HALF + 3, HALF - 3);
    const sp = Math.hypot(n.vel.x, n.vel.z);
    if (sp > 0.2 && n.state !== 'gawk' && n.state !== 'adore') n.heading = Math.atan2(n.vel.x, n.vel.z);
    else if (n.state === 'adore') n.heading = Math.atan2(toHeroX, toHeroZ);
    n.animPhase += dt * (4 + sp * 2);
  }

  _writeInstance(n, idx, dt, time) {
    const e = n.emotion;
    const cheer = (n.state === 'adore') ? Math.abs(Math.sin(n.animPhase * 2)) * 0.5 : 0;
    const walkBob = Math.abs(Math.sin(n.animPhase)) * clamp(Math.hypot(n.vel.x, n.vel.z) / 4, 0, 0.12);
    const cower = (n.state === 'flee' || e.fear > 0.5) ? 0.78 : 1;
    const y = n.pos.y + cheer;
    this._p.set(n.pos.x, y, n.pos.z);
    this._q.setFromAxisAngle(UP, n.heading);
    this._s.set(n.build, n.build * cower * (1 + walkBob), n.build);
    this._m4.compose(this._p, this._q, this._s);
    this.mesh.setMatrixAt(idx, this._m4);
    // color by mood: admiration -> warm, fear -> pale, base -> hue
    let l = n.shade;
    this._color.setHSL(n.hue / 360, e.fear > 0.5 ? 0.1 : 0.45, l);
    if (n.state === 'adore') this._color.lerp(WARM, 0.25);
    this.mesh.setColorAt(idx, this._color);
  }

  _spawnFlash(n) {
    let f = this.flashPool.pop();
    if (!f) { f = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flashTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); this.scene.add(f); }
    f.visible = true; f.position.set(n.pos.x, 2.2, n.pos.z); f.scale.setScalar(2.4);
    this.flashes.push({ f, life: 0.12 });
  }
  _updateFlashes(dt) {
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const it = this.flashes[i]; it.life -= dt; it.f.material.opacity = clamp(it.life / 0.12, 0, 1);
      if (it.life <= 0) { it.f.visible = false; this.flashPool.push(it.f); this.flashes.splice(i, 1); }
    }
  }
}

const UP = new THREE.Vector3(0, 1, 0);
const WARM = new THREE.Color(0xffd9a0);

function buildFigure() {
  // merged low-poly citizen: legs + torso + head + stub arms, base at y=0, ~1.8 tall
  const parts = [];
  const box = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); parts.push(g); };
  box(0.5, 0.9, 0.32, 0, 0.45, 0);      // legs/lower
  box(0.62, 0.7, 0.36, 0, 1.2, 0);      // torso
  box(0.16, 0.55, 0.16, -0.42, 1.25, 0); // arm L
  box(0.16, 0.55, 0.16, 0.42, 1.25, 0);  // arm R
  box(0.34, 0.34, 0.34, 0, 1.75, 0);     // head
  return mergeBufferGeometries(parts);
}

// Minimal geometry merge (positions+normals) to avoid an addon dependency.
function mergeBufferGeometries(geos) {
  let total = 0;
  for (const g of geos) { const ng = g.index ? g.toNonIndexed() : g; g._ni = ng; total += ng.attributes.position.count; }
  const pos = new Float32Array(total * 3); const nor = new Float32Array(total * 3);
  let o = 0;
  for (const g of geos) {
    const ng = g._ni; const p = ng.attributes.position.array; const nn = ng.attributes.normal.array;
    pos.set(p, o * 3); nor.set(nn, o * 3); o += ng.attributes.position.count; delete g._ni;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.computeBoundingSphere();
  return out;
}

function flashTexture() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(16, 16, 1, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c); return t;
}
