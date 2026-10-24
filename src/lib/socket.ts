import type { Server as IOServer } from 'socket.io';

/**
 * Singleton holding the Socket.IO server instance created once by `server.ts`
 * (the custom Node server this app now requires for real-time DMs — standard
 * `next dev`/`next start` has no hook for a persistent WebSocket server). API
 * routes import `getIO()` to emit events after writing to the DB.
 *
 * This has to live on `globalThis`, not a plain module-level variable: `server.ts`
 * runs directly under `tsx` (outside Next's bundler), while API routes are
 * compiled/loaded through Next's own Turbopack dev bundler — those are two
 * separate module registries, so a plain `let io = ...` in this file would give
 * each side its own independent copy, and `setIO()` from server.ts would never be
 * visible to `getIO()` calls from inside an API route. `globalThis` is the one
 * thing genuinely shared across both.
 */
const GLOBAL_KEY = Symbol.for('findmine.io');

type GlobalWithIO = typeof globalThis & { [GLOBAL_KEY]?: IOServer };

export function setIO(instance: IOServer) {
  (globalThis as GlobalWithIO)[GLOBAL_KEY] = instance;
}

export function getIO(): IOServer | null {
  return (globalThis as GlobalWithIO)[GLOBAL_KEY] ?? null;
}
