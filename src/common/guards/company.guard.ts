import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { RequestWithAuth } from '../interfaces/request-with-auth.interface';

@Injectable()
export class CompanyGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    const requestUrl = request.originalUrl || request.url || '';

    if (requestUrl.includes('/users/me')) {
      return true;
    }

    const rawCompanyId = request.headers['x-company-id'];
    const headerCompanyId = Array.isArray(rawCompanyId) ? rawCompanyId[0] : rawCompanyId;
    const companyId = headerCompanyId || request.auth?.companyId;

    if (!companyId || typeof companyId !== 'string') {
      throw new UnauthorizedException('Missing X-Company-Id header');
    }

    if (request.auth?.companyId && request.auth.companyId !== companyId) {
      throw new UnauthorizedException('Tenant header does not match token claims');
    }

    request.companyId = companyId;
    return true;
  }
}
