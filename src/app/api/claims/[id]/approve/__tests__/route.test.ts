import { describe, it, expect, vi, beforeEach } from 'vitest';

// HTTP-layer test for POST /api/claims/[id]/approve: the routing/auth/
// error-mapping logic that wraps approveClaim(). The claim-approval
// business logic itself (state machine, race-condition guard, reputation,
// conversation creation) is already covered end-to-end against a real
// database by src/lib/claims/__tests__/approveClaim.integration.test.ts -
// this file mocks approveClaim() entirely and asserts only what this route
// handler itself is responsible for: requiring a session, and translating
// each ClaimApprovalError code (including POST_NOT_OPEN, a regression
// guard) to the correct
// HTTP status.

const { getServerSessionMock, approveClaimMock, getIOMock } = vi.hoisted(() => ({
  getServerSessionMock: vi.fn(),
  approveClaimMock: vi.fn(),
  getIOMock: vi.fn(),
}));

vi.mock('next-auth', () => ({
  getServerSession: getServerSessionMock,
}));
vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));
vi.mock('@/lib/socket', () => ({
  getIO: getIOMock,
}));
vi.mock('@/lib/claims/approveClaim', async () => {
  const actual = await vi.importActual<typeof import('@/lib/claims/approveClaim')>(
    '@/lib/claims/approveClaim'
  );
  return {
    ...actual,
    approveClaim: approveClaimMock,
  };
});

import { POST } from '../route';
import { ClaimApprovalError } from '@/lib/claims/approveClaim';

function makeParams(id = 'claim-1') {
  return { params: Promise.resolve({ id }) };
}

describe('POST /api/claims/[id]/approve', () => {
  beforeEach(() => {
    getServerSessionMock.mockReset();
    approveClaimMock.mockReset();
    getIOMock.mockReset();
  });

  it('returns 401 when there is no session', async () => {
    getServerSessionMock.mockResolvedValue(null);

    const res = await POST(new Request('http://test/api/claims/claim-1/approve', { method: 'POST' }), makeParams());

    expect(res.status).toBe(401);
    expect(approveClaimMock).not.toHaveBeenCalled();
  });

  it('returns 401 when the session has no user id', async () => {
    getServerSessionMock.mockResolvedValue({ user: {} });

    const res = await POST(new Request('http://test/api/claims/claim-1/approve', { method: 'POST' }), makeParams());

    expect(res.status).toBe(401);
  });

  it.each([
    ['NOT_FOUND', 404],
    ['FORBIDDEN', 403],
    ['ALREADY_REVIEWED', 400],
    ['POST_NOT_OPEN', 400],
  ] as const)(
    'maps ClaimApprovalError(%s) to HTTP %i',
    async (code, expectedStatus) => {
      getServerSessionMock.mockResolvedValue({ user: { id: 'owner-1' } });
      approveClaimMock.mockRejectedValue(new ClaimApprovalError(code, `boom-${code}`));

      const res = await POST(
        new Request('http://test/api/claims/claim-1/approve', { method: 'POST' }),
        makeParams()
      );
      const body = await res.json();

      expect(res.status).toBe(expectedStatus);
      expect(body.error).toBe(`boom-${code}`);
    }
  );

  it('passes the session user id (not any client-supplied id) to approveClaim', async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: 'owner-1' } });
    approveClaimMock.mockResolvedValue({ systemMessage: null });

    await POST(new Request('http://test/api/claims/claim-1/approve', { method: 'POST' }), makeParams('claim-1'));

    expect(approveClaimMock).toHaveBeenCalledWith('claim-1', 'owner-1');
  });

  it('returns 200 and does not touch the socket server when there is no system message', async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: 'owner-1' } });
    approveClaimMock.mockResolvedValue({ systemMessage: null });

    const res = await POST(new Request('http://test/api/claims/claim-1/approve', { method: 'POST' }), makeParams());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.message).toMatch(/approved/i);
    expect(getIOMock).not.toHaveBeenCalled();
  });

  it('emits message:new to the conversation room when a system message is created', async () => {
    const emit = vi.fn();
    const to = vi.fn(() => ({ emit }));
    getIOMock.mockReturnValue({ to });
    getServerSessionMock.mockResolvedValue({ user: { id: 'owner-1' } });
    const systemMessage = { conversationId: 'conv-1', body: 'Claim approved' };
    approveClaimMock.mockResolvedValue({ systemMessage });

    const res = await POST(new Request('http://test/api/claims/claim-1/approve', { method: 'POST' }), makeParams());

    expect(res.status).toBe(200);
    expect(to).toHaveBeenCalledWith('conv-1');
    expect(emit).toHaveBeenCalledWith('message:new', systemMessage);
  });

  it('returns 500 for an unexpected (non-ClaimApprovalError) failure', async () => {
    getServerSessionMock.mockResolvedValue({ user: { id: 'owner-1' } });
    approveClaimMock.mockRejectedValue(new Error('db exploded'));

    const res = await POST(new Request('http://test/api/claims/claim-1/approve', { method: 'POST' }), makeParams());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe('db exploded');
  });
});
