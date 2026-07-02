// All DOM chrome: HUD bars, compass, prompts, subtitles, notifications, radio
// command menu, strategic map, start screen, pause/settings and fades.
import { clamp } from '../core/utils.js';

export class HUD {
  constructor(ctx) {
    this.ctx = ctx;
    this.menuOpen = null;      // null | 'gov' | 'radio' | 'map' | 'pause'
    this.radioItems = [];
    this._notices = [];
    this._subT = 0;
    this._spread = 12;
    this._buildDom();
    this.hidden = false;
  }

  _buildDom() {
    const root = document.createElement('div');
    root.id = 'hud';
    root.innerHTML = `
      <div class="crosshair" id="cross">
        <div class="arm" id="ch-t" style="left:1px;top:-12px;width:2px;height:7px"></div>
        <div class="arm" id="ch-b" style="left:1px;bottom:-12px;width:2px;height:7px"></div>
        <div class="arm" id="ch-l" style="top:1px;left:-12px;height:2px;width:7px"></div>
        <div class="arm" id="ch-r" style="top:1px;right:-12px;height:2px;width:7px"></div>
      </div>
      <div class="hitmark" id="hitmark"></div>
      <div id="damage-vignette"></div>
      <div id="scope"></div>
      <div class="hud-corner">
        <div class="hud-label">SUPREME MARSHAL — VITALS</div>
        <div class="bar"><div id="hp-fill" style="width:100%"></div></div>
        <div class="bar"><div id="st-fill" style="width:100%"></div></div>
      </div>
      <div id="ammo-box" style="display:none">
        <div id="weapon-name"></div>
        <div id="ammo-count"></div>
      </div>
      <div id="speedo">
        <div id="speedo-name" class="lbl"></div>
        <div class="num" id="speedo-kmh">0</div>
        <div class="lbl">KM/H</div>
        <div class="alt" id="speedo-alt"></div>
      </div>
      <div id="topbar">
        <span id="clock">09:30</span><span class="sep">|</span>
        <span id="location">Palace District</span><span class="sep">|</span>
        <span id="alert-chip" class="a0">STATE NORMAL</span>
      </div>
      <div id="compass"><div id="compass-strip"></div></div>
      <div id="escort-chip"><b>PROTECTION DETAIL</b> <span id="escort-n"></span></div>
      <div id="prompt"></div>
      <div id="subtitle"><b id="sub-speaker"></b><span id="sub-text"></span></div>
      <div id="notices"></div>
      <div id="radio"><h3>COMMAND CHANNEL — SECURE</h3><div id="radio-items"></div></div>
      <div id="map-overlay"><div class="frame"><h3>GRAND REPUBLIC OF VELMORA</h3><canvas id="map-canvas" width="560" height="560"></canvas><div class="hint">M / ESC — CLOSE · YOU ARE THE GOLD ARROW</div></div></div>
    `;
    document.body.appendChild(root);
    this.root = root;
    const fader = document.createElement('div');
    fader.id = 'fader';
    document.body.appendChild(fader);
    this.fader = fader;

    // compass strip: 3 copies of 360°, 15° ticks (60px each)
    const strip = root.querySelector('#compass-strip');
    const cards = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    let html = '';
    for (let c = 0; c < 3; c++) {
      for (let d = 0; d < 360; d += 15) {
        html += cards[d] !== undefined ? `<span class="card">${cards[d]}</span>` : `<span>·</span>`;
      }
    }
    strip.innerHTML = html;
    this.strip = strip;

    this.el = {
      hp: root.querySelector('#hp-fill'), st: root.querySelector('#st-fill'),
      ammoBox: root.querySelector('#ammo-box'), ammoCount: root.querySelector('#ammo-count'),
      weaponName: root.querySelector('#weapon-name'),
      speedo: root.querySelector('#speedo'), kmh: root.querySelector('#speedo-kmh'),
      alt: root.querySelector('#speedo-alt'), sName: root.querySelector('#speedo-name'),
      clock: root.querySelector('#clock'), location: root.querySelector('#location'),
      alert: root.querySelector('#alert-chip'), escort: root.querySelector('#escort-chip'),
      escortN: root.querySelector('#escort-n'), prompt: root.querySelector('#prompt'),
      subtitle: root.querySelector('#subtitle'), subSpeaker: root.querySelector('#sub-speaker'),
      subText: root.querySelector('#sub-text'), notices: root.querySelector('#notices'),
      vignette: root.querySelector('#damage-vignette'), scope: root.querySelector('#scope'),
      cross: root.querySelector('#cross'), hitmark: root.querySelector('#hitmark'),
      radio: root.querySelector('#radio'), radioItems: root.querySelector('#radio-items'),
      map: root.querySelector('#map-overlay'), mapCanvas: root.querySelector('#map-canvas'),
    };
  }

