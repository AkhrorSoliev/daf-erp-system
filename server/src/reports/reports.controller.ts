import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsQueryDto } from './dto/reports-query.dto';
import { Roles, CurrentUser } from '../common/decorators';
import { RolesGuard } from '../common/guards';

@Controller('reports')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('kpis')
  getKpis(
    @Query() query: ReportsQueryDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.reportsService.getKpis(companyId, query);
  }

  @Get('room-utilization')
  getRoomUtilization(
    @Query() query: ReportsQueryDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.reportsService.getRoomUtilization(companyId, query);
  }

  @Get('teacher-performance')
  getTeacherPerformance(
    @Query() query: ReportsQueryDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.reportsService.getTeacherPerformance(companyId, query);
  }

  @Get('attendance-analytics')
  getAttendanceAnalytics(
    @Query() query: ReportsQueryDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.reportsService.getAttendanceAnalytics(companyId, query);
  }

  @Get('group-analytics')
  getGroupAnalytics(
    @Query() query: ReportsQueryDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.reportsService.getGroupAnalytics(companyId, query);
  }

  @Get('lead-analytics')
  getLeadAnalytics(@Query() query: ReportsQueryDto) {
    return this.reportsService.getLeadAnalytics(query);
  }
}
