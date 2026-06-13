// multiplayer.js — shared-world multiplayer over BroadcastChannel.
// Every tab on this machine that opens the same world joins one session.
// The lowest peer id acts as host (authoritative for time/weather; mobs are
// simulated locally per-tab but block edits, chat and player presence sync).
// The message layer is transport-agnostic: swap `BroadcastChannel` for a
// WebSocket/WebRTC DataChannel and the same protocol works over a network.
import * as THREE from 'three';

export class Multiplayer {
  constructor(game) {
    this.game = game;
    this.channel = null;
    this.peerId = Math.floor(Math.random() * 1e9);
    this.peers = new Map();      // id -> {name, lastSeen, dim, avatar}
    this.sendTimer = 0;
  }

  join(worldId) {
    if (typeof BroadcastChannel === 'undefined') return;
    this.leave();
    try {
      this.channel = new BroadcastChannel('voxelcraft-' + worldId);
      this.channel.onmessage = (e) => this.onMessage(e.data);
      this.send({ t: 'hello', name: this.game.playerName });
    } catch (e) { this.channel = null; }
  }

  leave() {
    if (this.channel) {
      this.send({ t: 'bye' });
      this.channel.close();
      this.channel = null;
    }
    for (const [, p] of this.peers) this.removeAvatar(p);
    this.peers.clear();
  }

  send(msg) {
    if (!this.channel) return;
    msg.from = this.peerId;
    try { this.channel.postMessage(msg); } catch (e) { }
  }

  isHost() {
    let min = this.peerId;
    for (const id of this.peers.keys()) min = Math.min(min, id);
    return this.peerId === min;
  }

  onMessage(m) {
    if (!m || m.from === this.peerId) return;
    const g = this.game;
    switch (m.t) {
      case 'hello':
        this.touch(m);
        this.send({ t: 'welcome', name: g.playerName });
        // host shares clock & weather
        if (this.isHost()) this.send({ t: 'sync', time: g.time, weather: g.weather });
        break;
      case 'welcome': this.touch(m); break;
      case 'bye': {
        const p = this.peers.get(m.from);
        if (p) { this.removeAvatar(p); this.peers.delete(m.from); }
        g.ui.chatMsg((m.name || 'Player') + ' left the game', '#ff5');
        break;
      }
      case 'state': {
        this.touch(m);
        const p = this.peers.get(m.from);
        p.dim = m.dim;
        p.pos = m.pos; p.yaw = m.yaw;
        this.updateAvatar(p);
        break;
      }
      case 'block': {
        const world = g.worlds[m.dim];
        if (world) world.setBlock(m.x, m.y, m.z, m.id, { fromNet: true, meta: m.meta });
        break;
      }
      case 'meta': {
        const world = g.worlds[m.dim];
        if (world) {
          world.setMeta(m.x, m.y, m.z, m.meta);
          world.markDirtyAt(m.x, m.y, m.z);
          if (g.ui.container && g.ui.container.x === m.x && g.ui.container.y === m.y && g.ui.container.z === m.z)
            g.ui.rerenderScreen();
        }
        break;
      }
      case 'chat': g.ui.chatMsg(m.text); break;
      case 'sync':
        if (!this.isHost()) { g.time = m.time; if (m.weather !== g.weather) g.setWeather(m.weather); }
        break;
    }
  }

  touch(m) {
    let p = this.peers.get(m.from);
    if (!p) {
      p = { id: m.from, name: m.name || 'Player', lastSeen: Date.now() };
      this.peers.set(m.from, p);
      this.game.ui.chatMsg(p.name + ' joined the game', '#ff5');
    }
    p.lastSeen = Date.now();
    if (m.name) p.name = m.name;
  }

  // ---- avatars (simple player model) ----
  makeAvatar(p) {
    const grp = new THREE.Group();
    const mat = (c) => new THREE.MeshBasicMaterial({ color: c });
    const add = (sx, sy, sz, px, py, pz, c) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat(c));
      m.position.set(px, py, pz);
      grp.add(m);
      return m;
    };
    const hue = (p.id % 360);
    const shirt = `hsl(${hue},60%,45%)`, pants = `hsl(${hue},40%,30%)`;
    add(0.5, 0.7, 0.28, 0, 1.05, 0, shirt);
    add(0.4, 0.4, 0.4, 0, 1.62, 0, '#d8a586');
    add(0.18, 0.65, 0.18, -0.34, 1.05, 0, shirt);
    add(0.18, 0.65, 0.18, 0.34, 1.05, 0, shirt);
    add(0.2, 0.7, 0.2, -0.12, 0.35, 0, pants);
    add(0.2, 0.7, 0.2, 0.12, 0.35, 0, pants);
    // name tag
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 48;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, 256, 48);
    ctx.fillStyle = '#fff'; ctx.font = '28px monospace'; ctx.textAlign = 'center';
    ctx.fillText(p.name.slice(0, 16), 128, 33);
    const tex = new THREE.CanvasTexture(cv);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    sprite.scale.set(1.6, 0.3, 1);
    sprite.position.y = 2.15;
    grp.add(sprite);
    this.game.scene.add(grp);
    return grp;
  }

  updateAvatar(p) {
    if (!p.pos) return;
    if (!p.avatar) p.avatar = this.makeAvatar(p);
    p.avatar.visible = p.dim === this.game.world.dim;
    // smooth towards target
    p.avatar.position.lerp(new THREE.Vector3(p.pos[0], p.pos[1], p.pos[2]), 0.4);
    p.avatar.rotation.y = p.yaw ?? 0;
  }

  removeAvatar(p) {
    if (p.avatar) { this.game.scene.remove(p.avatar); p.avatar = null; }
  }

  sendBlock(dim, x, y, z, id, meta) {
    this.send({ t: 'block', dim, x, y, z, id, meta });
  }

  sendMeta(dim, x, y, z, meta) {
    this.send({ t: 'meta', dim, x, y, z, meta });
  }

  sendChat(text) { this.send({ t: 'chat', text }); }

  update(dt) {
    if (!this.channel) return;
    this.sendTimer -= dt;
    if (this.sendTimer <= 0) {
      this.sendTimer = 0.1; // 10 Hz presence
      const pl = this.game.player;
      this.send({
        t: 'state', dim: this.game.world.dim,
        pos: [+pl.pos.x.toFixed(2), +pl.pos.y.toFixed(2), +pl.pos.z.toFixed(2)],
        yaw: +pl.yaw.toFixed(2),
      });
      // prune silent peers
      const now = Date.now();
      for (const [id, p] of this.peers) {
        if (now - p.lastSeen > 5000) { this.removeAvatar(p); this.peers.delete(id); }
      }
      // host re-syncs clock occasionally
      if (this.isHost() && Math.random() < 0.05) this.send({ t: 'sync', time: this.game.time, weather: this.game.weather });
    }
  }
}
