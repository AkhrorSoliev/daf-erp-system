import type { Prisma } from '@prisma/client';
import { MAQSAD_BALL } from '../../src/daf/uebung/punkte';
import { haftalikMatn, kechkiMatn } from '../../src/daf/eslatma/eslatma-matn';

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

const USAGE =
  'Ishlatish: daf-eslatma-sinov.ts --user=<CEO user id> | --chat=<shaxsiy chat id> [--send]';

export function parseSinovArgs(argv: string[]): SinovArgs {
  let user: number | null = null;
  let chat: string | null = null;
  let send = false;
  for (const a of argv) {
    const m = /^--(user|chat)=([1-9]\d*)$/.exec(a);
    if (a === '--send') send = true;
    else if (m?.[1] === 'user') user = Number(m[2]);
    else if (m?.[1] === 'chat') chat = m[2];
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
