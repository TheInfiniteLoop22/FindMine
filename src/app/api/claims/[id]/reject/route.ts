import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

import { logger } from '@/lib/logger';

import { getErrorMessage } from '@/lib/errors';
// POST /api/claims/[id]/reject - Reject a claim on a post
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized. Please sign in.' },
        { status: 401 }
      );
    }

    const { id: claimId } = await params;

    const claim = await prisma.claim.findUnique({
      where: { id: claimId },
    });

    if (!claim) {
      return NextResponse.json({ error: 'Claim not found' }, { status: 404 });
    }

    if (claim.ownerId !== session.user.id) {
      return NextResponse.json(
        { error: 'Forbidden. You can only reject claims on your own posts.' },
        { status: 403 }
      );
    }

    if (claim.status !== 'PENDING') {
      return NextResponse.json(
        { error: 'This claim has already been reviewed.' },
        { status: 400 }
      );
    }

    // Wrap the update and reputation adjustments inside a transaction
    // Status-guarded (compare-and-set): if a concurrent approve/reject already
    // moved this claim out of PENDING, the update matches nothing and we abort
    // instead of double-applying the reputation penalty.
    const updatedClaim = await prisma.$transaction(async (tx) => {
      const { count } = await tx.claim.updateMany({
        where: { id: claimId, status: 'PENDING' },
        data: { status: 'REJECTED', reviewedAt: new Date() },
      });
      if (count === 0) return null;

      await tx.reputationEvent.create({
        data: {
          userId: claim.claimantId,
          type: 'CLAIM_REJECTED',
          points: -2,
          refPostId: claim.postId,
          refClaimId: claimId,
        },
      });
      await tx.user.update({
        where: { id: claim.claimantId },
        data: { reputationScore: { decrement: 2 } },
      });
      return tx.claim.findUnique({ where: { id: claimId } });
    });

    if (!updatedClaim) {
      return NextResponse.json(
        { error: 'This claim has already been reviewed.' },
        { status: 409 }
      );
    }

    return NextResponse.json({ data: updatedClaim });
  } catch (error: unknown) {
    logger.error('Error rejecting claim', { error });
    return NextResponse.json(
      { error: getErrorMessage(error, 'Failed to reject claim') },
      { status: 500 }
    );
  }
}
