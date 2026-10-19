import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { addDaysToDateStr } from '../../attendance/shared/date-utils';
import { wochenStartTag } from '../uebung/punkte';
import { reytingIsmi } from '../shared/reyting-ismi';
import type { ReytingZeile } from '../fortschritt/fortschritt.service';
import {
  GOLIB_MIN_AZO,
  GOLIB_MIN_BALL,
  darajaNomi,
  engKamXona,
  kotarilishZonasi,
  saralaXona,
} from './liga-qoidalari';

/**
 * Advisory qulf kalitlari (ADR-0116). Hisob (`settleWeek`) kompaniya kalitini
 * AJRATIB oladi, `joinRoom` uni UMUMIY (shared) oladi: hisob paytida hech kim
 * xonaga qo'shilmaydi va hisob ko'targan o'quvchi yangi darajasidan tushadi.
 * Xona kaliti bir (kompaniya, hafta, daraja) ning xonalarini navbat bilan
 * tanlatadi.
 */
export const LIGA_HISOB_KALIT = 1279870785;
export const LIGA_XONA_KALIT = 1279870786;
/** `joinRoom` qulf kutishi; tranzaksiya `maxWait` (5 s) dan past. */
export const LOCK_TIMEOUT = '2s';

export type LigaTx = Pick<
  Prisma.TransactionClient,
  '$queryRaw' | '$executeRaw'
>;
type Db = Pick<Prisma.TransactionClient, '$queryRaw'>;

/** Bitta SQL'ga 1 000 qatordan (bog'langan qiymatlar chegarasidan ancha past). */
export function bolaklar<T>(xs: T[], n = 1000): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

export interface LigaSharoiti {
  tier: number;
  /** Shu hafta xonada. */
  azo: boolean;
  /** Kompaniyada joriy haftadan oldingi hisoblanmagan xona bor (cron o'tkazib yuborgan). */
  kechikkan: boolean;
  /** Kamida bitta xonada 1-o'rin, ≥ 50 ball, xonada ≥ 5 a'zo. */
  xonaGolib: boolean;
  /** Guruhlar jadvalida 1-o'rin olgan haftada shu guruh uchun ≥ 1 ball. */
  guruhBirinchi: boolean;
}

/**
 * Seans oxirining liga holati — BITTA so'rov (spec S3 §3, §1.5). Bog'langan
 * qiymatlar tartibi `[studentId, hafta, studentId, companyId, hafta,
 * studentId, GOLIB_MIN_BALL, GOLIB_MIN_AZO, studentId]` — soxta baza
 * (`liga-baza.fake-spec.ts`) shunga tayanadi.
 */
export async function ligaSharoiti(
  db: Db,
  studentId: number,
  companyId: number,
  jetzt: Date,
): Promise<LigaSharoiti> {
  const hafta = wochenStartTag(jetzt);
  const [satr] = await db.$queryRaw<
    LigaSharoiti[]
  >(Prisma.sql`/* liga-sharoiti */
    SELECT
      COALESCE((SELECT tier FROM "DafStudentLeague" WHERE "studentId" = ${studentId}), 0)::int AS tier,
      EXISTS (SELECT 1 FROM "DafLeagueEntry"
              WHERE "weekStart" = ${hafta}::date AND "studentId" = ${studentId}) AS azo,
      EXISTS (SELECT 1 FROM "DafLeagueRoom"
              WHERE "companyId" = ${companyId} AND "settledAt" IS NULL
                AND "weekStart" < ${hafta}::date) AS kechikkan,
      EXISTS (SELECT 1 FROM "DafLeagueEntry" e
              WHERE e."studentId" = ${studentId} AND e.place = 1
                AND e.points >= ${GOLIB_MIN_BALL}
                AND (SELECT COUNT(*) FROM "DafLeagueEntry" x WHERE x."roomId" = e."roomId") >= ${GOLIB_MIN_AZO}
             ) AS "xonaGolib",
      EXISTS (SELECT 1 FROM "DafStudentDay" d
              JOIN "DafGroupWeek" g ON g."groupId" = d."groupKey"
               AND g."weekStart" = d.day - (EXTRACT(ISODOW FROM d.day)::int - 1)
              WHERE d."studentId" = ${studentId} AND d.points > 0 AND g.place = 1
             ) AS "guruhBirinchi"`);
  return satr;
}

/** Yangi xonalar: raqamlar shu (kompaniya, hafta, daraja) ning eng kattasidan keyin. */
export function xonalarOch(
  tx: LigaTx,
  companyId: number,
  hafta: string,
  tier: number,
  soni: number,
): Promise<{ id: number; number: number }[]> {
  return tx.$queryRaw<
    { id: number; number: number }[]
  >(Prisma.sql`/* liga-xona-och */
    INSERT INTO "DafLeagueRoom" ("companyId", "weekStart", "tier", "number")
    SELECT ${companyId}::int, ${hafta}::date, ${tier}::int, m.eng + g
    FROM (SELECT COALESCE(MAX(number), 0)::int AS eng FROM "DafLeagueRoom"
          WHERE "companyId" = ${companyId} AND "weekStart" = ${hafta}::date
            AND tier = ${tier}) AS m,
         generate_series(1, ${soni}::int) AS g
    RETURNING id, number`);
}

