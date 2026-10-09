import { prisma } from './prisma';
import { getTextEmbedding, getImageEmbedding } from './embeddings';
import { computeMatchScore } from './matching/score';
import { logger } from './logger';

/**
 * Canonical embedding-job implementation. Runs inline (via `setTimeout(fn, 0)` in
 * the request-handling process — see `POST /api/posts`) since no persistent worker
 * process is currently supervised in this deployment (see `queue.ts`). `worker.ts`
 * wraps this same function as a BullMQ job handler for when/if that changes, so
 * there is exactly one implementation of the matching logic, not two drifting copies.
 */
// postId -> when this process's runEmbeddingJob call started, for the stale-job
// sweep below. Deliberately in-memory, not a DB column: a process that OOM-kills
// or otherwise dies mid-job loses this along with everything else, and that's
// exactly the signal the sweep needs — on a fresh process, an 'processing' row
// nobody in *this* process is tracking can only be a crash orphan from a
// previous one, no separate DB timestamp column required.
const inFlightJobs = new Map<string, number>();

export async function runEmbeddingJob(postId: string) {
  logger.info('Embedding job: processing post', { postId });

  // Atomically claim the row before doing any work. If the inline direct-runner
  // call and a BullMQ worker (or two overlapping workers) both pick up the same
  // post, only one `updateMany` will match `embeddingStatus: 'pending'` and flip
  // it to 'processing' — the loser sees claimed.count === 0 and bails out instead
  // of double-processing (and double-writing embeddings/matches) for the same post.
  const claimed = await prisma.post.updateMany({
    where: { id: postId, embeddingStatus: 'pending' },
    data: { embeddingStatus: 'processing' },
  });

  if (claimed.count === 0) {
    logger.info('Embedding job: post already claimed or not pending, skipping', { postId });
    return;
  }

  inFlightJobs.set(postId, Date.now());
  try {
    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: { images: true },
    });

    if (!post) {
      logger.error('Embedding job: post not found', { postId });
      return;
    }

    const primaryPhoto =
      post.images.find((img) => img.isPrimary)?.url ||
      post.images[0]?.url ||
      post.photoUrl ||
      '';

    const textToEmbed = `${post.title} ${post.description}`;

    if (!primaryPhoto) {
      throw new Error('Post has no photo to embed');
    }

    // Sequential, not Promise.all: the two models are cached singletons (see
    // embeddings.ts) so this doesn't affect steady-state resident memory, but
    // running both forward passes concurrently doubles the transient peak
    // (input tensors + activation buffers for both onnx sessions at once) on
    // an already memory-constrained 512MB instance. Worth the added latency.
    const textVector = await getTextEmbedding(textToEmbed);
    const imageVector = await getImageEmbedding(primaryPhoto);

    const imageVectorStr = `[${imageVector.join(',')}]`;
    const textVectorStr = `[${textVector.join(',')}]`;

    await prisma.$executeRawUnsafe(
      `UPDATE "Post"
       SET "imageEmbedding" = $1::vector,
           "textEmbedding" = $2::vector,
           "embeddingStatus" = 'done'
       WHERE id = $3`,
      imageVectorStr,
      textVectorStr,
      postId
    );

    logger.info("Embedding job: saved embeddings, embeddingStatus set to 'done'", { postId });

    await computeMatchesForPost(postId);

    logger.info('Embedding job: matches updated', { postId });
  } catch (err: unknown) {
    logger.error('Embedding job: failed to process post', { postId, error: err });
    await prisma.post.update({
      where: { id: postId },
      data: { embeddingStatus: 'failed' },
    }).catch((updateErr) => logger.error('Embedding job: failed to mark post embeddingStatus failed', { postId, error: updateErr }));
    // Re-throw so a BullMQ caller (worker.ts) sees a rejected job and can retry;
    // the inline caller (POST /api/posts) already attaches its own .catch().
    throw err;
  } finally {
    inFlightJobs.delete(postId);
  }
}

// Safety net for the failure mode that motivated this: the embedding job can
// take the whole process down with it (e.g. an OOM-kill loading the ML
// models) partway through, after the atomic claim above already flipped
// embeddingStatus to 'processing' but before the try/catch above ever gets a
// chance to mark it 'failed'. Without this, that post's embeddingStatus is
// stuck at 'processing' forever - permanently excluded from matching, with
// no error visible anywhere.
//
// Post has no updatedAt column, so "stale" can't be computed from the DB
// alone. Instead: any post sitting at 'processing' that isn't in this
// process's own `inFlightJobs` map cannot possibly be a job this process is
// still working on - a fresh process starts with an empty map, so a
// 'processing' row found on startup is unambiguously a crash orphan from
// whatever process died mid-job last time. Also catches a same-process job
// that's been running suspiciously long (a genuine hang, e.g. a network
// stall fetching a model), via the recorded start time.
const STALE_PROCESSING_TIMEOUT_MS = 5 * 60 * 1000;
const STALE_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

