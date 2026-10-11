import { previewReceiptCodes } from './receipt-code-plan';

describe('previewReceiptCodes', () => {
  it('counts per Tashkent year and continues after the global highest', () => {
    const missing = [
      { id: 'a', createdAt: new Date('2026-03-01T10:00:00Z') },
      { id: 'b', createdAt: new Date('2026-06-01T10:00:00Z') },
      { id: 'c', createdAt: new Date('2026-12-31T20:00:00Z') }, // 01.01.2027 in Tashkent
    ];
    const last = new Map<string, string | null>([
      ['R-2026-', 'R-2026-00010'],
      ['R-2027-', null],
    ]);
    expect(previewReceiptCodes(missing, last)).toEqual([
      {
        prefix: 'R-2026-',
        count: 2,
        first: 'R-2026-00011',
        last: 'R-2026-00012',
      },
      {
        prefix: 'R-2027-',
        count: 1,
        first: 'R-2027-00001',
        last: 'R-2027-00001',
      },
    ]);
  });
});
