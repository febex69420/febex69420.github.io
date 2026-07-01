// ui/widgets.js — shared UI primitives: DOM helper, canvas line charts,
// the live minimap, toast notifications and modal decision dialogs.

import { G, CFG, dateStr } from '../core/state.js';
import { on, emit } from '../core/bus.js';
import { NATION_COLORS } from '../sim/world.js';
import { REBEL } from '../sim/military.js';

/** Tiny DOM builder: el('div', 'cls', 'html') */
export function el(tag, cls = '', html = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

export const fmtShort = (n) => {
  const abs = Math.abs(n);
  return abs >= 1e12 ? (n / 1e12).toFixed(1) + 'T' : abs >= 1e9 ? (n / 1e9).toFixed(1) + 'B' :
    abs >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : abs >= 1e3 ? (n / 1e3).toFixed(0) + 'K' : n.toFixed(0);
};

// ------------------------------------------------------------------- charts --

/**
 * Draw a line chart of a numeric series onto a canvas.
 */
export function drawChart(canvas, series, { color = '#6fc2ff', label = '', format = fmtShort, fill = true } = {}) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width = canvas.clientWidth * (window.devicePixelRatio > 1 ? 2 : 1) || 300;
  const H = canvas.height = 120 * (window.devicePixelRatio > 1 ? 2 : 1);
  ctx.clearRect(0, 0, W, H);
  ctx.font = `${H > 150 ? 22 : 11}px system-ui`;
  const pad = { l: 8, r: 8, t: 18, b: 8 };
  if (!series || series.length < 2) {
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    ctx.fillText('Gathering data… (advances monthly)', pad.l, H / 2);
    return;
  }
  let min = Infinity, max = -Infinity;
  for (const v of series) { if (v < min) min = v; if (v > max) max = v; }
  if (min === max) { min -= 1; max += 1; }
  const range = max - min;
  min -= range * 0.08; max += range * 0.08;
  const X = (i) => pad.l + (i / (series.length - 1)) * (W - pad.l - pad.r);
  const Y = (v) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);
  // grid
  ctx.strokeStyle = 'rgba(255,255,255,.07)';
  ctx.beginPath();
  for (let gy = 0; gy <= 3; gy++) {
    const y = pad.t + gy / 3 * (H - pad.t - pad.b);
    ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y);
  }
  ctx.stroke();
  // area fill
  if (fill) {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, color + '55'); grad.addColorStop(1, color + '00');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(X(0), Y(series[0]));
    for (let i = 1; i < series.length; i++) ctx.lineTo(X(i), Y(series[i]));
    ctx.lineTo(X(series.length - 1), H - pad.b); ctx.lineTo(X(0), H - pad.b);
    ctx.closePath(); ctx.fill();
  }
  // line
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(X(0), Y(series[0]));
  for (let i = 1; i < series.length; i++) ctx.lineTo(X(i), Y(series[i]));
  ctx.stroke();
  // labels
  ctx.fillStyle = 'rgba(255,255,255,.75)';
  const last = series[series.length - 1];
  ctx.fillText(`${label}  ${format(last)}`, pad.l, 13);
  ctx.fillStyle = 'rgba(255,255,255,.4)';
  ctx.fillText(format(max), W - pad.r - ctx.measureText(format(max)).width, pad.t + 10);
}

// ------------------------------------------------------------------ minimap --

let mmCanvas, mmBase;

export function initMinimap(canvas) {
  mmCanvas = canvas;
  mmBase = document.createElement('canvas');
  mmBase.width = mmBase.height = 176;
  renderMinimapBase();
  on('province:flip', renderMinimapBase);
  on('peace', renderMinimapBase);
  canvas.addEventListener('click', (e) => {
    const r = canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width - 0.5) * CFG.MAP;
    const z = ((e.clientY - r.top) / r.height - 0.5) * CFG.MAP;
    emit('focus:map', { x, z });
  });
}

