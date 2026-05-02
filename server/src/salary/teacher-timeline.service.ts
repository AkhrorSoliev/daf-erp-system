import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type TimelineEventKind =
  | 'SalaryChanged'
  | 'GroupAdded'
  | 'GroupRemoved'
  | 'GroupReplaced'
  | 'ProfileUpdated';

export interface TimelineEvent {
  kind: TimelineEventKind;
  at: Date;
  by: { id: number; firstName: string; lastName: string } | null;
  summary: string;
  payload: Record<string, unknown>;
}

/**
 * Merges three streams into a single per-teacher timeline:
 *
 *   1. EmployeeSalaryConfigVersion — salary rate / type changes
 *   2. GroupTeacherHistory — assignments / removals / replacements where
 *      this teacher appears in the before-or-after set
 *   3. EntityHistory (entityType=User) — profile updates
 *
 * Ordered by event time, descending. Powers the teacher profile
 * "Tarix" tab visible to CEO/BD/Administrator.
 */
@Injectable()
export class TeacherTimelineService {
  constructor(private prisma: PrismaService) {}

  async getTimeline(teacherId: number, companyId: number): Promise<TimelineEvent[]> {
    const [salaryVersions, groupHistory, entityHistory] = await Promise.all([
      this.prisma.employeeSalaryConfigVersion.findMany({
        where: { config: { userId: teacherId, companyId } },
        select: {
          id: true,
          salaryType: true,
          value: true,
          effectiveFrom: true,
          createdAt: true,
          config: {
            select: {
              groupId: true,
              group: { select: { name: true } },
            },
          },
          changedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.groupTeacherHistory.findMany({
        where: {
          OR: [
            { previousTeacherIds: { has: teacherId } },
            { newTeacherIds: { has: teacherId } },
          ],
          group: { companyId },
        },
        select: {
          id: true,
          groupId: true,
          previousTeacherIds: true,
          newTeacherIds: true,
          changeType: true,
          changeReason: true,
          createdAt: true,
          group: { select: { name: true } },
          changedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.entityHistory.findMany({
        where: {
          entityType: 'User',
          entityId: String(teacherId),
          companyId,
        },
        select: {
          id: true,
          action: true,
          oldValues: true,
          newValues: true,
          createdAt: true,
          changedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const events: TimelineEvent[] = [];

    for (const v of salaryVersions) {
      const scope = v.config.groupId
        ? `${v.config.group?.name ?? '?'} guruhi uchun`
        : 'umumiy';
      const value =
        v.salaryType === 'PERCENTAGE'
          ? `${v.value}%`
          : `${v.value.toLocaleString('en-US')} so'm`;
      events.push({
        kind: 'SalaryChanged',
        at: v.effectiveFrom,
        by: v.changedBy,
        summary: `Oylik ${scope} ${value} (${v.salaryType}) qilib belgilandi`,
        payload: {
          salaryType: v.salaryType,
          value: v.value,
          groupId: v.config.groupId,
          groupName: v.config.group?.name ?? null,
        },
      });
    }

    for (const h of groupHistory) {
      // Was this teacher being added, removed, or part of a replacement?
      const wasIn = h.previousTeacherIds.includes(teacherId);
      const isIn = h.newTeacherIds.includes(teacherId);

      let kind: TimelineEventKind;
      let summary: string;
      if (!wasIn && isIn) {
        kind = 'GroupAdded';
        summary = `${h.group.name} guruhiga qo'shildi`;
      } else if (wasIn && !isIn) {
        kind = 'GroupRemoved';
        summary = `${h.group.name} guruhidan chiqarildi`;
      } else {
        kind = 'GroupReplaced';
        summary = `${h.group.name} guruhida ustozlar tarkibi o'zgardi`;
      }
      if (h.changeReason) summary += ` (${h.changeReason})`;

      events.push({
        kind,
        at: h.createdAt,
        by: h.changedBy,
        summary,
        payload: {
          groupId: h.groupId,
          groupName: h.group.name,
          previousTeacherIds: h.previousTeacherIds,
          newTeacherIds: h.newTeacherIds,
          changeType: h.changeType,
          changeReason: h.changeReason,
        },
      });
    }

    for (const e of entityHistory) {
      events.push({
        kind: 'ProfileUpdated',
        at: e.createdAt,
        by: e.changedBy,
        summary: `Profil ${e.action.toLowerCase()}`,
        payload: {
          action: e.action,
          oldValues: e.oldValues,
          newValues: e.newValues,
        },
      });
    }

    events.sort((a, b) => b.at.getTime() - a.at.getTime());
    return events;
  }
}
