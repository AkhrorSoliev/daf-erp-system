/**
 * Botga kelgan kontakt aynan yuborgan odamning o'ziniki ekanini aytadi.
 *
 * NEGA: «📱 Telefon raqamni yuborish» tugmasi Telegramning o'zi tasdiqlagan
 * raqamni `user_id` bilan birga yuboradi. Lekin odam istalgan kontakt
 * kartasini ham yuborishi mumkin — begona raqam bilan, `user_id`siz yoki
 * boshqa `user_id` bilan. Shunday kartani qabul qilish begonaning raqami
 * bilan ro'yxatdan o'tish yoki begona o'quvchining hisobini o'ziga bog'lab
 * parolini olish yo'lini ochadi. Shuning uchun `user_id` YO'Q bo'lsa ham
 * rad etiladi — «yo'q» degani «isbotlanmagan» degani.
 */
export const CONTACT_NOT_OWN =
  "Iltimos, faqat o'zingizning raqamingizni «📱 Telefon raqamni yuborish» tugmasi orqali yuboring.";

export function contactBelongsToSender(
  contact: { user_id?: number | null },
  from: { id: number } | undefined,
): boolean {
  if (!from) return false;
  if (contact.user_id === undefined || contact.user_id === null) return false;
  return contact.user_id === from.id;
}
