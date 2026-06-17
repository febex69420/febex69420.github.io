# GameHub — Architecture & Design Document

> A private social platform for friend groups that unifies **Discord-style
> communication**, a **gaming session & tournament planner**, and a **gaming clip
> vault** into a single product.

This document is the planning artifact requested before implementation. It
describes the full production system. The code in this repository implements the
**frontend** (React + TypeScript) running against an **in-memory mock data
layer** so it can be hosted statically on GitHub Pages; every mock seam maps
directly to a production API described below.

---

## 1. Product overview

| Pillar | What it does |
|--------|--------------|
| **Communication** | Servers, channels (text/voice/announcement), DMs & group chats, threads, reactions, replies, mentions, edits, pins, typing indicators, read receipts, search, file/image/GIF uploads, WebRTC voice rooms. |
| **Planning** | Game-session scheduling, RSVP, time/game voting, reminders, recurring events, calendar & timeline views, countdowns, attendance history. |
| **Tournaments** | Creation, automatic bracket generation, teams, match scheduling, score reporting, progression, leaderboards, history. |
| **Clip vault** | TikTok-style vertical feed, upload + thumbnail generation, transcoding, likes/comments/reactions/save/share/report, trending/newest/most-liked/recommended, per-game/creator/tag organization, creator stats. |
| **Identity & social** | Email/Google/Discord auth, rich profiles, XP/levels/badges/achievements/streaks, friends, blocking/muting, presence, privacy controls. |
| **Platform** | Notifications (in-app + push), universal search, polls, leaderboards, moderation, admin dashboards, analytics, full legal/privacy/compliance surface. |

---

## 2. High-level architecture

```
                    ┌────────────────────────────────────────────┐
   Browser / PWA ──▶│  CDN + Edge (static SPA, images, clips)      │
        │           └────────────────────────────────────────────┘
        │ HTTPS / WSS
        ▼
┌──────────────────┐   ┌───────────────────────────────────────────────┐
│  API Gateway     │──▶│  Auth service     (OAuth, sessions, JWT/refresh) │
│  (REST + WS)     │   │  Core API         (users, friends, servers…)     │
│  rate-limit, WAF │   │  Realtime gateway (WebSocket fan-out, presence)  │
└──────────────────┘   │  Media service    (uploads, transcode, thumbs)   │
        │              │  Notification svc (fan-out, web-push, email)     │
        │              │  Search service   (indexing + query)             │
        ▼              │  Moderation svc   (reports, audit, automod)      │
┌──────────────────┐   └───────────────────────────────────────────────┘
│ PostgreSQL (RDS) │   ┌───────────────┐ ┌───────────┐ ┌────────────────┐
│ + read replicas  │   │ Redis (cache, │ │ S3 / R2   │ │ OpenSearch     │
└──────────────────┘   │ presence,     │ │ (media)   │ │ (search index) │
                       │ pub/sub, rate)│ └───────────┘ └────────────────┘
                       └───────────────┘   + SFU (mediasoup) for voice
```

**Why this shape**

- **Stateless API + Redis pub/sub** lets the WebSocket gateway scale
  horizontally; any node can deliver an event to any connected client.
- **Media is offloaded** to object storage + a transcoding pipeline so the API
  never streams bytes. The CDN serves HLS renditions.
- **Search is a dedicated index** (OpenSearch) rather than `LIKE` queries, so
  universal search stays fast across users/messages/clips/events.

### Recommended stack

- **Frontend:** React 18 + TypeScript, Vite, Tailwind, Framer Motion, React
  Router, TanStack Query (server cache), Zustand/Context (UI state), `react-window`/virtuoso (virtualization).
- **Backend:** Node.js (NestJS or Fastify) **or** Go for the realtime gateway;
  PostgreSQL 15 + Prisma/Drizzle; Redis 7; OpenSearch; S3/Cloudflare R2 + CloudFront.
- **Realtime:** WebSocket (socket.io / native ws) for chat/presence/notifications;
  **mediasoup** SFU for scalable WebRTC voice.
- **Media:** FFmpeg workers (transcode → HLS, generate thumbnail/poster), virus
  scanning (ClamAV), perceptual hashing for dedupe/abuse.
- **Infra:** Containers on ECS/Kubernetes, Terraform IaC, GitHub Actions CI/CD.

---

## 3. Data model (PostgreSQL)

Core tables (abbreviated; all have `id uuid pk`, `created_at`, `updated_at`,
soft-delete `deleted_at` where relevant). The TypeScript types in
`src/types/index.ts` mirror these.

