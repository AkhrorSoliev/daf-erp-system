import { Prisma } from '@prisma/client';
import { addDaysToDateStr } from '../../attendance/shared/date-utils';
import { wochenStartTag } from '../uebung/punkte';
import { currentGroupId } from '../shared/student-scope';
import {
  GURUH_MIN_AZO,
  GURUH_TOP,
  bahoKorinishi,
  guruhlarniSarala,
  type GuruhNatija,
  type GuruhYigindisi,
} from './liga-qoidalari';

export interface GuruhQatori {
  groupId: string;
  name: string;
  /** A'zolarning o'rtacha haftalik bali, 1 o'nlik xona. */
  baho: number;
  azolar: number;
  platz: number;
  selbst: boolean;
}

/** `GET .../guruhlar` javobi (spec S3 §4). */
export interface GuruhlarJavobi {
  haftaBoshi: string;
  qatorlar: GuruhQatori[];
  oz: { orin: number; baho: number; azolar: number; nomi: string } | null;
  minAzolar: number;
}

/**
 * Markazning faol guruhlari: hozirgi faol a'zolar soni va ular shu hafta SHU
 * guruh uchun (`groupKey = groupId`, ball topilgan paytdagi guruh) topgan
 * ball — mavjud guruh jadvali (`gruppeHaftaligi`) bilan bir xil qoida. Hafta
 * qatorlari AVVAL (o'quvchi, guruh) bo'yicha yig'iladi, keyin a'zolarga
 * qo'shiladi: to'liq haftada (≈47 ming qator) qo'shib-keyin-yig'ish 67 ms,
 * bunisi 31 ms (S3 yuklama sinovi, 50 parallel: p95 338 → 163 ms).
 * FILIALGA CHEKLANMAYDI (06.09 §6.1). Bog'langan qiymatlar
 * `[companyId, companyId, haftaBoshi, keyingi]` — soxta baza shunga tayanadi.
 */
export function guruhlarYigindisi(
  db: Pick<Prisma.TransactionClient, '$queryRaw'>,
  companyId: number,
  haftaBoshi: string,
): Promise<GuruhYigindisi[]> {
  const keyingi = addDaysToDateStr(haftaBoshi, 7);
  return db.$queryRaw<GuruhYigindisi[]>(Prisma.sql`/* guruhlar-yigindisi */
    WITH azo AS (
      SELECT DISTINCT e."groupId", e."studentId"
      FROM "Enrollment" e
      JOIN "Group" g ON g.id = e."groupId"
      WHERE g."companyId" = ${companyId} AND g."statusEnum" = 'ACTIVE'
        AND g."deletedAt" IS NULL AND e.status = 'ACTIVE'
    ),
    ball AS (
      SELECT a."groupId", SUM(d.p)::int AS p
      FROM azo a
      JOIN (
        SELECT x."studentId", x."groupKey", SUM(x.points) AS p
        FROM "DafStudentDay" x
        WHERE x."companyId" = ${companyId}
          AND x.day >= ${haftaBoshi}::date AND x.day < ${keyingi}::date
        GROUP BY x."studentId", x."groupKey"
      ) d ON d."studentId" = a."studentId" AND d."groupKey" = a."groupId"
      GROUP BY a."groupId"
    )
    SELECT a."groupId", g.name, COUNT(*)::int AS azolar,
           COALESCE(MAX(b.p), 0)::int AS ball
    FROM azo a
    JOIN "Group" g ON g.id = a."groupId"
    LEFT JOIN ball b ON b."groupId" = a."groupId"
    GROUP BY a."groupId", g.name`);
}

/**
 * Jonli jadval — hech narsa YOZMAYDI. TOP 10 + o'z guruhi haqiqiy o'rni
 * bilan (markaz jadvalining TOP 50 + o'z qatori qoidasi kabi). Guruhsiz yoki
 * 3 kishidan kam guruhdagi o'quvchida `oz: null`.
 */
export async function guruhlarJavobi(
  db: Pick<Prisma.TransactionClient, '$queryRaw' | 'enrollment'>,
  studentId: number,
  companyId: number,
  jetzt: Date,
): Promise<GuruhlarJavobi> {
  const haftaBoshi = wochenStartTag(jetzt);
  const [rows, ozId] = await Promise.all([
    guruhlarYigindisi(db, companyId, haftaBoshi),
    currentGroupId(db, studentId),
  ]);
  const jadval = guruhlarniSarala(rows);
  const oz = ozId ? (jadval.find((g) => g.groupId === ozId) ?? null) : null;
  const qator = (g: GuruhNatija): GuruhQatori => ({
    groupId: g.groupId,
    name: g.name,
    baho: bahoKorinishi(g.baho),
    azolar: g.azolar,
    platz: g.place,
    selbst: g.groupId === ozId,
  });
  const top = jadval.slice(0, GURUH_TOP);
  return {
    haftaBoshi,
    qatorlar: (oz && oz.place > GURUH_TOP ? [...top, oz] : top).map(qator),
    oz: oz
      ? {
          orin: oz.place,
          baho: bahoKorinishi(oz.baho),
          azolar: oz.azolar,
          nomi: oz.name,
        }
      : null,
    minAzolar: GURUH_MIN_AZO,
  };
}
