// app.js — controller. Wires DOM panels <-> Store <-> GraphEngine, plus search,
// timeline/replay, AI panel, and URL-based brain sharing.

import { Store, colorFor, NODE_KINDS } from './store.js';
import { GraphEngine } from './graph-engine.js';
import { AI } from './ai.js';
import { seedBrain } from './seed.js';
import { initLanding } from './landing.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const store = new Store();
let engine = null;
let searchMode = 'text';
let replayTimer = null;

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------
function boot() {
  // shared brain via URL: #brain=<base64 json>
  let imported = false;
  if (location.hash.startsWith('#brain=')) {
    try {
      const snap = JSON.parse(decodeURIComponent(escape(atob(location.hash.slice(7)))));
      store.importSnapshot(snap);
      imported = true;
    } catch (e) { console.warn('bad shared brain', e); }
  }
  if (!imported) {
    store.load();
    if (!store.events.length) seedBrain(store);
  }

  initLanding({
    canvas: $('#landing-canvas'),
    scenes: $$('.scene'),
    onEnter: enterApp,
  });

  $$('[data-enter]').forEach((b) => b.addEventListener('click', enterApp));
  if (imported || location.hash === '#app') enterApp();
}

function enterApp() {
  if ($('#app').classList.contains('active')) return;
  $('#app').classList.add('active');
  document.body.style.overflow = 'hidden';
  if (!engine) {
    engine = new GraphEngine($('#graph-canvas'), store);
    engine.addEventListener('select', (e) => openInspector(e.detail.id));
    engine.addEventListener('stats', (e) => {
      $('#stat-nodes').textContent = `${e.detail.total} nodes`;
      $('#stat-edges').textContent = `${e.detail.edges} links`;
    });
    setTimeout(() => engine.fit(), 200);
  }
  wireApp();
}

// ---------------------------------------------------------------------------
// app UI wiring
// ---------------------------------------------------------------------------
let wired = false;
function wireApp() {
  if (wired) return; wired = true;

  // search / command bar
  const input = $('#cmd-input');
  input.addEventListener('input', () => runSearch(input.value));
  input.addEventListener('keydown', (e) => {
    const results = $$('.result');
    if (e.key === 'Enter' && results[0]) results[0].click();
    if (e.key === 'Escape') { input.value = ''; $('#cmd-results').innerHTML = ''; input.blur(); }
  });
  $$('.cmd-mode').forEach((m) => m.addEventListener('click', () => {
    searchMode = m.dataset.mode;
    $$('.cmd-mode').forEach((x) => x.classList.toggle('active', x === m));
    runSearch(input.value);
  }));

  // rail
  $('#tool-new').addEventListener('click', () => createNoteAtCenter());
  $('#tool-fit').addEventListener('click', () => engine.fit());
  $('#tool-ai').addEventListener('click', runAISuggestions);
  $('#tool-connect').addEventListener('click', toggleConnect);
  $('#tool-share').addEventListener('click', shareBrain);
  $('#tool-cluster').addEventListener('click', applyClusters);

  // timeline
  const tl = $('#timeline-range');
  tl.addEventListener('input', () => scrubTo(+tl.value));
  $('#timeline-play').addEventListener('click', toggleReplay);
  refreshTimeline();
  store.addEventListener('change', refreshTimeline);

  // keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea')) return;
    if (e.key === '/') { e.preventDefault(); input.focus(); }
    else if (e.key === 'n') createNoteAtCenter();
    else if (e.key === 'f') engine.fit();
    else if (e.key === 't') tl.focus();
    else if (e.key === 'c') toggleConnect();
    else if (e.key === 'Escape') closeInspector();
  });
  // note: the inspector's own close button is (re)bound inside openInspector,
  // since the panel's markup is rebuilt each time a node is opened.
}

