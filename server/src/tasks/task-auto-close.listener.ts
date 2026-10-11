import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { EntityStatusChangedEvent } from '../common/entity-history/entity-history.service';
import {
  CALL_LOG_CREATED,
  type CallLogCreatedPayload,
} from '../call-logs/call-log-events';
import { LEAD_CALLED, type LeadCalledPayload } from '../leads/lead-events';
import {
  kindsClosedBy,
  paymentClosesBrokenPromise,
  sourceKeyOf,
  type AutoCloseReason,
  type AutoKind,
} from './task-auto-rules';
import { autoCloseTasks } from './task-auto-write';
import { TASK_EVENTS, type TaskAutoClosedPayload } from './task-events';

/**
 * The ONE place an automatic task closes (spec §7): its source got solved.
 * Which kinds an event closes is `AUTO_RULES[kind].closesOn`. Every event
 * heard here is emitted after its write committed. Never throws.
 */
@Injectable()
export class TaskAutoCloseListener {
  private readonly logger = new Logger(TaskAutoCloseListener.name);

  constructor(
    private prisma: PrismaService,
    private emitter: EventEmitter2,
  ) {}

  /**
   * A callback closes on any payment; a broken promise only when the debt is
   * gone (a partial payment keeps it open; so does an unknown balance).
   */
  @OnEvent('payment.received')
  async onPayment(p: {
    companyId: number;
    studentId: number;
    studentBalance?: number | null;
    performedById?: number;
  }): Promise<void> {
    const debtGone =
      p.studentBalance != null && paymentClosesBrokenPromise(p.studentBalance);
    await this.close(
      'payment.received',
      {
        companyId: p.companyId,
        entityType: 'Student',
        entityId: String(p.studentId),
      },
      'PAYMENT_RECEIVED',
      p.performedById ?? null,
      (k) => k !== 'BROKEN_PROMISE' || debtGone,
    );
  }

  /** The call that asked for a callback does not close that callback. */
  @OnEvent(CALL_LOG_CREATED)
  async onCallLogged({ callLog }: CallLogCreatedPayload): Promise<void> {
    await this.close(
      CALL_LOG_CREATED,
      {
        companyId: callLog.companyId,
        entityType: 'Student',
        entityId: String(callLog.studentId),
        sourceKey: { not: sourceKeyOf('CALLBACK', callLog.id) },
      },
      'CALL_LOGGED',
      callLog.calledById,
    );
  }

  @OnEvent(LEAD_CALLED)
  async onLeadCalled(p: LeadCalledPayload): Promise<void> {
    await this.close(
      LEAD_CALLED,
      {
        companyId: p.companyId,
        sourceKey: sourceKeyOf('UNCALLED_LEAD', p.leadId),
      },
      'LEAD_CALLED',
      p.userId,
    );
  }

  /** LOST (deleted) or CONVERTED: the lead no longer waits for a call. */
  @OnEvent('entity.status.changed')
  async onStatus(p: EntityStatusChangedEvent): Promise<void> {
    if (p.entityType !== 'Lead') return;
    await this.close(
      'entity.status.changed',
      {
        ...(p.companyId ? { companyId: p.companyId } : {}),
        sourceKey: sourceKeyOf('UNCALLED_LEAD', p.entityId),
      },
      'LEAD_STATUS_CHANGED',
      p.changedById ?? null,
    );
  }

  private async close(
    event: string,
    where: Prisma.TaskWhereInput,
    reason: AutoCloseReason,
    actorId: number | null,
    only: (kind: AutoKind) => boolean = () => true,
  ): Promise<void> {
    const kinds = kindsClosedBy(event).filter(only);
    if (kinds.length === 0) return;
    try {
      const closed = await autoCloseTasks(
        this.prisma,
        { ...where, kind: { in: kinds } },
        reason,
        undefined,
        actorId,
      );
      for (const task of closed) {
        this.emitter.emit(TASK_EVENTS.AUTO_CLOSED, {
          task,
          reason,
        } satisfies TaskAutoClosedPayload);
      }
    } catch (err) {
      this.logger.error(
        `auto-close on ${event} failed: ${(err as Error).message}`,
      );
    }
  }
}