```sql
users(id, email UNIQUE, email_verified_at, username UNIQUE, display_name,
      password_hash NULL, avatar_url, banner_url, bio, status, status_message,
      level, xp, theme, age_verified, created_at)
oauth_identities(id, user_id→users, provider, provider_user_id UNIQUE(provider,_))
sessions(id, user_id→users, refresh_token_hash, user_agent, ip, expires_at, revoked_at)

friendships(id, requester_id→users, addressee_id→users, state, created_at,
            UNIQUE(requester_id, addressee_id))   -- state: pending|accepted
blocks(blocker_id→users, blocked_id→users, PRIMARY KEY(blocker, blocked))
mutes(user_id, target_id, scope)                  -- scope: user|server|channel

servers(id, owner_id→users, name, icon_url)
server_members(server_id→servers, user_id→users, nickname, joined_at,
               PRIMARY KEY(server_id, user_id))
roles(id, server_id→servers, name, permissions BIGINT)        -- bitfield
member_roles(server_id, user_id, role_id)
channels(id, server_id→servers NULL, name, type, topic, is_private, position)
channel_overwrites(channel_id, role_id NULL, user_id NULL, allow BIGINT, deny BIGINT)

dm_threads(id, is_group, name NULL)
dm_participants(thread_id→dm_threads, user_id→users)

messages(id, channel_id→channels NULL, thread_id→dm_threads NULL, author_id→users,
         content, reply_to_id→messages NULL, edited_at, pinned, created_at)
   INDEX(channel_id, created_at DESC)             -- pagination
attachments(id, message_id→messages, type, url, mime, size, width, height)
reactions(message_id→messages, user_id→users, emoji, PRIMARY KEY(message_id,user_id,emoji))
read_state(user_id, channel_id, last_read_message_id, mention_count)
mentions(message_id, mentioned_user_id)

clips(id, author_id→users, title, game, status, hls_url, thumbnail_url,
      duration_ms, width, height, views, created_at)
   INDEX(game, created_at DESC), INDEX(author_id)
clip_likes(clip_id→clips, user_id→users, PRIMARY KEY(clip_id, user_id))
clip_comments(id, clip_id→clips, author_id→users, content, created_at)
clip_saves(clip_id, user_id), clip_tags(clip_id, tag)

game_sessions(id, host_id→users, title, game, starts_at, duration_min,
              recurrence, color)
session_invites(session_id→game_sessions, user_id→users, rsvp)  -- going|maybe|declined
session_time_votes(session_id, user_id, proposed_time)
session_game_votes(session_id, user_id, game)

tournaments(id, name, game, status, starts_at, format)
tournament_teams(id, tournament_id→tournaments, name, seed)
tournament_team_members(team_id, user_id)
matches(id, tournament_id, round, team_a_id, team_b_id, score_a, score_b, winner_id)

notifications(id, user_id→users, type, actor_id→users NULL, payload JSONB,
              read_at, created_at)   INDEX(user_id, created_at DESC)
push_subscriptions(id, user_id, endpoint, p256dh, auth)
polls(id, owner_id, question, closes_at, context_type, context_id)
poll_options(id, poll_id, label), poll_votes(poll_id, option_id, user_id)

achievements(id, key, name, description, icon, tier)
user_achievements(user_id, achievement_id, progress, unlocked_at)
badges(...), user_badges(...)
activity_streaks(user_id, current, longest, last_active_on)

reports(id, reporter_id, target_type, target_id, reason, status, created_at)
moderation_actions(id, moderator_id, target_user_id, action, reason, expires_at)
audit_log(id, actor_id, action, entity_type, entity_id, metadata JSONB, ip, created_at)
consents(user_id, kind, granted, updated_at)   -- cookies, marketing, tos_version
```

**Indexing strategy:** composite indexes on every pagination path
(`messages(channel_id, created_at)`, `clips(game, created_at)`,
`notifications(user_id, created_at)`); partial indexes for `pending`
friendships; GIN index on `clip_tags` and full-text columns mirrored into
OpenSearch.

---

## 4. API surface (REST, versioned `/v1`)

Representative endpoints (all JSON, cursor-paginated via `?cursor=&limit=`):

