import { describe, it, expect, afterEach, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { authorizeCredentials } from '@/lib/auth';

// Integration tests against the real database + the real in-process
// rate-limit/lockout state in src/lib/security.ts (run via
// `npm run test:integration`). Calls the CredentialsProvider's authorize()
// directly - same function NextAuth's HTTP layer calls - so this exercises
// the real logic without needing a running server or a session cookie.
//
// Firebase-token sign-in (Google/phone-OTP) is NOT covered here: it needs
// either a real Firebase test project or mocking verifyFirebaseIdToken,
// which would mostly test our own mock rather than real integration -
// deliberately left as a follow-up . This file covers the password path's rate limiting and lockout,
// which is what 01_auth_findings.md and the review flagged as needing
// verification.

const RUN_ID = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let n = 0;
function uniqueEmail() {
  n += 1;
  return `${RUN_ID}-${n}@example.test`;
}
function uniqueIp() {
  n += 1;
  return `10.99.${n % 256}.${(n * 7) % 256}`;
}

function reqFromIp(ip: string) {
  return { headers: { 'x-forwarded-for': ip } };
}

const createdUserIds: string[] = [];

async function createUser(opts: { password: string; isSeedAccount?: boolean }) {
  const passwordHash = await bcrypt.hash(opts.password, 10);
  const user = await prisma.user.create({
    data: {
      email: uniqueEmail(),
      displayName: 'Auth Test User',
      passwordHash,
      isSeedAccount: !!opts.isSeedAccount,
    },
  });
  createdUserIds.push(user.id);
  return user;
}

afterEach(async () => {
  if (createdUserIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
  }
});

describe('authorize() - password sign-in', () => {
  it('succeeds with the correct password and returns the user (seed accounts only)', async () => {
    // The password path only authenticates isSeedAccount users (the AA/BB
    // demo accounts, per authorize()'s prisma.user.findFirst({..., isSeedAccount: true})
    // lookup) - real accounts sign in via the Firebase idToken path instead,
    // which this file deliberately doesn't cover (see header comment).
    const user = await createUser({ password: 'correct-horse-battery-staple', isSeedAccount: true });
    const result = await authorizeCredentials(
      { email: user.email, password: 'correct-horse-battery-staple' },
      reqFromIp(uniqueIp())
    );
    expect(result).toMatchObject({ id: user.id, email: user.email });
  });

  it('rejects a correct seed-account password when ENABLE_DEMO_LOGIN is not "true" (gate regression)', async () => {
    // Regression guard for the ENABLE_DEMO_LOGIN gate added to close the
    // "demo-login bypass" finding: a fresh deployment/fork must not
    // authenticate seed accounts via this path unless it opts in explicitly.
    const originalFlag = process.env.ENABLE_DEMO_LOGIN;
    delete process.env.ENABLE_DEMO_LOGIN;
    try {
      const user = await createUser({ password: 'gate-test-password', isSeedAccount: true });
      await expect(
        authorizeCredentials({ email: user.email, password: 'gate-test-password' }, reqFromIp(uniqueIp()))
      ).rejects.toThrow('Authentication token required');
    } finally {
      if (originalFlag === undefined) delete process.env.ENABLE_DEMO_LOGIN;
      else process.env.ENABLE_DEMO_LOGIN = originalFlag;
    }
  });

  it('rejects a wrong password', async () => {
    const user = await createUser({ password: 'the-real-password' });
    await expect(
      authorizeCredentials({ email: user.email, password: 'wrong-password' }, reqFromIp(uniqueIp()))
    ).rejects.toThrow('Invalid email or password');
  });

  it('rejects a nonexistent email with the same generic message (no enumeration via error text)', async () => {
    await expect(
      authorizeCredentials({ email: uniqueEmail(), password: 'anything' }, reqFromIp(uniqueIp()))
    ).rejects.toThrow('Invalid email or password');
  });

  it('runs a real bcrypt compare even when no account matches the email (no timing-based enumeration)', async () => {
    // Regression guard for the fix: authorize() used to skip bcrypt.compare
    // entirely when no matching account was found, making that path much
    // faster than "account exists, wrong password" - an attacker could
    // enumerate valid emails purely from response time. Now it always runs
    // a real bcrypt compare (against a fixed dummy hash when there's no
    // real one).
    //
    // Asserted directly via a spy rather than by measuring wall-clock time:
    // an earlier version of this test compared response latency for an
    // existing vs. a nonexistent account, but against this project's remote
    // dev database, network round-trip time dominates and swamps the much
    // smaller bcrypt cost difference, making a timing-based assertion
    // unreliable (it kept passing even with the fix reverted). Asserting
    // that bcrypt.compare is actually invoked is deterministic and tests
    // the real mechanism directly.
    const compareSpy = vi.spyOn(bcrypt, 'compare');
    try {
      await authorizeCredentials(
        { email: uniqueEmail(), password: 'anything' },
        reqFromIp(uniqueIp())
      ).catch(() => {});
      expect(compareSpy).toHaveBeenCalledTimes(1);
    } finally {
      compareSpy.mockRestore();
    }
  });

  it('locks a non-seed account out after 5 failed attempts', async () => {
    const user = await createUser({ password: 'right-password', isSeedAccount: false });
    const ip = uniqueIp();

    for (let i = 0; i < 5; i++) {
      await expect(
        authorizeCredentials({ email: user.email, password: 'wrong' }, reqFromIp(ip))
      ).rejects.toThrow('Invalid email or password');
    }

    // 6th attempt, even with the CORRECT password, should now be blocked by lockout
    await expect(
      authorizeCredentials({ email: user.email, password: 'right-password' }, reqFromIp(ip))
    ).rejects.toThrow('temporarily locked');
  });

  it('does NOT lock out a seed account, even after repeated failed attempts', async () => {
    const user = await createUser({ password: 'seed-password', isSeedAccount: true });
    const ip = uniqueIp();

    for (let i = 0; i < 6; i++) {
      await expect(
        authorizeCredentials({ email: user.email, password: 'wrong' }, reqFromIp(ip))
      ).rejects.toThrow('Invalid email or password');
    }

    // Still not locked - the correct password succeeds on attempt 7
    const result = await authorizeCredentials(
      { email: user.email, password: 'seed-password' },
      reqFromIp(ip)
    );
    expect(result).toMatchObject({ id: user.id, email: user.email });
  });

  it('clears the failed-attempt counter on a successful login', async () => {
    // Needs isSeedAccount: true for the same reason as the test above -
    // this counter-reset only happens on the success branch, which is
    // reachable only via a seed account's correct password.
    const user = await createUser({ password: 'reset-me-please', isSeedAccount: true });
    const ip = uniqueIp();

    // 3 failures (below the 5-attempt lockout threshold)
    for (let i = 0; i < 3; i++) {
      await expect(
        authorizeCredentials({ email: user.email, password: 'wrong' }, reqFromIp(ip))
      ).rejects.toThrow('Invalid email or password');
    }

    // Successful login resets the counter
    await authorizeCredentials({ email: user.email, password: 'reset-me-please' }, reqFromIp(ip));

    // 3 more failures afterward should NOT trip the 5-attempt lockout,
    // since the counter was reset by the success above (3 + 3 = 6 would
    // trip it if the reset hadn't happened)
    for (let i = 0; i < 3; i++) {
      await expect(
        authorizeCredentials({ email: user.email, password: 'wrong' }, reqFromIp(ip))
      ).rejects.toThrow('Invalid email or password');
    }
    await expect(
      authorizeCredentials({ email: user.email, password: 'reset-me-please' }, reqFromIp(ip))
    ).resolves.toMatchObject({ id: user.id });
  });

  it('rate-limits by IP after 10 attempts within a minute, independent of account lockout', async () => {
    const ip = uniqueIp();
    const user = await createUser({ password: 'irrelevant' });

    // 10 attempts (any credentials) consume the IP's limit
    for (let i = 0; i < 10; i++) {
      await expect(
        authorizeCredentials({ email: uniqueEmail(), password: 'x' }, reqFromIp(ip))
      ).rejects.toThrow(); // some rejection (invalid email), doesn't matter which
    }

    // 11th attempt from the SAME ip is blocked by the IP rate limit itself,
    // even with a real user's correct password
    await expect(
      authorizeCredentials({ email: user.email, password: 'irrelevant' }, reqFromIp(ip))
    ).rejects.toThrow('Too many sign-in attempts');
  });
});
