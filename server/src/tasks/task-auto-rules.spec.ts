import {
  AUTO_RULES,
  autoTaskAssigneeIds,
  brokenPromiseText,
  callbackAssigneeIds,
  callbackText,
  kindsClosedBy,
  paymentClosesBrokenPromise,
  sourceKeyOf,
  studentName,
  systemDueAt,
  telegramNotBefore,
  uncalledLeadText,
  uncalledLeadWindowOpen,
} from './task-auto-rules';

const NONE = new Set<string>();
const at = (iso: string) => new Date(iso);
// 2026-10-09 is a Friday, 10-10 Saturday, 10-11 Sunday, 10-12 Monday.

describe('systemDueAt — 18:00 Tashkent, never past, never on a closed day', () => {
  it('a working day before 18:00 → that day 18:00', () => {
    expect(
      systemDueAt('2026-10-12', NONE, at('2026-10-12T04:00:00Z')).toISOString(),
    ).toBe('2026-10-12T13:00:00.000Z');
  });
  it('18:00 itself → the next working day (Saturday → Monday)', () => {
    expect(
      systemDueAt('2026-10-10', NONE, at('2026-10-10T13:00:00Z')).toISOString(),
    ).toBe('2026-10-12T13:00:00.000Z');
  });
  it('a Sunday moves to Monday', () => {
    expect(
      systemDueAt('2026-10-11', NONE, at('2026-10-09T06:00:00Z')).toISOString(),
    ).toBe('2026-10-12T13:00:00.000Z');
  });
  it('a branch holiday is skipped', () => {
    expect(
      systemDueAt(
        '2026-10-12',
        new Set(['2026-10-12']),
        at('2026-10-09T06:00:00Z'),
      ).toISOString(),
    ).toBe('2026-10-13T13:00:00.000Z');
  });
  it('a day already behind us starts from today: never born overdue', () => {
    // Follow-up two days back (Mon 10-12), logged on Wed 10-14 morning.
    expect(
      systemDueAt('2026-10-12', NONE, at('2026-10-14T04:00:00Z')).toISOString(),
    ).toBe('2026-10-14T13:00:00.000Z');
    // Same, but the evening run is already past 18:00 → next working day.
    expect(
      systemDueAt('2026-10-12', NONE, at('2026-10-14T14:00:00Z')).toISOString(),
    ).toBe('2026-10-15T13:00:00.000Z');
  });
});

describe('uncalledLeadWindowOpen — 08:00–18:00 Monday–Saturday, Tashkent', () => {
  it.each([
    ['2026-10-12T02:59:00Z', false], // Mon 07:59
    ['2026-10-12T03:00:00Z', true], // Mon 08:00
    ['2026-10-12T13:00:00Z', true], // Mon 18:00
    ['2026-10-12T14:00:00Z', false], // Mon 19:00
    ['2026-10-10T13:00:00Z', true], // Sat 18:00
    ['2026-10-11T05:00:00Z', false], // Sun 10:00
  ])('%s → %s', (iso, open) => {
    expect(uncalledLeadWindowOpen(at(iso))).toBe(open);
  });
});

describe('telegramNotBefore', () => {
  it("a callback's Telegram notice waits for 08:00 of its due day", () => {
    expect(
      telegramNotBefore('CALLBACK', at('2026-10-14T13:00:00Z'))?.toISOString(),
    ).toBe('2026-10-14T03:00:00.000Z');
  });
  it('every other task goes when it is ready', () => {
    expect(
      telegramNotBefore('BROKEN_PROMISE', at('2026-10-14T13:00:00Z')),
    ).toBeNull();
    expect(
      telegramNotBefore('JOIN_REQUEST', at('2026-10-14T13:00:00Z')),
    ).toBeNull();
    expect(telegramNotBefore('MANUAL', null)).toBeNull();
  });
});

