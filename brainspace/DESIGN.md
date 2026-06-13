# BrainSpace — Architecture & Design Document

> A living, interactive, visual brain. Not folders — a graph. Every note, image,
> task, message, file, person, idea, link, AI summary, and conversation is a
> **node**; every relationship is an **edge**. The graph *is* the product.

---

## 0. Document status & scope

This repository ships a **fully working, self-contained reference
implementation** of BrainSpace that runs as a static web app (it deploys on
GitHub Pages with zero backend). It implements the parts that make the vision
tangible and that can run client-only:

- Cinematic scrolling landing page (a single node grows into a brain).
- A GPU-friendly force-directed graph engine (Barnes–Hut simulation in a Web
  Worker, depth/parallax rendering, LOD, frustum culling, spatial hashing).
- Notes-as-nodes with markdown, tags, backlinks, and instant graph mutation.
- Local-first persistence with an append-only event log → **timeline travel**
  and **Replay My Brain**.
- Heuristic on-device "AI" (TF-IDF + cosine similarity) that suggests
  connections, clusters, tags, and duplicates.
- Galaxy-style search that flies the camera to a node.
- Public-brain sharing via URL-encoded snapshots.

The sections below also specify the **full production platform** (multi-user,
real-time, server-backed). Where a feature is server-dependent, this document
describes the target architecture and the reference app stubs the seam behind a
clean interface (e.g. `SyncProvider`, `AIProvider`) so the local implementation
can be swapped for the networked one without touching UI code.

---

## 1. Product principles

1. **The graph is the home screen.** There is no folder tree, no inbox, no
   list-first view. Every surface is a lens onto the same graph.
2. **Local-first.** The app is fully usable offline; the server is a sync and
   collaboration layer, never a hard dependency for single-player use.
3. **Everything is a node.** A uniform `Node` type with a `kind` discriminator
   means one renderer, one search index, one AI pipeline serve all content.
4. **History is a first-class dimension.** State is derived from an append-only
   event log, which makes timeline scrubbing and replay free.
5. **Performance is a feature.** 10k nodes / 50k edges at 60fps is a hard
   requirement; rendering, physics, and data are all designed around it.

---

## 2. Data model

### 2.1 Core types (see `js/store.js`)

```ts
type NodeKind =
  | 'note' | 'image' | 'task' | 'message' | 'file'
  | 'person' | 'idea' | 'link' | 'ai-summary' | 'conversation' | 'cluster';

interface Node {
  id: string;            // ULID — sortable by creation time
  kind: NodeKind;
  title: string;
  body: string;          // markdown
  tags: string[];
  meta: Record<string, unknown>; // kind-specific (url, mime, assignee, …)
  x: number; y: number; z: number; // layout position (z = depth)
  vx: number; vy: number;          // velocity (owned by physics worker)
  pinned: boolean;       // user-positioned nodes are excluded from sim
  createdAt: number; updatedAt: number;
  authorId: string;
}

interface Edge {
  id: string;
  source: string; target: string;
  kind: 'manual' | 'reference' | 'ai-suggested' | 'reply' | 'tag';
  weight: number;        // affects spring rest length & visual thickness
  createdAt: number;
}

interface Brain {
  id: string;
  ownerId: string;
  name: string;
  visibility: 'public' | 'private' | 'shared' | 'invite-only' | 'partial';
  nodes: Map<string, Node>;
  edges: Map<string, Edge>;
}
```

### 2.2 Event log (the source of truth)

State is never mutated directly by the UI. Instead the UI dispatches **events**:

```ts
type Event =
  | { t: 'node.create'; node: Node }
  | { t: 'node.update'; id: string; patch: Partial<Node> }
  | { t: 'node.move';   id: string; x: number; y: number; z: number }
  | { t: 'node.delete'; id: string }
  | { t: 'edge.create'; edge: Edge }
  | { t: 'edge.delete'; id: string };
```

Each event carries a Lamport timestamp and author id. `reduce(events)` →
`Brain`. Because the reducer is pure, we get:

- **Timeline travel**: `reduce(events.filter(e => e.ts <= cutoff))`.
- **Replay**: animate the cutoff from 0 → now.
- **Undo/redo**: pop/replay tail events.
- **Sync**: events are the unit shipped over the wire (see §6).

The reference app persists the log to `localStorage` (and an in-memory
snapshot). Production persists to Postgres (`events` table, partitioned by
`brain_id`).

---

## 3. Database schema (production / Supabase + Postgres)

