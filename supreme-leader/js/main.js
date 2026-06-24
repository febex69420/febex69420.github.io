/* ============================================================
   main.js — boot, game loop, camera, HUD, effects, input routing.
   Loads last; wires together input, world, player, npcs,
   dialogue, commands and events.
   ============================================================ */
(function () {
  'use strict';
  const px = window.__px;

  const canvas = document.getElementById('scene');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const world = new World();
  const player = new Player(world);
  player.frozen = true;

  const game = {
    world, player, ctx,
    cam: { x: 0 },
    npcs: Spawner.spawnAll(world),
    stats: { popularity: 70, military: 80, fear: 40, treasury: 120 },
    particles: [], missiles: [], explosions: [],
    t: 0, running: false, menuOpen: false, atWar: false,
    shakeAmt: 0, flashAlpha: 0, flashColor: '#ffffff',
    protesters: [],

    // ---------- stats / hud ----------
    adjust(stat, d) {
      if (stat === 'treasury') { this.stats.treasury = Math.max(0, this.stats.treasury + d); }
      else { this.stats[stat] = Math.max(0, Math.min(100, this.stats[stat] + d)); }
      hud.refresh(this);
    },

    // ---------- feedback ----------
    toast(msg, kind) {
      const el = ui.toast;
      el.textContent = msg;
      el.className = 'show' + (kind ? ' ' + kind : '');
      clearTimeout(this._toastT);
      this._toastT = setTimeout(() => { el.className = ''; }, 3200);
    },
    news(msg) {
      const el = ui.tk;
      el.textContent = '★  ' + msg + '          ';
      el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    },

    // ---------- queries ----------
    nearestNPC(range, typeFilter) {
      let best = null, bd = range;
      for (const n of this.npcs) {
        if (!n.alive || n.state === 'march') continue;
        if (typeFilter && !typeFilter(n.type)) continue;
        const d = Math.abs(n.centerX() - this.player.centerX());
        if (d < bd) { bd = d; best = n; }
      }
      return best;
    },
    findNPC(type) { return this.npcs.find(n => n.alive && n.type === type && n.state !== 'march') || null; },

    // ---------- world-changing helpers ----------
    removeNPC(n, fxType) {
      n.alive = false;
      this._poof(n, fxType === 'arrest' ? '#9aa3b2' : '#caa11c');
      this.scareNear(n.x, 180);
    },
    pardon(n) {
      n.alive = false;
      this._poof(n, '#22C55E');
      this.adjust('popularity', 6); this.adjust('fear', -3);
      this.news(`${n.name} pardoned by the Supreme Leader and released to weep in the streets.`);
      this.toast(`${n.name} has been pardoned.`, 'good');
    },
    _poof(n, color) {
      const cx = n.centerX(), cy = n.y + n.h / 2;
      for (let i = 0; i < 16; i++) {
        const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 3;
        this.particles.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1,
          life: 30 + Math.random() * 20, max: 50, size: 2 + Math.random() * 2,
          color: Math.random() < 0.5 ? color : '#e8edf8', g: 0.12 });
      }
    },
    scareNear(x, radius) {
      for (const n of this.npcs) {
        if (!n.alive || n.type === 'prisoner') continue;
        if (Math.abs(n.centerX() - x) < radius) { n.setMood('fearful'); n.flee = true; n.panic(60 + Math.random() * 60); }
      }
    },
    affectCitizens(fn) { for (const n of this.npcs) if (n.alive && n.type === 'citizen') fn(n); },
    panicAll() { for (const n of this.npcs) if (n.alive) { if (n.type !== 'prisoner') n.panic(160 + Math.random() * 120); if (n.type === 'diplomat') n.setMood('fearful'); } },

    protestNear() {
      const px0 = this.player.centerX();
      let count = 0;
      for (const n of this.npcs) {
        if (n.alive && n.type === 'citizen' && Math.abs(n.centerX() - px0) < 600) { n.protestAt(px0); count++; }
      }
      // if too sparse, convert the nearest few citizens regardless
      if (count < 3) {
        const cits = this.npcs.filter(n => n.alive && n.type === 'citizen')
          .sort((a, b) => Math.abs(a.centerX() - px0) - Math.abs(b.centerX() - px0));
        cits.slice(0, 4).forEach(n => n.protestAt(px0));
      }
      this.adjust('popularity', -4);
    },
    disperseProtest(byForce) {
      for (const n of this.npcs) {
        if (n.state === 'protest') {
          if (byForce) { n.panic(120); n.setMood('fearful'); }
          else { n.state = 'wander'; n.setMood('loyal'); n.timer = 60; }
        }
      }
    },

    declareWar() {
      const dir = Math.random() < 0.5 ? 1 : -1;
      const column = Spawner.spawnSoldiers(this.world, dir, 12, this.cam.x);
      this.npcs.push(...column);
      // generals rally
      for (const n of this.npcs) if (n.alive && n.type === 'general') n.setMood('loyal');
      this.shake(6);
    },

    launchNukes() {
      const base = this.world.siloX;
      for (let i = 0; i < 3; i++) {
        this.missiles.push({ x: base + (i - 1) * 30, y: world.GROUND_Y - 260,
          vy: -3.5 - i * 0.4, age: 0, detonated: false });
      }
      this.shake(8);
      this.flash('#ffd0a0', 0.25);
    },
    _detonate() {
      this.flash('#ffffff', 0.95);
      this.shake(26);
      const W = world.VIEW_W;
      for (let i = 0; i < 5; i++) {
        const ex = this.cam.x + (i + 0.5) * (W / 5) + (Math.random() * 80 - 40);
        this.explosions.push({ x: ex, y: 120 + Math.random() * 120, r: 4, max: 120 + Math.random() * 90, life: 70, maxLife: 70 });
      }
      // raining debris
      for (let i = 0; i < 60; i++) {
        this.particles.push({ x: this.cam.x + Math.random() * W, y: 40 + Math.random() * 160,
          vx: (Math.random() * 2 - 1) * 2, vy: 1 + Math.random() * 3,
          life: 60 + Math.random() * 60, max: 120, size: 2 + Math.random() * 3,
          color: ['#ff8a3a', '#ffd86b', '#7a1010', '#444'][i % 4], g: 0.05 });
      }
      this.news('☢ DETONATION CONFIRMED. The sky is on fire. State TV plays the anthem on a loop. ☢');
    },

    // ---------- effects ----------
    shake(a) { this.shakeAmt = Math.max(this.shakeAmt, reducedMotion ? a * 0.25 : a); },
    flash(c, a) { this.flashColor = c; this.flashAlpha = Math.max(this.flashAlpha, reducedMotion ? a * 0.35 : a); },
    spawnConfetti() {
      const cx = this.player.centerX();
      for (let i = 0; i < 40; i++) {
        this.particles.push({ x: cx + (Math.random() * 400 - 200), y: -10 + Math.random() * 80,
          vx: (Math.random() * 2 - 1) * 1.5, vy: 1 + Math.random() * 2,
          life: 90 + Math.random() * 60, max: 150, size: 3, g: 0.04,
          color: ['#F5C518', '#DC2626', '#2563EB', '#22C55E', '#fff'][i % 5] });
      }
    },

    // ---------- menus ----------
    anyMenuOpen() { return this.menuOpen || Dialogue.isOpen() || RandomEvents.open || !this.running; },
    dialogueOpen() { return Dialogue.isOpen(); },
    openMenu() { this.menuOpen = true; ui.cmd.classList.remove('hidden'); ui.cmd.setAttribute('aria-hidden', 'false'); },
    closeMenu() { this.menuOpen = false; ui.cmd.classList.add('hidden'); ui.cmd.setAttribute('aria-hidden', 'true'); },
    toggleMenu() { this.menuOpen ? this.closeMenu() : this.openMenu(); },

    gameOver(reason) {
      this.running = false;
      overlay.show(reason);
    }
  };
  window.game = game;

  // ===================== UI refs =====================
  const ui = {
    toast: document.getElementById('toast'),
    tk: document.getElementById('tk-text'),
    cmd: document.getElementById('cmd-menu'),
    prompt: document.getElementById('prompt'),
    shell: document.getElementById('game-shell')
  };

  const hud = {
    els: {},
    init() {
      document.querySelectorAll('.stat').forEach(s => { this.els[s.dataset.stat] = s; });
    },
    refresh(g) {
      const set = (k, v) => {
        const s = this.els[k]; if (!s) return;
        const bar = s.querySelector('.bar i'); if (bar) bar.style.width = v + '%';
        const val = s.querySelector('.val'); if (val) val.textContent = Math.round(v);
      };
      set('popularity', g.stats.popularity);
      set('military', g.stats.military);
      set('fear', g.stats.fear);
      this.els.treasury.querySelector('.val').innerHTML = '$' + Math.round(g.stats.treasury) + '<span class="unit">B</span>';
      const z = g.world.zoneAt(g.player.centerX());
      this.els.zone.querySelector('.val').textContent = z.name;
    }
  };

  // ===================== game-over overlay =====================
  const overlay = {
    el: null,
    show(reason) {
      if (!this.el) {
        this.el = document.createElement('div');
        this.el.id = 'intro';
        ui.shell.appendChild(this.el);
      }
      const msg = reason === 'overthrown'
        ? 'Unloved and unfeared, you were dragged from the palace. A new face now hangs on every wall.'
        : 'Your reign has ended.';
      this.el.classList.remove('gone');
      this.el.innerHTML = `
        <div class="intro-inner">
          <div class="intro-emblem" style="border-color:#DC2626;filter:grayscale(1)"></div>
          <h2 class="intro-title" style="color:#DC2626">REGIME&nbsp;FALLEN</h2>
          <p class="intro-sub">${msg}</p>
          <button id="restart-btn" class="btn-primary" type="button">SEIZE POWER AGAIN</button>
        </div>`;
      this.el.querySelector('#restart-btn').addEventListener('click', () => location.reload());
    }
  };

  // ===================== input routing =====================
  function routeInput() {
    const I = window.Input;

    if (RandomEvents.open) {
      for (let i = 1; i <= 4; i++) if (I.once('d' + i)) RandomEvents.choose(i - 1);
      return;
    }
    if (Dialogue.isOpen()) {
      for (let i = 1; i <= 3; i++) if (I.once('d' + i)) Dialogue.choose(i - 1);
      if (I.once('interact') || I.once('escape')) Dialogue.close();
      return;
    }
    if (game.menuOpen) {
      if (I.once('menu') || I.once('escape')) game.closeMenu();
      for (let i = 0; i < Commands.list.length; i++) {
        if (I.once('d' + (i + 1))) Commands.execute(game, Commands.list[i].id);
      }
      return;
    }
    // free roam
    if (I.once('menu')) game.openMenu();
    if (I.once('interact')) {
      const n = game.nearestNPC(52);
      if (n) Dialogue.open(n);
    }
  }

  // ===================== nearest-NPC prompt =====================
  function updatePrompt() {
    let near = null, bd = 52;
    for (const n of game.npcs) {
      if (!n.alive || n.state === 'march') { n.near = false; continue; }
      const d = Math.abs(n.centerX() - game.player.centerX());
      n.near = false;
      if (d < bd) { bd = d; near = n; }
    }
    if (near) near.near = true;

    if (near && !game.anyMenuOpen()) {
      const sx = (near.centerX() - game.cam.x) / world.VIEW_W * 100;
      const sy = (near.y - 36) / world.VIEW_H * 100;
      ui.prompt.style.left = sx + '%';
      ui.prompt.style.top = sy + '%';
      ui.prompt.style.transform = 'translate(-50%,-100%)';
      ui.prompt.classList.remove('hidden');
    } else {
      ui.prompt.classList.add('hidden');
    }
  }

  // ===================== effects update/draw =====================
  function updateEffects(step) {
    // particles
    for (const p of game.particles) {
      p.vy += (p.g || 0) * step;
      p.x += p.vx * step; p.y += p.vy * step; p.life -= step;
    }
    game.particles = game.particles.filter(p => p.life > 0);

    // missiles
    for (const m of game.missiles) {
      m.age += step;
      m.vy -= 0.04 * step;            // accelerate upward
      m.y += m.vy * step;
      // exhaust
      if (Math.random() < 0.8) game.particles.push({ x: m.x + (Math.random() * 6 - 3), y: m.y + 22,
        vx: (Math.random() * 2 - 1), vy: 1.5 + Math.random(), life: 16 + Math.random() * 10, max: 26,
        size: 2 + Math.random() * 2, color: Math.random() < 0.5 ? '#ffd86b' : '#ff7a3a', g: 0 });
      if (m.y < -40 && !m.detonated) { m.detonated = true; game._detonate(); }
    }
    game.missiles = game.missiles.filter(m => m.y > -40);

    // explosions
    for (const e of game.explosions) {
      e.r += (e.max - e.r) * 0.08 * step;
      e.life -= step;
    }
    game.explosions = game.explosions.filter(e => e.life > 0);
  }

  function drawEffects() {
    const cam = game.cam;
    // explosions (sky detonations)
    for (const e of game.explosions) {
      const ex = e.x - cam.x, k = e.life / e.maxLife;
      ctx.globalAlpha = Math.min(1, k * 1.4);
      const layers = [['#ffffff', 0.35], ['#ffe27a', 0.6], ['#ff8a3a', 0.85], ['#b22222', 1]];
      for (const [col, rad] of layers) {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(ex, e.y, e.r * rad, 0, Math.PI * 2); ctx.fill();
      }
      // mushroom stem
      ctx.fillStyle = 'rgba(180,60,20,' + (0.5 * k) + ')';
      ctx.fillRect(ex - e.r * 0.18, e.y, e.r * 0.36, world.GROUND_Y - e.y);
      ctx.globalAlpha = 1;
    }
    // missiles
    for (const m of game.missiles) {
      const mx = m.x - cam.x;
      px(ctx, mx - 3, m.y, 6, 22, '#c9cdd6');
      ctx.fillStyle = '#8a1020'; ctx.fillRect(mx - 3, m.y + 8, 6, 4);
      ctx.fillStyle = '#c9cdd6';
      ctx.beginPath(); ctx.moveTo(mx, m.y - 8); ctx.lineTo(mx - 3, m.y); ctx.lineTo(mx + 3, m.y); ctx.fill();
    }
    // particles
    for (const p of game.particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / (p.max || 50)));
      px(ctx, p.x - cam.x, p.y, p.size, p.size, p.color);
    }
    ctx.globalAlpha = 1;
  }

  // ===================== main loop =====================
  let last = performance.now();
  function frame(now) {
    let dt = now - last; last = now;
    if (dt > 60) dt = 60;             // avoid huge jumps after tab-out
    const step = dt / 16.6667;
    game.t += dt / 1000;

    // ---- update ----
    player.frozen = game.anyMenuOpen();
    routeInput();

    if (game.running) {
      player.update(step, window.Input);
      RandomEvents.update(step);
    }
    for (const n of game.npcs) n.update(step, game);
    game.npcs = game.npcs.filter(n => n.alive);

    updateEffects(step);

    // camera follow
    const target = game.player.centerX() - world.VIEW_W / 2;
    game.cam.x += (Math.max(0, Math.min(world.WORLD_W - world.VIEW_W, target)) - game.cam.x) * Math.min(1, 0.12 * step);
    game.cam.x = Math.max(0, Math.min(world.WORLD_W - world.VIEW_W, game.cam.x));

    updatePrompt();
    hud.refresh(game);

    // shake / flash decay
    if (game.shakeAmt > 0.2) game.shakeAmt *= Math.pow(0.9, step); else game.shakeAmt = 0;
    if (game.flashAlpha > 0.01) game.flashAlpha *= Math.pow(0.9, step); else game.flashAlpha = 0;

    // ---- render ----
    ctx.clearRect(0, 0, world.VIEW_W, world.VIEW_H);
    ctx.save();
    if (game.shakeAmt > 0) {
      const ox = (Math.random() * 2 - 1) * game.shakeAmt;
      const oy = (Math.random() * 2 - 1) * game.shakeAmt;
      ctx.translate(ox, oy);
    }

    world.draw(ctx, game.cam, game.t);

    // entities, back-to-front by x
    const drawList = game.npcs.slice().sort((a, b) => a.y - b.y);
    for (const n of drawList) n.draw(ctx, game.cam);
    player.draw(ctx, game.cam);

    drawEffects();

    // subtle vignette for mood
    const vg = ctx.createRadialGradient(world.VIEW_W / 2, world.VIEW_H / 2, world.VIEW_H * 0.4,
      world.VIEW_W / 2, world.VIEW_H / 2, world.VIEW_H * 0.85);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, world.VIEW_W, world.VIEW_H);

    ctx.restore();

    // full-screen flash (over shake)
    if (game.flashAlpha > 0.01) {
      ctx.globalAlpha = game.flashAlpha;
      ctx.fillStyle = game.flashColor;
      ctx.fillRect(0, 0, world.VIEW_W, world.VIEW_H);
      ctx.globalAlpha = 1;
    }

    window.Input.endFrame();
    requestAnimationFrame(frame);
  }

  // ===================== boot =====================
  function boot() {
    window.Input.init();
    hud.init();
    hud.refresh(game);
    Dialogue.init(game);
    RandomEvents.init(game);
    Commands.buildMenu(game);
    game.news('Welcome home, Supreme Leader. The nation holds its breath. Walk → to begin your reign.');

    document.getElementById('start-btn').addEventListener('click', () => {
      const intro = document.getElementById('intro');
      intro.classList.add('gone');
      setTimeout(() => intro.remove(), 450);
      game.running = true;
      player.frozen = false;
      ui.shell.focus();
    });

    requestAnimationFrame(frame);
  }

  boot();
})();
