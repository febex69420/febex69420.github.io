// assets.js — 100% procedural content: canvas textures, materials, particles, decals, audio.
// No binary asset files ship with the game; everything here is generated from code.
import * as THREE from 'three';
import { RNG, clamp01 } from './util.js';

// ----------------------------------------------------------- canvas textures ----
function canvas(size = 256) {
  const c = (typeof document !== 'undefined') ? document.createElement('canvas') : null;
  if (!c) return { c: null, ctx: null };
  c.width = c.height = size;
  return { c, ctx: c.getContext('2d') };
}
function tex(c, { repeat = 1, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

export class Assets {
  constructor() {
    this.cache = new Map();
    this.materials = new Map();
  }

  // ---- textures ----
  facade(seed = 1, lit = false) {
    const key = 'facade' + seed + (lit ? 'L' : '');
    if (this.cache.has(key)) return this.cache.get(key);
    const { c, ctx } = canvas(256);
    if (!ctx) return null;
    const rng = new RNG(seed);
    const base = `hsl(${rng.int(190, 230)}, ${rng.int(8, 22)}%, ${rng.int(28, 52)}%)`;
    ctx.fillStyle = base; ctx.fillRect(0, 0, 256, 256);
    // window grid
    const cols = rng.pick([6, 8, 10]), rows = rng.pick([6, 8, 10]);
    const mw = 256 / cols, mh = 256 / rows;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const pad = 2 + rng.float(0, 2);
      const on = lit ? rng.bool(0.45) : rng.bool(0.12);
      ctx.fillStyle = on ? `hsl(${rng.int(40, 55)}, 90%, ${rng.int(60, 80)}%)`
        : `hsl(${rng.int(195, 220)}, ${rng.int(20, 40)}%, ${rng.int(10, 22)}%)`;
      ctx.fillRect(x * mw + pad, y * mh + pad, mw - pad * 2, mh - pad * 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
      ctx.strokeRect(x * mw + pad, y * mh + pad, mw - pad * 2, mh - pad * 2);
    }
    const t = tex(c, { repeat: 1 });
    this.cache.set(key, t); return t;
  }

  noiseTex(seed = 1, size = 128) {
    const key = 'noise' + seed + size;
    if (this.cache.has(key)) return this.cache.get(key);
    const { c, ctx } = canvas(size);
    if (!ctx) return null;
    const img = ctx.createImageData(size, size);
    const rng = new RNG(seed);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = rng.int(60, 200);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const t = tex(c, { repeat: 1, srgb: false });
    this.cache.set(key, t); return t;
  }

  ground(kind = 'asphalt') {
    const key = 'g' + kind;
    if (this.cache.has(key)) return this.cache.get(key);
    const { c, ctx } = canvas(256);
    if (!ctx) return null;
    const rng = new RNG(kind.length * 13 + 7);
    let base = '#3a3d42';
    if (kind === 'grass') base = '#3f7a3a';
    else if (kind === 'sand') base = '#cdb98a';
    else if (kind === 'concrete') base = '#8a8d90';
    ctx.fillStyle = base; ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2200; i++) {
      const v = rng.int(-22, 22);
      ctx.fillStyle = `rgba(${v < 0 ? 0 : 255},${v < 0 ? 0 : 255},${v < 0 ? 0 : 255},${Math.abs(v) / 255 * 0.5})`;
      ctx.fillRect(rng.int(0, 256), rng.int(0, 256), 1, 1);
    }
    if (kind === 'asphalt') { // lane dashes baked subtly
      ctx.fillStyle = 'rgba(220,210,120,0.0)';
    }
    const t = tex(c, { repeat: 8 });
    this.cache.set(key, t); return t;
  }

  // ---- shared materials (quality-aware) ----
  mat(name, params, lambert = false) {
    if (this.materials.has(name)) return this.materials.get(name);
    const M = lambert ? THREE.MeshLambertMaterial : THREE.MeshStandardMaterial;
    const m = new M(params);
    this.materials.set(name, m); return m;
  }

  // A glowing "molten" material for cut caps / energy edges.
  molten(color = 0xff7a2a) {
    const key = 'molten' + color;
    if (this.materials.has(key)) return this.materials.get(key);
    const m = new THREE.MeshStandardMaterial({
      color: 0x1a0a04, emissive: new THREE.Color(color), emissiveIntensity: 2.4,
      roughness: 0.5, metalness: 0.1,
    });
    this.materials.set(key, m); return m;
  }
}

// ------------------------------------------------------------------ particles ----
// Points-based pooled particle system. Two layers: additive (sparks/energy/embers) and
// alpha (smoke/dust). Single draw call per layer.
const PV = `
  attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
  varying float vAlpha; varying vec3 vColor;
  uniform float uScale;
  void main(){
    vAlpha = aAlpha; vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position,1.0);
    gl_PointSize = aSize * uScale / max(-mv.z, 0.1);
    gl_Position = projectionMatrix * mv;
  }`;
const PF = `
  varying float vAlpha; varying vec3 vColor;
  void main(){
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d);
    float m = smoothstep(0.5, 0.12, r);
    if (m <= 0.001) discard;
    gl_FragColor = vec4(vColor, vAlpha * m);
  }`;

class ParticleLayer {
  constructor(scene, max, additive) {
    this.max = max; this.count = 0; this.cursor = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxlife = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.geo = g;
    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 } },
      vertexShader: PV, fragmentShader: PF, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  emit(p, v, color, size, life, grav, drag, alpha) {
    const i = this.cursor;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x; this.vel[i * 3 + 1] = v.y; this.vel[i * 3 + 2] = v.z;
    this.col[i * 3] = color.r; this.col[i * 3 + 1] = color.g; this.col[i * 3 + 2] = color.b;
    this.size[i] = size; this.life[i] = life; this.maxlife[i] = life;
    this.grav[i] = grav; this.drag[i] = drag; this.alpha[i] = alpha;
    this.cursor = (this.cursor + 1) % this.max;
    if (this.count < this.max) this.count++;
  }
  update(dt) {
    const n = this.count;
    for (let i = 0; i < n; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= dr; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * dr - this.grav[i] * dt; this.vel[i * 3 + 2] *= dr;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const t = clamp01(this.life[i] / this.maxlife[i]);
      this.alpha[i] = t * t;
    }
    this.geo.setDrawRange(0, n);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
  }
}

