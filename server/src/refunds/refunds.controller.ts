import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { RefundsService } from './refunds.service';
import { QuickRefundDto } from './dto/quick-refund.dto';
import { HandOverRefundDto } from './dto/hand-over-refund.dto';
import { CancelRefundDto } from './dto/cancel-refund.dto';
import { RefundListQueryDto } from './dto/refund-list-query.dto';
import { BranchScope, CurrentUser } from '../common/decorators';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';
import { Can } from '../common/permissions/access.decorators';

@Controller('refunds')
export class RefundsController {
  constructor(private refundsService: RefundsService) {}

  @Post('quick')
  @Can('refunds.create')
  quickRefund(
    @Body() dto: QuickRefundDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.refundsService.quickRefund(dto, userId, companyId);
  }

  @Get('preview/:studentId')
  @Can('refunds.create')
  previewRefund(
    @Param('studentId', ParseIntPipe) studentId: number,
    @CurrentUser('companyId') companyId: number,
    @Query('enrollmentId') enrollmentId?: string,
  ) {
    return this.refundsService.previewRefund(
      studentId,
      companyId,
      enrollmentId,
    );
  }

  /**
   * History page (ADR-0077): `?status=COMPLETED,REJECTED&page&pageSize`. Read by
   * the Cashier too. Was company-wide: a Namangan director read every Fargona
   * refund, with the student's name and the amount on each row.
   */
  @Get()
  @Can('refunds.create', 'refunds.hand-over')
  findAll(
    @Query() q: RefundListQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.refundsService.findAll(companyId, scope, q);
  }

  /** «Berildi» — the money leaves the chosen drawer (ADR-0077). */
  @Post(':id/hand-over')
  @Can('refunds.hand-over')
  handOver(
    @Param('id') id: string,
    @Body() dto: HandOverRefundDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.refundsService.handOver(id, dto, userId, companyId);
  }

  /** «Bekor qilish» of a request not yet handed over (ADR-0077). */
  @Post(':id/cancel')
  @Can('refunds.cancel')
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelRefundDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.refundsService.cancel(id, dto, userId, companyId);
  }

  /**
   * Reverse a COMPLETED refund. Gated by `money.undo`: unwinds a payout
   * that has already moved money out of the center. Ledger-first — the
   * Refund row stays, a reversal Transaction is written.
   */
  @Post(':id/reverse')
  @Can('money.undo')
  reverse(
    @Param('id') id: string,
    @Body('reason') reason: string | undefined,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.refundsService.reverse(id, {
      reason,
      performedById: userId,
      companyId,
    });
  }
}
