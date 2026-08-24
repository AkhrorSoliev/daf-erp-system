import QRCode from 'qrcode';
import { PaymentMethod, RefundStatus } from '@prisma/client';
import type {
  Content,
  ContentColumns,
  ContentTable,
  TableCell,
  TDocumentDefinitions,
} from 'pdfmake/interfaces';
import { getCompanyLogoDataUrl } from './render';

const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: 'Naqd',
  PAYME: 'Payme',
  CLICK: 'Click',
  UZUM: 'Uzum',
  TRANSFER: "Bank o'tkazmasi",
};

const COLOR = {
  text: '#0F172A',
  muted: '#64748B',
  faint: '#94A3B8',
  headerLine: '#94A3B8',
  divider: '#CBD5E1',
} as const;

const NB: [boolean, boolean, boolean, boolean] = [false, false, false, false];

export interface RefundReceiptInput {
  refund: {
    id: string;
    requestedAmount: number;
    approvedAmount: number | null;
    deductions: Record<string, number> | null;
    status: RefundStatus;
    refundMethod: PaymentMethod | null;
    reason: string | null;
    processedAt: Date | null;
    createdAt: Date;
  };
  receiptCode: string;
  contractNumber: string | null;
  student: {
    id: number;
    firstName: string;
    lastName: string;
    phone: string | null;
  };
  processedByName: string | null;
  company: {
    name: string;
    phone: string | null;
    logo: string | null;
  };
  groupName: string | null;
  groupNumber: number | null;
  groupLevel: string | null;
  courseLabel: string | null;
  teacherNames: string | null;
  lessonSchedule: { daysLabel: string; timeLabel: string | null } | null;
  qrUrl: string;
}

export async function buildRefundReceiptDoc(
  input: RefundReceiptInput,
): Promise<TDocumentDefinitions> {
  const { refund, student, company } = input;
  const finalAmount = refund.approvedAmount ?? refund.requestedAmount;

  const qrDataUrl = await QRCode.toDataURL(input.qrUrl, {
    margin: 0,
    width: 220,
    errorCorrectionLevel: 'M',
    color: { dark: COLOR.text, light: '#FFFFFF' },
  });
  const logoDataUrl = getCompanyLogoDataUrl();

  const deductionEntries =
    refund.deductions && typeof refund.deductions === 'object'
      ? Object.entries(refund.deductions)
      : [];

  // ── meta column rows (right side) ─────────────────────────────────
  const metaRows: TableCell[][] = [
    metaRow('Hujjat №', input.receiptCode),
    metaRow('Sana', formatDate(refund.processedAt ?? refund.createdAt)),
  ];
  if (refund.refundMethod) {
    metaRows.push(
      metaRow('Qaytarish usuli', PAYMENT_METHOD_LABEL[refund.refundMethod]),
    );
  }
  metaRows.push([
    { text: 'Qaytarilgan summa', color: COLOR.text, bold: true, border: NB },
    {
      text: `${formatSom(finalAmount)} so'm`,
      alignment: 'right',
      bold: true,
      border: NB,
    },
  ]);

  // ── line items: header row drawn separately + data table below ────
  const lineItemRows: TableCell[][] = [
    [
      lineItemDescription(input),
      td('1', 'right'),
      td(formatSom(refund.requestedAmount), 'right'),
      td(`${formatSom(refund.requestedAmount)} so'm`, 'right'),
    ],
  ];
  for (const [label, value] of deductionEntries) {
    lineItemRows.push([
      {
        stack: [
          { text: label, bold: true },
          {
            text: 'Tutib qolingan summa',
            color: COLOR.faint,
            fontSize: 8,
            margin: [0, 1, 0, 0] as [number, number, number, number],
          },
        ],
        border: NB,
      },
      td('1', 'right'),
      td(`-${formatSom(value)}`, 'right'),
      td(`-${formatSom(value)} so'm`, 'right'),
    ]);
  }

  return {
    info: {
      title: `Qaytarish hujjati ${input.receiptCode}`,
      author: company.name,
      creator: company.name,
    },
    pageSize: 'A4',
    pageMargins: [50, 50, 50, 60],
    defaultStyle: {
      font: 'Inter',
      fontSize: 9.5,
      color: COLOR.text,
      lineHeight: 1.35,
    },
    footer: (currentPage: number, pageCount: number) => ({
      text: `${currentPage} of ${pageCount}`,
      alignment: 'right',
      fontSize: 8,
      color: COLOR.faint,
      margin: [0, 20, 50, 0],
    }),
    content: [
      headerRow(logoDataUrl, 'QAYTARISH HUJJATI'),
      issuerAddress(company),
      metaSection(
        student,
        input.courseLabel,
        input.groupName,
        input.groupNumber,
        input.groupLevel,
        input.contractNumber,
        input.teacherNames,
        input.lessonSchedule,
        metaRows,
      ),
      ...lineItemsHeader(),
      lineItemsTable(lineItemRows),
      totalsBlock([
        {
          label: "So'ralgan summa",
          value: `${formatSom(refund.requestedAmount)} so'm`,
          muted: true,
        },
        ...(deductionEntries.length
          ? [
              {
                label: 'Tutib qolingan',
                value: `-${formatSom(
                  deductionEntries.reduce((s, [, v]) => s + v, 0),
                )} so'm`,
                muted: true,
              },
            ]
          : []),
        {
          label: 'Qaytarilgan summa',
          value: `${formatSom(finalAmount)} so'm`,
          bold: true,
        },
      ]),
      memoQrBlock(refund.reason, input.processedByName, 'Bajardi', qrDataUrl),
    ],
  };
}

