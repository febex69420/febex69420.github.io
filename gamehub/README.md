# GameHub 🎮

A private social platform for friend groups — **Discord-style chat**, a
**gaming session & tournament planner**, and a **TikTok-style clip vault** in one
polished, dark-mode, glassmorphic web app.

This repository contains the **frontend** (React + TypeScript + Vite), built to
run on a static host (GitHub Pages). It runs against an in-memory mock data
layer so the whole experience is interactive without a backend. The complete
production architecture — database schema, APIs, auth, realtime, media
pipeline, security, and compliance — is documented in
**[`DESIGN.md`](./DESIGN.md)**.

## ✨ Features (in this build)

- **Auth** — email/password, Google & Discord buttons, signup with age + ToS gate
- **Dashboard** — drag-to-rearrange widgets (stats, online friends, sessions,
  clips, trending, conversations, tournaments, polls, activity), persisted locally
- **Profiles** — banner, avatar, XP/levels, badges, achievements, stats, clip gallery
- **Chat** — servers, channels (text/voice/announcement), DMs & group chats,
  messages, reactions, emoji, typing indicator, pinned messages, mentions
- **Clip vault** — vertical snap feed, like/comment/save/share, trending/newest/
  most-liked/for-you sorting, game filter, drag-and-drop upload modal
- **Friends** — list, online filter, requests, add/search, mute/block/remove
- **Events** — schedule sessions, RSVP, live countdowns, recurring events
- **Tournaments** — bracket view, scores, winner progression, leaderboard
- **Settings** — profile, privacy controls, notifications, **data export &
  account deletion** (GDPR)
- **Compliance & a11y** — cookie consent, privacy/terms pages, keyboard nav,
  focus rings, reduced-motion, `aria` labels, 44px touch targets
- **Universal search** (`⌘/Ctrl-K`) across people, channels, clips, events,
  tournaments

## 🛠 Tech

React 18 · TypeScript · Vite · Tailwind CSS · Framer Motion · React Router ·
lucide-react · Vitest + Testing Library

## 🚀 Getting started

```bash
cd gamehub
npm install
npm run dev          # http://localhost:5173
```

Other scripts:

```bash
npm run build        # type-check + production build to dist/
npm run preview      # preview the production build
npm test             # run the unit tests
```

There are no required environment variables for the mock build. See
[`.env.example`](./.env.example) for the production wiring (API/WS URLs, OAuth
client IDs, CDN). No secrets are committed.

## 🌐 Deploying to GitHub Pages

The app is built with `base: './'` and uses `HashRouter`, so it works from any
sub-path and survives page refreshes without server rewrites.

**Option A — serve the built output from a sub-path (no Pages config change):**

```bash
npm run build
# commit the generated dist/ (or copy it to a folder served by Pages)
```

Once on the default branch it is reachable at
`https://<user>.github.io/gamehub/dist/`.

**Option B — dedicated Pages deploy via GitHub Actions** (recommended for a
standalone deployment): use the official `actions/deploy-pages` workflow to
publish `gamehub/dist` as the site for a repo whose Pages source is "GitHub
Actions". Don't enable this on a repo whose root already serves another site,
or it will replace it.

## 🧪 Testing & CI

`npm test` runs Vitest. `.github/workflows/gamehub.yml` type-checks, tests, and
builds on every push and pull request touching `gamehub/`.

## 📁 Structure

See [`DESIGN.md` §12](./DESIGN.md#12-frontend-architecture-this-repo) for the
full layout and the mock→API swap point.
