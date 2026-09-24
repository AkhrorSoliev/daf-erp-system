import { PrismaService } from '../prisma/prisma.service';

/**
 * Imtihon ishtirokchilarining o'rnini `totalScore` bo'yicha qayta yozadi —
 * standart musobaqa tartibi (1, 2, 2, 4: tenglar bir o'rinda, keyingisi
 * guruh hajmicha sakraydi). Baholanmaganlarning o'rni tozalanadi.
 *
 * Bitta joyda, chunki uni ham baho saqlash, ham e'lon qilish chaqiradi: ilgari
 * o'rin faqat "O'rinlarni qayta hisoblash" tugmasi bilan yozilardi va tugma
 * bosilmasa, e'lon qilingan PDF'da o'rin "—" yoki eski qiymat chiqardi.
 *
 * Qaytaradi: o'rin berilgan (baholangan) ishtirokchilar soni.
 */
export async function applyCompetitionRanks(
  prisma: PrismaService,
  examId: string,
): Promise<number> {
  const graded = await prisma.mockExamParticipant.findMany({
    where: { examId, deletedAt: null, totalScore: { not: null } },
    select: { id: true, totalScore: true },
    orderBy: { totalScore: 'desc' },
  });

  const updates: Array<{ id: string; rank: number }> = [];
  let currentRank = 0;
  let lastScore: number | null = null;
  let seen = 0;
  for (const p of graded) {
    seen++;
    if (p.totalScore !== lastScore) {
      currentRank = seen;
      lastScore = p.totalScore;
    }
    updates.push({ id: p.id, rank: currentRank });
  }

  if (updates.length > 0) {
    await prisma.$transaction(
      updates.map((u) =>
        prisma.mockExamParticipant.update({
          where: { id: u.id },
          data: { rank: u.rank },
        }),
      ),
    );
  }
  // Baholanmaganlar (yoki o'chirilgan baholar) eski o'rinni ko'tarib yurmasin.
  await prisma.mockExamParticipant.updateMany({
    where: { examId, deletedAt: null, totalScore: null, rank: { not: null } },
    data: { rank: null },
  });

  return updates.length;
}
