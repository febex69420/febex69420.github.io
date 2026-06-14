// ui.js — HUD + menus (title/pause/settings/controls/saves/sandbox), notifications, and
// minimap. Builds its own DOM and injects CSS so index.html stays tiny. Reads game state
// each frame; writes settings & issues commands back through the `game` facade.
import { fmtInt, fmtTime, clamp } from './core/util.js';
import { QUALITY_PRESETS } from './core/settings.js';
import { DEFAULT_BINDINGS } from './core/input.js';
import { PRIMARIES } from './entities/powers.js';
import { SKILLS } from './progression.js';

const el = (tag, props = {}, kids = []) => {
  const n = document.createElement(tag);
  for (const k in props) {
    if (k === 'style') Object.assign(n.style, props[k]);
    else if (k === 'class') n.className = props[k];
    else if (k.startsWith('on')) n.addEventListener(k.slice(2).toLowerCase(), props[k]);
    else if (k === 'html') n.innerHTML = props[k];
    else n.setAttribute(k, props[k]);
  }
  for (const c of [].concat(kids)) if (c != null) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  return n;
};

const CSS = `
#sb-ui, #sb-ui * { font-family: 'Segoe UI', system-ui, sans-serif; box-sizing: border-box; }
#sb-ui { position: fixed; inset: 0; pointer-events: none; z-index: 10; color: #eaf2ff; }
#sb-ui .panel { pointer-events: auto; }
.sb-hud { position: absolute; text-shadow: 0 1px 3px rgba(0,0,0,.8); }
#sb-status { top: 14px; left: 16px; }
#sb-status .title { font-size: 22px; font-weight: 700; letter-spacing: .5px; }
#sb-status .tier { font-size: 12px; color: #9fd0ff; margin-bottom: 6px; }
.sb-bar { width: 230px; height: 12px; background: rgba(0,0,0,.45); border: 1px solid rgba(255,255,255,.25); border-radius: 7px; overflow: hidden; margin-top: 5px; }
.sb-bar > div { height: 100%; transition: width .12s linear; }
.sb-bar .hp { background: linear-gradient(90deg,#ff5b6e,#ff9a6e); }
.sb-bar .en { background: linear-gradient(90deg,#39c4ff,#7af7ff); }
.sb-bar .xp { background: linear-gradient(90deg,#ffd24a,#fff2a0); height: 6px; }
.sb-barlabel { font-size: 10px; opacity: .85; margin-top: 4px; letter-spacing: .5px; }
#sb-crosshair { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); width: 26px; height: 26px; }
#sb-crosshair .ring { position:absolute; inset:0; border:2px solid rgba(255,255,255,.8); border-radius:50%; }
#sb-crosshair .dot { position:absolute; top:50%; left:50%; width:4px;height:4px;margin:-2px; border-radius:50%; background:#fff; }
#sb-readout { right: 16px; top: 14px; text-align: right; font-variant-numeric: tabular-nums; }
#sb-readout .big { font-size: 26px; font-weight: 700; }
#sb-readout .sub { font-size: 12px; color: #bcd; }
#sb-primary { position:absolute; bottom: 22px; left: 50%; transform: translateX(-50%); display:flex; gap:10px; align-items:center; }
.sb-pchip { pointer-events:auto; padding:7px 14px; background: rgba(8,14,24,.62); border:1px solid rgba(255,255,255,.18); border-radius:10px; font-size:13px; font-weight:600; }
.sb-pchip.active { border-color:#7af7ff; box-shadow:0 0 14px rgba(90,210,255,.5); }
.sb-pchip small { display:block; font-weight:400; font-size:10px; opacity:.7; }
#sb-toasts { position:absolute; top: 86px; left:50%; transform:translateX(-50%); display:flex; flex-direction:column; gap:6px; align-items:center; width: 70%; }
.sb-toast { background: rgba(8,14,24,.78); border-left:3px solid #fff; padding:8px 16px; border-radius:6px; font-size:14px; font-weight:600; animation: sbfade 4s forwards; }
@keyframes sbfade { 0%{opacity:0; transform:translateY(-8px);} 8%{opacity:1; transform:none;} 80%{opacity:1;} 100%{opacity:0;} }
#sb-hint { position:absolute; bottom: 70px; left:50%; transform:translateX(-50%); font-size:12px; color:#bcd; background:rgba(0,0,0,.35); padding:5px 12px; border-radius:14px; }
#sb-mini { position:absolute; bottom: 16px; right: 16px; width:170px; height:170px; border-radius:10px; border:1px solid rgba(255,255,255,.2); background:rgba(6,10,18,.55); }
#sb-combo { position:absolute; top: 45%; right: 22%; font-size:30px; font-weight:800; color:#ffd24a; text-shadow:0 2px 8px rgba(0,0,0,.7); opacity:0; }
.sb-screen { position:absolute; inset:0; background: radial-gradient(circle at 50% 30%, rgba(20,40,80,.85), rgba(4,8,16,.96)); display:flex; flex-direction:column; align-items:center; justify-content:center; pointer-events:auto; gap: 14px; }
.sb-logo { font-size: 64px; font-weight: 800; letter-spacing: 3px; background: linear-gradient(90deg,#5ad0ff,#ffd24a); -webkit-background-clip:text; background-clip:text; color:transparent; }
.sb-logo small { display:block; font-size:16px; letter-spacing:6px; color:#9fd0ff; -webkit-text-fill-color:#9fd0ff; text-align:center; }
.sb-btn { pointer-events:auto; min-width: 280px; padding: 12px 18px; font-size: 16px; font-weight:600; color:#eaf2ff; background: rgba(30,50,90,.7); border:1px solid rgba(120,180,255,.4); border-radius:10px; cursor:pointer; }
.sb-btn:hover { background: rgba(50,80,140,.85); border-color:#7af7ff; }
.sb-btn.sm { min-width: auto; padding:8px 12px; font-size:13px; }
.sb-menu { background: rgba(8,14,26,.92); border:1px solid rgba(120,180,255,.35); border-radius:14px; padding:22px; width: min(720px, 92vw); max-height: 86vh; overflow:auto; pointer-events:auto; }
.sb-menu h2 { margin: 0 0 4px; font-size: 24px; }
.sb-menu h3 { margin: 16px 0 6px; font-size: 15px; color:#9fd0ff; border-bottom:1px solid rgba(255,255,255,.12); padding-bottom:4px; }
.sb-row { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:6px 0; font-size:14px; }
.sb-row input[type=range]{ width: 180px; }
.sb-row select, .sb-row input[type=text]{ background:#0e1626; color:#eaf2ff; border:1px solid #355; border-radius:6px; padding:6px; }
.sb-tabs { display:flex; gap:6px; flex-wrap:wrap; margin: 8px 0; }
.sb-tab { padding:6px 12px; border-radius:8px; background:rgba(255,255,255,.06); cursor:pointer; font-size:13px; }
.sb-tab.active { background:#2a4a80; }
.sb-key { background:#0e1626; border:1px solid #466; border-radius:6px; padding:4px 10px; font-size:12px; min-width:90px; text-align:center; cursor:pointer; }
.sb-key.bind { background:#664; }
.sb-grid { display:grid; grid-template-columns: 1fr 1fr; gap: 6px 18px; }
.sb-slot { display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background:rgba(255,255,255,.05); border-radius:8px; margin:4px 0; }
.sb-hide { display:none !important; }
`;

