import type { ChartProfitBreakdown } from "./dashboard-charts-types";

export interface BreakdownRow {
  key: "teacherSalary" | "adminSalary" | "operatingExpenses" | "refunds" | "netProfit";
  label: string;
  amount: number;
  /** Tushumga nisbatan ulush, 0–100. */
  pct: number;
  /** Xarajatmi yoki qolgan foydami — rang shuni belgilaydi. */
  kind: "cost" | "profit";
}

/**
 * «Pul qayerga ketdi» diagrammasining qatorlari.
 *
 * Manba — `getMonthlyNetProfit` obyekti, ya'ni «Sof foyda» kartasi bilan
 * bitta. Ulush TUSHUMGA nisbatan hisoblanadi, chunki savol «kelgan pulning
 * qanchasi qayerga ketdi?» degani; xarajatlar yig'indisiga nisbatan hisoblash
 * foydani umuman ko'rsatmasdi.
 *
 * Nol qiymatli qator CHIZILMAYDI — bosh sahifada nollar bilan joy
 * to'ldirilmaydi. Zarar bo'lgan oyda `netProfit` manfiy bo'ladi: u ham
 * ko'rsatiladi (foiz esa 0 ga tushmaydi, chunki u yolg'on bo'lardi).
 */
export function breakdownRows(b: ChartProfitBreakdown): BreakdownRow[] {
  const base = b.revenue > 0 ? b.revenue : 0;
  const pct = (n: number) => (base > 0 ? Math.round((n / base) * 100) : 0);

  const rows: BreakdownRow[] = [
    { key: "teacherSalary", label: "Ustoz oyligi", amount: b.teacherSalary, pct: pct(b.teacherSalary), kind: "cost" },
    { key: "adminSalary", label: "Xodim oyligi", amount: b.adminSalary, pct: pct(b.adminSalary), kind: "cost" },
    { key: "operatingExpenses", label: "Operatsion xarajat", amount: b.operatingExpenses, pct: pct(b.operatingExpenses), kind: "cost" },
    { key: "refunds", label: "Qaytarishlar", amount: b.refunds, pct: pct(b.refunds), kind: "cost" },
    { key: "netProfit", label: "Qolgani — sof foyda", amount: b.netProfit, pct: pct(b.netProfit), kind: "profit" },
  ];

  return rows.filter((r) => r.amount !== 0);
}
