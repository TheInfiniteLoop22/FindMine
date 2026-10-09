import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/email';
import { createNotification } from '@/lib/notifications';
import { z } from 'zod';

import { logger } from '@/lib/logger';

// This route needs no auth (it's the public QR-scan relay) and is the only
// unvalidated route in the app reachable without signing in - so message
// length is bounded here rather than left open (previously unbounded,
// limited only by the 3-per-hour-per-token rate limit below, which caps
// request volume but not payload size per request).
const relayMessageSchema = z.object({
  message: z.string().trim().min(1, 'Message content is required.').max(2000, 'Message is too long.'),
  finderContact: z.string().trim().max(200, 'Contact info is too long.').optional().nullable(),
});

// POST /api/qr/[token]/message - Public relay message submission
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const body = await request.json();

    const parseResult = relayMessageSchema.safeParse(body);
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

    const { message, finderContact } = parseResult.data;

    // 1. Fetch item & verify ownership
    const item = await prisma.registeredItem.findUnique({
      where: { publicToken: token },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            displayName: true,
          },
        },
      },
    });

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    if (item.contactMode !== 'RELAY_ONLY') {
      return NextResponse.json({ error: 'Relay message contact mode is disabled for this item.' }, { status: 400 });
    }

    // 2. Enforce 3 submissions per token per hour rate limit
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const count = await prisma.relayMessage.count({
      where: {
        registeredItemId: item.id,
        sentAt: {
          gte: oneHourAgo,
        },
      },
    });

    if (count >= 3) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Maximum 3 relay messages per hour.' },
        { status: 429 }
      );
    }

    // 3. Persist Relay Message
    const relayMsg = await prisma.relayMessage.create({
      data: {
        registeredItemId: item.id,
        message: message.trim(),
        finderContact: finderContact || null,
        deliveredVia: 'email',
      },
    });

    // 4. Send transactional notification email alert to owner
    const emailHtml = `
      <div style="font-family: sans-serif; padding: 20px; color: #1e293b;">
        <h2 style="color: #4f46e5;">[FindMine] Good News! A finder scanned your item</h2>
        <p>Hello <strong>${item.user.displayName}</strong>,</p>
        <p>A finder has scanned your registered item: <strong>${item.nickname}</strong> and sent you a secure relay message:</p>
        
        <blockquote style="background: #f8fafc; border-left: 4px solid #4f46e5; padding: 15px; margin: 20px 0; font-style: italic;">
          "${message.trim()}"
        </blockquote>

        ${finderContact ? `
          <p><strong>Finder Contact Information:</strong><br />
          <span style="font-family: monospace; background: #f1f5f9; padding: 4px 8px; rounded: 4px;">
            ${finderContact.trim()}
          </span></p>
        ` : `
          <p><em>(The finder chose not to share their contact information)</em></p>
        `}

        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
        <p style="font-size: 11px; color: #94a3b8;">
          This is an automated notification from FindMine. Please protect your privacy when responding.
        </p>
      </div>
    `;

    // Best-effort secondary channel — silently no-ops to a console log if
    // RESEND_API_KEY isn't configured (see src/lib/email.ts), so this alone must
    // never be the only thing the "the owner has been notified" promise rests on.
    await sendEmail({
      to: item.user.email,
      subject: `[FindMine Alert] Relay Message for your item: ${item.nickname}`,
      html: emailHtml,
    });

    // The real, always-lands alert: an in-app notification the owner will see the
    // next time they're in the app, regardless of whether email delivery worked.
    await createNotification({
      userId: item.user.id,
      type: 'QR_RELAY_MESSAGE',
      title: `A finder messaged you about "${item.nickname}"`,
      body: finderContact
        ? `${message.trim()}\n\nFinder contact: ${finderContact.trim()}`
        : message.trim(),
      linkUrl: `/my-items?item=${item.id}`,
    });

    return NextResponse.json({ data: relayMsg }, { status: 201 });
  } catch (error) {
    logger.error('Error handling relay message', { error });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
