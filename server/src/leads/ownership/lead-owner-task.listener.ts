import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import {
  TASK_EVENTS,
  type TaskAssignedPayload,
  type TaskCommentedPayload,
  type TaskStatusChangedPayload,
} from '../../tasks/task-events';
import { touchLeadOwnerAction } from './owner-action';

/**
 * A task on a lead is the owner's action too (ADR-0093): creating one (the
 * next call date), moving it, or writing in it. The task events carry no
 * entity, so the task is read once.
 */
@Injectable()
export class LeadOwnerTaskListener {
  private readonly logger = new Logger(LeadOwnerTaskListener.name);

  constructor(private prisma: PrismaService) {}

  @OnEvent(TASK_EVENTS.ASSIGNED)
  async onAssigned(p: TaskAssignedPayload): Promise<void> {
    // A recurring rule makes its task by itself, as the rule's author: that
    // run is not an action of the lead's owner.
    if (p.created && p.actorId != null) {
      await this.touch(p.task.id, p.actorId, { skipRecurring: true });
    }
  }

  @OnEvent(TASK_EVENTS.STATUS_CHANGED)
  async onStatus(p: TaskStatusChangedPayload): Promise<void> {
    await this.touch(p.task.id, p.actorId);
  }

  @OnEvent(TASK_EVENTS.COMMENTED)
  async onCommented(p: TaskCommentedPayload): Promise<void> {
    await this.touch(p.task.id, p.actorId);
  }

  private async touch(
    taskId: string,
    actorId: number,
    opts: { skipRecurring?: boolean } = {},
  ): Promise<void> {
    try {
      const task = await this.prisma.task.findUnique({
        where: { id: taskId },
        select: { entityType: true, entityId: true, recurrenceId: true },
      });
      if (task?.entityType !== 'Lead' || !task.entityId) return;
      if (opts.skipRecurring && task.recurrenceId) return;
      await touchLeadOwnerAction(this.prisma, task.entityId, actorId);
    } catch (err) {
      this.logger.warn(
        `lead owner action from task ${taskId} failed: ${(err as Error).message}`,
      );
    }
  }
}
