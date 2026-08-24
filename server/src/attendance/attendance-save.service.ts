import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { LessonBillingService } from '../billing/lesson-billing.service';
import {
  AttendanceMethod,
  AttendanceStatus,
  EnrollmentStatus,
  Prisma,
} from '@prisma/client';
import { SaveAttendanceDto } from './dto/save-attendance.dto';
import { AttendanceValidationService } from './attendance-validation.service';

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
   * Balance, prepaid, and salary effects are delegated to
   * LessonBillingService.processAttendanceBilling — the single source of
   * truth shared with the QR scan flow.
   */
  async save(
    groupId: string,
    date: string,
    dto: SaveAttendanceDto,
    userId: number,
    roles: string[],
    companyId: number,
  ) {
    const { parsedDate } = await this.validation.validateLessonDate(
      groupId,
      date,
      companyId,
      roles,
    );
    const effectiveCompanyId = companyId;

    const isTeacherOnly =
      roles.length > 0 && roles.every((r) => r === 'Teacher');

    // branchId is required by the billing pipeline. Fetched outside the tx —
    // it's a stable property of the group, not a contended row.
    const groupMeta = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: { branchId: true },
    });
    if (!groupMeta) {
      throw new NotFoundException('Guruh topilmadi');
    }

    const results = await this.prisma.$transaction(
      async (tx) => {
        // Validate all students are enrolled in this group. Debtors are now
        // part of the main roster — anyone (teacher or admin) can mark them.
        // When they later top up their balance, payments-write triggers
        // retroactive billing to settle the unpaid lessons.
        const enrolledStudents = await tx.enrollment.findMany({
          where: {
            groupId,
            deletedAt: null,
            status: EnrollmentStatus.ACTIVE,
            OR: [{ startDate: null }, { startDate: { lte: parsedDate } }],
          },
          select: {
            id: true,
            studentId: true,
          },
        });
        const enrollmentIdByStudent = new Map(
          enrolledStudents.map((e) => [e.studentId, e.id]),
        );
        const enrolledStudentIds = new Set(
          enrolledStudents.map((r) => r.studentId),
        );

        for (const entry of dto.entries) {
          if (!enrolledStudentIds.has(entry.studentId)) {
            throw new BadRequestException(
              `O'quvchi #${entry.studentId} bu guruhga yozilmagan yoki dars sanasi uning boshlanish sanasidan oldin`,
            );
          }
        }

        // Full-roster requirement: every active student (debtors included)
        // must be marked. The frontend renders all of them in one list now,
        // so the expected set matches the rendered set exactly.
        const expectedStudentIds = enrolledStudentIds;

        const submittedStudentIds = new Set(
          dto.entries.map((e) => e.studentId),
        );
        const missingStudentIds = [...expectedStudentIds].filter(
          (id) => !submittedStudentIds.has(id),
        );
        if (missingStudentIds.length > 0) {
          throw new BadRequestException(
            `Davomat saqlash uchun barcha o'quvchilarning holati belgilanishi shart. Belgilanmagan o'quvchilar: ${missingStudentIds.length} ta`,
          );
        }

        const existingRecords = await tx.attendance.findMany({
          where: { groupId, date: parsedDate },
        });
        const existingMap = new Map(
          existingRecords.map((r) => [r.studentId, r]),
        );

        // Teacher can take attendance only once — editing is admin-only.
        // Once any attendance record exists for this date, teachers are locked out.
        if (isTeacherOnly && existingRecords.length > 0) {
          throw new BadRequestException(
            "Davomat olib bo'lingan. Tahrirlash uchun administratorga murojaat qiling",
          );
        }

        const upsertResults: Awaited<
          ReturnType<typeof tx.attendance.upsert>
        >[] = [];
        const statusChanges: {
          studentId: number;
          oldStatus: AttendanceStatus | null;
          newStatus: AttendanceStatus;
        }[] = [];
        for (const entry of dto.entries) {
          // Teacher can't write notes
          const note = isTeacherOnly ? undefined : entry.note;
          const oldStatus = existingMap.get(entry.studentId)?.status ?? null;

          const result = await tx.attendance.upsert({
            where: {
              groupId_studentId_date: {
                groupId,
                studentId: entry.studentId,
                date: parsedDate,
              },
            },
            create: {
              groupId,
              studentId: entry.studentId,
              date: parsedDate,
              status: entry.status,
              note: note ?? null,
              markedById: userId,
              markedMethod: AttendanceMethod.MANUAL,
              companyId: effectiveCompanyId,
            },
            update: {
              status: entry.status,
              ...(note !== undefined && { note: note ?? null }),
              markedById: userId,
              markedMethod: AttendanceMethod.MANUAL,
            },
          });
          upsertResults.push(result);
          statusChanges.push({
            studentId: entry.studentId,
            oldStatus,
            newStatus: entry.status,
          });

          // Single billing pipeline shared with QR. Handles all four
          // transitions (new+billable / new+non-billable / flip-on / flip-off),
          // idempotent re-saves, and prepaid restoration.
          const enrollmentId = enrollmentIdByStudent.get(entry.studentId);
          if (enrollmentId) {
            await this.lessonBillingService.processAttendanceBilling(tx, {
              attendanceId: result.id,
              enrollmentId,
              studentId: entry.studentId,
              groupId,
              branchId: groupMeta.branchId,
              lessonDate: parsedDate,
              oldStatus,
              newStatus: entry.status,
              companyId: effectiveCompanyId,
              performedById: userId,
            });
          }
        }

        // Oldindan belgilangan kelmasliklarni "consume" qilamiz — yakuniy
        // davomat olingach ular formada qayta ko'rinmasligi uchun. Pre-mark
        // hech qachon bill qilmagan (u Attendance emas edi); yakuniy status
        // odatda EXCUSED bo'ladi va u mavjud "EXCUSED bill qilmaydi" yo'lidan
        // o'tadi.
        const plannedToConsume = await tx.plannedAbsence.findMany({
          where: { groupId, date: parsedDate, consumedAt: null },
          select: { studentId: true, kind: true, note: true },
        });
        if (plannedToConsume.length > 0) {
          await tx.plannedAbsence.updateMany({
            where: { groupId, date: parsedDate, consumedAt: null },
            data: { consumedAt: new Date() },
          });

          // Sababli/sababsiz belgisini saqlab qolamiz: oldindan belgilangan
          // o'quvchi yakuniy davomatda EXCUSED bo'lsa va izoh bo'sh bo'lsa
          // (ustoz izoh yoza olmaydi), izohga "Oldindan: sababli/sababsiz"
          // markerini yozamiz. Mavjud (admin yozgan) izohni hech qachon
          // ustiga yozmaymiz.
          const upsertByStudent = new Map(
            upsertResults.map((r) => [r.studentId, r]),
          );
          for (const planned of plannedToConsume) {
            const saved = upsertByStudent.get(planned.studentId);
            if (!saved || saved.status !== AttendanceStatus.EXCUSED) continue;
            if (saved.note && saved.note.trim().length > 0) continue;
            const label = planned.kind === 'SABABSIZ' ? 'sababsiz' : 'sababli';
            const note = planned.note
              ? `Oldindan: ${label} — ${planned.note}`
              : `Oldindan: ${label}`;
            await tx.attendance.update({
              where: { id: saved.id },
              data: { note },
            });
          }
        }

        return { upsertResults, existingMap, statusChanges };
      },
      {
        // Saving attendance for a full roster (15-30 students) issues many
        // serial queries inside a single Serializable transaction:
        // attendance upsert + lesson billing (balance lock, deduction,
        // consumption) + salary accrual (version lookup, upsert,
        // teacher-balance lock + update) per entry. Neon serverless adds
        // round-trip latency on each. 60s gives comfortable headroom for
        // larger groups; raise further if a group regularly times out.
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 15_000,
        timeout: 60_000,
      },
    );

    // Record a single history entry per save action (outside transaction)
    const buildSummary = (
      entries: { status: string }[],
      actionLabel: string,
    ) => ({
      action: actionLabel,
      sana: date,
      jami: entries.length,
      keldi: entries.filter((e) => e.status === 'PRESENT').length,
      kelmadi: entries.filter((e) => e.status === 'ABSENT').length,
      kechikdi: entries.filter((e) => e.status === 'LATE').length,
      sababli: entries.filter((e) => e.status === 'EXCUSED').length,
    });

    const isUpdate = results.existingMap.size > 0;

    if (isUpdate) {
      const oldEntries = Array.from(results.existingMap.values());
      await this.entityHistoryService.recordUpdate({
        entityType: 'GroupAttendance',
        entityId: groupId,
        oldValues: buildSummary(oldEntries, 'DAVOMAT_YANGILANDI'),
        newValues: buildSummary(dto.entries, 'DAVOMAT_YANGILANDI'),
        changedById: userId,
        companyId: effectiveCompanyId,
      });
    } else {
      await this.entityHistoryService.recordCreate({
        entityType: 'GroupAttendance',
        entityId: groupId,
        newValues: buildSummary(dto.entries, 'DAVOMAT_OLINDI'),
        changedById: userId,
        companyId: effectiveCompanyId,
      });
    }

    // Fire `attendance.completed` only on the first save of the day. The
    // listener sends a stats summary to the group's teachers across the 4
    // notification channels and relies on this single-shot semantics.
    // Per-student `attendance.student.recorded` events fire on every save
    // for entries whose status actually changed — so an admin editing a
    // single student's status later still triggers the personal Telegram
    // ping to that student.
    if (dto.entries.length > 0) {
      try {
        const groupInfo = await this.prisma.group.findUnique({
          where: { id: groupId },
          select: {
            name: true,
            teachers: { select: { teacherId: true } },
          },
        });
        if (groupInfo) {
          if (!isUpdate) {
            this.eventEmitter.emit('attendance.completed', {
              groupId,
              groupName: groupInfo.name,
              date,
              teacherIds: groupInfo.teachers.map((t) => t.teacherId),
              companyId: effectiveCompanyId,
              stats: {
                present: dto.entries.filter((e) => e.status === 'PRESENT')
                  .length,
                absent: dto.entries.filter((e) => e.status === 'ABSENT').length,
                late: dto.entries.filter((e) => e.status === 'LATE').length,
                excused: dto.entries.filter((e) => e.status === 'EXCUSED')
                  .length,
              },
            });
          }

          for (const change of results.statusChanges) {
            if (change.oldStatus === change.newStatus) continue;
            this.eventEmitter.emit('attendance.student.recorded', {
              studentId: change.studentId,
              groupId,
              groupName: groupInfo.name,
              date,
              oldStatus: change.oldStatus,
              newStatus: change.newStatus,
              companyId: effectiveCompanyId,
            });
          }
        }
      } catch (err) {
        this.logger.warn(
          `Failed to emit attendance events for group ${groupId}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    return {
      message: 'Davomat muvaffaqiyatli saqlandi',
      count: results.upsertResults.length,
    };
  }
}
