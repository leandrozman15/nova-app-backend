import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Auth } from 'firebase-admin/auth';
export declare class FirebaseAdminService implements OnModuleInit {
    private readonly configService;
    constructor(configService: ConfigService);
    onModuleInit(): void;
    get auth(): Auth;
}
