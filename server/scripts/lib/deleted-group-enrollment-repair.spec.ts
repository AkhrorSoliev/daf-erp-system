import {
  applyClose,
  findStrandedEnrollments,
  splitByMoney,
  summarize,
  type StrandedEnrollment,
} from './deleted-group-enrollment-repair';

const txOf = (tx: any) => ({
  $transaction: jest.fn((fn: (t: any) => unknown) => fn(tx)),
});

// 20:00 UTC on 30 June is 01:00 on 1 July in Tashkent: deleted in JULY.
const DELETED_AT = new Date('2026-06-30T20:00:00.000Z');
const FROZEN_BEFORE = new Date('2026-05-10T08:00:00.000Z');
const FROZEN_AFTER = new Date('2026-07-15T06:00:00.000Z');

const stranded = (
  over: Partial<StrandedEnrollment> = {},
): StrandedEnrollment => ({
  enrollmentId: 'enr-1',
  status: 'FROZEN',
  studentId: 20001,
  studentName: 'Ism Familiya',
  groupId: 'group-1',
  groupName: '#014',
  companyId: 1001,
  groupDeletedAt: DELETED_AT,
  groupDeletedById: 30001,
  closeAt: DELETED_AT,
  prepaidLessonsRemaining: 0,
  openMonthlyCharges: 0,
  ...over,
});

const dbRow = (over: Record<string, unknown> = {}) => ({
  id: 'enr-1',
  status: 'FROZEN',
  studentId: 20001,
  prepaidLessonsRemaining: 0,
  statusChangedAt: FROZEN_BEFORE,
  student: { firstName: 'Ism', lastName: 'Familiya' },
  group: {
    id: 'group-1',
    name: '#014',
    companyId: 1001,
    deletedAt: DELETED_AT,
    deletedById: 30001,
  },
  stateLog: [{ transitionAt: FROZEN_BEFORE }],
  monthlyCharges: [],
  ...over,
});

const findWith = async (rows: object[]) => {
  const db = { enrollment: { findMany: jest.fn().mockResolvedValue(rows) } };
  const found = await findStrandedEnrollments(db as any);
  return { found, query: db.enrollment.findMany.mock.calls[0][0] };
};

describe('deleted-group enrollment repair — finding', () => {
  it('reads live enrollments of deleted groups and counts charges from the Tashkent deletion month on', async () => {
    const { found, query } = await findWith([
      dbRow({
        monthlyCharges: [
          { periodYear: 2026, periodMonth: 6 },
          { periodYear: 2026, periodMonth: 7 },
          { periodYear: 2026, periodMonth: 8 },
        ],
      }),
    ]);

    expect(query.where).toEqual({
      deletedAt: null,
      status: { in: ['ACTIVE', 'FROZEN'] },
      group: { deletedAt: { not: null } },
    });
    // A reversed charge was already given back; only a live one is money.
    expect(query.select.monthlyCharges.where).toEqual({ status: 'CHARGED' });
    expect(found).toEqual([
      {
        enrollmentId: 'enr-1',
        status: 'FROZEN',
        studentId: 20001,
        studentName: 'Ism Familiya',
        groupId: 'group-1',
        groupName: '#014',
        companyId: 1001,
        groupDeletedAt: DELETED_AT,
        groupDeletedById: 30001,
        closeAt: DELETED_AT,
        prepaidLessonsRemaining: 0,
        // June was fully held before the deletion; July and August were not.
        openMonthlyCharges: 2,
      },
    ]);
  });

  it('closes a row changed after its group was deleted no earlier than that change', async () => {
    const { found, query } = await findWith([
      // Frozen in the dead group after it was deleted.
      dbRow({
        id: 'enr-late',
        statusChangedAt: FROZEN_AFTER,
        stateLog: [{ transitionAt: FROZEN_AFTER }],
      }),
      // A legacy row whose last log entry is later than its own column.
      dbRow({
        id: 'enr-late-log',
        statusChangedAt: FROZEN_BEFORE,
        stateLog: [{ transitionAt: FROZEN_AFTER }],
      }),
      // Nothing recorded at all.
      dbRow({ id: 'enr-bare', statusChangedAt: null, stateLog: [] }),
    ]);

    // The latest log entry is the one compared against.
    expect(query.select.stateLog).toEqual({
      orderBy: { transitionAt: 'desc' },
      take: 1,
      select: { transitionAt: true },
    });
    expect(found.map((r) => [r.enrollmentId, r.closeAt])).toEqual([
      ['enr-late', FROZEN_AFTER],
      ['enr-late-log', FROZEN_AFTER],
      ['enr-bare', DELETED_AT],
    ]);
  });
});

