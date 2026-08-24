import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AttendanceStatus,
  EnrollmentStatus,
  Prisma,
  TransactionType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertCallerMayWriteForStudent } from '../common/auth/financial-write-scope';
import { TransactionsService } from '../transactions/transactions.service';
import { EntityHistoryService } from '../common/entity-history/entity-history.service';

/**
 * "Yo'qolgan o'quvchi" — joriy siklda kam yoki umuman kelmagan o'quvchining
 * qarzini hisobdan chiqarish.
 *
 * Biznes qoidasi:
 *   - "Sikl" = Course.lessonPaymentCount ta ketma-ket davomat (LessonCancellation
 *     orqali EXCUSED qilinganlar sanalmaydi — bekor qilingan dars o'tmagan).
 *   - "Joriy sikl" = oxirgi davomat tushgan sikl.
 *   - Eligibility: balance < 0 AND joriy siklda ABSENT > 0.
 *     (Avval "PRESENT/LATE = 0" sharti ham bor edi — admin "1-2 kelgan
 *     o'quvchi" stsenariysida ham qaror qabul qila olsin uchun olib
 *     tashlandi. Admin UI orqali qancha summani aniq tanlaydi.)
 *   - Admin 3 ta variant orasidan tanlaydi:
 *       Real qarz  = min(absentCost = absentCount × perLessonCost, |balance|)
 *       Jami qarz  = |balance|  (eski sikllardagi qarzni ham qoplaydi)
 *       Boshqa     = admin qo'lda kiritadi, [1, |balance|] oralig'ida
 *   - Tasdiqlangan summa shu uchta variantdan birortasi bo'lishi shart.
 *
 * Append-only ledger: yangi Transaction { type: DEBT_WRITE_OFF, amount: +X }
 * yoziladi; balansga qo'shiladi (minusga yaqinlashadi). Audit izi metadata da.
 */
@Injectable()
export class DebtWriteOffService {
  private readonly logger = new Logger(DebtWriteOffService.name);

  constructor(
    private prisma: PrismaService,
    private transactionsService: TransactionsService,
    private entityHistoryService: EntityHistoryService,
  ) {}

  /**
   * Eligibility tekshiruvi. Frontend modal ochilganda chaqiriladi; backend
   * `executeWriteOff` ichida ham qayta chaqiriladi (race-condition himoyasi).
   */
  async computeEligibility(
    enrollmentId: string,
    companyId: number,
    tx?: Prisma.TransactionClient,
  ): Promise<DebtWriteOffEligibility> {
    const client = tx ?? this.prisma;

    const enrollment = await client.enrollment.findFirst({
      where: { id: enrollmentId, group: { companyId } },
      select: {
        id: true,
        studentId: true,
        groupId: true,
        status: true,
        startDate: true,
        student: { select: { id: true, balance: true, companyId: true } },
        group: {
          select: {
            id: true,
            branchId: true,
            companyId: true,
            course: { select: { price: true, lessonPaymentCount: true } },
          },
        },
      },
    });

    if (!enrollment) {
      throw new NotFoundException('Enrollment topilmadi');
    }

    const balance = enrollment.student.balance;
    const lessonPaymentCount = enrollment.group.course.lessonPaymentCount || 12;
    const perLessonCost = await this.computePerLessonCost(
      client,
      enrollment.id,
      enrollment.group.course,
    );

    const cycle = await this.computeCurrentCycle(client, {
      studentId: enrollment.studentId,
      groupId: enrollment.groupId,
      startDate: enrollment.startDate,
      lessonPaymentCount,
    });

    const counts = countByStatus(cycle.attendances);

    const attendedCost = (counts.present + counts.late) * perLessonCost;
    const absentCost = counts.absent * perLessonCost;
    const theoreticalCycleDebt = absentCost;
    const totalDebtAmount = balance < 0 ? -balance : 0;
    const realDebtAmount = Math.min(absentCost, totalDebtAmount);
    const maxWriteOff = totalDebtAmount;

    const detailsBase = {
      studentId: enrollment.studentId,
      enrollmentId: enrollment.id,
      groupId: enrollment.groupId,
      currentBalance: balance,
      enrollmentStatus: enrollment.status,
      cycleNumber: cycle.cycleNumber,
      cycleStartIndex: cycle.cycleStartIndex,
      cyclePresentCount: counts.present,
      cycleLateCount: counts.late,
      cycleAbsentCount: counts.absent,
      cycleExcusedCount: counts.excused,
      lessonPaymentCount,
      perLessonCost,
      attendedCost,
      absentCost,
      realDebtAmount,
      totalDebtAmount,
      maxWriteOff,
    };

    if (balance >= 0) {
      return {
        eligible: false,
        reason: 'NO_DEBT',
        details: {
          ...detailsBase,
          theoreticalCycleDebt: 0,
          suggestedWriteOff: 0,
        },
      };
    }

    if (counts.absent === 0) {
      return {
        eligible: false,
        reason: 'NO_ABSENT_IN_CYCLE',
        details: {
          ...detailsBase,
          theoreticalCycleDebt: 0,
          suggestedWriteOff: 0,
        },
      };
    }

    // Backward-compatible field: "suggestedWriteOff" defaults to the
    // "Real qarz" preset. Callers that don't know about the new presets
    // (legacy frontends) still get the conservative-correct amount.
    const suggestedWriteOff = realDebtAmount;

    return {
      eligible: true,
      details: {
        ...detailsBase,
        theoreticalCycleDebt,
        suggestedWriteOff,
      },
    };
  }