export class UI {
  constructor(ctx) {
    this.ctx = ctx; this.game = ctx.game;
    document.head.appendChild(el('style', { html: CSS }));
    this.root = el('div', { id: 'sb-ui' });
    document.body.appendChild(this.root);
    this._buildHUD();
    this.toasts = [];
    this.rebinding = false;
    this.hudVisible = false;
    this.mini = this.miniCanvas.getContext('2d');
    this.comboFlash = 0;
  }
  bind(systems) { Object.assign(this.ctx, systems); if (systems.game) this.game = systems.game; }

  _buildHUD() {
    this.status = el('div', { id: 'sb-status', class: 'sb-hud panel' }, [
      this.elTitle = el('div', { class: 'title' }, 'MERIDIAN'),
      this.elTier = el('div', { class: 'tier' }, 'Newcomer · Lv 1'),
      el('div', { class: 'sb-barlabel' }, 'HEALTH'),
      el('div', { class: 'sb-bar' }, [this.barHp = el('div', { class: 'hp', style: { width: '100%' } })]),
      el('div', { class: 'sb-barlabel' }, 'ENERGY'),
      el('div', { class: 'sb-bar' }, [this.barEn = el('div', { class: 'en', style: { width: '100%' } })]),
      el('div', { class: 'sb-bar', style: { marginTop: '8px' } }, [this.barXp = el('div', { class: 'xp', style: { width: '0%' } })]),
      this.elRenown = el('div', { class: 'sb-barlabel' }, 'Renown 0'),
    ]);
    this.crosshair = el('div', { id: 'sb-crosshair', class: 'sb-hud' }, [el('div', { class: 'ring' }), el('div', { class: 'dot' })]);
    this.readout = el('div', { id: 'sb-readout', class: 'sb-hud' }, [
      this.elSpeed = el('div', { class: 'big' }, '0'),
      el('div', { class: 'sub' }, 'km/h'),
      this.elAlt = el('div', { class: 'sub' }, 'ALT 0m'),
      this.elClock = el('div', { class: 'sub' }, '12:00 PM'),
      this.elCrowd = el('div', { class: 'sub' }, '👥 0'),
    ]);
    this.primary = el('div', { id: 'sb-primary' });
    this.toastBox = el('div', { id: 'sb-toasts' });
    this.hint = el('div', { id: 'sb-hint' }, 'WASD move · F fly · Shift boost · Hold LMB laser-slice · Space jump');
    this.combo = el('div', { id: 'sb-combo' }, '');
    this.miniCanvas = el('canvas', { id: 'sb-mini', width: 170, height: 170 });
    for (const n of [this.status, this.crosshair, this.readout, this.primary, this.toastBox, this.hint, this.combo, this.miniCanvas]) this.root.appendChild(n);
    this._buildPrimaryChips();
    this.showHUD(false);
  }
  _buildPrimaryChips() {
    this.primary.innerHTML = '';
    this.chips = PRIMARIES.map((p, i) => el('div', { class: 'sb-pchip', onclick: () => this.ctx.powers && (this.ctx.powers.primaryIndex = i) }, [document.createTextNode(p.name), el('small', {}, p.desc)]));
    for (const c of this.chips) this.primary.appendChild(c);
  }

