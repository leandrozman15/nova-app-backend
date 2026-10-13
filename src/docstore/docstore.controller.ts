import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { NoTenant } from '../common/decorators/no-tenant.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { requireCompanyId } from '../common/http/request-context';
import type { RequestWithAuth } from '../common/interfaces/request-with-auth.interface';
import { PlatformAdminGuard } from '../platform/platform-admin.guard';
import { MigrationDto, PathDto, QueryDto, WriteDto } from './docstore.dto';
import { DocStoreMigrationService } from './docstore-migration.service';
import { DocStoreService } from './docstore.service';
import type { Viewer } from './docstore.rules';

function viewerOf(req: unknown): Viewer {
  const auth = (req as RequestWithAuth).auth;
  return {
    uid: auth?.uid ?? '',
    role: auth?.role ?? null,
    clubId: auth?.clubId ?? null,
    companyId: requireCompanyId(req),
  };
}

/** Documentos de la consola (antes Firestore). Los permisos se resuelven por ruta. */
@Roles('admin', 'manager', 'coach', 'player', 'member')
@Controller('docstore')
export class DocStoreController {
  constructor(private readonly store: DocStoreService) {}

  @Post('query')
  @HttpCode(200)
  query(@Req() req: unknown, @Body() dto: QueryDto) {
    return this.store.query(viewerOf(req), dto);
  }

  @Post('get')
  @HttpCode(200)
  get(@Req() req: unknown, @Body() dto: PathDto) {
    return this.store.get(viewerOf(req), dto.path);
  }

  @Post('set')
  @HttpCode(200)
  set(@Req() req: unknown, @Body() dto: WriteDto) {
    return this.store.set(
      viewerOf(req),
      dto.path,
      dto.data,
      dto.merge ?? false,
    );
  }

  @Post('update')
  @HttpCode(200)
  update(@Req() req: unknown, @Body() dto: WriteDto) {
    return this.store.update(viewerOf(req), dto.path, dto.data);
  }

  @Post('add')
  @HttpCode(200)
  add(@Req() req: unknown, @Body() dto: WriteDto) {
    return this.store.add(viewerOf(req), dto.path, dto.data);
  }

  @Post('delete')
  @HttpCode(200)
  remove(@Req() req: unknown, @Body() dto: PathDto) {
    return this.store.remove(viewerOf(req), dto.path);
  }
}

/** Panel de Fluxion: copiar el resto de Firestore (etapa 2). */
@NoTenant()
@UseGuards(PlatformAdminGuard)
@Controller('platform/firestore-migration')
export class DocStoreMigrationController {
  constructor(private readonly migration: DocStoreMigrationService) {}

  @Post('stage2')
  stage2(@Body() dto: MigrationDto) {
    return this.migration.stage2All({ clubId: dto.clubId, force: dto.force });
  }
}
