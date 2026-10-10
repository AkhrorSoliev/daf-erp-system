import { Body, Controller, Param, ParseIntPipe, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators';
import { Can } from '../common/permissions/access.decorators';
import { BalanceNoticesService } from './balance-notices.service';
import { CreateBalanceNoticeDto } from './dto/create-balance-notice.dto';

/**
 * «Xabar berish» from the «Qaytariladigan pul» drawer (ADR-0077). Not for the
 * Cashier. A notice is what opens a withdrawal later, so it is the withdrawal's
 * capability.
 */
@Controller('students')
@Can('balance.withdraw')
export class BalanceNoticesController {
  constructor(private readonly notices: BalanceNoticesService) {}

  @Post(':id/balance-notices')
  create(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateBalanceNoticeDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.notices.create(id, dto, userId, companyId);
  }
}
