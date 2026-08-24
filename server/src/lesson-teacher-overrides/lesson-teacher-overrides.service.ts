import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AttendanceStatus, Prisma, TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SalaryAccrualService } from '../salary/salary-accrual.service';
import { EntityHistoryService } from '../common/entity-history';
import { UpsertLessonTeacherOverrideDto } from './dto/upsert-lesson-teacher-override.dto';

const DAY_NAME_BY_JS_DAY: Record<number, string> = {
  0: 'sunday',
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday',
};

/**
 * Per-(groupId, date) substitute teacher override. Mirrors LessonCancellation:
 * partial-unique on active rows so soft-deletes don't block re-creation,
 * Serializable cascade through SalaryAccrual on every state change.
 *
 * On upsert/delete, the service walks every attended (PRESENT/LATE/ABSENT)
 * lesson for that (group, date), reverses the existing accruals for the OLD
 * teacher set, then re-creates them for the NEW teacher set against the same
 * coverage tx (`deductionTransactionId`). The student's balance is unaffected
 * — only `userId` (the teacher who earns) changes.
 */
@Injectable()
export class LessonTeacherOverridesService {
  private readonly logger = new Logger(LessonTeacherOverridesService.name);

  constructor(
    private prisma: PrismaService,
    private salaryAccrualService: SalaryAccrualService,
    private entityHistoryService: EntityHistoryService,
  ) {}