  showHUD(v) {
    this.hudVisible = v;
    for (const n of [this.status, this.crosshair, this.readout, this.primary, this.hint, this.miniCanvas]) n.classList.toggle('sb-hide', !v);
  }

  notify(text, color = 0xffffff) {
    const hex = '#' + ('000000' + (color >>> 0).toString(16)).slice(-6);
    const t = el('div', { class: 'sb-toast', style: { borderLeftColor: hex } }, text);
    this.toastBox.appendChild(t);
    setTimeout(() => t.remove(), 4000);
    if (this.ctx.settings && !this.ctx.settings.get('subtitles')) t.style.opacity = '0.0';
  }

  flashCombo(n) { if (n >= 2) { this.combo.textContent = n + 'x'; this.comboFlash = 1; } }

  update(dt) {
    if (!this.hudVisible) return;
    const { hero, powers, progression, crowd, game } = this.ctx;
    if (hero) {
      this.barHp.style.width = clamp(hero.health / hero.maxHealth * 100, 0, 100) + '%';
      this.elSpeed.textContent = fmtInt(hero.speed * 3.6);
      this.elAlt.textContent = 'ALT ' + fmtInt(Math.max(0, hero.pos.y)) + 'm';
    }
    if (powers) {
      const st = powers.hudState();
      this.barEn.style.width = clamp(st.energy / st.maxEnergy * 100, 0, 100) + '%';
      this.chips.forEach((c, i) => c.classList.toggle('active', i === powers.primaryIndex));
      this.crosshair.querySelector('.ring').style.borderColor = st.primary.color;
      this.flashCombo(st.combo);
    }
    if (progression) {
      this.elTier.textContent = progression.tier() + ' · Lv ' + progression.level + (progression.skillPoints ? '  ★' + progression.skillPoints : '');
      this.barXp.style.width = clamp(progression.xp / progression.xpToNext * 100, 0, 100) + '%';
      this.elRenown.textContent = 'Renown ' + fmtInt(progression.renown);
    }
    if (crowd) this.elCrowd.textContent = '👥 ' + crowd.count;
    if (game) this.elClock.textContent = fmtTime(game.timeOfDay);
    if (this.comboFlash > 0) { this.comboFlash -= dt * 1.5; this.combo.style.opacity = clamp(this.comboFlash, 0, 1); }
    this._drawMini();
  }