describe('sources and closing events', () => {
  it('one key per source', () => {
    expect(sourceKeyOf('BROKEN_PROMISE', 'p1')).toBe('promise:p1');
    expect(sourceKeyOf('CALLBACK', 'c1')).toBe('calllog:c1');
    expect(sourceKeyOf('UNCALLED_LEAD', 'l1')).toBe('lead:l1');
  });
  it('spec §7: who closes what', () => {
    expect(kindsClosedBy('payment.received')).toEqual([
      'BROKEN_PROMISE',
      'CALLBACK',
    ]);
    expect(kindsClosedBy('call-log.created')).toEqual([
      'BROKEN_PROMISE',
      'CALLBACK',
    ]);
    expect(kindsClosedBy('lead.called')).toEqual(['UNCALLED_LEAD']);
    expect(kindsClosedBy('entity.status.changed')).toEqual(['UNCALLED_LEAD']);
    expect(kindsClosedBy('task.assigned')).toEqual([]);
  });
  it('a student task links to the student, a lead task to the lead', () => {
    expect(AUTO_RULES.BROKEN_PROMISE.entityType).toBe('Student');
    expect(AUTO_RULES.CALLBACK.entityType).toBe('Student');
    expect(AUTO_RULES.UNCALLED_LEAD.entityType).toBe('Lead');
  });
  it('a partial payment keeps a broken promise open; clearing the debt closes it', () => {
    expect(paymentClosesBrokenPromise(-450_000)).toBe(false);
    expect(paymentClosesBrokenPromise(-1_000)).toBe(false);
    expect(paymentClosesBrokenPromise(-999)).toBe(true);
    expect(paymentClosesBrokenPromise(0)).toBe(true);
    expect(paymentClosesBrokenPromise(25_000)).toBe(true);
  });
});

describe('texts', () => {
  it('names a student surname first', () => {
    expect(studentName({ firstName: 'Aziz', lastName: 'Rahimov' })).toBe(
      'Rahimov Aziz',
    );
  });
  it('a broken promise: debt in the title, the promise in the description', () => {
    expect(
      brokenPromiseText({
        name: 'Rahimov Aziz',
        debt: 450_000,
        promiseDate: at('2026-10-09T18:59:59.999Z'),
        promisedAmount: 200_000,
        comment: 'Oylik kelganda',
      }),
    ).toEqual({
      title: "Va'da buzildi: Rahimov Aziz — qarz 450 000 so'm",
      description:
        "Va'da sanasi: 09.10.2026\nVa'da summasi: 200 000 so'm\nIzoh: Oylik kelganda",
    });
    expect(
      brokenPromiseText({
        name: 'Rahimov Aziz',
        debt: 1_000,
        promiseDate: at('2026-10-09T18:59:59.999Z'),
        promisedAmount: null,
        comment: null,
      }).description,
    ).toBe("Va'da sanasi: 09.10.2026");
  });
  it('a callback carries the note of the call that asked for it', () => {
    expect(
      callbackText({ name: 'Rahimov Aziz', note: ' Ertaga qayta ' }),
    ).toEqual({
      title: "Qayta qo'ng'iroq: Rahimov Aziz",
      description: "Oldingi qo'ng'iroq izohi: Ertaga qayta",
    });
    expect(
      callbackText({ name: 'Rahimov Aziz', note: null }).description,
    ).toBeNull();
  });
  it('an uncalled lead', () => {
    expect(uncalledLeadText({ name: 'Karimova Dilnoza' })).toEqual({
      title: "Lidga qo'ng'iroq qilinmagan: Karimova Dilnoza",
      description: null,
    });
  });
});

describe('who', () => {
  it("a branch's task: the lesson-question ladder of that branch", async () => {
    const db = {
      user: {
        findMany: jest.fn().mockResolvedValueOnce([{ id: 3 }, { id: 4 }]),
      },
    };
    expect(await autoTaskAssigneeIds(db as any, 7, 2)).toEqual([3, 4]);
    expect(db.user.findMany.mock.calls[0][0].where.branches).toEqual({
      some: { branchId: 2 },
    });
  });
  it('no branch: the company administrators, then directors, then CEOs', async () => {
    const db = {
      user: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ id: 1 }]),
      },
    };
    expect(await autoTaskAssigneeIds(db as any, 7, null)).toEqual([1]);
    const wheres = db.user.findMany.mock.calls.map(([a]) => a.where);
    expect(wheres.map((w) => w.roles.some.role.name)).toEqual([
      'Administrator',
      'Branch Director',
      'CEO',
    ]);
    for (const w of wheres) {
      expect(w).toMatchObject({
        companyId: 7,
        deletedAt: null,
        isActive: true,
        status: 'ACTIVE',
      });
      expect(w.branches).toBeUndefined();
    }
  });
  it('a callback goes to the caller while they are an active employee', async () => {
    const db = {
      user: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ id: 9 })
          .mockResolvedValueOnce(null),
      },
    };
    expect(await callbackAssigneeIds(db as any, 7, 9)).toEqual([9]);
    expect(await callbackAssigneeIds(db as any, 7, 9)).toEqual([]);
    expect(db.user.findFirst.mock.calls[0][0].where).toMatchObject({
      id: 9,
      companyId: 7,
      deletedAt: null,
      isActive: true,
      status: 'ACTIVE',
    });
  });
});
