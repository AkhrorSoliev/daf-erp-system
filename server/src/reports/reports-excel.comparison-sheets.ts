/**
 * Comparison sheet builders for the "Moliyaviy hisobot" workbook — the
 * period-over-period + multi-year half:
 *   - "Taqqoslash": current period vs one or more comparison bases (previous
 *     equal-length period / same period last year / a user-picked custom range),
 *     covering ALL areas (Moliya / O'quvchilar / Davomat / Lidlar) grouped into
 *     sections. One column-pair (value + Δ%) per requested basis.
 *   - "Yillar kesimida": one column per calendar year (oldest → newest) with a
 *     trailing YoY Δ%, growing automatically as years accumulate.
 *
 * Column headers are the ACTUAL period ("06.2026" / "05.2026"), never a generic
 * "Joriy / Oldingi davr" (CEO's explicit request — see periodTag). Dedicated
 * sheets so the statement / line-item sheets stay single-period and uncluttered.
 * Every figure comes from already-delegated ReportsService methods; defensive —
 * a `null` window renders "—" per cell instead of a broken workbook.
 */
import { Workbook, Worksheet } from 'exceljs';
import {
  NUM,
  PCT,
  GREEN,
  RED,
  SUBTLE,
  sheetTitle,
  sectionHeader,
  tableHeader,
  sheetNotes,
  dataBar,
} from './reports-excel.helpers';
import { growthPct } from '../common/finance/period-helpers';

/** The per-period datasets a comparison column draws from. */
export interface Sources {
  overview: any | null;
  attendance: any | null;
  leads: any | null;
}

/** One comparison basis: a labelled window + its datasets (null on failure). */
export interface ComparisonInput extends Sources {
  label: string; // basis name: "Oldingi davr" | "O'tgan yil" | "Maxsus davr"
  tag: string; // header period tag, e.g. "05.2026" (see periodTag)
  sublabel: string; // full date range, e.g. "01.05.2026 — 31.05.2026"
}

/**
 * Column header for a window: "MM.YYYY" when it is a single calendar month
 * (May → "05.2026"), the year when it is a full calendar year, else a compact
 * "DD.MM.YYYY—DD.MM.YYYY" range. Lets every two-period comparison read as the
 * actual period (06.2026 / 05.2026) instead of "Joriy / Oldingi davr".
 */
export function periodTag(start: string, end: string): string {
  const [sy, sm, sd] = start.split('-');
  const [ey, em, ed] = end.split('-');
  if (sy === ey && sm === em) return `${sm}.${sy}`;
  if (sy === ey && sm === '01' && sd === '01' && em === '12' && ed === '31') {
    return sy;
  }
  return `${sd}.${sm}.${sy}—${ed}.${em}.${ey}`;
}

interface Metric {
  label: string;
  pick: (s: Sources) => number;
  percent?: boolean; // value cells rendered as % (e.g. davomat)
  inverse?: boolean; // a rise is BAD (cost/debt): +Δ% red, −Δ% green
  izoh?: string;
}

interface Section {
  title: string;
  metrics: Metric[];
}

// Only genuinely PERIOD-SCOPED metrics — snapshot figures (jami qarz, faol
// o'quvchilar) are intentionally excluded here (they don't differ across two
// past periods; they live on the statement/summary sheets as "joriy holat").
const SECTIONS: Section[] = [
  {
    title: 'Moliya',
    metrics: [
      { label: 'Tushum (kassa)', pick: (s) => s.overview?.income?.actual ?? 0, izoh: "Davrda qabul qilingan to'lovlar." },
      { label: 'Umumiy chiqim (xarajat + oylik)', pick: (s) => (s.overview?.expenses ?? 0) + (s.overview?.salary?.paid ?? 0), inverse: true },
      { label: 'Sof foyda', pick: (s) => s.overview?.netProfit ?? 0, izoh: 'Kassa asosida (ekrandagi dashboard bilan bir xil).' },
      { label: 'Hisoblangan daromad (darslar)', pick: (s) => s.overview?.income?.billed ?? 0, izoh: 'Darslar uchun real hisoblab yozilgan (accrual).' },
      { label: "O'rtacha to'lov", pick: (s) => s.overview?.avgPayment ?? 0 },
    ],
  },
  {
    title: "O'quvchilar",
    metrics: [
      { label: "Yangi o'quvchilar", pick: (s) => s.overview?.newStudentCount ?? 0 },
      { label: "To'lov qilganlar", pick: (s) => s.overview?.ltvPayerCount ?? 0 },
    ],
  },
  {
    title: 'Davomat',
    metrics: [
      { label: "O'rtacha davomat", pick: (s) => s.attendance?.overallRate ?? 0, percent: true, izoh: 'Sababli (EXCUSED) hisobga olinmagan.' },
    ],
  },
  {
    title: 'Marketing / Lidlar',
    metrics: [
      { label: 'Yangi lidlar', pick: (s) => (s.leads?.funnel ?? []).reduce((a: number, f: any) => a + (f?.count ?? 0), 0), izoh: 'Davrda kelgan lidlar (voronka jami).' },
      { label: 'Marketing xarajati', pick: (s) => s.overview?.marketingExpenses ?? 0, inverse: true },
    ],
  },
];

