import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rateLimit';
import { getClientIp } from '@/lib/security';
import { getRoughAreaFromIp } from '@/lib/geoip';
import { createNotification } from '@/lib/notifications';

import { logger } from '@/lib/logger';

// GET /api/qr/[token] - Public token lookup endpoint
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const clientIp = getClientIp(request.headers.get('x-forwarded-for'));

    // This is a fully public, unauthenticated endpoint (anyone with the QR/token can
    // hit it) — previously had no rate limiting at all.
    const limit = rateLimit(`qr-scan:${clientIp}`, 30, 60000);
    if (!limit.success) {
      return NextResponse.json({ error: 'Too many requests. Please try again shortly.' }, { status: 429 });
    }

    const { token } = await params;

    const item = await prisma.registeredItem.findUnique({
      where: { publicToken: token },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
          },
        },
      },
    });

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    // Fire-and-forget: real geo lookup (city/region only, IP never stored), scan
    // logging, and an in-app alert to the owner — this is the actual "someone
    // scanned your item" alert now, independent of contactMode and not dependent
    // on email delivery being configured.
    const logScanAndNotify = async () => {
      try {
        const roughArea = await getRoughAreaFromIp(clientIp);

        await prisma.scanEvent.create({
          data: {
            registeredItemId: item.id,
            roughArea,
          },
        });

        await createNotification({
          userId: item.user.id,
          type: 'QR_SCAN',
          title: `Your item "${item.nickname}" was scanned`,
          body: `Someone scanned the QR code for "${item.nickname}" near ${roughArea}.`,
          linkUrl: `/my-items?item=${item.id}`,
        });

        logger.info(`[QR Scan] Logged + notified owner for item ${item.id}`);
      } catch (logErr) {
        logger.error('Error logging scan / notifying owner (silently caught)', { logErr });
      }
    };

    setTimeout(logScanAndNotify, 0);

    // Filter properties to guarantee restricted-field security
    const secureResponse = {
      nickname: item.nickname,
      category: item.category,
      photoUrl: item.photoUrl,
      status: item.status,
      lostAt: item.lostAt,
      contactMode: item.contactMode,
      ownerName: item.user.displayName,
      email: item.contactMode === 'SHOW_EMAIL' ? item.email : undefined,
    };

    return NextResponse.json({ data: secureResponse });
  } catch (error) {
    logger.error('Error in public scan API', { error });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