  _drawMini() {
    const g = this.mini; if (!g) return;
    const { hero, director, combat, city } = this.ctx;
    const S = 170, c = S / 2, scale = 0.18;
    g.clearRect(0, 0, S, S);
    g.save(); g.translate(c, c); g.rotate(-(hero ? hero.camYaw : 0));
    // grid
    g.strokeStyle = 'rgba(120,160,220,.18)'; g.lineWidth = 1;
    for (let i = -3; i <= 3; i++) { const o = i * 74 * scale; g.beginPath(); g.moveTo(o, -c); g.lineTo(o, c); g.moveTo(-c, o); g.lineTo(c, o); g.stroke(); }
    const rel = (p) => ({ x: (p.x - hero.pos.x) * scale, y: (p.z - hero.pos.z) * scale });
    if (director) for (const e of director.activeEventPositions()) { const r = rel(e); g.fillStyle = '#ffcc33'; g.beginPath(); g.arc(r.x, r.y, 4, 0, 7); g.fill(); }
    if (combat) for (const e of combat.enemyPositions()) { const r = rel(e); g.fillStyle = '#ff4040'; g.beginPath(); g.arc(r.x, r.y, 3, 0, 7); g.fill(); }
    g.restore();
    // hero arrow (north-up minimap, hero fixed center)
    g.fillStyle = '#7af7ff'; g.beginPath(); g.moveTo(c, c - 7); g.lineTo(c - 5, c + 5); g.lineTo(c + 5, c + 5); g.closePath(); g.fill();
    g.fillStyle = '#9fd0ff'; g.font = '10px sans-serif'; g.fillText('N', c - 3, 12);
  }

  // ---------------------------------------------------------------- screens ----
  _overlay(menu) {
    const scr = el('div', { class: 'sb-screen panel' }, [menu]);
    this.root.appendChild(scr);
    return scr;
  }
  closeScreens() { this.root.querySelectorAll('.sb-screen').forEach((s) => s.remove()); }

  showTitle() {
    this.showHUD(false); this.closeScreens();
    const saves = this.ctx.save.list();
    const menu = el('div', { style: { textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '14px', alignItems: 'center' } }, [
      el('div', { class: 'sb-logo' }, [document.createTextNode('SKYBOUND'), el('small', {}, 'GUARDIAN OF LUMERA')]),
      el('div', { style: { color: '#bcd', marginBottom: '8px' } }, 'An original open-world superhero sandbox'),
      el('button', { class: 'sb-btn', onclick: () => this.game.newGame() }, 'New Game'),
      saves.length ? el('button', { class: 'sb-btn', onclick: () => this.showSaves('load') }, 'Continue / Load') : null,
      el('button', { class: 'sb-btn', onclick: () => this.showSettings() }, 'Settings'),
      el('button', { class: 'sb-btn', onclick: () => this.showControls() }, 'Controls'),
      el('div', { style: { fontSize: '11px', color: '#789', marginTop: '10px', maxWidth: '460px' } }, 'All characters, the city of Lumera, and abilities are original and procedurally generated. No third-party copyrighted content is used.'),
    ]);
    this._titleScreen = this._overlay(menu);
  }

  startGame() { this.closeScreens(); this.showHUD(true); }

  openPause() {
    this.closeScreens();
    const menu = el('div', { class: 'sb-menu', style: { textAlign: 'center', width: '340px' } }, [
      el('h2', {}, 'Paused'),
      el('button', { class: 'sb-btn', onclick: () => this.game.resume() }, 'Resume'),
      el('button', { class: 'sb-btn', onclick: () => this.showSkills() }, 'Skills ★ ' + (this.ctx.progression ? this.ctx.progression.skillPoints : 0)),
      el('button', { class: 'sb-btn', onclick: () => this.showSettings() }, 'Settings'),
      el('button', { class: 'sb-btn', onclick: () => this.showControls() }, 'Controls'),
      el('button', { class: 'sb-btn', onclick: () => this.showSaves('save') }, 'Save / Load'),
      el('button', { class: 'sb-btn', onclick: () => this.showSandbox() }, 'Sandbox Menu'),
      el('button', { class: 'sb-btn', onclick: () => this.game.quitToTitle() }, 'Quit to Title'),
    ]);
    this._overlay(menu);
  }

