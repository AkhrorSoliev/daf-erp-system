import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  PaymentMethod,
  PaymentSource,
  TelegramDigestCategory,
  TelegramDigestRecipientKind,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramDigestQueueService } from '../telegram-digest/telegram-digest-queue.service';
import {
  GroupStatusChangeDigestPayload,
  GroupStatusTransition,
} from '../telegram-digest/telegram-digest-payloads';
import { describeError } from '../telegram-digest/telegram-send';
import { LARGE_PAYMENT_THRESHOLD_SUM } from './constants';

export interface StudentCreatedEvent {
  studentId: number;
  firstName: string;
  lastName: string;
  branchId?: number | null;
  branchName?: string | null;
  companyId: number;
}

export interface GroupCreatedEvent {
  groupId: string;
  name: string;
  branchId: number;
  branchName?: string | null;
  startDate?: Date | string | null;
  companyId: number;
}

interface PaymentReceivedEvent {
  paymentId: string;
  studentId: number;
  amount: number;
  method: PaymentMethod;
  source: PaymentSource;
  studentBalance: number | null;
  companyId: number;
  performedById?: number;
}

interface EntityStatusChangedEvent {
  entityType: string;
  entityId: string;
  oldStatus?: string;
  newStatus?: string;
  reason?: string;
  changedById?: number;
  companyId?: number;
}

const GROUP_TRANSITIONS: Record<string, GroupStatusTransition> = {
  'FORMING->ACTIVE': 'GROUP_STARTED',
  'ACTIVE->COMPLETED': 'GROUP_COMPLETED',
};

const STUDENT_TRANSITIONS: Record<string, GroupStatusTransition> = {
  'ACTIVE->FROZEN': 'STUDENT_FROZEN',
  'ACTIVE->EXPELLED': 'STUDENT_EXPELLED',
  'ACTIVE->GRADUATED': 'STUDENT_GRADUATED',
  'FROZEN->ACTIVE': 'STUDENT_REACTIVATED',
};

/** Only freezing and expelling carry a reason worth showing (as before). */
const STUDENT_REASON_SHOWN = new Set<GroupStatusTransition>([
  'STUDENT_FROZEN',
  'STUDENT_EXPELLED',
]);

/**
 * Turns domain events into GROUP rows of the Telegram digest queue. Nothing is
 * sent from here any more: the 20:00 group cron renders one message per
 * approved Telegram group (ADR-0025). All handlers are best-effort — a failure
 * never reaches the transaction that fired the event.
 */
@Injectable()
export class TelegramGroupBroadcastListener {
  private readonly logger = new Logger(TelegramGroupBroadcastListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly digestQueue: TelegramDigestQueueService,
  ) {}

  @OnEvent('student.created')
  async onStudentCreated(payload: StudentCreatedEvent) {
    try {
      await this.digestQueue.enqueue({
        recipientKind: TelegramDigestRecipientKind.GROUP,
        recipientId: payload.companyId,
        companyId: payload.companyId,
        branchId: payload.branchId ?? null,
        category: TelegramDigestCategory.GROUP_NEW_STUDENT,
        relatedEntityId: String(payload.studentId),
        payload: {
          studentId: payload.studentId,
          name: `${payload.firstName} ${payload.lastName}`,
          branchName: payload.branchName ?? null,
        },
      });
    } catch (err) {
      this.logger.warn(
        `student.created digest enqueue failed: ${describeError(err)}`,
      );
    }
  }

  @OnEvent('group.created')
  async onGroupCreated(payload: GroupCreatedEvent) {
    try {
      await this.digestQueue.enqueue({
        recipientKind: TelegramDigestRecipientKind.GROUP,
        recipientId: payload.companyId,
        companyId: payload.companyId,
        branchId: payload.branchId,
        category: TelegramDigestCategory.GROUP_NEW_GROUP,
        relatedEntityId: payload.groupId,
        payload: {
          groupId: payload.groupId,
          name: payload.name,
          branchName: payload.branchName ?? null,
          startDate: payload.startDate
            ? new Date(payload.startDate).toISOString()
            : null,
        },
      });
    } catch (err) {
      this.logger.warn(
        `group.created digest enqueue failed: ${describeError(err)}`,
      );
    }
  }

