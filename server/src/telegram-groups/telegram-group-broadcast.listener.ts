import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PaymentMethod, PaymentSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramGroupBroadcastService } from './telegram-group-broadcast.service';
import { TelegramGroupDigestBufferService } from './telegram-group-digest-buffer.service';
import { formatSum } from './utils/format.util';
import {
  INSTANT_PAYMENT_THRESHOLD_SUM,
  LARGE_PAYMENT_THRESHOLD_SUM,
} from './constants';

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

const METHOD_LABELS: Record<string, string> = {
  CASH: 'Naqd',
  PAYME: 'Payme',
  CLICK: 'Click',
  UZUM: 'Uzum',
  TRANSFER: "O'tkazma",
};

/**
 * Subscribes to domain events and routes them to approved Telegram groups.
 *
 * Routing policy:
 *  - High-signal, low-frequency events (status changes, very large payments)
 *    are broadcast **instantly**.
 *  - High-frequency, low-signal events (new student, new payment, new group)
 *    are **buffered** and flushed every 3 hours as one digest message by
 *    `TelegramGroupDigestCronService`. This stops the group being flooded
 *    with a separate message per student/payment.
 *
 * All handlers are best-effort — failures never throw back into the
 * originating transaction.
 */
@Injectable()
export class TelegramGroupBroadcastListener {
  private readonly logger = new Logger(TelegramGroupBroadcastListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly broadcast: TelegramGroupBroadcastService,
    private readonly digestBuffer: TelegramGroupDigestBufferService,
  ) {}

  @OnEvent('student.created')
  async onStudentCreated(payload: StudentCreatedEvent) {
    try {
      // Buffered — folded into the next 3-hourly digest.
      await this.digestBuffer.push(payload.companyId, {
        kind: 'student',
        branchId: payload.branchId ?? null,
        studentId: payload.studentId,
        name: `${payload.firstName} ${payload.lastName}`,
        branchName: payload.branchName ?? null,
      });
    } catch (err: any) {
      this.logger.warn(`student.created buffering failed: ${err?.message}`);
    }
  }

  @OnEvent('group.created')
  async onGroupCreated(payload: GroupCreatedEvent) {
    try {
      // Buffered — folded into the next 3-hourly digest.
      await this.digestBuffer.push(payload.companyId, {
        kind: 'group',
        branchId: payload.branchId,
        name: payload.name,
        branchName: payload.branchName ?? null,
        startDate: payload.startDate
          ? new Date(payload.startDate).toISOString()
          : null,
      });
    } catch (err: any) {
      this.logger.warn(`group.created buffering failed: ${err?.message}`);
    }
  }

  @OnEvent('payment.received')
  async onPaymentReceived(payload: PaymentReceivedEvent) {
    try {
      const isLarge = payload.amount >= LARGE_PAYMENT_THRESHOLD_SUM;
      const isExternal =
        payload.method === PaymentMethod.PAYME ||
        payload.method === PaymentMethod.CLICK ||
        payload.method === PaymentMethod.UZUM;
      if (!isLarge && !isExternal) {
        return; // small cash/transfer payments — daily report covers them
      }

      // Resolve student name + branch for the message / digest entry.
      const student = await this.prisma.student.findUnique({
        where: { id: payload.studentId },
        select: {
          firstName: true,
          lastName: true,
          branches: {
            take: 1,
            select: { branch: { select: { id: true, name: true } } },
          },
        },
      });

      const studentName = student
        ? `${student.firstName} ${student.lastName}`
        : `O'quvchi ID ${payload.studentId}`;
      const branchId = student?.branches[0]?.branch?.id ?? null;
      const methodLabel = METHOD_LABELS[payload.method] ?? payload.method;

      // Very large payments are notable — send instantly. No throttle bucket,
      // so two big payments close together both reach the group.
      if (payload.amount >= INSTANT_PAYMENT_THRESHOLD_SUM) {
        await this.broadcast.broadcast({
          companyId: payload.companyId,
          branchId,
          message:
            `💳 <b>Yangi to'lov</b>\n\n` +
            `${studentName}\n` +
            `Summa: <b>${formatSum(payload.amount)}</b>\n` +
            `Usul: ${methodLabel}`,
        });
        return;
      }

      // Ordinary large / external payments — buffered into the digest.
      await this.digestBuffer.push(payload.companyId, {
        kind: 'payment',
        branchId,
        studentName,
        amount: payload.amount,
        method: payload.method,
      });
    } catch (err: any) {
      this.logger.warn(`payment.received broadcast failed: ${err?.message}`);
    }
  }

  @OnEvent('entity.status.changed')
  async onEntityStatusChanged(payload: EntityStatusChangedEvent) {
    try {
      if (!payload.companyId) return;
      const message = this.formatStatusChangeMessage(payload);
      if (!message) return; // not a status transition we broadcast
      // Status changes stay instant. The throttle bucket includes the entity
      // id so two different entities changing within 30s don't collide — only
      // a genuine duplicate of the same entity is deduped.
      await this.broadcast.broadcast({
        companyId: payload.companyId,
        message,
        eventClass: `entity.status.changed:${payload.entityType}:${payload.entityId}`,
      });
    } catch (err: any) {
      this.logger.warn(
        `entity.status.changed broadcast failed: ${err?.message}`,
      );
    }
  }

  /**
   * Translates internal status transitions into Uzbek bot messages.
   * Returns null for transitions we don't broadcast (most internal cascades).
   */
  private formatStatusChangeMessage(
    p: EntityStatusChangedEvent,
  ): string | null {
    const t = p.entityType;
    const from = p.oldStatus;
    const to = p.newStatus;
    if (!from || !to || from === to) return null;

    if (t === 'Student') {
      if (from === 'ACTIVE' && to === 'FROZEN') {
        return `❄️ <b>O'quvchi muzlatildi</b>\n\nID: ${p.entityId}${p.reason ? `\nSabab: ${p.reason}` : ''}`;
      }
      if (from === 'ACTIVE' && to === 'EXPELLED') {
        return `🚫 <b>O'quvchi chetlatildi</b>\n\nID: ${p.entityId}${p.reason ? `\nSabab: ${p.reason}` : ''}`;
      }
      if (from === 'ACTIVE' && to === 'GRADUATED') {
        return `🎓 <b>O'quvchi bitirdi</b>\n\nID: ${p.entityId}`;
      }
      if (from === 'FROZEN' && to === 'ACTIVE') {
        return `✅ <b>O'quvchi qaytadan faol</b>\n\nID: ${p.entityId}`;
      }
    }

    if (t === 'Group') {
      if (from === 'FORMING' && to === 'ACTIVE') {
        return `🚀 <b>Guruh boshlandi</b>\n\nID: ${p.entityId}`;
      }
      if (from === 'ACTIVE' && to === 'COMPLETED') {
        return `🏁 <b>Guruh tugadi</b>\n\nID: ${p.entityId}`;
      }
    }

    return null;
  }
}
