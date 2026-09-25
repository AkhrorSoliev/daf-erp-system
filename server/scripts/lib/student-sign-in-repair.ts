/**
 * One-off repair for ADR-0032: bring every live student's sign-in account to
 * the number on their card.
 *
 * `StudentsWriteService.update` keeps the two together from now on; this
 * closes the accounts left behind by card edits made before that rule
 * (production, 2026-09-24: 115). The decision per account is the same
 * function the service uses — `planPhoneChange` with `staff: false` — so the
 * repair cannot disagree with the rule it catches up to.
 */
import { PrismaService } from '../../src/prisma/prisma.service';
import { EntityHistoryService } from '../../src/common/entity-history';
import {
  planPhoneChange,
  type PhoneChangeWrite,
} from '../../src/common/auth/phone-account-rules';

export interface DriftedStudent {
  studentId: number;
  companyId: number | null;
  /** The number on the card — where the account has to go. */
  card: string;
  account: { id: number; phone: string | null; login: string | null };
}

export interface RepairPlan extends DriftedStudent {
  write: PhoneChangeWrite;
  /** The live account holding the card's number as its login, when the login had to be cleared. */
  loginHolderId: number | null;
}

/** Live cards whose live sign-in account answers to a different number. */
export async function findDriftedStudents(
  prisma: PrismaService,
): Promise<DriftedStudent[]> {
  const rows = await prisma.student.findMany({
    where: { deletedAt: null, userId: { not: null } },
    select: {
      id: true,
      phone: true,
      companyId: true,
      user: {
        select: { id: true, phone: true, login: true, deletedAt: true },
      },
    },
    orderBy: { id: 'asc' },
  });

  return rows.flatMap((row) =>
    row.user && row.user.deletedAt === null && row.user.phone !== row.phone
      ? [
          {
            studentId: row.id,
            companyId: row.companyId,
            card: row.phone,
            account: {
              id: row.user.id,
              phone: row.user.phone,
              login: row.user.login,
            },
          },
        ]
      : [],
  );
}

export async function planRepairs(
  prisma: PrismaService,
  drifted: DriftedStudent[],
): Promise<RepairPlan[]> {
  const plans: RepairPlan[] = [];
  for (const row of drifted) {
    const write = await planPhoneChange(prisma, row.account, row.card, {
      staff: false,
    });
    const holder =
      'login' in write && write.login === null
        ? await prisma.user.findFirst({
            where: { login: row.card, deletedAt: null },
            select: { id: true },
          })
        : null;
    plans.push({ ...row, write, loginHolderId: holder?.id ?? null });
  }
  return plans;
}

/**
 * Plans whose login was cleared only because ANOTHER account this same repair
 * moves still holds the number. Their result would depend on loop order, so
 * the script refuses to apply while any exist.
 */
export function chainedPlans(plans: RepairPlan[]): RepairPlan[] {
  const moving = new Set(plans.map((p) => p.account.id));
  return plans.filter(
    (p) => p.loginHolderId !== null && moving.has(p.loginHolderId),
  );
}

/**
 * Writes one plan, or skips it when the card or the account changed after the
 * plan was made (a staff edit in between is newer truth than this repair).
 * The card's history gets the login move with no `changedById` — the history
 * tab shows such a row as "Tizim".
 */
export async function applyRepair(
  prisma: PrismaService,
  history: EntityHistoryService,
  plan: RepairPlan,
): Promise<'applied' | 'skipped'> {
  // Generous limits: the script runs from a laptop against a far-away
  // database, and a timeout halfway through the loop leaves the rest undone.
  const limits = { maxWait: 10_000, timeout: 20_000 };
  return prisma.$transaction(async (tx) => {
    const card = await tx.student.findFirst({
      where: { id: plan.studentId, deletedAt: null },
      select: { phone: true },
    });
    const account = await tx.user.findFirst({
      where: { id: plan.account.id, deletedAt: null },
      select: { phone: true, login: true },
    });
    if (
      card?.phone !== plan.card ||
      account?.phone !== plan.account.phone ||
      account?.login !== plan.account.login
    ) {
      return 'skipped';
    }

    await tx.user.update({
      where: { id: plan.account.id },
      data: plan.write,
    });
    await history.recordUpdate({
      entityType: 'Student',
      entityId: plan.studentId,
      oldValues: { login: plan.account.login },
      newValues: {
        login: 'login' in plan.write ? plan.write.login : plan.account.login,
      },
      companyId: plan.companyId ?? undefined,
      tx,
    });
    return 'applied';
  }, limits);
}
