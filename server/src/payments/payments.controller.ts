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
import { AttachExternalPaymentDto } from './dto/attach-external.dto';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';
import { PaymentSource } from '@prisma/client';

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

  /**
   * Admin "attach external transaction" flow: operator looks up a Payme/Click
   * transaction in the provider's dashboard (or scans a receipt QR) and posts
   * it here to bind the real payment to the student's balance. Idempotent via
   * Payment.(method, externalId, companyId) unique.
   */
  /**
   * Reverse a posted payment. CEO-only because it unwinds cash that has
   * already been recorded. Follows the append-only ledger rule: a reversal
   * Transaction is written rather than editing the Payment row.
   */
  @Post(':id/reverse')
  @Roles('CEO')
  reverse(
    @Param('id') id: string,
    @Body('reason') reason: string | undefined,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.paymentsService.reverse(id, {
      reason,
      performedById: userId,
      companyId,
    });
  }

  @Post('attach-external')
  attachExternal(
    @Body() dto: AttachExternalPaymentDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.paymentsService.createFromExternal({
      studentId: dto.studentId,
      contractId: dto.contractId,
      amount: dto.amount,
      method: dto.method,
      externalId: dto.externalId,
      source: PaymentSource.MANUAL_ATTACH,
      providerFee: dto.providerFee,
      companyId,
      branchId: dto.branchId,
      performedById: userId,
      note: dto.note,
    });
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

  @Get('debtors/group/:groupId')
  getDebtorsForGroup(
    @Param('groupId') groupId: string,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.paymentsService.getDebtorsForGroup(groupId, companyId);
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
