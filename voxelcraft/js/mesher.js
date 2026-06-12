// mesher.js — turns chunks into BufferGeometry meshes with per-vertex
// sky/block light + AO, via a custom shader (day factor applied at runtime).
import * as THREE from 'three';
import { CS, CH, idx3, ckey } from './util.js';
import { B, BLOCKS, TEX, WHEAT_TEX, ATLAS_TILES, getAtlasCanvas } from './blocks.js';

const VSH = `
attribute vec2 aLight;
attribute float aShade;
varying vec2 vUv;
varying vec2 vLight;
varying float vShade;
varying float vFog;
uniform float uFogNear;
uniform float uFogFar;
void main() {
  vUv = uv;
  vLight = aLight;
  vShade = aShade;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  vFog = smoothstep(uFogNear, uFogFar, length(mv.xyz));
}`;

const FSH = `
uniform sampler2D map;
uniform vec3 uFogColor;
uniform float uDay;
uniform float uOpacity;
uniform float uAlphaTest;
varying vec2 vUv;
varying vec2 vLight;
varying float vShade;
varying float vFog;
void main() {
  vec4 tex = texture2D(map, vUv);
  if (tex.a < uAlphaTest) discard;
  float sky = vLight.x * uDay;
  float l = max(sky, vLight.y);
  l = pow(l, 1.5);
  l = max(l, 0.04);
  vec3 col = tex.rgb * l * vShade;
  col = mix(col, uFogColor, vFog);
  gl_FragColor = vec4(col, tex.a * uOpacity);
}`;

// face order: [-x, +x, -y, +y, -z, +z]; texIdx maps to BLOCKS.tex slot
const FACES = [
  { dir: [-1, 0, 0], texIdx: 1, shade: 0.6, corners: [[0, 1, 0, 0, 1], [0, 0, 0, 0, 0], [0, 1, 1, 1, 1], [0, 0, 1, 1, 0]] },
  { dir: [1, 0, 0], texIdx: 0, shade: 0.6, corners: [[1, 1, 1, 0, 1], [1, 0, 1, 0, 0], [1, 1, 0, 1, 1], [1, 0, 0, 1, 0]] },
  { dir: [0, -1, 0], texIdx: 3, shade: 0.5, corners: [[1, 0, 1, 1, 0], [0, 0, 1, 0, 0], [1, 0, 0, 1, 1], [0, 0, 0, 0, 1]] },
  { dir: [0, 1, 0], texIdx: 2, shade: 1.0, corners: [[0, 1, 1, 1, 1], [1, 1, 1, 0, 1], [0, 1, 0, 1, 0], [1, 1, 0, 0, 0]] },
  { dir: [0, 0, -1], texIdx: 5, shade: 0.8, corners: [[1, 0, 0, 0, 0], [0, 0, 0, 1, 0], [1, 1, 0, 0, 1], [0, 1, 0, 1, 1]] },
  { dir: [0, 0, 1], texIdx: 4, shade: 0.8, corners: [[0, 0, 1, 0, 0], [1, 0, 1, 1, 0], [0, 1, 1, 0, 1], [1, 1, 1, 1, 1]] },
];

const TS = 1 / ATLAS_TILES;