describe('deleted-group enrollment repair — planning', () => {
  it('leaves anything with money attached to a person, and closes the rest', () => {
    const plain = stranded({ enrollmentId: 'enr-plain' });
    const prepaid = stranded({
      enrollmentId: 'enr-prepaid',
      prepaidLessonsRemaining: 3,
    });
    const charged = stranded({
      enrollmentId: 'enr-charged',
      openMonthlyCharges: 1,
    });

    const { toClose, withMoney } = splitByMoney([plain, prepaid, charged]);

    expect(toClose.map((r) => r.enrollmentId)).toEqual(['enr-plain']);
    expect(withMoney.map((r) => r.enrollmentId)).toEqual([
      'enr-prepaid',
      'enr-charged',
    ]);
  });

  it('summarizes in counts only, deletion months in Tashkent time', () => {
    const summary = summarize([
      stranded({ enrollmentId: 'a', studentId: 1, groupId: 'g1' }),
      stranded({
        enrollmentId: 'b',
        studentId: 1,
        groupId: 'g2',
        status: 'ACTIVE',
        groupDeletedAt: new Date('2026-09-10T07:00:00.000Z'),
      }),
      stranded({
        enrollmentId: 'c',
        studentId: 2,
        groupId: 'g1',
        closeAt: FROZEN_AFTER,
      }),
    ]);

    expect(summary).toEqual({
      enrollments: 3,
      students: 2,
      groups: 2,
      byStatus: { ACTIVE: 1, FROZEN: 2 },
      byDeletionMonth: { '2026-07': 2, '2026-09': 1 },
      closingAfterDeletion: 1,
    });
  });
});

