import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AttendanceStatus,
  Prisma,
  TransactionType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SalaryAccrualService } from '../salary/salary-accrual.service';
import { UpsertLessonTeacherOverrideDto } from './dto/upsert-lesson-teacher-override.dto';

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
    await this.ensureGroupBelongsToCompany(groupId, companyId);
    await this.ensureTeachersValid(dto.teacherIds, companyId);

    const newTeacherIds = [...new Set(dto.teacherIds)].sort((a, b) => a - b);

    return this.prisma.$transaction(
      async (tx) => {
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
        const newTeacherIds = await this.defaultTeacherIds(tx, existing.groupId);

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
        status: { in: [AttendanceStatus.PRESENT, AttendanceStatus.LATE, AttendanceStatus.ABSENT] },
      },
      select: { id: true, studentId: true },
    });
    if (attendances.length === 0) return;

    const removed = p.oldTeacherIds.filter((id) => !p.newTeacherIds.includes(id));
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
    const consumptionByAttendance = new Map<string, { perLessonCost: number }>();
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

  private async ensureGroupBelongsToCompany(groupId: string, companyId: number) {
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, companyId },
      select: { id: true },
    });
    if (!group) {
      throw new NotFoundException('Guruh topilmadi');
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
    if (!m) throw new BadRequestException('Sana formati YYYY-MM-DD bo\'lishi kerak');
    return new Date(`${dateStr}T00:00:00.000Z`);
  }
}

function arraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