  /**
   * Atomik hisobdan chiqarish. MUST run inside an outer Serializable
   * transaction OR pass `tx: undefined` to let the service open one.
   */
  async executeWriteOff(
    params: {
      enrollmentId: string;
      companyId: number;
      performedById: number;
      reason: string;
      confirmAmount: number;
    },
    tx?: Prisma.TransactionClient,
  ) {
    if (!params.reason || params.reason.trim().length < 5) {
      throw new BadRequestException('Izoh majburiy (kamida 5 belgi)');
    }

    const runner = async (client: Prisma.TransactionClient) => {
      const eligibility = await this.computeEligibility(
        params.enrollmentId,
        params.companyId,
        client,
      );

      // Authorised INSIDE the transaction, with the transaction client: the
      // student is only known once the enrollment is loaded, and a write-off
      // forgives real debt in that branch's books.
      await assertCallerMayWriteForStudent(
        client,
        params.performedById,
        eligibility.details.studentId,
        params.companyId,
      );

      if (!eligibility.eligible) {
        throw new BadRequestException(
          `Joriy siklda yo'qolgan o'quvchi sharti bajarilmadi: ${eligibility.reason}`,
        );
      }

      // Validate the confirmed amount is in range [1, maxWriteOff]. The
      // frontend supplies one of three values (realDebtAmount, totalDebtAmount,
      // or an admin-typed custom amount); all three live in the same window
      // so a single bounded-range check covers them.
      const maxAllowed = eligibility.details.maxWriteOff;
      if (
        !Number.isFinite(params.confirmAmount) ||
        !Number.isInteger(params.confirmAmount) ||
        params.confirmAmount < 1 ||
        params.confirmAmount > maxAllowed
      ) {
        throw new BadRequestException(
          `Tasdiqlangan summa noto'g'ri. Oraliq: 1 — ${maxAllowed}, kelgan: ${params.confirmAmount}`,
        );
      }

      const enrollment = await client.enrollment.findUnique({
        where: { id: params.enrollmentId },
        select: {
          studentId: true,
          group: { select: { branchId: true, companyId: true } },
        },
      });
      if (!enrollment) {
        throw new NotFoundException('Enrollment topilmadi');
      }

      const balanceBefore = eligibility.details.currentBalance;
      const balanceAfter = balanceBefore + params.confirmAmount;

      const metadata: Prisma.InputJsonValue = {
        reason: params.reason,
        enrollmentId: params.enrollmentId,
        groupId: eligibility.details.groupId,
        cycleNumber: eligibility.details.cycleNumber,
        cycleStartIndex: eligibility.details.cycleStartIndex,
        cyclePresentCount: eligibility.details.cyclePresentCount,
        cycleLateCount: eligibility.details.cycleLateCount,
        cycleAbsentCount: eligibility.details.cycleAbsentCount,
        cycleExcusedCount: eligibility.details.cycleExcusedCount,
        perLessonCost: eligibility.details.perLessonCost,
        lessonPaymentCount: eligibility.details.lessonPaymentCount,
        theoreticalCycleDebt: eligibility.details.theoreticalCycleDebt,
        actualWriteOff: params.confirmAmount,
        previousBalance: balanceBefore,
        newBalance: balanceAfter,
      };

      const transaction = await this.transactionsService.recordDebtWriteOff(
        {
          studentId: enrollment.studentId,
          amount: params.confirmAmount,
          enrollmentId: params.enrollmentId,
          description:
            "Yo'qolgan o'quvchi — joriy sikl qarzi hisobdan chiqarildi",
          metadata,
          branchId: enrollment.group.branchId,
          companyId: enrollment.group.companyId,
          performedById: params.performedById,
        },
        client,
      );

      await this.entityHistoryService.recordUpdate({
        entityType: 'Student',
        entityId: enrollment.studentId,
        oldValues: { balance: balanceBefore },
        newValues: { balance: balanceAfter },
        changedById: params.performedById,
        companyId: enrollment.group.companyId,
        tx: client,
      });

      return { transaction, balanceBefore, balanceAfter, eligibility };
    };

    if (tx) return runner(tx);
    return this.prisma.$transaction(runner, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10000,
      timeout: 15000,
    });
  }

  /**
   * Sikl chegarasini va joriy sikldagi davomatlar ro'yxatini hisoblash.
   *
   * Algoritm:
   *   1. Davomatlarni xronologik (date ASC, createdAt ASC) tartibida olamiz.
   *   2. LessonCancellation orqali EXCUSED qilinganlar (cancellationId IS NOT NULL)
   *      hisobdan chiqariladi — bekor qilingan dars o'tmagan, sikl progressini
   *      ilgariga olib bormaydi.
   *   3. startDate dan oldingi davomatlar (legacy/transferred) sanalmaydi.
   *   4. Bucket = lessonPaymentCount ta davomat. Joriy sikl = oxirgi bucket.
   */
  private async computeCurrentCycle(
    client: Prisma.TransactionClient | PrismaService,
    params: {
      studentId: number;
      groupId: string;
      startDate: Date | null;
      lessonPaymentCount: number;
    },
  ): Promise<{
    cycleNumber: number;
    cycleStartIndex: number;
    attendances: { status: AttendanceStatus; date: Date }[];
  }> {
    const where: Prisma.AttendanceWhereInput = {
      studentId: params.studentId,
      groupId: params.groupId,
      cancellationId: null,
    };
    if (params.startDate) {
      where.date = { gte: params.startDate };
    }

    const records = await client.attendance.findMany({
      where,
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      select: { status: true, date: true },
    });

    if (records.length === 0) {
      return { cycleNumber: 1, cycleStartIndex: 1, attendances: [] };
    }

    const N = params.lessonPaymentCount;
    const cycleNumber = Math.ceil(records.length / N);
    const cycleStartIndex = (cycleNumber - 1) * N + 1;
    const attendances = records.slice(cycleStartIndex - 1);

    return { cycleNumber, cycleStartIndex, attendances };
  }

  /**
   * perLessonCost ni eski LESSON_DEDUCTION.metadata dan oladi (mavjud bo'lsa),
   * aks holda kurs narxidan hisoblaydi. EnrollmentBillingService bilan bir xil
   * mantiq — kurs narxi keyinroq o'zgarsa, eski qarz eski narxda hisobdan chiqariladi.
   */
  private async computePerLessonCost(
    client: Prisma.TransactionClient | PrismaService,
    enrollmentId: string,
    course: { price: number; lessonPaymentCount: number | null },
  ): Promise<number> {
    const recentDeduction = await client.transaction.findFirst({
      where: {
        enrollmentId,
        type: TransactionType.LESSON_DEDUCTION,
        reversedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      select: { metadata: true },
    });
    const meta = recentDeduction?.metadata as
      | { perLessonCost?: number }
      | null
      | undefined;
    if (
      meta &&
      typeof meta.perLessonCost === 'number' &&
      meta.perLessonCost > 0
    ) {
      return meta.perLessonCost;
    }
    const lessonPaymentCount = course.lessonPaymentCount || 12;
    return Math.round(course.price / lessonPaymentCount);
  }

  /**
   * Reverse a previous DEBT_WRITE_OFF. CEO-only at the controller level.
   * Restores the original debt by writing the inverse transaction.
   */
  async reverseWriteOff(params: {
    transactionId: string;
    companyId: number;
    performedById: number;
    reason: string;
  }) {
    return this.prisma.$transaction(
      async (client) => {
        const original = await client.transaction.findFirst({
          where: {
            id: params.transactionId,
            type: TransactionType.DEBT_WRITE_OFF,
            companyId: params.companyId,
          },
        });
        if (!original) {
          throw new NotFoundException(
            'Hisobdan chiqarish topilmadi yoki boshqa kompaniyaga tegishli',
          );
        }
        if (original.reversedAt !== null) {
          throw new BadRequestException(
            'Bu hisobdan chiqarish allaqachon bekor qilingan',
          );
        }
        return this.transactionsService.reverseTransaction(
          params.transactionId,
          {
            performedById: params.performedById,
            reason: params.reason,
          },
          client,
        );
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10000,
        timeout: 15000,
      },
    );
  }
}