// ---------------------------------------------------------------------------
// search
// ---------------------------------------------------------------------------
function runSearch(q) {
  const box = $('#cmd-results');
  if (!q.trim()) { box.innerHTML = ''; return; }
  const results = store.search(q, searchMode);
  box.className = 'cmd-results glass';
  box.innerHTML = results.map((r) => `
    <div class="result" data-id="${r.node.id}">
      <span class="swatch" style="color:${colorFor(r.node.kind)};background:${colorFor(r.node.kind)}"></span>
      <span class="t">${esc(r.node.title)}</span>
      <span class="k">${r.node.kind}</span>
    </div>`).join('') || '<div class="result"><span class="t" style="color:var(--ink-faint)">No matches in this brain</span></div>';
  $$('.result', box).forEach((el) => el.addEventListener('click', () => {
    const id = el.dataset.id; if (!id) return;
    engine.flyTo(id, 2.0);     // galaxy fly-to
    $('#cmd-input').value = ''; box.innerHTML = '';
    openInspector(id);
  }));
}

// ---------------------------------------------------------------------------
// notes / inspector
// ---------------------------------------------------------------------------
function createNoteAtCenter() {
  const near = engine ? { x: engine.cam.x, y: engine.cam.y, z: 0 } : null;
  const node = store.createNode({ kind: 'note', title: 'New thought', body: '', near });
  engine.flyTo(node.id, 1.8);
  openInspector(node.id);
  setTimeout(() => { const t = $('.insp-body .title'); if (t) { t.focus(); t.select(); } }, 120);
  toast('Node created — it just appeared in your brain');
}

function openInspector(id) {
  const n = store.brain.nodes.get(id);
  if (!n) return;
  const insp = $('#inspector');
  insp.classList.add('open');
  insp.dataset.id = id;

  const kindOpts = NODE_KINDS.map((k) => `<option value="${k}" ${k === n.kind ? 'selected' : ''}>${k}</option>`).join('');
  const backlinks = neighbors(id);
  const tagsHtml = (n.tags || []).map((t) => `<span class="tag">${esc(t)}<span class="x" data-tag="${esc(t)}">×</span></span>`).join('');

  insp.innerHTML = `
    <div class="insp-head glass" style="border:none;box-shadow:none;background:transparent;border-radius:0">
      <span class="swatch" style="width:11px;height:11px;border-radius:50%;color:${colorFor(n.kind)};background:${colorFor(n.kind)};box-shadow:0 0 12px 1px ${colorFor(n.kind)}"></span>
      <select id="insp-kind">${kindOpts}</select>
      <span class="close" id="insp-close">×</span>
    </div>
    <div class="insp-body">
      <input class="title" value="${esc(n.title)}" />
      <textarea placeholder="Write in markdown… links between ideas form your brain.">${esc(n.body)}</textarea>
      <div class="tags">${tagsHtml}<span class="mini" id="add-tag">+ tag</span></div>

      <div class="section-label">AI</div>
      <div class="ai-card">
        <div class="sum" id="ai-sum">Generating summary…</div>
      </div>
      <div id="ai-tags"></div>
      <div id="ai-connections"></div>

      <div class="section-label">Connections (${backlinks.length})</div>
      <div id="backlinks">${backlinks.map((b) => `
        <div class="backlink" data-id="${b.id}">
          <span class="swatch" style="width:8px;height:8px;border-radius:50%;color:${colorFor(b.kind)};background:${colorFor(b.kind)}"></span>
          <span style="flex:1">${esc(b.title)}</span>
          <span class="mini" data-unlink="${b.edgeId}">unlink</span>
        </div>`).join('') || '<div style="color:var(--ink-faint);font-size:13px">No connections yet. Use Connect mode (C) or accept an AI suggestion.</div>'}</div>

      <div style="margin-top:18px;display:flex;gap:8px">
        <span class="mini" id="insp-delete" style="color:#ff8b8b">delete node</span>
      </div>
    </div>`;

  // bind edits (debounced)
  const titleEl = $('.title', insp), bodyEl = $('textarea', insp);
  let timer;
  const commit = () => store.updateNode(id, { title: titleEl.value || 'Untitled', body: bodyEl.value });
  [titleEl, bodyEl].forEach((el) => el.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(commit, 350); }));
  $('#insp-kind', insp).addEventListener('change', (e) => store.updateNode(id, { kind: e.target.value }));
  $('#insp-close', insp).addEventListener('click', closeInspector);
  $('#insp-delete', insp).addEventListener('click', () => { store.deleteNode(id); closeInspector(); toast('Node dissolved'); });

  $('#add-tag', insp).addEventListener('click', () => {
    const t = prompt('Add a tag'); if (!t) return;
    store.updateNode(id, { tags: [...new Set([...(n.tags || []), t.trim().toLowerCase()])] });
    openInspector(id);
  });
  $$('.tag .x', insp).forEach((x) => x.addEventListener('click', () => {
    store.updateNode(id, { tags: (n.tags || []).filter((t) => t !== x.dataset.tag) });
    openInspector(id);
  }));
  $$('.backlink', insp).forEach((b) => b.addEventListener('click', (e) => {
    if (e.target.dataset.unlink) { store.disconnect(e.target.dataset.unlink); openInspector(id); return; }
    engine.flyTo(b.dataset.id, 1.8); openInspector(b.dataset.id);
  }));

  // AI: summary, tag suggestions, connection suggestions for this node
  requestAnimationFrame(() => populateAI(id));
}

