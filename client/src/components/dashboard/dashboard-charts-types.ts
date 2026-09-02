/**
 * `GET /dashboard/charts` javobi — `server/src/dashboard/dashboard-charts.types.ts`
 * bilan maydonma-maydon bir xil bo'lishi shart.
 */

export interface ChartTrendPoint {
  month: string;
  income: number;
  expenses: number;
  /** Kanonik sof foyda, kassa raqami emas. */
  profit: number;
}

/**
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

export interface ChartStudentFlowPoint {
  month: string;
  arrived: number;
  /** Musbat son; diagramma uni pastga chizadi. */
  left: number;
  net: number;
}

export interface ChartAttendancePoint {
  label: string;
  /** 0–100. */
  rate: number;
}

export interface DashboardCharts {
  money: {
    trend: ChartTrendPoint[];
    breakdown: ChartProfitBreakdown | null;
  } | null;
  students: ChartStudentFlowPoint[] | null;
  attendance: ChartAttendancePoint[] | null;
  failed: string[];
}
