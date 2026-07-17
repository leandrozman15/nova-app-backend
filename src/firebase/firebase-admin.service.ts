import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';

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

    const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf-8'));

    initializeApp({
      credential: cert(serviceAccount),
      projectId,
    });
  }

  get auth(): Auth {
    return getAuth();
  }
}
