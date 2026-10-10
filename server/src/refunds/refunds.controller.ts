import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RefundsService } from './refunds.service';
import { QuickRefundDto } from './dto/quick-refund.dto';
import { HandOverRefundDto } from './dto/hand-over-refund.dto';
import { CancelRefundDto } from './dto/cancel-refund.dto';
import { RefundListQueryDto } from './dto/refund-list-query.dto';
import { BranchScope, CurrentUser, Roles } from '../common/decorators';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';
import { RolesGuard } from '../common/guards';

@Controller('refunds')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director', 'Administrator')
export class RefundsController {
  constructor(private refundsService: RefundsService) {}

  @Post('quick')
  @Roles('CEO', 'Branch Director', 'Administrator')
  quickRefund(
    @Body() dto: QuickRefundDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.refundsService.quickRefund(dto, userId, companyId);
  }

  @Get('preview/:studentId')
  @Roles('CEO', 'Branch Director', 'Administrator')
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
   * History page (ADR-0076): `?status=COMPLETED,REJECTED&page&pageSize`. Read by
   * the Cashier too. Was company-wide: a Namangan director read every Fargona
   * refund, with the student's name and the amount on each row.
   */
  @Get()
  @Roles('CEO', 'Branch Director', 'Administrator', 'Cashier')
  findAll(
    @Query() q: RefundListQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.refundsService.findAll(companyId, scope, q);
  }

  /** «Berildi» — the money leaves the chosen drawer (ADR-0076). */
  @Post(':id/hand-over')
  @Roles('CEO', 'Branch Director', 'Administrator', 'Cashier')
  handOver(
    @Param('id') id: string,
    @Body() dto: HandOverRefundDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.refundsService.handOver(id, dto, userId, companyId);
  }

  /** «Bekor qilish» of a request not yet handed over (ADR-0076). */
  @Post(':id/cancel')
  @Roles('CEO', 'Branch Director')
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelRefundDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.refundsService.cancel(id, dto, userId, companyId);
  }

  /**
   * Reverse a COMPLETED refund. CEO-only: unwinds a payout that has
   * already moved money out of the center. Ledger-first — the Refund
   * row stays, a reversal Transaction is written.
   */
  @Post(':id/reverse')
  @Roles('CEO')
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
