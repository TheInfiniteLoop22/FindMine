import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

import { logger } from '@/lib/logger';

import { getErrorMessage } from '@/lib/errors';
// GET /api/posts/[id]/claims — returns claims for a post with owner vs non-owner visibility
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const currentUserId = session?.user?.id;

    const { id: postId } = await params;

    // Fetch the post to determine ownership
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { userId: true, privateDetail: true },
    });

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const isOwner = currentUserId && post.userId === currentUserId;

    const claims = await prisma.claim.findMany({
      where: { postId },
      orderBy: { createdAt: 'desc' },
      include: {
        claimant: {
          select: {
            id: true,
            displayName: true,
            photoUrl: true,
            reputationScore: true,
            createdAt: true,
          },
        },
        conversationLink: {
          select: { conversationId: true },
        },
      },
    });

    // Compute loyalty bonus for each claimant + apply restricted-field pattern
    const processedClaims = claims.map((c) => {
      const now = new Date();
      const createdTime = new Date(c.claimant.createdAt);
      const diffMs = now.getTime() - createdTime.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const ageBonus = Math.min(10, Math.floor(diffDays / 30));
      const totalScore = (c.claimant.reputationScore || 0) + ageBonus;

      let tierLabel = 'New Member';
      if (totalScore >= 30) {
        tierLabel = 'Trusted Member';
      } else if (totalScore >= 10) {
        tierLabel = 'Active Member';
      }

      // Base claim — always visible to any viewer. Owner-only fields are
      // declared optional here (rather than typed Record<string, any>) so
      // the restricted-field pattern below stays type-checked: assigning
      // one of these keys anywhere it isn't declared would be a compile
      // error, not a silent typo.
      const baseClaim: {
        id: string;
        status: string;
        createdAt: Date;
        reviewedAt: Date | null;
        conversationId: string | null;
        claimant: {
          id: string;
          displayName: string;
          photoUrl: string | null;
          reputationScore: number;
          tierLabel: string;
        };
        answerText?: string | null;
        proofImageUrl?: string | null;
        itemStatus?: string | null;
        depositLocation?: string | null;
        depositLat?: number | null;
        depositLng?: number | null;
        foundAt?: Date | null;
        privateDetailAnswer?: string | null;
      } = {
        id: c.id,
        status: c.status,
        createdAt: c.createdAt,
        reviewedAt: c.reviewedAt,
        conversationId: c.conversationLink?.conversationId || null,
        claimant: {
          id: c.claimant.id,
          displayName: c.claimant.displayName,
          photoUrl: c.claimant.photoUrl,
          reputationScore: totalScore,
          tierLabel,
        },
      };

      // Owner-only: full structured answer content — restricted-field rule
      if (isOwner) {
        baseClaim.answerText = c.answerText;
        baseClaim.proofImageUrl = c.proofImageUrl;
        baseClaim.itemStatus = c.itemStatus;
        baseClaim.depositLocation = c.depositLocation;
        baseClaim.depositLat = c.depositLat;
        baseClaim.depositLng = c.depositLng;
        baseClaim.foundAt = c.foundAt;
        baseClaim.privateDetailAnswer = c.privateDetailAnswer;
      }

      return baseClaim;
    });

    // Sort: APPROVED pinned top → PENDING by most recent → REJECTED last
    const statusOrder: Record<string, number> = { APPROVED: 0, PENDING: 1, REJECTED: 2 };
    processedClaims.sort((a, b) => {
      const statusDiff = (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3);
      if (statusDiff !== 0) return statusDiff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return NextResponse.json({
      data: processedClaims,
      isOwner: !!isOwner,
      // Only provide privateDetail to owner (for side-by-side comparison)
      privateDetail: isOwner ? post.privateDetail : undefined,
    });
  } catch (error) {
    logger.error('Error fetching post claims', { error });
    return NextResponse.json(
      { error: 'Failed to fetch claims' },
      { status: 500 }
    );
  }
}