```sql
create table users (
  id uuid primary key default gen_random_uuid(),
  handle text unique not null,
  display_name text, avatar_url text,
  created_at timestamptz default now()
);

create table brains (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references users(id),
  name text not null,
  visibility text not null default 'private'
    check (visibility in ('public','private','shared','invite-only','partial')),
  created_at timestamptz default now()
);

create table brain_members (
  brain_id uuid references brains(id),
  user_id uuid references users(id),
  role text not null check (role in ('owner','editor','commenter','viewer')),
  primary key (brain_id, user_id)
);

-- append-only; never UPDATE/DELETE. Projections are derived.
create table events (
  id bigserial primary key,
  brain_id uuid references brains(id),
  author_id uuid references users(id),
  lamport bigint not null,
  payload jsonb not null,
  created_at timestamptz default now()
);
create index on events (brain_id, lamport);

-- materialized current state for fast initial load / search
create table nodes (
  id text primary key, brain_id uuid references brains(id),
  kind text, title text, body text, tags text[],
  meta jsonb, x real, y real, z real,
  embedding vector(384),            -- pgvector for semantic search
  created_at timestamptz, updated_at timestamptz
);
create index on nodes using ivfflat (embedding vector_cosine_ops);
create index nodes_fts on nodes using gin (to_tsvector('english', title||' '||body));

create table edges (
  id text primary key, brain_id uuid references brains(id),
  source text, target text, kind text, weight real
);
```

Row-Level Security enforces visibility: a `select` on `nodes` joins
`brain_members`/`brains.visibility` so private brains are never leaked.

---

## 4. API structure (production)

