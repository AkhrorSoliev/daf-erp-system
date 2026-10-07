import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  USER_DEACTIVATED_EVENT,
  type UserDeactivatedEvent,
} from '../common/events/user-lifecycle.events';
import { lessonTaskAssigneeIds } from './lesson-task';
import {
  TASK_EVENTS,
  toEventTask,
  type TaskReassignedPayload,
} from './task-events';
import { scheduleTaskOutbox } from './task-outbox.service';
import { TASK_CARD_SELECT } from './task-select';
import { OPEN_STATUSES } from './task-transitions';

/** Spec §5.4: nobody's task is left without an owner when they leave. */
@Injectable()
export class TaskUserLifecycleListener {
  private readonly logger = new Logger(TaskUserLifecycleListener.name);

  constructor(
    private prisma: PrismaService,
    private emitter: EventEmitter2,
  ) {}

  @OnEvent(USER_DEACTIVATED_EVENT)
  async onDeactivated(e: UserDeactivatedEvent) {
    const rows = await this.prisma.task
      .findMany({
        where: {
          companyId: e.companyId,
          status: { in: [...OPEN_STATUSES] },
          participants: { some: { userId: e.userId } },
        },
        select: TASK_CARD_SELECT,
      })
      .catch((err: Error) => {
        this.logger.error(
          `reassign on deactivate failed for user ${e.userId}: ${err.message}`,
        );
        return null;
      });
    if (!rows) return;
    // One task failing must not leave the leaver's other tasks behind.
    for (const t of rows) {
      try {
        const mine = t.participants.find((p) => p.userId === e.userId)!;
        const otherAssignees = t.participants.filter(
          (p) => p.role === 'ASSIGNEE' && p.userId !== e.userId,
        );
        // Only the last assignee leaving needs a successor.
        const toUserIds =
          mine.role === 'ASSIGNEE' && otherAssignees.length === 0
            ? await this.successorsOf(t, e.userId)
            : [];
        const participants = [
          ...t.participants
            .filter((p) => p.userId !== e.userId)
            .map((p) => ({ userId: p.userId, role: p.role })),
          ...toUserIds.map((userId) => ({
            userId,
            role: 'ASSIGNEE' as const,
          })),
        ];
        await this.prisma.$transaction(async (tx) => {
          // A system task the leaver had taken is up for grabs again: the
          // first of the new assignees to act takes it (lesson row first, the
          // order every claim locks in).
          if (t.kind !== 'MANUAL' && t.claimedById === e.userId) {
            await tx.unmarkedLesson.updateMany({
              where: { taskId: t.id },
              data: { claimedById: null },
            });
            await tx.task.update({
              where: { id: t.id },
              data: { claimedById: null },
            });
          }
          await tx.taskParticipant.deleteMany({
            where: { taskId: t.id, userId: e.userId },
          });
          if (toUserIds.length) {
            await tx.taskParticipant.createMany({
              data: toUserIds.map((userId) => ({
                taskId: t.id,
                userId,
                role: 'ASSIGNEE' as const,
              })),
              skipDuplicates: true,
            });
          }
          await tx.taskEvent.create({
            data: {
              taskId: t.id,
              type: 'REASSIGNED',
              actorId: null,
              meta: { from: e.userId, to: toUserIds },
              via: 'SYSTEM',
            },
          });
          await tx.taskOutbox.deleteMany({
            where: { taskId: t.id, userId: e.userId, sentAt: null },
          });
          // The new assignees get the reminders the leaver had.
          if (toUserIds.length) {
            await scheduleTaskOutbox(tx, {
              id: t.id,
              dueAt: t.dueAt,
              authorId: t.authorId,
              participants,
            });
          }
        });
        if (toUserIds.length) {
          const payload: TaskReassignedPayload = {
            task: toEventTask({ ...t, participants }),
            fromUserId: e.userId,
            toUserIds,
          };
          this.emitter.emit(TASK_EVENTS.REASSIGNED, payload);
        }
      } catch (err) {
        this.logger.error(
          `reassign task ${t.id} on deactivate failed for user ${e.userId}: ${(err as Error).message}`,
        );
      }
    }
  }

  /**
   * Who takes over. A manual task goes back to its author while the author is
   * still active; otherwise (the author is the leaver, or has left too, and
   * for every system task) it goes to whoever the branch's lesson questions go
   * to. A task with no branch and no author to return it to is left without an
   * assignee: there is nobody right to give it to.
   */
  private async successorsOf(
    t: {
      kind: string;
      authorId: number | null;
      companyId: number;
      branchId: number | null;
    },
    leaverId: number,
  ): Promise<number[]> {
    if (
      t.kind === 'MANUAL' &&
      t.authorId !== null &&
      t.authorId !== leaverId &&
      (await this.isActiveStaff(t.authorId))
    ) {
      return [t.authorId];
    }
    if (t.branchId === null) return [];
    const ids = await lessonTaskAssigneeIds(
      this.prisma,
      t.companyId,
      t.branchId,
    );
    return ids.filter((id) => id !== leaverId);
  }

  private async isActiveStaff(userId: number): Promise<boolean> {
    const n = await this.prisma.user.count({
      where: {
        id: userId,
        deletedAt: null,
        isActive: true,
        status: UserStatus.ACTIVE,
      },
    });
    return n > 0;
  }
}
