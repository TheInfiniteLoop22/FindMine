import { prisma } from '@/lib/prisma';

/**
 * The claim-approve transaction, factored out of the route handler so it's
 * testable directly against a real database without needing next-auth/
 * next/server/a running HTTP server (see
 * src/lib/claims/__tests__/approveClaim.integration.test.ts). Same logic
 * as before, no behavior change - the route now just maps
 * ClaimApprovalError to the right HTTP status.
 *
 * Atomically: approve the target claim, reject sibling PENDING claims on
 * the same post, mark the post MATCHED, award the claimant +5 reputation,
 * and create (or reuse) a Conversation with a system message announcing
 * the match.
 */
export class ClaimApprovalError extends Error {
  code: 'NOT_FOUND' | 'FORBIDDEN' | 'ALREADY_REVIEWED' | 'POST_NOT_OPEN';
  constructor(code: 'NOT_FOUND' | 'FORBIDDEN' | 'ALREADY_REVIEWED' | 'POST_NOT_OPEN', message: string) {
    super(message);
    this.code = code;
    this.name = 'ClaimApprovalError';
  }
}

export async function approveClaim(claimId: string, requestingUserId: string) {
  const claim = await prisma.claim.findUnique({
    where: { id: claimId },
    include: { post: true },
  });

  if (!claim) {
    throw new ClaimApprovalError('NOT_FOUND', 'Claim not found');
  }

  if (claim.ownerId !== requestingUserId) {
    throw new ClaimApprovalError('FORBIDDEN', 'You can only approve claims on your own posts.');
  }

  if (claim.status !== 'PENDING') {
    throw new ClaimApprovalError('ALREADY_REVIEWED', 'This claim has already been reviewed.');
  }

  // A post can be closed directly by its owner (POST /api/posts/[id]/close) without
  // touching outstanding PENDING claims on it. Without this check, approving one of
  // those afterward would silently regress an already-CLOSED post back to MATCHED
  // and still award reputation - a real state-machine violation, not just a display
  // glitch. Only OPEN posts can transition to MATCHED via claim approval.
  if (claim.post.status !== 'OPEN') {
    throw new ClaimApprovalError('POST_NOT_OPEN', 'This post is no longer open — it may have been closed or already matched.');
  }

  const now = new Date();
  const [userAId, userBId] = [claim.ownerId, claim.claimantId].sort();

  const systemMessage = await prisma.$transaction(async (tx) => {
    // a) Mark target claim APPROVED — guarded by status: 'PENDING' as defense-in-depth
    // against a concurrent approve/reject racing past the check above (previously
    // unconditional; only safe by accident via ConversationPostLink.claimId's unique
    // constraint further down, which isn't obviously why-it's-safe at a glance).
    const { count } = await tx.claim.updateMany({
      where: { id: claimId, status: 'PENDING' },
      data: { status: 'APPROVED', reviewedAt: now },
    });
    if (count === 0) {
      throw new ClaimApprovalError('ALREADY_REVIEWED', 'This claim has already been reviewed.');
    }

    // b) Mark all other PENDING claims on the same post REJECTED
    await tx.claim.updateMany({
      where: { postId: claim.postId, id: { not: claimId }, status: 'PENDING' },
      data: { status: 'REJECTED', reviewedAt: now },
    });

    // c) Mark post status MATCHED
    await tx.post.update({
      where: { id: claim.postId },
      data: { status: 'MATCHED' },
    });

    // d) Log ReputationEvent (CLAIM_APPROVED, +5, for the claimant)
    await tx.reputationEvent.create({
      data: {
        userId: claim.claimantId,
        type: 'CLAIM_APPROVED',
        points: 5,
        refPostId: claim.postId,
        refClaimId: claimId,
      },
    });

    // e) Increment User.reputationScore by 5 for the claimant
    await tx.user.update({
      where: { id: claim.claimantId },
      data: { reputationScore: { increment: 5 } },
    });

    // f) Reuse an existing Conversation between these two users, or create one
    let conversation = await tx.conversation.findUnique({
      where: { userAId_userBId: { userAId, userBId } },
    });

    if (!conversation) {
      conversation = await tx.conversation.create({
        data: { userAId, userBId },
      });
    }

    // g) Link the conversation to this post/claim
    await tx.conversationPostLink.create({
      data: { conversationId: conversation.id, postId: claim.postId, claimId },
    });

    // h) Insert a system message announcing the verified claim
    const message = await tx.message.create({
      data: {
        conversationId: conversation.id,
        senderId: null,
        body: `New claim verified on '${claim.post.title}'`,
        isSystem: true,
      },
    });
    return { id: message.id, conversationId: message.conversationId };
  });

  return { claim, systemMessage };
}
