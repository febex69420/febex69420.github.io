// entities.js — entity manager: mobs + AI, item drops, arrows, primed TNT,
// particles, natural spawning, spawner blocks.
import * as THREE from 'three';
import { CH, moveEntity, dist2, mulberry32 } from './util.js';
import { B, BLOCKS, ITEMS, ATLAS_TILES, getAtlasCanvas, getIconSheet, ICON_COLS, ICON_PX, getDrops } from './blocks.js';

// ---------- mob definitions -------------------------------------------------
// model parts: [sx,sy,sz, px,py,pz, color, tag]
export const MOBS = {
  pig: {
    hp: 10, w: 0.45, h: 0.9, speed: 1.2, passive: true, sound: 'pig',
    drops: [{ id: 297, count: [1, 3] }],
    parts: [
      [0.9, 0.55, 0.6, 0, 0.55, 0, '#f0a0a8', 'body'],
      [0.45, 0.45, 0.45, 0, 0.75, 0.55, '#f0a0a8', 'head'],
      [0.2, 0.12, 0.06, 0, 0.68, 0.79, '#e58890', 'snout'],
      [0.2, 0.35, 0.2, -0.25, 0.18, 0.2, '#e58890', 'legFL'],
      [0.2, 0.35, 0.2, 0.25, 0.18, 0.2, '#e58890', 'legFR'],
      [0.2, 0.35, 0.2, -0.25, 0.18, -0.2, '#e58890', 'legBL'],
      [0.2, 0.35, 0.2, 0.25, 0.18, -0.2, '#e58890', 'legBR'],
    ],
  },
  cow: {
    hp: 10, w: 0.45, h: 1.3, speed: 1.0, passive: true, sound: 'cow',
    drops: [{ id: 299, count: [1, 3] }, { id: 303, count: [0, 2] }],
    parts: [
      [0.9, 0.65, 0.7, 0, 0.95, 0, '#43332a', 'body'],
      [0.45, 0.45, 0.4, 0, 1.2, 0.6, '#43332a', 'head'],
      [0.3, 0.15, 0.05, 0, 1.1, 0.82, '#d8cfc4', 'snout'],
      [0.22, 0.6, 0.22, -0.25, 0.3, 0.25, '#594439', 'legFL'],
      [0.22, 0.6, 0.22, 0.25, 0.3, 0.25, '#594439', 'legFR'],
      [0.22, 0.6, 0.22, -0.25, 0.3, -0.25, '#594439', 'legBL'],
      [0.22, 0.6, 0.22, 0.25, 0.3, -0.25, '#594439', 'legBR'],
    ],
  },
  sheep: {
    hp: 8, w: 0.45, h: 1.2, speed: 1.1, passive: true, sound: 'sheep',
    drops: [{ id: 28, count: [1, 1] }, { id: 309, count: [1, 2] }],
    parts: [
      [0.8, 0.65, 0.7, 0, 0.9, 0, '#e8e8e8', 'body'],
      [0.35, 0.35, 0.35, 0, 1.15, 0.55, '#d8c0a8', 'head'],
      [0.2, 0.55, 0.2, -0.22, 0.28, 0.22, '#d8c0a8', 'legFL'],
      [0.2, 0.55, 0.2, 0.22, 0.28, 0.22, '#d8c0a8', 'legFR'],
      [0.2, 0.55, 0.2, -0.22, 0.28, -0.22, '#d8c0a8', 'legBL'],
      [0.2, 0.55, 0.2, 0.22, 0.28, -0.22, '#d8c0a8', 'legBR'],
    ],
  },
  chicken: {
    hp: 4, w: 0.3, h: 0.7, speed: 1.0, passive: true, sound: 'chicken', slowFall: true,
    drops: [{ id: 301, count: [1, 1] }, { id: 291, count: [0, 2] }],
    parts: [
      [0.4, 0.4, 0.5, 0, 0.45, 0, '#f0f0f0', 'body'],
      [0.25, 0.3, 0.25, 0, 0.8, 0.25, '#f0f0f0', 'head'],
      [0.1, 0.08, 0.15, 0, 0.75, 0.42, '#e8a020', 'snout'],
      [0.1, 0.25, 0.1, -0.1, 0.13, 0, '#e8a020', 'legFL'],
      [0.1, 0.25, 0.1, 0.1, 0.13, 0, '#e8a020', 'legFR'],
    ],
  },
  villager: {
    hp: 20, w: 0.35, h: 1.9, speed: 0.9, passive: true, sound: 'villager', persist: true,
    drops: [],
    parts: [
      [0.5, 0.7, 0.3, 0, 1.05, 0, '#7a5a3a', 'body'],
      [0.4, 0.45, 0.4, 0, 1.65, 0, '#c8a080', 'head'],
      [0.12, 0.25, 0.12, 0, 1.5, 0.2, '#c8a080', 'snout'],
      [0.2, 0.7, 0.25, -0.14, 0.35, 0, '#5a4429', 'legFL'],
      [0.2, 0.7, 0.25, 0.14, 0.35, 0, '#5a4429', 'legFR'],
    ],
  },
  zombie: {
    hp: 20, w: 0.35, h: 1.9, speed: 1.6, hostile: true, dmg: 3, sound: 'zombie', burns: true,
    drops: [{ id: 305, count: [0, 2] }],
    parts: [
      [0.5, 0.7, 0.3, 0, 1.05, 0, '#2e7a4a', 'body'],
      [0.4, 0.4, 0.4, 0, 1.6, 0, '#3e9a5c', 'head'],
      [0.16, 0.6, 0.16, -0.33, 1.3, 0.25, '#2e7a4a', 'armL'],
      [0.16, 0.6, 0.16, 0.33, 1.3, 0.25, '#2e7a4a', 'armR'],
      [0.2, 0.7, 0.2, -0.13, 0.35, 0, '#1e5a35', 'legFL'],
      [0.2, 0.7, 0.2, 0.13, 0.35, 0, '#1e5a35', 'legFR'],
    ],
  },
  skeleton: {
    hp: 20, w: 0.35, h: 1.9, speed: 1.5, hostile: true, dmg: 2, sound: 'skeleton', burns: true, ranged: true,
    drops: [{ id: 304, count: [0, 2] }, { id: 289, count: [0, 2] }],
    parts: [
      [0.4, 0.7, 0.22, 0, 1.05, 0, '#d8d8d0', 'body'],
      [0.4, 0.4, 0.4, 0, 1.6, 0, '#e8e8e0', 'head'],
      [0.12, 0.55, 0.12, -0.28, 1.3, 0.2, '#d8d8d0', 'armL'],
      [0.12, 0.55, 0.12, 0.28, 1.3, 0.2, '#d8d8d0', 'armR'],
      [0.14, 0.7, 0.14, -0.12, 0.35, 0, '#c8c8c0', 'legFL'],
      [0.14, 0.7, 0.14, 0.12, 0.35, 0, '#c8c8c0', 'legFR'],
    ],
  },
  spider: {
    hp: 16, w: 0.6, h: 0.9, speed: 1.9, hostile: true, dmg: 2, sound: 'spider', climbs: true, nightOnly: true,
    drops: [{ id: 290, count: [0, 2] }],
    parts: [
      [1.0, 0.45, 1.0, 0, 0.45, -0.2, '#2a2228', 'body'],
      [0.55, 0.45, 0.55, 0, 0.45, 0.5, '#352c33', 'head'],
      [0.08, 0.08, 0.08, -0.12, 0.55, 0.78, '#c03030', 'eyeL'],
      [0.08, 0.08, 0.08, 0.12, 0.55, 0.78, '#c03030', 'eyeR'],
      [0.9, 0.08, 0.08, -0.8, 0.4, 0.2, '#2a2228', 'legFL'],
      [0.9, 0.08, 0.08, 0.8, 0.4, 0.2, '#2a2228', 'legFR'],
      [0.9, 0.08, 0.08, -0.8, 0.4, -0.25, '#2a2228', 'legBL'],
      [0.9, 0.08, 0.08, 0.8, 0.4, -0.25, '#2a2228', 'legBR'],
    ],
  },
  creeper: {
    hp: 20, w: 0.35, h: 1.7, speed: 1.4, hostile: true, sound: 'creeper', exploder: true,
    drops: [{ id: 292, count: [0, 2] }],
    parts: [
      [0.45, 0.85, 0.3, 0, 0.95, 0, '#4cae4f', 'body'],
      [0.45, 0.45, 0.45, 0, 1.6, 0, '#58c25b', 'head'],
      [0.22, 0.45, 0.22, -0.13, 0.22, 0.15, '#3e9a41', 'legFL'],
      [0.22, 0.45, 0.22, 0.13, 0.22, 0.15, '#3e9a41', 'legFR'],
      [0.22, 0.45, 0.22, -0.13, 0.22, -0.15, '#3e9a41', 'legBL'],
      [0.22, 0.45, 0.22, 0.13, 0.22, -0.15, '#3e9a41', 'legBR'],
    ],
  },
};

