import { prisma } from './prisma';
import { logger } from './logger';

interface RateLimitStore {
  [key: string]: { count: number; resetAt: number };
}

interface LockoutStore {
  [email: string]: { failedAttempts: number; lockoutUntil: number | null };
}

// In-memory rate limiting and lockout state
const ipStore: RateLimitStore = {};
const accountStore: LockoutStore = {};

// These stores gain one entry per distinct IP/email that ever hits a
// rate limit or lockout check and never remove them - left alone, they grow
// without bound for the lifetime of the process (a real contributor to this
// app hitting Render's 512MB free-tier memory limit under sustained traffic).
// Sweep out anything that's no longer live every 10 minutes: ipStore entries
// past their resetAt, and accountStore entries with no active lockout.
const PRUNE_INTERVAL_MS = 10 * 60 * 1000;
function pruneSecurityStores() {
  const now = Date.now();

  for (const ip of Object.keys(ipStore)) {
    if (now > ipStore[ip].resetAt) delete ipStore[ip];
  }

  for (const email of Object.keys(accountStore)) {
    const record = accountStore[email];
    const lockoutActive = record.lockoutUntil != null && now < record.lockoutUntil;
    if (!lockoutActive) delete accountStore[email];
  }

}

if (typeof setInterval !== 'undefined') {
  const timer = setInterval(pruneSecurityStores, PRUNE_INTERVAL_MS);
  // Don't let this background sweep keep the Node process alive on its own
  // (e.g. during tests or graceful shutdown).
  timer.unref?.();
}

/**
 * Extracts the client IP behind the hosting proxy chain.
 *
 * The deployed app sits behind Cloudflare and Render's own proxy, so the last
 * `x-forwarded-for` entry is a shared edge address, not the caller: keying rate
 * limits on it let one client dodge the limit while unrelated users shared a
 * bucket. Cloudflare sets `cf-connecting-ip` to the real client address (and
 * overwrites any value the client sent), so prefer it. Without it (local dev, or
 * a platform with a single trusted proxy) fall back to the LAST non-empty
 * `x-forwarded-for` entry - earlier entries are client-controlled and spoofable.
 */
export function getClientIp(
  xForwardedFor: string | null | undefined,
  cfConnectingIp?: string | null
): string {
  const cf = cfConnectingIp?.trim();
  if (cf) return cf;

  if (!xForwardedFor) return '127.0.0.1';
  const parts = xForwardedFor
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return '127.0.0.1';
  return parts[parts.length - 1];
}

/**
 * Checks and increments IP rate limit
 */
export function checkIpRateLimit(ip: string): { success: boolean } {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const limit = 10;

  const record = ipStore[ip];

  if (!record || now > record.resetAt) {
    ipStore[ip] = {
      count: 1,
      resetAt: now + windowMs,
    };
    return { success: true };
  }

  if (record.count >= limit) {
    return { success: false };
  }

  record.count += 1;
  return { success: true };
}

/**
 * Checks account lockout state. Returns whether the attempt is blocked.
 * If user.isSeedAccount is true, it skips lockout checks entirely.
 */
export async function checkAccountLockout(email: string): Promise<{ blocked: boolean; remainingMs: number }> {
  // 1. Check if user is a seed account first (always bypass lockout)
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { isSeedAccount: true },
    });
    if (user?.isSeedAccount) {
      return { blocked: false, remainingMs: 0 };
    }
  } catch (err) {
    logger.error('Error checking isSeedAccount during lockout check', { email, error: err });
  }

  const record = accountStore[email];
  if (!record) {
    return { blocked: false, remainingMs: 0 };
  }

  const now = Date.now();
  if (record.lockoutUntil && now < record.lockoutUntil) {
    return { blocked: true, remainingMs: record.lockoutUntil - now };
  }

  // Lockout expired or not set
  if (record.lockoutUntil && now >= record.lockoutUntil) {
    record.lockoutUntil = null;
    record.failedAttempts = 0;
  }

  return { blocked: false, remainingMs: 0 };
}

/**
 * Records a failed sign-in attempt for an account.
 * Lockout triggers after 5 failed attempts within 15 minutes.
 */
export async function recordFailedAttempt(email: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { isSeedAccount: true },
    });
    if (user?.isSeedAccount) {
      return; // Skip seed accounts entirely
    }
  } catch (err) {
    logger.error('Error checking isSeedAccount in recordFailedAttempt', { email, error: err });
  }

  const now = Date.now();
  const lockoutDuration = 15 * 60 * 1000; // 15 minutes

  if (!accountStore[email]) {
    accountStore[email] = {
      failedAttempts: 1,
      lockoutUntil: null,
    };
    return;
  }

  const record = accountStore[email];
  record.failedAttempts += 1;

  if (record.failedAttempts >= 5) {
    record.lockoutUntil = now + lockoutDuration;
    logger.warn('Account locked for 15 minutes', { email });
  }
}

/**
 * Resets the failed attempts counter upon successful login.
 */
export function resetFailedAttempts(email: string) {
  if (accountStore[email]) {
    delete accountStore[email];
  }
}
