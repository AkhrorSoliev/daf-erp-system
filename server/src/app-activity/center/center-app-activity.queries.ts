import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TASHKENT_OFFSET_MS } from '../../common/date/tashkent';
import { PrismaService } from '../../prisma/prisma.service';
import { SOAT_ZAXIRASI_S } from '../heartbeat-merge';
import { KIRDI_CHEGARASI_S } from '../stats/kunlik-faollik';
import { KunlikSavol, KunlikSeans } from './markaz-surati';

/**
 * Markaz bo'yicha xom SQL yig'indilar (dizayn 9.3). FAQAT mexanik yig'indi —
 * norma, holat va tartib bu yerda yo'q (`norma.ts`, `markaz-royxat.ts`).
 *
 * Chaqiruvchi `ids` ni `activeStudentWhere()` + filial qamrovi bilan oldindan
 * filtrlaydi (Prisma orqali, ADR-0015); har so'rov qo'shimcha `companyId`
 * shartini oladi. `ids` bo'sh bo'lsa chaqirilmaydi — `Prisma.join([])` xato
 * beradi; servis buni oldin tekshiradi.
 *
 * Toshkent kuni: `StudentAppSession.day` allaqachon Toshkent kuni (DATE).
 * `DafSession.startedAt` va `DafLessonProgress.completedAt` — `timestamp(3)`,
 * vaqt mintaqasisiz UTC; unga +5 soat qo'shib `::date` olish deterministik
 * (ADR-0016, `tashkent.ts`: UTC+5, DST yo'q).
 */
@Injectable()
export class CenterAppActivityQueries {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * (o'quvchi, kun) bo'yicha seans yig'indisi — `kunlikYigindi()` ni aynan
   * takrorlaydi: kunlik faol vaqt shu kun seanslarining
   * `[firstSeenAt, lastSeenAt + 120 s]` oraliqlari birlashmasidan oshmaydi,
   * LERNEN shu nisbatda qisqaradi, radio ham birlashmadan oshmaydi, kirdi =
   * kamida bitta seansda >= 10 s. `range_agg` — PostgreSQL 14+
   * (`scripts/check-pg-version.ts`).
   */
  async kunlikSeanslar(
    companyId: number,
    ids: number[],
    davrBoshi: string,
    bugun: string,
  ): Promise<KunlikSeans[]> {
    return this.prisma.$queryRaw<KunlikSeans[]>`
      WITH s AS (
        SELECT "studentId", "day", "activeSeconds", "radioSeconds",
          COALESCE(FLOOR((sections->>'LERNEN')::numeric), 0)::int AS lernen,
          tsrange("firstSeenAt", "lastSeenAt" + ${SOAT_ZAXIRASI_S} * interval '1 second') AS r
        FROM "StudentAppSession"
        WHERE "companyId" = ${companyId}
          AND "studentId" IN (${Prisma.join(ids)})
          AND "day" BETWEEN ${davrBoshi}::date AND ${bugun}::date
      ),
      k AS (
        SELECT "studentId", "day",
          SUM("activeSeconds")::int AS faol_xom,
          SUM("radioSeconds")::int AS radio_xom,
          SUM(lernen)::int AS lernen_xom,
          BOOL_OR("activeSeconds" >= ${KIRDI_CHEGARASI_S}) AS kirdi,
          range_agg(r) AS birlashma
        FROM s
        GROUP BY "studentId", "day"
      ),
      u AS (
        SELECT k.*,
          (SELECT FLOOR(COALESCE(SUM(EXTRACT(EPOCH FROM (upper(x) - lower(x)))), 0))::int
             FROM unnest(k.birlashma) AS x) AS birlashma_s
        FROM k
      )
      SELECT "studentId",
        to_char("day", 'YYYY-MM-DD') AS sana,
        LEAST(faol_xom, birlashma_s) AS "faolSoniya",
        LEAST(radio_xom, birlashma_s) AS "radioSoniya",
        CASE WHEN faol_xom > 0
          THEN ROUND(lernen_xom * LEAST(faol_xom, birlashma_s)::numeric / faol_xom)::int
          ELSE 0 END AS "lernenSoniya",
        kirdi
      FROM u
    `;
  }

  /**
   * Tugatilgan seanslardagi savollar, (o'quvchi, Toshkent kuni) bo'yicha.
   * Kun — seans BOSHLANGAN kun. `questionCount`/`firstTryCorrect` seans
   * yakunida `seansYigindisi()` bilan yoziladi (ADR-0019) — urinish qoidasi
   * bu yerda qaytadan yozilmaydi.
   */
  async kunlikSavollar(
    companyId: number,
    ids: number[],
    dan: Date,
  ): Promise<KunlikSavol[]> {
    const siljish = TASHKENT_OFFSET_MS / 1000;
    return this.prisma.$queryRaw<KunlikSavol[]>`
      SELECT "studentId",
        to_char(("startedAt" + ${siljish} * interval '1 second')::date, 'YYYY-MM-DD') AS sana,
        SUM(COALESCE("questionCount", 0))::int AS savollar,
        SUM(COALESCE("firstTryCorrect", 0))::int AS togri
      FROM "DafSession"
      WHERE "companyId" = ${companyId}
        AND "studentId" IN (${Prisma.join(ids)})
        AND "finishedAt" IS NOT NULL
        AND "startedAt" >= ${dan}
      GROUP BY "studentId", 2
    `;
  }

  /**
   * Butun tarixda kamida bitta seansda >= 10 s bo'lganlar — «hech qachon
   * kirmagan» (dizayn 3.2) ning teskarisi. Davrga bog'liq emas.
   */
  async umumanKirganlar(
    companyId: number,
    ids: number[],
  ): Promise<Set<number>> {
    const rows = await this.prisma.$queryRaw<{ studentId: number }[]>`
      SELECT DISTINCT "studentId"
      FROM "StudentAppSession"
      WHERE "companyId" = ${companyId}
        AND "studentId" IN (${Prisma.join(ids)})
        AND "activeSeconds" >= ${KIRDI_CHEGARASI_S}
    `;
    return new Set(rows.map((r) => r.studentId));
  }

  /**
   * Davrda tugatilgan (yoki qayta tugatilgan — `completedAt` yangilanadi)
   * darslar soni. Nafaqaga chiqarilgan unitlar chiqarib tashlanadi — mavjud
   * `tugatilganDarslar` bilan bir xil shart.
   */
  async tugatilganDarsSoni(
    companyId: number,
    ids: number[],
    dan: Date,
  ): Promise<Map<number, number>> {
    const rows = await this.prisma.$queryRaw<
      { studentId: number; soni: number }[]
    >`
      SELECT p."studentId", COUNT(*)::int AS soni
      FROM "DafLessonProgress" p
      JOIN "DafLesson" l ON l.id = p."lessonId"
      JOIN "DafUnit" u ON u.id = l."unitId"
      WHERE p."companyId" = ${companyId}
        AND p."studentId" IN (${Prisma.join(ids)})
        AND p."completedAt" >= ${dan}
        AND u.code IS NOT NULL AND u."retiredAt" IS NULL
      GROUP BY p."studentId"
    `;
    return new Map(rows.map((r) => [r.studentId, r.soni]));
  }
}
