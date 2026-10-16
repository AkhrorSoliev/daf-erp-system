import { Workbook } from 'exceljs';
import { groupPaymentsWorkbook } from './group-payments.excel';
import type { GpRow, GpSheetStudent } from './group-payments.math';

// Made-up groups, people and amounts.
const ROWS: GpRow[] = [
  {
    id: 'g2',
    name: 'B1-02',
    sub: 'Nemis tili B1',
    teachers: [],
    marks: ['yopilgan'],
    students: 1,
    charged: 300_000,
    paid: 60_000,
    unpaid: 240_000,
    paidPct: 20,
    unpaidStudents: 1,
  },
  {
    id: 'g1',
    name: 'A1-01',
    sub: 'Nemis tili A1',
    teachers: ['Aziza Rahimova', 'Olim Karimov'],
    marks: [],
    students: 2,
    charged: 900_000,
    paid: 540_000,
    unpaid: 360_000,
    paidPct: 60,
    unpaidStudents: 1,
  },
];
const STUDENTS: GpSheetStudent[] = [
  {
    id: 10002,
    firstName: 'Ikkinchi',
    lastName: 'Ism',
    phone: '900000002',
    charged: 450_000,
    paid: 90_000,
    unpaid: 360_000,
    status: 'qisman',
    mark: 'muzlatilgan',
    groupName: 'A1-01',
    teachers: ['Aziza Rahimova', 'Olim Karimov'],
  },
  {
    id: 10003,
    firstName: 'Uchinchi',
    lastName: 'Ism',
    phone: '900000003',
    charged: 300_000,
    paid: 0,
    unpaid: 300_000,
    status: 'tolamagan',
    mark: 'chiqqan',
    groupName: 'B1-02',
    teachers: [],
  },
];

async function load(
  kesim: 'guruh' | 'ustoz' | 'kurs',
  rows = ROWS,
  multiTeacherNote = false,
  students = STUDENTS,
) {
  const buf = await groupPaymentsWorkbook({
    kesim,
    rows,
    students,
    multiTeacherNote,
  });
  const wb = new Workbook();
  await wb.xlsx.load(buf as never);
  return wb;
}
const cells = (wb: Workbook, sheet: string, n: number) =>
  (wb.getWorksheet(sheet)!.getRow(n).values as unknown[]).slice(1);