export class Mesher {
  constructor(game) {
    this.game = game;
    const canvas = getAtlasCanvas();
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.flipY = false;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.uniforms = {
      map: { value: this.texture },
      uDay: { value: 1 },
      uFogColor: { value: new THREE.Color(0x88bbee) },
      uFogNear: { value: 60 },
      uFogFar: { value: 120 },
    };
    this.matOpaque = new THREE.ShaderMaterial({
      uniforms: { ...this.uniforms, uOpacity: { value: 1 }, uAlphaTest: { value: 0.5 } },
      vertexShader: VSH, fragmentShader: FSH, side: THREE.DoubleSide,
    });
    this.matWater = new THREE.ShaderMaterial({
      uniforms: { ...this.uniforms, uOpacity: { value: 0.72 }, uAlphaTest: { value: 0.02 } },
      vertexShader: VSH, fragmentShader: FSH,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
  }

  setEnv(day, fogColor, fogNear, fogFar) {
    for (const m of [this.matOpaque, this.matWater]) {
      m.uniforms.uDay.value = day;
      m.uniforms.uFogColor.value.set(fogColor);
      m.uniforms.uFogNear.value = fogNear;
      m.uniforms.uFogFar.value = fogFar;
    }
  }

  tileUV(tile, u, v) {
    // flipY=false: v grows downward in canvas space
    const tx = tile % ATLAS_TILES, ty = (tile / ATLAS_TILES) | 0;
    return [(tx + u) * TS, (ty + (1 - v)) * TS];
  }

  buildChunk(world, chunk) {
    const O = { pos: [], uv: [], light: [], shade: [], index: [] };
    const W = { pos: [], uv: [], light: [], shade: [], index: [] };
    const bx = chunk.cx * CS, bz = chunk.cz * CS;

    for (let y = 0; y < CH; y++) for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) {
      const id = chunk.blocks[idx3(lx, y, lz)];
      if (id === B.AIR) continue;
      const d = BLOCKS[id];
      const x = bx + lx, z = bz + lz;
      const meta = world.getMeta(x, y, z);

      if (d.liquid) { this.emitLiquid(world, W, x, y, z, id, d, meta); continue; }
      switch (d.shape) {
        case 'cross': case 'torch': case 'portal': this.emitCross(world, O, x, y, z, d, meta); break;
        case 'flat': this.emitFlat(world, O, x, y, z, d, meta); break;
        case 'ladder': this.emitLadder(world, O, x, y, z, d, meta); break;
        case 'door': this.emitDoor(world, O, x, y, z, d, meta); break;
        case 'slabTop': this.emitBox(world, O, x, y, z, [0, 0, 0, 1, id === B.FARMLAND ? 0.94 : 0.56, 1], this.texSet(d, meta), true); break;
        default: this.emitCube(world, O, x, y, z, id, d, meta); break;
      }
    }

    this.applyGeom(chunk, 'meshO', O, this.matOpaque);
    this.applyGeom(chunk, 'meshW', W, this.matWater);
    chunk.dirty = false;
  }

  applyGeom(chunk, slot, arrs, mat) {
    const old = chunk[slot];
    if (old) { this.game.scene.remove(old); old.geometry.dispose(); chunk[slot] = null; }
    if (arrs.pos.length === 0) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arrs.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(arrs.uv, 2));
    g.setAttribute('aLight', new THREE.Float32BufferAttribute(arrs.light, 2));
    g.setAttribute('aShade', new THREE.Float32BufferAttribute(arrs.shade, 1));
    g.setIndex(arrs.index);
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = true;
    mesh.matrixAutoUpdate = false;
    chunk[slot] = mesh;
    this.game.scene.add(mesh);
  }

  disposeChunk(chunk) {
    for (const slot of ['meshO', 'meshW']) {
      const m = chunk[slot];
      if (m) { this.game.scene.remove(m); m.geometry.dispose(); chunk[slot] = null; }
    }
  }

  lightAt(world, x, y, z) {
    const raw = world.getLightRaw(x, y, z);
    return [Math.pow((raw >> 4) / 15, 1.0), Math.pow((raw & 15) / 15, 1.0)];
  }

  texSet(d, meta) {
    // returns 6-entry tile list honoring meta.facing for 'front' blocks
    let tex = d.tex;
    if (d.id === B.FURNACE && meta && meta.lit) {
      tex = [...tex];
      // replace the front tile with lit variant
      for (let i = 0; i < 6; i++) if (tex[i] === TEX.furnace_front) tex[i] = TEX.furnace_front_lit;
    }
    if (meta && meta.facing !== undefined && (d.id === B.FURNACE || d.id === B.CHEST || d.id === B.PUMPKIN || d.id === B.CRAFTING)) {
      // move the "front" texture (slot 4, +z) to the faced side
      const front = tex[4], side = tex[5];
      const t = [...tex];
      t[0] = side; t[1] = side; t[4] = side; t[5] = side;
      const map = { 0: 4, 1: 5, 2: 0, 3: 1 }; // facing -> face slot
      t[map[meta.facing] ?? 4] = front;
      tex = t;
    }
    return tex;
  }

