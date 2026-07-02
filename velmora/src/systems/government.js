// State administration: national stats, standing orders, troop deployments,
// intelligence reports and decrees. Pure sandbox systems — no win condition,
// they exist to make the nation feel alive and obedient.
import { mulberry32, pick, randInt } from '../core/utils.js';

const ALERT_NAMES = ['STATE NORMAL', 'ELEVATED', 'MAXIMUM READINESS'];

const INTEL_TEMPLATES = [
  (r, c) => `Signals station in the ${pick(r, ['Northreach', 'Verdan', 'Coastal'])} sector intercepted routine ${pick(r, c.rivals)} naval chatter. Analysts assess no change to their posture.`,
  (r, c) => `An attaché of the ${pick(r, c.rivals)} requested a trade audience. The Foreign Ministry recommends ${pick(r, ['granting it', 'a polite delay', 'declining without comment'])}.`,
  (r, c) => `Border wardens report ${randInt(r, 2, 9)} smuggling attempts foiled this week along the eastern passes. Contraband: ${pick(r, ['textiles', 'unlicensed radios', 'liquor', 'counterfeit veld'])}.`,
  (r, c) => `Counter-intelligence closed surveillance file ${randInt(r, 100, 999)}-K. Subject cleared: an over-enthusiastic poet, not a foreign agent.`,
  (r, c) => `Harvest projections for Brenka Valley are up ${randInt(r, 3, 14)}%. The Agriculture Ministry credits the new irrigation decree.`,
  (r, c) => `Garrison inspectors rate Fort Karst readiness at ${randInt(r, 88, 99)}%. Deficiencies noted: ${pick(r, ['boot polish', 'radio batteries', 'mess hall morale', 'none'])}.`,
  (r, c) => `The ${pick(r, c.rivals)} conducted exercises ${randInt(r, 120, 400)}km off the Coastal Strand. Our air patrols observed at a professional distance.`,
  (r, c) => `Rail Ministry reports the Aurelgrad line ran at ${randInt(r, 96, 100)}% punctuality. The stationmaster requests a commendation.`,
];

const DECREES = [
  { name: 'National Parade Day', desc: 'Declare a day of parades in honour of the armed forces.', appr: +4 },
  { name: 'Double Rations Week', desc: 'Open the state granaries for a week of plenty.', appr: +6, cost: 40 },
  { name: 'Monument Programme', desc: 'Commission new statues of the Supreme Marshal in every square.', appr: +2, cost: 120 },
  { name: 'Curfew Drill', desc: 'Rehearse the civil defence curfew across Aurelgrad.', appr: -3 },
  { name: 'Veterans Pension Rise', desc: 'Increase pensions for veterans of the Unification.', appr: +5, cost: 90 },
  { name: 'Radio Symphony Nights', desc: 'State radio to broadcast symphonies every evening.', appr: +3 },
];

export class Government {
  constructor(ctx) {
    this.ctx = ctx;
    this.rng = mulberry32(ctx.config.seed + 1234);
    this.treasury = 2400;      // millions of veld
    this.manpower = 118000;
    this.fuel = 96;            // %
    this.approval = 78;
    this.alertLevel = 0;
    this.reports = [];
    this.decreesIssued = [];
    this._councilTimer = 0;
    this._advisorJob = null;
    this._hourAcc = 0;
    this.isOpen = false;
    this._buildDom();
    // a couple of starting reports
    this.generateReport();
    this.generateReport();

    ctx.events.on('npc-killed', ({ npc }) => {
      if (['citizen', 'servant', 'advisor', 'official'].includes(npc.role)) {
        this.approval = Math.max(5, this.approval - 2);
      }
    });
  }

