// Aurelgrad (the capital city) and Brenka (a farming village).
// City: block grid, window-lit towers, shops, plaza with statue, street lamps.
import * as THREE from 'three';
import { GeomBatcher, getBoxGeom, mulberry32, rand, randInt, pick, chance } from '../core/utils.js';

export function buildCity(ctx) {
  const { scene, mats: M, world, config } = ctx;
  const col = world.colliders;
  const rng = mulberry32(config.seed + 77);
  const group = new THREE.Group();
  group.name = 'aurelgrad';
  const batch = new GeomBatcher();
  const site = config.sites.city;
  const H = site.h;

  const COLS = 5, ROWS = 4, BLOCK = 90, ROAD = 14, PITCH = BLOCK + ROAD;
  const x0 = site.x - (COLS * PITCH - ROAD) / 2;
  const z0 = site.z - (ROWS * PITCH - ROAD) / 2;
  const x1 = x0 + COLS * PITCH - ROAD, z1 = z0 + ROWS * PITCH - ROAD;
  world.cityRect = { x0: x0 - 10, z0: z0 - 10, x1: x1 + 10, z1: z1 + 10 };

  // base pavement + curbs
  batch.box(x1 - x0 + 26, 0.12, z1 - z0 + 26, M.road, site.x, H + 0.06, site.z);

  const loops = [];
  const lampPos = [];
  const plazaCol = 2, plazaRow = 1;

  for (let bi = 0; bi < COLS; bi++) {
    for (let bj = 0; bj < ROWS; bj++) {
      const bx = x0 + bi * PITCH;           // block west edge
      const bz = z0 + bj * PITCH;
      const cx = bx + BLOCK / 2, cz = bz + BLOCK / 2;
      // sidewalk island
      batch.box(BLOCK, 0.3, BLOCK, M.sidewalk, cx, H + 0.15, cz);
      // pedestrian loop around the block
      const m = 2.5;
      loops.push([
        new THREE.Vector3(bx + m, H + 0.3, bz + m), new THREE.Vector3(bx + BLOCK - m, H + 0.3, bz + m),
        new THREE.Vector3(bx + BLOCK - m, H + 0.3, bz + BLOCK - m), new THREE.Vector3(bx + m, H + 0.3, bz + BLOCK - m),
      ]);
      // corner lamps
      lampPos.push([bx + 2, bz + 2], [bx + BLOCK - 2, bz + 2], [bx + BLOCK - 2, bz + BLOCK - 2], [bx + 2, bz + BLOCK - 2]);

      if (bi === plazaCol && bj === plazaRow) {
        buildPlaza(cx, cz);
        continue;
      }
      // buildings: 2x2 pads inside the block
      for (let px = 0; px < 2; px++) {
        for (let pz = 0; pz < 2; pz++) {
          const pcx = bx + 22 + px * 46, pcz = bz + 22 + pz * 46;
          if (chance(rng, 0.12)) { // pocket park
            batch.box(30, 0.2, 30, M.hedge, pcx, H + 0.35, pcz);
            continue;
          }
          const w = rand(rng, 22, 34), d = rand(rng, 22, 34);
          let hgt;
          const r = rng();
          if (r < 0.3) hgt = rand(rng, 8, 14);
          else if (r < 0.75) hgt = rand(rng, 16, 30);
          else hgt = rand(rng, 32, 52);
          const mat = pick(rng, M.tower);
          const mesh = new THREE.Mesh(getBoxGeom(Math.round(w), Math.round(hgt), Math.round(d)), mat);
          mesh.position.set(pcx, H + 0.3 + Math.round(hgt) / 2, pcz);
          mesh.castShadow = mesh.receiveShadow = true;
          group.add(mesh);
          col.addBoxCentered(pcx, H, pcz, Math.round(w), Math.round(hgt) + 0.3, Math.round(d));
          // roof detail + ground floor shopfront awning
          batch.box(w * 0.35, rand(rng, 1.5, 4), d * 0.35, M.concrete, pcx, H + 0.3 + hgt + 1, pcz);
          if (hgt < 16 && chance(rng, 0.7)) {
            const awn = pick(rng, [M.carRed, M.carBlue, M.hedge, M.carTaxi]);
            batch.box(w * 0.8, 0.25, 2.4, awn, pcx, H + 3.2, pcz + d / 2 + 1.2);
          }
        }
      }
    }
  }

  function buildPlaza(cx, cz) {
    batch.box(70, 0.35, 70, M.marbleDark, cx, H + 0.2, cz);
    // statue of the First Marshal
    batch.box(6, 2.4, 6, M.stoneDark, cx, H + 1.55, cz);
    col.addBoxCentered(cx, H, cz, 6, 9, 6);
    batch.box(1.6, 4.4, 1.6, M.stoneDark, cx, H + 4.9, cz);
    batch.box(2.6, 1.1, 1.1, M.stoneDark, cx, H + 7.3, cz);
    batch.box(0.8, 0.8, 0.8, M.stoneDark, cx, H + 7.9, cz);
    // benches + planters
    for (const [ox, oz] of [[-16, 0], [16, 0], [0, -16], [0, 16]]) {
      batch.box(3.2, 0.55, 1.1, M.wood, cx + ox, H + 0.65, cz + oz);
      col.addBoxCentered(cx + ox, H + 0.35, cz + oz, 3.2, 0.6, 1.1);
    }
    for (const [ox, oz] of [[-26, -26], [26, -26], [-26, 26], [26, 26]]) {
      batch.box(3, 1, 3, M.stone, cx + ox, H + 0.85, cz + oz);
      batch.box(2.4, 1.2, 2.4, M.hedge, cx + ox, H + 1.9, cz + oz);
      col.addBoxCentered(cx + ox, H + 0.35, cz + oz, 3, 1.6, 3);
    }
    // market stalls
    for (let i = 0; i < 4; i++) {
      const sx = cx - 24 + i * 16, sz = cz + 30;
      batch.box(3.6, 1, 2, M.wood, sx, H + 0.85, sz);
      batch.box(4.2, 0.2, 2.8, pick(rng, [M.carRed, M.carTaxi, M.hedge]), sx, H + 2.6, sz);
      batch.box(0.2, 2.2, 0.2, M.woodDark, sx - 1.9, H + 1.4, sz);
      batch.box(0.2, 2.2, 0.2, M.woodDark, sx + 1.9, H + 1.4, sz);
      col.addBoxCentered(sx, H + 0.35, sz, 3.6, 1.2, 2);
    }
    world.cityPlaza = { x: cx, z: cz };
    loops.push([
      new THREE.Vector3(cx - 30, H + 0.4, cz - 30), new THREE.Vector3(cx + 30, H + 0.4, cz - 30),
      new THREE.Vector3(cx + 30, H + 0.4, cz + 30), new THREE.Vector3(cx - 30, H + 0.4, cz + 30),
    ]);
  }

  // traffic ring routes (clockwise around the grid), stored for Traffic + map
  const ringY = H + 0.2;
  world.trafficLoops.push([
    new THREE.Vector3(x0 - 7, ringY, z0 - 7), new THREE.Vector3(x1 + 7, ringY, z0 - 7),
    new THREE.Vector3(x1 + 7, ringY, z1 + 7), new THREE.Vector3(x0 - 7, ringY, z1 + 7),
  ]);
  world.trafficLoops.push([
    new THREE.Vector3(x0 + PITCH - 7, ringY, z0 - 7), new THREE.Vector3(x0 + 3 * PITCH - 7, ringY, z0 - 7),
    new THREE.Vector3(x0 + 3 * PITCH - 7, ringY, z1 + 7), new THREE.Vector3(x0 + PITCH - 7, ringY, z1 + 7),
  ]);

  world.props.addLamps(lampPos.map(([lx, lz]) => [lx, H + 0.3, lz]));
  world.cityLoops = loops;

  // scatter destructible props in alleys
  for (let i = 0; i < 14; i++) {
    const bx = x0 + randInt(rng, 0, COLS - 1) * PITCH + rand(rng, 8, 80);
    const bz = z0 + randInt(rng, 0, ROWS - 1) * PITCH + rand(rng, 8, 80);
    world.props.spawnCrate(bx, H + 0.3, bz);
  }

  batch.build(group);
  scene.add(group);

  // =====================  BRENKA VILLAGE  =====================
  const vg = new THREE.Group();
  vg.name = 'brenka';
  const vb = new GeomBatcher();
  const vs = config.sites.village;
  const VH = vs.h;
  const houses = [];
  for (let i = 0; i < 7; i++) {
    houses.push([vs.x - 130 + i * 42, vs.z - 26, 0]);
    houses.push([vs.x - 110 + i * 42, vs.z + 28, Math.PI]);
  }
  for (const [hx, hz, ry] of houses) {
    const w = rand(rng, 9, 13), d = rand(rng, 8, 11), hh = rand(rng, 3.6, 4.6);
    vb.box(w, hh, d, pick(rng, [M.whitewash, M.plaster, M.brick]), hx, VH + hh / 2, hz, ry);
    col.addBoxCentered(hx, VH, hz, w, hh, d, ry);
    // pyramid roof
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.72, 2.6, 4), pick(rng, [M.roofSlate, M.brick, M.roofCopper]));
    roof.position.set(hx, VH + hh + 1.3, hz);
    roof.rotation.y = Math.PI / 4 + ry;
    roof.castShadow = true;
    vg.add(roof);
    // chimney
    vb.box(0.9, 1.8, 0.9, M.stoneDark, hx + w * 0.25, VH + hh + 1.6, hz);
  }
  // well
  vb.box(3, 1.1, 3, M.stone, vs.x, VH + 0.55, vs.z);
  col.addBoxCentered(vs.x, VH, vs.z, 3, 1.1, 3);
  vb.box(0.25, 2.6, 0.25, M.woodDark, vs.x - 1.2, VH + 1.3, vs.z);
  vb.box(0.25, 2.6, 0.25, M.woodDark, vs.x + 1.2, VH + 1.3, vs.z);
  vb.box(3.4, 0.2, 1.6, M.roofSlate, vs.x, VH + 2.7, vs.z);
  // fields
  for (let i = 0; i < 5; i++) {
    const fx = vs.x - 60 + i * 34, fz = vs.z + 90;
    vb.box(30, 0.15, 44, i % 2 ? M.sand : M.leafDark, fx, VH + 0.08 + (i % 3) * 0.02, fz);
  }
  // fences along the street
  for (let fx = vs.x - 140; fx <= vs.x + 150; fx += 4) {
    vb.box(0.15, 1, 0.15, M.woodDark, fx, VH + 0.5, vs.z - 14);
    vb.box(0.15, 1, 0.15, M.woodDark, fx, VH + 0.5, vs.z + 14);
  }
  vb.box(292, 0.08, 0.3, M.wood, vs.x + 5, VH + 0.9, vs.z - 14);
  vb.box(292, 0.08, 0.3, M.wood, vs.x + 5, VH + 0.9, vs.z + 14);
  world.villageLoops = [[
    new THREE.Vector3(vs.x - 120, VH + 0.2, vs.z - 8), new THREE.Vector3(vs.x + 120, VH + 0.2, vs.z - 8),
    new THREE.Vector3(vs.x + 120, VH + 0.2, vs.z + 8), new THREE.Vector3(vs.x - 120, VH + 0.2, vs.z + 8),
  ], [
    new THREE.Vector3(vs.x - 20, VH + 0.2, vs.z + 6), new THREE.Vector3(vs.x + 6, VH + 0.2, vs.z + 40),
    new THREE.Vector3(vs.x - 40, VH + 0.2, vs.z + 80), new THREE.Vector3(vs.x - 70, VH + 0.2, vs.z + 30),
  ]];
  world.props.addLamps([[vs.x - 80, VH, vs.z - 12], [vs.x, VH, vs.z - 12], [vs.x + 80, VH, vs.z - 12]]);
  for (let i = 0; i < 5; i++) world.props.spawnCrate(vs.x - 40 + i * 22, VH + 0.3, vs.z + 20);
  vb.build(vg);
  scene.add(vg);
}