  pushQuad(arr, verts, tile, lights, shade) {
    // verts: 4x [x,y,z,u,v]
    const base = arr.pos.length / 3;
    for (let i = 0; i < 4; i++) {
      const v = verts[i];
      arr.pos.push(v[0], v[1], v[2]);
      const [u, vv] = this.tileUV(tile, v[3], v[4]);
      arr.uv.push(u, vv);
      arr.light.push(lights[i][0], lights[i][1]);
      arr.shade.push(shade[i]);
    }
    arr.index.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
  }

  aoAt(world, x, y, z) {
    // 1 if occluding
    if (y < 0 || y >= CH) return 0;
    const d = BLOCKS[world.getBlock(x, y, z)];
    return d && d.opaque ? 1 : 0;
  }

  emitCube(world, arr, x, y, z, id, d, meta) {
    const tex = this.texSet(d, meta);
    for (const f of FACES) {
      const nx = x + f.dir[0], ny = y + f.dir[1], nz = z + f.dir[2];
      const nid = world.getBlock(nx, ny, nz);
      const nd = BLOCKS[nid];
      if (nd && nd.opaque) continue;
      if (!d.opaque && nid === id) continue; // glass-glass, leaves-leaves
      const L = this.lightAt(world, nx, ny, nz);
      const verts = [], lights = [], shades = [];
      for (const c of f.corners) {
        verts.push([x + c[0], y + c[1], z + c[2], c[3], c[4]]);
        // AO: neighbors of this vertex in the face plane
        const ao = this.vertexAO(world, x, y, z, f, c);
        shades.push(f.shade * (1 - ao * 0.18));
        lights.push(L);
      }
      this.pushQuad(arr, verts, tex[f.texIdx], lights, shades);
    }
  }

  vertexAO(world, x, y, z, f, c) {
    // determine the two tangent offsets for this corner
    const d = f.dir;
    // vertex position offset converted to -1/+1 per axis (relative to cell center)
    const vo = [c[0] === 0 ? -1 : 1, c[1] === 0 ? -1 : 1, c[2] === 0 ? -1 : 1];
    let t1, t2;
    if (d[0] !== 0) { t1 = [0, vo[1], 0]; t2 = [0, 0, vo[2]]; }
    else if (d[1] !== 0) { t1 = [vo[0], 0, 0]; t2 = [0, 0, vo[2]]; }
    else { t1 = [vo[0], 0, 0]; t2 = [0, vo[1], 0]; }
    const bx = x + d[0], by = y + d[1], bz = z + d[2];
    const s1 = this.aoAt(world, bx + t1[0], by + t1[1], bz + t1[2]);
    const s2 = this.aoAt(world, bx + t2[0], by + t2[1], bz + t2[2]);
    const cr = this.aoAt(world, bx + t1[0] + t2[0], by + t1[1] + t2[1], bz + t1[2] + t2[2]);
    return s1 && s2 ? 3 : s1 + s2 + cr;
  }

  emitCross(world, arr, x, y, z, d, meta) {
    let tile = d.tex[4];
    if (d.id === B.WHEAT && meta) tile = WHEAT_TEX[Math.min(7, meta.stage ?? 0)];
    if (d.id === B.RS_TORCH && meta && meta.off) tile = TEX.rs_torch_off;
    if (d.id === B.LEVER && meta && meta.on) tile = TEX.lever;
    const L = this.lightAt(world, x, y, z);
    const Ls = [L, L, L, L];
    const sh = [1, 1, 1, 1];
    const a = 0.146, b2 = 0.854; // diagonal inset
    this.pushQuad(arr, [
      [x + a, y, z + a, 0, 0], [x + b2, y, z + b2, 1, 0],
      [x + a, y + 1, z + a, 0, 1], [x + b2, y + 1, z + b2, 1, 1]], tile, Ls, sh);
    this.pushQuad(arr, [
      [x + b2, y, z + a, 0, 0], [x + a, y, z + b2, 1, 0],
      [x + b2, y + 1, z + a, 0, 1], [x + a, y + 1, z + b2, 1, 1]], tile, Ls, sh);
  }

