import { PrismaService } from '../../prisma/prisma.service';

/**
 * Tizimga kira oladigan xodim rollari: CEO, Filial direktori, Administrator,
 * O'qituvchi, Kassir. O'quvchi (6) bu yerda YO'Q — o'quvchi hisobi xodim
 * hisobi bilan bitta telefonda yonma-yon yashaydi (ADR-0021).
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
): Promise<LiveStaffMatch | null> {
  return prisma.user.findFirst({
    where: {
      phone,
      deletedAt: null,
      roles: { some: { roleId: { in: [...STAFF_ROLE_IDS] } } },
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
  prisma: PrismaService,
  phone: string,
): Promise<string | null> {
  const taken = await prisma.user.findFirst({
    where: { login: phone, deletedAt: null },
    select: { id: true },
  });
  return taken ? null : phone;
}