  showSettings() {
    this.closeScreens();
    const s = this.ctx.settings;
    const tabs = { Graphics: this._gfxTab(), Camera: this._camTab(), Audio: this._audioTab(), Accessibility: this._a11yTab(), Gameplay: this._gameTab() };
    const body = el('div');
    const tabBar = el('div', { class: 'sb-tabs' });
    let active;
    const sel = (name) => { body.innerHTML = ''; body.appendChild(tabs[name]); tabBar.querySelectorAll('.sb-tab').forEach((t) => t.classList.toggle('active', t.textContent === name)); active = name; };
    for (const name in tabs) tabBar.appendChild(el('div', { class: 'sb-tab', onclick: () => sel(name) }, name));
    const menu = el('div', { class: 'sb-menu' }, [el('h2', {}, 'Settings'), tabBar, body, el('div', { style: { marginTop: '14px', textAlign: 'right' } }, [el('button', { class: 'sb-btn sm', onclick: () => this._back() }, 'Back')])]);
    sel('Graphics');
    void active;
    this._overlay(menu);
  }
  _slider(label, key, min, max, step, fmt) {
    const s = this.ctx.settings; const val = el('span', {}, fmt ? fmt(s.get(key)) : s.get(key));
    return el('div', { class: 'sb-row' }, [document.createTextNode(label), el('div', {}, [
      el('input', { type: 'range', min, max, step, value: s.get(key), oninput: (e) => { const v = parseFloat(e.target.value); s.set(key, v); val.textContent = fmt ? fmt(v) : v; this.game.applySettings(); } }), document.createTextNode(' '), val,
    ])]);
  }
  _toggle(label, key) {
    const s = this.ctx.settings;
    return el('div', { class: 'sb-row' }, [document.createTextNode(label), el('input', { type: 'checkbox', ...(s.get(key) ? { checked: 'checked' } : {}), onchange: (e) => { s.set(key, e.target.checked); this.game.applySettings(); } })]);
  }
  _select(label, key, options) {
    const s = this.ctx.settings;
    const sel = el('select', { onchange: (e) => { s.set(key, e.target.value); this.game.applySettings(); } });
    for (const o of options) sel.appendChild(el('option', { value: o, ...(s.get(key) === o ? { selected: 'selected' } : {}) }, o));
    return el('div', { class: 'sb-row' }, [document.createTextNode(label), sel]);
  }
  _presetSelect() {
    const s = this.ctx.settings;
    const sel = el('select', { onchange: (e) => { if (QUALITY_PRESETS[e.target.value]) s.applyPreset(e.target.value); else s.set('preset', e.target.value); this.game.applySettings(); this.showSettings(); } });
    for (const o of Object.keys(QUALITY_PRESETS).concat(['Custom'])) sel.appendChild(el('option', { value: o, ...(s.get('preset') === o ? { selected: 'selected' } : {}) }, o));
    return el('div', { class: 'sb-row' }, [document.createTextNode('Quality preset'), sel]);
  }
  _gfxTab() {
    return el('div', {}, [
      this._presetSelect(),
      this._slider('Render scale', 'renderScale', 0.5, 1.0, 0.05),
      this._slider('Draw distance', 'drawDistance', 0.5, 1.5, 0.05),
      this._toggle('Shadows', 'shadows'),
      this._toggle('Bloom / glow', 'bloom'),
      this._toggle('Weather effects', 'weatherFX'),
      this._slider('NPC density', 'npcDensity', 0.2, 1.5, 0.05),
      this._slider('Traffic density', 'trafficDensity', 0.2, 1.5, 0.05),
    ]);
  }
  _camTab() {
    return el('div', {}, [
      this._slider('Field of view', 'fov', 60, 100, 1),
      this._slider('Look sensitivity', 'sensitivity', 0.3, 2.5, 0.05),
      this._toggle('Invert Y', 'invertY'),
      this._slider('Camera shake', 'shake', 0, 1.5, 0.05),
      this._toggle('Speed FOV boost', 'speedFovBoost'),
    ]);
  }
  _audioTab() {
    return el('div', {}, [
      this._slider('Master', 'volMaster', 0, 1, 0.02),
      this._slider('Effects', 'volSfx', 0, 1, 0.02),
      this._slider('Music', 'volMusic', 0, 1, 0.02),
      this._slider('UI', 'volUi', 0, 1, 0.02),
    ]);
  }
  _a11yTab() {
    return el('div', {}, [
      this._toggle('Reduce motion (no shake/flash)', 'reduceMotion'),
      this._toggle('Photosensitive-safe lightning', 'photosensitiveSafe'),
      this._select('Colorblind palette', 'colorblind', ['none', 'protan', 'deutan', 'tritan']),
      this._slider('Aim assist', 'aimAssist', 0, 1, 0.05),
      this._slider('UI scale', 'uiScale', 0.8, 1.4, 0.05),
      this._toggle('Show hints', 'showHints'),
      this._toggle('Subtitles / event banners', 'subtitles'),
    ]);
  }
  _gameTab() {
    return el('div', {}, [
      this._toggle('Invulnerable', 'invulnerable'),
      this._toggle('Infinite energy', 'infiniteEnergy'),
      this._toggle('Collateral consequences', 'consequences'),
      this._toggle('Lock time of day', 'lockTime'),
    ]);
  }

