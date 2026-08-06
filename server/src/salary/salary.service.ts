import { Injectable } from '@nestjs/common';
import { SalaryPaymentStatus } from '@prisma/client';
import {
  CreateSalaryConfigDto,
  GlobalSalaryConfigDto,
  UpdateSalaryConfigDto,
} from './dto/salary-config.dto';
import { SalaryPaymentQueryDto } from './dto/salary-query.dto';
import { SalaryConfigService } from './salary-config.service';
import { SalaryAccrualService } from './salary-accrual.service';
import { SalarySummaryService } from './salary-summary.service';
import {
  SalaryOverviewService,
  SalaryOverviewQuery,
} from './salary-overview.service';
import {
  SalaryMonthlyService,
  SalaryMonthlyQuery,
} from './salary-monthly.service';
import { SalaryCalculationService } from './salary-calculation.service';
import { SalaryPaymentService } from './salary-payment.service';
import { SalarySettleMonthService } from './salary-settle-month.service';
import { SettleMonthDto } from './dto/settle-month.dto';

@Injectable()
export class SalaryService {
  constructor(
    private config: SalaryConfigService,
    private accrual: SalaryAccrualService,
    private summary: SalarySummaryService,
    private overview: SalaryOverviewService,
    private monthly: SalaryMonthlyService,
    private calculation: SalaryCalculationService,
    private payment: SalaryPaymentService,
    private settleMonthService: SalarySettleMonthService,
  ) {}

  // Config
  getConfig(userId: number, companyId: number) {
    return this.config.getConfig(userId, companyId);
  }
  getConfigsForUsers(userIds: number[], companyId: number) {
    return this.config.getConfigsForUsers(userIds, companyId);
  }
  getConfigHistory(userId: number, companyId: number) {
    return this.config.getHistory(userId, companyId);
  }
  createConfig(
    dto: CreateSalaryConfigDto,
    companyId: number,
    changedById?: number,
  ) {
    return this.config.createConfig(dto, companyId, changedById);
  }
  applyGlobalConfig(
    dto: GlobalSalaryConfigDto,
    companyId: number,
    changedById?: number,
  ) {
    return this.config.applyGlobalConfig(dto, companyId, changedById);
  }
  updateConfig(
    id: string,
    dto: UpdateSalaryConfigDto,
    companyId: number,
    changedById?: number,
  ) {
    return this.config.updateConfig(id, dto, companyId, changedById);
  }

  // Accrual reads (writes go through SalaryAccrualService directly from
  // LessonBillingService — keeping the facade thin to one responsibility).
  getAccruals(userId: number, companyId: number) {
    return this.accrual.getAccruals(userId, companyId);
  }

  // Summary
  getTeacherSalarySummary(teacherId: number, companyId: number) {
    return this.summary.getTeacherSalarySummary(teacherId, companyId);
  }

  // Overview — live per-teacher current-salary list ("Ustozlar oyligi").
  getOverview(
    query: SalaryOverviewQuery,
    companyId: number,
    performedById: number,
  ) {
    return this.overview.getOverview(query, companyId, performedById);
  }

  // Monthly report — one row per teacher for a selected month ("Ustozlar
  // oyligi": to'liq ishlangan / o'quvchilar to'lagan / qo'shilishi kerak / avans).
  getMonthly(
    query: SalaryMonthlyQuery,
    companyId: number,
    performedById: number,
  ) {
    return this.monthly.getMonthly(query, companyId, performedById);
  }

  // The same monthly pass narrowed to ONE user — backs the profile "Ish haqi"
  // tab, the profile card and the lehrer portal, so those screens can never
  // disagree with the /payments/salary table.
  getMonthlyForUser(
    userId: number,
    query: SalaryMonthlyQuery,
    companyId: number,
    performedById: number,
  ) {
    return this.monthly.getMonthlyForUser(
      userId,
      query,
      companyId,
      performedById,
    );
  }

  // Per-teacher advance breakdown for the salary "Avans" cell drawer.
  getAdvancesForUser(
    userId: number,
    query: SalaryMonthlyQuery,
    companyId: number,
    performedById: number,
  ) {
    return this.monthly.getAdvancesForUser(
      userId,
      query,
      companyId,
      performedById,
    );
  }

  // Calculation
  calculateMonthlySalaries(companyId: number, opts?: { asOfDate?: Date }) {
    return this.calculation.calculateMonthlySalaries(companyId, opts);
  }
  previewPeriod(companyId: number, asOfDate: Date) {
    return this.calculation.previewPeriod(companyId, asOfDate);
  }

  // Payment
  findPayments(query: SalaryPaymentQueryDto, companyId: number) {
    return this.payment.findPayments(query, companyId);
  }
  getMatrix(
    query: { from: string; to: string },
    companyId: number,
    performedById: number,
  ) {
    return this.payment.getMatrix(query, companyId, performedById);
  }
  approvePayment(id: string, companyId: number) {
    return this.payment.approvePayment(id, companyId);
  }
  payPayment(id: string, performedById: number, companyId: number) {
    return this.payment.payPayment(id, performedById, companyId);
  }
  batchPay(
    params: {
      companyId: number;
      branchId?: number;
      userIds?: number[];
      statuses?: SalaryPaymentStatus[];
    },
    performedById: number,
  ) {
    return this.payment.batchPay(params, performedById);
  }

  // Month-wide settle for payroll handed over outside the system.
  previewSettleMonth(
    month: string | undefined,
    companyId: number,
    performedById: number,
  ) {
    return this.settleMonthService.preview(month, companyId, performedById);
  }
  settleMonth(dto: SettleMonthDto, companyId: number, performedById: number) {
    return this.settleMonthService.settle(dto, companyId, performedById);
  }
}
