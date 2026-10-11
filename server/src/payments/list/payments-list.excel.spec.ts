import { Workbook } from 'exceljs';
import { EXCEL_ROW_LIMIT, paymentsWorkbook } from './payments-list.excel';
import type { PaymentRow } from './payments-list.types';

// Made-up people, ids and amounts.
const row = (over: Partial<PaymentRow>): PaymentRow => ({
  id: 'p1',
  createdAt: '2026-10-10T13:20:00.000Z',
  amount: 535_714,
  method: 'TRANSFER',
  source: 'ADMIN_MANUAL',
  online: false,
  status: 'COMPLETED',
  receiptCode: 'K-2026-000001',
  receiptNumber: '123',
  note: 'Izoh matni',
  student: {
    id: 10001,
    firstName: 'Ism',
    lastName: 'Familiya',
    phone: '901112233',
    archived: false,
  },
  groups: [
    { id: 'g1', name: 'A1-01' },
    { id: 'g2', name: 'B1-02' },
  ],
  receivedBy: {
    id: 10002,
    firstName: 'Ism',
    lastName: 'Ikki',
    roleLabel: 'admin',
  },
  parts: [
    {
      kind: 'LATE',
      monthKey: '2026-09',
      label: 'Sentabr qarzi',
      amount: 150_000,
    },
    {
      kind: 'CURRENT',
      monthKey: '2026-10',
      label: "Oktabr to'lovi",
      amount: 385_714,
    },
  ],
  balanceBefore: null,
  balanceAfter: null,
  reversal: null,
  correctedBy: null,
  correctsPayment: null,
  ...over,
});

async function load(rows: PaymentRow[], filters = "yo'q") {
  const buf = await paymentsWorkbook(rows, {
    period: '01.10.2026 – 31.10.2026',
    filters,
  });
  const wb = new Workbook();
  await wb.xlsx.load(buf as never);
  const ws = wb.getWorksheet("To'lovlar")!;
  const cells = (n: number) => (ws.getRow(n).values as unknown[]).slice(1);
  return { ws, cells };
}

describe('paymentsWorkbook', () => {
  it('has the period, the filters and the headers in order', async () => {
    const { ws, cells } = await load([row({})]);
    expect(ws).toBeDefined();
    expect(cells(1)[0]).toBe('Davr: 01.10.2026 – 31.10.2026');
    expect(cells(2)[0]).toBe("Filtrlar: yo'q");
    expect(cells(3)).toEqual([
      '#',
      'Sana',
      "O'quvchi ID",
      "O'quvchi",
      'Telefon',
      'Guruh',
      'Summa',
      'Usul',
      'Nimaga ketdi',
      'Qabul qildi',
      'Kvitansiya (tizim)',
      "Kvitansiya (qog'oz)",
      'Izoh',
      'Manba',
      'Holat',
    ]);
  });

  it('writes a completed row in Tashkent time with its parts, receiver and source', async () => {
    const { cells } = await load([row({})], 'Usul: Click');
    expect(cells(2)[0]).toBe('Filtrlar: Usul: Click');
    expect(cells(4)).toEqual([
      1,
      '10.10.2026 18:20',
      10001,
      'Ism Familiya',
      '901112233',
      'A1-01, B1-02',
      535_714,
      "O'tkazma",
      "Sentabr qarzi 150 000; Oktabr to'lovi 385 714",
      'Ism Ikki (admin)',
      'K-2026-000001',
      '123',
      'Izoh matni',
      'Admin kiritgan',
      "O'tgan",
    ]);
  });

  it('receiver: no role -> name only; online -> Onlayn avtomatik', async () => {
    const { cells } = await load([
      row({
        receivedBy: {
          id: 1,
          firstName: 'Ism',
          lastName: 'Uch',
          roleLabel: null,
        },
      }),
      row({ online: true, source: 'GATEWAY_WEBHOOK', receivedBy: null }),
    ]);
    expect(cells(4)[9]).toBe('Ism Uch');
    expect(cells(5)[9]).toBe('Onlayn');
    expect(cells(5)[13]).toBe('Onlayn avtomatik');
  });

  it('reversed and corrected rows: no parts, their own status', async () => {
    const { cells } = await load([
      row({ status: 'REVERSED', parts: null }),
      row({
        status: 'REVERSED',
        parts: null,
        correctedBy: { id: 'p9', amount: 400_000 },
      }),
    ]);
    expect(cells(4)[8]).toBe('');
    expect(cells(4)[14]).toBe('Bekor qilingan');
    expect(cells(5)[14]).toBe('Tuzatildi → 400 000');
  });

  it('Jami sums completed amounts only', async () => {
    const { ws, cells } = await load([
      row({ amount: 100_000 }),
      row({ amount: 250_000, status: 'REVERSED', parts: null }),
      row({ amount: 50_000 }),
    ]);
    expect(ws.rowCount).toBe(7);
    const total = cells(7);
    expect(total[0]).toBe('Jami');
    expect(total[6]).toBe(150_000);
  });

  it('a text starting with = + - @ is kept as text, not a formula', async () => {
    const { ws } = await load([
      row({ note: '=1+1', student: { ...row({}).student, firstName: '@x' } }),
    ]);
    expect(ws.getRow(4).getCell(13).value).toBe("'=1+1");
    expect(ws.getRow(4).getCell(4).value).toBe("'@x Familiya");
  });

  it('the cap is 20 000', () => {
    expect(EXCEL_ROW_LIMIT).toBe(20_000);
  });
});
