import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RefundsService } from './refunds.service';
import { ProcessRefundDto } from './dto/process-refund.dto';
import { QuickRefundDto } from './dto/quick-refund.dto';
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

  @Get()
  findAll(
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    // Was company-wide: a Namangan director read every Fargona refund, with the
    // student's name and the amount on each row.
    return this.refundsService.findAll(companyId, scope);
  }

  @Patch(':id/process')
  process(
    @Param('id') id: string,
    @Body() dto: ProcessRefundDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.refundsService.process(id, dto, userId, companyId);
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
