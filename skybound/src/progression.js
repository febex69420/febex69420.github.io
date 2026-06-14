// progression.js — Hero Level / XP, Renown (city admiration), skill points, unlocks, stats.
// Pure (no THREE) so it is unit-testable and trivially serializable for saves.
import { clamp } from './core/util.js';

export const SKILLS = {
  power: { name: 'Power', desc: '+20% ability damage', max: 5 },
  energy: { name: 'Reserves', desc: '+20 energy & faster regen', max: 5 },
  flight: { name: 'Velocity', desc: '+12% top flight speed', max: 5 },
  slicing: { name: 'Edge', desc: 'Cleaner, stronger slices', max: 5 },
  vitality: { name: 'Vitality', desc: '+200 max health', max: 5 },
};

export function xpForLevel(level) { return Math.floor(80 * level * Math.pow(1.18, level - 1)); }

export class Progression {
  constructor() {
    this.level = 1; this.xp = 0; this.renown = 0; this.skillPoints = 0;
    this.skills = { power: 0, energy: 0, flight: 0, slicing: 0, vitality: 0 };
    this.stats = { saves: 0, sliced: 0, destroyed: 0, defeated: 0, distance: 0, maxCombo: 0, crowd: 0 };
    this.onLevelUp = null; this.onRenown = null;
  }
  get xpToNext() { return xpForLevel(this.level); }

  addXP(n) {
    this.xp += n;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext; this.level++; this.skillPoints++;
      if (this.onLevelUp) this.onLevelUp(this.level);
    }
  }
  addRenown(n) { this.renown = Math.max(0, this.renown + n); if (this.onRenown) this.onRenown(this.renown); }
  stat(key, n = 1) { if (this.stats[key] == null) this.stats[key] = 0; this.stats[key] += n; }
  setStatMax(key, v) { this.stats[key] = Math.max(this.stats[key] || 0, v); }

  upgrade(skill) {
    if (!SKILLS[skill] || this.skillPoints <= 0 || this.skills[skill] >= SKILLS[skill].max) return false;
    this.skills[skill]++; this.skillPoints--; return true;
  }

  // Derived multipliers consumed by gameplay systems.
  damageMul() { return 1 + this.skills.power * 0.2; }
  energyBonus() { return this.skills.energy * 20; }
  regenMul() { return 1 + this.skills.energy * 0.15; }
  flightMul() { return 1 + this.skills.flight * 0.12; }
  slicingMul() { return 1 + this.skills.slicing * 0.15; }
  healthBonus() { return this.skills.vitality * 200; }

  // Renown tiers (titles shown in HUD).
  tier() {
    const r = this.renown;
    if (r < 200) return 'Newcomer';
    if (r < 800) return 'Local Hero';
    if (r < 2500) return 'City Guardian';
    if (r < 7000) return 'Legend of Lumera';
    return 'Living Icon';
  }

  serialize() { return { level: this.level, xp: this.xp, renown: this.renown, skillPoints: this.skillPoints, skills: this.skills, stats: this.stats }; }
  deserialize(s) {
    if (!s) return;
    this.level = s.level || 1; this.xp = s.xp || 0; this.renown = s.renown || 0; this.skillPoints = s.skillPoints || 0;
    if (s.skills) Object.assign(this.skills, s.skills);
    if (s.stats) Object.assign(this.stats, s.stats);
  }
}
