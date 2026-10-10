import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { CorrectPaymentDto } from './dto/correct-payment.dto';
import { PaymentQueryDto } from './dto/payment-query.dto';
import { AttachExternalPaymentDto } from './dto/attach-external.dto';
import { CurrentUser, BranchScope } from '../common/decorators';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';
import { Can } from '../common/permissions/access.decorators';
import { PaymentSource } from '@prisma/client';

@Controller('payments')
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @Post()
  @Can('payments.create')
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
   * Reverse a posted payment. Gated by `money.undo` because it unwinds cash
   * that has already been recorded. Follows the append-only ledger rule: a
   * reversal Transaction is written rather than editing the Payment row.
   */
  @Post(':id/reverse')
  @Can('money.undo')
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
   * amount. Gated by `payments.correct`; callers other than the CEO are
   * bound to a 72h window (enforced in the service). The service also
   * rejects gateway payments and funds already spent on lessons. A
   * `reason` is mandatory and lands in the audit trail.
   */
  @Post(':id/correct')
  @Can('payments.correct')
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
  @Can('payments.create')
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
  @Can('payments.view')
  findAll(
    @Query() query: PaymentQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() branchIds: ReportBranchIds,
  ) {
    return this.paymentsService.findAll(query, companyId, branchIds);
  }

  /**
   * Preview "what will this payment buy?" — pure projection over the
   * student's current balance and prepaid state. No mutation. Used by the
   * RecordPaymentDialog to show admins a live breakdown
   * (debt repaid → new cycles → leftover balance) as they type the amount.
   */
  @Get('preview')
  @Can('payments.create')
  preview(
    @Query('studentId', ParseIntPipe) studentId: number,
    @Query('amount', ParseIntPipe) amount: number,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() branchIds: ReportBranchIds,
  ) {
    // The projection reports the student's balance and debt, so it is confined
    // the same way the student list is.
    return this.paymentsService.previewPayment(
      studentId,
      amount,
      companyId,
      branchIds,
    );
  }

  @Get('debtors')
  @Can('debt.view')
  getDebtors(
    @Query() query: PaymentQueryDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('roles') roles: string[],
  ) {
    return this.paymentsService.getDebtors(companyId, {
      branchId: query.branchId,
      page: query.page,
      pageSize: query.pageSize,
      search: query.search,
      sortBy: query.sortBy,
      order: query.order,
      promise: query.promise,
      status: query.studentStatus ?? 'all',
      userId,
      roles,
    });
  }

  /**
   * Card-ready aggregate for the debtors page: the debt as two numbers
   * (`split`, ADR-0059) and the open / overdue payment-promise counts. Same
   * branch scope as the list, but NOT its filters: the cards describe the whole
   * scope, so the list's `studentStatus` is not read here.
   */
  @Get('debtors/summary')
  @Can('debt.view', 'dashboard.view')
  getDebtorSummary(
    @Query() query: PaymentQueryDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('roles') roles: string[],
  ) {
    return this.paymentsService.getDebtorSummary(companyId, {
      branchId: query.branchId,
      userId,
      roles,
    });
  }

  @Get('pending-students')
  @Can('payments.view')
  getPending(
    @Query() query: PaymentQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() branchIds: ReportBranchIds,
  ) {
    return this.paymentsService.getPending(companyId, {
      branchIds,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Get('debtors/group/:groupId')
  @Can('debt.view')
  getDebtorsForGroup(
    @Param('groupId') groupId: string,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() branchIds: ReportBranchIds,
  ) {
    return this.paymentsService.getDebtorsForGroup(
      groupId,
      companyId,
      branchIds,
    );
  }

  @Get(':id')
  @Can('payments.view')
  findOne(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() branchIds: ReportBranchIds,
  ) {
    return this.paymentsService.findOne(id, companyId, branchIds);
  }

  @Get('student/:studentId')
  @Can('students.profile', 'payments.create')
  findByStudent(
    @Param('studentId', ParseIntPipe) studentId: number,
    @Query() query: PaymentQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() branchIds: ReportBranchIds,
  ) {
    return this.paymentsService.findByStudent(
      studentId,
      query,
      companyId,
      branchIds,
    );
  }
}
