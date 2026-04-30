import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { TransactionsService } from '../transactions/transactions.service';
import { SalaryService } from '../salary/salary.service';
import {
  AttendanceMethod,
  AttendanceStatus,
  EnrollmentStatus,
} from '@prisma/client';
import { SaveAttendanceDto } from './dto/save-attendance.dto';
import { AttendanceValidationService } from './attendance-validation.service';

@Injectable()
export class AttendanceSaveService {
  private readonly logger = new Logger(AttendanceSaveService.name);

  constructor(
    private prisma: PrismaService,
    private entityHistoryService: EntityHistoryService,
    private transactionsService: TransactionsService,
    private salaryService: SalaryService,
    private eventEmitter: EventEmitter2,
    private validation: AttendanceValidationService,
  ) {}

  /**
   * Save attendance for a group on a specific date (batch upsert).
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

    const results = await this.prisma.$transaction(async (tx) => {
      // Validate all students are enrolled in this group. Teacher role
      // additionally requires non-negative balance — prevents marking a
      // student whose balance went negative between the getByDate call
      // and the save call.
      const enrolledStudents = await tx.enrollment.findMany({
        where: {
          groupId,
          deletedAt: null,
          status: EnrollmentStatus.ACTIVE,
        },
        select: {
          studentId: true,
          student: { select: { balance: true } },
        },
      });
      const enrolledStudentIds = new Set(
        enrolledStudents.map((r) => r.studentId),
      );
      const negativeBalanceIds = isTeacherOnly
        ? new Set(
            enrolledStudents
              .filter((r) => r.student.balance < 0)
              .map((r) => r.studentId),
          )
        : new Set<number>();

      for (const entry of dto.entries) {
        if (!enrolledStudentIds.has(entry.studentId)) {
          throw new BadRequestException(
            `O'quvchi #${entry.studentId} bu guruhga yozilmagan`,
          );
        }
        if (negativeBalanceIds.has(entry.studentId)) {
          throw new BadRequestException(
            `O'quvchi #${entry.studentId} balansi manfiy — davomat olish mumkin emas`,
          );
        }
      }

      // "Expected" set: every active student the frontend renders for this
      // role (Teacher view filters out negative-balance students; everyone
      // else sees the full roster). Davomatni saqlashdan oldin barcha
      // ko'rsatilgan o'quvchilar uchun status belgilanishi shart — aks
      // holda ba'zi o'quvchilar "na bor, na yo'q" holatida qolib ketadi.
      const expectedStudentIds = isTeacherOnly
        ? new Set(
            enrolledStudents
              .filter((r) => r.student.balance >= 0)
              .map((r) => r.studentId),
          )
        : new Set(enrolledStudentIds);

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
      const existingMap = new Map(existingRecords.map((r) => [r.studentId, r]));

      // Teacher can take attendance only once — editing is admin-only.
      // Once any attendance record exists for this date, teachers are locked out.
      if (isTeacherOnly && existingRecords.length > 0) {
        throw new BadRequestException(
          "Davomat olib bo'lingan. Tahrirlash uchun administratorga murojaat qiling",
        );
      }

      const upsertResults: Awaited<ReturnType<typeof tx.attendance.upsert>>[] =
        [];
      for (const entry of dto.entries) {
        // Teacher can't write notes
        const note = isTeacherOnly ? undefined : entry.note;
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
      }

      return { upsertResults, existingMap };
    });

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

    // === FINANCIAL INTEGRATION: Balance deduction + Salary accrual ===
    await this.processFinancialEffects(
      groupId,
      date,
      dto.entries,
      effectiveCompanyId,
    );

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
                absent: dto.entries.filter((e) => e.status === 'ABSENT')
                  .length,
                late: dto.entries.filter((e) => e.status === 'LATE').length,
                excused: dto.entries.filter((e) => e.status === 'EXCUSED')
                  .length,
              },
            });
          }

          for (const entry of dto.entries) {
            const oldStatus =
              results.existingMap.get(entry.studentId)?.status ?? null;
            if (oldStatus === entry.status) continue;
            this.eventEmitter.emit('attendance.student.recorded', {
              studentId: entry.studentId,
              groupId,
              groupName: groupInfo.name,
              date,
              oldStatus,
              newStatus: entry.status,
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

  /**
   * Process financial effects of attendance:
   * 1. Check if student crossed a payment cycle boundary → deduct full cycle fee
   * 2. Create salary accrual for group teachers (per lesson, per student)
   *
   * Payment model: student pays for N lessons (lessonPaymentCount) at once.
   * When their attended lessons cross a cycle boundary, the next cycle fee is auto-deducted.
   * Example: course.price=800k, lessonPaymentCount=12
   *   Lesson 1-12: already paid (deducted at enrollment)
   *   Lesson 13: crosses boundary → deduct 800k for lessons 13-24
   */
  private async processFinancialEffects(
    groupId: string,
    date: string,
    entries: { studentId: number; status: AttendanceStatus }[],
    companyId: number,
  ) {
    const billableEntries = entries.filter(
      (e) =>
        e.status === AttendanceStatus.PRESENT ||
        e.status === AttendanceStatus.LATE,
    );
    if (billableEntries.length === 0) return;

    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: {
        id: true,
        branchId: true,
        course: { select: { price: true, lessonPaymentCount: true } },
        teachers: { select: { teacherId: true } },
      },
    });
    if (!group) return;

    const { price, lessonPaymentCount: rawLPC } = group.course;
    const lessonPaymentCount = rawLPC || 12;
    const perLessonCost = Math.round(price / lessonPaymentCount);
    const parsedDate = new Date(date + 'T00:00:00.000Z');

    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        groupId,
        studentId: { in: billableEntries.map((e) => e.studentId) },
        status: EnrollmentStatus.ACTIVE,
        deletedAt: null,
      },
      select: { id: true, studentId: true },
    });
    const enrollmentMap = new Map(enrollments.map((e) => [e.studentId, e.id]));

    // Resolve each student's active contract once per batch so LESSON_DEDUCTION
    // rows carry contractId — downstream refund and forecast math reads
    // consumption from the ledger directly instead of recounting attendance.
    const contracts = await this.prisma.contract.findMany({
      where: {
        groupId,
        studentId: { in: billableEntries.map((e) => e.studentId) },
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: { id: true, studentId: true },
    });
    const contractMap = new Map(contracts.map((c) => [c.studentId, c.id]));

    const attendances = await this.prisma.attendance.findMany({
      where: {
        groupId,
        date: parsedDate,
        studentId: { in: billableEntries.map((e) => e.studentId) },
      },
      select: { id: true, studentId: true },
    });
    const attendanceMap = new Map(attendances.map((a) => [a.studentId, a.id]));

    for (const entry of billableEntries) {
      const enrollmentId = enrollmentMap.get(entry.studentId);
      const attendanceId = attendanceMap.get(entry.studentId);
      if (!enrollmentId || !attendanceId) continue;

      // 1. Check cycle boundary → deduct full cycle fee if crossed
      try {
        const totalAttended = await this.prisma.attendance.count({
          where: {
            groupId,
            studentId: entry.studentId,
            status: { in: [AttendanceStatus.PRESENT, AttendanceStatus.LATE] },
          },
        });

        // Cycle boundary: lessonPaymentCount, 2*lessonPaymentCount, etc.
        // First cycle (lessons 1-N) is deducted at enrollment.
        // When totalAttended crosses N, 2N, 3N... → deduct next cycle.
        const cyclesPaid =
          Math.floor((totalAttended - 1) / lessonPaymentCount) + 1;
        const cyclesDeducted = await this.prisma.transaction.count({
          where: {
            studentId: entry.studentId,
            enrollmentId,
            type: 'LESSON_DEDUCTION',
          },
        });

        if (cyclesPaid > cyclesDeducted) {
          // Prepaid guard: only debit the balance when the student has
          // actually prepaid enough to cover this cycle. Otherwise the
          // attendance is recorded, but no deduction runs — and since B.1
          // ties accrual to LESSON_DEDUCTION, the teacher does not accrue
          // salary for this lesson either. This is the core "teachers earn
          // only on paid lessons" business rule.
          const student = await this.prisma.student.findUnique({
            where: { id: entry.studentId },
            select: { balance: true },
          });
          if ((student?.balance ?? 0) >= price) {
            await this.transactionsService.deductLessonFee({
              studentId: entry.studentId,
              amount: price,
              attendanceId,
              enrollmentId,
              contractId: contractMap.get(entry.studentId),
              companyId,
              branchId: group.branchId,
            });
          } else {
            this.logger.warn(
              `Skipping cycle deduction: student ${entry.studentId} balance (${student?.balance ?? 0}) insufficient for cycle fee (${price}) in group ${groupId}`,
            );
          }
        }
      } catch (err) {
        this.logger.error(
          `Cycle deduction check failed for student ${entry.studentId}`,
          err,
        );
      }

      // 2. Coverage lookup for accrual: only earn for paid lessons (B.1).
      const coverage = await this.prisma.transaction.findFirst({
        where: {
          studentId: entry.studentId,
          enrollmentId,
          type: 'LESSON_DEDUCTION',
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (!coverage) {
        this.logger.warn(
          `Skipping salary accrual: student ${entry.studentId} has no payment coverage in group ${groupId}`,
        );
        continue;
      }

      // 3. Salary accrual for each teacher (per lesson, per student)
      for (const teacher of group.teachers) {
        try {
          await this.salaryService.createAccrual({
            teacherId: teacher.teacherId,
            studentId: entry.studentId,
            groupId,
            attendanceId,
            lessonDate: parsedDate,
            perLessonCost,
            companyId,
            deductionTransactionId: coverage.id,
          });
        } catch (err) {
          this.logger.error(
            `Salary accrual failed for teacher ${teacher.teacherId}`,
            err,
          );
        }
      }
    }
  }
}
