// Analytic terrain: one height function drives both the rendered mesh and all
// gameplay queries (no mesh sampling), so ground contact is exact everywhere.
import * as THREE from 'three';
import { fbm, smoothstep, lerp, clamp } from '../core/utils.js';

export class Terrain {
  constructor(config) {
    this.cfg = config;
    this.sites = Object.values(config.sites);
    this.runway = config.sites.airport.runway;
  }

  height(x, z) {
    let h = 10 + fbm(x, z, 4, 1 / 900) * 20 + fbm(x + 2311, z - 977, 3, 1 / 190) * 4;

    // Northreach mountains rise toward -Z
    const mn = smoothstep(-1300, -2600, z);
    if (mn > 0) h += mn * (70 + (fbm(x, z, 4, 1 / 520) * 0.5 + 0.5) * 240);

    // southern coast falls below sea level
    const cs = smoothstep(2150, 2850, z);
    if (cs > 0) h = lerp(h, -14, cs);

    // settlement plateaus
    for (const s of this.sites) {
      if (!s.r) continue;
      const d = Math.hypot(x - s.x, z - s.z);
      if (d < s.r) h = lerp(h, s.h, smoothstep(s.r, s.r * 0.55, d));
    }
    // runway strip (capsule flatten)
    const rw = this.runway;
    const d = segDist(x, z, rw.x0, rw.z0, rw.x1, rw.z1);
    if (d < rw.halfW) h = lerp(h, this.cfg.sites.airport.h, smoothstep(rw.halfW, rw.halfW * 0.55, d));
    return h;
  }

  normal(x, z, eps = 2.5) {
    const hL = this.height(x - eps, z), hR = this.height(x + eps, z);
    const hD = this.height(x, z - eps), hU = this.height(x, z + eps);
    const n = new THREE.Vector3(hL - hR, 2 * eps, hD - hU);
    return n.normalize();
  }

  buildMesh() {
    const half = this.cfg.world.half;
    const seg = this.cfg.world.terrainSegments;
    const size = half * 2.3; // overshoot the playable bounds a little
    const geo = new THREE.BufferGeometry();
    const n = seg + 1;
    const pos = new Float32Array(n * n * 3);
    const col = new Float32Array(n * n * 3);
    const cGrass = new THREE.Color(0x4e7141), cGrass2 = new THREE.Color(0x5d7f46);
    const cRock = new THREE.Color(0x7a746b), cSnow = new THREE.Color(0xe8ecef);
    const cSand = new THREE.Color(0xcbb98a), cDirt = new THREE.Color(0x6e6046);
    const c = new THREE.Color();
    let i = 0;
    for (let iz = 0; iz < n; iz++) {
      for (let ix = 0; ix < n; ix++) {
        const x = -size / 2 + (ix / seg) * size;
        const z = -size / 2 + (iz / seg) * size;
        const h = this.height(x, z);
        pos[i * 3] = x; pos[i * 3 + 1] = h; pos[i * 3 + 2] = z;
        // color by height + slope
        const slope = 1 - this.normal(x, z, 6).y;
        const tint = fbm(x + 500, z + 500, 2, 1 / 60) * 0.5 + 0.5;
        c.copy(cGrass).lerp(cGrass2, tint);
        if (h < 2.5) c.lerp(cSand, smoothstep(2.5, 0.5, h));
        if (slope > 0.18) c.lerp(cRock, smoothstep(0.18, 0.42, slope));
        if (slope > 0.1 && h < 60) c.lerp(cDirt, smoothstep(0.1, 0.3, slope) * 0.5);
        if (h > 200) c.lerp(cSnow, smoothstep(200, 280, h));
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
        i++;
      }
    }
    const idx = new Uint32Array(seg * seg * 6);
    let k = 0;
    for (let iz = 0; iz < seg; iz++) {
      for (let ix = 0; ix < seg; ix++) {
        const a = iz * n + ix, b = a + 1, cV = a + n, d = cV + 1;
        idx[k++] = a; idx[k++] = cV; idx[k++] = b;
        idx[k++] = b; idx[k++] = cV; idx[k++] = d;
      }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    return mesh;
  }
}

function segDist(px, pz, ax, az, bx, bz) {
  const abx = bx - ax, abz = bz - az;
  const t = clamp(((px - ax) * abx + (pz - az) * abz) / (abx * abx + abz * abz), 0, 1);
  return Math.hypot(px - (ax + abx * t), pz - (az + abz * t));
}
