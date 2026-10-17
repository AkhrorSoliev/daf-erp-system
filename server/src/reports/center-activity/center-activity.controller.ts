import { Controller, Get, Query } from '@nestjs/common';
import { BranchScope, CurrentUser } from '../../common/decorators';
import type { ReportBranchIds } from '../../common/finance/report-branch-scope';
import { Can } from '../../common/permissions/access.decorators';
import { CenterActivityService } from './center-activity.service';
import { CenterActivityQueryDto } from './dto/center-activity-query.dto';

/**
 * «Markaz faoliyati» (spec B7b §5). The header branch (`@BranchScope()`) as a
 * list: several branches without a pick are added up; an empty scope is refused
 * in the service. Not listed in `branch-route-policy.ts`.
 */
@Controller('reports/center-activity')
export class CenterActivityController {
  constructor(private readonly service: CenterActivityService) {}

  /** Cards, free-rooms table, rooms, groups with free seats, month bars. CEO and Branch Director (`reports.students`). */
  @Get('overview')
  @Can('reports.students')
  overview(
    @Query() q: CenterActivityQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.service.overview(companyId, scope, q);
  }
}
