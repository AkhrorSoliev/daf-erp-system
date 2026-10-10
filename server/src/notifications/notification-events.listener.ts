import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  NotificationType,
  TelegramDigestCategory,
  TelegramDigestRecipientKind,
  UserStatus,
} from '@prisma/client';
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
import { overdueDigest } from '../payment-promises/overdue-digest';
import { loadOverdueDigestItems } from '../payment-promises/overdue-digest-load';
import { TelegramDigestQueueService } from '../telegram-digest/telegram-digest-queue.service';

/** The bell opens the debt page filtered to broken promises (client `notification-href.ts`). */
export const BROKEN_PROMISES_ENTITY = 'BrokenPromises';

@Injectable()
export class NotificationEventsListener {
  private readonly logger = new Logger(NotificationEventsListener.name);

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private gateway: NotificationsGateway,
    private pushService: PushService,
    private telegramService: TelegramService,
    private digestQueue: TelegramDigestQueueService,
  ) {}

  /**
   * Alerts the company's CEO(s) when a non-CEO operator corrects a payment
   * amount — a financial-control guardrail. Fans out to all four channels.
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
            url: `/students/profile/${studentId}`,
          });

          await this.digestQueue.enqueue({
            recipientKind: TelegramDigestRecipientKind.USER,
            recipientId: ceo.id,
            companyId: payload.companyId,
            category: TelegramDigestCategory.PAYMENT_CORRECTED,
            payload: {
              performerName,
              studentName,
              studentId: payload.studentId,
              oldAmount: payload.oldAmount,
              newAmount: payload.newAmount,
              oldMethod: payload.oldMethod,
              newMethod: payload.newMethod,
              reason: payload.reason,
            },
          });
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
   * One branch's payment promises that passed their date while the students
   * are still in debt (flipped to BROKEN by the 09:00 cron), as ONE list:
   * debt, group, phones, the promise and its note, what changed since and how
   * often the student broke one. Goes to the branch's Administrators plus the
   * company CEOs. Fans out to all four channels; the bell and push get the
   * names only, Telegram the whole list.
   */
  @OnEvent('payment-promise.overdue')
  async handlePaymentPromiseOverdue(payload: PaymentPromiseOverduePayload) {
    try {
      const [items, branch, recipients] = await Promise.all([
        loadOverdueDigestItems(
          this.prisma,
          payload.companyId,
          payload.promiseIds,
        ),
        payload.branchId
          ? this.prisma.branch.findFirst({
              where: { id: payload.branchId, companyId: payload.companyId },
              select: { name: true },
            })
          : null,
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

      if (items.length === 0 || recipients.length === 0) return;

      const digest = overdueDigest(
        items,
        branch?.name ?? null,
        tashkentDateStr(new Date()),
      );

      for (const r of recipients) {
        try {
          const notification = await this.notificationsService.create({
            userId: r.id,
            type: NotificationType.PAYMENT_PROMISE_OVERDUE,
            title: digest.title,
            message: digest.summary,
            relatedEntityType: BROKEN_PROMISES_ENTITY,
            relatedEntityId: String(payload.branchId ?? 'all'),
            companyId: payload.companyId,
          });

          this.gateway.sendToUser(r.id, {
            type: 'notification',
            notification,
          });

          await this.pushService.sendToUser(r.id, {
            title: digest.title,
            body: digest.summary,
            url: '/payments/debt?promise=broken',
          });

          await this.sendTelegram(r.id, digest.telegram);
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

          await this.digestQueue.enqueue({
            recipientKind: TelegramDigestRecipientKind.USER,
            recipientId: teacherId,
            companyId: payload.companyId,
            category: TelegramDigestCategory.SALARY_CARRIED_OVER,
            payload: { count, total },
          });
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

  /** Sends ready HTML parts, in order; a part that fails stops the rest. */
  private async sendTelegram(userId: number, parts: string[]) {
    try {
      const bot = this.telegramService.getBot();
      if (!bot) return;

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { telegramChatId: true },
      });

      if (!user?.telegramChatId) return;

      for (const text of parts) {
        await bot.telegram.sendMessage(user.telegramChatId, text, {
          parse_mode: 'HTML',
        });
      }
    } catch (error) {
      this.logger.warn(
        `Telegram send failed for user ${userId}: ${error.message}`,
      );
    }
  }
}
