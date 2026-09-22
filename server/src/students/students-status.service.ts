import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  EnrollmentStatus,
  ExitType,
  PaymentModel,
  Prisma,
  StudentStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

import { StatusHistoryService, StatusCascadeService } from '../common/status';
import { EntityHistoryService } from '../common/entity-history';
import { EnrollmentBillingService } from '../billing/enrollment-billing.service';
import { MonthlyChargeService } from '../billing/monthly-charge.service';
import {
  ChangeStudentStatusDto,
  validateFrozenRefundOverrides,
} from './dto/change-student-status.dto';
import { studentSelect, formatStudent } from './shared/student-select';
import { assertCallerMayTouchStudent } from '../common/auth/student-branch-scope';
import {
  EXIT_REASON_COMMENT_ERROR,
  EXIT_REASON_COMMENT_MIN_LENGTH,
  exitReasonRequiresComment,
} from '../common/exit-reason-comment';
import { buildAutoPauseReason } from '../absence-pause/absence-pause.constants';

/**
 * Status o'zgartirishni KIM so'rayotgani — oshkora, chunki ikki chaqiruvchi
 * ikki xil tekshiruvdan o'tadi.
 *
 * Bu ADR-0008 dagi naqsh. «userId yo'q = tekshiruvni o'tkazib yubor» degan
 * JIM qoida o'sha ADR yozilishiga sabab bo'lgan xatoning o'zi: bot — tizimdagi
 * yagona egasiz yo'l edi, filial qorovuli uni rad etdi va xatolik jimgina
 * yutildi. Cron ham xuddi shunday egasiz, shuning uchun u o'zini shunday deb
 * ataydi.
 */
export type StatusChangeActor =
  | { kind: 'user'; id: number }
  | { kind: 'system' };

const STATUS_TO_EXIT_TYPE: Partial<Record<StudentStatus, ExitType>> = {
  FROZEN: ExitType.FREEZE,
  EXPELLED: ExitType.EXPEL,
  INACTIVE: ExitType.INACTIVE,
  ARCHIVED: ExitType.ARCHIVE,
};

@Injectable()
export class StudentsStatusService {
  constructor(
    private prisma: PrismaService,
    private statusHistoryService: StatusHistoryService,
    private statusCascadeService: StatusCascadeService,
    private entityHistoryService: EntityHistoryService,
    private enrollmentBillingService: EnrollmentBillingService,
    private monthlyChargeService: MonthlyChargeService,
  ) {}

  /** Odam qiladigan status o'zgartirish — `PATCH /students/:id/status`. */
  async changeStatus(
    id: number,
    dto: ChangeStudentStatusDto,
    userId: number,
    companyId: number,
  ) {
    return this.applyStatusChange(
      id,
      dto,
      { kind: 'user', id: userId },
      companyId,
    );
  }

  /**
   * Avtomatik pauza — cron chaqiradigan yagona kirish nuqtasi.
   *
   * Nega alohida metod, `applyStatusChange` ni ochiq qilish emas: bu yo'l
   * FAQAT `ACTIVE → FROZEN` ni biladi. Tizim aktori filial tekshiruvini
   * chetlab o'tadi, shuning uchun u bajara oladigan amallar ro'yxati eng
   * tor bo'lishi kerak — `EXPELLED` yoki `ARCHIVED` hech qachon avtomatik
   * bo'lmaydi.
   *
   * ACTIVE bo'lmagan o'quvchi JIMGINA o'tkazib yuboriladi: cron nomzodlarni
   * yig'gani bilan pauza qilgani orasida admin uni chiqarib yuborgan yoki
   * o'zi muzlatgan bo'lishi mumkin, va bu xato emas.
   */
  async pauseForAbsence(params: {
    studentId: number;
    companyId: number;
    streak: number;
    lastAbsenceDate: Date;
  }): Promise<void> {
    const student = await this.prisma.student.findFirst({
      where: {
        id: params.studentId,
        deletedAt: null,
        companyId: params.companyId,
      },
      select: { id: true, status: true },
    });
    if (!student || student.status !== StudentStatus.ACTIVE) return;

    await this.applyStatusChange(
      params.studentId,
      {
        status: StudentStatus.FROZEN,
        reason: buildAutoPauseReason(params.streak, params.lastAbsenceDate),
      } as ChangeStudentStatusDto,
      { kind: 'system' },
      params.companyId,
    );
  }

