// game/audio.js — fully procedural sound. No audio files: UI blips, war booms,
// thunder, ambient wind/rain/birds/crickets and a slow generative music pad
// are all synthesized with WebAudio at runtime.

import { G } from '../core/state.js';
import { on } from '../core/bus.js';
import { env } from '../gfx/scene.js';

let ctx = null;
let master, musicGain, sfxGain, ambGain;
let windSrc, windFilter, rainGain, started = false;
let musicTimer = null, birdTimer = null;

export const audioState = {
  volumes: JSON.parse(localStorage.getItem('sov:vol') || '{"master":0.8,"music":0.5,"sfx":0.8,"ambient":0.7}'),
  enabled: true,
};

export function saveVolumes() {
  localStorage.setItem('sov:vol', JSON.stringify(audioState.volumes));
  applyVolumes();
}

function applyVolumes() {
  if (!ctx) return;
  const v = audioState.volumes;
  master.gain.value = v.master;
  musicGain.gain.value = v.music * 0.5;
  sfxGain.gain.value = v.sfx;
  ambGain.gain.value = v.ambient;
}

/** Must be called from a user gesture (the menu's start button). */
export function initAudio() {
  if (started) return;
  started = true;
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
  master = ctx.createGain();
  master.connect(ctx.destination);
  musicGain = ctx.createGain(); musicGain.connect(master);
  sfxGain = ctx.createGain(); sfxGain.connect(master);
  ambGain = ctx.createGain(); ambGain.connect(master);
  applyVolumes();

  startWind();
  startRain();
  scheduleMusic();
  scheduleBirds();

  on('notify', (n) => sfx(n.kind === 'war' ? 'alarm' : n.kind === 'bad' ? 'low' : 'chime'));
  on('battle', () => { if (Math.random() < 0.4) sfx('shot'); });
  on('explosion', () => sfx('boom'));
  on('thunder', () => sfx('thunder'));
  on('war', () => sfx('alarm'));
  on('sfx', (name) => sfx(name));
  on('protest', () => sfx('crowd'));
  on('riot', () => sfx('crowd'));
}

// ------------------------------------------------------------------- sfx --

const noiseBuffer = () => {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
};
let _noise;

export function sfx(name) {
  if (!ctx || !audioState.enabled) return;
  const t = ctx.currentTime;
  const g = ctx.createGain();
  g.connect(sfxGain);
  const osc = (type, f0, f1, dur, vol = 0.3) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); o.start(t); o.stop(t + dur + 0.05);
  };
  const noise = (dur, vol, freq = 800, q = 1) => {
    _noise ||= noiseBuffer();
    const src = ctx.createBufferSource();
    src.buffer = _noise; src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = freq; f.Q.value = q;
    src.connect(f); f.connect(g);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.start(t); src.stop(t + dur + 0.05);
  };
  switch (name) {
    case 'click': osc('square', 720, 500, 0.06, 0.12); break;
    case 'open': osc('sine', 420, 660, 0.12, 0.15); break;
    case 'close': osc('sine', 560, 320, 0.1, 0.12); break;
    case 'chime': osc('sine', 880, 1320, 0.35, 0.16); break;
    case 'low': osc('sine', 300, 180, 0.4, 0.2); break;
    case 'coin': osc('square', 990, 1480, 0.12, 0.1); break;
    case 'alarm': osc('sawtooth', 520, 380, 0.5, 0.16); setTimeout(() => started && sfx('low'), 220); break;
    case 'boom': noise(1.2, 0.55, 220, 0.6); osc('sine', 90, 34, 1.1, 0.5); break;
    case 'shot': noise(0.16, 0.3, 1600, 0.5); break;
    case 'thunder': noise(2.4, 0.5, 160, 0.4); break;
    case 'build': noise(0.3, 0.25, 500, 1); osc('sine', 160, 90, 0.25, 0.25); break;
    case 'crowd': noise(2.2, 0.22, 900, 0.3); break;
    case 'research': osc('sine', 660, 1760, 0.6, 0.14); break;
  }
}

// ---------------------------------------------------------------- ambience --

function startWind() {
  _noise ||= noiseBuffer();
  windSrc = ctx.createBufferSource();
  windSrc.buffer = _noise; windSrc.loop = true;
  windFilter = ctx.createBiquadFilter();
  windFilter.type = 'lowpass'; windFilter.frequency.value = 300;
  const g = ctx.createGain(); g.gain.value = 0.06;
  windSrc.connect(windFilter); windFilter.connect(g); g.connect(ambGain);
  windSrc.start();
  windGainNode = g;
}
let windGainNode;

