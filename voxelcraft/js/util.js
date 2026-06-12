// util.js — shared constants, RNG, math helpers, voxel AABB physics solver.

export const CS = 16;          // chunk size (x,z)
export const CH = 128;         // world height
export const SEA = 62;         // sea level
export const TICK_MS = 50;     // 20 ticks per second
export const DAY_LEN = 24000;  // ticks per day

export const idx3 = (x, y, z) => (y << 8) | (z << 4) | x;
export const ckey = (cx, cz) => cx + ',' + cz;
export const bkey = (x, y, z) => x + ',' + y + ',' + z;

export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;

// ---- Seeded RNG ----------------------------------------------------------
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(x, z, seed) {
  let h = seed >>> 0;
  h = Math.imul(h ^ (x * 374761393), 668265263);
  h = Math.imul(h ^ (z * 1274126177), 461845907);
  h ^= h >>> 13; h = Math.imul(h, 1274126177); h ^= h >>> 16;
  return h >>> 0;
}
export const rand2 = (x, z, seed) => hash2(x, z, seed) / 4294967296;

export function strSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// ---- Voxel AABB physics --------------------------------------------------
// Entity: { pos:{x,y,z} (feet center), vel:{x,y,z}, w (half width), h (height) }
// Moves entity by vel*dt, resolving per-axis against solid voxels.
// Returns flags { onGround, hitWall, inWater, inLava, onLadder }.
export function moveEntity(world, e, dt) {
  const out = { onGround: false, hitWall: false, inWater: false, inLava: false, onLadder: false };
  const steps = Math.max(1, Math.ceil(Math.max(
    Math.abs(e.vel.x * dt), Math.abs(e.vel.y * dt), Math.abs(e.vel.z * dt)) / 0.4));
  const sdt = dt / steps;
  for (let s = 0; s < steps; s++) {
    moveAxis(world, e, e.vel.x * sdt, 0, out);
    moveAxis(world, e, e.vel.y * sdt, 1, out);
    moveAxis(world, e, e.vel.z * sdt, 2, out);
  }
  // fluid / ladder sampling at body and feet
  const B = world.blocksRef;
  const idAt = (y) => world.getBlock(Math.floor(e.pos.x), Math.floor(y), Math.floor(e.pos.z));
  const feet = idAt(e.pos.y + 0.2), body = idAt(e.pos.y + e.h * 0.6);
  for (const id of [feet, body]) {
    const d = B[id];
    if (!d) continue;
    if (d.liquid === 1) out.inWater = true;
    if (d.liquid === 2) out.inLava = true;
    if (d.climb) out.onLadder = true;
  }
  return out;
}

function solidAt(world, x, y, z) {
  if (y < 0) return true;
  if (y >= CH) return false;
  if (world.isSolidAt) return world.isSolidAt(x, y, z);
  const d = world.blocksRef[world.getBlock(x, y, z)];
  return d ? d.solid : false;
}

function moveAxis(world, e, dist, axis, out) {
  if (dist === 0) return;
  const p = e.pos;
  const eps = 0.001;
  if (axis === 0) p.x += dist; else if (axis === 1) p.y += dist; else p.z += dist;
  const minX = Math.floor(p.x - e.w), maxX = Math.floor(p.x + e.w);
  const minY = Math.floor(p.y), maxY = Math.floor(p.y + e.h - eps);
  const minZ = Math.floor(p.z - e.w), maxZ = Math.floor(p.z + e.w);
  for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) for (let z = minZ; z <= maxZ; z++) {
    if (!solidAt(world, x, y, z)) continue;
    if (axis === 0) {
      if (dist > 0) p.x = x - e.w - eps; else p.x = x + 1 + e.w + eps;
      e.vel.x = 0; out.hitWall = true;
    } else if (axis === 1) {
      if (dist > 0) { p.y = y - e.h - eps; e.vel.y = 0; }
      else { p.y = y + 1 + eps; e.vel.y = 0; out.onGround = true; }
    } else {
      if (dist > 0) p.z = z - e.w - eps; else p.z = z + 1 + e.w + eps;
      e.vel.z = 0; out.hitWall = true;
    }
    return; // re-evaluate from corrected position next substep
  }
}

// ---- Voxel raycast (Amanatides & Woo DDA) --------------------------------
// hitTest(id) -> true if the ray should stop on this block.
export function raycastVoxel(world, ox, oy, oz, dx, dy, dz, maxDist, hitTest) {
  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
  const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
  const tdx = Math.abs(1 / dx), tdy = Math.abs(1 / dy), tdz = Math.abs(1 / dz);
  let tx = dx !== 0 ? (dx > 0 ? (x + 1 - ox) : (ox - x)) * tdx : Infinity;
  let ty = dy !== 0 ? (dy > 0 ? (y + 1 - oy) : (oy - y)) * tdy : Infinity;
  let tz = dz !== 0 ? (dz > 0 ? (z + 1 - oz) : (oz - z)) * tdz : Infinity;
  let face = [0, 0, 0], t = 0;
  for (let i = 0; i < 256; i++) {
    const id = world.getBlock(x, y, z);
    if (hitTest(id)) return { x, y, z, nx: face[0], ny: face[1], nz: face[2], dist: t, id };
    if (tx < ty && tx < tz) { t = tx; x += stepX; tx += tdx; face = [-stepX, 0, 0]; }
    else if (ty < tz) { t = ty; y += stepY; ty += tdy; face = [0, -stepY, 0]; }
    else { t = tz; z += stepZ; tz += tdz; face = [0, 0, -stepZ]; }
    if (t > maxDist) return null;
  }
  return null;
}

export function dist2(ax, ay, az, bx, by, bz) {
  const dx = ax - bx, dy = ay - by, dz = az - bz;
  return dx * dx + dy * dy + dz * dz;
}
