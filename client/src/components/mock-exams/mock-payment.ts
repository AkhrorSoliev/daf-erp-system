import type { Translate } from "@/components/notifications/notification-view";
import { msg } from "@/i18n/msg";
import { interpolate } from "@/i18n/translate";

/**
 * Mock imtihon to'lovining usuli va manbai. Ishtirokchilar jadvali,
 * «To'lov qabul qilish» va «To'lovni tahrirlash» oynalari shu yerdan o'qiydi.
 */
export type MockPaymentMethod = "CASH" | "PAYME" | "CLICK";

/**
 * Pul qayerda turibdi — server hal qiladi (`mock-payment-source.ts`):
 *   MANUAL  — admin qabul qilgan: usul va izohni tuzatish, bekor qilish mumkin;
 *   GATEWAY — Payme/Click orqali onlayn o'tgan: pul to'lov tizimida, bu yerda
 *             o'zgarmaydi;
 *   BALANCE — 2026-08 gacha o'quvchi balansidan yechilgan.
 */
export type MockPaymentSource = "MANUAL" | "GATEWAY" | "BALANCE";

export const MOCK_PAYMENT_METHODS: MockPaymentMethod[] = [
  "CASH",
  "PAYME",
  "CLICK",
];

// Brand names (Payme, Click) are printed as they are, never through `t`.
const CASH_WORD = msg("Naqd");

export function mockPaymentMethodLabel(
  method: MockPaymentMethod,
  t: Translate = interpolate,
): string {
  if (method === "CASH") return t(CASH_WORD);
  if (method === "PAYME") return "Payme";
  if (method === "CLICK") return "Click";
  return method;
}

interface PaymentView {
  paid: boolean;
  paymentMethod: MockPaymentMethod | null;
  paymentSource?: MockPaymentSource | null;
  paidFromBalance?: boolean;
}

function methodLabel(
  method: MockPaymentMethod | null,
  t: Translate,
): string | null {
  return method ? mockPaymentMethodLabel(method, t) : null;
}

/**
 * Jadvaldagi «To'langan» belgisi ostidagi qisqa yozuv: qanday to'langani.
 * Usuli saqlanmagan eski qo'lda qabul qilingan to'lovda `null` — u yerda
 * hech narsa taxmin qilinmaydi.
 */
export function paymentMethodSummary(
  p: PaymentView,
  t: Translate = interpolate,
): string | null {
  if (!p.paid) return null;
  if (p.paymentSource === "BALANCE" || p.paidFromBalance) {
    return t("Balansdan");
  }
  if (p.paymentSource === "GATEWAY") {
    return t("{method} · onlayn", {
      method: methodLabel(p.paymentMethod, t) ?? "Payme/Click",
    });
  }
  return methodLabel(p.paymentMethod, t);
}

/** Faqat admin qabul qilgan to'lovni tahrirlash va bekor qilish mumkin. */
export function canEditPayment(p: PaymentView): boolean {
  return p.paid && p.paymentSource === "MANUAL";
}

/** Izoh maydoni: bo'sh yoki faqat bo'shliq — izoh yo'q. */
export function normalizePaymentNote(note: string): string | null {
  return note.trim() || null;
}

/** Bekor qilish sababi: server kabi, bo'shliqlarsiz kamida 3 belgi. */
export const CANCEL_REASON_MIN_LENGTH = 3;

export function isCancelReasonValid(reason: string): boolean {
  return reason.trim().length >= CANCEL_REASON_MIN_LENGTH;
}

/** «Saqlash» faqat usul yoki izoh haqiqatan o'zgarganda yoqiladi. */
export function paymentEditChanged(
  original: { paymentMethod: MockPaymentMethod | null; paymentNote: string | null },
  method: MockPaymentMethod | null,
  note: string,
): boolean {
  if (!method) return false;
  return (
    method !== original.paymentMethod ||
    normalizePaymentNote(note) !== (original.paymentNote ?? null)
  );
}
