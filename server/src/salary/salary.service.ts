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
import { SalaryCalculationService } from './salary-calculation.service';
import { SalaryPaymentService } from './salary-payment.service';

@Injectable()
export class SalaryService {
  constructor(
    private config: SalaryConfigService,
    private accrual: SalaryAccrualService,
    private summary: SalarySummaryService,
    private calculation: SalaryCalculationService,
    private payment: SalaryPaymentService,
  ) {}

  // Config
  getConfig(userId: number, companyId: number) {
    return this.config.getConfig(userId, companyId);
  }
  createConfig(dto: CreateSalaryConfigDto, companyId: number) {
    return this.config.createConfig(dto, companyId);
  }
  applyGlobalConfig(dto: GlobalSalaryConfigDto, companyId: number) {
    return this.config.applyGlobalConfig(dto, companyId);
  }
  updateConfig(id: string, dto: UpdateSalaryConfigDto, companyId: number) {
    return this.config.updateConfig(id, dto, companyId);
  }

  // Accrual
  createAccrual(params: {
    teacherId: number;
    studentId: number;
    groupId: string;
    attendanceId: string;
    lessonDate: Date;
    perLessonCost: number;
    companyId: number;
    deductionTransactionId?: string | null;
  }) {
    return this.accrual.createAccrual(params);
  }
  getAccruals(userId: number, companyId: number) {
    return this.accrual.getAccruals(userId, companyId);
  }

  // Summary
  getTeacherSalarySummary(teacherId: number, companyId: number) {
    return this.summary.getTeacherSalarySummary(teacherId, companyId);
  }

  // Calculation
  calculateMonthlySalaries(companyId: number) {
    return this.calculation.calculateMonthlySalaries(companyId);
  }

  // Payment
  findPayments(query: SalaryPaymentQueryDto, companyId: number) {
    return this.payment.findPayments(query, companyId);
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
}
