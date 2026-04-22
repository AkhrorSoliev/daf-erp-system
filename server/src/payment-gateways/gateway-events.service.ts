import { Injectable } from '@nestjs/common';
import { PaymentMethod, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface GatewayEventFilters {
  companyId: number;
  provider?: PaymentMethod;
  processed?: boolean;
  signatureValid?: boolean;
  search?: string;
  startDate?: string;
  endDate?: string;
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
            where: { studentId: { in: studentIds }, companyId: filters.companyId },
            select: { paymeId: true },
          }),
          this.prisma.clickTransaction.findMany({
            where: { studentId: { in: studentIds }, companyId: filters.companyId },
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
      ...(filters.provider && { provider: filters.provider }),
      ...(filters.processed !== undefined && { processed: filters.processed }),
      ...(filters.signatureValid !== undefined && {
        signatureValid: filters.signatureValid,
      }),
      ...(externalIdFilter !== null && { externalId: { in: externalIdFilter } }),
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

    // Enrich with student info per event by looking up the provider transaction.
    const enriched = await Promise.all(
      events.map(async (e) => {
        const student = await this.resolveStudent(
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

  private async resolveStudent(
    provider: PaymentMethod,
    externalId: string,
    payload: Prisma.JsonValue,
    companyId: number,
  ): Promise<{ id: number; firstName: string; lastName: string } | null> {
    let studentId: number | null = null;

    if (provider === 'PAYME') {
      // First try matching by paymeId (works for CreateTransaction, PerformTransaction, etc.)
      const txn = await this.prisma.paymeTransaction.findFirst({
        where: { paymeId: externalId, companyId },
        select: { studentId: true },
      });
      studentId = txn?.studentId ?? null;

      // Fallback: CheckPerformTransaction / GetStatement don't carry a paymeId —
      // extract student_id directly from params.account.
      if (studentId === null && payload && typeof payload === 'object') {
        const raw = (payload as any)?.params?.account?.student_id;
        const asNum = Number(raw);
        if (Number.isFinite(asNum)) studentId = asNum;
      }
    } else if (provider === 'CLICK') {
      const id = Number(externalId);
      if (!Number.isNaN(id)) {
        const txn = await this.prisma.clickTransaction.findFirst({
          where: { clickTransId: BigInt(id), companyId },
          select: { studentId: true },
        });
        studentId = txn?.studentId ?? null;
      }

      // Fallback: Click carries merchant_trans_id = studentId on every call.
      if (studentId === null && payload && typeof payload === 'object') {
        const raw = (payload as any)?.merchant_trans_id;
        const asNum = Number(raw);
        if (Number.isFinite(asNum)) studentId = asNum;
      }
    }

    if (studentId === null) return null;

    const student = await this.prisma.student.findFirst({
      where: { id: studentId, companyId },
      select: { id: true, firstName: true, lastName: true },
    });
    return student;
  }
}