function countByStatus(records: { status: AttendanceStatus }[]) {
  let present = 0,
    late = 0,
    absent = 0,
    excused = 0;
  for (const r of records) {
    switch (r.status) {
      case AttendanceStatus.PRESENT:
        present++;
        break;
      case AttendanceStatus.LATE:
        late++;
        break;
      case AttendanceStatus.ABSENT:
        absent++;
        break;
      case AttendanceStatus.EXCUSED:
        excused++;
        break;
    }
  }
  return { present, late, absent, excused };
}

// STUDENT_ATTENDED was removed when eligibility was relaxed — admin now
// makes the decision via the UI even when the student attended a few
// lessons. The constant is no longer emitted by the service.
export type DebtWriteOffEligibilityReason = 'NO_DEBT' | 'NO_ABSENT_IN_CYCLE';

export interface DebtWriteOffEligibilityDetails {
  studentId: number;
  enrollmentId: string;
  groupId: string;
  currentBalance: number;
  enrollmentStatus: EnrollmentStatus;
  cycleNumber: number;
  cycleStartIndex: number;
  cyclePresentCount: number;
  cycleLateCount: number;
  cycleAbsentCount: number;
  cycleExcusedCount: number;
  lessonPaymentCount: number;
  perLessonCost: number;
  theoreticalCycleDebt: number;
  // Kept for backward compatibility — equal to realDebtAmount.
  suggestedWriteOff: number;
  // Joriy siklda kelgan darslarning umumiy narxi.
  attendedCost: number;
  // Joriy siklda kelmagan darslarning umumiy narxi.
  absentCost: number;
  // "Real qarz" preseti — joriy sikldagi kelmagan darslar narxi (lekin
  // balansdan ko'p emas).
  realDebtAmount: number;
  // "Jami qarz" preseti — balansdagi to'liq qarz (eski sikllar ham qoplanadi).
  totalDebtAmount: number;
  // Admin "Boshqa" variantida kiritishi mumkin bo'lgan maksimal summa.
  maxWriteOff: number;
}

export interface DebtWriteOffEligibility {
  eligible: boolean;
  reason?: DebtWriteOffEligibilityReason;
  details: DebtWriteOffEligibilityDetails;
}
