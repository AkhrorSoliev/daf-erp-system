import { periodShape } from './part-labels';
import { LoadedPayment, roleLabelOf, toPaymentRow } from './payment-row';

const at = new Date('2026-10-05T10:00:00Z');
const loaded = (over: Partial<LoadedPayment> = {}): LoadedPayment =>
  ({
    id: 'p1',
    amount: 535_714,
    method: 'CASH',
    status: 'COMPLETED',
    source: 'ADMIN_MANUAL',
    receiptCode: 'R-2026-00001',
    receiptNumber: '10001',
    note: null,
    createdAt: at,
    studentId: 10001,
    student: {
      id: 10001,
      firstName: 'Ism',
      lastName: 'Familiya',
      phone: '901112233',
      deletedAt: null,
    },
    receivedBy: {
      id: 10002,
      firstName: 'Xodim',
      lastName: 'Bir',
      roles: [{ roleId: 3 }, { roleId: 4 }],
    },
    correctsPayment: null,
    correctedBy: null,
    transactions: [
      { balanceBefore: -535_714, balanceAfter: 0, reversalEntries: [] },
    ],
    ...over,
  }) as LoadedPayment;
const ctx = {
  parts: {
    currentMonth: 385_714,
    advance: 0,
    late: [{ monthKey: '2026-09', amount: 150_000 }],
  },
  shape: periodShape('2026-10-01', '2026-10-31'),
  currentYear: '2026',
  groups: [{ id: 'g1', name: 'A1-01' }],
};

describe('roleLabelOf', () => {
  it.each([
    [[3, 4], 'admin'],
    [[2], 'direktor'],
    [[1, 3], 'CEO'],
    [[5], 'kassir'],
    [[4], null],
    [[], null],
  ])('%j → %s', (ids, label) => {
    expect(roleLabelOf(ids)).toBe(label);
  });
});

describe('toPaymentRow', () => {
  it('a completed payment: parts, balance, receiver, groups', () => {
    expect(toPaymentRow(loaded(), ctx)).toEqual({
      id: 'p1',
      createdAt: at.toISOString(),
      amount: 535_714,
      method: 'CASH',
      source: 'ADMIN_MANUAL',
      online: false,
      status: 'COMPLETED',
      receiptCode: 'R-2026-00001',
      receiptNumber: '10001',
      note: null,
      student: {
        id: 10001,
        firstName: 'Ism',
        lastName: 'Familiya',
        phone: '901112233',
        archived: false,
      },
      groups: [{ id: 'g1', name: 'A1-01' }],
      receivedBy: {
        id: 10002,
        firstName: 'Xodim',
        lastName: 'Bir',
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
      balanceBefore: -535_714,
      balanceAfter: 0,
      reversal: null,
      correctedBy: null,
      correctsPayment: null,
    });
  });

  it('an online payment', () => {
    const row = toPaymentRow(
      loaded({ source: 'GATEWAY_WEBHOOK', receivedBy: null }),
      ctx,
    );
    expect(row.online).toBe(true);
    expect(row.receivedBy).toBeNull();
  });

  it('a reversed payment: no parts, the reversal from its PAYMENT row', () => {
    const cancelledAt = new Date('2026-10-06T08:00:00Z');
    const row = toPaymentRow(
      loaded({
        status: 'REVERSED',
        transactions: [
          {
            balanceBefore: 0,
            balanceAfter: 300_000,
            reversalEntries: [
              {
                createdAt: cancelledAt,
                description: 'Bekor qilindi: Payme CancelTransaction',
                performedBy: null,
              },
            ],
          },
        ],
      }),
      ctx,
    );
    expect(row.parts).toBeNull();
    expect(row.balanceBefore).toBe(0);
    expect(row.balanceAfter).toBe(300_000);
    expect(row.reversal).toEqual({
      at: cancelledAt.toISOString(),
      reason: "Payme to'lovni bekor qildi",
      by: null,
    });
  });

  it('an archived student, a missing ledger row, no engine entry', () => {
    const row = toPaymentRow(
      loaded({
        student: {
          id: 10001,
          firstName: 'Ism',
          lastName: 'Familiya',
          phone: '901112233',
          deletedAt: at,
        },
        transactions: [],
      }),
      { ...ctx, parts: undefined },
    );
    expect(row.student.archived).toBe(true);
    expect(row.parts).toBeNull();
    expect(row.balanceBefore).toBeNull();
    expect(row.balanceAfter).toBeNull();
    expect(row.reversal).toBeNull();
  });

  it('passes the correction links through', () => {
    const row = toPaymentRow(
      loaded({
        correctedBy: { id: 'p9', amount: 400_000 },
        correctsPayment: { id: 'p0', amount: 4_000_000 },
      }),
      ctx,
    );
    expect(row.correctedBy).toEqual({ id: 'p9', amount: 400_000 });
    expect(row.correctsPayment).toEqual({ id: 'p0', amount: 4_000_000 });
  });
});
