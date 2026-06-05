import { PrismaService } from '../../prisma/prisma.service';

/**
 * Computes the next auto-name number (`#NNN`) for a branch.
 *
 * Group auto-names are `#NNN` and backed by `@@unique([name, branchId])`, a
 * full unique index that also counts soft-deleted rows. The old logic derived
 * the next number from `MAX(groupNumber) WHERE deletedAt IS NULL`, but
 * `groupNumber` is nullable and was never backfilled for groups created before
 * the column existed — so legacy `#NNN` groups carry `groupNumber = NULL` and
 * were skipped. The counter then reset to a low number whose `#NNN` name still
 * existed, colliding on every retry (P2002) and surfacing as
 * "Guruh nomini generatsiya qilib bo'lmadi, qayta urinib ko'ring".
 *
 * To be collision-proof against the unique index, derive the number from the
 * highest numeric suffix of every existing `#NNN` name in the branch —
 * including archived ones — and ignore the unreliable `groupNumber` column.
 * Numbers are therefore monotonic per branch (an archived `#006` is never
 * reused), which also keeps history/audit unambiguous.
 *
 * Scoped by `branchId` only, exactly matching `@@unique([name, branchId])`
 * (a branch belongs to a single company, so companyId would be redundant).
 */
export async function computeNextGroupNumber(
  prisma: PrismaService,
  branchId: number,
): Promise<number> {
  const groups = await prisma.group.findMany({
    where: { branchId, name: { startsWith: '#' } },
    select: { name: true, groupNumber: true },
  });

  let max = 0;
  for (const g of groups) {
    const match = /^#(\d+)$/.exec(g.name);
    const n = match ? parseInt(match[1], 10) : (g.groupNumber ?? 0);
    if (n > max) max = n;
  }
  return max + 1;
}
