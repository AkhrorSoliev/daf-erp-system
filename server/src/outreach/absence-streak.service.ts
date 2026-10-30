import { Injectable } from '@nestjs/common';
import {
  AttendanceStatus,
  EnrollmentStatus,
  GroupStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { streakWindowStart } from '../attendance/streak-window';
import { utcMidnightFromDateStr } from '../attendance/shared/date-utils';
import { BarredLessonsService } from '../attendance/barred-lessons.service';
import { SettingsService } from '../settings/settings.service';

export interface StreakRow {
  enrollmentId: string;
  studentId: number;
  groupId: string;
  consecutiveAbsentCount: number;
  lastAbsenceDate: Date;
  // Most recent PRESENT or LATE attendance date. null = no record of ever
  // attending this group's lessons. Used in the UI to show "Oxirgi marta
  // dars kelgan sanasi" so the admin can judge how long the student has
  // been MIA.
  lastPresentDate: Date | null;
  /**
   * Nima sanalgan (ADR-0142): 'ABSENT' — faqat "Kelmadi" belgilari; 'BARRED' —
   * faqat to'lov yo'qligi uchun davomat olib bo'lmagan kunlar; 'MIXED' —
   * ikkalasi. Yo'q bo'lsa 'ABSENT'.
   */
  reason?: StreakReason;
}

export type StreakReason = 'ABSENT' | 'BARRED' | 'MIXED';

/** Har bir juftlik uchun nechta oxirgi davomat o'qiladi. */
const LAST_N_ATTENDANCES = 10;

export { streakWindowStart };

/** Bitta so'rovga sig'adigan maksimal juftlik soni. */
const PAIR_CHUNK_SIZE = 5000;

interface AttendanceRow {
  date: Date;
  status: AttendanceStatus;
}

interface RawAttendanceRow {
  studentId: number;
  groupId: string;
  /** `to_char(date, 'YYYY-MM-DD')` — mintaqa siljishining oldini oladi. */
  dateStr: string;
  status: AttendanceStatus;
}

function pairKey(studentId: number, groupId: string): string {
  return `${studentId}|${groupId}`;
}

@Injectable()
export class AbsenceStreakService {
  constructor(
    private prisma: PrismaService,
    private barredLessons: BarredLessonsService,
    private settings: SettingsService,
  ) {}

  /**
   * To'lov yo'qligi uchun davomat olib bo'lmagan kunlar "Kelmadi" kabi
   * sanalsinmi? Faqat shu kunlarga tayanadigan harakat (xabar yoki pauza)
   * yoqilgan bo'lsa: aks holda "Ko'p dars qoldirganlar" ro'yxati va avto-pauza
   * kutilmaganda o'zgarib qolardi.
   */
  private async barredCounts(companyId: number): Promise<boolean> {
    const flags = await Promise.all(
      (['nudge', 'warn', 'autoPause'] as const).map((k) =>
        this.settings.get(companyId, `absence.barred.${k}`),
      ),
    );
    return flags.some(Boolean);
  }

  /**
   * Compute consecutive ABSENT streaks per ACTIVE enrollment and return only
   * those at or above `threshold`. EXCUSED, PRESENT, and LATE all break a
   * streak — only sababsiz absences count.
   *
   * Reads up to the last 10 attendances per enrollment. That covers any
   * realistic streak (3-strike is the trigger; longer streaks just keep
   * incrementing) without paging the full attendance history.
   *
   * Uchta istisno — uchalasi ham xom SQL ichida, `rn <= 10` oynasidan OLDIN
   * (aks holda chiqarib tashlanadigan qator o'nlikdan joy egallab, haqiqiy
   * davomatni ko'rinmas qilib qo'yardi):
   *
   *  - **Sanoq oynasi** (`streakWindowStart`) — faollashtirishdan oldingi
   *    davomat sanalmaydi.
   *  - **Oldindan aytilgan SABABSIZ qoldirish** — `EXCUSED` bo'lib tushadi,
   *    lekin ABSENT deb sanaladi. Aks holda har safar oldindan qo'ng'iroq
   *    qilib pauzadan cheksiz qochish mumkin edi. `SABABLI` (kasal)
   *    avvalgidek uzadi.
   *  - **Bekor qilingan dars** (`cancellationId`) — umuman ko'rinmaydi.
   *    Markaz darsni bekor qilgani o'quvchining aybi ham emas, uning
   *    ketma-ketligini yuvib yuboradigan xizmat ham emas.
   *
   * Bu YAGONA ta'rif: `/outreach` ro'yxati ham, avtomatik pauza cron'i ham
   * shu funksiyadan o'qiydi, shuning uchun ro'yxat va harakat hech qachon
   * bir-biriga zid bo'lmaydi.
   */
  async computeStreaks(params: {
    companyId: number;
    branchIds?: number[];
    threshold?: number;
  }): Promise<StreakRow[]> {
    const threshold = params.threshold ?? 3;

    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        status: EnrollmentStatus.ACTIVE,
        deletedAt: null,
        student: { deletedAt: null },
        group: {
          deletedAt: null,
          statusEnum: GroupStatus.ACTIVE,
          companyId: params.companyId,
          ...(params.branchIds && params.branchIds.length > 0
            ? { branchId: { in: params.branchIds } }
            : {}),
        },
      },
      select: {
        id: true,
        studentId: true,
        groupId: true,
        startDate: true,
        createdAt: true,
        statusChangedAt: true,
      },
    });

    if (enrollments.length === 0) return [];

    // Har yozuv o'z oynasi bilan ketadi — so'rovga uchinchi massiv bo'lib
    // uzatiladi va "shu sanadan oldingi davomatni ko'rsatma" degani.
    const windows = enrollments.map((e) => ({
      studentId: e.studentId,
      groupId: e.groupId,
      since: streakWindowStart(e),
    }));

    // Har bir yozuvning oxirgi 10 ta davomati — BITTA so'rovda.
    //
    // NEGA XOM SQL: ilgari bu yerda `enrollments.map(async ...)` turgan va har
    // bir yozuv uchun alohida `findMany` ketardi. 6011 aktiv yozuvda bu 6011 ta
    // borib-kelish degani; masofadagi bazada /outreach/stats 107 soniya
    // ishlardi. Prisma'da "har bir guruhdan oxirgi N ta" ni bitta so'rovda
    // olishning yo'li yo'q, Postgres'da esa bor — `ROW_NUMBER()`.
    // `@@unique([groupId, studentId, date])` indeksi shu tartibni to'g'ridan-
    // to'g'ri beradi, ya'ni saralash uchun qo'shimcha ish qilinmaydi.
    const lastTenByPair = await this.fetchLastTenPerPair(
      params.companyId,
      windows,
    );

    const qualifying: {
      enrollment: (typeof enrollments)[number];
      lastTen: AttendanceRow[];
      streak: number;
    }[] = [];

    for (const e of enrollments) {
      const lastTen = lastTenByPair.get(pairKey(e.studentId, e.groupId)) ?? [];
      const streak = consecutiveAbsentCount(lastTen);
      if (streak >= threshold)
        qualifying.push({ enrollment: e, lastTen, streak });
    }

    // `lastPresentDate` uchun zaxira so'rov faqat NAVBATGA TUSHGAN yozuvlar
    // uchun ketadi (odatda bir nechta), shuning uchun bu yerda N+1 xavfi yo'q —
    // tuzatishdan oldingi kodda ham shunday edi.
    const results = await Promise.all(
      qualifying.map(async ({ enrollment: e, lastTen, streak }) => {
        const inLastTen = lastTen.find(
          (a) =>
            a.status === AttendanceStatus.PRESENT ||
            a.status === AttendanceStatus.LATE,
        );
        let lastPresentDate: Date | null = inLastTen?.date ?? null;
        if (!lastPresentDate) {
          const earlier = await this.prisma.attendance.findFirst({
            where: {
              studentId: e.studentId,
              groupId: e.groupId,
              companyId: params.companyId,
              // Oynasiz bu so'rov boshqa davrdagi darsni "oxirgi kelgan"
              // deb ko'rsatardi — admin kartadagi sanaga ishonmay qolardi.
              cancellationId: null,
              date: { gte: utcMidnightFromDateStr(streakWindowStart(e)) },
              status: {
                in: [AttendanceStatus.PRESENT, AttendanceStatus.LATE],
              },
            },
            orderBy: { date: 'desc' },
            select: { date: true },
          });
          lastPresentDate = earlier?.date ?? null;
        }

        return {
          enrollmentId: e.id,
          studentId: e.studentId,
          groupId: e.groupId,
          consecutiveAbsentCount: streak,
          lastAbsenceDate: lastTen[0].date,
          lastPresentDate,
        };
      }),
    );

    if (!(await this.barredCounts(params.companyId))) return results;
    return this.withBarredDays(
      params.companyId,
      enrollments,
      results,
      threshold,
    );
  }

  /**
   * "Kelmadi" qatorlariga davomat olib bo'lmagan kunlarni qo'shadi (ADR-0142).
   * Ketma-ketlikni `BarredLessonsService` hisoblaydi: u ikkalasini bitta
   * kunlar chizig'ida sanaydi, shuning uchun aralash ketma-ketlik ("Kelmadi",
   * keyin davomat olib bo'lmagan kunlar) ham to'g'ri chiqadi.
   */
  private async withBarredDays(
    companyId: number,
    enrollments: { id: string; studentId: number; groupId: string }[],
    absentRows: StreakRow[],
    threshold: number,
  ): Promise<StreakRow[]> {
    const barred = await this.barredLessons.forEnrollments(
      enrollments.map((e) => e.id),
    );
    const out = new Map<string, StreakRow>(
      absentRows.map((r) => [r.enrollmentId, { ...r, reason: 'ABSENT' }]),
    );
    const needPresent: {
      enrollmentId: string;
      studentId: number;
      groupId: string;
    }[] = [];
    for (const b of barred.values()) {
      if (b.days.length === 0 || b.streak < threshold || !b.lastDay) continue;
      const prev = out.get(b.enrollmentId);
      const lastBarred = utcMidnightFromDateStr(b.lastDay);
      out.set(b.enrollmentId, {
        enrollmentId: b.enrollmentId,
        studentId: b.studentId,
        groupId: b.groupId,
        consecutiveAbsentCount: b.streak,
        lastAbsenceDate:
          prev && prev.lastAbsenceDate > lastBarred
            ? prev.lastAbsenceDate
            : lastBarred,
        lastPresentDate: prev?.lastPresentDate ?? null,
        reason: prev ? 'MIXED' : 'BARRED',
      });
      if (!prev) needPresent.push(b);
    }
    if (needPresent.length > 0) {
      const came = await this.prisma.attendance.groupBy({
        by: ['studentId', 'groupId'],
        where: {
          companyId,
          studentId: { in: needPresent.map((n) => n.studentId) },
          groupId: { in: needPresent.map((n) => n.groupId) },
          cancellationId: null,
          status: { in: [AttendanceStatus.PRESENT, AttendanceStatus.LATE] },
        },
        _max: { date: true },
      });
      const lastByPair = new Map(
        came.map((c) => [pairKey(c.studentId, c.groupId), c._max.date]),
      );
      for (const n of needPresent) {
        const row = out.get(n.enrollmentId);
        if (row) {
          row.lastPresentDate =
            lastByPair.get(pairKey(n.studentId, n.groupId)) ?? null;
        }
      }
    }
    return [...out.values()];
  }

  /**
   * Har bir `(studentId, groupId)` juftligi uchun oxirgi 10 ta SANALADIGAN
   * davomat, o'z sanoq oynasi ichida.
   *
   * Sana MATN sifatida o'qiladi va UTC yarim tuniga o'giriladi. Sababi nozik:
   * `Attendance.date` — `@db.Date` ustuni, Prisma uni UTC yarim tuni qilib
   * beradi, xom SQL yo'li esa (node-postgres) MAHALLIY yarim tun qilib beradi.
   * To'g'ridan-to'g'ri olsak, sanalar Toshkent ofsetiga siljib ketardi.
   *
   * PARTITION BY ustunlari ataylab (groupId, studentId) tartibida — Attendance
   * jadvalidagi unique indeks aynan shu tartibda (groupId, studentId, date),
   * shuning uchun Postgres oynani qo'shimcha saralashsiz hisoblaydi. Teskari
   * tartibda natija bir xil bo'lardi, lekin ortiqcha saralash paydo bo'lardi.
   *
   * Uchala qoida (oyna, bekor qilingan dars, oldindan aytilgan SABABSIZ
   * qoldirish) `rn <= 10` dan OLDIN — ichki so'rovda. Agar ular tashqarida
   * bo'lsa, chiqarib tashlanadigan qator o'nlikdan joy egallab, undan
   * oldingi haqiqiy davomatni ko'rinmas qilib qo'yardi.
   */
  private async fetchLastTenPerPair(
    companyId: number,
    windows: { studentId: number; groupId: string; since: string }[],
  ): Promise<Map<string, AttendanceRow[]>> {
    const byPair = new Map<string, AttendanceRow[]>();

    // Juda katta ro'yxatda bitta so'rov cheksiz o'smasin.
    for (let i = 0; i < windows.length; i += PAIR_CHUNK_SIZE) {
      const chunk = windows.slice(i, i + PAIR_CHUNK_SIZE);
      const studentIds = chunk.map((p) => p.studentId);
      const groupIds = chunk.map((p) => p.groupId);
      const sinceDates = chunk.map((p) => p.since);

      const rows = await this.prisma.$queryRaw<RawAttendanceRow[]>`
        SELECT t."studentId", t."groupId", t."dateStr", t."status"
        FROM (
          SELECT a."studentId",
                 a."groupId",
                 to_char(a."date", 'YYYY-MM-DD') AS "dateStr",
                 CASE
                   WHEN a."status" = 'EXCUSED' AND pa."kind" = 'SABABSIZ'
                     THEN 'ABSENT'
                   ELSE a."status"::text
                 END AS "status",
                 ROW_NUMBER() OVER (
                   PARTITION BY a."groupId", a."studentId"
                   ORDER BY a."date" DESC
                 ) AS rn
          FROM "Attendance" a
          JOIN unnest(
                 ${studentIds}::int[],
                 ${groupIds}::text[],
                 ${sinceDates}::date[]
               ) AS w("studentId", "groupId", "since")
            ON w."studentId" = a."studentId"
           AND w."groupId" = a."groupId"
          LEFT JOIN "PlannedAbsence" pa
            ON pa."studentId" = a."studentId"
           AND pa."groupId" = a."groupId"
           AND pa."date" = a."date"
          WHERE a."companyId" = ${companyId}
            AND a."cancellationId" IS NULL
            AND a."date" >= w."since"
        ) t
        WHERE t.rn <= ${LAST_N_ATTENDANCES}
        ORDER BY t."groupId", t."studentId", t."dateStr" DESC
      `;

      for (const r of rows) {
        const k = pairKey(r.studentId, r.groupId);
        const list = byPair.get(k);
        const row: AttendanceRow = {
          date: new Date(`${r.dateStr}T00:00:00.000Z`),
          status: r.status,
        };
        if (list) list.push(row);
        else byPair.set(k, [row]);
      }
    }

    return byPair;
  }
}

/**
 * Walk attendances from newest to oldest. Count consecutive ABSENT entries
 * starting from the latest. Any non-ABSENT (PRESENT, LATE, EXCUSED) breaks
 * the streak. Exported for unit tests.
 */
export function consecutiveAbsentCount(
  attendancesDesc: { status: AttendanceStatus }[],
): number {
  let count = 0;
  for (const a of attendancesDesc) {
    if (a.status === AttendanceStatus.ABSENT) {
      count++;
    } else {
      break;
    }
  }
  return count;
}
