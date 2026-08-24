import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentStatus, RefundStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildPaymentReceiptDoc,
  type PaymentReceiptInput,
} from './pdf/payment-template';
import {
  buildRefundReceiptDoc,
  type RefundReceiptInput,
} from './pdf/refund-template';
import { renderPdf } from './pdf/render';
import type { ReceiptVerificationDto } from './dto/verification.dto';

/**
 * On-demand receipt generation. Receipts are never persisted as PDFs —
 * they're built per request from the source DB rows so:
 *   - no R2 storage to manage,
 *   - design tweaks apply retroactively to old receipts,
 *   - the source of truth is always the Payment / Refund row itself.
 *
 * The only persistent artefact is `receiptCode` on the row — lazy-allocated
 * the first time the receipt is rendered, then frozen forever (idempotent).
 * Format mirrors `Contract.contractNumber` (DAF-YYYY-#####):
 *   - Payment → `R-YYYY-NNNNN`
 *   - Refund  → `Q-YYYY-NNNNN`  (Q = Qaytarish)
 */
@Injectable()
export class ReceiptsService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  // ──────────────────────────────────────────────────────────────────
  // PDF generation (called by controller)
  // ──────────────────────────────────────────────────────────────────

  async generatePaymentPdf(paymentId: string): Promise<Buffer> {
    const input = await this.loadPaymentInput(paymentId);
    return renderPdf(await buildPaymentReceiptDoc(input));
  }

  async generateRefundPdf(refundId: string): Promise<Buffer> {
    const input = await this.loadRefundInput(refundId);
    return renderPdf(await buildRefundReceiptDoc(input));
  }

  // ──────────────────────────────────────────────────────────────────
  // Verification (the QR target — lighter payload, no PDF render)
  // ──────────────────────────────────────────────────────────────────

  async loadPaymentVerification(
    paymentId: string,
  ): Promise<ReceiptVerificationDto> {
    const input = await this.loadPaymentInput(paymentId);
    return {
      kind: 'payment',
      receiptCode: input.receiptCode,
      reversed: input.payment.status === PaymentStatus.REVERSED,
      reversedReason:
        input.payment.status === PaymentStatus.REVERSED
          ? (input.payment.note ?? null)
          : null,
      amount: input.payment.amount,
      currency: 'UZS',
      date: input.payment.createdAt.toISOString(),
      studentName: `${input.student.firstName} ${input.student.lastName}`,
      studentId: input.student.id,
      groupName: input.groupName,
      branchName: input.branch?.name ?? null,
      companyName: input.company.name,
      receivedByName: input.receivedByName,
      pdfUrl: `${this.apiBaseUrl()}/api/receipts/payment/${paymentId}.pdf`,
    };
  }

  async loadRefundVerification(
    refundId: string,
  ): Promise<ReceiptVerificationDto> {
    const input = await this.loadRefundInput(refundId);
    return {
      kind: 'refund',
      receiptCode: input.receiptCode,
      // We only render docs for COMPLETED refunds, so by definition not
      // "reversed". If/when refund reversals get a public-facing flow
      // we'll surface that here.
      reversed: false,
      reversedReason: null,
      amount: input.refund.approvedAmount ?? input.refund.requestedAmount,
      currency: 'UZS',
      date: (input.refund.processedAt ?? input.refund.createdAt).toISOString(),
      studentName: `${input.student.firstName} ${input.student.lastName}`,
      studentId: input.student.id,
      groupName: input.groupName,
      branchName: null,
      companyName: input.company.name,
      receivedByName: input.processedByName,
      pdfUrl: `${this.apiBaseUrl()}/api/receipts/refund/${refundId}.pdf`,
    };
  }

  // ──────────────────────────────────────────────────────────────────
  // Internal: data fetching + receipt-code allocation
  // ──────────────────────────────────────────────────────────────────

  private async loadPaymentInput(
    paymentId: string,
  ): Promise<PaymentReceiptInput> {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId },
      include: {
        contract: { select: { contractNumber: true } },
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            balance: true,
          },
        },
        receivedBy: { select: { firstName: true, lastName: true } },
      },
    });
    if (!payment) {
      throw new NotFoundException("To'lov topilmadi");
    }

    // Branch fetched separately — Payment has no `branch` relation in
    // the schema, only `branchId`.
    const branch = payment.branchId
      ? await this.prisma.branch.findUnique({
          where: { id: payment.branchId },
          select: { id: true, name: true, address: true, phone: true },
        })
      : null;

    // Best-effort group context: most recent active enrollment for this student.
    // We pull schedule + teachers so the receipt can show "kurs vaqti" and "o'qituvchi".
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { studentId: payment.student.id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        group: {
          select: {
            name: true,
            groupNumber: true,
            level: true,
            exactDays: true,
            lessonStartTime: true,
            lessonEndTime: true,
            course: { select: { name: true } },
            teachers: {
              select: {
                teacher: {
                  select: { firstName: true, lastName: true },
                },
              },
            },
          },
        },
      },
    });
    const groupSchedule = enrollment?.group
      ? buildGroupSchedule(
          enrollment.group.exactDays,
          enrollment.group.lessonStartTime,
          enrollment.group.lessonEndTime,
        )
      : null;
    const teacherNames = enrollment?.group?.teachers?.length
      ? enrollment.group.teachers
          .map((gt) => `${gt.teacher.firstName} ${gt.teacher.lastName}`)
          .join(', ')
      : null;

    const company = await this.prisma.company.findUnique({
      where: { id: payment.companyId },
      select: { name: true, phone: true, logo: true },
    });
    if (!company) throw new NotFoundException('Kompaniya topilmadi');

    const receiptCode = await this.ensurePaymentReceiptCode(
      payment.id,
      payment.companyId,
      payment.receiptCode,
    );

    return {
      payment: {
        id: payment.id,
        amount: payment.amount,
        method: payment.method,
        status: payment.status,
        source: payment.source,
        externalId: payment.externalId,
        receiptNumber: payment.receiptNumber,
        note: payment.note,
        createdAt: payment.createdAt,
      },
      receiptCode,
      contractNumber: payment.contract?.contractNumber ?? null,
      student: payment.student,
      receivedByName: payment.receivedBy
        ? `${payment.receivedBy.firstName} ${payment.receivedBy.lastName}`
        : null,
      branch,
      company,
      groupName: enrollment?.group?.name ?? null,
      groupNumber: enrollment?.group?.groupNumber ?? null,
      groupLevel: enrollment?.group?.level ?? null,
      courseLabel: enrollment?.group?.course?.name ?? null,
      teacherNames,
      lessonSchedule: groupSchedule,
      // The student's balance shown on the receipt is the post-payment
      // balance (current value). The pre-payment balance is recoverable
      // via amount: balance - amount  (only correct for non-reversed,
      // best-effort for reversed — admin can still tell from the ledger).
      balanceAfter: payment.student.balance,
      qrUrl: this.invoiceUrl(payment.id),
    };
  }

  private async loadRefundInput(refundId: string): Promise<RefundReceiptInput> {
    const refund = await this.prisma.refund.findFirst({
      where: { id: refundId },
      include: {
        contract: { select: { contractNumber: true } },
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
        processedBy: { select: { firstName: true, lastName: true } },
        enrollment: {
          select: {
            group: {
              select: {
                name: true,
                groupNumber: true,
                level: true,
                exactDays: true,
                lessonStartTime: true,
                lessonEndTime: true,
                course: { select: { name: true } },
                teachers: {
                  select: {
                    teacher: {
                      select: { firstName: true, lastName: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!refund) throw new NotFoundException('Qaytarish hujjati topilmadi');
    if (refund.status !== RefundStatus.COMPLETED) {
      // We only generate documents for terminal-state refunds. Anything
      // else (REQUESTED/APPROVED/PROCESSING/REJECTED) is internal admin
      // workflow and shouldn't have a customer-facing PDF.
      throw new NotFoundException('Qaytarish hali tasdiqlanmagan');
    }

    const company = await this.prisma.company.findUnique({
      where: { id: refund.companyId },
      select: { name: true, phone: true, logo: true },
    });
    if (!company) throw new NotFoundException('Kompaniya topilmadi');

    const receiptCode = await this.ensureRefundReceiptCode(
      refund.id,
      refund.companyId,
      refund.receiptCode,
    );

    return {
      refund: {
        id: refund.id,
        requestedAmount: refund.requestedAmount,
        approvedAmount: refund.approvedAmount,
        deductions: refund.deductions as Record<string, number> | null,
        status: refund.status,
        refundMethod: refund.refundMethod,
        reason: refund.reason,
        processedAt: refund.processedAt,
        createdAt: refund.createdAt,
      },
      receiptCode,
      contractNumber: refund.contract?.contractNumber ?? null,
      student: refund.student,
      processedByName: refund.processedBy
        ? `${refund.processedBy.firstName} ${refund.processedBy.lastName}`
        : null,
      company,
      groupName: refund.enrollment?.group?.name ?? null,
      groupNumber: refund.enrollment?.group?.groupNumber ?? null,
      groupLevel: refund.enrollment?.group?.level ?? null,
      courseLabel: refund.enrollment?.group?.course?.name ?? null,
      teacherNames: refund.enrollment?.group?.teachers?.length
        ? refund.enrollment.group.teachers
            .map((gt) => `${gt.teacher.firstName} ${gt.teacher.lastName}`)
            .join(', ')
        : null,
      lessonSchedule: refund.enrollment?.group
        ? buildGroupSchedule(
            refund.enrollment.group.exactDays,
            refund.enrollment.group.lessonStartTime,
            refund.enrollment.group.lessonEndTime,
          )
        : null,
      qrUrl: this.invoiceUrl(refund.id),
    };
  }

  /**
   * Lazy-allocate `R-YYYY-NNNNN`. If already allocated returns it as-is.
   * Race-safe: lookup + write happen inside a Serializable tx so two
   * concurrent first-renders end up with sequential codes.
   */
  private async ensurePaymentReceiptCode(
    paymentId: string,
    companyId: number,
    existing: string | null,
  ): Promise<string> {
    if (existing) return existing;
    return this.allocateCode({
      paymentId,
      companyId,
      prefix: 'R',
    });
  }

  private async ensureRefundReceiptCode(
    refundId: string,
    companyId: number,
    existing: string | null,
  ): Promise<string> {
    if (existing) return existing;
    return this.allocateCode({
      refundId,
      companyId,
      prefix: 'Q',
    });
  }

  private async allocateCode(
    params:
      | { paymentId: string; companyId: number; prefix: 'R' }
      | { refundId: string; companyId: number; prefix: 'Q' },
  ): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `${params.prefix}-${year}-`;
    return this.prisma.$transaction(
      async (tx) => {
        if (params.prefix === 'R') {
          const last = await tx.payment.findFirst({
            where: {
              companyId: params.companyId,
              receiptCode: { startsWith: prefix },
            },
            orderBy: { receiptCode: 'desc' },
            select: { receiptCode: true },
          });
          const next = nextSequence(last?.receiptCode ?? null, prefix);
          const code = `${prefix}${next}`;
          await tx.payment.update({
            where: { id: params.paymentId },
            data: { receiptCode: code },
          });
          return code;
        } else {
          const last = await tx.refund.findFirst({
            where: {
              companyId: params.companyId,
              receiptCode: { startsWith: prefix },
            },
            orderBy: { receiptCode: 'desc' },
            select: { receiptCode: true },
          });
          const next = nextSequence(last?.receiptCode ?? null, prefix);
          const code = `${prefix}${next}`;
          await tx.refund.update({
            where: { id: params.refundId },
            data: { receiptCode: code },
          });
          return code;
        }
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 10_000,
      },
    );
  }

  private publicBaseUrl(): string {
    return (
      this.config.get<string>('PUBLIC_BASE_URL') ??
      this.config.get<string>('APP_URL') ??
      'https://admin.dafzentrum.uz'
    );
  }

  /**
   * Where the backend API itself is reachable. Used in `pdfUrl` so the
   * verification page's "PDF yuklab olish" button hits the API host
   * (`api.dafzentrum.uz`) directly rather than the frontend portal.
   * Falls back to the canonical production API host.
   */
  private apiBaseUrl(): string {
    const explicit = this.config.get<string>('API_BASE_URL');
    if (explicit) return explicit;
    // Railway auto-injects `RAILWAY_PUBLIC_DOMAIN` (e.g. `api.dafzentrum.uz`).
    const railwayDomain = this.config.get<string>('RAILWAY_PUBLIC_DOMAIN');
    if (railwayDomain) return `https://${railwayDomain}`;
    return 'https://api.dafzentrum.uz';
  }

  /**
   * Public verification link — what the QR code on a printed receipt
   * encodes and what the Telegram body links to. Lives on the
   * authentication-free `invoice.dafzentrum.uz` subdomain so QR scans /
   * customer clicks open immediately. Falls back to the admin host's
   * `/r/<id>` route when `INVOICE_BASE_URL` is not configured (dev).
   */
  private invoiceUrl(receiptId: string): string {
    const invoiceBase = this.config.get<string>('INVOICE_BASE_URL');
    if (invoiceBase) return `${invoiceBase}/${receiptId}`;
    return `${this.publicBaseUrl()}/r/${receiptId}`;
  }
}

function nextSequence(lastCode: string | null, prefix: string): string {
  if (!lastCode) return '00001';
  const numStr = lastCode.replace(prefix, '');
  const num = parseInt(numStr, 10);
  if (Number.isNaN(num)) return '00001';
  return String(num + 1).padStart(5, '0');
}

const DAY_FULL_UZ: Record<string, string> = {
  monday: 'Dushanba',
  tuesday: 'Seshanba',
  wednesday: 'Chorshanba',
  thursday: 'Payshanba',
  friday: 'Juma',
  saturday: 'Shanba',
  sunday: 'Yakshanba',
};

const DAY_ORDER: Record<string, number> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
};

/**
 * Render `Group.exactDays + lessonStartTime/EndTime` as a single user-facing
 * line: `"Du-Cho-Ju 14:00–16:00"`. Returns null when the group has no schedule
 * (e.g. legacy data) so the receipt can omit the row entirely.
 */
function buildGroupSchedule(
  exactDays: string[],
  lessonStartTime: string | null,
  lessonEndTime: string | null,
): { daysLabel: string; timeLabel: string | null } | null {
  if (!exactDays?.length && !lessonStartTime) return null;
  const dayParts = (exactDays ?? [])
    .filter((d) => DAY_FULL_UZ[d])
    .sort((a, b) => (DAY_ORDER[a] ?? 99) - (DAY_ORDER[b] ?? 99))
    .map((d) => DAY_FULL_UZ[d]);
  const daysLabel = dayParts.join('-');
  const timeLabel =
    lessonStartTime && lessonEndTime
      ? `${lessonStartTime}–${lessonEndTime}`
      : (lessonStartTime ?? null);
  if (!daysLabel && !timeLabel) return null;
  return { daysLabel, timeLabel };
}
