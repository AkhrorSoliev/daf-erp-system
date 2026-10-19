import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { addDaysToDateStr } from '../../attendance/shared/date-utils';
import { wochenStartTag } from '../uebung/punkte';
import { guruhlarniSarala, tengBol, xonaNatijasi } from './liga-qoidalari';
import { guruhlarYigindisi } from './guruhlar-jadvali';
import {
  LIGA_HISOB_KALIT,
  azolarniQosh,
  bolaklar,
  xonalarOch,
  type LigaTx,
} from './liga-xona';

export interface HisobNatijasi {
  haftaBoshi: string;
  /** `false` — boshqa jarayon shu kompaniyani hisoblayapti (faqat `kutish: false` da). */
  bajarildi: boolean;
  /** Shu chaqiruv hisoblagan xonalar (ikkinchi chaqiruvda 0). */
  xonalar: number;
  azolar: number;
  kotarildi: number;
  /** Keyingi hafta uchun ochilgan xonalar. */
  yangiXonalar: number;
  /** Guruhlar jadvalidagi guruhlar (bir marta yoziladi). */
  guruhlar: number;
}

type Azo = { id: number; roomId: number; studentId: number; points: number };

/** Har xona `xonaNatijasi` dan: a'zoga o'rin, ball, ko'tarilish; ko'tarilganlar yangi darajasi bilan. */
function hisobQatorlari(
  xonalar: { id: number; tier: number }[],
  azolar: Azo[],
) {
  const boyicha = new Map<number, Azo[]>();
  for (const a of azolar) {
    const l = boyicha.get(a.roomId);
    if (l) l.push(a);
    else boyicha.set(a.roomId, [a]);
  }
  const yangilash: {
    id: number;
    place: number;
    points: number;
    promoted: boolean;
  }[] = [];
  const kotarilganlar: { studentId: number; tier: number }[] = [];
  for (const x of xonalar) {
    const list = boyicha.get(x.id) ?? [];
    const kirishId = new Map(list.map((a) => [a.studentId, a.id]));
    for (const q of xonaNatijasi(list, x.tier)) {
      yangilash.push({
        id: kirishId.get(q.studentId)!,
        place: q.place,
        points: q.points,
        promoted: q.promoted,
      });
      if (q.promoted)
        kotarilganlar.push({ studentId: q.studentId, tier: x.tier + 1 });
    }
  }
  return { yangilash, kotarilganlar };
}

/**
 * Dushanba taqsimoti (spec S3 §1.3): o'tgan hafta ≥ 1 ball topganlar HOZIRGI
 * darajasi bo'yicha `ceil(n / 25)` teng xonaga. Hafta ichida (hisobdan oldin)
 * o'zi qo'shilgan o'quvchi o'z xonasida qoladi. Xona qulfi shart emas:
 * hisob kompaniya qulfini AJRATIB olgan, `joinRoom` uni UMUMIY (shared) kutadi,
 * demak bu yerda boshqa hech kim yangi xona ochmaydi.
 */
async function keyingiHaftaXonalari(
  tx: LigaTx,
  companyId: number,
  hafta: string,
  studentIds: number[],
): Promise<number> {
  if (studentIds.length === 0) return 0;
  const darajalar = await tx.$queryRaw<
    { studentId: number; tier: number }[]
  >(Prisma.sql`/* liga-darajalar */
    SELECT "studentId", tier FROM "DafStudentLeague" WHERE "studentId" = ANY(${studentIds}::int[])`);
  const borlar = await tx.$queryRaw<
    { studentId: number }[]
  >(Prisma.sql`/* liga-hafta-azolari */
    SELECT "studentId" FROM "DafLeagueEntry"
    WHERE "weekStart" = ${hafta}::date AND "studentId" = ANY(${studentIds}::int[])`);
  const tierOf = new Map(darajalar.map((d) => [d.studentId, d.tier]));
  const bor = new Set(borlar.map((b) => b.studentId));
  const boyicha = new Map<number, number[]>();
  for (const id of studentIds) {
    if (bor.has(id)) continue;
    const t = tierOf.get(id) ?? 0;
    const l = boyicha.get(t);
    if (l) l.push(id);
    else boyicha.set(t, [id]);
  }
  let yangi = 0;
  for (const [tier, ids] of boyicha) {
    const guruhlar = tengBol(ids, hafta);
    const ochildi = (
      await xonalarOch(tx, companyId, hafta, tier, guruhlar.length)
    ).sort((a, b) => a.number - b.number);
    await azolarniQosh(
      tx,
      companyId,
      hafta,
      tier,
      guruhlar.flatMap((g, i) =>
        g.map((studentId) => ({ roomId: ochildi[i].id, studentId })),
      ),
    );
    yangi += ochildi.length;
  }
  return yangi;
}

