import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { ADMIN_TOKEN } from './config';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    if (!ADMIN_TOKEN) {
      throw new UnauthorizedException('ADMIN_TOKEN not configured on server');
    }

    const req = ctx.switchToHttp().getRequest<Request>();

    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
      const token = auth.slice(7).trim();
      if (token === ADMIN_TOKEN) return true;
    }

    const t = req.query?.t;
    if (typeof t === 'string' && t === ADMIN_TOKEN) return true;

    // TODO: in Sprint 2, also accept Cloudflare Access JWT (Cf-Access-Jwt-Assertion)
    throw new UnauthorizedException();
  }
}
