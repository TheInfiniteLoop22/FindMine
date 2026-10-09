import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PostType, PostStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { rateLimit } from '@/lib/rateLimit';
import { embeddingQueue } from '@/lib/queue';
import { runEmbeddingJob } from '@/lib/directRunner';

import { logger } from '@/lib/logger';

const postCreateSchema = z.object({
  type: z.enum(['LOST', 'FOUND']),
  title: z.string().min(3, 'Title must be at least 3 characters long').max(100),
  description: z.string().min(5, 'Description must be at least 5 characters long'),
  category: z.string().min(1, 'Category is required'),
  locationText: z.string().min(3, 'Location text description is required'),
  lat: z.number(),
  lng: z.number(),
  privateDetail: z.string().optional().nullable(),
  contactPhone: z.string().optional().nullable(),
  imageUrls: z.array(z.string()).min(1, 'At least 1 photo is required').max(3),
  eventDateTime: z.string().optional().nullable(),
  itemStatus: z.enum(['WITH_ME', 'DEPOSITED']).optional().nullable(),
  depositLocationText: z.string().optional().nullable(),
  depositLat: z.number().optional().nullable(),
  depositLng: z.number().optional().nullable(),
});

interface RawPostRow {
  id: string;
  type: PostType;
  status: PostStatus;
  title: string;
  description: string;
  category: string;
  photoUrl: string | null;
  locationText: string | null;
  lat: number | null;
  lng: number | null;
  createdAt: Date;
  userId: string;
  distance_km: number | string | null;
}

interface PostListItem {
  id: string;
  type: PostType;
  status: PostStatus;
  title: string;
  description: string;
  category: string;
  photoUrl: string | null;
  locationText: string | null;
  lat: number | null;
  lng: number | null;
  createdAt: Date;
  userId: string;
  distance_km: number | null;
  user: { displayName: string };
  images: unknown[];
  hasPrivateDetail: boolean;
  privateDetail?: string | null;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const typeParam = searchParams.get('type')?.toUpperCase();
    const categoryParam = searchParams.get('category');
    const queryParam = searchParams.get('q');
    const nearLatParam = searchParams.get('nearLat');
    const nearLngParam = searchParams.get('nearLng');
    const radiusKmParam = searchParams.get('radiusKm');

    const pageParam = parseInt(searchParams.get('page') || '1', 10);
    const limitParam = parseInt(searchParams.get('limit') || '50', 10);

    const page = Math.max(1, pageParam);
    const limit = Math.max(1, Math.min(100, limitParam));
    const skip = (page - 1) * limit;

    const hasGeoFilter = nearLatParam != null && nearLngParam != null;
    const nearLat = hasGeoFilter ? parseFloat(nearLatParam) : null;
    const nearLng = hasGeoFilter ? parseFloat(nearLngParam) : null;
    const radiusKm = radiusKmParam ? parseFloat(radiusKmParam) : 10;

    let posts: PostListItem[] = [];
    let totalCount = 0;

