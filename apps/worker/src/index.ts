import { Queue, Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

export const transcodeQueue = new Queue('transcode', { connection });

type TranscodeJob = {
  submissionId: string;
  rawKey: string;
};

const worker = new Worker<TranscodeJob>(
  'transcode',
  async (job: Job<TranscodeJob>) => {
    console.log(`[worker] processing transcode for submission ${job.data.submissionId}`);
    // TODO: ffmpeg pipeline (raw → processed/thumb), pHash, NSFW flag
    return { ok: true };
  },
  {
    connection,
    concurrency: Number(process.env.WORKER_CONCURRENCY ?? 4),
  },
);

worker.on('ready', () => console.log('[worker] ready, listening on queue "transcode"'));
worker.on('failed', (job, err) =>
  console.error(`[worker] job ${job?.id} failed:`, err.message),
);

const shutdown = async (signal: string) => {
  console.log(`[worker] received ${signal}, closing...`);
  await worker.close();
  await connection.quit();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