  // ---------- simulation ----------
  update(dt) {
    const ctx = this.ctx;
    this._hourAcc += ctx.sky.daySpeed * dt;
    if (this._hourAcc >= 1) {
      this._hourAcc -= 1;
      const upkeep = ctx.npcs.deployments.length * 1.5 + this.alertLevel * 2;
      this.treasury += 6.5 - upkeep;
      this.fuel = Math.max(20, Math.min(100, this.fuel + (this.alertLevel ? -0.6 : 0.4)));
      this.approval += (74 - this.approval) * 0.02;
      if (this.isOpen) this._renderTab();
    }
    if (this._councilTimer > 0) {
      this._councilTimer -= dt;
      if (this._councilTimer <= 0) {
        ctx.npcs.dismissCouncil();
        ctx.hud.notify('WAR COUNCIL', 'The generals return to their duties.', 'mil');
      }
    }
    if (this._advisorJob) {
      const j = this._advisorJob;
      const d = Math.hypot(j.npc.pos.x - j.to.x, j.npc.pos.z - j.to.z);
      if (d < 1.4 && !j.arrived) {
        j.arrived = true;
        ctx.hud.subtitle(j.npc.name.toUpperCase(), pick(this.rng, [
          'You sent for me, Excellency. The ministries all report readiness.',
          'Supreme Marshal — the nation is calm, the treasury steady, the borders quiet.',
          'At your command, Excellency. Shall I brief you on the provinces?',
        ]));
        setTimeout(() => { if (j.npc.alive) { j.npc.seat = null; j.npc.setState('auto'); } }, 14000);
        this._advisorJob = null;
      }
    }
  }

  // ---------- actions ----------
  setAlert(level) {
    this.alertLevel = level;
    this.ctx.events.emit('alert', { level });
    this.ctx.hud.setAlert(level, ALERT_NAMES[level]);
    this.ctx.hud.notify('HIGH COMMAND', `National alert state set to ${ALERT_NAMES[level]}.`, level === 2 ? 'warn' : 'mil');
    this.ctx.audio.radioBeep();
  }
  cycleAlert() { this.setAlert((this.alertLevel + 1) % 3); }

  summonAdvisor() {
    const ctx = this.ctx;
    const desk = ctx.palaceData.officeDesk;
    const npc = ctx.npcs.nearestAlive({ x: desk.x, z: desk.z }, 400, n => n.role === 'advisor');
    if (!npc) { ctx.hud.notify('CHANCELLERY', 'No advisor available.', 'warn'); return; }
    npc.seat = { x: desk.x - 2.5, z: desk.z + 3.5, yaw: Math.PI * 0.9 };
    npc.setState('seat');
    this._advisorJob = { npc, to: npc.seat, arrived: false };
    ctx.hud.notify('CHANCELLERY', `${npc.name} has been summoned to your office.`, '');
  }

  warCouncil() {
    const ctx = this.ctx;
    ctx.npcs.gatherWarCouncil(ctx.palaceData.warRoomSeats);
    this._councilTimer = 180;
    ctx.hud.notify('WAR COUNCIL', 'The general staff is assembling in the War Room.', 'mil');
  }

  inspection() {
    const ctx = this.ctx;
    const pg = ctx.palaceData.paradeGround;
    ctx.npcs.lineupTroops(pg);
    ctx.hud.notify('GARRISON', 'Honour formation assembling on the parade ground for your inspection.', 'mil');
  }

  securityDrill() {
    const ctx = this.ctx;
    const p = ctx.player.position;
    const ang = Math.random() * Math.PI * 2;
    ctx.npcs.spawnHostileSquad(p.x + Math.cos(ang) * 70, p.z + Math.sin(ang) * 70, 4);
    ctx.hud.notify('SECURITY', 'Live security drill: simulated hostile team inserted nearby. Guards weapons-free.', 'warn');
  }

  addressNation() {
    this.approval = Math.min(99, this.approval + 3);
    this.ctx.hud.notify('STATE RADIO', 'Your address is broadcast across every square in Velmora. The crowds cheer.', '');
    this.ctx.audio.radioBeep();
  }

  deploy(regionName) {
    const ctx = this.ctx;
    const region = ctx.config.regions.find(r => r.name === regionName);
    if (!region) return;
    if (this.treasury < 25) { ctx.hud.notify('TREASURY', 'Insufficient funds for deployment.', 'warn'); return; }
    this.treasury -= 25;
    ctx.npcs.deploySquad(region);
    ctx.hud.notify('HIGH COMMAND', `Rifle squad deployed to ${region.name}.`, 'mil');
    this._renderTab();
  }

  generateReport() {
    const c = this.ctx.config.nation;
    const text = pick(this.rng, INTEL_TEMPLATES)(this.rng, c);
    this.reports.unshift({ day: this.ctx.sky ? this.ctx.sky.day : 1, time: this.ctx.sky ? this.ctx.sky.timeString() : '09:00', text });
    if (this.reports.length > 12) this.reports.pop();
  }