  async findByGroup(
    groupId: string,
    companyId: number,
    options?: { from?: string; to?: string; teacherIdScope?: number },
  ) {
    if (options?.teacherIdScope !== undefined) {
      const isAssigned = await this.prisma.groupTeacher.findFirst({
        where: { groupId, teacherId: options.teacherIdScope },
        select: { groupId: true },
      });
      if (!isAssigned) return [];
    }

    const dateFilter: Prisma.LessonTeacherOverrideWhereInput = {};
    if (options?.from) dateFilter.date = { gte: this.parseDate(options.from) };
    if (options?.to) {
      dateFilter.date = {
        ...(dateFilter.date as object),
        lte: this.parseDate(options.to),
      };
    }

    return this.prisma.lessonTeacherOverride.findMany({
      where: { groupId, companyId, deletedAt: null, ...dateFilter },
      select: {
        id: true,
        date: true,
        teacherIds: true,
        reason: true,
        createdAt: true,
        setBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { date: 'desc' },
    });
  }

  /**
   * Idempotent upsert: at most one active override per (groupId, date).
   * Whether this creates a new row or updates an existing one, the recompute
   * path is the same — reverse old accruals, write new ones for the
   * effective teacher list.
   */
  async upsert(
    groupId: string,
    dateStr: string,
    dto: UpsertLessonTeacherOverrideDto,
    companyId: number,
    userId: number,
  ) {
    const date = this.parseDate(dateStr);
    await this.ensureTeachersValid(dto.teacherIds, companyId);

    const newTeacherIds = [...new Set(dto.teacherIds)].sort((a, b) => a - b);

    return this.prisma.$transaction(
      async (tx) => {
        await this.assertOverrideDateValid(tx, groupId, date, companyId);

        const existing = await tx.lessonTeacherOverride.findFirst({
          where: { groupId, date, deletedAt: null },
        });

        const oldTeacherIds = existing
          ? [...existing.teacherIds].sort((a, b) => a - b)
          : await this.defaultTeacherIds(tx, groupId);

        let row;
        if (existing) {
          row = await tx.lessonTeacherOverride.update({
            where: { id: existing.id },
            data: {
              teacherIds: newTeacherIds,
              reason: dto.reason ?? null,
              setById: userId,
            },
          });
        } else {
          row = await tx.lessonTeacherOverride.create({
            data: {
              groupId,
              date,
              teacherIds: newTeacherIds,
              reason: dto.reason ?? null,
              setById: userId,
              companyId,
            },
          });
        }

        if (!arraysEqual(oldTeacherIds, newTeacherIds)) {
          await this.recomputeAccruals(tx, {
            groupId,
            date,
            oldTeacherIds,
            newTeacherIds,
            companyId,
            performedById: userId,
          });
        }

        // Record under entityType: 'Group' so the change appears in the
        // group's "Tarix" tab (cross-entity audit, CLAUDE.md requirement).
        const action = existing
          ? 'ORINBOSAR_USTOZ_YANGILANDI'
          : 'ORINBOSAR_USTOZ_TAYINLANDI';
        if (existing) {
          await this.entityHistoryService.recordUpdate({
            entityType: 'Group',
            entityId: groupId,
            oldValues: {
              action,
              sana: dateStr,
              ustozlar: oldTeacherIds.join(','),
            },
            newValues: {
              action,
              sana: dateStr,
              ustozlar: newTeacherIds.join(','),
              sabab: dto.reason ?? null,
            },
            changedById: userId,
            companyId,
            tx,
          });
        } else {
          await this.entityHistoryService.recordCreate({
            entityType: 'Group',
            entityId: groupId,
            newValues: {
              action,
              sana: dateStr,
              ustozlar: newTeacherIds.join(','),
              sabab: dto.reason ?? null,
            },
            changedById: userId,
            companyId,
            tx,
          });
        }

        return row;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 30_000,
      },
    );
  }

  /**
   * Soft-delete the override. Recomputes accruals back to `Group.teachers`.
   */
  async remove(id: string, companyId: number, userId: number) {
    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.lessonTeacherOverride.findFirst({
          where: { id, companyId, deletedAt: null },
        });
        if (!existing) throw new NotFoundException('Override topilmadi');

        const oldTeacherIds = [...existing.teacherIds].sort((a, b) => a - b);
        const newTeacherIds = await this.defaultTeacherIds(
          tx,
          existing.groupId,
        );

        await tx.lessonTeacherOverride.update({
          where: { id },
          data: { deletedAt: new Date(), deletedById: userId },
        });

        if (!arraysEqual(oldTeacherIds, newTeacherIds)) {
          await this.recomputeAccruals(tx, {
            groupId: existing.groupId,
            date: existing.date,
            oldTeacherIds,
            newTeacherIds,
            companyId,
            performedById: userId,
          });
        }

        await this.entityHistoryService.recordDelete({
          entityType: 'Group',
          entityId: existing.groupId,
          oldValues: {
            action: 'ORINBOSAR_USTOZ_BEKOR_QILINDI',
            sana: existing.date.toISOString().slice(0, 10),
            ustozlar: oldTeacherIds.join(','),
          },
          changedById: userId,
          companyId,
          tx,
        });

        return { id, deletedAt: new Date() };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 30_000,
      },
    );
  }

  // ──────────────────────────────────────────────────────────────────
  // INTERNAL
  // ──────────────────────────────────────────────────────────────────

  private async recomputeAccruals(
    tx: Prisma.TransactionClient,
    p: {
      groupId: string;
      date: Date;
      oldTeacherIds: number[];
      newTeacherIds: number[];
      companyId: number;
      performedById: number;
    },
  ): Promise<void> {
    // Walk every attended student that day. We need the attendance row for
    // its id (links to the consumption tx) and the student id (key for
    // accrual upsert). Cancelled lessons have status EXCUSED with a
    // `cancellationId` link — already reversed; skip.
    const attendances = await tx.attendance.findMany({
      where: {
        groupId: p.groupId,
        date: p.date,
        cancellationId: null,
        status: {
          in: [
            AttendanceStatus.PRESENT,
            AttendanceStatus.LATE,
            AttendanceStatus.ABSENT,
          ],
        },
      },
      select: { id: true, studentId: true },
    });
    if (attendances.length === 0) return;

    const removed = p.oldTeacherIds.filter(
      (id) => !p.newTeacherIds.includes(id),
    );
    const added = p.newTeacherIds.filter((id) => !p.oldTeacherIds.includes(id));

    // Resolve coverage tx + perLessonCost from the most recent active
    // LESSON_CONSUMPTION → its parent LESSON_DEDUCTION. We need this so the
    // newly-created accruals link back to the same paid cycle (B.1).
    const consumptions = await tx.transaction.findMany({
      where: {
        attendanceId: { in: attendances.map((a) => a.id) },
        type: TransactionType.LESSON_CONSUMPTION,
        reversedAt: null,
      },
      select: {
        attendanceId: true,
        metadata: true,
      },
    });
    const consumptionByAttendance = new Map<
      string,
      { perLessonCost: number }
    >();
    for (const c of consumptions) {
      const meta = (c.metadata as { perLessonCost?: number } | null) ?? null;
      if (c.attendanceId && meta?.perLessonCost) {
        consumptionByAttendance.set(c.attendanceId, {
          perLessonCost: meta.perLessonCost,
        });
      }
    }

    // We need the deduction tx that funded each lesson — find the most
    // recent unreversed LESSON_DEDUCTION on the enrollment up to (and
    // including) this date.
    const deductionByEnrollment = new Map<string, string>();

    for (const att of attendances) {
      // Reverse accruals for teachers no longer on the lesson.
      for (const teacherId of removed) {
        await this.salaryAccrualService.reverseAccrualForAttendance({
          teacherId,
          studentId: att.studentId,
          groupId: p.groupId,
          lessonDate: p.date,
          reversedById: p.performedById,
          reversalReason: "O'rinbosar ustoz qoidasi yangilandi",
          tx,
        });
      }

      // Create accruals for newly-assigned teachers.
      const cons = consumptionByAttendance.get(att.id);
      if (!cons) continue; // attendance with no consumption — student had no balance, no accrual to write

      // Look up the funding deduction once per enrollment.
      const enrollment = await tx.enrollment.findFirst({
        where: { studentId: att.studentId, groupId: p.groupId },
        select: { id: true },
      });
      if (!enrollment) continue;
      let deductionTransactionId = deductionByEnrollment.get(enrollment.id);
      if (!deductionTransactionId) {
        const deduction = await tx.transaction.findFirst({
          where: {
            enrollmentId: enrollment.id,
            type: TransactionType.LESSON_DEDUCTION,
            reversedAt: null,
            createdAt: { lte: p.date },
          },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        });
        if (!deduction) continue;
        deductionTransactionId = deduction.id;
        deductionByEnrollment.set(enrollment.id, deductionTransactionId);
      }

      for (const teacherId of added) {
        await this.salaryAccrualService.createAccrual({
          teacherId,
          studentId: att.studentId,
          groupId: p.groupId,
          attendanceId: att.id,
          lessonDate: p.date,
          perLessonCost: cons.perLessonCost,
          companyId: p.companyId,
          deductionTransactionId,
          tx,
        });
      }
    }
  }

  private async defaultTeacherIds(
    tx: Prisma.TransactionClient,
    groupId: string,
  ): Promise<number[]> {
    const teachers = await tx.groupTeacher.findMany({
      where: { groupId },
      select: { teacherId: true },
    });
    return teachers.map((t) => t.teacherId).sort((a, b) => a - b);
  }

  /**
   * Asserts the date is a valid lesson day for the group, considering
   * reschedules + cancellations. Rejects:
   *   - non-existent group
   *   - active cancellation on this date (lesson is gone)
   *   - reschedule where this date is the originalDate (lesson moved AWAY —
   *     the override would be orphaned because attendance can't happen here)
   *   - dates that are neither in `exactDays` nor a reschedule.newDate
   */
  private async assertOverrideDateValid(
    tx: Prisma.TransactionClient,
    groupId: string,
    date: Date,
    companyId: number,
  ): Promise<void> {
    const group = await tx.group.findFirst({
      where: { id: groupId, companyId, deletedAt: null },
      select: { id: true, exactDays: true, startDate: true, endDate: true },
    });
    if (!group) throw new NotFoundException('Guruh topilmadi');

    const cancellation = await tx.lessonCancellation.findFirst({
      where: { groupId, date, deletedAt: null },
      select: { id: true },
    });
    if (cancellation) {
      throw new BadRequestException(
        "Bu sana darsi bekor qilingan — avval bekor qilishni o'chiring",
      );
    }

    const movedAway = await tx.lessonReschedule.findFirst({
      where: { groupId, originalDate: date, deletedAt: null },
      select: { newDate: true },
    });
    if (movedAway) {
      const newDateStr = movedAway.newDate.toISOString().slice(0, 10);
      throw new BadRequestException(
        `Bu sana boshqa kunga ko'chirilgan (${newDateStr}). O'rinbosar yangi sanaga tayinlanishi kerak.`,
      );
    }

    const dayName = DAY_NAME_BY_JS_DAY[date.getUTCDay()];
    const inExactDays = (group.exactDays ?? []).includes(dayName);
    if (!inExactDays) {
      // Date is outside the group's normal schedule — it's only a valid
      // lesson day if a reschedule has moved a lesson onto it.
      const movedHere = await tx.lessonReschedule.findFirst({
        where: { groupId, newDate: date, deletedAt: null },
        select: { id: true },
      });
      if (!movedHere) {
        throw new BadRequestException(
          "Bu sana bu guruh uchun dars kuni emas — o'rinbosar tayinlash mumkin emas",
        );
      }
    }
  }

  private async ensureTeachersValid(teacherIds: number[], companyId: number) {
    const found = await this.prisma.user.findMany({
      where: { id: { in: teacherIds }, companyId, deletedAt: null },
      select: { id: true },
    });
    const foundIds = new Set(found.map((u) => u.id));
    const missing = teacherIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Quyidagi xodim(lar) topilmadi: ${missing.join(', ')}`,
      );
    }
  }

  private parseDate(dateStr: string): Date {
    const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m)
      throw new BadRequestException("Sana formati YYYY-MM-DD bo'lishi kerak");
    return new Date(`${dateStr}T00:00:00.000Z`);
  }
}

function arraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
