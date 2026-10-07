import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
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
import { TASK_CARD_SELECT } from './task-select';

const OPEN_STATUSES = ['NEW', 'IN_PROGRESS', 'IN_REVIEW'] as const;

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
    try {
      const rows = await this.prisma.task.findMany({
        where: {
          companyId: e.companyId,
          status: { in: [...OPEN_STATUSES] },
          participants: { some: { userId: e.userId } },
        },
        select: TASK_CARD_SELECT,
      });
      for (const t of rows) {
        const mine = t.participants.find((p) => p.userId === e.userId)!;
        const otherAssignees = t.participants.filter(
          (p) => p.role === 'ASSIGNEE' && p.userId !== e.userId,
        );
        // Only the last assignee leaving needs a successor: a manual task goes
        // back to its author, a system task to whoever the question is asked of.
        let toUserIds: number[] = [];
        if (mine.role === 'ASSIGNEE' && otherAssignees.length === 0) {
          if (t.kind === 'MANUAL') {
            toUserIds =
              t.authorId !== null && t.authorId !== e.userId
                ? [t.authorId]
                : [];
          } else if (t.branchId !== null) {
            toUserIds = (
              await lessonTaskAssigneeIds(this.prisma, t.companyId, t.branchId)
            ).filter((id) => id !== e.userId);
          }
        }
        await this.prisma.$transaction(async (tx) => {
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
        });
        if (toUserIds.length) {
          const task = toEventTask({
            ...t,
            participants: [
              ...t.participants.filter((p) => p.userId !== e.userId),
              ...toUserIds.map((userId) => ({
                userId,
                role: 'ASSIGNEE' as const,
              })),
            ],
          });
          const payload: TaskReassignedPayload = {
            task,
            fromUserId: e.userId,
            toUserIds,
          };
          this.emitter.emit(TASK_EVENTS.REASSIGNED, payload);
        }
      }
    } catch (err) {
      this.logger.error(
        `reassign on deactivate failed for user ${e.userId}: ${(err as Error).message}`,
      );
    }
  }
}
