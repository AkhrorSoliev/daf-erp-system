import {
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { STAFF_ROLE_IDS } from '../../common/auth/phone-account-rules';
import {
  STAFF_CABINET_REQUESTED,
  type StaffCabinetRequestedEvent,
} from '../../common/auth/staff-telegram';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth.service';
import { getAllowedRoleIds } from '../portal-roles.config';
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

/** Xodim sessiyasi — parol bilan kirish qaytaradigan shaklning o'zi. */
type StaffSession = Awaited<ReturnType<AuthService['login']>>;

/**
 * O'quvchi Mini App kirishining natijalari. Hammasi HTTP 200: «ro'yxatdan
 * o'tmagan», «farzandni tanlang» va «siz xodimsiz» xato emas, klient ularni
 * ekran sifatida ko'rsatadi.
 *
 * `staff` — Telegram hech bir o'quvchiga emas, xodim hisobiga bog'langan: u
 * o'quvchi kabinetini emas, xodim kabinetini ochishi kerak (ADR-0045).
 */
export type TelegramWebAppResult =
  | ({ status: 'authenticated' } & StudentSession)
  | { status: 'choose'; students: LinkedStudent[] }
  | { status: 'staff' }
  | { status: 'not_registered' };

/** Xodim Mini App kirishining natijalari (ADR-0045). */
export type TelegramWebAppStaffResult =
  | ({ status: 'authenticated' } & StaffSession)
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
/** Telegram OAuth'dagi umumiy telefon holati kabi — yopiq holat. */
export const SEVERAL_STAFF_ACCOUNTS_MESSAGE =
  "Bu Telegram bir nechta xodim hisobiga bog'langan. Administrator bilan bog'laning.";
/** Parolsiz hisob parol bilan ham kira olmaydi — Telegram ham kiritmaydi. */
export const STAFF_SIGN_IN_DISABLED_MESSAGE =
  "Hisobingizga kirish yoqilmagan. Administrator bilan bog'laning.";

/**
 * Telegram Mini App ichidan kirish (ADR-0040).
 *
 * Kim ekanini Telegram aytadi (`initData` imzosi), qaysi o'quvchi ekanini
 * `Student.telegramChatId` aytadi. Bu bog'lanish faqat bot orqali, odam o'z
 * Telegram raqamini «📱 Telefon raqamni yuborish» tugmasi bilan yuborganda va u
 * kartadagi raqamga mos kelganda yoziladi (ro'yxatdan o'tish, «Parolni
 * tiklash», «To'lovlar», mock imtihon) — botning parol tiklashi ham aynan shu
 * bog'lanishga ishonadi, ya'ni bu eshik mavjudlaridan kengroq emas.
 *
 * Bu kirish karta raqamini TASDIQLAMAYDI (ADR-0039): `markPhoneVerified` ni
 * faqat SMS yo'llari chaqiradi, birinchi kirish qadamlari Mini App'da ham
 * so'raladi.
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
    private readonly events: EventEmitter2,
  ) {}

  async signIn(
    initData: string,
    studentId?: number,
  ): Promise<TelegramWebAppResult> {
    const telegramUserId = this.verifiedTelegramUserId(initData);

    // Ota-onaning bitta Telegram'iga bir nechta farzand bog'langan bo'lishi
    // mumkin (botdagi «To'lovlar» ham shuni kutadi — `studentsForChat`).
    const linked = await this.prisma.student.findMany({
      where: { telegramChatId: telegramUserId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, userId: true },
      orderBy: { id: 'asc' },
    });
    if (linked.length === 0) {
      // Eski xabarlardagi o'quvchi tugmasini xodim ham bosishi mumkin: unga
      // «ro'yxatdan o'tmagansiz» emas, o'z kabinetining yo'li aytiladi.
      const staff = await this.authService.findStaffAccountsByTelegram(
        telegramUserId,
        STAFF_ROLE_IDS,
        1,
      );
      if (staff.length === 0) return { status: 'not_registered' };
      // Xodim kabinetining tugmasi chatga keladi — Mini App uni o'zi ocholmaydi.
      this.events.emit(STAFF_CABINET_REQUESTED, {
        chatId: telegramUserId,
      } satisfies StaffCabinetRequestedEvent);
      return { status: 'staff' };
    }

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

  /**
   * Xodim kabineti (ADR-0045): `lehrer.` yoki `admin.` portalidagi `/tg`.
   *
   * Kim ekanini Telegram aytadi, qaysi xodim ekanini `User.telegramChatId`.
   * Uni bot xodim o'z Telegram raqamini yuborganda yozadi (ro'yxatdan o'tish
   * yoki bog'lash) — Telegram OAuth kirishi ishonadigan isbotning o'zi.
   *
   * Qidiruv portal rollari bilan cheklanadi (`Origin`), sessiyani esa parol
   * bilan kirishdagi `AuthService.login` beradi — portal darvozasi o'sha
   * yerda yana tekshiriladi. Bir nechta hisob mos kelsa — yopiq holat: parol
   * yo'q joyda «g'olib» tanlash odamni begona hisobga kiritib qo'yardi.
   */
  async signInStaff(
    initData: string,
    origin: string | undefined,
  ): Promise<TelegramWebAppStaffResult> {
    const telegramUserId = this.verifiedTelegramUserId(initData);

    // Lokal dev'da (`null`) — barcha xodim rollari; o'quvchi portalida esa
    // xodim roli yo'q, ya'ni hech kim topilmaydi.
    const portalRoleIds = getAllowedRoleIds(origin) ?? STAFF_ROLE_IDS;
    const matches = await this.authService.findStaffAccountsByTelegram(
      telegramUserId,
      portalRoleIds,
    );
    if (matches.length === 0) return { status: 'not_registered' };
    if (matches.length > 1) {
      this.logger.warn(
        `Mini App: Telegram ${telegramUserId} bir nechta xodim hisobiga bog'langan (${matches
          .map((m) => `#${m.id}`)
          .join(', ')})`,
      );
      throw new UnauthorizedException(SEVERAL_STAFF_ACCOUNTS_MESSAGE);
    }

    // Telegram eshigi parol eshigidan kengroq emas: parolsiz hisobni parol
    // yo'li ham kiritmaydi (`validateUser`), Telegram OAuth ham.
    const [account] = matches;
    if (!account.password) {
      throw new UnauthorizedException(STAFF_SIGN_IN_DISABLED_MESSAGE);
    }

    const session = await this.authService.login(account, origin);
    return { status: 'authenticated', ...session };
  }

  /**
   * `initData` imzosi va muddati — ikkala kirish uchun bitta tekshiruv.
   * Qaytgani — Telegram foydalanuvchi id'si (shaxsiy chatda `chat.id` ham shu).
   */
  private verifiedTelegramUserId(initData: string): string {
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
    return check.telegramUserId;
  }
}
