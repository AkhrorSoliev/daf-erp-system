import { Workbook, Worksheet } from 'exceljs';
import { buildNetProfit, cellText } from './reports-excel.helpers';
import { netProfitSheet } from './reports-excel.sheets';
import { emptyTaxCosts } from '../tax/tax-costs';

const pl = {
  operatingExpenses: { byCategory: [{ amount: 100 }], adminSalaries: 0 },
  costOfServices: { teacherSalaries: 0 },
};

const render = (taxes = emptyTaxCosts()) => {
  const wb = new Workbook();
  const np = buildNetProfit(
    pl,
    { totals: {}, staffTotals: {} },
    { refunds: 0 },
    '2026-10',
    1000,
    0,
    taxes,
  );
  netProfitSheet(wb, np, 'Oktabr 2026');
  return wb.getWorksheet('Sof foyda')!;
};

const rowOf = (ws: Worksheet, label: string) => {
  let found: any = null;
  ws.eachRow((row) => {
    if (!found && cellText(row.getCell(1).value) === label) found = row;
  });
  return found;
};

describe('netProfitSheet — tax and fee rows (spec 2026-10-25)', () => {
  it('lists the three tax rows and subtracts their total', () => {
    const ws = render({
      ...emptyTaxCosts(),
      providerFees: 10,
      employerSocialTax: 15,
      turnoverTax: 20,
      total: 50,
    });
    expect(rowOf(ws, '−  To‘lov komissiyasi').getCell(2).value).toBe(10);
    expect(rowOf(ws, '−  Ijtimoiy soliq (korxona)').getCell(2).value).toBe(15);
    expect(rowOf(ws, '−  Aylanma solig‘i').getCell(2).value).toBe(20);
    expect(rowOf(ws, '−  Bank xarajati')).toBeNull();
    expect(rowOf(ws, '=  SOF FOYDA').getCell(2).value).toBe(1000 - 100 - 50);
    expect(rowOf(ws, 'Diqqat: hisob to‘liq emas')).toBeNull();
    // The old memo row for the gateway fee is gone.
    expect(rowOf(ws, 'Gateway komissiyasi (Payme/Click)')).toBeNull();
  });

  it('warns that the figure is incomplete when a used rate is missing', () => {
    const ws = render({
      ...emptyTaxCosts(),
      missingRates: ['bank.feesEntered'],
    });
    const warn = rowOf(ws, 'Diqqat: hisob to‘liq emas');
    expect(cellText(warn.getCell(3).value)).toBe(
      'Stavka kiritilmagan: bank.feesEntered',
    );
  });
});
