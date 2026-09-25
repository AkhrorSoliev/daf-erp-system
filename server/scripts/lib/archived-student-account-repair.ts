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
    where: {
      deletedAt: null,
      ...STUDENT_ONLY_ACCOUNT,
      ...CARD_ARCHIVED_OR_GONE,
    },
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
