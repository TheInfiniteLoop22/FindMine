import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

import { logger } from '@/lib/logger';

// GET /api/registered-items/mine - List logged-in user's proactively registered items
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized. Please sign in.' },
        { status: 401 }
      );
    }

    const items = await prisma.registeredItem.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        scans: {
          orderBy: { scannedAt: 'desc' },
        },
      },
    });

    // Format output including latest scan info
    const parsedItems = items.map((item) => {
      const latestScan = item.scans[0] || null;
      return {
        id: item.id,
        nickname: item.nickname,
        category: item.category,
        photoUrl: item.photoUrl,
        contactMode: item.contactMode,
        status: item.status,
        publicToken: item.publicToken,
        createdAt: item.createdAt,
        lostAt: item.lostAt,
        scanCount: item.scans.length,
        lastScannedAt: latestScan ? latestScan.scannedAt : null,
      };
    });

    return NextResponse.json({ data: parsedItems });
  } catch (error) {
    logger.error('Error fetching registered items', { error });
    return NextResponse.json(
      { error: 'Failed to fetch registered items.' },
      { status: 500 }
    );
  }
}
