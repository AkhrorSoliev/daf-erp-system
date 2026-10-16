import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import {
  addMonthsToMonthKey,
  tashkentMonthKey,
  utcMidnightFromDateStr,
} from '../common/date/tashkent';
import {
  branchIdWhere,
  type ReportBranchIds,
} from '../common/finance/report-branch-scope';
import {
  bestAndWorst,
  byTeacher,
  scoreDistribution,
  sortByAverage,
  totalsOf,
  type RatingRow,
} from './rating-math';
import { LOW_SCORE_MAX } from './rating-rules';

/** `@db.Date` ustuni uchun oy chegarasi: [1-kun, keyingi oyning 1-kuni). */
function monthDates(month: string): { gte: Date; lt: Date } {
  return {
    gte: utcMidnightFromDateStr(`${month}-01`),
    lt: utcMidnightFromDateStr(`${addMonthsToMonthKey(month, 1)}-01`),
  };
}

const dayStr = (d: Date) => d.toISOString().slice(0, 10);
const nameOf = (u: { firstName: string; lastName: string }) =>
  `${u.firstName} ${u.lastName}`;

/** Eng yaxshi / eng past ustoz kartasi uchun qisqa ko'rinish. */
function brief(
  t: {
    teacherId: number;
    name: string;
    average: number | null;
    rated: number;
  } | null,
) {
  return t && t.average !== null
    ? {
        teacherId: t.teacherId,
        name: t.name,
        average: t.average,
        rated: t.rated,
      }
    : null;
}

/** CEO'ning «Dars baholari» o'qishlari (spec 2026-10-13 §6.2). */
@Injectable()
export class LessonRatingsService {
  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
  ) {}

  async summary(companyId: number, scope: ReportBranchIds, month?: string) {
    const m = month ?? tashkentMonthKey(new Date());
    const [enabled, rows, prevRows] = await Promise.all([
      this.settings.get(companyId, 'lessonRating.enabled'),
      this.loadRows(companyId, scope, m),
      this.loadRows(companyId, scope, addMonthsToMonthKey(m, -1)),
    ]);
    const per = byTeacher(rows);
    const prevPer = byTeacher(prevRows);
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...per.keys()] } },
      select: { id: true, firstName: true, lastName: true },
    });
    const teachers = sortByAverage(
      users.map((u) => ({
        teacherId: u.id,
        name: nameOf(u),
        ...per.get(u.id)!,
        previousAverage: prevPer.get(u.id)?.average ?? null,
      })),
    );
    const { best, worst } = bestAndWorst(teachers);
    return {
      enabled,
      month: m,
      totals: totalsOf(rows),
      previousAverage: totalsOf(prevRows).average,
      teachers,
      distribution: scoreDistribution(rows),
      lowCommented: rows.filter(
        (r) => r.score !== null && r.score <= LOW_SCORE_MAX && r.commented,
      ).length,
      best: brief(best),
      worst: brief(worst),
    };
  }

  async teacher(
    companyId: number,
    scope: ReportBranchIds,
    teacherId: number,
    month?: string,
  ) {
    const m = month ?? tashkentMonthKey(new Date());
    const from = addMonthsToMonthKey(m, -5);
    const teacher = await this.prisma.user.findFirst({
      where: { id: teacherId, companyId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!teacher) throw new NotFoundException('Ustoz topilmadi');

    const rows = await this.prisma.lessonRating.findMany({
      where: {
        companyId,
        teacherIds: { has: teacherId },
        date: { gte: monthDates(from).gte, lt: monthDates(m).lt },
        ...branchIdWhere(scope),
      },
      orderBy: { date: 'desc' },
      select: {
        date: true,
        score: true,
        messageId: true,
        comment: true,
        groupId: true,
        studentId: true,
        teacherIds: true,
        group: { select: { name: true } },
        student: { select: { firstName: true, lastName: true } },
      },
    });
    const asRow = (r: (typeof rows)[number]): RatingRow => ({
      score: r.score,
      delivered: r.messageId !== null || r.score !== null,
      teacherIds: r.teacherIds,
    });

    const months: { month: string; average: number | null; rated: number }[] =
      [];
    for (let k = from; k <= m; k = addMonthsToMonthKey(k, 1)) {
      const t = totalsOf(
        rows.filter((r) => dayStr(r.date).startsWith(k)).map(asRow),
      );
      months.push({ month: k, average: t.average, rated: t.rated });
    }

    const current = rows.filter((r) => dayStr(r.date).startsWith(m));
    const byGroup = new Map<string, typeof current>();
    for (const r of current) {
      byGroup.set(r.groupId, [...(byGroup.get(r.groupId) ?? []), r]);
    }
    const groups = sortByAverage(
      [...byGroup].map(([groupId, list]) => {
        const t = totalsOf(list.map(asRow));
        return {
          groupId,
          name: list[0].group.name,
          average: t.average,
          rated: t.rated,
        };
      }),
    );

    const comments = current
      .filter((r) => r.comment !== null && r.score !== null)
      .map((r) => ({
        date: dayStr(r.date),
        groupName: r.group.name,
        studentId: r.studentId,
        studentName: nameOf(r.student),
        score: r.score!,
        comment: r.comment!,
      }));

    return {
      teacher: { id: teacher.id, name: nameOf(teacher) },
      months,
      groups,
      comments,
    };
  }

  async low(
    companyId: number,
    scope: ReportBranchIds,
    month: string | undefined,
    page: number,
    pageSize: number,
  ) {
    const m = month ?? tashkentMonthKey(new Date());
    const where = {
      companyId,
      date: monthDates(m),
      score: { lte: LOW_SCORE_MAX },
      ...branchIdWhere(scope),
    };
    const [total, rows] = await Promise.all([
      this.prisma.lessonRating.count({ where }),
      this.prisma.lessonRating.findMany({
        where,
        orderBy: [{ date: 'desc' }, { ratedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          date: true,
          score: true,
          comment: true,
          groupId: true,
          studentId: true,
          teacherIds: true,
          group: { select: { name: true } },
          student: { select: { firstName: true, lastName: true } },
        },
      }),
    ]);
    const teacherIds = [...new Set(rows.flatMap((r) => r.teacherIds))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: teacherIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    const names = new Map(users.map((u) => [u.id, nameOf(u)]));
    return {
      data: rows.map((r) => ({
        id: r.id,
        date: dayStr(r.date),
        groupId: r.groupId,
        groupName: r.group.name,
        teacherNames: r.teacherIds
          .map((id) => names.get(id))
          .filter((n): n is string => !!n),
        studentId: r.studentId,
        studentName: nameOf(r.student),
        score: r.score!,
        comment: r.comment,
      })),
      total,
      page,
      pageSize,
    };
  }

  async setEnabled(companyId: number, enabled: boolean, userId: number) {
    const value = await this.settings.set(
      companyId,
      'lessonRating.enabled',
      enabled,
      userId,
    );
    return { enabled: value };
  }

  private async loadRows(
    companyId: number,
    scope: ReportBranchIds,
    month: string,
  ): Promise<RatingRow[]> {
    const rows = await this.prisma.lessonRating.findMany({
      where: { companyId, date: monthDates(month), ...branchIdWhere(scope) },
      select: {
        score: true,
        messageId: true,
        comment: true,
        teacherIds: true,
      },
    });
    return rows.map((r) => ({
      score: r.score,
      delivered: r.messageId !== null || r.score !== null,
      teacherIds: r.teacherIds,
      commented: r.comment !== null,
    }));
  }
}
