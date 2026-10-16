import { Controller, Get, Param, Query } from '@nestjs/common';
import { BranchScope, CurrentUser } from '../../common/decorators';
import type { ReportBranchIds } from '../../common/finance/report-branch-scope';
import { Can } from '../../common/permissions/access.decorators';
import {
  GroupDrawerQueryDto,
  GroupPaymentsQueryDto,
} from './dto/group-payments-query.dto';
import { GroupPaymentsService } from './group-payments.service';

/**
 * «Guruhlar bo'yicha to'lov» (spec B5 §5). The header branch (`@BranchScope()`)
 * as a list: several branches without a pick are added up; an empty scope is
 * refused in the service. Not listed in `branch-route-policy.ts`.
 */
@Controller('reports/group-payments')
export class GroupPaymentsController {
  constructor(private readonly service: GroupPaymentsService) {}

  /** The card and the table (spec B5 §5.2). The Administrator reads it too (`reports.payments`). */
  @Get()
  @Can('reports.payments')
  rows(
    @Query() q: GroupPaymentsQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.service.rows(companyId, scope, q);
  }

  /** The group drawer (spec B5 §5.3). A group without a charge this month is a 404. */
  @Get('groups/:groupId')
  @Can('reports.payments')
  group(
    @Param('groupId') groupId: string,
    @Query() q: GroupDrawerQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.service.group(companyId, scope, groupId, q.oy);
  }
}
