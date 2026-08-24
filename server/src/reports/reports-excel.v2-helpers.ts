/**
 * Presentation primitives for the redesigned "Hisobot" Excel workbook (v2).
 * Lighter visual language than reports-excel.helpers.ts: a navy TEXT title
 * with a rule under block labels, fills only on header/total rows — no
 * full-width navy bands. Ported verbatim from the CEO-approved prototype — a
 * throwaway script that rendered the whole workbook against production data and
 * was signed off before being deleted — renamed to their permanent names.
 *
 * Palette/number-format constants are reused from reports-excel.helpers.ts —
 * only the two fills below (header row, total row) are new here.
 */
import { Worksheet, Row } from 'exceljs';
import { NAVY, SUBTLE, GREEN, RED, SOM, NUM } from './reports-excel.helpers';

export const HEAD_FILL = 'FFE8EDF5';
export const TOTAL_FILL = 'FFD5E0F0';

// Percentage-change format for the delta column. Not exported — the "p"
// (percentage-point) suffix that used to sit here was removed on purpose,
// so this is a plain percent format, identical in shape to PCT.
const DELTA = '+#,##0.0"%";-#,##0.0"%"';

function paint(cell: { fill?: unknown }, argb: string) {
  (cell as any).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function izohCell(row: Row, col: number) {
  const c = row.getCell(col);
  c.font = { italic: true, size: 9, color: { argb: SUBTLE } };
  c.alignment = { wrapText: true, vertical: 'top' };
}

/** Title (row 1) + period line (row 2) + scope line (row 3) + a blank spacer row. */
export function sheetHead(
  ws: Worksheet,
  title: string,
  periodLine: string,
  scopeLine: string,
  span: number,
): void {
  const t = ws.addRow([title]);
  t.font = { bold: true, size: 16, color: { argb: NAVY } };
  t.height = 24;
  ws.mergeCells(t.number, 1, t.number, span);
  const p = ws.addRow([periodLine]);
  p.font = { bold: true, size: 10 };
  ws.mergeCells(p.number, 1, p.number, span);
  const s = ws.addRow([scopeLine]);
  s.font = { size: 9, color: { argb: SUBTLE } };
  ws.mergeCells(s.number, 1, s.number, span);
  ws.addRow([]);
}

/** A block label with a navy rule underneath — the light-weight stand-in for a navy band. */
export function blockTitle(ws: Worksheet, label: string, span: number): void {
  ws.addRow([]);
  const r = ws.addRow([label]);
  r.font = { bold: true, size: 12, color: { argb: NAVY } };
  ws.mergeCells(r.number, 1, r.number, span);
  for (let c = 1; c <= span; c++)
    r.getCell(c).border = {
      bottom: { style: 'medium', color: { argb: NAVY } },
    };
}

/** Column header row — filled with HEAD_FILL, bold, wraps. */
export function columnHeader(ws: Worksheet, cells: string[]): Row {
  const r = ws.addRow(cells);
  r.font = { bold: true, size: 10 };
  r.eachCell((cell) => {
    paint(cell, HEAD_FILL);
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFB9C4D4' } } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
  return r;
}

/**
 * Label | current | previous | delta% | izoh — a two-period comparison row.
 *
 * No delta is rendered when either side is null — there is nothing to
 * compare a missing figure against. Percentage-valued metrics (e.g.
 * attendance rate) must NOT be run through this helper: comparing two
 * percentages produces a percentage-point delta, and the "+4.0 p" notation
 * this used to render was jargon the customer could not read. Callers with
 * a percentage metric write the row directly instead (see the prototype's
 * "Davomat foizi" row for the pattern).
 */
export function compareRow(
  ws: Worksheet,
  label: string,
  cur: number | null,
  prev: number | null,
  izoh?: string,
  opts: { sub?: boolean; inverse?: boolean } = {},
): Row {
  const both = typeof cur === 'number' && typeof prev === 'number';
  const d =
    both && prev !== 0
      ? Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10
      : null;
  const r = ws.addRow([label, cur ?? '—', prev ?? '—', d ?? '', izoh ?? '']);
  [2, 3].forEach((c) => {
    if (typeof r.getCell(c).value === 'number') r.getCell(c).numFmt = NUM;
  });
  if (opts.sub) {
    r.getCell(1).font = { size: 10, color: { argb: SUBTLE } };
    r.getCell(1).alignment = { indent: 2 };
    [2, 3].forEach(
      (c) => (r.getCell(c).font = { size: 10, color: { argb: SUBTLE } }),
    );
  }
  if (d != null) {
    const g = r.getCell(4);
    g.numFmt = DELTA;
    g.font = {
      color: { argb: (opts.inverse ? d <= 0 : d >= 0) ? GREEN : RED },
      size: 10,
    };
  }
  izohCell(r, 5);
  return r;
}

/**
 * Label | value | izoh — a single-period fact (a count, not a money amount).
 *
 * numFmt is ALWAYS the plain NUM format here, NEVER SOM — a student count
 * rendered as "−62 so'm" is a bug that already shipped once (a count is not
 * currency and must never carry a currency suffix).
 */
export function countRow(
  ws: Worksheet,
  label: string,
  value: number | string,
  izoh?: string,
  opts: { bold?: boolean; good?: boolean; bad?: boolean } = {},
): Row {
  const r = ws.addRow([label, value, '', '', izoh ?? '']);
  if (typeof r.getCell(2).value === 'number') r.getCell(2).numFmt = NUM;
  if (opts.bold) r.font = { bold: true };
  if (opts.good) r.getCell(2).font = { bold: true, color: { argb: GREEN } };
  if (opts.bad) r.getCell(2).font = { bold: true, color: { argb: RED } };
  izohCell(r, 5);
  return r;
}

/** The bottom-line total of a block — bold, TOTAL_FILL, double top border, colour by sign. */
export function headlineRow(
  ws: Worksheet,
  label: string,
  cur: number,
  prev: number | null,
  izoh: string,
): Row {
  const g = prev
    ? Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10
    : null;
  const r = ws.addRow([label, cur, prev ?? '—', g ?? '', izoh]);
  const colour = cur >= 0 ? GREEN : RED;
  r.height = 24;
  r.eachCell((cell, col) => {
    paint(cell, TOTAL_FILL);
    cell.border = { top: { style: 'double', color: { argb: NAVY } } };
    if (col <= 3) cell.font = { bold: true, size: 13, color: { argb: colour } };
  });
  r.getCell(2).numFmt = SOM;
  if (typeof r.getCell(3).value === 'number') r.getCell(3).numFmt = SOM;
  if (g != null) {
    r.getCell(4).numFmt = DELTA;
    r.getCell(4).font = { bold: true, color: { argb: g >= 0 ? GREEN : RED } };
  }
  izohCell(r, 5);
  return r;
}

/** A plain totals row — bold, TOTAL_FILL, thin top border; moneyCols get SOM, everything else NUM. */
export function totalsBar(
  ws: Worksheet,
  cells: (string | number)[],
  moneyCols: number[] = [],
): Row {
  const r = ws.addRow(cells);
  r.font = { bold: true };
  r.eachCell((c, col) => {
    paint(c, TOTAL_FILL);
    c.border = { top: { style: 'thin' } };
    if (typeof c.value === 'number')
      c.numFmt = moneyCols.includes(col) ? SOM : NUM;
  });
  return r;
}

/** "Bu varaq haqida" footer — a bullet list of interpretation notes at the bottom of a sheet. */
export function sheetFooter(
  ws: Worksheet,
  lines: string[],
  span: number,
): void {
  ws.addRow([]);
  const h = ws.addRow(['Bu varaq haqida']);
  h.font = { bold: true, size: 10, color: { argb: NAVY } };
  ws.mergeCells(h.number, 1, h.number, span);
  for (const l of lines)
    ws.addRow(['·  ' + l]).getCell(1).font = {
      size: 9,
      color: { argb: SUBTLE },
    };
}

// ---- Uzbek month labels + the salary-reliability guard -------------------

/** Uzbek month names — the report never prints an English or Cyrillic month. */
const UZ_MONTHS = [
  'Yanvar',
  'Fevral',
  'Mart',
  'Aprel',
  'May',
  'Iyun',
  'Iyul',
  'Avgust',
  'Sentabr',
  'Oktabr',
  'Noyabr',
  'Dekabr',
];

export function uzMonthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${UZ_MONTHS[m - 1]} ${y}`;
}

/**
 * Is this month's payroll complete enough to publish a profit for?
 *
 * A teacher's share of lesson revenue never runs below roughly a third; a month
 * reporting a rounding error against its lesson value has missing rate configs,
 * not a windfall. May 2026 booked 152 415 637 so'm of lessons against 33 334
 * so'm of salary and printed a 127.5 mln "profit" nobody should act on.
 *
 * Data-driven on purpose — hardcoding '2026-05' would go stale the moment a
 * second transition month appeared.
 */
export function isSalaryDataReliable(
  revenue: number,
  teacherSalary: number,
): boolean {
  if (revenue <= 0) return false;
  return teacherSalary / revenue >= 0.15;
}
