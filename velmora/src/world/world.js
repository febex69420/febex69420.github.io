// World orchestrator: owns the collision world, terrain, ocean, highway network
// and shared registries (rooms, interactables, flags…). Site generators
// (palace/city/military) write themselves into these registries.
import * as THREE from 'three';
import { ColliderWorld } from './colliders.js';
import { Terrain } from './terrain.js';
import { getBoxGeom, makeCanvasTex } from '../core/utils.js';

export class World {
  constructor(ctx) {
    this.ctx = ctx;
    this.colliders = new ColliderWorld();
    this.terrain = new Terrain(ctx.config);
    this.interactables = [];
    this.rooms = [];
    this.flags = [];
    this.fountains = [];
    this.radarDishes = [];
    this.undergroundZones = [];
    this.trafficLoops = [];
    this.roads = [];          // {pts:[[x,z]...], width} for map + ribbons
    this.roadSegments = [];   // [ax,az,bx,bz] for scatter rejection / traffic
    this.cityRect = null;
    this.flagTexture = null;
    this.props = null;        // set by main before generators run
    this.seaLevel = ctx.config.world.seaLevel;
  }

  terrainHeight(x, z) { return this.terrain.height(x, z); }

  // Walkable ground at (x,z) for something whose feet are at refY.
  groundHeight(x, z, refY, step = 0.6) {
    const cg = this.colliders.groundAt(x, z, refY, step);
    for (const zn of this.undergroundZones) {
      if (x > zn.minX && x < zn.maxX && z > zn.minZ && z < zn.maxZ && refY < zn.topY - 0.45) {
        return cg > -Infinity ? cg : refY;
      }
    }
    return Math.max(this.terrain.height(x, z), cg);
  }

