import * as bcrypt from 'bcryptjs';
import { StudentsWriteService } from './students-write.service';
import { EntityHistoryService } from '../common/entity-history';

/**
 * A student signs in with the number on their card (ADR-0032).
 *
 * The card (`Student.phone`) and the sign-in account (`User.login` /
 * `User.phone`) are two rows. Password sign-in, Telegram sign-in (no
 * password) and SMS password reset all look the number up on the ACCOUNT,
 * so a card edit that left the account behind kept the old number opening
 * the account and the new one opening nothing — 115 students in production
 * on 2026-09-24, every one after a staff phone edit.
 *
 * The fake below keeps real rows and applies real writes, so every test
 * asserts the state a sign-in lookup would read afterwards, not which mock
 * was called. It also enforces the one database rule this change can trip:
 * `login` is unique among live accounts (partial index `User_login_key`).
 */

const COMPANY = 1;
const CEO_ID = 10001;
const OLD = '901111111';
const NEW = '932222222';

type FakeUser = {
  id: number;
  login: string | null;
  phone: string | null;
  password: string | null;
  deletedAt: Date | null;
  updatedAt: Date;
  mainBranch: number | null;
  branches: { branchId: number }[];
  roles: { roleId: number; role: { name: string } }[];
};

type FakeStudent = Record<string, any> & {
  id: number;
  phone: string;
  userId: number | null;
  deletedAt: Date | null;
};

const ROLE_NAMES: Record<number, string> = {
  1: 'CEO',
  3: 'Administrator',
  6: 'Student',
};

function user(
  id: number,
  keys: { login: string | null; phone: string | null },
  roleIds: number[],
): FakeUser {
  return {
    id,
    ...keys,
    password: bcrypt.hashSync('eski-parol', 4),
    deletedAt: null,
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    mainBranch: null,
    branches: [],
    roles: roleIds.map((roleId) => ({
      roleId,
      role: { name: ROLE_NAMES[roleId] },
    })),
  };
}

function student(id: number, phone: string, userId: number | null) {
  return {
    id,
    firstName: 'Ali',
    lastName: 'Valiyev',
    phone,
    extraPhone: null,
    parentPhone: null,
    parentName: null,
    telegram: null,
    telegramChatId: null,
    gender: null,
    dateOfBirth: null,
    photo: null,
    comment: null,
    balance: 0,
    discountPercent: 0,
    placeOfStudy: null,
    address: null,
    passportSeries: null,
    isActive: true,
    status: 'ACTIVE',
    companyId: COMPANY,
    userId,
    createdAt: new Date('2026-05-01T00:00:00Z'),
    updatedAt: new Date('2026-05-01T00:00:00Z'),
    statusChangedAt: null,
    statusChangedById: null,
    statusChangeReason: null,
    deletedAt: null,
    deletedBy: null,
    branches: [{ branch: { id: 1, name: 'Markaz' } }],
    enrollments: [],
  } as FakeStudent;
}

/** Throws on a filter it does not model, so no query passes by accident. */
function matches(row: Record<string, any>, where: Record<string, any>) {
  return Object.entries(where).every(([key, want]) => {
    if (key === 'roles') {
      const ids: number[] = want.some.roleId.in;
      return row.roles.some((r: { roleId: number }) => ids.includes(r.roleId));
    }
    if (!['id', 'login', 'phone', 'deletedAt', 'companyId'].includes(key)) {
      throw new Error(`fake db: unmodelled filter "${key}"`);
    }
    // Prisma rejects a missing id outright rather than matching nothing.
    if (key === 'id' && want == null) {
      throw new Error('Argument `id` must not be null');
    }
    if (want && typeof want === 'object' && 'not' in want) {
      return row[key] !== want.not;
    }
    return row[key] === want;
  });
}

