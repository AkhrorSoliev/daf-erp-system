import { PrismaService } from '../../prisma/prisma.service';
import { TAYYOR_SOZ } from '../daf-portal-read.service';

/**
 * Bugun qiladigan mashq qolmaganmi (spec S2 1.1, `bosh`): muddati kelgan so'z
 * yo'q VA ochiq, tugatilmagan dars yo'q. Dars hali bor bo'lsa (yangi so'z ball
 * beradi) bosh emas — yangi o'quvchi mashq qilmasdan «bajarildi» ko'rmaydi.
 *
 * «Ochiq dars» — yo'l qulf zanjirining (`client/.../yol/yol-tuzilishi.ts`)
 * o'sha to'plami: tayyor unitning bo'lim darslari va yakuniy sinovi. Zanjir
 * chiziqli, shuning uchun «biri tugatilmagan» ⇔ «ochiq dars bor».
 * Dars so'rovi faqat so'z yo'q bo'lganda o'qiladi.
 */
export async function bugunBoshmi(
  prisma: PrismaService,
  studentId: number,
  faelligeWoerter?: number,
): Promise<boolean> {
  const due =
    faelligeWoerter ??
    (await prisma.dafLexemeState.count({
      where: { studentId, dueAt: { lte: new Date() } },
    }));
  if (due > 0) return false;
  const ochiq = await prisma.dafLesson.findFirst({
    where: {
      unit: { retiredAt: null, lexemes: { some: TAYYOR_SOZ } },
      OR: [{ sectionId: { not: null } }, { kind: 'UNIT_TEST' }],
      progress: { none: { studentId, completedAt: { not: null } } },
    },
    select: { id: true },
  });
  return ochiq === null;
}
