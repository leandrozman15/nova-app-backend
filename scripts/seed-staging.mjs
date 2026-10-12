import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { PrismaClient } from '@prisma/client';

const PRODUCTION_PROJECT_ID = 'studio-9112699346-ecb8d';
const SEED_VERSION = 'v1';

function parseArguments(args) {
  return {
    apply: args.includes('--apply'),
    confirmProject: args.find((value) => value.startsWith('--confirm-project='))?.slice('--confirm-project='.length),
    confirmDatabaseHost: args.find((value) => value.startsWith('--confirm-database-host='))?.slice('--confirm-database-host='.length),
    confirmFirestoreDatabase: args.find((value) => value.startsWith('--confirm-firestore-database='))?.slice('--confirm-firestore-database='.length),
  };
}

function getTarget() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const firestoreDatabaseId = process.env.FIRESTORE_DATABASE_ID;
  const databaseUrl = process.env.DATABASE_URL;
  if (!projectId || !firestoreDatabaseId || !databaseUrl) {
    throw new Error('FIREBASE_PROJECT_ID, FIRESTORE_DATABASE_ID, and DATABASE_URL are required.');
  }
  return { projectId, firestoreDatabaseId, databaseHost: new URL(databaseUrl).host };
}

function assertStagingTarget(options, target) {
  if (process.env.APP_ENV !== 'staging') throw new Error('Refusing --apply unless APP_ENV=staging.');
  if (target.projectId === PRODUCTION_PROJECT_ID) throw new Error('Refusing to seed the known production Firebase project.');
  if (target.projectId !== process.env.STAGING_FIREBASE_PROJECT_ID) {
    throw new Error('FIREBASE_PROJECT_ID must match STAGING_FIREBASE_PROJECT_ID.');
  }
  if (target.databaseHost !== process.env.STAGING_DATABASE_HOST) {
    throw new Error('DATABASE_URL host must match STAGING_DATABASE_HOST.');
  }
  if (target.firestoreDatabaseId !== process.env.STAGING_FIRESTORE_DATABASE_ID) {
    throw new Error('FIRESTORE_DATABASE_ID must match STAGING_FIRESTORE_DATABASE_ID.');
  }
  if (options.confirmProject !== target.projectId ||
      options.confirmDatabaseHost !== target.databaseHost ||
      options.confirmFirestoreDatabase !== target.firestoreDatabaseId) {
    throw new Error('All three --confirm-* options must exactly match staging targets.');
  }
}

function requireServiceAccountProject(projectId) {
  const credential = process.env.FIREBASE_ADMIN_CREDENTIALS_PATH;
  if (!credential) throw new Error('FIREBASE_ADMIN_CREDENTIALS_PATH is required for --apply.');
  const content = existsSync(credential) ? readFileSync(credential, 'utf8') : credential;
  const serviceAccount = JSON.parse(content);
  if (serviceAccount.project_id !== projectId) {
    throw new Error('Service-account project_id does not match staging FIREBASE_PROJECT_ID.');
  }
  return serviceAccount;
}

async function run() {
  const options = parseArguments(process.argv.slice(2));
  const target = getTarget();
  const companyId = `synthetic-company-${SEED_VERSION}`;
  const clubId = `synthetic-club-${SEED_VERSION}`;
  const firebaseUid = `synthetic-member-${SEED_VERSION}`;
  const email = `synthetic-member-${SEED_VERSION}@example.test`;
  const ids = { companyId, clubId, firebaseUid, email };

  if (!options.apply) {
    console.log(JSON.stringify({ mode: 'dry-run', target, plannedSyntheticRecords: ids }, null, 2));
    return;
  }

  assertStagingTarget(options, target);
  const serviceAccount = requireServiceAccountProject(target.projectId);
  const firebaseApp = initializeApp({
    credential: cert(serviceAccount),
    projectId: target.projectId,
  }, `staging-seed-${Date.now()}`);
  const auth = getAuth(firebaseApp);
  const firestore = getFirestore(firebaseApp, target.firestoreDatabaseId);
  const prisma = new PrismaClient();

  try {
    await prisma.$connect();
    await prisma.company.upsert({
      where: { id: companyId },
      update: {},
      create: { id: companyId, name: 'Synthetic staging company' },
    });
    await prisma.club.upsert({
      where: { id: clubId },
      update: {},
      create: {
        id: clubId,
        companyId,
        name: 'Synthetic staging club',
        sport: 'synthetic',
        status: 'active',
      },
    });

    let authUser;
    try {
      authUser = await auth.getUser(firebaseUid);
      if (authUser.email !== email) throw new Error('Existing seed UID has unexpected email; refusing to modify it.');
    } catch (error) {
      if (error?.code !== 'auth/user-not-found') throw error;
      authUser = await auth.createUser({ uid: firebaseUid, email, disabled: true });
    }

    const user = await prisma.user.upsert({
      where: { firebaseUid },
      update: {},
      create: {
        firebaseUid,
        email,
        name: 'Synthetic staging member',
        role: 'member',
        companyId,
      },
    });
    await prisma.clubMembership.upsert({
      where: { userId_clubId: { userId: user.id, clubId } },
      update: { companyId, status: 'ACTIVA', role: 'member' },
      create: { userId: user.id, companyId, clubId, status: 'ACTIVA', role: 'member' },
    });
    await prisma.member.upsert({
      where: { authUid: firebaseUid },
      update: {},
      create: {
        authUid: firebaseUid,
        email,
        firstName: 'Synthetic',
        lastName: 'Member',
        isFan: true,
        companyId,
        clubId,
        status: 'active',
      },
    });
    await auth.setCustomUserClaims(firebaseUid, {
      companyId,
      clubId,
      role: 'member',
      roles: ['member'],
    });

    await firestore.doc(`clubs/${clubId}`).set({
      id: clubId,
      companyId,
      name: 'Synthetic staging club',
      sport: 'synthetic',
      status: 'active',
      synthetic: true,
    }, { merge: true });
    await firestore.doc(`users/${firebaseUid}`).set({
      uid: firebaseUid,
      companyId,
      clubId,
      role: 'member',
      name: 'Synthetic staging member',
      synthetic: true,
    }, { merge: true });
    await firestore.doc(`clubs/${clubId}/players/${firebaseUid}`).set({
      id: firebaseUid,
      uid: firebaseUid,
      authUid: firebaseUid,
      companyId,
      clubId,
      firstName: 'Synthetic',
      lastName: 'Member',
      role: 'member',
      isFan: true,
      synthetic: true,
    }, { merge: true });
    await firestore.doc(`all_players_index/${firebaseUid}`).set({
      id: firebaseUid,
      companyId,
      clubId,
      synthetic: true,
    }, { merge: true });
    await firestore.doc(`clubs/${clubId}/players/${firebaseUid}/payments/synthetic-payment`).set({
      companyId,
      clubId,
      amount: 0,
      status: 'paid',
      synthetic: true,
    }, { merge: true });

    console.log(JSON.stringify({ mode: 'apply', target, createdOrVerifiedSyntheticRecords: ids }, null, 2));
    console.log('Synthetic Firebase Auth user is disabled; it cannot sign in.');
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  run().catch((error) => {
    console.error(`Staging seed stopped: ${error.message}`);
    process.exitCode = 1;
  });
}