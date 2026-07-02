// NPCManager: populates the nation, LOD-throttles AI updates, routes world
// events (gunfire, explosions) to role-appropriate reactions, and provides
// dialogue + crowd orchestration (war councils, parades, deployments).
import * as THREE from 'three';
import { NPC } from './npc.js';
import { mulberry32, personName, officerName, pick, dist2D } from '../core/utils.js';

const LINES = {
  guard: ['Sector clear, Supreme Marshal.', 'All quiet on this post, Excellency.', 'An honour to stand watch for you.', 'No unusual activity, Marshal.'],
  soldier: ['Ready to serve, Supreme Marshal!', 'The regiment stands at your command.', 'Fort Karst holds strong, Excellency.', 'For Velmora!'],
  officer: ['Discipline is excellent, Marshal.', 'The garrison awaits your inspection.', 'Morale has never been higher, Excellency.'],
  escort: ['Perimeter secured, Marshal.', 'We move when you move, Excellency.', 'Detail in position.'],
  servant: ['Your chambers are prepared, Excellency.', 'Shall I have the kitchen send something up?', 'The banquet hall has been polished twice today.', 'At your service, always.'],
  advisor: ['The treasury figures arrived this morning, Marshal.', 'The Ostrava Pact issued another statement — bluster, nothing more.', 'Aurelgrad approves of your leadership, Excellency.', 'The harvest in Brenka exceeds projections.'],
  official: ['The ministry runs smoothly, Excellency.', 'Paperwork, always paperwork, Marshal.', 'The provincial reports are on your desk.'],
  citizen: ['Long live the Supreme Marshal!', 'An honour to see you in person, Excellency!', 'The city has never looked finer.', 'My cousin serves at Fort Karst — a proud family, we are.', 'Fine weather over Aurelgrad today.'],
  hostile: ['...'],
};

export class NPCManager {
  constructor(ctx) {
    this.ctx = ctx;
    this.npcs = [];
    this.hostiles = [];
    this.deployments = [];
    this._frame = 0;
    this.rng = mulberry32(ctx.config.seed + 900);

    ctx.events.on('noise', e => this._onNoise(e));
    ctx.events.on('explosion', e => this._onNoise({ x: e.x, z: e.z, severity: 2.5, kind: 'explosion' }));
    ctx.events.on('npc-killed', ({ npc }) => {
      if (npc.role === 'hostile') {
        const i = this.hostiles.indexOf(npc);
        if (i >= 0) this.hostiles.splice(i, 1);
        if (this.hostiles.length === 0) this.ctx.hud.notify('SECURITY', 'Hostile drill contacts neutralised. Area secure.', 'mil');
      } else {
        this._onNoise({ x: npc.pos.x, z: npc.pos.z, severity: 2, kind: 'casualty' });
      }
    });
  }

  spawn(role, x, z, opts = {}) {
    const npc = new NPC(this.ctx, role, x, z, { name: personName(this.rng), ...opts });
    this.npcs.push(npc);
    return npc;
  }

  populate({ palace, military }) {
    const ctx = this.ctx;
    const P = ctx.config.population;
    const rng = this.rng;

    // --- palace guards: static posts + patrol routes ---
    let gi = 0;
    for (const post of palace.posts) {
      this.spawn('guard', post.x, post.z, { post, yaw: post.yaw, y: post.y });
      gi++;
    }
    const patrolCount = P.palaceGuards - gi;
    for (let i = 0; i < patrolCount; i++) {
      const route = palace.patrolRoutes[i % palace.patrolRoutes.length];
      const start = route[i % route.length];
      const npc = this.spawn('guard', start.x + (rng() - 0.5) * 4, start.z + (rng() - 0.5) * 4, { route, speedMul: 1, y: start.y });
      npc.routeIdx = (i * 2) % route.length;
    }
    // keep NPC roaming lists on a single floor (no cross-floor beelines)
    const sameFloor = (spots, y) => spots.filter(s2 => Math.abs(s2.y - y) < 2);
    // --- servants ---
    for (let i = 0; i < P.servants; i++) {
      const spot = palace.servantSpots[i % palace.servantSpots.length];
      this.spawn('servant', spot.x + (rng() - 0.5) * 3, spot.z + (rng() - 0.5) * 3,
        { wanderSpots: sameFloor(palace.servantSpots, spot.y), y: spot.y });
    }
    // --- advisors & officials ---
    for (let i = 0; i < P.advisors; i++) {
      const spot = palace.advisorSpots[i % palace.advisorSpots.length];
      this.spawn('advisor', spot.x, spot.z,
        { wanderSpots: sameFloor(palace.advisorSpots, spot.y), y: spot.y, name: 'Minister ' + officerName(rng) });
    }
    for (let i = 0; i < P.officials; i++) {
      const spot = palace.advisorSpots[(i * 3 + 1) % palace.advisorSpots.length];
      this.spawn('official', spot.x + 1, spot.z + 1,
        { wanderSpots: sameFloor(palace.advisorSpots, spot.y), y: spot.y });
    }
    // --- generals in the war room / command centre ---
    this.generals = [];
    for (let i = 0; i < P.generals; i++) {
      const seat = i < 4 ? palace.warRoomSeats[i * 2] : palace.commandSeats[(i - 4) * 2];
      const g = this.spawn('officer', seat.x, seat.z,
        { name: 'General ' + officerName(rng), wanderSpots: i < 4 ? palace.warRoomSeats : palace.commandSeats, y: seat.y });
      this.generals.push(g);
    }
    // --- city citizens ---
    const loops = ctx.world.cityLoops || [];
    for (let i = 0; i < P.cityCitizens; i++) {
      const route = loops[i % loops.length];
      const start = route[i % route.length];
      const npc = this.spawn('citizen', start.x + (rng() - 0.5) * 6, start.z + (rng() - 0.5) * 6, { route, speedMul: 0.8 + rng() * 0.6, y: start.y });
      npc.routeIdx = Math.floor(rng() * route.length);
    }
    // --- village ---
    const vloops = ctx.world.villageLoops || [];
    for (let i = 0; i < P.villageCitizens; i++) {
      const route = vloops[i % vloops.length];
      const npc = this.spawn('citizen', route[0].x, route[0].z, { route, speedMul: 0.7 + rng() * 0.5, y: route[0].y });
      npc.routeIdx = Math.floor(rng() * route.length);
    }
    // --- base soldiers ---
    let si = 0;
    for (const post of military.posts) { this.spawn('soldier', post.x, post.z, { post, yaw: post.yaw }); si++; }
    for (const spot of military.soldierSpots) {
      if (si >= P.baseSoldiers) break;
      this.spawn('soldier', spot.x, spot.z, { post: { x: spot.x, z: spot.z, yaw: 0 } });
      si++;
    }
    for (; si < P.baseSoldiers; si++) {
      const route = military.patrolRoutes[si % military.patrolRoutes.length];
      const npc = this.spawn('soldier', route[0].x, route[0].z, { route });
      npc.routeIdx = si % route.length;
    }
  }

