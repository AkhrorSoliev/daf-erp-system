import { paidBarredCandidates } from './paid-barred-lessons';

const at = (iso: string) => new Date(iso);

const base = {
  coveredDates: ['2026-10-02', '2026-10-05', '2026-10-07', '2026-10-09'],
  frozenOutDates: [] as string[],
  manualTakenAt: new Map([
    ['2026-10-02', at('2026-10-02T12:05:00Z')],
    ['2026-10-05', at('2026-10-05T12:05:00Z')],
    ['2026-10-07', at('2026-10-07T12:05:00Z')],
  ]),
  markedDays: new Set(['2026-10-02']),
  enrolledAt: at('2026-09-20T08:00:00Z'),
  todayStr: '2026-10-07',
  todayEnded: true,
};

describe('paidBarredCandidates (ADR-0143)', () => {
  it('takes held days the student has no row on, today once it ended', () => {
    expect(paidBarredCandidates(base)).toEqual(['2026-10-05', '2026-10-07']);
  });

  it('leaves today out while the lesson runs', () => {
    expect(paidBarredCandidates({ ...base, todayEnded: false })).toEqual([
      '2026-10-05',
    ]);
  });

  it('ignores a day only QR scans took', () => {
    const qrOnly = new Map(base.manualTakenAt);
    qrOnly.delete('2026-10-05');
    expect(paidBarredCandidates({ ...base, manualTakenAt: qrOnly })).toEqual([
      '2026-10-07',
    ]);
  });

  it('ignores a day the student joined after the register was taken', () => {
    expect(
      paidBarredCandidates({
        ...base,
        enrolledAt: at('2026-10-05T13:00:00Z'),
      }),
    ).toEqual(['2026-10-07']);
  });

  it('ignores frozen-out days and days before 01.10', () => {
    expect(
      paidBarredCandidates({
        ...base,
        coveredDates: ['2026-09-30', ...base.coveredDates],
        manualTakenAt: new Map([
          ['2026-09-30', at('2026-09-30T12:05:00Z')],
          ...base.manualTakenAt,
        ]),
        frozenOutDates: ['2026-10-07'],
      }),
    ).toEqual(['2026-10-05']);
  });
});
