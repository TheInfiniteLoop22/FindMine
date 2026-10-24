import { describe, it, expect, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { createEmailOtp, verifyEmailOtp, createVerifiedTicket, consumeVerifiedTicket } from '@/lib/emailOtp';

// Integration tests (real database) for the sign-up OTP primitives: single use,
// expiry, binding to the email, atomic consumption under a double submit, and the
// cross-email hash collision that used to break the unique index.

const RUN_ID = `otp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let n = 0;
const emails: string[] = [];
function uniqueEmail() {
  n += 1;
  const e = `${RUN_ID}-${n}@example.test`;
  emails.push(e);
  return e;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await prisma.secureToken.deleteMany({ where: { email: { in: emails } } });
  emails.length = 0;
});

describe('email OTP (integration)', () => {
  it('verifies a fresh code once, then refuses it (single use)', async () => {
    const email = uniqueEmail();
    const code = await createEmailOtp(email);
    expect(code).toMatch(/^\d{6}$/);
    expect(await verifyEmailOtp(email, code)).toBe(true);
    expect(await verifyEmailOtp(email, code)).toBe(false);
  });

  it('refuses a wrong code and a code replayed for a different email', async () => {
    const email = uniqueEmail();
    const other = uniqueEmail();
    const code = await createEmailOtp(email);
    const wrong = code === '000000' ? '111111' : '000000';
    expect(await verifyEmailOtp(email, wrong)).toBe(false);
    expect(await verifyEmailOtp(other, code)).toBe(false);
    // the legitimate code still works - failed attempts don't consume it
    expect(await verifyEmailOtp(email, code)).toBe(true);
  });

  it('refuses an expired code', async () => {
    const email = uniqueEmail();
    const code = await createEmailOtp(email);
    await prisma.secureToken.updateMany({ where: { email }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await verifyEmailOtp(email, code)).toBe(false);
  });

  it('lets exactly one of two simultaneous submissions of a valid code succeed', async () => {
    const email = uniqueEmail();
    const code = await createEmailOtp(email);
    const results = await Promise.all([verifyEmailOtp(email, code), verifyEmailOtp(email, code)]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('issues the same 6-digit code to two different emails without colliding', async () => {
    vi.spyOn(crypto, 'randomInt').mockReturnValue(123456 as never);
    const a = uniqueEmail();
    const b = uniqueEmail();
    expect(await createEmailOtp(a)).toBe('123456');
    expect(await createEmailOtp(b)).toBe('123456');
    expect(await verifyEmailOtp(a, '123456')).toBe(true);
    expect(await verifyEmailOtp(b, '123456')).toBe(true);
  });

  it('consumes a verified-email ticket once and only for its own email', async () => {
    const email = uniqueEmail();
    const other = uniqueEmail();
    const ticket = await createVerifiedTicket(email);
    expect(await consumeVerifiedTicket(other, ticket)).toBe(false);
    expect(await consumeVerifiedTicket(email, ticket)).toBe(true);
    expect(await consumeVerifiedTicket(email, ticket)).toBe(false);
  });
});
