// core/rng.js — deterministic seeded randomness + value noise.
// Every procedural system derives from one of these streams so a seed
// string always reproduces the same world.

/** FNV-1a string hash → 32-bit uint. */
export function hashStr(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * mulberry32 PRNG with helper methods.
 * @param {string|number} seed
 * @returns {function():number} rand in [0,1), with .int .range .pick .chance .gauss .fork
 */
export function makeRNG(seed) {
  let a = (typeof seed === 'string' ? hashStr(seed) : seed >>> 0) || 1;
  const rand = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rand.int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));       // inclusive
  rand.range = (lo, hi) => lo + rand() * (hi - lo);
  rand.pick = (arr) => arr[Math.floor(rand() * arr.length)];
  rand.chance = (p) => rand() < p;
  rand.gauss = () => (rand() + rand() + rand() + rand() - 2) / 2;       // approx N(0, .35)
  rand.fork = (label) => makeRNG(hashStr(String(label)) ^ Math.floor(rand() * 0xFFFFFFFF));
  rand.shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  return rand;
}

/**
 * 2D value noise in [-1,1] built on a hashed integer lattice.
 * @param {number} seed
 */
export function makeNoise2D(seed) {
  const S = seed >>> 0;
  const lat = (x, y) => {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + S) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return (((h ^ (h >>> 16)) >>> 0) / 4294967296) * 2 - 1;
  };
  const fade = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = fade(xf), v = fade(yf);
    const a = lat(xi, yi), b = lat(xi + 1, yi);
    const c = lat(xi, yi + 1), d = lat(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

/** Fractal Brownian motion over a noise2D function. Output roughly [-1,1]. */
export function fbm(noise, x, y, octaves = 4, lacunarity = 2, gain = 0.5) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x * freq, y * freq) * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, t) => {
  const x = clamp((t - a) / (b - a), 0, 1);
  return x * x * (3 - 2 * x);
};
export const dist2 = (ax, az, bx, bz) => {
  const dx = ax - bx, dz = az - bz;
  return dx * dx + dz * dz;
};
