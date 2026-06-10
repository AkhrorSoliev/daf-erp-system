import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { LessonBillingService } from '../billing/lesson-billing.service';
import { EntityHistoryService } from '../common/entity-history';
import { MockExamBillingService } from '../mock-exams/mock-exam-billing.service';
import {
  PaymentMethod,
  PaymentSource,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import type { SalaryCarriedOverPayload } from '../salary/salary-accrual.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { CorrectPaymentDto } from './dto/correct-payment.dto';
import { PAYMENT_METHOD_LABEL } from './shared/method-label';
import { formatSom } from './shared/format-som';

/**
 * Emitted after a successful payment commit (manual or gateway). Consumed
 * by `PaymentEventsListener` to send a Telegram receipt to the student.
 */
export interface PaymentReceivedPayload {
  paymentId: string;
  studentId: number;
  amount: number;
  method: PaymentMethod;
  source: PaymentSource;
  studentBalance: number | null;
  companyId: number;
  performedById?: number;
}

/**
 * Emitted after a payment is reversed (standalone reverse, or the first
 * leg of an amount correction). Consumed by `PaymentEventsListener` to
 * tell the student their payment was rolled back.
 */
export interface PaymentReversedPayload {
  paymentId: string;
  studentId: number;
  amount: number;
  studentBalance: number | null;
  reason: string | null;
  companyId: number;
  performedById?: number;
}

/**
 * Emitted when a non-CEO operator corrects a payment amount and/or method.
 * Consumed by `NotificationEventsListener` to alert the CEO(s) of the company.
 */
export interface PaymentCorrectedPayload {
  studentId: number;
  oldAmount: number;
  newAmount: number;
  oldMethod: PaymentMethod;
  newMethod: PaymentMethod;
  reason: string;
  performedById: number;
  companyId: number;
}

@Injectable()
export class PaymentsWriteService {
  private readonly logger = new Logger(PaymentsWriteService.name);

  /**
   * Hours after a payment lands during which a non-CEO operator may still
   * correct its amount. CEOs are not bound by this window.
   */
  private static readonly ADMIN_CORRECTION_WINDOW_HOURS = 72;

  constructor(
    private prisma: PrismaService,
    private transactionsService: TransactionsService,
    private lessonBillingService: LessonBillingService,
    private entityHistoryService: EntityHistoryService,
    private eventEmitter: EventEmitter2,
    private mockExamBilling: MockExamBillingService,
  ) {}

  async create(dto: CreatePaymentDto, userId: number, companyId: number) {
    const student = await this.prisma.student.findFirst({
      where: { id: dto.studentId, deletedAt: null, companyId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!student) {
      throw new NotFoundException("O'quvchi topilmadi");
    }

    let resolvedBranchId = dto.branchId;

    if (dto.contractId) {
      const contract = await this.prisma.contract.findFirst({
        where: {
          id: dto.contractId,
          studentId: dto.studentId,
          deletedAt: null,
          companyId,
        },
        select: { id: true, branchId: true },
      });
      if (!contract) {
        throw new NotFoundException(
          "Shartnoma topilmadi yoki bu o'quvchiga tegishli emas",
        );
      }
      if (dto.branchId && contract.branchId !== dto.branchId) {
        throw new BadRequestException(
          "To'lov filiali shartnoma filialiga mos kelmaydi",
        );
      }
      resolvedBranchId = contract.branchId;
    }

    const { payment, studentBalance, carriedOver } = await this.prisma.$transaction(
      async (tx) => {
        const payment = await tx.payment.create({
          data: {
            studentId: dto.studentId,
            contractId: dto.contractId,
            amount: dto.amount,
            method: dto.method,
            status: PaymentStatus.COMPLETED,
            receiptNumber: dto.receiptNumber,
            note: dto.note,
            receivedById: userId,
            branchId: resolvedBranchId,
            companyId,
          },
        });

        await this.transactionsService.recordPayment(
          {
            studentId: dto.studentId,
            amount: dto.amount,
            paymentId: payment.id,
            contractId: dto.contractId,
            branchId: resolvedBranchId,
            companyId,
            performedById: userId,
          },
          tx,
        );

        if (dto.contractId) {
          await tx.contract.update({
            where: { id: dto.contractId },
            data: { paidAmount: { increment: dto.amount } },
          });
        }

        // Retroactive billing: now that the balance is topped up, settle any
        // PRESENT/LATE/ABSENT attendance whose lesson was held while the
        // student was a debtor (no LESSON_DEDUCTION/CONSUMPTION/SalaryAccrual
        // got written at the time). Idempotent — re-running on a payment
        // where everything is already settled is a no-op.
        const retro =
          await this.lessonBillingService.processRetroactiveBillingForStudent(
            tx,
            {
              studentId: dto.studentId,
              companyId,
              performedById: userId,
            },
          );

        // After lesson fees, auto-settle any pending mock exam fees this
        // student has registered for. Uses the same balance-walk pattern
        // — oldest mock first, stops when balance can't cover the next
        // one. Idempotent: already-paid mocks are filtered out.
        await this.mockExamBilling.tryDeductForStudent(
          {
            studentId: dto.studentId,
            companyId,
            performedById: userId,
          },
          tx,
        );

        const updatedStudent = await tx.student.findUnique({
          where: { id: dto.studentId },
          select: { balance: true },
        });

        // If this payment cleared the debt, any OPEN payment promise is KEPT.
        await this.settleKeptPromises(tx, {
          studentId: dto.studentId,
          balance: updatedStudent?.balance,
          performedById: userId,
        });

        await this.entityHistoryService.recordCreate({
          entityType: 'Payment',
          entityId: payment.id,
          newValues: payment,
          changedById: userId,
          companyId,
          tx,
        });

        await this.entityHistoryService.recordStatusChange({
          entityType: 'Student',
          entityId: dto.studentId,
          oldValues: { balans: updatedStudent!.balance - dto.amount },
          newValues: {
            balans: updatedStudent!.balance,
            summa: dto.amount,
            usul: PAYMENT_METHOD_LABEL[dto.method] ?? dto.method,
            status: "TO'LOV_QABUL_QILINDI",
          },
          changedById: userId,
          companyId,
          tx,
        });

        return {
          payment,
          studentBalance: updatedStudent?.balance,
          carriedOver: retro.carriedOver ?? [],
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10000,
        timeout: 15000,
      },
    );

    // Fire-and-forget Telegram receipt to the student. The listener uses
    // SmsService so the message also lands in the student profile "SMS"
    // tab (the SMS module is already Telegram-backed).
    this.eventEmitter.emit('payment.received', {
      paymentId: payment.id,
      studentId: dto.studentId,
      amount: dto.amount,
      method: dto.method,
      source: payment.source,
      studentBalance: studentBalance ?? null,
      companyId,
      performedById: userId,
    } satisfies PaymentReceivedPayload);

    // Tell affected teachers when this (late) payment carried lessons from an
    // already-closed payroll into the current cycle. Emitted post-commit.
    if (carriedOver.length > 0) {
      this.eventEmitter.emit('salary.carried-over', {
        companyId,
        items: carriedOver,
      } satisfies SalaryCarriedOverPayload);
    }

    return { ...payment, studentBalance };
  }

  async reverse(
    id: string,
    // `performedById` is optional: gateway-initiated reversals (Payme cancel)
    // are system actions with no real user — pass undefined so the audit
    // `changedById` is null rather than a non-existent user id 0 (which trips
    // the FK). (F-40)
    params: { reason?: string; performedById?: number; companyId: number },
  ) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, companyId: params.companyId },
      select: {
        id: true,
        studentId: true,
        amount: true,
        contractId: true,
        status: true,
      },
    });
    if (!payment) throw new NotFoundException("To'lov topilmadi");

    if (payment.status === PaymentStatus.REVERSED) {
      throw new BadRequestException("Bu to'lov allaqachon bekor qilingan");
    }

    // "Active original" = not a reversal entry (reversedTransactionId IS NULL)
    // and not been reversed (reversedAt IS NULL). Both filters are needed
    // because either alone leaks the wrong row in some flows.
    const ledgerEntry = await this.prisma.transaction.findFirst({
      where: {
        paymentId: id,
        type: 'PAYMENT',
        reversedTransactionId: null,
        reversedAt: null,
      },
      select: { id: true, createdAt: true },
    });
    if (!ledgerEntry) {
      throw new BadRequestException(
        "To'lovning ledger yozuvi topilmadi — bu yozuv avvalroq bekor qilingan yoki yaratilmagan",
      );
    }

    // Faza 5: don't let a refund-via-reverse short-circuit the formal
    // refund path once the money has actually been spent on lessons. If
    // any active LESSON_CONSUMPTION exists for this student dated AFTER
    // the payment landed, we treat the funds as already-consumed and force
    // the user through the Refund flow (which has the proper math for
    // partial completion, deductions, eligibility, etc).
    const downstreamConsumption = await this.prisma.transaction.count({
      where: {
        studentId: payment.studentId,
        type: 'LESSON_CONSUMPTION',
        // Genuine, still-active consumption only. Exclude reversal entries
        // (reversedTransactionId set) — they represent the *undoing* of a
        // consumption (e.g. after a lesson-deduction unwind), not money
        // currently spent on lessons.
        reversedAt: null,
        reversedTransactionId: null,
        createdAt: { gt: ledgerEntry.createdAt },
      },
    });
    if (downstreamConsumption > 0) {
      throw new BadRequestException(
        "To'lov allaqachon darslarga sarflangan. Bekor qilish o'rniga refund'dan foydalaning.",
      );
    }

    const result = await this.prisma.$transaction(
      async (tx) => {
        await this.transactionsService.reverseTransaction(
          ledgerEntry.id,
          {
            performedById: params.performedById,
            reason: params.reason ?? "To'lov bekor qilindi",
          },
          tx,
        );

        if (payment.contractId) {
          await tx.contract.update({
            where: { id: payment.contractId },
            data: { paidAmount: { decrement: payment.amount } },
          });
        }

        await tx.payment.update({
          where: { id },
          data: { status: PaymentStatus.REVERSED },
        });

        await this.entityHistoryService.recordStatusChange({
          entityType: 'Payment',
          entityId: id,
          oldValues: { status: payment.status },
          newValues: {
            status: PaymentStatus.REVERSED,
            reason: params.reason ?? null,
          },
          changedById: params.performedById,
          companyId: params.companyId,
          tx,
        });

        const updatedStudent = await tx.student.findUnique({
          where: { id: payment.studentId },
          select: { balance: true },
        });

        await this.entityHistoryService.recordStatusChange({
          entityType: 'Student',
          entityId: payment.studentId,
          oldValues: {
            balans: (updatedStudent?.balance ?? 0) + payment.amount,
          },
          newValues: {
            balans: updatedStudent?.balance ?? 0,
            summa: -payment.amount,
            status: "TO'LOV_BEKOR_QILINDI",
          },
          changedById: params.performedById,
          companyId: params.companyId,
          tx,
        });

        return {
          reversedPaymentId: id,
          amount: payment.amount,
          studentBalance: updatedStudent?.balance ?? null,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10000,
        timeout: 15000,
      },
    );

    // Tell the student their payment was rolled back. Fire-and-forget,
    // post-commit — mirrors the `payment.received` receipt flow.
    this.eventEmitter.emit('payment.reversed', {
      paymentId: id,
      studentId: payment.studentId,
      amount: payment.amount,
      studentBalance: result.studentBalance,
      reason: params.reason ?? null,
      companyId: params.companyId,
      performedById: params.performedById,
    } satisfies PaymentReversedPayload);

    return { reversedPaymentId: id, amount: result.amount };
  }

  /**
   * Corrects the amount and/or method of an already-posted manual payment
   * (e.g. cashier typed 4 000 000 instead of 400 000, or recorded CASH for a
   * bank TRANSFER). Reverses the wrong payment and re-posts a new one at
   * `dto.correctAmount` with `dto.method` (or the original method when the
   * caller omits it) — the append-only ledger rule means we never edit the
   * Payment row in place.
   *
   * Guardrails:
   *  - only `ADMIN_MANUAL` payments (gateway amounts are provider-owned);
   *  - only `COMPLETED` payments;
   *  - non-CEO callers limited to a {@link ADMIN_CORRECTION_WINDOW_HOURS}h
   *    window after the payment landed (CEOs bypass);
   *  - blocked once the funds were spent on lessons — that needs the CEO
   *    lesson-deduction unwind flow, not a plain reverse.
   */
  async correctAmount(
    id: string,
    dto: CorrectPaymentDto,
    userId: number,
    companyId: number,
    roles: string[],
  ) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        studentId: true,
        amount: true,
        method: true,
        contractId: true,
        branchId: true,
        status: true,
        source: true,
        createdAt: true,
      },
    });
    if (!payment) throw new NotFoundException("To'lov topilmadi");

    if (payment.status !== PaymentStatus.COMPLETED) {
      throw new BadRequestException(
        "Faqat amaldagi (COMPLETED) to'lovni to'g'rilash mumkin",
      );
    }

    // Gateway payments (Payme/Click/Uzum) and manually-attached gateway
    // transactions carry a real external amount — hand-editing them would
    // desync the ledger from the provider.
    if (payment.source !== PaymentSource.ADMIN_MANUAL) {
      throw new BadRequestException(
        "Faqat qo'lda kiritilgan to'lovni to'g'rilash mumkin",
      );
    }

    // Method is optional — keep the original when the caller doesn't change it.
    const newMethod = dto.method ?? payment.method;
    const sameAmount = dto.correctAmount === payment.amount;
    const sameMethod = newMethod === payment.method;
    if (sameAmount && sameMethod) {
      throw new BadRequestException(
        "Summa va to'lov usuli o'zgarmadi — to'g'rilash shart emas",
      );
    }

    // A reason is mandatory only when the amount changes — an amount fix must
    // be explained in the audit trail. A method-only change (money unchanged)
    // doesn't require one.
    const reason = dto.reason?.trim() || null;
    if (!sameAmount && !reason) {
      throw new BadRequestException(
        "Summani to'g'rilash uchun sabab ko'rsatilishi shart",
      );
    }

    // Time window — admins/BDs may only correct recent payments; CEOs bypass.
    const isCeo = roles?.includes('CEO') ?? false;
    if (!isCeo) {
      const ageMs = Date.now() - payment.createdAt.getTime();
      const windowMs =
        PaymentsWriteService.ADMIN_CORRECTION_WINDOW_HOURS * 60 * 60 * 1000;
      if (ageMs > windowMs) {
        throw new BadRequestException(
          `To'lov ${PaymentsWriteService.ADMIN_CORRECTION_WINDOW_HOURS} soatdan oldin qilingan — uni faqat direktor (CEO) to'g'rilay oladi`,
        );
      }
    }

    // Method-only correction (amount unchanged): the student balance never
    // moves, so the reverse+re-post machinery — and its "funds already spent
    // on lessons" guard — doesn't apply. The ledger tracks balances, not the
    // payment method, so we just relabel the method on the Payment row in
    // place. This lets an admin fix a mis-recorded method (e.g. CASH →
    // TRANSFER) even after the money was already consumed by lessons.
    if (sameAmount) {
      const studentBalance = await this.prisma.$transaction(
        async (tx) => {
          await tx.payment.update({
            where: { id },
            data: { method: newMethod },
          });

          await this.entityHistoryService.recordUpdate({
            entityType: 'Payment',
            entityId: id,
            oldValues: { method: payment.method },
            newValues: { method: newMethod },
            changedById: userId,
            companyId,
            tx,
          });

          const student = await tx.student.findUnique({
            where: { id: payment.studentId },
            select: { balance: true },
          });
          return student?.balance ?? null;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10000,
          timeout: 15000,
        },
      );

      // Alert the CEO when a non-CEO relabels a payment method.
      if (!isCeo) {
        this.eventEmitter.emit('payment.corrected', {
          studentId: payment.studentId,
          oldAmount: payment.amount,
          newAmount: payment.amount,
          oldMethod: payment.method,
          newMethod,
          reason: reason ?? "To'lov usuli o'zgartirildi",
          performedById: userId,
          companyId,
        } satisfies PaymentCorrectedPayload);
      }

      return {
        reversedPaymentId: null,
        newPayment: null,
        studentBalance,
      };
    }

    // Simple-case guard: if the funds were already spent on lessons, a
    // reverse+repost can't represent the correction. Surface a clear
    // message before touching anything (reverse() re-checks as a backstop).
    const ledgerEntry = await this.prisma.transaction.findFirst({
      where: {
        paymentId: id,
        type: 'PAYMENT',
        reversedTransactionId: null,
        reversedAt: null,
      },
      select: { createdAt: true },
    });
    if (ledgerEntry) {
      const consumed = await this.prisma.transaction.count({
        where: {
          studentId: payment.studentId,
          type: 'LESSON_CONSUMPTION',
          // Active consumption only — a reversal entry (reversedTransactionId
          // set) is the undoing of a consumption, not spent money. Without
          // this, a prior lesson-deduction unwind would wrongly block the
          // correction.
          reversedAt: null,
          reversedTransactionId: null,
          createdAt: { gt: ledgerEntry.createdAt },
        },
      });
      if (consumed > 0) {
        throw new BadRequestException(
          "To'lov mablag'i allaqachon darslarga sarflangan — bu holatda summani admin to'g'rilay olmaydi. Iltimos, CEO bilan bog'laning.",
        );
      }
    }

    // Step 1 — reverse the wrong payment (its own atomic tx). reverse()
    // emits `payment.reversed`, so the student gets the first message.
    await this.reverse(id, {
      reason: reason
        ? `Summa to'g'rilandi: ${reason}`
        : "To'lov usuli to'g'rilandi",
      performedById: userId,
      companyId,
    });

    // Step 2 — re-post at the correct amount/method (its own atomic tx).
    // create() emits `payment.received`, so the student gets the second message.
    const methodChangeNote = sameMethod
      ? ''
      : ` To'lov usuli: ${PAYMENT_METHOD_LABEL[payment.method]} → ${PAYMENT_METHOD_LABEL[newMethod]}.`;
    const reasonNote = reason ? ` Sabab: ${reason}` : '';
    const noteForCorrection = `To'g'rilangan to'lov (avvalgi summa: ${formatSom(
      payment.amount,
    )} so'm).${methodChangeNote}${reasonNote}`;
    let newPayment: Awaited<ReturnType<PaymentsWriteService['create']>>;
    try {
      newPayment = await this.create(
        {
          studentId: payment.studentId,
          amount: dto.correctAmount,
          method: newMethod,
          contractId: payment.contractId ?? undefined,
          branchId: payment.branchId ?? undefined,
          note: noteForCorrection,
        },
        userId,
        companyId,
      );
    } catch (err) {
      // The reverse already committed. We don't have an atomic rollback
      // across the two transactions, so surface a precise recovery hint.
      this.logger.error(
        `Correction re-post failed for payment ${id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw new BadRequestException(
        "To'lov bekor qilindi, lekin yangi summa qayd etilmadi. Iltimos, to'g'ri summani qo'lda kiriting.",
      );
    }

    // Alert the CEO when a non-CEO performed the correction.
    if (!isCeo) {
      this.eventEmitter.emit('payment.corrected', {
        studentId: payment.studentId,
        oldAmount: payment.amount,
        newAmount: dto.correctAmount,
        oldMethod: payment.method,
        newMethod,
        reason: reason ?? '',
        performedById: userId,
        companyId,
      } satisfies PaymentCorrectedPayload);
    }

    return {
      reversedPaymentId: id,
      newPayment,
      studentBalance: newPayment.studentBalance ?? null,
    };
  }

  /**
   * Resolves a student's branch for gateway payments that don't carry branch context.
   *
   * Priority:
   *   1. Active enrollment's group.branchId (the branch where the student is studying)
   *   2. First StudentBranch record (registered branch)
   *   3. null (no branch linkage — will still create the payment but branch-filtered
   *      views won't show it)
   */
  async resolveStudentBranchId(
    studentId: number,
    companyId: number,
    outerTx?: Prisma.TransactionClient,
  ): Promise<number | null> {
    const db = outerTx ?? this.prisma;

    const activeEnrollment = await db.enrollment.findFirst({
      where: {
        studentId,
        deletedAt: null,
        status: 'ACTIVE',
        group: { companyId, deletedAt: null },
      },
      select: { group: { select: { branchId: true } } },
      orderBy: { createdAt: 'desc' },
    });
    if (activeEnrollment?.group?.branchId) {
      return activeEnrollment.group.branchId;
    }

    const studentBranch = await db.studentBranch.findFirst({
      where: { studentId, student: { companyId } },
      select: { branchId: true },
    });
    return studentBranch?.branchId ?? null;
  }

  /**
   * Auto-resolve payment promises after a payment lands. When the payment has
   * restored the student's balance to non-negative, any OPEN promise is
   * considered KEPT. Runs inside the caller's payment transaction so it
   * commits atomically with the balance change. `performedById` may be null
   * for gateway payments (resolvedById is nullable).
   */
  private async settleKeptPromises(
    tx: Prisma.TransactionClient,
    params: {
      studentId: number;
      balance: number | null | undefined;
      performedById: number | null | undefined;
    },
  ) {
    if (params.balance == null || params.balance < 0) return;
    await tx.paymentPromise.updateMany({
      where: { studentId: params.studentId, status: 'OPEN' },
      data: {
        status: 'KEPT',
        resolvedAt: new Date(),
        resolvedById: params.performedById ?? null,
      },
    });
  }

  async createFromExternal(
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
    const db = outerTx ?? this.prisma;

    const student = await db.student.findFirst({
      where: {
        id: params.studentId,
        deletedAt: null,
        companyId: params.companyId,
      },
      select: { id: true },
    });
    if (!student) throw new NotFoundException("O'quvchi topilmadi");

    let resolvedBranchId = params.branchId;

    if (params.contractId) {
      const contract = await db.contract.findFirst({
        where: {
          id: params.contractId,
          studentId: params.studentId,
          deletedAt: null,
          companyId: params.companyId,
        },
        select: { id: true, branchId: true },
      });
      if (!contract) {
        throw new NotFoundException(
          "Shartnoma topilmadi yoki bu o'quvchiga tegishli emas",
        );
      }
      if (params.branchId && contract.branchId !== params.branchId) {
        throw new BadRequestException(
          "To'lov filiali shartnoma filialiga mos kelmaydi",
        );
      }
      resolvedBranchId = contract.branchId;
    }

    const executeInTx = async (tx: Prisma.TransactionClient) => {
      const payment = await tx.payment.create({
        data: {
          studentId: params.studentId,
          contractId: params.contractId,
          amount: params.amount,
          method: params.method,
          status: PaymentStatus.COMPLETED,
          source: params.source,
          externalId: params.externalId,
          providerFee: params.providerFee,
          providerFeePercent: params.providerFeePercent,
          note: params.note,
          receivedById: params.performedById,
          branchId: resolvedBranchId,
          companyId: params.companyId,
        },
      });

      await this.transactionsService.recordPayment(
        {
          studentId: params.studentId,
          amount: params.amount,
          paymentId: payment.id,
          contractId: params.contractId,
          branchId: resolvedBranchId,
          companyId: params.companyId,
          performedById: params.performedById,
        },
        tx,
      );

      if (params.contractId) {
        await tx.contract.update({
          where: { id: params.contractId },
          data: { paidAmount: { increment: params.amount } },
        });
      }

      // Same retroactive billing hook as the manual `create()` path —
      // gateway payments (Payme/Click) and admin attach-external also
      // need to settle past unpaid attendance the moment funds land.
      const retro =
        await this.lessonBillingService.processRetroactiveBillingForStudent(
          tx,
          {
            studentId: params.studentId,
            companyId: params.companyId,
            performedById: params.performedById,
          },
        );

      // And settle any pending mock exam fees too — DaF student paid via
      // Payme/Click using their student id; this drains the freshly-topped
      // balance into any unpaid mocks they're registered for.
      await this.mockExamBilling.tryDeductForStudent(
        {
          studentId: params.studentId,
          companyId: params.companyId,
          performedById: params.performedById,
        },
        tx,
      );

      const updatedStudent = await tx.student.findUnique({
        where: { id: params.studentId },
        select: { balance: true },
      });

      // If this payment cleared the debt, any OPEN payment promise is KEPT.
      await this.settleKeptPromises(tx, {
        studentId: params.studentId,
        balance: updatedStudent?.balance,
        performedById: params.performedById,
      });

      await this.entityHistoryService.recordStatusChange({
        entityType: 'Student',
        entityId: params.studentId,
        oldValues: { balans: updatedStudent!.balance - params.amount },
        newValues: {
          balans: updatedStudent!.balance,
          summa: params.amount,
          usul: PAYMENT_METHOD_LABEL[params.method] ?? params.method,
          status: "TO'LOV_QABUL_QILINDI",
        },
        changedById: params.performedById,
        companyId: params.companyId,
        tx,
      });

      return {
        payment,
        studentBalance: updatedStudent?.balance,
        carriedOver: retro.carriedOver ?? [],
      };
    };

    try {
      // If an outer transaction was provided, run within it; otherwise create our own
      const { payment, studentBalance, carriedOver } = outerTx
        ? await executeInTx(outerTx)
        : await this.prisma.$transaction(executeInTx, {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 10000,
            timeout: 15000,
          });

      // Telegram receipt — only when we owned the tx (i.e. it has
      // committed by now). When the caller passed `outerTx` they're
      // responsible for emitting after their own commit, so we skip to
      // avoid notifying for a payment that may still be rolled back.
      if (!outerTx) {
        this.eventEmitter.emit('payment.received', {
          paymentId: payment.id,
          studentId: params.studentId,
          amount: params.amount,
          method: params.method,
          source: params.source,
          studentBalance: studentBalance ?? null,
          companyId: params.companyId,
          performedById: params.performedById,
        } satisfies PaymentReceivedPayload);

        // Same post-commit gate as the receipt: only emit when we owned the
        // tx. Carry-over notifications for an outerTx caller are that caller's
        // responsibility after their own commit.
        if (carriedOver.length > 0) {
          this.eventEmitter.emit('salary.carried-over', {
            companyId: params.companyId,
            items: carriedOver,
          } satisfies SalaryCarriedOverPayload);
        }
      }

      return { ...payment, studentBalance };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new BadRequestException(
          `Payment with externalId=${params.externalId} for ${params.method} allaqachon mavjud`,
        );
      }
      throw err;
    }
  }
}
