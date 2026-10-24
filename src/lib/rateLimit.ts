interface RateLimitStore {
  [key: string]: { count: number; resetAt: number };
}

const store: RateLimitStore = {};

// Without this the store gains one entry per distinct key (user, IP, email) for
// the lifetime of the process. Sweep expired windows every 10 minutes; unref()
// so the timer never keeps the process (or a test run) alive on its own.
const PRUNE_INTERVAL_MS = 10 * 60 * 1000;
function pruneRateLimitStore() {
  const now = Date.now();
  for (const key of Object.keys(store)) {
    if (now > store[key].resetAt) delete store[key];
  }
}
if (typeof setInterval !== 'undefined') {
  const timer = setInterval(pruneRateLimitStore, PRUNE_INTERVAL_MS);
  timer.unref?.();
}

export function rateLimit(identifier: string, limit = 10, windowMs = 60000): { success: boolean; remaining: number } {
  const now = Date.now();
  const record = store[identifier];

  if (!record || now > record.resetAt) {
    store[identifier] = {
      count: 1,
      resetAt: now + windowMs,
    };
    return { success: true, remaining: limit - 1 };
  }

  if (record.count >= limit) {
    return { success: false, remaining: 0 };
  }

  record.count += 1;
  return { success: true, remaining: limit - record.count };
}
