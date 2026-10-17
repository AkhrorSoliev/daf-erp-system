import { Workbook } from 'exceljs';
import type { CutKey, DepartedOverview, ListState } from './departed.types';

export interface ExcelRow {
  fullName: string;
  studentId: number;
  phone: string;
  branch: string;
  course: string;
  group: string;
  /** Joined with a comma. */
  teachers: string;
  /** Tashkent day, YYYY-MM-DD. */
  departedOn: string;
  studyMonths: number | null;
  reason: string;
  comment: string;
  state: ListState;
  /** so'm, a whole number. */
  debt: number;
}

const STATE_LABEL: Record<ListState, string> = {
  ketgan: 'Ketgan',
  kutilmoqda: 'Kutilmoqda',
  qaytgan: 'Qaytgan',
};

const COLUMNS = [
  { header: "O'quvchi", width: 28 },
  { header: 'ID', width: 8 },
  { header: 'Telefon', width: 14 },
  { header: 'Filial', width: 18 },
  { header: 'Kurs', width: 22 },
  { header: 'Guruh', width: 18 },
  { header: 'Ustoz', width: 30 },
  { header: 'Ketgan sana', width: 14 },
  { header: "O'qidi (oy)", width: 12 },
  { header: 'Sabab', width: 22 },
  { header: 'Izoh', width: 30 },
  { header: 'Holat', width: 14 },
  { header: 'Qarzi', width: 14 },
];

const CUTS: [CutKey, string][] = [
  ['teacher', 'Ustoz'],
  ['course', 'Kurs'],
  ['group', 'Guruh'],
  ['branch', 'Filial'],
];

/** Sheet 1: every row of the filtered list. Sheet 2: the page's top part — cards, reasons and the four cuts. */
export async function departedWorkbook(input: {
  rows: readonly ExcelRow[];
  overview: DepartedOverview;
}): Promise<Buffer> {
  const wb = new Workbook();
  const ws = wb.addWorksheet("Ro'yxat");
  ws.columns = COLUMNS;
  ws.getRow(1).font = { bold: true };
  for (const r of input.rows) {
    ws.addRow([
      r.fullName,
      r.studentId,
      r.phone,
      r.branch,
      r.course,
      r.group,
      r.teachers,
      r.departedOn,
      r.studyMonths,
      r.reason,
      r.comment,
      STATE_LABEL[r.state],
      r.debt,
    ]);
  }

  const { cards, reasons, cuts, range, uniqueDeparted } = input.overview;
  const xs = wb.addWorksheet('Xulosa');
  xs.columns = [{ width: 38 }, { width: 16 }, { width: 16 }, { width: 16 }];
  const section = (title: string, header: string[]) => {
    if (xs.rowCount) xs.addRow([]);
    xs.addRow([title]).font = { bold: true, size: 12 };
    xs.addRow(header).font = { bold: true };
  };
  section(`Ketganlar ${range.startDate} — ${range.endDate}`, [
    "Ko'rsatkich",
    'Qiymat',
  ]);
  xs.addRows([
    ['Ketganlar', cards.departed],
    ['Oldingi davrda', cards.previousDeparted ?? ''],
    ["Davr boshida o'qiyotgan edi", cards.atStart],
    ["Har 100 o'quvchidan", cards.per100 ?? ''],
    ["O'rtacha o'qigan (oy)", cards.avgStudyMonths ?? ''],
    ["Ketgan o'quvchilar (har biri bir marta)", uniqueDeparted],
  ]);
  section('Sabablar', ['Sabab', 'Soni']);
  xs.addRows(reasons.map((r) => [r.name, r.count]));
  for (const [key, title] of CUTS) {
    section(title, [title, 'Ketgan', 'Davr boshida', 'Ulushi (%)']);
    xs.addRows(
      cuts[key].map((c) => [c.name, c.departed, c.atStart, c.share ?? '']),
    );
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
