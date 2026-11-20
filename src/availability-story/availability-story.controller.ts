import { timingSafeEqual } from 'node:crypto';

import { Body, Controller, ForbiddenException, Get, Headers, Param, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import type { Response } from 'express';

import { NoTenant } from '../common/decorators/no-tenant.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { requireClubScope, requireCompanyId } from '../common/http/request-context';
import { RequiresPack } from '../subscriptions/plan-entitlements';
import { AvailabilityStoryService } from './availability-story.service';

export class StorySettingsDto {
  @IsOptional() @IsBoolean() whatsapp?: boolean;
  @IsOptional() @IsBoolean() instagram?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(40) @IsString({ each: true }) @Type(() => String) facilityIds?: string[];
  @IsOptional() @IsString() @MaxLength(60) contact?: string | null;
}

/** Estado de turnos libres del club (consola): ajustes, imagen para compartir y publicar historia. */
@Roles('admin', 'club_admin', 'manager', 'coordinator')
@Controller('clubs/:clubId/availability-story')
export class AvailabilityStoryController {
  constructor(private readonly service: AvailabilityStoryService) {}

  private scope(req: unknown, clubId: string) {
    requireClubScope(req, clubId);
    return requireCompanyId(req);
  }

  @Get()
  get(@Req() req: unknown, @Param('clubId') clubId: string) {
    return this.service.settings(this.scope(req, clubId), clubId);
  }

  @Put()
  update(@Req() req: unknown, @Param('clubId') clubId: string, @Body() dto: StorySettingsDto) {
    return this.service.updateSettings(this.scope(req, clubId), clubId, dto);
  }

  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('image')
  image(@Req() req: unknown, @Param('clubId') clubId: string) {
    return this.service.image(this.scope(req, clubId), clubId);
  }

  @RequiresPack('integrations')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('instagram')
  instagram(@Req() req: unknown, @Param('clubId') clubId: string) {
    return this.service.publishInstagram(this.scope(req, clubId), clubId);
  }
}

/** Imagen pública firmada: Instagram la descarga para publicar la historia. */
@Public()
@NoTenant()
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@Controller('public/availability-story')
export class AvailabilityStoryImageController {
  constructor(private readonly service: AvailabilityStoryService) {}

  @Get(':clubId/:file')
  async image(@Param('clubId') clubId: string, @Param('file') file: string, @Query('sig') sig: string | undefined, @Res() res: Response) {
    const date = file.replace(/\.jpe?g$/i, '');
    const jpeg = await this.service.publicImage(clubId, date, sig ?? '');
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.send(jpeg);
  }
}

/** Corrida diaria (cron externo con `CRON_SECRET`): historia de Instagram y aviso para WhatsApp. */
@Public()
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 10, ttl: 60_000 } })
@Controller('internal/availability-story')
export class AvailabilityStoryCronController {
  constructor(private readonly service: AvailabilityStoryService) {}

  @Post('run')
  run(@Headers('x-cron-secret') secret: string | undefined) {
    const expected = process.env.CRON_SECRET?.trim();
    const a = Buffer.from(secret ?? '');
    const b = Buffer.from(expected ?? '');
    if (!expected || a.length !== b.length || !timingSafeEqual(a, b)) throw new ForbiddenException();
    return this.service.runDaily();
  }
}
