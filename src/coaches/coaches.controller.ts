import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

import { NoTenant } from '../common/decorators/no-tenant.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import {
  requireClubScope,
  requireCompanyId,
} from '../common/http/request-context';
import type { RequestWithAuth } from '../common/interfaces/request-with-auth.interface';
import { CoachClubService } from './coach-club.service';
import { CoachPortalService } from './coach-portal.service';
import { CoachPublicService } from './coach-public.service';
import {
  AvailabilityDto,
  BlockDto,
  ClassTypeDto,
  ClubLinkDto,
  CoachProfileDto,
  CompleteLessonDto,
  CreateLessonDto,
  JoinLessonDto,
  LessonRequestDto,
  NoteDto,
  PackDto,
  PaymentDto,
  ReasonDto,
  StudentDto,
  UpdateCoachProfileDto,
  UpdateStudentDto,
} from './dto/coach.dto';

function uid(req: unknown) {
  const auth = (req as RequestWithAuth).auth;
  if (!auth?.uid) throw new UnauthorizedException('Missing auth context');
  return auth.uid;
}

/** Portal del profe (cualquier usuario con cuenta puede tener su perfil). */
@NoTenant()
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 120, ttl: 60_000 } })
@Controller('coach-portal')
export class CoachPortalController {
  constructor(private readonly portal: CoachPortalService) {}

  @Get('me')
  me(@Req() req: unknown) {
    return this.portal.me(uid(req));
  }

  @Post('profile')
  create(@Req() req: unknown, @Body() dto: CoachProfileDto) {
    return this.portal.createProfile(uid(req), dto);
  }

  @Put('profile')
  update(@Req() req: unknown, @Body() dto: UpdateCoachProfileDto) {
    return this.portal.updateProfile(uid(req), dto);
  }

  @Get('summary')
  summary(@Req() req: unknown) {
    return this.portal.summary(uid(req));
  }

  @Get('class-types')
  classTypes(@Req() req: unknown) {
    return this.portal.classTypes(uid(req));
  }

  @Post('class-types')
  createClassType(@Req() req: unknown, @Body() dto: ClassTypeDto) {
    return this.portal.saveClassType(uid(req), dto);
  }

  @Put('class-types/:id')
  updateClassType(
    @Req() req: unknown,
    @Param('id') id: string,
    @Body() dto: ClassTypeDto,
  ) {
    return this.portal.saveClassType(uid(req), dto, id);
  }

  @Delete('class-types/:id')
  deleteClassType(@Req() req: unknown, @Param('id') id: string) {
    return this.portal.deleteClassType(uid(req), id);
  }

  @Get('clubs')
  clubs(@Req() req: unknown) {
    return this.portal.clubs(uid(req));
  }

  @Post('clubs')
  requestClub(@Req() req: unknown, @Body() dto: ClubLinkDto) {
    return this.portal.requestClub(uid(req), dto);
  }

  @Delete('clubs/:linkId')
  leaveClub(@Req() req: unknown, @Param('linkId') linkId: string) {
    return this.portal.leaveClub(uid(req), linkId);
  }

  @Get('availability')
  availability(@Req() req: unknown) {
    return this.portal.availability(uid(req));
  }

  @Put('availability')
  saveAvailability(@Req() req: unknown, @Body() dto: AvailabilityDto) {
    return this.portal.saveAvailability(uid(req), dto);
  }

  @Post('blocks')
  addBlock(@Req() req: unknown, @Body() dto: BlockDto) {
    return this.portal.addBlock(uid(req), dto);
  }

  @Delete('blocks/:id')
  deleteBlock(@Req() req: unknown, @Param('id') id: string) {
    return this.portal.deleteBlock(uid(req), id);
  }

  @Get('lessons')
  lessons(
    @Req() req: unknown,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.portal.lessons(uid(req), from, to);
  }

  @Get('slots')
  slots(
    @Req() req: unknown,
    @Query('duration') duration?: string,
    @Query('from') from?: string,
    @Query('days') days?: string,
  ) {
    return this.portal.slots(
      uid(req),
      Number(duration) || 60,
      from,
      Number(days) || 14,
    );
  }

  @Post('lessons')
  createLesson(@Req() req: unknown, @Body() dto: CreateLessonDto) {
    return this.portal.createLesson(uid(req), uid(req), dto);
  }

  @Post('lessons/:id/confirm')
  confirm(@Req() req: unknown, @Param('id') id: string) {
    return this.portal.confirmLesson(uid(req), uid(req), id);
  }

  @Post('lessons/:id/reject')
  reject(@Req() req: unknown, @Param('id') id: string, @Body() dto: ReasonDto) {
    return this.portal.rejectLesson(uid(req), id, dto.reason);
  }

  @Post('lessons/:id/cancel')
  cancel(@Req() req: unknown, @Param('id') id: string, @Body() dto: ReasonDto) {
    return this.portal.cancelLesson(uid(req), id, dto.reason);
  }

  @Post('lessons/:id/complete')
  complete(
    @Req() req: unknown,
    @Param('id') id: string,
    @Body() dto: CompleteLessonDto,
  ) {
    return this.portal.completeLesson(uid(req), id, dto);
  }

