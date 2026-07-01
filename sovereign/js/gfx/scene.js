// gfx/scene.js — renderer, sky, sun/moon, weather, seasons and particle FX.
// Owns the visual atmosphere: a full day/night cycle driven by G.time.hour,
// a weather state machine per season, rain/snow particles, drifting clouds,
// stars, lightning, and a pooled explosion/burst effect system.

import * as THREE from 'three';
import { G, seasonIndex } from '../core/state.js';
import { on, emit } from '../core/bus.js';
import { clamp, lerp } from '../core/rng.js';

export const env = {
  scene: null, renderer: null, camera: null,
  sun: null, moon: null, hemi: null, ambient: null,
  weather: 'clear',           // clear | cloudy | rain | storm | snow
  weatherT: 0, wetness: 0, wind: 0.4,
  lightning: 0, quality: { shadows: true, particles: true },
};

const SKY = {
  night: { sky: 0x0a1226, fog: 0x0a1226, sun: 0x223355, hemi: 0.24, sunI: 0.0 },
  dawn: { sky: 0xd98e5a, fog: 0xc9926f, sun: 0xffb070, hemi: 0.45, sunI: 1.1 },
  day: { sky: 0x87b5e0, fog: 0xa8c4de, sun: 0xfff2d8, hemi: 0.85, sunI: 2.5 },
  dusk: { sky: 0xc06a58, fog: 0xb07a68, sun: 0xff9860, hemi: 0.4, sunI: 0.9 },
};

let stars, clouds = [], rainPts, snowPts, rainGeo, snowGeo;
let bursts = [];
const _c1 = new THREE.Color(), _c2 = new THREE.Color();

export function initScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY.day.sky);
  scene.fog = new THREE.Fog(SKY.day.fog, 500, 2600);

  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.5, 6000);
  camera.position.set(0, 300, 300);

  const hemi = new THREE.HemisphereLight(0xcfe5ff, 0x4a5a40, 0.8);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d8, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 50; sun.shadow.camera.far = 2200;
  const S = 420;
  sun.shadow.camera.left = -S; sun.shadow.camera.right = S;
  sun.shadow.camera.top = S; sun.shadow.camera.bottom = -S;
  sun.shadow.bias = -0.0006;
  scene.add(sun); scene.add(sun.target);
  const moon = new THREE.DirectionalLight(0x8899cc, 0.0);
  scene.add(moon); scene.add(moon.target);
  const ambient = new THREE.AmbientLight(0xffffff, 0.06);
  scene.add(ambient);

  Object.assign(env, { scene, renderer, camera, sun, moon, hemi, ambient });

  makeStars(scene);
  makeClouds(scene);
  makePrecipitation(scene);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  on('battle', (b) => spawnBurst(b.x, b.z, 0xffaa33, false));
  on('explosion', (b) => spawnBurst(b.x, b.z, 0xff6622, b.big));
  on('season', () => pickWeather(true));
  pickWeather(true);
  return env;
}

// ---------------------------------------------------------------- sky dome --

function makeStars(scene) {
  const N = 900, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI * 0.5;
    const r = 2800;
    pos[i * 3] = Math.cos(a) * Math.cos(e) * r;
    pos[i * 3 + 1] = Math.sin(e) * r + 100;
    pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcdd8ff, size: 3.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  stars.renderOrder = -1;
  scene.add(stars);
}

function makeClouds(scene) {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, depthWrite: false });
  const geo = new THREE.SphereGeometry(1, 7, 5);
  for (let i = 0; i < 34; i++) {
    const cluster = new THREE.Group();
    const blobs = 3 + Math.floor(Math.random() * 4);
    for (let b = 0; b < blobs; b++) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set((Math.random() - 0.5) * 90, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 50);
      m.scale.set(28 + Math.random() * 40, 9 + Math.random() * 8, 22 + Math.random() * 26);
      cluster.add(m);
    }
    cluster.position.set((Math.random() - 0.5) * 3600, 300 + Math.random() * 120, (Math.random() - 0.5) * 3600);
    cluster.userData.speed = 3 + Math.random() * 5;
    scene.add(cluster);
    clouds.push(cluster);
  }
}

