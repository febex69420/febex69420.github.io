// vision.js — Deep Sight (x-ray), Thermal overlay, and Acute Hearing.
// Implemented with "see-through" marker sprites (depthTest off) drawn over entities and
// events, so you can sense people/enemies/crimes through walls.
import * as THREE from 'three';

function dot(color) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.4, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Vision {
  constructor(ctx) {
    this.ctx = ctx;
    this.xray = false; this.thermal = false;
    this.hearingTimer = 0;
    this.markers = [];
    this.pool = [];
    this.texCivilian = dot('rgba(120,200,255,0.8)');
    this.texEnemy = dot('rgba(255,80,70,0.85)');
    this.texEvent = dot('rgba(255,210,80,0.9)');
    this.group = new THREE.Group();
    ctx.scene.add(this.group);
  }

  _marker(tex) {
    let s = this.pool.pop();
    if (!s) {
      s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.renderOrder = 999;
      this.group.add(s);
    }
    s.material.map = tex; s.material.needsUpdate = true; s.visible = true;
    this.markers.push(s);
    return s;
  }
  _recycle() { for (const s of this.markers) { s.visible = false; this.pool.push(s); } this.markers.length = 0; }

  update(dt) {
    const input = this.ctx.input;
    if (input.pressed('xray')) { this.xray = !this.xray; if (this.xray && this.ctx.audio) this.ctx.audio.ui(); }
    if (input.pressed('hearing')) { this.hearingTimer = 4; if (this.ctx.audio) this.ctx.audio.zap(1200, 0.6); }
    if (this.hearingTimer > 0) this.hearingTimer -= dt;

    this._recycle();
    if (!this.xray && this.hearingTimer <= 0) { this.group.visible = false; return; }
    this.group.visible = true;
    const hero = this.ctx.hero;

    if (this.xray) {
      // people
      if (this.ctx.crowd) {
        for (const p of this.ctx.crowd.nearbyPositions(hero.pos, 90)) {
          const m = this._marker(this.texCivilian); m.position.set(p.x, p.y + 2.6, p.z); m.scale.setScalar(2.2);
        }
      }
      // enemies
      if (this.ctx.combat) {
        for (const e of this.ctx.combat.enemyPositions()) {
          const m = this._marker(this.texEnemy); m.position.set(e.x, e.y + 3, e.z); m.scale.setScalar(3.2);
        }
      }
    }
    if (this.hearingTimer > 0 && this.ctx.director) {
      for (const ev of this.ctx.director.activeEventPositions()) {
        const m = this._marker(this.texEvent); m.position.set(ev.x, ev.y + 6, ev.z);
        m.scale.setScalar(5 + Math.sin(this.ctx.hero.t * 6) * 1.2);
      }
    }
  }
}
