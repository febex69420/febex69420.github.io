// Unit tests for the pure core (reducer, search, AI). Run: node --test
// These avoid browser globals (localStorage, Worker) by testing the pure
// functions directly rather than instantiating the full Store.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduce, SearchIndex, tokenize, NODE_KINDS, colorFor } from '../js/store.js';
import { AI } from '../js/ai.js';

let ts = 0;
const ev = (o) => ({ ...o, ts: ++ts, author: 'u_test' });
const node = (id, title, body = '', tags = []) => ({
  id, kind: 'note', title, body, tags, meta: {}, x: 0, y: 0, z: 0,
  vx: 0, vy: 0, pinned: false, createdAt: 0, updatedAt: 0, authorId: 'u',
});

test('reduce builds nodes and edges from events', () => {
  const events = [
    ev({ t: 'node.create', node: node('a', 'Alpha') }),
    ev({ t: 'node.create', node: node('b', 'Beta') }),
    ev({ t: 'edge.create', edge: { id: 'e1', source: 'a', target: 'b', kind: 'manual', weight: 1 } }),
  ];
  const brain = reduce(events);
  assert.equal(brain.nodes.size, 2);
  assert.equal(brain.edges.size, 1);
  assert.equal(brain.nodes.get('a').title, 'Alpha');
});

test('node.delete removes incident edges', () => {
  const events = [
    ev({ t: 'node.create', node: node('a', 'A') }),
    ev({ t: 'node.create', node: node('b', 'B') }),
    ev({ t: 'edge.create', edge: { id: 'e1', source: 'a', target: 'b', kind: 'manual', weight: 1 } }),
    ev({ t: 'node.delete', id: 'a' }),
  ];
  const brain = reduce(events);
  assert.equal(brain.nodes.size, 1);
  assert.equal(brain.edges.size, 0, 'edge to deleted node is gone');
});

test('node.update patches fields', () => {
  const events = [
    ev({ t: 'node.create', node: node('a', 'Old') }),
    ev({ t: 'node.update', id: 'a', patch: { title: 'New', tags: ['x'] } }),
  ];
  const brain = reduce(events);
  assert.equal(brain.nodes.get('a').title, 'New');
  assert.deepEqual(brain.nodes.get('a').tags, ['x']);
});

test('timeline cutoff projects historical state', () => {
  // explicit timestamps so the projection is independent of test order
  const events = [
    { t: 'node.create', node: node('a', 'A'), ts: 1, author: 'u' },
    { t: 'node.create', node: node('b', 'B'), ts: 2, author: 'u' },
    { t: 'node.create', node: node('c', 'C'), ts: 3, author: 'u' },
  ];
  assert.equal(reduce(events, 1).nodes.size, 1);
  assert.equal(reduce(events, 2).nodes.size, 2);
  assert.equal(reduce(events, 99).nodes.size, 3);
});

test('tokenize strips stopwords and short tokens', () => {
  const t = tokenize('The virtual reality of a YouTube video');
  assert.ok(t.includes('virtual'));
  assert.ok(t.includes('reality'));
  assert.ok(!t.includes('the'));
  assert.ok(!t.includes('of'));
});

test('search finds relevant nodes and ranks by relevance', () => {
  const idx = new SearchIndex();
  const nodes = new Map([
    ['a', node('a', 'Virtual reality headsets', 'VR immersion presence')],
    ['b', node('b', 'Cooking pasta', 'boil water add salt')],
    ['c', node('c', 'VR for YouTube creators', 'virtual reality video content')],
  ]);
  idx.rebuild(nodes);
  const brain = { nodes, edges: new Map() };
  const res = idx.query('virtual reality', 'text', brain);
  assert.ok(res.length >= 2);
  assert.ok(['a', 'c'].includes(res[0].node.id), 'top result is VR-related');
  assert.ok(!res.some((r) => r.node.id === 'b'), 'unrelated note excluded');
});

test('AI suggests a connection between thematically similar notes', () => {
  const nodes = new Map([
    ['a', node('a', 'Virtual reality immersion', 'vr presence headset world')],
    ['b', node('b', 'YouTube VR videos', 'virtual reality video content youtube creators')],
    ['c', node('c', 'Grocery list', 'milk eggs bread')],
  ]);
  const brain = { nodes, edges: new Map() };
  const sug = AI.suggestConnections(brain, { threshold: 0.05 });
  assert.ok(sug.length >= 1, 'at least one suggestion');
  const top = sug[0];
  const pair = new Set([top.source, top.target]);
  assert.ok(pair.has('a') && pair.has('b'), 'connects the two VR notes');
});

test('AI clusters connected nodes', () => {
  const nodes = new Map();
  for (const id of ['a', 'b', 'c', 'd']) nodes.set(id, node(id, id));
  const edges = new Map([
    ['e1', { id: 'e1', source: 'a', target: 'b', weight: 1 }],
    ['e2', { id: 'e2', source: 'b', target: 'c', weight: 1 }],
    ['e3', { id: 'e3', source: 'c', target: 'a', weight: 1 }],
  ]);
  const clusters = AI.suggestClusters({ nodes, edges });
  assert.ok(clusters.length >= 1);
  assert.ok(clusters[0].members.length >= 3, 'triangle forms a cluster');
});

test('every node kind has a color', () => {
  for (const k of NODE_KINDS) assert.match(colorFor(k), /^#[0-9a-f]{6}$/i);
});
