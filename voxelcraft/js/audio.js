// audio.js — WebAudio synthesis: all SFX + generative ambient music. No assets.
export class AudioEngine {
  constructor(game) {
    this.game = game;
    this.ctx = null;
    this.master = null; this.sfxGain = null; this.musicGain = null;
    this.rainNode = null;
    this.musicOn = true;
    this.nextNoteT = 0;
    this.volumes = { master: 0.8, sfx: 1.0, music: 0.5 };
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volumes.master;
      this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.volumes.sfx;
      this.sfxGain.connect(this.master);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.volumes.music;
      this.musicGain.connect(this.master);
      // simple feedback-delay "reverb" for music
      this.delay = this.ctx.createDelay(1);
      this.delay.delayTime.value = 0.45;
      const fb = this.ctx.createGain(); fb.gain.value = 0.35;
      this.delay.connect(fb); fb.connect(this.delay);
      this.delay.connect(this.musicGain);
      return true;
    } catch (e) { return false; }
  }

  setVolume(kind, v) {
    this.volumes[kind] = v;
    if (!this.ctx) return;
    if (kind === 'master') this.master.gain.value = v;
    if (kind === 'sfx') this.sfxGain.gain.value = v;
    if (kind === 'music') this.musicGain.gain.value = v;
  }

  // distance attenuation from optional world position
  gainFor(opts) {
    let g = opts.vol ?? 1;
    if (opts.pos && this.game.player) {
      const p = this.game.player.pos;
      const dx = opts.pos.x - p.x, dy = opts.pos.y - p.y, dz = opts.pos.z - p.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      g *= Math.max(0, 1 - d / 24);
    }
    return g;
  }

  // ---- primitive synth helpers ------------------------------------------------
  noiseBurst(dur, freq, q, gain, pitchDrop = 0) {
    const ctx = this.ctx, t = ctx.currentTime;
    const len = Math.max(1, (dur * ctx.sampleRate) | 0);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass'; filt.frequency.value = freq; filt.Q.value = q;
    if (pitchDrop) filt.frequency.linearRampToValueAtTime(Math.max(60, freq - pitchDrop), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filt); filt.connect(g); g.connect(this.sfxGain);
    src.start(t); src.stop(t + dur);
  }

  tone(type, freq, dur, gain, freqEnd, dest) {
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(dest || this.sfxGain);
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  }

  // ---- SFX --------------------------------------------------------------------
  play(name, opts = {}) {
    if (!this.ensure()) return;
    const v = this.gainFor(opts);
    if (v <= 0.01) return;
    const mat = name.startsWith('dig_') || name.startsWith('place_') || name.startsWith('step_')
      ? name.split('_').slice(1).join('_') : null;
    const kind = mat ? name.split('_')[0] : name;
    const r = (a, b) => a + Math.random() * (b - a);

    switch (kind) {
      case 'dig': this.matSound(mat, 0.18, v * 0.8); break;
      case 'place': this.matSound(mat, 0.12, v * 0.7); break;
      case 'step': this.matSound(mat, 0.07, v * 0.35); break;
      case 'hurt': this.tone('square', r(160, 200), 0.15, v * 0.25, 90); break;
      case 'hit': this.noiseBurst(0.08, 900, 2, v * 0.3); break;
      case 'eat': this.noiseBurst(0.09, r(400, 900), 3, v * 0.3); break;
      case 'burp': this.tone('sawtooth', 90, 0.25, v * 0.3, 60); break;
      case 'pop': this.tone('sine', r(500, 700), 0.09, v * 0.3, 1200); break;
      case 'click': this.noiseBurst(0.03, 2500, 4, v * 0.35); break;
      case 'break_tool': this.tone('square', 300, 0.2, v * 0.3, 80); break;
      case 'explosion':
        this.noiseBurst(0.8, 120, 0.7, v * 1.2, 60);
        this.tone('sine', 60, 0.7, v * 0.8, 25); break;
      case 'fuse': this.noiseBurst(1.2, 3000, 1.5, v * 0.25); break;
      case 'bow': this.tone('sine', 400, 0.12, v * 0.3, 700); this.noiseBurst(0.08, 1500, 2, v * 0.2); break;
      case 'arrow_hit': this.noiseBurst(0.06, 1200, 3, v * 0.3); break;
      case 'splash': this.noiseBurst(0.35, 800, 1, v * 0.5, 400); break;
      case 'fizz': this.noiseBurst(0.4, 2400, 1.2, v * 0.4); break;
      case 'thunder':
        this.noiseBurst(1.6, 100, 0.5, v * 1.1, 40);
        this.tone('sine', 50, 1.4, v * 0.7, 20); break;
      case 'door_open': this.noiseBurst(0.1, 500, 2.5, v * 0.4); this.tone('square', 140, 0.08, v * 0.12, 180); break;
      case 'door_close': this.noiseBurst(0.1, 400, 2.5, v * 0.4); this.tone('square', 180, 0.08, v * 0.12, 120); break;
      case 'portal': this.tone('sine', 100, 1.6, v * 0.4, 800); this.tone('sine', 150, 1.6, v * 0.3, 60); break;
      case 'level': this.tone('sine', 660, 0.4, v * 0.25, 880); break;
      // mob voices
      case 'zombie': this.tone('sawtooth', r(110, 150), 0.6, v * 0.22, 70); break;
      case 'zombie_hurt': this.tone('sawtooth', r(140, 180), 0.3, v * 0.25, 90); break;
      case 'zombie_death': this.tone('sawtooth', 130, 0.8, v * 0.25, 40); break;
      case 'skeleton': this.noiseBurst(0.2, r(700, 1100), 6, v * 0.25); break;
      case 'skeleton_hurt': case 'skeleton_death': this.noiseBurst(0.3, 900, 5, v * 0.3); break;
      case 'spider': this.noiseBurst(0.25, r(1800, 2400), 4, v * 0.22); break;
      case 'creeper': this.noiseBurst(0.15, r(600, 800), 5, v * 0.15); break;
      case 'pig': this.tone('square', r(240, 300), 0.18, v * 0.18, 180); break;
      case 'cow': this.tone('sawtooth', r(120, 160), 0.5, v * 0.2, 90); break;
      case 'sheep': this.tone('sawtooth', r(200, 260), 0.4, v * 0.18, 160); break;
      case 'chicken': this.tone('square', r(500, 700), 0.12, v * 0.15, 350); break;
      case 'villager': this.tone('sine', r(180, 260), 0.3, v * 0.2, 140); break;
      default:
        if (opts.fallback && opts.fallback !== name) this.play(opts.fallback, { ...opts, fallback: null });
        else this.noiseBurst(0.08, 800, 2, v * 0.25);
    }
  }

  matSound(mat, dur, vol) {
    switch (mat) {
      case 'stone': this.noiseBurst(dur, 500, 1.5, vol, 200); break;
      case 'wood': this.noiseBurst(dur, 280, 2.5, vol, 80); break;
      case 'grass': this.noiseBurst(dur, 900, 1, vol * 0.9); break;
      case 'sand': this.noiseBurst(dur * 1.2, 1400, 0.8, vol * 0.8); break;
      case 'gravel': this.noiseBurst(dur * 1.2, 700, 0.9, vol); break;
      case 'cloth': this.noiseBurst(dur, 600, 0.7, vol * 0.7); break;
      case 'glass': this.noiseBurst(dur, 2200, 3, vol); break;
      case 'snow': this.noiseBurst(dur, 1100, 0.8, vol * 0.7); break;
      default: this.noiseBurst(dur, 500, 1.5, vol);
    }
  }

  // ---- rain loop ----------------------------------------------------------------
  setRain(on, intensity = 1) {
    if (!this.ctx) { if (!on) return; if (!this.ensure()) return; }
    if (on && !this.rainNode) {
      const len = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = this.ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'highpass'; filt.frequency.value = 1200;
      const g = this.ctx.createGain();
      g.gain.value = 0.12 * intensity;
      src.connect(filt); filt.connect(g); g.connect(this.sfxGain);
      src.start();
      this.rainNode = { src, g };
    } else if (!on && this.rainNode) {
      try { this.rainNode.src.stop(); } catch (e) { }
      this.rainNode = null;
    } else if (on && this.rainNode) {
      this.rainNode.g.gain.value = 0.12 * intensity;
    }
  }

  // ---- generative music ----------------------------------------------------------
  // gentle pentatonic phrases; darker scale in the Nether
  updateMusic(dt, dim, daylight) {
    if (!this.ctx || !this.musicOn) return;
    this.nextNoteT -= dt;
    if (this.nextNoteT > 0) return;
    this.nextNoteT = 0.6 + Math.random() * 2.2;
    if (Math.random() < 0.35) return; // breathing room
    const overworld = [261.6, 293.7, 329.6, 392.0, 440.0, 523.3, 587.3];
    const nether = [233.1, 261.6, 277.2, 311.1, 349.2, 415.3];
    const night = [220.0, 246.9, 261.6, 329.6, 392.0];
    const scale = dim === 1 ? nether : (daylight < 0.4 ? night : overworld);
    const f = scale[(Math.random() * scale.length) | 0] * (Math.random() < 0.2 ? 0.5 : 1);
    const dur = 1.2 + Math.random() * 1.6;
    const g = 0.05 + Math.random() * 0.05;
    const o = this.tone(dim === 1 ? 'triangle' : 'sine', f, dur, g, null, this.delay);
    // soft fifth sometimes
    if (Math.random() < 0.3) this.tone('sine', f * 1.5, dur * 0.8, g * 0.5, null, this.delay);
  }
}
