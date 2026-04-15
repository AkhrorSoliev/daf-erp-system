import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { RefundsService } from './refunds.service';
import { CreateRefundDto } from './dto/create-refund.dto';
import { ProcessRefundDto } from './dto/process-refund.dto';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';

@Controller('refunds')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director')
export class RefundsController {
  constructor(private refundsService: RefundsService) {}

  @Post()
  @Roles('CEO', 'Branch Director', 'Administrator')
  create(
    @Body() dto: CreateRefundDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.refundsService.create(dto, userId, companyId);
  }

  @Get()
  findAll(@CurrentUser('companyId') companyId: number) {
    return this.refundsService.findAll(companyId);
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
