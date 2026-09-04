import { Injectable } from '@nestjs/common';
import { StudentStatus } from '@prisma/client';
import { PaymentMethod, PaymentSource, Prisma } from '@prisma/client';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { CorrectPaymentDto } from './dto/correct-payment.dto';
import { PaymentQueryDto } from './dto/payment-query.dto';
import { PaymentsWriteService } from './payments-write.service';
import { PaymentsReadService } from './payments-read.service';
import { PaymentsDebtorsService } from './payments-debtors.service';
import { PaymentsPreviewService } from './payments-preview.service';
import { ReportBranchIds } from '../common/finance/report-branch-scope';

@Injectable()
export class PaymentsService {
  constructor(
    private write: PaymentsWriteService,
    private read: PaymentsReadService,
    private debtors: PaymentsDebtorsService,
    private preview: PaymentsPreviewService,
  ) {}

  // Writes
  create(dto: CreatePaymentDto, userId: number, companyId: number) {
    return this.write.create(dto, userId, companyId);
  }
  reverse(
    id: string,
    params: { reason?: string; performedById?: number; companyId: number },
  ) {
    return this.write.reverse(id, params);
  }
  correctAmount(
    id: string,
    dto: CorrectPaymentDto,
    userId: number,
    companyId: number,
    roles: string[],
  ) {
    return this.write.correctAmount(id, dto, userId, companyId, roles);
  }
  resolveStudentBranchId(
    studentId: number,
    companyId: number,
    outerTx?: Prisma.TransactionClient,
  ) {
    return this.write.resolveStudentBranchId(studentId, companyId, outerTx);
  }
  createFromExternal(
    params: {
      studentId: number;
      contractId?: string;
      amount: number;
      method: PaymentMethod;
      externalId: string;
      source: PaymentSource;
      providerFee?: number;
      providerFeePercent?: number;
      companyId: number;
      branchId?: number;
      performedById?: number;
      note?: string;
    },
    outerTx?: Prisma.TransactionClient,
  ) {
    return this.write.createFromExternal(params, outerTx);
  }

  // Reads — `branchIds` is required all the way through the facade. This is the
  // call site that used to drop it (`this.read.findAll(query, companyId)`) and
  // silently serve every branch's payments.
  findAll(
    query: PaymentQueryDto,
    companyId: number,
    branchIds: ReportBranchIds,
  ) {
    return this.read.findAll(query, companyId, branchIds);
  }
  findOne(id: string, companyId: number, branchIds: ReportBranchIds) {
    return this.read.findOne(id, companyId, branchIds);
  }
  findByStudent(
    studentId: number,
    query: PaymentQueryDto,
    companyId: number,
    branchIds: ReportBranchIds,
  ) {
    return this.read.findByStudent(studentId, query, companyId, branchIds);
  }

  // Debtors
  getDebtors(
    companyId: number,
    query: {
      branchId?: number;
      page?: number;
      pageSize?: number;
      search?: string;
      sortBy?: 'balance' | 'firstName' | 'lastName' | 'debtSince';
      order?: 'asc' | 'desc';
      promise?: ('has_open' | 'overdue')[];
      status?: StudentStatus | 'all';
      userId: number;
      roles: string[];
    },
  ) {
    return this.debtors.getDebtors(companyId, query);
  }
  getDebtorSummary(
    companyId: number,
    query: {
      branchId?: number;
      status?: StudentStatus | 'all';
      userId: number;
      roles: string[];
    },
  ) {
    return this.debtors.getDebtorSummary(companyId, query);
  }
  getPending(
    companyId: number,
    query: { branchIds: ReportBranchIds; page?: number; pageSize?: number },
  ) {
    return this.debtors.getPending(companyId, query);
  }
  getDebtorsForGroup(
    groupId: string,
    companyId: number,
    branchIds: ReportBranchIds,
  ) {
    return this.debtors.getDebtorsForGroup(groupId, companyId, branchIds);
  }

  // Preview
  previewPayment(
    studentId: number,
    amount: number,
    companyId: number,
    branchIds: ReportBranchIds,
  ) {
    return this.preview.preview(studentId, amount, companyId, branchIds);
  }
}
