import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

import { logger } from '@/lib/logger';

const markReadSchema = z.object({
  id: z.string().optional(), // mark a single notification read; omit to mark all read
});

// POST /api/notifications/mark-read
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = markReadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { id } = parsed.data;

    await prisma.notification.updateMany({
      where: {
        userId: session.user.id,
        ...(id ? { id } : {}),
      },
      data: { read: true },
    });

    return NextResponse.json({ message: 'Marked as read.' });
  } catch (error) {
    logger.error('Error marking notifications read', { error });
    return NextResponse.json({ error: 'Failed to update notifications' }, { status: 500 });
  }
}
