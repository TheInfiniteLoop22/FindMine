import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { logger } from '@/lib/logger';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const userId = session.user.id;

    const conversations = await prisma.conversation.findMany({
      where: {
        OR: [{ userAId: userId }, { userBId: userId }],
      },
      include: {
        userA: { select: { id: true, displayName: true, photoUrl: true } },
        userB: { select: { id: true, displayName: true, photoUrl: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    // Get unread counts per conversation
    const unreadCounts = await prisma.message.groupBy({
      by: ["conversationId"],
      where: {
        conversationId: { in: conversations.map((c) => c.id) },
        senderId: { not: userId },
        readAt: null,
        isSystem: false,
      },
      _count: true,
    });

    const unreadMap: Record<string, number> = {};
    for (const u of unreadCounts) {
      unreadMap[u.conversationId] = u._count;
    }

    const inboxList = conversations.map((convo) => {
      const otherUser = convo.userAId === userId ? convo.userB : convo.userA;
      const lastMessage = convo.messages[0] || null;
      const unreadCount = unreadMap[convo.id] ?? 0;

      return {
        id: convo.id,
        createdAt: convo.createdAt,
        otherUser,
        lastMessage,
        unreadCount,
      };
    });

    inboxList.sort((a, b) => {
      const aTime = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : new Date(a.createdAt).getTime();
      const bTime = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : new Date(b.createdAt).getTime();
      return bTime - aTime;
    });

    return NextResponse.json({ data: inboxList });
  } catch (error) {
    logger.error("Error fetching conversations", { error });
    return NextResponse.json({ error: "Failed to fetch conversations" }, { status: 500 });
  }
}