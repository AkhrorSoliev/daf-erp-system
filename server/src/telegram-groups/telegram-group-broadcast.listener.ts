import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PaymentMethod, PaymentSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramGroupBroadcastService } from './telegram-group-broadcast.service';
import { formatSum, formatDate } from './utils/format.util';
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

/**
 * Subscribes to domain events and broadcasts user-friendly messages to
 * approved Telegram groups. All handlers are best-effort — broadcast
 * failures never throw back into the originating transaction.
 */
@Injectable()
export class TelegramGroupBroadcastListener {
  private readonly logger = new Logger(TelegramGroupBroadcastListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly broadcast: TelegramGroupBroadcastService,
  ) {}

  @OnEvent('student.created')
  async onStudentCreated(payload: StudentCreatedEvent) {
    try {
      const branchLine = payload.branchName
        ? `\nFilial: <b>${payload.branchName}</b>`
        : '';
      await this.broadcast.broadcast({
        companyId: payload.companyId,
        branchId: payload.branchId ?? null,
        message:
          `👨‍🎓 <b>Yangi o'quvchi</b>\n\n` +
          `${payload.firstName} ${payload.lastName} (ID: ${payload.studentId})${branchLine}`,
        eventClass: 'student.created',
      });
    } catch (err: any) {
      this.logger.warn(`student.created broadcast failed: ${err?.message}`);
    }
  }

  @OnEvent('group.created')
  async onGroupCreated(payload: GroupCreatedEvent) {
    try {
      const branchLine = payload.branchName
        ? `\nFilial: <b>${payload.branchName}</b>`
        : '';
      const startLine = payload.startDate
        ? `\nBoshlanish: <b>${formatDate(payload.startDate)}</b>`
        : '';
      await this.broadcast.broadcast({
        companyId: payload.companyId,
        branchId: payload.branchId,
        message:
          `👥 <b>Yangi guruh</b>\n\n` +
          `${payload.name}${branchLine}${startLine}`,
        eventClass: 'group.created',
      });
    } catch (err: any) {
      this.logger.warn(`group.created broadcast failed: ${err?.message}`);
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

      // Resolve student name + branch for the message
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

      const methodLabels: Record<string, string> = {
        CASH: 'Naqd',
        PAYME: 'Payme',
        CLICK: 'Click',
        UZUM: 'Uzum',
        TRANSFER: "O'tkazma",
      };

      await this.broadcast.broadcast({
        companyId: payload.companyId,
        branchId: student?.branches[0]?.branch?.id ?? null,
        message:
          `💳 <b>Yangi to'lov</b>\n\n` +
          `${studentName}\n` +
          `Summa: <b>${formatSum(payload.amount)}</b>\n` +
          `Usul: ${methodLabels[payload.method] ?? payload.method}`,
        eventClass: 'payment.received',
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
      await this.broadcast.broadcast({
        companyId: payload.companyId,
        message,
        eventClass: `entity.status.changed:${payload.entityType}`,
      });
    } catch (err: any) {
      this.logger.warn(`entity.status.changed broadcast failed: ${err?.message}`);
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
