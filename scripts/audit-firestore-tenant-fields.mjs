import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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

function hasField(data, field) {
  return typeof data?.[field] === 'string' && data[field].trim().length > 0;
}

function countMissing(snapshot) {
  let missingCompanyId = 0;
  let missingClubId = 0;
  for (const document of snapshot.docs) {
    const data = document.data();
    if (!hasField(data, 'companyId')) missingCompanyId += 1;
    if (!hasField(data, 'clubId')) missingClubId += 1;
  }
  return {
    documents: snapshot.size,
    missingCompanyId,
    missingClubId,
  };
}

function parseReportPath(args) {
  const argument = args.find((value) => value.startsWith('--report='));
  return argument ? argument.slice('--report='.length) : undefined;
}

async function run() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const databaseId = process.env.FIRESTORE_DATABASE_ID;
  if (!projectId || !databaseId) {
    throw new Error('FIREBASE_PROJECT_ID and FIRESTORE_DATABASE_ID are required.');
  }

  const app = initializeApp({
    credential: cert(loadServiceAccount(projectId)),
    projectId,
  }, `tenant-audit-${Date.now()}`);
  const db = getFirestore(app, databaseId);

  const [users, clubs, allPlayersIndex, clubPlayers] = await Promise.all([
    db.collection('users').get(),
    db.collection('clubs').get(),
    db.collection('all_players_index').get(),
    db.collectionGroup('players').get(),
  ]);

  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'read-only',
    firebaseProjectId: projectId,
    firestoreDatabaseId: databaseId,
    collections: {
      users: countMissing(users),
      clubs: {
        documents: clubs.size,
        missingCompanyId: clubs.docs.filter((document) => !hasField(document.data(), 'companyId')).length,
        clubIdSource: 'document id; no field required',
      },
      clubPlayerLegajos: countMissing(clubPlayers),
      allPlayersIndex: countMissing(allPlayersIndex),
    },
  };

  const output = `${JSON.stringify(report, null, 2)}\n`;
  const reportPath = parseReportPath(process.argv.slice(2));
  if (reportPath) {
    const absolutePath = resolve(reportPath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, output, { encoding: 'utf8', flag: 'wx' });
    console.log(`Report written to ${absolutePath}`);
  }
  console.log(output);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  run().catch((error) => {
    console.error(`Firestore tenant audit stopped: ${error.message}`);
    process.exitCode = 1;
  });
}