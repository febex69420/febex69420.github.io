// cityplan.js — pure, deterministic city layout (no THREE) so it is unit-testable.
// city.js consumes a plan and turns it into instanced meshes.
import { RNG, strSeed, fbm2 } from '../core/util.js';

// ---- world dimensions ----
export const BLOCK = 56;   // block edge (building lot)
export const ROAD = 18;    // road width between blocks
export const CELL = BLOCK + ROAD;
export const GRID = 22;    // blocks per side
export const REGION = 4;   // blocks per region chunk
export const HALF = (GRID * CELL) / 2;

export const DISTRICT = { DOWNTOWN: 0, MIDTOWN: 1, RESIDENTIAL: 2, COMMERCIAL: 3, INDUSTRIAL: 4, PARK: 5, BEACH: 6, WATER: 7, STADIUM: 8, PLAZA: 9 };
export const DISTRICT_NAME = ['Downtown', 'Midtown', 'Residential', 'Commercial', 'Industrial', 'Park', 'Beach', 'Waterfront', 'Stadium', 'Central Plaza'];

// World X/Z for a grid cell center.
export function cellCenter(gx, gz) { return { x: gx * CELL - HALF + CELL / 2, z: gz * CELL - HALF + CELL / 2 }; }

export function generateCityPlan(seedStr = 'Lumera') {
  const seed = strSeed(String(seedStr));
  const rng = new RNG(seed);
  const center = (GRID - 1) / 2;
  const riverCol = Math.floor(GRID * 0.62);
  const shoreRow = 2;          // rows below this are sea
  const stadiumBlock = { gx: Math.floor(GRID * 0.2), gz: Math.floor(GRID * 0.78) };

  const blocks = [];
  let nextId = 1;

  for (let gz = 0; gz < GRID; gz++) {
    for (let gx = 0; gx < GRID; gx++) {
      const { x, z } = cellCenter(gx, gz);
      const dxc = (gx - center) / center, dzc = (gz - center) / center;
      const r = Math.hypot(dxc, dzc);
      const n = fbm2(gx * 0.35, gz * 0.35, { seed, octaves: 3 });

      let district;
      if (gz < shoreRow) district = DISTRICT.WATER;
      else if (gz === shoreRow) district = DISTRICT.BEACH;
      else if (gx === riverCol) district = DISTRICT.WATER;
      else if (gx === stadiumBlock.gx && gz === stadiumBlock.gz) district = DISTRICT.STADIUM;
      else if (gx === Math.round(center) && gz === Math.round(center)) district = DISTRICT.PLAZA;
      else if (r < 0.20) district = DISTRICT.DOWNTOWN;
      else if (r < 0.42) district = (n > 0.62 ? DISTRICT.PARK : DISTRICT.MIDTOWN);
      else {
        if (gx > GRID * 0.72 && gz < GRID * 0.4 && n > 0.4) district = DISTRICT.INDUSTRIAL;
        else if (n > 0.72) district = DISTRICT.PARK;
        else if (n < 0.22) district = DISTRICT.COMMERCIAL;
        else district = DISTRICT.RESIDENTIAL;
      }

      const block = { gx, gz, x, z, district, buildings: [], props: [] };
      buildBlock(block, rng, () => nextId++);
      blocks.push(block);
    }
  }

  const bridges = [];
  for (let gz = shoreRow + 1; gz < GRID; gz += 5) {
    const a = cellCenter(riverCol, gz);
    bridges.push({ x: a.x, z: a.z, dir: 'z' });
  }

  const landmarks = [
    { name: 'Central Plaza', ...cellCenter(Math.round(center), Math.round(center)) },
    { name: 'Lumera Tower', ...cellCenter(Math.round(center), Math.round(center) - 2) },
    { name: 'Grand Stadium', ...cellCenter(stadiumBlock.gx, stadiumBlock.gz) },
    { name: 'Sunset Beach', ...cellCenter(Math.round(GRID / 2), shoreRow) },
    { name: 'Riverside Bridge', ...cellCenter(riverCol, Math.round(center)) },
    { name: 'Industrial Docks', ...cellCenter(Math.round(GRID * 0.8), Math.round(GRID * 0.25)) },
  ];

  return { seed: seedStr, GRID, BLOCK, ROAD, CELL, HALF, worldSize: GRID * CELL, riverCol, shoreRow, blocks, bridges, landmarks, stadiumBlock };
}