  emitFlat(world, arr, x, y, z, d, meta) {
    let shadeV = 1;
    if (d.id === B.WIRE) shadeV = meta && meta.p > 0 ? 1.25 : 0.5;
    if (d.id === B.PLATE && meta && meta.on) shadeV = 0.7;
    const L = this.lightAt(world, x, y, z);
    const h = 0.04;
    this.pushQuad(arr, [
      [x, y + h, z + 1, 0, 0], [x + 1, y + h, z + 1, 1, 0],
      [x, y + h, z, 0, 1], [x + 1, y + h, z, 1, 1]],
      d.tex[2], [L, L, L, L], [shadeV, shadeV, shadeV, shadeV]);
  }

  emitLadder(world, arr, x, y, z, d, meta) {
    const f = (meta && meta.facing) ?? 0;
    const L = this.lightAt(world, x, y, z);
    const Ls = [L, L, L, L], sh = [1, 1, 1, 1];
    const o = 0.06;
    let verts;
    if (f === 0) verts = [[x, y, z + o, 0, 0], [x + 1, y, z + o, 1, 0], [x, y + 1, z + o, 0, 1], [x + 1, y + 1, z + o, 1, 1]];
    else if (f === 1) verts = [[x + 1, y, z + 1 - o, 0, 0], [x, y, z + 1 - o, 1, 0], [x + 1, y + 1, z + 1 - o, 0, 1], [x, y + 1, z + 1 - o, 1, 1]];
    else if (f === 2) verts = [[x + o, y, z + 1, 0, 0], [x + o, y, z, 1, 0], [x + o, y + 1, z + 1, 0, 1], [x + o, y + 1, z, 1, 1]];
    else verts = [[x + 1 - o, y, z, 0, 0], [x + 1 - o, y, z + 1, 1, 0], [x + 1 - o, y + 1, z, 0, 1], [x + 1 - o, y + 1, z + 1, 1, 1]];
    this.pushQuad(arr, verts, d.tex[4], Ls, sh);
  }

  emitDoor(world, arr, x, y, z, d, meta) {
    const m = meta || {};
    const tile = m.upper ? TEX.door_top : TEX.door_bottom;
    let f = m.facing ?? 0;
    if (m.open) f = (f + 1) & 3;
    const t = 0.12;
    let box;
    if (f === 0) box = [0, 0, 0, 1, 1, t];
    else if (f === 1) box = [0, 0, 1 - t, 1, 1, 1];
    else if (f === 2) box = [0, 0, 0, t, 1, 1];
    else box = [1 - t, 0, 0, 1, 1, 1];
    this.emitBox(world, arr, x, y, z, box, [tile, tile, tile, tile, tile, tile], false);
  }

  emitBox(world, arr, x, y, z, box, tex, cullBottom) {
    const [x0, y0, z0, x1, y1, z1] = box;
    const L = this.lightAt(world, x, y, z);
    for (const f of FACES) {
      if (cullBottom && f.texIdx === 3) {
        const nd = BLOCKS[world.getBlock(x, y - 1, z)];
        if (nd && nd.opaque) continue;
      }
      const verts = [];
      for (const c of f.corners) {
        const px = x + (c[0] ? x1 : x0), py = y + (c[1] ? y1 : y0), pz = z + (c[2] ? z1 : z0);
        verts.push([px, py, pz, c[3], c[4]]);
      }
      this.pushQuad(arr, verts, tex[f.texIdx], [L, L, L, L],
        [f.shade, f.shade, f.shade, f.shade]);
    }
  }

  emitLiquid(world, arr, x, y, z, id, d, meta) {
    const lv = meta && meta.lv !== undefined ? meta.lv : 8;
    const topH = world.getBlock(x, y + 1, z) === id ? 1 : 0.78 + (lv / 8) * 0.12;
    const tile = d.tex[2];
    for (const f of FACES) {
      const nx = x + f.dir[0], ny = y + f.dir[1], nz = z + f.dir[2];
      const nid = world.getBlock(nx, ny, nz);
      const nd = BLOCKS[nid];
      if (nid === id) continue;
      if (nd && nd.opaque) continue;
      const L = this.lightAt(world, nx, ny, nz);
      const verts = [];
      for (const c of f.corners) {
        const py = c[1] ? y + topH : y;
        verts.push([x + c[0], py, z + c[2], c[3], c[4]]);
      }
      this.pushQuad(arr, verts, tile, [L, L, L, L], [f.shade, f.shade, f.shade, f.shade]);
    }
  }
}
