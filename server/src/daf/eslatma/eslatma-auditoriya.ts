import { Prisma } from '@prisma/client';
import {
  HAFTALIK_CHEGARA,
  kechkiSanalar,
  otganHafta,
} from './eslatma-qoidalari';

/**
 * S4 auditoriyasi — har tur BITTA SQL (spec S4 §1.1, §2, §6). Qoidalar
 * `eslatma-qoidalari.ts` dagi sof funksiyalarniki, bu yerda ularning tez
 * shakli; `scripts/load/daf-yuklama-s4-paritet.ts` natijani o'sha funksiyalar
 * bilan brute force solishtiradi. Hech narsa yozmaydi. Sana `'YYYY-MM-DD'`
 * matni + `::date` bilan beriladi.
 */
type Db = Pick<Prisma.TransactionClient, '$queryRaw'>;

export interface KechkiQator {
  studentId: number;
  ism: string;
  /**
   * Kechagi kungacha uzluksiz mashq kunlari (`attempts > 0`) — bugun qatori
   * yo'qligi sababli `serieAus(tage, bugun)` ning aynan o'zi.
   */
  seriya: number;
  /** `DafStudentSetting.dailyGoal` yoki `null` (= O'rta). */
  dailyGoal: string | null;
}

/**
 * Kechki eslatma auditoriyasi (spec S4 §1.1). Seriya kichik so'rovi faqat
 * shartlardan o'tgan qatorlar uchun ishlaydi (SELECT ro'yxati WHERE dan
 * keyin): kunlar teskari tartibda raqamlanadi, kechadan boshlab `kun =
 * kecha − (raqam − 1)` bo'lganlari — uzluksiz zanjir; birinchi teshikdan
 * keyin tenglik qaytib kelmaydi.
 */
export function kechkiAuditoriya(
  db: Db,
  companyId: number,
  bugun: string,
): Promise<KechkiQator[]> {
  const s = kechkiSanalar(bugun);
  return db.$queryRaw<KechkiQator[]>(Prisma.sql`/* eslatma-kechki */
    SELECT s.id AS "studentId", s."firstName" AS ism, st."dailyGoal"::text AS "dailyGoal",
      (SELECT COUNT(*)::int FROM (
         SELECT k.day, ROW_NUMBER() OVER (ORDER BY k.day DESC) AS rn
         FROM (SELECT DISTINCT d.day FROM "DafStudentDay" d
               WHERE d."studentId" = s.id AND d.attempts > 0 AND d.day < ${bugun}::date) k
       ) z
       WHERE z.day = ${s.kecha}::date - (z.rn::int - 1)) AS seriya
    FROM "Student" s
    LEFT JOIN "DafStudentSetting" st ON st."studentId" = s.id
    WHERE s."companyId" = ${companyId} AND s."deletedAt" IS NULL
      AND s."telegramChatId" IS NOT NULL AND s."telegramDisconnectedAt" IS NULL
      AND COALESCE(st."remindersEnabled", true)
      AND EXISTS (SELECT 1 FROM "DafStudentDay" d WHERE d."studentId" = s.id
                  AND d.day >= ${s.oynaBoshi}::date AND d.day < ${bugun}::date)
      AND NOT EXISTS (SELECT 1 FROM "DafStudentDay" d
                      WHERE d."studentId" = s.id AND d.day = ${bugun}::date)
      AND NOT EXISTS (SELECT 1 FROM "DafReminderLog" r WHERE r."studentId" = s.id AND (
            (r.kind = 'EVENING' AND r."sentOn" = ${bugun}::date)
         OR (r.kind = 'EVENING' AND r.status = 'SENT' AND r."sentOn" = ${s.kecha}::date)
         OR (r.kind = 'WEEKLY' AND r.status = 'SENT' AND r."sentOn" = ${bugun}::date)))
      AND (SELECT COUNT(*) FROM "DafReminderLog" r
           WHERE r."studentId" = s.id AND r.kind = 'EVENING' AND r.status = 'SENT'
             AND r."sentOn" >= ${s.chegaraBoshi}::date AND r."sentOn" < ${bugun}::date)
          < ${HAFTALIK_CHEGARA}
    ORDER BY s.id`);
}

export interface HaftalikQator {
  studentId: number;
  ism: string;
  /** O'tgan hafta `DafStudentDay.points` yig'indisi (hamma `groupKey`), ≥ 1. */
  ball: number;
  /** O'tgan hafta xonasi: daraja, o'rin (hisoblanmagan bo'lsa `null`), ko'tarildimi. */
  tier: number | null;
  orin: number | null;
  kotarildi: boolean;
  /** O'tgan hafta eng ko'p ball topgan guruhining `DafGroupWeek` o'rni, bo'lmasa `null`. */
  guruhOrin: number | null;
  /** Kompaniyaning o'tgan hafta `DafGroupWeek` qatorlari soni. */
  guruhJami: number;
  /** O'tgan hafta (Toshkent kuni) olingan nishon kalitlari, olingan tartibida. */
  nishonlar: string[];
}

