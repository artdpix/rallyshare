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
} from '@rally/db';
import type { Response } from 'express';
import { existsSync } from 'fs';
import { unlink } from 'fs/promises';
import { join, normalize, resolve } from 'path';
import { URL } from 'url';
import { AdminGuard } from './admin.guard';
import { MEDIA_ROOT } from './config';

const ALLOWED_ROLES = new Set(['raw', 'processed', 'thumb']);
const VALID_LIST_STATUSES = new Set<string>([
  'pending',
  'approved',
  'rejected',
  'aired',
]);

function parseRallyId(input: string): string | null {
  const trimmed = (input ?? '').trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    const id =
      url.searchParams.get('rallyId') ?? url.searchParams.get('rally') ?? '';
    return /^\d+$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

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

  @Get('admin/events')
  async listEvents() {
    const events = await prisma.event.findMany({
      orderBy: { startsAt: 'desc' },
      include: {
        _count: { select: { submissions: true, stages: true } },
      },
    });
    return events.map((e: (typeof events)[number]) => ({
      id: e.id,
      slug: e.slug,
      name: e.name,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      active: e.active,
      stagesCount: e._count.stages,
      submissionsCount: e._count.submissions,
    }));
  }

  @Post('admin/events/import')
  async importEvent(@Body() body: { rallyId?: string; activate?: boolean }) {
    const id = parseRallyId(body?.rallyId ?? '');
    if (!id) throw new BadRequestException('rallyId inválido (número ou URL com ?rallyId=...)');

    const url = `https://api.azlourenco.work/api/info/${id}.json`;
    let json: any;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (res.status === 404) throw new BadRequestException(`Rally ${id} não existe na API anube`);
      if (!res.ok) throw new BadRequestException(`API anube devolveu ${res.status}`);
      json = await res.json();
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException(`Erro a contactar API anube: ${(err as Error).message}`);
    }

    const data = json?.event?.data;
    if (!data?.name) throw new BadRequestException('Resposta da API anube sem dados');

    const slug = `anube-${id}`;
    const startsAt = new Date(Number(data.ut_ini) * 1000);
    const endsAt = new Date(Number(data.ut_fin) * 1000);

    const allSpecials: any[] = [];
    for (const itin of (data.itineraries ?? []) as any[]) {
      for (const s of (itin.specials ?? []) as any[]) {
        if (s?.compute === 1) allSpecials.push(s);
      }
    }
    allSpecials.sort((a: any, b: any) => (a.ut_ini ?? 0) - (b.ut_ini ?? 0));

    const event = await prisma.event.upsert({
      where: { slug },
      update: { name: data.name, startsAt, endsAt },
      create: { slug, name: data.name, startsAt, endsAt, active: false },
    });

    let order = 1;
    for (const s of allSpecials) {
      const stageSlug = String(s.special_name ?? `s-${s.id}`).toLowerCase();
      const stageName = s.name_extra
        ? `${s.special_name} — ${s.name_extra}`
        : String(s.special_name ?? `Stage ${order}`);
      const scheduledAt = s.ut_ini ? new Date(Number(s.ut_ini) * 1000) : null;
      await prisma.stage.upsert({
        where: { eventId_slug: { eventId: event.id, slug: stageSlug } },
        update: { name: stageName, order, scheduledAt },
        create: { eventId: event.id, slug: stageSlug, name: stageName, order, scheduledAt },
      });
      order++;
    }

    if (body?.activate) {
      await prisma.$transaction([
        prisma.event.updateMany({ where: { active: true }, data: { active: false } }),
        prisma.event.update({ where: { id: event.id }, data: { active: true } }),
      ]);
    }

    return {
      id: event.id,
      slug,
      name: event.name,
      stagesCount: allSpecials.length,
      activated: body?.activate === true,
    };
  }

  @Post('admin/events/:id/active')
  async setActive(@Param('id') id: string) {
    const ev = await prisma.event.findUnique({ where: { id } });
    if (!ev) throw new NotFoundException('event not found');
    await prisma.$transaction([
      prisma.event.updateMany({ where: { active: true }, data: { active: false } }),
      prisma.event.update({ where: { id }, data: { active: true } }),
    ]);
    return { id, active: true };
  }

  @Post('admin/events/:id/deactivate')
  async deactivate(@Param('id') id: string) {
    const ev = await prisma.event.findUnique({ where: { id } });
    if (!ev) throw new NotFoundException('event not found');
    await prisma.event.update({ where: { id }, data: { active: false } });
    return { id, active: false };
  }

  @Post('admin/events/deactivate-all')
  async deactivateAll() {
    const r = await prisma.event.updateMany({
      where: { active: true },
      data: { active: false },
    });
    return { deactivated: r.count };
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
