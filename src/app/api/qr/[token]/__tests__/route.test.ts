import { describe, it, expect, vi, beforeEach } from 'vitest';

// HTTP-layer test for GET /api/qr/[token]: the field-level response
// filtering by contactMode. This is a fully public, unauthenticated route
// (anyone with the QR token can hit it), so it must never leak `phone` when
// contactMode isn't SHOW_PHONE, or `email` when it isn't SHOW_EMAIL - that
// filtering happens in the route handler itself, not the DB layer, so it's
// exactly the kind of thing that regresses silently on a refactor unless
// it's tested directly. Mocks prisma/rateLimit/geoip/notifications entirely
// (no real DB), so it runs in the default `npm test`/CI job.

const { findUniqueMock, rateLimitMock, scanEventCreateMock } = vi.hoisted(() => ({
  findUniqueMock: vi.fn(),
  rateLimitMock: vi.fn(),
  scanEventCreateMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    registeredItem: { findUnique: findUniqueMock },
    scanEvent: { create: scanEventCreateMock },
  },
}));
vi.mock('@/lib/rateLimit', () => ({
  rateLimit: rateLimitMock,
}));
vi.mock('@/lib/geoip', () => ({
  getRoughAreaFromIp: vi.fn().mockResolvedValue('Some Area'),
}));
vi.mock('@/lib/notifications', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}));

import { GET } from '../route';

function makeParams(token = 'tok-1') {
  return { params: Promise.resolve({ token }) };
}

function req() {
  return new Request('http://test/api/qr/tok-1', { headers: { 'x-forwarded-for': '1.2.3.4' } });
}

const baseItem = {
  id: 'item-1',
  nickname: 'My Keys',
  category: 'Keys',
  photoUrl: null,
  status: 'ACTIVE',
  lostAt: null,
  email: 'owner@example.com',
  user: { id: 'owner-1', displayName: 'Owner Name' },
};

describe('GET /api/qr/[token]', () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
    rateLimitMock.mockReset();
    scanEventCreateMock.mockReset();
    rateLimitMock.mockReturnValue({ success: true, remaining: 29 });
  });

  it('returns 429 when the per-IP rate limit is exceeded, without ever querying the DB', async () => {
    rateLimitMock.mockReturnValue({ success: false, remaining: 0 });

    const res = await GET(req(), makeParams());

    expect(res.status).toBe(429);
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it('returns 404 when the token does not match any registered item', async () => {
    findUniqueMock.mockResolvedValue(null);

    const res = await GET(req(), makeParams('does-not-exist'));

    expect(res.status).toBe(404);
  });

  it('never includes email for RELAY_ONLY, even though it exists on the row', async () => {
    findUniqueMock.mockResolvedValue({ ...baseItem, contactMode: 'RELAY_ONLY' });

    const res = await GET(req(), makeParams());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.phone).toBeUndefined();
    expect(body.data.email).toBeUndefined();
    expect(body.data.ownerName).toBe('Owner Name');
  });

  it('never includes phone for SHOW_PHONE (phone data model was removed)', async () => {
    findUniqueMock.mockResolvedValue({ ...baseItem, contactMode: 'SHOW_PHONE' });

    const res = await GET(req(), makeParams());
    const body = await res.json();

    expect(body.data.phone).toBeUndefined();
    expect(body.data.email).toBeUndefined();
  });

  it('includes email but never phone for SHOW_EMAIL', async () => {
    findUniqueMock.mockResolvedValue({ ...baseItem, contactMode: 'SHOW_EMAIL' });

    const res = await GET(req(), makeParams());
    const body = await res.json();

    expect(body.data.email).toBe('owner@example.com');
    expect(body.data.phone).toBeUndefined();
  });

  it('never leaks internal fields (e.g. user id) beyond the filtered shape', async () => {
    findUniqueMock.mockResolvedValue({ ...baseItem, contactMode: 'SHOW_EMAIL' });

    const res = await GET(req(), makeParams());
    const body = await res.json();

    expect(body.data.user).toBeUndefined();
    expect(body.data.userId).toBeUndefined();
  });
});