function buildDb(seed: { users: FakeUser[]; students: FakeStudent[] }) {
  let users = seed.users;
  let students = seed.students;
  const history: any[] = [];
  let clock = Date.parse('2026-09-24T09:00:00Z');
  const state = { failAccountWrites: false };

  const userApi = {
    findFirst: async ({ where }: any) =>
      structuredClone(users.find((u) => matches(u, where)) ?? null),
    update: async ({ where, data }: any) => {
      if (state.failAccountWrites) throw new Error('connection lost');
      const row = users.find((u) => u.id === where.id);
      if (!row) throw new Error(`fake db: no user ${where.id}`);
      if (
        data.login != null &&
        users.some(
          (u) =>
            u.id !== row.id && u.deletedAt === null && u.login === data.login,
        )
      ) {
        throw new Error('Unique constraint failed on the fields: (`login`)');
      }
      Object.assign(row, data, { updatedAt: new Date((clock += 1000)) });
      return structuredClone(row);
    },
  };

  const studentApi = {
    findFirst: async ({ where }: any) =>
      structuredClone(students.find((s) => matches(s, where)) ?? null),
    findUniqueOrThrow: async ({ where }: any) =>
      structuredClone(students.find((s) => s.id === where.id)),
    update: async ({ where, data }: any) => {
      const row = students.find((s) => s.id === where.id);
      if (!row) throw new Error(`fake db: no student ${where.id}`);
      Object.assign(row, data);
      return structuredClone(row);
    },
  };

  const client: any = {
    user: userApi,
    student: studentApi,
    // `assertCallerMayTouchStudent` resolves the student's branch first.
    studentBranch: { findFirst: async () => ({ branchId: 1 }) },
    entityHistory: {
      create: async ({ data }: any) => {
        history.push(data);
        return data;
      },
    },
    // All-or-nothing, like Postgres: a throw inside rolls every write back.
    $transaction: async (fn: (tx: any) => Promise<unknown>) => {
      const before = structuredClone({ users, students });
      try {
        return await fn(client);
      } catch (error) {
        users = before.users;
        students = before.students;
        throw error;
      }
    },
  };

  return {
    prisma: client,
    history,
    state,
    account: (id: number) => users.find((u) => u.id === id)!,
    card: (id: number) => students.find((s) => s.id === id)!,
    /** Live accounts a sign-in with `number` can reach — login or phone. */
    accountsReachedBy: (number: string) =>
      users
        .filter(
          (u) =>
            u.deletedAt === null && (u.login === number || u.phone === number),
        )
        .map((u) => u.id)
        .sort(),
  };
}

function buildService(db: ReturnType<typeof buildDb>) {
  const entityHistory = new EntityHistoryService(db.prisma, {
    emit: jest.fn(),
  } as any);
  return new StudentsWriteService(
    db.prisma,
    { deleteFile: jest.fn() } as any, // UploadService
    {} as any, // StatusHistoryService
    {} as any, // StatusCascadeService
    entityHistory,
    { emit: jest.fn() } as any, // EventEmitter2
    {} as any, // TransactionsService
    {} as any, // StudentLeadOriginService
  );
}

const ceo = () => user(CEO_ID, { login: 'boss', phone: '909999999' }, [1]);

