import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

import { logger } from '@/lib/logger';

import { getErrorMessage } from '@/lib/errors';
// POST /api/posts/[id]/close - Mark a post as CLOSED
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

    const { id: postId } = await params;

    const post = await prisma.post.findUnique({
      where: { id: postId },
    });

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    if (post.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Forbidden. You can only resolve/close your own posts.' },
        { status: 403 }
      );
    }

    if (post.status === 'CLOSED') {
      return NextResponse.json(
        { error: 'This post is already closed.' },
        { status: 400 }
      );
    }

    // Atomically close the post, record the reputation event (+10 points), and update owner reputationScore
    const [updatedPost] = await prisma.$transaction([
      prisma.post.update({
        where: { id: postId },
        data: {
          status: 'CLOSED',
        },
      }),
      prisma.reputationEvent.create({
        data: {
          userId: post.userId,
          type: 'POST_RESOLVED',
          points: 10,
          refPostId: postId,
        },
      }),
      prisma.user.update({
        where: { id: post.userId },
        data: {
          reputationScore: {
            increment: 10,
          },
        },
      }),
    ]);

    return NextResponse.json({ data: updatedPost });
  } catch (error: unknown) {
    logger.error('Error closing post', { error });
    return NextResponse.json(
      { error: getErrorMessage(error, 'Failed to close post') },
      { status: 500 }
    );
  }
}
