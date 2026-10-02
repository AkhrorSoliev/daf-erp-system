import { renderStatementPdf, statementDocDefinition } from './statement-pdf';
import type { StatementView } from './present-statement';

const view = (): StatementView => ({
  title: "To'lovlar hisoboti",
  studentLine:
    "Test Student · ID 7 · #036 guruh · Standart — oyiga 450 000 so'm",
  asOfLine: 'DaF Sprachzentrum · 26.09.2026 holatiga',
  answer: {
    tone: 'debt',
    title: "Qarzingiz: 257 500 so'm",
    subtitle: 'sentabr darslari uchun 187 500',
  },
  equation: [
    { text: "To'lagansiz " },
    { text: '200 000', bold: true },
    { text: ' = ' },
    { text: '−257 500', bold: true, tone: 'red' },
  ],
  dues: [
    {
      key: '2026-09',
      label: 'Sentabr',
      wide: false,
      bold: true,
      lessons: '5 ta',
      lessonsNote: '1 kelmagan',
      cost: '187 500',
      costNote: null,
      paid: '0',
      left: '187 500',
      leftTone: 'red',
      details: ["oylik to'lov: 5 dars × 37 500"],
      highlight: true,
    },
  ],
  duesTotal: {
    cost: '187 500',
    paid: '0',
    left: '187 500',
    leftTone: 'red',
    details: [],
  },
  surplus: null,
  sharpNote: [{ text: "Sentabr iyuldan 82 500 so'm kam.", bold: true }],
  payments: [
    {
      date: '21.07.2026',
      what: 'Naqd',
      amount: '200 000',
      to: 'iyul',
      paymentId: 'p1',
    },
  ],
  paidTotal: '200 000',
  notes: ['Izoh.'],
  warning: null,
});

const flatten = (node: unknown): string => JSON.stringify(node);

describe('statement PDF', () => {
  it('lays out every part of the statement', () => {
    const doc = flatten(statementDocDefinition(view()).content);
    for (const text of [
      "Qarzingiz: 257 500 so'm",
      "Oylar bo'yicha",
      'Sentabr',
      '1 kelmagan',
      "oylik to'lov: 5 dars × 37 500",
      "To'lovlar",
      "Jami to'langan",
      'Qaysi oyga yozildi',
      'Qarz',
      'Jami',
      'Izohlar',
      'Izoh.',
    ]) {
      expect(doc).toContain(text);
    }
  });

  it('renders a real PDF', async () => {
    const pdf = await renderStatementPdf(view());
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  });
});
