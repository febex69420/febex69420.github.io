// graph-engine.js — the renderer + interaction layer.
// Canvas2D with pseudo-3D depth (z drives size/blur/brightness/parallax) for the
// neural-net look, a Web Worker for physics, frustum culling, a spatial hash for
// hit-testing, LOD, and critically-damped camera springs with inertia.

import { colorFor } from './store.js';

const DPR = Math.min(window.devicePixelRatio || 1, 2);

// cached glow sprite — drawn once, blitted per node (no per-frame gradients).
function makeGlowSprite(color, size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, color);
  grd.addColorStop(0.25, color);
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.beginPath(); g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2); g.fill();
  return c;
}

export class GraphEngine extends EventTarget {
  constructor(canvas, store) {
    super();
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.store = store;
    this.cam = { x: 0, y: 0, zoom: 0.6, tx: 0, ty: 0, tzoom: 0.6 }; // t* = target (spring)
    this.rotation = 0;
    this.order = [];                 // node ids in worker index order
    this.positions = new Map();      // id -> {x,y,z}
    this.hover = null;
    this.selected = null;
    this.dragging = null;
    this.connectFrom = null;
    this.spriteCache = new Map();
    this.grid = new SpatialHash(160);
    this.time = 0;
    this.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.particles = this._initParticles(this.reduceMotion ? 0 : 70);

    this._initWorker();
    this._resize();
    window.addEventListener('resize', () => this._resize());
    this._bindInput();
    // Only re-post topology to the physics worker on structural changes.
    // Edits (node.update) and drags (node.move, handled live) must not reheat
    // the layout, or the graph would jiggle while you type.
    store.addEventListener('change', (e) => {
      const ev = e.detail?.ev;
      const structural = e.detail?.full || !ev ||
        ev.t === 'node.create' || ev.t === 'node.delete' ||
        ev.t === 'edge.create' || ev.t === 'edge.delete';
      if (structural) this._syncGraph();
    });
    this._syncGraph(true);
    requestAnimationFrame((t) => this._frame(t));
  }

  // --- worker ----------------------------------------------------------------
  _initWorker() {
    this.worker = new Worker(new URL('./physics.worker.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e) => {
      if (e.data.type === 'positions') {
        const b = e.data.buf;
        for (let i = 0; i < this.order.length; i++) {
          const id = this.order[i];
          const p = this.positions.get(id);
          if (p) { p.x = b[i * 3]; p.y = b[i * 3 + 1]; }
        }
      }
    };
  }

  _syncGraph(initial = false) {
    const brain = this.store.brain;
    const deg = new Map();
    for (const e of brain.edges.values()) {
      deg.set(e.source, (deg.get(e.source) || 0) + 1);
      deg.set(e.target, (deg.get(e.target) || 0) + 1);
    }
    this.order = [...brain.nodes.keys()];
    for (const [id, n] of brain.nodes) {
      if (!this.positions.has(id)) this.positions.set(id, { x: n.x, y: n.y, z: n.z });
      else this.positions.get(id).z = n.z;
    }
    for (const id of [...this.positions.keys()]) if (!brain.nodes.has(id)) this.positions.delete(id);

    const nodes = this.order.map((id) => {
      const n = brain.nodes.get(id); const p = this.positions.get(id);
      return { id, x: p.x, y: p.y, pinned: n.pinned, degree: deg.get(id) || 0 };
    });
    const edges = [...brain.edges.values()].map((e) => ({ source: e.source, target: e.target, weight: 1 / (1 + (e.weight || 1) * 0.3) }));
    this.worker.postMessage({ type: initial ? 'init' : 'graph', nodes, edges });
  }

  sprite(kind) {
    if (!this.spriteCache.has(kind)) this.spriteCache.set(kind, makeGlowSprite(colorFor(kind)));
    return this.spriteCache.get(kind);
  }

  // --- coordinate transforms -------------------------------------------------
  _resize() {
    const r = this.canvas.getBoundingClientRect();
    this.w = r.width; this.h = r.height;
    this.canvas.width = r.width * DPR; this.canvas.height = r.height * DPR;
    this.ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  // world -> screen, with depth parallax (closer nodes move faster).
  project(p) {
    const depth = 1 + p.z / 900;            // 0.x (far) .. 1.x (near)
    const zoom = this.cam.zoom * depth;
    const sx = (p.x - this.cam.x) * zoom + this.w / 2;
    const sy = (p.y - this.cam.y) * zoom + this.h / 2;
    return { sx, sy, zoom, depth };
  }
  unproject(sx, sy) {
    return { x: (sx - this.w / 2) / this.cam.zoom + this.cam.x,
             y: (sy - this.h / 2) / this.cam.zoom + this.cam.y };
  }

  // --- camera moves ----------------------------------------------------------
  flyTo(id, zoom = 1.6) {
    const p = this.positions.get(id);
    if (!p) return;
    this.cam.tx = p.x; this.cam.ty = p.y; this.cam.tzoom = zoom;
    this.selected = id;
    this.dispatchEvent(new CustomEvent('select', { detail: { id } }));
  }
  fit() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of this.positions.values()) {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    }
    if (minX === Infinity) return;
    this.cam.tx = (minX + maxX) / 2; this.cam.ty = (minY + maxY) / 2;
    const span = Math.max(maxX - minX, maxY - minY, 200);
    this.cam.tzoom = Math.min(1.2, (Math.min(this.w, this.h) * 0.8) / span);
  }

