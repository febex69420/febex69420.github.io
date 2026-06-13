// store.js — the single source of truth.
// State is derived from an append-only event log via a pure reducer, which is
// what makes timeline-travel, replay, and (future) CRDT sync fall out for free.

let _clock = 0;
const now = () => Date.now();
// ULID-ish sortable id: time prefix + randomness.
export function uid(prefix = 'n') {
  const t = Date.now().toString(36).padStart(9, '0');
  const r = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${t}${r}`;
}

export const NODE_KINDS = [
  'note', 'idea', 'task', 'image', 'file', 'link',
  'person', 'message', 'conversation', 'ai-summary', 'cluster',
];

const KIND_COLORS = {
  note: '#6ea8ff', idea: '#b388ff', task: '#5ff0c8', image: '#ff8bd1',
  file: '#ffd166', link: '#7be0ff', person: '#ff7b7b', message: '#9cff9c',
  conversation: '#c0a0ff', 'ai-summary': '#ffce6e', cluster: '#8895ff',
};
export const colorFor = (kind) => KIND_COLORS[kind] || '#8ea2ff';

// ---------------------------------------------------------------------------
// Reducer: (Brain, Event) -> Brain  (mutates in place for speed; pure shape)
// ---------------------------------------------------------------------------
function emptyBrain() {
  return { nodes: new Map(), edges: new Map() };
}

function applyEvent(brain, ev) {
  switch (ev.t) {
    case 'node.create': {
      if (!brain.nodes.has(ev.node.id)) brain.nodes.set(ev.node.id, { ...ev.node });
      break;
    }
    case 'node.update': {
      const n = brain.nodes.get(ev.id);
      if (n) Object.assign(n, ev.patch, { updatedAt: ev.ts });
      break;
    }
    case 'node.move': {
      const n = brain.nodes.get(ev.id);
      if (n) { n.x = ev.x; n.y = ev.y; n.z = ev.z; n.pinned = true; }
      break;
    }
    case 'node.delete': {
      brain.nodes.delete(ev.id);
      for (const [eid, e] of brain.edges) {
        if (e.source === ev.id || e.target === ev.id) brain.edges.delete(eid);
      }
      break;
    }
    case 'edge.create': {
      if (!brain.edges.has(ev.edge.id)) brain.edges.set(ev.edge.id, { ...ev.edge });
      break;
    }
    case 'edge.delete': {
      brain.edges.delete(ev.id);
      break;
    }
  }
  return brain;
}

export function reduce(events, upto = Infinity) {
  const brain = emptyBrain();
  for (const ev of events) {
    if (ev.ts > upto) break;
    applyEvent(brain, ev);
  }
  return brain;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------
export class Store extends EventTarget {
  constructor(key = 'brainspace.v1') {
    super();
    this.key = key;
    this.authorId = this._identity();
    this.events = [];
    this.brain = emptyBrain();
    this._index = new SearchIndex();
  }

  _identity() {
    let id = localStorage.getItem('brainspace.author');
    if (!id) { id = uid('u'); localStorage.setItem('brainspace.author', id); }
    return id;
  }

  load() {
    try {
      const raw = localStorage.getItem(this.key);
      if (raw) this.events = JSON.parse(raw);
    } catch { this.events = []; }
    _clock = this.events.reduce((m, e) => Math.max(m, e.ts || 0), 0);
    this._rebuild();
    return this.events.length;
  }

  save() {
    try { localStorage.setItem(this.key, JSON.stringify(this.events)); } catch {}
  }

  _rebuild() {
    this.brain = reduce(this.events);
    this._index.rebuild(this.brain.nodes);
    this.dispatchEvent(new CustomEvent('change', { detail: { full: true } }));
  }

  // Append + apply optimistically. This is the seam where a SyncProvider would
  // also ship the event over the wire.
  dispatch(ev) {
    ev.ts = ++_clock;
    ev.author = this.authorId;
    this.events.push(ev);
    applyEvent(this.brain, ev);
    if (ev.t === 'node.create' || ev.t === 'node.update' || ev.t === 'node.delete') {
      this._index.update(this.brain, ev);
    }
    this.save();
    this.dispatchEvent(new CustomEvent('change', { detail: { ev } }));
    return ev;
  }

  // --- high-level commands ---------------------------------------------------
  createNode({ kind = 'note', title = 'Untitled', body = '', tags = [], meta = {}, near = null }) {
    const spread = 60 + Math.random() * 80;
    const a = Math.random() * Math.PI * 2;
    const base = near || { x: 0, y: 0, z: 0 };
    const node = {
      id: uid('n'), kind, title, body, tags, meta,
      x: base.x + Math.cos(a) * spread,
      y: base.y + Math.sin(a) * spread,
      z: (Math.random() - 0.5) * 220,
      vx: 0, vy: 0, pinned: false,
      createdAt: now(), updatedAt: now(), authorId: this.authorId,
    };
    this.dispatch({ t: 'node.create', node });
    return node;
  }

  updateNode(id, patch) { this.dispatch({ t: 'node.update', id, patch }); }
  moveNode(id, x, y, z) { this.dispatch({ t: 'node.move', id, x, y, z }); }
  deleteNode(id) { this.dispatch({ t: 'node.delete', id }); }

  connect(source, target, kind = 'manual', weight = 1) {
    if (source === target) return null;
    for (const e of this.brain.edges.values()) {
      if ((e.source === source && e.target === target) ||
          (e.source === target && e.target === source)) return e;
    }
    const edge = { id: uid('e'), source, target, kind, weight, createdAt: now() };
    this.dispatch({ t: 'edge.create', edge });
    return edge;
  }
  disconnect(id) { this.dispatch({ t: 'edge.delete', id }); }

  // --- timeline --------------------------------------------------------------
  get span() {
    if (!this.events.length) return [0, 0];
    return [this.events[0].ts, this.events[this.events.length - 1].ts];
  }
  // Returns a brain projection at a given lamport cutoff (for scrubbing/replay).
  projectionAt(cutoff) { return reduce(this.events, cutoff); }

  // --- search ---------------------------------------------------------------
  search(q, mode = 'text') { return this._index.query(q, mode, this.brain); }

  // --- sharing ---------------------------------------------------------------
  exportSnapshot() {
    return { v: 1, events: this.events };
  }
  importSnapshot(snap, { merge = false } = {}) {
    if (!snap || !Array.isArray(snap.events)) throw new Error('bad snapshot');
    if (merge) {
      const seen = new Set(this.events.map((e) => e.ts + ':' + e.author));
      for (const e of snap.events) if (!seen.has(e.ts + ':' + e.author)) this.events.push(e);
      this.events.sort((a, b) => a.ts - b.ts);
    } else {
      this.events = snap.events.slice();
    }
    _clock = this.events.reduce((m, e) => Math.max(m, e.ts || 0), 0);
    this.save();
    this._rebuild();
  }

  reset() { this.events = []; _clock = 0; this.save(); this._rebuild(); }
}

// ---------------------------------------------------------------------------
// SearchIndex — TF-IDF backed text/semantic + simple graph search.
// Kept here so search is instant and offline. Production swaps query() for an
// /api/search call against Postgres FTS + pgvector behind the same signature.
// ---------------------------------------------------------------------------
const STOP = new Set('the a an of to and or is are be in on for with it this that as at by from'.split(' '));
export function tokenize(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

export class SearchIndex {
  constructor() { this.df = new Map(); this.docs = new Map(); this.N = 0; }

  rebuild(nodes) {
    this.df = new Map(); this.docs = new Map(); this.N = 0;
    for (const n of nodes.values()) this._add(n);
  }
  update(brain, ev) {
    if (ev.t === 'node.delete') { this.docs.delete(ev.id); return; }
    const n = brain.nodes.get(ev.id || ev.node?.id);
    if (n) this._add(n);
  }
  _add(n) {
    const toks = tokenize(`${n.title} ${n.body} ${(n.tags || []).join(' ')}`);
    const tf = new Map();
    for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1);
    if (!this.docs.has(n.id)) this.N++;
    this.docs.set(n.id, { tf, len: toks.length, terms: new Set(toks) });
    for (const term of tf.keys()) this.df.set(term, (this.df.get(term) || 0) + 1);
  }
  idf(term) { return Math.log(1 + this.N / (1 + (this.df.get(term) || 0))); }

  // cosine-ish similarity between a query token bag and a doc.
  _score(queryTf, doc) {
    let s = 0;
    for (const [term, q] of queryTf) {
      const d = doc.tf.get(term);
      if (d) s += (q * this.idf(term)) * (d * this.idf(term));
    }
    return s / (Math.sqrt(doc.len) || 1);
  }

  query(q, mode, brain) {
    const toks = tokenize(q);
    if (!toks.length) return [];
    const qtf = new Map();
    for (const t of toks) qtf.set(t, (qtf.get(t) || 0) + 1);

    let results = [];
    for (const [id, doc] of this.docs) {
      const node = brain.nodes.get(id);
      if (!node) continue;
      let score = this._score(qtf, doc);
      // 'semantic' mode is lenient: partial term overlap still scores.
      if (mode === 'semantic') {
        for (const t of toks) for (const term of doc.terms)
          if (term !== t && (term.includes(t) || t.includes(term))) score += 0.3 * this.idf(term);
      }
      if (score > 0) results.push({ node, score });
    }

    // graph mode: boost nodes by how connected the matches are.
    if (mode === 'graph') {
      const deg = new Map();
      for (const e of brain.edges.values()) {
        deg.set(e.source, (deg.get(e.source) || 0) + 1);
        deg.set(e.target, (deg.get(e.target) || 0) + 1);
      }
      results.forEach((r) => { r.score *= 1 + 0.15 * (deg.get(r.node.id) || 0); });
    }

    return results.sort((a, b) => b.score - a.score).slice(0, 30);
  }
}
