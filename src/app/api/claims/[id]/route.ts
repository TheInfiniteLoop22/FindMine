import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

import { logger } from '@/lib/logger';

import { getErrorMessage } from '@/lib/errors';
// DELETE /api/claims/[id] - Cancel/delete a claim filed by the current user
export async function DELETE(
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

    const { id } = await params;

    const claim = await prisma.claim.findUnique({
      where: { id },
    });

    if (!claim) {
      return NextResponse.json({ error: 'Claim not found' }, { status: 404 });
    }

    if (claim.claimantId !== session.user.id) {
      return NextResponse.json(
        { error: 'Forbidden. You can only cancel your own claims.' },
        { status: 403 }
      );
    }

    // Allow cancelling if claim is PENDING
    if (claim.status !== 'PENDING') {
      return NextResponse.json(
        { error: 'You can only cancel pending claims.' },
        { status: 400 }
      );
    }

    await prisma.claim.delete({
      where: { id },
    });

    return NextResponse.json({ message: 'Claim cancelled successfully.' });
  } catch (error: unknown) {
    logger.error('Error deleting claim', { error });
    return NextResponse.json(
      { error: getErrorMessage(error, 'Failed to cancel claim') },
      { status: 500 }
    );
  }
}
