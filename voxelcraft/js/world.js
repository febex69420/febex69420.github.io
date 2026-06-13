// world.js — chunk store, block access, two-channel voxel lighting,
// scheduled ticks (liquids, falling blocks), random ticks, edit diffs.
import { CS, CH, idx3, ckey, bkey, hash2, mulberry32 } from './util.js';
import { B, BLOCKS, getDrops } from './blocks.js';
import { WorldGen } from './worldgen.js';

export class Chunk {
  constructor(cx, cz, blocks) {
    this.cx = cx; this.cz = cz;
    this.blocks = blocks;
    this.light = new Uint8Array(CS * CS * CH);
    this.dirty = true;       // needs remesh
    this.lit = false;        // initial lighting done
    this.meshO = null; this.meshW = null;
  }
}

export class World {
  constructor(game, seed, dim = 0) {
    this.game = game;
    this.seed = seed;
    this.dim = dim;
    this.gen = new WorldGen(seed, dim);
    this.chunks = new Map();
    this.edits = new Map();      // ckey -> Map(idx -> id)
    this.meta = new Map();       // bkey -> object
    this.ticks = new Map();      // bkey -> dueTick
    this.tickNum = 0;
    this.blocksRef = BLOCKS;
    this.genQueue = [];
    this.pendingVillagers = [];  // spawn positions discovered during gen
  }

  // ---- access ---------------------------------------------------------------
  chunkAt(cx, cz) { return this.chunks.get(ckey(cx, cz)); }

  getBlock(x, y, z) {
    if (y < 0 || y >= CH) return B.AIR;
    const c = this.chunks.get(ckey(x >> 4, z >> 4));
    if (!c) return B.AIR;
    return c.blocks[idx3(x & 15, y, z & 15)];
  }

  isLoaded(x, z) { return this.chunks.has(ckey(x >> 4, z >> 4)); }

  isSolidAt(x, y, z) {
    if (y < 0) return true;
    if (y >= CH) return false;
    const c = this.chunks.get(ckey(x >> 4, z >> 4));
    if (!c) return true; // unloaded terrain is a wall
    const id = c.blocks[idx3(x & 15, y, z & 15)];
    if (id === B.DOOR) {
      const m = this.meta.get(bkey(x, y, z));
      return !(m && m.open);
    }
    const d = BLOCKS[id];
    return d ? d.solid : false;
  }

  getLightRaw(x, y, z) {
    if (y >= CH) return 0xf0;
    if (y < 0) return 0;
    const c = this.chunks.get(ckey(x >> 4, z >> 4));
    if (!c) return 0xf0;
    return c.light[idx3(x & 15, y, z & 15)];
  }
  getSky(x, y, z) { return this.getLightRaw(x, y, z) >> 4; }
  getBlockLight(x, y, z) { return this.getLightRaw(x, y, z) & 15; }
  setSky(x, y, z, v) {
    const c = this.chunks.get(ckey(x >> 4, z >> 4));
    if (!c || y < 0 || y >= CH) return;
    const i = idx3(x & 15, y, z & 15);
    c.light[i] = (c.light[i] & 0x0f) | (v << 4);
    this.markDirtyAt(x, y, z);
  }
  setBlockLight(x, y, z, v) {
    const c = this.chunks.get(ckey(x >> 4, z >> 4));
    if (!c || y < 0 || y >= CH) return;
    const i = idx3(x & 15, y, z & 15);
    c.light[i] = (c.light[i] & 0xf0) | v;
    this.markDirtyAt(x, y, z);
  }

  getMeta(x, y, z) { return this.meta.get(bkey(x, y, z)); }
  setMeta(x, y, z, m) {
    if (m == null) this.meta.delete(bkey(x, y, z));
    else this.meta.set(bkey(x, y, z), m);
  }

  getTopY(x, z) {
    for (let y = CH - 1; y > 0; y--) {
      const d = BLOCKS[this.getBlock(x, y, z)];
      if (d && (d.solid || d.liquid)) return y;
    }
    return 0;
  }

