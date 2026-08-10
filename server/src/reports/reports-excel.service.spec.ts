import { Test, TestingModule } from '@nestjs/testing';
import { Workbook, Worksheet } from 'exceljs';
import { ReportsExcelService } from './reports-excel.service';
import { ReportsService } from './reports.service';

describe('ReportsExcelService', () => {
  let service: ReportsExcelService;
  let reports: any;

  // ---- Mock data tuned so every Tekshiruv tie reconciles (MOS). ----
  const pl = {
    period: { start: '2026-06-01', end: '2026-06-30' },
    revenue: { total: 1_000_000, byType: [{ type: 'TUITION', amount: 1_000_000, count: 5 }] },
    costOfServices: { teacherSalaries: 300_000, teacherAdvances: 20_000, total: 320_000 },
    grossProfit: 680_000,
    operatingExpenses: {
      byCategory: [{ category: 'RENT', amount: 200_000 }],
      adminSalaries: 100_000,
      total: 300_000,
    },
    netProfit: 380_000,
    margins: { grossMarginPercent: 68, netMarginPercent: 38 },
  };
  const bs = {
    asOf: '2026-06-14',
    assets: { cash: 600_000, accountsReceivable: 80_000, debtorCount: 3, total: 680_000 },
    liabilities: { salariesPayable: 50_000, deferredRevenue: 120_000, prepaidStudentCount: 8, total: 170_000 },
    equity: { retainedEarnings: 510_000, total: 510_000 },
    note: 'GL yo‘q — hosila',
  };
  const payments = {
    rows: [
      {
        createdAt: new Date('2026-06-10T08:00:00Z'),
        amount: 1_000_000,
        method: 'CASH',
        revenueType: 'TUITION',
        branchId: 1,
        student: { id: 10001, firstName: 'Ali', lastName: 'Valiyev' },
        receivedBy: { firstName: 'Admin', lastName: 'A' },
      },
    ],
    truncated: false,
    total: 1_000_000,
    count: 1,
  };
  const expenses = {
    rows: [
      {
        date: new Date('2026-06-05T00:00:00Z'),
        category: 'RENT',
        amount: 200_000,
        paymentMethod: 'CASH',
        description: 'Ijara',
        branchId: 1,
        relatedUser: null,
        createdBy: { firstName: 'Admin', lastName: 'A' },
      },
    ],
    truncated: false,
    total: 220_000, // 200k RENT + 20k advance (advance rows omitted from the sample, total from aggregate)
    count: 2,
  };
  // Computed monthly salary (getMonthly shape) — the /payments/salary view.
  const salaryMonthly = {
    month: '2026-06',
    floorMonth: '2026-05',
    period: {
      periodStart: new Date('2026-06-01T00:00:00Z'),
      periodEnd: new Date('2026-06-30T23:59:59Z'),
      cycleStartDay: 1,
    },
    data: [
      {
        user: { id: 10010, firstName: 'Ustoz', lastName: 'B', isActive: true, branch: { id: 1, name: 'Markaz' } },
        hasLessonData: true,
        isFixedMonthly: false,
        fullDeserved: 500_000,
        covered: 400_000,
        carriedIn: 50_000,
        carriedOut: 30_000,
        gap: 100_000,
        advances: 20_000,
        netToPay: 480_000,
        payment: null,
      },
    ],
    totals: {
      fullDeserved: 500_000,
      covered: 400_000,
      centerFunded: 100_000,
      carriedIn: 50_000,
      carriedOut: 30_000,
      gap: 100_000,
      advances: 20_000,
      netToPay: 480_000,
      centerAdvanced: 100_000,
      centerRecovered: 40_000,
      centerStillFronted: 60_000,
    },
  };
  const debtors = {
    rows: [
      { id: 10002, firstName: 'Vali', lastName: 'Aliyev', phone: '901234567', debtAmount: 80_000, branchIds: [1], groups: ['A1-01'] },
    ],
    truncated: false,
    total: 80_000,
    count: 1,
  };
  const recon = {
    period: { start: '2026-06-01', end: '2026-06-30' },
    student: {
      opening: 0,
      closing: 500_000,
      activity: {
        payment: 1_000_000,
        lessonDeduction: -500_000,
        adjustment: 0,
        refund: 0,
        initialBalance: 0,
        writeOff: 0,
        withdrawal: 0,
        other: 0,
      },
      activityTotal: 500_000,
    },
    gl: { storedBalanceSum: 500_000, ledgerSum: 500_000, diff: 0 },
  };
  // Month-end debt history — also the month list the «Oylar» sheet walks.
  const debtHistory = {
    months: [
      {
        monthKey: '2026-06',
        label: 'Iyun 2026',
        closingDebt: 200_000,
        debtorCount: 1,
        recovered: 80_000,
        writtenOff: 0,
        remaining: 120_000,
        recoveryRate: 40,
      },
    ],
    totals: { closingDebt: 200_000, recovered: 80_000, writtenOff: 0, remaining: 120_000 },
  };

  // ---- v2 datasets: the canonical net profit + own-month profit + students. ----
  const netProfit = {
    revenue: 1_000_000,
    revenueBasis: 'recognized' as const,
    teacherSalary: 400_000,
    teacherSalaryBasis: 'hisoblangan' as const,
    adminSalaryBasis: 'hisoblangan' as const,
    teacherSalaryHasTopup: false,
    adminSalary: 100_000,
    operatingExpenses: 200_000,
    refunds: 10_000,
    netProfit: 290_000,
    netMarginPercent: 29,
    memo: { writeOffs: 5_000, providerFees: 0, advances: 20_000 },
  };
  const ownMonthProfit = {
    month: '2026-06',
    ownMoney: 700_000,
    cashTotal: 1_000_000,
    netProfit,
    ownMonthProfit: -10_000,
  };
  const attribution = {
    monthKey: '2026-06',
    total: 1_000_000,
    currentMonth: 700_000,
    late: [{ monthKey: '2026-05', label: 'May 2026', amount: 300_000 }],
  };
  const expectation = {
    month: '2026-06',
    expectedValue: 1_120_000,
    heldValue: 1_000_000,
    remainingValue: 120_000,
  };
  const studentFlow = {
    month: '2026-06',
    attended: 100,
    inGroup: 90,
    groupless: 10,
    byStatus: [
      { status: 'ACTIVE', count: 100 },
      { status: 'FROZEN', count: 5 },
      { status: 'EXPELLED', count: 3 },
      { status: 'GRADUATED', count: 2 },
    ],
    totalStudents: 110,
    arrived: 12,
    left: { frozen: 2, expelled: 1, graduated: 1, archived: 0, total: 4 },
    netChange: 8,
    dropped: {
      records: 6,
      students: 5,
      stillInGroup: 3,
      groupless: 2,
      grouplessByStatus: [{ status: 'ACTIVE', count: 2 }],
    },
  };

  // ---- Operational (non-financial) mock datasets. ----
  const leads = {
    funnel: [{ status: 'NEW', count: 30 }, { status: 'CONVERTED', count: 10 }],
    conversionRateOverTime: [{ month: '2026-05', rate: 20, total: 50, converted: 10 }],
    averageDaysToConversion: 7,
  };
  const roomUtil = {
    rooms: [
      { id: 'r1', name: '1-xona', capacity: 15, hoursPerWeek: 20, fillRate: 80, totalGroups: 3, totalEnrolled: 36 },
    ],
    summary: { totalRooms: 1, averageFillRate: 80, mostUtilized: '1-xona', leastUtilized: '1-xona' },
  };
  const attendance = {
    overallRate: 82,
    overallRetention: 95,
    statusBreakdown: { present: 400, absent: 80, late: 10, excused: 20, total: 510 },
    bucket: 'week',
    trend: [{ bucketStart: '2026-W23', label: '1 Iyn', rate: 80, total: 100, retentionPct: 95 }],
    byDayOfWeek: [{ day: 'Dushanba', rate: 85 }],
    worstGroups: [{ groupId: 'g2', groupName: 'B1-02', rate: 60, retentionPct: 80 }],
    bestGroups: [{ groupId: 'g1', groupName: 'A1-01', rate: 95, retentionPct: 100 }],
  };
  const teacherPerf = {
    teachers: [
      { id: 10010, firstName: 'Ustoz', lastName: 'B', photo: null, groupsCount: 3, totalStudents: 40, startStudentCount: 35, endStudentCount: 40, retentionPct: 114, averageAttendance: 88, averageFillRate: 80 },
    ],
    total: 1,
    page: 1,
    pageSize: 100,
  };
  const teacherChanges = [
    { id: 'tc1', groupId: 'g1', groupName: 'A1-01', branchName: 'Markaz', courseName: 'A1', previousTeachers: ['Ustoz A'], newTeachers: ['Ustoz B'], changeType: 'REPLACED', triggeredByDismissal: false, reasonId: null, reasonName: 'Ish yuki', changedAt: new Date('2026-06-15T00:00:00Z'), changedBy: 'Admin A' },
  ];

  const baseMocks = () => ({
    getProfitLoss: jest.fn().mockResolvedValue(pl),
    getBalanceSheet: jest.fn().mockResolvedValue(bs),
    getPaymentLineItems: jest.fn().mockResolvedValue(payments),
    getExpenseLineItems: jest.fn().mockResolvedValue(expenses),
    getSalaryMonthly: jest.fn().mockResolvedValue(salaryMonthly),
    // Recognized "dars tushumi" — set equal to cash revenue (1_000_000) so the
    // net-profit expectations isolate the salary top-up gating under test.
    getRecognizedRevenue: jest.fn().mockResolvedValue(1_000_000),
    getDebtorLineItems: jest.fn().mockResolvedValue(debtors),
    getReconciliation: jest.fn().mockResolvedValue(recon),
    getPeriodOutflows: jest
      .fn()
      .mockResolvedValue({ refunds: 10_000, writeOffs: 5_000, providerFees: 0 }),
    getMonthlyDebtRecovery: jest.fn().mockResolvedValue(debtHistory),
    getDebtHistory: jest.fn().mockResolvedValue({
      months: [],
      totals: { debtAdded: 0, debtPaid: 0, debtForgiven: 0, debtOther: 0 },
      current: { debt: 0, debtorCount: 0, delta: 0, byStatus: [] },
      longestDebtors: [],
      statusFilter: 'all',
    }),
    getMonthDebtDetail: jest.fn().mockResolvedValue({
      monthKey: '2026-06',
      label: 'Iyun 2026',
      totals: {},
      debtors: [],
      recoveredPayments: [],
      writeOffs: [],
      truncated: false,
    }),
    // v2 feeds.
    getOwnMonthProfit: jest.fn().mockResolvedValue(ownMonthProfit),
    getIncomeMonthAttribution: jest.fn().mockResolvedValue(attribution),
    getMonthlyExpectation: jest.fn().mockResolvedValue(expectation),
    getStudentFlow: jest.fn().mockResolvedValue(studentFlow),
    // Operational feeds.
    getLeadAnalytics: jest.fn().mockResolvedValue(leads),
    getRoomUtilization: jest.fn().mockResolvedValue(roomUtil),
    getAttendanceAnalytics: jest.fn().mockResolvedValue(attendance),
    getTeacherPerformance: jest.fn().mockResolvedValue(teacherPerf),
    getTeacherChangesList: jest.fn().mockResolvedValue(teacherChanges),
  });

  beforeEach(async () => {
    reports = baseMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsExcelService,
        { provide: ReportsService, useValue: reports },
      ],
    }).compile();
    service = module.get(ReportsExcelService);
  });

  const load = async (buf: Buffer): Promise<Workbook> => {
    const wb = new Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    return wb;
  };

  const findRow = (ws: Worksheet, col1: string) => {
    let found: any = null;
    ws.eachRow((row) => {
      if (found) return;
      if (String(row.getCell(1).value ?? '') === col1) found = row;
    });
    return found;
  };

  /**
   * Runs `service.generate` and loads the result. `opts` swaps in one mock
   * dataset (`expenses`); `query` overrides go straight onto the request
   * (dates, `branchIds`, `include`, the past-period flag).
   */
  const buildWorkbook = async (
    opts: { expenses?: any } = {},
    query: Partial<Record<string, any>> = {},
  ): Promise<Workbook> => {
    if (opts.expenses) {
      reports.getExpenseLineItems.mockResolvedValueOnce(opts.expenses);
    }
    return load(
      await service.generate(1, { branchIds: null, ...query } as any),
    );
  };

  describe('workbook composition', () => {
    it('a default download is exactly the ten sheets, in order', async () => {
      const wb = await buildWorkbook({});
      expect(wb.worksheets.map((w) => w.name)).toEqual([
        'Xulosa',
        'Oylar',
        'Filiallar',
        'Oyliklar',
        'Xarajatlar',
        "To'lovlar",
        "O'quvchilar",
        'Davomat',
        'Xonalar bandligi',
        'Izoh',
      ]);
    });

    it('an explicit empty include is that same ten-sheet default', async () => {
      // What the controller passes for every request that names no group —
      // including one from a stale page still sending the retired `?compare=`
      // params, whose values are dropped before they reach here.
      const wb = await buildWorkbook({}, { include: [] });
      expect(wb.worksheets.map((w) => w.name)).toEqual([
        'Xulosa',
        'Oylar',
        'Filiallar',
        'Oyliklar',
        'Xarajatlar',
        "To'lovlar",
        "O'quvchilar",
        'Davomat',
        'Xonalar bandligi',
        'Izoh',
      ]);
    });

    it('has no Muqova sheet — the removed cover listed a Pul oqimi sheet that never existed', async () => {
      const wb = await buildWorkbook({});
      expect(wb.getWorksheet('Muqova')).toBeUndefined();
    });

    it('adds the accounting sheets only when asked', async () => {
      const plain = (await buildWorkbook({})).worksheets.map((w) => w.name);
      expect(plain).not.toContain('Foyda va zarar');
      expect(plain).not.toContain('Balans');
      expect(plain).not.toContain('Tekshiruv');

      const wb = await buildWorkbook({}, { include: ['buxgalteriya'] });
      const names = wb.worksheets.map((w) => w.name);
      expect(names).toContain('Foyda va zarar');
      expect(names).toContain('Balans');
      expect(names).toContain('Tekshiruv');
    });

    it('adds the marketing sheets only when asked', async () => {
      const plain = (await buildWorkbook({})).worksheets.map((w) => w.name);
      expect(plain).not.toContain('Lidlar');
      expect(plain).not.toContain("O'qituvchilar samaradorligi");

      const wb = await buildWorkbook({}, { include: ['marketing'] });
      const names = wb.worksheets.map((w) => w.name);
      expect(names).toContain('Lidlar');
      expect(names).toContain("O'qituvchilar samaradorligi");
      expect(names).toContain("O'qituvchi o'zgarishlari");
    });

    it('adds the debtor list only when asked', async () => {
      const plain = (await buildWorkbook({})).worksheets.map((w) => w.name);
      expect(plain).not.toContain('Qarzdorlar');

      const wb = await buildWorkbook({}, { include: ['qarzdorlar'] });
      expect(wb.worksheets.map((w) => w.name)).toContain('Qarzdorlar');
    });

    it('drops the Filiallar sheet for a single-branch scope', async () => {
      const wb = await buildWorkbook({}, { branchIds: [7] });
      expect(wb.getWorksheet('Filiallar')).toBeUndefined();
      expect(wb.worksheets).toHaveLength(9);
    });

    it('«Izoh» is always last, even with every group switched on', async () => {
      const wb = await buildWorkbook(
        {},
        { include: ['buxgalteriya', 'marketing', 'qarzdorlar'] },
      );
      const names = wb.worksheets.map((w) => w.name);
      expect(names).toHaveLength(17);
      expect(names[names.length - 1]).toBe('Izoh');
    });
  });

  it('produces a non-empty xlsx buffer from every report source', async () => {
    const buf = await service.generate(1, { startDate: '2026-06-01', endDate: '2026-06-30', branchIds: null });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
    expect(reports.getOwnMonthProfit).toHaveBeenCalled();
    expect(reports.getStudentFlow).toHaveBeenCalled();
    expect(reports.getIncomeMonthAttribution).toHaveBeenCalled();
    expect(reports.getMonthlyExpectation).toHaveBeenCalled();
    expect(reports.getPaymentLineItems).toHaveBeenCalled();
  });

  it('drops the live-state sheets for a PAST month when hidePointInTimeForPastPeriod is set', async () => {
    const wb = await buildWorkbook(
      {},
      {
        startDate: '2026-05-01',
        endDate: '2026-05-31',
        include: ['buxgalteriya', 'qarzdorlar'],
        hidePointInTimeForPastPeriod: true,
      },
    );
    const names = wb.worksheets.map((w) => w.name);
    for (const dropped of ['Balans', 'Qarzdorlar', 'Xonalar bandligi']) {
      expect(names).not.toContain(dropped);
    }
    // Period-scoped sheets stay.
    expect(names).toContain('Xulosa');
    expect(names).toContain('Foyda va zarar');
    expect(names).toContain('Davomat');
    expect(names).toContain('Tekshiruv');
    // Ledger-reconstructed month-end debt is past-safe → «Oylar» keeps it.
    expect(names).toContain('Oylar');
  });

  it('keeps all sheets for the CURRENT month even with the flag set', async () => {
    const now = new Date();
    const m = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const wb = await buildWorkbook(
      {},
      {
        startDate: `${m}-01`,
        endDate: `${m}-28`,
        include: ['buxgalteriya', 'qarzdorlar'],
        hidePointInTimeForPastPeriod: true,
      },
    );
    const names = wb.worksheets.map((w) => w.name);
    expect(names).toContain('Balans');
    expect(names).toContain('Qarzdorlar');
    expect(names).toContain('Xonalar bandligi');
  });

  it('builds the «Xulosa» SOF FOYDA from deserved salary + expenses + refunds', async () => {
    const wb = await buildWorkbook(
      {},
      { startDate: '2026-06-01', endDate: '2026-06-30' },
    );
    const ws = wb.getWorksheet('Xulosa')!;
    // 2026-06 is PRE top-up (TOPUP_EFFECTIVE_MONTH=2026-07): teacher salary =
    // COVERED (students-paid) only, NOT covered+gap. So:
    // revenue 1_000_000 − teacher(covered) 400_000 − admin 100_000
    //         − opEx(RENT) 200_000 − refunds 10_000 = 290_000
    expect(findRow(ws, '=  SOF FOYDA').getCell(2).value).toBe(290_000);
    const teacher = findRow(ws, '−  Ustoz oyligi (jami hisoblangan)');
    expect(teacher.getCell(2).value).toBe(salaryMonthly.totals.covered);
  });

  it('includes the center top-up (fullDeserved) from 2026-07 on', async () => {
    const wb = await buildWorkbook(
      {},
      { startDate: '2026-07-01', endDate: '2026-07-31' },
    );
    const ws = wb.getWorksheet('Xulosa')!;
    const teacher = findRow(ws, '−  Ustoz oyligi (jami hisoblangan)');
    expect(teacher.getCell(2).value).toBe(salaryMonthly.totals.fullDeserved);
    // revenue 1_000_000 − teacher(fullDeserved) 500_000 − admin 100_000 − opEx 200_000 − refunds 10_000
    expect(findRow(ws, '=  SOF FOYDA').getCell(2).value).toBe(190_000);
  });

  it('totals «Xulosa» block 4 at the full lesson value, not the recognised revenue', async () => {
    // The mock month is IN PROGRESS: 1 000 000 held-and-paid + 120 000 still
    // unpaid = 1 120 000 of lesson value. Footing the block on the recognised
    // revenue alone printed a total the four rows above it overshot.
    const wb = await buildWorkbook(
      {},
      { startDate: '2026-06-01', endDate: '2026-06-30' },
    );
    const ws = wb.getWorksheet('Xulosa')!;
    expect(findRow(ws, 'Iyun 2026 darslari qiymati').getCell(2).value).toBe(
      expectation.expectedValue,
    );
    expect(expectation.expectedValue).toBeGreaterThan(1_000_000);
  });

  it("renders a Filiallar row per branch, with the branch's WHOLE payroll", async () => {
    // The sheet this replaced left salary out of the per-branch profit
    // entirely; teacher + admin is what makes a branch row a real P&L.
    const wb = await buildWorkbook(
      {},
      { branchNames: { 1: 'Markaz', 2: 'Namangan' } },
    );
    const ws = wb.getWorksheet('Filiallar')!;
    const markaz = findRow(ws, 'Markaz');
    expect(findRow(ws, 'Namangan')).toBeTruthy();

    expect(markaz.getCell(2).value).toBe(netProfit.revenue);
    expect(markaz.getCell(3).value).toBe(ownMonthProfit.cashTotal);
    expect(markaz.getCell(4).value).toBe(
      netProfit.teacherSalary + netProfit.adminSalary,
    );
    // A regression to teacher-only pay must fail here, not just look smaller.
    expect(markaz.getCell(4).value).not.toBe(netProfit.teacherSalary);
    expect(markaz.getCell(5).value).toBe(netProfit.operatingExpenses);
    expect(markaz.getCell(6).value).toBe(netProfit.refunds);
    expect(markaz.getCell(7).value).toBe(netProfit.netProfit);
    expect(markaz.getCell(8).value).toBe(debtors.total);
    expect(markaz.getCell(9).value).toBe(studentFlow.inGroup);

    // Each row is that branch's OWN report — re-issued single-branch.
    expect(reports.getDebtorLineItems).toHaveBeenCalledWith(1, [2]);
    expect(findRow(ws, 'Jami').getCell(4).value).toBe(
      2 * (netProfit.teacherSalary + netProfit.adminSalary),
    );
  });

  it('Qarzdorlar total ties to the balance-sheet debitorlik', async () => {
    const wb = await buildWorkbook({}, { include: ['qarzdorlar'] });
    const debtorTotal = findRow(wb.getWorksheet('Qarzdorlar')!, 'Jami qarz');
    expect(debtorTotal.getCell(6).value).toBe(bs.assets.accountsReceivable);
  });

  it('every Tekshiruv tie reconciles (MOS, no XATO)', async () => {
    const wb = await buildWorkbook({}, { include: ['buxgalteriya'] });
    const ws = wb.getWorksheet('Tekshiruv')!;
    const verdicts: string[] = [];
    ws.eachRow((row) => {
      const v = String(row.getCell(5).value ?? '');
      if (v === 'MOS' || v === 'XATO') verdicts.push(v);
    });
    expect(verdicts.length).toBeGreaterThanOrEqual(5);
    expect(verdicts).not.toContain('XATO');
  });

  it('shows computed monthly salaries on the Oyliklar sheet', async () => {
    const wb = await buildWorkbook({});
    const ws = wb.getWorksheet('Oyliklar')!;
    const jami = findRow(ws, 'Jami');
    // Sof to'lanadigan total (col 7 after the carry-in/out columns were added).
    expect(jami.getCell(7).value).toBe(salaryMonthly.totals.netToPay);
    // "Keyingi oyga o'tgan" total (col 8).
    expect(jami.getCell(8).value).toBe(salaryMonthly.totals.carriedOut);
    expect(reports.getSalaryMonthly).toHaveBeenCalled();
  });

  it('scopes the salary leg to the requested branch', async () => {
    // The revenue leg of this workbook is branch-scoped. Leaving salary
    // company-wide subtracted EVERY branch's payroll from ONE branch's income:
    // a Namangan-filtered export showed "Sof foyda" = −90.8M while the Foyda
    // card showed 0. The API path was fixed in c490d68; this call site was not.
    await service.generate(1, { branchIds: [2] } as any);

    expect(reports.getSalaryMonthly).toHaveBeenCalledWith(
      1,
      expect.any(String),
      expect.any(Number),
      2,
    );
  });

  it('adds the center top-up undirish block to Oyliklar when the center fronted money', async () => {
    const wb = await buildWorkbook({});
    const ws = wb.getWorksheet('Oyliklar')!;
    expect(findRow(ws, 'Jami qo‘shdi').getCell(2).value).toBe(
      salaryMonthly.totals.centerAdvanced,
    );
    expect(findRow(ws, 'Undirildi').getCell(2).value).toBe(
      salaryMonthly.totals.centerRecovered,
    );
    expect(findRow(ws, 'Qolgan (markaz)').getCell(2).value).toBe(
      salaryMonthly.totals.centerStillFronted,
    );
  });

  it('moves "Balanslashuv farqi" off the Balans sheet', async () => {
    const wb = await buildWorkbook({}, { include: ['buxgalteriya'] });
    const balans = wb.getWorksheet('Balans')!;
    let hasGap = false;
    balans.eachRow((r) => {
      if (String(r.getCell(1).value ?? '').includes('Balanslashuv')) hasGap = true;
    });
    expect(hasGap).toBe(false);
  });

  it('renders the surviving operational sheets with data from the facade', async () => {
    const wb = await buildWorkbook({}, { include: ['marketing'] });
    const attRow = findRow(wb.getWorksheet('Davomat')!, 'Umumiy davomat');
    expect(attRow.getCell(2).value).toBe(82);
    const roomRow = findRow(wb.getWorksheet('Xonalar bandligi')!, '1-xona');
    expect(roomRow.getCell(6).value).toBe(80); // fillRate %
    expect(wb.getWorksheet('Lidlar')).toBeTruthy();
    expect(wb.getWorksheet("O'qituvchi o'zgarishlari")).toBeTruthy();
    expect(reports.getAttendanceAnalytics).toHaveBeenCalled();
    expect(reports.getRoomUtilization).toHaveBeenCalled();
    expect(reports.getLeadAnalytics).toHaveBeenCalled();
    expect(reports.getTeacherChangesList).toHaveBeenCalled();
  });

  it('renders an empty-note operational sheet when its source throws (workbook survives)', async () => {
    reports.getRoomUtilization.mockRejectedValue(new Error('boom'));
    const wb = await buildWorkbook({});
    // The whole workbook still builds (all ten sheets present)...
    expect(wb.worksheets).toHaveLength(10);
    // ...and the failed sheet carries the "no data" note instead of crashing.
    const ws = wb.getWorksheet('Xonalar bandligi')!;
    let hasNote = false;
    ws.eachRow((r) => {
      if (String(r.getCell(1).value ?? '').includes("Ma'lumot hozircha mavjud emas")) hasNote = true;
    });
    expect(hasNote).toBe(true);
  });

  it('labels a still-open period as month-to-date', async () => {
    reports.getProfitLoss.mockResolvedValue({
      ...pl,
      period: { start: '2026-07-01', end: '2999-12-31' },
    });
    const wb = await buildWorkbook(
      {},
      { startDate: '2026-07-01', endDate: '2999-12-31' },
    );
    // `period` is the subtitle of every period-scoped sheet.
    expect(
      String(wb.getWorksheet('Xarajatlar')!.getRow(2).getCell(1).value),
    ).toContain('bugungi kungacha');
  });

  describe('generateDebtHistory', () => {
    it('builds the 5 debt sheets (Harakat + Kogorta + Qarzdorlar + Undirildi + Kechirilgan) with detail', async () => {
      reports.getMonthlyDebtRecovery.mockResolvedValueOnce({
        months: [
          {
            monthKey: '2026-06',
            label: 'Iyun 2026',
            closingDebt: 200000,
            debtorCount: 1,
            recovered: 80000,
            writtenOff: 0,
            remaining: 120000,
            recoveryRate: 40,
          },
        ],
        totals: {
          closingDebt: 200000,
          recovered: 80000,
          writtenOff: 0,
          remaining: 120000,
        },
      });
      reports.getMonthDebtDetail.mockResolvedValueOnce({
        monthKey: '2026-06',
        label: 'Iyun 2026',
        totals: {
          closingDebt: 200000,
          recovered: 80000,
          writtenOff: 0,
          remaining: 120000,
          debtorCount: 1,
        },
        debtors: [
          {
            id: 10001,
            firstName: 'Ali',
            lastName: 'Valiyev',
            phone: '901234567',
            groups: ['A1-01'],
            monthEndDebt: 200000,
            recovered: 80000,
            writtenOff: 0,
            remaining: 120000,
          },
        ],
        recoveredPayments: [
          {
            id: 'p1',
            studentId: 10001,
            firstName: 'Ali',
            lastName: 'Valiyev',
            amount: 80000,
            method: 'CASH',
            createdAt: new Date('2026-07-05'),
            performedBy: 'Admin X',
          },
        ],
        writeOffs: [],
        truncated: false,
      });

      const wb = await load(await service.generateDebtHistory(1, null));
      const names = wb.worksheets.map((w) => w.name);
      // «Qarz harakati» leads: it is the only debt sheet whose columns add up,
      // so it is the one a reader should meet first.
      expect(names).toEqual([
        'Qarz harakati',
        'Oylik qarzdorlik',
        'Qarzdorlar',
        'Undirildi',
        'Kechirilgan',
      ]);
      // Debtor row lands on the Qarzdorlar sheet with its month + amount.
      const dRow = findRow(wb.getWorksheet('Qarzdorlar')!, 'Iyun 2026');
      expect(dRow.getCell(4).value).toBe(200000);
      // Payment row lands on Undirildi.
      const pRow = findRow(wb.getWorksheet('Undirildi')!, 'Iyun 2026');
      expect(pRow.getCell(4).value).toBe(80000);
      // No scope passed => company-wide (a CEO who picked no branch).
      expect(reports.getMonthDebtDetail).toHaveBeenCalledWith(1, '2026-06', null);
    });

    it('passes the SAME branch scope to both legs of the workbook', async () => {
      // The summary sheet and the detail sheets come from two different calls.
      // Scoping one and not the other is exactly how a workbook came to print
      // one branch's total above another branch's rows.
      reports.getMonthlyDebtRecovery.mockResolvedValue({
        months: [
          {
            monthKey: '2026-06',
            label: 'Iyun 2026',
            closingDebt: 0,
            debtorCount: 0,
            recovered: 0,
            writtenOff: 0,
            remaining: 0,
            remainingDebtorCount: 0,
            recoveryRate: 0,
          },
        ],
        totals: {
          closingDebt: 0,
          recovered: 0,
          writtenOff: 0,
          remaining: 0,
        },
      });
      reports.getMonthDebtDetail.mockResolvedValue({
        monthKey: '2026-06',
        label: 'Iyun 2026',
        totals: {
          closingDebt: 0,
          recovered: 0,
          writtenOff: 0,
          remaining: 0,
          debtorCount: 0,
        },
        debtors: [],
        recoveredPayments: [],
        writeOffs: [],
        truncated: false,
      });

      await service.generateDebtHistory(1, [2]);
      expect(reports.getDebtHistory).toHaveBeenCalledWith(1, [2]);
      expect(reports.getMonthlyDebtRecovery).toHaveBeenCalledWith(1, [2]);
      expect(reports.getMonthDebtDetail).toHaveBeenCalledWith(1, '2026-06', [2]);
    });
  });

  describe('carried-over sheet fixes', () => {
    it('«Oyliklar» names the DELIVERED month, not the period start', async () => {
      // Oyliklar stays a per-month view even inside this 3-month export (see
      // reports-excel.month-range.ts), so the subtitle must name one month
      // rather than the whole 01.05–31.07 period. WHICH month is not the
      // caller's choice: `getSalaryMonthly` clamps a request below the
      // reporting floor up to that floor, exactly as the mock does here
      // (asked 2026-05, delivered 2026-06). Naming `startDate`'s month would
      // print «May 2026» above June's payroll.
      const wb = await buildWorkbook(
        {},
        { startDate: '2026-05-01', endDate: '2026-07-31' },
      );
      const ws = wb.getWorksheet('Oyliklar')!;
      const subtitle = String(ws.getRow(2).getCell(1).value);
      expect(subtitle).toContain('Iyun 2026');
      expect(subtitle).not.toContain('May 2026');
    });

    it('«Xarajatlar» warns when the Boshqa bucket dominates', async () => {
      const wb = await buildWorkbook({
        expenses: {
          rows: [
            { date: '2026-06-10', category: 'OTHER', amount: 65_515_000 },
            { date: '2026-06-11', category: 'RENT', amount: 18_000_000 },
          ],
          total: 83_515_000,
        },
      });
      const ws = wb.getWorksheet('Xarajatlar')!;
      const text: string[] = [];
      ws.eachRow((r) => text.push(String(r.getCell(1).value ?? '')));
      expect(text.join('\n')).toContain('«Boshqa» ulushi');
    });

    it('«Izoh» carries ten plain-language terms and no accounting jargon', async () => {
      const wb = await buildWorkbook({});
      const ws = wb.getWorksheet('Izoh')!;
      const text: string[] = [];
      ws.eachRow((r) => text.push(String(r.getCell(1).value ?? '')));
      const joined = text.join('\n');
      expect(joined).toContain("O'tilgan darslar qiymati");
      expect(joined).toContain("Oyning o'z foydasi");
      expect(joined).not.toContain('Roll-forward');
      expect(joined).not.toContain('Cash tie-out');
      expect(joined).not.toContain('Balanslashuv farqi');
    });

    it('«Xonalar bandligi» states its window as a dated "Bugungi holat"', async () => {
      const wb = await buildWorkbook({});
      const ws = wb.getWorksheet('Xonalar bandligi')!;
      expect(String(ws.getRow(2).getCell(1).value)).toContain('Bugungi holat:');
    });
  });
});
