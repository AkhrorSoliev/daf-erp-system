import { formatSom } from '../../src/payments/shared/format-som';
import { matchCorrections } from './payment-correction-links';

const old = (id: string, over = {}) => ({
  id,
  studentId: 10001,
  amount: 4_000_000,
  reversedAt: new Date('2026-10-01T05:00:00Z'),
  reversalDescription: "Bekor qilindi: Summa to'g'rilandi: ortiqcha nol",
  ...over,
});
const neu = (id: string, over = {}) => ({
  id,
  studentId: 10001,
  createdAt: new Date('2026-10-01T05:00:05Z'),
  note: `To'g'rilangan to'lov (avvalgi summa: ${formatSom(4_000_000)} so'm). Sabab: ortiqcha nol`,
  ...over,
});

describe('matchCorrections', () => {
  it('links exactly one candidate', () =>
    expect(matchCorrections([old('o1')], [neu('n1')]).links).toEqual([
      { oldId: 'o1', newId: 'n1' },
    ]));
  it('accepts the method-only prefix', () =>
    expect(
      matchCorrections(
        [
          old('o1', {
            reversalDescription: "Bekor qilindi: To'lov usuli to'g'rilandi",
          }),
        ],
        [neu('n1')],
      ).links,
    ).toHaveLength(1));
  it('ignores other reversals', () =>
    expect(
      matchCorrections(
        [old('o1', { reversalDescription: 'Bekor qilindi: xato' })],
        [neu('n1')],
      ),
    ).toEqual({ links: [], unlinked: [] }));
  it('no candidate in 10 minutes -> unlinked', () =>
    expect(
      matchCorrections(
        [old('o1')],
        [neu('n1', { createdAt: new Date('2026-10-01T05:11:00Z') })],
      ).unlinked,
    ).toEqual([{ oldId: 'o1', reason: 'nomzod topilmadi' }]));
  it('two candidates -> unlinked', () =>
    expect(
      matchCorrections([old('o1')], [neu('n1'), neu('n2')]).unlinked,
    ).toEqual([{ oldId: 'o1', reason: '2 ta nomzod' }]));
  it('another student or another old amount never matches', () => {
    expect(
      matchCorrections([old('o1')], [neu('n1', { studentId: 10002 })]).links,
    ).toEqual([]);
    expect(
      matchCorrections([old('o1', { amount: 300_000 })], [neu('n1')]).links,
    ).toEqual([]);
  });
  it('a new payment is used once, oldest reversal first', () => {
    const r = matchCorrections(
      [old('o2', { reversedAt: new Date('2026-10-01T05:00:01Z') }), old('o1')],
      [neu('n1')],
    );
    expect(r.links).toEqual([{ oldId: 'o1', newId: 'n1' }]);
    expect(r.unlinked).toEqual([{ oldId: 'o2', reason: 'nomzod topilmadi' }]);
  });
});
