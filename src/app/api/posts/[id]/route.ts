import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { embeddingQueue } from '@/lib/queue';
import { runEmbeddingJob } from '@/lib/directRunner';

import { logger } from '@/lib/logger';

import { getErrorMessage } from '@/lib/errors';
// Mirrors postCreateSchema's per-field rules (src/app/api/posts/route.ts) for the
// subset of fields this route allows editing — previously this route only did ad-hoc
// length checks on title/description/locationText and passed lat/lng/privateDetail/
// contactPhone straight through with no type validation at all (a client sending
// lat: "not-a-number" hit a raw Prisma 500 instead of a clean 400).
const postUpdateSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters long').max(100).optional(),
  description: z.string().trim().min(5, 'Description must be at least 5 characters long').optional(),
  category: z.string().trim().min(1).optional(),
  locationText: z.string().trim().min(3, 'Location text must be at least 3 characters.').optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  privateDetail: z.string().max(500).optional().nullable(),
  contactPhone: z.string().max(30).optional().nullable(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const currentUserId = session?.user?.id;

    const { id } = await params;

    const post = await prisma.post.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
          },
        },
        images: {
          orderBy: {
            isPrimary: 'desc',
          },
        },
      },
    });

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const isOwner = currentUserId && post.userId === currentUserId;

    // Restricted field pattern: strictly strip privateDetail & contactPhone unless owner
    const safePost = {
      id: post.id,
      type: post.type,
      status: post.status,
      title: post.title,
      description: post.description,
      category: post.category,
      photoUrl: post.photoUrl,
      locationText: post.locationText,
      lat: post.lat,
      lng: post.lng,
      eventDateTime: post.eventDateTime,
      itemStatus: post.itemStatus,
      depositLocationText: post.depositLocationText,
      depositLat: post.depositLat,
      depositLng: post.depositLng,
      createdAt: post.createdAt,
      userId: post.userId,
      user: post.user,
      images: post.images,
      hasPrivateDetail: post.privateDetail !== null && post.privateDetail !== '',
      ...(isOwner
      ? {
          privateDetail: post.privateDetail,
          contactPhone: post.contactPhone,
        }
      : {}),
    };

    return NextResponse.json({ data: safePost });
  } catch (error) {
    logger.error('Error fetching post', { error });
    return NextResponse.json(
      { error: 'Failed to fetch post' },
      { status: 500 }
    );
  }
}

// DELETE /api/posts/[id] - Delete a post owned by user
export async function DELETE(
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

    const post = await prisma.post.findUnique({
      where: { id },
    });

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    if (post.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Forbidden. You are not the owner of this post.' },
        { status: 403 }
      );
    }

    // Delete post (cascade will delete its images and claims due to schema onDelete: Cascade setup)
    await prisma.post.delete({
      where: { id },
    });

    return NextResponse.json({ message: 'Post deleted successfully.' });
  } catch (error: unknown) {
    logger.error('Error deleting post', { error });
    return NextResponse.json(
      { error: getErrorMessage(error, 'Failed to delete post') },
      { status: 500 }
    );
  }
}

// PATCH /api/posts/[id] - Edit a post owned by user
export async function PATCH(
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

    const post = await prisma.post.findUnique({
      where: { id },
    });

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    if (post.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Forbidden. You are not the owner of this post.' },
        { status: 403 }
      );
    }

    if (post.status !== 'OPEN') {
      return NextResponse.json(
        { error: 'This post is already matched or resolved and cannot be edited.' },
        { status: 409 }
      );
    }

    const body = await request.json();
    const parseResult = postUpdateSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: parseResult.error.issues[0]?.message || 'Invalid input.',
          code: 'INVALID_INPUT',
          details: parseResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { title, description, category, locationText, lat, lng, privateDetail, contactPhone } = parseResult.data;

    const updatedPost = await prisma.post.update({
      where: { id },
      data: {
        title: title || undefined,
        description: description || undefined,
        category: category || undefined,
        locationText: locationText || undefined,
        lat: lat !== undefined ? lat : undefined,
        lng: lng !== undefined ? lng : undefined,
        privateDetail: privateDetail !== undefined ? privateDetail : undefined,
        contactPhone: contactPhone !== undefined ? contactPhone : undefined,
        // Any edit to the text the matching engine actually embeds on (title/
        // description/category) invalidates the existing image/text embeddings —
        // previously these were left stale forever after an edit, so the matching
        // engine kept scoring against pre-edit content silently. Flip back to
        // 'pending' and re-run the same background pipeline POST /api/posts uses.
        ...(title !== undefined || description !== undefined || category !== undefined
          ? { embeddingStatus: 'pending' }
          : {}),
      },
    });

    // See the matching comment in POST /api/posts/route.ts: `location` is an
    // Unsupported PostGIS field Prisma can't write via update(), so it has to
    // be kept in sync with lat/lng by hand whenever either one changes -
    // otherwise an edited pin silently stops matching its own new coordinates
    // in radius search.
    if (lat !== undefined || lng !== undefined) {
      await prisma.$executeRaw`
        UPDATE "Post"
        SET location = ST_SetSRID(ST_MakePoint(${updatedPost.lng}, ${updatedPost.lat}), 4326)::geography
        WHERE id = ${updatedPost.id}
      `;
    }

    if (title !== undefined || description !== undefined || category !== undefined) {
      embeddingQueue.add('generate-embeddings', { postId: updatedPost.id }).catch(() => {
        logger.warn('[Queue] Upstash Redis offline, enqueuing ignored. Running direct runner fallback.');
      });
      setTimeout(() => {
        runEmbeddingJob(updatedPost.id).catch((err) => {
          logger.error('[Background direct task] Failed to re-process embeddings after edit', { err });
        });
      }, 0);
    }

    return NextResponse.json({ data: updatedPost });
  } catch (error: unknown) {
    logger.error('Error editing post', { error });
    return NextResponse.json(
      { error: getErrorMessage(error, 'Failed to edit post') },
      { status: 500 }
    );
  }
}
