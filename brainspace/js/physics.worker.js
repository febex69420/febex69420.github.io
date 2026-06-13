// physics.worker.js — Barnes–Hut force-directed simulation off the main thread.
// The main thread sends graph topology; we stream back positions as a
// transferable Float32Array so the UI never blocks even with 10k+ nodes.

let nodes = [];          // {id, x, y, vx, vy, pinned, mass}
let edges = [];          // {a, b, weight}  (indices into nodes)
let index = new Map();   // id -> array index
let running = false;
let alpha = 1;           // simulation "temperature"; cools over time

// tunables
const REPULSION = 5200;
const SPRING = 0.012;
const REST = 78;
const CENTER = 0.0009;
const DAMP = 0.86;
const THETA = 0.9;       // Barnes–Hut accuracy/speed tradeoff

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'init' || m.type === 'graph') {
    rebuild(m.nodes, m.edges);
    // full kick to lay out the seed; gentle nudge when nodes are added/removed
    // (existing positions are preserved, so we only need to re-settle).
    alpha = m.type === 'init' ? 1 : Math.max(alpha, 0.5);
    running = true;
    if (m.type === 'init') loop();
  } else if (m.type === 'reheat') {
    alpha = Math.max(alpha, m.alpha ?? 0.7);
  } else if (m.type === 'pin') {
    const i = index.get(m.id);
    if (i != null) { nodes[i].pinned = m.pinned; nodes[i].x = m.x ?? nodes[i].x; nodes[i].y = m.y ?? nodes[i].y; nodes[i].vx = 0; nodes[i].vy = 0; alpha = Math.max(alpha, 0.5); }
  } else if (m.type === 'drag') {
    const i = index.get(m.id);
    if (i != null) { nodes[i].x = m.x; nodes[i].y = m.y; nodes[i].vx = 0; nodes[i].vy = 0; alpha = Math.max(alpha, 0.35); }
  } else if (m.type === 'stop') {
    running = false;
  }
};

function rebuild(ns, es) {
  index = new Map();
  nodes = ns.map((n, i) => {
    index.set(n.id, i);
    return { id: n.id, x: n.x || 0, y: n.y || 0, vx: 0, vy: 0,
             pinned: !!n.pinned, mass: 1 + (n.degree || 0) * 0.4 };
  });
  edges = [];
  for (const e of es) {
    const a = index.get(e.source), b = index.get(e.target);
    if (a != null && b != null) edges.push({ a, b, w: e.weight || 1 });
  }
}

// --- Barnes–Hut quadtree ---------------------------------------------------
function buildTree() {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    if (n.x < minX) minX = n.x; if (n.y < minY) minY = n.y;
    if (n.x > maxX) maxX = n.x; if (n.y > maxY) maxY = n.y;
  }
  const size = Math.max(maxX - minX, maxY - minY, 1) + 1;
  const root = makeCell(minX, minY, size);
  for (const n of nodes) insert(root, n);
  return root;
}
function makeCell(x, y, s) { return { x, y, s, cx: 0, cy: 0, mass: 0, body: null, kids: null }; }
function insert(cell, n) {
  if (cell.mass === 0 && !cell.body) { cell.body = n; cell.cx = n.x; cell.cy = n.y; cell.mass = n.mass; return; }
  if (cell.body) { const b = cell.body; cell.body = null; subdivide(cell); place(cell, b); }
  cell.cx = (cell.cx * cell.mass + n.x * n.mass) / (cell.mass + n.mass);
  cell.cy = (cell.cy * cell.mass + n.y * n.mass) / (cell.mass + n.mass);
  cell.mass += n.mass;
  place(cell, n);
}
function subdivide(cell) {
  const h = cell.s / 2;
  cell.kids = [
    makeCell(cell.x, cell.y, h), makeCell(cell.x + h, cell.y, h),
    makeCell(cell.x, cell.y + h, h), makeCell(cell.x + h, cell.y + h, h),
  ];
}
function place(cell, n) {
  if (!cell.kids) subdivide(cell);
  const h = cell.s / 2;
  const qx = n.x >= cell.x + h ? 1 : 0;
  const qy = n.y >= cell.y + h ? 1 : 0;
  insert(cell.kids[qy * 2 + qx], n);
}
function applyRepulsion(cell, n, fx) {
  if (!cell || cell.mass === 0) return;
  const dx = cell.cx - n.x, dy = cell.cy - n.y;
  let d2 = dx * dx + dy * dy;
  if (d2 < 0.01) d2 = 0.01;
  if (cell.body || (cell.s * cell.s) / d2 < THETA * THETA) {
    if (cell.body === n) return;
    const d = Math.sqrt(d2);
    const f = -REPULSION * cell.mass / d2;
    fx.x += (dx / d) * f; fx.y += (dy / d) * f;
  } else if (cell.kids) {
    for (const k of cell.kids) applyRepulsion(k, n, fx);
  }
}

function tick() {
  if (nodes.length === 0) return;
  const tree = buildTree();
  const f = { x: 0, y: 0 };
  for (const n of nodes) {
    if (n.pinned) continue;
    f.x = 0; f.y = 0;
    applyRepulsion(tree, n, f);
    f.x += -n.x * CENTER * nodes.length; // gravity to center
    f.y += -n.y * CENTER * nodes.length;
    n.vx = (n.vx + f.x * alpha) * DAMP;
    n.vy = (n.vy + f.y * alpha) * DAMP;
  }
  // springs
  for (const e of edges) {
    const a = nodes[e.a], b = nodes[e.b];
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
    const force = SPRING * (d - REST * e.w) * alpha;
    const fx = (dx / d) * force, fy = (dy / d) * force;
    if (!a.pinned) { a.vx += fx; a.vy += fy; }
    if (!b.pinned) { b.vx -= fx; b.vy -= fy; }
  }
  for (const n of nodes) {
    if (n.pinned) continue;
    const max = 30;
    n.vx = Math.max(-max, Math.min(max, n.vx));
    n.vy = Math.max(-max, Math.min(max, n.vy));
    n.x += n.vx; n.y += n.vy;
  }
  alpha *= 0.994;
  if (alpha < 0.02) alpha = 0.02; // keep a gentle simmer
}

function loop() {
  if (running) {
    tick();
    const buf = new Float32Array(nodes.length * 3);
    for (let i = 0; i < nodes.length; i++) {
      buf[i * 3] = nodes[i].x; buf[i * 3 + 1] = nodes[i].y; buf[i * 3 + 2] = 0;
    }
    // also ship id order once-ish; main thread keeps its own mapping by index.
    self.postMessage({ type: 'positions', buf }, [buf.buffer]);
  }
  setTimeout(loop, 16);
}
