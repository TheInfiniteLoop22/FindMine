import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

import { logger } from '@/lib/logger';

// GET /api/claims/mine - Returns claims filed BY the logged in user
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized. Please sign in.' },
        { status: 401 }
      );
    }

    const claims = await prisma.claim.findMany({
      where: {
        claimantId: session.user.id,
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        conversationLink: {
          select: {
            conversationId: true,
          },
        },
        post: {
          include: {
            user: {
              select: {
                displayName: true,
              },
            },
            images: {
              where: { isPrimary: true },
              take: 1,
            },
          },
        },
      },
    });

    const safeClaims = claims.map((claim) => {
      return {
        id: claim.id,
        status: claim.status,
        answerText: claim.answerText,
        createdAt: claim.createdAt,
        reviewedAt: claim.reviewedAt,
        conversationId: claim.conversationLink?.conversationId || null,
        post: {
          id: claim.post.id,
          title: claim.post.title,
          type: claim.post.type,
          category: claim.post.category,
          status: claim.post.status,
          locationText: claim.post.locationText,
          imageUrl: claim.post.images[0]?.url || claim.post.photoUrl,
          ownerDisplayName: claim.post.user.displayName,
        },
      };
    });

    return NextResponse.json({ data: safeClaims });
  } catch (error) {
    logger.error('Error fetching my claims', { error });
    return NextResponse.json(
      { error: 'Failed to fetch your claims' },
      { status: 500 }
    );
  }
}
