import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';
import { WithdrawalsService } from './withdrawals.service';

@Controller('withdrawals')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director', 'Administrator')
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
