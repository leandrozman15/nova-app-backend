import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, readFileSync } from 'node:fs';
import { initializeApp, cert, getApp, getApps } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

/** Base de Firestore que usa la app web (no es la "(default)"). */
const DEFAULT_FIRESTORE_DATABASE_ID =
  'ai-studio-0867a4e6-d6f0-4ab1-84e3-aa53097594a7';

@Injectable()
export class FirebaseAdminService implements OnModuleInit {
  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    if (getApps().length > 0) return;

    const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
    const serviceAccountPath = this.configService.get<string>(
      'FIREBASE_ADMIN_CREDENTIALS_PATH',
      '/etc/secrets/firebase-admin.json',
    );

    if (!serviceAccountPath) {
      throw new Error('Missing FIREBASE_ADMIN_CREDENTIALS_PATH');
    }

    let serviceAccount: Record<string, unknown>;

    // Render commonly passes a mounted file path, while some environments pass raw JSON.
    if (existsSync(serviceAccountPath)) {
      serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf-8'));
    } else {
      try {
        serviceAccount = JSON.parse(serviceAccountPath);
      } catch {
        throw new Error(
          'Invalid Firebase Admin credentials. Set FIREBASE_ADMIN_CREDENTIALS_PATH to a valid file path or JSON string.',
        );
      }
    }

    initializeApp({
      credential: cert(serviceAccount),
      projectId,
    });
  }

  get auth(): Auth {
    return getAuth();
  }

  /** Firestore de la app (datos heredados: disciplinas, divisiones, planteles). */
  get firestore(): Firestore {
    const databaseId =
      this.configService.get<string>('FIRESTORE_DATABASE_ID') ||
      DEFAULT_FIRESTORE_DATABASE_ID;
    return getFirestore(getApp(), databaseId);
  }
}