function populateAI(id) {
  const n = store.brain.nodes.get(id); if (!n) return;
  const insp = $('#inspector'); if (insp.dataset.id !== id) return;

  const sum = AI.summarize([n, ...neighbors(id).map((b) => store.brain.nodes.get(b.id)).filter(Boolean)]);
  if ($('#ai-sum', insp)) $('#ai-sum', insp).textContent = sum;

  const tags = AI.suggestTags(n, store.brain).slice(0, 4);
  if ($('#ai-tags', insp) && tags.length) {
    $('#ai-tags', insp).innerHTML = `<div style="font-size:12px;color:var(--ink-faint);margin:4px 0">Suggested tags:</div>` +
      tags.map((t) => `<span class="mini" data-addtag="${esc(t)}" style="margin:0 4px 4px 0;display:inline-block">+ ${esc(t)}</span>`).join('');
    $$('[data-addtag]', insp).forEach((el) => el.addEventListener('click', () => {
      store.updateNode(id, { tags: [...new Set([...(n.tags || []), el.dataset.addtag])] }); openInspector(id);
    }));
  }

  const all = AI.suggestConnections(store.brain, { threshold: 0.16, max: 60 })
    .filter((s) => s.source === id || s.target === id).slice(0, 4);
  const box = $('#ai-connections', insp);
  if (box && all.length) {
    box.innerHTML = `<div style="font-size:12px;color:var(--ink-faint);margin:8px 0 4px">AI suggests connecting to:</div>` +
      all.map((s) => {
        const otherId = s.source === id ? s.target : s.source;
        const other = store.brain.nodes.get(otherId);
        return `<div class="suggestion"><span class="s-text">${esc(other?.title || '')} <span style="color:var(--ink-faint)">· ${s.shared.join(', ')}</span></span>
          <span class="mini" data-accept="${otherId}">connect</span></div>`;
      }).join('');
    $$('[data-accept]', box).forEach((el) => el.addEventListener('click', () => {
      store.connect(id, el.dataset.accept, 'ai-suggested', 1.3); openInspector(id); toast('AI connection accepted');
    }));
  }
}

function closeInspector() { const i = $('#inspector'); i.classList.remove('open'); i.dataset.id = ''; if (engine) engine.selected = null; }