  // --- input -----------------------------------------------------------------
  _bindInput() {
    const cv = this.canvas;
    let last = null, pinch = null;

    const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      const m = pos(e);
      const hit = this._pick(m.x, m.y);
      if (hit && (e.shiftKey || this.connectFrom)) {
        if (!this.connectFrom) { this.connectFrom = hit; }
        else { this.store.connect(this.connectFrom, hit, 'manual'); this.connectFrom = null; }
        return;
      }
      if (hit) { this.dragging = hit; this.selected = hit; this.flyTo(hit, this.cam.tzoom); }
      last = m;
    });

    cv.addEventListener('pointermove', (e) => {
      const m = pos(e);
      if (this.dragging) {
        const w = this.unproject(m.x, m.y);
        const p = this.positions.get(this.dragging);
        if (p) { p.x = w.x; p.y = w.y; }
        this.worker.postMessage({ type: 'drag', id: this.dragging, x: w.x, y: w.y });
      } else if (last && e.buttons) {
        this.cam.tx -= (m.x - last.x) / this.cam.zoom;
        this.cam.ty -= (m.y - last.y) / this.cam.zoom;
        this.cam.x = this.cam.tx; this.cam.y = this.cam.ty; // direct for snappy pan
        last = m;
      } else {
        const h = this._pick(m.x, m.y);
        if (h !== this.hover) { this.hover = h; cv.style.cursor = h ? 'pointer' : 'grab'; }
      }
    });

    const endDrag = () => {
      if (this.dragging) {
        const p = this.positions.get(this.dragging);
        if (p) this.store.moveNode(this.dragging, p.x, p.y, p.z);
        this.worker.postMessage({ type: 'pin', id: this.dragging, pinned: true, x: p.x, y: p.y });
        this.dragging = null;
      }
      last = null;
    };
    cv.addEventListener('pointerup', endDrag);
    cv.addEventListener('pointercancel', endDrag);

    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const m = pos(e);
      const before = this.unproject(m.x, m.y);
      const factor = Math.exp(-e.deltaY * 0.0015);
      this.cam.tzoom = Math.max(0.08, Math.min(6, this.cam.tzoom * factor));
      this.cam.zoom = this.cam.tzoom;
      const after = this.unproject(m.x, m.y);
      this.cam.tx += before.x - after.x; this.cam.ty += before.y - after.y;
      this.cam.x = this.cam.tx; this.cam.y = this.cam.ty;
    }, { passive: false });

    // touch pinch-to-zoom
    cv.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const [a, b] = e.touches;
        const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        if (pinch) {
          this.cam.tzoom = Math.max(0.08, Math.min(6, this.cam.tzoom * (d / pinch)));
          this.cam.zoom = this.cam.tzoom;
        }
        pinch = d;
      }
    }, { passive: false });
    cv.addEventListener('touchend', () => { pinch = null; });
  }

  _pick(sx, sy) {
    // query spatial hash near the cursor; check projected radius.
    const w = this.unproject(sx, sy);
    let best = null, bestD = 26 * 26;
    for (const id of this.grid.near(w.x, w.y, 220 / this.cam.zoom)) {
      const p = this.positions.get(id); if (!p) continue;
      const pr = this.project(p);
      const dx = pr.sx - sx, dy = pr.sy - sy;
      const d = dx * dx + dy * dy;
      const r = this._radius(id, pr) + 8;
      if (d < r * r && d < bestD) { bestD = d; best = id; }
    }
    return best;
  }

  _radius(id, pr) {
    const n = this.store.brain.nodes.get(id);
    const deg = this._degree(id);
    return (4 + Math.min(10, deg) * 0.9) * pr.depth * Math.min(1.6, Math.max(0.5, pr.zoom));
  }
  _degree(id) {
    if (!this._degCache || this._degCacheV !== this.store.brain.edges.size) {
      this._degCache = new Map(); this._degCacheV = this.store.brain.edges.size;
      for (const e of this.store.brain.edges.values()) {
        this._degCache.set(e.source, (this._degCache.get(e.source) || 0) + 1);
        this._degCache.set(e.target, (this._degCache.get(e.target) || 0) + 1);
      }
    }
    return this._degCache.get(id) || 0;
  }

  // --- particles -------------------------------------------------------------
  _initParticles(n) {
    return Array.from({ length: n }, () => ({
      x: Math.random(), y: Math.random(), z: Math.random(),
      s: 0.3 + Math.random() * 1.2, p: Math.random() * Math.PI * 2,
    }));
  }

  // --- render loop -----------------------------------------------------------
  _frame(t) {
    const dt = Math.min(33, t - (this._last || t)); this._last = t; this.time = t;
    // critically-damped camera spring
    const k = this.reduceMotion ? 1 : 0.14;
    this.cam.x += (this.cam.tx - this.cam.x) * k;
    this.cam.y += (this.cam.ty - this.cam.y) * k;
    this.cam.zoom += (this.cam.tzoom - this.cam.zoom) * k;

    this._render();
    requestAnimationFrame((tt) => this._frame(tt));
  }

  _render() {
    const ctx = this.ctx, brain = this.store.brain;
    // background
    ctx.fillStyle = '#05060c';
    ctx.fillRect(0, 0, this.w, this.h);
    this._renderParticles(ctx);

    // rebuild spatial hash for this frame (cheap; ids only) + cull set
    this.grid.clear();
    const visible = [];
    const margin = 80;
    for (const id of this.order) {
      const p = this.positions.get(id); if (!p) continue;
      this.grid.insert(id, p.x, p.y);
      const pr = this.project(p);
      if (pr.sx < -margin || pr.sx > this.w + margin || pr.sy < -margin || pr.sy > this.h + margin) continue;
      visible.push({ id, p, pr });
    }
    const visibleSet = new Set(visible.map((v) => v.id));
    const zoom = this.cam.zoom;

    // edges (only if at least one endpoint visible) — batched, additive glow
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = Math.max(0.4, 0.7 * zoom);
    const hood = this._neighborhood(this.hover || this.selected);
    for (const e of brain.edges.values()) {
      const dim = hood && !(hood.has(e.source) && hood.has(e.target));
      if (!visibleSet.has(e.source) && !visibleSet.has(e.target)) continue;
      const a = this.positions.get(e.source), b = this.positions.get(e.target);
      if (!a || !b) continue;
      const pa = this.project(a), pb = this.project(b);
      const col = e.kind === 'ai-suggested' ? '255,206,110' : e.kind === 'reference' ? '123,224,255' : '110,168,255';
      ctx.strokeStyle = `rgba(${col},${dim ? 0.04 : 0.22 + 0.1 * Math.sin(this.time * 0.002 + pa.sx)})`;
      ctx.beginPath(); ctx.moveTo(pa.sx, pa.sy); ctx.lineTo(pb.sx, pb.sy); ctx.stroke();
    }

    // nodes — sort by depth (far first) for correct layering
    visible.sort((u, v) => u.p.z - v.p.z);
    for (const v of visible) {
      const n = brain.nodes.get(v.id); if (!n) continue;
      const r = this._radius(v.id, v.pr);
      const dim = hood && !hood.has(v.id);
      const glow = r * (3.2 + 0.6 * Math.sin(this.time * 0.003 + v.pr.sx * 0.01));
      ctx.globalAlpha = (dim ? 0.18 : 0.9) * Math.min(1, v.pr.depth + 0.2);
      const sp = this.sprite(n.kind);
      ctx.drawImage(sp, v.pr.sx - glow, v.pr.sy - glow, glow * 2, glow * 2);
      // core
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = dim ? 0.3 : 1;
      ctx.fillStyle = '#eaf0ff';
      ctx.beginPath(); ctx.arc(v.pr.sx, v.pr.sy, Math.max(1.2, r * 0.45), 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = colorFor(n.kind);
      ctx.beginPath(); ctx.arc(v.pr.sx, v.pr.sy, Math.max(0.8, r * 0.28), 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      // ring for selected
      if (v.id === this.selected || v.id === this.connectFrom) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = v.id === this.connectFrom ? '#ffce6e' : '#9fc2ff';
        ctx.lineWidth = 1.5; ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.arc(v.pr.sx, v.pr.sy, r + 6 + 2 * Math.sin(this.time * 0.006), 0, Math.PI * 2); ctx.stroke();
        ctx.globalCompositeOperation = 'lighter';
      }
    }

    // labels — LOD: only when zoomed in, or hovered/selected, capped count
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.font = '12px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    const showLabels = zoom > 0.85;
    let labelBudget = 120;
    for (const v of visible) {
      const n = brain.nodes.get(v.id); if (!n) continue;
      const focus = v.id === this.hover || v.id === this.selected;
      if (!focus && (!showLabels || labelBudget <= 0 || this._degree(v.id) < 2)) continue;
      labelBudget--;
      const r = this._radius(v.id, v.pr);
      ctx.fillStyle = focus ? '#ffffff' : 'rgba(220,228,255,0.62)';
      const txt = n.title.length > 26 ? n.title.slice(0, 25) + '…' : n.title;
      ctx.fillText(txt, v.pr.sx, v.pr.sy + r + 14);
    }
    ctx.globalAlpha = 1;
    this.dispatchEvent(new CustomEvent('stats', { detail: { visible: visible.length, total: this.order.length, edges: brain.edges.size } }));
  }

  _renderParticles(ctx) {
    if (!this.particles.length) return;
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      const drift = (this.time * 0.00002 * (1 + p.z));
      const x = ((p.x + drift) % 1) * this.w;
      const y = ((p.y + drift * 0.5) % 1) * this.h;
      const a = 0.06 + 0.06 * Math.sin(this.time * 0.001 + p.p);
      ctx.fillStyle = `rgba(140,170,255,${a})`;
      ctx.beginPath(); ctx.arc(x, y, p.s * (0.6 + p.z), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  _neighborhood(id) {
    if (!id) return null;
    const set = new Set([id]);
    for (const e of this.store.brain.edges.values()) {
      if (e.source === id) set.add(e.target);
      if (e.target === id) set.add(e.source);
    }
    return set;
  }
}

// ---------------------------------------------------------------------------
// SpatialHash — uniform grid for O(1) average viewport / proximity queries.
// ---------------------------------------------------------------------------
class SpatialHash {
  constructor(cell = 160) { this.cell = cell; this.map = new Map(); }
  clear() { this.map.clear(); }
  _key(cx, cy) { return cx + ',' + cy; }
  insert(id, x, y) {
    const k = this._key(Math.floor(x / this.cell), Math.floor(y / this.cell));
    let a = this.map.get(k); if (!a) { a = []; this.map.set(k, a); } a.push(id);
  }
  *near(x, y, radius) {
    const r = Math.max(1, Math.ceil(radius / this.cell));
    const cx = Math.floor(x / this.cell), cy = Math.floor(y / this.cell);
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
      const a = this.map.get(this._key(cx + i, cy + j));
      if (a) for (const id of a) yield id;
    }
  }
}