  issueDecree(i) {
    const d = DECREES[i];
    if (d.cost && this.treasury < d.cost) { this.ctx.hud.notify('TREASURY', 'Insufficient funds for this decree.', 'warn'); return; }
    if (d.cost) this.treasury -= d.cost;
    this.approval = Math.max(5, Math.min(99, this.approval + d.appr));
    this.decreesIssued.unshift(d.name);
    this.ctx.hud.notify('DECREE', `"${d.name}" enters into force by order of the Supreme Marshal.`, '');
    this._renderTab();
  }

  // ---------- panel DOM ----------
  _buildDom() {
    const el = document.createElement('div');
    el.id = 'gov';
    el.innerHTML = `
      <header>
        <h2>STATE ADMINISTRATION — GRAND REPUBLIC OF VELMORA</h2>
        <div class="close" id="gov-close">CLOSE [ESC]</div>
      </header>
      <nav id="gov-nav"></nav>
      <div class="body" id="gov-body"></div>`;
    document.body.appendChild(el);
    this.el = el;
    this.tabs = ['OVERVIEW', 'ORDERS', 'MILITARY', 'INTELLIGENCE', 'DECREES'];
    this.tab = 'OVERVIEW';
    const nav = el.querySelector('#gov-nav');
    for (const t of this.tabs) {
      const b = document.createElement('button');
      b.textContent = t;
      b.onclick = () => { this.tab = t; this._renderTab(); this.ctx.audio.uiClick(); };
      nav.appendChild(b);
    }
    el.querySelector('#gov-close').onclick = () => this.close();
  }

  open() {
    this.isOpen = true;
    this.el.style.display = 'flex';
    this.ctx.hud.setMenuOpen('gov');
    this.ctx.input.releaseLock();
    this._renderTab();
    this.ctx.audio.uiClick();
  }
  close() {
    this.isOpen = false;
    this.el.style.display = 'none';
    this.ctx.hud.setMenuOpen(null);
    this.ctx.input.requestLock();
  }

