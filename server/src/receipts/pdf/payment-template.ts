import QRCode from 'qrcode';
import { PaymentMethod, PaymentStatus, PaymentSource } from '@prisma/client';
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

// Neon-style monochrome palette — dark text on white, single hairline divider.
const COLOR = {
  text: '#0F172A', // slate-900 — primary
  muted: '#64748B', // slate-500 — labels
  faint: '#94A3B8', // slate-400 — sub-lines, footer
  headerLine: '#94A3B8', // slate-400 — visible hairline under table headers
  divider: '#CBD5E1', // slate-300
  reverseRed: '#DC2626',
} as const;

const NB: [boolean, boolean, boolean, boolean] = [false, false, false, false];

export interface PaymentReceiptInput {
  payment: {
    id: string;
    amount: number;
    method: PaymentMethod;
    status: PaymentStatus;
    source: PaymentSource;
    externalId: string | null;
    receiptNumber: string | null;
    note: string | null;
    createdAt: Date;
  };
  receiptCode: string;
  contractNumber: string | null;
  student: {
    id: number;
    firstName: string;
    lastName: string;
    phone: string | null;
    balance: number;
  };
  receivedByName: string | null;
  branch: {
    id: number;
    name: string;
    address: string | null;
    phone: string | null;
  } | null;
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
  balanceAfter: number;
  qrUrl: string;
}

export async function buildPaymentReceiptDoc(
  input: PaymentReceiptInput,
): Promise<TDocumentDefinitions> {
  const { payment, student, branch, company } = input;
  const isReversed = payment.status === PaymentStatus.REVERSED;
  const balanceBefore =
    payment.amount > 0
      ? input.balanceAfter - payment.amount
      : input.balanceAfter;

  const qrDataUrl = await QRCode.toDataURL(input.qrUrl, {
    margin: 0,
    width: 220,
    errorCorrectionLevel: 'M',
    color: { dark: COLOR.text, light: '#FFFFFF' },
  });
  const logoDataUrl = getCompanyLogoDataUrl();

  const methodLabel = PAYMENT_METHOD_LABEL[payment.method];
  const externalIdRow = buildExternalIdRow(payment);

  // ── meta column rows (right side) ─────────────────────────────────
  const metaRows: TableCell[][] = [
    metaRow('Kvitansiya №', input.receiptCode),
    metaRow('Sana', formatDate(payment.createdAt)),
    metaRow("To'lov turi", methodLabel),
  ];
  if (externalIdRow) metaRows.push(externalIdRow);
  metaRows.push([
    { text: "Summa to'landi", color: COLOR.text, bold: true, border: NB },
    {
      text: `${formatSom(payment.amount)} so'm`,
      alignment: 'right',
      bold: true,
      border: NB,
    },
  ]);

  // ── line items: header row drawn separately + data table below ────
  // Rendering the header as a `columns` block + an explicit `canvas`
  // hairline gives us guaranteed visual control. pdfmake's table-level
  // hLineWidth callbacks are sometimes silently suppressed when every
  // cell has `border: [false, false, false, false]`.
  const lineItemRows: TableCell[][] = [
    [
      lineItemDescription(input),
      td('1', 'right'),
      td(formatSom(payment.amount), 'right'),
      td(`${formatSom(payment.amount)} so'm`, 'right', true),
    ],
  ];

  return {
    info: {
      title: `Kvitansiya ${input.receiptCode}`,
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
    background: isReversed
      ? (
          _currentPage: number,
          pageSize: { width: number; height: number },
        ) => ({
          text: 'BEKOR QILINGAN',
          color: COLOR.reverseRed,
          opacity: 0.1,
          bold: true,
          fontSize: 90,
          absolutePosition: { x: 0, y: pageSize.height / 2 - 60 },
          alignment: 'center',
        })
      : undefined,
    content: [
      // 1. Header row: logo (left) + KVITANSIYA (right)
      headerRow(logoDataUrl, 'KVITANSIYA'),
      // 2. Issuer address
      issuerAddress(company, branch),
      // 3. Two-column meta: Bill-to (left) + invoice key/value (right)
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
      // 4. Line items — header row, hairline divider, then data table
      ...lineItemsHeader(),
      lineItemsTable(lineItemRows),
      // 5. Totals (right-aligned). "To'langan summa" is the actual cash
      // movement of *this* receipt; balans rows show the wallet effect.
      totalsBlock([
        {
          label: 'Avvalgi balans',
          value: `${formatSom(balanceBefore)} so'm`,
          muted: true,
        },
        {
          label: 'Joriy balans',
          value: `${formatSom(input.balanceAfter)} so'm`,
          muted: true,
        },
        {
          label: "To'langan summa",
          value: `${formatSom(payment.amount)} so'm`,
          bold: true,
        },
      ]),
      // 6. Memo + QR row at the bottom
      memoQrBlock(payment.note, input.receivedByName, 'Qabul qildi', qrDataUrl),
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
        fontSize: 26,
        color: COLOR.faint,
        characterSpacing: 1.5,
        margin: [0, 4, 0, 0],
      },
    ],
    margin: [0, 0, 0, 36],
  };
}

