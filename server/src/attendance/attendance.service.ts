import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { TransactionsService } from '../transactions/transactions.service';
import { SalaryService } from '../salary/salary.service';
import { AttendanceMethod, AttendanceStatus, EnrollmentStatus, GroupStatus, HolidayStatus } from '@prisma/client';
import { SaveAttendanceDto } from './dto/save-attendance.dto';

const DAY_NAME_TO_JS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/** Format a Date as YYYY-MM-DD using LOCAL time (avoids UTC shift from toISOString). */
function toLocalDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const JS_TO_DAY_NAME: Record<number, string> = {
  0: 'Yakshanba',
  1: 'Dushanba',
  2: 'Seshanba',
  3: 'Chorshanba',
  4: 'Payshanba',
  5: 'Juma',
  6: 'Shanba',
};

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    private prisma: PrismaService,
    private entityHistoryService: EntityHistoryService,
    private transactionsService: TransactionsService,
    private salaryService: SalaryService,
  ) {}

  /** Roles that bypass lesson time restriction */
  private static readonly TIME_BYPASS_ROLES = new Set([
    'CEO',
    'Branch Director',
    'Administrator',
  ]);

  /**
   * Validate that a date is a valid lesson date for the given group.
   * Checks: date format, group existence, group status, date range, schedule, holidays, lesson time.
   */
  async validateLessonDate(
    groupId: string,
    date: string,
    companyId?: number,
    roles?: string[],
  ) {
    // 1. Date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException("Noto'g'ri sana formati. YYYY-MM-DD formatda kiriting");
    }
    const parsedDate = new Date(date + 'T00:00:00.000Z');
    if (isNaN(parsedDate.getTime())) {
      throw new BadRequestException("Noto'g'ri sana formati. YYYY-MM-DD formatda kiriting");
    }

    // 2. Group existence + multi-tenant
    const group = await this.prisma.group.findFirst({
      where: {
        id: groupId,
        deletedAt: null,
        ...(companyId && { companyId }),
      },
      select: {
        id: true,
        companyId: true,
        exactDays: true,
        startDate: true,
        endDate: true,
        statusEnum: true,
        lessonStartTime: true,
        lessonEndTime: true,
      },
    });
    if (!group) throw new NotFoundException('Guruh topilmadi');

    // 3. Group must be ACTIVE
    if (group.statusEnum !== GroupStatus.ACTIVE) {
      throw new BadRequestException(
        `Guruh faol emas. Joriy holat: ${group.statusEnum}`,
      );
    }

    // 4. Date within group range
    if (group.startDate && parsedDate < group.startDate) {
      throw new BadRequestException("Bu sana guruh faoliyat muddatiga kirmaydi");
    }
    if (group.endDate && parsedDate > group.endDate) {
      throw new BadRequestException("Bu sana guruh faoliyat muddatiga kirmaydi");
    }

    // 5. Day matches schedule
    const scheduleDays = group.exactDays
      .map((d) => DAY_NAME_TO_JS[d])
      .filter((d) => d !== undefined);
    if (!scheduleDays.includes(parsedDate.getUTCDay())) {
      throw new BadRequestException("Bu kunda dars rejalashtirilmagan");
    }

    // 6. Not a holiday
    const holiday = await this.prisma.holiday.findFirst({
      where: {
        status: HolidayStatus.ACTIVE,
        deletedAt: null,
        date: parsedDate,
      },
      select: { name: true },
    });
    if (holiday) {
      throw new BadRequestException(`Bu sana bayram kuni: ${holiday.name}`);
    }

    // 7. Lesson time check (server time, only for Teacher/Cashier)
    const canBypassTime = roles?.some((r) =>
      AttendanceService.TIME_BYPASS_ROLES.has(r),
    );
    if (!canBypassTime && group.lessonStartTime && group.lessonEndTime) {
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      // Vaqt tekshiruvi faqat bugungi sana uchun amal qiladi
      if (date === todayStr) {
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const [startH, startM] = group.lessonStartTime.split(':').map(Number);
        const [endH, endM] = group.lessonEndTime.split(':').map(Number);
        const lessonStart = startH * 60 + startM;
        const lessonEnd = endH * 60 + endM;

        // 10 daqiqa oldin ochiladi
        const windowStart = lessonStart - 10;

        if (currentMinutes < windowStart) {
          throw new BadRequestException(
            `Davomat dars boshlanishidan 10 daqiqa oldin ochiladi (${group.lessonStartTime})`,
          );
        }
        if (currentMinutes > lessonEnd) {
          throw new BadRequestException(
            `Dars vaqti tugagan (${group.lessonEndTime}). Davomat olish yopilgan`,
          );
        }
      }
    }

    return { group, parsedDate };
  }

  /**
   * Get lesson dates for a group in a given month/year,
   * including attendance summary per date.
   */
  async getLessonDates(groupId: string, month?: number, year?: number, companyId?: number) {
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, deletedAt: null, ...(companyId && { companyId }) },
      select: {
        id: true,
        name: true,
        exactDays: true,
        startDate: true,
        endDate: true,
        _count: {
          select: {
            enrollments: {
              where: { deletedAt: null, status: EnrollmentStatus.ACTIVE },
            },
          },
        },
      },
    });

    if (!group) throw new NotFoundException('Guruh topilmadi');

    const now = new Date();
    const targetMonth = month ? month - 1 : now.getMonth();
    const targetYear = year ?? now.getFullYear();

    // Compute lesson days from group schedule
    const scheduleDays = group.exactDays
      .map((d) => DAY_NAME_TO_JS[d])
      .filter((d) => d !== undefined);

    if (scheduleDays.length === 0) return [];

    // Build date range for the month, clamped to group start/end
    const monthStart = new Date(targetYear, targetMonth, 1);
    const monthEnd = new Date(targetYear, targetMonth + 1, 0);

    const rangeStart =
      group.startDate && group.startDate > monthStart
        ? group.startDate
        : monthStart;
    const rangeEnd =
      group.endDate && group.endDate < monthEnd ? group.endDate : monthEnd;

    if (rangeStart > rangeEnd) return [];

    // Get holidays in range
    const holidays = await this.prisma.holiday.findMany({
      where: {
        status: HolidayStatus.ACTIVE,
        deletedAt: null,
        date: { gte: rangeStart, lte: rangeEnd },
      },
      select: { date: true },
    });
    const holidaySet = new Set(
      holidays.map((h) => toLocalDateStr(h.date)),
    );

    // Generate lesson dates
    const lessonDates: Date[] = [];
    const cursor = new Date(rangeStart);
    while (cursor <= rangeEnd) {
      if (
        scheduleDays.includes(cursor.getDay()) &&
        !holidaySet.has(toLocalDateStr(cursor))
      ) {
        lessonDates.push(new Date(cursor));
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    if (lessonDates.length === 0) return [];

    // Get attendance counts per date
    const attendanceCounts = await this.prisma.attendance.groupBy({
      by: ['date', 'status'],
      where: {
        groupId,
        date: { in: lessonDates },
      },
      _count: true,
    });

    // Build a map: dateStr -> { present, absent, late, excused, total }
    const countMap: Record<
      string,
      { present: number; absent: number; late: number; excused: number; total: number }
    > = {};

    for (const row of attendanceCounts) {
      const dateStr = toLocalDateStr(row.date);
      if (!countMap[dateStr]) {
        countMap[dateStr] = { present: 0, absent: 0, late: 0, excused: 0, total: 0 };
      }
      const count = row._count;
      countMap[dateStr].total += count;
      switch (row.status) {
        case AttendanceStatus.PRESENT:
          countMap[dateStr].present += count;
          break;
        case AttendanceStatus.ABSENT:
          countMap[dateStr].absent += count;
          break;
        case AttendanceStatus.LATE:
          countMap[dateStr].late += count;
          break;
        case AttendanceStatus.EXCUSED:
          countMap[dateStr].excused += count;
          break;
      }
    }

    const totalStudents = group._count.enrollments;

    return lessonDates.map((date) => {
      const dateStr = toLocalDateStr(date);
      const counts = countMap[dateStr];
      return {
        date: dateStr,
        dayName: JS_TO_DAY_NAME[date.getDay()] ?? '',
        hasAttendance: !!counts && counts.total > 0,
        presentCount: counts?.present ?? 0,
        absentCount: counts?.absent ?? 0,
        lateCount: counts?.late ?? 0,
        excusedCount: counts?.excused ?? 0,
        totalStudents,
      };
    });
  }

  /**
   * Get attendance for a group on a specific date.
   * Returns all active enrolled students with their attendance status.
   */
  async getByDate(groupId: string, date: string, companyId?: number, roles?: string[]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(new Date(date).getTime())) {
      throw new BadRequestException("Noto'g'ri sana formati. YYYY-MM-DD formatda kiriting");
    }

    const group = await this.prisma.group.findFirst({
      where: { id: groupId, deletedAt: null, ...(companyId && { companyId }) },
      select: { id: true },
    });
    if (!group) throw new NotFoundException('Guruh topilmadi');

    const parsedDate = new Date(date + 'T00:00:00.000Z');

    // Teacher sees only students with non-negative balance — students who
    // haven't prepaid are invisible to the teacher so they can't be marked
    // present by accident. Admin/CEO see everyone regardless of balance.
    const isTeacherOnly =
      roles && roles.length > 0 && roles.every((r) => r === 'Teacher');

    // Get active enrollments
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        groupId,
        deletedAt: null,
        status: EnrollmentStatus.ACTIVE,
        ...(isTeacherOnly && { student: { balance: { gte: 0 } } }),
      },
      select: {
        studentId: true,
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            photo: true,
          },
        },
      },
      orderBy: { student: { firstName: 'asc' } },
    });

    // Get existing attendance for this date
    const existingAttendance = await this.prisma.attendance.findMany({
      where: { groupId, date: parsedDate },
      select: {
        studentId: true,
        status: true,
        note: true,
      },
    });

    const attendanceMap = new Map(
      existingAttendance.map((a) => [a.studentId, a]),
    );

    return enrollments.map((e) => {
      const att = attendanceMap.get(e.studentId);
      return {
        studentId: e.student.id,
        firstName: e.student.firstName,
        lastName: e.student.lastName,
        photo: e.student.photo,
        status: att?.status ?? null,
        note: att?.note ?? null,
      };
    });
  }

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
    const { group, parsedDate } = await this.validateLessonDate(groupId, date, companyId, roles);
    const effectiveCompanyId = companyId;

    const isTeacherOnly =
      roles.length > 0 && roles.every((r) => r === 'Teacher');

    // Tranzaksiya ichida: enrollment tekshiruvi, mavjud yozuvlar, upsertlar
    const results = await this.prisma.$transaction(async (tx) => {
      // Validate all students are enrolled in this group. Teacher role
      // additionally requires non-negative balance — prevents marking a
      // student whose balance went negative between the getByDate call
      // and the save call.
      const enrolledStudents = await tx.enrollment
        .findMany({
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
      const enrolledStudentIds = new Set(enrolledStudents.map((r) => r.studentId));
      const negativeBalanceIds = isTeacherOnly
        ? new Set(enrolledStudents.filter((r) => r.student.balance < 0).map((r) => r.studentId))
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

      // Get existing records for history
      const existingRecords = await tx.attendance.findMany({
        where: { groupId, date: parsedDate },
      });
      const existingMap = new Map(
        existingRecords.map((r) => [r.studentId, r]),
      );

      const upsertResults: Awaited<ReturnType<typeof tx.attendance.upsert>>[] = [];
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
    await this.processFinancialEffects(groupId, date, dto.entries, effectiveCompanyId);

    return { message: 'Davomat muvaffaqiyatli saqlandi', count: results.upsertResults.length };
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
      (e) => e.status === AttendanceStatus.PRESENT || e.status === AttendanceStatus.LATE,
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
        const cyclesPaid = Math.floor((totalAttended - 1) / lessonPaymentCount) + 1;
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
        this.logger.error(`Cycle deduction check failed for student ${entry.studentId}`, err);
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
          this.logger.error(`Salary accrual failed for teacher ${teacher.teacherId}`, err);
        }
      }
    }
  }

  /**
   * Get attendance statistics for a group within a date range.
   */
  async getStats(groupId: string, startDate?: string, endDate?: string, companyId?: number) {
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, deletedAt: null, ...(companyId && { companyId }) },
      select: {
        id: true,
        exactDays: true,
        startDate: true,
        endDate: true,
      },
    });
    if (!group) throw new NotFoundException('Guruh topilmadi');

    // Determine date range
    const now = new Date();
    const rangeStart = startDate
      ? new Date(startDate + 'T00:00:00.000Z')
      : group.startDate ?? new Date(now.getFullYear(), 0, 1);
    const rangeEnd = endDate
      ? new Date(endDate + 'T00:00:00.000Z')
      : now;

    // Compute total lesson days in range
    const scheduleDays = group.exactDays
      .map((d) => DAY_NAME_TO_JS[d])
      .filter((d) => d !== undefined);

    const holidays = await this.prisma.holiday.findMany({
      where: {
        status: HolidayStatus.ACTIVE,
        deletedAt: null,
        date: { gte: rangeStart, lte: rangeEnd },
      },
      select: { date: true },
    });
    const holidaySet = new Set(
      holidays.map((h) => toLocalDateStr(h.date)),
    );

    let totalLessons = 0;
    const cursor = new Date(rangeStart);
    while (cursor <= rangeEnd) {
      if (
        scheduleDays.includes(cursor.getDay()) &&
        !holidaySet.has(toLocalDateStr(cursor))
      ) {
        totalLessons++;
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    // Get per-student attendance aggregation
    const attendanceData = await this.prisma.attendance.groupBy({
      by: ['studentId', 'status'],
      where: {
        groupId,
        date: { gte: rangeStart, lte: rangeEnd },
      },
      _count: true,
    });

    // Build student stats map
    const statsMap: Record<
      number,
      { present: number; absent: number; late: number; excused: number }
    > = {};

    for (const row of attendanceData) {
      if (!statsMap[row.studentId]) {
        statsMap[row.studentId] = { present: 0, absent: 0, late: 0, excused: 0 };
      }
      switch (row.status) {
        case AttendanceStatus.PRESENT:
          statsMap[row.studentId].present += row._count;
          break;
        case AttendanceStatus.ABSENT:
          statsMap[row.studentId].absent += row._count;
          break;
        case AttendanceStatus.LATE:
          statsMap[row.studentId].late += row._count;
          break;
        case AttendanceStatus.EXCUSED:
          statsMap[row.studentId].excused += row._count;
          break;
      }
    }

    // Get attendance notes (non-null) in the date range
    const attendanceNotes = await this.prisma.attendance.findMany({
      where: {
        groupId,
        date: { gte: rangeStart, lte: rangeEnd },
        note: { not: null },
      },
      select: {
        studentId: true,
        date: true,
        status: true,
        note: true,
        markedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: { date: 'desc' },
    });

    const notesMap: Record<
      number,
      { date: string; status: string; note: string; markedBy: string }[]
    > = {};
    for (const n of attendanceNotes) {
      if (!n.note) continue;
      if (!notesMap[n.studentId]) notesMap[n.studentId] = [];
      notesMap[n.studentId].push({
        date: toLocalDateStr(n.date),
        status: n.status,
        note: n.note,
        markedBy: n.markedBy
          ? `${n.markedBy.firstName} ${n.markedBy.lastName}`
          : 'Tizim',
      });
    }

    // Get enrolled students
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        groupId,
        deletedAt: null,
        status: EnrollmentStatus.ACTIVE,
      },
      select: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            photo: true,
          },
        },
      },
      orderBy: { student: { firstName: 'asc' } },
    });

    const students = enrollments.map((e) => {
      const s = statsMap[e.student.id] ?? {
        present: 0,
        absent: 0,
        late: 0,
        excused: 0,
      };
      const attended = s.present + s.late;
      const percentage =
        totalLessons > 0 ? Math.round((attended / totalLessons) * 100) : 0;
      return {
        id: e.student.id,
        firstName: e.student.firstName,
        lastName: e.student.lastName,
        photo: e.student.photo,
        present: s.present,
        absent: s.absent,
        late: s.late,
        excused: s.excused,
        percentage,
        notes: notesMap[e.student.id] ?? [],
      };
    });

    return { students, totalLessons };
  }
}
