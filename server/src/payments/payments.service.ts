import { Injectable } from '@nestjs/common';
import { PaymentMethod, PaymentSource, Prisma } from '@prisma/client';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentQueryDto } from './dto/payment-query.dto';
import { PaymentsWriteService } from './payments-write.service';
import { PaymentsReadService } from './payments-read.service';
import { PaymentsDebtorsService } from './payments-debtors.service';

@Injectable()
export class PaymentsService {
  constructor(
    private write: PaymentsWriteService,
    private read: PaymentsReadService,
    private debtors: PaymentsDebtorsService,
  ) {}

  // Writes
  create(dto: CreatePaymentDto, userId: number, companyId: number) {
    return this.write.create(dto, userId, companyId);
  }
  reverse(
    id: string,
    params: { reason?: string; performedById: number; companyId: number },
  ) {
    return this.write.reverse(id, params);
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

  // Reads
  findAll(query: PaymentQueryDto, companyId: number) {
    return this.read.findAll(query, companyId);
  }
  findOne(id: string, companyId: number) {
    return this.read.findOne(id, companyId);
  }
  findByStudent(studentId: number, query: PaymentQueryDto, companyId: number) {
    return this.read.findByStudent(studentId, query, companyId);
  }

  // Debtors
  getDebtors(
    companyId: number,
    query: { branchId?: number; page?: number; pageSize?: number },
  ) {
    return this.debtors.getDebtors(companyId, query);
  }
  getPending(
    companyId: number,
    query: { branchId?: number; page?: number; pageSize?: number },
  ) {
    return this.debtors.getPending(companyId, query);
  }
  getDebtorsForGroup(groupId: string, companyId: number) {
    return this.debtors.getDebtorsForGroup(groupId, companyId);
  }
}
