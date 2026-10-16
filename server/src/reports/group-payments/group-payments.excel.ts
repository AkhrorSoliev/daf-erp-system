import { Workbook } from 'exceljs';
import { paidPctOf } from '../month-charges';
import type {
  GpRow,
  GpSheetStudent,
  Kesim,
  PayStatus,
  StudentMark,
} from './group-payments.math';

type Cell = string | number;
interface Column {
  header: string;
  width: number;
  value: (r: GpRow) => Cell;
}

const SHEET: Record<Kesim, string> = {
  guruh: 'Guruhlar',
  ustoz: 'Ustozlar',
  kurs: 'Kurslar',
};
/** The page's grey note under the Ustozlar table (spec B5 §3.5). */
const MULTI_TEACHER_NOTE =
  "Ikki ustozli guruh har ikkala ustozda sanaladi — ustozlar yig'indisi jamidan katta bo'lishi mumkin.";
const MARK_LABEL = { ochirilgan: "o'chirilgan", yopilgan: 'yopilgan' } as const;
const PAY_STATUS_LABEL: Record<PayStatus, string> = {
  toladi: "to'ladi",
  qisman: 'qisman',
  tolamagan: "to'lamagan",
};
const STUDENT_MARK_LABEL: Record<StudentMark, string> = {
  arxivda: 'arxivda',
  muzlatilgan: 'muzlatilgan',
  chiqqan: 'guruhdan chiqqan',
};

const withMarks = (r: GpRow) =>
  r.marks.length
    ? `${r.name} (${r.marks.map((m) => MARK_LABEL[m]).join(', ')})`
    : r.name;

/** The first sheet's columns before the figures, by cut (spec B5 §3.5). */
const LEAD: Record<Kesim, Column[]> = {
  guruh: [
    { header: 'Guruh', width: 24, value: withMarks },
    { header: 'Kurs', width: 22, value: (r) => r.sub },
    {
      header: 'Ustoz',
      width: 30,
      value: (r) => (r.teachers ?? []).join(', '),
    },
  ],
  ustoz: [
    { header: 'Ustoz', width: 28, value: (r) => r.name },
    { header: 'Guruhlar', width: 12, value: (r) => r.sub },
  ],
  kurs: [
    { header: 'Kurs', width: 28, value: (r) => r.name },
    { header: 'Guruhlar', width: 12, value: (r) => r.sub },
  ],
};
const FIGURES = [
  "O'quvchi",
  'Hisoblandi',
  "To'landi",
  'Qoldi',
  'Foiz',
  "To'lamagan",
];
const STUDENT_COLUMNS = [
  { header: 'Guruh', width: 22 },
  { header: 'Ustoz', width: 30 },
  { header: "O'quvchi", width: 28 },
  { header: 'ID', width: 8 },
  { header: 'Telefon', width: 14 },
  { header: 'Hisoblandi', width: 14 },
  { header: "To'landi", width: 14 },
  { header: 'Qoldi', width: 14 },
  { header: 'Holat', width: 14 },
  { header: 'Belgi', width: 18 },
];

/** Sheet 1: the table of the open cut with its filters, every page, and «Jami». Sheet 2: every student–group line (spec B5 §5.4). */
export async function groupPaymentsWorkbook(input: {
  kesim: Kesim;
  rows: readonly GpRow[];
  students: readonly GpSheetStudent[];
  /** Ustozlar cut with a two-teacher group: adds the note under «Jami». */
  multiTeacherNote?: boolean;
}): Promise<Buffer> {
  const wb = new Workbook();
  const lead = LEAD[input.kesim];
  const ws = wb.addWorksheet(SHEET[input.kesim]);
  ws.columns = [
    { header: '#', width: 6 },
    ...lead.map((c) => ({ header: c.header, width: c.width })),
    ...FIGURES.map((header) => ({ header, width: 14 })),
  ];
  ws.getRow(1).font = { bold: true };
  input.rows.forEach((r, i) =>
    ws.addRow([
      i + 1,
      ...lead.map((c) => c.value(r)),
      r.students,
      r.charged,
      r.paid,
      r.unpaid,
      r.paidPct ?? '',
      r.unpaidStudents,
    ]),
  );
  // «Jami» leaves «O'quvchi» and «To'lamagan» blank: students overlap across groups, so a sum would overcount.
  const sum = (k: 'charged' | 'paid' | 'unpaid') =>
    input.rows.reduce((s, r) => s + r[k], 0);
  ws.addRow([
    'Jami',
    ...lead.map(() => ''),
    '',
    sum('charged'),
    sum('paid'),
    sum('unpaid'),
    paidPctOf(sum('paid'), sum('charged')) ?? '',
    '',
  ]).font = { bold: true };
  if (input.kesim === 'ustoz' && input.multiTeacherNote) {
    ws.addRow([MULTI_TEACHER_NOTE]).font = {
      italic: true,
      color: { argb: 'FF808080' },
    };
  }

  const st = wb.addWorksheet("O'quvchilar");
  st.columns = STUDENT_COLUMNS;
  st.getRow(1).font = { bold: true };
  for (const s of input.students) {
    st.addRow([
      s.groupName,
      s.teachers.join(', '),
      `${s.firstName} ${s.lastName}`.trim(),
      s.id,
      s.phone,
      s.charged,
      s.paid,
      s.unpaid,
      PAY_STATUS_LABEL[s.status],
      s.mark ? STUDENT_MARK_LABEL[s.mark] : '',
    ]);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
