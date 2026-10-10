import type { LoggerService } from '@nestjs/common';
import { Markup, type Telegram } from 'telegraf';
import {
  signInStaffWhere,
  staffLinkedToChatWhere,
  staffPortalFor,
  type StaffPortal,
} from '../../common/auth/staff-telegram';
import type { PrismaService } from '../../prisma/prisma.service';
import { TEACHER_ROLE_ID } from '../constants';
import type { BotContext } from '../types/context';
import { setChatCabinetButton } from '../utils/mini-app';

/**
 * Botdagi xodim kabineti (ADR-0045).
 *
 * Chat xodim hisobiga bog'langan bo'lsa (`User.telegramChatId`), `/start`
 * o'quvchi menyusi o'rniga xodim menyusini ko'rsatadi va shu chatning doimiy
 * «Kabinet» tugmasini xodim kabinetiga almashtiradi. Qolgan chatlar — o'quvchi
 * kabineti, avvalgidek.
 *
 * Xodim kabineti — portalning o'zi (`lehrer.` yoki `admin.`), Mini App
 * sifatida ochiladi va `/tg` sahifasi Telegram orqali kiritadi.
 */

export const STAFF_CABINET_BUTTON_TEXT = '💼 Kabinet';
const STUDENT_CABINET_BUTTON_TEXT = "🎓 O'quvchi kabineti";

/** Kabinetning sahifalari — portal marshrutlari (`client/src/app/(dashboard)`). */
export const STAFF_PAGES = {
  schedule: '/schedule',
  groups: '/groups',
  salary: '/profile/salary',
} as const;

/**
 * «📋 Topshiriqlarim»: a callback the tasks module answers
 * (`src/tasks/telegram/`, ADR-0077). Only this string lives here, so
 * src/telegram never imports src/tasks.
 */
export const STAFF_TASKS_ACTION = 'tk:list';
export const STAFF_TASKS_BUTTON_TEXT = '📋 Topshiriqlarim';

/** Botga tanish xodim: kabinet shu ma'lumot bilan quriladi. */
export interface StaffAccount {
  id: number;
  firstName: string;
  roleIds: number[];
  portal: StaffPortal;
}

/**
 * Xodim kabinetining Mini App manzili — o'quvchi Mini App'ining manzili,
 * xosti `student.` o'rniga `lehrer.` yoki `admin.`: uchala portal bitta
 * ilova, `/tg` har birida bor.
 *
 * O'quvchi manzili sozlanmagan yoki `student.` xostida bo'lmasa (lokal tunnel)
 * — manzil yo'q, ya'ni xodim kabineti o'chiq: bot avvalgidek ishlaydi.
 */
export function staffMiniAppUrl(
  studentMiniAppUrl: string | undefined,
  portal: StaffPortal,
): string | undefined {
  if (!studentMiniAppUrl) return undefined;
  let url: URL;
  try {
    url = new URL(studentMiniAppUrl);
  } catch {
    return undefined;
  }
  const prefix = 'student.';
  if (!url.hostname.startsWith(prefix)) return undefined;
  url.hostname = `${portal}.${url.hostname.slice(prefix.length)}`;
  return url.toString();
}

/** Kabinetning bitta sahifasi: `/tg?next=<sahifa>` — kirgandan keyin o'sha yerga. */
export function staffPageUrl(cabinetUrl: string, page: string): string {
  const url = new URL(cabinetUrl);
  url.searchParams.set('next', page);
  return url.toString();
}

/**
 * Shu chatga bog'langan, tizimga kira oladigan xodim — Mini App kirishi
 * ishlatadigan shartning o'zi bilan. Bir nechta hisob chiqsa `null`: Mini App
 * ularni rad etadi, bot ham xodim menyusini bermaydi.
 */
