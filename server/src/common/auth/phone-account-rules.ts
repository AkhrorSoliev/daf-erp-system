import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeSharedPhone } from '../utils/phone.util';

/**
 * Tizimga kira oladigan xodim rollari: CEO, Filial direktori, Administrator,
 * O'qituvchi, Kassir. O'quvchi (6) bu yerda YO'Q — o'quvchi hisobi xodim
 * hisobi bilan bitta telefonda yonma-yon yashaydi (ADR-0022).
 */
export const STAFF_ROLE_IDS = [1, 2, 3, 4, 5] as const;

export interface LiveStaffMatch {
  id: number;
  firstName: string;
  lastName: string;
}

/**
 * Shu telefon bilan ISHLAB TURGAN xodim hisobi bormi.
 *
 * NEGA faqat xodim va faqat tirik: bir odam o'quvchi ham, xodim ham bo'la
 * oladi — bu ikkita alohida hisob, bitta telefon. O'quvchi hisobi xodim
 * ochilishiga to'sqinlik qilmaydi. O'chirilgan hisob ham qilmaydi — baza
 * o'chirilganning nomini bo'shatadi (`User_login_key` faqat tirik qatorlarga).
 * Lekin bitta portalda bitta telefonga IKKI xodim hisobi bo'lsa, SMS orqali
 * parol tiklash va Telegram bilan kirish qaysi biri ekanini bilmay qoladi —
 * shuning uchun ikkinchisi ochilmaydi, admin mavjud hisobga rol qo'shadi.
 */
export async function findLiveStaffByPhone(
  prisma: PrismaService,
  phone: string,
  excludeId?: number,
): Promise<LiveStaffMatch | null> {
  return prisma.user.findFirst({
    where: {
      phone,
      deletedAt: null,
      roles: { some: { roleId: { in: [...STAFF_ROLE_IDS] } } },
      // The account being edited must not count as its own duplicate.
      ...(excludeId !== undefined && { id: { not: excludeId } }),
    },
    select: { id: true, firstName: true, lastName: true },
  });
}

/**
 * Yangi hisobga yoziladigan kirish nomi: telefon, agar u bo'sh bo'lsa; aks
 * holda hech narsa.
 *
 * NEGA: `User.login` tirik qatorlar orasida unique (migratsiya
 * `20260327021835_add_soft_delete_fields`, qisman indeks — Prisma sxemasi
 * buni ifodalay olmaydi, shuning uchun sxemada ko'rinmaydi). Bir odamning
 * o'quvchi hisobida nom = telefon bo'lsa, xodim hisobiga ham shu nomni
 * yozish bazada rad etilardi. Kirish baribir telefon bo'yicha ishlaydi
 * (`AuthService.buildAccountLookup` `phone` ustunini ham qaraydi), nom —
 * eski qoldiq. Uydirma nom (`phone_2`) yozilmaydi: hech kim uni bilmaydi.
 */
export async function loginForPhone(
  // `Pick`, not `PrismaService`: restore and the ADR-0033 repair decide the
  // login inside a transaction, and a transaction client has the same `user`.
  prisma: Pick<PrismaService, 'user'>,
  phone: string,
): Promise<string | null> {
  const taken = await prisma.user.findFirst({
    where: { login: phone, deletedAt: null },
    select: { id: true },
  });
  return taken ? null : phone;
}

export const PHONE_HELD_BY_STAFF_MESSAGE =
  'Bu telefon raqam boshqa xodim hisobiga tegishli';

/** What to write when an existing account's phone changes. */
export interface PhoneChangeWrite {
  phone: string;
  /** Present only when the login has to move with the phone. */
  login?: string | null;
}

/**
 * The one way an existing account's phone changes (ADR-0031).
 *
 * A phone is a sign-in key, not contact data: Telegram sign-in finds the
 * account by it and asks for no password, and `AuthService.buildAccountLookup`
 * matches a number against `login` as well as `phone`. A login still holding
 * the old number therefore kept that number opening the account after the
 * phone moved on (production, 2026-09-24: one teacher; 115 students —
 * ADR-0032). So the login follows the phone, or becomes `null` when the new
 * number is already some live account's login (`loginForPhone`, ADR-0022).
 *
 * A staff account may not take a number another live staff account holds —
 * Telegram sign-in would refuse both and SMS reset could not tell them apart
 * (ADR-0022, until now enforced only on create). The message names nobody:
 * this also runs when a teacher changes their own phone.
 *
 * Callers own the permission question; this only decides the data.
 */
export async function planPhoneChange(
  prisma: PrismaService,
  account: { id: number; phone: string | null; login: string | null },
  nextPhone: string,
  opts: { staff: boolean },
): Promise<PhoneChangeWrite> {
  if (nextPhone === account.phone) return { phone: nextPhone };

  if (
    opts.staff &&
    (await findLiveStaffByPhone(prisma, nextPhone, account.id))
  ) {
    throw new BadRequestException(PHONE_HELD_BY_STAFF_MESSAGE);
  }

  if (loginHoldsPhone(account.login, account.phone)) {
    return { phone: nextPhone, login: await loginForPhone(prisma, nextPhone) };
  }
  return { phone: nextPhone };
}

/**
 * Does this login open the account for this phone number? `buildAccountLookup`
 * matches a number against `login` both as sent (`998…`) and normalised (nine
 * digits), so a digits-only login that normalises to the phone is the same key.
 * A username that merely contains the digits is not.
 */
function loginHoldsPhone(login: string | null, phone: string | null): boolean {
  if (login === null || phone === null) return false;
  return /^\d+$/.test(login) && normalizeSharedPhone(login) === phone;
}
