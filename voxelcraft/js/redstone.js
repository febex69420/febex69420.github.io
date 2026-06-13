// redstone.js — power network evaluation.
// Sources: lever(on), button(pressed), redstone torch(on), redstone block, plate(on).
// Wire carries 0–15 with falloff; consumers: lamp, door, TNT. Torches invert the
// block they sit on with a 1-tick delay (clocks work).
import { bkey } from './util.js';
import { B } from './blocks.js';

const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
// wire connects horizontally and one step up/down (stairs of dust)
const WIRE_DIRS = [
  [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1],
  [1, 1, 0], [-1, 1, 0], [0, 1, 1], [0, 1, -1],
  [1, -1, 0], [-1, -1, 0], [0, -1, 1], [0, -1, -1],
];

export class Redstone {
  constructor(game) {
    this.game = game;
    this.activePlates = new Map(); // bkey -> {world,x,y,z}
    this.depth = 0;
  }

  sourcePower(world, x, y, z) {
    const id = world.getBlock(x, y, z);
    const m = world.getMeta(x, y, z);
    if (id === B.RS_BLOCK) return 15;
    if (id === B.LEVER) return m && m.on ? 15 : 0;
    if (id === B.BUTTON) return m && m.pressed ? 15 : 0;
    if (id === B.PLATE) return m && m.on ? 15 : 0;
    if (id === B.RS_TORCH) return m && m.off ? 0 : 15;
    return 0;
  }

  wirePower(world, x, y, z) {
    if (world.getBlock(x, y, z) !== B.WIRE) return 0;
    const m = world.getMeta(x, y, z);
    return m && m.p ? m.p : 0;
  }

