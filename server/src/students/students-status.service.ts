import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { EnrollmentStatus, ExitType, Prisma, StudentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StatusHistoryService, StatusCascadeService } from '../common/status';
import { EntityHistoryService } from '../common/entity-history';
import { EnrollmentBillingService } from '../billing/enrollment-billing.service';
import {
  ChangeStudentStatusDto,
  validateFrozenRefundOverrides,
} from './dto/change-student-status.dto';
import { studentSelect, formatStudent } from './shared/student-select';

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
  ) {}

  async changeStatus(
    id: number,
    dto: ChangeStudentStatusDto,
    userId: number,
    companyId: number,
  ) {
    const student = await this.prisma.student.findFirst({
      where: { id, deletedAt: null, companyId },
    });

    if (!student) {
      throw new NotFoundException(`O'quvchi topilmadi`);
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
        throw new NotFoundException('Sabab topilmadi yoki bu holatga taalluqli emas');
      }
      reasonId = reason.id;
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
        throw new BadRequestException("Sababni tanlash majburiy");
      }
      if (!reasonText) {
        throw new BadRequestException("Sababni kiritish majburiy");
      }
    }

    // FROZEN-specific prepaid refund. Runs BEFORE the status flip because
    // the refund helper needs enrollments to still be ACTIVE to find their
    // prepaid counters; the cascade below will move them to FROZEN. We do
    // this in its own Serializable transaction — the outer status flow
    // isn't transactional today and rewriting it is out of scope. Failure
    // here aborts the whole status change (we never reach the cascade).
    let frozenRefundResults:
      | Array<{
          enrollmentId: string;
          refunded: number;
          lessons: number;
          extraReversed: number;
        }>
      | null = null;
    if (dto.status === StudentStatus.FROZEN) {
      validateFrozenRefundOverrides(dto.frozenRefundOverrides);
      frozenRefundResults = await this.refundPrepaidForFreeze(
        id,
        userId,
        dto.frozenRefundOverrides,
      );
    }

    const auditData = await this.statusHistoryService.changeStatus({
      entityType: 'Student',
      entityId: String(id),
      fromStatus: student.status,
      toStatus: dto.status,
      reason: reasonText ?? undefined,
      changedById: userId,
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
      changedById: userId,
      companyId: student.companyId ?? undefined,
    });

    // Cascade: ARCHIVED/EXPELLED/FROZEN → enrollment larni yangilash
    await this.statusCascadeService.cascade(
      'Student',
      String(id),
      dto.status,
      userId,
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
    userId: number,
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
          const result = await this.enrollmentBillingService.refundPrepaidWithOverride(
            tx,
            {
              enrollmentId: enr.id,
              performedById: userId,
              overrideLessons: override,
              reason: "O'quvchi muzlatildi",
            },
          );
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
}
