import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AttendanceStatus, GroupStatus, Prisma } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { assertCallerMayTouchGroup } from '../common/auth/group-branch-scope';
import { LessonBillingService } from '../billing/lesson-billing.service';
import { EntityHistoryService } from '../common/entity-history';
import { CreateLessonRescheduleDto } from './dto/create-lesson-reschedule.dto';
import { UpdateLessonRescheduleDto } from './dto/update-lesson-reschedule.dto';

/**
 * Payload emitted on lesson-reschedule create / update — consumed by
 * `LessonRescheduleEventsListener` to fan out Telegram + 4-channel
 * notifications without coupling that work to the create/update tx.
 */
export interface LessonReschedulePayload {
  groupId: string;
  rescheduleId: string;
  originalDate: string; // YYYY-MM-DD
  newDate: string;
  newRoomId: string | null;
  newLessonStartTime: string | null;
  newLessonEndTime: string | null;
  reason: string | null;
  scheduledById: number;
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
    private entityHistoryService: EntityHistoryService,
    private eventEmitter: EventEmitter2,
  ) {}

  async findByGroup(
    groupId: string,
    companyId: number,
    options?: {
      from?: string;
      to?: string;
      teacherIdScope?: number;
      caller?: { userId: number; roles: string[] };
    },
  ) {
    // Only the teacher branch below was constrained; everyone above a teacher
    // could read any branch's reschedules by naming a group id.
    if (options?.teacherIdScope === undefined && options?.caller) {
      await assertCallerMayTouchGroup(
        this.prisma,
        options.caller.userId,
        options.caller.roles,
        groupId,
      );
    }
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
        newRoomId: true,
        newRoom: { select: { id: true, name: true } },
        newLessonStartTime: true,
        newLessonEndTime: true,
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
    roles: string[] = [],
  ) {
    const reschedule = await this.createInTransaction(
      dto,
      companyId,
      scheduledById,
      roles,
    );
    // Fire-and-forget event after the tx commits — the listener handles
    // Telegram + 4-channel teacher notifications. Errors there are
    // swallowed and never affect the caller.
    this.eventEmitter.emit('lesson-reschedule.created', {
      groupId: dto.groupId,
      rescheduleId: reschedule.id,
      originalDate: dto.originalDate,
      newDate: dto.newDate,
      newRoomId: dto.newRoomId ?? null,
      newLessonStartTime: dto.newLessonStartTime ?? null,
      newLessonEndTime: dto.newLessonEndTime ?? null,
      reason: dto.reason ?? null,
      scheduledById,
      companyId,
    } satisfies LessonReschedulePayload);
    return reschedule;
  }

  private async createInTransaction(
    dto: CreateLessonRescheduleDto,
    companyId: number,
    scheduledById: number,
    roles: string[] = [],
  ) {
    const originalDate = this.parseDate(dto.originalDate);
    const newDate = this.parseDate(dto.newDate);

    if (newDate.getTime() <= originalDate.getTime()) {
      throw new BadRequestException(
        "Yangi sana asl sanadan keyin bo'lishi kerak",
      );
    }

    // Time order check: end > start (when both supplied)
    if (
      dto.newLessonStartTime &&
      dto.newLessonEndTime &&
      dto.newLessonEndTime <= dto.newLessonStartTime
    ) {
      throw new BadRequestException(
        "Dars tugash vaqti boshlanish vaqtidan keyin bo'lishi kerak",
      );
    }
    // Both-or-nothing: if one time is set, both must be set (otherwise the
    // override is half-defined and the validator can't reason about it)
    if (
      (dto.newLessonStartTime && !dto.newLessonEndTime) ||
      (!dto.newLessonStartTime && dto.newLessonEndTime)
    ) {
      throw new BadRequestException(
        'Boshlanish va tugash vaqti birga kiritilishi kerak',
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        // A reschedule rewrites a group's timetable — its date, room and
        // teacher — and through attendance that reaches billing. Checked here
        // rather than before the transaction because the group is read anyway
        // and a refusal rolls the whole thing back.
        await assertCallerMayTouchGroup(tx, scheduledById, roles, dto.groupId);

        const group = await tx.group.findFirst({
          where: { id: dto.groupId, companyId, deletedAt: null },
          select: {
            id: true,
            branchId: true,
            name: true,
            exactDays: true,
            roomId: true,
            lessonStartTime: true,
            lessonEndTime: true,
          },
        });
        if (!group) throw new NotFoundException('Guruh topilmadi');

        // Room scoping: if a room override is given, it must belong to the
        // same branch as the group (and not be soft-deleted).
        if (dto.newRoomId) {
          const room = await tx.room.findFirst({
            where: {
              id: dto.newRoomId,
              branchId: group.branchId,
              deletedAt: null,
            },
            select: { id: true },
          });
          if (!room) {
            throw new BadRequestException(
              "Tanlangan xona ushbu filialga tegishli emas yoki o'chirilgan",
            );
          }
        }

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
            "Bu sanadagi dars allaqachon ko'chirilgan",
          );
        }

        // Reject duplicate destination
        const existingDestination = await tx.lessonReschedule.findFirst({
          where: { groupId: dto.groupId, newDate, deletedAt: null },
        });
        if (existingDestination) {
          throw new BadRequestException(
            "Yangi sanada boshqa ko'chirilgan dars allaqachon mavjud",
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

        // Room availability check on the new date.
        // Resolve effective values: explicit override falls back to group default.
        const effectiveRoomId = dto.newRoomId ?? group.roomId;
        const effectiveStart =
          dto.newLessonStartTime ?? group.lessonStartTime ?? null;
        const effectiveEnd =
          dto.newLessonEndTime ?? group.lessonEndTime ?? null;
        if (effectiveRoomId && effectiveStart && effectiveEnd) {
          await this.assertRoomAvailable(tx, {
            roomId: effectiveRoomId,
            date: newDate,
            startTime: effectiveStart,
            endTime: effectiveEnd,
            excludeGroupId: dto.groupId,
          });
        }

        const reschedule = await tx.lessonReschedule.create({
          data: {
            groupId: dto.groupId,
            originalDate,
            newDate,
            newRoomId: dto.newRoomId ?? null,
            newLessonStartTime: dto.newLessonStartTime ?? null,
            newLessonEndTime: dto.newLessonEndTime ?? null,
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

        // Cascade: any active substitute-teacher override on the originalDate
        // is now stranded (the lesson has moved). Soft-delete it. Salary
        // accruals for those teachers were already reversed by the
        // attendance cascade above (processAttendanceBilling reverses the
        // SalaryAccrual rows linked to each attendance, regardless of
        // whether they were override-routed or default-routed).
        const overrideOnOriginal = await tx.lessonTeacherOverride.findFirst({
          where: { groupId: dto.groupId, date: originalDate, deletedAt: null },
          select: { id: true, teacherIds: true },
        });
        if (overrideOnOriginal) {
          await tx.lessonTeacherOverride.update({
            where: { id: overrideOnOriginal.id },
            data: { deletedAt: new Date(), deletedById: scheduledById },
          });
        }

        await this.entityHistoryService.recordCreate({
          entityType: 'Group',
          entityId: dto.groupId,
          newValues: {
            action: 'DARS_KOCHIRILDI',
            aslSana: dto.originalDate,
            yangiSana: dto.newDate,
            xona: dto.newRoomId ?? null,
            boshlanish: dto.newLessonStartTime ?? null,
            tugash: dto.newLessonEndTime ?? null,
            sabab: dto.reason ?? null,
            tegilganDavomatlar: billable.length,
            orinbosarBekorQilindi: overrideOnOriginal ? 'ha' : null,
          },
          changedById: scheduledById,
          companyId,
          tx,
        });

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
   * Returns the rooms in the group's branch that have no conflicting
   * lesson on `date` within the [startTime, endTime) window. Drives the
   * reschedule dialog's room dropdown so admins only see bookable rooms.
   * Walks the same two sources of truth as `assertRoomAvailable` — kept
   * in sync via `collectBusyRoomIds`.
   */
  async findAvailableRooms(
    params: {
      groupId: string;
      date: string;
      startTime: string;
      endTime: string;
    },
    companyId: number,
  ): Promise<{ id: string; name: string }[]> {
    const dateObj = this.parseDate(params.date);
    if (params.endTime <= params.startTime) {
      throw new BadRequestException(
        "Dars tugash vaqti boshlanish vaqtidan keyin bo'lishi kerak",
      );
    }

    const group = await this.prisma.group.findFirst({
      where: { id: params.groupId, companyId, deletedAt: null },
      select: { id: true, branchId: true },
    });
    if (!group) throw new NotFoundException('Guruh topilmadi');

    const busy = await this.collectBusyRoomIds(this.prisma, {
      companyId,
      branchId: group.branchId,
      date: dateObj,
      startTime: params.startTime,
      endTime: params.endTime,
      excludeGroupId: params.groupId,
    });

    // Only emit the `notIn` clause when we actually have busy rooms — Prisma
    // compiles `notIn: []` to SQL that excludes every row, which would
    // collapse the entire list to zero even when no rooms are taken.
    const busyIds = Array.from(busy);
    return this.prisma.room.findMany({
      where: {
        branchId: group.branchId,
        companyId,
        deletedAt: null,
        ...(busyIds.length > 0 ? { id: { notIn: busyIds } } : {}),
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Edits an existing reschedule. `originalDate` is locked — it's the
   * audit anchor for the cascade that reversed attendance on create, and
   * letting it move would orphan that reversal. Everything else (newDate,
   * room/time overrides, reason) is editable, with the same destination
   * & room-availability checks the create path runs.
   */
  async update(
    id: string,
    dto: UpdateLessonRescheduleDto,
    companyId: number,
    userId: number,
    roles: string[] = [],
  ) {
    // Notify only if a user-visible field actually changes — silent edits
    // to `reason` shouldn't spam students or teachers with "schedule
    // updated" pings. We capture this BEFORE the tx so we know whether
    // to emit after commit.
    const visibleFieldChanged =
      dto.newDate !== undefined ||
      dto.newRoomId !== undefined ||
      dto.newLessonStartTime !== undefined ||
      dto.newLessonEndTime !== undefined;

    const updated = await this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.lessonReschedule.findFirst({
          where: { id, companyId, deletedAt: null },
          select: {
            id: true,
            groupId: true,
            originalDate: true,
            newDate: true,
            newRoomId: true,
            newLessonStartTime: true,
            newLessonEndTime: true,
          },
        });
        if (!existing) throw new NotFoundException("Ko'chirish topilmadi");

        // Checked here rather than before the transaction: the row is already
        // being read, and a refusal rolls everything back anyway.
        await assertCallerMayTouchGroup(tx, userId, roles, existing.groupId);

        const group = await tx.group.findFirst({
          where: { id: existing.groupId, companyId, deletedAt: null },
          select: {
            id: true,
            branchId: true,
            roomId: true,
            lessonStartTime: true,
            lessonEndTime: true,
          },
        });
        if (!group) throw new NotFoundException('Guruh topilmadi');

        // Resolve effective values — fields not in the dto stay as-is.
        const effectiveNewDate =
          dto.newDate !== undefined
            ? this.parseDate(dto.newDate)
            : existing.newDate;
        const effectiveRoomOverride =
          dto.newRoomId !== undefined ? dto.newRoomId : existing.newRoomId;
        const effectiveStartOverride =
          dto.newLessonStartTime !== undefined
            ? dto.newLessonStartTime
            : existing.newLessonStartTime;
        const effectiveEndOverride =
          dto.newLessonEndTime !== undefined
            ? dto.newLessonEndTime
            : existing.newLessonEndTime;

        if (effectiveNewDate.getTime() <= existing.originalDate.getTime()) {
          throw new BadRequestException(
            "Yangi sana asl sanadan keyin bo'lishi kerak",
          );
        }

        if (
          effectiveStartOverride &&
          effectiveEndOverride &&
          effectiveEndOverride <= effectiveStartOverride
        ) {
          throw new BadRequestException(
            "Dars tugash vaqti boshlanish vaqtidan keyin bo'lishi kerak",
          );
        }
        if (
          (effectiveStartOverride && !effectiveEndOverride) ||
          (!effectiveStartOverride && effectiveEndOverride)
        ) {
          throw new BadRequestException(
            'Boshlanish va tugash vaqti birga kiritilishi kerak',
          );
        }

        // Room override scoping — same as create.
        if (effectiveRoomOverride) {
          const room = await tx.room.findFirst({
            where: {
              id: effectiveRoomOverride,
              branchId: group.branchId,
              deletedAt: null,
            },
            select: { id: true },
          });
          if (!room) {
            throw new BadRequestException(
              "Tanlangan xona ushbu filialga tegishli emas yoki o'chirilgan",
            );
          }
        }

        // If newDate is changing, re-run destination checks against the
        // new date so we don't double-book this group there.
        const newDateChanged =
          effectiveNewDate.getTime() !== existing.newDate.getTime();
        if (newDateChanged) {
          const existingDestination = await tx.lessonReschedule.findFirst({
            where: {
              groupId: existing.groupId,
              newDate: effectiveNewDate,
              deletedAt: null,
              id: { not: existing.id },
            },
          });
          if (existingDestination) {
            throw new BadRequestException(
              "Yangi sanada boshqa ko'chirilgan dars allaqachon mavjud",
            );
          }

          const cancelledOnNew = await tx.lessonCancellation.findFirst({
            where: {
              groupId: existing.groupId,
              date: effectiveNewDate,
              deletedAt: null,
            },
          });
          if (cancelledOnNew) {
            throw new BadRequestException(
              'Yangi sana — bekor qilingan dars sanasi',
            );
          }
        }

        // Re-check room availability against the (possibly new) date+time.
        const effectiveRoomId = effectiveRoomOverride ?? group.roomId;
        const effectiveStart =
          effectiveStartOverride ?? group.lessonStartTime ?? null;
        const effectiveEnd =
          effectiveEndOverride ?? group.lessonEndTime ?? null;
        if (effectiveRoomId && effectiveStart && effectiveEnd) {
          await this.assertRoomAvailable(tx, {
            roomId: effectiveRoomId,
            date: effectiveNewDate,
            startTime: effectiveStart,
            endTime: effectiveEnd,
            excludeGroupId: existing.groupId,
          });
        }

        // Build the partial update — only touch fields the caller named.
        const data: Prisma.LessonRescheduleUpdateInput = {};
        if (dto.newDate !== undefined) data.newDate = effectiveNewDate;
        if (dto.newRoomId !== undefined) {
          data.newRoom = dto.newRoomId
            ? { connect: { id: dto.newRoomId } }
            : { disconnect: true };
        }
        if (dto.newLessonStartTime !== undefined) {
          data.newLessonStartTime = dto.newLessonStartTime ?? null;
        }
        if (dto.newLessonEndTime !== undefined) {
          data.newLessonEndTime = dto.newLessonEndTime ?? null;
        }
        if (dto.reason !== undefined) data.reason = dto.reason ?? null;

        const updated = await tx.lessonReschedule.update({
          where: { id: existing.id },
          data,
        });

        await this.entityHistoryService.recordUpdate({
          entityType: 'Group',
          entityId: existing.groupId,
          oldValues: {
            action: 'KOCHIRILGAN_DARS_YANGILANDI',
            yangiSana: existing.newDate.toISOString().slice(0, 10),
            xona: existing.newRoomId ?? null,
            boshlanish: existing.newLessonStartTime ?? null,
            tugash: existing.newLessonEndTime ?? null,
          },
          newValues: {
            action: 'KOCHIRILGAN_DARS_YANGILANDI',
            yangiSana: effectiveNewDate.toISOString().slice(0, 10),
            xona: effectiveRoomOverride ?? null,
            boshlanish: effectiveStartOverride ?? null,
            tugash: effectiveEndOverride ?? null,
          },
          changedById: userId,
          companyId,
          tx,
        });

        return {
          row: updated,
          groupId: existing.groupId,
          originalDateStr: existing.originalDate.toISOString().slice(0, 10),
          effectiveNewDateStr: effectiveNewDate.toISOString().slice(0, 10),
          effectiveRoomOverride,
          effectiveStartOverride,
          effectiveEndOverride,
          reason: dto.reason ?? null,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 30_000,
      },
    );

    if (visibleFieldChanged) {
      this.eventEmitter.emit('lesson-reschedule.updated', {
        groupId: updated.groupId,
        rescheduleId: updated.row.id,
        originalDate: updated.originalDateStr,
        newDate: updated.effectiveNewDateStr,
        newRoomId: updated.effectiveRoomOverride,
        newLessonStartTime: updated.effectiveStartOverride,
        newLessonEndTime: updated.effectiveEndOverride,
        reason: updated.reason,
        scheduledById: userId,
        companyId,
      } satisfies LessonReschedulePayload);
    }
    return updated.row;
  }

  /**
   * Soft delete: removes the reschedule but does NOT auto-restore
   * attendance on either date. Admins must re-take attendance manually
   * on whichever date the lesson actually happened. UI explains this.
   */
  async remove(
    id: string,
    companyId: number,
    userId: number,
    roles: string[] = [],
  ) {
    const existing = await this.prisma.lessonReschedule.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException("Ko'chirish topilmadi");
    await assertCallerMayTouchGroup(
      this.prisma,
      userId,
      roles,
      existing.groupId,
    );
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.lessonReschedule.update({
        where: { id },
        data: { deletedAt: new Date(), deletedById: userId },
      });
      await this.entityHistoryService.recordDelete({
        entityType: 'Group',
        entityId: existing.groupId,
        oldValues: {
          action: 'KOCHIRILGAN_DARS_OCHIRILDI',
          aslSana: existing.originalDate.toISOString().slice(0, 10),
          yangiSana: existing.newDate.toISOString().slice(0, 10),
        },
        changedById: userId,
        companyId,
        tx,
      });
      return row;
    });
  }

  private parseDate(dateStr: string): Date {
    const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) {
      throw new BadRequestException("Sana formati YYYY-MM-DD bo'lishi kerak");
    }
    return new Date(`${dateStr}T00:00:00.000Z`);
  }

  /**
   * Set of room IDs that are taken on `date` within the [startTime, endTime)
   * window in the given branch. Same two sources of truth as
   * `assertRoomAvailable`. Used by `findAvailableRooms` to filter the
   * dropdown so admins only see bookable rooms up front.
   */
  private async collectBusyRoomIds(
    client: Prisma.TransactionClient,
    params: {
      companyId: number;
      branchId: number;
      date: Date;
      startTime: string;
      endTime: string;
      excludeGroupId: string;
    },
  ): Promise<Set<string>> {
    const { companyId, branchId, date, startTime, endTime, excludeGroupId } =
      params;
    const dayName = DAY_NAME_BY_JS_DAY[date.getUTCDay()];
    const busy = new Set<string>();

    const candidateGroups = await client.group.findMany({
      where: {
        id: { not: excludeGroupId },
        companyId,
        branchId,
        deletedAt: null,
        statusEnum: GroupStatus.ACTIVE,
        exactDays: { has: dayName },
        roomId: { not: null },
        AND: [
          { OR: [{ startDate: null }, { startDate: { lte: date } }] },
          { OR: [{ endDate: null }, { endDate: { gte: date } }] },
          { lessonStartTime: { lt: endTime } },
          { lessonEndTime: { gt: startTime } },
        ],
      },
      select: { id: true, roomId: true },
    });

    if (candidateGroups.length > 0) {
      const groupIds = candidateGroups.map((g) => g.id);
      const [cancelled, movedAway] = await Promise.all([
        client.lessonCancellation.findMany({
          where: { groupId: { in: groupIds }, date, deletedAt: null },
          select: { groupId: true },
        }),
        client.lessonReschedule.findMany({
          where: {
            groupId: { in: groupIds },
            originalDate: date,
            deletedAt: null,
          },
          select: { groupId: true },
        }),
      ]);
      const skipIds = new Set([
        ...cancelled.map((c) => c.groupId),
        ...movedAway.map((r) => r.groupId),
      ]);
      for (const g of candidateGroups) {
        if (g.roomId && !skipIds.has(g.id)) busy.add(g.roomId);
      }
    }

    const otherReschedules = await client.lessonReschedule.findMany({
      where: {
        groupId: { not: excludeGroupId },
        newDate: date,
        deletedAt: null,
        group: { branchId, companyId, deletedAt: null },
      },
      select: {
        newRoomId: true,
        newLessonStartTime: true,
        newLessonEndTime: true,
        group: {
          select: {
            roomId: true,
            lessonStartTime: true,
            lessonEndTime: true,
          },
        },
      },
    });
    for (const r of otherReschedules) {
      const otherRoomId = r.newRoomId ?? r.group.roomId;
      if (!otherRoomId) continue;
      const otherStart = r.newLessonStartTime ?? r.group.lessonStartTime;
      const otherEnd = r.newLessonEndTime ?? r.group.lessonEndTime;
      if (!otherStart || !otherEnd) continue;
      if (otherStart < endTime && otherEnd > startTime) {
        busy.add(otherRoomId);
      }
    }

    return busy;
  }

  /**
   * Throws if the given room has any overlapping lesson on `date` in the
   * given time window. Walks two sources of truth:
   *   - groups whose normal schedule (exactDays + lessonStart/EndTime) hits
   *     this room on this weekday — minus those with a cancellation or
   *     a reschedule that moves the lesson AWAY from this date.
   *   - other reschedules that LAND on this date in this room.
   * Times are HH:MM strings; lexicographic compare matches numeric order.
   */
  private async assertRoomAvailable(
    tx: Prisma.TransactionClient,
    params: {
      roomId: string;
      date: Date;
      startTime: string;
      endTime: string;
      excludeGroupId: string;
    },
  ): Promise<void> {
    const { roomId, date, startTime, endTime, excludeGroupId } = params;
    const dayName = DAY_NAME_BY_JS_DAY[date.getUTCDay()];

    const candidateGroups = await tx.group.findMany({
      where: {
        id: { not: excludeGroupId },
        roomId,
        deletedAt: null,
        statusEnum: GroupStatus.ACTIVE,
        exactDays: { has: dayName },
        AND: [
          { OR: [{ startDate: null }, { startDate: { lte: date } }] },
          { OR: [{ endDate: null }, { endDate: { gte: date } }] },
          // Time overlap: otherStart < ourEnd AND otherEnd > ourStart
          { lessonStartTime: { lt: endTime } },
          { lessonEndTime: { gt: startTime } },
        ],
      },
      select: {
        id: true,
        name: true,
        lessonStartTime: true,
        lessonEndTime: true,
      },
    });

    if (candidateGroups.length > 0) {
      const groupIds = candidateGroups.map((g) => g.id);
      const [cancelled, movedAway] = await Promise.all([
        tx.lessonCancellation.findMany({
          where: { groupId: { in: groupIds }, date, deletedAt: null },
          select: { groupId: true },
        }),
        tx.lessonReschedule.findMany({
          where: {
            groupId: { in: groupIds },
            originalDate: date,
            deletedAt: null,
          },
          select: { groupId: true },
        }),
      ]);
      const skipIds = new Set([
        ...cancelled.map((c) => c.groupId),
        ...movedAway.map((r) => r.groupId),
      ]);
      const realConflicts = candidateGroups.filter((g) => !skipIds.has(g.id));
      if (realConflicts.length > 0) {
        const c = realConflicts[0];
        throw new BadRequestException(
          `Tanlangan xona bu vaqtda band: ${c.name} guruhi (${c.lessonStartTime}–${c.lessonEndTime}) shu xonada dars o'tadi`,
        );
      }
    }

    // Other reschedules landing on this date.
    const otherReschedules = await tx.lessonReschedule.findMany({
      where: {
        groupId: { not: excludeGroupId },
        newDate: date,
        deletedAt: null,
      },
      select: {
        newRoomId: true,
        newLessonStartTime: true,
        newLessonEndTime: true,
        group: {
          select: {
            name: true,
            roomId: true,
            lessonStartTime: true,
            lessonEndTime: true,
          },
        },
      },
    });
    for (const r of otherReschedules) {
      const otherRoomId = r.newRoomId ?? r.group.roomId;
      if (otherRoomId !== roomId) continue;
      const otherStart = r.newLessonStartTime ?? r.group.lessonStartTime;
      const otherEnd = r.newLessonEndTime ?? r.group.lessonEndTime;
      if (!otherStart || !otherEnd) continue;
      if (otherStart < endTime && otherEnd > startTime) {
        throw new BadRequestException(
          `Tanlangan xona bu vaqtda band: ${r.group.name} guruhining ko'chirilgan darsi (${otherStart}–${otherEnd}) shu xonada bo'lishi rejalashtirilgan`,
        );
      }
    }
  }
}
