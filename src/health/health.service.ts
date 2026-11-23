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

  /**
   * Cuánto tarda un viaje servidor ↔ base de datos (tres SELECT 1 seguidos). Si da más de
   * ~10 ms, el servidor y la base están en regiones distintas y cada consulta paga esa demora.
   */
  async dbRoundTrip() {
    const samples: number[] = [];
    for (let i = 0; i < 3; i++) {
      const start = process.hrtime.bigint();
      await this.prisma.$queryRawUnsafe('SELECT 1');
      samples.push(Math.round(Number(process.hrtime.bigint() - start) / 1e5) / 10);
    }
    return { samplesMs: samples, minMs: Math.min(...samples) };
  }
}
