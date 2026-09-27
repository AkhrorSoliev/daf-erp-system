import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  DEFAULT_DEPARTURE_POLICY,
  DeparturePolicy,
} from '../../billing/departure-policy';
import { whereUserMayAct } from '../../common/auth/blocked-user';
import { PrismaService } from '../../prisma/prisma.service';

type PrismaLike = PrismaService | Prisma.TransactionClient;

/** Roles that may return money beyond contract 6.2 (ADR-0043). */
export const DEPARTURE_POLICY_ROLES = ['CEO', 'Branch Director'] as const;

export const DEPARTURE_POLICY_FORBIDDEN =
  'Pulni boshqa tartibda qaytarishni faqat CEO yoki filial direktori tanlay oladi';

/**
 * Whether the caller may choose a policy other than the student's own
 * decision, read from the database rather than the token (ADR-0028): an
 * archived, blocked or demoted account may not. The dialog shows the choice
 * only when this says so; the write asks again.
 */
export async function mayChooseDeparturePolicy(
  prisma: PrismaLike,
  userId: number | undefined,
): Promise<boolean> {
  if (userId === undefined) return false;
  const caller = await prisma.user.findFirst({
    where: {
      id: userId,
      ...whereUserMayAct(),
      roles: {
        some: { role: { name: { in: [...DEPARTURE_POLICY_ROLES] } } },
      },
    },
    select: { id: true },
  });
  return caller !== null;
}

/**
 * The default — the student's own decision — is open to everyone who may
 * remove or expel a student. Any other policy gives back money the contract
 * would keep, so it is a CEO's or a branch director's call.
 */
export async function assertMayChooseDeparturePolicy(
  prisma: PrismaLike,
  userId: number | undefined,
  policy: DeparturePolicy | undefined,
): Promise<void> {
  if (!policy || policy === DEFAULT_DEPARTURE_POLICY) return;
  if (!(await mayChooseDeparturePolicy(prisma, userId))) {
    throw new ForbiddenException(DEPARTURE_POLICY_FORBIDDEN);
  }
}
