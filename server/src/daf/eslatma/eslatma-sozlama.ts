import type { PrismaService } from '../../prisma/prisma.service';

/**
 * `DafStudentSetting.remindersEnabled` ning YAGONA yozuvchisi (spec S4 §3,
 * ADR-0117): `PATCH .../eslatmalar` ham, bot tugmasi ham shuni chaqiradi.
 * `upsert` (Prisma: `INSERT … ON CONFLICT DO UPDATE`, kalit `studentId`) —
 * tanlov qatori yo'q bo'lsa yaratadi (`dailyGoal` standarti `ORTA` bilan),
 * bor bo'lsa faqat `remindersEnabled` ni yozadi: `dailyGoal` ga tegmaydi.
 */
export async function eslatmalarniSaqla(
  prisma: Pick<PrismaService, 'dafStudentSetting'>,
  studentId: number,
  companyId: number,
  yoqilgan: boolean,
): Promise<{ eslatmalar: boolean }> {
  const s = await prisma.dafStudentSetting.upsert({
    where: { studentId },
    create: { studentId, companyId, remindersEnabled: yoqilgan },
    update: { remindersEnabled: yoqilgan },
    select: { remindersEnabled: true },
  });
  return { eslatmalar: s.remindersEnabled };
}
