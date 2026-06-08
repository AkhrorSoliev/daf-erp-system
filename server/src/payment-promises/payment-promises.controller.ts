import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { PaymentPromisesService } from './payment-promises.service';
import { CreatePaymentPromiseDto } from './dto/create-payment-promise.dto';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';

@Controller('payment-promises')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director', 'Administrator', 'Cashier')
export class PaymentPromisesController {
  constructor(private readonly promises: PaymentPromisesService) {}

  @Post()
  create(
    @Body() dto: CreatePaymentPromiseDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.promises.create(dto, userId, companyId);
  }

  @Patch(':id/cancel')
  cancel(
    @Param('id') id: string,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.promises.cancel(id, userId, companyId);
  }

  @Get()
  findByStudent(
    @Query('studentId', ParseIntPipe) studentId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.promises.findByStudent(studentId, companyId);
  }
}
