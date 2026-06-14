// main.js — SKYBOUND orchestrator. Builds the renderer/scene/camera, constructs and wires
// every system through a shared context + event bus, runs the variable-but-clamped update
// loop with super-speed time dilation, and exposes the `game` facade the UI drives.
import * as THREE from 'three';
import { EventBus, clamp } from './core/util.js';
import { Settings, SaveSystem } from './core/settings.js';
import { Input, DEFAULT_BINDINGS } from './core/input.js';
import { Assets, Particles, Decals, AudioEngine } from './core/assets.js';
import { Sky } from './render/sky.js';
import { Weather } from './render/weather.js';
import { PostFX } from './render/postfx.js';
import { generateCityPlan } from './world/cityplan.js';
import { City } from './world/city.js';
import { PhysicsWorld } from './physics/physics.js';
import { Destruction } from './physics/destruction.js';
import { Hero } from './entities/hero.js';
import { PowerManager } from './entities/powers.js';
import { Combat } from './combat.js';
import { Crowd } from './ai/crowd.js';
import { Traffic } from './ai/traffic.js';
import { Director } from './ai/director.js';
import { Progression } from './progression.js';
import { UI } from './ui.js';

const FIXED_MAX = 1 / 30;
const DAY_LENGTH = 240; // seconds for a full day-night cycle

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.settings = new Settings();
    this.bus = new EventBus();
    this.paused = true; this.started = false;
    this.timeOfDay = 0.32; this.elapsed = 0;
    this.currentSlot = 'slot1';

    // ---- renderer ----
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: this.settings.get('preset') !== 'Potato', powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = this.settings.get('shadows');
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.settings.get('fov'), 1, 0.3, 7000);
    this.camera.position.set(0, 6, 14);

    // ---- core services ----
    this.input = new Input(this.canvas, this.settings.get('bindings') || DEFAULT_BINDINGS);
    this.input.sensitivity = this.settings.get('sensitivity');
    this.input.invertY = this.settings.get('invertY');
    this.audio = new AudioEngine(this.settings);
    this.assets = new Assets();
    this.particles = new Particles(this.scene, this.settings.get('particleBudget'));
    this.decals = new Decals(this.scene, this.assets);
    this.sky = new Sky(this.scene, this.renderer);
    this.sky.setShadows(this.settings.get('shadows'));
    this.weather = new Weather(this.scene, this.settings, this.audio);
    this.postfx = new PostFX(this.renderer, 16, 16);
    this.usePost = this.settings.get('bloom');

    // ---- world ----
    this.plan = generateCityPlan('Lumera');
    this.city = new City(this.scene, this.assets, this.settings, this.plan);
    this.physics = new PhysicsWorld({ groundY: (x, z) => this.city.groundY(x, z), collidersNear: (x, z, r) => this.city.staticCollidersNear(x, z, r), maxBodies: 340 });
    this.destruction = new Destruction({ scene: this.scene, physics: this.physics, assets: this.assets, particles: this.particles, decals: this.decals, audio: this.audio, city: this.city, bus: this.bus });
    this.progression = new Progression();

    // ---- actors ----
    this.heroCtx = { input: this.input, settings: this.settings, physics: this.physics, particles: this.particles, audio: this.audio, bus: this.bus, city: this.city, decals: this.decals, destruction: this.destruction };
    this.hero = new Hero(this.scene, this.heroCtx);
    this.hero.teleport(this.city.spawnPoint());

    this.powers = new PowerManager({ hero: this.hero, input: this.input, scene: this.scene, physics: this.physics, destruction: this.destruction, particles: this.particles, decals: this.decals, audio: this.audio, bus: this.bus, city: this.city, settings: this.settings });
    this.combatCtx = { scene: this.scene, physics: this.physics, particles: this.particles, audio: this.audio, bus: this.bus, city: this.city, destruction: this.destruction, hero: this.hero, input: this.input, time: 0 };
    this.combat = new Combat(this.combatCtx);
    this.crowd = new Crowd(this.scene, { hero: this.hero, settings: this.settings, audio: this.audio, bus: this.bus, city: this.city, particles: this.particles });
    this.traffic = new Traffic(this.scene, { hero: this.hero, settings: this.settings, audio: this.audio, bus: this.bus, city: this.city, assets: this.assets, destruction: this.destruction });

    // ---- UI + director ----
    this.ui = new UI({ settings: this.settings, input: this.input, audio: this.audio, save: SaveSystem, game: this, city: this.city });
    this.director = new Director({ hero: this.hero, combat: this.combat, traffic: this.traffic, crowd: this.crowd, destruction: this.destruction, particles: this.particles, scene: this.scene, bus: this.bus, progression: this.progression, settings: this.settings, city: this.city, ui: this.ui });

    // late binding so systems can reach each other
    this.powers.bind({ combat: this.combat, crowd: this.crowd, traffic: this.traffic, director: this.director });
    this.ui.bind({ hero: this.hero, powers: this.powers, progression: this.progression, crowd: this.crowd, combat: this.combat, director: this.director, city: this.city, game: this });
    this.heroCtx.combat = this.combat;

    // progression hooks
    this.progression.onLevelUp = (lv) => { this.applyProgression(); this.ui.notify('LEVEL UP — Level ' + lv + '! +1 skill point', 0xffd24a); if (this.audio) this.audio.zap(900, 1); };
    this.applyProgression();

    // events feeding progression stats
    this.bus.on('DESTRUCTION', () => { this.progression.stat('sliced'); this.progression.addXP(1); });
    this.bus.on('COMBAT', (e) => { if (e.defeated) { this.progression.stat('defeated'); this.progression.addXP(12); this.progression.addRenown(8); } });

    addEventListener('resize', () => this.resize());
    this.canvas.addEventListener('click', () => { this.audio.resume(); });
    this.resize();
    this.applySettings();

    this.ui.showTitle();
    this._last = performance.now();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    const scale = clamp(this.settings.get('renderScale'), 0.5, 1);
    this.renderer.setPixelRatio(clamp(devicePixelRatio * scale, 0.5, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    const buf = new THREE.Vector2(); this.renderer.getDrawingBufferSize(buf);
    this.postfx.resize(buf.x, buf.y);
  }

  applySettings() {
    const s = this.settings;
    this.input.sensitivity = s.get('sensitivity');
    this.input.invertY = s.get('invertY');
    this.renderer.shadowMap.enabled = s.get('shadows');
    this.sky.setShadows(s.get('shadows'));
    this.usePost = s.get('bloom');
    this.postfx.setStrength(s.get('bloom') ? 0.9 : 0);
    this.camera.fov = s.get('fov'); this.camera.updateProjectionMatrix();
    if (this.audio) this.audio.setMaster(s.get('volMaster'));
    this.particles.setScale(700);
    this.resize();
  }

  applyProgression() {
    const p = this.progression;
    this.hero.maxHealth = 1000 + p.healthBonus();
    this.hero.health = Math.min(this.hero.health, this.hero.maxHealth);
    this.powers.maxEnergy = 100 + p.energyBonus();
    this.powers.regen = 22 * p.regenMul();
    this.hero.FLY = 42 * p.flightMul(); this.hero.BOOST = 150 * p.flightMul(); this.hero.SUPER = 70 * p.flightMul();
  }

  // ---------------------------------------------------------------- loop ----
  _loop(now) {
    const realDt = clamp((now - this._last) / 1000, 0, FIXED_MAX);
    this._last = now;

    // frame-level toggles (menus) always responsive
    if (this.started && this.input.pressed('pause')) this.togglePause();
    if (this.started && !this.paused && this.input.pressed('sandbox')) { this.pause(); this.ui.showSandbox(); }

    if (this.started && !this.paused) this._update(realDt);

    this._render();
    this.input.endFrame();
    requestAnimationFrame(this._loop);
  }

  _update(realDt) {
    this.elapsed += realDt;
    if (!this.settings.get('lockTime')) this.timeOfDay = (this.timeOfDay + realDt / DAY_LENGTH) % 1;
    this.combatCtx.time = this.elapsed;
    this.physics.time = this.elapsed;

    // hero is responsive (real dt); world sim is scaled by time dilation
    this.hero.update(realDt);
    const worldDt = realDt * this.hero.timeScale;

    this.powers.update(realDt);
    this.combat.update(worldDt);
    this.crowd.update(worldDt, this.elapsed);
    this.traffic.update(worldDt);
    this.director.update(worldDt);

    this.destruction.beginFrame();
    this.physics.step(worldDt);
    this.particles.update(worldDt);
    this.decals.update(worldDt);

    // distance flown stat
    this.progression.stat('distance', this.hero.speed * realDt);

    // rendering-world updates
    const camPos = this.camera.position;
    this.weather.update(realDt, camPos);
    this.sky.update(this.timeOfDay, camPos, this.weather.darken, this.weather.fogDensity);
    this.hero.updateCamera(this.camera, realDt);
    this.frustumCull();
    this.ui.update(realDt);
  }

  frustumCull() {
    this._frustum = this._frustum || new THREE.Frustum();
    this._pm = this._pm || new THREE.Matrix4();
    this.camera.updateMatrixWorld();
    this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert();
    this._pm.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._pm);
    this.city.update(this.camera.position, this._frustum, this.settings.get('drawDistance'));
  }

  _render() {
    if (this.usePost) this.postfx.render(this.scene, this.camera);
    else { this.renderer.setRenderTarget(null); this.renderer.render(this.scene, this.camera); }
  }

  // ---------------------------------------------------------------- facade ----
  newGame() {
    this.progression = new Progression();
    this.progression.onLevelUp = (lv) => { this.applyProgression(); this.ui.notify('LEVEL UP — Level ' + lv + '!', 0xffd24a); };
    this.ui.bind({ progression: this.progression });
    this.director.ctx.progression = this.progression;
    this.hero.health = this.hero.maxHealth = 1000;
    this.hero.teleport(this.city.spawnPoint());
    this.applyProgression();
    this._begin();
    this.ui.notify('Welcome to Lumera, ' + this.settings.get('heroName') + '!', 0x7af7ff);
  }
  _begin() { this.started = true; this.paused = false; this.ui.startGame(); this.audio.resume(); this.input.requestLock(); }

  togglePause() { if (this.paused) this.resume(); else this.pause(); }
  pause() { this.paused = true; this.input.exitLock(); this.ui.openPause(); }
  resume() { if (!this.started) return; this.paused = false; this.ui.closeScreens(); this.ui.showHUD(true); this.input.requestLock(); }
  quitToTitle() { this.paused = true; this.input.exitLock(); this.combat.clear(); this.director.clear(); this.physics.clearDebris(); this.powers.reset(); this.ui.showTitle(); this.started = false; }

  save(slot) {
    slot = slot || this.currentSlot;
    const state = {
      heroName: this.settings.get('heroName'), hero: this.hero.saveState(),
      progression: this.progression.serialize(), timeOfDay: this.timeOfDay,
      weather: this.weather.state, sandbox: { invulnerable: this.settings.get('invulnerable'), infiniteEnergy: this.settings.get('infiniteEnergy') },
    };
    SaveSystem.save(slot, state); this.currentSlot = slot;
  }
  load(slot) {
    const data = SaveSystem.load(slot); if (!data) return;
    const st = data.state;
    if (st.heroName) this.settings.set('heroName', st.heroName);
    this.progression.deserialize(st.progression);
    this.hero.loadState(st.hero);
    this.timeOfDay = st.timeOfDay != null ? st.timeOfDay : this.timeOfDay;
    if (st.weather) this.weather.set(st.weather, true);
    this.currentSlot = slot;
    this.applyProgression();
    this._begin();
    this.ui.notify('Game loaded', 0x66ff99);
  }

  upgradeSkill(k) { const ok = this.progression.upgrade(k); if (ok) { this.applyProgression(); if (this.audio) this.audio.ui(); } return ok; }

  // sandbox commands
  teleport(l) { this.hero.teleport(new THREE.Vector3(l.x, 60, l.z)); this.hero.flying = true; this.resume(); this.ui.notify('Teleported to ' + (l.name || 'location'), 0x7af7ff); }
  setWeather(w) { this.weather.set(w); this.weather.autoChange = false; this.ui.notify('Weather: ' + w); }
  setTime(t) { this.timeOfDay = t; }
  spawnEnemy(type) { const p = this.hero.pos.clone().addScaledVector(this.hero.forward(), 24).setY(2); this.combat.spawn(type, p); this.resume(); }
  triggerEvent(type) { this.director.spawn(type); this.resume(); }
  toggle(key) { this.settings.set(key, !this.settings.get(key)); this.applySettings(); this.ui.notify(key + ': ' + (this.settings.get(key) ? 'ON' : 'OFF')); }
  toggleDirector() { this.director.enabled = !this.director.enabled; this.ui.notify('Director: ' + (this.director.enabled ? 'ON' : 'OFF')); }
  clearDebris() { this.physics.clearDebris(); this.ui.notify('Debris cleared'); }
}

window.SKYBOUND = new Game();
