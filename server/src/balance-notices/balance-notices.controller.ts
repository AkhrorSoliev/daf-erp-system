import {
  Body,
  Controller,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';
import { BalanceNoticesService } from './balance-notices.service';
import { CreateBalanceNoticeDto } from './dto/create-balance-notice.dto';

/** «Xabar berish» from the «Qaytariladigan pul» drawer (ADR-0076). Not for the Cashier. */
@Controller('students')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director', 'Administrator')
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
