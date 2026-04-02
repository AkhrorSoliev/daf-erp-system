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
import { SaveAttendanceDto } from './dto/save-attendance.dto';
import { AttendanceDatesQueryDto, AttendanceStatsQueryDto } from './dto/attendance-query.dto';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards/roles.guard';
import { PrismaService } from '../prisma/prisma.service';

@Controller('attendance')
export class AttendanceController {
  constructor(
    private attendanceService: AttendanceService,
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
        throw new ForbiddenException(
          'Siz bu guruhga biriktirilmagansiz',
        );
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
  ) {
    await this.verifyTeacherAccess(groupId, roles, userId);
    return this.attendanceService.getLessonDates(
      groupId,
      query.month,
      query.year,
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
  ) {
    await this.verifyTeacherAccess(groupId, roles, userId);
    return this.attendanceService.getByDate(groupId, date);
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
  ) {
    await this.verifyTeacherAccess(groupId, roles, userId);
    return this.attendanceService.getStats(
      groupId,
      query.startDate,
      query.endDate,
    );
  }
}
