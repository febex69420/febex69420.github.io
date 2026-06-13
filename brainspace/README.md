# 🧠 BrainSpace

> Your mind, as a living graph. Not folders — a force-directed brain where every
> note, idea, task, person, file, message, and conversation is a glowing node and
> every relationship is an edge. The graph **is** the product.

This folder is a **fully working, zero-backend reference implementation** of the
BrainSpace vision. It runs entirely in the browser and deploys as static files
on GitHub Pages. The complete production architecture (multi-user real-time
collaboration, server-backed sync, real embeddings/LLM, WebGL renderer) is
specified in [`DESIGN.md`](./DESIGN.md).

## Try it

Open `index.html` via any static server (module scripts + workers need HTTP, not
`file://`):

```bash
cd brainspace
npm run serve     # or: python3 -m http.server 8080
# visit http://localhost:8080
```

Scroll the cinematic landing page (a single node grows into a whole brain), then
hit **Enter your brain**. A demo brain is seeded on first visit; it persists in
`localStorage`.

## What works today

| Feature | Status |
|---|---|
| Cinematic scroll landing (node → brain) | ✅ |
| Force-directed graph, Barnes–Hut sim in a Web Worker | ✅ |
| Pan / zoom / pinch / drag nodes / hover-neighborhood / inertia | ✅ |
| Frustum culling, spatial-hash hit-testing, LOD labels, depth/parallax, ambient particles | ✅ |
| Notes as nodes — markdown body, kinds, tags, instant graph mutation | ✅ |
| Manual connections (Connect mode / Shift-click) + backlinks | ✅ |
| On-device AI: suggested connections, clusters, tags, summaries, duplicates | ✅ |
| Galaxy search (full-text / semantic / graph) that flies to a node | ✅ |
| Timeline scrubbing + **Replay My Brain** timelapse | ✅ |
| Public-brain sharing via URL (or file export) | ✅ |
| Local-first persistence via an append-only event log | ✅ |
| Responsive desktop + mobile (touch gestures) | ✅ |
| Keyboard shortcuts (`/` `N` `C` `F` `T`) + reduced-motion support | ✅ |

## What's specified but not in this static build

These need a server and are designed (with clean interface seams) in `DESIGN.md`:
real-time multiplayer presence/cursors (CRDT + WebSockets), OAuth accounts,
cloud storage for large files, real embeddings + LLM summaries, and a
WebGL/R3F renderer for 10k→100k nodes.

## Keyboard shortcuts

`/` search · `N` new node · `C` connect mode · `F` fit graph · `T` timeline · `Esc` close

## Architecture (1-minute version)

```
events (append-only log)  ──reduce──▶  Brain {nodes, edges}
        │                                   │
   localStorage                  ┌──────────┴───────────┐
   (persistence)         GraphEngine (render)    physics.worker (Barnes–Hut)
                                  │
                       App (panels, search, timeline, AI, sharing)
```

- `js/store.js` — event log, pure reducer, persistence, timeline projection, search index
- `js/physics.worker.js` — off-thread Barnes–Hut force simulation
- `js/graph-engine.js` — camera, culling, LOD, depth rendering, interaction
- `js/ai.js` — TF-IDF + cosine suggestions / clusters / tags / summaries
- `js/landing.js` — scroll-driven cinematic graph growth
- `js/app.js` — controller wiring everything together

See [`DESIGN.md`](./DESIGN.md) for the full schema, API, real-time, AI, mobile,
scalability, and roadmap details.

## Tests

```bash
npm test          # node --test over the pure core (reducer, search, AI)
```

## License

MIT
