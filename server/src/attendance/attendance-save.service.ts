import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  AttendanceMethod,
  AttendanceStatus,
  EnrollmentStatus,
  PaymentModel,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { LessonBillingService } from '../billing/lesson-billing.service';
import { whereUserMayAct } from '../common/auth/blocked-user';
import {
  AttendanceEntryDto,
  SaveAttendanceDto,
} from './dto/save-attendance.dto';
import { LateAttendanceDto } from './dto/late-attendance.dto';
import { AttendanceValidationService } from './attendance-validation.service';
import { assertAttendanceWindowOpen } from './shared/attendance-window-guard';
import { rosterOnDate } from './shared/roster-on-date';
import { closeLessonTask } from '../unmarked-lessons/lesson-task';
import {
  assertMayAnswer,
  findPendingUnmarkedLesson,
} from '../unmarked-lessons/answer-rules';
import {
  UNMARKED_LESSON_HELD,
  type UnmarkedLessonHeldPayload,
} from '../unmarked-lessons/unmarked-lesson-events';

type Tx = Prisma.TransactionClient;

interface ExistingRecord {
  id: string;
  studentId: number;
  status: AttendanceStatus;
  note: string | null;
}

interface StatusChange {
  studentId: number;
  oldStatus: AttendanceStatus | null;
  newStatus: AttendanceStatus;
}

interface WriteResult {
  count: number;
  existingMap: Map<number, ExistingRecord>;
  statusChanges: StatusChange[];
}

// Saving a full roster (15-30 students) issues many serial queries inside one
// Serializable transaction: attendance upsert + lesson billing (balance lock,
// deduction, consumption) + salary accrual (version lookup, upsert,
// teacher-balance lock + update) per entry. Neon serverless adds round-trip
// latency on each. 60s gives comfortable headroom for larger groups; raise
// further if a group regularly times out.
const TX_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 15_000,
  timeout: 60_000,
};

function summary(entries: { status: string }[], action: string, date: string) {
  return {
    action,
    sana: date,
    jami: entries.length,
    keldi: entries.filter((e) => e.status === 'PRESENT').length,
    kelmadi: entries.filter((e) => e.status === 'ABSENT').length,
    kechikdi: entries.filter((e) => e.status === 'LATE').length,
    sababli: entries.filter((e) => e.status === 'EXCUSED').length,
  };
}

@Injectable()
export class AttendanceSaveService {
  private readonly logger = new Logger(AttendanceSaveService.name);

  constructor(
    private prisma: PrismaService,
    private entityHistoryService: EntityHistoryService,
    private lessonBillingService: LessonBillingService,
    private eventEmitter: EventEmitter2,
    private validation: AttendanceValidationService,
  ) {}

