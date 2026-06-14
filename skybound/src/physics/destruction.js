// destruction.js — bridges static world geometry to the dynamic rigid-body sim.
// Realizes a building into convex part-boxes, slices them with the plane slicer into real
// physics pieces (which inherit mass/momentum and can be re-sliced), and provides debris,
// craters, and explosions. This is the engine behind laser slicing & ground slams.
import * as THREE from 'three';
import { Body } from './physics.js';
import { sliceConvex, meshVolume, meshCentroid, planeFromThreePoints } from './slicer.js';
import { clamp } from '../core/util.js';

// World-space axis-aligned box as triangle soup with per-face 0..1 UVs.
function boxMeshData(center, size) {
  const [cx, cy, cz] = center;
  const hx = size[0] / 2, hy = size[1] / 2, hz = size[2] / 2;
  const positions = [], normals = [], uvs = [];
  const quad = (n, a, b, c, d) => {
    for (const [p, uv] of [[a, [0, 0]], [b, [1, 0]], [c, [1, 1]], [a, [0, 0]], [c, [1, 1]], [d, [0, 1]]]) {
      positions.push(p[0], p[1], p[2]); normals.push(n[0], n[1], n[2]); uvs.push(uv[0], uv[1]);
    }
  };
  const X0 = cx - hx, X1 = cx + hx, Y0 = cy - hy, Y1 = cy + hy, Z0 = cz - hz, Z1 = cz + hz;
  quad([0, 0, 1], [X0, Y0, Z1], [X1, Y0, Z1], [X1, Y1, Z1], [X0, Y1, Z1]);
  quad([0, 0, -1], [X1, Y0, Z0], [X0, Y0, Z0], [X0, Y1, Z0], [X1, Y1, Z0]);
  quad([1, 0, 0], [X1, Y0, Z1], [X1, Y0, Z0], [X1, Y1, Z0], [X1, Y1, Z1]);
  quad([-1, 0, 0], [X0, Y0, Z0], [X0, Y0, Z1], [X0, Y1, Z1], [X0, Y1, Z0]);
  quad([0, 1, 0], [X0, Y1, Z1], [X1, Y1, Z1], [X1, Y1, Z0], [X0, Y1, Z0]);
  quad([0, -1, 0], [X0, Y0, Z0], [X1, Y0, Z0], [X1, Y0, Z1], [X0, Y0, Z1]);
  return { positions, normals, uvs };
}

function transformMeshData(data, mat) {
  const p = data.positions, n = data.normals;
  const out = new Array(p.length), no = new Array(p.length);
  const nm = new THREE.Matrix3().getNormalMatrix(mat);
  const v = new THREE.Vector3(), vn = new THREE.Vector3();
  for (let i = 0; i < p.length; i += 3) {
    v.set(p[i], p[i + 1], p[i + 2]).applyMatrix4(mat);
    out[i] = v.x; out[i + 1] = v.y; out[i + 2] = v.z;
    if (n) { vn.set(n[i], n[i + 1], n[i + 2]).applyMatrix3(nm).normalize(); no[i] = vn.x; no[i + 1] = vn.y; no[i + 2] = vn.z; }
  }
  return { positions: out, normals: n ? no : null, uvs: data.uvs, capStart: data.capStart };
}

// Split a sliced piece's arrays into [surface | cap] accumulators.
function pushPiece(acc, piece) {
  const cap3 = piece.capStart * 3, cap2 = piece.capStart * 2;
  for (let i = 0; i < cap3; i++) { acc.surf.push(piece.positions[i]); acc.surfN.push(piece.normals[i]); }
  for (let i = 0; i < cap2; i++) acc.surfUv.push(piece.uvs[i]);
  for (let i = cap3; i < piece.positions.length; i++) { acc.cap.push(piece.positions[i]); acc.capN.push(piece.normals[i]); }
  for (let i = cap2; i < piece.uvs.length; i++) acc.capUv.push(piece.uvs[i]);
}
function pushWholeSurface(acc, data) {
  for (let i = 0; i < data.positions.length; i++) { acc.surf.push(data.positions[i]); acc.surfN.push(data.normals[i]); }
  for (let i = 0; i < data.uvs.length; i++) acc.surfUv.push(data.uvs[i]);
}
function assemble(acc) {
  const positions = acc.surf.concat(acc.cap);
  const normals = acc.surfN.concat(acc.capN);
  const uvs = acc.surfUv.concat(acc.capUv);
  return { positions, normals, uvs, capStart: acc.surf.length / 3 };
}
function newAcc() { return { surf: [], surfN: [], surfUv: [], cap: [], capN: [], capUv: [] }; }

