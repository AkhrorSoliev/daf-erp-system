// Railway'dagi kabi: jarayon vaqt mintaqasi UTC.
process.env.TZ = 'UTC';

import { formatTashkentDate } from './mock-exam-pdf.service';

/**
 * PDF'dagi "E'lon qilingan" sanasi jarayon vaqt mintaqasi (Railway'da UTC)
 * bo'yicha chiqardi: Toshkentda 00:00–05:00 orasida e'lon qilingan natijalar
 * PDF'ga KECHAGI sana bilan tushardi.
 */
describe('mock PDF sanasi Toshkent bo‘yicha', () => {
  it('Toshkent tong 01:30 — o‘sha kun, kecha emas', () => {
    // 23.09 20:30 UTC = 24.09 01:30 Toshkent
    expect(formatTashkentDate(new Date('2026-09-23T20:30:00Z'))).toBe(
      '24.09.2026',
    );
  });

  it('kunduzgi vaqt o‘zgarmaydi', () => {
    expect(formatTashkentDate(new Date('2026-09-24T07:00:00Z'))).toBe(
      '24.09.2026',
    );
  });
});
