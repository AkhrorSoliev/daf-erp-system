import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentQueryDto } from './dto/payment-query.dto';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';

@Controller('payments')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director', 'Administrator', 'Cashier')
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @Post()
  create(
    @Body() dto: CreatePaymentDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.paymentsService.create(dto, userId, companyId);
  }

  @Get()
  findAll(
    @Query() query: PaymentQueryDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.paymentsService.findAll(query, companyId);
  }

  @Get('debtors')
  getDebtors(
    @Query() query: PaymentQueryDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.paymentsService.getDebtors(companyId, {
      branchId: query.branchId,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Get('pending-students')
  getPending(
    @Query() query: PaymentQueryDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.paymentsService.getPending(companyId, {
      branchId: query.branchId,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.paymentsService.findOne(id, companyId);
  }

  @Get('student/:studentId')
  findByStudent(
    @Param('studentId', ParseIntPipe) studentId: number,
    @Query() query: PaymentQueryDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.paymentsService.findByStudent(studentId, query, companyId);
  }
}
