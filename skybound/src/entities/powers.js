// powers.js — PowerManager: energy pool, primary-mode selection (power wheel), and
// dispatch to the Optic Lance, ability kit, and vision systems. Exposes HUD-facing state.
import { LaserPower } from './power_laser.js';
import { AbilityPowers } from './power_combat.js';
import { Vision } from './vision.js';
import { clamp } from '../core/util.js';

export const PRIMARIES = [
  { id: 'optic', name: 'Optic Lance', desc: 'Laser eyes — sweep to slice', color: '#ff4030' },
  { id: 'melee', name: 'Power Strike', desc: 'Super-strength punch combo', color: '#ffd24a' },
  { id: 'pulse', name: 'Pulse Blast', desc: 'Hold to Overcharge', color: '#5ad0ff' },
];

export class PowerManager {
  constructor(ctx) {
    this.ctx = ctx;
    this.energy = 100; this.maxEnergy = 100; this.regen = 22;
    this.primaryIndex = 0;
    const sctx = Object.assign({}, ctx, { power: this });
    this.sctx = sctx;
    this.laser = new LaserPower(sctx);
    this.kit = new AbilityPowers(sctx);
    this.vision = new Vision(sctx);
    this.laserOn = false; this.thermalOn = false;
    this.wheelOpen = false;
  }
  // Allow late-binding of systems created after powers (combat, crowd, traffic, director).
  bind(systems) { Object.assign(this.ctx, systems); Object.assign(this.sctx, systems); }

  get primary() { return PRIMARIES[this.primaryIndex].id; }
  consume(a) {
    if (this.ctx.settings.get('infiniteEnergy')) return true;
    if (this.energy < a) return false;
    this.energy -= a; return true;
  }
  cyclePrimary(d) { this.primaryIndex = (this.primaryIndex + d + PRIMARIES.length) % PRIMARIES.length; if (this.ctx.audio) this.ctx.audio.ui(); }

  update(dt) {
    const input = this.ctx.input;
    // energy
    if (this.ctx.settings.get('infiniteEnergy')) this.energy = this.maxEnergy;
    else this.energy = clamp(this.energy + this.regen * dt, 0, this.maxEnergy);

    // primary selection
    this.wheelOpen = input.down_('powerWheel');
    if (input.pressed('prim1')) this.primaryIndex = 0;
    if (input.pressed('prim2')) this.primaryIndex = 1;
    if (input.pressed('prim3')) this.primaryIndex = 2;
    if (input.pressed('nextPower')) this.cyclePrimary(1);
    if (input.pressed('prevPower')) this.cyclePrimary(-1);

    // ---- primary fire (Left Mouse) ----
    const fireDown = input.down_('laser');
    const firePressed = input.pressed('laser');
    const fireReleased = input.released('laser');

    if (this.kit.held && firePressed) {
      this.kit._throw();
    } else {
      const prim = this.primary;
      // optic
      if (prim === 'optic') {
        if (fireDown && !this.laserOn) { this.laserOn = true; this.laser.startOptic(); }
        if (this.laserOn) {
          if (!this.consume(14 * dt)) { fireReleased; this.laserOn = false; this.laser.stopOptic(); }
        }
        if (!fireDown && this.laserOn) { this.laserOn = false; this.laser.stopOptic(); }
      } else if (this.laserOn) { this.laserOn = false; this.laser.stopOptic(); }

      // melee
      if (prim === 'melee' && firePressed) this.kit.punch();

      // pulse
      if (prim === 'pulse') {
        if (fireDown) this.kit.pulseCharge = clamp(this.kit.pulseCharge + dt, 0, 1.5);
        if (fireReleased && this.kit.pulseCharge >= 0) this.kit.releasePulse();
      }
    }

    // ---- thermal vision beam (Right Mouse) ----
    const thermalDown = input.down_('thermal');
    if (thermalDown && !this.thermalOn) { this.thermalOn = true; this.laser.startThermal(); }
    if (this.thermalOn) { if (!this.consume(18 * dt)) { this.thermalOn = false; this.laser.stopThermal(); } }
    if (!thermalDown && this.thermalOn) { this.thermalOn = false; this.laser.stopThermal(); }

    // subsystems
    this.laser.update(dt);
    this.kit.update(dt);
    this.vision.update(dt);
  }

  hudState() {
    return {
      energy: this.energy, maxEnergy: this.maxEnergy,
      primary: PRIMARIES[this.primaryIndex], primaries: PRIMARIES,
      pulseCharge: this.kit.pulseCharge, combo: this.kit.comboCount,
      holding: !!this.kit.held, wheelOpen: this.wheelOpen,
      laser: this.laserOn, thermal: this.thermalOn, xray: this.vision.xray,
    };
  }
  reset() { this.kit.reset(); if (this.laserOn) { this.laser.stopOptic(); this.laserOn = false; } }
}
