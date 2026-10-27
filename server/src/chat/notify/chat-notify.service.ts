import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { SmsMessageType } from '@prisma/client';
import { Markup } from 'telegraf';
import { NotificationsGateway } from '../../notifications/notifications.gateway';
import { NotificationsService } from '../../notifications/notifications.service';
import { PushService } from '../../notifications/push.service';
import { isChatTester } from '../chat-testers';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../../settings/settings.service';
import { SmsService } from '../../sms/sms.service';
import {
  chatDeepLink,
  isQuietHour,
  needsTelegram,
  noticeText,
  planNotice,
} from './chat-notify.rules';

export interface ChatNotifyInput {
  conversationId: string;
  senderId: number;
  recipientId: number;
  companyId: number;
}

const MORNING_BATCH = 500;
const BUTTON_TEXT = 'Chatni ochish';

/**
 * Tells the recipient there is a new message: a bell row, web push and one
 * Telegram notice per conversation until they read it. It runs AFTER the
 * message is saved and never throws — a failed notice must not fail (and invite
 * a retry of) a saved send. Message content never appears in any of it.
 */
@Injectable()
export class ChatNotifyService {
  private readonly logger = new Logger(ChatNotifyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly gateway: NotificationsGateway,
    private readonly push: PushService,
    private readonly sms: SmsService,
    private readonly config: ConfigService,
    private readonly settings: SettingsService,
  ) {}

  async onMessage(i: ChatNotifyInput, now: Date = new Date()): Promise<void> {
    try {
      const [recipient, sender] = await Promise.all([
        this.prisma.student.findFirst({
          where: { id: i.recipientId, deletedAt: null },
          select: {
            userId: true,
            telegramChatId: true,
            telegramDisconnectedAt: true,
          },
        }),
        this.prisma.student.findFirst({
          where: { id: i.senderId },
          select: { firstName: true, lastName: true },
        }),
      ]);
      if (!recipient || !sender) return;
      const name = `${sender.firstName} ${sender.lastName}`.trim();
      if (recipient.userId) await this.bell(recipient.userId, name, i);
      // A chat the bot marked disconnected is skipped (ADR-0129, ADR-0117 precedent).
      if (recipient.telegramChatId && !recipient.telegramDisconnectedAt) {
        await this.telegram(i, name, recipient.telegramChatId, now);
      }
    } catch (err) {
      this.warn('notice', i.recipientId, err);
    }
  }

  async onRead(studentId: number, conversationId: string): Promise<void> {
    try {
      const me = await this.prisma.student.findFirst({
        where: { id: studentId },
        select: { userId: true },
      });
      if (!me?.userId) return;
      await this.prisma.notification.updateMany({
        where: {
          userId: me.userId,
          type: 'CHAT_MESSAGE',
          relatedEntityId: conversationId,
          isRead: false,
        },
        data: { isRead: true },
      });
    } catch (err) {
      this.warn('bell read', studentId, err);
    }
  }

  /** At most one unread bell row per conversation; it folds by groupKey on the client. */
  private async bell(userId: number, name: string, i: ChatNotifyInput) {
    try {
      const unread = await this.prisma.notification.findFirst({
        where: {
          userId,
          type: 'CHAT_MESSAGE',
          relatedEntityId: i.conversationId,
          isRead: false,
        },
        select: { id: true },
      });
      if (unread) return;
      const title = 'Yangi xabar';
      const message = `${name} sizga xabar yubordi`;
      const notification = await this.notifications.create({
        userId,
        type: 'CHAT_MESSAGE',
        title,
        message,
        relatedEntityType: 'ChatConversation',
        relatedEntityId: i.conversationId,
        companyId: i.companyId,
      });
      this.gateway.sendToUser(userId, { type: 'notification', notification });
      await this.push.sendToUser(userId, {
        title,
        body: message,
        url: `/portal/chat/${i.conversationId}`,
      });
    } catch (err) {
      this.warn('bell', i.recipientId, err);
    }
  }

  private async telegram(
    i: ChatNotifyInput,
    name: string,
    chatId: string,
    now: Date,
  ) {
    const key = {
      conversationId_studentId: {
        conversationId: i.conversationId,
        studentId: i.recipientId,
      },
    };
    try {
      const [state, read] = await Promise.all([
        this.prisma.chatNotifyState.findUnique({ where: key }),
        this.prisma.chatReadState.findUnique({ where: key }),
      ]);
      const plan = planNotice(state, read?.lastReadAt ?? null, now);
      if (plan === 'SKIP') return;
      const data = {
        conversationId: i.conversationId,
        studentId: i.recipientId,
      };
      if (plan === 'EDIT_COUNT' || plan === 'EDIT_RESET') {
        const count = plan === 'EDIT_COUNT' ? (state?.unreadCount ?? 1) + 1 : 1;
        const edited = await this.sms.editTelegramMessage(
          chatId,
          state!.telegramMessageId!,
          noticeText(name, count),
          this.noticeMarkup(i),
        );
        if (edited) {
          await this.prisma.chatNotifyState.update({
            where: key,
            data:
              plan === 'EDIT_COUNT'
                ? { unreadCount: count }
                : { unreadCount: 1, notifiedAt: now, pendingSince: null },
          });
          return;
        }
        // The person deleted it: fall through and send a fresh one.
      }
      if (isQuietHour(now)) {
        await this.prisma.chatNotifyState.upsert({
          where: key,
          create: { ...data, pendingSince: now },
          update: { pendingSince: now },
        });
        return;
      }
      // The old notice goes: a stretch has exactly one.
      if (state?.telegramMessageId) {
        await this.sms.deleteTelegramMessage(chatId, state.telegramMessageId);
      }
      const messageId = await this.sendNotice(i, name, 1);
      await this.prisma.chatNotifyState.upsert({
        where: key,
        create: {
          ...data,
          notifiedAt: now,
          telegramMessageId: messageId,
          unreadCount: 1,
        },
        update: {
          notifiedAt: now,
          pendingSince: null,
          telegramMessageId: messageId,
          unreadCount: 1,
        },
      });
    } catch (err) {
      this.warn('telegram', i.recipientId, err);
    }
  }

