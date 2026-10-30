import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';

import { Roles } from '../common/decorators/roles.decorator';
import { requireCompanyId } from '../common/http/request-context';
import type { RequestWithAuth } from '../common/interfaces/request-with-auth.interface';
import type { Viewer } from '../docstore/docstore.rules';
import { UploadDocumentDto } from './player-documents.dto';
import { PlayerDocumentsService } from './player-documents.service';

function viewerOf(req: unknown): { viewer: Viewer; email?: string } {
  const auth = (req as RequestWithAuth).auth;
  return {
    viewer: {
      uid: auth?.uid ?? '',
      role: auth?.role ?? null,
      clubId: auth?.clubId ?? null,
      companyId: requireCompanyId(req),
    },
    email: auth?.email,
  };
}

/** Documentación de atletas: solo la dirección del club (el servicio lo vuelve a verificar). */
@Roles('admin', 'manager')
@Controller('player-documents')
export class PlayerDocumentsController {
  constructor(private readonly service: PlayerDocumentsService) {}

  @Post(':playerId')
  upload(
    @Req() req: unknown,
    @Param('playerId') playerId: string,
    @Body() dto: UploadDocumentDto,
  ) {
    const { viewer, email } = viewerOf(req);
    return this.service.upload(viewer, email, playerId, dto);
  }

  @Get(':playerId/:docId/url')
  url(
    @Req() req: unknown,
    @Param('playerId') playerId: string,
    @Param('docId') docId: string,
    @Query('clubId') clubId: string,
    @Query('mode') mode: string = 'view',
    @Query('name') name?: string,
  ) {
    if (!clubId) throw new BadRequestException('Falta clubId');
    if (mode !== 'view' && mode !== 'download')
      throw new BadRequestException('mode inválido');
    const { viewer, email } = viewerOf(req);
    return this.service.signedUrl(
      viewer,
      email,
      clubId,
      playerId,
      docId,
      mode,
      name,
    );
  }

  @Delete(':playerId/:docId')
  remove(
    @Req() req: unknown,
    @Param('playerId') playerId: string,
    @Param('docId') docId: string,
    @Query('clubId') clubId: string,
  ) {
    if (!clubId) throw new BadRequestException('Falta clubId');
    const { viewer, email } = viewerOf(req);
    return this.service.remove(viewer, email, clubId, playerId, docId);
  }
}
