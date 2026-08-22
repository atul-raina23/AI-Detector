import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { AuthPrincipal } from '@eos/shared-types';
import type { JwtPayload } from './jwt-payload.type.js';

/**
 * Requires a valid access token. Verifies it directly via `JwtService`
 * rather than going through passport-jwt's Strategy mixin — that mixin
 * pattern (`class X extends PassportStrategy(Strategy)`) does not survive
 * bundling reliably (extends a genuine ES6 class returned at runtime), and
 * a manual guard is simpler besides (docs/05 §3, docs/08).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      (request as Request & { user: AuthPrincipal }).user = {
        userId: payload.sub,
        organizationId: payload.org,
        email: payload.email,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }
}

function extractBearerToken(request: Request): string | null {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return null;
  }
  return header.slice('Bearer '.length);
}
