/**
 * Kim qaysi sahifani ochadi va qaysi amalni bajaradi — serverdagi `@Roles()`
 * ning mijozdagi nusxasi. Har bir ro'yxat yonida uni belgilaydigan endpoint
 * yozilgan: ikkalasi farq qilsa, ekrandagi havola yoki tugma 403 ga olib
 * boradi. Birini o'zgartirsangiz, o'sha controller'ni va docs/role-access.md
 * ni ham o'zgartiring.
 */

/** `GET /groups/:id` — groups.controller.ts. Kassir yo'q. */
export const GROUP_PAGE_ROLES = [1, 2, 3, 4];

/** `GET /students/:id` — students.controller.ts. O'qituvchi yo'q. */
export const STUDENT_PROFILE_ROLES = [1, 2, 3, 5];

/** `PATCH /company/:id` — company.controller.ts. */
export const COMPANY_EDIT_ROLES = [1];

/**
 * `GET /reports/financial-overview` — reports.controller.ts. Faqat CEO va
 * filial direktori (ADR-0067): Administrator va kassir «Umumiy ma'lumotlar»da
 * faqat «To'lov qayd qilish» va oxirgi to'lovlarni ko'radi.
 */
export const FINANCIAL_OVERVIEW_ROLES = [1, 2];

/** `POST /call-logs` — call-logs.controller.ts («Natijani kiritish»). */
export const CALL_LOG_ROLES = [1, 2, 3];

/**
 * `POST /withdrawals` va `POST /refunds/quick` — «Muzlatilgan puli» tabining
 * ikki amali: markaz hisobiga o'tkazish va o'quvchiga qaytarish.
 */
export const FROZEN_BALANCE_ACTION_ROLES = [1, 2, 3];

export function hasAnyRole(
  roles: { id: number }[] | undefined,
  allowed: number[],
): boolean {
  return roles?.some((r) => allowed.includes(r.id)) ?? false;
}
