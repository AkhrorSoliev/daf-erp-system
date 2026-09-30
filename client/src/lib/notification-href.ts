/**
 * Qo'ng'iroqchadagi bildirishnoma bosilganda qaysi sahifa ochiladi.
 *
 * Ilgari `/students/:id` va `/teachers/:id` ochilardi (ikkala sahifa ham
 * yo'q), `Group` haqidagi xabarlar esa hech narsa ochmasdi. Server
 * yuboradigan `relatedEntityType` lar: Group, Student, User,
 * AbsencePauseSetting, topshiriq xabarlarida esa izoh yozilgan obyekt
 * (Student, Group, Lead, User).
 */
export function notificationHref(
  n: { type: string; relatedEntityType: string | null; relatedEntityId: string | null },
  viewerId: number | undefined,
): string | null {
  // Topshiriq xabarlari push bilan bir joyga — topshiriqlar doskasiga;
  // obyekt sahifasiga u yerdagi karta olib boradi.
  if (n.type.startsWith("TASK_")) return "/tasks";
  const id = n.relatedEntityId;
  if (!id) return null;
  switch (n.relatedEntityType) {
    case "Group":
      return `/groups/${id}`;
    case "Student":
      return `/students/profile/${id}`;
    // Topshiriqdan tashqari yagona `User` xabari — oldingi oydan o'tgan
    // oylik, u ustozning o'ziga keladi. `/teachers/:id` ni ustoz ocholmaydi.
    case "User":
      return id === String(viewerId) ? "/profile/salary" : null;
    case "AbsencePauseSetting":
      return "/settings/absence-pause";
    default:
      return null;
  }
}
