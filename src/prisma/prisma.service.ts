import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { piiExtension } from './pii-extension';

/**
 * Cliente de base de datos. Devuelve el cliente extendido: los datos personales
 * de jugadores/socios se cifran al escribir y se descifran al leer
 * (ver pii-extension.ts), también dentro de `$transaction`.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super();
    const base = new PrismaClient();
    const extended = base.$extends(piiExtension) as unknown as PrismaService;
    // Nest llama a los hooks sobre el objeto que devuelve el constructor.
    extended.onModuleInit = async () => {
      await base.$connect();
    };
    extended.onModuleDestroy = async () => {
      await base.$disconnect();
    };
    return extended;
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
