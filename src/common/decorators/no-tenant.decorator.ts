import { SetMetadata } from '@nestjs/common';

/**
 * Endpoint autenticado que NO requiere empresa (X-Company-Id).
 * Pensado para el usuario libre de la app pública: registrarse, ver sus
 * membresías y pedir unirse a un club. Sigue exigiendo token de Firebase.
 */
export const NO_TENANT_KEY = 'noTenant';
export const NoTenant = () => SetMetadata(NO_TENANT_KEY, true);