const boxGeoCache = new Map();
function boxGeo(sx, sy, sz) {
  const k = sx + ',' + sy + ',' + sz;
  let g = boxGeoCache.get(k);
  if (!g) { g = new THREE.BoxGeometry(sx, sy, sz); boxGeoCache.set(k, g); }
  return g;
}

// average tile color for particles
const tileColorCache = new Map();
function tileColor(tile) {
  let c = tileColorCache.get(tile);
  if (c) return c;
  const atlas = getAtlasCanvas();
  const ctx = atlas.getContext('2d');
  const sx = (tile % ATLAS_TILES) * 16, sy = ((tile / ATLAS_TILES) | 0) * 16;
  const data = ctx.getImageData(sx, sy, 16, 16).data;
  let r = 0, g = 0, b2 = 0, n = 0;
  for (let i = 0; i < data.length; i += 16) {
    if (data[i + 3] < 100) continue;
    r += data[i]; g += data[i + 1]; b2 += data[i + 2]; n++;
  }
  n = Math.max(1, n);
  c = new THREE.Color(r / n / 255, g / n / 255, b2 / n / 255);
  tileColorCache.set(tile, c);
  return c;
}

const itemSpriteCache = new Map();
function itemSpriteMaterial(itemId) {
  let m = itemSpriteCache.get(itemId);
  if (m) return m;
  const sheet = getIconSheet();
  const cv = document.createElement('canvas');
  cv.width = 16; cv.height = 16;
  const ctx = cv.getContext('2d');
  ctx.drawImage(sheet, (itemId % ICON_COLS) * ICON_PX, ((itemId / ICON_COLS) | 0) * ICON_PX, 16, 16, 0, 0, 16, 16);
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
  m = new THREE.SpriteMaterial({ map: tex, transparent: true });
  itemSpriteCache.set(itemId, m);
  return m;
}

