import { Controller, Get, NotFoundException } from '@nestjs/common';
import { prisma } from '@rally/db';

@Controller('events')
export class EventsController {
  @Get()
  async list() {
    return prisma.event.findMany({
      orderBy: { startsAt: 'desc' },
      include: { stages: { orderBy: { order: 'asc' } } },
    });
  }

  @Get('active')
  async active() {
    const event = await prisma.event.findFirst({
      where: { active: true },
      include: { stages: { orderBy: { order: 'asc' } } },
    });
    if (!event) throw new NotFoundException('no active event');
    return event;
  }
}
