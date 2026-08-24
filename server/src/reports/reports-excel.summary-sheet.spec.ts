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
    cur: {
      np: np(),
      covered: 80_321_275,
      centerFunded: 15_513_272,
      recognized: 173_783_991,
    },
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
      // Closed month: nothing is left unpaid, so the full lesson value
      // collapses onto the recognised revenue — 142 064 938 + 25 486 916 +
      // 6 232 137 + 0.
      total: 173_783_991,
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
      byStatus: [
        { status: 'FROZEN', count: 184 },
        { status: 'EXPELLED', count: 134 },
      ],
      totalStudents: 824,
      arrived: 72,
      left: {
        frozen: 73,
        expelled: 41,
        graduated: 20,
        archived: 0,
        total: 134,
      },
      netChange: -62,
      dropped: {
        records: 130,
        students: 118,
        stillInGroup: 37,
        groupless: 81,
        grouplessByStatus: [
          { status: 'EXPELLED', count: 35 },
          { status: 'ACTIVE', count: 30 },
        ],
      },
    },
    ...over,
  }) as SummaryInput;

const textOf = (ws: Worksheet): string[] => {
  const out: string[] = [];
  ws.eachRow((r) => out.push(String(r.getCell(1).value ?? '')));
  return out;
};
// `col` defaults to the amount cell; column 3 is the «Jamidan %» cell that
// blocks 3/4/5 put beside it.
const valueFor = (ws: Worksheet, label: string, col = 2): any => {
  let v: any;
  ws.eachRow((r) => {
    if (v === undefined && String(r.getCell(1).value ?? '') === label)
      v = r.getCell(col).value;
  });
  return v;
};
const pctFor = (ws: Worksheet, label: string): any => valueFor(ws, label, 3);
// Locates a columnHeader row by its first cell and returns cols 2-4 — the
// header shape a `compareRow` call would put a previous-month label into.
// Block 6's "Ko'rsatkich" header collides in column 1 with blocks 1/2's real
// comparison header ("Ko'rsatkich" | curLabel | prevLabel | 'Farq' | 'Izoh'),
// so a second-cell value narrows to the right row when the label alone is
// ambiguous (block 6's is 'Soni', blocks 1/2's is the current-month label).
const headerCells = (
  ws: Worksheet,
  firstCellLabel: string,
  secondCellLabel?: string,
): any[] => {
  let cells: any[] = [];
  ws.eachRow((r) => {
    if (cells.length) return;
    if (String(r.getCell(1).value ?? '') !== firstCellLabel) return;
    if (
      secondCellLabel !== undefined &&
      String(r.getCell(2).value ?? '') !== secondCellLabel
    )
      return;
    cells = [2, 3, 4].map((c) => r.getCell(c).value);
  });
  return cells;
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
    expect(valueFor(ws, "Hali to'lanmay qolgan")).toBe(
      "Yo'q — hammasi to'langan",
    );
  });

  it('prints the unpaid amount when there is one', () => {
    const wb = new Workbook();
    summarySheetV2(
      wb,
      input({
        lessonMoney: {
          paidInMonth: 1,
          paidEarlier: 1,
          paidNextMonth: 1,
          unpaid: 143_884_239,
          total: 143_884_242,
        },
      }),
    );
    expect(valueFor(wb.getWorksheet('Xulosa')!, "Hali to'lanmay qolgan")).toBe(
      143_884_239,
    );
  });

  // Block 4's denominator is the month's FULL lesson value, not its recognised
  // revenue. In a CLOSED month the two are the same figure, which is why this
  // pair of tests exists: the July case pins the customer-approved output, the
  // August case is the one that used to print four rows summing to ~169 mln
  // under a 25.5 mln total with percentages to match.
  it('totals a CLOSED month at its recognised revenue, unchanged', () => {
    // Production 2026-07 — the view the customer approved. Nothing unpaid, so
    // the full lesson value IS the recognised revenue and the output is the
    // same figure either way.
    expect(valueFor(ws, 'Iyul 2026 darslari qiymati')).toBe(173_783_991);
    expect(pctFor(ws, "Iyul 2026 ichida to'langan")).toBe(81.7);
    expect(pctFor(ws, "Iyul 2026dan oldin to'langan (balansdagi pul)")).toBe(
      14.7,
    );
    expect(pctFor(ws, "Avgust 2026da to'langan (kechikkan)")).toBe(3.6);
  });

  it('totals an IN-PROGRESS month at the full lesson value, above its recognised revenue', () => {
    // Production 2026-08 as of 07.08: recognised (held AND paid) 25 558 818,
    // still unpaid 143 884 239, full lesson value 169 443 057. Footing on the
    // recognised revenue printed four rows summing to ~169 mln under a
    // 25.5 mln total, with percentages to match.
    const wb = new Workbook();
    summarySheetV2(
      wb,
      input({
        month: '2026-08',
        prevMonth: '2026-07',
        nextMonthLabel: 'Sentabr 2026',
        cur: { np: np(), covered: 1, centerFunded: 1, recognized: 25_558_818 },
        lessonMoney: {
          paidInMonth: 18_000_000,
          paidEarlier: 7_558_818,
          paidNextMonth: 0,
          unpaid: 143_884_239,
          total: 169_443_057,
        },
      }),
    );
    const aug = wb.getWorksheet('Xulosa')!;

    const rows = [
      valueFor(aug, "Avgust 2026 ichida to'langan"),
      valueFor(aug, "Avgust 2026dan oldin to'langan (balansdagi pul)"),
      valueFor(aug, "Sentabr 2026da to'langan (kechikkan)"),
      valueFor(aug, "Hali to'lanmay qolgan"),
    ];
    const total = valueFor(aug, 'Avgust 2026 darslari qiymati');
    expect(total).toBe(169_443_057);
    expect(rows.reduce((a: number, b: number) => a + b, 0)).toBe(total);
    expect(total).toBeGreaterThan(25_558_818); // > recognised revenue

    expect(pctFor(aug, "Avgust 2026 ichida to'langan")).toBe(10.6);
    expect(pctFor(aug, "Avgust 2026dan oldin to'langan (balansdagi pul)")).toBe(
      4.5,
    );
    expect(pctFor(aug, "Sentabr 2026da to'langan (kechikkan)")).toBe(0);
    expect(pctFor(aug, "Hali to'lanmay qolgan")).toBe(84.9);
  });

  it('has no KASSADA QOLDI row', () => {
    expect(textOf(ws).join('\n')).not.toContain('KASSADA QOLDI');
  });

  it('carries no margin percentage and no point delta', () => {
    const t = textOf(ws).join('\n');
    expect(t).not.toContain("Har 100 so'm");
    expect(t).not.toContain('Sof marja');
  });

  it('reports the net student change as a count, not money', () => {
    let cell: any;
    ws.eachRow((r) => {
      if (String(r.getCell(1).value ?? '').startsWith("Sof o'zgarish"))
        cell = r.getCell(2);
    });
    expect(cell.value).toBe(-62);
    expect(cell.numFmt).toBe('#,##0');
  });

  it('shows the payment count and payer count together', () => {
    expect(textOf(ws).join('\n')).toContain("530 ta to'lov · 387 ta o'quvchi");
  });

  // Customer demand 6: blocks 3-6 must never grow a comparison column. This
  // asserts the header ROW cells directly rather than a whole-sheet text
  // substring — a substring check can't tell "no header at all" apart from
  // "a header, containing the previous month's label", which is exactly the
  // historical defect (an empty 'Iyun 2026' column with nothing beneath it).
  it('locks blocks 3-6 header rows to their fixed shape — no comparison column can sneak back in', () => {
    const prevLabel = 'Iyun 2026';
    const block3 = headerCells(ws, 'Qaysi oyning darsi uchun');
    const block4 = headerCells(ws, "Qachon to'langan");
    const block5 = headerCells(ws, "Yo'nalish");
    const block6a = headerCells(ws, "Ko'rsatkich", 'Soni');
    const block6b = headerCells(ws, 'Iyul 2026 harakati');

    expect(block3).toEqual(['Summa', 'Jamidan %', '']);
    expect(block4).toEqual(['Summa', 'Jamidan %', '']);
    expect(block5).toEqual(['Summa', 'Jamidan %', '']);
    expect(block6a).toEqual(['Soni', '', '']);
    expect(block6b).toEqual(['Soni', '', '']);

    for (const cells of [block3, block4, block5, block6a, block6b]) {
      expect(cells).not.toContain(prevLabel);
    }
  });
});