  private noticeMarkup(i: ChatNotifyInput) {
    const link = chatDeepLink(
      this.config.get<string>('TELEGRAM_MINI_APP_URL'),
      i.conversationId,
    );
    return link
      ? Markup.inlineKeyboard([[Markup.button.webApp(BUTTON_TEXT, link)]])
          .reply_markup
      : undefined;
  }

  /** Sends the notice and returns its Telegram message id (null when unknown). */
  private async sendNotice(
    i: ChatNotifyInput,
    name: string,
    count: number,
  ): Promise<number | null> {
    const markup = this.noticeMarkup(i);
    const sms = await this.sms.sendToStudent(
      i.recipientId,
      noticeText(name, count),
      SmsMessageType.AUTO,
      undefined,
      i.companyId,
      markup ? { replyMarkup: markup } : undefined,
    );
    return sms?.telegramMessageId ?? null;
  }

  /**
   * 08:00 Tashkent: send the notices held over the night — once, and only to
   * a recipient who still has something unread.
   */
  @Cron('0 0 8 * * *', { timeZone: 'Asia/Tashkent' })
  async sendMorning(now: Date = new Date()): Promise<void> {
    try {
      const pending = await this.prisma.chatNotifyState.findMany({
        where: { pendingSince: { not: null } },
        orderBy: { pendingSince: 'asc' },
        take: MORNING_BATCH,
      });
      for (const p of pending) {
        const key = {
          conversationId_studentId: {
            conversationId: p.conversationId,
            studentId: p.studentId,
          },
        };
        try {
          const [conversation, read] = await Promise.all([
            this.prisma.chatConversation.findUnique({
              where: { id: p.conversationId },
            }),
            this.prisma.chatReadState.findUnique({ where: key }),
          ]);
          if (!conversation) {
            await this.prisma.chatNotifyState.update({
              where: key,
              data: { pendingSince: null },
            });
            continue;
          }
          const senderId =
            conversation.studentLowId === p.studentId
              ? conversation.studentHighId
              : conversation.studentLowId;
          const unread = await this.prisma.chatMessage.count({
            where: {
              conversationId: p.conversationId,
              senderId: { not: p.studentId },
              deletedAt: null,
              ...(read && { createdAt: { gt: read.lastReadAt } }),
            },
          });
          const [recipient, enabled] = await Promise.all([
            this.prisma.student.findFirst({
              where: { id: p.studentId, deletedAt: null },
              select: { telegramChatId: true, telegramDisconnectedAt: true },
            }),
            this.settings.get(conversation.companyId, 'chat.enabled'),
          ]);
          const reachable =
            (enabled || isChatTester(this.config, p.studentId)) &&
            recipient?.telegramChatId &&
            !recipient.telegramDisconnectedAt;
          if (
            reachable &&
            unread > 0 &&
            needsTelegram(p, read?.lastReadAt ?? null)
          ) {
            const sender = await this.prisma.student.findFirst({
              where: { id: senderId },
              select: { firstName: true, lastName: true },
            });
            if (sender) {
              const messageId = await this.sendNotice(
                {
                  conversationId: p.conversationId,
                  senderId,
                  recipientId: p.studentId,
                  companyId: conversation.companyId,
                },
                `${sender.firstName} ${sender.lastName}`.trim(),
                unread,
              );
              await this.prisma.chatNotifyState.update({
                where: key,
                data: {
                  notifiedAt: now,
                  pendingSince: null,
                  telegramMessageId: messageId,
                  unreadCount: unread,
                },
              });
              continue;
            }
          }
          await this.prisma.chatNotifyState.update({
            where: key,
            data: { pendingSince: null },
          });
        } catch (err) {
          this.warn('morning notice', p.studentId, err);
        }
      }
    } catch (err) {
      this.logger.warn(
        `Chat morning run failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    }
  }

  private warn(what: string, studentId: number, err: unknown) {
    this.logger.warn(
      `Chat ${what} for student ${studentId} failed: ${
        err instanceof Error ? err.message : 'unknown error'
      }`,
    );
  }
}
