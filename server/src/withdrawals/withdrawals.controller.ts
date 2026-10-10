import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators';
import { Can } from '../common/permissions/access.decorators';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';
import { WithdrawalsService } from './withdrawals.service';

@Controller('withdrawals')
@Can('balance.withdraw')
export class WithdrawalsController {
  constructor(private withdrawalsService: WithdrawalsService) {}

  @Get('preview/:studentId')
  preview(
    @Param('studentId', ParseIntPipe) studentId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.withdrawalsService.preview(studentId, companyId);
  }

  @Post()
  create(
    @Body() dto: CreateWithdrawalDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.withdrawalsService.create(dto, userId, companyId);
  }
}
