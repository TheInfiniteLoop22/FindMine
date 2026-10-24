import { describe, it, expect, afterEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { approveClaim, ClaimApprovalError } from '../approveClaim';

// Integration tests against a real database (run via `npm run test:integration`,
// see vitest.integration.config.mts) - this transaction is the most complex
// single piece of business logic in the app (7-step atomic write), so its
// atomicity properties are worth verifying against a real Postgres
// transaction rather than mocking Prisma. All test data is created with a
// unique run-scoped marker and deleted in afterEach, regardless of pass/fail.

const RUN_ID = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let n = 0;
function uniqueEmail() {
  n += 1;
  return `${RUN_ID}-${n}@example.test`;
}

const createdUserIds: string[] = [];
const createdConversationIds: string[] = [];

async function createUser() {
  const user = await prisma.user.create({
    data: { email: uniqueEmail(), displayName: 'Test User', reputationScore: 0 },
  });
  createdUserIds.push(user.id);
  return user;
}

async function createPost(userId: string, type: 'LOST' | 'FOUND' = 'LOST') {
  return prisma.post.create({
    data: {
      type,
      title: `${RUN_ID} test post`,
      description: 'integration test fixture',
      category: 'Electronics',
      userId,
      locationText: 'Nowhere',
    },
  });
}

async function createClaim(postId: string, claimantId: string, ownerId: string) {
  return prisma.claim.create({
    data: { postId, claimantId, ownerId, status: 'PENDING' },
  });
}

afterEach(async () => {
  // Conversations aren't cascade-deleted from User (no onDelete on
  // Conversation.userA/userB), so they must go first; everything else
  // (Post, Claim, ReputationEvent, Message via Conversation) cascades from
  // deleting the Users/Conversations we created.
  if (createdConversationIds.length) {
    await prisma.conversation.deleteMany({ where: { id: { in: createdConversationIds } } });
    createdConversationIds.length = 0;
  }
  if (createdUserIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
  }
});

describe('approveClaim (integration)', () => {
  it('approves the claim, marks the post MATCHED, and awards +5 reputation to the claimant', async () => {
    const owner = await createUser();
    const claimant = await createUser();
    const post = await createPost(owner.id);
    const claim = await createClaim(post.id, claimant.id, owner.id);

    const { claim: approved, systemMessage } = await approveClaim(claim.id, owner.id);
    if (systemMessage) createdConversationIds.push(systemMessage.conversationId);

    expect(approved.status).toBe('PENDING'); // returned claim is the pre-transaction snapshot; re-fetch to check post-state
    const refetchedClaim = await prisma.claim.findUniqueOrThrow({ where: { id: claim.id } });
    expect(refetchedClaim.status).toBe('APPROVED');
    expect(refetchedClaim.reviewedAt).not.toBeNull();

    const refetchedPost = await prisma.post.findUniqueOrThrow({ where: { id: post.id } });
    expect(refetchedPost.status).toBe('MATCHED');

    const refetchedClaimant = await prisma.user.findUniqueOrThrow({ where: { id: claimant.id } });
    expect(refetchedClaimant.reputationScore).toBe(5);

    const reputationEvents = await prisma.reputationEvent.findMany({ where: { refClaimId: claim.id } });
    expect(reputationEvents).toHaveLength(1);
    expect(reputationEvents[0]).toMatchObject({ type: 'CLAIM_APPROVED', points: 5, userId: claimant.id });
  });

  it('rejects sibling PENDING claims on the same post', async () => {
    const owner = await createUser();
    const claimantA = await createUser();
    const claimantB = await createUser();
    const claimantC = await createUser();
    const post = await createPost(owner.id);

    const claimA = await createClaim(post.id, claimantA.id, owner.id);
    const claimB = await createClaim(post.id, claimantB.id, owner.id);
    const claimC = await createClaim(post.id, claimantC.id, owner.id);

    const { systemMessage } = await approveClaim(claimA.id, owner.id);
    if (systemMessage) createdConversationIds.push(systemMessage.conversationId);

    const [refA, refB, refC] = await Promise.all([
      prisma.claim.findUniqueOrThrow({ where: { id: claimA.id } }),
      prisma.claim.findUniqueOrThrow({ where: { id: claimB.id } }),
      prisma.claim.findUniqueOrThrow({ where: { id: claimC.id } }),
    ]);

    expect(refA.status).toBe('APPROVED');
    expect(refB.status).toBe('REJECTED');
    expect(refC.status).toBe('REJECTED');
  });

  it('reuses the existing Conversation (does not duplicate it) on a second claim between the same two users', async () => {
    const owner = await createUser();
    const claimant = await createUser();

    const postOne = await createPost(owner.id);
    const claimOne = await createClaim(postOne.id, claimant.id, owner.id);
    const { systemMessage: msg1 } = await approveClaim(claimOne.id, owner.id);
    expect(msg1).not.toBeNull();
    createdConversationIds.push(msg1!.conversationId);

    const postTwo = await createPost(owner.id);
    const claimTwo = await createClaim(postTwo.id, claimant.id, owner.id);
    const { systemMessage: msg2 } = await approveClaim(claimTwo.id, owner.id);
    expect(msg2).not.toBeNull();

    // Same conversation reused, not a second one created
    expect(msg2!.conversationId).toBe(msg1!.conversationId);

    const conversations = await prisma.conversation.findMany({
      where: {
        OR: [
          { userAId: owner.id, userBId: claimant.id },
          { userAId: claimant.id, userBId: owner.id },
        ],
      },
    });
    expect(conversations).toHaveLength(1);

    const messages = await prisma.message.findMany({ where: { conversationId: msg1!.conversationId } });
    expect(messages).toHaveLength(2); // one system message per approval, same conversation
  });

  it('throws NOT_FOUND for a nonexistent claim', async () => {
    const owner = await createUser();
    await expect(approveClaim('nonexistent-claim-id', owner.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws FORBIDDEN when the requester is not the post owner', async () => {
    const owner = await createUser();
    const claimant = await createUser();
    const stranger = await createUser();
    const post = await createPost(owner.id);
    const claim = await createClaim(post.id, claimant.id, owner.id);

    await expect(approveClaim(claim.id, stranger.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // No side effects from the rejected attempt
    const refetched = await prisma.claim.findUniqueOrThrow({ where: { id: claim.id } });
    expect(refetched.status).toBe('PENDING');
  });

  it('throws ALREADY_REVIEWED when approving a claim twice', async () => {
    const owner = await createUser();
    const claimant = await createUser();
    const post = await createPost(owner.id);
    const claim = await createClaim(post.id, claimant.id, owner.id);

    const { systemMessage } = await approveClaim(claim.id, owner.id);
    if (systemMessage) createdConversationIds.push(systemMessage.conversationId);

    await expect(approveClaim(claim.id, owner.id)).rejects.toMatchObject({
      code: 'ALREADY_REVIEWED',
    });
  });

  it('throws POST_NOT_OPEN when the post was closed directly, without touching the claim (regression)', async () => {
    // Reproduces: owner closes their post via POST /api/posts/[id]/close while a claim
    // is still PENDING (close doesn't touch outstanding claims), then approves that
    // claim. Before this guard, approveClaim only checked claim.status, so this would
    // silently regress the post CLOSED -> MATCHED and still award reputation.
    const owner = await createUser();
    const claimant = await createUser();
    const post = await createPost(owner.id);
    const claim = await createClaim(post.id, claimant.id, owner.id);

    await prisma.post.update({ where: { id: post.id }, data: { status: 'CLOSED' } });

    await expect(approveClaim(claim.id, owner.id)).rejects.toMatchObject({
      code: 'POST_NOT_OPEN',
    });

    const refetchedPost = await prisma.post.findUniqueOrThrow({ where: { id: post.id } });
    expect(refetchedPost.status).toBe('CLOSED'); // not regressed to MATCHED

    const refetchedClaim = await prisma.claim.findUniqueOrThrow({ where: { id: claim.id } });
    expect(refetchedClaim.status).toBe('PENDING'); // untouched

    const refetchedClaimant = await prisma.user.findUniqueOrThrow({ where: { id: claimant.id } });
    expect(refetchedClaimant.reputationScore).toBe(0); // no reputation awarded
  });

  it('leaves no partial state when the transaction fails partway through (atomicity)', async () => {
    const owner = await createUser();
    const claimant = await createUser();
    const post = await createPost(owner.id);
    const claim = await createClaim(post.id, claimant.id, owner.id);

    // Force step (g) - creating the ConversationPostLink - to fail by
    // pre-occupying its unique claimId constraint with a decoy row. This
    // verifies the earlier steps (claim APPROVED, post MATCHED, reputation
    // awarded) really do get rolled back by Prisma's $transaction, not just
    // that they "usually" happen in order.
    const decoyPost = await createPost(owner.id);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- created only for its DB row to exist
    const decoyClaim = await createClaim(decoyPost.id, claimant.id, owner.id);
    const decoyConversation = await prisma.conversation.create({
      data: { userAId: [owner.id, claimant.id].sort()[0], userBId: [owner.id, claimant.id].sort()[1] },
    });
    createdConversationIds.push(decoyConversation.id);
    await prisma.conversationPostLink.create({
      data: { conversationId: decoyConversation.id, postId: decoyPost.id, claimId: claim.id },
    });

    await expect(approveClaim(claim.id, owner.id)).rejects.toThrow();

    const refetchedClaim = await prisma.claim.findUniqueOrThrow({ where: { id: claim.id } });
    expect(refetchedClaim.status).toBe('PENDING'); // not APPROVED - rolled back

    const refetchedPost = await prisma.post.findUniqueOrThrow({ where: { id: post.id } });
    expect(refetchedPost.status).toBe('OPEN'); // not MATCHED - rolled back

    const refetchedClaimant = await prisma.user.findUniqueOrThrow({ where: { id: claimant.id } });
    expect(refetchedClaimant.reputationScore).toBe(0); // +5 was rolled back

    const reputationEvents = await prisma.reputationEvent.findMany({ where: { refClaimId: claim.id } });
    expect(reputationEvents).toHaveLength(0);
  });
});

describe('ClaimApprovalError', () => {
  it('is an instance of Error with the right name and code', () => {
    const err = new ClaimApprovalError('NOT_FOUND', 'nope');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ClaimApprovalError');
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('nope');
  });
});