export class Particles {
  constructor(scene, budget = 1) {
    this.add = new ParticleLayer(scene, Math.floor(4000 * budget), true);
    this.alpha = new ParticleLayer(scene, Math.floor(3000 * budget), false);
    this._c = new THREE.Color();
    this.budget = budget;
  }
  setScale(s) { this.add.material.uniforms.uScale.value = s; this.alpha.material.uniforms.uScale.value = s; }

  // Convenience emitters -------------------------------------------------
  spark(p, dir, n = 12, speed = 16, color = 0xffd66b) {
    n = Math.floor(n * this.budget);
    this._c.set(color);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(
        (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2);
      if (dir) v.addScaledVector(dir, 1.4);
      v.normalize().multiplyScalar(speed * (0.4 + Math.random()));
      this.add.emit(p, v, this._c, 26 + Math.random() * 30, 0.25 + Math.random() * 0.4, 26, 2.0, 1);
    }
  }
  smoke(p, n = 8, color = 0x444444, rise = 2) {
    n = Math.floor(n * this.budget);
    this._c.set(color);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 2, rise + Math.random() * 2, (Math.random() - 0.5) * 2);
      this.alpha.emit(p, v, this._c, 90 + Math.random() * 120, 1.2 + Math.random() * 1.4, -2, 0.7, 0.5);
    }
  }
  dust(p, n = 14, color = 0xb9a98a) {
    n = Math.floor(n * this.budget);
    this._c.set(color);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 4 + Math.random() * 12;
      const v = new THREE.Vector3(Math.cos(a) * s, 1 + Math.random() * 3, Math.sin(a) * s);
      this.alpha.emit(p, v, this._c, 80 + Math.random() * 90, 0.8 + Math.random() * 0.8, 6, 1.5, 0.6);
    }
  }
  energy(p, dir, n = 10, color = 0x66ccff, speed = 10) {
    n = Math.floor(n * this.budget);
    this._c.set(color);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5));
      if (dir) v.addScaledVector(dir, 1.2);
      v.normalize().multiplyScalar(speed * (0.5 + Math.random()));
      this.add.emit(p, v, this._c, 24 + Math.random() * 26, 0.3 + Math.random() * 0.5, 0, 1.2, 1);
    }
  }
  ember(p, n = 6, color = 0xff5522) {
    n = Math.floor(n * this.budget);
    this._c.set(color);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 3, 3 + Math.random() * 5, (Math.random() - 0.5) * 3);
      this.add.emit(p, v, this._c, 18 + Math.random() * 18, 0.9 + Math.random(), -4, 0.8, 1);
    }
  }
  update(dt) { this.add.update(dt); this.alpha.update(dt); }
}

