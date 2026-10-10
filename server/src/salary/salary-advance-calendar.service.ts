import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  addMonthsToMonthKey,
  tashkentMonthKey,
  tashkentMonthRangeUtc,
} from '../common/date/tashkent';
import { resolveMonthlyScope } from './shared/resolve-monthly-scope';

/** Avans berilgan bitta kun. */
export interface AdvanceCalendarDay {
  date: string; // "YYYY-MM-DD"
  total: number;
  count: number;
  cash: number;
  card: number;
}

/** Bitta avans qatori — kun panelida shu ko'rsatiladi. */
export interface AdvanceCalendarRow {
  id: string;
  date: string;
  amount: number;
  paymentMethod: 'CASH' | 'CARD';
  description: string;
  createdAt: Date;
  /** Bu avans allaqachon bitta oylik to'loviga hisoblangan (qulflangan). */
  settled: boolean;
  /** Qaysi oylik davriga hisoblangani — hisoblanmagan bo'lsa `null`. */
  settledPeriodStart: Date | null;
  settledPeriodEnd: Date | null;
  /**
   * Qaysi oyning oyligidan ushlanadi (`YYYY-MM`): hisoblangan avansda — uni
   * ushlagan to'lovning oyi, hisoblanmaganida — o'z oyidan boshlab shu xodimga
   * hali oylik hisoblanmagan birinchi oy (B3 §2.6).
   */
  deductMonth: string;
  user: {
    id: number;
    firstName: string;
    lastName: string;
    roles: { id: number; name: string }[];
  };
  createdBy: { id: number; firstName: string; lastName: string } | null;
}

export interface AdvanceCalendarTotals {
  total: number;
  count: number;
  daysWithAdvances: number;
  employeeCount: number;
  maxDay: { date: string; total: number } | null;
  /**
   * «Oyliklar» jadvalidagi «Avans» JAMI'siga TUSHMAYDIGAN avanslar: oluvchi
   * o'qituvchi ham emas, global FIXED_MONTHLY konfiguratsiyasi ham yo'q.
   * Ikki raqam farq qilsa, farq yashirin qolmasligi uchun.
   */
  outsideRoster: { count: number; total: number };
}

/**
 * `@db.Date` ustuni sof kalendar sana bo'lib UTC yarim tunida saqlanadi —
 * shuning uchun UTC qismlari aynan Toshkent kalendar kunini beradi. Mahalliy
 * vaqtga o'tkazish bir kunlik siljish keltirib chiqaradi, shuning uchun
 * `toISOString` ishlatiladi.
 */
function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * «Avanslar» tabi — tanlangan oydagi TEACHER_ADVANCE xarajatlarini kun
 * bo'yicha guruhlab qaytaradi. Butun oy bitta javobda ketadi (oyda odatda
 * 10–40 ta avans), shuning uchun kunni bosganda qo'shimcha so'rov kerak emas.
 *
 * Oy chegarasi va filial qamrovi `resolveMonthlyScope`dan olinadi — bu bilan
 * tab «Oyliklar» jadvali bilan bir xil oy floor'i va bir xil filial qoidasida
 * bo'ladi. Filial qamrovi OLUVCHI xodimning filiali bo'yicha (`Expense.branchId`
 * emas), chunki `getMonthly`dagi «Avans» ustuni ham shunday qamraladi — ikki xil
 * predikat bitta sahifada ikki xil raqam bergan bo'lardi.
 */
@Injectable()
export class SalaryAdvanceCalendarService {
  constructor(private prisma: PrismaService) {}

  async getCalendar(
    query: { month?: string; branchId?: number },
    companyId: number,
    performedById: number,
  ) {
    const scope = await resolveMonthlyScope(
      this.prisma,
      query,
      companyId,
      performedById,
    );
    const { month, floorMonth, monthStart, nextMonthStart, branchId, blocked } =
      scope;

    // Filialga bog'langan, lekin filiali noma'lum chaqiruvchi — hech nima
    // ko'rmaydi. Pul yo'llari fail-closed bo'lishi shart.
    if (blocked) {
      return {
        month,
        floorMonth,
        days: [] as AdvanceCalendarDay[],
        totals: {
          total: 0,
          count: 0,
          daysWithAdvances: 0,
          employeeCount: 0,
          maxDay: null,
          outsideRoster: { count: 0, total: 0 },
        } as AdvanceCalendarTotals,
        advances: [] as AdvanceCalendarRow[],
      };
    }

    const expenses = await this.prisma.expense.findMany({
      where: {
        companyId,
        category: 'TEACHER_ADVANCE',
        deletedAt: null,
        relatedUserId: { not: null },
        date: { gte: monthStart, lt: nextMonthStart },
        ...(branchId !== undefined && {
          relatedUser: { branches: { some: { branchId } } },
        }),
      },
      select: {
        id: true,
        amount: true,
        date: true,
        paymentMethod: true,
        description: true,
        createdAt: true,
        settledBySalaryPaymentId: true,
        settledBySalaryPayment: {
          select: { periodStart: true, periodEnd: true },
        },
        relatedUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            roles: { select: { role: { select: { id: true, name: true } } } },
          },
        },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });

