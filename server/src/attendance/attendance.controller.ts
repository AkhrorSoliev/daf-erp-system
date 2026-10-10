import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { assertCallerMayTouchGroup } from '../common/auth/group-branch-scope';
import { AttendanceService } from './attendance.service';
import { QrAttendanceService } from './qr-attendance.service';
import { UnmarkedLessonsService } from './unmarked-lessons.service';
import { SaveAttendanceDto } from './dto/save-attendance.dto';
import { LateAttendanceDto } from './dto/late-attendance.dto';
import { NotHeldDto } from './dto/not-held.dto';
import {
  AttendanceDatesQueryDto,
  AttendanceStatsQueryDto,
} from './dto/attendance-query.dto';
import {
  StartQrSessionDto,
  RotateQrTokenDto,
  StopQrSessionDto,
} from './dto/qr-session.dto';
import { CurrentUser } from '../common/decorators';
import { Can } from '../common/permissions/access.decorators';
import { PrismaService } from '../prisma/prisma.service';

@Controller('attendance')
export class AttendanceController {
  constructor(
    private attendanceService: AttendanceService,
    private qrAttendanceService: QrAttendanceService,
    private prisma: PrismaService,
    private unmarkedLessons: UnmarkedLessonsService,
  ) {}

  /**
   * Verify the caller may touch this group's lessons.
   *
   * The rule itself lives in `common/auth/group-branch-scope.ts` — it used to
   * be private to this controller, and the three sibling modules that
   * manipulate the SAME lessons (cancellations, reschedules, planned absences)
   * each shipped without it.
   */
  private verifyGroupAccess(
    groupId: string,
    roles: string[],
    userId: number,
    // Supplied by the two routes that name a lesson: a substitute is admitted
    // for the day they were assigned, not for the group in general.
    date?: string,
  ) {
    return assertCallerMayTouchGroup(
      this.prisma,
      userId,
      roles,
      groupId,
      "Bu guruh boshqa filialga tegishli — davomat bilan ishlash huquqingiz yo'q",
      { lessonDate: parseLessonDate(date) },
    );
  }

  @Get(':groupId/dates')
  @Can('groups.view')
  async getLessonDates(
    @Param('groupId') groupId: string,
    @Query() query: AttendanceDatesQueryDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('roles') roles: string[],
    @CurrentUser('companyId') companyId: number,
  ) {
    await this.verifyGroupAccess(groupId, roles, userId);
    return this.attendanceService.getLessonDates(
      groupId,
      query.month,
      query.year,
      companyId,
    );
  }

  @Get(':groupId/calendar')
  @Can('groups.view')
  async getLessonCalendar(
    @Param('groupId') groupId: string,
    @Query() query: AttendanceDatesQueryDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('roles') roles: string[],
    @CurrentUser('companyId') companyId: number,
  ) {
    await this.verifyGroupAccess(groupId, roles, userId);
    return this.attendanceService.getLessonCalendar(
      groupId,
      query.month,
      query.year,
      companyId,
    );
  }

  @Get(':groupId/date/:date')
  @Can('groups.view')
  async getByDate(
    @Param('groupId') groupId: string,
    @Param('date') date: string,
    @CurrentUser('id') userId: number,
    @CurrentUser('roles') roles: string[],
    @CurrentUser('companyId') companyId: number,
    @Query('late') late?: string,
  ) {
    await this.verifyGroupAccess(groupId, roles, userId, date);
    const isTeacherOnly =
      roles.length > 0 && roles.every((r) => r === 'Teacher');
    return this.attendanceService.getByDate(
      groupId,
      date,
      companyId,
      roles,
      late === '1' && !isTeacherOnly,
    );
  }

  @Post(':groupId/date/:date')
  @Can('attendance.mark')
  async save(
    @Param('groupId') groupId: string,
    @Param('date') date: string,
    @Body() dto: SaveAttendanceDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('roles') roles: string[],
    @CurrentUser('companyId') companyId: number,
  ) {
    await this.verifyGroupAccess(groupId, roles, userId, date);
    return this.attendanceService.save(
      groupId,
      date,
      dto,
      userId,
      roles,
      companyId,
    );
  }

