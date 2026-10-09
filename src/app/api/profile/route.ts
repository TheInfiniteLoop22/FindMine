import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { profileUpdateSchema } from '@/lib/validation';

import { logger } from '@/lib/logger';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized. Please sign in.' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: {
        reputationEvents: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 10,
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found.' },
        { status: 404 }
      );
    }

    // Calculate ACCOUNT_AGE_BONUS: +1 per 30 days, capped at +10 total
    const now = new Date();
    const createdTime = new Date(user.createdAt);
    const diffMs = now.getTime() - createdTime.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const ageBonus = Math.min(10, Math.floor(diffDays / 30));

    const totalReputation = user.reputationScore + ageBonus;

    // Return profile data including denormalized score plus lazy computed age bonus, plus list of 10 recent events
    return NextResponse.json({
      data: {
        id: user.id,
        email: user.email,
        emailVerified: !!user.emailVerified,
        displayName: user.displayName,
        photoUrl: user.photoUrl,
        bio: user.bio || '',
        createdAt: user.createdAt,
        reputationScore: totalReputation,
        rawReputationScore: user.reputationScore,
        ageBonus,
        reputationEvents: user.reputationEvents,
      },
    });
  } catch (error: unknown) {
    logger.error('Error fetching profile', { error });
    return NextResponse.json(
      { error: 'Failed to fetch profile.' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized. Please sign in.' },
        { status: 401 }
      );
    }

    const body = await request.json();

    const parseResult = profileUpdateSchema.safeParse(body);
    if (!parseResult.success) {
      logger.error('Zod validation error', { details: parseResult.error.flatten().fieldErrors });
      return NextResponse.json(
        {
          error: 'Validation failed',
          code: 'INVALID_INPUT',
          details: parseResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { displayName, photoUrl, bio } = parseResult.data;

    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        displayName: displayName || undefined,
        photoUrl: photoUrl !== undefined ? photoUrl : undefined,
        bio: bio !== undefined ? bio : undefined,
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        photoUrl: true,
        bio: true,
        createdAt: true,
        reputationScore: true,
        emailVerified: true,
      },
    });

    return NextResponse.json({ data: updatedUser });
  } catch (error: unknown) {
    logger.error('Error updating profile', { error });
    return NextResponse.json(
      { error: 'Failed to update profile.' },
      { status: 500 }
    );
  }
}

// DELETE /api/profile - Permanently delete the signed-in user's own account.
// Everything owned by the user (posts, claims, conversations, messages, reputation
// events, notifications, and now RegisteredItem too) cascades from the User row
// at the DB level. RegisteredItem is still deleted explicitly here as well —
// redundant with the FK's ON DELETE CASCADE now, but kept as a defensive,
// explicit step (it also documents that ScanEvent/RelayMessage cascade from it).
export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized. Please sign in.' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    if (body?.confirm !== 'DELETE') {
      return NextResponse.json(
        { error: 'Type DELETE to confirm account deletion.', code: 'CONFIRMATION_REQUIRED' },
        { status: 400 }
      );
    }

    await prisma.$transaction([
      prisma.registeredItem.deleteMany({ where: { userId: session.user.id } }),
      prisma.user.delete({ where: { id: session.user.id } }),
    ]);

    return NextResponse.json({ message: 'Account deleted successfully.' });
  } catch (error: unknown) {
    logger.error('Error deleting account', { error });
    return NextResponse.json(
      { error: 'Failed to delete account.' },
      { status: 500 }
    );
  }
}