/**
 * Dushanba xulosasi auditoriyasi va qatorlari (spec S4 §2). Guruh — o'tgan
 * hafta shu guruh uchun (`groupKey`) eng ko'p ball, teng bo'lsa `groupKey`
 * kichigi (`COLLATE "C"` — bazaning kollatsiyasiga bog'liq emas). Nishon
 * kuni — `earnedAt` ning Toshkent kuni.
 */
export function haftalikAuditoriya(
  db: Db,
  companyId: number,
  bugun: string,
): Promise<HaftalikQator[]> {
  const h = otganHafta(bugun);
  return db.$queryRaw<HaftalikQator[]>(Prisma.sql`/* eslatma-haftalik */
    WITH ball AS (
      SELECT d."studentId", SUM(d.points)::int AS p
      FROM "DafStudentDay" d
      WHERE d."companyId" = ${companyId} AND d.day >= ${h.otgan}::date AND d.day < ${bugun}::date
      GROUP BY d."studentId"
      HAVING SUM(d.points) >= 1
    ),
    nomzod AS (
      SELECT s.id, s."firstName", b.p
      FROM ball b
      JOIN "Student" s ON s.id = b."studentId"
      LEFT JOIN "DafStudentSetting" st ON st."studentId" = s.id
      WHERE s."deletedAt" IS NULL
        AND s."telegramChatId" IS NOT NULL AND s."telegramDisconnectedAt" IS NULL
        AND COALESCE(st."remindersEnabled", true)
        AND NOT EXISTS (SELECT 1 FROM "DafReminderLog" r WHERE r."studentId" = s.id
                        AND r.kind = 'WEEKLY' AND r."sentOn" = ${bugun}::date)
    ),
    guruh AS (
      SELECT DISTINCT ON (d."studentId") d."studentId", d."groupKey" AS g
      FROM "DafStudentDay" d
      JOIN nomzod n ON n.id = d."studentId"
      WHERE d.day >= ${h.otgan}::date AND d.day < ${bugun}::date AND d."groupKey" <> ''
      GROUP BY d."studentId", d."groupKey"
      ORDER BY d."studentId", SUM(d.points) DESC, d."groupKey" COLLATE "C"
    )
    SELECT n.id AS "studentId", n."firstName" AS ism, n.p AS ball,
      e.tier, e.place AS orin, COALESCE(e.promoted, false) AS kotarildi,
      gw.place AS "guruhOrin",
      (SELECT COUNT(*)::int FROM "DafGroupWeek" x
       WHERE x."companyId" = ${companyId} AND x."weekStart" = ${h.otgan}::date) AS "guruhJami",
      ARRAY(SELECT b.key FROM "DafStudentBadge" b
            WHERE b."studentId" = n.id
              AND (b."earnedAt" + interval '5 hours')::date >= ${h.otgan}::date
              AND (b."earnedAt" + interval '5 hours')::date < ${bugun}::date
            ORDER BY b."earnedAt", b.key COLLATE "C") AS nishonlar
    FROM nomzod n
    LEFT JOIN "DafLeagueEntry" e ON e."studentId" = n.id AND e."weekStart" = ${h.otgan}::date
    LEFT JOIN guruh g ON g."studentId" = n.id
    LEFT JOIN "DafGroupWeek" gw ON gw."groupId" = g.g AND gw."weekStart" = ${h.otgan}::date
    ORDER BY n.id`);
}

/**
 * Xulosa o'tgan hafta hisoblangandan keyin ketadi (spec S4 §2): kompaniyada
 * joriy haftadan oldingi hisoblanmagan xona qolmagan (S3 `kechikkan` bilan
 * bir xil savol; `@@index([companyId, settledAt])`).
 */
export async function haftaTayyormi(
  db: Db,
  companyId: number,
  bugun: string,
): Promise<boolean> {
  const [q] = await db.$queryRaw<
    { tayyor: boolean }[]
  >(Prisma.sql`/* eslatma-tayyor */
    SELECT NOT EXISTS (SELECT 1 FROM "DafLeagueRoom"
      WHERE "companyId" = ${companyId} AND "settledAt" IS NULL
        AND "weekStart" < ${bugun}::date) AS tayyor`);
  return q?.tayyor ?? false;
}