```
Auth      POST /auth/register · /auth/login · /auth/logout · /auth/refresh
          POST /auth/verify-email · /auth/forgot · /auth/reset
          GET  /auth/oauth/:provider · GET /auth/oauth/:provider/callback
Users     GET  /users/me · PATCH /users/me · GET /users/:id
          GET  /users/search?q= · POST /users/me/export · DELETE /users/me
Friends   GET  /friends · POST /friends/requests · POST /friends/:id/accept
          DELETE /friends/:id · POST /blocks · POST /mutes
Servers   CRUD /servers · /servers/:id/channels · /servers/:id/members · /roles
Messages  GET  /channels/:id/messages?cursor= · POST /channels/:id/messages
          PATCH/DELETE /messages/:id · POST /messages/:id/reactions · /pin
          POST /channels/:id/read
Clips     GET  /clips?sort=&game=&tag=&cursor= · POST /clips (init upload)
          POST /clips/:id/like · /comments · /save · /report · GET /clips/:id
Sessions  CRUD /sessions · POST /sessions/:id/rsvp · /votes
Tournaments CRUD /tournaments · POST /:id/teams · /matches/:id/score
Notifs    GET  /notifications · POST /notifications/read · /push/subscribe
Search    GET  /search?q=&types=users,clips,channels,events
Polls     POST /polls · POST /polls/:id/vote
Moderation GET /admin/reports · POST /admin/actions · GET /admin/audit
```

**Realtime (WebSocket) events:** `message.created/updated/deleted`,
`reaction.added`, `typing.start`, `presence.update`, `voice.join/leave`,
`notification.new`, `session.reminder`, `tournament.update`. Clients subscribe
to channels/servers they're members of; the gateway authorizes each
subscription against permissions.

---

## 5. Authentication & authorization

- **Credentials:** Argon2id password hashing, per-user salt. Email/password +
  Google & Discord OAuth 2.0 (PKCE). OAuth identities linked to one account.
- **Sessions:** short-lived access JWT (~15 min) + rotating refresh token stored
  **httpOnly, Secure, SameSite=Lax** cookie; refresh tokens are hashed at rest
  and revocable per device. Email verification required before full access.
- **MFA-ready:** TOTP table reserved; step-up auth for destructive actions.
- **Authorization:** server permissions are a **bitfield** (`VIEW_CHANNEL`,
  `SEND_MESSAGES`, `MANAGE_MESSAGES`, `KICK`, `BAN`, `MANAGE_SERVER`,
  `ADMIN`…). Effective permission = role bits ∪ then channel overwrites
  (deny → base → allow). Every API and WS action passes through a single
  `can(user, permission, context)` guard. Global platform roles: `user`,
  `moderator`, `admin`.

---

## 6. Realtime, voice & presence

- **Chat/presence/notifications:** WebSocket gateway nodes are stateless and
  share state via **Redis pub/sub**. Presence is a Redis TTL key refreshed by
  heartbeats; `online/idle/dnd/offline` derived from last heartbeat + client
  signal.
- **Voice:** **mediasoup SFU** (selective forwarding) rather than mesh, so a
  room of N users uses N up/down streams per node instead of N². Signaling over
  the same WS; ICE/TURN servers for NAT traversal. Browser uses standard WebRTC
  `getUserMedia`.
- **Delivery guarantees:** messages persist first, then fan out; clients
  reconcile via "fetch since last_event_id" on reconnect (no lost messages).

---

## 7. Media pipeline (clips)

1. Client requests an **upload URL**; uploads directly to object storage
   (presigned, never through the API).
2. Upload triggers a **transcode job**: validate container/codecs, strip
   active content, generate **HLS** renditions (240p–1080p), extract a
   **thumbnail/poster** + animated preview, compute duration & perceptual hash.
3. Clip flips `status: processing → ready`; CDN serves adaptive HLS. Feed uses
   thumbnail + lazy `IntersectionObserver` autoplay, virtualized list.
- **Limits:** size/length caps, MIME allow-list, AV scan, perceptual-hash
  dedupe and known-bad matching.

---

## 8. Security

| Threat | Mitigation |
|--------|-----------|
| **XSS** | React auto-escaping; no `dangerouslySetInnerHTML` on user content; sanitize rich text server-side (allow-list); strict **CSP** (`default-src 'self'`, no inline scripts). |
| **CSRF** | SameSite cookies + double-submit/Origin checks on state-changing requests; auth via bearer for API, cookie only for refresh. |
| **SQL injection** | Parameterized queries / ORM exclusively; no string-built SQL. |
| **Malicious uploads** | MIME allow-list, size caps, AV scan, transcode-only delivery (never serve raw user files inline), content-disposition + sandboxed media domain. |
| **Brute force** | Rate-limit login, exponential backoff, account lockout + CAPTCHA after N failures, breached-password check. |
| **Session hijacking** | httpOnly/Secure cookies, refresh-token rotation + reuse detection, device list & remote revoke. |
| **Realtime abuse** | Per-connection rate limits, message size caps, subscription authz, flood/spam heuristics, slow-mode. |
| **Privilege escalation** | Central `can()` guard, deny-by-default, server-side re-checks (never trust client role). |
| **DoS** | Edge WAF, gateway + Redis token-bucket rate limits, pagination caps, query timeouts, autoscaling. |