describe('groupPaymentsWorkbook (spec B5 §5.4)', () => {
  it("two sheets: the cut and «O'quvchilar»", async () => {
    expect((await load('guruh')).worksheets.map((w) => w.name)).toEqual([
      'Guruhlar',
      "O'quvchilar",
    ]);
    expect((await load('ustoz')).worksheets[0].name).toBe('Ustozlar');
    expect((await load('kurs')).worksheets[0].name).toBe('Kurslar');
  });

  it('the Guruhlar sheet: the table columns, marks beside the name, the total row', async () => {
    const wb = await load('guruh');
    expect(cells(wb, 'Guruhlar', 1)).toEqual([
      '#',
      'Guruh',
      'Kurs',
      'Ustoz',
      "O'quvchi",
      'Hisoblandi',
      "To'landi",
      'Qoldi',
      'Foiz',
      "To'lamagan",
    ]);
    expect(cells(wb, 'Guruhlar', 3)).toEqual([
      2,
      'A1-01',
      'Nemis tili A1',
      'Aziza Rahimova, Olim Karimov',
      2,
      900_000,
      540_000,
      360_000,
      60,
      1,
    ]);
    const ws = wb.getWorksheet('Guruhlar')!;
    expect(ws.getRow(2).getCell(2).value).toBe('B1-02 (yopilgan)');
    const total = ws.getRow(4);
    expect([1, 6, 7, 8, 9].map((c) => total.getCell(c).value)).toEqual([
      'Jami',
      1_200_000,
      600_000,
      600_000,
      50,
    ]);
  });

  it('the Ustozlar sheet leads with the teacher and his group count', async () => {
    const teacherRow: GpRow = {
      id: '20001',
      name: 'Olim Karimov',
      sub: '2 guruh',
      marks: [],
      students: 3,
      charged: 1_550_000,
      paid: 950_000,
      unpaid: 600_000,
      paidPct: 61.3,
      unpaidStudents: 2,
    };
    const wb = await load('ustoz', [teacherRow]);
    expect(cells(wb, 'Ustozlar', 1)).toEqual([
      '#',
      'Ustoz',
      'Guruhlar',
      "O'quvchi",
      'Hisoblandi',
      "To'landi",
      'Qoldi',
      'Foiz',
      "To'lamagan",
    ]);
    expect(cells(wb, 'Ustozlar', 2)).toEqual([
      1,
      'Olim Karimov',
      '2 guruh',
      3,
      1_550_000,
      950_000,
      600_000,
      61.3,
      2,
    ]);
  });

  it('the student sheet: one line per student and group, status and mark in words', async () => {
    const wb = await load('guruh');
    expect(cells(wb, "O'quvchilar", 1)).toEqual([
      'Guruh',
      'Ustoz',
      "O'quvchi",
      'ID',
      'Telefon',
      'Hisoblandi',
      "To'landi",
      'Qoldi',
      'Holat',
      'Belgi',
    ]);
    expect(cells(wb, "O'quvchilar", 2)).toEqual([
      'A1-01',
      'Aziza Rahimova, Olim Karimov',
      'Ikkinchi Ism',
      10002,
      '900000002',
      450_000,
      90_000,
      360_000,
      'qisman',
      'muzlatilgan',
    ]);
    expect(wb.getWorksheet("O'quvchilar")!.getRow(3).getCell(9).value).toBe(
      "to'lamagan",
    );
    expect(wb.getWorksheet("O'quvchilar")!.getRow(3).getCell(10).value).toBe(
      'guruhdan chiqqan',
    );
  });

  const NOTE =
    "Ikki ustozli guruh har ikkala ustozda sanaladi — ustozlar yig'indisi jamidan katta bo'lishi mumkin.";
  const TEACHER: GpRow = {
    id: '20001',
    name: 'Olim Karimov',
    sub: '1 guruh',
    marks: [],
    students: 1,
    charged: 900_000,
    paid: 540_000,
    unpaid: 360_000,
    paidPct: 60,
    unpaidStudents: 1,
  };

  it('the Ustozlar sheet carries the two-teacher note under «Jami» only with the flag', async () => {
    const ws = (await load('ustoz', [TEACHER], true)).getWorksheet('Ustozlar')!;
    expect(ws.getRow(3).getCell(1).value).toBe('Jami');
    expect(ws.getRow(4).getCell(1).value).toBe(NOTE);
    expect(
      (await load('ustoz', [TEACHER], false)).getWorksheet('Ustozlar')!
        .rowCount,
    ).toBe(3);
  });

  it('Guruhlar and Kurslar never carry the note', async () => {
    for (const kesim of ['guruh', 'kurs'] as const) {
      const ws = (await load(kesim, ROWS, true)).worksheets[0];
      expect(ws.rowCount).toBe(4);
    }
  });

  it('labels deleted groups, archived and fully paid students, a null percentage', async () => {
    const row: GpRow = {
      ...ROWS[0],
      marks: ['ochirilgan', 'yopilgan'],
      paidPct: null,
    };
    const students: GpSheetStudent[] = [
      { ...STUDENTS[0], status: 'toladi', mark: 'arxivda' },
    ];
    const wb = await load('guruh', [row], false, students);
    const ws = wb.getWorksheet('Guruhlar')!;
    expect(ws.getRow(2).getCell(2).value).toBe("B1-02 (o'chirilgan, yopilgan)");
    expect(ws.getRow(2).getCell(9).value).toBe('');
    const st = wb.getWorksheet("O'quvchilar")!.getRow(2);
    expect([st.getCell(9).value, st.getCell(10).value]).toEqual([
      "to'ladi",
      'arxivda',
    ]);
  });

  it('an empty table still has the headers and a «Jami» of zeros with a blank percentage', async () => {
    const ws = (await load('guruh', [])).getWorksheet('Guruhlar')!;
    expect(ws.rowCount).toBe(2);
    expect([1, 6, 7, 8, 9].map((c) => ws.getRow(2).getCell(c).value)).toEqual([
      'Jami',
      0,
      0,
      0,
      '',
    ]);
  });
});