function emptyNote(ws: Worksheet): void {
  const r = ws.addRow(["Ma'lumot hozircha mavjud emas."]);
  r.getCell(1).font = { italic: true, color: { argb: SUBTLE } };
}

// ---- Sheet: Taqqoslash (period-over-period, all sections) ----
export function comparisonSheet(
  wb: Workbook,
  current: Sources,
  currentTag: string,
  comparisons: ComparisonInput[],
  period: string,
) {
  const ws = wb.addWorksheet('Taqqoslash');
  const nCols = 2 + comparisons.length * 2 + 1; // label + current + (val,Δ%)* + Izoh
  ws.columns = [
    { width: 34 },
    { width: 16 },
    ...comparisons.flatMap(() => [{ width: 16 }, { width: 14 }]),
    { width: 42 },
  ];
  sheetTitle(ws, 'Taqqoslash — davrlar kesimida', period, nCols);
  if (!current.overview || comparisons.length === 0) {
    emptyNote(ws);
    return;
  }

  // Header = the actual period (06.2026 / 05.2026); sub-row spells out the basis
  // + exact dates each column covers.
  const headerCells = ['Ko‘rsatkich', currentTag];
  comparisons.forEach((c) => headerCells.push(c.tag, 'O‘zgarish %'));
  headerCells.push('Izoh');
  tableHeader(ws, headerCells);

  const subCells: string[] = ['', `Joriy · ${period}`];
  comparisons.forEach((c) => subCells.push(`${c.label} · ${c.sublabel}`, ''));
  subCells.push('');
  const pr = ws.addRow(subCells);
  pr.eachCell((cell) => {
    cell.font = { italic: true, size: 9, color: { argb: SUBTLE } };
    cell.alignment = { wrapText: true, vertical: 'top' };
  });

  const izohCol = nCols;
  const renderMetric = (m: Metric) => {
    const curVal = m.pick(current);
    const cells: (string | number)[] = [m.label, curVal];
    comparisons.forEach((c) => {
      if (!c.overview) {
        cells.push('—', '—');
        return;
      }
      const prevVal = m.pick(c);
      cells.push(prevVal, growthPct(curVal, prevVal));
    });
    cells.push(m.izoh ?? '');
    const r = ws.addRow(cells);
    const valFmt = m.percent ? PCT : NUM;
    r.getCell(2).numFmt = valFmt;
    comparisons.forEach((_, i) => {
      const valCol = 3 + i * 2;
      const pctCol = 4 + i * 2;
      if (typeof r.getCell(valCol).value === 'number') r.getCell(valCol).numFmt = valFmt;
      const pctCell = r.getCell(pctCol);
      if (typeof pctCell.value === 'number') {
        pctCell.numFmt = PCT;
        const g = pctCell.value;
        const good = m.inverse ? g <= 0 : g >= 0;
        pctCell.font = { color: { argb: good ? GREEN : RED } };
      }
    });
    const iz = r.getCell(izohCol);
    iz.font = { italic: true, size: 9, color: { argb: SUBTLE } };
    iz.alignment = { wrapText: true, vertical: 'top' };
  };

  SECTIONS.forEach((sec) => {
    sectionHeader(ws, sec.title, nCols);
    sec.metrics.forEach(renderMetric);
  });

  const notes = [
    'Ustun sarlavhasi — davr (oy.yil, masalan 06.2026); ostidagi kichik yozuvda qaysi taqqoslash asosi va aniq sanalar.',
    'Barcha bo‘limlar — Moliya, O‘quvchilar, Davomat, Lidlar — joriy davr taqqoslash davr(lar)i bilan solishtiriladi.',
    '"O‘zgarish %" — joriy davrning taqqoslash davriga nisbatan o‘sishi/kamayishi. Daromad/foyda/o‘quvchi/davomat uchun yashil = yaxshi; chiqim/marketing uchun yashil = kamaygan (yaxshi), qizil = oshgan.',
  ];
  comparisons.forEach((c) => notes.push(`"${c.tag}" ustuni — ${c.label}, ${c.sublabel}.`));
  notes.push('Joriy holat ko‘rsatkichlari (jami qarz, faol o‘quvchilar) bu yerda YO‘Q — ular ikki o‘tgan davr uchun bir xil bo‘lgani sabab; ular "Asosiy xulosa"/"Balans" bo‘limlarida.');
  notes.push('Taqqoslash davri "systemStartDate"dan oldin bo‘lsa, o‘sha davr uchun ma‘lumot bo‘lmasligi mumkin ("—" yoki 0).');
  sheetNotes(ws, notes, nCols);
}

