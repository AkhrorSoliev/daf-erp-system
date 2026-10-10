import { toRefundHistoryRow } from './refund-view';

const person = (id: number, firstName: string) => ({
  id,
  firstName,
  lastName: 'Test',
});
const row = (over: Record<string, unknown> = {}) =>
  ({
    id: 'r-1',
    status: 'COMPLETED',
    requestedAmount: 90_000,
    approvedAmount: 90_000,
    reason: null,
    createdAt: new Date('2026-09-20T07:00:00Z'),
    dueDate: new Date('2026-10-03T19:00:00Z'),
    handedOverAt: null,
    processedAt: null,
    refundMethod: null,
    cancelledAt: null,
    cancelReason: null,
    student: {
      id: 10001,
      firstName: 'Ali',
      lastName: 'Karimov',
      phone: '901112233',
    },
    handedOverBy: null,
    processedBy: null,
    cancelledBy: null,
    ...over,
  }) as never;

describe('toRefundHistoryRow', () => {
  it('a refund paid out before ADR-0077 shows its processedAt as «Berildi»', () => {
    const out = toRefundHistoryRow(
      row({
        processedAt: new Date('2026-09-20T07:00:00Z'),
        processedBy: person(20001, 'Nodira'),
        refundMethod: 'CASH',
      }),
    );
    expect(out).toMatchObject({
      amount: 90_000,
      requestedAt: '2026-09-20T07:00:00.000Z',
      dueDate: '2026-10-04',
      handedOverAt: '2026-09-20T07:00:00.000Z',
      refundMethod: 'CASH',
      closedBy: { id: 20001, name: 'Nodira Test' },
    });
  });

  it('a handed-over request names who handed it over', () => {
    const out = toRefundHistoryRow(
      row({
        handedOverAt: new Date('2026-10-05T09:00:00Z'),
        processedAt: new Date('2026-10-05T09:00:00Z'),
        handedOverBy: person(20002, 'Sardor'),
        processedBy: person(20002, 'Sardor'),
        refundMethod: 'TRANSFER',
      }),
    );
    expect(out.handedOverAt).toBe('2026-10-05T09:00:00.000Z');
    expect(out.closedBy).toEqual({ id: 20002, name: 'Sardor Test' });
  });

  it('a cancelled request carries its reason and who cancelled it, no hand-over', () => {
    const out = toRefundHistoryRow(
      row({
        status: 'REJECTED',
        cancelledAt: new Date('2026-10-01T10:00:00Z'),
        cancelReason: 'Fikridan qaytdi',
        cancelledBy: person(20003, 'Lola'),
      }),
    );
    expect(out).toMatchObject({
      status: 'REJECTED',
      handedOverAt: null,
      cancelledAt: '2026-10-01T10:00:00.000Z',
      cancelReason: 'Fikridan qaytdi',
      closedBy: { id: 20003, name: 'Lola Test' },
    });
  });
});
