/**
 * `GET /dashboard/charts` javobi. Mijozdagi
 * `client/src/components/dashboard/dashboard-charts-types.ts` bilan
 * maydonma-maydon bir xil bo'lishi shart.
 */

/** A — moliya trendi: oyiga bitta nuqta. */
export interface ChartTrendPoint {
  /** Ko'rsatiladigan yorliq, masalan «Avg». */
  month: string;
  income: number;
  expenses: number;
  /** Kanonik sof foyda (`getMonthlyNetProfit`), kassa raqami emas. */
  profit: number;
}

/**
 * B — pul qayerga ketdi. `NetProfit` obyektining o'zi:
 * `revenue − teacherSalary − adminSalary − operatingExpenses − refunds = netProfit`.
 * «Sof foyda» kartasi ham AYNAN shu obyektdan chiqadi.
 */
export interface ChartProfitBreakdown {
  revenue: number;
  teacherSalary: number;
  adminSalary: number;
  operatingExpenses: number;
  refunds: number;
  netProfit: number;
}

/** C — o'quvchilar oqimi: oyiga bitta nuqta. */
export interface ChartStudentFlowPoint {
  month: string;
  arrived: number;
  /** Musbat son sifatida keladi; diagramma uni pastga chizadi. */
  left: number;
  net: number;
}

/** D — davomat: haftaga bitta nuqta. */
export interface ChartAttendancePoint {
  label: string;
  /** 0–100. */
  rate: number;
}

export interface DashboardChartsResponse {
  money: {
    trend: ChartTrendPoint[];
    breakdown: ChartProfitBreakdown | null;
  } | null;
  students: ChartStudentFlowPoint[] | null;
  attendance: ChartAttendancePoint[] | null;
  /** Yiqilgan diagrammalar: `['money']` kabi. */
  failed: string[];
}
