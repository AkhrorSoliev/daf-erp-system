import { msg } from "@/i18n/msg";

/**
 * Kursning to'lov modeli — backend `PaymentModel` enumiga mos
 * (`server/prisma/schema.prisma`). Bu yerda alohida saqlanadi, chunki
 * frontend Prisma clientini import qilmaydi.
 */
export type PaymentModel = "LESSON_PACK" | "MONTHLY";

/** Select/tanlov elementlarida ishlatiladigan to'liq nom. */
export const PAYMENT_MODEL_LABELS: Record<PaymentModel, string> = {
  LESSON_PACK: msg("Sikl to'lovi (dars-paket)"),
  MONTHLY: msg("Oylik (kalendar oy)"),
};

/**
 * Jadval/badge kabi tor joylarda ishlatiladigan qisqa nom. «Oylik» alone
 * would clash with the salary key, so both read «… to'lov(i)».
 */
export const PAYMENT_MODEL_SHORT_LABELS: Record<PaymentModel, string> = {
  LESSON_PACK: msg("Sikl to'lovi"),
  MONTHLY: msg("Oylik to'lov"),
};