    // `relatedUserId: { not: null }` filtri bor, lekin Prisma turi baribir
    // nullable — `!` o'rniga flatMap bilan xavfsiz tozalaymiz.
    const advances: AdvanceCalendarRow[] = expenses.flatMap((e) =>
      e.relatedUser
        ? [
            {
              id: e.id,
              date: dayKey(e.date),
              amount: e.amount,
              paymentMethod: e.paymentMethod as 'CASH' | 'CARD',
              description: e.description,
              createdAt: e.createdAt,
              settled: e.settledBySalaryPaymentId !== null,
              settledPeriodStart: e.settledBySalaryPayment?.periodStart ?? null,
              settledPeriodEnd: e.settledBySalaryPayment?.periodEnd ?? null,
              // `periodStart` is a Tashkent-midnight instant; `Expense.date` is
              // a date-only column, so its UTC slice is already the day. An
              // unsettled advance's month is corrected below.
              deductMonth: e.settledBySalaryPayment
                ? tashkentMonthKey(e.settledBySalaryPayment.periodStart)
                : dayKey(e.date).slice(0, 7),
              user: {
                id: e.relatedUser.id,
                firstName: e.relatedUser.firstName,
                lastName: e.relatedUser.lastName,
                roles: e.relatedUser.roles.map((r) => r.role),
              },
              createdBy: e.createdBy,
            },
          ]
        : [],
    );

    await this.rollUnsettledForward(advances, companyId, month);

    const byDay = new Map<string, AdvanceCalendarDay>();
    const employees = new Set<number>();
    let total = 0;

    for (const a of advances) {
      total += a.amount;
      employees.add(a.user.id);
      const day = byDay.get(a.date) ?? {
        date: a.date,
        total: 0,
        count: 0,
        cash: 0,
        card: 0,
      };
      day.total += a.amount;
      day.count += 1;
      if (a.paymentMethod === 'CARD') day.card += a.amount;
      else day.cash += a.amount;
      byDay.set(a.date, day);
    }

    const days = [...byDay.values()].sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    const maxDay = days.reduce<{ date: string; total: number } | null>(
      (best, d) =>
        best === null || d.total > best.total
          ? { date: d.date, total: d.total }
          : best,
      null,
    );

    // Oylik ro'yxati = o'chirilmagan O'qituvchilar ∪ global FIXED_MONTHLY
    // konfiguratsiyasi bor no-o'qituvchi xodimlar (getMonthly + computeStaff).
    // Shu ikkalasiga ham kirmagan oluvchi «Oyliklar» JAMI'sida ko'rinmaydi.
    const outsideRoster = { count: 0, total: 0 };
    const nonTeacherIds = [
      ...new Set(
        advances
          .filter((a) => !a.user.roles.some((r) => r.name === 'Teacher'))
          .map((a) => a.user.id),
      ),
    ];
    if (nonTeacherIds.length > 0) {
      const configs = await this.prisma.employeeSalaryConfig.findMany({
        where: {
          companyId,
          groupId: null,
          salaryType: 'FIXED_MONTHLY',
          userId: { in: nonTeacherIds },
        },
        select: { userId: true },
      });
      const withConfig = new Set(configs.map((c) => c.userId));
      for (const a of advances) {
        const isTeacher = a.user.roles.some((r) => r.name === 'Teacher');
        if (!isTeacher && !withConfig.has(a.user.id)) {
          outsideRoster.count += 1;
          outsideRoster.total += a.amount;
        }
      }
    }

    return {
      month,
      floorMonth,
      days,
      totals: {
        total,
        count: advances.length,
        daysWithAdvances: days.length,
        employeeCount: employees.size,
        maxDay,
        outsideRoster,
      },
      advances,
    };
  }

  /**
   * An unsettled advance comes out of the first payroll that has not been
   * calculated yet: when its own month already has a non-cancelled payment for
   * that person (the advance was entered after the cron, or did not fit and
   * rolled over), the next payout that nets it is a later month.
   */
  private async rollUnsettledForward(
    advances: AdvanceCalendarRow[],
    companyId: number,
    month: string,
  ): Promise<void> {
    const unsettled = advances.filter((a) => !a.settled);
    if (unsettled.length === 0) return;

    const payments = await this.prisma.salaryPayment.findMany({
      where: {
        companyId,
        userId: { in: [...new Set(unsettled.map((a) => a.user.id))] },
        status: { not: 'CANCELLED' },
        periodStart: { gte: tashkentMonthRangeUtc(month).gte },
      },
      select: { userId: true, periodStart: true },
    });
    const calculated = new Map<number, Set<string>>();
    for (const p of payments) {
      const months = calculated.get(p.userId) ?? new Set<string>();
      months.add(tashkentMonthKey(p.periodStart));
      calculated.set(p.userId, months);
    }

    for (const a of unsettled) {
      const months = calculated.get(a.user.id);
      while (months?.has(a.deductMonth)) {
        a.deductMonth = addMonthsToMonthKey(a.deductMonth, 1);
      }
    }
  }
}
