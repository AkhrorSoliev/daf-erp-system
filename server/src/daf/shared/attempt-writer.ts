import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { tashkentDateStr } from '../../common/date/tashkent';

/** What `dafAttempt.create` takes, minus `createdAt` — the writer sets it. */
export type AttemptData = Omit<
  Prisma.DafAttemptUncheckedCreateInput,
  'id' | 'createdAt'
>;

/**
 * The day row an attempt belongs to. The writer, the rebuild SQL and the
 * parity test all follow this one rule: the Tashkent day of `createdAt`,
 * and the sealed group ("" for none, never NULL — ADR-0114).
 */
export function kunlikKalit(
  createdAt: Date,
  groupId: string | null | undefined,
): { day: string; groupKey: string } {
  return { day: tashkentDateStr(createdAt), groupKey: groupId ?? '' };
}

/**
 * The ONE way a DafAttempt row is written (attempt-writer.single-source.spec).
 * The attempt and its day total commit together; the increment runs inside
 * Postgres, so two answers at the same moment never lose each other's sum.
 */
export async function recordAttempt(
  prisma: PrismaService,
  data: AttemptData,
): Promise<void> {
  const createdAt = new Date();
  const { day, groupKey } = kunlikKalit(createdAt, data.groupId);
  const points = data.points ?? 0;
  await prisma.$transaction([
    prisma.dafAttempt.create({ data: { ...data, createdAt } }),
    prisma.$executeRaw`
      INSERT INTO "DafStudentDay"
        ("studentId", "companyId", "day", "groupKey", "points", "attempts", "updatedAt")
      VALUES (${data.studentId}, ${data.companyId}, ${day}::date, ${groupKey}, ${points}, 1, now())
      ON CONFLICT ("studentId", "day", "groupKey") DO UPDATE SET
        "points" = "DafStudentDay"."points" + EXCLUDED."points",
        "attempts" = "DafStudentDay"."attempts" + 1,
        "updatedAt" = now()`,
  ]);
}
