import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  prisma,
  SubmissionStatus,
  ModerationAction,
  AssetRole,
} from '@rally/db';
import type { Response } from 'express';
import { existsSync } from 'fs';
import { unlink } from 'fs/promises';
import { join, normalize, resolve } from 'path';
import { AdminGuard } from './admin.guard';
import { MEDIA_ROOT } from './config';

const ALLOWED_ROLES = new Set(['raw', 'processed', 'thumb']);
const VALID_LIST_STATUSES = new Set<string>([
  'pending',
  'approved',
  'rejected',
  'aired',
]);

// TODO: replace with Cloudflare Access JWT email when added in Sprint 2
const OPERATOR_EMAIL_PLACEHOLDER = 'operator@local';

@Controller()
@UseGuards(AdminGuard)
export class AdminController {
  @Get('admin/submissions')
  async list(@Query('status') status: string | undefined) {
    const where: { status?: SubmissionStatus } = {};
    if (status) {
      if (!VALID_LIST_STATUSES.has(status)) {
        throw new BadRequestException(`invalid status: ${status}`);
      }
      where.status = status as SubmissionStatus;
    } else {
      where.status = SubmissionStatus.pending;
    }

    const items = await prisma.submission.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: {
        stage: { select: { id: true, name: true, order: true } },
        assets: {
          select: { role: true, storageKey: true, mime: true, bytes: true },
        },
      },
      take: 100,
    });

    return items.map((s) => {
      const assets: Record<string, { storageKey: string; mime: string; bytes: number }> = {};
      for (const a of s.assets) {
        assets[a.role] = {
          storageKey: a.storageKey,
          mime: a.mime,
          bytes: Number(a.bytes),
        };
      }
      return {
        id: s.id,
        type: s.type,
        status: s.status,
        stage: s.stage,
        contributorName: s.contributorName,
        contributorEmail: s.contributorEmail,
        anonymous: s.anonymous,
        nsfwFlag: s.nsfwFlag,
        createdAt: s.createdAt,
        assets,
      };
    });
  }

  @Post('admin/submissions/:id/moderate')
  async moderate(
    @Param('id') id: string,
    @Body() body: { action: 'approve' | 'reject'; reason?: string },
  ) {
    if (body.action !== 'approve' && body.action !== 'reject') {
      throw new BadRequestException('action must be approve or reject');
    }

    const submission = await prisma.submission.findUnique({ where: { id } });
    if (!submission) throw new NotFoundException('submission not found');

    const newStatus =
      body.action === 'approve' ? SubmissionStatus.approved : SubmissionStatus.rejected;

    const [updated] = await prisma.$transaction([
      prisma.submission.update({
        where: { id },
        data: { status: newStatus },
      }),
      prisma.moderationLog.create({
        data: {
          submissionId: id,
          operatorEmail: OPERATOR_EMAIL_PLACEHOLDER,
          action:
            body.action === 'approve'
              ? ModerationAction.approve
              : ModerationAction.reject,
          reason: body.reason ?? null,
        },
      }),
    ]);

    // TODO: on approve, enqueue copy-to-sync-folder job + vMix dispatch (next iteration)

    return { id: updated.id, status: updated.status };
  }

  @Delete('admin/submissions/:id')
  async remove(@Param('id') id: string) {
    const sub = await prisma.submission.findUnique({
      where: { id },
      include: { assets: true },
    });
    if (!sub) throw new NotFoundException('submission not found');

    for (const asset of sub.assets) {
      const safe = normalize(asset.storageKey);
      const fullPath = resolve(join(MEDIA_ROOT, safe));
      if (!fullPath.startsWith(resolve(MEDIA_ROOT))) continue;
      try {
        await unlink(fullPath);
      } catch (err) {
        console.warn(`[admin] could not delete ${fullPath}:`, (err as Error).message);
      }
    }

    // cascades delete assets, moderationLog, vmixDispatches via Prisma onDelete
    await prisma.submission.delete({ where: { id } });

    return { id, deleted: true };
  }

  @Get('media/:role/:filename')
  serveMedia(
    @Param('role') role: string,
    @Param('filename') filename: string,
    @Query('download') download: string | undefined,
    @Res() res: Response,
  ) {
    if (!ALLOWED_ROLES.has(role)) throw new NotFoundException();
    const safe = normalize(filename);
    if (safe.includes('..') || safe.includes('/') || safe.includes('\\')) {
      throw new NotFoundException();
    }
    const fullPath = resolve(join(MEDIA_ROOT, role, safe));
    if (!fullPath.startsWith(resolve(MEDIA_ROOT))) throw new NotFoundException();
    if (!existsSync(fullPath)) throw new NotFoundException();

    if (download) {
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${safe}"`,
      );
    }
    res.sendFile(fullPath);
  }
}