let nextEid = 1;

class Entity {
  constructor(mgr, type, world, x, y, z) {
    this.mgr = mgr;
    this.id = nextEid++;
    this.type = type;
    this.world = world;
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3(0, 0, 0);
    this.yaw = Math.random() * Math.PI * 2;
    this.w = 0.3; this.h = 0.9;
    this.dead = false;
    this.age = 0;
    this.onGround = false;
    this.obj = null;
  }
  remove() {
    this.dead = true;
    if (this.obj) this.mgr.game.scene.remove(this.obj);
  }
  brightness() {
    const w = this.world;
    const x = Math.floor(this.pos.x), y = Math.floor(this.pos.y + this.h * 0.5), z = Math.floor(this.pos.z);
    const raw = w.getLightRaw(x, y, z);
    const day = this.mgr.game.daylight ?? 1;
    const l = Math.max((raw >> 4) / 15 * day, (raw & 15) / 15);
    return Math.max(0.08, Math.pow(l, 1.4));
  }
}

class Mob extends Entity {
  constructor(mgr, type, world, x, y, z) {
    super(mgr, type, world, x, y, z);
    const def = MOBS[type];
    this.def = def;
    this.hp = def.hp;
    this.w = def.w; this.h = def.h;
    this.state = 'wander';
    this.target = null;
    this.wanderT = 0;
    this.attackCd = 0;
    this.fleeT = 0;
    this.fuse = -1;
    this.burnT = 0;
    this.hurtFlash = 0;
    this.walkPhase = 0;
    this.soundCd = 4 + Math.random() * 8;
    this.buildModel();
  }

  buildModel() {
    const g = new THREE.Group();
    this.mats = [];
    this.legParts = [];
    this.headPart = null;
    for (const [sx, sy, sz, px, py, pz, color, tag] of this.def.parts) {
      const mat = new THREE.MeshBasicMaterial({ color });
      mat.baseColor = new THREE.Color(color);
      const mesh = new THREE.Mesh(boxGeo(sx, sy, sz), mat);
      mesh.position.set(px, py, pz);
      this.mats.push(mat);
      if (tag.startsWith('leg')) this.legParts.push(mesh);
      if (tag === 'head' || tag === 'snout' || tag.startsWith('eye')) {
        if (!this.headGroup) { this.headGroup = new THREE.Group(); g.add(this.headGroup); }
        this.headGroup.add(mesh);
        continue;
      }
      g.add(mesh);
    }
    this.obj = g;
    this.mgr.game.scene.add(g);
  }

  hurt(dmg, kb) {
    if (this.dead) return;
    this.hp -= dmg;
    this.hurtFlash = 0.35;
    this.mgr.game.audio?.play(this.def.sound + '_hurt', { pos: this.pos, fallback: 'hurt' });
    if (kb) { this.vel.x += kb.x; this.vel.y += 4.5; this.vel.z += kb.z; }
    if (this.def.passive) { this.state = 'flee'; this.fleeT = 4; }
    else { this.state = 'chase'; }
    if (this.hp <= 0) this.die();
  }

  die() {
    const rng = Math.random;
    for (const d of this.def.drops) {
      const n = d.count[0] + ((rng() * (d.count[1] - d.count[0] + 1)) | 0);
      for (let i = 0; i < n; i++)
        this.mgr.dropItem(this.world, this.pos.x, this.pos.y + 0.5, this.pos.z, { id: d.id, count: 1 });
    }
    this.mgr.game.audio?.play(this.def.sound + '_death', { pos: this.pos, fallback: 'hurt' });
    this.mgr.particleBurst(this.world, this.pos.x, this.pos.y + this.h / 2, this.pos.z, new THREE.Color('#a04040'), 10);
    this.remove();
  }

