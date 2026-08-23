import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  branchIdWhere,
  studentBranchWhere,
  userBranchWhere,
  type ReportBranchIds,
} from '../common/finance/report-branch-scope';
import { TelegramGroupDailyReportService } from './telegram-group-daily-report.service';
import {
  firstOfThisMonthDate,
  firstOfThisMonthUtc,
  formatNumber,
  formatSum,
  tashkentDayRange,
  tashkentTodayDate,
} from './utils/format.util';

const TEACHER_ROLE_NAME = "O'qituvchi";

/**
 * Composes stats for the admin bot commands.
 *
 * Every query is scoped by companyId AND by the branches the asking group is
 * allowed to see (`reportBranchIdsForGroup`). `null` means all of them — a
 * CEO-declared org-wide group — and anything else is that group's own branch.
 *
 * The branch half used to be "plumbed through for Phase 5+", i.e. absent, so a
 * group tied to one branch was answered with the whole company. Each model
 * needs its own predicate: Student's branch lives on `StudentBranch`, a User's
 * on `mainBranch`/`UserBranch`, and Payment/Expense/Group carry it directly.
 * `common/finance/report-branch-scope` owns all four so these figures slice
 * the same way the web reports do.
 *
 * Targeted queries instead of going through reports/*.service.ts because
 * those services return richer shapes than the bot needs and aren't currently
 * exported from ReportsModule.
 */
