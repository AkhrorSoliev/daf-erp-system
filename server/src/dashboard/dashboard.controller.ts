import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { TodayScheduleQueryDto } from './dto/today-schedule-query.dto';
import { CurrentUser, Roles, STAFF_ROLES } from '../common/decorators';
import { RolesGuard } from '../common/guards/roles.guard';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  // Staff only. The home dashboard is visible to every staff role including
  // teachers, but a student-portal token could read the whole centre's daily
  // timetable here.
  @UseGuards(RolesGuard)
  @Roles(...STAFF_ROLES)
  @Get('today-schedule')
  getTodaySchedule(
    @Query() query: TodayScheduleQueryDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.dashboardService.getTodaySchedule(
      query.branchId,
      companyId,
      query.date,
    );
  }
}