  private async applyStatusChange(
    id: number,
    dto: ChangeStudentStatusDto,
    actor: StatusChangeActor,
    companyId: number,
  ) {
    const actorId = actor.kind === 'user' ? actor.id : undefined;

    const student = await this.prisma.student.findFirst({
      where: { id, deletedAt: null, companyId },
    });

    if (!student) {
      throw new NotFoundException(`O'quvchi topilmadi`);
    }
    // A status change CASCADES: EXPELLED or FROZEN closes this student's
    // enrolments, which stops their lessons and their teacher's accruals. Done
    // to another branch's student that is someone else's roster and someone
    // else's payroll.
    //
    // Cron uchun filial tushunchasi yo'q — u butun kompaniya bo'yicha yuradi.
    // Qamrov o'rniga uni kunlik chegara (fail-closed) va sozlamadagi
    // o'chirish tugmasi ushlab turadi.
    if (actor.kind === 'user') {
      await assertCallerMayTouchStudent(this.prisma, actor.id, id, companyId);
    }

    // GRADUATED is automatic only — set by StatusCascadeService when a
    // group's status flips to COMPLETED. Manual selection is rejected.
    if (dto.status === StudentStatus.GRADUATED) {
      throw new BadRequestException(
        "Bitirgan statusi avtomatik belgilanadi (guruh tugallanganda). Qo'lda tanlash mumkin emas.",
      );
    }

    // Resolve reason: if a reasonId is provided, look it up and verify it
    // applies to this exit type. Otherwise, fall back to free-text reason.
    const exitType = STATUS_TO_EXIT_TYPE[dto.status];
    let reasonId: string | null = null;
    let reasonText: string | null = dto.reason?.trim() || null;

    // Sabab ro'yxati — odam uchun majburiy, tizim uchun ma'nosiz.
    // «Avtomatik pauza» degan qator ro'yxatda yo'q va uni sozlamalarga
    // qo'shish adminni chalg'itardi: u qo'lda tanlanadigan sabab emas.
    // Tizim o'z sababini matn bilan yozadi (`buildAutoPauseReason`) va
    // `reasonId` ni null qoldiradi.
    if (actor.kind === 'user') {
      if (dto.reasonId) {
        if (!exitType) {
          throw new BadRequestException(
            'Bu status uchun sabab tanlash kerak emas',
          );
        }
        const reason = await this.prisma.studentExitReason.findFirst({
          where: {
            id: dto.reasonId,
            companyId,
            deletedAt: null,
            appliesTo: { has: exitType },
          },
        });
        if (!reason) {
          throw new NotFoundException(
            'Sabab topilmadi yoki bu holatga taalluqli emas',
          );
        }
        reasonId = reason.id;
        // "Boshqa sabab" carries no information on its own — the comment IS
        // the reason, so it becomes mandatory. Other reasons keep it optional.
        if (
          exitReasonRequiresComment(reason.name) &&
          (!reasonText || reasonText.length < EXIT_REASON_COMMENT_MIN_LENGTH)
        ) {
          throw new BadRequestException(EXIT_REASON_COMMENT_ERROR);
        }
        // Use the reason name as the audit text (free-text reason is appended)
        reasonText = reasonText
          ? `${reason.name} — ${reasonText}`
          : reason.name;
      } else if (exitType) {
        // No reasonId — check whether configured reasons exist for this exit
        // type. If yes, force the user to pick one. If not, fall back to
        // requiring free-text reason.
        const configured = await this.prisma.studentExitReason.count({
          where: {
            companyId,
            deletedAt: null,
            appliesTo: { has: exitType },
          },
        });
        if (configured > 0) {
          throw new BadRequestException('Sababni tanlash majburiy');
        }
        if (!reasonText) {
          throw new BadRequestException('Sababni kiritish majburiy');
        }
      }
    }

    // FROZEN-specific prepaid refund. Runs BEFORE the status flip because
    // the refund helper needs enrollments to still be ACTIVE to find their
    // prepaid counters; the cascade below will move them to FROZEN. We do
    // this in its own Serializable transaction — the outer status flow
    // isn't transactional today and rewriting it is out of scope. Failure
    // here aborts the whole status change (we never reach the cascade).
    //
    // `refundPrepaidForFreeze` (LESSON_PACK) and `refundMonthlyForFreeze`
    // (MONTHLY) below are now TWO separate `$transaction`s run one after
    // the other, not one. For a student holding enrollments in both
    // billing models, the first can commit and the second can throw —
    // leaving the LESSON_PACK money already refunded to balance while the
    // student's status never flips to FROZEN. This straddle did not exist
    // before this method had a second transaction. It is recoverable: a
    // retry re-runs `refundPrepaidForFreeze` safely because it only
    // selects enrollments with `prepaidLessonsRemaining > 0` (or an
    // explicit override), and the first, already-committed run zeroed
    // that counter — so the retry finds nothing left to re-refund on the
    // LESSON_PACK leg and simply proceeds to (retry) the MONTHLY leg.
    let frozenRefundResults: Array<{
      enrollmentId: string;
      refunded: number;
      lessons: number;
      extraReversed: number;
    }> | null = null;
    if (dto.status === StudentStatus.FROZEN) {
      validateFrozenRefundOverrides(dto.frozenRefundOverrides);
      frozenRefundResults = await this.refundPrepaidForFreeze(
        id,
        actorId,
        dto.frozenRefundOverrides,
      );
      // MONTHLY-course counterpart of the refund above. LESSON_PACK
      // enrollments already got their unused prepaid back via
      // `refundPrepaidForFreeze` — this method is deliberately scoped to
      // MONTHLY-course enrollments only (query filter, not a runtime no-op)
      // so the two refund paths never touch the same enrollment.
      await this.refundMonthlyForFreeze(id, actorId, new Date());
    }

    const auditData = await this.statusHistoryService.changeStatus({
      entityType: 'Student',
      entityId: String(id),
      fromStatus: student.status,
      toStatus: dto.status,
      reason: reasonText ?? undefined,
      changedById: actorId,
      companyId: student.companyId ?? undefined,
    });

    const isActive = dto.status === StudentStatus.ACTIVE;

    const updated = await this.prisma.student.update({
      where: { id },
      data: {
        status: dto.status,
        isActive,
        statusChangeReasonId: reasonId,
        ...auditData,
      },
      select: studentSelect,
    });

    await this.entityHistoryService.recordStatusChange({
      entityType: 'Student',
      entityId: id,
      oldValues: { status: student.status },
      newValues: { status: dto.status, reason: reasonText ?? undefined },
      changedById: actorId,
      companyId: student.companyId ?? undefined,
    });

    // Cascade: ARCHIVED/EXPELLED/FROZEN → enrollment larni yangilash
    await this.statusCascadeService.cascade(
      'Student',
      String(id),
      dto.status,
      actorId,
    );

    const formatted = formatStudent(updated);
    if (frozenRefundResults && frozenRefundResults.length > 0) {
      // Surface refund details so the frontend can show a confirmation
      // toast like "3 ta enrollment uchun 200,000 so'm balansga qaytarildi".
      return { ...formatted, frozenRefunds: frozenRefundResults };
    }
    return formatted;
  }