export async function findStaffForChat(
  prisma: Pick<PrismaService, 'user'>,
  chatId: string,
  logger: Pick<LoggerService, 'warn'>,
): Promise<StaffAccount | null> {
  const rows = await prisma.user.findMany({
    where: staffLinkedToChatWhere(chatId),
    select: {
      id: true,
      firstName: true,
      roles: { select: { roleId: true } },
    },
    orderBy: { id: 'asc' },
    take: 2,
  });
  if (rows.length > 1) {
    logger.warn(
      `Chat ${chatId} bir nechta xodim hisobiga bog'langan (${rows
        .map((r) => `#${r.id}`)
        .join(', ')}) — xodim menyusi ko'rsatilmadi`,
    );
    return null;
  }
  const [row] = rows;
  if (!row) return null;
  const roleIds = row.roles.map((r) => r.roleId);
  const portal = staffPortalFor(roleIds);
  return portal
    ? { id: row.id, firstName: row.firstName, roleIds, portal }
    : null;
}

/**
 * «Guruhlar» sahifasini ochadigan rollar — `GET /groups` dagi `@Roles`
 * (CEO, Branch Director, Administrator, Teacher). Kassir yo'q.
 */
const GROUPS_PAGE_ROLE_IDS = [1, 2, 3, 4];

/**
 * Xodim menyusi. Kabinet profilni ochadi; jadval — har bir xodim ko'radigan
 * sahifa; guruhlar — kassirdan boshqa hamma; topshiriqlar — hamma xodim;
 * oylik — ustozning o'z sahifasi.
 * Telegram o'quvchi kartasiga ham bog'langan bo'lsa (o'quvchi ustoz bo'lgan
 * yoki farzandi o'qiydi) — o'quvchi kabineti ham.
 */
export function staffMenuKeyboard(
  account: StaffAccount,
  cabinetUrl: string,
  studentCabinetUrl?: string,
) {
  const pages = [
    Markup.button.webApp(
      '📅 Jadval',
      staffPageUrl(cabinetUrl, STAFF_PAGES.schedule),
    ),
  ];
  if (account.roleIds.some((id) => GROUPS_PAGE_ROLE_IDS.includes(id))) {
    pages.push(
      Markup.button.webApp(
        '👥 Guruhlar',
        staffPageUrl(cabinetUrl, STAFF_PAGES.groups),
      ),
    );
  }
  const rows = [
    [Markup.button.webApp(STAFF_CABINET_BUTTON_TEXT, cabinetUrl)],
    pages,
    [Markup.button.callback(STAFF_TASKS_BUTTON_TEXT, STAFF_TASKS_ACTION)],
  ];
  if (account.roleIds.includes(TEACHER_ROLE_ID)) {
    rows.push([
      Markup.button.webApp(
        '💰 Oyligim',
        staffPageUrl(cabinetUrl, STAFF_PAGES.salary),
      ),
    ]);
  }
  if (studentCabinetUrl) {
    rows.push([
      Markup.button.webApp(STUDENT_CABINET_BUTTON_TEXT, studentCabinetUrl),
    ]);
  }
  return Markup.inlineKeyboard(rows);
}

const OPEN_CABINET_TEXT = 'Xodim kabinetini ochish uchun tugmani bosing:';

function cabinetKeyboard(cabinetUrl: string) {
  return Markup.inlineKeyboard([
    [Markup.button.webApp(STAFF_CABINET_BUTTON_TEXT, cabinetUrl)],
  ]);
}

export class StaffCabinet {
  constructor(
    private readonly prisma: Pick<PrismaService, 'user' | 'student'>,
    private readonly telegram: Pick<
      Telegram,
      'setChatMenuButton' | 'sendMessage'
    >,
    /** `TELEGRAM_MINI_APP_URL` — xodim manzillari undan olinadi. */
    private readonly studentMiniAppUrl: string | undefined,
    private readonly logger: Pick<LoggerService, 'warn'>,
  ) {}

