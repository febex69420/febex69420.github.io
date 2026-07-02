// VELMORA — Supreme Marshal. Game bootstrap + main loop.
// Everything is wired through a single shared context object (ctx) so systems
// stay decoupled and new sandbox systems can be added without rework.
import * as THREE from 'three';
import { CONFIG } from './core/config.js';
import { EventBus } from './core/events.js';
import { Input } from './core/input.js';
import { AudioEngine } from './core/audio.js';
import { initMaterials } from './core/materials.js';
import { nextFrame } from './core/utils.js';
import { World } from './world/world.js';
import { Sky } from './world/sky.js';
import { Props } from './world/props.js';
import { buildPalace } from './world/palace.js';
import { buildCity } from './world/city.js';
import { buildMilitary } from './world/military.js';
import { NPCManager } from './ai/manager.js';
import { EscortSquad } from './ai/escort.js';
import { Traffic } from './ai/traffic.js';
import { Player } from './player/player.js';
import { Weapons } from './player/weapons.js';
import { VehicleManager } from './vehicles/vehicles.js';
import { Effects } from './systems/effects.js';
import { Government } from './systems/government.js';
import { HUD } from './ui/hud.js';

class Game {
  constructor() {
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = 'game';
    document.body.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 5200);
    scene.add(camera);

    this.ctx = {
      config: CONFIG,
      events: new EventBus(),
      input: new Input(renderer.domElement),
      audio: new AudioEngine(),
      renderer, scene, camera,
      frame: 0,
      elapsed: 0,
      timeScale: 1,
      started: false,
      quality: CONFIG.graphics.default,
      qualityPreset: CONFIG.graphics.presets[CONFIG.graphics.default],
      setQuality: q => this.setQuality(q),
    };

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  async init() {
    const ctx = this.ctx;
    // temporary HUD-less boot progress
    const prog = (p, s) => {
      const f = document.querySelector('#boot-fill');
      const st = document.querySelector('#boot-status');
      if (f) f.style.width = (p * 100).toFixed(0) + '%';
      if (st) st.textContent = s;
    };
    const step = async (p, s) => { prog(p, s); await nextFrame(); await nextFrame(); };

    await step(0.05, 'Casting the national crest…');
    ctx.mats = initMaterials();
    ctx.hud = new HUD(ctx);
    ctx.hud.drawCrest(document.querySelector('#boot-crest'));

    await step(0.12, 'Raising the Northreach Mountains…');
    ctx.world = new World(ctx);
    ctx.world.props = new Props(ctx);
    ctx.world.buildBase();

    await step(0.3, 'Laying highways across the Republic…');
    ctx.effects = new Effects(ctx);

    await step(0.4, 'Constructing the Presidential Palace…');
    ctx.palaceData = buildPalace(ctx);

    await step(0.55, 'Populating Aurelgrad and Brenka…');
    buildCity(ctx);

    await step(0.65, 'Garrisoning Fort Karst, paving the airfield…');
    this.militaryData = buildMilitary(ctx);

    await step(0.75, 'Planting the Verdan forests…');
    ctx.world.props.buildNature();

    await step(0.85, 'Waking the nation…');
    ctx.player = new Player(ctx);
    ctx.weapons = new Weapons(ctx);
    ctx.vehicles = new VehicleManager(ctx);
    ctx.vehicles.spawnParked(ctx.palaceData.parkedVehicles);
    ctx.vehicles.spawnParked(this.militaryData.parkedVehicles);
    ctx.sky = new Sky(ctx);
    ctx.government = new Government(ctx);
    ctx.escort = new EscortSquad(ctx);
    ctx.npcs = new NPCManager(ctx);
    ctx.npcs.populate({ palace: ctx.palaceData, military: this.militaryData });
    ctx.traffic = new Traffic(ctx);
    ctx.traffic.build();

    await step(0.97, 'The palace staff bows. Velmora is yours.');
    this.setQuality(ctx.quality);

    document.querySelector('#boot').classList.add('hidden');
    setTimeout(() => document.querySelector('#boot')?.remove(), 800);

    await ctx.hud.showStart();
    ctx.audio.init();
    ctx.input.requestLock();
    ctx.started = true;
    ctx.hud.setAlert(0, 'STATE NORMAL');
    ctx.hud.notify('CHANCELLERY', 'Welcome back to the palace, Supreme Marshal. The nation is yours — no orders required.', '');
    ctx.hud.notify('PROTOCOL', 'Press T for the command radio. Press G to summon your escort. Your office desk opens the State Administration.', 'mil');
  }

