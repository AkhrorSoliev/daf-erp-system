import { Workbook, type Worksheet } from 'exceljs';
import { DAY_SHORT, type CenterOverview } from './center-activity.types';
import type { Heat } from './center-heat';
import type { GroupResult } from './center-metrics';

export interface CenterExcelInput {
  month: string;
  overview: CenterOverview;
  /** Every open group with a counted seat, free or full. */
  groups: GroupResult[];
  heats: { branchName: string; heat: Heat }[];
}

const daysLabel = (days: GroupResult['days']) =>
  days.map((d) => DAY_SHORT[d]).join('-');

function header(sheet: Worksheet, titles: [string, number][]) {
  sheet.columns = titles.map(([title, width]) => ({ header: title, width }));
  sheet.getRow(1).font = { bold: true };
}

/** The workbook of the page (spec B7b §5): rooms, groups, free-rooms table per branch, months. */
export async function centerActivityWorkbook(
  input: CenterExcelInput,
): Promise<Buffer> {
  const wb = new Workbook();

  const rooms = wb.addWorksheet('Xonalar');
  header(rooms, [
    ['Xona', 22],
    ['Filial', 20],
    ["O'rin", 10],
    ['Guruhlar', 10],
    ['Dars soati (hafta)', 18],
    ['Bandlik, %', 12],
  ]);
  for (const r of input.overview.rooms) {
    rooms.addRow([
      r.name,
      r.branchName,
      r.capacity ?? '',
      r.groupCount,
      r.lessonHours,
      r.occupancyPct ?? '',
    ]);
  }

  const groups = wb.addWorksheet('Guruhlar');
  header(groups, [
    ['Guruh', 22],
    ['Kurs', 22],
    ['Jadval', 24],
    ["O'quvchi", 10],
    ["O'rin", 10],
    ["Bo'sh", 10],
    ['Holat', 18],
  ]);
  for (const g of input.groups) {
    groups.addRow([
      g.name,
      g.courseName,
      `${daysLabel(g.days)} ${g.start ?? ''}${g.end ? `–${g.end}` : ''}`.trim(),
      g.enrolled,
      g.capacity,
      g.free,
      g.overfull ? "sig'imdan oshgan" : '',
    ]);
  }

  const hours = wb.addWorksheet('Soatlar');
  hours.columns = [
    { width: 16 },
    ...Array.from({ length: 24 }, () => ({ width: 6 })),
  ];
  for (const { branchName, heat } of input.heats) {
    hours.addRow([branchName]).font = { bold: true };
    hours.addRow([
      '',
      ...heat.hours.map((h) => `${String(h).padStart(2, '0')}:00`),
    ]).font = { bold: true };
    heat.days.forEach((day, di) => {
      hours.addRow([DAY_SHORT[day], ...heat.cells[di].map((c) => c.free)]);
    });
    hours.addRow([]);
  }

  const months = wb.addWorksheet('Oylar');
  header(months, [
    ['Oy', 12],
    ['Bandlik, %', 12],
  ]);
  for (const m of input.overview.months) months.addRow([m.month, m.pct ?? '']);

  return Buffer.from(await wb.xlsx.writeBuffer());
}
