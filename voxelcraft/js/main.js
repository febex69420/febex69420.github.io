// main.js — game orchestrator: renderer, sky/weather/day cycle, fixed-tick loop,
// dimensions & portals, furnaces, save/load, title & world-select screens.
import * as THREE from 'three';
import { CS, CH, SEA, DAY_LEN, clamp, lerp, strSeed, mulberry32 } from './util.js';
import { B, BLOCKS, getAtlasCanvas } from './blocks.js';
import { World } from './world.js';
import { Mesher } from './mesher.js';
import { Player } from './player.js';
import { EntityManager } from './entities.js';
import { Redstone } from './redstone.js';
import { AudioEngine } from './audio.js';
import { UI } from './ui.js';
import { Multiplayer } from './multiplayer.js';
import { SMELT, FUEL } from './crafting.js';
import { BIOME_NAMES } from './worldgen.js';

const SKY = {
  day: new THREE.Color(0x87ceeb),
  night: new THREE.Color(0x070b1a),
  dawn: new THREE.Color(0xe8915a),
  rain: new THREE.Color(0x5a6b7a),
  nether: new THREE.Color(0x2a0d0d),
};

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 1000);
    this.resize();
    window.addEventListener('resize', () => this.resize());

    this.settings = Object.assign({
      renderDist: 5, fov: 70, sensitivity: 1,
      volMaster: 0.8, volSfx: 1, volMusic: 0.5,
      playerName: 'Player' + ((Math.random() * 900 + 100) | 0),
    }, JSON.parse(localStorage.getItem('vc:settings') || '{}'));
    this.playerName = this.settings.playerName;

    this.running = false;
    this.pointerLocked = false;
    this.time = 1000; this.day = 0;
    this.daylight = 1;
    this.weather = 'clear';
    this.weatherTimer = 600;
    this.peaceful = false;
    this.fps = 60;
    this.unsaved = false;
    this.autosaveT = 0;
    this.flashT = 0;
    this.lightningT = 0;

    this.audio = new AudioEngine(this);
    this.audio.volumes = { master: this.settings.volMaster, sfx: this.settings.volSfx, music: this.settings.volMusic };
    this.mesher = new Mesher(this);
    this.ui = new UI(this);
    this.entities = new EntityManager(this);
    this.redstone = new Redstone(this);
    this.mp = new Multiplayer(this);
    this.player = null;
    this.worlds = {};
    this.world = null;
    this.portals = { 0: [], 1: [] };

    this.buildSky();
    this.bindTitle();
    this.showTitle();

    this.canvas.addEventListener('click', () => {
      if (this.running && !this.ui.anyScreenOpen() && !this.ui.chatOpen && !this.pointerLocked) this.ui.lockPointer();
      this.audio.ensure();
    });
    window.addEventListener('beforeunload', () => { if (this.running) this.save(); });

    this.camera.fov = this.settings.fov;
    this.camera.updateProjectionMatrix();

    this.last = performance.now();
    this.tickAcc = 0;
    requestAnimationFrame((t) => this.frame(t));
  }

  resize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  saveSettings() {
    this.settings.playerName = this.playerName;
    localStorage.setItem('vc:settings', JSON.stringify(this.settings));
  }

  markUnsaved() { this.unsaved = true; }

  // ============================ sky & weather ============================
  buildSky() {
    // sun & moon
    const mkDisc = (color, glow) => {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 64;
      const c = cv.getContext('2d');
      c.fillStyle = glow; c.fillRect(8, 8, 48, 48);
      c.fillStyle = color; c.fillRect(14, 14, 36, 36);
      const tex = new THREE.CanvasTexture(cv);
      tex.magFilter = THREE.NearestFilter;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
      sp.scale.set(60, 60, 1);
      sp.renderOrder = -10;
      this.scene.add(sp);
      return sp;
    };
    this.sun = mkDisc('#ffe14d', 'rgba(255,225,77,0.35)');
    this.moon = mkDisc('#d8d8e8', 'rgba(216,216,232,0.2)');
    // stars
    const starGeo = new THREE.BufferGeometry();
    const pos = [];
    const rng = mulberry32(42);
    for (let i = 0; i < 700; i++) {
      const t = rng() * Math.PI * 2, p = Math.acos(rng() * 2 - 1);
      pos.push(420 * Math.sin(p) * Math.cos(t), 420 * Math.cos(p), 420 * Math.sin(p) * Math.sin(t));
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.4, sizeAttenuation: false, transparent: true, depthWrite: false }));
    this.stars.renderOrder = -11;
    this.scene.add(this.stars);
    // clouds
    const ccv = document.createElement('canvas');
    ccv.width = ccv.height = 256;
    const cc = ccv.getContext('2d');
    const crng = mulberry32(7);
    cc.clearRect(0, 0, 256, 256);
    for (let i = 0; i < 60; i++) {
      cc.fillStyle = 'rgba(255,255,255,0.85)';
      const w = 20 + crng() * 40, h = 8 + crng() * 16;
      cc.fillRect(crng() * 256, crng() * 256, w, h);
    }
    this.cloudTex = new THREE.CanvasTexture(ccv);
    this.cloudTex.wrapS = this.cloudTex.wrapT = THREE.RepeatWrapping;
    this.cloudTex.magFilter = THREE.NearestFilter;
    const cloudMat = new THREE.MeshBasicMaterial({ map: this.cloudTex, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide });
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), cloudMat);
    this.clouds.rotation.x = -Math.PI / 2;
    this.clouds.position.y = CH - 8;
    this.clouds.renderOrder = 5;
    this.scene.add(this.clouds);
    // precipitation
    const rainGeo = new THREE.BufferGeometry();
    this.rainCount = 800;
    this.rainPos = new Float32Array(this.rainCount * 3);
    for (let i = 0; i < this.rainCount; i++) {
      this.rainPos[i * 3] = (Math.random() - 0.5) * 36;
      this.rainPos[i * 3 + 1] = Math.random() * 24;
      this.rainPos[i * 3 + 2] = (Math.random() - 0.5) * 36;
    }
    rainGeo.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    this.rainMat = new THREE.PointsMaterial({ color: 0x88aaff, size: 0.08, transparent: true, opacity: 0.7 });
    this.rain = new THREE.Points(rainGeo, this.rainMat);
    this.rain.visible = false;
    this.scene.add(this.rain);
  }

  setWeather(w) {
    this.weather = w;
    this.weatherTimer = w === 'clear' ? 400 + Math.random() * 600 : 120 + Math.random() * 240;
    this.markUnsaved();
  }

  daylightOf(t) {
    if (t < 11500) return 1;
    if (t < 13500) return 1 - ((t - 11500) / 2000) * 0.96;
    if (t < 22000) return 0.04;
    if (t < 24000) return 0.04 + ((t - 22000) / 2000) * 0.96;
    return 1;
  }

  biomeName() {
    if (!this.world) return '';
    if (this.world.dim === 1) return 'Nether';
    const p = this.player.pos;
    const h = this.world.gen.heightAt(Math.floor(p.x), Math.floor(p.z));
    return BIOME_NAMES[this.world.gen.biomeAt(Math.floor(p.x), Math.floor(p.z), h)] || '?';
  }

  updateSky(dt) {
    const dim = this.world.dim;
    const t = this.time;
    this.daylight = dim === 1 ? 0.1 : this.daylightOf(t);
    let weatherDim = this.weather !== 'clear' ? 0.55 : 1;

    let sky;
    if (dim === 1) sky = SKY.nether.clone();
    else {
      const dl = this.daylight;
      sky = SKY.night.clone().lerp(SKY.day, dl);
      // dawn/dusk tint
      const dawnAmt = Math.max(0, 1 - Math.abs(t - 12500) / 1200) + Math.max(0, 1 - Math.abs(t - 23000) / 1200);
      if (dawnAmt > 0) sky.lerp(SKY.dawn, clamp(dawnAmt, 0, 0.6));
      if (this.weather !== 'clear') sky.lerp(SKY.rain, 0.6);
    }
    if (this.flashT > 0) { sky.lerp(new THREE.Color(1, 1, 1), Math.min(1, this.flashT * 4)); this.flashT -= dt; }
    this.renderer.setClearColor(sky);

    // fog tracks sky
    const dist = this.settings.renderDist * CS;
    this.mesher.setEnv(this.daylight * weatherDim, sky, dist * 0.55, dist * 0.95);

    // sun/moon path
    const ang = ((t / DAY_LEN) * Math.PI * 2) - Math.PI / 2; // t=6000 → overhead
    const cp = this.camera.position;
    this.sun.visible = this.moon.visible = dim === 0;
    this.stars.visible = dim === 0;
    this.clouds.visible = dim === 0;
    this.sun.position.set(cp.x + Math.cos(ang) * 380, cp.y + Math.sin(ang) * 380, cp.z);
    this.moon.position.set(cp.x - Math.cos(ang) * 380, cp.y - Math.sin(ang) * 380, cp.z);
    this.stars.position.copy(cp);
    this.stars.material.opacity = clamp(1 - this.daylight * 1.4, 0, 1);
    this.clouds.position.x = cp.x; this.clouds.position.z = cp.z;
    this.cloudTex.offset.x += dt * 0.002;

    // precipitation
    const raining = this.weather !== 'clear' && dim === 0;
    this.rain.visible = raining;
    if (raining) {
      const cold = this.biomeName() === 'Snowy Tundra' || this.biomeName() === 'Mountains';
      this.rainMat.color.set(cold ? 0xffffff : 0x88aaff);
      this.rainMat.size = cold ? 0.12 : 0.08;
      const fall = cold ? 3 : 18;
      for (let i = 0; i < this.rainCount; i++) {
        this.rainPos[i * 3 + 1] -= fall * dt * (0.7 + (i % 5) * 0.1);
        if (this.rainPos[i * 3 + 1] < 0) this.rainPos[i * 3 + 1] = 24;
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
      this.rain.position.set(cp.x, cp.y - 6, cp.z);
      this.audio.setRain(true, this.weather === 'thunder' ? 1.4 : 1);
    } else this.audio.setRain(false);

    // lightning
    if (this.weather === 'thunder' && dim === 0) {
      this.lightningT -= dt;
      if (this.lightningT <= 0) {
        this.lightningT = 4 + Math.random() * 12;
        this.flashT = 0.3;
        setTimeout(() => this.audio.play('thunder'), 300 + Math.random() * 1200);
      }
    }
  }

  // ============================ dimensions & portals ============================
  setDimension(dim, tx, tz) {
    if (!this.worlds[dim]) this.worlds[dim] = new World(this, this.seed, dim);
    const old = this.world;
    this.world = this.worlds[dim];
    // toggle chunk mesh visibility per dimension
    if (old && old !== this.world) {
      for (const [, c] of old.chunks) { if (c.meshO) c.meshO.visible = false; if (c.meshW) c.meshW.visible = false; }
    }
    for (const [, c] of this.world.chunks) { if (c.meshO) c.meshO.visible = true; if (c.meshW) c.meshW.visible = true; }
    if (tx !== undefined) {
      const y = this.preparePortalDestination(this.world, tx, tz);
      this.player.pos.set(tx + 0.5, y, tz + 0.5);
      this.player.vel.set(0, 0, 0);
      this.player.fallStart = null;
    }
    this.world.genQueue.length = 0;
  }

  travelPortal() {
    const destDim = this.world.dim === 0 ? 1 : 0;
    const p = this.player.pos;
    const scale = destDim === 1 ? 1 / 8 : 8;
    const tx = Math.floor(p.x * scale), tz = Math.floor(p.z * scale);
    this.audio.play('portal');
    this.setDimension(destDim, tx, tz);
    this.ui.chatMsg(destDim === 1 ? 'Entering the Nether…' : 'Returning to the Overworld…', '#d6a0ff');
  }

  preparePortalDestination(world, tx, tz) {
    // load chunks around destination synchronously
    for (let dcx = -1; dcx <= 1; dcx++) for (let dcz = -1; dcz <= 1; dcz++) {
      const cx = (tx >> 4) + dcx, cz = (tz >> 4) + dcz;
      if (!world.chunkAt(cx, cz)) world.loadChunk(cx, cz);
    }
    // existing portal nearby?
    for (const pt of this.portals[world.dim]) {
      if (Math.abs(pt.x - tx) < 16 && Math.abs(pt.z - tz) < 16) return pt.y;
    }
    // build a fresh portal
    let y;
    if (world.dim === 1) {
      y = 0;
      for (let yy = 40; yy < 90; yy++) {
        if (world.getBlock(tx, yy, tz) !== B.AIR && world.getBlock(tx, yy + 1, tz) === B.AIR && world.getBlock(tx, yy + 2, tz) === B.AIR) { y = yy + 1; break; }
      }
      if (!y) { y = 50; }
    } else {
      y = world.getTopY(tx, tz) + 1;
    }
    // platform + frame (plane along x)
    for (let dx = -2; dx <= 3; dx++) for (let dz = -2; dz <= 2; dz++) {
      world.setBlock(tx + dx, y - 1, tz + dz, world.dim === 1 ? B.NETHERRACK : B.STONE, { noUpdate: true });
      for (let dy = 0; dy < 5; dy++) {
        const id = world.getBlock(tx + dx, y + dy, tz + dz);
        if (id !== B.AIR && BLOCKS[id].solid) world.setBlock(tx + dx, y + dy, tz + dz, B.AIR, { noUpdate: true });
      }
    }
    for (let dx = 0; dx < 4; dx++) for (let dy = 0; dy < 5; dy++) {
      const edge = dx === 0 || dx === 3 || dy === 0 || dy === 4;
      world.setBlock(tx + dx - 1, y + dy, tz, edge ? B.OBSIDIAN : B.PORTAL, { noUpdate: true });
    }
    this.portals[world.dim].push({ x: tx, y: y + 1, z: tz });
    this.markUnsaved();
    return y + 1;
  }

  tryIgnitePortal(x, y, z) {
    const world = this.world;
    for (const axis of ['x', 'z']) {
      const ux = axis === 'x' ? 1 : 0, uz = axis === 'x' ? 0 : 1;
      // find interior bounds
      let x0 = x, z0 = z;
      while (world.getBlock(x0 - ux, y, z0 - uz) === B.AIR && Math.abs(x0 - x) + Math.abs(z0 - z) < 8) { x0 -= ux; z0 -= uz; }
      let y0 = y;
      while (world.getBlock(x0, y0 - 1, z0) === B.AIR && y - y0 < 8) y0--;
      // measure width/height
      let w = 0;
      while (world.getBlock(x0 + ux * w, y0, z0 + uz * w) === B.AIR && w < 8) w++;
      let h = 0;
      while (world.getBlock(x0, y0 + h, z0) === B.AIR && h < 8) h++;
      if (w < 2 || w > 6 || h < 3 || h > 6) continue;
      // verify rectangle interior + obsidian boundary
      let ok = true;
      for (let i = 0; i < w && ok; i++) for (let j = 0; j < h && ok; j++) {
        if (world.getBlock(x0 + ux * i, y0 + j, z0 + uz * i) !== B.AIR) ok = false;
      }
      for (let i = 0; i < w && ok; i++) {
        if (world.getBlock(x0 + ux * i, y0 - 1, z0 + uz * i) !== B.OBSIDIAN) ok = false;
        if (world.getBlock(x0 + ux * i, y0 + h, z0 + uz * i) !== B.OBSIDIAN) ok = false;
      }
      for (let j = 0; j < h && ok; j++) {
        if (world.getBlock(x0 - ux, y0 + j, z0 - uz) !== B.OBSIDIAN) ok = false;
        if (world.getBlock(x0 + ux * w, y0 + j, z0 + uz * w) !== B.OBSIDIAN) ok = false;
      }
      if (!ok) continue;
      for (let i = 0; i < w; i++) for (let j = 0; j < h; j++)
        world.setBlock(x0 + ux * i, y0 + j, z0 + uz * i, B.PORTAL, { noUpdate: true });
      this.portals[world.dim].push({ x: x0, y: y0, z: z0 });
      this.audio.play('portal');
      this.markUnsaved();
      return true;
    }
    return false;
  }

  // ============================ furnaces ============================
  tickFurnaces() {
    for (const dim in this.worlds) {
      const world = this.worlds[dim];
      for (const [key, m] of world.meta) {
        if (!m.fitems) continue;
        const [x, y, z] = key.split(',').map(Number);
        if (world.getBlock(x, y, z) !== B.FURNACE) continue;
        let changed = false;
        const input = m.fitems[0], fuel = m.fitems[1], out = m.fitems[2];
        const recipe = input ? SMELT[input.id] : null;
        const outOk = recipe && (!out || (out.id === recipe.id && out.count + recipe.count <= 64));
        if (m.burn > 0) { m.burn -= 0.05; changed = true; }
        if (recipe && outOk) {
          if (m.burn <= 0 && fuel && FUEL[fuel.id]) {
            m.burnMax = m.burn = FUEL[fuel.id];
            if (fuel.id === 308) m.fitems[1] = { id: 306, count: 1 }; // lava bucket → bucket
            else { fuel.count--; if (fuel.count <= 0) m.fitems[1] = null; }
            changed = true;
          }
          if (m.burn > 0) {
            m.prog = (m.prog || 0) + 0.05;
            if (m.prog >= 10) {
              m.prog = 0;
              if (out) out.count += recipe.count;
              else m.fitems[2] = { id: recipe.id, count: recipe.count };
              input.count--;
              if (input.count <= 0) m.fitems[0] = null;
              changed = true;
            }
          }
        } else if (m.prog) { m.prog = 0; changed = true; }
        const lit = m.burn > 0;
        if (!!m.lit !== lit) { m.lit = lit; world.markDirtyAt(x, y, z); }
        if (changed) this.markUnsaved();
      }
    }
    // live-refresh open furnace UI
    if (this.ui.screen === 'furnace' && (this.tickCount & 15) === 0 && !this.ui.cursor) this.ui.rerenderScreen();
  }

  // ============================ persistence ============================
  worldIndex() { return JSON.parse(localStorage.getItem('vc:worlds') || '[]'); }
  saveWorldIndex(list) { localStorage.setItem('vc:worlds', JSON.stringify(list)); }

  save() {
    if (!this.running) return;
    try {
      const data = {
        seed: this.seed, name: this.worldName, time: Math.floor(this.time), day: this.day,
        weather: this.weather, peaceful: this.peaceful,
        spawn: this.worldSpawn, portals: this.portals,
        player: this.player.serialize(),
        dims: {},
        entities: this.entities.serialize(),
      };
      for (const dim in this.worlds) data.dims[dim] = this.worlds[dim].serialize();
      localStorage.setItem('vc:world:' + this.worldId, JSON.stringify(data));
      const idx = this.worldIndex();
      const e = idx.find(w => w.id === this.worldId);
      if (e) e.lastPlayed = Date.now();
      this.saveWorldIndex(idx);
      this.unsaved = false;
    } catch (e) {
      console.error('Save failed', e);
      this.ui.chatMsg('Save failed: ' + e.message, '#f55');
    }
  }

  // ============================ title flow ============================
  bindTitle() {
    const $ = (id) => document.getElementById(id);
    $('btn-play').onclick = () => { this.showWorldList(); };
    $('btn-settings').onclick = () => { $('title').style.display = 'none'; this.ui.openSettings('title'); };
    $('btn-back-title').onclick = () => { $('worlds').style.display = 'none'; $('title').style.display = 'flex'; };
    $('btn-create').onclick = () => {
      const name = $('new-name').value.trim() || 'New World';
      const seedStr = $('new-seed').value.trim();
      const mode = $('new-mode').value;
      const seed = seedStr === '' ? (Math.random() * 0xffffffff) >>> 0 : (/^-?\d+$/.test(seedStr) ? (parseInt(seedStr, 10) >>> 0) : strSeed(seedStr));
      const id = 'w' + Date.now().toString(36);
      const idx = this.worldIndex();
      idx.push({ id, name, seed, mode, created: Date.now(), lastPlayed: Date.now() });
      this.saveWorldIndex(idx);
      this.startWorld(id);
    };
    const nameInput = $('player-name');
    nameInput.value = this.playerName;
    nameInput.onchange = () => {
      this.playerName = nameInput.value.trim() || this.playerName;
      this.saveSettings();
    };
  }

  showTitle() {
    document.getElementById('title').style.display = 'flex';
    document.getElementById('worlds').style.display = 'none';
    document.getElementById('loading').style.display = 'none';
    document.getElementById('hud').style.display = 'none';
  }

  showWorldList() {
    const $ = (id) => document.getElementById(id);
    $('title').style.display = 'none';
    $('worlds').style.display = 'flex';
    const list = $('world-list');
    list.innerHTML = '';
    const idx = this.worldIndex().sort((a, b) => b.lastPlayed - a.lastPlayed);
    if (idx.length === 0) list.innerHTML = '<p class="hint">No worlds yet — create one below!</p>';
    for (const w of idx) {
      const row = document.createElement('div');
      row.className = 'world-row';
      const info = document.createElement('div');
      info.innerHTML = `<b>${w.name}</b><br><small>${w.mode} · seed ${w.seed} · ${new Date(w.lastPlayed).toLocaleDateString()}</small>`;
      const btns = document.createElement('div');
      const play = document.createElement('button');
      play.textContent = 'Play';
      play.className = 'menu-btn small';
      play.onclick = () => this.startWorld(w.id);
      const del = document.createElement('button');
      del.textContent = '✕';
      del.className = 'menu-btn small danger';
      del.onclick = () => {
        if (!confirm(`Delete world "${w.name}" forever?`)) return;
        localStorage.removeItem('vc:world:' + w.id);
        this.saveWorldIndex(this.worldIndex().filter(x => x.id !== w.id));
        this.showWorldList();
      };
      btns.append(play, del);
      row.append(info, btns);
      list.appendChild(row);
    }
  }

  async startWorld(id) {
    const $ = (el) => document.getElementById(el);
    $('worlds').style.display = 'none';
    $('title').style.display = 'none';
    $('loading').style.display = 'flex';
    const meta = this.worldIndex().find(w => w.id === id);
    if (!meta) { this.showTitle(); return; }
    this.worldId = id;
    this.worldName = meta.name;
    this.seed = meta.seed;

    const saved = JSON.parse(localStorage.getItem('vc:world:' + id) || 'null');

    this.worlds = { 0: new World(this, this.seed, 0) };
    this.world = this.worlds[0];
    this.player = new Player(this);
    this.player.gamemode = meta.mode === 'creative' ? 1 : 0;

    if (saved) {
      this.time = saved.time ?? 1000;
      this.day = saved.day ?? 0;
      this.weather = saved.weather ?? 'clear';
      this.peaceful = saved.peaceful ?? false;
      this.portals = saved.portals ?? { 0: [], 1: [] };
      this.worldSpawn = saved.spawn;
      this.worlds[0].deserialize(saved.dims?.[0]);
      if (saved.dims?.[1]) {
        this.worlds[1] = new World(this, this.seed, 1);
        this.worlds[1].deserialize(saved.dims[1]);
      }
      this.player.deserialize(saved.player);
    } else {
      this.time = 1000; this.day = 0; this.weather = 'clear';
      this.portals = { 0: [], 1: [] };
      this.worldSpawn = this.world.gen.findSpawn();
      this.player.pos.set(this.worldSpawn.x, this.worldSpawn.y, this.worldSpawn.z);
    }
    if (!this.worldSpawn) this.worldSpawn = this.world.gen.findSpawn();

    // synchronous pre-generation around the player with progress feedback
    const pcx = Math.floor(this.player.pos.x) >> 4, pcz = Math.floor(this.player.pos.z) >> 4;
    const bar = $('loading-bar');
    const need = [];
    const R = Math.min(3, this.settings.renderDist);
    for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) need.push([pcx + dx, pcz + dz]);
    for (let i = 0; i < need.length; i++) {
      const [cx, cz] = need[i];
      if (!this.world.chunkAt(cx, cz)) this.world.loadChunk(cx, cz);
      bar.style.width = ((i + 1) / need.length * 100) + '%';
      if ((i & 3) === 3) await new Promise(r => setTimeout(r, 0));
    }
    // restore mob/item entities
    if (saved?.entities) {
      if (saved.dims?.[1] && !this.worlds[1]) this.worlds[1] = new World(this, this.seed, 1);
      this.entities.deserialize(saved.entities, this.worlds);
    }
    // drop the player on solid ground if needed
    if (!saved) this.player.pos.y = this.world.getTopY(Math.floor(this.player.pos.x), Math.floor(this.player.pos.z)) + 2;

    $('loading').style.display = 'none';
    $('hud').style.display = 'block';
    this.running = true;
    this.tickCount = 0;
    this.ui.refreshStats();
    this.ui.refreshHotbar();
    this.ui.chatMsg(`Welcome to ${this.worldName}! Press T for chat, /help for commands.`, '#8f8');
    this.mp.join(this.seed + ':' + this.worldName);
    this.ui.lockPointer();
  }

  quitToTitle() {
    this.save();
    this.running = false;
    this.mp.leave();
    this.entities.clearAll();
    for (const dim in this.worlds) {
      for (const [, c] of this.worlds[dim].chunks) this.mesher.disposeChunk(c);
      this.worlds[dim].chunks.clear();
    }
    this.worlds = {};
    this.world = null;
    this.player?.dispose();
    this.player = null;
    document.exitPointerLock?.();
    this.ui.closeScreenSoft();
    this.showTitle();
  }

  // ============================ main loop ============================
  tick() {
    this.tickCount++;
    this.time += 1;
    if (this.time >= DAY_LEN) { this.time -= DAY_LEN; this.day++; }

    this.world.tick(this.player.pos.x, this.player.pos.z);
    this.player.tick();
    this.entities.tick();
    this.redstone.tick();
    this.tickFurnaces();

    // weather progression (host only in MP)
    if (!this.mp.channel || this.mp.isHost()) {
      this.weatherTimer -= 0.05;
      if (this.weatherTimer <= 0) {
        const next = this.weather === 'clear'
          ? (Math.random() < 0.7 ? 'rain' : 'thunder')
          : (Math.random() < 0.8 ? 'clear' : (this.weather === 'rain' ? 'thunder' : 'rain'));
        this.setWeather(next);
        if (next !== 'clear') this.ui.chatMsg(next === 'thunder' ? 'A thunderstorm rolls in…' : 'It starts to rain…', '#9cf');
      }
    }

    // autosave
    this.autosaveT += 0.05;
    if (this.autosaveT > 30 || (this.unsaved && this.autosaveT > 10)) {
      this.autosaveT = 0;
      if (this.unsaved) this.save();
    }
  }

  remeshBudget() {
    // rebuild a few dirty chunks per frame, nearest first
    const dirty = [];
    const pcx = Math.floor(this.player.pos.x) >> 4, pcz = Math.floor(this.player.pos.z) >> 4;
    for (const [, c] of this.world.chunks) {
      if (c.dirty) {
        const d = Math.max(Math.abs(c.cx - pcx), Math.abs(c.cz - pcz));
        if (d <= this.settings.renderDist) dirty.push([d, c]);
      }
    }
    dirty.sort((a, b) => a[0] - b[0]);
    const n = Math.min(dirty.length, 3);
    for (let i = 0; i < n; i++) this.mesher.buildChunk(this.world, dirty[i][1]);
  }

  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.fps = lerp(this.fps, 1 / Math.max(dt, 1e-4), 0.05);
    if (!this.running) { this.renderer.clear(); return; }

    // fixed ticks
    this.tickAcc += dt * 1000;
    let guard = 0;
    while (this.tickAcc >= 50 && guard++ < 5) {
      this.tickAcc -= 50;
      this.tick();
    }

    this.world.update(this.player.pos.x, this.player.pos.z, this.settings.renderDist);
    this.remeshBudget();
    this.player.update(dt);
    this.entities.update(dt);
    this.mp.update(dt);
    this.updateSky(dt);
    this.audio.updateMusic(dt, this.world.dim, this.daylight);
    this.ui.updateDebug();

    // sprint FOV
    const targetFov = this.settings.fov * (this.player.sprinting ? 1.12 : 1);
    if (Math.abs(this.camera.fov - targetFov) > 0.3) {
      this.camera.fov = lerp(this.camera.fov, targetFov, 0.2);
      this.camera.updateProjectionMatrix();
    }

    this.renderer.render(this.scene, this.camera);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  getAtlasCanvas(); // build textures up front
  window.game = new Game();
});
