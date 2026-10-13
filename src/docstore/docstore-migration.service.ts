import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { DocumentReference } from 'firebase-admin/firestore';

import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { FirestoreMigrationService } from '../roster/firestore-migration.service';
import { plain } from '../roster/roster.mapper';
import { CLUB_TOP_LEVEL } from './docstore.rules';

export type Stage2Report = {
  clubId: string;
  clubName: string;
  documents: number;
  collections: Record<string, number>;
  errors: string[];
};

/** Colecciones de primer nivel sin club (se copian una vez, para toda la plataforma). */
const GLOBAL_COLLECTIONS = [
  'leagues',
  'municipality_infra',
  'municipalities',
  'teams',
];
const MAX_ERRORS = 20;

/**
 * Etapa 2 de la salida de Firestore: todo lo que cuelga de cada club (planteles,
 * eventos, asistencias, tablas, rivales, torneos, novedades…), la ficha del club
 * y el staff (users) pasan al almacén de Postgres con la misma ruta.
 * Se puede repetir (pisa con lo de Firestore) y nunca borra nada en Firestore.
 */
@Injectable()
export class DocStoreMigrationService {
  private readonly logger = new Logger(DocStoreMigrationService.name);
  private readonly running = new Map<string, Promise<Stage2Report>>();
  private readonly checked = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly firebase: FirebaseAdminService,
    private readonly stage1: FirestoreMigrationService,
  ) {}

  async ensureStage2(clubId: string) {
    if (this.checked.has(clubId)) return;
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: { firestoreMigration: true },
    });
    if (!club) return;
    const done = (club.firestoreMigration as Record<string, unknown> | null)
      ?.stage2;
    if (!done) {
      await this.stage2(clubId).catch((error) =>
        this.logger.error(`Etapa 2 del club ${clubId} falló: ${String(error)}`),
      );
    }
    this.checked.add(clubId);
  }

  async stage2All(options: { clubId?: string; force?: boolean } = {}) {
    if (!options.clubId) await this.copyGlobal();
    const clubs = await this.prisma.club.findMany({
      where: options.clubId ? { id: options.clubId } : {},
      select: { id: true, firestoreMigration: true },
      orderBy: { name: 'asc' },
    });
    const reports: Stage2Report[] = [];
    for (const club of clubs) {
      const done = (club.firestoreMigration as Record<string, unknown> | null)
        ?.stage2;
      if (done && !options.force) continue;
      reports.push(await this.stage2(club.id));
    }
    return reports;
  }

  stage2(clubId: string) {
    const current = this.running.get(clubId);
    if (current) return current;
    const job = this.copyClub(clubId).finally(() =>
      this.running.delete(clubId),
    );
    this.running.set(clubId, job);
    return job;
  }

  private async copyClub(clubId: string): Promise<Stage2Report> {
    // Primero el padrón (las rutas de planteles cuelgan de las ramas).
    await this.stage1.ensureStage1(clubId);
    const club = await this.prisma.club.findUniqueOrThrow({
      where: { id: clubId },
      select: {
        id: true,
        name: true,
        companyId: true,
        firestoreMigration: true,
      },
    });
    const report: Stage2Report = {
      clubId,
      clubName: club.name,
      documents: 0,
      collections: {},
      errors: [],
    };
    const fs = this.firebase.firestore;
    const ref = fs.collection('clubs').doc(clubId);

    // La ficha del club.
    const clubDoc = await ref.get();
    if (clubDoc.exists)
      await this.write(report, club, `clubs/${clubId}`, clubDoc.data() ?? {});

    // Todo lo que cuelga del club, salvo el padrón ya copiado en la etapa 1.
    for (const collection of await ref.listCollections()) {
      const snap = await collection.get();
      for (const doc of snap.docs) {
        const skipDoc = [
          'players',
          'available_disciplines',
          'divisions',
        ].includes(collection.id);
        if (!skipDoc) await this.write(report, club, doc.ref.path, doc.data());
        await this.copySubtree(report, club, doc.ref);
      }
    }

    // Colecciones de primer nivel que se atan al club por su campo clubId.
    for (const name of CLUB_TOP_LEVEL) {
      const snap = await fs
        .collection(name)
        .where('clubId', '==', clubId)
        .get();
      for (const doc of snap.docs) {
        await this.write(report, club, doc.ref.path, doc.data());
        await this.copySubtree(report, club, doc.ref);
      }
    }

    await this.prisma.club.update({
      where: { id: clubId },
      data: {
        firestoreMigration: {
          ...((club.firestoreMigration as Record<string, unknown> | null) ??
            {}),
          stage2: new Date().toISOString(),
        },
      },
    });
    this.logger.log(`Etapa 2 ${club.name}: ${report.documents} documentos`);
    return report;
  }

  private async copySubtree(
    report: Stage2Report,
    club: { id: string; companyId: string },
    ref: DocumentReference,
  ) {
    for (const collection of await ref.listCollections()) {
      const snap = await collection.get();
      for (const doc of snap.docs) {
        await this.write(report, club, doc.ref.path, doc.data());
        await this.copySubtree(report, club, doc.ref);
      }
    }
  }

  private async write(
    report: Stage2Report,
    club: { id: string; companyId: string },
    path: string,
    raw: Record<string, unknown>,
  ) {
    const segments = path.split('/');
    const data = plain(raw) as Prisma.InputJsonValue;
    const fields = {
      parentPath: segments.slice(0, -1).join('/'),
      collection: segments.at(-2)!,
      docId: segments.at(-1)!,
      clubId: club.id,
      companyId: club.companyId,
      data,
    };
    try {
      await this.prisma.storeDocument.upsert({
        where: { path },
        create: { path, ...fields },
        update: fields,
      });
      report.documents += 1;
      report.collections[fields.collection] =
        (report.collections[fields.collection] ?? 0) + 1;
    } catch (error) {
      if (report.errors.length < MAX_ERRORS)
        report.errors.push(`${path}: ${String(error)}`);
    }
  }

  /** Ligas, infraestructura municipal y equipos sueltos: una sola vez para toda la plataforma. */
  private async copyGlobal() {
    for (const name of GLOBAL_COLLECTIONS) {
      try {
        const snap = await this.firebase.firestore.collection(name).get();
        for (const doc of snap.docs) {
          const raw = doc.data();
          const segments = doc.ref.path.split('/');
          const fields = {
            parentPath: segments.slice(0, -1).join('/'),
            collection: name,
            docId: doc.id,
            clubId: typeof raw.clubId === 'string' ? raw.clubId : null,
            companyId: typeof raw.companyId === 'string' ? raw.companyId : null,
            data: plain(raw) as Prisma.InputJsonValue,
          };
          await this.prisma.storeDocument.upsert({
            where: { path: doc.ref.path },
            create: { path: doc.ref.path, ...fields },
            update: fields,
          });
        }
      } catch (error) {
        this.logger.warn(`No se copió ${name}: ${String(error)}`);
      }
    }
  }
}