function geoFromData(data) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(data.uvs, 2));
  const total = data.positions.length / 3;
  const surf = data.capStart;
  g.clearGroups();
  g.addGroup(0, surf, 0);
  if (total - surf > 0) g.addGroup(surf, total - surf, 1);
  g.computeBoundingBox();
  return g;
}

export class Destruction {
  constructor(ctx) {
    this.scene = ctx.scene; this.physics = ctx.physics; this.assets = ctx.assets;
    this.particles = ctx.particles; this.decals = ctx.decals; this.audio = ctx.audio; this.city = ctx.city;
    this.bus = ctx.bus;
    this.cutsThisFrame = 0; this.maxCutsPerFrame = 3;
  }
  beginFrame() { this.cutsThisFrame = 0; }

  // Make a dynamic, re-sliceable physics piece from world-space mesh data.
  makeDynamicPiece(worldData, surfaceMat, color, inheritVel, sepDir, sepSign) {
    const tris = worldData.positions.length / 9;
    if (tris < 2) return null;
    const vol = meshVolume(worldData.positions);
    const centroid = meshCentroid(worldData.positions);
    // recenter to local
    const local = worldData.positions.slice();
    for (let i = 0; i < local.length; i += 3) { local[i] -= centroid[0]; local[i + 1] -= centroid[1]; local[i + 2] -= centroid[2]; }
    const data = { positions: local, normals: worldData.normals.slice(), uvs: worldData.uvs.slice(), capStart: worldData.capStart };

    const geo = geoFromData(data);
    const molten = this.assets.molten(color || 0xff7a2a);
    const mesh = new THREE.Mesh(geo, [surfaceMat, molten]);
    mesh.castShadow = true; mesh.receiveShadow = true;
    this.scene.add(mesh);

    const bb = geo.boundingBox;
    const half = bb.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    const mass = clamp(vol * 0.5, 1, 6000);
    const small = vol < 1.2;
    const body = new Body({
      pos: new THREE.Vector3(centroid[0], centroid[1], centroid[2]),
      half, mass, mesh, restitution: 0.16, friction: 0.75, spin: 1.5,
      kind: 'debris', collide: !small,
      lifetime: small ? 6 : Infinity,
      onRemove: () => { this.scene.remove(mesh); geo.dispose(); },
    });
    body.userData.sliceable = !small;
    body.userData.local = data;
    body.userData.surfaceMat = surfaceMat;
    body.userData.color = color || 0xff7a2a;
    if (inheritVel) body.vel.copy(inheritVel);
    if (sepDir) {
      const sep = 2.5 + Math.min(6, vol * 0.01);
      body.vel.addScaledVector(sepDir, sep * sepSign);
      body.vel.y += 1.5;
    }
    this.physics.add(body);
    // molten glow light pulse on the cut (cheap: a brief point light pooled would be ideal;
    // we rely on bloom of the emissive cap + sparks instead)
    return body;
  }

  // Fracture a registered city building along a world plane.
  fractureBuilding(buildingId, plane, color = 0xff7a2a) {
    if (this.cutsThisFrame >= this.maxCutsPerFrame) return false;
    const entry = this.city.realizeBuilding(buildingId);
    if (!entry) return false;
    this.cutsThisFrame++;

    const N = new THREE.Vector3(plane.nx, plane.ny, plane.nz).normalize();
    const posAcc = newAcc(), negAcc = newAcc();
    let cutCenter = null;

    for (const part of entry.parts) {
      const box = boxMeshData(part.center, part.size);
      const r = sliceConvex(box, plane);
      if (!r) {
        const sd = N.x * part.center[0] + N.y * part.center[1] + N.z * part.center[2] + plane.d / Math.hypot(plane.nx, plane.ny, plane.nz);
        pushWholeSurface(sd >= 0 ? posAcc : negAcc, box);
      } else {
        pushPiece(posAcc, r.positive);
        pushPiece(negAcc, r.negative);
        if (!cutCenter) cutCenter = new THREE.Vector3(r.cut.centroid[0], r.cut.centroid[1], r.cut.centroid[2]);
      }
    }

    const posData = assemble(posAcc), negData = assemble(negAcc);
    const a = this.makeDynamicPiece(posData, entry.material, color, null, N, +1);
    const b = this.makeDynamicPiece(negData, entry.material, color, null, N, -1);
    this._cutFx(cutCenter || new THREE.Vector3(entry.parts[0].center[0], entry.parts[0].center[1], entry.parts[0].center[2]), color);
    if (this.bus) this.bus.emit('DESTRUCTION', { pos: cutCenter, intensity: 1.2 });
    return !!(a || b);
  }