  // ---------- events ----------
  _onNoise(e) {
    const sev = e.severity || 1;
    if (e.source === 'hostile' || e.source === 'guard') {
      // combat noise still frightens civilians but guards already know
    }
    let investigators = 0;
    for (const npc of this.npcs) {
      if (!npc.alive) continue;
      const d = dist2D(npc.pos.x, npc.pos.z, e.x, e.z);
      if (npc.armed) {
        // armed responders: investigate if it wasn't friendly range fire
        if (e.source !== 'guard' && e.source !== 'player-range' && d < 60 * sev && d > 8 && investigators < 3 && !npc.post && !this.ctx.escort.owns(npc) && npc.state !== 'engage') {
          npc.investigate = new THREE.Vector3(e.x, npc.pos.y, e.z);
          npc.setState('investigate');
          investigators++;
        }
      } else if (d < 70 * sev) {
        npc.fearTime = Math.max(npc.fearTime, 40 * sev);
        npc.avoid = new THREE.Vector3(e.x, npc.pos.y, e.z);
        if (d < 45 * sev && npc.state !== 'flee') npc.setState('flee');
      }
    }
  }

  // ---------- orchestration ----------
  gatherWarCouncil(seats) {
    let i = 0;
    for (const g of this.generals) {
      if (!g.alive) continue;
      g.seat = { x: seats[i % seats.length].x, z: seats[i % seats.length].z, yaw: i % 2 ? 0 : Math.PI };
      g.setState('seat');
      i++;
    }
  }
  dismissCouncil() {
    for (const g of this.generals) { if (g.alive) { g.seat = null; g.setState('auto'); } }
  }

  lineupTroops(center, n = 24) {
    const squad = [];
    for (let i = 0; i < n; i++) {
      const npc = this.spawn('soldier', center.x - 60 + (this.rng() - 0.5) * 10, center.z + 30 + (this.rng() - 0.5) * 10, {});
      npc.seat = {
        x: center.x - 22 + (i % 8) * 6,
        z: center.z - 8 + Math.floor(i / 8) * 5,
        yaw: Math.PI,
      };
      npc.setState('lineup');
      squad.push(npc);
    }
    this._parade = { squad, timer: 240 };
    return squad;
  }

  deploySquad(region) {
    const ctx = this.ctx;
    const soldiers = [];
    const cx = region.x, cz = region.z;
    const route = [];
    for (let a = 0; a < 4; a++) {
      const ang = (a / 4) * Math.PI * 2;
      const rx = cx + Math.cos(ang) * 40, rz = cz + Math.sin(ang) * 40;
      route.push(new THREE.Vector3(rx, ctx.world.groundHeight(rx, rz, 500), rz));
    }
    for (let i = 0; i < 6; i++) {
      const npc = this.spawn('soldier', cx + (this.rng() - 0.5) * 20, cz + (this.rng() - 0.5) * 20, { route });
      npc.routeIdx = i % route.length;
      soldiers.push(npc);
    }
    const dep = { region: region.name, soldiers, since: ctx.sky.day };
    this.deployments.push(dep);
    return dep;
  }
  recallDeployment(dep) {
    for (const s of dep.soldiers) { s.dispose(); const i = this.npcs.indexOf(s); if (i >= 0) this.npcs.splice(i, 1); }
    const i = this.deployments.indexOf(dep);
    if (i >= 0) this.deployments.splice(i, 1);
  }

