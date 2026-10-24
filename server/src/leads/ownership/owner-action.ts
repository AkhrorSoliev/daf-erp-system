import { LeadStatus, Prisma, PrismaClient } from '@prisma/client';

type LeadDb = Pick<PrismaClient, 'lead'> | Prisma.TransactionClient;

/**
 * Stamps the owner's action on a lead (ADR-0093): a call mark, a comment, a
 * task on the lead. Only the OWNER's write counts, so the where-clause carries
 * `ownerId` and anyone else's changes nothing. A converted or archived lead's
 * clock is stopped, so it is not touched either.
 */
export async function touchLeadOwnerAction(
  db: LeadDb,
  leadId: string,
  userId: number,
  at: Date = new Date(),
): Promise<boolean> {
  const { count } = await db.lead.updateMany({
    where: {
      id: leadId,
      ownerId: userId,
      deletedAt: null,
      statusEnum: { not: LeadStatus.CONVERTED },
    },
    data: { ownerActedAt: at },
  });
  return count > 0;
}
