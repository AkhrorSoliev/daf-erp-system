import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { BranchScope, CurrentUser, Roles } from '../../common/decorators';
import type { ReportBranchIds } from '../../common/finance/report-branch-scope';
import { RolesGuard } from '../../common/guards';
import { DebtListService } from './debt-list.service';
import { DebtListQueryDto } from './dto/debt-list-query.dto';

/**
 * The debt page's reads (spec B2a, ADR-0072). Open to every staff role that
 * opens the page — the 2026-08-12 open-read rule (server/CLAUDE.md «Key
 * access rules»). Scope: the header branch (`@BranchScope()`).
 */
@Controller('payments/debt')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director', 'Administrator', 'Cashier')
export class DebtListController {
  constructor(private readonly debts: DebtListService) {}

  @Get('list')
  list(
    @Query() q: DebtListQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.debts.list(companyId, scope, q);
  }
}
