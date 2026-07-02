// Fully procedural WebAudio engine — every sound is synthesised, no assets.
// 3D positioning is approximated with distance gain + stereo pan vs the listener.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfx = null;
    this.amb = null;
    this.volume = 0.8;
    this.listener = { x: 0, y: 0, z: 0, yaw: 0 };
    this.loops = [];          // ambient loops
    this.birdTimer = 2;
    this.rainLevel = 0;
    this.enabled = false;
  }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    this.sfx = this.ctx.createGain(); this.sfx.connect(this.master);
    this.amb = this.ctx.createGain(); this.amb.gain.value = 0.5; this.amb.connect(this.master);
    this._noiseBuf = this._makeNoise(2);
    this._startWind();
    this._startRain();
    this.enabled = true;
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
  setListener(x, y, z, yaw) { this.listener.x = x; this.listener.y = y; this.listener.z = z; this.listener.yaw = yaw; }

  _makeNoise(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // distance/pan for a world position; returns null if inaudible
  _spatial(x, y, z, range) {
    const dx = x - this.listener.x, dy = (y ?? this.listener.y) - this.listener.y, dz = z - this.listener.z;
    const d = Math.hypot(dx, dy, dz);
    if (d > range) return null;
    const gain = Math.pow(1 - d / range, 1.6);
    // pan: project onto listener's right vector
    const s = Math.sin(this.listener.yaw), c = Math.cos(this.listener.yaw);
    const rightX = c, rightZ = -s;
    const pan = d < 1 ? 0 : Math.max(-0.85, Math.min(0.85, (dx * rightX + dz * rightZ) / d));
    return { gain, pan };
  }

  _out(gainVal, pan = 0) {
    const g = this.ctx.createGain();
    g.gain.value = gainVal;
    if (Math.abs(pan) > 0.01 && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p); p.connect(this.sfx);
    } else {
      g.connect(this.sfx);
    }
    return g;
  }

  // ---------- one-shot SFX ----------
  shot(kind, x, y, z) {
    if (!this.ctx) return;
    const sp = (x === undefined) ? { gain: 1, pan: 0 } : this._spatial(x, y, z, 420);
    if (!sp) return;
    const t = this.ctx.currentTime;
    const P = {
      pistol: { dur: 0.14, f: 900, vol: 0.5, thump: 140 },
      rifle: { dur: 0.18, f: 700, vol: 0.6, thump: 110 },
      shotgun: { dur: 0.3, f: 420, vol: 0.85, thump: 70 },
      sniper: { dur: 0.4, f: 500, vol: 0.9, thump: 60 },
      lmg: { dur: 0.16, f: 620, vol: 0.55, thump: 95 },
      rocket: { dur: 0.5, f: 300, vol: 0.7, thump: 50 },
    }[kind] || { dur: 0.15, f: 800, vol: 0.5, thump: 120 };
    // crack: filtered noise burst
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.playbackRate.value = 1 + Math.random() * 0.2;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.setValueAtTime(P.f * 6, t); f.frequency.exponentialRampToValueAtTime(P.f, t + P.dur);
    const g = this._out(0, sp.pan);
    g.gain.setValueAtTime(P.vol * sp.gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + P.dur);
    src.connect(f); f.connect(g);
    src.start(t); src.stop(t + P.dur + 0.05);
    // body thump
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(P.thump, t);
    o.frequency.exponentialRampToValueAtTime(40, t + P.dur * 1.4);
    const og = this._out(0, sp.pan);
    og.gain.setValueAtTime(P.vol * 0.8 * sp.gain, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + P.dur * 1.4);
    o.connect(og); o.start(t); o.stop(t + P.dur * 1.5);
  }

  explosion(x, y, z, big = 1) {
    if (!this.ctx) return;
    const sp = this._spatial(x, y, z, 900);
    if (!sp) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.playbackRate.value = 0.4;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(60, t + 1.4 * big);
    const g = this._out(0, sp.pan);
    g.gain.setValueAtTime(1.1 * sp.gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.5 * big);
    src.connect(f); f.connect(g);
    src.start(t); src.stop(t + 1.6 * big);
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(28, t + 1.2 * big);
    const og = this._out(0, sp.pan);
    og.gain.setValueAtTime(0.9 * sp.gain, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 1.3 * big);
    o.connect(og); o.start(t); o.stop(t + 1.4 * big);
  }

  impact(x, y, z) {
    if (!this.ctx) return;
    const sp = this._spatial(x, y, z, 90);
    if (!sp) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.playbackRate.value = 1.6;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = 1800;
    const g = this._out(0.18 * sp.gain, sp.pan);
    g.gain.setValueAtTime(0.18 * sp.gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    src.connect(f); f.connect(g);
    src.start(t); src.stop(t + 0.1);
  }

  reload() { this._click(700, 0.06, 0.25); setTimeout(() => this._click(500, 0.05, 0.2), 160); setTimeout(() => this._click(900, 0.07, 0.3), 380); }
  uiClick() { this._click(1200, 0.03, 0.12); }
  radioBeep() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 2; i++) {
      const o = this.ctx.createOscillator();
      o.type = 'square'; o.frequency.value = 1100 + i * 200;
      const g = this._out(0.08);
      g.gain.setValueAtTime(0.08, t + i * 0.12);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.08);
      o.connect(g); o.start(t + i * 0.12); o.stop(t + i * 0.12 + 0.1);
    }
  }
  _click(freq, dur, vol) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'square'; o.frequency.value = freq;
    const g = this._out(vol);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); o.start(t); o.stop(t + dur + 0.02);
  }

  footstep(running) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.3;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = running ? 500 : 350;
    const v = running ? 0.12 : 0.07;
    const g = this._out(v);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    src.connect(f); f.connect(g);
    src.start(t); src.stop(t + 0.1);
  }

  thunder() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + Math.random() * 0.5;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.playbackRate.value = 0.25;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(50, t + 3);
    const g = this._out(0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.1);
    g.gain.exponentialRampToValueAtTime(0.001, t + 3.2);
    src.connect(f); f.connect(g);
    src.start(t); src.stop(t + 3.4);
  }

  // ---------- vehicle engine loops ----------
  createEngine(kind) {
    if (!this.ctx) return { update: () => {}, stop: () => {} };
    const ctx = this.ctx;
    const g = ctx.createGain(); g.gain.value = 0;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) { g.connect(pan); pan.connect(this.sfx); } else g.connect(this.sfx);
    const nodes = [];
    const mk = (type, freq, vol) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
      const og = ctx.createGain(); og.gain.value = vol;
      o.connect(og); og.connect(g); o.start();
      nodes.push(o);
      return o;
    };
    let o1, o2, chopGain, noiseSrc;
    if (kind === 'heli') {
      noiseSrc = ctx.createBufferSource();
      noiseSrc.buffer = this._noiseBuf; noiseSrc.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
      chopGain = ctx.createGain(); chopGain.gain.value = 0;
      noiseSrc.connect(f); f.connect(chopGain); chopGain.connect(g);
      noiseSrc.start();
      const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 12;
      const lg = ctx.createGain(); lg.gain.value = 0.5;
      lfo.connect(lg); lg.connect(chopGain.gain);
      nodes.push(lfo); lfo.start();
      o1 = { frequency: lfo.frequency };
      o2 = mk('sawtooth', 60, 0.3);
    } else if (kind === 'jet') {
      noiseSrc = ctx.createBufferSource();
      noiseSrc.buffer = this._noiseBuf; noiseSrc.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.6;
      const ng = ctx.createGain(); ng.gain.value = 0.9;
      noiseSrc.connect(f); f.connect(ng); ng.connect(g);
      noiseSrc.start();
      o1 = f; o2 = mk('sawtooth', 90, 0.15);
    } else {
      o1 = mk('sawtooth', 60, 0.5);
      o2 = mk('square', 30, 0.3);
    }
    const self = this;
    return {
      update(rpm, x, y, z) {   // rpm 0..1
        const sp = self._spatial(x, y, z, kind === 'jet' ? 1600 : 700);
        const target = sp ? sp.gain * (0.1 + rpm * 0.4) : 0;
        g.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
        if (pan && sp) pan.pan.setTargetAtTime(sp.pan, ctx.currentTime, 0.1);
        if (kind === 'heli') {
          o1.frequency.setTargetAtTime(8 + rpm * 14, ctx.currentTime, 0.2);
          o2.frequency.setTargetAtTime(50 + rpm * 60, ctx.currentTime, 0.2);
        } else if (kind === 'jet') {
          o1.frequency.setTargetAtTime(500 + rpm * 2200, ctx.currentTime, 0.3);
          o2.frequency.setTargetAtTime(70 + rpm * 160, ctx.currentTime, 0.3);
        } else {
          o1.frequency.setTargetAtTime(45 + rpm * 190, ctx.currentTime, 0.08);
          o2.frequency.setTargetAtTime(22 + rpm * 95, ctx.currentTime, 0.08);
        }
      },
      stop() {
        g.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
        setTimeout(() => { for (const n of nodes) { try { n.stop(); } catch (e) {} } try { noiseSrc?.stop(); } catch (e) {} }, 600);
      },
    };
  }

  // ---------- ambient beds ----------
  _startWind() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 320;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0.05;
    src.connect(f); f.connect(this.windGain); this.windGain.connect(this.amb);
    src.start();
    // slow wander
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lg = ctx.createGain(); lg.gain.value = 0.02;
    lfo.connect(lg); lg.connect(this.windGain.gain); lfo.start();
  }
  _startRain() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuf; src.loop = true; src.playbackRate.value = 1.4;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 900;
    this.rainGain = ctx.createGain(); this.rainGain.gain.value = 0;
    src.connect(f); f.connect(this.rainGain); this.rainGain.connect(this.amb);
    src.start();
  }
  _bird() {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    const base = 2200 + Math.random() * 1600;
    o.frequency.setValueAtTime(base, t);
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      o.frequency.setValueAtTime(base + Math.random() * 500, t + i * 0.09);
      o.frequency.exponentialRampToValueAtTime(base - 300, t + i * 0.09 + 0.06);
    }
    const g = this.ctx.createGain();
    g.gain.value = 0.015 + Math.random() * 0.015;
    g.connect(this.amb);
    o.connect(g);
    o.start(t); o.stop(t + n * 0.09 + 0.1);
    setTimeout(() => g.disconnect(), (n * 0.09 + 0.3) * 1000);
  }

  update(dt, { night = 0, rain = 0, altitude = 0 } = {}) {
    if (!this.ctx) return;
    if (this.rainGain) this.rainGain.gain.setTargetAtTime(rain * 0.22, this.ctx.currentTime, 0.8);
    if (this.windGain) this.windGain.gain.setTargetAtTime(0.04 + altitude * 0.002 + rain * 0.03, this.ctx.currentTime, 0.8);
    this.birdTimer -= dt;
    if (this.birdTimer <= 0) {
      this.birdTimer = 1.5 + Math.random() * 5;
      if (night < 0.4 && rain < 0.4 && Math.random() < 0.7) this._bird();
    }
  }
}
