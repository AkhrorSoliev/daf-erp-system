import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EnrollmentStatus, PlannedAbsenceKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertCallerMayTouchGroup } from '../common/auth/group-branch-scope';
import { AttendanceValidationService } from '../attendance/attendance-validation.service';
import { EntityHistoryService } from '../common/entity-history';
import { UpsertPlannedAbsenceDto } from './dto/upsert-planned-absence.dto';

/**
 * "Oldindan davomat belgilash" — an admin pre-marks a student as not-coming
 * BEFORE the lesson is taken (e.g. the student calls in the morning for an
 * afternoon lesson).
 *
 * A `PlannedAbsence` is deliberately NOT an `Attendance` row, so it:
 *   - never bills (the billing pipeline only sees real attendance rows),
 *   - never triggers the teacher-once lock (the teacher can still take the
 *     full roster later),
 *   - is not counted by stats / absence-streak queries.
 *
 * When the full attendance is finally saved, `AttendanceSaveService.save()`
 * stamps `consumedAt` on the matching rows so they stop pre-filling the form.
 */
@Injectable()
export class PlannedAbsencesService {
  constructor(
    private prisma: PrismaService,
    private validation: AttendanceValidationService,
    private entityHistory: EntityHistoryService,
  ) {}

  private kindLabel(kind: PlannedAbsenceKind): string {
    return kind === PlannedAbsenceKind.SABABLI ? 'sababli' : 'sababsiz';
  }

  async upsert(
    groupId: string,
    date: string,
    dto: UpsertPlannedAbsenceDto,
    userId: number,
    roles: string[],
    companyId: number,
  ) {
    // A reason is mandatory for SABABLI (excused) — the admin must record WHY
    // the absence is excused. SABABSIZ ("won't come, no excuse") needs none.
    const note = dto.note?.trim() || undefined;
    if (dto.kind === PlannedAbsenceKind.SABABLI && !note) {
      throw new BadRequestException(
        'Sababli (uzrli) belgilash uchun sabab kiritilishi shart',
      );
    }

    // `validateLessonDate` below checks the group exists in this company and
    // that the date is a real, non-cancelled lesson — it says nothing about
    // whether THIS caller may act on that group. A pre-mark seeds the
    // attendance form, so an unguarded one lets a director stage another
    // branch's register.
    //
    // Placed after the body validation, not before: a malformed request is
    // rejected without touching the database at all, and the group named in a
    // malformed request was never going to be acted on.
    await assertCallerMayTouchGroup(this.prisma, userId, roles, groupId);

    // 1. Reuse the attendance lesson-date validation. The caller is always
    // CEO / Branch Director / Administrator (controller @Roles), so the lesson
    // time window is bypassed — pre-marking today-before-the-lesson and any
    // future scheduled date both pass. Covers: date format, group exists +
    // ACTIVE + company scope, date range, schedule day / reschedule, lesson
    // cancellation, and holiday.
    const { parsedDate } = await this.validation.validateLessonDate(
      groupId,
      date,
      companyId,
      roles,
    );

    // 2. Student must have an active, already-started enrollment in this group
    // on the lesson date — the exact predicate the attendance roster uses, so
    // a pre-mark can only target someone who would actually be on the roster
    // (handles late-joiner startDate, frozen, and dropped students).
    const enrollment = await this.prisma.enrollment.findFirst({
      where: {
        groupId,
        studentId: dto.studentId,
        deletedAt: null,
        status: EnrollmentStatus.ACTIVE,
        OR: [{ startDate: null }, { startDate: { lte: parsedDate } }],
      },
      select: { id: true },
    });
    if (!enrollment) {
      throw new BadRequestException(
        "O'quvchi bu guruhga yozilmagan yoki dars sanasi uning boshlanish sanasidan oldin",
      );
    }

    // 3. If real attendance already exists, there is nothing to pre-mark —
    // the admin should edit the attendance directly instead.
    const existingAttendance = await this.prisma.attendance.findUnique({
      where: {
        groupId_studentId_date: {
          groupId,
          studentId: dto.studentId,
          date: parsedDate,
        },
      },
      select: { id: true },
    });
    if (existingAttendance) {
      throw new BadRequestException(
        'Bu dars uchun davomat allaqachon olingan — oldindan belgilash kerak emas',
      );
    }

    // 4. Upsert — idempotent. Re-marking the same student just flips the kind
    // / note (and clears any stale consume flag).
    const planned = await this.prisma.plannedAbsence.upsert({
      where: {
        groupId_studentId_date: {
          groupId,
          studentId: dto.studentId,
          date: parsedDate,
        },
      },
      create: {
        groupId,
        studentId: dto.studentId,
        date: parsedDate,
        kind: dto.kind,
        note: note ?? null,
        createdById: userId,
        companyId,
      },
      update: {
        kind: dto.kind,
        note: note ?? null,
        createdById: userId,
        consumedAt: null,
      },
      select: {
        id: true,
        groupId: true,
        studentId: true,
        date: true,
        kind: true,
        note: true,
        consumedAt: true,
        student: {
          select: { id: true, firstName: true, lastName: true, photo: true },
        },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // 5. Cross-entity audit trail — both the Group and the Student (mandatory
    // per the EntityHistory rules: anything affecting a group's roster / a
    // student's attendance is recorded on both).
    const summary = {
      action: 'DAVOMAT_OLDINDAN_BELGILANDI',
      sana: date,
      oquvchiId: dto.studentId,
      holat: this.kindLabel(dto.kind),
      ...(note ? { sabab: note } : {}),
    };
    await this.entityHistory.recordCreate({
      entityType: 'Group',
      entityId: groupId,
      newValues: summary,
      changedById: userId,
      companyId,
    });
    await this.entityHistory.recordCreate({
      entityType: 'Student',
      entityId: String(dto.studentId),
      newValues: summary,
      changedById: userId,
      companyId,
    });

    return planned;
  }

  async remove(
    id: string,
    userId: number,
    companyId: number,
    roles: string[] = [],
  ) {
    // Only an unconsumed pre-mark can be removed — once the lesson's attendance
    // was finalized the row is consumed and the real Attendance row owns the
    // outcome.
    const planned = await this.prisma.plannedAbsence.findFirst({
      where: { id, companyId, consumedAt: null },
      select: {
        id: true,
        groupId: true,
        studentId: true,
        date: true,
        kind: true,
      },
    });
    if (!planned) {
      throw new NotFoundException('Oldindan belgilash topilmadi');
    }
    // Gated on the pre-mark's own group — the same authority as creating it.
    await assertCallerMayTouchGroup(
      this.prisma,
      userId,
      roles,
      planned.groupId,
    );

    await this.prisma.plannedAbsence.delete({ where: { id: planned.id } });

    const summary = {
      action: 'DAVOMAT_OLDINDAN_BELGILASH_OCHIRILDI',
      oquvchiId: planned.studentId,
      holat: this.kindLabel(planned.kind),
    };
    await this.entityHistory.recordDelete({
      entityType: 'Group',
      entityId: planned.groupId,
      oldValues: summary,
      changedById: userId,
      companyId,
    });
    await this.entityHistory.recordDelete({
      entityType: 'Student',
      entityId: String(planned.studentId),
      oldValues: summary,
      changedById: userId,
      companyId,
    });

    return { message: "Oldindan belgilash o'chirildi" };
  }
}