export async function sweepStaleEmbeddingJobs() {
  try {
    const now = Date.now();
    const processingPosts = await prisma.post.findMany({
      where: { embeddingStatus: 'processing' },
      select: { id: true },
    });

    const staleIds = processingPosts
      .map((p) => p.id)
      .filter((id) => {
        const startedAt = inFlightJobs.get(id);
        // Not tracked by this process at all -> orphaned from a previous one.
        if (startedAt === undefined) return true;
        // Tracked, but running far longer than any real job should -> hung.
        return now - startedAt > STALE_PROCESSING_TIMEOUT_MS;
      });

    if (staleIds.length === 0) return;

    logger.warn('Embedding sweep: reclaiming stale processing posts', { count: staleIds.length, postIds: staleIds });

    for (const id of staleIds) {
      inFlightJobs.delete(id);
    }

    await prisma.post.updateMany({
      where: { id: { in: staleIds } },
      data: { embeddingStatus: 'pending' },
    });

    // Sequential, not fire-and-forget-in-parallel: this is called right after
    // a fresh process boots (see startStaleEmbeddingSweep), so "stale" here
    // usually means jobs orphaned by the crash that just happened. Retrying
    // several of them at once was re-creating the exact concurrent-embedding
    // memory spike that likely caused that crash in the first place - a
    // self-sustaining restart loop, confirmed live (multiple posts reclaimed
    // and immediately re-run together, then another restart minutes later).
    for (const id of staleIds) {
      try {
        await runEmbeddingJob(id);
      } catch (err) {
        logger.error('Embedding sweep: retry failed', { postId: id, error: err });
      }
    }
  } catch (err) {
    logger.error('Embedding sweep: error while sweeping stale jobs', { error: err });
  }
}

export function startStaleEmbeddingSweep() {
  // Run once immediately - a fresh process's empty inFlightJobs map means any
  // 'processing' row found right now is necessarily an orphan from whatever
  // process was running before this one, so there's no reason to wait a full
  // interval to reclaim it.
  sweepStaleEmbeddingJobs().catch((err) => logger.error('Embedding sweep: initial sweep failed', { error: err }));

  const timer = setInterval(sweepStaleEmbeddingJobs, STALE_SWEEP_INTERVAL_MS);
  timer.unref?.();
  return timer;
}

export async function computeMatchesForPost(postId: string) {
  logger.info('Matching: computing matches for post', { postId });

  interface MatchCandidateRow {
    matchedPostId: string;
    image_sim: number;
    text_sim: number;
    distance_km: number;
    category_match: boolean;
  }

  const matches: MatchCandidateRow[] = await prisma.$queryRawUnsafe(`
    SELECT p2.id AS "matchedPostId",
      (1 - (p1."imageEmbedding" <=> p2."imageEmbedding")) AS image_sim,
      (1 - (p1."textEmbedding" <=> p2."textEmbedding")) AS text_sim,
      ST_Distance(p1.location, p2.location) / 1000 AS distance_km,
      (p1.category = p2.category) AS category_match
    FROM "Post" p1, "Post" p2
    WHERE p1.id = $1
      AND p2.id != p1.id
      AND p2."userId" != p1."userId"
      AND p2.type != p1.type
      AND p2.status = 'OPEN'
      AND p1."imageEmbedding" IS NOT NULL
      AND p2."imageEmbedding" IS NOT NULL
      AND ST_DWithin(p1.location, p2.location, 50000)
    ORDER BY (
      0.35 * (1 - (p1."imageEmbedding" <=> p2."imageEmbedding")) +
      0.20 * (1 - (p1."textEmbedding" <=> p2."textEmbedding")) +
      0.20 * GREATEST(0::double precision, 1 - (ST_Distance(p1.location, p2.location) / 25000)) +
      0.25 * (CASE WHEN p1.category = p2.category THEN 1 ELSE 0 END)
    ) DESC
    LIMIT 5;
  `, postId);

  for (const match of matches) {
    const score = computeMatchScore({
      imageSim: match.image_sim,
      textSim: match.text_sim,
      distanceKm: match.distance_km,
      categoryMatch: !!match.category_match,
    });

    await prisma.postMatch.upsert({
      where: {
        postId_matchedPostId: {
          postId,
          matchedPostId: match.matchedPostId,
        },
      },
      update: {
        score,
        distanceKm: match.distance_km,
      },
      create: {
        postId,
        matchedPostId: match.matchedPostId,
        score,
        distanceKm: match.distance_km,
      },
    });

    await prisma.postMatch.upsert({
      where: {
        postId_matchedPostId: {
          postId: match.matchedPostId,
          matchedPostId: postId,
        },
      },
      update: {
        score,
        distanceKm: match.distance_km,
      },
      create: {
        postId: match.matchedPostId,
        matchedPostId: postId,
        score,
        distanceKm: match.distance_km,
      },
    });
  }
}
