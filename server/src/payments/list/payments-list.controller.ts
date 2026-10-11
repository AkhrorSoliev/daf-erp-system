import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { BranchScope, CurrentUser } from '../../common/decorators';
import type { ReportBranchIds } from '../../common/finance/report-branch-scope';
import { Can } from '../../common/permissions/access.decorators';
import {
  PaymentListQueryDto,
  PaymentPeriodDto,
} from './dto/payment-list-query.dto';
import { PaymentsListService } from './payments-list.service';

/**
 * The To'lovlar page's reads (spec B4 §5). Two-segment paths, so they never
 * collide with `GET /payments/:id`. Scope: the header branch (`@BranchScope()`).
 */
@Controller('payments/list')
export class PaymentsListController {
  constructor(private readonly list: PaymentsListService) {}

  /** The To'lovlar page (spec B4 §5.2). Admin and Cashier read it too (`payments.view`). */
  @Get('rows')
  @Can('payments.view')
  rows(
    @Query() q: PaymentListQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.list.rows(companyId, scope, q);
  }

  /** The drawer: one payment, any status (spec B4 §5.3). Declared after `rows`. */
  @Get('rows/:id')
  @Can('payments.view')
  row(
    @Param('id') id: string,
    @Query() q: PaymentPeriodDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.list.row(companyId, scope, id, q);
  }

  /** The summary card — money, so CEO and Branch Director only (spec B4 §5.4). */
  @Get('summary')
  @Can('reports.finance')
  summary(
    @Query() q: PaymentPeriodDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.list.summary(companyId, scope, q);
  }

  /** The filtered list, every page, as xlsx (spec B4 §5.6). */
  @Get('excel')
  @Can('payments.view')
  async excel(
    @Query() q: PaymentListQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.list.excel(companyId, scope, q);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  /** The filter menus (spec B4 §5.5). */
  @Get('filter-options')
  @Can('payments.view')
  filterOptions(
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.list.filterOptions(companyId, scope);
  }
}
