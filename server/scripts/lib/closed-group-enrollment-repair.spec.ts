import {
  applyClose,
  findStrandedEnrollments,
  splitForRepair,
  summarize,
  type StrandedEnrollment,
} from './closed-group-enrollment-repair';

const txOf = (tx: any) => ({
  $transaction: jest.fn((fn: (t: any) => unknown) => fn(tx)),
});

// 20:00 UTC on 31 August is 01:00 on 1 September in Tashkent: closed in SEPTEMBER.
const CLOSED_AT = new Date('2026-08-31T20:00:00.000Z');
const FROZEN_BEFORE = new Date('2026-08-10T08:00:00.000Z');
const CHANGED_AFTER = new Date('2026-09-12T06:00:00.000Z');

const stranded = (
  over: Partial<StrandedEnrollment> = {},
): StrandedEnrollment => ({
  enrollmentId: 'enr-1',
  studentId: 20001,
  studentName: 'Ism Familiya',
  groupId: 'group-1',
  groupName: '#014',
  groupStatus: 'CANCELLED',
  companyId: 1001,
  groupClosedAt: CLOSED_AT,
  groupClosedById: 30001,
  closeAt: CLOSED_AT,
  prepaidLessonsRemaining: 0,
  openMonthlyCharges: 0,
  ...over,
});

