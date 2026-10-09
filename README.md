# FindMine

[![CI](https://github.com/TheInfiniteLoop22/FindMine/actions/workflows/ci.yml/badge.svg)](https://github.com/TheInfiniteLoop22/FindMine/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Live demo](https://img.shields.io/badge/demo-findmine.onrender.com-4f46e5)](https://findmine.onrender.com)

A full-stack lost-and-found platform. Post a lost or found item, search nearby
posts on a live map, get AI-suggested matches between LOST/FOUND pairs, claim
an item through a structured verification flow, and chat in real time once a
claim is approved. A QR-tag registration system lets an item be reunited with
its owner even before it is reported lost.

**Live demo:** [findmine.onrender.com](https://findmine.onrender.com)
_(Render free tier: it spins down after ~15 minutes idle, so the first request
can take 30–60 seconds.)_

## Features

- **Post and browse**: Lost/Found listings with photos, category, location, and
  optional private verification details only the poster sees.
- **Geo search**: radius search around the user's location (PostGIS) with
  synchronized map and list views.
- **AI-suggested matching**: local, on-device embeddings (no external AI API)
  score candidate pairs on image similarity, text similarity, distance, and
  category.
- **Structured claims**: the claimant answers verification questions set by the
  owner. Approving a claim atomically rejects competing claims, marks the item
  matched, and opens a conversation.
- **Real-time chat**: Socket.IO messaging scoped to the conversation's two
  participants.
- **QR pre-registration**: register an item in advance and print a QR code. A
  finder who scans it can relay a message or see contact details according to
  the owner's privacy setting.
- **Auth**: Google sign-in and email-OTP sign-up, with rate limiting, account
  lockout, and email-verification enforcement.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Database | PostgreSQL + PostGIS + pgvector, via Prisma 7 |
| Auth | NextAuth.js (JWT sessions) + Firebase Auth (identity provider) |
| Real-time | Socket.IO on a custom Node server (`server.ts`) |
| ML | On-device inference with [Transformers.js](https://huggingface.co/docs/transformers.js) |
| Queue (optional) | BullMQ + Redis |
| Images / email | Cloudinary / Resend |
| Styling | Tailwind CSS 4 |
| Tests | Vitest (unit and integration) |
| Deployment | Docker, Render |

## Architecture

```text
Browser (React 19 / Next.js App Router)
   │
   ├── HTTP ── Next.js route handlers (src/app/api/**)
   │              ├── NextAuth (JWT session)
   │              ├── Prisma ── PostgreSQL (+ PostGIS, + pgvector)
   │              ├── Firebase (identity), Cloudinary (images), Resend (email)
   │              └── Transformers.js (local embeddings, in-process)
   │
   └── WebSocket ── Socket.IO server (same process, server.ts)
```

The app runs a **custom server** (`server.ts`) instead of `next start`, so one
long-lived process hosts both Next.js and Socket.IO. Real-time chat and a warm
ML model need a persistent process, which is why the app targets Docker/Render
rather than Vercel's serverless model.

Creating a post returns immediately. Embeddings are then computed in the
background (`embeddingStatus`: `pending` → `processing` → `done`/`failed`) and
matches appear on the next fetch. One PostgreSQL database holds relational,
geospatial, and vector data, so there is a single connection pool and a single
backup surface.

### Project structure

```text
.
├── src/
│   ├── app/            # App Router pages and API route handlers (src/app/api)
│   ├── components/     # Shared React components
│   ├── hooks/          # React hooks
│   ├── lib/            # Auth, Prisma, embeddings, matching, claims, rate limiting, email, sockets
│   ├── data/           # Static data
│   └── types/          # Shared TypeScript types
├── prisma/             # schema.prisma, migrations, seed script
├── scripts/            # DB setup (PostGIS/pgvector), worker, seeding
├── certs/              # CA certificate for TLS-verified DB connections
├── server.ts           # Custom server: Next.js + Socket.IO
├── Dockerfile          # Production image
├── render.yaml         # Render Blueprint
└── .github/workflows/  # CI (typecheck + tests, lint)
```

### API overview

All routes live under `src/app/api/`.

| Area | Routes |
|---|---|
| Auth | `auth/[...nextauth]`, `auth/signup/{send-otp,verify-otp,complete}`, `auth/{forgot,reset}-password` |
| Posts | `posts`, `posts/mine`, `posts/[id]` (+ `/close`, `/matches`, `/claims`) |
| Claims | `claims/mine`, `claims/[id]` (+ `/approve`, `/reject`) |
| Chat | `conversations/mine`, `conversations/[id]/messages`, `conversations/unread-count` |
| Notifications | `notifications`, `notifications/{mark-read,unread-count}` |
| Profile / users | `profile` (+ `/email/*`, `/verify-email`), `users/[id]` |
| QR items | `registered-items` (+ `/mine`, `/[id]`, `/[id]/scans`), `qr/[token]` (+ `/message`) |
| Other | `upload`, `health`, `config` |

## Getting started

**Prerequisites:** Node.js 20+ and a PostgreSQL database with the **PostGIS**
and **pgvector** extensions (Neon and Supabase both provide them).

```bash
npm install                          # also runs `prisma generate`
cp .env.example .env                 # then fill in the values (see below)
npx prisma migrate deploy            # create tables
npx tsx scripts/setup-postgis.ts     # enable PostGIS, geography column + index
npx tsx scripts/setup-pgvector.ts    # enable pgvector, embedding columns + index
npx prisma db seed                   # two demo accounts
npm run dev                          # http://localhost:3000
```

> `npm run dev` runs `tsx server.ts` (Next.js + Socket.IO), not `next dev`.

### Environment variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres connection string |
| `NEXTAUTH_SECRET` | Yes | `openssl rand -base64 32`. The app refuses to start without it |
| `NEXTAUTH_URL` | Recommended | Public URL of the app |
| `NEXT_PUBLIC_FIREBASE_*` (6 vars) | For real sign-in | Google / email sign-in |
| `CLOUDINARY_*` (3 vars) | For uploads | Photo uploads |
| `RESEND_API_KEY` | No | Without it, emails are logged to the console |
| `REDIS_URL`, `ENABLE_BULLMQ_WORKER` | No | Without Redis, embeddings run inline |
| `HCAPTCHA_SECRET` | No | CAPTCHA is off until set |
| `ENABLE_DEMO_LOGIN`, `NEXT_PUBLIC_ENABLE_DEMO_LOGIN` | No | Default `false`. Enables the one-click demo accounts |

If your database is hosted on Supabase, save its CA certificate as
`certs/supabase-ca.crt` (Dashboard → Project Settings → Database → SSL). Neon
and most other providers don't need this.

### Try it without Firebase

Set both `*_DEMO_LOGIN` variables to `true`, then use the "Quick Sign-In" buttons.
The live demo has them enabled:

| Account | Email | Password |
|---|---|---|
| A | `a@gmail.com` | `aaaaaa` |
| B | `b@gmail.com` | `bbbbbb` |

Sign in as one, post an item, then sign in as the other in a private window to
claim it and try the chat.

## Testing

```bash
npm run lint
npx tsc --noEmit
npm test                  # unit tests: no database or secrets needed
npm run test:integration  # needs a reachable DATABASE_URL
```

CI runs the typecheck and unit tests on every push and pull request.

## Deployment

The `Dockerfile` builds a production image that applies pending migrations and
starts the custom server. `render.yaml` is a Render Blueprint for it: create a
Blueprint from this repo, then fill in the secrets marked `sync: false`.
`NEXT_PUBLIC_*` variables are inlined at build time, so they are passed as
Docker build args. Any host that runs a persistent Node process (Railway,
Fly.io, a VPS) works too; serverless hosts such as Vercel do not, because of
Socket.IO.

Health check: `GET /api/health`.

## License

[MIT](LICENSE)
