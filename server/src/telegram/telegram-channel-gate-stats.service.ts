import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_COMPANY_ID } from './constants';

/** Telegram foydalanuvchisining biz saqlaydigan minimal ma'lumoti. */
export interface GateUser {
  id: number | string;
  username?: string;
  first_name?: string;
}

/**
 * Kanal a'zolik gate'ining voronkasini yozib boradi (`TelegramChannelGateEvent`).
 *
 * MAQSAD: "kanalga nechchi kishi AYNAN bot talab qilgani uchun a'zo bo'ldi?"
 * degan savolga javob berish. Buning uchun uch hodisa yoziladi: bot odamni
 * to'sdi (`blockedAt`), odam a'zo bo'ldi (`joinedAt`), keyin chiqib ketdi
 * (`leftAt`).
 *
 * MUHIM: bu servis HECH QACHON xato otmaydi. Statistika yozuvidagi nosozlik
 * botni to'xtatmasligi kerak — barcha metodlar o'z ichida `try/catch` qiladi va
 * faqat log yozadi. Statistika yo'qolishi — botning ishlamay qolishidan afzal.
 *
 * Yozuv chastotasi past: odam boshiga umr bo'yi ~2–3 marta (har xabarda EMAS).
 */
@Injectable()
export class TelegramChannelGateStatsService {
  private readonly logger = new Logger(TelegramChannelGateStatsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Bot foydalanuvchini to'sdi — u kanalga a'zo emas edi.
   *
   * `blockedAt` faqat BIRINCHI to'siqda yoziladi (keyingi to'siqlar uni
   * o'zgartirmaydi), shunda "birinchi marta qachon jalb qilindi" saqlanadi.
   *
   * Agar bu odam ilgari a'zo bo'lgan bo'lsa (`joinedAt` bor) va endi to'silayotgan
   * bo'lsa — demak u kanaldan CHIQIB KETGAN. Shuning uchun `leftAt` ham yoziladi.
   */
  async recordBlocked(user: GateUser): Promise<void> {
    const telegramUserId = String(user.id);
    try {
      const existing = await this.prisma.telegramChannelGateEvent.findUnique({
        where: {
          companyId_telegramUserId: {
            companyId: DEFAULT_COMPANY_ID,
            telegramUserId,
          },
        },
      });

      const now = new Date();
      if (!existing) {
        await this.prisma.telegramChannelGateEvent.create({
          data: {
            companyId: DEFAULT_COMPANY_ID,
            telegramUserId,
            username: user.username ?? null,
            firstName: user.first_name ?? null,
            blockedAt: now,
          },
        });
        return;
      }

      // A'zo bo'lgan edi, endi to'silyapti → kanaldan chiqib ketgan.
      const leftNow =
        existing.joinedAt && !existing.leftAt ? { leftAt: now } : {};

      // Takroriy to'siq va hech narsa o'zgarmagan bo'lsa — yozmaymiz.
      const unchanged =
        existing.blockedAt !== null &&
        Object.keys(leftNow).length === 0 &&
        (user.username ?? existing.username) === existing.username &&
        (user.first_name ?? existing.firstName) === existing.firstName;
      if (unchanged) return;

      await this.prisma.telegramChannelGateEvent.update({
        where: { id: existing.id },
        data: {
          blockedAt: existing.blockedAt ?? now,
          username: user.username ?? existing.username,
          firstName: user.first_name ?? existing.firstName,
          ...leftNow,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Gate statistikasini yozib bo'lmadi (blocked, ${telegramUserId}): ${(err as Error).message}`,
      );
    }
  }

  /**
   * Foydalanuvchining kanal a'zoligi tasdiqlandi.
   *
   * `joinedAt` faqat birinchi tasdiqda yoziladi. Agar odam ilgari chiqib ketgan
   * bo'lsa (`leftAt` bor) va qaytadan kirsa — `leftAt` tozalanadi va
   * `rejoinCount` bittaga oshadi.
   */
  async recordJoined(user: GateUser): Promise<void> {
    const telegramUserId = String(user.id);
    try {
      const existing = await this.prisma.telegramChannelGateEvent.findUnique({
        where: {
          companyId_telegramUserId: {
            companyId: DEFAULT_COMPANY_ID,
            telegramUserId,
          },
        },
      });

      const now = new Date();
      if (!existing) {
        // To'siqsiz kelgan: botga murojaat qilganida allaqachon a'zo edi.
        // `blockedAt` NULL qoladi — bu odam gate tufayli kelmagan, shuning
        // uchun asosiy metrikaga kirmasligi kerak.
        await this.prisma.telegramChannelGateEvent.create({
          data: {
            companyId: DEFAULT_COMPANY_ID,
            telegramUserId,
            username: user.username ?? null,
            firstName: user.first_name ?? null,
            joinedAt: now,
          },
        });
        return;
      }

      // Barqaror holat: allaqachon a'zo, chiqib ketmagan, ismi ham o'zgarmagan.
      // Bu tekshiruv HAR sessiyada ishlaydi, shuning uchun keraksiz yozuvni
      // to'xtatamiz — aks holda a'zolar bazaga bekorga yozib turardi.
      const unchanged =
        existing.joinedAt !== null &&
        existing.leftAt === null &&
        (user.username ?? existing.username) === existing.username &&
        (user.first_name ?? existing.firstName) === existing.firstName;
      if (unchanged) return;

      const isRejoin = Boolean(existing.leftAt);
      await this.prisma.telegramChannelGateEvent.update({
        where: { id: existing.id },
        data: {
          joinedAt: existing.joinedAt ?? now,
          leftAt: null,
          rejoinCount: isRejoin
            ? existing.rejoinCount + 1
            : existing.rejoinCount,
          username: user.username ?? existing.username,
          firstName: user.first_name ?? existing.firstName,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Gate statistikasini yozib bo'lmadi (joined, ${telegramUserId}): ${(err as Error).message}`,
      );
    }
  }

  /**
   * Hisobot uchun jamlanma.
   *
   * Davr (`from`/`to`) HAR BIR ko'rsatkichga o'z hodisasi sanasi bo'yicha
   * qo'llanadi: to'silganlar — `blockedAt`, a'zo bo'lganlar — `joinedAt`,
   * chiqib ketganlar — `leftAt`. Ya'ni "iyul oyida nechchi kishi a'zo bo'ldi"
   * degan savol to'g'ri javob oladi.
   *
   * `stillMemberViaGate` esa ATAYLAB davrsiz — bu joriy holat ("hozir ham a'zo
   * bo'lib turganlar"), tarixiy davrga bog'lash mantiqsiz bo'lardi.
   */
  async getSummary(range?: { from?: Date; to?: Date }) {
    const period =
      range?.from || range?.to
        ? {
            ...(range.from ? { gte: range.from } : {}),
            ...(range.to ? { lte: range.to } : {}),
          }
        : undefined;

    const base = { companyId: DEFAULT_COMPANY_ID };
    const inPeriod = (field: 'blockedAt' | 'joinedAt' | 'leftAt') =>
      period ? { [field]: period } : { [field]: { not: null } };

    const [
      blocked,
      joinedViaGate,
      leftAfterJoin,
      organicJoins,
      stillMemberViaGate,
      waiting,
    ] = await Promise.all([
      // Bot to'sgan odamlar
      this.prisma.telegramChannelGateEvent.count({
        where: { ...base, ...inPeriod('blockedAt') },
      }),
      // Bot tufayli a'zo bo'lganlar — ASOSIY METRIKA
      this.prisma.telegramChannelGateEvent.count({
        where: { ...base, blockedAt: { not: null }, ...inPeriod('joinedAt') },
      }),
      // Bot tufayli a'zo bo'lib, keyin chiqib ketganlar
      this.prisma.telegramChannelGateEvent.count({
        where: { ...base, blockedAt: { not: null }, ...inPeriod('leftAt') },
      }),
      // To'silmagan — o'z-o'zidan kelgan obunachilar
      this.prisma.telegramChannelGateEvent.count({
        where: { ...base, blockedAt: null, ...inPeriod('joinedAt') },
      }),
      // Joriy holat: bot tufayli kelgan va hozir ham a'zo (davrsiz)
      this.prisma.telegramChannelGateEvent.count({
        where: {
          ...base,
          blockedAt: { not: null },
          joinedAt: { not: null },
          leftAt: null,
        },
      }),
      // To'silgan, lekin hali a'zo bo'lmagan (davrsiz — joriy holat)
      this.prisma.telegramChannelGateEvent.count({
        where: { ...base, blockedAt: { not: null }, joinedAt: null },
      }),
    ]);

    return {
      blocked,
      joinedViaGate,
      leftAfterJoin,
      organicJoins,
      stillMemberViaGate,
      waiting,
      // To'silganlarning necha foizi a'zo bo'ldi. Maxraj 0 bo'lsa 0 qaytadi
      // (bo'lishda cheksizlik chiqmasligi uchun).
      conversionRate:
        blocked > 0 ? Math.round((joinedViaGate / blocked) * 100) : 0,
    };
  }

  /** Hisobot jadvali uchun ro'yxat (eng yangisi birinchi). */
  async getList(params: { page: number; pageSize: number }) {
    const { page, pageSize } = params;
    const where = { companyId: DEFAULT_COMPANY_ID };
    const [data, total] = await Promise.all([
      this.prisma.telegramChannelGateEvent.findMany({
        where,
        orderBy: [{ blockedAt: 'desc' }, { joinedAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.telegramChannelGateEvent.count({ where }),
    ]);
    return { data, total, page, pageSize };
  }

  /**
   * Foydalanuvchi kanaldan chiqib ketgani aniqlandi.
   *
   * Faqat bizga tanish odamlar uchun yoziladi — biz kuzatmagan (bazada yo'q)
   * odamning chiqib ketishi gate'ga aloqador emas, shuning uchun yangi qator
   * yaratilmaydi.
   */
  async recordLeft(telegramUserId: string | number): Promise<void> {
    const id = String(telegramUserId);
    try {
      await this.prisma.telegramChannelGateEvent.updateMany({
        where: {
          companyId: DEFAULT_COMPANY_ID,
          telegramUserId: id,
          leftAt: null,
        },
        data: { leftAt: new Date() },
      });
    } catch (err) {
      this.logger.warn(
        `Gate statistikasini yozib bo'lmadi (left, ${id}): ${(err as Error).message}`,
      );
    }
  }
}
