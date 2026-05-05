import { Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { stat } from 'fs/promises';
import { join } from 'path';
import {
  prisma,
  AssetRole,
  SubmissionStatus,
  SubmissionType,
} from '@rally/db';
import { MEDIA_ROOT, WORKER_CONCURRENCY } from './config';
import {
  photoThumbnail,
  transcodePhoto,
  transcodeVideo,
  videoThumbnail,
} from './transcode';

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

type TranscodeJob = { submissionId: string };

function baseFromKey(storageKey: string): string {
  const file = storageKey.split('/').pop() ?? storageKey;
  return file.replace(/\.[^.]+$/, '');
}

async function processJob(job: Job<TranscodeJob>) {
  const { submissionId } = job.data;
  const sub = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: { assets: true },
  });
  if (!sub) {
    console.warn(`[worker] submission ${submissionId} not found, skipping`);
    return;
  }

  const raw = sub.assets.find((a) => a.role === AssetRole.raw);
  if (!raw) {
    console.warn(`[worker] submission ${submissionId} has no raw asset`);
    return;
  }

  const rawPath = join(MEDIA_ROOT, raw.storageKey);
  const base = baseFromKey(raw.storageKey);
  const thumbKey = `thumb/${base}.jpg`;
  const thumbPath = join(MEDIA_ROOT, thumbKey);

  let processedKey: string;
  let processedMime: string;

  try {
    if (sub.type === SubmissionType.video) {
      processedKey = `processed/${base}.mp4`;
      processedMime = 'video/mp4';
      await transcodeVideo(rawPath, join(MEDIA_ROOT, processedKey));
      await videoThumbnail(rawPath, thumbPath);
    } else {
      processedKey = `processed/${base}.jpg`;
      processedMime = 'image/jpeg';
      await transcodePhoto(rawPath, join(MEDIA_ROOT, processedKey));
      await photoThumbnail(rawPath, thumbPath);
    }

    const [pStat, tStat] = await Promise.all([
      stat(join(MEDIA_ROOT, processedKey)),
      stat(thumbPath),
    ]);

    await prisma.$transaction([
      prisma.mediaAsset.create({
        data: {
          submissionId: sub.id,
          role: AssetRole.processed,
          storageKey: processedKey,
          mime: processedMime,
          bytes: BigInt(pStat.size),
        },
      }),
      prisma.mediaAsset.create({
        data: {
          submissionId: sub.id,
          role: AssetRole.thumb,
          storageKey: thumbKey,
          mime: 'image/jpeg',
          bytes: BigInt(tStat.size),
        },
      }),
      prisma.submission.update({
        where: { id: sub.id },
        data: { status: SubmissionStatus.pending },
      }),
    ]);

    console.log(`[worker] ✓ ${submissionId} processed (${sub.type})`);
  } catch (err) {
    // graceful degradation: mark as pending with raw only so the operator
    // can still moderate; log the failure for inspection
    console.error(`[worker] ✗ ${submissionId} transcode failed:`, err);
    await prisma.submission.update({
      where: { id: sub.id },
      data: { status: SubmissionStatus.pending },
    });
    throw err; // BullMQ will retry per the queue's attempts setting
  }
}

const worker = new Worker<TranscodeJob>('transcode', processJob, {
  connection,
  concurrency: WORKER_CONCURRENCY,
});

worker.on('ready', () =>
  console.log(
    `[worker] ready, listening on queue "transcode" (concurrency=${WORKER_CONCURRENCY})`,
  ),
);
worker.on('failed', (job, err) =>
  console.error(`[worker] job ${job?.id} failed: ${err.message}`),
);

const shutdown = async (signal: string) => {
  console.log(`[worker] received ${signal}, closing...`);
  await worker.close();
  await connection.quit();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
