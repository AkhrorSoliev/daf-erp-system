import { Workbook } from 'exceljs';
import { departedWorkbook, type ExcelRow } from './departed.excel';
import type { DepartedOverview } from './departed.types';

// Made-up students, teachers and amounts.
const ROWS: ExcelRow[] = [
  {
    fullName: 'Aziza Rahimova',
    studentId: 10002,
    phone: '901112200',
    branch: 'Bosh filial',
    course: 'Nemis tili A1',
    group: 'A1-01',
    teachers: 'Olim Karimov, Dilnoza Aliyeva',
    departedOn: '2026-10-12',
    studyMonths: 4,
    reason: 'Narx',
    comment: 'Izoh matni',
    state: 'ketgan',
    debt: 250_000,
  },
  {
    fullName: 'Zafar Nosirov',
    studentId: 10003,
    phone: '907770055',
    branch: '',
    course: '',
    group: '',
    teachers: '',
    departedOn: '2026-10-15',
    studyMonths: null,
    reason: 'Sabab yozilmagan',
    comment: '',
    state: 'kutilmoqda',
    debt: 0,
  },
];

const OVERVIEW: DepartedOverview = {
  range: { startDate: '2026-10-01', endDate: '2026-10-31' },
  previous: { startDate: '2026-09-01', endDate: '2026-09-30' },
  cards: {
    departed: 2,
    previousDeparted: 1,
    atStart: 40,
    per100: 5,
    avgStudyMonths: 4,
  },
  pendingToday: 1,
  months: [],
  reasons: [{ reasonId: 'r1', name: 'Narx', count: 2 }],
  cuts: {
    teacher: [
      { id: 't1', name: 'Olim Karimov', departed: 2, atStart: 20, share: 10 },
    ],
    course: [
      { id: 'c1', name: 'Nemis tili A1', departed: 2, atStart: 3, share: null },
    ],
    group: [],
    branch: [
      { id: '1', name: 'Bosh filial', departed: 2, atStart: 40, share: 5 },
    ],
  },
  uniqueDeparted: 2,
  teacherChange: { totalTeacherChanges: 0, departedAfterTeacherChange: 0 },
  graceDays: { LEFT_GROUP: 21, FROZEN: 60 },
};

async function read(rows = ROWS) {
  const buf = await departedWorkbook({ rows, overview: OVERVIEW });
  const wb = new Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return wb;
}

describe('departedWorkbook', () => {
  it('has the list sheet first and the summary second', async () => {
    const wb = await read();
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Ro'yxat", 'Xulosa']);
  });

  it('writes the thirteen headers in the agreed order', async () => {
    const ws = (await read()).getWorksheet("Ro'yxat")!;
    expect((ws.getRow(1).values as unknown[]).slice(1)).toEqual([
      "O'quvchi",
      'ID',
      'Telefon',
      'Filial',
      'Kurs',
      'Guruh',
      'Ustoz',
      'Ketgan sana',
      "O'qidi (oy)",
      'Sabab',
      'Izoh',
      'Holat',
      'Qarzi',
    ]);
  });

  it('writes a row with a numeric id and debt, comma-joined teachers and a state label', async () => {
    const ws = (await read()).getWorksheet("Ro'yxat")!;
    const r = ws.getRow(2);
    expect(r.getCell(1).value).toBe('Aziza Rahimova');
    expect(r.getCell(2).value).toBe(10002);
    expect(r.getCell(3).value).toBe('901112200');
    expect(r.getCell(7).value).toBe('Olim Karimov, Dilnoza Aliyeva');
    expect(r.getCell(8).value).toBe('2026-10-12');
    expect(r.getCell(9).value).toBe(4);
    expect(r.getCell(12).value).toBe('Ketgan');
    expect(r.getCell(13).value).toBe(250_000);
  });

  it('leaves unknown study months empty and labels a pending row', async () => {
    const r = (await read()).getWorksheet("Ro'yxat")!.getRow(3);
    expect(r.getCell(9).value).toBeNull();
    expect(r.getCell(12).value).toBe('Kutilmoqda');
    expect(r.getCell(13).value).toBe(0);
  });

  it('puts the cards, reasons and the four cuts on the summary sheet', async () => {
    const xs = (await read()).getWorksheet('Xulosa')!;
    const cells = xs
      .getSheetValues()
      .flatMap((v) => (Array.isArray(v) ? v.slice(1) : []))
      .map((v) => (typeof v === 'string' ? v : ''));
    expect(cells).toEqual(
      expect.arrayContaining([
        'Ketganlar 2026-10-01 — 2026-10-31',
        'Sabablar',
        'Narx',
        'Ustoz',
        'Kurs',
        'Guruh',
        'Filial',
        'Olim Karimov',
      ]),
    );
  });

  it('handles an empty list', async () => {
    const ws = (await read([])).getWorksheet("Ro'yxat")!;
    expect(ws.rowCount).toBe(1);
  });
});