/** A'zolik qatorlari; hafta ichida bitta xona (`@@unique([weekStart, studentId])`) — takror jim o'tkaziladi. */
export async function azolarniQosh(
  tx: LigaTx,
  companyId: number,
  hafta: string,
  tier: number,
  qatorlar: { roomId: number; studentId: number }[],
): Promise<number> {
  let n = 0;
  for (const b of bolaklar(qatorlar)) {
    n += await tx.$executeRaw(Prisma.sql`/* liga-azo-qosh */
      INSERT INTO "DafLeagueEntry" ("roomId", "studentId", "companyId", "weekStart", "tier")
      VALUES ${Prisma.join(
        b.map(
          (q) =>
            Prisma.sql`(${q.roomId}::int, ${q.studentId}::int, ${companyId}::int, ${hafta}::date, ${tier}::int)`,
        ),
      )}
      ON CONFLICT ("weekStart", "studentId") DO NOTHING`);
  }
  return n;
}

/**
 * Hafta ichida qo'shilish (spec S3 §1.3, §1.5) — faqat seans oxirida. O'z
 * darajasining a'zosi eng kam xonasi; hammasi 30 bo'lsa yangi xona. Qulf
 * tartibi doim bir xil (hisob → daraja), shuning uchun hisob bilan o'zaro
 * qulflanish bo'lmaydi; a'zolik qulfdan KEYIN tekshiriladi.
 *
 * Qulf kutishi `LOCK_TIMEOUT` bilan cheklangan (tranzaksiya ichida, `SET LOCAL`
 * — birinchi so'rov): umumiy kompaniya qulfi, daraja qulfi va a'zolik
 * `ON CONFLICT` kutishini qamraydi. Uzoq hisob paytida kutayotgan qo'shilish
 * pool ulanishini 20 s emas, 2 s ushlaydi; vaqt tugasa tranzaksiya qaytariladi
 * (yarim holat yo'q) va xato otiladi — seans oxiri uni ushlaydi
 * (`liganiYangilaXavfsiz`), o'quvchi keyingi seans oxirida qo'shiladi. Hisob
 * (`settleWeek`) bunga tegmaydi: `SET LOCAL` faqat shu tranzaksiyada.
 */
export async function joinRoom(
  prisma: PrismaService,
  studentId: number,
  companyId: number,
  jetzt: Date,
): Promise<{ roomId: number; yangi: boolean }> {
  const hafta = wochenStartTag(jetzt);
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`/* liga-qulf-muddati */ SELECT set_config('lock_timeout', ${LOCK_TIMEOUT}, true)`,
      );
      await tx.$queryRaw(Prisma.sql`/* liga-qulf-umumiy */
        SELECT 1 AS ok FROM pg_advisory_xact_lock_shared(${LIGA_HISOB_KALIT}::int, ${companyId}::int)`);
      const [daraja] = await tx.$queryRaw<
        { tier: number }[]
      >(Prisma.sql`/* liga-daraja */
        SELECT tier FROM "DafStudentLeague" WHERE "studentId" = ${studentId}`);
      const tier = daraja?.tier ?? 0;
      await tx.$queryRaw(Prisma.sql`/* liga-xona-qulf */
        SELECT 1 AS ok FROM pg_advisory_xact_lock(${LIGA_XONA_KALIT}::int, hashtext(${`${companyId}:${hafta}:${tier}`}::text))`);
      const [bor] = await tx.$queryRaw<
        { roomId: number }[]
      >(Prisma.sql`/* liga-kirish */
        SELECT "roomId" FROM "DafLeagueEntry"
        WHERE "weekStart" = ${hafta}::date AND "studentId" = ${studentId}`);
      if (bor) return { roomId: bor.roomId, yangi: false };
      const xonalar = await tx.$queryRaw<
        { id: number; number: number; hajm: number }[]
      >(Prisma.sql`/* liga-xonalar-hajmi */
        SELECT r.id, r.number, COUNT(e.id)::int AS hajm
        FROM "DafLeagueRoom" r
        LEFT JOIN "DafLeagueEntry" e ON e."roomId" = r.id
        WHERE r."companyId" = ${companyId} AND r."weekStart" = ${hafta}::date
          AND r.tier = ${tier}
        GROUP BY r.id, r.number`);
      const roomId =
        engKamXona(xonalar) ??
        (await xonalarOch(tx, companyId, hafta, tier, 1))[0].id;
      await azolarniQosh(tx, companyId, hafta, tier, [{ roomId, studentId }]);
      return { roomId, yangi: true };
    },
    { maxWait: 5_000, timeout: 10_000 },
  );
}

