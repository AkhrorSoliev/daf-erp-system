import type { DafDailyGoal } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  tashkentDateStr,
  utcMidnightFromDateStr,
} from '../../common/date/tashkent';
import { TAYYOR_SOZ } from '../daf-portal-read.service';
import { maqsadHolati, type MaqsadHolati } from '../uebung/punkte';

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

/**
 * `PATCH .../maqsad`: tanlov darrov kuchga kiradi, tarix saqlanmaydi (spec
 * S2 1.1). `upsert` — Prisma uni `INSERT … ON CONFLICT DO UPDATE` qiladi
 * (kalit `studentId`), shuning uchun ikki parallel bosish ham xavfsiz.
 * Javob — yangi maqsad bugungi ball bilan, halqa darrov to'g'ri chiziladi.
 */
export async function maqsadniSaqla(
  prisma: PrismaService,
  studentId: number,
  companyId: number,
  daraja: DafDailyGoal,
): Promise<MaqsadHolati> {
  await prisma.dafStudentSetting.upsert({
    where: { studentId },
    create: { studentId, companyId, dailyGoal: daraja },
    update: { dailyGoal: daraja },
  });
  const [bugun, bosh] = await Promise.all([
    prisma.dafStudentDay.aggregate({
      where: {
        studentId,
        day: utcMidnightFromDateStr(tashkentDateStr(new Date())),
      },
      _sum: { points: true },
    }),
    bugunBoshmi(prisma, studentId),
  ]);
  return maqsadHolati(daraja, bugun._sum.points ?? 0, bosh);
}