const dbRow = (over: Record<string, unknown> = {}) => ({
  id: 'enr-1',
  studentId: 20001,
  prepaidLessonsRemaining: 0,
  statusChangedAt: FROZEN_BEFORE,
  student: { firstName: 'Ism', lastName: 'Familiya' },
  group: {
    id: 'group-1',
    name: '#014',
    companyId: 1001,
    statusEnum: 'CANCELLED',
    statusChangedAt: CLOSED_AT,
    statusChangedById: 30001,
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

describe('closed-group enrollment repair — finding', () => {
  it('reads FROZEN enrollments of cancelled and completed groups that were not deleted, counting charges from the Tashkent close month on', async () => {
    const { found, query } = await findWith([
      dbRow({
        monthlyCharges: [
          { periodYear: 2026, periodMonth: 8 },
          { periodYear: 2026, periodMonth: 9 },
          { periodYear: 2026, periodMonth: 10 },
        ],
      }),
    ]);

    expect(query.where).toEqual({
      deletedAt: null,
      status: 'FROZEN',
      group: {
        deletedAt: null,
        statusEnum: { in: ['CANCELLED', 'COMPLETED'] },
      },
    });
    // A reversed charge was already given back; only a live one is money.
    expect(query.select.monthlyCharges.where).toEqual({ status: 'CHARGED' });
    expect(found).toEqual([
      {
        enrollmentId: 'enr-1',
        studentId: 20001,
        studentName: 'Ism Familiya',
        groupId: 'group-1',
        groupName: '#014',
        groupStatus: 'CANCELLED',
        companyId: 1001,
        groupClosedAt: CLOSED_AT,
        groupClosedById: 30001,
        closeAt: CLOSED_AT,
        prepaidLessonsRemaining: 0,
        // August was over before the group closed; September and October were not.
        openMonthlyCharges: 2,
      },
    ]);
  });

  it('closes a row changed after its group closed no earlier than that change', async () => {
    const { found, query } = await findWith([
      dbRow({
        id: 'enr-late',
        statusChangedAt: CHANGED_AFTER,
        stateLog: [{ transitionAt: CHANGED_AFTER }],
      }),
      // A legacy row whose last log entry is later than its own column.
      dbRow({
        id: 'enr-late-log',
        statusChangedAt: FROZEN_BEFORE,
        stateLog: [{ transitionAt: CHANGED_AFTER }],
      }),
      dbRow({ id: 'enr-bare', statusChangedAt: null, stateLog: [] }),
    ]);

    // The latest log entry is the one compared against.
    expect(query.select.stateLog).toEqual({
      orderBy: { transitionAt: 'desc' },
      take: 1,
      select: { transitionAt: true },
    });
    expect(found.map((r) => [r.enrollmentId, r.closeAt])).toEqual([
      ['enr-late', CHANGED_AFTER],
      ['enr-late-log', CHANGED_AFTER],
      ['enr-bare', CLOSED_AT],
    ]);
  });

  it('gives no close time when the group has no recorded status change', async () => {
    const { found } = await findWith([
      dbRow({
        group: { ...dbRow().group, statusChangedAt: null },
      }),
    ]);

    expect(found[0]).toMatchObject({ groupClosedAt: null, closeAt: null });
  });
});

describe('closed-group enrollment repair — planning', () => {
  it('leaves money and a missing close date to a person, and closes the rest', () => {
    const plain = stranded({ enrollmentId: 'enr-plain' });
    const prepaid = stranded({
      enrollmentId: 'enr-prepaid',
      prepaidLessonsRemaining: 3,
    });
    const charged = stranded({
      enrollmentId: 'enr-charged',
      openMonthlyCharges: 1,
    });
    const undated = stranded({
      enrollmentId: 'enr-undated',
      groupClosedAt: null,
      closeAt: null,
    });

    const { toClose, withMoney, undatedGroup } = splitForRepair([
      plain,
      prepaid,
      charged,
      undated,
    ]);

    expect(toClose.map((r) => r.enrollmentId)).toEqual(['enr-plain']);
    expect(withMoney.map((r) => r.enrollmentId)).toEqual([
      'enr-prepaid',
      'enr-charged',
    ]);
    expect(undatedGroup.map((r) => r.enrollmentId)).toEqual(['enr-undated']);
  });

  it('summarizes in counts only, close months in Tashkent time', () => {
    const completedAt = new Date('2026-08-10T07:00:00.000Z');
    const summary = summarize([
      stranded({ enrollmentId: 'a', studentId: 1, groupId: 'g1' }),
      stranded({
        enrollmentId: 'b',
        studentId: 1,
        groupId: 'g2',
        groupStatus: 'COMPLETED',
        groupClosedAt: completedAt,
        closeAt: completedAt,
      }),
      stranded({
        enrollmentId: 'c',
        studentId: 2,
        groupId: 'g1',
        closeAt: CHANGED_AFTER,
      }),
    ]);

    expect(summary).toEqual({
      enrollments: 3,
      students: 2,
      groups: 2,
      byGroupStatus: { CANCELLED: 2, COMPLETED: 1 },
      byCloseMonth: { '2026-08': 1, '2026-09': 2 },
      closingAfterGroupClosed: 1,
    });
  });
});

describe('closed-group enrollment repair — applying', () => {
  const makeTx = (over: { closed?: number; charges?: object[] } = {}) => ({
    enrollment: {
      updateMany: jest.fn().mockResolvedValue({ count: over.closed ?? 1 }),
    },
    enrollmentMonthlyCharge: {
      findMany: jest.fn().mockResolvedValue(over.charges ?? []),
    },
    enrollmentStateLog: { create: jest.fn().mockResolvedValue({}) },
  });

  it("closes the enrollment as DROPPED at the group's close, logged and in both histories", async () => {
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
        status: 'FROZEN',
        prepaidLessonsRemaining: { lte: 0 },
        group: { deletedAt: null, statusEnum: 'CANCELLED' },
        OR: [
          { statusChangedAt: null },
          { statusChangedAt: { lte: CLOSED_AT } },
        ],
      },
      data: {
        status: 'DROPPED',
        statusChangedAt: CLOSED_AT,
        statusChangedById: 30001,
        // The words the cascade itself stamps on the rows it closes.
        statusChangeReason: 'Cascade: Group #group-1 → CANCELLED',
      },
    });
    expect(tx.enrollmentStateLog.create).toHaveBeenCalledWith({
      data: {
        enrollmentId: 'enr-1',
        status: 'DROPPED',
        transitionAt: CLOSED_AT,
        reason: 'Cascade: Group #group-1 → CANCELLED',
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
        sabab: "Guruh to'xtatildi",
        sana: '2026-08-31T20:00:00.000Z',
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
        sabab: "Guruh to'xtatildi",
        sana: '2026-08-31T20:00:00.000Z',
      },
      changedById: 30001,
      companyId: 1001,
      tx,
    });
  });

  it("gives a completed group's frozen student the completed-group reason", async () => {
    const tx = makeTx();
    const history = { recordDelete: jest.fn() };

    await applyClose(
      txOf(tx) as any,
      history as any,
      stranded({ groupStatus: 'COMPLETED' }),
    );

    const { where, data } = tx.enrollment.updateMany.mock.calls[0][0];
    expect(where.group).toEqual({ deletedAt: null, statusEnum: 'COMPLETED' });
    expect(data).toMatchObject({
      status: 'DROPPED',
      statusChangeReason: 'Cascade: Group #group-1 → COMPLETED',
    });
    for (const [params] of history.recordDelete.mock.calls) {
      expect(params.oldValues.sabab).toBe(
        "Guruh tugallandi, o'quvchi muzlatilgan edi",
      );
    }
  });

  it('closes a row changed after the group closed at that change, keeping the log in order', async () => {
    const tx = makeTx();
    const history = { recordDelete: jest.fn() };

    await applyClose(
      txOf(tx) as any,
      history as any,
      stranded({ closeAt: CHANGED_AFTER }),
    );

    const { where, data } = tx.enrollment.updateMany.mock.calls[0][0];
    expect(data.statusChangedAt).toEqual(CHANGED_AFTER);
    expect(where.OR).toEqual([
      { statusChangedAt: null },
      { statusChangedAt: { lte: CHANGED_AFTER } },
    ]);
    expect(
      tx.enrollmentStateLog.create.mock.calls[0][0].data.transitionAt,
    ).toEqual(CHANGED_AFTER);
    // The history still names the day the group closed.
    for (const [params] of history.recordDelete.mock.calls) {
      expect(params.oldValues.sana).toBe('2026-08-31T20:00:00.000Z');
    }
  });

  it('records no actor when nobody is on record as closing the group', async () => {
    const tx = makeTx();
    const history = { recordDelete: jest.fn() };

    await applyClose(
      txOf(tx) as any,
      history as any,
      stranded({ groupClosedById: null }),
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

  it('skips an enrollment that still carries a charge from the close month on', async () => {
    const tx = makeTx({ charges: [{ periodYear: 2026, periodMonth: 9 }] });
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

  it('closes an enrollment whose only charge is for a month before the close', async () => {
    const tx = makeTx({ charges: [{ periodYear: 2026, periodMonth: 8 }] });
    const history = { recordDelete: jest.fn() };

    const result = await applyClose(
      txOf(tx) as any,
      history as any,
      stranded(),
    );

    expect(result).toBe('applied');
  });

  it('skips, writing nothing, a row whose group has no close date', async () => {
    const tx = makeTx();
    const history = { recordDelete: jest.fn() };

    const result = await applyClose(
      txOf(tx) as any,
      history as any,
      stranded({ groupClosedAt: null, closeAt: null }),
    );

    expect(result).toBe('skipped');
    expect(tx.enrollment.updateMany).not.toHaveBeenCalled();
    expect(history.recordDelete).not.toHaveBeenCalled();
  });
});
