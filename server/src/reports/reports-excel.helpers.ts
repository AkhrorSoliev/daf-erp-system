/**
 * Presentation primitives for the "Moliyaviy hisobot" Excel workbook —
 * label maps, the professional blue/grey palette, number formats and the
 * low-level exceljs row/cell styling helpers. Kept separate from
 * reports-excel.service.ts so the service stays a thin sheet-composer.
 */
import { Worksheet, Row } from 'exceljs';

// ---- Palette (ARGB) — minimal blue + grey, per the 3-statement-model rule. ----
export const NAVY = 'FF1F4E79'; // section headers (white bold on navy)
export const LIGHT_BLUE = 'FFD9E1F2'; // column headers (black bold)
export const MID_BLUE = 'FFBDD7EE'; // totals / check rows (black bold)
export const GREEN = 'FF1B7F3B'; // MOS / positive delta
export const RED = 'FFC0392B'; // XATO / negative delta
export const SUBTLE = 'FF888888'; // izoh / subtitle text

// ---- Number formats. so'm-suffixed for headline cells, plain for dense tables. ----
export const SOM = '#,##0" so\'m"';
export const NUM = '#,##0';
export const PCT = '#,##0.0"%"';

// ---- Uzbek label maps. ----
export const REVENUE_LABELS: Record<string, string> = {
  TUITION: "O'qish to'lovi",
  REGISTRATION_FEE: "Ro'yxatdan o'tish",
  CERTIFICATE_FEE: 'Sertifikat',
  MATERIAL_SALE: 'Materiallar',
  MOCK_EXAM_FEE: 'Sinov imtihon',
  OTHER: 'Boshqa',
};

export const EXPENSE_LABELS: Record<string, string> = {
  RENT: 'Ijara',
  UTILITIES: 'Kommunal',
  SUPPLIES: "Ta'minot",
  MARKETING: 'Marketing',
  EQUIPMENT: 'Jihozlar',
  MAINTENANCE: "Ta'mirlash",
  TAXES: 'Soliqlar',
  TEACHER_ADVANCE: 'Ustozga avans',
  OTHER: 'Boshqa',
};

export const METHOD_LABELS: Record<string, string> = {
  CASH: 'Naqd',
  PAYME: 'Payme',
  CLICK: 'Click',
  UZUM: 'Uzum',
  TRANSFER: "O'tkazma",
};

export const EXPENSE_METHOD_LABELS: Record<string, string> = {
  CASH: 'Naqd',
  CARD: 'Karta',
};

export const CASH_TYPE_LABELS: Record<string, string> = {
  INFLOW: 'Kirim',
  OUTFLOW: 'Chiqim',
  TRANSFER_IN: "O'tkazma (kirim)",
  TRANSFER_OUT: "O'tkazma (chiqim)",
  ADJUSTMENT: 'Tuzatish',
};

export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  CASH: 'Kassa',
  BANK: 'Bank',
  CARD: 'Karta',
};

export const SALARY_STATUS_LABELS: Record<string, string> = {
  CALCULATED: 'Hisoblangan',
  APPROVED: 'Tasdiqlangan',
  PAID: "To'langan",
  CANCELLED: 'Bekor qilingan',
};

// ---- Cell / row styling helpers. ----

function paint(cell: { fill?: unknown }, argb: string) {
  (cell as { fill: unknown }).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb },
  };
}

/** Big navy title banner (row 1) + optional grey subtitle, merged across `span`. */
export function sheetTitle(
  ws: Worksheet,
  title: string,
  subtitle?: string,
  span = 3,
): void {
  const t = ws.addRow([title]);
  t.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  t.height = 22;
  ws.mergeCells(t.number, 1, t.number, span);
  for (let c = 1; c <= span; c++) paint(t.getCell(c), NAVY);
  if (subtitle) {
    const s = ws.addRow([subtitle]);
    s.font = { italic: true, color: { argb: SUBTLE } };
    ws.mergeCells(s.number, 1, s.number, span);
  }
  ws.addRow([]);
}

/** Navy section band. */
export function sectionHeader(ws: Worksheet, label: string, span = 3): Row {
  ws.addRow([]);
  const r = ws.addRow([label]);
  r.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  ws.mergeCells(r.number, 1, r.number, span);
  for (let c = 1; c <= span; c++) paint(r.getCell(c), NAVY);
  return r;
}

/** Light-blue bold column-header row. */
export function tableHeader(ws: Worksheet, headers: string[]): Row {
  const r = ws.addRow(headers);
  r.font = { bold: true };
  r.eachCell((cell) => {
    paint(cell, LIGHT_BLUE);
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFAAB7C4' } } };
  });
  return r;
}

/** Bold mid-blue "Jami" row with a top border; `moneyCols` get the so'm format. */
export function totalsRow(
  ws: Worksheet,
  cells: (string | number)[],
  moneyCols: number[] = [],
): Row {
  const r = ws.addRow(cells);
  r.font = { bold: true };
  r.eachCell((cell, col) => {
    paint(cell, MID_BLUE);
    cell.border = { top: { style: 'thin' } };
    if (typeof cell.value === 'number') {
      cell.numFmt = moneyCols.includes(col) ? SOM : NUM;
    }
  });
  return r;
}

/** Label / value (/ izoh) row. Value is so'm-formatted unless `percent`. */
export function kvRow(
  ws: Worksheet,
  label: string,
  value: number,
  izoh?: string,
  opts: { percent?: boolean; bold?: boolean } = {},
): Row {
  const r = ws.addRow([label, value, izoh ?? '']);
  if (opts.bold) r.font = { bold: true };
  r.getCell(2).numFmt = opts.percent ? PCT : SOM;
  const ic = r.getCell(3);
  ic.font = { italic: true, size: 9, color: { argb: SUBTLE } };
  ic.alignment = { wrapText: true, vertical: 'top' };
  return r;
}

