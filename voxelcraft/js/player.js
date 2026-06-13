// player.js — first-person controller: input, physics, mining/placing,
// interactions, survival stats, inventory model, damage & death.
import * as THREE from 'three';
import { CH, moveEntity, raycastVoxel, clamp } from './util.js';
import {
  B, BLOCKS, ITEMS, TEX, ATLAS_TILES, getAtlasCanvas,
  breakTime, getDrops, stackMax, isSolid,
} from './blocks.js';

const EYE = 1.62;

export class Player {
  constructor(game) {
    this.game = game;
    this.pos = new THREE.Vector3(0, 80, 0);
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.w = 0.3; this.h = 1.8;
    this.onGround = false;
    this.inWater = false; this.inLava = false; this.onLadder = false;
    this.gamemode = 0;           // 0 survival, 1 creative, 2 spectator
    this.flying = false;
    this.sprinting = false;
    this.sneaking = false;
    this.dead = false;

    this.hp = 20; this.maxHp = 20;
    this.food = 20; this.saturation = 5;
    this.air = 10;               // seconds of air
    this.fallStart = null;
    this.hurtCd = 0;
    this.regenT = 0; this.starveT = 0; this.foodT = 0;
    this.portalT = 0;

    this.inventory = new Array(36).fill(null); // 0-8 hotbar
    this.armor = new Array(4).fill(null);
    this.sel = 0;
    this.spawnPoint = null;

    this.keys = {};
    this.mining = null;          // {x,y,z,progress,time}
    this.attackCd = 0;
    this.useCd = 0;
    this.eatT = 0;
    this.bowT = -1;
    this.lastSpace = 0;
    this.mouseDown = [false, false, false];

    this.buildHelpers();
    this.bindInput();
  }

