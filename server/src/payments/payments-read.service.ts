import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentStatus, Prisma } from '@prisma/client';
import { PaymentQueryDto } from './dto/payment-query.dto';
import {
  ReportBranchIds,
  branchIdWhere,
} from '../common/finance/report-branch-scope';

/**
 * Payment reads are branch-confined.
 *
 * `branchIds` is REQUIRED on every method here — deliberately no default. A
 * `= null` default would compile silently at any call site that forgot to pass
 * it and return every branch's payments; the missing argument must be a type
 * error instead. That is exactly how `PaymentsService.findAll` came to call
 * this with two arguments and serve the whole company.
 *
 * `null` still means "every branch", but only a caller that resolved the scope
 * can produce it (a CEO who picked no branch).
 *
 * NOTE on `branchId = null` rows: `branchIdWhere` compiles to `{ in: [...] }`,
 * which excludes them from every branch view. That is the intended
 * "unassigned" semantics — such a row belongs to no branch and appears only in
 * the company-wide view. In production `Payment.branchId` has zero nulls; the
 * six remaining null rows are on `CashMovement` and are deliberate.
 */
@Injectable()
export class PaymentsReadService {
  constructor(private prisma: PrismaService) {}

  async findAll(
    query: PaymentQueryDto,
    companyId: number,
    branchIds: ReportBranchIds,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    const where: Prisma.PaymentWhereInput = {
      companyId,
      // From the resolved scope, NOT `query.branchId`. The raw parameter was a
      // WIDENING filter: omitted it returned the whole company, and naming
      // another branch returned that branch's payments.
      ...branchIdWhere(branchIds),
      ...(query.studentId && { studentId: query.studentId }),
      ...(query.method && { method: query.method }),
      ...(query.status
        ? { status: query.status }
        : { status: { not: PaymentStatus.REVERSED } }),
      ...(query.startDate &&
        query.endDate && {
          createdAt: {
            gte: new Date(query.startDate),
            lte: new Date(query.endDate + 'T23:59:59.999Z'),
          },
        }),
    };

    const [data, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        select: {
          id: true,
          amount: true,
          method: true,
          status: true,
          source: true,
          receiptNumber: true,
          note: true,
          branchId: true,
          createdAt: true,
          student: { select: { id: true, firstName: true, lastName: true } },
          receivedBy: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.payment.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  async findOne(id: string, companyId: number, branchIds: ReportBranchIds) {
    // Out of scope reads as "not found" rather than 403: a 403 would confirm the
    // id exists in another branch, and the detail payload carries the student's
    // name and live balance.
    const payment = await this.prisma.payment.findFirst({
      where: { id, companyId, ...branchIdWhere(branchIds) },
      select: {
        id: true,
        amount: true,
        method: true,
        status: true,
        source: true,
        externalId: true,
        providerFee: true,
        providerFeePercent: true,
        receiptNumber: true,
        note: true,
        branchId: true,
        companyId: true,
        createdAt: true,
        student: {
          select: { id: true, firstName: true, lastName: true, balance: true },
        },
        contract: { select: { id: true, contractNumber: true } },
        receivedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!payment) {
      throw new NotFoundException("To'lov topilmadi");
    }
    return payment;
  }

  async findByStudent(
    studentId: number,
    query: PaymentQueryDto,
    companyId: number,
    branchIds: ReportBranchIds,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    const where: Prisma.PaymentWhereInput = {
      studentId,
      companyId,
      // Confined by the PAYMENT's branch, not the student's: a payment is
      // attributed at write time and that attribution is what the books use.
      ...branchIdWhere(branchIds),
      ...(query.method && { method: query.method }),
      ...(query.status
        ? { status: query.status }
        : { status: { not: PaymentStatus.REVERSED } }),
      ...(query.startDate &&
        query.endDate && {
          createdAt: {
            gte: new Date(query.startDate),
            lte: new Date(query.endDate + 'T23:59:59.999Z'),
          },
        }),
    };

    const [data, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        select: {
          id: true,
          amount: true,
          method: true,
          status: true,
          source: true,
          receiptNumber: true,
          note: true,
          createdAt: true,
          receivedBy: { select: { id: true, firstName: true, lastName: true } },
          contract: { select: { id: true, contractNumber: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.payment.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }
}
