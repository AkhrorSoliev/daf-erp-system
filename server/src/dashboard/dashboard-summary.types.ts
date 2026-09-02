/**
 * `GET /dashboard/summary` javobi. Mijozdagi
 * `client/src/components/dashboard/dashboard-summary-types.ts` bilan
 * MAYDONMA-MAYDON bir xil bo'lishi shart — biri o'zgarsa, ikkinchisi ham.
 */

export interface DashboardMoney {
  monthIncome: number;
  paymentCount: number;
  expectedMonthEnd: number;
  netProfit: number;
  netProfitBasis: 'recognized' | 'cash';
  debt: { total: number; count: number };
}

export interface DashboardPeople {
  activeStudents: number;
  newThisMonth: number;
  leftThisMonth: number;
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
