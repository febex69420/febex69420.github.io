/* ============================================================
   player.js — the Supreme Leader: physics + pixel sprite.
   ============================================================ */
(function () {
  'use strict';
  const px = window.__px;

  class Player {
    constructor(world) {
      this.world = world;
      this.w = 26; this.h = 60;
      this.x = 700; this.y = world.GROUND_Y - this.h;
      this.vx = 0; this.vy = 0;
      this.facing = 1;
      this.onGround = true;
      this.walkPhase = 0;
      this.speed = 3.4;
      this.jumpV = 12.4;
      this.gravity = 0.62;
      this.frozen = false; // disabled while menus/dialogue are open
    }

    update(step, input) {
      const moving = !this.frozen;
      let ax = 0;
      if (moving) {
        if (input.down('left'))  ax -= 1;
        if (input.down('right')) ax += 1;
      }

      if (ax !== 0) {
        this.vx = ax * this.speed;
        this.facing = ax > 0 ? 1 : -1;
        this.walkPhase += step * 0.32;
      } else {
        this.vx *= 0.6;
        if (Math.abs(this.vx) < 0.1) this.vx = 0;
        this.walkPhase += step * 0.06; // idle bob
      }

      if (moving && this.onGround && (input.down('jump'))) {
        this.vy = -this.jumpV;
        this.onGround = false;
      }

      this.vy += this.gravity * step;
      if (this.vy > 18) this.vy = 18;

      this.x += this.vx * step;
      this.y += this.vy * step;

      // world bounds
      const min = 20, max = this.world.WORLD_W - this.w - 20;
      if (this.x < min) this.x = min;
      if (this.x > max) this.x = max;

      // flat-ground collision
      const floor = this.world.GROUND_Y - this.h;
      if (this.y >= floor) { this.y = floor; this.vy = 0; this.onGround = true; }
    }

    centerX() { return this.x + this.w / 2; }

    draw(ctx, cam) {
      const sx = Math.round(this.x - cam.x);
      const sy = Math.round(this.y);
      const f = this.facing;

      ctx.save();
      ctx.translate(sx + this.w / 2, sy);
      ctx.scale(f, 1);
      ctx.translate(-this.w / 2, 0);

      const swing = this.onGround ? Math.sin(this.walkPhase) : 0.4;
      const swing2 = this.onGround ? Math.sin(this.walkPhase + Math.PI) : -0.4;
      const stride = Math.abs(this.vx) > 0.4 ? 5 : 0;
      const bob = Math.abs(this.vx) > 0.4 ? 0 : Math.sin(this.walkPhase) * 0.6;

      // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(this.w / 2, this.h + 2, 16, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      const P = (x, y, w, h, c) => px(ctx, x, y + bob, w, h, c);

      // ---- legs (military trousers + boots) ----
      const legY = 40;
      P(6 + swing * stride, legY, 7, 16, '#1b2230');
      P(6 + swing * stride, legY + 14, 8, 6, '#0a0c12');  // boot
      P(13 + swing2 * stride, legY, 7, 16, '#222a3a');
      P(13 + swing2 * stride, legY + 14, 8, 6, '#0a0c12');

      // ---- coat / torso (dark olive-grey greatcoat) ----
      P(4, 18, 18, 24, '#222b3c');
      P(4, 18, 18, 24, '#222b3c');
      P(4, 18, 4, 24, '#2c374b');     // left highlight
      P(11, 18, 3, 24, '#161d29');    // button seam
      // belt
      P(4, 36, 18, 4, '#0c0f16');
      P(11, 36, 4, 4, '#caa11c');     // buckle
      // gold buttons
      P(8, 22, 2, 2, '#F5C518'); P(8, 27, 2, 2, '#F5C518'); P(8, 32, 2, 2, '#F5C518');
      // red sash across chest
      ctx.save();
      ctx.translate(0, bob);
      ctx.fillStyle = '#a01524';
      ctx.beginPath(); ctx.moveTo(5, 18); ctx.lineTo(20, 18);
      ctx.lineTo(20, 24); ctx.lineTo(5, 33); ctx.closePath(); ctx.fill();
      ctx.restore();
      // medals
      P(15, 22, 3, 3, '#F5C518'); P(15, 26, 3, 3, '#6fae3a'); P(15, 30, 3, 3, '#cf3030');
      // epaulettes
      P(2, 17, 6, 4, '#caa11c'); P(18, 17, 6, 4, '#caa11c');

      // ---- arm (swings) ----
      P(2 + swing2 * stride * 0.6, 20, 5, 16, '#1b2230');
      P(2 + swing2 * stride * 0.6, 34, 5, 4, '#caa6a0'); // glove/hand

      // ---- head ----
      P(8, 6, 12, 13, '#caa6a0');     // face
      P(8, 6, 12, 3, '#b8938c');      // brow shadow
      P(18, 9, 2, 6, '#a07e78');      // jaw shade
      // stern eyes + moustache
      P(11, 11, 2, 2, '#1a1a1a'); P(15, 11, 2, 2, '#1a1a1a');
      P(11, 15, 7, 2, '#2a2018');     // moustache

      // ---- peaked officer cap ----
      P(6, 2, 16, 5, '#1a212e');      // crown
      P(6, 1, 16, 2, '#252e3e');
      P(5, 6, 18, 3, '#11161f');      // band
      P(4, 8, 20, 2, '#0a0c12');      // brim
      P(10, 3, 8, 2, '#caa11c');      // gold braid
      P(12, 3, 4, 3, '#F5C518');      // cap emblem

      ctx.restore();
    }
  }

  window.Player = Player;
})();