  markDirtyAt(x, y, z) {
    const cx = x >> 4, cz = z >> 4, lx = x & 15, lz = z & 15;
    const mark = (a, b2) => { const c = this.chunks.get(ckey(a, b2)); if (c) c.dirty = true; };
    mark(cx, cz);
    if (lx === 0) mark(cx - 1, cz);
    if (lx === 15) mark(cx + 1, cz);
    if (lz === 0) mark(cx, cz - 1);
    if (lz === 15) mark(cx, cz + 1);
  }

  // ---- block mutation ---------------------------------------------------------
  // opts: {noEdit, fromNet, noUpdate, silent, drop}
  setBlock(x, y, z, id, opts = {}) {
    if (y < 0 || y >= CH) return false;
    const c = this.chunks.get(ckey(x >> 4, z >> 4));
    if (!c) {
      // store as an edit so it applies when the chunk loads
      if (!opts.noEdit) this.recordEdit(x, y, z, id);
      return false;
    }
    const i = idx3(x & 15, y, z & 15);
    const old = c.blocks[i];
    if (old === id && !opts.force) return false;
    c.blocks[i] = id;
    if (!opts.noEdit) this.recordEdit(x, y, z, id);
    if (old !== id) this.setMeta(x, y, z, opts.meta ?? null);
    else if (opts.meta !== undefined) this.setMeta(x, y, z, opts.meta);

    // lighting
    this.relight(x, y, z, old, id);
    this.markDirtyAt(x, y, z);

    if (!opts.noUpdate) {
      this.notifyNeighbors(x, y, z);
      this.blockUpdated(x, y, z);
      if (this.game.redstone) this.game.redstone.onChange(this, x, y, z);
    }
    if (!opts.fromNet && this.game.mp) this.game.mp.sendBlock(this.dim, x, y, z, id, opts.meta);
    return true;
  }

  recordEdit(x, y, z, id) {
    const k = ckey(x >> 4, z >> 4);
    let m = this.edits.get(k);
    if (!m) { m = new Map(); this.edits.set(k, m); }
    m.set(idx3(x & 15, y, z & 15), id);
    if (this.game.markUnsaved) this.game.markUnsaved();
  }

  // ---- neighbor reactions -------------------------------------------------
  notifyNeighbors(x, y, z) {
    const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    for (const [dx, dy, dz] of dirs) this.blockUpdated(x + dx, y + dy, z + dz);
  }

  blockUpdated(x, y, z) {
    const id = this.getBlock(x, y, z);
    const d = BLOCKS[id];
    if (!d) return;
    if (d.liquid) this.scheduleTick(x, y, z, d.liquid === 1 ? 4 : 12);
    if (d.gravity) this.scheduleTick(x, y, z, 2);
    // support checks
    if ((d.cross || id === B.TORCH || id === B.RS_TORCH || id === B.WIRE || id === B.PLATE ||
      id === B.LEVER || id === B.BUTTON) && y > 0) {
      const below = this.getBlock(x, y - 1, z);
      if (!BLOCKS[below].solid) this.breakNaturally(x, y, z);
    }
    if (id === B.CACTUS) {
      const below = this.getBlock(x, y - 1, z);
      if (below !== B.SAND && below !== B.CACTUS) this.breakNaturally(x, y, z);
    }
    if (id === B.DOOR) {
      const m = this.getMeta(x, y, z) || {};
      if (m.upper) { if (this.getBlock(x, y - 1, z) !== B.DOOR) this.setBlock(x, y, z, B.AIR); }
      else if (this.getBlock(x, y + 1, z) !== B.DOOR && !m.solo) { /* placed pre-check */ }
      if (!m.upper && y > 0 && !BLOCKS[this.getBlock(x, y - 1, z)].solid) this.breakNaturally(x, y, z);
    }
    if (id === B.PORTAL) {
      // portal must neighbor obsidian or portal on at least 2 sides
      let support = 0;
      for (const [dx, dy] of [[0, 1], [0, -1]]) {
        const n = this.getBlock(x, y + dy, z);
        if (n === B.PORTAL || n === B.OBSIDIAN) support++;
      }
      const above = this.getBlock(x, y + 1, z), below2 = this.getBlock(x, y - 1, z);
      if (!((above === B.PORTAL || above === B.OBSIDIAN) && (below2 === B.PORTAL || below2 === B.OBSIDIAN)))
        this.setBlock(x, y, z, B.AIR);
    }
  }

