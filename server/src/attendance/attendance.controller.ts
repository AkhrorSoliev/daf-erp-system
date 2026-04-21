import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { QrAttendanceService } from './qr-attendance.service';
import { SaveAttendanceDto } from './dto/save-attendance.dto';
import {
  AttendanceDatesQueryDto,
  AttendanceStatsQueryDto,
} from './dto/attendance-query.dto';
import {
  StartQrSessionDto,
  RotateQrTokenDto,
  StopQrSessionDto,
} from './dto/qr-session.dto';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards/roles.guard';
import { PrismaService } from '../prisma/prisma.service';

@Controller('attendance')
export class AttendanceController {
  constructor(
    private attendanceService: AttendanceService,
    private qrAttendanceService: QrAttendanceService,
    private prisma: PrismaService,
  ) {}

  /** Verify teacher has access to this group */
  private async verifyTeacherAccess(
    groupId: string,
    roles: string[],
    userId: number,
  ) {
    const isTeacherOnly =
      roles.length > 0 && roles.every((r) => r === 'Teacher');

    if (isTeacherOnly) {
      const isAssigned = await this.prisma.groupTeacher.findUnique({
        where: { groupId_teacherId: { groupId, teacherId: userId } },
      });
      if (!isAssigned) {
        throw new ForbiddenException('Siz bu guruhga biriktirilmagansiz');
      }
    }
  }

  @Get(':groupId/dates')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator', 'Teacher')
  async getLessonDates(
    @Param('groupId') groupId: string,
    @Query() query: AttendanceDatesQueryDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('roles') roles: string[],
    @CurrentUser('companyId') companyId: number,
  ) {
    await this.verifyTeacherAccess(groupId, roles, userId);
    return this.attendanceService.getLessonDates(
      groupId,
      query.month,
      query.year,
      companyId,
    );
  }

  @Get(':groupId/date/:date')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator', 'Teacher')
  async getByDate(
    @Param('groupId') groupId: string,
    @Param('date') date: string,
    @CurrentUser('id') userId: number,
    @CurrentUser('roles') roles: string[],
    @CurrentUser('companyId') companyId: number,
  ) {
    await this.verifyTeacherAccess(groupId, roles, userId);
    return this.attendanceService.getByDate(groupId, date, companyId, roles);
  }

  @Post(':groupId/date/:date')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator', 'Teacher')
  async save(
    @Param('groupId') groupId: string,
    @Param('date') date: string,
    @Body() dto: SaveAttendanceDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('roles') roles: string[],
    @CurrentUser('companyId') companyId: number,
  ) {
    await this.verifyTeacherAccess(groupId, roles, userId);
    return this.attendanceService.save(
      groupId,
      date,
      dto,
      userId,
      roles,
      companyId,
    );
  }

  @Get(':groupId/stats')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator', 'Teacher')
  async getStats(
    @Param('groupId') groupId: string,
    @Query() query: AttendanceStatsQueryDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('roles') roles: string[],
    @CurrentUser('companyId') companyId: number,
  ) {
    await this.verifyTeacherAccess(groupId, roles, userId);
    return this.attendanceService.getStats(
      groupId,
      query.startDate,
      query.endDate,
      companyId,
    );
  }

  @Get(':groupId/lesson-sequence')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator', 'Teacher')
  async getLessonSequence(
    @Param('groupId') groupId: string,
    @CurrentUser('id') userId: number,
    @CurrentUser('roles') roles: string[],
    @CurrentUser('companyId') companyId: number,
  ) {
    await this.verifyTeacherAccess(groupId, roles, userId);
    return this.attendanceService.getLessonSequence(groupId, companyId);
  }

  // ── QR Davomat ──

  @Post(':groupId/qr-session/start')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator', 'Teacher')
  async startQrSession(
    @Param('groupId') groupId: string,
    @Body() dto: StartQrSessionDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('roles') roles: string[],
    @CurrentUser('companyId') companyId: number,
  ) {
    await this.verifyTeacherAccess(groupId, roles, userId);
    return this.qrAttendanceService.startSession(
      groupId,
      dto.date,
      userId,
      companyId,
      roles,
    );
  }

  @Post(':groupId/qr-session/rotate')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator', 'Teacher')
  async rotateQrToken(
    @Param('groupId') groupId: string,
    @Body() dto: RotateQrTokenDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('roles') roles: string[],
  ) {
    await this.verifyTeacherAccess(groupId, roles, userId);
    return this.qrAttendanceService.rotateToken(
      groupId,
      dto.date,
      dto.sessionId,
      userId,
    );
  }

  @Post(':groupId/qr-session/stop')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator', 'Teacher')
  async stopQrSession(
    @Param('groupId') groupId: string,
    @Body() dto: StopQrSessionDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('roles') roles: string[],
  ) {
    await this.verifyTeacherAccess(groupId, roles, userId);
    return this.qrAttendanceService.stopSession(
      groupId,
      dto.date,
      dto.sessionId,
      userId,
    );
  }
}
