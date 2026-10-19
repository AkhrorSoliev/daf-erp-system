import type { Prisma } from '@prisma/client';
import type { InlineKeyboardMarkup } from 'telegraf/types';
import { MAQSAD_BALL } from '../../src/daf/uebung/punkte';
import {
  haftalikMatn,
  kechkiMatn,
  toxtatishTugmasi,
} from '../../src/daf/eslatma/eslatma-matn';
import { describeError } from '../../src/telegram-digest/telegram-send';

/**
 * CEO sinov nusxasining matnlari (spec S4 §5 «Sinov nusxasi») — haqiqiy
 * matn funksiyalari, namunaviy ma'lumot bilan: hech qanday o'quvchi
 * o'qilmaydi. Har xabar `[SINOV]` qatori bilan boshlanadi, shunda CEO'ga
 * borgan nusxani haqiqiy eslatma bilan adashtirib bo'lmaydi.
 */
export const NAMUNA_ISM = 'Aziza';
export const SINOV_BELGISI = "[SINOV] Namunaviy ma'lumot — haqiqiy emas\n\n";

export interface SinovXabari {
  nomi: string;
  matn: string;
}

export function sinovXabarlari(): SinovXabari[] {
  const xabarlar: SinovXabari[] = [
    {
      nomi: 'Kechki eslatma — seriya bilan',
      matn: kechkiMatn({
        ism: NAMUNA_ISM,
        seriya: 5,
        maqsadBall: MAQSAD_BALL.ORTA,
      }),
    },
    {
      nomi: 'Kechki eslatma — seriyasiz',
      matn: kechkiMatn({
        ism: NAMUNA_ISM,
        seriya: 0,
        maqsadBall: MAQSAD_BALL.ORTA,
      }),
    },
    {
      nomi: 'Dushanba xulosasi',
      matn: haftalikMatn({
        ism: NAMUNA_ISM,
        ball: 340,
        liga: { tier: 0, orin: 2, kotarildi: true },
        guruh: { orin: 3, jami: 12 },
        nishonlar: ['SERIE_7', 'WOERTER_150'],
      }),
    },
  ];
  return xabarlar.map((x) => ({ ...x, matn: SINOV_BELGISI + x.matn }));
}

export interface SinovArgs {
  user: number | null;
  chat: string | null;
  send: boolean;
}

const INT4_MAX = 2_147_483_647;
const USAGE =
  'Ishlatish: daf-eslatma-sinov.ts --user=<CEO user id> | --chat=<shaxsiy chat id> [--send]';

export function parseSinovArgs(argv: string[]): SinovArgs {
  let user: number | null = null;
  let chat: string | null = null;
  let send = false;
  for (const a of argv) {
    const m = /^--(user|chat)=([1-9]\d*)$/.exec(a);
    if (a === '--send') send = true;
    // A repeated target or a user id beyond int4 is as wrong as an unknown flag.
    else if (m?.[1] === 'user' && user === null && Number(m[2]) <= INT4_MAX)
      user = Number(m[2]);
    else if (m?.[1] === 'chat' && chat === null) chat = m[2];
    else throw new Error(USAGE);
  }
  if ((user === null) === (chat === null)) throw new Error(USAGE);
  return { user, chat, send };
}

/** `--user` faqat tirik, faol CEO hisobini qabul qiladi. */
export function ceoWhere(userId: number): Prisma.UserWhereInput {
  return {
    id: userId,
    deletedAt: null,
    status: 'ACTIVE',
    roles: { some: { role: { name: 'CEO' } } },
  };
}

/**
 * Yuborish uchun manzil (parseSinovArgs kafolatlaydi), `--send` va token
 * kerak. Quruq yurishda `null`; token hech qachon chop etilmaydi.
 */
export function yuborishTokeni(
  args: SinovArgs,
  token: string | undefined,
): string | null {
  if (!args.send) return null;
  if (!token)
    throw new Error("Yuborish uchun TELEGRAM_BOT_TOKEN kerak (muhitda yo'q)");
  return token;
}

/** Pause between the three sends (Telegram limits, and a calm order in the chat). */
export const SINOV_ORASI_MS = 300;

export interface SinovTelegram {
  getMe(): Promise<{ username?: string }>;
  sendMessage(
    chatId: string,
    text: string,
    extra: { parse_mode: 'HTML'; reply_markup: InlineKeyboardMarkup },
  ): Promise<unknown>;
}

/** Everything the run touches outside this file, so a test can fake it. */
export interface SinovDeps {
  token: string | undefined;
  log: (line: string) => void;
  /** A live ACTIVE CEO's `telegramChatId`, or null (see `ceoWhere`). */
  chatOfCeo: (userId: number) => Promise<string | null>;
  /** `<host> [<env label>]` of the database this run would read. */
  dbInfo: () => string;
  telegram: (token: string) => SinovTelegram;
  pause: (ms: number) => Promise<void>;
}

/**
 * The whole run. Dry run (no `--send`) prints the texts and stops. A send needs
 * the token (checked before ANY database call), names the chat, the database
 * and the bot first, and reports how many messages were delivered if one fails.
 */
export async function runSinov(argv: string[], deps: SinovDeps): Promise<void> {
  const args = parseSinovArgs(argv);
  const token = yuborishTokeni(args, deps.token);
  const xabarlar = sinovXabarlari();
  for (const x of xabarlar) {
    deps.log(`── ${x.nomi} (${x.matn.length} belgi)\n${x.matn}\n`);
  }
  if (!token) {
    deps.log('Quruq yurish: hech narsa yuborilmadi. Yuborish uchun --send.');
    return;
  }
  let chatId = args.chat;
  if (chatId === null) {
    chatId = await deps.chatOfCeo(args.user!);
    if (chatId === null) {
      throw new Error(
        `Faol CEO ${args.user} topilmadi yoki uning Telegram'i ulanmagan`,
      );
    }
    if (!/^[1-9]\d*$/.test(chatId)) {
      throw new Error(
        `CEO ${args.user} chat id shaxsiy chat emas (musbat son kerak)`,
      );
    }
  }
  deps.log(
    `Manzil: chat ${chatId}${args.user === null ? '' : ` (CEO ${args.user})`}`,
  );
  deps.log(args.user === null ? 'DB: ishlatilmaydi' : `DB: ${deps.dbInfo()}`);
  const telegram = deps.telegram(token);
  const me = await telegram.getMe();
  deps.log(`Bot: @${me.username ?? '?'}`);
  let yuborildi = 0;
  for (const x of xabarlar) {
    if (yuborildi > 0) await deps.pause(SINOV_ORASI_MS);
    try {
      await telegram.sendMessage(chatId, x.matn, {
        parse_mode: 'HTML',
        reply_markup: toxtatishTugmasi(0),
      });
    } catch (err) {
      throw new Error(
        `${yuborildi}/${xabarlar.length} yuborilgan${
          yuborildi > 0 ? ', qayta ishga tushirsangiz takrorlanadi' : ''
        }: ${describeError(err)}`,
      );
    }
    yuborildi++;
    deps.log(`${yuborildi}/${xabarlar.length} yuborildi`);
  }
  deps.log(`Yuborildi: chat ${chatId}`);
}
