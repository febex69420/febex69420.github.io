/* ============================================================
   npcs.js — characters that walk, react, and talk.
   Types: general · minister · citizen · prisoner · diplomat · scientist
   ============================================================ */
(function () {
  'use strict';
  const px = window.__px;
  const GROUND_Y = window.World.GROUND_Y;

  const ROLE = {
    general: 'Army General', minister: 'State Minister', citizen: 'Ordinary Citizen',
    prisoner: 'Prisoner', diplomat: 'Foreign Diplomat', scientist: 'State Scientist',
    soldier: 'State Soldier'
  };

  const NAMES = {
    general: ['Gen. Volkov', 'Marshal Drax', 'Cmdr. Ironside', 'Gen. Petrov', 'Marshal Kane', 'Gen. Stahl'],
    minister: ['Min. Crane', 'Sec. Halloran', 'Min. Voss', 'Min. Albescu', 'Sec. Dahl', 'Min. Fenn'],
    citizen: ['Old Marta', 'Pavel', 'Lena', 'Citizen 4471', 'Tomas', 'Babushka Ana', 'Dmitri', 'Sasha', 'Ivo', 'Citizen 9902', 'Mira', 'Grobik'],
    prisoner: ['Inmate 88', 'Prisoner Yuri', 'No. 12', 'The Poet', 'Inmate 305', 'Old Klaus'],
    diplomat: ['Amb. Reyes', 'Envoy Lin', 'Consul Adler', 'Amb. Okafor'],
    scientist: ['Dr. Mholt', 'Dr. Sable', 'Prof. Reinhardt', 'Dr. Yara', 'Dr. Khan']
  };

  const PALETTE = {
    general:   { coat: '#3a4422', dark: '#2a331a', skin: '#caa6a0', h: 58 },
    minister:  { coat: '#1d2435', dark: '#141a28', skin: '#d2b1a6', h: 54 },
    citizen:   { coat: '#3a3f4c', dark: '#262a33', skin: '#caa6a0', h: 50 },
    prisoner:  { coat: '#b5651d', dark: '#7a4413', skin: '#c2a39a', h: 50 },
    diplomat:  { coat: '#16233f', dark: '#0e1830', skin: '#b98e6e', h: 56 },
    scientist: { coat: '#d8dde6', dark: '#aab0bc', skin: '#caa6a0', h: 54 },
    soldier:   { coat: '#46522a', dark: '#323c1c', skin: '#caa6a0', h: 54 }
  };

  const CITIZEN_COLORS = ['#5a4a6a', '#4a5a3a', '#6a4a3a', '#3a4a5a', '#5a3a3a', '#444a55'];

  function rint(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function choose(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  class NPC {
    constructor(type, x, zone) {
      this.type = type;
      this.roleLabel = ROLE[type];
      this.name = choose(NAMES[type] || NAMES.citizen);
      const cfg = PALETTE[type];
      this.w = 22; this.h = cfg.h;
      this.x = x; this.y = GROUND_Y - this.h;
      this.vy = 0; this.onGround = true;
      this.zone = zone;                 // {x0,x1} wander bounds
      this.dir = Math.random() < 0.5 ? -1 : 1;
      this.speed = 0.5 + Math.random() * 0.8;
      this.baseSpeed = this.speed;
      this.animPhase = Math.random() * 6;
      this.seed = Math.floor(Math.random() * 100000);
      this.lineSeed = 0;
      this.alive = true;
      this.state = 'wander';
      this.timer = rint(40, 160);
      this.flee = false;
      this.near = false;
      this.tint = (type === 'citizen') ? choose(CITIZEN_COLORS) : null;
      this.hostile = (type === 'diplomat') ? Math.random() < 0.5 : false;
      this.targetX = null;
      this.stateTimer = 0;

      // initial mood
      this.mood = this._rollMood();
    }

    _rollMood() {
      switch (this.type) {
        case 'general':  return Math.random() < 0.35 ? 'plotting' : (Math.random() < 0.6 ? 'loyal' : 'neutral');
        case 'minister': return Math.random() < 0.4 ? 'plotting' : (Math.random() < 0.6 ? 'loyal' : 'neutral');
        case 'citizen':  { const r = Math.random(); return r < 0.3 ? 'loyal' : r < 0.55 ? 'neutral' : r < 0.8 ? 'angry' : 'fearful'; }
        case 'prisoner': return 'mercy';
        case 'diplomat': return this.hostile ? 'plotting' : 'neutral';
        case 'scientist':return Math.random() < 0.5 ? 'neutral' : (Math.random() < 0.5 ? 'loyal' : 'fearful');
        default:         return 'neutral';
      }
    }

    setMood(m) { this.mood = m; }
    centerX() { return this.x + this.w / 2; }

    // ---- reactions driven by the game ----
    panic(dur) { if (this.type === 'prisoner' || !this.alive) return; this.state = 'panic'; this.stateTimer = dur; this.speed = this.baseSpeed * 2.6; }
    protestAt(x) { if (this.type !== 'citizen') return; this.state = 'protest'; this.targetX = x; this.setMood('angry'); }
    cheer(dur) { if (this.type !== 'citizen') return; this.state = 'cheer'; this.stateTimer = dur; this.setMood('cheering'); }
    march(dir) { this.state = 'march'; this.dir = dir; this.speed = 1.8 + Math.random() * 0.4; }

    update(step, game) {
      const p = game.player;

      if (this.state === 'march') {
        this.x += this.dir * this.speed * step;
        this.animPhase += step * 0.4;
        if (this.x < -80 || this.x > game.world.WORLD_W + 80) this.alive = false;
        return;
      }

      if (this.state === 'panic') {
        this.stateTimer -= step;
        // run away from player
        const away = (this.centerX() < p.centerX()) ? -1 : 1;
        this.dir = away;
        this.x += this.dir * this.speed * step;
        this.animPhase += step * 0.5;
        if (this.stateTimer <= 0) { this.state = 'wander'; this.speed = this.baseSpeed; this.timer = rint(30, 90); }
        this._clampZone();
        return;
      }

      if (this.state === 'cheer') {
        this.stateTimer -= step;
        if (this.onGround && Math.random() < 0.04) { this.vy = -6; this.onGround = false; }
        this.vy += 0.6 * step; this.y += this.vy * step;
        const floor = GROUND_Y - this.h;
        if (this.y >= floor) { this.y = floor; this.vy = 0; this.onGround = true; }
        this.animPhase += step * 0.1;
        if (this.stateTimer <= 0) { this.state = 'wander'; this.timer = rint(40, 120); }
        return;
      }

      if (this.state === 'protest') {
        const dx = this.targetX - this.centerX();
        if (Math.abs(dx) > 30) {
          this.dir = dx > 0 ? 1 : -1;
          this.x += this.dir * this.speed * 1.3 * step;
          this.animPhase += step * 0.4;
        } else {
          // mill about the protest, fist-pumping
          this.animPhase += step * 0.05;
          if (Math.random() < 0.02) this.dir *= -1;
        }
        return;
      }

      // ---- default wander ----
      // flee if frightened and the leader is close
      const dist = Math.abs(this.centerX() - p.centerX());
      if ((this.flee || this.mood === 'fearful') && dist < 130) {
        this.dir = (this.centerX() < p.centerX()) ? -1 : 1;
        this.x += this.dir * this.baseSpeed * 1.8 * step;
        this.animPhase += step * 0.45;
        this._clampZone();
        return;
      }

      this.timer -= step;
      if (this.timer <= 0) {
        const r = Math.random();
        if (r < 0.4) { this.moving = false; this.timer = rint(30, 90); }
        else { this.moving = true; this.dir = Math.random() < 0.5 ? -1 : 1; this.timer = rint(50, 160); }
      }
      if (this.moving) {
        this.x += this.dir * this.speed * step;
        this.animPhase += step * 0.22;
        this._clampZone();
      } else {
        this.animPhase += step * 0.04;
      }
    }

    _clampZone() {
      const pad = 30;
      if (this.x < this.zone.x0 + pad) { this.x = this.zone.x0 + pad; this.dir = 1; }
      if (this.x > this.zone.x1 - pad - this.w) { this.x = this.zone.x1 - pad - this.w; this.dir = -1; }
    }

    // ---------------- sprite ----------------
    draw(ctx, cam) {
      const sx = Math.round(this.x - cam.x);
      if (sx < -60 || sx > window.World.VIEW_W + 60) return;
      const sy = Math.round(this.y);
      ctx.save();
      ctx.translate(sx + this.w / 2, sy);
      ctx.scale(this.dir, 1);
      ctx.translate(-this.w / 2, 0);
      this._body(ctx);
      ctx.restore();

      // overlays drawn un-mirrored (mood glyph, sign, name)
      this._overlays(ctx, sx, sy);
    }

    _body(ctx) {
      const cfg = PALETTE[this.type];
      const coat = this.tint || cfg.coat;
      const h = this.h;
      const moving = (this.state !== 'wander') || this.moving;
      const swing = moving ? Math.sin(this.animPhase) * 4 : 0;
      const swing2 = -swing;
      const W = this.w;

      // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(W / 2, h + 1, 12, 3, 0, 0, Math.PI * 2); ctx.fill();

      // legs
      px(ctx, 5 + swing, h - 18, 6, 14, cfg.dark);
      px(ctx, 5 + swing, h - 5, 7, 5, '#0a0c10');
      px(ctx, 11 + swing2, h - 18, 6, 14, cfg.dark);
      px(ctx, 11 + swing2, h - 5, 7, 5, '#0a0c10');

      // torso
      px(ctx, 3, h - 36, 16, 20, coat);
      px(ctx, 3, h - 36, 4, 20, this._lighten(coat));
      px(ctx, 10, h - 36, 2, 20, cfg.dark);

      // arm
      px(ctx, 2 + swing2, h - 34, 5, 15, cfg.dark);
      px(ctx, 2 + swing2, h - 21, 5, 4, cfg.skin);

      // head
      px(ctx, 7, h - 50, 11, 12, cfg.skin);
      px(ctx, 7, h - 50, 11, 2, this._shade(cfg.skin));
      px(ctx, 10, h - 45, 2, 2, '#1a1a1a'); px(ctx, 14, h - 45, 2, 2, '#1a1a1a'); // eyes

      this._typeBits(ctx, h, cfg, coat);
    }

    _typeBits(ctx, h, cfg, coat) {
      switch (this.type) {
        case 'general':
          px(ctx, 6, h - 55, 13, 5, cfg.dark);   // cap crown
          px(ctx, 5, h - 51, 15, 3, '#11160c');  // band
          px(ctx, 4, h - 49, 17, 2, '#0a0c06');  // brim
          px(ctx, 10, h - 54, 5, 2, '#F5C518');  // braid
          px(ctx, 12, h - 33, 3, 3, '#F5C518'); px(ctx, 12, h - 29, 3, 3, '#cf3030'); // medals
          px(ctx, 1, h - 37, 6, 3, '#caa11c'); px(ctx, 16, h - 37, 6, 3, '#caa11c'); // epaulettes
          break;
        case 'minister':
          px(ctx, 7, h - 52, 11, 4, '#5a5048'); // thin hair
          px(ctx, 9, h - 45, 8, 2, '#cfd6e2');  // glasses glint
          px(ctx, 16, h - 18, 7, 9, '#3a2a18'); // briefcase
          px(ctx, 12, h - 34, 2, 12, '#a01524');// tie
          break;
        case 'citizen':
          px(ctx, 6, h - 53, 13, 4, this._shade(coat)); // flat cap
          px(ctx, 4, h - 50, 17, 2, this._shade(coat)); // brim
          break;
        case 'prisoner':
          for (let s = h - 36; s < h - 16; s += 6) px(ctx, 3, s, 16, 3, cfg.dark); // stripes
          px(ctx, 7, h - 52, 11, 3, '#7a6a60'); // shaved head shade
          px(ctx, 1, h - 21, 5, 3, '#888'); px(ctx, 16, h - 21, 5, 3, '#888'); // shackles
          break;
        case 'diplomat':
          px(ctx, 6, h - 57, 13, 7, '#0c1322'); // top hat
          px(ctx, 4, h - 50, 17, 2, '#0c1322');
          // foreign sash
          ctx.save();
          ctx.fillStyle = ['#1f6f3a', '#1f4f9f', '#9f1f3a'][this.seed % 3];
          ctx.beginPath(); ctx.moveTo(4, h - 36); ctx.lineTo(16, h - 36);
          ctx.lineTo(16, h - 31); ctx.lineTo(4, h - 22); ctx.closePath(); ctx.fill();
          ctx.restore();
          px(ctx, 16, h - 18, 7, 9, '#2a2030'); // case
          break;
        case 'scientist':
          px(ctx, 7, h - 53, 11, 4, '#6a6a6a'); // hair
          px(ctx, 8, h - 47, 11, 3, '#9fd0ff'); // goggles
          px(ctx, 3, h - 30, 16, 14, '#e6ebf2'); // lab coat over torso
          px(ctx, 10, h - 30, 2, 14, '#aab0bc');
          break;
        case 'soldier':
          px(ctx, 6, h - 53, 13, 4, '#323c1c'); // helmet
          px(ctx, 5, h - 50, 15, 2, '#262e14');
          px(ctx, 16, h - 36, 3, 22, '#2a2a1a'); // slung rifle
          break;
      }
    }

    _overlays(ctx, sx, sy) {
      // protest sign
      if (this.state === 'protest') {
        const px2 = sx + (this.dir > 0 ? this.w - 4 : 0);
        px(ctx, sx + 8, sy - 18, 3, 26, '#5a4030');
        px(ctx, sx - 6, sy - 34, 30, 18, '#d8d2c0');
        px(ctx, sx - 6, sy - 34, 30, 3, '#a01524');
        for (let i = 0; i < 3; i++) px(ctx, sx - 2 + i * 9, sy - 27, 6, 2, '#1a1a1a');
        px(ctx, sx - 2, sy - 22, 22, 2, '#1a1a1a');
      }
      // mood glyph
      const gy = sy - 14;
      const gx = sx + this.w / 2 - 4;
      const m = this.mood;
      if (m === 'plotting') { px(ctx, gx, gy, 8, 8, '#0c0d10'); px(ctx, gx + 2, gy + 2, 4, 2, '#cf3030'); px(ctx, gx + 3, gy + 4, 2, 3, '#cf3030'); }
      else if (m === 'fearful') { px(ctx, gx + 2, gy - 1, 4, 6, '#f5d020'); px(ctx, gx + 2, gy + 6, 4, 2, '#f5d020'); }
      else if (m === 'loyal') { px(ctx, gx + 1, gy + 1, 2, 3, '#F5C518'); px(ctx, gx + 5, gy + 1, 2, 3, '#F5C518'); px(ctx, gx + 2, gy + 3, 4, 3, '#F5C518'); px(ctx, gx + 3, gy + 5, 2, 2, '#F5C518'); }
      else if (m === 'angry') { px(ctx, gx + 1, gy, 6, 2, '#cf3030'); px(ctx, gx, gy + 3, 8, 2, '#cf3030'); px(ctx, gx + 1, gy + 6, 6, 2, '#cf3030'); }
      else if (m === 'cheering') { px(ctx, gx + 3, gy - 1, 2, 8, '#F5C518'); px(ctx, gx + 1, gy + 1, 2, 2, '#F5C518'); px(ctx, gx + 5, gy + 1, 2, 2, '#F5C518'); }

      // name label when leader is near
      if (this.near) {
        ctx.font = '7px "Press Start 2P", monospace';
        ctx.textBaseline = 'bottom';
        ctx.textAlign = 'center';
        const tx = sx + this.w / 2;
        const ty = sy - 18;
        ctx.fillStyle = 'rgba(6,8,14,0.85)';
        const wpix = ctx.measureText(this.name).width;
        ctx.fillRect(tx - wpix / 2 - 4, ty - 11, wpix + 8, 12);
        ctx.fillStyle = '#F5C518';
        ctx.fillText(this.name, tx, ty);
        ctx.textAlign = 'left';
      }
    }

    _lighten(hex) { return this._mix(hex, '#ffffff', 0.18); }
    _shade(hex) { return this._mix(hex, '#000000', 0.3); }
    _mix(a, b, t) {
      const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
      const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
      const r = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
      return `rgb(${r[0]},${r[1]},${r[2]})`;
    }

    // ---------------- portrait for dialogue ----------------
    static drawFace(ctx, npc) {
      const cfg = PALETTE[npc.type];
      const coat = npc.tint || cfg.coat;
      ctx.fillStyle = '#0a0e18'; ctx.fillRect(0, 0, 64, 64);
      // collar/shoulders
      px(ctx, 6, 48, 52, 16, coat);
      px(ctx, 6, 48, 52, 3, npc._lighten ? npc._lighten(coat) : coat);
      // neck + face
      px(ctx, 24, 40, 16, 10, cfg.skin);
      px(ctx, 18, 14, 28, 30, cfg.skin);
      px(ctx, 18, 14, 28, 4, '#00000022');
      // eyes
      px(ctx, 24, 26, 5, 4, '#15171c'); px(ctx, 36, 26, 5, 4, '#15171c');
      px(ctx, 25, 27, 2, 2, '#cdd6ea'); px(ctx, 37, 27, 2, 2, '#cdd6ea');
      // mouth by mood
      if (npc.mood === 'fearful') px(ctx, 28, 36, 8, 4, '#3a1414');
      else if (npc.mood === 'cheering' || npc.mood === 'loyal') { px(ctx, 26, 35, 12, 2, '#3a1414'); px(ctx, 28, 37, 8, 2, '#3a1414'); }
      else px(ctx, 27, 36, 10, 2, '#3a2018');

      switch (npc.type) {
        case 'general':
          px(ctx, 14, 6, 36, 10, cfg.dark); px(ctx, 12, 14, 40, 4, '#0a0c06'); px(ctx, 28, 8, 8, 4, '#F5C518'); break;
        case 'minister':
          px(ctx, 18, 8, 28, 7, '#5a5048'); px(ctx, 22, 24, 20, 3, '#cfd6e2'); break;
        case 'citizen':
          px(ctx, 16, 8, 32, 7, npc._shade ? npc._shade(coat) : '#222'); break;
        case 'prisoner':
          px(ctx, 18, 9, 28, 6, '#7a6a60'); px(ctx, 14, 50, 36, 3, '#7a4413'); px(ctx, 14, 56, 36, 3, '#7a4413'); break;
        case 'diplomat':
          px(ctx, 14, 0, 36, 12, '#0c1322'); px(ctx, 10, 12, 44, 3, '#0c1322'); break;
        case 'scientist':
          px(ctx, 18, 8, 28, 7, '#6a6a6a'); px(ctx, 20, 24, 24, 4, '#9fd0ff'); px(ctx, 6, 50, 52, 14, '#e6ebf2'); break;
      }
    }
  }

  // ---------------- factory ----------------
  const Spawner = {
    spawnAll(world) {
      const npcs = [];
      const Z = (id) => world.zones.find(z => z.id === id);
      const add = (type, count, zone) => {
        for (let i = 0; i < count; i++) {
          const x = zone.x0 + 80 + Math.random() * (zone.x1 - zone.x0 - 160);
          npcs.push(new NPC(type, x, zone));
        }
      };
      add('general', 2, Z('palace'));
      add('minister', 3, Z('palace'));
      add('diplomat', 1, Z('palace'));
      add('citizen', 2, Z('palace'));

      add('citizen', 10, Z('city'));
      add('minister', 1, Z('city'));
      add('diplomat', 1, Z('city'));

      add('general', 3, Z('military'));
      add('soldier', 2, Z('military'));

      add('prisoner', 5, Z('prison'));
      add('general', 1, Z('prison')); // the warden

      add('scientist', 4, Z('bunker'));
      add('general', 1, Z('bunker'));
      return npcs;
    },
    // a marching column for "declare war"
    spawnSoldiers(world, dir, count, camX) {
      const arr = [];
      const startX = dir > 0 ? camX - 60 : camX + world.VIEW_W + 60;
      for (let i = 0; i < count; i++) {
        const n = new NPC('soldier', startX - dir * i * 40, world.zones[0]);
        n.march(dir);
        arr.push(n);
      }
      return arr;
    }
  };

  window.NPC = NPC;
  window.Spawner = Spawner;
})();
