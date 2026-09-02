import { Injectable } from '@nestjs/common';
import {
  AttendanceStatus,
  EnrollmentStatus,
  GroupStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

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
}

/** Har bir juftlik uchun nechta oxirgi davomat o'qiladi. */
const LAST_N_ATTENDANCES = 10;

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
  constructor(private prisma: PrismaService) {}

  /**
   * Compute consecutive ABSENT streaks per ACTIVE enrollment and return only
   * those at or above `threshold`. EXCUSED, PRESENT, and LATE all break a
   * streak — only sababsiz absences count.
   *
   * Reads up to the last 10 attendances per enrollment. That covers any
   * realistic streak (3-strike is the trigger; longer streaks just keep
   * incrementing) without paging the full attendance history.
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
      },
    });

    if (enrollments.length === 0) return [];

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
      enrollments,
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

    return results;
  }

  /**
   * `(studentId, groupId)` juftliklarining har biri uchun oxirgi 10 ta davomat.
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
   */
  private async fetchLastTenPerPair(
    companyId: number,
    pairs: { studentId: number; groupId: string }[],
  ): Promise<Map<string, AttendanceRow[]>> {
    const byPair = new Map<string, AttendanceRow[]>();

    // Juda katta ro'yxatda bitta so'rov cheksiz o'smasin.
    for (let i = 0; i < pairs.length; i += PAIR_CHUNK_SIZE) {
      const chunk = pairs.slice(i, i + PAIR_CHUNK_SIZE);
      const studentIds = chunk.map((p) => p.studentId);
      const groupIds = chunk.map((p) => p.groupId);

      const rows = await this.prisma.$queryRaw<RawAttendanceRow[]>`
        SELECT t."studentId", t."groupId", t."dateStr", t."status"
        FROM (
          SELECT a."studentId",
                 a."groupId",
                 to_char(a."date", 'YYYY-MM-DD') AS "dateStr",
                 a."status",
                 ROW_NUMBER() OVER (
                   PARTITION BY a."groupId", a."studentId"
                   ORDER BY a."date" DESC
                 ) AS rn
          FROM "Attendance" a
          WHERE a."companyId" = ${companyId}
            AND (a."studentId", a."groupId") IN (
              SELECT * FROM unnest(${studentIds}::int[], ${groupIds}::text[])
            )
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
