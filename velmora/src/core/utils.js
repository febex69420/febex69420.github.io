// Math, RNG, noise, name generation and geometry-batching helpers.
import * as THREE from 'three';

// ---------- deterministic RNG ----------
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const rand = (rng, a = 0, b = 1) => a + (b - a) * rng();
export const randInt = (rng, a, b) => Math.floor(rand(rng, a, b + 1));
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
export const chance = (rng, p) => rng() < p;

// ---------- math ----------
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
// frame-rate independent exponential approach
export const damp = (cur, target, lambda, dt) => lerp(cur, target, 1 - Math.exp(-lambda * dt));
export function angleDamp(cur, target, lambda, dt) {
  let d = ((target - cur + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return cur + d * (1 - Math.exp(-lambda * dt));
}
export const yawFromDir = (dx, dz) => Math.atan2(-dx, -dz);
export const dist2D = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

// ---------- seeded value noise ----------
const NOISE_SEED = 1911;
const perm = new Uint8Array(512);
{
  const r = mulberry32(NOISE_SEED);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
}
function hash2(ix, iz) { return perm[(perm[ix & 255] + iz) & 255] / 255; }
export function noise2(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz) * 2 - 1;
}
export function fbm(x, z, octaves = 4, freq = 1, gain = 0.5) {
  let amp = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise2(x * freq, z * freq) * amp;
    norm += amp; amp *= gain; freq *= 2.03;
  }
  return sum / norm;
}

// ---------- canvas texture helper ----------
export function makeCanvasTex(w, h, draw, repeatX = 1, repeatY = 1) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ---------- fictional name generation ----------
const FIRST = ['Adrik', 'Borz', 'Casmir', 'Dovan', 'Emeric', 'Fedor', 'Gavril', 'Hektor', 'Ilya', 'Jorun',
  'Kazim', 'Lazlo', 'Milov', 'Nikta', 'Osric', 'Pavel', 'Radan', 'Stellan', 'Tibor', 'Vasko',
  'Anya', 'Brona', 'Ciela', 'Darya', 'Elka', 'Fenna', 'Galya', 'Irina', 'Katarin', 'Lyudmila',
  'Mirela', 'Nadia', 'Oksana', 'Petra', 'Roza', 'Sonja', 'Tesna', 'Vera', 'Yelena', 'Zarya'];
const LAST = ['Antorov', 'Belkan', 'Cezarin', 'Drenov', 'Estvan', 'Fyodorin', 'Grubar', 'Halmir', 'Ivanek',
  'Jarnov', 'Kalvar', 'Lubenk', 'Morovai', 'Nemzet', 'Ostrovin', 'Pellar', 'Radzik', 'Sokolar',
  'Tarnow', 'Ustrev', 'Varga', 'Wolzak', 'Yastreb', 'Zelenko', 'Brzek', 'Kastellan', 'Morev', 'Talvik'];
export function personName(rng) { return pick(rng, FIRST) + ' ' + pick(rng, LAST); }
export function officerName(rng) { return pick(rng, LAST); }

// ---------- geometry batching ----------
// Merges many transformed geometries that share a material into single meshes.
export class GeomBatcher {
  constructor() { this.buckets = new Map(); }
  add(geometry, material, matrix) {
    let list = this.buckets.get(material);
    if (!list) { list = []; this.buckets.set(material, list); }
    const g = geometry.clone();
    g.applyMatrix4(matrix);
    list.push(g);
  }
  // convenience: axis-aligned box at center (x,y,z)
  box(w, h, d, material, x, y, z, rotY = 0) {
    const m = new THREE.Matrix4();
    if (rotY !== 0) {
      m.makeRotationY(rotY).setPosition(x, y, z);
    } else {
      m.makeTranslation(x, y, z);
    }
    this.add(getBoxGeom(w, h, d), material, m);
  }
  build(parent, { castShadow = true, receiveShadow = true } = {}) {
    const meshes = [];
    for (const [material, geoms] of this.buckets) {
      const merged = mergeGeometries(geoms);
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = receiveShadow;
      parent.add(mesh);
      meshes.push(mesh);
      for (const g of geoms) g.dispose();
    }
    this.buckets.clear();
    return meshes;
  }
}

// shared box geometry cache (unit-safe: keyed by dims rounded to mm)
const boxCache = new Map();
export function getBoxGeom(w, h, d) {
  const key = `${Math.round(w * 1000)}_${Math.round(h * 1000)}_${Math.round(d * 1000)}`;
  let g = boxCache.get(key);
  if (!g) { g = new THREE.BoxGeometry(w, h, d); boxCache.set(key, g); }
  return g;
}

// minimal non-indexed merge (positions/normals/uvs)
export function mergeGeometries(geoms) {
  let total = 0;
  const nonIndexed = geoms.map(g => g.index ? g.toNonIndexed() : g);
  for (const g of nonIndexed) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  let o = 0;
  for (const g of nonIndexed) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}

export function nextFrame() { return new Promise(r => requestAnimationFrame(r)); }