// ─── building blocks ─────────────────────────────────────────────────

function headerRow(logoDataUrl: string | null, title: string): ContentColumns {
  return {
    columns: [
      logoDataUrl
        ? { image: logoDataUrl, width: 110, fit: [110, 36] }
        : { text: '', width: 110 },
      {
        text: title,
        alignment: 'right',
        fontSize: 22,
        color: COLOR.faint,
        characterSpacing: 1.5,
        margin: [0, 8, 0, 0],
      },
    ],
    margin: [0, 0, 0, 36],
  };
}

function issuerAddress(company: RefundReceiptInput['company']): Content {
  const lines: Content[] = [{ text: company.name }];
  if (company.phone) lines.push({ text: formatPhone(company.phone) });
  return { stack: lines, margin: [0, 0, 0, 28] };
}

function metaSection(
  student: RefundReceiptInput['student'],
  courseLabel: string | null,
  groupName: string | null,
  groupNumber: number | null,
  groupLevel: string | null,
  contractNumber: string | null,
  teacherNames: string | null,
  lessonSchedule: RefundReceiptInput['lessonSchedule'],
  metaRows: TableCell[][],
): ContentColumns {
  const billTo: Content[] = [
    { text: 'Mijoz:', bold: true, margin: [0, 0, 0, 4] },
    { text: `${student.firstName} ${student.lastName}` },
  ];
  if (courseLabel)
    billTo.push({ text: `Kurs: ${courseLabel}`, color: COLOR.muted });
  const groupDisplay = groupLevel ?? groupName;
  if (groupDisplay) {
    billTo.push({ text: `Guruh: ${groupDisplay}`, color: COLOR.muted });
  }
  if (groupNumber !== null) {
    billTo.push({
      text: `Guruh raqami: #${String(groupNumber).padStart(3, '0')}`,
      color: COLOR.muted,
    });
  }
  if (teacherNames) {
    billTo.push({ text: `O'qituvchi: ${teacherNames}`, color: COLOR.muted });
  }
  if (lessonSchedule) {
    const parts = [lessonSchedule.daysLabel, lessonSchedule.timeLabel].filter(
      (x): x is string => Boolean(x),
    );
    if (parts.length) {
      billTo.push({
        text: `Dars vaqti: ${parts.join(' ')}`,
        color: COLOR.muted,
      });
    }
  }
  if (contractNumber) {
    billTo.push({ text: `Shartnoma: ${contractNumber}`, color: COLOR.muted });
  }
  billTo.push({
    text: `O'quvchining ID'si: ${student.id}`,
    color: COLOR.muted,
  });
  if (student.phone) {
    billTo.push({ text: formatPhone(student.phone), color: COLOR.muted });
  }

  return {
    columns: [
      { width: '50%', stack: billTo },
      {
        width: '50%',
        table: { widths: ['*', 'auto'], body: metaRows },
        layout: {
          defaultBorder: false,
          paddingTop: () => 2,
          paddingBottom: () => 2,
          paddingLeft: () => 0,
          paddingRight: () => 0,
        },
      },
    ],
    columnGap: 24,
    margin: [0, 0, 0, 36],
  };
}

const TABLE_INNER_WIDTH = 495;