  // is this cell receiving power (for consumers & torch bases)?
  isPowered(world, x, y, z, ignoreTorchAbove = false) {
    for (const [dx, dy, dz] of DIRS) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      if (ignoreTorchAbove && dy === 1 && world.getBlock(nx, ny, nz) === B.RS_TORCH) continue;
      if (this.sourcePower(world, nx, ny, nz) > 0) return true;
      if (this.wirePower(world, nx, ny, nz) > 0) return true;
    }
    return false;
  }

  onChange(world, x, y, z) {
    if (this.depth > 8) return;
    this.depth++;
    try {
      this.recomputeNetworksAround(world, x, y, z);
      this.updateConsumersAround(world, x, y, z);
      this.scheduleTorchesAround(world, x, y, z);
    } finally {
      this.depth--;
    }
  }

  recomputeNetworksAround(world, x, y, z) {
    // gather connected wires starting from this position's neighborhood
    const wires = new Set();
    const stack = [];
    const consider = (wx, wy, wz) => {
      if (world.getBlock(wx, wy, wz) === B.WIRE) {
        const k = bkey(wx, wy, wz);
        if (!wires.has(k)) { wires.add(k); stack.push([wx, wy, wz]); }
      }
    };
    consider(x, y, z);
    for (const [dx, dy, dz] of WIRE_DIRS) consider(x + dx, y + dy, z + dz);
    for (const [dx, dy, dz] of DIRS) consider(x + dx, y + dy, z + dz);
    let guard = 0;
    while (stack.length && guard++ < 4096) {
      const [wx, wy, wz] = stack.pop();
      for (const [dx, dy, dz] of WIRE_DIRS) consider(wx + dx, wy + dy, wz + dz);
    }
    if (wires.size === 0) return;

    // multi-source BFS
    const power = new Map();
    const q = [];
    for (const k of wires) {
      const [wx, wy, wz] = k.split(',').map(Number);
      let p = 0;
      for (const [dx, dy, dz] of DIRS) {
        p = Math.max(p, this.sourcePower(world, wx + dx, wy + dy, wz + dz));
      }
      power.set(k, p);
      if (p > 0) q.push([wx, wy, wz, p]);
    }
    let head = 0;
    while (head < q.length) {
      const [wx, wy, wz, p] = q[head++];
      if (p <= 1) continue;
      for (const [dx, dy, dz] of WIRE_DIRS) {
        const k = bkey(wx + dx, wy + dy, wz + dz);
        if (!wires.has(k)) continue;
        if ((power.get(k) || 0) >= p - 1) continue;
        power.set(k, p - 1);
        q.push([wx + dx, wy + dy, wz + dz, p - 1]);
      }
    }
    // apply
    for (const k of wires) {
      const [wx, wy, wz] = k.split(',').map(Number);
      const newP = power.get(k) || 0;
      const m = world.getMeta(wx, wy, wz) || {};
      if ((m.p || 0) !== newP) {
        world.setMeta(wx, wy, wz, { ...m, p: newP });
        world.markDirtyAt(wx, wy, wz);
        this.updateConsumersAround(world, wx, wy, wz);
        this.scheduleTorchesAround(world, wx, wy, wz);
      }
    }
  }

  updateConsumersAround(world, x, y, z) {
    for (const [dx, dy, dz] of [[0, 0, 0], ...DIRS]) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      const id = world.getBlock(nx, ny, nz);
      if (id === B.RS_LAMP || id === B.GLOWSTONE_LIT) {
        const want = this.isPowered(world, nx, ny, nz);
        const lit = id === B.GLOWSTONE_LIT;
        if (want !== lit) world.setBlock(nx, ny, nz, want ? B.GLOWSTONE_LIT : B.RS_LAMP, { noEdit: false });
      } else if (id === B.DOOR) {
        const m = world.getMeta(nx, ny, nz) || {};
        const want = this.isPowered(world, nx, ny, nz);
        if (want && !m.open) this.setDoor(world, nx, ny, nz, true, true);
        else if (!want && m.open && m.byPower) this.setDoor(world, nx, ny, nz, false, true);
      } else if (id === B.TNT) {
        if (this.isPowered(world, nx, ny, nz)) {
          world.setBlock(nx, ny, nz, B.AIR);
          this.game.entities?.primeTNT(world, nx + 0.5, ny, nz + 0.5, 80);
        }
      }
    }
  }

  setDoor(world, x, y, z, open, byPower) {
    // apply to both halves
    const m = world.getMeta(x, y, z) || {};
    const baseY = m.upper ? y - 1 : y;
    for (const yy of [baseY, baseY + 1]) {
      if (world.getBlock(x, yy, z) !== B.DOOR) continue;
      const mm = world.getMeta(x, yy, z) || {};
      world.setMeta(x, yy, z, { ...mm, open, byPower: byPower && open });
      world.markDirtyAt(x, yy, z);
    }
    this.game.audio?.play(open ? 'door_open' : 'door_close', { pos: { x, y, z } });
    if (this.game.mp) this.game.mp.sendMeta(world.dim, x, baseY, z, world.getMeta(x, baseY, z));
  }

  scheduleTorchesAround(world, x, y, z) {
    // torches standing on a block adjacent to the change (the torch sits at base+1)
    for (const [dx, dy, dz] of [[0, 0, 0], ...DIRS]) {
      const tx = x + dx, ty = y + dy + 1, tz = z + dz;
      if (world.getBlock(tx, ty, tz) === B.RS_TORCH) world.scheduleTick(tx, ty, tz, 2);
      if (world.getBlock(x + dx, y + dy, z + dz) === B.RS_TORCH) world.scheduleTick(x + dx, y + dy, z + dz, 2);
    }
  }

  tickTorch(world, x, y, z) {
    const m = world.getMeta(x, y, z) || {};
    // a torch is forced off when the block it stands on is powered (ignoring itself)
    const basePowered = this.isPowered(world, x, y - 1, z, true);
    const wantOff = basePowered;
    if (!!m.off === wantOff) return;
    world.setMeta(x, y, z, { ...m, off: wantOff });
    world.relight(x, y, z, wantOff ? B.RS_TORCH : B.AIR, wantOff ? B.AIR : B.RS_TORCH);
    world.markDirtyAt(x, y, z);
    this.onChange(world, x, y, z);
  }

  pressPlate(world, x, y, z) {
    const m = world.getMeta(x, y, z) || {};
    if (!m.on) {
      world.setMeta(x, y, z, { ...m, on: true });
      world.markDirtyAt(x, y, z);
      this.game.audio?.play('click', { pos: { x, y, z } });
      this.onChange(world, x, y, z);
    }
    this.activePlates.set(bkey(x, y, z), { world, x, y, z, t: 0 });
  }

  tick() {
    for (const [k, p] of this.activePlates) {
      const occupied = this.game.entities?.anyOnBlock(p.world, p.x, p.y, p.z) ||
        this.playerOn(p.world, p.x, p.y, p.z);
      if (!occupied) {
        p.t = (p.t || 0) + 1;
        if (p.t > 4) {
          this.activePlates.delete(k);
          const m = p.world.getMeta(p.x, p.y, p.z) || {};
          if (m.on) {
            p.world.setMeta(p.x, p.y, p.z, { ...m, on: false });
            p.world.markDirtyAt(p.x, p.y, p.z);
            this.onChange(p.world, p.x, p.y, p.z);
          }
        }
      } else p.t = 0;
    }
  }

  playerOn(world, x, y, z) {
    const pl = this.game.player;
    if (!pl || this.game.world !== world) return false;
    return Math.floor(pl.pos.x) === x && Math.floor(pl.pos.z) === z &&
      Math.floor(pl.pos.y + 0.01) === y;
  }
}
