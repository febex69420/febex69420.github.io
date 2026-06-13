// ai.js — on-device "AI" via TF-IDF + cosine similarity, label-propagation
// clustering, and keyword tag extraction. Implements the AIProvider interface;
// production swaps these for real embeddings + an LLM behind the same shape.

import { tokenize } from './store.js';

function vectorize(nodes) {
  const df = new Map();
  const docs = [];
  for (const n of nodes) {
    const toks = tokenize(`${n.title} ${n.body} ${(n.tags || []).join(' ')}`);
    const tf = new Map();
    for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1);
    for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1);
    docs.push({ node: n, tf });
  }
  const N = nodes.length || 1;
  const idf = (t) => Math.log(1 + N / (1 + (df.get(t) || 0)));
  for (const d of docs) {
    const v = new Map(); let norm = 0;
    for (const [t, f] of d.tf) { const w = f * idf(t); v.set(t, w); norm += w * w; }
    d.vec = v; d.norm = Math.sqrt(norm) || 1;
  }
  return { docs, idf };
}

function cosine(a, b) {
  let dot = 0;
  const [small, big] = a.vec.size < b.vec.size ? [a, b] : [b, a];
  for (const [t, w] of small.vec) { const o = big.vec.get(t); if (o) dot += w * o; }
  return dot / (a.norm * b.norm);
}

export const AI = {
  // Suggest new connections across the whole brain (skips existing edges).
  suggestConnections(brain, { threshold = 0.18, max = 24 } = {}) {
    const nodes = [...brain.nodes.values()];
    if (nodes.length < 2) return [];
    const existing = new Set();
    for (const e of brain.edges.values()) {
      existing.add(e.source + '|' + e.target);
      existing.add(e.target + '|' + e.source);
    }
    const { docs } = vectorize(nodes);
    const out = [];
    for (let i = 0; i < docs.length; i++) {
      for (let j = i + 1; j < docs.length; j++) {
        if (existing.has(docs[i].node.id + '|' + docs[j].node.id)) continue;
        const sim = cosine(docs[i], docs[j]);
        if (sim >= threshold) {
          out.push({
            source: docs[i].node.id, target: docs[j].node.id, score: sim,
            shared: this._shared(docs[i], docs[j]),
            a: docs[i].node.title, b: docs[j].node.title,
          });
        }
      }
    }
    return out.sort((x, y) => y.score - x.score).slice(0, max);
  },

  _shared(a, b) {
    const r = [];
    for (const [t, w] of a.vec) if (b.vec.has(t)) r.push([t, w + b.vec.get(t)]);
    return r.sort((x, y) => y[1] - x[1]).slice(0, 3).map((x) => x[0]);
  },

  // Detect near-duplicate ideas.
  suggestDuplicates(brain, { threshold = 0.55 } = {}) {
    const nodes = [...brain.nodes.values()];
    const { docs } = vectorize(nodes);
    const out = [];
    for (let i = 0; i < docs.length; i++)
      for (let j = i + 1; j < docs.length; j++) {
        const sim = cosine(docs[i], docs[j]);
        if (sim >= threshold) out.push({ a: docs[i].node, b: docs[j].node, score: sim });
      }
    return out.sort((x, y) => y.score - x.score);
  },

  // Label-propagation community detection over the current edge set.
  suggestClusters(brain) {
    const labels = new Map();
    const adj = new Map();
    for (const id of brain.nodes.keys()) { labels.set(id, id); adj.set(id, []); }
    for (const e of brain.edges.values()) {
      if (adj.has(e.source) && adj.has(e.target)) {
        adj.get(e.source).push(e.target); adj.get(e.target).push(e.source);
      }
    }
    const ids = [...brain.nodes.keys()];
    for (let pass = 0; pass < 6; pass++) {
      let changed = false;
      for (const id of ids) {
        const counts = new Map();
        for (const nb of adj.get(id)) counts.set(labels.get(nb), (counts.get(labels.get(nb)) || 0) + 1);
        if (!counts.size) continue;
        let best = labels.get(id), bestC = -1;
        for (const [l, c] of counts) if (c > bestC) { bestC = c; best = l; }
        if (best !== labels.get(id)) { labels.set(id, best); changed = true; }
      }
      if (!changed) break;
    }
    const groups = new Map();
    for (const [id, l] of labels) { if (!groups.has(l)) groups.set(l, []); groups.get(l).push(id); }
    return [...groups.values()].filter((g) => g.length >= 3)
      .map((g) => ({ members: g, label: this._labelFor(g, brain) }))
      .sort((a, b) => b.members.length - a.members.length);
  },

  _labelFor(ids, brain) {
    const freq = new Map();
    for (const id of ids) {
      const n = brain.nodes.get(id);
      for (const t of tokenize(`${n.title} ${(n.tags || []).join(' ')}`))
        freq.set(t, (freq.get(t) || 0) + 1);
    }
    const top = [...freq.entries()].sort((a, b) => b[1] - a[1])[0];
    return top ? top[0] : 'cluster';
  },

  suggestTags(node, brain) {
    const nodes = [...brain.nodes.values()];
    const { docs } = vectorize(nodes);
    const doc = docs.find((d) => d.node.id === node.id);
    if (!doc) return [];
    return [...doc.vec.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map((x) => x[0]).filter((t) => !(node.tags || []).includes(t));
  },

  // Extractive summary: rank sentences by term salience.
  summarize(nodes) {
    const text = nodes.map((n) => `${n.title}. ${n.body}`).join(' ');
    const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 12);
    if (!sentences.length) return 'Not enough content to summarize yet.';
    const freq = new Map();
    for (const t of tokenize(text)) freq.set(t, (freq.get(t) || 0) + 1);
    const scored = sentences.map((s) => ({
      s, score: tokenize(s).reduce((a, t) => a + (freq.get(t) || 0), 0) / (tokenize(s).length || 1),
    }));
    return scored.sort((a, b) => b.score - a.score).slice(0, 3)
      .map((x) => x.s.trim()).join(' ');
  },
};