  showControls() {
    this.closeScreens();
    const input = this.ctx.input;
    const grid = el('div', { class: 'sb-grid' });
    const labels = {
      forward: 'Move Fwd', back: 'Move Back', left: 'Strafe L', right: 'Strafe R', jump: 'Jump / Ascend', descend: 'Descend', sprint: 'Sprint / Boost',
      flyToggle: 'Toggle Flight', dash: 'Dash', timewarp: 'Slow-mo', laser: 'Primary (Laser/Punch)', thermal: 'Thermal Vision',
      slam: 'Ground Slam', clap: 'Shock Clap', grab: 'Grab / Throw', pulse: 'Pulse', cryo: 'Cryo Breath', gale: 'Gale Force',
      xray: 'Deep Sight', hearing: 'Acute Hearing', aegis: 'Aegis Toggle', lockon: 'Lock-on', powerWheel: 'Power Wheel', sandbox: 'Sandbox', pause: 'Pause',
    };
    for (const action in labels) {
      const keyBtn = el('div', { class: 'sb-key' }, (input.bindings[action] || []).join(' / '));
      keyBtn.addEventListener('click', async () => {
        keyBtn.classList.add('bind'); keyBtn.textContent = 'press key...';
        const code = await input.captureRebind();
        input.bindings[action] = [code]; this.ctx.settings.patch({ bindings: input.bindings });
        keyBtn.classList.remove('bind'); keyBtn.textContent = code;
      });
      grid.appendChild(el('div', { class: 'sb-row' }, [document.createTextNode(labels[action]), keyBtn]));
    }
    const menu = el('div', { class: 'sb-menu' }, [
      el('h2', {}, 'Controls'), el('div', { style: { fontSize: '12px', color: '#9fd0ff' } }, 'Click a key to rebind.'),
      grid,
      el('div', { style: { marginTop: '14px', display: 'flex', gap: '8px', justifyContent: 'flex-end' } }, [
        el('button', { class: 'sb-btn sm', onclick: () => { input.setBindings(DEFAULT_BINDINGS); this.ctx.settings.patch({ bindings: null }); this.showControls(); } }, 'Reset'),
        el('button', { class: 'sb-btn sm', onclick: () => this._back() }, 'Back'),
      ]),
    ]);
    this._overlay(menu);
  }