let rainSrc;
function startRain() {
  rainSrc = ctx.createBufferSource();
  rainSrc.buffer = _noise; rainSrc.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass'; f.frequency.value = 2200; f.Q.value = 0.4;
  rainGain = ctx.createGain(); rainGain.gain.value = 0;
  rainSrc.connect(f); f.connect(rainGain); rainGain.connect(ambGain);
  rainSrc.start();
}

function scheduleBirds() {
  birdTimer = setInterval(() => {
    if (!ctx || !audioState.enabled) return;
    const h = G.time?.hour ?? 12;
    const day = h > 5.5 && h < 20;
    const raining = env.weather === 'rain' || env.weather === 'storm';
    if (day && !raining && Math.random() < 0.5) chirp();
    if (!day && Math.random() < 0.6) cricket();
  }, 2600);
}

function chirp() {
  const t = ctx.currentTime;
  const g = ctx.createGain(); g.connect(ambGain);
  const o = ctx.createOscillator();
  o.type = 'sine';
  const base = 2100 + Math.random() * 1400;
  o.frequency.setValueAtTime(base, t);
  const hops = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < hops; i++) {
    o.frequency.setValueAtTime(base * (1 + Math.random() * 0.25), t + i * 0.09);
    o.frequency.exponentialRampToValueAtTime(base * 0.8, t + i * 0.09 + 0.06);
  }
  g.gain.setValueAtTime(0.05, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + hops * 0.09 + 0.1);
  o.connect(g); o.start(t); o.stop(t + hops * 0.09 + 0.15);
}

function cricket() {
  const t = ctx.currentTime;
  const g = ctx.createGain(); g.connect(ambGain);
  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.value = 4200 + Math.random() * 400;
  g.gain.setValueAtTime(0, t);
  for (let i = 0; i < 6; i++) {
    g.gain.setValueAtTime(0.018, t + i * 0.07);
    g.gain.setValueAtTime(0.0001, t + i * 0.07 + 0.035);
  }
  o.connect(g); o.start(t); o.stop(t + 0.5);
}

// ------------------------------------------------------------------- music --

const CHORDS = [
  [110, 130.8, 164.8], [98, 123.5, 146.8], [87.3, 110, 130.8], [130.8, 164.8, 196],
  [110, 138.6, 164.8], [123.5, 146.8, 185],
];
let chordIdx = 0;

function scheduleMusic() {
  playChord();
  musicTimer = setInterval(playChord, 8200);
}

function playChord() {
  if (!ctx || !audioState.enabled || audioState.volumes.music <= 0.01) return;
  const t = ctx.currentTime;
  // tension follows the state of the nation
  const tense = G.ready && (G.military.wars.length > 0 || (G.politics?.nationalUnrest || 0) > 0.4);
  chordIdx = (chordIdx + (Math.random() < 0.7 ? 1 : 2)) % CHORDS.length;
  const chord = CHORDS[tense ? (chordIdx % 2 === 0 ? 1 : 2) : chordIdx];
  for (const f of chord) {
    const o = ctx.createOscillator();
    o.type = Math.random() < 0.5 ? 'sine' : 'triangle';
    o.frequency.value = f * (Math.random() < 0.3 ? 2 : 1) * (tense ? 0.5 : 1);
    o.detune.value = (Math.random() - 0.5) * 9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 2.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 8);
    const f2 = ctx.createBiquadFilter();
    f2.type = 'lowpass'; f2.frequency.value = tense ? 500 : 900;
    o.connect(f2); f2.connect(g); g.connect(musicGain);
    o.start(t); o.stop(t + 8.4);
  }
}

/** Per-frame-ish ambience follow (called at low frequency). */
export function updateAudio() {
  if (!ctx) return;
  const wet = env.weather === 'rain' ? 0.16 : env.weather === 'storm' ? 0.26 : 0;
  rainGain.gain.linearRampToValueAtTime(wet, ctx.currentTime + 1.5);
  const wind = env.weather === 'storm' ? 0.14 : env.weather === 'snow' ? 0.1 : 0.05;
  windGainNode.gain.linearRampToValueAtTime(wind, ctx.currentTime + 2);
  windFilter.frequency.linearRampToValueAtTime(env.weather === 'storm' ? 500 : 280, ctx.currentTime + 2);
}
