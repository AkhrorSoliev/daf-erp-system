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
  ) {
    return this.refundsService.process(id, dto, userId);
  }
}
