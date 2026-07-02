// The Presidential Palace of Velmora — fully explorable: throne room, grand hall,
// state office, war room, banquet hall, library, private quarters, underground
// bunker with command center + armory, a secret tunnel to the gardens, parade
// ground, helipad, barracks, motor pool and walled perimeter with checkpoints.
import * as THREE from 'three';
import { GeomBatcher, getBoxGeom, makeCanvasTex } from '../core/utils.js';

// vertical structure
const F0 = 36;                 // ground floor walking surface (plateau h)
const SLAB0_BOT = 35.7, SLAB0_TOP = 36.1;
const H0 = 7;                  // ground ceiling
const F1 = 43.6, H1 = 5;       // slab 43.0..43.6
const F2 = 49.2, H2 = 4.6;     // slab 48.6..49.2
const ROOF = 53.8, ROOF_TOP = 54.4;
const B0 = 30;                 // basement floor
const BX0 = 18, BX1 = 80, BZ0 = -102, BZ1 = -18;   // basement extent

export function buildPalace(ctx) {
  const { scene, mats: M, world } = ctx;
  const col = world.colliders;
  const group = new THREE.Group();
  group.name = 'palace';
  const batch = new GeomBatcher();
  const rooms = [];
  const out = {
    paradeGround: { x: 145, z: 60 },
    helipad: { x: -145, z: 60 },
    gateSpawn: { x: 0, z: 200 },
    barracksSpawn: { x: -150, z: 100 },
    officeDesk: new THREE.Vector3(61, F0, -86),
    throne: new THREE.Vector3(0, F0, -92),
    warRoomSeats: [],
    commandSeats: [],
    advisorSpots: [],
    servantSpots: [],
    patrolRoutes: [],
    posts: [],
    parkedVehicles: [],
    flags: [],
  };

  const addRoom = (name, x0, z0, x1, z1, y = F0) => rooms.push({ name, x0, z0, x1, z1, y0: y - 1, y1: y + 6 });

  // ---------- helpers ----------
  const solid = (w, h, d, mat, x, y, z, rotY = 0, collide = true) => {
    batch.box(w, h, d, mat, x, y, z, rotY);
    if (collide) col.addBoxCentered(x, y - h / 2, z, w, h, d, rotY);
  };
  const deco = (w, h, d, mat, x, y, z, rotY = 0) => batch.box(w, h, d, mat, x, y, z, rotY);

  // wall along X (varying x, fixed z). openings: [{a, b, top}] in x coords, top = height of gap
  function wallX(x0, x1, z, y0, h, mat, openings = [], t = 0.5) {
    const segs = [];
    let cur = x0;
    const ops = openings.slice().sort((p, q) => p.a - q.a);
    for (const o of ops) {
      if (o.a > cur) segs.push([cur, o.a]);
      // lintel above the opening
      const lh = h - o.top;
      if (lh > 0.05) solid(o.b - o.a, lh, t, mat, (o.a + o.b) / 2, y0 + o.top + lh / 2, z);
      cur = o.b;
    }
    if (cur < x1) segs.push([cur, x1]);
    for (const [a, b] of segs) solid(b - a, h, t, mat, (a + b) / 2, y0 + h / 2, z);
  }
  function wallZ(z0, z1, x, y0, h, mat, openings = [], t = 0.5) {
    const segs = [];
    let cur = z0;
    const ops = openings.slice().sort((p, q) => p.a - q.a);
    for (const o of ops) {
      if (o.a > cur) segs.push([cur, o.a]);
      const lh = h - o.top;
      if (lh > 0.05) solid(t, lh, o.b - o.a, mat, x, y0 + o.top + lh / 2, (o.a + o.b) / 2);
      cur = o.b;
    }
    if (cur < z1) segs.push([cur, z1]);
    for (const [a, b] of segs) solid(t, h, b - a, mat, x, y0 + h / 2, (a + b) / 2);
  }
  // rectangular slab (floor/ceiling) with rectangular holes
  function slab(x0, z0, x1, z1, yBot, yTop, mat, holes = []) {
    // subdivide: simple row split around holes
    let rects = [[x0, z0, x1, z1]];
    for (const h of holes) {
      const next = [];
      for (const [a, b, c, d] of rects) {
        if (h[0] >= c || h[2] <= a || h[1] >= d || h[3] <= b) { next.push([a, b, c, d]); continue; }
        if (h[1] > b) next.push([a, b, c, h[1]]);
        if (h[3] < d) next.push([a, h[3], c, d]);
        const zb = Math.max(b, h[1]), zt = Math.min(d, h[3]);
        if (h[0] > a) next.push([a, zb, h[0], zt]);
        if (h[2] < c) next.push([h[2], zb, c, zt]);
      }
      rects = next;
    }
    for (const [a, b, c, d] of rects) {
      solid(c - a, yTop - yBot, d - b, mat, (a + c) / 2, (yBot + yTop) / 2, (b + d) / 2);
    }
  }
  function stairs(x, z, w, axis, dir, y0, y1, len, mat) {
    const n = Math.max(6, Math.round(len / 0.95));
    const rise = (y1 - y0) / n, depth = len / n;
    for (let i = 0; i < n; i++) {
      const d0 = (i + 0.5) * depth * dir;
      const sx = axis === 'x' ? x + d0 : x;
      const sz = axis === 'z' ? z + d0 : z;
      const top = y0 + (i + 1) * rise;
      const hgt = (i + 1) * rise + 0.25;
      solid(axis === 'x' ? depth : w, hgt, axis === 'z' ? depth : w, mat, sx, top - hgt / 2, sz);
    }
  }
  const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 10);
  function column(r, h, mat, x, y, z) {
    const m = new THREE.Matrix4().makeScale(r, h, r).setPosition(x, y + h / 2, z);
    batch.add(cylGeo, mat, m);
    col.addBoxCentered(x, y, z, r * 2, h, r * 2);
  }

  // flag texture: crimson field, gold sunburst — the fictional state flag
  const flagTex = makeCanvasTex(128, 80, (c, w, h) => {
    c.fillStyle = '#8e1f2f'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#d8b04a'; c.lineWidth = 3;
    c.strokeRect(3, 3, w - 6, h - 6);
    const cx = w / 2, cy = h / 2;
    c.fillStyle = '#d8b04a';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      c.beginPath();
      c.moveTo(cx + Math.cos(a - 0.09) * 10, cy + Math.sin(a - 0.09) * 10);
      c.lineTo(cx + Math.cos(a) * 24, cy + Math.sin(a) * 24);
      c.lineTo(cx + Math.cos(a + 0.09) * 10, cy + Math.sin(a + 0.09) * 10);
      c.fill();
    }
    c.beginPath(); c.arc(cx, cy, 9, 0, 7); c.fill();
  });
  world.flagTexture = flagTex;
  function flagpole(x, z, y0, h = 14) {
    deco(0.25, h, 0.25, M.metal, x, y0 + h / 2, z);
    const geo = new THREE.PlaneGeometry(6, 3.6, 10, 4);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.9 }));
    mesh.position.set(x + 3.1, y0 + h - 2.2, z);
    mesh.castShadow = true;
    group.add(mesh);
    out.flags.push(mesh);
    world.flags.push(mesh);
  }

  // =====================================================================
  // COMPOUND PERIMETER — wall, gates, checkpoints, towers
  // =====================================================================
  const WX = 220, WZ = 180, WH = 5;
  wallX(-WX, -8, WZ, F0, WH, M.stone);          // south wall w/ main gate gap
  wallX(8, WX, WZ, F0, WH, M.stone);
  wallX(-WX, WX, -WZ, F0, WH, M.stone);
  wallZ(-WZ, -6, -WX, F0, WH, M.stone);
  wallZ(6, WZ, -WX, F0, WH, M.stone);           // west pedestrian gate
  wallZ(-WZ, WZ, WX, F0, WH, M.stone);
  // gate pylons + arch
  for (const gx of [-9.5, 9.5]) solid(3, 8, 3, M.marbleDark, gx, F0 + 4, WZ);
  deco(22, 1.6, 3, M.marbleDark, 0, F0 + 8.2, WZ);
  // checkpoint booths + barrier arms at main gate
  for (const gx of [-14, 14]) {
    solid(4, 3.2, 4, M.whitewash, gx, F0 + 1.6, WZ + 6);
    deco(4.4, 0.3, 4.4, M.roofSlate, gx, F0 + 3.4, WZ + 6);
  }
  deco(9, 0.18, 0.25, M.roofSlate, -4.5, F0 + 1.1, WZ + 8);   // barrier arms (visual)
  deco(9, 0.18, 0.25, M.roofSlate, 4.5, F0 + 1.1, WZ + 8);
  // corner watchtowers
  for (const [tx, tz] of [[-WX, -WZ], [WX, -WZ], [-WX, WZ], [WX, WZ]]) {
    solid(6, 9, 6, M.stone, tx, F0 + 4.5, tz);
    deco(7.2, 0.5, 7.2, M.stoneDark, tx, F0 + 9.3, tz);
    deco(5, 2.6, 5, M.whitewash, tx, F0 + 10.8, tz);
    deco(6, 0.4, 6, M.roofSlate, tx, F0 + 12.3, tz);
  }
  out.posts.push(
    { x: -6, z: WZ + 4, yaw: 0, kind: 'checkpoint' }, { x: 6, z: WZ + 4, yaw: 0, kind: 'checkpoint' },
    { x: -14, z: WZ - 4, yaw: 0, kind: 'checkpoint' }, { x: 14, z: WZ - 4, yaw: 0, kind: 'checkpoint' },
  );
  // perimeter patrol loop
  out.patrolRoutes.push([
    new THREE.Vector3(-208, F0, 168), new THREE.Vector3(-208, F0, -168),
    new THREE.Vector3(208, F0, -168), new THREE.Vector3(208, F0, 168),
  ]);
  out.patrolRoutes.push([
    new THREE.Vector3(-100, F0, 150), new THREE.Vector3(-190, F0, 60), new THREE.Vector3(-190, F0, -100),
    new THREE.Vector3(-100, F0, -150), new THREE.Vector3(-40, F0, -130),
  ]);
  out.patrolRoutes.push([
    new THREE.Vector3(100, F0, 150), new THREE.Vector3(190, F0, 60), new THREE.Vector3(190, F0, -100),
    new THREE.Vector3(100, F0, -150), new THREE.Vector3(40, F0, -130),
  ]);

  // =====================================================================
  // MAIN BUILDING SHELL  x[-80,80] z[-100,-20]
  // =====================================================================
  const MX = 80, MZ0 = -100, MZ1 = -20;
  // ground slab (also bunker ceiling) — holes: east stairwell down, office secret ladder
  slab(-MX, MZ0, MX, MZ1, SLAB0_BOT, SLAB0_TOP, M.marble, [
    [62, -64, 78, -56],       // basement stair void
    [64.8, -94.2, 68.2, -90.8], // secret ladder shaft
  ]);
  // hidden hatch covering the shaft (toggled from the office bookshelf side)
  const hatch = { open: false, colId: col.addBoxCentered(66.5, SLAB0_BOT, -92.5, 3.6, 0.4, 3.6) };
  hatch.mesh = new THREE.Mesh(getBoxGeom(3.6, 0.4, 3.6), M.woodDark);
  hatch.mesh.position.set(66.5, SLAB0_BOT + 0.2, -92.5);
  group.add(hatch.mesh);
  // exterior walls, ground
  wallX(-MX, MX, MZ1, F0, H0, M.plaster, [{ a: -4.5, b: 4.5, top: 5.5 }]);            // south, grand doors
  wallX(-MX, MX, MZ0, F0, H0, M.plaster);
  wallZ(MZ0, MZ1, -MX, F0, H0, M.plaster);
  wallZ(MZ0, MZ1, MX, F0, H0, M.plaster, [{ a: -32, b: -28, top: 3.2 }]);             // east service door (into reception)
  // interior ground walls
  wallZ(MZ0, MZ1, -20, F0, H0, M.plaster, [{ a: -64, b: -56, top: 4 }]);              // west corridor mouth
  wallZ(MZ0, MZ1, 20, F0, H0, M.plaster, [{ a: -64, b: -56, top: 4 }]);               // east corridor mouth
  wallX(-20, 20, -60, F0, H0, M.marbleDark, [{ a: -7, b: 7, top: 6 }]);               // throne arch
  // east wing partitions
  wallX(20, MX, -64, F0, H0, M.plaster, [{ a: 30, b: 33.5, top: 3 }, { a: 58, b: 61.5, top: 3 }]);
  wallX(20, MX, -56, F0, H0, M.plaster, [{ a: 30, b: 33.5, top: 3 }, { a: 58, b: 61.5, top: 3 }]);
  wallZ(MZ0, -64, 44, F0, H0, M.plaster);
  wallZ(-56, MZ1, 44, F0, H0, M.plaster);
  // west wing partitions (mirror)
  wallX(-MX, -20, -64, F0, H0, M.plaster, [{ a: -61.5, b: -58, top: 3 }, { a: -33.5, b: -30, top: 3 }]);
  wallX(-MX, -20, -56, F0, H0, M.plaster, [{ a: -61.5, b: -58, top: 3 }, { a: -33.5, b: -30, top: 3 }]);
  wallZ(MZ0, -64, -44, F0, H0, M.plaster);
  wallZ(-56, MZ1, -44, F0, H0, M.plaster);

  addRoom('Grand Hall', -20, -60, 20, -20);
  addRoom('Throne Room', -20, -100, 20, -60);
  addRoom('East Corridor', 20, -64, 80, -56);
  addRoom('War Room', 20, -100, 44, -64);
  addRoom("Office of the Supreme Marshal", 44, -100, 80, -64);
  addRoom('Intelligence Suite', 20, -56, 44, -20);
  addRoom('State Reception', 44, -56, 80, -20);
  addRoom('West Corridor', -80, -64, -20, -56);
  addRoom('Banquet Hall', -80, -100, -44, -64);
  addRoom('State Library', -44, -100, -20, -64);
  addRoom('Palace Kitchen', -80, -56, -44, -20);
  addRoom("Servants' Hall", -44, -56, -20, -20);

  // FLOOR 2 slab — gallery opening over grand hall + stair voids
  slab(-MX, MZ0, MX, MZ1, F1 - 0.6, F1, M.marbleDark, [
    [-12, -56, 12, -24],     // gallery void over grand hall
    [12, -46, 20, -22],      // east grand stair void
    [-20, -46, -12, -22],    // west grand stair void
  ]);
  // grand stairs hall -> floor2 (two runs along hall side walls)
  stairs(16, -24, 7, 'z', -1, SLAB0_TOP, F1, 22, M.marble);
  stairs(-16, -24, 7, 'z', -1, SLAB0_TOP, F1, 22, M.marble);
  // gallery railings
  for (const rx of [-12.6, 12.6]) solid(0.3, 1.1, 32, M.marbleDark, rx, F1 + 0.55, -40);
  solid(25.5, 1.1, 0.3, M.marbleDark, 0, F1 + 0.55, -56.6);
  solid(25.5, 1.1, 0.3, M.marbleDark, 0, F1 + 0.55, -23.4);
  // exterior walls floor 2
  wallX(-MX, MX, MZ1, F1, H1, M.plaster);
  wallX(-MX, MX, MZ0, F1, H1, M.plaster);
  wallZ(MZ0, MZ1, -MX, F1, H1, M.plaster);
  wallZ(MZ0, MZ1, MX, F1, H1, M.plaster);
  // floor2 partitions: private quarters west, guest offices east
  wallZ(MZ0, MZ1, -24, F1, H1, M.plaster, [{ a: -64, b: -56, top: 3 }]);
  wallZ(MZ0, MZ1, 24, F1, H1, M.plaster, [{ a: -64, b: -56, top: 3 }]);
  wallX(-MX, -24, -64, F1, H1, M.plaster, [{ a: -61.5, b: -58, top: 3 }, { a: -33.5, b: -30, top: 3 }]);
  wallX(24, MX, -64, F1, H1, M.plaster, [{ a: 30, b: 33.5, top: 3 }, { a: 58, b: 61.5, top: 3 }]);
  wallZ(MZ0, -64, -52, F1, H1, M.plaster, [{ a: -86, b: -82, top: 3 }]);
  wallZ(MZ0, -64, 52, F1, H1, M.plaster, [{ a: -86, b: -82, top: 3 }]);
  addRoom("Marshal's Bedchamber", -80, -100, -52, -64, F1);
  addRoom('Private Study', -52, -100, -24, -64, F1);
  addRoom('Gallery', -24, -60, 24, -20, F1);
  addRoom('Guest Suite', 52, -100, 80, -64, F1);
  addRoom('Officials Wing', 24, -100, 52, -64, F1);
  // stairs floor2 -> floor3 (ascends westward from x=70 to x=54)
  stairs(70, -60, 7, 'x', -1, F1, F2, 16, M.marble);

  // FLOOR 3 slab + open staff floor with columns
  slab(-MX, MZ0, MX, MZ1, F2 - 0.6, F2, M.marbleDark, [[53.5, -64, 71, -56]]);
  wallX(-MX, MX, MZ1, F2, H2, M.plaster);
  wallX(-MX, MX, MZ0, F2, H2, M.plaster);
  wallZ(MZ0, MZ1, -MX, F2, H2, M.plaster);
  wallZ(MZ0, MZ1, MX, F2, H2, M.plaster);
  for (let cx = -60; cx <= 60; cx += 24) for (const cz of [-75, -45]) column(0.5, H2, M.marble, cx, F2, cz);
  addRoom('State Archives', -80, -100, 80, -20, F2);
  // archive shelves + desks
  for (let sx = -64; sx <= -20; sx += 11) solid(1.2, 2.4, 24, M.woodDark, sx, F2 + 1.2, -84);
  for (let dx = 8; dx <= 64; dx += 14) {
    deco(3, 0.9, 1.6, M.wood, dx, F2 + 0.45, -40);
    deco(0.8, 1, 0.8, M.woodDark, dx, F2 + 0.5, -38.4);
  }

  // ROOF + parapet + dome + flags
  slab(-MX, MZ0, MX, MZ1, ROOF, ROOF_TOP, M.stoneDark);
  wallX(-MX, MX, MZ1 + 0.4, ROOF_TOP, 1, M.stone, [], 0.8);
  wallX(-MX, MX, MZ0 - 0.4 + 0.8, ROOF_TOP, 1, M.stone, [], 0.8);
  wallZ(MZ0, MZ1, -MX + 0.4, ROOF_TOP, 1, M.stone, [], 0.8);
  wallZ(MZ0, MZ1, MX - 0.4, ROOF_TOP, 1, M.stone, [], 0.8);
  {
    const domeGeo = new THREE.SphereGeometry(15, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const dome = new THREE.Mesh(domeGeo, M.gold);
    dome.position.set(0, ROOF_TOP, -60);
    dome.castShadow = true;
    group.add(dome);
    deco(2.2, 5, 2.2, M.marble, 0, ROOF_TOP + 15.5, -60);
    flagpole(0, -60, ROOF_TOP + 17.2, 8);
  }
  flagpole(-74, -96, ROOF_TOP, 9);
  flagpole(74, -96, ROOF_TOP, 9);
  // portico: columns + pediment at the south entrance
  for (const px of [-12, -7.2, 7.2, 12]) column(0.9, H0 + 0.6, M.marble, px, F0, -14.5);
  deco(30, 1.8, 9, M.marble, 0, F0 + H0 + 1.3, -17.5);
  deco(26, 1.2, 7, M.marbleDark, 0, F0 + H0 + 2.6, -17.5);
  // facade window strips (visual)
  for (let wx = -72; wx <= 72; wx += 9) {
    if (Math.abs(wx) < 16) continue;
    deco(3.4, 3.6, 0.15, M.glassDark, wx, F0 + 4, MZ1 - 0.35);
    deco(3.4, 2.6, 0.15, M.glassDark, wx, F1 + 2.2, MZ1 - 0.35);
    deco(3.4, 2.2, 0.15, M.glassDark, wx, F2 + 2, MZ1 - 0.35);
    deco(3.4, 3.6, 0.15, M.glassDark, wx, F0 + 4, MZ0 + 0.35);
    deco(3.4, 2.6, 0.15, M.glassDark, wx, F1 + 2.2, MZ0 + 0.35);
  }

  // =====================================================================
  // BASEMENT BUNKER
  // =====================================================================
  slab(BX0, BZ0, BX1, BZ1, B0 - 0.4, B0 + 0.05, M.concrete);
  wallX(BX0, BX1, BZ1, B0, 5.65, M.concrete, [{ a: 29, b: 34, top: 3 }]);   // tunnel mouth
  wallX(BX0, BX1, BZ0, B0, 5.65, M.concrete);
  wallZ(BZ0, BZ1, BX0, B0, 5.65, M.concrete);
  wallZ(BZ0, BZ1, BX1, B0, 5.65, M.concrete);
  // corridor z[-64,-56]
  wallX(BX0, BX1, -64, B0, 5.65, M.concrete, [{ a: 30, b: 34, top: 2.6 }, { a: 60, b: 64, top: 2.6 }]);
  wallX(BX0, 62, -56, B0, 5.65, M.concrete, [{ a: 30, b: 34, top: 2.6 }, { a: 48, b: 52, top: 2.6 }]);
  wallX(62, BX1, -56, B0, 5.65, M.concrete);   // seal stairwell from generator room
  wallZ(BZ0, -64, 48, B0, 5.65, M.concrete);   // command | armory divider
  wallZ(-56, BZ1, 48, B0, 5.65, M.concrete);   // quarters | generator divider
  addRoom('Command Centre', 18, -102, 48, -64, B0);
  addRoom('Palace Armoury', 48, -102, 80, -64, B0);
  addRoom('Bunker Quarters', 18, -56, 48, -18, B0);
  addRoom('Generator Room', 48, -56, 80, -18, B0);
  addRoom('Bunker Corridor', 18, -64, 80, -56, B0);
  // stairwell from east corridor down (top lands at x=62 beside the ground corridor)
  stairs(78, -60, 7.6, 'x', -1, B0 + 0.05, SLAB0_TOP, 16, M.concrete);
  // command centre kit: console rows + map table + screens
  for (let rz = -95; rz <= -75; rz += 7) {
    solid(16, 1, 1.4, M.gunmetal, 32, B0 + 0.5, rz);
    for (let sx = 25; sx <= 39; sx += 3.5) {
      deco(2.6, 1.4, 0.15, M.screenGlow, sx, B0 + 1.8, rz - 0.55);
      out.commandSeats.push(new THREE.Vector3(sx, B0, rz + 1.6));
    }
  }
  deco(26, 4, 0.3, M.screenGlow, 33, B0 + 3.2, -101.4);
  solid(7, 1.1, 4.5, M.gunmetal, 32, B0 + 0.55, -69);   // map table
  // armory kit: racks, crates, lockers
  for (let rz = -98; rz <= -70; rz += 7) {
    solid(1, 2.6, 5.5, M.gunmetal, 52, B0 + 1.3, rz);
    solid(1, 2.6, 5.5, M.gunmetal, 76, B0 + 1.3, rz);
  }
  for (let i = 0; i < 8; i++) solid(1.6, 1.2, 1.6, M.camoDark, 58 + (i % 4) * 4, B0 + 0.6, -92 + Math.floor(i / 4) * 5);
  // generator room: humming blocks
  for (let gx = 54; gx <= 74; gx += 7) solid(4, 2.4, 3, M.gunmetal, gx, B0 + 1.2, -36);
  // bunker quarters: bunks
  for (let bz = -50; bz <= -26; bz += 6) {
    solid(2.2, 0.6, 5, M.camoDark, 22.5, B0 + 0.5, bz);
    solid(2.2, 0.6, 5, M.camoDark, 43.5, B0 + 0.5, bz);
  }
  // secret ladder shaft office->armory (hole already in slab); ladder visual
  deco(0.4, 6.2, 0.2, M.metal, 66.5, B0 + 3.1, -94.8);
  for (let ly = 0.6; ly < 6; ly += 0.5) deco(0.7, 0.06, 0.06, M.metal, 66.5, B0 + ly, -94.7);

  // secret tunnel bunker -> garden gazebo  (x 28..35, z -18..126)
  {
    const TX0 = 28.5, TX1 = 34.5;
    slab(TX0, -18, TX1, 114, B0 - 0.4, B0 + 0.05, M.concrete);
    wallZ(-18, 114, TX0, B0, 3.8, M.concrete);
    wallZ(-18, 114, TX1, B0, 3.8, M.concrete);
    slab(TX0 - 0.5, -18, TX1 + 0.5, 114, B0 + 3.8, B0 + 4.3, M.concrete);
    // doorway from bunker quarters south wall: opening in bunker wall at x 30..34 (z=-18 wall)
    // (carve: the bunker south wall above was solid; add explicit opening by overlaying tunnel mouth)
    // stairs up to gazebo
    stairs(31.5, 114, 6, 'z', 1, B0 + 0.05, F0 + 0.1, 13, M.concrete);
    wallZ(114, 127, TX0, B0, 6.4, M.concrete);
    wallZ(114, 127, TX1, B0, 6.4, M.concrete);
    addRoom('Secret Tunnel', 28, -18, 35, 127, B0);
  }
  // underground zones so terrain is ignored below grade
  world.undergroundZones.push(
    { minX: BX0, maxX: BX1, minZ: BZ0, maxZ: BZ1, topY: SLAB0_TOP },
    { minX: 27.5, maxX: 35.5, minZ: -19, maxZ: 128, topY: F0 + 0.1 },
  );

  // =====================================================================
  // INTERIORS — showpiece furnishing
  // =====================================================================
  // red carpet: gate path -> hall -> throne
  deco(6, 0.08, 40, M.redCarpet, 0, F0 + 0.12, -40);
  deco(4, 0.08, 34, M.redCarpet, 0, F0 + 0.12, -78);
  // grand hall columns + chandeliers
  for (const cx of [-14, 14]) for (const cz of [-30, -40, -50]) column(0.8, H0, M.marble, cx, F0, cz);
  for (const [chx, chz] of [[0, -40], [0, -80], [-61, -82]]) {
    deco(2.6, 0.3, 2.6, M.gold, chx, F0 + H0 - 1.4, chz);
    deco(1.8, 0.5, 1.8, M.lampGlow, chx, F0 + H0 - 1.75, chz);
  }
  // throne dais + throne
  for (let i = 0; i < 3; i++) solid(16 - i * 3, 0.35, 8 - i * 2, M.marbleDark, 0, F0 + 0.175 + i * 0.35, -92 + i * 0.4);
  solid(2.2, 3.4, 1.2, M.gold, 0, F0 + 1.05 + 1.7, -94.5);
  deco(2.6, 0.5, 1.8, M.redCarpet, 0, F0 + 1.05 + 0.55, -93.9);
  deco(0.5, 5.5, 0.5, M.gold, -3.6, F0 + 1.05 + 2.75, -94.5);
  deco(0.5, 5.5, 0.5, M.gold, 3.6, F0 + 1.05 + 2.75, -94.5);
  // wall banners in throne room
  for (const bx of [-16, -8, 8, 16]) {
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 5), new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide }));
    banner.position.set(bx, F0 + 4.4, -99.6);
    group.add(banner);
  }
  // office of the Supreme Marshal
  solid(4.4, 0.95, 2.2, M.woodDark, 61, F0 + 0.475, -86);            // desk
  deco(1.1, 1.5, 1.1, M.redCarpet, 61, F0 + 0.75, -88.6);            // chair
  deco(7, 0.08, 10, M.blueCarpet, 61, F0 + 0.12, -84);
  solid(10, 3.4, 0.8, M.woodDark, 55, F0 + 1.7, -99.4, 0, false);    // bookshelf wall (visual)
  col.addBoxCentered(52, F0, -99.4, 16, 3.4, 0.8);                    // solid part of shelf run
  solid(3.2, 1, 1, M.wood, 70, F0 + 0.5, -70);                        // side table
  deco(2.6, 0.9, 1.2, M.suitDark, 74, F0 + 0.45, -80);                // couch
  flagpoleInterior(61 - 3, -89);
  flagpoleInterior(61 + 3, -89);
  function flagpoleInterior(x, z) {
    deco(0.16, 3.4, 0.16, M.gold, x, F0 + 1.7, z);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1), new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide }));
    f.position.set(x + 0.85, F0 + 2.9, z);
    group.add(f);
  }
  // war room
  solid(12, 1.05, 4.5, M.woodDark, 32, F0 + 0.525, -82);
  for (let i = 0; i < 6; i++) {
    out.warRoomSeats.push(new THREE.Vector3(27 + i * 2, F0, -79));
    out.warRoomSeats.push(new THREE.Vector3(27 + i * 2, F0, -85));
    deco(0.9, 1.1, 0.9, M.woodDark, 27 + i * 2, F0 + 0.55, -78.6);
    deco(0.9, 1.1, 0.9, M.woodDark, 27 + i * 2, F0 + 0.55, -85.4);
  }
  deco(14, 5, 0.25, M.screenGlow, 32, F0 + 3.4, -99.5);   // situation screen
  deco(0.3, 4, 8, M.screenRed, 20.5, F0 + 3, -82);        // side map board
  // intelligence suite
  for (let dz = -50; dz <= -28; dz += 8) {
    solid(3, 0.9, 1.6, M.wood, 26, F0 + 0.45, dz);
    solid(3, 0.9, 1.6, M.wood, 38, F0 + 0.45, dz);
    out.advisorSpots.push(new THREE.Vector3(26, F0, dz + 1.8), new THREE.Vector3(38, F0, dz + 1.8));
    deco(1.6, 1.1, 0.12, M.screenGlow, 26, F0 + 1.4, dz - 0.7);
    deco(1.6, 1.1, 0.12, M.screenGlow, 38, F0 + 1.4, dz - 0.7);
  }
  // reception
  deco(5, 0.9, 2, M.wood, 62, F0 + 0.45, -30);
  for (const sx of [52, 72]) deco(2.6, 0.9, 1.2, M.suitDark, sx, F0 + 0.45, -26);
  out.advisorSpots.push(new THREE.Vector3(62, F0, -34), new THREE.Vector3(52, F0, -30));
  // banquet hall
  for (const tz of [-90, -82, -74]) {
    solid(24, 1, 2.6, M.woodDark, -61, F0 + 0.5, tz);
    for (let cx = -71; cx <= -51; cx += 4) {
      deco(0.8, 1, 0.8, M.wood, cx, F0 + 0.5, tz - 2.2);
      deco(0.8, 1, 0.8, M.wood, cx, F0 + 0.5, tz + 2.2);
    }
  }
  out.servantSpots.push(new THREE.Vector3(-61, F0, -78), new THREE.Vector3(-52, F0, -88), new THREE.Vector3(-70, F0, -70));
  // library
  for (let sz = -96; sz <= -72; sz += 6) solid(6, 2.8, 1.1, M.woodDark, -32, F0 + 1.4, sz);
  deco(3, 0.9, 1.8, M.wood, -32, F0 + 0.45, -67.5);
  out.advisorSpots.push(new THREE.Vector3(-32, F0, -68.5));
  // kitchen
  for (let kx = -76; kx <= -50; kx += 5) solid(4, 1, 1.6, M.metal, kx + 2, F0 + 0.5, -52.5);
  solid(8, 1, 2.4, M.metal, -62, F0 + 0.5, -38);
  out.servantSpots.push(new THREE.Vector3(-62, F0, -42), new THREE.Vector3(-70, F0, -49), new THREE.Vector3(-54, F0, -35));
  // servants' hall
  for (const tz of [-44, -34]) solid(6, 0.95, 2.2, M.wood, -32, F0 + 0.475, tz);
  out.servantSpots.push(new THREE.Vector3(-32, F0, -39), new THREE.Vector3(-26, F0, -30));
  // floor 2: bedchamber
  solid(5, 0.9, 6.4, M.redCarpet, -70, F1 + 0.45, -88);
  deco(5.4, 1.6, 0.5, M.woodDark, -70, F1 + 0.8, -91.4);
  solid(3, 2.6, 1.2, M.woodDark, -58, F1 + 1.3, -97);
  deco(8, 0.08, 9, M.blueCarpet, -68, F1 + 0.1, -80);
  // private study
  solid(3.6, 0.95, 1.8, M.woodDark, -38, F1 + 0.475, -90);
  for (let sz2 = -98; sz2 <= -92; sz2 += 3) solid(4, 2.4, 0.9, M.woodDark, -30, F1 + 1.2, sz2);
  // guest suite + officials wing furniture
  for (const gx of [30, 44, 60, 74]) {
    solid(3, 0.9, 1.6, M.wood, gx, F1 + 0.45, -90);
    out.advisorSpots.push(new THREE.Vector3(gx, F1, -87));
  }

  // =====================================================================
  // GROUNDS — gardens, fountain, gazebo, parade ground, helipad, barracks, motor pool
  // =====================================================================
  // marble path gate->palace
  deco(10, 0.1, 200, M.marbleDark, 0, F0 + 0.06, 80);
  // fountain plaza
  {
    const plaza = new THREE.Mesh(new THREE.CylinderGeometry(22, 22, 0.15, 28), M.marbleDark);
    plaza.position.set(0, F0 + 0.08, 60);
    plaza.receiveShadow = true;
    group.add(plaza);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(8, 8.6, 1.1, 22), M.marble);
    rim.position.set(0, F0 + 0.55, 60);
    rim.castShadow = true;
    group.add(rim);
    col.addBoxCentered(0, F0, 60, 16, 1.1, 16);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(7.6, 7.6, 0.2, 22), new THREE.MeshStandardMaterial({ color: 0x3f7d9b, roughness: 0.1, metalness: 0.6, transparent: true, opacity: 0.85 }));
    water.position.set(0, F0 + 0.9, 60);
    group.add(water);
    column(0.6, 3.2, M.marble, 0, F0 + 0.9, 60);
    world.fountains.push(new THREE.Vector3(0, F0 + 4.2, 60));
  }
  // hedge parterre (instanced)
  {
    const hedgeGeo = getBoxGeom(10, 1.4, 1.2);
    const positions = [];
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        positions.push([sx * (18 + i * 14), F0 + 0.7, 24, 0]);
        positions.push([sx * (18 + i * 14), F0 + 0.7, 96, 0]);
        positions.push([sx * (12 + i * 14), F0 + 0.7, 140, 0]);
      }
      for (let i = 0; i < 4; i++) {
        positions.push([sx * 88, F0 + 0.7, 34 + i * 18, Math.PI / 2]);
        positions.push([sx * 46, F0 + 0.7, 116 + i * 12, Math.PI / 2]);
      }
    }
    const inst = new THREE.InstancedMesh(hedgeGeo, M.hedge, positions.length);
    const m4 = new THREE.Matrix4();
    positions.forEach(([x, y, z, r], i) => {
      m4.makeRotationY(r).setPosition(x, y, z);
      inst.setMatrixAt(i, m4);
      col.addBoxCentered(x, F0, z, 10, 1.4, 1.2, r);
    });
    inst.castShadow = true;
    group.add(inst);
  }
  // statues flanking the path
  for (const sx of [-14, 14]) for (const sz of [110, 160]) {
    solid(2, 1.6, 2, M.marbleDark, sx, F0 + 0.8, sz);
    deco(0.9, 2.6, 0.9, M.marble, sx, F0 + 2.9, sz);
    deco(1.1, 0.7, 0.7, M.marble, sx, F0 + 4.4, sz);
  }
  // gazebo hiding the tunnel exit
  {
    const gz = 121, gx = 31.5;
    for (const [ox, oz] of [[-3.4, -3.4], [3.4, -3.4], [-3.4, 3.4], [3.4, 3.4]]) column(0.35, 3.6, M.marble, gx + ox, F0, gz + oz);
    const roofG = new THREE.Mesh(new THREE.ConeGeometry(6, 2.4, 8), M.roofCopper);
    roofG.position.set(gx, F0 + 4.8, gz);
    roofG.castShadow = true;
    group.add(roofG);
  }
  // parade ground
  deco(110, 0.12, 76, M.parade, out.paradeGround.x, F0 + 0.07, out.paradeGround.z);
  for (let i = 0; i < 5; i++) flagpole(out.paradeGround.x - 44 + i * 22, out.paradeGround.z - 41, F0, 12);
  // review stand
  solid(14, 1.4, 6, M.marbleDark, out.paradeGround.x, F0 + 0.7, out.paradeGround.z + 41);
  stairs(out.paradeGround.x, out.paradeGround.z + 38, 6, 'z', -1, F0, F0 + 1.4, 3, M.marbleDark);
  // helipad
  {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 0.3, 24), M.parade);
    pad.position.set(out.helipad.x, F0 + 0.15, out.helipad.z);
    pad.receiveShadow = true;
    group.add(pad);
    const hTex = makeCanvasTex(128, 128, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      c.strokeStyle = '#d8b04a'; c.lineWidth = 6;
      c.beginPath(); c.arc(w / 2, h / 2, 52, 0, 7); c.stroke();
      c.lineWidth = 12;
      c.beginPath(); c.moveTo(45, 36); c.lineTo(45, 92); c.moveTo(83, 36); c.lineTo(83, 92); c.moveTo(45, 64); c.lineTo(83, 64); c.stroke();
    });
    const hMark = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), new THREE.MeshBasicMaterial({ map: hTex, transparent: true }));
    hMark.rotation.x = -Math.PI / 2;
    hMark.position.set(out.helipad.x, F0 + 0.32, out.helipad.z);
    group.add(hMark);
  }
  // barracks (SW)
  {
    const bx = -150, bz = 120, w = 40, d = 18, h = 4.5;
    slab(bx - w / 2, bz - d / 2, bx + w / 2, bz + d / 2, F0 - 0.2, F0 + 0.1, M.concrete);
    wallX(bx - w / 2, bx + w / 2, bz - d / 2, F0, h, M.whitewash, [{ a: bx - 2, b: bx + 2, top: 3 }]);
    wallX(bx - w / 2, bx + w / 2, bz + d / 2, F0, h, M.whitewash);
    wallZ(bz - d / 2, bz + d / 2, bx - w / 2, F0, h, M.whitewash);
    wallZ(bz - d / 2, bz + d / 2, bx + w / 2, F0, h, M.whitewash);
    slab(bx - w / 2 - 1, bz - d / 2 - 1, bx + w / 2 + 1, bz + d / 2 + 1, F0 + h, F0 + h + 0.5, M.roofSlate);
    for (let i = 0; i < 8; i++) solid(2.2, 0.6, 5, M.camoDark, bx - 16 + i * 4.5, F0 + 0.4, bz + 2);
    addRoom('Palace Barracks', bx - w / 2, bz - d / 2, bx + w / 2, bz + d / 2);
    flagpole(bx + 24, bz, F0, 10);
  }
  // motor pool (NE): open canopy garage
  {
    const gx2 = 150, gz2 = -120;
    deco(70, 0.15, 34, M.parade, gx2, F0 + 0.08, gz2);
    for (let i = 0; i < 5; i++) {
      column(0.5, 5.5, M.concrete, gx2 - 30 + i * 15, F0, gz2 - 15);
      column(0.5, 5.5, M.concrete, gx2 - 30 + i * 15, F0, gz2 + 15);
    }
    slab(gx2 - 34, gz2 - 17, gx2 + 34, gz2 + 17, F0 + 5.5, F0 + 6.1, M.roofSlate);
    out.parkedVehicles.push(
      { type: 'limo', x: gx2 - 24, z: gz2, rotY: Math.PI / 2 },
      { type: 'limo', x: gx2 - 12, z: gz2, rotY: Math.PI / 2 },
      { type: 'apc', x: gx2 + 2, z: gz2, rotY: Math.PI / 2 },
      { type: 'truck', x: gx2 + 16, z: gz2, rotY: Math.PI / 2 },
      { type: 'jeep', x: gx2 + 28, z: gz2, rotY: Math.PI / 2 },
    );
    out.parkedVehicles.push({ type: 'heli', x: out.helipad.x, z: out.helipad.z, rotY: Math.PI / 2 });
  }
  // interior static posts
  out.posts.push(
    { x: -5.5, z: -21.5, yaw: 0, kind: 'door' }, { x: 5.5, z: -21.5, yaw: 0, kind: 'door' },
    { x: -5, z: -88, yaw: 0, kind: 'throne' }, { x: 5, z: -88, yaw: 0, kind: 'throne' },
    { x: 57, z: -66.5, yaw: 0, kind: 'office' }, { x: 65, z: -66.5, yaw: 0, kind: 'office' },
    { x: -12, z: -58, yaw: Math.PI / 2, kind: 'hall' }, { x: 12, z: -58, yaw: -Math.PI / 2, kind: 'hall' },
    { x: out.helipad.x + 16, z: out.helipad.z, yaw: Math.PI / 2, kind: 'helipad' },
    { x: 150, z: -100, yaw: 0, kind: 'motorpool' },
    { x: 58, z: -60, yaw: Math.PI / 2, kind: 'bunkerstair' },
  );
  // anchor all posts to the palace floor so interior guards don't snap to the roof
  for (const p of out.posts) if (p.y === undefined) p.y = F0;
  // garden patrol
  out.patrolRoutes.push([
    new THREE.Vector3(-20, F0, 30), new THREE.Vector3(-70, F0, 60), new THREE.Vector3(-40, F0, 130),
    new THREE.Vector3(0, F0, 150), new THREE.Vector3(40, F0, 130), new THREE.Vector3(70, F0, 60), new THREE.Vector3(20, F0, 30),
  ]);
  // interior patrol
  out.patrolRoutes.push([
    new THREE.Vector3(0, F0, -30), new THREE.Vector3(0, F0, -75), new THREE.Vector3(14, F0, -60),
    new THREE.Vector3(50, F0, -60), new THREE.Vector3(14, F0, -60), new THREE.Vector3(-14, F0, -60), new THREE.Vector3(-50, F0, -60),
  ]);
  // parade/helipad loop
  out.patrolRoutes.push([
    new THREE.Vector3(100, F0, 30), new THREE.Vector3(180, F0, 30), new THREE.Vector3(180, F0, 90), new THREE.Vector3(100, F0, 90),
  ]);

  // interior point lights (always on, tightly bounded)
  // intensities are candela (r160 physical lights — inverse-square falloff)
  const lights = [
    [0, F0 + 5.4, -40, 0xffd9a0, 90, 46],
    [0, F0 + 5.4, -80, 0xffd9a0, 90, 46],
    [50, F0 + 4.5, -60, 0xffe6c0, 30, 30],
    [61, F0 + 4.5, -82, 0xffe6c0, 50, 30],
    [32, F0 + 4.5, -82, 0xcfe2ff, 50, 30],
    [-61, F0 + 5, -80, 0xffd9a0, 65, 36],
    [-61, F0 + 4.5, -42, 0xffe6c0, 40, 30],
    [-32, F0 + 4.5, -40, 0xffe6c0, 30, 26],
    [33, B0 + 4.6, -82, 0x9fd4ff, 60, 38],
    [64, B0 + 4.6, -82, 0xffc9a0, 45, 32],
    [40, B0 + 3.4, -60, 0xffe6c0, 25, 40],
    [33, B0 + 4.6, -38, 0xffe6c0, 35, 32],
    [0, F1 + 4, -40, 0xffd9a0, 40, 34],
    [-66, F1 + 4, -82, 0xffe6c0, 35, 30],
  ];
  for (const [x, y, z, c, i, d] of lights) {
    const L = new THREE.PointLight(c, i, d, 1.8);
    L.position.set(x, y, z);
    group.add(L);
  }

  // ---------- interactables ----------
  const I = world.interactables;
  I.push({
    pos: new THREE.Vector3(61, F0 + 1, -84.5), r: 2.6,
    label: () => 'Open State Administration',
    use: c => c.government.open(),
  });
  I.push({
    pos: new THREE.Vector3(0, F0 + 2, -91), r: 3,
    label: () => 'Sit on the throne',
    use: c => c.player.sitAt(new THREE.Vector3(0, F0 + 2.15, -94.2), Math.PI, 'The court falls silent before the Supreme Marshal.'),
  });
  I.push({
    pos: new THREE.Vector3(-70, F1 + 1, -88), r: 3,
    label: () => 'Rest until morning',
    use: c => c.player.sleep(),
  });
  I.push({
    pos: new THREE.Vector3(52, B0 + 1, -84), r: 3.5,
    label: () => 'Requisition full arsenal',
    use: c => c.weapons.resupplyAll(),
  });
  I.push({
    pos: new THREE.Vector3(66.5, F0 + 1, -89.8), r: 2.4,
    label: () => (hatch.open ? 'Seal the hidden hatch' : 'Open the hidden hatch'),
    use: c => {
      hatch.open = !hatch.open;
      hatch.mesh.visible = !hatch.open;
      if (hatch.open) {
        if (hatch.colId !== null) { col.remove(hatch.colId); hatch.colId = null; }
        c.hud.notify('SECURITY', 'Hidden shaft to the Palace Armoury revealed.', 'mil');
      } else {
        hatch.colId = col.addBoxCentered(66.5, SLAB0_BOT, -92.5, 3.6, 0.4, 3.6);
      }
      c.audio.uiClick();
    },
  });
  I.push({
    pos: new THREE.Vector3(66.5, F0 + 1, -92.5), r: 1.8,
    label: () => (hatch.open ? 'Climb down to the Armoury' : ''),
    use: c => { if (hatch.open) c.player.teleport(66.5, B0 + 0.2, -96.5, 'You descend the hidden shaft.'); },
  });
  I.push({
    pos: new THREE.Vector3(66.5, B0 + 1.5, -94.5), r: 2.2,
    label: () => (hatch.open ? "Climb up to the Marshal's office" : 'The shaft above is sealed'),
    use: c => { if (hatch.open) c.player.teleport(66.5, F0 + 0.2, -89.5, 'You climb back into the office.'); },
  });

  batch.build(group);
  scene.add(group);
  world.rooms.push(...rooms);
  return out;
}
