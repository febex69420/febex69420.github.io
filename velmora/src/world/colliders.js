// Axis-aligned box collision world with a uniform spatial hash.
// Handles: walking surfaces (box tops), wall push-out for capsules/circles,
// and cheap ray marching for bullets / AI line-of-sight.
const CELL = 16;

export class ColliderWorld {
  constructor() {
    this.boxes = [];          // {minX,minY,minZ,maxX,maxY,maxZ,alive}
    this.grid = new Map();    // "cx,cz" -> [index...]
    this.free = [];
  }

  _cells(minX, minZ, maxX, maxZ, fn) {
    const x0 = Math.floor(minX / CELL), x1 = Math.floor(maxX / CELL);
    const z0 = Math.floor(minZ / CELL), z1 = Math.floor(maxZ / CELL);
    for (let cx = x0; cx <= x1; cx++)
      for (let cz = z0; cz <= z1; cz++) fn(cx + ',' + cz);
  }

  addBox(minX, minY, minZ, maxX, maxY, maxZ) {
    const id = this.free.length ? this.free.pop() : this.boxes.length;
    const b = { minX, minY, minZ, maxX, maxY, maxZ, alive: true };
    this.boxes[id] = b;
    this._cells(minX, minZ, maxX, maxZ, key => {
      let list = this.grid.get(key);
      if (!list) { list = []; this.grid.set(key, list); }
      list.push(id);
    });
    return id;
  }

  // centered helper: center x/z, base y, dims w(hx*2) h d, optional yaw snapped — for rotated
  // walls we approximate with the rotated AABB (fine for our mostly-orthogonal architecture).
  addBoxCentered(x, yBase, z, w, h, d, rotY = 0) {
    if (Math.abs(Math.sin(rotY)) > 0.05 && Math.abs(Math.cos(rotY)) > 0.05) {
      const c = Math.abs(Math.cos(rotY)), s = Math.abs(Math.sin(rotY));
      const w2 = w * c + d * s, d2 = w * s + d * c;
      return this.addBox(x - w2 / 2, yBase, z - d2 / 2, x + w2 / 2, yBase + h, z + d2 / 2);
    }
    if (Math.abs(Math.sin(rotY)) > 0.5) [w, d] = [d, w];
    return this.addBox(x - w / 2, yBase, z - d / 2, x + w / 2, yBase + h, z + d / 2);
  }

  remove(id) {
    const b = this.boxes[id];
    if (!b || !b.alive) return;
    b.alive = false;
    this._cells(b.minX, b.minZ, b.maxX, b.maxZ, key => {
      const list = this.grid.get(key);
      if (list) {
        const i = list.indexOf(id);
        if (i >= 0) list.splice(i, 1);
      }
    });
    this.free.push(id);
  }

  _query(minX, minZ, maxX, maxZ, out) {
    out.length = 0;
    this._cells(minX, minZ, maxX, maxZ, key => {
      const list = this.grid.get(key);
      if (list) for (const id of list) {
        const b = this.boxes[id];
        if (b.alive && !out.includes(b)) out.push(b);
      }
    });
    return out;
  }

  // Highest walkable box top at (x,z) not above refY + step. -Infinity if none.
  groundAt(x, z, refY, step = 0.6) {
    let best = -Infinity;
    const tmp = this._query(x - 0.4, z - 0.4, x + 0.4, z + 0.4, ColliderWorld._tmpA);
    for (const b of tmp) {
      if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
      if (b.maxY <= refY + step && b.maxY > best) best = b.maxY;
    }
    return best;
  }

  // Lowest ceiling (box bottom) above refY at (x,z). +Infinity if open sky.
  ceilingAt(x, z, refY) {
    let best = Infinity;
    const tmp = this._query(x - 0.4, z - 0.4, x + 0.4, z + 0.4, ColliderWorld._tmpA);
    for (const b of tmp) {
      if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
      if (b.minY >= refY && b.minY < best) best = b.minY;
    }
    return best;
  }

  // Push a vertical capsule (circle in plan) out of boxes overlapping [yLow,yHigh].
  // Returns {x,z} corrected position. stepY: boxes whose top is below stepY are climbable, skip.
  collideCircle(x, z, r, yLow, yHigh) {
    const tmp = this._query(x - r - 1, z - r - 1, x + r + 1, z + r + 1, ColliderWorld._tmpB);
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const b of tmp) {
        if (b.maxY <= yLow || b.minY >= yHigh) continue;
        const cx = Math.max(b.minX, Math.min(x, b.maxX));
        const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
        let dx = x - cx, dz = z - cz;
        let d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 < 1e-8) {
          // center inside box: push along smallest exit axis
          const exL = x - b.minX + r, exR = b.maxX - x + r;
          const ezL = z - b.minZ + r, ezR = b.maxZ - z + r;
          const m = Math.min(exL, exR, ezL, ezR);
          if (m === exL) x = b.minX - r;
          else if (m === exR) x = b.maxX + r;
          else if (m === ezL) z = b.minZ - r;
          else z = b.maxZ + r;
        } else {
          const d = Math.sqrt(d2);
          x = cx + (dx / d) * r;
          z = cz + (dz / d) * r;
        }
        moved = true;
      }
      if (!moved) break;
    }
    return { x, z };
  }

  // March a ray in steps; returns distance to first solid hit or Infinity.
  raycast(ox, oy, oz, dx, dy, dz, maxDist, step = 0.6) {
    for (let t = step; t <= maxDist; t += step) {
      const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
      const tmp = this._query(x - 0.1, z - 0.1, x + 0.1, z + 0.1, ColliderWorld._tmpC);
      for (const b of tmp) {
        if (x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY && z >= b.minZ && z <= b.maxZ) {
          return t;
        }
      }
    }
    return Infinity;
  }
}
ColliderWorld._tmpA = [];
ColliderWorld._tmpB = [];
ColliderWorld._tmpC = [];
