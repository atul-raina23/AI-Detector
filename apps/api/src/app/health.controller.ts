import { Controller, Get } from '@nestjs/common';

/** Liveness probe for the Docker HEALTHCHECK (docs/deployment/01). No auth — must stay cheap and public. */
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok' };
  }
}