  setQuality(q) {
    const ctx = this.ctx;
    ctx.quality = q;
    const p = CONFIG.graphics.presets[q];
    ctx.qualityPreset = p;
    ctx.renderer.setPixelRatio(Math.min(window.devicePixelRatio, p.pixelRatio));
    if (ctx.sky) {
      ctx.sky.setShadowDistance(p.shadowDist, p.shadow);
      ctx.sky.setViewDistance(p.viewDist);
    }
    ctx.camera.far = p.viewDist + 1800;
    ctx.camera.updateProjectionMatrix();
  }

  _radioMenu() {
    const ctx = this.ctx;
    ctx.hud.openRadio([
      { label: ctx.escort.active ? 'Dismiss protection detail' : 'Summon protection detail', desc: 'G', cb: () => ctx.escort.toggle() },
      { label: 'Deliver state limousine', desc: 'motor pool', cb: () => ctx.vehicles.deliver('limo') },
      { label: 'Deliver Bastion APC', desc: 'motor pool', cb: () => ctx.vehicles.deliver('apc') },
      { label: 'Deliver Kestrel helicopter', desc: 'air wing', cb: () => ctx.vehicles.deliver('heli') },
      { label: 'Request air patrol flyby', desc: 'air wing', cb: () => ctx.vehicles.flyby() },
      { label: 'Authorise security drill', desc: 'hostile sim', cb: () => ctx.government.securityDrill() },
      { label: `Alert state: cycle`, desc: 'high command', cb: () => ctx.government.cycleAlert() },
      { label: 'Return to the Palace', desc: 'motorcade', cb: () => ctx.player.teleport(0, 36.2, 120, 'The motorcade returns you to the palace gardens.') },
    ]);
  }

  _globalKeys() {
    const ctx = this.ctx;
    const input = ctx.input;
    const lockLost = this._wasLocked && !input.locked;
    this._wasLocked = input.locked;

    // menu-layer keys
    if (input.pressed('Escape')) {
      if (ctx.hud.menuOpen === 'radio') ctx.hud.closeRadio();
      else if (ctx.hud.menuOpen === 'map') ctx.hud.closeMap();
      else if (ctx.hud.menuOpen === 'gov') ctx.government.close();
      // pointer-lock Escape handled by browser; pause opens on lock loss below
    }
    if (ctx.hud.menuOpen === 'radio') {
      for (let i = 0; i < 9; i++) if (input.pressed('Digit' + (i + 1))) ctx.hud.radioAction(i);
      if (input.pressed('KeyT')) ctx.hud.closeRadio();
      return;
    }
    if (ctx.hud.menuOpen === 'map') {
      if (input.pressed('KeyM')) ctx.hud.closeMap();
      return;
    }
    if (ctx.hud.menuOpen) return;

    if (input.pressed('KeyT')) this._radioMenu();
    if (input.pressed('KeyM')) ctx.hud.openMap();
    if (input.pressed('KeyG')) ctx.escort.toggle();
    if (input.pressed('KeyU')) ctx.hud.toggleHidden();

    // pause on pointer-lock loss (browser Esc) — only on the locked->unlocked edge
    if (lockLost && ctx.started && !ctx.hud.menuOpen) {
      ctx.hud.showPause(true);
    }
  }

  start() {
    const ctx = this.ctx;
    let last = performance.now();
    const loop = (now) => {
      requestAnimationFrame(loop);
      let dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!ctx.started) { ctx.renderer.render(ctx.scene, ctx.camera); return; }
      ctx.frame++;
      ctx.elapsed += dt;

      // pause menu freezes the simulation
      if (ctx.hud.menuOpen === 'pause') {
        if (ctx.input.locked) ctx.hud.showPause(false);
        ctx.renderer.render(ctx.scene, ctx.camera);
        ctx.input.endFrame();
        return;
      }
      this._globalKeys();

      ctx.sky.update(dt, ctx.player.position);
      ctx.world.update(dt, ctx.elapsed);
      ctx.player.update(dt);
      ctx.weapons.update(dt);
      ctx.vehicles.update(dt);
      ctx.npcs.update(dt);
      ctx.escort.update(dt);
      ctx.traffic.update(dt);
      ctx.effects.update(dt);
      ctx.government.update(dt);
      ctx.hud.update(dt);
      ctx.audio.setListener(ctx.player.position.x, ctx.player.eyeY, ctx.player.position.z, ctx.player.yaw);
      ctx.audio.update(dt, {
        night: ctx.sky.nightFactor,
        rain: ctx.sky.rain,
        altitude: Math.max(0, ctx.player.position.y - 40),
      });

      ctx.renderer.render(ctx.scene, ctx.camera);
      ctx.input.endFrame();
    };
    requestAnimationFrame(loop);
  }
}

const game = new Game();
window.VELMORA = game.ctx;   // console/debug handle
game.start();
game.init().catch(err => {
  console.error(err);
  const st = document.querySelector('#boot-status');
  if (st) { st.textContent = 'Initialisation error: ' + err.message; st.style.color = '#e07060'; }
});
