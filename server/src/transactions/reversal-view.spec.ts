import { reversalReason, reversalView, withReversal } from './reversal-view';

const at = (s: string) => new Date(`${s}T10:00:00Z`);

describe('reversalReason', () => {
  it('drops the standard prefix', () => {
    expect(
      reversalReason(
        "Bekor qilindi: Oylik to'lovga o'tish migratsiyasi — 2026-09",
      ),
    ).toBe("Oylik to'lovga o'tish migratsiyasi — 2026-09");
  });

  it('has no reason when only the row id was written', () => {
    expect(
      reversalReason('Bekor qilindi (3f1c2a9e-1b2c-4d5e-8f90-123456789abc)'),
    ).toBeNull();
    expect(reversalReason(null)).toBeNull();
    expect(reversalReason('   ')).toBeNull();
  });

  it('translates the English reasons early writers left', () => {
    expect(reversalReason('Bekor qilindi: attendance status changed')).toBe(
      "Davomat holati o'zgardi",
    );
    expect(
      reversalReason(
        'Bekor qilindi: Backfill reversal (batch 2026-05-17T16:39:48.525Z)',
      ),
    ).toBeNull();
  });

  it('keeps a hand-written description whole', () => {
    expect(
      reversalReason("Phantom dars to'lovi bekor qilindi (o'quvchi kelmagan)"),
    ).toBe("Phantom dars to'lovi bekor qilindi (o'quvchi kelmagan)");
  });
});

describe('reversalView', () => {
  const plain = {
    description: 'Dars uchun yechildi',
    reversedAt: null,
    reversedTransaction: null,
    reversalEntries: [],
  };

  it('is null for a row nothing cancelled', () => {
    expect(reversalView(plain)).toBeNull();
  });

  it('marks a cancelled row with when and why it was cancelled', () => {
    expect(
      reversalView({
        ...plain,
        reversedAt: at('2026-09-25'),
        reversalEntries: [
          {
            createdAt: at('2026-09-25'),
            description: "Bekor qilindi: Oylik to'lovga o'tish migratsiyasi",
          },
        ],
      }),
    ).toEqual({
      kind: 'reversed',
      at: at('2026-09-25'),
      reason: "Oylik to'lovga o'tish migratsiyasi",
    });
  });

  it('marks the cancelling row with the row it undid', () => {
    expect(
      reversalView({
        description: "Bekor qilindi: Oylik to'lovga o'tish migratsiyasi",
        reversedAt: null,
        reversedTransaction: { createdAt: at('2026-09-18'), amount: -37500 },
        reversalEntries: [],
      }),
    ).toEqual({
      kind: 'undo',
      originalAt: at('2026-09-18'),
      originalAmount: -37500,
      reason: "Oylik to'lovga o'tish migratsiyasi",
    });
  });

  it('falls back to reversedAt when the counter-row is not loaded', () => {
    expect(reversalView({ ...plain, reversedAt: at('2026-09-25') })).toEqual({
      kind: 'reversed',
      at: at('2026-09-25'),
      reason: null,
    });
  });
});

describe('withReversal', () => {
  it('replaces the relation fields with `reversal`', () => {
    const row = withReversal({
      id: 't1',
      amount: -37500,
      description: 'Dars uchun yechildi',
      reversedAt: null,
      reversedTransaction: null,
      reversalEntries: [],
    });
    expect(row).toEqual({
      id: 't1',
      amount: -37500,
      description: 'Dars uchun yechildi',
      reversal: null,
    });
  });
});