  // Re-slice an already-dynamic piece (enables multiple cuts on falling chunks).
  sliceBody(body, plane, color) {
    if (!body.userData || !body.userData.sliceable) return false;
    if (this.cutsThisFrame >= this.maxCutsPerFrame) return false;
    const mat = new THREE.Matrix4().compose(body.pos, body.quat, new THREE.Vector3(1, 1, 1));
    const world = transformMeshData(body.userData.local, mat);
    const r = sliceConvex(world, plane);
    if (!r) return false;
    this.cutsThisFrame++;
    const N = new THREE.Vector3(plane.nx, plane.ny, plane.nz).normalize();
    const inherit = body.vel.clone();
    const col = color || body.userData.color;
    const sm = body.userData.surfaceMat;
    this.physics.remove(body);
    this.makeDynamicPiece(r.positive, sm, col, inherit, N, +1);
    this.makeDynamicPiece(r.negative, sm, col, inherit, N, -1);
    this._cutFx(new THREE.Vector3(r.cut.centroid[0], r.cut.centroid[1], r.cut.centroid[2]), col);
    return true;
  }

  _cutFx(pos, color) {
    if (!pos) return;
    this.particles.spark(pos, null, 18, 20, color);
    this.particles.smoke(pos, 6, 0x3a3a3a, 3);
    if (this.audio) this.audio.impact(0.8);
  }

  // Generic debris burst (window shatter, prop break, impact bits).
  spawnDebris(pos, opts = {}) {
    const n = opts.count || 6;
    const col = opts.color || 0x9aa0a6;
    const size = opts.size || 0.5;
    const speed = opts.speed || 8;
    const mat = this.assets.mat('debris' + col, { color: col, roughness: 0.9 });
    for (let i = 0; i < n; i++) {
      const s = size * (0.5 + Math.random());
      const geo = new THREE.BoxGeometry(s, s, s);
      const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = true;
      this.scene.add(mesh);
      const body = new Body({
        pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2)),
        half: new THREE.Vector3(s / 2, s / 2, s / 2), mass: s, mesh, spin: 6,
        restitution: 0.3, friction: 0.6, kind: 'debris', lifetime: 5 + Math.random() * 4, collide: false,
        onRemove: () => { this.scene.remove(mesh); geo.dispose(); },
      });
      body.vel.set((Math.random() - 0.5) * speed, Math.random() * speed, (Math.random() - 0.5) * speed);
      if (opts.dir) body.vel.addScaledVector(opts.dir, speed * 0.6);
      this.physics.add(body);
    }
  }

  // Crater + shockwave (ground slam). Returns affected bodies.
  crater(pos, radius, strength) {
    this.decals.add(pos, radius * 0.9, 40);
    this.particles.dust(pos, 30, 0xb9a98a);
    this.particles.smoke(pos, 10, 0x6a5a48, 2);
    this.spawnDebris(pos, { count: 10, color: 0x7a6a55, size: 0.7, speed: 14 });
    if (this.audio) { this.audio.boom(clamp(radius / 14, 0.6, 1.8)); this.audio.impact(1); }
    if (this.bus) this.bus.emit('SHOCKWAVE', { center: pos.clone(), radius: radius * 1.4, strength });
    return this.physics.applyRadialImpulse(pos, radius, strength, { up: 0.6 });
  }

  explosion(pos, radius, strength, color = 0xff8a3a) {
    this.particles.spark(pos, null, 40, 26, color);
    this.particles.ember(pos, 18, color);
    this.particles.smoke(pos, 16, 0x2a2a2a, 4);
    this.decals.add(pos, radius * 0.5, 30);
    if (this.audio) this.audio.boom(clamp(radius / 12, 0.8, 2));
    if (this.bus) this.bus.emit('SHOCKWAVE', { center: pos.clone(), radius: radius * 1.3, strength });
    return this.physics.applyRadialImpulse(pos, radius, strength, { up: 0.7 });
  }

  // Spawn a dynamic, sliceable box body (used for grabbed/thrown vehicles & objects).
  dynamicBox(center, size, surfaceMat, color, vel) {
    const box = boxMeshData([center.x, center.y, center.z], [size.x, size.y, size.z]);
    box.capStart = box.positions.length / 3; // whole box is surface (no cut yet)
    return this.makeDynamicPiece(box, surfaceMat, color || 0xff7a2a, vel || null, null, 0);
  }

  // Helper for laser/beam derivation of a cut plane from a sweep.
  planeFromSweep(eye, p0, p1) { return planeFromThreePoints([eye.x, eye.y, eye.z], [p0.x, p0.y, p0.z], [p1.x, p1.y, p1.z]); }
}