describe('StudentsWriteService.update — the sign-in number follows the card (ADR-0032)', () => {
  it('moves the account to the new number, so the old number opens nothing', async () => {
    const db = buildDb({
      users: [ceo(), user(20001, { login: OLD, phone: OLD }, [6])],
      students: [student(30001, OLD, 20001)],
    });

    await buildService(db).update(30001, { phone: NEW }, CEO_ID, COMPANY);

    expect(db.card(30001).phone).toBe(NEW);
    expect(db.account(20001)).toMatchObject({ login: NEW, phone: NEW });
    expect(db.accountsReachedBy(OLD)).toEqual([]);
    expect(db.accountsReachedBy(NEW)).toEqual([20001]);
  });

  it('brings a drifted account back to the card on the next save, even when the phone field did not change', async () => {
    // Production shape: the card was edited before this fix, the account kept
    // the old number. The edit form always resends the phone.
    const db = buildDb({
      users: [ceo(), user(20001, { login: OLD, phone: OLD }, [6])],
      students: [student(30001, NEW, 20001)],
    });

    await buildService(db).update(
      30001,
      { firstName: 'Alisher', phone: NEW },
      CEO_ID,
      COMPANY,
    );

    expect(db.account(20001)).toMatchObject({ login: NEW, phone: NEW });
    expect(db.accountsReachedBy(OLD)).toEqual([]);
  });

  it("leaves the login empty when the new number is already another live account's login (ADR-0022)", async () => {
    // An archived card's account still holding the number — in production the
    // only kind of student account that can collide.
    const db = buildDb({
      users: [
        ceo(),
        user(20001, { login: OLD, phone: OLD }, [6]),
        user(20002, { login: NEW, phone: NEW }, [6]),
      ],
      students: [student(30001, OLD, 20001)],
    });

    await buildService(db).update(30001, { phone: NEW }, CEO_ID, COMPANY);

    expect(db.account(20001)).toMatchObject({ login: null, phone: NEW });
    expect(db.account(20002)).toMatchObject({ login: NEW, phone: NEW });
    expect(db.accountsReachedBy(OLD)).toEqual([]);
  });

  it("does not refuse a number the same person's staff account holds (ADR-0022)", async () => {
    // One person, one account per role: the student account and an
    // administrator account may share a phone. The staff-only rule of
    // `planPhoneChange` must not fire for a student.
    const db = buildDb({
      users: [
        ceo(),
        user(20001, { login: OLD, phone: OLD }, [6]),
        user(20003, { login: NEW, phone: NEW }, [3]),
      ],
      students: [student(30001, OLD, 20001)],
    });

    await buildService(db).update(30001, { phone: NEW }, CEO_ID, COMPANY);

    expect(db.card(30001).phone).toBe(NEW);
    expect(db.account(20001)).toMatchObject({ login: null, phone: NEW });
  });

  it('does not touch an account that already matches the card', async () => {
    // Touching it would bump `updatedAt`, and "most recently updated" is what
    // password sign-in and SMS reset use to pick between accounts on a phone.
    const db = buildDb({
      users: [ceo(), user(20001, { login: OLD, phone: OLD }, [6])],
      students: [student(30001, OLD, 20001)],
    });
    const before = db.account(20001).updatedAt.getTime();

    await buildService(db).update(
      30001,
      { firstName: 'Alisher', phone: OLD },
      CEO_ID,
      COMPANY,
    );

    expect(db.account(20001).updatedAt.getTime()).toBe(before);
  });

  it('saves the card of a student who has no sign-in account', async () => {
    const db = buildDb({
      users: [ceo()],
      students: [student(30001, OLD, null)],
    });

    await buildService(db).update(30001, { phone: NEW }, CEO_ID, COMPANY);

    expect(db.card(30001).phone).toBe(NEW);
  });

  it('keeps the old number on the card when the account write fails — one transaction', async () => {
    const db = buildDb({
      users: [ceo(), user(20001, { login: OLD, phone: OLD }, [6])],
      students: [student(30001, OLD, 20001)],
    });
    db.state.failAccountWrites = true;

    await expect(
      buildService(db).update(30001, { phone: NEW }, CEO_ID, COMPANY),
    ).rejects.toThrow('connection lost');

    expect(db.card(30001).phone).toBe(OLD);
    expect(db.account(20001)).toMatchObject({ login: OLD, phone: OLD });
  });

  it('writes a new password and the new number together', async () => {
    const db = buildDb({
      users: [ceo(), user(20001, { login: OLD, phone: OLD }, [6])],
      students: [student(30001, OLD, 20001)],
    });

    await buildService(db).update(
      30001,
      { phone: NEW, password: 'yangi-parol' },
      CEO_ID,
      COMPANY,
    );

    const account = db.account(20001);
    expect(account).toMatchObject({ login: NEW, phone: NEW });
    expect(await bcrypt.compare('yangi-parol', account.password!)).toBe(true);
  });

  it("records the sign-in number change in the student's history", async () => {
    const db = buildDb({
      users: [ceo(), user(20001, { login: OLD, phone: OLD }, [6])],
      students: [student(30001, OLD, 20001)],
    });

    await buildService(db).update(30001, { phone: NEW }, CEO_ID, COMPANY);

    expect(db.history).toEqual([
      expect.objectContaining({
        entityType: 'Student',
        entityId: '30001',
        oldValues: { phone: OLD, login: OLD },
        newValues: { phone: NEW, login: NEW },
        changedById: CEO_ID,
      }),
    ]);
  });
});
