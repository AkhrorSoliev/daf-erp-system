import type { Prisma } from '@prisma/client';

export function contractNumberPrefix(year: string): string {
  return `DAF-${year}-`;
}

/** Five digits keep the text order equal to the number order. */
export function nextContractSequence(
  last: string | null,
  prefix: string,
): string {
  const n =
    last && last.startsWith(prefix)
      ? Number.parseInt(last.slice(prefix.length), 10)
      : 0;
  const next = Number.isFinite(n) ? n + 1 : 1;
  return `${prefix}${String(next).padStart(5, '0')}`;
}

/**
 * Called inside the Serializable create transaction: two concurrent creates
 * conflict there, or hit `@@unique([companyId, number])` — both become 409.
 */
export async function nextContractNumber(
  tx: Prisma.TransactionClient,
  companyId: number,
  year: string,
): Promise<string> {
  const prefix = contractNumberPrefix(year);
  const last = await tx.contractDocument.findFirst({
    where: { companyId, number: { startsWith: prefix } },
    orderBy: { number: 'desc' },
    select: { number: true },
  });
  return nextContractSequence(last?.number ?? null, prefix);
}
