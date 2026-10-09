import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getIO } from "@/lib/socket";

import { logger } from '@/lib/logger';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { id: conversationId } = await params;
    const userId = session.user.id;

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        userA: { select: { id: true, displayName: true, photoUrl: true } },
        userB: { select: { id: true, displayName: true, photoUrl: true } },
        links: {
          include: {
            post: { select: { id: true, title: true, type: true, status: true } },
          },
        },
        messages: {
          orderBy: { createdAt: "asc" },
          include: {
            sender: { select: { id: true, displayName: true } },
          },
        },
      },
    });

    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    }

    if (conversation.userAId !== userId && conversation.userBId !== userId) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    // Mark all incoming messages (not from this user) as read on open
    const readResult = await prisma.message.updateMany({
      where: {
        conversationId,
        senderId: { not: userId },
        readAt: null,
        isSystem: false,
      },
      data: { readAt: new Date() },
    });

    // Let the other participant's client update its seen-checkmark live instead of
    // waiting for them to notice on their own next fetch.
    if (readResult.count > 0) {
      getIO()?.to(conversationId).emit("messages:read", { conversationId, readerId: userId });
    }

    const otherUser = conversation.userAId === userId ? conversation.userB : conversation.userA;

    const safeMessages = conversation.messages.map((m) => {
      return {
        id: m.id,
        conversationId: m.conversationId,
        senderId: m.senderId,
        body: m.body,
        isSystem: m.isSystem,
        createdAt: m.createdAt,
        readAt: m.readAt,
        sender: m.sender ? { id: m.sender.id, displayName: m.sender.displayName } : null,
      };
    });

    return NextResponse.json({
      data: {
        id: conversation.id,
        otherUser: { id: otherUser.id, displayName: otherUser.displayName, photoUrl: otherUser.photoUrl },
        links: conversation.links,
        messages: safeMessages,
      },
    });
  } catch (error) {
    logger.error("Error fetching conversation messages", { error });
    return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { id: conversationId } = await params;
    const userId = session.user.id;

    const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });

    if (!conversation) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    if (conversation.userAId !== userId && conversation.userBId !== userId) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const body = await request.json();
    const { messageText } = body;

    if (!messageText?.trim()) {
      return NextResponse.json({ error: "Message content is required." }, { status: 400 });
    }

    const message = await prisma.message.create({
      data: {
        conversationId,
        senderId: userId,
        body: messageText,
        isSystem: false,
      },
    });

    getIO()?.to(conversationId).emit("message:new", message);

    return NextResponse.json({ data: message }, { status: 201 });
  } catch (error) {
    logger.error("Error posting message", { error });
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}