import { Workbook } from 'exceljs';
import { centerActivityWorkbook } from './center-activity.excel';
import { WEEK_DAYS } from './center-activity.types';
import type { CenterOverview } from './center-activity.types';

const overview = {
  month: '2026-09',
  asOf: '2026-09-30T18:59:59.999Z',
  current: false,
  branches: [{ id: 1, name: "Farg'ona", rooms: 1 }],
  cards: {
    occupancyPct: 27.4,
    lessonHoursPerWeek: 215,
    workWindow: { start: '08:00', end: '22:30' },
    seats: { pct: 69.6, enrolled: 472, capacity: 678 },
    free: { seats: 206, revenue: 93_000_000 },
  },
  heat: null,
  rooms: [
    {
      id: 'r1',
      name: '1-xona',
      branchId: 1,
      branchName: "Farg'ona",
      capacity: 16,
      groupCount: 3,
      lessonHours: 20,
      occupancyPct: 23,
    },
  ],
  groups: [],
  months: [
    { month: '2026-08', pct: 25 },
    { month: '2026-09', pct: 27.4 },
  ],
  notes: { deletedLater: 2, unplaced: 1 },
} as CenterOverview;

describe('centerActivityWorkbook', () => {
  it('writes the four sheets with the page figures', async () => {
    const buffer = await centerActivityWorkbook({
      month: '2026-09',
      overview,
      groups: [
        {
          id: 'g1',
          name: 'A1-04',
          courseName: 'Standart',
          branchId: 1,
          roomId: 'r1',
          days: ['monday', 'wednesday'],
          start: '10:00',
          end: '11:30',
          enrolled: 7,
          capacity: 16,
          free: 9,
          overfull: false,
          monthlyPrice: 450_000,
        },
      ],
      heats: [
        {
          branchName: "Farg'ona",
          heat: {
            rooms: 1,
            days: [...WEEK_DAYS],
            hours: [8, 9],
            cells: WEEK_DAYS.map(() => [
              { free: 1, tone: 'green' as const },
              { free: 0, tone: 'red' as const },
            ]),
          },
        },
      ],
    });
    const wb = new Workbook();
    await wb.xlsx.load(buffer as never);
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'Xonalar',
      'Guruhlar',
      'Soatlar',
      'Oylar',
    ]);

    const rooms = wb.getWorksheet('Xonalar')!;
    expect(rooms.getRow(1).values).toEqual(
      expect.arrayContaining([
        'Xona',
        'Filial',
        "O'rin",
        'Guruhlar',
        'Dars soati (hafta)',
        'Bandlik, %',
      ]),
    );
    expect(rooms.getRow(2).getCell(1).value).toBe('1-xona');

    const groups = wb.getWorksheet('Guruhlar')!;
    expect(groups.getRow(2).getCell(1).value).toBe('A1-04');
    expect(groups.getRow(2).getCell(3).value).toBe('Du-Chor 10:00–11:30');

    const hours = wb.getWorksheet('Soatlar')!;
    expect(hours.getRow(1).getCell(1).value).toBe("Farg'ona");
    const months = wb.getWorksheet('Oylar')!;
    expect(months.getRow(3).getCell(1).value).toBe('2026-09');
    expect(months.getRow(3).getCell(2).value).toBe(27.4);
  });
});