  buildHelpers() {
    const game = this.game;
    // selection outline
    const box = new THREE.BoxGeometry(1.002, 1.002, 1.002);
    const edges = new THREE.EdgesGeometry(box);
    this.outline = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6 }));
    this.outline.visible = false;
    game.scene.add(this.outline);
    // crack overlay
    this.crackCanvas = document.createElement('canvas');
    this.crackCanvas.width = 16; this.crackCanvas.height = 16;
    this.crackTex = new THREE.CanvasTexture(this.crackCanvas);
    this.crackTex.magFilter = THREE.NearestFilter; this.crackTex.minFilter = THREE.NearestFilter;
    this.crackMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.004, 1.004, 1.004),
      new THREE.MeshBasicMaterial({ map: this.crackTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
    this.crackMesh.visible = false;
    game.scene.add(this.crackMesh);
  }

  setCrackStage(stage) {
    const atlas = getAtlasCanvas();
    const tile = TEX.crack + clamp(stage, 0, 9);
    const sx = (tile % ATLAS_TILES) * 16, sy = ((tile / ATLAS_TILES) | 0) * 16;
    const c = this.crackCanvas.getContext('2d');
    c.clearRect(0, 0, 16, 16);
    c.drawImage(atlas, sx, sy, 16, 16, 0, 0, 16, 16);
    this.crackTex.needsUpdate = true;
  }

  dispose() {
    this.disposed = true;
    this.game.scene.remove(this.outline);
    this.game.scene.remove(this.crackMesh);
    for (const [type, fn] of this._listeners) document.removeEventListener(type, fn);
  }

  on(type, fn) {
    const wrapped = (e) => { if (this.disposed || this.game.player !== this) return; fn(e); };
    this._listeners.push([type, wrapped]);
    document.addEventListener(type, wrapped);
  }

  bindInput() {
    const game = this.game;
    this._listeners = [];
    this.on('keydown', (e) => {
      if (game.ui.chatOpen) return;
      this.keys[e.code] = true;
      if (game.ui.anyScreenOpen()) return;
      if (e.code === 'Space') {
        const now = performance.now();
        if (this.gamemode === 1 && now - this.lastSpace < 280) { this.flying = !this.flying; this.vel.y = 0; }
        this.lastSpace = now;
      }
      if (e.code.startsWith('Digit')) {
        const n = +e.code.slice(5);
        if (n >= 1 && n <= 9) { this.sel = n - 1; game.ui.refreshHotbar(); }
      }
      if (e.code === 'KeyQ') this.dropSelected(e.ctrlKey);
    });
    this.on('keyup', (e) => { this.keys[e.code] = false; });
    this.on('mousemove', (e) => {
      if (!game.pointerLocked) return;
      const sens = (game.settings.sensitivity ?? 1) * 0.0022;
      this.yaw -= e.movementX * sens;
      this.pitch -= e.movementY * sens;
      this.pitch = clamp(this.pitch, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
    });
    this.on('mousedown', (e) => {
      if (!game.pointerLocked) return;
      this.mouseDown[e.button] = true;
      if (e.button === 0) this.onAttack();
      if (e.button === 2) this.onUse();
      if (e.button === 1) this.pickBlock();
    });
    this.on('mouseup', (e) => {
      this.mouseDown[e.button] = false;
      if (e.button === 0) this.mining = null;
      if (e.button === 2) { this.releaseBow(); this.eatT = 0; }
    });
    this.on('wheel', (e) => {
      if (!game.pointerLocked) return;
      this.sel = (this.sel + (e.deltaY > 0 ? 1 : -1) + 9) % 9;
      game.ui.refreshHotbar();
    });
  }

  // ---------- inventory -------------------------------------------------------
  currentItem() { return this.inventory[this.sel]; }

  addItem(stack) {
    // returns leftover count
    let { id, count } = stack;
    const max = stackMax(id);
    // merge into existing
    for (let i = 0; i < 36 && count > 0; i++) {
      const s = this.inventory[i];
      if (s && s.id === id && !s.dur && s.count < max) {
        const take = Math.min(max - s.count, count);
        s.count += take; count -= take;
      }
    }
    for (let i = 0; i < 36 && count > 0; i++) {
      if (!this.inventory[i]) {
        const take = Math.min(max, count);
        this.inventory[i] = { id, count: take };
        if (stack.dur !== undefined) this.inventory[i].dur = stack.dur;
        count -= take;
      }
    }
    this.game.ui.refreshHotbar();
    return count;
  }

  give(id, count = 1) {
    const def = ITEMS[id];
    if (!def) return false;
    const st = { id, count };
    if (def.tool) st.dur = def.tool.dur;
    if (def.armor) st.dur = def.armor.dur;
    return this.addItem(st) === 0;
  }

  consumeSelected(n = 1) {
    const s = this.inventory[this.sel];
    if (!s) return;
    s.count -= n;
    if (s.count <= 0) this.inventory[this.sel] = null;
    this.game.ui.refreshHotbar();
  }

  damageTool() {
    const s = this.inventory[this.sel];
    if (!s || s.dur === undefined || this.gamemode === 1) return;
    s.dur--;
    if (s.dur <= 0) {
      this.inventory[this.sel] = null;
      this.game.audio?.play('break_tool');
    }
    this.game.ui.refreshHotbar();
  }

  dropSelected(all) {
    const s = this.inventory[this.sel];
    if (!s) return;
    const n = all ? s.count : 1;
    const dir = this.lookDir();
    const vel = new THREE.Vector3(dir.x * 6, dir.y * 6 + 2, dir.z * 6);
    this.game.entities.dropItem(this.game.world, this.pos.x, this.pos.y + EYE - 0.2, this.pos.z,
      { ...s, count: n }, vel);
    s.count -= n;
    if (s.count <= 0) this.inventory[this.sel] = null;
    this.game.ui.refreshHotbar();
  }

  armorPoints() {
    let p = 0;
    for (const a of this.armor) if (a && ITEMS[a.id]?.armor) p += ITEMS[a.id].armor.points;
    return p;
  }

  // ---------- looking / targeting ----------------------------------------------
  lookDir() {
    return new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch));
  }

  eyePos() { return new THREE.Vector3(this.pos.x, this.pos.y + (this.sneaking ? EYE - 0.15 : EYE), this.pos.z); }

  raycastBlock(fluid = false) {
    const o = this.eyePos(), d = this.lookDir();
    const reach = this.gamemode === 1 ? 5.5 : 4.5;
    return raycastVoxel(this.game.world, o.x, o.y, o.z, d.x, d.y, d.z, reach, (id) => {
      if (id === B.AIR) return false;
      const def = BLOCKS[id];
      if (def.liquid) return fluid;
      return true;
    });
  }

  // ---------- attack / mine ---------------------------------------------------
  onAttack() {
    if (this.dead || this.game.ui.anyScreenOpen()) return;
    const dir = this.lookDir();
    const hit = this.raycastBlock();
    const blockDist = hit ? hit.dist : 99;
    // entity first
    const item = this.currentItem();
    const dmg = item ? (ITEMS[item.id].dmg ?? 1) : 1;
    const range = Math.min(3.5, blockDist + 0.2);
    if (this.game.entities.attackFrom(this.game.world, this.eyePos(), dir, range, dmg)) {
      this.game.audio?.play('hit');
      if (item && ITEMS[item.id].tool) this.damageTool();
      return;
    }
    if (hit) this.startMining(hit);
  }

  startMining(hit) {
    const id = this.game.world.getBlock(hit.x, hit.y, hit.z);
    if (id === B.AIR) return;
    if (this.gamemode === 1) { this.finishMining(hit, true); this.attackCd = 0.25; return; }
    const item = this.currentItem();
    const t = breakTime(id, item ? item.id : null);
    if (t === Infinity) { this.mining = null; return; }
    this.mining = { x: hit.x, y: hit.y, z: hit.z, progress: 0, time: t, id };
  }

  finishMining(hit, creative) {
    const world = this.game.world;
    const id = world.getBlock(hit.x, hit.y, hit.z);
    if (id === B.AIR) return;
    const meta = world.getMeta(hit.x, hit.y, hit.z);
    const d = BLOCKS[id];
    // chest with contents spills
    if (id === B.CHEST && meta && meta.items) {
      for (const s of meta.items) if (s) this.game.entities.dropItem(world, hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, s);
    }
    if (id === B.DOOR) {
      const m = meta || {};
      const oy = m.upper ? hit.y - 1 : hit.y + 1;
      world.setBlock(hit.x, oy, hit.z, B.AIR);
    }
    world.setBlock(hit.x, hit.y, hit.z, B.AIR);
    this.game.entities.blockBreakParticles(world, hit.x, hit.y, hit.z, id);
    this.game.audio?.play('dig_' + d.sound, { pos: hit, fallback: 'dig_stone' });
    if (!creative) {
      const item = this.currentItem();
      for (const drop of getDrops(id, item ? item.id : null, meta))
        this.game.entities.dropItem(world, hit.x + 0.5, hit.y + 0.3, hit.z + 0.5, drop);
      if (item && ITEMS[item.id].tool && d.hard > 0) this.damageTool();
      this.foodT += 4; // mining costs hunger over time
    }
  }

  updateMining(dt) {
    if (this.gamemode === 1) {
      if (this.mouseDown[0] && this.attackCd <= 0 && this.game.pointerLocked && !this.game.ui.anyScreenOpen()) {
        const hit = this.raycastBlock();
        if (hit) { this.finishMining(hit, true); this.attackCd = 0.25; }
      }
      this.crackMesh.visible = false;
      return;
    }
    if (!this.mouseDown[0] || this.dead) { this.mining = null; this.crackMesh.visible = false; return; }
    const hit = this.raycastBlock();
    if (!hit) { this.mining = null; this.crackMesh.visible = false; return; }
    if (!this.mining || this.mining.x !== hit.x || this.mining.y !== hit.y || this.mining.z !== hit.z) {
      this.startMining(hit);
      if (!this.mining) return;
    }
    const m = this.mining;
    m.progress += dt;
    if ((m.progress * 5 | 0) !== (((m.progress - dt) * 5) | 0))
      this.game.audio?.play('step_' + BLOCKS[m.id].sound, { pos: m, fallback: 'step_stone', vol: 0.4 });
    this.crackMesh.visible = true;
    this.crackMesh.position.set(m.x + 0.5, m.y + 0.5, m.z + 0.5);
    this.setCrackStage(Math.floor((m.progress / m.time) * 10));
    if (m.progress >= m.time) {
      this.finishMining(m, false);
      this.mining = null;
      this.crackMesh.visible = false;
    }
  }

  pickBlock() {
    const hit = this.raycastBlock();
    if (!hit) return;
    const id = this.game.world.getBlock(hit.x, hit.y, hit.z);
    if (!ITEMS[id]) return;
    // find in inventory
    for (let i = 0; i < 9; i++) if (this.inventory[i]?.id === id) { this.sel = i; this.game.ui.refreshHotbar(); return; }
    if (this.gamemode === 1) {
      this.inventory[this.sel] = { id, count: 64 };
      this.game.ui.refreshHotbar();
    }
  }

  // ---------- use / place ------------------------------------------------------
  onUse() {
    if (this.dead || this.game.ui.anyScreenOpen()) return;
    if (this.useCd > 0) return;
    const game = this.game;
    const world = game.world;
    const hit = this.raycastBlock();
    const item = this.currentItem();
    const def = item ? ITEMS[item.id] : null;

    // 1. interact with the block
    if (hit && !this.sneaking) {
      const id = world.getBlock(hit.x, hit.y, hit.z);
      if (this.interactBlock(id, hit)) { this.useCd = 0.25; return; }
    }

    // 2. item actions
    if (!def) return;

    if (def.food !== undefined) {
      if (this.food < 20 || item.id === 321) this.eatT = 0.01; // begin eating (hold)
      return;
    }
    if (def.tool?.type === 'bow') {
      if (this.hasItem(289) || this.gamemode === 1) this.bowT = 0;
      return;
    }
    if (item.id === 306 && hit) { // empty bucket → scoop fluid
      const fhit = this.raycastBlock(true);
      if (fhit) {
        const fid = world.getBlock(fhit.x, fhit.y, fhit.z);
        const fm = world.getMeta(fhit.x, fhit.y, fhit.z);
        const isSource = !fm || fm.lv === undefined || fm.lv === 8;
        if ((fid === B.WATER || fid === B.LAVA) && isSource) {
          world.setBlock(fhit.x, fhit.y, fhit.z, B.AIR);
          this.consumeSelected();
          this.give(fid === B.WATER ? 307 : 308);
          game.audio?.play('splash');
          this.useCd = 0.3;
        }
      }
      return;
    }
    if ((item.id === 307 || item.id === 308) && hit) { // place fluid
      const tx = hit.x + hit.nx, ty = hit.y + hit.ny, tz = hit.z + hit.nz;
      const tid = world.getBlock(tx, ty, tz);
      if (tid === B.AIR || BLOCKS[tid].replaceable) {
        world.setBlock(tx, ty, tz, item.id === 307 ? B.WATER : B.LAVA);
        this.inventory[this.sel] = { id: 306, count: 1 };
        game.ui.refreshHotbar();
        game.audio?.play('splash');
        this.useCd = 0.3;
      }
      return;
    }
    if (def.tool?.type === 'hoe' && hit) {
      const id = world.getBlock(hit.x, hit.y, hit.z);
      if ((id === B.GRASS || id === B.DIRT) && world.getBlock(hit.x, hit.y + 1, hit.z) === B.AIR) {
        world.setBlock(hit.x, hit.y, hit.z, B.FARMLAND);
        game.audio?.play('dig_gravel');
        this.damageTool();
        this.useCd = 0.25;
      }
      return;
    }
    if (item.id === 294 && hit && hit.ny === 1) { // seeds
      if (world.getBlock(hit.x, hit.y, hit.z) === B.FARMLAND && world.getBlock(hit.x, hit.y + 1, hit.z) === B.AIR) {
        world.setBlock(hit.x, hit.y + 1, hit.z, B.WHEAT, { meta: { stage: 0 } });
        this.consumeSelected();
        game.audio?.play('place_grass');
        this.useCd = 0.2;
      }
      return;
    }
    if (def.tool?.type === 'igniter' && hit) {
      // light TNT or nether portal
      const id = world.getBlock(hit.x, hit.y, hit.z);
      if (id === B.TNT) {
        world.setBlock(hit.x, hit.y, hit.z, B.AIR);
        game.entities.primeTNT(world, hit.x + 0.5, hit.y, hit.z + 0.5, 80);
        this.damageTool();
      } else if (id === B.OBSIDIAN || world.getBlock(hit.x + hit.nx, hit.y + hit.ny, hit.z + hit.nz) === B.AIR) {
        if (game.tryIgnitePortal(hit.x + hit.nx, hit.y + hit.ny, hit.z + hit.nz)) this.damageTool();
      }
      this.useCd = 0.3;
      return;
    }
    if (def.armor) { // equip
      const slot = def.armor.slot;
      const old = this.armor[slot];
      this.armor[slot] = item;
      this.inventory[this.sel] = old || null;
      game.ui.refreshHotbar();
      game.audio?.play('click');
      this.useCd = 0.3;
      return;
    }
    if (def.place !== undefined && hit) this.placeBlock(hit, item, def);
  }

  interactBlock(id, hit) {
    const game = this.game, world = game.world;
    const { x, y, z } = hit;
    switch (id) {
      case B.CRAFTING: game.ui.openCrafting(); return true;
      case B.FURNACE: game.ui.openFurnace(world, x, y, z); return true;
      case B.CHEST: game.ui.openChest(world, x, y, z); return true;
      case B.DOOR: {
        const m = world.getMeta(x, y, z) || {};
        game.redstone.setDoor(world, x, y, z, !m.open, false);
        return true;
      }
      case B.LEVER: {
        const m = world.getMeta(x, y, z) || {};
        world.setMeta(x, y, z, { ...m, on: !m.on });
        world.markDirtyAt(x, y, z);
        game.audio?.play('click', { pos: hit });
        game.redstone.onChange(world, x, y, z);
        if (game.mp) game.mp.sendMeta(world.dim, x, y, z, world.getMeta(x, y, z));
        return true;
      }
      case B.BUTTON: {
        const m = world.getMeta(x, y, z) || {};
        world.setMeta(x, y, z, { ...m, pressed: true });
        world.scheduleTick(x, y, z, 20);
        world.markDirtyAt(x, y, z);
        game.audio?.play('click', { pos: hit });
        game.redstone.onChange(world, x, y, z);
        return true;
      }
      case B.BED: {
        if (game.world.dim !== 0) { game.ui.chatMsg('You can only sleep in the Overworld'); return true; }
        this.spawnPoint = { x: x + 0.5, y: y + 1, z: z + 0.5 };
        if (game.daylight < 0.3) {
          game.time = 23500; // wake at dawn
          game.ui.chatMsg('You slept through the night. Spawn point set.');
        } else {
          game.ui.chatMsg('Spawn point set. You can only sleep at night.');
        }
        return true;
      }
      case B.TNT: {
        const it = this.currentItem();
        if (it && ITEMS[it.id].tool?.type === 'igniter') return false; // handled by igniter
        return false;
      }
      default: return false;
    }
  }

  placeBlock(hit, item, def) {
    const game = this.game, world = game.world;
    const bid = def.place;
    const bdef = BLOCKS[bid];
    let tx = hit.x + hit.nx, ty = hit.y + hit.ny, tz = hit.z + hit.nz;
    // clicking a replaceable block replaces it directly
    const hitId = world.getBlock(hit.x, hit.y, hit.z);
    if (BLOCKS[hitId].replaceable && !BLOCKS[hitId].liquid) { tx = hit.x; ty = hit.y; tz = hit.z; }
    if (ty < 0 || ty >= CH) return;
    const tid = world.getBlock(tx, ty, tz);
    if (tid !== B.AIR && !BLOCKS[tid].replaceable) return;

    // collision with player / mobs
    if (bdef.solid) {
      const px = Math.floor(this.pos.x), pz = Math.floor(this.pos.z);
      const py0 = Math.floor(this.pos.y), py1 = Math.floor(this.pos.y + this.h - 0.01);
      if (tx === px && tz === pz && (ty === py0 || ty === py1)) return;
      // also reject overlap with any mob AABB
      for (const e of game.entities.list) {
        if (e.world !== world || e.dead || e.type === 'item' || e.type === 'arrow') continue;
        if (Math.floor(e.pos.x) === tx && Math.floor(e.pos.z) === tz &&
          ty >= Math.floor(e.pos.y) && ty <= Math.floor(e.pos.y + e.h)) return;
      }
    }

    // support requirements
    const needsFloor = bdef.cross || bid === B.TORCH || bid === B.RS_TORCH || bid === B.WIRE ||
      bid === B.PLATE || bid === B.LEVER || bid === B.BUTTON || bid === B.DOOR || bid === B.BED;
    if (needsFloor && !isSolid(world.getBlock(tx, ty - 1, tz))) return;
    if (bid === B.WHEAT) return;
    if (bid === B.CACTUS) {
      const below = world.getBlock(tx, ty - 1, tz);
      if (below !== B.SAND && below !== B.CACTUS) return;
    }

    // orientation meta
    let meta;
    const facing = this.cardinalFacing();
    if (bid === B.FURNACE || bid === B.CHEST || bid === B.PUMPKIN || bid === B.CRAFTING) meta = { facing: facing ^ 1 }; // front faces the player
    if (bid === B.LADDER) {
      if (hit.ny !== 0) return; // must click a wall
      meta = { facing: hit.nz === 1 ? 0 : hit.nz === -1 ? 1 : hit.nx === 1 ? 2 : 3 };
    }
    if (bid === B.DOOR) {
      if (world.getBlock(tx, ty + 1, tz) !== B.AIR) return;
      meta = { facing, open: false };
    }
    if (bid === B.CHEST) meta = { ...(meta || {}), items: new Array(27).fill(null) };
    if (bid === B.WIRE) meta = { p: 0 };

    world.setBlock(tx, ty, tz, bid, { meta });
    if (bid === B.DOOR) world.setBlock(tx, ty + 1, tz, B.DOOR, { meta: { ...meta, upper: true } });
    game.audio?.play('place_' + bdef.sound, { pos: { x: tx, y: ty, z: tz }, fallback: 'place_stone' });
    if (this.gamemode !== 1) this.consumeSelected();
    this.useCd = 0.2;
  }

  cardinalFacing() {
    // 0:+z 1:-z 2:+x 3:-x — direction the player is looking
    const d = this.lookDir();
    if (Math.abs(d.x) > Math.abs(d.z)) return d.x > 0 ? 2 : 3;
    return d.z > 0 ? 0 : 1;
  }

  hasItem(id) {
    for (const s of this.inventory) if (s && s.id === id) return true;
    return false;
  }

  takeItem(id, n = 1) {
    for (let i = 0; i < 36 && n > 0; i++) {
      const s = this.inventory[i];
      if (s && s.id === id) {
        const take = Math.min(n, s.count);
        s.count -= take; n -= take;
        if (s.count <= 0) this.inventory[i] = null;
      }
    }
    this.game.ui.refreshHotbar();
  }

  releaseBow() {
    if (this.bowT < 0) return;
    const charge = clamp(this.bowT / 1.0, 0.2, 1);
    this.bowT = -1;
    if (charge < 0.25) return;
    if (this.gamemode !== 1) this.takeItem(289, 1);
    const dir = this.lookDir();
    const o = this.eyePos();
    this.game.entities.shootArrow(this.game.world, o.x, o.y - 0.1, o.z, dir, 8 + charge * 22, true, Math.round(2 + charge * 5));
    this.game.audio?.play('bow');
    this.damageTool();
  }

  // ---------- survival ----------------------------------------------------------
  damage(n, source, kb) {
    if (this.dead || this.gamemode !== 0 || this.hurtCd > 0 || n <= 0) return;
    const reduced = Math.max(1, Math.round(n * (1 - 0.04 * this.armorPoints())));
    this.hp -= reduced;
    this.hurtCd = 0.5;
    // armor durability
    for (let i = 0; i < 4; i++) {
      const a = this.armor[i];
      if (a && a.dur !== undefined) { a.dur--; if (a.dur <= 0) this.armor[i] = null; }
    }
    if (kb) { this.vel.x += kb.x; this.vel.y += Math.max(2, kb.y || 0); this.vel.z += kb.z; }
    this.game.audio?.play('hurt');
    this.game.ui.flashHurt();
    this.game.ui.refreshStats();
    if (this.hp <= 0) this.die(source);
  }

  heal(n) {
    this.hp = clamp(this.hp + n, 0, this.maxHp);
    this.game.ui.refreshStats();
  }

  die(source) {
    this.dead = true;
    this.hp = 0;
    // scatter inventory
    for (let i = 0; i < 36; i++) {
      if (this.inventory[i]) this.game.entities.dropItem(this.game.world, this.pos.x, this.pos.y + 1, this.pos.z, this.inventory[i]);
      this.inventory[i] = null;
    }
    for (let i = 0; i < 4; i++) {
      if (this.armor[i]) this.game.entities.dropItem(this.game.world, this.pos.x, this.pos.y + 1, this.pos.z, this.armor[i]);
      this.armor[i] = null;
    }
    this.game.ui.showDeath(source);
  }

  respawn() {
    this.dead = false;
    this.hp = this.maxHp;
    this.food = 20; this.saturation = 5; this.air = 10;
    this.vel.set(0, 0, 0);
    const sp = this.spawnPoint || this.game.worldSpawn;
    if (this.game.world.dim !== 0) this.game.setDimension(0);
    this.pos.set(sp.x, sp.y, sp.z);
    this.game.ui.hideDeath();
    this.game.ui.refreshStats();
  }

  tick() {
    // 20 TPS survival logic
    if (this.dead || this.gamemode !== 0) return;
    const game = this.game;
    // hunger drain
    this.foodT += this.sprinting ? 3 : 1;
    if (this.foodT >= 1200) { // ~every minute walking
      this.foodT = 0;
      if (this.saturation > 0) this.saturation--;
      else if (this.food > 0) { this.food--; game.ui.refreshStats(); }
    }
    // regen / starve
    if (this.food >= 18 && this.hp < this.maxHp) {
      this.regenT++;
      if (this.regenT >= 80) { this.regenT = 0; this.heal(1); this.foodT += 100; }
    } else if (this.food <= 0) {
      this.starveT++;
      if (this.starveT >= 80) { this.starveT = 0; if (this.hp > 1) { this.hp--; game.ui.flashHurt(); game.ui.refreshStats(); } }
    }
    // drowning
    const headId = game.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + EYE), Math.floor(this.pos.z));
    if (BLOCKS[headId]?.liquid === 1) {
      this.air -= 0.05; // 1 bubble-second per second
      if (this.air <= 0) {
        this.air = 0;
        this.drownT = (this.drownT || 0) + 1;
        if (this.drownT >= 20) { this.drownT = 0; this.damage(2, 'drown'); }
      }
      game.ui.refreshStats();
    } else if (this.air < 10) {
      this.drownT = 0;
      this.air = Math.min(10, this.air + 0.2);
      game.ui.refreshStats();
    }
    // lava / cactus contact damage
    if (this.inLava) { this.damage(4, 'lava'); game.audio?.play('fizz'); }
    const feet = game.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y), Math.floor(this.pos.z));
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (game.world.getBlock(Math.floor(this.pos.x + dx * 0.4), Math.floor(this.pos.y + 0.5), Math.floor(this.pos.z + dz * 0.4)) === B.CACTUS)
        this.damage(1, 'cactus');
    }
    if (this.pos.y < -8) this.damage(4, 'void');
  }

  update(dt) {
    const game = this.game;
    this.attackCd -= dt; this.useCd -= dt; this.hurtCd -= dt;
    if (this.dead) return;

    const locked = game.pointerLocked && !game.ui.anyScreenOpen() && !game.ui.chatOpen;
    const k = this.keys;
    let fwd = 0, strafe = 0;
    if (locked) {
      if (k['KeyW']) fwd++;
      if (k['KeyS']) fwd--;
      if (k['KeyA']) strafe--;
      if (k['KeyD']) strafe++;
      this.sneaking = !!k['ShiftLeft'] && !this.flying && this.gamemode !== 2;
      this.sprinting = !!k['ControlLeft'] && fwd > 0 && this.food > 6;
    } else { this.sneaking = false; this.sprinting = false; }

    const fly = this.flying || this.gamemode === 2;
    let speed = 4.3;
    if (this.sprinting) speed *= 1.6;
    if (this.sneaking) speed *= 0.35;
    if (fly) speed *= 2.5;
    if (this.inWater && !fly) speed *= 0.55;

    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const mx = (-sin * fwd + cos * strafe);
    const mz = (-cos * fwd - sin * strafe);
    const mlen = Math.hypot(mx, mz) || 1;

    if (fly) {
      this.vel.x = (mx / mlen) * speed * (fwd || strafe ? 1 : 0);
      this.vel.z = (mz / mlen) * speed * (fwd || strafe ? 1 : 0);
      this.vel.y = 0;
      if (locked && k['Space']) this.vel.y = speed;
      if (locked && k['ShiftLeft']) this.vel.y = -speed;
    } else {
      const accel = this.onGround ? 10 : 4;
      this.vel.x += ((mx / mlen) * speed * (fwd || strafe ? 1 : 0) - this.vel.x) * Math.min(1, accel * dt);
      this.vel.z += ((mz / mlen) * speed * (fwd || strafe ? 1 : 0) - this.vel.z) * Math.min(1, accel * dt);
      if (this.inWater || this.onLadder) {
        this.vel.y -= 4 * dt;
        this.vel.y = Math.max(this.vel.y, -3);
        if (locked && k['Space']) this.vel.y = this.onLadder ? 3 : 3.2;
        if (this.onLadder && (fwd || strafe)) this.vel.y = Math.max(this.vel.y, 1.5);
      } else {
        this.vel.y -= 24 * dt;
        if (locked && k['Space'] && this.onGround) {
          this.vel.y = 8.2;
          this.foodT += 8;
          if (this.sprinting) { this.vel.x *= 1.2; this.vel.z *= 1.2; }
        }
      }
    }

    if (this.gamemode === 2) {
      // spectator noclip
      this.pos.x += this.vel.x * dt; this.pos.y += this.vel.y * dt; this.pos.z += this.vel.z * dt;
      this.onGround = false;
    } else {
      const res = moveEntity(game.world, this, dt);
      const wasOnGround = this.onGround;
      this.onGround = res.onGround;
      this.inWater = res.inWater; this.inLava = res.inLava; this.onLadder = res.onLadder;
      if (fly && this.onGround && this.gamemode === 1) this.flying = false;

      // fall damage
      if (!this.onGround && !this.inWater && !this.onLadder && !fly) {
        if (this.fallStart === null) this.fallStart = this.pos.y;
        else this.fallStart = Math.max(this.fallStart, this.pos.y);
      } else {
        if (this.fallStart !== null && this.onGround && !this.inWater && !fly) {
          const dist = this.fallStart - this.pos.y;
          if (dist > 3.5) this.damage(Math.floor(dist - 3), 'fall');
        }
        this.fallStart = null;
      }

      // footsteps
      if (this.onGround && (fwd || strafe)) {
        this.stepT = (this.stepT || 0) + dt * (this.sprinting ? 1.6 : 1);
        if (this.stepT > 0.38) {
          this.stepT = 0;
          const under = game.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y - 0.5), Math.floor(this.pos.z));
          if (under !== B.AIR) game.audio?.play('step_' + (BLOCKS[under]?.sound || 'stone'), { vol: 0.35, fallback: 'step_stone' });
        }
      }
      // pressure plate
      const feetB = game.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.01), Math.floor(this.pos.z));
      if (feetB === B.PLATE) game.redstone.pressPlate(game.world, Math.floor(this.pos.x), Math.floor(this.pos.y + 0.01), Math.floor(this.pos.z));
      // portal
      if (feetB === B.PORTAL) {
        this.portalT += dt;
        if (this.portalT > 1.2) { this.portalT = -3; game.travelPortal(); }
      } else if (this.portalT > 0) this.portalT = 0;
      else if (this.portalT < 0) this.portalT = Math.min(0, this.portalT + dt);
    }

    // eating
    if (this.eatT > 0 && this.mouseDown[2]) {
      const item = this.currentItem();
      const def = item ? ITEMS[item.id] : null;
      if (def && def.food !== undefined) {
        this.eatT += dt;
        if ((this.eatT * 4 | 0) !== (((this.eatT - dt) * 4) | 0)) game.audio?.play('eat', { vol: 0.5 });
        if (this.eatT > 1.4) {
          this.eatT = 0;
          this.food = clamp(this.food + def.food, 0, 20);
          this.saturation = clamp(this.saturation + def.food * 0.6, 0, 20);
          if (item.id === 321) this.heal(this.maxHp); // golden apple
          this.consumeSelected();
          game.audio?.play('burp');
          game.ui.refreshStats();
        }
      } else this.eatT = 0;
    }
    // bow charging
    if (this.bowT >= 0) this.bowT += dt;

    this.updateMining(dt);

    // selection outline
    const hit = (locked && !this.dead) ? this.raycastBlock() : null;
    if (hit) {
      this.outline.visible = true;
      this.outline.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    } else this.outline.visible = false;

    // camera
    const cam = game.camera;
    cam.position.copy(this.eyePos());
    cam.rotation.set(0, 0, 0);
    cam.rotateY(this.yaw);
    cam.rotateX(this.pitch);
  }

  serialize() {
    return {
      pos: [this.pos.x, this.pos.y, this.pos.z],
      yaw: this.yaw, pitch: this.pitch,
      hp: this.hp, food: this.food, sat: this.saturation,
      gm: this.gamemode, fly: this.flying,
      inv: this.inventory, armor: this.armor, sel: this.sel,
      spawn: this.spawnPoint,
    };
  }

  deserialize(d) {
    if (!d) return;
    this.pos.set(d.pos[0], d.pos[1], d.pos[2]);
    this.yaw = d.yaw; this.pitch = d.pitch;
    this.hp = d.hp ?? 20; this.food = d.food ?? 20; this.saturation = d.sat ?? 5;
    this.gamemode = d.gm ?? 0; this.flying = d.fly ?? false;
    this.inventory = d.inv ?? this.inventory;
    this.armor = d.armor ?? this.armor;
    this.sel = d.sel ?? 0;
    this.spawnPoint = d.spawn ?? null;
  }
}
