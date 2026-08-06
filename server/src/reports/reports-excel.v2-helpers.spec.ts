import { Workbook } from 'exceljs';
import {
  isSalaryDataReliable,
  uzMonthLabel,
  sheetHead,
  countRow,
  compareRow,
} from './reports-excel.v2-helpers';

describe('isSalaryDataReliable', () => {
  it('May 2026 — 33 334 so\'m of salary against 152M of lessons is not real data', () => {
    expect(isSalaryDataReliable(152_415_637, 33_334)).toBe(false);
  });

  it('July 2026 — a normal month passes', () => {
    expect(isSalaryDataReliable(173_783_991, 95_834_547)).toBe(true);
  });

  it('exactly 15% passes', () => {
    expect(isSalaryDataReliable(1_000_000, 150_000)).toBe(true);
  });

  it('just under 15% fails', () => {
    expect(isSalaryDataReliable(1_000_000, 149_999)).toBe(false);
  });

  it('no revenue is never reliable', () => {
    expect(isSalaryDataReliable(0, 0)).toBe(false);
  });
});

describe('uzMonthLabel', () => {
  it('renders Latin Uzbek month names', () => {
    expect(uzMonthLabel('2026-07')).toBe('Iyul 2026');
    expect(uzMonthLabel('2026-01')).toBe('Yanvar 2026');
    expect(uzMonthLabel('2026-12')).toBe('Dekabr 2026');
  });
});

describe('sheetHead', () => {
  it('always writes the period line under the title', () => {
    const wb = new Workbook();
    const ws = wb.addWorksheet('T');
    sheetHead(ws, 'HISOBOT', 'Davr: 01.07.2026 — 31.07.2026', 'Barcha filiallar', 5);
    expect(ws.getRow(1).getCell(1).value).toBe('HISOBOT');
    expect(ws.getRow(2).getCell(1).value).toBe('Davr: 01.07.2026 — 31.07.2026');
    expect(ws.getRow(3).getCell(1).value).toBe('Barcha filiallar');
  });
});

describe('countRow', () => {
  it('formats a count as a plain number, never as so\'m', () => {
    const wb = new Workbook();
    const ws = wb.addWorksheet('T');
    const r = countRow(ws, "Sof o'zgarish", -62);
    expect(r.getCell(2).numFmt).toBe('#,##0');
    expect(r.getCell(2).numFmt).not.toContain("so'm");
  });
});

describe('compareRow', () => {
  it('renders no delta when either side is null', () => {
    const wb = new Workbook();
    const ws = wb.addWorksheet('T');
    const r1 = compareRow(ws, 'Dars tushumi', 100, null);
    expect(r1.getCell(4).value).toBe('');
    const r2 = compareRow(ws, 'Dars tushumi', null, 100);
    expect(r2.getCell(4).value).toBe('');
  });
});
