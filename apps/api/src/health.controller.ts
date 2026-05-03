import { Controller, Get } from '@nestjs/common';
import { prisma } from '@rally/db';

@Controller('health')
export class HealthController {
  @Get()
  async check() {
    let db: 'ok' | 'down' = 'down';
    try {
      await prisma.$queryRaw`SELECT 1`;
      db = 'ok';
    } catch {
      db = 'down';
    }

    return {
      status: db === 'ok' ? 'ok' : 'degraded',
      service: 'api',
      db,
      ts: new Date().toISOString(),
    };
  }
}