// ------------------------------------------------------------------- decals ----
// Pooled fading ground planes (scorch / crater rings).
export class Decals {
  constructor(scene, assets, max = 64) {
    this.items = [];
    this.pool = [];
    this.max = max;
    const scorch = makeScorchTexture();
    this.mat = new THREE.MeshBasicMaterial({ map: scorch, transparent: true, depthWrite: false, opacity: 0.9, polygonOffset: true, polygonOffsetFactor: -2 });
    this.geo = new THREE.PlaneGeometry(1, 1);
    this.scene = scene;
  }
  add(pos, radius, life = 30, rot = Math.random() * 6.28) {
    let m = this.pool.pop();
    if (!m) { m = new THREE.Mesh(this.geo, this.mat.clone()); this.scene.add(m); }
    m.visible = true;
    m.position.set(pos.x, pos.y + 0.05, pos.z);
    m.rotation.set(-Math.PI / 2, 0, rot);
    m.scale.set(radius * 2, radius * 2, 1);
    m.material.opacity = 0.9;
    this.items.push({ m, life, max: life });
    if (this.items.length > this.max) { const o = this.items.shift(); o.m.visible = false; this.pool.push(o.m); }
  }
  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      it.m.material.opacity = 0.9 * Math.max(0, it.life / it.max);
      if (it.life <= 0) { it.m.visible = false; this.pool.push(it.m); this.items.splice(i, 1); }
    }
  }
}
function makeScorchTexture() {
  const { c, ctx } = canvas(128);
  if (!ctx) return null;
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, 'rgba(10,8,6,0.85)');
  g.addColorStop(0.6, 'rgba(20,12,8,0.45)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// -------------------------------------------------------------------- audio ----
// Tiny WebAudio synth — all SFX generated. Safe no-op outside the browser.
export class AudioEngine {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null; this.master = null; this.ok = false;
    this._laser = null; this._siren = null;
  }
  resume() {
    if (this.ok) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.settings ? this.settings.get('volMaster') : 0.8;
    this.master.connect(this.ctx.destination);
    this.ok = true;
  }
  setMaster(v) { if (this.master) this.master.gain.value = v; }
  _now() { return this.ctx.currentTime; }
  _noiseBuf(dur = 0.5) {
    const n = Math.floor(this.ctx.sampleRate * dur);
    const b = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  _env(gain, t, a, d, peak = 1) { gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(peak, t + a); gain.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  _sfxGain(v = 1) { const g = this.ctx.createGain(); g.gain.value = v * (this.settings ? this.settings.get('volSfx') : 1); g.connect(this.master); return g; }

  boom(size = 1) {
    if (!this.ok) return;
    const t = this._now();
    const src = this.ctx.createBufferSource(); src.buffer = this._noiseBuf(0.6 * size);
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(80, t + 0.5 * size);
    const g = this._sfxGain(0.9); this._env(g, t, 0.005, 0.55 * size, 1);
    src.connect(lp); lp.connect(g); src.start(t); src.stop(t + 0.6 * size);
  }
  impact(v = 1) {
    if (!this.ok) return;
    const t = this._now();
    const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
    const g = this._sfxGain(0.7 * v); this._env(g, t, 0.002, 0.2, 1);
    o.connect(g); o.start(t); o.stop(t + 0.25);
  }
  whoosh(v = 1) {
    if (!this.ok) return;
    const t = this._now();
    const src = this.ctx.createBufferSource(); src.buffer = this._noiseBuf(0.4);
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(300, t); bp.frequency.linearRampToValueAtTime(1600, t + 0.3); bp.Q.value = 0.7;
    const g = this._sfxGain(0.35 * v); this._env(g, t, 0.05, 0.3, 1);
    src.connect(bp); bp.connect(g); src.start(t); src.stop(t + 0.4);
  }
  zap(freq = 880, v = 1) {
    if (!this.ok) return;
    const t = this._now();
    const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freq * 0.4, t + 0.12);
    const g = this._sfxGain(0.3 * v); this._env(g, t, 0.002, 0.14, 1);
    o.connect(g); o.start(t); o.stop(t + 0.18);
  }
  freeze() {
    if (!this.ok) return;
    const t = this._now();
    const src = this.ctx.createBufferSource(); src.buffer = this._noiseBuf(0.5);
    const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
    const g = this._sfxGain(0.25); this._env(g, t, 0.05, 0.45, 1);
    src.connect(hp); hp.connect(g); src.start(t); src.stop(t + 0.5);
  }
  thunder() { this.boom(1.6); }
  ui() {
    if (!this.ok) return;
    const t = this._now();
    const o = this.ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(660, t);
    const g = this.ctx.createGain(); g.gain.value = (this.settings ? this.settings.get('volUi') : 0.7) * 0.3; g.connect(this.master);
    this._env(g, t, 0.003, 0.08, 1); o.connect(g); o.start(t); o.stop(t + 0.1);
  }
  cheer(intensity = 1) {
    if (!this.ok) return;
    const t = this._now();
    const src = this.ctx.createBufferSource(); src.buffer = this._noiseBuf(1.2); src.loop = false;
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1200; bp.Q.value = 0.6;
    const g = this._sfxGain(0.18 * clamp01(intensity)); this._env(g, t, 0.25, 1.0, 1);
    src.connect(bp); bp.connect(g); src.start(t); src.stop(t + 1.2);
  }
  // Continuous laser hum (start/stop).
  laserStart(color = 1) {
    if (!this.ok || this._laser) return;
    const t = this._now();
    const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 120 + color * 60;
    const o2 = this.ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 240;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 3;
    const g = this._sfxGain(0.0); g.gain.linearRampToValueAtTime(0.12, t + 0.05);
    o.connect(f); o2.connect(f); f.connect(g); o.start(); o2.start();
    this._laser = { o, o2, g };
  }
  laserStop() {
    if (!this._laser) return;
    const { o, o2, g } = this._laser; const t = this._now();
    g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + 0.05);
    o.stop(t + 0.07); o2.stop(t + 0.07); this._laser = null;
  }
  sirenStart() {
    if (!this.ok || this._siren) return;
    const o = this.ctx.createOscillator(); o.type = 'sine';
    const lfo = this.ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.7;
    const lg = this.ctx.createGain(); lg.gain.value = 180; lfo.connect(lg); lg.connect(o.frequency);
    o.frequency.value = 760;
    const g = this._sfxGain(0.06); o.connect(g); o.start(); lfo.start();
    this._siren = { o, lfo };
  }
  sirenStop() { if (this._siren) { const t = this._now(); this._siren.o.stop(t + 0.05); this._siren.lfo.stop(t + 0.05); this._siren = null; } }
}
