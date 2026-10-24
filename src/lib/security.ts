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
const captchaTriggers: { [key: string]: boolean } = {};

// These three stores gain one entry per distinct IP/email that ever hits a
// rate limit or lockout check and never remove them - left alone, they grow
// without bound for the lifetime of the process (a real contributor to this
// app hitting Render's 512MB free-tier memory limit under sustained traffic).
// Sweep out anything that's no longer live every 10 minutes: ipStore entries
// past their resetAt, and accountStore/captchaTriggers entries with no active
// lockout (captchaTriggers has no expiry of its own, so it's cleared whenever
// the ip/email it's keyed on no longer has a live lockout/rate-limit record).
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

  for (const key of Object.keys(captchaTriggers)) {
    if (!ipStore[key] && !accountStore[key]) delete captchaTriggers[key];
  }
}

if (typeof setInterval !== 'undefined') {
  const timer = setInterval(pruneSecurityStores, PRUNE_INTERVAL_MS);
  // Don't let this background sweep keep the Node process alive on its own
  // (e.g. during tests or graceful shutdown).
  timer.unref?.();
}

/**
 * Extracts the client IP from an `x-forwarded-for` header value.
 *
 * This app runs as a single-region Render web service behind Render's own edge
 * proxy — not a chain of multiple trusted proxies. Render's proxy appends the
 * real client IP as the LAST entry of the header; any earlier entries are
 * whatever the client itself sent and are trivially spoofable. Taking the
 * first entry (a common mistake) lets a client set its own rate-limit key and
 * dodge or pollute limits. Always take the last, non-empty entry instead.
 */
export function getClientIp(xForwardedFor: string | null | undefined): string {
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
    captchaTriggers[ip] = true;
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
    captchaTriggers[email] = true;
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
    captchaTriggers[email] = true;
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

/**
 * Returns whether CAPTCHA validation is required for this IP or account email.
 * This triggers only after they have hit a limit once. If no HCAPTCHA_SECRET is
 * configured there is no way to actually verify a token, so CAPTCHA never becomes
 * part of the enforced security posture — rate limiting and lockout (which don't
 * depend on it) remain the real defenses until a secret is set.
 */
export function isCaptchaRequired(ip: string, email?: string): boolean {
  if (!process.env.HCAPTCHA_SECRET) return false;
  if (captchaTriggers[ip]) return true;
  if (email && captchaTriggers[email]) return true;
  return false;
}

/**
 * Validates a real hCaptcha token against the hCaptcha siteverify API.
 * Required Env Vars for verification:
 * - HCAPTCHA_SECRET (Real validation API key)
 */
export async function verifyCaptcha(token: string): Promise<boolean> {
  if (!token) return false;

  const secret = process.env.HCAPTCHA_SECRET;
  if (!secret) {
    // No secret configured — isCaptchaRequired() already keeps this path
    // unreachable in that case; fail closed here too, just in case.
    return false;
  }

  try {
    const response = await fetch('https://hcaptcha.com/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `response=${encodeURIComponent(token)}&secret=${encodeURIComponent(secret)}`,
    });
    const data = await response.json();
    return !!data.success;
  } catch (error) {
    logger.error('Captcha verification error', { error });
    return false;
  }
}
