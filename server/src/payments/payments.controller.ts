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
import { CorrectPaymentDto } from './dto/correct-payment.dto';
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

  /**
   * Correct a wrong amount on a manual payment (e.g. cashier typed an
   * extra zero). Reverses the wrong payment and re-posts it at the right
   * amount. Allowed for CEO / Branch Director / Administrator — non-CEO
   * callers are bound to a 72h window (enforced in the service). The
   * service also rejects gateway payments and funds already spent on
   * lessons. A `reason` is mandatory and lands in the audit trail.
   */
  @Post(':id/correct')
  @Roles('CEO', 'Branch Director', 'Administrator')
  correct(
    @Param('id') id: string,
    @Body() dto: CorrectPaymentDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('roles') roles: string[],
  ) {
    return this.paymentsService.correctAmount(
      id,
      dto,
      userId,
      companyId,
      roles,
    );
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

  /**
   * Preview "what will this payment buy?" — pure projection over the
   * student's current balance and prepaid state. No mutation. Used by the
   * RecordPaymentDialog to show admins a live breakdown
   * (debt repaid → new cycles → leftover balance) as they type the amount.
   */
  @Get('preview')
  preview(
    @Query('studentId', ParseIntPipe) studentId: number,
    @Query('amount', ParseIntPipe) amount: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.paymentsService.previewPayment(studentId, amount, companyId);
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