function issuerAddress(
  company: PaymentReceiptInput['company'],
  branch: PaymentReceiptInput['branch'],
): Content {
  const lines: Content[] = [{ text: company.name }];
  if (branch?.name) lines.push({ text: branch.name });
  if (branch?.address) lines.push({ text: branch.address });
  const phone = branch?.phone ?? company.phone;
  // Branch / company phone numbers are stored as raw 9-digit strings in
  // the DB (Uzbek convention); render them in the canonical
  // `+998 XX XXX XX XX` form for consistency with student phone display.
  if (phone) lines.push({ text: formatPhone(phone) });
  return { stack: lines, margin: [0, 0, 0, 28] };
}

function metaSection(
  student: PaymentReceiptInput['student'],
  courseLabel: string | null,
  groupName: string | null,
  groupNumber: number | null,
  groupLevel: string | null,
  contractNumber: string | null,
  teacherNames: string | null,
  lessonSchedule: PaymentReceiptInput['lessonSchedule'],
  metaRows: TableCell[][],
): ContentColumns {
  const billTo: Content[] = [
    { text: 'Mijoz:', bold: true, margin: [0, 0, 0, 4] },
    { text: `${student.firstName} ${student.lastName}` },
  ];
  if (courseLabel)
    billTo.push({ text: `Kurs: ${courseLabel}`, color: COLOR.muted });
  // "Guruh" prefers the explicit `level` (e.g. "Standart") over the raw
  // group name when both are present — matches what receptionists call out.
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

// A4 595pt − 50pt left − 50pt right = 495pt usable width.
// The data table widths sum to: '*'(275) + 60 + 70 + 90 = 495.
const TABLE_INNER_WIDTH = 495;

function lineItemsHeader(): Content[] {
  return [
    // Column headers as a `columns` block — same widths as the data table
    // below so they line up exactly. Numeric columns are right-aligned.
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
    // Hairline directly underneath, drawn explicitly with canvas so it
    // can never be suppressed by any table-layout quirk.
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
  note: string | null,
  actorName: string | null,
  actorLabel: string,
  qrDataUrl: string,
): ContentColumns {
  const memo: Content[] = [
    { text: 'Eslatma:', bold: true, margin: [0, 0, 0, 2] },
    { text: note ?? '—', color: COLOR.muted },
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

function lineItemDescription(input: PaymentReceiptInput): TableCell {
  const title = input.courseLabel ?? "To'lov uchun";
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

function buildExternalIdRow(
  payment: PaymentReceiptInput['payment'],
): TableCell[] | null {
  if (
    payment.externalId &&
    (payment.method === PaymentMethod.PAYME ||
      payment.method === PaymentMethod.CLICK ||
      payment.method === PaymentMethod.UZUM)
  ) {
    return [
      { text: 'Tranzaksiya', color: COLOR.muted, border: NB },
      {
        text: payment.externalId,
        alignment: 'right',
        fontSize: 8,
        border: NB,
      },
    ];
  }
  if (payment.receiptNumber) {
    return [
      { text: 'Kassa №', color: COLOR.muted, border: NB },
      { text: payment.receiptNumber, alignment: 'right', border: NB },
    ];
  }
  return null;
}

function formatSom(value: number): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value).toFixed(0);
  return sign + abs.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function formatDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  // Tashkent UTC+5
  const t = new Date(d.getTime() + 5 * 60 * 60 * 1000);
  return `${pad(t.getUTCDate())}.${pad(t.getUTCMonth() + 1)}.${t.getUTCFullYear()} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
}

function formatPhone(raw: string): string {
  // Strip everything except digits, then trim a leading `998` country code.
  // Result is the bare 9-digit subscriber number, which we re-format with
  // the canonical `+998 XX XXX XX XX` Uzbek convention.
  const digits = raw.replace(/\D/g, '');
  const local =
    digits.length === 12 && digits.startsWith('998') ? digits.slice(3) : digits;
  if (local.length === 9) {
    return `+998 ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5, 7)} ${local.slice(7, 9)}`;
  }
  return raw;
}