  /** «Bo'ldi» — the late register of a lesson nobody marked (ADR-0054). */
  @Post(':groupId/date/:date/late')
  @Can('attendance.fix')
  async saveLate(
    @Param('groupId') groupId: string,
    @Param('date') date: string,
    @Body() dto: LateAttendanceDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('roles') roles: string[],
    @CurrentUser('companyId') companyId: number,
  ) {
    await this.verifyGroupAccess(groupId, roles, userId, date);
    return this.attendanceService.saveLate(
      groupId,
      date,
      dto,
      userId,
      roles,
      companyId,
    );
  }

  /** «Bo'lmadi» — cancel with a refund, or move (spec 2026-09-29 §3.5). */
  @Post(':groupId/date/:date/not-held')
  @Can('attendance.fix')
  async notHeld(
    @Param('groupId') groupId: string,
    @Param('date') date: string,
    @Body() dto: NotHeldDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('roles') roles: string[],
    @CurrentUser('companyId') companyId: number,
  ) {
    await this.verifyGroupAccess(groupId, roles, userId, date);
    return this.unmarkedLessons.answerNotHeld({
      groupId,
      date,
      dto,
      userId,
      roles,
      companyId,
    });
  }

  @Get(':groupId/stats')
  @Can('groups.view')
  async getStats(
    @Param('groupId') groupId: string,
    @Query() query: AttendanceStatsQueryDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('roles') roles: string[],
    @CurrentUser('companyId') companyId: number,
  ) {
    await this.verifyGroupAccess(groupId, roles, userId);
    return this.attendanceService.getStats(
      groupId,
      query.startDate,
      query.endDate,
      companyId,
    );
  }

  @Get(':groupId/lesson-sequence')
  @Can('groups.view')
  async getLessonSequence(
    @Param('groupId') groupId: string,
    @CurrentUser('id') userId: number,
    @CurrentUser('roles') roles: string[],
    @CurrentUser('companyId') companyId: number,
  ) {
    await this.verifyGroupAccess(groupId, roles, userId);
    return this.attendanceService.getLessonSequence(groupId, companyId);
  }

  // ── QR Davomat ──

  @Post(':groupId/qr-session/start')
  @Can('attendance.mark')
  async startQrSession(
    @Param('groupId') groupId: string,
    @Body() dto: StartQrSessionDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('roles') roles: string[],
    @CurrentUser('companyId') companyId: number,
  ) {
    await this.verifyGroupAccess(groupId, roles, userId);
    return this.qrAttendanceService.startSession(
      groupId,
      dto.date,
      userId,
      companyId,
      roles,
    );
  }

  @Post(':groupId/qr-session/rotate')
  @Can('attendance.mark')
  async rotateQrToken(
    @Param('groupId') groupId: string,
    @Body() dto: RotateQrTokenDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('roles') roles: string[],
  ) {
    await this.verifyGroupAccess(groupId, roles, userId);
    return this.qrAttendanceService.rotateToken(
      groupId,
      dto.date,
      dto.sessionId,
      userId,
    );
  }

  @Post(':groupId/qr-session/stop')
  @Can('attendance.mark')
  async stopQrSession(
    @Param('groupId') groupId: string,
    @Body() dto: StopQrSessionDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('roles') roles: string[],
  ) {
    await this.verifyGroupAccess(groupId, roles, userId);
    return this.qrAttendanceService.stopSession(
      groupId,
      dto.date,
      dto.sessionId,
      userId,
    );
  }
}

/**
 * `YYYY-MM-DD` as the UTC midnight instant the schema stores lesson dates at.
 * Anything else returns undefined, which widens the check to "any active
 * override" rather than silently matching nothing — a malformed date must not
 * be the thing that grants or denies access. The routes validate the format
 * properly downstream.
 */
function parseLessonDate(date?: string): Date | undefined {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}
