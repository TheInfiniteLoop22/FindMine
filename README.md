# FindMine

[![CI](https://github.com/TheInfiniteLoop22/FindMine/actions/workflows/ci.yml/badge.svg)](https://github.com/TheInfiniteLoop22/FindMine/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Live demo](https://img.shields.io/badge/demo-findmine.onrender.com-4f46e5)](https://findmine.onrender.com)

A full-stack lost-and-found platform. Post a lost or found item with photos and a
location, search nearby posts on a live map, get machine-learning match suggestions
between LOST and FOUND posts, claim an item through a verification flow the owner
controls, and chat in real time once a claim is approved. QR-tag registration lets an
item find its way back to its owner before it is ever reported lost.

**Live demo:** [findmine.onrender.com](https://findmine.onrender.com) — sign in with the
demo accounts below. The app runs on a free Render instance, so the first request after
a period of inactivity can take a minute.

| Demo account | Email | Password |
|---|---|---|
| A | `a@gmail.com` | `aaaaaa` |
| B | `b@gmail.com` | `bbbbbb` |

Sign in as one, post an item, then sign in as the other in a private window to claim it
and try the chat.

## Features

- **Post and browse** — Lost/Found listings with up to three photos, category, a map
  pin, and an optional *private detail* only the poster can read.
- **Geo search** — radius search around your location (PostGIS) with synchronised map
  and list views and text/category/type filters.
- **Match suggestions** — every post gets an image embedding (CLIP) and a text
  embedding (MiniLM), computed in-process with no external API. Candidates are ranked
  by image similarity, text similarity, distance and category, and shown to the post's
  owner.
- **Verified claims** — the claimant must answer the owner's private question. Approving
  a claim is one atomic transaction: it rejects competing claims, marks the post
  matched, awards reputation and opens a conversation.
- **Real-time chat** — Socket.IO messaging, authenticated with the session cookie and
  limited to the conversation's two participants.
- **QR pre-registration** — register an item in advance and print its QR code. A finder
  who scans it can message the owner through a privacy-preserving relay; the owner's
  email is never shown unless they choose to share it.
- **Accounts** — Google sign-in only (the account is created on first sign-in and the
  email comes from the Google account); no passwords are stored for real users.
- **Notifications and reputation** — in-app alerts for QR scans and relay messages, and
  a reputation score earned through approved claims.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| Database | PostgreSQL with PostGIS and pgvector, via Prisma 7 |
| Auth | NextAuth.js (JWT sessions) with Firebase Auth as the identity provider |
| Real-time | Socket.IO on a custom Node server (`server.ts`) |
| ML | [Transformers.js](https://huggingface.co/docs/transformers.js): MiniLM text and CLIP image embeddings, int8-quantised, run in-process |
| Maps | Leaflet and OpenStreetMap |
| Images / email | Cloudinary / SMTP (nodemailer) or Resend |
| Tests and CI | Vitest, GitHub Actions with a real Postgres + PostGIS + pgvector job |
| Deployment | Docker on Render, Neon Postgres |

## How it works

```text
Browser (React 19 / Next.js App Router, Leaflet, socket.io-client)
   │
   ├── HTTP ── Next.js route handlers (src/app/api/**)
   │              ├── NextAuth (JWT session)        ← Firebase ID token verified server-side
   │              ├── Prisma ── PostgreSQL (+ PostGIS, + pgvector, + pg_trgm)
   │              ├── Cloudinary (images), SMTP / Resend (email)
   │              └── Transformers.js (embeddings, in-process)
   │
   └── WebSocket ── Socket.IO server (same process and port, server.ts)
```

**One long-lived process.** `server.ts` hosts Next.js and Socket.IO together instead of
using `next start`. Chat needs persistent connections and the ML models need to stay
warm in memory, which is why the app is built for Docker on a persistent host rather
than Vercel's serverless model.

**Matching.** Creating a post returns immediately; its embeddings are computed in the
background (`embeddingStatus`: `pending` → `processing` → `done` / `failed`). A single
SQL query then picks opposite-type, open posts within 50 km and ranks them by

```text
score = 0.35 × image similarity + 0.20 × text similarity
      + 0.20 × proximity (linear to 25 km) + 0.25 × same category
```

The top five are stored both ways and shown to each owner (score ≥ 0.4).

**Claims.** Approval runs inside one database transaction that first locks the post
row, so two simultaneous approvals can never both win. A partial unique index stops a
user holding two active claims on one post.

## Engineering highlights

- **Memory-constrained ML.** Running CLIP and MiniLM inside a 512 MB web process took
  int8 quantisation, single-threaded ONNX sessions, sequential inference, an atomic
  "claim the job" step and a sweep that recovers jobs orphaned by a crash.
- **Concurrency-safe claim approval**, proven by integration tests that approve two
  different claims at the same moment and assert exactly one wins.
- **Privacy by design.** Public QR responses are built from an allow-list; the relay
  never reveals the owner's contact details; scan locations are stored as a rough area,
  never an IP address.
- **Defence in depth.** Per-IP rate limiting (keyed on `CF-Connecting-IP` behind
  Cloudflare), lockout and timing-safe failure paths on the demo login, Google ID tokens
  verified server-side, parameterised raw SQL, ownership checks on every
  mutating route, and escaped HTML in emails.
- **Schema changes as migrations**, tried on a throwaway database branch first:
  typed `geography` / `vector` columns, GiST, HNSW and trigram indexes.

Detailed write-ups of each of these live in the project's study notes, which are kept
out of the repository.

## Getting started

**Prerequisites:** Node.js 20+ and a PostgreSQL 15+ database where you can enable the
**PostGIS** and **pgvector** extensions (Neon, Supabase and most managed providers
support both).

```bash
npm install                          # also runs `prisma generate`
cp .env.example .env                 # then fill in the values (table below)
psql "$DATABASE_URL" -c 'CREATE EXTENSION IF NOT EXISTS postgis; CREATE EXTENSION IF NOT EXISTS vector;'
npx prisma migrate deploy            # tables, indexes, constraints
npx prisma db seed                   # the two demo accounts
npm run dev                          # http://localhost:3000
```

> The extensions must exist **before** `migrate deploy`, because the first migration
> uses the `geography` and `vector` types. `npm run dev` runs `tsx server.ts`
> (Next.js + Socket.IO), not `next dev`.

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres connection string |
| `NEXTAUTH_SECRET` | Yes | Session signing secret (`openssl rand -base64 32`); the app refuses to start without it |
| `NEXTAUTH_URL` | Recommended | Public URL of the app |
| `NEXT_PUBLIC_FIREBASE_*` (6 values) | For real sign-in | Firebase web config for Google sign-in |
| `CLOUDINARY_CLOUD_NAME`, `_API_KEY`, `_API_SECRET` | For uploads | Photo storage |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Optional | Relay-message alert emails through any SMTP mailbox. Render's free tier blocks ports 25/465/587, so use 2525 (e.g. Brevo) |
| `EMAIL_FROM` | Optional | Sender address |
| `RESEND_API_KEY` | Optional | Alternative to SMTP; needs a verified domain to reach arbitrary recipients |
| `ENABLE_DEMO_LOGIN` | Optional | `true` enables the one-click demo accounts (default off) |

With no email provider configured, emails are printed to the server console, so you can
see them locally without any account. If your database is on Supabase, save
its CA certificate as `certs/supabase-ca.crt` (Dashboard → Project Settings → Database
→ SSL); Neon and most other providers need nothing extra.

## Testing

```bash
npm run lint
npx tsc --noEmit
npm test                  # 80 unit and route tests — no database or secrets needed
npm run test:integration  # 27 tests against a real database (set DATABASE_URL)
```

Continuous integration runs three blocking jobs on every push and pull request:
typecheck + unit tests, lint, and the integration suite on a Postgres container with
PostGIS and pgvector, built from the checked-in migrations.

## Deployment

The `Dockerfile` builds a multi-stage production image whose start command applies
pending migrations and then launches the custom server. `render.yaml` is a Render
Blueprint for it: create a Blueprint from this repo and fill in the values marked
`sync: false`. `NEXT_PUBLIC_*` variables are inlined at build time, so they are passed
as Docker build arguments. Any host that runs a persistent Node process (Railway,
Fly.io, a VPS) works too; serverless hosts such as Vercel do not, because of Socket.IO.

Health check: `GET /api/health`.

## Project structure

```text
.
├── src/
│   ├── app/            # App Router pages and API route handlers (src/app/api)
│   ├── components/     # Shared React components (map, modals, navbar…)
│   ├── hooks/          # React hooks (geolocation)
│   ├── lib/            # Auth, Prisma, embeddings, matching, claims, rate limiting, email, sockets
│   ├── data/           # Static data
│   └── types/          # Shared TypeScript types
├── prisma/             # schema.prisma, migrations, seed script
├── scripts/            # Sample-data seeding
├── certs/              # CA certificate for TLS-verified Supabase connections
├── server.ts           # Custom server: Next.js + Socket.IO
├── Dockerfile          # Production image
├── render.yaml         # Render Blueprint
└── .github/workflows/  # CI
```

## API overview

All routes live under `src/app/api/`.

| Area | Routes |
|---|---|
| Auth | `auth/[...nextauth]` |
| Posts | `posts`, `posts/mine`, `posts/[id]` (+ `/close`, `/matches`, `/claims`) |
| Claims | `claims/mine`, `claims/[id]` (+ `/approve`, `/reject`) |
| Chat | `conversations/mine`, `conversations/[id]/messages`, `conversations/unread-count` |
| Notifications | `notifications`, `notifications/{mark-read,unread-count}` |
| Profile / users | `profile` (+ `/email/*`, `/verify-email`), `users/[id]` |
| QR items | `registered-items` (+ `/mine`, `/[id]`, `/[id]/scans`), `qr/[token]` (+ `/message`) |
| Other | `upload`, `health`, `config` |

## Known limitations

Honest notes on what this project does not do yet:

- **Single instance.** Rate-limit and lockout counters, and Socket.IO rooms, live in
  process memory. Running several instances would need Redis and the Socket.IO Redis
  adapter.
- **Matching cost.** Indexes exist, but the ranking query still scores every candidate
  within the radius; a two-stage retrieve-then-rerank design is the next step.
- **Polling.** The map refreshes every 25 seconds and the unread badges every 10; only
  chat is pushed over WebSockets.
- **No Content-Security-Policy header** yet, and no browser (end-to-end) tests.
- **Free-tier hosting.** Cold starts are slow and the instance has 512 MB of memory,
  which shaped several design choices.

## License

[MIT](LICENSE)