  _renderTab() {
    if (!this.isOpen) return;
    const nav = this.el.querySelectorAll('#gov-nav button');
    nav.forEach(b => b.classList.toggle('on', b.textContent === this.tab));
    const body = this.el.querySelector('#gov-body');
    const ctx = this.ctx;
    const esc = s => s.replace(/</g, '&lt;');
    if (this.tab === 'OVERVIEW') {
      const n = ctx.config.nation;
      body.innerHTML = `
        <div class="gov-grid">
          <div class="gov-card"><h4>THE NATION</h4>
            <div class="stat-row"><span>State</span><b>${n.name}</b></div>
            <div class="stat-row"><span>Capital</span><b>${n.capital}</b></div>
            <div class="stat-row"><span>Founded</span><b>${n.founded}</b></div>
            <div class="stat-row"><span>Head of State</span><b>You, ${n.ruler}</b></div>
            <div class="stat-row"><span>Day of Rule</span><b>${ctx.sky.day}</b></div>
          </div>
          <div class="gov-card"><h4>NATIONAL RESOURCES</h4>
            <div class="stat-row"><span>Treasury</span><b>${this.treasury.toFixed(0)}M veld</b></div>
            <div class="stat-row"><span>Military Manpower</span><b>${this.manpower.toLocaleString()}</b></div>
            <div class="stat-row"><span>Fuel Reserves</span><b>${this.fuel.toFixed(0)}%</b></div>
            <div class="stat-row"><span>Public Approval</span><b>${this.approval.toFixed(0)}%</b></div>
            <div class="stat-row"><span>Alert State</span><b>${ALERT_NAMES[this.alertLevel]}</b></div>
          </div>
          <div class="gov-card"><h4>ACTIVE OPERATIONS</h4>
            ${ctx.npcs.deployments.length === 0 ? '<p>No squads deployed. The garrison rests.</p>'
              : ctx.npcs.deployments.map(d => `<div class="dep-row"><span class="tag">ACTIVE</span> Rifle squad — ${esc(d.region)}</div>`).join('')}
          </div>
        </div>`;
    } else if (this.tab === 'ORDERS') {
      body.innerHTML = `<div class="gov-grid">
        <div class="gov-card"><h4>Summon an Advisor</h4><p>Call a minister to your office for a private briefing.</p><button data-act="advisor">SUMMON</button></div>
        <div class="gov-card"><h4>Convene the War Council</h4><p>The general staff assembles around the map table in the War Room.</p><button data-act="council">CONVENE</button></div>
        <div class="gov-card"><h4>Troop Inspection</h4><p>An honour formation assembles on the parade ground for your review.</p><button data-act="inspect">ORDER</button></div>
        <div class="gov-card"><h4>Address the Nation</h4><p>Broadcast a speech over state radio to every province.</p><button data-act="address">BROADCAST</button></div>
        <div class="gov-card"><h4>Security Drill</h4><p>Insert a simulated hostile team near your position to test the guard force.</p><button data-act="drill">AUTHORISE</button></div>
        <div class="gov-card"><h4>Alert State</h4><p>Current: <b>${ALERT_NAMES[this.alertLevel]}</b>. Raising alert arms the guard force and drains the treasury.</p><button data-act="alert">CYCLE ALERT</button></div>
      </div>`;
    } else if (this.tab === 'MILITARY') {
      body.innerHTML = `
        <div class="gov-card" style="margin-bottom:14px"><h4>DEPLOY RIFLE SQUAD — 25M veld</h4>
          <p>Six soldiers establish a patrol in the chosen region until recalled.</p>
          <div id="dep-btns">${ctx.config.regions.map(r => `<button class="gov-inline-btn" style="margin:3px" data-dep="${esc(r.name)}">${esc(r.name)}</button>`).join('')}</div>
        </div>
        <div class="gov-card"><h4>ACTIVE DEPLOYMENTS</h4>
          ${ctx.npcs.deployments.length === 0 ? '<p>None.</p>' : ctx.npcs.deployments.map((d, i) =>
            `<div class="dep-row"><span class="tag">ACTIVE</span> ${esc(d.region)} — since day ${d.since} <button class="gov-inline-btn" style="margin-left:auto" data-recall="${i}">RECALL</button></div>`).join('')}
        </div>`;
    } else if (this.tab === 'INTELLIGENCE') {
      body.innerHTML = `
        <button class="gov-inline-btn" id="new-intel" style="margin-bottom:14px">REQUEST FRESH REPORT</button>
        ${this.reports.map(r => `<div class="report"><h5>DIRECTORATE OF STATE INTELLIGENCE</h5><p>${esc(r.text)}</p><small>Day ${r.day}, ${r.time} — EYES OF THE MARSHAL ONLY</small></div>`).join('')}`;
    } else if (this.tab === 'DECREES') {
      body.innerHTML = `<div class="gov-grid">
        ${DECREES.map((d, i) => `<div class="gov-card"><h4>${esc(d.name)}</h4><p>${esc(d.desc)}${d.cost ? ` Cost: ${d.cost}M veld.` : ''} Approval ${d.appr > 0 ? '+' : ''}${d.appr}%.</p><button data-decree="${i}">ISSUE DECREE</button></div>`).join('')}
        </div>
        ${this.decreesIssued.length ? `<div class="gov-card" style="margin-top:14px"><h4>IN FORCE</h4><p>${this.decreesIssued.map(esc).join(' · ')}</p></div>` : ''}`;
    }
    // wire actions
    body.querySelectorAll('[data-act]').forEach(b => b.onclick = () => {
      const a = b.dataset.act;
      if (a === 'advisor') this.summonAdvisor();
      if (a === 'council') this.warCouncil();
      if (a === 'inspect') this.inspection();
      if (a === 'address') this.addressNation();
      if (a === 'drill') { this.securityDrill(); this.close(); }
      if (a === 'alert') { this.cycleAlert(); this._renderTab(); }
      this.ctx.audio.uiClick();
    });
    body.querySelectorAll('[data-dep]').forEach(b => b.onclick = () => this.deploy(b.dataset.dep));
    body.querySelectorAll('[data-recall]').forEach(b => b.onclick = () => {
      const dep = ctx.npcs.deployments[+b.dataset.recall];
      if (dep) { ctx.npcs.recallDeployment(dep); ctx.hud.notify('HIGH COMMAND', 'Deployment recalled to Fort Karst.', 'mil'); }
      this._renderTab();
    });
    const ni = body.querySelector('#new-intel');
    if (ni) ni.onclick = () => { this.generateReport(); this._renderTab(); this.ctx.audio.uiClick(); };
  }
}
