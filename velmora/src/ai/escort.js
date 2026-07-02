// The Marshal's personal protection detail: summonable soldier squad that
// rallies, forms up, follows, clears crowds, boards vehicles and returns fire.
import * as THREE from 'three';
import { dist2D } from '../core/utils.js';

const OFFSETS = [
  [2.4, 2.4], [-2.4, 2.4], [3.4, -0.6], [-3.4, -0.6],
  [2.2, -3.2], [-2.2, -3.2], [0, 4.2], [0, -4.6],
];

export class EscortSquad {
  constructor(ctx) {
    this.ctx = ctx;
    this.soldiers = [];
    this.active = false;
    this.phase = 'idle';        // idle | rally | follow | dismissing
    this.followVehicles = [];   // AI escort vehicles when the Marshal drives
  }

  owns(npc) { return this.soldiers.includes(npc); }

  toggle() {
    if (this.active) this.dismiss();
    else this.request();
  }

  request() {
    if (this.active) return;
    const ctx = this.ctx;
    const pp = ctx.player.position;
    // rally point: palace barracks if close, otherwise just off-screen behind the player
    const palaceD = dist2D(pp.x, pp.z, 0, 0);
    let sx, sz;
    if (palaceD < 380) { sx = ctx.palaceData.barracksSpawn.x; sz = ctx.palaceData.barracksSpawn.z; }
    else {
      const ang = Math.random() * Math.PI * 2;
      sx = pp.x + Math.cos(ang) * 60; sz = pp.z + Math.sin(ang) * 60;
    }
    for (let i = 0; i < ctx.config.escort.size; i++) {
      const npc = ctx.npcs.spawn('escort', sx + (Math.random() - 0.5) * 8, sz + (Math.random() - 0.5) * 8, {});
      npc.formationIdx = i;
      npc.setState('follow');
      this.soldiers.push(npc);
    }
    this.active = true;
    this.phase = 'rally';
    ctx.audio.radioBeep();
    ctx.hud.notify('PROTECTION DETAIL', 'Escort detail dispatched to your position, Supreme Marshal.', 'mil');
  }

  dismiss() {
    if (!this.active) return;
    const ctx = this.ctx;
    this.phase = 'dismissing';
    for (const s of this.soldiers) {
      if (!s.alive) continue;
      s.setState('salute');
      s.saluteCd = 0;
    }
    ctx.audio.radioBeep();
    ctx.hud.notify('PROTECTION DETAIL', 'Escort dismissed. Detail returning to barracks.', 'mil');
    // walk away then despawn
    const squad = this.soldiers;
    this.soldiers = [];
    this.active = false;
    this._retiring = { squad, timer: 26 };
    for (const v of this.followVehicles) v.retire = true;
    this.followVehicles = [];
  }

  update(dt) {
    const ctx = this.ctx;
    // retiring squad walks home and vanishes
    if (this._retiring) {
      const r = this._retiring;
      r.timer -= dt;
      for (const s of r.squad) {
        if (!s.alive) continue;
        if (s.state !== 'salute' || s.stateTime > 2.2) {
          s.setState('patrol');
          const home = ctx.palaceData.barracksSpawn;
          s.moveToward(home.x, home.z, dt, 3.6);
          if (dist2D(s.pos.x, s.pos.z, home.x, home.z) < 6) s.deadTime = 99; // reuse fade-out
        }
      }
      if (r.timer <= 0) {
        for (const s of r.squad) { s.dispose(); const i = ctx.npcs.npcs.indexOf(s); if (i >= 0) ctx.npcs.npcs.splice(i, 1); }
        this._retiring = null;
      }
    }
    if (!this.active) return;

    const player = ctx.player;
    const pp = player.position;
    const pv = player.vehicle;
    let allClose = true;
    let engaged = 0;

    for (const s of this.soldiers) {
      if (!s.alive) continue;
      const d = dist2D(s.pos.x, s.pos.z, pp.x, pp.z);

      // threats: half the squad may engage
      if (s.state !== 'engage' && engaged < 4 && ctx.npcs.hostiles.length) {
        const h = ctx.npcs.nearestAlive(s.pos, ctx.config.escort.engageRange, n => n.role === 'hostile');
        if (h) { s.target = h; s.setState('engage'); }
      }
      if (s.state === 'engage') {
        engaged++;
        if (!s.target || s.target === 'player' || !s.target.alive) { s.target = null; s.setState('follow'); }
        else continue;   // engage state handled inside NPC.update
      }
      if (s.state === 'salute') continue;

      if (pv) {
        // Marshal is driving: ride along (attach) or chase in escort vehicles
        if (pv.seatFor && pv.seatFor(s)) {
          continue; // seated — vehicle carries the NPC
        }
        // chase on foot only if very close, else rely on escort vehicles
        if (d > 12) { s.moveToward(pp.x, pp.z, dt, 8.5); }
        allClose = false;
        continue;
      }

      // formation slot rotated by player yaw
      const [ox, oz] = OFFSETS[s.formationIdx % OFFSETS.length];
      const cy = Math.cos(player.yaw), sy = Math.sin(player.yaw);
      const tx = pp.x + ox * cy - oz * sy;
      const tz = pp.z - ox * sy - oz * cy;
      const slotD = dist2D(s.pos.x, s.pos.z, tx, tz);

      if (d > ctx.config.escort.teleportDistance) {
        // regroup instantly out of sight
        s.pos.set(tx, ctx.world.groundHeight(tx, tz, pp.y + 2), tz);
      } else if (slotD > 0.5) {
        const speed = slotD > 14 ? 9 : slotD > 5 ? 6.4 : Math.min(4.4, slotD * 2.2);
        s.moveToward(tx, tz, dt, speed);
        if (slotD > 8) allClose = false;
      } else {
        s.faceToward(pp.x + -Math.sin(player.yaw) * 10, pp.z + -Math.cos(player.yaw) * 10, dt);
      }

      // clear the path: civilians nearby step aside
      if (ctx.frame % 20 === s.formationIdx) {
        const civ = ctx.npcs.nearestAlive(s.pos, 6, n => !n.armed && n.role !== 'servant');
        if (civ) civ.yield = 2;
      }
    }
    if (this.phase === 'rally' && allClose) {
      this.phase = 'follow';
      for (const s of this.soldiers) if (s.alive && s.state !== 'engage') { s.setState('salute'); s.saluteCd = 0; }
      ctx.hud.notify('PROTECTION DETAIL', 'Detail formed up. "We move when you move, Excellency."', 'mil');
    }

    // escort vehicles when the Marshal drives something without enough seats
    if (pv && this.followVehicles.length === 0 && pv.kind === 'car' && this.soldiers.some(s => s.alive && !(pv.seatFor && pv.seatFor(s)))) {
      this.followVehicles = ctx.vehicles.spawnEscortVehicles(pv, 2);
    }
    if (!pv && this.followVehicles.length) {
      for (const v of this.followVehicles) v.retire = true;
      this.followVehicles = [];
    }
    ctx.hud.setEscort(this.active, this.soldiers.filter(s => s.alive).length);
  }
}