Plus: security headers (CSP, HSTS, X-Content-Type-Options, Referrer-Policy,
Permissions-Policy), secrets in a vault (never in the repo), encryption in
transit (TLS) and at rest (KMS), dependency scanning, and structured
**audit logging** of privileged actions.

---

## 9. Compliance (GDPR / privacy / platform)

Implemented as first-class flows, not placeholders:

- **Cookie consent** (essential vs analytics; reject as easy as accept) →
  `CookieConsent` component + `consents` table.
- **Privacy Policy & Terms** → `/legal/privacy`, `/legal/terms` (in app).
- **Right of access / portability** → Settings → "Request data export"
  (machine-readable JSON; async job in production).
- **Right to erasure** → Settings → "Delete my account" with typed confirmation
  → hard-delete within 30 days.
- **Consent records & ToS versioning** → `consents` table.
- **Age gate** → 13+ self-attestation at signup (configurable per region).
- **Content & copyright reporting** → report actions on clips/messages/users +
  a DMCA-style takedown contact and moderation queue.
- **Email verification & password reset** → token flows with expiry.

---

## 10. Accessibility (WCAG 2.1 AA target)

- Semantic landmarks, sequential headings, `:focus-visible` rings everywhere.
- Color contrast ≥ 4.5:1 for text; color never the sole signal (icons + text).
- Full keyboard nav, `Esc`/close affordances on modals, `⌘/Ctrl-K` search.
- `aria-label`s on icon-only buttons; `aria-live="polite"` toasts; `role="switch"` toggles.
- `prefers-reduced-motion` disables non-essential animation globally.
- Touch targets ≥ 44px; safe-area insets honored on mobile.

---

## 11. Performance & scalability

- Route-level **code splitting** (`React.lazy`), vendor chunk separation.
- **Virtualized** message lists and clip feeds; `IntersectionObserver` lazy
  media; `loading="lazy"`, WebP/AVIF posters, HLS adaptive streaming.
- **TanStack Query** caching + optimistic updates; cursor pagination everywhere.
- DB read replicas, Redis caching of hot reads (presence, unread counts),
  CDN for all media, debounced search, skeleton loaders for >300ms loads.
- Stateless services behind a load balancer → horizontal scale to thousands of
  concurrent users; Redis pub/sub decouples realtime fan-out.

---

## 12. Frontend architecture (this repo)

```
src/
  main.tsx            App bootstrap (HashRouter for static hosting)
  App.tsx             Routes + lazy loading + auth guard + page transitions
  index.css           Design tokens, glass utilities, reduced-motion
  types/              Domain model (mirrors the DB schema)
  data/mock.ts        Seed data — the swap-in point for the real API
  store/AppContext    App state: auth, toasts, notifications, clips, chat, friends
  lib/utils.ts        Formatting, gradients, escaping (unit-tested)
  components/
    ui/               Primitives: Button, Avatar, Modal, Toaster, GlassCard…
    layout/           Sidebar, Topbar, MobileNav, AppShell (responsive)
    common/           CookieConsent, GlobalSearch, PageLoader
  features/dashboard  Widget components
  pages/              Login, Dashboard, Profile, Chat, Clips, Friends,
                      Events, Tournaments, Settings, Legal, NotFound
```

**Going to production:** replace `data/mock.ts` + the action bodies in
`store/AppContext` with API calls (TanStack Query) and a WebSocket client. The
component layer and types stay unchanged — that boundary is intentional.

---

## 13. Deployment & CI/CD

- **This SPA:** `npm run build` → static `dist/` → any static host/CDN. On
  GitHub Pages it lives under a sub-path (`base: './'` + `HashRouter` make it
  path-agnostic and refresh-safe). See `README.md`.
- **Full platform:** containers on ECS/K8s, managed Postgres + Redis, object
  storage + CDN, Terraform IaC, blue/green deploys.
- **CI/CD:** `.github/workflows/gamehub.yml` runs typecheck → test → build on
  every push. Production pipeline adds migrations, integration/e2e tests,
  image build/scan, and staged rollout.

---

## 14. Known scope boundaries of this build

Implemented end-to-end in the UI on mock data: auth flow, dashboard with
customizable widgets, profiles, friends, Discord-style chat (servers/channels/
DMs/reactions/typing), TikTok-style clip vault, events with RSVP, tournament
bracket, settings (privacy/data export/account deletion), cookie consent, and
legal pages. Voice rooms, real media transcoding, push delivery, and the
server-side services are **designed here** and represented in the UI, with the
mock layer standing in for the backend.