function neighbors(id) {
  const out = [];
  for (const e of store.brain.edges.values()) {
    let other = null;
    if (e.source === id) other = e.target; else if (e.target === id) other = e.source;
    if (other) { const n = store.brain.nodes.get(other); if (n) out.push({ id: other, title: n.title, kind: n.kind, edgeId: e.id }); }
  }
  return out;
}

// ---------------------------------------------------------------------------
// AI actions (brain-wide)
// ---------------------------------------------------------------------------
function runAISuggestions() {
  const suggestions = AI.suggestConnections(store.brain, { threshold: 0.2, max: 14 });
  if (!suggestions.length) { toast('No new connections found — your brain is well linked'); return; }
  let added = 0;
  for (const s of suggestions) { store.connect(s.source, s.target, 'ai-suggested', 1.3); added++; }
  toast(`AI wove ${added} new connection${added > 1 ? 's' : ''} (gold links)`);
  engine.fit();
}

function applyClusters() {
  const clusters = AI.suggestClusters(store.brain);
  if (!clusters.length) { toast('Not enough structure to cluster yet'); return; }
  toast(`Found ${clusters.length} idea clusters: ${clusters.slice(0, 3).map((c) => c.label).join(', ')}…`);
}

function toggleConnect() {
  const btn = $('#tool-connect');
  if (engine.connectFrom) { engine.connectFrom = null; btn.classList.remove('active'); toast('Connect cancelled'); return; }
  btn.classList.toggle('active');
  toast(btn.classList.contains('active')
    ? 'Connect mode: click two nodes to link them (or Shift-click)'
    : 'Connect mode off');
}

// ---------------------------------------------------------------------------
// timeline + replay
// ---------------------------------------------------------------------------
function refreshTimeline() {
  const tl = $('#timeline-range'); if (!tl) return;
  const [a, b] = store.span;
  tl.min = a || 0; tl.max = b || 1;
  if (!replayTimer) { tl.value = tl.max; $('#timeline-ts').textContent = 'now'; }
}
function scrubTo(cutoff) {
  const proj = store.projectionAt(cutoff);
  const brain = store.brain;
  // temporarily swap brain projection for rendering
  engine.store.brain = proj; engine._syncGraph();
  engine.store.brain = brain; // restore model; engine keeps projection positions
  const [a, b] = store.span;
  const pct = b > a ? Math.round(((cutoff - a) / (b - a)) * 100) : 100;
  $('#timeline-ts').textContent = cutoff >= b ? 'now' : `${pct}% · ${proj.nodes.size} nodes`;
}
function toggleReplay() {
  const btn = $('#timeline-play'), tl = $('#timeline-range');
  if (replayTimer) { clearInterval(replayTimer); replayTimer = null; btn.textContent = '▶'; refreshTimeline(); scrubTo(+tl.max); return; }
  btn.textContent = '⏸';
  const [a, b] = store.span;
  let cur = a;
  const step = Math.max(1, (b - a) / 120);
  toast('Replaying your brain from the beginning…');
  replayTimer = setInterval(() => {
    cur += step; tl.value = cur; scrubTo(cur);
    if (cur >= b) { clearInterval(replayTimer); replayTimer = null; btn.textContent = '▶'; refreshTimeline(); scrubTo(b); toast('Replay complete'); }
  }, 60);
}

// ---------------------------------------------------------------------------
// sharing
// ---------------------------------------------------------------------------
async function shareBrain() {
  const snap = store.exportSnapshot();
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(snap))));
  const url = `${location.origin}${location.pathname}#brain=${encoded}`;
  try {
    if (url.length < 30000 && navigator.clipboard) { await navigator.clipboard.writeText(url); toast('Public brain link copied to clipboard'); }
    else throw new Error('too big for url');
  } catch {
    // fall back to downloading the snapshot file
    const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'my-brain.json'; a.click();
    toast('Brain exported as a file (too large for a URL)');
  }
}

// ---------------------------------------------------------------------------
// utils
// ---------------------------------------------------------------------------
let toastTimer;
function toast(msg) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('show', 'glass');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

boot();