  update(dt) {
    const game = this.mgr.game;
    const player = game.player;
    this.age += dt;
    this.attackCd -= dt;
    this.soundCd -= dt;
    if (this.hurtFlash > 0) this.hurtFlash -= dt;

    // ambient voice
    if (this.soundCd <= 0 && game.world === this.world) {
      this.soundCd = 6 + Math.random() * 14;
      if (dist2(this.pos.x, this.pos.y, this.pos.z, player.pos.x, player.pos.y, player.pos.z) < 400)
        game.audio?.play(this.def.sound, { pos: this.pos });
    }

    const distP = Math.sqrt(dist2(this.pos.x, this.pos.y, this.pos.z, player.pos.x, player.pos.y, player.pos.z));
    const sameWorld = game.world === this.world;

    // --- AI state ---
    if (this.def.hostile && sameWorld && !player.dead && player.gamemode === 0) {
      if (distP < 20 && this.state !== 'chase') this.state = 'chase';
      if (distP > 28 && this.state === 'chase') this.state = 'wander';
    }
    if (this.state === 'flee') {
      this.fleeT -= dt;
      if (this.fleeT <= 0) this.state = 'wander';
    }

    let moveX = 0, moveZ = 0, wantSpeed = 0;
    if (this.state === 'wander') {
      this.wanderT -= dt;
      if (this.wanderT <= 0) {
        this.wanderT = 2 + Math.random() * 5;
        this.target = Math.random() < 0.6
          ? { x: this.pos.x + (Math.random() - 0.5) * 14, z: this.pos.z + (Math.random() - 0.5) * 14 }
          : null;
      }
      if (this.target) {
        moveX = this.target.x - this.pos.x; moveZ = this.target.z - this.pos.z;
        if (moveX * moveX + moveZ * moveZ < 1) this.target = null;
        wantSpeed = this.def.speed * 0.5;
      }
    } else if (this.state === 'chase' && sameWorld) {
      moveX = player.pos.x - this.pos.x; moveZ = player.pos.z - this.pos.z;
      wantSpeed = this.def.speed;
      if (this.def.ranged) {
        if (distP < 7) { moveX = -moveX; moveZ = -moveZ; } // kite
        else if (distP < 16 && this.attackCd <= 0) {
          this.attackCd = 2;
          const dir = new THREE.Vector3(player.pos.x - this.pos.x, (player.pos.y + 1.2) - (this.pos.y + 1.5), player.pos.z - this.pos.z).normalize();
          this.mgr.shootArrow(this.world, this.pos.x, this.pos.y + 1.5, this.pos.z, dir, 18, false, 3);
          game.audio?.play('bow', { pos: this.pos });
        }
        if (distP >= 7 && distP < 14) wantSpeed = 0;
      } else if (this.def.exploder) {
        if (distP < 3) {
          if (this.fuse < 0) { this.fuse = 1.5; game.audio?.play('fuse', { pos: this.pos }); }
        } else if (distP > 6 && this.fuse >= 0) this.fuse = -1;
        if (this.fuse >= 0) {
          this.fuse -= dt;
          wantSpeed = 0;
          if (this.fuse <= 0) {
            this.mgr.explode(this.world, this.pos.x, this.pos.y + 0.5, this.pos.z, 3);
            this.remove();
            return;
          }
        }
      } else if (distP < 1.8 && this.attackCd <= 0) {
        this.attackCd = 1.2;
        const kb = new THREE.Vector3(player.pos.x - this.pos.x, 0, player.pos.z - this.pos.z).normalize().multiplyScalar(6);
        player.damage(this.def.dmg, 'mob', kb);
      }
    } else if (this.state === 'flee' && sameWorld) {
      moveX = this.pos.x - player.pos.x; moveZ = this.pos.z - player.pos.z;
      wantSpeed = this.def.speed * 1.3;
    }

    // --- locomotion ---
    const mlen = Math.hypot(moveX, moveZ);
    if (mlen > 0.01 && wantSpeed > 0) {
      this.yaw = Math.atan2(moveX, moveZ);
      this.vel.x = (moveX / mlen) * wantSpeed;
      this.vel.z = (moveZ / mlen) * wantSpeed;
      this.walkPhase += dt * 8;
    } else {
      this.vel.x *= 0.6; this.vel.z *= 0.6;
    }
    this.vel.y -= 22 * dt;
    if (this.def.slowFall && this.vel.y < -2) this.vel.y = -2;

    const res = moveEntity(this.world, this, dt);
    this.onGround = res.onGround;
    if (res.inWater) { this.vel.y = Math.max(this.vel.y, 1.5); }
    if (res.inLava) { this.burnT = 3; this.hurt(2, null); }
    if (res.hitWall && this.onGround && mlen > 0.01) this.vel.y = 8; // jump
    if (this.def.climbs && res.hitWall) this.vel.y = 3;
    if (this.pos.y < -10) { this.remove(); return; }

    // burning in daylight
    if (this.def.burns && this.world.dim === 0 && this.mgr.game.daylight > 0.8) {
      const sky = this.world.getSky(Math.floor(this.pos.x), Math.floor(this.pos.y + 1), Math.floor(this.pos.z));
      if (sky >= 14) {
        this.burnT = Math.max(this.burnT, 1);
      }
    }
    if (this.burnT > 0) {
      this.burnT -= dt;
      if ((this.age % 1) < dt) this.hurt(1, null);
      if (Math.random() < 0.3) this.mgr.particleBurst(this.world, this.pos.x, this.pos.y + this.h, this.pos.z, new THREE.Color('#e8721c'), 1);
    }

    // pressure plates
    const under = this.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.01), Math.floor(this.pos.z));
    if (under === B.PLATE) this.mgr.game.redstone?.pressPlate(this.world, Math.floor(this.pos.x), Math.floor(this.pos.y + 0.01), Math.floor(this.pos.z));

    // --- visuals ---
    if (this.obj) {
      this.obj.visible = sameWorld;
      this.obj.position.copy(this.pos);
      this.obj.rotation.y = this.yaw;
      const swing = Math.sin(this.walkPhase) * 0.6;
      for (let i = 0; i < this.legParts.length; i++)
        this.legParts[i].rotation.x = (i % 2 === 0 ? swing : -swing);
      if (this.headGroup && sameWorld && this.state === 'chase') {
        // head looks at player
        const dy2 = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z) - this.yaw;
        this.headGroup.rotation.y = Math.max(-1, Math.min(1, dy2));
      }
      const br = this.brightness();
      const flash = this.hurtFlash > 0 ? 1 : 0;
      const fuseFlash = this.fuse >= 0 && (Math.floor(this.fuse * 8) % 2 === 0) ? 1 : 0;
      for (const m of this.mats) {
        m.color.copy(m.baseColor).multiplyScalar(br);
        if (flash) m.color.lerp(new THREE.Color(1, 0.3, 0.3), 0.5);
        if (fuseFlash) m.color.lerp(new THREE.Color(1, 1, 1), 0.6);
      }
    }
  }
}

