import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { PrismaClient } from '@prisma/client';
import { deriveClaimsPlan } from './claims-plan.mjs';

const PRODUCTION_FIREBASE_PROJECT_ID = 'studio-9112699346-ecb8d';
const BATCH_SIZE = 500;

function parseArguments(args) {
  const values = new Map();
  const flags = new Set();

  for (const argument of args) {
    const separator = argument.indexOf('=');
    if (separator === -1) {
      flags.add(argument);
    } else {
      values.set(argument.slice(0, separator), argument.slice(separator + 1));
    }
  }

  return {
    apply: flags.has('--apply'),
    reportPath: values.get('--report'),
    confirmProject: values.get('--confirm-project'),
    confirmDatabaseHost: values.get('--confirm-database-host'),
    help: flags.has('--help'),
  };
}

function loadServiceAccount(projectId) {
  const credentialsInput = process.env.FIREBASE_ADMIN_CREDENTIALS_PATH;
  if (!credentialsInput) {
    throw new Error('FIREBASE_ADMIN_CREDENTIALS_PATH is required; no default credentials are used.');
  }

  let serviceAccount;
  if (existsSync(credentialsInput)) {
    serviceAccount = JSON.parse(readFileSync(credentialsInput, 'utf8'));
  } else {
    serviceAccount = JSON.parse(credentialsInput);
  }

  if (serviceAccount.project_id !== projectId) {
    throw new Error('Service-account project_id does not match FIREBASE_PROJECT_ID.');
  }

  return serviceAccount;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

function chunk(items, size) {
  const batches = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

function printUsage() {
  console.log(`Usage:
  npm run claims:backfill -- [--report=PATH]
  npm run claims:backfill -- --apply --confirm-project=STAGING_PROJECT_ID --confirm-database-host=STAGING_DB_HOST [--report=PATH]

Without --apply the script only reads PostgreSQL and Firebase Auth and prints a per-user report.
Applying claims additionally requires APP_ENV=staging and an exact match for both target confirmations.`);
}

async function readClubMemberships(prisma, users) {
  const membershipRows = [];
  const userIds = users.map((user) => user.id);

  for (const batch of chunk(userIds, BATCH_SIZE)) {
    if (batch.length === 0) continue;
    const memberships = await prisma.clubMembership.findMany({
      where: { userId: { in: batch } },
      select: {
        userId: true,
        companyId: true,
        clubId: true,
        status: true,
        role: true,
        club: { select: { companyId: true } },
      },
    });
    membershipRows.push(...memberships.map((membership) => ({
      ...membership,
      clubCompanyId: membership.club.companyId,
    })));
  }

  const membershipsByUserId = new Map();
  for (const membership of membershipRows) {
    const rows = membershipsByUserId.get(membership.userId) ?? [];
    rows.push(membership);
    membershipsByUserId.set(membership.userId, rows);
  }

  return membershipsByUserId;
}

async function run() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const databaseUrl = process.env.DATABASE_URL;
  if (!projectId || !databaseUrl) {
    throw new Error('FIREBASE_PROJECT_ID and DATABASE_URL are required.');
  }

  const databaseHost = new URL(databaseUrl).host;
  if (options.apply) {
    if (process.env.APP_ENV !== 'staging') {
      throw new Error('Refusing --apply unless APP_ENV=staging.');
    }
    if (!process.env.STAGING_FIREBASE_PROJECT_ID || projectId !== process.env.STAGING_FIREBASE_PROJECT_ID) {
      throw new Error('FIREBASE_PROJECT_ID must match STAGING_FIREBASE_PROJECT_ID.');
    }
    if (!process.env.STAGING_DATABASE_HOST || databaseHost !== process.env.STAGING_DATABASE_HOST) {
      throw new Error('DATABASE_URL host must match STAGING_DATABASE_HOST.');
    }
    if (projectId === PRODUCTION_FIREBASE_PROJECT_ID) {
      throw new Error('Refusing to apply claims to the known production Firebase project.');
    }
    if (options.confirmProject !== projectId) {
      throw new Error('--confirm-project must exactly match FIREBASE_PROJECT_ID.');
    }
    if (options.confirmDatabaseHost !== databaseHost) {
      throw new Error('--confirm-database-host must exactly match the DATABASE_URL host.');
    }
  }

  const serviceAccount = loadServiceAccount(projectId);
  const app = initializeApp({
    credential: cert(serviceAccount),
    projectId,
  }, `claims-backfill-${Date.now()}`);
  const auth = getAuth(app);
  const prisma = new PrismaClient();
  const report = {
    generatedAt: new Date().toISOString(),
    mode: options.apply ? 'apply' : 'dry-run',
    firebaseProjectId: projectId,
    databaseHost,
    users: [],
  };

  try {
    await prisma.$connect();
    const users = await prisma.user.findMany({
      orderBy: { firebaseUid: 'asc' },
      select: { id: true, firebaseUid: true, email: true, name: true, role: true, companyId: true },
    });
    const membershipsByUserId = await readClubMemberships(prisma, users);

    for (const user of users) {
      const entry = {
        firebaseUid: user.firebaseUid,
        email: user.email,
        companyId: user.companyId,
        role: user.role,
        status: 'BLOCKED',
        reason: null,
        candidateClubIds: [],
        proposedClaims: null,
      };

      try {
        const firebaseUser = await auth.getUser(user.firebaseUid);
        if (firebaseUser.disabled) {
          report.users.push({ ...entry, reason: 'FIREBASE_USER_DISABLED' });
          continue;
        }

        const plan = deriveClaimsPlan({
          user,
          previousClaims: firebaseUser.customClaims ?? {},
          memberships: membershipsByUserId.get(user.id) ?? [],
        });
        entry.status = plan.status;
        entry.reason = plan.reason;
        entry.candidateClubIds = plan.candidateClubIds;
        entry.proposedClaims = plan.claims;

        if (plan.status === 'READY') {
          if (stableJson(firebaseUser.customClaims ?? {}) === stableJson(plan.claims)) {
            entry.status = 'UNCHANGED';
          } else if (options.apply) {
            await auth.setCustomUserClaims(user.firebaseUid, plan.claims);
            entry.status = 'APPLIED';
          } else {
            entry.status = 'WOULD_UPDATE';
          }
        }
      } catch (error) {
        entry.status = 'BLOCKED';
        entry.reason = error?.code === 'auth/user-not-found'
          ? 'FIREBASE_AUTH_USER_NOT_FOUND'
          : `FIREBASE_ADMIN_ERROR: ${error.message}`;
      }

      report.users.push(entry);
    }
  } finally {
    await prisma.$disconnect();
  }

  report.summary = report.users.reduce((counts, user) => {
    counts[user.status] = (counts[user.status] ?? 0) + 1;
    return counts;
  }, {});

  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (options.reportPath) {
    const reportPath = resolve(options.reportPath);
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, output, { encoding: 'utf8', flag: 'wx' });
    console.log(`Report written to ${reportPath}`);
  }
  console.log(output);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  run().catch((error) => {
    console.error(`Claims backfill stopped: ${error.message}`);
    process.exitCode = 1;
  });
}