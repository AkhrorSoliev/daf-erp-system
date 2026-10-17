import { Injectable } from '@nestjs/common';
import { PaymentModel } from '@prisma/client';
import {
  branchIdWhere,
  type ReportBranchIds,
} from '../../common/finance/report-branch-scope';
import { PrismaService } from '../../prisma/prisma.service';
import {
  supplyClosingRow,
  supplyOpeningRow,
  type EnrollmentStatusEvent,
} from '../../students/shared/enrollment-status-on';
import type {
  CenterFacts,
  CourseFact,
  GroupFact,
  Point,
  RoomFact,
  ScheduleValue,
} from './center-activity.types';
import { normalizeWorkWindow } from './center-points';

/** Snapshot rows whose validity overlaps `[firstAt, lastAt]`. */
const overlap = (firstAt: Date, lastAt: Date) => ({
  validFrom: { lte: lastAt },
  OR: [{ validTo: null }, { validTo: { gt: firstAt } }],
});

function groupBy<K extends string, R extends { [P in K]: string }>(
  rows: R[],
  key: K,
) {
  const m = new Map<string, R[]>();
  for (const r of rows) {
    const list = m.get(r[key]) ?? [];
    list.push(r);
    m.set(r[key], list);
  }
  return m;
}

/**
 * Everything the page needs, read ONCE for a range of months (spec B7b §3).
 *
 * Deleted and closed groups are read on purpose: a group is part of a past
 * month while it was open, and `isGroupOpen` is the one gate. So neither the
 * groups, their enrollments, nor the rooms are filtered by `deletedAt` here.
 * (A group's deletion closes its enrollments in the state log at
 * `group.deletedAt`, `StatusCascadeService.cascadeGroupDeletion`; whether the
 * rows are also stamped `deletedAt` does not matter, because nothing filters
 * on it.)
 *
 * Both logs the readers walk (`statusLog`, `EnrollmentFact.log`) come out
 * ascending by time, then id; each enrollment log also gets its missing
 * opening and closing rows, as the departures loader gives them.
 *
 * // ponytail: no cache — a month is a few hundred groups and a few thousand
 * enrollments; Redis (key: company + branch + month) if it is measured slow.
 */
@Injectable()
export class CenterFactsLoader {
  constructor(private readonly prisma: PrismaService) {}