  showSkills() {
    this.closeScreens();
    const p = this.ctx.progression;
    const rows = Object.keys(SKILLS).map((k) => el('div', { class: 'sb-row' }, [
      el('div', {}, [el('b', {}, SKILLS[k].name + ' '), el('small', { style: { color: '#9fd0ff' } }, SKILLS[k].desc)]),
      el('div', {}, [document.createTextNode((p.skills[k]) + '/' + SKILLS[k].max + '  '), el('button', { class: 'sb-btn sm', onclick: () => { if (this.game.upgradeSkill(k)) this.showSkills(); } }, '+')]),
    ]));
    const menu = el('div', { class: 'sb-menu', style: { width: '420px' } }, [
      el('h2', {}, 'Skills'), el('div', { class: 'tier' }, 'Skill points: ★ ' + p.skillPoints),
      ...rows,
      el('div', { style: { marginTop: '12px', textAlign: 'right' } }, [el('button', { class: 'sb-btn sm', onclick: () => this._back() }, 'Back')]),
    ]);
    this._overlay(menu);
  }

  showSaves(mode) {
    this.closeScreens();
    const list = this.ctx.save.list();
    const box = el('div');
    const refresh = () => {
      box.innerHTML = '';
      const slots = this.ctx.save.list();
      for (const s of slots) {
        box.appendChild(el('div', { class: 'sb-slot' }, [
          el('div', {}, s.name + ' · Lv ' + s.level + ' · Renown ' + fmtInt(s.renown || 0) + ' · ' + new Date(s.time).toLocaleString()),
          el('div', {}, [
            el('button', { class: 'sb-btn sm', onclick: () => this.game.load(s.slot) }, 'Load'),
            el('button', { class: 'sb-btn sm', onclick: () => { this.ctx.save.delete(s.slot); refresh(); } }, '🗑'),
          ]),
        ]));
      }
      if (!slots.length) box.appendChild(el('div', { style: { color: '#789' } }, 'No saves yet.'));
    };
    refresh();
    const menu = el('div', { class: 'sb-menu' }, [
      el('h2', {}, 'Saves'),
      mode === 'save' ? el('button', { class: 'sb-btn sm', onclick: () => { this.game.save(); refresh(); this.notify('Game saved', 0x66ff99); } }, '💾 Save current game') : null,
      box,
      el('div', { style: { marginTop: '12px', textAlign: 'right' } }, [el('button', { class: 'sb-btn sm', onclick: () => this._back() }, 'Back')]),
    ]);
    this._overlay(menu);
  }

  showSandbox() {
    this.closeScreens();
    const g = this.game;
    const btn = (label, fn) => el('button', { class: 'sb-btn sm', onclick: fn }, label);
    const section = (title, kids) => el('div', {}, [el('h3', {}, title), el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } }, kids)]);
    const menu = el('div', { class: 'sb-menu' }, [
      el('h2', {}, 'Sandbox'),
      section('Spawn', [
        btn('Thug', () => g.spawnEnemy('thug')), btn('Enforcer', () => g.spawnEnemy('enforcer')), btn('Brute', () => g.spawnEnemy('brute')),
        btn('Drone', () => g.spawnEnemy('drone')), btn('Villain Wave', () => g.triggerEvent('villain')),
      ]),
      section('Events', [btn('Crime', () => g.triggerEvent('crime')), btn('Fire', () => g.triggerEvent('fire')), btn('Accident', () => g.triggerEvent('accident')), btn('Meteor', () => g.triggerEvent('meteor'))]),
      section('Weather', ['clear', 'cloudy', 'overcast', 'rain', 'storm'].map((w) => btn(w, () => g.setWeather(w)))),
      section('Time', [btn('Dawn', () => g.setTime(0.25)), btn('Noon', () => g.setTime(0.5)), btn('Dusk', () => g.setTime(0.78)), btn('Night', () => g.setTime(0.0))]),
      section('Teleport', (this.ctx.city ? this.ctx.city.landmarks : []).map((l) => btn(l.name, () => g.teleport(l)))),
      section('Toggles', [
        btn('Invuln', () => g.toggle('invulnerable')), btn('∞ Energy', () => g.toggle('infiniteEnergy')),
        btn('Clear debris', () => g.clearDebris()), btn('Director on/off', () => g.toggleDirector()),
      ]),
      el('div', { style: { marginTop: '12px', textAlign: 'right' } }, [el('button', { class: 'sb-btn sm', onclick: () => this._back() }, 'Back')]),
    ]);
    this._overlay(menu);
  }

  _back() { this.closeScreens(); if (this.game.paused) this.openPause(); else if (!this.hudVisible) this.showTitle(); }
}