  breakNaturally(x, y, z) {
    const id = this.getBlock(x, y, z);
    if (id === B.AIR) return;
    const meta = this.getMeta(x, y, z);
    this.setBlock(x, y, z, B.AIR);
    if (this.game.entities) {
      for (const d of getDrops(id, null, meta)) this.game.entities.dropItem(this, x + 0.5, y + 0.3, z + 0.5, d);
    }
  }

  // ---- scheduled / random ticks ---------------------------------------------
  scheduleTick(x, y, z, delay) {
    const k = bkey(x, y, z);
    const due = this.tickNum + delay;
    const cur = this.ticks.get(k);
    if (cur === undefined || due < cur) this.ticks.set(k, due);
  }

  tick(playerX, playerZ) {
    this.tickNum++;
    // scheduled
    if (this.ticks.size) {
      const due = [];
      for (const [k, t] of this.ticks) if (t <= this.tickNum) due.push(k);
      for (const k of due) {
        this.ticks.delete(k);
        const [x, y, z] = k.split(',').map(Number);
        this.runScheduled(x, y, z);
      }
    }
    // random ticks near player
    const pcx = Math.floor(playerX) >> 4, pcz = Math.floor(playerZ) >> 4;
    for (let dcx = -3; dcx <= 3; dcx++) for (let dcz = -3; dcz <= 3; dcz++) {
      const c = this.chunkAt(pcx + dcx, pcz + dcz);
      if (!c) continue;
      for (let n = 0; n < 2; n++) {
        const r = (Math.random() * CS * CS * CH) | 0;
        const id = c.blocks[r];
        if (!BLOCKS[id] || !BLOCKS[id].tick) continue;
        const x = c.cx * CS + (r & 15), y = r >> 8, z = c.cz * CS + ((r >> 4) & 15);
        this.randomTick(x, y, z, id);
      }
    }
  }

  runScheduled(x, y, z) {
    const id = this.getBlock(x, y, z);
    const d = BLOCKS[id];
    if (!d) return;
    if (d.gravity) this.tickFalling(x, y, z, id);
    else if (d.liquid === 1) this.tickWater(x, y, z);
    else if (d.liquid === 2) this.tickLava(x, y, z);
    else if (id === B.BUTTON) {
      const m = this.getMeta(x, y, z);
      if (m && m.pressed) { this.setMeta(x, y, z, { ...m, pressed: false }); this.game.redstone?.onChange(this, x, y, z); this.markDirtyAt(x, y, z); }
    } else if (id === B.RS_TORCH && this.game.redstone) this.game.redstone.tickTorch(this, x, y, z);
  }

  tickFalling(x, y, z, id) {
    let ny = y;
    while (ny > 0) {
      const below = this.getBlock(x, ny - 1, z);
      const bd = BLOCKS[below];
      if (below === B.AIR || bd.replaceable || bd.liquid) ny--;
      else break;
    }
    if (ny !== y) {
      this.setBlock(x, y, z, B.AIR);
      this.setBlock(x, ny, z, id);
    }
  }

  waterLevel(x, y, z) {
    const id = this.getBlock(x, y, z);
    if (id !== B.WATER) return 0;
    const m = this.getMeta(x, y, z);
    return m && m.lv !== undefined ? m.lv : 8; // generated/placed water = source
  }