describe('deleted-group enrollment repair — applying', () => {
  const makeTx = (over: { closed?: number; charges?: object[] } = {}) => ({
    enrollment: {
      updateMany: jest.fn().mockResolvedValue({ count: over.closed ?? 1 }),
    },
    enrollmentMonthlyCharge: {
      findMany: jest.fn().mockResolvedValue(over.charges ?? []),
    },
    enrollmentStateLog: { create: jest.fn().mockResolvedValue({}) },
  });

  it("closes the enrollment as DROPPED at the group's deletion, logged and in both histories", async () => {
    const tx = makeTx();
    const history = { recordDelete: jest.fn() };

    const result = await applyClose(
      txOf(tx) as any,
      history as any,
      stranded(),
    );

    expect(result).toBe('applied');
    expect(tx.enrollment.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'enr-1',
        deletedAt: null,
        status: { in: ['ACTIVE', 'FROZEN'] },
        prepaidLessonsRemaining: { lte: 0 },
        group: { deletedAt: { not: null } },
        OR: [
          { statusChangedAt: null },
          { statusChangedAt: { lte: DELETED_AT } },
        ],
      },
      data: {
        status: 'DROPPED',
        statusChangedAt: DELETED_AT,
        statusChangedById: 30001,
        statusChangeReason: "Guruh o'chirildi",
      },
    });
    expect(tx.enrollmentStateLog.create).toHaveBeenCalledWith({
      data: {
        enrollmentId: 'enr-1',
        status: 'DROPPED',
        transitionAt: DELETED_AT,
        reason: "Guruh o'chirildi",
        changedById: 30001,
      },
    });
    expect(history.recordDelete).toHaveBeenCalledTimes(2);
    expect(history.recordDelete).toHaveBeenCalledWith({
      entityType: 'Student',
      entityId: 20001,
      oldValues: {
        guruh: '#014',
        guruhId: 'group-1',
        action: 'GURUHDAN_CHIQARILDI',
        sabab: "Guruh o'chirildi",
        sana: '2026-06-30T20:00:00.000Z',
      },
      changedById: 30001,
      companyId: 1001,
      tx,
    });
    expect(history.recordDelete).toHaveBeenCalledWith({
      entityType: 'Group',
      entityId: 'group-1',
      oldValues: {
        action: 'OQUVCHI_CHIQARILDI',
        oquvchi: 'Ism Familiya',
        oquvchiId: 20001,
        sabab: "Guruh o'chirildi",
        sana: '2026-06-30T20:00:00.000Z',
      },
      changedById: 30001,
      companyId: 1001,
      tx,
    });
  });

  it('closes a row changed after the deletion at that change, keeping the log in order', async () => {
    const tx = makeTx();
    const history = { recordDelete: jest.fn() };

    await applyClose(
      txOf(tx) as any,
      history as any,
      stranded({ closeAt: FROZEN_AFTER }),
    );

    const { where, data } = tx.enrollment.updateMany.mock.calls[0][0];
    expect(data.statusChangedAt).toEqual(FROZEN_AFTER);
    expect(where.OR).toEqual([
      { statusChangedAt: null },
      { statusChangedAt: { lte: FROZEN_AFTER } },
    ]);
    expect(
      tx.enrollmentStateLog.create.mock.calls[0][0].data.transitionAt,
    ).toEqual(FROZEN_AFTER);
    // The history still names the day the group was deleted.
    for (const [params] of history.recordDelete.mock.calls) {
      expect(params.oldValues.sana).toBe('2026-06-30T20:00:00.000Z');
    }
  });

  it('records no actor when nobody is on record as deleting the group', async () => {
    const tx = makeTx();
    const history = { recordDelete: jest.fn() };

    await applyClose(
      txOf(tx) as any,
      history as any,
      stranded({ groupDeletedById: null }),
    );

    expect(
      tx.enrollment.updateMany.mock.calls[0][0].data.statusChangedById,
    ).toBeNull();
    expect(tx.enrollmentStateLog.create.mock.calls[0][0].data.changedById).toBe(
      null,
    );
    for (const [params] of history.recordDelete.mock.calls) {
      expect(params.changedById).toBeUndefined();
    }
  });

  it('skips, writing nothing, when the enrollment changed since planning', async () => {
    const tx = makeTx({ closed: 0 });
    const history = { recordDelete: jest.fn() };

    const result = await applyClose(
      txOf(tx) as any,
      history as any,
      stranded(),
    );

    expect(result).toBe('skipped');
    expect(tx.enrollmentStateLog.create).not.toHaveBeenCalled();
    expect(history.recordDelete).not.toHaveBeenCalled();
  });

  it('skips an enrollment that still carries a charge from the deletion month on', async () => {
    const tx = makeTx({ charges: [{ periodYear: 2026, periodMonth: 7 }] });
    const history = { recordDelete: jest.fn() };

    const result = await applyClose(
      txOf(tx) as any,
      history as any,
      stranded(),
    );

    expect(result).toBe('skipped');
    expect(tx.enrollment.updateMany).not.toHaveBeenCalled();
    expect(tx.enrollmentStateLog.create).not.toHaveBeenCalled();
    expect(history.recordDelete).not.toHaveBeenCalled();
  });

  it('closes an enrollment whose only charge is for a month before the deletion', async () => {
    const tx = makeTx({ charges: [{ periodYear: 2026, periodMonth: 6 }] });
    const history = { recordDelete: jest.fn() };

    const result = await applyClose(
      txOf(tx) as any,
      history as any,
      stranded(),
    );

    expect(result).toBe('applied');
  });
});
