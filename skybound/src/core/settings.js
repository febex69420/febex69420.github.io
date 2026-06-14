// settings.js — settings model + graphics presets + persistence, and the save-slot system.
// All localStorage; namespaced under 'sb:'. Versioned with a light migration guard.

const LS_SETTINGS = 'sb:settings:v1';
const LS_SAVE_PREFIX = 'sb:save:';
const SAVE_VERSION = 1;

export const DEFAULT_SETTINGS = {
  // graphics
  preset: 'High',
  renderScale: 1.0,
  drawDistance: 1.0,      // multiplier on city LOD ranges
  shadows: true,
  bloom: true,
  weatherFX: true,
  npcDensity: 1.0,
  trafficDensity: 1.0,
  particleBudget: 1.0,
  // camera
  fov: 72,
  sensitivity: 1.0,
  invertY: false,
  shake: 1.0,
  speedFovBoost: true,
  // audio
  volMaster: 0.9, volSfx: 1.0, volMusic: 0.5, volUi: 0.8,
  // accessibility
  reduceMotion: false,
  photosensitiveSafe: false,
  colorblind: 'none',     // none | protan | deutan | tritan
  aimAssist: 0.5,
  uiScale: 1.0,
  showHints: true,
  subtitles: true,
  // gameplay / sandbox
  invulnerable: false,
  infiniteEnergy: false,
  consequences: false,    // collateral affects renown when true
  lockTime: false,
  // misc
  heroName: 'Meridian',
  bindings: null,         // set by input layer when rebound
};

// Quality presets tweak the perf-sensitive subset.
export const QUALITY_PRESETS = {
  Potato: { renderScale: 0.6, shadows: false, bloom: false, weatherFX: false, drawDistance: 0.55, npcDensity: 0.35, trafficDensity: 0.4, particleBudget: 0.4 },
  Low:    { renderScale: 0.75, shadows: false, bloom: true, weatherFX: true, drawDistance: 0.7, npcDensity: 0.55, trafficDensity: 0.6, particleBudget: 0.6 },
  Medium: { renderScale: 0.9, shadows: true, bloom: true, weatherFX: true, drawDistance: 0.85, npcDensity: 0.75, trafficDensity: 0.8, particleBudget: 0.8 },
  High:   { renderScale: 1.0, shadows: true, bloom: true, weatherFX: true, drawDistance: 1.0, npcDensity: 1.0, trafficDensity: 1.0, particleBudget: 1.0 },
  Ultra:  { renderScale: 1.0, shadows: true, bloom: true, weatherFX: true, drawDistance: 1.35, npcDensity: 1.4, trafficDensity: 1.3, particleBudget: 1.4 },
};

export class Settings {
  constructor() {
    this.data = Object.assign({}, DEFAULT_SETTINGS);
    this.listeners = new Set();
    this.load();
  }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _notify() { for (const fn of this.listeners) fn(this.data); }

  get(k) { return this.data[k]; }
  set(k, v) { this.data[k] = v; this.save(); this._notify(); }
  patch(obj) { Object.assign(this.data, obj); this.save(); this._notify(); }

  applyPreset(name) {
    const p = QUALITY_PRESETS[name];
    if (!p) return;
    Object.assign(this.data, p, { preset: name });
    this.save(); this._notify();
  }

  load() {
    try {
      const raw = localStorage.getItem(LS_SETTINGS);
      if (raw) Object.assign(this.data, JSON.parse(raw));
    } catch (_) { /* ignore */ }
  }
  save() {
    try { localStorage.setItem(LS_SETTINGS, JSON.stringify(this.data)); } catch (_) { /* ignore */ }
  }
  reset() { this.data = Object.assign({}, DEFAULT_SETTINGS); this.save(); this._notify(); }
}

// ----------------------------------------------------------------- saves ----
export const SaveSystem = {
  list() {
    const out = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(LS_SAVE_PREFIX)) {
          try {
            const d = JSON.parse(localStorage.getItem(key));
            out.push({ slot: key.slice(LS_SAVE_PREFIX.length), ...meta(d) });
          } catch (_) { /* skip corrupt */ }
        }
      }
    } catch (_) { /* ignore */ }
    out.sort((a, b) => (b.time || 0) - (a.time || 0));
    return out;
  },
  save(slot, state) {
    const payload = { version: SAVE_VERSION, time: Date.now(), state };
    try { localStorage.setItem(LS_SAVE_PREFIX + slot, JSON.stringify(payload)); return true; }
    catch (_) { return false; }
  },
  load(slot) {
    try {
      const raw = localStorage.getItem(LS_SAVE_PREFIX + slot);
      if (!raw) return null;
      const d = JSON.parse(raw);
      return migrate(d);
    } catch (_) { return null; }
  },
  delete(slot) { try { localStorage.removeItem(LS_SAVE_PREFIX + slot); } catch (_) { /* ignore */ } },
  exists(slot) { try { return localStorage.getItem(LS_SAVE_PREFIX + slot) != null; } catch (_) { return false; } },
};

function meta(d) {
  const s = (d && d.state) || {};
  return { time: d && d.time, name: s.heroName || 'Hero', level: s.level || 1, renown: s.renown || 0, version: d && d.version };
}

// Pure migration so it is testable: upgrades older save payloads to the current shape.
export function migrate(payload) {
  if (!payload || typeof payload !== 'object') return null;
  let p = payload;
  if (p.version == null) p = { version: 0, time: p.time || 0, state: p.state || p };
  // (room for version-by-version migrations as the schema evolves)
  if (p.version < SAVE_VERSION) p.version = SAVE_VERSION;
  return p;
}