  @OnEvent('payment.received')
  async onPaymentReceived(payload: PaymentReceivedEvent) {
    try {
      const isLarge = payload.amount >= LARGE_PAYMENT_THRESHOLD_SUM;
      const isOnline =
        payload.method === PaymentMethod.PAYME ||
        payload.method === PaymentMethod.CLICK ||
        payload.method === PaymentMethod.UZUM;
      if (!isLarge && !isOnline) return; // small cash/transfer — the 21:00 report covers them

      const student = await this.prisma.student.findUnique({
        where: { id: payload.studentId },
        select: {
          firstName: true,
          lastName: true,
          branches: { take: 1, select: { branch: { select: { id: true } } } },
        },
      });

      await this.digestQueue.enqueue({
        recipientKind: TelegramDigestRecipientKind.GROUP,
        recipientId: payload.companyId,
        companyId: payload.companyId,
        branchId: student?.branches[0]?.branch?.id ?? null,
        category: TelegramDigestCategory.GROUP_PAYMENT,
        relatedEntityId: payload.paymentId,
        payload: {
          paymentId: payload.paymentId,
          studentName: student
            ? `${student.firstName} ${student.lastName}`
            : `O'quvchi ID ${payload.studentId}`,
          amount: payload.amount,
          method: payload.method,
        },
      });
    } catch (err) {
      this.logger.warn(
        `payment.received digest enqueue failed: ${describeError(err)}`,
      );
    }
  }

  @OnEvent('entity.status.changed')
  async onEntityStatusChanged(payload: EntityStatusChangedEvent) {
    try {
      const companyId = payload.companyId;
      const { oldStatus: from, newStatus: to } = payload;
      if (!companyId || !from || !to || from === to) return;

      if (payload.entityType === 'Group') {
        const transition = GROUP_TRANSITIONS[`${from}->${to}`];
        if (transition)
          await this.queueGroupChange(payload, companyId, transition);
        return;
      }
      if (payload.entityType === 'Student') {
        const transition = STUDENT_TRANSITIONS[`${from}->${to}`];
        if (transition)
          await this.queueStudentChange(payload, companyId, transition);
      }
    } catch (err) {
      this.logger.warn(
        `entity.status.changed digest enqueue failed: ${describeError(err)}`,
      );
    }
  }

  private async queueGroupChange(
    p: EntityStatusChangedEvent,
    companyId: number,
    transition: GroupStatusTransition,
  ) {
    const group = await this.prisma.group.findUnique({
      where: { id: p.entityId },
      select: {
        name: true,
        branchId: true,
        branch: { select: { name: true } },
      },
    });
    const actor = await this.actorOf(p.changedById);
    await this.queueChange(companyId, group?.branchId ?? null, {
      entityType: 'Group',
      entityId: p.entityId,
      name: group?.name ?? `ID ${p.entityId}`,
      transition,
      reason: p.reason ?? null,
      actorName: actor.name,
      actorRole: actor.role,
      branchName: group?.branch?.name ?? null,
    });
  }

  private async queueStudentChange(
    p: EntityStatusChangedEvent,
    companyId: number,
    transition: GroupStatusTransition,
  ) {
    const studentId = Number(p.entityId);
    const student = Number.isFinite(studentId)
      ? await this.prisma.student.findUnique({
          where: { id: studentId },
          select: {
            firstName: true,
            lastName: true,
            branches: {
              take: 1,
              select: { branch: { select: { id: true, name: true } } },
            },
          },
        })
      : null;
    const branch = student?.branches[0]?.branch ?? null;
    const actor = await this.actorOf(p.changedById);
    await this.queueChange(companyId, branch?.id ?? null, {
      entityType: 'Student',
      entityId: p.entityId,
      name: student
        ? `${student.firstName} ${student.lastName}`.trim()
        : `ID ${p.entityId}`,
      transition,
      reason: STUDENT_REASON_SHOWN.has(transition) ? (p.reason ?? null) : null,
      actorName: actor.name,
      actorRole: actor.role,
      branchName: branch?.name ?? null,
    });
  }

  private async queueChange(
    companyId: number,
    branchId: number | null,
    payload: GroupStatusChangeDigestPayload,
  ) {
    await this.digestQueue.enqueue({
      recipientKind: TelegramDigestRecipientKind.GROUP,
      recipientId: companyId,
      companyId,
      branchId,
      category: TelegramDigestCategory.GROUP_STATUS_CHANGE,
      // Only a genuine duplicate (same entity, same transition) merges.
      relatedEntityId: `${payload.entityType}:${payload.entityId}:${payload.transition}`,
      payload,
    });
  }

  private async actorOf(
    userId?: number,
  ): Promise<{ name: string | null; role: string | null }> {
    if (!userId) return { name: null, role: null };
    const actor = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        firstName: true,
        lastName: true,
        roles: { take: 1, select: { role: { select: { name: true } } } },
      },
    });
    if (!actor) return { name: null, role: null };
    return {
      name: `${actor.firstName} ${actor.lastName}`.trim(),
      role: actor.roles[0]?.role?.name ?? null,
    };
  }
}