class ItemEntity extends Entity {
  constructor(mgr, world, x, y, z, stack, vel) {
    super(mgr, 'item', world, x, y, z);
    this.stack = stack;
    this.w = 0.12; this.h = 0.25;
    this.pickupDelay = 0.6;
    if (vel) this.vel.copy(vel);
    else this.vel.set((Math.random() - 0.5) * 3, 3 + Math.random() * 2, (Math.random() - 0.5) * 3);
    const sp = new THREE.Sprite(itemSpriteMaterial(stack.id));
    sp.scale.set(0.45, 0.45, 0.45);
    this.obj = sp;
    mgr.game.scene.add(sp);
  }
  update(dt) {
    this.age += dt;
    this.pickupDelay -= dt;
    this.vel.y -= 18 * dt;
    this.vel.x *= 0.95; this.vel.z *= 0.95;
    const res = moveEntity(this.world, this, dt);
    if (res.inWater) this.vel.y = Math.max(this.vel.y, 1);
    if (res.inLava) { this.remove(); return; }
    if (this.age > 240 || this.pos.y < -10) { this.remove(); return; }

    const game = this.mgr.game;
    const pl = game.player;
    if (game.world === this.world && this.pickupDelay <= 0 && !pl.dead) {
      const d2 = dist2(this.pos.x, this.pos.y, this.pos.z, pl.pos.x, pl.pos.y + 0.8, pl.pos.z);
      if (d2 < 1.3 * 1.3) {
        // magnet
        const dir = new THREE.Vector3(pl.pos.x - this.pos.x, pl.pos.y + 0.8 - this.pos.y, pl.pos.z - this.pos.z);
        if (d2 < 0.45) {
          const left = pl.addItem(this.stack);
          if (left === 0) {
            game.audio?.play('pop');
            this.remove();
            return;
          }
          this.stack.count = left;
        } else {
          dir.normalize().multiplyScalar(4);
          this.vel.copy(dir);
        }
      }
    }
    if (this.obj) {
      this.obj.visible = game.world === this.world;
      this.obj.position.set(this.pos.x, this.pos.y + 0.25 + Math.sin(this.age * 2) * 0.05, this.pos.z);
      const br = this.brightness();
      this.obj.material.color.setScalar(Math.min(1, br * 1.2));
    }
  }
}

class ArrowEntity extends Entity {
  constructor(mgr, world, x, y, z, dir, speed, fromPlayer, dmg) {
    super(mgr, 'arrow', world, x, y, z);
    this.w = 0.05; this.h = 0.05;
    this.vel.copy(dir).multiplyScalar(speed);
    this.fromPlayer = fromPlayer;
    this.dmg = dmg;
    this.stuck = false;
    const mat = new THREE.MeshBasicMaterial({ color: 0xd8d0c0 });
    this.obj = new THREE.Mesh(boxGeo(0.06, 0.06, 0.5), mat);
    mgr.game.scene.add(this.obj);
  }
  update(dt) {
    this.age += dt;
    if (this.age > 30) { this.remove(); return; }
    if (this.stuck) return;
    this.vel.y -= 14 * dt;
    const oldPos = this.pos.clone();
    const res = moveEntity(this.world, this, dt);
    if (res.hitWall || res.onGround || this.vel.lengthSq() < 0.5) {
      this.stuck = true;
      this.mgr.game.audio?.play('arrow_hit', { pos: this.pos });
    }
    // hit entities / player
    const game = this.mgr.game;
    if (this.fromPlayer) {
      for (const e of this.mgr.list) {
        if (!(e instanceof Mob) || e.world !== this.world || e.dead) continue;
        if (Math.abs(e.pos.x - this.pos.x) < e.w + 0.3 && Math.abs(e.pos.z - this.pos.z) < e.w + 0.3 &&
          this.pos.y > e.pos.y - 0.3 && this.pos.y < e.pos.y + e.h + 0.3) {
          e.hurt(this.dmg, this.vel.clone().setY(0).normalize().multiplyScalar(4));
          this.remove(); return;
        }
      }
    } else if (game.world === this.world && !game.player.dead) {
      const p = game.player;
      if (Math.abs(p.pos.x - this.pos.x) < 0.5 && Math.abs(p.pos.z - this.pos.z) < 0.5 &&
        this.pos.y > p.pos.y && this.pos.y < p.pos.y + 1.9) {
        p.damage(this.dmg, 'arrow', this.vel.clone().setY(0).normalize().multiplyScalar(5));
        this.remove(); return;
      }
    }
    if (this.obj) {
      this.obj.position.copy(this.pos);
      this.obj.lookAt(oldPos.add(this.vel));
    }
  }
}