  /**
   * Walk every active enrollment and refund prepaid lessons to balance.
   * The override map (if present) lets the admin tweak the per-enrollment
   * count: smaller value forfeits some prepaid, larger value reverses
   * already-attended lessons too (see refundPrepaidWithOverride for the
   * full mechanics including salary accrual sync).
   *
   * Single Serializable transaction so all refunds either succeed or roll
   * back together — partial completion would leave the student's books in
   * an inconsistent state with no easy recovery path.
   */
  private async refundPrepaidForFreeze(
    studentId: number,
    userId: number | undefined,
    overrides: Record<string, number> | undefined,
  ): Promise<
    Array<{
      enrollmentId: string;
      refunded: number;
      lessons: number;
      extraReversed: number;
    }>
  > {
    const activeEnrollments = await this.prisma.enrollment.findMany({
      where: {
        studentId,
        status: EnrollmentStatus.ACTIVE,
        deletedAt: null,
      },
      select: { id: true, prepaidLessonsRemaining: true },
    });

    const targets = activeEnrollments.filter((e) => {
      const override = overrides?.[e.id];
      // Process if there's anything to refund: either active prepaid OR
      // an explicit override > 0 (admin wants to reverse attended lessons).
      return e.prepaidLessonsRemaining > 0 || (override ?? 0) > 0;
    });

    if (targets.length === 0) return [];

    return this.prisma.$transaction(
      async (tx) => {
        const results: Array<{
          enrollmentId: string;
          refunded: number;
          lessons: number;
          extraReversed: number;
        }> = [];
        for (const enr of targets) {
          const override = overrides?.[enr.id];
          const result =
            await this.enrollmentBillingService.refundPrepaidWithOverride(tx, {
              enrollmentId: enr.id,
              performedById: userId,
              overrideLessons: override,
              reason: "O'quvchi muzlatildi",
            });
          if (result) {
            results.push({ enrollmentId: enr.id, ...result });
          }
        }
        return results;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 15_000,
      },
    );
  }