function lineItemsHeader(): Content[] {
  return [
    {
      columns: [
        {
          text: 'Tavsif',
          bold: true,
          fontSize: 10,
          color: COLOR.text,
          width: '*',
        },
        {
          text: 'Miqdor',
          bold: true,
          fontSize: 10,
          color: COLOR.text,
          width: 60,
          alignment: 'right',
        },
        {
          text: 'Narx',
          bold: true,
          fontSize: 10,
          color: COLOR.text,
          width: 70,
          alignment: 'right',
        },
        {
          text: 'Summa',
          bold: true,
          fontSize: 10,
          color: COLOR.text,
          width: 90,
          alignment: 'right',
        },
      ],
      columnGap: 0,
      margin: [0, 0, 0, 6],
    },
    {
      canvas: [
        {
          type: 'line',
          x1: 0,
          y1: 0,
          x2: TABLE_INNER_WIDTH,
          y2: 0,
          lineWidth: 1,
          lineColor: COLOR.headerLine,
        },
      ],
      margin: [0, 0, 0, 4],
    },
  ];
}

function lineItemsTable(body: TableCell[][]): ContentTable {
  return {
    table: { widths: ['*', 60, 70, 90], body },
    layout: {
      defaultBorder: false,
      paddingTop: () => 8,
      paddingBottom: () => 8,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      hLineWidth: () => 0,
      vLineWidth: () => 0,
    },
  };
}

interface TotalRow {
  label: string;
  value: string;
  muted?: boolean;
  bold?: boolean;
}

function totalsBlock(rows: TotalRow[]): ContentColumns {
  return {
    columns: [
      { text: '', width: '*' },
      {
        width: 240,
        table: {
          widths: ['*', 'auto'],
          body: rows.map((r) => [
            {
              text: r.label,
              alignment: 'right',
              color: r.muted ? COLOR.muted : COLOR.text,
              bold: r.bold,
              border: NB,
            },
            {
              text: r.value,
              alignment: 'right',
              color: r.muted ? COLOR.muted : COLOR.text,
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
    margin: [0, 14, 0, 0],
  };
}

function memoQrBlock(
  reason: string | null,
  actorName: string | null,
  actorLabel: string,
  qrDataUrl: string,
): ContentColumns {
  const memo: Content[] = [
    { text: 'Sabab:', bold: true, margin: [0, 0, 0, 2] },
    { text: reason ?? '—', color: COLOR.muted },
  ];
  if (actorName) {
    memo.push(
      { text: ' ' },
      { text: `${actorLabel}:`, bold: true, margin: [0, 6, 0, 2] },
      { text: actorName, color: COLOR.muted },
    );
  }
  return {
    columns: [
      { width: '*', stack: memo },
      {
        width: 'auto',
        stack: [
          { image: qrDataUrl, width: 90, alignment: 'right' },
          {
            text: 'Tekshirish uchun skanerlang',
            color: COLOR.faint,
            fontSize: 7,
            alignment: 'right',
            margin: [0, 4, 0, 0],
          },
        ],
      },
    ],
    margin: [0, 32, 0, 0],
  };
}

// ─── small helpers ───────────────────────────────────────────────────

function td(
  text: string,
  alignment: 'left' | 'right',
  bold = false,
): TableCell {
  return { text, alignment, bold, border: NB };
}

function metaRow(label: string, value: string): TableCell[] {
  return [
    { text: label, color: COLOR.muted, border: NB },
    { text: value, alignment: 'right', border: NB },
  ];
}

function lineItemDescription(input: RefundReceiptInput): TableCell {
  const title = input.courseLabel ?? 'Qaytarish';
  const subParts: string[] = [];
  if (input.groupName) subParts.push(input.groupName);
  if (input.contractNumber) subParts.push(input.contractNumber);
  return {
    stack: [
      { text: title, bold: true },
      ...(subParts.length
        ? [
            {
              text: subParts.join(' — '),
              color: COLOR.faint,
              fontSize: 8,
              margin: [0, 1, 0, 0] as [number, number, number, number],
            },
          ]
        : []),
    ],
    border: NB,
  };
}

function formatSom(value: number): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value).toFixed(0);
  return sign + abs.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function formatDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const t = new Date(d.getTime() + 5 * 60 * 60 * 1000);
  return `${pad(t.getUTCDate())}.${pad(t.getUTCMonth() + 1)}.${t.getUTCFullYear()} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  const local =
    digits.length === 12 && digits.startsWith('998') ? digits.slice(3) : digits;
  if (local.length === 9) {
    return `+998 ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5, 7)} ${local.slice(7, 9)}`;
  }
  return raw;
}