  spawnHostileSquad(x, z, n = 4) {
    for (let i = 0; i < n; i++) {
      const hx = x + (this.rng() - 0.5) * 14, hz = z + (this.rng() - 0.5) * 14;
      const npc = this.spawn('hostile', hx, hz, { name: 'Drill Contact' });
      npc.target = 'player';
      npc.setState('engage');
      this.hostiles.push(npc);
    }
    this.ctx.events.emit('noise', { x, z, severity: 2, kind: 'alarm' });
  }

  talkTo(npc) {
    const lines = LINES[npc.role] || LINES.citizen;
    npc.talkTime = 3.5;
    npc.faceToward(this.ctx.player.position.x, this.ctx.player.position.z, 1);
    const title = npc.role === 'citizen' ? npc.name
      : npc.role === 'servant' ? npc.name + ', palace staff'
      : npc.name + ' — ' + npc.role.toUpperCase();
    return { speaker: title, text: pick(this.rng, lines) };
  }

  nearestAlive(pos, r, filter) {
    let best = null, bd = r;
    for (const npc of this.npcs) {
      if (!npc.alive || (filter && !filter(npc))) continue;
      const d = dist2D(npc.pos.x, npc.pos.z, pos.x, pos.z);
      if (d < bd) { bd = d; best = npc; }
    }
    return best;
  }

  // bullet vs NPC bodies. Returns {npc, dist, head} or null.
  raycastNPC(origin, dir, maxDist, ignore = null) {
    let best = null;
    const tmp = new THREE.Vector3();
    for (const npc of this.npcs) {
      if (!npc.alive || npc === ignore) continue;
      const p = npc.pos;
      const dx = p.x - origin.x, dz = p.z - origin.z;
      const approxD = Math.hypot(dx, dz);
      if (approxD > maxDist + 1) continue;
      // chest sphere
      tmp.set(p.x, p.y + 1.15, p.z);
      let t = tmp.sub(origin).dot(dir);
      if (t > 0 && t < maxDist) {
        const closest = new THREE.Vector3().copy(origin).addScaledVector(dir, t);
        const dd = closest.distanceTo(new THREE.Vector3(p.x, p.y + 1.15, p.z));
        if (dd < 0.5 && (!best || t < best.dist)) best = { npc, dist: t, head: false };
        const dh = closest.distanceTo(new THREE.Vector3(p.x, p.y + 1.62, p.z));
        if (dh < 0.28 && (!best || t <= best.dist)) best = { npc, dist: t, head: true };
      }
    }
    return best;
  }

  update(dt) {
    const ctx = this.ctx;
    this._frame++;
    const pp = ctx.player.position;
    const npcDist = ctx.qualityPreset.npcDist;

    // hostiles engage nearby armed friendlies too
    if (this._frame % 30 === 0 && this.hostiles.length) {
      for (const h of this.hostiles) {
        if (!h.alive) continue;
        const guard = this.nearestAlive(h.pos, 40, n => n.armed && n.role !== 'hostile');
        const dp = dist2D(h.pos.x, h.pos.z, pp.x, pp.z);
        if (guard && dist2D(h.pos.x, h.pos.z, guard.pos.x, guard.pos.z) < dp) h.target = guard;
        else h.target = 'player';
        // friendlies fight back
        if (guard && guard.state !== 'engage' && !ctx.escort.owns(guard)) {
          guard.target = h;
          guard.setState('engage');
        }
      }
    }

    for (let i = 0; i < this.npcs.length; i++) {
      const npc = this.npcs[i];
      const d = dist2D(npc.pos.x, npc.pos.z, pp.x, pp.z);
      // visibility LOD
      const vis = d < npcDist && (npc.alive || npc.deadTime < 16);
      if (npc.group.visible !== vis) npc.group.visible = vis;
      // update-rate LOD
      let rate = 1;
      if (d > 220) rate = 10;
      else if (d > 90) rate = 3;
      if ((this._frame + i) % rate !== 0) continue;
      npc.update(dt * rate, ctx);
    }

    // parade timeout
    if (this._parade) {
      this._parade.timer -= dt;
      if (this._parade.timer <= 0) {
        for (const s of this._parade.squad) { s.dispose(); const i = this.npcs.indexOf(s); if (i >= 0) this.npcs.splice(i, 1); }
        this._parade = null;
        ctx.hud.notify('GARRISON', 'Honour formation dismissed to quarters.', 'mil');
      }
    }
    // purge long-dead
    if (this._frame % 300 === 0) {
      for (let i = this.npcs.length - 1; i >= 0; i--) {
        const npc = this.npcs[i];
        if (!npc.alive && npc.deadTime > 17) { npc.dispose(); this.npcs.splice(i, 1); }
      }
    }
  }
}
