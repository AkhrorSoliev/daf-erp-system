import { ForbiddenException } from '@nestjs/common';
import {
  assertCallerMayManageUser,
  assertCallerMayManageUserRecord,
} from './user-branch-scope';

/**
 * WRITING to an employee's account needs more than a shared branch (ADR-0027).
 *
 * Branch overlap alone let an Administrator set the password, phone or status
 * of their own Branch Director, and of any CEO who has a branch attached (four
 * CEO accounts in production do). A phone number is a credential here:
 * Telegram sign-in finds the account by it, no password asked. So a non-CEO
 * may write only to accounts whose every role lies inside their grant ceiling,
 * the same `GRANTABLE_ROLE_IDS` map that decides which roles they may hand out.
 */
describe('assertCallerMayManageUserRecord', () => {
  const FARGONA = 1;
  const NAMANGAN = 2;
  const CALLER_ID = 500;

  const caller = (roleNames: string[], branchIds: number[] = [FARGONA]) => ({
    mainBranch: branchIds[0] ?? null,
    branches: branchIds.map((branchId) => ({ branchId })),
    roles: roleNames.map((name) => ({ role: { name } })),
  });
  const target = (
    roleIds: number[],
    branchIds: number[] = [FARGONA],
    id = 600,
  ) => ({
    id,
    mainBranch: branchIds[0] ?? null,
    branches: branchIds.map((branchId) => ({ branchId })),
    roles: roleIds.map((roleId) => ({ role: { id: roleId } })),
  });

  // Which rule refused matters: all three answer 403, and a test that only
  // checked the class would pass with the rank rule deleted whenever the
  // branch rule happened to refuse instead.
  const RANK = /sizdan yuqori yoki siz bilan bir darajada/;
  const OWN_STATUS = /O'z holatingizni o'zgartira olmaysiz/;
  const BRANCH = /o'z filialingiz xodimlarini/;

  const refusal = (run: () => void): string => {
    try {
      run();
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenException);
      return (e as Error).message;
    }
    throw new Error('expected a refusal, but the write was allowed');
  };

  // Every row shares Fargona, so the rank rule is the only one left to refuse.
  it.each([
    {
      who: 'an Administrator',
      callerRoles: ['Administrator'],
      targetRoles: [2],
      what: 'their Branch Director',
    },
    {
      who: 'an Administrator',
      callerRoles: ['Administrator'],
      targetRoles: [3],
      what: 'a peer Administrator',
    },
    {
      who: 'an Administrator',
      callerRoles: ['Administrator'],
      targetRoles: [1, 2, 3],
      what: 'a CEO who has a branch attached',
    },
    {
      who: 'a Branch Director',
      callerRoles: ['Branch Director'],
      targetRoles: [2],
      what: 'a peer Branch Director',
    },
    {
      // Every role counts. Checking for SOME role inside the ceiling would let
      // a director reach a peer through the Teacher role they also hold.
      who: 'a Branch Director',
      callerRoles: ['Branch Director'],
      targetRoles: [2, 4],
      what: 'a peer Branch Director who also teaches',
    },
    {
      // Role 6 is outside every ceiling. A rank read off the numeric role id
      // ("a bigger id is a lower rank") would call a student account junior.
      who: 'a Branch Director',
      callerRoles: ['Branch Director'],
      targetRoles: [6],
      what: 'an account holding the Student role',
    },
    {
      who: 'a Teacher',
      callerRoles: ['Teacher'],
      targetRoles: [4],
      what: 'another Teacher',
    },
    {
      // A role-less employee sits below everyone, but a caller who holds no
      // managing role manages nobody: an empty ceiling is nothing (ADR-0002).
      who: 'a Cashier',
      callerRoles: ['Cashier'],
      targetRoles: [],
      what: 'a role-less employee',
    },
  ])('refuses $who writing to $what', ({ callerRoles, targetRoles }) => {
    const message = refusal(() =>
      assertCallerMayManageUserRecord(
        target(targetRoles),
        caller(callerRoles),
        CALLER_ID,
      ),
    );
    expect(message).toMatch(RANK);
  });

  it.each([
    {
      who: 'an Administrator',
      callerRoles: ['Administrator'],
      targetRoles: [4, 5],
      what: 'a Teacher who is also a Cashier',
    },
    {
      who: 'a Branch Director',
      callerRoles: ['Branch Director'],
      targetRoles: [3, 5],
      what: 'an Administrator who is also a Cashier',
    },
    {
      who: 'a Branch Director',
      callerRoles: ['Branch Director'],
      targetRoles: [],
      what: 'a role-less employee on the payroll',
    },
    {
      // The most senior role decides. Reading the Administrator ceiling off
      // this caller would refuse a Branch Director their own Administrator.
      who: 'a Branch Director who is also an Administrator',
      callerRoles: ['Administrator', 'Branch Director'],
      targetRoles: [3],
      what: 'an Administrator',
    },
  ])('lets $who write to $what', ({ callerRoles, targetRoles }) => {
    expect(() =>
      assertCallerMayManageUserRecord(
        target(targetRoles),
        caller(callerRoles),
        CALLER_ID,
      ),
    ).not.toThrow();
  });

  it('lets a CEO write to anyone, branch or not', () => {
    // A CEO is branch-less by design and outside the rank rule entirely.
    expect(() =>
      assertCallerMayManageUserRecord(
        target([1, 2, 3]),
        caller(['CEO'], []),
        CALLER_ID,
      ),
    ).not.toThrow();
  });

  it('still refuses a subordinate in ANOTHER branch, by the branch rule', () => {
    const message = refusal(() =>
      assertCallerMayManageUserRecord(
        target([4], [NAMANGAN]),
        caller(['Branch Director'], [FARGONA]),
        CALLER_ID,
      ),
    );
    expect(message).toMatch(BRANCH);
  });

  it('lets anyone edit their own account', () => {
    // A Branch Director's own roles are outside their ceiling, and fixing a
    // typo in their own name must still work.
    expect(() =>
      assertCallerMayManageUserRecord(
        target([2], [FARGONA], CALLER_ID),
        caller(['Branch Director']),
        CALLER_ID,
      ),
    ).not.toThrow();
  });

  it('refuses a non-CEO changing their OWN status', () => {
    // Someone set INACTIVE by the CEO could otherwise set themselves ACTIVE.
    const message = refusal(() =>
      assertCallerMayManageUserRecord(
        target([2], [FARGONA], CALLER_ID),
        caller(['Branch Director']),
        CALLER_ID,
        { changesStatus: true },
      ),
    );
    expect(message).toMatch(OWN_STATUS);
  });

  it('lets a CEO change their own status', () => {
    expect(() =>
      assertCallerMayManageUserRecord(
        target([1], [], CALLER_ID),
        caller(['CEO'], []),
        CALLER_ID,
        { changesStatus: true },
      ),
    ).not.toThrow();
  });

  it('lets a manager change the status of someone below them', () => {
    expect(() =>
      assertCallerMayManageUserRecord(
        target([4]),
        caller(['Administrator']),
        CALLER_ID,
        { changesStatus: true },
      ),
    ).not.toThrow();
  });
});