  @Post('lessons/:id/participants/:participantId/accept')
  accept(
    @Req() req: unknown,
    @Param('id') id: string,
    @Param('participantId') participantId: string,
  ) {
    return this.portal.reviewParticipant(uid(req), id, participantId, true);
  }

  @Post('lessons/:id/participants/:participantId/reject')
  rejectParticipant(
    @Req() req: unknown,
    @Param('id') id: string,
    @Param('participantId') participantId: string,
  ) {
    return this.portal.reviewParticipant(uid(req), id, participantId, false);
  }

  @Get('clubs/:clubId/courts')
  courts(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Query('date') date: string,
  ) {
    return this.portal.courts(uid(req), clubId, date);
  }

  @Get('students')
  students(@Req() req: unknown) {
    return this.portal.students(uid(req));
  }

  @Post('students')
  createStudent(@Req() req: unknown, @Body() dto: StudentDto) {
    return this.portal.createStudent(uid(req), dto);
  }

  @Get('students/:id')
  student(@Req() req: unknown, @Param('id') id: string) {
    return this.portal.student(uid(req), id);
  }

  @Put('students/:id')
  updateStudent(
    @Req() req: unknown,
    @Param('id') id: string,
    @Body() dto: UpdateStudentDto,
  ) {
    return this.portal.updateStudent(uid(req), id, dto);
  }

  @Post('students/:id/notes')
  addNote(@Req() req: unknown, @Param('id') id: string, @Body() dto: NoteDto) {
    return this.portal.addNote(uid(req), id, dto);
  }

  @Post('students/:id/packs')
  addPack(@Req() req: unknown, @Param('id') id: string, @Body() dto: PackDto) {
    return this.portal.addPack(uid(req), id, dto);
  }

  @Post('students/:id/payments')
  addPayment(
    @Req() req: unknown,
    @Param('id') id: string,
    @Body() dto: PaymentDto,
  ) {
    return this.portal.addPayment(uid(req), id, dto);
  }
}

/** Lo que hace el alumno desde la app: pedir clases, sumarse a grupales, ver y cancelar. */
@NoTenant()
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 30, ttl: 60_000 } })
@Controller('users/me/coach-lessons')
export class MyCoachLessonsController {
  constructor(private readonly service: CoachPublicService) {}

  @Get()
  list(@Req() req: unknown) {
    return this.service.myLessons(uid(req));
  }

  @Post('request')
  request(@Req() req: unknown, @Body() dto: LessonRequestDto) {
    return this.service.request(uid(req), dto);
  }

  @Post('join/:lessonId')
  join(
    @Req() req: unknown,
    @Param('lessonId') lessonId: string,
    @Body() dto: JoinLessonDto,
  ) {
    return this.service.join(uid(req), lessonId, dto);
  }

  @Post(':participantId/cancel')
  cancel(@Req() req: unknown, @Param('participantId') participantId: string) {
    return this.service.cancelMine(uid(req), participantId);
  }
}

/** Vidriera pública de profes. */
@Public()
@NoTenant()
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 120, ttl: 60_000 } })
@Controller('public/coaches')
export class PublicCoachesController {
  constructor(private readonly service: CoachPublicService) {}

  @Get()
  list(
    @Query('sport') sport?: string,
    @Query('zone') zone?: string,
    @Query('level') level?: string,
    @Query('clubId') clubId?: string,
    @Query('q') q?: string,
  ) {
    return this.service.list({ sport, zone, level, clubId, q });
  }

  @Get(':slug')
  detail(@Param('slug') slug: string) {
    return this.service.detail(slug);
  }

  @Get(':slug/slots')
  slots(
    @Param('slug') slug: string,
    @Query('classTypeId') classTypeId: string,
    @Query('from') from?: string,
    @Query('days') days?: string,
  ) {
    return this.service.slots(slug, classTypeId, from, Number(days) || 14);
  }
}

/** Consola del club: aprobar profes y ver los vinculados. */
@Roles('admin', 'club_admin', 'manager', 'coordinator')
@Controller('clubs/:clubId/coaches')
export class ClubCoachesController {
  constructor(private readonly service: CoachClubService) {}

  private scope(req: unknown, clubId: string) {
    requireClubScope(req, clubId);
    return requireCompanyId(req);
  }

  @Get()
  list(@Req() req: unknown, @Param('clubId') clubId: string) {
    return this.service.list(this.scope(req, clubId), clubId);
  }

  @Post(':linkId/approve')
  approve(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Param('linkId') linkId: string,
  ) {
    return this.service.review(
      this.scope(req, clubId),
      clubId,
      linkId,
      'approve',
      uid(req),
    );
  }

  @Post(':linkId/reject')
  reject(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Param('linkId') linkId: string,
  ) {
    return this.service.review(
      this.scope(req, clubId),
      clubId,
      linkId,
      'reject',
      uid(req),
    );
  }

  @Post(':linkId/end')
  end(
    @Req() req: unknown,
    @Param('clubId') clubId: string,
    @Param('linkId') linkId: string,
  ) {
    return this.service.review(
      this.scope(req, clubId),
      clubId,
      linkId,
      'end',
      uid(req),
    );
  }
}
