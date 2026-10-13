import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { FirebaseAdminService } from '../../firebase/firebase-admin.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { RequestWithAuth } from '../interfaces/request-with-auth.interface';

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly firebaseAdminService: FirebaseAdminService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing Bearer token');
    }

    const idToken = authHeader.slice(7);

    try {
      const decoded =
        await this.firebaseAdminService.auth.verifyIdToken(idToken);
      request.auth = {
        uid: decoded.uid,
        email: decoded.email,
        emailVerified: decoded.email_verified === true,
        // Sesión iniciada con segundo factor (MFA / TOTP de Identity Platform).
        mfa: Boolean(
          (decoded.firebase as { sign_in_second_factor?: string } | undefined)
            ?.sign_in_second_factor,
        ),
        companyId:
          typeof decoded.companyId === 'string' ? decoded.companyId : undefined,
        clubId: typeof decoded.clubId === 'string' ? decoded.clubId : undefined,
        role: typeof decoded.role === 'string' ? decoded.role : undefined,
        roles: Array.isArray(decoded.roles)
          ? decoded.roles.filter(
              (role): role is string => typeof role === 'string',
            )
          : undefined,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid Firebase token');
    }
  }
}
