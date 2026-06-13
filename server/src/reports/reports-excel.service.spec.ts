import { Test, TestingModule } from '@nestjs/testing';
import { Workbook } from 'exceljs';
import { ReportsExcelService } from './reports-excel.service';
import { ReportsService } from './reports.service';

describe('ReportsExcelService', () => {
  let service: ReportsExcelService;
  let reports: any;

  const overview = {
    income: { actual: 1_000_000, billed: 900_000, byMethod: [{ method: 'CASH', amount: 1_000_000, count: 5 }] },
    expenses: 200_000,
    salary: { paid: 300_000, pending: 50_000 },
    netProfit: 500_000,
    forecast: { outstandingReceivable: 80_000 },
    debtorCount: 3,
    activeStudentCount: 120,
    avgPayment: 200_000,
    ltv: 400_000,
    cac: 30_000,
    marketingRoi: 150,
    newStudentCount: 10,
  };
  const pl = {
    period: { start: '2026-06-01', end: '2026-06-30' },
    revenue: { total: 1_000_000, byType: [{ type: 'TUITION', amount: 1_000_000, count: 5 }] },
    costOfServices: { teacherSalaries: 300_000, teacherAdvances: 20_000, total: 320_000 },
    grossProfit: 680_000,
    operatingExpenses: { byCategory: [{ category: 'RENT', amount: 200_000 }], adminSalaries: 100_000, total: 300_000 },
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

  beforeEach(async () => {
    reports = {
      getFinancialOverview: jest.fn().mockResolvedValue(overview),
      getProfitLoss: jest.fn().mockResolvedValue(pl),
      getCashFlow: jest.fn().mockResolvedValue(cf),
      getBalanceSheet: jest.fn().mockResolvedValue(bs),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsExcelService,
        { provide: ReportsService, useValue: reports },
      ],
    }).compile();
    service = module.get(ReportsExcelService);
  });

  it('produces a non-empty xlsx buffer from all four report sources', async () => {
    const buf = await service.generate(1, {
      startDate: '2026-06-01',
      endDate: '2026-06-30',
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
    expect(reports.getFinancialOverview).toHaveBeenCalled();
    expect(reports.getProfitLoss).toHaveBeenCalled();
    expect(reports.getCashFlow).toHaveBeenCalled();
    expect(reports.getBalanceSheet).toHaveBeenCalled();
  });

  it('builds the six expected sheets', async () => {
    const buf = await service.generate(1, {});
    const wb = new Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const names = wb.worksheets.map((w) => w.name);
    expect(names).toEqual([
      'Umumiy',
      'Foyda va zarar',
      'Pul oqimi',
      'Balans',
      'Daromad',
      'Xarajatlar',
    ]);
  });
});