class TNTEntity extends Entity {
  constructor(mgr, world, x, y, z, fuseTicks) {
    super(mgr, 'tnt', world, x, y, z);
    this.w = 0.45; this.h = 0.9;
    this.fuse = fuseTicks / 20;
    this.vel.set((Math.random() - 0.5), 4, (Math.random() - 0.5));
    const mat = new THREE.MeshBasicMaterial({ color: 0xd04a3a });
    mat.baseColor = new THREE.Color(0xd04a3a);
    this.obj = new THREE.Mesh(boxGeo(0.9, 0.9, 0.9), mat);
    mgr.game.scene.add(this.obj);
  }
  update(dt) {
    this.fuse -= dt;
    this.vel.y -= 22 * dt;
    moveEntity(this.world, this, dt);
    if (this.fuse <= 0) {
      this.mgr.explode(this.world, this.pos.x, this.pos.y + 0.45, this.pos.z, 4);
      this.remove();
      return;
    }
    if (this.obj) {
      this.obj.position.set(this.pos.x, this.pos.y + 0.45, this.pos.z);
      const flash = Math.floor(this.fuse * 5) % 2 === 0;
      this.obj.material.color.copy(this.obj.material.baseColor);
      if (flash) this.obj.material.color.lerp(new THREE.Color(1, 1, 1), 0.7);
    }
  }
}

class ParticleBurst {
  constructor(mgr, world, x, y, z, color, count, opts = {}) {
    this.mgr = mgr;
    this.world = world;
    this.life = opts.life ?? 0.8;
    this.age = 0;
    this.count = count;
    this.positions = new Float32Array(count * 3);
    this.vels = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      this.positions[i * 3] = x + (Math.random() - 0.5) * 0.6;
      this.positions[i * 3 + 1] = y + (Math.random() - 0.5) * 0.6;
      this.positions[i * 3 + 2] = z + (Math.random() - 0.5) * 0.6;
      this.vels[i * 3] = (Math.random() - 0.5) * (opts.spread ?? 3);
      this.vels[i * 3 + 1] = Math.random() * (opts.up ?? 4);
      this.vels[i * 3 + 2] = (Math.random() - 0.5) * (opts.spread ?? 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({
      color, size: opts.size ?? 0.14, sizeAttenuation: true, transparent: true,
    }));
    mgr.game.scene.add(this.points);
  }
  update(dt) {
    this.age += dt;
    if (this.age >= this.life) {
      this.mgr.game.scene.remove(this.points);
      this.points.geometry.dispose();
      this.points.material.dispose();
      return false;
    }
    for (let i = 0; i < this.count; i++) {
      this.vels[i * 3 + 1] -= 12 * dt;
      this.positions[i * 3] += this.vels[i * 3] * dt;
      this.positions[i * 3 + 1] += this.vels[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.vels[i * 3 + 2] * dt;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.material.opacity = 1 - this.age / this.life;
    this.points.visible = this.mgr.game.world === this.world;
    return true;
  }
}

// ============================ MANAGER =======================================
export class EntityManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.particles = [];
    this.spawnTimer = 0;
  }

  spawn(type, world, x, y, z) {
    if (!MOBS[type]) return null;
    const m = new Mob(this, type, world, x, y, z);
    this.list.push(m);
    return m;
  }

  dropItem(world, x, y, z, stack, vel) {
    if (!stack || stack.count <= 0 || !ITEMS[stack.id]) return;
    const e = new ItemEntity(this, world, x, y, z, { ...stack }, vel);
    this.list.push(e);
    return e;
  }

  shootArrow(world, x, y, z, dir, speed, fromPlayer, dmg) {
    const a = new ArrowEntity(this, world, x, y, z, dir, speed, fromPlayer, dmg);
    this.list.push(a);
    return a;
  }

  primeTNT(world, x, y, z, fuse) {
    const t = new TNTEntity(this, world, x, y, z, fuse);
    this.list.push(t);
    this.game.audio?.play('fuse', { pos: { x, y, z } });
    return t;
  }

