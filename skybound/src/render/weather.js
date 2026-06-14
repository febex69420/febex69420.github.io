// weather.js — weather state machine: clouds, rain/snow, fog boost, lightning, wind.
import * as THREE from 'three';
import { clamp01, lerp, damp, RNG } from '../core/util.js';

export const WEATHERS = ['clear', 'cloudy', 'overcast', 'rain', 'storm'];

const PROFILE = {
  clear:    { cover: 0.12, precip: 0.0, darken: 0.0, fog: 0.0008, wind: 4 },
  cloudy:   { cover: 0.45, precip: 0.0, darken: 0.12, fog: 0.0011, wind: 7 },
  overcast: { cover: 0.8, precip: 0.0, darken: 0.30, fog: 0.0016, wind: 9 },
  rain:     { cover: 0.9, precip: 0.7, darken: 0.45, fog: 0.0024, wind: 12 },
  storm:    { cover: 1.0, precip: 1.0, darken: 0.62, fog: 0.003, wind: 18 },
};

function cloudTexture() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.5, 'rgba(245,248,252,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Weather {
  constructor(scene, settings, audio) {
    this.scene = scene; this.settings = settings; this.audio = audio;
    this.state = 'clear';
    this.cur = Object.assign({}, PROFILE.clear);   // animated values
    this.target = Object.assign({}, PROFILE.clear);
    this.rng = new RNG(99);
    this.wind = new THREE.Vector3(1, 0, 0.4).normalize();
    this.timeToChange = 80 + this.rng.float(0, 120);
    this.autoChange = true;

    // Cloud layer (soft billboards)
    this.clouds = new THREE.Group();
    const tx = cloudTexture();
    this.cloudMat = new THREE.SpriteMaterial({ map: tx, color: 0xffffff, transparent: true, opacity: 0.0, depthWrite: false, fog: false });
    this.cloudData = [];
    for (let i = 0; i < 70; i++) {
      const s = new THREE.Sprite(this.cloudMat.clone());
      const sx = 180 + this.rng.float(0, 320), sy = sx * (0.4 + this.rng.float(0, 0.2));
      s.scale.set(sx, sy, 1);
      s.position.set(this.rng.float(-1800, 1800), 280 + this.rng.float(0, 260), this.rng.float(-1800, 1800));
      this.clouds.add(s);
      this.cloudData.push({ s, base: this.rng.float(0.3, 0.9) });
    }
    scene.add(this.clouds);

    // Rain streaks (line segments)
    this.rainCount = 2400;
    const rp = new Float32Array(this.rainCount * 2 * 3);
    this.rainVel = new Float32Array(this.rainCount);
    for (let i = 0; i < this.rainCount; i++) this._seedDrop(rp, i, new THREE.Vector3());
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(rp, 3).setUsage(THREE.DynamicDrawUsage));
    this.rainPos = rp;
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0x9fb4c8, transparent: true, opacity: 0 }));
    this.rain.frustumCulled = false;
    scene.add(this.rain);

    // Lightning flash light
    this.flash = new THREE.PointLight(0xcdd8ff, 0, 4000);
    scene.add(this.flash);
    this.flashTimer = 0; this.nextFlash = 6 + this.rng.float(0, 8);
  }

  _seedDrop(arr, i, center) {
    const x = center.x + this.rng.float(-160, 160);
    const z = center.z + this.rng.float(-160, 160);
    const y = center.y + this.rng.float(20, 220);
    const len = 3 + this.rng.float(0, 4);
    arr[i * 6] = x; arr[i * 6 + 1] = y; arr[i * 6 + 2] = z;
    arr[i * 6 + 3] = x; arr[i * 6 + 4] = y - len; arr[i * 6 + 5] = z;
    this.rainVel[i] = 90 + this.rng.float(0, 60);
  }

  set(state, instant = false) {
    if (!PROFILE[state]) return;
    this.state = state;
    this.target = Object.assign({}, PROFILE[state]);
    if (instant) this.cur = Object.assign({}, this.target);
  }

  update(dt, camPos) {
    const fx = this.settings ? this.settings.get('weatherFX') : true;

    if (this.autoChange) {
      this.timeToChange -= dt;
      if (this.timeToChange <= 0) {
        this.timeToChange = 70 + this.rng.float(0, 140);
        // weighted random walk toward neighbors
        const order = WEATHERS.indexOf(this.state);
        const next = clamp01((order + this.rng.int(-1, 1)) / (WEATHERS.length - 1));
        this.set(WEATHERS[Math.round(next * (WEATHERS.length - 1))]);
      }
    }

    // animate current toward target
    for (const k of ['cover', 'precip', 'darken', 'fog', 'wind']) {
      this.cur[k] = damp(this.cur[k], this.target[k], 0.6, dt);
    }

    // clouds
    const windSpeed = this.cur.wind;
    this.clouds.position.set(camPos.x, 0, camPos.z);
    for (const cd of this.cloudData) {
      cd.s.position.x += this.wind.x * windSpeed * dt * 0.6;
      cd.s.position.z += this.wind.z * windSpeed * dt * 0.6;
      // wrap within +-2000 of origin (group is camera-centered)
      if (cd.s.position.x > 2000) cd.s.position.x -= 4000;
      if (cd.s.position.x < -2000) cd.s.position.x += 4000;
      if (cd.s.position.z > 2000) cd.s.position.z -= 4000;
      if (cd.s.position.z < -2000) cd.s.position.z += 4000;
      cd.s.material.opacity = fx ? clamp01(this.cur.cover * cd.base) : clamp01(this.cur.cover * cd.base * 0.5);
      cd.s.material.color.setScalar(lerp(1, 0.6, this.cur.darken));
    }

    // rain
    const precip = fx ? this.cur.precip : 0;
    this.rain.material.opacity = precip * 0.55;
    if (precip > 0.02) {
      const arr = this.rainPos;
      for (let i = 0; i < this.rainCount; i++) {
        const fall = this.rainVel[i] * dt;
        arr[i * 6 + 1] -= fall; arr[i * 6 + 4] -= fall;
        // drift with wind
        const dx = this.wind.x * this.cur.wind * dt;
        arr[i * 6] += dx; arr[i * 6 + 3] += dx;
        if (arr[i * 6 + 1] < camPos.y - 40 || Math.abs(arr[i * 6] - camPos.x) > 180 || Math.abs(arr[i * 6 + 2] - camPos.z) > 180) {
          this._seedDrop(arr, i, camPos);
        }
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }

    // lightning (storm only)
    this.flash.intensity = Math.max(0, this.flash.intensity - dt * 14);
    if (this.state === 'storm' && fx) {
      this.flashTimer += dt;
      if (this.flashTimer > this.nextFlash) {
        this.flashTimer = 0; this.nextFlash = 4 + this.rng.float(0, 9);
        const safe = this.settings && this.settings.get('photosensitiveSafe');
        this.flash.intensity = safe ? 1.5 : 6;
        this.flash.position.set(camPos.x + this.rng.float(-400, 400), 500, camPos.z + this.rng.float(-400, 400));
        if (this.audio) setTimeout(() => this.audio.thunder(), 400 + this.rng.float(0, 1400));
      }
    }
  }

  get darken() { return this.cur.darken; }
  get fogDensity() { return this.cur.fog; }
}