/** Guruhlar jadvalining hafta natijasi — `ON CONFLICT DO NOTHING`: birinchi yozuv qoladi. */
async function guruhHaftasiniYoz(
  tx: LigaTx,
  companyId: number,
  haftaBoshi: string,
): Promise<number> {
  const jadval = guruhlarniSarala(
    await guruhlarYigindisi(tx, companyId, haftaBoshi),
  );
  for (const b of bolaklar(jadval)) {
    await tx.$executeRaw(Prisma.sql`/* guruh-haftasi-yoz */
      INSERT INTO "DafGroupWeek" ("companyId", "weekStart", "groupId", "place", "average", "members", "points")
      VALUES ${Prisma.join(
        b.map(
          (g) =>
            Prisma.sql`(${companyId}::int, ${haftaBoshi}::date, ${g.groupId}::text, ${g.place}::int, ${g.baho}::float8, ${g.azolar}::int, ${g.ball}::int)`,
        ),
      )}
      ON CONFLICT ("weekStart", "groupId") DO NOTHING`);
  }
  return jadval.length;
}

/**
 * Bir kompaniyaning bir haftasi (spec S3 §1.4) — THE writer of tiers,
 * results and group weeks (`liga.single-source.spec.ts`, ADR-0116).
 *
 * Qulf tartibi (ADR-0116): kompaniya qulfi (`LIGA_HISOB_KALIT`) AJRATIB
 * olinadi — `joinRoom` uni UMUMIY oladi, keyin xona qulfini; hisob xona
 * qulfini hech olmaydi, shuning uchun sikl yo'q. Ikkalasi ham tranzaksiya
 * qulfi (`pg_advisory_xact_*`): commit/rollback o'zi bo'shatadi. Cron
 * kutadi; seans oxiri `pg_try_…` bilan sinaydi va band bo'lsa jim
 * `bajarildi: false` qaytaradi (chaqiruvchini yiqitmaydi).
 *
 * Takrorlanuvchi: xonalar `UPDATE … WHERE "settledAt" IS NULL RETURNING`
 * bilan olinadi — ikkinchi (yoki bir vaqtdagi) chaqiruv bo'sh ro'yxat oladi
 * va hech narsa yozmaydi. Hammasi bitta tranzaksiyada.
 */