function makePrecipitation(scene) {
  const makePts = (n, color, size, opacity) => {
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) pos[i] = (Math.random() - 0.5) * 500;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({ color, size, transparent: true, opacity, depthWrite: false }));
    p.visible = false;
    p.frustumCulled = false;
    scene.add(p);
    return p;
  };
  rainPts = makePts(2600, 0x9db8d9, 1.6, 0.55);
  snowPts = makePts(1800, 0xffffff, 2.6, 0.8);
  rainGeo = rainPts.geometry; snowGeo = snowPts.geometry;
}

// ----------------------------------------------------------------- weather --

function pickWeather(force = false) {
  const season = seasonIndex();
  const r = Math.random();
  let w;
  if (season === 3) w = r < 0.42 ? 'snow' : r < 0.65 ? 'cloudy' : 'clear';           // winter
  else if (season === 0) w = r < 0.3 ? 'rain' : r < 0.5 ? 'cloudy' : 'clear';        // spring
  else if (season === 1) w = r < 0.12 ? 'storm' : r < 0.25 ? 'rain' : 'clear';       // summer
  else w = r < 0.3 ? 'rain' : r < 0.38 ? 'storm' : r < 0.6 ? 'cloudy' : 'clear';     // autumn
  env.weather = w;
  env.weatherT = 6 + Math.random() * 18;    // game-hours until next roll
  emit('weather', w);
}

// -------------------------------------------------------------------- FX --

const burstGeo = new THREE.SphereGeometry(1, 8, 6);
export function spawnBurst(x, z, color = 0xff8833, big = false) {
  if (!env.quality.particles) return;
  const y = Math.max(G.world?._h?.(x, z) ?? 0, 0) + 3;
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 });
  const m = new THREE.Mesh(burstGeo, mat);
  m.position.set(x, y, z);
  m.scale.setScalar(big ? 6 : 2.5);
  env.scene.add(m);
  const light = new THREE.PointLight(color, big ? 900 : 250, big ? 260 : 120, 2);
  light.position.set(x, y + 6, z);
  env.scene.add(light);
  bursts.push({ m, light, t: 0, dur: big ? 1.6 : 0.9, big });
  if (bursts.length > 14) killBurst(bursts.shift());
}
function killBurst(b) {
  env.scene.remove(b.m); env.scene.remove(b.light);
  b.m.material.dispose();
}

// ------------------------------------------------------------------ update --

