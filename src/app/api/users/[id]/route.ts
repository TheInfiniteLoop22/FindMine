import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/security";

import { logger } from '@/lib/logger';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Fully public, unauthenticated (anyone can view any profile by ID) — same
    // category as the QR scan-lookup route, which already has this same
    // per-IP throttle for the same reason (was previously missing here).
    const clientIp = getClientIp(request.headers.get("x-forwarded-for"));
    const limit = rateLimit(`user-profile:${clientIp}`, 30, 60000);
    if (!limit.success) {
      return NextResponse.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
    }

    const { id: userId } = await params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        displayName: true,
        photoUrl: true,
        bio: true,
        reputationScore: true,
        createdAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const openPosts = await prisma.post.findMany({
      where: { userId, status: "OPEN" },
      select: {
        id: true,
        type: true,
        title: true,
        category: true,
        locationText: true,
        photoUrl: true,
        createdAt: true,
        status: true,
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    const score = user.reputationScore ?? 0;
    let tierLabel = "New Member";
    if (score >= 30) tierLabel = "Trusted Member";
    else if (score >= 10) tierLabel = "Active Member";

    return NextResponse.json({ data: { ...user, tierLabel, openPosts } });
  } catch (error) {
    logger.error("Error fetching public user profile", { error });
    return NextResponse.json({ error: "Failed to fetch user profile" }, { status: 500 });
  }
}