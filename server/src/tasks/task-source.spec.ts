import { loadTaskSource } from './task-source';

const LAST = {
  id: 'c9',
  createdAt: new Date('2026-10-09T06:30:00.000Z'),
  outcome: 'NO_ANSWER',
  note: null,
  reason: 'DEBT',
  calledBy: { firstName: 'Dilnoza', lastName: 'Karimova' },
};
const STUDENT = {
  id: 10001,
  firstName: 'Aziz',
  lastName: 'Rahimov',
  phone: '901234567',
  balance: -450_000,
};

function db() {
  return {
    paymentPromise: { findFirst: jest.fn() },
    student: { findFirst: jest.fn().mockResolvedValue(STUDENT) },
    callLog: {
      findFirst: jest.fn<Promise<any>, [any]>(async ({ where }: any) =>
        where.id
          ? { ...LAST, id: 'c1', note: 'Ertaga qayta', studentId: 10001 }
          : LAST,
      ),
    },
    lead: { findFirst: jest.fn() },
  };
}
const lastCall = {
  at: LAST.createdAt,
  outcome: 'NO_ANSWER',
  note: null,
  by: 'Karimova Dilnoza',
};
const student = {
  id: 10001,
  name: 'Rahimov Aziz',
  phone: '901234567',
  debt: 450_000,
  lastCall,
};

describe('loadTaskSource', () => {
  it('a broken promise: the student, their debt, the promise, the last call', async () => {
    const d = db();
    d.paymentPromise.findFirst.mockResolvedValue({
      promiseDate: new Date('2026-10-09T18:59:59.999Z'),
      promisedAmount: 200_000,
      comment: 'Oylik kelganda',
      studentId: 10001,
    });
    expect(
      await loadTaskSource(d as any, {
        kind: 'BROKEN_PROMISE',
        sourceKey: 'promise:p1',
        companyId: 1,
      }),
    ).toEqual({
      student,
      promise: {
        date: new Date('2026-10-09T18:59:59.999Z'),
        amount: 200_000,
        comment: 'Oylik kelganda',
      },
      callReason: 'DEBT',
    });
    expect(d.paymentPromise.findFirst.mock.calls[0][0].where).toEqual({
      id: 'p1',
      companyId: 1,
    });
  });

  it('a callback: the student and the call that asked for it, with its reason', async () => {
    const d = db();
    expect(
      await loadTaskSource(d as any, {
        kind: 'CALLBACK',
        sourceKey: 'calllog:c1',
        companyId: 1,
      }),
    ).toEqual({
      student,
      previousCall: {
        at: LAST.createdAt,
        outcome: 'NO_ANSWER',
        note: 'Ertaga qayta',
        by: 'Karimova Dilnoza',
      },
      callReason: 'DEBT',
    });
  });

  it("a callback whose call is also the student's last: lastCall stays null, so the card does not print it twice", async () => {
    const d = db();
    d.callLog.findFirst.mockImplementation(async ({ where }: any) =>
      where.id
        ? { ...LAST, id: 'c1', note: 'Ertaga qayta', studentId: 10001 }
        : { ...LAST, id: 'c1', note: 'Ertaga qayta' },
    );
    const s = await loadTaskSource(d as any, {
      kind: 'CALLBACK',
      sourceKey: 'calllog:c1',
      companyId: 1,
    });
    expect(s?.student?.lastCall).toBeNull();
    expect(s?.previousCall?.note).toBe('Ertaga qayta');
  });

  it('an uncalled lead: name, phone, source, when it came', async () => {
    const d = db();
    d.lead.findFirst.mockResolvedValue({
      id: 'l1',
      firstName: 'Dilnoza',
      lastName: 'Karimova',
      phone: '931112233',
      createdAt: new Date('2026-10-08T05:15:00.000Z'),
      source: { name: 'Instagram' },
    });
    expect(
      await loadTaskSource(d as any, {
        kind: 'UNCALLED_LEAD',
        sourceKey: 'lead:l1',
        companyId: 1,
      }),
    ).toEqual({
      lead: {
        id: 'l1',
        name: 'Karimova Dilnoza',
        phone: '931112233',
        source: 'Instagram',
        createdAt: new Date('2026-10-08T05:15:00.000Z'),
      },
    });
  });

  it('a cleared debt reads 0', async () => {
    const d = db();
    d.student.findFirst.mockResolvedValue({ ...STUDENT, balance: 15_000 });
    const s = await loadTaskSource(d as any, {
      kind: 'CALLBACK',
      sourceKey: 'calllog:c1',
      companyId: 1,
    });
    expect(s?.student?.debt).toBe(0);
  });

  it("a manual task, «Dars bo'ldimi?», a join request or a source that is gone: null", async () => {
    const d = db();
    expect(
      await loadTaskSource(d as any, {
        kind: 'MANUAL',
        sourceKey: null,
        companyId: 1,
      }),
    ).toBeNull();
    expect(
      await loadTaskSource(d as any, {
        kind: 'LESSON_QUESTION',
        sourceKey: 'unmarked:g1:2026-10-09',
        companyId: 1,
      }),
    ).toBeNull();
    expect(
      await loadTaskSource(d as any, {
        kind: 'JOIN_REQUEST',
        sourceKey: 'join:r1',
        companyId: 1,
      }),
    ).toBeNull();
    expect(d.student.findFirst).not.toHaveBeenCalled();
    d.lead.findFirst.mockResolvedValue(null);
    expect(
      await loadTaskSource(d as any, {
        kind: 'UNCALLED_LEAD',
        sourceKey: 'lead:l9',
        companyId: 1,
      }),
    ).toBeNull();
  });
});
