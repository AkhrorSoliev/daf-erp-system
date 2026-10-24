import { Prisma } from '@prisma/client';
import { addDaysToDateStr } from '../../attendance/shared/date-utils';
import { KUN_OYNASI } from './musobaqa-ustoz-qoidalari';
import type { AzoBalli, AzoKunlari } from './musobaqa-ustoz.types';

type Db = Pick<Prisma.TransactionClient, '$queryRaw'>;

/**
 * Tanlangan hafta ballari, har a'zo uchun (spec S5 §3, §5 so'rov 2). Guruh bali
 * S3 guruhlar jadvali bilan BIR XIL qoida (`groupKey = groupId`), jami ball —
 * barcha guruhlar. Qatori yo'q o'quvchi javobda yo'q (qoidalar nol qo'yadi).
 * `studentIds` bo'sh bo'lmasligi chaqiruvchining ishi. Bog'langan qiymatlar
 * tartibi `[groupId, companyId, ...studentIds, haftaBoshi, keyingi]`.
 */
export function azolarBallari(
  db: Db,
  companyId: number,
  groupId: string,
  studentIds: number[],
  haftaBoshi: string,
): Promise<AzoBalli[]> {
  const keyingi = addDaysToDateStr(haftaBoshi, 7);
  return db.$queryRaw<AzoBalli[]>(Prisma.sql`/* musobaqa-ustoz-ballar */
    SELECT x."studentId",
           COALESCE(SUM(x.points) FILTER (WHERE x."groupKey" = ${groupId}), 0)::int AS "guruhBali",
           COALESCE(SUM(x.points), 0)::int AS "jamiBall",
           (COUNT(DISTINCT x.day) FILTER (WHERE x.attempts > 0))::int AS "faolKunlar"
    FROM "DafStudentDay" x
    WHERE x."companyId" = ${companyId}
      AND x."studentId" IN (${Prisma.join(studentIds)})
      AND x.day >= ${haftaBoshi}::date AND x.day < ${keyingi}::date
    GROUP BY x."studentId"`);
}

/**
 * Seriya va «oxirgi mashq» uchun kunlar (oxirgi `KUN_OYNASI` kun) va bugungi
 * ball. `attempts > 0` kunlar `fortschritt`dagi `tage` bilan bir xil manba.
 * Bog'langan qiymatlar tartibi `[bugun, companyId, ...studentIds, boshi, bugun]`.
 */
export function azolarKunlari(
  db: Db,
  companyId: number,
  studentIds: number[],
  bugun: string,
): Promise<AzoKunlari[]> {
  const boshi = addDaysToDateStr(bugun, -KUN_OYNASI);
  return db.$queryRaw<AzoKunlari[]>(Prisma.sql`/* musobaqa-ustoz-kunlar */
    SELECT x."studentId",
           COALESCE(
             ARRAY_AGG(DISTINCT to_char(x.day, 'YYYY-MM-DD')) FILTER (WHERE x.attempts > 0),
             ARRAY[]::text[]
           ) AS tage,
           COALESCE(SUM(x.points) FILTER (WHERE x.day = ${bugun}::date), 0)::int AS "bugunBali"
    FROM "DafStudentDay" x
    WHERE x."companyId" = ${companyId}
      AND x."studentId" IN (${Prisma.join(studentIds)})
      AND x.day >= ${boshi}::date AND x.day <= ${bugun}::date
    GROUP BY x."studentId"`);
}
