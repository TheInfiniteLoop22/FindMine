import { Worker } from 'bullmq';
import { connection } from './queue';
import { runEmbeddingJob } from './directRunner';
import { logger } from './logger';

/**
 * BullMQ wrapper around the single canonical embedding-job implementation in
 * `directRunner.ts` — this file used to contain a full copy-pasted duplicate of
 * that logic (fake hash vectors and all), which risked drifting from the inline
 * path over time. Only started if `queue.ts` actually enables a real queue
 * connection (see `ENABLE_BULLMQ_WORKER`); not run by any `package.json` script
 * today — `scripts/run-worker.ts` is what would start this as a standalone process.
 */
export const embeddingWorker = new Worker(
  'generate-embeddings',
  async (job) => {
    const { postId } = job.data;
    logger.info('Worker: processing job', { jobId: job.id, postId });
    await runEmbeddingJob(postId);
  },
  {
    // Non-null: this file is only ever started (via scripts/run-worker.ts,
    // itself only run manually - see the module comment above) once
    // ENABLE_BULLMQ_WORKER=true, the one condition under which queue.ts
    // actually constructs a real connection instead of leaving it undefined.
    connection: connection!,
    concurrency: 2,
  }
);

embeddingWorker.on('completed', (job) => {
  logger.info('Worker: job completed', { jobId: job.id });
});

embeddingWorker.on('failed', (job, err) => {
  logger.error('Worker: job failed', { jobId: job?.id, error: err });
});
