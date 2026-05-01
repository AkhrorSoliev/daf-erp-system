import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AttendanceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LessonBillingService } from '../billing/lesson-billing.service';
import { CreateLessonRescheduleDto } from './dto/create-lesson-reschedule.dto';

/**
 * Per-(groupId, originalDate) lesson move. The scheduled lesson on
 * `originalDate` is moved to `newDate`. Validation downstream:
 *   - attendance writes to `originalDate` are rejected.
 *   - attendance writes to `newDate` are allowed even if the day-of-week
 *     isn't in `Group.exactDays`.
 *
 * On create:
 *   - if attendance was already taken on originalDate, every billable
 *     row (PRESENT / LATE / ABSENT) is flipped to EXCUSED and its
 *     billing reversed via the same cascade `LessonCancellation` uses.
 *     No "cancellation row" is written though — the reschedule row is
 *     the audit anchor instead.
 *   - newDate is intentionally left empty; the admin/teacher takes
 *     attendance on it through the normal flow.
 */
@Injectable()
export class LessonReschedulesService {
  private readonly logger = new Logger(LessonReschedulesService.name);

  constructor(
    private prisma: PrismaService,
    private lessonBillingService: LessonBillingService,
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

    const dateFilter: Prisma.LessonRescheduleWhereInput = {};
    if (options?.from) {
      dateFilter.OR = [
        { originalDate: { gte: this.parseDate(options.from) } },
        { newDate: { gte: this.parseDate(options.from) } },
      ];
    }
    if (options?.to) {
      const to = this.parseDate(options.to);
      const existing = dateFilter.OR ?? [];
      dateFilter.OR = [
        ...existing,
        { originalDate: { lte: to } },
        { newDate: { lte: to } },
      ];
    }

    return this.prisma.lessonReschedule.findMany({
      where: { groupId, companyId, deletedAt: null, ...dateFilter },
      select: {
        id: true,
        originalDate: true,
        newDate: true,
        reason: true,
        createdAt: true,
        scheduledBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: { originalDate: 'desc' },
    });
  }

  async create(
    dto: CreateLessonRescheduleDto,
    companyId: number,
    scheduledById: number,
  ) {
    const originalDate = this.parseDate(dto.originalDate);
    const newDate = this.parseDate(dto.newDate);

    if (originalDate.getTime() === newDate.getTime()) {
      throw new BadRequestException(
        "Asl sana va yangi sana bir xil bo'la olmaydi",
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        const group = await tx.group.findFirst({
          where: { id: dto.groupId, companyId, deletedAt: null },
          select: { id: true, branchId: true, name: true, exactDays: true },
        });
        if (!group) throw new NotFoundException('Guruh topilmadi');

        // Reject duplicate origin
        const existingOrigin = await tx.lessonReschedule.findFirst({
          where: {
            groupId: dto.groupId,
            originalDate,
            deletedAt: null,
          },
        });
        if (existingOrigin) {
          throw new BadRequestException(
            'Bu sanadagi dars allaqachon ko\'chirilgan',
          );
        }

        // Reject duplicate destination
        const existingDestination = await tx.lessonReschedule.findFirst({
          where: { groupId: dto.groupId, newDate, deletedAt: null },
        });
        if (existingDestination) {
          throw new BadRequestException(
            'Yangi sanada boshqa ko\'chirilgan dars allaqachon mavjud',
          );
        }

        // Don't allow moving onto a date that's already a cancelled lesson
        const cancelledOnNew = await tx.lessonCancellation.findFirst({
          where: { groupId: dto.groupId, date: newDate, deletedAt: null },
        });
        if (cancelledOnNew) {
          throw new BadRequestException(
            'Yangi sana — bekor qilingan dars sanasi',
          );
        }

        const reschedule = await tx.lessonReschedule.create({
          data: {
            groupId: dto.groupId,
            originalDate,
            newDate,
            reason: dto.reason ?? null,
            scheduledById,
            companyId,
          },
        });

        // Cascade: if attendance was taken on originalDate, reverse it.
        const billable = await tx.attendance.findMany({
          where: {
            groupId: dto.groupId,
            date: originalDate,
            status: {
              in: [
                AttendanceStatus.PRESENT,
                AttendanceStatus.LATE,
                AttendanceStatus.ABSENT,
              ],
            },
          },
          select: { id: true, studentId: true, status: true },
        });

        for (const a of billable) {
          await tx.attendance.update({
            where: { id: a.id },
            data: { status: AttendanceStatus.EXCUSED },
          });
          const enrollment = await tx.enrollment.findFirst({
            where: {
              groupId: dto.groupId,
              studentId: a.studentId,
              deletedAt: null,
            },
            select: { id: true },
          });
          if (!enrollment) continue;
          await this.lessonBillingService.processAttendanceBilling(tx, {
            attendanceId: a.id,
            enrollmentId: enrollment.id,
            studentId: a.studentId,
            groupId: dto.groupId,
            branchId: group.branchId,
            lessonDate: originalDate,
            oldStatus: a.status,
            newStatus: AttendanceStatus.EXCUSED,
            companyId,
            performedById: scheduledById,
          });
        }

        return reschedule;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 30_000,
      },
    );
  }

  /**
   * Soft delete: removes the reschedule but does NOT auto-restore
   * attendance on either date. Admins must re-take attendance manually
   * on whichever date the lesson actually happened. UI explains this.
   */
  async remove(id: string, companyId: number, userId: number) {
    const existing = await this.prisma.lessonReschedule.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Ko\'chirish topilmadi');
    return this.prisma.lessonReschedule.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: userId },
    });
  }

  private parseDate(dateStr: string): Date {
    const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) {
      throw new BadRequestException('Sana formati YYYY-MM-DD bo\'lishi kerak');
    }
    return new Date(`${dateStr}T00:00:00.000Z`);
  }
}
