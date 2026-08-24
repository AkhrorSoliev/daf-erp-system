import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationType, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { NotificationsGateway } from './notifications.gateway';
import { PushService } from './push.service';
import { TelegramService } from '../telegram/telegram.service';
import { formatSom } from '../payments/shared/format-som';
import { PAYMENT_METHOD_LABEL } from '../payments/shared/method-label';
import { tashkentDateStr } from '../attendance/shared/date-utils';
import type { PaymentCorrectedPayload } from '../payments/payments-write.service';
import type { SalaryCarriedOverPayload } from '../salary/salary-accrual.service';
import type { PaymentPromiseOverduePayload } from '../payment-promises/payment-promise-cron.service';

@Injectable()
export class NotificationEventsListener {
  private readonly logger = new Logger(NotificationEventsListener.name);

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private gateway: NotificationsGateway,
    private pushService: PushService,
    private telegramService: TelegramService,
  ) {}

  /**
   * Resolve which of the given user ids are still active recipients
   * (deletedAt:null AND isActive:true AND status:ACTIVE). Deactivated /
   * suspended / terminated / archived users must NOT receive notifications —
   * the same filter the payment/salary handlers already apply. (F-05)
   */
  private async filterActiveRecipientIds(userIds: number[]): Promise<number[]> {
    if (userIds.length === 0) return [];
    const active = await this.prisma.user.findMany({
      where: {
        id: { in: userIds },
        deletedAt: null,
        isActive: true,
        status: UserStatus.ACTIVE,
      },
      select: { id: true },
    });
    return active.map((u) => u.id);
  }

  @OnEvent('task.assigned')
  async handleTaskAssigned(payload: { comment: any; assigneeIds: number[] }) {
    const { comment, assigneeIds } = payload;
    const authorName = comment.author
      ? `${comment.author.firstName} ${comment.author.lastName}`
      : "Noma'lum";

    for (const assigneeId of await this.filterActiveRecipientIds(assigneeIds)) {
      try {
        const title = 'Yangi topshiriq';
        const message = `${authorName} sizga topshiriq berdi: "${this.truncate(comment.content, 80)}"`;

        // 1. DB notification
        const notification = await this.notificationsService.create({
          userId: assigneeId,
          type: NotificationType.TASK_ASSIGNED,
          title,
          message,
          relatedEntityType: comment.entityType,
          relatedEntityId: comment.entityId,
          commentId: comment.id,
          companyId: comment.companyId,
        });

        // 2. SSE — real-time
        this.gateway.sendToUser(assigneeId, {
          type: 'notification',
          notification,
        });

        // 3. Web Push
        await this.pushService.sendToUser(assigneeId, {
          title,
          body: message,
          url: '/tasks',
        });

        // 4. Telegram
        await this.sendTelegram(assigneeId, title, message);
      } catch (error) {
        this.logger.error(
          `Failed to notify assignee ${assigneeId}: ${error.message}`,
        );
      }
    }
  }

  @OnEvent('task.deleted')
  async handleTaskDeleted(payload: { comment: any; assigneeIds: number[] }) {
    const { comment, assigneeIds } = payload;
    const authorName = comment.author
      ? `${comment.author.firstName} ${comment.author.lastName}`
      : "Noma'lum";

    for (const assigneeId of await this.filterActiveRecipientIds(assigneeIds)) {
      try {
        const title = "Topshiriq o'chirildi";
        const message = `${authorName} topshiriqni o'chirdi: "${this.truncate(comment.content, 80)}"`;

        const notification = await this.notificationsService.create({
          userId: assigneeId,
          type: NotificationType.TASK_DELETED,
          title,
          message,
          relatedEntityType: comment.entityType,
          relatedEntityId: comment.entityId,
          companyId: comment.companyId,
        });

        this.gateway.sendToUser(assigneeId, {
          type: 'notification',
          notification,
        });

        await this.pushService.sendToUser(assigneeId, {
          title,
          body: message,
          url: '/tasks',
        });

        await this.sendTelegram(assigneeId, title, message);
      } catch (error) {
        this.logger.error(
          `Failed to notify assignee ${assigneeId} about task deletion: ${error.message}`,
        );
      }
    }
  }

  @OnEvent('task.updated')
  async handleTaskUpdated(payload: { comment: any; assigneeIds: number[] }) {
    const { comment, assigneeIds } = payload;
    const authorName = comment.author
      ? `${comment.author.firstName} ${comment.author.lastName}`
      : "Noma'lum";

    for (const assigneeId of await this.filterActiveRecipientIds(assigneeIds)) {
      try {
        const title = 'Topshiriq yangilandi';
        const message = `${authorName} topshiriqni yangiladi: "${this.truncate(comment.content, 80)}"`;

        const notification = await this.notificationsService.create({
          userId: assigneeId,
          type: NotificationType.TASK_UPDATED,
          title,
          message,
          relatedEntityType: comment.entityType,
          relatedEntityId: comment.entityId,
          commentId: comment.id,
          companyId: comment.companyId,
        });

        this.gateway.sendToUser(assigneeId, {
          type: 'notification',
          notification,
        });

        await this.pushService.sendToUser(assigneeId, {
          title,
          body: message,
          url: '/tasks',
        });

        await this.sendTelegram(assigneeId, title, message);
      } catch (error) {
        this.logger.error(
          `Failed to notify assignee ${assigneeId} about task update: ${error.message}`,
        );
      }
    }
  }

  @OnEvent('task.status.changed')
  async handleTaskStatusChanged(payload: {
    comment: any;
    assignee: any;
    newStatus: string;
  }) {
    const { comment, assignee, newStatus } = payload;
    const statusLabel =
      newStatus === 'SEEN'
        ? "ko'rdi"
        : newStatus === 'DONE'
          ? 'bajardi'
          : newStatus;
    const assigneeName = assignee.user
      ? `${assignee.user.firstName} ${assignee.user.lastName}`
      : "Noma'lum";

    const title = 'Topshiriq yangilandi';
    const message = `${assigneeName} topshiriqni ${statusLabel}: "${this.truncate(comment.content, 60)}"`;

    try {
      // Notify comment author
      const notification = await this.notificationsService.create({
        userId: comment.authorId,
        type: NotificationType.TASK_STATUS_CHANGED,
        title,
        message,
        relatedEntityType: comment.entityType,
        relatedEntityId: comment.entityId,
        commentId: comment.id,
        companyId: comment.companyId,
      });

      this.gateway.sendToUser(comment.authorId, {
        type: 'notification',
        notification,
      });

      await this.pushService.sendToUser(comment.authorId, {
        title,
        body: message,
        url: '/tasks',
      });

      await this.sendTelegram(comment.authorId, title, message);
    } catch (error) {
      this.logger.error(
        `Failed to notify author ${comment.authorId}: ${error.message}`,
      );
    }
  }

  /**
   * Alerts the company's CEO(s) when a non-CEO operator corrects a payment
   * amount — a financial-control guardrail. Fans out to all four channels
   * like the task handlers above.
   */
  @OnEvent('payment.corrected')
  async handlePaymentCorrected(payload: PaymentCorrectedPayload) {
    try {
      const [performer, student, ceos] = await Promise.all([
        this.prisma.user.findUnique({
          where: { id: payload.performedById },
          select: { firstName: true, lastName: true },
        }),
        this.prisma.student.findUnique({
          where: { id: payload.studentId },
          select: { firstName: true, lastName: true },
        }),
        this.prisma.user.findMany({
          where: {
            deletedAt: null,
            isActive: true,
            status: UserStatus.ACTIVE,
            companyId: payload.companyId,
            roles: { some: { role: { name: 'CEO' } } },
          },
          select: { id: true },
        }),
      ]);

      if (ceos.length === 0) return;

      const performerName = performer
        ? `${performer.firstName} ${performer.lastName}`
        : "Noma'lum xodim";
      const studentName = student
        ? `${student.firstName} ${student.lastName}`
        : "o'quvchi";
      const studentId = String(payload.studentId);

      const title = "To'lov to'g'rilandi";
      const amountChanged = payload.oldAmount !== payload.newAmount;
      const methodChanged = payload.oldMethod !== payload.newMethod;
      const changeParts: string[] = [];
      if (amountChanged) {
        changeParts.push(
          `${formatSom(payload.oldAmount)} → ${formatSom(payload.newAmount)} so'm`,
        );
      }
      if (methodChanged) {
        changeParts.push(
          `${PAYMENT_METHOD_LABEL[payload.oldMethod]} → ${PAYMENT_METHOD_LABEL[payload.newMethod]}`,
        );
      }
      const message =
        `${performerName} ${studentName}ning to'lovini to'g'riladi: ` +
        `${changeParts.join(', ')}. ` +
        `Sabab: ${payload.reason}`;

      for (const ceo of ceos) {
        try {
          const notification = await this.notificationsService.create({
            userId: ceo.id,
            type: NotificationType.SYSTEM,
            title,
            message,
            relatedEntityType: 'Student',
            relatedEntityId: studentId,
            companyId: payload.companyId,
          });

          this.gateway.sendToUser(ceo.id, {
            type: 'notification',
            notification,
          });

          await this.pushService.sendToUser(ceo.id, {
            title,
            body: message,
            url: `/students/${studentId}`,
          });

          await this.sendTelegram(ceo.id, title, message);
        } catch (error) {
          this.logger.error(
            `Failed to notify CEO ${ceo.id} of payment correction: ${error.message}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(`payment.corrected handler failed: ${error.message}`);
    }
  }

  /**
   * A debtor's payment promise passed its date while the student is still in
   * debt (flipped to BROKEN by the daily cron). Notifies the branch's
   * Administrators plus the company CEOs so any of them can follow up — the
   * branch-wide visibility the /outreach "To'lov va'dalari" tab mirrors.
   * Fans out to all four channels; recipient filter follows the standard rule.
   */
  @OnEvent('payment-promise.overdue')
  async handlePaymentPromiseOverdue(payload: PaymentPromiseOverduePayload) {
    try {
      const [student, recipients] = await Promise.all([
        this.prisma.student.findUnique({
          where: { id: payload.studentId },
          select: { firstName: true, lastName: true },
        }),
        this.prisma.user.findMany({
          where: {
            deletedAt: null,
            isActive: true,
            status: UserStatus.ACTIVE,
            companyId: payload.companyId,
            OR: [
              { roles: { some: { role: { name: 'CEO' } } } },
              {
                roles: { some: { role: { name: 'Administrator' } } },
                ...(payload.branchId
                  ? { branches: { some: { branchId: payload.branchId } } }
                  : {}),
              },
            ],
          },
          select: { id: true },
        }),
      ]);

      if (recipients.length === 0) return;

      const studentName = student
        ? `${student.firstName} ${student.lastName}`
        : "o'quvchi";
      const studentId = String(payload.studentId);
      const [y, m, d] = tashkentDateStr(new Date(payload.promiseDate)).split(
        '-',
      );
      const dateStr = `${d}.${m}.${y}`;

      const title = "To'lov sanasi o'tib ketdi";
      const message =
        `${studentName} ${dateStr} sanasiga to'lov qilishni belgilagan edi, ` +
        `lekin hali ham qarzdor. Iltimos, bog'laning.`;

      for (const r of recipients) {
        try {
          const notification = await this.notificationsService.create({
            userId: r.id,
            type: NotificationType.PAYMENT_PROMISE_OVERDUE,
            title,
            message,
            relatedEntityType: 'Student',
            relatedEntityId: studentId,
            companyId: payload.companyId,
          });

          this.gateway.sendToUser(r.id, {
            type: 'notification',
            notification,
          });

          await this.pushService.sendToUser(r.id, {
            title,
            body: message,
            url: `/students/profile/${studentId}`,
          });

          await this.sendTelegram(r.id, title, message);
        } catch (error) {
          this.logger.error(
            `Failed to notify ${r.id} of overdue promise: ${error.message}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `payment-promise.overdue handler failed: ${error.message}`,
      );
    }
  }

  /**
   * Tells each teacher when a student's late payment carried lessons from an
   * already-closed payroll period into their current cycle. Aggregates per
   * teacher (one message covering all carried-over lessons in this payment)
   * and fans out to all four channels. Recipient filter follows the standard
   * rule — only active, non-archived users.
   */
  @OnEvent('salary.carried-over')
  async handleSalaryCarriedOver(payload: SalaryCarriedOverPayload) {
    try {
      if (!payload.items?.length) return;

      // One notification per teacher, summing amount + lesson count.
      const byTeacher = new Map<number, { total: number; count: number }>();
      for (const item of payload.items) {
        const entry = byTeacher.get(item.teacherId) ?? { total: 0, count: 0 };
        entry.total += item.amount;
        entry.count += 1;
        byTeacher.set(item.teacherId, entry);
      }

      for (const [teacherId, { total, count }] of byTeacher) {
        const teacher = await this.prisma.user.findFirst({
          where: {
            id: teacherId,
            deletedAt: null,
            isActive: true,
            status: UserStatus.ACTIVE,
          },
          select: { id: true },
        });
        if (!teacher) continue;

        const title = 'Oldingi oydan ish haqi';
        const message =
          `Kechikkan to'lov tufayli oldingi oydagi ${count} ta dars uchun ` +
          `${formatSom(total)} so'm joriy oyligingizga qo'shildi.`;

        try {
          const notification = await this.notificationsService.create({
            userId: teacherId,
            type: NotificationType.SYSTEM,
            title,
            message,
            relatedEntityType: 'User',
            relatedEntityId: String(teacherId),
            companyId: payload.companyId,
          });

          this.gateway.sendToUser(teacherId, {
            type: 'notification',
            notification,
          });

          await this.pushService.sendToUser(teacherId, {
            title,
            body: message,
            url: '/profile/salary',
          });

          await this.sendTelegram(teacherId, title, message);
        } catch (error) {
          this.logger.error(
            `Failed to notify teacher ${teacherId} of carried-over salary: ${error.message}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(`salary.carried-over handler failed: ${error.message}`);
    }
  }

  private async sendTelegram(userId: number, title: string, message: string) {
    try {
      const bot = this.telegramService.getBot();
      if (!bot) return;

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { telegramChatId: true },
      });

      if (!user?.telegramChatId) return;

      const text = `<b>${title}</b>\n${message}`;
      await bot.telegram.sendMessage(user.telegramChatId, text, {
        parse_mode: 'HTML',
      });
    } catch (error) {
      this.logger.warn(
        `Telegram send failed for user ${userId}: ${error.message}`,
      );
    }
  }

  private truncate(text: string, maxLen: number): string {
    return text.length > maxLen ? text.slice(0, maxLen) + '...' : text;
  }

  private getEntityUrl(entityType: string, entityId: string): string {
    const routes: Record<string, string> = {
      Student: `/students/${entityId}`,
      User: `/teachers/${entityId}`,
    };
    return routes[entityType] || '/';
  }
}
