import { Workbook } from 'exceljs';
import { OUTCOME_LABEL } from '../../call-logs/call-logs.service';
import { tashkentDateStr } from '../../common/date/tashkent';
import type { DebtTab } from '../../reports/debt-split';
import { dm, monthTitle } from '../../statements/statement-text';
import type { DebtListItem } from './debt-list.math';

type Cell = string | number;
/** `isAmount`: the tab's amount, summed by the «Jami» row. */
interface Column {
  header: string;
  width: number;
  value: (r: DebtListItem) => Cell;
  isAmount?: boolean;
}

const KIND_LABEL = {
  ungrouped: 'guruhsiz',
  frozen: 'muzlatilgan',
  left: 'ketgan',
} as const;
const SHEET_NAME: Record<DebtTab, string> = {
  'shu-oy': 'Shu oy',
  eski: 'Eski qarz',
  chiqqan: "O'qimayotganlar",
};
const day = (iso: string) => dm(tashkentDateStr(new Date(iso)));

const col = {
  id: { header: 'ID', width: 8, value: (r) => r.studentId },
  name: {
    header: "O'quvchi",
    width: 28,
    value: (r) => `${r.firstName} ${r.lastName}`.trim(),
  },
  phone: { header: 'Telefon', width: 14, value: (r) => r.phone ?? '' },
  group: {
    header: 'Guruh',
    width: 18,
    value: (r) => r.groups.map((g) => g.name).join(', '),
  },
  teacher: {
    header: 'Ustoz',
    width: 22,
    value: (r) =>
      [...new Set(r.groups.flatMap((g) => g.teachers.map((t) => t.name)))].join(
        ', ',
      ),
  },
  promise: {
    header: "Va'da",
    width: 16,
    value: (r) =>
      !r.promise
        ? ''
        : r.promise.state === 'open'
          ? `${dm(r.promise.promiseDate)} gacha`
          : `buzildi · ${dm(r.promise.promiseDate)}`,
  },
  call: {
    header: 'Oxirgi aloqa',
    width: 26,
    value: (r) =>
      r.lastCall
        ? `${day(r.lastCall.createdAt)} · ${OUTCOME_LABEL[r.lastCall.outcome]}`
        : '',
  },
  months: {
    header: 'Qaysi oylardan',
    width: 30,
    value: (r) =>
      r.months.map((m) => `${monthTitle(m.monthKey)}: ${m.amount}`).join('; '),
  },
} satisfies Record<string, Column>;
const amount = (header: string): Column => ({
  header,
  width: 14,
  value: (r) => r.amount,
  isAmount: true,
});

/** The visible columns of each tab (spec §2.3), as plain values. */
const COLUMNS: Record<DebtTab, Column[]> = {
  'shu-oy': [
    col.id,
    col.name,
    col.phone,
    col.group,
    col.teacher,
    amount('Qarz'),
    { header: 'Eski qarz ham', width: 14, value: (r) => r.otherPart },
    {
      header: "To'lov muddati",
      width: 14,
      value: (r) => (r.dueDate ? dm(r.dueDate) : ''),
    },
    col.promise,
    col.call,
  ],
  eski: [
    col.id,
    col.name,
    col.phone,
    col.group,
    col.teacher,
    amount('Eski qarz'),
    { header: 'Shu oy ham', width: 14, value: (r) => r.otherPart },
    col.months,
    {
      header: "Oxirgi to'lov",
      width: 18,
      value: (r) =>
        r.lastPayment
          ? `${day(r.lastPayment.createdAt)} · ${r.lastPayment.amount}`
          : '',
    },
    col.promise,
  ],
  chiqqan: [
    col.id,
    col.name,
    col.phone,
    {
      header: 'Holat',
      width: 14,
      value: (r) => (r.kind ? KIND_LABEL[r.kind] : ''),
    },
    { ...col.group, header: 'Oxirgi guruh' },
    amount('Qarz'),
    col.months,
    col.call,
  ],
};

/** The open tab with its filters, every page, plus a «Jami» row (spec §2.7). */
export async function debtListWorkbook(
  tab: DebtTab,
  rows: readonly DebtListItem[],
): Promise<Buffer> {
  const columns = COLUMNS[tab];
  const wb = new Workbook();
  const ws = wb.addWorksheet(SHEET_NAME[tab]);
  ws.columns = [
    { header: '#', width: 6 },
    ...columns.map((c) => ({ header: c.header, width: c.width })),
  ];
  ws.getRow(1).font = { bold: true };
  rows.forEach((r, i) => ws.addRow([i + 1, ...columns.map((c) => c.value(r))]));
  const total = new Array<Cell>(columns.length + 1).fill('');
  total[0] = 'Jami';
  total[1 + columns.findIndex((c) => c.isAmount)] = rows.reduce(
    (s, r) => s + r.amount,
    0,
  );
  ws.addRow(total).font = { bold: true };
  return Buffer.from(await wb.xlsx.writeBuffer());
}
