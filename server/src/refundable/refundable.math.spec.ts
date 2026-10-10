import {
  ageBucket,
  AGE_STATE_LABEL,
  chipCounts,
  daysBetween,
  noticeLabel,
  pendingDue,
  pendingDueLabel,
  refundableTab,
  refundableTabTotals,
  sinceDay,
  sortRefundableRows,
  toPendingRow,
  toRefundableRow,
  type RefundableStudentFact,
} from './refundable.math';

const none = new Set<string>();
const TODAY = '2026-10-14';
const student = (
  over: Partial<RefundableStudentFact> = {},
): RefundableStudentFact => ({
  id: 10001,
  firstName: 'Ali',
  lastName: 'Karimov',
  phone: '901112233',
  balance: 300_000,
  status: 'FROZEN',
  statusChangedAt: new Date('2026-09-20T07:00:00Z'),
  createdAt: new Date('2026-01-10T07:00:00Z'),
  ...over,
});

describe('refundable math (ADR-0075)', () => {
  it("ADR-0067's kinds: FROZEN, ungrouped ACTIVE, anything else", () => {
    expect(refundableTab('FROZEN')).toBe('muzlatilgan');
    expect(refundableTab('ACTIVE')).toBe('guruhsiz');
    expect(refundableTab('EXPELLED')).toBe('ketgan');
    expect(refundableTab('GRADUATED')).toBe('ketgan');
  });

  it('counts Tashkent calendar days', () => {
    expect(daysBetween('2026-09-20', TODAY)).toBe(24);
    expect(daysBetween('2026-08-01', TODAY)).toBe(74);
    expect(daysBetween(TODAY, TODAY)).toBe(0);
  });

  it('the age buckets are ≤ 30, 31–60, > 60 — chips and «Holat» alike', () => {
    expect([0, 30, 31, 60, 61].map(ageBucket)).toEqual([
      'upto30',
      'upto30',
      'd31to60',
      'd31to60',
      'over60',
    ]);
    expect(AGE_STATE_LABEL).toEqual({
      upto30: 'kutilmoqda',
      d31to60: "muddati o'tgan",
      over60: 'ketgan hisoblanadi',
    });
  });

  describe('sinceDay', () => {
    const last = {
      statusChangedAt: new Date('2026-09-04T07:00:00Z'),
      group: { id: 'g-1', name: 'A1-05' },
    };
    it('ungrouped: the day the last enrollment closed, the status stays ACTIVE', () => {
      expect(
        sinceDay(
          'guruhsiz',
          student({ status: 'ACTIVE', statusChangedAt: null }),
          last,
        ),
      ).toBe('2026-09-04');
    });
    it("frozen and left: the student's own status change, never the enrollment's", () => {
      expect(sinceDay('muzlatilgan', student(), last)).toBe('2026-09-20');
    });
    it('falls back to the status change, then the card', () => {
      expect(sinceDay('guruhsiz', student({ status: 'ACTIVE' }), null)).toBe(
        '2026-09-20',
      );
      expect(sinceDay('ketgan', student({ statusChangedAt: null }), null)).toBe(
        '2026-01-10',
      );
    });
  });

  it("a row carries the kind, the age and the latest notice of the student's current state", () => {
    const row = toRefundableRow(
      student(),
      null,
      { createdAt: new Date('2026-09-10T07:00:00Z'), channel: 'BOT' },
      TODAY,
    );
    expect(row).toMatchObject({
      studentId: 10001,
      kind: 'muzlatilgan',
      since: '2026-09-20',
      days: 24,
      ageBucket: 'upto30',
      lastGroup: null,
      // Given before the freeze: does not count.
      notice: null,
    });
    const after = toRefundableRow(
      student(),
      null,
      { createdAt: new Date('2026-10-01T07:00:00Z'), channel: 'CALL' },
      TODAY,
    );
    expect(after.notice).toEqual({ date: '2026-10-01', channel: 'CALL' });
  });

  it('totals per tab; the chips add up to the frozen tab; largest balance first', () => {
    const rows = sortRefundableRows([
      toRefundableRow(
        student({ id: 10001, balance: 100_000 }),
        null,
        null,
        TODAY,
      ),
      toRefundableRow(
        student({
          id: 10002,
          balance: 200_000,
          statusChangedAt: new Date('2026-08-01T07:00:00Z'),
        }),
        null,
        null,
        TODAY,
      ),
      toRefundableRow(
        student({ id: 10003, balance: 200_000, status: 'EXPELLED' }),
        null,
        null,
        TODAY,
      ),
    ]);
    expect(rows.map((r) => r.studentId)).toEqual([10002, 10003, 10001]);
    expect(refundableTabTotals(rows)).toEqual({
      muzlatilgan: { total: 300_000, count: 2 },
      guruhsiz: { total: 0, count: 0 },
      ketgan: { total: 200_000, count: 1 },
    });
    const frozen = rows.filter((r) => r.kind === 'muzlatilgan');
    const chips = chipCounts(frozen);
    expect(chips).toEqual({ all: 2, upto30: 1, d31to60: 0, over60: 1 });
    expect(chips.upto30 + chips.d31to60 + chips.over60).toBe(chips.all);
  });

  describe('pending pills', () => {
    it('bank days left, the last two amber on the client', () => {
      expect(pendingDue('2026-10-10', '2026-10-23', none)).toEqual({
        overdue: false,
        bankDays: 10,
      });
      expect(pendingDue('2026-10-10', '2026-10-13', none)).toEqual({
        overdue: false,
        bankDays: 2,
      });
      expect(pendingDueLabel({ overdue: false, bankDays: 2 })).toBe(
        '2 bank kuni qoldi',
      );
    });
    it('overdue counts the bank days since the due day', () => {
      expect(pendingDue('2026-10-10', '2026-10-07', none)).toEqual({
        overdue: true,
        bankDays: 2,
      });
      expect(pendingDueLabel({ overdue: true, bankDays: 2 })).toBe(
        "muddati o'tdi · 2 bank kuni",
      );
    });
    it('a weekend right after the due Friday is overdue with no bank day yet', () => {
      expect(pendingDue('2026-10-10', '2026-10-09', none)).toEqual({
        overdue: true,
        bankDays: 0,
      });
      expect(pendingDueLabel({ overdue: true, bankDays: 0 })).toBe(
        "muddati o'tdi",
      );
    });
    it('a pending row: amount, branch, the due day as a string', () => {
      const row = toPendingRow(
        {
          id: 'r-1',
          studentId: 10005,
          requestedAmount: 250_000,
          approvedAmount: 250_000,
          createdAt: new Date('2026-09-28T06:00:00Z'),
          dueDate: new Date('2026-10-12T19:00:00Z'),
          reason: null,
          student: {
            firstName: 'Vali',
            lastName: 'Test',
            phone: '9010005',
            branches: [{ branchId: 1 }],
          },
        },
        TODAY,
        none,
      );
      expect(row).toEqual({
        id: 'r-1',
        studentId: 10005,
        firstName: 'Vali',
        lastName: 'Test',
        phone: '9010005',
        branchId: 1,
        amount: 250_000,
        requestedAt: '2026-09-28T06:00:00.000Z',
        dueDate: '2026-10-13',
        due: { overdue: true, bankDays: 1 },
        reason: null,
      });
    });
  });

  it('the «Xabar» cell', () => {
    expect(noticeLabel(null)).toBe('berilmagan');
    expect(noticeLabel({ date: '2026-10-10', channel: 'BOT' })).toBe(
      '10.10 · bot orqali',
    );
    expect(noticeLabel({ date: '2026-10-10', channel: 'CALL' })).toBe(
      "10.10 · qo'ng'iroq qilib aytildi",
    );
  });
});
