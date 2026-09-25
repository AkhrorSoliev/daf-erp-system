import { EntityHistoryService } from '../../src/common/entity-history';
import {
  applyRepair,
  chainedPlans,
  findDriftedStudents,
  planRepairs,
} from './student-sign-in-repair';

/**
 * The one-off repair behind ADR-0032: every live card's sign-in account is
 * brought to the card's number, with the same rule `StudentsWriteService`
 * applies on every save (`planPhoneChange`, `staff: false`).
 *
 * The fake keeps real rows and applies real writes, and enforces the partial
 * unique index on live logins that a wrong plan would trip in production.
 */

type Row = Record<string, any>;

/** Throws on a filter it does not model, so no query passes by accident. */
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, want]) => {
    if (key === 'roles') {
      const ids: number[] = want.some.roleId.in;
      return (row.roles ?? []).some((r: Row) => ids.includes(r.roleId));
    }
    if (!['id', 'login', 'phone', 'deletedAt'].includes(key)) {
      throw new Error(`fake db: unmodelled filter "${key}"`);
    }
    if (want && typeof want === 'object' && 'not' in want) {
      return row[key] !== want.not;
    }
    return row[key] === want;
  });
}

function buildDb(seed: { users: Row[]; students: Row[] }) {
  const users: Row[] = seed.users.map((u) => ({ deletedAt: null, ...u }));
  const students: Row[] = seed.students.map((s) => ({
    deletedAt: null,
    companyId: 1,
    ...s,
  }));
  const history: Row[] = [];

  const pick = (row: Row | undefined, select?: Row) => {
    if (!row) return null;
    if (!select) return structuredClone(row);
    const out: Row = {};
    for (const key of Object.keys(select)) out[key] = row[key];
    return structuredClone(out);
  };

  const client: any = {
    student: {
      findMany: async ({ where }: any) => {
        expect(where).toEqual({ deletedAt: null, userId: { not: null } });
        return students
          .filter((s) => s.deletedAt === null && s.userId !== null)
          .sort((a, b) => a.id - b.id)
          .map((s) => ({
            id: s.id,
            phone: s.phone,
            companyId: s.companyId,
            user: pick(
              users.find((u) => u.id === s.userId),
              { id: true, phone: true, login: true, deletedAt: true },
            ),
          }));
      },
      findFirst: async ({ where, select }: any) =>
        pick(
          students.find(
            (s) => s.id === where.id && s.deletedAt === where.deletedAt,
          ),
          select,
        ),
    },
    user: {
      findFirst: async ({ where, select }: any) =>
        pick(
          users.find((u) => matches(u, where)),
          select,
        ),
      update: async ({ where, data }: any) => {
        const row = users.find((u) => u.id === where.id)!;
        if (
          data.login != null &&
          users.some(
            (u) =>
              u.id !== row.id && u.deletedAt === null && u.login === data.login,
          )
        ) {
          throw new Error('Unique constraint failed on the fields: (`login`)');
        }
        Object.assign(row, data);
        return structuredClone(row);
      },
    },
    entityHistory: {
      create: async ({ data }: any) => {
        history.push(data);
        return data;
      },
    },
    $transaction: async (fn: (tx: any) => Promise<unknown>) => fn(client),
  };

  return {
    prisma: client,
    history,
    account: (id: number) => users.find((u) => u.id === id)!,
    card: (id: number) => students.find((s) => s.id === id)!,
    entityHistory: new EntityHistoryService(client, { emit: jest.fn() } as any),
  };
}

const OLD = '901111111';
const CARD = '932222222';

describe('findDriftedStudents', () => {
  it('returns only live cards whose live account answers to a different number', async () => {
    const db = buildDb({
      users: [
        { id: 1, login: OLD, phone: OLD }, // drifted
        { id: 2, login: '933333333', phone: '933333333' }, // in line
        { id: 3, login: '944444444', phone: '944444444' }, // archived card
        {
          id: 4,
          login: '955555555',
          phone: '955555555',
          deletedAt: new Date(),
        },
      ],
      students: [
        { id: 101, phone: CARD, userId: 1 },
        { id: 102, phone: '933333333', userId: 2 },
        { id: 103, phone: '900000003', userId: 3, deletedAt: new Date() },
        { id: 104, phone: '900000004', userId: 4 }, // account archived
        { id: 105, phone: '900000005', userId: null }, // no account
      ],
    });

    expect(await findDriftedStudents(db.prisma)).toEqual([
      {
        studentId: 101,
        companyId: 1,
        card: CARD,
        account: { id: 1, phone: OLD, login: OLD },
      },
    ]);
  });
});

