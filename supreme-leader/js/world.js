/* ============================================================
   world.js — the scrolling world: zones, parallax, scenery.
   Five horizontal sectors: Palace · City · Military · Prison · Bunker.
   ============================================================ */
(function () {
  'use strict';

  const VIEW_W = 1280, VIEW_H = 640, GROUND_Y = 520;

  // crisp pixel rect
  function px(ctx, x, y, w, h, c) {
    ctx.fillStyle = c;
    ctx.fillRect(x | 0, y | 0, Math.ceil(w), Math.ceil(h));
  }
  // deterministic pseudo-random in [0,1) from an integer
  function hash(n) { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); }

  class World {
    constructor() {
      this.GROUND_Y = GROUND_Y;
      this.VIEW_W = VIEW_W;
      this.VIEW_H = VIEW_H;
      this.zones = [
        { id: 'palace',   name: 'Grand Palace',   x0: 0,     x1: 2400,  accent: '#F5C518', ground: '#2a1d14' },
        { id: 'city',     name: 'City Streets',   x0: 2400,  x1: 5200,  accent: '#2563EB', ground: '#1b1f29' },
        { id: 'military', name: 'Military Base',  x0: 5200,  x1: 7600,  accent: '#8aa04a', ground: '#26280f' },
        { id: 'prison',   name: 'Prison Complex', x0: 7600,  x1: 9800,  accent: '#9aa3b2', ground: '#1d2024' },
        { id: 'bunker',   name: 'Nuclear Bunker', x0: 9800,  x1: 12600, accent: '#22C55E', ground: '#141414', underground: true }
      ];
      this.WORLD_W = this.zones[this.zones.length - 1].x1;
      this.siloX = 11400; // where launched missiles rise from
    }

    zoneAt(x) {
      for (const z of this.zones) if (x >= z.x0 && x < z.x1) return z;
      return x < 0 ? this.zones[0] : this.zones[this.zones.length - 1];
    }

    draw(ctx, cam, t) {
      const camL = cam.x, camR = cam.x + VIEW_W;
      for (const z of this.zones) {
        if (z.x1 < camL - 80 || z.x0 > camR + 80) continue;
        ctx.save();
        const sx0 = Math.max(0, z.x0 - cam.x);
        const sx1 = Math.min(VIEW_W, z.x1 - cam.x);
        ctx.beginPath();
        ctx.rect(sx0, 0, sx1 - sx0, VIEW_H);
        ctx.clip();
        switch (z.id) {
          case 'palace':   this._palace(ctx, cam, z, t); break;
          case 'city':     this._city(ctx, cam, z, t); break;
          case 'military': this._military(ctx, cam, z, t); break;
          case 'prison':   this._prison(ctx, cam, z, t); break;
          case 'bunker':   this._bunker(ctx, cam, z, t); break;
        }
        this._zoneSign(ctx, cam, z);
        ctx.restore();
      }
    }

    _sky(ctx, top, bottom) {
      const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
      g.addColorStop(0, top); g.addColorStop(1, bottom);
      px(ctx, 0, 0, VIEW_W, GROUND_Y, '#000');
      ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, GROUND_Y);
    }

    _stars(ctx, cam, count, x0, x1) {
      ctx.fillStyle = '#cdd6ea';
      for (let i = 0; i < count; i++) {
        const wx = x0 + hash(i * 3.3) * (x1 - x0);
        const sx = wx - cam.x * 0.25;
        if (sx < -4 || sx > VIEW_W + 4) continue;
        const sy = 24 + hash(i * 7.7) * 300;
        const tw = hash(i) > 0.6 ? 2 : 1;
        ctx.globalAlpha = 0.4 + hash(i * 2.1) * 0.6;
        ctx.fillRect(sx | 0, sy | 0, tw, tw);
      }
      ctx.globalAlpha = 1;
    }

    _ground(ctx, color, edge) {
      px(ctx, 0, GROUND_Y, VIEW_W, VIEW_H - GROUND_Y, color);
      px(ctx, 0, GROUND_Y, VIEW_W, 3, edge);      // surface highlight
      px(ctx, 0, GROUND_Y + 3, VIEW_W, 2, '#000'); // shadow line
    }

    /* ---------- GRAND PALACE ---------- */
    _palace(ctx, cam, z, t) {
      this._sky(ctx, '#3a0f24', '#160714');
      // great hall facade (parallax 0.5)
      const pf = 0.5, wallTop = 150;
      const wx0 = z.x0 - cam.x * pf, ww = (z.x1 - z.x0);
      px(ctx, wx0, wallTop, ww * (1 / pf), GROUND_Y - wallTop, '#2a1226');
      // golden dome over the throne (center of zone)
      const domeX = (z.x0 + 1100) - cam.x * pf, domeY = 70;
      ctx.fillStyle = '#7a5a10';
      ctx.beginPath(); ctx.arc(domeX, domeY + 80, 90, Math.PI, 0); ctx.fill();
      px(ctx, domeX - 6, domeY - 26, 12, 32, '#caa11c');
      px(ctx, domeX - 3, domeY - 40, 6, 16, '#F5C518');
      // pillars + arched windows
      for (let i = 0; i <= 11; i++) {
        const colX = (z.x0 + 60 + i * 200) - cam.x * pf;
        if (colX < -60 || colX > VIEW_W + 60) continue;
        px(ctx, colX, wallTop + 30, 34, GROUND_Y - wallTop - 30, '#3a1d34');
        px(ctx, colX + 4, wallTop + 30, 6, GROUND_Y - wallTop - 30, '#4d2945'); // sheen
        px(ctx, colX - 6, wallTop + 18, 46, 14, '#caa11c'); // capital
        px(ctx, colX - 8, GROUND_Y - 18, 50, 16, '#1c0d18'); // base
        // window between columns
        const winX = colX + 100;
        px(ctx, winX, wallTop + 60, 64, 150, '#120510');
        ctx.fillStyle = '#5a1430';
        ctx.beginPath(); ctx.arc(winX + 32, wallTop + 60, 32, Math.PI, 0); ctx.fill();
        px(ctx, winX + 30, wallTop + 60, 4, 150, '#2a0a1c');
      }
      // hanging banners with regime emblem
      for (let i = 0; i < 6; i++) {
        const bx = (z.x0 + 200 + i * 380) - cam.x * 0.8;
        if (bx < -40 || bx > VIEW_W + 40) continue;
        px(ctx, bx, wallTop + 20, 44, 150, '#8a1020');
        px(ctx, bx, wallTop + 20, 44, 4, '#b8162c');
        px(ctx, bx + 16, wallTop + 70, 12, 12, '#F5C518'); // emblem dot
        px(ctx, bx + 10, wallTop + 64, 24, 3, '#F5C518');
        // tattered bottom
        px(ctx, bx, wallTop + 168, 12, 10, '#8a1020');
        px(ctx, bx + 24, wallTop + 168, 12, 14, '#8a1020');
      }
      // chandeliers (glow)
      for (let i = 0; i < 5; i++) {
        const cx = (z.x0 + 300 + i * 460) - cam.x;
        if (cx < -30 || cx > VIEW_W + 30) continue;
        const glow = 0.5 + Math.sin(t * 2 + i) * 0.12;
        ctx.fillStyle = `rgba(245,197,24,${0.16 * glow})`;
        ctx.beginPath(); ctx.arc(cx, 150, 60, 0, Math.PI * 2); ctx.fill();
        px(ctx, cx - 1, 60, 2, 60, '#3a2c08');
        px(ctx, cx - 14, 120, 28, 8, '#caa11c');
        for (let k = -1; k <= 1; k++) px(ctx, cx + k * 10 - 1, 128, 3, 6, '#F5C518');
      }
      this._ground(ctx, z.ground, '#5a3a1a');
      // red throne carpet down the centre
      const carpetX = (z.x0 + 900) - cam.x;
      px(ctx, carpetX, GROUND_Y, 700, VIEW_H - GROUND_Y, '#6a0f1c');
      px(ctx, carpetX, GROUND_Y, 700, 4, '#9a1828');
      px(ctx, carpetX + 6, GROUND_Y, 4, VIEW_H - GROUND_Y, '#caa11c');
      px(ctx, carpetX + 690, GROUND_Y, 4, VIEW_H - GROUND_Y, '#caa11c');
    }

    /* ---------- CITY STREETS ---------- */
    _city(ctx, cam, z, t) {
      this._sky(ctx, '#0a1733', '#05080f');
      this._stars(ctx, cam, 90, z.x0, z.x1);
      // moon
      const mx = (z.x0 + 700) - cam.x * 0.2;
      if (mx > -60 && mx < VIEW_W + 60) {
        ctx.fillStyle = '#cdd6ea'; ctx.beginPath(); ctx.arc(mx, 90, 28, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#0a1733'; ctx.beginPath(); ctx.arc(mx + 10, 84, 24, 0, Math.PI * 2); ctx.fill();
      }
      // far skyline (parallax 0.35)
      for (let i = 0; i < 60; i++) {
        const wx = z.x0 + i * 90; const sx = wx - cam.x * 0.35;
        if (sx < -90 || sx > VIEW_W) continue;
        const h = 120 + hash(i * 1.7) * 200, w = 60 + hash(i) * 30;
        px(ctx, sx, GROUND_Y - h, w, h, '#0c1426');
        for (let wy = GROUND_Y - h + 12; wy < GROUND_Y - 16; wy += 18)
          for (let wxw = sx + 8; wxw < sx + w - 8; wxw += 14)
            if (hash(wxw * wy) > 0.55) px(ctx, wxw, wy, 6, 8, '#f2c14e44');
      }
      // near skyline (parallax 0.7)
      for (let i = 0; i < 40; i++) {
        const wx = z.x0 + 40 + i * 140; const sx = wx - cam.x * 0.7;
        if (sx < -120 || sx > VIEW_W) continue;
        const h = 180 + hash(i * 5.1) * 180, w = 100 + hash(i * 2.2) * 30;
        px(ctx, sx, GROUND_Y - h, w, h, '#11192e');
        px(ctx, sx, GROUND_Y - h, w, 4, '#1b2742');
        for (let wy = GROUND_Y - h + 14; wy < GROUND_Y - 14; wy += 22)
          for (let wxw = sx + 12; wxw < sx + w - 12; wxw += 20) {
            const lit = hash(wxw * 0.3 + wy + Math.floor(t * 0.3)) > 0.62;
            px(ctx, wxw, wy, 9, 11, lit ? '#ffd86b88' : '#0a1120');
          }
      }
      this._ground(ctx, z.ground, '#33405a');
      px(ctx, 0, GROUND_Y + 18, VIEW_W, 4, '#0c1018'); // road line
      // dashed centre line
      for (let i = 0; i < 60; i++) {
        const sx = (z.x0 + i * 60) - cam.x;
        if (sx > -20 && sx < VIEW_W) px(ctx, sx, GROUND_Y + 40, 26, 4, '#5a6478');
      }
      // streetlamps + glow pools
      for (let i = 0; i < 20; i++) {
        const sx = (z.x0 + 120 + i * 300) - cam.x;
        if (sx < -20 || sx > VIEW_W + 20) continue;
        px(ctx, sx, GROUND_Y - 150, 6, 150, '#222a3a');
        px(ctx, sx - 18, GROUND_Y - 150, 42, 8, '#222a3a');
        px(ctx, sx - 22, GROUND_Y - 146, 10, 10, '#fff0b0');
        ctx.fillStyle = 'rgba(255,224,130,0.10)';
        ctx.beginPath(); ctx.moveTo(sx - 17, GROUND_Y - 138);
        ctx.lineTo(sx - 70, GROUND_Y); ctx.lineTo(sx + 36, GROUND_Y); ctx.closePath(); ctx.fill();
      }
      // propaganda billboards
      for (let i = 0; i < 4; i++) {
        const sx = (z.x0 + 360 + i * 700) - cam.x;
        if (sx < -120 || sx > VIEW_W + 20) continue;
        px(ctx, sx, GROUND_Y - 240, 6, 90, '#1a2030');
        px(ctx, sx + 100, GROUND_Y - 240, 6, 90, '#1a2030');
        px(ctx, sx - 16, GROUND_Y - 330, 138, 96, '#0c1424');
        px(ctx, sx - 12, GROUND_Y - 326, 130, 88, (i % 2 ? '#7a1020' : '#143a6a'));
        // big eye / face glyph
        px(ctx, sx + 30, GROUND_Y - 300, 44, 36, '#0c1424');
        px(ctx, sx + 44, GROUND_Y - 290, 16, 16, (i % 2 ? '#F5C518' : '#9fd0ff'));
        px(ctx, sx - 6, GROUND_Y - 256, 110, 12, '#0c1424');
        for (let b = 0; b < 9; b++) px(ctx, sx + b * 12, GROUND_Y - 254, 8, 8, '#F5C518'); // "text"
      }
    }

    /* ---------- MILITARY BASE ---------- */
    _military(ctx, cam, z, t) {
      this._sky(ctx, '#2a2c14', '#0c0e06');
      // distant haze sun
      const sx0 = (z.x0 + 500) - cam.x * 0.2;
      if (sx0 > -80 && sx0 < VIEW_W + 80) {
        ctx.fillStyle = 'rgba(200,180,90,0.18)';
        ctx.beginPath(); ctx.arc(sx0, 130, 70, 0, Math.PI * 2); ctx.fill();
      }
      // hangars / barracks (parallax 0.6)
      for (let i = 0; i < 14; i++) {
        const sx = (z.x0 + 40 + i * 230) - cam.x * 0.6;
        if (sx < -180 || sx > VIEW_W) continue;
        const h = 150 + hash(i * 3.7) * 40;
        px(ctx, sx, GROUND_Y - h, 200, h, '#23280f');
        ctx.fillStyle = '#2c331a';
        ctx.beginPath(); ctx.moveTo(sx, GROUND_Y - h);
        ctx.lineTo(sx + 100, GROUND_Y - h - 34); ctx.lineTo(sx + 200, GROUND_Y - h); ctx.closePath(); ctx.fill();
        px(ctx, sx + 80, GROUND_Y - 70, 40, 70, '#0c0f06'); // door
      }
      // radar dish (rotating) + watchtower
      const rx = (z.x0 + 1500) - cam.x * 0.6;
      if (rx > -60 && rx < VIEW_W + 60) {
        px(ctx, rx, GROUND_Y - 180, 8, 180, '#2c331a');
        ctx.save(); ctx.translate(rx + 4, GROUND_Y - 180);
        ctx.rotate(Math.sin(t * 0.5) * 0.5);
        ctx.fillStyle = '#3a4422';
        ctx.beginPath(); ctx.ellipse(0, -14, 30, 18, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#516030'; ctx.fillRect(-2, -14, 4, 14); ctx.restore();
      }
      this._ground(ctx, z.ground, '#3c4420');
      // sandbag walls
      for (let i = 0; i < 8; i++) {
        const sx = (z.x0 + 200 + i * 360) - cam.x;
        if (sx < -80 || sx > VIEW_W) continue;
        for (let r = 0; r < 3; r++)
          for (let c = 0; c < 5 - r; c++)
            px(ctx, sx + c * 18 + r * 9, GROUND_Y - 16 - r * 12, 16, 12, r % 2 ? '#6a6a32' : '#5a5a2a');
      }
      // tanks
      for (let i = 0; i < 4; i++) {
        const sx = (z.x0 + 360 + i * 600) - cam.x;
        if (sx < -120 || sx > VIEW_W) continue;
        this._tank(ctx, sx, GROUND_Y - 6, 1);
      }
      // fuel barrels + flag
      for (let i = 0; i < 6; i++) {
        const sx = (z.x0 + 150 + i * 420) - cam.x;
        if (sx < -10 || sx > VIEW_W) continue;
        px(ctx, sx, GROUND_Y - 28, 16, 28, '#3a4a1a');
        px(ctx, sx, GROUND_Y - 22, 16, 3, '#222');
        px(ctx, sx, GROUND_Y - 12, 16, 3, '#222');
      }
      const fx = (z.x0 + 1900) - cam.x;
      if (fx > -10 && fx < VIEW_W) {
        px(ctx, fx, GROUND_Y - 200, 5, 200, '#444');
        const wave = Math.sin(t * 4) * 3;
        px(ctx, fx + 5, GROUND_Y - 200 + wave, 60, 38, '#7a1020');
        px(ctx, fx + 26, GROUND_Y - 188 + wave, 16, 16, '#F5C518');
      }
    }

    _tank(ctx, x, baseY, dir) {
      px(ctx, x, baseY - 16, 70, 16, '#3a4422');        // hull
      px(ctx, x, baseY - 4, 70, 6, '#222');             // tracks
      for (let w = 0; w < 6; w++) px(ctx, x + 4 + w * 11, baseY - 12, 8, 8, '#1a1a10');
      px(ctx, x + 18, baseY - 30, 34, 16, '#46522a');   // turret
      px(ctx, x + 36 + (dir > 0 ? 0 : -34), baseY - 26, dir > 0 ? 44 : 44, 5, '#2c331a'); // barrel
    }

    /* ---------- PRISON ---------- */
    _prison(ctx, cam, z, t) {
      this._sky(ctx, '#161821', '#070809');
      // sweeping searchlights
      for (let i = 0; i < 3; i++) {
        const bx = (z.x0 + 400 + i * 800) - cam.x * 0.7;
        const ang = Math.sin(t * 0.6 + i * 2) * 0.6 - Math.PI / 2;
        ctx.save(); ctx.translate(bx, 60);
        ctx.fillStyle = 'rgba(220,230,255,0.07)';
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(ang - 0.16) * 700, Math.sin(ang - 0.16) * 700);
        ctx.lineTo(Math.cos(ang + 0.16) * 700, Math.sin(ang + 0.16) * 700);
        ctx.closePath(); ctx.fill(); ctx.restore();
        px(ctx, bx - 6, 50, 12, 12, '#fff6c0');
      }
      // cellblock wall (parallax 0.7) with barred windows
      const wallTop = 170, wf = 0.7;
      const wx0 = z.x0 - cam.x * wf;
      px(ctx, wx0, wallTop, (z.x1 - z.x0) / wf, GROUND_Y - wallTop, '#23262e');
      px(ctx, wx0, wallTop, (z.x1 - z.x0) / wf, 6, '#30343d');
      for (let i = 0; i < 22; i++) {
        const cellX = (z.x0 + 40 + i * 150) - cam.x * wf;
        if (cellX < -60 || cellX > VIEW_W + 60) continue;
        for (let r = 0; r < 2; r++) {
          const cy = wallTop + 26 + r * 130;
          px(ctx, cellX, cy, 70, 90, '#0a0b0e');
          for (let b = 0; b < 6; b++) px(ctx, cellX + 6 + b * 11, cy, 3, 90, '#3a3f49'); // bars
          if (hash(i * 3 + r) > 0.55) px(ctx, cellX + 26, cy + 40, 18, 30, '#1a1c22'); // shadowy figure
        }
      }
      // barbed wire along the top of the wall
      const topY = wallTop - 8;
      ctx.strokeStyle = '#4a4f59'; ctx.lineWidth = 1.5; ctx.beginPath();
      for (let sx = -10; sx < VIEW_W + 10; sx += 8) {
        ctx.moveTo(sx, topY); ctx.lineTo(sx + 4, topY - 6); ctx.lineTo(sx + 8, topY);
      }
      ctx.stroke();
      this._ground(ctx, z.ground, '#363b45');
      // chain-link fence (foreground)
      for (let sx = ((z.x0 - cam.x) % 24); sx < VIEW_W; sx += 24) {
        if (sx < -24) continue;
        px(ctx, sx, GROUND_Y - 120, 1, 120, 'rgba(120,128,140,0.35)');
      }
      for (let sy = GROUND_Y - 120; sy < GROUND_Y; sy += 24)
        px(ctx, 0, sy, VIEW_W, 1, 'rgba(120,128,140,0.20)');
      // fence posts
      for (let i = 0; i < 12; i++) {
        const sx = (z.x0 + 60 + i * 240) - cam.x;
        if (sx > -6 && sx < VIEW_W) px(ctx, sx, GROUND_Y - 140, 6, 140, '#3a3f49');
      }
    }

    /* ---------- NUCLEAR BUNKER ---------- */
    _bunker(ctx, cam, z, t) {
      px(ctx, 0, 0, VIEW_W, VIEW_H, '#0a0b0d');
      // concrete ceiling with hazard chevrons
      px(ctx, 0, 0, VIEW_W, 90, '#15161a');
      px(ctx, 0, 86, VIEW_W, 6, '#0a0b0d');
      for (let sx = ((z.x0 - cam.x * 0.9) % 64) - 64; sx < VIEW_W; sx += 64) {
        ctx.fillStyle = '#caa11c';
        ctx.beginPath(); ctx.moveTo(sx, 20); ctx.lineTo(sx + 20, 20);
        ctx.lineTo(sx + 32, 44); ctx.lineTo(sx + 20, 68); ctx.lineTo(sx, 68);
        ctx.lineTo(sx + 12, 44); ctx.closePath(); ctx.fill();
      }
      // pipes along the ceiling
      px(ctx, 0, 100, VIEW_W, 8, '#23262c');
      px(ctx, 0, 100, VIEW_W, 2, '#3a3f49');
      for (let sx = ((z.x0 - cam.x) % 120); sx < VIEW_W; sx += 120)
        px(ctx, sx, 96, 10, 16, '#2c3037');
      // back wall control panels (parallax 0.8)
      for (let i = 0; i < 16; i++) {
        const sx = (z.x0 + 80 + i * 200) - cam.x * 0.85;
        if (sx < -120 || sx > VIEW_W) continue;
        px(ctx, sx, GROUND_Y - 150, 150, 150, '#16181d');
        px(ctx, sx, GROUND_Y - 150, 150, 4, '#22252c');
        // screens
        px(ctx, sx + 16, GROUND_Y - 134, 50, 36, '#06210f');
        px(ctx, sx + 84, GROUND_Y - 134, 50, 36, '#06160f');
        // blinking lights
        for (let b = 0; b < 8; b++) {
          const on = hash(i * 9 + b + Math.floor(t * 2)) > 0.5;
          const col = b % 3 === 0 ? (on ? '#ff5a5a' : '#3a1010')
            : b % 3 === 1 ? (on ? '#ffd86b' : '#3a3010') : (on ? '#5affa0' : '#103a20');
          px(ctx, sx + 16 + b * 16, GROUND_Y - 86, 10, 10, col);
        }
        px(ctx, sx + 16, GROUND_Y - 64, 118, 8, '#0a2a14');
      }
      // hanging hazard lamps (red blink)
      for (let i = 0; i < 8; i++) {
        const sx = (z.x0 + 160 + i * 320) - cam.x;
        if (sx < -20 || sx > VIEW_W) continue;
        const on = (Math.sin(t * 3 + i) > 0);
        px(ctx, sx - 1, 108, 2, 30, '#222');
        px(ctx, sx - 8, 138, 16, 12, '#2a2a2a');
        px(ctx, sx - 5, 142, 10, 7, on ? '#ff4444' : '#3a1212');
        if (on) {
          ctx.fillStyle = 'rgba(255,60,60,0.10)';
          ctx.beginPath(); ctx.arc(sx, 150, 70, 0, Math.PI * 2); ctx.fill();
        }
      }
      // the missile silo + warhead (centrepiece)
      this._silo(ctx, this.siloX - cam.x, t);
      this._ground(ctx, z.ground, '#2a2d33');
      // metal grating texture
      for (let sx = ((z.x0 - cam.x) % 28); sx < VIEW_W; sx += 28)
        px(ctx, sx, GROUND_Y + 6, 2, VIEW_H - GROUND_Y - 6, '#0c0d10');
    }

    _silo(ctx, sx, t) {
      if (sx < -160 || sx > VIEW_W + 160) return;
      // silo housing
      px(ctx, sx - 70, GROUND_Y - 300, 140, 300, '#1a1d22');
      px(ctx, sx - 70, GROUND_Y - 300, 140, 6, '#262a31');
      // hazard frame stripes
      for (let y = GROUND_Y - 296; y < GROUND_Y - 8; y += 40) {
        px(ctx, sx - 70, y, 10, 20, '#caa11c'); px(ctx, sx + 60, y, 10, 20, '#caa11c');
        px(ctx, sx - 70, y + 20, 10, 20, '#1a1d22'); px(ctx, sx + 60, y + 20, 10, 20, '#1a1d22');
      }
      // the warhead/missile
      const my = GROUND_Y - 270;
      ctx.fillStyle = '#c9cdd6';
      ctx.beginPath(); ctx.moveTo(sx, my - 40); ctx.lineTo(sx - 22, my); ctx.lineTo(sx + 22, my); ctx.closePath(); ctx.fill();
      px(ctx, sx - 22, my, 44, 200, '#b4b8c2');
      px(ctx, sx - 22, my, 8, 200, '#cfd3dc');     // sheen
      px(ctx, sx - 22, my + 60, 44, 16, '#8a1020'); // red band
      px(ctx, sx - 22, my + 130, 44, 10, '#8a1020');
      // radiation trefoil
      px(ctx, sx - 7, my + 92, 14, 14, '#F5C518');
      px(ctx, sx - 2, my + 96, 4, 6, '#1a1d22');
      // fins
      ctx.fillStyle = '#9aa0ac';
      ctx.beginPath(); ctx.moveTo(sx - 22, my + 180); ctx.lineTo(sx - 40, my + 200); ctx.lineTo(sx - 22, my + 200); ctx.fill();
      ctx.beginPath(); ctx.moveTo(sx + 22, my + 180); ctx.lineTo(sx + 40, my + 200); ctx.lineTo(sx + 22, my + 200); ctx.fill();
      // blinking launch light
      const on = Math.sin(t * 5) > 0;
      px(ctx, sx - 4, GROUND_Y - 18, 8, 8, on ? '#ff3030' : '#3a1010');
    }

    /* ---------- zone marker sign ---------- */
    _zoneSign(ctx, cam, z) {
      const sx = (z.x0 + 30) - cam.x;
      if (sx < -200 || sx > VIEW_W) return;
      px(ctx, sx, GROUND_Y - 92, 4, 92, '#3a3f49');
      px(ctx, sx + 50, GROUND_Y - 92, 4, 92, '#3a3f49');
      px(ctx, sx - 6, GROUND_Y - 96, 66, 24, '#0c1018');
      px(ctx, sx - 6, GROUND_Y - 96, 66, 3, z.accent);
      ctx.fillStyle = z.accent;
      ctx.font = '7px "Press Start 2P", monospace';
      ctx.textBaseline = 'middle';
      ctx.fillText(z.id.toUpperCase().slice(0, 7), sx - 2, GROUND_Y - 83);
    }
  }

  World.GROUND_Y = GROUND_Y;
  World.VIEW_W = VIEW_W;
  World.VIEW_H = VIEW_H;
  window.World = World;
  window.__px = px; // shared crisp-rect helper for other modules
  window.__hash = hash;
})();
