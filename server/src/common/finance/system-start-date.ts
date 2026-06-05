import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type PrismaLike = PrismaService | Prisma.TransactionClient;

/**
 * Global reporting floor for a company. When `Company.systemStartDate` is set,
 * attendance stats / analytics reports must not count or display data before
 * that date (the May-1 2026 cutover hides mid-April go-live noise). Returns
 * null when no floor is configured.
 */
export async function getSystemStartDate(
  prisma: PrismaLike,
  companyId: number,
): Promise<Date | null> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { systemStartDate: true },
  });
  return company?.systemStartDate ?? null;
}

/**
 * Clamp a requested range-start up to the floor. Returns whichever is later.
 * - no floor        -> the requested date (unchanged), or undefined
 * - no requested    -> the floor (so an unbounded query starts at the floor)
 * - requested < floor -> the floor
 * - requested >= floor -> the requested date
 */
export function floorStart(
  requested: Date | null | undefined,
  floor: Date | null,
): Date | undefined {
  if (!floor) return requested ?? undefined;
  if (!requested) return floor;
  return requested.getTime() < floor.getTime() ? floor : requested;
}
