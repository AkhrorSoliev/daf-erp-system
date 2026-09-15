import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GuruhQiyinElement, OxirgiFaollik } from './app-activity-stats.types';
import { Daraja } from './stats/daraja';
import { dayStr, Platforma } from './stats/kunlik-faollik';
import { ElementAgregati, qiyinElementlar } from './stats/qiyin-elementlar';

type Sonlar = Partial<Record<Daraja, number>>;

/**
 * Ilova faolligi statistikasi uchun xom SQL/agregat so'rovlar
 * (`AppActivityStatsService`dan ajratildi — server/CLAUDE.md yangi fayl
 * uchun 500 qatorlik chegara). Chaqiruvchi HAR DOIM kompaniya (va kerak
 * bo'lsa guruh) bo'yicha allaqachon filtrlangan `ids`/`studentId` uzatishi
 * SHART — bu klass o'zi companyId yoki filial qamrovini tekshirmaydi.
 */
@Injectable()
export class AppActivityStatsQueries {
  constructor(private readonly prisma: PrismaService) {}

  /** Kompaniyadagi eng birinchi `StudentAppSession.day` (dizayn 6.2). */
  async kuzatuvBoshi(companyId: number): Promise<string | null> {
    const r = await this.prisma.studentAppSession.aggregate({
      where: { companyId },
      _min: { day: true },
    });
    return r._min.day ? dayStr(r._min.day) : null;
  }

  async oxirgiFaolliklar(ids: number[]): Promise<Map<number, OxirgiFaollik>> {
    const rows = await this.prisma.$queryRaw<
      { studentId: number; lastSeenAt: Date; platform: Platforma }[]
    >`
      SELECT DISTINCT ON ("studentId") "studentId", "lastSeenAt", "platform"::text AS "platform"
      FROM "StudentAppSession"
      WHERE "studentId" IN (${Prisma.join(ids)})
      ORDER BY "studentId", "lastSeenAt" DESC
    `;
    return new Map(
      rows.map((r) => [
        r.studentId,
        { vaqt: r.lastSeenAt.toISOString(), platforma: r.platform },
      ]),
    );
  }

  /** Darajadagi kurs darslari soni (dizayn 3: kurs ta'rifi). */
  async kursJamisi(): Promise<Sonlar> {
    const rows = await this.prisma.$queryRaw<
      { daraja: Daraja; jami: number }[]
    >`
      SELECT u.level::text AS daraja, COUNT(l.id)::int AS jami
      FROM "DafLesson" l
      JOIN "DafUnit" u ON u.id = l."unitId"
      WHERE u.code IS NOT NULL AND u."retiredAt" IS NULL
      GROUP BY u.level
    `;
    return Object.fromEntries(rows.map((r) => [r.daraja, r.jami]));
  }

  async tugatilganDarslar(ids: number[]): Promise<Map<number, Sonlar>> {
    const rows = await this.prisma.$queryRaw<
      { studentId: number; daraja: Daraja; soni: number }[]
    >`
      SELECT p."studentId", u.level::text AS daraja, COUNT(*)::int AS soni
      FROM "DafLessonProgress" p
      JOIN "DafLesson" l ON l.id = p."lessonId"
      JOIN "DafUnit" u ON u.id = l."unitId"
      WHERE p."studentId" IN (${Prisma.join(ids)})
        AND p."completedAt" IS NOT NULL
        AND u.code IS NOT NULL AND u."retiredAt" IS NULL
      GROUP BY p."studentId", u.level
    `;
    const natija = new Map<number, Sonlar>();
    for (const r of rows) {
      const s = natija.get(r.studentId) ?? {};
      s[r.daraja] = r.soni;
      natija.set(r.studentId, s);
    }
    return natija;
  }

  async oxirgiDarsDarajalari(ids: number[]): Promise<Map<number, Daraja>> {
    const rows = await this.prisma.$queryRaw<
      { studentId: number; daraja: Daraja }[]
    >`
      SELECT DISTINCT ON (s."studentId") s."studentId", u.level::text AS daraja
      FROM "DafSession" s
      JOIN "DafLesson" l ON l.id = s."lessonId"
      JOIN "DafUnit" u ON u.id = l."unitId"
      WHERE s."studentId" IN (${Prisma.join(ids)}) AND s.kind = 'LESSON'
        AND u.code IS NOT NULL AND u."retiredAt" IS NULL
      ORDER BY s."studentId", s."startedAt" DESC
    `;
    return new Map(rows.map((r) => [r.studentId, r.daraja]));
  }

