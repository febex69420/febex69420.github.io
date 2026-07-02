// Pooled visual effects: tracers, muzzle flashes, particle bursts, smoke,
// explosions with shockwaves and area damage.
import * as THREE from 'three';
import { makeCanvasTex, dist2D } from '../core/utils.js';

export class Effects {
  constructor(ctx) {
    this.ctx = ctx;
    const scene = ctx.scene;
    this.group = new THREE.Group();
    scene.add(this.group);

    // tracer pool
    this.tracers = [];
    const tracerGeo = new THREE.BoxGeometry(0.05, 0.05, 1);
    for (let i = 0; i < 48; i++) {
      const m = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false;
      this.group.add(m);
      this.tracers.push({ mesh: m, life: 0 });
    }
    this._tracerIdx = 0;

    // burst particle pools (Points)
    this.bursts = [];
    for (let i = 0; i < 24; i++) {
      const n = 22;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.12, transparent: true, opacity: 1, depthWrite: false });
      const pts = new THREE.Points(geo, mat);
      pts.visible = false;
      pts.frustumCulled = false;
      this.group.add(pts);
      this.bursts.push({ pts, vels: new Float32Array(n * 3), life: 0, n });
    }
    this._burstIdx = 0;

    // smoke / fire sprites
    const smokeTex = makeCanvasTex(64, 64, (c, w, h) => {
      const g = c.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,0.65)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
    });
    this.sprites = [];
    for (let i = 0; i < 40; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, opacity: 0, depthWrite: false }));
      s.visible = false;
      this.group.add(s);
      this.sprites.push({ s, life: 0, max: 1, vel: new THREE.Vector3(), grow: 1, color: new THREE.Color() });
    }
    this._spriteIdx = 0;

    // flash lights
    this.lights = [];
    for (let i = 0; i < 4; i++) {
      const L = new THREE.PointLight(0xffc070, 0, 40, 1.6);
      this.group.add(L);
      this.lights.push({ L, life: 0 });
    }
    this._lightIdx = 0;

    // shockwave rings
    this.rings = [];
    const ringGeo = new THREE.RingGeometry(0.8, 1, 26);
    for (let i = 0; i < 4; i++) {
      const r = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffd0a0, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
      r.rotation.x = -Math.PI / 2;
      r.visible = false;
      this.group.add(r);
      this.rings.push({ r, life: 0 });
    }
    this._ringIdx = 0;
  }

  tracer(origin, dir, length, color = 0xffe0a0) {
    const t = this.tracers[this._tracerIdx++ % this.tracers.length];
    const L = Math.min(length, 400);
    t.mesh.material.color.setHex(color);
    t.mesh.position.copy(origin).addScaledVector(dir, L / 2);
    t.mesh.lookAt(new THREE.Vector3().copy(origin).addScaledVector(dir, L));
    t.mesh.scale.set(1, 1, L);
    t.mesh.visible = true;
    t.life = 0.07;
  }

  muzzle(x, y, z) {
    const l = this.lights[this._lightIdx++ % this.lights.length];
    l.L.position.set(x, y, z);
    l.L.intensity = 40;      // candela (physical lights)
    l.L.distance = 16;
    l.L.color.setHex(0xffc070);
    l.life = 0.05;
  }

  burst(x, y, z, color = 0xd8c090, count = 16, speed = 5) {
    const b = this.bursts[this._burstIdx++ % this.bursts.length];
    const pos = b.pts.geometry.attributes.position.array;
    for (let i = 0; i < b.n; i++) {
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      b.vels[i * 3] = (Math.random() - 0.5) * speed * 2;
      b.vels[i * 3 + 1] = Math.random() * speed;
      b.vels[i * 3 + 2] = (Math.random() - 0.5) * speed * 2;
    }
    b.pts.geometry.attributes.position.needsUpdate = true;
    b.pts.material.color.setHex(color);
    b.pts.material.opacity = 1;
    b.pts.visible = true;
    b.life = 0.8;
  }

  smoke(x, y, z, { color = 0x9a9a9a, size = 2, grow = 3, up = 1.6, life = 1.6 } = {}) {
    const sp = this.sprites[this._spriteIdx++ % this.sprites.length];
    sp.s.position.set(x, y, z);
    sp.s.scale.setScalar(size);
    sp.s.material.color.setHex(color);
    sp.s.material.opacity = 0.55;
    sp.s.visible = true;
    sp.vel.set((Math.random() - 0.5) * 0.8, up, (Math.random() - 0.5) * 0.8);
    sp.grow = grow;
    sp.life = life;
    sp.max = life;
  }

  // full explosion: visuals + audio + area damage + physics knock-on
  explode(x, y, z, radius = 7, power = 80) {
    const ctx = this.ctx;
    // flash
    const l = this.lights[this._lightIdx++ % this.lights.length];
    l.L.position.set(x, y + 2, z);
    l.L.intensity = 600;     // candela flash
    l.L.distance = radius * 9;
    l.L.color.setHex(0xffa040);
    l.life = 0.3;
    // fireball + smoke column
    this.smoke(x, y + 1, z, { color: 0xff9540, size: radius * 0.7, grow: radius * 1.1, up: 2.5, life: 0.5 });
    for (let i = 0; i < 6; i++) {
      this.smoke(x + (Math.random() - 0.5) * radius * 0.7, y + 1 + Math.random() * 2, z + (Math.random() - 0.5) * radius * 0.7,
        { color: 0x3a3632, size: radius * 0.5, grow: radius * 0.9, up: 2.4 + Math.random() * 2, life: 1.8 + Math.random() });
    }
    this.burst(x, y + 1.2, z, 0xffb060, 22, radius * 1.6);
    // shockwave
    const ring = this.rings[this._ringIdx++ % this.rings.length];
    ring.r.position.set(x, y + 0.4, z);
    ring.r.visible = true;
    ring.life = 0.5;
    ring.maxR = radius * 2.2;
    ctx.audio.explosion(x, y, z, Math.min(2, radius / 6));
    // area damage
    for (const npc of ctx.npcs.npcs) {
      if (!npc.alive) continue;
      const d = Math.hypot(npc.pos.x - x, npc.pos.y + 1 - y, npc.pos.z - z);
      if (d < radius * 1.4) npc.damage(power * (1 - d / (radius * 1.6)), { x, y, z });
    }
    const pd = Math.hypot(ctx.player.position.x - x, ctx.player.position.y + 1 - y, ctx.player.position.z - z);
    if (pd < radius * 1.5) ctx.player.damage(power * 0.8 * (1 - pd / (radius * 1.6)), new THREE.Vector3(x, y, z));
    ctx.player.shake(Math.max(0, 1 - pd / 90) * 0.8);
    ctx.world.props.applyExplosion(x, y, z, radius);
    ctx.vehicles.applyExplosion(x, y, z, radius, power);
    ctx.events.emit('explosion', { x, y, z, radius, power });
  }

  update(dt) {
    for (const t of this.tracers) {
      if (t.life > 0) { t.life -= dt; if (t.life <= 0) t.mesh.visible = false; }
    }
    for (const l of this.lights) {
      if (l.life > 0) { l.life -= dt; l.L.intensity *= 0.7; if (l.life <= 0) l.L.intensity = 0; }
    }
    for (const b of this.bursts) {
      if (b.life <= 0) continue;
      b.life -= dt;
      const pos = b.pts.geometry.attributes.position.array;
      for (let i = 0; i < b.n; i++) {
        b.vels[i * 3 + 1] -= 9 * dt;
        pos[i * 3] += b.vels[i * 3] * dt;
        pos[i * 3 + 1] += b.vels[i * 3 + 1] * dt;
        pos[i * 3 + 2] += b.vels[i * 3 + 2] * dt;
      }
      b.pts.geometry.attributes.position.needsUpdate = true;
      b.pts.material.opacity = Math.max(0, b.life / 0.8);
      if (b.life <= 0) b.pts.visible = false;
    }
    for (const sp of this.sprites) {
      if (sp.life <= 0) continue;
      sp.life -= dt;
      sp.s.position.addScaledVector(sp.vel, dt);
      sp.s.scale.addScalar(sp.grow * dt);
      sp.s.material.opacity = 0.55 * Math.max(0, sp.life / sp.max);
      if (sp.life <= 0) sp.s.visible = false;
    }
    for (const ring of this.rings) {
      if (ring.life <= 0) continue;
      ring.life -= dt;
      const t = 1 - ring.life / 0.5;
      ring.r.scale.setScalar(1 + t * ring.maxR);
      ring.r.material.opacity = 0.5 * (1 - t);
      if (ring.life <= 0) ring.r.visible = false;
    }
  }
}