    if (hasGeoFilter && nearLat != null && nearLng != null && !isNaN(nearLat) && !isNaN(nearLng)) {
      const radiusMeters = radiusKm * 1000;

      // Every user-controlled value below is passed as a bound $N parameter to
      // $queryRawUnsafe rather than interpolated into the SQL string — only the
      // clause *shape* (whether a filter is present at all) is decided in JS.
      const whereParams: (string | number)[] = [nearLng, nearLat, radiusMeters];
      let paramIdx = 4;

      let typeClause = '';
      if (typeParam === 'LOST' || typeParam === 'FOUND') {
        typeClause = `AND type = $${paramIdx}::"PostType"`;
        whereParams.push(typeParam);
        paramIdx++;
      }

      let categoryClause = '';
      if (categoryParam && categoryParam !== 'All Categories' && categoryParam !== 'all') {
        categoryClause = `AND LOWER(category) = LOWER($${paramIdx})`;
        whereParams.push(categoryParam);
        paramIdx++;
      }

      let searchClause = '';
      if (queryParam && queryParam.trim() !== '') {
        searchClause = `AND (LOWER(title) LIKE LOWER($${paramIdx}) OR LOWER(description) LIKE LOWER($${paramIdx}) OR LOWER("locationText") LIKE LOWER($${paramIdx}))`;
        whereParams.push(`%${queryParam.trim()}%`);
        paramIdx++;
      }

      const limitIdx = paramIdx;
      const offsetIdx = paramIdx + 1;

      const rawPosts: RawPostRow[] = await prisma.$queryRawUnsafe(
        `
        SELECT
          p.id,
          p.type,
          p.status,
          p.title,
          p.description,
          p.category,
          p."photoUrl",
          p."locationText",
          p.lat,
          p.lng,
          p."createdAt",
          p."userId",
          ROUND((ST_Distance(p.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) / 1000)::numeric, 2) AS distance_km
        FROM "Post" p
        WHERE p.location IS NOT NULL
          AND ST_DWithin(p.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
          ${typeClause}
          ${categoryClause}
          ${searchClause}
        ORDER BY distance_km ASC, p."createdAt" DESC
        LIMIT $${limitIdx} OFFSET $${offsetIdx}
      `,
        ...whereParams,
        limit,
        skip
      );

      const countResult: { count: number }[] = await prisma.$queryRawUnsafe(
        `
        SELECT COUNT(*)::int AS count
        FROM "Post" p
        WHERE p.location IS NOT NULL
          AND ST_DWithin(p.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
          ${typeClause}
          ${categoryClause}
          ${searchClause}
      `,
        ...whereParams
      );

      totalCount = countResult[0]?.count || 0;

      const postIds = rawPosts.map((p) => p.id);
      const fullPosts = await prisma.post.findMany({
        where: { id: { in: postIds } },
        select: {
          id: true,
          user: { select: { displayName: true } },
          images: { orderBy: { isPrimary: 'desc' } },
          privateDetail: true,
        },
      });

      const fullPostMap = new Map(fullPosts.map((fp) => [fp.id, fp]));

      posts = rawPosts.map((rp) => {
        const fp = fullPostMap.get(rp.id);
        return {
          ...rp,
          distance_km: rp.distance_km != null ? Number(rp.distance_km) : null,
          user: fp?.user || { displayName: 'Community Member' },
          images: fp?.images || [],
          hasPrivateDetail: !!fp?.privateDetail,
        };
      });
    } else {
      const where: Prisma.PostWhereInput = {};

      if (typeParam === 'LOST' || typeParam === 'FOUND') {
        where.type = typeParam as PostType;
      }

      if (categoryParam && categoryParam !== 'All Categories' && categoryParam !== 'all') {
        where.category = {
          equals: categoryParam,
          mode: 'insensitive',
        };
      }

      if (queryParam && queryParam.trim() !== '') {
        const q = queryParam.trim();
        where.OR = [
          { title: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
          { locationText: { contains: q, mode: 'insensitive' } },
        ];
      }

      const [prismaPosts, count] = await Promise.all([
        prisma.post.findMany({
          where,
          orderBy: {
            createdAt: 'desc',
          },
          skip,
          take: limit,
          select: {
            id: true,
            type: true,
            status: true,
            title: true,
            description: true,
            category: true,
            photoUrl: true,
            locationText: true,
            lat: true,
            lng: true,
            createdAt: true,
            userId: true,
            user: {
              select: {
                displayName: true,
              },
            },
            images: {
              orderBy: {
                isPrimary: 'desc',
              },
            },
            privateDetail: true,
          },
        }),
        prisma.post.count({ where }),
      ]);

      posts = prismaPosts.map((p) => ({
        ...p,
        distance_km: null,
        hasPrivateDetail: !!p.privateDetail,
      }));
      totalCount = count;
    }

    // Never serialize the raw privateDetail value on the list endpoint — only the
    // boolean signal computed above. (Previously this was hardcoded to `true` for
    // every post regardless of whether one was actually set.)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to omit it from `p`
    const safePosts = posts.map(({ privateDetail, ...p }) => p);

    const hasMore = skip + posts.length < totalCount;

    return NextResponse.json({
      data: safePosts,
      pagination: {
        page,
        limit,
        totalCount,
        hasMore,
      },
    });
  } catch (error) {
    logger.error('Error fetching posts', { error });
    return NextResponse.json(
      { error: 'Failed to fetch posts', code: 'INTERNAL_SERVER_ERROR' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized. Please sign in to create a post.', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const limitResult = rateLimit(`post:${session.user.id}`, 20, 60000);
    if (!limitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. You can only create 20 posts per minute.', code: 'RATE_LIMIT_EXCEEDED' },
        { status: 429 }
      );
    }

    const body = await request.json();

    const parseResult = postCreateSchema.safeParse(body);
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

    const {
      type,
      title,
      description,
      category,
      locationText,
      lat,
      lng,
      privateDetail,
      contactPhone,
      imageUrls,
      eventDateTime,
      itemStatus,
      depositLocationText,
      depositLat,
      depositLng,
    } = parseResult.data;

    // itemStatus / deposit fields are only meaningful for FOUND posts (the finder's own
    // current-possession status) — ignore them entirely if submitted on a LOST post.
    const isFound = type === 'FOUND';

    const post = await prisma.post.create({
      data: {
        type: type as PostType,
        title,
        description,
        category,
        locationText: locationText || 'Location specified',
        lat,
        lng,
        privateDetail: privateDetail?.trim() || null,
        contactPhone: contactPhone?.trim() || null,
        eventDateTime: eventDateTime ? new Date(eventDateTime) : null,
        itemStatus: isFound ? itemStatus || null : null,
        depositLocationText: isFound && itemStatus === 'DEPOSITED' ? depositLocationText?.trim() || null : null,
        depositLat: isFound && itemStatus === 'DEPOSITED' ? depositLat ?? null : null,
        depositLng: isFound && itemStatus === 'DEPOSITED' ? depositLng ?? null : null,
        photoUrl: imageUrls[0],
        userId: session.user.id,
        embeddingStatus: 'pending',
        images: {
          create: imageUrls.map((url: string, index: number) => ({
            url,
            isPrimary: index === 0,
          })),
        },
      },
      include: {
        images: true,
      },
    });

    // `location` (PostGIS geography) is an Unsupported field in schema.prisma,
    // so Prisma Client can't write it through the ordinary create() call above
    // - it has to be set with raw SQL afterward. Without this, radius search
    // (ST_DWithin below, gated on `location IS NOT NULL`) and the
    // location-proximity term of post matching (directRunner.ts) silently
    // treat every post as if it had no location at all.
    await prisma.$executeRaw`
      UPDATE "Post"
      SET location = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
      WHERE id = ${post.id}
    `;

    // Enqueue background embedding job on Redis (fails gracefully if Upstash/Redis is unreachable offline)
    embeddingQueue.add('generate-embeddings', { postId: post.id }).catch(() => {
      logger.warn('[Queue] Upstash Redis offline, enqueuing ignored. Running direct runner fallback.');
    });

    // ALWAYS run the worker pipeline directly in a microtask background thread (do not block client HTTP response)
    // This handles local/offline execution perfectly without needing Redis connection!
    setTimeout(() => {
      runEmbeddingJob(post.id).catch((err) => {
        logger.error('[Background direct task] Failed to process embeddings', { err });
      });
    }, 0);

    return NextResponse.json({ data: post }, { status: 201 });
  } catch (error: unknown) {
    logger.error('Error creating post', { error });
    return NextResponse.json(
      { error: 'Failed to create post', code: 'INTERNAL_SERVER_ERROR' },
      { status: 500 }
    );
  }
}
