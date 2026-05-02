import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AttendanceStatus, Prisma } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { LessonBillingService } from '../billing/lesson-billing.service';
import { EntityHistoryService } from '../common/entity-history';
import { CreateLessonCancellationDto } from './dto/create-lesson-cancellation.dto';

/**
 * Payload emitted on cancellation create — consumed by
 * `LessonCancellationEventsListener` to fan out Telegram + 4-channel
 * notifications.
 */
export interface LessonCancellationPayload {
  groupId: string;
  cancellationId: string;
  date: string; // YYYY-MM-DD
  reason: string;
  cancelledById: number;
  companyId: number;
}

const DAY_NAME_BY_JS_DAY: Record<number, string> = {
  0: 'sunday',
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday',
};

@Injectable()
export class LessonCancellationsService {
  private readonly logger = new Logger(LessonCancellationsService.name);

  constructor(
    private prisma: PrismaService,
    private lessonBillingService: LessonBillingService,
    private entityHistoryService: EntityHistoryService,
    private eventEmitter: EventEmitter2,
  ) {}

  /**
   * List cancellations for a group, optionally bounded by date range.
   *
   * `teacherIdScope` enforces "you can only see groups you teach" for the
   * Teacher role — without this, any teacher could enumerate other
   * groups' cancellations by typing in a groupId.
   */
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
      if (!isAssigned) {
        // Treat unauthorised as "no cancellations" — a 403 here would
        // leak group existence; an empty list is the same shape as a
        // valid group with no cancellations.
        return [];
      }
    }

    const dateFilter: Prisma.LessonCancellationWhereInput = {};
    if (options?.from) dateFilter.date = { gte: this.parseDate(options.from) };
    if (options?.to) {
      dateFilter.date = {
        ...(dateFilter.date as object),
        lte: this.parseDate(options.to),
      };
    }

    return this.prisma.lessonCancellation.findMany({
      where: {
        groupId,
        companyId,
        deletedAt: null,
        ...dateFilter,
      },
      select: {
        id: true,
        date: true,
        reason: true,
        createdAt: true,
        cancelledBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: { date: 'desc' },
    });
  }

  /**
   * Cancel a single lesson. If attendance was already taken, atomically
   * reverse each affected student's consumption + accrual + restore prepaid.
   *
   * Misol 6 — admin cancels a day with PRESENT records: every PRESENT/LATE
   * is flipped to EXCUSED, cancellationId set, money is held (returns as
   * prepaid +1) so the student doesn't lose value.
   *
   * Misol 7 — cancellation with attendance that had no consumption
   * (insufficient balance): prepaid is NOT incremented (no free lessons).
   */
  async create(
    dto: CreateLessonCancellationDto,
    companyId: number,
    cancelledById: number,
  ) {
    const date = this.parseDate(dto.date);

    const cancellation = await this.prisma.$transaction(
      async (tx) => {
        const group = await tx.group.findFirst({
          where: { id: dto.groupId, companyId, deletedAt: null },
          select: {
            id: true,
            branchId: true,
            name: true,
            exactDays: true,
          },
        });
        if (!group) throw new NotFoundException('Guruh topilmadi');

        // Reject duplicate: there can be only one active cancellation
        // per (groupId, date). Soft-deleted ones are fine — the unique
        // constraint allows re-creation after a delete.
        const existing = await tx.lessonCancellation.findFirst({
          where: { groupId: dto.groupId, date, deletedAt: null },
        });
        if (existing) {
          throw new BadRequestException(
            'Bu kungi dars allaqachon bekor qilingan',
          );
        }

        // Stsenariy D — date is the originalDate of an active reschedule:
        // the lesson has already moved away, cancelling here is meaningless
        // (and would orphan the cancellation row). Steer the admin to the
        // newDate or to deleting the reschedule first.
        const movedAway = await tx.lessonReschedule.findFirst({
          where: { groupId: dto.groupId, originalDate: date, deletedAt: null },
          select: { newDate: true },
        });
        if (movedAway) {
          const newDateStr = movedAway.newDate.toISOString().slice(0, 10);
          throw new BadRequestException(
            `Bu sana boshqa kunga ko'chirilgan (${newDateStr}). Bekor qilish uchun avval ko'chirishni o'chiring yoki yangi sanani (${newDateStr}) bekor qiling.`,
          );
        }

        // Reject dates that aren't actually lesson days: not in exactDays
        // AND not a reschedule.newDate. Cancelling a non-lesson day is a
        // no-op that just clutters the table.
        const dayName = DAY_NAME_BY_JS_DAY[date.getUTCDay()];
        const inExactDays = (group.exactDays ?? []).includes(dayName);
        if (!inExactDays) {
          const movedHere = await tx.lessonReschedule.findFirst({
            where: { groupId: dto.groupId, newDate: date, deletedAt: null },
            select: { id: true },
          });
          if (!movedHere) {
            throw new BadRequestException(
              "Bu sana bu guruh uchun dars kuni emas — bekor qilish ma'nosiz",
            );
          }
        }

        const cancellation = await tx.lessonCancellation.create({
          data: {
            groupId: dto.groupId,
            date,
            reason: dto.reason,
            cancelledById,
            companyId,
          },
        });

        // Reverse all billable attendance for this date. Walk PRESENT / LATE
        // / ABSENT rows (every status that triggers billing under the
        // "lesson held = lesson paid" rule) and for each: flip status to
        // EXCUSED, link cancellationId, run the billing reverse path.
        const billable = await tx.attendance.findMany({
          where: {
            groupId: dto.groupId,
            date,
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
            data: {
              status: AttendanceStatus.EXCUSED,
              cancellationId: cancellation.id,
            },
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
            lessonDate: date,
            oldStatus: a.status,
            newStatus: AttendanceStatus.EXCUSED,
            companyId,
            performedById: cancelledById,
          });
        }

        // Cascade (Stsenariy B / E): if a substitute-teacher override was
        // active on this date, soft-delete it. Salary accruals for those
        // teachers were already reversed by the billing cascade above
        // (processAttendanceBilling reverses each linked SalaryAccrual,
        // regardless of override-routed vs default-routed teachers).
        const overrideOnDate = await tx.lessonTeacherOverride.findFirst({
          where: { groupId: dto.groupId, date, deletedAt: null },
          select: { id: true, teacherIds: true },
        });
        if (overrideOnDate) {
          await tx.lessonTeacherOverride.update({
            where: { id: overrideOnDate.id },
            data: { deletedAt: new Date(), deletedById: cancelledById },
          });
        }

        await this.entityHistoryService.recordCreate({
          entityType: 'LessonCancellation',
          entityId: cancellation.id,
          newValues: {
            action: 'DARS_BEKOR_QILINDI',
            guruh: group.name,
            sana: dto.date,
            sabab: dto.reason,
            tegilganDavomatlar: billable.length,
            orinbosarBekorQilindi: overrideOnDate ? 'ha' : null,
          },
          changedById: cancelledById,
          companyId,
          tx,
        });

        return cancellation;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 15_000,
      },
    );

    // Fire-and-forget event after the tx commits — listener handles
    // Telegram + 4-channel teacher notifications.
    this.eventEmitter.emit('lesson-cancellation.created', {
      groupId: dto.groupId,
      cancellationId: cancellation.id,
      date: dto.date,
      reason: dto.reason,
      cancelledById,
      companyId,
    } satisfies LessonCancellationPayload);

    return cancellation;
  }

  /**
   * Soft-delete a cancellation. Does NOT automatically restore the
   * attendance / consumption / accrual that the create() flow tore down —
   * admins must re-take the attendance manually if the lesson actually
   * happened. This avoids surprising auto-rebill on a typo correction.
   */
  async remove(id: string, companyId: number, userId: number) {
    const cancellation = await this.prisma.lessonCancellation.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!cancellation) {
      throw new NotFoundException('Bekor qilingan dars topilmadi');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.lessonCancellation.update({
        where: { id },
        data: { deletedAt: new Date(), deletedById: userId },
      });
      await this.entityHistoryService.recordDelete({
        entityType: 'LessonCancellation',
        entityId: id,
        oldValues: {
          guruh: cancellation.groupId,
          sana: cancellation.date.toISOString().slice(0, 10),
        },
        changedById: userId,
        companyId,
        tx,
      });
      return { id };
    });
  }

  // ---------- internals ----------

  /**
   * Parse a YYYY-MM-DD into the same Date convention as Attendance.date.
   *
   * Attendance writes use `new Date(\`${date}T00:00:00.000Z\`)` (i.e. the
   * date column carries the literal calendar day at UTC 00:00). The
   * cancellation service must use the *same* convention — earlier we
   * subtracted the Tashkent offset, which produced a different UTC
   * instant and meant cancellation rows didn't match the attendance row's
   * day, so the validation hook silently failed to block writes for the
   * intended lesson.
   */
  private parseDate(input: string): Date {
    return new Date(`${input}T00:00:00.000Z`);
  }
}
