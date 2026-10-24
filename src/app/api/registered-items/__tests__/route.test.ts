import { describe, it, expect, vi, beforeEach } from 'vitest';

// HTTP-layer test for POST /api/registered-items: specifically the
// contact-info-must-match-the-signed-in-user's-own-verified-field check
// - a registered item's
// SHOW_PHONE/SHOW_EMAIL contact info must be the caller's own verified
// phone/account email, never an arbitrary client-supplied value, since a
// stranger who scans the QR code sees it directly. Mocks prisma/session
// entirely (no real DB), so it runs in the default `npm test`/CI job.

const { getServerSessionMock, findUniqueMock, createMock } = vi.hoisted(() => ({
  getServerSessionMock: vi.fn(),
  findUniqueMock: vi.fn(),
  createMock: vi.fn(),
}));

vi.mock('next-auth', () => ({
  getServerSession: getServerSessionMock,
}));
vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: findUniqueMock },
    registeredItem: { create: createMock },
  },
}));

import { POST } from '../route';

function req(body: unknown) {
  return new Request('http://test/api/registered-items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const baseBody = { nickname: 'My Keys', contactMode: 'RELAY_ONLY' as const };

describe('POST /api/registered-items', () => {
  beforeEach(() => {
    getServerSessionMock.mockReset();
    findUniqueMock.mockReset();
    createMock.mockReset();
    createMock.mockResolvedValue({ id: 'item-1' });
  });

  it('returns 401 when there is no session', async () => {
    getServerSessionMock.mockResolvedValue(null);

    const res = await POST(req(baseBody));

    expect(res.status).toBe(401);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('returns 400 with INVALID_INPUT when nickname is missing', async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: 'user-1' } });

    const res = await POST(req({ contactMode: 'RELAY_ONLY' }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('INVALID_INPUT');
    expect(createMock).not.toHaveBeenCalled();
  });

  it('accepts RELAY_ONLY without ever looking up the user (no contact info to cross-check)', async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: 'user-1' } });

    const res = await POST(req(baseBody));

    expect(res.status).toBe(201);
    expect(findUniqueMock).not.toHaveBeenCalled();
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ contactMode: 'RELAY_ONLY', email: null }),
      })
    );
  });

  it('rejects SHOW_PHONE outright (phone data model was removed; enum value kept only for legacy rows)', async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: 'user-1' } });

    const res = await POST(req({ ...baseBody, contactMode: 'SHOW_PHONE' }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('CONTACT_MODE_UNSUPPORTED');
    expect(findUniqueMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('rejects SHOW_EMAIL when the submitted email does not match the user\'s own account email', async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: 'user-1' } });
    findUniqueMock.mockResolvedValue({ email: 'me@example.com' });

    const res = await POST(req({ ...baseBody, contactMode: 'SHOW_EMAIL', email: 'someone-else@example.com' }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('EMAIL_NOT_VERIFIED');
    expect(createMock).not.toHaveBeenCalled();
  });

  it('accepts SHOW_EMAIL when the submitted email matches the user\'s own account email', async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: 'user-1' } });
    findUniqueMock.mockResolvedValue({ email: 'me@example.com' });

    const res = await POST(req({ ...baseBody, contactMode: 'SHOW_EMAIL', email: 'me@example.com' }));

    expect(res.status).toBe(201);
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ contactMode: 'SHOW_EMAIL', email: 'me@example.com' }),
      })
    );
  });
});
