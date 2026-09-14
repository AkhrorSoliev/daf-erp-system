/**
 * Tizimning o'zi qo'yadigan manbalar. Bot yoki mock imtihon orqali o'zi
 * ro'yxatdan o'tgan o'quvchining lidiga shu nomlar yoziladi — ular forma
 * havolasi tegi bo'lmasligi kerak, aks holda forma lidlari bot lidlari bilan
 * aralashadi. Server nusxasi (va haqiqiy qorovul):
 * server/src/common/student-origin/student-lead-origin.service.ts `SELF_SIGNUP_SOURCE`.
 */
export const RESERVED_LEAD_SOURCES = ["Telegram bot", "Mock imtihon"] as const;

export function isReservedLeadSource(name: string): boolean {
  const key = name.trim().toLowerCase();
  return RESERVED_LEAD_SOURCES.some((n) => n.toLowerCase() === key);
}