REST + Realtime, all under `/api`:

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/brains` | create brain |
| `GET`  | `/api/brains/:id/snapshot` | materialized nodes+edges (initial load) |
| `GET`  | `/api/brains/:id/events?since=:lamport` | delta sync |
| `POST` | `/api/brains/:id/events` | append a batch of events |
| `GET`  | `/api/search?q=&brain=&mode=text|semantic|graph` | search |
| `POST` | `/api/ai/suggest` | connection/cluster/tag suggestions |
| `POST` | `/api/ai/summarize` | node/cluster summary |
| `GET`  | `/api/u/:handle` | public brain by handle (visibility-gated) |
| `WS`   | `/api/realtime/:brainId` | presence + live events (see §6) |

The reference app implements `GET snapshot`, `events`, `search`, and `ai/*`
**in the browser** against `store.js`, behind the same call signatures so the
swap to `fetch()` is mechanical.

---

## 5. Graph rendering engine (`js/graph-engine.js`)

The single most important piece. Design for **10k nodes / 50k edges @ 60fps**.

### 5.1 Pipeline
```
events ──reduce──> Brain ──> physics worker (Barnes–Hut, 60fps off-thread)
                                   │ transferable Float32Array of positions
                                   ▼
        main thread: camera → frustum cull → spatial-hash query → LOD bucket
                                   ▼
                 batched Canvas2D / WebGL draw (edges first, nodes, labels)
```

### 5.2 Techniques
- **Barnes–Hut quadtree** O(n log n) repulsion, run in a **Web Worker** so the
  UI thread never blocks. Positions ship back as a transferable `Float32Array`.
- **Spatial hash grid** on the main thread for hit-testing and viewport queries
  (hover/drag/cull) in O(1) average.
- **Frustum culling**: only draw nodes whose screen-projected bounds intersect
  the viewport (+margin for inertia).
- **Level of Detail (LOD)**: 3 tiers by zoom × node importance —
  (a) glow sprite only, (b) glow + dot, (c) glow + dot + label. Labels are the
  expensive part and are gated hard.
- **Depth (pseudo-3D)**: each node has a `z`; depth controls radius, blur,
  brightness, and parallax pan speed → the neural-net "volume" look without a
  full 3D scene graph. (Production upgrades this seam to React Three Fiber /
  instanced `THREE.Points` + a custom bloom shader.)
- **Batching**: edges drawn in a single path per color bucket; nodes drawn as
  cached radial-gradient sprites blitted with `drawImage` (no per-frame
  gradient creation).
- **Inertia & easing**: camera pan/zoom use critically-damped springs;
  fly-to-node uses an eased cubic over distance.
- **requestAnimationFrame** governs render; physics ticks are decoupled and
  interpolated so a slow sim never stutters the camera.

### 5.3 Interaction
Pan (drag bg), zoom (wheel / pinch), rotate-around (alt-drag — affects parallax
axis), drag nodes (pins them), hover (highlight neighborhood, dim the rest),
keyboard (`/` search, `t` timeline, `n` new note, `f` fit, arrows to walk
neighbors). Touch: one finger pan, two finger pinch-zoom + rotate. All gestures
share one pointer-event abstraction.

---

## 6. Real-time collaboration (production)

- **Transport**: WebSocket per brain room (Supabase Realtime / a Node `ws`
  service). Presence channel for cursors + selection.
- **Conflict resolution**: the event log is **CRDT-friendly**. Node positions
  use a **LWW register** keyed by `(lamport, authorId)`; node bodies use a text
  CRDT (Yjs `Y.Text`) so concurrent edits merge without conflict; the set of
  nodes/edges is an **OR-Set** (add/remove tagged with unique ids). This means
  any two replicas converge regardless of delivery order — no central lock.
- **Presence**: cursors, viewport rectangles, selection, and typing indicators
  broadcast on a throttled (20–30Hz) ephemeral channel, never persisted.
- **Optimistic local apply**: events apply locally immediately, ship async,
  reconcile on ack. The reference app already applies optimistically (there is
  just no socket yet), so this is a transport swap.

---

## 7. AI integration layer (`js/ai.js`)

Interface `AIProvider`:
```ts
interface AIProvider {
  embed(text: string): Promise<Float32Array>;
  suggestConnections(node: Node, all: Node[]): Suggestion[];
  suggestClusters(nodes: Node[]): Cluster[];
  summarize(nodes: Node[]): Promise<string>;
  suggestTags(node: Node): string[];
}
```
- **Reference (on-device)**: TF-IDF vectors + cosine similarity for connection &
  duplicate detection; community detection (label propagation) for clusters;
  frequency/keyword extraction for tags. Zero network, instant, private.
- **Production**: same interface backed by an embedding model (e.g. via the
  Claude API for summaries + a sentence-embedding model for vectors stored in
  pgvector). Summaries become `ai-summary` nodes wired into the graph.

The "VR + YouTube → suggested connection" behavior in the prompt is implemented
by `suggestConnections`: shared salient terms above a similarity threshold
create an `ai-suggested` edge the user can accept or dismiss.

---

## 8. Auth, storage, sync, deployment

- **Auth (production)**: Supabase Auth / OAuth (Google, GitHub, Apple). JWT in
  httpOnly cookie; RLS keys on `auth.uid()`. Reference app uses an anonymous
  local identity (a generated `authorId`) so it works with no login.
- **Storage**: large blobs (images/files/voice) → object storage (Supabase
  Storage / S3); the graph stores only a `file` node with a URL + thumbnail.
- **Sync strategy**: local-first event log → background push/pull of event
  deltas (`since=:lamport`) → CRDT merge. Service Worker caches the app shell
  and last snapshot for offline.
- **Deployment**: reference app = static files on GitHub Pages / any CDN.
  Production = Next.js on Vercel (edge) + Supabase (Postgres, Auth, Realtime,
  Storage) + a small WS fan-out service for high-frequency presence.

---

## 9. Mobile strategy

One responsive codebase. The canvas engine is pointer/touch-unified, so the
graph is fully interactive on phones. UI panels collapse into a bottom sheet;
the command bar becomes a floating action button. A later React Native / Capacitor
wrapper can reuse the web engine in a WebView with native auth + push, since all
rendering already runs in the browser.

---

## 10. Folder structure (reference app)

```
brainspace/
  index.html          # app shell + landing, mounts everything
  DESIGN.md           # this file
  README.md           # quickstart + feature map
  css/
    base.css          # tokens, glass primitives, layout
    landing.css       # cinematic scroll scenes
    app.css           # panels, command bar, timeline, inspector
  js/
    store.js          # event log, reducer, persistence, timeline, search index
    physics.worker.js # Barnes–Hut force simulation (off main thread)
    graph-engine.js   # camera, culling, LOD, depth render, interaction
    ai.js             # TF-IDF + cosine suggestions/clusters/tags/summaries
    landing.js        # scroll-driven cinematic graph growth
    app.js            # wiring: panels, notes, search, timeline, sharing
    seed.js           # demo brain generator (procedural knowledge graph)
  tests/
    store.test.mjs    # reducer, timeline, search invariants
```

### Component architecture
- `Store` (model) is UI-agnostic and emits change events.
- `GraphEngine` (view) subscribes to `Store` and renders; it knows nothing about
  panels.
- `App` (controller) wires DOM panels ↔ store ↔ engine.
- Providers (`AIProvider`, `SyncProvider`) are interfaces with a local default
  impl and a documented network impl seam.

---

## 11. Future expansion roadmap

1. **Networked multiplayer** — swap `SyncProvider` to WebSocket + Yjs; presence.
2. **Real embeddings + LLM summaries** via Claude API; `ai-summary` nodes.
3. **WebGL/R3F renderer** with instanced points + bloom for true 3D + 10k→100k.
4. **Voice rooms** (WebRTC) as `conversation` nodes with live transcript nodes.
5. **Communities & channels** as shared brains with message-nodes.
6. **Native apps** (Capacitor) + push notifications + offline sync.
7. **Brain marketplace** — publish/fork public brains, embeddable widgets.
8. **Graph analytics** — centrality, knowledge gaps, "what should I learn next".

---

## 12. Testing, a11y, security

- **Tests**: pure reducer + search are unit-tested (`tests/`), runnable with
  `node --test`. Engine has manual perf harness (`?bench=10000`).
- **Accessibility**: full keyboard nav, focus-visible rings, ARIA on panels,
  `prefers-reduced-motion` disables ambient particles & camera easing, a
  high-contrast list view of nodes for screen readers.
- **Security**: markdown is sanitized before render (no raw HTML injection);
  shared snapshots are validated on import; production uses RLS + parametrized
  queries + signed storage URLs.