/** Per-frame atmosphere update. dt = real seconds. */
export function updateScene(dt) {
  const h = G.time.hour;
  const sunAngle = ((h - 6) / 24) * Math.PI * 2;       // sunrise at 6:00
  const elev = Math.sin(sunAngle);
  const cam = env.camera;

  // key palette by sun elevation
  let a, b, t;
  if (elev > 0.25) { a = SKY.day; b = SKY.day; t = 0; }
  else if (elev > 0) { a = h < 12 ? SKY.dawn : SKY.dusk; b = SKY.day; t = elev / 0.25; }
  else if (elev > -0.22) { a = SKY.night; b = h < 12 ? SKY.dawn : SKY.dusk; t = (elev + 0.22) / 0.22; }
  else { a = SKY.night; b = SKY.night; t = 0; }

  const cloudDim = env.weather === 'clear' ? 1 : env.weather === 'cloudy' ? 0.8 : 0.55;
  _c1.setHex(a.sky).lerp(_c2.setHex(b.sky), t);
  if (cloudDim < 1) _c1.multiplyScalar(cloudDim * 0.9 + 0.1);
  env.scene.background.copy(_c1);
  env.scene.fog.color.copy(_c1.clone().lerp(_c2.setHex(0xffffff), 0.08));
  const fogDense = env.weather === 'storm' ? 0.5 : env.weather === 'rain' || env.weather === 'snow' ? 0.7 : 1;
  env.scene.fog.near = 400 * fogDense;
  env.scene.fog.far = 2800 * fogDense;

  // sun & moon orbit around the camera focus so shadows stay crisp anywhere
  const fx = cam.position.x, fz = cam.position.z;
  env.sun.intensity = lerp(a.sunI, b.sunI, t) * cloudDim;
  env.sun.color.setHex(a.sun).lerp(_c2.setHex(b.sun), t);
  env.sun.position.set(fx + Math.cos(sunAngle) * 900, Math.max(60, elev * 1100), fz + Math.sin(sunAngle * 0.7) * 500);
  env.sun.target.position.set(fx, 0, fz);
  env.sun.castShadow = env.quality.shadows && elev > 0.02;

  env.moon.intensity = elev < 0 ? 0.35 * -elev + 0.08 : 0;
  env.moon.position.set(fx - Math.cos(sunAngle) * 800, Math.max(80, -elev * 900), fz - Math.sin(sunAngle) * 400);
  env.moon.target.position.set(fx, 0, fz);

  env.hemi.intensity = lerp(a.hemi, b.hemi, t) * (0.6 + cloudDim * 0.4);
  stars.material.opacity = clamp(-elev * 2.2, 0, 0.95);

  // clouds drift
  const cloudOpacity = env.weather === 'clear' ? 0.5 : env.weather === 'cloudy' ? 0.85 : 0.95;
  for (const c of clouds) {
    c.position.x += c.userData.speed * dt * (1 + env.wind);
    if (c.position.x > 2000) c.position.x = -2000;
    c.children[0].material.opacity = cloudOpacity;
  }

  // precipitation follows camera
  const wet = env.weather === 'rain' || env.weather === 'storm';
  rainPts.visible = wet && env.quality.particles;
  snowPts.visible = env.weather === 'snow' && env.quality.particles;
  env.wetness = lerp(env.wetness, wet ? 1 : 0, dt * 0.5);
  if (rainPts.visible) animatePrecip(rainGeo, cam, dt, 320, 3);
  if (snowPts.visible) animatePrecip(snowGeo, cam, dt, 60, 18);

  // lightning
  if (env.weather === 'storm' && Math.random() < dt * 0.25) {
    env.lightning = 1;
    emit('thunder');
  }
  if (env.lightning > 0) {
    env.lightning = Math.max(0, env.lightning - dt * 3);
    env.ambient.intensity = 0.06 + env.lightning * 1.6;
  } else env.ambient.intensity = 0.06;

  // weather clock advances with game time
  if (G.time.speed > 0 && !G.gameOver) {
    const secPerDay = [1e9, 20, 8, 2.5][G.time.speed];
    env.weatherT -= (dt / secPerDay) * 24;
    if (env.weatherT <= 0) pickWeather();
  }

  // FX bursts decay
  for (let i = bursts.length - 1; i >= 0; i--) {
    const bst = bursts[i];
    bst.t += dt;
    const k = bst.t / bst.dur;
    if (k >= 1) { killBurst(bst); bursts.splice(i, 1); continue; }
    bst.m.scale.setScalar((bst.big ? 6 : 2.5) + k * (bst.big ? 30 : 12));
    bst.m.material.opacity = 0.95 * (1 - k);
    bst.light.intensity = (bst.big ? 900 : 250) * (1 - k);
  }
}

function animatePrecip(geo, cam, dt, fallSpeed, drift) {
  const p = geo.attributes.position.array;
  const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
  for (let i = 0; i < p.length; i += 3) {
    p[i + 1] -= fallSpeed * dt;
    p[i] += drift * dt * env.wind * 8;
    if (p[i + 1] < cy - 120) {
      p[i] = cx + (Math.random() - 0.5) * 500;
      p[i + 1] = cy + 100 + Math.random() * 150;
      p[i + 2] = cz + (Math.random() - 0.5) * 500;
    }
  }
  geo.attributes.position.needsUpdate = true;
}
