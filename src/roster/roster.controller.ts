import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { NoTenant } from '../common/decorators/no-tenant.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import {
  requireClubScope,
  requireCompanyId,
} from '../common/http/request-context';
import type { RequestWithAuth } from '../common/interfaces/request-with-auth.interface';
import { PlatformAdminGuard } from '../platform/platform-admin.guard';
import { FirestoreMigrationService } from './firestore-migration.service';
import {
  DivisionsQueryDto,
  FieldsDto,
  MigrationDto,
  PlayersQueryDto,
} from './roster.dto';
import { RosterService, type Viewer } from './roster.service';

const STAFF = ['admin', 'manager', 'coach'] as const;
const EVERYONE = ['admin', 'manager', 'coach', 'player', 'member'] as const;

function viewerOf(req: unknown): Viewer {
  const auth = (req as RequestWithAuth).auth;
  return {
    uid: auth?.uid ?? '',
    role: auth?.role ?? null,
    email: auth?.email ?? null,
  };
}

function scope(req: unknown, clubId: string) {
  requireClubScope(req, clubId);
  return requireCompanyId(req);
}

/** Disciplinas habilitadas del club. */
@Controller('clubs/:clubId/disciplines')
export class DisciplinesController {
  constructor(private readonly roster: RosterService) {}

  @Roles(...EVERYONE)
  @Get()
  list(@Req() req: unknown, @Param('clubId') clubId: string) {
    return this.roster.listDisciplines(scope(req, clubId), clubId);
  }

  @Roles(...EVERYONE)
  @Get(':id')
  get(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Param('id') id: string,
  ) {
    return this.roster.getDiscipline(scope(req, clubId), clubId, id);
  }

  @Roles(...STAFF)
  @Post()
  create(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Body() dto: FieldsDto,
  ) {
    return this.roster.createDiscipline(scope(req, clubId), clubId, dto.fields);
  }

  @Roles(...STAFF)
  @Patch(':id')
  update(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Param('id') id: string,
    @Body() dto: FieldsDto,
  ) {
    return this.roster.updateDiscipline(
      scope(req, clubId),
      clubId,
      id,
      dto.fields,
    );
  }

  @Roles(...STAFF)
  @Delete(':id')
  remove(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Param('id') id: string,
  ) {
    return this.roster.deleteDiscipline(scope(req, clubId), clubId, id);
  }
}

/** Ramas (categorías) del club. */
@Controller('clubs/:clubId/divisions')
export class DivisionsController {
  constructor(private readonly roster: RosterService) {}

  @Roles(...EVERYONE)
  @Get()
  list(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Query() query: DivisionsQueryDto,
  ) {
    return this.roster.listDivisions(scope(req, clubId), clubId, query.sport);
  }

  @Roles(...EVERYONE)
  @Get(':id')
  get(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Param('id') id: string,
  ) {
    return this.roster.getDivision(scope(req, clubId), clubId, id);
  }

  @Roles(...STAFF)
  @Post()
  create(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Body() dto: FieldsDto,
  ) {
    return this.roster.createDivision(scope(req, clubId), clubId, dto.fields);
  }

  @Roles(...STAFF)
  @Patch(':id')
  update(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Param('id') id: string,
    @Body() dto: FieldsDto,
  ) {
    return this.roster.updateDivision(
      scope(req, clubId),
      clubId,
      id,
      dto.fields,
    );
  }

  @Roles(...STAFF)
  @Delete(':id')
  remove(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Param('id') id: string,
  ) {
    return this.roster.deleteDivision(scope(req, clubId), clubId, id);
  }
}

/** Padrón de jugadores y socios del club. */
@Controller('clubs/:clubId/roster')
export class RosterController {
  constructor(private readonly roster: RosterService) {}

  @Roles(...STAFF)
  @Get()
  list(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Query() query: PlayersQueryDto,
  ) {
    return this.roster.listPlayers(
      scope(req, clubId),
      clubId,
      viewerOf(req),
      query,
    );
  }

  @Roles(...EVERYONE)
  @Get('me')
  me(@Req() req: unknown, @Param('clubId') clubId: string) {
    return this.roster.myPlayer(scope(req, clubId), clubId, viewerOf(req));
  }

  @Roles(...EVERYONE)
  @Get(':id')
  get(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Param('id') id: string,
  ) {
    return this.roster.getPlayer(scope(req, clubId), clubId, id, viewerOf(req));
  }

  @Roles(...STAFF)
  @Post()
  create(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Body() dto: FieldsDto,
  ) {
    return this.roster.createPlayer(scope(req, clubId), clubId, dto.fields);
  }

  @Roles(...EVERYONE)
  @Patch(':id')
  update(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Param('id') id: string,
    @Body() dto: FieldsDto,
  ) {
    return this.roster.updatePlayer(
      scope(req, clubId),
      clubId,
      id,
      dto.fields,
      viewerOf(req),
    );
  }

  @Roles(...STAFF)
  @Delete(':id')
  remove(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Param('id') id: string,
  ) {
    return this.roster.deletePlayer(scope(req, clubId), clubId, id);
  }
}

/** Panel de Fluxion: copiar los datos de Firestore a Postgres. */
@NoTenant()
@UseGuards(PlatformAdminGuard)
@Controller('platform/firestore-migration')
export class FirestoreMigrationController {
  constructor(private readonly migration: FirestoreMigrationService) {}

  @Post('stage1')
  stage1(@Body() dto: MigrationDto) {
    return this.migration.stage1All({ clubId: dto.clubId, force: dto.force });
  }
}
