import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getIO } from '@/lib/socket';
import { approveClaim, ClaimApprovalError } from '@/lib/claims/approveClaim';

import { logger } from '@/lib/logger';

import { getErrorMessage } from '@/lib/errors';
const STATUS_BY_CODE: Record<ClaimApprovalError['code'], number> = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  ALREADY_REVIEWED: 400,
  POST_NOT_OPEN: 400,
};

// POST /api/claims/[id]/approve - Atomically approve claim, reject sibling claims, mark post MATCHED & create Conversation
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

    const { systemMessage } = await approveClaim(claimId, session.user.id);

    if (systemMessage) {
      getIO()?.to(systemMessage.conversationId).emit('message:new', systemMessage);
    }

    return NextResponse.json({
      message: 'Claim approved successfully. Contact details revealed.',
    });
  } catch (error: unknown) {
    if (error instanceof ClaimApprovalError) {
      return NextResponse.json({ error: error.message }, { status: STATUS_BY_CODE[error.code] });
    }
    logger.error('Error approving claim', { error });
    return NextResponse.json(
      { error: getErrorMessage(error, 'Failed to approve claim') },
      { status: 500 }
    );
  }
}
