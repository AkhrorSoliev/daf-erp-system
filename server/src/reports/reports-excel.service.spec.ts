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
    totals: { fullDeserved: 500_000, covered: 400_000, carriedIn: 50_000, carriedOut: 30_000, gap: 100_000, advances: 20_000, netToPay: 480_000 },
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

  const baseMocks = () => ({
    getFinancialOverview: jest.fn().mockResolvedValue(overview),
    getProfitLoss: jest.fn().mockResolvedValue(pl),
    getCashFlow: jest.fn().mockResolvedValue(cf),
    getBalanceSheet: jest.fn().mockResolvedValue(bs),
    getPaymentLineItems: jest.fn().mockResolvedValue(payments),
    getExpenseLineItems: jest.fn().mockResolvedValue(expenses),
    getSalaryMonthly: jest.fn().mockResolvedValue(salaryMonthly),
    getDebtorLineItems: jest.fn().mockResolvedValue(debtors),
    getFinancialTrend: jest.fn().mockResolvedValue(trend),
    getPerBranchSummary: jest.fn().mockResolvedValue(perBranch),
    getReconciliation: jest.fn().mockResolvedValue(recon),
    getPriorPeriodSummary: jest.fn().mockResolvedValue(prior),
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

  it('builds the 14 expected sheets in order (company-wide)', async () => {
    const wb = await load(await service.generate(1, {}));
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'Muqova',
      'Asosiy xulosa',
      'Foyda va zarar',
      'Pul oqimi',
      'Balans',
      "To'lovlar",
      'Xarajatlar',
      'Oyliklar',
      'Qarzdorlar',
      'Oylik dinamika',
      'Filial kesimida',
      "To'lov usullari",
      'Tekshiruv',
      'Izoh',
    ]);
  });

  it('omits "Filial kesimida" when a branch is selected', async () => {
    const wb = await load(await service.generate(1, { branchId: 1 }));
    const names = wb.worksheets.map((w) => w.name);
    expect(names).not.toContain('Filial kesimida');
    expect(names).toHaveLength(13);
    expect(reports.getPerBranchSummary).not.toHaveBeenCalled();
  });

  it('shows the canonical net profit (= overview.netProfit) on Asosiy xulosa', async () => {
    const wb = await load(await service.generate(1, {}));
    const row = findRow(wb.getWorksheet('Asosiy xulosa')!, 'Sof foyda');
    expect(row).toBeTruthy();
    expect(row.getCell(2).value).toBe(overview.netProfit);
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
    expect(verdicts.length).toBeGreaterThanOrEqual(6);
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

  it('moves "Balanslashuv farqi" off the Balans sheet', async () => {
    const wb = await load(await service.generate(1, {}));
    const balans = wb.getWorksheet('Balans')!;
    let hasGap = false;
    balans.eachRow((r) => {
      if (String(r.getCell(1).value ?? '').includes('Balanslashuv')) hasGap = true;
    });
    expect(hasGap).toBe(false);
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
});
