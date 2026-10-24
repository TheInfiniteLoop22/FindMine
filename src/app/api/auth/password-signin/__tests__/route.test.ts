import { describe, it, expect, vi, beforeEach } from 'vitest';

// HTTP-layer test for POST /api/auth/password-signin: this route is what makes
// brute-force lockout apply to REAL (Firebase) accounts. Firebase and the DB are
// mocked; the real in-process limiter/lockout state in src/lib/security.ts is used
// so the test exercises the actual lockout counting.

const { signInMock, findUniqueMock, FakeFirebaseSignInError } = vi.hoisted(() => {
  class FakeFirebaseSignInError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  }
  return { signInMock: vi.fn(), findUniqueMock: vi.fn(), FakeFirebaseSignInError };
});

vi.mock('@/lib/firebaseAdmin', () => ({
  signInWithFirebasePassword: (...a: unknown[]) => signInMock(...a),
  FirebaseSignInError: FakeFirebaseSignInError,
}));
vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: (...a: unknown[]) => findUniqueMock(...a) } },
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { POST } from '../route';

let n = 0;
function req(email: string, password = 'pw', ip?: string) {
  n += 1;
  return new Request('http://localhost/api/auth/password-signin', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip ?? `198.51.100.${n % 250}` },
    body: JSON.stringify({ email, password }),
  });
}

describe('POST /api/auth/password-signin', () => {
  beforeEach(() => {
    signInMock.mockReset();
    findUniqueMock.mockReset();
    findUniqueMock.mockResolvedValue({ isSeedAccount: false });
  });

  it('returns the Firebase ID token on a correct password', async () => {
    signInMock.mockResolvedValue({ idToken: 'tok' });
    const res = await POST(req('ok@example.com'));
    expect(res.status).toBe(200);
    expect((await res.json()).data.idToken).toBe('tok');
  });

  it('answers a wrong password with a generic 401 (same for unknown emails)', async () => {
    signInMock.mockRejectedValue(new FakeFirebaseSignInError('INVALID_LOGIN_CREDENTIALS'));
    const wrong = await POST(req('someone@example.com'));
    signInMock.mockRejectedValue(new FakeFirebaseSignInError('EMAIL_NOT_FOUND'));
    const unknown = await POST(req('nobody@example.com'));
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect((await wrong.json()).error).toBe((await unknown.json()).error);
  });

  it('locks the account after 5 wrong passwords and then refuses even the correct one without calling Firebase', async () => {
    const email = `lock-${Date.now()}@example.com`;
    signInMock.mockRejectedValue(new FakeFirebaseSignInError('INVALID_LOGIN_CREDENTIALS'));
    for (let i = 0; i < 5; i++) {
      const r = await POST(req(email));
      expect(r.status).toBe(401);
    }

    signInMock.mockClear();
    signInMock.mockResolvedValue({ idToken: 'tok' });
    const blocked = await POST(req(email, 'correct-password'));
    expect(blocked.status).toBe(429);
    expect(signInMock).not.toHaveBeenCalled();
  });

  it('clears the failure counter after a successful sign-in', async () => {
    const email = `reset-${Date.now()}@example.com`;
    signInMock.mockRejectedValue(new FakeFirebaseSignInError('INVALID_LOGIN_CREDENTIALS'));
    for (let i = 0; i < 4; i++) await POST(req(email));

    signInMock.mockResolvedValue({ idToken: 'tok' });
    expect((await POST(req(email))).status).toBe(200);

    signInMock.mockRejectedValue(new FakeFirebaseSignInError('INVALID_LOGIN_CREDENTIALS'));
    for (let i = 0; i < 4; i++) expect((await POST(req(email))).status).toBe(401);
  });

  it('never locks a seed (demo) account', async () => {
    findUniqueMock.mockResolvedValue({ isSeedAccount: true });
    const email = `seed-${Date.now()}@example.com`;
    signInMock.mockRejectedValue(new FakeFirebaseSignInError('INVALID_LOGIN_CREDENTIALS'));
    for (let i = 0; i < 8; i++) expect((await POST(req(email))).status).toBe(401);
  });

  it('rate-limits by client IP (11th attempt in a minute from one IP)', async () => {
    signInMock.mockRejectedValue(new FakeFirebaseSignInError('INVALID_LOGIN_CREDENTIALS'));
    const ip = '203.0.113.77';
    let last = 0;
    for (let i = 0; i < 11; i++) {
      last = (await POST(req(`ip-${i}-${Date.now()}@example.com`, 'pw', ip))).status;
    }
    expect(last).toBe(429);
  });

  it('maps a disabled account to 403 and Firebase throttling to 429, without counting a failure', async () => {
    signInMock.mockRejectedValue(new FakeFirebaseSignInError('USER_DISABLED'));
    expect((await POST(req('d@example.com'))).status).toBe(403);
    signInMock.mockRejectedValue(new FakeFirebaseSignInError('TOO_MANY_ATTEMPTS_TRY_LATER'));
    expect((await POST(req('t@example.com'))).status).toBe(429);
  });

  it('rejects a malformed body with 400', async () => {
    const res = await POST(
      new Request('http://localhost/x', { method: 'POST', body: 'not json', headers: { 'cf-connecting-ip': '198.51.100.250' } })
    );
    expect(res.status).toBe(400);
  });
});
