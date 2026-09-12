/**
 * Yangi manba nomini tozalaydi va yaroqliligini aytadi.
 *
 * Alohida faylda, chunki `LeadSourcePicker` ning yagona tekshirsa bo'ladigan
 * qismi shu: qolgani brauzerda ko'rinadigan holat, clientda esa komponent
 * testi uchun infratuzilma yo'q.
 */
export const LEAD_SOURCE_NAME_MAX = 100;

/** Yaroqli bo'lsa tozalangan nomni, aks holda `null` qaytaradi. */
export function normalizeSourceName(raw: string): string | null {
  const name = raw.trim();
  if (!name) return null;
  if (name.length > LEAD_SOURCE_NAME_MAX) return null;
  return name;
}