const claimCreateSchema = z.object({
  answerText: z.string().optional(),
  proofImageUrl: z.string().url().optional().or(z.literal('')),
  itemStatus: z.enum(['WITH_ME', 'DEPOSITED']).optional(),
  depositLocation: z.string().optional(),
  depositLat: z.number().optional().nullable(),
  depositLng: z.number().optional().nullable(),
  foundAt: z.string().optional(),
  privateDetailAnswer: z.string().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized. Please sign in to claim this item.', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const { id: postId } = await params;
    const body = await request.json();

    const parseResult = claimCreateSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid claim input parameters.', code: 'INVALID_INPUT' },
        { status: 400 }
      );
    }

    const {
      answerText,
      proofImageUrl,
      itemStatus,
      depositLocation,
      depositLat,
      depositLng,
      foundAt,
      privateDetailAnswer,
    } = parseResult.data;

    const post = await prisma.post.findUnique({
      where: { id: postId },
    });

    if (!post) {
      return NextResponse.json({ error: 'Post not found.', code: 'NOT_FOUND' }, { status: 404 });
    }

    if (post.status !== 'OPEN') {
      return NextResponse.json(
        { error: 'This post is no longer open for claims.', code: 'POST_CLOSED' },
        { status: 400 }
      );
    }

    if (post.userId === session.user.id) {
      return NextResponse.json(
        { error: 'You cannot file a claim on your own post.', code: 'FORBIDDEN_OWNER' },
        { status: 403 }
      );
    }

    const existingClaim = await prisma.claim.findFirst({
      where: {
        postId,
        claimantId: session.user.id,
        status: {
          in: ['PENDING', 'APPROVED'],
        },
      },
    });

    if (existingClaim) {
      return NextResponse.json(
        { error: 'You already have an active or approved claim on this post.', code: 'CLAIM_EXISTS' },
        { status: 409 }
      );
    }

    // Dynamic application layer verification rules depending on lost vs found post type
    if (post.type === 'LOST') {
      // Required parameters: proofImageUrl, foundAt, itemStatus
      if (!proofImageUrl || proofImageUrl.trim() === '') {
        return NextResponse.json(
          { error: 'Photo proof is required to file this claim.', code: 'INVALID_INPUT' },
          { status: 400 }
        );
      }
      if (!foundAt || !itemStatus) {
        return NextResponse.json(
          { error: 'Please provide when you found it and its current location status.', code: 'INVALID_INPUT' },
          { status: 400 }
        );
      }
      if (itemStatus === 'DEPOSITED' && (!depositLocation || depositLocation.trim() === '')) {
        return NextResponse.json(
          { error: 'Please specify where you deposited the item.', code: 'INVALID_INPUT' },
          { status: 400 }
        );
      }
      if (post.privateDetail && (!privateDetailAnswer || privateDetailAnswer.trim() === '')) {
        return NextResponse.json(
          { error: 'Please answer the private verification question asked by the owner.', code: 'INVALID_INPUT' },
          { status: 400 }
        );
      }
    } else {
      // Claiming a FOUND post
      if (post.privateDetail && (!privateDetailAnswer || privateDetailAnswer.trim() === '')) {
        return NextResponse.json(
          { error: 'Please answer the private verification question asked by the finder.', code: 'INVALID_INPUT' },
          { status: 400 }
        );
      }
      if (!post.privateDetail && (!answerText || answerText.trim() === '')) {
        return NextResponse.json(
          { error: 'Please describe the identifying detail of the item.', code: 'INVALID_INPUT' },
          { status: 400 }
        );
      }
    }

    const claim = await prisma.claim.create({
      data: {
        postId,
        claimantId: session.user.id,
        ownerId: post.userId,
        answerText: answerText || null,
        proofImageUrl: proofImageUrl || null,
        itemStatus: itemStatus || null,
        depositLocation: depositLocation || null,
        depositLat: depositLat ?? null,
        depositLng: depositLng ?? null,
        foundAt: foundAt ? new Date(foundAt) : null,
        privateDetailAnswer: privateDetailAnswer || null,
        status: 'PENDING',
      },
    });

    return NextResponse.json({ data: claim }, { status: 201 });
  } catch (error: unknown) {
    logger.error('Error filing claim', { error });
    return NextResponse.json(
      { error: getErrorMessage(error, 'Failed to file claim'), code: 'INTERNAL_SERVER_ERROR' },
      { status: 500 }
    );
  }
}
