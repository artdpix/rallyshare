import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { prisma, SubmissionStatus, SubmissionType, AssetRole } from '@rally/db';
import { SubmissionInputSchema } from '@rally/shared';
import { createHmac, randomUUID } from 'crypto';
import { Request } from 'express';
import { mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { IP_HASH_SALT, MAX_UPLOAD_BYTES, MEDIA_ROOT } from './config';
import { transcodeQueue } from './queue';

const RAW_DIR = join(MEDIA_ROOT, 'raw');
mkdirSync(RAW_DIR, { recursive: true });

const PHOTO_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);
const VIDEO_MIMES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-matroska',
]);

function detectType(mime: string): SubmissionType | null {
  if (PHOTO_MIMES.has(mime)) return SubmissionType.photo;
  if (VIDEO_MIMES.has(mime)) return SubmissionType.video;
  return null;
}

function hashIp(ip: string): string {
  return createHmac('sha256', IP_HASH_SALT).update(ip).digest('hex').slice(0, 32);
}

function clientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim();
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

@Controller('submissions')
export class SubmissionsController {
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: RAW_DIR,
        filename: (_req, file, cb) => {
          const ext = (extname(file.originalname) || '.bin').toLowerCase().slice(0, 8);
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: MAX_UPLOAD_BYTES },
      fileFilter: (_req, file, cb) => {
        if (detectType(file.mimetype)) cb(null, true);
        else cb(new BadRequestException(`unsupported mime: ${file.mimetype}`), false);
      },
    }),
  )
  async create(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: Record<string, string>,
    @Req() req: Request,
  ) {
    if (!file) throw new BadRequestException('file is required');

    const parsed = SubmissionInputSchema.safeParse({
      ...body,
      type: detectType(file.mimetype),
    });
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const input = parsed.data;

    const event = await prisma.event.findUnique({ where: { id: input.eventId } });
    if (!event || !event.active) {
      throw new BadRequestException('event not found or not active');
    }

    if (input.stageId) {
      const stage = await prisma.stage.findUnique({ where: { id: input.stageId } });
      if (!stage || stage.eventId !== event.id) {
        throw new BadRequestException('invalid stage for this event');
      }
    }

    const submission = await prisma.submission.create({
      data: {
        eventId: event.id,
        stageId: input.stageId ?? null,
        type: input.type,
        contributorName: input.anonymous ? null : input.contributorName ?? null,
        contributorEmail: input.anonymous ? null : input.contributorEmail ?? null,
        anonymous: input.anonymous,
        consentAt: new Date(),
        ipHash: hashIp(clientIp(req)),
        status: SubmissionStatus.processing,
        assets: {
          create: {
            role: AssetRole.raw,
            storageKey: `raw/${file.filename}`,
            mime: file.mimetype,
            bytes: BigInt(file.size),
          },
        },
      },
    });

    await transcodeQueue.add('transcode', { submissionId: submission.id });

    return {
      id: submission.id,
      status: submission.status,
      receiptCode: submission.id,
    };
  }
}