export async function settleWeek(
  prisma: PrismaService,
  companyId: number,
  haftaBoshi: string,
  opts: { kutish: boolean },
): Promise<HisobNatijasi> {
  const keyingi = addDaysToDateStr(haftaBoshi, 7);
  return prisma.$transaction(
    async (tx) => {
      const natija: HisobNatijasi = {
        haftaBoshi,
        bajarildi: true,
        xonalar: 0,
        azolar: 0,
        kotarildi: 0,
        yangiXonalar: 0,
        guruhlar: 0,
      };
      if (opts.kutish) {
        await tx.$queryRaw(Prisma.sql`/* liga-qulf */
          SELECT 1 AS ok FROM pg_advisory_xact_lock(${LIGA_HISOB_KALIT}::int, ${companyId}::int)`);
      } else {
        const [q] = await tx.$queryRaw<
          { ok: boolean }[]
        >(Prisma.sql`/* liga-qulf-sinash */
          SELECT pg_try_advisory_xact_lock(${LIGA_HISOB_KALIT}::int, ${companyId}::int) AS ok`);
        if (!q?.ok) return { ...natija, bajarildi: false };
      }
      const xonalar = await tx.$queryRaw<
        { id: number; tier: number }[]
      >(Prisma.sql`/* liga-xonalarni-ol */
        UPDATE "DafLeagueRoom" SET "settledAt" = (now() AT TIME ZONE 'UTC')
        WHERE "companyId" = ${companyId} AND "weekStart" = ${haftaBoshi}::date
          AND "settledAt" IS NULL
        RETURNING id, tier`);
      natija.xonalar = xonalar.length;
      if (xonalar.length > 0) {
        const azolar = await tx.$queryRaw<
          Azo[]
        >(Prisma.sql`/* liga-azolar-ballari */
          SELECT e.id, e."roomId", e."studentId", COALESCE(SUM(d.points), 0)::int AS points
          FROM "DafLeagueEntry" e
          LEFT JOIN "DafStudentDay" d ON d."studentId" = e."studentId"
            AND d.day >= ${haftaBoshi}::date AND d.day < ${keyingi}::date
          WHERE e."roomId" = ANY(${xonalar.map((x) => x.id)}::int[])
          GROUP BY e.id, e."roomId", e."studentId"`);
        const { yangilash, kotarilganlar } = hisobQatorlari(xonalar, azolar);
        natija.azolar = yangilash.length;
        natija.kotarildi = kotarilganlar.length;
        for (const b of bolaklar(yangilash)) {
          await tx.$executeRaw(Prisma.sql`/* liga-natija-yoz */
            UPDATE "DafLeagueEntry" AS e
            SET place = v.place, points = v.points, promoted = v.promoted
            FROM (VALUES ${Prisma.join(
              b.map(
                (q) =>
                  Prisma.sql`(${q.id}::int, ${q.place}::int, ${q.points}::int, ${q.promoted}::boolean)`,
              ),
            )}) AS v(id, place, points, promoted)
            WHERE e.id = v.id`);
        }
        for (const b of bolaklar(kotarilganlar)) {
          await tx.$executeRaw(Prisma.sql`/* liga-kotar */
            INSERT INTO "DafStudentLeague" ("studentId", "companyId", "tier", "updatedAt")
            VALUES ${Prisma.join(
              b.map(
                (k) =>
                  Prisma.sql`(${k.studentId}::int, ${companyId}::int, ${k.tier}::int, (now() AT TIME ZONE 'UTC'))`,
              ),
            )}
            ON CONFLICT ("studentId") DO UPDATE
            SET tier = GREATEST("DafStudentLeague".tier, EXCLUDED.tier),
                "updatedAt" = EXCLUDED."updatedAt"`);
        }
        natija.yangiXonalar = await keyingiHaftaXonalari(
          tx,
          companyId,
          keyingi,
          azolar.filter((a) => a.points >= 1).map((a) => a.studentId),
        );
      }
      natija.guruhlar = await guruhHaftasiniYoz(tx, companyId, haftaBoshi);
      return natija;
    },
    { maxWait: 10_000, timeout: 120_000 },
  );
}

/**
 * Kechikkan hamma haftalar, eng eskisidan (spec S3 §1.4: cron o'tkazib
 * yuborgan bo'lsa birinchi seans oxiri o'zi tuzatadi). Har hafta keyingi
 * haftaning xonalarini ochadi, shuning uchun ro'yxat har qadamda qaytadan
 * o'qiladi. Oxirida o'tgan haftaning guruhlar jadvali (xonasiz bo'lsa ham).
 */
export async function settleDue(
  prisma: PrismaService,
  companyId: number,
  jetzt: Date,
  opts: { kutish: boolean },
): Promise<HisobNatijasi[]> {
  const joriy = wochenStartTag(jetzt);
  const otgan = addDaysToDateStr(joriy, -7);
  const natija: HisobNatijasi[] = [];
  // ponytail: 60 hafta — cheksiz aylanishdan himoya; undan uzoq to'xtalish bo'lmaydi.
  for (let i = 0; i < 60; i += 1) {
    const [eng] = await prisma.$queryRaw<
      { w: string | null }[]
    >(Prisma.sql`/* liga-eng-eski */
      SELECT to_char(MIN("weekStart"), 'YYYY-MM-DD') AS w FROM "DafLeagueRoom"
      WHERE "companyId" = ${companyId} AND "settledAt" IS NULL AND "weekStart" < ${joriy}::date`);
    if (!eng?.w) break;
    const n = await settleWeek(prisma, companyId, eng.w, opts);
    natija.push(n);
    if (!n.bajarildi) return natija;
  }
  if (!natija.some((n) => n.haftaBoshi === otgan)) {
    natija.push(await settleWeek(prisma, companyId, otgan, opts));
  }
  return natija;
}