/**
 * Joriy | O'tgan | Δ | Δ% (+ izoh) row, delta coloured green/red. Money cells
 * are so'm-formatted unless `count` (then plain integers — for headcounts).
 */
export function deltaRow(
  ws: Worksheet,
  label: string,
  current: number,
  previous: number,
  izoh?: string,
  opts: { count?: boolean } = {},
): Row {
  const delta = current - previous;
  const growth =
    previous !== 0
      ? Math.round((delta / Math.abs(previous)) * 1000) / 10
      : current !== 0
        ? 100
        : 0;
  const r = ws.addRow([label, current, previous, delta, growth, izoh ?? '']);
  const valueFmt = opts.count ? NUM : SOM;
  [2, 3, 4].forEach((c) => (r.getCell(c).numFmt = valueFmt));
  r.getCell(5).numFmt = PCT;
  const colour = delta >= 0 ? GREEN : RED;
  r.getCell(4).font = { color: { argb: colour } };
  r.getCell(5).font = { color: { argb: colour } };
  const ic = r.getCell(6);
  ic.font = { italic: true, size: 9, color: { argb: SUBTLE } };
  ic.alignment = { wrapText: true, vertical: 'top' };
  return r;
}

/** Reconciliation tie row: label | kutilgan | haqiqiy | farq | MOS/XATO (+izoh). */
export function checkRow(
  ws: Worksheet,
  label: string,
  expected: number,
  actual: number,
  note?: string,
): Row {
  const diff = expected - actual;
  const ok = diff === 0;
  const r = ws.addRow([label, expected, actual, diff, ok ? 'MOS' : 'XATO', note ?? '']);
  [2, 3, 4].forEach((c) => (r.getCell(c).numFmt = SOM));
  const verdict = r.getCell(5);
  verdict.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  verdict.alignment = { horizontal: 'center' };
  paint(verdict, ok ? GREEN : RED);
  const ic = r.getCell(6);
  ic.font = { italic: true, size: 9, color: { argb: SUBTLE } };
  ic.alignment = { wrapText: true, vertical: 'top' };
  return r;
}

/** Freeze the header row and turn on its auto-filter (detail sheets). */
export function freezeAndFilter(
  ws: Worksheet,
  headerRowNumber: number,
  colCount: number,
): void {
  ws.views = [{ state: 'frozen', ySplit: headerRowNumber }];
  ws.autoFilter = {
    from: { row: headerRowNumber, column: 1 },
    to: { row: headerRowNumber, column: colCount },
  };
}

/**
 * "ⓘ Bu varaq haqida" — a plain-language explanation block appended at the
 * bottom of a sheet. A leading blank row separates it from any auto-filtered
 * data; each note sits in column 1 and overflows into the empty cells to its
 * right (readable without merging, which Excel can't auto-height).
 */
export function sheetNotes(ws: Worksheet, lines: string[], span = 6): void {
  ws.addRow([]);
  const h = ws.addRow(['ⓘ Bu varaq haqida']);
  h.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  ws.mergeCells(h.number, 1, h.number, span);
  for (let c = 1; c <= span; c++) paint(h.getCell(c), NAVY);
  for (const line of lines) {
    const r = ws.addRow(['•  ' + line]);
    r.getCell(1).font = { size: 9, color: { argb: SUBTLE } };
  }
}

/** In-cell horizontal bars sized to each value (magnitude at a glance). */
export function dataBar(ws: Worksheet, ref: string, argb = 'FF9BC2E6'): void {
  ws.addConditionalFormatting({
    ref,
    // `color` is honoured by exceljs at write time but missing from its
    // DataBar typings — cast to keep the coloured bar.
    rules: [
      {
        type: 'dataBar',
        cfvo: [{ type: 'min' }, { type: 'max' }],
        color: { argb },
        gradient: false,
        border: false,
        priority: 1,
      } as any,
    ],
  });
}

/** Red → yellow → green background scale (low→high) for a value column. */
export function colorScale(ws: Worksheet, ref: string): void {
  ws.addConditionalFormatting({
    ref,
    rules: [
      {
        type: 'colorScale',
        cfvo: [
          { type: 'min' },
          { type: 'percentile', value: 50 },
          { type: 'max' },
        ],
        color: [
          { argb: 'FFF8696B' },
          { argb: 'FFFFEB84' },
          { argb: 'FF63BE7B' },
        ],
        priority: 1,
      },
    ],
  });
}

/** dd.MM.yyyy in Tashkent time (UTC+5, no DST) for a stored UTC Date. */
export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  const t = new Date(date.getTime() + 5 * 60 * 60 * 1000);
  const dd = String(t.getUTCDate()).padStart(2, '0');
  const mm = String(t.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${t.getUTCFullYear()}`;
}

/** 'YYYY-MM-DD' for today in Tashkent — for the mid-month period-label rule. */
export function tashkentTodayStr(): string {
  const t = new Date(Date.now() + 5 * 60 * 60 * 1000);
  const mm = String(t.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(t.getUTCDate()).padStart(2, '0');
  return `${t.getUTCFullYear()}-${mm}-${dd}`;
}

/** 'YYYY-MM-DD' → 'DD.MM.YYYY'. */
export function dmy(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${d}.${m}.${y}`;
}

/** dd.MM.yyyy HH:mm in Tashkent — the cover's "Yaratilgan" stamp. */
export function nowLabel(): string {
  const t = new Date(Date.now() + 5 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(t.getUTCDate())}.${p(t.getUTCMonth() + 1)}.${t.getUTCFullYear()} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`;
}