  /**
   * Save attendance for a group on a specific date (batch upsert).
   *
   * Balance, prepaid and salary effects are delegated to
   * `LessonBillingService.processAttendanceBilling` — the single source of
   * truth shared with the QR scan flow.
   *
   * A NEW register (no rows yet) is accepted only inside the lesson's own
   * window, for every role (spec 2026-09-29 §3.1). After the lesson it goes
   * through `saveLate`. Editing a register that exists stays open to
   * administrators at any time; a teacher can never edit.
   */
  async save(
    groupId: string,
    date: string,
    dto: SaveAttendanceDto,
    userId: number,
    roles: string[],
    companyId: number,
  ) {
    const { parsedDate, effectiveStartTime, effectiveEndTime } =
      await this.validation.validateLessonDate(groupId, date, companyId, roles);

    const isTeacherOnly =
      roles.length > 0 && roles.every((r) => r === 'Teacher');

    // branchId is required by the billing pipeline — a stable property of
    // the group, read outside the transaction.
    const groupMeta = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: { branchId: true },
    });
    if (!groupMeta) throw new NotFoundException('Guruh topilmadi');

    const results = await this.prisma.$transaction(async (tx) => {
      // Debtors are part of the main roster — anyone may mark them; the
      // payment pipeline settles their unpaid lessons retroactively.
      const enrolled = await tx.enrollment.findMany({
        where: {
          groupId,
          deletedAt: null,
          status: EnrollmentStatus.ACTIVE,
          OR: [{ startDate: null }, { startDate: { lte: parsedDate } }],
        },
        select: { id: true, studentId: true },
      });
      const enrollmentIdByStudent = new Map(
        enrolled.map((e) => [e.studentId, e.id]),
      );
      this.assertFullRoster(enrollmentIdByStudent, dto.entries);

      const existingRecords = await tx.attendance.findMany({
        where: { groupId, date: parsedDate },
      });

      // Teacher can take attendance only once — editing is admin-only.
      if (isTeacherOnly && existingRecords.length > 0) {
        throw new BadRequestException(
          "Davomat olib bo'lingan. Tahrirlash uchun administratorga murojaat qiling",
        );
      }
      // A NEW register only (§3.1) — read inside this transaction so it
      // cannot race the lesson-end sweep's question.
      if (existingRecords.length === 0) {
        await assertAttendanceWindowOpen(tx, {
          groupId,
          date,
          parsedDate,
          times: { startTime: effectiveStartTime, endTime: effectiveEndTime },
        });
      }

      return this.writeEntries(tx, {
        groupId,
        parsedDate,
        branchId: groupMeta.branchId,
        companyId,
        userId,
        isTeacherOnly,
        enrollmentIdByStudent,
        existingRecords,
        entries: dto.entries,
      });
    }, TX_OPTIONS);

    // One history entry per save action (outside the transaction).
    const isUpdate = results.existingMap.size > 0;
    if (isUpdate) {
      await this.entityHistoryService.recordUpdate({
        entityType: 'GroupAttendance',
        entityId: groupId,
        oldValues: summary(
          Array.from(results.existingMap.values()),
          'DAVOMAT_YANGILANDI',
          date,
        ),
        newValues: summary(dto.entries, 'DAVOMAT_YANGILANDI', date),
        changedById: userId,
        companyId,
      });
    } else {
      await this.entityHistoryService.recordCreate({
        entityType: 'GroupAttendance',
        entityId: groupId,
        newValues: summary(dto.entries, 'DAVOMAT_OLINDI', date),
        changedById: userId,
        companyId,
      });
    }

    await this.emitAfterSave({
      groupId,
      date,
      companyId,
      entries: dto.entries,
      statusChanges: results.statusChanges,
      announceCompleted: !isUpdate,
    });

    return { message: 'Davomat muvaffaqiyatli saqlandi', count: results.count };
  }

  /**
   * «Bo'ldi» — the register of a lesson nobody marked before it ended (spec
   * 2026-09-29 §3.4, ADR-0054). The roster is who was in the group that day;
   * the lesson is answered HELD before any billing runs, so
   * `createAccrual`'s lock already sees it and the teacher earns nothing —
   * unless the CEO exempts the lesson, or it predates the rule.
   */
  async saveLate(
    groupId: string,
    date: string,
    dto: LateAttendanceDto,
    userId: number,
    roles: string[],
    companyId: number,
  ) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException(
        "Noto'g'ri sana formati. YYYY-MM-DD formatda kiriting",
      );
    }
    const parsedDate = new Date(`${date}T00:00:00.000Z`);
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, companyId, deletedAt: null },
      select: {
        id: true,
        name: true,
        branchId: true,
        course: { select: { paymentModel: true } },
      },
    });
    if (!group) throw new NotFoundException('Guruh topilmadi');
    if (dto.teacherPayExempt) await this.assertCallerIsCeo(userId);
    const isMonthly = group.course.paymentModel === PaymentModel.MONTHLY;

    const result = await this.prisma.$transaction(async (tx) => {
      const row = await findPendingUnmarkedLesson(tx, {
        groupId,
        date: parsedDate,
        companyId,
      });
      await assertMayAnswer(tx, row, userId, roles);

      const already = await tx.attendance.count({
        where: { groupId, date: parsedDate },
      });
      if (already > 0) {
        throw new BadRequestException(
          'Bu dars uchun davomat allaqachon olingan',
        );
      }

      const roster = await rosterOnDate(tx, groupId, parsedDate);
      const enrollmentIdByStudent = new Map(
        roster.map((e) => [e.studentId, e.id]),
      );
      this.assertFullRoster(enrollmentIdByStudent, dto.entries);

      // A student who has since left is on the register but is not billed in a
      // lesson-pack course: closing their enrollment already refunded the
      // prepaid lessons and zeroed the counter, so bill() would take a whole
      // cycle from a departed student and strand the lessons on a closed
      // enrollment. Monthly billing moves no balance, so it is unaffected.
      const billedEnrollmentIdByStudent = new Map(
        roster
          .filter((e) => isMonthly || e.status === EnrollmentStatus.ACTIVE)
          .map((e) => [e.studentId, e.id]),
      );

      const exempt = row.teacherPayExempt || dto.teacherPayExempt === true;
      await tx.unmarkedLesson.update({
        where: { id: row.id },
        data: {
          status: 'HELD',
          decidedById: userId,
          decidedAt: new Date(),
          teacherPayExempt: exempt,
          ...(dto.teacherPayExempt
            ? { exemptReason: dto.exemptReason?.trim() }
            : {}),
        },
      });

      const written = await this.writeEntries(tx, {
        groupId,
        parsedDate,
        branchId: group.branchId,
        companyId,
        userId,
        isTeacherOnly: false,
        enrollmentIdByStudent: billedEnrollmentIdByStudent,
        existingRecords: [],
        entries: dto.entries,
      });
      await closeLessonTask(tx, row.taskCommentId, userId);
      return { written, exempt };
    }, TX_OPTIONS);

    await this.entityHistoryService.recordCreate({
      entityType: 'GroupAttendance',
      entityId: groupId,
      newValues: {
        ...summary(dto.entries, 'DAVOMAT_KECH_KIRITILDI', date),
        ustozHaqi: result.exempt ? 'yoziladi (CEO istisnosi)' : 'yozilmaydi',
      },
      changedById: userId,
      companyId,
    });

    // No `attendance.completed`: it thanks the teacher for taking the
    // register on time.
    await this.emitAfterSave({
      groupId,
      date,
      companyId,
      entries: dto.entries,
      statusChanges: result.written.statusChanges,
      announceCompleted: false,
    });
    this.eventEmitter.emit(UNMARKED_LESSON_HELD, {
      companyId,
      groupId,
      groupName: group.name,
      date,
      teacherPayExempt: result.exempt,
    } satisfies UnmarkedLessonHeldPayload);

    return {
      message: result.exempt
        ? 'Davomat saqlandi'
        : 'Davomat saqlandi. Ustozga bu dars uchun haq yozilmaydi',
      count: result.written.count,
    };
  }

  /** Every entry must be on the roster, and every roster student must have an entry. */
  private assertFullRoster(
    enrollmentIdByStudent: Map<number, string>,
    entries: AttendanceEntryDto[],
  ): void {
    for (const entry of entries) {
      if (!enrollmentIdByStudent.has(entry.studentId)) {
        throw new BadRequestException(
          `O'quvchi #${entry.studentId} bu guruhga yozilmagan yoki dars sanasi uning boshlanish sanasidan oldin`,
        );
      }
    }
    const submitted = new Set(entries.map((e) => e.studentId));
    const missing = [...enrollmentIdByStudent.keys()].filter(
      (id) => !submitted.has(id),
    );
    if (missing.length > 0) {
      throw new BadRequestException(
        `Davomat saqlash uchun barcha o'quvchilarning holati belgilanishi shart. Belgilanmagan o'quvchilar: ${missing.length} ta`,
      );
    }
  }

  /** Q9: only the CEO, read from the database (ADR-0028), exempts a teacher. */
  private async assertCallerIsCeo(userId: number): Promise<void> {
    const ceo = await this.prisma.user.findFirst({
      where: {
        id: userId,
        ...whereUserMayAct(),
        roles: { some: { role: { name: 'CEO' } } },
      },
      select: { id: true },
    });
    if (!ceo) {
      throw new ForbiddenException(
        'Ustozga haq yozilishini faqat CEO belgilay oladi',
      );
    }
  }

  private async writeEntries(
    tx: Tx,
    ctx: {
      groupId: string;
      parsedDate: Date;
      branchId: number;
      companyId: number;
      userId: number;
      isTeacherOnly: boolean;
      enrollmentIdByStudent: Map<number, string>;
      existingRecords: ExistingRecord[];
      entries: AttendanceEntryDto[];
    },
  ): Promise<WriteResult> {
    const existingMap = new Map(
      ctx.existingRecords.map((r) => [r.studentId, r]),
    );
    const saved: ExistingRecord[] = [];
    const statusChanges: StatusChange[] = [];

    for (const entry of ctx.entries) {
      // Teacher can't write notes
      const note = ctx.isTeacherOnly ? undefined : entry.note;
      const oldStatus = existingMap.get(entry.studentId)?.status ?? null;

      const result = await tx.attendance.upsert({
        where: {
          groupId_studentId_date: {
            groupId: ctx.groupId,
            studentId: entry.studentId,
            date: ctx.parsedDate,
          },
        },
        create: {
          groupId: ctx.groupId,
          studentId: entry.studentId,
          date: ctx.parsedDate,
          status: entry.status,
          note: note ?? null,
          markedById: ctx.userId,
          markedMethod: AttendanceMethod.MANUAL,
          companyId: ctx.companyId,
        },
        update: {
          status: entry.status,
          ...(note !== undefined && { note: note ?? null }),
          markedById: ctx.userId,
          markedMethod: AttendanceMethod.MANUAL,
        },
      });
      saved.push(result);
      statusChanges.push({
        studentId: entry.studentId,
        oldStatus,
        newStatus: entry.status,
      });

      // Single billing pipeline shared with QR. Handles all four transitions
      // (new+billable / new+non-billable / flip-on / flip-off), idempotent
      // re-saves, and prepaid restoration.
      const enrollmentId = ctx.enrollmentIdByStudent.get(entry.studentId);
      if (enrollmentId) {
        await this.lessonBillingService.processAttendanceBilling(tx, {
          attendanceId: result.id,
          enrollmentId,
          studentId: entry.studentId,
          groupId: ctx.groupId,
          branchId: ctx.branchId,
          lessonDate: ctx.parsedDate,
          oldStatus,
          newStatus: entry.status,
          companyId: ctx.companyId,
          performedById: ctx.userId,
        });
      }
    }

    await this.consumePlannedAbsences(tx, ctx.groupId, ctx.parsedDate, saved);
    return { count: saved.length, existingMap, statusChanges };
  }

  /**
   * Pre-marks for the date are consumed once the real register is saved, so
   * they stop pre-filling the form. A pre-mark never billed (it was not an
   * Attendance row); the final status is usually EXCUSED, which takes the
   * existing no-bill path. A pre-marked student saved as EXCUSED with an
   * empty note gets an "Oldindan: sababli/sababsiz" marker (teachers cannot
   * write notes). An existing note is never overwritten.
   */
  private async consumePlannedAbsences(
    tx: Tx,
    groupId: string,
    date: Date,
    saved: ExistingRecord[],
  ): Promise<void> {
    const planned = await tx.plannedAbsence.findMany({
      where: { groupId, date, consumedAt: null },
      select: { studentId: true, kind: true, note: true },
    });
    if (planned.length === 0) return;
    await tx.plannedAbsence.updateMany({
      where: { groupId, date, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    const byStudent = new Map(saved.map((r) => [r.studentId, r]));
    for (const p of planned) {
      const row = byStudent.get(p.studentId);
      if (!row || row.status !== AttendanceStatus.EXCUSED) continue;
      if (row.note && row.note.trim().length > 0) continue;
      const label = p.kind === 'SABABSIZ' ? 'sababsiz' : 'sababli';
      const note = p.note
        ? `Oldindan: ${label} — ${p.note}`
        : `Oldindan: ${label}`;
      await tx.attendance.update({ where: { id: row.id }, data: { note } });
    }
  }

  /**
   * `attendance.completed` goes out only for the first save of the day
   * (single-shot semantics the listener relies on). Per-student
   * `attendance.student.recorded` fires for every entry whose status changed.
   */
  private async emitAfterSave(args: {
    groupId: string;
    date: string;
    companyId: number;
    entries: AttendanceEntryDto[];
    statusChanges: StatusChange[];
    announceCompleted: boolean;
  }): Promise<void> {
    if (args.entries.length === 0) return;
    try {
      const groupInfo = await this.prisma.group.findUnique({
        where: { id: args.groupId },
        select: { name: true, teachers: { select: { teacherId: true } } },
      });
      if (!groupInfo) return;
      if (args.announceCompleted) {
        this.eventEmitter.emit('attendance.completed', {
          groupId: args.groupId,
          groupName: groupInfo.name,
          date: args.date,
          teacherIds: groupInfo.teachers.map((t) => t.teacherId),
          companyId: args.companyId,
          stats: {
            present: args.entries.filter((e) => e.status === 'PRESENT').length,
            absent: args.entries.filter((e) => e.status === 'ABSENT').length,
            late: args.entries.filter((e) => e.status === 'LATE').length,
            excused: args.entries.filter((e) => e.status === 'EXCUSED').length,
          },
        });
      }
      for (const change of args.statusChanges) {
        if (change.oldStatus === change.newStatus) continue;
        this.eventEmitter.emit('attendance.student.recorded', {
          studentId: change.studentId,
          groupId: args.groupId,
          groupName: groupInfo.name,
          date: args.date,
          oldStatus: change.oldStatus,
          newStatus: change.newStatus,
          companyId: args.companyId,
        });
      }
    } catch (err) {
      this.logger.warn(
        `Failed to emit attendance events for group ${args.groupId}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
