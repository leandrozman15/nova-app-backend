import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { PrismaClient } from '@prisma/client';

const PRODUCTION_PROJECT_ID = 'studio-9112699346-ecb8d';

function parseArguments(args) {
  const reportArgument = args.find((value) => value.startsWith('--report='));
  return {
    apply: args.includes('--apply'),
    confirmProject: args.find((value) => value.startsWith('--confirm-project='))?.slice('--confirm-project='.length),
    confirmDatabaseHost: args.find((value) => value.startsWith('--confirm-database-host='))?.slice('--confirm-database-host='.length),
    confirmFirestoreDatabase: args.find((value) => value.startsWith('--confirm-firestore-database='))?.slice('--confirm-firestore-database='.length),
    reportPath: reportArgument?.slice('--report='.length),
  };
}

function loadServiceAccount(projectId) {
  const credentialsInput = process.env.FIREBASE_ADMIN_CREDENTIALS_PATH;
  if (!credentialsInput) throw new Error('FIREBASE_ADMIN_CREDENTIALS_PATH is required.');
  const credentials = existsSync(credentialsInput)
    ? JSON.parse(readFileSync(credentialsInput, 'utf8'))
    : JSON.parse(credentialsInput);
  if (credentials.project_id !== projectId) {
    throw new Error('Service-account project_id does not match FIREBASE_PROJECT_ID.');
  }
  return credentials;
}

function assertStagingTarget(options, { projectId, firestoreDatabaseId, databaseHost }) {
  if (process.env.APP_ENV !== 'staging') throw new Error('Refusing --apply unless APP_ENV=staging.');
  if (projectId === PRODUCTION_PROJECT_ID) throw new Error('Refusing to write to the known production Firebase project.');
  if (!process.env.STAGING_FIREBASE_PROJECT_ID || projectId !== process.env.STAGING_FIREBASE_PROJECT_ID) {
    throw new Error('FIREBASE_PROJECT_ID must exactly match STAGING_FIREBASE_PROJECT_ID.');
  }
  if (!process.env.STAGING_DATABASE_HOST || databaseHost !== process.env.STAGING_DATABASE_HOST) {
    throw new Error('DATABASE_URL host must exactly match STAGING_DATABASE_HOST.');
  }
  if (!process.env.STAGING_FIRESTORE_DATABASE_ID || firestoreDatabaseId !== process.env.STAGING_FIRESTORE_DATABASE_ID) {
    throw new Error('FIRESTORE_DATABASE_ID must exactly match STAGING_FIRESTORE_DATABASE_ID.');
  }
  if (options.confirmProject !== projectId || options.confirmDatabaseHost !== databaseHost ||
      options.confirmFirestoreDatabase !== firestoreDatabaseId) {
    throw new Error('All three --confirm-* options must exactly match the staging targets.');
  }
}

async function run() {
  const options = parseArguments(process.argv.slice(2));
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const firestoreDatabaseId = process.env.FIRESTORE_DATABASE_ID;
  const databaseUrl = process.env.DATABASE_URL;
  if (!projectId || !firestoreDatabaseId || !databaseUrl) {
    throw new Error('FIREBASE_PROJECT_ID, FIRESTORE_DATABASE_ID, and DATABASE_URL are required.');
  }
  const databaseHost = new URL(databaseUrl).host;
  if (options.apply) {
    assertStagingTarget(options, { projectId, firestoreDatabaseId, databaseHost });
  }

  const app = initializeApp({
    credential: cert(loadServiceAccount(projectId)),
    projectId,
  }, `club-company-backfill-${Date.now()}`);
  const db = getFirestore(app, firestoreDatabaseId);
  const prisma = new PrismaClient();

  const report = {
    generatedAt: new Date().toISOString(),
    mode: options.apply ? 'apply' : 'dry-run',
    firebaseProjectId: projectId,
    firestoreDatabaseId,
    databaseHost,
    clubs: [],
  };

  try {
    await prisma.$connect();
    const firestoreClubs = await db.collection('clubs').get();
    const missingCompanyDocs = firestoreClubs.docs.filter((document) => {
      const companyId = document.get('companyId');
      return typeof companyId !== 'string' || companyId.trim().length === 0;
    });
    const postgresClubs = missingCompanyDocs.length === 0
      ? []
      : await prisma.club.findMany({
          where: { id: { in: missingCompanyDocs.map((document) => document.id) } },
          select: { id: true, companyId: true },
        });
    const companyByClubId = new Map(postgresClubs.map((club) => [club.id, club.companyId]));

    for (const document of missingCompanyDocs) {
      const companyId = companyByClubId.get(document.id);
      const entry = {
        clubId: document.id,
        status: companyId ? (options.apply ? 'WOULD_UPDATE' : 'WOULD_SET') : 'SKIPPED',
        source: companyId ? 'PostgreSQL Club.companyId' : null,
        companyId: companyId ?? null,
      };
      if (!companyId) {
        entry.reason = 'NO_POSTGRES_CLUB_MATCH';
      } else if (options.apply) {
        await document.ref.update({ companyId });
        entry.status = 'UPDATED';
      }
      report.clubs.push(entry);
    }
  } finally {
    await prisma.$disconnect();
  }

  report.summary = report.clubs.reduce((summary, club) => {
    summary[club.status] = (summary[club.status] ?? 0) + 1;
    return summary;
  }, { unchanged: (await db.collection('clubs').get()).size - report.clubs.length });

  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (options.reportPath) {
    const absolutePath = resolve(options.reportPath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, output, { encoding: 'utf8', flag: 'wx' });
    console.log(`Report written to ${absolutePath}`);
  }
  console.log(output);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  run().catch((error) => {
    console.error(`Legacy club company backfill stopped: ${error.message}`);
    process.exitCode = 1;
  });
}