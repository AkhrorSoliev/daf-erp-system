import { Controller, Get } from '@nestjs/common';
import { BranchScope, CurrentUser } from '../../common/decorators';
import type { ReportBranchIds } from '../../common/finance/report-branch-scope';
import { Can } from '../../common/permissions/access.decorators';
import { AudienceService } from './audience.service';

/**
 * «Auditoriya». The header branch (`@BranchScope()`) as a list: several
 * branches without a pick are added up; an empty scope is refused in the
 * service. Not listed in `branch-route-policy.ts`.
 */
@Controller('reports/audience')
export class AudienceController {
  constructor(private readonly service: AudienceService) {}

  /** The whole page in one answer. CEO and Branch Director. */
  @Get('overview')
  @Can('reports.students')
  overview(
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.service.overview(companyId, scope);
  }
}
