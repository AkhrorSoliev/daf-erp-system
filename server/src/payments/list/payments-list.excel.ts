import { Workbook } from 'exceljs';
import { formatDateTime } from '../../expenses/pdf/format.util';
import { METHOD_LABEL } from '../../statements/statement-text';
import { formatSom } from '../shared/format-som';
import type { PaymentRow } from './payments-list.types';

/** More rows than this are refused with a message (spec B4 §5.6). */
export const EXCEL_ROW_LIMIT = 20_000;

type Cell = string | number;
interface Column {
  header: string;
  width: number;
  value: (r: PaymentRow) => Cell;
  isAmount?: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  COMPLETED: "O'tgan",
  REVERSED: 'Bekor qilingan',
  CANCELLED: 'Bekor qilingan',
  PENDING: 'Kutilmoqda',
  FAILED: 'Muvaffaqiyatsiz',
  REFUNDED: 'Qaytarilgan',
};

const fullName = (p: { firstName: string; lastName: string }) =>
  `${p.firstName} ${p.lastName}`.trim();

function receiver(r: PaymentRow): string {
  if (r.online) return 'Onlayn';
  if (!r.receivedBy) return '';
  return r.receivedBy.roleLabel
    ? `${fullName(r.receivedBy)} (${r.receivedBy.roleLabel})`
    : fullName(r.receivedBy);
}

const COLUMNS: Column[] = [
  {
    header: 'Sana',
    width: 17,
    value: (r) => formatDateTime(new Date(r.createdAt)),
  },
  { header: "O'quvchi ID", width: 12, value: (r) => r.student.id },
  { header: "O'quvchi", width: 28, value: (r) => fullName(r.student) },
  { header: 'Telefon', width: 14, value: (r) => r.student.phone ?? '' },
  {
    header: 'Guruh',
    width: 20,
    value: (r) => r.groups.map((g) => g.name).join(', '),
  },
  { header: 'Summa', width: 14, value: (r) => r.amount, isAmount: true },
  {
    header: 'Usul',
    width: 12,
    value: (r) => METHOD_LABEL[r.method] ?? r.method,
  },
  {
    header: 'Nimaga ketdi',
    width: 44,
    value: (r) =>
      (r.parts ?? [])
        .map((p) => `${p.label} ${formatSom(p.amount)}`)
        .join('; '),
  },
  { header: 'Qabul qildi', width: 24, value: receiver },
  {
    header: 'Kvitansiya (tizim)',
    width: 18,
    value: (r) => r.receiptCode ?? '',
  },
  {
    header: "Kvitansiya (qog'oz)",
    width: 18,
    value: (r) => r.receiptNumber ?? '',
  },
  { header: 'Izoh', width: 30, value: (r) => r.note ?? '' },
  {
    header: 'Manba',
    width: 18,
    value: (r) => (r.online ? 'Onlayn avtomatik' : 'Admin kiritgan'),
  },
  {
    header: 'Holat',
    width: 20,
    value: (r) =>
      r.correctedBy
        ? `Tuzatildi → ${formatSom(r.correctedBy.amount)}`
        : (STATUS_LABEL[r.status] ?? r.status),
  },
];

/** A text that starts with = + - @ (or a tab / CR) would run as a formula in some viewers. */
const safe = (v: Cell): Cell =>
  typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;

/** The filtered list, every page: two header lines, the table, a «Jami» row (spec B4 §5.6). */
export async function paymentsWorkbook(
  rows: readonly PaymentRow[],
  header: { period: string; filters: string },
): Promise<Buffer> {
  const wb = new Workbook();
  const ws = wb.addWorksheet("To'lovlar");
  ws.getColumn(1).width = 6;
  COLUMNS.forEach((c, i) => (ws.getColumn(i + 2).width = c.width));
  ws.addRow([`Davr: ${header.period}`]);
  ws.addRow([`Filtrlar: ${header.filters}`]);
  ws.addRow(['#', ...COLUMNS.map((c) => c.header)]).font = { bold: true };
  rows.forEach((r, i) =>
    ws.addRow([i + 1, ...COLUMNS.map((c) => safe(c.value(r)))]),
  );
  const amountCol = 2 + COLUMNS.findIndex((c) => c.isAmount);
  ws.getColumn(amountCol).numFmt = '#,##0';
  const total = new Array<Cell>(COLUMNS.length + 1).fill('');
  total[0] = 'Jami';
  total[amountCol - 1] = rows
    .filter((r) => r.status === 'COMPLETED')
    .reduce((s, r) => s + r.amount, 0);
  ws.addRow(total).font = { bold: true };
  return Buffer.from(await wb.xlsx.writeBuffer());
}
