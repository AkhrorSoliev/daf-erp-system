import { Controller, Get, Query } from '@nestjs/common';
import { BranchScope, CurrentUser } from '../../common/decorators';
import type { ReportBranchIds } from '../../common/finance/report-branch-scope';
import { Can } from '../../common/permissions/access.decorators';
import { PaymentListQueryDto } from './dto/payment-list-query.dto';
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
}
