import { Injectable } from '@nestjs/common';
import { PaymentMethod, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { equalsOrIn } from '../common/dto/to-array';

export interface GatewayEventFilters {
  companyId: number;
  provider?: PaymentMethod[];
  processed?: boolean;
  signatureValid?: boolean;
  search?: string;
  startDate?: string;
  endDate?: string;
  hideChecks?: boolean;
  page: number;
  pageSize: number;
}

/**
 * Read API for PaymentGatewayEvent audit log.
 * Enriches events with student info by joining on the provider's transaction table
 * (PaymeTransaction/ClickTransaction) via externalId.
 */
@Injectable()
export class GatewayEventsService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters: GatewayEventFilters) {
    // Student search: resolve search term → matching studentIds → paymeIds/clickTransIds
    // → filter PaymentGatewayEvent.externalId by that set.
    // Search matches numeric student ID exactly, or firstName/lastName contains.
    let externalIdFilter: string[] | null = null;
    if (filters.search) {
      const term = filters.search.trim();
      const asNumber = Number(term);
      const studentWhere: Prisma.StudentWhereInput = Number.isFinite(asNumber)
        ? { id: asNumber, companyId: filters.companyId }
        : {
            companyId: filters.companyId,
            OR: [
              { firstName: { contains: term, mode: 'insensitive' } },
              { lastName: { contains: term, mode: 'insensitive' } },
            ],
          };

      const students = await this.prisma.student.findMany({
        where: studentWhere,
        select: { id: true },
      });
      const studentIds = students.map((s) => s.id);

      if (studentIds.length === 0) {
        externalIdFilter = []; // no matches → empty result
      } else {
        const [paymeTxns, clickTxns] = await Promise.all([
          this.prisma.paymeTransaction.findMany({
            where: {
              studentId: { in: studentIds },
              companyId: filters.companyId,
            },
            select: { paymeId: true },
          }),
          this.prisma.clickTransaction.findMany({
            where: {
              studentId: { in: studentIds },
              companyId: filters.companyId,
            },
            select: { clickTransId: true },
          }),
        ]);
        externalIdFilter = [
          ...paymeTxns.map((t) => t.paymeId),
          ...clickTxns.map((t) => String(t.clickTransId)),
        ];
      }
    }

    const where: Prisma.PaymentGatewayEventWhereInput = {
      companyId: filters.companyId,
      ...(filters.provider?.length && {
        provider: equalsOrIn(filters.provider),
      }),
      ...(filters.processed !== undefined && { processed: filters.processed }),
      ...(filters.signatureValid !== undefined && {
        signatureValid: filters.signatureValid,
      }),
      // Noise filter — Payme's polling/audit methods carry no money movement
      // and would otherwise dominate the log. CEO-visible by default hides them.
      ...(filters.hideChecks && {
        eventType: {
          notIn: [
            'CheckPerformTransaction',
            'CheckTransaction',
            'GetStatement',
          ],
        },
      }),
      ...(externalIdFilter !== null && {
        externalId: { in: externalIdFilter },
      }),
      ...((filters.startDate || filters.endDate) && {
        createdAt: {
          ...(filters.startDate && { gte: new Date(filters.startDate) }),
          ...(filters.endDate && { lte: new Date(filters.endDate) }),
        },
      }),
    };

    // Two parallel reads — no need for $transaction (atomicity isn't required for listing).
    // Neon serverless can't reliably start new interactive transactions under load.
    const [events, total] = await Promise.all([
      this.prisma.paymentGatewayEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      this.prisma.paymentGatewayEvent.count({ where }),
    ]);

    // Enrich with student + amount per event by looking up the provider transaction.
    // Amount is resolved from the provider transaction table so events like
    // PerformTransaction (whose webhook payload is just `{id}`) still show an
    // amount in the UI instead of a dash.
    const enriched = await Promise.all(
      events.map(async (e) => {
        const { student, amount } = await this.resolveStudentAndAmount(
          e.provider,
          e.externalId,
          e.payload,
          filters.companyId,
        );
        return {
          id: e.id,
          provider: e.provider,
          externalId: e.externalId,
          eventType: e.eventType,
          payload: e.payload,
          signatureValid: e.signatureValid,
          processed: e.processed,
          processedAt: e.processedAt,
          errorMessage: e.errorMessage,
          createdAt: e.createdAt,
          student,
          amount,
        };
      }),
    );

    return {
      data: enriched,
      total,
      page: filters.page,
      pageSize: filters.pageSize,
    };
  }

  private async resolveStudentAndAmount(
    provider: PaymentMethod,
    externalId: string,
    payload: Prisma.JsonValue,
    companyId: number,
  ): Promise<{
    student: { id: number; firstName: string; lastName: string } | null;
    amount: number | null;
  }> {
    let studentId: number | null = null;
    let amount: number | null = null;

    if (provider === 'PAYME') {
      // First try matching by paymeId (works for CreateTransaction, PerformTransaction, etc.)
      const txn = await this.prisma.paymeTransaction.findFirst({
        where: { paymeId: externalId, companyId },
        select: { studentId: true, amountInSom: true },
      });
      studentId = txn?.studentId ?? null;
      amount = txn?.amountInSom ?? null;

      // Fallback: CheckPerformTransaction / GetStatement don't carry a paymeId —
      // extract student_id + amount directly from the payload.
      if (payload && typeof payload === 'object') {
        const params = (payload as any)?.params;
        if (studentId === null) {
          const rawId = params?.account?.student_id;
          const asNum = Number(rawId);
          if (Number.isFinite(asNum)) studentId = asNum;
        }
        if (amount === null) {
          const rawAmount = params?.amount;
          if (typeof rawAmount === 'number')
            amount = Math.round(rawAmount / 100);
        }
      }
    } else if (provider === 'CLICK') {
      const id = Number(externalId);
      if (!Number.isNaN(id)) {
        const txn = await this.prisma.clickTransaction.findFirst({
          where: { clickTransId: BigInt(id), companyId },
          select: { studentId: true, amountInSom: true },
        });
        studentId = txn?.studentId ?? null;
        amount = txn?.amountInSom ?? null;
      }

      // Fallback: Click carries merchant_trans_id = studentId + amount on every call.
      if (payload && typeof payload === 'object') {
        if (studentId === null) {
          const rawId = (payload as any)?.merchant_trans_id;
          const asNum = Number(rawId);
          if (Number.isFinite(asNum)) studentId = asNum;
        }
        if (amount === null) {
          const rawAmount = (payload as any)?.amount;
          if (typeof rawAmount === 'number') amount = Math.floor(rawAmount);
        }
      }
    }

    if (studentId === null) return { student: null, amount };

    const student = await this.prisma.student.findFirst({
      where: { id: studentId, companyId },
      select: { id: true, firstName: true, lastName: true },
    });
    return { student, amount };
  }
}
