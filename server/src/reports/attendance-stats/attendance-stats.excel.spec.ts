import { Workbook } from 'exceljs';
import { attendanceWorkbook } from './attendance-stats.excel';
import type { CutRow, OverviewCore } from './attendance-stats.types';

const counts = { came: 99, late: 5, absent: 40, excused: 2, cancelled: 1 };
const overview = {
  range: { startDate: '2026-09-01', endDate: '2026-09-30' },
  previous: { startDate: '2026-08-01', endDate: '2026-08-31' },
  card: { counts, lessons: 144, attended: 104, rate: 72.2, previousRate: 50 },
  months: [
    {
      month: '2026-08',
      counts: { came: 10, late: 0, absent: 10, excused: 0, cancelled: 0 },
      rate: 50,
      partial: false,
    },
    { month: '2026-09', counts, rate: 72.2, partial: false },
  ],
  weekdays: [],
  credit: {
    lessons: 2,
    students: 2,
    amount: 60_000,
    enabled: true,
    uncharged: 0,
  },
  cut: {
    key: 'group',
    rows: [],
    total: 0,
    hidden: 0,
    minLessons: 60,
    page: 1,
    pageSize: 10,
  },
} as OverviewCore;
const row = (key: string, name: string, deleted = false): CutRow => ({
  key,
  name,
  deleted,
  counts,
  lessons: 144,
  rate: 72.2,
  missers: 2,
});

describe('attendanceWorkbook', () => {
  it("writes the four sheets with the page's figures as numbers", async () => {
    const buffer = await attendanceWorkbook({
      overview,
      cuts: {
        group: [row('g2', 'A1-13 · Otabek Sobirov', true)],
        teacher: [row('7', 'Otabek Sobirov')],
        course: [row('c1', 'Standart')],
      },
      missers: [
        {
          studentId: 20,
          groupId: 'g2',
          absent: 4,
          lessons: 4,
          name: 'Bobur Aliyev',
          groupName: 'A1-13',
        },
      ],
    });
    const wb = new Workbook();
    await wb.xlsx.load(buffer as never);
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'Umumiy',
      'Oylar',
      'Kesim',
      "O'quvchilar",
    ]);

    const sum = wb.getWorksheet('Umumiy')!;
    expect(sum.getRow(3).getCell(1).value).toBe('Davomat, %');
    expect(sum.getRow(3).getCell(2).value).toBe(72.2);
    expect(sum.getRow(5).getCell(1).value).toBe('Oldingi davr davomati, %');
    expect(sum.getRow(5).getCell(2).value).toBe(50);
    expect(sum.getRow(6).getCell(2).value).toBe(144);

    const months = wb.getWorksheet('Oylar')!;
    expect(months.getRow(3).getCell(1).value).toBe('2026-09');
    expect(months.getRow(3).getCell(2).value).toBe(72.2);

    const cut = wb.getWorksheet('Kesim')!;
    expect(cut.getRow(2).getCell(1).value).toBe('Guruh');
    expect(cut.getRow(2).getCell(10).value).toBe("o'chirilgan");
    expect(cut.getRow(3).getCell(1).value).toBe('Ustoz');
    expect(cut.getRow(4).getCell(1).value).toBe('Kurs');

    const st = wb.getWorksheet("O'quvchilar")!;
    expect([1, 2, 3, 4].map((n) => st.getRow(2).getCell(n).value)).toEqual([
      'Bobur Aliyev',
      'A1-13',
      4,
      4,
    ]);
  });

  it("writes «chegirma o'chirilgan» and blanks for a missing figure", async () => {
    const buffer = await attendanceWorkbook({
      overview: {
        ...overview,
        previous: null,
        card: { ...overview.card, previousRate: null },
        credit: { ...overview.credit, amount: null, enabled: false },
      },
      cuts: { group: [], teacher: [], course: [] },
      missers: [],
    });
    const wb = new Workbook();
    await wb.xlsx.load(buffer as never);
    const sum = wb.getWorksheet('Umumiy')!;
    expect(sum.getRow(5).getCell(2).text).toBe('');
    expect(sum.getRow(15).getCell(2).value).toBe("chegirma o'chirilgan");
  });
});
