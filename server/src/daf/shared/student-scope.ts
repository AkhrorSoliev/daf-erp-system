import { PrismaService } from '../../prisma/prisma.service';

/**
 * O'quvchining hozirgi guruhi — urinish yozuviga MUHRLANADI.
 *
 * Nega muhrlanadi: o'quvchi guruhini almashtirishi mumkin, va eski
 * guruhda topilgan ball o'sha guruhning haftalik jadvalida qolishi
 * kerak. Jonli bog'lanishdan o'qilsa, guruh o'zgargan kuni butun tarix
 * yangi guruhga ko'chib o'tardi.
 *
 * Bir nechta faol yozilish bo'lsa eng yangisi olinadi.
 */
export async function currentGroupId(
  prisma: PrismaService,
  studentId: number,
): Promise<string | null> {
  const enrollment = await prisma.enrollment.findFirst({
    where: { studentId, status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
    select: { groupId: true },
  });
  return enrollment?.groupId ?? null;
}