@Injectable()
export class TelegramGroupStatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dailyReport: TelegramGroupDailyReportService,
  ) {}

  // -------------------- /oquvchilar --------------------
  async buildStudentsBlock(
    companyId: number,
    branchIds: ReportBranchIds,
  ): Promise<string> {
    const today = tashkentDayRange();
    const firstOfMonth = firstOfThisMonthUtc();

    const [active, todayNew, monthNew, frozen, expelledMonth] =
      await Promise.all([
        this.prisma.student.count({
          where: {
            companyId,
            deletedAt: null,
            status: 'ACTIVE',
            ...studentBranchWhere(branchIds),
          },
        }),
        this.prisma.student.count({
          where: {
            companyId,
            deletedAt: null,
            createdAt: { gte: today.start, lt: today.end },
            ...studentBranchWhere(branchIds),
          },
        }),
        this.prisma.student.count({
          where: {
            companyId,
            deletedAt: null,
            createdAt: { gte: firstOfMonth },
            ...studentBranchWhere(branchIds),
          },
        }),
        this.prisma.student.count({
          where: {
            companyId,
            deletedAt: null,
            status: 'FROZEN',
            ...studentBranchWhere(branchIds),
          },
        }),
        this.prisma.student.count({
          where: {
            companyId,
            deletedAt: null,
            status: 'EXPELLED',
            statusChangedAt: { gte: firstOfMonth },
            ...studentBranchWhere(branchIds),
          },
        }),
      ]);

    return [
      `👨‍🎓 <b>O'quvchilar</b>`,
      ``,
      `Faol: <b>${formatNumber(active)}</b>`,
      `Bugun yangi: <b>${formatNumber(todayNew)}</b>`,
      `Bu oy yangi: <b>${formatNumber(monthNew)}</b>`,
      `Muzlatilgan: <b>${formatNumber(frozen)}</b>`,
      `Chetlatilgan (bu oy): <b>${formatNumber(expelledMonth)}</b>`,
    ].join('\n');
  }

  // -------------------- /oqituvchilar --------------------
  async buildTeachersBlock(
    companyId: number,
    branchIds: ReportBranchIds,
  ): Promise<string> {
    const firstOfMonth = firstOfThisMonthUtc();
    const teacherRole = await this.prisma.role.findFirst({
      where: { name: { in: ['Teacher', TEACHER_ROLE_NAME] } },
      select: { id: true },
    });
    if (!teacherRole) {
      return `👨‍🏫 <b>O'qituvchilar</b>\n\nMa'lumot topilmadi (rol konfiguratsiyasi yo'q).`;
    }

    const [active, monthNew] = await Promise.all([
      this.prisma.user.count({
        where: {
          companyId,
          deletedAt: null,
          status: 'ACTIVE',
          roles: { some: { roleId: teacherRole.id } },
          ...userBranchWhere(branchIds),
        },
      }),
      this.prisma.user.count({
        where: {
          companyId,
          deletedAt: null,
          createdAt: { gte: firstOfMonth },
          roles: { some: { roleId: teacherRole.id } },
          ...userBranchWhere(branchIds),
        },
      }),
    ]);

    return [
      `👨‍🏫 <b>O'qituvchilar</b>`,
      ``,
      `Faol: <b>${formatNumber(active)}</b>`,
      `Bu oy yangi: <b>${formatNumber(monthNew)}</b>`,
    ].join('\n');
  }

  // -------------------- /tolovlar --------------------
  async buildPaymentsBlock(
    companyId: number,
    branchIds: ReportBranchIds,
  ): Promise<string> {
    const firstOfMonth = firstOfThisMonthUtc();

    const [total, byMethod] = await Promise.all([
      this.prisma.payment.aggregate({
        where: {
          companyId,
          status: 'COMPLETED',
          createdAt: { gte: firstOfMonth },
          ...branchIdWhere(branchIds),
        },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.payment.groupBy({
        by: ['method'],
        where: {
          companyId,
          status: 'COMPLETED',
          createdAt: { gte: firstOfMonth },
          ...branchIdWhere(branchIds),
        },
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    const totalSum = total._sum.amount ?? 0;
    const totalCount = total._count ?? 0;
    const avg = totalCount > 0 ? Math.round(totalSum / totalCount) : 0;

    const methodLabels: Record<string, string> = {
      CASH: 'Naqd',
      PAYME: 'Payme',
      CLICK: 'Click',
      UZUM: 'Uzum',
      TRANSFER: "O'tkazma",
    };

    const byMethodLines = byMethod
      .map((m) => {
        const label = methodLabels[m.method] ?? m.method;
        return `  ${label}: <b>${formatSum(m._sum.amount ?? 0)}</b> (${m._count} ta)`;
      })
      .join('\n');

    return [
      `💳 <b>To'lovlar (bu oy)</b>`,
      ``,
      `Jami: <b>${formatSum(totalSum)}</b>`,
      `Soni: <b>${formatNumber(totalCount)}</b> ta`,
      `O'rtacha: <b>${formatSum(avg)}</b>`,
      ``,
      byMethodLines || `  (to'lov yo'q)`,
    ].join('\n');
  }

  // -------------------- /qarzdorlar --------------------
  async buildDebtorsBlock(
    companyId: number,
    branchIds: ReportBranchIds,
  ): Promise<string> {
    const [aggregate, top] = await Promise.all([
      this.prisma.student.aggregate({
        where: {
          companyId,
          deletedAt: null,
          status: 'ACTIVE',
          balance: { lt: 0 },
          ...studentBranchWhere(branchIds),
        },
        _sum: { balance: true },
        _count: true,
      }),
      this.prisma.student.findMany({
        where: {
          companyId,
          deletedAt: null,
          status: 'ACTIVE',
          balance: { lt: 0 },
          ...studentBranchWhere(branchIds),
        },
        orderBy: { balance: 'asc' }, // most negative first
        take: 5,
        select: { id: true, firstName: true, lastName: true, balance: true },
      }),
    ]);

    const totalDebt = Math.abs(aggregate._sum.balance ?? 0);
    const count = aggregate._count;

    const topLines = top
      .map(
        (s, i) =>
          `  ${i + 1}. ${s.firstName} ${s.lastName} (#${s.id}) — <b>${formatSum(Math.abs(s.balance))}</b>`,
      )
      .join('\n');

    return [
      `💸 <b>Qarzdorlar</b>`,
      ``,
      `Soni: <b>${formatNumber(count)}</b>`,
      `Jami qarz: <b>${formatSum(totalDebt)}</b>`,
      count > 0 ? `\n<b>Eng katta 5 ta qarzdor:</b>\n${topLines}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  // -------------------- /guruhlar --------------------
  async buildGroupsBlock(
    companyId: number,
    branchIds: ReportBranchIds,
  ): Promise<string> {
    const firstOfMonth = firstOfThisMonthUtc();

    const [active, forming, monthNew] = await Promise.all([
      this.prisma.group.count({
        where: {
          companyId,
          deletedAt: null,
          statusEnum: 'ACTIVE',
          ...branchIdWhere(branchIds),
        },
      }),
      this.prisma.group.count({
        where: {
          companyId,
          deletedAt: null,
          statusEnum: 'FORMING',
          ...branchIdWhere(branchIds),
        },
      }),
      this.prisma.group.count({
        where: {
          companyId,
          deletedAt: null,
          createdAt: { gte: firstOfMonth },
          ...branchIdWhere(branchIds),
        },
      }),
    ]);

    return [
      `👥 <b>Guruhlar</b>`,
      ``,
      `Faol: <b>${formatNumber(active)}</b>`,
      `Shakllanayotgan: <b>${formatNumber(forming)}</b>`,
      `Bu oy yangi: <b>${formatNumber(monthNew)}</b>`,
    ].join('\n');
  }

  // -------------------- /stats --------------------
  async buildOverallStats(
    companyId: number,
    branchIds: ReportBranchIds,
  ): Promise<string> {
    const today = tashkentDayRange();
    // `firstOfMonth` (a -5h-shifted timestamp) is correct for the income query
    // below (filters `Payment.createdAt`, a timestamp). `Expense.date` is a DATE
    // column, so its month window must use date-only bounds — otherwise Postgres
    // floors the shifted lower bound to the previous 30th/31st and leaks that
    // day's rows into this month. See firstOfThisMonthDate() docstring.
    const firstOfMonth = firstOfThisMonthUtc();
    const firstOfMonthDate = firstOfThisMonthDate();
    const todayDate = tashkentTodayDate();

    const teacherRole = await this.prisma.role.findFirst({
      where: { name: { in: ['Teacher', TEACHER_ROLE_NAME] } },
      select: { id: true },
    });
    const teacherRoleId = teacherRole?.id;

    const [
      activeStudents,
      todayNewStudents,
      activeGroups,
      activeTeachers,
      debtorAgg,
      monthlyIncome,
      monthlyExpenses,
    ] = await Promise.all([
      this.prisma.student.count({
        where: {
          companyId,
          deletedAt: null,
          status: 'ACTIVE',
          ...studentBranchWhere(branchIds),
        },
      }),
      this.prisma.student.count({
        where: {
          companyId,
          deletedAt: null,
          createdAt: { gte: today.start, lt: today.end },
          ...studentBranchWhere(branchIds),
        },
      }),
      this.prisma.group.count({
        where: {
          companyId,
          deletedAt: null,
          statusEnum: 'ACTIVE',
          ...branchIdWhere(branchIds),
        },
      }),
      teacherRoleId
        ? this.prisma.user.count({
            where: {
              companyId,
              deletedAt: null,
              status: 'ACTIVE',
              roles: { some: { roleId: teacherRoleId } },
              ...userBranchWhere(branchIds),
            },
          })
        : Promise.resolve(0),
      this.prisma.student.aggregate({
        where: {
          companyId,
          deletedAt: null,
          status: 'ACTIVE',
          balance: { lt: 0 },
          ...studentBranchWhere(branchIds),
        },
        _sum: { balance: true },
        _count: true,
      }),
      this.prisma.payment.aggregate({
        where: {
          companyId,
          status: 'COMPLETED',
          createdAt: { gte: firstOfMonth },
          ...branchIdWhere(branchIds),
        },
        _sum: { amount: true },
      }),
      this.prisma.expense.aggregate({
        where: {
          companyId,
          deletedAt: null,
          date: { gte: firstOfMonthDate, lte: todayDate },
          ...branchIdWhere(branchIds),
        },
        _sum: { amount: true },
      }),
    ]);

    return [
      `📊 <b>Statistika — ${today.label}</b>`,
      ``,
      `Faol o'quvchilar: <b>${formatNumber(activeStudents)}</b>`,
      `Bugun yangi o'quvchi: <b>${formatNumber(todayNewStudents)}</b>`,
      `Faol guruhlar: <b>${formatNumber(activeGroups)}</b>`,
      `Faol o'qituvchilar: <b>${formatNumber(activeTeachers)}</b>`,
      ``,
      `Qarzdorlar: <b>${formatNumber(debtorAgg._count)}</b> ta · <b>${formatSum(Math.abs(debtorAgg._sum.balance ?? 0))}</b>`,
      ``,
      `Bu oylik tushum: <b>${formatSum(monthlyIncome._sum.amount ?? 0)}</b>`,
      `Bu oylik xarajat: <b>${formatSum(monthlyExpenses._sum.amount ?? 0)}</b>`,
    ].join('\n');
  }

  // -------------------- /hisobot (full daily) --------------------
  /**
   * The full end-of-day report. The heavy composition lives in
   * {@link TelegramGroupDailyReportService}; this delegator keeps the bot
   * command (`/hisobot`) and the 21:00 cron on one code path. On-demand
   * `/hisobot` intentionally does NOT persist a snapshot — only the cron
   * writes tonight's baseline after a confirmed send.
   */
  async buildDailyReport(
    companyId: number,
    branchIds: ReportBranchIds,
  ): Promise<string> {
    const { message } = await this.dailyReport.build(companyId, branchIds);
    return message;
  }
}