  tickWater(x, y, z) {
    const m = this.getMeta(x, y, z);
    const isSource = !m || m.lv === undefined || m.lv === 8;
    let lv = isSource ? 8 : m.lv;
    if (!isSource) {
      // re-derive from suppliers
      let best = 0;
      if (this.getBlock(x, y + 1, z) === B.WATER) best = 7;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nl = this.waterLevel(x + dx, y, z + dz);
        best = Math.max(best, nl - 1);
      }
      if (best <= 0) { this.setBlock(x, y, z, B.AIR); return; }
      if (best !== lv) { this.setMeta(x, y, z, { lv: best }); lv = best; this.markDirtyAt(x, y, z); }
    }
    // lava contact
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0]]) {
      if (this.getBlock(x + dx, y + dy, z + dz) === B.LAVA) {
        const lm = this.getMeta(x + dx, y + dy, z + dz);
        const lavaSource = !lm || lm.lv === undefined;
        this.setBlock(x + dx, y + dy, z + dz, lavaSource ? B.OBSIDIAN : B.COBBLE);
        this.game.audio?.play('fizz', { pos: { x, y, z } });
      }
    }
    const flowTo = (tx, ty, tz, newLv) => {
      const tid = this.getBlock(tx, ty, tz);
      const td = BLOCKS[tid];
      if (tid === B.WATER) {
        const cur = this.waterLevel(tx, ty, tz);
        if (cur >= newLv) return;
        this.setMeta(tx, ty, tz, { lv: newLv });
        this.scheduleTick(tx, ty, tz, 4);
        this.markDirtyAt(tx, ty, tz);
        return;
      }
      if (tid === B.AIR || (td.replaceable && !td.liquid)) {
        this.setBlock(tx, ty, tz, B.WATER, { meta: { lv: newLv } });
      }
    };
    const below = this.getBlock(x, y - 1, z);
    if (y > 0 && (below === B.AIR || BLOCKS[below].replaceable || below === B.WATER)) {
      flowTo(x, y - 1, z, 7);
    } else if (lv > 1) {
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
        flowTo(x + dx, y, z + dz, lv - 1);
    }
  }

  tickLava(x, y, z) {
    const m = this.getMeta(x, y, z);
    const isSource = !m || m.lv === undefined;
    let lv = isSource ? 4 : m.lv;
    if (!isSource) {
      let best = 0;
      if (this.getBlock(x, y + 1, z) === B.LAVA) best = 3;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nid = this.getBlock(x + dx, y, z + dz);
        if (nid === B.LAVA) {
          const nm = this.getMeta(x + dx, y, z + dz);
          best = Math.max(best, (nm && nm.lv !== undefined ? nm.lv : 4) - 1);
        }
      }
      if (best <= 0) { this.setBlock(x, y, z, B.AIR); return; }
      if (best !== lv) { this.setMeta(x, y, z, { lv: best }); lv = best; }
    }
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]]) {
      if (this.getBlock(x + dx, y + dy, z + dz) === B.WATER) {
        this.setBlock(x, y, z, isSource ? B.OBSIDIAN : B.COBBLE);
        return;
      }
    }
    const flowTo = (tx, ty, tz, newLv) => {
      const tid = this.getBlock(tx, ty, tz);
      if (tid === B.WATER) { this.setBlock(tx, ty, tz, B.STONE); return; }
      const td = BLOCKS[tid];
      if (tid === B.AIR || (td.replaceable && !td.liquid)) {
        this.setBlock(tx, ty, tz, B.LAVA, { meta: { lv: newLv } });
      }
    };
    const below = this.getBlock(x, y - 1, z);
    if (y > 0 && (below === B.AIR || BLOCKS[below].replaceable)) flowTo(x, y - 1, z, 3);
    else if (lv > 1) {
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) flowTo(x + dx, y, z + dz, lv - 1);
    }
  }

  randomTick(x, y, z, id) {
    if (id === B.GRASS) {
      const above = this.getBlock(x, y + 1, z);
      if (BLOCKS[above].opaque) { this.setBlock(x, y, z, B.DIRT); return; }
      // spread
      const dx = ((Math.random() * 3) | 0) - 1, dz = ((Math.random() * 3) | 0) - 1, dy = ((Math.random() * 3) | 0) - 1;
      if (this.getBlock(x + dx, y + dy, z + dz) === B.DIRT && !BLOCKS[this.getBlock(x + dx, y + dy + 1, z + dz)].opaque)
        this.setBlock(x + dx, y + dy, z + dz, B.GRASS);
    } else if (id === B.SAPLING) {
      if (Math.random() < 0.15 && this.getSky(x, y, z) > 8) this.growTree(x, y, z);
    } else if (id === B.WHEAT) {
      const m = this.getMeta(x, y, z) || { stage: 0 };
      if (m.stage < 7) { this.setMeta(x, y, z, { stage: m.stage + 1 }); this.markDirtyAt(x, y, z); }
    } else if (id === B.CACTUS) {
      let h = 1, by = y;
      while (this.getBlock(x, by - 1, z) === B.CACTUS) { h++; by--; }
      if (h < 3 && this.getBlock(x, y + 1, z) === B.AIR && Math.random() < 0.25)
        this.setBlock(x, y + 1, z, B.CACTUS);
    } else if (id === B.SPAWNER) {
      this.game.entities?.spawnerTick(this, x, y, z);
    }
  }

  growTree(x, y, z) {
    this.setBlock(x, y, z, B.AIR);
    const th = 4 + ((Math.random() * 2) | 0);
    for (let i = 0; i < th; i++) this.setBlock(x, y + i, z, B.LOG);
    for (let dy = th - 2; dy <= th + 1; dy++) {
      const r = dy >= th ? 1 : 2;
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        if (dx === 0 && dz === 0 && dy < th) continue;
        if (this.getBlock(x + dx, y + dy, z + dz) === B.AIR)
          this.setBlock(x + dx, y + dy, z + dz, B.LEAVES);
      }
    }
  }

  // ---- chunk lifecycle ---------------------------------------------------------
  update(px, pz, dist) {
    const pcx = Math.floor(px) >> 4, pcz = Math.floor(pz) >> 4;
    // queue missing chunks by distance
    if (this.genQueue.length === 0) {
      for (let r = 0; r <= dist; r++) {
        for (let dcx = -r; dcx <= r; dcx++) for (let dcz = -r; dcz <= r; dcz++) {
          if (Math.max(Math.abs(dcx), Math.abs(dcz)) !== r) continue;
          const cx = pcx + dcx, cz = pcz + dcz;
          if (!this.chunks.has(ckey(cx, cz))) this.genQueue.push([cx, cz]);
        }
      }
    }
    // generate a couple per frame
    let budget = 2;
    while (budget > 0 && this.genQueue.length) {
      const [cx, cz] = this.genQueue.shift();
      if (this.chunks.has(ckey(cx, cz))) continue;
      if (Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz)) > dist) continue;
      this.loadChunk(cx, cz);
      budget--;
    }
    // unload far chunks
    if ((this.tickNum & 31) === 0) {
      for (const [k, c] of this.chunks) {
        if (Math.max(Math.abs(c.cx - pcx), Math.abs(c.cz - pcz)) > dist + 2) {
          this.game.mesher?.disposeChunk(c);
          this.chunks.delete(k);
        }
      }
    }
  }

  loadChunk(cx, cz) {
    const blocks = this.gen.generateChunk(cx, cz);
    if (this.gen.lastVillageSpawn) {
      this.pendingVillagers.push(this.gen.lastVillageSpawn);
      this.gen.lastVillageSpawn = null;
    }
    // apply saved edits
    const em = this.edits.get(ckey(cx, cz));
    if (em) for (const [i, id] of em) blocks[i] = id;
    const c = new Chunk(cx, cz, blocks);
    this.chunks.set(ckey(cx, cz), c);
    this.initLight(c);
    // neighbors must remesh (face culling at borders) — and re-spread light into us
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = this.chunkAt(cx + dx, cz + dz);
      if (n) { n.dirty = true; this.seedBorderLight(n, c); }
    }
    return c;
  }

  // ---- lighting ------------------------------------------------------------
  initLight(c) {
    const skyQ = [], blkQ = [];
    const baseX = c.cx * CS, baseZ = c.cz * CS;
    // skylight columns
    for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) {
      let y = CH - 1;
      for (; y >= 0; y--) {
        const id = c.blocks[idx3(lx, y, lz)];
        const d = BLOCKS[id];
        if (d.opaque || d.liquid) break;
        c.light[idx3(lx, y, lz)] |= 0xf0;
        skyQ.push(baseX + lx, y, baseZ + lz, 15);
      }
      // water columns dim gradually
      let lvl = 13;
      for (; y >= 0 && lvl > 0; y--) {
        const id = c.blocks[idx3(lx, y, lz)];
        const d = BLOCKS[id];
        if (d.opaque) break;
        if (!d.liquid && !d.opaque) break;
        c.light[idx3(lx, y, lz)] |= (lvl << 4);
        skyQ.push(baseX + lx, y, baseZ + lz, lvl);
        lvl -= 2;
      }
    }
    // emitters
    for (let i = 0; i < c.blocks.length; i++) {
      const d = BLOCKS[c.blocks[i]];
      if (d && d.light > 0) {
        c.light[i] = (c.light[i] & 0xf0) | d.light;
        blkQ.push(baseX + (i & 15), i >> 8, baseZ + ((i >> 4) & 15), d.light);
      }
    }
    this.floodAdd(skyQ, true);
    this.floodAdd(blkQ, false);
    c.lit = true;
    c.dirty = true;
  }

  seedBorderLight(from, into) {
    // push light from chunk `from` across the border into newly loaded chunk
    const q = [], qb = [];
    const dx = into.cx - from.cx, dz = into.cz - from.cz;
    const baseX = from.cx * CS, baseZ = from.cz * CS;
    const lx0 = dx === 1 ? 15 : 0, lz0 = dz === 1 ? 15 : 0;
    for (let y = 0; y < CH; y++) {
      for (let t = 0; t < CS; t++) {
        const lx = dx !== 0 ? lx0 : t, lz = dz !== 0 ? lz0 : t;
        const l = from.light[idx3(lx, y, lz)];
        const s = l >> 4, b2 = l & 15;
        if (s > 1) q.push(baseX + lx, y, baseZ + lz, s);
        if (b2 > 1) qb.push(baseX + lx, y, baseZ + lz, b2);
      }
    }
    this.floodAdd(q, true);
    this.floodAdd(qb, false);
  }

  floodAdd(queue, isSky) {
    // queue: flat [x,y,z,level,...]
    let head = 0;
    const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    while (head < queue.length) {
      const x = queue[head++], y = queue[head++], z = queue[head++], lvl = queue[head++];
      for (const [dx, dy, dz] of DIRS) {
        const nx = x + dx, ny = y + dy, nz = z + dz;
        if (ny < 0 || ny >= CH) continue;
        const c = this.chunks.get(ckey(nx >> 4, nz >> 4));
        if (!c) continue;
        const i = idx3(nx & 15, ny, nz & 15);
        const id = c.blocks[i];
        const d = BLOCKS[id];
        if (d.opaque) continue;
        let nl = lvl - 1;
        if (isSky && dy === -1 && lvl === 15 && !d.liquid) nl = 15; // sunlight falls
        if (d.liquid) nl = Math.max(0, lvl - 3);
        const cur = isSky ? (c.light[i] >> 4) : (c.light[i] & 15);
        if (cur >= nl || nl <= 0) continue;
        c.light[i] = isSky ? ((c.light[i] & 0x0f) | (nl << 4)) : ((c.light[i] & 0xf0) | nl);
        c.dirty = true;
        queue.push(nx, ny, nz, nl);
      }
    }
  }

  floodRemove(x, y, z, oldLvl, isSky) {
    const removeQ = [x, y, z, oldLvl];
    const addQ = [];
    let head = 0;
    const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    while (head < removeQ.length) {
      const qx = removeQ[head++], qy = removeQ[head++], qz = removeQ[head++], lvl = removeQ[head++];
      for (const [dx, dy, dz] of DIRS) {
        const nx = qx + dx, ny = qy + dy, nz = qz + dz;
        if (ny < 0 || ny >= CH) continue;
        const c = this.chunks.get(ckey(nx >> 4, nz >> 4));
        if (!c) continue;
        const i = idx3(nx & 15, ny, nz & 15);
        const cur = isSky ? (c.light[i] >> 4) : (c.light[i] & 15);
        if (cur === 0) continue;
        const fed = isSky && dy === -1 && lvl === 15; // direct sunlight column
        if (cur < lvl || fed) {
          // this cell was lit by us — clear & continue removal
          c.light[i] = isSky ? (c.light[i] & 0x0f) : (c.light[i] & 0xf0);
          c.dirty = true;
          removeQ.push(nx, ny, nz, fed ? 15 : cur);
        } else {
          // boundary light that can re-fill the area
          addQ.push(nx, ny, nz, cur);
        }
      }
    }
    this.floodAdd(addQ, isSky);
  }

  relight(x, y, z, oldId, newId) {
    const oldD = BLOCKS[oldId], newD = BLOCKS[newId];
    const c = this.chunks.get(ckey(x >> 4, z >> 4));
    if (!c || !c.lit) return;
    const i = idx3(x & 15, y, z & 15);

    // --- block light channel ---
    const oldBl = c.light[i] & 15;
    if (oldBl > 0) {
      c.light[i] &= 0xf0;
      this.floodRemove(x, y, z, oldBl, false);
    }
    if (newD.light > 0) {
      c.light[i] = (c.light[i] & 0xf0) | newD.light;
      this.floodAdd([x, y, z, newD.light], false);
    } else if (!newD.opaque) {
      // re-pull from neighbors
      const q = [];
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const l = this.getBlockLight(x + dx, y + dy, z + dz);
        if (l > 1) q.push(x + dx, y + dy, z + dz, l);
      }
      this.floodAdd(q, false);
    }

    // --- sky light channel ---
    const oldSky = c.light[i] >> 4;
    if (newD.opaque || newD.liquid) {
      if (oldSky > 0) {
        c.light[i] &= 0x0f;
        this.floodRemove(x, y, z, oldSky, true);
      }
    } else {
      // became transparent: pull from neighbors + direct sun
      const q = [];
      if (y === CH - 1 || (this.getSky(x, y + 1, z) === 15)) {
        // restore falling sunlight down this column
        let yy = y;
        while (yy >= 0) {
          const id = this.getBlock(x, yy, z);
          const d = BLOCKS[id];
          if (d.opaque || d.liquid) break;
          const cc = this.chunks.get(ckey(x >> 4, z >> 4));
          cc.light[idx3(x & 15, yy, z & 15)] |= 0xf0;
          q.push(x, yy, z, 15);
          yy--;
        }
      }
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const l = this.getSky(x + dx, y + dy, z + dz);
        if (l > 1) q.push(x + dx, y + dy, z + dz, l);
      }
      this.floodAdd(q, true);
    }
  }

  // ---- persistence -----------------------------------------------------------
  serialize() {
    const edits = {};
    for (const [k, m] of this.edits) edits[k] = Object.fromEntries(m);
    const meta = Object.fromEntries(this.meta);
    return { edits, meta };
  }

  deserialize(data) {
    if (!data) return;
    this.edits.clear();
    for (const k in (data.edits || {})) {
      const m = new Map();
      for (const i in data.edits[k]) m.set(Number(i), data.edits[k][i]);
      this.edits.set(k, m);
    }
    this.meta = new Map(Object.entries(data.meta || {}));
  }
}
