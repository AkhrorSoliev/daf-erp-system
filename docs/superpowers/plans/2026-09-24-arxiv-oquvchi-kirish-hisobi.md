# Student sign-in account closes with the archived card — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Archiving a student card closes its sign-in account in the same transaction, restoring the card reopens it, and a one-off repair brings production in line (close 33 stale accounts, fill 2 empty logins, open 6 missing accounts).

**Architecture:** One definition of a "student-only account" and of opening an account lives in `common/auth/student-account.ts`. `StudentsWriteService.delete` archives card + account together with the same fields an employee archive writes (`userArchiveData`, copied verbatim from PR #516). `ArchiveRestoreService.restore` refuses a student card whose phone is on another live card, then reopens the account with the login re-derived from the card phone. The archive "Ustozlar / Xodimlar" tab stops listing student-only accounts, and `AuthService` refuses a student-only account that has no live card. A dry-run-first script repairs the existing rows.

**Tech Stack:** NestJS 11, Prisma 7 (PostgreSQL, `User_login_key` partial unique on live rows), Jest (`server/`, roots `src` + `scripts`), Next.js client (`client/`, vitest, eslint, tsc).

**Spec:** `docs/superpowers/specs/2026-09-24-arxiv-oquvchi-kirish-hisobi-design.md`

## Global Constraints

- Only a card ARCHIVE closes the account. EXPELLED, FROZEN, GRADUATED never touch it (CEO, 2026-09-24).
- Only a student-only account (roles exactly {Student=6}) is ever closed or hidden. An account holding any staff role is left alone.
- The account is archived with `userArchiveData(deletedById)` from `server/src/common/status/user-archive.ts`, a verbatim copy of PR #516's file. Do not edit that file.
- Import `user-archive.ts` by path, never through the `common/status` barrel (import cycle, see its header comment).
- Card-history field for the account: `kirishHisobi` with values `'Ochiq'`, `'Yopildi'`, `"Yo'q"`.
- Sign-in refusal message: `Hisobingiz yopilgan. Administrator bilan bog'laning.`
- Restore refusal message: ``Bu kartaning telefon raqami hozir boshqa o'quvchida (#${id}). Bitta raqamda ikkita o'quvchi bo'la olmaydi — avval o'sha kartadagi raqamni o'zgartiring.``
- New code comments, commit messages and the PR are in English; the ADR is in Uzbek.
- The GitHub repo is PUBLIC: no production ids, phone numbers or exploit steps in code, comments, docs, commits or the PR.
- Every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Verification commands (from `server/`): `npm test -- <path>`, `npm test`, `npm run typecheck`, `npx eslint <files>`, `npm run build`. From `client/`: `npx tsc --noEmit`, `npx eslint <files>`.

---

### Task 1: Shared building blocks

**Files:**
- Create: `server/src/common/status/user-archive.ts` (verbatim from `origin/claude/brave-bardeen-54884b`)
- Create: `server/src/common/auth/student-account.ts`
- Create: `server/src/common/auth/student-account.spec.ts`
- Modify: `server/src/common/auth/phone-account-rules.ts` (`loginForPhone` parameter type only)
- Modify: `server/src/students/students-write.service.ts` (`createStudentUser` delegates)

**Interfaces:**
- Produces:
  - `userArchiveData(deletedById: number)` → `{ status, isActive, deletedAt, deletedById, statusChangedAt, statusChangedById, statusChangeReason }`
  - `STUDENT_ONLY_ACCOUNT: Prisma.UserWhereInput` (`{ AND: [roles some 6, roles every 6] }`)
  - `isStudentOnlyAccount(roleIds: readonly number[]): boolean`
  - `type SignInAccountState = 'Ochiq' | 'Yopildi' | "Yo'q"`
  - `signInAccountChange(from, to)` → `{ oldValues: { kirishHisobi }, newValues: { kirishHisobi } }`
  - `openStudentAccount(db: PrismaService | Prisma.TransactionClient, card: { id; phone; firstName; lastName; companyId }): Promise<{ userId: number; login: string | null; plainPassword: string }>`
  - `loginForPhone(prisma: Pick<PrismaService, 'user'>, phone)` — same behaviour, now also accepts a transaction client.

- [ ] **Step 1: Copy PR #516's helper verbatim**

```bash
cd server && git show origin/claude/brave-bardeen-54884b:server/src/common/status/user-archive.ts > src/common/status/user-archive.ts
```

- [ ] **Step 2: Write the failing test** — `server/src/common/auth/student-account.spec.ts`

```ts
import { UserStatus } from '@prisma/client';
import {
  STUDENT_ONLY_ACCOUNT,
  isStudentOnlyAccount,
  openStudentAccount,
  signInAccountChange,
} from './student-account';
import { userArchiveData } from '../status/user-archive';

describe('student-only account (ADR-0033)', () => {
  it('matches accounts whose only role is Student', () => {
    expect(STUDENT_ONLY_ACCOUNT).toEqual({
      AND: [
        { roles: { some: { roleId: 6 } } },
        { roles: { every: { roleId: 6 } } },
      ],
    });
  });

  it.each([
    [[6], true],
    [[3, 6], false],
    [[4], false],
    [[], false],
  ])('isStudentOnlyAccount(%j) is %s', (roleIds, expected) => {
    expect(isStudentOnlyAccount(roleIds)).toBe(expected);
  });

  it('describes the account change as a card-history pair', () => {
    expect(signInAccountChange('Ochiq', 'Yopildi')).toEqual({
      oldValues: { kirishHisobi: 'Ochiq' },
      newValues: { kirishHisobi: 'Yopildi' },
    });
  });

  it('archives a user with the fields server/CLAUDE.md requires', () => {
    const data = userArchiveData(7);
    expect(data).toMatchObject({
      status: UserStatus.ARCHIVED,
      isActive: false,
      deletedById: 7,
      statusChangedById: 7,
    });
    expect(data.deletedAt).toBe(data.statusChangedAt);
  });
});

describe('openStudentAccount', () => {
  const card = {
    id: 20001,
    phone: '901112233',
    firstName: 'Ali',
    lastName: 'Valiyev',
    companyId: 1001,
  };
  let db: any;

  beforeEach(() => {
    db = {
      user: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 30001 }),
      },
      student: { update: jest.fn().mockResolvedValue({}) },
    };
  });

  it('opens a Student account on the card phone and links it', async () => {
    const result = await openStudentAccount(db, card);

    const data = db.user.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      login: '901112233',
      phone: '901112233',
      firstName: 'Ali',
      lastName: 'Valiyev',
      companyId: 1001,
      roles: { create: [{ roleId: 6 }] },
    });
    expect(data.password).toMatch(/^\$2[aby]\$10\$/);
    expect(db.student.update).toHaveBeenCalledWith({
      where: { id: 20001 },
      data: { userId: 30001 },
    });
    expect(result).toMatchObject({ userId: 30001, login: '901112233' });
    expect(result.plainPassword).toHaveLength(8);
  });

  it('leaves the login empty when the number is already a live login', async () => {
    db.user.findFirst.mockResolvedValue({ id: 30999 });

    const result = await openStudentAccount(db, card);

    expect(db.user.create.mock.calls[0][0].data.login).toBeNull();
    expect(db.user.create.mock.calls[0][0].data.phone).toBe('901112233');
    expect(result.login).toBeNull();
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `cd server && npm test -- src/common/auth/student-account.spec.ts`
Expected: FAIL — `Cannot find module './student-account'`.

- [ ] **Step 4: Widen `loginForPhone` to accept a transaction client** — in `server/src/common/auth/phone-account-rules.ts` change only the signature (keep the body and the existing comment):

```ts
export async function loginForPhone(
  // `Pick`, not `PrismaService`: restore and the ADR-0033 repair decide the
  // login inside a transaction, and a transaction client has the same `user`.
  prisma: Pick<PrismaService, 'user'>,
  phone: string,
): Promise<string | null> {
```

- [ ] **Step 5: Create `server/src/common/auth/student-account.ts`**

```ts
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { STUDENT_ROLE_ID } from '../../students/shared/student-select';
import { generatePassword } from '../utils/password.util';
import { loginForPhone } from './phone-account-rules';

/**
 * A student's sign-in account: an account whose ONLY role is Student.
 *
 * It belongs to its card (`Student.userId`) and lives only while the card is
 * live (ADR-0033): archiving the card closes it, restoring the card reopens
 * it. An account that also holds a staff role is a staff account first —
 * closing it with a card would lock a member of staff out — so it never
 * matches. ADR-0022 keeps the two apart; production had none on 2026-09-24.
 */
export const STUDENT_ONLY_ACCOUNT = {
  AND: [
    { roles: { some: { roleId: STUDENT_ROLE_ID } } },
    { roles: { every: { roleId: STUDENT_ROLE_ID } } },
  ],
} satisfies Prisma.UserWhereInput;

/** In-memory twin of {@link STUDENT_ONLY_ACCOUNT}. A role-less account is not a student. */
export function isStudentOnlyAccount(roleIds: readonly number[]): boolean {
  return roleIds.length > 0 && roleIds.every((id) => id === STUDENT_ROLE_ID);
}

export type SignInAccountState = 'Ochiq' | 'Yopildi' | "Yo'q";

/**
 * The card-history pair recording the account opening or closing. The history
 * tab labels `kirishHisobi` "Kirish hisobi"; the card is where staff look, the
 * account has no history tab of its own.
 */
export function signInAccountChange(
  from: SignInAccountState,
  to: SignInAccountState,
) {
  return {
    oldValues: { kirishHisobi: from },
    newValues: { kirishHisobi: to },
  };
}

/**
 * Opens a card's sign-in account and links it: the login is the phone unless
 * another live account already holds it (ADR-0022), the password is random,
 * the only role is Student. The plain password goes back to the one caller
 * that shows it (the admin create form); the repair script never prints it.
 */
export async function openStudentAccount(
  db: PrismaService | Prisma.TransactionClient,
  card: {
    id: number;
    phone: string;
    firstName: string;
    lastName: string;
    companyId: number;
  },
): Promise<{ userId: number; login: string | null; plainPassword: string }> {
  const login = await loginForPhone(db, card.phone);
  const plainPassword = generatePassword();
  const password = await bcrypt.hash(plainPassword, 10);

  const user = await db.user.create({
    data: {
      login,
      password,
      firstName: card.firstName,
      lastName: card.lastName,
      phone: card.phone,
      companyId: card.companyId,
      roles: { create: [{ roleId: STUDENT_ROLE_ID }] },
    },
    select: { id: true },
  });

  await db.student.update({
    where: { id: card.id },
    data: { userId: user.id },
  });

  return { userId: user.id, login, plainPassword };
}
```

- [ ] **Step 6: Make `createStudentUser` delegate** — in `server/src/students/students-write.service.ts` replace the body of `createStudentUser` (keep its signature and doc comment) and drop the now-unused imports (`loginForPhone`, `generatePassword`, and `STUDENT_ROLE_ID` if nothing else uses it; `bcrypt` stays — `update` hashes passwords):

```ts
  async createStudentUser(
    studentId: number,
    phone: string,
    firstName: string,
    lastName: string,
    companyId: number,
  ): Promise<{ userId: number; plainPassword: string }> {
    const { userId, plainPassword } = await openStudentAccount(this.prisma, {
      id: studentId,
      phone,
      firstName,
      lastName,
      companyId,
    });
    return { userId, plainPassword };
  }
```

with `import { openStudentAccount } from '../common/auth/student-account';`.

- [ ] **Step 7: Run the new spec and the existing account-creation specs**

Run: `cd server && npm test -- src/common/auth src/students/students.service.spec.ts src/students/students-write.origin.spec.ts`
Expected: PASS (the two existing `createStudentUser` tests still pass: `user.create` receives the same `data`, `student.update` the same link).

- [ ] **Step 8: Commit**

```bash
git add src/common/status/user-archive.ts src/common/auth/student-account.ts src/common/auth/student-account.spec.ts src/common/auth/phone-account-rules.ts src/students/students-write.service.ts
git commit -m "Auth: one definition of a student-only account and of opening one"
```

---

### Task 2: Archiving a card closes its account

**Files:**
- Modify: `server/src/students/students-write.service.ts` (`delete`)
- Create: `server/src/students/students-write.archive-account.spec.ts`
- Modify: `server/src/students/students.service.spec.ts` (mock gains `$transaction` + `user.updateMany`)

**Interfaces:**
- Consumes: `userArchiveData`, `STUDENT_ONLY_ACCOUNT`, `signInAccountChange` (Task 1).

- [ ] **Step 1: Write the failing test** — `server/src/students/students-write.archive-account.spec.ts`

```ts
import { UserStatus } from '@prisma/client';
import { StudentsWriteService } from './students-write.service';
import { STUDENT_ONLY_ACCOUNT } from '../common/auth/student-account';

jest.mock('../common/auth/student-branch-scope', () => ({
  assertCallerMayTouchStudent: jest.fn().mockResolvedValue(1),
}));

/**
 * ADR-0033: the card and its sign-in account are archived together. Before
 * this the account stayed ACTIVE, kept the student's number as its login and
 * went on signing in to a portal with no card behind it.
 */
describe('StudentsWriteService.delete — the sign-in account (ADR-0033)', () => {
  const CARD = {
    id: 20001,
    status: 'ACTIVE',
    companyId: 1001,
    userId: 30001,
    phone: '901112233',
  };
  let prisma: any;
  let tx: any;
  let history: any;
  let service: StudentsWriteService;

  beforeEach(() => {
    tx = {
      student: { update: jest.fn().mockResolvedValue({}) },
      user: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    prisma = {
      student: {
        findFirst: jest.fn().mockResolvedValue(CARD),
        update: jest.fn(),
      },
      user: { updateMany: jest.fn() },
      $transaction: jest.fn((fn: (t: any) => unknown) => fn(tx)),
    };
    history = {
      recordDelete: jest.fn(),
      recordUpdate: jest.fn(),
    };
    service = new StudentsWriteService(
      prisma,
      {} as any,
      { changeStatus: jest.fn().mockResolvedValue({}) } as any,
      { cascade: jest.fn().mockResolvedValue([]) } as any,
      history,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  it('archives the card and its student-only account in one transaction', async () => {
    await service.delete(20001, 7, 'Qayta ro‘yxatdan o‘tadi', 1001);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.student.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 20001 },
        data: expect.objectContaining({ status: 'ARCHIVED', deletedById: 7 }),
      }),
    );
    expect(prisma.student.update).not.toHaveBeenCalled();

    const call = tx.user.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({
      id: 30001,
      deletedAt: null,
      ...STUDENT_ONLY_ACCOUNT,
    });
    expect(call.data).toMatchObject({
      status: UserStatus.ARCHIVED,
      isActive: false,
      deletedAt: expect.any(Date),
      deletedById: 7,
    });
  });

  it("writes 'Kirish hisobi: Ochiq → Yopildi' on the card, inside the transaction", async () => {
    await service.delete(20001, 7, 'Sabab', 1001);

    expect(history.recordUpdate).toHaveBeenCalledWith({
      entityType: 'Student',
      entityId: 20001,
      oldValues: { kirishHisobi: 'Ochiq' },
      newValues: { kirishHisobi: 'Yopildi' },
      changedById: 7,
      companyId: 1001,
      tx,
    });
  });

  it('writes no account row when the account was not closed (already closed, or staff)', async () => {
    tx.user.updateMany.mockResolvedValue({ count: 0 });

    await service.delete(20001, 7, 'Sabab', 1001);

    expect(history.recordUpdate).not.toHaveBeenCalled();
  });

  it('archives a card with no account without touching users', async () => {
    prisma.student.findFirst.mockResolvedValue({ ...CARD, userId: null });

    await service.delete(20001, 7, 'Sabab', 1001);

    expect(tx.student.update).toHaveBeenCalled();
    expect(tx.user.updateMany).not.toHaveBeenCalled();
    expect(history.recordUpdate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd server && npm test -- src/students/students-write.archive-account.spec.ts`
Expected: FAIL — `$transaction` never called / `tx.user.updateMany` never called.

- [ ] **Step 3: Implement** — in `delete`, replace the lone `this.prisma.student.update({...})` with:

```ts
    // The card and its sign-in account are archived together (ADR-0033).
    // Every way in — password, Telegram, SMS reset — finds the account by its
    // own login/phone and never looks at the card, so an account left behind
    // kept signing in to a portal with no card behind it and, because live
    // logins are unique, kept the number from the same person's next card.
    // Only a student-only account is closed: one that also holds a staff role
    // is a member of staff's way in.
    await this.prisma.$transaction(async (tx) => {
      await tx.student.update({
        where: { id },
        data: {
          status: StudentStatus.ARCHIVED,
          isActive: false,
          deletedAt: new Date(),
          deletedById,
          statusChangedAt: new Date(),
          statusChangedById: deletedById,
          statusChangeReason: reason,
        },
      });

      if (student.userId == null) return;
      const closed = await tx.user.updateMany({
        where: { id: student.userId, deletedAt: null, ...STUDENT_ONLY_ACCOUNT },
        data: userArchiveData(deletedById),
      });
      if (closed.count > 0) {
        await this.entityHistoryService.recordUpdate({
          entityType: 'Student',
          entityId: id,
          ...signInAccountChange('Ochiq', 'Yopildi'),
          changedById: deletedById,
          companyId: student.companyId ?? undefined,
          tx,
        });
      }
    });
```

Imports: `import { userArchiveData } from '../common/status/user-archive';` (by path) and `STUDENT_ONLY_ACCOUNT, signInAccountChange` from `'../common/auth/student-account'`.

- [ ] **Step 4: Keep the old delete tests honest** — in `server/src/students/students.service.spec.ts`'s `prisma` mock add

```ts
      // `delete` archives the card and its account in one transaction;
      // the callback runs against this same mock.
      $transaction: jest.fn((fn: (tx: any) => unknown) => fn(prisma)),
```

and `updateMany: jest.fn().mockResolvedValue({ count: 0 }),` under `user`.

- [ ] **Step 5: Run the student specs**

Run: `cd server && npm test -- src/students`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/students/students-write.service.ts src/students/students-write.archive-account.spec.ts src/students/students.service.spec.ts
git commit -m "Students: archiving a card closes its sign-in account (ADR-0033)"
```

---

### Task 3: Restoring a card reopens its account

**Files:**
- Modify: `server/src/archive/archive-restore.service.ts`
- Create: `server/src/archive/archive-restore.student-account.spec.ts`

**Interfaces:**
- Consumes: `STUDENT_ONLY_ACCOUNT`, `signInAccountChange`, `loginForPhone` (Task 1).

- [ ] **Step 1: Write the failing test** — `server/src/archive/archive-restore.student-account.spec.ts`

```ts
import { BadRequestException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { ArchiveRestoreService } from './archive-restore.service';
import { ArchiveEntityType } from './dto/archive-query.dto';
import { STUDENT_ONLY_ACCOUNT } from '../common/auth/student-account';

/**
 * ADR-0033: a restored card brings its sign-in account back, with the login
 * re-derived from the card phone, and a card whose number now belongs to
 * another live student is not restored at all.
 */
describe('ArchiveRestoreService — a student card and its account (ADR-0033)', () => {
  const CARD = {
    id: 20001,
    phone: '901112233',
    userId: 30001,
    companyId: 1001,
    status: 'ARCHIVED',
    deletionBatchId: null,
  };
  let prisma: any;
  let tx: any;
  let statusHistory: any;
  let history: any;
  let service: ArchiveRestoreService;

  beforeEach(() => {
    tx = {
      student: { update: jest.fn().mockResolvedValue({}) },
      user: {
        // 1st: the closed account; 2nd: loginForPhone's "is it taken?"
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ id: 30001, login: '901112233' })
          .mockResolvedValueOnce(null),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    prisma = {
      student: {
        // 1st: the archived record; 2nd: another live card on the number
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(CARD)
          .mockResolvedValueOnce(null),
        update: jest.fn(),
      },
      $transaction: jest.fn((fn: (t: any) => unknown) => fn(tx)),
    };
    statusHistory = { changeStatus: jest.fn().mockResolvedValue({}) };
    history = { recordRestore: jest.fn(), recordUpdate: jest.fn() };
    service = new ArchiveRestoreService(prisma, statusHistory, history);
  });

  const restore = () =>
    service.restore(ArchiveEntityType.STUDENTS, 20001, 7, 1001);

  it('reopens the closed account with the card phone as its login', async () => {
    await restore();

    expect(tx.student.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 20001 } }),
    );
    expect(tx.user.findFirst.mock.calls[0][0].where).toEqual({
      id: 30001,
      deletedAt: { not: null },
      ...STUDENT_ONLY_ACCOUNT,
    });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 30001 },
      data: expect.objectContaining({
        status: UserStatus.ACTIVE,
        isActive: true,
        deletedAt: null,
        deletedById: null,
        deletionBatchId: null,
        statusChangedById: 7,
        statusChangeReason: 'Arxivdan tiklandi',
        phone: '901112233',
        login: '901112233',
      }),
    });
    expect(history.recordUpdate).toHaveBeenCalledWith({
      entityType: 'Student',
      entityId: 20001,
      oldValues: { kirishHisobi: 'Yopildi', login: '901112233' },
      newValues: { kirishHisobi: 'Ochiq', login: '901112233' },
      changedById: 7,
      companyId: 1001,
      tx,
    });
  });

  it('leaves the login empty when another live account holds the number', async () => {
    tx.user.findFirst
      .mockReset()
      .mockResolvedValueOnce({ id: 30001, login: '901112233' })
      .mockResolvedValueOnce({ id: 30999 });

    await restore();

    expect(tx.user.update.mock.calls[0][0].data.login).toBeNull();
    expect(tx.user.update.mock.calls[0][0].data.phone).toBe('901112233');
  });

  it('refuses, writing nothing, when the number is on another live card', async () => {
    prisma.student.findFirst
      .mockReset()
      .mockResolvedValueOnce(CARD)
      .mockResolvedValueOnce({ id: 20555 });

    const error = await restore().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toContain('#20555');
    expect(statusHistory.changeStatus).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(history.recordRestore).not.toHaveBeenCalled();
  });

  it('restores a card with no account without touching users', async () => {
    prisma.student.findFirst
      .mockReset()
      .mockResolvedValueOnce({ ...CARD, userId: null })
      .mockResolvedValueOnce(null);

    await restore();

    expect(tx.student.update).toHaveBeenCalled();
    expect(tx.user.findFirst).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('leaves an account that is still open alone', async () => {
    tx.user.findFirst.mockReset().mockResolvedValueOnce(null);

    await restore();

    expect(tx.user.update).not.toHaveBeenCalled();
    expect(history.recordUpdate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd server && npm test -- src/archive/archive-restore.student-account.spec.ts`
Expected: FAIL — no `$transaction`, no `tx.user.update`, no refusal.

- [ ] **Step 3: Implement** — in `ArchiveRestoreService.restore`, inside the `else` (no batch) branch:

1. First line of the branch: `if (entityType === ArchiveEntityType.STUDENTS) await this.assertNumberFreeForRestore(record);`
2. Keep the StatusHistory block and `restoreData` as they are.
3. Replace `await delegate.update({ where: { id: parsedId }, data: restoreData });` with

```ts
      if (entityType === ArchiveEntityType.STUDENTS) {
        // The card and its sign-in account come back together (ADR-0033).
        await this.prisma.$transaction(async (tx) => {
          await tx.student.update({
            where: { id: parsedId },
            data: restoreData,
          });
          await this.reopenStudentAccount(tx, record, userId);
        });
      } else {
        await delegate.update({
          where: { id: parsedId },
          data: restoreData,
        });
      }
```

4. Add the two private methods:

```ts
  /**
   * A restored card must not share its number with a live card: that is the
   * rule `create` and `update` enforce, and a second live card on one number
   * makes sign-in pick between two students. Checked before anything is
   * written, so a refusal leaves the archive exactly as it was.
   */
  private async assertNumberFreeForRestore(card: { id: number; phone: string }) {
    const holder = await this.prisma.student.findFirst({
      where: { phone: card.phone, deletedAt: null, id: { not: card.id } },
      select: { id: true },
    });
    if (holder) {
      throw new BadRequestException(
        `Bu kartaning telefon raqami hozir boshqa o'quvchida (#${holder.id}). ` +
          "Bitta raqamda ikkita o'quvchi bo'la olmaydi — avval o'sha kartadagi raqamni o'zgartiring.",
      );
    }
  }

  /**
   * Reopens the card's closed sign-in account (ADR-0033). The phone follows
   * the card and the login is the card phone unless another live account took
   * it while this one was closed (ADR-0022, ADR-0032) — writing it anyway
   * would break `User_login_key` and fail the whole restore. The password is
   * untouched. A card with no account gets none here; an account that was
   * never closed is left as it is.
   */
  private async reopenStudentAccount(
    tx: Prisma.TransactionClient,
    card: { id: number; phone: string; userId: number | null; companyId: number | null },
    userId: number,
  ) {
    if (card.userId == null) return;
    const account = await tx.user.findFirst({
      where: {
        id: card.userId,
        deletedAt: { not: null },
        ...STUDENT_ONLY_ACCOUNT,
      },
      select: { id: true, login: true },
    });
    if (!account) return;

    const login = await loginForPhone(tx, card.phone);
    await tx.user.update({
      where: { id: account.id },
      data: {
        status: UserStatus.ACTIVE,
        isActive: true,
        deletedAt: null,
        deletedById: null,
        deletionBatchId: null,
        statusChangedAt: new Date(),
        statusChangedById: userId,
        statusChangeReason: 'Arxivdan tiklandi',
        phone: card.phone,
        login,
      },
    });

    const change = signInAccountChange('Yopildi', 'Ochiq');
    await this.entityHistoryService.recordUpdate({
      entityType: 'Student',
      entityId: card.id,
      oldValues: { ...change.oldValues, login: account.login },
      newValues: { ...change.newValues, login },
      changedById: userId,
      companyId: card.companyId ?? undefined,
      tx,
    });
  }
```

Imports: `BadRequestException` from `@nestjs/common`, `Prisma` from `@prisma/client`, `STUDENT_ONLY_ACCOUNT, signInAccountChange` from `'../common/auth/student-account'`, `loginForPhone` from `'../common/auth/phone-account-rules'`.

5. Add a comment on `restoreBatch` above the `tx.student.updateMany` call:

```ts
      // No code archives a student card with a batch id today, so a student's
      // account never needs reopening here. A future batch archive of cards
      // must close and reopen their accounts the way `restore` does (ADR-0033).
```

- [ ] **Step 4: Run the spec**

Run: `cd server && npm test -- src/archive`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/archive/archive-restore.service.ts src/archive/archive-restore.student-account.spec.ts
git commit -m "Archive: restoring a student card reopens its account, refuses a taken number (ADR-0033)"
```

---

### Task 4: The staff archive tab stops listing student accounts

**Files:**
- Modify: `server/src/archive/shared/archive-meta.ts` (add `archiveScope`)
- Modify: `server/src/archive/archive-read.service.ts`, `archive-restore.service.ts`, `archive-delete.service.ts` (use `archiveScope`)
- Modify: `server/src/archive/shared/archive-meta.spec.ts`
- Create: `server/src/archive/archive-staff-tab.spec.ts`

**Interfaces:**
- Produces: `archiveScope(entityType: ArchiveEntityType, companyId: number): Record<string, unknown>`

- [ ] **Step 1: Write the failing tests**

Append to `server/src/archive/shared/archive-meta.spec.ts` (and add `archiveScope` to its import, plus `import { STUDENT_ONLY_ACCOUNT } from '../../common/auth/student-account';`):

```ts
describe('archiveScope', () => {
  // ADR-0033: a student's account is archived and restored with its card. In
  // the "Ustozlar / Xodimlar" tab it would be mislabelled, and restoring it
  // there alone would bring back an open account with no card.
  it('keeps student-only accounts out of the users tab', () => {
    expect(archiveScope(ArchiveEntityType.USERS, 1001)).toEqual({
      companyId: 1001,
      NOT: STUDENT_ONLY_ACCOUNT,
    });
  });

  it('adds nothing but the company to other company-scoped types', () => {
    expect(archiveScope(ArchiveEntityType.STUDENTS, 1001)).toEqual({
      companyId: 1001,
    });
  });

  it('stays empty for company-global types', () => {
    expect(archiveScope(ArchiveEntityType.LEADS, 1001)).toEqual({});
  });
});
```

Create `server/src/archive/archive-staff-tab.spec.ts`:

```ts
import { NotFoundException } from '@nestjs/common';
import { ArchiveReadService } from './archive-read.service';
import { ArchiveRestoreService } from './archive-restore.service';
import { ArchiveDeleteService } from './archive-delete.service';
import { ArchiveEntityType } from './dto/archive-query.dto';
import { STUDENT_ONLY_ACCOUNT } from '../common/auth/student-account';

/** Every door of the users tab applies the same scope (ADR-0033). */
describe('archive users tab — student accounts belong to their card', () => {
  const count = () => jest.fn().mockResolvedValue(0);
  let prisma: any;

  beforeEach(() => {
    prisma = {
      user: { count: count(), findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
      branch: { count: count() },
      room: { count: count() },
      course: { count: count() },
      student: { count: count() },
      lead: { count: count() },
      leadSection: { count: count() },
      group: { count: count() },
      enrollment: { count: count() },
      holiday: { count: count() },
    };
  });

  it('counts, lists and opens users without student-only accounts', async () => {
    const read = new ArchiveReadService(prisma);

    await read.getCounts(1001);
    expect(prisma.user.count.mock.calls[0][0].where).toMatchObject({
      companyId: 1001,
      NOT: STUDENT_ONLY_ACCOUNT,
    });

    await read.findAll(ArchiveEntityType.USERS, { page: 1, pageSize: 10 } as any, 1001);
    expect(prisma.user.findMany.mock.calls[0][0].where).toMatchObject({
      NOT: STUDENT_ONLY_ACCOUNT,
    });

    await expect(read.findOne(ArchiveEntityType.USERS, 30001, 1001)).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.user.findFirst.mock.calls[0][0].where).toMatchObject({
      NOT: STUDENT_ONLY_ACCOUNT,
    });
  });

  it('will not restore or permanently delete a student-only account on its own', async () => {
    const restore = new ArchiveRestoreService(prisma, {} as any, {} as any);
    await expect(
      restore.restore(ArchiveEntityType.USERS, 30001, 7, 1001),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.user.findFirst.mock.calls[0][0].where).toMatchObject({
      NOT: STUDENT_ONLY_ACCOUNT,
    });

    prisma.user.findFirst.mockClear();
    const remove = new ArchiveDeleteService(prisma, {} as any);
    await expect(
      remove.permanentDelete(ArchiveEntityType.USERS, 30001, 1001),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.user.findFirst.mock.calls[0][0].where).toMatchObject({
      NOT: STUDENT_ONLY_ACCOUNT,
    });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd server && npm test -- src/archive`
Expected: FAIL — `archiveScope is not a function`; `where` lacks `NOT`.

- [ ] **Step 3: Implement** — in `archive-meta.ts` add (with `import { STUDENT_ONLY_ACCOUNT } from '../../common/auth/student-account';`):

```ts
/**
 * Everything an archive query must match besides `deletedAt`: the company,
 * and in the users tab ("Ustozlar / Xodimlar") no student-only account.
 * A student's account is archived and restored with its card (ADR-0033);
 * listed here it is mislabelled, and restored here alone it would come back
 * open with no card. Role-less staff and mixed accounts stay visible.
 */
export function archiveScope(
  entityType: ArchiveEntityType,
  companyId: number,
): Record<string, unknown> {
  return {
    ...companyScope(entityType, companyId),
    ...(entityType === ArchiveEntityType.USERS && {
      NOT: STUDENT_ONLY_ACCOUNT,
    }),
  };
}
```

Then replace `companyScope(entityType, companyId)` with `archiveScope(entityType, companyId)` in `archive-read.service.ts` (`findAll`, `findOne`), `archive-restore.service.ts` (`restore`) and `archive-delete.service.ts` (`permanentDelete`), updating their imports. In `getCounts` change the users count to:

```ts
      this.prisma.user.count({
        where: { ...deletedFilter, ...archiveScope(ArchiveEntityType.USERS, companyId) },
      }),
```

(import `ArchiveEntityType` there if it is not imported yet).

- [ ] **Step 4: Run the archive specs**

Run: `cd server && npm test -- src/archive`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/archive
git commit -m "Archive: the staff tab no longer lists student accounts (ADR-0033)"
```

---

### Task 5: Sign-in refuses a student-only account without a live card

**Files:**
- Modify: `server/src/auth/auth.service.ts`
- Modify: `server/src/auth/auth.service.spec.ts`

**Interfaces:**
- Consumes: `isStudentOnlyAccount` (Task 1), `STUDENT_ROLE_ID`.
- Produces: `STUDENT_ACCOUNT_CLOSED_MESSAGE` exported from `auth.service.ts`.

- [ ] **Step 1: Write the failing tests** — append inside the top-level `describe('AuthService')` of `auth.service.spec.ts`:

```ts
  describe('a student-only account without a live card (ADR-0033)', () => {
    const closed = "Hisobingiz yopilgan. Administrator bilan bog'laning.";

    beforeEach(() => {
      prisma.student.findFirst.mockResolvedValue(null);
    });

    it('cannot sign in', async () => {
      await expect(service.login(student, undefined, 'student')).rejects.toThrow(
        closed,
      );
      expect(jwt.sign).not.toHaveBeenCalled();
    });

    it('cannot refresh', async () => {
      jwt.verify = jest.fn().mockReturnValue({ sub: 1, type: 'refresh' });
      prisma.user.findFirst.mockResolvedValue({ ...student, status: 'ACTIVE' });

      await expect(service.refresh('refresh-token')).rejects.toThrow(closed);
    });

    it('cannot open an app session', async () => {
      redis.get.mockResolvedValue('1');
      prisma.user.findFirst.mockResolvedValue({ ...student, status: 'ACTIVE' });

      await expect(service.pollLoginRequest('req-abc12345')).rejects.toThrow(
        closed,
      );
    });

    it('still lets an account that also holds a staff role sign in, without a studentId', async () => {
      const mixed = {
        ...student,
        roles: [
          { role: { id: 3, name: 'Administrator' } },
          { role: { id: 6, name: 'Student' } },
        ],
      };
      const res = await service.login(mixed, 'https://admin.dafzentrum.uz');
      expect(res.accessToken).toBe('tok');
      expect(res.user.studentId).toBeUndefined();
    });

    it('never looks for a card behind a staff account', async () => {
      await service.login(teacher, undefined, undefined);
      expect(prisma.student.findFirst).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd server && npm test -- src/auth/auth.service.spec.ts`
Expected: FAIL — the three refusals resolve instead of rejecting.

- [ ] **Step 3: Implement** — in `auth.service.ts`:

```ts
import { STUDENT_ROLE_ID } from '../students/shared/student-select';
import { isStudentOnlyAccount } from '../common/auth/student-account';

export const STUDENT_ACCOUNT_CLOSED_MESSAGE =
  "Hisobingiz yopilgan. Administrator bilan bog'laning.";
```

Private helper on the class:

```ts
  /**
   * The live card behind an account holding the Student role, or nothing.
   *
   * A student-only account whose card is archived or gone is refused
   * (ADR-0033). Archiving closes the account, so this only fires when the two
   * have drifted — and the token it would get carries no `studentId`: every
   * portal page then fails with a misleading "check your internet", and any
   * read that trusts `studentId` loses its filter. An account that also holds
   * a staff role signs in as staff, as before.
   */
  private async resolveStudentId(
    userId: number,
    roleIds: number[],
  ): Promise<number | undefined> {
    if (!roleIds.includes(STUDENT_ROLE_ID)) return undefined;
    const student = await this.prisma.student.findFirst({
      where: { userId, deletedAt: null },
      select: { id: true },
    });
    if (student) return student.id;
    if (isStudentOnlyAccount(roleIds)) {
      throw new UnauthorizedException(STUDENT_ACCOUNT_CLOSED_MESSAGE);
    }
    return undefined;
  }
```

Replace the three card lookups:
- `login`: the `let studentId ... if (roleIds.includes(6)) {...}` block → `const studentId = await this.resolveStudentId(user.id, roleIds);`
- `buildStudentSession`: `const student = ...; const studentId = student?.id;` → `const studentId = await this.resolveStudentId(user.id, roleIds);`
- `refresh`: the same block as `login` → `const studentId = await this.resolveStudentId(user.id, roleIds);` (it is inside the `try`; the `catch` re-throws `UnauthorizedException` unchanged).

Also replace the literal `6` in `buildStudentSession`'s role gate with `STUDENT_ROLE_ID`.

- [ ] **Step 4: Run the auth specs, including Telegram OAuth and the controller**

Run: `cd server && npm test -- src/auth`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/auth/auth.service.ts src/auth/auth.service.spec.ts
git commit -m "Auth: a student account with no live card cannot sign in (ADR-0033)"
```

---

### Task 6: One-off repair script

**Files:**
- Create: `server/scripts/lib/archived-student-account-repair.ts`
- Create: `server/scripts/lib/archived-student-account-repair.spec.ts`
- Create: `server/scripts/repair-archived-student-accounts.ts`
- Modify: `server/tsconfig.check.json` (add the three files)

**Interfaces:**
- Consumes: `STUDENT_ONLY_ACCOUNT`, `signInAccountChange`, `openStudentAccount`, `userArchiveData`, `loginForPhone`, `EntityHistoryService.recordUpdate({ ..., tx })`.
- Produces (lib):
  - `systemArchiveData()` — `userArchiveData`'s fields with no actor
  - `findAccountsToClose(db) → ClosePlan[]` / `applyClose(prisma, history, plan) → 'applied' | 'skipped'`
  - `findLoginsToFill(db, closingAccountIds?) → LoginPlan[]` / `applyLogin(prisma, history, plan)`
  - `findCardsWithoutAccount(db, closingAccountIds?) → OpenPlan[]` / `applyOpen(prisma, history, plan)`
  - `findCardsOnClosedAccount(db) → number[]`

- [ ] **Step 1: Write the failing tests** — `server/scripts/lib/archived-student-account-repair.spec.ts`

```ts
import { UserStatus } from '@prisma/client';
import {
  applyClose,
  applyLogin,
  applyOpen,
  findAccountsToClose,
  findCardsWithoutAccount,
  findLoginsToFill,
  systemArchiveData,
} from './archived-student-account-repair';
import { STUDENT_ONLY_ACCOUNT } from '../../src/common/auth/student-account';
import { userArchiveData } from '../../src/common/status/user-archive';

const txOf = (tx: any) => ({
  $transaction: jest.fn((fn: (t: any) => unknown) => fn(tx)),
});

describe('ADR-0033 repair — close accounts of archived cards', () => {
  it('writes the archive fields with no actor ("Tizim")', () => {
    const data = systemArchiveData();
    expect(Object.keys(data).sort()).toEqual(
      Object.keys(userArchiveData(1)).sort(),
    );
    expect(data).toMatchObject({
      status: UserStatus.ARCHIVED,
      isActive: false,
      deletedById: null,
      statusChangedById: null,
    });
  });

  it('finds live student-only accounts whose card is archived or gone', async () => {
    const db = {
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: 30001, companyId: 1001, student: { id: 20001, companyId: 1001 } },
          { id: 30002, companyId: 1001, student: null },
        ]),
      },
    };

    const plans = await findAccountsToClose(db as any);

    expect(db.user.findMany.mock.calls[0][0].where).toEqual({
      deletedAt: null,
      ...STUDENT_ONLY_ACCOUNT,
      OR: [
        { student: { is: null } },
        { student: { is: { deletedAt: { not: null } } } },
      ],
    });
    expect(plans).toEqual([
      { accountId: 30001, studentId: 20001, companyId: 1001 },
      { accountId: 30002, studentId: null, companyId: 1001 },
    ]);
  });

  it('closes one and records it on the card', async () => {
    const tx = { user: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    const history = { recordUpdate: jest.fn() };

    const result = await applyClose(txOf(tx) as any, history as any, {
      accountId: 30001,
      studentId: 20001,
      companyId: 1001,
    });

    expect(result).toBe('applied');
    expect(tx.user.updateMany.mock.calls[0][0].where).toMatchObject({
      id: 30001,
      deletedAt: null,
    });
    expect(history.recordUpdate).toHaveBeenCalledWith({
      entityType: 'Student',
      entityId: 20001,
      oldValues: { kirishHisobi: 'Ochiq' },
      newValues: { kirishHisobi: 'Yopildi' },
      companyId: 1001,
      tx,
    });
  });

  it('skips an account that changed since planning', async () => {
    const tx = { user: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) } };
    const history = { recordUpdate: jest.fn() };

    const result = await applyClose(txOf(tx) as any, history as any, {
      accountId: 30001,
      studentId: 20001,
      companyId: 1001,
    });

    expect(result).toBe('skipped');
    expect(history.recordUpdate).not.toHaveBeenCalled();
  });
});

describe('ADR-0033 repair — give an empty login the card number', () => {
  it('plans only numbers nobody else holds, ignoring accounts about to close', async () => {
    const db = {
      student: {
        findMany: jest.fn().mockResolvedValue([
          { id: 20001, phone: '901112233', companyId: 1001, user: { id: 30001, phone: '901112233' } },
          { id: 20002, phone: '902223344', companyId: 1001, user: { id: 30002, phone: '902223344' } },
          { id: 20003, phone: '903334455', companyId: 1001, user: { id: 30003, phone: '909999999' } },
        ]),
      },
      user: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: 30777 }),
      },
    };

    const plans = await findLoginsToFill(db as any, [30500]);

    expect(db.user.findFirst.mock.calls[0][0].where).toEqual({
      login: '901112233',
      deletedAt: null,
      id: { notIn: [30500] },
    });
    // 20002: the number is still someone's login; 20003: account and card disagree.
    expect(plans).toEqual([
      { studentId: 20001, accountId: 30001, companyId: 1001, login: '901112233' },
    ]);
  });

  it('writes the login and the card history, or skips when the number got taken', async () => {
    const history = { recordUpdate: jest.fn() };
    const plan = { studentId: 20001, accountId: 30001, companyId: 1001, login: '901112233' };
    const tx = {
      user: {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      student: { findFirst: jest.fn().mockResolvedValue({ id: 20001 }) },
    };

    expect(await applyLogin(txOf(tx) as any, history as any, plan)).toBe('applied');
    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: 30001, deletedAt: null, login: null },
      data: { login: '901112233' },
    });
    expect(history.recordUpdate).toHaveBeenCalledWith({
      entityType: 'Student',
      entityId: 20001,
      oldValues: { login: null },
      newValues: { login: '901112233' },
      companyId: 1001,
      tx,
    });

    tx.user.findFirst.mockResolvedValue({ id: 30888 });
    expect(await applyLogin(txOf(tx) as any, history as any, plan)).toBe('skipped');
  });
});

describe('ADR-0033 repair — open the missing accounts', () => {
  it('plans every live card without an account and previews its login', async () => {
    const db = {
      student: {
        findMany: jest.fn().mockResolvedValue([
          { id: 20001, phone: '901112233', firstName: 'Ali', lastName: 'Valiyev', companyId: 1001 },
          { id: 20002, phone: '902223344', firstName: 'Vali', lastName: 'Aliyev', companyId: 1001 },
        ]),
      },
      user: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: 30777 }),
      },
    };

    const plans = await findCardsWithoutAccount(db as any, [30500]);

    expect(db.student.findMany.mock.calls[0][0].where).toEqual({
      deletedAt: null,
      userId: null,
    });
    expect(plans.map((p) => [p.studentId, p.loginIsPhone])).toEqual([
      [20001, true],
      [20002, false],
    ]);
  });

  it('opens the account like the admin form does, or skips a card that got one', async () => {
    const history = { recordUpdate: jest.fn() };
    const plan = {
      studentId: 20001,
      phone: '901112233',
      firstName: 'Ali',
      lastName: 'Valiyev',
      companyId: 1001,
      loginIsPhone: true,
    };
    const tx = {
      student: {
        findFirst: jest.fn().mockResolvedValue({ id: 20001 }),
        update: jest.fn().mockResolvedValue({}),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 30001 }),
      },
    };

    expect(await applyOpen(txOf(tx) as any, history as any, plan)).toBe('applied');
    expect(tx.user.create.mock.calls[0][0].data).toMatchObject({
      login: '901112233',
      phone: '901112233',
      roles: { create: [{ roleId: 6 }] },
    });
    expect(tx.student.update).toHaveBeenCalledWith({
      where: { id: 20001 },
      data: { userId: 30001 },
    });
    expect(history.recordUpdate).toHaveBeenCalledWith({
      entityType: 'Student',
      entityId: 20001,
      oldValues: { kirishHisobi: "Yo'q", login: null },
      newValues: { kirishHisobi: 'Ochiq', login: '901112233' },
      companyId: 1001,
      tx,
    });

    tx.student.findFirst.mockResolvedValue(null);
    tx.user.create.mockClear();
    expect(await applyOpen(txOf(tx) as any, history as any, plan)).toBe('skipped');
    expect(tx.user.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd server && npm test -- scripts/lib/archived-student-account-repair.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the lib** — `server/scripts/lib/archived-student-account-repair.ts`

```ts
/**
 * One-off repair for ADR-0033: the sign-in accounts left open by cards
 * archived before archiving closed them, the empty logins those accounts
 * forced on live students, and the live cards that never got an account.
 *
 * Each step decides with the same definitions the services use
 * (`STUDENT_ONLY_ACCOUNT`, `loginForPhone`, `openStudentAccount`), so the
 * repair cannot disagree with the rule it catches up to. Every write re-checks
 * its row inside a transaction and skips it when it changed after planning:
 * a second run only picks up what the first left behind.
 */
import { Prisma, UserStatus } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { EntityHistoryService } from '../../src/common/entity-history';
import {
  STUDENT_ONLY_ACCOUNT,
  openStudentAccount,
  signInAccountChange,
} from '../../src/common/auth/student-account';

type Db = PrismaService | Prisma.TransactionClient;
type Outcome = 'applied' | 'skipped';

// Generous limits: the script runs from a laptop against a far-away database.
const LIMITS = { maxWait: 10_000, timeout: 20_000 };

/**
 * `userArchiveData` with no actor. A card archived today closes its account
 * with the archiving user's id; this repair has none, and the history tab
 * shows a missing actor as "Tizim". The spec pins the two to the same fields.
 */
export function systemArchiveData() {
  const archivedAt = new Date();
  return {
    status: UserStatus.ARCHIVED,
    isActive: false,
    deletedAt: archivedAt,
    deletedById: null,
    statusChangedAt: archivedAt,
    statusChangedById: null,
    statusChangeReason: "O'chirildi",
  } satisfies Prisma.UserUncheckedUpdateInput;
}

// ── 1. close ───────────────────────────────────────────────────────────────

export interface ClosePlan {
  accountId: number;
  /** The archived card, or null when the account has no card at all. */
  studentId: number | null;
  companyId: number;
}

const CARD_ARCHIVED_OR_GONE = {
  OR: [
    { student: { is: null } },
    { student: { is: { deletedAt: { not: null } } } },
  ],
} satisfies Prisma.UserWhereInput;

export async function findAccountsToClose(db: Db): Promise<ClosePlan[]> {
  const rows = await db.user.findMany({
    where: { deletedAt: null, ...STUDENT_ONLY_ACCOUNT, ...CARD_ARCHIVED_OR_GONE },
    select: {
      id: true,
      companyId: true,
      student: { select: { id: true, companyId: true } },
    },
    orderBy: { id: 'asc' },
  });
  return rows.map((row) => ({
    accountId: row.id,
    studentId: row.student?.id ?? null,
    companyId: row.student?.companyId ?? row.companyId,
  }));
}

export async function applyClose(
  prisma: PrismaService,
  history: EntityHistoryService,
  plan: ClosePlan,
): Promise<Outcome> {
  return prisma.$transaction(async (tx) => {
    const closed = await tx.user.updateMany({
      where: {
        id: plan.accountId,
        deletedAt: null,
        ...STUDENT_ONLY_ACCOUNT,
        ...CARD_ARCHIVED_OR_GONE,
      },
      data: systemArchiveData(),
    });
    if (closed.count === 0) return 'skipped';
    if (plan.studentId !== null) {
      await history.recordUpdate({
        entityType: 'Student',
        entityId: plan.studentId,
        ...signInAccountChange('Ochiq', 'Yopildi'),
        companyId: plan.companyId,
        tx,
      });
    }
    return 'applied';
  }, LIMITS);
}

// ── 2. empty login → the card number ───────────────────────────────────────

export interface LoginPlan {
  studentId: number;
  accountId: number;
  companyId: number;
  login: string;
}

/**
 * Live cards whose live student-only account has no login although the card
 * number is free. `closingAccountIds` lets a dry run see the numbers step 1
 * is about to free. An account whose phone differs from its card is ADR-0032's
 * job, not this one's — it is left out.
 */
export async function findLoginsToFill(
  db: Db,
  closingAccountIds: number[] = [],
): Promise<LoginPlan[]> {
  const rows = await db.student.findMany({
    where: {
      deletedAt: null,
      user: { is: { deletedAt: null, login: null, ...STUDENT_ONLY_ACCOUNT } },
    },
    select: {
      id: true,
      phone: true,
      companyId: true,
      user: { select: { id: true, phone: true } },
    },
    orderBy: { id: 'asc' },
  });

  const plans: LoginPlan[] = [];
  for (const row of rows) {
    if (!row.user || row.user.phone !== row.phone) continue;
    const holder = await db.user.findFirst({
      where: {
        login: row.phone,
        deletedAt: null,
        id: { notIn: closingAccountIds },
      },
      select: { id: true },
    });
    if (holder) continue;
    plans.push({
      studentId: row.id,
      accountId: row.user.id,
      companyId: row.companyId,
      login: row.phone,
    });
  }
  return plans;
}

export async function applyLogin(
  prisma: PrismaService,
  history: EntityHistoryService,
  plan: LoginPlan,
): Promise<Outcome> {
  return prisma.$transaction(async (tx) => {
    const holder = await tx.user.findFirst({
      where: { login: plan.login, deletedAt: null },
      select: { id: true },
    });
    if (holder) return 'skipped';
    const card = await tx.student.findFirst({
      where: {
        id: plan.studentId,
        deletedAt: null,
        phone: plan.login,
        userId: plan.accountId,
      },
      select: { id: true },
    });
    if (!card) return 'skipped';

    const updated = await tx.user.updateMany({
      where: { id: plan.accountId, deletedAt: null, login: null },
      data: { login: plan.login },
    });
    if (updated.count === 0) return 'skipped';

    await history.recordUpdate({
      entityType: 'Student',
      entityId: plan.studentId,
      oldValues: { login: null },
      newValues: { login: plan.login },
      companyId: plan.companyId,
      tx,
    });
    return 'applied';
  }, LIMITS);
}

// ── 3. open the missing accounts ───────────────────────────────────────────

export interface OpenPlan {
  studentId: number;
  phone: string;
  firstName: string;
  lastName: string;
  companyId: number;
  /** Dry-run preview: will the login be the phone (true) or empty (false)? */
  loginIsPhone: boolean;
}

export async function findCardsWithoutAccount(
  db: Db,
  closingAccountIds: number[] = [],
): Promise<OpenPlan[]> {
  const rows = await db.student.findMany({
    where: { deletedAt: null, userId: null },
    select: {
      id: true,
      phone: true,
      firstName: true,
      lastName: true,
      companyId: true,
    },
    orderBy: { id: 'asc' },
  });

  const plans: OpenPlan[] = [];
  for (const row of rows) {
    const holder = await db.user.findFirst({
      where: {
        login: row.phone,
        deletedAt: null,
        id: { notIn: closingAccountIds },
      },
      select: { id: true },
    });
    plans.push({
      studentId: row.id,
      phone: row.phone,
      firstName: row.firstName,
      lastName: row.lastName,
      companyId: row.companyId,
      loginIsPhone: !holder,
    });
  }
  return plans;
}

/**
 * Opens the account exactly like the admin form (`openStudentAccount`). The
 * password is random and never printed: the student gets one through the
 * bot's "Parolni tiklash", or staff set one on the card.
 */
export async function applyOpen(
  prisma: PrismaService,
  history: EntityHistoryService,
  plan: OpenPlan,
): Promise<Outcome> {
  return prisma.$transaction(async (tx) => {
    const card = await tx.student.findFirst({
      where: {
        id: plan.studentId,
        deletedAt: null,
        userId: null,
        phone: plan.phone,
      },
      select: { id: true },
    });
    if (!card) return 'skipped';

    const { login } = await openStudentAccount(tx, {
      id: plan.studentId,
      phone: plan.phone,
      firstName: plan.firstName,
      lastName: plan.lastName,
      companyId: plan.companyId,
    });

    const change = signInAccountChange("Yo'q", 'Ochiq');
    await history.recordUpdate({
      entityType: 'Student',
      entityId: plan.studentId,
      oldValues: { ...change.oldValues, login: null },
      newValues: { ...change.newValues, login },
      companyId: plan.companyId,
      tx,
    });
    return 'applied';
  }, LIMITS);
}

/** Live cards linked to a closed account: reported, never touched (production: 0). */
export async function findCardsOnClosedAccount(db: Db): Promise<number[]> {
  const rows = await db.student.findMany({
    where: { deletedAt: null, user: { is: { deletedAt: { not: null } } } },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  return rows.map((row) => row.id);
}
```

- [ ] **Step 4: Run the lib spec**

Run: `cd server && npm test -- scripts/lib/archived-student-account-repair.spec.ts`
Expected: PASS.

- [ ] **Step 5: Write the CLI** — `server/scripts/repair-archived-student-accounts.ts`

```ts
/**
 * ADR-0033 one-off: close the sign-in accounts of archived cards, give the
 * students those accounts crowded out their own number as login, and open an
 * account for every live card without one. Logic and tests:
 * `scripts/lib/archived-student-account-repair.ts`.
 *
 * Dry run (default, read-only) — counts and ids, never a phone or a password:
 *   cd server && railway run npx ts-node scripts/repair-archived-student-accounts.ts
 *
 * Apply (writes; only after the CEO has seen the dry run and said yes):
 *   cd server && railway run npx ts-node scripts/repair-archived-student-accounts.ts --apply --ha-men-tasdiqlayman
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../src/prisma/prisma.service';
import { EntityHistoryService } from '../src/common/entity-history';
import { printHeader } from './lib/check-cli';
import {
  applyClose,
  applyLogin,
  applyOpen,
  findAccountsToClose,
  findCardsOnClosedAccount,
  findCardsWithoutAccount,
  findLoginsToFill,
} from './lib/archived-student-account-repair';

const list = (ids: Array<number | null>) =>
  ids.map((id) => (id === null ? 'kartasiz' : `#${id}`)).join(', ') || '—';

async function runAll<T>(
  plans: T[],
  apply: (plan: T) => Promise<'applied' | 'skipped'>,
): Promise<{ applied: number; skipped: T[] }> {
  let applied = 0;
  const skipped: T[] = [];
  for (const plan of plans) {
    if ((await apply(plan)) === 'applied') applied++;
    else skipped.push(plan);
  }
  return { applied, skipped };
}

async function main() {
  const apply = process.argv.includes('--apply');
  if (apply && !process.argv.includes('--ha-men-tasdiqlayman')) {
    console.error(
      "--apply yolg'iz ishlamaydi: o'quvchilarning kirish hisoblari yopiladi va ochiladi.\n" +
        "Avval quruq ishga tushirib, sonlarni CEO bilan ko'rib chiqing, keyin:\n" +
        '  npx ts-node scripts/repair-archived-student-accounts.ts --apply --ha-men-tasdiqlayman',
    );
    process.exit(1);
  }

  const prisma = new PrismaService();
  try {
    printHeader(
      `O'quvchi kirish hisobi kartaga ergashadi (ADR-0033) — ${apply ? 'APPLY' : 'DRY RUN'}`,
    );

    const toClose = await findAccountsToClose(prisma);
    const closing = toClose.map((p) => p.accountId);
    const toFill = await findLoginsToFill(prisma, closing);
    const toOpen = await findCardsWithoutAccount(prisma, closing);
    const stranded = await findCardsOnClosedAccount(prisma);

    console.log(`1. Yopiladigan hisoblar: ${toClose.length}`);
    console.log(`   kartalari: ${list(toClose.map((p) => p.studentId))}`);
    console.log(`2. Kirish nomi karta raqamiga o'tadigan o'quvchilar: ${toFill.length}`);
    console.log(`   ${list(toFill.map((p) => p.studentId))}`);
    console.log(`3. Hisob ochiladigan o'quvchilar: ${toOpen.length}`);
    console.log(`   kirish nomi = raqam: ${list(toOpen.filter((p) => p.loginIsPhone).map((p) => p.studentId))}`);
    console.log(`   kirish nomi bo'sh:   ${list(toOpen.filter((p) => !p.loginIsPhone).map((p) => p.studentId))}`);
    console.log(`Yopiq hisobga bog'langan tirik karta (tegilmaydi): ${list(stranded)}`);

    if (!apply) {
      console.log('\nDRY RUN — bazaga hech narsa yozilmadi.');
      return;
    }

    const history = new EntityHistoryService(prisma, new EventEmitter2());

    const closed = await runAll(toClose, (p) => applyClose(prisma, history, p));
    console.log(`\n1. Yopildi: ${closed.applied}. O'tkazildi: ${list(closed.skipped.map((p) => p.studentId))}`);

    // Re-planned against the database as it is now: step 1 freed the numbers.
    const filled = await runAll(await findLoginsToFill(prisma), (p) =>
      applyLogin(prisma, history, p),
    );
    console.log(`2. Kirish nomi yozildi: ${filled.applied}. O'tkazildi: ${list(filled.skipped.map((p) => p.studentId))}`);

    const opened = await runAll(await findCardsWithoutAccount(prisma), (p) =>
      applyOpen(prisma, history, p),
    );
    console.log(`3. Hisob ochildi: ${opened.applied}. O'tkazildi: ${list(opened.skipped.map((p) => p.studentId))}`);

    const [leftClose, leftFill, leftOpen] = await Promise.all([
      findAccountsToClose(prisma),
      findLoginsToFill(prisma),
      findCardsWithoutAccount(prisma),
    ]);
    console.log(
      `\nQoldi: yopilmagan ${leftClose.length}, kirish nomisiz ${leftFill.length}, hisobsiz ${leftOpen.length}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

// Importing this file (a test, another script) must not run it.
if (require.main === module) {
  main().catch((error) => {
    console.error('FAILED:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
```

- [ ] **Step 6: Type-check the script with `src` standards** — add to `server/tsconfig.check.json`'s `include`, after `"scripts/lib/check-cli.ts"`:

```json
    "scripts/repair-archived-student-accounts.ts",
    "scripts/lib/archived-student-account-repair.ts",
    "scripts/lib/archived-student-account-repair.spec.ts"
```

(a comma after `"scripts/lib/check-cli.ts"`), and extend the comment above the list with one line: `// Also the ADR-0033 account repair: it closes and opens sign-in accounts.`

- [ ] **Step 7: Verify**

Run: `cd server && npm run typecheck && npm test -- scripts/lib/archived-student-account-repair.spec.ts`
Expected: typecheck exit 0, spec PASS.

- [ ] **Step 8: Dry run against the DEV database** (read-only, proves the queries run)

Run: `cd server && npx ts-node scripts/repair-archived-student-accounts.ts`
Expected: header with the dev host, four count lines, `DRY RUN — bazaga hech narsa yozilmadi.`

- [ ] **Step 9: Commit**

```bash
git add scripts/repair-archived-student-accounts.ts scripts/lib/archived-student-account-repair.ts scripts/lib/archived-student-account-repair.spec.ts tsconfig.check.json
git commit -m "Scripts: one-off repair that closes stale student accounts and opens missing ones (ADR-0033)"
```

---

### Task 7: Client — restore message and history label

**Files:**
- Modify: `client/src/components/settings/archive-settings-client.tsx` (`handleRestore`)
- Modify: `client/src/components/shared/entity-history-utils.ts` (`FIELD_LABELS`)

- [ ] **Step 1: Show the server's reason when a restore is refused** — in `handleRestore`:

```tsx
    } catch (err) {
      toast.error(getErrorMessage(err, "Tiklashda xatolik yuz berdi"));
    } finally {
```

with `import { getErrorMessage } from "@/lib/get-error-message";`.

- [ ] **Step 2: Label the card-history field** — in `FIELD_LABELS`, after `login: "Login",`:

```ts
  kirishHisobi: "Kirish hisobi",
```

- [ ] **Step 3: Verify**

Run: `cd client && npx tsc --noEmit && npx eslint src/components/settings/archive-settings-client.tsx src/components/shared/entity-history-utils.ts`
Expected: exit 0, no new eslint errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/settings/archive-settings-client.tsx client/src/components/shared/entity-history-utils.ts
git commit -m "Client: show why a restore was refused; label the sign-in account history row"
```

---

### Task 8: ADR-0033 and docs

**Files:**
- Create: `docs/adr/0033-oquvchi-hisobi-kartasi-bilan-yopiladi.md`
- Modify: `docs/adr/README.md` (index row)
- Modify: `server/CLAUDE.md` (Soft Delete & Archive bullet)

- [ ] **Step 1: Re-check the number is still free on every branch and worktree**

```bash
for ref in $(git for-each-ref --format='%(refname)' refs/heads refs/remotes); do git ls-tree --name-only "$ref" docs/adr/ 2>/dev/null; done | grep -o '00[0-9][0-9]' | sort -u | tail -3
```

Expected: highest is `0032`. If `0033` is taken, use the next free number everywhere (spec link, code comments, ADR file, README row, CLAUDE.md).

- [ ] **Step 2: Write the ADR** — Nygard format in Uzbek (Holati / Sana / Bog'liq, Kontekst, Qaror, Ko'rib chiqilgan muqobillar, Oqibatlari), one page, no production ids. Qaror: (1) archive closes the account in the same transaction with `userArchiveData`; only student-only accounts; (2) restore reopens it, login re-derived, refused when the number is on a live card; (3) EXPELLED/FROZEN/GRADUATED do not touch it; (4) the staff archive tab hides student-only accounts; (5) sign-in refuses a student-only account without a live card; (6) a one-off repair. Taqiqlanadi: archiving a student card anywhere but `StudentsWriteService.delete` without closing the account the same way; restoring a student account through the users tab. Muqobillar: close by status only (keeps the login reserved — the very collision), close on expel/graduate too (CEO rejected: debt and payment through the portal), refuse archive while the account is open (the admin cannot see or close accounts), delete the account (history and attendance rows point at it). Oqibatlari: yutuq, narx (≤1 h of an already-issued access token; a restored account-less card stays account-less; a permanently deleted card leaves a closed account row), what it does not close (mock-exam conversion opens no account).

- [ ] **Step 3: README index row** — after the 0025 row, in number order (rows 0026–0032 live on other branches and will be merged in their own PRs):

```markdown
| [0033](0033-oquvchi-hisobi-kartasi-bilan-yopiladi.md) | O'quvchining kirish hisobi kartasi bilan birga yopiladi va qaytadi | Qabul qilindi | 2026-09-24 |
```

- [ ] **Step 4: server/CLAUDE.md** — under "### Soft Delete & Archive", after the "Cascade archiving" bullet:

```markdown
- **A student's sign-in account lives and dies with the card (ADR-0033).** `StudentsWriteService.delete` archives the card and its student-only account (`STUDENT_ONLY_ACCOUNT`, `common/auth/student-account.ts`) in one transaction with `userArchiveData`; `ArchiveRestoreService.restore` reopens it with the login re-derived from the card phone and refuses a card whose phone is on another live card. EXPELLED / FROZEN / GRADUATED leave the account open on purpose (debt is paid through the portal). The archive users tab ("Ustozlar / Xodimlar") never lists a student-only account, and `AuthService` refuses one with no live card. Any new path that archives student cards must close their accounts the same way.
```

- [ ] **Step 5: Commit**

```bash
git add docs/adr/0033-oquvchi-hisobi-kartasi-bilan-yopiladi.md docs/adr/README.md server/CLAUDE.md
git commit -m "Docs: ADR-0033, a student's sign-in account closes and reopens with the card"
```

---

### Final verification (before the PR)

- [ ] `cd server && npm test` — every suite green (count noted in the PR).
- [ ] `cd server && npm run typecheck` — exit 0.
- [ ] `cd server && npx eslint <every changed server file>` — 0 errors.
- [ ] `cd server && npm run build` — exit 0 (the only whole-tree type check the Railway build runs).
- [ ] `cd client && npx tsc --noEmit` — exit 0.
- [ ] Probe old vs new on the sign-in doors (memory "replacing a guard"): a staff login, a mixed-role login and a student with a live card behave exactly as on `origin/main`.
- [ ] `git grep -nE '9[0-9]{8}|#1[01][0-9]{3}' -- docs server/src server/scripts client/src | grep -v spec` shows no production phone or id introduced by this branch.
