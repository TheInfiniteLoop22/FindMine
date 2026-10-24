# FindMine — container image for platforms that run a persistent Node process
# (Railway, Render, Fly.io, a VPS, etc). NOT intended for Vercel: this app runs
# a custom server.ts (Next.js + a stateful Socket.IO server) rather than
# Vercel's serverless function model — see the README (Architecture) for the full rationale.
#
# Uses a Debian-based (glibc) image rather than Alpine because this project
# depends on prebuilt native binaries (sharp, onnxruntime-node via
# @huggingface/transformers) that are glibc-linked.

FROM node:20-bookworm-slim AS base
WORKDIR /app
# NODE_ENV=production is deliberately NOT set here (only in the "runner" stage
# below): `npm ci` respects it by skipping devDependencies, which would strip
# out @tailwindcss/postcss/typescript/etc. that `next build` in the "build"
# stage below actually needs. This is exactly what broke the second build.
# Prisma's query engine needs libssl to detect the correct engine target on
# Debian slim images — without it, it silently guesses (openssl-1.1.x) and
# warns; installing it explicitly avoids relying on that guess.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# ── Dependencies ────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json ./
# The "prisma" schema must be present before `npm ci` runs, because `npm ci`
# triggers this project's `postinstall: prisma generate` script, which fails
# without it (this is exactly what broke the first Railway build).
COPY prisma ./prisma
# --legacy-peer-deps: vitest@5's peerOptional @types/node range (^22 || >=24)
# conflicts with @types/node@^20 (pinned elsewhere in the tree via
# @grpc/grpc-js, a transitive Firebase dependency, among others) - a plain
# `npm ci` fails outright here with ERESOLVE. Same flag used for local
# installs of this dependency; @types/node is dev-only (type-checking, not
# runtime), so this has no runtime effect.
RUN npm ci --legacy-peer-deps

# ── Build ───────────────────────────────────────────────────────────────
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate

# NEXT_PUBLIC_* vars are inlined into the client JS bundle at `next build`
# time, not read at container runtime — so they must be passed in as Docker
# build args here. Railway only forwards a service variable into the build
# if it's declared with ARG, so each one needs an explicit line.
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ENV NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY
ENV NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ENV NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID
ENV NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID
ENV NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ENV NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID

# `next build` statically imports every route module to collect page data,
# which runs src/lib/auth.ts's top-level `if (!NEXTAUTH_SECRET) throw` check —
# a deliberate security fix (no insecure fallback allowed), but it means the
# module must not throw during the build's mere static analysis pass either.
# This placeholder exists ONLY in this intermediate build stage and is never
# copied into the "runner" stage below — the real secret comes from your
# host's environment variables at container start, not from here.
ENV NEXTAUTH_SECRET="build-time-placeholder-not-a-real-secret"
RUN npm run build

# ── Runtime ─────────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/src ./src
# src/lib/prisma.ts reads this at runtime to verify the DB TLS certificate
# and THROWS on startup if it's missing while NODE_ENV=production (see that
# file) - forgetting this line means the container builds fine but the
# process crash-loops the instant it starts.
COPY --from=build /app/certs ./certs
COPY --from=build /app/server.ts ./server.ts
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/tsconfig.json ./tsconfig.json
# `prisma migrate deploy` (below) reads its datasource URL from this file, not
# from schema.prisma (which deliberately has none - the app's own runtime
# client uses the driver-adapter pattern in src/lib/prisma.ts instead).
# Missing this file isn't a silent no-op: the CLI hard-errors with "The
# datasource.url property is required in your Prisma config file," which
# (via the `&&` below) would fail the entire container boot.
COPY --from=build /app/prisma.config.ts ./prisma.config.ts

# Applies any pending migrations against the real database before starting -
# previously nothing in the deploy pipeline did this, so every migration
# after the initial baseline had to be applied by hand from a machine that
# could reach the DB directly, and a deploy could silently run app code
# against a schema it didn't match yet. `migrate deploy` only applies
# already-generated migration files (no schema diffing/prompting), so it's
# safe to run unattended on every boot - a no-op when there's nothing new.
#
# Runs the same custom server (Next.js + Socket.IO) used in development —
# see server.ts and the README (Architecture) for why this project cannot use
# plain `next start`.
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx server.ts"]
