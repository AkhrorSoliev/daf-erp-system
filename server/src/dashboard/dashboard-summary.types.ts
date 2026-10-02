import type { DebtSplit } from '../reports/debt-split';

/**
 * `GET /dashboard/summary` javobi. Mijozdagi
 * `client/src/components/dashboard/dashboard-summary-types.ts` bilan
 * MAYDONMA-MAYDON bir xil bo'lishi shart — biri o'zgarsa, ikkinchisi ham.
 */

export interface DashboardMoney {
  monthIncome: number;
  paymentCount: number;
  expectedMonthEnd: number;
  /**
   * «Bu oy hisoblandi» (ADR-0058): shu oyga yozilgan oylik hisoblar va
   * shundan to'langani. 2026-09 dan oldingi oyda `null` — u holda karta
   * `expectedMonthEnd` ni ko'rsatadi.
   */
  monthCharges: {
    charged: number;
    paid: number;
    unpaid: number;
    paidPct: number | null;
  } | null;
  netProfit: number;
  netProfitBasis: 'recognized' | 'cash';
  /**
   * Qarz — ikki alohida raqam, hech qayerda qo'shilmaydi (ADR-0059):
   * «O'qiyotganlar» (shu oy / eski qarz) va «O'qimayotganlar».
   */
  debt: DebtSplit;
}

export interface DashboardPeople {
  activeStudents: number;
  newThisMonth: number;
  /** Departures confirmed this Tashkent month (ADR-0035). */
  leftThisMonth: number;
  /** Stopped this month, not back yet, grace period still running. */
  leftPending: number;
  /** Days each kind of stop waits for a return (ADR-0035). */
  leftGraceDays: { LEFT_GROUP: number; FROZEN: number };
  activeGroups: number;
  attendancePct: number;
  /** Filial tanlanmagan bo'lsa `null` — jadval bitta filialga bog'liq. */
  todayLessons: number | null;
}

export interface DashboardTopDebtor {
  id: number;
  name: string;
  balance: number;
}

export interface DashboardAttention {
  todayAbsentees: number;
  brokenPromises: number;
  removalQueue: number;
  topDebtors: DashboardTopDebtor[];
}

export interface DashboardNextLesson {
  groupId: string;
  groupName: string;
  startTime: string;
  endTime: string;
  teacherName: string | null;
  roomName: string | null;
  studentCount: number;
}

export interface DashboardSummaryResponse {
  money: DashboardMoney | null;
  people: DashboardPeople | null;
  attention: DashboardAttention | null;
  /**
   * BUGUNGI KUNNING BARCHA darslari, vaqt bo'yicha saralangan — «keyingi 5 ta»
   * emas. Qaysi dars «keyingi» ekani mijozning soatiga bog'liq, server soati
   * boshqa mintaqada bo'lishi mumkin. Mijozdagi `pickNextLessons` tanlaydi.
   * Filial tanlanmagan bo'lsa `null`.
   */
  nextLessons: DashboardNextLesson[] | null;
  /** Yiqilgan bo'limlar: `['money']` kabi. Bo'sh bo'lsa hammasi joyida. */
  failed: string[];
}