function buildBlock(block, rng, nextId) {
  const { x, z, district } = block;
  const half = BLOCK / 2;
  const matCount = 6;
  const add = (type, bx, bz, w, d, h, opt = {}) => {
    block.buildings.push({
      id: nextId(), type, x: bx, z: bz, w, d, h,
      mat: opt.mat != null ? opt.mat : rng.int(0, matCount - 1),
      tint: 0.85 + rng.float(0, 0.3),
      stepped: !!opt.stepped, topH: opt.topH || 0, topW: opt.topW || 0,
      district,
    });
  };
  const lamp = (lx, lz) => block.props.push({ type: 'lamp', x: lx, z: lz });
  const tree = (tx, tz, s) => block.props.push({ type: 'tree', x: tx, z: tz, s: s || (3 + rng.float(0, 3)) });

  switch (district) {
    case DISTRICT.DOWNTOWN: {
      const w = BLOCK * (0.6 + rng.float(0, 0.18)), d = BLOCK * (0.6 + rng.float(0, 0.18));
      const h = 90 + rng.float(0, 150);
      const stepped = rng.bool(0.6);
      add('tower', x, z, w, d, h, { stepped, topH: stepped ? 14 + rng.float(0, 26) : 0, topW: w * 0.6 });
      break;
    }
    case DISTRICT.MIDTOWN: {
      const w = BLOCK * (0.5 + rng.float(0, 0.2)), d = BLOCK * (0.5 + rng.float(0, 0.2));
      add('office', x, z, w, d, 38 + rng.float(0, 70), { stepped: rng.bool(0.3), topH: 10, topW: w * 0.7 });
      if (rng.bool(0.5)) add('office', x + rng.float(-12, 12), z + rng.float(-12, 12), w * 0.5, d * 0.5, 20 + rng.float(0, 30));
      break;
    }
    case DISTRICT.RESIDENTIAL: {
      const count = rng.int(2, 4);
      for (let i = 0; i < count; i++) {
        const w = 12 + rng.float(0, 14), d = 12 + rng.float(0, 14);
        const tall = rng.bool(0.4);
        add(tall ? 'apartment' : 'house', x + rng.float(-half + 12, half - 12), z + rng.float(-half + 12, half - 12), w, d, tall ? 22 + rng.float(0, 26) : 7 + rng.float(0, 4));
      }
      if (rng.bool(0.6)) tree(x + rng.float(-half, half), z + rng.float(-half, half));
      break;
    }
    case DISTRICT.COMMERCIAL: {
      const count = rng.int(2, 3);
      for (let i = 0; i < count; i++) add('shop', x + rng.float(-half + 10, half - 10), z + rng.float(-half + 10, half - 10), 14 + rng.float(0, 18), 12 + rng.float(0, 16), 10 + rng.float(0, 18));
      block.props.push({ type: 'sign', x: x + rng.float(-half, half), z: z + rng.float(-half, half) });
      break;
    }
    case DISTRICT.INDUSTRIAL: {
      add('warehouse', x, z, BLOCK * 0.72, BLOCK * 0.62, 12 + rng.float(0, 12));
      if (rng.bool(0.5)) block.props.push({ type: 'tank', x: x + rng.float(-12, 12), z: z + rng.float(-12, 12), r: 5 + rng.float(0, 4), h: 12 + rng.float(0, 10) });
      break;
    }
    case DISTRICT.PARK: {
      const tcount = rng.int(5, 10);
      for (let i = 0; i < tcount; i++) tree(x + rng.float(-half + 4, half - 4), z + rng.float(-half + 4, half - 4));
      block.props.push({ type: 'pond', x, z, r: BLOCK * 0.22 });
      break;
    }
    case DISTRICT.STADIUM: { add('stadium', x, z, BLOCK * 0.92, BLOCK * 0.8, 26, {}); break; }
    case DISTRICT.PLAZA: {
      add('monument', x, z, 8, 8, 30);
      for (let i = 0; i < 4; i++) tree(x + (i % 2 ? 1 : -1) * 16, z + (i < 2 ? 1 : -1) * 16, 3);
      break;
    }
    case DISTRICT.BEACH: break;
    case DISTRICT.WATER: break;
  }
  if (district !== DISTRICT.WATER) { lamp(x - half + 4, z - half + 4); lamp(x + half - 4, z + half - 4); }
}