  /** Xodimning kabinet manzili; `undefined` — xodim kabineti o'chiq. */
  cabinetUrl(account: StaffAccount): string | undefined {
    return staffMiniAppUrl(this.studentMiniAppUrl, account.portal);
  }

  staffForChat(chatId: string): Promise<StaffAccount | null> {
    return findStaffForChat(this.prisma, chatId, this.logger);
  }

  /**
   * `/start` (havolasiz). Xodim chati — salom, xodim menyusi, `true`. Boshqa
   * chat — `false`, chaqiruvchi o'quvchi menyusini ko'rsatadi; xodimligi
   * tugagan chatning «Kabinet» tugmasi esa o'quvchinikiga qaytariladi.
   */
  async greet(ctx: BotContext): Promise<boolean> {
    // `web_app` tugmalari faqat shaxsiy chatda ishlaydi.
    if (ctx.chat?.type !== 'private') return false;
    const chatId = String(ctx.chat.id);
    const account = await this.staffForChat(chatId);
    if (account && (await this.showMenu(ctx, account))) return true;
    await this.resetLeftoverButton(chatId);
    return false;
  }

  /**
   * Salom va xodim menyusi; shu chatning «Kabinet» tugmasi — xodim kabineti.
   * `false` — xodim kabineti o'chiq yoki chat shaxsiy emas, hech narsa
   * yuborilmadi.
   */
  async showMenu(ctx: BotContext, account: StaffAccount): Promise<boolean> {
    const cabinetUrl = this.cabinetUrl(account);
    if (!cabinetUrl || ctx.chat?.type !== 'private') return false;
    const chatId = String(ctx.chat.id);

    await setChatCabinetButton(this.telegram, chatId, cabinetUrl, this.logger);
    const studentCabinetUrl =
      this.studentMiniAppUrl &&
      (await this.prisma.student.count({
        where: { telegramChatId: chatId, deletedAt: null },
      })) > 0
        ? this.studentMiniAppUrl
        : undefined;

    // Reply-klaviaturani tozalaydi: yarim qolgan oqimning «📱 Telefon
    // raqamni yuborish» tugmasi ekranda yopishib qolmasin (o'quvchi
    // menyusidagidek).
    await ctx.reply(
      `Assalomu alaykum, ${account.firstName}! DaF Sprachzentrum botiga xush kelibsiz.`,
      Markup.removeKeyboard(),
    );
    await ctx.reply(
      'Xodim kabinetingiz — quyidagi imkoniyatlardan birini tanlang:',
      staffMenuKeyboard(account, cabinetUrl, studentCabinetUrl),
    );
    return true;
  }

  /**
   * Chat xodimniki bo'lsa — salom va xodim menyusi (`true`). Ro'yxatdan
   * o'tish oxirida va «allaqachon ro'yxatdan o'tgansiz» o'rniga.
   */
  async showMenuForChat(ctx: BotContext): Promise<boolean> {
    if (ctx.chat?.type !== 'private') return false;
    const account = await this.staffForChat(String(ctx.chat.id));
    return account ? this.showMenu(ctx, account) : false;
  }

  /**
   * Eski menyudagi callback «🎓 Platformaga kirish»ni xodim bossa — o'quvchi
   * emas, xodim kabinetining tugmasi. `false` — xodim emas, chaqiruvchi
   * o'quvchiga javob beradi.
   */
  async answerPlatform(ctx: BotContext): Promise<boolean> {
    if (ctx.chat?.type !== 'private') return false;
    const chatId = String(ctx.chat.id);
    const account = await this.staffForChat(chatId);
    const cabinetUrl = account ? this.cabinetUrl(account) : undefined;
    if (!cabinetUrl) return false;

    await ctx.answerCbQuery();
    await setChatCabinetButton(this.telegram, chatId, cabinetUrl, this.logger);
    await ctx.reply(OPEN_CABINET_TEXT, cabinetKeyboard(cabinetUrl));
    return true;
  }

