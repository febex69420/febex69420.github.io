// util.js — dependency-free math, RNG, noise, events, and pools.
// Intentionally free of any THREE import so it is unit-testable under plain Node.

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b - a === 0 ? 0 : (v - a) / (b - a));
export const remap = (v, a, b, c, d) => lerp(c, d, clamp01(invLerp(a, b, v)));
export const smoothstep = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0 || 1));
  return t * t * (3 - 2 * t);
};
export const smootherstep = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0 || 1));
  return t * t * t * (t * (t * 6 - 15) + 10);
};
// Frame-rate independent damping toward a target (exponential).
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const approach = (a, b, maxDelta) => {
  const d = b - a;
  if (Math.abs(d) <= maxDelta) return b;
  return a + Math.sign(d) * maxDelta;
};
export const wrap = (v, lo, hi) => {
  const r = hi - lo;
  return r <= 0 ? lo : lo + ((((v - lo) % r) + r) % r);
};
export const angleLerp = (a, b, t) => {
  let d = ((b - a + Math.PI) % TAU) - Math.PI;
  if (d < -Math.PI) d += TAU;
  return a + d * t;
};
export const sign = Math.sign;
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t) => t * t * t;
export const easeOutBack = (t) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const easeOutElastic = (t) => {
  if (t === 0 || t === 1) return t;
  const c4 = TAU / 3;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
};

// ---------------------------------------------------------------- RNG ----
// mulberry32: tiny, fast, deterministic 32-bit PRNG.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// FNV-1a string hash -> 32-bit unsigned int (deterministic seeds from text).
export function strSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
// A small stateful RNG helper with convenience methods.
export class RNG {
  constructor(seed = 1) { this.next = mulberry32(typeof seed === 'string' ? strSeed(seed) : seed); }
  float(a = 0, b = 1) { return a + (b - a) * this.next(); }
  int(a, b) { return Math.floor(this.float(a, b + 1)); }
  bool(p = 0.5) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
  range(a, b) { return this.float(a, b); }
  // Box-Muller normal.
  gauss(mean = 0, sd = 1) {
    const u = Math.max(1e-9, this.next()), v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
  }
}

// ---------------------------------------------------------- value noise ----
// Deterministic 2D value noise + fractal sum. Cheap, good enough for city/terrain variation.
function hash2(ix, iy, seed) {
  let h = (ix * 374761393 + iy * 668265263 + seed * 0x9e3779b1) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function valueNoise2(x, y, seed = 0) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
export function fbm2(x, y, { octaves = 4, lacunarity = 2, gain = 0.5, seed = 0 } = {}) {
  let amp = 0.5, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2(x * freq, y * freq, seed + i * 1013);
    norm += amp; amp *= gain; freq *= lacunarity;
  }
  return sum / (norm || 1);
}

// ---------------------------------------------------------- EventBus ----
// Minimal synchronous pub/sub. Handlers run in registration order.
export class EventBus {
  constructor() { this.map = new Map(); }
  on(type, fn) {
    let s = this.map.get(type);
    if (!s) this.map.set(type, (s = new Set()));
    s.add(fn);
    return () => s.delete(fn);
  }
  off(type, fn) { const s = this.map.get(type); if (s) s.delete(fn); }
  emit(type, payload) {
    const s = this.map.get(type);
    if (s) for (const fn of s) fn(payload);
    const a = this.map.get('*');
    if (a) for (const fn of a) fn(type, payload);
  }
}

// ------------------------------------------------------------ RingBuffer ----
// Fixed-capacity ring; overwrites oldest. Used for NPC memory & debris recycling.
export class RingBuffer {
  constructor(cap) { this.cap = cap; this.buf = new Array(cap); this.start = 0; this.len = 0; }
  push(v) {
    const i = (this.start + this.len) % this.cap;
    if (this.len < this.cap) { this.buf[i] = v; this.len++; }
    else { this.buf[this.start] = v; this.start = (this.start + 1) % this.cap; }
    return this.buf[i];
  }
  get(i) { return this.buf[(this.start + i) % this.cap]; }
  forEach(fn) { for (let i = 0; i < this.len; i++) fn(this.buf[(this.start + i) % this.cap], i); }
  clear() { this.start = 0; this.len = 0; }
}

// ---------------------------------------------------------- misc helpers ----
export const fmtInt = (n) => Math.round(n).toLocaleString('en-US');
export const fmtTime = (t01) => {
  const mins = Math.floor(t01 * 24 * 60);
  const h = Math.floor(mins / 60), m = mins % 60;
  const ap = h < 12 ? 'AM' : 'PM';
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:${String(m).padStart(2, '0')} ${ap}`;
};
// Round-robin budget cursor: iterate `count` items, at most `budget` per call.
export function* roundRobin(count, budget, state) {
  const start = state.cursor % count;
  const n = Math.min(budget, count);
  for (let k = 0; k < n; k++) yield (start + k) % count;
  state.cursor = (start + n) % count;
}
