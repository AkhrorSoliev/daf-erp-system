import { Workbook } from 'exceljs';
import { tashkentDateStr } from '../common/date/tashkent';
import { dmy } from '../statements/statement-text';
import {
  AGE_STATE_LABEL,
  noticeLabel,
  pendingDueLabel,
  type PendingRefundRow,
  type RefundableRow,
} from './refundable.math';

type Cell = string | number;
interface Column<T> {
  header: string;
  width: number;
  value: (r: T) => Cell;
  isAmount?: boolean;
}

const person = {
  id: {
    header: 'ID',
    width: 8,
    value: (r: { studentId: number }) => r.studentId,
  },
  name: {
    header: "O'quvchi",
    width: 28,
    value: (r: { firstName: string; lastName: string }) =>
      `${r.firstName} ${r.lastName}`.trim(),
  },
  phone: {
    header: 'Telefon',
    width: 14,
    value: (r: { phone: string }) => r.phone,
  },
};

const PENDING: Column<PendingRefundRow>[] = [
  person.id,
  person.name,
  person.phone,
  { header: 'Summa', width: 14, value: (r) => r.amount, isAmount: true },
  {
    header: "So'ralgan",
    width: 12,
    value: (r) => dmy(tashkentDateStr(new Date(r.requestedAt))),
  },
  { header: 'Muddat', width: 12, value: (r) => dmy(r.dueDate) },
  { header: 'Holat', width: 26, value: (r) => pendingDueLabel(r.due) },
];

function studentColumns(
  sinceHeader: string,
  middle: Column<RefundableRow>,
): Column<RefundableRow>[] {
  return [
    person.id,
    person.name,
    person.phone,
    { header: sinceHeader, width: 12, value: (r) => dmy(r.since) },
    { header: 'Kun', width: 8, value: (r) => r.days },
    middle,
    { header: 'Puli', width: 14, value: (r) => r.balance, isAmount: true },
    { header: 'Xabar', width: 30, value: (r) => noticeLabel(r.notice) },
  ];
}
const LAST_GROUP: Column<RefundableRow> = {
  header: 'Oxirgi guruh',
  width: 18,
  value: (r) => r.lastGroup?.name ?? '',
};

function addSheet<T>(
  wb: Workbook,
  name: string,
  columns: Column<T>[],
  rows: readonly T[],
) {
  const ws = wb.addWorksheet(name);
  ws.columns = [
    { header: '#', width: 6 },
    ...columns.map((c) => ({ header: c.header, width: c.width })),
  ];
  ws.getRow(1).font = { bold: true };
  rows.forEach((r, i) => ws.addRow([i + 1, ...columns.map((c) => c.value(r))]));
  const amount = columns.find((c) => c.isAmount);
  const total = new Array<Cell>(columns.length + 1).fill('');
  total[0] = 'Jami';
  if (amount) {
    total[1 + columns.indexOf(amount)] = rows.reduce(
      (s, r) => s + Number(amount.value(r)),
      0,
    );
  }
  ws.addRow(total).font = { bold: true };
}

/** Spec §3.7: four sheets with the page's columns, money as numbers. */
export async function refundableWorkbook(p: {
  pending: readonly PendingRefundRow[];
  muzlatilgan: readonly RefundableRow[];
  guruhsiz: readonly RefundableRow[];
  ketgan: readonly RefundableRow[];
}): Promise<Buffer> {
  const wb = new Workbook();
  addSheet(wb, 'Kutilayotgan', PENDING, p.pending);
  addSheet(
    wb,
    'Muzlatilganlar',
    studentColumns('Muzlatilgan', {
      header: 'Holat',
      width: 20,
      value: (r) => AGE_STATE_LABEL[r.ageBucket],
    }),
    p.muzlatilgan,
  );
  addSheet(wb, 'Guruhsiz', studentColumns('Guruhsiz', LAST_GROUP), p.guruhsiz);
  addSheet(wb, 'Ketganlar', studentColumns('Ketgan', LAST_GROUP), p.ketgan);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