  async load(
    companyId: number,
    scope: ReportBranchIds,
    firstAt: Date,
    lastAt: Date,
  ): Promise<CenterFacts> {
    const where = {
      companyId,
      ...branchIdWhere(scope),
      createdAt: { lte: lastAt },
    };
    const [roomRows, groupRows] = await Promise.all([
      this.prisma.room.findMany({
        where,
        select: {
          id: true,
          name: true,
          capacity: true,
          status: true,
          branchId: true,
          createdAt: true,
          deletedAt: true,
          branch: {
            select: {
              name: true,
              startOfWorkingDay: true,
              endOfWorkingDay: true,
            },
          },
        },
      }),
      this.prisma.group.findMany({
        where,
        select: {
          id: true,
          name: true,
          roomId: true,
          branchId: true,
          courseId: true,
          exactDays: true,
          lessonStartTime: true,
          lessonEndTime: true,
          startDate: true,
          endDate: true,
          createdAt: true,
          deletedAt: true,
          enrollments: {
            select: {
              id: true,
              createdAt: true,
              statusChangedAt: true,
              status: true,
            },
          },
        },
      }),
    ]);

    const roomIds = roomRows.map((r) => r.id);
    const groupIds = groupRows.map((g) => g.id);
    const enrollmentIds = groupRows.flatMap((g) =>
      g.enrollments.map((e) => e.id),
    );
    const range = overlap(firstAt, lastAt);

    const [capacities, schedules, history, logs] = await Promise.all([
      roomIds.length
        ? this.prisma.roomCapacitySnapshot.findMany({
            where: { roomId: { in: roomIds }, ...range },
            select: {
              roomId: true,
              capacity: true,
              validFrom: true,
              validTo: true,
            },
          })
        : [],
      groupIds.length
        ? this.prisma.groupScheduleSnapshot.findMany({
            where: { groupId: { in: groupIds }, ...range },
            select: {
              groupId: true,
              exactDays: true,
              lessonStartTime: true,
              lessonEndTime: true,
              courseId: true,
              validFrom: true,
              validTo: true,
            },
          })
        : [],
      groupIds.length
        ? this.prisma.statusHistory.findMany({
            where: { entityType: 'Group', entityId: { in: groupIds } },
            select: { entityId: true, toStatus: true, createdAt: true },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          })
        : [],
      enrollmentIds.length
        ? this.prisma.enrollmentStateLog.findMany({
            where: {
              enrollmentId: { in: enrollmentIds },
              transitionAt: { lte: lastAt },
            },
            select: { enrollmentId: true, status: true, transitionAt: true },
            orderBy: [{ transitionAt: 'asc' }, { id: 'asc' }],
          })
        : [],
    ]);

    const courseIds = [
      ...new Set([
        ...groupRows.map((g) => g.courseId),
        ...schedules.map((s) => s.courseId).filter((c): c is string => !!c),
      ]),
    ];
    const [courseRows, prices] = await Promise.all([
      courseIds.length
        ? this.prisma.course.findMany({
            where: { id: { in: courseIds } },
            select: { id: true, name: true, paymentModel: true, price: true },
          })
        : [],
      courseIds.length
        ? this.prisma.coursePriceSnapshot.findMany({
            where: { courseId: { in: courseIds }, ...range },
            select: {
              courseId: true,
              price: true,
              validFrom: true,
              validTo: true,
            },
          })
        : [],
    ]);

    const capByRoom = groupBy(capacities, 'roomId');
    const schedByGroup = groupBy(schedules, 'groupId');
    const statusByGroup = groupBy(history, 'entityId');
    const logByEnrollment = groupBy(logs, 'enrollmentId');
    const priceByCourse = groupBy(prices, 'courseId');

    const rooms: RoomFact[] = roomRows.map((r) => ({
      id: r.id,
      name: r.name,
      branchId: r.branchId,
      branchName: r.branch.name,
      createdAt: r.createdAt,
      deletedAt: r.deletedAt,
      status: r.status,
      capacityNow: r.capacity,
      capacityHistory: (capByRoom.get(r.id) ?? []).map(
        (c): Point<number> => ({
          validFrom: c.validFrom,
          validTo: c.validTo,
          value: c.capacity,
        }),
      ),
      window: normalizeWorkWindow(
        r.branch.startOfWorkingDay,
        r.branch.endOfWorkingDay,
      ),
    }));

    const groups: GroupFact[] = groupRows.map((g) => ({
      id: g.id,
      name: g.name,
      roomId: g.roomId,
      branchId: g.branchId,
      createdAt: g.createdAt,
      startDate: g.startDate,
      endDate: g.endDate,
      deletedAt: g.deletedAt,
      scheduleNow: {
        exactDays: g.exactDays,
        start: g.lessonStartTime,
        end: g.lessonEndTime,
        courseId: g.courseId,
      },
      scheduleHistory: (schedByGroup.get(g.id) ?? []).map(
        (s): Point<ScheduleValue> => ({
          validFrom: s.validFrom,
          validTo: s.validTo,
          value: {
            exactDays: s.exactDays,
            start: s.lessonStartTime,
            end: s.lessonEndTime,
            courseId: s.courseId,
          },
        }),
      ),
      statusLog: (statusByGroup.get(g.id) ?? []).map((h) => ({
        status: h.toStatus,
        at: h.createdAt,
      })),
      enrollments: g.enrollments.map((e) => {
        const log: EnrollmentStatusEvent[] = (
          logByEnrollment.get(e.id) ?? []
        ).map((l) => ({ status: l.status, transitionAt: l.transitionAt }));
        supplyOpeningRow(log, e.createdAt);
        supplyClosingRow(log, e);
        return {
          createdAt: e.createdAt,
          statusChangedAt: e.statusChangedAt,
          status: e.status,
          log,
        };
      }),
    }));

    const courses = new Map<string, CourseFact>(
      courseRows.map((c): [string, CourseFact] => [
        c.id,
        {
          id: c.id,
          name: c.name,
          monthly: c.paymentModel === PaymentModel.MONTHLY,
          priceNow: c.price,
          priceHistory: (priceByCourse.get(c.id) ?? []).map(
            (p): Point<number> => ({
              validFrom: p.validFrom,
              validTo: p.validTo,
              value: p.price,
            }),
          ),
        },
      ]),
    );

    return { rooms, groups, courses };
  }
}