  particleBurst(world, x, y, z, color, count, opts) {
    if (this.particles.length > 40) return;
    this.particles.push(new ParticleBurst(this, world, x, y, z, color, count, opts));
  }

  blockBreakParticles(world, x, y, z, blockId) {
    const d = BLOCKS[blockId];
    if (!d) return;
    this.particleBurst(world, x + 0.5, y + 0.5, z + 0.5, tileColor(d.tex[2]), 14);
  }

  explode(world, x, y, z, power) {
    this.game.audio?.play('explosion', { pos: { x, y, z } });
    this.particleBurst(world, x, y, z, new THREE.Color(0xbbbbaa), 40, { spread: 8, up: 8, size: 0.3, life: 1.2 });
    const r = Math.ceil(power);
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
      const dd = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dd > power + (Math.random() - 0.5)) continue;
      const bx = Math.floor(x) + dx, by = Math.floor(y) + dy, bz = Math.floor(z) + dz;
      const id = world.getBlock(bx, by, bz);
      if (id === B.AIR || id === B.BEDROCK || id === B.OBSIDIAN) continue;
      const meta = world.getMeta(bx, by, bz);
      world.setBlock(bx, by, bz, B.AIR);
      if (id === B.TNT) this.primeTNT(world, bx + 0.5, by, bz + 0.5, 10 + (Math.random() * 20 | 0));
      else if (Math.random() < 0.25) {
        for (const drop of getDrops(id, null, meta)) this.dropItem(world, bx + 0.5, by + 0.5, bz + 0.5, drop);
      }
    }
    // damage entities & player
    for (const e of this.list) {
      if (!(e instanceof Mob) || e.world !== world) continue;
      const dd = Math.sqrt(dist2(e.pos.x, e.pos.y, e.pos.z, x, y, z));
      if (dd < power * 2) e.hurt(Math.round((1 - dd / (power * 2)) * 14), new THREE.Vector3(e.pos.x - x, 0, e.pos.z - z).normalize().multiplyScalar(8));
    }
    const pl = this.game.player;
    if (this.game.world === world) {
      const dd = Math.sqrt(dist2(pl.pos.x, pl.pos.y, pl.pos.z, x, y, z));
      if (dd < power * 2) pl.damage(Math.round((1 - dd / (power * 2)) * 14), 'explosion',
        new THREE.Vector3(pl.pos.x - x, 0.5, pl.pos.z - z).normalize().multiplyScalar(10));
    }
  }

  anyOnBlock(world, x, y, z) {
    for (const e of this.list) {
      if (e.world !== world || e.dead) continue;
      if (Math.floor(e.pos.x) === x && Math.floor(e.pos.z) === z && Math.floor(e.pos.y + 0.01) === y) return true;
    }
    return false;
  }

  attackFrom(world, origin, dir, range, dmg) {
    // melee: pick nearest mob intersecting the ray
    let best = null, bestT = range;
    for (const e of this.list) {
      if (!(e instanceof Mob) || e.world !== world || e.dead) continue;
      const to = new THREE.Vector3(e.pos.x - origin.x, e.pos.y + e.h * 0.5 - origin.y, e.pos.z - origin.z);
      const t = to.dot(dir);
      if (t < 0 || t > bestT) continue;
      const closest = new THREE.Vector3().copy(dir).multiplyScalar(t).sub(to);
      if (closest.length() < e.w + 0.45) { best = e; bestT = t; }
    }
    if (best) {
      best.hurt(dmg, dir.clone().setY(0).normalize().multiplyScalar(7));
      return true;
    }
    return false;
  }

  countType(pred, world, cx, cz, range) {
    let n = 0;
    for (const e of this.list) {
      if (e.world !== world || e.dead || !(e instanceof Mob)) continue;
      if (!pred(e.def)) continue;
      if (Math.abs(e.pos.x - cx) < range && Math.abs(e.pos.z - cz) < range) n++;
    }
    return n;
  }

  spawnerTick(world, x, y, z) {
    const pl = this.game.player;
    if (this.game.world !== world) return;
    if (dist2(pl.pos.x, pl.pos.y, pl.pos.z, x, y, z) > 16 * 16) return;
    if (this.countType(d => d.hostile, world, x, z, 12) >= 6) return;
    const sx = x + 0.5 + (Math.random() * 7 - 3.5), sz = z + 0.5 + (Math.random() * 7 - 3.5);
    const sy = y + (Math.random() * 2 | 0);
    if (world.isSolidAt(Math.floor(sx), sy, Math.floor(sz))) return;
    this.spawn('zombie', world, sx, sy, sz);
    this.particleBurst(world, sx, sy + 1, sz, new THREE.Color(0xcc4444), 8);
  }

  // natural spawning — called once per second from game tick
  naturalSpawn() {
    const game = this.game;
    const world = game.world;
    const pl = game.player;
    if (!pl || game.peaceful === true) { /* hostiles suppressed below */ }
    const px = pl.pos.x, pz = pl.pos.z;

    // hostile
    if (!game.peaceful && this.countType(d => d.hostile, world, px, pz, 64) < 10) {
      for (let attempt = 0; attempt < 4; attempt++) {
        const ang = Math.random() * Math.PI * 2;
        const dist = 14 + Math.random() * 28;
        const x = Math.floor(px + Math.cos(ang) * dist), z = Math.floor(pz + Math.sin(ang) * dist);
        if (!world.isLoaded(x, z)) continue;
        // pick a y: random column position with solid floor & 2 air
        const y = this.findSpawnY(world, x, z, true);
        if (y < 0) continue;
        const raw = world.getLightRaw(x, y, z);
        const skyL = (raw >> 4) * game.daylight, blockL = raw & 15;
        if (Math.max(skyL, blockL) > 5) continue;
        const types = world.dim === 1 ? ['zombie', 'zombie', 'skeleton'] : ['zombie', 'skeleton', 'spider', 'creeper'];
        this.spawn(types[(Math.random() * types.length) | 0], world, x + 0.5, y, z + 0.5);
        break;
      }
    }
    // passive (overworld daytime)
    if (world.dim === 0 && game.daylight > 0.6 && this.countType(d => d.passive && !d.persist, world, px, pz, 64) < 8) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const ang = Math.random() * Math.PI * 2;
        const dist = 16 + Math.random() * 28;
        const x = Math.floor(px + Math.cos(ang) * dist), z = Math.floor(pz + Math.sin(ang) * dist);
        if (!world.isLoaded(x, z)) continue;
        const y = world.getTopY(x, z) + 1;
        if (world.getBlock(x, y - 1, z) !== B.GRASS) continue;
        const types = ['pig', 'cow', 'sheep', 'chicken'];
        const type = types[(Math.random() * types.length) | 0];
        for (let i = 0; i < 2 + (Math.random() * 2 | 0); i++)
          this.spawn(type, world, x + 0.5 + (Math.random() - 0.5) * 3, y, z + 0.5 + (Math.random() - 0.5) * 3);
        break;
      }
    }
    // villagers from generated villages
    while (world.pendingVillagers.length) {
      const v = world.pendingVillagers.pop();
      if (Math.abs(v.x - px) < 80 && Math.abs(v.z - pz) < 80)
        this.spawn('villager', world, v.x + 0.5, v.y, v.z + 0.5);
    }
    // despawn far entities
    for (const e of this.list) {
      if (e instanceof Mob && !e.def.persist && e.world === world) {
        if (dist2(e.pos.x, e.pos.y, e.pos.z, px, pl.pos.y, pz) > 90 * 90) e.remove();
      }
    }
  }

  findSpawnY(world, x, z, allowCaves) {
    const tries = allowCaves ? 6 : 1;
    for (let i = 0; i < tries; i++) {
      const y = allowCaves ? 5 + ((Math.random() * (CH - 20)) | 0) : world.getTopY(x, z) + 1;
      if (y < 1 || y > CH - 3) continue;
      if (!world.isSolidAt(x, y - 1, z)) continue;
      if (world.isSolidAt(x, y, z) || world.isSolidAt(x, y + 1, z)) continue;
      const id = world.getBlock(x, y, z);
      if (BLOCKS[id].liquid) continue;
      return y;
    }
    return -1;
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      if (e.dead) { this.list.splice(i, 1); continue; }
      // AI LOD: skip far entities most frames
      const pl = this.game.player;
      const d2 = dist2(e.pos.x, e.pos.y, e.pos.z, pl.pos.x, pl.pos.y, pl.pos.z);
      if (d2 > 48 * 48 && Math.random() < 0.8) continue;
      e.update(dt);
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      if (!this.particles[i].update(dt)) this.particles.splice(i, 1);
    }
  }

  tick() {
    this.spawnTimer++;
    if (this.spawnTimer % 20 === 0) this.naturalSpawn();
  }

  clearAll() {
    for (const e of this.list) e.remove();
    this.list.length = 0;
  }

  serialize() {
    const out = [];
    for (const e of this.list) {
      if (e instanceof Mob && !e.dead) {
        out.push({ t: e.type, d: e.world.dim, x: +e.pos.x.toFixed(1), y: +e.pos.y.toFixed(1), z: +e.pos.z.toFixed(1), hp: e.hp });
        if (out.length >= 120) break;
      } else if (e instanceof ItemEntity && !e.dead) {
        out.push({ t: 'item', d: e.world.dim, x: +e.pos.x.toFixed(1), y: +e.pos.y.toFixed(1), z: +e.pos.z.toFixed(1), s: e.stack });
        if (out.length >= 120) break;
      }
    }
    return out;
  }

  deserialize(data, worlds) {
    if (!data) return;
    for (const d of data) {
      const world = worlds[d.d ?? 0];
      if (!world) continue;
      if (d.t === 'item') this.dropItem(world, d.x, d.y, d.z, d.s);
      else {
        const m = this.spawn(d.t, world, d.x, d.y, d.z);
        if (m) m.hp = d.hp ?? m.hp;
      }
    }
  }
}