function renderMinimapBase() {
  const ctx = mmBase.getContext('2d');
  const S = mmBase.width;
  const n = CFG.PROV_N, cs = S / n;
  ctx.fillStyle = '#132433';
  ctx.fillRect(0, 0, S, S);
  const hex = (c) => '#' + c.toString(16).padStart(6, '0');
  for (const p of G.world.provinces) {
    ctx.fillStyle = p.owner === REBEL ? '#5a1a20' : hex(NATION_COLORS[p.owner] ?? 0x445566);
    ctx.globalAlpha = p.owner === G.player.nation ? 0.95 : 0.6;
    ctx.fillRect(p.ix * cs, p.iz * cs, cs + 0.5, cs + 0.5);
  }
  ctx.globalAlpha = 1;
}

/** Refresh dynamic minimap layer (units, protests, camera). Call ~2 Hz. */
export function drawMinimap(cameraFocus) {
  if (!mmCanvas) return;
  const ctx = mmCanvas.getContext('2d');
  const S = mmCanvas.width = mmCanvas.clientWidth || 176;
  mmCanvas.height = S;
  ctx.drawImage(mmBase, 0, 0, S, S);
  const toPx = (x) => (x / CFG.MAP + 0.5) * S;
  // settlements
  for (const s of G.world.settlements) {
    if (s.mil) continue;
    ctx.fillStyle = s.type === 'capital' ? '#ffd97a' : '#e8eef8';
    const r = s.type === 'capital' ? 2.5 : 1.5;
    ctx.beginPath(); ctx.arc(toPx(s.x), toPx(s.z), r, 0, 7); ctx.fill();
  }
  // units
  for (const u of G.military.units) {
    ctx.fillStyle = u.nation === REBEL ? '#ff4455' : u.nation === G.player.nation ? '#7dff9a' : '#ffb02e';
    ctx.fillRect(toPx(u.x) - 1.5, toPx(u.z) - 1.5, 3, 3);
  }
  // protests pulse
  const t = performance.now() / 300;
  for (const p of G.politics.protests) {
    const s = G.world.settlements[p.settlement];
    ctx.strokeStyle = p.violent ? '#ff5533' : '#ffcc44';
    ctx.globalAlpha = 0.5 + Math.sin(t) * 0.4;
    ctx.beginPath(); ctx.arc(toPx(s.x), toPx(s.z), 5 + Math.sin(t) * 2, 0, 7); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // camera
  if (cameraFocus) {
    ctx.strokeStyle = '#ffffff';
    ctx.globalAlpha = 0.8;
    ctx.strokeRect(toPx(cameraFocus.x) - 5, toPx(cameraFocus.z) - 5, 10, 10);
    ctx.globalAlpha = 1;
  }
}

// -------------------------------------------------------------------- toasts --

export function initToasts(root) {
  on('notify', ({ title, text, kind }) => {
    const t = el('div', `toast ${kind || 'info'}`);
    t.append(el('div', 'toast-title', title), el('div', 'toast-text', text));
    root.prepend(t);
    while (root.children.length > 5) root.lastChild.remove();
    requestAnimationFrame(() => t.classList.add('in'));
    setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 400); }, 6500);
    t.addEventListener('click', () => t.remove());
  });
}

// -------------------------------------------------------------------- modals --

const modalQueue = [];
let modalOpen = false;

export function initModals(root) {
  on('modal', (m) => {
    modalQueue.push(m);
    pump(root);
  });
  on('gameover', () => { modalQueue.length = 0; });
}

function pump(root) {
  if (modalOpen || !modalQueue.length || G.gameOver) return;
  const m = modalQueue.shift();
  modalOpen = true;
  const wrap = el('div', 'modal-backdrop');
  const box = el('div', 'modal');
  box.append(el('div', 'modal-title', m.title));
  box.append(el('div', 'modal-text', m.text));
  const btns = el('div', 'modal-btns');
  for (const c of m.choices) {
    const b = el('button', 'btn modal-btn', c.label);
    b.addEventListener('click', () => {
      wrap.remove();
      modalOpen = false;
      try { c.fn && c.fn(); } catch (err) { console.error(err); }
      emit('ui:refresh');
      pump(root);
    });
    btns.append(b);
  }
  box.append(btns);
  wrap.append(box);
  root.append(wrap);
  emit('sfx', 'open');
}

/** Simple confirm modal helper. */
export function confirmModal(title, text, onYes, yesLabel = 'Confirm') {
  emit('modal', { title, text, choices: [{ label: yesLabel, fn: onYes }, { label: 'Cancel', fn: null }] });
}
