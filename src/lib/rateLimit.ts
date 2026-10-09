interface RateLimitStore {
  [key: string]: { count: number; resetAt: number };
}

const store: RateLimitStore = {};

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