export interface LigaDarajasi {
  tier: number;
  nomi: string;
}

/** `GET .../liga` javobi (spec S3 §4). */
export interface LigaJavobi {
  haftaBoshi: string;
  haftaOxiri: string;
  azo: boolean;
  daraja: LigaDarajasi;
  xona: {
    raqam: number;
    hajmi: number;
    qatorlar: ReytingZeile[];
    kotarilishZonasi: { soni: number; faol: boolean };
  } | null;
  otganHafta: {
    daraja: LigaDarajasi;
    orin: number;
    kotarildi: boolean;
    hajmi: number;
  } | null;
}

interface HolatSatri {
  tier: number;
  hafta: string | null;
  roomId: number | null;
  number: number | null;
  xonaDarajasi: number | null;
  place: number | null;
  promoted: boolean | null;
  hajm: number;
}

const daraja = (tier: number): LigaDarajasi => ({
  tier,
  nomi: darajaNomi(tier),
});

/**
 * O'quvchining xonasi va darajasi — hech narsa YOZMAYDI (xonada bo'lmagan
 * o'quvchi «birinchi seansdan keyin» ko'radi). Ikki so'rov: holat (daraja,
 * joriy va o'tgan hafta a'zoligi, xona hajmi) va xona qatorlari.
 */
export async function ligaJavobi(
  db: Db,
  studentId: number,
  jetzt: Date,
): Promise<LigaJavobi> {
  const hafta = wochenStartTag(jetzt);
  const otgan = addDaysToDateStr(hafta, -7);
  const satrlar = await db.$queryRaw<HolatSatri[]>(Prisma.sql`/* liga-holat */
    SELECT COALESCE((SELECT tier FROM "DafStudentLeague" WHERE "studentId" = ${studentId}), 0)::int AS tier,
           to_char(e."weekStart", 'YYYY-MM-DD') AS hafta,
           e."roomId", r.number, e.tier AS "xonaDarajasi", e.place, e.promoted,
           (SELECT COUNT(*)::int FROM "DafLeagueEntry" x WHERE x."roomId" = e."roomId") AS hajm
    FROM (SELECT 1) AS bir
    LEFT JOIN "DafLeagueEntry" e
      ON e."studentId" = ${studentId} AND e."weekStart" IN (${hafta}::date, ${otgan}::date)
    LEFT JOIN "DafLeagueRoom" r ON r.id = e."roomId"`);
  const tier = satrlar[0]?.tier ?? 0;
  const joriy = satrlar.find((s) => s.hafta === hafta);
  const oldingi = satrlar.find((s) => s.hafta === otgan && s.place !== null);
  const qatorlar = joriy
    ? await xonaQatorlari(db, joriy.roomId!, hafta, studentId)
    : null;
  return {
    haftaBoshi: hafta,
    haftaOxiri: addDaysToDateStr(hafta, 6),
    azo: !!joriy,
    daraja: daraja(tier),
    xona:
      joriy && qatorlar
        ? {
            raqam: joriy.number!,
            hajmi: qatorlar.length,
            qatorlar,
            kotarilishZonasi: kotarilishZonasi(
              qatorlar.length,
              joriy.xonaDarajasi!,
            ),
          }
        : null,
    otganHafta: oldingi
      ? {
          daraja: daraja(oldingi.xonaDarajasi!),
          orin: oldingi.place!,
          kotarildi: oldingi.promoted === true,
          hajmi: oldingi.hajm,
        }
      : null,
  };
}

/** Xona jadvali: a'zolar shu hafta (hamma `groupKey`) topgan ball bilan; 30 kishi — arzon. */
async function xonaQatorlari(
  db: Db,
  roomId: number,
  hafta: string,
  studentId: number,
): Promise<ReytingZeile[]> {
  const keyingi = addDaysToDateStr(hafta, 7);
  const azolar = await db.$queryRaw<
    { studentId: number; firstName: string; lastName: string; points: number }[]
  >(Prisma.sql`/* liga-xona */
    SELECT e."studentId", s."firstName", s."lastName", COALESCE(SUM(d.points), 0)::int AS points
    FROM "DafLeagueEntry" e
    JOIN "Student" s ON s.id = e."studentId"
    LEFT JOIN "DafStudentDay" d ON d."studentId" = e."studentId"
      AND d.day >= ${hafta}::date AND d.day < ${keyingi}::date
    WHERE e."roomId" = ${roomId}
    GROUP BY e."studentId", s."firstName", s."lastName"`);
  return saralaXona(azolar).map((a, i) => ({
    studentId: a.studentId,
    name: reytingIsmi(a),
    punkte: a.points,
    platz: i + 1,
    selbst: a.studentId === studentId,
  }));
}
