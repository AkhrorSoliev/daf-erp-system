import { Controller, Get, Query } from '@nestjs/common';
import { OutreachService } from './outreach.service';
import { BranchScope } from '../common/decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TodayAbsenteesQueryDto } from './dto/today-absentees-query.dto';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';
import { Can } from '../common/permissions/access.decorators';

@Controller('outreach')
@Can('outreach.view')
export class OutreachController {
  constructor(private outreach: OutreachService) {}

  @Get('stats')
  getStats(
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('roles') roles: string[],
    @BranchScope() branchScope: ReportBranchIds,
  ) {
    return this.outreach.getStats({ userId, companyId, roles, branchScope });
  }

  @Get('today-absentees')
  getTodayAbsentees(
    @Query() query: TodayAbsenteesQueryDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('roles') roles: string[],
    @BranchScope() branchScope: ReportBranchIds,
  ) {
    return this.outreach.getTodayAbsentees({
      userId,
      companyId,
      roles,
      branchScope,
      date: query.date,
    });
  }

  @Get('removal-queue')
  getRemovalQueue(
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('roles') roles: string[],
    @BranchScope() branchScope: ReportBranchIds,
  ) {
    return this.outreach.getRemovalQueue({
      userId,
      companyId,
      roles,
      branchScope,
    });
  }

  @Get('auto-paused')
  getAutoPaused(
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('roles') roles: string[],
    @BranchScope() branchScope: ReportBranchIds,
  ) {
    return this.outreach.getAutoPaused({
      userId,
      companyId,
      roles,
      branchScope,
    });
  }

  @Get('promises')
  getActivePromises(
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('roles') roles: string[],
    @BranchScope() branchScope: ReportBranchIds,
  ) {
    return this.outreach.getActivePromises({
      userId,
      companyId,
      roles,
      branchScope,
    });
  }
}
