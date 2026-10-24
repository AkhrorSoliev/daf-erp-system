import { msg } from "@/i18n/msg";

// The portal forms' own error texts (onboarding steps, backup number dialog).
// A form keeps the Uzbek text in state and draws it with `portalFormError`,
// so a language switch also changes an error already on screen.
export const PHONE_INCOMPLETE = msg("Telefon raqamni to'liq kiriting");
export const PASSWORD_REQUIRED = msg("Joriy parolingizni kiriting");
export const SMS_NOT_SENT = msg(
  "SMS yuborilmadi. Birozdan keyin qayta urinib ko'ring",
);
export const CODE_LENGTH = msg("Kod 4 xonali bo'lishi kerak");
export const CODE_WRONG = msg("Kod noto'g'ri yoki muddati tugagan");
export const REMOVE_FAILED = msg("O'chirishda xatolik");
export const GENDER_REQUIRED = msg("Jinsingizni tanlang");
export const SAVE_FAILED = msg("Saqlashda xatolik yuz berdi");

const PORTAL_FORM_TEXTS = new Set<string>([
  PHONE_INCOMPLETE,
  PASSWORD_REQUIRED,
  SMS_NOT_SENT,
  CODE_LENGTH,
  CODE_WRONG,
  REMOVE_FAILED,
  GENDER_REQUIRED,
  SAVE_FAILED,
]);

/** Translates the portal's own messages; a server message shows as sent. */
export function portalFormError(
  t: (source: string) => string,
  message: string,
): string {
  return PORTAL_FORM_TEXTS.has(message) ? t(message) : message;
}
