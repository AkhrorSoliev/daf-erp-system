/**
 * «Oylar» (month-by-month) and «Filiallar» (per-branch) sheets — the two
 * trend views of the redesigned "Hisobot" Excel workbook (v2).
 *
 * Ported block-for-block from the CEO-approved prototype — a throwaway script
 * that rendered these two sheets ("2. OYLAR" and "3. FILIALLAR") against
 * production data and was signed off line by line before being deleted. Do not
 * reorder columns or reword labels: this layout IS the approval, and the tests
 * below index cells positionally.
 *
 * The one thing both sheets exist to fix: readers kept mistaking a single
 * "revenue" column for cash actually collected. Every row now carries BOTH
 * «O'tilgan darslar qiymati» (lesson value) and «Kassaga tushgan pul» (cash
 * received) side by side — genuinely different numbers (production July:
 * 173 783 991 vs 170 378 987) — and the footer says explicitly that they
 * need not match.
 *
 * Money columns intentionally use the plain NUM format here, not SOM — this
 * mirrors the prototype exactly (both the per-row cells and the Filiallar
 * totals bar), not an oversight to "fix".
 */
import { Workbook, Row } from 'exceljs';
import { NUM, PCT, GREEN, RED, SUBTLE } from './reports-excel.helpers';
import {
  sheetHead,
  columnHeader,
  totalsBar,
  sheetFooter,
  uzMonthLabel,
  isSalaryDataReliable,
} from './reports-excel.v2-helpers';

function izohCell(row: Row, col: number): void {
  const c = row.getCell(col);
  c.font = { italic: true, size: 9, color: { argb: SUBTLE } };
  c.alignment = { wrapText: true, vertical: 'top' };
}

export interface MonthRow {
  month: string;
  recognized: number;
  cashIn: number;
  teacherSalary: number;
  operatingExpenses: number;
  netProfit: number;
  ownProfit: number;
  closingDebt: number | null;
  recovered: number | null;
  recoveryRate: number | null;
}

/**
 * A month whose teacher salary is under 15% of its lesson revenue has
 * missing rate configs, not a windfall (see `isSalaryDataReliable`). Such a
 * month prints '—' for salary/net-profit/own-profit but keeps the real
 * lesson-value and cash figures — the data IS real, only payroll is not.
 */
export function monthsSheet(wb: Workbook, rows: MonthRow[], scopeLine: string): void {
  const ws = wb.addWorksheet('Oylar');
  ws.columns = [
    { width: 15 }, { width: 20 }, { width: 19 }, { width: 17 }, { width: 15 }, { width: 17 },
    { width: 17 }, { width: 17 }, { width: 15 }, { width: 13 }, { width: 34 },
  ];
  sheetHead(ws, 'OYMA-OY', "Tizim boshlanishidan hozirgacha (tanlangan davrdan qat'i nazar)", scopeLine, 11);
  const h = columnHeader(ws, ['Oy', "O'tilgan darslar qiymati", 'Kassaga tushgan pul', 'Ustoz oyligi',
    'Xarajat', 'SOF FOYDA', "Oyning o'z foydasi", 'Oy oxiridagi qarz', 'Undirildi', 'Undirish %', 'Izoh']);
  const first = h.number + 1;

  for (const row of rows) {
    const ok = isSalaryDataReliable(row.recognized, row.teacherSalary);
    const r = ws.addRow([
      uzMonthLabel(row.month),
      row.recognized,
      row.cashIn,
      ok ? row.teacherSalary : '—',
      row.operatingExpenses,
      ok ? row.netProfit : '—',
      ok ? row.ownProfit : '—',
      row.closingDebt ?? '—',
      row.recovered ?? '—',
      row.recoveryRate ?? '—',
      ok ? '' : "Ustoz oyligi to'liq hisoblanmagan (o'tish davri)",
    ]);
    [2, 3, 4, 5, 6, 7, 8, 9].forEach((c) => {
      if (typeof r.getCell(c).value === 'number') r.getCell(c).numFmt = NUM;
    });
    if (typeof r.getCell(10).value === 'number') r.getCell(10).numFmt = PCT;
    r.getCell(6).font = { bold: true };
    if (typeof r.getCell(7).value === 'number') {
      r.getCell(7).font = { bold: true, color: { argb: (r.getCell(7).value as number) >= 0 ? GREEN : RED } };
    }
    izohCell(r, 11);
  }

  const last = ws.rowCount;
  ws.addConditionalFormatting({
    ref: `F${first}:F${last}`,
    rules: [{
      type: 'colorScale',
      cfvo: [{ type: 'min' }, { type: 'max' }],
      color: [{ argb: 'FFF8C9C6' }, { argb: 'FF9FD8AE' }],
      priority: 1,
    }],
  } as any);
  ws.views = [{ state: 'frozen', ySplit: h.number }];

  sheetFooter(ws, [
    "«O'tilgan darslar qiymati» — shu oy o'tilgan darslar puli. «Kassaga tushgan pul» — shu oy kassaga real kirgan pul. Ular teng bo'lishi shart emas.",
    "«SOF FOYDA» — oyda ishlab topilgan natija. «Oyning o'z foydasi» — o'sha oyning o'z puli o'z xarajatini qoplaganmi.",
    "«—» belgisi: o'sha oyda ustoz oyligi to'liq hisoblanmagan (o'tish davri) — foyda chiqarilmadi.",
    "Qarz ustunlari muzlatilgan: oy oxirida qanday bo'lsa shundayligicha qoladi.",
  ], 11);
}

export interface BranchRow {
  branchName: string;
  recognized: number;
  cashIn: number;
  teacherSalary: number;
  operatingExpenses: number;
  refunds: number;
  netProfit: number;
  debt: number;
  inGroup: number;
}

export function branchesSheet(
  wb: Workbook,
  rows: BranchRow[],
  periodLine: string,
  scopeLine: string,
): void {
  const ws = wb.addWorksheet('Filiallar');
  ws.columns = [
    { width: 24 }, { width: 20 }, { width: 19 }, { width: 17 }, { width: 15 },
    { width: 15 }, { width: 17 }, { width: 15 }, { width: 16 },
  ];
  sheetHead(ws, 'FILIALLAR', periodLine, scopeLine, 9);
  const h = columnHeader(ws, ['Filial', "O'tilgan darslar qiymati", 'Kassaga tushgan pul', 'Ustoz oyligi',
    'Xarajat', 'Qaytarilgan', 'SOF FOYDA', 'Qarz (hozir)', "Guruhda o'qiyapti"]);

  const totals = [0, 0, 0, 0, 0, 0, 0, 0];
  for (const row of rows) {
    const values = [row.recognized, row.cashIn, row.teacherSalary, row.operatingExpenses,
      row.refunds, row.netProfit, row.debt, row.inGroup];
    values.forEach((v, i) => (totals[i] += v));
    const r = ws.addRow([row.branchName, ...values]);
    [2, 3, 4, 5, 6, 7, 8, 9].forEach((c) => (r.getCell(c).numFmt = NUM));
    r.getCell(7).font = { bold: true };
  }
  totalsBar(ws, ['Jami', ...totals]);
  ws.views = [{ state: 'frozen', ySplit: h.number }];

  sheetFooter(ws, [
    "«O'tilgan darslar qiymati» — o'tilgan darslar puli; «Kassaga tushgan pul» — real kirgan pul. Ular teng bo'lishi shart emas.",
    "Bitta ustoz bitta filialda dars o'tadi — oyligi to'liq o'sha filialga yoziladi.",
    "Filiallar yig'indisi «Xulosa» varag'idagi jami raqamga teng.",
  ], 9);
}