  regionAt(x, z) {
    for (const r of this.ctx.config.regions) {
      if (Math.hypot(x - r.x, z - r.z) < r.r) return r.name;
    }
    return 'Velmoran Countryside';
  }
  roomAt(x, y, z) {
    for (const r of this.rooms) {
      if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1 && y > r.y0 && y < r.y1) return r.name;
    }
    return null;
  }

  buildBase() {
    const { scene, mats: M } = this.ctx;
    this.terrainMesh = this.terrain.buildMesh();
    scene.add(this.terrainMesh);

    // ocean
    const waterGeo = new THREE.PlaneGeometry(9500, 9500, 48, 48);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x1d4a66, roughness: 0.12, metalness: 0.6, transparent: true, opacity: 0.92,
    });
    waterMat.onBeforeCompile = shader => {
      shader.uniforms.uTime = { value: 0 };
      this._waterUniforms = shader.uniforms;
      shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         transformed.z += sin(position.x * 0.02 + uTime * 0.9) * 0.6 + cos(position.y * 0.025 + uTime * 0.7) * 0.5;`
      );
    };
    this.water = new THREE.Mesh(waterGeo, waterMat);
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = this.seaLevel - 0.25;
    scene.add(this.water);

    this._buildRoads();
  }

  _buildRoads() {
    const { scene, mats: M } = this.ctx;
    const R1 = [[0, 205], [0, 700], [250, 1250], [430, 1500], [444, 1592]];
    const R2 = [[0, 205], [-150, 320], [-700, 520], [-1300, 700], [-1655, 880]];
    const R3 = [[-1655, 880], [-1500, 1300], [-1350, 1900], [-1250, 2260], [-1150, 2330]];
    const R4 = [[-1150, 2330], [-700, 2560], [-100, 2620], [340, 2380], [340, 2015]];
    const R5 = [[30, 205], [400, 300], [900, 420], [1400, 520], [1700, 560], [1940, 610]];
    for (const pts of [R1, R2, R3, R4, R5]) this.roads.push({ pts, width: 13 });

    const roadGroup = new THREE.Group();
    roadGroup.name = 'roads';
    const positions = [];
    const dashMats = [];
    for (const road of this.roads) {
      const { pts, width } = road;
      for (let i = 0; i < pts.length - 1; i++) {
        this.roadSegments.push([pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]]);
      }
      // sample the whole polyline every ~10m
      const samples = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
        const len = Math.hypot(bx - ax, bz - az);
        const n = Math.max(2, Math.round(len / 10));
        for (let j = (i === 0 ? 0 : 1); j <= n; j++) {
          samples.push([ax + (bx - ax) * (j / n), az + (bz - az) * (j / n)]);
        }
      }
      // triangle strip
      for (let i = 0; i < samples.length - 1; i++) {
        const [ax, az] = samples[i], [bx, bz] = samples[i + 1];
        let dx = bx - ax, dz = bz - az;
        const len = Math.hypot(dx, dz) || 1;
        dx /= len; dz /= len;
        const px = -dz * width / 2, pz = dx * width / 2;
        const ya = this.terrain.height(ax, az) + 0.18, yb = this.terrain.height(bx, bz) + 0.18;
        const yal = this.terrain.height(ax + px, az + pz) + 0.18, yar = this.terrain.height(ax - px, az - pz) + 0.18;
        const ybl = this.terrain.height(bx + px, bz + pz) + 0.18, ybr = this.terrain.height(bx - px, bz - pz) + 0.18;
        positions.push(
          ax + px, Math.max(yal, ya - 1), az + pz, ax - px, Math.max(yar, ya - 1), az - pz, bx + px, Math.max(ybl, yb - 1), bz + pz,
          ax - px, Math.max(yar, ya - 1), az - pz, bx - px, Math.max(ybr, yb - 1), bz - pz, bx + px, Math.max(ybl, yb - 1), bz + pz,
        );
        if (i % 3 === 1) dashMats.push([(ax + bx) / 2, (ya + yb) / 2 + 0.04, (az + bz) / 2, Math.atan2(-dx, -dz)]);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, M.road);
    mesh.receiveShadow = true;
    roadGroup.add(mesh);
    // center dashes
    const dashes = new THREE.InstancedMesh(getBoxGeom(0.35, 0.06, 3), M.roadLine, dashMats.length);
    const m4 = new THREE.Matrix4();
    dashMats.forEach(([x, y, z, ry], i) => {
      m4.makeRotationY(ry).setPosition(x, y, z);
      dashes.setMatrixAt(i, m4);
    });
    roadGroup.add(dashes);
    scene.add(roadGroup);

    // country traffic loop (city ring is added by the city generator)
    const y = 0;
    const loop = [];
    const add = (pts, rev = false) => {
      const list = rev ? pts.slice().reverse() : pts;
      for (const [x, z] of list) {
        const last = loop[loop.length - 1];
        if (last && Math.hypot(last.x - x, last.z - z) < 2) continue;
        loop.push(new THREE.Vector3(x, y, z));
      }
    };
    add(R1);
    loop.push(new THREE.Vector3(340, y, 1592));
    loop.push(new THREE.Vector3(340, y, 2015));
    add(R4, true);
    add(R3, true);
    add(R2, true);
    this.trafficLoops.push(loop);
    // village spur out-and-back
    const spur = [];
    for (const [x, z] of R5) spur.push(new THREE.Vector3(x, y, z));
    for (let i = R5.length - 2; i > 0; i--) spur.push(new THREE.Vector3(R5[i][0], y, R5[i][1] + 6));
    this.trafficLoops.push(spur);
  }

  makeFlag(x, y, z, h, parent) {
    const M = this.ctx.mats;
    if (!this.flagTexture) {
      this.flagTexture = makeCanvasTex(64, 40, c => { c.fillStyle = '#8e1f2f'; c.fillRect(0, 0, 64, 40); });
    }
    const pole = new THREE.Mesh(getBoxGeom(0.25, h, 0.25), M.metal);
    pole.position.set(x, y + h / 2, z);
    parent.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(6, 3.6, 10, 4),
      new THREE.MeshStandardMaterial({ map: this.flagTexture, side: THREE.DoubleSide, roughness: 0.9 }));
    flag.position.set(x + 3.1, y + h - 2.2, z);
    flag.castShadow = true;
    parent.add(flag);
    this.flags.push(flag);
  }
  lampsAt(list) { this.props.addLamps(list); }

  update(dt, elapsed) {
    if (this._waterUniforms) this._waterUniforms.uTime.value = elapsed;
    if (this.props) this.props.update(dt);
  }
}