  /**
   * MONTHLY-course counterpart of `refundPrepaidForFreeze`. Freezing a
   * student is, in money terms, the same operation as their departure from
   * the group — minus closing the enrollment — so this reuses
   * `MonthlyChargeService.reverseChargeForDeparture` rather than
   * recomputing the "o'tmagan darslar puli" arithmetic a second time.
   *
   * Scoped to **MONTHLY-course ACTIVE yozilishlar** at the query level
   * (`group.course.paymentModel === MONTHLY`), not by relying on
   * `reverseChargeForDeparture`'s own no-op for a LESSON_PACK enrollment
   * (it returns `null` there today because no `EnrollmentMonthlyCharge`
   * row exists). `refundPrepaidForFreeze` above has already refunded any
   * LESSON_PACK enrollment's unused prepaid — calling this function on the
   * same enrollment too is exactly how a double refund gets introduced,
   * so the query keeps the two paths mutually exclusive by construction.
   *
   * Single Serializable transaction, same as `refundPrepaidForFreeze` —
   * every balance movement here goes through `TransactionsWriteService`
   * (via `reverseChargeForDeparture`), never new money arithmetic.
   */
  private async refundMonthlyForFreeze(
    studentId: number,
    // `undefined` — TIZIM aktyori (ADR-0008): avtomatik pauza cron'i
    // hech kimning nomidan ish ko'rmaydi. Qo'shni `refundPrepaidForFreeze`
    // ham aynan shu turni oladi, va `reverseChargeForDeparture` ning
    // `performedById` maydoni ixtiyoriy — ya'ni pastda hech narsa
    // o'zgarmaydi. Tor `number` turi bu yerda avtomatik pauzani
    // kompilyatsiyadan o'tkazmasdi.
    userId: number | undefined,
    freezeDate: Date,
  ): Promise<Array<{ enrollmentId: string; refunded: number }>> {
    const activeMonthlyEnrollments = await this.prisma.enrollment.findMany({
      where: {
        studentId,
        status: EnrollmentStatus.ACTIVE,
        deletedAt: null,
        group: { course: { paymentModel: PaymentModel.MONTHLY } },
      },
      select: { id: true, group: { select: { companyId: true } } },
    });

    if (activeMonthlyEnrollments.length === 0) return [];

    return this.prisma.$transaction(
      async (tx) => {
        const results: Array<{ enrollmentId: string; refunded: number }> = [];
        for (const enr of activeMonthlyEnrollments) {
          const result =
            await this.monthlyChargeService.reverseChargeForDeparture(tx, {
              enrollmentId: enr.id,
              departureDate: freezeDate,
              companyId: enr.group.companyId,
              reason: "Muzlatish — o'tmagan darslar puli balansga qaytarildi",
              performedById: userId,
            });
          if (result) {
            results.push({ enrollmentId: enr.id, refunded: result.refunded });
          }
        }
        return results;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 15_000,
      },
    );
  }
}
