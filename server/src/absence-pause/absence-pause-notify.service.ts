import { Injectable, Logger } from '@nestjs/common';
import { NotificationType, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { PushService } from '../notifications/push.service';
import { TelegramService } from '../telegram/telegram.service';

const STUDENT_PORTAL_URL = 'https://student.dafzentrum.uz';

/** Xabar yuborish uchun kerak bo'lgan hamma narsa, bitta joyda. */
export interface PauseTarget {
  enrollmentId: string;
  studentId: number;
  streak: number;
  /** Bildirishnoma yozish uchun majburiy — nishonning o'zi bilan keladi. */
  companyId: number;
  student: {
    id: number;
    firstName: string;
    lastName: string;
    telegramChatId: string | null;
  };
  group: {
    id: string;
    name: string;
    branchId: number;
    teachers: { teacherId: number }[];
  };
}

/**
 * Avtomatik pauza xabarlari.
 *
 * YUBORISH XATOSI HECH QACHON PAUZANI YIQITMAYDI. Pul oqimini to'xtatish
 * xabardan muhimroq: Telegram vaqtincha ishlamagani uchun o'quvchining
 * hisobiga qarz yozilib turishi mantiqsiz bo'lardi. Shuning uchun har bir
 * yuborish o'z `try/catch` ida va faqat `warn` log qoldiradi.
 */
@Injectable()
export class AbsencePauseNotifyService {
  private readonly logger = new Logger(AbsencePauseNotifyService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private gateway: NotificationsGateway,
    private push: PushService,
    private telegram: TelegramService,
  ) {}

  /**
   * Ogohlantirish — o'quvchining o'ziga va filial adminlariga.
   * Qaytaradi: Telegram yetib bordimi (`AbsenceWarningLog.sentToStudent`).
   */
  async warnStudent(
    target: PauseTarget,
    remainingLessons: number,
  ): Promise<boolean> {
    const text =
      `⚠️ <b>Darslarni qoldiryapsiz</b>\n\n` +
      `${target.group.name} guruhida ketma-ket <b>${target.streak} ta</b> darsga kelmadingiz.\n\n` +
      `Yana <b>${remainingLessons} ta</b> dars qoldirsangiz, guruhdagi o'rningiz vaqtincha to'xtatiladi.\n\n` +
      `Agar sabab bo'lsa, iltimos markazga xabar bering.\n🔗 ${STUDENT_PORTAL_URL}`;

    const sent = await this.sendToStudent(target.student.telegramChatId, text);

    await this.notifyStaff(
      target,
      NotificationType.ABSENCE_WARNING,
      'Dars qoldirish ogohlantirishi',
      `${target.student.firstName} ${target.student.lastName} — ${target.group.name}: ketma-ket ${target.streak} ta dars. Pauzagacha ${remainingLessons} ta.`,
    );

    return sent;
  }

  /** Pauza bo'lgandan keyin — o'quvchiga, filial adminlariga va ustozga. */
  async announcePause(target: PauseTarget): Promise<void> {
    const text =
      `⏸ <b>Guruhdagi o'rningiz vaqtincha to'xtatildi</b>\n\n` +
      `${target.group.name} guruhida ketma-ket <b>${target.streak} ta</b> darsga kelmadingiz.\n\n` +
      `Darslaringiz uchun endi hisob yozilmaydi. Qaytishni xohlasangiz, ` +
      `markazga murojaat qiling — o'rningiz tiklanadi.`;

    await this.sendToStudent(target.student.telegramChatId, text);

    await this.notifyStaff(
      target,
      NotificationType.ENROLLMENT_AUTO_PAUSED,
      'Avtomatik pauza',
      `${target.student.firstName} ${target.student.lastName} — ${target.group.name}: ketma-ket ${target.streak} ta darsdan keyin pauzaga o'tkazildi.`,
    );
  }

  /** Kunlik chegara oshgani yoki yurishdagi xatolik — kompaniya CEO lariga. */
  async alertCeos(companyId: number, message: string): Promise<void> {
    const ceos = await this.prisma.user.findMany({
      where: {
        companyId,
        deletedAt: null,
        isActive: true,
        status: UserStatus.ACTIVE,
        roles: { some: { role: { name: 'CEO' } } },
      },
      select: { id: true, telegramChatId: true },
    });

    for (const ceo of ceos) {
      await this.deliver(ceo, {
        type: NotificationType.SYSTEM,
        title: 'Avtomatik pauza',
        message,
        url: '/settings/absence-pause',
        companyId,
        relatedEntityType: 'AbsencePauseSetting',
        relatedEntityId: String(companyId),
      });
    }
  }

  /**
   * Filial adminlari + guruh ustoz(lar)i.
   *
   * Ustoz ATAYLAB ro'yxatda: ertalab davomat ro'yxati qisqargan bo'ladi va
   * u buning sababini bilmay qolmasligi kerak.
   *
   * Qabul qiluvchi filtri uchtasi birga — `deletedAt` + `isActive` +
   * `status`. Bittasi tushib qolsa, ishdan ketgan xodim xabar olishda davom
   * etadi; bu allaqachon bir marta bo'lgan xato.
   */
  private async notifyStaff(
    target: PauseTarget,
    type: NotificationType,
    title: string,
    message: string,
  ): Promise<void> {
    const teacherIds = target.group.teachers.map((t) => t.teacherId);
    const recipients = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        status: UserStatus.ACTIVE,
        OR: [
          {
            branches: { some: { branchId: target.group.branchId } },
            roles: { some: { role: { name: 'Administrator' } } },
          },
          ...(teacherIds.length > 0 ? [{ id: { in: teacherIds } }] : []),
        ],
      },
      select: { id: true, telegramChatId: true },
    });

    for (const user of recipients) {
      await this.deliver(user, {
        type,
        title,
        message,
        url: `/students/${target.studentId}`,
        companyId: target.companyId,
        relatedEntityType: 'Student',
        relatedEntityId: String(target.studentId),
      });
    }
  }

  private async sendToStudent(
    chatId: string | null,
    text: string,
  ): Promise<boolean> {
    if (!chatId) return false;
    try {
      const bot = this.telegram.getBot();
      if (!bot) return false;
      await bot.telegram.sendMessage(chatId, text, { parse_mode: 'HTML' });
      return true;
    } catch (err) {
      this.logger.warn(
        `O'quvchiga Telegram yuborilmadi (${chatId}): ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    }
  }

  /** DB + SSE + Push + Telegram — `attendance-reminder` dagi bilan bir xil. */
  private async deliver(
    user: { id: number; telegramChatId: string | null },
    p: {
      type: NotificationType;
      title: string;
      message: string;
      url: string;
      companyId: number;
      relatedEntityType: string;
      relatedEntityId: string;
    },
  ): Promise<void> {
    try {
      const notification = await this.notifications.create({
        userId: user.id,
        type: p.type,
        title: p.title,
        message: p.message,
        relatedEntityType: p.relatedEntityType,
        relatedEntityId: p.relatedEntityId,
        companyId: p.companyId,
      });
      this.gateway.sendToUser(user.id, { type: 'notification', notification });
    } catch (err) {
      this.logger.warn(
        `Bildirishnoma yozilmadi (user ${user.id}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    try {
      await this.push.sendToUser(user.id, {
        title: p.title,
        body: p.message,
        url: p.url,
      });
    } catch (err) {
      this.logger.warn(
        `Push yuborilmadi (user ${user.id}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (user.telegramChatId) {
      try {
        const bot = this.telegram.getBot();
        if (bot) {
          await bot.telegram.sendMessage(
            user.telegramChatId,
            `<b>${p.title}</b>\n${p.message}`,
            { parse_mode: 'HTML' },
          );
        }
      } catch (err) {
        this.logger.warn(
          `Telegram yuborilmadi (user ${user.id}): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }
}
