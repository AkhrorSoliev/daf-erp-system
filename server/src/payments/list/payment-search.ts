import type { Prisma } from '@prisma/client';

/**
 * The page's search (spec B4 §4.6): every word in the student's first or last
 * name, a receipt number (system or paper), or — digits only — the student id
 * (at most 9 digits) or a part of the phone (at least 4 digits, `998` dropped).
 */
export function paymentSearchWhere(
  raw?: string,
): Prisma.PaymentWhereInput | undefined {
  const q = (raw ?? '').trim().slice(0, 100);
  if (!q) return undefined;
  const tokens = q.split(/\s+/);
  const or: Prisma.PaymentWhereInput[] = [
    {
      AND: tokens.map((t) => ({
        OR: [
          { student: { firstName: { contains: t, mode: 'insensitive' } } },
          { student: { lastName: { contains: t, mode: 'insensitive' } } },
        ],
      })),
    },
    { receiptCode: { contains: q, mode: 'insensitive' } },
    { receiptNumber: { contains: q, mode: 'insensitive' } },
  ];
  if (/^\d+$/.test(q)) {
    if (q.length <= 9) or.push({ studentId: Number(q) });
    const phone = q.startsWith('998') && q.length > 9 ? q.slice(3) : q;
    if (phone.length >= 4) or.push({ student: { phone: { contains: phone } } });
  }
  return { OR: or };
}
