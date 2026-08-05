import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { TodayScheduleQueryDto } from './dto/today-schedule-query.dto';
import {
  CurrentUser,
  Roles,
  STAFF_ROLES,
  BranchScope,
} from '../common/decorators';
import { RolesGuard } from '../common/guards/roles.guard';
import { isEmptyScope, singleBranchId } from '../common/finance/report-branch-scope';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';

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
    @BranchScope() branchScope: ReportBranchIds,
  ) {
    // The timetable is inherently per-branch (it is laid out against ONE
    // branch's rooms and working hours), so `query.branchId` used to be taken
    // as-is — any staff token could render another branch's whole day.
    //
    // An empty scope means the caller asked for a branch outside their ceiling,
    // or has none attached: refuse rather than silently drawing a different
    // branch's day under a header naming the one they picked.
    if (isEmptyScope(branchScope)) {
      throw new ForbiddenException("Bu filial sizning ruxsatingizda emas");
    }
    const branchId = singleBranchId(branchScope) ?? query.branchId;
    if (branchId == null) {
      throw new BadRequestException('Filial tanlanishi shart');
    }
    return this.dashboardService.getTodaySchedule(
      branchId,
      companyId,
      query.date,
    );
  }
}
