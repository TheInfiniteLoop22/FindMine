import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { logger } from './logger';

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

// The dev-environment stub below only ever needs `.add()` called on it (the
// direct runner handles the actual work) - this interface is deliberately
// narrower than BullMQ's real `Queue`, just wide enough for every call site.
interface QueueLike {
  add: (name: string, data: unknown) => Promise<unknown>;
}

let connection: IORedis | undefined;
let embeddingQueue: Queue | QueueLike;

// A real BullMQ queue is only stood up when explicitly opted into via
// ENABLE_BULLMQ_WORKER=true. It used to be disabled whenever REDIS_URL contained
// "upstash.io", on the assumption that Upstash was incompatible with BullMQ's
// blocking Redis commands — that assumption was wrong: this project's REDIS_URL is
// already a standard `redis://` TCP endpoint (Upstash's Redis-protocol offering,
// not their separate REST API), which BullMQ/ioredis can use exactly like any
// other Redis. The real reason to keep this off by default is deployment
// maturity, not Upstash: there's no supervised, always-on process configured
// anywhere in this repo to run `scripts/run-worker.ts` continuously (no
// Dockerfile/Procfile/etc.), so a live queue would just accumulate unprocessed
// jobs with nothing consuming them. Flip ENABLE_BULLMQ_WORKER=true once a real
// worker process is actually deployed and supervised.
if (process.env.REDIS_URL && process.env.ENABLE_BULLMQ_WORKER === 'true') {
  try {
    connection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      connectTimeout: 2000,
      lazyConnect: true,
    });
    connection.on('error', (err: Error) => {
      logger.warn('Redis connection error', { error: err });
    });

    embeddingQueue = new Queue('generate-embeddings', {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    });
  } catch (e) {
    logger.warn('Redis: failed to initialize connection client', { error: e });
  }
} else {
  // Graceful stub for dev environment (direct runner takes care of background execution)
  embeddingQueue = {
    add: async () => {
      logger.info('Queue stub: direct bypass mode active');
      return null;
    }
  };
}

export { connection, embeddingQueue };