describe('assertCallerMayManageUser (loads both sides itself)', () => {
  const FARGONA = 1;
  const DIRECTOR = 10002;
  const PEER_DIRECTOR = 10003;
  const ADMIN = 10004;
  const ARCHIVED_DIRECTOR = 10009;

  type Row = {
    id: number;
    deletedAt: Date | null;
    mainBranch: number | null;
    branches: { branchId: number }[];
    roles: { role: { id: number; name: string } }[];
  };
  const row = (
    id: number,
    role: { id: number; name: string },
    deletedAt: Date | null = null,
  ): Row => ({
    id,
    deletedAt,
    mainBranch: FARGONA,
    branches: [{ branchId: FARGONA }],
    roles: [{ role }],
  });
  const DIRECTOR_ROLE = { id: 2, name: 'Branch Director' };
  const ADMIN_ROLE = { id: 3, name: 'Administrator' };
  const rows = new Map<number, Row>(
    [
      row(DIRECTOR, DIRECTOR_ROLE),
      row(PEER_DIRECTOR, DIRECTOR_ROLE),
      row(ADMIN, ADMIN_ROLE),
      row(ARCHIVED_DIRECTOR, DIRECTOR_ROLE, new Date('2026-09-20T10:00:00Z')),
    ].map((r) => [r.id, r]),
  );

  // Behaves like the database on the two things the rule depends on: an
  // archived row is invisible to a `deletedAt: null` lookup, and a field left
  // out of `select` does not come back.
  const prisma = {
    user: {
      findFirst: jest.fn(({ where, select }: any) => {
        const found = rows.get(where.id);
        if (!found) return Promise.resolve(null);
        if (where.deletedAt === null && found.deletedAt !== null) {
          return Promise.resolve(null);
        }
        if (!select) return Promise.resolve(found);
        return Promise.resolve(
          Object.fromEntries(
            Object.keys(select)
              .filter((key) => select[key])
              .map((key) => [key, found[key as keyof Row]]),
          ),
        );
      }),
    },
  } as any;

  it("reads the target's roles itself and refuses a peer", async () => {
    await expect(
      assertCallerMayManageUser(prisma, DIRECTOR, PEER_DIRECTOR),
    ).rejects.toThrow(/sizdan yuqori yoki siz bilan bir darajada/);
  });

  it('lets a Branch Director write to their Administrator', async () => {
    await expect(
      assertCallerMayManageUser(prisma, DIRECTOR, ADMIN),
    ).resolves.toBeUndefined();
  });

  it('refuses an archived caller whose access token has not expired yet', async () => {
    // Found, this director would be allowed to write to their Administrator.
    await expect(
      assertCallerMayManageUser(prisma, ARCHIVED_DIRECTOR, ADMIN),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses a write whose caller is unknown', async () => {
    await expect(
      assertCallerMayManageUser(prisma, undefined, ADMIN),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('looks the caller up for a status change on their own account', async () => {
    // A self-edit needs no branch or rank check, which tempts an early return
    // before anything is read. The own-status rule needs the caller's roles.
    await expect(
      assertCallerMayManageUser(prisma, DIRECTOR, DIRECTOR, {
        changesStatus: true,
      }),
    ).rejects.toThrow(/O'z holatingizni o'zgartira olmaysiz/);
  });

  it('lets a caller edit their own account otherwise', async () => {
    await expect(
      assertCallerMayManageUser(prisma, DIRECTOR, DIRECTOR),
    ).resolves.toBeUndefined();
  });
});
