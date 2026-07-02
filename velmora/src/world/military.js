// Fort Karst (main army base) and Marshal Aurel Airfield.
import * as THREE from 'three';
import { GeomBatcher, getBoxGeom, makeCanvasTex } from '../core/utils.js';

export function buildMilitary(ctx) {
  const { scene, mats: M, world, config } = ctx;
  const col = world.colliders;
  const out = { parkedVehicles: [], patrolRoutes: [], posts: [], soldierSpots: [] };

  // =====================  FORT KARST  =====================
  {
    const s = config.sites.base;
    const H = s.h;
    const group = new THREE.Group();
    group.name = 'fort-karst';
    const b = new GeomBatcher();
    const X0 = s.x - 140, X1 = s.x + 140, Z0 = s.z - 110, Z1 = s.z + 110;

    // perimeter walls with east gate
    const wallSeg = (x, z, w, d) => { b.box(w, 4, d, M.concrete, x, H + 2, z); col.addBoxCentered(x, H, z, w, 4, d); };
    wallSeg((X0 + X1) / 2, Z0, X1 - X0, 1.2);
    wallSeg((X0 + X1) / 2, Z1, X1 - X0, 1.2);
    wallSeg(X0, (Z0 + Z1) / 2, 1.2, Z1 - Z0);
    // east wall with gate gap at z ~ s.z-20±8
    const gateZ = s.z - 20;
    wallSeg(X1, (Z0 + gateZ - 8) / 2, 1.2, gateZ - 8 - Z0);
    wallSeg(X1, (gateZ + 8 + Z1) / 2, 1.2, Z1 - gateZ - 8);
    // gate checkpoint
    b.box(4, 3, 4, M.camoDark, X1 + 4, H + 1.5, gateZ - 10);
    col.addBoxCentered(X1 + 4, H, gateZ - 10, 4, 3, 4);
    b.box(10, 0.2, 0.25, M.carRed, X1 + 2, H + 1.15, gateZ);
    out.posts.push({ x: X1 + 4, z: gateZ - 6, yaw: Math.PI / 2, kind: 'gate' });
    out.posts.push({ x: X1 + 4, z: gateZ + 6, yaw: Math.PI / 2, kind: 'gate' });
    // corner towers
    for (const [tx, tz] of [[X0, Z0], [X1, Z0], [X0, Z1], [X1, Z1]]) {
      b.box(5, 8, 5, M.camoDark, tx, H + 4, tz);
      col.addBoxCentered(tx, H, tz, 5, 8, 5);
      b.box(6, 0.4, 6, M.gunmetal, tx, H + 8.4, tz);
      b.box(4.4, 2, 4.4, M.camo, tx, H + 9.6, tz);
      b.box(5.4, 0.3, 5.4, M.roofSlate, tx, H + 10.8, tz);
      out.posts.push({ x: tx + 4, z: tz + 4, yaw: 0, kind: 'tower' });
    }

    // barracks rows (south)
    for (let i = 0; i < 4; i++) {
      const bx = s.x - 90 + i * 55, bz = s.z + 66;
      b.box(38, 4, 13, M.camo, bx, H + 2, bz);
      col.addBoxCentered(bx, H, bz, 38, 4, 13);
      b.box(40, 1.4, 15, M.camoDark, bx, H + 4.6, bz);
    }
    // HQ (north, 2 floors)
    b.box(52, 9, 20, M.camoDark, s.x - 30, H + 4.5, s.z - 80);
    col.addBoxCentered(s.x - 30, H, s.z - 80, 52, 9, 20);
    b.box(54, 1, 22, M.gunmetal, s.x - 30, H + 9.5, s.z - 80);
    for (let wx = -22; wx <= 22; wx += 6) {
      b.box(2.6, 1.8, 0.2, M.glassDark, s.x - 30 + wx, H + 3, s.z - 69.8);
      b.box(2.6, 1.8, 0.2, M.glassDark, s.x - 30 + wx, H + 7, s.z - 69.8);
    }
    // radar dish on HQ
    const dish = new THREE.Mesh(new THREE.SphereGeometry(3, 12, 8, 0, Math.PI * 2, 0, Math.PI / 3), M.metal);
    dish.rotation.x = Math.PI / 3.4;
    dish.position.set(s.x - 50, H + 12.5, s.z - 80);
    group.add(dish);
    world.radarDishes.push(dish);
    b.box(1, 3.4, 1, M.gunmetal, s.x - 50, H + 10.7, s.z - 80);

    // vehicle depot (west): canopy + vehicles
    b.box(66, 0.15, 30, M.parade, s.x - 95, H + 0.08, s.z - 10);
    for (let i = 0; i < 4; i++) {
      b.box(0.8, 5, 0.8, M.concrete, s.x - 124 + i * 19.3, H + 2.5, s.z - 24);
      b.box(0.8, 5, 0.8, M.concrete, s.x - 124 + i * 19.3, H + 2.5, s.z + 4);
      col.addBoxCentered(s.x - 124 + i * 19.3, H, s.z - 24, 0.8, 5, 0.8);
      col.addBoxCentered(s.x - 124 + i * 19.3, H, s.z + 4, 0.8, 5, 0.8);
    }
    b.box(68, 0.5, 32, M.camoDark, s.x - 95, H + 5.2, s.z - 10);
    out.parkedVehicles.push(
      { type: 'apc', x: s.x - 118, z: s.z - 10, rotY: 0 },
      { type: 'apc', x: s.x - 106, z: s.z - 10, rotY: 0 },
      { type: 'truck', x: s.x - 92, z: s.z - 10, rotY: 0 },
      { type: 'truck', x: s.x - 80, z: s.z - 10, rotY: 0 },
      { type: 'jeep', x: s.x - 70, z: s.z - 10, rotY: 0 },
    );
    // helipad NE
    b.box(22, 0.2, 22, M.parade, s.x + 95, H + 0.1, s.z - 70);
    out.parkedVehicles.push({ type: 'heli', x: s.x + 95, z: s.z - 70, rotY: 0 });
    // parade square + flag
    b.box(70, 0.14, 50, M.parade, s.x + 40, H + 0.07, s.z + 20);
    world.makeFlag(s.x + 40, H, s.z - 6, 14, group);
    // firing range (south-west strip)
    b.box(60, 0.1, 20, M.gravel, s.x - 80, H + 0.06, s.z + 92);
    b.box(60, 3, 2, M.sand, s.x - 80, H + 1.5, s.z + 103);   // berm
    col.addBoxCentered(s.x - 80, H, s.z + 103, 60, 3, 2);
    for (let i = 0; i < 6; i++) world.props.spawnTarget(s.x - 105 + i * 10, H, s.z + 100);
    out.posts.push({ x: s.x - 80, z: s.z + 84, yaw: Math.PI, kind: 'range' });
    // ammo dump (barrels + crates, NW corner)
    for (let i = 0; i < 6; i++) world.props.spawnBarrel(s.x - 120 + (i % 3) * 4, H, s.z - 88 + Math.floor(i / 3) * 4);
    for (let i = 0; i < 6; i++) world.props.spawnCrate(s.x - 100 + (i % 3) * 3.4, H + 0.3, s.z - 90 + Math.floor(i / 3) * 3.6);

    // patrols
    out.patrolRoutes.push([
      new THREE.Vector3(X0 + 8, H, Z0 + 8), new THREE.Vector3(X1 - 8, H, Z0 + 8),
      new THREE.Vector3(X1 - 8, H, Z1 - 8), new THREE.Vector3(X0 + 8, H, Z1 - 8),
    ]);
    out.patrolRoutes.push([
      new THREE.Vector3(s.x + 10, H, s.z + 20), new THREE.Vector3(s.x + 70, H, s.z + 20),
      new THREE.Vector3(s.x + 70, H, s.z - 40), new THREE.Vector3(s.x + 10, H, s.z - 40),
    ]);
    out.patrolRoutes.push([
      new THREE.Vector3(s.x - 90, H, s.z + 60), new THREE.Vector3(s.x - 30, H, s.z + 60),
      new THREE.Vector3(s.x - 30, H, s.z - 60), new THREE.Vector3(s.x - 90, H, s.z - 60),
    ]);
    // marching square spots
    for (let i = 0; i < 12; i++) out.soldierSpots.push(new THREE.Vector3(s.x + 20 + (i % 4) * 6, H, s.z + 8 + Math.floor(i / 4) * 5));
    out.posts.push({ x: s.x - 30, z: s.z - 66, yaw: Math.PI, kind: 'hq' });

    world.lampsAt([[s.x + 40, H, s.z + 44], [s.x - 95, H, s.z + 8], [X1 - 10, H, gateZ]]);
    b.build(group);
    scene.add(group);
    world.rooms.push({ name: 'Fort Karst', x0: X0, z0: Z0, x1: X1, z1: Z1, y0: H - 2, y1: H + 30 });
  }

  // =====================  MARSHAL AUREL AIRFIELD  =====================
  {
    const s = config.sites.airport;
    const H = s.h;
    const rw = s.runway;
    const group = new THREE.Group();
    group.name = 'airfield';
    const b = new GeomBatcher();
    const cx = (rw.x0 + rw.x1) / 2;

    // runway + centerline dashes + threshold stripes
    b.box(rw.x1 - rw.x0, 0.15, 34, M.road, cx, H + 0.08, rw.z0);
    for (let dx = rw.x0 + 20; dx < rw.x1 - 20; dx += 24) b.box(8, 0.05, 0.8, M.roadLine, dx, H + 0.18, rw.z0);
    for (let i = 0; i < 6; i++) {
      b.box(6, 0.05, 2, M.roadLine, rw.x0 + 12, H + 0.18, rw.z0 - 12 + i * 4.8);
      b.box(6, 0.05, 2, M.roadLine, rw.x1 - 12, H + 0.18, rw.z0 - 12 + i * 4.8);
    }
    // runway edge lights (glow at night via lampGlow material)
    for (let dx = rw.x0; dx <= rw.x1; dx += 40) {
      b.box(0.4, 0.5, 0.4, M.lampGlow, dx, H + 0.25, rw.z0 - 18.5);
      b.box(0.4, 0.5, 0.4, M.lampGlow, dx, H + 0.25, rw.z0 + 18.5);
    }
    // taxiway + apron (north of runway)
    b.box(30, 0.14, 60, M.road, cx + 60, H + 0.07, rw.z0 - 60);
    b.box(200, 0.16, 90, M.road, cx + 40, H + 0.09, rw.z0 - 130);
    // control tower
    const tx = cx + 150, tz = rw.z0 - 130;
    b.box(6, 16, 6, M.concrete, tx, H + 8, tz);
    col.addBoxCentered(tx, H, tz, 6, 16, 6);
    b.box(9, 3.2, 9, M.glassDark, tx, H + 17.6, tz);
    b.box(10, 0.5, 10, M.gunmetal, tx, H + 19.4, tz);
    // hangars (open south face)
    for (let i = 0; i < 2; i++) {
      const hx = cx - 40 + i * 70, hz = rw.z0 - 160;
      b.box(1.2, 10, 34, M.gunmetal, hx - 24, H + 5, hz);
      b.box(1.2, 10, 34, M.gunmetal, hx + 24, H + 5, hz);
      b.box(49, 1.2, 34, M.gunmetal, hx, H + 10.6, hz);
      b.box(49, 10, 1.2, M.gunmetal, hx, H + 5, hz - 17);
      col.addBoxCentered(hx - 24, H, hz, 1.2, 10, 34);
      col.addBoxCentered(hx + 24, H, hz, 1.2, 10, 34);
      col.addBoxCentered(hx, H, hz - 17, 49, 10, 1.2);
    }
    // fuel tanks (explosive!)
    for (let i = 0; i < 3; i++) world.props.spawnBarrel(cx + 130 + i * 4, H, rw.z0 - 170);
    // parked aircraft
    out.parkedVehicles.push(
      { type: 'jet', x: cx - 40, z: rw.z0 - 160, rotY: Math.PI },
      { type: 'jet', x: cx + 40, z: rw.z0 - 100, rotY: Math.PI / 2 },
      { type: 'heli', x: cx + 100, z: rw.z0 - 100, rotY: 0 },
    );
    // windsock
    b.box(0.3, 8, 0.3, M.metal, rw.x1 + 30, H + 4, rw.z0 - 30);
    const sockGeo = new THREE.ConeGeometry(1, 4, 8);
    const sock = new THREE.Mesh(sockGeo, new THREE.MeshStandardMaterial({ color: 0xd86a2a }));
    sock.rotation.z = Math.PI / 2;
    sock.position.set(rw.x1 + 32.5, H + 7.6, rw.z0 - 30);
    group.add(sock);

    out.patrolRoutes.push([
      new THREE.Vector3(cx - 60, H, rw.z0 - 100), new THREE.Vector3(cx + 120, H, rw.z0 - 100),
      new THREE.Vector3(cx + 120, H, rw.z0 - 160), new THREE.Vector3(cx - 60, H, rw.z0 - 160),
    ]);
    out.posts.push({ x: tx, z: tz + 8, yaw: 0, kind: 'tower' });
    world.lampsAt([[cx + 40, H, rw.z0 - 96], [cx - 40, H, rw.z0 - 130]]);
    b.build(group);
    scene.add(group);
    world.rooms.push({ name: 'Marshal Aurel Airfield', x0: rw.x0 - 40, z0: rw.z0 - 200, x1: rw.x1 + 40, z1: rw.z0 + 40, y0: H - 2, y1: H + 40 });
    world.runwayStart = { x: rw.x0 + 40, z: rw.z0, yaw: -Math.PI / 2 };
  }
  return out;
}
