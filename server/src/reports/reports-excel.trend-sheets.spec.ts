import { Workbook, Worksheet } from 'exceljs';
import { cellText } from './reports-excel.helpers';
import {
  monthsSheet,
  branchesSheet,
  MonthRow,
  BranchRow,
} from './reports-excel.trend-sheets';

const months: MonthRow[] = [
  {
    month: '2026-05',
    recognized: 152_415_637,
    cashIn: 96_568_003,
    teacherSalary: 33_334,
    operatingExpenses: 24_880_000,
    netProfit: 127_502_303,
    ownProfit: 1,
    closingDebt: 81_298_546,
    recovered: 52_799_356,
    recoveryRate: 64.9,
  },
  {
    month: '2026-06',
    recognized: 165_086_661,
    cashIn: 171_933_329,
    teacherSalary: 66_721_097,
    operatingExpenses: 92_744_000,
    netProfit: 4_714_564,
    ownProfit: -26_750_444,
    closingDebt: 75_642_720,
    recovered: 30_587_180,
    recoveryRate: 40.4,
  },
  {
    month: '2026-07',
    recognized: 173_783_991,
    cashIn: 170_378_987,
    teacherSalary: 95_834_547,
    operatingExpenses: 41_773_000,
    netProfit: 35_976_444,
    ownProfit: 4_257_391,
    closingDebt: 76_336_407,
    recovered: 7_709_283,
    recoveryRate: 10.1,
  },
];

const headerOf = (ws: Worksheet, first: string): any[] => {
  let cells: any[] = [];
  ws.eachRow((r) => {
    if (!cells.length && cellText(r.getCell(1).value) === first) {
      cells = (r.values as any[]).slice(1);
    }
  });
  return cells;
};
const rowFor = (ws: Worksheet, label: string): any[] => {
  let cells: any[] = [];
  ws.eachRow((r) => {
    if (!cells.length && cellText(r.getCell(1).value) === label) {
      cells = (r.values as any[]).slice(1);
    }
  });
  return cells;
};

describe('monthsSheet', () => {
  let ws: Worksheet;
  beforeEach(() => {
    const wb = new Workbook();
    monthsSheet(wb, months, 'Barcha filiallar');
    ws = wb.getWorksheet('Oylar')!;
  });

  it('separates lesson value from cash received', () => {
    const h = headerOf(ws, 'Oy');
    expect(h).toContain("O'tilgan darslar qiymati");
    expect(h).toContain('Kassaga tushgan pul');
  });

  it('shows both figures for July', () => {
    const r = rowFor(ws, 'Iyul 2026');
    expect(r[1]).toBe(173_783_991);
    expect(r[2]).toBe(170_378_987);
  });

  it('suppresses profit for a month whose payroll is incomplete', () => {
    const r = rowFor(ws, 'May 2026');
    expect(r[1]).toBe(152_415_637); // lesson value is real, keep it
    expect(r[3]).toBe('—'); // salary
    expect(r[5]).toBe('—'); // net profit
    expect(r[6]).toBe('—'); // own-month profit
    expect(String(r[10])).toContain("o'tish davri");
  });

  it('shows a negative own-month profit for June', () => {
    expect(rowFor(ws, 'Iyun 2026')[6]).toBe(-26_750_444);
  });
});

describe('branchesSheet', () => {
  it('separates lesson value from cash received per branch', () => {
    const rows: BranchRow[] = [
      {
        branchName: "Farg'ona filiali",
        recognized: 173_783_991,
        cashIn: 170_378_987,
        teacherSalary: 95_834_547,
        operatingExpenses: 41_773_000,
        refunds: 200_000,
        netProfit: 35_976_444,
        debt: 34_594_323,
        inGroup: 343,
      },
      {
        branchName: 'Namangan filali',
        recognized: 0,
        cashIn: 0,
        teacherSalary: 0,
        operatingExpenses: 0,
        refunds: 0,
        netProfit: 0,
        debt: 0,
        inGroup: 84,
      },
    ];
    const wb = new Workbook();
    branchesSheet(
      wb,
      rows,
      'Davr: 01.07.2026 — 31.07.2026',
      'Barcha filiallar',
    );
    const ws = wb.getWorksheet('Filiallar')!;

    const h = headerOf(ws, 'Filial');
    expect(h).toContain("O'tilgan darslar qiymati");
    expect(h).toContain('Kassaga tushgan pul');
    expect(h).toContain("Guruhda o'qiyapti");

    const total = rowFor(ws, 'Jami');
    expect(total[1]).toBe(173_783_991);
    expect(total[8]).toBe(427);
  });
});
