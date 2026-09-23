import { Prisma, TelegramDigestCategory } from '@prisma/client';
import { dedupRows } from './telegram-digest-dedup';
import { TelegramDigestItemRow } from './telegram-digest-payloads';

const row = (
  id: string,
  category: TelegramDigestCategory,
  relatedEntityId: string | null,
  at: string,
): TelegramDigestItemRow => ({
  id,
  companyId: 1001,
  branchId: null,
  category,
  relatedEntityId,
  payload: {} as Prisma.JsonValue,
  createdAt: new Date(at),
});

describe('dedupRows', () => {
  it('never merges rows without a relatedEntityId', () => {
    const out = dedupRows([
      row(
        'a',
        TelegramDigestCategory.SALARY_CARRIED_OVER,
        null,
        '2026-09-23T05:00:00Z',
      ),
      row(
        'b',
        TelegramDigestCategory.SALARY_CARRIED_OVER,
        null,
        '2026-09-23T06:00:00Z',
      ),
    ]);
    expect(out.map((e) => e.ids)).toEqual([['a'], ['b']]);
  });

  it('shows the latest of rows sharing category + relatedEntityId and keeps every id', () => {
    const out = dedupRows([
      row(
        'old',
        TelegramDigestCategory.TASK_UPDATED,
        'task-1',
        '2026-09-23T05:00:00Z',
      ),
      row(
        'new',
        TelegramDigestCategory.TASK_UPDATED,
        'task-1',
        '2026-09-23T07:00:00Z',
      ),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].row.id).toBe('new');
    expect(out[0].ids.sort()).toEqual(['new', 'old']);
  });

  it('does not merge the same relatedEntityId across categories', () => {
    const out = dedupRows([
      row(
        'a',
        TelegramDigestCategory.TASK_ASSIGNED,
        'task-1',
        '2026-09-23T05:00:00Z',
      ),
      row(
        'b',
        TelegramDigestCategory.TASK_UPDATED,
        'task-1',
        '2026-09-23T06:00:00Z',
      ),
    ]);
    expect(out).toHaveLength(2);
  });

  it('orders entries by the shown row, oldest first', () => {
    const out = dedupRows([
      row(
        'late',
        TelegramDigestCategory.PAYMENT_RECEIVED,
        'p2',
        '2026-09-23T09:00:00Z',
      ),
      row(
        'early',
        TelegramDigestCategory.PAYMENT_RECEIVED,
        'p1',
        '2026-09-23T04:00:00Z',
      ),
    ]);
    expect(out.map((e) => e.row.id)).toEqual(['early', 'late']);
  });
});