  /**
   * Eski xabardagi `web_app` «🎓 Platformaga kirish»ni xodim bossa, o'quvchi
   * Mini App'i ochiladi va uni taniydi (`STAFF_CABINET_REQUESTED`): bot shu
   * chatga xodim kabinetining tugmasini yuboradi. Yuborilgan eski xabarni
   * tahrirlab bo'lmaydi — Telegram xabarlarni bot uchun sanab bermaydi.
   * Xato — faqat log: Mini App baribir «chatga qayting» deydi.
   */
  async sendCabinetButton(chatId: string): Promise<boolean> {
    const account = await this.staffForChat(chatId);
    const cabinetUrl = account ? this.cabinetUrl(account) : undefined;
    if (!cabinetUrl) return false;

    await setChatCabinetButton(this.telegram, chatId, cabinetUrl, this.logger);
    try {
      await this.telegram.sendMessage(
        Number(chatId),
        OPEN_CABINET_TEXT,
        cabinetKeyboard(cabinetUrl),
      );
      return true;
    } catch (err) {
      this.logger.warn(
        `Chat ${chatId} ga xodim kabineti tugmasini yuborib bo'lmadi: ${(err as Error).message}`,
      );
      return false;
    }
  }

  /**
   * Server ishga tushganda: Telegram'i bog'langan har bir xodimning «Kabinet»
   * tugmasi — o'z kabineti (`/start` qiladigan ishning o'zi). Busiz tugma
   * faqat xodim `/start` bosganda almashadi: ADR-0045 dan oldin bog'langan
   * xodimlar bosmagan va «Kabinet» ularni o'quvchi kabinetiga olib borardi.
   *
   * Bir chatga bir nechta xodim hisobi — tegilmaydi (`findStaffForChat` kabi).
   * Xodimligi tugagan chatlar bu yerda qaytarilmaydi — ularni `/start`
   * qaytaradi (`resetLeftoverButton`). Qaytgani — tugmasi qo'yilgan chatlar.
   */
  async syncButtons(): Promise<number> {
    if (!this.studentMiniAppUrl) return 0;
    const rows = await this.prisma.user.findMany({
      where: { ...signInStaffWhere(), telegramChatId: { not: null } },
      select: {
        telegramChatId: true,
        roles: { select: { roleId: true } },
      },
    });

    const byChat = new Map<string, number[][]>();
    for (const row of rows) {
      const chatId = row.telegramChatId!;
      byChat.set(chatId, [
        ...(byChat.get(chatId) ?? []),
        row.roles.map((r) => r.roleId),
      ]);
    }

    let set = 0;
    for (const [chatId, accounts] of byChat) {
      if (accounts.length !== 1) continue;
      const portal = staffPortalFor(accounts[0]);
      const url = portal && staffMiniAppUrl(this.studentMiniAppUrl, portal);
      if (!url) continue;
      await setChatCabinetButton(this.telegram, chatId, url, this.logger);
      set++;
    }
    return set;
  }

  /** Chatning «Kabinet» tugmasini botning standartiga (o'quvchi) qaytaradi. */
  resetButton(chatId: string): Promise<void> {
    return setChatCabinetButton(this.telegram, chatId, undefined, this.logger);
  }

  /**
   * Xodimligi tugagan chat (hisob arxivlandi, bloklandi yoki Telegram boshqa
   * hisobga o'tdi) xodim kabinetini ochmasin. Faqat biror hisob hali shu
   * chatni ko'rsatib turgan bo'lsa tegiladi — har bir o'quvchining `/start`i
   * Telegram so'roviga aylanmasin. Xodim kabineti o'chiq bo'lsa — hech narsa:
   * prod tokenli lokal server prod menyusiga tegmasin.
   */
  private async resetLeftoverButton(chatId: string): Promise<void> {
    if (!this.studentMiniAppUrl) return;
    const named = await this.prisma.user.count({
      where: { telegramChatId: chatId },
    });
    if (named > 0) await this.resetButton(chatId);
  }
}
