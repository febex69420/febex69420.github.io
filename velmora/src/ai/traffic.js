// Civilian traffic: cars follow the highway/city loops, keep lane offsets,
// brake for obstacles (including the Marshal and his convoy) and light up at night.
import * as THREE from 'three';
import { getBoxGeom, mulberry32, pick, rand, dist2D } from '../core/utils.js';

export class Traffic {
  constructor(ctx) {
    this.ctx = ctx;
    this.cars = [];
    this.group = new THREE.Group();
    this.group.name = 'traffic';
    ctx.scene.add(this.group);
  }

  build() {
    const ctx = this.ctx;
    const rng = mulberry32(ctx.config.seed + 404);
    const loops = ctx.world.trafficLoops;
    if (!loops.length) return;
    // precompute loop lengths
    const routes = loops.map(pts => {
      const cum = [0];
      let total = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        total += Math.hypot(b.x - a.x, b.z - a.z);
        cum.push(total);
      }
      return { pts, cum, total };
    });
    const colors = [ctx.mats.carRed, ctx.mats.carBlue, ctx.mats.carWhite, ctx.mats.carTaxi];
    const N = ctx.config.population.trafficCars;
    for (let i = 0; i < N; i++) {
      const route = routes[i % routes.length];
      const mesh = this._makeCar(pick(rng, colors));
      this.group.add(mesh);
      this.cars.push({
        mesh, route,
        s: rand(rng, 0, route.total),
        speed: rand(rng, 11, 16.5),
        curSpeed: 8,
        lane: 3.1,
        stuck: 0,
      });
    }
  }

  _makeCar(mat) {
    const g = new THREE.Group();
    const M = this.ctx.mats;
    const body = new THREE.Mesh(getBoxGeom(1.9, 0.55, 4.2), mat);
    body.position.y = 0.65;
    body.castShadow = true;
    const cabin = new THREE.Mesh(getBoxGeom(1.7, 0.5, 2.1), M.glassDark);
    cabin.position.set(0, 1.15, -0.2);
    const hl = new THREE.Mesh(getBoxGeom(1.6, 0.16, 0.08), M.headlight);
    hl.position.set(0, 0.62, -2.12);
    const tl = new THREE.Mesh(getBoxGeom(1.6, 0.14, 0.08), M.taillight);
    tl.position.set(0, 0.62, 2.12);
    g.add(body, cabin, hl, tl);
    const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 8);
    for (const [wx, wz] of [[-0.95, -1.4], [0.95, -1.4], [-0.95, 1.4], [0.95, 1.4]]) {
      const w = new THREE.Mesh(wheelGeo, M.rubber);
      w.rotation.z = Math.PI / 2;
      w.position.set(wx, 0.34, wz);
      g.add(w);
    }
    return g;
  }

  _sample(route, s, out) {
    s = ((s % route.total) + route.total) % route.total;
    const { pts, cum } = route;
    for (let i = 0; i < pts.length; i++) {
      if (s <= cum[i + 1]) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        const segLen = cum[i + 1] - cum[i] || 1;
        const t = (s - cum[i]) / segLen;
        out.x = a.x + (b.x - a.x) * t;
        out.z = a.z + (b.z - a.z) * t;
        out.dx = (b.x - a.x) / segLen;
        out.dz = (b.z - a.z) / segLen;
        return out;
      }
    }
    out.x = pts[0].x; out.z = pts[0].z; out.dx = 1; out.dz = 0;
    return out;
  }

  update(dt) {
    const ctx = this.ctx;
    const pp = ctx.player.position;
    const tmp = { x: 0, z: 0, dx: 0, dz: 0 };
    const ahead = { x: 0, z: 0, dx: 0, dz: 0 };
    for (let i = 0; i < this.cars.length; i++) {
      const c = this.cars[i];
      // cull far-away updates
      const dPlayer = dist2D(c.mesh.position.x, c.mesh.position.z, pp.x, pp.z);
      if (dPlayer > 900) { if (ctx.frame % 6 !== i % 6) continue; }

      this._sample(c.route, c.s + 9, ahead);
      const lx = ahead.x + -ahead.dz * c.lane, lz = ahead.z + ahead.dx * c.lane;
      // obstacles: player, player vehicle, other cars ahead on same route
      let blocked = false;
      if (dist2D(lx, lz, pp.x, pp.z) < 5) blocked = true;
      if (!blocked && ctx.player.vehicle) {
        const vp = ctx.player.vehicle.pos;
        if (dist2D(lx, lz, vp.x, vp.z) < 7) blocked = true;
      }
      if (!blocked) {
        for (const o of this.cars) {
          if (o === c || o.route !== c.route) continue;
          let ds = o.s - c.s;
          if (ds < 0) ds += c.route.total;
          if (ds > 0.5 && ds < 11) { blocked = true; break; }
        }
      }
      const target = blocked ? 0 : c.speed;
      c.curSpeed += (target - c.curSpeed) * Math.min(1, dt * (blocked ? 6 : 1.2));
      c.s += c.curSpeed * dt;
      c.stuck = blocked ? c.stuck + dt : 0;

      this._sample(c.route, c.s, tmp);
      const x = tmp.x + -tmp.dz * c.lane, z = tmp.z + tmp.dx * c.lane;
      const y = ctx.world.terrainHeight(x, z) + 0.22;
      c.mesh.position.set(x, y, z);
      c.mesh.rotation.y = Math.atan2(-tmp.dx, -tmp.dz) + Math.PI;
    }
  }
}
