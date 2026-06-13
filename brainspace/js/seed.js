// seed.js — procedurally generates a believable demo brain so a first-time
// visitor lands inside a living graph instead of an empty void.

const CLUSTERS = [
  { tag: 'vr', kind: 'idea', titles: [
    'Virtual reality is the next computing platform',
    'VR locomotion: teleport vs smooth movement',
    'Designing comfortable VR UI at arm\'s length',
    'Hand tracking beats controllers for presence',
    'Mixed reality blends the desk and the digital'] },
  { tag: 'youtube', kind: 'note', titles: [
    'YouTube content creation workflow',
    'Thumbnails decide 90% of clicks',
    'Scripting a video: hook, value, payoff',
    'Editing pace keeps retention high',
    'Posting a VR demo to YouTube grew the channel'] },
  { tag: 'graph', kind: 'idea', titles: [
    'Knowledge graphs model how I actually think',
    'Backlinks turn notes into a web',
    'Force-directed layout reveals hidden clusters',
    'Spaced repetition over a graph of concepts'] },
  { tag: 'gamedev', kind: 'task', titles: [
    'Prototype the movement controller',
    'Build a procedural level generator',
    'Bake lighting for the demo scene',
    'Playtest with five friends this weekend'] },
  { tag: 'ai', kind: 'idea', titles: [
    'Embeddings let machines feel meaning',
    'On-device models keep thoughts private',
    'AI that suggests connections, not answers',
    'Summaries should become first-class nodes'] },
  { tag: 'people', kind: 'person', titles: [
    'Mira — VR artist & collaborator',
    'Theo — runs the gamedev study group',
    'Lena — editor on the YouTube channel'] },
];

const BODIES = [
  'A quick capture I want to expand later.',
  'Connecting this to other ideas in the brain.',
  'Reference: worth revisiting when I have time.',
  'This kept coming back to me, so it became a node.',
  'Part of a bigger project taking shape.',
];

export function seedBrain(store) {
  if (store.events.length) return false;
  const created = [];
  let cx = 0;
  for (const c of CLUSTERS) {
    const center = { x: Math.cos(cx) * 320, y: Math.sin(cx) * 320, z: 0 };
    cx += (Math.PI * 2) / CLUSTERS.length;
    const ids = [];
    for (const title of c.titles) {
      const n = store.createNode({
        kind: c.kind, title,
        body: BODIES[Math.floor(Math.random() * BODIES.length)],
        tags: [c.tag], near: center,
      });
      ids.push(n.id); created.push(n.id);
    }
    // intra-cluster links (loose web, not a clique)
    for (let i = 1; i < ids.length; i++) {
      store.connect(ids[i - 1], ids[i], 'reference');
      if (Math.random() < 0.4 && i >= 2) store.connect(ids[i], ids[i - 2], 'reference');
    }
    c._ids = ids;
  }
  // cross-cluster bridges — the "VR + YouTube" style connections.
  const byTag = Object.fromEntries(CLUSTERS.map((c) => [c.tag, c._ids]));
  const bridge = (t1, t2) => store.connect(
    byTag[t1][Math.floor(Math.random() * byTag[t1].length)],
    byTag[t2][Math.floor(Math.random() * byTag[t2].length)], 'manual', 1.4);
  bridge('vr', 'youtube'); bridge('vr', 'gamedev'); bridge('ai', 'graph');
  bridge('youtube', 'people'); bridge('gamedev', 'people'); bridge('ai', 'vr');
  return true;
}
