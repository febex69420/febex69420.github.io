// worldgen.js — deterministic chunk generation: biomes, terrain, caves, ores,
// trees, villages, dungeons; separate Nether generator.
import { CS, CH, SEA, idx3, mulberry32, hash2, rand2 } from './util.js';
import { Simplex } from './noise.js';
import { B } from './blocks.js';

export const BIOMES = {
  OCEAN: 0, BEACH: 1, PLAINS: 2, FOREST: 3, BIRCH: 4,
  DESERT: 5, SNOWY: 6, MOUNTAINS: 7, SWAMP: 8,
};
export const BIOME_NAMES = ['Ocean', 'Beach', 'Plains', 'Forest', 'Birch Forest', 'Desert', 'Snowy Tundra', 'Mountains', 'Swamp'];

export class WorldGen {
  constructor(seed, dim = 0) {
    this.seed = seed >>> 0;
    this.dim = dim;
    this.nHeight = new Simplex(seed);
    this.nDetail = new Simplex(seed ^ 0x9e3779b9);
    this.nRidge = new Simplex(seed ^ 0x51ab3c7);
    this.nTemp = new Simplex(seed ^ 0x77777);
    this.nHum = new Simplex(seed ^ 0x31415);
    this.nCaveA = new Simplex(seed ^ 0xabcdef);
    this.nCaveB = new Simplex(seed ^ 0x13579b);
    this.nSwamp = new Simplex(seed ^ 0x24680);
  }

  // ---- climate / biome ----------------------------------------------------
  climate(x, z) {
    const t = this.nTemp.fbm2(x * 0.0016, z * 0.0016, 3) * 0.5 + 0.5;
    const h = this.nHum.fbm2(x * 0.0019 + 100, z * 0.0019 - 50, 3) * 0.5 + 0.5;
    return { t, h };
  }

  biomeAt(x, z, height) {
    if (height < SEA - 2) return BIOMES.OCEAN;
    if (height <= SEA + 1) return BIOMES.BEACH;
    if (height > SEA + 28) return BIOMES.MOUNTAINS;
    const { t, h } = this.climate(x, z);
    if (t < 0.32) return BIOMES.SNOWY;
    if (t > 0.68 && h < 0.4) return BIOMES.DESERT;
    if (h > 0.62 && t > 0.45 && height < SEA + 6) return BIOMES.SWAMP;
    if (h > 0.55) return t > 0.5 ? BIOMES.FOREST : BIOMES.BIRCH;
    return BIOMES.PLAINS;
  }

  heightAt(x, z) {
    const cont = this.nHeight.fbm2(x * 0.0035, z * 0.0035, 4);            // -1..1 continents
    const detail = this.nDetail.fbm2(x * 0.015, z * 0.015, 3) * 0.3;
    const ridge = this.nRidge.ridge2(x * 0.004 + 500, z * 0.004 - 300, 4); // 0..~1 mountains
    let h = SEA + 4 + cont * 22 + detail * 8;
    const mountainMask = Math.max(0, cont * 0.5 + 0.5 - 0.45) * 2;
    h += Math.max(0, ridge - 0.55) * 90 * Math.min(1, mountainMask);
    return Math.max(4, Math.min(CH - 10, h | 0));
  }

  // ---- chunk generation ---------------------------------------------------
  generateChunk(cx, cz) {
    const blocks = new Uint8Array(CS * CS * CH);
    if (this.dim === 1) { this.genNether(cx, cz, blocks); return blocks; }

    const heights = new Int16Array(CS * CS);
    const biomes = new Uint8Array(CS * CS);
    for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) {
      const wx = cx * CS + lx, wz = cz * CS + lz;
      const h = this.heightAt(wx, wz);
      heights[lz * CS + lx] = h;
      biomes[lz * CS + lx] = this.biomeAt(wx, wz, h);
    }

