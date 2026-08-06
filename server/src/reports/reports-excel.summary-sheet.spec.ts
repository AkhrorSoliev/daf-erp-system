import { Workbook, Worksheet } from 'exceljs';
import { summarySheetV2, SummaryInput } from './reports-excel.summary-sheet';

const np = (over: any = {}) => ({
  revenue: 173_783_991,
  revenueBasis: 'recognized',
  teacherSalary: 95_834_547,
  teacherSalaryBasis: 'hisoblangan',
  adminSalaryBasis: 'hisoblangan',
  teacherSalaryHasTopup: true,
  adminSalary: 0,
  operatingExpenses: 41_773_000,
  refunds: 200_000,
  netProfit: 35_976_444,
  netMarginPercent: 20.7,
  memo: { writeOffs: 0, providerFees: 0, advances: 16_430_000 },
  ...over,
});

const input = (over: Partial<SummaryInput> = {}): SummaryInput =>
  ({
    month: '2026-07',
    prevMonth: '2026-06',
    periodLine: 'Davr: 01.07.2026 — 31.07.2026 (Iyul 2026)',
    scopeLine: 'DaF Sprachzentrum · Barcha filiallar',
    cur: { np: np(), covered: 80_321_275, centerFunded: 15_513_272, recognized: 173_783_991 },
    prev: { np: np({ netProfit: 4_714_564 }), covered: 1, centerFunded: 1 },
    ownMoney: { cur: 142_064_938, prev: 133_621_653 },
    ownProfit: { cur: 4_257_391, prev: -26_750_444 },
    attribution: {
      total: 170_378_987,
      currentMonth: 142_064_938,
      late: [
        { label: 'Iyun 2026', amount: 24_877_418 },
        { label: 'May 2026', amount: 3_436_631 },
      ],
    },
    paymentCount: 530,
    payerCount: 387,
    lessonMoney: {
      paidInMonth: 142_064_938,
      paidEarlier: 25_486_916,
      paidNextMonth: 6_232_137,
      unpaid: 0,
    },
    nextMonthLabel: 'Avgust 2026',
    cashOut: [
      { label: 'Ijara', amount: 18_000_000 },
      { label: 'Ustozga avans', amount: 16_430_000 },
    ],
    students: {
      month: '2026-07',
      attended: 444,
      inGroup: 427,
      groupless: 76,
      byStatus: [{ status: 'FROZEN', count: 184 }, { status: 'EXPELLED', count: 134 }],
      totalStudents: 824,
      arrived: 72,
      left: { frozen: 73, expelled: 41, graduated: 20, archived: 0, total: 134 },
      netChange: -62,
      dropped: {
        records: 130, students: 118, stillInGroup: 37, groupless: 81,
        grouplessByStatus: [{ status: 'EXPELLED', count: 35 }, { status: 'ACTIVE', count: 30 }],
      },
    },
    ...over,
  }) as SummaryInput;

const textOf = (ws: Worksheet): string[] => {
  const out: string[] = [];
  ws.eachRow((r) => out.push(String(r.getCell(1).value ?? '')));
  return out;
};
const valueFor = (ws: Worksheet, label: string): any => {
  let v: any;
  ws.eachRow((r) => {
    if (v === undefined && String(r.getCell(1).value ?? '') === label) v = r.getCell(2).value;
  });
  return v;
};

describe('summarySheetV2', () => {
  let ws: Worksheet;
  beforeEach(() => {
    const wb = new Workbook();
    summarySheetV2(wb, input());
    ws = wb.getWorksheet('Xulosa')!;
  });

  it('renders all six blocks', () => {
    const t = textOf(ws).join('\n');
    expect(t).toContain('1.  NATIJA');
    expect(t).toContain("o'z xarajatini qopladimi");
    expect(t).toContain('3.  PUL QAYERDAN KELDI');
    expect(t).toContain('DARSLARINING PULI QAYERDAN KELGAN');
    expect(t).toContain('5.  PUL QAYERGA KETDI');
    expect(t).toContain("6.  O'QUVCHILAR");
  });

  it('names the revenue row so nobody reads it as cash', () => {
    expect(valueFor(ws, "O'tilgan darslar qiymati")).toBe(173_783_991);
    expect(textOf(ws).join('\n')).not.toContain('Dars tushumi (');
  });

  it('shows the center top-up as a sub-line inside the salary total', () => {
    expect(valueFor(ws, "markaz qo'shimchasi")).toBe(15_513_272);
    expect(valueFor(ws, "o'quvchilar to'lagan qismi")).toBe(80_321_275);
  });

  it('renders the own-month profit as its own headline', () => {
    expect(valueFor(ws, "=  IYUL 2026NING O'Z FOYDASI")).toBe(4_257_391);
  });

  it('spells out a fully collected month instead of printing a bare 0', () => {
    expect(valueFor(ws, "Hali to'lanmay qolgan")).toBe("Yo'q — hammasi to'langan");
  });

  it('prints the unpaid amount when there is one', () => {
    const wb = new Workbook();
    summarySheetV2(wb, input({
      lessonMoney: { paidInMonth: 1, paidEarlier: 1, paidNextMonth: 1, unpaid: 143_884_239 },
    }));
    expect(valueFor(wb.getWorksheet('Xulosa')!, "Hali to'lanmay qolgan")).toBe(143_884_239);
  });

  it('has no KASSADA QOLDI row', () => {
    expect(textOf(ws).join('\n')).not.toContain('KASSADA QOLDI');
  });

  it('carries no margin percentage and no point delta', () => {
    const t = textOf(ws).join('\n');
    expect(t).not.toContain("Har 100 so'm");
    expect(t).not.toContain('Sof marja');
  });

  it("reports the net student change as a count, not money", () => {
    let cell: any;
    ws.eachRow((r) => {
      if (String(r.getCell(1).value ?? '').startsWith("Sof o'zgarish")) cell = r.getCell(2);
    });
    expect(cell.value).toBe(-62);
    expect(cell.numFmt).toBe('#,##0');
  });

  it('shows the payment count and payer count together', () => {
    expect(textOf(ws).join('\n')).toContain("530 ta to'lov · 387 ta o'quvchi");
  });
});
