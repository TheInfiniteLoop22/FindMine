import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

import { logger } from '@/lib/logger';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const postId = resolvedParams.id;

    const session = await getServerSession(authOptions);
    if (!session || !session.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    // 1. Fetch the post to confirm ownership and status
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: {
        id: true,
        userId: true,
        embeddingStatus: true,
      },
    });

    if (!post) {
      return NextResponse.json(
        { error: 'Post not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    // Matches are only ever shown to the post's own owner (per spec) — never to other viewers.
    if (post.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Not the post owner', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    const rawMatches = await prisma.postMatch.findMany({
      where: { postId, score: { gte: 0.4 } },
      orderBy: { score: 'desc' },
      take: 5,
      select: {
        id: true,
        score: true,
        distanceKm: true,
        matchedPost: {
          select: {
            id: true,
            type: true,
            status: true,
            title: true,
            description: true,
            category: true,
            photoUrl: true,
            locationText: true,
            lat: true,
            lng: true,
            createdAt: true,
            userId: true,
            images: {
              orderBy: { isPrimary: 'desc' },
            },
          },
        },
      },
    });

    // Format matches cleanly, sanitizing any private fields (restricted-field patterns)
    const formattedMatches = rawMatches.map((m) => {
      const p = m.matchedPost;
      return {
        id: m.id,
        score: m.score,
        distanceKm: m.distanceKm,
        matchedPost: {
          id: p.id,
          type: p.type,
          status: p.status,
          title: p.title,
          description: p.description,
          category: p.category,
          photoUrl: p.images.find((img) => img.isPrimary)?.url || p.images[0]?.url || p.photoUrl,
          locationText: p.locationText,
          lat: p.lat,
          lng: p.lng,
          createdAt: p.createdAt,
          images: p.images,
        },
      };
    });

    return NextResponse.json({
      data: {
        embeddingStatus: post.embeddingStatus,
        matches: formattedMatches,
      },
    });
  } catch (error) {
    logger.error('Error fetching matches', { error });
    return NextResponse.json(
      { error: 'Failed to fetch matches', code: 'INTERNAL_SERVER_ERROR' },
      { status: 500 }
    );
  }
}
