import { Controller, Get, Query } from '@nestjs/common';
import { BranchScope, CurrentUser } from '../../common/decorators';
import type { ReportBranchIds } from '../../common/finance/report-branch-scope';
import { Can } from '../../common/permissions/access.decorators';
import { DepartedOverviewService } from './departed-overview.service';
import { DepartedFilterDto } from './dto/departed-query.dto';

/**
 * «Ketgan o'quvchilar» (spec B7a). The header branch (`@BranchScope()`) as a
 * list; an empty scope is refused in the service.
 */
@Controller('reports/departed-students')
export class DepartedController {
  constructor(private readonly overviewService: DepartedOverviewService) {}

  /** The cards, months, reasons and cuts (spec B7a §4). */
  @Get('overview')
  @Can('reports.students')
  overview(
    @Query() q: DepartedFilterDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.overviewService.overview(companyId, scope, q);
  }
}
