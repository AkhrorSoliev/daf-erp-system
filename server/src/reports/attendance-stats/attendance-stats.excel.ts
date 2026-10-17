import { Workbook, type Worksheet } from 'exceljs';
import type {
  CutKey,
  CutRow,
  MisserRow,
  OverviewCore,
} from './attendance-stats.types';

export interface AttendanceExcelInput {
  overview: OverviewCore;
  /** Every row of every cut — the min-row rule does not apply in the file (spec §9). */
  cuts: Record<CutKey, CutRow[]>;
  missers: MisserRow[];
}

const CUT_NAME: Record<CutKey, string> = {
  group: 'Guruh',
  teacher: 'Ustoz',
  course: 'Kurs',
};
const CUT_ORDER: CutKey[] = ['group', 'teacher', 'course'];
const days = (r: { startDate: string; endDate: string }) =>
  `${r.startDate} — ${r.endDate}`;

function header(sheet: Worksheet, titles: [string, number][]) {
  sheet.columns = titles.map(([title, width]) => ({ header: title, width }));
  sheet.getRow(1).font = { bold: true };
}

/** The workbook of the page (spec B7c §9): the same `buildOverview` answer, every cut row, every 3+ pair. */
export async function attendanceWorkbook(
  i: AttendanceExcelInput,
): Promise<Buffer> {
  const wb = new Workbook();
  const o = i.overview;
  const c = o.card.counts;

  const sum = wb.addWorksheet('Umumiy');
  header(sum, [
    ["Ko'rsatkich", 40],
    ['Qiymat', 22],
  ]);
  const lines: [string, number | string][] = [
    ['Davr', days(o.range)],
    ['Davomat, %', o.card.rate ?? ''],
    ['Oldingi davr', o.previous ? days(o.previous) : ''],
    ['Oldingi davr davomati, %', o.card.previousRate ?? ''],
    ["O'tilishi kerak bo'lgan darslar", o.card.lessons],
    ['Kelishgan', o.card.attended],
    ['Keldi', c.came],
    ['Kechikdi', c.late],
    ['Kelmadi', c.absent],
    ['Sababli (foizga kirmaydi)', c.excused],
    ['Markaz bekor qildi (foizga kirmaydi)', c.cancelled],
    ['Sababli darslar (oylik kurslar)', o.credit.lessons],
    ["Sababli darsli o'quvchilar", o.credit.students],
    ["Taxminiy chegirma, so'm", o.credit.amount ?? "chegirma o'chirilgan"],
  ];
  for (const line of lines) sum.addRow(line);

  const months = wb.addWorksheet('Oylar');
  header(months, [
    ['Oy', 12],
    ['Davomat, %', 12],
    ['Keldi', 10],
    ['Kechikdi', 10],
    ['Kelmadi', 10],
    ['Sababli', 10],
    ['Markaz bekor qildi', 18],
    ['Izoh', 16],
  ]);
  for (const m of o.months) {
    months.addRow([
      m.month,
      m.rate ?? '',
      m.counts.came,
      m.counts.late,
      m.counts.absent,
      m.counts.excused,
      m.counts.cancelled,
      m.partial ? 'oy tugamagan' : '',
    ]);
  }

  const cut = wb.addWorksheet('Kesim');
  header(cut, [
    ['Kesim', 10],
    ['Nomi', 34],
    ['Davomat, %', 12],
    ['Darslar', 10],
    ['Keldi', 10],
    ['Kechikdi', 10],
    ['Kelmadi', 10],
    ['Sababli', 10],
    ["Ko'p qoldiruvchi", 16],
    ['Izoh', 14],
  ]);
  for (const k of CUT_ORDER) {
    for (const r of i.cuts[k]) {
      cut.addRow([
        CUT_NAME[k],
        r.name,
        r.rate ?? '',
        r.lessons,
        r.counts.came,
        r.counts.late,
        r.counts.absent,
        r.counts.excused,
        r.missers,
        r.deleted ? "o'chirilgan" : '',
      ]);
    }
  }

  const students = wb.addWorksheet("O'quvchilar");
  header(students, [
    ["O'quvchi", 28],
    ['Guruh', 22],
    ['Kelmadi', 10],
    ['Jami', 10],
  ]);
  for (const m of i.missers) {
    students.addRow([m.name, m.groupName, m.absent, m.lessons]);
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
