import { Controller, Get } from '@nestjs/common';

import { Public } from '../common/decorators/public.decorator';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get()
  async getHealth() {
    return this.healthService.check();
  }

  /**
   * Para el despertador de Render (.github/workflows/keep-alive.yml): responde sin tocar la
   * base, así mantiene prendido el servidor sin mantener prendida a Neon (que cobra horas).
   */
  @Public()
  @Get('ping')
  ping() {
    return { ok: true };
  }

  @Public()
  @Get('db')
  async getDbRoundTrip() {
    return this.healthService.dbRoundTrip();
  }
}
