import type {
  Content,
  ContentColumns,
  TableCell,
  TDocumentDefinitions,
} from 'pdfmake/interfaces';
import { getCompanyLogoDataUrl } from '../../receipts/pdf/render';
import { formatSom, formatDate, formatDateTime } from './format.util';

// Same monochrome palette as the receipt templates — visual consistency.
const COLOR = {
  text: '#0F172A',
  muted: '#64748B',
  faint: '#94A3B8',
  headerLine: '#94A3B8',
  divider: '#E2E8F0',
} as const;

const NB: [boolean, boolean, boolean, boolean] = [false, false, false, false];

export interface ExpensesPdfRow {
  date: Date;
  categoryLabel: string;
  description: string;
  amount: number;
  methodLabel: string;
  createdByName: string;
}

export interface ExpensesPdfInput {
  companyName: string;
  branchName: string | null;
  // Active-filter summary lines (omit when not filtered).
  categoryLabel: string | null;
  methodLabel: string | null;
  search: string | null;
  dateRangeLabel: string; // "Butun davr" or "dd.MM.yyyy — dd.MM.yyyy" etc.
  generatedAt: Date;
  rows: ExpensesPdfRow[];
  totals: {
    totalAmount: number;
    cashTotal: number;
    cardTotal: number;
    count: number;
  };
}

// A4 595pt − 50 − 50 = 495pt usable. 60+78+75+55+90 = 358 fixed, '*' = 137.
const COL_WIDTHS = [60, 78, '*', 75, 55, 90];

export function buildExpensesDoc(input: ExpensesPdfInput): TDocumentDefinitions {
  const logo = getCompanyLogoDataUrl();

  return {
    info: {
      title: 'Xarajatlar hisoboti',
      author: input.companyName,
      creator: input.companyName,
    },
    pageSize: 'A4',
    pageMargins: [50, 50, 50, 60],
    defaultStyle: {
      font: 'Inter',
      fontSize: 9,
      color: COLOR.text,
      lineHeight: 1.3,
    },
    footer: (currentPage: number, pageCount: number) => ({
      text: `${currentPage} / ${pageCount}`,
      alignment: 'right',
      fontSize: 8,
      color: COLOR.faint,
      margin: [0, 20, 50, 0],
    }),
    content: [
      headerRow(logo, 'XARAJATLAR HISOBOTI'),
      issuerBlock(input),
      filterBlock(input),
      expensesTable(input.rows),
      totalsBlock(input.totals),
    ],
  };
}

// ─── building blocks ─────────────────────────────────────────────────

function headerRow(logo: string | null, title: string): ContentColumns {
  return {
    columns: [
      logo
        ? { image: logo, width: 110, fit: [110, 36] }
        : { text: '', width: 110 },
      {
        text: title,
        alignment: 'right',
        fontSize: 20,
        color: COLOR.faint,
        characterSpacing: 1.2,
        margin: [0, 6, 0, 0],
      },
    ],
    margin: [0, 0, 0, 24],
  };
}

function issuerBlock(input: ExpensesPdfInput): Content {
  const lines: Content[] = [
    { text: input.companyName, bold: true, fontSize: 11 },
  ];
  if (input.branchName) lines.push({ text: input.branchName, color: COLOR.muted });
  return { stack: lines, margin: [0, 0, 0, 14] };
}

function filterBlock(input: ExpensesPdfInput): Content {
  const lines: Content[] = [
    kv('Davr', input.dateRangeLabel),
  ];
  if (input.categoryLabel) lines.push(kv('Kategoriya', input.categoryLabel));
  if (input.methodLabel) lines.push(kv("To'lov turi", input.methodLabel));
  if (input.search) lines.push(kv('Qidiruv', input.search));
  lines.push(kv('Tayyorlandi', formatDateTime(input.generatedAt)));
  return { stack: lines, margin: [0, 0, 0, 18] };
}

function kv(label: string, value: string): Content {
  return {
    columns: [
      { text: `${label}:`, width: 70, color: COLOR.muted, fontSize: 8.5 },
      { text: value, width: '*', fontSize: 8.5 },
    ],
    columnGap: 4,
    margin: [0, 0, 0, 1],
  };
}

function expensesTable(rows: ExpensesPdfRow[]): Content {
  const head: TableCell[] = [
    th('Sana'),
    th('Kategoriya'),
    th('Tavsif'),
    th('Summa', 'right'),
    th("To'lov turi"),
    th('Kim kiritgan'),
  ];

  const body: TableCell[][] =
    rows.length === 0
      ? [
          head,
          [
            {
              text: "Tanlangan filtrlar bo'yicha xarajat topilmadi",
              colSpan: 6,
              alignment: 'center',
              color: COLOR.muted,
              margin: [0, 8, 0, 8],
              border: NB,
            },
            {},
            {},
            {},
            {},
            {},
          ],
        ]
      : [
          head,
          ...rows.map((r) => [
            td(formatDate(r.date)),
            td(r.categoryLabel),
            td(r.description),
            td(formatSom(r.amount), 'right'),
            td(r.methodLabel),
            td(r.createdByName),
          ]),
        ];

  return {
    table: { headerRows: 1, widths: COL_WIDTHS, body },
    layout: {
      defaultBorder: false,
      // Single hairline under the header row only.
      hLineWidth: (i: number) => (i === 1 ? 1 : 0),
      hLineColor: () => COLOR.headerLine,
      vLineWidth: () => 0,
      paddingTop: () => 5,
      paddingBottom: () => 5,
      paddingLeft: () => 0,
      paddingRight: (i: number) => (i === 0 ? 6 : 6),
    },
  };
}

function totalsBlock(totals: ExpensesPdfInput['totals']): ContentColumns {
  const rows: { label: string; value: string; bold?: boolean }[] = [
    { label: 'Jami', value: `${formatSom(totals.totalAmount)} so'm`, bold: true },
    { label: 'Naqt', value: `${formatSom(totals.cashTotal)} so'm` },
    { label: 'Karta', value: `${formatSom(totals.cardTotal)} so'm` },
    { label: 'Xarajatlar soni', value: `${totals.count} ta` },
  ];
  return {
    columns: [
      { text: '', width: '*' },
      {
        width: 220,
        table: {
          widths: ['*', 'auto'],
          body: rows.map((r) => [
            {
              text: r.label,
              alignment: 'right',
              color: r.bold ? COLOR.text : COLOR.muted,
              bold: r.bold,
              border: NB,
            },
            {
              text: r.value,
              alignment: 'right',
              color: r.bold ? COLOR.text : COLOR.muted,
              bold: r.bold,
              border: NB,
            },
          ]),
        },
        layout: {
          defaultBorder: false,
          paddingTop: () => 3,
          paddingBottom: () => 3,
          paddingLeft: () => 0,
          paddingRight: () => 0,
        },
      },
    ],
    margin: [0, 16, 0, 0],
  };
}

// ─── small helpers ───────────────────────────────────────────────────

function th(text: string, alignment: 'left' | 'right' = 'left'): TableCell {
  return { text, bold: true, fontSize: 9, alignment, color: COLOR.text, border: NB };
}

function td(text: string, alignment: 'left' | 'right' = 'left'): TableCell {
  return { text, alignment, border: NB, color: COLOR.text };
}
