import type { Prisma } from '@prisma/client';
import { SIGN_IN_USER_STATUSES } from './blocked-user';
import { STAFF_ROLE_IDS } from './phone-account-rules';

const TEACHER_ROLE_ID = 4;

/**
 * Xodim hisobi va uning Telegram'i (ADR-0045).
 *
 * Bot xodimni `User.telegramChatId` orqali taniydi, Mini App esa shu
 * bog'lanish bilan xodimni parolsiz kiritadi. Ikkalasi va bog'lash oqimi bitta
 * shartdan o'qiydi: bot «xodim» deb ko'rsatgan odamni Mini App rad etmasin,
 * Mini App kiritmaydigan hisobga bot xodim menyusini bermasin.
 */

export function isStaffRoleId(roleId: number): boolean {
  return (STAFF_ROLE_IDS as readonly number[]).includes(roleId);
}

/**
 * Tizimga kira oladigan xodim hisobi: o'chirilmagan, bloklanmagan va berilgan
 * rollardan biri bor (faqat xodim rollari hisobga olinadi).
 *
 * Parol shart emas, lekin sessiya beradigan joy (Mini App kirishi) uni
 * Telegram OAuth kabi alohida tekshiradi: parolsiz hisob parol bilan ham
 * kira olmaydi. Bu yerda emas, chunki `where` ichidagi `password` kaliti
 * `password-write.single-source.spec.ts` qorovulining ishi.
 *
 * `roleIds` bo'sh bo'lsa (masalan o'quvchi portali) — hech kim mos kelmaydi.
 */
export function signInStaffWhere(
  roleIds: readonly number[] = STAFF_ROLE_IDS,
): Prisma.UserWhereInput {
  return {
    deletedAt: null,
    status: { in: [...SIGN_IN_USER_STATUSES] },
    roles: { some: { roleId: { in: roleIds.filter(isStaffRoleId) } } },
  };
}

/** Shu Telegram chatiga bog'langan, kira oladigan xodim hisoblari. */
export function staffLinkedToChatWhere(
  chatId: string,
  roleIds: readonly number[] = STAFF_ROLE_IDS,
): Prisma.UserWhereInput {
  return { ...signInStaffWhere(roleIds), telegramChatId: chatId };
}

/** Portal: xodim roli bo'lgan hisob qaysi portal orqali ishlaydi. */
export type StaffPortal = 'admin' | 'lehrer';

/**
 * Xodim kabineti qaysi portalda ochiladi.
 *
 * Admin portali (CEO, direktor, administrator, kassir) ustunroq: ustoz ham,
 * administrator ham bo'lgan hisob admin portalida ikkala rolning sahifalarini
 * ko'radi, ustoz portali esa uni faqat ustoz sifatida kiritadi. Bot ro'yxatdan
 * o'tgan xodimga yuboradigan manzil ham shu qoida bilan tanlanadi.
 */
export function staffPortalFor(roleIds: readonly number[]): StaffPortal | null {
  if (roleIds.some((id) => isStaffRoleId(id) && id !== TEACHER_ROLE_ID)) {
    return 'admin';
  }
  return roleIds.includes(TEACHER_ROLE_ID) ? 'lehrer' : null;
}
