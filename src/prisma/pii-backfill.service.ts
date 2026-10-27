import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';

import { EXTRA_PLAIN_KEYS, isEncrypted } from '../common/pii-crypto';
import { PrismaService } from './prisma.service';

type Raw = Record<string, any>;
const TEXT = ['dni', 'phone', 'address', 'locality', 'notes'] as const;
const PAGE = 200;

const plainText = (value: unknown) =>
  typeof value === 'string' && value !== '' && !isEncrypted(value);

const plainExtra = (extra: unknown) =>
  !!extra &&
  typeof extra === 'object' &&
  !Array.isArray(extra) &&
  Object.entries(extra as Raw).some(
    ([key, value]) =>
      !EXTRA_PLAIN_KEYS.has(key) &&
      value !== null &&
      value !== undefined &&
      !isEncrypted(value),
  );

const plainJson = (value: unknown) =>
  value !== null &&
  value !== undefined &&
  !(typeof value === 'object' && '__enc' in (value as Raw));

/** Campos de una fila que siguen en claro (o null si ya está todo cifrado). */
export function pendingFields(row: Raw, hasExtra: boolean): Raw | null {
  const data: Raw = {};
  for (const field of TEXT) if (plainText(row[field])) data[field] = row[field];
  if (typeof row.dni === 'string' && row.dni && !row.dniHash)
    data.dni = row.dni;
  if (row.birthDate) data.birthDate = row.birthDate;
  if (plainJson(row.familyMembers) && row.familyMembers !== null)
    data.familyMembers = row.familyMembers;
  if (hasExtra && plainExtra(row.extra)) data.extra = row.extra;
  return Object.keys(data).length ? data : null;
}

/**
 * Cifra lo que ya estaba guardado en claro. Es idempotente: si no queda nada
 * por cifrar, no escribe. Se ejecuta al arrancar (en segundo plano).
 */
@Injectable()
export class PiiBackfillService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PiiBackfillService.name);

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap(): void {
    if (!process.env.PII_ENCRYPTION_KEY) {
      this.logger.error(
        'PII_ENCRYPTION_KEY no está configurada: los datos personales NO se están cifrando y no se pueden guardar fichas nuevas.',
      );
      return;
    }
    if (process.env.PII_BACKFILL === 'off') return;
    void this.run().catch((error) =>
      this.logger.error(`Cifrado de datos existentes falló: ${String(error)}`),
    );
  }

  async run() {
    const db = this.prisma as any;
    const report = { player: 0, member: 0, injuryReport: 0 };
    for (const [model, table, hasExtra] of [
      ['player', 'Player', true],
      ['member', 'Member', false],
    ] as const) {
      let cursor = '';
      for (;;) {
        const rows: Raw[] = await db.$queryRawUnsafe(
          `SELECT * FROM "${table}" WHERE id > $1 ORDER BY id LIMIT ${PAGE}`,
          cursor,
        );
        if (rows.length === 0) break;
        for (const row of rows) {
          const data = pendingFields(row, hasExtra);
          if (!data) continue;
          try {
            await db[model].update({
              where: { id: row.id },
              data: { ...data, updatedAt: row.updatedAt },
            });
            report[model] += 1;
          } catch (error) {
            this.logger.warn(`No se pudo cifrar ${table} ${row.id}: ${String(error)}`);
          }
        }
        cursor = rows[rows.length - 1].id;
      }
    }
    let cursor = '';
    for (;;) {
      const rows: Raw[] = await db.$queryRawUnsafe(
        `SELECT id, description, "updatedAt" FROM "InjuryReport" WHERE id > $1 ORDER BY id LIMIT ${PAGE}`,
        cursor,
      );
      if (rows.length === 0) break;
      for (const row of rows) {
        if (!plainText(row.description)) continue;
        await db.injuryReport.update({
          where: { id: row.id },
          data: { description: row.description, updatedAt: row.updatedAt },
        });
        report.injuryReport += 1;
      }
      cursor = rows[rows.length - 1].id;
    }
    const total = report.player + report.member + report.injuryReport;
    if (total > 0)
      this.logger.log(
        `Datos personales cifrados: ${report.player} jugadores, ${report.member} socios, ${report.injuryReport} lesiones.`,
      );
    return report;
  }
}