  // ---------- boot / start / pause ----------
  bootProgress(pct, status) {
    const f = document.querySelector('#boot-fill');
    const s = document.querySelector('#boot-status');
    if (f) f.style.width = (pct * 100).toFixed(0) + '%';
    if (s && status) s.textContent = status;
  }
  drawCrest(target, size = 110) {
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const x = c.getContext('2d');
    x.fillStyle = '#8e1f2f';
    x.beginPath(); x.arc(size / 2, size / 2, size / 2 - 3, 0, 7); x.fill();
    x.strokeStyle = '#d8b04a'; x.lineWidth = 3; x.stroke();
    x.fillStyle = '#d8b04a';
    const cx = size / 2, cy = size / 2;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      x.beginPath();
      x.moveTo(cx + Math.cos(a - 0.09) * size * 0.12, cy + Math.sin(a - 0.09) * size * 0.12);
      x.lineTo(cx + Math.cos(a) * size * 0.34, cy + Math.sin(a) * size * 0.34);
      x.lineTo(cx + Math.cos(a + 0.09) * size * 0.12, cy + Math.sin(a + 0.09) * size * 0.12);
      x.fill();
    }
    x.beginPath(); x.arc(cx, cy, size * 0.1, 0, 7); x.fill();
    target.appendChild(c);
  }

  showStart() {
    return new Promise(resolve => {
      const o = document.createElement('div');
      o.className = 'overlay';
      o.innerHTML = `
        <div class="menu-card">
          <div style="display:flex;justify-content:center;margin-bottom:10px" id="start-crest"></div>
          <h1>VELMORA</h1>
          <div class="tagline">SUPREME MARSHAL — A FIRST-PERSON SANDBOX OF ABSOLUTE RULE</div>
          <div class="lore">The Grand Republic of Velmora — an entirely fictional nation on no real map. You are its
          Supreme Marshal: the palace, the armies, the highways, the skies — all yours. There are no missions and no
          objectives. Walk your marble halls among hundreds of staff, summon a soldier escort, review the troops,
          read intelligence, drive the state limousine to Aurelgrad, fly the Kestrel from the palace lawn — or simply
          watch your nation live.</div>
          <h2>PROTOCOL (CONTROLS)</h2>
          <div class="controls-grid">
            <div><b>W A S D</b> Move</div><div><b>SHIFT</b> Sprint / Jet throttle</div>
            <div><b>SPACE</b> Jump / Heli up / Brake</div><div><b>C</b> Crouch / Heli down / Throttle−</div>
            <div><b>MOUSE</b> Look / Steer camera</div><div><b>LMB / RMB</b> Fire / Aim</div>
            <div><b>1 – 6</b> Arsenal</div><div><b>Q</b> Holster</div>
            <div><b>R</b> Reload</div><div><b>E</b> Interact / Board / Exit</div>
            <div><b>G</b> Summon / dismiss escort</div><div><b>T</b> Command radio</div>
            <div><b>M</b> Map of the Republic</div><div><b>V</b> Vehicle camera</div>
            <div><b>U</b> Hide HUD</div><div><b>ESC</b> Pause</div>
          </div>
          <div class="btn-row"><button class="btn" id="btn-start">ASSUME COMMAND</button></div>
          <p style="text-align:center;margin-top:14px;font-size:11px;color:#57534a">All countries, people, flags and events are fictional. Best played on desktop with mouse + keyboard.</p>
        </div>`;
      document.body.appendChild(o);
      this.drawCrest(o.querySelector('#start-crest'), 90);
      o.querySelector('#btn-start').onclick = () => {
        o.remove();
        resolve();
      };
    });
  }

  showPause(show) {
    if (show && !this.pauseEl) {
      const o = document.createElement('div');
      o.className = 'overlay';
      const g = this.ctx;
      o.innerHTML = `
        <div class="menu-card" style="max-width:560px">
          <h1 style="font-size:22px">RULE SUSPENDED</h1>
          <div class="tagline">THE NATION AWAITS YOUR RETURN</div>
          <div class="settings-row"><span>Graphics quality</span><div class="opts" id="q-opts">
            <button data-q="low">LOW</button><button data-q="med">MED</button><button data-q="high">HIGH</button></div></div>
          <div class="settings-row"><span>Master volume</span><input type="range" id="s-vol" min="0" max="100" value="${Math.round(g.audio.volume * 100)}"></div>
          <div class="settings-row"><span>Mouse sensitivity</span><input type="range" id="s-sens" min="5" max="60" value="${Math.round(g.player.sensitivity * 10000)}"></div>
          <div class="settings-row"><span>Invert Y</span><div class="opts"><button id="s-inv">${g.player.invertY ? 'ON' : 'OFF'}</button></div></div>
          <div class="settings-row"><span>Time flow</span><div class="opts" id="t-opts">
            <button data-t="0.25">SLOW</button><button data-t="1">NORMAL</button><button data-t="4">FAST</button></div></div>
          <div class="btn-row"><button class="btn" id="btn-resume">RESUME RULE</button></div>
        </div>`;
      document.body.appendChild(o);
      this.pauseEl = o;
      const g2 = this.ctx;
      o.querySelectorAll('#q-opts button').forEach(b => {
        b.classList.toggle('on', b.dataset.q === g2.quality);
        b.onclick = () => { g2.setQuality(b.dataset.q); o.querySelectorAll('#q-opts button').forEach(x => x.classList.toggle('on', x === b)); };
      });
      o.querySelectorAll('#t-opts button').forEach(b => {
        b.classList.toggle('on', +b.dataset.t === (g2.timeScale || 1));
        b.onclick = () => { g2.timeScale = +b.dataset.t; o.querySelectorAll('#t-opts button').forEach(x => x.classList.toggle('on', x === b)); };
      });
      o.querySelector('#s-vol').oninput = e => g2.audio.setVolume(e.target.value / 100);
      o.querySelector('#s-sens').oninput = e => { g2.player.sensitivity = e.target.value / 10000; };
      o.querySelector('#s-inv').onclick = e => { g2.player.invertY = !g2.player.invertY; e.target.textContent = g2.player.invertY ? 'ON' : 'OFF'; };
      o.querySelector('#btn-resume').onclick = () => { this.showPause(false); g2.input.requestLock(); };
      this.setMenuOpen('pause');
    } else if (!show && this.pauseEl) {
      this.pauseEl.remove();
      this.pauseEl = null;
      this.setMenuOpen(null);
    }
  }

  setMenuOpen(name) { this.menuOpen = name; }

  // ---------- HUD pieces ----------
  notify(title, text, kind = '') {
    const el = document.createElement('div');
    el.className = 'notice ' + kind;
    el.innerHTML = (title ? `<small>${title}</small>` : '') + text;
    this.el.notices.prepend(el);
    this._notices.push({ el, t: 9 });
    if (this._notices.length > 5) {
      const old = this._notices.shift();
      old.el.remove();
    }
  }

  subtitle(speaker, text) {
    this.el.subSpeaker.textContent = speaker;
    this.el.subText.textContent = text;
    this.el.subtitle.style.display = 'block';
    this._subT = 3 + text.length * 0.045;
  }

  prompt(label) {
    if (!label) { this.el.prompt.style.display = 'none'; return; }
    this.el.prompt.innerHTML = `<b>E</b>${label}`;
    this.el.prompt.style.display = 'block';
  }

  setAmmo(a) {
    if (!a) { this.el.ammoBox.style.display = 'none'; return; }
    this.el.ammoBox.style.display = 'block';
    this.el.weaponName.textContent = a.name;
    this.el.ammoCount.innerHTML = `${a.mag} <span>/ ${a.reserve}</span>`;
  }

  setSpeedo(kmh, alt, name) {
    if (kmh === null || kmh === undefined) { this.el.speedo.style.display = 'none'; return; }
    this.el.speedo.style.display = 'block';
    this.el.kmh.textContent = kmh;
    this.el.sName.textContent = name || '';
    this.el.alt.textContent = alt !== null && alt !== undefined ? `ALT ${alt} m` : '';
  }

  setAlert(level, name) {
    this.el.alert.className = 'a' + level;
    this.el.alert.textContent = name;
  }

  setEscort(active, n) {
    this.el.escort.style.display = active ? 'block' : 'none';
    this.el.escortN.textContent = active ? `— ${n} soldiers active` : '';
  }

  setSpread(px) { this._spread = clamp(px, 8, 60); }

  hitmark() {
    this.el.hitmark.style.opacity = 1;
    this._hitT = 0.12;
  }

  damageFlash() {
    this.el.vignette.style.boxShadow = 'inset 0 0 160px rgba(190,25,30,.55)';
    this._dmgT = 0.25;
  }

  scope(on) { this.el.scope.style.display = on ? 'block' : 'none'; this.root.classList.toggle('scoped', on); }

  fade(on) { this.fader.classList.toggle('on', on); }

  toggleHidden() { this.hidden = !this.hidden; this.root.classList.toggle('hidden', this.hidden); }

  // ---------- radio ----------
  openRadio(items) {
    this.radioItems = items;
    this.el.radioItems.innerHTML = items.map((it, i) =>
      `<div class="item" data-i="${i}"><b>${i + 1}</b>${it.label}<small>${it.desc || ''}</small></div>`).join('');
    this.el.radioItems.querySelectorAll('.item').forEach(d => d.onclick = () => this.radioAction(+d.dataset.i));
    this.el.radio.style.display = 'block';
    this.setMenuOpen('radio');
    this.ctx.audio.radioBeep();
  }
  closeRadio() {
    this.el.radio.style.display = 'none';
    if (this.menuOpen === 'radio') this.setMenuOpen(null);
  }
  radioAction(i) {
    const it = this.radioItems[i];
    this.closeRadio();
    if (it) it.cb();
  }

  // ---------- map ----------
  openMap() {
    this.el.map.style.display = 'flex';
    this.setMenuOpen('map');
    this._renderMap();
  }
  closeMap() {
    this.el.map.style.display = 'none';
    if (this.menuOpen === 'map') this.setMenuOpen(null);
  }
  _renderMap() {
    const ctx = this.ctx;
    const cv = this.el.mapCanvas;
    const g = cv.getContext('2d');
    const S = cv.width;
    const scale = S / 6400;
    const px = (x) => S / 2 + x * scale;
    const pz = (z) => S / 2 + z * scale;
    // cached landmass
    if (!this._landCache) {
      const off = document.createElement('canvas');
      off.width = S; off.height = S;
      const og = off.getContext('2d');
      og.fillStyle = '#0a2233'; og.fillRect(0, 0, S, S);
      const N = 72, cell = S / N;
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          const wx = (i / N - 0.5) * 6400, wz = (j / N - 0.5) * 6400;
          const h = ctx.world.terrainHeight(wx, wz);
          if (h < 0.5) continue;
          const t = Math.min(1, h / 260);
          const r = Math.round(38 + t * 110), gg = Math.round(72 + t * 90), b = Math.round(40 + t * 100);
          og.fillStyle = h > 200 ? '#cfd8dd' : `rgb(${r},${gg},${b})`;
          og.fillRect(i * cell, j * cell, cell + 1, cell + 1);
        }
      }
      this._landCache = off;
    }
    g.drawImage(this._landCache, 0, 0);
    // roads
    g.strokeStyle = 'rgba(230,220,190,.75)';
    g.lineWidth = 1.6;
    for (const road of ctx.world.roads) {
      g.beginPath();
      road.pts.forEach(([x, z], i) => i === 0 ? g.moveTo(px(x), pz(z)) : g.lineTo(px(x), pz(z)));
      g.stroke();
    }
    // city + runway
    const cr = ctx.world.cityRect;
    if (cr) { g.fillStyle = 'rgba(200,200,200,.5)'; g.fillRect(px(cr.x0), pz(cr.z0), (cr.x1 - cr.x0) * scale, (cr.z1 - cr.z0) * scale); }
    const rw = ctx.config.sites.airport.runway;
    g.strokeStyle = '#c8c8c8'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(px(rw.x0), pz(rw.z0)); g.lineTo(px(rw.x1), pz(rw.z1)); g.stroke();
    // region labels
    g.font = '10px monospace';
    g.textAlign = 'center';
    for (const r of ctx.config.regions) {
      g.fillStyle = 'rgba(232,226,212,.85)';
      g.fillText(r.name.toUpperCase(), px(r.x), pz(r.z) - 6);
    }
    // palace marker
    g.fillStyle = '#d8b04a';
    g.beginPath(); g.arc(px(0), pz(0), 5, 0, 7); g.fill();
    // deployments
    g.fillStyle = '#7fc97f';
    for (const d of ctx.npcs.deployments) {
      const r = ctx.config.regions.find(x => x.name === d.region);
      if (r) { g.fillRect(px(r.x) - 3, pz(r.z) + 4, 6, 6); }
    }
    // player arrow
    const p = ctx.player.position;
    const heading = -ctx.player.yaw;
    g.save();
    g.translate(px(p.x), pz(p.z));
    g.rotate(heading);
    g.fillStyle = '#ffd94a';
    g.beginPath();
    g.moveTo(0, -9); g.lineTo(6, 7); g.lineTo(0, 3); g.lineTo(-6, 7);
    g.closePath(); g.fill();
    g.restore();
  }

  // ---------- per-frame ----------
  update(dt) {
    const ctx = this.ctx;
    const p = ctx.player;
    this.el.hp.style.width = clamp(p.health, 0, 100) + '%';
    this.el.st.style.width = clamp(p.stamina, 0, 100) + '%';
    // crosshair spread + visibility
    const s = this._spread;
    this.el.cross.style.display = (p.vehicle || this.menuOpen || this.el.scope.style.display === 'block') ? 'none' : 'block';
    const q = (el, prop, v) => el.style[prop] = v + 'px';
    q(this.root.querySelector('#ch-t'), 'top', -s);
    q(this.root.querySelector('#ch-b'), 'bottom', -s);
    q(this.root.querySelector('#ch-l'), 'left', -s);
    q(this.root.querySelector('#ch-r'), 'right', -s);
    if (this._hitT > 0) { this._hitT -= dt; if (this._hitT <= 0) this.el.hitmark.style.opacity = 0; }
    if (this._dmgT > 0) {
      this._dmgT -= dt;
      if (this._dmgT <= 0) {
        const low = p.health < 35 ? `inset 0 0 130px rgba(160,20,25,${(1 - p.health / 35) * 0.45})` : 'inset 0 0 140px rgba(160,20,25,0)';
        this.el.vignette.style.boxShadow = low;
      }
    } else if (ctx.frame % 30 === 0) {
      this.el.vignette.style.boxShadow = p.health < 35 ? `inset 0 0 130px rgba(160,20,25,${(1 - p.health / 35) * 0.45})` : 'inset 0 0 140px rgba(160,20,25,0)';
    }
    // clock/location
    if (ctx.frame % 20 === 0) {
      this.el.clock.textContent = `DAY ${ctx.sky.day} — ${ctx.sky.timeString()}`;
      const room = ctx.world.roomAt(p.position.x, p.position.y, p.position.z);
      this.el.location.textContent = room || ctx.world.regionAt(p.position.x, p.position.z);
      if (!p.vehicle) this.setSpeedo(null);
    }
    // compass
    const headingDeg = ((-p.yaw * 180 / Math.PI) % 360 + 360) % 360;
    const xOff = -(headingDeg / 360) * 1440 - 1440 + 170 + 30;   // center current heading
    this.strip.style.transform = `translateX(${xOff}px)`;
    // subtitle timer
    if (this._subT > 0) {
      this._subT -= dt;
      if (this._subT <= 0) this.el.subtitle.style.display = 'none';
    }
    // notices decay
    for (let i = this._notices.length - 1; i >= 0; i--) {
      const n = this._notices[i];
      n.t -= dt;
      if (n.t < 0) { n.el.remove(); this._notices.splice(i, 1); }
      else if (n.t < 1) n.el.style.opacity = n.t;
    }
    // live map while open
    if (this.menuOpen === 'map' && ctx.frame % 15 === 0) this._renderMap();
  }
}
