import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

import { logger } from '@/lib/logger';

// GET /api/registered-items/[id]/scans - Retrieve scan log for one item
export async function GET(
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

    const item = await prisma.registeredItem.findUnique({
      where: { id },
    });

    if (!item) {
      return NextResponse.json({ error: 'Item not found.' }, { status: 404 });
    }

    if (item.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden. Owner only.' }, { status: 403 });
    }

    const scans = await prisma.scanEvent.findMany({
      where: { registeredItemId: id },
      orderBy: { scannedAt: 'desc' },
    });

    return NextResponse.json({ data: scans });
  } catch (error) {
    logger.error('Error fetching scans log', { error });
    return NextResponse.json(
      { error: 'Failed to fetch scan log.' },
      { status: 500 }
    );
  }
}
