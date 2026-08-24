import { Workbook, Worksheet } from 'exceljs';
import { studentsSheet } from './reports-excel.students-sheet';
import { StudentFlow } from './reports-student-flow.service';
import { cellText } from './reports-excel.helpers';

const flow: StudentFlow = {
  month: '2026-07',
  attended: 444,
  inGroup: 427,
  groupless: 76,
  byStatus: [
    { status: 'ACTIVE', count: 503 },
    { status: 'FROZEN', count: 184 },
    { status: 'EXPELLED', count: 134 },
    { status: 'GRADUATED', count: 3 },
  ],
  totalStudents: 824,
  arrived: 72,
  left: { frozen: 73, expelled: 41, graduated: 20, archived: 0, total: 134 },
  netChange: -62,
  dropped: {
    records: 130,
    students: 118,
    stillInGroup: 37,
    groupless: 81,
    grouplessByStatus: [
      { status: 'EXPELLED', count: 35 },
      { status: 'ACTIVE', count: 30 },
      { status: 'FROZEN', count: 13 },
      { status: 'ARCHIVED', count: 3 },
    ],
  },
};

const textOf = (ws: Worksheet): string => {
  const out: string[] = [];
  ws.eachRow((r) => out.push(cellText(r.getCell(1).value)));
  return out.join('\n');
};
const valueFor = (ws: Worksheet, label: string): any => {
  let v: any;
  ws.eachRow((r) => {
    if (v === undefined && cellText(r.getCell(1).value) === label)
      v = r.getCell(2).value;
  });
  return v;
};

describe('studentsSheet', () => {
  let ws: Worksheet;
  beforeEach(() => {
    const wb = new Workbook();
    studentsSheet(
      wb,
      flow,
      'Davr: 01.07.2026 — 31.07.2026',
      'Barcha filiallar',
    );
    ws = wb.getWorksheet("O'quvchilar")!;
  });

  it('leads with who actually attended', () => {
    expect(valueFor(ws, 'Darsga qatnashdi (Iyul 2026)')).toBe(444);
  });

  it('flags the groupless "active" students', () => {
    expect(valueFor(ws, "Guruhsiz (statusi faol, guruhi yo'q)")).toBe(76);
  });

  it('translates statuses into Uzbek', () => {
    const t = textOf(ws);
    expect(t).toContain('Muzlatilgan');
    expect(t).toContain('Chetlatilgan');
    expect(t).not.toContain('FROZEN');
    expect(t).not.toContain('EXPELLED');
  });

  it('shows where dropped students actually went', () => {
    expect(valueFor(ws, "Boshqa guruhda o'qishda davom etyapti")).toBe(37);
    expect(valueFor(ws, "Hech qaysi guruhda yo'q")).toBe(81);
  });

  it('never claims a dropped enrollment means leaving the centre', () => {
    expect(textOf(ws)).toContain("o'qishni tashladi degani EMAS");
  });

  it('carries no share column', () => {
    let header: any[] = [];
    ws.eachRow((r) => {
      if (cellText(r.getCell(1).value) === "Ko'rsatkich") {
        header = [r.getCell(2).value, r.getCell(3).value];
      }
    });
    expect(header[0]).toBe('Soni');
    expect(String(header[1] ?? '')).not.toContain('%');
  });
});