    for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) {
      const wx = cx * CS + lx, wz = cz * CS + lz;
      const h = heights[lz * CS + lx], bio = biomes[lz * CS + lx];
      const colRng = mulberry32(hash2(wx, wz, this.seed));
      for (let y = 0; y < CH; y++) {
        let id = B.AIR;
        if (y === 0) id = B.BEDROCK;
        else if (y <= 2 && colRng() < 0.7) id = B.BEDROCK;
        else if (y < h - 3) id = B.STONE;
        else if (y < h) id = (bio === BIOMES.DESERT || bio === BIOMES.BEACH) ? B.SAND : B.DIRT;
        else if (y === h) {
          if (bio === BIOMES.DESERT || bio === BIOMES.BEACH) id = B.SAND;
          else if (bio === BIOMES.OCEAN) id = y > SEA - 8 ? B.SAND : B.GRAVEL;
          else if (bio === BIOMES.MOUNTAINS && y > SEA + 40) id = y > SEA + 52 ? B.SNOW_BLOCK : B.STONE;
          else id = B.GRASS;
        } else if (y <= SEA) {
          id = (bio === BIOMES.SNOWY && y === SEA) ? B.ICE : B.WATER;
        }

        // caves
        if (id === B.STONE || id === B.DIRT || (id === B.GRASS && y > SEA + 1) || id === B.SAND && y < h) {
          if (this.isCave(wx, y, wz)) {
            id = y < 11 ? B.LAVA : B.AIR;
          }
        }
        blocks[idx3(lx, y, lz)] = id;
      }
      // ores in this column
      this.placeOresColumn(blocks, lx, lz, wx, wz, h);
    }

    this.decorate(cx, cz, blocks, heights, biomes);
    this.structures(cx, cz, blocks, heights, biomes);
    return blocks;
  }

  isCave(x, y, z) {
    if (y <= 4 || y > 90) return false;
    const a = this.nCaveA.noise3(x * 0.018, y * 0.026, z * 0.018);
    const b = this.nCaveB.noise3(x * 0.018 + 300, y * 0.026, z * 0.018 - 200);
    // intersecting noise bands → winding tunnels; plus big caverns deep down
    const tunnel = Math.abs(a) < 0.085 && Math.abs(b) < 0.085;
    const cavern = y < 38 && (a + b) > 0.92;
    return tunnel || cavern;
  }

  placeOresColumn(blocks, lx, lz, wx, wz, h) {
    const rng = mulberry32(hash2(wx, wz, this.seed ^ 0xfeed));
    const tryOre = (ore, chance, minY, maxY) => {
      if (rng() < chance) {
        const y = minY + ((rng() * (maxY - minY)) | 0);
        if (y < h - 3 && blocks[idx3(lx, y, lz)] === B.STONE) blocks[idx3(lx, y, lz)] = ore;
      }
    };
    tryOre(B.COAL_ORE, 0.20, 8, Math.min(h - 4, 100));
    tryOre(B.COAL_ORE, 0.20, 8, Math.min(h - 4, 100));
    tryOre(B.IRON_ORE, 0.14, 4, 60);
    tryOre(B.IRON_ORE, 0.10, 4, 40);
    tryOre(B.GOLD_ORE, 0.05, 4, 30);
    tryOre(B.REDSTONE_ORE, 0.07, 4, 16);
    tryOre(B.DIAMOND_ORE, 0.035, 2, 14);
  }

  // ---- decorations ---------------------------------------------------------
  decorate(cx, cz, blocks, heights, biomes) {
    const rng = mulberry32(hash2(cx, cz, this.seed ^ 0xdec0));
    const set = (x, y, z, id, soft) => {
      if (x < 0 || x >= CS || z < 0 || z >= CS || y < 0 || y >= CH) return;
      const i = idx3(x, y, z);
      if (soft && blocks[i] !== B.AIR) return;
      blocks[i] = id;
    };
    const topAt = (x, z) => heights[z * CS + x];

    const treeCount = { [BIOMES.FOREST]: 7, [BIOMES.BIRCH]: 6, [BIOMES.PLAINS]: 1, [BIOMES.SWAMP]: 3, [BIOMES.SNOWY]: 1, [BIOMES.MOUNTAINS]: 1 };
    // trees
    const nTrees = 8;
    for (let i = 0; i < nTrees; i++) {
      const x = 2 + ((rng() * 12) | 0), z = 2 + ((rng() * 12) | 0);
      const bio = biomes[z * CS + x], h = topAt(x, z);
      const cnt = treeCount[bio] ?? 0;
      if (rng() * 8 >= cnt) continue;
      if (blocks[idx3(x, h, z)] !== B.GRASS) continue;
      const birch = bio === BIOMES.BIRCH && rng() < 0.8;
      const log = birch ? B.BIRCH_LOG : B.LOG, leaf = birch ? B.BIRCH_LEAVES : B.LEAVES;
      const th = 4 + ((rng() * 3) | 0);
      for (let y = 1; y <= th; y++) set(x, h + y, z, log);
      for (let dy = th - 2; dy <= th + 1; dy++) {
        const r = dy >= th ? 1 : 2;
        for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
          if (dx === 0 && dz === 0 && dy <= th) continue;
          if (Math.abs(dx) === r && Math.abs(dz) === r && rng() < 0.5) continue;
          set(x + dx, h + dy, z + dz, leaf, true);
        }
      }
      set(x, h + th + 1, z, leaf, true);
    }

    // cactus in desert
    for (let i = 0; i < 3; i++) {
      const x = 1 + ((rng() * 14) | 0), z = 1 + ((rng() * 14) | 0);
      if (biomes[z * CS + x] !== BIOMES.DESERT || rng() > 0.4) continue;
      const h = topAt(x, z);
      if (blocks[idx3(x, h, z)] !== B.SAND) continue;
      const ch2 = 1 + ((rng() * 3) | 0);
      for (let y = 1; y <= ch2; y++) set(x, h + y, z, B.CACTUS, true);
    }
    // dead bushes
    for (let i = 0; i < 2; i++) {
      const x = (rng() * 16) | 0, z = (rng() * 16) | 0;
      if (biomes[z * CS + x] !== BIOMES.DESERT || rng() > 0.4) continue;
      const h = topAt(x, z);
      if (blocks[idx3(x, h, z)] === B.SAND) set(x, h + 1, z, B.DEADBUSH, true);
    }

    // grass, flowers, pumpkins
    for (let i = 0; i < 24; i++) {
      const x = (rng() * 16) | 0, z = (rng() * 16) | 0;
      const bio = biomes[z * CS + x], h = topAt(x, z);
      if (blocks[idx3(x, h, z)] !== B.GRASS) continue;
      const r = rng();
      if (bio === BIOMES.PLAINS || bio === BIOMES.FOREST || bio === BIOMES.BIRCH || bio === BIOMES.SWAMP) {
        if (r < 0.55) set(x, h + 1, z, B.TALLGRASS, true);
        else if (r < 0.62) set(x, h + 1, z, B.FLOWER_Y, true);
        else if (r < 0.68) set(x, h + 1, z, B.FLOWER_R, true);
        else if (r < 0.695 && bio === BIOMES.PLAINS) set(x, h + 1, z, B.PUMPKIN, true);
      }
    }

    // mushrooms in caves
    for (let i = 0; i < 6; i++) {
      const x = (rng() * 16) | 0, z = (rng() * 16) | 0, y = 8 + ((rng() * 40) | 0);
      if (blocks[idx3(x, y, z)] === B.AIR && y > 0 && blocks[idx3(x, y - 1, z)] === B.STONE && rng() < 0.3)
        set(x, y, z, rng() < 0.5 ? B.MUSHROOM_B : B.MUSHROOM_R, true);
    }

    // snow cover
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const bio = biomes[z * CS + x];
      if (bio !== BIOMES.SNOWY) continue;
      const h = topAt(x, z);
      if (blocks[idx3(x, h, z)] === B.GRASS && blocks[idx3(x, h + 1, z)] === B.AIR && h + 1 < CH) {
        // grass tinted by snow side texture (re-use snow block top layer look via grass under snow_block thin: use full snow blocks sparsely)
        if (rand2(cx * CS + x, cz * CS + z, this.seed ^ 0x5150) < 0.35)
          blocks[idx3(x, h + 1, z)] = B.SNOW_BLOCK;
      }
    }
  }

  // ---- structures ----------------------------------------------------------
  // Villages live on a sparse 8x8-chunk grid; a chunk builds its own house if
  // it falls inside a village footprint. Dungeons are per-chunk underground.
  villageCenter(rx, rz) {
    const h = hash2(rx, rz, this.seed ^ 0xa11a6e);
    if ((h & 7) !== 0) return null; // 1 in 8 regions has a village
    const cx = rx * 8 + 2 + ((h >>> 4) % 4);
    const cz = rz * 8 + 2 + ((h >>> 8) % 4);
    return { cx, cz };
  }

  structures(cx, cz, blocks, heights, biomes) {
    // village house: chunk is within radius 2 chunks of a village center
    const rx = Math.floor(cx / 8), rz = Math.floor(cz / 8);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const vc = this.villageCenter(rx + dx, rz + dz);
      if (!vc) continue;
      const dist = Math.max(Math.abs(cx - vc.cx), Math.abs(cz - vc.cz));
      if (dist > 1) continue;
      const h = hash2(cx, cz, this.seed ^ 0xb0b0);
      if ((h & 3) === 3 && dist > 0) continue; // some chunks skipped
      this.buildHouse(cx, cz, blocks, heights, biomes, h);
    }
    // dungeon
    const dh = hash2(cx, cz, this.seed ^ 0xd406e0);
    if ((dh & 31) === 0) this.buildDungeon(cx, cz, blocks, dh);
  }

  buildHouse(cx, cz, blocks, heights, biomes, h) {
    const ox = 3 + (h >>> 6) % 5, oz = 3 + (h >>> 9) % 5; // origin inside chunk
    const w = 6, d = 6;
    // flatten check: average height, require land biome
    let sum = 0;
    for (let x = ox; x < ox + w; x++) for (let z = oz; z < oz + d; z++) sum += heights[z * CS + x];
    const gy = Math.round(sum / (w * d));
    if (gy <= SEA || gy > SEA + 30) return;
    const bio = biomes[oz * CS + ox];
    if (bio === BIOMES.OCEAN || bio === BIOMES.SWAMP) return;
    const wall = bio === BIOMES.DESERT ? B.SANDSTONE : B.PLANKS;
    const floor = bio === BIOMES.DESERT ? B.SANDSTONE : B.COBBLE;
    const set = (x, y, z, id) => { if (y > 0 && y < CH) blocks[idx3(x, y, z)] = id; };
    for (let x = ox; x < ox + w; x++) for (let z = oz; z < oz + d; z++) {
      // foundation down to terrain
      for (let y = gy; y > gy - 4; y--) set(x, y, z, floor);
      for (let y = gy + 1; y <= gy + 4; y++) {
        const edge = x === ox || x === ox + w - 1 || z === oz || z === oz + d - 1;
        set(x, y, z, edge && y <= gy + 3 ? wall : B.AIR);
      }
      set(x, gy + 4, z, B.PLANKS); // roof
    }
    // corners as logs
    for (const [x, z] of [[ox, oz], [ox + w - 1, oz], [ox, oz + d - 1], [ox + w - 1, oz + d - 1]])
      for (let y = gy + 1; y <= gy + 3; y++) set(x, y, z, B.LOG);
    // doorway (south side center)
    const dxx = ox + (w >> 1);
    set(dxx, gy + 1, oz, B.AIR); set(dxx, gy + 2, oz, B.AIR);
    // windows
    set(ox, gy + 2, oz + (d >> 1), B.GLASS); set(ox + w - 1, gy + 2, oz + (d >> 1), B.GLASS);
    // torch inside
    set(ox + 1, gy + 2, oz + 1, B.TORCH);
    // mark villager spawn: stored as special block? use spawner-free approach:
    // entities.js scans newly generated village chunks via the VILLAGER_MARK.
    blocks[idx3(ox + 2, gy + 1, oz + 2)] = B.AIR;
    this.lastVillageSpawn = { x: cx * CS + ox + 2, y: gy + 1, z: cz * CS + oz + 2 };
  }

  buildDungeon(cx, cz, blocks, h) {
    const ox = 3 + (h >>> 5) % 7, oz = 3 + (h >>> 8) % 7;
    const oy = 10 + (h >>> 11) % 30;
    const rng = mulberry32(h);
    for (let x = ox - 1; x <= ox + 5; x++) for (let z = oz - 1; z <= oz + 5; z++) for (let y = oy - 1; y <= oy + 4; y++) {
      if (x < 0 || x >= CS || z < 0 || z >= CS || y < 1 || y >= CH) continue;
      const edge = x === ox - 1 || x === ox + 5 || z === oz - 1 || z === oz + 5 || y === oy - 1 || y === oy + 4;
      blocks[idx3(x, y, z)] = edge ? (rng() < 0.25 ? B.MOSSY : B.COBBLE) : B.AIR;
    }
    blocks[idx3(ox + 2, oy, oz + 2)] = B.SPAWNER;
    blocks[idx3(ox, oy, oz)] = B.CHEST; // loot chest; contents filled on first open
  }

  // ---- Nether ---------------------------------------------------------------
  genNether(cx, cz, blocks) {
    const LAVA_Y = 32, CEIL = 100;
    for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) {
      const wx = cx * CS + lx, wz = cz * CS + lz;
      const colRng = mulberry32(hash2(wx, wz, this.seed ^ 0x6e7));
      for (let y = 0; y < CH; y++) {
        let id = B.AIR;
        if (y === 0 || y >= CH - 1) id = B.BEDROCK;
        else if (y <= 3 && colRng() < 0.6) id = B.BEDROCK;
        else if (y >= CH - 4 && colRng() < 0.6) id = B.BEDROCK;
        else if (y < CEIL) {
          const n = this.nCaveA.noise3(wx * 0.022, y * 0.034, wz * 0.022)
            + 0.45 * this.nCaveB.noise3(wx * 0.05, y * 0.07, wz * 0.05);
          const openness = (y > LAVA_Y - 4 && y < 80) ? 0.25 : -0.15;
          if (n < openness) {
            id = y <= LAVA_Y ? B.LAVA : B.AIR;
          } else {
            id = B.NETHERRACK;
            if (colRng() < 0.02 && y > LAVA_Y) id = B.SOULSAND;
          }
        } else {
          id = B.NETHERRACK;
        }
        blocks[idx3(lx, y, lz)] = id;
      }
    }
    // glowstone clusters under ceilings
    const rng = mulberry32(hash2(cx, cz, this.seed ^ 0x610));
    for (let i = 0; i < 6; i++) {
      const x = 1 + ((rng() * 14) | 0), z = 1 + ((rng() * 14) | 0);
      for (let y = 90; y > 40; y--) {
        if (blocks[idx3(x, y, z)] === B.NETHERRACK && blocks[idx3(x, y - 1, z)] === B.AIR) {
          if (rng() < 0.35) {
            blocks[idx3(x, y - 1, z)] = B.GLOWSTONE;
            if (rng() < 0.5 && y > 42) blocks[idx3(x, y - 2, z)] = B.GLOWSTONE;
          }
          break;
        }
      }
    }
  }

  // find a safe spawn near 0,0
  findSpawn() {
    for (let r = 0; r < 64; r += 4) {
      for (const [x, z] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r]]) {
        const h = this.heightAt(x, z);
        if (h > SEA && this.biomeAt(x, z, h) !== BIOMES.OCEAN) return { x: x + 0.5, y: h + 2, z: z + 0.5 };
      }
    }
    return { x: 0.5, y: this.heightAt(0, 0) + 2, z: 0.5 };
  }
}
