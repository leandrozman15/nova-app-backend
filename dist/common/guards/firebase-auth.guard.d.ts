import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FirebaseAdminService } from '../../firebase/firebase-admin.service';
export declare class FirebaseAuthGuard implements CanActivate {
    private readonly reflector;
    private readonly firebaseAdminService;
    constructor(reflector: Reflector, firebaseAdminService: FirebaseAdminService);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
