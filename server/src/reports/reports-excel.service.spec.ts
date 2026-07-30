import { Test, TestingModule } from '@nestjs/testing';
import { Workbook, Worksheet } from 'exceljs';
import { ReportsExcelService } from './reports-excel.service';
import { ReportsService } from './reports.service';

describe('ReportsExcelService', () => {
  let service: ReportsExcelService;
  let reports: any;

  // ---- Mock data tuned so every Tekshiruv tie reconciles (MOS). ----
  const overview = {
    income: {
      actual: 1_000_000,
      billed: 900_000,
      expected: 1_200_000,
      paymentCount: 5,
      byMethod: [{ method: 'CASH', amount: 1_000_000, count: 5 }],
    },
    expenses: 200_000,
    salary: { paid: 300_000, pending: 50_000, advances: 20_000 },
    netProfit: 500_000,
    forecast: {
      outstandingReceivable: 80_000,
      debtorExposure: { count: 3, avgDebt: 26_666 },
    },
    debtorCount: 3,
    activeStudentCount: 120,
    activeBalance: 40_000,
    avgPayment: 200_000,
    ltv: 400_000,
    ltvPayerCount: 4,
    cac: 30_000,
    marketingRoi: 150,
    newStudentCount: 10,
    marketingExpenses: 40_000,
  };
  const prior = {
    ...overview,
    income: { ...overview.income, actual: 800_000 },
    expenses: 180_000,
    salary: { paid: 250_000, pending: 40_000, advances: 0 },
    netProfit: 370_000,
    forecast: {
      outstandingReceivable: 60_000,
      debtorExposure: { count: 2, avgDebt: 30_000 },
    },
    debtorCount: 2,
    activeStudentCount: 110,
    newStudentCount: 8,
    ltvPayerCount: 3,
  };
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
  const cf = {
    period: { start: '2026-06-01', end: '2026-06-30' },
    openingBalance: 100_000,
    inflows: { operating: 1_000_000, total: 1_000_000 },
    outflows: { operating: -500_000, total: -500_000 },
    adjustments: 0,
    transfersNet: 0,
    netCashFlow: 500_000,
    closingBalance: 600_000,
    byType: [{ type: 'INFLOW', amount: 1_000_000, count: 5 }],
    accounts: [{ id: 'a', name: 'Kassa', type: 'CASH', branchId: null, balance: 600_000 }],
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
  const trend = [
    { month: '02/2026', income: 500_000, expenses: 300_000, profit: 200_000 },
    { month: '03/2026', income: 700_000, expenses: 350_000, profit: 350_000 },
  ];
  const perBranch = [
    { branchId: 1, branchName: 'Markaz', income: 1_000_000, expense: 200_000, profit: 800_000, debt: 80_000 },
  ];
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

  // ---- Operational (non-financial) mock datasets. ----
  const kpis = {
    activeStudents: { current: 120, trend: 9 },
    activeGroups: 15,
    averageAttendance: 82,
    leadConversionRate: 25,
    newStudentsThisMonth: 10,
    churnedThisMonth: 4,
  };
  const leads = {
    funnel: [{ status: 'NEW', count: 30 }, { status: 'CONVERTED', count: 10 }],
    conversionRateOverTime: [{ month: '2026-05', rate: 20, total: 50, converted: 10 }],
    averageDaysToConversion: 7,
  };
  const departedSummary = {
    churnRate: 8.5,
    departedCount: 12,
    totalStudents: 132,
    lostRevenue: 300_000,
    totalDebt: -50_000,
    debtorCount: 3,
    avgDurationMonths: 4.2,
    totalTeacherChanges: 2,
    departedAfterTeacherChange: 1,
  };
  const departedDynamics = { data: [{ date: '2026-06-01', count: 12 }], granularity: 'month' };
  const departedReasons = { data: [{ reasonId: null, reasonName: 'Moliyaviy', count: 5 }] };
  const roomUtil = {
    rooms: [
      { id: 'r1', name: '1-xona', capacity: 15, hoursPerWeek: 20, fillRate: 80, totalGroups: 3, totalEnrolled: 36 },
    ],
    summary: { totalRooms: 1, averageFillRate: 80, mostUtilized: '1-xona', leastUtilized: '1-xona' },
  };
  const groupAnalytics = {
    statusDistribution: [{ status: 'ACTIVE', count: 15 }],
    fillRates: [{ groupId: 'g1', groupName: 'A1-01', enrolled: 12, capacity: 15, fillRate: 80 }],
    formingGroups: [],
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
  const yearlyTrend = [
    { year: 2025, income: 800_000, expenses: 500_000, profit: 300_000, newStudents: 8, payerCount: 3, avgPayment: 100_000 },
    { year: 2026, income: 1_000_000, expenses: 600_000, profit: 400_000, newStudents: 10, payerCount: 4, avgPayment: 120_000 },
  ];

  const baseMocks = () => ({
    getFinancialOverview: jest.fn().mockResolvedValue(overview),
    getProfitLoss: jest.fn().mockResolvedValue(pl),
    getCashFlow: jest.fn().mockResolvedValue(cf),
    getBalanceSheet: jest.fn().mockResolvedValue(bs),
    getPaymentLineItems: jest.fn().mockResolvedValue(payments),
    getExpenseLineItems: jest.fn().mockResolvedValue(expenses),
    getSalaryMonthly: jest.fn().mockResolvedValue(salaryMonthly),
    // Recognized "dars tushumi" — set equal to cash revenue (1_000_000) so the
    // net-profit expectations isolate the salary top-up gating under test.
    getRecognizedRevenue: jest.fn().mockResolvedValue(1_000_000),
    getDebtorLineItems: jest.fn().mockResolvedValue(debtors),
    getFinancialTrend: jest.fn().mockResolvedValue(trend),
    getPerBranchSummary: jest.fn().mockResolvedValue(perBranch),
    getReconciliation: jest.fn().mockResolvedValue(recon),
    getPeriodOutflows: jest
      .fn()
      .mockResolvedValue({ refunds: 10_000, writeOffs: 5_000, providerFees: 0 }),
    getPriorPeriodSummary: jest.fn().mockResolvedValue(prior),
    getMonthlyDebtRecovery: jest
      .fn()
      .mockResolvedValue({ months: [], totals: {} }),
    getMonthDebtDetail: jest.fn().mockResolvedValue({
      monthKey: '2026-06',
      label: 'Iyun 2026',
      totals: {},
      debtors: [],
      recoveredPayments: [],
      writeOffs: [],
      truncated: false,
    }),
    // Operational feeds.
    getKpis: jest.fn().mockResolvedValue(kpis),
    getLeadAnalytics: jest.fn().mockResolvedValue(leads),
    getDepartedStudentsSummary: jest.fn().mockResolvedValue(departedSummary),
    getDepartedStudentsDynamics: jest.fn().mockResolvedValue(departedDynamics),
    getDepartedStudentsReasons: jest.fn().mockResolvedValue(departedReasons),
    getRoomUtilization: jest.fn().mockResolvedValue(roomUtil),
    getGroupAnalytics: jest.fn().mockResolvedValue(groupAnalytics),
    getAttendanceAnalytics: jest.fn().mockResolvedValue(attendance),
    getTeacherPerformance: jest.fn().mockResolvedValue(teacherPerf),
    getTeacherChangesList: jest.fn().mockResolvedValue(teacherChanges),
    getYearlyTrend: jest.fn().mockResolvedValue(yearlyTrend),
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

  it('produces a non-empty xlsx buffer from every report source', async () => {
    const buf = await service.generate(1, { startDate: '2026-06-01', endDate: '2026-06-30' });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
    expect(reports.getFinancialOverview).toHaveBeenCalled();
    expect(reports.getPaymentLineItems).toHaveBeenCalled();
    expect(reports.getReconciliation).toHaveBeenCalled();
    expect(reports.getPriorPeriodSummary).toHaveBeenCalled();
  });

  it('builds the 23 expected sheets in order (company-wide, financial + operational)', async () => {
    const wb = await load(await service.generate(1, {}));
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'Muqova',
      'Asosiy xulosa',
      'Sof foyda',
      'Foyda va zarar',
      'Balans',
      "To'lovlar",
      'Xarajatlar',
      'Oyliklar',
      'Qarzdorlar',
      'Oylik dinamika',
      'Oylik qarzdorlik',
      'Filial kesimida',
      "To'lov usullari",
      'KPI paneli',
      'Lidlar',
      "O'quvchilar oqimi",
      'Xonalar bandligi',
      "Guruhlar to'ldirilishi",
      'Davomat',
      "O'qituvchilar samaradorligi",
      "O'qituvchi o'zgarishlari",
      'Tekshiruv',
      'Izoh',
    ]);
  });

  it('drops the live-state sheets for a PAST month when hidePointInTimeForPastPeriod is set', async () => {
    const wb = await load(
      await service.generate(1, {
        startDate: '2026-05-01',
        endDate: '2026-05-31',
        hidePointInTimeForPastPeriod: true,
      }),
    );
    const names = wb.worksheets.map((w) => w.name);
    for (const dropped of [
      'Balans',
      'Qarzdorlar',
      'KPI paneli',
      'Xonalar bandligi',
      "Guruhlar to'ldirilishi",
    ]) {
      expect(names).not.toContain(dropped);
    }
    // Period-scoped sheets stay.
    expect(names).toContain('Foyda va zarar');
    expect(names).toContain('Davomat');
    expect(names).toContain('Tekshiruv');
    // Ledger-reconstructed month-end debt is past-safe → never dropped.
    expect(names).toContain('Oylik qarzdorlik');
  });

  it('keeps all sheets for the CURRENT month even with the flag set', async () => {
    const now = new Date();
    const m = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const wb = await load(
      await service.generate(1, {
        startDate: `${m}-01`,
        endDate: `${m}-28`,
        hidePointInTimeForPastPeriod: true,
      }),
    );
    const names = wb.worksheets.map((w) => w.name);
    expect(names).toContain('Balans');
    expect(names).toContain('Qarzdorlar');
    expect(names).toContain('KPI paneli');
  });

  it('omits "Filial kesimida" when a branch is selected', async () => {
    const wb = await load(await service.generate(1, { branchId: 1 }));
    const names = wb.worksheets.map((w) => w.name);
    expect(names).not.toContain('Filial kesimida');
    expect(names).toHaveLength(22);
    expect(reports.getPerBranchSummary).not.toHaveBeenCalled();
  });

  it('shows the cash-basis net profit (= overview.netProfit) on Asosiy xulosa', async () => {
    const wb = await load(await service.generate(1, {}));
    const row = findRow(wb.getWorksheet('Asosiy xulosa')!, 'Sof foyda (naqd asosida)');
    expect(row).toBeTruthy();
    expect(row.getCell(2).value).toBe(overview.netProfit);
  });

  it('builds the "Sof foyda" sheet subtracting deserved salary + expenses + refunds', async () => {
    const wb = await load(await service.generate(1, { startDate: '2026-06-01', endDate: '2026-06-30' }));
    const ws = wb.getWorksheet('Sof foyda')!;
    expect(ws).toBeTruthy();
    // 2026-06 is PRE top-up (TOPUP_EFFECTIVE_MONTH=2026-07): teacher salary =
    // COVERED (students-paid) only, NOT covered+gap. So:
    // revenue 1_000_000 − teacher(covered) 400_000 − admin 100_000
    //         − opEx(RENT) 200_000 − refunds 10_000 = 290_000
    const bottom = findRow(ws, '=  SOF FOYDA');
    expect(bottom).toBeTruthy();
    expect(bottom.getCell(2).value).toBe(290_000);
    // Pre-top-up month → covered-only label, value = covered (not fullDeserved).
    const teacher = findRow(ws, '−  Ustoz oyligi (hisoblangan — o‘quvchilar to‘lagani)');
    expect(teacher).toBeTruthy();
    expect(teacher.getCell(2).value).toBe(salaryMonthly.totals.covered);
  });

  it('shows the accurate net profit on Asosiy xulosa (deserved salary + refunds)', async () => {
    const wb = await load(await service.generate(1, { startDate: '2026-06-01', endDate: '2026-06-30' }));
    const row = findRow(
      wb.getWorksheet('Asosiy xulosa')!,
      'Sof foyda (aniq — hisoblangan oylik + refund bilan)',
    );
    expect(row).toBeTruthy();
    expect(row.getCell(2).value).toBe(290_000); // 2026-06 covered-only (pre top-up)
  });

  it('includes the center top-up (fullDeserved) from 2026-07 on', async () => {
    const wb = await load(await service.generate(1, { startDate: '2026-07-01', endDate: '2026-07-31' }));
    const ws = wb.getWorksheet('Sof foyda')!;
    const teacher = findRow(ws, '−  Ustoz oyligi (hisoblangan + markaz qo‘shimchasi)');
    expect(teacher).toBeTruthy();
    expect(teacher.getCell(2).value).toBe(salaryMonthly.totals.fullDeserved);
    // revenue 1_000_000 − teacher(fullDeserved) 500_000 − admin 100_000 − opEx 200_000 − refunds 10_000
    expect(findRow(ws, '=  SOF FOYDA').getCell(2).value).toBe(190_000);
  });

  it('Qarzdorlar total ties to the balance-sheet debitorlik', async () => {
    const wb = await load(await service.generate(1, {}));
    const debtorTotal = findRow(wb.getWorksheet('Qarzdorlar')!, 'Jami qarz');
    expect(debtorTotal.getCell(6).value).toBe(bs.assets.accountsReceivable);
  });

  it('every Tekshiruv tie reconciles (MOS, no XATO)', async () => {
    const wb = await load(await service.generate(1, {}));
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
    const wb = await load(await service.generate(1, {}));
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
    await service.generate(1, { branchId: 2 } as any);

    expect(reports.getSalaryMonthly).toHaveBeenCalledWith(
      1,
      expect.any(String),
      expect.any(Number),
      2,
    );
  });

  it('adds the center top-up undirish block to Oyliklar when the center fronted money', async () => {
    const wb = await load(await service.generate(1, {}));
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
    const wb = await load(await service.generate(1, {}));
    const balans = wb.getWorksheet('Balans')!;
    let hasGap = false;
    balans.eachRow((r) => {
      if (String(r.getCell(1).value ?? '').includes('Balanslashuv')) hasGap = true;
    });
    expect(hasGap).toBe(false);
  });

  it('renders the operational sheets with data from the facade', async () => {
    const wb = await load(await service.generate(1, {}));
    const kpiRow = findRow(wb.getWorksheet('KPI paneli')!, "Faol o'quvchilar");
    expect(kpiRow.getCell(2).value).toBe(120);
    const attRow = findRow(wb.getWorksheet('Davomat')!, 'Umumiy davomat');
    expect(attRow.getCell(2).value).toBe(82);
    const roomRow = findRow(wb.getWorksheet('Xonalar bandligi')!, '1-xona');
    expect(roomRow.getCell(6).value).toBe(80); // fillRate %
    const churnRow = findRow(wb.getWorksheet("O'quvchilar oqimi")!, 'Churn (ketish) foizi');
    expect(churnRow.getCell(2).value).toBe(8.5);
    expect(reports.getKpis).toHaveBeenCalled();
    expect(reports.getAttendanceAnalytics).toHaveBeenCalled();
    expect(reports.getLeadAnalytics).toHaveBeenCalled();
    expect(reports.getTeacherChangesList).toHaveBeenCalled();
  });

  it('adds "Taqqoslash" + "Yillar kesimida" sheets when compareModes are requested', async () => {
    const wb = await load(
      await service.generate(1, {
        startDate: '2026-06-01',
        endDate: '2026-06-30',
        compareModes: ['prev', 'yoy', 'yearly'],
        performedById: 999,
      }),
    );
    const names = wb.worksheets.map((w) => w.name);
    expect(names).toContain('Taqqoslash');
    expect(names).toContain('Yillar kesimida');

    // Taqqoslash: current Tushum = overview.income.actual; Δ% vs the (mocked
    // identical) prior overview is 0.
    const cmp = wb.getWorksheet('Taqqoslash')!;
    const tushum = findRow(cmp, 'Tushum (kassa)');
    expect(tushum.getCell(2).value).toBe(overview.income.actual);
    expect(tushum.getCell(4).value).toBe(0); // Δ% (Oldingi davr) — same period → 0

    // Yillar kesimida: Tushum row → 2025, 2026, YoY Δ% = growthPct(1M,800k)=25.
    const yws = wb.getWorksheet('Yillar kesimida')!;
    const inc = findRow(yws, 'Tushum');
    expect(inc.getCell(2).value).toBe(800_000);
    expect(inc.getCell(3).value).toBe(1_000_000);
    expect(inc.getCell(4).value).toBe(25);

    expect(reports.getFinancialOverview).toHaveBeenCalled();
    expect(reports.getYearlyTrend).toHaveBeenCalled();
  });

  it('omits the comparison sheets when no compareModes are requested', async () => {
    const wb = await load(await service.generate(1, {}));
    const names = wb.worksheets.map((w) => w.name);
    expect(names).not.toContain('Taqqoslash');
    expect(names).not.toContain('Yillar kesimida');
  });

  it('renders an empty-note operational sheet when its source throws (workbook survives)', async () => {
    reports.getRoomUtilization.mockRejectedValue(new Error('boom'));
    const wb = await load(await service.generate(1, {}));
    // The whole workbook still builds (all 23 sheets present)...
    expect(wb.worksheets).toHaveLength(23);
    // ...and the failed sheet carries the "no data" note instead of crashing.
    const ws = wb.getWorksheet('Xonalar bandligi')!;
    let hasNote = false;
    ws.eachRow((r) => {
      if (String(r.getCell(1).value ?? '').includes("Ma'lumot hozircha mavjud emas")) hasNote = true;
    });
    expect(hasNote).toBe(true);
  });

  it('labels a still-open period as month-to-date on the cover', async () => {
    reports.getProfitLoss.mockResolvedValue({
      ...pl,
      period: { start: '2026-07-01', end: '2999-12-31' },
    });
    const wb = await load(await service.generate(1, { startDate: '2026-07-01', endDate: '2999-12-31' }));
    const row = findRow(wb.getWorksheet('Muqova')!, 'Hisobot davri:');
    expect(String(row.getCell(2).value)).toContain('bugungi kungacha');
  });

  describe('generateDebtHistory', () => {
    it('builds the 4 debt sheets (Umumiy + Qarzdorlar + Undirildi + Kechirilgan) with detail', async () => {
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

      const wb = await load(await service.generateDebtHistory(1));
      const names = wb.worksheets.map((w) => w.name);
      expect(names).toEqual([
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
      expect(reports.getMonthDebtDetail).toHaveBeenCalledWith(1, '2026-06');
    });
  });
});