// ---- Sheet: Yillar kesimida (multi-year) ----
interface YearMetric {
  label: string;
  pick: (y: any) => number;
  inverse?: boolean;
}

const YEAR_METRICS: YearMetric[] = [
  { label: 'Tushum', pick: (y) => y?.income ?? 0 },
  { label: 'Chiqim', pick: (y) => y?.expenses ?? 0, inverse: true },
  { label: 'Foyda', pick: (y) => y?.profit ?? 0 },
  { label: "Yangi o'quvchilar", pick: (y) => y?.newStudents ?? 0 },
  { label: "To'lov qilganlar", pick: (y) => y?.payerCount ?? 0 },
  { label: "O'rtacha to'lov", pick: (y) => y?.avgPayment ?? 0 },
];

export function yearlyTrendSheet(wb: Workbook, yearly: any[]) {
  const ws = wb.addWorksheet('Yillar kesimida');
  const rows = Array.isArray(yearly) ? yearly : [];
  const years = rows.map((y) => y.year);
  const nCols = 1 + years.length + 1; // label + years + YoY Δ%
  ws.columns = [
    { width: 26 },
    ...years.map(() => ({ width: 16 })),
    { width: 18 },
  ];
  const sub = years.length ? `${years[0]} — ${years[years.length - 1]}` : '';
  sheetTitle(ws, 'Yillar kesimida', sub, Math.max(nCols, 2));
  if (rows.length === 0) {
    emptyNote(ws);
    return;
  }

  const header = tableHeader(ws, ['Ko‘rsatkich', ...years.map(String), 'Yillik o‘zgarish %']);
  const lastYearCol = 1 + years.length;

  YEAR_METRICS.forEach((m) => {
    const vals = rows.map((y) => m.pick(y));
    const last = vals[vals.length - 1] ?? 0;
    const prev = vals.length > 1 ? vals[vals.length - 2] ?? 0 : 0;
    const yoy = vals.length > 1 ? growthPct(last, prev) : null;
    const r = ws.addRow([m.label, ...vals, yoy ?? '—']);
    for (let c = 2; c <= lastYearCol; c++) {
      if (typeof r.getCell(c).value === 'number') r.getCell(c).numFmt = NUM;
    }
    const yoyCell = r.getCell(nCols);
    if (typeof yoyCell.value === 'number') {
      yoyCell.numFmt = PCT;
      const good = m.inverse ? yoyCell.value <= 0 : yoyCell.value >= 0;
      yoyCell.font = { color: { argb: good ? GREEN : RED } };
    }
    if (years.length >= 2) {
      const startLetter = ws.getColumn(2).letter;
      const endLetter = ws.getColumn(lastYearCol).letter;
      dataBar(ws, `${startLetter}${r.number}:${endLetter}${r.number}`);
    }
  });

  sheetNotes(ws, [
    'Har bir yil bo‘yicha tushum / chiqim / foyda / o‘quvchi ko‘rsatkichlari (yillik jami).',
    '"Yillik o‘zgarish %" — oxirgi yilning oldingi yilga nisbatan o‘sishi (yashil = o‘sish, chiqim uchun teskari).',
    'Ustundagi rangli chiziq — o‘sha ko‘rsatkichning yillar bo‘yicha kattaligini taqqoslaydi (har qator alohida).',
    'Yillar o‘tgani sari yangi ustunlar avtomatik qo‘shiladi; hozircha faqat ma‘lumot bor yillar (oxirgi 5 yilgacha).',
  ], Math.max(nCols, 2));
}
