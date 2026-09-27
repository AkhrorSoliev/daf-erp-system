import {
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth.service';
import { checkInitData } from './telegram-init-data';

/**
 * Parol bilan kirish yo'li qaytaradigan sessiya shakli — qo'lda yozilmagan,
 * `buildStudentSession`ning haqiqiy qaytish qiymatidan olingan.
 */
type StudentSession = Awaited<ReturnType<AuthService['buildStudentSession']>>;

/** Tanlash ekrani uchun: faqat ism va id, boshqa hech narsa. */
export interface LinkedStudent {
  id: number;
  firstName: string;
  lastName: string;
}

/**
 * Mini App kirishining uch natijasi. Uchalasi ham HTTP 200: «ro'yxatdan
 * o'tmagan» va «farzandni tanlang» xato emas, klient ularni ekran sifatida
 * ko'rsatadi.
 */
export type TelegramWebAppResult =
  | ({ status: 'authenticated' } & StudentSession)
  | { status: 'choose'; students: LinkedStudent[] }
  | { status: 'not_registered' };

export const WEBAPP_DISABLED_MESSAGE =
  'Telegram orqali kirish hozircha yoqilmagan.';
export const INIT_DATA_EXPIRED_MESSAGE =
  "Kirish muddati o'tdi. Mini App'ni yopib, qayta oching.";
export const INIT_DATA_INVALID_MESSAGE =
  "Telegram ma'lumotlari tasdiqlanmadi. Mini App'ni yopib, qayta oching.";
/** Botning ilova kirishi (`approveLoginRequest`) bilan bir xil so'z. */
export const NO_ACCOUNT_MESSAGE =
  "Sizda ilova hisobi yo'q. Administrator bilan bog'laning.";
export const NOT_LINKED_STUDENT_MESSAGE =
  "Bu o'quvchi Telegram akkauntingizga bog'lanmagan.";

/**
 * Telegram Mini App ichidan kirish (ADR-0039).
 *
 * Kim ekanini Telegram aytadi (`initData` imzosi), qaysi o'quvchi ekanini
 * `Student.telegramChatId` aytadi. Bu bog'lanish faqat bot orqali, odam O'Z
 * telefon raqamini «📱 Telefon raqamni yuborish» tugmasi bilan isbotlagandan
 * keyin yoziladi (ro'yxatdan o'tish, «Parolni tiklash», «To'lovlar», mock
 * imtihon) — botning parol tiklashi ham aynan shu bog'lanishga ishonadi, ya'ni
 * bu eshik mavjudlaridan kengroq emas.
 *
 * Bog'lanish yo'q bo'lsa — hech qanday zaxira yo'l yo'q: telefon/parol
 * so'ralmaydi, «ro'yxatdan o'tmagan» javobi qaytadi.
 */
@Injectable()
export class TelegramWebAppService {
  private readonly logger = new Logger(TelegramWebAppService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  async signIn(
    initData: string,
    studentId?: number,
  ): Promise<TelegramWebAppResult> {
    // Mini App'ni ochgan bot — asosiy bot; `initData` uning tokeni bilan
    // imzolanadi. Token yo'q bo'lsa bot ham yo'q, Mini App ham ochilmaydi.
    const botToken = (
      this.config.get<string>('TELEGRAM_BOT_TOKEN') ?? ''
    ).trim();
    if (!botToken) {
      throw new ServiceUnavailableException(WEBAPP_DISABLED_MESSAGE);
    }

    const check = checkInitData(
      initData,
      botToken,
      Math.floor(Date.now() / 1000),
    );
    if (!check.ok) {
      if (check.reason === 'expired') {
        // Normal holat: odam Mini App'ni uzoq ochiq qoldirgan.
        throw new UnauthorizedException(INIT_DATA_EXPIRED_MESSAGE);
      }
      // Qiymatni emas, faqat sababni yozamiz — `initData` logga tushmasin.
      this.logger.warn(`Mini App initData rad etildi: ${check.reason}`);
      throw new UnauthorizedException(INIT_DATA_INVALID_MESSAGE);
    }

    // Ota-onaning bitta Telegram'iga bir nechta farzand bog'langan bo'lishi
    // mumkin (botdagi «To'lovlar» ham shuni kutadi — `studentsForChat`).
    const linked = await this.prisma.student.findMany({
      where: { telegramChatId: check.telegramUserId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, userId: true },
      orderBy: { id: 'asc' },
    });
    if (linked.length === 0) return { status: 'not_registered' };

    const candidates = linked.filter(
      (s): s is typeof s & { userId: number } => s.userId !== null,
    );
    if (candidates.length === 0) {
      throw new UnauthorizedException(NO_ACCOUNT_MESSAGE);
    }

    let chosen: (typeof candidates)[number] | undefined;
    if (studentId !== undefined) {
      // Tanlov faqat SHU Telegram'ga bog'langanlar orasidan: boshqa id —
      // eskirgan ekran yoki qo'lda yasalgan so'rov.
      chosen = candidates.find((s) => s.id === studentId);
      if (!chosen) throw new ForbiddenException(NOT_LINKED_STUDENT_MESSAGE);
    } else if (candidates.length === 1) {
      chosen = candidates[0];
    } else {
      return {
        status: 'choose',
        students: candidates.map(({ id, firstName, lastName }) => ({
          id,
          firstName,
          lastName,
        })),
      };
    }

    // Rol, bloklangan holat va yopilgan karta (ADR-0033) tekshiruvlari —
    // native ilova kirishi bilan bitta funksiya.
    const session = await this.authService.buildStudentSession(chosen.userId);
    return { status: 'authenticated', ...session };
  }
}