describe('planRepairs + applyRepair', () => {
  it('moves the login and phone to the card and records it on the card, as the system', async () => {
    const db = buildDb({
      users: [{ id: 1, login: OLD, phone: OLD }],
      students: [{ id: 101, phone: CARD, userId: 1 }],
    });
    const [plan] = await planRepairs(
      db.prisma,
      await findDriftedStudents(db.prisma),
    );

    expect(await applyRepair(db.prisma, db.entityHistory, plan)).toBe(
      'applied',
    );

    expect(db.account(1)).toMatchObject({ login: CARD, phone: CARD });
    expect(db.history).toEqual([
      expect.objectContaining({
        entityType: 'Student',
        entityId: '101',
        oldValues: { login: OLD },
        newValues: { login: CARD },
        changedById: undefined,
        companyId: 1,
      }),
    ]);
    expect(await findDriftedStudents(db.prisma)).toEqual([]);
  });

  it("clears the login when the card's number is another live account's login, and names that holder", async () => {
    const db = buildDb({
      users: [
        { id: 1, login: OLD, phone: OLD },
        { id: 9, login: CARD, phone: CARD }, // e.g. an archived card's account
      ],
      students: [{ id: 101, phone: CARD, userId: 1 }],
    });
    const [plan] = await planRepairs(
      db.prisma,
      await findDriftedStudents(db.prisma),
    );

    expect(plan).toMatchObject({
      write: { phone: CARD, login: null },
      loginHolderId: 9,
    });
    expect(chainedPlans([plan])).toEqual([]); // the holder is not moving
    expect(await applyRepair(db.prisma, db.entityHistory, plan)).toBe(
      'applied',
    );
    expect(db.account(1)).toMatchObject({ login: null, phone: CARD });
    expect(db.account(9)).toMatchObject({ login: CARD, phone: CARD });
  });

  it("is not stopped by the same person's staff account on the card's number (ADR-0022)", async () => {
    const db = buildDb({
      users: [
        { id: 1, login: OLD, phone: OLD, roles: [{ roleId: 6 }] },
        { id: 5, login: CARD, phone: CARD, roles: [{ roleId: 3 }] },
      ],
      students: [{ id: 101, phone: CARD, userId: 1 }],
    });
    const [plan] = await planRepairs(
      db.prisma,
      await findDriftedStudents(db.prisma),
    );

    expect(await applyRepair(db.prisma, db.entityHistory, plan)).toBe(
      'applied',
    );
    expect(db.account(1)).toMatchObject({ login: null, phone: CARD });
  });

  it('skips a row whose card or account changed after the plan was made', async () => {
    const db = buildDb({
      users: [{ id: 1, login: OLD, phone: OLD }],
      students: [{ id: 101, phone: CARD, userId: 1 }],
    });
    const [plan] = await planRepairs(
      db.prisma,
      await findDriftedStudents(db.prisma),
    );
    db.card(101).phone = '977777777'; // staff edited the card in between

    expect(await applyRepair(db.prisma, db.entityHistory, plan)).toBe(
      'skipped',
    );
    expect(db.account(1)).toMatchObject({ login: OLD, phone: OLD });
    expect(db.history).toEqual([]);
  });
});

describe('chainedPlans', () => {
  it('flags a login that is held by another account this same repair moves', async () => {
    // A's card carries B's old number: A's login is cleared only because B has
    // not moved yet — the result would depend on the order of the loop.
    const db = buildDb({
      users: [
        { id: 1, login: OLD, phone: OLD }, // A's account
        { id: 2, login: CARD, phone: CARD }, // B's account, still on B's old number
      ],
      students: [
        { id: 101, phone: CARD, userId: 1 }, // A
        { id: 102, phone: '966666666', userId: 2 }, // B
      ],
    });
    const plans = await planRepairs(
      db.prisma,
      await findDriftedStudents(db.prisma),
    );

    expect(chainedPlans(plans).map((p) => p.studentId)).toEqual([101]);
  });
});
