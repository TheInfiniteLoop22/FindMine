import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { logger } from '@/lib/logger';

// GET /api/conversations/unread-count
// Returns total unread message count for the current user across all conversations
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ count: 0 });
    }

    const userId = session.user.id;

    // Find all conversations this user is part of
    const conversations = await prisma.conversation.findMany({
      where: {
        OR: [{ userAId: userId }, { userBId: userId }],
      },
      select: { id: true },
    });

    const conversationIds = conversations.map((c) => c.id);

    if (conversationIds.length === 0) {
      return NextResponse.json({ count: 0 });
    }

    // Count messages not sent by this user and not yet read
    const unreadCount = await prisma.message.count({
      where: {
        conversationId: { in: conversationIds },
        senderId: { not: userId },
        isSystem: false,
        readAt: null,
      },
    });

    return NextResponse.json({ count: unreadCount });
  } catch (error) {
    logger.error("Error fetching unread count", { error });
    return NextResponse.json({ count: 0 });
  }
}