  async birlikProgressi(studentId: number) {
    return this.prisma.$queryRaw<
      {
        unitId: number;
        daraja: Daraja;
        nomi: string;
        jami: number;
        tugatilgan: number;
        oxirgi: Date | null;
      }[]
    >`
      SELECT u.id AS "unitId", u.level::text AS daraja, u."titleUz" AS nomi,
        COUNT(l.id)::int AS jami,
        COUNT(p.id) FILTER (WHERE p."completedAt" IS NOT NULL)::int AS tugatilgan,
        MAX(p."completedAt") AS oxirgi
      FROM "DafUnit" u
      JOIN "DafLesson" l ON l."unitId" = u.id
      LEFT JOIN "DafLessonProgress" p ON p."lessonId" = l.id AND p."studentId" = ${studentId}
      WHERE u.code IS NOT NULL AND u."retiredAt" IS NULL
      GROUP BY u.id
      ORDER BY u.level, u."order"
    `;
  }

  /** Dizayn 6.5: birinchi urinishlar `(itemType, itemId)` bo'yicha; kamida 3 o'quvchi SQL da. */
  async elementAgregatlari(
    ids: number[],
    dan: Date,
  ): Promise<ElementAgregati[]> {
    return this.prisma.$queryRaw<ElementAgregati[]>`
      SELECT "itemType", "itemId",
        COUNT(DISTINCT "studentId")::int AS oquvchilar,
        AVG(COALESCE(score, 0))::float AS "ortachaBall",
        MODE() WITHIN GROUP (ORDER BY format) AS format
      FROM "DafAttempt"
      WHERE "studentId" IN (${Prisma.join(ids)})
        AND "attemptNo" = 1 AND "gradingStatus" = 'GRADED'
        AND "itemType" IS NOT NULL AND "itemId" IS NOT NULL
        AND "createdAt" >= ${dan}
      GROUP BY "itemType", "itemId"
      HAVING COUNT(DISTINCT "studentId") >= 3
    `;
  }

  /** Har material turi uchun bittadan so'rov (≤ 5, o'quvchilar soniga bog'liq emas). */
  async elementMatnlari(
    elementlar: ReturnType<typeof qiyinElementlar>,
  ): Promise<GuruhQiyinElement[]> {
    const idlar = (tur: string) =>
      elementlar.filter((e) => e.itemType === tur).map((e) => e.itemId);
    const matn = new Map<string, { de: string; uz: string | null }>();
    const qosh = (
      tur: string,
      rows: { id: number; de: string; uz: string | null }[],
    ) => {
      for (const r of rows) matn.set(`${tur}:${r.id}`, { de: r.de, uz: r.uz });
    };
    const wort = idlar('WORT');
    const satz = idlar('SATZ');
    const phrase = idlar('PHRASE');
    const zeile = idlar('DIALOGZEILE');
    const hoer = idlar('HOERFRAGE');
    const vazifalar: Promise<void>[] = [];
    if (wort.length)
      vazifalar.push(
        this.prisma.dafLexeme
          .findMany({
            where: { id: { in: wort } },
            select: { id: true, de: true, uz: true },
          })
          .then((r) => qosh('WORT', r)),
      );
    if (satz.length)
      vazifalar.push(
        this.prisma.dafSentence
          .findMany({
            where: { id: { in: satz } },
            select: { id: true, de: true, uz: true },
          })
          .then((r) => qosh('SATZ', r)),
      );
    if (phrase.length)
      vazifalar.push(
        this.prisma.dafPhrase
          .findMany({
            where: { id: { in: phrase } },
            select: { id: true, de: true, uz: true },
          })
          .then((r) => qosh('PHRASE', r)),
      );
    if (zeile.length)
      vazifalar.push(
        this.prisma.dafDialogLine
          .findMany({
            where: { id: { in: zeile } },
            select: { id: true, de: true, uz: true },
          })
          .then((r) => qosh('DIALOGZEILE', r)),
      );
    if (hoer.length)
      vazifalar.push(
        this.prisma.dafHoerFrage
          .findMany({
            where: { id: { in: hoer } },
            select: { id: true, frageDe: true, frageUz: true },
          })
          .then((r) =>
            qosh(
              'HOERFRAGE',
              r.map((x) => ({ id: x.id, de: x.frageDe, uz: x.frageUz })),
            ),
          ),
      );
    await Promise.all(vazifalar);
    return elementlar
      .map((e) => ({
        ...e,
        ...(matn.get(`${e.itemType}:${e.itemId}`) ?? { de: '', uz: null }),
      }))
      .filter((e) => e.de !== '');
  }
}
