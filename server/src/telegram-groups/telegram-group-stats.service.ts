import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  firstOfThisMonthUtc,
  formatDate,
  formatNumber,
  formatSum,
  tashkentDayRange,
  tashkentTodayDate,
} from './utils/format.util';

const TEACHER_ROLE_NAME = 'O\'qituvchi';

/**
 * Composes stats for the admin bot commands.
 *
 * All queries are scoped by companyId (and optionally branchId — currently
 * unused in the MVP but plumbed through for Phase 5+).
 *
 * Targeted queries instead of going through reports/*.service.ts because
 * those services return richer shapes than the bot needs and aren't currently
 * exported from ReportsModule.
 */
@Injectable()
export class TelegramGroupStatsService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------- /oquvchilar --------------------
  async buildStudentsBlock(companyId: number): Promise<string> {
    const today = tashkentDayRange();
    const firstOfMonth = firstOfThisMonthUtc();

    const [active, todayNew, monthNew, frozen, expelledMonth] = await Promise.all([
      this.prisma.student.count({
        where: { companyId, deletedAt: null, status: 'ACTIVE' },
      }),
      this.prisma.student.count({
        where: {
          companyId,
          deletedAt: null,
          createdAt: { gte: today.start, lt: today.end },
        },
      }),
      this.prisma.student.count({
        where: {
          companyId,
          deletedAt: null,
          createdAt: { gte: firstOfMonth },
        },
      }),
      this.prisma.student.count({
        where: { companyId, deletedAt: null, status: 'FROZEN' },
      }),
      this.prisma.student.count({
        where: {
          companyId,
          deletedAt: null,
          status: 'EXPELLED',
          statusChangedAt: { gte: firstOfMonth },
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
  async buildTeachersBlock(companyId: number): Promise<string> {
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
        },
      }),
      this.prisma.user.count({
        where: {
          companyId,
          deletedAt: null,
          createdAt: { gte: firstOfMonth },
          roles: { some: { roleId: teacherRole.id } },
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
  async buildPaymentsBlock(companyId: number): Promise<string> {
    const firstOfMonth = firstOfThisMonthUtc();

    const [total, byMethod] = await Promise.all([
      this.prisma.payment.aggregate({
        where: {
          companyId,
          status: 'COMPLETED',
          createdAt: { gte: firstOfMonth },
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
  async buildDebtorsBlock(companyId: number): Promise<string> {
    const [aggregate, top] = await Promise.all([
      this.prisma.student.aggregate({
        where: {
          companyId,
          deletedAt: null,
          status: 'ACTIVE',
          balance: { lt: 0 },
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
  async buildGroupsBlock(companyId: number): Promise<string> {
    const firstOfMonth = firstOfThisMonthUtc();

    const [active, forming, monthNew] = await Promise.all([
      this.prisma.group.count({
        where: { companyId, deletedAt: null, statusEnum: 'ACTIVE' },
      }),
      this.prisma.group.count({
        where: { companyId, deletedAt: null, statusEnum: 'FORMING' },
      }),
      this.prisma.group.count({
        where: { companyId, deletedAt: null, createdAt: { gte: firstOfMonth } },
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
  async buildOverallStats(companyId: number): Promise<string> {
    const today = tashkentDayRange();
    const firstOfMonth = firstOfThisMonthUtc();

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
        where: { companyId, deletedAt: null, status: 'ACTIVE' },
      }),
      this.prisma.student.count({
        where: {
          companyId,
          deletedAt: null,
          createdAt: { gte: today.start, lt: today.end },
        },
      }),
      this.prisma.group.count({
        where: { companyId, deletedAt: null, statusEnum: 'ACTIVE' },
      }),
      teacherRoleId
        ? this.prisma.user.count({
            where: {
              companyId,
              deletedAt: null,
              status: 'ACTIVE',
              roles: { some: { roleId: teacherRoleId } },
            },
          })
        : Promise.resolve(0),
      this.prisma.student.aggregate({
        where: {
          companyId,
          deletedAt: null,
          status: 'ACTIVE',
          balance: { lt: 0 },
        },
        _sum: { balance: true },
        _count: true,
      }),
      this.prisma.payment.aggregate({
        where: {
          companyId,
          status: 'COMPLETED',
          createdAt: { gte: firstOfMonth },
        },
        _sum: { amount: true },
      }),
      this.prisma.expense.aggregate({
        where: {
          companyId,
          deletedAt: null,
          date: { gte: firstOfMonth },
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
  async buildDailyReport(companyId: number): Promise<string> {
    const today = tashkentDayRange();
    const firstOfMonth = firstOfThisMonthUtc();
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
      todayPayments,
      attendanceBreakdown,
      lessonGroupsToday,
      debtorAgg,
      monthlyIncome,
      company,
    ] = await Promise.all([
      this.prisma.student.count({
        where: { companyId, deletedAt: null, status: 'ACTIVE' },
      }),
      this.prisma.student.count({
        where: {
          companyId,
          deletedAt: null,
          createdAt: { gte: today.start, lt: today.end },
        },
      }),
      this.prisma.group.count({
        where: { companyId, deletedAt: null, statusEnum: 'ACTIVE' },
      }),
      teacherRoleId
        ? this.prisma.user.count({
            where: {
              companyId,
              deletedAt: null,
              status: 'ACTIVE',
              roles: { some: { roleId: teacherRoleId } },
            },
          })
        : Promise.resolve(0),
      this.prisma.payment.aggregate({
        where: {
          companyId,
          status: 'COMPLETED',
          createdAt: { gte: today.start, lt: today.end },
        },
        _sum: { amount: true },
        _count: true,
      }),
      // Attendance.date is a PostgreSQL DATE column — compare against the
      // Tashkent calendar date directly, not the shifted tashkentDayRange
      // window. See tashkentTodayDate() for why.
      this.prisma.attendance.groupBy({
        by: ['status'],
        where: { companyId, date: todayDate },
        _count: true,
      }),
      this.prisma.attendance.groupBy({
        by: ['groupId'],
        where: { companyId, date: todayDate },
      }),
      this.prisma.student.aggregate({
        where: {
          companyId,
          deletedAt: null,
          status: 'ACTIVE',
          balance: { lt: 0 },
        },
        _sum: { balance: true },
        _count: true,
      }),
      this.prisma.payment.aggregate({
        where: {
          companyId,
          status: 'COMPLETED',
          createdAt: { gte: firstOfMonth },
        },
        _sum: { amount: true },
      }),
      this.prisma.company.findUnique({
        where: { id: companyId },
        select: { name: true },
      }),
    ]);

    const countFor = (s: 'PRESENT' | 'LATE' | 'ABSENT' | 'EXCUSED'): number =>
      attendanceBreakdown.find((r) => r.status === s)?._count ?? 0;
    const attended = countFor('PRESENT') + countFor('LATE');
    const absent = countFor('ABSENT');
    const excused = countFor('EXCUSED');
    const totalMarked = attended + absent + excused;
    const attendancePct =
      totalMarked > 0 ? Math.round((attended / totalMarked) * 100) : 0;
    const lessonsToday = lessonGroupsToday.length;

    return [
      `📊 <b>${formatDate(new Date())} — ${company?.name ?? 'Hisobot'}</b>`,
      ``,
      `<b>Bugun:</b>`,
      `• Yangi o'quvchilar: <b>${formatNumber(todayNewStudents)}</b> 🆕`,
      `• To'lovlar: <b>${formatNumber(todayPayments._count ?? 0)}</b> ta · <b>${formatSum(todayPayments._sum.amount ?? 0)}</b> 💰`,
      `• Darslar: <b>${formatNumber(lessonsToday)}</b> ta 📚`,
      `• Davomat: <b>${formatNumber(attended)}/${formatNumber(totalMarked)}</b> keldi (${attendancePct}%) · <b>${formatNumber(absent)}</b> kelmadi · <b>${formatNumber(excused)}</b> bekor ✅`,
      ``,
      `<b>Hozirgi holat:</b>`,
      `• Faol o'quvchilar: <b>${formatNumber(activeStudents)}</b> 👨‍🎓`,
      `• Faol guruhlar: <b>${formatNumber(activeGroups)}</b> (bugun dars: <b>${formatNumber(lessonsToday)}</b>) 👥`,
      `• Faol o'qituvchilar: <b>${formatNumber(activeTeachers)}</b> 👨‍🏫`,
      `• Qarzdorlar: <b>${formatNumber(debtorAgg._count)}</b> ta — <b>${formatSum(Math.abs(debtorAgg._sum.balance ?? 0))}</b> 💸`,
      ``,
      `💵 <b>Oy boshidan bugungacha tushum:</b> ${formatSum(monthlyIncome._sum.amount ?? 0)}`,
    ].join('\n');
  }
}
