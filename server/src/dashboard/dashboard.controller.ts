import { Controller, Get, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { TodayScheduleQueryDto } from './dto/today-schedule-query.dto';
import { CurrentUser } from '../common/decorators';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

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
