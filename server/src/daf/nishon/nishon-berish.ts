import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  NISHON_KATALOGI,
  type NishonSharoiti,
  shartBajarilganlar,
} from './nishon-katalogi';

const logger = new Logger('NishonBerish');

/**
 * THE ONE writer of DafStudentBadge (`nishon-berish.single-source.spec.ts`,
 * ADR-0115). Every key whose condition holds is inserted with ON CONFLICT DO
 * NOTHING; RETURNING gives back only the rows THIS call wrote, so two
 * sessions finishing at once never both call one badge "new". A badge is
 * never deleted or revoked: a broken streak keeps it.
 *
 * `earnedAt` — the one-time backfill passes the historical day per key;
 * live granting leaves it empty (now). The instant is bound as an ISO
 * string read in UTC, because the column is a timestamp without time zone.
 */
export async function grantBadges(
  prisma: PrismaService,
  studentId: number,
  companyId: number,
  sharoit: NishonSharoiti,
  earnedAt: Partial<Record<string, Date>> = {},
): Promise<string[]> {
  const keys = shartBajarilganlar(sharoit);
  if (keys.length === 0) return [];
  const hozir = new Date();
  const qatorlar = keys.map(
    (key) =>
      Prisma.sql`(${studentId}, ${companyId}, ${key}, ${(earnedAt[key] ?? hozir).toISOString()}::timestamptz AT TIME ZONE 'UTC')`,
  );
  const yozildi = await prisma.$queryRaw<{ key: string }[]>(
    Prisma.sql`/* nishon-berish */
      INSERT INTO "DafStudentBadge" ("studentId", "companyId", "key", "earnedAt")
      VALUES ${Prisma.join(qatorlar)}
      ON CONFLICT ("studentId", "key") DO NOTHING
      RETURNING "key"`,
  );
  const yangi = new Set(yozildi.map((r) => r.key));
  return NISHON_KATALOGI.map((n) => n.key).filter((k) => yangi.has(k));
}

/** O'rganilgan so'z: kamida bir marta to'g'ri javob berilgan (`correctCount` hech qachon kamaymaydi). */
export function woerterSoni(
  prisma: PrismaService,
  studentId: number,
): Promise<number> {
  return prisma.dafLexemeState.count({
    where: { studentId, correctCount: { gte: 1 } },
  });
}

/**
 * Seans oxirida beriladi (`seansNatijasi`). Bu bezak: seans allaqachon
 * saqlangan, shuning uchun xato natijani yiqitmaydi — o'tkazib yuborilgan
 * nishon keyingi seansda SHART bo'yicha qaytadan beriladi.
 */
export async function nishonlarniBerXavfsiz(
  prisma: PrismaService,
  studentId: number,
  companyId: number,
  serie: number,
): Promise<string[]> {
  try {
    const woerter = await woerterSoni(prisma, studentId);
    return await grantBadges(prisma, studentId, companyId, { serie, woerter });
  } catch (err) {
    logger.warn(
      `Nishon berilmadi (studentId=${studentId}): ${(err as Error).message}`,
    );
    return [];
  }
}
