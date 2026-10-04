import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  BranchCeiling,
  BranchScope,
  CurrentUser,
  Roles,
} from '../../common/decorators';
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

  /** The open tab with the current filters, every page, as xlsx (spec §2.7). */
  @Get('excel')
  async excel(
    @Query() q: DebtListQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.debts.excel(companyId, scope, q);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  /** The drawer (spec §2.5). Another branch's student is a 404 (ADR-0063). */
  @Get('students/:id')
  student(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
    @BranchCeiling() ceiling: ReportBranchIds,
  ) {
    return this.debts.student(companyId, scope, ceiling, id);
  }
}
