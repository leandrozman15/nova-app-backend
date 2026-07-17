import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check() {
    await this.prisma.$queryRawUnsafe('SELECT 1');

    return {
      ok: true,
      service: 'nova-app-backend',
      db: 'connected',
      timestamp: new Date().toISOString(),
    };
  }
}
